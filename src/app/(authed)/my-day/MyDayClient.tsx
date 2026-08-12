'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { ModalPortal } from '@/components/ModalPortal';
import Link from 'next/link';
import { SCRATCHPAD_ENABLED } from '@/lib/features';
import { api } from '@/lib/client/api';
import { useIsLead, useCurrentUser } from '@/components/CurrentUserContext';
import {
  Plus,
  Check,
  Trash2,
  ArrowRight,
  X,
  Sparkles,
  Calendar,
  Zap,
  ChevronRight,
  BookmarkCheck,
  Shield,
  PenLine,
  Pencil,
  Pin,
  PinOff,
  FileText,
  Layers,
  FolderKanban,
} from 'lucide-react';
import { formatDate } from '@/components/ui';
import { DatePicker } from '@/components/DatePicker';
import { Select } from '@/components/Select';
import { notifyCalendarChange } from '@/components/SidebarCalendar';

interface Note {
  id: string;
  text: string;
  done: boolean;
  promotedTaskId: string | null;
  createdAt: string;
}
interface UserNote {
  id: string;
  title: string | null;
  content: string;
  type: 'text' | 'whiteboard';
  whiteboardData: any;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

function useDateLabel() {
  const [label, setLabel] = useState('');
  useEffect(() => {
    const fmt = () => {
      const d = new Date();
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const months = [
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December',
      ];
      setLabel(`${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`);
    };
    fmt();
    const t = setInterval(fmt, 60_000);
    return () => clearInterval(t);
  }, []);
  return label;
}

/* ── Notes panel (collapsible section) ───────────────────────────────────── */
function NotesPanel({ onSaveWhiteboardRequest }: { onSaveWhiteboardRequest?: () => void }) {
  const [notes, setNotes] = useState<UserNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [showTitle, setShowTitle] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const [noteErr, setNoteErr] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api<UserNote[]>('/scratch/notes');
      setNotes(data);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content || savingNote) return;
    setSavingNote(true);
    setNoteErr('');
    try {
      const note = await api<UserNote>('/scratch/notes', {
        method: 'POST',
        body: { content, title: title.trim() || undefined, type: 'text' },
      });
      setNotes((n) => [note, ...n]);
      setText('');
      setTitle('');
      setShowTitle(false);
    } catch (err: any) {
      setNoteErr(err?.message || 'Could not save the note — try again.');
    } finally {
      setSavingNote(false);
    }
  }

  async function removeNote(id: string) {
    // Optimistic remove, then reconcile from the server on failure so a
    // dropped delete reappears instead of silently "sticking" deleted.
    const prev = notes;
    setNotes((n) => n.filter((x) => x.id !== id));
    try {
      await api(`/scratch/notes/${id}`, { method: 'DELETE' });
    } catch {
      // Server rejected the delete — resync so the note doesn't vanish locally.
      load();
    }
  }

  async function togglePin(note: UserNote) {
    const prev = notes;
    const updated = { ...note, pinned: !note.pinned };
    setNotes((n) =>
      n.map((x) => (x.id === note.id ? updated : x)).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)),
    );
    try {
      await api(`/scratch/notes/${note.id}`, { method: 'PATCH', body: { pinned: !note.pinned } });
    } catch {
      // Revert to the server's truth on failure.
      load();
    }
  }

  function startEdit(note: UserNote) {
    setEditingId(note.id);
    setEditText(note.content);
    setEditTitle(note.title || '');
  }

  async function saveEdit(note: UserNote) {
    const content = editText.trim();
    if (!content) {
      setEditingId(null);
      return;
    }
    const prev = notes;
    const updated = { ...note, content, title: editTitle.trim() || null };
    setNotes((n) => n.map((x) => (x.id === note.id ? updated : x)));
    setEditingId(null);
    try {
      await api(`/scratch/notes/${note.id}`, {
        method: 'PATCH',
        body: { content, title: editTitle.trim() || undefined },
      });
    } catch {
      // Keep the list consistent with the server if the edit didn't persist.
      load();
    }
  }

  return (
    <div className="flex flex-col">
      {/* The modal chrome around this panel already carries the "Notes"
          title (see NotesFAB) — no second collapsible header needed here. */}
      {!loading && notes.length > 0 && (
        <div className="mb-3 text-[10px] font-bold text-slate-400 dark:text-white/30 tabular-nums">
          {notes.length} note{notes.length === 1 ? '' : 's'}
        </div>
      )}

      <>
        {/* Add note form */}
          <form onSubmit={addNote} className="mb-4">
            <div className="rounded-xl border border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] overflow-hidden focus-within:border-amber-400/60 dark:focus-within:border-amber-500/40 focus-within:shadow-[0_0_0_3px_rgba(245,158,11,0.08)] transition-all">
              {showTitle && (
                <input
                  className="w-full bg-transparent text-[13px] font-semibold text-slate-700 dark:text-white/80 placeholder-slate-300 dark:placeholder-white/25 border-0 border-b border-slate-100 dark:border-white/[0.06] outline-none px-3 py-2"
                  placeholder="Title (optional)"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                />
              )}
              <textarea
                className="w-full bg-transparent text-[13px] text-slate-700 dark:text-white/80 placeholder-slate-300 dark:placeholder-white/25 border-0 outline-none resize-none px-3 py-2.5 leading-relaxed"
                placeholder="Jot a permanent note — ideas, links, decisions…"
                rows={2}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  // auto-grow
                  const t = e.target;
                  t.style.height = 'auto';
                  t.style.height = t.scrollHeight + 'px';
                }}
                maxLength={50000}
              />
              <div className="flex items-center gap-1 px-2 pb-2">
                <button
                  type="button"
                  onClick={() => setShowTitle((v) => !v)}
                  className="text-[10px] font-semibold text-slate-400 dark:text-white/25 hover:text-slate-600 dark:hover:text-white/50 px-1.5 py-1 rounded transition-colors"
                >
                  {showTitle ? '− title' : '+ title'}
                </button>
                <span className="flex-1" />
                {text.trim() && (
                  <button
                    type="submit"
                    disabled={savingNote}
                    className="inline-flex items-center gap-1 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-[11px] font-semibold px-2.5 py-1.5 transition-colors fade-in-soft"
                  >
                    {savingNote ? 'Saving…' : 'Save note'}
                  </button>
                )}
              </div>
            </div>
            {noteErr && (
              <div
                role="alert"
                className="mt-2 text-[11px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg px-2.5 py-1.5"
              >
                {noteErr}
              </div>
            )}
          </form>

          {/* Notes list */}
          {loading && (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="rounded-xl border border-slate-100 dark:border-white/[0.06] p-3 space-y-1.5"
                >
                  <div className="skeleton h-3 w-2/3" />
                  <div className="skeleton h-2.5 w-full" />
                </div>
              ))}
            </div>
          )}

          {!loading && notes.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 dark:border-white/[0.07] p-6 text-center">
              <FileText size={16} className="mx-auto mb-2 text-slate-300 dark:text-white/15" />
              <div className="text-[11px] text-slate-400 dark:text-white/25">
                No notes yet. Save anything you want to keep.
              </div>
            </div>
          )}

          <div className="space-y-2 pr-0.5">
            {notes.map((note) => (
              <div
                key={note.id}
                className={`group rounded-xl border transition-all cursor-pointer ${
                  note.pinned
                    ? 'border-amber-200/80 dark:border-amber-500/25 bg-amber-50/60 dark:bg-amber-500/[0.06]'
                    : 'border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-white/[0.025] hover:border-slate-300 dark:hover:border-white/12'
                }`}
                onClick={() => setExpandedId(expandedId === note.id ? null : note.id)}
              >
                {editingId === note.id ? (
                  <div className="p-3 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      className="w-full bg-transparent text-[12px] font-semibold text-slate-600 dark:text-white/70 placeholder-slate-300 border-b border-slate-100 dark:border-white/[0.07] outline-none pb-1.5"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="Title (optional)"
                    />
                    <textarea
                      autoFocus
                      className="w-full bg-transparent text-[13px] text-slate-700 dark:text-white/80 border-0 outline-none resize-none leading-relaxed"
                      rows={3}
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setEditingId(null);
                        }
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                          void saveEdit(note);
                        }
                      }}
                    />
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-[10px] font-semibold text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => void saveEdit(note)}
                        className="text-[10px] font-semibold text-amber-600 hover:text-amber-700 transition-colors"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="px-3 py-2.5">
                    {note.type === 'whiteboard' && (
                      <div className="flex items-center gap-1 mb-1">
                        <Layers size={10} className="text-blue-400" />
                        <span className="text-[9px] font-bold uppercase tracking-wider text-blue-400">
                          Whiteboard
                        </span>
                      </div>
                    )}
                    {note.title && (
                      <div className="text-[12px] font-bold text-slate-700 dark:text-white/75 mb-0.5 line-clamp-1">
                        {note.title}
                      </div>
                    )}
                    <p
                      className={`text-[12px] text-slate-600 dark:text-white/60 leading-relaxed whitespace-pre-wrap break-words ${expandedId === note.id ? '' : 'line-clamp-4'}`}
                    >
                      {note.content}
                    </p>
                    {expandedId !== note.id && note.content.length > 200 && (
                      <span className="text-[10px] text-amber-500 font-semibold">show more</span>
                    )}
                    <div
                      className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="flex-1 text-[9px] text-slate-300 dark:text-white/20">
                        {formatDate(note.createdAt)}
                      </span>
                      <button
                        onClick={() => startEdit(note)}
                        title="Edit"
                        className="p-1 rounded text-slate-300 dark:text-white/15 hover:text-slate-600 dark:hover:text-white/60 transition-colors"
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        onClick={() => void togglePin(note)}
                        title={note.pinned ? 'Unpin' : 'Pin'}
                        className="p-1 rounded text-slate-300 dark:text-white/15 hover:text-amber-500 dark:hover:text-amber-400 transition-colors"
                      >
                        {note.pinned ? <PinOff size={11} /> : <Pin size={11} />}
                      </button>
                      <button
                        onClick={() => void removeNote(note.id)}
                        title="Delete"
                        className="p-1 rounded text-slate-300 dark:text-white/15 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
      </>
    </div>
  );
}

function NotesFAB() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Open notes"
        aria-label="Open notes"
        className="fixed bottom-6 right-6 z-40 grid h-[52px] w-[52px] place-items-center rounded-2xl border border-amber-200 bg-white text-amber-600 transition-all hover:-translate-y-0.5 hover:border-amber-300 active:scale-95 dark:border-amber-500/20 dark:bg-[#262624] dark:text-amber-400"
        style={{ boxShadow: '0 12px 32px rgba(15,23,42,0.14), 0 2px 8px rgba(15,23,42,0.07)' }}
      >
        <FileText size={22} />
      </button>
      {open && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex">
            <div
              className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
              onClick={() => setOpen(false)}
            />
            <div className="relative w-full h-full bg-slate-50 dark:bg-[#1e1e1c] shadow-2xl flex flex-col fade-in-soft">
              <div
                className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-white/[0.07] shrink-0"
                style={{ background: 'linear-gradient(to right, rgba(245,158,11,0.08), transparent)' }}
              >
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                  <FileText size={16} className="text-white" />
                </div>
                <div>
                  <div className="text-sm font-black text-slate-800 dark:text-white/90">Notes</div>
                  <div className="text-[10px] text-slate-400 dark:text-white/30">
                    Ideas and decisions, out of your task flow.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="ml-auto p-1.5 rounded-lg text-slate-400 dark:text-white/35 hover:text-slate-700 dark:hover:text-white/70 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="max-w-2xl mx-auto p-5">
                  <NotesPanel />
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  );
}

export default function MyDayClient({ initialData }: { initialData: { open: Note[]; done: Note[] } }) {
  const isLead = useIsLead();
  const me = useCurrentUser();
  const firstName = (me?.name || '').trim().split(/\s+/)[0] || '';
  const dateLabel = useDateLabel();

  const [open, setOpen] = useState<Note[]>(initialData.open);
  const [done, setDone] = useState<Note[]>(initialData.done);
  const [text, setText] = useState('');
  const [promote, setPromote] = useState<Note | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [justDone, setJustDone] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function markSaved() {
    setSavedAt(new Date());
  }
  function startEdit(n: Note) {
    setEditingId(n.id);
    setEditText(n.text);
  }
  function cancelEdit() {
    setEditingId(null);
    setEditText('');
  }

  async function saveEdit(n: Note) {
    const t = editText.trim();
    if (!t || t === n.text) {
      cancelEdit();
      return;
    }
    setOpen((o) => o.map((x) => (x.id === n.id ? { ...x, text: t } : x)));
    cancelEdit();
    try {
      await api(`/scratch/${n.id}`, { method: 'PATCH', body: { text: t } });
      markSaved();
    } finally {
      load();
    }
  }

  const load = useCallback(async () => {
    try {
      const res = await api<{ open: Note[]; done: Note[] }>('/scratch');
      setOpen(res.open);
      setDone(res.done);
    } catch {}
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText('');
    const temp: Note = {
      id: `tmp-${Date.now()}`,
      text: t,
      done: false,
      promotedTaskId: null,
      createdAt: new Date().toISOString(),
    };
    setOpen((o) => [temp, ...o]);
    try {
      await api('/scratch', { method: 'POST', body: { text: t } });
      markSaved();
    } finally {
      load();
    }
    inputRef.current?.focus();
  }

  async function toggle(n: Note) {
    if (!n.done) {
      setJustDone(n.id);
      setTimeout(() => setJustDone(null), 700);
    }
    if (n.done) {
      setDone((d) => d.filter((x) => x.id !== n.id));
      setOpen((o) => [{ ...n, done: false }, ...o]);
    } else {
      setOpen((o) => o.filter((x) => x.id !== n.id));
      setDone((d) => [{ ...n, done: true }, ...d]);
    }
    try {
      await api(`/scratch/${n.id}`, { method: 'PATCH', body: { done: !n.done } });
      markSaved();
    } finally {
      load();
    }
  }

  async function remove(n: Note) {
    setOpen((o) => o.filter((x) => x.id !== n.id));
    setDone((d) => d.filter((x) => x.id !== n.id));
    try {
      await api(`/scratch/${n.id}`, { method: 'DELETE' });
      markSaved();
    } finally {
      load();
    }
  }

  return (
    <div className="max-w-6xl mx-auto pb-14">
      {/* ── Hero header ──────────────────────────────────────────────── */}
      <div className="mb-5 pt-1">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400 dark:text-white/30">
                My Day
              </span>
              {savedAt && (
                <span
                  key={savedAt.getTime()}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400/80 fade-in-soft"
                  title={`Last saved ${savedAt.toLocaleTimeString()}`}
                >
                  <Check size={10} strokeWidth={3} /> Saved
                </span>
              )}
            </div>
            <h1 className="text-[1.7rem] font-black tracking-tight leading-tight text-slate-800 dark:text-white/90">
              My Day
              {firstName && (
                <span className="text-blue-700 dark:text-blue-400">
                  {' '}
                  · {firstName}
                </span>
              )}
            </h1>
            {dateLabel && (
              <div className="flex items-center gap-1.5 mt-1.5">
                <Calendar size={11} className="text-slate-400 dark:text-white/25 shrink-0" />
                <span className="text-[12px] text-slate-500 dark:text-white/40 font-medium">{dateLabel}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tasks stay full-width; secondary tools live in unobtrusive hanging buttons. */}
      <div>
        {/* ── Left: capture + todo list ────────────────────────────── */}
        <div className="min-w-0">
          {/* ── Capture bar ────────────────────────────────────────── */}
          <form onSubmit={add} className="mb-4">
            <div className="relative rounded-2xl border border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] px-3.5 py-3 shadow-sm hover:border-slate-300/80 focus-within:border-blue-500/60 dark:focus-within:border-blue-500/50 focus-within:shadow-[0_0_0_3px_rgba(21,101,192,0.10)] transition-all">
              <div className="flex items-center gap-3">
                {/* Capture icon — a pen, matching the "empty your mind" prompt */}
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    background:
                      'linear-gradient(135deg, rgba(21,101,192,0.15) 0%, rgba(34,197,94,0.12) 100%)',
                    boxShadow: '0 0 0 1px rgba(21,101,192,0.12)',
                  }}
                >
                  <PenLine size={18} className="text-blue-600 dark:text-blue-400" />
                </div>
                <input
                  ref={inputRef}
                  className="flex-1 bg-transparent text-[15px] text-slate-800 dark:text-white/90 placeholder-slate-400 dark:placeholder-white/30 border-0 outline-none py-1 min-w-0"
                  placeholder="Empty your mind — what do you want to get done today?"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  autoFocus
                  maxLength={2000}
                />
                {text.trim() ? (
                  <button
                    type="submit"
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 fade-in-soft transition-colors"
                  >
                    <Plus size={13} /> Add ↵
                  </button>
                ) : (
                  <span className="shrink-0 hidden sm:inline text-[11px] text-slate-400 dark:text-white/25 font-medium pr-1">
                    Enter ↵
                  </span>
                )}
              </div>
            </div>
          </form>

          {/* ── Empty state ──────────────────────────────────────── */}
          {open.length === 0 && done.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-200 dark:border-white/[0.08] p-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-500/10 dark:to-indigo-500/10 flex items-center justify-center mx-auto mb-3">
                <Sparkles size={22} className="text-blue-400 dark:text-blue-400/70" />
              </div>
              <div className="text-sm font-bold text-slate-700 dark:text-white/60 mb-1">
                A clear head starts here
              </div>
              <div className="text-xs text-slate-400 dark:text-white/25 max-w-xs mx-auto leading-relaxed">
                Jot anything — ideas, blockers, follow-ups. Unfinished notes carry over automatically.
              </div>
            </div>
          )}

          {/* ── Open notes list ──────────────────────────────────── */}
          {open.length > 0 && (
            <div className="space-y-1">
              {open.map((n) => {
                const isChecking = justDone === n.id;
                return (
                  <div
                    key={n.id}
                    className={`
                      group flex items-center min-w-0 gap-3 rounded-xl px-3.5 py-2.5 border
                      transition-all duration-200
                      ${
                        isChecking
                          ? 'border-emerald-200 dark:border-emerald-500/25 bg-emerald-50/80 dark:bg-emerald-500/[0.08] scale-[0.995]'
                          : 'border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-white/[0.025] hover:border-slate-300 dark:hover:border-white/12 hover:shadow-sm dark:hover:bg-white/[0.045]'
                      }
                    `}
                  >
                    <button
                      onClick={() => toggle(n)}
                      aria-label="Mark done"
                      className={`
                        w-[18px] h-[18px] rounded-[5px] border flex items-center justify-center shrink-0
                        transition-all duration-200
                        ${
                          isChecking
                            ? 'border-emerald-500 bg-emerald-500'
                            : 'border-slate-300 dark:border-white/20 hover:border-emerald-400 dark:hover:border-emerald-400/50 hover:bg-emerald-50 dark:hover:bg-emerald-400/[0.08]'
                        }
                      `}
                      style={isChecking ? { transform: 'scale(1.15)' } : {}}
                    >
                      {isChecking && <Check size={11} className="text-white" strokeWidth={3} />}
                    </button>

                    {editingId === n.id ? (
                      <textarea
                        autoFocus
                        rows={1}
                        className="input min-w-0 flex-1 text-sm py-1 resize-none leading-relaxed whitespace-pre-wrap break-words overflow-hidden"
                        value={editText}
                        maxLength={2000}
                        onFocus={(e) => {
                          e.currentTarget.style.height = 'auto';
                          e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px';
                          const len = e.currentTarget.value.length;
                          e.currentTarget.setSelectionRange(len, len);
                        }}
                        onChange={(e) => {
                          setEditText(e.target.value);
                          e.target.style.height = 'auto';
                          e.target.style.height = e.target.scrollHeight + 'px';
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            saveEdit(n);
                          }
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        onBlur={() => saveEdit(n)}
                      />
                    ) : (
                      <span
                        className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm text-slate-700 dark:text-white/80 cursor-text hover:text-slate-900 dark:hover:text-white leading-relaxed"
                        onClick={() => startEdit(n)}
                        title="Click to edit"
                      >
                        {n.text}
                      </span>
                    )}

                    <div className="shrink-0 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {n.promotedTaskId ? (
                        <a
                          href={`/tasks/${n.promotedTaskId}`}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300"
                        >
                          <BookmarkCheck size={12} strokeWidth={2.5} /> tracked
                        </a>
                      ) : editingId !== n.id ? (
                        <button
                          onClick={() => setPromote(n)}
                          title="Promote to tracked task"
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                        >
                          <Zap size={11} strokeWidth={2.5} /> track
                        </button>
                      ) : null}
                      <button
                        onClick={() => remove(n)}
                        aria-label="Delete"
                        className="p-0.5 rounded text-slate-300 dark:text-white/15 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Completed — tucked into an expandable section below ─────── */}
          {done.length > 0 && (
            <div className="mt-5">
              <button
                onClick={() => setShowDone((v) => !v)}
                className="inline-flex items-center gap-1.5 text-[12px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-white/60 transition-colors"
              >
                <ChevronRight
                  size={14}
                  className={`shrink-0 transition-transform ${showDone ? 'rotate-90' : ''}`}
                />
                Completed ({done.length})
              </button>
              {showDone && (
                <div className="mt-2 space-y-1 fade-in-soft">
                  {done.map((n) => (
                    <div
                      key={n.id}
                      className="group flex items-center min-w-0 gap-3 rounded-xl border border-slate-200/60 px-3.5 py-2.5 dark:border-white/[0.05] bg-slate-50/50 dark:bg-white/[0.02]"
                    >
                      <button
                        onClick={() => toggle(n)}
                        aria-label="Mark not done"
                        className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border border-emerald-500 bg-emerald-500 transition-opacity hover:opacity-80"
                      >
                        <Check size={11} className="text-white" strokeWidth={3} />
                      </button>
                      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-400 line-through dark:text-white/40">
                        {n.text}
                      </span>
                      <div className="flex shrink-0 items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                        {n.promotedTaskId && (
                          <a
                            href={`/tasks/${n.promotedTaskId}`}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
                          >
                            <BookmarkCheck size={12} /> task
                          </a>
                        )}
                        <button
                          onClick={() => remove(n)}
                          aria-label="Delete"
                          className="rounded p-0.5 text-slate-300 transition-colors hover:text-red-500 dark:text-white/15 dark:hover:text-red-400"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <TodayFromProjects />
        </div>
      </div>

      {/* Secondary sticky-notes tool — off for a focused launch (see
          lib/features); re-enable per-deployment with
          NEXT_PUBLIC_SCRATCHPAD_ENABLED=1. The whiteboard graduated to its own
          first-class page at /whiteboard — thinking is not a secondary tool. */}
      {SCRATCHPAD_ENABLED && <NotesFAB />}

      {/* Promote modal */}
      {promote && (
        <PromoteModal
          note={promote}
          canCreateShared={isLead}
          onClose={() => setPromote(null)}
          onDone={() => {
            setPromote(null);
            load();
          }}
        />
      )}
    </div>
  );
}

/* ── Promote modal ────────────────────────────────────────────────────── */
function PromoteModal({
  note,
  canCreateShared,
  onClose,
  onDone,
}: {
  note: Note;
  canCreateShared: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState('');
  const [phases, setPhases] = useState<{ id: string; name: string }[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [phaseId, setPhaseId] = useState('');
  const [priority, setPriority] = useState('medium');
  const [assigneeId, setAssignee] = useState('');
  const [due, setDue] = useState('');
  const [privateToMe, setPrivateToMe] = useState(!canCreateShared);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api<any[]>('/projects')
      .then((p) => {
        setProjects(p);
        if (p[0]) setProjectId(p[0].id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!projectId) {
      setPhases([]);
      setMembers([]);
      return;
    }
    setPhaseId('');
    setAssignee('');
    const proj = projects.find((p) => p.id === projectId);
    setPhases((proj?.phases || []).map((ph: any) => ({ id: ph.id, name: ph.name })));
    if (privateToMe || !canCreateShared) {
      setMembers([]);
      setLoadingMeta(false);
      return;
    }
    setLoadingMeta(true);
    api<any[]>(`/users${proj?.teamId ? `?teamId=${proj.teamId}` : ''}`)
      .then((r) => setMembers(r))
      .catch(() => setMembers([]))
      .finally(() => setLoadingMeta(false));
  }, [projectId, projects, privateToMe, canCreateShared]);

  async function go() {
    if (!projectId) {
      setErr('Pick a project.');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const body: any = { projectId, title: note.text, priority, privateToMe };
      if (phaseId) body.phaseId = phaseId;
      if (!privateToMe && assigneeId) body.assigneeId = assigneeId;
      if (due) body.dueDate = due;
      const task = await api<{ id: string }>('/tasks', { method: 'POST', body });
      await api(`/scratch/${note.id}`, { method: 'PATCH', body: { done: true, promotedTaskId: task.id } });
      // A promoted task can carry a due date — refresh the sidebar calendar so
      // its dot appears immediately (the app's convention for date changes).
      if (due) notifyCalendarChange();
      onDone();
    } catch (e: any) {
      setErr(e.message || 'Could not create the task.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 overflow-y-auto overlay-in"
        style={{ background: 'rgba(0,0,0,0.45)' }}
        onClick={onClose}
      >
        <div className="flex min-h-full items-center justify-center p-4">
          <div
            className="w-full max-w-sm modal-in rounded-2xl border p-6 shadow-2xl"
            style={{ background: 'var(--bg-page) ' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <div className="w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-500/15 flex items-center justify-center">
                    <ArrowRight size={13} className="text-blue-600 dark:text-blue-400" />
                  </div>
                  <span className="text-base font-bold text-slate-900 dark:text-white/90">
                    Add to project
                  </span>
                </div>
                <p className="text-xs text-slate-400 dark:text-white/35 ml-8">
                  Turn this thought into project work — or keep it private to you.
                </p>
              </div>
              <button
                onClick={onClose}
                className="text-slate-300 dark:text-white/25 hover:text-slate-500 dark:hover:text-white/50 transition-colors p-0.5 rounded"
              >
                <X size={18} />
              </button>
            </div>

            <div className="rounded-lg border-l-4 border-blue-300 dark:border-blue-500/50 bg-blue-50/70 dark:bg-blue-500/[0.08] px-3 py-2.5 mb-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-blue-500 dark:text-blue-400/70 mb-0.5">
                Note
              </div>
              <p className="text-sm text-slate-700 dark:text-white/75 leading-relaxed">{note.text}</p>
            </div>

            <label className="label">Project</label>
            <div className="mb-3">
              <Select
                value={projectId}
                onChange={setProjectId}
                ariaLabel="Project"
                placeholder={projects.length === 0 ? 'No projects available' : 'Select a project'}
                options={projects.map((p) => ({ value: p.id, label: p.name }))}
              />
            </div>

            <button
              type="button"
              onClick={() => canCreateShared && setPrivateToMe((v) => !v)}
              className={`w-full mb-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${privateToMe ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600 dark:bg-white/[0.03]'}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Shield size={14} className={privateToMe ? 'text-emerald-600' : 'text-slate-400'} />
                  <div>
                    <div className="text-xs font-black">Track this task as private</div>
                    <div className="text-[10px] opacity-70 mt-0.5">
                      {canCreateShared
                        ? 'Visible only to you, while linked to the selected project.'
                        : 'Contributor notes are tracked privately and stay visible only to you.'}
                    </div>
                  </div>
                </div>
                <span
                  className={`w-9 h-5 rounded-full p-0.5 transition-colors ${privateToMe ? 'bg-emerald-500' : 'bg-slate-200'}`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-white transition-transform ${privateToMe ? 'translate-x-4' : ''}`}
                  />
                </span>
              </div>
            </button>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="label">Phase</label>
                <Select
                  value={phaseId}
                  onChange={setPhaseId}
                  ariaLabel="Phase"
                  disabled={loadingMeta || phases.length === 0}
                  placeholder={phases.length === 0 ? 'No phases' : 'Unassigned'}
                  options={[
                    { value: '', label: phases.length === 0 ? 'No phases' : 'Unassigned' },
                    ...phases.map((ph) => ({ value: ph.id, label: ph.name })),
                  ]}
                />
              </div>
              <div className={privateToMe ? 'hidden' : ''}>
                <label className="label">Priority</label>
                <Select
                  value={priority}
                  onChange={setPriority}
                  ariaLabel="Priority"
                  options={[
                    { value: 'low', label: 'Low' },
                    { value: 'medium', label: 'Medium' },
                    { value: 'high', label: 'High' },
                    { value: 'critical', label: 'Critical' },
                  ]}
                />
              </div>
            </div>

            <div className={`grid gap-3 mb-4 ${privateToMe ? 'grid-cols-1' : 'grid-cols-2'}`}>
              <div className={privateToMe ? 'hidden' : ''}>
                <label className="label">Assign to</label>
                <Select
                  value={assigneeId}
                  onChange={setAssignee}
                  ariaLabel="Assign to"
                  disabled={loadingMeta}
                  placeholder="Unassigned"
                  options={[
                    { value: '', label: 'Unassigned' },
                    ...members.map((u) => ({ value: u.id, label: u.name })),
                  ]}
                />
              </div>
              <div>
                <label className="label">Due date</label>
                <DatePicker value={due} onChange={(v) => setDue(v || '')} block />
              </div>
            </div>

            {err && (
              <div className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg px-3 py-2.5 mb-4">
                {err}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={onClose} className="btn-secondary flex-1 justify-center text-sm">
                Cancel
              </button>
              <button
                onClick={go}
                disabled={saving || !projectId}
                className="btn-primary flex-1 justify-center text-sm"
              >
                {saving ? 'Creating…' : 'Create task'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

/* ── Today from your projects ────────────────────────────────────────────────
   My Day is the personal cockpit, but the day also has assigned work. This
   pulls the viewer's Daily Brief (same object as the dashboard card) and
   shows at most five due/overdue rows under the capture input — so the page
   answers "what should I do today?" even when the personal list is empty.
   Silent while loading; one warm line when there is nothing due. */
function TodayFromProjects() {
  const [brief, setBrief] = useState<any | null>(null);

  useEffect(() => {
    api('/me/brief')
      .then((b: any) => setBrief(b))
      .catch(() => setBrief({ my: { overdue: [], today: [], soon: [] } }));
  }, []);

  if (!brief) return null;
  const rows = [
    ...(brief.my?.overdue || []).map((t: any) => ({ ...t, tone: 'overdue' })),
    ...(brief.my?.today || []).map((t: any) => ({ ...t, tone: 'today' })),
    ...(brief.my?.soon || []).map((t: any) => ({ ...t, tone: 'soon' })),
  ].slice(0, 5);

  // Renders nothing when there is nothing due — an empty reminder card is
  // noise on a page about focus.
  if (rows.length === 0) return null;

  return (
    <div className="mt-5 rounded-xl border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-white/[0.025] px-3.5 py-2.5">
      <div className="flex items-center gap-2 mb-1">
        <FolderKanban size={12} className="text-slate-400 dark:text-white/30 shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-white/30">
          Today from your projects
        </span>
      </div>
      {rows.map((t: any) => (
        <Link key={t.id} href={`/tasks/${t.id}`} className="flex items-center gap-2 py-1 group/tfp min-w-0">
          <span
            className={`shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md ${
              t.tone === 'overdue'
                ? 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-500/10'
                : t.tone === 'today'
                  ? 'text-blue-700 bg-blue-50 dark:text-blue-400 dark:bg-blue-500/10'
                  : 'text-slate-600 bg-slate-100 dark:text-white/50 dark:bg-white/[0.06]'
            }`}
          >
            {t.label}
          </span>
          <span className="text-[12.5px] text-slate-700 dark:text-white/70 truncate group-hover/tfp:text-blue-700 dark:group-hover/tfp:text-blue-400 transition-colors">
            {t.title}
          </span>
          {t.projectName && (
            <span className="text-[10.5px] text-slate-400 dark:text-white/30 truncate shrink-0 max-w-[140px]">
              · {t.projectName}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}
