'use client';

// DESIGN.md §3.2 ⑤·§3.4 ⑤ — 좌표 50개 추출 + 특정 X값 추가 질의 + CSV 내려받기.
// 좌표는 AI가 아니라 앱이 계열 색상으로 픽셀을 추적해 찾고(§5.5), 실제 값은 변환식으로 계산한다(§5.3).
// 이 단계에서는 서버·외부 모델을 전혀 부르지 않는다.

import { useState } from 'react';
import { useSessionStore } from '@/store/session';
import { frameTxFromAxisTx, generateTxList, tFromValue, toDataPoint } from '@/lib/axis';
import {
  buildPalette,
  buildRivalColors,
  loadPlotPixels,
  parseHexColor,
  pickNearestColor,
  traceAt,
  traceSeries,
  type PlotPixels,
  type Rgb,
} from '@/lib/trace';
import { makeAppError } from '@/lib/errors';
import { buildCsv, downloadCsv } from '@/lib/csv';

const SAMPLE_COUNT = 50;

export function ExtractPanel() {
  const [extracting, setExtracting] = useState(false);
  const [queryX, setQueryX] = useState('');
  const [queryLoading, setQueryLoading] = useState(false);
  const [rangeWarning, setRangeWarning] = useState<string | null>(null);

  const file = useSessionStore((s) => s.file);
  const cropImage = useSessionStore((s) => s.cropImage);
  const traceImage = useSessionStore((s) => s.traceImage);
  const plotBox = useSessionStore((s) => s.plotBox);
  const calibration = useSessionStore((s) => s.calibration);
  const xAxis = useSessionStore((s) => s.xAxis);
  const yAxis = useSessionStore((s) => s.yAxis);
  const seriesList = useSessionStore((s) => s.seriesList);
  const selectedSeriesId = useSessionStore((s) => s.selectedSeriesId);
  const crossings = useSessionStore((s) => s.crossings);
  const points = useSessionStore((s) => s.points);
  const setPoints = useSessionStore((s) => s.setPoints);
  const setError = useSessionStore((s) => s.setError);

  const axesConfirmed = Boolean(xAxis?.confirmedByUser && yAxis?.confirmedByUser);

  if (!axesConfirmed || !selectedSeriesId) {
    return null; // 축 확인 + 계열 선택이 끝나기 전에는 아무것도 보여주지 않는다
  }

  const series = seriesList.find((s) => s.id === selectedSeriesId);

  // AI가 알려준 색은 눈대중이라 실제와 다를 수 있으므로(실측: #1f77b4 선을 #00aaff로 답함),
  // 이미지에 실제로 쓰인 색 팔레트를 만들고 그중 힌트에 가장 가까운 것을 쓴다 (DESIGN.md §5.5 A).
  function resolveColors(plot: PlotPixels): { target: Rgb; rivals: Rgb[] } | null {
    if (!series) return null;
    const hint = parseHexColor(series.colorHex);
    if (!hint) return null;

    const palette = buildPalette(plot);
    const target = pickNearestColor(palette, hint);
    return { target, rivals: buildRivalColors(palette, target) };
  }

  async function handleExtract() {
    const source = traceImage ?? cropImage;
    if (!source || !plotBox || !series || !xAxis || !yAxis) return;
    setExtracting(true);
    setError(null);
    try {
      const plot = await loadPlotPixels(source, plotBox);
      const colors = resolveColors(plot);
      if (!colors) {
        // 색상 형식이 이상하면 추적할 기준이 없다 — 영역 단계 문제로 안내한다.
        setError(makeAppError('REGION_NO_CHART'));
        return;
      }
      const { target, rivals: rivalColors } = colors;
      const txList = generateTxList(SAMPLE_COUNT);
      // 축 위치(0~1)를 plotBox 안의 실제 가로 위치로 옮긴다 — 눈금이 테두리보다 안쪽에 있기 때문이다.
      const frameTxList = txList.map((tx) => frameTxFromAxisTx(calibration, tx));

      // 지점을 하나씩 따로 보지 않고 한 번에 추적한다 — 앞뒤 지점과 이어지는지를 보고
      // 범례 선·다른 계열로 튀는 것을 막고, 점선의 빈 칸도 좌우로 넓혀 찾는다 (DESIGN.md §5.5).
      const traced = traceSeries(plot, target, rivalColors, frameTxList);
      const newPoints = txList.map((tx, i) =>
        toDataPoint(
          tx,
          traced[i].ty,
          traced[i].confidence,
          xAxis,
          yAxis,
          crossings,
          series.id,
          'grid',
          calibration
        )
      );
      setPoints(newPoints);
    } catch {
      setError(makeAppError('REGION_NO_CHART'));
    } finally {
      setExtracting(false);
    }
  }

  async function handleQueryPoint() {
    const source = traceImage ?? cropImage;
    if (!source || !plotBox || !series || !xAxis || !yAxis) return;
    const value = Number(queryX);
    if (!Number.isFinite(value)) return;

    setRangeWarning(null);

    // DESIGN.md §5.3 — 축 범위 밖 값은 추적하지 않는다.
    if (value < xAxis.min || value > xAxis.max) {
      setRangeWarning('축 범위 안의 값을 입력해주세요.');
      return;
    }

    const tx = tFromValue(xAxis, value);

    setQueryLoading(true);
    setError(null);
    try {
      const plot = await loadPlotPixels(source, plotBox);
      const colors = resolveColors(plot);
      if (!colors) {
        setError(makeAppError('REGION_NO_CHART'));
        return;
      }

      const traced = traceAt(plot, colors.target, colors.rivals, frameTxFromAxisTx(calibration, tx));
      const newPoint = toDataPoint(
        tx,
        traced.ty,
        traced.confidence,
        xAxis,
        yAxis,
        crossings,
        series.id,
        'user_query',
        calibration
      );
      setPoints([...points, newPoint]);
      setQueryX('');
    } catch {
      setError(makeAppError('REGION_NO_CHART'));
    } finally {
      setQueryLoading(false);
    }
  }

  function handleDownloadCsv() {
    if (!file || !series || !xAxis || !yAxis || points.length === 0) return;
    const csv = buildCsv(points, {
      fileName: file.name,
      seriesLabel: series.label,
      xAxis,
      yAxis,
    });
    downloadCsv(csv, `${file.name}-${series.label}.csv`);
  }

  const needsCheckCount = points.filter((p) => p.needsCheck).length;

  return (
    <section className="flex w-full max-w-md flex-col items-center gap-3 rounded border p-4 text-sm">
      <button
        type="button"
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-40"
        onClick={handleExtract}
        disabled={!cropImage || extracting}
      >
        {extracting ? '추출 중...' : '좌표 50개 추출'}
      </button>

      {points.length > 0 && !extracting && (
        <p className="text-zinc-600">
          추출 완료 {points.length}개 — 확인 필요 {needsCheckCount}개
        </p>
      )}

      <div className="flex w-full flex-col gap-1 border-t pt-3">
        <p className="text-zinc-500">특정 X값 추가로 확인하기</p>
        <div className="flex gap-2">
          <input
            type="number"
            className="w-full rounded border px-2 py-1"
            placeholder={xAxis ? `${xAxis.min}~${xAxis.max}` : ''}
            value={queryX}
            onChange={(e) => setQueryX(e.target.value)}
          />
          <button
            type="button"
            className="shrink-0 rounded border px-3 py-1 disabled:opacity-40"
            onClick={handleQueryPoint}
            disabled={!queryX || queryLoading}
          >
            {queryLoading ? '조회 중...' : '추가'}
          </button>
        </div>
        {rangeWarning && <p className="text-xs text-red-600">{rangeWarning}</p>}
      </div>

      <button
        type="button"
        className="w-full rounded border px-4 py-2 disabled:opacity-40"
        onClick={handleDownloadCsv}
        disabled={points.length === 0}
      >
        CSV 내려받기
      </button>
    </section>
  );
}
