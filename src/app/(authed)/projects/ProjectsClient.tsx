'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import { useLiveRefresh } from '@/lib/client/useLiveRefresh';
import { LifecycleTag, StatusTag, formatDate } from '@/components/ui';
import { Select } from '@/components/Select';
import { useIsLead } from '@/components/CurrentUserContext';
import { Plus, Search, SlidersHorizontal, Lock, X } from 'lucide-react';

interface InitialData {
  projects: any[];
  teams: Array<{ id: string; name: string }>;
  lifecycles: Array<{ key: string; label: string }>;
}

export default function ProjectsClient({ initialData }: { initialData: InitialData }) {
  const isLead = useIsLead();
  const [projects, setProjects] = useState<any[]>(initialData.projects);
  const teams = initialData.teams;
  const lifecycles = initialData.lifecycles;
  const [q, setQ] = useState('');
  const [team, setTeam] = useState('');
  const [lc, setLc] = useState('');
  const [status, setStatus] = useState('');
  const [tab, setTab] = useState<'active' | 'completed' | 'all'>('active');
  const [loaded, setLoaded] = useState(true);

  // First render uses the server-provided list — skip the refetch effect
  // so we don't immediately invalidate the SSR win.
  const isFirstRender = useRef(true);

  function load() {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (team) params.set('teamId', team);
    if (lc) params.set('lifecycle', lc);
    if (tab === 'active') {
      ['planning', 'in_progress', 'on_hold'].forEach((s) => params.append('status', s));
    } else if (tab === 'completed') {
      params.set('status', 'completed');
    } else {
      // "All" means all — including cancelled AND archived projects, which the
      // API hides by default. Without this, a cancelled-then-archived project
      // would vanish from every tab.
      params.set('includeArchived', '1');
      if (status) params.set('status', status);
    }
    setLoaded(false);
    api<any[]>(`/projects?${params.toString()}`)
      .then((p) => {
        setProjects(p);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const id = setTimeout(load, 150);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, team, lc, status, tab]);

  // Realtime: refetch on tab focus, periodically while visible, and instantly
  // when anything in the app reports a change.
  useLiveRefresh(load); // eslint-disable-line react-hooks/exhaustive-deps

  const STATUS_COLORS: Record<string, { dot: string; label: string }> = {
    planning: { dot: '#94a3b8', label: 'Planning' },
    in_progress: { dot: '#3b82f6', label: 'In progress' },
    on_hold: { dot: '#f59e0b', label: 'On hold' },
    completed: { dot: '#22c55e', label: 'Completed' },
    cancelled: { dot: '#ef4444', label: 'Cancelled' },
  };

  const HEALTH_COLORS: Record<string, string> = {
    good: '#22c55e',
    at_risk: '#f59e0b',
    critical: '#ef4444',
  };

  return (
    <div className="space-y-5 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between pt-1">
        <div>
          <h1 className="page-title">Projects</h1>
          <p className="text-sm text-slate-500 dark:text-white/40 mt-1">
            All quality projects across teams &amp; lifecycles.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Single create flow for every user — the form on /projects/new
              has the "Personal" toggle, so contributors and leads share the
              same entry point. */}
          <Link href="/projects/new" className="btn-primary gap-2">
            <Plus size={15} /> New project
          </Link>
        </div>
      </div>

      {/* Tabs — archiving isn't in use yet, so the Archived bin is hidden. */}
      <div
        className="flex gap-1 border-b border-slate-100 dark:border-white/[0.06]"
        role="tablist"
        aria-label="Project filters"
      >
        {(['active', 'completed', 'all'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => {
              setTab(t);
              setStatus('');
            }}
            className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
              tab === t
                ? 'text-blue-700 dark:text-blue-400 border-b-2 border-blue-600 bg-blue-50/50 dark:bg-blue-500/10'
                : 'text-slate-400 dark:text-white/35 hover:text-slate-600 dark:hover:text-white/60 hover:bg-slate-50 dark:hover:bg-white/[0.04]'
            }`}
          >
            {t === 'active' ? 'Active' : t === 'completed' ? 'Completed' : 'All'}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="card p-4 min-h-[72px] flex items-center">
        <div className="flex flex-wrap items-center gap-3 w-full">
          <div className="relative flex-1 min-w-[180px]">
            <Search
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/40 pointer-events-none"
            />
            <input
              className="input pl-8 text-sm"
              placeholder="Search projects…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          {/* Filters stack full-width on mobile (so a long team name never
              overflows the card) and sit inline from sm: up. */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
            <SlidersHorizontal
              size={13}
              className="text-slate-400 dark:text-white/40 shrink-0 hidden sm:block"
            />
            <Select
              className="w-full sm:w-44"
              value={team}
              onChange={setTeam}
              ariaLabel="Filter by team"
              placeholder="All teams"
              options={[
                { value: '', label: 'All teams' },
                ...teams.map((t) => ({ value: t.id, label: t.name })),
              ]}
            />
            <Select
              className="w-full sm:w-48"
              value={lc}
              onChange={setLc}
              ariaLabel="Filter by lifecycle"
              placeholder="All lifecycles"
              options={[
                { value: '', label: 'All lifecycles' },
                ...lifecycles.map((l) => ({ value: l.key, label: l.label })),
              ]}
            />
            {tab === 'all' && (
              <Select
                className="w-full sm:w-40"
                value={status}
                onChange={setStatus}
                ariaLabel="Filter by status"
                placeholder="All statuses"
                options={[
                  { value: '', label: 'All statuses' },
                  { value: 'planning', label: 'Planning' },
                  { value: 'in_progress', label: 'In progress' },
                  { value: 'on_hold', label: 'On hold' },
                  { value: 'completed', label: 'Completed' },
                  { value: 'cancelled', label: 'Cancelled' },
                ]}
              />
            )}
          </div>
        </div>
      </div>

      {/* Loading skeleton */}
      {!loaded && (
        <div
          className="grid gap-5"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}
          aria-busy="true"
          aria-live="polite"
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card overflow-hidden">
              <div className="skeleton h-1 w-full rounded-none" />
              <div className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="skeleton h-5 w-16 rounded-full" />
                  <div className="skeleton h-5 w-20 rounded-full" />
                </div>
                <div className="skeleton h-5 w-3/4" />
                <div className="skeleton h-3.5 w-full" />
                <div className="skeleton h-3.5 w-2/3" />
                <div className="skeleton h-2 w-full rounded-full" />
                <div className="flex justify-between pt-2 border-t border-slate-100">
                  <div className="skeleton h-3 w-24" />
                  <div className="skeleton h-3 w-16" />
                </div>
              </div>
            </div>
          ))}
          <span className="sr-only">Loading projects…</span>
        </div>
      )}

      {/* Grid */}
      {loaded && (
        <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
          {projects.map((p) => {
            const pct = p.taskCount ? Math.round((p.tasksDone / p.taskCount) * 100) : 0;
            const overdueRatio = p.taskCount ? (p.tasksOverdue || 0) / p.taskCount : 0;
            const health = overdueRatio > 0.3 ? 'critical' : overdueRatio > 0 ? 'at_risk' : 'good';
            const healthColor = HEALTH_COLORS[health];
            const healthLabel =
              health === 'critical' ? 'Critical' : health === 'at_risk' ? 'At risk' : 'Healthy';
            const statusInfo = STATUS_COLORS[p.status] || { dot: '#94a3b8', label: p.status };
            // App-theme progress: blue at the start, transitioning to green as it
            // nears completion — never the dull grey it used to fall back to at
            // low percentages. The % text reads green only once nearly done.
            const progressColor = pct >= 90 ? '#22c55e' : '#1769C8';
            const dueIn = p.dueDate
              ? Math.round((new Date(p.dueDate).getTime() - Date.now()) / 86400000)
              : null;
            const dueTone = dueIn === null ? 'slate' : dueIn < 0 ? 'red' : dueIn <= 7 ? 'amber' : 'slate';
            // Blue → green themed fill so the bar always carries the app accent.
            const progressGradient = 'linear-gradient(90deg, #1769C8 0%, #22c55e 100%)';
            return (
              <Link
                href={`/projects/${p.id}`}
                key={p.id}
                className="card-hover block group overflow-hidden hover:-translate-y-0.5 transition-transform"
              >
                {/* Top accent — slim strip in the health colour */}
                <div className="h-1" style={{ background: healthColor }} />

                <div className="p-4 flex flex-col h-full">
                  {/* Header row: code + health + status */}
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    {p.isPersonal ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-violet-600 bg-violet-50 dark:bg-violet-500/15 dark:text-violet-400 px-2 py-0.5 rounded-full uppercase tracking-wider">
                        <Lock size={9} /> Private
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-slate-400 dark:text-white/30 bg-slate-50 dark:bg-white/[0.05] px-2 py-0.5 rounded">
                        {p.ccNo || p.code}
                      </span>
                    )}
                    <span
                      className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{
                        background:
                          health === 'good'
                            ? 'rgba(34,197,94,0.10)'
                            : health === 'at_risk'
                              ? 'rgba(245,158,11,0.10)'
                              : 'rgba(239,68,68,0.10)',
                        color: healthColor,
                      }}
                      title={healthLabel}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: healthColor, boxShadow: `0 0 0 2px ${healthColor}22` }}
                      />
                      {healthLabel}
                    </span>
                    <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 dark:text-white/40">
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: statusInfo.dot }}
                      />
                      {statusInfo.label}
                    </span>
                  </div>

                  {/* Project name */}
                  <h3 className="font-bold text-[14.5px] text-slate-900 dark:text-white/90 line-clamp-1 group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors leading-snug mb-1">
                    {p.name}
                  </h3>

                  {/* Description */}
                  {p.description && (
                    <p className="text-[12px] text-slate-500 dark:text-white/40 line-clamp-1 leading-relaxed mb-2">
                      {p.description}
                    </p>
                  )}

                  {/* Lifecycle + team tags */}
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <LifecycleTag lifecycle={p.lifecycle} />
                    {p.teamName && (
                      <span
                        className="inline-flex items-center gap-1 text-[10.5px] text-slate-500 dark:text-white/40 bg-slate-50 dark:bg-white/[0.04] px-2 py-0.5 rounded-full truncate max-w-[150px]"
                        title={p.teamName}
                      >
                        {p.teamName}
                      </span>
                    )}
                  </div>

                  {/* Progress — slim bar + % on one line; no label block. */}
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="h-1.5 flex-1 rounded-full overflow-hidden bg-slate-100 dark:bg-white/[0.06]">
                      <div
                        className="relative h-full rounded-full overflow-hidden transition-all duration-700"
                        style={{
                          width: `${Math.max(pct, p.taskCount ? 2 : 0)}%`,
                          background: progressGradient,
                        }}
                      >
                        {pct > 0 && <span aria-hidden className="progress-bar-sheen" />}
                      </div>
                    </div>
                    <span
                      className="text-[12px] font-black tabular-nums shrink-0"
                      style={{ color: progressColor }}
                    >
                      {pct}%
                    </span>
                  </div>

                  {/* Footer */}
                  <div className="mt-auto pt-2.5 border-t border-slate-100 dark:border-white/[0.06] flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-[11px] min-w-0">
                      <span className="font-semibold text-slate-500 dark:text-white/40 shrink-0">
                        <span className="text-slate-800 dark:text-white/82 font-black">{p.tasksDone}</span>
                        <span className="text-slate-300 dark:text-white/20">/</span>
                        <span>{p.taskCount}</span>
                        <span className="ml-1">done</span>
                      </span>
                      {p.tasksOverdue > 0 && (
                        <span className="text-[10.5px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 px-1.5 py-0.5 rounded-full shrink-0">
                          {p.tasksOverdue} overdue
                        </span>
                      )}
                      {/* Throughput trend — output this week vs. last. A single
                          count is an inventory; the delta is the truth. */}
                      {(() => {
                        const w = p.done7d ?? 0;
                        const prev = p.donePrev7d ?? 0;
                        if (w === 0 && prev === 0) return null;
                        const up = w >= prev;
                        return (
                          <span
                            className="inline-flex items-center gap-0.5 text-[10.5px] font-bold shrink-0 tabular-nums"
                            style={{ color: up ? '#16a34a' : '#d97706' }}
                            title={`${w} done this week · ${prev} the week before`}
                          >
                            {up ? '▲' : '▼'} {w}
                            <span className="font-normal opacity-60">/wk</span>
                          </span>
                        );
                      })()}
                    </div>
                    {p.dueDate && (
                      <span
                        className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                          dueTone === 'red'
                            ? 'text-red-600 bg-red-50 dark:bg-red-500/10 dark:text-red-400'
                            : dueTone === 'amber'
                              ? 'text-amber-700 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400'
                              : 'text-slate-500 bg-slate-50 dark:bg-white/[0.05] dark:text-white/38'
                        }`}
                        title={
                          dueIn !== null
                            ? dueIn < 0
                              ? `${Math.abs(dueIn)} day${Math.abs(dueIn) === 1 ? '' : 's'} overdue`
                              : `${dueIn} day${dueIn === 1 ? '' : 's'} left`
                            : ''
                        }
                      >
                        {dueIn !== null && dueIn < 0
                          ? `${Math.abs(dueIn)}d overdue`
                          : `Due ${formatDate(p.dueDate)}`}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {loaded && projects.length === 0 && (
        <div className="card p-12 text-center">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
            {q || team || lc || status ? (
              <Search size={22} className="text-blue-400" />
            ) : (
              <Plus size={22} className="text-blue-400" />
            )}
          </div>
          <div className="text-sm font-bold text-slate-700 dark:text-white/80 mb-1">
            {q || team || lc || status ? 'No matching projects' : 'No projects yet'}
          </div>
          <div className="text-xs text-slate-400 dark:text-white/35 mb-4">
            {q || team || lc || status
              ? 'Try a different search or clear the filters below.'
              : 'Create your first project to get started.'}
          </div>
          {q || team || lc || status ? (
            <button
              onClick={() => {
                setQ('');
                setTeam('');
                setLc('');
                setStatus('');
              }}
              className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-white/60 hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
            >
              <X size={14} /> Clear filters
            </button>
          ) : (
            <Link href="/projects/new" className="btn-primary text-sm gap-2 inline-flex">
              <Plus size={14} /> New project
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
