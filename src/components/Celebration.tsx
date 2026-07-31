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
        className="flex items-start gap-3 border border-[#2f3336] bg-[#16181c] px-4 py-3 cursor-pointer"
        style={{ borderRadius: 16, boxShadow: '0 0 15px rgba(255,255,255,0.06)' }}
      >
        <span
          className="mt-0.5 grid h-7 w-7 place-items-center text-white bg-[#00ba7c] shrink-0"
          style={{ borderRadius: 9999 }}
        >
          <Check size={14} strokeWidth={2.5} />
        </span>
        <div className="min-w-0">
          <div className="text-[15px] font-bold text-[#e7e9ea] leading-snug">{title}</div>
          {subtitle && (
            <div className="text-[13px] text-[#71767b] mt-0.5 leading-snug">{subtitle}</div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
