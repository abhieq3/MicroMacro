/**
 * Unit tests for the daily task-due digest — the PURE layer only (timezone
 * windowing, effective-due resolution, bucketing, recipient-address resolution
 * and rendering). No database is touched, mirroring the other tests/unit specs.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  dayWindowInTz,
  effectiveDue,
  bucketTasks,
  digestHasContent,
  resolveDigestEmail,
  renderDigestEmail,
  type DigestTask,
} from '../../src/lib/digest';

const IST = 'Asia/Kolkata';

// ── dayWindowInTz ─────────────────────────────────────────────────────────────

describe('dayWindowInTz', () => {
  it('floors to IST midnight (08:30 IST → window starts the previous 18:30Z)', () => {
    // 2026-06-08T03:00:00Z is 08:30 on 8 June in IST (UTC+5:30).
    const { start, end } = dayWindowInTz(new Date('2026-06-08T03:00:00Z'), IST);
    assert.equal(start.toISOString(), '2026-06-07T18:30:00.000Z'); // 00:00 IST, 8 June
    assert.equal(end.toISOString(), '2026-06-08T18:30:00.000Z'); // 00:00 IST, 9 June
  });

  it('keeps the same window late in the IST day', () => {
    // 23:30 IST on 8 June is still inside the 8-June window.
    const { start } = dayWindowInTz(new Date('2026-06-08T18:00:00Z'), IST);
    assert.equal(start.toISOString(), '2026-06-07T18:30:00.000Z');
  });
});

// ── effectiveDue ──────────────────────────────────────────────────────────────

describe('effectiveDue', () => {
  it('prefers the Change-Control target date over a plain due date', () => {
    const d = effectiveDue({ dueDate: '2026-06-10T00:00:00Z', ccTcd: '2026-06-08T00:00:00Z' });
    assert.equal(d?.toISOString(), '2026-06-08T00:00:00.000Z');
  });
  it('returns null when there is no date at all', () => {
    assert.equal(effectiveDue({}), null);
  });
});

// ── bucketTasks ───────────────────────────────────────────────────────────────

describe('bucketTasks', () => {
  const window = dayWindowInTz(new Date('2026-06-08T03:00:00Z'), IST);
  const tasks = [
    { _id: 'a', title: 'overdue one', dueDate: '2026-06-05T10:00:00Z' },
    { _id: 'b', title: 'due today', dueDate: '2026-06-08T05:00:00Z' },
    { _id: 'c', title: 'due tomorrow', dueDate: '2026-06-09T06:00:00Z' },
    { _id: 'd', title: 'far away', dueDate: '2026-06-20T06:00:00Z' },
    { _id: 'e', title: 'no date' },
  ];

  it('splits into overdue / today / soon and ignores undated + far tasks', () => {
    const out = bucketTasks(tasks, window, 3);
    assert.equal(out.overdue.length, 1);
    assert.equal(out.today.length, 1);
    assert.equal(out.soon.length, 1);
    assert.equal(out.today[0].label, 'Today');
    assert.equal(out.soon[0].label, 'Tomorrow');
    assert.match(out.overdue[0].label, /^Overdue \d+d$/);
  });

  it('drops the look-ahead section when dueSoonDays is 0', () => {
    const out = bucketTasks(tasks, window, 0);
    assert.equal(out.soon.length, 0);
    assert.equal(out.today.length, 1);
  });

  it('sorts due-today by priority (critical first)', () => {
    const t = [
      { _id: '1', title: 'low', priority: 'low', dueDate: '2026-06-08T05:00:00Z' },
      { _id: '2', title: 'crit', priority: 'critical', dueDate: '2026-06-08T05:00:00Z' },
    ];
    const out = bucketTasks(t, window, 0);
    assert.equal(out.today[0].title, 'crit');
  });
});

// ── digestHasContent ──────────────────────────────────────────────────────────

describe('digestHasContent', () => {
  it('is false only when every section is empty', () => {
    assert.equal(digestHasContent({ overdue: [], today: [], soon: [], projectUpdates: [] }), false);
    assert.equal(
      digestHasContent({ overdue: [], today: [], soon: [], projectUpdates: [{ name: 'P', count: 1 }] }),
      true,
    );
  });
});

// ── resolveDigestEmail ────────────────────────────────────────────────────────

describe('resolveDigestEmail', () => {
  it('prefers notifyEmail', () => {
    assert.equal(resolveDigestEmail({ notifyEmail: 'a@b.com', email: 'x@pragati.local' }), 'a@b.com');
  });
  it('falls back to a real login email', () => {
    assert.equal(resolveDigestEmail({ notifyEmail: '', email: 'real@co.com' }), 'real@co.com');
  });
  it('never uses the synthetic placeholder address', () => {
    assert.equal(resolveDigestEmail({ notifyEmail: '', email: 'u@pragati.local' }), '');
  });
});

// ── renderDigestEmail ─────────────────────────────────────────────────────────

describe('renderDigestEmail', () => {
  const today: DigestTask = {
    id: 't1',
    title: 'Fix <A> & B',
    priority: 'high',
    projectId: 'p1',
    bucket: 'today',
    label: 'Today',
    effDue: new Date('2026-06-08T05:00:00Z'),
  };

  it('summarises counts in the subject and HTML-escapes the body', () => {
    const out = renderDigestEmail({
      name: 'Priya Sharma',
      sections: { overdue: [], today: [today], soon: [], projectUpdates: [] },
      projectName: () => 'Alpha',
      appUrl: 'https://x.test',
      dateLabel: 'Monday, 8 June',
    });
    assert.match(out.subject, /1 due today/);
    assert.match(out.html, /Good morning, Priya/);
    assert.match(out.html, /Fix &lt;A&gt; &amp; B/); // escaped in HTML
    assert.match(out.text, /Fix <A> & B/); // raw in plain text
    assert.match(out.html, /https:\/\/x\.test\/tasks\/t1/);
    // The single-focus block speaks the same language as the dashboard
    // spotlight — this is the morning brief, so "Your morning priority".
    assert.match(out.html, /Your morning priority/);
    assert.match(out.text, /YOUR MORNING PRIORITY/);
  });

  it('shows an all-clear message when nothing is due', () => {
    const out = renderDigestEmail({
      name: 'Sam',
      sections: { overdue: [], today: [], soon: [], projectUpdates: [] },
      projectName: () => null,
      appUrl: '',
      dateLabel: 'Monday, 8 June',
    });
    assert.match(out.subject, /all clear/);
    assert.match(out.html, /all clear/i);
  });

  it('renders the team-pulse card for a lead with a leadershipBrief (regression: was computed but never inserted into the HTML)', () => {
    const out = renderDigestEmail({
      name: 'Priya',
      role: 'lead',
      sections: { overdue: [], today: [today], soon: [], projectUpdates: [] },
      projectName: () => 'Alpha',
      appUrl: 'https://x.test',
      dateLabel: 'Monday, 8 June',
      leadershipBrief: {
        headline: 'Two tasks trending to slip across the team.',
        team: {
          blocked: [{ id: 'b1', title: 'Vendor sign-off', projectName: 'Alpha', days: 3 }],
          signoffsPending: 2,
          overdueByMember: [{ name: 'Dhruv', count: 1 }],
        },
      },
    });
    assert.match(out.html, /Team pulse/);
    assert.match(out.html, /Two tasks trending to slip across the team\./);
    assert.match(out.html, /Vendor sign-off/);
  });

  it('renders the workspace-pulse card for an admin with a leadershipBrief', () => {
    const out = renderDigestEmail({
      name: 'Admin',
      role: 'admin',
      sections: { overdue: [], today: [], soon: [], projectUpdates: [] },
      projectName: () => null,
      appUrl: '',
      dateLabel: 'Monday, 8 June',
      leadershipBrief: {
        headline: 'Workspace is broadly on track.',
        workspace: { doneYesterday: 5, overdueTotal: 2, activeProjects: 4, risky: [] },
      },
    });
    assert.match(out.html, /Workspace pulse/);
    assert.match(out.html, /Workspace is broadly on track\./);
  });

  it('keeps the subject short — does not splice the full leadership headline into it', () => {
    const out = renderDigestEmail({
      name: 'Priya',
      role: 'lead',
      sections: { overdue: [], today: [today], soon: [], projectUpdates: [] },
      projectName: () => 'Alpha',
      appUrl: 'https://x.test',
      dateLabel: 'Monday, 8 June',
      leadershipBrief: {
        headline: 'A much longer sentence that would make for an ugly, truncated subject line in an inbox.',
        team: { blocked: [], signoffsPending: 0, overdueByMember: [] },
      },
    });
    assert.match(out.subject, /1 due today/);
    assert.ok(!out.subject.includes('ugly, truncated'));
  });

  it('does not render foresight or insight theater', () => {
    const out = renderDigestEmail({
      name: 'Sam',
      sections: { overdue: [], today: [], soon: [], projectUpdates: [] },
      projectName: () => null,
      appUrl: '',
      dateLabel: 'Monday, 8 June',
    });
    assert.ok(!out.html.includes('Foresight'));
    assert.ok(!out.html.toLowerCase().includes('insight'));
  });
});

import {
  hourInTz,
  localDateKey,
  digestHourMatches,
  digestTimeMatches,
  digestWindowOpen,
  defaultDigestHour,
} from '../../src/lib/digest';

describe('per-user digest scheduling', () => {
  it('hourInTz returns the wall-clock hour in the zone', () => {
    // 2026-06-08T03:00:00Z = 08:30 IST → hour 8.
    assert.equal(hourInTz(new Date('2026-06-08T03:00:00Z'), IST), 8);
    // 18:30Z = 00:00 IST next day → hour 0 (not 24).
    assert.equal(hourInTz(new Date('2026-06-08T18:30:00Z'), IST), 0);
  });

  it('localDateKey is the YYYY-MM-DD local day in the zone', () => {
    // 18:30Z on the 8th is already the 9th in IST.
    assert.equal(localDateKey(new Date('2026-06-08T18:30:00Z'), IST), '2026-06-09');
    assert.equal(localDateKey(new Date('2026-06-08T17:00:00Z'), IST), '2026-06-08');
  });

  it('digestHourMatches honours the chosen hour, default, and force', () => {
    // Chosen hour matches the tick.
    assert.equal(digestHourMatches(7, 7, 8), true);
    assert.equal(digestHourMatches(7, 8, 8), false);
    // No chosen hour → falls back to the default hour.
    assert.equal(digestHourMatches(null, 8, 8), true);
    assert.equal(digestHourMatches(undefined, 9, 8), false);
    // Out-of-range chosen hour falls back to default.
    assert.equal(digestHourMatches(99, 8, 8), true);
    // scheduledHour undefined → a manual/force run, every hour matches.
    assert.equal(digestHourMatches(3, undefined, 8), true);
  });

  it('keeps the product-wide delivery hour fixed at 08:00', () => {
    assert.equal(defaultDigestHour(), 8);
    process.env.DIGEST_DEFAULT_HOUR = '11';
    try {
      assert.equal(defaultDigestHour(), 8, 'deployment config cannot move the promised 08:30 delivery');
    } finally {
      delete process.env.DIGEST_DEFAULT_HOUR;
    }
  });

  it('opens at ~08:25 and stays open all day (idempotency dedups, jitter survives)', () => {
    assert.equal(digestWindowOpen(8, 24), false, 'too early — before the window');
    assert.equal(digestWindowOpen(8, 25), true, 'early-jitter tolerance');
    assert.equal(digestWindowOpen(8, 30), true);
    assert.equal(digestWindowOpen(8, 35), true, 'a late/drifted daily tick still delivers');
    assert.equal(digestWindowOpen(9, 0), true, 'catch-up later in the day, once');
    assert.equal(digestWindowOpen(18, 0), true, 'still eligible — stamp guarantees at-most-once');
    assert.equal(digestWindowOpen(undefined, undefined), true, 'manual runs remain available');
  });

  it('catches up delayed minute-level runs without sending before the requested time', () => {
    assert.equal(digestTimeMatches(8, 30, 8, 29, 8), false);
    assert.equal(digestTimeMatches(8, 30, 8, 31, 8), true);
    assert.equal(digestTimeMatches(8, 30, 9, 5, 8), true);
    assert.equal(digestTimeMatches(9, 30, 8, 55, 8), false);
  });
});
