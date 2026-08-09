'use client';
import { useEffect, useRef, useState } from 'react';
import { ModalPortal } from '@/components/ModalPortal';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { api } from '@/lib/client/api';
import { useCurrentUser } from '@/components/CurrentUserContext';
import {
  Trash2,
  BarChart3,
  X,
  Camera,
  Users,
  FolderKanban,
  CheckCircle2,
  ListTodo,
  AlertTriangle,
  ChevronRight,
  Search,
  Filter,
  Repeat,
} from 'lucide-react';
import { TeamDetailSkeleton } from '@/components/SkeletonScreens';
import { BirdEyeButton } from '@/components/BirdEyeButton';
import { WORKBENCH_MODULES_ENABLED } from '@/lib/features';
import dynamic from 'next/dynamic';
// Heavy interactive SVG canvas — defer it until a viewer opens the modal.
const BirdsEyeView = dynamic(() => import('@/components/BirdsEyeView').then((m) => m.BirdsEyeView), {
  ssr: false,
  loading: () => null,
});
const ActivityGraph = dynamic(() => import('@/components/ActivityGraph').then((m) => m.ActivityGraph), {
  ssr: false,
  loading: () => <div className="h-40 skeleton rounded-xl" />,
});
// Opt-in team modules — loaded only when the team has them enabled and the
// viewer opens the tab, so they cost nothing for teams that don't use them.
const QmsPanel = dynamic(() => import('./QmsPanel').then((m) => m.QmsPanel), {
  ssr: false,
  loading: () => <div className="h-40 skeleton rounded-xl" />,
});
const TicketsPanel = dynamic(() => import('./TicketsPanel').then((m) => m.TicketsPanel), {
  ssr: false,
  loading: () => <div className="h-40 skeleton rounded-xl" />,
});
const RecurringPanel = dynamic(() => import('./RecurringPanel').then((m) => m.RecurringPanel), {
  ssr: false,
  loading: () => <div className="h-40 skeleton rounded-xl" />,
});
import {
  Card,
  ProgressBar,
  LifecycleTag,
  StatusTag,
  PriorityTag,
  RoleBadge,
  formatFullDate,
  isOverdue,
  TaskLink,
} from '@/components/ui';
import { UserAvatar } from '@/components/AvatarRegistry';
import { downloadTeamReport, printTeamReport, downloadTeamCsv } from './report';
import { ExportMenu } from '@/components/ExportMenu';
import { Select } from '@/components/Select';

type WorkFilter = 'open' | 'overdue' | 'done' | 'all';

function taskSortKey(t: any): number {
  // Overdue first, then soonest due, then no-date, done last.
  const done = t.status === 'done' ? 1 : 0;
  const overdue = isOverdue(t.dueDate, t.status) ? 0 : 1;
  const due = t.dueDate ? new Date(t.dueDate).getTime() : Number.MAX_SAFE_INTEGER / 2;
  return done * 1e15 + overdue * 1e14 + due;
}

/* One task line, reused by the Work view (grouped by person for leads, flat for
   an IC). When grouped under a person we drop the redundant assignee chip. */
function TeamTaskRow({ t, showAssignee }: { t: any; showAssignee: boolean }) {
  const overdue = isOverdue(t.dueDate, t.status);
  const done = t.status === 'done';
  return (
    <div
      className={`py-2.5 flex items-center gap-3 text-sm rounded-lg px-1.5 -mx-1.5 transition-colors ${
        overdue
          ? 'bg-red-50/50 dark:bg-red-500/[0.06]'
          : done
            ? 'opacity-60'
            : 'hover:bg-slate-50/80 dark:hover:bg-white/[0.03]'
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <TaskLink task={t} />
          {t.priority && t.priority !== 'medium' && t.priority !== 'low' && (
            <PriorityTag priority={t.priority} />
          )}
        </div>
        <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5 min-w-0">
          <Link href={`/projects/${t.projectId}`} className="hover:underline font-medium truncate shrink-0">
            {t.projectCode}
          </Link>
          {showAssignee && (
            <span className="inline-flex items-center gap-1 min-w-0">
              <span className="text-slate-300">·</span>
              {t.assigneeId ? (
                <>
                  <UserAvatar userId={t.assigneeId} name={t.assigneeName} size={16} />
                  <span className="truncate">{t.assigneeName}</span>
                </>
              ) : (
                <span>Unassigned</span>
              )}
            </span>
          )}
        </div>
      </div>
      <StatusTag status={t.status} />
      <span
        className={`text-[11px] w-[5.5rem] text-right shrink-0 tabular-nums ${
          overdue ? 'text-red-600 font-semibold' : done ? 'text-slate-400' : 'text-slate-500'
        }`}
        title={t.dueDate ? formatFullDate(t.dueDate) : undefined}
      >
        {t.dueDate ? formatFullDate(t.dueDate) : '—'}
      </span>
    </div>
  );
}

function WorkFilterChip({
  active,
  onClick,
  label,
  count,
  danger,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all border ${
        active
          ? danger
            ? 'bg-red-600 text-white border-red-600 shadow-sm'
            : 'bg-brand-600 text-white border-brand-600 shadow-sm'
          : danger && (count ?? 0) > 0
            ? 'bg-white text-red-600 border-red-200 hover:bg-red-50'
            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-white/[0.03] dark:border-white/10 dark:text-white/60'
      }`}
    >
      {label}
      {typeof count === 'number' && (
        <span
          className={`tabular-nums rounded-full px-1.5 py-px text-[10px] font-bold ${
            active ? 'bg-white/20' : 'bg-slate-100 text-slate-500 dark:bg-white/10'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

const FUNCTION_LABEL: Record<string, string> = {
  general: 'General',
  ctb: 'Change the Business',
  rtb: 'Run the Business',
  csv_validation: 'CSV / Validation',
  data_integrity: 'Data Integrity',
  pharmacovigilance: 'Pharmacovigilance',
  lab_informatics: 'Lab Informatics',
  audit: 'Audit',
  training: 'Training',
};

// A quiet, function-tinted hero cover — a touch of identity per team without
// the per-member tint that read as noisy on the profile. Falls back to the
// brand blue→green sweep.
const FUNCTION_COVER: Record<string, string> = {
  rtb: 'linear-gradient(115deg, #0d47a1 0%, #1976D2 55%, #1565C0 100%)',
  ctb: 'linear-gradient(115deg, #1b5e20 0%, #2E7D32 55%, #1565C0 100%)',
  data_integrity: 'linear-gradient(115deg, #4a148c 0%, #6a1b9a 55%, #1565C0 100%)',
  audit: 'linear-gradient(115deg, #4e342e 0%, #6d4c41 55%, #455a64 100%)',
};
const DEFAULT_COVER = 'linear-gradient(115deg, #1565C0 0%, #1976D2 40%, #2E7D32 100%)';

/* One figure in the team header's stat strip — a quiet tile with an icon so
   the five numbers scan at a glance rather than reading as a wall of text. */
function HeroStat({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  onClick,
  active,
  hint,
}: {
  icon?: any;
  label: string;
  value: React.ReactNode;
  sub?: string;
  accent?: string;
  onClick?: () => void;
  active?: boolean;
  hint?: string;
}) {
  const Comp: any = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={hint}
      className={`min-w-0 rounded-xl border px-3 py-2.5 text-left transition-all ${
        active
          ? 'border-brand-300 bg-blue-50/80 ring-1 ring-brand-200/80 dark:border-blue-500/40 dark:bg-blue-500/10'
          : 'border-slate-200/70 bg-slate-50/60 dark:border-white/[0.07] dark:bg-white/[0.02]'
      } ${onClick ? 'cursor-pointer hover:border-brand-200 hover:bg-blue-50/40 dark:hover:bg-white/[0.04]' : ''}`}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {Icon && <Icon size={12} className="shrink-0" style={accent ? { color: accent } : undefined} />}
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span
          className="text-[20px] font-black tabular-nums leading-none text-slate-900 dark:text-white"
          style={accent ? { color: accent } : undefined}
        >
          {value}
        </span>
        {sub && <span className="text-[11px] text-slate-400">{sub}</span>}
      </div>
    </Comp>
  );
}

export default function TeamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [team, setTeam] = useState<any>(null);
  const [board, setBoard] = useState<any[]>([]);
  const [progress, setProgress] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [loadError, setLoadError] = useState<string>('');
  const [adding, setAdding] = useState(false);
  const [newMember, setNewMember] = useState('');
  const [activityMember, setActivityMember] = useState<any | null>(null);
  const [showBirdEye, setShowBirdEye] = useState(false);
  // Headless bird's-eye export — set by the Export menu to download the map
  // (SVG/PNG) directly, without opening the interactive view.
  const [birdEyeExport, setBirdEyeExport] = useState<'svg' | 'png' | null>(null);
  // Team avatar — loaded on mount, updated on upload/remove
  const [avatarImage, setAvatarImage] = useState<string | null>(null);
  const [avatarHover, setAvatarHover] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const me = useCurrentUser();
  const isLead = me?.role === 'lead' || me?.role === 'admin';
  // The old "Team progress" tab duplicated the "Projects" tab (same per-project
  // bars), so they're merged into one Projects overview (team-wide summary +
  // per-project rows). "Work" answers the lead's daily question — who is doing
  // what — by grouping tasks under each person; an IC sees only their own.
  // Everyone opens on Work — unless deep-linked via ?view= (e.g. from a Recurring project).
  const searchParams = useSearchParams();
  const viewParam = searchParams?.get('view');
  const initialView = (
    viewParam === 'recurring' ||
    viewParam === 'projects' ||
    viewParam === 'qms' ||
    viewParam === 'tickets' ||
        viewParam === 'work'
      ? viewParam
      : 'work'
  ) as 'work' | 'projects' | 'qms' | 'tickets' | 'recurring';
  const [view, setView] = useState<
    'work' | 'projects' | 'qms' | 'tickets' | 'recurring'
  >(initialView);
  // Work board focus — default Open so Done noise doesn't bury real work
  // (screenshot: entire "Who's doing what" was green Done rows).
  const [workFilter, setWorkFilter] = useState<WorkFilter>('open');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [workQuery, setWorkQuery] = useState('');

  async function load() {
    setLoadError('');
    try {
      // Per-member progress analytics is a LEAD/ADMIN-only endpoint (it 403s
      // for contributors). Only request it when the viewer can use it — if we
      // include it for an IC the whole Promise.all rejects and the page hangs
      // on the skeleton forever.
      const [t, b] = await Promise.all([api<any>(`/teams/${id}`), api<any[]>(`/teams/${id}/board`)]);
      setTeam(t);
      setBoard(b);
      if (isLead) {
        api<any>(`/analytics/team/${id}/progress`)
          .then(setProgress)
          .catch(() => {});
      }
    } catch (e: any) {
      setLoadError(e?.message || 'This team could not be loaded.');
    }
  }
  useEffect(() => {
    load();
    // The user list only feeds the add-member dropdown (owner/admin only); a
    // failure here must never block the team view from rendering.
    api<any[]>('/users')
      .then(setUsers)
      .catch(() => {});
    // Load team avatar on mount — stored separately (select: false on the
    // model) so we always do a dedicated fetch rather than rely on the team
    // payload.
    api<{ avatarImage: string | null }>(`/teams/${id}/avatar`)
      .then((r) => setAvatarImage(r.avatarImage))
      .catch(() => {});
  }, [id]);

  // Resize a File to 128×128 JPEG (quality 0.85) and return a data-URL.
  function resizeToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = 128;
          canvas.height = 128;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas 2d context unavailable'));
            return;
          }
          // Draw centred square crop then scale to 128×128
          const size = Math.min(img.width, img.height);
          const sx = (img.width - size) / 2;
          const sy = (img.height - size) / 2;
          ctx.drawImage(img, sx, sy, size, size, 0, 0, 128, 128);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    });
  }

  async function handleAvatarFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset so the same file can be picked again after a remove
    e.target.value = '';
    setAvatarUploading(true);
    try {
      const dataUrl = await resizeToDataUrl(file);
      await api(`/teams/${id}/avatar`, { method: 'PUT', body: { image: dataUrl } });
      setAvatarImage(dataUrl);
    } catch {
      // Silent fail — keep the existing avatar
    } finally {
      setAvatarUploading(false);
    }
  }

  async function removeAvatar() {
    setAvatarUploading(true);
    try {
      await api(`/teams/${id}/avatar`, { method: 'PUT', body: { image: null } });
      setAvatarImage(null);
    } catch {
      // Silent fail
    } finally {
      setAvatarUploading(false);
    }
  }

  if (loadError) {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center space-y-3 page-enter">
        <h1 className="text-lg font-bold text-slate-800">Team unavailable</h1>
        <p className="text-sm text-slate-500">{loadError}</p>
        <div className="flex items-center justify-center gap-2 pt-1">
          <button onClick={() => load()} className="btn-primary">
            Try again
          </button>
          <Link href="/teams" className="btn-secondary">
            Back to teams
          </Link>
        </div>
      </div>
    );
  }

  // Mirror the route-level loading.tsx exactly — the navigation skeleton
  // (loading.tsx → TeamDetailSkeleton) and this in-component fetch skeleton are
  // the same shape, so the handoff between them is seamless rather than a flash
  // of two different layouts.
  if (!team) {
    return <TeamDetailSkeleton />;
  }

  async function addMember() {
    if (!newMember) return;
    await api(`/teams/${id}/members`, { method: 'POST', body: { userId: newMember } });
    setNewMember('');
    setAdding(false);
    load();
  }
  async function removeMember(uid: string) {
    await api(`/teams/${id}/members/${uid}`, { method: 'DELETE' });
    load();
  }

  const availableUsers = users.filter(
    (u) => u.role !== 'admin' && !team.members.find((m: any) => m.id === u.id),
  );

  // Only the team's owner (its lead) or the workspace admin can edit the team
  // — add/remove members, etc. (mirrors the API guard).
  const isOwnerOrAdmin = me?.role === 'admin' || (!!team.leadId && team.leadId === me?.id);

  // ICs only ever see their own micro-tasks; leads see the whole board.
  const visibleBoard = isLead ? board : board.filter((t: any) => t.assigneeId === me?.id);

  // Hero summary — computed from data already on the page (no extra request).
  const heroProjects = team.projects || [];
  const heroTaskTotal = heroProjects.reduce((s: number, p: any) => s + (p.taskCount || 0), 0);
  const heroTaskDone = heroProjects.reduce((s: number, p: any) => s + (p.tasksDone || 0), 0);
  const heroPct = heroTaskTotal ? Math.round((heroTaskDone / heroTaskTotal) * 100) : 0;
  const heroOpen = visibleBoard.filter((t: any) => t.status !== 'done').length;
  const heroOverdue = visibleBoard.filter((t: any) => isOverdue(t.dueDate, t.status)).length;
  const cover = FUNCTION_COVER[team.function] || DEFAULT_COVER;

  function focusWork(filter: WorkFilter, memberId: string | null = selectedMemberId) {
    setView('work');
    setWorkFilter(filter);
    setSelectedMemberId(memberId);
  }

  function matchesWorkFilter(t: any, filter: WorkFilter) {
    if (filter === 'open') return t.status !== 'done';
    if (filter === 'overdue') return isOverdue(t.dueDate, t.status);
    if (filter === 'done') return t.status === 'done';
    return true;
  }

  const filteredWork = visibleBoard
    .filter((t: any) => {
      if (selectedMemberId) {
        if (selectedMemberId === '__unassigned') {
          if (t.assigneeId) return false;
        } else if (t.assigneeId !== selectedMemberId) {
          return false;
        }
      }
      if (!matchesWorkFilter(t, workFilter)) return false;
      if (workQuery.trim()) {
        const q = workQuery.trim().toLowerCase();
        const hay = `${t.title || ''} ${t.projectCode || ''} ${t.assigneeName || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .slice()
    .sort((a: any, b: any) => taskSortKey(a) - taskSortKey(b));

  // Per-member open counts for the sidebar (from the board, not analytics).
  const openByMember = new Map<string, number>();
  const overdueByMember = new Map<string, number>();
  for (const t of visibleBoard) {
    if (t.status === 'done') continue;
    const k = t.assigneeId || '__unassigned';
    openByMember.set(k, (openByMember.get(k) || 0) + 1);
    if (isOverdue(t.dueDate, t.status)) {
      overdueByMember.set(k, (overdueByMember.get(k) || 0) + 1);
    }
  }

  // The bird's-eye tree — built once from data already on the page, shared by
  // the interactive view and the headless Export-menu download.
  const birdEyeData = {
    rootLabel: team.name,
    rootSubLabel: `${(team.projects || []).length} project${(team.projects || []).length === 1 ? '' : 's'} · ${(board || []).length} task${(board || []).length === 1 ? '' : 's'}`,
    scope: 'team' as const,
    teams: [{ id: team.id, name: team.name, ownerName: team.leadName }],
    projects: (team.projects || []).map((p: any) => ({
      id: p.id,
      code: p.ccNo || p.code,
      name: p.name,
      teamId: team.id,
      health: 'healthy' as const,
      taskCount: p.taskCount ?? 0,
      tasksDone: p.tasksDone ?? 0,
      dueDate: p.dueDate ?? null,
      ownerName: p.ownerName ?? null,
    })),
    tasks: (board || []).map((t: any) => ({
      id: t.id,
      title: t.title,
      projectId: t.projectId,
      status: t.status,
      assigneeName: t.assigneeName ?? null,
      dueDate: (t.ccTcd || t.dueDate) ?? null,
      subtaskCount: t.subtaskCount,
      subtasksDone: t.subtasksDone,
      subtaskTitles: (t.subtaskTitles || []).slice(0, 5),
    })),
  };

  return (
    <div className="space-y-6">
      {/* Per-member activity peek — leads/admins click the graph icon on a
          member to see how they're tracking (read-only). */}
      {activityMember && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 overlay-in"
            onClick={() => setActivityMember(null)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 w-full max-w-[820px] max-h-[calc(100vh-2rem)] overflow-y-auto modal-in"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3 mb-5">
                <UserAvatar userId={activityMember.id} name={activityMember.name} size={44} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black text-slate-900 truncate">{activityMember.name}</h3>
                    {activityMember.role && <RoleBadge role={activityMember.role} />}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">Performance overview</div>
                </div>
                <button
                  onClick={() => setActivityMember(null)}
                  className="text-slate-300 hover:text-slate-500 ml-2 mt-0.5"
                >
                  <X size={18} />
                </button>
              </div>
              <ActivityGraph userId={activityMember.id} name={activityMember.name} />
              <div className="mt-5 border-t border-slate-100 pt-4">
                <div className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
                  Working on now
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {board
                    .filter(
                      (task: any) =>
                        task.assigneeId === activityMember.id &&
                        task.status !== 'done' &&
                        task.status !== 'cancelled',
                    )
                    .slice(0, 8)
                    .map((task: any) => (
                      <Link
                        key={task.id}
                        href={`/tasks/${task.id}`}
                        className="rounded-xl border border-slate-200 p-3 transition hover:border-blue-200 hover:bg-blue-50/40"
                      >
                        <div className="truncate text-sm font-semibold text-slate-800">{task.title}</div>
                        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-400">
                          <span className="truncate">{task.projectCode}</span>
                          <StatusTag status={task.status} />
                        </div>
                      </Link>
                    ))}
                  {!board.some(
                    (task: any) =>
                      task.assigneeId === activityMember.id &&
                      task.status !== 'done' &&
                      task.status !== 'cancelled',
                  ) && <div className="text-sm text-slate-400">No active assigned tasks right now.</div>}
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
      {/* Team header — identity strip + glanceable, clickable stats. */}
      <section className="card overflow-hidden">
        <div className="h-1.5 w-full" style={{ background: cover }} aria-hidden />
        <div className="p-5 sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="shrink-0 flex flex-col items-center gap-1">
                <div
                  className="relative cursor-pointer rounded-2xl border border-slate-200 bg-white p-1 shadow-sm dark:border-white/10 dark:bg-[#262624]"
                  onMouseEnter={() => setAvatarHover(true)}
                  onMouseLeave={() => setAvatarHover(false)}
                  onClick={() => isOwnerOrAdmin && avatarInputRef.current?.click()}
                  title={isOwnerOrAdmin ? 'Change team avatar' : undefined}
                >
                  {avatarImage ? (
                    <img
                      src={avatarImage}
                      alt={`${team.name} avatar`}
                      className="h-16 w-16 rounded-xl object-cover"
                    />
                  ) : (
                    <div
                      className="flex h-16 w-16 items-center justify-center rounded-xl"
                      style={{ background: cover }}
                    >
                      <span className="select-none text-2xl font-black text-white/90">
                        {team.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  {isOwnerOrAdmin && (avatarHover || avatarUploading) && (
                    <div className="absolute inset-1 flex items-center justify-center rounded-xl bg-black/40">
                      {avatarUploading ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      ) : (
                        <Camera size={18} className="text-white" />
                      )}
                    </div>
                  )}
                </div>
                {isOwnerOrAdmin && avatarImage && (
                  <button
                    onClick={removeAvatar}
                    disabled={avatarUploading}
                    className="text-[10.5px] text-slate-400 transition-colors hover:text-red-500"
                  >
                    Remove
                  </button>
                )}
                {isOwnerOrAdmin && (
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarFileChange}
                  />
                )}
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="break-words text-xl font-black leading-tight tracking-tight text-slate-900 dark:text-white sm:text-2xl">
                    {team.name}
                  </h1>
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      (
                        {
                          rtb: 'bg-blue-50 text-blue-700 border-blue-200',
                          ctb: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                        } as Record<string, string>
                      )[team.function] || 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}
                  >
                    {FUNCTION_LABEL[team.function] || team.function}
                  </span>
                </div>
                {team.description && (
                  <p className="mt-1.5 max-w-2xl text-sm leading-snug text-slate-500 dark:text-white/50">
                    {team.description}
                  </p>
                )}
                {team.leadName && (
                  <p className="mt-1 text-[11px] text-slate-400">
                    Lead · <span className="font-semibold text-slate-600 dark:text-white/60">{team.leadName}</span>
                  </p>
                )}
              </div>
            </div>

            {(isOwnerOrAdmin || isLead) && (
              <div className="flex shrink-0 items-center gap-1.5 self-start">
                <BirdEyeButton
                  scopeKey={`team:${id}`}
                  onClick={() => setShowBirdEye(true)}
                  label="Bird’s-eye"
                  className="border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.04]"
                />
                <ExportMenu
                  onPdf={() => printTeamReport(team, progress, board, me?.name || me?.email || '')}
                  onCsv={() => downloadTeamCsv(team, board, me?.name || me?.email || '')}
                  onBirdEyeSvg={() => setBirdEyeExport('svg')}
                  onBirdEyePng={() => setBirdEyeExport('png')}
                />
              </div>
            )}
          </div>

          {/* Overall progress — quiet bar under identity */}
          {heroTaskTotal > 0 && (
            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between text-[11px]">
                <span className="font-semibold text-slate-500">Team completion</span>
                <span className="tabular-nums text-slate-400">
                  <strong className="text-slate-700 dark:text-white/75">{heroTaskDone}</strong>/{heroTaskTotal} ·{' '}
                  <strong className="text-brand-600">{heroPct}%</strong>
                </span>
              </div>
              <ProgressBar value={heroPct} />
            </div>
          )}

          {/* Stat strip — click Open / Overdue / Projects to jump into the right lens. */}
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            <HeroStat
              icon={Users}
              label="Members"
              value={team.members.length}
              hint="Team roster"
              active={view === 'work' && !selectedMemberId && workFilter === 'open'}
              onClick={() => {
                setSelectedMemberId(null);
                focusWork('open', null);
              }}
            />
            <HeroStat
              icon={FolderKanban}
              label="Projects"
              value={heroProjects.length}
              hint="Open projects tab"
              active={view === 'projects'}
              onClick={() => setView('projects')}
            />
            <HeroStat
              icon={CheckCircle2}
              label="Tasks done"
              value={`${heroTaskDone}/${heroTaskTotal || 0}`}
              sub={`${heroPct}%`}
              hint="Show completed work"
              active={view === 'work' && workFilter === 'done'}
              onClick={() => focusWork('done')}
            />
            <HeroStat
              icon={ListTodo}
              label={isLead ? 'Open' : 'My open'}
              value={heroOpen}
              accent={heroOpen > 0 ? '#1565C0' : undefined}
              hint="Show open work"
              active={view === 'work' && workFilter === 'open'}
              onClick={() => focusWork('open')}
            />
            <HeroStat
              icon={AlertTriangle}
              label={isLead ? 'Overdue' : 'My overdue'}
              value={heroOverdue}
              accent={heroOverdue > 0 ? '#dc2626' : undefined}
              hint="Show overdue only"
              active={view === 'work' && workFilter === 'overdue'}
              onClick={() => focusWork('overdue')}
            />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-1 space-y-4">
          <Card
            title={`Members (${team.members.length})`}
            action={
              isOwnerOrAdmin ? (
                <button
                  className="text-xs font-bold text-brand-700 hover:text-brand-800 px-2 py-1 rounded-md hover:bg-blue-50 transition-colors"
                  onClick={() => setAdding((v) => !v)}
                >
                  {adding ? 'Cancel' : '+ Add'}
                </button>
              ) : undefined
            }
          >
            {isOwnerOrAdmin && (
              <div className="mb-3 -mt-1 text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-2 leading-snug dark:bg-white/[0.03] dark:border-white/10">
                Membership grants access to every project on this team.
              </div>
            )}
            {adding && isOwnerOrAdmin && (
              <div className="flex gap-2 mb-3">
                <Select
                  className="flex-1"
                  value={newMember}
                  onChange={setNewMember}
                  ariaLabel="Select user to add"
                  placeholder="Select user…"
                  options={[
                    { value: '', label: 'Select user…' },
                    ...availableUsers.map((u: any) => ({ value: u.id, label: u.name })),
                  ]}
                />
                <button className="btn-primary" onClick={addMember}>
                  Add
                </button>
              </div>
            )}
            {isLead && (
              <button
                type="button"
                onClick={() => {
                  setSelectedMemberId(null);
                  focusWork(workFilter === 'all' ? 'open' : workFilter, null);
                }}
                className={`mb-2 w-full text-left rounded-lg px-2.5 py-2 text-[11px] font-semibold transition-colors border ${
                  !selectedMemberId
                    ? 'border-brand-200 bg-blue-50 text-brand-700'
                    : 'border-transparent text-slate-500 hover:bg-slate-50 dark:hover:bg-white/[0.04]'
                }`}
              >
                Everyone · {heroOpen} open
              </button>
            )}
            <div className="space-y-1">
              {team.members.map((m: any) => {
                const p = progress?.members?.find((x: any) => x.id === m.id);
                const openN = openByMember.get(m.id) || 0;
                const overdueN = overdueByMember.get(m.id) || 0;
                const selected = selectedMemberId === m.id;
                return (
                  <div
                    key={m.id}
                    className={`group flex items-center gap-2 rounded-xl px-2 py-2 border transition-all ${
                      selected
                        ? 'border-brand-200 bg-blue-50/70 dark:border-blue-500/30 dark:bg-blue-500/10'
                        : 'border-transparent hover:border-slate-100 hover:bg-slate-50/80 dark:hover:bg-white/[0.03]'
                    }`}
                  >
                    <button
                      type="button"
                      className="flex flex-1 min-w-0 items-center gap-2 text-left"
                      onClick={() => {
                        if (!isLead) return;
                        setSelectedMemberId(selected ? null : m.id);
                        setView('work');
                        if (workFilter === 'done') setWorkFilter('open');
                      }}
                      title={isLead ? `Filter work to ${m.name}` : undefined}
                    >
                      <UserAvatar userId={m.id} name={m.name} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-sm font-semibold text-slate-800 dark:text-white/85 truncate">
                            {m.name}
                          </span>
                          {isLead && openN > 0 && (
                            <span className="shrink-0 text-[10px] font-bold tabular-nums text-brand-700 bg-blue-50 border border-blue-100 rounded-full px-1.5 py-px">
                              {openN}
                            </span>
                          )}
                          {isLead && overdueN > 0 && (
                            <span className="shrink-0 text-[10px] font-bold tabular-nums text-red-600 bg-red-50 border border-red-100 rounded-full px-1.5 py-px">
                              {overdueN}!
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {m.title || m.role}
                          {isLead && p && ` · ${p.done}/${p.assigned} done`}
                        </div>
                        {isLead && p && p.assigned > 0 && (
                          <ProgressBar value={Math.round((p.done / p.assigned) * 100)} className="mt-1" />
                        )}
                      </div>
                    </button>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {isLead && (
                        <button
                          onClick={() => setActivityMember(m)}
                          title={`View ${m.name}'s activity`}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-white transition-colors"
                        >
                          <BarChart3 size={14} />
                        </button>
                      )}
                      {isOwnerOrAdmin && (
                        <button
                          onClick={() => removeMember(m.id)}
                          title="Remove from team"
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        <div className="lg:col-span-3 space-y-4">
          {/* Segmented tabs with counts */}
          <div className="flex flex-wrap gap-1.5 p-1 rounded-xl bg-slate-100/80 dark:bg-white/[0.04] border border-slate-200/60 dark:border-white/[0.06] w-fit max-w-full">
            {(
              [
                ['work', isLead ? 'Work' : 'My tasks', heroOpen],
                ['projects', 'Projects', heroProjects.length],
                ...(WORKBENCH_MODULES_ENABLED && team.modules?.qms?.enabled
                  ? [['qms', 'QMS', null]]
                  : []),
                ...(WORKBENCH_MODULES_ENABLED && team.modules?.tickets?.enabled
                  ? [['tickets', 'Tickets', null]]
                  : []),
                ...(WORKBENCH_MODULES_ENABLED && team.modules?.recurring?.enabled
                  ? [['recurring', 'Recurring', null]]
                  : []),
              ] as [string, string, number | null][]
            ).map(([k, l, count]) => (
              <button
                key={k}
                onClick={() => setView(k as any)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                  view === k
                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80 dark:bg-[#1a1a1a] dark:text-white dark:border-white/10'
                    : 'text-slate-500 hover:text-slate-800 border border-transparent dark:hover:text-white/80'
                }`}
              >
                {k === 'recurring' && <Repeat size={13} className="opacity-70" />}
                {l}
                {typeof count === 'number' && (
                  <span
                    className={`text-[10px] font-bold tabular-nums rounded-full px-1.5 py-px ${
                      view === k
                        ? 'bg-brand-50 text-brand-700'
                        : 'bg-slate-200/80 text-slate-500 dark:bg-white/10'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── Work — open first, filterable by person & status ─────────── */}
          {view === 'work' && (
            <Card
              title={
                isLead
                  ? selectedMemberId
                    ? `Work · ${
                        selectedMemberId === '__unassigned'
                          ? 'Unassigned'
                          : team.members.find((m: any) => m.id === selectedMemberId)?.name || 'Member'
                      }`
                    : "Who's doing what"
                  : 'My tasks across team projects'
              }
              action={
                <span className="text-[11px] text-slate-400 tabular-nums">
                  {filteredWork.length} shown
                </span>
              }
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 mb-4">
                <div className="flex flex-wrap items-center gap-1.5 flex-1">
                  <Filter size={13} className="text-slate-400 shrink-0 hidden sm:block" />
                  <WorkFilterChip
                    label="Open"
                    count={
                      visibleBoard.filter(
                        (t: any) =>
                          t.status !== 'done' &&
                          (!selectedMemberId ||
                            (selectedMemberId === '__unassigned'
                              ? !t.assigneeId
                              : t.assigneeId === selectedMemberId)),
                      ).length
                    }
                    active={workFilter === 'open'}
                    onClick={() => setWorkFilter('open')}
                  />
                  <WorkFilterChip
                    label="Overdue"
                    count={
                      visibleBoard.filter(
                        (t: any) =>
                          isOverdue(t.dueDate, t.status) &&
                          (!selectedMemberId ||
                            (selectedMemberId === '__unassigned'
                              ? !t.assigneeId
                              : t.assigneeId === selectedMemberId)),
                      ).length
                    }
                    active={workFilter === 'overdue'}
                    onClick={() => setWorkFilter('overdue')}
                    danger
                  />
                  <WorkFilterChip
                    label="Done"
                    count={
                      visibleBoard.filter(
                        (t: any) =>
                          t.status === 'done' &&
                          (!selectedMemberId ||
                            (selectedMemberId === '__unassigned'
                              ? !t.assigneeId
                              : t.assigneeId === selectedMemberId)),
                      ).length
                    }
                    active={workFilter === 'done'}
                    onClick={() => setWorkFilter('done')}
                  />
                  <WorkFilterChip
                    label="All"
                    count={
                      selectedMemberId
                        ? visibleBoard.filter((t: any) =>
                            selectedMemberId === '__unassigned'
                              ? !t.assigneeId
                              : t.assigneeId === selectedMemberId,
                          ).length
                        : visibleBoard.length
                    }
                    active={workFilter === 'all'}
                    onClick={() => setWorkFilter('all')}
                  />
                </div>
                <div className="relative sm:w-52">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    className="input text-sm pl-8 py-1.5"
                    placeholder="Search tasks…"
                    value={workQuery}
                    onChange={(e) => setWorkQuery(e.target.value)}
                  />
                </div>
              </div>

              {isLead && !selectedMemberId ? (
                (() => {
                  const byAssignee = new Map<string, any[]>();
                  for (const t of filteredWork) {
                    const k = t.assigneeId || '__unassigned';
                    (byAssignee.get(k) || byAssignee.set(k, []).get(k)!).push(t);
                  }
                  const groups: { id: string; name: string; tasks: any[] }[] = [];
                  for (const m of team.members) {
                    const ts = byAssignee.get(m.id);
                    if (ts && ts.length) groups.push({ id: m.id, name: m.name, tasks: ts });
                  }
                  const un = byAssignee.get('__unassigned');
                  if (un && un.length) groups.push({ id: '__unassigned', name: 'Unassigned', tasks: un });

                  if (groups.length === 0) {
                    return (
                      <div className="text-center py-10 px-4">
                        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                          <CheckCircle2 size={18} />
                        </div>
                        <div className="text-sm font-semibold text-slate-700 dark:text-white/80">
                          {workFilter === 'open'
                            ? 'Zero open'
                            : workFilter === 'overdue'
                              ? 'Zero overdue'
                              : workFilter === 'done'
                                ? 'No completed tasks in view'
                                : 'No match'}
                        </div>
                        <p className="mt-1 text-xs text-slate-400 max-w-sm mx-auto">
                          {workFilter === 'open'
                            ? 'Board is clear. Done history is one filter away.'
                            : 'Try another filter or clear the search.'}
                        </p>
                        {workFilter !== 'all' && (
                          <button
                            type="button"
                            className="mt-3 text-xs font-semibold text-brand-600 hover:text-brand-800"
                            onClick={() => setWorkFilter('all')}
                          >
                            Show all tasks
                          </button>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-5">
                      {groups.map((g) => {
                        const open = g.tasks.filter((t) => t.status !== 'done').length;
                        const overdue = g.tasks.filter((t) => isOverdue(t.dueDate, t.status)).length;
                        return (
                          <div key={g.id} className="rounded-xl border border-slate-100 dark:border-white/[0.06] p-3">
                            <button
                              type="button"
                              onClick={() => setSelectedMemberId(g.id)}
                              className="flex w-full items-center gap-2 mb-2 text-left group/hdr"
                            >
                              {g.id === '__unassigned' ? (
                                <span className="w-[22px] h-[22px] rounded-full bg-slate-100 text-slate-400 text-[11px] font-bold flex items-center justify-center shrink-0">
                                  ?
                                </span>
                              ) : (
                                <UserAvatar userId={g.id} name={g.name} size={22} />
                              )}
                              <span className="text-sm font-bold text-slate-800 dark:text-white/85 group-hover/hdr:text-brand-700">
                                {g.name}
                              </span>
                              <span className="text-[11px] text-slate-400">
                                {workFilter === 'open' || workFilter === 'overdue'
                                  ? `${g.tasks.length} ${workFilter}`
                                  : `${open} open · ${g.tasks.length} shown`}
                                {overdue > 0 && workFilter !== 'overdue' && (
                                  <span className="text-red-500 font-semibold"> · {overdue} overdue</span>
                                )}
                              </span>
                              <ChevronRight size={14} className="ml-auto text-slate-300 group-hover/hdr:text-brand-500" />
                            </button>
                            <div className="divide-y divide-slate-100 dark:divide-white/[0.05] pl-0.5">
                              {g.tasks.map((t: any) => (
                                <TeamTaskRow key={t.id} t={t} showAssignee={false} />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-white/[0.05]">
                  {filteredWork.map((t: any) => (
                    <TeamTaskRow key={t.id} t={t} showAssignee={isLead && !selectedMemberId} />
                  ))}
                  {filteredWork.length === 0 && (
                    <div className="text-center py-10">
                      <div className="text-sm font-semibold text-slate-600 dark:text-white/70">
                        {workFilter === 'open' ? 'No open tasks here' : 'Nothing matches this filter'}
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        {selectedMemberId
                          ? 'Try another person or switch to All / Done.'
                          : 'You have no tasks in this team yet.'}
                      </p>
                      {selectedMemberId && (
                        <button
                          type="button"
                          className="mt-3 text-xs font-semibold text-brand-600"
                          onClick={() => setSelectedMemberId(null)}
                        >
                          Back to everyone
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}


          {/* ── QMS — quality tracking (CSV Activity), opt-in per team ──────── */}
          {WORKBENCH_MODULES_ENABLED && view === 'qms' && team.modules?.qms?.enabled && (
            <QmsPanel teamId={id} isLead={isLead} />
          )}

          {/* ── Tickets — support request queue, opt-in per team ───────────── */}
          {WORKBENCH_MODULES_ENABLED && view === 'tickets' && team.modules?.tickets?.enabled && (
            <TicketsPanel teamId={id} isLead={isLead} members={team.members || []} />
          )}

          {/* ── Recurring — scheduled team activities, opt-in per team ──────── */}
          {WORKBENCH_MODULES_ENABLED && view === 'recurring' && team.modules?.recurring?.enabled && (
            <RecurringPanel teamId={id} isLead={isLead} members={team.members || []} />
          )}

          {view === 'projects' && (
            <div className="space-y-4">
              {(() => {
                const projs = team.projects || [];
                const total = projs.reduce((s: number, p: any) => s + (p.taskCount || 0), 0);
                const done = projs.reduce((s: number, p: any) => s + (p.tasksDone || 0), 0);
                const active = projs.filter((p: any) => p.status === 'in_progress').length;
                const pct = total ? Math.round((done / total) * 100) : 0;
                if (projs.length === 0) {
                  return (
                    <Card title="Projects">
                      <div className="text-center py-10 text-sm text-slate-400">
                        No projects on this team yet.
                      </div>
                    </Card>
                  );
                }
                return (
                  <Card title="Team progress">
                    <div className="flex items-center justify-between gap-3 mb-2 text-sm">
                      <span className="text-slate-500">
                        <strong className="text-slate-800 dark:text-white/85">{projs.length}</strong> project
                        {projs.length === 1 ? '' : 's'} · {active} active
                      </span>
                      <span className="text-slate-500">
                        <strong className="text-slate-800 dark:text-white/85 tabular-nums">{done}</strong>/
                        {total} tasks done ·{' '}
                        <strong className="text-blue-600 dark:text-blue-400 tabular-nums">{pct}%</strong>
                      </span>
                    </div>
                    <ProgressBar value={pct} />
                  </Card>
                );
              })()}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(team.projects || []).map((p: any) => {
                  const pct = p.taskCount ? Math.round((p.tasksDone / p.taskCount) * 100) : 0;
                  const remaining = Math.max(0, (p.taskCount || 0) - (p.tasksDone || 0));
                  return (
                    <Link
                      href={`/projects/${p.id}`}
                      key={p.id}
                      className="card p-4 hover:shadow-md hover:border-brand-200 transition group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[11px] font-mono text-slate-400 truncate">
                            {p.ccNo || p.code}
                          </div>
                          <div className="font-semibold text-slate-900 dark:text-white/90 group-hover:text-brand-700 truncate">
                            {p.name}
                          </div>
                        </div>
                        <ChevronRight
                          size={16}
                          className="shrink-0 text-slate-300 group-hover:text-brand-500 mt-1"
                        />
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <LifecycleTag lifecycle={p.lifecycle} />
                        <StatusTag status={p.status} />
                      </div>
                      <div className="mt-3">
                        <div className="flex justify-between text-[11px] text-slate-500 mb-1">
                          <span className="tabular-nums">
                            {p.tasksDone}/{p.taskCount}
                            {remaining > 0 && (
                              <span className="text-slate-400"> · {remaining} open</span>
                            )}
                          </span>
                          <span className="font-semibold tabular-nums text-slate-600">{pct}%</span>
                        </div>
                        <ProgressBar value={pct} />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
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
