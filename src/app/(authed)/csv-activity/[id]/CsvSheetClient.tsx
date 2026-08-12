'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client/api';
import { useToast } from '@/components/ui';
import { useIsLead } from '@/components/CurrentUserContext';
import {
  STATUS_LABEL,
  STAGE_STATUSES,
  emptyStageCells,
  rowCompletion,
  type StageStatus,
  type StageDef,
} from '@/lib/csvStages';
import { ArrowLeft, Plus, Trash2, Download, Check, Loader2, X } from 'lucide-react';

interface StageCell {
  key: string;
  ref: string;
  date: string | null;
  status: StageStatus;
}
interface Row {
  id?: string;
  ref: string;
  name: string;
  note: string;
  stages: StageCell[];
  completion?: number;
}
interface Sheet {
  id: string;
  teamId: string;
  reference: string;
  reference2: string;
  title: string;
  stages: StageDef[];
  rows: Row[];
}

const STATUS_STYLE: Record<StageStatus, { bg: string; fg: string }> = {
  done: { bg: '#dcfce7', fg: '#15803d' },
  in_progress: { bg: '#dbeafe', fg: '#1d4ed8' },
  pending: { bg: '#fef3c7', fg: '#b45309' },
  na: { bg: '#f1f5f9', fg: '#64748b' },
};

/** A short, unique stage key derived from a label (fallback to a timestamp). */
function makeStageKey(existing: StageDef[]): string {
  let i = existing.length + 1;
  let key = `col${i}`;
  const taken = new Set(existing.map((s) => s.key));
  while (taken.has(key)) key = `col${++i}`;
  return key;
}

export default function CsvSheetClient({
  initialSheet,
  teamName = 'Team',
}: {
  initialSheet: Sheet;
  teamName?: string;
}) {
  const isLead = useIsLead();
  const router = useRouter();
  const { showToast, ToastEl } = useToast();
  const [sheet, setSheet] = useState<Sheet>(initialSheet);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editable = isLead;
  const stages = sheet.stages;

  const persist = useCallback(
    (next: Sheet) => {
      setSaveState('saving');
      api(`/csv-activity/${next.id}`, {
        method: 'PATCH',
        body: {
          reference: next.reference,
          reference2: next.reference2,
          title: next.title,
          stages: next.stages.map((s) => ({ key: s.key, label: s.label })),
          rows: next.rows.map((r) => ({
            ref: r.ref,
            name: r.name,
            note: r.note,
            stages: r.stages.map((s) => ({
              key: s.key,
              ref: s.ref,
              date: s.date,
              status: s.status,
            })),
          })),
        },
      })
        .then(() => {
          setSaveState('saved');
          setTimeout(() => setSaveState('idle'), 1500);
        })
        .catch((e: any) => {
          setSaveState('idle');
          showToast(e.message || 'Save failed — your last edit may not be stored.', 'err');
        });
    },
    [showToast],
  );

  // Debounced auto-save: edits flow into local state immediately; the sheet is
  // written ~700ms after the last keystroke so typing stays snappy.
  function scheduleSave(next: Sheet) {
    setSheet(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persist(next), 700);
  }

  useEffect(() => () => void (saveTimer.current && clearTimeout(saveTimer.current)), []);

  function updateRow(idx: number, patch: Partial<Row>) {
    const rows = sheet.rows.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    scheduleSave({ ...sheet, rows });
  }
  function updateStage(rowIdx: number, stageKey: string, patch: Partial<StageCell>) {
    const rows = sheet.rows.map((r, i) =>
      i === rowIdx
        ? { ...r, stages: r.stages.map((s) => (s.key === stageKey ? { ...s, ...patch } : s)) }
        : r,
    );
    scheduleSave({ ...sheet, rows });
  }
  function addRow() {
    scheduleSave({
      ...sheet,
      rows: [...sheet.rows, { ref: '', name: '', note: '', stages: emptyStageCells(stages) as StageCell[] }],
    });
  }
  function deleteRow(idx: number) {
    scheduleSave({ ...sheet, rows: sheet.rows.filter((_, i) => i !== idx) });
  }

  // ── Column (stage) configuration ──────────────────────────────────────────
  function renameStage(key: string, label: string) {
    scheduleSave({ ...sheet, stages: sheet.stages.map((s) => (s.key === key ? { ...s, label } : s)) });
  }
  function addStage() {
    const key = makeStageKey(sheet.stages);
    const nextStages = [...sheet.stages, { key, label: `Step ${sheet.stages.length + 1}` }];
    const rows = sheet.rows.map((r) => ({
      ...r,
      stages: [...r.stages, { key, ref: '', date: null, status: 'pending' as StageStatus }],
    }));
    scheduleSave({ ...sheet, stages: nextStages, rows });
  }
  function removeStage(key: string) {
    if (sheet.stages.length <= 1) {
      showToast('A tracker needs at least one column.', 'err');
      return;
    }
    if (!confirm('Remove this column from every row? This cannot be undone.')) return;
    const nextStages = sheet.stages.filter((s) => s.key !== key);
    const rows = sheet.rows.map((r) => ({ ...r, stages: r.stages.filter((s) => s.key !== key) }));
    scheduleSave({ ...sheet, stages: nextStages, rows });
  }

  function exportCsv() {
    const head = ['Sr. No', 'Reference', 'Name', 'Note'];
    for (const s of stages) head.push(`${s.label} Ref`, `${s.label} Date`, `${s.label} Status`);
    const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [head.map(esc).join(',')];
    sheet.rows.forEach((r, i) => {
      const cells = [String(i + 1), r.ref, r.name, r.note];
      for (const def of stages) {
        const s = r.stages.find((x) => x.key === def.key);
        cells.push(s?.ref || '', s?.date || '', s ? STATUS_LABEL[s.status] : '');
      }
      lines.push(cells.map(esc).join(','));
    });
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(sheet.reference || 'tracker').replace(/[^\w]+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function removeSheet() {
    if (!confirm(`Delete the entire sheet ${sheet.reference}? This cannot be undone.`)) return;
    try {
      await api(`/csv-activity/${sheet.id}`, { method: 'DELETE' });
      router.push(`/teams/${sheet.teamId}`);
    } catch (e: any) {
      showToast(e.message || 'Could not delete the sheet.', 'err');
    }
  }

  const overall =
    sheet.rows.length === 0
      ? 0
      : Math.round(sheet.rows.reduce((a, r) => a + rowCompletion(r.stages), 0) / sheet.rows.length);

  return (
    <div className="space-y-4 max-w-[1400px]">
      {ToastEl}
      <Link
        href={`/teams/${sheet.teamId}`}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600"
      >
        <ArrowLeft size={15} /> {teamName} · Quality tracking
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">{sheet.reference}</h1>
          <p className="text-sm text-slate-500 dark:text-white/40 mt-1">
            {sheet.reference2 ? `${sheet.reference2} · ` : ''}
            {sheet.rows.length} item{sheet.rows.length === 1 ? '' : 's'} · {overall}% complete
            {sheet.title ? ` · ${sheet.title}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-slate-400 w-16 text-right">
            {saveState === 'saving' && (
              <span className="inline-flex items-center gap-1">
                <Loader2 size={12} className="animate-spin" /> Saving
              </span>
            )}
            {saveState === 'saved' && (
              <span className="inline-flex items-center gap-1 text-green-600">
                <Check size={12} /> Saved
              </span>
            )}
          </span>
          <button onClick={exportCsv} className="btn-ghost gap-1.5">
            <Download size={14} /> Export CSV
          </button>
          {editable && (
            <button onClick={addRow} className="btn-primary gap-1.5">
              <Plus size={14} /> Add item
            </button>
          )}
        </div>
      </div>

      {!editable && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2">
          View only — ask a team lead to update status.
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
        <table className="text-sm border-collapse min-w-[1000px]">
          <thead>
            <tr className="bg-slate-50 dark:bg-white/[0.04] text-left">
              <th className="px-2 py-2 font-semibold text-slate-500 w-10 text-center">#</th>
              <th className="px-2 py-2 font-semibold text-slate-500 min-w-[160px] sticky left-0 bg-slate-50 dark:bg-[#0c1322]">
                Item
              </th>
              <th className="px-2 py-2 font-semibold text-slate-500 min-w-[90px]">Note</th>
              {stages.map((s) => (
                <th
                  key={s.key}
                  className="px-2 py-2 font-semibold text-slate-500 min-w-[150px] border-l border-slate-200 dark:border-white/10"
                >
                  {editable ? (
                    <div className="flex items-center gap-1">
                      <input
                        className="cell-input font-semibold !text-slate-600"
                        value={s.label}
                        placeholder="Column"
                        onChange={(e) => renameStage(s.key, e.target.value)}
                      />
                      <button
                        onClick={() => removeStage(s.key)}
                        aria-label="Remove column"
                        title="Remove column"
                        className="text-slate-300 hover:text-red-500 shrink-0"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    s.label
                  )}
                </th>
              ))}
              {editable && (
                <th className="px-2 py-2 w-10 border-l border-slate-200 dark:border-white/10 text-center">
                  <button
                    onClick={addStage}
                    aria-label="Add column"
                    title="Add column"
                    className="text-slate-400 hover:text-brand-600"
                  >
                    <Plus size={15} />
                  </button>
                </th>
              )}
              <th className="px-2 py-2 font-semibold text-slate-500 w-12 text-center">%</th>
              {editable && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.length === 0 && (
              <tr>
                <td
                  colSpan={3 + stages.length + (editable ? 3 : 1)}
                  className="px-3 py-8 text-center text-slate-400"
                >
                  No items yet. {editable ? 'Click "Add item" to begin.' : ''}
                </td>
              </tr>
            )}
            {sheet.rows.map((row, idx) => (
              <tr key={row.id || idx} className="border-t border-slate-100 dark:border-white/[0.06] align-top">
                <td className="px-2 py-2 text-center text-slate-400 tabular-nums">{idx + 1}</td>
                <td className="px-2 py-2 sticky left-0 bg-white dark:bg-[#0a0f1a]">
                  <input
                    className="cell-input font-medium"
                    placeholder="Reference"
                    value={row.ref}
                    disabled={!editable}
                    onChange={(e) => updateRow(idx, { ref: e.target.value })}
                  />
                  <input
                    className="cell-input text-slate-500"
                    placeholder="Name / description"
                    value={row.name}
                    disabled={!editable}
                    onChange={(e) => updateRow(idx, { name: e.target.value })}
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    className="cell-input"
                    placeholder="Note"
                    value={row.note}
                    disabled={!editable}
                    onChange={(e) => updateRow(idx, { note: e.target.value })}
                  />
                </td>
                {stages.map((def) => {
                  const cell = row.stages.find((s) => s.key === def.key) || {
                    key: def.key,
                    ref: '',
                    date: null,
                    status: 'pending' as StageStatus,
                  };
                  return (
                    <td
                      key={def.key}
                      className="px-2 py-2 border-l border-slate-100 dark:border-white/[0.06] space-y-1"
                    >
                      <input
                        className="cell-input text-xs"
                        placeholder="Ref"
                        value={cell.ref}
                        disabled={!editable}
                        onChange={(e) => updateStage(idx, def.key, { ref: e.target.value })}
                      />
                      <input
                        type="date"
                        className="cell-input text-xs"
                        value={cell.date || ''}
                        disabled={!editable}
                        onChange={(e) => updateStage(idx, def.key, { date: e.target.value || null })}
                      />
                      <select
                        className="cell-input text-xs font-semibold rounded"
                        value={cell.status}
                        disabled={!editable}
                        style={{ background: STATUS_STYLE[cell.status].bg, color: STATUS_STYLE[cell.status].fg }}
                        onChange={(e) => updateStage(idx, def.key, { status: e.target.value as StageStatus })}
                      >
                        {STAGE_STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {STATUS_LABEL[st]}
                          </option>
                        ))}
                      </select>
                    </td>
                  );
                })}
                {editable && <td className="border-l border-slate-100 dark:border-white/[0.06]" />}
                <td className="px-2 py-2 text-center tabular-nums text-slate-500 font-semibold">
                  {rowCompletion(row.stages)}%
                </td>
                {editable && (
                  <td className="px-1 py-2 text-center">
                    <button
                      onClick={() => deleteRow(idx)}
                      aria-label="Delete item"
                      className="text-slate-300 hover:text-red-500"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editable && (
        <div className="flex justify-between items-center pt-2">
          <button onClick={addRow} className="btn-ghost gap-1.5">
            <Plus size={14} /> Add item
          </button>
          <button onClick={removeSheet} className="text-xs text-red-500 hover:underline">
            Delete sheet
          </button>
        </div>
      )}

      <style>{`
        .cell-input {
          width: 100%;
          padding: 3px 6px;
          border: 1px solid transparent;
          border-radius: 5px;
          background: transparent;
          outline: none;
          font-size: 12px;
        }
        .cell-input:hover:not(:disabled) { border-color: #e2e8f0; }
        .cell-input:focus { border-color: #3b82f6; background: #fff; }
        .cell-input:disabled { cursor: default; }
      `}</style>
    </div>
  );
}
