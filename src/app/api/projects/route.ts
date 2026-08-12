import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Project } from '@/models/Project';
import { Task } from '@/models/Task';
import { Team } from '@/models/Team';
import { User } from '@/models/User';
import { isLead, requireUser } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';
import { project as projectS } from '@/lib/serialize';
import { LIFECYCLES, LifecycleKey } from '@/lib/lifecycles';
import { ProjectCreateSchema } from '@/lib/validations';
import { getLeadScope, projectsVisibleFilter } from '@/lib/leadScope';
import { logOperation } from '@/lib/audit';
import { bustDashboardCache } from '@/lib/leadDashboard';
import { bustProjectsPageCache } from '@/lib/projectList';
import mongoose from 'mongoose';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();

    const scope = await getLeadScope(user!.sub, user!.role);
    const visibilityFilter = projectsVisibleFilter(scope);

    const { searchParams } = req.nextUrl;
    const q: any = { ...visibilityFilter };
    // System-managed projects (the per-team recurring-activity holder) never
    // appear in the project list — their task occurrences surface as tasks.
    q.isSystem = { $ne: true };

    // Archived projects are hidden by default — pass ?includeArchived=1
    // to retrieve them, or ?archived=1 to fetch *only* the archive bin.
    const includeArchived = searchParams.get('includeArchived') === '1';
    const archivedOnly = searchParams.get('archived') === '1';
    if (archivedOnly) q.archived = true;
    else if (!includeArchived) q.archived = { $ne: true };

    const teamId = searchParams.get('teamId');
    if (teamId) q.teamId = teamId;
    const statuses = searchParams.getAll('status');
    if (statuses.length === 1) q.status = statuses[0];
    else if (statuses.length > 1) q.status = { $in: statuses };
    const lifecycle = searchParams.get('lifecycle');
    if (lifecycle) q.lifecycle = lifecycle;
    const term = searchParams.get('q');
    if (term) {
      // Escape all regex metacharacters before passing user input to $regex —
      // raw user strings can cause catastrophic backtracking (ReDoS).
      const safe = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      q.$and = [
        visibilityFilter,
        {
          $or: [
            { name: { $regex: safe, $options: 'i' } },
            { code: { $regex: safe, $options: 'i' } },
            { description: { $regex: safe, $options: 'i' } },
          ],
        },
      ];
      delete q.$or;
    }
    const projects = await Project.find(q)
      .select(
        'code ccNo refLabel name description lifecycle status priority teamId ownerId startDate dueDate completedAt gxpImpact archived archivedAt archivedBy isPersonal personal createdAt',
      )
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    // teams / owners / task counts all depend only on `projects`, so fetch them
    // concurrently instead of in three sequential round-trips.
    const [teams, owners, taskAgg] = await Promise.all([
      Team.find({ _id: { $in: projects.map((p) => p.teamId).filter(Boolean) } }).lean(),
      User.find({ _id: { $in: projects.map((p) => p.ownerId).filter(Boolean) } }).lean(),
      (() => {
        const now = Date.now();
        const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
        const fourteenDaysAgo = new Date(now - 14 * 24 * 60 * 60 * 1000);
        // Match the SSR projectList shape exactly so a filtered/searched refetch
        // keeps the overdue count AND the throughput trend on each card.
        return Task.aggregate([
          { $match: { projectId: { $in: projects.map((p) => p._id) } } },
          {
            $group: {
              _id: '$projectId',
              total: { $sum: 1 },
              done: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
              overdue: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $ne: ['$status', 'done'] },
                        { $ne: ['$dueDate', null] },
                        { $lt: ['$dueDate', new Date()] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              done7d: {
                $sum: {
                  $cond: [
                    { $and: [{ $eq: ['$status', 'done'] }, { $gte: ['$completedAt', sevenDaysAgo] }] },
                    1,
                    0,
                  ],
                },
              },
              donePrev7d: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ['$status', 'done'] },
                        { $gte: ['$completedAt', fourteenDaysAgo] },
                        { $lt: ['$completedAt', sevenDaysAgo] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ]);
      })(),
    ]);
    const tMap = new Map(teams.map((t) => [String(t._id), t.name]));
    const oMap = new Map(owners.map((o) => [String(o._id), o.name]));
    const agg = new Map<string, any>(taskAgg.map((a: any) => [String(a._id), a]));
    return NextResponse.json(
      projects.map((p) => {
        const a = agg.get(String(p._id)) || {};
        return projectS(p, {
          teamName: tMap.get(String(p.teamId)) || null,
          ownerName: oMap.get(String(p.ownerId)) || null,
          taskCount: a.total || 0,
          tasksDone: a.done || 0,
          tasksOverdue: a.overdue || 0,
          done7d: a.done7d || 0,
          donePrev7d: a.donePrev7d || 0,
        });
      }),
    );
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    // Personal projects are private to-do workspaces any authenticated user may
    // create. Real (GxP) projects remain restricted to team leads / admins.
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const body = await readBody(req, ProjectCreateSchema);
    const isPersonal = body.isPersonal === true || body.personal === true;

    if (!isPersonal && !isLead(user!.role)) {
      return NextResponse.json(
        { error: 'Only team leaders can create shared projects. You can still create a personal project.' },
        { status: 403 },
      );
    }

    const lc = LIFECYCLES[body.lifecycle as LifecycleKey] || LIFECYCLES.generic;

    // Generate a collision-resistant code using a timestamp+random suffix
    // instead of countDocuments — the count approach is not race-safe and
    // also counts cancelled/archived projects, causing duplicate-key errors.
    function genProjectCode(lifecycle: string): string {
      const prefix = lifecycle.toUpperCase().replace(/_/g, '').slice(0, 8);
      const year = new Date().getFullYear();
      const ts = Date.now().toString(36).slice(-4).toUpperCase();
      const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
      return `${prefix}-${year}-${ts}${rand}`;
    }

    const code = isPersonal
      ? `PRSN-${String(user!.sub).slice(-6)}-${Date.now().toString(36).toUpperCase()}`
      : body.code || genProjectCode(body.lifecycle || 'generic');

    // Use customPhases if provided, otherwise fall back to lifecycle template.
    // Personal projects start empty — they are an unstructured private list,
    // not a validated lifecycle, so no regulatory phases/tasks are seeded.
    // Normalise every task into a uniform shape. customPhases tasks may arrive
    // as bare strings (templates) or as objects carrying an assignee and dates
    // chosen during creation; built-in lifecycle tasks are always bare titles.
    type SeedTask = { title: string; assigneeId?: string; startDate?: string; dueDate?: string };
    const normalizeTask = (t: any): SeedTask =>
      typeof t === 'string'
        ? { title: t }
        : { title: t.title, assigneeId: t.assigneeId, startDate: t.startDate, dueDate: t.dueDate };
    const sourcePhases: { name: string; tasks: SeedTask[] }[] = isPersonal
      ? []
      : body.customPhases && body.customPhases.length > 0
        ? body.customPhases.map((ph, i) => ({
            name: ph.name || `Stage ${i + 1}`,
            tasks: ph.tasks.map(normalizeTask),
          }))
        : lc.phases.map((ph) => ({ name: ph.name, tasks: ph.tasks.map((t) => ({ title: t.title })) }));

    const phaseDocs = sourcePhases.map((ph, i) => ({
      _id: new mongoose.Types.ObjectId(),
      name: ph.name,
      position: i,
    }));

    const project = await Project.create({
      code,
      // Every shared project is born with a reference number. The system seeds
      // it from the generated code; the owner can retitle it later by tapping
      // the number on the detail page. Personal projects carry no shared ref.
      ccNo: body.ccNo || (isPersonal ? '' : code),
      refLabel: body.refLabel || '',
      name: body.name,
      description: body.description || '',
      lifecycle: isPersonal ? 'generic' : body.lifecycle,
      priority: body.priority || 'medium',
      // A personal project is never attached to a team and is always owned by
      // its creator — that is what keeps it private to them.
      teamId: isPersonal ? undefined : body.teamId || undefined,
      ownerId: isPersonal ? user!.sub : body.ownerId || user!.sub,
      isPersonal,
      personal: isPersonal,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      gxpImpact: isPersonal ? 'none' : body.gxpImpact || 'none',
      regulatoryRefs: isPersonal ? '' : lc.regulatoryRefs,
      phases: phaseDocs,
    });

    // Seed tasks from custom or template phases
    const taskDocs: any[] = [];
    sourcePhases.forEach((ph, i) => {
      for (const t of ph.tasks) {
        const title = (t.title || '').trim();
        if (title) {
          taskDocs.push({
            projectId: project._id,
            phaseId: phaseDocs[i]._id,
            title,
            taskType: 'task',
            priority: body.priority || 'medium',
            // Per-task assignee and dates picked during creation. Left undefined
            // when not chosen so the task stays unassigned / undated as before.
            assigneeId: t.assigneeId || undefined,
            startDate: t.startDate ? new Date(t.startDate) : undefined,
            dueDate: t.dueDate ? new Date(t.dueDate) : undefined,
          });
        }
      }
    });
    if (taskDocs.length) await Task.insertMany(taskDocs);

    // Personal projects are private and never enter the cross-user audit trail.
    if (!isPersonal) {
      await logOperation({
        action: 'project.create',
        category: 'project',
        actor: user,
        targetType: 'project',
        targetId: String(project._id),
        targetLabel: project.name,
        summary: `Created project ${project.code} — ${project.name}`,
      });
    }

    void bustDashboardCache(user!.sub, user!.role);
    void bustProjectsPageCache(user!.sub, user!.role);
    return NextResponse.json(projectS(project));
  } catch (e) {
    return handleError(e);
  }
}
