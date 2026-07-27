'use client';
import { useState, useEffect } from 'react';
import { ModalPortal } from '@/components/ModalPortal';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { api } from '@/lib/client/api';
import { Avatar, formatDateTime } from '@/components/ui';
import { PwaInstallSection } from '@/components/PwaInstall';
// The contribution heatmap is a sizeable, below-the-fold client component —
// lazy-load it so it never blocks first paint of the profile page.
const ActivityGraph = dynamic(() => import('@/components/ActivityGraph').then((m) => m.ActivityGraph), {
  ssr: false,
  loading: () => <div className="h-40 rounded-xl bg-slate-50 animate-pulse" />,
});
import {
  User,
  Lock,
  ShieldCheck,
  Copy,
  CalendarDays,
  Check,
  RefreshCw,
  X,
  Activity,
  KeyRound,
  AlertTriangle,
  ServerCog,
  MoreHorizontal,
  ChevronDown,
  ChevronRight,
  Pencil,
  ExternalLink,
  Mail,
  Send,
  Plus,
  Trash2,
  Globe,
  Github,
  Linkedin,
  Twitter,
  Instagram,
  Youtube,
} from 'lucide-react';

import { MonogramEditor } from '@/components/MonogramEditor';
import { linkMeta, type LinkBrand } from '@/lib/links';
import { ProfileHero } from '@/components/ProfileHero';
import { SelfImpactTiles } from '@/components/ProfileStatTiles';

// Foresight panel is below the fold — keep it out of the settings first paint.
const DeliveryForesight = dynamic(
  () => import('@/components/DeliveryForesight').then((m) => m.DeliveryForesight),
  { ssr: false, loading: () => <div className="h-28 rounded-xl bg-slate-50 animate-pulse" /> },
);

/* ── Profile avatar wrapper ───────────────────────────────────────────────
   Renders the user's monogram avatar with a hover-overlay "edit" hint.
   The avatar is always the standard Avatar component — the editor below
   passes letter/bg/font through, so the preview here matches every other
   surface where this user is shown. */
function ProfileAvatar({
  name,
  letter,
  bg,
  font,
  image,
  size = 88,
  onClick,
  title,
}: {
  name?: string | null;
  letter?: string;
  bg?: string;
  font?: number;
  image?: string;
  size?: number;
  onClick?: () => void;
  title?: string;
}) {
  const inner = <Avatar name={name} size={size} letter={letter} bg={bg} font={font} image={image} />;
  if (!onClick) return inner;
  // Wrap in a button so clicking the portrait opens the monogram editor
  // (matches user expectation — "click avatar to change it"). The pencil
  // affordance on hover hints at editability without cluttering the resting
  // state.
  return (
    <button
      type="button"
      onClick={onClick}
      title={title || 'Change avatar'}
      aria-label={title || 'Change avatar'}
      className="group relative block p-0 leading-none rounded-full focus:outline-none focus:ring-2 focus:ring-white/40"
    >
      {inner}
      <span
        aria-hidden
        className="absolute inset-0 rounded-full flex items-end justify-end p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: 'linear-gradient(to top, rgba(15,23,42,0.45), transparent 55%)' }}
      >
        <span className="inline-flex items-center gap-1 rounded-full bg-white/95 text-slate-700 text-[10px] font-bold px-1.5 py-0.5 shadow-sm">
          Change
        </span>
      </span>
    </button>
  );
}

/* (legacy emoji picker removed — see MonogramEditor) */

/* ── Drop-sound toggle ───────────────────────────────────────────────────
   The short "thunk" played when the user successfully drops a task in
   kanban or reorders one on the dashboard. Stored server-side so the
   preference follows the user across devices. Default ON. */
function DropSoundToggle({ initial }: { initial: boolean }) {
  const [enabled, setEnabled] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    const next = !enabled;
    setEnabled(next); // optimistic
    setSaving(true);
    try {
      await api('/users/me', { method: 'PATCH', body: { soundDropEnabled: next } });
    } catch {
      setEnabled(!next); // revert on failure
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl bg-white dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-bold text-slate-800 dark:text-white/90">Drop sound</div>
          <p className="text-xs text-slate-400 dark:text-white/40 mt-0.5 leading-relaxed">
            Plays a short cue when you drop a task in kanban or reorder one on the dashboard.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={saving}
          onClick={toggle}
          className={`mt-0.5 relative w-10 h-5.5 rounded-full shrink-0 transition-colors cursor-pointer ${
            enabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-white/15'
          }`}
          style={{ width: 36, height: 20 }}
        >
          <span
            className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
            style={{ left: enabled ? 18 : 2 }}
          />
        </button>
      </div>
    </div>
  );
}

/* ── Quick PIN management ─────────────────────────────────────────────────── */
function QuickPinSection() {
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [currentPin, setCur] = useState('');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    api<{ hasPin: boolean }>('/auth/pin')
      .then((d) => setHasPin(d.hasPin))
      .catch(() => setHasPin(false));
  }, []);

  const valid = /^\d{4}$/.test(pin);
  const matches = pin === confirm;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setMsg('');
    if (!valid) {
      setErr('PIN must be exactly 4 digits.');
      return;
    }
    if (!matches) {
      setErr('The two PINs don’t match.');
      return;
    }
    setSaving(true);
    try {
      await api('/auth/pin', { method: 'POST', body: { pin, ...(hasPin ? { currentPin } : {}) } });
      setMsg('Quick PIN updated.');
      setHasPin(true);
      setCur('');
      setPin('');
      setConfirm('');
    } catch (e: any) {
      setErr(e.message || 'Could not update your PIN.');
    } finally {
      setSaving(false);
    }
  }

  const box = 'input text-center font-bold tracking-[0.4em]';

  return (
    <div id="quick-pin" className="scroll-mt-6">
      <Section
        icon={KeyRound}
        title="Quick PIN"
        subtitle="A 4-digit code to resume an idle session on this device."
      >
        <form onSubmit={save} className="space-y-3.5">
          {hasPin && (
            <Field label="Current PIN">
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                className={box}
                value={currentPin}
                onChange={(e) => setCur(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="••••"
              />
            </Field>
          )}
          <Field label={hasPin ? 'New PIN' : 'PIN'}>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              className={box}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="••••"
            />
          </Field>
          <Field label="Confirm PIN">
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              className={`${box} ${confirm && !matches ? 'border-red-300' : ''}`}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="••••"
            />
          </Field>
          {err && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {err}
            </div>
          )}
          {msg && (
            <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              ✓ {msg}
            </div>
          )}
          <button
            type="submit"
            className="btn-primary w-full justify-center"
            disabled={saving || !valid || !matches || (!!hasPin && currentPin.length !== 4)}
          >
            {saving ? 'Saving…' : hasPin ? 'Change PIN' : 'Set PIN'}
          </button>
          <p className="text-[11px] text-slate-400 leading-snug">
            Forgot it? Just sign in with your password — it always works — then set a new PIN here. Your
            password is always required on a new device.
          </p>
        </form>
      </Section>
    </div>
  );
}

/* ── Admin: production error monitor ──────────────────────────────────────── */
function AdminErrorMonitor() {
  const [errors, setErrors] = useState<any[]>([]);
  const [unack, setUnack] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const d: any = await api('/errors');
      setErrors(d.errors || []);
      setUnack(d.unacknowledged || 0);
    } catch {
      /* admin-only; ignore for non-admins */
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function ack(id?: string) {
    setBusy(true);
    try {
      await api('/errors', { method: 'PATCH', body: id ? { id } : { all: true } });
      await load();
    } finally {
      setBusy(false);
    }
  }

  function fmt(iso: string | null) {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
  }

  return (
    <div id="monitor" className="scroll-mt-6">
      <Section
        icon={ServerCog}
        title="System monitor"
        subtitle="Recent production errors captured across the app (auto-expire after 30 days)."
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm">
              {unack > 0 ? (
                <span className="inline-flex items-center gap-1.5 font-semibold text-red-700">
                  <AlertTriangle size={14} /> {unack} unacknowledged
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 font-semibold text-green-700">
                  <Check size={14} /> All clear
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => load()} className="btn-secondary text-xs" disabled={loading || busy}>
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
              </button>
              {unack > 0 && (
                <button onClick={() => ack()} className="btn-secondary text-xs" disabled={busy}>
                  Dismiss all
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="text-xs text-slate-400 py-4 text-center">Loading…</div>
          ) : errors.length === 0 ? (
            <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-6 text-center text-xs text-slate-400">
              No errors recorded.
            </div>
          ) : (
            <ul className="space-y-2">
              {errors.map((e) => (
                <li
                  key={e.id}
                  className={`rounded-lg border px-3 py-2.5 text-xs ${e.acknowledged ? 'border-slate-100 bg-slate-50/60 opacity-70' : 'border-red-100 bg-red-50/60'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${e.source === 'client' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}
                        >
                          {e.source}
                        </span>
                        {e.count > 1 && (
                          <span className="text-[10px] font-bold text-red-600">×{e.count}</span>
                        )}
                        {e.path && <span className="font-mono text-slate-500 truncate">{e.path}</span>}
                      </div>
                      <div className="mt-1 font-medium text-slate-800 break-words">{e.message}</div>
                      <div className="mt-1 text-[11px] text-slate-400">
                        {fmt(e.lastSeenAt)}
                        {e.userName ? ` · ${e.userName}` : ''}
                        {e.digest ? ` · ref ${e.digest}` : ''}
                      </div>
                    </div>
                    {!e.acknowledged && (
                      <button
                        onClick={() => ack(e.id)}
                        disabled={busy}
                        className="shrink-0 text-slate-400 hover:text-slate-700 transition-colors"
                        title="Dismiss"
                      >
                        <Check size={15} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>
    </div>
  );
}

/* ── Section wrapper ──────────────────────────────────────────────────────── */
function Section({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon?: any;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card rounded-xl border overflow-hidden">
      <div className="section-head px-5 py-3.5 border-b flex items-center gap-2.5">
        {Icon && <Icon size={15} className="text-blue-500 shrink-0" />}
        <div>
          <h3 className="text-sm font-bold text-slate-800">{title}</h3>
          {subtitle && <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{subtitle}</p>}
        </div>
      </div>
      <div className="px-5 py-5">{children}</div>
    </div>
  );
}

/* ── Field wrapper ────────────────────────────────────────────────────────── */
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-slate-400 mt-1 leading-snug">{hint}</p>}
    </div>
  );
}

/* ── Read-only field ──────────────────────────────────────────────────────── */
function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
        {label}
      </label>
      <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2.5 text-sm text-slate-600 leading-none">
        {value || <span className="text-slate-300">—</span>}
      </div>
    </div>
  );
}

/* ── Links editor ─────────────────────────────────────────────────────────────
   Any site, not just GitHub. Each row is a URL (+ optional label); the brand
   icon is derived live from the host so the member sees how it will look. */
const SETTINGS_BRAND_ICON: Record<LinkBrand, typeof Globe> = {
  github: Github,
  linkedin: Linkedin,
  twitter: Twitter,
  instagram: Instagram,
  youtube: Youtube,
  email: Mail,
  medium: Globe,
  dribbble: Globe,
  behance: Globe,
  figma: Globe,
  gitlab: Globe,
  website: Globe,
};

function LinksEditor({
  links,
  setLinks,
}: {
  links: { url: string; label: string }[];
  setLinks: (next: { url: string; label: string }[]) => void;
}) {
  const update = (i: number, patch: Partial<{ url: string; label: string }>) =>
    setLinks(links.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const remove = (i: number) => setLinks(links.filter((_, idx) => idx !== i));
  const add = () => setLinks([...links, { url: '', label: '' }]);

  return (
    <Field label="Links" hint="Any site — GitHub, LinkedIn, your portfolio, X… Shown on your public profile.">
      <div className="space-y-2">
        {links.map((l, i) => {
          const valid = /^https?:\/\/[^\s]+$/i.test(l.url.trim());
          const m = valid ? linkMeta(l.url, l.label) : null;
          const Icon = m ? SETTINGS_BRAND_ICON[m.brand] || Globe : Globe;
          return (
            <div key={i} className="flex items-center gap-2">
              <span
                className="w-8 h-8 rounded-lg border border-slate-200 dark:border-white/10 flex items-center justify-center shrink-0"
                style={{ color: m ? m.color : '#94a3b8' }}
                title={m ? m.label : 'Add a link'}
              >
                <Icon size={15} />
              </span>
              <input
                className="input flex-1 min-w-0"
                type="url"
                inputMode="url"
                placeholder="https://…"
                value={l.url}
                onChange={(e) => update(i, { url: e.target.value })}
              />
              <input
                className="input w-32 shrink-0"
                placeholder="Label (optional)"
                value={l.label}
                maxLength={24}
                onChange={(e) => update(i, { label: e.target.value })}
              />
              <button
                type="button"
                onClick={() => remove(i)}
                className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors shrink-0"
                title="Remove link"
              >
                <Trash2 size={15} />
              </button>
            </div>
          );
        })}
        {links.length < 6 && (
          <button
            type="button"
            onClick={add}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
          >
            <Plus size={14} /> Add link
          </button>
        )}
      </div>
    </Field>
  );
}

/* ── Daily-digest shared bits (module scope so inputs never lose focus) ─────── */
function DigestSwitch({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={`mt-0.5 relative rounded-full shrink-0 transition-colors ${on ? 'bg-blue-600' : 'bg-slate-300 dark:bg-white/15'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      style={{ width: 36, height: 20 }}
    >
      <span
        className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
        style={{ left: on ? 18 : 2 }}
      />
    </button>
  );
}

function DigestRow({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-slate-100 last:border-0">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-700 dark:text-white/80">{label}</div>
        {desc && <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">{desc}</div>}
      </div>
      {children}
    </div>
  );
}

function ChecklistItem({ ok, label, hint }: { ok: boolean; label: string; hint?: string }) {
  return (
    <li className="flex items-start gap-2 text-xs">
      {ok ? (
        <Check size={14} className="text-green-600 mt-0.5 shrink-0" />
      ) : (
        <X size={14} className="text-amber-500 mt-0.5 shrink-0" />
      )}
      <span className={ok ? 'text-slate-600' : 'text-slate-500'}>
        <span className="font-semibold">{label}</span>
        {hint && !ok ? <span className="text-slate-400"> — {hint}</span> : null}
      </span>
    </li>
  );
}

/* ── Daily task email — personal opt-in (all users) ─────────────────────────
   The destination address can now be self-managed; the user also controls
   whether the 08:30 digest is sent. */
function DailyDigestToggle({ initialUser }: { initialUser: any }) {
  const loginEmail = initialUser.email || '';
  const [notifyEmail, setNotifyEmail] = useState<string>(initialUser.notifyEmail || '');
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailErr, setEmailErr] = useState('');

  const effectiveEmail =
    notifyEmail.trim() || (loginEmail && !loginEmail.endsWith('@pragati.local') ? loginEmail : '');
  const canEnable = !!effectiveEmail;
  const [enabled, setEnabled] = useState<boolean>(!!initialUser.notifDailyDigest);
  const [saving, setSaving] = useState(false);
  const [, setTestMsg] = useState('');
  // Delivery health — lets the toggle be honest when the deployment can't
  // actually send (no mail provider / no cron secret) instead of silently
  // accepting an opt-in that will never produce an email.
  const [health, setHealth] = useState<{
    mailerConfigured: boolean;
    cronSecretSet: boolean;
    timeZoneLabel?: string;
    defaultHour?: number;
    lastRunAt?: string | null;
    workspaceEnabled?: boolean;
  } | null>(null);

  useEffect(() => {
    api('/me/digest-health')
      .then((h: any) => setHealth(h))
      .catch(() => {});
  }, []);

  async function toggle() {
    if (!canEnable) return;
    const next = !enabled;
    setEnabled(next);
    setSaving(true);
    try {
      await api('/users/me', { method: 'PATCH', body: { notifDailyDigest: next } });
      // Switching it ON sends the first brief right away — proof it works, and
      // the welcome the user expects the moment they opt in. Best-effort: a send
      // hiccup must never make the toggle look like it failed.
      if (next) {
        setTestMsg('Sending your first brief…');
        try {
          const r: any = await api('/cron/daily-digest?welcome=1');
          if (r.sent > 0) setTestMsg('Your first brief is on its way — check your inbox (and spam).');
          else if (!r.mailerConfigured)
            setTestMsg('Saved. Email isn’t configured on this deployment yet — your admin can finish setup.');
          else if (r.skippedNoEmail > 0)
            setTestMsg('Saved — add a notification email above to receive your daily brief.');
          else setTestMsg('Saved. Your daily brief will arrive at your chosen time.');
        } catch {
          setTestMsg('Saved. Your daily brief will arrive at your chosen time.');
        }
      } else {
        setTestMsg('');
      }
    } catch {
      setEnabled(!next);
    } finally {
      setSaving(false);
    }
  }

  async function saveEmail() {
    const val = emailDraft.trim();
    if (val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      setEmailErr('Enter a valid email address.');
      return;
    }
    setSavingEmail(true);
    setEmailErr('');
    try {
      await api('/users/me', { method: 'PATCH', body: { notifyEmail: val } });
      setNotifyEmail(val);
      setEditingEmail(false);
    } catch (e: any) {
      setEmailErr(e.message || 'Could not save email.');
    } finally {
      setSavingEmail(false);
    }
  }

  return (
    <div id="daily-email" className="scroll-mt-6">
      <Section icon={Mail} title="Daily task email" subtitle="Your focused daily brief, when you want it.">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 text-sm text-slate-600 dark:text-white/60 leading-relaxed flex-1">
            {enabled && (
              <div className="mt-2 text-[12px] text-slate-500 dark:text-white/55">
                Delivered{' '}
                <span className="font-semibold text-slate-700 dark:text-white/75">every day at 8:30 AM</span>
                {health?.timeZoneLabel ? ` (${health.timeZoneLabel})` : ' IST'} — one brief, every morning.
              </div>
            )}
            {health && (!health.mailerConfigured || !health.cronSecretSet) && (
              <p className="mt-1.5 text-[11.5px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg px-2.5 py-1.5">
                Heads up: email delivery isn’t fully configured on this deployment yet
                {!health.mailerConfigured ? ' (no mail provider)' : ' (scheduled send not enabled)'} — your
                preference is saved and takes effect the moment your admin completes setup.
              </p>
            )}
            {canEnable ? (
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                {editingEmail ? (
                  <>
                    <input
                      type="email"
                      value={emailDraft}
                      onChange={(e) => {
                        setEmailDraft(e.target.value);
                        setEmailErr('');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEmail();
                        if (e.key === 'Escape') setEditingEmail(false);
                      }}
                      className="input text-sm py-1 px-2 w-56"
                      placeholder="your@email.com"
                      autoFocus
                    />
                    <button
                      onClick={saveEmail}
                      disabled={savingEmail}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                    >
                      {savingEmail ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={() => {
                        setEditingEmail(false);
                        setEmailErr('');
                      }}
                      className="text-xs text-slate-400 hover:text-slate-600"
                    >
                      Cancel
                    </button>
                    {emailErr && <span className="text-xs text-red-600 w-full">{emailErr}</span>}
                  </>
                ) : (
                  <>
                    <span className="text-[12px] text-slate-500 dark:text-white/50">
                      Delivered to{' '}
                      <span className="font-semibold text-slate-700 dark:text-white/70">
                        {effectiveEmail}
                      </span>
                    </span>
                    <button
                      onClick={() => {
                        setEmailDraft(notifyEmail);
                        setEditingEmail(true);
                      }}
                      className="text-[11px] font-semibold text-blue-600 hover:underline"
                    >
                      Change
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                {editingEmail ? (
                  <>
                    <input
                      type="email"
                      value={emailDraft}
                      onChange={(e) => {
                        setEmailDraft(e.target.value);
                        setEmailErr('');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEmail();
                        if (e.key === 'Escape') setEditingEmail(false);
                      }}
                      className="input text-sm py-1 px-2 w-56"
                      placeholder="your@email.com"
                      autoFocus
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={saveEmail}
                        disabled={savingEmail}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                      >
                        {savingEmail ? 'Saving…' : 'Save email'}
                      </button>
                      <button
                        onClick={() => {
                          setEditingEmail(false);
                          setEmailErr('');
                        }}
                        className="text-xs text-slate-400 hover:text-slate-600"
                      >
                        Cancel
                      </button>
                    </div>
                    {emailErr && <p className="text-xs text-red-600">{emailErr}</p>}
                  </>
                ) : (
                  <div>
                    <p className="text-[12px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-400/10 border border-amber-200 dark:border-amber-400/20 rounded-lg px-2.5 py-1.5 inline-block">
                      No delivery email set yet.
                    </p>
                    <button
                      onClick={() => {
                        setEmailDraft('');
                        setEditingEmail(true);
                      }}
                      className="block mt-1.5 text-[12px] font-semibold text-blue-600 hover:underline"
                    >
                      + Add your email address
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          <DigestSwitch on={enabled && canEnable} onClick={toggle} disabled={saving || !canEnable} />
        </div>
      </Section>
    </div>
  );
}

/* ── Daily email — workspace settings (admin only) ──────────────────────────
   Lets the admin tune what every user's digest contains and verify delivery
   end-to-end with a test send, all without leaving the page. */
/* ── Personal calendar feed — the pull-based, zero-cost channel ───────────
   A tokened read-only iCalendar URL the user subscribes to from Outlook /
   Google / Apple Calendar. Their calendar app polls it; we never send
   anything. Rotate to invalidate a leaked URL; turn off to revoke. */
function CalendarFeedSection() {
  const [state, setState] = useState<{ enabled: boolean; url: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api('/me/ics-token')
      .then((d: any) => setState(d))
      .catch(() => setState({ enabled: false, url: null }));
  }, []);

  async function mint() {
    setBusy(true);
    try {
      setState((await api('/me/ics-token', { method: 'POST' })) as any);
    } catch {
      /* leave state as-is */
    } finally {
      setBusy(false);
    }
  }
  async function revoke() {
    setBusy(true);
    try {
      setState((await api('/me/ics-token', { method: 'DELETE' })) as any);
    } catch {
      /* leave state as-is */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div id="calendar-feed" className="scroll-mt-6">
      <Section
        icon={CalendarDays}
        title="Pragati calendar"
        subtitle="Subscribe once — a Pragati calendar appears in Outlook, Google or Apple with every dated task. Reschedule here and it follows automatically."
      >
        {!state ? (
          <div className="text-xs text-slate-400 py-2">Loading…</div>
        ) : state.enabled && state.url ? (
          <div className="space-y-3">
            {/* First-timer path: pick your app, one click adds it. The raw link
                + management controls are tucked below so the primary action is
                unmistakable. */}
            <p className="text-[12.5px] text-slate-500 dark:text-white/50">
              Pick your calendar app — one click adds <strong>Pragati</strong>, then it keeps itself up to
              date.
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                className="btn-primary text-xs inline-flex items-center gap-1.5"
                href={`https://outlook.office.com/calendar/0/addfromweb?url=${encodeURIComponent(state.url)}&name=${encodeURIComponent('Pragati')}`}
                target="_blank"
                rel="noreferrer"
              >
                <CalendarDays size={13} /> Outlook (work)
              </a>
              <a
                className="btn-ghost text-xs inline-flex items-center gap-1.5"
                href={`https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(state.url)}&name=${encodeURIComponent('Pragati')}`}
                target="_blank"
                rel="noreferrer"
              >
                <CalendarDays size={13} /> Outlook (personal)
              </a>
              <a
                className="btn-ghost text-xs inline-flex items-center gap-1.5"
                href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(state.url.replace(/^https?:\/\//, 'webcal://'))}`}
                target="_blank"
                rel="noreferrer"
              >
                <CalendarDays size={13} /> Google
              </a>
              <a
                className="btn-ghost text-xs inline-flex items-center gap-1.5"
                href={state.url.replace(/^https?:\/\//, 'webcal://')}
              >
                <CalendarDays size={13} /> Apple
              </a>
            </div>

            {/* Secondary: the raw link, behind a quiet disclosure. Most people
                never need it; power users / unlisted apps can copy it. */}
            <details className="group">
              <summary className="cursor-pointer list-none text-[11px] font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-white/60 inline-flex items-center gap-1">
                <ChevronRight size={12} className="shrink-0 transition-transform group-open:rotate-90" />
                Other app, or copy the link
              </summary>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <code className="text-[11px] font-mono bg-slate-50 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.08] rounded-lg px-2 py-1.5 break-all flex-1 min-w-[200px]">
                  {state.url}
                </code>
                <button
                  className="btn-ghost text-xs inline-flex items-center gap-1.5"
                  onClick={() => {
                    navigator.clipboard?.writeText(state.url!);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </details>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              Changes in Pragati flow through on your calendar app’s next refresh. Anyone with the link can
              read your agenda — rotate it if it leaks.
            </p>
            <div className="flex gap-2">
              <button className="btn-ghost text-xs" onClick={mint} disabled={busy}>
                Rotate link
              </button>
              <button
                className="text-xs font-semibold text-red-600 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                onClick={revoke}
                disabled={busy}
              >
                Turn off
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-slate-600 dark:text-white/60">
              Generate your private link, add it to your calendar app once, and you're done — new tasks and
              date changes flow in by themselves.
            </p>
            <button className="btn-primary text-sm" onClick={mint} disabled={busy}>
              {busy ? 'Generating…' : 'Generate link'}
            </button>
          </div>
        )}
      </Section>
    </div>
  );
}

function AdminDigestSettings() {
  const [cfg, setCfg] = useState<any | null>(null);
  const [status, setStatus] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState('');

  useEffect(() => {
    api('/admin/digest-settings')
      .then((d: any) => {
        setCfg(d.settings);
        setStatus(d.status);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function set(key: string, value: any) {
    setCfg((c: any) => ({ ...c, [key]: value }));
  }

  async function save() {
    if (!cfg) return;
    setSaving(true);
    setMsg('');
    try {
      const d: any = await api('/admin/digest-settings', {
        method: 'PATCH',
        body: {
          enabled: cfg.enabled,
          dueToday: cfg.dueToday,
          overdue: cfg.overdue,
          dueSoonDays: Number(cfg.dueSoonDays) || 0,
          projectUpdates: cfg.projectUpdates,
          sendWhenEmpty: cfg.sendWhenEmpty,
          introNote: cfg.introNote || '',
        },
      });
      setCfg(d.settings);
      setStatus(d.status);
      setMsg('Saved');
      setTimeout(() => setMsg(''), 2500);
    } catch (e: any) {
      setMsg(e.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    setTestMsg('');
    try {
      const r: any = await api('/cron/daily-digest?test=1');
      if (r.sent > 0) setTestMsg('Test sent — check your inbox.');
      else if (!r.mailerConfigured)
        setTestMsg('Email isn’t configured yet — set BREVO_API_KEY and BREVO_SENDER_EMAIL.');
      else if (r.skippedNoEmail > 0) setTestMsg('No deliverable email on your own account.');
      else if (r.lastError) setTestMsg(`Provider rejected the send: ${r.lastError}`);
      else setTestMsg('Nothing was sent.');
    } catch (e: any) {
      setTestMsg(e.message || 'Test failed.');
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <Section
        icon={Mail}
        title="Daily email — workspace settings"
        subtitle="Admin · controls every user's 8:30 AM digest."
      >
        <div className="text-xs text-slate-400 py-4 text-center">Loading…</div>
      </Section>
    );
  }
  if (!cfg) return null;

  return (
    <div id="digest-admin" className="scroll-mt-6">
      <Section
        icon={Mail}
        title="Daily email — workspace settings"
        subtitle="Admin · controls what every user's 8:30 AM digest contains."
      >
        {status && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 mb-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
              Delivery setup
            </div>
            <ul className="space-y-1.5">
              <ChecklistItem
                ok={status.mailerConfigured}
                label="Email provider (Brevo)"
                hint="set BREVO_API_KEY + BREVO_SENDER_EMAIL"
              />
              <ChecklistItem
                ok={status.cronSecretSet}
                label="Scheduled send (CRON_SECRET)"
                hint="set CRON_SECRET in Vercel"
              />
              <ChecklistItem
                ok={status.appUrlConfigured}
                label="In-email links (APP_URL)"
                hint="set APP_URL for clickable links"
              />
            </ul>
            <div className="text-[11px] text-slate-400 mt-2">
              Sends daily at {status.sendTimeLocal} · {status.timeZone}
              {status.senderEmail ? ` · from ${status.senderEmail}` : ''}
            </div>
            {cfg?.lastRunAt && (
              <div className="text-[11px] text-slate-400 mt-1">
                Last run {formatDateTime(cfg.lastRunAt)} · sent{' '}
                <strong className="text-slate-600">
                  {cfg.lastRunSummary?.sent ?? 0}/{cfg.lastRunSummary?.cap ?? status.dailyCap}
                </strong>{' '}
                free sends
                {(cfg.lastRunSummary?.failed ?? 0) > 0 && ` · ${cfg.lastRunSummary.failed} failed`}
                {(cfg.lastRunSummary?.skippedCapReached ?? 0) > 0 &&
                  ` · ${cfg.lastRunSummary.skippedCapReached} skipped at the daily cap`}
              </div>
            )}
          </div>
        )}

        <DigestRow label="Send daily digests" desc="Master switch for the whole workspace.">
          <DigestSwitch on={!!cfg.enabled} onClick={() => set('enabled', !cfg.enabled)} />
        </DigestRow>
        <DigestRow label="Tasks due today">
          <DigestSwitch on={!!cfg.dueToday} onClick={() => set('dueToday', !cfg.dueToday)} />
        </DigestRow>
        <DigestRow label="Overdue tasks">
          <DigestSwitch on={!!cfg.overdue} onClick={() => set('overdue', !cfg.overdue)} />
        </DigestRow>
        <DigestRow label="Tasks due soon" desc="Days to look ahead (0 = off, max 14).">
          <input
            type="number"
            min={0}
            max={14}
            className="input w-20 text-center"
            value={cfg.dueSoonDays}
            onChange={(e) => set('dueSoonDays', Math.max(0, Math.min(14, parseInt(e.target.value, 10) || 0)))}
          />
        </DigestRow>
        <DigestRow
          label="Send when nothing’s due"
          desc="Off by default — empty days stay silent (no vanity “all clear” mail)."
        >
          <DigestSwitch on={!!cfg.sendWhenEmpty} onClick={() => set('sendWhenEmpty', !cfg.sendWhenEmpty)} />
        </DigestRow>

        <div className="mt-3.5">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
            Intro note (optional)
          </label>
          <textarea
            className="textarea text-sm"
            rows={2}
            maxLength={500}
            placeholder="A short line shown at the top of every digest."
            value={cfg.introNote || ''}
            onChange={(e) => set('introNote', e.target.value)}
          />
        </div>

        <div className="flex items-center flex-wrap gap-3 mt-4">
          <button onClick={save} disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : 'Save settings'}
          </button>
          <button onClick={sendTest} disabled={testing} className="btn-secondary gap-1.5">
            <Send size={13} /> {testing ? 'Sending…' : 'Send test to my email'}
          </button>
          {msg && <span className="text-xs text-green-600 font-medium">✓ {msg}</span>}
          {testMsg && <span className="text-xs text-slate-500">{testMsg}</span>}
        </div>
      </Section>
    </div>
  );
}

/* ── Password strength ────────────────────────────────────────────────────── */
function StrengthMeter({ password }: { password: string }) {
  const checks = [
    { label: '8+ chars', ok: password.length >= 8 },
    { label: 'A–Z', ok: /[A-Z]/.test(password) },
    { label: 'a–z', ok: /[a-z]/.test(password) },
    { label: '0–9', ok: /[0-9]/.test(password) },
    { label: '#!@', ok: /[^A-Za-z0-9]/.test(password) },
  ];
  const score = checks.filter((c) => c.ok).length;
  const barColor = score <= 2 ? '#ef4444' : score <= 3 ? '#f59e0b' : '#22c55e';
  const label = ['', 'Very weak', 'Weak', 'Fair', 'Good', 'Strong'][score];
  if (!password) return null;
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="flex gap-0.5 flex-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-sm transition-all duration-300"
              style={{ background: i <= score ? barColor : '#e2e8f0' }}
            />
          ))}
        </div>
        <span className="text-[11px] font-bold transition-colors" style={{ color: barColor }}>
          {label}
        </span>
      </div>
      <div className="flex gap-3 flex-wrap">
        {checks.map((c) => (
          <span
            key={c.label}
            className={`text-[10px] transition-colors ${c.ok ? 'text-green-600 font-medium' : 'text-slate-300'}`}
          >
            {c.ok ? '✓' : '·'} {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Recovery-key reveal modal ────────────────────────────────────────────── */
function RecoveryKeyModal({ keyValue, onClose }: { keyValue: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(keyValue).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }
  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}
      >
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <ShieldCheck size={20} className="text-amber-500 shrink-0" />
              <h3 className="text-base font-black text-slate-900">Your recovery key</h3>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
              <X size={18} />
            </button>
          </div>
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800 leading-snug">
            <strong>Store this somewhere safe.</strong> It is shown only once and can&rsquo;t be retrieved
            again. If you ever forget your password, type this key into the password field on the login screen
            to sign in, then set a new password here.
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 font-mono text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-slate-800 select-all tracking-wider break-all">
              {keyValue}
            </div>
            <button
              onClick={copy}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: copied ? '#dcfce7' : '#f1f5f9',
                color: copied ? '#166534' : '#475569',
                border: `1px solid ${copied ? '#bbf7d0' : '#e2e8f0'}`,
              }}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl text-sm font-bold text-white transition-all"
            style={{ background: '#1565C0' }}
          >
            I&rsquo;ve saved it — close
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   MAIN PAGE
════════════════════════════════════════════════════════════════════════════ */
export default function SettingsClient({ initialUser }: { initialUser: any }) {
  const router = useRouter();
  const [user, setUser] = useState<any>(initialUser);

  const [name, setName] = useState(initialUser.name || '');
  const [employeeId, setEmpId] = useState(initialUser.employeeId || '');
  // Generic public links (any site). Seed from the saved list; fold a legacy
  // githubUrl into it the first time so nothing the user set is lost, then the
  // links list is the single source of truth.
  const [links, setLinks] = useState<{ url: string; label: string }[]>(() => {
    const ls = ((initialUser.links as any[]) || []).map((l) => ({
      url: String(l?.url || ''),
      label: String(l?.label || ''),
    }));
    if (ls.length === 0 && initialUser.githubUrl) ls.push({ url: initialUser.githubUrl, label: '' });
    return ls;
  });
  const [identitySaving, setIdentitySaving] = useState(false);
  const [identityMsg, setIdentityMsg] = useState('');

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [pwErr, setPwErr] = useState('');

  const [hasRecoveryKey, setHasRecoveryKey] = useState<boolean | null>(null);
  const [recoveryKeyBusy, setRecoveryKeyBusy] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  // Monogram avatar — letter / bg / font are persisted server-side on the
  // User model, and the editor below saves through PATCH /api/users/me.
  // initialUser is the SSR-seeded user, so the avatar shows up immediately
  // (no client-side fetch flicker).
  const [avatarLetter, setAvatarLetter] = useState<string>((initialUser as any).avatarLetter || '');
  const [avatarBg, setAvatarBg] = useState<string>((initialUser as any).avatarBg || '');
  const [avatarFont, setAvatarFont] = useState<number>((initialUser as any).avatarFont ?? 0);
  const [showAvatarEditor, setShowAvatarEditor] = useState(false);
  // Uploaded photo (compressed client-side). Wins over the monogram everywhere.
  const [avatarImage, setAvatarImage] = useState<string>((initialUser as any).avatarImage || '');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState('');

  async function onPhotoPicked(file: File | null) {
    if (!file) return;
    setPhotoBusy(true);
    setPhotoErr('');
    try {
      const { compressAvatar } = await import('@/lib/client/compressAvatar');
      const data = await compressAvatar(file);
      await api('/users/me', { method: 'PATCH', body: { avatarImage: data } });
      setAvatarImage(data);
      router.refresh();
    } catch (e: any) {
      setPhotoErr(e.message || 'Upload failed.');
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePhoto() {
    setPhotoBusy(true);
    setPhotoErr('');
    try {
      await api('/users/me', { method: 'PATCH', body: { avatarImage: '' } });
      setAvatarImage('');
      router.refresh();
    } catch (e: any) {
      setPhotoErr(e.message || 'Could not remove the photo.');
    } finally {
      setPhotoBusy(false);
    }
  }
  const [editingProfile, setEditingProfile] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    // User data already seeded from SSR; only fetch the recovery-key status
    // (a separate resource that can't come from the JWT).
    if (initialUser.role === 'admin') {
      api('/auth/security-key')
        .then((r: any) => setHasRecoveryKey(r.hasKey))
        .catch(() => {});
    }

    // Warm the below-the-fold activity bundle + current-year data as soon as
    // the profile shell is interactive, so opening/scanning the graph does not
    // sit on an avoidable dynamic-import + API waterfall.
    const warm = () => {
      void import('@/components/ActivityGraph').then((m) => m.preloadActivityGraphData());
    };
    const w = window as any;
    const id =
      typeof w.requestIdleCallback === 'function'
        ? w.requestIdleCallback(warm, { timeout: 900 })
        : window.setTimeout(warm, 250);
    return () => {
      if (typeof w.cancelIdleCallback === 'function') w.cancelIdleCallback(id);
      else window.clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generateRecoveryKey() {
    setRecoveryKeyBusy(true);
    try {
      const r: any = await api('/auth/security-key', { method: 'POST' });
      setGeneratedKey(r.key);
      setHasRecoveryKey(true);
    } catch {
      alert('Failed to generate recovery key. Please try again.');
    } finally {
      setRecoveryKeyBusy(false);
    }
  }

  async function saveMonogram(next: { letter: string; bg: string; font: number }) {
    // Persist to the server so the avatar follows the user everywhere.
    // Update local state optimistically so the hero card refreshes
    // without waiting for a full router.refresh().
    setAvatarLetter(next.letter);
    setAvatarBg(next.bg);
    setAvatarFont(next.font);
    await api('/users/me', {
      method: 'PATCH',
      body: {
        avatarLetter: next.letter,
        avatarBg: next.bg,
        avatarFont: next.font,
      },
    });
    // Re-fetch the SSR layout so the sidebar avatar (which reads from
    // CurrentUserContext, seeded server-side) also picks up the change.
    router.refresh();
  }

  async function saveIdentity(e?: React.FormEvent) {
    e?.preventDefault();
    setIdentityMsg('');
    setIdentitySaving(true);
    try {
      // Persist the cleaned link list and clear the legacy githubUrl — `links`
      // is now the single source of truth (the public profile still folds in a
      // legacy value for rows that never re-saved).
      const cleaned = links
        .map((l) => ({ url: l.url.trim(), label: l.label.trim() }))
        .filter((l) => /^https?:\/\/[^\s]+$/i.test(l.url))
        .slice(0, 6);
      await api('/users/me', { method: 'PATCH', body: { name, links: cleaned, githubUrl: '' } });
      setLinks(cleaned);
      setIdentityMsg('Saved');
      setTimeout(() => setIdentityMsg(''), 2500);
    } catch (err: any) {
      setIdentityMsg(err.message || 'Save failed.');
    } finally {
      setIdentitySaving(false);
    }
  }

  const pwStrong =
    next.length >= 8 &&
    /[A-Z]/.test(next) &&
    /[a-z]/.test(next) &&
    /[0-9]/.test(next) &&
    /[^A-Za-z0-9]/.test(next);
  const pwMatches = next === confirm && next.length > 0;

  async function savePw(e: React.FormEvent) {
    e.preventDefault();
    setPwErr('');
    setPwMsg('');
    if (!pwStrong || !pwMatches) return;
    setPwSaving(true);
    try {
      await api('/auth/password', { method: 'PATCH', body: { currentPassword: current, newPassword: next } });
      setPwMsg('Password updated successfully.');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err: any) {
      setPwErr(err.message || 'Failed to update password.');
    } finally {
      setPwSaving(false);
    }
  }

  const isLeadOrAdmin = user.role === 'lead' || user.role === 'admin';
  const roleText = user.role === 'admin' ? 'Admin' : isLeadOrAdmin ? 'Team Lead' : 'Individual Contributor';

  return (
    <div className="max-w-5xl mx-auto pb-12 space-y-6">
      {/* ── Hero profile card (shared with the public /username view) ──── */}
      <ProfileHero
        name={user.name}
        username={user.username}
        roleText={roleText}
        employeeId={employeeId}
        title={user.title}
        department={user.department}
        location={user.location}
        organisation={user.organisation}
        linkUsername
        avatar={
          <ProfileAvatar
            name={user.name}
            letter={avatarLetter}
            bg={avatarBg}
            font={avatarFont}
            image={avatarImage}
            size={88}
            onClick={() => setShowAvatarEditor(true)}
            title="Change avatar"
          />
        }
        avatarExtra={
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-2">
              <label className="text-[10.5px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer">
                {photoBusy ? 'Uploading…' : avatarImage ? 'Change photo' : 'Upload photo'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={photoBusy}
                  onChange={(e) => {
                    onPhotoPicked(e.target.files?.[0] || null);
                    e.target.value = '';
                  }}
                />
              </label>
              {avatarImage && !photoBusy && (
                <button
                  type="button"
                  onClick={removePhoto}
                  className="text-[10.5px] font-semibold text-slate-400 hover:text-red-500 transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
            {photoErr && (
              <span className="text-[10px] text-red-500 max-w-[140px] text-center">{photoErr}</span>
            )}
          </div>
        }
        actions={
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setEditingProfile((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-white/15 bg-white dark:bg-white/[0.04] px-3 py-1.5 text-[11px] font-bold text-slate-600 dark:text-white/70 transition hover:border-blue-300 hover:text-blue-700 dark:hover:text-blue-300"
            >
              <Pencil size={12} /> {editingProfile ? 'Close' : 'Edit'}
            </button>
          </div>
        }
      />

      {/* Monogram avatar editor — letter + colour + font, with Inspire-me. */}
      {showAvatarEditor && (
        <MonogramEditor
          initial={{ letter: avatarLetter, bg: avatarBg, font: avatarFont }}
          name={user.name}
          onSave={saveMonogram}
          onClose={() => setShowAvatarEditor(false)}
        />
      )}

      {/* Inline profile editor — name + read-only fields */}
      {editingProfile && (
        <Section
          icon={User}
          title="Edit profile"
          subtitle="Your name and avatar as they appear across Pragati."
        >
          <form
            onSubmit={(e) => {
              saveIdentity(e);
            }}
            className="space-y-4"
          >
            <div className="flex items-center gap-3">
              <Avatar
                name={user.name}
                size={52}
                letter={avatarLetter}
                bg={avatarBg}
                font={avatarFont}
                image={avatarImage}
              />
              <p className="text-xs text-slate-400 dark:text-white/30">
                Tap your avatar on the profile page to change it.
              </p>
            </div>
            <Field label="Full name">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <LinksEditor links={links} setLinks={setLinks} />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <ReadonlyField label="Username" value={user.username ? `@${user.username}` : '—'} />
              <ReadonlyField label="Member ID" value={employeeId || '—'} />
              <ReadonlyField label="Role" value={roleText} />
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button type="submit" className="btn-primary" disabled={identitySaving}>
                {identitySaving ? 'Saving…' : 'Save changes'}
              </button>
              {identityMsg && <span className="text-xs text-green-600 font-medium">✓ {identityMsg}</span>}
            </div>
          </form>
        </Section>
      )}

      {/* ── Impact row — your delivery at a glance (matches the public profile) ── */}
      <SelfImpactTiles />

      {/* ── Delivery Foresight — predictive read over the heavy engine ──── */}
      <DeliveryForesight userId={user.id} isSelf />

      {/* ── Activity — the star feature, front and centre ────────────────── */}
      <div id="activity" className="scroll-mt-6">
        <Section
          icon={Activity}
          title="Activity"
          subtitle="Your delivered work on Pragati — completed tasks, weighted for on-time and priority."
        >
          <ActivityGraph />
        </Section>
      </div>

      {/* ── Install as app (PWA) ──────────────────────────────────────────── */}
      <PwaInstallSection />

      {/* ── Daily task email — personal opt-in, then (admin) workspace config ── */}
      <DailyDigestToggle initialUser={initialUser} />
      <CalendarFeedSection />
      {user.role === 'admin' && <AdminDigestSettings />}

      {/* ── Account & security — tucked behind a disclosure so the day-to-day
          view stays focused on Profile + Activity. ───────────────────────── */}
      <div className="card rounded-xl border overflow-hidden">
        <button
          type="button"
          onClick={() => setMoreOpen((o) => !o)}
          className="section-head w-full px-5 py-3.5 border-b flex items-center gap-2.5 text-left"
          aria-expanded={moreOpen}
        >
          <MoreHorizontal size={16} className="text-blue-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-slate-800">Account &amp; security</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Password, Quick PIN{user.role === 'admin' ? ', recovery key & system monitor' : ''} — hidden
              until you need them.
            </p>
          </div>
          <ChevronDown
            size={16}
            className={`text-slate-400 shrink-0 transition-transform ${moreOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {moreOpen && (
          <div className="p-5 space-y-5 fade-in-soft">
            {/* Password + Quick PIN sit side by side on wider screens — they're
                both "how you get in", so pairing them reads as one unit. */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
              <div id="security" className="scroll-mt-6">
                <Section icon={Lock} title="Security" subtitle="Change your login password.">
                  <form onSubmit={savePw} className="space-y-3.5">
                    <Field label="Current password">
                      <input
                        type="password"
                        className="input"
                        autoComplete="current-password"
                        value={current}
                        onChange={(e) => setCurrent(e.target.value)}
                        placeholder="••••••••"
                      />
                    </Field>
                    <Field label="New password">
                      <input
                        type="password"
                        className="input"
                        autoComplete="new-password"
                        value={next}
                        onChange={(e) => setNext(e.target.value)}
                        placeholder="Min 8 characters"
                      />
                      <StrengthMeter password={next} />
                    </Field>
                    <Field label="Confirm password">
                      <input
                        type="password"
                        className={`input ${confirm && !pwMatches ? 'border-red-300 focus:border-red-400' : ''}`}
                        autoComplete="new-password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        placeholder="Repeat password"
                      />
                      {confirm && !pwMatches && (
                        <p className="text-[11px] text-red-500 mt-1">Passwords don't match.</p>
                      )}
                    </Field>
                    {pwErr && (
                      <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                        {pwErr}
                      </div>
                    )}
                    {pwMsg && (
                      <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                        ✓ {pwMsg}
                      </div>
                    )}
                    <button
                      type="submit"
                      className="btn-primary w-full justify-center"
                      disabled={!current || !pwStrong || !pwMatches || pwSaving}
                    >
                      {pwSaving ? 'Updating…' : 'Update password'}
                    </button>
                  </form>
                </Section>
              </div>

              <QuickPinSection />
            </div>

            <DropSoundToggle initial={!!initialUser.soundDropEnabled} />

            {user.role === 'admin' && (
              <div id="recovery-key" className="scroll-mt-6">
                <Section
                  icon={ShieldCheck}
                  title="Recovery key"
                  subtitle="Sign in with this if you ever forget your password."
                >
                  <div className="space-y-3.5">
                    <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2.5 text-xs text-slate-500 leading-snug">
                      {hasRecoveryKey === null ? (
                        'Checking…'
                      ) : hasRecoveryKey ? (
                        <>
                          <span className="text-green-700 font-semibold">✓ Key is set.</span> Regenerate it
                          only if you think it has been exposed — the old key stops working.
                        </>
                      ) : (
                        <>
                          <span className="text-amber-700 font-semibold">No key yet.</span> Generate one and
                          keep it safe so you&rsquo;re never locked out.
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={generateRecoveryKey}
                      disabled={recoveryKeyBusy || hasRecoveryKey === null}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all"
                      style={{
                        background: hasRecoveryKey ? '#f8fafc' : '#1565C0',
                        color: hasRecoveryKey ? '#475569' : '#ffffff',
                        border: hasRecoveryKey ? '1px solid #e2e8f0' : 'none',
                        opacity: recoveryKeyBusy || hasRecoveryKey === null ? 0.6 : 1,
                      }}
                    >
                      <RefreshCw size={14} className={recoveryKeyBusy ? 'animate-spin' : ''} />
                      {recoveryKeyBusy
                        ? 'Generating…'
                        : hasRecoveryKey
                          ? 'Regenerate recovery key'
                          : 'Generate recovery key'}
                    </button>
                    <p className="text-[11px] text-slate-400 leading-snug">
                      To use it: on the login screen, enter your email and type this key in the password box.
                      You&rsquo;ll be signed in and can set a new password here.
                    </p>
                  </div>
                </Section>
              </div>
            )}

            {user.role === 'admin' && <AdminErrorMonitor />}
          </div>
        )}
      </div>

      {generatedKey && <RecoveryKeyModal keyValue={generatedKey} onClose={() => setGeneratedKey(null)} />}

      {/* View public profile — floating bottom-right anchor */}
      {user.username && (
        <a
          href={`/${user.username}`}
          className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full bg-white border border-slate-200 shadow-lg px-4 py-2.5 text-[12px] font-bold text-slate-600 hover:text-blue-600 hover:border-blue-200 hover:shadow-xl transition-all duration-150"
          title="Open your public profile"
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={13} /> View public profile
        </a>
      )}
    </div>
  );
}
