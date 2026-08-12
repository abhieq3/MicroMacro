import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { Project } from '@/models/Project';
import { Task } from '@/models/Task';
import { requireUser } from '@/lib/auth';
import { handleError } from '@/lib/http';
import { task as taskS } from '@/lib/serialize';
import { projectRef } from '@/lib/projectRef';
import { NOT_PERSONAL } from '@/lib/leadScope';
import mongoose from 'mongoose';

export const runtime = 'nodejs';

const STATUS_ORDER: Record<string, number> = { in_progress: 0, review: 1, blocked: 2, todo: 3, done: 4 };

export async function GET(req: NextRequest) {
  try {
    const { user: jwtUser, error } = await requireUser(req);
    if (error) return error;
    await connectDB();

    const userId = jwtUser.sub;
    const now = new Date();
    const in7 = new Date(now.getTime() + 7 * 86400000);
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const oid = new mongoose.Types.ObjectId(userId);

    // ── Everything in parallel — one DB round trip per query ─────────────
    const [tasks, allProjects, summaryAgg, statusAgg, orgData] = await Promise.all([
      // All open tasks (the pipeline) plus anything completed in the last 90
      // days, capped — so the list never drags a user's entire done-history.
      // The done/total figures below come from the separate aggregations, so
      // bounding this list changes no number on screen.
      Task.find({
        assigneeId: userId,
        $or: [
          { status: { $ne: 'done' } },
          { completedAt: { $gte: new Date(now.getTime() - 90 * 86400000) } },
        ],
      })
        .sort({ status: 1, dueDate: 1 })
        .limit(500)
        .lean(),
      Project.find({ $or: [NOT_PERSONAL, { ownerId: userId }] })
        .select('_id code ccNo name lifecycle status isSystem')
        .lean(),
      // Summary aggregation
      Task.aggregate([
        { $match: { assigneeId: oid } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            done: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
            overdue: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: ['$status', 'done'] },
                      { $ne: ['$dueDate', null] },
                      { $lt: ['$dueDate', now] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            dueThisWeek: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: ['$status', 'done'] },
                      { $ne: ['$dueDate', null] },
                      { $gte: ['$dueDate', now] },
                      { $lte: ['$dueDate', in7] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]),
      Task.aggregate([{ $match: { assigneeId: oid } }, { $group: { _id: '$status', c: { $sum: 1 } } }]),
      // Lead org stats — anyone with workspace-management access (lead/pm/admin)
      jwtUser.role === 'lead' || jwtUser.role === 'admin'
        ? Task.aggregate([
            {
              $facet: {
                open: [{ $match: { status: { $ne: 'done' } } }, { $count: 'n' }],
                overdue: [
                  { $match: { status: { $ne: 'done' }, dueDate: { $ne: null, $lt: now } } },
                  { $count: 'n' },
                ],
                doneThisMonth: [
                  { $match: { status: 'done', completedAt: { $gte: monthStart } } },
                  { $count: 'n' },
                ],
              },
            },
          ])
        : Promise.resolve(null),
    ]);

    // ── Build tasks response ───────────────────────────────────────────────
    const pMap = new Map(allProjects.map((p) => [String(p._id), p]));
    const sortedTasks = tasks.sort((a, b) => {
      const s = (STATUS_ORDER[a.status || ''] || 9) - (STATUS_ORDER[b.status || ''] || 9);
      if (s !== 0) return s;
      return (
        (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) -
        (b.dueDate ? new Date(b.dueDate).getTime() : Infinity)
      );
    });
    const taskList = sortedTasks.map((t) => {
      const p = pMap.get(String(t.projectId));
      return taskS(t, {
        projectCode: projectRef(p),
        projectName: p?.name,
        lifecycle: p?.lifecycle,
        subtaskCount: ((t as any).subtasks || []).length,
        subtasksDone: ((t as any).subtasks || []).filter((s: any) => s.status === 'done').length,
      });
    });

    // ── Summary ───────────────────────────────────────────────────────────
    const a = summaryAgg[0] ?? { total: 0, done: 0, overdue: 0, dueThisWeek: 0 };
    const summary = {
      totalAssigned: a.total,
      completed: a.done,
      overdue: a.overdue,
      dueThisWeek: a.dueThisWeek,
      completionRate: a.total ? Math.round((a.done / a.total) * 100) : 0,
      byStatus: Object.fromEntries(statusAgg.map((x: any) => [x._id, x.c])),
    };

    // ── Org totals (PM only) ──────────────────────────────────────────────
    let orgTotals = null;
    if (orgData) {
      const g = orgData[0];
      const activeCount = allProjects.filter((p) => p.status === 'in_progress').length;
      orgTotals = {
        tasksOpen: g.open[0]?.n ?? 0,
        tasksOverdue: g.overdue[0]?.n ?? 0,
        doneThisMonth: g.doneThisMonth[0]?.n ?? 0,
        activeProjects: activeCount,
      };
    }

    return NextResponse.json({
      user: {
        id: jwtUser.sub,
        name: jwtUser.name,
        email: jwtUser.email,
        role: jwtUser.role,
        title: jwtUser.title,
      },
      summary,
      tasks: taskList,
      subtasks: [], // kept for API compat; subtasks remain separate
      projects: allProjects
        .filter((p) => !(p as any).isSystem)
        .map((p) => ({
          id: String(p._id),
          name: p.name,
          code: (p as any).ccNo || p.code,
          status: p.status,
          lifecycle: p.lifecycle,
        })),
      orgTotals,
    });
  } catch (e) {
    return handleError(e);
  }
}
