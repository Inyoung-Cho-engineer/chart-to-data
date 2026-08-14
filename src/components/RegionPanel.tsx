'use client';

// DESIGN.md §3.2 ②·§9 — 드래그로 지정한 영역을 잘라낸 미리보기 + 서버로 분석 요청.
// 판독에 성공하면 plotBox·축·계열·교차 정보를 세션 저장소에 담아 AxisPanel이 이어받는다.

import { useState } from 'react';
import { useSessionStore } from '@/store/session';
import { makeAppError } from '@/lib/errors';
import { detectPlotBox } from '@/lib/plotBox';

export function RegionPanel() {
  const [analyzing, setAnalyzing] = useState(false);
  const cropRect = useSessionStore((s) => s.cropRect);
  const cropImage = useSessionStore((s) => s.cropImage);
  const setPlotBox = useSessionStore((s) => s.setPlotBox);
  const setXAxis = useSessionStore((s) => s.setXAxis);
  const setYAxis = useSessionStore((s) => s.setYAxis);
  const setSeriesList = useSessionStore((s) => s.setSeriesList);
  const setCrossings = useSessionStore((s) => s.setCrossings);
  const setError = useSessionStore((s) => s.setError);

  if (!cropRect) {
    return null; // 아직 영역을 지정하지 않았으면 아무것도 보여주지 않는다
  }

  async function handleAnalyze() {
    if (!cropImage) return;
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: cropImage }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? makeAppError('MODEL_CALL_FAILED'));
        return;
      }

      // AI가 준 plotBox는 {0.1, 0.1, 0.9, 0.9}처럼 대충 반올림된 값인 경우가 많아,
      // 축 선을 픽셀에서 직접 찾아 보정한다 (DESIGN.md §5.6). 못 찾은 변은 AI 값을 그대로 쓴다.
      let plotBox = data.plotBox;
      try {
        const detection = await detectPlotBox(cropImage, data.plotBox);
        plotBox = detection.rect;
      } catch {
        // 보정에 실패해도 AI 값으로 계속 진행한다 — 사용자가 축 확인 단계에서 결과를 볼 수 있다.
      }

      // 축은 아직 사용자가 확인하지 않은 상태로 채워둔다 — AxisPanel에서 확인 버튼을 눌러야 확정된다.
      setPlotBox(plotBox);
      setXAxis({ ...data.xAxis, confirmedByUser: false });
      setYAxis({ ...data.yAxis, confirmedByUser: false });
      setSeriesList(data.series);
      setCrossings(data.crossings);
    } catch {
      setError(makeAppError('MODEL_CALL_FAILED'));
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <section className="flex w-full max-w-md flex-col items-center gap-2 rounded border p-4 text-center text-sm">
      <p className="text-zinc-500">잘라낸 영역 미리보기</p>
      {cropImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cropImage}
          alt="잘라낸 영역 미리보기"
          className="max-h-60 w-auto rounded border"
        />
      ) : (
        <p className="text-zinc-400">만드는 중...</p>
      )}

      <button
        type="button"
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-40"
        onClick={handleAnalyze}
        disabled={!cropImage || analyzing}
      >
        {analyzing ? '판독 중...' : '이 영역으로 분석'}
      </button>
    </section>
  );
}
