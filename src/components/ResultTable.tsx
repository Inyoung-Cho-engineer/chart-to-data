'use client';

// DESIGN.md §3.1·§3.3 — 아래 전체 폭에 나타나는 추출 결과 표.
// 왼쪽 원본 이미지가 항상 함께 떠 있는 상태에서 이 표가 나타나므로, 화면에서 나란히 확인할 수 있다.

import { useSessionStore } from '@/store/session';
import type { DataPoint } from '@/lib/types';
import { cardClass, mutedTextClass } from '@/lib/ui';

const REASON_LABEL: Record<NonNullable<DataPoint['checkReason']>, string> = {
  low_confidence: '신뢰도 낮음',
  crossing: '계열 교차',
  out_of_range: '축 범위 밖',
};

function formatValue(value: number | null, digits = 3): string {
  return value == null ? '—' : value.toFixed(digits);
}

export function ResultTable() {
  const points = useSessionStore((s) => s.points);
  const xAxis = useSessionStore((s) => s.xAxis);
  const yAxis = useSessionStore((s) => s.yAxis);

  if (points.length === 0) {
    return null; // 아직 추출한 결과가 없으면 아무것도 보여주지 않는다
  }

  const needsCheckCount = points.filter((p) => p.needsCheck).length;

  return (
    <section className={`${cardClass} flex w-full max-w-5xl flex-col gap-2`}>
      <p className={mutedTextClass}>
        추출 결과 {points.length}개 — 확인 필요{' '}
        <span className="font-medium text-amber">{needsCheckCount}개</span>
      </p>
      <div className="max-h-96 overflow-y-auto overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[480px] border-collapse text-left text-xs">
          <thead>
            <tr className="bg-navy text-white">
              <th className="px-2 py-2 font-medium">#</th>
              <th className="px-2 py-2 font-medium">X{xAxis?.unit ? ` (${xAxis.unit})` : ''}</th>
              <th className="px-2 py-2 font-medium">추출값{yAxis?.unit ? ` (${yAxis.unit})` : ''}</th>
              <th className="px-2 py-2 font-medium">신뢰도</th>
              <th className="px-2 py-2 font-medium">상태</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p, i) => (
              <tr
                key={i}
                className={
                  p.source === 'user_query'
                    ? 'bg-amber/10'
                    : i % 2 === 0
                      ? 'bg-white'
                      : 'bg-card/50'
                }
              >
                <td className="border-b border-slate-200 px-2 py-1">
                  {p.source === 'user_query' ? '★' : i + 1}
                </td>
                <td className="border-b border-slate-200 px-2 py-1">{formatValue(p.x)}</td>
                <td className="border-b border-slate-200 px-2 py-1">{formatValue(p.y)}</td>
                <td className="border-b border-slate-200 px-2 py-1">
                  <span
                    className={
                      p.confidence === 'low' ? 'rounded bg-amber/20 px-1.5 py-0.5 text-amber-hover' : ''
                    }
                  >
                    {p.confidence}
                  </span>
                </td>
                <td className="border-b border-slate-200 px-2 py-1">
                  {p.needsCheck ? (
                    <span
                      className="font-medium text-amber-hover"
                      title={p.checkReason ? REASON_LABEL[p.checkReason] : undefined}
                    >
                      확인 필요{p.checkReason ? ` (${REASON_LABEL[p.checkReason]})` : ''}
                    </span>
                  ) : (
                    '정상'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
