// DESIGN.md §5.3 위치 ↔ 실제 값 변환식. 서버는 값을 계산하지 않는다 — 전부 여기(브라우저)에서 한다.

import type { AxisCalibration, AxisInfo, DataPoint } from './types';

// 축 위치(0~1) → plotBox 안의 실제 가로 위치(0~1).
// 눈금 보정이 없으면(IDENTITY) 그대로 통과한다.
export function frameTxFromAxisTx(cal: AxisCalibration, tx: number): number {
  return cal.xMinT + tx * (cal.xMaxT - cal.xMinT);
}

// plotBox 안의 세로 위치(0=아래) → 축 위치(0=최솟값 눈금, 1=최댓값 눈금)
function axisTyFromFrameTy(cal: AxisCalibration, ty: number): number {
  const span = cal.yMaxT - cal.yMinT;
  if (span === 0) return ty;
  return (ty - cal.yMinT) / span;
}

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

// 눈금 범위 밖으로 이 비율(축 전체 길이 대비)보다 더 벗어나면 "확인 필요"로 표시한다.
//
// 예전에는 2%만 벗어나도 걸렀는데, 실제 논문 그래프는 테두리가 눈금보다 넓어 곡선이 최댓값 눈금
// 위로 조금 올라가는 일이 흔하다(이번 샘플: 눈금 최댓값 7, 실제 곡선 끝 7.3). 그 값들은 그래프에
// 분명히 그려져 있으므로 버리지 않는다. 다만 20%를 넘어서면 축을 잘못 읽었을 가능성이 커서 표시하고,
// 100%를 넘으면 값 자체를 내놓지 않는다.
const OUT_OF_RANGE_MARGIN = 0.2;
const DISCARD_MARGIN = 1;
const CROSSING_MARGIN = 0.02;

// 픽셀 추적으로 찾은 위치(tx, ty, 신뢰도)를 최종 DataPoint로 바꾼다 — 범위 밖·교차 판정도 여기서 한다.
// ty가 null이면 그 세로줄에서 계열 색 선을 찾지 못한 경우다 (DESIGN.md §5.5).
// frameTy는 plotBox 기준 위치이므로, 눈금 보정(cal)을 거쳐 축 기준 위치로 바꾼 뒤 값으로 환산한다.
export function toDataPoint(
  tx: number,
  frameTy: number | null,
  confidence: 'high' | 'medium' | 'low',
  xAxis: AxisInfo,
  yAxis: AxisInfo,
  crossings: Array<{ tx: number; seriesIds: string[] }>,
  selectedSeriesId: string,
  source: 'grid' | 'user_query',
  cal: AxisCalibration
): DataPoint {
  const ty = frameTy === null ? null : axisTyFromFrameTy(cal, frameTy);
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

  const severelyOut = ty < -DISCARD_MARGIN || ty > 1 + DISCARD_MARGIN;
  const boundaryOut =
    !severelyOut && (ty < -OUT_OF_RANGE_MARGIN || ty > 1 + OUT_OF_RANGE_MARGIN);
  const clampedTy = Math.min(Math.max(ty, -OUT_OF_RANGE_MARGIN), 1 + OUT_OF_RANGE_MARGIN);

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
