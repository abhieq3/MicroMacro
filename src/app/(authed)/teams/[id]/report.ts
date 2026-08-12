// Client-side team report generator (#9).
//
// Builds a self-contained, presentation-ready HTML document from data already
// loaded on the team detail page (team meta, per-project + per-member progress,
// and the full task board) and triggers a download. Self-contained HTML keeps
// it "presentable" — it opens cleanly in any browser, prints straight to PDF,
// and drops into a meeting deck — without pulling in a heavy PDF dependency.

function esc(s: any): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(d: any): string {
  if (!d) return '—';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime())
    ? '—'
    : dt.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

// Whole-calendar-day difference in local time (mirrors `daysUntil` in the app's
// shared ui helpers): a date-only due stored at UTC midnight still resolves to
// the right local day, so "due today" reads as 0 — never overdue. Kept local so
// this report generator stays self-contained.
function dueDaysFromNow(d: any): number | null {
  if (!d) return null;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  const dueDay = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
  const t = new Date();
  const today = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  return Math.round((dueDay - today) / 86400000);
}
function isTaskOverdue(target: any, status: any): boolean {
  if (status === 'done') return false;
  const d = dueDaysFromNow(target);
  return d !== null && d < 0;
}

const STATUS_LABEL: Record<string, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  review: 'Review',
  blocked: 'Blocked',
  done: 'Done',
};
const STATUS_COLOR: Record<string, string> = {
  todo: '#94a3b8',
  in_progress: '#3b82f6',
  review: '#8b5cf6',
  blocked: '#ef4444',
  done: '#22c55e',
};

function bar(pct: number): string {
  const clamped = Math.max(0, Math.min(100, pct));
  const color = clamped >= 90 ? '#22c55e' : clamped >= 60 ? '#3b82f6' : clamped >= 30 ? '#f59e0b' : '#94a3b8';
  return `<div class="bar"><div class="bar-fill" style="width:${clamped}%;background:${color}"></div></div>`;
}

export function buildTeamReportHtml(team: any, progress: any, board: any[], exportedBy = ''): string {
  const generated = new Date().toLocaleString();
  const projects: any[] = progress?.projects || team?.projects || [];
  const members: any[] = progress?.members || team?.members || [];
  const tasks: any[] = board || [];

  const now = new Date();
  const soonCutoff = new Date(now.getTime() + 14 * 86400000); // next 14 days

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.status === 'done').length;
  const overdueTasks = tasks.filter((t) => isTaskOverdue(t.dueDate, t.status));
  const overdue = overdueTasks.length;
  const blocked = tasks.filter((t) => t.status === 'blocked').length;
  const overallPct = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const activeProjects = projects.filter((p) => p.status !== 'completed' && p.status !== 'cancelled').length;

  // Upcoming deadlines — open tasks due within the next 14 days. This is the
  // forward-looking list a lead actually drives the meeting from.
  const upcomingTasks = tasks
    .filter(
      (t) =>
        t.status !== 'done' && t.dueDate && new Date(t.dueDate) >= now && new Date(t.dueDate) <= soonCutoff,
    )
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  // Per-project signal roll-up (keyed by project code) so the Projects table
  // can show health, overdue and blocked at a glance across many projects.
  const projStats = new Map<string, { overdue: number; blocked: number; dueSoon: number }>();
  for (const t of tasks) {
    const key = t.projectCode || t.projectName || '—';
    const s = projStats.get(key) || { overdue: 0, blocked: 0, dueSoon: 0 };
    if (isTaskOverdue(t.dueDate, t.status)) s.overdue++;
    if (t.status === 'blocked') s.blocked++;
    if (t.status !== 'done' && t.dueDate && new Date(t.dueDate) >= now && new Date(t.dueDate) <= soonCutoff)
      s.dueSoon++;
    projStats.set(key, s);
  }
  // Health from the signals: a simple, explainable RAG rule.
  function projHealth(code: string, pct: number): { label: string; color: string; bg: string } {
    const s = projStats.get(code) || { overdue: 0, blocked: 0, dueSoon: 0 };
    if (s.overdue >= 3 || (s.overdue >= 1 && s.blocked >= 1))
      return { label: 'Critical', color: '#b91c1c', bg: '#fef2f2' };
    if (s.overdue >= 1 || s.blocked >= 1) return { label: 'At risk', color: '#b45309', bg: '#fffbeb' };
    return { label: 'On track', color: '#15803d', bg: '#f0fdf4' };
  }
  const atRiskProjects = projects.filter((p) => {
    const s = projStats.get(p.code || p.name || '—') || { overdue: 0, blocked: 0, dueSoon: 0 };
    return s.overdue >= 1 || s.blocked >= 1;
  }).length;

  // Status distribution for the visual breakdown bar.
  const order = ['todo', 'in_progress', 'review', 'blocked', 'done'];
  const counts: Record<string, number> = {};
  for (const s of order) counts[s] = 0;
  for (const t of tasks) counts[t.status] = (counts[t.status] || 0) + 1;
  const distSegments = order
    .filter((s) => counts[s] > 0)
    .map(
      (s) =>
        `<div class="seg" title="${STATUS_LABEL[s]}: ${counts[s]}" style="flex:${counts[s]};background:${STATUS_COLOR[s]}"></div>`,
    )
    .join('');
  const distLegend = order
    .map(
      (s) =>
        `<span class="lg"><i style="background:${STATUS_COLOR[s]}"></i>${STATUS_LABEL[s]} <b>${counts[s]}</b></span>`,
    )
    .join('');

  // ── Executive summary auto-narrative — the line a lead reads aloud. ──
  const summaryBits: string[] = [];
  summaryBits.push(
    `The team is <b>${overallPct}%</b> complete across <b>${projects.length}</b> project${projects.length === 1 ? '' : 's'} (${activeProjects} active).`,
  );
  if (overdue > 0)
    summaryBits.push(
      `<b style="color:#b91c1c">${overdue} task${overdue === 1 ? '' : 's'} overdue</b> and need attention.`,
    );
  else summaryBits.push(`Nothing is overdue — the team is on schedule.`);
  if (blocked > 0) summaryBits.push(`<b style="color:#b91c1c">${blocked} blocked</b>.`);
  if (atRiskProjects > 0)
    summaryBits.push(
      `<b style="color:#b45309">${atRiskProjects} project${atRiskProjects === 1 ? '' : 's'} at risk.</b>`,
    );
  if (upcomingTasks.length > 0)
    summaryBits.push(
      `<b>${upcomingTasks.length}</b> deadline${upcomingTasks.length === 1 ? '' : 's'} in the next 14 days.`,
    );

  const projectRows = projects
    .map((p) => {
      const pct = p.taskCount ? Math.round((p.tasksDone / p.taskCount) * 100) : 0;
      const code = p.code || p.name || '—';
      const s = projStats.get(code) || { overdue: 0, blocked: 0, dueSoon: 0 };
      const h = projHealth(code, pct);
      return `<tr>
      <td><strong>${esc(p.code || '')}</strong> ${esc(p.name || '')}</td>
      <td><span class="pill" style="background:${h.bg};color:${h.color};font-weight:700">${h.label}</span></td>
      <td style="text-align:right">${esc(p.tasksDone ?? 0)}/${esc(p.taskCount ?? 0)}</td>
      <td style="text-align:right;${s.overdue ? 'color:#b91c1c;font-weight:700' : 'color:#94a3b8'}">${s.overdue || '—'}</td>
      <td style="text-align:right;${s.blocked ? 'color:#b91c1c;font-weight:700' : 'color:#94a3b8'}">${s.blocked || '—'}</td>
      <td style="width:140px">${bar(pct)}</td>
      <td style="text-align:right;font-weight:700">${pct}%</td>
    </tr>`;
    })
    .join('');

  // Upcoming deadlines rows — the next-14-days action list.
  const upcomingRows = upcomingTasks
    .map((t) => {
      const days = Math.ceil((new Date(t.dueDate).getTime() - now.getTime()) / 86400000);
      const when = days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days}d`;
      return `<tr>
      <td>${esc(t.title || '')}</td>
      <td>${esc(t.projectCode || '')}</td>
      <td>${esc(t.assigneeName || 'Unassigned')}</td>
      <td><span class="dot" style="background:${STATUS_COLOR[t.status] || '#94a3b8'}"></span>${esc(STATUS_LABEL[t.status] || t.status || '')}</td>
      <td style="font-weight:600;${days <= 2 ? 'color:#b45309' : ''}">${fmtDate(t.dueDate)} <span class="muted">· ${when}</span></td>
    </tr>`;
    })
    .join('');

  const memberRows = members
    .map((m) => {
      const pct = m.assigned ? Math.round((m.done / m.assigned) * 100) : 0;
      return `<tr>
      <td>${esc(m.name || '')}${m.title ? ` <span class="muted">· ${esc(m.title)}</span>` : ''}</td>
      <td style="text-align:right">${esc(m.assigned ?? 0)}</td>
      <td style="text-align:right">${esc(m.done ?? 0)}</td>
      <td style="text-align:right;${(m.overdue ?? 0) > 0 ? 'color:#b91c1c;font-weight:700' : ''}">${esc(m.overdue ?? 0)}</td>
      <td style="width:140px">${bar(pct)}</td>
      <td style="text-align:right;font-weight:700">${pct}%</td>
    </tr>`;
    })
    .join('');

  // Overdue / at-risk section — the meeting's action list.
  const overdueRows = overdueTasks
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .map(
      (t) => `<tr>
      <td>${esc(t.title || '')}</td>
      <td>${esc(t.projectCode || '')}</td>
      <td>${esc(t.assigneeName || 'Unassigned')}</td>
      <td style="color:#b91c1c;font-weight:600">${fmtDate(t.dueDate)}</td>
    </tr>`,
    )
    .join('');

  // All tasks grouped by project for a clean, readable backlog.
  const byProject = new Map<string, any[]>();
  for (const t of tasks) {
    const key = t.projectCode || t.projectName || 'Unassigned';
    if (!byProject.has(key)) byProject.set(key, []);
    byProject.get(key)!.push(t);
  }
  const groupedTasks = [...byProject.entries()]
    .map(([code, ts]) => {
      // Within each project, tasks are listed in TCD (target-date) order — the
      // priority order a reviewer reads top-to-bottom.
      const rows = [...ts]
        .sort(byTcd)
        .map((t) => {
          const target = t.ccTcd || t.dueDate;
          const od = isTaskOverdue(target, t.status);
          return `<tr>
        <td>${esc(t.title || '')}</td>
        <td>${esc(t.assigneeName || 'Unassigned')}</td>
        <td><span class="dot" style="background:${STATUS_COLOR[t.status] || '#94a3b8'}"></span>${esc(STATUS_LABEL[t.status] || t.status || '')}</td>
        <td style="${od ? 'color:#b91c1c;font-weight:600' : ''}">${fmtDate(t.ccTcd || t.dueDate)}</td>
      </tr>`;
        })
        .join('');
      return `<h3>${esc(code)} <span class="muted">· ${ts.length} task${ts.length === 1 ? '' : 's'}</span></h3>
      <table><thead><tr><th>Task</th><th>Assignee</th><th>Status</th><th>Target (TCD)</th></tr></thead><tbody>${rows}</tbody></table>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(team?.name || 'Team')} — Team Report</title>
<style>
  * { box-sizing:border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color:#0f172a; margin:0; background:#f8fafc; }
  .page { max-width:900px; margin:0 auto; padding:40px; background:#fff; }
  .brand { display:flex; align-items:center; justify-content:space-between; border-bottom:3px solid #1565C0; padding-bottom:14px; margin-bottom:8px; }
  .brand .mark { display:flex; align-items:center; gap:10px; }
  .brand .mark svg { display:block; }
  .brand .logo { font-size:13px; font-weight:900; letter-spacing:.18em; color:#1565C0; text-transform:uppercase; line-height:1.2; }
  .brand .logo small { display:block; font-size:9px; font-weight:700; letter-spacing:.12em; color:#94a3b8; }
  .brand .gen { font-size:11px; color:#94a3b8; text-align:right; }
  h1 { font-size:26px; margin:14px 0 2px; }
  h2 { font-size:14px; margin:30px 0 10px; text-transform:uppercase; letter-spacing:.08em; color:#1565C0; border-bottom:1px solid #e2e8f0; padding-bottom:5px; }
  h3 { font-size:13px; margin:18px 0 6px; color:#334155; }
  .muted { color:#94a3b8; font-weight:400; }
  .sub { color:#64748b; margin:0; font-size:13px; }
  .summary { background:#f1f5f9; border-left:4px solid #1565C0; border-radius:8px; padding:14px 16px; margin:18px 0; font-size:14px; line-height:1.6; }
  .kpis { display:flex; gap:10px; flex-wrap:wrap; margin:16px 0; }
  .kpi { border:1px solid #e2e8f0; border-radius:12px; padding:12px 16px; min-width:110px; flex:1; }
  .kpi .n { font-size:24px; font-weight:800; }
  .kpi .l { font-size:10px; text-transform:uppercase; letter-spacing:.06em; color:#64748b; margin-top:2px; }
  .dist { display:flex; height:14px; border-radius:7px; overflow:hidden; margin:6px 0 10px; border:1px solid #e2e8f0; }
  .dist .seg { min-width:2px; }
  .legend { display:flex; gap:14px; flex-wrap:wrap; font-size:11px; color:#475569; margin-bottom:6px; }
  .legend .lg { display:inline-flex; align-items:center; gap:5px; }
  .legend i { width:9px; height:9px; border-radius:2px; display:inline-block; }
  table { width:100%; border-collapse:collapse; font-size:12.5px; margin-bottom:8px; }
  th, td { text-align:left; padding:7px 9px; border-bottom:1px solid #eef2f7; vertical-align:middle; }
  th { font-size:10px; text-transform:uppercase; letter-spacing:.05em; color:#64748b; background:#fafbfd; }
  .pill { font-size:11px; padding:2px 8px; border-radius:99px; background:#eef2f7; color:#475569; text-transform:capitalize; }
  .bar { height:7px; background:#eef2f7; border-radius:99px; overflow:hidden; }
  .bar-fill { height:100%; border-radius:99px; }
  .dot { display:inline-block; width:8px; height:8px; border-radius:99px; margin-right:6px; vertical-align:middle; }
  .risk { border:1px solid #fecaca; background:#fef2f2; border-radius:10px; padding:4px 12px 10px; }
  .footer { margin-top:36px; padding-top:12px; border-top:1px solid #e2e8f0; font-size:11px; color:#94a3b8; text-align:center; }
  @media print { body { background:#fff; } .page { padding:16px; max-width:none; } h2 { break-after:avoid; } table { break-inside:auto; } tr { break-inside:avoid; } }
</style></head>
<body>
  <div class="page">
    <div class="brand">
      <span class="mark">
        <svg width="34" height="34" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <defs><linearGradient id="pg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse"><stop stop-color="#1565C0"/><stop offset="0.45" stop-color="#1769C8"/><stop offset="1" stop-color="#2B8C29"/></linearGradient></defs>
          <rect width="64" height="64" rx="17" fill="url(#pg)"/>
          <g fill="none" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 40 L32 22 L50 40" stroke="#ffffff" stroke-width="7"/>
            <path d="M18 52 L32 38 L46 52" stroke="#B7E4C2" stroke-width="5" opacity="0.92"/>
          </g>
        </svg>
        <span class="logo">Pragati<small>Bird's eye view</small></span>
      </span>
      <span class="gen">Team report<br>Generated ${esc(generated)}${exportedBy ? `<br>Exported by ${esc(exportedBy)}` : ''}</span>
    </div>

    <h1>${esc(team?.name || 'Team')}</h1>
    <p class="sub">${esc(team?.description || 'Team performance & delivery report')}${team?.function ? ` · Function: ${esc(team.function)}` : ''}${team?.leadName ? ` · Lead: ${esc(team.leadName)}` : ''}</p>

    <div class="summary">${summaryBits.join(' ')}</div>

    <div class="kpis">
      <div class="kpi"><div class="n">${projects.length}</div><div class="l">Projects</div></div>
      <div class="kpi"><div class="n">${members.length}</div><div class="l">Members</div></div>
      <div class="kpi"><div class="n">${doneTasks}/${totalTasks}</div><div class="l">Tasks done</div></div>
      <div class="kpi"><div class="n">${overallPct}%</div><div class="l">Completion</div></div>
      <div class="kpi"><div class="n" style="${overdue ? 'color:#b91c1c' : ''}">${overdue}</div><div class="l">Overdue</div></div>
      <div class="kpi"><div class="n" style="${blocked ? 'color:#b91c1c' : ''}">${blocked}</div><div class="l">Blocked</div></div>
      <div class="kpi"><div class="n" style="${atRiskProjects ? 'color:#b45309' : ''}">${atRiskProjects}</div><div class="l">At-risk projects</div></div>
      <div class="kpi"><div class="n">${upcomingTasks.length}</div><div class="l">Due ≤ 14d</div></div>
    </div>

    <h2>Status distribution</h2>
    <div class="legend">${distLegend}</div>
    <div class="dist">${distSegments || '<div class="seg" style="flex:1;background:#eef2f7"></div>'}</div>

    <h2>Projects — health &amp; progress</h2>
    <table><thead><tr><th>Project</th><th>Health</th><th style="text-align:right">Tasks</th><th style="text-align:right">Overdue</th><th style="text-align:right">Blocked</th><th>Progress</th><th style="text-align:right">%</th></tr></thead>
    <tbody>${projectRows || '<tr><td colspan="7" class="muted">No projects.</td></tr>'}</tbody></table>

    ${
      upcomingTasks.length > 0
        ? `<h2>Upcoming deadlines — next 14 days</h2>
    <table><thead><tr><th>Task</th><th>Project</th><th>Assignee</th><th>Status</th><th>Due</th></tr></thead>
    <tbody>${upcomingRows}</tbody></table>`
        : ''
    }

    <h2>Member workload</h2>
    <table><thead><tr><th>Member</th><th style="text-align:right">Assigned</th><th style="text-align:right">Done</th><th style="text-align:right">Overdue</th><th>Progress</th><th style="text-align:right">%</th></tr></thead>
    <tbody>${memberRows || '<tr><td colspan="6" class="muted">No members.</td></tr>'}</tbody></table>

    ${
      overdue > 0
        ? `<h2>⚠ Overdue — needs attention</h2>
    <div class="risk"><table><thead><tr><th>Task</th><th>Project</th><th>Assignee</th><th>Due</th></tr></thead>
    <tbody>${overdueRows}</tbody></table></div>`
        : ''
    }

    <h2>Task backlog by project</h2>
    ${groupedTasks || '<p class="muted">No tasks.</p>'}

    <div class="footer">Generated by Pragati · ${esc(generated)}${exportedBy ? ` · Exported by ${esc(exportedBy)}` : ''}</div>
  </div>
</body></html>`;
}

// ── CSV export ───────────────────────────────────────────────────────────────
// A flat, spreadsheet-friendly dump of the task backlog so a lead can pivot,
// filter, or paste it into a tracker. Complements the visual HTML/PDF report.
function csvCell(v: any): string {
  const s = String(v ?? '');
  // Quote anything containing a comma, quote, or newline; double embedded quotes.
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// TCD-first ordering helper shared by the HTML + CSV exports. Tasks without a
// target date sink to the bottom; done tasks sink below open ones at the same
// date so the action list reads top-down.
function tcdKey(t: any): number {
  const d = t.ccTcd || t.dueDate;
  return d ? new Date(d).getTime() : Number.POSITIVE_INFINITY;
}
function byTcd(a: any, b: any): number {
  const k = tcdKey(a) - tcdKey(b);
  if (k !== 0) return k;
  // open before done at the same date
  return (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0);
}

export function buildTeamReportCsv(team: any, board: any[], exportedBy = ''): string {
  const tasks: any[] = [...(board || [])].sort(byTcd);
  const now = new Date();
  const header = [
    'Ref No',
    'Project Code',
    'Project',
    'Task',
    'Assignee',
    'Status',
    'Priority',
    'Target Date (TCD)',
    'Due Date',
    'Subtasks',
    'Overdue',
    'Days Overdue',
  ];
  const rows = tasks.map((t) => {
    const target = t.ccTcd || t.dueDate;
    const overdue = isTaskOverdue(target, t.status);
    const daysOver = overdue ? Math.abs(dueDaysFromNow(target) as number) : '';
    const subs = (t.subtaskCount ?? 0) > 0 ? `${t.subtasksDone ?? 0}/${t.subtaskCount}` : '';
    return [
      t.ccNo || '',
      t.projectCode || '',
      t.projectName || '',
      t.title || '',
      t.assigneeName || 'Unassigned',
      STATUS_LABEL[t.status] || t.status || '',
      t.priority || '',
      fmtDate(t.ccTcd),
      fmtDate(t.dueDate),
      subs,
      overdue ? 'Yes' : 'No',
      daysOver === '' ? '' : String(daysOver),
    ]
      .map(csvCell)
      .join(',');
  });
  const metaBlock = [
    ['Pragati Team Report', ''],
    ['Team', team?.name || ''],
    ['Generated at', new Date().toLocaleString()],
    ...(exportedBy ? [['Exported by', exportedBy]] : []),
    ['', ''],
  ].map(([k, v]) => [k, v].map(csvCell).join(','));

  return '﻿' + [...metaBlock, header.map(csvCell).join(','), ...rows].join('\r\n');
}

function triggerDownload(content: string, mime: string, filename: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadTeamCsv(team: any, board: any[], exportedBy = '') {
  const safeName = String(team?.name || 'team')
    .replace(/[^a-z0-9]+/gi, '-')
    .toLowerCase();
  triggerDownload(
    buildTeamReportCsv(team, board, exportedBy),
    'text/csv;charset=utf-8',
    `${safeName}-tasks-${new Date().toISOString().slice(0, 10)}.csv`,
  );
}

export function downloadTeamReport(team: any, progress: any, board: any[], exportedBy = '') {
  const html = buildTeamReportHtml(team, progress, board, exportedBy);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = String(team?.name || 'team')
    .replace(/[^a-z0-9]+/gi, '-')
    .toLowerCase();
  a.href = url;
  a.download = `${safeName}-report-${new Date().toISOString().slice(0, 10)}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Open the report in a new tab as a preview, with a floating "Save as PDF /
// Print" action so the user controls when the print dialog opens. Auto-firing
// it on open was jarring — they couldn't skim the report first.
export function printTeamReport(team: any, progress: any, board: any[], exportedBy = '') {
  const html = buildTeamReportHtml(team, progress, board, exportedBy);
  const w = window.open('', '_blank');
  if (!w) {
    downloadTeamReport(team, progress, board, exportedBy);
    return;
  }
  const withPrintBar = html.replace(
    '</body>',
    `<div id="pragati-print-bar" style="position:fixed;right:16px;bottom:16px;z-index:99999;display:flex;gap:8px;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
       <button onclick="window.print()" style="background:linear-gradient(135deg,#1565C0,#2E7D32);color:#fff;border:0;border-radius:10px;padding:10px 14px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 6px 18px rgba(15,23,42,0.18)">Save as PDF / Print</button>
       <button onclick="window.close()" style="background:#fff;color:#475569;border:1px solid #cbd5e1;border-radius:10px;padding:10px 14px;font-size:13px;font-weight:600;cursor:pointer">Close</button>
     </div>
     <style>@media print { #pragati-print-bar { display:none !important; } }</style>
     </body>`,
  );
  w.document.write(withPrintBar);
  w.document.close();
  w.focus();
}
