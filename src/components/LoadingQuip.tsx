'use client';

/** Single plain status line under skeletons. No slogans. */
export function LoadingQuip() {
  return (
    <div className="flex items-center gap-2 text-[12px] text-zinc-500 dark:text-white/30 select-none">
      <span aria-hidden className="inline-block w-1 h-1 rounded-full bg-current opacity-60" />
      Loading…
    </div>
  );
}

export const QUIP_NAME_KEY = 'pragati-quip-name';
