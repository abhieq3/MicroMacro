'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { hapticSuccess } from '@/lib/haptics';

/**
 * Quiet milestone acknowledgement.
 *
 * Naval: status is a zero-sum game; wealth/output is positive-sum. Confetti and
 * fanfare train people for status hits. A short, dismissible notice is enough —
 * the work is the reward.
 */

export function Celebration({
  title,
  subtitle,
  onDone,
  duration = 2400,
}: {
  title: string;
  subtitle?: string;
  /** @deprecated ignored — no emoji theater */
  emoji?: string;
  onDone?: () => void;
  duration?: number;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    hapticSuccess();
    const t = setTimeout(() => onDone?.(), duration);
    return () => clearTimeout(t);
  }, [onDone, duration]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed bottom-6 right-6 z-[9997] max-w-sm pointer-events-auto"
      onClick={() => onDone?.()}
      role="status"
      aria-live="polite"
    >
      <div
        className="flex items-start gap-3 rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-[#262624] px-4 py-3 shadow-lg cursor-pointer"
        style={{ animation: 'fade-in-soft-2 0.2s ease-out both' }}
      >
        <span className="mt-0.5 grid h-7 w-7 place-items-center rounded-full bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 shrink-0">
          <Check size={15} strokeWidth={2.5} />
        </span>
        <div className="min-w-0">
          <div className="text-[13px] font-bold text-slate-800 dark:text-white/90 leading-snug">{title}</div>
          {subtitle && (
            <div className="text-[12px] text-slate-500 dark:text-white/45 mt-0.5 leading-snug">{subtitle}</div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
