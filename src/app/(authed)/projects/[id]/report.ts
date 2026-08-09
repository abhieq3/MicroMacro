// Client-side project report — executive PDF (print) + rich CSV.
// Mirrors the team report so both exports feel like one product.

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

function lcLabel(lc: string): string {
  return String(lc || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** User-facing project reference — e.g. "SOP# SOP-2026-0004". */
function refDisplay(project: any): string {
  if (project?.isPersonal) return 'Personal';
  const num = (project?.ccNo || '').trim() || project?.code || '';
  const label = (project?.refLabel || '').trim();
  return label ? `${label} ${num}` : num;
}

export function buildProjectReportHtml(project: any, phases: any[], exportedBy = ''): string {
  const generated = fmtDateTime();
  const now = new Date();
  const tasks: any[] = Array.isArray(project?.tasks) ? project.tasks : [];
  const soonCutoff = new Date(now.getTime() + 14 * 86400000);

  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'done').length;
  const open = tasks.filter((t) => t.status !== 'done');
  const overdueTasks = open.filter((t) => isTaskOverdue(targetOf(t), t.status));
  const blockedTasks = open.filter((t) => t.status === 'blocked');
  const blocked = blockedTasks.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const criticalOpen = open.filter((t) => t.priority === 'critical' || t.gxpCritical).length;

  const upcoming = open
    .filter((t) => {
      const d = targetOf(t);
      if (!d) return false;
      const dt = new Date(d);
      return dt >= now && dt <= soonCutoff;
    })
    .sort(byTcd);

  const overallTone: 'ok' | 'warn' | 'bad' =
    overdueTasks.length >= 3 || blocked >= 2
      ? 'bad'
      : overdueTasks.length > 0 || blocked > 0
        ? 'warn'
        : pct >= 100 && total > 0
          ? 'ok'
          : 'ok';
  const overallLabel =
    total > 0 && open.length === 0
      ? 'Complete'
      : overallTone === 'bad'
        ? 'Needs intervention'
        : overallTone === 'warn'
          ? 'At risk'
          : 'On track';

  const bits: string[] = [];
  bits.push(
    `<b>${esc(project?.name || 'Project')}</b> is <b>${pct}%</b> complete — <b>${done}</b> of <b>${total}</b> task${total === 1 ? '' : 's'} done.`,
  );
  if (overdueTasks.length > 0)
    bits.push(
      `<b style="color:#b91c1c">${overdueTasks.length} overdue</b> — clear these before anything new.`,
    );
  else bits.push(`<b style="color:#15803d">Zero overdue</b>.`);
  if (blocked > 0) bits.push(`<b style="color:#b91c1c">${blocked} blocked</b>.`);
  if (criticalOpen > 0) bits.push(`<b>${criticalOpen} critical / GxP-open</b>.`);
  if (project?.dueDate) {
    const days = dueDaysFromNow(project.dueDate);
    if (days !== null) {
      bits.push(
        days < 0
          ? `<b style="color:#b91c1c">Project past due by ${Math.abs(days)}d</b> (target ${fmtDate(project.dueDate)}).`
          : `Project target <b>${fmtDate(project.dueDate)}</b> (${days}d left).`,
      );
    }
  }

  const phaseRows = (phases || [])
    .map((ph: any) => {
      const pts = tasks.filter((t) => String(t.phaseId) === String(ph.id));
      const pdone = pts.filter((t) => t.status === 'done').length;
      const ppct = pts.length ? Math.round((pdone / pts.length) * 100) : 0;
      const pod = pts.filter((t) => isTaskOverdue(targetOf(t), t.status)).length;
      return `<tr>
      <td><strong>${esc(ph.name || '')}</strong></td>
      <td class="num" style="text-align:right">${pdone}/${pts.length}</td>
      <td class="num" style="text-align:right;${pod ? 'color:#b91c1c;font-weight:800' : 'color:#94a3b8'}">${pod || '—'}</td>
      <td style="width:140px">${bar(ppct)}</td>
      <td class="num" style="text-align:right;font-weight:800">${ppct}%</td>
    </tr>`;
    })
    .join('');

  // Decisions = overdue + blocked
  const decisions = [...open]
    .filter((t) => t.status === 'blocked' || isTaskOverdue(targetOf(t), t.status))
    .sort((a, b) => {
      const aB = a.status === 'blocked' ? 0 : 1;
      const bB = b.status === 'blocked' ? 0 : 1;
      if (aB !== bB) return aB - bB;
      return byTcd(a, b);
    });

  const decisionRows = decisions
    .map((t) => {
      const target = targetOf(t);
      const days = dueDaysFromNow(target);
      const age =
        days !== null && days < 0
          ? `${Math.abs(days)}d late`
          : t.status === 'blocked'
            ? 'Blocked'
            : '—';
      return `<tr>
      <td><strong>${esc(t.title || '')}</strong>
        ${t.ccNo ? `<div class="muted" style="font-size:10px;font-family:ui-monospace,monospace">${esc(t.ccNo)}</div>` : ''}
      </td>
      <td>${esc(t.assigneeName || 'Unassigned')}</td>
      <td>${statusDot(t.status)}</td>
      <td>${t.priority ? esc(PRIORITY_LABEL[t.priority] || t.priority) : '—'}</td>
      <td class="num" style="color:#b91c1c;font-weight:800">${esc(age)}</td>
      <td>${esc(t.pendingWith || (t.status === 'blocked' ? 'Unblock needed' : 'Recover date'))}</td>
    </tr>`;
    })
    .join('');

  const upcomingRows = upcoming
    .map((t) => {
      const days = dueDaysFromNow(targetOf(t));
      const when =
        days === null ? '' : days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days}d`;
      return `<tr>
      <td>${esc(t.title || '')}</td>
      <td>${esc(t.assigneeName || 'Unassigned')}</td>
      <td>${statusDot(t.status)}</td>
      <td class="num" style="font-weight:700;${days !== null && days <= 2 ? 'color:#b45309' : ''}">${fmtDate(targetOf(t))} <span class="muted">· ${when}</span></td>
    </tr>`;
    })
    .join('');

  // Owner load within project
  const byOwner = new Map<string, { name: string; open: number; overdue: number }>();
  for (const t of open) {
    const id = t.assigneeId || '__u';
    const row = byOwner.get(id) || { name: t.assigneeName || 'Unassigned', open: 0, overdue: 0 };
    row.open++;
    if (isTaskOverdue(targetOf(t), t.status)) row.overdue++;
    byOwner.set(id, row);
  }
  const ownerRows = [...byOwner.values()]
    .sort((a, b) => b.overdue - a.overdue || b.open - a.open)
    .map(
      (m) => `<tr>
      <td><strong>${esc(m.name)}</strong></td>
      <td class="num" style="text-align:right">${m.open}</td>
      <td class="num" style="text-align:right;${m.overdue ? 'color:#b91c1c;font-weight:800' : ''}">${m.overdue || '—'}</td>
    </tr>`,
    )
    .join('');

  // Full open task list (action pack); done omitted with note
  const openRows = [...open]
    .sort(byTcd)
    .map((t) => {
      const target = targetOf(t);
      const od = isTaskOverdue(target, t.status);
      const days = dueDaysFromNow(target);
      const subs =
        (t.subtaskCount ?? t.subtasks?.length ?? 0) > 0
          ? `${t.subtasksDone ?? t.subtasks?.filter((s: any) => s.status === 'done').length ?? 0}/${t.subtaskCount ?? t.subtasks.length}`
          : '—';
      const targetCell =
        od && days !== null
          ? `<span style="color:#b91c1c;font-weight:800">${fmtDate(target)} · ${Math.abs(days)}d late</span>`
          : fmtDate(target);
      return `<tr>
      <td class="muted" style="font-family:ui-monospace,monospace;font-size:10.5px">${esc(t.ccNo || '')}</td>
      <td><strong>${esc(t.title || '')}</strong>${t.gxpCritical ? ' <span class="pill" style="background:#fef2f2;color:#b91c1c">GxP</span>' : ''}</td>
      <td>${esc(t.assigneeName || 'Unassigned')}</td>
      <td>${statusDot(t.status)}</td>
      <td>${t.priority ? esc(PRIORITY_LABEL[t.priority] || t.priority) : '—'}</td>
      <td style="text-align:center">${esc(subs)}</td>
      <td class="num">${targetCell}</td>
      <td class="muted">${esc(t.pendingWith || '')}</td>
    </tr>`;
    })
    .join('');

  const { segments, legend } = distBar(tasks);
  const ref = refDisplay(project);

  const body = `
    <h1>${esc(project?.name || 'Project')}</h1>
    <div class="refchip">${esc(ref)}</div>
    <p class="sub" style="margin-top:8px">
      ${esc(project?.description || '')}
      ${project?.lifecycle ? ` · ${esc(lcLabel(project.lifecycle))}` : ''}
      ${project?.ownerName ? ` · Owner: <strong>${esc(project.ownerName)}</strong>` : ''}
      ${project?.teamName ? ` · Team: <strong>${esc(project.teamName)}</strong>` : ''}
      ${project?.dueDate ? ` · Due ${fmtDate(project.dueDate)}` : ''}
      · ${ragPill(overallLabel, overallTone)}
    </p>

    <div class="summary">${bits.join(' ')}</div>

    <div class="kpis">
      ${kpi(total, 'Tasks')}
      ${kpi(done, 'Done', done === total && total > 0 ? 'ok' : undefined)}
      ${kpi(`${pct}%`, 'Complete', pct >= 80 ? 'ok' : undefined)}
      ${kpi(open.length, 'Open')}
      ${kpi(overdueTasks.length, 'Overdue', overdueTasks.length ? 'bad' : 'ok')}
      ${kpi(blocked, 'Blocked', blocked ? 'bad' : undefined)}
      ${kpi(criticalOpen, 'Critical / GxP open', criticalOpen ? 'warn' : undefined)}
      ${kpi((phases || []).length, 'Phases')}
    </div>

    <h2>Status mix</h2>
    <div class="legend">${legend}</div>
    <div class="dist">${segments || '<div class="seg" style="flex:1;background:#eef2f7"></div>'}</div>

    ${
      (phases || []).length > 0
        ? `<h2>Phase progress</h2>
    <table><thead><tr><th>Phase</th><th style="text-align:right">Done</th><th style="text-align:right">Overdue</th><th>Progress</th><th style="text-align:right">%</th></tr></thead>
    <tbody>${phaseRows}</tbody></table>`
        : ''
    }

    ${
      decisions.length > 0
        ? `<h2>Decisions needed — ${decisions.length}</h2>
    <p class="section-note">Blocked + overdue. Agenda for the next stand-up or quality review.</p>
    <div class="risk"><table>
      <thead><tr><th>Task</th><th>Owner</th><th>Status</th><th>Priority</th><th>Age</th><th>Action</th></tr></thead>
      <tbody>${decisionRows}</tbody>
    </table></div>`
        : `<div class="callout" style="margin-top:18px"><strong>No decisions pending.</strong> Nothing overdue or blocked on this project.</div>`
    }

    ${
      upcoming.length > 0
        ? `<h2>Next 14 days</h2>
    <table><thead><tr><th>Task</th><th>Owner</th><th>Status</th><th>Target</th></tr></thead>
    <tbody>${upcomingRows}</tbody></table>`
        : ''
    }

    ${
      byOwner.size > 0
        ? `<h2>Owners on this project</h2>
    <table><thead><tr><th>Owner</th><th style="text-align:right">Open</th><th style="text-align:right">Overdue</th></tr></thead>
    <tbody>${ownerRows}</tbody></table>`
        : ''
    }

    <h2>Open work — by target date</h2>
    <p class="section-note">Action list only. Completed tasks are omitted from print; use CSV for full history.</p>
    <table><thead><tr>
      <th>Ref</th><th>Task</th><th>Owner</th><th>Status</th><th>Priority</th>
      <th style="text-align:center">Subs</th><th>Target</th><th>Waiting on</th>
    </tr></thead>
    <tbody>${openRows || '<tr><td colspan="8" class="muted">No open tasks — project clear.</td></tr>'}</tbody></table>
    ${
      done > 0
        ? `<p class="muted" style="margin-top:10px">${done} completed task${done === 1 ? '' : 's'} omitted · export CSV for audit history.</p>`
        : ''
    }
  `;

  return wrapReportHtml({
    title: `${project?.name || 'Project'} — Project Report`,
    docType: 'Project status report',
    generated,
    exportedBy,
    bodyHtml: body,
    footerRight: `${ref} · ${generated}${exportedBy ? ` · ${exportedBy}` : ''}`,
  });
}

export function buildProjectReportCsv(project: any, phases: any[] = [], exportedBy = ''): string {
  const now = new Date();
  const tasks: any[] = [...(Array.isArray(project?.tasks) ? project.tasks : [])].sort(byTcd);
  const ref = refDisplay(project);
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'done').length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const overdueAll = tasks.filter((t) => isTaskOverdue(targetOf(t), t.status)).length;
  const blockedAll = tasks.filter((t) => t.status === 'blocked').length;
  const phaseName = (id: any) => (phases || []).find((p: any) => String(p.id) === String(id))?.name || '';

  const STATUS_KEYS = ['todo', 'in_progress', 'review', 'blocked', 'done'];
  const dist = STATUS_KEYS.reduce<Record<string, number>>((m, k) => {
    m[k] = tasks.filter((t) => t.status === k).length;
    return m;
  }, {});

  const meta: Array<[string, string]> = [
    ['Pragati Project Report', ''],
    ['Generated at', fmtDateTime()],
    ...(exportedBy ? [['Exported by', exportedBy] as [string, string]] : []),
    ['Project Ref', ref],
    ['Project Name', project?.name || ''],
    ['Description', (project?.description || '').replace(/\s+/g, ' ').trim()],
    ['Owner', project?.ownerName || '—'],
    ['Team', project?.teamName || '—'],
    ['Lifecycle', project?.lifecycle || '—'],
    ['Priority', project?.priority || '—'],
    ['Status', String(project?.status || '').replace(/_/g, ' ') || '—'],
    ['Start Date', fmtDate(project?.startDate)],
    ['Due Date', fmtDate(project?.dueDate)],
    ['', ''],
    ['Total tasks', String(total)],
    ['Done', `${done} (${pct}%)`],
    ['Overdue (open)', String(overdueAll)],
    ['Blocked', String(blockedAll)],
    ['Phases', String((phases || []).length)],
    ['', ''],
    ['Status distribution', ''],
    ['  To do', String(dist.todo)],
    ['  In progress', String(dist.in_progress)],
    ['  Review', String(dist.review)],
    ['  Blocked', String(dist.blocked)],
    ['  Done', String(dist.done)],
    ['', ''],
  ];

  const header = [
    'Sr',
    'Project Ref',
    'Phase',
    'Task Ref No',
    'Task',
    'Description',
    'Assignee',
    'Status',
    'Priority',
    'Type',
    'GxP Critical',
    'QA Sign-off',
    'Waiting On',
    'Target Date (TCD)',
    'Due Date',
    'Start Date',
    'Completed At',
    'Subtasks (done/total)',
    'Overdue',
    'Days Overdue / Until',
    'Open',
  ];
  const rows = tasks.map((t, i) => {
    const target = targetOf(t);
    const overdue = isTaskOverdue(target, t.status);
    const days = dueDaysFromNow(target);
    const daysCol = days === null ? '' : String(overdue ? Math.abs(days) : days);
    const subCount = t.subtaskCount ?? t.subtasks?.length ?? 0;
    const subDone = t.subtasksDone ?? t.subtasks?.filter((s: any) => s.status === 'done').length ?? 0;
    return [
      String(i + 1),
      ref,
      phaseName(t.phaseId),
      t.ccNo || '',
      t.title || '',
      (t.description || '').replace(/\s+/g, ' ').trim(),
      t.assigneeName || 'Unassigned',
      STATUS_LABEL[t.status] || t.status || '',
      t.priority || '',
      (t.taskType || '').replace(/_/g, ' '),
      t.gxpCritical ? 'Yes' : '',
      t.requiresQaSignoff ? (t.qaSignoffAt ? 'Signed' : 'Pending') : '',
      t.pendingWith || '',
      fmtDate(t.ccTcd),
      fmtDate(t.dueDate),
      fmtDate(t.startDate),
      fmtDate(t.completedAt),
      subCount > 0 ? `${subDone}/${subCount}` : '',
      overdue ? 'Yes' : 'No',
      daysCol,
      t.status !== 'done' ? 'Yes' : 'No',
    ]
      .map(csvCell)
      .join(',');
  });

  const metaRows = meta.map(([k, v]) => [k, v].map(csvCell).join(','));
  const tasksHeader = ['Tasks', ''].map(csvCell).join(',');
  return csvEscapeBom([...metaRows, tasksHeader, header.map(csvCell).join(','), ...rows]);
}

function safeName(project: any): string {
  const ref = (project?.ccNo || '').trim() || project?.code || project?.name || 'project';
  return String(ref)
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

export function downloadProjectCsv(project: any, phases: any[] = [], exportedBy = '') {
  triggerDownload(
    buildProjectReportCsv(project, phases, exportedBy),
    'text/csv;charset=utf-8',
    `${safeName(project)}-tasks-${new Date().toISOString().slice(0, 10)}.csv`,
  );
}

export function downloadProjectReport(project: any, phases: any[], exportedBy = '') {
  triggerDownload(
    buildProjectReportHtml(project, phases, exportedBy),
    'text/html;charset=utf-8',
    `${safeName(project)}-report-${new Date().toISOString().slice(0, 10)}.html`,
  );
}

export function printProjectReport(project: any, phases: any[], exportedBy = '') {
  const html = buildProjectReportHtml(project, phases, exportedBy);
  openPrintableReport(html, `${safeName(project)}-report`, () =>
    downloadProjectReport(project, phases, exportedBy),
  );
}
