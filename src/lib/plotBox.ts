// 그래프 안쪽 영역(plotBox)을 픽셀에서 직접 찾아 AI가 준 값을 바로잡는다.
//
// 왜 필요한가: AI는 plotBox를 {0.1, 0.1, 0.9, 0.9} 같은 반올림 값으로 대충 답하는 일이 잦다.
// 실측에서 아래쪽 경계가 정답보다 7.9% 어긋났고, 그 오차가 추출값 오차(최대 8.09%)로 그대로 옮겨졌다.
// 축 선은 "길고 진한 직선"이라 픽셀에서 찾기 쉬우므로, 찾은 것만 AI 값을 대체한다.

import type { NormalizedRect } from './types';

const DARK_THRESHOLD = 128; // 이 밝기보다 어두우면 선일 수 있다고 본다
const MIN_LINE_RATIO = 0.5; // 그 줄의 절반 이상이 어두워야 축 선으로 인정
const SEARCH_BAND = 0.4; // 각 가장자리에서 이 비율만큼 안쪽까지만 축 선을 찾는다

export interface PlotBoxDetection {
  rect: NormalizedRect;
  detected: { x0: boolean; y0: boolean; x1: boolean; y1: boolean };
}

// cropImage에서 축 선을 찾아 plotBox를 보정한다. 못 찾은 변은 AI가 준 값을 그대로 쓴다.
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

  const isDark = (col: number, row: number) => {
    const i = (row * w + col) * 4;
    // 회색조 밝기
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    return lum < DARK_THRESHOLD;
  };

  // 세로선 후보: 각 열에서 어두운 픽셀 수
  const colDark = new Array<number>(w).fill(0);
  for (let col = 0; col < w; col++) {
    let n = 0;
    for (let row = 0; row < h; row++) if (isDark(col, row)) n++;
    colDark[col] = n;
  }
  // 가로선 후보: 각 행에서 어두운 픽셀 수
  const rowDark = new Array<number>(h).fill(0);
  for (let row = 0; row < h; row++) {
    let n = 0;
    for (let col = 0; col < w; col++) if (isDark(col, row)) n++;
    rowDark[row] = n;
  }

  const minColHits = h * MIN_LINE_RATIO;
  const minRowHits = w * MIN_LINE_RATIO;

  // 왼쪽에서 오른쪽으로 훑어 첫 세로 축선 / 오른쪽에서 왼쪽으로 훑어 마지막 세로 축선
  let leftCol = findLine(colDark, minColHits, 0, Math.floor(w * SEARCH_BAND), 1);
  let rightCol = findLine(colDark, minColHits, w - 1, Math.floor(w * (1 - SEARCH_BAND)), -1);
  // 위에서 아래로 첫 가로 축선 / 아래에서 위로 마지막 가로 축선
  let topRow = findLine(rowDark, minRowHits, 0, Math.floor(h * SEARCH_BAND), 1);
  let bottomRow = findLine(rowDark, minRowHits, h - 1, Math.floor(h * (1 - SEARCH_BAND)), -1);

  // 축이 L자 모양이면(테두리 없는 흔한 형태) 위·오른쪽에는 선이 없어 못 찾는다.
  // 이때는 **축 선 자체가 어디서 어디까지 뻗어 있는지**를 재서 나머지 경계를 얻는다.
  // (눈금(tick)으로 찾는 방법도 시도했으나, 1px 눈금은 JPEG 압축에 거의 하얗게 날아가 실패했다.
  //  반면 축 선은 뚜렷하게 남아 있어 이 방법이 훨씬 안정적이다.)
  if (bottomRow !== null) {
    const span = findLineSpan((pos) => isDark(pos, bottomRow!), w);
    if (span) {
      if (leftCol === null) leftCol = span.start;
      if (rightCol === null) rightCol = span.end;
    }
  }
  if (leftCol !== null) {
    const span = findLineSpan((pos) => isDark(leftCol!, pos), h);
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
    return { rect: aiRect, detected: { x0: false, y0: false, x1: false, y1: false } };
  }

  return {
    rect,
    detected: {
      x0: leftCol !== null,
      y0: topRow !== null,
      x1: rightCol !== null,
      y1: bottomRow !== null,
    },
  };
}

// 축 선을 따라가며 "가장 긴 연속 구간"의 시작·끝을 찾는다. 그 구간이 곧 플롯 영역의 폭(또는 높이)이다.
// 짧은 끊김(압축 잡티 등)은 이어진 것으로 본다.
const MAX_GAP = 3;

function findLineSpan(
  isDarkAt: (pos: number) => boolean,
  length: number
): { start: number; end: number } | null {
  let best: { start: number; end: number } | null = null;
  let start: number | null = null;
  let last = -1;

  for (let pos = 0; pos < length; pos++) {
    if (isDarkAt(pos)) {
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
