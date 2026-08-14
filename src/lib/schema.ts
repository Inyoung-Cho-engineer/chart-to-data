// DESIGN.md §6.1 /api/analyze 응답 형식을 Zod로 못박아둔 곳.
// 모델이 이 형식에 맞지 않는 답을 하면 서버가 MODEL_BAD_FORMAT으로 처리한다 (13번 작업).
// chartFound가 false면 라인차트를 찾지 못한 것으로 보고 REGION_NO_CHART로 처리한다 (17번 작업).

import { z } from 'zod';

export const axisSchema = z.object({
  type: z.enum(['linear', 'log', 'unknown']),
  min: z.number(),
  max: z.number(),
  unit: z.string(),
});

export const seriesSchema = z.object({
  id: z.string(),
  label: z.string(),
  colorHex: z.string(),
});

export const crossingSchema = z.object({
  tx: z.number().min(0).max(1),
  seriesIds: z.array(z.string()).min(2),
});

export const rectSchema = z.object({
  x0: z.number(),
  y0: z.number(),
  x1: z.number(),
  y1: z.number(),
});

// 모델에게 실제로 요청하는 형식 — 라인차트를 찾았을 때/못 찾았을 때를 chartFound로 구분한다.
const analyzeFoundSchema = z.object({
  chartFound: z.literal(true),
  plotBox: rectSchema,
  xAxis: axisSchema,
  yAxis: axisSchema,
  series: z.array(seriesSchema).min(1),
  crossings: z.array(crossingSchema),
});

const analyzeNotFoundSchema = z.object({
  chartFound: z.literal(false),
});

export const analyzeResponseSchema = z.discriminatedUnion('chartFound', [
  analyzeFoundSchema,
  analyzeNotFoundSchema,
]);

export type AnalyzeResponse = z.infer<typeof analyzeResponseSchema>;

// 좌표 추출·특정 X값 조회는 하이브리드 전환(DESIGN.md §2 D안) 이후 서버를 거치지 않고
// 브라우저의 trace.ts가 직접 처리하므로, 그에 대한 응답 스키마는 더 이상 필요하지 않다.
