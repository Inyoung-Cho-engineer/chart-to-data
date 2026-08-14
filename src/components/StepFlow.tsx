'use client';

// 순수 스타일링용 화면 흐름 컴포넌트 — page.tsx가 5단계(①업로드~⑤추출) 진행 상태를 보여주고,
// 끝난 단계는 접힌 요약 줄로, 진행 중인 단계는 펼쳐서 보여주도록 감싸는 껍데기다.
// 비즈니스 로직(검증 규칙·API 호출·store 흐름)은 건드리지 않고, 각 Panel을 감싸기만 한다.

import { useState, type ReactNode } from 'react';

const STEP_LABELS = ['업로드', '영역 지정', '축 확인', '계열 선택', '추출'];

interface StepIndicatorProps {
  currentStep: number; // 1~5
}

export function StepIndicator({ currentStep }: StepIndicatorProps) {
  return (
    <ol className="flex w-full max-w-3xl items-center justify-center gap-1 sm:gap-3">
      {STEP_LABELS.map((label, i) => {
        const step = i + 1;
        const done = step < currentStep;
        const active = step === currentStep;
        return (
          <li key={label} className="flex flex-1 items-center gap-1 sm:gap-2">
            <div className="flex flex-col items-center gap-1">
              <span
                className={
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ' +
                  (done
                    ? 'bg-steel text-white'
                    : active
                      ? 'bg-navy text-white'
                      : 'bg-card text-slate-400')
                }
              >
                {done ? '✓' : step}
              </span>
              <span
                className={
                  'hidden text-center text-[11px] sm:block ' +
                  (active ? 'font-medium text-navy' : 'text-slate-400')
                }
              >
                {label}
              </span>
            </div>
            {step < STEP_LABELS.length && (
              <div className={'h-px flex-1 ' + (done ? 'bg-steel' : 'bg-slate-200')} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

interface StepSectionProps {
  step: number;
  title: string;
  done: boolean;
  summary?: string;
  children: ReactNode;
}

// done이 true가 되면 기본적으로 접히고, 요약 줄만 보인다. 요약 줄을 누르면 다시 펼쳐서 고칠 수 있다.
export function StepSection({ step, title, done, summary, children }: StepSectionProps) {
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const open = manualOpen ?? !done;

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setManualOpen(!open)}
        className={
          'flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm ' +
          (done ? 'text-slate-500 hover:bg-card' : 'cursor-default text-navy')
        }
        disabled={!done}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={
              'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ' +
              (done ? 'bg-steel text-white' : 'bg-navy text-white')
            }
          >
            {done ? '✓' : step}
          </span>
          <span className="truncate font-medium">
            {done && !open && summary ? summary : title}
          </span>
        </span>
        {done && <span className="shrink-0 text-xs">{open ? '접기 ▲' : '펼치기 ▼'}</span>}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}
