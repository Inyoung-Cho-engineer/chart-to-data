// 순수 스타일링 공용 클래스 모음 — 여러 Panel 컴포넌트에서 같은 버튼/카드 스타일을 반복하지 않도록 모아둔다.
// 로직은 없고 Tailwind 클래스 문자열만 담는다 (prd_lite.md §5 팔레트: 네이비/스틸블루/앰버).

export const cardClass =
  'w-full rounded-xl border border-slate-200 bg-white p-4 shadow-sm';

export const primaryButtonClass =
  'rounded-lg bg-navy px-4 py-2 font-medium text-white transition-colors hover:bg-navy-hover disabled:cursor-not-allowed disabled:opacity-40';

export const secondaryButtonClass =
  'rounded-lg border border-steel px-4 py-2 font-medium text-navy transition-colors hover:bg-card disabled:cursor-not-allowed disabled:opacity-40';

export const mutedTextClass = 'text-slate-500';
