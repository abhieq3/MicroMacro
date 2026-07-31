'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { hapticSuccess } from '@/lib/haptics';

/** Short bottom-right ack. No confetti. */
export function Celebration({
  title,
  subtitle,
  onDone,
  duration = 2000,
}: {
  title: string;
  subtitle?: string;
  /** @deprecated ignored */
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
        className="flex items-start gap-3 border border-white/12 bg-black px-4 py-3 cursor-pointer"
        style={{ borderRadius: 6 }}
      >
        <span
          className="mt-0.5 grid h-6 w-6 place-items-center text-black bg-white shrink-0"
          style={{ borderRadius: 3 }}
        >
          <Check size={14} strokeWidth={2.5} />
        </span>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-white leading-snug">{title}</div>
          {subtitle && (
            <div className="text-[12px] text-white/45 mt-0.5 leading-snug">{subtitle}</div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
