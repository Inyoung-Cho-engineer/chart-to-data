// CHECK.md 1번 — /api/analyze에 요청 빈도 제한이 없어, 배포되면 누구나 무제한 호출해
// OpenAI 비용이 그대로 새어나갈 수 있었다. IP당 분당 호출 횟수를 제한한다.
//
// 인스턴스 메모리에만 상태를 두므로 완벽하지 않다 — 서버리스 인스턴스가 여러 개면 인스턴스별로
// 따로 세고, 콜드 스타트마다 초기화된다. 그래도 코드 변경만으로 즉시 적용되는 가장 단순한
// 방어선이라 우선 넣는다. 근본적인 비용 상한은 OpenAI 대시보드의 usage hard limit으로 따로 걸어야
// 한다(CHECK.md 1번 참고, 이 파일로 대신할 수 없다).

import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse } from '@/lib/apiErrors';

const WINDOW_MS = 60_000; // 1분
const MAX_REQUESTS_PER_WINDOW = 5; // 정상 사용(판독 1~2회 재시도 포함)은 넉넉히 통과하는 수준

// IP → 최근 요청 시각 목록. Edge 런타임이라 일반 Map으로 충분하다(DB·외부 저장소 아님, 영구 저장 아님).
const requestLog = new Map<string, number[]>();

function getClientIp(request: NextRequest): string {
  // Vercel은 x-forwarded-for에 클라이언트 IP를 맨 앞에 넣어준다.
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || 'unknown';
}

export function proxy(request: NextRequest) {
  const ip = getClientIp(request);
  const now = Date.now();

  const recent = (requestLog.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    return errorResponse('MODEL_RATE_LIMITED', 'model', 429);
  }

  recent.push(now);
  requestLog.set(ip, recent);

  return NextResponse.next();
}

export const config = {
  matcher: '/api/analyze',
};
