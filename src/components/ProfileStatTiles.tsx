'use client';
import { useState, useEffect } from 'react';
import { CheckCircle2, CalendarRange, FolderKanban } from 'lucide-react';
import { api } from '@/lib/client/api';

/**
 * The profile "impact" row — four delivery figures (all-time done, this year,
 * projects contributed to, active-day streak) as gradient-accented tiles with
 * a count-up animation. Shared by the public profile (/[username]) and the
 * owner's own Settings profile, so both read the same way.
 */

export interface ProfileStats {
  totalDone: number;
  doneThisYear: number;
  projectCount: number;
  streak: number;
}

/* Animate a number from 0 → target on mount (easeOutCubic). Honours
   prefers-reduced-motion by jumping straight to the value, so the figure is
   never withheld from anyone who's opted out of motion. */
function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
}

type StatTileData = {
  label: string;
  value: number;
  sub: string;
  icon: typeof CheckCircle2;
  color: string;
  bg: string;
};

/* A single impact figure — gradient accent line, tinted icon chip and a
   counting-up number. Staggered in via the shared .fade-up-stagger utility so
   the row reveals left-to-right as the profile settles. */
function StatTile({ s, index }: { s: StatTileData; index: number }) {
  const shown = useCountUp(s.value);
  return (
    <div
      className="card fade-up-stagger relative overflow-hidden p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
      style={{ animationDelay: `${120 + index * 70}ms` }}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ background: `linear-gradient(90deg, ${s.color}, ${s.color}00)` }}
      />
      <div className="flex items-center gap-2">
        <span
          className="w-8 h-8 rounded-xl grid place-items-center shrink-0"
          style={{ background: s.bg, color: s.color }}
        >
          <s.icon size={15} />
        </span>
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{s.label}</span>
      </div>
      <div className="mt-3 text-[26px] leading-none font-black text-slate-900 dark:text-white tabular-nums">
        {shown}
      </div>
      <div className="text-[11px] text-slate-400 mt-1">{s.sub}</div>
    </div>
  );
}

export function ProfileStatTiles({ stats }: { stats: ProfileStats }) {
  const tiles: StatTileData[] = [
    {
      label: 'Delivered',
      value: stats.totalDone,
      sub: 'tasks all-time',
      icon: CheckCircle2,
      color: '#16a34a',
      bg: '#f0fdf4',
    },
    {
      label: 'This year',
      value: stats.doneThisYear,
      sub: new Date().getFullYear().toString(),
      icon: CalendarRange,
      color: '#1565C0',
      bg: '#eff6ff',
    },
    {
      label: 'Projects',
      value: stats.projectCount,
      sub: 'contributed to',
      icon: FolderKanban,
      color: '#7B1FA2',
      bg: '#f3e5f5',
    },
  ];
  return (
    <div className="grid grid-cols-3 gap-3">
      {tiles.map((s, i) => (
        <StatTile key={s.label} s={s} index={i} />
      ))}
    </div>
  );
}

/**
 * The signed-in member's own impact tiles, self-fetched from /users/me/stats —
 * so the Settings profile reads as richly as the public one without the parent
 * page having to thread the numbers through. Shows a quiet skeleton until the
 * counts land, then the same animated tiles.
 */
export function SelfImpactTiles() {
  const [stats, setStats] = useState<ProfileStats | null>(null);
  useEffect(() => {
    let alive = true;
    api<{ totalDone?: number; doneThisYear?: number; projectCount?: number; streak?: number }>(
      '/users/me/stats',
    )
      .then((s) => {
        if (!alive) return;
        setStats({
          totalDone: s.totalDone || 0,
          doneThisYear: s.doneThisYear || 0,
          projectCount: s.projectCount || 0,
          streak: s.streak || 0,
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!stats) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card h-[96px] animate-pulse bg-slate-50 dark:bg-white/[0.03]" />
        ))}
      </div>
    );
  }
  return <ProfileStatTiles stats={stats} />;
}
