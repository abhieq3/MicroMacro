'use client';
import { useEffect, useRef, useState } from 'react';
import { ModalPortal } from '@/components/ModalPortal';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/client/api';
import { notifyCalendarChange } from '@/components/SidebarCalendar';
import { useLiveRefresh } from '@/lib/client/useLiveRefresh';
import {
  Card,
  LifecycleTag,
  PriorityTag,
  StatusPillRow,
  StatusSelect,
  PROJECT_STATUS_OPTIONS,
  TaskLink,
  formatDate,
  formatDateTime,
  useToast,
} from '@/components/ui';
import { DatePicker } from '@/components/DatePicker';
import { UserPicker } from '@/components/UserPicker';
import { useIsLead, useIsAdmin } from '@/components/CurrentUserContext';
import { weightedProgress } from '@/lib/progress';
import { orderCriticalPathOpen } from '@/lib/criticalPath';
import {
  CheckCircle2,
  Plus,
  Trash2,
  AlertTriangle,
  Archive,
  X,
  Lock,
  Pencil,
  ShieldCheck,
  ScrollText,
  Eye,
  Sparkles,
  ChevronDown,
  RefreshCw,
  ArrowRight,
  Route,
} from 'lucide-react';
import { BirdEyeButton } from '@/components/BirdEyeButton';
import { BIRDS_EYE_ENABLED } from '@/lib/features';

import { chimeIfEnabled, playFanfare, playVictory } from '@/lib/sound';
import { Celebration, type CelebrationLevel } from '@/components/Celebration';
import { TaskCompletePop } from '@/components/TaskCompletePop';
import { useCurrentUser } from '@/components/CurrentUserContext';
import { ExportMenu } from '@/components/ExportMenu';
import { printProjectReport, downloadProjectReport, downloadProjectCsv } from './report';
import dynamic from 'next/dynamic';
import { STATUS_META, STATUSES } from './ProjectKanban';
// Heavy interactive SVG canvas — only load it when a viewer actually opens it.
const BirdsEyeView = dynamic(() => import('@/components/BirdsEyeView').then((m) => m.BirdsEyeView), {
  ssr: false,
  loading: () => null,
});
// Kanban is large — load only when user opens the board tab.
const KanbanBoard = dynamic(() => import('./ProjectKanban').then((m) => m.KanbanBoard), {
  ssr: false,
  loading: () => <div className="h-80 rounded-xl skeleton" />,
});
const KanbanBoardMobile = dynamic(() => import('./ProjectKanban').then((m) => m.KanbanBoardMobile), {
  ssr: false,
  loading: () => <div className="h-64 rounded-xl skeleton" />,
});

function ProjectStatusHover({
  value,
  onChange,
  pending,
}: {
  value: string;
  onChange: (value: string) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const options = PROJECT_STATUS_OPTIONS.filter((status) => status !== 'planning');
  const current = STATUS_META[value] || {
    label: value.replace(/_/g, ' '),
    color: '#475569',
    bg: '#f8fafc',
    border: '#e2e8f0',
  };
  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        type="button"
        disabled={pending}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold transition-shadow hover:shadow-sm disabled:opacity-60"
        style={{ color: current.color, background: current.bg, borderColor: current.border }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: current.color }} />
        {current.label}
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-full top-1/2 z-30 ml-2 flex -translate-y-1/2 items-center gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-lg dark:border-white/10 dark:bg-[#262624]"
        >
          {options
            .filter((status) => status !== value)
            .map((status) => {
              const meta = STATUS_META[status] || current;
              return (
                <button
                  key={status}
                  type="button"
                  role="menuitem"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setOpen(false);
                    onChange(status);
                  }}
                  className="whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-transform hover:-translate-y-px"
                  style={{ color: meta.color, background: meta.bg, borderColor: meta.border }}
                >
                  {meta.label}
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}


/* ── Quick-add task ───────────────────────────────────────────────────────── */
function QuickAddTask({
  projectId,
  phaseId,
  teamId,
  onAdded,
}: {
  projectId: string;
  phaseId?: string;
  teamId?: string | null;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState('');
  const [due, setDue] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Task-assist suggestions (assignee + due date). Read-only, computed from the
  // team's own history; the user always confirms by clicking a chip.
  const [sug, setSug] = useState<{
    assignee: { id: string; name: string; reason: string } | null;
    dueDate: { date: string; days: number; reason: string } | null;
  } | null>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  // Debounced lookup — only once a meaningful title exists.
  useEffect(() => {
    if (!open) {
      setSug(null);
      return;
    }
    const t = title.trim();
    if (t.length < 3) {
      setSug(null);
      return;
    }
    let cancelled = false;
    const h = setTimeout(async () => {
      try {
        const r = await api<any>(
          `/tasks/suggest?projectId=${encodeURIComponent(projectId)}&title=${encodeURIComponent(t)}`,
        );
        if (!cancelled) setSug(r);
      } catch {
        if (!cancelled) setSug(null);
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(h);
    };
  }, [title, open, projectId]);

  async function add(e?: React.FormEvent) {
    e?.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await api('/tasks', {
        method: 'POST',
        body: {
          projectId,
          phaseId: phaseId || undefined,
          title: title.trim(),
          assigneeId: assignee || undefined,
          dueDate: due || undefined,
        },
      });
      setTitle('');
      setDue('');
      setAssignee('');
      setOpen(false);
      notifyCalendarChange();
      onAdded();
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 w-full flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 border-dashed border-slate-200 dark:border-white/[0.07] text-xs text-slate-400 dark:text-white/25 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-300 dark:hover:border-blue-500/40 hover:bg-blue-50/40 dark:hover:bg-blue-500/[0.06] transition-all group"
      >
        <Plus
          size={12}
          className="group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors"
        />
        Add a task
      </button>
    );
  }

  return (
    <form
      onSubmit={add}
      className="mt-2 rounded-xl border-2 border-blue-200 dark:border-blue-500/30 overflow-hidden bg-blue-50/20 dark:bg-blue-500/[0.05] fade-in-soft"
    >
      <input
        ref={inputRef}
        className="w-full px-3 py-2.5 text-sm bg-transparent border-none outline-none text-slate-800 dark:text-white/85 placeholder:text-slate-400 dark:placeholder:text-white/25 font-medium"
        placeholder="Task title — press Enter to add"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false);
            setTitle('');
          }
        }}
      />
      {((sug?.assignee && !assignee) || (sug?.dueDate && !due)) && (
        <div className="flex flex-wrap items-center gap-1.5 px-2.5 pb-2">
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-blue-500/70 dark:text-blue-400/70">
            <Sparkles size={10} /> Suggested
          </span>
          {sug?.assignee && !assignee && (
            <button
              type="button"
              onClick={() => setAssignee(sug.assignee!.id)}
              title={sug.assignee.reason}
              className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-200/70 dark:border-blue-500/25 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
            >
              Assign {sug.assignee.name}
            </button>
          )}
          {sug?.dueDate && !due && (
            <button
              type="button"
              onClick={() => setDue(sug.dueDate!.date)}
              title={sug.dueDate.reason}
              className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5 bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-white/70 border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
            >
              Due {formatDate(sug.dueDate.date)}
            </button>
          )}
        </div>
      )}
      <div className="flex items-center gap-2 px-2.5 py-1.5 border-t border-blue-100 dark:border-blue-500/20 bg-white/60 dark:bg-white/[0.02]">
        <UserPicker
          className="flex-1"
          value={assignee}
          onChange={setAssignee}
          teamId={teamId}
          excludeAdmin
          size="sm"
          placeholder="Search to assign…"
          ariaLabel="Assignee"
        />
        <DatePicker value={due} onChange={(v) => setDue(v || '')} placeholder="Due date" size="sm" />
        <button
          type="submit"
          disabled={!title.trim() || saving}
          className="px-3 py-1 text-xs font-bold rounded-lg bg-blue-600 text-white disabled:opacity-50 hover:bg-blue-700 transition-colors shrink-0"
        >
          {saving ? '…' : 'Add'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setTitle('');
          }}
          className="p-1 text-slate-400 dark:text-white/30 hover:text-slate-600 dark:hover:text-white/60 rounded transition-colors"
        >
          <X size={13} />
        </button>
      </div>
    </form>
  );
}

/* ── Project-complete block modal ─────────────────────────────────────────── */
function BlockCompleteModal({ openCount, onClose }: { openCount: number; onClose: () => void }) {
  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 overlay-in"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 w-full max-w-sm modal-in"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
              <AlertTriangle size={18} className="text-amber-500" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">Can't mark as completed</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                <strong className="text-slate-700">
                  {openCount} {openCount === 1 ? 'task is' : 'tasks are'} still open.
                </strong>
              </p>
            </div>
          </div>
          <p className="text-sm text-slate-600 mb-5 leading-relaxed">
            All tasks must be marked <strong>Done</strong> before a project can be completed. Close out the
            remaining tasks and try again.
          </p>
          <button onClick={onClose} className="btn-primary w-full justify-center text-sm">
            Got it
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}

/* ── Project status sign-off (e-signature) modal ──────────────────────────────
   Changing a shared project's status is a controlled action: it demands the
   user re-enter their password (proves the signer is who they claim) and a
   reason, which is written verbatim to the audit trail. This is the
   21 CFR Part 11 §11.10/§11.50 e-signature pattern, reusing the same password
   re-auth shape as DeleteProjectModal. */
function prettyStatus(s?: string) {
  return String(s || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
function StatusSignoffModal({
  projectName,
  fromStatus,
  toStatus,
  onClose,
  onConfirm,
}: {
  projectName: string;
  fromStatus: string;
  toStatus: string;
  onClose: () => void;
  onConfirm: (password: string, remarks: string) => Promise<void>;
}) {
  const [password, setPassword] = useState('');
  const [remarks, setRemarks] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function confirm() {
    if (!password.trim()) {
      setErr('Password is required to sign this change.');
      return;
    }
    if (!remarks.trim()) {
      setErr('A reason is required for the audit trail.');
      return;
    }
    setLoading(true);
    setErr('');
    try {
      await onConfirm(password, remarks.trim());
    } catch (e: any) {
      setErr(e?.message || 'Could not apply the change. Check your password and try again.');
      setLoading(false);
    }
  }

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 overlay-in"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal
          className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 w-full max-w-modal modal-in"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
              <ShieldCheck size={18} className="text-blue-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-800">Sign off status change</h2>
              <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                <span className="font-semibold text-slate-700">{projectName}</span>:{' '}
                {prettyStatus(fromStatus)} →{' '}
                <span className="font-semibold text-slate-700">{prettyStatus(toStatus)}</span>
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 mb-4">
            <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-800 leading-snug">
              This is a controlled change. Your e-signature (password + reason) will be recorded in the audit
              trail with your name and the time — it cannot be edited or removed afterwards.
            </p>
          </div>

          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
            Reason for change
          </label>
          <textarea
            className="input w-full mb-3 resize-none"
            rows={2}
            placeholder="e.g. All deliverables verified — moving to In progress"
            value={remarks}
            onChange={(e) => {
              setRemarks(e.target.value);
              setErr('');
            }}
          />

          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
            Confirm with your password
          </label>
          <input
            ref={inputRef}
            type="password"
            className="input w-full mb-1"
            placeholder="Your password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setErr('');
            }}
            onKeyDown={(e) => e.key === 'Enter' && confirm()}
            autoComplete="current-password"
          />
          {err && <p className="text-xs text-red-600 mt-2">{err}</p>}

          <div className="flex gap-2 justify-end mt-4">
            <button className="btn-ghost text-sm" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              onClick={confirm}
              disabled={loading || !password.trim() || !remarks.trim()}
            >
              {loading ? 'Signing…' : 'Sign & apply'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

/* ── Delete project modal ─────────────────────────────────────────────────── */
function DeleteProjectModal({
  projectName,
  projectId,
  onClose,
  onDeleted,
}: {
  projectName: string;
  projectId: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function confirm() {
    if (!password.trim()) {
      setErr('Password is required');
      return;
    }
    setLoading(true);
    setErr('');
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.status === 401) {
        setErr('Incorrect password');
        setLoading(false);
        return;
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error || 'Delete failed. Please try again.');
        setLoading(false);
        return;
      }
      onDeleted();
    } catch {
      setErr('Network error. Please try again.');
      setLoading(false);
    }
  }

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 overlay-in"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal
          className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 w-full max-w-modal-sm modal-in"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
              <Trash2 size={18} className="text-red-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">Delete project</h2>
              <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                Permanently deletes <span className="font-semibold text-slate-700">{projectName}</span> and
                all its tasks.
              </p>
            </div>
          </div>
          <p className="text-xs text-slate-500 mb-3">Enter your password to confirm:</p>
          <input
            ref={inputRef}
            type="password"
            className="input w-full mb-1"
            placeholder="Your password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setErr('');
            }}
            onKeyDown={(e) => e.key === 'Enter' && confirm()}
            autoComplete="current-password"
          />
          {err && <p className="text-xs text-red-600 mb-3">{err}</p>}
          {!err && <div className="mb-3" />}
          <div className="flex gap-2 justify-end">
            <button className="btn-ghost text-sm" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              onClick={confirm}
              disabled={loading || !password.trim()}
            >
              {loading ? 'Deleting…' : 'Delete permanently'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

/* ── Main page ────────────────────────────────────────────────────────────── */
interface ProjectDetailClientProps {
  initialProject?: any;
  initialMe?: { id: string; name: string; email: string; role: string } | null;
}

export default function ProjectDetailClient(props: ProjectDetailClientProps) {
  const { initialProject = null, initialMe = null } = props;
  const { id } = useParams<{ id: string }>();
  const isLead = useIsLead();
  const isAdmin = useIsAdmin();
  // Seed from the server-rendered payload so real content paints on first
  // byte. The client still refetches on mount to stay live; SSR is the fast
  // first paint, the client fetch is the freshness pass.
  const [project, setProject] = useState<any>(initialProject);
  const projectRef = useRef(project);
  projectRef.current = project;
  const [me, setMe] = useState<any>(initialMe);
  const [view, setView] = useState<'phases' | 'board'>('phases');
  // Finished phases start collapsed so open work leads the page.
  const [collapsedPhases, setCollapsedPhases] = useState<Record<string, boolean>>({});
  const collapsedSeededFor = useRef<string | null>(null);
  // The owner of a personal project may fully manage it even as an IC — that
  // is the whole point of a private workspace. Everywhere we'd gate on isLead
  // for task management, we gate on canManage instead.
  const canManage = isLead || !!(project?.isPersonal && me && project?.ownerId === me.id);
  // Only the project owner (the person who created/owns the project) may edit
  // the title, description, due date, and reference number.
  const isOwner = !!(me && project && String(project.ownerId) === String(me.id));
  // Destructive actions (deleting tasks/phases) are owner-only — leads may
  // manage work but not destroy it. Admins keep the ability because they can
  // already delete the entire project.
  const canDelete = isOwner || isAdmin;
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [blockCompleteOpen, setBlockComplete] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  // Bird's-eye view modal — shows this project's tasks as a tree (project
  // scope, single-column layout, no team level).
  // The status the user picked that's awaiting an e-signature (password +
  // reason). Null when no sign-off is in flight.
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  // Toggles the inline due-date editor (owner only).
  const [editingDue, setEditingDue] = useState(false);
  const [savingDue, setSavingDue] = useState(false);
  const [pendingTaskIds, setPendingTaskIds] = useState<Set<string>>(new Set());
  const { showToast, ToastEl } = useToast();
  const [showBirdEye, setShowBirdEye] = useState(false);
  // Headless bird's-eye export — the Export menu downloads the map (SVG/PNG)
  // directly instead of opening the interactive view.
  const [birdEyeExport, setBirdEyeExport] = useState<'svg' | 'png' | null>(null);
  // Inline ccNo editor (owner only)
  const [editingCcNo, setEditingCcNo] = useState(false);
  const [ccNoDraft, setCcNoDraft] = useState('');
  // What the reference IS for this project ("CC#", "SOP#", "CAPA#", …) —
  // user-pickable because not every project is a Change Control.
  const [refLabelDraft, setRefLabelDraft] = useState('');
  // Hover-to-edit title and description (owner only)
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [savingDesc, setSavingDesc] = useState(false);
  // Milestone ack — phase sparkle or full project confetti when work is truly done.
  const [celebration, setCelebration] = useState<{
    title: string;
    subtitle?: string;
    level?: CelebrationLevel;
  } | null>(null);
  // Per-task mini-ack (bottom-right). Distinct from phase/project milestone.
  const [taskPop, setTaskPop] = useState<any | null>(null);

  async function load() {
    try {
      // The assignee picker (UserPicker) fetches its own paginated roster
      // scoped to the project's team, so we only need the project here.
      const p = await api<any>(`/projects/${id}`);
      setProject(p);
      setLoadErr(null);
    } catch (e: any) {
      // Offline / blip: keep optimistic board paint. Only hard-fail empty.
      if (!projectRef.current) {
        setLoadErr(e?.message || 'Could not load this project.');
      }
    }
  }

  // Realtime: refresh on focus and on app-wide change events. No background
  // interval here — a refetch mid-drag would yank the kanban board; focus and
  // explicit change events are the safe moments to re-sync.
  useLiveRefresh(load, { intervalMs: 0 }); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // The route is server-seeded with the project and current user. Avoid a
    // duplicate hydration fetch; only fall back to the API if a client-side
    // transition ever mounts without those props. Mutations still call load().
    if (!project) load();
    if (!me)
      api<any>('/auth/me')
        .then((d) => setMe(d.user))
        .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Seed collapsed state once per project: complete phases start closed.
  useEffect(() => {
    if (!project?.id) return;
    if (collapsedSeededFor.current === project.id) return;
    collapsedSeededFor.current = project.id;
    const phasesList = project.phases || [];
    const taskList = project.tasks || [];
    const next: Record<string, boolean> = {};
    for (const ph of phasesList) {
      const pid = ph.id || String(ph._id);
      const ts = taskList.filter((t: any) => (t.phaseId || null) === pid);
      if (ts.length > 0 && ts.every((t: any) => t.status === 'done')) next[pid] = true;
    }
    setCollapsedPhases(next);
  }, [project?.id, project?.phases, project?.tasks]);

  if (loadErr) {
    return (
      <div className="max-w-md mx-auto mt-12 card p-6 text-center page-enter">
        <div className="w-10 h-10 rounded-full bg-red-50 border border-red-100 flex items-center justify-center mx-auto mb-3">
          <span className="text-red-600 text-lg">!</span>
        </div>
        <div className="text-sm font-bold text-slate-800 mb-1">We couldn&rsquo;t load this project</div>
        <div className="text-xs text-slate-500 mb-4">{loadErr}</div>
        <button
          onClick={() => {
            setLoadErr(null);
            load();
          }}
          className="btn-primary text-xs justify-center"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="space-y-6 page-enter" aria-busy>
        <div className="space-y-2">
          <div className="skeleton h-3 w-24" />
          <div className="skeleton h-7 w-80 max-w-full" />
          <div className="flex gap-2 mt-2">
            {[20, 16, 24].map((w) => (
              <div key={w} className={`skeleton h-5 w-${w} rounded-full`} />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card p-4 space-y-2">
              <div className="skeleton h-3 w-20" />
              <div className="skeleton h-7 w-12" />
            </div>
          ))}
        </div>
        <div className="flex gap-3 overflow-x-auto pb-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="shrink-0 rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-2"
              style={{ width: 230 }}
            >
              <div className="skeleton h-3 w-20" />
              <div className="skeleton h-16 w-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Defensive: PATCH responses don't echo tasks/phases, so a partial
  // refresh could leave these undefined. Default to empty arrays so we
  // never crash the whole page on a partial payload.
  const tasks: any[] = Array.isArray((project as any).tasks) ? (project as any).tasks : [];
  const phases: any[] = Array.isArray((project as any).phases) ? (project as any).phases : [];

  // The bird's-eye tree — built once from data already on the page, shared by
  // the interactive view and the headless Export-menu download (SVG/PNG).
  const birdEyeData = {
    rootLabel: project.name,
    rootSubLabel: `${project.code || 'Project'} · ${tasks.length} task${tasks.length === 1 ? '' : 's'}`,
    scope: 'project' as const,
    teams: [] as { id: string; name: string; ownerName?: string | null }[],
    projects: [
      {
        id: project.id,
        code: project.code,
        name: project.name,
        teamId: null,
        health: 'healthy' as const,
        taskCount: tasks.length,
        tasksDone: tasks.filter((t: any) => t.status === 'done').length,
        dueDate: project.dueDate || null,
        ownerName: project.ownerName || null,
      },
    ],
    tasks: tasks.map((t: any) => ({
      id: t.id,
      title: t.title,
      projectId: project.id,
      status: t.status,
      assigneeName: t.assigneeName ?? null,
      dueDate: (t.ccTcd || t.dueDate) ?? null,
      phaseName: phases.find((ph: any) => ph.id === (t.phaseId || null))?.name ?? null,
      position: t.position ?? Number.MAX_SAFE_INTEGER,
      phasePosition:
        phases.find((ph: any) => ph.id === (t.phaseId || null))?.position ?? Number.MAX_SAFE_INTEGER,
      subtaskCount: t.subtaskCount,
      subtasksDone: t.subtasksDone,
      subtaskTitles: (t.subtaskTitles || []).slice(0, 5),
    })),
  };

  // Priority-weighted progress — a critical task done moves the bar more
  // than a low one. See src/lib/progress.ts.
  const pct = weightedProgress(tasks);
  const waitingCount = tasks.filter((t: any) => t.pendingWith && t.status !== 'done').length;
  const blockedCount = tasks.filter((t: any) => t.status === 'blocked').length;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdue = tasks.filter(
    (t: any) => t.dueDate && new Date(t.dueDate) < today && t.status !== 'done',
  ).length;
  const openTaskCount = tasks.filter((t: any) => t.status !== 'done').length;

  async function updateStatus(newStatus: string) {
    if (newStatus === 'completed' && openTaskCount > 0) {
      setBlockComplete(true);
      return;
    }
    // Shared project status is an audited change — re-auth + reason via
    // sign-off modal. Personal projects patch directly.
    if (!project.isPersonal) {
      setPendingStatus(newStatus);
      return;
    }
    setSavingStatus(true);
    try {
      await api(`/projects/${id}`, { method: 'PATCH', body: { status: newStatus } });
      if (newStatus === 'completed') {
        playVictory();
        setCelebration({
          title: 'Project complete',
          subtitle: `${project.name} — all work closed.`,
          level: 'project',
        });
      } else {
        showToast('Project status updated');
      }
      load();
    } catch (e: any) {
      showToast(e.message || 'Failed to update status', 'err');
    } finally {
      setSavingStatus(false);
    }
  }

  // Commits a status change once the user has re-entered their password and a
  // reason in the sign-off modal. The server re-verifies the password and writes
  // the reason into the immutable audit trail.
  async function confirmStatusChange(password: string, remarks: string) {
    if (!pendingStatus) return;
    const becameComplete = pendingStatus === 'completed';
    await api(`/projects/${id}`, { method: 'PATCH', body: { status: pendingStatus, password, remarks } });
    setPendingStatus(null);
    if (becameComplete) {
      playVictory();
      setCelebration({
        title: 'Project complete',
        subtitle: `${project.name} — all work closed.`,
        level: 'project',
      });
    } else {
      showToast('Project status updated');
    }
    load();
  }

  // Leads can re-schedule the whole project from the header. A null value
  // clears the due date. Optimistic toast + refetch keeps the stat cards in
  // sync (Overdue recomputes off the new date).
  async function saveDueDate(value: string | null) {
    setSavingDue(true);
    try {
      await api(`/projects/${id}`, { method: 'PATCH', body: { dueDate: value } });
      setEditingDue(false);
      showToast('Due date updated');
      load();
    } catch (e: any) {
      showToast(e.message || 'Failed to update due date', 'err');
    } finally {
      setSavingDue(false);
    }
  }

  async function saveCcNo(value: string, label?: string) {
    const refName = (label ?? project?.refLabel) || 'Reference number';
    try {
      const body: any = { ccNo: value.trim() };
      if (label !== undefined) body.refLabel = label.trim();
      await api(`/projects/${id}`, { method: 'PATCH', body });
      setEditingCcNo(false);
      showToast(`${refName} updated`);
      load();
    } catch (e: any) {
      showToast(e.message || `Failed to update ${refName}`, 'err');
    }
  }

  async function deletePhase(phaseId: string, phaseName: string) {
    if (
      !confirm(`Delete phase "${phaseName}"? Its tasks are kept and move to Unphased. This cannot be undone.`)
    )
      return;
    try {
      await api(`/projects/${id}/phases/${phaseId}`, { method: 'DELETE' });
      showToast('Phase deleted — its tasks moved to Unphased');
      load();
    } catch (e: any) {
      showToast(e.message || 'Delete failed', 'err');
    }
  }

  async function saveTitle(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      setEditingTitle(false);
      return;
    }
    setSavingTitle(true);
    try {
      await api(`/projects/${id}`, { method: 'PATCH', body: { name: trimmed } });
      setEditingTitle(false);
      showToast('Project name updated');
      load();
    } catch (e: any) {
      showToast(e.message || 'Failed to update name', 'err');
    } finally {
      setSavingTitle(false);
    }
  }

  async function saveDesc(value: string) {
    setSavingDesc(true);
    try {
      await api(`/projects/${id}`, { method: 'PATCH', body: { description: value.trim() } });
      setEditingDesc(false);
      showToast('Description updated');
      load();
    } catch (e: any) {
      showToast(e.message || 'Failed to update description', 'err');
    } finally {
      setSavingDesc(false);
    }
  }

  // After a task is completed, decide whether that finished a phase or the whole
  // project — the genuine milestones worth a celebration. Projects the just-done
  // task onto the current list so the check is correct even before `load()`.
  // Returns true when a milestone celebration was triggered (so the caller can
  // skip the routine completion chime and let the fanfare carry the moment).
  function celebrateIfMilestone(taskId: string): boolean {
    // System recurring boards never "complete" as a project — perpetual cadence.
    if (project?.isSystem) return false;
    const projected = tasks.map((t: any) => (t.id === taskId ? { ...t, status: 'done' } : t));
    const done = (t: any) => t.status === 'done';
    if (projected.length > 0 && projected.every(done)) {
      playVictory();
      setCelebration({
        title: 'Project clear',
        subtitle: project?.name || 'Every task closed.',
        level: 'project',
      });
      return true;
    }
    const task = projected.find((t: any) => t.id === taskId);
    const pid = task?.phaseId || null;
    if (!pid) return false;
    const phaseTasks = projected.filter((t: any) => (t.phaseId || null) === pid);
    if (phaseTasks.length > 0 && phaseTasks.every(done)) {
      const phaseName = phases.find((p: any) => p.id === pid)?.name;
      playFanfare();
      setCelebration({
        title: 'Phase clear',
        subtitle: phaseName || 'Phase closed.',
        level: 'phase',
      });
      return true;
    }
    return false;
  }

  /** Ask for the bottleneck when marking blocked — no anonymous blockers. */
  function askBlocker(existing?: string | null): string | null {
    const have = String(existing || '').trim();
    if (have) return have;
    if (typeof window === 'undefined') return null;
    const who = window.prompt('Blocked — who or what is waiting? (person, team, part, decision)');
    const t = who?.trim().slice(0, 120) || '';
    return t || null;
  }

  /** Critical path: if this slips, the project end slips. */
  async function toggleCriticalPath(taskId: string, next: boolean) {
    if (!canManage) return;
    setProject((p: any) => ({
      ...p,
      tasks: (p.tasks || []).map((t: any) => (t.id === taskId ? { ...t, onCriticalPath: next } : t)),
    }));
    try {
      await api(`/tasks/${taskId}`, { method: 'PATCH', body: { onCriticalPath: next } });
    } catch (e: any) {
      showToast(e.message || 'Could not update critical path', 'err');
      load();
    }
  }

  const criticalOpen = orderCriticalPathOpen(tasks);
  const taskTitleById = new Map(tasks.map((t: any) => [t.id, t.title as string]));

  // Kanban drop: persist a status change (if any) and the new column order.
  async function dropReorder(taskId: string, toStatus: string, orderedIds: string[]) {
    const cur = tasks.find((t: any) => t.id === taskId);
    const statusChanged = !!cur && cur.status !== toStatus;
    const wasNotDone = cur?.status !== 'done';
    let pendingWith: string | undefined;
    if (statusChanged && toStatus === 'blocked') {
      const who = askBlocker(cur?.pendingWith);
      if (!who) {
        showToast('Name the blocker before marking blocked.', 'err');
        load();
        return;
      }
      pendingWith = who;
    }
    setPendingTaskIds((s) => new Set([...s, taskId]));
    try {
      let queued = false;
      if (statusChanged) {
        const body: any = { status: toStatus };
        if (pendingWith !== undefined) body.pendingWith = pendingWith;
        const res = await api<any>(`/tasks/${taskId}`, { method: 'PATCH', body });
        queued = !!res?.queued;
      }
      // Persisting column order is a lead/admin action; an IC dragging their
      // own card still gets the status change, just not a saved reorder.
      // Skip reorder while offline — status is the floor-critical write.
      if (isLead && !queued) {
        await api(`/projects/${id}/reorder-tasks`, { method: 'POST', body: { orderedIds } });
      }
      if (toStatus === 'done' && wasNotDone) {
        if (!celebrateIfMilestone(taskId)) {
          chimeIfEnabled();
          if (cur) setTaskPop(cur);
        }
        // Milestone sound/haptic owned by celebrateIfMilestone + Celebration.
      }
      // Optimistic state is already applied by KanbanBoard; reconcile when online.
      if (!queued) load();
    } catch (e: any) {
      showToast(e.message || 'Failed to update task', 'err');
      load(); // revert optimistic
    } finally {
      setPendingTaskIds((s) => {
        const n = new Set(s);
        n.delete(taskId);
        return n;
      });
    }
  }

  async function moveTaskFromPhase(taskId: string, status: string) {
    const cur = tasks.find((t: any) => t.id === taskId);
    const wasNotDone = cur?.status !== 'done';
    let pendingWith: string | undefined;
    if (status === 'blocked' && cur?.status !== 'blocked') {
      const who = askBlocker(cur?.pendingWith);
      if (!who) {
        showToast('Name the blocker before marking blocked.', 'err');
        return;
      }
      pendingWith = who;
    }
    // Optimistic local update
    setProject((p: any) => ({
      ...p,
      tasks: p.tasks.map((t: any) =>
        t.id === taskId
          ? { ...t, status, ...(pendingWith !== undefined ? { pendingWith } : {}) }
          : t,
      ),
    }));
    setPendingTaskIds((s) => new Set([...s, taskId]));
    try {
      const body: any = { status };
      if (pendingWith !== undefined) body.pendingWith = pendingWith;
      const res = await api<any>(`/tasks/${taskId}`, { method: 'PATCH', body });
      if (status === 'done' && wasNotDone) {
        if (!celebrateIfMilestone(taskId)) {
          chimeIfEnabled();
          if (cur) setTaskPop(cur);
        }
      }
      if (res?.queued) {
        setPendingTaskIds((s) => {
          const n = new Set(s);
          n.delete(taskId);
          return n;
        });
        return;
      }
    } catch (e: any) {
      showToast(e.message || 'Failed to update task', 'err');
      load(); // revert
    } finally {
      setPendingTaskIds((s) => {
        const n = new Set(s);
        n.delete(taskId);
        return n;
      });
    }
  }

  // Move a task up/down within its phase. Computes the phase's new order
  // and persists it (position = index) via the reorder endpoint.
  async function reorderInPhase(phaseId: string | null, taskId: string, dir: -1 | 1) {
    const phaseTasks = tasks
      .filter((t: any) => (t.phaseId || null) === (phaseId || null))
      .slice()
      .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));
    const idx = phaseTasks.findIndex((t: any) => t.id === taskId);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= phaseTasks.length) return;
    [phaseTasks[idx], phaseTasks[swap]] = [phaseTasks[swap], phaseTasks[idx]];
    const orderedIds = phaseTasks.map((t: any) => t.id);
    // Optimistic: reflect the new positions locally right away.
    setProject((p: any) => ({
      ...p,
      tasks: (p.tasks || []).map((t: any) =>
        orderedIds.includes(t.id) ? { ...t, position: orderedIds.indexOf(t.id) } : t,
      ),
    }));
    try {
      await api(`/projects/${id}/reorder-tasks`, { method: 'POST', body: { orderedIds } });
    } catch (e: any) {
      showToast(e.message || 'Could not reorder', 'err');
      load();
    }
  }

  async function deleteTask(taskId: string) {
    if (!confirm('Delete this task permanently? This cannot be undone.')) return;
    try {
      await api(`/tasks/${taskId}`, { method: 'DELETE' });
      notifyCalendarChange();
      showToast('Task deleted');
      load();
    } catch (e: any) {
      showToast(e.message || 'Delete failed', 'err');
    }
  }

  // Horowitz's wartime test: a project in trouble must LOOK like it, or the
  // tool is lying by omission. "War footing" = a meaningful share of the open
  // work has already slipped (and there's enough of it to matter).
  const warFooting =
    !project.isPersonal &&
    project.status !== 'completed' &&
    project.status !== 'cancelled' &&
    openTaskCount >= 3 &&
    overdue / openTaskCount >= 0.34;

  // Jensen: exceptions first. Overdue open tasks, sorted by how late they are.
  const overdueTasks = (() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return tasks
      .filter((t: any) => t.status !== 'done' && t.dueDate && new Date(t.dueDate) < start)
      .slice()
      .sort(
        (a: any, b: any) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
      );
  })();

  const blockedTasks = tasks
    .filter((t: any) => t.status === 'blocked')
    .slice()
    .sort((a: any, b: any) => {
      const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return da - db;
    });

  // Single next action on this project — soonest overdue, else blocked, else next due.
  const doThisFirst = (() => {
    if (overdueTasks[0]) return { task: overdueTasks[0], why: 'overdue' as const };
    if (blockedTasks[0]) return { task: blockedTasks[0], why: 'blocked' as const };
    const open = tasks
      .filter((t: any) => t.status !== 'done')
      .slice()
      .sort((a: any, b: any) => {
        const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        return da - db;
      });
    if (open[0]) return { task: open[0], why: 'next' as const };
    return null;
  })();

  // Open work before done within a phase; among open, overdue first.
  function sortTasksForPhase(ts: any[]) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const late = (t: any) =>
      t.status !== 'done' && t.dueDate && new Date(t.dueDate) < start ? 0 : 1;
    const done = (t: any) => (t.status === 'done' ? 1 : 0);
    return ts
      .slice()
      .sort((a, b) => {
        if (done(a) !== done(b)) return done(a) - done(b);
        if (late(a) !== late(b)) return late(a) - late(b);
        return (a.position ?? 0) - (b.position ?? 0);
      });
  }

  return (
    <div className="space-y-4 page-enter">
      {ToastEl}
      {warFooting && (
        <div
          className="rounded-xl border border-red-200 dark:border-red-500/25 bg-red-50 dark:bg-red-500/10 px-4 py-3 flex items-start gap-3"
          role="alert"
        >
          <AlertTriangle size={18} className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold text-red-800 dark:text-red-300">
              {overdue} of {openTaskCount} open tasks are overdue
            </div>
            <div className="text-[12px] text-red-700/80 dark:text-red-300/70 mt-0.5">
              Clear the overdue first. Everything else waits.
            </div>
          </div>
          {overdueTasks.length > 0 && (
            <a
              href="#project-overdue"
              className="shrink-0 text-[11px] font-bold text-red-700 dark:text-red-300 underline underline-offset-2 hover:text-red-900"
            >
              Jump to list
            </a>
          )}
        </div>
      )}
      {project.isSystem && (
        <div className="rounded-xl border border-teal-200/80 dark:border-teal-500/25 bg-teal-50/80 dark:bg-teal-500/[0.08] px-4 py-3 flex items-start gap-3">
          <RefreshCw size={16} className="text-teal-700 dark:text-teal-400 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold text-teal-900 dark:text-teal-200">
              Recurring activities board
            </div>
            <div className="text-[12px] text-teal-800/80 dark:text-teal-300/70 mt-0.5 leading-relaxed">
              Occurrences land here as tasks. Manage the schedule on the team’s Recurring tab —
              close a task when the work is done.
            </div>
          </div>
          {project.teamId && (
            <Link
              href={`/teams/${project.teamId}?view=recurring`}
              className="shrink-0 text-[11px] font-bold text-teal-800 dark:text-teal-300 underline underline-offset-2"
            >
              Open schedule
            </Link>
          )}
        </div>
      )}
      {/* Critical path — the ordered constraints that define ship. */}
      {!project.isSystem && criticalOpen.length > 0 && (
        <div className="rounded-xl border border-violet-200/90 dark:border-violet-500/30 bg-violet-50/70 dark:bg-violet-500/[0.08] px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <Route size={15} className="text-violet-700 dark:text-violet-300 shrink-0" />
            <div className="text-[12px] font-bold uppercase tracking-wider text-violet-800 dark:text-violet-300">
              Critical path
            </div>
            <span className="text-[11px] font-bold tabular-nums text-violet-600/80 dark:text-violet-300/70">
              {criticalOpen.length} open
            </span>
          </div>
          <ol className="space-y-1.5">
            {criticalOpen.map((t: any, i: number) => {
              const late =
                t.dueDate &&
                t.status !== 'done' &&
                new Date(t.dueDate) < new Date(new Date().setHours(0, 0, 0, 0));
              const waitsOn = t.blockedByTaskId ? taskTitleById.get(t.blockedByTaskId) : null;
              return (
                <li key={t.id} className="flex items-center gap-2 min-w-0 text-[13px]">
                  <span className="text-[10px] font-black tabular-nums text-violet-500/80 w-4 shrink-0">
                    {i + 1}
                  </span>
                  <TaskLink
                    task={t}
                    className="font-semibold text-slate-800 dark:text-white/85 hover:text-violet-700 dark:hover:text-violet-300 truncate min-w-0"
                  />
                  {waitsOn && (
                    <span
                      className="text-[10px] text-violet-600/80 dark:text-violet-300/70 truncate max-w-[8rem] shrink-0"
                      title={`After: ${waitsOn}`}
                    >
                      ← {waitsOn}
                    </span>
                  )}
                  {t.status === 'blocked' && (
                    <span className="text-[10px] font-bold text-red-600 shrink-0">blocked</span>
                  )}
                  {late && <span className="text-[10px] font-bold text-red-600 shrink-0">overdue</span>}
                  {t.assigneeName && (
                    <span className="text-[11px] text-slate-400 dark:text-white/35 truncate shrink-0 max-w-[7rem]">
                      {t.assigneeName}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}
      {!project.isSystem && canManage && criticalOpen.length === 0 && openTaskCount > 0 && (
        <div className="rounded-xl border border-dashed border-slate-200 dark:border-white/10 px-4 py-2.5 text-[12px] text-slate-500 dark:text-white/40">
          <span className="font-semibold text-slate-600 dark:text-white/55">No critical path yet.</span>{' '}
          Mark tasks that gate ship — use the path icon on a task row, or toggle on task detail.
        </div>
      )}
      {celebration && (
        <Celebration
          title={celebration.title}
          subtitle={celebration.subtitle}
          level={celebration.level || 'phase'}
          onDone={() => setCelebration(null)}
        />
      )}
      <TaskCompletePop task={taskPop} onDone={() => setTaskPop(null)} />

      {/* Header — stacks vertically on mobile (title block → meta → actions),
          flows horizontally with the meta/actions pinned right on md+. The old
          flex-wrap layout was forcing the project name to wrap one word per
          line on a phone because the right column refused to wrap below it. */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 md:gap-6">
        {/* Left — identity, description, then status directly below it */}
        <div className="min-w-0 md:flex-1">
          {/* Personal projects carry no shared reference — just mark them private. */}
          {project.isPersonal && (
            <div className="text-[11px] text-slate-400 font-mono break-all">Personal</div>
          )}
          {project.isPersonal && (
            <p className="text-[11.5px] text-violet-500/90 dark:text-violet-300/70 mt-0.5">
              <Lock size={10} className="inline -mt-0.5 mr-1" />
              Private{pct > 0 ? ` · ${pct}%` : ''}
            </p>
          )}
          {/* Reference number — a single identity line. The system assigns one
              when the project is created; the owner retitles it by tapping
              directly on the number. Whatever is set here is THE reference shown
              everywhere (list, dashboard, email, calendar), in real time — so we
              render exactly one element, never the system code beside it. */}
          {!project.isPersonal &&
            (editingCcNo ? (
              <div className="flex items-center gap-1 mt-0.5">
                {/* The reference SCHEME is user-pickable per project — a project
                    may be tracked by a CC#, an SOP#, a CAPA#, … */}
                <datalist id="reflabel-suggestions">
                  {['CC#', 'SOP#', 'CAPA#', 'DEV#', 'INC#', 'DOC#', 'Ref #'].map((v) => (
                    <option key={v} value={v} />
                  ))}
                </datalist>
                <input
                  type="text"
                  list="reflabel-suggestions"
                  value={refLabelDraft}
                  onChange={(e) => setRefLabelDraft(e.target.value)}
                  maxLength={20}
                  placeholder="Ref #"
                  aria-label="Reference type"
                  title="What this reference is — e.g. CC#, SOP#, CAPA#"
                  className="text-[11px] font-mono text-slate-500 border-b border-blue-400 outline-none bg-transparent px-0.5 w-16"
                />
                {/* datalist for autocomplete from existing task ccNos */}
                <datalist id="ccno-suggestions">
                  {Array.from(new Set(tasks.map((t: any) => t.ccNo).filter(Boolean))).map((v: any) => (
                    <option key={v} value={v} />
                  ))}
                </datalist>
                <input
                  type="text"
                  list="ccno-suggestions"
                  value={ccNoDraft}
                  onChange={(e) => setCcNoDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      saveCcNo(ccNoDraft, refLabelDraft);
                    }
                    if (e.key === 'Escape') {
                      setEditingCcNo(false);
                    }
                  }}
                  autoFocus
                  maxLength={60}
                  placeholder="e.g. CC-2025-042"
                  className="text-[11px] font-mono text-slate-700 border-b border-blue-400 outline-none bg-transparent px-0.5 w-44"
                />
                <button
                  onClick={() => saveCcNo(ccNoDraft, refLabelDraft)}
                  className="text-blue-500 hover:text-blue-700 ml-1"
                  title="Save"
                >
                  <CheckCircle2 size={12} />
                </button>
                <button
                  onClick={() => setEditingCcNo(false)}
                  className="text-slate-300 hover:text-slate-500 ml-0.5"
                  title="Cancel"
                >
                  <X size={11} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={!isOwner}
                onClick={
                  isOwner
                    ? () => {
                        setCcNoDraft(project.ccNo || project.code || '');
                        setRefLabelDraft(project.refLabel || '');
                        setEditingCcNo(true);
                      }
                    : undefined
                }
                title={isOwner ? 'Tap to set this project’s reference number' : undefined}
                className={`group/ref inline-flex items-center gap-1.5 mt-0.5 text-[11px] font-mono break-all text-left ${
                  isOwner ? 'cursor-pointer hover:text-slate-800' : 'cursor-default'
                } text-slate-500`}
              >
                {project.refLabel && <span className="text-slate-400">{project.refLabel}</span>}
                <span className="text-slate-600">{project.ccNo || project.code || '—'}</span>
                {isOwner && (
                  <Pencil
                    size={11}
                    className="opacity-0 group-hover/ref:opacity-50 transition-opacity text-slate-400 shrink-0"
                  />
                )}
              </button>
            ))}
          {/* Title — owner sees a hover-to-edit affordance; everyone else sees plain text */}
          {editingTitle ? (
            <input
              autoFocus
              className="text-xl sm:text-2xl font-bold mt-0.5 leading-tight border-b-2 border-blue-400 outline-none bg-transparent w-full max-w-xl"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  saveTitle(titleDraft);
                }
                if (e.key === 'Escape') {
                  setEditingTitle(false);
                }
              }}
              onBlur={() => saveTitle(titleDraft)}
              disabled={savingTitle}
              maxLength={120}
            />
          ) : (
            <div
              className={`group/title flex items-center gap-1.5 mt-0.5 ${isOwner ? 'cursor-text' : ''}`}
              onClick={
                isOwner
                  ? () => {
                      setTitleDraft(project.name || '');
                      setEditingTitle(true);
                    }
                  : undefined
              }
            >
              <h1 className="text-xl sm:text-2xl font-bold leading-tight break-words">{project.name}</h1>
              {isOwner && (
                <Pencil
                  size={13}
                  className="opacity-0 group-hover/title:opacity-40 transition-opacity text-slate-500 shrink-0 mt-0.5"
                />
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {project.isPersonal && (
              <span className="tag border border-violet-200 bg-violet-50 text-violet-700 font-semibold inline-flex items-center gap-1.5">
                <Lock size={11} /> Private
              </span>
            )}
            {project.isSystem && (
              <span className="tag border border-teal-200 bg-teal-50 text-teal-800 font-semibold inline-flex items-center gap-1.5 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-300">
                <RefreshCw size={11} /> Recurring
              </span>
            )}
            {project.archived && (
              <span
                className="tag border border-amber-200 bg-amber-50 text-amber-800 font-semibold inline-flex items-center gap-1.5"
                title={project.archivedAt ? `Archived ${formatDateTime(project.archivedAt)}` : 'Archived'}
              >
                <Archive size={11} /> Archived
              </span>
            )}
            {!project.isPersonal && !project.isSystem && <LifecycleTag lifecycle={project.lifecycle} />}
            {!project.isSystem && <PriorityTag priority={project.priority} />}

          </div>
          {/* Description — owner can hover to reveal edit affordance, click to edit inline */}
          {editingDesc ? (
            <div className="mt-2 max-w-3xl">
              <textarea
                autoFocus
                rows={3}
                className="w-full text-sm text-slate-700 border border-blue-300 rounded-lg p-2 outline-none resize-none bg-white"
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setEditingDesc(false);
                  if (e.key === 'Enter' && e.metaKey) saveDesc(descDraft);
                }}
                onBlur={() => saveDesc(descDraft)}
                disabled={savingDesc}
                maxLength={1000}
                placeholder="Add a project description…"
              />
              <div className="text-[10px] text-slate-400 mt-0.5">⌘↵ to save · Esc to cancel</div>
            </div>
          ) : (
            <div
              className={`group/desc mt-2 ${isOwner ? 'cursor-text' : ''}`}
              onClick={
                isOwner
                  ? () => {
                      setDescDraft(project.description || '');
                      setEditingDesc(true);
                    }
                  : undefined
              }
            >
              {project.description ? (
                <div className="flex items-start gap-1.5">
                  <p className="text-sm text-slate-600 max-w-3xl line-clamp-2">{project.description}</p>
                  {isOwner && (
                    <Pencil
                      size={12}
                      className="opacity-0 group-hover/desc:opacity-40 transition-opacity text-slate-400 shrink-0 mt-1"
                    />
                  )}
                </div>
              ) : isOwner ? (
                <span className="text-sm text-slate-300 italic hover:text-slate-400 transition-colors">
                  Add a description…
                </span>
              ) : null}
            </div>
          )}

          {/* Status — directly under the description */}
          <div className="flex items-center flex-wrap gap-2 mt-3">
            {isLead ? (
              <StatusPillRow
                value={project.status}
                onChange={updateStatus}
                options={PROJECT_STATUS_OPTIONS.filter((s) => s !== 'planning') as unknown as string[]}
                pending={savingStatus}
                collapsible
              />
            ) : (
              <span className="text-xs font-semibold px-2 py-1 rounded-md bg-slate-100 text-slate-600 capitalize">
                {String(project.status || '').replace(/_/g, ' ')}
              </span>
            )}
            {openTaskCount > 0 && (
              <span className="text-[10px] text-amber-600 font-semibold">{openTaskCount} open</span>
            )}
          </div>
        </div>

        {/* Right — owner / team / due, then actions. On mobile this becomes a
            left-aligned strip below the title; on md+ it pins top-right. */}
        <div className="flex flex-col md:items-end gap-3 shrink-0">
          <div className="text-xs text-slate-500 md:text-right space-y-0.5">
            <div>
              Project owner: <span className="font-medium text-slate-700">{project.ownerName || '—'}</span>
            </div>
            <div>
              Team:{' '}
              {project.teamId ? (
                <Link href={`/teams/${project.teamId}`} className="text-blue-600 hover:underline">
                  {project.teamName || '—'}
                </Link>
              ) : (
                '—'
              )}
            </div>
            {/* Due date — only the project owner can re-schedule inline. */}
            {isOwner ? (
              editingDue ? (
                <div
                  className="flex items-center md:justify-end gap-1.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span>Due:</span>
                  <DatePicker
                    value={project.dueDate ? String(project.dueDate).slice(0, 10) : ''}
                    onChange={(v) => saveDueDate(v || null)}
                    placeholder="Set due date"
                    size="sm"
                  />
                  <button
                    onClick={() => setEditingDue(false)}
                    className="text-slate-400 hover:text-slate-600"
                    title="Cancel"
                  >
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setEditingDue(true)}
                  disabled={savingDue}
                  className="inline-flex items-center gap-1 hover:text-blue-600 transition-colors group"
                  title="Change due date"
                >
                  Due:{' '}
                  <span className="font-medium text-slate-700 group-hover:text-blue-600">
                    {formatDate(project.dueDate)}
                  </span>
                  <Pencil size={11} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              )
            ) : (
              <div>Due: {formatDate(project.dueDate)}</div>
            )}
          </div>

          {/* Actions — Export (PDF/CSV/HTML) for everyone; Archive + Delete
              admin-only. */}
          <div className="flex flex-wrap items-center md:justify-end gap-2">
            {BIRDS_EYE_ENABLED && (
              <BirdEyeButton scopeKey={`project:${id}`} onClick={() => setShowBirdEye(true)} />
            )}
            <ExportMenu
              onExcel={
                project.isPersonal
                  ? undefined
                  : () => {
                      window.location.href = `/api/projects/${project.id}/export`;
                    }
              }
              onPdf={() => printProjectReport(project, phases, me?.name || me?.email || '')}
              onCsv={() => downloadProjectCsv(project, phases, me?.name || me?.email || '')}
              onBirdEyeSvg={BIRDS_EYE_ENABLED ? () => setBirdEyeExport('svg') : undefined}
              onBirdEyePng={BIRDS_EYE_ENABLED ? () => setBirdEyeExport('png') : undefined}
            />
            {isAdmin && !project.isPersonal && (
              <Link
                href={`/audit?targetType=project&targetId=${project.id}`}
                className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition-colors"
                title="View this project's audit trail"
              >
                <ScrollText size={13} /> Audit
              </Link>
            )}
            {isAdmin && (
              <button
                onClick={async () => {
                  const archiving = !project.archived;
                  const msg = archiving
                    ? `Archive "${project.name}"?\nIt will be hidden from the dashboard and project list, but tasks and audit history remain.`
                    : `Restore "${project.name}" from the archive?`;
                  if (!confirm(msg)) return;
                  try {
                    await api(`/projects/${project.id}/archive`, {
                      method: 'POST',
                      body: { archived: archiving },
                    });
                    showToast(archiving ? 'Project archived' : 'Project restored');
                    load();
                  } catch (e: any) {
                    showToast(e?.message || 'Could not update the archive state', 'err');
                  }
                }}
                className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition-colors ${
                  project.archived
                    ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                    : 'border-amber-200 text-amber-700 hover:bg-amber-50'
                }`}
              >
                <Archive size={13} /> {project.archived ? 'Restore' : 'Archive'}
              </button>
            )}
            {/* Delete is available to: admins, and project owners (personal or shared).
                Kept deliberately low-contrast so it's not the first thing eyes land on. */}
            {(isAdmin || isOwner) && (
              <button
                onClick={() => setDeleteOpen(true)}
                className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-red-100 text-red-400 hover:border-red-200 hover:text-red-600 hover:bg-red-50 transition-all opacity-60 hover:opacity-100"
              >
                <Trash2 size={13} /> Delete
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Pulse strip — open always; exceptions and progress when they matter. */}
      {tasks.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-slate-100 dark:bg-white/[0.06] text-[12px] font-semibold text-slate-600 dark:text-white/55">
            <span className="font-black tabular-nums text-slate-800 dark:text-white/85">{openTaskCount}</span>
            open
          </span>
          {overdue > 0 && (
            <a
              href="#project-overdue"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-red-50 dark:bg-red-500/10 text-[12px] font-semibold text-red-700 dark:text-red-400 hover:brightness-95"
            >
              <span className="font-black tabular-nums">{overdue}</span>
              overdue
            </a>
          )}
          {blockedCount > 0 && (
            <a
              href="#project-blocked"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-[12px] font-semibold text-amber-800 dark:text-amber-400 hover:brightness-95"
            >
              <span className="font-black tabular-nums">{blockedCount}</span>
              blocked
            </a>
          )}
          {waitingCount > 0 && (
            <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-violet-50 dark:bg-violet-500/10 text-[12px] font-semibold text-violet-700 dark:text-violet-400">
              <span className="font-black tabular-nums">{waitingCount}</span>
              waiting
            </span>
          )}
          {tasks.length >= 2 && (
            <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-[12px] font-semibold text-blue-700 dark:text-blue-400">
              <span className="font-black tabular-nums">{pct}%</span>
              done
            </span>
          )}
        </div>
      )}

      {/* One next action — judgment over a wall of phases. */}
      {doThisFirst && (
        <Link
          href={`/tasks/${doThisFirst.task.id}`}
          className="flex items-start gap-3 rounded-2xl border border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-[#262624] px-4 py-3.5 hover:border-blue-300/80 dark:hover:border-blue-500/30 transition-colors"
          style={{ boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}
        >
          <div className="min-w-0 flex-1">
            <div
              className={`text-[10px] font-bold uppercase tracking-[0.12em] mb-1 ${
                doThisFirst.why === 'overdue'
                  ? 'text-red-600 dark:text-red-400'
                  : doThisFirst.why === 'blocked'
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-blue-600 dark:text-blue-400'
              }`}
            >
              {doThisFirst.why === 'overdue'
                ? 'Clear first'
                : doThisFirst.why === 'blocked'
                  ? 'Unblock first'
                  : 'Do this first'}
            </div>
            <div className="text-sm font-bold text-slate-800 dark:text-white/85 leading-snug truncate">
              {doThisFirst.task.title}
            </div>
            <div className="text-[11px] text-slate-400 dark:text-white/35 mt-0.5 truncate">
              {doThisFirst.task.assigneeName || 'Unassigned'}
              {doThisFirst.task.dueDate && ` · ${formatDate(doThisFirst.task.dueDate)}`}
            </div>
          </div>
          <ArrowRight size={16} className="text-slate-300 dark:text-white/25 shrink-0 mt-1" />
        </Link>
      )}

      {/* Clear-first strip — exceptions before the full tree. */}
      {overdueTasks.length > 0 && (
        <section
          id="project-overdue"
          className="scroll-mt-4 rounded-2xl border border-red-200 dark:border-red-500/25 bg-white dark:bg-[#262624] overflow-hidden"
          style={{ boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}
        >
          <div className="px-4 py-2.5 border-b border-red-100 dark:border-red-500/15 flex items-center justify-between bg-red-50/60 dark:bg-red-500/[0.06]">
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-red-600 dark:text-red-400" />
              <h3 className="text-[12px] font-bold uppercase tracking-wider text-red-800 dark:text-red-300">
                Clear first
              </h3>
              <span className="text-[11px] font-bold text-red-600/80 dark:text-red-400/80">
                {overdueTasks.length} overdue
              </span>
            </div>
          </div>
          <ul className="divide-y divide-red-50 dark:divide-red-500/10">
            {overdueTasks.map((t: any) => {
              const dueIn = Math.floor(
                (Date.now() - new Date(t.dueDate).getTime()) / 86_400_000,
              );
              return (
                <li key={t.id}>
                  <Link
                    href={`/tasks/${t.id}`}
                    prefetch
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-red-50/50 dark:hover:bg-red-500/[0.05] transition-colors group fluid-press"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold text-slate-800 dark:text-white/85 truncate group-hover:text-red-700 dark:group-hover:text-red-300">
                        {t.title}
                      </div>
                      <div className="text-[11px] text-slate-400 dark:text-white/30 truncate mt-0.5">
                        {t.assigneeName || 'Unassigned'}
                        {t.phaseId &&
                          phases.find((p: any) => p.id === t.phaseId)?.name &&
                          ` · ${phases.find((p: any) => p.id === t.phaseId)?.name}`}
                      </div>
                    </div>
                    <span className="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-md bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300">
                      {dueIn}d late
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Blocked strip — second only to overdue. */}
      {blockedTasks.length > 0 && (
        <section
          id="project-blocked"
          className="scroll-mt-4 rounded-2xl border border-amber-200 dark:border-amber-500/25 bg-white dark:bg-[#262624] overflow-hidden"
          style={{ boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}
        >
          <div className="px-4 py-2.5 border-b border-amber-100 dark:border-amber-500/15 flex items-center gap-2 bg-amber-50/60 dark:bg-amber-500/[0.06]">
            <AlertTriangle size={14} className="text-amber-700 dark:text-amber-400" />
            <h3 className="text-[12px] font-bold uppercase tracking-wider text-amber-900 dark:text-amber-300">
              Blocked
            </h3>
            <span className="text-[11px] font-bold text-amber-700/80 dark:text-amber-400/80">
              {blockedTasks.length}
            </span>
          </div>
          <ul className="divide-y divide-amber-50 dark:divide-amber-500/10">
            {blockedTasks.slice(0, 8).map((t: any) => (
              <li key={t.id}>
                <Link
                  href={`/tasks/${t.id}`}
                  prefetch
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-amber-50/50 dark:hover:bg-amber-500/[0.05] transition-colors group"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-slate-800 dark:text-white/85 truncate group-hover:text-amber-800 dark:group-hover:text-amber-300">
                      {t.title}
                    </div>
                    <div className="text-[11px] text-slate-400 dark:text-white/30 truncate mt-0.5">
                      {t.assigneeName || 'Unassigned'}
                      {t.pendingWith ? ` · waiting on ${t.pendingWith}` : ''}
                    </div>
                  </div>
                  <ArrowRight size={14} className="text-slate-300 dark:text-white/20 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* View toggle */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div
          className="flex items-center gap-1 bg-white dark:bg-[#262624] border border-slate-200/80 dark:border-white/[0.08] rounded-xl p-1 w-fit"
          style={{ boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}
        >
          {[
            ['phases', 'By phase'],
            ['board', 'Kanban'],
          ].map(([k, l]) => (
            <button
              key={k}
              onClick={() => setView(k as any)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                view === k
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50 dark:hover:bg-white/[0.05]'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        {tasks.length === 0 && canManage && (
          <p className="text-[12px] text-slate-400 dark:text-white/35">Add a task below.</p>
        )}
      </div>

      {/* Phases view */}
      {view === 'phases' && (
        <div className="space-y-3">
          {phases.length === 0 && (
            <Card>
              <div className="py-6 px-2 text-center max-w-md mx-auto">
                <div className="text-sm font-bold text-slate-700 dark:text-white/70 mb-1">
                  {project.isSystem ? 'No open occurrences' : 'No phases'}
                </div>
                <p className="text-xs text-slate-400 dark:text-white/35 leading-relaxed">
                  {project.isSystem
                    ? 'Occurrences appear when due. Manage schedule on Teams → Recurring.'
                    : canManage
                      ? 'Use Unphased below or Kanban to add tasks.'
                      : 'No structure yet.'}
                </p>
                {project.isSystem && project.teamId && (
                  <Link
                    href={`/teams/${project.teamId}?view=recurring`}
                    className="btn-primary text-xs inline-flex mt-4"
                  >
                    Open schedule <ArrowRight size={13} />
                  </Link>
                )}
              </div>
            </Card>
          )}
          {phases.map((ph: any, i: number) => {
            const tsRaw = tasks.filter((t: any) => t.phaseId === ph.id);
            const ts = sortTasksForPhase(tsRaw);
            const done = ts.filter((t: any) => t.status === 'done').length;
            const pctP = weightedProgress(ts);
            const allDone = ts.length > 0 && done === ts.length;
            const collapsed = !!collapsedPhases[ph.id];
            return (
              <Card key={ph.id}>
                <button
                  type="button"
                  onClick={() =>
                    setCollapsedPhases((c) => ({ ...c, [ph.id]: !c[ph.id] }))
                  }
                  className="w-full flex items-center justify-between mb-1 text-left gap-2"
                >
                  <h3
                    className={`font-semibold ${allDone ? 'text-slate-400' : 'text-slate-800 dark:text-white/85'}`}
                  >
                    <span className="text-slate-400 font-mono mr-2 text-sm">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    {ph.name}
                    {allDone && (
                      <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                        Complete
                      </span>
                    )}
                  </h3>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-slate-400">
                      {done}/{ts.length}
                    </span>
                    <span
                      className={`text-xs font-bold px-1.5 py-0.5 rounded ${pctP === 100 ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/50'}`}
                    >
                      {pctP}%
                    </span>
                    <ChevronDown
                      size={14}
                      className={`text-slate-400 transition-transform ${collapsed ? '' : 'rotate-180'}`}
                    />
                    {canDelete && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          deletePhase(ph.id, ph.name);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.stopPropagation();
                            deletePhase(ph.id, ph.name);
                          }
                        }}
                        aria-label={`Delete phase ${ph.name}`}
                        title="Delete this phase (owner only) — its tasks move to Unphased"
                        className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-all"
                      >
                        <Trash2 size={13} />
                      </span>
                    )}
                  </div>
                </button>
                {!collapsed && (
                <div className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                  {ts.map((t: any, ti: number) => {
                    const canEdit = canManage || (me && t.assigneeId === me.id);
                    return (
                      <div
                        key={t.id}
                        className="py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-2.5 text-sm group"
                      >
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          {canEdit ? (
                            <StatusSelect
                              value={t.status}
                              onChange={(v) => moveTaskFromPhase(t.id, v)}
                              size="sm"
                              pending={pendingTaskIds.has(t.id)}
                            />
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-1 rounded bg-slate-100 text-slate-600 capitalize shrink-0">
                              {String(t.status || '').replace(/_/g, ' ')}
                            </span>
                          )}
                          <div className="flex-1 min-w-0">
                            <TaskLink
                              task={t}
                              className="font-medium text-slate-800 hover:text-blue-700 transition-colors text-sm block truncate"
                            />
                            <div className="text-xs text-slate-400 truncate">
                              {t.assigneeName || 'Unassigned'}
                              {t.subtaskCount > 0 && ` · ${t.subtasksDone}/${t.subtaskCount} subtasks`}
                            </div>
                          </div>
                        </div>
                        {/* Meta tags + actions — flow inline on desktop, wrap to
                          their own row on mobile so the title doesn't shrink. */}
                        <div className="flex items-center flex-wrap gap-1.5 sm:shrink-0 sm:justify-end pl-9 sm:pl-0">
                          {t.pendingWith && t.status !== 'done' && (
                            <span
                              className="tag bg-slate-50 text-slate-500 border border-slate-200 dark:bg-white/[0.03] dark:text-white/40 dark:border-white/[0.06]"
                              title={`Waiting on ${t.pendingWith}`}
                            >
                              waiting on {t.pendingWith}
                            </span>
                          )}
                          {!t.pendingWith &&
                            t.status !== 'done' &&
                            t.lastActivityAt &&
                            (() => {
                              const days = Math.floor(
                                (Date.now() - new Date(t.lastActivityAt).getTime()) / 86_400_000,
                              );
                              return days >= 7 ? (
                                <span
                                  className="tag bg-slate-50 text-slate-400 border border-slate-200 dark:bg-white/[0.03] dark:text-white/30 dark:border-white/[0.06]"
                                  title="No activity recorded recently"
                                >
                                  {days}d idle
                                </span>
                              ) : null;
                            })()}
                          {t.onCriticalPath && (
                            <span className="tag bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/25">
                              Path
                            </span>
                          )}
                          {t.requiresQaSignoff &&
                            (t.qaSignoffAt ? (
                              <span className="tag bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Approved ✓
                              </span>
                            ) : (
                              <span className="tag bg-purple-50 text-purple-700 border border-purple-200">
                                Approval
                              </span>
                            ))}
                          <PriorityTag priority={t.priority} />
                          {t.dueDate && (
                            <span className="text-xs text-slate-400 font-mono">{formatDate(t.dueDate)}</span>
                          )}
                          {canManage && (
                            <button
                              type="button"
                              onClick={() => toggleCriticalPath(t.id, !t.onCriticalPath)}
                              aria-label={t.onCriticalPath ? 'Remove from critical path' : 'Add to critical path'}
                              title={t.onCriticalPath ? 'On critical path' : 'Mark critical path'}
                              className={`p-1 rounded transition-all shrink-0 ${
                                t.onCriticalPath
                                  ? 'text-violet-600 bg-violet-50 dark:bg-violet-500/15'
                                  : 'opacity-0 group-hover:opacity-100 text-slate-300 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-500/10'
                              }`}
                            >
                              <Route size={13} />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => deleteTask(t.id)}
                              aria-label="Delete task"
                              className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-all shrink-0"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                )}
                {!collapsed && canManage && (
                  <QuickAddTask
                    projectId={project.id}
                    phaseId={ph.id}
                    teamId={project.teamId}
                    onAdded={load}
                  />
                )}
              </Card>
            );
          })}

          {/* Unphased tasks */}
          <Card title="Unphased tasks">
            <div className="divide-y divide-slate-100 dark:divide-white/[0.06]">
              {sortTasksForPhase(tasks.filter((t: any) => !t.phaseId)).map((t: any) => {
                  const canEdit = canManage || (me && t.assigneeId === me.id);
                  return (
                    <div
                      key={t.id}
                      className="py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-2.5 text-sm group"
                    >
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        {canEdit ? (
                          <StatusSelect
                            value={t.status}
                            onChange={(v) => moveTaskFromPhase(t.id, v)}
                            size="sm"
                            pending={pendingTaskIds.has(t.id)}
                          />
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-1 rounded bg-slate-100 text-slate-600 capitalize shrink-0">
                            {String(t.status || '').replace(/_/g, ' ')}
                          </span>
                        )}
                        <div className="flex-1 min-w-0">
                          <TaskLink
                            task={t}
                            className="font-medium text-slate-800 hover:text-blue-700 transition-colors text-sm block truncate"
                          />
                          <div className="text-xs text-slate-400 truncate">
                            {t.assigneeName || 'Unassigned'}
                            {t.subtaskCount > 0 && ` · ${t.subtasksDone}/${t.subtaskCount} subtasks`}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center flex-wrap gap-1.5 sm:shrink-0 sm:justify-end pl-9 sm:pl-0">
                        {t.pendingWith && t.status !== 'done' && (
                          <span
                            className="tag bg-slate-50 text-slate-500 border border-slate-200 dark:bg-white/[0.03] dark:text-white/40 dark:border-white/[0.06]"
                            title={`Waiting on ${t.pendingWith}`}
                          >
                            waiting on {t.pendingWith}
                          </span>
                        )}
                        {!t.pendingWith &&
                          t.status !== 'done' &&
                          t.lastActivityAt &&
                          (() => {
                            const days = Math.floor(
                              (Date.now() - new Date(t.lastActivityAt).getTime()) / 86_400_000,
                            );
                            return days >= 7 ? (
                              <span
                                className="tag bg-slate-50 text-slate-400 border border-slate-200 dark:bg-white/[0.03] dark:text-white/30 dark:border-white/[0.06]"
                                title="No activity recorded recently"
                              >
                                {days}d idle
                              </span>
                            ) : null;
                          })()}
                        {t.onCriticalPath && (
                          <span className="tag bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/25">
                            Path
                          </span>
                        )}
                        {t.gxpCritical && (
                          <span className="tag bg-red-50 text-red-700 border border-red-200">Critical</span>
                        )}
                        {t.requiresQaSignoff &&
                          (t.qaSignoffAt ? (
                            <span className="tag bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Approved
                            </span>
                          ) : (
                            <span className="tag bg-purple-50 text-purple-700 border border-purple-200">
                              Needs approval
                            </span>
                          ))}
                        <PriorityTag priority={t.priority} />
                        {t.dueDate && (
                          <span className="text-xs text-slate-400 font-mono">{formatDate(t.dueDate)}</span>
                        )}
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => toggleCriticalPath(t.id, !t.onCriticalPath)}
                            aria-label={t.onCriticalPath ? 'Remove from critical path' : 'Add to critical path'}
                            title={t.onCriticalPath ? 'On critical path' : 'Mark critical path'}
                            className={`p-1 rounded transition-all shrink-0 ${
                              t.onCriticalPath
                                ? 'text-violet-600 bg-violet-50 dark:bg-violet-500/15'
                                : 'opacity-0 group-hover:opacity-100 text-slate-300 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-500/10'
                            }`}
                          >
                            <Route size={13} />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => deleteTask(t.id)}
                            aria-label="Delete task"
                            className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-all shrink-0"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              {tasks.filter((t: any) => !t.phaseId).length === 0 && (
                <div className="text-xs text-slate-400 py-3">None</div>
              )}
            </div>
            {canManage && <QuickAddTask projectId={project.id} teamId={project.teamId} onAdded={load} />}
          </Card>
        </div>
      )}

      {view === 'board' && (
        <>
          {/* Desktop: the full drag-and-drop column board. Mobile: a tap-driven
              status view (see KanbanBoardMobile). Pure CSS switch by breakpoint
              so the desktop board is never affected. */}
          <div className="hidden md:block">
            <KanbanBoard
              tasks={tasks}
              onDropReorder={dropReorder}
              isLead={canManage}
              canDelete={canDelete}
              onDelete={deleteTask}
            />
          </div>
          <div className="md:hidden">
            <KanbanBoardMobile
              tasks={tasks}
              onMove={dropReorder}
              isLead={canManage}
              canDelete={canDelete}
              onDelete={deleteTask}
            />
          </div>
        </>
      )}

      {/* Modals */}
      {pendingStatus && (
        <StatusSignoffModal
          projectName={project.name}
          fromStatus={project.status}
          toStatus={pendingStatus}
          onClose={() => setPendingStatus(null)}
          onConfirm={confirmStatusChange}
        />
      )}
      {blockCompleteOpen && (
        <BlockCompleteModal openCount={openTaskCount} onClose={() => setBlockComplete(false)} />
      )}
      {deleteOpen && project && (
        <DeleteProjectModal
          projectName={project.name}
          projectId={id}
          onClose={() => setDeleteOpen(false)}
          onDeleted={() => {
            setDeleteOpen(false);
            window.location.replace('/projects');
          }}
        />
      )}
      {showBirdEye && (
        <BirdsEyeView onClose={() => setShowBirdEye(false)} onChange={load} data={birdEyeData} />
      )}

      {/* Headless one-shot export from the Export menu — no modal, just a file. */}
      {birdEyeExport && (
        <BirdsEyeView autoExport={birdEyeExport} onClose={() => setBirdEyeExport(null)} data={birdEyeData} />
      )}
    </div>
  );
}
