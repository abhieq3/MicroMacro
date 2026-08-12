'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ModalPortal } from '@/components/ModalPortal';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import { useLiveRefresh } from '@/lib/client/useLiveRefresh';
import { Avatar } from '@/components/ui';
import { Select } from '@/components/Select';
import { UserAvatar } from '@/components/AvatarRegistry';
import {
  Pencil,
  Plus,
  Users as UsersIcon,
  X,
  Check,
  Trash2,
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Search,
} from 'lucide-react';

interface TeamModules {
  qms: { enabled: boolean };
  tickets: { enabled: boolean };
  recurring: { enabled: boolean };
}

interface TeamItem {
  id: string;
  name: string;
  description?: string;
  leadId?: string;
  function: string;
  memberIds: string[];
  memberCount: number;
  projectCount: number;
  modules?: TeamModules;
}

interface UserItem {
  id: string;
  name: string;
  role: string;
  title?: string;
  // Directory facets — used to group + filter the member picker so the team
  // lead can find people inside a large workspace without endless scrolling.
  department?: string;
  organisation?: string;
  location?: string;
}

const FUNCTION_LABEL: Record<string, string> = {
  rtb: 'Run the Business',
  ctb: 'Change the Business',
  general: 'General',
  csv_validation: 'CSV / Validation',
  data_integrity: 'Data Integrity',
  pharmacovigilance: 'Pharmacovigilance',
  lab_informatics: 'Lab Informatics',
  audit: 'Audit',
  training: 'Training',
};

const FUNCTION_TONE: Record<string, { bg: string; text: string; border: string }> = {
  rtb: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  ctb: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  general: { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' },
  csv_validation: { bg: 'bg-brand-50', text: 'text-brand-700', border: 'border-brand-200' },
  data_integrity: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  pharmacovigilance: { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' },
  lab_informatics: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' },
  audit: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  training: { bg: 'bg-forest-50', text: 'text-forest-700', border: 'border-forest-200' },
};

export default function TeamsClient({
  initialTeams,
  initialUsers,
  me,
}: {
  initialTeams: TeamItem[];
  initialUsers: UserItem[];
  me: { id: string; name: string; role: string } | null;
}) {
  const [teams, setTeams] = useState<TeamItem[]>(initialTeams);
  const [users] = useState<UserItem[]>(initialUsers);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TeamItem | null>(null);
  const [deleting, setDeleting] = useState<TeamItem | null>(null);

  function load() {
    api<TeamItem[]>('/teams')
      .then(setTeams)
      .catch(() => {});
  }

  // Realtime: refresh team rollups on focus / interval / app-wide changes.
  useLiveRefresh(load); // eslint-disable-line react-hooks/exhaustive-deps

  const canManage = me?.role === 'lead' || me?.role === 'admin';
  const uMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const filtered = teams;

  return (
    <div className="space-y-5 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap pt-1">
        <div>
          <h1 className="page-title">Teams</h1>
          <p className="text-sm text-slate-500 dark:text-white/40 mt-1">
            Cross-functional groups — people, projects, and shared accountability.
          </p>
        </div>
        {canManage && (
          <button className="btn-primary flex items-center gap-1.5" onClick={() => setCreating(true)}>
            <Plus size={14} /> New team
          </button>
        )}
      </div>

      {/* Cards grid */}
      {filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center mb-4">
            <UsersIcon size={22} className="text-blue-400" />
          </div>
          <div className="text-sm font-bold text-slate-700 dark:text-white/80 mb-1">No teams yet</div>
          <div className="text-xs text-slate-400 dark:text-white/35 mb-4">
            {canManage
              ? 'Group people around a shared mission — then attach projects to it.'
              : 'Your workspace admin or team lead creates teams; you will see yours here.'}
          </div>
          {teams.length === 0 && canManage && (
            <button className="btn-primary text-sm gap-2 inline-flex" onClick={() => setCreating(true)}>
              <Plus size={14} /> Create your first team
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
          {filtered.map((t) => (
            <TeamCard
              key={t.id}
              team={t}
              lead={t.leadId ? uMap.get(t.leadId) : undefined}
              members={(t.memberIds || []).map((id) => uMap.get(id)).filter(Boolean) as UserItem[]}
              canManage={me?.role === 'admin' || (!!t.leadId && t.leadId === me?.id)}
              onEdit={() => setEditing(t)}
              onDelete={() => setDeleting(t)}
            />
          ))}
        </div>
      )}

      {creating && (
        <TeamFormModal
          mode="create"
          users={users}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            load();
          }}
        />
      )}
      {editing && (
        <TeamFormModal
          mode="edit"
          team={editing}
          users={users}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
      {deleting && (
        <DeleteTeamModal
          team={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            load();
          }}
        />
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Team card — name, function tag, lead avatar, member stack, counts, edit.
   ────────────────────────────────────────────────────────────────────────── */
function TeamCard({
  team,
  lead,
  members,
  canManage,
  onEdit,
  onDelete,
}: {
  team: TeamItem;
  lead?: UserItem;
  members: UserItem[];
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const tone = FUNCTION_TONE[team.function] || FUNCTION_TONE.general;
  const visibleMembers = members.slice(0, 4);
  const extra = Math.max(0, members.length - visibleMembers.length);

  return (
    <div className="card p-5 group hover:shadow-md hover:-translate-y-0.5 transition-[transform,box-shadow] flex flex-col min-h-[180px]">
      {/* Top row: avatar + name + function tag + manage actions */}
      <div className="flex items-start gap-4">
        <Avatar name={team.name} size={48} />
        <div className="flex-1 min-w-0">
          <Link
            href={`/teams/${team.id}`}
            className="font-bold text-[17px] text-slate-900 dark:text-white/90 hover:text-brand-700 dark:hover:text-blue-400 truncate block leading-snug transition-colors"
          >
            {team.name}
          </Link>
          <span
            className={`inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${tone.bg} ${tone.text} ${tone.border}`}
          >
            {FUNCTION_LABEL[team.function] || team.function}
          </span>
        </div>
        {canManage && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button
              onClick={onEdit}
              className="p-1.5 rounded-md text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
              aria-label="Edit team"
              title="Edit team"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              aria-label="Delete team"
              title="Delete team"
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>

      {team.description && (
        <p className="mt-3 text-[13px] text-slate-500 dark:text-white/40 line-clamp-2 leading-relaxed">
          {team.description}
        </p>
      )}

      <div className="mt-3 text-[11px] text-slate-400 dark:text-white/35">
        <span className="font-semibold uppercase tracking-wider">Team Owner · </span>
        <span className="text-slate-600 dark:text-white/60 font-medium">{lead?.name || 'Unassigned'}</span>
      </div>

      {/* Member rail */}
      <div className="mt-4 flex items-center -space-x-2">
        {visibleMembers.length === 0 ? (
          <span className="text-[11px] text-slate-400 italic">No members yet</span>
        ) : (
          visibleMembers.map((m) => (
            <div
              key={m.id}
              title={m.name}
              className="w-8 h-8 rounded-full overflow-hidden ring-2 ring-white dark:ring-[#262624] bg-white relative"
            >
              <UserAvatar userId={m.id} name={m.name} size={32} />
            </div>
          ))
        )}
        {extra > 0 && (
          <div className="w-8 h-8 rounded-full ring-2 ring-white dark:ring-[#262624] bg-slate-100 text-[11px] font-bold text-slate-600 flex items-center justify-center">
            +{extra}
          </div>
        )}
      </div>

      {/* Footer — same structure as project card's bottom-meta row */}
      <div className="mt-auto pt-4 border-t border-slate-100 dark:border-white/[0.05] flex items-center justify-between gap-3">
        <span className="text-[13px] text-slate-500 dark:text-white/40 tabular-nums">
          <strong className="text-slate-700 dark:text-white/80 font-semibold">{team.memberCount}</strong>{' '}
          member{team.memberCount !== 1 ? 's' : ''}
          <span className="text-slate-300 dark:text-white/20 mx-1.5">·</span>
          <strong className="text-slate-700 dark:text-white/80 font-semibold">
            {team.projectCount}
          </strong>{' '}
          project{team.projectCount !== 1 ? 's' : ''}
        </span>
        <Link
          href={`/teams/${team.id}`}
          className="group/cta inline-flex items-center gap-1 text-[12px] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
        >
          Open team
          <ArrowRight size={12} className="transition-transform group-hover/cta:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Create / Edit modal — same form for both flows.
   ────────────────────────────────────────────────────────────────────────── */
/* A quiet on/off row for an opt-in team capability. */
function ModuleToggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`w-full flex items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
        checked ? 'border-brand-300 bg-blue-50/50' : 'border-slate-200 hover:bg-slate-50'
      }`}
    >
      <span
        aria-hidden
        className={`mt-0.5 relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-brand-600' : 'bg-slate-300'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-800">{label}</span>
        <span className="block text-[11px] text-slate-500 leading-snug">{hint}</span>
      </span>
    </button>
  );
}

function TeamFormModal({
  mode,
  team,
  users,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit';
  team?: TeamItem;
  users: UserItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(team?.name || '');
  const [description, setDescription] = useState(team?.description || '');
  const [func, setFunc] = useState<string>(team?.function || 'general');
  const [qmsEnabled, setQmsEnabled] = useState<boolean>(!!team?.modules?.qms?.enabled);
  const [ticketsEnabled, setTicketsEnabled] = useState<boolean>(!!team?.modules?.tickets?.enabled);
  const [recurringEnabled, setRecurringEnabled] = useState<boolean>(
    !!team?.modules?.recurring?.enabled,
  );
  // Modules are an advanced, opt-in section — collapsed by default so the team
  // form stays focused. Auto-expanded when the team already has one enabled.
  const [modulesOpen, setModulesOpen] = useState<boolean>(
    !!(team?.modules?.qms?.enabled || team?.modules?.tickets?.enabled || team?.modules?.recurring?.enabled),
  );
  const [leadId, setLeadId] = useState(team?.leadId || '');
  const [memberIds, setMemberIds] = useState<string[]>(team?.memberIds || []);
  const [memberQuery, setMemberQuery] = useState('');
  // Optional org/department filter chips so a lead can narrow a large
  // workspace before scrolling. '' means "all".
  const [groupFilter, setGroupFilter] = useState<string>('');
  // Which dimension we group by — organisation if any user has one, else
  // department, else flat. Auto-detected once on mount; admins can flip.
  const groupBy: 'organisation' | 'department' | null = useMemo(() => {
    if (users.some((u) => u.organisation)) return 'organisation';
    if (users.some((u) => u.department)) return 'department';
    return null;
  }, [users]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const candidateUsers = users.filter((u) => {
    if (u.role === 'admin') return false;
    if (groupFilter && groupBy && ((u as any)[groupBy] || '') !== groupFilter) return false;
    if (!memberQuery.trim()) return true;
    const q = memberQuery.toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      (u.title || '').toLowerCase().includes(q) ||
      (u.department || '').toLowerCase().includes(q) ||
      (u.organisation || '').toLowerCase().includes(q)
    );
  });

  // Group available people by the chosen dimension for scannable headers.
  // Falls back to a single "All people" bucket if nothing's set yet.
  const groups: Array<{ label: string; users: UserItem[] }> = useMemo(() => {
    if (!groupBy) return [{ label: 'All people', users: candidateUsers }];
    const map = new Map<string, UserItem[]>();
    for (const u of candidateUsers) {
      const key = ((u as any)[groupBy] || '').trim() || 'Unassigned';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(u);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => (a === 'Unassigned' ? 1 : b === 'Unassigned' ? -1 : a.localeCompare(b)))
      .map(([label, us]) => ({ label, users: us }));
  }, [candidateUsers, groupBy]);

  // Top-level filter chips (one per distinct organisation/department).
  const facets: string[] = useMemo(() => {
    if (!groupBy) return [];
    return Array.from(
      new Set(
        users
          .filter((u) => u.role !== 'admin')
          .map((u) => ((u as any)[groupBy] || '').trim())
          .filter(Boolean),
      ),
    ).sort();
  }, [users, groupBy]);

  function toggleMember(id: string) {
    setMemberIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function save() {
    if (!name.trim()) {
      setError('Team name is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (mode === 'create') {
        await api('/teams', {
          method: 'POST',
          body: {
            name: name.trim(),
            description: description || undefined,
            leadId: leadId || undefined,
            memberIds: memberIds.length ? memberIds : undefined,
            function: func,
            modules: {
              qms: { enabled: qmsEnabled },
              tickets: { enabled: ticketsEnabled },
              recurring: { enabled: recurringEnabled },
            },
          },
        });
      } else if (team) {
        await api(`/teams/${team.id}`, {
          method: 'PATCH',
          body: {
            name: name.trim(),
            description,
            leadId: leadId || null,
            memberIds,
            function: func,
            modules: {
              qms: { enabled: qmsEnabled },
              tickets: { enabled: ticketsEnabled },
              recurring: { enabled: recurringEnabled },
            },
          },
        });
      }
      onSaved();
    } catch (e: any) {
      setError(e?.message || 'Could not save team');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 overflow-y-auto bg-black/45 overlay-in" onClick={onClose}>
        <div className="flex min-h-full items-center justify-center p-4">
          <div
            className="rounded-2xl shadow-2xl w-full max-w-xl modal-in overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="relative px-5 py-5 text-white overflow-hidden"
              style={{ background: 'linear-gradient(135deg, #0f4fb8 0%, #1769c8 45%, #2b8c47 100%)' }}
            >
              <div
                aria-hidden
                className="absolute inset-0 opacity-20"
                style={{
                  backgroundImage:
                    'linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)',
                  backgroundSize: '22px 22px',
                }}
              />
              <div className="relative flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
                    <UsersIcon size={18} />
                  </div>
                  <div>
                    <h2 className="text-lg font-black leading-tight">
                      {mode === 'create' ? 'Create a team' : 'Edit team'}
                    </h2>
                    <p className="text-xs text-white/70 mt-0.5">
                      {mode === 'create'
                        ? 'Name it, pick a function, add your people.'
                        : 'Update team details and membership.'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="bg-white p-5 space-y-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Team name <span className="text-red-500">*</span>
                </label>
                <input
                  className="input"
                  placeholder="e.g. Platform Team"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  maxLength={120}
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Description
                </label>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="What does this team focus on?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={2000}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Function
                  </label>
                  <Select
                    value={func}
                    onChange={setFunc}
                    ariaLabel="Function"
                    options={[
                      { value: 'general', label: 'General' },
                      { value: 'ctb', label: 'Change the Business' },
                      { value: 'rtb', label: 'Run the Business' },
                    ]}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Team owner
                  </label>
                  <Select
                    value={leadId}
                    onChange={setLeadId}
                    ariaLabel="Team owner"
                    placeholder="— No owner —"
                    options={[
                      { value: '', label: '— No owner —' },
                      ...users.filter((u) => u.role === 'lead').map((u) => ({ value: u.id, label: u.name })),
                    ]}
                  />
                </div>
              </div>

              {/* Opt-in capabilities — collapsed by default and off until the
                  owner expands and turns one on, so the form stays focused. */}
              <div>
                <button
                  type="button"
                  onClick={() => setModulesOpen((o) => !o)}
                  className="w-full flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600 mb-1.5"
                >
                  {modulesOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  Modules
                  {!modulesOpen &&
                    (() => {
                      const n = [qmsEnabled, ticketsEnabled, recurringEnabled].filter(Boolean).length;
                      return (
                        <span className="normal-case font-normal text-slate-300">
                          {n > 0 ? `${n} on` : 'optional add-ons'}
                        </span>
                      );
                    })()}
                </button>
                {modulesOpen && (
                  <div className="space-y-2">
                    <ModuleToggle
                      label="Quality (QMS) tracking"
                      hint="A configurable tracker — define your own columns to follow records through any process."
                      checked={qmsEnabled}
                      onChange={setQmsEnabled}
                    />
                    <ModuleToggle
                      label="Support tickets"
                      hint="A lightweight request queue for this team."
                      checked={ticketsEnabled}
                      onChange={setTicketsEnabled}
                    />
                    <ModuleToggle
                      label="Recurring activities"
                      hint="Scheduled chores that repeat (e.g. monthly downtime) with a checklist that resets each cycle."
                      checked={recurringEnabled}
                      onChange={setRecurringEnabled}
                    />
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Members{' '}
                    <span className="text-slate-400 normal-case font-normal">
                      ({memberIds.length} selected)
                    </span>
                  </label>
                  {memberIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setMemberIds([])}
                      className="text-[11px] text-slate-400 hover:text-slate-600"
                    >
                      Clear all
                    </button>
                  )}
                </div>
                <div className="relative mb-2">
                  <Search size={13} className="absolute top-1/2 -translate-y-1/2 left-3 text-slate-400" />
                  <input
                    className="input pl-9 text-sm"
                    placeholder={`Search by name, title${groupBy ? `, ${groupBy}` : ''}…`}
                    value={memberQuery}
                    onChange={(e) => setMemberQuery(e.target.value)}
                  />
                </div>
                {/* Filter chips for the chosen group dimension — scales the picker
                gracefully as the workspace grows. Hidden when there's nothing
                to slice (single-org or no facets set). */}
                {facets.length > 1 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    <button
                      type="button"
                      onClick={() => setGroupFilter('')}
                      className={`text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors ${
                        groupFilter === ''
                          ? 'bg-brand-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      All {groupBy === 'organisation' ? 'orgs' : 'departments'}
                    </button>
                    {facets.map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setGroupFilter(f === groupFilter ? '' : f)}
                        className={`text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors ${
                          groupFilter === f
                            ? 'bg-brand-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                )}
                <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-lg">
                  {candidateUsers.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-400">No people match.</div>
                  ) : (
                    groups.map((g) => {
                      const visible = g.users.filter((u) => u.id !== leadId);
                      if (visible.length === 0) return null;
                      return (
                        <div key={g.label}>
                          {/* Group header — only render when grouping is active and
                          there's more than one bucket worth showing. */}
                          {groupBy && groups.length > 1 && (
                            <div className="sticky top-0 z-[1] bg-slate-50 border-b border-slate-200 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
                              <span className="truncate">{g.label}</span>
                              <span className="text-slate-400 font-medium">{visible.length}</span>
                            </div>
                          )}
                          <div className="divide-y divide-slate-100">
                            {visible.map((u) => {
                              const selected = memberIds.includes(u.id);
                              return (
                                <button
                                  key={u.id}
                                  type="button"
                                  onClick={() => toggleMember(u.id)}
                                  className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                                    selected ? 'bg-brand-50/60 hover:bg-brand-50' : 'hover:bg-slate-50'
                                  }`}
                                >
                                  <UserAvatar userId={u.id} name={u.name} size={26} />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-slate-800 truncate">
                                      {u.name}
                                    </div>
                                    <div className="text-[11px] text-slate-400 truncate">
                                      {[
                                        u.role === 'lead'
                                          ? 'Team Lead'
                                          : u.role === 'admin'
                                            ? 'Admin'
                                            : 'Individual Contributor',
                                        u.title,
                                        u.department,
                                      ]
                                        .filter(Boolean)
                                        .join(' · ')}
                                    </div>
                                  </div>
                                  <div
                                    className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors ${
                                      selected ? 'bg-brand-600 text-white' : 'border border-slate-300'
                                    }`}
                                  >
                                    {selected && <Check size={12} />}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                {leadId && !memberIds.includes(leadId) && (
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    The owner is automatically added as a team member when you save.
                  </p>
                )}
              </div>

              {error && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}
            </div>

            <div className="sticky bottom-0 bg-white border-t border-slate-100 px-5 py-3 flex justify-end gap-2">
              <button onClick={onClose} className="btn-ghost" disabled={saving}>
                Cancel
              </button>
              <button onClick={save} className="btn-primary" disabled={saving || !name.trim()}>
                {saving ? 'Saving…' : mode === 'create' ? 'Create team' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Delete confirmation — password re-entry (21 CFR 11 audit intent).
   ────────────────────────────────────────────────────────────────────────── */
function DeleteTeamModal({
  team,
  onClose,
  onDeleted,
}: {
  team: TeamItem;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function confirm() {
    if (!password) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/teams/${team.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.status === 401) {
        setError('Incorrect password — try again.');
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || 'Could not delete team.');
        return;
      }
      onDeleted();
    } catch (e: any) {
      setError(e?.message || 'Network error.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 overlay-in"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-md modal-in"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-5 pt-5 pb-3 flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
              <AlertTriangle size={18} className="text-red-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-black text-slate-900">Delete team?</h2>
              <p className="text-sm text-slate-500 mt-1 leading-snug">
                <span className="font-semibold text-slate-700">{team.name}</span> will be permanently removed.
                Any projects linked to this team will be detached but their tasks and history will be kept
                intact.
              </p>
            </div>
          </div>

          <div className="px-5 pb-5 space-y-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Confirm with your password
              </label>
              <input
                ref={inputRef}
                type="password"
                className="input"
                placeholder="Your account password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirm();
                }}
                autoComplete="current-password"
              />
            </div>
            {error && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 px-5 py-3 flex justify-end gap-2">
            <button onClick={onClose} className="btn-ghost" disabled={busy}>
              Cancel
            </button>
            <button
              onClick={confirm}
              disabled={busy || !password}
              className="px-3 py-1.5 rounded-lg text-sm font-bold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? 'Deleting…' : 'Delete permanently'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
