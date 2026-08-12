'use client';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/client/api';
import { Card, useToast, formatDate } from '@/components/ui';
import { Select } from '@/components/Select';
import { DatePicker } from '@/components/DatePicker';
import { Plus, X, Trash2, Pencil, Repeat, ArrowUpRight, Power } from 'lucide-react';

interface Member {
  id: string;
  name: string;
}
interface ChecklistItem {
  title: string;
}
interface RecurringActivity {
  id: string;
  title: string;
  description: string;
  checklist: ChecklistItem[];
  assigneeId: string | null;
  assigneeName?: string | null;
  priority: 'low' | 'medium' | 'high' | 'critical';
  intervalUnit: 'day' | 'week' | 'month' | 'year';
  intervalCount: number;
  cadence: string;
  startDate: string | null;
  nextDueDate: string | null;
  leadTimeDays: number;
  active: boolean;
  lastOccurrenceTaskId: string | null;
}

const UNIT_OPTS = [
  { value: 'day', label: 'day(s)' },
  { value: 'week', label: 'week(s)' },
  { value: 'month', label: 'month(s)' },
  { value: 'year', label: 'year(s)' },
];
const PRIORITY_OPTS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

type Draft = {
  title: string;
  description: string;
  assigneeId: string;
  priority: string;
  intervalCount: number;
  intervalUnit: string;
  startDate: string;
  leadTimeDays: number;
  checklist: string[];
};

const EMPTY_DRAFT: Draft = {
  title: '',
  description: '',
  assigneeId: '',
  priority: 'medium',
  intervalCount: 1,
  intervalUnit: 'month',
  startDate: '',
  leadTimeDays: 0,
  checklist: [''],
};

function draftFrom(a: RecurringActivity): Draft {
  return {
    title: a.title,
    description: a.description || '',
    assigneeId: a.assigneeId || '',
    priority: a.priority,
    intervalCount: a.intervalCount,
    intervalUnit: a.intervalUnit,
    startDate: a.startDate ? a.startDate.slice(0, 10) : '',
    leadTimeDays: a.leadTimeDays || 0,
    checklist: a.checklist.length ? a.checklist.map((c) => c.title) : [''],
  };
}

export function RecurringPanel({
  teamId,
  isLead,
  members,
}: {
  teamId: string;
  isLead: boolean;
  members: Member[];
}) {
  const { showToast, ToastEl } = useToast();
  const [items, setItems] = useState<RecurringActivity[] | null>(null);
  // null = closed, 'new' = create form, or the id being edited.
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<RecurringActivity[]>(`/teams/${teamId}/recurring-activities`)
      .then(setItems)
      .catch(() => setItems([]));
  }, [teamId]);

  const memberName = useMemo(() => {
    const m = new Map(members.map((x) => [x.id, x.name]));
    return (id: string | null) => (id ? m.get(id) || 'Someone' : 'Unassigned');
  }, [members]);

  function openNew() {
    setDraft(EMPTY_DRAFT);
    setEditing('new');
  }
  function openEdit(a: RecurringActivity) {
    setDraft(draftFrom(a));
    setEditing(a.id);
  }
  function closeForm() {
    setEditing(null);
    setDraft(EMPTY_DRAFT);
  }

  function payloadFrom(d: Draft) {
    return {
      title: d.title.trim(),
      description: d.description.trim() || undefined,
      assigneeId: d.assigneeId || null,
      priority: d.priority,
      intervalUnit: d.intervalUnit,
      intervalCount: Math.max(1, Number(d.intervalCount) || 1),
      startDate: d.startDate,
      leadTimeDays: Math.max(0, Number(d.leadTimeDays) || 0),
      checklist: d.checklist.map((t) => t.trim()).filter(Boolean).map((title) => ({ title })),
    };
  }

  async function save() {
    if (!draft.title.trim()) {
      showToast('Give the activity a name.', 'err');
      return;
    }
    if (editing === 'new' && !draft.startDate) {
      showToast('Pick the first due date.', 'err');
      return;
    }
    setBusy(true);
    try {
      if (editing === 'new') {
        const created = await api<RecurringActivity>(`/teams/${teamId}/recurring-activities`, {
          method: 'POST',
          body: payloadFrom(draft),
        });
        setItems((prev) => [created, ...(prev || [])]);
      } else if (editing) {
        const body: any = payloadFrom(draft);
        if (!draft.startDate) delete body.startDate; // don't re-anchor unless changed
        const updated = await api<RecurringActivity>(
          `/teams/${teamId}/recurring-activities/${editing}`,
          { method: 'PATCH', body },
        );
        setItems((prev) => (prev || []).map((a) => (a.id === editing ? updated : a)));
      }
      closeForm();
    } catch (err: any) {
      showToast(err.message || 'Could not save the activity.', 'err');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(a: RecurringActivity) {
    try {
      const updated = await api<RecurringActivity>(
        `/teams/${teamId}/recurring-activities/${a.id}`,
        { method: 'PATCH', body: { active: !a.active } },
      );
      setItems((prev) => (prev || []).map((x) => (x.id === a.id ? updated : x)));
    } catch (err: any) {
      showToast(err.message || 'Update failed.', 'err');
    }
  }

  async function remove(a: RecurringActivity) {
    if (!confirm(`Delete "${a.title}"? Existing occurrences stay as tasks; it just stops recurring.`))
      return;
    try {
      await api(`/teams/${teamId}/recurring-activities/${a.id}`, { method: 'DELETE' });
      setItems((prev) => (prev || []).filter((x) => x.id !== a.id));
    } catch (err: any) {
      showToast(err.message || 'Could not delete.', 'err');
    }
  }

  function setChecklist(i: number, v: string) {
    setDraft((d) => ({ ...d, checklist: d.checklist.map((c, idx) => (idx === i ? v : c)) }));
  }
  function addChecklist() {
    setDraft((d) => ({ ...d, checklist: [...d.checklist, ''] }));
  }
  function removeChecklist(i: number) {
    setDraft((d) => ({
      ...d,
      checklist: d.checklist.length > 1 ? d.checklist.filter((_, idx) => idx !== i) : [''],
    }));
  }

  return (
    <Card className="p-4">
      {ToastEl}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg grid place-items-center bg-violet-50 text-violet-600 shrink-0">
            <Repeat size={15} />
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-white leading-tight">
              Recurring activities
            </h3>
            <p className="text-[11px] text-slate-400 leading-snug">
              Scheduled chores that repeat — each occurrence shows on the calendar &amp; dashboard with
              its checklist.
            </p>
          </div>
        </div>
        {isLead && editing === null && (
          <button
            onClick={openNew}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg shrink-0"
          >
            <Plus size={14} /> New
          </button>
        )}
      </div>

      {/* Create / edit form */}
      {isLead && editing !== null && (
        <div className="rounded-xl border border-slate-200 dark:border-white/10 p-4 mb-4 space-y-3 bg-slate-50/60 dark:bg-white/[0.02]">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-bold uppercase tracking-wider text-blue-600">
              {editing === 'new' ? 'New recurring activity' : 'Edit activity'}
            </div>
            <button onClick={closeForm} className="p-0.5 text-slate-400 hover:text-slate-700">
              <X size={15} />
            </button>
          </div>

          <input
            className="input"
            placeholder="Activity name — e.g. MES monthly downtime"
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            autoFocus
          />
          <textarea
            className="textarea"
            rows={2}
            placeholder="What is this activity? (optional)"
            value={draft.description}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Owner</label>
              <Select
                value={draft.assigneeId}
                onChange={(v) => setDraft((d) => ({ ...d, assigneeId: v }))}
                ariaLabel="Owner"
                placeholder="Unassigned"
                options={[
                  { value: '', label: 'Unassigned' },
                  ...members.map((m) => ({ value: m.id, label: m.name })),
                ]}
              />
            </div>
            <div>
              <label className="label">Priority</label>
              <Select
                value={draft.priority}
                onChange={(v) => setDraft((d) => ({ ...d, priority: v }))}
                ariaLabel="Priority"
                options={PRIORITY_OPTS}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="label">Repeats every</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={1}
                  className="input w-16"
                  value={draft.intervalCount}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, intervalCount: Math.max(1, Number(e.target.value) || 1) }))
                  }
                />
                <div className="flex-1">
                  <Select
                    value={draft.intervalUnit}
                    onChange={(v) => setDraft((d) => ({ ...d, intervalUnit: v }))}
                    ariaLabel="Interval unit"
                    options={UNIT_OPTS}
                  />
                </div>
              </div>
            </div>
            <div>
              <label className="label">{editing === 'new' ? 'First due date' : 'Re-anchor due date'}</label>
              <DatePicker
                block
                placeholder={editing === 'new' ? 'Pick first due date' : 'Leave blank to keep'}
                value={draft.startDate || null}
                onChange={(v) => setDraft((d) => ({ ...d, startDate: v || '' }))}
              />
            </div>
            <div>
              <label className="label">Appear ahead (days)</label>
              <input
                type="number"
                min={0}
                className="input"
                value={draft.leadTimeDays}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, leadTimeDays: Math.max(0, Number(e.target.value) || 0) }))
                }
              />
            </div>
          </div>

          <div>
            <label className="label">Checklist — resets each cycle</label>
            <div className="space-y-1.5">
              {draft.checklist.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
                  <input
                    className="input flex-1"
                    placeholder={`Step ${i + 1}`}
                    value={c}
                    onChange={(e) => setChecklist(i, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addChecklist();
                      }
                    }}
                  />
                  <button
                    onClick={() => removeChecklist(i)}
                    className="p-1 text-slate-300 hover:text-red-500"
                    title="Remove step"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={addChecklist}
              className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-blue-600 hover:text-blue-800"
            >
              <Plus size={12} /> Add step
            </button>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button onClick={save} disabled={busy} className="btn-primary">
              {busy ? 'Saving…' : editing === 'new' ? 'Create activity' : 'Save changes'}
            </button>
            <button onClick={closeForm} className="btn-secondary">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {items === null ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-slate-50 dark:bg-white/[0.03] animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-8 text-sm text-slate-400">
          No recurring activities yet.
          {isLead && ' Add your first one — e.g. a monthly downtime or a half-yearly review.'}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((a) => (
            <div
              key={a.id}
              className={`rounded-xl border p-3 ${
                a.active
                  ? 'border-slate-200 dark:border-white/10'
                  : 'border-slate-100 dark:border-white/5 opacity-60'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-800 dark:text-white/90 truncate">
                      {a.title}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600">
                      {a.cadence}
                    </span>
                    {!a.active && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                        Paused
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {memberName(a.assigneeId)}
                    {a.nextDueDate && ` · next ${formatDate(a.nextDueDate)}`}
                    {a.checklist.length > 0 &&
                      ` · ${a.checklist.length} step${a.checklist.length === 1 ? '' : 's'}`}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {a.lastOccurrenceTaskId && (
                    <a
                      href={`/tasks/${a.lastOccurrenceTaskId}`}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-slate-100"
                      title="Open current occurrence"
                    >
                      <ArrowUpRight size={15} />
                    </a>
                  )}
                  {isLead && (
                    <>
                      <button
                        onClick={() => toggleActive(a)}
                        className={`p-1.5 rounded-lg hover:bg-slate-100 ${a.active ? 'text-slate-400 hover:text-amber-600' : 'text-emerald-500'}`}
                        title={a.active ? 'Pause' : 'Resume'}
                      >
                        <Power size={15} />
                      </button>
                      <button
                        onClick={() => openEdit(a)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-slate-100"
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => remove(a)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-slate-100"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
