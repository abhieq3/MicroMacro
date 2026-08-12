'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import { Inbox, Check, X } from 'lucide-react';

type Row = {
  id: string;
  name: string;
  email: string;
  organisation: string;
  title: string;
  note: string;
  status: 'pending' | 'approved' | 'dismissed';
  createdAt?: string;
};

/**
 * Admin inbox for public access requests. Approve / dismiss only marks the
 * row — the person is still added on People (username + employee ID), same
 * as every other account. This panel exists so a request is never lost in
 * email.
 */
export function AccessRequestsPanel() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');

  async function load() {
    try {
      const data = await api<{ requests: Row[] }>('/access-requests');
      setRows(data.requests || []);
    } catch (e: any) {
      setErr(e.message || 'Could not load requests.');
      setRows([]);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function review(id: string, status: 'approved' | 'dismissed') {
    setBusy(id);
    setErr('');
    try {
      const updated = await api<Row>(`/access-requests/${id}`, { method: 'PATCH', body: { status } });
      setRows((prev) => (prev || []).map((r) => (r.id === id ? { ...r, ...updated } : r)));
    } catch (e: any) {
      setErr(e.message || 'Could not update that request.');
    } finally {
      setBusy(null);
    }
  }

  const pending = (rows || []).filter((r) => r.status === 'pending');
  const recent = (rows || []).filter((r) => r.status !== 'pending').slice(0, 6);

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100 dark:border-white/10 flex items-center gap-2">
        <Inbox size={15} className="text-blue-500" />
        <h2 className="text-sm font-bold text-slate-800 dark:text-white flex-1">Access requests</h2>
        {pending.length > 0 && (
          <span className="text-[11px] font-bold tabular-nums text-blue-700 bg-blue-50 dark:bg-blue-500/15 dark:text-blue-200 px-2 py-0.5 rounded-full">
            {pending.length} pending
          </span>
        )}
      </div>

      {err && <div className="px-5 py-2 text-xs text-red-600 bg-red-50 dark:bg-red-500/10">{err}</div>}

      {rows === null ? (
        <div className="px-5 py-8 text-center text-sm text-slate-400">Loading…</div>
      ) : pending.length === 0 && recent.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-slate-400 dark:text-white/40">
          No requests yet. Strangers leave one at /request-access.
        </div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-white/5">
          {pending.map((r) => (
            <div key={r.id} className="px-5 py-3.5">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-800 dark:text-white truncate">
                    {r.name}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-white/50 truncate">{r.email}</div>
                  {(r.organisation || r.title) && (
                    <div className="text-xs text-slate-400 dark:text-white/40 mt-0.5 truncate">
                      {[r.title, r.organisation].filter(Boolean).join(' · ')}
                    </div>
                  )}
                  {r.note && (
                    <p className="text-xs text-slate-600 dark:text-white/60 mt-1.5 leading-snug line-clamp-3">
                      {r.note}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => review(r.id, 'approved')}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 px-2.5 py-1.5 rounded-lg disabled:opacity-50"
                  >
                    <Check size={12} /> Approve
                  </button>
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => review(r.id, 'dismissed')}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 bg-slate-50 hover:bg-slate-100 dark:bg-white/5 dark:text-white/50 px-2.5 py-1.5 rounded-lg disabled:opacity-50"
                  >
                    <X size={12} /> Dismiss
                  </button>
                </div>
              </div>
            </div>
          ))}
          {recent.map((r) => (
            <div key={r.id} className="px-5 py-2.5 flex items-center gap-2">
              <span
                className={`text-[10px] font-bold uppercase tracking-wider ${
                  r.status === 'approved' ? 'text-emerald-600' : 'text-slate-400'
                }`}
              >
                {r.status}
              </span>
              <span className="text-xs text-slate-600 dark:text-white/60 truncate">
                {r.name} · {r.email}
              </span>
            </div>
          ))}
        </div>
      )}

      {pending.length > 0 && (
        <div className="px-5 py-3 border-t border-slate-100 dark:border-white/10 text-[11px] text-slate-400 dark:text-white/40 leading-snug">
          Approve marks it handled. Add them on{' '}
          <Link href="/people" className="text-blue-600 dark:text-blue-300 font-semibold hover:underline">
            People
          </Link>{' '}
          with a username and employee ID.
        </div>
      )}
    </div>
  );
}
