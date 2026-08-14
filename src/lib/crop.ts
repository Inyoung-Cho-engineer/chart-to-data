// 지정한 영역만 Canvas로 잘라낸다 (DESIGN.md §4.1·§8.3).
//
// 잘라낸 조각은 두 가지로 만든다.
//
// 1) 서버(AI)로 보낼 조각 — 긴 변 1600px, JPEG. 요청 본문 크기를 줄이기 위해서다.
// 2) 앱이 픽셀을 추적할 조각 — 원본 해상도 그대로, PNG(무손실). 브라우저 밖으로 나가지 않는다.
//
// 왜 나눴나: 선을 색으로 따라가는 방식은 색이 조금만 흐려져도 축 선·격자선과 구분이 안 된다.
// JPEG 압축과 축소가 겹치면 계열 색이 통째로 사라진다(2026-08-14 실측). 그래서 판독용 조각은
// 줄이지도 압축하지도 않는다. 서버로 나가는 것은 여전히 1)뿐이다.

import type { NormalizedRect } from './types';

const MAX_LONG_SIDE = 1600; // 긴 변이 이보다 크면 줄인다 (DESIGN.md §8.3) — 작으면 키우지 않는다
const JPEG_QUALITY = 0.85;

// 서버로 보낼 조각 (줄이고 압축)
export async function cropImageToDataUrl(
  sourceDataUrl: string,
  rect: NormalizedRect
): Promise<string> {
  const canvas = await cropToCanvas(sourceDataUrl, rect, MAX_LONG_SIDE);
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

// 앱이 픽셀을 추적할 조각 (원본 해상도, 무손실). 서버로 보내지 않는다.
export async function cropImageForTrace(
  sourceDataUrl: string,
  rect: NormalizedRect
): Promise<string> {
  const canvas = await cropToCanvas(sourceDataUrl, rect, Infinity);
  return canvas.toDataURL('image/png');
}

async function cropToCanvas(
  sourceDataUrl: string,
  rect: NormalizedRect,
  maxLongSide: number
): Promise<HTMLCanvasElement> {
  const image = await loadImage(sourceDataUrl);

  const sx = rect.x0 * image.naturalWidth;
  const sy = rect.y0 * image.naturalHeight;
  const sWidth = (rect.x1 - rect.x0) * image.naturalWidth;
  const sHeight = (rect.y1 - rect.y0) * image.naturalHeight;

  const longSide = Math.max(sWidth, sHeight);
  const scale = longSide > maxLongSide ? maxLongSide / longSide : 1;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sWidth * scale));
  canvas.height = Math.max(1, Math.round(sHeight * scale));

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('캔버스 컨텍스트를 만들지 못했습니다.');
  }

  context.drawImage(image, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지를 불러오지 못했습니다.'));
    img.src = dataUrl;
  });
}
