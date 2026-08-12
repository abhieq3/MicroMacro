import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Task } from '@/models/Task';
import { SuggestionEvent } from '@/models/SuggestionEvent';
import { isAdmin, requireUser } from '@/lib/auth';
import { handleError } from '@/lib/http';

export const runtime = 'nodejs';

/**
 * Training table dump — completed tasks + suggest accept/override rows.
 * Admin only. Used to fit a later GBDT; the live ranker already consumes
 * SuggestionEvent incrementally.
 */
export async function GET(req: NextRequest) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    if (!isAdmin(user!.role)) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }
    await connectDB();

    const [completions, events] = await Promise.all([
      Task.find({
        status: 'done',
        completedAt: { $ne: null },
        $or: [{ privateToUserId: null }, { privateToUserId: { $exists: false } }],
      })
        .select(
          'title assigneeId projectId taskType createdAt startedAt completedAt completedByUserId dueDate ccTcd gxpCritical',
        )
        .sort({ completedAt: -1 })
        .limit(5000)
        .lean(),
      SuggestionEvent.find({})
        .select(
          'projectId title variant suggestedAssigneeId suggestedDueDate chosenAssigneeId chosenDueDate acceptedAssignee acceptedDue modelVersion createdAt',
        )
        .sort({ createdAt: -1 })
        .limit(5000)
        .lean(),
    ]);

    const rows = (completions as any[]).map((t) => {
      const created = t.createdAt ? +new Date(t.createdAt) : null;
      const started = t.startedAt ? +new Date(t.startedAt) : created;
      const completed = t.completedAt ? +new Date(t.completedAt) : null;
      const due = t.ccTcd || t.dueDate ? +new Date(t.ccTcd || t.dueDate) : null;
      return {
        kind: 'completion' as const,
        taskId: String(t._id),
        projectId: String(t.projectId),
        title: t.title,
        taskType: t.taskType || 'task',
        assigneeId: t.assigneeId ? String(t.assigneeId) : '',
        completedByUserId: t.completedByUserId ? String(t.completedByUserId) : '',
        cycleDays:
          created != null && completed != null
            ? Math.round((completed - created) / 86_400_000)
            : null,
        workDays:
          started != null && completed != null
            ? Math.round((completed - started) / 86_400_000)
            : null,
        late: due != null && completed != null ? completed > due + 43_200_000 : null,
        gxpCritical: !!t.gxpCritical,
        createdAt: t.createdAt,
        startedAt: t.startedAt || null,
        completedAt: t.completedAt,
        dueDate: t.ccTcd || t.dueDate || null,
      };
    });

    const suggestRows = (events as any[]).map((e) => ({
      kind: 'suggest' as const,
      projectId: String(e.projectId),
      title: e.title,
      variant: e.variant,
      suggestedAssigneeId: e.suggestedAssigneeId,
      suggestedDueDate: e.suggestedDueDate,
      chosenAssigneeId: e.chosenAssigneeId,
      chosenDueDate: e.chosenDueDate,
      acceptedAssignee: !!e.acceptedAssignee,
      acceptedDue: !!e.acceptedDue,
      modelVersion: e.modelVersion,
      createdAt: e.createdAt,
    }));

    const heur = suggestRows.filter((e) => e.variant === 'heuristic');
    const rank = suggestRows.filter((e) => e.variant === 'ranker');
    const rate = (xs: typeof suggestRows, key: 'acceptedAssignee' | 'acceptedDue') =>
      xs.length ? Math.round((xs.filter((x) => x[key]).length / xs.length) * 1000) / 1000 : null;

    return NextResponse.json({
      exportedAt: new Date().toISOString(),
      summary: {
        completions: rows.length,
        suggestEvents: suggestRows.length,
        heuristicAssigneeAccept: rate(heur, 'acceptedAssignee'),
        rankerAssigneeAccept: rate(rank, 'acceptedAssignee'),
        heuristicDueAccept: rate(heur, 'acceptedDue'),
        rankerDueAccept: rate(rank, 'acceptedDue'),
      },
      completions: rows,
      suggestEvents: suggestRows,
    });
  } catch (e) {
    return handleError(e);
  }
}
