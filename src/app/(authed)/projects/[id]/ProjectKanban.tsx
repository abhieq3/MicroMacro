/**
 * Project Kanban — desktop drag-drop + mobile status list.
 * Lazy-loaded from ProjectDetailClient so phase view stays light.
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ModalPortal } from '@/components/ModalPortal';
import { PriorityTag, formatDate } from '@/components/ui';
import { useCurrentUser } from '@/components/CurrentUserContext';
import { useIsDark } from '@/lib/client/useIsDark';
import { playDropTick } from '@/lib/sound';
import { GripVertical, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';

export const STATUSES = ['todo', 'in_progress', 'review', 'blocked', 'done'] as const;

export const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  todo: { label: 'To Do', color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' },
  in_progress: { label: 'In Progress', color: '#1565C0', bg: '#eff6ff', border: '#bfdbfe' },
  review: { label: 'Review', color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  blocked: { label: 'Blocked', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  done: { label: 'Done', color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
};

const COLUMN_WIDTH = 230;
const COLUMN_GAP = 12;

export function KanbanBoard({
  tasks,
  onDropReorder,
  isLead,
  canDelete,
  onDelete,
}: {
  tasks: any[];
  onDropReorder: (taskId: string, toStatus: string, orderedIds: string[]) => void;
  isLead: boolean;
  /** Deleting is owner-only — stricter than the manage (isLead) gate. */
  canDelete: boolean;
  onDelete: (taskId: string) => void;
}) {
  const dark = useIsDark();
  const currentUser = useCurrentUser();
  const meId = currentUser?.id ? String(currentUser.id) : '';
  const soundEnabled = !!currentUser?.soundDropEnabled;

  function canDragTask(task: any): boolean {
    if (isLead) return true;
    return !!(meId && task.assigneeId && String(task.assigneeId) === meId);
  }
  const [localTasks, setLocalTasks] = useState<any[]>(tasks);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // Where the dragged card would land: a column + the insertion index within it.
  const [dragOver, setDragOver] = useState<{ col: string; index: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Tasks of one column, in persisted order.
  const colSorted = (col: string) =>
    localTasks.filter((t) => t.status === col).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  useEffect(() => {
    setLocalTasks(tasks);
  }, [tasks]);

  // Track whether the scroller can be scrolled in either direction so we
  // can show/hide the arrow buttons.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const sync = () => {
      const max = el.scrollWidth - el.clientWidth;
      setCanLeft(el.scrollLeft > 4);
      setCanRight(el.scrollLeft < max - 4);
    };
    sync();
    el.addEventListener('scroll', sync, { passive: true });
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', sync);
      ro.disconnect();
    };
  }, [localTasks.length]);

  function scrollByCols(dir: -1 | 1) {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * (COLUMN_WIDTH + COLUMN_GAP) * 2, behavior: 'smooth' });
  }

  function handleDragStart(e: React.DragEvent, taskId: string) {
    setDraggingId(taskId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
  }
  function handleDragEnd() {
    setDraggingId(null);
    setDragOver(null);
  }

  // Hovering a specific card: insert before it or after it depending on which
  // half of the card the pointer is over. stopPropagation so the column-level
  // handler doesn't override this precise index.
  function handleCardDragOver(e: React.DragEvent, col: string, index: number) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    setDragOver({ col, index: after ? index + 1 : index });
  }
  // Hovering the column but not a card → drop at the end.
  function handleColDragOver(e: React.DragEvent, col: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver({ col, index: colSorted(col).length });
  }

  function handleDrop(e: React.DragEvent, col: string) {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain') || draggingId;
    const dragged = taskId ? localTasks.find((t) => t.id === taskId) : null;
    if (!taskId || !dragged) {
      setDraggingId(null);
      setDragOver(null);
      return;
    }

    const insertIndex = dragOver && dragOver.col === col ? dragOver.index : colSorted(col).length;
    const list = colSorted(col).filter((t) => t.id !== taskId);
    const clamped = Math.max(0, Math.min(insertIndex, list.length));
    list.splice(clamped, 0, dragged);
    const orderedIds = list.map((t) => t.id);

    // No-op guard: same column, same position.
    const before = colSorted(col).map((t) => t.id);
    if (dragged.status === col && before.join() === orderedIds.join()) {
      setDraggingId(null);
      setDragOver(null);
      return;
    }

    // Optimistic: apply the new status + positions immediately.
    setLocalTasks((prev) =>
      prev.map((t) => {
        const i = orderedIds.indexOf(t.id);
        if (t.id === taskId) return { ...t, status: col, position: i >= 0 ? i : t.position };
        return i >= 0 ? { ...t, position: i } : t;
      }),
    );
    setDraggingId(null);
    setDragOver(null);
    // Audible cue confirming the move — only fires when the drop actually
    // changed something (the no-op guard above already returned).
    playDropTick(soundEnabled);
    onDropReorder(taskId, col, orderedIds);
  }

  // ── Top scrollbar — mirrors the bottom one so a Kanban with many
  // columns can be panned from either end of the board.
  const topScrollRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef<'top' | 'bottom' | null>(null);
  useEffect(() => {
    const top = topScrollRef.current;
    const bottom = scrollRef.current;
    if (!top || !bottom) return;
    const sync = (from: 'top' | 'bottom') => () => {
      if (syncingRef.current && syncingRef.current !== from) return;
      syncingRef.current = from;
      if (from === 'top') bottom.scrollLeft = top.scrollLeft;
      else top.scrollLeft = bottom.scrollLeft;
      // Let the next event re-arm
      requestAnimationFrame(() => {
        syncingRef.current = null;
      });
    };
    const onTop = sync('top');
    const onBottom = sync('bottom');
    top.addEventListener('scroll', onTop, { passive: true });
    bottom.addEventListener('scroll', onBottom, { passive: true });
    return () => {
      top.removeEventListener('scroll', onTop);
      bottom.removeEventListener('scroll', onBottom);
    };
  }, []);
  const totalWidth = COLUMN_WIDTH * STATUSES.length + 12 * (STATUSES.length - 1);

  return (
    <div className="relative">
      {/* Top scrollbar — proxies its scrollLeft to the bottom scroller below */}
      <div
        ref={topScrollRef}
        className="overflow-x-auto kanban-scroll mb-1"
        style={{ height: 12 }}
        aria-hidden="true"
      >
        <div style={{ width: totalWidth, height: 1 }} />
      </div>

      {/* Left arrow — shown on all viewports (mobile needs it too) */}
      <button
        type="button"
        aria-label="Scroll left"
        onClick={() => scrollByCols(-1)}
        className={`flex absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 w-9 h-9 items-center justify-center rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 shadow-md transition-all ${
          canLeft ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <ChevronLeft size={16} />
      </button>

      {/* Right arrow — shown on all viewports */}
      <button
        type="button"
        aria-label="Scroll right"
        onClick={() => scrollByCols(1)}
        className={`flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-20 w-9 h-9 items-center justify-center rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 shadow-md transition-all ${
          canRight ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <ChevronRight size={16} />
      </button>

      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-3 kanban-scroll scroll-smooth"
        style={{ minHeight: 480, scrollSnapType: 'x mandatory' }}
      >
        {STATUSES.map((col) => {
          const meta = STATUS_META[col];
          const colTasks = colSorted(col);
          const isOver = dragOver?.col === col;
          const isDragging = !!draggingId;
          return (
            <div
              key={col}
              className="kanban-col shrink-0 flex flex-col rounded-xl transition-all duration-150"
              style={{
                width: COLUMN_WIDTH,
                scrollSnapAlign: 'start',
                background: isOver
                  ? dark
                    ? 'rgba(255,255,255,0.04)'
                    : meta.bg
                  : dark
                    ? 'rgba(255,255,255,0.02)'
                    : '#f8fafc',
                border: `2px solid ${isOver ? meta.border : dark ? 'rgba(255,255,255,0.08)' : '#e9eef5'}`,
                boxShadow: isOver ? `0 0 0 3px ${meta.border}` : undefined,
              }}
              onDragOver={(e) => handleColDragOver(e, col)}
              onDrop={(e) => handleDrop(e, col)}
            >
              <div className="px-3 pt-3 pb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.color }} />
                  <span className="text-xs font-bold uppercase tracking-wide" style={{ color: meta.color }}>
                    {meta.label}
                  </span>
                </div>
                <span
                  className="text-xs font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: meta.border, color: meta.color }}
                >
                  {colTasks.length}
                </span>
              </div>
              <div className="flex-1 px-2 pb-2 space-y-2 min-h-[80px]">
                {colTasks.map((t, index) => {
                  const isDraggingThis = draggingId === t.id;
                  const showLineBefore =
                    isDragging && !isDraggingThis && dragOver?.col === col && dragOver.index === index;
                  return (
                    <div key={t.id}>
                      {showLineBefore && (
                        <div className="h-0.5 rounded-full mb-2" style={{ background: meta.color }} />
                      )}
                      <div
                        draggable={canDragTask(t)}
                        onDragStart={(e) => {
                          if (!canDragTask(t)) {
                            e.preventDefault();
                            return;
                          }
                          handleDragStart(e, t.id);
                        }}
                        onDragEnd={handleDragEnd}
                        onDragOver={(e) => handleCardDragOver(e, col, index)}
                        className={`group relative rounded-lg border transition-all duration-150 ${
                          canDragTask(t) ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
                        }`}
                        style={{
                          background: dark ? '#1e293b' : '#ffffff',
                          borderColor: isDraggingThis
                            ? meta.color
                            : dark
                              ? 'rgba(255,255,255,0.1)'
                              : '#e2e8f0',
                          boxShadow: isDraggingThis
                            ? `0 8px 24px rgba(0,0,0,0.15), 0 0 0 2px ${meta.color}`
                            : '0 1px 3px rgba(0,0,0,0.06)',
                          opacity: isDraggingThis ? 0.5 : isDragging ? 0.85 : 1,
                          transform: isDraggingThis ? 'rotate(1.5deg) scale(1.02)' : undefined,
                        }}
                      >
                        <div
                          className="absolute left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-40 transition-opacity"
                          style={{ color: meta.color }}
                        >
                          <GripVertical size={12} />
                        </div>
                        {canDelete && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              onDelete(t.id);
                            }}
                            draggable={false}
                            aria-label="Delete task"
                            className="absolute top-1 right-1 z-10 sm:opacity-0 sm:group-hover:opacity-100 p-2 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"
                          >
                            <Trash2 size={11} />
                          </button>
                        )}
                        <Link
                          href={`/tasks/${t.id}`}
                          className="block p-3 pl-4"
                          onClick={(e) => isDragging && e.preventDefault()}
                        >
                          <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 leading-snug line-clamp-2">
                            {t.title}
                          </div>
                          {(t.requiresQaSignoff || (t.priority && t.priority !== 'low')) && (
                            <div className="mt-1.5 flex gap-1 flex-wrap">
                              {t.requiresQaSignoff && !t.qaSignoffAt && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-100">
                                  Approval
                                </span>
                              )}
                              {t.requiresQaSignoff && t.qaSignoffAt && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">
                                  Approved ✓
                                </span>
                              )}
                              {t.priority && t.priority !== 'low' && <PriorityTag priority={t.priority} />}
                            </div>
                          )}
                          <div className="mt-2 flex items-center justify-between">
                            <span className="text-[10px] text-slate-400 truncate">
                              {t.assigneeName || 'Unassigned'}
                            </span>
                            {t.dueDate && (
                              <span className="text-[10px] text-slate-400 font-mono shrink-0 ml-1">
                                {formatDate(t.dueDate)}
                              </span>
                            )}
                          </div>
                          {t.subtaskCount > 0 && (
                            <div className="mt-2">
                              <div className="h-1 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${Math.round((t.subtasksDone / t.subtaskCount) * 100)}%`,
                                    background: meta.color,
                                  }}
                                />
                              </div>
                              <div className="text-[9px] text-slate-400 mt-0.5">
                                {t.subtasksDone}/{t.subtaskCount} subtasks
                              </div>
                            </div>
                          )}
                        </Link>
                      </div>
                    </div>
                  );
                })}
                {/* Trailing insertion indicator (drop at end of column) */}
                {isDragging &&
                  colTasks.length > 0 &&
                  dragOver?.col === col &&
                  dragOver.index >= colTasks.length && (
                    <div className="h-0.5 rounded-full" style={{ background: meta.color }} />
                  )}
                {colTasks.length === 0 && (
                  <div
                    className="rounded-lg border-2 border-dashed flex items-center justify-center h-16 transition-all duration-150 text-center px-2"
                    style={{
                      borderColor: isOver ? meta.color : dark ? 'rgba(255,255,255,0.12)' : '#e2e8f0',
                      background: isOver ? (dark ? 'rgba(255,255,255,0.04)' : meta.bg) : 'transparent',
                    }}
                  >
                    <span
                      className="text-xs leading-tight"
                      style={{ color: isOver ? meta.color : '#94a3b8' }}
                    >
                      {isOver ? 'Drop here' : isDragging ? 'Move card here' : 'No tasks'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Kanban board — MOBILE ────────────────────────────────────────────────────
   The horizontally-scrolling, drag-and-drop desktop board is unusable on a
   phone (tiny columns, drag fights the page scroll). On mobile we render a
   purpose-built view instead: a status tab strip across the top, then the
   selected status's cards as a full-width vertical list. Moving a card is a
   tap — a "Move to" sheet — not a drag, which is far more reliable on touch.
   This component is only mounted below `md`, so the desktop experience is
   completely untouched. */
export function KanbanBoardMobile({
  tasks,
  onMove,
  isLead,
  canDelete,
  onDelete,
}: {
  tasks: any[];
  onMove: (taskId: string, toStatus: string, orderedIds: string[]) => void;
  isLead: boolean;
  /** Deleting is owner-only — stricter than the manage (isLead) gate. */
  canDelete: boolean;
  onDelete: (taskId: string) => void;
}) {
  const currentUser = useCurrentUser();
  const meId = currentUser?.id ? String(currentUser.id) : '';
  const [active, setActive] = useState<string>('todo');
  const [moving, setMoving] = useState<any | null>(null);

  function canMoveTask(task: any): boolean {
    if (isLead) return true;
    return !!(meId && task.assigneeId && String(task.assigneeId) === meId);
  }

  const byStatus = (s: string) =>
    tasks
      .filter((t) => t.status === s)
      .sort((a, b) => {
        const ad = a.ccTcd
          ? new Date(a.ccTcd).getTime()
          : a.dueDate
            ? new Date(a.dueDate).getTime()
            : Infinity;
        const bd = b.ccTcd
          ? new Date(b.ccTcd).getTime()
          : b.dueDate
            ? new Date(b.dueDate).getTime()
            : Infinity;
        return ad - bd;
      });

  const colTasks = byStatus(active);

  function move(toStatus: string) {
    if (!moving) return;
    const dest = byStatus(toStatus)
      .map((t) => t.id)
      .filter((id) => id !== moving.id);
    dest.push(moving.id);
    onMove(moving.id, toStatus, dest);
    setMoving(null);
    setActive(toStatus);
  }

  return (
    <div>
      {/* Status tabs — horizontally scrollable chips with live counts. */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1 kanban-scroll">
        {STATUSES.map((s) => {
          const meta = STATUS_META[s];
          const n = tasks.filter((t) => t.status === s).length;
          const on = active === s;
          return (
            <button
              key={s}
              onClick={() => setActive(s)}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all"
              style={{
                background: on ? meta.color : meta.bg,
                color: on ? '#fff' : meta.color,
                border: `1.5px solid ${on ? meta.color : meta.border}`,
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: on ? '#fff' : meta.color }} />
              {meta.label}
              <span className="text-[10px] font-black opacity-90">{n}</span>
            </button>
          );
        })}
      </div>

      {/* Cards for the selected status — full-width vertical list. */}
      <div className="space-y-2 mt-1">
        {colTasks.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-slate-200 dark:border-white/10 py-10 text-center text-sm text-slate-400">
            No tasks in {STATUS_META[active].label}.
          </div>
        ) : (
          colTasks.map((t) => {
            const meta = STATUS_META[t.status] || STATUS_META.todo;
            return (
              <div
                key={t.id}
                className="relative rounded-xl border bg-white dark:bg-slate-800 dark:border-white/10"
                style={{ borderColor: '#e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
              >
                <Link href={`/tasks/${t.id}`} className="block p-3.5">
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-snug pr-8">
                    {t.title}
                  </div>
                  {(t.requiresQaSignoff || (t.priority && t.priority !== 'low')) && (
                    <div className="mt-2 flex gap-1.5 flex-wrap">
                      {t.requiresQaSignoff && !t.qaSignoffAt && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-100">
                          Approval
                        </span>
                      )}
                      {t.requiresQaSignoff && t.qaSignoffAt && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">
                          Approved ✓
                        </span>
                      )}
                      {t.priority && t.priority !== 'low' && <PriorityTag priority={t.priority} />}
                    </div>
                  )}
                  <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-400">
                    <span className="truncate">{t.assigneeName || 'Unassigned'}</span>
                    {(t.ccTcd || t.dueDate) && (
                      <span className="font-mono shrink-0 ml-2">{formatDate(t.ccTcd || t.dueDate)}</span>
                    )}
                  </div>
                  {t.subtaskCount > 0 && (
                    <div className="mt-2">
                      <div className="h-1 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.round((t.subtasksDone / t.subtaskCount) * 100)}%`,
                            background: meta.color,
                          }}
                        />
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {t.subtasksDone}/{t.subtaskCount} subtasks
                      </div>
                    </div>
                  )}
                </Link>
                {/* Card actions: Move (lead) + Delete (owner-only). Big tap targets. */}
                {(canMoveTask(t) || canDelete) && (
                  <div className="flex items-stretch border-t border-slate-100 dark:border-white/5">
                    {canMoveTask(t) && (
                      <button
                        onClick={() => setMoving(t)}
                        className="flex-1 py-2.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 dark:hover:bg-white/5 transition-colors inline-flex items-center justify-center gap-1.5"
                      >
                        <ChevronRight size={13} /> Move
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => onDelete(t.id)}
                        className="w-12 py-2.5 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-white/5 transition-colors inline-flex items-center justify-center border-l border-slate-100 dark:border-white/5"
                        aria-label="Delete task"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Move-to bottom sheet */}
      {moving && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
            onClick={() => setMoving(null)}
          >
            <div
              className="w-full max-w-md bg-white dark:bg-[#262624] rounded-t-2xl p-4 pb-6 modal-in"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-white/15 mx-auto mb-3" />
              <div className="text-sm font-bold text-slate-800 dark:text-white/90 mb-1 truncate">
                Move "{moving.title}"
              </div>
              <div className="text-xs text-slate-400 mb-3">Choose a new status</div>
              <div className="space-y-1.5">
                {STATUSES.filter((s) => s !== moving.status).map((s) => {
                  const meta = STATUS_META[s];
                  return (
                    <button
                      key={s}
                      onClick={() => move(s)}
                      className="w-full flex items-center gap-2.5 px-3 py-3 rounded-xl border text-left hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                      style={{ borderColor: meta.border }}
                    >
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: meta.color }} />
                      <span className="text-sm font-semibold" style={{ color: meta.color }}>
                        {meta.label}
                      </span>
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setMoving(null)}
                className="w-full mt-3 py-2.5 rounded-xl text-sm font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
