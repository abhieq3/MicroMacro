'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/client/api';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  CalendarClock,
  Timer,
  Gauge,
  AlertTriangle,
  Sparkles,
  ChevronDown,
} from 'lucide-react';

/**
 * Delivery Foresight — the quiet surface over a deliberately heavy engine
 * (src/lib/ai/deliveryForesight.ts). Collapsed by default to a single
 * milestone line (the reliability achievement + status); the full forecast —
 * reliability ring, verdict, metric line, throughput sparkline, riskiest task
 * — expands on hover (and on tap/click, for touch). Minimal until you want it.
 *
 * Two shapes, decided server-side by the viewer:
 *   • self      — the full forecast (plate-clear date, the riskiest task).
 *   • colleague — a redacted "delivery rhythm" read (no current-workload data).
 *
 * Everything shown is computed deterministically from the person's own
 * delivered-work history; there is no LLM on this path.
 */

type SelfForesight = {
  self: true;
  hasSignal: boolean;
  confidence: 'low' | 'medium' | 'high';
  status: 'building' | 'on_track' | 'at_risk' | 'overloaded' | 'cooling' | 'clear';
  headline: string;
  reliability: number;
  reliabilityLabel: string;
  onTimeRate: number;
  typicalTurnaroundDays: number | null;
  throughputPerWeek: number;
  trend: 'rising' | 'steady' | 'cooling';
  peakDay: string | null;
  openTasks: number;
  tasksAtRisk: number;
  clearDateP80: string | null;
  clearDays: number | null;
  topRisk: { id: string; title: string; slipProb: number; daysToDue: number | null } | null;
  spark: number[];
  samples: number;
};

type PublicForesight = {
  self: false;
  hasSignal: boolean;
  confidence: 'low' | 'medium' | 'high';
  publicHeadline: string;
  reliability: number;
  reliabilityLabel: string;
  onTimeRate: number;
  typicalTurnaroundDays: number | null;
  throughputPerWeek: number;
  trend: 'rising' | 'steady' | 'cooling';
  peakDay: string | null;
  spark: number[];
  samples: number;
};

type Data = SelfForesight | PublicForesight;

// Status → visual accent. Kept muted; the card states a fact, it doesn't alarm.
const STATUS_STYLE: Record<SelfForesight['status'], { label: string; fg: string; bg: string; ring: string }> =
  {
    building: { label: 'Calibrating', fg: '#64748b', bg: '#f1f5f9', ring: '#cbd5e1' },
    on_track: { label: 'On track', fg: '#047857', bg: '#ecfdf5', ring: '#34d399' },
    clear: { label: 'Plate clear', fg: '#0369a1', bg: '#eff6ff', ring: '#38bdf8' },
    at_risk: { label: 'At risk', fg: '#b45309', bg: '#fffbeb', ring: '#fbbf24' },
    overloaded: { label: 'Overloaded', fg: '#be123c', bg: '#fff1f2', ring: '#fb7185' },
    cooling: { label: 'Cooling', fg: '#475569', bg: '#f8fafc', ring: '#94a3b8' },
  };

function ringColor(score: number): string {
  if (score >= 80) return '#16a34a';
  if (score >= 65) return '#0d9488';
  if (score >= 50) return '#2563eb';
  if (score >= 35) return '#d97706';
  return '#94a3b8';
}

/* A compact circular reliability gauge — pure inline SVG, no dependency. */
function ReliabilityRing({ score, label }: { score: number; label: string }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const color = ringColor(score);
  return (
    <div className="flex flex-col items-center gap-1 shrink-0">
      <div className="relative" style={{ width: 76, height: 76 }}>
        <svg width={76} height={76} className="-rotate-90">
          <circle
            cx={38}
            cy={38}
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth={6}
            className="text-slate-100 dark:text-white/10"
          />
          <circle
            cx={38}
            cy={38}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={6}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - pct)}
            style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[19px] font-black leading-none tabular-nums text-slate-800 dark:text-white">
            {score}
          </span>
          <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400 leading-none mt-0.5">
            / 100
          </span>
        </div>
      </div>
      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color }}>
        {label}
      </span>
    </div>
  );
}

/* Tiny throughput sparkline (weekly completions, oldest→newest). */
function Sparkline({ data }: { data: number[] }) {
  if (!data || data.length < 2) return null;
  const w = 132;
  const h = 30;
  const max = Math.max(1, ...data);
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * (h - 4) - 2).toFixed(1)}`);
  const last = data[data.length - 1];
  const lastX = (data.length - 1) * step;
  const lastY = h - (last / max) * (h - 4) - 2;
  return (
    <svg width={w} height={h} className="overflow-visible" aria-hidden>
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke="#3b82f6"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r={2.5} fill="#3b82f6" />
    </svg>
  );
}

function TrendChip({ trend }: { trend: 'rising' | 'steady' | 'cooling' }) {
  const map = {
    rising: { Icon: TrendingUp, text: 'Accelerating', cls: 'text-emerald-600' },
    steady: { Icon: Minus, text: 'Steady', cls: 'text-slate-500' },
    cooling: { Icon: TrendingDown, text: 'Easing', cls: 'text-amber-600' },
  } as const;
  const { Icon, text, cls } = map[trend];
  return (
    <span className={`inline-flex items-center gap-1 ${cls}`}>
      <Icon size={12} /> {text}
    </span>
  );
}

function Metric({ icon: Icon, children }: { icon: typeof Timer; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-slate-500 dark:text-white/50">
      <Icon size={12} className="text-slate-300 dark:text-white/25" /> {children}
    </span>
  );
}

function fmtClear(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function DeliveryForesight({ userId, isSelf }: { userId: string; isSelf: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  // Collapsed by default; hover peeks the full forecast, a click pins it open
  // (so touch devices — which have no hover — can expand it too).
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hovered || pinned;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api<Data>(`/users/${userId}/foresight`)
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => {
        if (alive) setFailed(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  // A colleague with no readable rhythm yet → render nothing (no empty shell).
  if (failed) return null;
  if (!loading && data && !data.self && !data.hasSignal) return null;

  const accent = data && data.self ? STATUS_STYLE[data.status] : STATUS_STYLE.on_track;
  const ringFg = data ? ringColor(data.reliability) : '#94a3b8';

  // ── Loading: a single quiet line, not a full skeleton card ───────────────
  if (loading || !data) {
    return (
      <section className="card overflow-hidden p-0 fade-up-stagger" style={{ animationDelay: '80ms' }}>
        <div className="flex items-center gap-2.5 px-4 py-3">
          <span className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-white/5 animate-pulse shrink-0" />
          <span className="h-3.5 w-40 rounded bg-slate-100 dark:bg-white/5 animate-pulse" />
          <span className="ml-auto h-3.5 w-20 rounded bg-slate-100 dark:bg-white/5 animate-pulse" />
        </div>
      </section>
    );
  }

  return (
    <section
      className="card overflow-hidden p-0 fade-up-stagger"
      style={{ animationDelay: '80ms' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        aria-hidden
        className="h-[3px] w-full"
        style={{ background: `linear-gradient(90deg, ${accent.ring}, ${accent.ring}00)` }}
      />

      {/* ── Collapsed milestone line — the achievement at a glance. The whole
          row is the expand control: hover peeks, click pins. ─────────────── */}
      <button
        type="button"
        onClick={() => setPinned((p) => !p)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
      >
        <span
          className="w-6 h-6 rounded-lg grid place-items-center shrink-0"
          style={{ background: accent.bg, color: accent.fg }}
        >
          <Sparkles size={13} />
        </span>
        <span className="text-[13px] font-bold text-slate-800 dark:text-white leading-tight shrink-0">
          Delivery Foresight
        </span>
        {/* The milestone: reliability score + its plain-language label. */}
        <span className="inline-flex items-baseline gap-1 shrink-0">
          <span className="text-[14px] font-black tabular-nums leading-none" style={{ color: ringFg }}>
            {data.reliability}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: ringFg }}>
            {data.reliabilityLabel}
          </span>
        </span>
        <span className="ml-auto flex items-center gap-2 shrink-0">
          {data.self && (
            <span
              className="hidden sm:inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
              style={{ background: accent.bg, color: accent.fg }}
            >
              {accent.label}
            </span>
          )}
          <ChevronDown
            size={15}
            className={`text-slate-300 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          />
        </span>
      </button>

      {/* ── Expanded forecast — the full read, revealed on hover/click ─────── */}
      <div
        className={`grid transition-all duration-300 ease-out ${
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-4 pt-1">
            <p className="text-[10.5px] text-slate-400 leading-snug mb-3">
              {isSelf
                ? 'A forecast from how you actually deliver — not a stat sheet.'
                : 'Delivery rhythm, learned from completed work.'}
            </p>
            <div className="flex items-start gap-5">
              <ReliabilityRing score={data.reliability} label={data.reliabilityLabel} />

              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-semibold text-slate-700 dark:text-white/80 leading-snug">
                  {data.self ? data.headline : data.publicHeadline}
                </p>

                {/* Thin metric line — the few numbers that matter, never a wall. */}
                <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] font-medium">
                  {data.typicalTurnaroundDays != null && (
                    <Metric icon={Timer}>~{data.typicalTurnaroundDays}d turnaround</Metric>
                  )}
                  <Metric icon={Gauge}>{data.throughputPerWeek}/wk</Metric>
                  <span className="inline-flex items-center">
                    <TrendChip trend={data.trend} />
                  </span>
                  {data.self && data.clearDateP80 && (
                    <Metric icon={CalendarClock}>clears ~{fmtClear(data.clearDateP80)}</Metric>
                  )}
                  {data.peakDay && (
                    <span className="text-slate-400 dark:text-white/40">peak {data.peakDay}s</span>
                  )}
                </div>

                {/* Sparkline of recent weekly throughput. */}
                {data.spark && data.spark.some((v) => v > 0) && (
                  <div className="mt-3 flex items-end gap-2">
                    <Sparkline data={data.spark} />
                    <span className="text-[9px] text-slate-300 dark:text-white/25 mb-0.5 leading-none">
                      12-wk output
                    </span>
                  </div>
                )}

                {/* Self only: the single riskiest task, when there is one. */}
                {data.self && data.topRisk && data.status === 'at_risk' && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200/70 dark:border-amber-400/20 bg-amber-50/60 dark:bg-amber-500/[0.07] px-3 py-2">
                    <AlertTriangle size={14} className="text-amber-500 shrink-0" />
                    <span className="text-[12px] text-slate-600 dark:text-white/70 min-w-0">
                      <span className="font-semibold truncate">{data.topRisk.title}</span>
                      <span className="text-slate-400">
                        {' '}
                        · {Math.round(data.topRisk.slipProb * 100)}% to slip — start it first
                      </span>
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
