'use client';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/client/api';
import { useIsAdmin } from '@/components/CurrentUserContext';
import { ScrollText, RefreshCw, Sparkles, Search, ChevronRight, X } from 'lucide-react';

interface LogRow {
  id: string;
  action: string;
  category: string;
  actorName: string;
  targetType: string;
  targetId: string;
  targetLabel: string;
  summary: string;
  meta?: any;
  createdAt: string;
}

const CATEGORIES: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'project', label: 'Projects' },
  { key: 'task', label: 'Tasks' },
  { key: 'team', label: 'Teams' },
  { key: 'user', label: 'Users' },
  { key: 'auth', label: 'Sign-ins' },
];

const CATEGORY_TONE: Record<string, string> = {
  project: 'bg-purple-50 text-purple-700',
  task: 'bg-blue-50 text-blue-700',
  team: 'bg-emerald-50 text-emerald-700',
  user: 'bg-amber-50 text-amber-700',
  auth: 'bg-slate-100 text-slate-600',
  general: 'bg-slate-100 text-slate-600',
};

function targetHref(r: LogRow): string | null {
  if (!r.targetId) return null;
  if (r.targetType === 'project') return `/projects/${r.targetId}`;
  if (r.targetType === 'task') return `/tasks/${r.targetId}`;
  if (r.targetType === 'team') return `/teams/${r.targetId}`;
  return null;
}

function fmt(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
}

interface AuditPage {
  rows: LogRow[];
  nextBefore: string | null;
}

export default function AuditClient({
  initialRows,
  initialNextBefore = null,
}: {
  initialRows: LogRow[];
  initialNextBefore?: string | null;
}) {
  const isAdmin = useIsAdmin();
  const params = useSearchParams();
  // Deep-link filter — a "View audit trail" link on a project/task/user opens
  // this page pre-scoped to that entity. The chip near the search input lets
  // the admin lift the filter without going back.
  const initialTargetType = params.get('targetType') || '';
  const initialTargetId = params.get('targetId') || '';

  const [rows, setRows] = useState<LogRow[]>(initialRows);
  const [nextBefore, setNextBefore] = useState<string | null>(initialNextBefore);
  const [category, setCategory] = useState('all');
  const [targetType, setTargetType] = useState(initialTargetType);
  const [targetId, setTargetId] = useState(initialTargetId);
  const [q, setQ] = useState('');
  const [qDeb, setQDeb] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Skip the first effect run if we have SSR data AND no deep-link filter —
  // otherwise we need to re-query to apply the targetType/targetId scope.
  const skipNext = useRef(!initialTargetId && !initialTargetType);

  // Debounce the search box so we don't hammer the API as the admin types.
  useEffect(() => {
    const t = setTimeout(() => setQDeb(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const query = useMemo(() => {
    const parts = [`category=${encodeURIComponent(category)}`];
    if (targetType) parts.push(`targetType=${encodeURIComponent(targetType)}`);
    if (targetId) parts.push(`targetId=${encodeURIComponent(targetId)}`);
    if (qDeb) parts.push(`q=${encodeURIComponent(qDeb)}`);
    return parts.join('&');
  }, [category, targetType, targetId, qDeb]);

  function load() {
    setBusy(true);
    api<AuditPage>(`/audit?${query}`)
      .then((res) => {
        setRows(res.rows);
        setNextBefore(res.nextBefore);
      })
      .catch(() => {
        setRows([]);
        setNextBefore(null);
      })
      .finally(() => setBusy(false));
  }

  function loadMore() {
    if (!nextBefore || loadingMore) return;
    setLoadingMore(true);
    api<AuditPage>(`/audit?${query}&before=${encodeURIComponent(nextBefore)}`)
      .then((res) => {
        setRows((prev) => {
          const seen = new Set(prev.map((r) => r.id));
          return [...prev, ...res.rows.filter((r) => !seen.has(r.id))];
        });
        setNextBefore(res.nextBefore);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }

  useEffect(() => {
    if (!isAdmin) return;
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, isAdmin]);

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto mt-16 card p-8 text-center">
        <ScrollText size={24} className="mx-auto text-slate-300 mb-3" />
        <div className="text-sm font-semibold text-slate-700">Operation logs are admin-only</div>
        <div className="text-xs text-slate-400 mt-1">You don&rsquo;t have access to this page.</div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-5 pb-12">
      <div className="pb-5 mb-1 border-b border-slate-100 dark:border-white/[0.06]">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 page-icon-box bg-blue-50 dark:bg-blue-500/10 shrink-0">
              <ScrollText size={19} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="page-title">Operation logs</h1>
              <p className="text-sm text-slate-500 dark:text-white/45 mt-1 leading-snug">
                An immutable record of operational activity — who did what, and when.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            <Link
              href="/audit/changelog"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-300 hover:text-indigo-700 dark:hover:text-indigo-200 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 px-2.5 py-1.5 rounded-lg transition-colors"
            >
              <Sparkles size={13} /> Changelog
            </Link>
            <button
              onClick={load}
              disabled={busy}
              className="btn-secondary flex items-center gap-1.5 text-xs"
            >
              <RefreshCw size={13} className={busy ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Category filter + search */}
      <div className="flex flex-col gap-2.5">
        <div className="flex gap-1.5 flex-wrap">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              onClick={() => setCategory(c.key)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                category === c.key
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <div className="relative flex-1 min-w-0 w-full max-w-md">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by activity, who, or target…"
              className="input text-sm pl-9"
            />
          </div>
          {(targetType || targetId) && (
            <button
              onClick={() => {
                setTargetType('');
                setTargetId('');
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
              title="Clear the entity-specific filter"
            >
              Filtered to {targetType || 'entity'}:{' '}
              <span className="font-mono">{(targetId || '').slice(-6)}</span>
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      <div
        className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden"
        style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}
      >
        {rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400">No activity recorded yet.</div>
        ) : (
          <div className="overflow-x-auto -mx-px">
            <table className="w-full text-sm table-mobile-cards">
              <thead>
                <tr className="bg-slate-50/60 border-b border-slate-100 text-left">
                  <th className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-4 py-2.5">
                    When
                  </th>
                  <th className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-2.5">
                    Who
                  </th>
                  <th className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-2.5">
                    Area
                  </th>
                  <th className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-2.5">
                    Activity
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map((r) => {
                  const href = targetHref(r);
                  const hasDetail = !!(
                    r.meta &&
                    (r.meta.changes || r.meta.reason || r.meta.deactivationReason)
                  );
                  const isOpen = expanded === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr
                        onClick={() => hasDetail && setExpanded(isOpen ? null : r.id)}
                        className={`hover:bg-slate-50/70 transition-colors ${hasDetail ? 'cursor-pointer' : ''}`}
                      >
                        <td
                          data-label="When"
                          className="px-4 py-2.5 whitespace-nowrap text-xs text-slate-500"
                        >
                          <div className="flex items-center gap-1.5">
                            {hasDetail && (
                              <ChevronRight
                                size={11}
                                className={`text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                              />
                            )}
                            {!hasDetail && <span className="w-[11px]" />}
                            {fmt(r.createdAt)}
                          </div>
                        </td>
                        <td
                          data-label="Who"
                          className="px-2 py-2.5 text-xs font-medium text-slate-700 whitespace-nowrap"
                        >
                          {r.actorName}
                        </td>
                        <td data-label="Area" className="px-2 py-2.5">
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${CATEGORY_TONE[r.category] || CATEGORY_TONE.general}`}
                          >
                            {r.category}
                          </span>
                        </td>
                        <td data-label="Activity" className="px-2 py-2.5 text-xs text-slate-700">
                          {r.summary}
                          {r.targetLabel && href && (
                            <>
                              {' '}
                              ·{' '}
                              <Link
                                onClick={(e) => e.stopPropagation()}
                                href={href}
                                className="text-blue-600 hover:underline font-medium"
                              >
                                {r.targetLabel}
                              </Link>
                            </>
                          )}
                          {r.targetLabel && !href && (
                            <span className="text-slate-400"> · {r.targetLabel}</span>
                          )}
                          {r.targetType && r.targetId && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setTargetType(r.targetType);
                                setTargetId(r.targetId);
                              }}
                              className="ml-2 text-[10px] font-semibold text-slate-400 hover:text-blue-600 transition-colors"
                              title="Scope to this entity's full trail"
                            >
                              Trail →
                            </button>
                          )}
                        </td>
                      </tr>
                      {isOpen && hasDetail && (
                        <tr className="bg-slate-50/60">
                          <td colSpan={4} className="px-4 py-3 text-xs">
                            {r.meta?.reason && (
                              <div className="mb-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                  Reason
                                </span>
                                <div className="text-slate-700 mt-0.5">{r.meta.reason}</div>
                              </div>
                            )}
                            {r.meta?.deactivationReason && !r.meta?.reason && (
                              <div className="mb-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                  Deactivation reason
                                </span>
                                <div className="text-slate-700 mt-0.5">{r.meta.deactivationReason}</div>
                              </div>
                            )}
                            {r.meta?.changes && (
                              <div>
                                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                                  Changes
                                </div>
                                <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                                  <table className="w-full text-[11px]">
                                    <thead>
                                      <tr className="bg-slate-50 text-left">
                                        <th className="px-2 py-1.5 font-semibold text-slate-500">Field</th>
                                        <th className="px-2 py-1.5 font-semibold text-slate-500">Before</th>
                                        <th className="px-2 py-1.5 font-semibold text-slate-500">After</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {Object.entries(
                                        r.meta.changes as Record<string, { before: any; after: any }>,
                                      ).map(([k, v]) => (
                                        <tr key={k}>
                                          <td className="px-2 py-1.5 font-mono text-slate-600">{k}</td>
                                          <td className="px-2 py-1.5 text-slate-500 line-through decoration-red-300">
                                            {String(v.before ?? '—')}
                                          </td>
                                          <td className="px-2 py-1.5 text-emerald-700 font-medium">
                                            {String(v.after ?? '—')}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {nextBefore && (
        <div className="flex justify-center">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="btn-secondary flex items-center gap-1.5 text-xs"
          >
            <RefreshCw size={13} className={loadingMore ? 'animate-spin' : ''} />
            {loadingMore ? 'Loading…' : 'Load older activity'}
          </button>
        </div>
      )}
    </div>
  );
}
