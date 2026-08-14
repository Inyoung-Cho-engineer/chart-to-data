// DESIGN.md §5.5 — AI가 알려준 계열 색상을 기준으로, 그래프 영역의 각 세로줄에서 선의 높이를 찾는다.
//
// 이 파일은 브라우저에서만 동작하고 서버·외부 모델을 전혀 쓰지 않는다.
// AI에게 좌표까지 읽게 했을 때 실측 오차가 평균 5.9~7.7%(최대 19.8%)로 목표(±3%)를 못 맞췄고
// 실행마다 값이 달라졌기 때문에, 정밀 측정만 앱이 가져왔다 (DESIGN.md §2 D안).

import type { NormalizedRect } from './types';

// 픽셀이 계열 색인지 판별하는 방법:
// 단순히 "계열 색과의 거리가 임계값 이하"로 보면, JPEG 압축으로 흐려진 점선(예: 주황 255,127,14 →
// 211,148,79)을 놓친다. 실측에서 20곳 중 2곳만 통과했다. 그렇다고 임계값을 올리면 회색 축선
// (118,118,118)까지 잡힌다.
// 그래서 **가장 가까운 색이 무엇인지**로 판별한다. 후보에는 다른 계열 색과 배경·축 색을 함께 넣어,
// 그중 우리 계열 색이 가장 가까울 때만 인정한다. AI가 모든 계열 색을 알려주므로 가능한 방법이다.
const MAX_COLOR_DISTANCE = 260; // 이보다 멀면 아예 다른 색으로 본다 (맨해튼 거리)
const THICK_RUN_RATIO = 0.15; // 덩어리가 플롯 높이의 이 비율을 넘으면 "너무 두껍다"로 본다
const COLUMN_HALF_WIDTH = 1; // 세로줄 좌우 ±1픽셀까지 함께 살펴 얇은 선을 놓치지 않는다
const MAX_JUMP_RATIO = 0.2; // 옆 지점 대비 이보다 크게 튀면 데이터 선이 아니라고 보고 "확인 필요"로 남긴다
// (plotBox 가장자리를 축 선으로 보고 제외하는 방법도 시도했으나, C8을 못 고치면서 C7을
//  0.13% → 12.05%로 악화시켜 되돌렸다. 축에 바짝 붙는 곡선은 §11 한계로 남긴다.)

// 데이터 선이 아닌 것들 — 배경(흰색), 축·글자(검정·회색). 흐려진 픽셀이 이쪽에 더 가까우면 버린다.
const NON_DATA_COLORS: Rgb[] = [
  { r: 255, g: 255, b: 255 },
  { r: 0, g: 0, b: 0 },
  { r: 128, g: 128, b: 128 },
  { r: 51, g: 51, b: 51 },
];

export interface TracedPoint {
  ty: number | null; // 못 찾으면 null
  confidence: 'high' | 'medium' | 'low';
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function parseHexColor(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function manhattan(r: number, g: number, b: number, c: Rgb) {
  return Math.abs(r - c.r) + Math.abs(g - c.g) + Math.abs(b - c.b);
}

// AI가 알려준 색은 눈대중이라 실제와 꽤 다르다 (실측: 실제 #1f77b4인 선을 #00aaff로 답함).
// 그 색을 그대로 쓰면 선 픽셀이 회색 축선과 구분되지 않아 추적이 통째로 실패한다.
// 그래서 AI 색은 **힌트로만** 쓰고, 이미지에 실제로 존재하는 색들 중 힌트에 가장 가까운 것을 target으로 삼는다.
const COLOR_BUCKET = 24; // 비슷한 색끼리 묶는 단위 (JPEG 잡티 흡수)
const BACKGROUND_MIN = 240; // 세 채널 모두 이 값 이상이면 배경(흰색)으로 보고 후보에서 뺀다

// 이미지에 실제로 쓰인 색들의 목록(팔레트)을 만든다.
// 선 색뿐 아니라 축·글자·배경 색도 함께 들어간다 — 그래야 "이 픽셀이 선인지 축인지"를
// 이상적인 회색값이 아니라 **실제 이 이미지의 색**으로 견줘 판별할 수 있다.
//
// 한 선은 안티에일리어싱·JPEG 때문에 여러 명암으로 흩어진다. 그것들을 따로 두면 서로 경쟁해
// 선 가장자리 픽셀을 놓치므로(실측: 50지점 중 27개만 찾음), **가까운 색끼리 묶어** 하나로 본다.
const MERGE_DISTANCE = 110;

export function buildPalette(plot: PlotPixels): Rgb[] {
  const { data, width, height } = plot;
  const buckets = new Map<string, { r: number; g: number; b: number; n: number }>();

  for (let i = 0; i < data.data.length; i += 4) {
    const r = data.data[i];
    const g = data.data[i + 1];
    const b = data.data[i + 2];
    const key = `${Math.floor(r / COLOR_BUCKET)},${Math.floor(g / COLOR_BUCKET)},${Math.floor(b / COLOR_BUCKET)}`;
    const e = buckets.get(key);
    if (e) {
      e.r += r;
      e.g += g;
      e.b += b;
      e.n++;
    } else {
      buckets.set(key, { r, g, b, n: 1 });
    }
  }

  // 너무 드문 색(잡티)은 뺀다. 많이 쓰인 순으로 돌려준다.
  const minCount = Math.max(30, Math.round(width * height * 0.0002));
  const palette = [...buckets.values()]
    .filter((e) => e.n >= minCount)
    .sort((a, b) => b.n - a.n)
    .map((e) => ({ r: Math.round(e.r / e.n), g: Math.round(e.g / e.n), b: Math.round(e.b / e.n) }));

  // 배경(흰색)은 팔레트에 없더라도 항상 후보로 넣는다
  if (!palette.some((c) => c.r >= BACKGROUND_MIN && c.g >= BACKGROUND_MIN && c.b >= BACKGROUND_MIN)) {
    palette.push({ r: 255, g: 255, b: 255 });
  }
  return palette;
}

// 팔레트에서 힌트에 가장 가까운 색을 고른다.
export function pickNearestColor(palette: Rgb[], hint: Rgb): Rgb {
  let best = hint;
  let bestDistance = Infinity;
  for (const c of palette) {
    const d = manhattan(c.r, c.g, c.b, hint);
    if (d < bestDistance) {
      bestDistance = d;
      best = c;
    }
  }
  return best;
}

export function resolveSeriesColor(plot: PlotPixels, hint: Rgb): Rgb {
  return pickNearestColor(buildPalette(plot), hint);
}

// 이 픽셀이 target 계열의 선인가? (다른 계열·배경·축보다 target에 더 가까워야 한다)
function matchesTarget(r: number, g: number, b: number, target: Rgb, rivals: Rgb[]): boolean {
  const dTarget = manhattan(r, g, b, target);
  if (dTarget > MAX_COLOR_DISTANCE) return false;
  for (const rival of rivals) {
    if (manhattan(r, g, b, rival) <= dTarget) return false;
  }
  return true;
}

// plotBox 영역만 잘라 픽셀 데이터로 읽어둔다. 한 번 만들어 여러 지점 조회에 재사용한다.
export async function loadPlotPixels(cropImageDataUrl: string, plotBox: NormalizedRect) {
  const image = await loadImage(cropImageDataUrl);

  const sx = Math.round(plotBox.x0 * image.naturalWidth);
  const sy = Math.round(plotBox.y0 * image.naturalHeight);
  const sw = Math.max(1, Math.round((plotBox.x1 - plotBox.x0) * image.naturalWidth));
  const sh = Math.max(1, Math.round((plotBox.y1 - plotBox.y0) * image.naturalHeight));

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('캔버스 컨텍스트를 만들지 못했습니다.');

  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
  return { data: ctx.getImageData(0, 0, sw, sh), width: sw, height: sh };
}

export type PlotPixels = Awaited<ReturnType<typeof loadPlotPixels>>;

interface Run {
  start: number;
  end: number;
}

// 한 세로줄(좌우 ±halfWidth 포함)에서 계열 색인 덩어리들을 찾는다.
function findRuns(
  plot: PlotPixels,
  target: Rgb,
  rivals: Rgb[],
  centerCol: number,
  halfWidth: number
): Run[] {
  const { data, width, height } = plot;

  const matchedRows: number[] = [];
  for (let row = 0; row < height; row++) {
    let matched = false;
    for (let d = -halfWidth; d <= halfWidth && !matched; d++) {
      const col = centerCol + d;
      if (col < 0 || col >= width) continue;
      const i = (row * width + col) * 4;
      if (matchesTarget(data.data[i], data.data[i + 1], data.data[i + 2], target, rivals)) {
        matched = true;
      }
    }
    if (matched) matchedRows.push(row);
  }

  if (matchedRows.length === 0) return [];

  const runs: Run[] = [];
  let start = matchedRows[0];
  let prev = matchedRows[0];
  for (let i = 1; i < matchedRows.length; i++) {
    if (matchedRows[i] === prev + 1) {
      prev = matchedRows[i];
    } else {
      runs.push({ start, end: prev });
      start = matchedRows[i];
      prev = matchedRows[i];
    }
  }
  runs.push({ start, end: prev });
  return runs;
}

// 점선은 세로줄이 빈 칸에 걸리면 아무것도 못 찾는다(실측: 50지점 중 43개 실패).
// 그래서 못 찾으면 좌우로 조금씩 넓혀가며 가장 가까운 선 조각을 찾는다.
function findRunsWidening(plot: PlotPixels, target: Rgb, rivals: Rgb[], centerCol: number): Run[] {
  const maxHalfWidth = Math.max(10, Math.round(plot.width * 0.02)); // 점선 간격을 덮을 만큼
  for (let hw = COLUMN_HALF_WIDTH; hw <= maxHalfWidth; hw += 2) {
    const runs = findRuns(plot, target, rivals, centerCol, hw);
    if (runs.length > 0) return runs;
  }
  return [];
}

// 판별 후보(rival)는 **이 이미지의 실제 팔레트에서 target과 그 명암들을 뺀 나머지**로 만든다.
//
// 이상적인 회색값 목록을 쓰면 JPEG로 흐려진 실제 색과 기준이 어긋나 축 선을 데이터로 오인한다.
// 반대로 팔레트를 통째로 후보에 넣으면, 같은 선의 안티에일리어싱 명암끼리 경쟁해 선 가장자리를
// 놓친다(실측: 50지점 중 27개만 찾음). 그래서 **target에서 MERGE_DISTANCE 안쪽인 색은 같은 선으로
// 보고 후보에서 뺀다.** 다른 계열은 그보다 멀리 있으므로 그대로 구분된다.
export function buildRivalColors(palette: Rgb[], target: Rgb): Rgb[] {
  const others = palette.filter((c) => manhattan(c.r, c.g, c.b, target) > MERGE_DISTANCE);
  const extras = NON_DATA_COLORS.filter((n) => manhattan(n.r, n.g, n.b, target) > MERGE_DISTANCE);
  return [...others, ...extras];
}

function runCenter(run: Run) {
  return (run.start + run.end) / 2;
}

// 한 지점만 조회할 때 쓴다(사용자가 특정 X값을 물어본 경우).
// 여러 덩어리가 잡히면 가장 굵은 것을 고른다.
export function traceAt(plot: PlotPixels, target: Rgb, rivals: Rgb[], tx: number): TracedPoint {
  const centerCol = Math.min(plot.width - 1, Math.max(0, Math.round(tx * (plot.width - 1))));
  const runs = findRunsWidening(plot, target, rivals, centerCol);
  if (runs.length === 0) return { ty: null, confidence: 'low' };

  const thickest = runs.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a));
  return toTraced(plot, thickest, runs.length);
}

// 여러 지점을 한 번에 추적한다. 앞뒤 지점과 이어지는지(연속성)를 보고 덩어리를 고르므로,
// 그래프 안에 그려진 범례 선이나 다른 계열과 겹치는 구간에서 엉뚱한 선으로 튀는 것을 막는다.
// (실측: 범례 선을 데이터 선으로 착각해 한 지점에서 28% 오차가 났던 문제)
export function traceSeries(
  plot: PlotPixels,
  target: Rgb,
  rivals: Rgb[],
  txList: number[]
): TracedPoint[] {
  const runsPerPoint = txList.map((tx) => {
    const centerCol = Math.min(plot.width - 1, Math.max(0, Math.round(tx * (plot.width - 1))));
    return findRunsWidening(plot, target, rivals, centerCol);
  });

  // 시작점(anchor): 덩어리가 하나뿐이라 헷갈릴 여지가 없는 지점 중 가운데에 가장 가까운 것.
  const middle = Math.floor(txList.length / 2);
  let anchor = -1;
  let bestDistance = Infinity;
  runsPerPoint.forEach((runs, i) => {
    if (runs.length !== 1) return;
    const d = Math.abs(i - middle);
    if (d < bestDistance) {
      bestDistance = d;
      anchor = i;
    }
  });
  if (anchor === -1) {
    // 어느 지점도 단독 덩어리가 없으면 가운데에서 가장 굵은 덩어리로 시작한다.
    anchor = runsPerPoint.findIndex((r) => r.length > 0);
    if (anchor === -1) return txList.map(() => ({ ty: null, confidence: 'low' as const }));
  }

  const chosen: Array<Run | null> = new Array(txList.length).fill(null);
  const anchorRuns = runsPerPoint[anchor];
  chosen[anchor] = anchorRuns.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a));

  // anchor에서 좌우로 퍼져나가며, 직전에 고른 위치에 가장 가까운 덩어리를 고른다.
  // 후보가 전부 너무 멀면(그래프 안 범례 선처럼 데이터가 아닌 것만 잡힌 경우) 값을 내놓지 않는다 —
  // 틀린 숫자를 주는 것보다 "확인 필요"로 남기는 편이 낫다. (실측: 범례 때문에 23% 오차가 났던 문제)
  const maxJump = plot.height * MAX_JUMP_RATIO;

  const pick = (i: number, reference: number | null) => {
    const runs = runsPerPoint[i];
    if (runs.length === 0) return null;
    if (reference === null) return runs.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a));
    const nearest = runs.reduce((a, b) =>
      Math.abs(runCenter(b) - reference) < Math.abs(runCenter(a) - reference) ? b : a
    );
    return Math.abs(runCenter(nearest) - reference) > maxJump ? null : nearest;
  };

  let ref: number | null = runCenter(chosen[anchor]!);
  for (let i = anchor + 1; i < txList.length; i++) {
    chosen[i] = pick(i, ref);
    if (chosen[i]) ref = runCenter(chosen[i]!);
  }
  ref = runCenter(chosen[anchor]!);
  for (let i = anchor - 1; i >= 0; i--) {
    chosen[i] = pick(i, ref);
    if (chosen[i]) ref = runCenter(chosen[i]!);
  }

  return chosen.map((run, i) =>
    run ? toTraced(plot, run, runsPerPoint[i].length) : { ty: null, confidence: 'low' as const }
  );
}

function toTraced(plot: PlotPixels, run: Run, runCount: number): TracedPoint {
  const ty = 1 - runCenter(run) / (plot.height - 1);
  // 덩어리가 여럿이거나(다른 선과 겹침) 지나치게 두꺼우면 신뢰도를 낮춘다.
  const tooThick = run.end - run.start > plot.height * THICK_RUN_RATIO;
  return { ty, confidence: runCount > 1 || tooThick ? 'medium' : 'high' };
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지를 불러오지 못했습니다.'));
    img.src = dataUrl;
  });
}
