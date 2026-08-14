'use client';

// DESIGN.md §3.2 ②·§9 — 드래그로 지정한 영역을 잘라낸 미리보기 + 서버로 분석 요청.
// 판독에 성공하면 plotBox·축·계열·교차 정보를 세션 저장소에 담아 AxisPanel이 이어받는다.
//
// CHECK.md 3번 — AI가 찾은 plotBox(그래프 안쪽 영역)가 어긋나면 그 뒤 계산 전체가 밀리는데도
// 예전엔 사용자가 고칠 방법이 없었다. 분석이 끝나면 plotBox를 네 귀퉁이 손잡이로 표시해
// 직접 드래그로 고칠 수 있게 한다.

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useSessionStore } from '@/store/session';
import { makeAppError } from '@/lib/errors';
import { detectPlotBox } from '@/lib/plotBox';
import { IDENTITY_CALIBRATION, type NormalizedRect } from '@/lib/types';
import { cardClass, mutedTextClass, primaryButtonClass } from '@/lib/ui';

type Corner = 'x0y0' | 'x1y0' | 'x0y1' | 'x1y1';

const CORNERS: Array<{ id: Corner; leftKey: 'x0' | 'x1'; topKey: 'y0' | 'y1' }> = [
  { id: 'x0y0', leftKey: 'x0', topKey: 'y0' },
  { id: 'x1y0', leftKey: 'x1', topKey: 'y0' },
  { id: 'x0y1', leftKey: 'x0', topKey: 'y1' },
  { id: 'x1y1', leftKey: 'x1', topKey: 'y1' },
];

const MIN_GAP = 0.02; // 이보다 좁아지면 뒤집힌 것으로 보고 무시한다

// 이 단계는 앱에서 가장 오래(최대 55초, MODEL_TIMEOUT_MS) 걸리는 유일한 대기 구간이다.
// 버튼 글자만 바뀌는 것으로는 "멈췄다"는 인상을 주기 쉬워, 스피너와 경과 시간을 함께 보여준다.
export function RegionPanel() {
  const [analyzing, setAnalyzing] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [draggingCorner, setDraggingCorner] = useState<Corner | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!analyzing) return;
    const timer = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [analyzing]);

  const cropRect = useSessionStore((s) => s.cropRect);
  const cropImage = useSessionStore((s) => s.cropImage);
  const traceImage = useSessionStore((s) => s.traceImage);
  const plotBox = useSessionStore((s) => s.plotBox);
  const setPlotBox = useSessionStore((s) => s.setPlotBox);
  const setCalibration = useSessionStore((s) => s.setCalibration);
  const setXAxis = useSessionStore((s) => s.setXAxis);
  const setYAxis = useSessionStore((s) => s.setYAxis);
  const setSeriesList = useSessionStore((s) => s.setSeriesList);
  const setCrossings = useSessionStore((s) => s.setCrossings);
  const setError = useSessionStore((s) => s.setError);

  // 드래그 중 plotBox를 사각형 밖으로 못 나가게, 그리고 이미지 픽셀 좌표로 변환하는 헬퍼.
  function pointFromClient(clientX: number, clientY: number) {
    const img = imgRef.current;
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return {
      x: Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1),
      y: Math.min(Math.max((clientY - rect.top) / rect.height, 0), 1),
    };
  }

  // 귀퉁이를 드래그하는 동안 plotBox를 실시간으로 갱신하고, 손을 떼면
  // 눈금 보정값을 초기화하고 축을 다시 확인하게 한다 — 사람이 고친 사각형에는
  // AI가 찾은 눈금 위치가 더는 맞다는 보장이 없기 때문이다.
  useEffect(() => {
    if (!draggingCorner) return;

    function handleMove(e: globalThis.MouseEvent) {
      const point = pointFromClient(e.clientX, e.clientY);
      const current = useSessionStore.getState().plotBox;
      if (!point || !current) return;

      const next: NormalizedRect = { ...current };
      const corner = CORNERS.find((c) => c.id === draggingCorner)!;
      next[corner.leftKey] = point.x;
      next[corner.topKey] = point.y;

      if (next.x1 - next.x0 < MIN_GAP || next.y1 - next.y0 < MIN_GAP) return;
      setPlotBox(next);
    }

    function handleUp() {
      setDraggingCorner(null);
      setCalibration(IDENTITY_CALIBRATION);
      const { xAxis, yAxis } = useSessionStore.getState();
      if (xAxis?.confirmedByUser) setXAxis({ ...xAxis, confirmedByUser: false });
      if (yAxis?.confirmedByUser) setYAxis({ ...yAxis, confirmedByUser: false });
    }

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingCorner]);

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
      let box = data.plotBox;
      let calibration = IDENTITY_CALIBRATION;
      try {
        const detection = await detectPlotBox(traceImage ?? cropImage, data.plotBox);
        box = detection.rect;
        calibration = detection.calibration;
      } catch {
        // 보정에 실패해도 AI 값으로 계속 진행한다 — 사용자가 축 확인 단계에서 결과를 볼 수 있다.
      }

      // 축은 아직 사용자가 확인하지 않은 상태로 채워둔다 — AxisPanel에서 확인 버튼을 눌러야 확정된다.
      setPlotBox(box);
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
      <p className={mutedTextClass}>
        {plotBox ? '그래프 안쪽 영역 — 잘못됐으면 모서리를 드래그해 고쳐주세요' : '잘라낸 영역 미리보기'}
      </p>
      {cropImage ? (
        <div className="relative inline-block select-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={cropImage}
            alt="잘라낸 영역 미리보기"
            draggable={false}
            className="max-h-60 w-auto rounded-lg border border-slate-200"
          />
          {plotBox && (
            <>
              <div
                className="pointer-events-none absolute border-2 border-amber bg-amber/10"
                style={{
                  left: `${plotBox.x0 * 100}%`,
                  top: `${plotBox.y0 * 100}%`,
                  width: `${(plotBox.x1 - plotBox.x0) * 100}%`,
                  height: `${(plotBox.y1 - plotBox.y0) * 100}%`,
                }}
              />
              {CORNERS.map((c) => (
                <div
                  key={c.id}
                  onMouseDown={(e: ReactMouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDraggingCorner(c.id);
                  }}
                  className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border-2 border-white bg-amber shadow"
                  style={{
                    left: `${plotBox[c.leftKey] * 100}%`,
                    top: `${plotBox[c.topKey] * 100}%`,
                  }}
                />
              ))}
            </>
          )}
        </div>
      ) : (
        <p className="text-slate-400">만드는 중...</p>
      )}

      <button
        type="button"
        className={primaryButtonClass}
        onClick={handleAnalyze}
        disabled={!cropImage || analyzing}
      >
        {analyzing ? '판독 중...' : plotBox ? '다시 분석' : '이 영역으로 분석'}
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
