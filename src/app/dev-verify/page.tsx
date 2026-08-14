'use client';

// 개발 전용 검증 화면 — 정답을 아는 그래프 8개(public/test-charts)를 자동으로 측정한다.
//
// 왜 만들었나: trace.ts·plotBox.ts의 임계값은 서로 얽혀 있어서 하나를 고치면 다른 그래프가 깨진다
// (HANDOVER.md 6장). 그동안은 측정할 때마다 스크립트를 새로 짰는데, 그러면 매번 조건이 달라져
// 비교가 어렵다. 이 화면은 같은 조건으로 언제든 다시 잴 수 있게 고정해 둔 것이다.
//
// 외부 모델을 부르지 않는다 — AI가 주는 값(축 범위·계열 색)은 정답으로 대신 넣고,
// **앱이 담당하는 부분(plotBox 찾기·눈금 보정·픽셀 추적·값 환산)만** 잰다.
// 배포 빌드에서는 아무것도 그리지 않는다.

import { useEffect, useState } from 'react';
import { cropImageForTrace, cropImageToDataUrl } from '@/lib/crop';
import { detectPlotBox } from '@/lib/plotBox';
import {
  buildPalette,
  buildRivalColors,
  loadPlotPixels,
  parseHexColor,
  pickNearestColor,
  traceSeries,
} from '@/lib/trace';
import { frameTxFromAxisTx, generateTxList, toDataPoint } from '@/lib/axis';
import { IDENTITY_CALIBRATION, type AxisInfo } from '@/lib/types';

// 잘라낼 영역 — 눈금 라벨까지 넉넉히 포함한다 (사용자가 드래그하는 것과 같은 범위)
const CROP_RECT = { x0: 0.024, y0: 0.089, x1: 0.964, y1: 0.92 };
const SAMPLE_COUNT = 50;

interface Row {
  chart: string;
  series: string;
  found: number;
  meanError: number;
  maxError: number;
  ticksX: boolean;
  ticksY: boolean;
}

interface ChartSpec {
  id: string;
  title: string;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  yLog?: boolean;
  xUnit: string;
  yUnit: string;
  series: Array<{ id: string; label: string; color: string; f: (x: number) => number }>;
}

declare global {
  interface Window {
    CHART_SPECS?: ChartSpec[];
    renderChart?: (spec: ChartSpec, canvas: HTMLCanvasElement) => HTMLCanvasElement;
    __verifyRows?: Row[];
  }
}

function loadChartScript(): Promise<void> {
  if (window.CHART_SPECS) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = '/test-charts/charts.js';
    el.onload = () => resolve();
    el.onerror = () => reject(new Error('charts.js를 불러오지 못했습니다.'));
    document.head.appendChild(el);
  });
}

export default function DevVerifyPage() {
  const isDev = process.env.NODE_ENV === 'development';
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState(isDev ? '준비 중...' : '개발 모드에서만 동작합니다.');

  useEffect(() => {
    if (!isDev) return;

    let cancelled = false;
    const noTicks = new URLSearchParams(window.location.search).get('noticks') === '1';

    (async () => {
      await loadChartScript();
      const specs = window.CHART_SPECS ?? [];
      const render = window.renderChart;
      if (!render) {
        setStatus('charts.js에서 renderChart를 찾지 못했습니다.');
        return;
      }

      const collected: Row[] = [];
      for (const spec of specs) {
        if (cancelled) return;
        setStatus(`측정 중: ${spec.id}`);

        const canvas = render(spec, document.createElement('canvas'));
        const pageImage = canvas.toDataURL('image/jpeg', 0.92);
        const [, traceImage] = await Promise.all([
          cropImageToDataUrl(pageImage, CROP_RECT),
          cropImageForTrace(pageImage, CROP_RECT),
        ]);

        // AI가 대충 답하는 값을 흉내 낸 출발점 — 실제 경계는 픽셀에서 찾아 덮어쓴다
        const detection = await detectPlotBox(traceImage, {
          x0: 0.1,
          y0: 0.1,
          x1: 0.9,
          y1: 0.9,
        });
        // ?noticks=1 을 붙이면 눈금 보정을 끄고 예전 방식(테두리=축 범위)으로 잰다 — 개선 전후 비교용
        const cal = noTicks ? IDENTITY_CALIBRATION : (detection.calibration ?? IDENTITY_CALIBRATION);
        const plot = await loadPlotPixels(traceImage, detection.rect);
        const palette = buildPalette(plot);

        const xAxis: AxisInfo = {
          type: 'linear',
          min: spec.xMin,
          max: spec.xMax,
          unit: spec.xUnit,
          confirmedByUser: true,
        };
        const yAxis: AxisInfo = {
          type: spec.yLog ? 'log' : 'linear',
          min: spec.yMin,
          max: spec.yMax,
          unit: spec.yUnit,
          confirmedByUser: true,
        };

        for (const series of spec.series) {
          const hint = parseHexColor(series.color);
          if (!hint) continue;
          const target = pickNearestColor(palette, hint);
          const rivals = buildRivalColors(palette, target);

          const txList = generateTxList(SAMPLE_COUNT);
          const traced = traceSeries(
            plot,
            target,
            rivals,
            txList.map((tx) => frameTxFromAxisTx(cal, tx))
          );
          const points = txList.map((tx, i) =>
            toDataPoint(
              tx,
              traced[i].ty,
              traced[i].confidence,
              xAxis,
              yAxis,
              [],
              series.id,
              'grid',
              cal
            )
          );

          // 오차는 Y축 전체 범위 대비 백분율 (public/test-charts/README.md의 정의)
          const range = spec.yMax - spec.yMin;
          const errors: number[] = [];
          for (const p of points) {
            if (p.x === null || p.y === null) continue;
            errors.push((Math.abs(p.y - series.f(p.x)) / range) * 100);
          }

          collected.push({
            chart: spec.id,
            series: series.label,
            found: errors.length,
            meanError: errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : NaN,
            maxError: errors.length ? Math.max(...errors) : NaN,
            ticksX: detection.calibratedByTicks?.x ?? false,
            ticksY: detection.calibratedByTicks?.y ?? false,
          });
          setRows([...collected]);
        }
      }

      window.__verifyRows = collected;
      setStatus('측정 완료');
    })().catch((e) => setStatus(`실패: ${String(e)}`));

    return () => {
      cancelled = true;
    };
  }, [isDev]);

  return (
    <main className="p-6 font-mono text-sm">
      <h1 className="mb-3 text-base font-bold">검증용 그래프 자동 측정 (개발 전용)</h1>
      <p className="mb-1 text-zinc-600">{status}</p>
      <p className="mb-4 text-zinc-500">
        ?noticks=1 을 붙이면 눈금 보정을 끄고(예전 방식) 측정합니다 — 개선 전후 비교용
      </p>
      <table className="border-collapse">
        <thead>
          <tr className="border-b text-left">
            <th className="px-3 py-1">그래프</th>
            <th className="px-3 py-1">계열</th>
            <th className="px-3 py-1">찾은 점</th>
            <th className="px-3 py-1">평균 오차%</th>
            <th className="px-3 py-1">최대 오차%</th>
            <th className="px-3 py-1">눈금보정 X/Y</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b">
              <td className="px-3 py-1">{r.chart}</td>
              <td className="px-3 py-1">{r.series}</td>
              <td className="px-3 py-1">{r.found}/50</td>
              <td className="px-3 py-1">{r.meanError.toFixed(2)}</td>
              <td className="px-3 py-1">{r.maxError.toFixed(2)}</td>
              <td className="px-3 py-1">
                {r.ticksX ? 'O' : 'X'}/{r.ticksY ? 'O' : 'X'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
