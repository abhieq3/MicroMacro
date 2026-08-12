'use client';
import { useState } from 'react';
import { Lock } from 'lucide-react';
import { api } from '@/lib/client/api';

/**
 * Force-password-change modal. Shown when an admin-issued temp password
 * is in play (User.mustChangePassword = true). Kept in its own file so
 * AppShell can dynamic-import it: only the small fraction of users with
 * a temp password ever ship this JS, the other 99% pay nothing.
 */
export function ForcePasswordModal({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const checks = [
    { label: '8+ chars', ok: pw.length >= 8 },
    { label: 'A–Z', ok: /[A-Z]/.test(pw) },
    { label: 'a–z', ok: /[a-z]/.test(pw) },
    { label: '0–9', ok: /[0-9]/.test(pw) },
  ];
  const score = checks.filter((c) => c.ok).length;
  const barColor = score <= 1 ? '#EF4444' : score <= 2 ? '#F59E0B' : score <= 3 ? '#3B82F6' : '#22C55E';
  const strong = score >= 3 && pw.length >= 8;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw !== confirm) {
      setErr('Passwords do not match.');
      return;
    }
    if (!strong) {
      setErr('Please choose a stronger password.');
      return;
    }
    setErr('');
    setSaving(true);
    try {
      await api('/auth/first-password', { method: 'POST', body: { newPassword: pw } });
      onDone();
    } catch (e: any) {
      setErr(e.message || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-sm p-7"
        style={{ animation: 'celebration-pop 0.3s ease-out forwards' }}
      >
        <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-4">
          <Lock size={22} className="text-blue-600" />
        </div>
        <h2 className="text-xl font-black text-slate-900 text-center tracking-tight">Set your password</h2>
        <p className="text-sm text-slate-400 text-center mt-1.5 leading-snug">
          Your account is on a temporary password. Choose your own to continue — it can&apos;t be the same
          one you just signed in with. The app will not unlock until you finish this step.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="label">New password</label>
            <input
              type="password"
              autoFocus
              required
              minLength={8}
              className="input text-sm"
              placeholder="Min 8 characters"
              value={pw}
              onChange={(e) => {
                setPw(e.target.value);
                setErr('');
              }}
            />
            {pw && (
              <div className="mt-2 space-y-1.5">
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="h-1 flex-1 rounded-sm transition-all duration-300"
                      style={{ background: i <= score ? barColor : '#E2E8F0' }}
                    />
                  ))}
                </div>
                <div className="flex gap-3 flex-wrap">
                  {checks.map((c) => (
                    <span
                      key={c.label}
                      style={{ fontSize: 10 }}
                      className={`transition-colors ${c.ok ? 'text-green-600 font-medium' : 'text-slate-300'}`}
                    >
                      {c.ok ? '✓' : '·'} {c.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="label">Confirm password</label>
            <input
              type="password"
              required
              className="input text-sm"
              placeholder="Re-enter password"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                setErr('');
              }}
            />
            {confirm && pw !== confirm && (
              <div className="text-xs text-red-500 mt-1">Passwords do not match</div>
            )}
          </div>
          {err && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
              {err}
            </div>
          )}
          <button
            type="submit"
            disabled={saving || !strong || pw !== confirm}
            className="w-full py-2.5 rounded-lg text-sm font-bold text-white transition-all disabled:opacity-50 mt-1"
            style={{ background: 'linear-gradient(135deg, #1256B0 0%, #1769C8 100%)' }}
          >
            {saving ? 'Saving…' : 'Set password & continue →'}
          </button>
        </form>
      </div>
    </div>
  );
}
