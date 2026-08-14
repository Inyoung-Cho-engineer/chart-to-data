'use client';

// DESIGN.md §3.2 ②·§9 — 드래그로 지정한 영역을 잘라낸 미리보기 + 서버로 분석 요청.
// 판독에 성공하면 plotBox·축·계열·교차 정보를 세션 저장소에 담아 AxisPanel이 이어받는다.

import { useEffect, useState } from 'react';
import { useSessionStore } from '@/store/session';
import { makeAppError } from '@/lib/errors';
import { detectPlotBox } from '@/lib/plotBox';
import { IDENTITY_CALIBRATION } from '@/lib/types';
import { cardClass, mutedTextClass, primaryButtonClass } from '@/lib/ui';

// 이 단계는 앱에서 가장 오래(최대 55초, MODEL_TIMEOUT_MS) 걸리는 유일한 대기 구간이다.
// 버튼 글자만 바뀌는 것으로는 "멈췄다"는 인상을 주기 쉬워, 스피너와 경과 시간을 함께 보여준다.
export function RegionPanel() {
  const [analyzing, setAnalyzing] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (!analyzing) return;
    const timer = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [analyzing]);
  const cropRect = useSessionStore((s) => s.cropRect);
  const cropImage = useSessionStore((s) => s.cropImage);
  const traceImage = useSessionStore((s) => s.traceImage);
  const setPlotBox = useSessionStore((s) => s.setPlotBox);
  const setCalibration = useSessionStore((s) => s.setCalibration);
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
    setElapsedSec(0);
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
      // 함께 **눈금 위치**도 찾는다 — 논문 그래프는 테두리와 눈금 범위가 달라서, 이걸 안 재면
      // 아래쪽 값이 크게 틀어진다.
      // 압축·축소된 조각 대신 원본 해상도 조각(traceImage)에서 재야 얇은 축 선과 눈금이 살아 있다.
      let plotBox = data.plotBox;
      let calibration = IDENTITY_CALIBRATION;
      try {
        const detection = await detectPlotBox(traceImage ?? cropImage, data.plotBox);
        plotBox = detection.rect;
        calibration = detection.calibration;
      } catch {
        // 보정에 실패해도 AI 값으로 계속 진행한다 — 사용자가 축 확인 단계에서 결과를 볼 수 있다.
      }

      // 축은 아직 사용자가 확인하지 않은 상태로 채워둔다 — AxisPanel에서 확인 버튼을 눌러야 확정된다.
      setPlotBox(plotBox);
      setCalibration(calibration);
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
    <section className={`${cardClass} flex flex-col items-center gap-2 text-center text-sm`}>
      <p className={mutedTextClass}>잘라낸 영역 미리보기</p>
      {cropImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cropImage}
          alt="잘라낸 영역 미리보기"
          className="max-h-60 w-auto rounded-lg border border-slate-200"
        />
      ) : (
        <p className="text-slate-400">만드는 중...</p>
      )}

      <button
        type="button"
        className={primaryButtonClass}
        onClick={handleAnalyze}
        disabled={!cropImage || analyzing}
      >
        {analyzing ? '판독 중...' : '이 영역으로 분석'}
      </button>

      {analyzing && (
        <div className={`flex items-center gap-2 ${mutedTextClass}`} role="status">
          <span
            aria-hidden
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-steel/30 border-t-steel"
          />
          <span>
            {elapsedSec}초 경과 — 보통 5~30초 걸립니다{elapsedSec >= 30 ? ', 조금만 더 기다려주세요' : ''}
          </span>
        </div>
      )}
    </section>
  );
}
