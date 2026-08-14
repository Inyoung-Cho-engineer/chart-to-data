// 지정한 영역만 Canvas로 잘라내고, 서버로 보내기 좋은 크기로 줄이고 압축한다 (DESIGN.md §4.1·§8.3).
// 원본 대신 이 조각만 서버로 나가므로, 여기서 미리 줄여둔다. 지금은 화면 미리보기에만 쓰인다 —
// 실제로 서버에 보내는 것은 11번 작업 이후다.

import type { NormalizedRect } from './types';

const MAX_LONG_SIDE = 1600; // 긴 변이 이보다 크면 줄인다 (DESIGN.md §8.3) — 작으면 키우지 않는다
const JPEG_QUALITY = 0.85;

export async function cropImageToDataUrl(
  sourceDataUrl: string,
  rect: NormalizedRect
): Promise<string> {
  const image = await loadImage(sourceDataUrl);

  const sx = rect.x0 * image.naturalWidth;
  const sy = rect.y0 * image.naturalHeight;
  const sWidth = (rect.x1 - rect.x0) * image.naturalWidth;
  const sHeight = (rect.y1 - rect.y0) * image.naturalHeight;

  const longSide = Math.max(sWidth, sHeight);
  const scale = longSide > MAX_LONG_SIDE ? MAX_LONG_SIDE / longSide : 1;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sWidth * scale));
  canvas.height = Math.max(1, Math.round(sHeight * scale));

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('캔버스 컨텍스트를 만들지 못했습니다.');
  }

  context.drawImage(image, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지를 불러오지 못했습니다.'));
    img.src = dataUrl;
  });
}
