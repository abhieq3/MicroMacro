import { connectDB } from '@/lib/db';
import { Project } from '@/models/Project';
import { Task } from '@/models/Task';
import { User } from '@/models/User';
import { Team } from '@/models/Team';
import { project as projectS, task as taskS, date as toIso } from '@/lib/serialize';
import { projectRef } from '@/lib/projectRef';
import { getLeadScope, projectsVisibleFilter } from '@/lib/leadScope';
import { computeFlowStrip, type FlowSignalPayload } from '@/lib/flow/computeStrip';
import { getFlowConfig, isUiEnabled, isPilotTeamVisible } from '@/lib/flow/config';
import { cached, cacheBust } from '@/lib/cache';
import {
  buildWorkMixerFromDashboardData,
  scoreWorkCandidate,
  classifyWorkCandidate,
  taskToCandidate,
  type WorkMixerResult,
} from '@/lib/workMixer';
import { normalizeRole } from '@/lib/auth';
import { buildDeliveryProfiles, buildOpenLoad, scoreSlipRisk } from '@/lib/ai/slipRisk';

const STATUS_ORDER: Record<string, number> = { in_progress: 0, review: 1, blocked: 2, todo: 3, done: 4 };

// How long a per-user dashboard rollup may be served from cache. The dashboard
// is an operational "what's on" view, not a record — a brief staleness window
// is an acceptable trade for skipping ~9 DB queries on rapid re-navigation
// (dashboard → project → back) and multi-tab use. Lower = fresher.
const DASHBOARD_TTL_SECONDS = 15;

/** Cache key for a viewer's dashboard rollup — scoped by user + effective role
 *  (role changes the visibility scope, so it must be part of the key). */
function dashboardCacheKey(sub: string, role: string): string {
  return `dash:${sub}:${normalizeRole(role)}`;
}

/**
 * Bust a viewer's cached dashboard so their next load recomputes from MongoDB.
 * Called by mutation routes for zero staleness after a write (task move,
 * project change, etc.). Safe to call when the cache is disabled — it no-ops.
 */
export async function bustDashboardCache(sub: string, role: string): Promise<void> {
  await cacheBust(dashboardCacheKey(sub, role));
}

export interface LeadDashboardData {
  user: { id: string; name: string; email: string; role: string };
  projects: any[];
  tasks: any[];
  teamTasks: any[];
  people: any[];
  teamCount: number;
  /** Bounded fact-based "Needs attention" strip payload — server-computed so
   *  the browser never sees raw signals. Null when nothing surfaces. */
  flowSignal?: FlowSignalPayload | null;
  /** Optional internal Work Mixer output (shadow mode). Present ONLY when
   *  WORK_MIXER_ENABLED=true; absent (undefined) by default, so existing
   *  consumers are unaffected. Never used to render UI in Phase 1. */
  workMixer?: WorkMixerResult | null;
}

/**
 * Public entry point — used by both the API route and the server-rendered
 * dashboard page. Read-through cached per viewer (see DASHBOARD_TTL_SECONDS):
 * a hit returns the rollup without touching MongoDB; a miss (or a disabled /
 * unreachable cache) computes fresh via the pure fetcher below. Fully
 * transparent — when Upstash isn't configured this is just a direct call.
 */
export async function getLeadDashboardData(jwtUser: {
  sub: string;
  name: string;
  email: string;
  role: string;
}): Promise<LeadDashboardData> {
  const data = await cached(dashboardCacheKey(jwtUser.sub, jwtUser.role), DASHBOARD_TTL_SECONDS, () =>
    computeLeadDashboardData(jwtUser),
  );

  // ── Work Mixer (shadow mode, default OFF) ─────────────────────────────────
  // When WORK_MIXER_ENABLED=true, derive a bounded, deterministically-ranked
  // prioritisation view from the data ALREADY in memory — no new queries, no
  // DB, no Redis. It is attached as an optional, non-breaking field and is not
  // rendered anywhere in Phase 1. Computed AFTER the cache so the cached payload
  // (and every existing consumer) is byte-identical when the flag is off, and
  // wrapped so a bug in the mixer can never break the real dashboard.
  if (process.env.WORK_MIXER_ENABLED === 'true') {
    try {
      const workMixer = buildWorkMixerFromDashboardData(data, { now: new Date() });
      return { ...data, workMixer };
    } catch {
      return data;
    }
  }

  return data;
}

// Pure data fetcher — the actual MongoDB work. Centralising it lets the App
// Router stream the initial HTML without a client-side round-trip.
async function computeLeadDashboardData(jwtUser: {
  sub: string;
  name: string;
  email: string;
  role: string;
}): Promise<LeadDashboardData> {
  await connectDB();

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);

  const scope = await getLeadScope(jwtUser.sub, jwtUser.role);
  // Archived projects stay in the DB for the audit trail but are hidden
  // from the dashboard — operators never want them clouding "what's on".
  const projFilter = { ...projectsVisibleFilter(scope), archived: { $ne: true } };

  const projects = await Project.find(projFilter).sort({ createdAt: -1 }).lean();
  const visibleProjectIds = projects.map((p) => p._id);
  const visibleTaskPrivacyFilter = {
    $or: [
      { privateToUserId: null },
      { privateToUserId: { $exists: false } },
      { privateToUserId: scope.userOid },
    ],
  };

  const [myTasks, teamTasksRaw, teams, owners, projectTaskAgg, perUserAgg, users] = await Promise.all([
    // "My tasks" stays sorted by status so the IC's side panel keeps its
    // pipeline grouping. Bounded so the dashboard never drags a power user's
    // entire completed-task history into memory on every render: keep ALL open
    // tasks (the pipeline) plus anything completed in the last 90 days, and cap
    // like the project task list below. Done counts come from the separate
    // aggregations, so this changes no figure on screen.
    Task.find({
      assigneeId: scope.userOid,
      ...visibleTaskPrivacyFilter,
      $and: [
        {
          $or: [
            { status: { $ne: 'done' } },
            { completedAt: { $gte: new Date(now.getTime() - 90 * 86400000) } },
          ],
        },
      ],
    })
      .sort({ status: 1, dueDate: 1 })
      .limit(500)
      .lean(),
    // Project task lists are ordered by CC Target Completion Date (TCD), then
    // due date — the nearest deadline first. The dashboard re-sorts the same
    // way client-side, so the order is deterministic for every viewer and
    // carries no hidden per-user state.
    Task.find({ projectId: { $in: visibleProjectIds }, ...visibleTaskPrivacyFilter })
      .sort({ ccTcd: 1, dueDate: 1, createdAt: 1 })
      .limit(500)
      .lean(),
    // Teams in scope. An unrestricted (admin) scope deliberately carries NO
    // enumerated id lists — see getLeadScope — so it queries the collection
    // directly instead of spreading a workspace-sized $in.
    scope.unrestricted ? Team.find({}).lean() : Team.find({ _id: { $in: scope.teamOids } }).lean(),
    User.find({ _id: { $in: projects.map((p) => p.ownerId).filter(Boolean) } }, '_id name').lean(),
    Task.aggregate([
      { $match: { projectId: { $in: visibleProjectIds }, ...visibleTaskPrivacyFilter } },
      { $project: { projectId: 1, status: 1, dueDate: 1, completedAt: 1 } },
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
                    { $lt: ['$dueDate', now] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          lastCompletedAt: { $max: { $cond: [{ $eq: ['$status', 'done'] }, '$completedAt', null] } },
        },
      },
    ]),
    Task.aggregate([
      {
        $match: {
          projectId: { $in: visibleProjectIds },
          // Unrestricted scope: every assignee inside visible projects, no
          // enumerated member list. Restricted: only the viewer's members.
          ...(scope.unrestricted ? { assigneeId: { $ne: null } } : { assigneeId: { $in: scope.memberOids } }),
          ...visibleTaskPrivacyFilter,
        },
      },
      { $project: { assigneeId: 1, status: 1, dueDate: 1, completedAt: 1 } },
      {
        $facet: {
          open: [{ $match: { status: { $ne: 'done' } } }, { $group: { _id: '$assigneeId', c: { $sum: 1 } } }],
          overdue: [
            { $match: { status: { $ne: 'done' }, dueDate: { $ne: null, $lt: now } } },
            { $group: { _id: '$assigneeId', c: { $sum: 1 } } },
          ],
          doneWeek: [
            { $match: { status: 'done', completedAt: { $gte: weekAgo } } },
            { $group: { _id: '$assigneeId', c: { $sum: 1 } } },
          ],
        },
      },
    ]),
    // Exclude the admin — they own the workspace, not assignable work, so
    // they never belong in the contributor-workload list. Unrestricted scope
    // sees the whole roster (bounded — workload tiles past a few hundred
    // people would be unreadable anyway); restricted sees their members.
    scope.unrestricted
      ? User.find({ role: { $ne: 'admin' } })
          .select('_id name title')
          .limit(500)
          .lean()
      : User.find({ _id: { $in: scope.memberOids }, role: { $ne: 'admin' } })
          .select('_id name title')
          .lean(),
  ]);

  // Delivery profiles + open load for the slip-risk early warning — computed
  // once over rows already in memory (done tasks teach the model; open tasks
  // supply the pressure feature).
  const deliveryProfiles = buildDeliveryProfiles(teamTasksRaw as any);
  const openLoadByAssignee = buildOpenLoad(teamTasksRaw as any);

  const assigneeIds = [
    ...new Set(
      teamTasksRaw
        .map((t) => t.assigneeId)
        .filter(Boolean)
        .map(String),
    ),
  ];
  const assigneeUsers = assigneeIds.length
    ? await User.find({ _id: { $in: assigneeIds } }, '_id name').lean()
    : [];
  const assigneeMap = new Map(assigneeUsers.map((u) => [String(u._id), u.name]));

  const teamName = new Map(teams.map((t) => [String(t._id), t.name]));
  const ownerName = new Map(owners.map((u) => [String(u._id), u.name]));
  const projStats = new Map(projectTaskAgg.map((s: any) => [String(s._id), s]));

  const projectList = projects
    // Recurring-activity holder projects are system-managed — their task
    // occurrences still flow into the due/assigned task views (we keep them in
    // `projects` above so their tasks load), but they must never appear as a
    // project card on the dashboard.
    .filter((p) => !(p as any).isSystem)
    .map((p) => {
    const s: any = projStats.get(String(p._id)) ?? { total: 0, done: 0, overdue: 0, lastCompletedAt: null };
    const open = s.total - s.done;
    const pct = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0;
    const stagnantDays = s.lastCompletedAt
      ? Math.floor((now.getTime() - new Date(s.lastCompletedAt).getTime()) / 86400000)
      : open > 0
        ? 999
        : 0;
    const daysUntilDue = p.dueDate
      ? Math.floor((new Date(p.dueDate).getTime() - now.getTime()) / 86400000)
      : null;

    // ── Schedule pace ──────────────────────────────────────────────────────
    // Compare how far through the project's calendar we are against how much
    // work is actually done. If 80% of the time has elapsed but only 30% is
    // complete, the project is behind pace even with zero overdue tasks yet —
    // this is the early-warning signal a status badge should carry.
    let expectedPct: number | null = null;
    if (p.startDate && p.dueDate) {
      const startMs = new Date(p.startDate).getTime();
      const dueMs = new Date(p.dueDate).getTime();
      if (dueMs > startMs) {
        const elapsed = (now.getTime() - startMs) / (dueMs - startMs);
        expectedPct = Math.round(Math.min(Math.max(elapsed, 0), 1) * 100);
      }
    }
    const paceGap = expectedPct !== null ? expectedPct - pct : 0; // +ve = behind

    // Health is derived from observable signals; we also surface *why* so a
    // user hovering "At risk" sees the same reasoning a reviewer would. The
    // badge now reflects real progress + schedule pace, not just overdues.
    let health: 'healthy' | 'at_risk' | 'critical' = 'healthy';
    const reasons: string[] = [];

    // A finished project is simply "Complete" — never flag it.
    if (p.status === 'completed' || (s.total > 0 && open === 0)) {
      health = 'healthy';
      reasons.push(s.total > 0 ? `All ${s.total} tasks complete (100%)` : 'Complete');
    } else if (p.status === 'on_hold') {
      health = 'at_risk';
      reasons.push('On hold — work is paused');
    } else {
      if (s.overdue >= 3) reasons.push(`${s.overdue} overdue tasks`);
      else if (s.overdue > 0) reasons.push(`${s.overdue} overdue task${s.overdue === 1 ? '' : 's'}`);
      if (daysUntilDue !== null) {
        if (daysUntilDue < 0 && open > 0)
          reasons.push(`Past due by ${Math.abs(daysUntilDue)}d, ${pct}% done`);
        else if (daysUntilDue <= 5 && open > 0) reasons.push(`Due in ${daysUntilDue}d, ${pct}% done`);
      }
      if (paceGap >= 25) reasons.push(`Behind pace — ${pct}% done vs ~${expectedPct}% of time elapsed`);
      if (stagnantDays >= 7 && open > 0)
        reasons.push(`No tasks closed in ${stagnantDays === 999 ? 'a while' : `${stagnantDays}d`}`);

      // Critical: badly past due, a wall of overdues, or severely behind pace.
      if (s.overdue >= 3 || (daysUntilDue !== null && daysUntilDue < 0 && open > 0) || paceGap >= 40)
        health = 'critical';
      // At risk: any overdue, due-soon with open work, stagnant, or behind pace.
      else if (
        s.overdue > 0 ||
        stagnantDays >= 7 ||
        (daysUntilDue !== null && daysUntilDue <= 5 && open > 0) ||
        paceGap >= 25
      )
        health = 'at_risk';

      if (health === 'healthy') {
        reasons.push(
          s.total === 0 ? 'No tasks yet — nothing at risk' : `On track — ${pct}% done, no overdues`,
        );
      }
    }

    return {
      ...projectS(p, {
        teamName: teamName.get(String(p.teamId)) || null,
        ownerName: ownerName.get(String(p.ownerId)) || null,
        taskCount: s.total,
        tasksDone: s.done,
      }),
      // The reference shown on the card is whatever the owner picked (ccNo),
      // falling back to the system code — same rule as the API and every other
      // surface, so a changed reference reflects here too.
      code: projectRef(p),
      openTasks: open,
      overdueCount: s.overdue,
      progressPct: pct,
      health,
      healthReasons: reasons,
    };
  });

  const projMap = new Map(projects.map((p) => [String(p._id), p]));
  const sortedTasks = myTasks.sort((a, b) => {
    const s = (STATUS_ORDER[a.status || ''] || 9) - (STATUS_ORDER[b.status || ''] || 9);
    if (s !== 0) return s;
    return (
      (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) -
      (b.dueDate ? new Date(b.dueDate).getTime() : Infinity)
    );
  });
  const taskList = sortedTasks.map((t) => {
    const p = projMap.get(String(t.projectId));
    return taskS(t, { projectCode: projectRef(p), projectName: p?.name, lifecycle: p?.lifecycle });
  });

  const teamTasks = teamTasksRaw.map((t) => {
    const p = projMap.get(String(t.projectId));
    // Leverage score + the reasons behind it, from the (pure, tested) Work
    // Mixer engine — the same signals that decide priority: overdue,
    // blocked/waiting, due-soon, critical/business-critical, staleness. The
    // dashboard uses this to lead with the one thing that matters and to show
    // WHY, instead of a naive status sort.
    const candidate = taskToCandidate(t);
    const lev = scoreWorkCandidate(candidate, now);
    // `pressing` = is there a genuine near-term CAUSE to act, not just a high
    // static score? A task can score well purely on attributes (critical /
    // business-critical / needs-QA-sign-off) while its date is weeks out — that
    // has no business hijacking someone's morning. So the morning spotlight
    // only spawns when the work is actually overdue, due this week, blocked,
    // waiting, or stalled. Same engine, same instant — just the time/flow
    // signals, not the always-on flags.
    const ws = classifyWorkCandidate(candidate, now);
    const pressing = ws.overdue || ws.dueSoon || ws.blocked || ws.waiting || ws.stalled;
    return {
      id: String(t._id),
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: toIso(t.dueDate),
      ccTcd: toIso((t as any).ccTcd),
      completedAt: toIso(t.completedAt),
      projectId: String(t.projectId),
      projectCode: projectRef(p),
      projectName: p?.name ?? '',
      lifecycle: p?.lifecycle ?? null,
      assigneeId: t.assigneeId ? String(t.assigneeId) : null,
      assigneeName: t.assigneeId ? (assigneeMap.get(String(t.assigneeId)) ?? null) : null,
      subtaskCount: ((t as any).subtasks || []).length,
      subtasksDone: ((t as any).subtasks || []).filter((s: any) => s.status === 'done').length,
      subtaskTitles: ((t as any).subtasks || []).slice(0, 3).map((s: any) => s.title),
      gxpCritical: !!(t as any).gxpCritical,
      leverage: lev.score,
      pressing,
      reasons: lev.reasons.slice(0, 2),
      // Slip-risk early warning — learned from each assignee's delivery
      // history in the SAME rows we already loaded (no extra queries; see
      // lib/ai/slipRisk). Null for most tasks; a {reason} object when the
      // model judges the date likely to be missed.
      slipRisk: ((): { reason: string } | null => {
        if (!t.assigneeId) return null;
        const sig = scoreSlipRisk(
          t as any,
          deliveryProfiles.get(String(t.assigneeId)),
          openLoadByAssignee.get(String(t.assigneeId)) || 0,
          now,
        );
        return sig ? { reason: sig.reason } : null;
      })(),
    };
  });

  const f = perUserAgg[0];
  const openMap = new Map((f.open as any[]).map((r) => [String(r._id), r.c]));
  const ovMap = new Map((f.overdue as any[]).map((r) => [String(r._id), r.c]));
  const doneMap = new Map((f.doneWeek as any[]).map((r) => [String(r._id), r.c]));

  const people = users
    .map((u) => {
      const uid = String(u._id);
      const openTasks = (openMap.get(uid) as number) ?? 0;
      const overdueCount = (ovMap.get(uid) as number) ?? 0;
      const completedThisWeek = (doneMap.get(uid) as number) ?? 0;
      const loadScore = openTasks + overdueCount * 3;
      const loadLevel: 'healthy' | 'busy' | 'overloaded' =
        loadScore > 15 ? 'overloaded' : loadScore > 8 ? 'busy' : 'healthy';
      return {
        id: uid,
        name: u.name,
        title: u.title || '',
        openTasks,
        overdueCount,
        completedThisWeek,
        loadScore,
        loadLevel,
      };
    })
    .sort((a, b) => b.loadScore - a.loadScore);

  // ── Flow Signal strip ──────────────────────────────────────────────
  // Bounded, fact-only computation done on the SAME data we already loaded
  // — no extra DB calls. Returns null when nothing surfaces, when the
  // feature is off, or when the viewer's teams aren't in the pilot
  // allowlist. The browser will simply render nothing in that case.
  const cfg = getFlowConfig();
  let flowSignal: FlowSignalPayload | null = null;
  if (isUiEnabled(cfg)) {
    // Derive from the teams already loaded for this scope (works for both
    // restricted and unrestricted viewers — no enumerated id list needed).
    const teamIdsForViewer = teams.map((t) => String(t._id));
    if (isPilotTeamVisible(teamIdsForViewer, cfg)) {
      // Build a small id→name map from the data we already loaded; falling
      // back to the assignee map for "Confirmed today by X" copy when the
      // confirmer happens to be a teammate already in scope.
      const userNameById = new Map<string, string>();
      for (const u of assigneeUsers) userNameById.set(String(u._id), u.name);
      for (const u of users) userNameById.set(String(u._id), u.name);
      // The viewer might confirm their own task — make sure their name is
      // resolvable for the "by you" headline.
      userNameById.set(jwtUser.sub, jwtUser.name);

      flowSignal = computeFlowStrip({
        viewer: { id: jwtUser.sub, role: jwtUser.role },
        // teamTasksRaw is already privacy-filtered by visibleTaskPrivacyFilter
        // and scoped to projects the viewer can see.
        tasks: teamTasksRaw as any,
        projects,
        userNameById,
        cfg,
      });
    }
  }

  return {
    user: { id: jwtUser.sub, name: jwtUser.name, email: jwtUser.email, role: jwtUser.role },
    projects: projectList,
    tasks: taskList,
    teamTasks,
    people,
    // Number of teams the viewer belongs to (or all teams, for admin).
    teamCount: teams.length,
    flowSignal,
  };
}
