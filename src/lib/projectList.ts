/**
 * Shared server-side helpers that mirror the GET handlers of the projects
 * and teams APIs. The (authed)/projects page calls these directly during
 * SSR so the rendered HTML already contains real rows — no client-side
 * waterfall, no skeleton flash, no extra round-trips after hydration.
 */
import { connectDB } from '@/lib/db';
import { Project } from '@/models/Project';
import { Task } from '@/models/Task';
import { Team } from '@/models/Team';
import { User } from '@/models/User';
import { project as projectS } from '@/lib/serialize';
import { getLeadScope, projectsVisibleFilter } from '@/lib/leadScope';
import { cached, cacheBust } from '@/lib/cache';
import { normalizeRole } from '@/lib/auth';

export interface ProjectListItem {
  id: string;
  code: string;
  name: string;
  description?: string;
  lifecycle: string;
  status: string;
  teamId?: string;
  teamName?: string | null;
  ownerId?: string;
  ownerName?: string | null;
  dueDate?: string | Date | null;
  taskCount: number;
  tasksDone: number;
  tasksOverdue: number;
  /** Tasks completed in the last 7 days, and the 7 before that — a throughput
   *  trend (Grove: output, and the truth is in the delta, not the total). */
  done7d?: number;
  donePrev7d?: number;
  archived?: boolean;
}

/**
 * Get the project list visible to `userId`, with the same filtering the
 * GET /api/projects route supports (search, team, lifecycle, status,
 * archived). Returns rows enriched with team/owner names + task counts
 * so the UI doesn't have to make a second pass.
 */
export async function listProjectsForUser(
  userId: string,
  role: string | undefined,
  filters: {
    q?: string;
    teamId?: string;
    lifecycle?: string;
    statuses?: string[];
    archivedOnly?: boolean;
    includeArchived?: boolean;
  } = {},
): Promise<ProjectListItem[]> {
  await connectDB();

  const scope = await getLeadScope(userId, role);
  const visibility = projectsVisibleFilter(scope);
  const q: any = { ...visibility };

  if (filters.archivedOnly) q.archived = true;
  else if (!filters.includeArchived) q.archived = { $ne: true };

  if (filters.teamId) q.teamId = filters.teamId;
  if (filters.lifecycle) q.lifecycle = filters.lifecycle;
  if (filters.statuses?.length) {
    q.status = filters.statuses.length === 1 ? filters.statuses[0] : { $in: filters.statuses };
  }
  if (filters.q) {
    const safe = filters.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    q.$and = [
      visibility,
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
  if (projects.length === 0) return [];

  const projectIds = projects.map((p) => p._id);
  const nowMs = Date.now();
  const sevenDaysAgo = new Date(nowMs - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(nowMs - 14 * 24 * 60 * 60 * 1000);
  const [teams, owners, taskAgg] = await Promise.all([
    Team.find({ _id: { $in: projects.map((p) => p.teamId).filter(Boolean) } }).lean(),
    User.find({ _id: { $in: projects.map((p) => p.ownerId).filter(Boolean) } }).lean(),
    Task.aggregate([
      { $match: { projectId: { $in: projectIds } } },
      {
        $group: {
          _id: '$projectId',
          taskCount: { $sum: 1 },
          tasksDone: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
          // Grove's rule: an indicator should measure OUTPUT, and a single
          // number lies — a trend tells the truth. done7d / donePrev7d give
          // each project card a "this week vs. last" throughput delta, so a
          // glance reveals momentum (or stall), not just a static count.
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
          tasksOverdue: {
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
        },
      },
    ]),
  ]);

  const teamMap = new Map(teams.map((t) => [String(t._id), t.name]));
  const ownerMap = new Map(owners.map((o) => [String(o._id), o.name]));
  const taskMap = new Map(taskAgg.map((a: any) => [String(a._id), a]));

  return projects.map((p) => {
    const t = taskMap.get(String(p._id)) || {
      taskCount: 0,
      tasksDone: 0,
      tasksOverdue: 0,
      done7d: 0,
      donePrev7d: 0,
    };
    return {
      ...projectS(p, {
        teamName: p.teamId ? teamMap.get(String(p.teamId)) || null : null,
        ownerName: p.ownerId ? ownerMap.get(String(p.ownerId)) || null : null,
      }),
      taskCount: t.taskCount,
      tasksDone: t.tasksDone,
      tasksOverdue: t.tasksOverdue,
      done7d: t.done7d || 0,
      donePrev7d: t.donePrev7d || 0,
    } as ProjectListItem;
  });
}

// ── Cached projects-page payload ────────────────────────────────────────────
// The /projects page always SSR-loads the same shape: the viewer's active
// projects (default status filter), their team-filter options, and the
// templates they actually use. That triple is recomputed on every navigation
// to the page, so it's a strong read-through cache candidate. Filtered/searched
// loads still go through the API route uncached (those keys would explode), and
// the cache only ever holds this one default view per viewer.
const PROJECTS_PAGE_TTL_SECONDS = 15;

export interface ProjectsPagePayload {
  projects: ProjectListItem[];
  teams: Array<{ id: string; name: string }>;
  lifecycles: Array<{ key: string; label: string }>;
}

/** Cache key for a viewer's default projects-page payload — scoped by user +
 *  effective role, since role drives the visibility scope. */
function projectsPageCacheKey(sub: string, role: string | undefined): string {
  return `projlist:${sub}:${normalizeRole(role || '')}`;
}

/**
 * Read-through cached payload for the server-rendered /projects page. On a hit
 * it skips all three queries; on a miss (or when the cache is disabled) it
 * computes fresh exactly as the page did before. Transparent when Upstash is
 * not configured.
 */
export async function getProjectsPageData(
  sub: string,
  role: string | undefined,
): Promise<ProjectsPagePayload> {
  return cached(projectsPageCacheKey(sub, role), PROJECTS_PAGE_TTL_SECONDS, async () => {
    const [projects, teams, lifecycles] = await Promise.all([
      listProjectsForUser(sub, role, { statuses: ['planning', 'in_progress', 'on_hold'] }),
      listTeamsForFilter(sub, role),
      listTemplatesInUse(sub, role),
    ]);
    return { projects, teams, lifecycles };
  });
}

/**
 * Bust a viewer's cached projects-page payload after a write that changes what
 * they'd see (project create/update/delete/archive, or a task change that moves
 * a project's counts). Safe to call when the cache is disabled — it no-ops.
 */
export async function bustProjectsPageCache(sub: string, role: string | undefined): Promise<void> {
  await cacheBust(projectsPageCacheKey(sub, role));
}

/**
 * Lightweight team list for filter dropdowns — scoped to the viewer so a
 * lead/contributor only sees teams they own or belong to (admins see all).
 */
export async function listTeamsForFilter(
  userId: string,
  role: string | undefined,
): Promise<Array<{ id: string; name: string }>> {
  await connectDB();
  const scope = await getLeadScope(userId, role);
  const filter = scope.unrestricted ? {} : { _id: { $in: scope.teamOids } };
  const teams = await Team.find(filter, '_id name').sort({ name: 1 }).lean();
  return teams.map((t) => ({ id: String(t._id), name: t.name }));
}

/**
 * The distinct project templates (lifecycles) actually in use across the
 * viewer's projects — so the Projects filter lists only relevant templates
 * the user has, not the whole catalog. Labels come from LIFECYCLES.
 */
export async function listTemplatesInUse(
  userId: string,
  role: string | undefined,
): Promise<Array<{ key: string; label: string }>> {
  await connectDB();
  const scope = await getLeadScope(userId, role);
  const keys: string[] = await Project.distinct('lifecycle', projectsVisibleFilter(scope));
  const { LIFECYCLES } = await import('@/lib/lifecycles');
  return keys
    .filter(Boolean)
    .map((k) => ({ key: k, label: (LIFECYCLES as any)[k]?.label || k.replace(/_/g, ' ') }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
