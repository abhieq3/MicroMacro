import type { HydratedDocument } from 'mongoose';
import { Project } from '@/models/Project';
import { Task } from '@/models/Task';
import type { RecurringActivityDoc } from '@/models/RecurringActivity';

export type RecurrenceUnit = 'day' | 'week' | 'month' | 'year';
/** interval = every N days/weeks/months/years from an anchor date.
 *  monthly_weekday = every N months on the 1st/2nd/3rd/4th/last weekday
 *  (e.g. last Sunday of each month). */
export type ScheduleKind = 'interval' | 'monthly_weekday';
/** 0 = Sunday … 6 = Saturday (JS getDay()). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
/** 1–4 = first…fourth; -1 = last of that weekday in the month. */
export type WeekdayOrdinal = 1 | 2 | 3 | 4 | -1;

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const ORDINAL_LABELS: Record<string, string> = {
  '1': '1st',
  '2': '2nd',
  '3': '3rd',
  '4': '4th',
  '-1': 'last',
};

/** Local noon on Y-M-D so DST / UTC midnight never flips the calendar day. */
function localNoon(y: number, monthIndex: number, day: number): Date {
  return new Date(y, monthIndex, day, 12, 0, 0, 0);
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

/**
 * Parse a date for schedule math. Date-only strings (`YYYY-MM-DD` from the
 * date picker) are pinned to **local noon** so they never shift a calendar day
 * under UTC storage / IST display. Full ISO timestamps keep their instant.
 */
export function parseScheduleDate(input: Date | string): Date {
  if (input instanceof Date) {
    return isNaN(input.getTime()) ? new Date() : input;
  }
  const s = String(input || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return localNoon(y, m - 1, d);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date() : d;
}

function dayKey(d: Date): number {
  return startOfLocalDay(d).getTime();
}

/** Step a date forward by `count` units. Pure. Month/year arithmetic uses the
 *  native setMonth/setFullYear, so end-of-month edges roll naturally (Jan 31 +
 *  1 month → early Mar), which is fine for these maintenance cadences. */
export function addInterval(date: Date | string, unit: RecurrenceUnit, count: number): Date {
  const d = new Date(date);
  const n = Math.max(1, Math.floor(count || 1));
  switch (unit) {
    case 'day':
      d.setDate(d.getDate() + n);
      break;
    case 'week':
      d.setDate(d.getDate() + 7 * n);
      break;
    case 'month':
      d.setMonth(d.getMonth() + n);
      break;
    case 'year':
      d.setFullYear(d.getFullYear() + n);
      break;
  }
  return d;
}

/**
 * The Nth weekday of a calendar month (local time).
 * weekday: 0=Sun … 6=Sat. ordinal: 1–4 or -1 (last).
 * If e.g. a 5th Monday does not exist, falls back to the last that weekday.
 */
export function nthWeekdayOfMonth(
  year: number,
  monthIndex: number,
  weekday: number,
  ordinal: number,
): Date {
  const wd = ((Math.floor(weekday) % 7) + 7) % 7;
  if (ordinal === -1) {
    const lastDay = new Date(year, monthIndex + 1, 0).getDate();
    const last = localNoon(year, monthIndex, lastDay);
    const delta = (last.getDay() - wd + 7) % 7;
    return localNoon(year, monthIndex, lastDay - delta);
  }
  const ord = Math.min(4, Math.max(1, Math.floor(ordinal)));
  const first = localNoon(year, monthIndex, 1);
  const offset = (wd - first.getDay() + 7) % 7;
  let day = 1 + offset + (ord - 1) * 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  if (day > daysInMonth) {
    // e.g. 5th Monday → last Monday
    return nthWeekdayOfMonth(year, monthIndex, wd, -1);
  }
  return localNoon(year, monthIndex, day);
}

/** First monthly-weekday occurrence on or after `from` (local calendar day). */
export function firstMonthlyWeekdayOnOrAfter(
  from: Date | string,
  weekday: number,
  ordinal: number,
): Date {
  const start = startOfLocalDay(parseScheduleDate(from));
  let y = start.getFullYear();
  let m = start.getMonth();
  for (let i = 0; i < 36; i++) {
    const candidate = nthWeekdayOfMonth(y, m, weekday, ordinal);
    if (dayKey(candidate) >= dayKey(start)) return candidate;
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return nthWeekdayOfMonth(y, m, weekday, ordinal);
}

/** Next occurrence strictly after `fromDue`, every `everyMonths` months. */
export function advanceMonthlyWeekday(
  fromDue: Date | string,
  weekday: number,
  ordinal: number,
  everyMonths: number,
): Date {
  const from = parseScheduleDate(fromDue);
  const step = Math.max(1, Math.floor(everyMonths || 1));
  let y = from.getFullYear();
  let m = from.getMonth() + step;
  while (m > 11) {
    m -= 12;
    y += 1;
  }
  for (let i = 0; i < 36; i++) {
    const candidate = nthWeekdayOfMonth(y, m, weekday, ordinal);
    if (dayKey(candidate) > dayKey(from)) return candidate;
    m += step;
    while (m > 11) {
      m -= 12;
      y += 1;
    }
  }
  return addInterval(from, 'month', step);
}

/** Human label for a simple cadence, e.g. "Monthly", "Every 6 months". */
export function cadenceLabel(unit: RecurrenceUnit, count: number): string {
  const n = Math.max(1, Math.floor(count || 1));
  if (n === 1) {
    return { day: 'Daily', week: 'Weekly', month: 'Monthly', year: 'Yearly' }[unit];
  }
  return `Every ${n} ${unit}s`;
}

/** Human label for monthly weekday patterns, e.g. "Last Sunday of each month". */
export function monthlyWeekdayCadenceLabel(
  weekday: number,
  ordinal: number,
  everyMonths: number,
): string {
  const wd = WEEKDAY_NAMES[((Math.floor(weekday) % 7) + 7) % 7] || 'Sunday';
  const ord = ORDINAL_LABELS[String(ordinal)] || ORDINAL_LABELS['-1'];
  const n = Math.max(1, Math.floor(everyMonths || 1));
  if (n === 1) return `${ord} ${wd} of each month`;
  return `${ord} ${wd} every ${n} months`;
}

export function activityCadenceLabel(a: {
  scheduleKind?: string | null;
  intervalUnit?: string | null;
  intervalCount?: number | null;
  weekday?: number | null;
  weekdayOrdinal?: number | null;
}): string {
  if (a.scheduleKind === 'monthly_weekday') {
    return monthlyWeekdayCadenceLabel(
      a.weekday ?? 0,
      (a.weekdayOrdinal ?? -1) as number,
      a.intervalCount ?? 1,
    );
  }
  return cadenceLabel((a.intervalUnit as RecurrenceUnit) || 'month', a.intervalCount ?? 1);
}

type ScheduleFields = {
  scheduleKind?: string | null;
  intervalUnit?: string | null;
  intervalCount?: number | null;
  weekday?: number | null;
  weekdayOrdinal?: number | null;
  nextDueDate: Date | string;
};

/** Advance next due from the occurrence just materialised. */
export function advanceNextDue(activity: ScheduleFields): Date {
  const due = parseScheduleDate(activity.nextDueDate);
  if (activity.scheduleKind === 'monthly_weekday') {
    return advanceMonthlyWeekday(
      due,
      activity.weekday ?? 0,
      activity.weekdayOrdinal ?? -1,
      activity.intervalCount ?? 1,
    );
  }
  return addInterval(due, (activity.intervalUnit as RecurrenceUnit) || 'month', activity.intervalCount ?? 1);
}

/**
 * Walk the schedule forward until next due is on or after `onOrAfter`
 * (default: today, local). Fixes stale cursors like "next 28 Jun" while
 * today is already in August — common when a series was anchored in the past
 * or an open occurrence blocked the cron from advancing.
 */
export function catchUpNextDue(activity: ScheduleFields, onOrAfter: Date | string = new Date()): Date {
  const floor = startOfLocalDay(parseScheduleDate(onOrAfter));
  let due = parseScheduleDate(activity.nextDueDate);
  if (dayKey(due) >= dayKey(floor)) return due;

  // Fast path for monthly weekday: jump straight to the next matching day on
  // or after the floor, then align to the every-N-months phase by stepping
  // from the stale cursor when N > 1.
  if (activity.scheduleKind === 'monthly_weekday') {
    const every = Math.max(1, Math.floor(activity.intervalCount ?? 1));
    if (every === 1) {
      return firstMonthlyWeekdayOnOrAfter(floor, activity.weekday ?? 0, activity.weekdayOrdinal ?? -1);
    }
  }

  let guard = 0;
  while (dayKey(due) < dayKey(floor) && guard++ < 600) {
    due = advanceNextDue({ ...activity, nextDueDate: due });
  }
  return due;
}

/**
 * First due date for a new / re-anchored series: snap to the schedule on or
 * after the anchor, then catch up so we never land a past "next" date.
 */
export function resolveFirstDue(
  activity: Omit<ScheduleFields, 'nextDueDate'> & { scheduleKind?: string | null },
  anchor: Date | string,
  onOrAfter: Date | string = new Date(),
): Date {
  const start = parseScheduleDate(anchor);
  let first: Date;
  if (
    activity.scheduleKind === 'monthly_weekday' &&
    typeof activity.weekday === 'number' &&
    typeof activity.weekdayOrdinal === 'number'
  ) {
    first = firstMonthlyWeekdayOnOrAfter(start, activity.weekday, activity.weekdayOrdinal);
  } else {
    first = start;
  }
  return catchUpNextDue({ ...activity, nextDueDate: first }, onOrAfter);
}

/** Find (or lazily create) the per-team system project that holds recurring
 *  activity task occurrences, so they ride the normal calendar/dashboard/tree
 *  surfaces without inventing a parallel data path. */
export async function ensureRecurringProject(teamId: string, ownerId: string) {
  const existing = await Project.findOne({ teamId, isSystem: true });
  if (existing) return existing;
  const code = `RECUR-${String(teamId).slice(-6).toUpperCase()}`;
  // A concurrent create could race on the unique code; fall back to the read.
  try {
    return await Project.create({
      code,
      name: 'Recurring Activities',
      description: 'Recurring and scheduled team activities. Managed automatically.',
      teamId,
      ownerId,
      isSystem: true,
      lifecycle: 'generic',
      status: 'in_progress',
    });
  } catch {
    const again = await Project.findOne({ teamId, isSystem: true });
    if (again) return again;
    throw new Error('Could not provision the recurring-activities project.');
  }
}

/** Materialise the activity's next occurrence as a Task (checklist → subtasks),
 *  then advance the cadence cursor. Mutates and saves the activity doc.
 *  Catches up a stale nextDueDate first so we never spawn a long-overdue
 *  occurrence when the series simply fell behind. */
export async function generateOccurrence(activity: HydratedDocument<RecurringActivityDoc>) {
  const caught = catchUpNextDue(activity as any, new Date());
  activity.nextDueDate = caught as any;
  const due = caught;
  const subtasks = (activity.checklist || []).map((c: any, i: number) => ({
    title: c.title,
    status: 'todo',
    position: i,
  }));
  const task = await Task.create({
    projectId: activity.projectId,
    title: activity.title,
    description: activity.description || '',
    assigneeId: activity.assigneeId || undefined,
    priority: activity.priority || 'medium',
    dueDate: due,
    subtasks,
    recurringActivityId: activity._id,
  });
  activity.lastOccurrenceTaskId = task._id as any;
  // Advance from the due we just spawned (not a re-read of a stale cursor).
  activity.nextDueDate = advanceNextDue({ ...(activity as any), nextDueDate: due }) as any;
  await activity.save();
  return task;
}

/** Whether the activity has a still-open (not done) occurrence outstanding. */
export async function hasOpenOccurrence(activityId: string): Promise<boolean> {
  const open = await Task.exists({ recurringActivityId: activityId, status: { $ne: 'done' } });
  return !!open;
}

/** Serialize a calendar day as YYYY-MM-DD (local), then ISO noon UTC-stable for clients. */
function isoDay(d: any): string | null {
  if (!d) return null;
  const x = parseScheduleDate(d);
  if (isNaN(x.getTime())) return null;
  // Prefer the local calendar day so "last Sunday = Aug 30" never becomes Aug 29
  // when the client re-parses a UTC midnight stamp.
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}T12:00:00.000Z`;
}

export function serializeRecurringActivity(a: any, extras: Record<string, unknown> = {}) {
  const iso = (d: any) => (d ? new Date(d).toISOString() : null);
  const scheduleKind = a.scheduleKind === 'monthly_weekday' ? 'monthly_weekday' : 'interval';
  // displayNextDue: what the list should show as "next/due" — open occurrence
  // due if one exists, else the spawn cursor (already catch-up'd by callers).
  const { openOccurrenceDueDate: openDueRaw, ...restExtras } = extras;
  const openDue = openDueRaw as string | Date | null | undefined;
  const displayNext = openDue || a.nextDueDate;
  return {
    id: String(a._id),
    teamId: String(a.teamId),
    projectId: a.projectId ? String(a.projectId) : null,
    title: a.title,
    description: a.description || '',
    checklist: (a.checklist || []).map((c: any) => ({ title: c.title })),
    assigneeId: a.assigneeId ? String(a.assigneeId) : null,
    priority: a.priority || 'medium',
    scheduleKind,
    intervalUnit: a.intervalUnit || 'month',
    intervalCount: a.intervalCount ?? 1,
    weekday: typeof a.weekday === 'number' ? a.weekday : null,
    weekdayOrdinal: typeof a.weekdayOrdinal === 'number' ? a.weekdayOrdinal : null,
    cadence: activityCadenceLabel(a),
    startDate: isoDay(a.startDate),
    nextDueDate: isoDay(a.nextDueDate),
    /** Date shown in the list: open occurrence due if present, else nextDueDate. */
    displayNextDue: isoDay(displayNext),
    openOccurrenceDueDate: openDue ? isoDay(openDue) : null,
    leadTimeDays: a.leadTimeDays ?? 0,
    active: !!a.active,
    lastOccurrenceTaskId: a.lastOccurrenceTaskId ? String(a.lastOccurrenceTaskId) : null,
    createdBy: a.createdBy ? String(a.createdBy) : null,
    createdByName: a.createdByName || '',
    createdAt: iso(a.createdAt),
    ...restExtras,
  };
}
