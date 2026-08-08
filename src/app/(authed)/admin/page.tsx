import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUserFromCookie } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { Team } from '@/models/Team';
import { Project } from '@/models/Project';
import { Task } from '@/models/Task';
import { Invite } from '@/models/Invite';
import { AuditLog } from '@/models/AuditLog';
import {
  UsersRound,
  Users,
  FolderKanban,
  ListChecks,
  ScrollText,
  Mail,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

/**
 * Admin console — the workspace at a glance, on one server-rendered page.
 * Three questions, in order: how big is the workspace (stat tiles), what
 * needs my attention right now (locked accounts, pending invites, forced
 * resets), and what just happened (recent audit trail). Everything links
 * into the surface where the admin acts (People, Logs, Teams), so the
 * console stays a hub, not another destination to maintain.
 */
export default async function AdminConsolePage() {
  const jwt = await getCurrentUserFromCookie();
  if (!jwt) redirect('/login');
  if (!can(jwt.role, 'admin.console')) redirect('/');

  await connectDB();
  const now = new Date();

  // Personal projects (and their tasks) are excluded from every number on
  // this page — same privacy rule as the audit trail.
  const personalProjects = await Project.find(
    { $or: [{ isPersonal: true }, { code: /^PRSN-/ }] },
    '_id',
  ).lean();
  const personalIds = personalProjects.map((p: any) => p._id);
  const personalIdSet = new Set(personalIds.map((id: any) => String(id)));

  const [
    activeUsers,
    leadCount,
    deactivated,
    mustChange,
    lockedUsers,
    teamCount,
    sharedProjects,
    archivedProjects,
    openTasks,
    overdueTasks,
    pendingInvites,
    recentOps,
  ] = await Promise.all([
    User.countDocuments({ active: { $ne: false } }),
    User.countDocuments({ active: { $ne: false }, role: { $in: ['lead', 'pm', 'admin', 'master_admin'] } }),
    User.countDocuments({ active: false }),
    User.countDocuments({ active: { $ne: false }, mustChangePassword: true }),
    User.find({ lockedAt: { $ne: null } }, 'name username lockedAt')
      .sort({ lockedAt: -1 })
      .limit(5)
      .lean(),
    Team.countDocuments({}),
    Project.countDocuments({ isPersonal: { $ne: true }, code: { $not: /^PRSN-/ }, archived: { $ne: true } }),
    Project.countDocuments({ isPersonal: { $ne: true }, code: { $not: /^PRSN-/ }, archived: true }),
    Task.countDocuments({ status: { $ne: 'done' }, projectId: { $nin: personalIds } }),
    Task.countDocuments({ status: { $ne: 'done' }, dueDate: { $lt: now }, projectId: { $nin: personalIds } }),
    Invite.countDocuments({ consumedAt: null, revokedAt: null, expiresAt: { $gt: now } }),
    AuditLog.find({}).sort({ createdAt: -1 }).limit(12).lean(),
  ]);

  // Same personal-project scrub the audit page applies, then keep 6.
  const recent = (recentOps as any[])
    .filter((r) => {
      if (r.targetType === 'project' && personalIdSet.has(String(r.targetId))) return false;
      if (r.targetType === 'task' && r.meta?.projectId && personalIdSet.has(String(r.meta.projectId)))
        return false;
      return true;
    })
    .slice(0, 6);

  const ago = (d: any) => {
    const mins = Math.max(0, Math.round((now.getTime() - new Date(d).getTime()) / 60000));
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const h = Math.round(mins / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.round(h / 24)}d ago`;
  };

  const attention: { label: string; detail: string; href: string }[] = [];
  for (const u of lockedUsers as any[]) {
    attention.push({
      label: `${u.name} is locked out`,
      detail: `Too many failed sign-ins · ${ago(u.lockedAt)}`,
      href: '/people',
    });
  }
  if (pendingInvites > 0) {
    attention.push({
      label: `${pendingInvites} pending invite${pendingInvites === 1 ? '' : 's'}`,
      detail: 'Sent but not yet accepted',
      href: '/people',
    });
  }
  if (mustChange > 0) {
    attention.push({
      label: `${mustChange} account${mustChange === 1 ? '' : 's'} on a temporary password`,
      detail: 'Forced to change it at next sign-in',
      href: '/people',
    });
  }

  const stats = [
    {
      label: 'Active people',
      value: activeUsers,
      sub: `${leadCount} lead${leadCount === 1 ? '' : 's'} · ${deactivated} deactivated`,
      href: '/people',
      icon: UsersRound,
      iconColor: '#00897B',
      iconBg: '#E0F2F1',
    },
    {
      label: 'Teams',
      value: teamCount,
      sub: 'All teams are visible to you',
      href: '/teams',
      icon: Users,
      iconColor: '#2E7D32',
      iconBg: '#E8F5E9',
    },
    {
      label: 'Shared projects',
      value: sharedProjects,
      sub: `${archivedProjects} archived`,
      href: '/projects',
      icon: FolderKanban,
      iconColor: '#7B1FA2',
      iconBg: '#F3E5F5',
    },
    {
      label: 'Open tasks',
      value: openTasks,
      sub: `${overdueTasks} overdue`,
      href: '/projects',
      icon: ListChecks,
      iconColor: '#1565C0',
      iconBg: '#E3F2FD',
    },
  ];

  return (
    <div className="max-w-5xl pb-12 space-y-6">
      <div>
        <h1 className="page-title">Admin console</h1>
        <p className="text-sm text-slate-500 dark:text-white/45 mt-1 leading-snug">
          The whole workspace at a glance — numbers, what needs you, and what just happened.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="card p-4 hover:shadow-md transition-shadow group">
            <div className="flex items-center gap-2.5">
              <span
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: s.iconBg, color: s.iconColor }}
              >
                <s.icon size={16} />
              </span>
              <span className="text-xs font-semibold text-slate-500 dark:text-white/50 group-hover:text-blue-600 transition-colors">
                {s.label}
              </span>
            </div>
            <div className="mt-3 text-3xl font-black text-slate-900 dark:text-white tabular-nums">
              {s.value}
            </div>
            <div className="text-xs text-slate-400 dark:text-white/40 mt-1">{s.sub}</div>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <div className="card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 dark:border-white/10 flex items-center gap-2">
            <ShieldAlert size={15} className="text-amber-500" />
            <h2 className="text-sm font-bold text-slate-800 dark:text-white">Needs attention</h2>
          </div>
          {attention.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400 dark:text-white/40">
              All clear — no locked accounts, no pending invites.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-white/5">
              {attention.map((a, i) => (
                <Link
                  key={i}
                  href={a.href}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-amber-50/50 dark:hover:bg-amber-500/5 transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-700 dark:text-white/80 truncate">
                      {a.label}
                    </div>
                    <div className="text-xs text-slate-400 dark:text-white/40 mt-0.5">{a.detail}</div>
                  </div>
                  <ArrowRight
                    size={14}
                    className="text-slate-300 group-hover:text-amber-600 transition-colors shrink-0"
                  />
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 dark:border-white/10 flex items-center gap-2">
            <ScrollText size={15} className="text-indigo-500" />
            <h2 className="text-sm font-bold text-slate-800 dark:text-white flex-1">Recent activity</h2>
            <Link
              href="/audit"
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-300 hover:text-indigo-800"
            >
              All logs →
            </Link>
          </div>
          {recent.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400 dark:text-white/40">
              No operations recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-white/5">
              {recent.map((r: any) => (
                <div key={String(r._id)} className="px-5 py-3">
                  <div className="text-sm text-slate-700 dark:text-white/80 leading-snug line-clamp-2">
                    {r.summary}
                  </div>
                  <div className="text-xs text-slate-400 dark:text-white/40 mt-0.5">
                    {r.actorName || 'System'} · {ago(r.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card p-5">
        <h2 className="text-sm font-bold text-slate-800 dark:text-white mb-3">Quick actions</h2>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/people"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-500/10 hover:bg-teal-100 dark:hover:bg-teal-500/20 px-3 py-2 rounded-lg transition-colors"
          >
            <UsersRound size={13} /> Manage people
          </Link>
          <Link
            href="/audit"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 px-3 py-2 rounded-lg transition-colors"
          >
            <ScrollText size={13} /> Audit trail
          </Link>
          <Link
            href="/teams"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-500/10 hover:bg-green-100 dark:hover:bg-green-500/20 px-3 py-2 rounded-lg transition-colors"
          >
            <Users size={13} /> Teams
          </Link>
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 px-3 py-2 rounded-lg transition-colors"
          >
            <Mail size={13} /> Daily digest settings
          </Link>
        </div>
      </div>
    </div>
  );
}
