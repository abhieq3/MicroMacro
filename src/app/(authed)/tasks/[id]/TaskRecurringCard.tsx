'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import { Card, formatFullDate } from '@/components/ui';
import { Select } from '@/components/Select';
import { DatePicker } from '@/components/DatePicker';
import { Pencil, Power, Repeat, X } from 'lucide-react';

export type RecurringSummary = {
  id: string;
  teamId: string;
  title: string;
  scheduleKind?: 'interval' | 'monthly_weekday';
  intervalUnit: 'day' | 'week' | 'month' | 'year';
  intervalCount: number;
  weekday?: number | null;
  weekdayOrdinal?: number | null;
  cadence: string;
  startDate: string | null;
  nextDueDate: string | null;
  leadTimeDays: number;
  active: boolean;
};

const UNIT_OPTS = [
  { value: 'day', label: 'day(s)' },
  { value: 'week', label: 'week(s)' },
  { value: 'month', label: 'month(s)' },
  { value: 'year', label: 'year(s)' },
];
const SCHEDULE_KIND_OPTS = [
  { value: 'interval', label: 'Every N days / weeks / months' },
  { value: 'monthly_weekday', label: 'On a weekday each month (e.g. last Sunday)' },
];
const WEEKDAY_OPTS = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
];
const ORDINAL_OPTS = [
  { value: '1', label: '1st' },
  { value: '2', label: '2nd' },
  { value: '3', label: '3rd' },
  { value: '4', label: '4th' },
  { value: '-1', label: 'Last' },
];

type Draft = {
  scheduleKind: 'interval' | 'monthly_weekday';
  intervalCount: number;
  intervalUnit: string;
  weekday: string;
  weekdayOrdinal: string;
  startDate: string;
  leadTimeDays: number;
};

function draftFrom(r: RecurringSummary): Draft {
  return {
    scheduleKind: r.scheduleKind === 'monthly_weekday' ? 'monthly_weekday' : 'interval',
    intervalCount: r.intervalCount || 1,
    intervalUnit: r.intervalUnit || 'month',
    weekday: String(typeof r.weekday === 'number' ? r.weekday : 0),
    weekdayOrdinal: String(typeof r.weekdayOrdinal === 'number' ? r.weekdayOrdinal : -1),
    startDate: '',
    leadTimeDays: r.leadTimeDays || 0,
  };
}

/**
 * Sidebar card on a recurring occurrence task: shows the series cadence and
 * (for leads) lets them change schedule — including last-Sunday-of-month —
 * without leaving the task detail page.
 */
export function TaskRecurringCard({
  initial,
  teamId,
  canEdit,
  onToast,
  onUpdated,
}: {
  initial: RecurringSummary | null;
  teamId: string | null;
  canEdit: boolean;
  onToast: (msg: string, kind?: 'ok' | 'err') => void;
  onUpdated?: (r: RecurringSummary) => void;
}) {
  const [recurring, setRecurring] = useState<RecurringSummary | null>(initial);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setRecurring(initial);
  }, [initial]);

  if (!recurring) {
    return (
      <Card title="Recurring">
        <p className="text-xs text-slate-400 leading-snug">
          This task was part of a recurring series that is no longer available.
        </p>
      </Card>
    );
  }

  const tid = teamId || recurring.teamId;

  function openEdit() {
    setDraft(draftFrom(recurring!));
    setEditing(true);
  }
  function closeEdit() {
    setEditing(false);
    setDraft(null);
  }

  async function save() {
    if (!draft || !tid) return;
    const scheduleKind = draft.scheduleKind === 'monthly_weekday' ? 'monthly_weekday' : 'interval';
    const body: Record<string, unknown> = {
      scheduleKind,
      intervalCount: Math.max(1, Number(draft.intervalCount) || 1),
      leadTimeDays: Math.max(0, Number(draft.leadTimeDays) || 0),
    };
    if (scheduleKind === 'monthly_weekday') {
      body.intervalUnit = 'month';
      body.weekday = Number(draft.weekday);
      body.weekdayOrdinal = Number(draft.weekdayOrdinal);
    } else {
      body.intervalUnit = draft.intervalUnit;
      body.weekday = null;
      body.weekdayOrdinal = null;
    }
    if (draft.startDate) body.startDate = draft.startDate;

    setBusy(true);
    try {
      const updated = await api<RecurringSummary>(
        `/teams/${tid}/recurring-activities/${recurring!.id}`,
        { method: 'PATCH', body },
      );
      setRecurring(updated);
      onUpdated?.(updated);
      closeEdit();
      onToast('Schedule updated. Future occurrences use the new pattern.');
    } catch (e: any) {
      onToast(e?.message || 'Could not update schedule.', 'err');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive() {
    if (!tid || !recurring) return;
    try {
      const updated = await api<RecurringSummary>(
        `/teams/${tid}/recurring-activities/${recurring.id}`,
        { method: 'PATCH', body: { active: !recurring.active } },
      );
      setRecurring(updated);
      onUpdated?.(updated);
      onToast(updated.active ? 'Series resumed.' : 'Series paused.');
    } catch (e: any) {
      onToast(e?.message || 'Update failed.', 'err');
    }
  }

  return (
    <Card
      title="Recurring schedule"
      action={
        canEdit && !editing ? (
          <button
            type="button"
            onClick={openEdit}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800"
          >
            <Pencil size={12} /> Edit
          </button>
        ) : null
      }
    >
      {!editing ? (
        <div className="space-y-2.5 text-sm">
          <div className="flex items-start gap-2.5">
            <span className="w-7 h-7 rounded-lg grid place-items-center bg-violet-50 text-violet-600 shrink-0 mt-0.5">
              <Repeat size={14} />
            </span>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-800 dark:text-white/85 leading-snug">
                {recurring.title}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600">
                  {recurring.cadence}
                </span>
                {!recurring.active && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                    Paused
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 space-y-0.5 pl-0.5">
            {recurring.nextDueDate && (
              <div>
                Next due{' '}
                <span className="font-semibold text-slate-700">
                  {formatFullDate(recurring.nextDueDate)}
                </span>
              </div>
            )}
            {recurring.leadTimeDays > 0 && (
              <div>Appears {recurring.leadTimeDays} day{recurring.leadTimeDays === 1 ? '' : 's'} ahead</div>
            )}
            <div className="text-slate-400 pt-0.5">
              This task is one occurrence. Changing the schedule only affects future ones.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {canEdit && (
              <button
                type="button"
                onClick={toggleActive}
                className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg border transition-colors ${
                  recurring.active
                    ? 'border-slate-200 text-slate-500 hover:text-amber-700 hover:border-amber-200 hover:bg-amber-50'
                    : 'border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                }`}
              >
                <Power size={12} />
                {recurring.active ? 'Pause series' : 'Resume series'}
              </button>
            )}
            {tid && (
              <Link
                href={`/teams/${tid}?view=recurring`}
                className="text-[11px] font-semibold text-slate-400 hover:text-blue-600"
              >
                Open series on team →
              </Link>
            )}
          </div>
        </div>
      ) : (
        draft && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-slate-400 leading-snug">
                Future occurrences only — this task stays as-is.
              </p>
              <button type="button" onClick={closeEdit} className="p-0.5 text-slate-400 hover:text-slate-700">
                <X size={14} />
              </button>
            </div>

            <div>
              <label className="label">Schedule type</label>
              <Select
                value={draft.scheduleKind}
                onChange={(v) =>
                  setDraft((d) =>
                    d
                      ? {
                          ...d,
                          scheduleKind: v === 'monthly_weekday' ? 'monthly_weekday' : 'interval',
                          intervalUnit: v === 'monthly_weekday' ? 'month' : d.intervalUnit,
                        }
                      : d,
                  )
                }
                ariaLabel="Schedule type"
                options={SCHEDULE_KIND_OPTS}
              />
            </div>

            {draft.scheduleKind === 'monthly_weekday' ? (
              <div className="rounded-xl border border-violet-200/80 dark:border-violet-500/20 bg-violet-50/40 dark:bg-violet-500/[0.06] p-3 space-y-3">
                <p className="text-[11px] text-violet-700/80 dark:text-violet-300/70 leading-snug">
                  e.g. <strong>Last Sunday of each month</strong>
                </p>
                <div className="grid grid-cols-1 gap-2">
                  <div>
                    <label className="label">Which</label>
                    <Select
                      value={draft.weekdayOrdinal}
                      onChange={(v) => setDraft((d) => (d ? { ...d, weekdayOrdinal: v } : d))}
                      ariaLabel="Weekday ordinal"
                      options={ORDINAL_OPTS}
                    />
                  </div>
                  <div>
                    <label className="label">Weekday</label>
                    <Select
                      value={draft.weekday}
                      onChange={(v) => setDraft((d) => (d ? { ...d, weekday: v } : d))}
                      ariaLabel="Weekday"
                      options={WEEKDAY_OPTS}
                    />
                  </div>
                  <div>
                    <label className="label">Every</label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="number"
                        min={1}
                        className="input w-16"
                        value={draft.intervalCount}
                        onChange={(e) =>
                          setDraft((d) =>
                            d
                              ? { ...d, intervalCount: Math.max(1, Number(e.target.value) || 1) }
                              : d,
                          )
                        }
                      />
                      <span className="text-xs text-slate-500 shrink-0">month(s)</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <label className="label">Repeats every</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={1}
                    className="input w-16"
                    value={draft.intervalCount}
                    onChange={(e) =>
                      setDraft((d) =>
                        d ? { ...d, intervalCount: Math.max(1, Number(e.target.value) || 1) } : d,
                      )
                    }
                  />
                  <div className="flex-1">
                    <Select
                      value={draft.intervalUnit}
                      onChange={(v) => setDraft((d) => (d ? { ...d, intervalUnit: v } : d))}
                      ariaLabel="Interval unit"
                      options={UNIT_OPTS}
                    />
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="label">Re-anchor next due (optional)</label>
              <DatePicker
                block
                placeholder="Leave blank to keep / auto-snap"
                value={draft.startDate || null}
                onChange={(v) => setDraft((d) => (d ? { ...d, startDate: v || '' } : d))}
              />
              {draft.scheduleKind === 'monthly_weekday' && (
                <p className="text-[10px] text-slate-400 mt-1 leading-snug">
                  If set, snaps to the next matching day on or after this date.
                </p>
              )}
            </div>

            <div>
              <label className="label">Appear ahead (days)</label>
              <input
                type="number"
                min={0}
                className="input"
                value={draft.leadTimeDays}
                onChange={(e) =>
                  setDraft((d) =>
                    d ? { ...d, leadTimeDays: Math.max(0, Number(e.target.value) || 0) } : d,
                  )
                }
              />
            </div>

            <div className="flex items-center gap-2 pt-0.5">
              <button type="button" onClick={save} disabled={busy} className="btn-primary text-xs">
                {busy ? 'Saving…' : 'Save schedule'}
              </button>
              <button type="button" onClick={closeEdit} className="btn-secondary text-xs">
                Cancel
              </button>
            </div>
          </div>
        )
      )}
    </Card>
  );
}
