'use client';

import { BirdEyeIcon } from '@/components/BirdEyeIcon';

/**
 * Standardised trigger for the Bird's-Eye view. Same icon, same dimensions
 * everywhere in the app — so the feature is recognisable across Dashboard,
 * project pages and team pages. (No attention blink: the icon sits quietly
 * and is discovered through use, keeping the surface calm.)
 */
export function BirdEyeButton({
  onClick,
  scopeKey: _scopeKey = 'default',
  size = 18,
  label,
  className = '',
}: {
  onClick: () => void;
  /** Retained for call-site compatibility; no longer used. */
  scopeKey?: string;
  size?: number;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Bird's-eye view"
      aria-label="Open bird's-eye view"
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg px-2.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-white/60 dark:hover:text-white dark:hover:bg-white/[0.06] transition-colors ${className}`.trim()}
    >
      <BirdEyeIcon size={size} />
      {label && <span className="text-sm font-semibold">{label}</span>}
    </button>
  );
}
