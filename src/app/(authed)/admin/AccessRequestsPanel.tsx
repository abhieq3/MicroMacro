'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';
import { suggestedUsername } from '@/lib/accessRequest';
import { Inbox, Check, X, Copy } from 'lucide-react';

type Row = {
  id: string;
  name: string;
  email: string;
  organisation: string;
  title: string;
  note: string;
  status: 'pending' | 'approved' | 'dismissed';
  createdAt?: string;
  provisionedUsername?: string;
  provisionedTeamName?: string;
};

type Issued = {
  name: string;
  username: string;
  tempPassword: string;
  isDefault: boolean;
  teamName: string;
};

type TeamOpt = { id: string; name: string };

/**
 * Admin inbox for public access requests. Approve creates the contributor
 * (username + employee ID + one-time password) and puts them on a team
 * so they land on a board, not an empty "ask your lead" card.
 */
export function AccessRequestsPanel() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [teams, setTeams] = useState<TeamOpt[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [issued, setIssued] = useState<Issued | null>(null);

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
    api<TeamOpt[]>('/teams')
      .then((list) => setTeams((list || []).map((t) => ({ id: t.id, name: t.name }))))
      .catch(() => setTeams([]));
  }, []);

  useEffect(() => {
    if (approvingId && !teamId && teams[0]) setTeamId(teams[0].id);
  }, [approvingId, teamId, teams]);

  function startApprove(r: Row) {
    setErr('');
    setApprovingId(r.id);
    setUsername(suggestedUsername(r.email));
    setEmployeeId('');
    setTeamId(teams[0]?.id || '');
  }

  async function dismiss(id: string) {
    setBusy(id);
    setErr('');
    try {
      const updated = await api<Row>(`/access-requests/${id}`, {
        method: 'PATCH',
        body: { status: 'dismissed' },
      });
      setRows((prev) => (prev || []).map((r) => (r.id === id ? { ...r, ...updated } : r)));
      if (approvingId === id) setApprovingId(null);
    } catch (e: any) {
      setErr(e.message || 'Could not update that request.');
    } finally {
      setBusy(null);
    }
  }

  async function confirmApprove(r: Row) {
    if (!username.trim() || !employeeId.trim()) return;
    setBusy(r.id);
    setErr('');
    try {
      const updated = await api<
        Row & { tempPassword?: string; isDefault?: boolean; username?: string; teamName?: string }
      >(`/access-requests/${r.id}`, {
        method: 'PATCH',
        body: {
          status: 'approved',
          username: username.trim(),
          employeeId: employeeId.trim(),
          ...(teamId ? { teamId } : {}),
        },
      });
      setRows((prev) => (prev || []).map((row) => (row.id === r.id ? { ...row, ...updated } : row)));
      setApprovingId(null);
      if (updated.tempPassword) {
        setIssued({
          name: r.name,
          username: updated.username || updated.provisionedUsername || username.trim(),
          tempPassword: updated.tempPassword,
          isDefault: !!updated.isDefault,
          teamName: updated.teamName || updated.provisionedTeamName || '',
        });
      }
    } catch (e: any) {
      setErr(e.message || 'Could not create that account.');
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

      {issued && <IssuedCard issued={issued} onDismiss={() => setIssued(null)} />}

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
                {approvingId !== r.id && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={busy === r.id}
                      onClick={() => startApprove(r)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 px-2.5 py-1.5 rounded-lg disabled:opacity-50"
                    >
                      <Check size={12} /> Approve
                    </button>
                    <button
                      type="button"
                      disabled={busy === r.id}
                      onClick={() => dismiss(r.id)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 bg-slate-50 hover:bg-slate-100 dark:bg-white/5 dark:text-white/50 px-2.5 py-1.5 rounded-lg disabled:opacity-50"
                    >
                      <X size={12} /> Dismiss
                    </button>
                  </div>
                )}
              </div>

              {approvingId === r.id && (
                <form
                  className="mt-3 rounded-xl border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-500/[0.06] p-3 space-y-2.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void confirmApprove(r);
                  }}
                >
                  <p className="text-[11px] text-emerald-800/80 dark:text-emerald-200/70 leading-snug">
                    Creates their account and puts them on a team. You get a one-time password to share.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        Username
                      </span>
                      <input
                        className="input mt-0.5 font-mono text-sm"
                        required
                        minLength={3}
                        maxLength={30}
                        autoCapitalize="none"
                        autoComplete="off"
                        spellCheck={false}
                        value={username}
                        onChange={(e) => setUsername(e.target.value.toLowerCase())}
                      />
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        Employee ID
                      </span>
                      <input
                        className="input mt-0.5 font-mono text-sm"
                        required
                        maxLength={40}
                        autoComplete="off"
                        autoFocus
                        value={employeeId}
                        onChange={(e) => setEmployeeId(e.target.value)}
                      />
                    </label>
                  </div>
                  <label className="block">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      Team
                    </span>
                    <select
                      className="input mt-0.5 text-sm"
                      value={teamId}
                      onChange={(e) => setTeamId(e.target.value)}
                    >
                      {teams.length === 0 && <option value="">No team yet — create one first</option>}
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={busy === r.id || !username.trim() || !employeeId.trim()}
                      className="inline-flex items-center gap-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg disabled:opacity-50"
                    >
                      {busy === r.id ? 'Creating…' : 'Create account'}
                    </button>
                    <button
                      type="button"
                      disabled={busy === r.id}
                      onClick={() => setApprovingId(null)}
                      className="text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-white/50"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
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
                {r.name}
                {r.provisionedUsername ? ` · @${r.provisionedUsername}` : ` · ${r.email}`}
                {r.provisionedTeamName ? ` · ${r.provisionedTeamName}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {pending.length > 0 && (
        <div className="px-5 py-3 border-t border-slate-100 dark:border-white/10 text-[11px] text-slate-400 dark:text-white/40 leading-snug">
          Approve creates the account and puts them on the team. They set their own password on first
          sign-in.
        </div>
      )}
    </div>
  );
}

function IssuedCard({ issued, onDismiss }: { issued: Issued; onDismiss: () => void }) {
  return (
    <div className="mx-4 my-3 rounded-xl border border-emerald-200 dark:border-emerald-500/25 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-bold text-emerald-900 dark:text-emerald-200">{issued.name} is in</div>
          <p className="text-[11px] text-emerald-800/80 dark:text-emerald-200/70 mt-0.5 leading-snug">
            Share this once. Shown only here — they set their own password on first sign-in
            {issued.teamName ? ` · on ${issued.teamName}` : ''}.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-emerald-700/60 hover:text-emerald-900 dark:text-emerald-200/50"
          aria-label="Dismiss credentials"
        >
          <X size={14} />
        </button>
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <CopyField label="Username" value={issued.username} />
        <CopyField
          label={issued.isDefault ? 'Default password' : 'Temporary password'}
          value={issued.tempPassword}
        />
      </div>
    </div>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-lg bg-white/80 dark:bg-black/20 border border-emerald-200/70 dark:border-emerald-500/20 px-2.5 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-700/70 dark:text-emerald-300/70">
        {label}
      </div>
      <div className="flex items-center gap-1 mt-0.5">
        <span className="text-xs font-mono font-semibold text-slate-800 dark:text-white truncate flex-1">
          {value}
        </span>
        <button
          type="button"
          title="Copy"
          onClick={() => {
            void navigator.clipboard.writeText(value).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            });
          }}
          className="text-emerald-700 hover:text-emerald-900 dark:text-emerald-300 shrink-0"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
      </div>
    </div>
  );
}
