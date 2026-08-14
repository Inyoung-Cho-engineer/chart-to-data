'use client';

// 3단계 실패 안내 공용 컴포넌트 (DESIGN.md §3.1·§7). 원본 에러 메시지는 절대 표시하지 않고,
// errors.ts에 미리 정해둔 문구·버튼만 코드로 찾아 보여준다.

import type { AppError } from '@/lib/types';
import { getErrorEntry } from '@/lib/errors';

interface ErrorNoticeProps {
  error: AppError | null;
  onAction?: () => void;
}

export function ErrorNotice({ error, onAction }: ErrorNoticeProps) {
  if (!error) return null;

  const { message, action } = getErrorEntry(error.code);

  return (
    <div
      role="alert"
      className="flex w-full items-center justify-between gap-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      <span>{message}</span>
      {onAction && (
        <button
          type="button"
          onClick={onAction}
          className="shrink-0 rounded-lg border border-red-400 px-2 py-1 font-medium transition-colors hover:bg-red-100"
        >
          {action}
        </button>
      )}
    </div>
  );
}
