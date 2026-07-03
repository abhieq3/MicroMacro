'use client';
import { useEffect, useRef, useState } from 'react';
import { ModalPortal } from '@/components/ModalPortal';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client/api';
import { useIsLead } from '@/components/CurrentUserContext';
import {
  Plus,
  X,
  GripVertical,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Trash2,
  BookmarkPlus,
  Lock,
  Pencil,
  CalendarClock,
} from 'lucide-react';
import { DatePicker } from '@/components/DatePicker';
import { Select } from '@/components/Select';
import { clearSidebarCalendarCache } from '@/components/SidebarCalendar';

/* ── Types ────────────────────────────────────────────────────────────────── */
interface PhaseTask {
  id: string;
  title: string;
  assigneeId?: string;
  startDate?: string;
  dueDate?: string;
}
interface Phase {
  id: string;
  name: string;
  tasks: PhaseTask[];
}

interface Member {
  id: string;
  name: string;
}

interface CustomTemplate {
  id: string;
  name: string;
  description: string;
  createdBy: string;
  createdByName: string;
  phases: Array<{ name: string; tasks: Array<{ title: string; type?: string }> }>;
  createdAt: string;
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function uid() {
  return Math.random().toString(36).slice(2, 9);
}

// Templates a lead reaches for, ordered by frequency. Generic 'Custom / Blank'
// is always the first option so a lead can start fast with a project that
// doesn't match any pre-baked template.
const LIFECYCLE_GROUPS = [
  {
    label: 'Change Management',
    description: 'Plan and control changes',
    options: [
      { value: 'generic', label: 'Custom / Blank', hint: 'Start from scratch' },
      { value: 'change_control', label: 'Change Control', hint: 'Planned change to a system' },
      { value: 'software_change', label: 'Software Change', hint: 'Code/configuration release with a review gate' },
      { value: 'deviation', label: 'Deviation', hint: 'Unplanned event needing investigation' },
      { value: 'capa', label: 'CAPA', hint: 'Corrective + preventive action' },
      { value: 'deviation_capa', label: 'Deviation + CAPA', hint: 'Combined deviation→CAPA flow' },
    ],
  },
  {
    label: 'Life Sciences',
    description: 'Regulated / GxP lifecycles',
    options: [
      { value: 'csv', label: 'CSV / GAMP 5', hint: 'Computer System Validation' },
      { value: 'sop', label: 'SOP Development', hint: 'Author → review → train → release' },
      { value: 'audit', label: 'Audit', hint: 'Internal or external audit' },
      { value: 'validation', label: 'Validation', hint: 'Process / method validation' },
      {
        value: 'regulatory_submission',
        label: 'Regulatory Submission',
        hint: 'Planning → dossier → filing → approval',
      },
      {
        value: 'computer_system_retirement',
        label: 'System Retirement',
        hint: 'Feasibility → migration → closure',
      },
      { value: 'incident_management', label: 'Incident Management', hint: 'Triage → RCA → CAPA → closure' },
      { value: 'vendor_qualification', label: 'Vendor Qualification', hint: 'Audit → gap assessment → ASL' },
      { value: 'training_program', label: 'Training Program', hint: 'Needs assessment → rollout → review' },
      { value: 'product_recall', label: 'Product Recall', hint: 'Alert → notification → prevention' },
      { value: 'discrepancy_qi', label: 'Discrepancy', hint: 'Detection → RCA → CAPA → closure' },
    ],
  },
  {
    label: 'General',
    description: 'Everyday projects',
    options: [
      { value: 'agile_sprint', label: 'Agile Sprint', hint: 'Two-week development iteration' },
      { value: 'software_release', label: 'Software Release', hint: 'Generic release pipeline' },
      { value: 'product_launch', label: 'Product Launch', hint: 'Go-to-market workflow' },
      { value: 'research', label: 'Research', hint: 'Scoping → analysis → reporting' },
    ],
  },
  {
    // Surfaced only when the "Personal project" toggle is on — purely
    // personal templates, no QA/GxP framing, so the user can move fast.
    label: 'Personal',
    description: 'Ready-made for your own goals',
    options: [
      { value: 'personal_goal', label: 'Personal Goal', hint: 'Define → plan → do → reflect' },
      { value: 'personal_career', label: 'Career Growth', hint: 'Grow in your role, step up' },
      { value: 'personal_job_search', label: 'Job Search', hint: 'Target → apply → interview → offer' },
      { value: 'personal_study', label: 'Study Plan', hint: 'Course / certification roadmap' },
      { value: 'personal_reading', label: 'Reading Challenge', hint: 'Curate → read → reflect' },
      { value: 'personal_habit', label: 'Habit Tracker', hint: '30-day habit build' },
      { value: 'personal_fitness', label: 'Fitness Plan', hint: 'Baseline → build → sustain' },
      { value: 'personal_wellness', label: 'Wellness & Mindfulness', hint: 'Calmer, healthier routine' },
      { value: 'personal_finance', label: 'Financial Goal', hint: 'Save, pay off, or invest' },
      { value: 'personal_side_project', label: 'Side Project', hint: 'Idea → build → ship → iterate' },
      { value: 'personal_creative', label: 'Creative Project', hint: 'Write, record or make — to published' },
      { value: 'personal_declutter', label: 'Declutter & Organise', hint: 'Clear the clutter, room by room' },
    ],
  },
];

function phasesFromTemplate(template: any): Phase[] {
  if (!template?.phases) return [];
  return template.phases.map((ph: any) => ({
    id: uid(),
    name: ph.name,
    tasks: ph.tasks.map((t: any) => ({ id: uid(), title: typeof t === 'string' ? t : t.title })),
  }));
}

function phasesFromCustomTemplate(template: CustomTemplate): Phase[] {
  return template.phases.map((ph) => ({
    id: uid(),
    name: ph.name,
    // Tolerate legacy templates that stored tasks as bare strings.
    tasks: ph.tasks.map((t: any) => ({ id: uid(), title: typeof t === 'string' ? t : t.title })),
  }));
}

// Build the phase editor from a *running* project's structure (its phases plus
// the task titles grouped under each, in board order). We copy the workflow
// shape only — not assignees, dates or status — so the new project starts as a
// clean instance of the same process. The source detail is the GET /projects/:id
// payload (phases: [{id,name,position}], tasks: [{phaseId,title,position}]).
function phasesFromProjectDetail(detail: any): Phase[] {
  const phases: any[] = [...(detail?.phases || [])].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0),
  );
  const tasks: any[] = [...(detail?.tasks || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const byPhase = new Map<string, any[]>();
  const orphans: any[] = [];
  for (const t of tasks) {
    if (t.phaseId && phases.some((p) => p.id === t.phaseId)) {
      (byPhase.get(t.phaseId) || byPhase.set(t.phaseId, []).get(t.phaseId)!).push(t);
    } else {
      orphans.push(t);
    }
  }
  const out: Phase[] = phases.map((ph) => ({
    id: uid(),
    name: ph.name,
    tasks: (byPhase.get(ph.id) || []).map((t) => ({ id: uid(), title: t.title })),
  }));
  // Tasks with no phase still belong to the workflow — keep them in a catch-all
  // stage so nothing is silently dropped on import.
  if (orphans.length) {
    out.push({ id: uid(), name: 'Other', tasks: orphans.map((t) => ({ id: uid(), title: t.title })) });
  }
  return out;
}

/* ── Save-as-template / edit-template dialog ─────────────────────────────────
   Doubles as the "Save as template" (create) and "Edit template" (update)
   dialog — when `editingTemplate` is provided, the form is pre-filled and
   submitting PATCHes that template (name, description, and the current
   phase-editor stages) instead of creating a new one. ────────────────────── */
function SaveTemplateDialog({
  phases,
  editingTemplate,
  onClose,
  onSaved,
}: {
  phases: Phase[];
  editingTemplate?: CustomTemplate | null;
  onClose: () => void;
  onSaved: (t: CustomTemplate) => void;
}) {
  const [name, setName] = useState(editingTemplate?.name || '');
  const [description, setDescription] = useState(editingTemplate?.description || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    if (!name.trim()) {
      setErr('Template name is required.');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        phases: phases.map((ph) => ({
          name: ph.name,
          tasks: ph.tasks.map((t) => ({ title: t.title })),
        })),
      };
      const saved = editingTemplate
        ? await api<CustomTemplate>(`/workflow-templates/${editingTemplate.id}`, {
            method: 'PATCH',
            body: payload,
          })
        : await api<CustomTemplate>('/workflow-templates', { method: 'POST', body: payload });
      onSaved(saved);
    } catch (e: any) {
      setErr(e.message || 'Failed to save template.');
      setSaving(false);
    }
  }

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-800">
              {editingTemplate ? 'Edit template' : 'Save as template'}
            </h2>
            <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 transition-colors">
              <X size={16} />
            </button>
          </div>
          <p className="text-xs text-slate-500">
            {editingTemplate
              ? `Update the name, description, and stages — saving applies the current ${phases.length} stage${phases.length === 1 ? '' : 's'} to this template for everyone.`
              : `Save the current ${phases.length} stage${phases.length === 1 ? '' : 's'} as a reusable workspace template. Everyone on the team can use it.`}
          </p>
          <div>
            <label className="label">Template name *</label>
            <input
              className="input"
              placeholder="e.g. Standard CSV Validation"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="label">
              Description <span className="normal-case font-normal text-slate-300">(optional)</span>
            </label>
            <textarea
              className="textarea"
              rows={2}
              placeholder="What is this template for?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
          <div className="flex items-center gap-3 pt-1">
            <button onClick={save} disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : editingTemplate ? 'Save changes' : 'Save template'}
            </button>
            <button onClick={onClose} className="btn-secondary">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

/* ── Single task editor row ───────────────────────────────────────────────── */
function TaskRow({
  task,
  members,
  canSchedule,
  onChange,
  onRemove,
}: {
  task: PhaseTask;
  members: Member[];
  // Only team leads assign work and set dates at creation time. Contributors
  // (who can only create personal projects) just type task titles.
  canSchedule: boolean;
  onChange: (t: PhaseTask) => void;
  onRemove: () => void;
}) {
  // Per-task scheduling/assignment is opt-in: the row stays a single compact
  // line until the lead expands it, so a long stage list isn't a wall of date
  // pickers. We auto-open if the task already carries any of those details.
  const hasDetails = !!(task.assigneeId || task.startDate || task.dueDate);
  const [open, setOpen] = useState(hasDetails);

  const assigneeName = members.find((m) => m.id === task.assigneeId)?.name;
  // A small summary chip so collapsed rows still show what's been set.
  const summaryBits = [
    assigneeName,
    task.dueDate ? `due ${task.dueDate}` : task.startDate ? `from ${task.startDate}` : null,
  ].filter(Boolean);

  return (
    <div className="rounded-lg border border-transparent hover:border-slate-100 transition-colors">
      <div className="flex items-center gap-2 group">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
        <input
          value={task.title}
          onChange={(e) => onChange({ ...task, title: e.target.value })}
          className="flex-1 text-sm text-slate-600 bg-transparent outline-none border-b border-transparent focus:border-blue-300 transition-colors"
        />
        {canSchedule && !open && summaryBits.length > 0 && (
          <span className="text-[10px] text-slate-400 truncate max-w-[180px]">
            {summaryBits.join(' · ')}
          </span>
        )}
        {canSchedule && (
          <button
            onClick={() => setOpen((o) => !o)}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold transition-all ${
              open || hasDetails
                ? 'text-blue-600 bg-blue-50'
                : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'
            }`}
            title="Assign owner & set dates"
          >
            <CalendarClock size={12} />
            {open || hasDetails ? 'Assigned' : 'Assign'}
          </button>
        )}
        <button
          onClick={onRemove}
          className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-300 hover:text-red-500 transition-all"
        >
          <X size={11} />
        </button>
      </div>
      {canSchedule && open && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pl-3.5 pr-1 py-2">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Assignee
            </label>
            {members.length > 0 ? (
              <Select
                value={task.assigneeId || ''}
                onChange={(v) => onChange({ ...task, assigneeId: v || undefined })}
                ariaLabel="Assignee"
                placeholder="Unassigned"
                options={[
                  { value: '', label: 'Unassigned' },
                  ...members.map((m) => ({ value: m.id, label: m.name })),
                ]}
              />
            ) : (
              <div className="text-[11px] text-slate-300 mt-1">Pick a team first</div>
            )}
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Start
            </label>
            <DatePicker
              block
              placeholder="Start date"
              value={task.startDate || null}
              onChange={(v) => onChange({ ...task, startDate: v || undefined })}
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Due
            </label>
            <DatePicker
              block
              placeholder="Due date"
              value={task.dueDate || null}
              onChange={(v) => onChange({ ...task, dueDate: v || undefined })}
              minDate={task.startDate ? new Date(task.startDate) : undefined}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Phase editor row ─────────────────────────────────────────────────────── */
function PhaseRow({
  phase,
  index,
  total,
  members,
  canSchedule,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  phase: Phase;
  index: number;
  total: number;
  members: Member[];
  canSchedule: boolean;
  onChange: (p: Phase) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [open, setOpen] = useState(index < 3);
  const [newTask, setNewTask] = useState('');
  const taskRef = useRef<HTMLInputElement>(null);

  function addTask() {
    if (!newTask.trim()) return;
    onChange({ ...phase, tasks: [...phase.tasks, { id: uid(), title: newTask.trim() }] });
    setNewTask('');
    taskRef.current?.focus();
  }

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white transition-all">
      {/* Phase header */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50/80">
        <div className="flex flex-col gap-0.5 shrink-0 cursor-grab text-slate-300">
          <GripVertical size={14} />
        </div>
        <span className="text-xs font-bold text-slate-400 w-5 shrink-0">{index + 1}</span>
        <input
          className="flex-1 text-sm font-semibold text-slate-800 bg-transparent outline-none border-b border-transparent focus:border-blue-400 transition-colors placeholder:text-slate-300"
          value={phase.name}
          onChange={(e) => onChange({ ...phase, name: e.target.value })}
          placeholder="Stage name…"
        />
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            className="p-1 rounded text-slate-300 hover:text-slate-600 disabled:opacity-20 transition-colors"
            title="Move up"
          >
            ↑
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="p-1 rounded text-slate-300 hover:text-slate-600 disabled:opacity-20 transition-colors"
            title="Move down"
          >
            ↓
          </button>
          <button
            onClick={() => setOpen((o) => !o)}
            className="p-1 rounded text-slate-400 hover:text-slate-600 transition-colors"
          >
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <button
            onClick={onDelete}
            className="p-1 rounded text-slate-300 hover:text-red-500 transition-colors"
            title="Remove stage"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Tasks list */}
      {open && (
        <div className="px-4 py-3 space-y-1">
          {phase.tasks.map((task, ti) => (
            <TaskRow
              key={task.id}
              task={task}
              members={members}
              canSchedule={canSchedule}
              onChange={(t) =>
                onChange({ ...phase, tasks: phase.tasks.map((x, i) => (i === ti ? t : x)) })
              }
              onRemove={() => onChange({ ...phase, tasks: phase.tasks.filter((_, i) => i !== ti) })}
            />
          ))}
          <div className="flex items-center gap-2 mt-2">
            <Plus size={12} className="text-slate-300 shrink-0" />
            <input
              ref={taskRef}
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTask();
                }
              }}
              placeholder="Add task… (press Enter)"
              className="flex-1 text-xs text-slate-600 bg-transparent outline-none border-b border-transparent focus:border-blue-300 transition-colors placeholder:text-slate-300"
            />
            {newTask.trim() && (
              <button onClick={addTask} className="text-xs text-blue-600 font-semibold hover:underline">
                Add
              </button>
            )}
          </div>
          {phase.tasks.length === 0 && (
            <div className="text-[11px] text-slate-300 mt-1">No tasks yet — add some above</div>
          )}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   MAIN PAGE
════════════════════════════════════════════════════════════════════════════ */
export default function NewProjectPage() {
  const router = useRouter();
  // Contributors can only ever create *personal* projects (shared projects are
  // a lead/admin action). Rather than let them fill in the whole form and hit a
  // 403 on submit, we force the Personal toggle on and lock it for ICs.
  const isLead = useIsLead();

  // Every user can create a project; the Personal toggle decides whether it
  // is a shared team project or a private to-do list. There is no separate
  // entry point — one form, one toggle.
  // ICs start (and stay) in personal mode; leads/admins default to a shared
  // project and may flip the toggle.
  const [personal, setPersonal] = useState(!isLead);

  const [form, setForm] = useState({
    name: '',
    description: '',
    lifecycle: 'generic',
    priority: 'medium',
    gxpImpact: 'none',
    teamId: '',
    startDate: '',
    dueDate: '',
  });
  const [phases, setPhases] = useState<Phase[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  // Assignable members for the per-task assignee picker — populated from the
  // selected team. Personal projects have no team, so this stays empty and the
  // task rows fall back to "Pick a team first".
  const [members, setMembers] = useState<Member[]>([]);
  const [templateInfo, setTemplateInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [step, setStep] = useState<1 | 2>(1);

  // Custom templates state
  const [customTemplates, setCustomTemplates] = useState<CustomTemplate[]>([]);
  const [customTemplateId, setCustomTemplateId] = useState<string | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<CustomTemplate | null>(null);
  // Template list collapse — show only the first 6 built-in options by default
  const [showAllTemplates, setShowAllTemplates] = useState(false);
  // Current user id (populated from /auth/me once)
  const [currentUserId, setCurrentUserId] = useState<string>('');

  // "Start from an existing project" — clone a running project's workflow shape.
  const [projectList, setProjectList] = useState<any[]>([]);
  const [sourceProjectId, setSourceProjectId] = useState<string | null>(null);
  const [sourceProjectName, setSourceProjectName] = useState<string>('');
  const [importing, setImporting] = useState(false);

  // ── Draft auto-save ───────────────────────────────────────────────────────
  // A half-built project is real work — never lose it on an accidental nav or
  // refresh. The in-progress form + stages are auto-saved to local storage and
  // offered back on return; a beforeunload guard catches tab close / refresh.
  const DRAFT_KEY = 'pragati_new_project_draft';
  const suppressLifecycleFetch = useRef(false);
  const [restorable, setRestorable] = useState<any | null>(null);
  // Dirty = there's something worth keeping (a name or any stages).
  const dirty = !!(form.name.trim() || form.description.trim() || phases.length > 0);

  // Offer to restore a saved draft once on mount (never auto-apply — the user
  // chooses, so a fresh start is never silently overwritten).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && (d.form?.name?.trim() || (d.phases || []).length > 0)) setRestorable(d);
      }
    } catch {
      /* corrupt/blocked storage — just skip the offer */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save whenever there's work worth keeping.
  useEffect(() => {
    if (!dirty) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, phases, personal, savedAt: Date.now() }));
    } catch {
      /* storage full / disabled — best-effort */
    }
  }, [form, phases, personal, dirty]);

  // Catch tab close / refresh / external nav while there's unsaved work.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty && !loading) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty, loading]);

  function restoreDraft() {
    if (!restorable) return;
    suppressLifecycleFetch.current = true; // keep restored phases; don't refetch
    if (restorable.form) setForm(restorable.form);
    if (Array.isArray(restorable.phases)) setPhases(restorable.phases);
    if (typeof restorable.personal === 'boolean') setPersonal(restorable.personal);
    setRestorable(null);
  }
  function discardDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
    setRestorable(null);
  }
  function clearDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    api<any[]>('/teams')
      .then(setTeams)
      .catch(() => {});
    api<any>('/auth/me')
      .then((me) => {
        if (me?.user?.id) setCurrentUserId(me.user.id);
      })
      .catch(() => {});
    api<CustomTemplate[]>('/workflow-templates')
      .then(setCustomTemplates)
      .catch(() => {});
    api<any[]>('/projects')
      .then((ps) => setProjectList((ps || []).filter((p) => !p.archived)))
      .catch(() => {});
  }, []);

  // Only fetch built-in lifecycle data when no custom template is active.
  // selectCustomTemplate sets customTemplateId before (possibly) changing
  // form.lifecycle to 'generic', so checking customTemplateId here prevents
  // the effect from overwriting the custom phases on the same render batch.
  useEffect(() => {
    if (!form.lifecycle || customTemplateId || sourceProjectId) return;
    // Restoring a draft sets form.lifecycle, which would otherwise re-trigger
    // this fetch and clobber the restored (user-edited) phases. Skip exactly
    // one run after a restore.
    if (suppressLifecycleFetch.current) {
      suppressLifecycleFetch.current = false;
      return;
    }
    api<any>(`/lifecycles?key=${form.lifecycle}`)
      .then((t) => {
        setTemplateInfo(t);
        setPhases(phasesFromTemplate(t));
      })
      .catch(() => {});
  }, [form.lifecycle, customTemplateId, sourceProjectId]);

  // Load the selected team's members so tasks can be assigned during creation.
  // Cleared whenever there's no team (personal projects or "— Unassigned —").
  useEffect(() => {
    if (personal || !form.teamId) {
      setMembers([]);
      return;
    }
    let cancelled = false;
    api<any>(`/teams/${form.teamId}`)
      .then((t) => {
        if (!cancelled) setMembers(t.members || []);
      })
      .catch(() => {
        if (!cancelled) setMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [form.teamId, personal]);

  function up<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // Selecting a built-in lifecycle clears any active custom template first so
  // the effect above is free to fetch the template data.
  function selectBuiltInLifecycle(value: string) {
    setCustomTemplateId(null);
    setSourceProjectId(null);
    setTemplateInfo(null);
    up('lifecycle', value);
  }

  function selectCustomTemplate(t: CustomTemplate) {
    setCustomTemplateId(t.id);
    setSourceProjectId(null);
    setTemplateInfo(null);
    // Keep lifecycle as 'generic' so the submission payload stays valid.
    // Because customTemplateId is set first (in the same batch), the
    // useEffect above skips the fetch and leaves the custom phases intact.
    setForm((f) => ({ ...f, lifecycle: 'generic' }));
    setPhases(phasesFromCustomTemplate(t));
  }

  // Clone a running project's workflow into the editor. Like selectCustomTemplate
  // it pins lifecycle to 'generic' and clears the other sources first so the
  // built-in fetch effect leaves the imported phases alone.
  async function selectSourceProject(projId: string) {
    if (!projId) {
      setSourceProjectId(null);
      return;
    }
    setCustomTemplateId(null);
    setTemplateInfo(null);
    setSourceProjectId(projId);
    setForm((f) => ({ ...f, lifecycle: 'generic' }));
    setSourceProjectName(projectList.find((p) => p.id === projId)?.name || 'project');
    setImporting(true);
    try {
      const detail = await api<any>(`/projects/${projId}`);
      setSourceProjectName(detail?.name || projectList.find((p) => p.id === projId)?.name || 'project');
      setPhases(phasesFromProjectDetail(detail));
    } catch (e: any) {
      setErr(e?.message || 'Could not load that project’s workflow.');
      setSourceProjectId(null);
    } finally {
      setImporting(false);
    }
  }

  async function deleteCustomTemplate(id: string) {
    try {
      await api(`/workflow-templates/${id}`, { method: 'DELETE' });
      setCustomTemplates((ts) => ts.filter((t) => t.id !== id));
      if (customTemplateId === id) {
        setCustomTemplateId(null);
        setPhases([]);
      }
    } catch (e: any) {
      alert(e.message || 'Failed to delete template.');
    }
  }

  function addPhase() {
    setPhases((ps) => [...ps, { id: uid(), name: '', tasks: [] }]);
  }

  function updatePhase(id: string, p: Phase) {
    setPhases((ps) => ps.map((ph) => (ph.id === id ? p : ph)));
  }

  function deletePhase(id: string) {
    setPhases((ps) => ps.filter((ph) => ph.id !== id));
  }

  function movePhase(idx: number, dir: -1 | 1) {
    setPhases((ps) => {
      const next = [...ps];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return next;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }

  async function submit() {
    if (!form.name.trim()) {
      setErr('Project name is required.');
      return;
    }
    // A start date after the due date is almost always a typo and produces
    // nonsensical "behind pace" math downstream — catch it before the round-trip.
    if (form.startDate && form.dueDate && form.startDate > form.dueDate) {
      setErr('The start date is after the due date — please check the dates.');
      return;
    }
    setErr('');
    setLoading(true);
    // ICs may toggle off to *browse* lead workflows, but they can only ever
    // commit a personal project — so we force `personal` back on at submit
    // for non-leads to spare them a 403 round-trip. The backend still enforces
    // the same rule (defence in depth).
    const finalPersonal = isLead ? personal : true;
    try {
      const p = await api<any>('/projects', {
        method: 'POST',
        body: {
          name: form.name.trim(),
          description: form.description || undefined,
          lifecycle: form.lifecycle,
          priority: form.priority,
          gxpImpact: form.gxpImpact,
          personal: finalPersonal,
          teamId: finalPersonal ? undefined : form.teamId || undefined,
          startDate: form.startDate || undefined,
          dueDate: form.dueDate || undefined,
          useTemplate: false,
          // Drop blank phase names and empty task titles so an unfilled row
          // can't save a broken, nameless stage into the workflow.
          customPhases: phases
            .map((ph) => ({
              name: ph.name.trim(),
              tasks: (ph.tasks || [])
                .map((t) => ({
                  title: t.title.trim(),
                  // Only attach an assignee that's actually on the chosen team,
                  // so a stale pick from a previously-selected team is dropped.
                  assigneeId:
                    t.assigneeId && members.some((m) => m.id === t.assigneeId)
                      ? t.assigneeId
                      : undefined,
                  startDate: t.startDate || undefined,
                  dueDate: t.dueDate || undefined,
                }))
                .filter((t) => t.title),
            }))
            .filter((ph) => ph.name),
        },
      });
      // Bust the sidebar calendar cache so newly-added tasks appear immediately.
      clearSidebarCalendarCache();
      clearDraft(); // saved for real now — drop the local draft
      router.push(`/projects/${p.id}`);
    } catch (e: any) {
      setErr(e.message || 'Something went wrong.');
      setLoading(false);
    }
  }

  // The label shown in step 2 header
  const selectedCustomTemplate = customTemplateId
    ? customTemplates.find((t) => t.id === customTemplateId)
    : null;
  const lifecycleLabel = sourceProjectId
    ? `${sourceProjectName} (existing project)`
    : selectedCustomTemplate
      ? selectedCustomTemplate.name
      : (LIFECYCLE_GROUPS.flatMap((g) => g.options).find((o) => o.value === form.lifecycle)?.label ??
        form.lifecycle);

  // Whether the current lifecycle selection is a non-generic built-in
  const hasBuiltInLifecycle = form.lifecycle !== 'generic' && !customTemplateId && !sourceProjectId;

  return (
    <div className="max-w-3xl pb-20">
      {/* Unsaved-draft offer — a half-built project from a previous visit. */}
      {restorable && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-800">You have an unsaved project draft</div>
            <div className="text-xs text-slate-500 truncate">
              {restorable.form?.name?.trim() || 'Untitled'} ·{' '}
              {(restorable.phases || []).length} stage
              {(restorable.phases || []).length === 1 ? '' : 's'}
            </div>
          </div>
          <button
            onClick={restoreDraft}
            className="shrink-0 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg"
          >
            Restore
          </button>
          <button
            onClick={discardDraft}
            className="shrink-0 text-xs font-semibold text-slate-500 hover:text-red-600 px-2 py-1.5"
          >
            Discard
          </button>
        </div>
      )}

      {/* Save-as-template / edit-template dialog */}
      {showSaveDialog && (
        <SaveTemplateDialog
          phases={phases}
          editingTemplate={editingTemplate}
          onClose={() => {
            setShowSaveDialog(false);
            setEditingTemplate(null);
          }}
          onSaved={(saved) => {
            setCustomTemplates((ts) =>
              editingTemplate ? ts.map((t) => (t.id === saved.id ? saved : t)) : [saved, ...ts],
            );
            setShowSaveDialog(false);
            setEditingTemplate(null);
          }}
        />
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-6 pt-1">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">New project</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Step {step} of 2 — {step === 1 ? 'Project details' : 'Stages & workflow'}
          </p>
        </div>
        {/* Step pills */}
        <div className="ml-auto flex items-center gap-2">
          {[1, 2].map((s) => (
            <button
              key={s}
              onClick={() => step > s && setStep(s as 1 | 2)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
              style={{
                background: step === s ? '#1565C0' : step > s ? '#dcfce7' : '#f1f5f9',
                color: step === s ? '#fff' : step > s ? '#15803d' : '#94a3b8',
                cursor: step > s ? 'pointer' : 'default',
              }}
            >
              {step > s ? '✓' : s} {s === 1 ? 'Details' : 'Stages'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Step 1: Project details ─────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          {/* Name */}
          <div className="card p-5 space-y-4">
            <div>
              <label className="label">Project name *</label>
              <input
                className="input"
                placeholder="e.g. CSV Validation Q2 2026"
                value={form.name}
                onChange={(e) => up('name', e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="label">
                Description <span className="normal-case font-normal text-slate-300">(optional)</span>
              </label>
              <textarea
                className="textarea"
                rows={2}
                placeholder="What's this project about?"
                value={form.description}
                onChange={(e) => up('description', e.target.value)}
              />
            </div>
            <div>
              <label className="label">Priority</label>
              <Select
                value={form.priority}
                onChange={(v) => up('priority', v)}
                ariaLabel="Priority"
                options={[
                  { value: 'low', label: 'Low' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'high', label: 'High' },
                  { value: 'critical', label: 'Critical' },
                ]}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Start date</label>
                <DatePicker
                  block
                  placeholder="Pick a start date"
                  value={form.startDate || null}
                  onChange={(v) => up('startDate', v || '')}
                />
              </div>
              <div>
                <label className="label">Due date</label>
                <DatePicker
                  block
                  placeholder="Pick a due date"
                  value={form.dueDate || null}
                  onChange={(v) => up('dueDate', v || '')}
                  minDate={form.startDate ? new Date(form.startDate) : undefined}
                />
              </div>
            </div>
            {/* Personal toggle — flips the project between a private personal
                project (no team) and a shared team project. The privacy of
                personal projects is intentionally not advertised in the copy
                here — it's a property of the data model, not a sales pitch. */}
            <div className="rounded-lg border border-slate-200 px-3 py-2.5 flex items-start gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={personal}
                onClick={() => {
                  const next = !personal;
                  setPersonal(next);
                  // Switching to personal: drop any GxP / General lifecycle —
                  // they aren't offered in the personal view, so default to a
                  // blank workflow that the personal templates can replace.
                  // Switching away: clear any personal_* lifecycle for the
                  // same reason.
                  const personalKeys =
                    LIFECYCLE_GROUPS.find((g) => g.label === 'Personal')?.options.map((o) => o.value) ?? [];
                  if (next) {
                    if (!personalKeys.includes(form.lifecycle) && form.lifecycle !== 'generic') {
                      up('lifecycle', 'generic');
                    }
                  } else if (personalKeys.includes(form.lifecycle)) {
                    up('lifecycle', 'generic');
                  }
                }}
                className={`mt-0.5 relative w-9 h-5 rounded-full shrink-0 transition-colors cursor-pointer ${
                  personal ? 'bg-blue-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${personal ? 'left-4' : 'left-0.5'}`}
                />
              </button>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                  Personal project
                  {!isLead && <Lock size={11} className="text-slate-400" />}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {isLead
                    ? 'Personal to-do list — no team attached.'
                    : personal
                      ? 'No team attached. Toggle off to browse the shared workflow templates.'
                      : "Preview mode — contributors can only create personal projects, so we'll switch back on submit."}
                </div>
              </div>
            </div>

            {!personal && teams.length > 0 && (
              <div>
                <label className="label">Team</label>
                <Select
                  value={form.teamId}
                  onChange={(v) => up('teamId', v)}
                  ariaLabel="Team"
                  placeholder="— Unassigned —"
                  options={[
                    { value: '', label: '— Unassigned —' },
                    ...teams.map((t) => ({ value: t.id, label: t.name })),
                  ]}
                />
              </div>
            )}
          </div>

          {/* Lifecycle template picker */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-1">
              <label className="label mb-0">Workflow template</label>
              {/* Save-as-template button — shown when a non-generic lifecycle is selected */}
              {(hasBuiltInLifecycle || customTemplateId || sourceProjectId) && phases.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowSaveDialog(true)}
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-600 hover:text-blue-800 transition-colors"
                >
                  <BookmarkPlus size={13} />
                  Save as template
                </button>
              )}
            </div>
            <p className="text-xs text-slate-400 mb-3 mt-0.5">
              {personal
                ? 'Pick a ready-made template to jump-start your personal project — or start blank.'
                : isLead
                  ? 'Pick a template to get predefined stages and tasks — you can edit everything in the next step.'
                  : 'Browse every template available — the shared workflows are listed too so you can see how shared projects are structured. Shared projects can only be created by a lead.'}
            </p>
            <div className="space-y-4">
              {/* When the Personal toggle is on, only show the Personal group
                  plus a single "Custom / Blank" starter — the QA / Life
                  Sciences lifecycles don't fit a private to-do list. When
                  it's off, show the full QI / Life Sciences / General set
                  (without the Personal group). ICs can browse the lead-only
                  templates so they understand the workflows the team uses,
                  even though they can only commit a personal project.
                  Non-personal view: collapsed to 6 templates by default with
                  a "Show all" toggle so the list doesn't overwhelm new users. */}
              {(() => {
                const groups = personal
                  ? [
                      {
                        label: 'Start fresh',
                        description: '',
                        options: [{ value: 'generic', label: 'Custom / Blank', hint: 'Start from scratch' }],
                      },
                      LIFECYCLE_GROUPS.find((g) => g.label === 'Personal')!,
                    ]
                  : LIFECYCLE_GROUPS.filter((g) => g.label !== 'Personal');

                // For non-personal view, flatten all options and apply the
                // "show first 6" limit — but always show the active selection.
                if (!personal) {
                  const COLLAPSE_LIMIT = 6;
                  const allOptions = groups.flatMap((g) => g.options);
                  const activeValue = !customTemplateId ? form.lifecycle : null;
                  const visibleSet = showAllTemplates
                    ? new Set(allOptions.map((o) => o.value))
                    : new Set([
                        ...allOptions.slice(0, COLLAPSE_LIMIT).map((o) => o.value),
                        // Always include the active selection even when collapsed
                        ...(activeValue ? [activeValue] : []),
                      ]);

                  const renderedGroups = groups.map((group) => {
                    const visibleOptions = group.options.filter((o) => visibleSet.has(o.value));
                    if (visibleOptions.length === 0) return null;
                    return (
                      <div key={group.label}>
                        <div className="flex items-baseline gap-2 mb-1.5">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                            {group.label}
                          </div>
                          <div className="text-[10px] text-slate-300">{group.description}</div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                          {visibleOptions.map((opt) => {
                            const active = !customTemplateId && form.lifecycle === opt.value;
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => selectBuiltInLifecycle(opt.value)}
                                className={`text-left px-3 py-2 rounded-lg text-xs transition-all border ${
                                  active
                                    ? 'bg-blue-50 dark:bg-blue-500/15 border-blue-500 text-blue-700 dark:text-blue-300'
                                    : 'bg-white dark:bg-white/[0.04] border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-white/20'
                                }`}
                              >
                                <div className="flex items-center gap-1.5">
                                  {opt.value === 'generic' && (
                                    <Sparkles size={11} className="opacity-60 shrink-0" />
                                  )}
                                  <span className={active ? 'font-bold' : 'font-semibold'}>{opt.label}</span>
                                </div>
                                <div
                                  className={`mt-0.5 text-[10px] ${active ? 'text-blue-600/80 dark:text-blue-300/80' : 'text-slate-400 dark:text-slate-500'}`}
                                >
                                  {opt.hint}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  });

                  return (
                    <>
                      {renderedGroups}
                      {allOptions.length > COLLAPSE_LIMIT && (
                        <button
                          type="button"
                          onClick={() => setShowAllTemplates((v) => !v)}
                          className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-1"
                        >
                          {showAllTemplates
                            ? '← Show fewer templates'
                            : `Show all templates → (${allOptions.length - COLLAPSE_LIMIT} more)`}
                        </button>
                      )}
                    </>
                  );
                }

                // Personal view — show all groups as-is (no collapse needed)
                return groups.map((group) => (
                  <div key={group.label}>
                    <div className="flex items-baseline gap-2 mb-1.5">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        {group.label}
                      </div>
                      <div className="text-[10px] text-slate-300">{group.description}</div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                      {group.options.map((opt) => {
                        const active = !customTemplateId && form.lifecycle === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => selectBuiltInLifecycle(opt.value)}
                            className={`text-left px-3 py-2 rounded-lg text-xs transition-all border ${
                              active
                                ? 'bg-blue-50 dark:bg-blue-500/15 border-blue-500 text-blue-700 dark:text-blue-300'
                                : 'bg-white dark:bg-white/[0.04] border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-white/20'
                            }`}
                          >
                            <div className="flex items-center gap-1.5">
                              {opt.value === 'generic' && (
                                <Sparkles size={11} className="opacity-60 shrink-0" />
                              )}
                              <span className={active ? 'font-bold' : 'font-semibold'}>{opt.label}</span>
                            </div>
                            <div
                              className={`mt-0.5 text-[10px] ${active ? 'text-blue-600/80 dark:text-blue-300/80' : 'text-slate-400 dark:text-slate-500'}`}
                            >
                              {opt.hint}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ));
              })()}

              {/* Custom templates group */}
              {customTemplates.length > 0 && (
                <div>
                  <div className="flex items-baseline gap-2 mb-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      Custom
                    </div>
                    <div className="text-[10px] text-slate-300">Saved by your workspace</div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                    {customTemplates.map((ct) => {
                      const active = customTemplateId === ct.id;
                      const isOwner = currentUserId && ct.createdBy === currentUserId;
                      return (
                        <div key={ct.id} className="relative group">
                          <button
                            type="button"
                            onClick={() => selectCustomTemplate(ct)}
                            className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all border ${
                              active
                                ? 'bg-blue-50 dark:bg-blue-500/15 border-blue-500 text-blue-700 dark:text-blue-300'
                                : 'bg-white dark:bg-white/[0.04] border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-white/20'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 pr-9">
                              <span className={active ? 'font-bold' : 'font-semibold'}>{ct.name}</span>
                            </div>
                            <div
                              className={`mt-0.5 text-[10px] ${active ? 'text-blue-600/80 dark:text-blue-300/80' : 'text-slate-400 dark:text-slate-500'}`}
                            >
                              {ct.phases.length} stage{ct.phases.length === 1 ? '' : 's'} · by{' '}
                              {ct.createdByName || 'Unknown'}
                            </div>
                          </button>
                          {isOwner && (
                            <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  selectCustomTemplate(ct);
                                  setEditingTemplate(ct);
                                  setShowSaveDialog(true);
                                }}
                                className="p-0.5 rounded text-slate-300 hover:text-blue-500 transition-colors"
                                title="Edit template"
                              >
                                <Pencil size={11} />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteCustomTemplate(ct.id);
                                }}
                                className="p-0.5 rounded text-slate-300 hover:text-red-500 transition-colors"
                                title="Delete template"
                              >
                                <Trash2 size={11} />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Start from an existing project — clone a running project's
                  phases + tasks as the starting workflow. */}
              {projectList.length > 0 && (
                <div>
                  <div className="flex items-baseline gap-2 mb-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      From an existing project
                    </div>
                    <div className="text-[10px] text-slate-300">Reuse a running project’s workflow</div>
                  </div>
                  <Select
                    value={sourceProjectId || ''}
                    onChange={(v) => selectSourceProject(v)}
                    ariaLabel="Start from an existing project"
                    placeholder="Pick a project to copy its stages & tasks…"
                    options={[
                      { value: '', label: '— None —' },
                      ...projectList.map((p) => ({
                        value: p.id,
                        label: `${p.name}${p.taskCount ? ` · ${p.taskCount} task${p.taskCount === 1 ? '' : 's'}` : ''}${p.isPersonal ? ' · personal' : ''}`,
                      })),
                    ]}
                  />
                  {importing && (
                    <div className="mt-1.5 text-[11px] text-slate-400">Loading workflow…</div>
                  )}
                </div>
              )}
            </div>

            {/* Preview of what the picked built-in template ships with */}
            {!customTemplateId && templateInfo && templateInfo.phases?.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <div className="flex items-baseline justify-between mb-2">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    What you get
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {templateInfo.phases.length} stage{templateInfo.phases.length === 1 ? '' : 's'} ·{' '}
                    {templateInfo.phases.reduce((n: number, ph: any) => n + (ph.tasks?.length || 0), 0)} tasks
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {templateInfo.phases.map((ph: any, i: number) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-50 border border-slate-100 text-slate-600"
                    >
                      <span className="text-slate-400 font-bold">{i + 1}</span>
                      {ph.name}
                      <span className="text-slate-300">·</span>
                      <span className="text-slate-400">{ph.tasks?.length || 0}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Preview for selected custom template */}
            {customTemplateId && selectedCustomTemplate && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <div className="flex items-baseline justify-between mb-2">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    What you get
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {selectedCustomTemplate.phases.length} stage
                    {selectedCustomTemplate.phases.length === 1 ? '' : 's'} ·{' '}
                    {selectedCustomTemplate.phases.reduce((n, ph) => n + ph.tasks.length, 0)} tasks
                  </div>
                </div>
                {selectedCustomTemplate.description && (
                  <p className="text-[11px] text-slate-500 mb-2">{selectedCustomTemplate.description}</p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {selectedCustomTemplate.phases.map((ph, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-50 border border-slate-100 text-slate-600"
                    >
                      <span className="text-slate-400 font-bold">{i + 1}</span>
                      {ph.name}
                      <span className="text-slate-300">·</span>
                      <span className="text-slate-400">{ph.tasks.length}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (!form.name.trim()) {
                  setErr('Enter a project name first.');
                  return;
                }
                setErr('');
                setStep(2);
              }}
              className="btn-primary"
            >
              Next: Configure stages →
            </button>
            <button className="btn-secondary" onClick={() => router.back()}>
              Cancel
            </button>
            {err && <span className="text-sm text-red-600">{err}</span>}
          </div>
        </div>
      )}

      {/* ── Step 2: Stages ──────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-1">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Stages for "{form.name}"</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Based on <span className="font-semibold text-slate-600">{lifecycleLabel}</span> template.
                  Rename, reorder, add or remove stages and tasks freely.
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowSaveDialog(true)}
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-600 hover:text-blue-800 transition-colors"
                >
                  <BookmarkPlus size={13} />
                  Save as template
                </button>
                <button
                  onClick={() => {
                    if (sourceProjectId) {
                      selectSourceProject(sourceProjectId);
                    } else if (selectedCustomTemplate) {
                      setPhases(phasesFromCustomTemplate(selectedCustomTemplate));
                    } else {
                      setPhases(phasesFromTemplate(templateInfo));
                    }
                  }}
                  className="text-xs text-blue-600 font-semibold hover:underline"
                >
                  Reset to template
                </button>
              </div>
            </div>

            {!customTemplateId && templateInfo?.description && (
              <div className="mt-3 mb-4 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-100">
                {templateInfo.description}
              </div>
            )}
            {customTemplateId && selectedCustomTemplate?.description && (
              <div className="mt-3 mb-4 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-100">
                {selectedCustomTemplate.description}
              </div>
            )}

            <div className="space-y-2 mt-4">
              {phases.map((ph, i) => (
                <PhaseRow
                  key={ph.id}
                  phase={ph}
                  index={i}
                  total={phases.length}
                  members={members}
                  canSchedule={isLead}
                  onChange={(p) => updatePhase(ph.id, p)}
                  onDelete={() => deletePhase(ph.id)}
                  onMoveUp={() => movePhase(i, -1)}
                  onMoveDown={() => movePhase(i, 1)}
                />
              ))}
            </div>

            <button
              onClick={addPhase}
              className="mt-3 w-full flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl py-3 text-sm text-slate-400 hover:border-blue-300 hover:text-blue-500 transition-all"
            >
              <Plus size={15} /> Add stage
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={submit} disabled={loading} className="btn-primary">
              {loading ? 'Creating…' : 'Create project'}
            </button>
            <button className="btn-secondary" onClick={() => setStep(1)}>
              ← Back
            </button>
            {err && <span className="text-sm text-red-600">{err}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
