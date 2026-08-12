'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { playVictory } from '@/lib/sound';

/**
 * Project-clear surprise. Task done is a toast. Phase done is a card.
 * This is the one that should make someone actually look up.
 *
 * Three surprise skins — picked once per fire so you never know which
 * show you're getting. Click anywhere to dismiss.
 */

const NOODLE_COLORS = ['#1565C0', '#2E7D32', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f472b6', '#fbbf24'];
const SURPRISES = ['spaghetti', 'launch', 'burst'] as const;
type Surprise = (typeof SURPRISES)[number];

function pickSurprise(): Surprise {
  return SURPRISES[Math.floor(Math.random() * SURPRISES.length)];
}

function Noodle({ i }: { i: number }) {
  const left = (i * 37 + 11) % 100;
  const delay = (i % 18) * 0.07;
  const dur = 2.8 + ((i * 13) % 20) / 10;
  const width = 4 + (i % 3);
  const height = 70 + (i % 7) * 18;
  const color = NOODLE_COLORS[i % NOODLE_COLORS.length];
  const sway = i % 2 === 0 ? 1 : -1;
  return (
    <span
      aria-hidden
      className="absolute top-[-12vh] rounded-full"
      style={{
        left: `${left}%`,
        width,
        height,
        background: `linear-gradient(180deg, ${color}, ${color}99)`,
        transformOrigin: 'center top',
        animation: `spaghetti-fall ${dur}s cubic-bezier(0.2,0.1,0.4,1) ${delay}s forwards`,
        ['--sway' as string]: `${sway * (18 + (i % 12))}deg`,
        boxShadow: `0 0 10px ${color}55`,
      }}
    />
  );
}

function Spark({ i }: { i: number }) {
  const angle = (i / 48) * Math.PI * 2;
  const dist = 40 + (i % 7) * 8;
  const color = NOODLE_COLORS[i % NOODLE_COLORS.length];
  return (
    <span
      aria-hidden
      className="absolute left-1/2 top-1/2 h-2 w-2 rounded-full"
      style={{
        background: color,
        animation: `burst-out 1.6s cubic-bezier(0.1,0.7,0.2,1) ${i * 0.012}s both`,
        ['--tx' as string]: `${Math.cos(angle) * dist}vw`,
        ['--ty' as string]: `${Math.sin(angle) * dist}vh`,
      }}
    />
  );
}

export function ProjectClearSurprise({
  title,
  subtitle,
  onDone,
}: {
  title: string;
  subtitle?: string;
  onDone?: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const surprise = useMemo(pickSurprise, []);

  useEffect(() => {
    setMounted(true);
    playVictory();
    const t = setTimeout(() => onDone?.(), 7800);
    return () => clearTimeout(t);
  }, [onDone]);

  if (!mounted) return null;

  const tag =
    surprise === 'spaghetti' ? 'The whole plate is clear.' : surprise === 'launch' ? 'Cleared for launch.' : 'Board empty.';

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center overflow-hidden"
      onClick={() => onDone?.()}
      role="status"
      aria-live="polite"
      style={{
        background:
          surprise === 'launch'
            ? 'radial-gradient(circle at 50% 70%, #0d47a1 0%, #050b18 62%)'
            : surprise === 'burst'
              ? 'radial-gradient(circle at 50% 50%, #1b3a1d 0%, #07110a 65%)'
              : 'radial-gradient(circle at 50% 30%, #1a237e 0%, #0a0e1a 70%)',
      }}
    >
      {surprise === 'spaghetti' && (
        <div className="absolute inset-0 pointer-events-none">
          {Array.from({ length: 72 }).map((_, i) => (
            <Noodle key={i} i={i} />
          ))}
        </div>
      )}

      {surprise === 'launch' && (
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute left-1/2 bottom-[18%] h-40 w-4 -translate-x-1/2 rounded-full"
            style={{
              background: 'linear-gradient(180deg, #fff 0%, #90caf9 40%, #1565C0 100%)',
              animation: 'rocket-up 1.8s cubic-bezier(0.2,0.8,0.2,1) both',
              boxShadow: '0 0 30px #42a5f5',
            }}
          />
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-sky-300/50"
              style={{
                width: 80 + i * 90,
                height: 80 + i * 90,
                animation: `shockwave 2.2s ease-out ${i * 0.22}s both`,
              }}
            />
          ))}
        </div>
      )}

      {surprise === 'burst' && (
        <div className="absolute inset-0 pointer-events-none">
          {Array.from({ length: 48 }).map((_, i) => (
            <Spark key={i} i={i} />
          ))}
        </div>
      )}

      <div
        className="relative z-10 mx-4 max-w-lg text-center px-8 py-10 rounded-[28px] border border-white/15 bg-white/[0.07] backdrop-blur-md"
        style={{ animation: 'celebration-pop 0.7s cubic-bezier(0.22,1,0.36,1) both' }}
      >
        <div className="text-[11px] font-black uppercase tracking-[0.28em] text-amber-300/90">{tag}</div>
        <h2 className="mt-3 font-display text-[2rem] sm:text-[2.4rem] font-black tracking-tight text-white leading-tight">
          {title}
        </h2>
        {subtitle && <p className="mt-3 text-[15px] text-white/70 leading-relaxed">{subtitle}</p>}
        <p className="mt-6 text-[11px] font-semibold uppercase tracking-wider text-white/35">Tap anywhere</p>
      </div>
    </div>,
    document.body,
  );
}
