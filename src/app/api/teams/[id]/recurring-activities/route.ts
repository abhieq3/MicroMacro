import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { RecurringActivity } from '@/models/RecurringActivity';
import { Task } from '@/models/Task';
import { Team } from '@/models/Team';
import { User } from '@/models/User';
import { requireUser } from '@/lib/auth';
import { guardTeamMember, guardTeamOwner } from '@/lib/teamAuth';
import { handleError, readBody } from '@/lib/http';
import { RecurringActivityCreateSchema } from '@/lib/validations';
import {
  catchUpNextDue,
  ensureRecurringProject,
  generateOccurrence,
  resolveFirstDue,
  serializeRecurringActivity,
} from '@/lib/recurring';
import { logOperation } from '@/lib/audit';

export const runtime = 'nodejs';

async function withListExtras(activities: any[]) {
  const assigneeIds = Array.from(
    new Set(activities.map((a) => a.assigneeId).filter(Boolean).map((x: any) => String(x))),
  );
  const raIds = activities.map((a) => a._id);
  const [users, openTasks] = await Promise.all([
    assigneeIds.length
      ? User.find({ _id: { $in: assigneeIds } }).select('name').lean()
      : Promise.resolve([] as any[]),
    raIds.length
      ? Task.find({
          recurringActivityId: { $in: raIds },
          status: { $ne: 'done' },
        })
          .select('recurringActivityId dueDate')
          .lean()
      : Promise.resolve([] as any[]),
  ]);
  const nameById = new Map(users.map((u: any) => [String(u._id), u.name]));
  const openDueByRa = new Map<string, Date>();
  for (const t of openTasks) {
    const key = String((t as any).recurringActivityId);
    // One open occurrence expected; if multiple, keep the earliest due.
    const due = (t as any).dueDate ? new Date((t as any).dueDate) : null;
    if (!due) continue;
    const prev = openDueByRa.get(key);
    if (!prev || +due < +prev) openDueByRa.set(key, due);
  }

  // Persist catch-up for active series whose spawn cursor is still in the past
  // (heals "next 28 Jun" while today is already in August). Safe even when an
  // open occurrence exists — nextDueDate is the *following* cycle after that
  // open task, so catching it up only affects future spawns.
  const now = new Date();
  const healed: any[] = [];
  for (const a of activities) {
    if (!a.active) {
      healed.push(a);
      continue;
    }
    const caught = catchUpNextDue(a, now);
    const prev = a.nextDueDate ? new Date(a.nextDueDate).getTime() : 0;
    if (caught.getTime() !== prev) {
      await RecurringActivity.updateOne({ _id: a._id }, { $set: { nextDueDate: caught } });
      healed.push({ ...a, nextDueDate: caught });
    } else {
      healed.push(a);
    }
  }

  return healed.map((a) =>
    serializeRecurringActivity(a, {
      assigneeName: a.assigneeId ? nameById.get(String(a.assigneeId)) || null : null,
      openOccurrenceDueDate: openDueByRa.get(String(a._id)) || null,
    }),
  );
}

// List a team's recurring activities. Any team member may view.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const denied = await guardTeamMember(params.id, String(user.sub), user.role);
    if (denied) return denied;
    const activities = await RecurringActivity.find({ teamId: params.id })
      .sort({ active: -1, nextDueDate: 1 })
      .lean();
    return NextResponse.json(await withListExtras(activities));
  } catch (e) {
    return handleError(e);
  }
}

// Create a recurring activity (lead/admin only). Provisions the per-team system
// project on first use and immediately materialises the first occurrence so it
// shows up on the calendar / dashboard right away.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const denied = await guardTeamOwner(params.id, String(user.sub), user.role);
    if (denied) return denied;

    const body = await readBody(req, RecurringActivityCreateSchema);
    const team = await Team.findById(params.id).select('leadId').lean();
    if (!team) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const ownerId = String((team as any).leadId || user.sub);
    const project = await ensureRecurringProject(params.id, ownerId);

    const scheduleKind = body.scheduleKind === 'monthly_weekday' ? 'monthly_weekday' : 'interval';
    const intervalCount = body.intervalCount ?? 1;
    const intervalUnit = scheduleKind === 'monthly_weekday' ? 'month' : body.intervalUnit;
    const weekday = scheduleKind === 'monthly_weekday' ? (body.weekday as number) : null;
    const weekdayOrdinal =
      scheduleKind === 'monthly_weekday' ? (body.weekdayOrdinal as number) : null;

    // Snap to schedule, then catch up so a past start date never leaves "next"
    // stuck in June while today is already in August.
    const firstDue = resolveFirstDue(
      { scheduleKind, intervalUnit, intervalCount, weekday, weekdayOrdinal },
      body.startDate,
      new Date(),
    );

    const activity = await RecurringActivity.create({
      teamId: params.id,
      projectId: project._id,
      title: body.title,
      description: body.description || '',
      checklist: body.checklist || [],
      assigneeId: body.assigneeId || null,
      priority: body.priority || 'medium',
      scheduleKind,
      intervalUnit,
      intervalCount,
      weekday,
      weekdayOrdinal,
      startDate: firstDue,
      nextDueDate: firstDue,
      leadTimeDays: body.leadTimeDays ?? 0,
      active: true,
      createdBy: user.sub,
      createdByName: user.name || '',
    });

    // Spawn the first occurrence now (advances nextDueDate by one interval).
    await generateOccurrence(activity);

    await logOperation({
      action: 'recurring.create',
      category: 'general',
      actor: user,
      targetType: 'recurring_activity',
      targetId: String(activity._id),
      targetLabel: activity.title,
      summary: `Created recurring activity "${activity.title}"`,
      meta: { teamId: params.id },
    });

    return NextResponse.json(
      serializeRecurringActivity(activity.toObject(), {
        assigneeName: null,
        openOccurrenceDueDate: firstDue,
      }),
      { status: 201 },
    );
  } catch (e) {
    return handleError(e);
  }
}
