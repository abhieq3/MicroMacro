'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { ModalPortal } from '@/components/ModalPortal';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLiveRefresh } from '@/lib/client/useLiveRefresh';
import {
  formatDate,
  daysUntil,
  isOverdue,
  ProgressBar,
  LIFECYCLE_LABELS,
  STATUS_COLORS,
} from '@/components/ui';
import { DatePicker } from '@/components/DatePicker';
import { UserAvatar } from '@/components/AvatarRegistry';
import { useIsLead, useIsAdmin } from '@/components/CurrentUserContext';
import dynamic from 'next/dynamic';
import {
  AlertTriangle,
  FolderKanban,
  CheckCircle2,
  Users as UsersIcon,
  ChevronDown,
  TrendingUp,
  Clock,
  ArrowRight,
  Maximize2,
  X,
} from 'lucide-react';
// Lazy — the bird's-eye view is a heavy SVG layout component and most
// visits won't open it. Keep it out of the dashboard's first paint.
const BirdsEyeView = dynamic(() => import('@/components/BirdsEyeView').then((m) => m.BirdsEyeView), {
  ssr: false,
  loading: () => null,
});
import type { BirdsEyeData } from '@/components/BirdsEyeView';
import { BirdEyeButton } from '@/components/BirdEyeButton';
import { FlowSignalStrip, type FlowSignalPayload } from '@/components/FlowSignalStrip';
// The Morning Brief stays available through its other channels (push, email,
// calendar feed) — the dashboard card was removed by owner decision: the
// Due panel and the summary chips already answer "what's on today" here.

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
  /** Early warning from the server's delivery model — present only when the
   *  task is judged likely to miss its date; `reason` is the plain-language
   *  factor behind the call (shown as the chip's tooltip). */
  slipRisk?: { reason: string } | null;
  /** Leverage score + the reasons that built it, from the Work Mixer engine.
   *  Drives the morning-priority spotlight — the single highest-leverage thing. */
  leverage?: number;
  reasons?: string[];
  /** True only when there's a near-term CAUSE to act — overdue, due this week,
   *  blocked, waiting, or stalled — not merely a high static score. The morning
   *  spotlight requires this so a task weeks out never hijacks the morning. */
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

/* ── Helpers ──────────────────────────────────────────────────────────────── */
// Festivals worth a warm one-off greeting. Fixed-date national/global days are
// keyed by MM-DD; movable feasts (Diwali, Holi — lunar) are keyed by full
// YYYY-MM-DD for the years the app is in active use, since their Gregorian
// date shifts each year. Pragati is built for an Indian pharma context, so the
// list leans that way while still covering the universal New Year / Christmas.
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
  // Diwali
  '2025-10-21': { title: 'Happy Diwali', emoji: '🪔', note: 'May your year ahead be bright and prosperous.' },
  '2026-11-08': { title: 'Happy Diwali', emoji: '🪔', note: 'May your year ahead be bright and prosperous.' },
  '2027-10-29': { title: 'Happy Diwali', emoji: '🪔', note: 'May your year ahead be bright and prosperous.' },
  // Holi
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

// A warm, genuine salutation. Festivals take priority; otherwise it's a proper
// time-of-day greeting (clear and human — not the old "Keep it moving" filler),
// with light day-of-week flavour so Monday and Friday don't read the same.
function greeting(now = new Date()): string {
  const fest = festivalFor(now);
  if (fest) return `${fest.title}`;
  const h = now.getHours();
  if (h < 5) return 'Still up';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good evening';
}

const STATUSES = ['todo', 'in_progress', 'review', 'blocked', 'done'] as const;

const STATUS_LABEL: Record<string, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  review: 'Review',
  blocked: 'Blocked',
  done: 'Done',
};

const HEALTH_META: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  healthy: { label: 'On track', bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-400' },
  at_risk: { label: 'At risk', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-400' },
  critical: { label: 'Critical', bg: 'bg-red-50', text: 'text-red-600', dot: 'bg-red-500' },
};

type ActionFilter = 'week' | 'nextWeek' | 'month' | 'untilDate';

/**
 * Project the lead-dashboard payload into the BirdsEyeView's shape. We pull
 * teams from the per-project `teamName` (the lead-dashboard endpoint already
 * resolved it), de-duplicate by name, and map projects + tasks 1:1.
 */
function buildBirdsEyeDataFromDash(dash: DashResp): BirdsEyeData {
  // Exclude system/recurring holder projects from the map.
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
  // Realtime: the dashboard is server-rendered, so re-running the server
  // component (router.refresh) is the cheapest way to pull fresh rollups when
  // the tab regains focus, on a gentle interval, and on app-wide change events.
  useLiveRefresh(() => router.refresh());
  const [summaryModal, setSummaryModal] = useState<null | 'overdue'>(null);
  // Bird's-eye view — the lead's whole workspace as a packed tree. Opened
  // from the small compass icon in the greeting row.
  const [birdsEyeOpen, setBirdsEyeOpen] = useState(false);
  // Due's expand state is lifted here so the shared two-column header bar
  // (below) can own the expand control — keeping both column titles on one
  // inline header row instead of two floating labels.
  const [upNextExpanded, setUpNextExpanded] = useState(false);

  // First-run: a lead/admin whose workspace has no projects yet. Show a
  // guided setup path instead of a wall of empty panels — this is the
  // first thing a brand-new admin sees, so it should point the way.
  const isFirstRun = isLead && dash.projects.length === 0;

  // A brand-new contributor with nothing assigned yet gets a warm welcome
  // pointing at their first actions, rather than an empty board.
  const isNewContributor = !isLead && dash.teamTasks.length === 0;

  // ICs see their own task counts in side panels (My Tasks, Due Center) but the
  // expanded project view shows the *full* pipeline so they have the same
  // visibility their lead does into how their project is progressing. Leads
  // and admins always see everything.
  const myId = dash.user.id;
  const visibleTasks = useMemo(
    () => (isLead ? dash.teamTasks : dash.teamTasks.filter((t) => t.assigneeId === myId)),
    [dash, isLead, myId],
  );

  // Real delivery projects only — system/recurring holders stay on Teams,
  // not the home board (they are plumbing, not work to "manage" daily).
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
    () =>
      openTasks.filter((t) => isOverdue(t.ccTcd || t.dueDate, t.status)),
    [openTasks],
  );

  // One next action — soonest overdue, else soonest due open work. Jensen: exceptions first.
  const doThisFirst = useMemo(() => {
    const pool = overdueTasks.length > 0 ? overdueTasks : openTasks;
    if (pool.length === 0) return null;
    return [...pool].sort((a, b) => {
      const da = new Date(a.ccTcd || a.dueDate || '9999').getTime();
      const db = new Date(b.ccTcd || b.dueDate || '9999').getTime();
      return da - db;
    })[0];
  }, [overdueTasks, openTasks]);

  // Expanded project view: everyone sees the whole project's tasks, so an IC
  // can see the path of work around their own assignments — not just their
  // own row in isolation.
  const tasksByProject = useMemo(() => {
    const m = new Map<string, TeamTask[]>();
    for (const t of dash.teamTasks) {
      if (!m.has(t.projectId)) m.set(t.projectId, []);
      m.get(t.projectId)!.push(t);
    }
    return m;
  }, [dash.teamTasks]);

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

  return (
    <div className="pb-12 max-w-[1440px]">
      {/* ── Greeting ────────────────────────────────────────────────────── */}
      <div className="mb-4 sm:mb-5 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[20px] sm:text-[20px] font-bold tracking-tight leading-tight text-[#0f1419] dark:text-[#e7e9ea]">
            <span suppressHydrationWarning>
              {greeting()}, {firstName}
            </span>
          </h1>
        </div>
        {/* Bird's-eye view trigger — quiet, on the row the user sees every day. */}
        <div className="flex items-center gap-2 shrink-0">
          {!isFirstRun && <BirdEyeButton scopeKey="dashboard" onClick={() => setBirdsEyeOpen(true)} />}
        </div>
      </div>
      {/* Subline removed. The summary chips below (Ongoing / Open / Overdue
          / Teams) already convey workspace state at a glance; an extra
          sentence above them was repeating the same numbers in prose. */}
      {/* Bird's-eye view modal — mounted at the page level so the SVG
          tree gets its own scroll area regardless of where the trigger
          was clicked from. */}
      {birdsEyeOpen && (
        <BirdsEyeView onClose={() => setBirdsEyeOpen(false)} data={buildBirdsEyeDataFromDash(dash)} />
      )}

      {isFirstRun ? (
        <FirstRunGuide hasTeam={dash.people.length > 0 || dash.teamCount > 0} isAdmin={isAdmin} />
      ) : (
        <>
          {isNewContributor && <ContributorWelcome name={dash.user.name} />}

          {/* One next action — judgment over inventory counts. */}
          {doThisFirst && (
            <Link
              href={`/tasks/${doThisFirst.id}`}
              className="mb-4 flex items-center gap-3 border-y border-[#eff3f4] dark:border-[#2f3336] px-0 py-4 hover:bg-[rgba(15,20,25,0.02)] dark:hover:bg-[rgba(231,233,234,0.02)] transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div
                  className={`text-[11px] font-bold tracking-wide mb-0.5 ${
                    overdueTasks.some((t) => t.id === doThisFirst.id)
                      ? 'text-[#f4212e]'
                      : 'text-[#71767b]'
                  }`}
                >
                  Do this first
                </div>
                <div className="text-[15px] font-bold text-[#0f1419] dark:text-[#e7e9ea] leading-snug truncate">
                  {doThisFirst.title}
                </div>
                <div className="text-[12px] text-[#71767b] mt-0.5 truncate">
                  {doThisFirst.projectName || doThisFirst.projectCode || 'Task'}
                  {(doThisFirst.ccTcd || doThisFirst.dueDate) &&
                    ` · ${formatDate(doThisFirst.ccTcd || doThisFirst.dueDate)}`}
                </div>
              </div>
              <ArrowRight size={18} className="text-[#71767b] shrink-0" />
            </Link>
          )}

          <FlowSignalStrip data={dash.flowSignal} />

          {overdueTasks.length > 0 && (
            <button
              type="button"
              onClick={() => setSummaryModal('overdue')}
              className="mb-4 text-[13px] font-bold text-[#f4212e] hover:underline"
            >
              {overdueTasks.length} overdue →
            </button>
          )}
          {summaryModal && (
            <SummaryTaskPopup
              title="Overdue tasks"
              subtitle="Work that has crossed its target/due date."
              tone="red"
              tasks={overdueTasks}
              onClose={() => setSummaryModal(null)}
            />
          )}
        </>
      )}

      {/* ── Main layout: Projects (left) · Due Center (right, same row) ───── */}
      {!isFirstRun && (
        <>
          {/* Shared header band — one inline row across both columns on desktop,
              so the two section titles read as a single header line instead of
              two floating labels. On mobile each column keeps its own header
              (the band is hidden) since the columns stack vertically. */}
          <div className="hidden lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] gap-0 mb-0 items-end border-b border-[#eff3f4] dark:border-[#2f3336] pb-2">
            <div className="flex items-center justify-between gap-2 min-w-0 pr-6">
              <h2 className="text-[13px] font-bold text-[#0f1419] dark:text-[#e7e9ea]">
                Projects
                <span className="ml-1.5 text-[#71767b] font-semibold tabular-nums">
                  {ongoingProjects.length}
                </span>
              </h2>
              <Link
                href="/projects"
                className="text-[13px] font-normal text-[#1d9bf0] hover:underline shrink-0"
              >
                All
              </Link>
            </div>
            <div className="flex items-center justify-between gap-2 min-w-0 pl-6 border-l border-[#eff3f4] dark:border-[#2f3336]">
              <h2 className="text-[13px] font-bold text-[#0f1419] dark:text-[#e7e9ea]">Due</h2>
              <button
                type="button"
                onClick={() => setUpNextExpanded(true)}
                aria-label="Expand Due"
                className="shrink-0 p-1 text-[#71767b] hover:text-[#e7e9ea] transition-colors"
              >
                <Maximize2 size={13} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] gap-0 items-start">
            <div className="min-w-0 lg:pr-6">
              <ProjectsColumn
                projects={ongoingProjects}
                tasksByProject={tasksByProject}
                suppressHeaderDesktop
              />
            </div>

            <div className="min-w-0 lg:pl-6 lg:border-l border-[#eff3f4] dark:border-[#2f3336] space-y-0">
              <UpNextPanel
                tasks={visibleTasks}
                expanded={upNextExpanded}
                onExpandedChange={setUpNextExpanded}
                suppressHeaderDesktop
              />
              <MyTasksPanel tasks={visibleTasks} myId={myId} />
              {isLead && <ContributorsPanel people={dash.people} tasksByAssignee={tasksByAssignee} />}
            </div>
          </div>
        </>
      )}

      {/* Onboarding tour is mounted centrally in AppShell so every role
          sees it on whichever page they land on. */}
    </div>
  );
}

/* ── Full-screen overlay ──────────────────────────────────────────────────
   Lets the Due Center and Contributors panels expand to a distraction-free,
   full-page view (#12). Click the backdrop or the ✕ to close. */
function FullScreenOverlay({
  title,
  icon,
  onClose,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center p-3 sm:p-8 overflow-auto"
        onClick={onClose}
      >
        <div
          className="bg-white dark:bg-[#262624] rounded-2xl w-full max-w-4xl my-2 shadow-2xl dark:border dark:border-[#2f3336]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 dark:border-[#2f3336] sticky top-0 bg-white dark:bg-[#262624] rounded-t-2xl z-10">
            {icon}
            <h3 className="text-sm font-bold text-[#0f1419] dark:text-[#e7e9ea]">{title}</h3>
            <button
              onClick={onClose}
              title="Close"
              className="ml-auto p-1.5 rounded-lg text-slate-400 dark:text-white/35 hover:text-slate-700 dark:hover:text-white/70 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
            >
              <X size={16} />
            </button>
          </div>
          <div className="p-2 sm:p-3">{children}</div>
        </div>
      </div>
    </ModalPortal>
  );
}

/* A small maximize affordance for panel headers. */
function ExpandButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Open full screen"
      className="p-1 rounded text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-colors"
    >
      <Maximize2 size={12} />
    </button>
  );
}

/* ── Shared right-column panel header ─────────────────────────────────────
   Styled to match the left column's "Your team's projects" section label —
   plain muted icon, uppercase tracking-wider title, light count — so both
   columns read as one inline layout. One geometry across Due / My Tasks /
   Individual Contributors keeps the right rail even; an optional trailing slot
   carries the maximize / overdue / chevron affordance. `tint` is accepted for
   call-site compatibility but no longer painted as a tile. */
function PanelHeader({
  icon,
  title,
  count,
  countSuffix,
  trailing,
  onClick,
}: {
  icon: React.ReactNode;
  tint?: { bg: string; fg: string };
  title: string;
  count?: number | string;
  countSuffix?: string;
  trailing?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`px-4 h-12 flex items-center gap-2 border-b border-slate-100 dark:border-white/[0.05] ${
        onClick
          ? 'cursor-pointer hover:bg-slate-50/60 dark:hover:bg-white/[0.03] select-none transition-colors'
          : ''
      }`}
    >
      <span className="text-slate-400 dark:text-white/30 shrink-0 inline-flex">{icon}</span>
      <h3 className="text-xs font-bold uppercase tracking-wider sm:tracking-[0.14em] text-[#536471] dark:text-[#71767b]">
        {title}
      </h3>
      {count != null && (
        <span className="text-[10px] font-semibold text-slate-300 dark:text-white/20 tabular-nums">
          {count}
          {countSuffix}
        </span>
      )}
      <div className="ml-auto flex items-center gap-1.5">{trailing}</div>
    </div>
  );
}

const PANEL_TINTS = {
  blue: { bg: 'rgba(255,255,255,0.08)', fg: '#fafafa' },
  emerald: { bg: 'rgba(16,185,129,0.12)', fg: '#059669' },
  violet: { bg: 'rgba(124,58,237,0.12)', fg: '#7c3aed' },
} as const;

/* ── Summary chip ────────────────────────────────────────────────────────── */
function SummaryChip({
  label,
  value,
  accent,
  href,
  onClick,
}: {
  label: string;
  value: number;
  accent: 'blue' | 'red' | 'slate' | 'green';
  href?: string;
  onClick?: () => void;
}) {
  const styles = {
    blue: 'bg-zinc-100 dark:bg-white/10 text-zinc-800 dark:text-white',
    red: 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-[#f4212e]',
    slate: 'bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-white/55',
    green: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  }[accent];
  const className = `inline-flex items-center gap-1.5 h-8 px-3 rounded-lg transition-all hover:brightness-95 hover:shadow-sm ${styles}`;
  const content = (
    <>
      <span className="text-[13px] font-black tabular-nums">{value}</span>
      <span className="text-[12px] font-medium opacity-80">{label}</span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={className}
        aria-label={`Show ${label.toLowerCase()}`}
      >
        {content}
      </button>
    );
  }

  return (
    <Link href={href || '#'} className={className}>
      {content}
    </Link>
  );
}

/** Compress a verbose project code (CHANGE_CONTROL-2026-0011) into a
 *  badge-friendly short form (CC-26-0011). Keeps a stable mapping for the
 *  prefixes we actually use; anything else falls back to first letters. */
function shortProjectCode(code: string): string {
  if (!code) return '';
  const PREFIX: Record<string, string> = {
    CHANGE_CONTROL: 'CC',
    SOFTWARE_CHANGE: 'SC',
    DEVIATION: 'DEV',
    CAPA: 'CAPA',
    DEVIATION_CAPA: 'DEV/CAPA',
    SOP: 'SOP',
    AUDIT: 'AUD',
    VALIDATION: 'VAL',
    CSV: 'CSV',
    AGILE: 'AGI',
    SOFTWARE_RELEASE: 'REL',
    PRODUCT_LAUNCH: 'LAU',
    RESEARCH: 'RES',
    GENERIC: 'PRJ',
    PRSN: 'PRSN',
  };
  const m = code.match(/^([A-Z_]+)-?(\d{2,4})?-?(\d+)?$/);
  if (!m) return code.length > 14 ? code.slice(0, 13) + '…' : code;
  const prefix =
    PREFIX[m[1]] ??
    m[1]
      .split('_')
      .map((w) => w[0])
      .join('');
  const year = m[2] ? m[2].slice(-2) : '';
  const num = m[3] || '';
  return [prefix, year, num].filter(Boolean).join('-');
}

function SummaryTaskPopup({
  title,
  subtitle,
  tasks,
  tone,
  onClose,
}: {
  title: string;
  subtitle: string;
  tasks: TeamTask[];
  tone: 'blue' | 'red';
  onClose: () => void;
}) {
  const sorted = [...tasks].sort((a, b) => {
    const ad = a.ccTcd || a.dueDate;
    const bd = b.ccTcd || b.dueDate;
    return (ad ? new Date(ad).getTime() : Infinity) - (bd ? new Date(bd).getTime() : Infinity);
  });
  const icon =
    tone === 'red' ? (
      <AlertTriangle size={14} className="text-red-500" />
    ) : (
      <CheckCircle2 size={14} className="text-zinc-500 dark:text-white/45" />
    );

  return (
    <FullScreenOverlay title={title} icon={icon} onClose={onClose}>
      <div className="px-5 pb-5">
        <div
          className={`mb-3 border px-3 py-2.5 ${tone === 'red' ? 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300' : 'border-zinc-200 dark:border-[#2f3336] bg-zinc-50 dark:bg-white/[0.04] text-zinc-700 dark:text-white/70'}`}
        >
          <div className="text-xs font-bold">
            {sorted.length} task{sorted.length === 1 ? '' : 's'}
          </div>
          <div className="text-[11px] opacity-75 mt-0.5">{subtitle}</div>
        </div>
        {sorted.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">Nothing to list here.</div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-white/[0.06] rounded-xl border border-slate-100 dark:border-[#2f3336] overflow-hidden">
            {sorted.map((t) => {
              const due = t.ccTcd || t.dueDate;
              const dueIn = daysUntil(due);
              const overdue = isOverdue(due, t.status);
              return (
                <li key={t.id}>
                  <Link
                    href={`/tasks/${t.id}`}
                    onClick={onClose}
                    className={`block px-4 py-3 transition-colors ${overdue ? 'hover:bg-red-50/60' : 'hover:bg-slate-50/60'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold text-slate-800 dark:text-white/80 line-clamp-1">
                          {t.title}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-white/35 flex-wrap">
                          <span
                            className="font-mono font-bold text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-white/55"
                            title={t.projectCode}
                          >
                            {shortProjectCode(t.projectCode)}
                          </span>
                          {t.assigneeName && (
                            <>
                              <span>·</span>
                              <span>{t.assigneeName}</span>
                            </>
                          )}
                          {due && (
                            <>
                              <span>·</span>
                              <span className={overdue ? 'text-red-600 font-semibold' : ''}>
                                {dueIn === null
                                  ? formatDate(due)
                                  : dueIn < 0
                                    ? `${Math.abs(dueIn)}d overdue`
                                    : dueIn === 0
                                      ? 'today'
                                      : `in ${dueIn}d`}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${STATUS_COLORS[t.status] || 'bg-slate-100 text-slate-500'}`}
                      >
                        {STATUS_LABEL[t.status] || t.status}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </FullScreenOverlay>
  );
}

/* ── Contributor welcome — day-one empty board ──────────────────────────── */
function ContributorWelcome({ name }: { name: string }) {
  const first = (name || '').trim().split(/\s+/)[0] || 'there';
  return (
    <div className="mb-4 border border-[#eff3f4] dark:border-[#2f3336] bg-white dark:bg-black overflow-hidden max-w-xl" style={{ borderRadius: 16 }}>
      <div className="h-1 bg-[#1d9bf0]" />
      <div className="p-5">
        <p className="text-[13px] font-bold text-[#1d9bf0]">Getting started</p>
        <h2 className="mt-1 text-[20px] font-bold text-[#0f1419] dark:text-[#e7e9ea] tracking-tight">
          Hi {first}
        </h2>
        <p className="mt-2 text-[15px] text-[#536471] dark:text-[#71767b] leading-relaxed">
          Nothing assigned yet. When your lead adds work, it shows here under Priority and Due.
        </p>
        <ul className="mt-4 space-y-2 text-[14px] text-[#0f1419] dark:text-[#e7e9ea]">
          <li className="flex gap-2">
            <span className="text-[#1d9bf0] font-bold">1.</span>
            Check Dashboard daily for assigned tasks
          </li>
          <li className="flex gap-2">
            <span className="text-[#1d9bf0] font-bold">2.</span>
            Use My Day for private notes and personal tasks
          </li>
          <li className="flex gap-2">
            <span className="text-[#1d9bf0] font-bold">3.</span>
            Open a task → update status → mark done
          </li>
        </ul>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link href="/my-day" className="btn-primary px-5 py-2.5 text-[14px]">
            Open My Day <ArrowRight size={15} />
          </Link>
          <Link href="/projects" className="text-[14px] font-bold text-[#1d9bf0] hover:underline">
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
    <div className="mb-4 border border-[#eff3f4] dark:border-[#2f3336] bg-white dark:bg-black overflow-hidden max-w-xl" style={{ borderRadius: 16 }}>
      <div className="h-1 bg-[#1d9bf0]" />
      <div className="p-5">
        <p className="text-[13px] font-bold text-[#1d9bf0]">Setup · 3 steps</p>
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {steps.map((s, i) => (
            <div key={s.label} className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 text-[12px] font-bold px-2.5 py-1 ${
                  s.done
                    ? 'bg-[#00ba7c]/15 text-[#00ba7c]'
                    : i === (hasTeam ? 1 : 0)
                      ? 'bg-[#e7e9ea] text-black dark:bg-[#e7e9ea] dark:text-black'
                      : 'border border-[#2f3336] text-[#71767b]'
                }`}
                style={{ borderRadius: 9999 }}
              >
                {s.done ? <CheckCircle2 size={12} /> : <span className="tabular-nums">{i + 1}</span>}
                {s.label}
              </span>
              {i < steps.length - 1 && <span className="text-[#2f3336] text-xs">→</span>}
            </div>
          ))}
        </div>
        <h2 className="mt-4 text-[20px] font-bold text-[#0f1419] dark:text-[#e7e9ea] tracking-tight">
          {next.title}
        </h2>
        <p className="mt-2 text-[15px] text-[#536471] dark:text-[#71767b] leading-relaxed">
          {next.body}
        </p>
        <Link href={next.href} className="mt-5 btn-primary inline-flex px-5 py-2.5 text-[14px]">
          {next.cta} <ArrowRight size={15} />
        </Link>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  PROJECTS COLUMN — left side, expandable project rows with tasks inside    */
/* ────────────────────────────────────────────────────────────────────────── */
function ProjectsColumn({
  projects,
  tasksByProject,
  suppressHeaderDesktop,
}: {
  projects: DashProject[];
  tasksByProject: Map<string, TeamTask[]>;
  suppressHeaderDesktop?: boolean;
}) {
  const isLead = useIsLead();
  return (
    <section className="min-w-0">
      <div
        className={`flex items-center justify-between gap-2 mb-3 ${suppressHeaderDesktop ? 'lg:hidden' : ''}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <FolderKanban size={14} className="text-slate-400 dark:text-white/30 shrink-0" />
          <h2 className="text-xs font-bold uppercase tracking-wider sm:tracking-[0.14em] text-[#536471] dark:text-[#71767b] truncate">
            Your team’s projects
          </h2>
          <span className="text-[10px] text-slate-300 dark:text-white/20 font-semibold shrink-0 tabular-nums">
            {projects.length}
          </span>
        </div>
        <Link
          href="/projects"
          className="text-[13px] font-normal text-[#1d9bf0] hover:underline shrink-0 whitespace-nowrap transition-colors"
        >
          All projects →
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="border-y border-[#eff3f4] dark:border-[#2f3336] text-center py-12 px-6">
          <div className="text-[15px] font-bold text-[#0f1419] dark:text-[#e7e9ea] mb-1">
            No ongoing projects
          </div>
          <div className="text-[13px] text-[#71767b] max-w-xs mx-auto leading-relaxed">
            {isLead
              ? 'Create a project to track work here.'
              : 'Projects you work on will show up here.'}
          </div>
          <Link href={isLead ? '/projects/new' : '/my-day'} className="btn-primary text-[13px] mt-4 inline-flex">
            {isLead ? 'New project' : 'My Day'}
          </Link>
        </div>
      ) : (
        <div className="border-t border-[#eff3f4] dark:border-[#2f3336]">
          {projects.map((p) => (
            <ProjectRow key={p.id} project={p} tasks={tasksByProject.get(p.id) || []} />
          ))}
        </div>
      )}
    </section>
  );
}

/* Inline vertical task list inside an expanded project row. Tasks are shown in
   a single, deterministic order: by CC Target Completion Date (TCD), then due
   date, soonest first — so the most time-critical work is always at the top
   and the view is identical for every viewer on every reload. (We deliberately
   removed dashboard drag-reordering: a quick bird's-eye list shouldn't carry
   hidden per-user state, and TCD order is the one an auditor expects.) */
function DashboardTaskFlow({ tasks, projectId }: { tasks: TeamTask[]; projectId: string }) {
  const sorted = useMemo(() => {
    const keyOf = (t: TeamTask) => {
      const d = t.ccTcd || t.dueDate;
      return d ? new Date(d).getTime() : Number.POSITIVE_INFINITY;
    };
    return [...tasks].sort((a, b) => keyOf(a) - keyOf(b));
  }, [tasks]);

  const visible = sorted.slice(0, 20);
  const doneCount = sorted.filter((t) => t.status === 'done').length;

  return (
    <div className="pl-7">
      <div className="flex items-center justify-between py-2 border-b border-[#eff3f4] dark:border-[#2f3336]">
        <span className="text-[11px] font-semibold text-[#71767b]">
          {doneCount}/{sorted.length} done
        </span>
        <Link
          href={`/projects/${projectId}`}
          className="text-[12px] font-bold text-[#1d9bf0] hover:underline"
        >
          Board
        </Link>
      </div>

      <ul>
        {visible.map((t) => {
          const isDone = t.status === 'done';
          const due = t.ccTcd || t.dueDate;
          const dueIn = daysUntil(due);
          const overdue = isOverdue(due, t.status);
          const isBlocked = t.status === 'blocked';

          const [dotColor, dotTitle] = ((): [string, string] => {
            if (isDone) return ['#10b981', 'Done'];
            if (isBlocked) return ['#ef4444', 'Blocked'];
            if (overdue) return ['#ef4444', 'Overdue'];
            if (dueIn !== null && dueIn <= 3) return ['#d97706', 'Due soon'];
            if (t.status === 'in_progress') return ['#fafafa', 'In progress'];
            if (t.status === 'review') return ['#7c3aed', 'In review'];
            return ['#94a3b8', 'To do'];
          })();

          const stateMeta = ((): { label: string; fg: string; bg: string } | null => {
            if (isDone) return { label: 'Done', fg: '#059669', bg: 'rgba(16,185,129,0.12)' };
            if (t.status === 'in_progress')
              return { label: 'In progress', fg: '#fafafa', bg: '#2f3336' };
            if (t.status === 'review')
              return { label: 'In review', fg: '#7c3aed', bg: 'rgba(124,58,237,0.12)' };
            if (t.status === 'todo' || !t.status)
              return { label: 'To do', fg: '#64748b', bg: 'rgba(100,116,139,0.10)' };
            return null;
          })();

          const dateLabel = !due
            ? null
            : isDone
              ? formatDate(due)
              : dueIn === null
                ? formatDate(due)
                : dueIn < 0
                  ? `${Math.abs(dueIn)}d over`
                  : dueIn === 0
                    ? 'Today'
                    : dueIn <= 7
                      ? `in ${dueIn}d`
                      : formatDate(due);
          const dateTone = isDone
            ? 'text-slate-300 dark:text-white/20'
            : overdue
              ? 'text-red-600 dark:text-[#f4212e] font-bold'
              : dueIn !== null && dueIn <= 3
                ? 'text-amber-700 dark:text-amber-400 font-bold'
                : 'text-slate-400 dark:text-white/28';

          return (
            <li key={t.id} className="border-b border-[#eff3f4] dark:border-[#2f3336] last:border-0">
              <Link
                href={`/tasks/${t.id}`}
                className="group flex items-center gap-3 py-2.5 pr-1 hover:bg-[rgba(15,20,25,0.02)] dark:hover:bg-[rgba(231,233,234,0.02)] transition-colors"
              >
                <span
                  className="shrink-0 w-1.5 h-1.5 rounded-full"
                  style={{
                    background: isDone ? '#71767b' : overdue || isBlocked ? '#f4212e' : '#1d9bf0',
                  }}
                  title={dotTitle}
                />
                <span
                  className={`flex-1 min-w-0 text-[13px] font-medium line-clamp-1 ${
                    isDone ? 'line-through text-[#71767b]' : 'text-[#0f1419] dark:text-[#e7e9ea]'
                  }`}
                >
                  {t.title}
                </span>
                {t.assigneeName && (
                  <span className="hidden sm:inline shrink-0 text-[11px] text-[#71767b] truncate max-w-[100px]">
                    {t.assigneeName.split(/\s+/)[0]}
                  </span>
                )}
                {(overdue || isBlocked) && (
                  <span className="shrink-0 text-[11px] font-bold text-[#f4212e]">
                    {overdue ? `${Math.abs(dueIn ?? 0)}d late` : 'Blocked'}
                  </span>
                )}
                {dateLabel && !overdue && (
                  <span className="shrink-0 text-[11px] tabular-nums text-[#71767b]">{dateLabel}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      {sorted.length > 20 && (
        <div className="border-t border-slate-100 dark:border-[#2f3336]">
          <Link
            href={`/projects/${projectId}`}
            className="group flex items-center justify-between gap-3 px-5 py-2.5 text-[10.5px] hover:bg-white dark:hover:bg-white/[0.04] transition-colors"
          >
            <span className="text-slate-400 dark:text-white/28">Showing 20 of {sorted.length} tasks</span>
            <span className="text-[#0f1419] dark:text-[#e7e9ea] font-semibold group-hover:translate-x-0.5 transition-transform">
              Open project board →
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}

function ProjectRow({
  project,
  tasks,
}: {
  project: DashProject;
  tasks: TeamTask[];
}) {
  // Collapsed by default — the dashboard should land quiet. The user expands
  // only what they want to inspect.
  const [open, setOpen] = useState(false);
  const total = project.taskCount ?? 0;
  const done = project.tasksDone ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const dueIn = daysUntil(project.dueDate);

  // Human-readable due summary. Renders as one short phrase that conveys
  // "when is this expected to land" without a verbose "Due Jul 3 · 30d left"
  // strip running across the row.
  const dueLabel = !project.dueDate
    ? null
    : dueIn === null
      ? formatDate(project.dueDate)
      : dueIn < 0
        ? `${Math.abs(dueIn)}d overdue`
        : dueIn === 0
          ? 'Due today'
          : dueIn <= 7
            ? `${dueIn}d left`
            : `Due ${formatDate(project.dueDate)}`;
  const dueUrgent = dueIn !== null && (dueIn < 0 || dueIn === 0);

  // One quiet meta line — no chip soup.
  const metaParts: string[] = [];
  if (project.code) metaParts.push(project.code);
  metaParts.push(`${done}/${total} done`);
  if (project.overdueCount > 0) metaParts.push(`${project.overdueCount} late`);
  else if (dueLabel) metaParts.push(dueLabel);
  if (project.ownerName) metaParts.push(project.ownerName);

  return (
    <article className="min-w-0 border-b border-[#eff3f4] dark:border-[#2f3336]">
      <header
        onClick={() => setOpen((o) => !o)}
        className="px-0 py-3.5 flex items-start gap-3 cursor-pointer hover:bg-[rgba(15,20,25,0.02)] dark:hover:bg-[rgba(231,233,234,0.02)] transition-colors select-none"
      >
        <span
          className="mt-1 text-[#71767b] shrink-0 inline-flex"
          aria-hidden
        >
          <ChevronDown
            size={16}
            className="transition-transform duration-150"
            style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
          />
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <Link
              href={`/projects/${project.id}`}
              onClick={(e) => e.stopPropagation()}
              className="text-[15px] font-bold text-[#0f1419] dark:text-[#e7e9ea] hover:underline leading-snug line-clamp-2"
            >
              {project.name}
            </Link>
            <span
              className={`shrink-0 text-[13px] font-bold tabular-nums ${
                project.overdueCount > 0
                  ? 'text-[#f4212e]'
                  : 'text-[#71767b]'
              }`}
            >
              {pct}%
            </span>
          </div>
          <div className="mt-1 text-[12px] text-[#71767b] truncate">
            {metaParts.join(' · ')}
          </div>
          <div className="mt-2.5 max-w-[200px]">
            <ProgressBar value={pct} />
          </div>
        </div>
      </header>

      {open && (
        <div className="pb-2 fade-in-soft">
          {tasks.length === 0 ? (
            <div className="py-6 pl-7 text-[13px] text-[#71767b]">
              No tasks yet.{' '}
              <Link href={`/projects/${project.id}`} className="text-[#1d9bf0] hover:underline font-semibold">
                Open project
              </Link>
            </div>
          ) : (
            <DashboardTaskFlow tasks={tasks} projectId={project.id} />
          )}
        </div>
      )}
    </article>
  );
}

function TaskTableRow({ t }: { t: TeamTask }) {
  const due = t.ccTcd || t.dueDate;
  const dueIn = daysUntil(due);
  const overdue = isOverdue(due, t.status);

  return (
    <tr className="group hover:bg-slate-50/80 transition-colors">
      <td className="px-4 py-2.5">
        <Link
          href={`/tasks/${t.id}`}
          className="text-xs text-zinc-800 dark:text-white/85 font-medium hover:text-black dark:hover:text-white line-clamp-1 group-hover:underline underline-offset-2"
        >
          {t.title}
        </Link>
      </td>
      <td className="px-2 py-2.5 whitespace-nowrap">
        {t.subtaskCount > 0 ? (
          <span className="text-[11px] text-slate-500 font-medium">
            {t.subtasksDone}/{t.subtaskCount}
          </span>
        ) : (
          <span className="text-slate-300 text-xs">—</span>
        )}
      </td>
      <td className="px-2 py-2.5 whitespace-nowrap">
        {due ? (
          <span className={`text-[11px] ${overdue ? 'text-red-600 font-semibold' : 'text-slate-600'}`}>
            {formatDate(due)}
            {dueIn !== null && (
              <span className="text-[9px] text-slate-400 ml-1">
                {dueIn < 0 && t.status !== 'done'
                  ? `(${Math.abs(dueIn)}d late)`
                  : dueIn === 0 && t.status !== 'done'
                    ? '(today)'
                    : ''}
              </span>
            )}
          </span>
        ) : (
          <span className="text-slate-300 text-xs">—</span>
        )}
      </td>
      <td className="px-2 py-2.5">
        {t.assigneeName ? (
          <div className="flex items-center gap-1.5">
            <UserAvatar userId={t.assigneeId} name={t.assigneeName} size={18} />
            <span className="text-[11px] text-slate-600 truncate max-w-[80px]">{t.assigneeName}</span>
          </div>
        ) : (
          <span className="text-slate-300 text-xs">—</span>
        )}
      </td>
      <td className="px-2 py-2.5">
        <span
          className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded ${STATUS_COLORS[t.status] || 'bg-slate-100 text-slate-500'}`}
        >
          {STATUS_LABEL[t.status] || t.status}
        </span>
      </td>
      <td className="px-2 py-2.5 whitespace-nowrap">
        {t.completedAt ? (
          <span className="text-[11px] text-emerald-700 font-medium">{formatDate(t.completedAt)}</span>
        ) : (
          <span className="text-slate-300 text-xs">—</span>
        )}
      </td>
    </tr>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  MY TASKS PANEL — tasks assigned to the current user (all roles)           */
/* ────────────────────────────────────────────────────────────────────────── */
function MyTasksPanel({ tasks, myId }: { tasks: TeamTask[]; myId: string }) {
  const myTasks = tasks.filter((t) => t.assigneeId === myId && t.status !== 'done');
  const myDone = tasks.filter((t) => t.assigneeId === myId && t.status === 'done').length;
  const myOverdue = myTasks.filter((t) => isOverdue(t.ccTcd || t.dueDate, t.status)).length;

  if (myTasks.length === 0 && myDone === 0) return null;

  return (
    <section
      className="border-t border-[#eff3f4] dark:border-[#2f3336] overflow-hidden mt-4 pt-3"
      style={{ boxShadow: 'none' }}
    >
      <PanelHeader
        icon={<CheckCircle2 size={13} />}
        tint={PANEL_TINTS.emerald}
        title="My tasks"
        count={myTasks.length}
        countSuffix=" open"
        trailing={
          myOverdue > 0 ? (
            <span className="text-[10px] font-bold text-red-600 dark:text-[#f4212e] bg-red-50 dark:bg-red-500/10 px-1.5 py-0.5 rounded-full">
              {myOverdue} overdue
            </span>
          ) : null
        }
      />
      {myTasks.length === 0 ? (
        <div className="py-7 text-center">
          <CheckCircle2 size={18} className="mx-auto text-emerald-300 mb-1.5" />
          <div className="text-[11px] text-slate-400 dark:text-white/25">All caught up — {myDone} done.</div>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-white/[0.06] max-h-72 overflow-y-auto">
          {myTasks.slice(0, 15).map((t) => {
            const due = t.ccTcd || t.dueDate;
            const dueIn = daysUntil(due);
            const overdue = isOverdue(due, t.status);
            const dotColor =
              t.status === 'in_progress'
                ? '#3B82F6'
                : t.status === 'review'
                  ? '#8B5CF6'
                  : t.status === 'blocked'
                    ? '#EF4444'
                    : '#94A3B8';
            return (
              <li key={t.id}>
                <Link
                  href={`/tasks/${t.id}`}
                  className={`flex items-start gap-3 px-4 py-2.5 transition-colors group ${overdue ? 'hover:bg-red-50/40 dark:hover:bg-red-500/[0.05]' : 'hover:bg-slate-50/70 dark:hover:bg-white/[0.03]'}`}
                >
                  <span
                    className="mt-1.5 w-2 h-2 rounded-full shrink-0"
                    style={{ background: dotColor, boxShadow: `0 0 0 3px ${dotColor}28` }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-semibold text-slate-700 dark:text-white/75 line-clamp-1 group-hover:text-black dark:group-hover:text-white">
                      {t.title}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-slate-400 dark:text-white/30 flex-wrap">
                      <span className="font-mono font-bold text-[#536471] dark:text-[#71767b]">
                        {t.projectCode}
                      </span>
                      {due && (
                        <>
                          <span className="text-slate-300 dark:text-white/15">·</span>
                          <span className={overdue ? 'text-red-500 font-bold' : ''}>
                            {dueIn === null
                              ? formatDate(due)
                              : dueIn < 0
                                ? `${Math.abs(dueIn)}d overdue`
                                : dueIn === 0
                                  ? 'today'
                                  : `in ${dueIn}d`}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md shrink-0 ${STATUS_COLORS[t.status] || 'bg-slate-100 text-slate-500'}`}
                  >
                    {STATUS_LABEL[t.status] || t.status}
                  </span>
                </Link>
              </li>
            );
          })}
          {myTasks.length > 15 && (
            <li className="px-4 py-2.5 text-[10px] text-slate-400 dark:text-white/30">
              +{myTasks.length - 15} more —{' '}
              <Link href="/my-day" className="text-[#0f1419] dark:text-[#e7e9ea] font-bold">
                view in My Day →
              </Link>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  UP NEXT PANEL — right column top, due/overdue with filter chips             */
/*  Named for what it answers: "what's coming up?" It surfaces overdue work     */
/*  first (red), then upcoming due tasks in the chosen window. The name beats   */
/*  the previous "Actions" / "Work Hub" / "Due Center" iterations because it    */
/*  reads as immediately purposeful — a lead glancing at the dashboard knows    */
/*  what they're being asked to look at.                                        */
/* ────────────────────────────────────────────────────────────────────────── */
function UpNextPanel({
  tasks,
  expanded,
  onExpandedChange,
  suppressHeaderDesktop,
}: {
  tasks: TeamTask[];
  expanded: boolean;
  onExpandedChange: (v: boolean) => void;
  suppressHeaderDesktop?: boolean;
}) {
  const [filter, setFilter] = useState<ActionFilter>('week');
  const [untilDate, setUntilDate] = useState<string | null>(null);
  const setExpanded = onExpandedChange;

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  // Compute window
  let windowEnd: Date | null = null;
  if (filter === 'week') {
    windowEnd = new Date(startOfToday);
    windowEnd.setDate(windowEnd.getDate() + 7);
  } else if (filter === 'nextWeek') {
    windowEnd = new Date(startOfToday);
    windowEnd.setDate(windowEnd.getDate() + 14);
  } else if (filter === 'month') {
    // End of the current calendar month, not a rolling 30-day window
    windowEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  } else if (filter === 'untilDate' && untilDate) {
    windowEnd = new Date(untilDate + 'T23:59:59');
  }

  const overdue = tasks.filter((t) => {
    if (t.status === 'done') return false;
    const due = t.ccTcd || t.dueDate;
    return due && new Date(due) < startOfToday;
  });

  const due = windowEnd
    ? tasks.filter((t) => {
        if (t.status === 'done') return false;
        const d = t.ccTcd || t.dueDate;
        if (!d) return false;
        const date = new Date(d);
        return date >= startOfToday && date <= windowEnd!;
      })
    : [];

  // Sort each by due ascending
  const sortByDue = (a: TeamTask, b: TeamTask) => {
    const da = a.ccTcd ? new Date(a.ccTcd).getTime() : a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
    const db = b.ccTcd ? new Date(b.ccTcd).getTime() : b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
    return da - db;
  };
  overdue.sort(sortByDue);
  due.sort(sortByDue);

  const FILTERS: { key: ActionFilter; label: string }[] = [
    { key: 'week', label: 'This week' },
    { key: 'nextWeek', label: 'Next week' },
    { key: 'month', label: 'This month' },
    { key: 'untilDate', label: 'Until…' },
  ];

  const totalCount = overdue.length + due.length;
  const inner = (
    <section className="min-w-0">
      {/* Section header — same geometry as "Your team's projects" on the left
          column: floating label above the card (icon · uppercase title · count),
          with the expand affordance on the right. Hidden inside the full-screen
          overlay, which supplies its own title. */}
      {!expanded && (
        <div
          className={`flex items-center justify-between gap-2 mb-3 ${suppressHeaderDesktop ? 'lg:hidden' : ''}`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <TrendingUp size={14} className="text-slate-400 dark:text-white/30 shrink-0" />
            <h2 className="text-xs font-bold uppercase tracking-wider sm:tracking-[0.14em] text-[#536471] dark:text-[#71767b] truncate">
              Due
            </h2>
            <span className="text-[10px] text-slate-300 dark:text-white/20 font-semibold shrink-0 tabular-nums">
              {totalCount}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label="Expand Due"
            className="shrink-0 p-1 rounded text-slate-400 hover:text-slate-700 dark:text-white/30 dark:hover:text-white/70 hover:bg-slate-100 dark:hover:bg-white/[0.04] transition-colors"
          >
            <Maximize2 size={13} />
          </button>
        </div>
      )}
      <div className="overflow-y-auto" style={{ maxHeight: expanded ? 'calc(100vh - 220px)' : '55vh' }}>
          {overdue.length > 0 && (
            <ActionGroup
              title="Overdue"
              count={overdue.length}
              icon={<AlertTriangle size={11} className="text-[#f4212e]" />}
              dotClass="bg-[#f4212e]"
              tasks={overdue}
              isOverdue
              showAll={expanded}
            />
          )}

          <div>
            <div className="flex items-center justify-between py-2 border-b border-[#eff3f4] dark:border-[#2f3336]">
              <span className="text-[12px] font-bold text-[#71767b]">Coming up</span>
              <span className="text-[12px] font-semibold text-[#71767b] tabular-nums">{due.length}</span>
            </div>
            <div className="py-2 border-b border-[#eff3f4] dark:border-[#2f3336]">
              <div className="flex gap-1 flex-wrap">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`text-[11px] font-semibold px-2.5 py-1 transition-colors ${
                      filter === f.key
                        ? 'bg-[#0f1419] text-white dark:bg-[#e7e9ea] dark:text-black'
                        : 'text-[#71767b] hover:text-[#0f1419] dark:hover:text-[#e7e9ea]'
                    }`}
                    style={{ borderRadius: 9999 }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              {filter === 'untilDate' && (
                <div className="mt-2">
                  <DatePicker
                    value={untilDate}
                    onChange={setUntilDate}
                    placeholder="Pick an end date"
                    size="sm"
                    minDate={new Date()}
                  />
                </div>
              )}
            </div>
            <ActionGroup
              title=""
              count={due.length}
              icon={null}
              dotClass="bg-[#71767b]"
              tasks={due}
              showAll={expanded}
              emptyHint={
                filter === 'untilDate' && !untilDate
                  ? 'Pick a date to see upcoming work.'
                  : 'Nothing due.'
              }
              hideHeader
            />
          </div>
      </div>
    </section>
  );

  return expanded ? (
    <FullScreenOverlay
      title="Due"
      icon={<TrendingUp size={14} className="text-zinc-500 dark:text-white/45" />}
      onClose={() => setExpanded(false)}
    >
      {inner}
    </FullScreenOverlay>
  ) : (
    inner
  );
}

function ActionGroup({
  title,
  count,
  icon,
  tasks,
  isOverdue,
  emptyHint,
  showAll,
  hideHeader,
}: {
  title: string;
  count: number;
  icon: React.ReactNode;
  dotClass?: string;
  tasks: TeamTask[];
  isOverdue?: boolean;
  emptyHint?: string;
  showAll?: boolean;
  /** When true, the small group header is suppressed — the parent has
   *  already rendered its own (e.g. the Due panel pulls the Due header
   *  out so the filter chips can sit between it and the list). */
  hideHeader?: boolean;
}) {
  const limit = showAll ? tasks.length : 12;
  return (
    <div>
      {!hideHeader && (
        <div className="flex items-center justify-between px-4 py-2 bg-slate-50/40 dark:bg-white/[0.03] border-b border-slate-100 dark:border-white/[0.05]">
          <div className="flex items-center gap-1.5">
            {icon}
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-white/35">
              {title}
            </span>
            {count > 0 && (
              <span className="text-[9px] font-bold text-slate-300 dark:text-white/20">nearest first</span>
            )}
          </div>
          <span className="text-[10px] font-bold text-slate-400 dark:text-white/25">{count}</span>
        </div>
      )}
      {tasks.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <CheckCircle2 size={18} className="mx-auto text-emerald-300 mb-1.5" />
          <div className="text-[11px] text-slate-400 dark:text-white/25">{emptyHint || 'All clear'}</div>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-white/[0.05]">
          {tasks.slice(0, limit).map((t) => {
            const due = t.ccTcd || t.dueDate;
            const dueIn = daysUntil(due);
            const pill = (() => {
              if (dueIn === null)
                return {
                  label: due ? formatDate(due) : '—',
                  cls: 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/45',
                };
              if (dueIn < 0)
                return {
                  label: `${Math.abs(dueIn)}d late`,
                  cls: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
                };
              if (dueIn === 0)
                return {
                  label: 'Today',
                  cls: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
                };
              if (dueIn <= 2)
                return {
                  label: `${dueIn}d`,
                  cls: 'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
                };
              return {
                label: `${dueIn}d`,
                cls: 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/45',
              };
            })();
            return (
              <li key={t.id} className="list-row-cv">
                <Link
                  href={`/tasks/${t.id}`}
                  prefetch
                  className={`flex items-center gap-3 px-4 py-2.5 transition-colors group fluid-press ${
                    isOverdue
                      ? 'hover:bg-red-50/40 dark:hover:bg-red-500/[0.05]'
                      : 'hover:bg-slate-50/70 dark:hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-semibold text-slate-700 dark:text-white/85 line-clamp-1 group-hover:text-black dark:group-hover:text-white">
                      {t.title}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-white/30 flex-wrap">
                      {t.projectCode && (
                        <span className="font-mono font-bold text-[#536471] dark:text-[#71767b]">
                          {t.projectCode}
                        </span>
                      )}
                      {t.assigneeName && (
                        <>
                          <span className="text-slate-200 dark:text-white/15">·</span>
                          <span className="truncate max-w-[120px]">{t.assigneeName}</span>
                        </>
                      )}
                      {due && (
                        <>
                          <span className="text-slate-200 dark:text-white/15">·</span>
                          <span>{formatDate(due)}</span>
                        </>
                      )}
                      {t.slipRisk && dueIn !== null && dueIn >= 0 && (
                        <>
                          <span className="text-slate-200 dark:text-white/15">·</span>
                          <span
                            className="font-bold text-orange-600 dark:text-orange-400 cursor-help"
                            title={`Early warning: ${t.slipRisk.reason}`}
                          >
                            may slip
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md ${pill.cls}`}>
                    {pill.label}
                  </span>
                </Link>
              </li>
            );
          })}
          {tasks.length > limit && (
            <li className="px-4 py-2.5 text-[10px] text-slate-400 dark:text-white/30">
              +{tasks.length - limit} more
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  CONTRIBUTORS PANEL — right column bottom, per-person task details          */
/* ────────────────────────────────────────────────────────────────────────── */
function ContributorsPanel({
  people,
  tasksByAssignee,
}: {
  people: DashPerson[];
  tasksByAssignee: Map<string, TeamTask[]>;
}) {
  // Collapsed by default — expand when the lead wants a person-by-person view.
  const [panelOpen, setPanelOpen] = useState(false);

  if (people.length === 0) {
    return (
      <section
        className="border-t border-[#eff3f4] dark:border-[#2f3336] overflow-hidden mt-4 pt-3"
        style={{ boxShadow: 'none' }}
      >
        <PanelHeader
          icon={<UsersIcon size={13} />}
          tint={PANEL_TINTS.violet}
          title="Individual Contributors"
        />
      </section>
    );
  }

  // Exceptions first: overdue load, then open work — not motion scores.
  const sorted = [...people].sort(
    (a, b) => b.overdueCount - a.overdueCount || b.openTasks - a.openTasks,
  );

  return (
    <section
      className="border-t border-[#eff3f4] dark:border-[#2f3336] overflow-hidden mt-4 pt-3"
      style={{ boxShadow: 'none' }}
    >
      <PanelHeader
        icon={<UsersIcon size={13} />}
        tint={PANEL_TINTS.violet}
        title="Individual Contributors"
        count={people.length}
        onClick={() => setPanelOpen((o) => !o)}
        trailing={
          <span className="inline-flex p-1 rounded-full text-violet-500 dark:text-violet-400" aria-hidden>
            <ChevronDown
              size={14}
              className="transition-transform duration-200"
              style={{ transform: panelOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}
            />
          </span>
        }
      />

      {panelOpen && (
        <ul className="divide-y divide-slate-50 dark:divide-white/[0.04] border-t border-slate-100 dark:border-white/[0.05]">
          {sorted.map((p) => (
            <ContributorRow key={p.id} person={p} tasks={tasksByAssignee.get(p.id) || []} />
          ))}
        </ul>
      )}
    </section>
  );
}

/* ── My Focus (IC counterpart to ContributorsPanel) ────────────────────────
   A per-project rollup of the contributor's own open tasks. Mirrors the
   visual shape of ContributorsPanel so the right column reads the same for
   both roles — three stacked panels, same header style, same collapse
   affordance — even though the content is role-appropriate. */
function MyFocusPanel({ tasks, projects, myId }: { tasks: TeamTask[]; projects: any[]; myId: string }) {
  const [panelOpen, setPanelOpen] = useState(true);

  const myOpen = tasks.filter((t) => t.assigneeId === myId && t.status !== 'done');
  if (myOpen.length === 0) return null;

  const projMap = new Map(projects.map((p: any) => [p.id, p]));
  const byProject = new Map<string, TeamTask[]>();
  for (const t of myOpen) {
    if (!byProject.has(t.projectId)) byProject.set(t.projectId, []);
    byProject.get(t.projectId)!.push(t);
  }
  const rows = [...byProject.entries()]
    .map(([projectId, ts]) => ({
      projectId,
      project: projMap.get(projectId),
      tasks: ts,
      overdue: ts.filter((t) => isOverdue(t.ccTcd || t.dueDate, t.status)).length,
    }))
    .sort((a, b) => b.overdue - a.overdue || b.tasks.length - a.tasks.length);

  return (
    <section
      className="border-t border-[#eff3f4] dark:border-[#2f3336] overflow-hidden mt-4 pt-3"
      style={{ boxShadow: 'none' }}
    >
      <div
        className="px-4 py-3 flex items-center gap-2 cursor-pointer hover:bg-slate-50/60 dark:hover:bg-white/[0.03] select-none transition-colors"
        onClick={() => setPanelOpen((o) => !o)}
      >
        <FolderKanban size={13} className="text-slate-400 dark:text-white/30" />
        <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-white/35">
          Focus by project
        </h3>
        <span className="ml-auto text-[10px] text-slate-300 dark:text-white/20 font-semibold">
          {rows.length}
        </span>
        <ChevronDown
          size={12}
          className="text-emerald-500 hover:text-emerald-600 dark:text-emerald-400 transition-transform duration-200 rounded-full"
          style={{ transform: panelOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}
        />
      </div>

      {panelOpen && (
        <ul className="divide-y divide-slate-50 dark:divide-white/[0.04] border-t border-slate-100 dark:border-white/[0.05]">
          {rows.map((r) => (
            <li key={r.projectId}>
              <Link
                href={`/projects/${r.projectId}`}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50/60 dark:hover:bg-white/[0.03] transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-slate-700 dark:text-white/70 truncate">
                    {r.project?.name || 'Project'}
                  </div>
                  {r.project?.code && (
                    <div className="text-[10px] font-mono text-slate-400 dark:text-white/30 mt-0.5">
                      {r.project.code}
                    </div>
                  )}
                </div>
                <span className="text-[10px] font-bold text-slate-500 dark:text-white/35 shrink-0">
                  {r.tasks.length} open
                </span>
                {r.overdue > 0 && (
                  <span className="text-[10px] font-bold text-red-500 shrink-0">{r.overdue} overdue</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ContributorRow({
  person,
  tasks,
}: {
  person: DashPerson;
  tasks: TeamTask[];
}) {
  const [open, setOpen] = useState(false);

  // Overdue first, then in_progress / blocked / review, then due date.
  const STATUS_ORDER: Record<string, number> = {
    blocked: 0,
    in_progress: 1,
    review: 2,
    todo: 3,
  };
  const sorted = [...tasks].sort((a, b) => {
    const aOver = isOverdue(a.ccTcd || a.dueDate, a.status) ? 0 : 1;
    const bOver = isOverdue(b.ccTcd || b.dueDate, b.status) ? 0 : 1;
    if (aOver !== bOver) return aOver - bOver;
    const s = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
    if (s !== 0) return s;
    const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
    const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
    return da - db;
  });

  return (
    <li>
      <div
        className="group px-4 py-2.5 cursor-pointer hover:bg-slate-50/60 dark:hover:bg-white/[0.03] transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-2">
          <UserAvatar userId={person.id} name={person.name} size={26} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-800 dark:text-white/75 truncate">
                {person.name}
              </span>
            </div>
            <div className="text-[10px] text-slate-400 dark:text-white/30 truncate">
              {person.openTasks} open
              {person.overdueCount > 0 && (
                <span className="text-red-600 dark:text-[#f4212e] font-semibold ml-1.5">
                  · {person.overdueCount} overdue
                </span>
              )}
            </div>
          </div>
          {person.overdueCount > 0 && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-[#f4212e]">
              Overdue
            </span>
          )}
          <button
            className="p-0.5 text-emerald-500 hover:text-emerald-600 dark:text-emerald-400 transition-transform"
            style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >
            <ChevronDown size={12} />
          </button>
        </div>
      </div>

      {open && (
        <div className="pb-2 fade-in-soft">
          {sorted.length === 0 ? (
            <div className="px-4 pb-3 text-[11px] text-slate-400 dark:text-white/25">
              No open assignments.
            </div>
          ) : (
            <ul className="mx-3 mb-2 divide-y divide-slate-100 dark:divide-white/[0.05] rounded-xl border border-slate-100 dark:border-[#2f3336] overflow-hidden bg-white dark:bg-white/[0.02]">
              {sorted.slice(0, 5).map((t) => {
                const due = t.ccTcd || t.dueDate;
                const dueIn = daysUntil(due);
                const overdue = isOverdue(due, t.status);
                return (
                  <li key={t.id}>
                    <Link
                      href={`/tasks/${t.id}`}
                      className={`flex items-start gap-2.5 px-3 py-2.5 transition-colors group ${overdue ? 'hover:bg-red-50/40 dark:hover:bg-red-500/[0.04]' : 'hover:bg-slate-50 dark:hover:bg-white/[0.03]'}`}
                    >
                      <span
                        className="mt-1 w-1.5 h-1.5 rounded-full shrink-0"
                        style={{
                          background:
                            t.status === 'in_progress'
                              ? '#3B82F6'
                              : t.status === 'review'
                                ? '#8B5CF6'
                                : t.status === 'blocked'
                                  ? '#EF4444'
                                  : '#94A3B8',
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-[11.5px] font-semibold text-slate-700 dark:text-white/70 hover:text-black dark:group-hover:text-white line-clamp-1">
                          {t.title}
                        </div>
                        <div className="text-[10px] text-slate-400 dark:text-white/30 mt-0.5 flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono font-bold text-[#536471] dark:text-[#71767b]">
                            {t.projectCode}
                          </span>
                          <span
                            className={`px-1 py-0 rounded-sm ${STATUS_COLORS[t.status] || 'bg-slate-100 text-slate-500'} text-[9px] font-bold`}
                          >
                            {STATUS_LABEL[t.status] || t.status}
                          </span>
                          {t.subtaskCount > 0 && (
                            <span>
                              {t.subtasksDone}/{t.subtaskCount} sub
                            </span>
                          )}
                          {due && (
                            <span className={overdue ? 'text-red-500 font-semibold' : ''}>
                              {dueIn === null
                                ? formatDate(due)
                                : dueIn < 0
                                  ? `${Math.abs(dueIn)}d late`
                                  : dueIn === 0
                                    ? 'today'
                                    : `${dueIn}d`}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
              {sorted.length > 5 && (
                <li className="px-3 py-2 text-[10px] text-slate-400 dark:text-white/30">
                  +{sorted.length - 5} more tasks
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}
