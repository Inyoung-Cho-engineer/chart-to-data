// DESIGN.md §5.3 위치 ↔ 실제 값 변환식. 서버는 값을 계산하지 않는다 — 전부 여기(브라우저)에서 한다.

import type { AxisInfo, DataPoint } from './types';

// 위치(t, 0~1) → 실제 값
export function valueFromT(axis: AxisInfo, t: number): number {
  if (axis.type === 'log') {
    const logMin = Math.log10(axis.min);
    const logMax = Math.log10(axis.max);
    return 10 ** (logMin + (logMax - logMin) * t);
  }
  return axis.min + (axis.max - axis.min) * t;
}

// 실제 값 → 위치(t, 0~1) — 사용자가 입력한 X값을 질의할 때 쓴다
export function tFromValue(axis: AxisInfo, value: number): number {
  if (axis.type === 'log') {
    const logMin = Math.log10(axis.min);
    const logMax = Math.log10(axis.max);
    return (Math.log10(value) - logMin) / (logMax - logMin);
  }
  return (value - axis.min) / (axis.max - axis.min);
}

// X축을 49등분한 50개 지점 (tx = 0, 1/49, ..., 1) — 모델이 아니라 앱이 정한다.
export function generateTxList(count = 50): number[] {
  return Array.from({ length: count }, (_, i) => i / (count - 1));
}

const OUT_OF_RANGE_MARGIN = 0.02;
const CROSSING_MARGIN = 0.02;

// 픽셀 추적으로 찾은 위치(tx, ty, 신뢰도)를 최종 DataPoint로 바꾼다 — 범위 밖·교차 판정도 여기서 한다.
// ty가 null이면 그 세로줄에서 계열 색 선을 찾지 못한 경우다 (DESIGN.md §5.5).
export function toDataPoint(
  tx: number,
  ty: number | null,
  confidence: 'high' | 'medium' | 'low',
  xAxis: AxisInfo,
  yAxis: AxisInfo,
  crossings: Array<{ tx: number; seriesIds: string[] }>,
  selectedSeriesId: string,
  source: 'grid' | 'user_query'
): DataPoint {
  const isCrossingPoint = crossings.some(
    (c) => c.seriesIds.includes(selectedSeriesId) && Math.abs(c.tx - tx) <= CROSSING_MARGIN
  );

  if (ty === null) {
    // 선을 못 찾았어도 행은 남긴다 — X값은 알고 있으므로 어디를 확인해야 하는지 보여줄 수 있다.
    return {
      tx,
      x: valueFromT(xAxis, tx),
      y: null,
      confidence: 'low',
      needsCheck: true,
      checkReason: 'low_confidence',
      source,
    };
  }

  const severelyOut = ty < -OUT_OF_RANGE_MARGIN || ty > 1 + OUT_OF_RANGE_MARGIN;
  const boundaryOut = !severelyOut && (ty < 0 || ty > 1);
  const clampedTy = Math.min(Math.max(ty, 0), 1);

  const x = severelyOut ? null : valueFromT(xAxis, tx);
  const y = severelyOut ? null : valueFromT(yAxis, clampedTy);

  let checkReason: DataPoint['checkReason'];
  if (severelyOut || boundaryOut) {
    checkReason = 'out_of_range';
  } else if (confidence === 'low') {
    checkReason = 'low_confidence';
  } else if (isCrossingPoint) {
    checkReason = 'crossing';
  }

  return {
    tx,
    x,
    y,
    confidence,
    needsCheck: Boolean(checkReason),
    checkReason,
    source,
  };
}
