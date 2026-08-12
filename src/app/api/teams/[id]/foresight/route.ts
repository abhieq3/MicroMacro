import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Team } from '@/models/Team';
import { User } from '@/models/User';
import { isLead, requireUser } from '@/lib/auth';
import { handleError } from '@/lib/http';
import {
  buildForesightBatch,
  toTeamMemberForesight,
  summarizeTeamForesight,
} from '@/lib/ai/deliveryForesight';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// A batch of member simulations; give the function room.
export const maxDuration = 30;

/**
 * Team capacity foresight — each member's Delivery Foresight rolled into one
 * verdict for the lead. Lead/admin only (it reports per-member workload
 * outlook), and only for a team the caller leads or belongs to. The roll-up
 * carries aggregate status only — never task titles — and the batch excludes
 * private/personal work, so a lead sees a member's SHARED-work outlook, nothing
 * private. Deterministic and rule-based, like every other foresight surface.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    if (!isLead(user.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }
    await connectDB();

    const team = await Team.findById(params.id).select('memberIds leadId').lean();
    if (!team) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Membership boundary — a lead may only see a team they lead or belong to;
    // admins (workspace owners) may see any.
    const me = String(user.sub);
    const isAdmin = user.role === 'admin' || user.role === 'master_admin';
    const isMember =
      String((team as any).leadId || '') === me ||
      ((team as any).memberIds || []).some((m: any) => String(m) === me);
    if (!isAdmin && !isMember) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const memberIds = ((team as any).memberIds || []).map((m: any) => String(m));
    const users = await User.find({ _id: { $in: memberIds } })
      .select('name role title')
      .lean();
    // Admins aren't team contributors — keep them out of the workload roll-up,
    // matching the team detail member list.
    const members = (users as any[]).filter((u) => u.role !== 'admin');
    const ids = members.map((u) => String(u._id));

    const fmap = await buildForesightBatch(ids, { excludePersonal: true, trials: 1500 });
    const rows = members.map((u) =>
      toTeamMemberForesight(String(u._id), u.name, u.role, fmap.get(String(u._id))!),
    );
    const summary = summarizeTeamForesight(rows);

    return NextResponse.json(summary, {
      headers: { 'Cache-Control': 'private, max-age=120, stale-while-revalidate=600' },
    });
  } catch (e) {
    return handleError(e);
  }
}
