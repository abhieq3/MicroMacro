'use client';

/**
 * Flow Signal — dashboard strip.
 *
 * Internal codename only. The visible strings — "Quick check", "Needs
 * attention", "Waiting on approval" — are intentionally ordinary product
 * language. No "AI", "ML", "prediction" or "model" copy appears here, and
 * none is permitted in any future learned-inference path either.
 *
 * Render contract:
 *   - When `data` is null or has no items, render NOTHING (no empty state,
 *     no "all clear" message). The dashboard reserves no vertical space.
 *   - Default = a single compact horizontal line directly under the
 *     greeting. The leading dot softly pulses twice on first mount then
 *     stops; prefers-reduced-motion users see a static dot.
 *   - Lead view: collapsed shows the top item + an optional "2 more"
 *     button that expands to at most three items inline.
 *   - Contributor view: maximum one item, no "more" button.
 *
 * Action contract:
 *   - Each row exposes the same small set of buttons via the bounded
 *     /api/tasks/[id]/flow-check endpoint. Clicking collapses the row
 *     immediately (optimistic) and triggers an onChange so the dashboard
 *     can refetch its strip in the background.
 */

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client/api';

export interface FlowSignalItem {
  taskId: string;
  projectId: string;
  projectCode?: string;
  taskTitle: string;
  headline: string;
  detail?: string;
  reasonCodes: string[];
  pendingType?: string;
  confirmed: boolean;
  confirmedByName?: string;
  confirmedAt?: string;
}

export interface FlowSignalPayload {
  mode: 'quick_check' | 'needs_attention' | 'check_needed';
  items: FlowSignalItem[];
  additionalCount: number;
}

type FlowAction =
  | 'still_moving'
  | 'waiting_approval'
  | 'waiting_another_team'
  | 'waiting_person'
  | 'waiting_other'
  | 'decision_needed'
  | 'help_needed'
  | 'dismiss'
  | 'resolve';

/** Map a reason / pendingType to the leading dot colour. The dot is the
 *  ONLY decorative element — keep it muted; the spec forbids glow effects
 *  or large surfaces. */
function dotColorFor(item: FlowSignalItem, mode: FlowSignalPayload['mode']): string {
  // Confirmed urgent blocker (red) — explicit help/decision request or
  // blocked status that the user reported themselves.
  if (item.reasonCodes.includes('help') || item.reasonCodes.includes('decision')) return '#dc2626';
  if (item.reasonCodes.includes('blocked')) return '#dc2626';
  // Confirmed waiting state — restrained slate-blue.
  if (item.reasonCodes.includes('confirmed')) return '#1565C0';
  // Inferred check (Phase 4+) — subtle amber.
  if (mode === 'check_needed') return '#d97706';
  return '#1565C0';
}

interface StripProps {
  data: FlowSignalPayload | null | undefined;
  /** Called after a successful action so the parent can refetch / clear. */
  onChange?: () => void;
}

export function FlowSignalStrip({ data, onChange }: StripProps) {
  // Local snapshot — when a user resolves/dismisses an item we remove it
  // optimistically so the strip collapses immediately, even before the
  // dashboard re-fetches its payload.
  const initial = data?.items || [];
  const [items, setItems] = useState<FlowSignalItem[]>(initial);
  const [expanded, setExpanded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Re-sync if a fresh server payload arrives (e.g. parent re-fetched).
  // We deliberately don't merge — the server is authoritative.
  useMemo(() => {
    setItems(initial);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const removeItemLocally = useCallback((taskId: string) => {
    setItems((prev) => prev.filter((i) => i.taskId !== taskId));
  }, []);

  const doAction = useCallback(
    async (taskId: string, action: FlowAction) => {
      setBusyId(taskId);
      try {
        await api(`/tasks/${taskId}/flow-check`, { method: 'POST', body: { action } });
        removeItemLocally(taskId);
        onChange?.();
      } catch {
        // Soft-fail: leave the row visible so the user can retry. We
        // deliberately don't surface a toast here — the strip is a quiet
        // affordance and shouldn't bark on a transient blip.
      } finally {
        setBusyId(null);
      }
    },
    [onChange, removeItemLocally],
  );

  if (!data || items.length === 0) return null;

  const top = items[0];
  const dot = dotColorFor(top, data.mode);
  const extraItems = items.slice(1);

  return (
    <div className="mb-3" data-flow-strip>
      <div className="flex items-start gap-2.5 px-1 py-1.5 group">
        {/* Status dot — pulses twice on first mount via CSS animation, then
            settles. Static if the user prefers reduced motion. */}
        <span
          className="mt-[7px] inline-block w-2 h-2 rounded-full shrink-0 pragati-flow-dot"
          style={{ background: dot }}
          aria-hidden
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap text-[12.5px] leading-tight">
            <span className="font-bold text-slate-500 dark:text-white/55 tracking-tight">
              {data.mode === 'quick_check'
                ? 'Quick check'
                : data.mode === 'check_needed'
                  ? 'Check needed'
                  : 'Needs attention'}
            </span>
            <span className="text-slate-300 dark:text-white/15">·</span>
            <span className="text-slate-800 dark:text-white/80">
              <span className="font-semibold">{top.headline}</span>
              {' may be holding '}
              <Link
                href={`/tasks/${top.taskId}`}
                className="font-semibold text-blue-700 dark:text-blue-400 hover:underline"
              >
                {top.taskTitle}
              </Link>
            </span>
            {top.confirmedByName && top.confirmedAt && (
              <>
                <span className="text-slate-300 dark:text-white/15">·</span>
                <span className="text-[11px] text-slate-400 dark:text-white/35">
                  Confirmed {relTime(top.confirmedAt)} by {top.confirmedByName}
                </span>
              </>
            )}
          </div>

          {/* Inline expansion — shows up to two more items + actions for
              every visible row. Buttons are deliberately small; the spec
              forbids large CTAs in this strip. */}
          <FlowActionsRow item={top} busy={busyId === top.taskId} onAction={doAction} />
        </div>

        {/* "2 more" affordance — only when there are extras AND we're
            collapsed. Click to expand inline. */}
        {extraItems.length > 0 && !expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="shrink-0 text-[11px] font-semibold text-slate-500 dark:text-white/45 hover:text-blue-700 dark:hover:text-blue-400 border border-slate-200 dark:border-white/10 rounded-md px-2 py-0.5"
          >
            {extraItems.length} more
          </button>
        )}
      </div>

      {expanded &&
        extraItems.map((it) => (
          <div
            key={it.taskId}
            className="flex items-start gap-2.5 px-1 py-1.5 mt-1 border-t border-slate-100 dark:border-white/[0.05]"
          >
            <span
              className="mt-[7px] inline-block w-2 h-2 rounded-full shrink-0"
              style={{ background: dotColorFor(it, data.mode) }}
              aria-hidden
            />
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] leading-tight text-slate-800 dark:text-white/80">
                <span className="font-semibold">{it.headline}</span>
                {' · '}
                <Link
                  href={`/tasks/${it.taskId}`}
                  className="font-semibold text-blue-700 dark:text-blue-400 hover:underline"
                >
                  {it.taskTitle}
                </Link>
              </div>
              <FlowActionsRow item={it} busy={busyId === it.taskId} onAction={doAction} />
            </div>
          </div>
        ))}

      {/* One-shot pulse animation. Plays twice over ~2.1s then halts; CSS
          keyframes do the work so no JS timeout is needed. Reduced-motion
          override sits in globals.css with the @keyframes. */}
      <style>{`
        @keyframes pragati-flow-dot-pulse {
          0%, 100% { box-shadow: 0 0 0 0 transparent; }
          50%      { box-shadow: 0 0 0 4px rgba(21, 101, 192, 0.18); }
        }
        .pragati-flow-dot {
          animation: pragati-flow-dot-pulse 1050ms ease-out 2;
        }
        @media (prefers-reduced-motion: reduce) {
          .pragati-flow-dot { animation: none; }
        }
      `}</style>
    </div>
  );
}

/** Per-row action buttons. Renders different buttons depending on whether
 *  the item is a confirmed blocker (resolve) or an unconfirmed quick check
 *  (still moving / waiting / decision / help). */
function FlowActionsRow({
  item,
  busy,
  onAction,
}: {
  item: FlowSignalItem;
  busy: boolean;
  onAction: (taskId: string, action: FlowAction) => void;
}) {
  const isConfirmed = item.confirmed;

  if (isConfirmed) {
    return (
      <div className="mt-1 flex items-center gap-1.5 flex-wrap">
        <Link
          href={`/tasks/${item.taskId}`}
          className="text-[11px] font-semibold text-slate-600 dark:text-white/55 hover:text-blue-700 dark:hover:text-blue-400 border border-slate-200 dark:border-white/10 rounded-md px-2 py-0.5"
        >
          Open task
        </Link>
        <button
          type="button"
          disabled={busy}
          onClick={() => onAction(item.taskId, 'resolve')}
          className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-md px-2 py-0.5 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Mark resolved'}
        </button>
      </div>
    );
  }

  // Inferred quick check — show the four small choices in one row.
  return (
    <div className="mt-1 flex items-center gap-1 flex-wrap">
      {[
        { label: 'Still moving', action: 'still_moving' as const },
        { label: 'Waiting on someone', action: 'waiting_other' as const },
        { label: 'Need a decision', action: 'decision_needed' as const },
        { label: 'Need help', action: 'help_needed' as const },
      ].map((b) => (
        <button
          key={b.action}
          type="button"
          disabled={busy}
          onClick={() => onAction(item.taskId, b.action)}
          className="text-[11px] font-semibold text-slate-600 dark:text-white/55 hover:text-blue-700 dark:hover:text-blue-400 border border-slate-200 dark:border-white/10 rounded-md px-2 py-0.5 disabled:opacity-50"
        >
          {b.label}
        </button>
      ))}
    </div>
  );
}

/** "today" / "2 days ago" — keeps copy human without dragging in a date lib. */
function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const ms = Date.now() - t;
  const d = Math.floor(ms / 86_400_000);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  return new Date(iso).toLocaleDateString();
}
