'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, PartyPopper, Sparkles } from 'lucide-react';
import { hapticCelebrate, hapticVictory } from '@/lib/haptics';

/**
 * Milestone celebration — earned, not constant. Tuned hard:
 * - phase: dense side confetti + celebrate haptic
 * - project: two-wave full-screen confetti + center card + victory haptic
 */

export type CelebrationLevel = 'phase' | 'project';

type Particle = {
  id: number;
  left: number;
  delay: number;
  duration: number;
  size: number;
  color: string;
  rotate: number;
  shape: 'rect' | 'circle' | 'diamond';
  wave: number;
};

const PHASE_COLORS = ['#1565C0', '#2E7D32', '#10b981', '#34d399', '#60a5fa', '#fbbf24', '#22d3ee'];
const PROJECT_COLORS = [
  '#1565C0',
  '#2E7D32',
  '#10b981',
  '#34d399',
  '#60a5fa',
  '#fbbf24',
  '#f472b6',
  '#a78bfa',
  '#fb7185',
  '#22d3ee',
  '#facc15',
  '#4ade80',
];

function prefersReducedMotion(): boolean {
  try {
    return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function makeParticles(count: number, colors: string[], wave = 0, delayBase = 0): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: wave * 1000 + i,
    left: Math.random() * 100,
    delay: delayBase + Math.random() * 0.55,
    duration: 1.9 + Math.random() * 2.2,
    size: 6 + Math.random() * 10,
    color: colors[i % colors.length],
    rotate: Math.random() * 360,
    shape: (['rect', 'circle', 'diamond'] as const)[i % 3],
    wave,
  }));
}

export function Celebration({
  title,
  subtitle,
  level = 'phase',
  onDone,
  duration,
}: {
  title: string;
  subtitle?: string;
  /** @deprecated ignored — level drives presentation */
  emoji?: string;
  level?: CelebrationLevel;
  onDone?: () => void;
  duration?: number;
}) {
  const isProject = level === 'project';
  const holdMs = duration ?? (isProject ? 5600 : 3400);
  const [mounted, setMounted] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  const particles = useMemo(() => {
    if (typeof window === 'undefined') return [] as Particle[];
    if (prefersReducedMotion()) return [];
    if (isProject) {
      // Two waves — first dump, second delayed burst so it stays on screen longer.
      return [
        ...makeParticles(95, PROJECT_COLORS, 0, 0),
        ...makeParticles(55, PROJECT_COLORS, 1, 0.85),
      ];
    }
    return makeParticles(48, PHASE_COLORS, 0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProject, title]);

  useEffect(() => {
    setMounted(true);
    const reduced = prefersReducedMotion();
    setReduceMotion(reduced);
    if (isProject) hapticVictory();
    else hapticCelebrate();
    const t = setTimeout(() => onDone?.(), holdMs);
    return () => clearTimeout(t);
  }, [onDone, holdMs, isProject]);

  if (!mounted) return null;

  const card = (
    <div
      className={`pointer-events-auto cursor-pointer ${
        isProject
          ? 'mx-auto max-w-md w-[min(92vw,28rem)]'
          : 'fixed bottom-6 right-6 z-[9998] max-w-sm'
      }`}
      onClick={() => onDone?.()}
      role="status"
      aria-live="polite"
    >
      <div
        className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 shadow-2xl ${
          isProject
            ? 'border-emerald-300/90 dark:border-emerald-400/40 bg-white/97 dark:bg-[#1f1f1d]/97 backdrop-blur-md ring-2 ring-emerald-400/25'
            : 'border-emerald-200/90 dark:border-emerald-500/30 bg-white dark:bg-[#262624] ring-1 ring-emerald-400/15'
        }`}
        style={{
          animation: reduceMotion
            ? undefined
            : isProject
              ? 'celebration-pop-hard 0.55s cubic-bezier(0.22, 1, 0.36, 1) both'
              : 'celebration-pop 0.45s cubic-bezier(0.22, 1, 0.36, 1) both',
        }}
      >
        <span
          className={`mt-0.5 grid place-items-center rounded-full shrink-0 ${
            isProject
              ? 'h-12 w-12 bg-gradient-to-br from-emerald-400 via-teal-500 to-blue-600 text-white shadow-lg shadow-emerald-500/40'
              : 'h-9 w-9 bg-emerald-100 dark:bg-emerald-500/25 text-emerald-800 dark:text-emerald-200'
          }`}
        >
          {isProject ? <PartyPopper size={22} strokeWidth={2.2} /> : <Sparkles size={16} strokeWidth={2.4} />}
        </span>
        <div className="min-w-0 flex-1">
          <div
            className={`font-bold text-slate-900 dark:text-white/95 leading-snug tracking-tight ${
              isProject ? 'text-[17px]' : 'text-[14px]'
            }`}
          >
            {title}
          </div>
          {subtitle && (
            <div
              className={`text-slate-500 dark:text-white/50 mt-0.5 leading-snug ${
                isProject ? 'text-[13.5px]' : 'text-[12px]'
              }`}
            >
              {subtitle}
            </div>
          )}
          {isProject && (
            <div className="mt-2.5 inline-flex items-center gap-1.5 text-[11.5px] font-bold text-emerald-700 dark:text-emerald-300">
              <Check size={13} strokeWidth={2.5} />
              Every task closed — project clear
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const confettiLayer =
    !reduceMotion && particles.length > 0 ? (
      <div className="fixed inset-0 z-[9997] pointer-events-none overflow-hidden" aria-hidden>
        {particles.map((p) => {
          const borderRadius =
            p.shape === 'circle' ? '9999px' : p.shape === 'diamond' ? '2px' : '1px';
          return (
            <span
              key={p.id}
              className="celebration-confetti absolute top-[-16px] block"
              style={{
                left: `${p.left}%`,
                width: p.size,
                height: p.shape === 'rect' ? p.size * 0.42 : p.size,
                background: p.color,
                borderRadius,
                transform: p.shape === 'diamond' ? `rotate(45deg)` : `rotate(${p.rotate}deg)`,
                animation: `confetti-fall ${p.duration}s linear ${p.delay}s both`,
                opacity: 0.95,
                boxShadow: `0 0 ${isProject ? 8 : 5}px ${p.color}66`,
              }}
            />
          );
        })}
      </div>
    ) : null;

  if (isProject) {
    return createPortal(
      <>
        {confettiLayer}
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center p-4 pointer-events-none"
          style={{
            background: reduceMotion
              ? 'transparent'
              : 'radial-gradient(ellipse at center, rgba(16,185,129,0.22) 0%, rgba(21,101,192,0.08) 45%, transparent 70%)',
          }}
        >
          <div className="pointer-events-auto w-full flex justify-center">{card}</div>
        </div>
      </>,
      document.body,
    );
  }

  return createPortal(
    <>
      {confettiLayer}
      {card}
    </>,
    document.body,
  );
}
