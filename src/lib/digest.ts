import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { Task } from '@/models/Task';
import { Project } from '@/models/Project';
import { DigestSetting, type DigestSettingDoc } from '@/models/DigestSetting';
import { sendEmail, mailerConfigured } from '@/lib/mailer';
import { projectRef } from '@/lib/projectRef';
import { normalizeRole } from '@/lib/auth';

/**
 * Daily "tasks due today" email digest.
 *
 * This module is a READ-ONLY projection of existing task data into an email —
 * it never creates, edits, or signs a record, so it sits entirely outside the
 * 21 CFR Part 11 e-record scope. "Due" uses the same effective-due rule as the
 * dashboards and calendar (`ccTcd || dueDate`) and "open" means `status !=
 * 'done'`, so the digest agrees with what every other surface shows.
 *
 * The file is split into PURE helpers (timezone window, bucketing, rendering —
 * no DB, unit-tested in tests/unit/daily-digest.test.ts) and a single DB
 * orchestration entry point (`buildAndSendDailyDigests`).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TZ = 'Asia/Kolkata';

/* ── Pure helpers ─────────────────────────────────────────────────────────── */

/** Resolve the configured digest timezone (default Asia/Kolkata = IST). */
export function digestTimeZone(): string {
  return process.env.DIGEST_TZ?.trim() || DEFAULT_TZ;
}

/** The provider's reported daily send allowance. Defaults to Brevo's free
 * tier (300/day); override with BREVO_DAILY_CAP when on a paid plan or another
 * provider. This is operational telemetry only: the application still
 * attempts every opted-in recipient and records any provider rejections. */
export function digestDailyCap(): number {
  const n = parseInt(process.env.BREVO_DAILY_CAP || '', 10);
  return Number.isFinite(n) && n > 0 ? n : 300;
}

/** The fixed workspace-time hour for the daily brief. Product contract:
 * everyone receives it at 08:30; this is intentionally not configurable per
 * user or deployment. */
export function defaultDigestHour(): number {
  return 8;
}

/** The wall-clock hour (0–23) in `tz` for instant `now`. Used to decide
 * whether a scheduler tick is inside the fixed 08:30 delivery window. Pure. */
export function hourInTz(now: Date, tz: string): number {
  const h = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false }).format(now);
  const n = parseInt(h, 10);
  return n === 24 ? 0 : n; // 'en-US' renders midnight as 24
}

export function minuteInTz(now: Date, tz: string): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, minute: '2-digit' }).format(now));
}

/* ── Fixed daily send time ──────────────────────────────────────────────────
   Pragati sends ONE brief to everyone at 08:30 (workspace timezone), every
   day. There is no per-user send time — that was deliberately deleted: a
   single, predictable 08:30 brief is the product, and removing it deletes the
   fragile per-user hour-matching machinery with it. */
export const DIGEST_SEND_MINUTE = 30;
export const DIGEST_SEND_WINDOW_MINUTES = 5;
export function digestSendMinuteOfDay(): number {
  return defaultDigestHour() * 60 + DIGEST_SEND_MINUTE;
}

/** Is this scheduled tick eligible to send today's 08:30 brief?
 *
 * Opens a few minutes before 08:30 and stays open for the rest of the local
 * day. At-most-once delivery is guaranteed SEPARATELY by the per-day
 * `lastDigestSentOn` idempotency stamp — so a late or jittery scheduler tick
 * (Vercel Cron is best-effort and routinely drifts past a fixed minute) still
 * delivers exactly one brief instead of silently missing the whole day. The old
 * behaviour gated on a tight 5-minute slot, which meant a single daily cron
 * landing at 08:35 sent nothing to anyone — the "no one got the email" bug.
 * Manual/admin runs (scheduledHour undefined) remain available on demand. Pure. */
export function digestWindowOpen(
  scheduledHour: number | undefined,
  scheduledMinute: number | undefined,
): boolean {
  if (scheduledHour === undefined) return true;
  const tick = scheduledHour * 60 + (scheduledMinute ?? 0);
  return tick >= digestSendMinuteOfDay() - DIGEST_SEND_WINDOW_MINUTES;
}

/** Local calendar day key (YYYY-MM-DD) in `tz` — the idempotency key that
 *  guarantees at-most-once delivery per user per local day, no matter how
 *  many times (or from how many triggers) the endpoint is hit. Pure. */
export function localDateKey(now: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return parts; // en-CA already yields YYYY-MM-DD
}

/** Does this user's chosen send hour fall in the current cron tick? When
 *  `scheduledHour` is undefined (a manual/force run) every hour matches —
 *  the admin is sending the whole batch now. Pure. */
export function digestHourMatches(
  userHour: number | null | undefined,
  scheduledHour: number | undefined,
  fallbackHour: number,
): boolean {
  if (scheduledHour === undefined) return true;
  const h = typeof userHour === 'number' && userHour >= 0 && userHour <= 23 ? userHour : fallbackHour;
  return h === scheduledHour;
}

export function digestTimeMatches(
  userHour: number | null | undefined,
  userMinute: number | null | undefined,
  scheduledHour: number | undefined,
  scheduledMinute: number | undefined,
  fallbackHour: number,
): boolean {
  if (scheduledHour === undefined) return true;
  const hour = typeof userHour === 'number' && userHour >= 0 && userHour <= 23 ? userHour : fallbackHour;
  const minute = typeof userMinute === 'number' && userMinute >= 0 && userMinute <= 59 ? userMinute : 0;
  if (scheduledMinute === undefined) return hour === scheduledHour;

  // Scheduled runners are not guaranteed to start on the exact requested
  // minute. Treat every later tick on the same local day as a catch-up
  // opportunity; lastDigestSentOn provides the at-most-once guard.
  return scheduledHour * 60 + scheduledMinute >= hour * 60 + minute;
}

/** Absolute base URL for in-email links, or '' when none is configured (links
 *  are then omitted rather than rendered relative-and-broken). */
export function appBaseUrl(): string {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, '')}`;
  return '';
}

/** Milliseconds to add to a UTC instant to get the wall-clock time in `tz`. */
function tzOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(date).reduce<Record<string, string>>((a, p) => {
    if (p.type !== 'literal') a[p.type] = p.value;
    return a;
  }, {});
  // 'en-US' renders midnight as hour "24"; normalise to 00 so Date.UTC is sane.
  const hour = parts.hour === '24' ? '00' : parts.hour;
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +hour, +parts.minute, +parts.second);
  return asUTC - date.getTime();
}

/**
 * The [start, end) of "today" in `tz`, expressed as UTC Date instants.
 * India (the default zone) has no DST, so the boundary is exact; for DST zones
 * the offset is sampled at `now`, which is correct except within the rare hour
 * straddling a transition — acceptable for a once-daily digest.
 */
export function dayWindowInTz(now: Date, tz: string): { start: Date; end: Date } {
  const offset = tzOffsetMs(now, tz);
  const localMidnight = new Date(now.getTime() + offset);
  localMidnight.setUTCHours(0, 0, 0, 0);
  const start = new Date(localMidnight.getTime() - offset);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

/** Effective due date for a task: the Change-Control target date wins over a
 *  plain due date, matching the dashboards/calendar. */
export function effectiveDue(task: { dueDate?: any; ccTcd?: any }): Date | null {
  const v = task.ccTcd || task.dueDate;
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export type Bucket = 'overdue' | 'today' | 'soon';

export interface DigestTask {
  id: string;
  title: string;
  priority: string | null;
  projectId: string | null;
  bucket: Bucket;
  label: string;
  effDue: Date;
}

export interface DigestSections {
  overdue: DigestTask[];
  today: DigestTask[];
  soon: DigestTask[];
  projectUpdates: { name: string; count: number }[];
}

interface RawTask {
  _id: any;
  title: string;
  priority?: string | null;
  dueDate?: any;
  ccTcd?: any;
  projectId?: any;
}

/** Split a user's open, due-bearing tasks into overdue / today / soon buckets
 *  relative to the day window. Pure — no DB, no settings side-effects. */
export function bucketTasks(
  tasks: RawTask[],
  window: { start: Date; end: Date },
  dueSoonDays: number,
): { overdue: DigestTask[]; today: DigestTask[]; soon: DigestTask[] } {
  const soonEnd = window.end.getTime() + Math.max(0, dueSoonDays) * DAY_MS;
  const overdue: DigestTask[] = [];
  const today: DigestTask[] = [];
  const soon: DigestTask[] = [];

  for (const t of tasks) {
    const eff = effectiveDue(t);
    if (!eff) continue;
    const ms = eff.getTime();
    const base: Omit<DigestTask, 'bucket' | 'label'> = {
      id: String(t._id),
      title: t.title,
      priority: t.priority || null,
      projectId: t.projectId ? String(t.projectId) : null,
      effDue: eff,
    };
    if (ms < window.start.getTime()) {
      const d = Math.max(1, Math.ceil((window.start.getTime() - ms) / DAY_MS));
      overdue.push({ ...base, bucket: 'overdue', label: `Overdue ${d}d` });
    } else if (ms < window.end.getTime()) {
      today.push({ ...base, bucket: 'today', label: 'Today' });
    } else if (ms < soonEnd) {
      // Calendar-day offset from today's local midnight — floor, not round, so a
      // task due tomorrow afternoon reads "Tomorrow", not "in 2d" (rounding the
      // half-day up was the bug).
      const d = Math.max(1, Math.floor((ms - window.start.getTime()) / DAY_MS));
      soon.push({ ...base, bucket: 'soon', label: d === 1 ? 'Tomorrow' : `in ${d}d` });
    }
  }

  const byPriority = (a: DigestTask, b: DigestTask) => {
    const rank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    const pa = rank[a.priority || 'medium'] ?? 2;
    const pb = rank[b.priority || 'medium'] ?? 2;
    return pa - pb || a.effDue.getTime() - b.effDue.getTime();
  };
  overdue.sort((a, b) => a.effDue.getTime() - b.effDue.getTime());
  today.sort(byPriority);
  soon.sort((a, b) => a.effDue.getTime() - b.effDue.getTime());
  return { overdue, today, soon };
}

/** Does a section set contain anything worth emailing?
 *  Exceptions only: overdue + due today. "Soon" alone is not a fire —
 *  silence is the product when nothing burns. */
export function digestHasContent(s: DigestSections): boolean {
  return s.overdue.length > 0 || s.today.length > 0;
}

/** Leadership brief has fire if team/workspace exceptions exist. */
export function leadershipHasExceptions(brief: {
  team?: { blocked?: unknown[]; signoffsPending?: number; overdueByMember?: unknown[] } | null;
  workspace?: { overdueTotal?: number; risky?: unknown[] } | null;
  my?: { overdue?: unknown[]; today?: unknown[] } | null;
} | null | undefined): boolean {
  if (!brief) return false;
  if ((brief.my?.overdue?.length || 0) > 0 || (brief.my?.today?.length || 0) > 0) return true;
  if (brief.team) {
    if ((brief.team.blocked?.length || 0) > 0) return true;
    if ((brief.team.signoffsPending || 0) > 0) return true;
    if ((brief.team.overdueByMember?.length || 0) > 0) return true;
  }
  if (brief.workspace) {
    if ((brief.workspace.overdueTotal || 0) > 0) return true;
    if ((brief.workspace.risky?.length || 0) > 0) return true;
  }
  return false;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

const PRIORITY_COLOR: Record<string, string> = {
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#2563eb',
  low: '#64748b',
};

function renderTaskRow(t: DigestTask, projectName: string | null, appUrl: string): string {
  const titleHtml = escapeHtml(t.title);
  const title = appUrl
    ? `<a href="${appUrl}/tasks/${t.id}" style="color:#1d4ed8;text-decoration:none;">${titleHtml}</a>`
    : titleHtml;
  const proj = projectName ? `<span style="color:#64748b;"> · ${escapeHtml(projectName)}</span>` : '';
  const color = PRIORITY_COLOR[t.priority || 'medium'] || '#64748b';
  const chip = `<span style="display:inline-block;font-size:11px;font-weight:700;color:${color};border:1px solid ${color}33;border-radius:9999px;padding:1px 8px;white-space:nowrap;">${escapeHtml(t.label)}</span>`;
  return `<tr>
    <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#0f172a;">${title}${proj}</td>
    <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;text-align:right;">${chip}</td>
  </tr>`;
}

function renderSection(title: string, rows: string, accent: string): string {
  if (!rows) return '';
  return `<div style="margin:0 0 22px;">
    <div style="font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:${accent};margin:0 0 6px;">${title}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table>
  </div>`;
}

export interface RenderInput {
  name: string;
  sections: DigestSections;
  projectName: (projectId: string | null) => string | null;
  /** The user-facing reference (ccNo||code) shown on task rows. Falls back to
   *  projectName when a caller doesn't supply it. */
  projectRef?: (projectId: string | null) => string | null;
  appUrl: string;
  introNote?: string;
  test?: boolean;
  dateLabel: string;
  /** Tasks the recipient closed yesterday — fuels the momentum line. */
  winsYesterday?: number;
  /** Recipient role — drives one quiet line of framing, so the same brief
   *  reads as "your plate" to an IC, "you first, then the team" to a lead,
   *  and "the workspace" to the admin. */
  role?: string;
  /** Optional curated industry insight (see lib/insights) — the continuous
   *  "thought worth a minute" feed, tuned to the workspace's niche. */
  insight?: { tag: string; title: string; body: string } | null;
  leadershipBrief?: {
    headline: string;
    team?: {
      blocked: { id: string; title: string; projectName: string | null; days: number }[];
      signoffsPending: number;
      overdueByMember: { name: string; count: number }[];
    };
    workspace?: {
      doneYesterday: number;
      overdueTotal: number;
      activeProjects: number;
      risky: { id: string; name: string; overdue: number }[];
    };
  } | null;
}

/** One line of role framing under the greeting. Deliberately copy, not data —
 *  the data below is identical for everyone; the lens is what changes. */
export function roleFraming(role?: string): string {
  if (role === 'admin' || role === 'master_admin') return 'Your plate. Workspace view on the console.';
  if (role === 'lead' || role === 'pm') return 'Your plate first, then the board.';
  return 'Your plate.';
}

/* A short canon of closing lines (drawn from the same books as the login
   screen — never attributed). One per day, same for everyone, like a
   masthead. The email should end on judgment, not on a task list. */
const CLOSING_LINES = [
  'Concentrate on the one or two activities with leverage beyond all others.',
  'Output is the measure. Activity is noise.',
  'Success breeds complacency. Stay paranoid about what matters.',
  'Hard things are hard because there are no easy answers. Decide anyway.',
  'Spend zero time on what you could have done. All of it on what you might do.',
  'Practice isn’t what you do once you’re good. It’s what makes you good.',
  'Run. Don’t walk.',
  'The most important time is now.',
  'It is better to be first than it is to be better.',
  'Let chaos reign — then rein in chaos.',
];

export function closingLine(now: Date = new Date()): string {
  const day = Math.floor(now.getTime() / 86_400_000);
  return CLOSING_LINES[day % CLOSING_LINES.length];
}

/** The single next action: stalest overdue, else top due-today by priority,
 *  else soonest "coming up" only if it is already in the soon bucket
 *  (Bias for Action — never lead with far-future inventory). */
export function pickFocus(sections: DigestSections): DigestTask | null {
  return sections.overdue[0] || sections.today[0] || sections.soon[0] || null;
}


/* ── Subscription welcome ──────────────────────────────────────────────────
   Sent exactly once, the moment a user turns the daily brief on. It doubles as
   the delivery test: if this lands, tomorrow's brief lands. Deliberately spare
   and written in the house voice (Jensen's): the brief exists to serve the
   morning ritual — highest-priority work first, same way every day. No feature
   tour, no insight card, no pep talk. Fully responsive (single 600px column,
   fluid below). Pure. */
export function renderWelcomeEmail(input: {
  name: string;
  role?: string;
  appUrl: string;
  hourLabel: string; // e.g. "8:30 AM IST"
  /** Accepted for call-site compatibility; intentionally unused now. */
  insight?: { tag: string; title: string; body: string } | null;
}): { subject: string; html: string; text: string } {
  const first = (input.name || '').trim().split(/\s+/)[0] || 'there';
  const subject = `Pragati · Daily brief on · ${first}`;
  void input.insight;

  const cta = input.appUrl
    ? `<a href="${input.appUrl}" style="display:inline-block;background:#1565C0;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;border-radius:10px;padding:11px 20px;">Open board</a>`
    : '';

  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;background:#f1f5f9;padding:24px 12px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
  <tr><td style="height:4px;background:linear-gradient(90deg,#1565C0,#43A047);font-size:0;line-height:0;">&nbsp;</td></tr>
  <tr><td style="padding:28px 28px 22px;">
    <div style="font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#1565C0;margin:0 0 14px;">Pragati · Day 1</div>
    <h1 style="margin:0 0 12px;font-size:20px;line-height:1.35;color:#0f172a;">Your daily brief is on.</h1>
    <p style="margin:0 0 12px;font-size:14px;color:#334155;line-height:1.65;"><strong>One email. Exceptions first. One next move.</strong> No vanity metrics. No pep talk.</p>
    <p style="margin:0 0 12px;font-size:14px;color:#334155;line-height:1.65;">Every morning at <strong>${escapeHtml(
      input.hourLabel,
    )}</strong> you get: team fire (if any), then your one highest-urgency task, then overdue / due today / coming up. Read it in under a minute. Act. Move on.</p>
    <p style="margin:0 0 20px;font-size:14px;color:#64748b;line-height:1.65;">If this lands, tomorrow’s brief lands. If it doesn’t, fix delivery before trusting the board.</p>
    ${cta ? `<div style="margin:0 0 4px;">${cta}</div>` : ''}
  </td></tr>
  <tr><td style="padding:0 28px 24px;border-top:1px solid #f1f5f9;">
    <p style="margin:14px 0 0;font-size:12px;color:#94a3b8;line-height:1.55;">Off any time: <strong>Settings → Daily task email</strong>.</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  const text = [
    'Pragati · Your daily brief is on.',
    '',
    'One email. Exceptions first. One next move. No vanity metrics. No pep talk.',
    `Every morning at ${input.hourLabel}: team fire (if any), then your one highest-urgency task, then overdue / due today / coming up.`,
    'If this lands, tomorrow’s brief lands.',
    input.appUrl ? `\nOpen board: ${input.appUrl}` : '',
    'Off any time: Settings → Daily task email.',
  ]
    .filter((l) => l !== undefined)
    .join('\n');
  return { subject, html, text };
}

/** Render the personal digest to { subject, html, text }. Pure.
 *
 *  Design intent (Jensen): exceptions first, one personal move, no fluff.
 *  Lead: team pulse before personal priority. No motivational quotes.
 *  Value first, inventory second. No foresight / pace theater. */
export function renderDigestEmail(input: RenderInput): { subject: string; html: string; text: string } {
  const {
    name,
    sections,
    projectName,
    projectRef,
    appUrl,
    test,
    dateLabel,
    winsYesterday = 0,
    role,
    leadershipBrief,
  } = input;
  // insight intentionally unused — motivational cards were cut.
  void input.insight;
  void winsYesterday;

  const projLabel = (pid: string | null) => (projectRef ? projectRef(pid) : null) || projectName(pid);
  const first = (name || '').trim().split(/\s+/)[0] || 'there';
  const weekday = dateLabel.split(/[ ,]/)[0] || 'daily';
  const isLead = role === 'lead' || role === 'pm';
  const isAdmin = role === 'admin' || role === 'master_admin';

  const focus = pickFocus(sections);

  const personalBits: string[] = [];
  if (sections.overdue.length) personalBits.push(`${sections.overdue.length} overdue`);
  if (sections.today.length) personalBits.push(`${sections.today.length} due today`);
  if (sections.soon.length && !sections.overdue.length && !sections.today.length) {
    personalBits.push(`${sections.soon.length} due soon`);
  }

  // Subject — Bezos inbox scan: one line, exceptions first, no fluff.
  // Format: "Pragati · Mon · 2 overdue · 1 due today" or "Pragati · Mon · All clear"
  let subjectCore = personalBits.join(' · ') || 'All clear';
  if (leadershipBrief?.team) {
    const teamOverdue = leadershipBrief.team.overdueByMember.reduce((s, m) => s + m.count, 0);
    const teamBits: string[] = [];
    if (leadershipBrief.team.blocked.length) {
      teamBits.push(`${leadershipBrief.team.blocked.length} blocked`);
    }
    if (teamOverdue) teamBits.push(`${teamOverdue} team overdue`);
    if (leadershipBrief.team.signoffsPending) {
      teamBits.push(`${leadershipBrief.team.signoffsPending} sign-offs`);
    }
    const you = personalBits.length ? ` · You: ${personalBits.join(', ')}` : '';
    subjectCore = teamBits.length ? `Team: ${teamBits.join(' · ')}${you}` : `You: ${subjectCore}`;
  } else if (leadershipBrief?.workspace) {
    const w = leadershipBrief.workspace;
    subjectCore =
      w.overdueTotal > 0
        ? `Workspace: ${w.overdueTotal} overdue`
        : w.risky.length > 0
          ? `Workspace: ${w.risky.length} to watch`
          : 'Workspace: clear';
  }
  const shortDay = weekday.slice(0, 3);
  const subject = `${test ? '[Test] ' : ''}Pragati · ${shortDay} · ${subjectCore}`;

  const rest = {
    overdue: sections.overdue.filter((t) => t !== focus),
    today: sections.today.filter((t) => t !== focus),
    soon: sections.soon,
  };

  const row = (t: DigestTask) => renderTaskRow(t, projLabel(t.projectId), appUrl);
  const sectionsHtml = [
    renderSection('Also overdue', rest.overdue.map(row).join(''), '#b91c1c'),
    renderSection(
      focus && sections.today.includes(focus) ? 'Also due today' : 'Due today',
      rest.today.map(row).join(''),
      '#0f172a',
    ),
    renderSection('Coming up', rest.soon.map(row).join(''), '#2563eb'),
    // Intentionally no “Moved yesterday” — motion counts reward busyness.
  ].join('');

  // Compact metric chips — only non-zero (zeros burn attention).
  const metricChip = (n: number, label: string, color: string) =>
    n > 0
      ? `<td style="padding:10px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;text-align:center;"><div style="font-size:20px;font-weight:800;color:${color};">${n}</div><div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;">${label}</div></td>`
      : '';
  const metricGap = `<td width="8"></td>`;

  let leadershipHtml = '';
  if (leadershipBrief?.team) {
    const t = leadershipBrief.team;
    const teamOverdue = t.overdueByMember.reduce((sum, m) => sum + m.count, 0);
    const chips = [
      metricChip(t.blocked.length, 'Blocked', '#dc2626'),
      metricChip(t.signoffsPending, 'Sign-offs', '#7c3aed'),
      metricChip(teamOverdue, 'Team overdue', '#ea580c'),
    ].filter(Boolean);
    const chipsRow = chips.length
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:4px;"><tr>${chips.join(metricGap)}</tr></table>`
      : `<div style="font-size:13px;color:#64748b;margin-top:4px;">No team exceptions.</div>`;
    leadershipHtml = `<div style="margin:0 0 20px;padding:14px 16px;border:1px solid #dbeafe;border-radius:12px;background:#f8fbff;">
        <div style="font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#1d4ed8;margin-bottom:6px;">Team</div>
        <div style="font-size:14px;font-weight:700;color:#0f172a;line-height:1.4;margin-bottom:10px;">${escapeHtml(leadershipBrief.headline)}</div>
        ${chipsRow}
        ${
          t.blocked.length
            ? `<div style="margin-top:10px;font-size:12px;color:#475569;"><strong>Blocked:</strong> ${t.blocked
                .map(
                  (item) =>
                    `${escapeHtml(item.title)}${item.projectName ? ` · ${escapeHtml(item.projectName)}` : ''}`,
                )
                .join(' · ')}</div>`
            : ''
        }
        ${
          t.overdueByMember.length
            ? `<div style="margin-top:6px;font-size:12px;color:#475569;"><strong>Overdue load:</strong> ${t.overdueByMember
                .map((m) => `${escapeHtml(m.name)} ${m.count}`)
                .join(' · ')}</div>`
            : ''
        }
      </div>`;
  } else if (leadershipBrief?.workspace) {
    const w = leadershipBrief.workspace;
    const chips = [
      metricChip(w.overdueTotal, 'Overdue', '#dc2626'),
      metricChip(w.risky.length, 'At risk', '#ea580c'),
    ].filter(Boolean);
    leadershipHtml = `<div style="margin:0 0 20px;padding:14px 16px;border:1px solid #dbeafe;border-radius:12px;background:#f8fbff;">
          <div style="font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#1d4ed8;margin-bottom:6px;">Workspace</div>
          <div style="font-size:14px;font-weight:700;color:#0f172a;line-height:1.4;margin-bottom:10px;">${escapeHtml(leadershipBrief.headline)}</div>
          ${
            chips.length
              ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${chips.join(metricGap)}</tr></table>`
              : ''
          }
          ${
            w.risky.length
              ? `<div style="margin-top:10px;font-size:12px;color:#475569;"><strong>Watch:</strong> ${w.risky
                  .map((p) => `${escapeHtml(p.name)} (${p.overdue} overdue)`)
                  .join(' · ')}</div>`
              : ''
          }
        </div>`;
  }

  // Opening: one truth sentence — first line of a Bezos narrative memo.
  const isEmpty = !digestHasContent(sections) && !leadershipBrief?.team && !leadershipBrief?.workspace;
  const openingTruth = leadershipBrief?.headline
    ? leadershipBrief.headline
    : sections.overdue.length || sections.today.length
      ? [
          sections.overdue.length ? `${sections.overdue.length} overdue` : '',
          sections.today.length ? `${sections.today.length} due today` : '',
        ]
          .filter(Boolean)
          .join(' · ') + '. Start with the worst exception.'
      : isEmpty
        ? 'All clear — nothing overdue or due today.'
        : sections.soon.length
          ? `${sections.soon.length} coming up soon. Nothing burning this morning.`
          : 'All clear.';
  const openingHtml = `<p style="margin:0 0 16px;font-size:14px;color:#0f172a;font-weight:600;line-height:1.5;">${escapeHtml(openingTruth)}</p>`;

  const focusLabel =
    focus?.bucket === 'overdue'
      ? 'You — clear this first'
      : focus?.bucket === 'today'
        ? 'You — do this today'
        : focus
          ? 'You — do this next'
          : '';
  const focusHtml = focus
    ? `<div style="margin:0 0 20px;border:1px solid ${focus.bucket === 'overdue' ? '#fecaca' : '#bfdbfe'};border-left:4px solid ${focus.bucket === 'overdue' ? '#dc2626' : '#1565C0'};border-radius:12px;padding:14px 16px;background:${focus.bucket === 'overdue' ? '#fff7f7' : '#f8fbff'};">
        <div style="font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:${focus.bucket === 'overdue' ? '#b91c1c' : '#1565C0'};margin-bottom:4px;">${focusLabel}</div>
        <div style="font-size:16px;font-weight:700;color:#0f172a;line-height:1.35;">${
          appUrl
            ? `<a href="${appUrl}/tasks/${focus.id}" style="color:#0f172a;text-decoration:none;">${escapeHtml(focus.title)}</a>`
            : escapeHtml(focus.title)
        }</div>
        <div style="font-size:12px;color:#64748b;margin-top:3px;">${escapeHtml(focus.label)}${
          projLabel(focus.projectId) ? ` · ${escapeHtml(projLabel(focus.projectId)!)}` : ''
        }</div>
      </div>`
    : '';

  // One home: Today.
  let openBtn = '';
  if (appUrl) {
    openBtn = `<a href="${appUrl}/" style="display:inline-block;background:#1565C0;color:#fff;font-weight:700;font-size:13px;text-decoration:none;padding:10px 16px;border-radius:10px;">Open Today</a>`;
  }

  const manage = appUrl
    ? `<a href="${appUrl}/settings#daily-email" style="color:#64748b;text-decoration:underline;">daily-email settings</a>`
    : 'daily-email settings';

  // Lead/admin: team first, then YOU. IC: YOU first (no leadership block).
  const bodyCore =
    isLead || isAdmin
      ? `${leadershipHtml}${focusHtml}${sectionsHtml}`
      : `${focusHtml}${sectionsHtml}${leadershipHtml}`;

  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;padding:24px 12px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
      <tr><td style="padding:18px 24px;background:#0f172a;">
        <div style="color:#fff;font-size:17px;font-weight:800;letter-spacing:.02em;">Pragati</div>
        <div style="color:#94a3b8;font-size:12px;margin-top:2px;">${escapeHtml(dateLabel)}${test ? ' · test message' : ''}</div>
      </td></tr>
      <tr><td style="padding:22px 24px;">
        <div style="font-size:15px;color:#0f172a;font-weight:700;margin:0 0 14px;">${escapeHtml(first)}</div>
        ${openingHtml}
        ${bodyCore}
        ${openBtn ? `<div style="margin-top:8px;">${openBtn}</div>` : ''}
      </td></tr>
      <tr><td style="padding:14px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;">
        <div style="font-size:11px;color:#94a3b8;line-height:1.5;">
          Daily brief is on. Change or unsubscribe in ${manage}.
        </div>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  const lines: string[] = [`Pragati — ${dateLabel}${test ? ' (test)' : ''}`, '', `${first}`, ''];
  if (leadershipBrief?.team) {
    const teamOverdue = leadershipBrief.team.overdueByMember.reduce((sum, m) => sum + m.count, 0);
    lines.push(
      'TEAM',
      leadershipBrief.headline,
      `Blocked: ${leadershipBrief.team.blocked.length} · Sign-offs: ${leadershipBrief.team.signoffsPending} · Team overdue: ${teamOverdue}`,
      '',
    );
  } else if (leadershipBrief?.workspace) {
    const w = leadershipBrief.workspace;
    lines.push(
      'WORKSPACE',
      leadershipBrief.headline,
      `Overdue: ${w.overdueTotal}${w.risky.length ? ` · Watch: ${w.risky.map((p) => p.name).join(', ')}` : ''}`,
      '',
    );
  }
  if (focus) {
    const pn = projLabel(focus.projectId);
    const head =
      focus.bucket === 'overdue'
        ? 'YOU — CLEAR THIS FIRST'
        : focus.bucket === 'today'
          ? 'YOU — DO THIS TODAY'
          : 'YOU — DO THIS NEXT';
    lines.push(head, `  → [${focus.label}] ${focus.title}${pn ? ` (${pn})` : ''}`, '');
  } else {
    lines.push('YOU — ALL CLEAR', '  Nothing overdue or due today.', '');
  }

  const textSection = (heading: string, items: DigestTask[]) => {
    if (!items.length) return;
    lines.push(heading.toUpperCase());
    for (const t of items) {
      const pn = projLabel(t.projectId);
      lines.push(`  • [${t.label}] ${t.title}${pn ? ` (${pn})` : ''}`);
    }
    lines.push('');
  };
  textSection('Also overdue', rest.overdue);
  textSection('Due today', rest.today);
  textSection('Coming up', rest.soon);
  if (!digestHasContent(sections) && !leadershipBrief) lines.push('All clear — nothing due today.');
  if (appUrl) {
    lines.push('', `Open Today: ${appUrl}/`);
  }

  return { subject, html, text: lines.join('\n') };
}

/* ── DB orchestration ─────────────────────────────────────────────────────── */

/** Get the singleton digest settings, creating it with defaults on first use. */
export async function loadDigestSettings(): Promise<DigestSettingDoc> {
  const doc = await DigestSetting.findByIdAndUpdate(
    'global',
    { $setOnInsert: { _id: 'global' } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
  return doc as unknown as DigestSettingDoc;
}

/** The address a digest should be sent to: the admin-set notifyEmail, falling
 *  back to the login `email` when that is a real (non-placeholder) address. */
export function resolveDigestEmail(user: { notifyEmail?: string | null; email?: string | null }): string {
  const notify = (user.notifyEmail || '').trim();
  if (notify) return notify;
  const login = (user.email || '').trim();
  if (login && !login.endsWith('@pragati.local')) return login;
  return '';
}

export interface RunOptions {
  now?: Date;
  /** Test mode: send only to `onlyUserId`, ignoring opt-in / master-switch /
   *  empty-skip, so an admin can verify delivery end to end. */
  test?: boolean;
  /** Welcome mode: a real (non-test) first brief sent to `onlyUserId` the
   *  moment they switch the daily email on — same bypasses as a test (hour,
   *  idempotency, empty-skip) but a genuine email, and it stamps sent-today so
   *  the scheduled run won't double-send. Turns "I turned it on" into instant
   *  proof it works. */
  welcome?: boolean;
  onlyUserId?: string;
  /** Scheduled run's current workspace-time hour. Omit for a manual "send
   *  now" run, which serves everyone immediately. */
  scheduledHour?: number;
  /** Scheduled run's current workspace-time minute. 08:30–08:34 is the one
   *  daily delivery window. */
  scheduledMinute?: number;
}

export interface RunSummary {
  ok: boolean;
  disabled?: boolean;
  tz: string;
  dateLabel: string;
  considered: number;
  sent: number;
  skippedNoEmail: number;
  skippedNoTasks: number;
  /** Retained in the run summary for backwards-compatible admin reporting. */
  skippedWrongHour: number;
  /** Recipients already sent their digest earlier today (idempotency). */
  skippedAlreadySent: number;
  /** Legacy admin-reporting field; no recipients are intentionally cap-skipped. */
  skippedCapReached: number;
  failed: number;
  /** Provider reason for the FIRST failed send — turns a silent 0-sent run
   *  into an actionable message (e.g. Brevo's IP-allowlist rejection). */
  lastError?: string;
  cap: number;
  mailerConfigured: boolean;
}

export async function buildAndSendDailyDigests(opts: RunOptions = {}): Promise<RunSummary> {
  await connectDB();

  const now = opts.now || new Date();
  const tz = digestTimeZone();
  const window = dayWindowInTz(now, tz);
  const settings = await loadDigestSettings();
  const appUrl = appBaseUrl();
  const dateLabel = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now);

  const summary: RunSummary = {
    ok: true,
    tz,
    dateLabel,
    considered: 0,
    sent: 0,
    skippedNoEmail: 0,
    skippedNoTasks: 0,
    skippedWrongHour: 0,
    skippedAlreadySent: 0,
    skippedCapReached: 0,
    failed: 0,
    cap: digestDailyCap(),
    mailerConfigured: mailerConfigured(),
  };

  const todayKey = localDateKey(now, tz);

  // A one-shot run targets a single user on demand (a test, or a welcome send
  // on first opt-in) and bypasses the hour/idempotency/empty filters so it
  // always lands. A test additionally renders as "[Test]" and never stamps.
  const isOneShot = !!opts.test || !!opts.welcome;

  // Master switch — scheduled runs go quiet when disabled; a one-shot still sends.
  if (!settings.enabled && !isOneShot) {
    return { ...summary, disabled: true };
  }

  // The brief targets 08:30 workspace-time but the window stays open for the
  // rest of the day, because the per-day idempotency stamp (lastDigestSentOn)
  // is what guarantees at-most-once — not a tight time slot. So the daily cron
  // delivers exactly once even when it drifts past 08:30. Every active,
  // opted-in user with a deliverable address is selected in the same batch.
  if (!isOneShot && !digestWindowOpen(opts.scheduledHour, opts.scheduledMinute)) {
    return summary;
  }

  const recipientFilter = opts.onlyUserId
    ? { _id: new mongoose.Types.ObjectId(opts.onlyUserId) }
    : { active: { $ne: false }, notifDailyDigest: true };

  const users = await User.find(recipientFilter)
    .select('_id name email notifyEmail role lastDigestSentOn')
    .limit(1000)
    .lean();

  const recipients = users
    .map((u) => ({ user: u, email: resolveDigestEmail(u as any) }))
    .filter((r) => {
      summary.considered += 1;
      // Idempotency: never send the same user twice in one local day, however
      // many triggers fire (Vercel cron + GitHub Action + a manual run).
      if (!isOneShot && (r.user as any).lastDigestSentOn === todayKey) {
        summary.skippedAlreadySent += 1;
        return false;
      }
      if (!r.email) {
        summary.skippedNoEmail += 1;
        return false;
      }
      return true;
    });

  if (recipients.length === 0) return summary;

  const ids = recipients.map((r) => r.user._id);
  const dueSoonDays = settings.dueSoonDays || 0;
  const upper = new Date(window.end.getTime() + dueSoonDays * DAY_MS);

  // One query for everyone's open, due-bearing tasks up to the look-ahead edge.
  const openTasks = await Task.find({
    assigneeId: { $in: ids },
    status: { $ne: 'done' },
    $or: [{ dueDate: { $lt: upper } }, { ccTcd: { $lt: upper } }],
  })
    .select('_id title priority dueDate ccTcd assigneeId projectId')
    .limit(5000)
    .lean();

  const tasksByUser = new Map<string, RawTask[]>();
  for (const t of openTasks as any[]) {
    const k = String(t.assigneeId);
    (tasksByUser.get(k) || tasksByUser.set(k, []).get(k)!).push(t);
  }

  // Momentum: how many tasks each recipient closed during yesterday's local
  // day — one aggregate for the whole batch. The brief opens with output, not
  // with the to-do pile (output is the measure; activity is noise).
  const yesterdayStart = new Date(window.start.getTime() - DAY_MS);
  const winsAgg = await Task.aggregate([
    {
      $match: {
        assigneeId: { $in: ids },
        status: 'done',
        completedAt: { $gte: yesterdayStart, $lt: window.start },
      },
    },
    { $group: { _id: '$assigneeId', n: { $sum: 1 } } },
  ]);
  const winsByUser = new Map<string, number>(winsAgg.map((w: any) => [String(w._id), w.n]));

  // Optional project-updates section (admin opt-in, off by default).
  const projectUpdatesByUser = settings.projectUpdates
    ? await computeProjectUpdates(ids, now)
    : new Map<string, { projectId: string; count: number }[]>();

  // Resolve every referenced project name in one round-trip.
  const projectIds = new Set<string>();
  for (const t of openTasks as any[]) if (t.projectId) projectIds.add(String(t.projectId));
  for (const list of projectUpdatesByUser.values()) for (const p of list) projectIds.add(p.projectId);
  const projDocs = projectIds.size
    ? await Project.find({ _id: { $in: [...projectIds] } })
        .select('_id name code ccNo')
        .lean()
    : [];
  const projName = new Map<string, string>(projDocs.map((p: any) => [String(p._id), p.name]));
  // The user-facing reference (ccNo when set, else system code) — shown on task
  // rows so the digest matches whatever the member changed it to in the app.
  const projRef = new Map<string, string>(projDocs.map((p: any) => [String(p._id), projectRef(p)]));

  for (const r of recipients) {
    const uid = String(r.user._id);
    const raw = tasksByUser.get(uid) || [];
    const buckets = bucketTasks(raw, window, dueSoonDays);
    const sections: DigestSections = {
      overdue: settings.overdue ? buckets.overdue : [],
      today: settings.dueToday ? buckets.today : [],
      soon: buckets.soon, // soon is implicitly gated by dueSoonDays===0 → empty
      projectUpdates: (projectUpdatesByUser.get(uid) || []).map((p) => ({
        name: projName.get(p.projectId) || 'A project',
        count: p.count,
      })),
    };

    const role = normalizeRole((r.user as any).role);
    let leadershipBrief: RenderInput['leadershipBrief'] = null;
    if (role === 'lead' || role === 'admin' || role === 'master_admin') {
      try {
        const { buildDailyBrief } = await import('@/lib/brief');
        leadershipBrief = await buildDailyBrief(uid, role, now);
      } catch {
        // Leadership roll-up optional; personal exceptions still send.
      }
    }

    // Exception-only: no mail when nothing is overdue/due today and no
    // leadership fire. All-clear silence is free and honest. Test/welcome
    // still send so delivery can be verified.
    const hasFire =
      digestHasContent(sections) || leadershipHasExceptions(leadershipBrief as any);
    if (!hasFire && !opts.test && !opts.welcome) {
      summary.skippedNoTasks += 1;
      continue;
    }

    const { subject, html, text } = renderDigestEmail({
      name: (r.user as any).name || '',
      role,
      sections,
      projectName: (pid) => (pid ? projName.get(pid) || null : null),
      projectRef: (pid) => (pid ? projRef.get(pid) || null : null),
      appUrl,
      introNote: settings.introNote || '',
      test: opts.test,
      dateLabel,
      winsYesterday: winsByUser.get(uid) || 0,
      leadershipBrief,
    });

    const res = await sendEmail({ to: r.email, toName: (r.user as any).name, subject, html, text });
    if (res.ok) {
      summary.sent += 1;
      // Stamp sent-today so no other trigger re-sends this user. Test sends
      // don't stamp — they must never suppress the real daily delivery.
      if (!opts.test) {
        await User.updateOne({ _id: r.user._id }, { $set: { lastDigestSentOn: todayKey } }).catch(() => {});
      }
    } else {
      summary.failed += 1;
      if (!summary.lastError) {
        summary.lastError = [res.error, res.detail].filter(Boolean).join(' — ') || 'send failed';
      }
    }
  }

  // Operational record of the last real run, surfaced in the admin panel so
  // the operator can see delivery health (and cap headroom) at a glance.
  // One-shot sends (test / welcome) are excluded — they would overwrite the
  // scheduled run's stats.
  if (!isOneShot) {
    await DigestSetting.updateOne(
      { _id: 'global' },
      {
        $set: {
          lastRunAt: now,
          lastRunSummary: {
            considered: summary.considered,
            sent: summary.sent,
            failed: summary.failed,
            skippedNoEmail: summary.skippedNoEmail,
            skippedNoTasks: summary.skippedNoTasks,
            skippedCapReached: summary.skippedCapReached,
            cap: summary.cap,
          },
        },
      },
    ).catch(() => {});
  }

  return summary;
}

/**
 * Per-user "project updates": projects the user is involved in (owns, or has a
 * task assigned in) that had one or more tasks completed in the last 24h.
 * Best-effort and admin-opt-in — kept off the default digest path.
 */
async function computeProjectUpdates(
  ids: mongoose.Types.ObjectId[],
  now: Date,
): Promise<Map<string, { projectId: string; count: number }[]>> {
  const dayAgo = new Date(now.getTime() - DAY_MS);

  const [doneTasks, userTasks, owned] = await Promise.all([
    Task.find({ status: 'done', completedAt: { $gte: dayAgo } })
      .select('projectId')
      .limit(10000)
      .lean(),
    Task.find({ assigneeId: { $in: ids } })
      .select('assigneeId projectId')
      .limit(20000)
      .lean(),
    Project.find({ ownerId: { $in: ids } })
      .select('_id ownerId')
      .limit(5000)
      .lean(),
  ]);

  const completionsByProject = new Map<string, number>();
  for (const t of doneTasks as any[]) {
    if (!t.projectId) continue;
    const k = String(t.projectId);
    completionsByProject.set(k, (completionsByProject.get(k) || 0) + 1);
  }

  const involved = new Map<string, Set<string>>();
  const ensure = (uid: string) => involved.get(uid) || involved.set(uid, new Set()).get(uid)!;
  for (const t of userTasks as any[]) {
    if (t.assigneeId && t.projectId) ensure(String(t.assigneeId)).add(String(t.projectId));
  }
  for (const p of owned as any[]) {
    if (p.ownerId) ensure(String(p.ownerId)).add(String(p._id));
  }

  const out = new Map<string, { projectId: string; count: number }[]>();
  for (const [uid, projectSet] of involved) {
    const list: { projectId: string; count: number }[] = [];
    for (const pid of projectSet) {
      const count = completionsByProject.get(pid);
      if (count) list.push({ projectId: pid, count });
    }
    list.sort((a, b) => b.count - a.count);
    if (list.length) out.set(uid, list.slice(0, 8));
  }
  return out;
}
