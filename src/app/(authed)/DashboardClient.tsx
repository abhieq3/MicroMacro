'use client';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
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
import { useIsLead } from '@/components/CurrentUserContext';
import { useToast } from '@/components/Toast';
import { notifyCalendarChange } from '@/components/SidebarCalendar';
import type { CompleteAck } from '@/components/TaskCompletePop';
import dynamic from 'next/dynamic';
import {
  AlertTriangle,
  FolderKanban,
  Check,
  CheckCircle2,
  Circle,
  Play,
  Users as UsersIcon,
  ChevronDown,
  TrendingUp,
  Clock,
  ArrowRight,
  Maximize2,
  X,
  BarChart3,
} from 'lucide-react';
// Lazy — contributor activity graph only when a lead opens a member.
const ActivityGraph = dynamic(
  () => import('@/components/ActivityGraph').then((m) => m.ActivityGraph),
  { ssr: false, loading: () => <div className="h-40 rounded-xl bg-slate-50 dark:bg-white/[0.04] animate-pulse" /> },
);
function warmActivityGraph(userId: string | undefined) {
  void import('@/components/ActivityGraph').then((m) =>
    m.preloadActivityGraphData({ userId }),
  );
}
// Lazy — the bird's-eye view is a heavy SVG layout component and most
// visits won't open it. Keep it out of the dashboard's first paint.
const BirdsEyeView = dynamic(() => import('@/components/BirdsEyeView').then((m) => m.BirdsEyeView), {
  ssr: false,
  loading: () => null,
});
import type { BirdsEyeData } from '@/components/BirdsEyeView';
import { BirdEyeButton } from '@/components/BirdEyeButton';
import { BIRDS_EYE_ENABLED } from '@/lib/features';
import { api } from '@/lib/client/api';
// Flow strip is secondary; keep first paint light. Off when FLOW_SIGNAL_MODE=off.
const FlowSignalStrip = dynamic(
  () => import('@/components/FlowSignalStrip').then((m) => m.FlowSignalStrip),
  { ssr: false, loading: () => null },
);
const TaskCompletePop = dynamic(
  () => import('@/components/TaskCompletePop').then((m) => m.TaskCompletePop),
  { ssr: false, loading: () => null },
);
import type { FlowSignalPayload } from '@/components/FlowSignalStrip';
// The Morning Brief stays available through its other channels (push, email,
// calendar feed) — the dashboard card was removed by owner decision: the
// Up Next panel and the summary chips already answer "what's on today" here.

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
  // Build a synthetic team id from name. Lead-dashboard doesn't return team
  // ids on projects, so we group by name — that's fine for visualisation.
  const teamIdByName = new Map<string, string>();
  const teams: { id: string; name: string; ownerName?: string | null }[] = [];
  for (const p of dash.projects) {
    const name = (p.teamName || '').trim();
    if (!name) continue;
    if (!teamIdByName.has(name)) {
      const id = `team:${name}`;
      teamIdByName.set(name, id);
      teams.push({ id, name });
    }
  }
  return {
    rootLabel: `${dash.user.name}'s workspace`,
    rootSubLabel: `${dash.teamCount} team${dash.teamCount === 1 ? '' : 's'} · ${dash.projects.length} project${dash.projects.length === 1 ? '' : 's'} · ${dash.teamTasks.length} task${dash.teamTasks.length === 1 ? '' : 's'}`,
    scope: 'workspace',
    teams,
    projects: dash.projects.map((p) => ({
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
    tasks: dash.teamTasks.map((t) => ({
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

/* ── Today actions (start / finish / add without leaving home) ──────────── */
const DashActionsCtx = createContext<{
  markDone: (task: TeamTask) => Promise<void>;
  startWork: (task: TeamTask) => Promise<void>;
  addTask: (projectId: string, title: string) => Promise<void>;
  busyId: string | null;
  myId: string;
  isLead: boolean;
}>({
  markDone: async () => {},
  startWork: async () => {},
  addTask: async () => {},
  busyId: null,
  myId: '',
  isLead: false,
});

function useDashActions() {
  return useContext(DashActionsCtx);
}

function canFinish(task: TeamTask, myId: string, isLead: boolean) {
  return isLead || (!!task.assigneeId && task.assigneeId === myId);
}

function DoneButton({ task }: { task: TeamTask }) {
  const { markDone, startWork, busyId, myId, isLead } = useDashActions();
  if (task.status === 'done' || !canFinish(task, myId, isLead)) {
    return <span className="h-6 w-6 shrink-0" aria-hidden />;
  }
  const busy = busyId === task.id;
  const isStart = task.status === 'todo';
  return (
    <button
      type="button"
      title={isStart ? 'Start' : 'Mark done'}
      aria-label={isStart ? `Start “${task.title}”` : `Mark “${task.title}” done`}
      disabled={busy}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void (isStart ? startWork(task) : markDone(task));
      }}
      className={`group/done shrink-0 grid h-6 w-6 place-items-center rounded-full text-slate-300 dark:text-white/25 transition-colors disabled:opacity-40 ${
        isStart
          ? 'hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10'
          : 'hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
      }`}
    >
      {busy ? (
        <span
          className={`h-3.5 w-3.5 rounded-full border-2 border-t-transparent animate-spin ${
            isStart ? 'border-blue-400' : 'border-emerald-400'
          }`}
        />
      ) : isStart ? (
        <>
          <Circle size={15} strokeWidth={2} className="group-hover/done:hidden" />
          <Play size={12} strokeWidth={2.4} className="hidden group-hover/done:block" fill="currentColor" />
        </>
      ) : (
        <>
          <Circle size={15} strokeWidth={2} className="group-hover/done:hidden" />
          <CheckCircle2 size={15} strokeWidth={2.2} className="hidden group-hover/done:block" />
        </>
      )}
    </button>
  );
}

function urgencyRank(t: TeamTask): number {
  if (isOverdue(t.ccTcd || t.dueDate, t.status)) return 0;
  if (t.status === 'blocked') return 1;
  const d = daysUntil(t.ccTcd || t.dueDate);
  if (d === 0) return 2;
  if (t.status === 'in_progress') return 3;
  if (t.status === 'review') return 4;
  if (d !== null && d > 0 && d <= 2) return 5;
  if (d !== null && d > 0 && d <= 7) return 6;
  return 9;
}

function sortByMorning(a: TeamTask, b: TeamTask) {
  const ra = urgencyRank(a);
  const rb = urgencyRank(b);
  if (ra !== rb) return ra - rb;
  const da = daysUntil(a.ccTcd || a.dueDate) ?? 999;
  const db = daysUntil(b.ccTcd || b.dueDate) ?? 999;
  return da - db;
}

type ScratchNoteRow = { id: string; text: string; done: boolean; createdAt: string };

/** One-line capture on Today — lands in personal scratch; open notes stay visible. */
function TodayCapture() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [notes, setNotes] = useState<ScratchNoteRow[]>([]);
  const [actingId, setActingId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api<{ open: ScratchNoteRow[] }>('/scratch')
      .then((d) => {
        if (live) setNotes((d.open || []).slice(0, 5));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      const created = await api<ScratchNoteRow>('/scratch', { method: 'POST', body: { text: t } });
      setText('');
      if (created?.id) setNotes((prev) => [created, ...prev].slice(0, 5));
      setFlash('Captured');
      setTimeout(() => setFlash(null), 1600);
    } catch {
      setFlash('Failed — try Capture');
      setTimeout(() => setFlash(null), 2200);
    } finally {
      setBusy(false);
    }
  }

  async function toggleNote(n: ScratchNoteRow) {
    setNotes((prev) => prev.filter((x) => x.id !== n.id));
    try {
      await api(`/scratch/${n.id}`, { method: 'PATCH', body: { done: true } });
    } catch {
      setNotes((prev) => [n, ...prev].slice(0, 5));
    }
  }

  async function promoteNote(n: ScratchNoteRow) {
    if (actingId) return;
    setActingId(n.id);
    try {
      const personal = await api<{ id: string }>('/projects/personal');
      const task = await api<{ id: string }>('/tasks', {
        method: 'POST',
        body: { projectId: personal.id, title: n.text, privateToMe: true },
      });
      await api(`/scratch/${n.id}`, {
        method: 'PATCH',
        body: { done: true, promotedTaskId: task.id },
      });
      setNotes((prev) => prev.filter((x) => x.id !== n.id));
      setFlash('On your board');
      setTimeout(() => setFlash(null), 1800);
      router.refresh();
    } catch {
      setFlash('Could not make a task');
      setTimeout(() => setFlash(null), 2200);
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="mb-5 rounded-2xl border border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-[#222327] shadow-sm dark:shadow-[0_1px_0_rgba(255,255,255,0.04)_inset] overflow-hidden">
      <form onSubmit={submit} className="flex items-center gap-2 px-3 py-2 sm:px-3.5 sm:py-2.5">
        <input
          className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[13px] sm:text-sm text-slate-800 dark:text-white/90 placeholder:text-slate-400 dark:placeholder:text-white/30 py-1"
          placeholder="Capture a thought…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
          maxLength={500}
          aria-label="Capture a thought"
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="btn-primary text-xs shrink-0 disabled:opacity-40 !py-1.5 !px-3"
        >
          Add
        </button>
        {flash && (
          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
            {flash}
          </span>
        )}
        <Link
          href="/my-day"
          className="text-[11px] font-bold text-slate-400 hover:text-blue-600 dark:text-white/35 dark:hover:text-blue-400 shrink-0 hidden sm:inline pl-0.5"
        >
          Board →
        </Link>
      </form>
      {notes.length > 0 && (
        <ul className="border-t border-slate-100 dark:border-white/[0.06] divide-y divide-slate-50 dark:divide-white/[0.04]">
          {notes.map((n) => (
            <li key={n.id} className="flex items-center gap-2 px-3 sm:px-3.5 py-1.5">
              <button
                type="button"
                title="Clear note"
                aria-label={`Clear “${n.text}”`}
                onClick={() => void toggleNote(n)}
                className="group/note shrink-0 grid h-5 w-5 place-items-center rounded-full text-slate-300 dark:text-white/25 hover:text-emerald-600 dark:hover:text-emerald-400"
              >
                <Circle size={13} className="group-hover/note:hidden" />
                <Check size={13} strokeWidth={2.6} className="hidden group-hover/note:block" />
              </button>
              <span className="min-w-0 flex-1 text-[12px] text-slate-600 dark:text-white/60 truncate">
                {n.text}
              </span>
              <button
                type="button"
                title="Make this a task"
                disabled={actingId === n.id}
                onClick={() => void promoteNote(n)}
                className="shrink-0 text-[10px] font-bold text-slate-400 hover:text-blue-600 dark:text-white/35 dark:hover:text-blue-400 disabled:opacity-40"
              >
                {actingId === n.id ? '…' : 'Task'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The single most urgent exception — overdue or blocked only. Never far-out work. */
function ClearFirstCard({ task }: { task: TeamTask }) {
  const due = task.ccTcd || task.dueDate;
  const overdue = isOverdue(due, task.status);
  const dueIn = daysUntil(due);
  const why = overdue
    ? dueIn !== null
      ? `${Math.abs(dueIn)}d overdue`
      : 'Overdue'
    : 'Blocked';
  return (
    <div className="mb-5 rounded-2xl border border-red-200/80 dark:border-red-500/25 bg-gradient-to-r from-red-50/90 to-white dark:from-red-500/[0.10] dark:to-[#222327] overflow-hidden">
      <div className="px-3.5 py-3 sm:px-4 sm:py-3.5 flex items-start gap-3">
        <span className="mt-0.5 grid h-7 w-7 place-items-center rounded-full bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-300 shrink-0">
          <AlertTriangle size={14} strokeWidth={2.4} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-red-600/80 dark:text-red-300/70">
            Clear first
          </div>
          <Link
            href={`/tasks/${task.id}`}
            className="mt-0.5 block text-[14px] font-bold text-slate-900 dark:text-white/90 hover:text-blue-700 dark:hover:text-blue-400 line-clamp-2 leading-snug"
          >
            {task.title}
          </Link>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-white/40 flex-wrap">
            <span className="font-bold text-red-600 dark:text-red-400">{why}</span>
            {task.projectCode && (
              <>
                <span className="text-slate-300 dark:text-white/15">·</span>
                <span className="font-mono font-bold text-slate-500 dark:text-white/40">
                  {shortProjectCode(task.projectCode)}
                </span>
              </>
            )}
            {task.assigneeName && (
              <>
                <span className="text-slate-300 dark:text-white/15">·</span>
                <span className="truncate max-w-[140px]">{task.assigneeName}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
          <DoneButton task={task} />
          <Link
            href={`/tasks/${task.id}`}
            className="text-[11px] font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 hidden sm:inline"
          >
            Open →
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ── Main page ────────────────────────────────────────────────────────────── */
export default function DashboardClient({ initialData }: { initialData: DashResp }) {
  const dash = initialData;
  const router = useRouter();
  const isLead = useIsLead();
  const toast = useToast();
  // Realtime: the dashboard is server-rendered, so re-running the server
  // component (router.refresh) is the cheapest way to pull fresh rollups when
  // the tab regains focus, on a gentle interval, and on app-wide change events.
  useLiveRefresh(() => router.refresh());
  const [summaryModal, setSummaryModal] = useState<null | 'overdue' | 'blocked'>(null);
  // Bird's-eye view — the lead's whole workspace as a packed tree. Opened
  // from the small compass icon in the greeting row.
  const [birdsEyeOpen, setBirdsEyeOpen] = useState(false);
  // Up Next's expand state is lifted here so the shared two-column header bar
  // (below) can own the expand control — keeping both column titles on one
  // inline header row instead of two floating labels.
  const [upNextExpanded, setUpNextExpanded] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set());
  const [statusOverride, setStatusOverride] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState<CompleteAck | null>(null);

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
  const visibleTasks = useMemo(() => {
    const scoped = isLead ? dash.teamTasks : dash.teamTasks.filter((t) => t.assigneeId === myId);
    const live = dismissedIds.size === 0 ? scoped : scoped.filter((t) => !dismissedIds.has(t.id));
    if (Object.keys(statusOverride).length === 0) return live;
    return live.map((t) => (statusOverride[t.id] ? { ...t, status: statusOverride[t.id] } : t));
  }, [dash, isLead, myId, dismissedIds, statusOverride]);

  const markDone = useCallback(
    async (task: TeamTask) => {
      if (busyId) return;
      setBusyId(task.id);
      setDismissedIds((prev) => {
        const next = new Set(prev);
        next.add(task.id);
        return next;
      });
      try {
        const res = await api<{ projectClear?: boolean; projectName?: string | null }>(
          `/tasks/${task.id}`,
          { method: 'PATCH', body: { status: 'done' } },
        );
        notifyCalendarChange();
        setCelebrate({
          id: task.id,
          title: task.title,
          projectClear: !!res?.projectClear,
          projectName: res?.projectName ?? task.projectName ?? null,
        });
        router.refresh();
      } catch (e: any) {
        setDismissedIds((prev) => {
          const next = new Set(prev);
          next.delete(task.id);
          return next;
        });
        toast.error(e?.message || 'Could not mark done');
      } finally {
        setBusyId(null);
      }
    },
    [busyId, router, toast],
  );

  const startWork = useCallback(
    async (task: TeamTask) => {
      if (busyId) return;
      setBusyId(task.id);
      setStatusOverride((prev) => ({ ...prev, [task.id]: 'in_progress' }));
      try {
        await api(`/tasks/${task.id}`, { method: 'PATCH', body: { status: 'in_progress' } });
        notifyCalendarChange();
        router.refresh();
      } catch (e: any) {
        setStatusOverride((prev) => {
          const next = { ...prev };
          delete next[task.id];
          return next;
        });
        toast.error(e?.message || 'Could not start task');
      } finally {
        setBusyId(null);
      }
    },
    [busyId, router, toast],
  );

  const addTask = useCallback(
    async (projectId: string, title: string) => {
      await api('/tasks', { method: 'POST', body: { projectId, title } });
      router.refresh();
    },
    [router],
  );

  const dashActions = useMemo(
    () => ({ markDone, startWork, addTask, busyId, myId, isLead }),
    [markDone, startWork, addTask, busyId, myId, isLead],
  );

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

  const blockedTasks = useMemo(
    () => openTasks.filter((t) => t.status === 'blocked'),
    [openTasks],
  );


  // Expanded project view: everyone sees the whole project's tasks, so an IC
  // can see the path of work around their own assignments — not just their
  // own row in isolation.
  const tasksByProject = useMemo(() => {
    const m = new Map<string, TeamTask[]>();
    for (const t of dash.teamTasks) {
      if (dismissedIds.has(t.id)) continue;
      const row = statusOverride[t.id] ? { ...t, status: statusOverride[t.id] } : t;
      if (!m.has(row.projectId)) m.set(row.projectId, []);
      m.get(row.projectId)!.push(row);
    }
    return m;
  }, [dash.teamTasks, dismissedIds, statusOverride]);

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
  const dateLabel = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(undefined, {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
      }).format(new Date());
    } catch {
      return '';
    }
  }, []);

  const clearFirst = useMemo(() => {
    const pool = [...overdueTasks, ...blockedTasks.filter((t) => !overdueTasks.some((o) => o.id === t.id))];
    if (pool.length === 0) return null;
    return [...pool].sort(sortByMorning)[0] ?? null;
  }, [overdueTasks, blockedTasks]);

  return (
    <DashActionsCtx.Provider value={dashActions}>
    <div className="pb-12 max-w-[1440px]">
      <TaskCompletePop task={celebrate} onDone={() => setCelebrate(null)} />
      {/* ── Greeting — page is Today; name + date sit under the title ───── */}
      <div className="mb-5 sm:mb-6 flex items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[1.85rem] sm:text-[2.05rem] font-black tracking-tight leading-none text-slate-900 dark:text-white">
            Today
          </h1>
          <div
            className="mt-1.5 text-[13px] font-medium text-slate-500 dark:text-white/40"
            suppressHydrationWarning
          >
            {firstName}
            {dateLabel ? ` · ${dateLabel}` : ''}
          </div>
        </div>
        {/* Bird's-eye — opt-in power tool, not the morning path. */}
        <div className="flex items-center gap-2 shrink-0 pb-0.5">
          {!isFirstRun && BIRDS_EYE_ENABLED && (
            <BirdEyeButton scopeKey="dashboard" onClick={() => setBirdsEyeOpen(true)} />
          )}
        </div>
      </div>
      {/* Subline removed. The summary chips below (Ongoing / Open / Overdue
          / Teams) already convey workspace state at a glance; an extra
          sentence above them was repeating the same numbers in prose. */}
      {/* Bird's-eye view modal — mounted at the page level so the SVG
          tree gets its own scroll area regardless of where the trigger
          was clicked from. */}
      {BIRDS_EYE_ENABLED && birdsEyeOpen && (
        <BirdsEyeView onClose={() => setBirdsEyeOpen(false)} data={buildBirdsEyeDataFromDash(dash)} />
      )}

      {isFirstRun ? (
        <FirstRunGuide hasTeam={dash.people.length > 0} />
      ) : (
        <>
          {isNewContributor && <ContributorWelcome name={dash.user.name} />}

          <TodayCapture />

          {/* ── Quick check / Needs attention strip ────────────────────────
              Renders nothing when FLOW_SIGNAL_MODE=off or nothing to surface. */}
          <FlowSignalStrip data={dash.flowSignal} />

          {/* Exceptions first — one Clear-first task, then the counts. */}
          {clearFirst && <ClearFirstCard task={clearFirst} />}
          {overdueTasks.length > 0 || blockedTasks.length > 0 ? (
            <div className="flex flex-wrap gap-2 mb-5">
              {overdueTasks.length > 0 && (
                <SummaryChip
                  label="Overdue"
                  value={overdueTasks.length}
                  accent="red"
                  onClick={() => setSummaryModal('overdue')}
                />
              )}
              {blockedTasks.length > 0 && (
                <SummaryChip
                  label="Blocked"
                  value={blockedTasks.length}
                  accent="amber"
                  onClick={() => setSummaryModal('blocked')}
                />
              )}
            </div>
          ) : (
            <div className="mb-5 flex items-center gap-2.5 rounded-2xl border border-emerald-200/80 dark:border-emerald-500/20 bg-gradient-to-r from-emerald-50/90 to-teal-50/40 dark:from-emerald-500/[0.12] dark:to-teal-500/[0.06] px-3.5 py-2">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 shrink-0">
                <CheckCircle2 size={14} strokeWidth={2.4} />
              </span>
              <div className="min-w-0">
                <div className="text-[13px] font-bold text-emerald-900 dark:text-emerald-200 tracking-tight">
                  Zero exceptions
                </div>
                <div className="text-[11px] text-emerald-700/75 dark:text-emerald-300/55">
                  Nothing overdue or blocked.
                </div>
              </div>
            </div>
          )}
          {summaryModal === 'overdue' && (
            <SummaryTaskPopup
              title="Overdue"
              subtitle="Past due — act or redate."
              tone="red"
              tasks={overdueTasks}
              onClose={() => setSummaryModal(null)}
            />
          )}
          {summaryModal === 'blocked' && (
            <SummaryTaskPopup
              title="Blocked"
              subtitle="Named bottleneck. Unblock or escalate."
              tone="amber"
              tasks={blockedTasks}
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
          <div className="hidden lg:grid lg:grid-cols-[minmax(0,1fr)_340px] gap-5 mb-3 items-center">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <FolderKanban size={14} className="text-slate-400 dark:text-white/30 shrink-0" />
                <h2 className="text-xs font-bold uppercase tracking-wider sm:tracking-[0.14em] text-slate-500 dark:text-white/40 truncate">
                  Projects
                </h2>
                <span className="text-[10px] text-slate-300 dark:text-white/20 font-semibold shrink-0 tabular-nums">
                  {ongoingProjects.length}
                </span>
              </div>
              <Link
                href="/projects"
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 shrink-0 whitespace-nowrap transition-colors"
              >
                All projects →
              </Link>
            </div>
            <div className="flex items-center justify-between gap-2 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <TrendingUp size={14} className="text-slate-400 dark:text-white/30 shrink-0" />
                <h2 className="text-xs font-bold uppercase tracking-wider sm:tracking-[0.14em] text-slate-500 dark:text-white/40 truncate">
                  Due
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setUpNextExpanded(true)}
                aria-label="Expand due list"
                className="shrink-0 p-1 rounded text-slate-400 hover:text-slate-700 dark:text-white/30 dark:hover:text-white/70 hover:bg-slate-100 dark:hover:bg-white/[0.04] transition-colors"
              >
                <Maximize2 size={13} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
            {/* Left column — Projects */}
            <ProjectsColumn
              projects={ongoingProjects}
              tasksByProject={tasksByProject}
              suppressHeaderDesktop
              expandSolo
            />

            {/* Right column — Due Center + "My tasks" (for leads: also Contributors). */}
            <div className="space-y-4 pr-1 min-w-0">
              <UpNextPanel
                tasks={visibleTasks}
                expanded={upNextExpanded}
                onExpandedChange={setUpNextExpanded}
                suppressHeaderDesktop
              />
              <MyTasksPanel tasks={visibleTasks} myId={myId} />
              {/* Leads see workload across their ICs. */}
              {isLead && <ContributorsPanel people={dash.people} tasksByAssignee={tasksByAssignee} />}
            </div>
          </div>
        </>
      )}

      {/* Onboarding tour is mounted centrally in AppShell so every role
          sees it on whichever page they land on. */}
    </div>
    </DashActionsCtx.Provider>
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
          className="bg-white dark:bg-[#222327] rounded-2xl w-full max-w-4xl my-2 shadow-2xl dark:border dark:border-white/[0.08]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 dark:border-white/[0.07] sticky top-0 bg-white dark:bg-[#222327] rounded-t-2xl z-10">
            {icon}
            <h3 className="text-sm font-bold text-slate-800 dark:text-white/85">{title}</h3>
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
   columns read as one inline layout. One geometry across Up Next / My Tasks /
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
      <h3 className="text-xs font-bold uppercase tracking-wider sm:tracking-[0.14em] text-slate-500 dark:text-white/40">
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
  blue: { bg: 'rgba(21,101,192,0.10)', fg: '#1565C0' },
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
  accent: 'blue' | 'red' | 'slate' | 'green' | 'amber';
  href?: string;
  onClick?: () => void;
}) {
  const styles = {
    blue: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400',
    red: 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400',
    slate: 'bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-white/55',
    green: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    amber: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400',
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
  tone: 'blue' | 'red' | 'amber';
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
    ) : tone === 'amber' ? (
      <AlertTriangle size={14} className="text-amber-500" />
    ) : (
      <CheckCircle2 size={14} className="text-blue-500" />
    );
  const banner =
    tone === 'red'
      ? 'border-red-100 bg-red-50 text-red-700'
      : tone === 'amber'
        ? 'border-amber-100 bg-amber-50 text-amber-800'
        : 'border-blue-100 bg-blue-50 text-blue-700';

  return (
    <FullScreenOverlay title={title} icon={icon} onClose={onClose}>
      <div className="px-5 pb-5">
        <div className={`mb-3 rounded-xl border px-3 py-2.5 ${banner}`}>
          <div className="text-xs font-bold">
            {sorted.length} task{sorted.length === 1 ? '' : 's'}
          </div>
          <div className="text-[11px] opacity-75 mt-0.5">{subtitle}</div>
        </div>
        {sorted.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">Nothing to list here.</div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-white/[0.06] rounded-xl border border-slate-100 dark:border-white/[0.07] overflow-hidden">
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
                      <DoneButton task={t} />
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

/* ── Contributor welcome ──────────────────────────────────────────────────
   Empty board on day one. One next action, premium calm. */
function ContributorWelcome({ name }: { name: string }) {
  const first = (name || '').trim().split(/\s+/)[0] || 'there';
  return (
    <div
      className="mb-6 rounded-2xl border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-[#2a2a28] overflow-hidden max-w-xl"
      style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}
    >
      <div
        className="h-1"
        style={{ background: 'linear-gradient(90deg, #1256B0 0%, #22c55e 100%)' }}
      />
      <div className="p-5">
        <h2 className="text-base font-black text-slate-800 dark:text-white/85 tracking-tight">
          {first}
        </h2>
        <p className="mt-1.5 text-[13px] text-slate-500 dark:text-white/40 leading-relaxed">
          No tasks assigned.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link
            href="/my-day"
            className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold text-white transition-all"
            style={{ background: 'linear-gradient(135deg, #1256B0 0%, #1769C8 100%)' }}
          >
            My Day <ArrowRight size={13} />
          </Link>
          <Link
            href="/projects"
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-slate-500 hover:text-blue-600 dark:text-white/40 dark:hover:text-blue-400"
          >
            Projects
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ── First-run guide ──────────────────────────────────────────────────────
   Lead/admin empty workspace. Soft path + one CTA (not a three-button syllabus). */
function FirstRunGuide({ hasTeam }: { hasTeam: boolean }) {
  const steps = [
    { label: 'Team', done: hasTeam },
    { label: 'Project', done: false },
    { label: 'First task', done: false },
  ];
  const next = hasTeam
    ? {
        href: '/projects/new',
        title: 'Add a project',
        body: 'Team is ready. Create a project and assign work.',
        cta: 'New project',
      }
    : {
        href: '/teams',
        title: 'Add a team',
        body: 'Create a team, then projects and members.',
        cta: 'New team',
      };

  return (
    <div
      className="mb-6 rounded-2xl border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-[#2a2a28] overflow-hidden max-w-xl"
      style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}
    >
      <div
        className="h-1"
        style={{ background: 'linear-gradient(90deg, #1256B0 0%, #22c55e 100%)' }}
      />
      <div className="p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-white/30">
          Setup
        </p>
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {steps.map((s, i) => (
            <div key={s.label} className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-1 rounded-full ${
                  s.done
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
                    : i === (hasTeam ? 1 : 0)
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400 ring-1 ring-blue-200/80 dark:ring-blue-500/30'
                      : 'bg-slate-50 text-slate-400 dark:bg-white/[0.04] dark:text-white/30'
                }`}
              >
                {s.done ? (
                  <CheckCircle2 size={12} />
                ) : (
                  <span className="w-4 h-4 rounded-full grid place-items-center text-[10px] border border-current/30">
                    {i + 1}
                  </span>
                )}
                {s.label}
              </span>
              {i < steps.length - 1 && (
                <span className="text-slate-200 dark:text-white/15 text-xs">→</span>
              )}
            </div>
          ))}
        </div>
        <h2 className="mt-4 text-base font-black text-slate-800 dark:text-white/85 tracking-tight">
          {next.title}
        </h2>
        <p className="mt-1.5 text-[13px] text-slate-500 dark:text-white/40 leading-relaxed">
          {next.body}
        </p>
        <Link
          href={next.href}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold text-white transition-all"
          style={{ background: 'linear-gradient(135deg, #1256B0 0%, #1769C8 100%)' }}
        >
          {next.cta} <ArrowRight size={13} />
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
  expandSolo,
}: {
  projects: DashProject[];
  tasksByProject: Map<string, TeamTask[]>;
  suppressHeaderDesktop?: boolean;
  expandSolo?: boolean;
}) {
  const isLead = useIsLead();
  return (
    <section className="min-w-0">
      <div
        className={`flex items-center justify-between gap-2 mb-3 ${suppressHeaderDesktop ? 'lg:hidden' : ''}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <FolderKanban size={14} className="text-slate-400 dark:text-white/30 shrink-0" />
          <h2 className="text-xs font-bold uppercase tracking-wider sm:tracking-[0.14em] text-slate-500 dark:text-white/40 truncate">
            Projects
          </h2>
          <span className="text-[10px] text-slate-300 dark:text-white/20 font-semibold shrink-0 tabular-nums">
            {projects.length}
          </span>
        </div>
        <Link
          href="/projects"
          className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 shrink-0 whitespace-nowrap transition-colors"
        >
          All projects →
        </Link>
      </div>

      {projects.length === 0 ? (
        <div
          className="bg-white dark:bg-[#222327] rounded-2xl border border-slate-200/80 dark:border-white/[0.07] text-center py-12 px-6"
          style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}
        >
          <FolderKanban size={26} className="mx-auto text-slate-300 dark:text-white/20 mb-3" />
          <div className="text-sm font-semibold text-slate-600 dark:text-white/55 mb-1">
            No projects
          </div>
          <div className="text-xs text-slate-400 dark:text-white/30 max-w-xs mx-auto leading-relaxed">
            {isLead ? 'Create a project to track work here.' : 'No projects in your teams yet.'}
          </div>
          <Link href={isLead ? '/projects/new' : '/my-day'} className="btn-primary text-xs mt-4 inline-flex">
            {isLead ? 'New project' : 'My Day'}
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((p) => {
            const tasks = tasksByProject.get(p.id) || [];
            const hasFire =
              p.overdueCount > 0 || tasks.some((t) => t.status === 'blocked' || t.status === 'in_progress');
            return (
              <ProjectRow
                key={p.id}
                project={p}
                tasks={tasks}
                defaultOpen={!!expandSolo && (projects.length === 1 || hasFire)}
              />
            );
          })}
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
  const { myId, isLead } = useDashActions();
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
    <div className="bg-slate-50/60 dark:bg-black/[0.12]">
      {/* Header bar — distinguishes the task panel from the project card header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200/60 dark:border-white/[0.07]">
        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/35">
          Tasks · target date order
        </span>
        <div className="flex items-center gap-3">
          <span className="text-[9.5px] font-bold text-slate-400 dark:text-white/28 tabular-nums">
            {doneCount}/{sorted.length} done
          </span>
          <Link
            href={`/projects/${projectId}`}
            className="text-[9.5px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
          >
            Board →
          </Link>
        </div>
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
            if (t.status === 'in_progress') return ['#1565C0', 'In progress'];
            if (t.status === 'review') return ['#7c3aed', 'In review'];
            return ['#94a3b8', 'To do'];
          })();

          const stateMeta = ((): { label: string; fg: string; bg: string } | null => {
            if (isDone) return { label: 'Done', fg: '#059669', bg: 'rgba(16,185,129,0.12)' };
            if (t.status === 'in_progress')
              return { label: 'In progress', fg: '#1565C0', bg: 'rgba(21,101,192,0.12)' };
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
              ? 'text-red-600 dark:text-red-400 font-bold'
              : dueIn !== null && dueIn <= 3
                ? 'text-amber-700 dark:text-amber-400 font-bold'
                : 'text-slate-400 dark:text-white/28';

          return (
            <li key={t.id} className="border-b border-slate-100 dark:border-white/[0.05] last:border-0">
              <Link
                href={`/tasks/${t.id}`}
                className="group relative flex items-start gap-3 pl-5 pr-4 py-3 hover:bg-white dark:hover:bg-white/[0.04] transition-colors"
              >
                {/* Left status strip — the primary visual anchor that makes each
                    row readable at a glance; colour tracks the task's urgency/state */}
                <div
                  className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-full"
                  style={{ background: dotColor, opacity: isDone ? 0.25 : 0.75 }}
                />

                {/* Status / done — circle is the verb on open work */}
                <div className="shrink-0 mt-0.5">
                  {isDone ? (
                    <CheckCircle2 size={15} style={{ color: dotColor, opacity: 0.5 }} />
                  ) : canFinish(t, myId, isLead) ? (
                    <DoneButton task={t} />
                  ) : (
                    <span
                      title={dotTitle}
                      aria-label={dotTitle}
                      className="block w-2.5 h-2.5 rounded-full"
                      style={{ background: dotColor, boxShadow: `0 0 0 3px ${dotColor}28` }}
                    />
                  )}
                </div>

                {/* Row content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`flex-1 min-w-0 text-[13px] font-semibold line-clamp-1 leading-snug ${
                        isDone
                          ? 'line-through decoration-slate-300/60 dark:decoration-white/20 text-slate-400 dark:text-white/35'
                          : 'text-slate-800 dark:text-white/85 group-hover:text-blue-700 dark:group-hover:text-blue-400'
                      }`}
                    >
                      {t.title}
                    </span>

                    {stateMeta && !isBlocked && !overdue && (
                      <span
                        className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md"
                        style={{ color: stateMeta.fg, background: stateMeta.bg }}
                      >
                        {stateMeta.label}
                      </span>
                    )}

                    {overdue && (
                      <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10 px-1.5 py-0.5 rounded-md">
                        Overdue
                      </span>
                    )}
                    {isBlocked && !overdue && (
                      <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10 px-1.5 py-0.5 rounded-md">
                        Blocked
                      </span>
                    )}
                    {t.slipRisk && !isDone && !overdue && !isBlocked && (
                      <span
                        title={`Early warning: ${t.slipRisk.reason}`}
                        className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/10 px-1.5 py-0.5 rounded-md cursor-help"
                      >
                        May slip
                      </span>
                    )}
                    {!t.assigneeName && !isDone && (
                      <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-1.5 py-0.5 rounded-md">
                        Unassigned
                      </span>
                    )}

                    {dateLabel && (
                      <span className={`shrink-0 text-[10.5px] tabular-nums ${dateTone}`}>{dateLabel}</span>
                    )}
                  </div>

                  {t.assigneeName && (
                    <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-white/30">
                      <UserAvatar userId={t.assigneeId} name={t.assigneeName} size={15} />
                      <span className="truncate">{t.assigneeName}</span>
                    </div>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {sorted.length > 20 && (
        <div className="border-t border-slate-100 dark:border-white/[0.06]">
          <Link
            href={`/projects/${projectId}`}
            className="group flex items-center justify-between gap-3 px-5 py-2.5 text-[10.5px] hover:bg-white dark:hover:bg-white/[0.04] transition-colors"
          >
            <span className="text-slate-400 dark:text-white/28">Showing 20 of {sorted.length} tasks</span>
            <span className="text-blue-600 dark:text-blue-400 font-semibold group-hover:translate-x-0.5 transition-transform">
              Open project board →
            </span>
          </Link>
        </div>
      )}
      <ProjectQuickAdd projectId={projectId} />
    </div>
  );
}

function ProjectQuickAdd({ projectId }: { projectId: string }) {
  const { isLead, addTask } = useDashActions();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!isLead) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await addTask(projectId, t);
      setText('');
    } catch (e: any) {
      setErr(e?.message || 'Could not add task');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex items-center gap-2 px-4 py-2 border-t border-slate-100 dark:border-white/[0.06] bg-white/70 dark:bg-white/[0.02]"
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add a task…"
        disabled={busy}
        maxLength={300}
        aria-label="Add a task"
        className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[12.5px] text-slate-800 dark:text-white/85 placeholder:text-slate-400 dark:placeholder:text-white/30 py-1"
      />
      {err && <span className="text-[10px] text-red-500 shrink-0">{err}</span>}
      <button
        type="submit"
        disabled={busy || !text.trim()}
        className="text-[11px] font-bold text-blue-600 dark:text-blue-400 disabled:opacity-40 shrink-0"
      >
        Add
      </button>
    </form>
  );
}

function ProjectRow({
  project,
  tasks,
  defaultOpen = false,
}: {
  project: DashProject;
  tasks: TeamTask[];
  defaultOpen?: boolean;
}) {
  // Quiet by default unless this is the only project or it is on fire —
  // a single collapsed card on a healthy board reads as an empty page.
  const [open, setOpen] = useState(defaultOpen);
  const peek = useMemo(() => {
    return tasks
      .filter((t) => t.status !== 'done')
      .slice()
      .sort(sortByMorning)
      .slice(0, 2);
  }, [tasks]);
  const health = HEALTH_META[project.health];
  const total = project.taskCount ?? 0;
  const done = project.tasksDone ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const dueIn = daysUntil(project.dueDate);
  const cat =
    project.lifecycle && project.lifecycle !== 'generic'
      ? LIFECYCLE_LABELS[project.lifecycle] || project.lifecycle
      : null;

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

  return (
    <article
      className="min-w-0 bg-white dark:bg-[#222327] rounded-2xl border border-slate-200/80 dark:border-white/[0.07] overflow-hidden transition-all"
      style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}
    >
      {/* Collapsed-state header — two readable rows, never a 5-piece chip strip.
          Row 1: title + identity badges (code, lifecycle, health). Row 2: the
          essential metrics — progress, tasks-done, due, owner. */}
      <header
        onClick={() => setOpen((o) => !o)}
        className="px-4 py-2.5 flex items-center gap-3 cursor-pointer hover:bg-slate-50/60 dark:hover:bg-white/[0.03] transition-colors select-none"
      >
        <span className="p-1 text-emerald-500 dark:text-emerald-400 rounded-full shrink-0 inline-flex" aria-hidden>
          <ChevronDown
            size={14}
            className="transition-transform duration-200"
            style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
          />
        </span>

        {/* Three-level hierarchy:
             1. Title (largest, dark)
             2. Reference code (small, muted — its own line)
             3. Tags + single muted metadata strip */}
        <div className="flex-1 min-w-0">
          <Link
            href={`/projects/${project.id}`}
            onClick={(e) => e.stopPropagation()}
            className="block text-[15px] font-bold text-slate-800 dark:text-white/85 hover:text-blue-700 dark:hover:text-blue-400 line-clamp-2 sm:truncate leading-snug"
          >
            {project.name}
          </Link>
          <div className="text-[10px] font-bold text-slate-400/80 dark:text-white/25 tracking-wider mt-0.5">
            {project.code}
          </div>
          {/* Identity + metadata pills — replaces the dot-separated strip so
              each fact reads as its own chip and the row scans cleanly. */}
          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
            {project.isSystem && (
              <span className="text-[10px] font-semibold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-500/10 px-1.5 py-0.5 rounded">
                Recurring
              </span>
            )}
            {cat && !project.isSystem && (
              <span className="text-[10px] font-semibold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-1.5 py-0.5 rounded">
                {cat}
              </span>
            )}
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${health.bg} ${health.text}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${health.dot}`} aria-hidden />
              {health.label}
            </span>
            <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-slate-600 dark:text-white/50 bg-slate-50 dark:bg-white/[0.04] px-1.5 py-0.5 rounded">
              <span className="text-slate-800 dark:text-white/80 tabular-nums">
                {done}/{total}
              </span>
              <span className="text-slate-400 dark:text-white/30">tasks</span>
            </span>
            {dueLabel && (
              <span
                className={`inline-flex items-center gap-1 text-[10.5px] font-semibold px-1.5 py-0.5 rounded ${
                  dueUrgent
                    ? 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10'
                    : 'text-slate-600 dark:text-white/50 bg-slate-50 dark:bg-white/[0.04]'
                }`}
              >
                {dueLabel}
              </span>
            )}
            {project.overdueCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10 px-1.5 py-0.5 rounded">
                {project.overdueCount} overdue
              </span>
            )}
            {project.ownerName && (
              <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-slate-600 dark:text-white/50 bg-slate-50 dark:bg-white/[0.04] pl-0.5 pr-1.5 py-0.5 rounded">
                <UserAvatar userId={project.ownerId} name={project.ownerName} size={14} />
                <span className="truncate max-w-[140px]">{project.ownerName}</span>
              </span>
            )}
          </div>
        </div>

        {/* Progress + percentage — vertically centred next to the row */}
        <div className="w-14 sm:w-28 shrink-0 flex flex-col items-end justify-center gap-1">
          <ProgressBar value={pct} />
          <div className="text-[10px] text-slate-400 dark:text-white/30 font-semibold tabular-nums">
            {pct}%
          </div>
        </div>
      </header>

      {!open && peek.length > 0 && (
        <ul className="border-t border-slate-100 dark:border-white/[0.06] divide-y divide-slate-50 dark:divide-white/[0.04] bg-slate-50/40 dark:bg-black/[0.08]">
          {peek.map((t) => {
            const due = t.ccTcd || t.dueDate;
            const dueIn = daysUntil(due);
            const overdue = isOverdue(due, t.status);
            return (
              <li key={t.id}>
                <Link
                  href={`/tasks/${t.id}`}
                  className="flex items-center gap-2 px-4 py-2 hover:bg-white dark:hover:bg-white/[0.04] transition-colors group"
                >
                  <DoneButton task={t} />
                  <span className="min-w-0 flex-1 text-[12.5px] font-semibold text-slate-700 dark:text-white/75 line-clamp-1 group-hover:text-blue-700 dark:group-hover:text-blue-400">
                    {t.title}
                  </span>
                  {overdue ? (
                    <span className="text-[10px] font-bold text-red-600 dark:text-red-400 shrink-0">
                      {dueIn !== null ? `${Math.abs(dueIn)}d over` : 'Overdue'}
                    </span>
                  ) : t.status === 'blocked' ? (
                    <span className="text-[10px] font-bold text-red-600 dark:text-red-400 shrink-0">
                      Blocked
                    </span>
                  ) : due && dueIn !== null && dueIn <= 7 ? (
                    <span className="text-[10px] font-semibold text-slate-400 dark:text-white/30 shrink-0 tabular-nums">
                      {dueIn === 0 ? 'Today' : `in ${dueIn}d`}
                    </span>
                  ) : t.status === 'in_progress' ? (
                    <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 shrink-0">
                      In progress
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {/* Tasks panel — slightly sunken look separates it from the project header */}
      {open && (
        <div className="border-t-2 border-slate-100 dark:border-white/[0.08] fade-in-soft">
          {tasks.length === 0 ? (
            <div className="py-10 text-center bg-slate-50/60 dark:bg-black/[0.12]">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white dark:bg-white/[0.06] shadow-sm mb-2">
                <CheckCircle2 size={18} className="text-slate-300 dark:text-white/25" />
              </div>
              <div className="text-[12px] font-semibold text-slate-500 dark:text-white/45">
                No tasks yet for this project.
              </div>
              <Link
                href={`/projects/${project.id}`}
                className="inline-flex items-center gap-1 mt-2 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700"
              >
                Open the project board →
              </Link>
              <div className="mt-3 text-left">
                <ProjectQuickAdd projectId={project.id} />
              </div>
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
          className="text-xs text-slate-800 font-medium hover:text-blue-700 line-clamp-1 group-hover:underline underline-offset-2"
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
  const myOpen = tasks.filter((t) => t.assigneeId === myId && t.status !== 'done');
  // Morning surface: exceptions, work already in flight, and near-term due.
  // Far-out todo stays off Today — in-progress/review is not invented urgency.
  const isOnToday = (t: TeamTask) => {
    if (isOverdue(t.ccTcd || t.dueDate, t.status)) return true;
    if (t.status === 'blocked' || t.status === 'in_progress' || t.status === 'review') return true;
    const d = daysUntil(t.ccTcd || t.dueDate);
    return d !== null && d >= 0 && d <= 7;
  };
  const focus = myOpen.filter(isOnToday);
  const later = myOpen.filter((t) => !isOnToday(t));
  const myTasks = focus.slice().sort(sortByMorning);
  const nextLater = later
    .slice()
    .sort((a, b) => (daysUntil(a.ccTcd || a.dueDate) ?? 999) - (daysUntil(b.ccTcd || b.dueDate) ?? 999))[0];
  const myDone = tasks.filter((t) => t.assigneeId === myId && t.status === 'done').length;
  const myOverdue = myTasks.filter((t) => isOverdue(t.ccTcd || t.dueDate, t.status)).length;
  const myBlocked = myTasks.filter((t) => t.status === 'blocked');

  if (myOpen.length === 0 && myDone === 0) return null;

  return (
    <section
      className="bg-white dark:bg-[#222327] rounded-2xl border border-slate-200/80 dark:border-white/[0.08] overflow-hidden"
      style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}
    >
      <PanelHeader
        icon={<CheckCircle2 size={13} />}
        tint={PANEL_TINTS.emerald}
        title="You"
        count={myTasks.length}
        countSuffix={myTasks.length === 1 ? ' on Today' : ' on Today'}
        trailing={
          <span className="flex items-center gap-1">
            {myOverdue > 0 && (
              <span className="text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 px-1.5 py-0.5 rounded-full">
                {myOverdue} overdue
              </span>
            )}
            {myBlocked.length > 0 && (
              <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-1.5 py-0.5 rounded-full">
                {myBlocked.length} blocked
              </span>
            )}
          </span>
        }
      />
      {myTasks.length === 0 ? (
        <div className="px-4 py-3">
          <div className="text-[12px] font-semibold text-slate-600 dark:text-white/50">
            Nothing on your plate this week
          </div>
          {nextLater ? (
            <Link
              href={`/tasks/${nextLater.id}`}
              className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-500 dark:text-white/40 hover:text-blue-600 dark:hover:text-blue-400"
            >
              <span className="text-slate-400 dark:text-white/30 shrink-0">Next</span>
              <span className="min-w-0 truncate font-semibold">{nextLater.title}</span>
              <span className="shrink-0 tabular-nums">
                {nextLater.ccTcd || nextLater.dueDate
                  ? formatDate(nextLater.ccTcd || nextLater.dueDate)
                  : 'undated'}
              </span>
            </Link>
          ) : myDone > 0 ? (
            <div className="text-[11px] text-slate-400 dark:text-white/30 mt-1">{myDone} done.</div>
          ) : null}
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-white/[0.06] max-h-72 overflow-y-auto">
          {myTasks.slice(0, 12).map((t) => {
            const due = t.ccTcd || t.dueDate;
            const dueIn = daysUntil(due);
            const overdue = isOverdue(due, t.status);
            return (
              <li key={t.id}>
                <Link
                  href={`/tasks/${t.id}`}
                  className={`flex items-start gap-2.5 px-3 py-2.5 transition-colors group ${overdue ? 'hover:bg-red-50/40 dark:hover:bg-red-500/[0.05]' : 'hover:bg-slate-50/70 dark:hover:bg-white/[0.03]'}`}
                >
                  <DoneButton task={t} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-semibold text-slate-700 dark:text-white/80 line-clamp-1 group-hover:text-blue-700 dark:group-hover:text-blue-400">
                      {t.title}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-slate-400 dark:text-white/30 flex-wrap">
                      <span className="font-mono font-bold text-slate-500 dark:text-white/40">
                        {shortProjectCode(t.projectCode)}
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
          {later.length > 0 && (
            <li className="px-4 py-2.5 text-[10px] text-slate-400 dark:text-white/30">
              +{later.length} later (beyond 7 days) — not on the morning path
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
            <h2 className="text-xs font-bold uppercase tracking-wider sm:tracking-[0.14em] text-slate-500 dark:text-white/40 truncate">
              Due
            </h2>
            <span className="text-[10px] text-slate-300 dark:text-white/20 font-semibold shrink-0 tabular-nums">
              {totalCount}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label="Expand due list"
            className="shrink-0 p-1 rounded text-slate-400 hover:text-slate-700 dark:text-white/30 dark:hover:text-white/70 hover:bg-slate-100 dark:hover:bg-white/[0.04] transition-colors"
          >
            <Maximize2 size={13} />
          </button>
        </div>
      )}
      <div
        className="bg-white dark:bg-[#222327] rounded-2xl border border-slate-200/80 dark:border-white/[0.07] overflow-hidden"
        style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}
      >
        <div className="overflow-y-auto" style={{ maxHeight: expanded ? 'calc(100vh - 220px)' : '60vh' }}>
          {/* Overdue group — sits at the top: nothing to filter, just the
            tasks that have slipped past their date. */}
          {overdue.length > 0 && (
            <ActionGroup
              title="Overdue"
              count={overdue.length}
              icon={<AlertTriangle size={11} className="text-red-500" />}
              dotClass="bg-red-400"
              tasks={overdue}
              isOverdue
              showAll={expanded}
            />
          )}

          {/* Due group — header first, then the window filters (they control
            this group), then the list. Reading order matches the question:
            "what's due, and over what window?". */}
          <div>
            <div className="flex items-center justify-between px-4 py-2 bg-slate-50/40 dark:bg-white/[0.03] border-b border-slate-100 dark:border-white/[0.05]">
              <div className="flex items-center gap-1.5">
                <Clock size={11} className="text-blue-500" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-white/35">
                  Due
                </span>
                {due.length > 0 && (
                  <span className="text-[9px] font-bold text-slate-300 dark:text-white/20">
                    nearest first
                  </span>
                )}
              </div>
              <span className="text-[10px] font-bold text-slate-400 dark:text-white/25">{due.length}</span>
            </div>
            <div className="px-4 pt-2 pb-2 border-b border-slate-100 dark:border-white/[0.05]">
              <div className="flex gap-1 flex-wrap">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors ${
                      filter === f.key
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-slate-50 dark:bg-white/[0.04] text-slate-500 dark:text-white/35 hover:bg-slate-100 dark:hover:bg-white/[0.08]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              {filter === 'untilDate' && (
                <div className="mt-2.5">
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
              dotClass="bg-blue-400"
              tasks={due}
              showAll={expanded}
              emptyHint={
                filter === 'untilDate' && !untilDate
                  ? 'Pick a date to see upcoming work.'
                  : 'Nothing due in this window.'
              }
              hideHeader
            />
          </div>
        </div>
      </div>
    </section>
  );

  return expanded ? (
    <FullScreenOverlay
      title="Due"
      icon={<TrendingUp size={14} className="text-blue-500" />}
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
   *  already rendered its own (e.g. the Up Next panel pulls the Due header
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
          </div>
          <span className="text-[10px] font-bold text-slate-400 dark:text-white/25 tabular-nums">{count}</span>
        </div>
      )}
      {tasks.length === 0 ? (
        <div className="px-3 py-2.5 sm:px-4 text-[11px] text-slate-400 dark:text-white/30">
          {emptyHint || 'None'}
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
                  className={`flex items-center gap-2 sm:gap-3 px-3 py-2 sm:px-4 sm:py-2.5 transition-colors group fluid-press ${
                    isOverdue
                      ? 'hover:bg-red-50/40 dark:hover:bg-red-500/[0.05]'
                      : 'hover:bg-slate-50/70 dark:hover:bg-white/[0.03]'
                  }`}
                >
                  <DoneButton task={t} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-semibold text-slate-700 dark:text-white/85 line-clamp-1 group-hover:text-blue-700 dark:group-hover:text-blue-300">
                      {t.title}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-white/30 flex-wrap">
                      {t.projectCode && (
                        <span className="font-mono font-bold text-slate-500 dark:text-white/40">
                          {t.projectCode}
                        </span>
                      )}
                      {t.assigneeName && (
                        <>
                          <span className="text-slate-200 dark:text-white/15 hidden sm:inline">·</span>
                          <span className="truncate max-w-[100px] sm:max-w-[120px] hidden sm:inline">
                            {t.assigneeName}
                          </span>
                        </>
                      )}
                      {t.slipRisk && dueIn !== null && dueIn >= 0 && (
                        <>
                          <span className="text-slate-200 dark:text-white/15">·</span>
                          <span
                            className="font-bold text-orange-600 dark:text-orange-400 cursor-help"
                            title={t.slipRisk.reason}
                          >
                            may slip
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md tabular-nums ${pill.cls}`}>
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
  const overduePeople = people.filter((p) => p.overdueCount > 0).length;
  // Open when someone is late — otherwise stay collapsed so the morning stays quiet.
  const [panelOpen, setPanelOpen] = useState(overduePeople > 0);
  const [activityPerson, setActivityPerson] = useState<DashPerson | null>(null);

  if (people.length === 0) return null;

  // Exceptions first: overdue load, then open work.
  const sorted = [...people].sort(
    (a, b) => b.overdueCount - a.overdueCount || b.openTasks - a.openTasks,
  );

  return (
    <section
      className="hidden md:block bg-white dark:bg-[#222327] rounded-2xl border border-slate-200/80 dark:border-white/[0.07] overflow-hidden"
      style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}
    >
      <PanelHeader
        icon={<UsersIcon size={13} />}
        tint={PANEL_TINTS.violet}
        title="People"
        count={people.length}
        onClick={() => setPanelOpen((o) => !o)}
        trailing={
          <span className="flex items-center gap-2">
            {!panelOpen && (
              <span className="flex -space-x-1.5" aria-hidden>
                {sorted.slice(0, 5).map((p) => (
                  <span
                    key={p.id}
                    className="rounded-full ring-2 ring-white dark:ring-[#222327]"
                  >
                    <UserAvatar userId={p.id} name={p.name} size={18} />
                  </span>
                ))}
              </span>
            )}
            {overduePeople > 0 && (
              <span className="text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 px-1.5 py-0.5 rounded-full">
                {overduePeople} late
              </span>
            )}
            <span className="inline-flex p-1 rounded-full text-violet-500 dark:text-violet-400" aria-hidden>
              <ChevronDown
                size={14}
                className="transition-transform duration-200"
                style={{ transform: panelOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}
              />
            </span>
          </span>
        }
      />

      {panelOpen && (
        <ul className="divide-y divide-slate-50 dark:divide-white/[0.04] border-t border-slate-100 dark:border-white/[0.05]">
          {sorted.map((p) => (
            <ContributorRow
              key={p.id}
              person={p}
              tasks={tasksByAssignee.get(p.id) || []}
              onViewActivity={() => setActivityPerson(p)}
            />
          ))}
        </ul>
      )}

      {activityPerson && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45"
          onClick={() => setActivityPerson(null)}
        >
          <div
            className="bg-white dark:bg-[#1c1917] rounded-2xl shadow-2xl border border-slate-100 dark:border-white/10 p-6 w-full max-w-[820px] max-h-[calc(100vh-2rem)] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-5">
              <UserAvatar userId={activityPerson.id} name={activityPerson.name} size={44} />
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-black text-slate-900 dark:text-white truncate">
                  {activityPerson.name}
                </h3>
                <div className="text-xs text-slate-400 mt-0.5">Member activity</div>
              </div>
              <button
                type="button"
                onClick={() => setActivityPerson(null)}
                className="text-slate-300 hover:text-slate-500 ml-2 mt-0.5"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <ActivityGraph userId={activityPerson.id} name={activityPerson.name} />
          </div>
        </div>
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
      className="bg-white dark:bg-[#222327] rounded-2xl border border-slate-200/80 dark:border-white/[0.07] overflow-hidden"
      style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}
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
  onViewActivity,
}: {
  person: DashPerson;
  tasks: TeamTask[];
  onViewActivity?: () => void;
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
              {onViewActivity && (
                <button
                  type="button"
                  onMouseEnter={() => warmActivityGraph(person.id)}
                  onFocus={() => warmActivityGraph(person.id)}
                  onClick={(e) => {
                    e.stopPropagation();
                    warmActivityGraph(person.id);
                    onViewActivity();
                  }}
                  title={`View ${person.name}'s activity`}
                  aria-label={`View ${person.name}'s activity`}
                  className="text-slate-400 dark:text-white/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors shrink-0 p-0.5"
                >
                  <BarChart3 size={13} />
                </button>
              )}
            </div>
            <div className="text-[10px] text-slate-400 dark:text-white/30 truncate">
              {person.openTasks} open
              {person.overdueCount > 0 && (
                <span className="text-red-600 dark:text-red-400 font-semibold ml-1.5">
                  · {person.overdueCount} overdue
                </span>
              )}
            </div>
          </div>
          {person.overdueCount > 0 && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400">
              Overdue
            </span>
          )}
          <button
            type="button"
            className="p-0.5 text-emerald-500 hover:text-emerald-600 dark:text-emerald-400 transition-transform"
            style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
            aria-label={open ? 'Collapse' : 'Expand'}
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
            <ul className="mx-3 mb-2 divide-y divide-slate-100 dark:divide-white/[0.05] rounded-xl border border-slate-100 dark:border-white/[0.06] overflow-hidden bg-white dark:bg-white/[0.02]">
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
                      <DoneButton task={t} />
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
                        <div className="text-[11.5px] font-semibold text-slate-700 dark:text-white/70 hover:text-blue-700 dark:group-hover:text-blue-400 line-clamp-1">
                          {t.title}
                        </div>
                        <div className="text-[10px] text-slate-400 dark:text-white/30 mt-0.5 flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono font-bold text-slate-500 dark:text-white/40">
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
