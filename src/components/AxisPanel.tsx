'use client';

// DESIGN.md §3.2 ③·§3.4 ③ — 모델이 읽은 축 정보를 사용자가 확인·수정하는 화면.
// 축 유형을 판별하지 못했으면("unknown") 임의로 선형이라 가정하지 않고 사용자가 직접 고르게 한다 (16번).
// 확인하기 전에는 다음 단계(계열 선택·추출)로 넘어갈 수 없다 (15번) — 지금은 "확인했습니다" 버튼으로만 표시한다.

import { useSessionStore } from '@/store/session';
import type { AxisInfo } from '@/lib/types';

function isValidAxis(axis: AxisInfo | null): boolean {
  if (!axis) return false;
  if (axis.type === 'unknown') return false;
  if (!Number.isFinite(axis.min) || !Number.isFinite(axis.max)) return false;
  if (axis.min >= axis.max) return false;
  if (axis.type === 'log' && axis.min <= 0) return false;
  return true;
}

function AxisFields({
  label,
  axis,
  onChange,
}: {
  label: string;
  axis: AxisInfo;
  onChange: (next: AxisInfo) => void;
}) {
  const minMaxInvalid = Number.isFinite(axis.min) && Number.isFinite(axis.max) && axis.min >= axis.max;
  const logInvalid = axis.type === 'log' && axis.min <= 0;

  return (
    <fieldset className="flex w-full flex-col gap-2 rounded border p-3 text-left text-sm">
      <legend className="px-1 font-medium">{label}</legend>

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-1">
          <input
            type="radio"
            name={`${label}-type`}
            checked={axis.type === 'linear'}
            onChange={() => onChange({ ...axis, type: 'linear', confirmedByUser: false })}
          />
          선형
        </label>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            name={`${label}-type`}
            checked={axis.type === 'log'}
            onChange={() => onChange({ ...axis, type: 'log', confirmedByUser: false })}
          />
          로그
        </label>
        {axis.type === 'unknown' && (
          <span className="text-amber-600">직접 골라주세요</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <label className="w-14 shrink-0">최솟값</label>
        <input
          type="number"
          className="w-full rounded border px-2 py-1"
          value={axis.min}
          onChange={(e) => onChange({ ...axis, min: Number(e.target.value), confirmedByUser: false })}
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="w-14 shrink-0">최댓값</label>
        <input
          type="number"
          className="w-full rounded border px-2 py-1"
          value={axis.max}
          onChange={(e) => onChange({ ...axis, max: Number(e.target.value), confirmedByUser: false })}
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="w-14 shrink-0">단위</label>
        <input
          type="text"
          className="w-full rounded border px-2 py-1"
          value={axis.unit}
          onChange={(e) => onChange({ ...axis, unit: e.target.value, confirmedByUser: false })}
        />
      </div>

      {minMaxInvalid && (
        <p className="text-xs text-red-600">최솟값은 최댓값보다 작아야 합니다.</p>
      )}
      {logInvalid && (
        <p className="text-xs text-red-600">로그 축은 최솟값이 0보다 커야 합니다.</p>
      )}
    </fieldset>
  );
}

export function AxisPanel() {
  const xAxis = useSessionStore((s) => s.xAxis);
  const yAxis = useSessionStore((s) => s.yAxis);
  const setXAxis = useSessionStore((s) => s.setXAxis);
  const setYAxis = useSessionStore((s) => s.setYAxis);

  if (!xAxis || !yAxis) {
    return null; // 아직 판독 결과가 없으면 아무것도 보여주지 않는다
  }

  const canConfirm = isValidAxis(xAxis) && isValidAxis(yAxis);
  const bothConfirmed = xAxis.confirmedByUser && yAxis.confirmedByUser;

  function handleConfirm() {
    if (!xAxis || !yAxis || !canConfirm) return;
    setXAxis({ ...xAxis, confirmedByUser: true });
    setYAxis({ ...yAxis, confirmedByUser: true });
  }

  return (
    <section className="flex w-full max-w-md flex-col items-center gap-3 rounded border p-4 text-sm">
      <p className="text-zinc-500">AI가 읽은 값입니다. 맞는지 확인하고 필요하면 고쳐주세요.</p>

      <AxisFields label="X축" axis={xAxis} onChange={setXAxis} />
      <AxisFields label="Y축" axis={yAxis} onChange={setYAxis} />

      <button
        type="button"
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-40"
        onClick={handleConfirm}
        disabled={!canConfirm}
      >
        확인했습니다
      </button>

      {bothConfirmed && (
        <p className="text-green-600">축 확인 완료 — 다음 단계에서 계열을 선택합니다.</p>
      )}
    </section>
  );
}
