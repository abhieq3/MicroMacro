'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, SlidersHorizontal } from 'lucide-react';
import { api } from '@/lib/client/api';
import { chimeIfEnabled } from '@/lib/sound';

/* Compact preference row used inside the bell popup. */
function PrefRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative shrink-0 rounded-full transition-colors"
        style={{ width: 34, height: 19, background: checked ? '#1565C0' : '#e2e8f0' }}
      >
        <span
          className="absolute top-0.5 h-[15px] w-[15px] rounded-full bg-white shadow-sm transition-all"
          style={{ left: checked ? 17 : 2 }}
        />
      </button>
    </div>
  );
}

interface Notif {
  id: string;
  type: string;
  title: string;
  body: string;
  taskId: string | null;
  read: boolean;
  createdAt: string;
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/**
 * Bell + dropdown in the app shell. Polls every 30s; when the unread count
 * goes UP, it chimes (respecting the user's sound mute). Clicking an item
 * marks it read and deep-links to the task.
 */
export function NotificationBell({
  dark = false,
  openUp = false,
  initialUnread = 0,
}: {
  dark?: boolean;
  openUp?: boolean;
  initialUnread?: number;
}) {
  const router = useRouter();
  const [items, setItems] = useState<Notif[]>([]);
  // Seed from the SSR count so the badge is correct on first paint rather than
  // appearing only after the first /notifications poll resolves.
  const [unread, setUnread] = useState(initialUnread);
  const [open, setOpen] = useState(false);
  // Bumped each time a new notification lands live, to retrigger the badge
  // "pop" animation (a key change forces the element to remount/replay).
  const [pop, setPop] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const prevUnread = useRef<number | null>(initialUnread);

  // Notification preferences now live here (moved off the profile page) so they
  // sit right next to the notifications they govern.
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [prefs, setPrefs] = useState<Record<string, boolean> | null>(null);
  async function loadPrefs() {
    // Render the toggles immediately with sensible defaults so the panel never
    // shows a "Loading…" blank — then reconcile with the server's saved values
    // once they arrive. This removes the perceived lag on opening preferences.
    setPrefs(
      (p) =>
        p ?? {
          notifTaskAssigned: true,
          notifTaskDueSoon: true,
          notifTaskOverdue: true,
          notifProjectUpdate: false,
        },
    );
    try {
      const d: any = await api('/users/me');
      const u = d.user || {};
      setPrefs({
        notifTaskAssigned: u.notifTaskAssigned ?? true,
        notifTaskDueSoon: u.notifTaskDueSoon ?? true,
        notifTaskOverdue: u.notifTaskOverdue ?? true,
        notifProjectUpdate: u.notifProjectUpdate ?? false,
      });
    } catch {
      /* keep optimistic defaults */
    }
  }
  function setPref(key: string, value: boolean) {
    setPrefs((p) => ({ ...(p || {}), [key]: value }));
    api('/users/me', { method: 'PATCH', body: { [key]: value } }).catch(() => {});
  }

  async function load(chimeOnIncrease = false) {
    try {
      const res = await api<{ unread: number; items: Notif[] }>('/notifications');
      setItems(res.items);
      setUnread(res.unread);
      if (chimeOnIncrease && prevUnread.current !== null && res.unread > prevUnread.current) {
        chimeIfEnabled();
        // A genuinely new notification arrived while the user is here — pop the
        // badge and open the panel so the update is seen, not just heard.
        setPop((p) => p + 1);
        setOpen(true);
      }
      prevUnread.current = res.unread;
    } catch {
      /* ignore polling errors */
    }
  }

  // Initial load + visibility-aware 30s poll.
  //
  // A backgrounded tab used to keep polling /notifications every 30s forever,
  // which at scale is a continuous, pointless load on the DB and serverless
  // functions (most open tabs are idle in the background). We now pause the
  // interval whenever the tab is hidden and resume — with one immediate
  // catch-up fetch — the moment it becomes visible again. The badge stays
  // correct because it's seeded from the SSR unread count.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (timer) return;
      timer = setInterval(() => load(true), 30_000);
    };
    const stopPolling = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Catch up on anything that landed while we were backgrounded, then
        // resume the steady poll. chimeOnIncrease=true so a notification that
        // arrived while away still announces itself on return.
        load(true);
        startPolling();
      } else {
        stopPolling();
      }
    };

    // First paint: fetch the items list once (badge count is already seeded).
    load(false);
    if (document.visibilityState === 'visible') startPolling();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  async function markAllRead() {
    setUnread(0);
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    prevUnread.current = 0;
    try {
      await api('/notifications/read', { method: 'POST', body: {} });
    } catch {}
  }

  function openItem(n: Notif) {
    setOpen(false);
    if (!n.read) {
      api('/notifications/read', { method: 'POST', body: { id: n.id } }).catch(() => {});
      setUnread((u) => Math.max(0, u - 1));
    }
    if (n.taskId) router.push(`/tasks/${n.taskId}`);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
        onClick={() => {
          setOpen((o) => !o);
        }}
        className={`relative p-1.5 rounded-lg transition-colors ${
          dark
            ? 'text-white/55 hover:text-white/90 hover:bg-white/5'
            : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
        }`}
      >
        <Bell size={16} className={pop > 0 ? 'notif-bell-ring' : ''} key={`bell-${pop}`} />
        {unread > 0 && (
          <span
            key={`badge-${pop}`}
            className="notif-badge-pop absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 rounded-full bg-emerald-500 text-white text-[9px] font-bold flex items-center justify-center"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className={`absolute left-0 w-80 max-w-[calc(100vw-2rem)] z-50 bg-white rounded-xl border border-slate-200 overflow-hidden ${
            openUp ? 'bottom-full mb-2' : 'right-0 left-auto mt-2'
          }`}
          style={{ boxShadow: '0 8px 30px rgba(15,23,42,0.16)' }}
        >
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-100">
            <span className="text-sm font-bold text-slate-800">Notifications</span>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => {
                  setPrefsOpen((o) => !o);
                  if (!prefs) loadPrefs();
                }}
                aria-label="Notification preferences"
                title="Notification preferences"
                className={`p-1 rounded-md transition-colors ${prefsOpen ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'}`}
              >
                <SlidersHorizontal size={14} />
              </button>
            </div>
          </div>

          {prefsOpen && (
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Preferences
              </div>
              {!prefs ? (
                <div className="text-xs text-slate-400 py-2">Loading…</div>
              ) : (
                <>
                  <PrefRow
                    label="Task assigned to me"
                    checked={prefs.notifTaskAssigned}
                    onChange={(v) => setPref('notifTaskAssigned', v)}
                  />
                  <PrefRow
                    label="Due in 24 hours"
                    checked={prefs.notifTaskDueSoon}
                    onChange={(v) => setPref('notifTaskDueSoon', v)}
                  />
                  <PrefRow
                    label="Task overdue"
                    checked={prefs.notifTaskOverdue}
                    onChange={(v) => setPref('notifTaskOverdue', v)}
                  />
                  <PrefRow
                    label="Project updates"
                    checked={prefs.notifProjectUpdate}
                    onChange={(v) => setPref('notifProjectUpdate', v)}
                  />
                  <p className="text-[10px] text-slate-400 mt-2 leading-snug">
                    These appear on your dashboard — Pragati never sends email.
                  </p>
                </>
              )}
            </div>
          )}
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-400">You're all caught up.</div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => openItem(n)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors flex gap-2.5 ${
                    n.read ? '' : 'bg-blue-50/40'
                  }`}
                >
                  <span
                    className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${n.read ? 'bg-transparent' : 'bg-blue-500'}`}
                  />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-slate-800 leading-snug">
                      {n.title}
                    </span>
                    {n.body && (
                      <span className="block text-xs text-slate-500 line-clamp-2 mt-0.5 leading-snug">
                        {n.body}
                      </span>
                    )}
                    <span className="block text-[11px] text-slate-400 mt-0.5">{timeAgo(n.createdAt)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
