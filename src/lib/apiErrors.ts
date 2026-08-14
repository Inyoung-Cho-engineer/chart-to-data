// analyze·extract·point 세 API 경로가 함께 쓰는 오류 응답 형식 (DESIGN.md §6.4).
// 서버는 코드와 단계만 돌려준다 — 화면 문구는 브라우저가 errors.ts에서 고른다.

import { NextResponse } from 'next/server';

export type ErrorCode =
  | 'REGION_NO_CHART'
  | 'MODEL_CALL_FAILED'
  | 'MODEL_TIMEOUT'
  | 'MODEL_BAD_FORMAT'
  | 'MODEL_RATE_LIMITED';

export function errorResponse(code: ErrorCode, stage: 'region' | 'model', status: number) {
  return NextResponse.json({ error: { code, stage } }, { status });
}

// CHECK.md 2번 — 예전엔 타임아웃이 되면 브라우저에는 실패로 보였지만 OpenAI 호출 자체는
// 끝까지 돌아 요금이 그대로 청구됐다(취소 신호를 보내지 않았기 때문). AbortController로
// 실제 요청을 중단시킨다. fn은 signal을 받아 OpenAI SDK에 그대로 넘겨야 한다.
export function withAbortTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms: number
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, ms);

  return fn(controller.signal)
    .catch((err) => {
      // 우리가 타임아웃으로 끊은 것이면, SDK가 던지는 에러 종류와 상관없이 항상 같은
      // 코드로 분류되도록 통일한다.
      if (timedOut) throw new Error('MODEL_TIMEOUT');
      throw err;
    })
    .finally(() => clearTimeout(timer));
}

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // DESIGN.md §8.3·§10 — 약 4MB
export const MODEL_TIMEOUT_MS = 55_000; // maxDuration(60초)보다 여유 있게 먼저 끊는다

// image 필드가 유효한 JPEG data URL인지 확인하고, byteLength 상한도 함께 검사한다.
export function readImageField(body: unknown): string | null {
  const image = (body as { image?: unknown } | null)?.image;
  if (typeof image !== 'string' || !image.startsWith('data:image/jpeg;base64,')) {
    return null;
  }
  const base64 = image.slice('data:image/jpeg;base64,'.length);
  const byteLength = Math.floor((base64.length * 3) / 4);
  if (byteLength === 0 || byteLength > MAX_IMAGE_BYTES) {
    return null;
  }
  return image;
}

// 모델 호출 중 발생한 에러를 코드로 분류한다. 원본 에러는 호출부에서 서버 로그에만 남긴다.
export function classifyModelError(err: unknown): ErrorCode {
  if (err instanceof Error && err.message === 'MODEL_TIMEOUT') return 'MODEL_TIMEOUT';
  if (err instanceof SyntaxError) return 'MODEL_BAD_FORMAT';
  return 'MODEL_CALL_FAILED';
}
