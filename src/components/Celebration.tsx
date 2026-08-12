'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { playFanfare } from '@/lib/sound';

/**
 * Full-screen milestone celebration — confetti rain + a kudos card — for the
 * moments that deserve a flourish: a phase finished, a project closed out. Fires
 * a fanfare + haptic on show and auto-dismisses. Purely presentational; the
 * caller decides what counts as a milestone.
 */

const CONFETTI_COLORS = ['#1769C8', '#2B8C47', '#fbbf24', '#f472b6', '#38bdf8', '#a78bfa'];

function ConfettiPiece({ i }: { i: number }) {
  // Deterministic-ish spread so pieces fan across the width with varied timing.
  const left = (i * 53) % 100;
  const delay = (i % 10) * 0.12;
  const dur = 2.4 + ((i * 7) % 12) / 10;
  const size = 7 + (i % 4) * 2;
  const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
  const round = i % 3 === 0;
  return (
    <span
      aria-hidden
      style={{
        position: 'absolute',
        top: '-5vh',
        left: `${left}%`,
        width: size,
        height: round ? size : size * 0.5,
        background: color,
        borderRadius: round ? '50%' : 2,
        animation: `confetti-fall ${dur}s cubic-bezier(0.3,0.2,0.4,1) ${delay}s forwards`,
      }}
    />
  );
}

export function Celebration({
  title,
  subtitle,
  emoji = '🎉',
  onDone,
  duration = 3200,
}: {
  title: string;
  subtitle?: string;
  emoji?: string;
  onDone?: () => void;
  duration?: number;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    playFanfare();
    const t = setTimeout(() => onDone?.(), duration);
    return () => clearTimeout(t);
  }, [onDone, duration]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9997] flex items-center justify-center p-4 pointer-events-auto"
      onClick={() => onDone?.()}
      role="status"
      aria-live="polite"
    >
      {/* Confetti layer */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 70 }).map((_, i) => (
          <ConfettiPiece key={i} i={i} />
        ))}
      </div>

      {/* Kudos card */}
      <div
        className="relative bg-white rounded-3xl shadow-2xl border border-slate-100 px-8 py-7 text-center max-w-sm w-full"
        style={{ animation: 'celebration-pop 0.5s cubic-bezier(0.22,1,0.36,1) both' }}
      >
        <div className="text-5xl mb-2 leading-none">{emoji}</div>
        <h2 className="text-xl font-black tracking-tight text-slate-900">{title}</h2>
        {subtitle && <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">{subtitle}</p>}
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-300">
          Tap to dismiss
        </p>
      </div>
    </div>,
    document.body,
  );
}
