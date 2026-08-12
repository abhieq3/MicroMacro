'use client';
import { useEffect, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { api } from '@/lib/client/api';

/**
 * The single, quiet surface of the project finish-date forecast. All the heavy
 * probabilistic work happens server-side (see lib/ai/projectForecast.ts); here
 * the user just sees an estimated finish date, tinted by how it sits against
 * the committed due date. The full picture (80%/90% dates, the long pole, the
 * confidence) lives in the hover tooltip — present when wanted, invisible when
 * not.
 */

type Forecast = {
  ok: boolean;
  reason?: string;
  p50?: string;
  p80?: string;
  p90?: string;
  /** Speed of light — theoretical fastest finish with zero queueing. */
  sol?: string;
  longPole?: { kind: string; label: string; share: number } | null;
  confidence?: 'high' | 'medium' | 'low';
  vsTarget?: 'on_track' | 'tight' | 'at_risk' | null;
  targetDate?: string | null;
};

const TONE: Record<string, { ring: string; bg: string; text: string }> = {
  on_track: {
    ring: 'border-emerald-200 dark:border-emerald-500/30',
    bg: 'bg-emerald-50/70 dark:bg-emerald-500/10',
    text: 'text-emerald-700 dark:text-emerald-400',
  },
  tight: {
    ring: 'border-amber-200 dark:border-amber-500/30',
    bg: 'bg-amber-50/70 dark:bg-amber-500/10',
    text: 'text-amber-700 dark:text-amber-400',
  },
  at_risk: {
    ring: 'border-red-200 dark:border-red-500/30',
    bg: 'bg-red-50/70 dark:bg-red-500/10',
    text: 'text-red-700 dark:text-red-400',
  },
  neutral: {
    ring: 'border-slate-200 dark:border-white/10',
    bg: 'bg-slate-50 dark:bg-white/[0.04]',
    text: 'text-slate-600 dark:text-white/70',
  },
};

function fmt(iso?: string): string {
  return iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
}
function targetLabel(v?: string | null): string {
  return v === 'on_track' ? 'on track' : v === 'tight' ? 'tight' : v === 'at_risk' ? 'at risk' : '';
}

export function ForecastChip({ projectId }: { projectId: string }) {
  const [f, setF] = useState<Forecast | null>(null);

  useEffect(() => {
    let alive = true;
    api<Forecast>(`/projects/${projectId}/forecast`)
      .then((d) => alive && setF(d))
      .catch(() => alive && setF({ ok: false }));
    return () => {
      alive = false;
    };
  }, [projectId]);

  // Render nothing until we have a real result — this chip sits in the project
  // header's badge row, so a placeholder that later collapses to null would
  // shove the priority/lifecycle badges sideways (a visible layout shift). No
  // space is reserved; the chip simply appears at the end of the row when ready.
  if (!f || !f.ok || !f.p50) return null;

  const tone = TONE[f.vsTarget || 'neutral'] || TONE.neutral;
  const tip = [
    `Likely ~${fmt(f.p50)}  ·  80% by ${fmt(f.p80)}  ·  90% by ${fmt(f.p90)}`,
    // Speed of light: the theoretical fastest finish (no queueing, everyone at
    // their demonstrated-fast pace). The gap to the forecast is the actionable
    // slack — rebalance, unblock, split.
    f.sol ? `Speed of light: ${fmt(f.sol)} — the gap to it is queueing you can act on` : null,
    f.targetDate ? `Target ${fmt(f.targetDate)} — ${targetLabel(f.vsTarget)}` : null,
    f.longPole ? `Long pole: ${f.longPole.label}` : null,
    `Confidence: ${f.confidence}`,
    'Estimated from delivery history — updates as work moves.',
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <span
      title={tip}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold cursor-default ${tone.ring} ${tone.bg} ${tone.text}`}
    >
      <CalendarClock size={13} className="shrink-0" />
      <span className="tabular-nums">~{fmt(f.p50)}</span>
      {f.confidence === 'low' && <span className="text-[10px] opacity-70 font-bold">est.</span>}
    </span>
  );
}
