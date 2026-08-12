import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { RecurringActivity } from '@/models/RecurringActivity';
import { requireUser } from '@/lib/auth';
import { guardTeamOwner } from '@/lib/teamAuth';
import { handleError, readBody } from '@/lib/http';
import { RecurringActivityUpdateSchema } from '@/lib/validations';
import { serializeRecurringActivity } from '@/lib/recurring';
import { logOperation } from '@/lib/audit';

export const runtime = 'nodejs';

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
    if (body.intervalUnit !== undefined) activity.intervalUnit = body.intervalUnit;
    if (body.intervalCount !== undefined) activity.intervalCount = body.intervalCount;
    if (body.leadTimeDays !== undefined) activity.leadTimeDays = body.leadTimeDays;
    if (body.active !== undefined) activity.active = body.active;
    // Re-anchoring the start date moves the next occurrence to that date.
    if (body.startDate !== undefined) {
      const start = new Date(body.startDate);
      activity.startDate = start;
      activity.nextDueDate = start;
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
