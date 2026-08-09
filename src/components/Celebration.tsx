'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, PartyPopper, Sparkles } from 'lucide-react';
import { hapticCelebrate, hapticVictory } from '@/lib/haptics';

/**
 * Milestone celebration — earned, not constant.
 *
 * - phase: medium toast + sparkle burst + celebrate haptic
 * - project: full-screen confetti rain + centered card + victory haptic
 *
 * Respects prefers-reduced-motion (no particles, quiet card only).
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
};

const PHASE_COLORS = ['#1565C0', '#2E7D32', '#10b981', '#34d399', '#60a5fa', '#fbbf24'];
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
];

function prefersReducedMotion(): boolean {
  try {
    return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function makeParticles(count: number, colors: string[]): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.45,
    duration: 1.6 + Math.random() * 1.8,
    size: 5 + Math.random() * 7,
    color: colors[i % colors.length],
    rotate: Math.random() * 360,
    shape: (['rect', 'circle', 'diamond'] as const)[i % 3],
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
  const holdMs = duration ?? (isProject ? 4200 : 2800);
  const [mounted, setMounted] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  const particles = useMemo(() => {
    if (typeof window === 'undefined') return [] as Particle[];
    if (prefersReducedMotion()) return [];
    return makeParticles(isProject ? 72 : 28, isProject ? PROJECT_COLORS : PHASE_COLORS);
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
        className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 shadow-xl ${
          isProject
            ? 'border-emerald-300/80 dark:border-emerald-400/30 bg-white/95 dark:bg-[#1f1f1d]/95 backdrop-blur-md'
            : 'border-emerald-200/90 dark:border-emerald-500/25 bg-white dark:bg-[#262624]'
        }`}
        style={{
          animation: reduceMotion ? undefined : 'celebration-pop 0.45s cubic-bezier(0.22, 1, 0.36, 1) both',
        }}
      >
        <span
          className={`mt-0.5 grid place-items-center rounded-full shrink-0 ${
            isProject
              ? 'h-11 w-11 bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-md shadow-emerald-500/30'
              : 'h-8 w-8 bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-200'
          }`}
        >
          {isProject ? <PartyPopper size={20} strokeWidth={2.2} /> : <Sparkles size={15} strokeWidth={2.4} />}
        </span>
        <div className="min-w-0 flex-1">
          <div
            className={`font-bold text-slate-900 dark:text-white/95 leading-snug tracking-tight ${
              isProject ? 'text-[16px]' : 'text-[13px]'
            }`}
          >
            {title}
          </div>
          {subtitle && (
            <div
              className={`text-slate-500 dark:text-white/50 mt-0.5 leading-snug ${
                isProject ? 'text-[13px]' : 'text-[12px]'
              }`}
            >
              {subtitle}
            </div>
          )}
          {isProject && (
            <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300/90">
              <Check size={12} strokeWidth={2.5} />
              Every task closed
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
              className="celebration-confetti absolute top-[-12px] block"
              style={{
                left: `${p.left}%`,
                width: p.size,
                height: p.shape === 'rect' ? p.size * 0.45 : p.size,
                background: p.color,
                borderRadius,
                transform: p.shape === 'diamond' ? `rotate(45deg)` : `rotate(${p.rotate}deg)`,
                animation: `confetti-fall ${p.duration}s linear ${p.delay}s both`,
                opacity: 0.92,
                boxShadow: isProject ? `0 0 6px ${p.color}55` : undefined,
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
              : 'radial-gradient(ellipse at center, rgba(16,185,129,0.12) 0%, transparent 65%)',
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
