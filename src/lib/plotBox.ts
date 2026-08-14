// 그래프 안쪽 영역(plotBox)과 **눈금 위치**를 픽셀에서 직접 찾는다.
//
// 두 가지를 한다.
//
// 1) plotBox 보정 — AI는 plotBox를 {0.1, 0.1, 0.9, 0.9} 같은 반올림 값으로 대충 답하는 일이 잦다.
//    실측에서 아래쪽 경계가 정답보다 7.9% 어긋났고, 그 오차가 추출값 오차(최대 8.09%)로 그대로 옮겨졌다.
//    축 선은 "길고 진한 직선"이라 픽셀에서 찾기 쉬우므로, 찾은 것만 AI 값을 대체한다.
//
// 2) 눈금 위치 보정(AxisCalibration) — 테두리와 눈금 범위는 **같지 않다.**
//    matplotlib 기본값은 데이터 양옆에 5% 여백을 두므로, 눈금이 1~7인 그래프의 테두리 위쪽은
//    실제로 7.73, 아래쪽은 0.27에 해당한다. 테두리를 1~7로 놓고 계산하면 아래쪽에서 최대 57%까지
//    값이 틀어진다(2026-08-14 실측). 그래서 축 선 바깥의 눈금 표시(tick)를 찾아
//    "최솟값 눈금과 최댓값 눈금이 어디인지"를 따로 잰다. 못 찾으면 테두리를 그대로 쓴다.

import { IDENTITY_CALIBRATION, type AxisCalibration, type NormalizedRect } from './types';

// 선·눈금으로 인정할 밝기 한계.
// 128로 잡으면 논문에서 흔한 연회색 축 선(밝기 약 176)을 통째로 놓친다 — 실측에서 왼쪽·오른쪽
// 축 선을 못 찾아 AI의 반올림 값(0.1/0.9)이 그대로 쓰였다. 격자선(밝기 약 221)은 여전히 걸러진다.
const INK_THRESHOLD = 190;
const MIN_LINE_RATIO = 0.5; // 그 줄의 절반 이상이 진해야 축 선으로 인정
const SEARCH_BAND = 0.4; // 각 가장자리에서 이 비율만큼 안쪽까지만 축 선을 찾는다

export interface PlotBoxDetection {
  rect: NormalizedRect;
  detected: { x0: boolean; y0: boolean; x1: boolean; y1: boolean };
  calibration: AxisCalibration;
  /** 눈금으로 보정했는지 (false면 테두리를 그대로 쓴 것) */
  calibratedByTicks: { x: boolean; y: boolean };
}

// cropImage에서 축 선과 눈금을 찾아 plotBox와 눈금 위치를 보정한다.
export async function detectPlotBox(
  cropImageDataUrl: string,
  aiRect: NormalizedRect
): Promise<PlotBoxDetection> {
  const image = await loadImage(cropImageDataUrl);
  const w = image.naturalWidth;
  const h = image.naturalHeight;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('캔버스 컨텍스트를 만들지 못했습니다.');
  ctx.drawImage(image, 0, 0);
  const { data } = ctx.getImageData(0, 0, w, h);

  const isInk = (col: number, row: number) => {
    if (col < 0 || col >= w || row < 0 || row >= h) return false;
    const i = (row * w + col) * 4;
    // 회색조 밝기
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    return lum < INK_THRESHOLD;
  };

  // 세로선 후보: 각 열에서 진한 픽셀 수
  const colInk = new Array<number>(w).fill(0);
  for (let col = 0; col < w; col++) {
    let n = 0;
    for (let row = 0; row < h; row++) if (isInk(col, row)) n++;
    colInk[col] = n;
  }
  // 가로선 후보: 각 행에서 진한 픽셀 수
  const rowInk = new Array<number>(h).fill(0);
  for (let row = 0; row < h; row++) {
    let n = 0;
    for (let col = 0; col < w; col++) if (isInk(col, row)) n++;
    rowInk[row] = n;
  }

  const minColHits = h * MIN_LINE_RATIO;
  const minRowHits = w * MIN_LINE_RATIO;

  // 왼쪽에서 오른쪽으로 훑어 첫 세로 축선 / 오른쪽에서 왼쪽으로 훑어 마지막 세로 축선
  let leftCol = findLine(colInk, minColHits, 0, Math.floor(w * SEARCH_BAND), 1);
  let rightCol = findLine(colInk, minColHits, w - 1, Math.floor(w * (1 - SEARCH_BAND)), -1);
  // 위에서 아래로 첫 가로 축선 / 아래에서 위로 마지막 가로 축선
  let topRow = findLine(rowInk, minRowHits, 0, Math.floor(h * SEARCH_BAND), 1);
  let bottomRow = findLine(rowInk, minRowHits, h - 1, Math.floor(h * (1 - SEARCH_BAND)), -1);

  // 축이 L자 모양이면(테두리 없는 흔한 형태) 위·오른쪽에는 선이 없어 못 찾는다.
  // 이때는 **축 선 자체가 어디서 어디까지 뻗어 있는지**를 재서 나머지 경계를 얻는다.
  // (눈금(tick)으로 찾는 방법도 시도했으나, 1px 눈금은 JPEG 압축에 거의 하얗게 날아가 실패했다.
  //  반면 축 선은 뚜렷하게 남아 있어 이 방법이 훨씬 안정적이다.)
  if (bottomRow !== null) {
    const span = findLineSpan((pos) => isInk(pos, bottomRow!), w);
    if (span) {
      if (leftCol === null) leftCol = span.start;
      if (rightCol === null) rightCol = span.end;
    }
  }
  if (leftCol !== null) {
    const span = findLineSpan((pos) => isInk(leftCol!, pos), h);
    if (span) {
      if (topRow === null) topRow = span.start;
      if (bottomRow === null) bottomRow = span.end;
    }
  }

  const rect: NormalizedRect = {
    x0: leftCol !== null ? leftCol / (w - 1) : aiRect.x0,
    y0: topRow !== null ? topRow / (h - 1) : aiRect.y0,
    x1: rightCol !== null ? rightCol / (w - 1) : aiRect.x1,
    y1: bottomRow !== null ? bottomRow / (h - 1) : aiRect.y1,
  };

  // 뒤집히거나 지나치게 좁아졌으면 보정을 포기하고 AI 값을 그대로 쓴다.
  if (rect.x1 - rect.x0 < 0.05 || rect.y1 - rect.y0 < 0.05) {
    return {
      rect: aiRect,
      detected: { x0: false, y0: false, x1: false, y1: false },
      calibration: IDENTITY_CALIBRATION,
      calibratedByTicks: { x: false, y: false },
    };
  }

  // 눈금 위치 보정 — 네 변을 모두 찾았을 때만 시도한다(기준 상자가 있어야 비율을 잴 수 있다).
  const calibration = { ...IDENTITY_CALIBRATION };
  const calibratedByTicks = { x: false, y: false };

  if (leftCol !== null && rightCol !== null && topRow !== null && bottomRow !== null) {
    // X 눈금: 아래쪽 축 선 **바깥(아래)**으로 뻗은 표시를 찾는다
    const xTicks = findTicks(
      (along, depth) => isInk(along, bottomRow! + 1 + depth),
      leftCol,
      rightCol,
      h - bottomRow - 2
    );
    if (xTicks && xTicks[xTicks.length - 1] - xTicks[0] >= (rightCol - leftCol) * 0.3) {
      calibration.xMinT = (xTicks[0] - leftCol) / (rightCol - leftCol);
      calibration.xMaxT = (xTicks[xTicks.length - 1] - leftCol) / (rightCol - leftCol);
      calibratedByTicks.x = true;
    }

    // Y 눈금: 왼쪽 축 선 **바깥(왼쪽)**으로 뻗은 표시를 찾는다
    const yTicks = findTicks(
      (along, depth) => isInk(leftCol! - 1 - depth, along),
      topRow,
      bottomRow,
      leftCol - 1
    );
    if (yTicks && yTicks[yTicks.length - 1] - yTicks[0] >= (bottomRow - topRow) * 0.3) {
      // 행 번호는 아래로 갈수록 커진다 — 마지막(가장 아래) 눈금이 축 최솟값이다.
      calibration.yMinT = (bottomRow - yTicks[yTicks.length - 1]) / (bottomRow - topRow);
      calibration.yMaxT = (bottomRow - yTicks[0]) / (bottomRow - topRow);
      calibratedByTicks.y = true;
    }
  }

  return {
    rect,
    detected: {
      x0: leftCol !== null,
      y0: topRow !== null,
      x1: rightCol !== null,
      y1: bottomRow !== null,
    },
    calibration,
    calibratedByTicks,
  };
}

const MIN_TICK_LENGTH = 3; // 이보다 짧으면 축 선의 두께일 뿐 눈금이 아니다
const MAJOR_TICK_RATIO = 0.7; // 가장 긴 눈금의 이 비율 이상만 "주 눈금"으로 본다(보조 눈금 제외)

// 축 선을 따라가며 바깥으로 뻗은 눈금 표시의 위치를 찾는다.
//
// 눈금 길이를 미리 정해두지 않는다 — 그림 크기·스타일마다 다르기 때문이다.
// 대신 **축 선을 따라 각 지점이 바깥으로 얼마나 뻗어 있는지**를 재고, 대부분의 지점이 갖는
// 기본 길이(축 선 두께)보다 뚜렷하게 긴 지점만 눈금으로 본다.
// matplotlib의 보조 눈금은 주 눈금의 약 57% 길이라, 가장 긴 눈금의 70% 기준으로 갈라낸다.
function findTicks(
  isInkAt: (along: number, depth: number) => boolean,
  from: number,
  to: number,
  maxDepth: number
): number[] | null {
  if (maxDepth < MIN_TICK_LENGTH || to - from < 2) return null;

  const lengths: number[] = [];
  for (let along = from; along <= to; along++) {
    let run = 0;
    while (run < maxDepth && isInkAt(along, run)) run++;
    lengths.push(run);
  }

  const sorted = [...lengths].sort((a, b) => a - b);
  const baseline = sorted[Math.floor(sorted.length / 2)]; // 중앙값 = 축 선 두께의 여운
  const longest = sorted[sorted.length - 1];
  if (longest - baseline < MIN_TICK_LENGTH) return null;

  const threshold = baseline + (longest - baseline) * MAJOR_TICK_RATIO;

  // 눈금은 2~4픽셀 두께라 이웃한 지점이 함께 걸린다 — 붙어 있는 것끼리 묶어 가운데를 쓴다.
  const centers: number[] = [];
  let group: number[] = [];
  for (let i = 0; i < lengths.length; i++) {
    if (lengths[i] >= threshold) {
      group.push(from + i);
    } else if (group.length > 0) {
      centers.push(group.reduce((a, b) => a + b, 0) / group.length);
      group = [];
    }
  }
  if (group.length > 0) centers.push(group.reduce((a, b) => a + b, 0) / group.length);

  return centers.length >= 2 ? centers : null;
}

// 축 선을 따라가며 "가장 긴 연속 구간"의 시작·끝을 찾는다. 그 구간이 곧 플롯 영역의 폭(또는 높이)이다.
// 짧은 끊김(압축 잡티 등)은 이어진 것으로 본다.
const MAX_GAP = 3;

function findLineSpan(
  isInkAt: (pos: number) => boolean,
  length: number
): { start: number; end: number } | null {
  let best: { start: number; end: number } | null = null;
  let start: number | null = null;
  let last = -1;

  for (let pos = 0; pos < length; pos++) {
    if (isInkAt(pos)) {
      if (start === null) start = pos;
      last = pos;
    } else if (start !== null && pos - last > MAX_GAP) {
      if (!best || last - start > best.end - best.start) best = { start, end: last };
      start = null;
    }
  }
  if (start !== null && (!best || last - start > best.end - best.start)) {
    best = { start, end: last };
  }

  // 축 길이의 절반도 못 덮으면 축 선이라고 보기 어렵다.
  if (!best || best.end - best.start < length * 0.5) return null;
  return best;
}

// from에서 to 방향으로 훑으며 임계값을 처음 넘는 줄을 찾는다.
function findLine(
  counts: number[],
  minHits: number,
  from: number,
  to: number,
  step: 1 | -1
): number | null {
  for (let i = from; step > 0 ? i <= to : i >= to; i += step) {
    if (counts[i] >= minHits) return i;
  }
  return null;
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지를 불러오지 못했습니다.'));
    img.src = dataUrl;
  });
}
