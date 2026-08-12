'use client';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/client/api';
import { Card, useToast, formatDate } from '@/components/ui';
import { UserAvatar } from '@/components/AvatarRegistry';
import { Select } from '@/components/Select';
import { Trash2, MessageSquare, Send } from 'lucide-react';

interface Member {
  id: string;
  name: string;
}
interface Comment {
  id: string;
  userName: string;
  body: string;
  createdAt: string | null;
}
interface Ticket {
  id: string;
  number: number;
  title: string;
  description: string;
  requesterName: string;
  assigneeId: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'waiting' | 'resolved' | 'closed';
  category: string;
  resolvedAt: string | null;
  createdByName: string;
  createdAt: string | null;
  updatedAt: string | null;
  comments: Comment[];
}

const STATUS_OPTS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];
const PRIORITY_OPTS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];
const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  open: { bg: '#fef3c7', fg: '#b45309' },
  in_progress: { bg: '#dbeafe', fg: '#1d4ed8' },
  waiting: { bg: '#f3e8ff', fg: '#7c3aed' },
  resolved: { bg: '#dcfce7', fg: '#15803d' },
  closed: { bg: '#f1f5f9', fg: '#64748b' },
};
const PRIORITY_STYLE: Record<string, { bg: string; fg: string }> = {
  low: { bg: '#f1f5f9', fg: '#64748b' },
  medium: { bg: '#e0f2fe', fg: '#0369a1' },
  high: { bg: '#ffedd5', fg: '#c2410c' },
  urgent: { bg: '#fee2e2', fg: '#dc2626' },
};
const STATUS_LABEL: Record<string, string> = Object.fromEntries(STATUS_OPTS.map((o) => [o.value, o.label]));

function daysAgo(iso: string | null): string {
  if (!iso) return '';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? 'today' : `${d}d`;
}

export function TicketsPanel({
  teamId,
  isLead,
  members,
}: {
  teamId: string;
  isLead: boolean;
  members: Member[];
}) {
  const { showToast, ToastEl } = useToast();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: '', description: '', requesterName: '', priority: 'medium', assigneeId: '' });
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState('');

  useEffect(() => {
    api<Ticket[]>(`/tickets?teamId=${teamId}`)
      .then(setTickets)
      .catch(() => setTickets([]));
  }, [teamId]);

  const memberName = useMemo(() => {
    const m = new Map(members.map((x) => [x.id, x.name]));
    return (id: string | null) => (id ? m.get(id) || 'Someone' : 'Unassigned');
  }, [members]);

  const { active, done } = useMemo(() => {
    const a: Ticket[] = [];
    const d: Ticket[] = [];
    for (const t of tickets || []) (t.status === 'resolved' || t.status === 'closed' ? d : a).push(t);
    return { active: a, done: d };
  }, [tickets]);

  // Two numbers a team meeting actually needs: how many are still pending, and
  // how many have been closed. Nothing else.
  const metrics = useMemo(() => {
    const pending = active.length;
    const closed = done.length;
    return { pending, closed };
  }, [active, done]);

  async function createTicket(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.title.trim()) return;
    setBusy(true);
    try {
      const t = await api<Ticket>('/tickets', {
        method: 'POST',
        body: {
          teamId,
          title: draft.title.trim(),
          description: draft.description.trim() || undefined,
          requesterName: draft.requesterName.trim() || undefined,
          priority: draft.priority,
          assigneeId: draft.assigneeId || null,
        },
      });
      setTickets((prev) => [t, ...(prev || [])]);
      setDraft({ title: '', description: '', requesterName: '', priority: 'medium', assigneeId: '' });
      setCreating(false);
    } catch (err: any) {
      showToast(err.message || 'Could not file the ticket.', 'err');
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, body: any) {
    try {
      const updated = await api<Ticket>(`/tickets/${id}`, { method: 'PATCH', body });
      setTickets((prev) => (prev || []).map((t) => (t.id === id ? updated : t)));
      return updated;
    } catch (err: any) {
      showToast(err.message || 'Update failed.', 'err');
    }
  }

  async function addComment(id: string) {
    if (!comment.trim()) return;
    await patch(id, { comment: comment.trim() });
    setComment('');
  }

  async function remove(id: string) {
    if (!confirm('Delete this ticket? This cannot be undone.')) return;
    try {
      await api(`/tickets/${id}`, { method: 'DELETE' });
      setTickets((prev) => (prev || []).filter((t) => t.id !== id));
      setOpenId(null);
    } catch (err: any) {
      showToast(err.message || 'Could not delete.', 'err');
    }
  }

  function Row({ t }: { t: Ticket }) {
    const open = openId === t.id;
    return (
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <button
          onClick={() => setOpenId(open ? null : t.id)}
          className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-50 transition-colors"
        >
          <span className="text-xs font-mono text-slate-400 shrink-0 w-9">#{t.number}</span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-slate-800 truncate">{t.title}</span>
            <span className="block text-[11px] text-slate-400 truncate">
              {memberName(t.assigneeId)}
              {t.status === 'waiting' && ` · waiting ${daysAgo(t.updatedAt)}`}
              {t.requesterName ? ` · from ${t.requesterName}` : ''}
            </span>
          </span>
          {/* Aging — open tickets get a colour-coded age so a queue can't quietly
              rot. Green < 3d, amber 3–7d, red ≥ 7d. */}
          {t.status !== 'resolved' &&
            t.status !== 'closed' &&
            (() => {
              const age = Math.floor((Date.now() - new Date(t.createdAt || Date.now()).getTime()) / 86_400_000);
              const c = age >= 7 ? '#dc2626' : age >= 3 ? '#b45309' : '#16a34a';
              return (
                <span
                  className="text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full shrink-0"
                  style={{ background: `${c}1a`, color: c }}
                  title={`Open for ${age} day${age === 1 ? '' : 's'}`}
                >
                  {age}d
                </span>
              );
            })()}
          <span
            className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0"
            style={{ background: PRIORITY_STYLE[t.priority].bg, color: PRIORITY_STYLE[t.priority].fg }}
          >
            {t.priority}
          </span>
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
            style={{ background: STATUS_STYLE[t.status].bg, color: STATUS_STYLE[t.status].fg }}
          >
            {STATUS_LABEL[t.status]}
          </span>
        </button>

        {open && (
          <div className="border-t border-slate-100 p-3 space-y-3 bg-slate-50/40">
            {t.description && <p className="text-sm text-slate-600 whitespace-pre-wrap">{t.description}</p>}

            <div className="grid sm:grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Status
                </label>
                <Select
                  value={t.status}
                  onChange={(v) => patch(t.id, { status: v })}
                  ariaLabel="Status"
                  options={STATUS_OPTS}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Priority
                </label>
                <Select
                  value={t.priority}
                  onChange={(v) => patch(t.id, { priority: v })}
                  ariaLabel="Priority"
                  options={PRIORITY_OPTS}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Assignee
                </label>
                <Select
                  value={t.assigneeId || ''}
                  onChange={(v) => patch(t.id, { assigneeId: v || null })}
                  ariaLabel="Assignee"
                  placeholder="Unassigned"
                  options={[{ value: '', label: 'Unassigned' }, ...members.map((m) => ({ value: m.id, label: m.name }))]}
                />
              </div>
            </div>

            {/* Comments */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <MessageSquare size={12} /> Notes ({t.comments.length})
              </div>
              {t.comments.map((c) => (
                <div key={c.id} className="text-sm">
                  <span className="font-semibold text-slate-700">{c.userName || 'Someone'}</span>
                  <span className="text-[11px] text-slate-400"> · {formatDate(c.createdAt)}</span>
                  <p className="text-slate-600 whitespace-pre-wrap">{c.body}</p>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  className="input flex-1 text-sm"
                  placeholder="Add a note…"
                  value={openId === t.id ? comment : ''}
                  onChange={(e) => setComment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      addComment(t.id);
                    }
                  }}
                />
                <button onClick={() => addComment(t.id)} className="btn-ghost shrink-0" aria-label="Add note">
                  <Send size={14} />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400">
              <span>
                Filed by {t.createdByName || 'someone'} · {formatDate(t.createdAt)}
              </span>
              {isLead && (
                <button
                  onClick={() => remove(t.id)}
                  className="inline-flex items-center gap-1 text-red-400 hover:text-red-600"
                >
                  <Trash2 size={13} /> Delete
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <Card
      title="Tickets"
      action={
        <button
          onClick={() => setCreating((v) => !v)}
          className="text-xs font-bold text-brand-700 hover:text-brand-800 px-2 py-1 rounded-md hover:bg-blue-50 transition-colors"
        >
          {creating ? 'Cancel' : '+ New ticket'}
        </button>
      }
    >
      {ToastEl}
      <p className="-mt-1 mb-3 text-[11px] text-slate-500 leading-snug">
        A shared request queue for this team. Anyone can file; the team works it down.
      </p>

      {/* Two meeting-ready numbers: pending vs closed. Read them straight off
          the screen in a stand-up. */}
      {tickets && (
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3">
            <div className="text-[28px] font-black tabular-nums leading-none text-amber-600">
              {metrics.pending}
            </div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-700/70 mt-1.5">
              Pending
            </div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
            <div className="text-[28px] font-black tabular-nums leading-none text-emerald-600">
              {metrics.closed}
            </div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-700/70 mt-1.5">
              Closed
            </div>
          </div>
        </div>
      )}

      {creating && (
        <form onSubmit={createTicket} className="mb-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-2">
          <input
            className="input"
            placeholder="What's needed? (title)*"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            required
            autoFocus
          />
          <textarea
            className="input"
            rows={2}
            placeholder="Details (optional)"
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
          <div className="grid sm:grid-cols-3 gap-2">
            <input
              className="input"
              placeholder="Requested by"
              value={draft.requesterName}
              onChange={(e) => setDraft({ ...draft, requesterName: e.target.value })}
            />
            <Select
              value={draft.priority}
              onChange={(v) => setDraft({ ...draft, priority: v })}
              ariaLabel="Priority"
              options={PRIORITY_OPTS}
            />
            <Select
              value={draft.assigneeId}
              onChange={(v) => setDraft({ ...draft, assigneeId: v })}
              ariaLabel="Assignee"
              placeholder="Unassigned"
              options={[{ value: '', label: 'Unassigned' }, ...members.map((m) => ({ value: m.id, label: m.name }))]}
            />
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? 'Filing…' : 'File ticket'}
            </button>
          </div>
        </form>
      )}

      {tickets === null ? (
        <div className="h-16 skeleton rounded-xl" />
      ) : tickets.length === 0 ? (
        <div className="text-sm text-slate-500 py-4">No tickets yet.</div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            {active.length === 0 ? (
              <div className="text-sm text-slate-400 py-2">Nothing open — queue is clear. 🎉</div>
            ) : (
              active.map((t) => <Row key={t.id} t={t} />)
            )}
          </div>
          {done.length > 0 && (
            <details>
              <summary className="text-xs font-semibold text-slate-400 cursor-pointer select-none">
                Resolved &amp; closed ({done.length})
              </summary>
              <div className="space-y-2 mt-2">
                {done.map((t) => (
                  <Row key={t.id} t={t} />
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </Card>
  );
}
