import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { Task } from '@/models/Task';
import { Project } from '@/models/Project';
import { AuditLog } from '@/models/AuditLog';
import { normalizeRole, type Role } from '@/lib/auth';
import { getLeadScope, projectsVisibleFilter, NOT_PERSONAL } from '@/lib/leadScope';
import { bucketTasks, dayWindowInTz, digestTimeZone, type DigestTask } from '@/lib/digest';

/**
 * Daily Brief — the channel-agnostic "what's on your plate today" object.
 *
 * One brief per user per day, personalised by role:
 *   • contributor — my overdue / due-today / coming-up tasks, approvals
 *     waiting on me, and what I closed yesterday.
 *   • lead — the same personal lens PLUS a team pulse: stalest blocked work,
 *     QA sign-offs pending, who's carrying overdue load.
 *   • admin — the personal lens PLUS a workspace rundown: yesterday's
 *     throughput, total overdue, riskiest shared projects, and notable audit
 *     events. Aggregates only ever cover SHARED projects (NOT_PERSONAL) —
 *     personal projects stay invisible, same as every other rollup.
 *
 * Strictly read-only and rule-based (selection/ranking never calls an LLM —
 * see the architectural invariants in the README). Channels (the dashboard
 * card today; push/email/ICS later) are dumb renderers of this one object,
 * which is what keeps the daily rundown free at any scale.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** Look-ahead for the "coming up" row — deliberately short; the brief is
 *  about today, not a re-render of the whole backlog. */
const SOON_DAYS = 2;
/** Per-list cap. Three of anything is a brief; ten is a report. */
const LIST_CAP = 3;

export interface BriefItem {
  id: string;
  title: string;
  projectName: string | null;
  label: string;
  priority: string | null;
}

export interface BriefBlockedItem {
  id: string;
  title: string;
  projectName: string | null;
  /** Whole days since the task last moved. */
  days: number;
}

export interface DailyBrief {
  role: Role;
  dateLabel: string;
  headline: string;
  hasContent: boolean;
  my: {
    overdue: BriefItem[];
    today: BriefItem[];
    soon: BriefItem[];
    /** Open tasks assigned to me that still need a QA sign-off. */
    approvals: number;
    /** Tasks I closed during yesterday's day-window. */
    winsYesterday: number;
  };
  team?: {
    blocked: BriefBlockedItem[];
    signoffsPending: number;
    overdueByMember: { name: string; count: number }[];
  };
  workspace?: {
    doneYesterday: number;
    overdueTotal: number;
    activeProjects: number;
    risky: { id: string; name: string; overdue: number }[];
    auditHighlights: { summary: string; at: string }[];
  };
}

/* ── Pure: headline composition (rule-based, unit-tested) ─────────────────── */

export interface HeadlineCounts {
  role: Role;
  overdue: number;
  today: number;
  soon: number;
  blocked?: number;
  signoffs?: number;
  doneYesterday?: number;
  overdueTotal?: number;
}

/** One deterministic sentence that tells the reader where to start. */
export function composeHeadline(c: HeadlineCounts): string {
  const s = (n: number) => (n === 1 ? '' : 's');

  if (c.role === 'admin' || c.role === 'master_admin') {
    const done = c.doneYesterday ?? 0;
    const over = c.overdueTotal ?? 0;
    if (done === 0 && over === 0 && c.today === 0 && c.overdue === 0) {
      return 'Workspace is quiet — nothing closed yesterday, nothing overdue.';
    }
    return `Workspace: ${done} task${s(done)} closed yesterday, ${over} overdue across shared projects.`;
  }

  if (c.role === 'lead' && (c.blocked ?? 0) > 0) {
    return `${c.blocked} task${s(c.blocked!)} blocked on your team — unblock ${c.blocked === 1 ? 'it' : 'them'} before they slip.`;
  }
  if (c.role === 'lead' && (c.signoffs ?? 0) > 0 && c.today === 0 && c.overdue === 0) {
    return `${c.signoffs} QA sign-off${s(c.signoffs!)} pending on your team.`;
  }

  if (c.overdue > 0 && c.today > 0) {
    return `${c.today} due today and ${c.overdue} overdue — clear the overdue first.`;
  }
  if (c.overdue > 0) {
    return `${c.overdue} overdue task${s(c.overdue)} — today's the day to close ${c.overdue === 1 ? 'it' : 'them'} out.`;
  }
  if (c.today > 0) {
    return `${c.today} task${s(c.today)} due today${c.soon > 0 ? `, ${c.soon} more coming up` : ''} — you've got this.`;
  }
  if (c.soon > 0) {
    return `Nothing due today — ${c.soon} coming up in the next ${SOON_DAYS} days.`;
  }
  return 'All clear — nothing due today.';
}

/* ── DB orchestration ─────────────────────────────────────────────────────── */

/** Effective-due "already overdue" filter, exact ccTcd-wins semantics:
 *  overdue ⇔ (ccTcd set and past) OR (no ccTcd and dueDate past). */
function overdueFilter(start: Date) {
  return { $or: [{ ccTcd: { $lt: start } }, { ccTcd: null, dueDate: { $lt: start } }] };
}

export async function buildDailyBrief(
  userId: string,
  roleRaw: string | null | undefined,
  now: Date = new Date(),
): Promise<DailyBrief> {
  await connectDB();

  const role = normalizeRole(roleRaw);
  const tz = digestTimeZone();
  const window = dayWindowInTz(now, tz);
  const yesterdayStart = new Date(window.start.getTime() - DAY_MS);
  const upper = new Date(window.end.getTime() + SOON_DAYS * DAY_MS);
  const me = new mongoose.Types.ObjectId(userId);
  const dateLabel = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now);

  /* My lens — every role gets this. */
  const [myOpen, approvals, winsYesterday] = await Promise.all([
    Task.find({
      assigneeId: me,
      status: { $ne: 'done' },
      $or: [{ dueDate: { $lt: upper } }, { ccTcd: { $lt: upper } }],
    })
      .select('_id title priority dueDate ccTcd projectId')
      .limit(300)
      .lean(),
    Task.countDocuments({
      assigneeId: me,
      status: { $ne: 'done' },
      requiresQaSignoff: true,
      qaSignoffAt: null,
    }),
    Task.countDocuments({
      assigneeId: me,
      status: 'done',
      completedAt: { $gte: yesterdayStart, $lt: window.start },
    }),
  ]);
  const buckets = bucketTasks(myOpen as any[], window, SOON_DAYS);

  const projectIds = new Set<string>();
  const collect = (t: { projectId: string | null }) => t.projectId && projectIds.add(t.projectId);
  buckets.overdue.forEach(collect);
  buckets.today.forEach(collect);
  buckets.soon.forEach(collect);

  const brief: DailyBrief = {
    role,
    dateLabel,
    headline: '',
    hasContent: false,
    my: {
      overdue: [],
      today: [],
      soon: [],
      approvals,
      winsYesterday,
    },
  };

  /* Team lens — leads only (admins get the workspace lens instead). */
  let blockedDocs: any[] = [];
  if (role === 'lead') {
    const scope = await getLeadScope(userId, role);
    const visible = await Project.find({ ...projectsVisibleFilter(scope), archived: { $ne: true } })
      .select('_id')
      .limit(500)
      .lean();
    const pids = visible.map((p: any) => p._id);

    const [blocked, signoffsPending, overdueDocs] = await Promise.all([
      // Stalest blocked work first — the thing a lead can actually act on.
      Task.find({ projectId: { $in: pids }, status: 'blocked', privateToUserId: null })
        .select('_id title projectId lastActivityAt')
        .sort({ lastActivityAt: 1 })
        .limit(LIST_CAP)
        .lean(),
      Task.countDocuments({
        projectId: { $in: pids },
        status: { $ne: 'done' },
        requiresQaSignoff: true,
        qaSignoffAt: null,
        privateToUserId: null,
      }),
      Task.find({
        projectId: { $in: pids },
        status: { $ne: 'done' },
        privateToUserId: null,
        assigneeId: { $ne: null },
        ...overdueFilter(window.start),
      })
        .select('assigneeId')
        .limit(2000)
        .lean(),
    ]);
    blockedDocs = blocked;

    const byMember = new Map<string, number>();
    for (const t of overdueDocs as any[]) {
      const k = String(t.assigneeId);
      byMember.set(k, (byMember.get(k) || 0) + 1);
    }
    const top = [...byMember.entries()].sort((a, b) => b[1] - a[1]).slice(0, LIST_CAP);
    const names = top.length
      ? await User.find({ _id: { $in: top.map(([id]) => id) } })
          .select('_id name')
          .lean()
      : [];
    const nameOf = new Map(names.map((u: any) => [String(u._id), u.name]));

    for (const t of blockedDocs) if (t.projectId) projectIds.add(String(t.projectId));
    brief.team = {
      blocked: [], // filled after project names resolve
      signoffsPending,
      overdueByMember: top.map(([id, count]) => ({ name: nameOf.get(id) || 'Unassigned', count })),
    };
  }

  /* Workspace lens — admins only. Shared projects exclusively; counts and
     audit summaries are data the admin role already sees elsewhere. */
  if (role === 'admin' || role === 'master_admin') {
    const shared = await Project.find({ ...NOT_PERSONAL, archived: { $ne: true } })
      .select('_id name status')
      .limit(1000)
      .lean();
    const pids = shared.map((p: any) => p._id);
    const nameOf = new Map(shared.map((p: any) => [String(p._id), p.name]));

    const [doneYesterday, overdueAgg, audit] = await Promise.all([
      Task.countDocuments({
        projectId: { $in: pids },
        status: 'done',
        completedAt: { $gte: yesterdayStart, $lt: window.start },
        privateToUserId: null,
      }),
      Task.aggregate([
        {
          $match: {
            projectId: { $in: pids },
            status: { $ne: 'done' },
            privateToUserId: null,
            ...overdueFilter(window.start),
          },
        },
        { $group: { _id: '$projectId', overdue: { $sum: 1 } } },
      ]),
      AuditLog.find({
        createdAt: { $gte: new Date(now.getTime() - DAY_MS) },
        action: { $in: ['project.delete', 'project.status', 'project.phase.delete', 'task.delete'] },
      })
        .select('summary createdAt')
        .sort({ createdAt: -1 })
        .limit(LIST_CAP)
        .lean(),
    ]);

    const ranked = (overdueAgg as any[])
      .map((g) => ({ id: String(g._id), name: nameOf.get(String(g._id)) || 'A project', overdue: g.overdue }))
      .sort((a, b) => b.overdue - a.overdue);

    brief.workspace = {
      doneYesterday,
      overdueTotal: ranked.reduce((sum, p) => sum + p.overdue, 0),
      activeProjects: (shared as any[]).filter((p) => p.status === 'in_progress' || p.status === 'planning')
        .length,
      risky: ranked.slice(0, LIST_CAP),
      auditHighlights: (audit as any[]).map((a) => ({
        summary: a.summary || '',
        at: new Date(a.createdAt).toISOString(),
      })),
    };
  }

  /* Resolve every referenced project name in one round-trip. */
  const projDocs = projectIds.size
    ? await Project.find({ _id: { $in: [...projectIds] } })
        .select('_id name')
        .lean()
    : [];
  const projName = new Map<string, string>(projDocs.map((p: any) => [String(p._id), p.name]));
  const toItem = (t: DigestTask): BriefItem => ({
    id: t.id,
    title: t.title,
    projectName: t.projectId ? projName.get(t.projectId) || null : null,
    label: t.label,
    priority: t.priority,
  });

  brief.my.overdue = buckets.overdue.slice(0, LIST_CAP).map(toItem);
  brief.my.today = buckets.today.slice(0, LIST_CAP).map(toItem);
  brief.my.soon = buckets.soon.slice(0, LIST_CAP).map(toItem);
  if (brief.team) {
    brief.team.blocked = blockedDocs.map((t: any) => ({
      id: String(t._id),
      title: t.title,
      projectName: t.projectId ? projName.get(String(t.projectId)) || null : null,
      days: Math.max(0, Math.floor((now.getTime() - new Date(t.lastActivityAt || now).getTime()) / DAY_MS)),
    }));
  }

  brief.headline = composeHeadline({
    role,
    overdue: buckets.overdue.length,
    today: buckets.today.length,
    soon: buckets.soon.length,
    blocked: brief.team?.blocked.length,
    signoffs: brief.team?.signoffsPending,
    doneYesterday: brief.workspace?.doneYesterday,
    overdueTotal: brief.workspace?.overdueTotal,
  });

  brief.hasContent =
    buckets.overdue.length > 0 ||
    buckets.today.length > 0 ||
    buckets.soon.length > 0 ||
    approvals > 0 ||
    winsYesterday > 0 ||
    !!(
      brief.team &&
      (brief.team.blocked.length || brief.team.signoffsPending || brief.team.overdueByMember.length)
    ) ||
    !!(
      brief.workspace &&
      (brief.workspace.doneYesterday ||
        brief.workspace.overdueTotal ||
        brief.workspace.auditHighlights.length)
    );

  return brief;
}
