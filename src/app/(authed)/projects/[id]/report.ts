// Client-side project report generator.
//
// Builds a presentation-ready, self-contained HTML document (and a flat CSV)
// from the project + its tasks already loaded on the page, then triggers a
// download / print. Mirrors the team report so both exports feel like one
// product. Tasks are always ordered by CC Target Completion Date (TCD).

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
  const c = Math.max(0, Math.min(100, pct));
  const color = c >= 90 ? '#22c55e' : c >= 60 ? '#3b82f6' : c >= 30 ? '#f59e0b' : '#94a3b8';
  return `<div class="bar"><div class="bar-fill" style="width:${c}%;background:${color}"></div></div>`;
}

// Target-date (TCD) ordering — the priority order a reviewer reads top-down.
function tcdKey(t: any): number {
  const d = t.ccTcd || t.dueDate;
  return d ? new Date(d).getTime() : Number.POSITIVE_INFINITY;
}
function byTcd(a: any, b: any): number {
  const k = tcdKey(a) - tcdKey(b);
  if (k !== 0) return k;
  return (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0);
}

function lcLabel(lc: string): string {
  return String(lc || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * The user-facing project reference, with its picked label — e.g.
 * "SOP# SOP-2026-0004". Uses the live change-control number `ccNo` when the
 * owner has set one, else the system `code` (the same rule the app header and
 * digest read by). Personal projects have no shared reference.
 */
function refDisplay(project: any): string {
  if (project?.isPersonal) return 'Personal';
  const num = (project?.ccNo || '').trim() || project?.code || '';
  const label = (project?.refLabel || '').trim();
  return label ? `${label} ${num}` : num;
}

export function buildProjectReportHtml(project: any, phases: any[], exportedBy = ''): string {
  const generated = new Date().toLocaleString();
  const now = new Date();
  const tasks: any[] = Array.isArray(project?.tasks) ? project.tasks : [];

  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'done').length;
  const overdueTasks = tasks.filter((t) => {
    const d = t.ccTcd || t.dueDate;
    return d && new Date(d) < now && t.status !== 'done';
  });
  const blocked = tasks.filter((t) => t.status === 'blocked').length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  // Status distribution bar.
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

  // Auto-narrative summary.
  const bits: string[] = [];
  bits.push(
    `This project is <b>${pct}%</b> complete — <b>${done}</b> of <b>${total}</b> task${total === 1 ? '' : 's'} done.`,
  );
  if (overdueTasks.length > 0)
    bits.push(`<b style="color:#b91c1c">${overdueTasks.length} overdue</b> and need attention.`);
  else bits.push('Nothing is overdue.');
  if (blocked > 0) bits.push(`<b style="color:#b91c1c">${blocked} blocked.</b>`);
  if (project?.dueDate) {
    const days = Math.ceil((new Date(project.dueDate).getTime() - now.getTime()) / 86400000);
    bits.push(
      days < 0
        ? `<b style="color:#b91c1c">Past due by ${Math.abs(days)}d.</b>`
        : `Due ${fmtDate(project.dueDate)} (${days}d left).`,
    );
  }

  // Phase progress table.
  const phaseRows = (phases || [])
    .map((ph: any) => {
      const pts = tasks.filter((t) => String(t.phaseId) === String(ph.id));
      const pdone = pts.filter((t) => t.status === 'done').length;
      const ppct = pts.length ? Math.round((pdone / pts.length) * 100) : 0;
      return `<tr>
      <td><strong>${esc(ph.name || '')}</strong></td>
      <td style="text-align:right">${pdone}/${pts.length}</td>
      <td style="width:160px">${bar(ppct)}</td>
      <td style="text-align:right;font-weight:700">${ppct}%</td>
    </tr>`;
    })
    .join('');

  // Overdue action list — TCD order.
  const overdueRows = [...overdueTasks]
    .sort(byTcd)
    .map(
      (t) => `<tr>
    <td>${esc(t.title || '')}</td>
    <td>${esc(t.assigneeName || 'Unassigned')}</td>
    <td style="color:#b91c1c;font-weight:600">${fmtDate(t.ccTcd || t.dueDate)}</td>
  </tr>`,
    )
    .join('');

  // Full task list — TCD order.
  const taskRows = [...tasks]
    .sort(byTcd)
    .map((t) => {
      const target = t.ccTcd || t.dueDate;
      const od = target && new Date(target) < now && t.status !== 'done';
      const subs =
        (t.subtaskCount ?? t.subtasks?.length ?? 0) > 0
          ? `${t.subtasksDone ?? t.subtasks?.filter((s: any) => s.status === 'done').length ?? 0}/${t.subtaskCount ?? t.subtasks.length}`
          : '—';
      return `<tr>
      <td>${esc(t.ccNo || '')}</td>
      <td>${esc(t.title || '')}</td>
      <td>${esc(t.assigneeName || 'Unassigned')}</td>
      <td><span class="dot" style="background:${STATUS_COLOR[t.status] || '#94a3b8'}"></span>${esc(STATUS_LABEL[t.status] || t.status || '')}</td>
      <td style="text-align:center">${esc(subs)}</td>
      <td style="${od ? 'color:#b91c1c;font-weight:600' : ''}">${fmtDate(t.ccTcd || t.dueDate)}</td>
    </tr>`;
    })
    .join('');

  const ref = refDisplay(project);

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(project?.name || 'Project')} — Project Report</title>
<style>
  * { box-sizing:border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color:#0f172a; margin:0; background:#f8fafc; }
  .page { max-width:900px; margin:0 auto; padding:40px; background:#fff; }
  .brand { display:flex; align-items:center; justify-content:space-between; border-bottom:3px solid #1565C0; padding-bottom:14px; margin-bottom:8px; }
  .brand .mark { display:flex; align-items:center; gap:10px; }
  .brand .logo { font-size:13px; font-weight:900; letter-spacing:.18em; color:#1565C0; text-transform:uppercase; line-height:1.2; }
  .brand .logo small { display:block; font-size:9px; font-weight:700; letter-spacing:.12em; color:#94a3b8; }
  .brand .gen { font-size:11px; color:#94a3b8; text-align:right; }
  .refchip { display:inline-block; font-family:ui-monospace,monospace; font-size:12px; font-weight:700; color:#1565C0; background:#E3F2FD; border-radius:6px; padding:2px 8px; margin-top:6px; }
  h1 { font-size:26px; margin:14px 0 2px; }
  h2 { font-size:14px; margin:30px 0 10px; text-transform:uppercase; letter-spacing:.08em; color:#1565C0; border-bottom:1px solid #e2e8f0; padding-bottom:5px; }
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
  .bar { height:7px; background:#eef2f7; border-radius:99px; overflow:hidden; }
  .bar-fill { height:100%; border-radius:99px; }
  .dot { display:inline-block; width:8px; height:8px; border-radius:99px; margin-right:6px; vertical-align:middle; }
  .risk { border:1px solid #fecaca; background:#fef2f2; border-radius:10px; padding:4px 12px 10px; }
  .footer { margin-top:36px; padding-top:12px; border-top:1px solid #e2e8f0; font-size:11px; color:#94a3b8; text-align:center; }
  @media print { body { background:#fff; } .page { padding:16px; max-width:none; } h2 { break-after:avoid; } tr { break-inside:avoid; } }
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
      <span class="gen">Project report<br>Generated ${esc(generated)}${exportedBy ? `<br>Exported by ${esc(exportedBy)}` : ''}</span>
    </div>

    <h1>${esc(project?.name || 'Project')}</h1>
    <div class="refchip">${esc(ref)}</div>
    <p class="sub" style="margin-top:8px">${esc(project?.description || '')}${project?.lifecycle ? ` · ${esc(lcLabel(project.lifecycle))}` : ''}${project?.ownerName ? ` · Owner: ${esc(project.ownerName)}` : ''}${project?.dueDate ? ` · Due ${fmtDate(project.dueDate)}` : ''}</p>

    <div class="summary">${bits.join(' ')}</div>

    <div class="kpis">
      <div class="kpi"><div class="n">${total}</div><div class="l">Tasks</div></div>
      <div class="kpi"><div class="n">${done}</div><div class="l">Done</div></div>
      <div class="kpi"><div class="n">${pct}%</div><div class="l">Completion</div></div>
      <div class="kpi"><div class="n" style="${overdueTasks.length ? 'color:#b91c1c' : ''}">${overdueTasks.length}</div><div class="l">Overdue</div></div>
      <div class="kpi"><div class="n" style="${blocked ? 'color:#b91c1c' : ''}">${blocked}</div><div class="l">Blocked</div></div>
      <div class="kpi"><div class="n">${(phases || []).length}</div><div class="l">Phases</div></div>
    </div>

    <h2>Status distribution</h2>
    <div class="legend">${distLegend}</div>
    <div class="dist">${distSegments || '<div class="seg" style="flex:1;background:#eef2f7"></div>'}</div>

    ${
      (phases || []).length > 0
        ? `<h2>Phase progress</h2>
    <table><thead><tr><th>Phase</th><th style="text-align:right">Done</th><th>Progress</th><th style="text-align:right">%</th></tr></thead>
    <tbody>${phaseRows}</tbody></table>`
        : ''
    }

    ${
      overdueTasks.length > 0
        ? `<h2>⚠ Overdue — needs attention</h2>
    <div class="risk"><table><thead><tr><th>Task</th><th>Assignee</th><th>Target (TCD)</th></tr></thead>
    <tbody>${overdueRows}</tbody></table></div>`
        : ''
    }

    <h2>All tasks — by target date</h2>
    <table><thead><tr><th>Ref</th><th>Task</th><th>Assignee</th><th>Status</th><th style="text-align:center">Subtasks</th><th>Target (TCD)</th></tr></thead>
    <tbody>${taskRows || '<tr><td colspan="6" class="muted">No tasks.</td></tr>'}</tbody></table>

    <div class="footer">Generated by Pragati · ${esc(ref)} · ${esc(generated)}${exportedBy ? ` · Exported by ${esc(exportedBy)}` : ''}</div>
  </div>
</body></html>`;
}

// ── CSV ──────────────────────────────────────────────────────────────────────
function csvCell(v: any): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildProjectReportCsv(project: any, phases: any[] = [], exportedBy = ''): string {
  const now = new Date();
  const tasks: any[] = [...(Array.isArray(project?.tasks) ? project.tasks : [])].sort(byTcd);
  const ref = refDisplay(project);
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'done').length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const overdueAll = tasks.filter((t) => {
    const d = t.ccTcd || t.dueDate;
    return d && new Date(d) < now && t.status !== 'done';
  }).length;
  const blockedAll = tasks.filter((t) => t.status === 'blocked').length;
  const phaseName = (id: any) => (phases || []).find((p: any) => String(p.id) === String(id))?.name || '';

  const STATUS_KEYS = ['todo', 'in_progress', 'review', 'blocked', 'done'];
  const dist = STATUS_KEYS.reduce<Record<string, number>>((m, k) => {
    m[k] = tasks.filter((t) => t.status === k).length;
    return m;
  }, {});

  const meta: Array<[string, string]> = [
    ['Pragati Project Report', ''],
    ['Generated at', new Date().toLocaleString()],
    ...(exportedBy ? [['Exported by', exportedBy] as [string, string]] : []),
    ['Project Ref', ref],
    ['Project Name', project?.name || ''],
    ['Description', project?.description || ''],
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

  // Section 2: tasks table.
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
    'QA Sign-off Required',
    'Waiting On',
    'Target Date (TCD)',
    'Due Date',
    'Start Date',
    'Completed At',
    'Subtasks (done/total)',
    'Overdue',
    'Days Overdue',
  ];
  const rows = tasks.map((t, i) => {
    const target = t.ccTcd || t.dueDate;
    const overdue = target && new Date(target) < now && t.status !== 'done';
    const daysOver = overdue ? Math.round((now.getTime() - new Date(target).getTime()) / 86400000) : '';
    const subCount = t.subtaskCount ?? t.subtasks?.length ?? 0;
    const subDone = t.subtasksDone ?? t.subtasks?.filter((s: any) => s.status === 'done').length ?? 0;
    return [
      String(i + 1),
      ref,
      phaseName(t.phaseId),
      t.ccNo || '',
      t.title || '',
      // Strip newlines so the cell stays one row in Excel.
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
      daysOver === '' ? '' : String(daysOver),
    ]
      .map(csvCell)
      .join(',');
  });

  const metaRows = meta.map(([k, v]) => [k, v].map(csvCell).join(','));
  const tasksHeader = ['Tasks', ''].map(csvCell).join(',');
  // BOM + CRLF so Excel/Sheets open UTF-8 + line breaks correctly.
  return '﻿' + [...metaRows, tasksHeader, header.map(csvCell).join(','), ...rows].join('\r\n');
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

function safeName(project: any): string {
  // Live reference number (ccNo when set, else system code) so the file matches
  // what the user sees in-app — the label is dropped, only the number is used.
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
  const w = window.open('', '_blank');
  if (!w) {
    downloadProjectReport(project, phases);
    return;
  }
  // Inject a floating action bar with a "Save as PDF" trigger, hidden on print.
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
