'use client';
/**
 * Dashboard — first principles.
 *
 * Home answers one question: "What do I do now?"
 *   1. One next action (soonest late, else soonest open)
 *   2. Late — full exception list (nothing hidden behind a modal)
 *   3. This week — schedule after exceptions
 *   4. Projects — portfolio pulse, not a second task browser
 *   5. Team (leads) — open load only
 *
 * No two-column filing cabinet. No filter chip soup. No recurring holders.
 * Recurring system projects live on Teams; home is for delivery work.
 */
import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLiveRefresh } from '@/lib/client/useLiveRefresh';
import { formatDate, daysUntil, isOverdue, ProgressBar } from '@/components/ui';
import { UserAvatar } from '@/components/AvatarRegistry';
import { useIsLead, useIsAdmin } from '@/components/CurrentUserContext';
import dynamic from 'next/dynamic';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import type { BirdsEyeData } from '@/components/BirdsEyeView';
import { BirdEyeButton } from '@/components/BirdEyeButton';
import { FlowSignalStrip, type FlowSignalPayload } from '@/components/FlowSignalStrip';

const BirdsEyeView = dynamic(() => import('@/components/BirdsEyeView').then((m) => m.BirdsEyeView), {
  ssr: false,
  loading: () => null,
});

/* ── Types matching /api/lead-dashboard ──────────────────────────────────── */
interface TeamTask {
  id: string;
  title: string;
  status: string;
  priority?: string;
  dueDate?: string | null;
  ccTcd?: string | null;
  completedAt?: string | null;
  projectId: string;
  projectCode: string;
  projectName: string;
  lifecycle?: string | null;
  assigneeId?: string | null;
  assigneeName?: string | null;
  subtaskCount: number;
  subtasksDone: number;
  subtaskTitles?: string[];
  gxpCritical?: boolean;
  slipRisk?: { reason: string } | null;
  leverage?: number;
  reasons?: string[];
  pressing?: boolean;
}

interface DashProject {
  id: string;
  code: string;
  name: string;
  lifecycle?: string;
  status: string;
  ownerId?: string;
  ownerName?: string;
  teamName?: string | null;
  dueDate?: string | null;
  taskCount?: number;
  tasksDone?: number;
  openTasks: number;
  overdueCount: number;
  health: 'healthy' | 'at_risk' | 'critical';
  healthReasons?: string[];
  isSystem?: boolean;
}

interface DashPerson {
  id: string;
  name: string;
  title: string;
  openTasks: number;
  overdueCount: number;
  completedThisWeek: number;
  loadScore: number;
  loadLevel: 'healthy' | 'busy' | 'overloaded';
}

interface DashResp {
  user: { id: string; name: string; email: string; role: string };
  projects: DashProject[];
  tasks: any[];
  teamTasks: TeamTask[];
  people: DashPerson[];
  teamCount: number;
  flowSignal?: FlowSignalPayload | null;
}

/* ── Greeting helpers ─────────────────────────────────────────────────────── */
type Festival = { title: string; emoji: string; note: string };
const FIXED_FESTIVALS: Record<string, Festival> = {
  '01-01': {
    title: 'Happy New Year',
    emoji: '🎆',
    note: 'A fresh year, a clean slate — let’s make it count.',
  },
  '01-26': {
    title: 'Happy Republic Day',
    emoji: '🇮🇳',
    note: 'Compliance and care — values worth celebrating today.',
  },
  '08-15': {
    title: 'Happy Independence Day',
    emoji: '🇮🇳',
    note: 'Freedom and discipline, hand in hand. Have a proud day.',
  },
  '10-02': {
    title: 'Gandhi Jayanti',
    emoji: '🕊️',
    note: 'Quality is doing it right when no one is watching.',
  },
  '12-25': { title: 'Merry Christmas', emoji: '🎄', note: 'Wishing you a warm, restful holiday.' },
  '12-31': {
    title: 'Happy New Year’s Eve',
    emoji: '🥂',
    note: 'One last push, then a well-earned celebration.',
  },
};
const MOVABLE_FESTIVALS: Record<string, Festival> = {
  '2025-10-21': { title: 'Happy Diwali', emoji: '🪔', note: 'May your year ahead be bright and prosperous.' },
  '2026-11-08': { title: 'Happy Diwali', emoji: '🪔', note: 'May your year ahead be bright and prosperous.' },
  '2027-10-29': { title: 'Happy Diwali', emoji: '🪔', note: 'May your year ahead be bright and prosperous.' },
  '2025-03-14': { title: 'Happy Holi', emoji: '🎨', note: 'A splash of colour to your day!' },
  '2026-03-03': { title: 'Happy Holi', emoji: '🎨', note: 'A splash of colour to your day!' },
  '2027-03-22': { title: 'Happy Holi', emoji: '🎨', note: 'A splash of colour to your day!' },
};
function festivalFor(now = new Date()): Festival | null {
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const ymd = `${now.getFullYear()}-${mm}-${dd}`;
  return MOVABLE_FESTIVALS[ymd] || FIXED_FESTIVALS[`${mm}-${dd}`] || null;
}

function greeting(now = new Date()): string {
  const fest = festivalFor(now);
  if (fest) return `${fest.title}`;
  const h = now.getHours();
  if (h < 5) return 'Still up';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function sortByDueAsc(a: TeamTask, b: TeamTask): number {
  const da = new Date(a.ccTcd || a.dueDate || '9999').getTime();
  const db = new Date(b.ccTcd || b.dueDate || '9999').getTime();
  return da - db;
}

function buildBirdsEyeDataFromDash(dash: DashResp): BirdsEyeData {
  const projects = dash.projects.filter((p) => !p.isSystem);
  const projectIds = new Set(projects.map((p) => p.id));
  const teamIdByName = new Map<string, string>();
  const teams: { id: string; name: string; ownerName?: string | null }[] = [];
  for (const p of projects) {
    const name = (p.teamName || '').trim();
    if (!name) continue;
    if (!teamIdByName.has(name)) {
      const id = `team:${name}`;
      teamIdByName.set(name, id);
      teams.push({ id, name });
    }
  }
  const tasks = dash.teamTasks.filter((t) => projectIds.has(t.projectId));
  return {
    rootLabel: `${dash.user.name}'s workspace`,
    rootSubLabel: `${dash.teamCount} team${dash.teamCount === 1 ? '' : 's'} · ${projects.length} project${projects.length === 1 ? '' : 's'} · ${tasks.length} task${tasks.length === 1 ? '' : 's'}`,
    scope: 'workspace',
    teams,
    projects: projects.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      teamId: p.teamName ? (teamIdByName.get(p.teamName) ?? null) : null,
      health: p.health,
      taskCount: p.taskCount ?? 0,
      tasksDone: p.tasksDone ?? 0,
      dueDate: p.dueDate ?? null,
      ownerName: p.ownerName ?? null,
    })),
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      projectId: t.projectId,
      status: t.status,
      assigneeName: t.assigneeName ?? null,
      dueDate: (t.ccTcd || t.dueDate) ?? null,
      subtaskCount: t.subtaskCount,
      subtasksDone: t.subtasksDone,
      subtaskTitles: t.subtaskTitles?.slice(0, 5),
    })),
  };
}

/* ── Main page ────────────────────────────────────────────────────────────── */
export default function DashboardClient({ initialData }: { initialData: DashResp }) {
  const dash = initialData;
  const router = useRouter();
  const isLead = useIsLead();
  const isAdmin = useIsAdmin();
  useLiveRefresh(() => router.refresh());
  const [birdsEyeOpen, setBirdsEyeOpen] = useState(false);

  const isFirstRun = isLead && dash.projects.length === 0;
  const isNewContributor = !isLead && dash.teamTasks.length === 0;

  const myId = dash.user.id;
  const visibleTasks = useMemo(
    () => (isLead ? dash.teamTasks : dash.teamTasks.filter((t) => t.assigneeId === myId)),
    [dash, isLead, myId],
  );

  // Delivery projects only — system/recurring holders stay off home.
  const ongoingProjects = useMemo(
    () =>
      dash.projects.filter(
        (p) =>
          !p.isSystem &&
          (p.status === 'in_progress' || p.status === 'planning' || p.status === 'on_hold'),
      ),
    [dash],
  );

  const openTasks = useMemo(() => visibleTasks.filter((t) => t.status !== 'done'), [visibleTasks]);

  const overdueTasks = useMemo(
    () => openTasks.filter((t) => isOverdue(t.ccTcd || t.dueDate, t.status)),
    [openTasks],
  );

  const overdueSorted = useMemo(() => [...overdueTasks].sort(sortByDueAsc), [overdueTasks]);

  // One next action: soonest late, else soonest open.
  const doThisFirst = useMemo(() => {
    const pool = overdueSorted.length > 0 ? overdueSorted : openTasks;
    if (pool.length === 0) return null;
    return [...pool].sort(sortByDueAsc)[0];
  }, [overdueSorted, openTasks]);

  const dueThisWeek = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return openTasks
      .filter((t) => {
        const d = t.ccTcd || t.dueDate;
        if (!d || isOverdue(d, t.status)) return false;
        const dt = new Date(d);
        return dt >= start && dt <= end;
      })
      .sort(sortByDueAsc);
  }, [openTasks]);

  const tasksByAssignee = useMemo(() => {
    const m = new Map<string, TeamTask[]>();
    for (const t of visibleTasks) {
      if (t.status === 'done' || !t.assigneeId) continue;
      if (!m.has(t.assigneeId)) m.set(t.assigneeId, []);
      m.get(t.assigneeId)!.push(t);
    }
    return m;
  }, [visibleTasks]);

  const firstName = (dash.user.name || '').split(' ')[0] || 'there';
  const doThisFirstIsLate = doThisFirst
    ? overdueTasks.some((t) => t.id === doThisFirst.id)
    : false;

  return (
    <div className="pb-16 max-w-[640px] mx-auto w-full px-1 sm:px-0">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold tracking-tight text-[color:var(--text-primary)]">
            <span suppressHydrationWarning>
              {greeting()}, {firstName}
            </span>
          </h1>
          {!isFirstRun && !isNewContributor && (
            <p className="text-[13px] text-[color:var(--text-muted)] mt-1">
              {overdueSorted.length > 0
                ? `${overdueSorted.length} late · clear exceptions first`
                : dueThisWeek.length > 0
                  ? `${dueThisWeek.length} due this week`
                  : openTasks.length > 0
                    ? `${openTasks.length} open`
                    : 'Schedule is clear'}
            </p>
          )}
        </div>
        {!isFirstRun && !isNewContributor && (
          <BirdEyeButton scopeKey="dashboard" onClick={() => setBirdsEyeOpen(true)} />
        )}
      </div>

      {birdsEyeOpen && (
        <BirdsEyeView onClose={() => setBirdsEyeOpen(false)} data={buildBirdsEyeDataFromDash(dash)} />
      )}

      {isFirstRun ? (
        <FirstRunGuide hasTeam={dash.people.length > 0 || dash.teamCount > 0} isAdmin={isAdmin} />
      ) : isNewContributor ? (
        <ContributorWelcome name={dash.user.name} />
      ) : (
        <>
          {/* 1. ONE next action */}
          {doThisFirst && (
            <Link
              href={`/tasks/${doThisFirst.id}`}
              className="block mb-7 p-4 border border-[color:var(--border-card)] bg-[color:var(--bg-card)] hover:border-[color:var(--mars)] transition-colors"
              style={{ borderRadius: 16, borderLeftWidth: 3, borderLeftColor: 'var(--mars)' }}
            >
              <div className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--mars)] mb-1">
                {doThisFirstIsLate ? 'Clear this first' : 'Do this first'}
              </div>
              <div className="text-[17px] font-bold text-[color:var(--text-primary)] leading-snug">
                {doThisFirst.title}
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-3 text-[13px] text-[color:var(--text-muted)]">
                <span className="truncate">
                  {doThisFirst.projectName || doThisFirst.projectCode || 'Task'}
                  {doThisFirst.assigneeName ? ` · ${doThisFirst.assigneeName}` : ''}
                  {(doThisFirst.ccTcd || doThisFirst.dueDate) &&
                    ` · ${formatDate(doThisFirst.ccTcd || doThisFirst.dueDate)}`}
                </span>
                <span className="shrink-0 inline-flex items-center gap-1 font-bold text-[color:var(--mars)]">
                  Open <ArrowRight size={14} />
                </span>
              </div>
            </Link>
          )}

          <FlowSignalStrip data={dash.flowSignal} />

          {/* 2. LATE — full list, not a link to a modal */}
          {overdueSorted.length > 0 && (
            <section className="mb-8">
              <h2 className="text-[15px] font-bold text-[color:var(--status-stop)] mb-1">
                Late
                <span className="ml-1.5 tabular-nums font-semibold opacity-80">
                  {overdueSorted.length}
                </span>
              </h2>
              <div className="border-t border-[color:var(--border-card)]">
                {overdueSorted.map((t) => {
                  const due = t.ccTcd || t.dueDate;
                  const d = daysUntil(due);
                  return (
                    <Link
                      key={t.id}
                      href={`/tasks/${t.id}`}
                      className="flex items-center gap-3 py-3 border-b border-[color:var(--border-card)] hover:bg-[color:var(--x-hover)] transition-colors -mx-1 px-1"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-semibold text-[color:var(--text-primary)] truncate">
                          {t.title}
                        </div>
                        <div className="text-[12px] text-[color:var(--text-muted)] truncate mt-0.5">
                          {[t.projectName || t.projectCode, t.assigneeName, due ? formatDate(due) : null]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      </div>
                      <span className="shrink-0 text-[12px] font-bold text-[color:var(--status-stop)] tabular-nums">
                        {d !== null ? `${Math.abs(d)}d late` : 'Late'}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* 3. THIS WEEK */}
          {dueThisWeek.length > 0 && (
            <section className="mb-8">
              <h2 className="text-[15px] font-bold text-[color:var(--text-primary)] mb-1">
                This week
                <span className="ml-1.5 text-[color:var(--text-muted)] font-semibold tabular-nums">
                  {dueThisWeek.length}
                </span>
              </h2>
              <div className="border-t border-[color:var(--border-card)]">
                {dueThisWeek.map((t) => {
                  const due = t.ccTcd || t.dueDate;
                  const d = daysUntil(due);
                  return (
                    <Link
                      key={t.id}
                      href={`/tasks/${t.id}`}
                      className="flex items-center gap-3 py-3 border-b border-[color:var(--border-card)] hover:bg-[color:var(--x-hover)] transition-colors -mx-1 px-1"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-semibold text-[color:var(--text-primary)] truncate">
                          {t.title}
                        </div>
                        <div className="text-[12px] text-[color:var(--text-muted)] truncate mt-0.5">
                          {[t.projectName || t.projectCode, t.assigneeName].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <span className="shrink-0 text-[12px] font-semibold text-[color:var(--text-muted)] tabular-nums">
                        {d === 0
                          ? 'Today'
                          : d === 1
                            ? 'Tomorrow'
                            : d !== null
                              ? `in ${d}d`
                              : formatDate(due)}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* Empty schedule when no late and no this-week — still show projects */}
          {overdueSorted.length === 0 && dueThisWeek.length === 0 && openTasks.length === 0 && (
            <p className="text-[14px] text-[color:var(--text-muted)] mb-8 py-2">
              Nothing due. Projects below if you want the portfolio view.
            </p>
          )}

          {/* 4. PROJECTS — status only */}
          <section className="mb-8">
            <div className="flex items-baseline justify-between mb-1">
              <h2 className="text-[15px] font-bold text-[color:var(--text-primary)]">
                Projects
                <span className="ml-1.5 text-[color:var(--text-muted)] font-semibold tabular-nums">
                  {ongoingProjects.length}
                </span>
              </h2>
              <Link
                href="/projects"
                className="text-[13px] font-semibold text-[color:var(--mars)] hover:underline"
              >
                All
              </Link>
            </div>
            {ongoingProjects.length === 0 ? (
              <p className="text-[13px] text-[color:var(--text-muted)] py-4 border-t border-[color:var(--border-card)]">
                No active projects.
              </p>
            ) : (
              <div className="border-t border-[color:var(--border-card)]">
                {ongoingProjects.map((p) => {
                  const total = p.taskCount ?? 0;
                  const done = p.tasksDone ?? 0;
                  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                  return (
                    <Link
                      key={p.id}
                      href={`/projects/${p.id}`}
                      className="flex items-center gap-4 py-3.5 border-b border-[color:var(--border-card)] hover:bg-[color:var(--x-hover)] transition-colors -mx-1 px-1"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-bold text-[color:var(--text-primary)] truncate">
                          {p.name}
                        </div>
                        <div className="text-[12px] text-[color:var(--text-muted)] mt-0.5 truncate">
                          {[
                            p.code,
                            total > 0 ? `${done}/${total}` : null,
                            p.overdueCount > 0 ? `${p.overdueCount} late` : null,
                            p.ownerName,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                        {total > 0 && (
                          <div className="mt-2 max-w-[160px]">
                            <ProgressBar value={pct} />
                          </div>
                        )}
                      </div>
                      <span
                        className={`shrink-0 text-[14px] font-bold tabular-nums ${
                          p.overdueCount > 0
                            ? 'text-[color:var(--status-stop)]'
                            : 'text-[color:var(--text-muted)]'
                        }`}
                      >
                        {pct}%
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          {/* 5. Team load — leads only */}
          {isLead && dash.people.length > 0 && (
            <section className="mb-4">
              <h2 className="text-[15px] font-bold text-[color:var(--text-primary)] mb-1">Team</h2>
              <div className="border-t border-[color:var(--border-card)]">
                {dash.people.slice(0, 8).map((person) => {
                  const open = tasksByAssignee.get(person.id)?.length ?? person.openTasks ?? 0;
                  return (
                    <div
                      key={person.id}
                      className="flex items-center gap-3 py-2.5 border-b border-[color:var(--border-card)]"
                    >
                      <UserAvatar userId={person.id} name={person.name} size={28} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold text-[color:var(--text-primary)] truncate">
                          {person.name}
                        </div>
                      </div>
                      <span
                        className={`text-[12px] tabular-nums ${
                          person.overdueCount > 0
                            ? 'font-bold text-[color:var(--status-stop)]'
                            : 'text-[color:var(--text-muted)]'
                        }`}
                      >
                        {person.overdueCount > 0
                          ? `${person.overdueCount} late · ${open} open`
                          : `${open} open`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/* ── Contributor welcome — day-one empty board ──────────────────────────── */
function ContributorWelcome({ name }: { name: string }) {
  const first = (name || '').trim().split(/\s+/)[0] || 'there';
  return (
    <div
      className="mb-4 border border-[color:var(--border-card)] bg-[color:var(--bg-card)] overflow-hidden max-w-xl"
      style={{ borderRadius: 16 }}
    >
      <div className="h-1 bg-[color:var(--mars)]" />
      <div className="p-5">
        <p className="text-[13px] font-bold text-[color:var(--mars)]">Getting started</p>
        <h2 className="mt-1 text-[20px] font-bold text-[color:var(--text-primary)] tracking-tight">
          Hi {first}
        </h2>
        <p className="mt-2 text-[15px] text-[color:var(--text-muted)] leading-relaxed">
          Nothing assigned yet. When your lead adds work, it shows here first.
        </p>
        <ul className="mt-4 space-y-2 text-[14px] text-[color:var(--text-primary)]">
          <li className="flex gap-2">
            <span className="text-[color:var(--mars)] font-bold">1.</span>
            Check Dashboard daily for assigned tasks
          </li>
          <li className="flex gap-2">
            <span className="text-[color:var(--mars)] font-bold">2.</span>
            Use My Day for private notes and personal tasks
          </li>
          <li className="flex gap-2">
            <span className="text-[color:var(--mars)] font-bold">3.</span>
            Open a task → update status → mark done
          </li>
        </ul>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link href="/my-day" className="btn-primary px-5 py-2.5 text-[14px]">
            Open My Day <ArrowRight size={15} />
          </Link>
          <Link
            href="/projects"
            className="text-[14px] font-bold text-[color:var(--mars)] hover:underline"
          >
            Browse projects
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ── First-run guide — lead/admin empty workspace ───────────────────────── */
function FirstRunGuide({ hasTeam, isAdmin }: { hasTeam: boolean; isAdmin?: boolean }) {
  const steps = [
    { label: 'Team', done: hasTeam },
    { label: isAdmin ? 'People' : 'Project', done: false },
    { label: 'First task', done: false },
  ];
  const next = !hasTeam
    ? {
        href: '/teams',
        title: 'Create your first team',
        body: 'A team owns projects and people. Everything else hangs off it.',
        cta: 'Create a team',
      }
    : isAdmin
      ? {
          href: '/people',
          title: 'Invite your team',
          body: 'Add people so work can be assigned. Then create a project.',
          cta: 'Open People',
        }
      : {
          href: '/projects/new',
          title: 'Create your first project',
          body: 'Pick a type, put it on a team, add one task with an owner.',
          cta: 'New project',
        };

  return (
    <div
      className="mb-4 border border-[color:var(--border-card)] bg-[color:var(--bg-card)] overflow-hidden max-w-xl"
      style={{ borderRadius: 16 }}
    >
      <div className="h-1 bg-[color:var(--mars)]" />
      <div className="p-5">
        <p className="text-[13px] font-bold text-[color:var(--mars)]">Setup · 3 steps</p>
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {steps.map((s, i) => (
            <div key={s.label} className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 text-[12px] font-bold px-2.5 py-1 ${
                  s.done
                    ? 'bg-[color:var(--status-go)]/15 text-[color:var(--status-go)]'
                    : i === (hasTeam ? 1 : 0)
                      ? 'bg-[color:var(--text-primary)] text-[color:var(--bg-page)]'
                      : 'border border-[color:var(--border-card)] text-[color:var(--text-muted)]'
                }`}
                style={{ borderRadius: 9999 }}
              >
                {s.done ? <CheckCircle2 size={12} /> : <span className="tabular-nums">{i + 1}</span>}
                {s.label}
              </span>
              {i < steps.length - 1 && (
                <span className="text-[color:var(--text-muted)] text-xs">→</span>
              )}
            </div>
          ))}
        </div>
        <h2 className="mt-4 text-[20px] font-bold text-[color:var(--text-primary)] tracking-tight">
          {next.title}
        </h2>
        <p className="mt-2 text-[15px] text-[color:var(--text-muted)] leading-relaxed">{next.body}</p>
        <Link href={next.href} className="mt-5 btn-primary inline-flex px-5 py-2.5 text-[14px]">
          {next.cta} <ArrowRight size={15} />
        </Link>
      </div>
    </div>
  );
}
