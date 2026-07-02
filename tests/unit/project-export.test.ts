/**
 * Unit tests for the minimal project workbook export. Exercises the real
 * ExcelJS builders (no DB): the live reference number surfaces everywhere, the
 * two sheets render, blocked/overdue work lands in "Needs attention", tasks
 * whose phase was removed still appear under "Unphased", and formula-injection
 * strings are defanged. Also re-reads the written buffer to prove the merge
 * layout produces a structurally valid workbook.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import ExcelJS from 'exceljs';

import {
  buildProjectWorkbook,
  exportFilename,
  refDisplay,
  safeCellValue,
  daysLate,
} from '@/lib/reports/projectWorkbook';

const PAST = '2020-01-01'; // always overdue
const FUTURE = '2999-01-01'; // never overdue

function sampleProject(overrides: Record<string, any> = {}) {
  return {
    name: 'Line 3 Requalification',
    code: 'SOP-2026-0004',
    ccNo: 'CC-2025-042',
    refLabel: 'CC#',
    status: 'in_progress',
    lifecycle: 'change_control',
    priority: 'high',
    gxpImpact: 'high',
    regulatoryRefs: '21 CFR 211',
    ownerName: 'Asha Rao',
    teamName: 'MES',
    startDate: '2026-01-01',
    dueDate: '2026-09-01',
    description: 'Requalify line 3 after the MES upgrade.',
    phases: [
      { _id: 'p1', name: 'Assess' },
      { _id: 'p2', name: 'Execute' },
    ],
    ...overrides,
  };
}

function sampleTasks() {
  return [
    { title: 'Draft protocol', status: 'done', phaseId: 'p1', assigneeName: 'Asha Rao', ccNo: 'T-1', priority: 'medium', ccTcd: PAST },
    { title: 'Run IQ', status: 'in_progress', phaseId: 'p2', assigneeName: 'Ravi Kumar', ccNo: 'T-2', priority: 'high', ccTcd: FUTURE },
    { title: 'Fix deviation', status: 'blocked', phaseId: 'p2', assigneeName: 'Ravi Kumar', ccNo: 'T-3', priority: 'critical', ccTcd: FUTURE },
    { title: 'Legacy cleanup', status: 'todo', phaseId: 'gone', assigneeName: '', ccNo: '', priority: 'low', ccTcd: PAST },
  ];
}

/** Flatten every non-empty cell of a worksheet into one searchable string. */
function sheetText(ws: ExcelJS.Worksheet): string {
  const parts: string[] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (c) => {
      const v = c.value;
      if (v == null) return;
      parts.push(typeof v === 'object' ? JSON.stringify(v) : String(v));
    });
  });
  return parts.join(' | ');
}

describe('refDisplay — the live reference the whole app reads by', () => {
  it('shows the picked label + change-control number', () => {
    assert.equal(refDisplay(sampleProject()), 'CC# CC-2025-042');
  });
  it('drops the label when none is set, showing the bare number', () => {
    assert.equal(refDisplay(sampleProject({ refLabel: '' })), 'CC-2025-042');
  });
  it('falls back to the system code when no ccNo has been set', () => {
    assert.equal(refDisplay(sampleProject({ ccNo: '', refLabel: '' })), 'SOP-2026-0004');
  });
});

describe('exportFilename — matches the reference the user sees', () => {
  it('uses the live ccNo, sanitized, with the date', () => {
    const name = exportFilename(sampleProject(), new Date('2026-07-02T00:00:00Z'));
    assert.equal(name, 'Pragati_CC-2025-042_2026-07-02.xlsx');
  });
  it('falls back to the system code when no ccNo', () => {
    const name = exportFilename(sampleProject({ ccNo: '' }), new Date('2026-07-02T00:00:00Z'));
    assert.equal(name, 'Pragati_SOP-2026-0004_2026-07-02.xlsx');
  });
});

describe('safeCellValue — CSV/formula-injection guard (CWE-1236)', () => {
  for (const bad of ['=cmd()', '+1+1', '-2', '@SUM(A1)', '\tx', '\rx']) {
    it(`defangs a value starting with ${JSON.stringify(bad[0])}`, () => {
      assert.equal(safeCellValue(bad), `'${bad}`);
    });
  }
  it('passes ordinary strings and numbers through untouched', () => {
    assert.equal(safeCellValue('Draft protocol'), 'Draft protocol');
    assert.equal(safeCellValue(42), 42);
  });
});

describe('daysLate', () => {
  it('is positive for a past target', () => {
    assert.ok((daysLate('2000-01-01') ?? 0) > 1000);
  });
  it('is null when there is no target', () => {
    assert.equal(daysLate(null), null);
  });
});

describe('buildProjectWorkbook — minimal two-sheet export', () => {
  it('produces exactly a Summary and a Tasks sheet', () => {
    const wb = buildProjectWorkbook(sampleProject(), sampleTasks());
    assert.deepEqual(wb.worksheets.map((w) => w.name), ['Summary', 'Tasks']);
  });

  it('surfaces the live reference (label + ccNo), owner, and team on the Summary', () => {
    const wb = buildProjectWorkbook(sampleProject(), sampleTasks());
    const text = sheetText(wb.getWorksheet('Summary')!);
    assert.match(text, /CC# CC-2025-042/);
    assert.match(text, /Asha Rao/);
    assert.match(text, /MES/);
    // never the raw system code as the headline reference
    assert.doesNotMatch(text, /SOP-2026-0004/);
  });

  it('lists blocked and overdue work under Needs attention', () => {
    const text = sheetText(buildProjectWorkbook(sampleProject(), sampleTasks()).getWorksheet('Summary')!);
    assert.match(text, /NEEDS ATTENTION/);
    assert.match(text, /Fix deviation/); // blocked
    assert.match(text, /Legacy cleanup/); // overdue
  });

  it('keeps a task whose phase was removed under an Unphased group', () => {
    const text = sheetText(buildProjectWorkbook(sampleProject(), sampleTasks()).getWorksheet('Tasks')!);
    assert.match(text, /Unphased/i);
    assert.match(text, /Legacy cleanup/);
    assert.match(text, /Draft protocol/);
  });

  it('writes a buffer that re-reads as a valid workbook (merge layout is sound)', async () => {
    const wb = buildProjectWorkbook(sampleProject(), sampleTasks());
    const buf = await wb.xlsx.writeBuffer();
    assert.ok(buf.byteLength > 0);
    const reloaded = new ExcelJS.Workbook();
    await reloaded.xlsx.load(buf as any);
    assert.deepEqual(reloaded.worksheets.map((w) => w.name), ['Summary', 'Tasks']);
  });

  it('defangs a formula-injection task title in the written cells', () => {
    const tasks = [{ title: '=HYPERLINK("http://evil")', status: 'todo', phaseId: 'p1', assigneeName: 'X', ccNo: '', priority: 'low', ccTcd: FUTURE }];
    const text = sheetText(buildProjectWorkbook(sampleProject(), tasks).getWorksheet('Tasks')!);
    assert.match(text, /'=HYPERLINK/); // stored with a leading apostrophe, inert
  });

  it('handles an empty project without throwing', () => {
    const wb = buildProjectWorkbook(sampleProject({ phases: [], description: '' }), []);
    const text = sheetText(wb.getWorksheet('Tasks')!);
    assert.match(text, /No tasks yet/);
  });
});
