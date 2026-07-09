'use client';
import { useState, useEffect, useRef } from 'react';
import { ModalPortal } from '@/components/ModalPortal';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import { RoleBadge, formatDateTime, formatFullDate } from '@/components/ui';
import { UserAvatar } from '@/components/AvatarRegistry';
import dynamic from 'next/dynamic';
const ActivityGraph = dynamic(() => import('@/components/ActivityGraph').then((m) => m.ActivityGraph), {
  ssr: false,
  loading: () => <div className="h-40 skeleton rounded-xl" />,
});
import {
  UserPlus,
  Upload,
  Copy,
  Check,
  X,
  Shield,
  User,
  Users,
  AlertTriangle,
  Pencil,
  Trash2,
  BarChart3,
  Search,
  UserX,
  RotateCcw,
  ScrollText,
  CheckSquare,
  Square,
  MinusSquare,
  LogOut,
} from 'lucide-react';

/* ── Activity peek modal — team leaders click a teammate to see how they're
   tracking: contribution graph, streak and badges (read-only, no private
   project data is exposed). ─────────────────────────────────────────────── */
function ActivityModal({ user, onClose }: { user: any; onClose: () => void }) {
  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 overlay-in"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 w-full max-w-[820px] max-h-[calc(100vh-2rem)] overflow-y-auto modal-in"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start gap-3 mb-5">
            <UserAvatar userId={user.id} name={user.name} size={44} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-900 truncate">{user.name}</h3>
                <RoleBadge role={user.role} />
              </div>
              <div className="text-xs text-slate-400 mt-0.5">Performance overview</div>
            </div>
            <button onClick={onClose} className="text-slate-300 hover:text-slate-500 ml-2 mt-0.5">
              <X size={18} />
            </button>
          </div>
          <ActivityGraph userId={user.id} name={user.name} />
        </div>
      </div>
    </ModalPortal>
  );
}

/* ── role display helpers ─────────────────────────────────────────────── */
const ROLE_COLOR: Record<string, string> = {
  admin: 'bg-amber-50 text-amber-800 border-amber-200',
  pm: 'bg-blue-50  text-blue-700  border-blue-200',
  employee: 'bg-slate-100 text-slate-600 border-slate-200',
};

/** The login handle we show: the username, or — for legacy accounts that
 *  predate usernames — the part of the email before the "@". Never the
 *  full email. */
function handleOf(u: { username?: string | null; email?: string | null }): string {
  if (u.username) return u.username;
  return (u.email || '').split('@')[0] || '—';
}

/* ── Copy-to-clipboard button ─────────────────────────────────────────── */
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button onClick={copy} className="ml-2 text-slate-400 hover:text-blue-600 transition-colors" title="Copy">
      {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
    </button>
  );
}

/* ── Credentials reveal modal (shown after an admin password reset) ─────── */
function CredentialsModal({
  name,
  email,
  tempPassword,
  isDefault = false,
  title = 'Temporary password',
  onClose,
}: {
  name: string;
  email: string;
  tempPassword: string;
  isDefault?: boolean;
  title?: string;
  onClose: () => void;
}) {
  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 overlay-in"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 w-full max-w-modal-sm max-h-[calc(100vh-2rem)] overflow-y-auto modal-in"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between mb-5">
            <div>
              <div className="text-base font-bold text-slate-900">{title}</div>
              <div className="text-sm text-slate-400 mt-0.5">Share this once with {name}.</div>
            </div>
            <button onClick={onClose} className="text-slate-300 hover:text-slate-500 ml-4 mt-0.5">
              <X size={18} />
            </button>
          </div>

          <div className="space-y-3 mb-5">
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Username
              </div>
              <div className="flex items-center">
                <span className="text-sm font-mono font-semibold text-slate-800 flex-1">{email}</span>
                <CopyBtn text={email} />
              </div>
            </div>
            <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-1">
                {isDefault ? 'Default password' : 'Temporary password'}
              </div>
              <div className="flex items-center">
                <span className="text-sm font-mono font-semibold text-blue-800 flex-1 tracking-wide">
                  {tempPassword}
                </span>
                <CopyBtn text={tempPassword} />
              </div>
              {isDefault && (
                <div className="text-[11px] text-blue-600/80 mt-1.5 leading-snug">
                  The standard default — first name + “@” + employee ID.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800 leading-snug mb-5">
            {isDefault
              ? `${name} will be prompted to set their own password on first login.`
              : `This password is shown only once. ${name} will be prompted to set their own on first login.`}
          </div>

          <button onClick={onClose} className="btn-primary w-full justify-center">
            Done
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}

/* ── Add member modal — role is always IC, no picker needed ───────────── */
// Title-case a corporate username into a display name:
//   priya.sharma → "Priya Sharma",  p_kumar → "P Kumar"
function deriveName(username: string): string {
  return username
    .split(/[._]+/)
    .filter(Boolean)
    .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
    .join(' ');
}

function AddMemberModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (payload: {
    name: string;
    username: string;
    tempPassword: string;
    isDefault: boolean;
  }) => void;
}) {
  // Corporate username, employee ID, and a real work email (used for the daily
  // task-due digest). The display name auto-derives from the username (editable
  // if it looks wrong). Server returns a one-time temp password to share once.
  const [username, setUsername] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [nameEdited, setNameEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  function onUsernameChange(value: string) {
    const v = value.toLowerCase();
    setUsername(v);
    if (!nameEdited) setName(deriveName(v));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setSaving(true);
    try {
      const res = await api<{
        user: any;
        tempPassword: string;
        isDefault: boolean;
      }>('/users', {
        method: 'POST',
        body: { name: name.trim() || deriveName(username), username, employeeId, notifyEmail: email.trim() },
      });
      onCreated({
        name: res.user.name,
        username: res.user.username || username,
        tempPassword: res.tempPassword,
        isDefault: !!res.isDefault,
      });
    } catch (e: any) {
      setErr(e.message || 'Failed to add member.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 overlay-in"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 w-full max-w-modal-sm max-h-[calc(100vh-2rem)] overflow-y-auto modal-in"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between mb-5">
            <div>
              <div className="text-base font-bold text-slate-900">Add team member</div>
              <div className="text-sm text-slate-400 mt-0.5">
                Enter their company username and employee ID. You&apos;ll get a one-time temporary password to
                share — they must set their own on first sign-in.
              </div>
            </div>
            <button onClick={onClose} className="text-slate-300 hover:text-slate-500 ml-4 mt-0.5">
              <X size={18} />
            </button>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label">Corporate username</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-mono pointer-events-none">
                  @
                </span>
                <input
                  className="input pl-7 font-mono text-sm"
                  placeholder="priya.sharma"
                  required
                  minLength={3}
                  maxLength={30}
                  pattern="[a-z][a-z0-9_.]{1,28}[a-z0-9_]"
                  autoCapitalize="none"
                  autoComplete="off"
                  spellCheck={false}
                  value={username}
                  onChange={(e) => onUsernameChange(e.target.value)}
                />
              </div>
              <div className="text-[11px] text-slate-400 mt-1 leading-snug">
                The part of their work email before the
                <span className="font-mono px-1">@</span>— e.g.{' '}
                <span className="font-mono">priya.sharma</span> for{' '}
                <span className="font-mono">priya.sharma@company.com</span>.
              </div>
            </div>

            <div>
              <label className="label">Employee ID</label>
              <input
                className="input font-mono text-sm"
                placeholder="e.g. 100245"
                required
                maxLength={40}
                autoComplete="off"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
              />
            </div>

            <div>
              <label className="label">Work email</label>
              <input
                className="input text-sm"
                type="email"
                placeholder="priya.sharma@company.com"
                required
                maxLength={200}
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <div className="text-[11px] text-slate-400 mt-1 leading-snug">
                Where their daily “tasks due today” email is sent. They can turn that email on or off in their
                profile.
              </div>
            </div>

            <div>
              <label className="label">
                Display name <span className="text-slate-300 font-normal normal-case">(auto-filled)</span>
              </label>
              <input
                className="input"
                placeholder="Priya Sharma"
                required
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameEdited(true);
                }}
              />
            </div>

            {err && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                {err}
              </div>
            )}

            <button type="submit" disabled={saving} className="btn-primary w-full justify-center">
              {saving ? 'Adding…' : 'Add member'}
            </button>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}

/* ── Bulk import modal ─────────────────────────────────────────────────────
   Paste a roster (one person per line: username, employee ID, name) and
   create contributor accounts in one shot. Built for onboarding a big team
   without adding people one at a time. */
interface ParsedRow {
  username: string;
  employeeId: string;
  name: string;
  notifyEmail: string;
  bad?: string;
}

function parseRoster(text: string): ParsedRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      // comma- or tab-separated (so a paste straight from Excel works)
      const parts = line.split(/[,\t]/).map((p) => p.trim());
      const username = (parts[0] || '').toLowerCase();
      const employeeId = parts[1] || '';
      const name = parts[2] || '';
      const notifyEmail = (parts[3] || '').toLowerCase();
      let bad: string | undefined;
      if (!/^[a-z][a-z0-9_.]{1,28}[a-z0-9_]$/.test(username)) bad = 'invalid username';
      else if (!employeeId) bad = 'missing employee ID';
      else if (notifyEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notifyEmail)) bad = 'invalid email';
      return { username, employeeId, name, notifyEmail, bad };
    });
}

function ImportMembersModal({ onClose, onDone }: { onClose: () => void; onDone: (n: number) => void }) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<{
    createdCount: number;
    skippedCount: number;
    skipped: Array<{ username: string; reason: string }>;
    created: Array<{ username: string; name: string; tempPassword: string; isDefault: boolean }>;
  } | null>(null);

  const rows = parseRoster(text);
  const validRows = rows.filter((r) => !r.bad);
  const badRows = rows.filter((r) => r.bad);

  function copyAllCredentials() {
    if (!result?.created?.length) return;
    const lines = result.created.map((c) => `${c.username}\t${c.tempPassword}`);
    void navigator.clipboard.writeText(lines.join('\n'));
  }

  async function submit() {
    if (validRows.length === 0) {
      setErr('Add at least one valid row.');
      return;
    }
    setErr('');
    setSaving(true);
    try {
      const res = await api<{
        createdCount: number;
        skippedCount: number;
        skipped: any[];
        created: Array<{ username: string; name: string; tempPassword: string; isDefault: boolean }>;
      }>('/users/bulk', {
        method: 'POST',
        body: {
          rows: validRows.map((r) => ({
            username: r.username,
            employeeId: r.employeeId,
            name: r.name || undefined,
            notifyEmail: r.notifyEmail || undefined,
          })),
        },
      });
      setResult(res);
      onDone(res.createdCount);
    } catch (e: any) {
      setErr(e.message || 'Import failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 overlay-in"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 w-full max-w-modal max-h-[calc(100vh-2rem)] overflow-y-auto modal-in"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-base font-bold text-slate-900">Import contributors</div>
              <div className="text-sm text-slate-400 mt-0.5">
                One person per line: <span className="font-mono">username, employee ID, name, email</span>{' '}
                (name &amp; email optional). Up to 100 at a time.
              </div>
            </div>
            <button onClick={onClose} className="text-slate-300 hover:text-slate-500 ml-4 mt-0.5">
              <X size={18} />
            </button>
          </div>

          {result ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                <strong>{result.createdCount}</strong> contributor{result.createdCount === 1 ? '' : 's'}{' '}
                added.
                {result.skippedCount > 0 && <> {result.skippedCount} skipped.</>}
              </div>
              {result.created?.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-slate-600">
                      One-time passwords (shown once — share securely)
                    </div>
                    <button
                      type="button"
                      onClick={copyAllCredentials}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                    >
                      Copy all
                    </button>
                  </div>
                  <div className="text-xs max-h-48 overflow-auto border border-blue-100 bg-blue-50/50 rounded-lg p-3 space-y-1.5">
                    {result.created.map((c) => (
                      <div key={c.username} className="flex gap-3 font-mono">
                        <span className="text-slate-600 shrink-0">@{c.username}</span>
                        <span className="text-blue-800 font-semibold">{c.tempPassword}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
                    Each person must set their own password on first sign-in. Do not reuse these temps.
                  </p>
                </div>
              )}
              {result.skipped.length > 0 && (
                <div className="text-xs text-slate-500 max-h-40 overflow-auto border border-slate-100 rounded-lg p-3">
                  {result.skipped.map((s) => (
                    <div key={s.username}>
                      <span className="font-mono">@{s.username}</span> — {s.reason}
                    </div>
                  ))}
                </div>
              )}
              <button onClick={onClose} className="btn-primary w-full justify-center">
                Done
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <textarea
                className="textarea text-sm font-mono min-h-[180px]"
                placeholder={
                  'priya.sharma, 100245, Priya Sharma, priya.sharma@company.com\narjun.mehta, 100312\nneha.r, 100410, Neha Rao, neha.rao@company.com'
                }
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setErr('');
                }}
                spellCheck={false}
                autoCapitalize="none"
              />

              {rows.length > 0 && (
                <div className="text-xs text-slate-500">
                  <span className="font-semibold text-emerald-600">{validRows.length} ready</span>
                  {badRows.length > 0 && (
                    <span className="text-rose-600 font-semibold"> · {badRows.length} need fixing</span>
                  )}
                  {badRows.slice(0, 4).map((r, i) => (
                    <div key={i} className="text-rose-500 mt-0.5">
                      line “{r.username || '(empty)'}” — {r.bad}
                    </div>
                  ))}
                </div>
              )}

              {err && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                  {err}
                </div>
              )}

              <button
                onClick={submit}
                disabled={saving || validRows.length === 0}
                className="btn-primary w-full justify-center"
              >
                {saving
                  ? 'Importing…'
                  : `Import ${validRows.length || ''} contributor${validRows.length === 1 ? '' : 's'}`}
              </button>
              <p className="text-[11px] text-slate-400 text-center">
                Each gets a one-time temporary password (shown after import). Nothing is emailed.
              </p>
            </div>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}

/* ── Role-change confirmation dialog ──────────────────────────────────── */
function RoleConfirmDialog({
  user,
  targetRole,
  onConfirm,
  onCancel,
  saving,
}: {
  user: any;
  targetRole: 'lead' | 'contributor';
  // The handler now needs the sign-off bundle — it can't fire a bare PATCH.
  onConfirm: (signoff: { password: string; reason: string }) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const promote = targetRole === 'lead';
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');

  function submit() {
    if (!password || reason.trim().length < 4) {
      setErr('Password and a 4+ character reason are required.');
      return;
    }
    setErr('');
    onConfirm({ password, reason: reason.trim() });
  }

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 overlay-in"
        onClick={onCancel}
      >
        <div
          className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 w-full max-w-modal-sm max-h-[calc(100vh-2rem)] overflow-y-auto modal-in"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${promote ? 'bg-blue-50' : 'bg-amber-50'}`}
              >
                {promote ? (
                  <Shield size={18} className="text-blue-600" />
                ) : (
                  <AlertTriangle size={18} className="text-amber-500" />
                )}
              </div>
              <div className="min-w-0">
                <div className="text-base font-black text-slate-900 tracking-tight">
                  {promote ? `Promote ${user.name} to Team Lead?` : `Make ${user.name} a Contributor?`}
                </div>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                  {promote
                    ? 'Team Leads can create and run teams, allocate projects, and assign tasks. Only promote trusted members.'
                    : 'They will go back to contributor access — read their team board and update their own tasks. Their work stays intact.'}
                </p>
              </div>
            </div>

            {/* Sign-off — 21 CFR Part 11 §11.200. The admin's password +
              justification become part of the immutable audit row. */}
            <div className="space-y-2.5">
              <div>
                <label className="label">Your password</label>
                <input
                  type="password"
                  className="input"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Confirm with your password"
                  autoFocus
                />
              </div>
              <div>
                <label className="label">Reason</label>
                <textarea
                  className="textarea"
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={
                    promote ? 'e.g. Moving to lead role per HR plan' : 'e.g. Stepping down from lead duties'
                  }
                />
              </div>
            </div>

            {err && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-2">
                {err}
              </div>
            )}

            <div className="flex gap-2 w-full pt-1">
              <button onClick={onCancel} className="btn-secondary flex-1 justify-center">
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={saving}
                className={`flex-1 justify-center btn ${promote ? 'btn-primary' : ''}`}
                style={
                  !promote
                    ? {
                        background: 'linear-gradient(135deg,#b45309,#d97706)',
                        color: '#fff',
                        boxShadow: '0 1px 3px rgba(180,83,9,0.3)',
                      }
                    : {}
                }
              >
                {saving ? '…' : promote ? 'Sign & promote' : 'Sign & make contributor'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

/* ── Edit user modal ──────────────────────────────────────────────────────
   Two-section form: identity (name / username / email / employee ID) and
   personal details. Identity changes require the admin to re-enter their own
   password and supply a justification — those touch downstream-reconciled
   fields and must leave a 21 CFR Part 11 §11.200 audit trail. */
function EditUserModal({ user, onClose, onSaved }: { user: any; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: user.name || '',
    username: user.username || '',
    email: user.email || '',
    employeeId: user.employeeId || '',
    notifyEmail: user.notifyEmail || '',
    title: user.title || '',
    department: user.department || '',
    organisation: user.organisation || '',
    location: user.location || '',
  });
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  // Identity fields are the ones that trigger the e-signature requirement.
  // We diff against the loaded user so a "save" with no identity edits skips
  // the sign-off ask entirely.
  const identityChanged =
    form.name !== (user.name || '') ||
    form.username !== (user.username || '') ||
    form.email !== (user.email || '') ||
    form.employeeId !== (user.employeeId || '');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (identityChanged && (!password || reason.trim().length < 4)) {
      setErr('Identity changes require your password and a 4+ character reason.');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const body: Record<string, any> = { ...form };
      if (identityChanged) {
        body.password = password;
        body.reason = reason.trim();
      }
      await api(`/users/${user.id}`, { method: 'PATCH', body });
      onSaved();
      onClose();
    } catch (e: any) {
      setErr(e.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 overlay-in"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 w-full max-w-modal max-h-[calc(100vh-2rem)] overflow-y-auto modal-in"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between mb-5">
            <div>
              <div className="text-base font-bold text-slate-900">Edit profile</div>
              <div className="text-sm text-slate-400 mt-0.5 font-mono">@{handleOf(user)}</div>
            </div>
            <button onClick={onClose} className="text-slate-300 hover:text-slate-500 ml-4 mt-0.5">
              <X size={18} />
            </button>
          </div>
          <form onSubmit={submit} className="space-y-4">
            {/* ── Identity (audited) ─────────────────────────────────────── */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                Identity
              </div>
              <div className="space-y-3">
                <div>
                  <label className="label">Full name</label>
                  <input
                    className="input"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label">Username</label>
                    <input
                      className="input font-mono text-sm"
                      pattern="[a-z0-9._-]+"
                      value={form.username}
                      placeholder="e.g. priya.s"
                      onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })}
                    />
                  </div>
                  <div>
                    <label className="label">Employee ID</label>
                    <input
                      className="input font-mono text-sm"
                      value={form.employeeId}
                      placeholder="e.g. EMP-1024"
                      onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="label">Email</label>
                  <input
                    type="email"
                    className="input"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 leading-snug">
                  Identity changes (name, username, email, employee ID) are signed and audited. The user will
                  be signed out across devices on save.
                </p>
              </div>
            </div>

            {/* ── Personal details (not audited as identity) ─────────────── */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                Personal details
              </div>
              <div className="space-y-3">
                <div>
                  <label className="label">Notification email</label>
                  <input
                    type="email"
                    className="input"
                    placeholder="priya.sharma@company.com"
                    value={form.notifyEmail}
                    onChange={(e) => setForm({ ...form, notifyEmail: e.target.value })}
                  />
                  <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                    Real address for the daily “tasks due today” email. Leave blank to disable email for this
                    person.
                  </p>
                </div>
                <div>
                  <label className="label">Job title</label>
                  <input
                    className="input"
                    placeholder="e.g. QA Validation Engineer"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label">Organisation</label>
                    <input
                      className="input"
                      placeholder="e.g. Pharma Division"
                      value={form.organisation}
                      onChange={(e) => setForm({ ...form, organisation: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">Department</label>
                    <input
                      className="input"
                      placeholder="e.g. Quality Assurance"
                      value={form.department}
                      onChange={(e) => setForm({ ...form, department: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="label">Location / site</label>
                  <input
                    className="input"
                    placeholder="e.g. Pune Plant 2"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* ── E-signature (only when identity changed) ──────────────── */}
            {identityChanged && (
              <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 space-y-2.5">
                <div className="text-[10px] font-bold uppercase tracking-widest text-blue-700">
                  Sign-off required
                </div>
                <div>
                  <label className="label">Your password</label>
                  <input
                    type="password"
                    className="input"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Confirm with your password"
                  />
                </div>
                <div>
                  <label className="label">Reason</label>
                  <textarea
                    className="textarea"
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Username corrected per HR ticket #4321"
                  />
                </div>
              </div>
            )}

            {err && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                {err}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}

/* ── Remove member confirm dialog ────────────────────────────────────── */
function RemoveConfirmDialog({
  user,
  onConfirm,
  onCancel,
  saving,
}: {
  user: any;
  onConfirm: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 overlay-in"
        onClick={onCancel}
      >
        <div
          className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 w-full max-w-modal-sm modal-in"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col items-center text-center gap-4">
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
              <Trash2 size={22} className="text-red-600" />
            </div>
            <div>
              <div className="text-base font-black text-slate-900">Remove {user.name}?</div>
              <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                Their account will be deleted and they will lose access immediately. All tasks assigned to
                them will be unassigned. This cannot be undone.
              </p>
            </div>
            <div className="flex gap-2 w-full">
              <button onClick={onCancel} className="btn-secondary flex-1 justify-center">
                Cancel
              </button>
              <button
                onClick={onConfirm}
                disabled={saving}
                className="flex-1 justify-center btn text-white"
                style={{
                  background: 'linear-gradient(135deg,#dc2626,#ef4444)',
                  boxShadow: '0 1px 3px rgba(220,38,38,0.3)',
                }}
              >
                {saving ? 'Removing…' : 'Remove member'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

/* ── Deactivate (professional removal with a record) dialog ───────────────
   Unlike a hard delete, deactivation keeps the account and all of the
   person's task history intact (ALCOA+ Attributable & Enduring). A reason
   is required so the audit trail records *why* — 21 CFR Part 11 §11.10(e).
   The account can be reactivated later, which also clears any lock. */
function DeactivateDialog({
  user,
  onConfirm,
  onCancel,
  saving,
}: {
  user: any;
  // Reason + admin password (e-signature). Server validates both.
  onConfirm: (data: { reason: string; password: string }) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 overlay-in"
        onClick={onCancel}
      >
        <div
          className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 w-full max-w-modal-sm max-h-[calc(100vh-2rem)] overflow-y-auto modal-in"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
                <UserX size={18} className="text-amber-600" />
              </div>
              <div className="min-w-0">
                <div className="text-base font-black text-slate-900 tracking-tight">
                  Deactivate {user.name}?
                </div>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                  They lose access immediately and disappear from assignee lists, but the account and all
                  their task history are preserved. You can reactivate it later. This is the recommended
                  alternative to permanent removal.
                </p>
              </div>
            </div>
            <div>
              <label className="label">
                Reason <span className="text-slate-300 font-normal normal-case">(audit trail)</span>
              </label>
              <textarea
                className="textarea text-sm"
                rows={2}
                placeholder="e.g. Left the organisation · role transfer · extended leave"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                autoFocus
              />
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-blue-700 mb-1.5">
                Sign-off
              </div>
              <label className="label">Your password</label>
              <input
                type="password"
                className="input"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Confirm with your password"
              />
            </div>
            <div className="flex gap-2 w-full">
              <button onClick={onCancel} className="btn-secondary flex-1 justify-center">
                Cancel
              </button>
              <button
                onClick={() => onConfirm({ reason: reason.trim(), password })}
                disabled={saving || !reason.trim() || !password}
                className="flex-1 justify-center btn text-white"
                style={{
                  background: 'linear-gradient(135deg,#b45309,#d97706)',
                  boxShadow: '0 1px 3px rgba(180,83,9,0.3)',
                }}
              >
                {saving ? 'Deactivating…' : 'Sign & deactivate'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

/* ── Bulk action dialog ───────────────────────────────────────────────────
   Multi-select deactivate / role-change. One e-signature (admin password +
   justification) authorises the whole batch — 21 CFR Part 11 §11.200 — and the
   server writes an individual audit row per affected user. Mirrors the single
   user flow's sign-off requirement so bulk never becomes a compliance bypass. */
type BulkAction = 'deactivate' | 'make_contributor' | 'promote_lead';
const BULK_META: Record<BulkAction, { verb: string; tone: string; bg: string; note: string }> = {
  deactivate: {
    verb: 'Deactivate',
    tone: 'text-amber-700',
    bg: 'linear-gradient(135deg,#b45309,#d97706)',
    note: 'They lose access immediately but their accounts and task history are preserved. Reactivate any time.',
  },
  make_contributor: {
    verb: 'Make contributor',
    tone: 'text-slate-700',
    bg: 'linear-gradient(135deg,#475569,#64748b)',
    note: 'Leads in the selection drop to contributor access. Their work stays intact.',
  },
  promote_lead: {
    verb: 'Promote to lead',
    tone: 'text-blue-700',
    bg: 'linear-gradient(135deg,#1d4ed8,#3b82f6)',
    note: 'Contributors in the selection gain lead access — create teams, allocate projects, assign tasks.',
  },
};

function BulkActionDialog({
  action,
  count,
  onConfirm,
  onCancel,
  saving,
}: {
  action: BulkAction;
  count: number;
  onConfirm: (data: { password: string; reason: string }) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const m = BULK_META[action];
  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 overlay-in"
        onClick={onCancel}
      >
        <div
          className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 w-full max-w-modal max-h-[calc(100vh-2rem)] overflow-y-auto modal-in"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col gap-4">
            <div>
              <div className="text-base font-black text-slate-900 tracking-tight">
                {m.verb} {count} {count === 1 ? 'person' : 'people'}?
              </div>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{m.note}</p>
            </div>
            <div>
              <label className="label">
                Reason{' '}
                <span className="text-slate-300 font-normal normal-case">
                  (audit trail · applied to each record)
                </span>
              </label>
              <textarea
                className="textarea text-sm"
                rows={2}
                placeholder="e.g. Quarterly access review · team restructure · offboarding cohort"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                autoFocus
              />
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-blue-700 mb-1.5">
                Sign-off
              </div>
              <label className="label">Your password</label>
              <input
                type="password"
                className="input"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Confirm with your password"
              />
            </div>
            <div className="flex gap-2 w-full">
              <button onClick={onCancel} className="btn-secondary flex-1 justify-center">
                Cancel
              </button>
              <button
                onClick={() => onConfirm({ password, reason: reason.trim() })}
                disabled={saving || reason.trim().length < 4 || !password}
                className="flex-1 justify-center btn text-white"
                style={{ background: m.bg }}
              >
                {saving ? 'Applying…' : `Sign & apply`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

/* ── Main page ────────────────────────────────────────────────────────── */
interface PeopleClientProps {
  initialUsers: any[];
  /** Total active contributors in the workspace (for "load more" + counts). */
  contribTotal?: number;
  /** Page size the server used for the first contributor batch. */
  contribPage?: number;
  me: any;
}

export default function PeopleClient({
  initialUsers,
  contribTotal = 0,
  contribPage = 150,
  me,
}: PeopleClientProps) {
  const [users, setUsers] = useState<any[]>(initialUsers);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [creds, setCreds] = useState<{
    name: string;
    email: string;
    tempPassword: string;
    isDefault?: boolean;
  } | null>(null);
  const [roleConfirm, setRoleConfirm] = useState<{ user: any; targetRole: 'lead' | 'contributor' } | null>(
    null,
  );
  const [roleErr, setRoleErr] = useState('');
  const [editUser, setEditUser] = useState<any | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState<any | null>(null);
  const [removing, setRemoving] = useState(false);
  const [activityUser, setActivityUser] = useState<any | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<any | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const router = useRouter();

  // Clicking a person opens their public profile (corporate-social style) —
  // the full /<username> page already carries their contribution graph, so it
  // supersedes the old inline activity peek. Legacy accounts that predate
  // usernames have no public URL, so for those we fall back to the lead/admin
  // inline modal. `canOpenPerson` drives the row's clickable/disabled state.
  function canOpenPerson(u: any): boolean {
    return !!u.username || isLeadOrAdmin;
  }
  function openPerson(u: any) {
    if (u.username) {
      router.push(`/${u.username}`);
      return;
    }
    if (isLeadOrAdmin) setActivityUser(u);
  }
  function personTitle(u: any): string | undefined {
    if (u.username) return `View ${u.name}'s profile`;
    return isLeadOrAdmin ? `View ${u.name}'s activity` : undefined;
  }

  // Background refresh after a mutation. The initial render uses the
  // server-provided list (which includes deactivated accounts), so no fetch
  // fires on mount. The refetch must also ask for inactive accounts —
  // /api/users hides them by default so they never leak into assignee lists.
  // When a search is active we refetch that query so the view stays consistent
  // with what the admin is looking at; otherwise we pull the full set.
  function load() {
    const sp = new URLSearchParams({ includeInactive: '1' });
    const term = queryRef.current.trim();
    if (term) sp.set('q', term);
    api<any[]>(`/users?${sp.toString()}`)
      .then(setUsers)
      .catch(() => {});
  }
  // Mirror the live query into a ref so load() (called from many handlers) can
  // read it without being recreated on every keystroke.
  const queryRef = useRef('');

  async function confirmRoleChange(signoff: { password: string; reason: string }) {
    if (!roleConfirm) return;
    setSaving(roleConfirm.user.id);
    setRoleErr('');
    try {
      await api(`/users/${roleConfirm.user.id}`, {
        method: 'PATCH',
        body: { role: roleConfirm.targetRole, password: signoff.password, reason: signoff.reason },
      });
      setRoleConfirm(null);
      load();
    } catch (e: any) {
      setRoleErr(e.message || 'Failed to update role.');
    } finally {
      setSaving(null);
    }
  }

  async function confirmRemove() {
    if (!removeConfirm) return;
    setRemoving(true);
    try {
      await api(`/users/${removeConfirm.id}`, { method: 'DELETE' });
      setRemoveConfirm(null);
      load();
    } catch (e: any) {
      setRoleErr(e.message || 'Failed to remove user.');
      setRemoveConfirm(null);
    } finally {
      setRemoving(false);
    }
  }

  // Clear a brute-force lock without rotating the password — useful
  // when the lock came from typos, not a forgotten password.
  async function unlockAccount(user: any) {
    if (
      !confirm(
        `Unlock ${user.name}'s account?\nTheir existing password still works; the failed-attempt counter is reset to zero.`,
      )
    )
      return;
    setSaving(user.id);
    try {
      await api(`/users/${user.id}/unlock`, { method: 'POST' });
      await load();
    } catch (e: any) {
      setRoleErr(e.message || 'Failed to unlock account.');
    } finally {
      setSaving(null);
    }
  }

  // Revoke every active session immediately — incident-response gesture.
  // The account stays usable (no lock, no password change); the user just
  // has to sign in again.
  async function forceLogout(user: any) {
    if (
      !confirm(
        `Sign ${user.name} out of all sessions?\nTheir password stays valid — they simply have to sign in again.`,
      )
    )
      return;
    setSaving(user.id);
    try {
      await api(`/users/${user.id}/force-logout`, { method: 'POST' });
      setRoleErr('');
    } catch (e: any) {
      setRoleErr(e.message || 'Failed to sign the user out.');
    } finally {
      setSaving(null);
    }
  }

  // Admin-driven password reset. Avoids the SMTP round-trip: server issues a
  // random temporary password (or legacy predictable if env-latched) and we
  // surface it once.
  async function resetPassword(user: any) {
    if (
      !confirm(
        `Reset ${user.name}'s password?\nA one-time temporary password will be shown once. They'll be forced to set their own on next sign-in.`,
      )
    )
      return;
    setSaving(user.id);
    try {
      const res = await api<{
        tempPassword: string;
        isDefault: boolean;
        user: { name: string; email: string; username?: string };
      }>(`/users/${user.id}/reset-password`, { method: 'POST' });
      // Surface the username if the account has one, else fall back to email
      // for legacy accounts that haven't been backfilled yet.
      setCreds({
        name: res.user.name,
        email: res.user.username || res.user.email,
        tempPassword: res.tempPassword,
        isDefault: res.isDefault,
      });
    } catch (e: any) {
      setRoleErr(e.message || 'Failed to reset password.');
    } finally {
      setSaving(null);
    }
  }

  // Deactivate — professional removal that keeps the record. A reason +
  // password sign-off are captured for the audit trail (21 CFR Part 11
  // §11.200).
  async function confirmDeactivate(data: { reason: string; password: string }) {
    if (!deactivateTarget) return;
    setDeactivating(true);
    setRoleErr('');
    try {
      await api(`/users/${deactivateTarget.id}`, {
        method: 'PATCH',
        body: {
          active: false,
          deactivationReason: data.reason,
          password: data.password,
          reason: data.reason,
        },
      });
      setDeactivateTarget(null);
      await load();
    } catch (e: any) {
      setRoleErr(e.message || 'Failed to deactivate account.');
      setDeactivateTarget(null);
    } finally {
      setDeactivating(false);
    }
  }

  // Reactivate — restores access and clears any brute-force lock in one go.
  async function reactivate(user: any) {
    if (
      !confirm(
        `Reactivate ${user.name}'s account?\nThey'll be able to sign in again, and any lock is cleared. They keep their existing password.`,
      )
    )
      return;
    setSaving(user.id);
    setRoleErr('');
    try {
      await api(`/users/${user.id}`, { method: 'PATCH', body: { active: true } });
      await load();
    } catch (e: any) {
      setRoleErr(e.message || 'Failed to reactivate account.');
    } finally {
      setSaving(null);
    }
  }

  function handleCreated(payload: {
    name: string;
    username: string;
    tempPassword: string;
    isDefault: boolean;
  }) {
    setShowAdd(false);
    setJustAdded(payload.name);
    setCreds({
      name: payload.name,
      email: payload.username,
      tempPassword: payload.tempPassword,
      isDefault: payload.isDefault,
    });
    load();
    // auto-dismiss the banner after a few seconds (creds modal stays until closed)
    setTimeout(() => setJustAdded(null), 4000);
  }

  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const matches = (u: any) =>
    !q ||
    (u.name || '').toLowerCase().includes(q) ||
    (u.username || '').toLowerCase().includes(q) ||
    (u.email || '').toLowerCase().includes(q) ||
    (u.employeeId || '').toLowerCase().includes(q);

  // ── Server-backed search & pagination ───────────────────────────────────
  // The first paint only carries one page of contributors. So that an admin
  // can still find ANYONE in a large workspace, a non-empty query hits the
  // server (regex across name/username/email/employeeId/title/dept/org), which
  // returns every match regardless of what's been paged in. Clearing the box
  // restores the original bounded first page (kept in a ref) — no unbounded
  // "fetch everyone" ever fires from typing.
  const initialRef = useRef<any[]>(initialUsers);
  useEffect(() => {
    queryRef.current = query;
  }, [query]);
  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setUsers(initialRef.current);
      return;
    }
    const t = setTimeout(() => {
      api<any[]>(`/users?includeInactive=1&q=${encodeURIComponent(term)}`)
        .then(setUsers)
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  async function loadMoreContributors() {
    const loaded = users.filter((u) => u.active !== false && u.role === 'contributor').length;
    setLoadingMore(true);
    try {
      const res = await api<{ items: any[] }>(
        `/users?role=contributor&limit=${contribPage}&offset=${loaded}`,
      );
      const incoming = res.items || [];
      setUsers((prev) => {
        const seen = new Set(prev.map((u) => u.id));
        return [...prev, ...incoming.filter((u) => !seen.has(u.id))];
      });
    } catch {
      /* keep what we have */
    } finally {
      setLoadingMore(false);
    }
  }

  // ── Bulk selection (contributors) ───────────────────────────────────────
  // Multi-select on the contributor list drives one signed batch action. We
  // track a Set of ids; the bulk bar appears when ≥1 is selected. Selecting is
  // scoped to contributors — the regulated bulk gestures (deactivate, role
  // change) only make sense there, and the admin/own row stay out of it.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function clearSelection() {
    setSelected(new Set());
  }

  async function confirmBulk(data: { password: string; reason: string }) {
    if (!bulkAction) return;
    setBulkSaving(true);
    setRoleErr('');
    try {
      const res = await api<{ updatedCount: number; skippedCount: number }>('/admin/users/bulk-action', {
        method: 'POST',
        body: { userIds: Array.from(selected), action: bulkAction, ...data },
      });
      setBulkAction(null);
      clearSelection();
      const n = res.updatedCount;
      setJustAdded(
        `${n} ${n === 1 ? 'account' : 'accounts'} updated${res.skippedCount ? ` · ${res.skippedCount} skipped` : ''}`,
      );
      setTimeout(() => setJustAdded(null), 4000);
      await load();
    } catch (e: any) {
      setRoleErr(e.message || 'Bulk action failed.');
    } finally {
      setBulkSaving(false);
    }
  }

  // Active accounts drive the Leads/Contributors sections; deactivated
  // accounts move to their own record section at the bottom.
  const liveUsers = users.filter((u) => u.active !== false);
  const pms = liveUsers.filter((u) => (u.role === 'lead' || u.role === 'admin') && matches(u));
  const ics = liveUsers.filter((u) => u.role === 'contributor' && matches(u));
  const deactivated = users.filter((u) => u.active === false && matches(u));
  const isLeadOrAdmin = me?.role === 'lead' || me?.role === 'admin';
  const isAdmin = me?.role === 'admin';

  // Workspace-wide totals (unfiltered) for the summary strip. Leads and
  // deactivated accounts are always loaded in full, so their counts are exact;
  // contributors use the server-wide total (the list itself may be paged).
  const leadCount = liveUsers.filter((u) => u.role === 'lead' || u.role === 'admin').length;
  const icCount = contribTotal || liveUsers.filter((u) => u.role === 'contributor').length;
  const totalPeople = leadCount + icCount;
  const deactivatedCount = users.filter((u) => u.active === false).length;

  return (
    <div className="space-y-6 max-w-3xl">
      {justAdded && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 fade-in-soft">
          <strong>{justAdded}</strong> added. They're now available to assign on your team's tasks.
        </div>
      )}
      {/* Modals */}
      {showAdd && <AddMemberModal onClose={() => setShowAdd(false)} onCreated={handleCreated} />}
      {showImport && (
        <ImportMembersModal
          onClose={() => setShowImport(false)}
          onDone={(n) => {
            if (n > 0) {
              setJustAdded(`${n} contributor${n === 1 ? '' : 's'}`);
              setTimeout(() => setJustAdded(null), 4000);
            }
            load();
          }}
        />
      )}
      {creds && <CredentialsModal {...creds} onClose={() => setCreds(null)} />}
      {editUser && <EditUserModal user={editUser} onClose={() => setEditUser(null)} onSaved={load} />}
      {activityUser && <ActivityModal user={activityUser} onClose={() => setActivityUser(null)} />}
      {removeConfirm && (
        <RemoveConfirmDialog
          user={removeConfirm}
          onConfirm={confirmRemove}
          onCancel={() => setRemoveConfirm(null)}
          saving={removing}
        />
      )}
      {deactivateTarget && (
        <DeactivateDialog
          user={deactivateTarget}
          onConfirm={confirmDeactivate}
          onCancel={() => setDeactivateTarget(null)}
          saving={deactivating}
        />
      )}
      {roleConfirm && (
        <RoleConfirmDialog
          user={roleConfirm.user}
          targetRole={roleConfirm.targetRole}
          onConfirm={confirmRoleChange}
          onCancel={() => {
            setRoleConfirm(null);
            setRoleErr('');
          }}
          saving={saving === roleConfirm.user.id}
        />
      )}
      {bulkAction && (
        <BulkActionDialog
          action={bulkAction}
          count={selected.size}
          onConfirm={confirmBulk}
          onCancel={() => setBulkAction(null)}
          saving={bulkSaving}
        />
      )}

      {/* Header */}
      <div className="pb-5 mb-1 border-b border-slate-100 dark:border-white/[0.06]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 page-icon-box bg-indigo-50 dark:bg-indigo-500/10 shrink-0">
              <Users size={19} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="page-title">People</h1>
              <p className="text-sm text-slate-500 dark:text-white/45 mt-1 leading-snug">
                Workspace user management — add people, promote contributors to leads, reset passwords, and
                unlock accounts.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 mt-0.5">
            <button onClick={() => setShowImport(true)} className="btn-secondary gap-2">
              <Upload size={14} /> Import
            </button>
            <button onClick={() => setShowAdd(true)} className="btn-primary gap-2">
              <UserPlus size={14} /> Add member
            </button>
          </div>
        </div>
      </div>

      {/* Role info banner */}
      <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
        <div className="flex items-start gap-3">
          <Shield size={16} className="text-blue-600 shrink-0 mt-0.5" />
          <div className="text-sm text-slate-600 leading-relaxed">
            <strong className="text-blue-700">Roles:</strong> <strong>Contributors</strong> read their team
            board and update their own tasks. <strong>Team Leads</strong> create teams, allocate projects, and
            assign tasks. <strong>Admin</strong> (you) manages everyone. Promote and demote anyone below.
          </div>
        </div>
      </div>

      {/* Summary strip — at-a-glance workspace headcount + lock health. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'People', value: totalPeople, icon: User, color: 'text-slate-600' },
          { label: 'Leads & admin', value: leadCount, icon: Shield, color: 'text-blue-600' },
          { label: 'Contributors', value: icCount, icon: User, color: 'text-slate-600' },
          {
            label: 'Deactivated',
            value: deactivatedCount,
            icon: UserX,
            color: deactivatedCount ? 'text-amber-600' : 'text-slate-400',
          },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="rounded-xl border border-slate-200/80 bg-white px-4 py-3">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <Icon size={12} className={s.color} /> {s.label}
              </div>
              <div className={`tnum mt-1 text-2xl font-black ${s.color}`}>{s.value}</div>
            </div>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute top-1/2 -translate-y-1/2 left-3 text-slate-400" />
        <input
          className="input pl-9"
          placeholder="Search the whole workspace — name, username, email, member ID…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {roleErr && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {roleErr}
        </div>
      )}

      {/* PM section */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/60 flex items-center gap-2">
          <Shield size={14} className="text-blue-500" />
          <h2 className="text-sm font-bold text-slate-700">Team Leads &amp; Admin</h2>
          <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 ml-1">
            {pms.length}
          </span>
        </div>
        {pms.length === 0 ? (
          <div className="px-5 py-5 text-sm text-slate-400">
            {q ? 'No leads match your search.' : 'No leads yet.'}
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {pms.map((u) => (
              <div key={u.id} className="flex items-center flex-wrap gap-x-3 gap-y-2 px-5 py-4">
                <button
                  type="button"
                  onClick={() => openPerson(u)}
                  disabled={!canOpenPerson(u)}
                  className={`group flex items-center gap-3 flex-1 min-w-0 text-left rounded-lg -m-1 p-1 transition-colors ${canOpenPerson(u) ? 'hover:bg-blue-50/60 cursor-pointer' : 'cursor-default'}`}
                  title={personTitle(u)}
                >
                  <UserAvatar userId={u.id} name={u.name} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-800 text-sm leading-tight flex items-center gap-1.5">
                      <span className="truncate group-hover:text-blue-700 transition-colors">{u.name}</span>
                      {u.username && <BarChart3 size={12} className="text-slate-300 shrink-0" />}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5 font-mono">@{handleOf(u)}</div>
                  </div>
                </button>
                <RoleBadge role={u.role} />
                {u.lockedAt && (
                  <span
                    className="tag border text-xs font-semibold border-rose-200 bg-rose-50 text-rose-700"
                    title={`Locked at ${formatDateTime(u.lockedAt)} after too many failed sign-ins`}
                  >
                    Locked
                  </span>
                )}
                {isLeadOrAdmin && (
                  <button
                    className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    onClick={() => setEditUser(u)}
                    title="Edit profile"
                  >
                    <Pencil size={13} />
                  </button>
                )}
                {isAdmin && (
                  <Link
                    href={`/audit?targetType=user&targetId=${u.id}`}
                    title="Audit trail"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    <ScrollText size={13} />
                  </Link>
                )}
                {isLeadOrAdmin && u.lockedAt && (
                  <button
                    className="text-xs text-rose-600 hover:text-rose-800 font-semibold px-2.5 py-1.5 rounded-lg hover:bg-rose-50 transition-colors border border-rose-200"
                    onClick={() => unlockAccount(u)}
                    disabled={saving === u.id}
                    title="Clear the failed-login counter so this user can sign in again"
                  >
                    Unlock
                  </button>
                )}
                {isLeadOrAdmin && (
                  <button
                    className="text-xs text-slate-500 hover:text-blue-700 font-semibold px-2.5 py-1.5 rounded-lg hover:bg-blue-50 transition-colors border border-transparent hover:border-blue-200"
                    onClick={() => resetPassword(u)}
                    disabled={saving === u.id}
                    title="Issue a one-time temporary password"
                  >
                    Reset password
                  </button>
                )}
                {isAdmin && me?.id !== u.id && (
                  <button
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                    onClick={() => forceLogout(u)}
                    disabled={saving === u.id}
                    title="Sign out everywhere (revokes all active sessions)"
                  >
                    <LogOut size={13} />
                  </button>
                )}
                {/* Demote a lead to contributor. Never offered for the
                   admin row or the admin's own row. */}
                {me?.id !== u.id && u.role !== 'admin' && (
                  <button
                    className="text-xs text-slate-500 hover:text-amber-600 font-semibold px-2.5 py-1.5 rounded-lg hover:bg-amber-50 transition-colors border border-transparent hover:border-amber-200"
                    onClick={() => setRoleConfirm({ user: u, targetRole: 'contributor' })}
                    disabled={saving === u.id}
                  >
                    Make contributor
                  </button>
                )}
                {me?.id !== u.id && u.role !== 'admin' && (
                  <button
                    className="p-1.5 rounded-lg text-slate-300 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                    onClick={() => setDeactivateTarget(u)}
                    disabled={saving === u.id}
                    title="Deactivate account (keeps the record)"
                  >
                    <UserX size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* IC section */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/60 flex items-center gap-2">
          {ics.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const ids = ics.map((u) => u.id);
                const allOn = ids.length > 0 && ids.every((id) => selected.has(id));
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (allOn) ids.forEach((id) => next.delete(id));
                  else ids.forEach((id) => next.add(id));
                  return next;
                });
              }}
              className="text-slate-400 hover:text-blue-600 transition-colors"
              title="Select all shown contributors"
            >
              {ics.length > 0 && ics.every((u) => selected.has(u.id)) ? (
                <CheckSquare size={15} className="text-blue-600" />
              ) : ics.some((u) => selected.has(u.id)) ? (
                <MinusSquare size={15} className="text-blue-500" />
              ) : (
                <Square size={15} />
              )}
            </button>
          )}
          <User size={14} className="text-slate-400" />
          <h2 className="text-sm font-bold text-slate-700">Contributors</h2>
          <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 ml-1">
            {q ? ics.length : contribTotal || ics.length}
          </span>
        </div>

        {/* Bulk action bar — appears when ≥1 contributor is selected. Every
            action routes through a signed batch (password + reason). */}
        {selected.size > 0 && (
          <div className="px-5 py-2.5 border-b border-blue-100 bg-blue-50/70 flex items-center gap-2 flex-wrap fade-in-soft">
            <span className="text-xs font-bold text-blue-800">{selected.size} selected</span>
            <button
              onClick={clearSelection}
              className="text-xs text-slate-500 hover:text-slate-700 font-semibold px-2 py-1 rounded-lg hover:bg-white/60 transition-colors"
            >
              Clear
            </button>
            <div className="flex-1" />
            <button
              onClick={() => setBulkAction('promote_lead')}
              className="text-xs text-blue-700 hover:text-blue-900 font-semibold px-2.5 py-1.5 rounded-lg bg-white border border-blue-200 hover:bg-blue-50 transition-colors inline-flex items-center gap-1.5"
            >
              <Shield size={12} /> Promote to lead
            </button>
            <button
              onClick={() => setBulkAction('deactivate')}
              className="text-xs text-amber-700 hover:text-amber-900 font-semibold px-2.5 py-1.5 rounded-lg bg-white border border-amber-200 hover:bg-amber-50 transition-colors inline-flex items-center gap-1.5"
            >
              <UserX size={12} /> Deactivate
            </button>
          </div>
        )}
        {ics.length === 0 ? (
          <div className="px-5 py-5 text-sm text-slate-400">
            {q ? (
              'No contributors match your search.'
            ) : (
              <>
                No contributors yet.{' '}
                <button
                  onClick={() => setShowAdd(true)}
                  className="text-blue-600 font-medium hover:underline"
                >
                  Add the first member.
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {ics.map((u) => (
              <div
                key={u.id}
                className={`group flex items-center flex-wrap gap-x-3 gap-y-2 px-5 py-4 transition-colors ${selected.has(u.id) ? 'bg-blue-50/50' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => toggleSelect(u.id)}
                  className={`shrink-0 transition-all ${selected.has(u.id) ? 'text-blue-600 opacity-100' : 'text-slate-300 opacity-0 group-hover:opacity-100 hover:text-blue-500'}`}
                  title={selected.has(u.id) ? 'Deselect' : 'Select for bulk action'}
                >
                  {selected.has(u.id) ? <CheckSquare size={16} /> : <Square size={16} />}
                </button>
                <button
                  type="button"
                  onClick={() => openPerson(u)}
                  disabled={!canOpenPerson(u)}
                  className={`group flex items-center gap-3 flex-1 min-w-0 text-left rounded-lg -m-1 p-1 transition-colors ${canOpenPerson(u) ? 'hover:bg-blue-50/60 cursor-pointer' : 'cursor-default'}`}
                  title={personTitle(u)}
                >
                  <UserAvatar userId={u.id} name={u.name} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-800 text-sm leading-tight flex items-center gap-1.5">
                      <span className="truncate group-hover:text-blue-700 transition-colors">{u.name}</span>
                      {u.username && <BarChart3 size={12} className="text-slate-300 shrink-0" />}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5 font-mono">@{handleOf(u)}</div>
                  </div>
                </button>
                <RoleBadge role={u.role} />
                {u.lockedAt && (
                  <span
                    className="tag border text-xs font-semibold border-rose-200 bg-rose-50 text-rose-700"
                    title={`Locked at ${formatDateTime(u.lockedAt)} after too many failed sign-ins`}
                  >
                    Locked
                  </span>
                )}
                <button
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-all"
                  onClick={() => setEditUser(u)}
                  title="Edit profile"
                >
                  <Pencil size={13} />
                </button>
                {u.lockedAt && (
                  <button
                    className="text-xs text-rose-600 hover:text-rose-800 font-semibold px-2.5 py-1.5 rounded-lg hover:bg-rose-50 transition-colors border border-rose-200"
                    onClick={() => unlockAccount(u)}
                    disabled={saving === u.id}
                    title="Clear the failed-login counter so this user can sign in again"
                  >
                    Unlock
                  </button>
                )}
                <button
                  className="text-xs text-slate-500 hover:text-blue-700 font-semibold px-2.5 py-1.5 rounded-lg hover:bg-blue-50 transition-colors border border-transparent hover:border-blue-200"
                  onClick={() => resetPassword(u)}
                  disabled={saving === u.id}
                  title="Reset password to the default"
                >
                  Reset password
                </button>
                <button
                  className="text-xs text-blue-600 hover:text-blue-800 font-semibold px-2.5 py-1.5 rounded-lg hover:bg-blue-50 transition-colors border border-transparent hover:border-blue-200"
                  onClick={() => setRoleConfirm({ user: u, targetRole: 'lead' })}
                  disabled={saving === u.id}
                >
                  Promote to Lead
                </button>
                {isAdmin && me?.id !== u.id && (
                  <button
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all"
                    onClick={() => forceLogout(u)}
                    disabled={saving === u.id}
                    title="Sign out everywhere (revokes all active sessions)"
                  >
                    <LogOut size={13} />
                  </button>
                )}
                <button
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-300 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-all"
                  onClick={() => setDeactivateTarget(u)}
                  disabled={saving === u.id}
                  title="Deactivate account (keeps the record)"
                >
                  <UserX size={14} />
                </button>
                <button
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all"
                  onClick={() => setRemoveConfirm(u)}
                  title="Permanently remove (deletes the record)"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {/* Load more — only meaningful when browsing (not searching), and
               only while fewer contributors are loaded than the workspace has. */}
            {!q && ics.length < contribTotal && (
              <div className="px-5 py-3 text-center">
                <button
                  onClick={loadMoreContributors}
                  disabled={loadingMore}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {loadingMore ? 'Loading…' : `Load more · showing ${ics.length} of ${contribTotal}`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Deactivated record — kept on purpose. A deactivated person can't
         sign in and is gone from every assignee list, but the account and
         their task history remain attributable. Reactivating restores
         access and clears any lock. */}
      {deactivated.length > 0 && (
        <div className="card overflow-hidden border-amber-200/70">
          <div className="px-5 py-3.5 border-b border-amber-100 bg-amber-50/50 flex items-center gap-2">
            <UserX size={14} className="text-amber-500" />
            <h2 className="text-sm font-bold text-slate-700">Deactivated accounts</h2>
            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 ml-1">
              {deactivated.length}
            </span>
            <span className="ml-auto text-[11px] text-slate-400">Record retained · can be reactivated</span>
          </div>
          <div className="divide-y divide-slate-50">
            {deactivated.map((u) => (
              <div key={u.id} className="flex items-center flex-wrap gap-x-3 gap-y-2 px-5 py-4">
                <button
                  type="button"
                  onClick={() => openPerson(u)}
                  disabled={!canOpenPerson(u)}
                  className={`flex items-center gap-3 flex-1 min-w-0 text-left rounded-lg -m-1 p-1 transition-colors ${canOpenPerson(u) ? 'hover:bg-amber-50/60 cursor-pointer' : 'cursor-default'}`}
                  title={personTitle(u)}
                >
                  <span className="opacity-60">
                    <UserAvatar userId={u.id} name={u.name} size={36} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-700 text-sm leading-tight truncate">
                      {u.name}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono">@{handleOf(u)}</span>
                      {u.deactivatedAt && <span>· off {formatFullDate(u.deactivatedAt)}</span>}
                      {u.deactivatedBy && <span>· by {u.deactivatedBy}</span>}
                    </div>
                    {u.deactivationReason && (
                      <div
                        className="text-[11px] text-amber-700/80 mt-0.5 italic truncate"
                        title={u.deactivationReason}
                      >
                        “{u.deactivationReason}”
                      </div>
                    )}
                  </div>
                </button>
                <span className="tag border text-xs font-semibold border-amber-200 bg-amber-50 text-amber-700">
                  Deactivated
                </span>
                <button
                  className="text-xs text-emerald-700 hover:text-emerald-900 font-semibold px-2.5 py-1.5 rounded-lg hover:bg-emerald-50 transition-colors border border-emerald-200 inline-flex items-center gap-1.5"
                  onClick={() => reactivate(u)}
                  disabled={saving === u.id}
                  title="Restore access and clear any lock"
                >
                  <RotateCcw size={12} /> Reactivate
                </button>
                <button
                  className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                  onClick={() => setRemoveConfirm(u)}
                  title="Permanently remove (deletes the record)"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
