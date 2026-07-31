'use client';

import { BirdEyeIcon } from '@/components/BirdEyeIcon';

/** Opens the full project map. */
export function BirdEyeButton({
  onClick,
  scopeKey: _scopeKey = 'default',
  size = 18,
  label,
  className = '',
}: {
  onClick: () => void;
  scopeKey?: string;
  size?: number;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Map"
      aria-label="Open map"
      className={`inline-flex h-8 items-center justify-center gap-2 px-2 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 dark:text-white/50 dark:hover:text-white dark:hover:bg-white/[0.06] transition-colors ${className}`.trim()}
      style={{ borderRadius: 4 }}
    >
      <BirdEyeIcon size={size} />
      {label && <span className="text-sm font-medium">{label}</span>}
    </button>
  );
}
