import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { RecurringActivity } from '@/models/RecurringActivity';
import { Team } from '@/models/Team';
import { User } from '@/models/User';
import { requireUser } from '@/lib/auth';
import { guardTeamMember, guardTeamOwner } from '@/lib/teamAuth';
import { handleError, readBody } from '@/lib/http';
import { RecurringActivityCreateSchema } from '@/lib/validations';
import {
  ensureRecurringProject,
  firstMonthlyWeekdayOnOrAfter,
  generateOccurrence,
  serializeRecurringActivity,
} from '@/lib/recurring';
import { logOperation } from '@/lib/audit';

export const runtime = 'nodejs';

async function withAssigneeNames(activities: any[]) {
  const ids = Array.from(
    new Set(activities.map((a) => a.assigneeId).filter(Boolean).map((x: any) => String(x))),
  );
  const users = ids.length ? await User.find({ _id: { $in: ids } }).select('name').lean() : [];
  const nameById = new Map(users.map((u: any) => [String(u._id), u.name]));
  return activities.map((a) =>
    serializeRecurringActivity(a, {
      assigneeName: a.assigneeId ? nameById.get(String(a.assigneeId)) || null : null,
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
    return NextResponse.json(await withAssigneeNames(activities));
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

    // Snap first due to the schedule. Interval: use startDate as-is.
    // Monthly weekday: next matching weekday on or after startDate.
    const anchor = new Date(body.startDate);
    const firstDue =
      scheduleKind === 'monthly_weekday' && weekday !== null && weekdayOrdinal !== null
        ? firstMonthlyWeekdayOnOrAfter(anchor, weekday, weekdayOrdinal)
        : anchor;

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
      }),
      { status: 201 },
    );
  } catch (e) {
    return handleError(e);
  }
}
