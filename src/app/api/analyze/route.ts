import { NextResponse } from 'next/server';
import { analyzeChartImage } from '@/lib/vision';
import { analyzeResponseSchema } from '@/lib/schema';
import {
  errorResponse,
  withAbortTimeout,
  readImageField,
  classifyModelError,
  MODEL_TIMEOUT_MS,
} from '@/lib/apiErrors';

// DESIGN.md §6.1 /api/analyze — 잘라낸 조각을 받아 OpenAI 비전 모델에 판독을 요청하고,
// 응답 형식을 schema.ts(Zod)로 검사한 뒤 §6.1이 정한 모양만 클라이언트로 돌려준다.

export const maxDuration = 60; // DESIGN.md §8.3 — Vercel 함수 실행 시간 제한 대비

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse('REGION_NO_CHART', 'region', 422);
  }

  const image = readImageField(body);
  if (!image) {
    return errorResponse('REGION_NO_CHART', 'region', 422);
  }

  let raw: unknown;
  try {
    raw = await withAbortTimeout((signal) => analyzeChartImage(image, signal), MODEL_TIMEOUT_MS);
  } catch (err) {
    // 원본 에러(모델 응답 내용 포함)는 서버 로그에만 남기고, 브라우저에는 코드만 보낸다.
    console.error('[api/analyze] 모델 호출 실패:', err);
    const code = classifyModelError(err);
    const status = code === 'MODEL_TIMEOUT' ? 504 : 502;
    return errorResponse(code, 'model', status);
  }

  const parsed = analyzeResponseSchema.safeParse(raw);
  if (!parsed.success) {
    console.error('[api/analyze] 모델 응답 형식이 예상과 다름:', parsed.error.message);
    return errorResponse('MODEL_BAD_FORMAT', 'model', 502);
  }

  // 17번 작업 — 모델이 라인차트를 찾지 못했다고 답하면 영역 단계 실패로 처리한다.
  if (!parsed.data.chartFound) {
    return errorResponse('REGION_NO_CHART', 'region', 422);
  }

  const { plotBox, xAxis, yAxis, series, crossings } = parsed.data;
  return NextResponse.json({ plotBox, xAxis, yAxis, series, crossings });
}
