import ExcelJS from 'exceljs';
import { projectRef } from '@/lib/projectRef';

/**
 * Minimal project workbook — two clean sheets (Summary, Tasks) rendered in a
 * ledger style: one accent rule, functional red for what needs attention, and
 * everything else ink/muted on white. No decorative fills, no emoji, no
 * progress-bar glyphs — the format stays out of the way of the data.
 *
 * The reference shown everywhere is the *live* one: the owner's picked
 * change-control number (`ccNo`) with its label (`refLabel`) when set, else the
 * system `code` — the same rule `projectRef` applies across the app, so the
 * export always matches what the user sees in-app.
 *
 * Kept a pure function of already-loaded data (project + tasks with resolved
 * `assigneeName`, and `ownerName`/`teamName` folded onto the project) so the
 * route stays a thin data-loader and this stays unit-testable without a DB.
 */

/* ── Minimal palette ─────────────────────────────────────────────────────── */
const C = {
  ink: 'FF0F172A', // primary text
  muted: 'FF64748B', // secondary text / labels
  faint: 'FF94A3B8', // tertiary (row numbers, em-dashes)
  line: 'FFE2E8F0', // hairline borders
  headBg: 'FFF1F5F9', // subtle column-header fill
  accent: 'FF1565C0', // brand accent — title rule only
  red: 'FFDC2626', // functional: overdue / blocked
  green: 'FF16A34A', // functional: done / complete
};

const FONT = 'Calibri';

/* ── Helpers ─────────────────────────────────────────────────────────────── */
export function daysLate(target: string | Date | null | undefined): number | null {
  if (!target) return null;
  const s = typeof target === 'string' ? target : target.toISOString();
  const d = new Date(s + (s.length === 10 ? 'T12:00:00' : ''));
  return Math.round((Date.now() - d.getTime()) / 86400000);
}

function fmt(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime())
    ? '—'
    : dt.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
}

function statusLabel(s: string): string {
  return (
    {
      todo: 'To do',
      in_progress: 'In progress',
      review: 'Review',
      blocked: 'Blocked',
      done: 'Done',
      planning: 'Planning',
      on_hold: 'On hold',
      completed: 'Completed',
      cancelled: 'Cancelled',
    }[s] ?? s
  );
}

function lcLabel(lc: string): string {
  return lc.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const titleCase = (s: string) => s.replace(/\b\w/, (c) => c.toUpperCase());

/** The user-facing reference, with its picked label — e.g. "SOP# SOP-2026-0004".
 *  Falls back to the bare number (ccNo || code) when no label is set. */
export function refDisplay(project: any): string {
  const num = projectRef(project);
  const label = (project.refLabel || '').trim();
  return label ? `${label} ${num}` : num;
}

/** A task's target date is its CC Target Completion Date when set, else the
 *  plain due date — the same rule the rest of the app reads by. */
function targetOf(t: any): string | Date | null {
  return t.ccTcd || t.dueDate || null;
}

/**
 * Sanitize string values before writing to a cell to prevent CSV / formula
 * injection (CWE-1236): a title like `=cmd|'/c calc'!A1` would otherwise run as
 * a formula when opened in Excel / LibreOffice. Only strings beginning with
 * =, +, -, @, TAB, or CR are defanged with a leading single quote.
 */
export function safeCellValue(value: any): any {
  if (typeof value !== 'string' || value.length === 0) return value;
  const first = value.charCodeAt(0);
  if ([0x3d, 0x2b, 0x2d, 0x40, 0x09, 0x0d].includes(first)) return `'${value}`;
  return value;
}

type CellOpts = {
  bold?: boolean;
  color?: string;
  align?: ExcelJS.Alignment['horizontal'];
  size?: number;
  wrap?: boolean;
  italic?: boolean;
};

function cell(ws: ExcelJS.Worksheet, row: number, col: number, value: any, opts: CellOpts = {}) {
  const c = ws.getCell(row, col);
  c.value = safeCellValue(value ?? '—');
  c.font = {
    name: FONT,
    size: opts.size ?? 10,
    bold: opts.bold,
    italic: opts.italic,
    color: { argb: opts.color ?? C.ink },
  };
  c.alignment = { vertical: 'middle', horizontal: opts.align ?? 'left', wrapText: opts.wrap };
  return c;
}

/** A single hairline rule under a row of cells — the only table border, for a
 *  clean ledger look instead of a boxed grid. */
function underline(ws: ExcelJS.Worksheet, row: number, from: number, to: number, color = C.line) {
  for (let c = from; c <= to; c++) {
    ws.getCell(row, c).border = { bottom: { style: 'thin', color: { argb: color } } };
  }
}

/** Small uppercase section label with an accent rule beneath it. */
function section(ws: ExcelJS.Worksheet, row: number, cols: number, text: string) {
  const c = cell(ws, row, 1, text, { bold: true, size: 9, color: C.muted });
  c.alignment = { vertical: 'middle', horizontal: 'left' };
  ws.getRow(row).height = 18;
  underline(ws, row, 1, cols, C.accent);
}

/** Column header row — subtle fill, muted caps, hairline underneath. */
function columns(ws: ExcelJS.Worksheet, row: number, headers: string[], aligns: CellOpts['align'][] = []) {
  ws.getRow(row).height = 16;
  headers.forEach((h, i) => {
    const c = cell(ws, row, i + 1, h, { bold: true, size: 9, color: C.muted, align: aligns[i] ?? 'left' });
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.headBg } };
  });
  underline(ws, row, 1, headers.length, C.line);
}

type Span = [from: number, to: number, text: string, align?: CellOpts['align']];

/** Header row whose columns can span more than one physical cell — for the
 *  summary sub-tables. Fill sits on the span's top-left cell (Excel paints it
 *  across the merge); one hairline rules the full width. */
function spanHeader(ws: ExcelJS.Worksheet, row: number, cols: number, spans: Span[]) {
  ws.getRow(row).height = 16;
  for (const [from, to, text, align] of spans) {
    if (to > from) ws.mergeCells(row, from, row, to);
    const c = cell(ws, row, from, text, { bold: true, size: 9, color: C.muted, align: align ?? 'left' });
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.headBg } };
  }
  underline(ws, row, 1, cols, C.line);
}

/* ── Sheet 1 — Summary ─────────────────────────────────────────────────────── */
function buildSummarySheet(wb: ExcelJS.Workbook, project: any, tasks: any[]) {
  const ws = wb.addWorksheet('Summary');
  ws.views = [{ showGridLines: false }];
  const COLS = 6;
  ws.columns = [{ width: 18 }, { width: 24 }, { width: 18 }, { width: 24 }, { width: 13 }, { width: 13 }];

  let r = 1;

  // Title — project name, then a muted reference/status line under an accent rule.
  ws.getRow(r).height = 26;
  ws.mergeCells(r, 1, r, COLS);
  cell(ws, r, 1, project.name, { bold: true, size: 16 });
  r++;

  ws.getRow(r).height = 16;
  ws.mergeCells(r, 1, r, COLS);
  cell(
    ws,
    r,
    1,
    `${refDisplay(project)}   ·   ${statusLabel(project.status)}   ·   ${lcLabel(project.lifecycle || 'generic')}`,
    { size: 10, color: C.muted },
  );
  underline(ws, r, 1, COLS, C.accent);
  r++;

  ws.getRow(r).height = 14;
  ws.mergeCells(r, 1, r, COLS);
  cell(ws, r, 1, `Generated ${new Date().toLocaleDateString('en-US', { dateStyle: 'long' } as any)}`, {
    size: 8,
    italic: true,
    color: C.faint,
  });
  r += 2;

  // ── Details ──
  section(ws, r, COLS, 'DETAILS');
  r++;
  const pairs: [string, string, string, string][] = [
    ['Reference', refDisplay(project), 'Status', statusLabel(project.status)],
    ['Priority', titleCase(project.priority || 'medium'), 'Lifecycle', lcLabel(project.lifecycle || 'generic')],
    ['Owner', project.ownerName || '—', 'Team', project.teamName || '—'],
    ['Start date', fmt(project.startDate), 'Due date', fmt(project.dueDate)],
  ];
  if ((project.gxpImpact || 'none') !== 'none') {
    pairs.push([
      'GxP impact',
      String(project.gxpImpact).toUpperCase(),
      'Regulatory refs',
      project.regulatoryRefs || '—',
    ]);
  }
  for (const [k1, v1, k2, v2] of pairs) {
    ws.getRow(r).height = 17;
    cell(ws, r, 1, k1, { color: C.muted });
    cell(ws, r, 2, v1, { bold: true });
    cell(ws, r, 3, k2, { color: C.muted });
    cell(ws, r, 4, v2, { bold: true });
    r++;
  }
  if (project.description) {
    ws.getRow(r).height = Math.min(90, 20 + Math.floor(project.description.length / 60) * 14);
    cell(ws, r, 1, 'Description', { color: C.muted });
    ws.mergeCells(r, 2, r, COLS);
    cell(ws, r, 2, project.description, { wrap: true });
    r++;
  }
  r++;

  // ── Metrics ──
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'done').length;
  const inProg = tasks.filter((t) => t.status === 'in_progress').length;
  const blocked = tasks.filter((t) => t.status === 'blocked').length;
  const overdue = tasks.filter((t) => t.status !== 'done' && (daysLate(targetOf(t)) ?? -1) > 0).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  section(ws, r, COLS, 'OVERVIEW');
  r++;
  const metrics: [string, number | string, string?][] = [
    ['Total', total],
    ['Done', done, done > 0 ? C.green : undefined],
    ['In progress', inProg],
    ['Overdue', overdue, overdue > 0 ? C.red : undefined],
    ['Blocked', blocked, blocked > 0 ? C.red : undefined],
    ['Complete', `${pct}%`, pct >= 80 ? C.green : undefined],
  ];
  ws.getRow(r).height = 14;
  metrics.forEach(([label], i) => cell(ws, r, i + 1, label, { size: 9, color: C.muted, align: 'left' }));
  r++;
  ws.getRow(r).height = 22;
  metrics.forEach(([, value, color], i) =>
    cell(ws, r, i + 1, value, { bold: true, size: 15, color: color ?? C.ink, align: 'left' }),
  );
  underline(ws, r, 1, COLS, C.line);
  r += 2;

  // ── Phase progress ──
  const phases = project.phases || [];
  const phaseRows = phases
    .map((ph: any) => {
      const pt = tasks.filter((t) => String(t.phaseId) === String(ph._id));
      return { name: ph.name, total: pt.length, done: pt.filter((t) => t.status === 'done').length };
    })
    .filter((p: any) => p.total > 0);
  if (phaseRows.length > 0) {
    section(ws, r, COLS, 'PHASE PROGRESS');
    r++;
    spanHeader(ws, r, COLS, [
      [1, 3, 'Phase', 'left'],
      [4, 4, 'Done / Total', 'center'],
      [5, 6, '% Complete', 'center'],
    ]);
    r++;
    for (const p of phaseRows) {
      const ppct = p.total ? Math.round((p.done / p.total) * 100) : 0;
      ws.getRow(r).height = 16;
      ws.mergeCells(r, 1, r, 3);
      cell(ws, r, 1, p.name, { bold: true });
      cell(ws, r, 4, `${p.done} / ${p.total}`, { align: 'center', color: C.muted });
      ws.mergeCells(r, 5, r, 6);
      cell(ws, r, 5, `${ppct}%`, {
        align: 'center',
        bold: true,
        color: ppct >= 80 ? C.green : ppct === 0 ? C.faint : C.ink,
      });
      underline(ws, r, 1, COLS, C.line);
      r++;
    }
    r++;
  }

  // ── Needs attention (blocked + overdue) ──
  const attention = tasks
    .filter((t) => t.status === 'blocked' || (t.status !== 'done' && (daysLate(targetOf(t)) ?? -1) > 0))
    .sort((a, b) => (daysLate(targetOf(b)) ?? 0) - (daysLate(targetOf(a)) ?? 0));
  if (attention.length > 0) {
    section(ws, r, COLS, `NEEDS ATTENTION (${attention.length})`);
    r++;
    spanHeader(ws, r, COLS, [
      [1, 2, 'Task', 'left'],
      [3, 3, 'Assignee', 'left'],
      [4, 4, 'Status', 'left'],
      [5, 5, 'Target', 'center'],
      [6, 6, 'Late', 'center'],
    ]);
    r++;
    for (const t of attention) {
      const late = daysLate(targetOf(t));
      const isLate = t.status !== 'done' && late !== null && late > 0;
      ws.getRow(r).height = 16;
      ws.mergeCells(r, 1, r, 2);
      cell(ws, r, 1, t.title, { bold: true });
      cell(ws, r, 3, t.assigneeName || 'Unassigned', { color: C.muted });
      cell(ws, r, 4, statusLabel(t.status), {
        color: t.status === 'blocked' ? C.red : C.ink,
        bold: t.status === 'blocked',
      });
      cell(ws, r, 5, fmt(targetOf(t)), { align: 'center', color: isLate ? C.red : C.muted });
      cell(ws, r, 6, isLate ? `${late}d` : '—', { align: 'center', color: isLate ? C.red : C.faint, bold: isLate });
      underline(ws, r, 1, COLS, C.line);
      r++;
    }
  }
}

/* ── Sheet 2 — Tasks (grouped by phase, ordered by target date) ────────────── */
function buildTasksSheet(wb: ExcelJS.Workbook, project: any, tasks: any[]) {
  const ws = wb.addWorksheet('Tasks');
  ws.views = [{ showGridLines: false }];
  const COLS = 8;
  ws.columns = [
    { width: 4 },
    { width: 14 },
    { width: 42 },
    { width: 18 },
    { width: 13 },
    { width: 11 },
    { width: 14 },
    { width: 8 },
  ];

  let r = 1;
  ws.getRow(r).height = 22;
  ws.mergeCells(r, 1, r, COLS);
  cell(ws, r, 1, `${project.name} — Tasks`, { bold: true, size: 14 });
  underline(ws, r, 1, COLS, C.accent);
  r += 2;

  const byTarget = (a: any, b: any) => {
    const ta = targetOf(a) ? new Date(targetOf(a) as any).getTime() : Infinity;
    const tb = targetOf(b) ? new Date(targetOf(b) as any).getTime() : Infinity;
    if (ta !== tb) return ta - tb;
    return (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0);
  };

  const phases = project.phases || [];
  // Groups in phase order, then an Unphased bucket for any task whose phase was
  // removed — so no task silently drops out of the export.
  const groups: { name: string; tasks: any[] }[] = phases
    .map((ph: any) => ({
      name: ph.name,
      tasks: tasks.filter((t) => String(t.phaseId) === String(ph._id)).sort(byTarget),
    }))
    .filter((g: any) => g.tasks.length > 0);
  const phaseIds = new Set(phases.map((p: any) => String(p._id)));
  const unphased = tasks.filter((t) => !t.phaseId || !phaseIds.has(String(t.phaseId))).sort(byTarget);
  if (unphased.length > 0) groups.push({ name: 'Unphased', tasks: unphased });

  if (groups.length === 0) {
    cell(ws, r, 1, 'No tasks yet.', { color: C.muted, italic: true });
    return;
  }

  for (const g of groups) {
    const gDone = g.tasks.filter((t) => t.status === 'done').length;
    section(ws, r, COLS, `${g.name.toUpperCase()}  ·  ${gDone}/${g.tasks.length} done`);
    r++;
    columns(
      ws,
      r,
      ['#', 'Ref', 'Task', 'Assignee', 'Status', 'Priority', 'Target', 'Late'],
      ['center', 'left', 'left', 'left', 'left', 'left', 'center', 'center'],
    );
    r++;
    g.tasks.forEach((t, i) => {
      const late = daysLate(targetOf(t));
      const isLate = t.status !== 'done' && late !== null && late > 0;
      ws.getRow(r).height = 16;
      cell(ws, r, 1, i + 1, { align: 'center', color: C.faint, size: 9 });
      cell(ws, r, 2, t.ccNo || '—', { color: C.muted, size: 9 });
      cell(ws, r, 3, t.title, { bold: t.status === 'blocked' || isLate });
      cell(ws, r, 4, t.assigneeName || 'Unassigned', { color: C.muted });
      cell(ws, r, 5, statusLabel(t.status), {
        color: t.status === 'blocked' ? C.red : t.status === 'done' ? C.green : C.ink,
      });
      cell(ws, r, 6, titleCase(t.priority || 'low'), {
        color: t.priority === 'critical' || t.priority === 'high' ? C.red : C.muted,
        bold: t.priority === 'critical',
      });
      cell(ws, r, 7, fmt(targetOf(t)), { align: 'center', color: isLate ? C.red : C.muted });
      cell(ws, r, 8, t.status === 'done' ? '—' : isLate ? `${late}d` : '—', {
        align: 'center',
        color: isLate ? C.red : C.faint,
        bold: isLate,
      });
      underline(ws, r, 1, COLS, C.line);
      r++;
    });
    r++;
  }
}

/**
 * Build the minimal two-sheet project workbook. `project` should already carry
 * resolved `ownerName`/`teamName`, and each task an `assigneeName` (the route
 * folds these on from the id maps).
 */
export function buildProjectWorkbook(project: any, tasks: any[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Pragati';
  wb.created = new Date();
  wb.modified = new Date();
  buildSummarySheet(wb, project, tasks);
  buildTasksSheet(wb, project, tasks);
  return wb;
}

/** The download filename — the live reference number (label dropped, sanitized)
 *  plus the date, so the file matches what the user sees in-app. */
export function exportFilename(project: any, now = new Date()): string {
  const ref = projectRef(project) || 'project';
  const safeRef = ref.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'project';
  return `Pragati_${safeRef}_${now.toISOString().slice(0, 10)}.xlsx`;
}
