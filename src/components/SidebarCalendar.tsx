'use client';

// ── Sidebar mini-calendar ───────────────────────────────────────────────────
// A compact month grid pinned in the sidebar, just above "My Day". Each day
// that has open work due gets a small dot — blue for my own tasks, green for
// my teams' tasks, red when something on that day is overdue. Hovering a day
// raises a floating card listing what's due. Swiping up/down changes the month.
// Only current-month days are rendered; no 6-week overflow spillage.
//
// Data comes from the read-only /api/me/calendar feed (scoped to the user and
// the teams they lead/belong to). Results are cached per-range in-module so the
// hover-expand sidebar never refetches on remount.

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '@/lib/client/api';

interface CalTask {
  id: string;
  title: string;
  status: string;
  due: string; // ISO
  mine: boolean;
  assigneeName: string | null;
  teamName: string | null;
  projectRef: string | null;
  priority: string | null;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
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

// Local YYYY-MM-DD key (avoids UTC drift from toISOString).
function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Extract first name from a full name string.
function firstName(name: string | null | undefined): string {
  if (!name) return '';
  return name.trim().split(/\s+/)[0];
}

// Per-range cache shared across mounts so the hover-expand sidebar is instant.
// Module-level, so it survives unmounts — but that also means it survives a
// login switch in the same tab. MUST be cleared on logout (see
// clearSidebarCalendarCache) or the next signed-in user briefly sees the
// previous user's calendar until their own fetch lands.
const rangeCache = new Map<string, CalTask[]>();

export function clearSidebarCalendarCache() {
  rangeCache.clear();
}

/** Call after any task create/edit/delete (especially a date change) so the
 *  sidebar calendar dots refresh immediately, app-wide, without a reload. */
export function notifyCalendarChange() {
  rangeCache.clear();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('pragati:calendar-refresh'));
  }
}

export function SidebarCalendar({ dark }: { dark: boolean }) {
  const router = useRouter();
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [tasks, setTasks] = useState<CalTask[]>([]);
  const [hover, setHover] = useState<{ key: string; x: number; y: number; placeLeft: boolean } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Always visible when the sidebar is expanded. Due dates are core to the
  // product — hiding them behind a disclosure was friction without payoff.

  // Touch-swipe tracking for month navigation.
  const touchStartY = useRef<number | null>(null);

  const isCurrentMonth =
    cursor.getMonth() === today.getMonth() && cursor.getFullYear() === today.getFullYear();

  // Build a grid of exactly the days in the current month, with leading blank
  // cells to align to the correct day-of-week. No trailing overflow.
  const { grid, leadingBlanks } = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1));
    return { grid: days, leadingBlanks: firstDay };
  }, [cursor]);

  // Fetch range = first and last day of the visible month.
  const rangeFrom = dayKey(grid[0]);
  const rangeTo = dayKey(grid[grid.length - 1]);
  const rangeKey = `${rangeFrom}|${rangeTo}`;

  // Fetch the visible range. `force` bypasses the per-range cache — used when a
  // task's date changes elsewhere in the app so the dots reflect it at once.
  const loadRange = useCallback(
    (force = false) => {
      if (force) rangeCache.delete(rangeKey);
      const cached = rangeCache.get(rangeKey);
      if (cached) {
        setTasks(cached);
        return;
      }
      api<{ tasks: CalTask[] }>(`/me/calendar?from=${rangeFrom}&to=${rangeTo}`)
        .then((d) => {
          rangeCache.set(rangeKey, d.tasks);
          setTasks(d.tasks);
        })
        .catch(() => {});
    },
    [rangeKey, rangeFrom, rangeTo],
  );

  useEffect(() => {
    loadRange();
  }, [rangeKey, loadRange]);

  // Live refresh when tasks change elsewhere in the app.
  useEffect(() => {
    function onRefresh() {
      rangeCache.clear();
      loadRange(true);
    }
    window.addEventListener('pragati:calendar-refresh', onRefresh);
    return () => window.removeEventListener('pragati:calendar-refresh', onRefresh);
  }, [loadRange]);

  // Group tasks by local day key.
  const byDay = useMemo(() => {
    const m = new Map<string, CalTask[]>();
    for (const t of tasks) {
      const k = dayKey(new Date(t.due));
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(t);
    }
    return m;
  }, [tasks]);

  const todayKey = dayKey(today);

  function signals(list: CalTask[]) {
    let mine = false,
      team = false,
      overdue = false;
    for (const t of list) {
      if (t.mine) mine = true;
      else team = true;
      // Compare day-keys as strings (both via the same local dayKey) so a task
      // due *today* in a non-UTC zone (e.g. IST) isn't mis-flagged overdue —
      // new Date('YYYY-MM-DD') parses as UTC midnight and drifts by the offset.
      if (dayKey(new Date(t.due)) < todayKey && t.status !== 'done') overdue = true;
    }
    return { mine, team, overdue };
  }

  function openHover(key: string, el: HTMLElement) {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    const r = el.getBoundingClientRect();
    // Place the card to the right of the day cell, but flip to the left when
    // there isn't room (keeps it from spilling off-screen). Vertically it's
    // centred on the cell, then clamped so a bottom-row day's card never runs
    // past the viewport edges.
    const CARD_W = 248;
    const CARD_H = 240;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const placeLeft = r.right + CARD_W + 16 > vw;
    const x = placeLeft ? r.left - 10 : r.right + 10;
    const half = CARD_H / 2;
    const y = Math.max(half + 8, Math.min(r.top + r.height / 2, vh - half - 8));
    setHover({ key, x, y, placeLeft });
  }
  function closeHover() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHover(null), 80);
  }

  function hoverAccentColor(list: CalTask[]): string {
    const sig = signals(list);
    if (sig.overdue) return '#f4212e';
    if (sig.mine) return '#1d9bf0';
    return '#00ba7c';
  }

  const prevMonth = useCallback(() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1)), []);
  const nextMonth = useCallback(() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1)), []);
  const goToday = useCallback(() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1)), [today]);

  function onTouchStart(e: React.TouchEvent) {
    touchStartY.current = e.touches[0].clientY;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartY.current === null) return;
    const delta = e.changedTouches[0].clientY - touchStartY.current;
    touchStartY.current = null;
    if (Math.abs(delta) < 30) return; // ignore tiny taps
    // Swipe down (delta > 0) → previous month (scrolling calendar feed up)
    // Swipe up  (delta < 0) → next month
    if (delta > 0) prevMonth();
    else nextMonth();
  }

  const monthName = MONTHS[cursor.getMonth()];
  const monthYear = cursor.getFullYear();
  const hoverList = hover ? byDay.get(hover.key) || [] : [];

  return (
    <div
      className="mt-2 pt-2.5 border-t select-none"
      style={{ borderColor: dark ? '#2f3336' : '#eff3f4' }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Month header — always open */}
      <div className="flex items-center justify-between px-1 mb-1.5">
            <button
              onClick={prevMonth}
              className={`p-0.5 rounded transition-colors shrink-0 ${dark ? 'text-[#71767b] hover:text-[#e7e9ea] hover:bg-[rgba(231,233,234,0.1)]' : 'text-slate-300 hover:text-slate-500 hover:bg-slate-100'}`}
              aria-label="Previous month"
            >
              <ChevronLeft size={13} />
            </button>

            <button
              onClick={isCurrentMonth ? undefined : goToday}
              className={`flex items-baseline gap-1 text-[11px] tracking-tight transition-colors ${
                isCurrentMonth ? 'cursor-default' : 'hover:text-[#1d9bf0] cursor-pointer'
              }`}
              title={isCurrentMonth ? undefined : 'Back to this month'}
            >
              <span className={`font-bold ${dark ? 'text-[#e7e9ea]' : 'text-slate-700'}`}>{monthName}</span>
              <span className={`font-semibold ${dark ? 'text-[#71767b]' : 'text-slate-400'}`}>
                {monthYear}
              </span>
            </button>

            <button
              onClick={nextMonth}
              className={`p-0.5 rounded transition-colors shrink-0 ${dark ? 'text-[#71767b] hover:text-[#e7e9ea] hover:bg-[rgba(231,233,234,0.1)]' : 'text-slate-300 hover:text-slate-500 hover:bg-slate-100'}`}
              aria-label="Next month"
            >
              <ChevronRight size={13} />
            </button>
          </div>

          {/* Weekday header */}
          <div className="grid grid-cols-7 mb-0.5">
            {WEEKDAYS.map((d, i) => (
              <div
                key={i}
                className={`text-center text-[8px] font-bold ${dark ? 'text-white/20' : 'text-slate-300'}`}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Day grid — only current month's days, with leading blank cells */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {/* Leading blank cells to align the 1st to its weekday */}
            {Array.from({ length: leadingBlanks }, (_, i) => (
              <div key={`blank-${i}`} style={{ width: 24, height: 24 }} />
            ))}
            {grid.map((d) => {
              const k = dayKey(d);
              const isToday = k === todayKey;
              const list = byDay.get(k);
              const sig = list && list.length ? signals(list) : null;
              return (
                <div key={k} className="flex flex-col items-center">
                  <button
                    onMouseEnter={(e) => list && openHover(k, e.currentTarget)}
                    onMouseLeave={closeHover}
                    onClick={(e) => {
                      if (!list || list.length === 0) return;
                      // If already showing hover card, navigate to the first task
                      if (hover?.key === k) {
                        router.push(`/tasks/${list[0].id}`);
                        setHover(null);
                      } else {
                        openHover(k, e.currentTarget);
                      }
                    }}
                    className={`relative rounded-full flex items-center justify-center text-[10px] font-semibold transition-colors ${
                      list ? 'cursor-pointer' : 'cursor-default'
                    } ${
                      isToday
                        ? 'text-white'
                        : dark
                          ? 'text-white/60 hover:bg-white/5'
                          : 'text-slate-600 hover:bg-slate-100'
                    }`}
                    style={
                      isToday
                        ? {
                            width: 26,
                            height: 26,
                            background: dark ? '#e7e9ea' : '#0f1419',
                            color: dark ? '#000000' : '#ffffff',
                          }
                        : { width: 24, height: 24 }
                    }
                  >
                    {d.getDate()}
                  </button>
                  {/* Dots — mine blue, team green; overdue red */}
                  <div className="flex items-center gap-[2px] h-[5px] mt-[1px]">
                    {sig?.overdue && (
                      <span className="w-[4px] h-[4px] rounded-full" style={{ background: '#f4212e' }} />
                    )}
                    {!sig?.overdue && sig?.mine && (
                      <span className="w-[4px] h-[4px] rounded-full" style={{ background: '#1d9bf0' }} />
                    )}
                    {!sig?.overdue && sig?.team && (
                      <span className="w-[4px] h-[4px] rounded-full" style={{ background: '#00ba7c' }} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

      {/* Floating hover card */}
      {hover &&
        hoverList.length > 0 &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed z-[1200] -translate-y-1/2 pointer-events-auto"
            style={{
              left: hover.x,
              top: hover.y,
              transform: hover.placeLeft ? 'translate(-100%, -50%)' : 'translateY(-50%)',
            }}
            onMouseEnter={() => {
              if (hoverTimer.current) clearTimeout(hoverTimer.current);
            }}
            onMouseLeave={closeHover}
          >
            <div
              className="w-[248px] border p-2.5 overflow-hidden"
              style={{
                background: dark ? '#16181c' : '#ffffff',
                borderColor: dark ? '#2f3336' : '#eff3f4',
                borderRadius: 16,
                borderLeft: `3px solid ${hoverAccentColor(hoverList)}`,
              }}
            >
              <div
                className={`text-[11px] font-bold tracking-tight mb-1.5 ${dark ? 'text-[#e7e9ea]' : 'text-slate-700'}`}
              >
                {new Date(hover.key + 'T00:00:00').toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
              </div>
              <div className="space-y-1.5 max-h-[200px] overflow-y-auto no-scrollbar">
                {hoverList.slice(0, 5).map((t) => {
                  const overdue = dayKey(new Date(t.due)) < todayKey && t.status !== 'done';
                  return (
                    <button
                      key={t.id}
                      className="flex items-start gap-1.5 w-full text-left hover:opacity-75 transition-opacity"
                      onClick={() => {
                        router.push(`/tasks/${t.id}`);
                        setHover(null);
                      }}
                    >
                      <span
                        className="w-[5px] h-[5px] rounded-full mt-[5px] shrink-0"
                        style={{ background: overdue ? '#f4212e' : t.mine ? '#1d9bf0' : '#00ba7c' }}
                      />
                      <div className="min-w-0 flex-1">
                        <div
                          className={`text-[11px] font-medium leading-snug truncate ${dark ? 'text-[#e7e9ea]' : 'text-slate-700'}`}
                        >
                          {t.title}
                        </div>
                        <div
                          className={`text-[9.5px] mt-px flex items-center gap-1 min-w-0 ${dark ? 'text-[#71767b]' : 'text-slate-400'}`}
                        >
                          {t.mine ? (
                            <span className="font-semibold text-[#1d9bf0] shrink-0">You</span>
                          ) : t.assigneeName ? (
                            <span className="font-semibold shrink-0" style={{ color: '#00ba7c' }}>
                              {firstName(t.assigneeName)}
                            </span>
                          ) : t.teamName ? (
                            <span className="font-semibold shrink-0" style={{ color: '#00ba7c' }}>
                              {t.teamName}
                            </span>
                          ) : null}
                          {t.projectRef && (
                            <span className="font-mono truncate min-w-0 opacity-80">· {t.projectRef}</span>
                          )}
                          {overdue && <span className="font-semibold text-[#f4212e] shrink-0">· overdue</span>}
                        </div>
                      </div>
                    </button>
                  );
                })}
                {hoverList.length > 5 && (
                  <div
                    className={`text-[9.5px] font-semibold pt-0.5 ${dark ? 'text-[#71767b]' : 'text-slate-400'}`}
                  >
                    +{hoverList.length - 5} more
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
