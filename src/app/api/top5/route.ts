import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Top5 } from '@/models/Top5';
import { User } from '@/models/User';
import { requireUser } from '@/lib/auth';
import { getLeadScope } from '@/lib/leadScope';
import { handleError, readBody } from '@/lib/http';
import { Top5UpsertSchema } from '@/lib/validations';
import { isoWeekKey, normalizeTop5Items, FEED_MAX_AGE_DAYS } from '@/lib/top5';
import { rateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';

/**
 * Top 5 Things (T5T) — see lib/top5 for the practice.
 *
 * GET  → { week, mine, feed } — my current-week list plus the latest recent
 *        list from every teammate in scope. The feed is OPEN to every role:
 *        signals travel straight across the team with no layer in between
 *        (that is the point), and everyone gets to learn from them. Admins
 *        see the whole workspace.
 * PUT  → upsert my list for the current ISO week.
 *
 * Deliberately NOT audit-logged: this is a thinking channel, not a record.
 * The moment thoughts become compliance artifacts, the honest ones stop
 * being written.
 */
export async function GET(req: NextRequest) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();

    const week = isoWeekKey();
    const scope = await getLeadScope(user!.sub, user!.role);

    const since = new Date(Date.now() - FEED_MAX_AGE_DAYS * 86_400_000);
    // Latest entry per user, newest first. Admins (unrestricted) read the
    // whole workspace; everyone else reads their team-membership set.
    const match: any = { updatedAt: { $gte: since } };
    if (!scope.unrestricted) match.userId = { $in: scope.memberOids };

    const docs = await Top5.find(match).sort({ updatedAt: -1 }).limit(200).lean();
    const latestByUser = new Map<string, any>();
    for (const d of docs) {
      const key = String(d.userId);
      if (!latestByUser.has(key)) latestByUser.set(key, d);
    }

    const userIds = [...latestByUser.keys()];
    const users = userIds.length
      ? await User.find({ _id: { $in: userIds } }, 'name username avatarLetter avatarBg avatarFont').lean()
      : [];
    const userMap = new Map(users.map((u: any) => [String(u._id), u]));

    const feed = [...latestByUser.values()]
      .map((d: any) => {
        const u = userMap.get(String(d.userId));
        return {
          userId: String(d.userId),
          name: u?.name || 'Unknown',
          username: u?.username || null,
          avatarLetter: u?.avatarLetter || '',
          avatarBg: u?.avatarBg || '',
          avatarFont: u?.avatarFont ?? 0,
          week: d.week,
          items: d.items || [],
          updatedAt: d.updatedAt,
        };
      })
      // Deactivated / deleted accounts drop out of the feed with their name.
      .filter((f) => f.name !== 'Unknown')
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    const mineDoc = await Top5.findOne({ userId: user!.sub, week }).lean();
    const mine = mineDoc ? { week, items: mineDoc.items || [], updatedAt: (mineDoc as any).updatedAt } : null;

    return NextResponse.json({ week, mine, feed });
  } catch (e) {
    return handleError(e);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    if (!rateLimit(`top5:${user!.sub}`, 20, 60_000)) {
      return NextResponse.json({ error: 'Too many updates. Take a breath.' }, { status: 429 });
    }
    const body = await readBody(req);
    const parsed = Top5UpsertSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Give me one to five short lines.' },
        { status: 400 },
      );
    }
    const items = normalizeTop5Items(parsed.data.items);
    if (items.length === 0) {
      return NextResponse.json({ error: 'Write at least one thing on your mind.' }, { status: 400 });
    }
    await connectDB();
    const week = isoWeekKey();
    const doc = await Top5.findOneAndUpdate(
      { userId: user!.sub, week },
      { $set: { items } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();
    return NextResponse.json({ week, items: doc!.items, updatedAt: (doc as any).updatedAt });
  } catch (e) {
    return handleError(e);
  }
}
