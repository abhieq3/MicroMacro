import type { HydratedDocument } from 'mongoose';
import { Project } from '@/models/Project';
import { Task } from '@/models/Task';
import type { RecurringActivityDoc } from '@/models/RecurringActivity';

export type RecurrenceUnit = 'day' | 'week' | 'month' | 'year';

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

/** Human label for a cadence, e.g. "Monthly", "Every 6 months". */
export function cadenceLabel(unit: RecurrenceUnit, count: number): string {
  const n = Math.max(1, Math.floor(count || 1));
  if (n === 1) {
    return { day: 'Daily', week: 'Weekly', month: 'Monthly', year: 'Yearly' }[unit];
  }
  return `Every ${n} ${unit}s`;
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
 *  then advance the cadence cursor. Mutates and saves the activity doc. */
export async function generateOccurrence(activity: HydratedDocument<RecurringActivityDoc>) {
  const due = new Date(activity.nextDueDate);
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
  activity.nextDueDate = addInterval(due, activity.intervalUnit as RecurrenceUnit, activity.intervalCount);
  await activity.save();
  return task;
}

/** Whether the activity has a still-open (not done) occurrence outstanding. */
export async function hasOpenOccurrence(activityId: string): Promise<boolean> {
  const open = await Task.exists({ recurringActivityId: activityId, status: { $ne: 'done' } });
  return !!open;
}

export function serializeRecurringActivity(a: any, extras: Record<string, unknown> = {}) {
  const iso = (d: any) => (d ? new Date(d).toISOString() : null);
  return {
    id: String(a._id),
    teamId: String(a.teamId),
    projectId: a.projectId ? String(a.projectId) : null,
    title: a.title,
    description: a.description || '',
    checklist: (a.checklist || []).map((c: any) => ({ title: c.title })),
    assigneeId: a.assigneeId ? String(a.assigneeId) : null,
    priority: a.priority || 'medium',
    intervalUnit: a.intervalUnit,
    intervalCount: a.intervalCount,
    cadence: cadenceLabel(a.intervalUnit, a.intervalCount),
    startDate: iso(a.startDate),
    nextDueDate: iso(a.nextDueDate),
    leadTimeDays: a.leadTimeDays ?? 0,
    active: !!a.active,
    lastOccurrenceTaskId: a.lastOccurrenceTaskId ? String(a.lastOccurrenceTaskId) : null,
    createdBy: a.createdBy ? String(a.createdBy) : null,
    createdByName: a.createdByName || '',
    createdAt: iso(a.createdAt),
    ...extras,
  };
}
