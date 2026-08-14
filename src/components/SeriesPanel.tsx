'use client';

// DESIGN.md §3.2 ④·§3.4 ④ — 인식된 계열(선) 목록에서 1개만 고르는 화면.
// 축을 확인하기 전에는 넘어오지 않는다.

import { useSessionStore } from '@/store/session';

export function SeriesPanel() {
  const xAxis = useSessionStore((s) => s.xAxis);
  const yAxis = useSessionStore((s) => s.yAxis);
  const seriesList = useSessionStore((s) => s.seriesList);
  const selectedSeriesId = useSessionStore((s) => s.selectedSeriesId);
  const setSelectedSeriesId = useSessionStore((s) => s.setSelectedSeriesId);
  const setPoints = useSessionStore((s) => s.setPoints);

  const axesConfirmed = Boolean(xAxis?.confirmedByUser && yAxis?.confirmedByUser);

  if (!axesConfirmed || seriesList.length === 0) {
    return null; // 아직 축 확인 전이거나 인식된 계열이 없으면 아무것도 보여주지 않는다
  }

  function handleSelect(id: string) {
    if (id === selectedSeriesId) return;
    setSelectedSeriesId(id);
    setPoints([]); // 계열을 바꾸면 이전 계열의 추출 결과는 의미가 없다
  }

  return (
    <section className="flex w-full max-w-md flex-col items-center gap-2 rounded border p-4 text-sm">
      <p className="text-zinc-500">계열 선택</p>
      <div className="flex w-full flex-col gap-2">
        {seriesList.map((series) => (
          <label
            key={series.id}
            className="flex items-center gap-2 rounded border px-3 py-2"
          >
            <input
              type="radio"
              name="series"
              checked={selectedSeriesId === series.id}
              onChange={() => handleSelect(series.id)}
            />
            <span
              className="inline-block h-3 w-3 shrink-0 rounded-full border"
              style={{ backgroundColor: series.colorHex }}
            />
            <span>{series.label}</span>
          </label>
        ))}
      </div>
      <p className="text-xs text-zinc-400">
        한 번에 한 개씩 추출합니다. 다른 선은 나중에 다시 고르면 됩니다.
      </p>
    </section>
  );
}
