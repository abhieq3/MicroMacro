import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { RecurringActivity } from '@/models/RecurringActivity';
import { requireUser } from '@/lib/auth';
import { guardTeamMember, guardTeamOwner } from '@/lib/teamAuth';
import { handleError, readBody } from '@/lib/http';
import { RecurringActivityUpdateSchema } from '@/lib/validations';
import { firstMonthlyWeekdayOnOrAfter, serializeRecurringActivity } from '@/lib/recurring';
import { logOperation } from '@/lib/audit';

export const runtime = 'nodejs';

// Read one recurring activity (any team member). Used from task detail so the
// schedule can be inspected without listing the whole team series.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; raId: string } },
) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const denied = await guardTeamMember(params.id, String(user.sub), user.role);
    if (denied) return denied;

    const activity = await RecurringActivity.findOne({ _id: params.raId, teamId: params.id }).lean();
    if (!activity) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(serializeRecurringActivity(activity));
  } catch (e) {
    return handleError(e);
  }
}

// Edit a recurring activity (lead/admin). Changes apply to FUTURE occurrences
// only — occurrences already materialised are independent tasks and are left
// untouched, so history stays honest.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; raId: string } },
) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const denied = await guardTeamOwner(params.id, String(user.sub), user.role);
    if (denied) return denied;

    const activity = await RecurringActivity.findOne({ _id: params.raId, teamId: params.id });
    if (!activity) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await readBody(req, RecurringActivityUpdateSchema);
    if (body.title !== undefined) activity.title = body.title;
    if (body.description !== undefined) activity.description = body.description;
    if (body.checklist !== undefined) activity.checklist = body.checklist as any;
    if (body.assigneeId !== undefined) activity.assigneeId = (body.assigneeId as any) || null;
    if (body.priority !== undefined) activity.priority = body.priority;
    if (body.scheduleKind !== undefined) {
      (activity as any).scheduleKind = body.scheduleKind;
      if (body.scheduleKind === 'monthly_weekday') {
        activity.intervalUnit = 'month';
      }
    }
    if (body.intervalUnit !== undefined && (activity as any).scheduleKind !== 'monthly_weekday') {
      activity.intervalUnit = body.intervalUnit;
    }
    if (body.intervalCount !== undefined) activity.intervalCount = body.intervalCount;
    if (body.weekday !== undefined) (activity as any).weekday = body.weekday;
    if (body.weekdayOrdinal !== undefined) (activity as any).weekdayOrdinal = body.weekdayOrdinal;
    if (body.leadTimeDays !== undefined) activity.leadTimeDays = body.leadTimeDays;
    if (body.active !== undefined) activity.active = body.active;
    // Re-anchoring: snap monthly-weekday to the real calendar occurrence.
    if (body.startDate !== undefined) {
      const start = new Date(body.startDate);
      const kind = (activity as any).scheduleKind || 'interval';
      const due =
        kind === 'monthly_weekday' &&
        typeof (activity as any).weekday === 'number' &&
        typeof (activity as any).weekdayOrdinal === 'number'
          ? firstMonthlyWeekdayOnOrAfter(
              start,
              (activity as any).weekday,
              (activity as any).weekdayOrdinal,
            )
          : start;
      activity.startDate = due;
      activity.nextDueDate = due;
    } else if (
      body.scheduleKind === 'monthly_weekday' ||
      body.weekday !== undefined ||
      body.weekdayOrdinal !== undefined
    ) {
      // Pattern changed without a new anchor — re-snap next due from today.
      const kind = (activity as any).scheduleKind || 'interval';
      if (
        kind === 'monthly_weekday' &&
        typeof (activity as any).weekday === 'number' &&
        typeof (activity as any).weekdayOrdinal === 'number'
      ) {
        const next = firstMonthlyWeekdayOnOrAfter(
          new Date(),
          (activity as any).weekday,
          (activity as any).weekdayOrdinal,
        );
        activity.nextDueDate = next;
      }
    }
    await activity.save();

    await logOperation({
      action: 'recurring.update',
      category: 'general',
      actor: user,
      targetType: 'recurring_activity',
      targetId: String(activity._id),
      targetLabel: activity.title,
      summary: `Updated recurring activity "${activity.title}"`,
      meta: { teamId: params.id },
    });

    return NextResponse.json(serializeRecurringActivity(activity.toObject()));
  } catch (e) {
    return handleError(e);
  }
}

// Delete a recurring activity definition (lead/admin). Occurrences already
// created remain as ordinary tasks; they simply stop recurring.
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; raId: string } },
) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const denied = await guardTeamOwner(params.id, String(user.sub), user.role);
    if (denied) return denied;

    const activity = await RecurringActivity.findOne({ _id: params.raId, teamId: params.id }).lean();
    if (!activity) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await RecurringActivity.deleteOne({ _id: params.raId });

    await logOperation({
      action: 'recurring.delete',
      category: 'general',
      actor: user,
      targetType: 'recurring_activity',
      targetId: String(params.raId),
      targetLabel: (activity as any).title,
      summary: `Deleted recurring activity "${(activity as any).title}"`,
      meta: { teamId: params.id },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
