'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';
import { UserAvatar } from '@/components/AvatarRegistry';
import { Sparkles, TrendingUp, TrendingDown, Minus, AlertTriangle, Gauge } from 'lucide-react';

/**
 * Team Foresight — each member's Delivery Foresight rolled into one capacity
 * read for the lead. Quiet by design: a headline, a status spread, and a
 * member list with the at-risk people floated to the top. Carries no task
 * titles and excludes private/personal work (enforced server-side) — a
 * shared-work outlook only. Rendered for leads/admins only.
 */

type Status = 'building' | 'on_track' | 'at_risk' | 'overloaded' | 'cooling' | 'clear';

type Member = {
  id: string;
  name: string;
  role?: string;
  hasSignal: boolean;
  status: Status;
  reliability: number;
  reliabilityLabel: string;
  trend: 'rising' | 'steady' | 'cooling';
  throughputPerWeek: number;
  openTasks: number;
  tasksAtRisk: number;
  clearDateP80: string | null;
  clearDays: number | null;
};

type Summary = {
  members: Member[];
  headline: string;
  counts: {
    onTrack: number;
    atRisk: number;
    overloaded: number;
    cooling: number;
    clear: number;
    building: number;
  };
  totalAtRisk: number;
  watch: Member[];
  teamThroughputPerWeek: number;
};

const STATUS_STYLE: Record<Status, { label: string; fg: string; bg: string; dot: string }> = {
  building: { label: 'Calibrating', fg: '#64748b', bg: '#f1f5f9', dot: '#cbd5e1' },
  on_track: { label: 'On track', fg: '#047857', bg: '#ecfdf5', dot: '#34d399' },
  clear: { label: 'Clear', fg: '#0369a1', bg: '#eff6ff', dot: '#38bdf8' },
  at_risk: { label: 'At risk', fg: '#b45309', bg: '#fffbeb', dot: '#fbbf24' },
  overloaded: { label: 'Overloaded', fg: '#be123c', bg: '#fff1f2', dot: '#fb7185' },
  cooling: { label: 'Cooling', fg: '#475569', bg: '#f8fafc', dot: '#94a3b8' },
};

// Surface order — the people a lead should look at first.
const SORT_RANK: Record<Status, number> = {
  overloaded: 0,
  at_risk: 1,
  cooling: 2,
  on_track: 3,
  clear: 4,
  building: 5,
};

function fmtClear(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function TrendIcon({ trend }: { trend: Member['trend'] }) {
  if (trend === 'rising') return <TrendingUp size={11} className="text-emerald-500" />;
  if (trend === 'cooling') return <TrendingDown size={11} className="text-amber-500" />;
  return <Minus size={11} className="text-slate-300" />;
}

export function TeamForesight({ teamId }: { teamId: string }) {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api<Summary>(`/teams/${teamId}/foresight`)
      .then((d) => alive && setData(d))
      .catch(() => alive && setFailed(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [teamId]);

  // No members, or the endpoint isn't available to this viewer → render nothing.
  if (failed) return null;
  if (!loading && (!data || data.members.length === 0)) return null;

  const sorted = data
    ? [...data.members].sort(
        (a, b) =>
          SORT_RANK[a.status] - SORT_RANK[b.status] ||
          b.tasksAtRisk - a.tasksAtRisk ||
          (b.clearDays ?? 0) - (a.clearDays ?? 0),
      )
    : [];

  const chips: { label: string; n: number; fg: string; bg: string }[] = data
    ? [
        { label: 'on track', n: data.counts.onTrack + data.counts.clear, ...pick('on_track') },
        { label: 'at risk', n: data.counts.atRisk, ...pick('at_risk') },
        { label: 'overloaded', n: data.counts.overloaded, ...pick('overloaded') },
        { label: 'cooling', n: data.counts.cooling, ...pick('cooling') },
      ].filter((c) => c.n > 0)
    : [];

  return (
    <section className="card overflow-hidden p-0">
      <div
        aria-hidden
        className="h-[3px] w-full"
        style={{ background: 'linear-gradient(90deg,#7c3aed,#7c3aed00)' }}
      />
      <div className="px-5 py-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-7 h-7 rounded-lg grid place-items-center shrink-0 bg-violet-50 text-violet-600">
            <Sparkles size={15} />
          </span>
          <div className="min-w-0">
            <h3 className="text-[14px] font-bold text-slate-800 dark:text-white leading-tight flex items-center gap-2">
              Team Foresight
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-300 dark:text-white/30">
                predictive
              </span>
            </h3>
            <p className="text-[10.5px] text-slate-400 leading-snug">
              Each member’s delivery pace vs. their plate — shared work only.
            </p>
          </div>
          {data && (
            <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-white/50 shrink-0">
              <Gauge size={12} className="text-slate-300" /> {data.teamThroughputPerWeek}/wk
            </span>
          )}
        </div>

        {loading || !data ? (
          <div className="space-y-2">
            <div className="h-3.5 w-2/3 rounded bg-slate-100 dark:bg-white/5 animate-pulse" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-9 rounded bg-slate-50 dark:bg-white/[0.03] animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            <p className="text-[13px] font-semibold text-slate-700 dark:text-white/80 leading-snug">
              {data.headline}
            </p>

            {chips.length > 0 && (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {chips.map((c) => (
                  <span
                    key={c.label}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold"
                    style={{ background: c.bg, color: c.fg }}
                  >
                    {c.n} {c.label}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-3.5 -mx-1 divide-y divide-slate-100 dark:divide-white/[0.06]">
              {sorted.map((m) => {
                const st = STATUS_STYLE[m.status];
                const clear = fmtClear(m.clearDateP80);
                return (
                  <div key={m.id} className="flex items-center gap-2.5 px-1 py-2">
                    <UserAvatar userId={m.id} name={m.name} size={26} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12.5px] font-semibold text-slate-700 dark:text-white/80 truncate">
                          {m.name}
                        </span>
                        <TrendIcon trend={m.trend} />
                      </div>
                      <div className="text-[10.5px] text-slate-400 leading-tight">
                        {!m.hasSignal ? (
                          'Building delivery history'
                        ) : m.openTasks === 0 ? (
                          'Plate clear'
                        ) : (
                          <>
                            {m.openTasks} open
                            {clear && ` · clears ~${clear}`}
                            {m.tasksAtRisk > 0 && (
                              <span className="text-amber-600 font-semibold"> · {m.tasksAtRisk} at risk</span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    {m.tasksAtRisk > 0 && (m.status === 'at_risk' || m.status === 'overloaded') && (
                      <AlertTriangle size={13} className="text-amber-500 shrink-0" />
                    )}
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider shrink-0"
                      style={{ background: st.bg, color: st.fg }}
                    >
                      {st.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function pick(s: Status): { fg: string; bg: string } {
  const v = STATUS_STYLE[s];
  return { fg: v.fg, bg: v.bg };
}
