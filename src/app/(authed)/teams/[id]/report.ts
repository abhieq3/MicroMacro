// Client-side team report — executive PDF (print) + spreadsheet CSV.
// Built for a 1:1 with a lead: exceptions first, owners, next 14 days, then backlog.

import {
  bar,
  byTcd,
  csvCell,
  csvEscapeBom,
  distBar,
  dueDaysFromNow,
  esc,
  fmtDate,
  fmtDateTime,
  isTaskOverdue,
  kpi,
  openPrintableReport,
  PRIORITY_LABEL,
  ragPill,
  STATUS_LABEL,
  statusDot,
  targetOf,
  triggerDownload,
  wrapReportHtml,
} from '@/lib/reports/reportShell';

function functionLabel(fn: string): string {
  const map: Record<string, string> = {
    general: 'General',
    ctb: 'Change the Business',
    rtb: 'Run the Business',
    csv_validation: 'CSV / Validation',
    data_integrity: 'Data Integrity',
    pharmacovigilance: 'Pharmacovigilance',
    lab_informatics: 'Lab Informatics',
    audit: 'Audit',
    training: 'Training',
  };
  return map[fn] || fn || '';
}

export function buildTeamReportHtml(team: any, progress: any, board: any[], exportedBy = ''): string {
  const generated = fmtDateTime();
  // Prefer live team.projects (codes/names); progress.projects for task counts when present.
  const progressById = new Map<string, any>(
    (progress?.projects || []).map((p: any) => [String(p.id || p._id || p.code), p]),
  );
  const projects: any[] = (team?.projects || progress?.projects || [])
    .filter((p: any) => !p.isSystem)
    .map((p: any) => {
      const extra = progressById.get(String(p.id)) || progressById.get(String(p.code)) || {};
      return {
        ...p,
        taskCount: p.taskCount ?? extra.taskCount ?? 0,
        tasksDone: p.tasksDone ?? extra.tasksDone ?? 0,
      };
    });
  const members: any[] = progress?.members || team?.members || [];
  const tasks: any[] = board || [];

  const now = new Date();
  const soonCutoff = new Date(now.getTime() + 14 * 86400000);

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.status === 'done').length;
  const openTasks = tasks.filter((t) => t.status !== 'done');
  const overdueTasks = tasks.filter((t) => isTaskOverdue(targetOf(t), t.status));
  const overdue = overdueTasks.length;
  const blockedTasks = tasks.filter((t) => t.status === 'blocked');
  const blocked = blockedTasks.length;
  const overallPct = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const activeProjects = projects.filter(
    (p) => p.status !== 'completed' && p.status !== 'cancelled',
  ).length;

  const upcomingTasks = openTasks
    .filter((t) => {
      const d = targetOf(t);
      if (!d) return false;
      const dt = new Date(d);
      return dt >= now && dt <= soonCutoff;
    })
    .sort(byTcd);

  // Per-project roll-up by project id (prefer) then code.
  const projStats = new Map<string, { overdue: number; blocked: number; dueSoon: number; open: number }>();
  for (const t of tasks) {
    const key = t.projectId || t.projectCode || t.projectName || '—';
    const s = projStats.get(key) || { overdue: 0, blocked: 0, dueSoon: 0, open: 0 };
    if (t.status !== 'done') s.open++;
    if (isTaskOverdue(targetOf(t), t.status)) s.overdue++;
    if (t.status === 'blocked') s.blocked++;
    const d = targetOf(t);
    if (t.status !== 'done' && d) {
      const dt = new Date(d);
      if (dt >= now && dt <= soonCutoff) s.dueSoon++;
    }
    projStats.set(String(key), s);
    if (t.projectCode) projStats.set(t.projectCode, s);
  }

  function projHealth(p: any): { label: string; tone: 'ok' | 'warn' | 'bad' } {
    const s =
      projStats.get(String(p.id)) ||
      projStats.get(p.code || p.name || '—') || { overdue: 0, blocked: 0, dueSoon: 0, open: 0 };
    if (s.overdue >= 3 || (s.overdue >= 1 && s.blocked >= 1)) return { label: 'Critical', tone: 'bad' };
    if (s.overdue >= 1 || s.blocked >= 1) return { label: 'At risk', tone: 'warn' };
    if (p.status === 'completed' || (p.taskCount > 0 && p.tasksDone >= p.taskCount))
      return { label: 'Complete', tone: 'ok' };
    return { label: 'On track', tone: 'ok' };
  }

  const atRiskProjects = projects.filter((p) => {
    const h = projHealth(p);
    return h.tone === 'warn' || h.tone === 'bad';
  }).length;

  const overallTone: 'ok' | 'warn' | 'bad' =
    overdue >= 5 || blocked >= 3 ? 'bad' : overdue > 0 || blocked > 0 || atRiskProjects > 0 ? 'warn' : 'ok';
  const overallLabel =
    overallTone === 'bad' ? 'Needs intervention' : overallTone === 'warn' ? 'Watch list' : 'On track';

  // Executive narrative — what a lead reads aloud in 20 seconds.
  const summaryBits: string[] = [];
  summaryBits.push(
    `<b>${esc(team?.name || 'Team')}</b> is <b>${overallPct}%</b> complete across <b>${projects.length}</b> project${projects.length === 1 ? '' : 's'} (${activeProjects} active).`,
  );
  if (overdue > 0)
    summaryBits.push(
      `<b style="color:#b91c1c">${overdue} overdue</b> task${overdue === 1 ? '' : 's'} require a decision.`,
    );
  else summaryBits.push(`<b style="color:#15803d">Zero overdue</b> — schedule is clean.`);
  if (blocked > 0) summaryBits.push(`<b style="color:#b91c1c">${blocked} blocked</b>.`);
  if (atRiskProjects > 0)
    summaryBits.push(
      `<b style="color:#b45309">${atRiskProjects} project${atRiskProjects === 1 ? '' : 's'} at risk</b>.`,
    );
  if (upcomingTasks.length > 0)
    summaryBits.push(
      `<b>${upcomingTasks.length}</b> deadline${upcomingTasks.length === 1 ? '' : 's'} in the next 14 days.`,
    );

  // Decisions needed = overdue + blocked, unique, sorted by age / severity.
  const decisionItems = [...openTasks]
    .filter((t) => t.status === 'blocked' || isTaskOverdue(targetOf(t), t.status))
    .sort((a, b) => {
      const aB = a.status === 'blocked' ? 0 : 1;
      const bB = b.status === 'blocked' ? 0 : 1;
      if (aB !== bB) return aB - bB;
      return byTcd(a, b);
    });

  const decisionRows = decisionItems
    .map((t) => {
      const target = targetOf(t);
      const days = dueDaysFromNow(target);
      const late =
        days !== null && days < 0
          ? `${Math.abs(days)}d late`
          : t.status === 'blocked'
            ? 'Blocked'
            : '—';
      const why =
        t.status === 'blocked'
          ? t.pendingWith
            ? `Blocked · waiting on ${t.pendingWith}`
            : 'Blocked'
          : isTaskOverdue(target, t.status)
            ? 'Overdue'
            : '';
      return `<tr>
      <td><strong>${esc(t.title || '')}</strong>
        <div class="muted" style="font-size:10.5px;margin-top:2px">${esc(t.projectCode || '')}${t.priority && t.priority !== 'medium' ? ` · ${esc(PRIORITY_LABEL[t.priority] || t.priority)}` : ''}</div>
      </td>
      <td>${esc(t.assigneeName || 'Unassigned')}</td>
      <td>${statusDot(t.status)}</td>
      <td class="num" style="color:#b91c1c;font-weight:700">${esc(late)}</td>
      <td>${esc(why)}</td>
    </tr>`;
    })
    .join('');

  // Owner accountability — who holds open / overdue work.
  const byOwner = new Map<string, { name: string; open: number; overdue: number; blocked: number }>();
  for (const t of tasks) {
    if (t.status === 'done') continue;
    const id = t.assigneeId || '__unassigned';
    const name = t.assigneeName || 'Unassigned';
    const row = byOwner.get(id) || { name, open: 0, overdue: 0, blocked: 0 };
    row.open++;
    if (isTaskOverdue(targetOf(t), t.status)) row.overdue++;
    if (t.status === 'blocked') row.blocked++;
    byOwner.set(id, row);
  }
  // Merge analytics progress when available
  const ownerRows = [...byOwner.values()]
    .sort((a, b) => b.overdue - a.overdue || b.open - a.open)
    .map((m) => {
      const pctProg = members.find((x: any) => x.name === m.name);
      const assigned = pctProg?.assigned ?? m.open;
      const done = pctProg?.done ?? 0;
      const pct = assigned ? Math.round((done / assigned) * 100) : 0;
      return `<tr>
      <td><strong>${esc(m.name)}</strong></td>
      <td class="num" style="text-align:right">${m.open}</td>
      <td class="num" style="text-align:right;${m.overdue ? 'color:#b91c1c;font-weight:800' : ''}">${m.overdue || '—'}</td>
      <td class="num" style="text-align:right;${m.blocked ? 'color:#b91c1c;font-weight:800' : ''}">${m.blocked || '—'}</td>
      <td style="width:120px">${bar(pct)}</td>
      <td class="num" style="text-align:right;font-weight:800">${pct}%</td>
    </tr>`;
    })
    .join('');

  const projectRows = projects
    .map((p) => {
      const pct = p.taskCount ? Math.round((p.tasksDone / p.taskCount) * 100) : 0;
      const s =
        projStats.get(String(p.id)) ||
        projStats.get(p.code || p.name || '—') || { overdue: 0, blocked: 0, dueSoon: 0, open: 0 };
      const h = projHealth(p);
      return `<tr>
      <td>
        <strong>${esc(p.ccNo || p.code || '')}</strong>
        <div>${esc(p.name || '')}</div>
      </td>
      <td>${ragPill(h.label, h.tone)}</td>
      <td class="num" style="text-align:right">${esc(p.tasksDone ?? 0)}/${esc(p.taskCount ?? 0)}</td>
      <td class="num" style="text-align:right;${s.overdue ? 'color:#b91c1c;font-weight:800' : 'color:#94a3b8'}">${s.overdue || '—'}</td>
      <td class="num" style="text-align:right;${s.blocked ? 'color:#b91c1c;font-weight:800' : 'color:#94a3b8'}">${s.blocked || '—'}</td>
      <td class="num" style="text-align:right;color:#64748b">${s.dueSoon || '—'}</td>
      <td style="width:110px">${bar(pct)}</td>
      <td class="num" style="text-align:right;font-weight:800">${pct}%</td>
    </tr>`;
    })
    .join('');

  const upcomingRows = upcomingTasks
    .map((t) => {
      const days = dueDaysFromNow(targetOf(t));
      const when =
        days === null ? '' : days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days}d`;
      return `<tr>
      <td><strong>${esc(t.title || '')}</strong></td>
      <td>${esc(t.projectCode || '')}</td>
      <td>${esc(t.assigneeName || 'Unassigned')}</td>
      <td>${statusDot(t.status)}</td>
      <td class="num" style="font-weight:700;${days !== null && days <= 2 ? 'color:#b45309' : ''}">${fmtDate(targetOf(t))} <span class="muted">· ${when}</span></td>
    </tr>`;
    })
    .join('');

  // Backlog: open first by TCD, then done (collapsed note).
  const openSorted = [...openTasks].sort(byTcd);
  const byProject = new Map<string, any[]>();
  for (const t of openSorted) {
    const key = t.projectCode || t.projectName || 'Other';
    if (!byProject.has(key)) byProject.set(key, []);
    byProject.get(key)!.push(t);
  }
  const groupedOpen = [...byProject.entries()]
    .map(([code, ts]) => {
      const rows = ts
        .map((t) => {
          const target = targetOf(t);
          const od = isTaskOverdue(target, t.status);
          const days = dueDaysFromNow(target);
          const late =
            od && days !== null ? `<span style="color:#b91c1c;font-weight:700">${Math.abs(days)}d late</span>` : fmtDate(target);
          return `<tr>
        <td>${esc(t.title || '')}</td>
        <td>${esc(t.assigneeName || 'Unassigned')}</td>
        <td>${statusDot(t.status)}</td>
        <td>${t.priority && t.priority !== 'low' ? esc(PRIORITY_LABEL[t.priority] || t.priority) : '—'}</td>
        <td class="num">${late}</td>
      </tr>`;
        })
        .join('');
      return `<h3>${esc(code)} <span class="muted">· ${ts.length} open</span></h3>
      <table><thead><tr><th>Task</th><th>Owner</th><th>Status</th><th>Priority</th><th>Target</th></tr></thead><tbody>${rows}</tbody></table>`;
    })
    .join('');

  const { segments, legend } = distBar(tasks);

  const fn = functionLabel(team?.function || '');
  const body = `
    <h1>${esc(team?.name || 'Team')}</h1>
    <p class="sub">
      ${esc(team?.description || 'Team delivery & exceptions report')}
      ${fn ? ` · <strong>${esc(fn)}</strong>` : ''}
      ${team?.leadName ? ` · Lead: <strong>${esc(team.leadName)}</strong>` : ''}
      · ${ragPill(overallLabel, overallTone)}
    </p>

    <div class="summary">${summaryBits.join(' ')}</div>

    <div class="kpis">
      ${kpi(projects.length, 'Projects')}
      ${kpi(members.length || team?.members?.length || 0, 'Members')}
      ${kpi(`${doneTasks}/${totalTasks}`, 'Tasks done')}
      ${kpi(`${overallPct}%`, 'Completion', overallPct >= 80 ? 'ok' : undefined)}
      ${kpi(openTasks.length, 'Open')}
      ${kpi(overdue, 'Overdue', overdue ? 'bad' : 'ok')}
      ${kpi(blocked, 'Blocked', blocked ? 'bad' : undefined)}
      ${kpi(upcomingTasks.length, 'Due ≤ 14d', upcomingTasks.length > 5 ? 'warn' : undefined)}
    </div>

    <h2>Status mix</h2>
    <div class="legend">${legend}</div>
    <div class="dist">${segments || '<div class="seg" style="flex:1;background:#eef2f7"></div>'}</div>

    ${
      decisionItems.length > 0
        ? `<h2>Decisions needed — ${decisionItems.length}</h2>
    <p class="section-note">Blocked and overdue work only. Use this as the meeting agenda.</p>
    <div class="risk"><table>
      <thead><tr><th>Work item</th><th>Owner</th><th>Status</th><th>Age</th><th>Why</th></tr></thead>
      <tbody>${decisionRows}</tbody>
    </table></div>`
        : `<div class="callout" style="margin-top:20px"><strong>No decisions pending.</strong> Zero overdue and zero blocked on this board.</div>`
    }

    ${
      upcomingTasks.length > 0
        ? `<h2>Next 14 days</h2>
    <p class="section-note">Upcoming targets — protect these dates before they slip.</p>
    <table><thead><tr><th>Task</th><th>Project</th><th>Owner</th><th>Status</th><th>Due</th></tr></thead>
    <tbody>${upcomingRows}</tbody></table>`
        : ''
    }

    <h2>Projects — health &amp; progress</h2>
    <p class="section-note">Recurring system boards are omitted — managed under Teams → Recurring.</p>
    <table><thead><tr>
      <th>Project</th><th>Health</th><th style="text-align:right">Tasks</th>
      <th style="text-align:right">Overdue</th><th style="text-align:right">Blocked</th>
      <th style="text-align:right">≤14d</th><th>Progress</th><th style="text-align:right">%</th>
    </tr></thead>
    <tbody>${projectRows || '<tr><td colspan="8" class="muted">No projects.</td></tr>'}</tbody></table>

    <h2>Owner load</h2>
    <p class="section-note">Open work by person — overdue and blocked call out who needs support.</p>
    <table><thead><tr>
      <th>Owner</th>
      <th style="text-align:right">Open</th>
      <th style="text-align:right">Overdue</th>
      <th style="text-align:right">Blocked</th>
      <th>Done %</th>
      <th style="text-align:right">%</th>
    </tr></thead>
    <tbody>${ownerRows || '<tr><td colspan="6" class="muted">No open assignments.</td></tr>'}</tbody></table>

    <h2>Open backlog by project</h2>
    <p class="section-note">Open items only, target-date order. Done work is excluded so the print stays action-ready.</p>
    ${groupedOpen || '<p class="muted">No open tasks.</p>'}
    ${
      doneTasks > 0
        ? `<p class="muted" style="margin-top:12px">${doneTasks} completed task${doneTasks === 1 ? '' : 's'} omitted from print — use CSV for full history.</p>`
        : ''
    }
  `;

  return wrapReportHtml({
    title: `${team?.name || 'Team'} — Team Report`,
    docType: 'Team status report',
    generated,
    exportedBy,
    bodyHtml: body,
    footerRight: `${team?.name || 'Team'} · ${generated}${exportedBy ? ` · ${exportedBy}` : ''}`,
  });
}

export function buildTeamReportCsv(team: any, board: any[], exportedBy = ''): string {
  const tasks: any[] = [...(board || [])].sort(byTcd);
  const header = [
    'Sr',
    'Ref No',
    'Project Code',
    'Project',
    'Task',
    'Owner',
    'Status',
    'Priority',
    'Type',
    'GxP Critical',
    'Waiting On',
    'Target Date (TCD)',
    'Due Date',
    'Subtasks Done/Total',
    'Overdue',
    'Days Overdue / Until',
    'Open',
  ];
  const rows = tasks.map((t, i) => {
    const target = targetOf(t);
    const overdue = isTaskOverdue(target, t.status);
    const days = dueDaysFromNow(target);
    const daysCol =
      days === null ? '' : overdue ? String(Math.abs(days)) : days >= 0 ? String(days) : String(days);
    const subs =
      (t.subtaskCount ?? 0) > 0 ? `${t.subtasksDone ?? 0}/${t.subtaskCount}` : '';
    return [
      String(i + 1),
      t.ccNo || '',
      t.projectCode || '',
      t.projectName || '',
      t.title || '',
      t.assigneeName || 'Unassigned',
      STATUS_LABEL[t.status] || t.status || '',
      t.priority || '',
      (t.taskType || '').replace(/_/g, ' '),
      t.gxpCritical ? 'Yes' : '',
      t.pendingWith || '',
      fmtDate(t.ccTcd),
      fmtDate(t.dueDate),
      subs,
      overdue ? 'Yes' : 'No',
      daysCol,
      t.status !== 'done' ? 'Yes' : 'No',
    ]
      .map(csvCell)
      .join(',');
  });

  const open = tasks.filter((t) => t.status !== 'done').length;
  const overdueN = tasks.filter((t) => isTaskOverdue(targetOf(t), t.status)).length;
  const blockedN = tasks.filter((t) => t.status === 'blocked').length;
  const meta = [
    ['Pragati Team Report', ''],
    ['Team', team?.name || ''],
    ['Function', functionLabel(team?.function || '')],
    ['Lead', team?.leadName || ''],
    ['Generated at', fmtDateTime()],
    ...(exportedBy ? [['Exported by', exportedBy]] : []),
    ['Open tasks', String(open)],
    ['Overdue', String(overdueN)],
    ['Blocked', String(blockedN)],
    ['', ''],
    ['Tasks', ''],
  ].map((r) => r.map(csvCell).join(','));

  return csvEscapeBom([...meta, header.map(csvCell).join(','), ...rows]);
}

function safeTeamName(team: any): string {
  return String(team?.name || 'team')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

export function downloadTeamCsv(team: any, board: any[], exportedBy = '') {
  triggerDownload(
    buildTeamReportCsv(team, board, exportedBy),
    'text/csv;charset=utf-8',
    `${safeTeamName(team)}-tasks-${new Date().toISOString().slice(0, 10)}.csv`,
  );
}

export function downloadTeamReport(team: any, progress: any, board: any[], exportedBy = '') {
  const html = buildTeamReportHtml(team, progress, board, exportedBy);
  triggerDownload(
    html,
    'text/html;charset=utf-8',
    `${safeTeamName(team)}-report-${new Date().toISOString().slice(0, 10)}.html`,
  );
}

export function printTeamReport(team: any, progress: any, board: any[], exportedBy = '') {
  const html = buildTeamReportHtml(team, progress, board, exportedBy);
  openPrintableReport(html, `${safeTeamName(team)}-report`, () =>
    downloadTeamReport(team, progress, board, exportedBy),
  );
}
