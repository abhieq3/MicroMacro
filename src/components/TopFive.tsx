'use client';
import { useEffect, useState } from 'react';
import { Radar, Pencil, Check, X } from 'lucide-react';
import { api } from '@/lib/client/api';
import { Avatar } from '@/components/ui';

/**
 * Top 5 Things (T5T) — the NVIDIA practice as a dashboard panel.
 *
 * Everyone writes the top five things on their mind each week — what they're
 * working on, what they're noticing, what feels early or wrong. Not status;
 * *signals*. The feed is open to the whole team: no layers, no filtering, and
 * everyone gets to learn from everyone. Leads read it the way Jensen reads
 * his hundred T5T emails — hunting the weak signal before it becomes a loud
 * one.
 *
 * Composition and feed live in one panel so writing yours and reading the
 * team's feel like the same habit, not a form and a report.
 */

interface FeedEntry {
  userId: string;
  name: string;
  username: string | null;
  avatarLetter: string;
  avatarBg: string;
  avatarFont: number;
  week: string;
  items: string[];
  updatedAt: string;
}

interface Top5Resp {
  week: string;
  mine: { week: string; items: string[]; updatedAt: string } | null;
  feed: FeedEntry[];
}

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

const PROMPTS = [
  'What are you working on?',
  'What are you noticing?',
  'What feels early or wrong?',
  'What would you fix first?',
  'What should the team know?',
];

export function TopFivePanel({ myUserId }: { myUserId: string }) {
  const [data, setData] = useState<Top5Resp | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>(['', '', '', '', '']);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api<Top5Resp>('/top5')
      .then((d) => setData(d))
      .catch(() => setData({ week: '', mine: null, feed: [] }));
  }, []);

  function startEdit() {
    const items = data?.mine?.items || [];
    setDraft([0, 1, 2, 3, 4].map((i) => items[i] || ''));
    setErr('');
    setEditing(true);
  }

  async function save() {
    const items = draft.map((s) => s.trim()).filter(Boolean);
    if (items.length === 0) {
      setErr('Write at least one thing on your mind.');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const res = await api<{ week: string; items: string[]; updatedAt: string }>('/top5', {
        method: 'PUT',
        body: { items },
      });
      setData((d) =>
        d
          ? {
              ...d,
              mine: { week: res.week, items: res.items, updatedAt: res.updatedAt },
              // Reflect my save into the feed immediately, keeping it newest-first.
              feed: [
                {
                  ...(d.feed.find((f) => f.userId === myUserId) || {
                    userId: myUserId,
                    name: 'You',
                    username: null,
                    avatarLetter: '',
                    avatarBg: '',
                    avatarFont: 0,
                  }),
                  week: res.week,
                  items: res.items,
                  updatedAt: res.updatedAt,
                },
                ...d.feed.filter((f) => f.userId !== myUserId),
              ],
            }
          : d,
      );
      setEditing(false);
    } catch (e: any) {
      setErr(e?.message || 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  }

  const mine = data?.mine || null;
  const teamFeed = (data?.feed || []).filter((f) => f.userId !== myUserId);

  return (
    <section
      className="bg-white dark:bg-[#262624] rounded-2xl border border-slate-200/80 dark:border-white/[0.07] overflow-hidden"
      style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}
    >
      <div className="px-4 h-12 flex items-center gap-2 border-b border-slate-100 dark:border-white/[0.05]">
        <span className="text-slate-400 dark:text-white/30 shrink-0 inline-flex">
          <Radar size={13} />
        </span>
        <h3 className="text-xs font-bold uppercase tracking-wider sm:tracking-[0.14em] text-slate-500 dark:text-white/40">
          Top 5 Things
        </h3>
        {data?.week && (
          <span className="text-[10px] font-semibold text-slate-300 dark:text-white/20 tabular-nums">
            {data.week.replace('-W', ' · week ')}
          </span>
        )}
        <div className="ml-auto">
          {mine && !editing && (
            <button
              type="button"
              onClick={startEdit}
              title="Edit my Top 5"
              className="p-1 rounded text-slate-400 hover:text-slate-700 dark:text-white/30 dark:hover:text-white/70 hover:bg-slate-100 dark:hover:bg-white/[0.04] transition-colors"
            >
              <Pencil size={12} />
            </button>
          )}
        </div>
      </div>

      {/* ── Mine — write or review. Early in the week (Mon–Tue) an unwritten
             list gets a soft tint: enough to catch the eye on the Monday
             dashboard visit, never a bell ping — the practice should be
             obvious, not noisy. ──────────────────────────────────────────── */}
      {data && !mine && !editing && (
        <button
          type="button"
          onClick={startEdit}
          className={`w-full text-left px-4 py-3.5 transition-colors border-b border-slate-100 dark:border-white/[0.06] ${
            new Date().getDay() >= 1 && new Date().getDay() <= 2
              ? 'bg-blue-50/50 dark:bg-blue-500/[0.06] hover:bg-blue-50 dark:hover:bg-blue-500/[0.09]'
              : 'hover:bg-slate-50/70 dark:hover:bg-white/[0.03]'
          }`}
        >
          <div className="text-[12.5px] font-bold text-slate-700 dark:text-white/80">
            What are the five things on your mind this week?
          </div>
          <div className="text-[11px] text-slate-400 dark:text-white/30 mt-0.5 leading-snug">
            Not a status report — signals. What you’re seeing, what feels early, what feels wrong. The whole
            team reads these; that’s the point.
          </div>
        </button>
      )}

      {editing && (
        <div className="px-4 py-3 space-y-1.5 border-b border-slate-100 dark:border-white/[0.06]">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[10px] font-black text-slate-300 dark:text-white/20 w-3 text-right tabular-nums">
                {i + 1}
              </span>
              <input
                autoFocus={i === 0}
                className="flex-1 min-w-0 bg-transparent text-[12.5px] text-slate-700 dark:text-white/85 placeholder-slate-300 dark:placeholder-white/20 border-b border-slate-200/70 dark:border-white/[0.08] focus:border-blue-400 dark:focus:border-blue-500/60 outline-none py-1 transition-colors"
                placeholder={PROMPTS[i]}
                maxLength={240}
                value={draft[i]}
                onChange={(e) => setDraft((d) => d.map((v, j) => (j === i ? e.target.value : v)))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const next = document.querySelector<HTMLInputElement>(`input[data-t5-idx="${i + 1}"]`);
                    if (next) next.focus();
                    else void save();
                  }
                }}
                data-t5-idx={i}
              />
            </div>
          ))}
          {err && <div className="text-[11px] text-red-600 dark:text-red-400 pl-5">{err}</div>}
          <div className="flex items-center gap-2 pt-1.5 pl-5">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold px-2.5 py-1.5 transition-colors disabled:opacity-50"
            >
              <Check size={12} /> {saving ? 'Saving…' : 'Share with the team'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-slate-600 dark:text-white/30 dark:hover:text-white/60 transition-colors"
            >
              <X size={12} /> Cancel
            </button>
          </div>
        </div>
      )}

      {mine && !editing && (
        <div className="px-4 py-3 border-b border-slate-100 dark:border-white/[0.06]">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-white/25 mb-1.5">
            Yours · {timeAgo(mine.updatedAt)}
          </div>
          <ol className="space-y-1">
            {mine.items.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-[12px] text-slate-600 dark:text-white/70">
                <span className="text-[10px] font-black text-slate-300 dark:text-white/20 w-3 text-right tabular-nums shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <span className="leading-snug break-words min-w-0">{item}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* ── The team's signals — open to everyone ──────────────────────── */}
      {data && teamFeed.length === 0 && (
        <div className="px-4 py-4 text-[11px] text-slate-400 dark:text-white/25 leading-relaxed">
          No signals from the team yet{mine ? ' — yours is the first' : ' — yours could be the first'}.
        </div>
      )}
      {teamFeed.length > 0 && (
        <ul className="divide-y divide-slate-100 dark:divide-white/[0.06] max-h-80 overflow-y-auto">
          {teamFeed.map((f) => (
            <li key={f.userId} className="px-4 py-3">
              <div className="flex items-center gap-2 mb-1.5">
                <Avatar
                  name={f.name}
                  size={20}
                  letter={f.avatarLetter}
                  bg={f.avatarBg}
                  font={f.avatarFont}
                />
                <span className="text-[12px] font-bold text-slate-700 dark:text-white/80 truncate">
                  {f.name}
                </span>
                <span className="text-[10px] text-slate-300 dark:text-white/20 shrink-0 ml-auto">
                  {timeAgo(f.updatedAt)}
                </span>
              </div>
              <ol className="space-y-0.5">
                {f.items.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] text-slate-500 dark:text-white/55">
                    <span className="text-[10px] font-black text-slate-300 dark:text-white/15 w-3 text-right tabular-nums shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <span className="leading-snug break-words min-w-0">{item}</span>
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
