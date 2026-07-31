'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client/api';
import { PragatiMark } from '@/components/PragatiMark';
import { BirdsEyeLoader } from '@/components/BirdsEyeLoader';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { AVATAR_FONTS, avatarFg } from '@/components/ui';

function getInitials(name: string) {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function StrengthMeter({ password }: { password: string }) {
  const checks = [
    { label: '8+ chars', ok: password.length >= 8 },
    { label: 'A–Z', ok: /[A-Z]/.test(password) },
    { label: 'a–z', ok: /[a-z]/.test(password) },
    { label: '0–9', ok: /[0-9]/.test(password) },
    { label: '#!@', ok: /[^A-Za-z0-9]/.test(password) },
  ];
  const score = checks.filter((c) => c.ok).length;
  const barColor = score <= 2 ? '#EF4444' : score <= 3 ? '#F59E0B' : '#43A047';
  const labels = ['', 'Very weak', 'Weak', 'Okay', 'Strong', 'Excellent'];
  if (!password) return null;
  return (
    <div className="mt-2 space-y-1.5 fade-in-soft">
      <div className="flex items-center gap-2">
        <div className="flex gap-0.5 flex-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-sm transition-all duration-300"
              style={{ background: i <= score ? barColor : 'rgba(255,255,255,0.12)' }}
            />
          ))}
        </div>
        <span
          style={{ fontSize: 10, color: barColor }}
          className="font-semibold tabular-nums w-[64px] text-right"
        >
          {labels[score]}
        </span>
      </div>
      <div className="flex gap-3 flex-wrap">
        {checks.map((c) => (
          <span
            key={c.label}
            style={{ fontSize: 10 }}
            className={`transition-colors ${c.ok ? 'text-white/70 font-medium' : 'text-white/20'}`}
          >
            {c.ok ? '✓' : '·'} {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'setup' | 'unlock'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [notice, setNotice] = useState('');
  const [showForgot, setShowForgot] = useState(false);
  // Database unreachable — surfaced as a quiet banner instead of failing
  // silently. This is the #1 fresh-self-host stumble (Atlas network access /
  // a bad MONGODB_URI): without it, an empty-but-unreachable workspace shows
  // a normal Sign in that can never succeed, and no clue why.
  const [dbDown, setDbDown] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('reason') === 'deactivated') {
      setNotice('Your account has been deactivated. Please contact your administrator.');
    }
  }, []);

  // Quick-PIN unlock: auto-redirected to PIN pad for trusted devices that have
  // a PIN set — so returning users land directly on the PIN screen.
  const [deviceName, setDeviceName] = useState('');
  // Monogram avatar for the trusted device, so the greeting matches the
  // avatar the user picked in settings rather than plain initials.
  const [deviceAvatar, setDeviceAvatar] = useState<{
    letter: string;
    bg: string;
    font: number;
    image: string;
  }>({
    letter: '',
    bg: '',
    font: 0,
    image: '',
  });
  const [pin, setPin] = useState('');
  // Wrong-PIN shake + success takeover. `unlocked` swaps the PIN pad for a
  // full-screen welcome veil that stays up while the dashboard route loads,
  // so the post-PIN moment reads as one continuous transition instead of
  // "boxes → blank → skeleton".
  const [shake, setShake] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const pinInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // On a brand-new (empty) workspace, drop straight into setup so the first
    // lead account can be created — no banner needed. A failed status call
    // never flips us into setup (an org's login must not degrade into
    // "create account" during a DB blip) — instead it raises the db-down
    // banner so a fresh self-hoster knows exactly what to fix.
    api<{ initialized: boolean }>('/system/status')
      .then((d) => {
        setDbDown(false);
        if (!d.initialized) setMode('setup');
      })
      .catch(() => setDbDown(true));
    // Auto-switch to PIN pad for trusted devices — no opt-in button needed.
    api<{
      trusted: boolean;
      name?: string;
      hasPin?: boolean;
      locked?: boolean;
      avatarLetter?: string;
      avatarBg?: string;
      avatarFont?: number;
      avatarImage?: string;
    }>('/auth/device')
      .then((d) => {
        if (d.trusted && d.hasPin && !d.locked) {
          setDeviceName(d.name || '');
          setDeviceAvatar({
            letter: d.avatarLetter || '',
            bg: d.avatarBg || '',
            font: d.avatarFont ?? 0,
            image: d.avatarImage || '',
          });
          setMode('unlock');
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (mode !== 'unlock') return;
    const t = setTimeout(() => pinInputRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (loading) return;
      if (/^\d$/.test(e.key)) {
        e.preventDefault();
        appendPin(e.key);
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        setPin((p) => p.slice(0, -1));
        setErr('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [mode, loading, pin]);

  function usePasswordInstead() {
    setMode('login');
    setErr('');
    setPin('');
  }

  function appendPin(digit: string) {
    setErr('');
    setPin((current) => {
      const next = (current + digit).replace(/\D/g, '').slice(0, 4);
      if (next.length === 4) unlock(next);
      return next;
    });
  }

  async function unlock(pinValue: string) {
    setErr('');
    setLoading(true);
    try {
      await api('/auth/unlock', { method: 'POST', body: { pin: pinValue } });
      // Success: flash the boxes green, then raise the welcome veil and
      // navigate underneath it. `replace` triggers a soft client-side
      // navigation; the dashboard route re-renders with the freshly-set auth
      // cookie. We *don't* call `router.refresh()` here — it triggers a hard
      // re-render of every server tree which made the post-PIN wait feel
      // sluggish (1–2s of visual blank). The veil (and then the dashboard's
      // skeleton) covers the swap.
      setUnlocked(true);
      setTimeout(() => router.replace('/'), 450);
    } catch (e: any) {
      setPin('');
      setShake(true);
      setTimeout(() => setShake(false), 500);
      if (e?.data?.needPassword || /password/i.test(e?.message || '')) {
        setErr(e.message || 'Please sign in with your password.');
        setMode('login');
      } else {
        setErr(e.message || 'Incorrect PIN.');
      }
      setLoading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      if (mode === 'login') {
        // `identifier` accepts either a username or an email — backend
        // routes the lookup based on whether it contains an "@".
        await api('/auth/login', { method: 'POST', body: { identifier: email, password } });
      } else {
        await api('/auth/register', { method: 'POST', body: { email, password, name, title } });
      }
      router.replace('/');
      router.refresh();
      // Keep loading=true — component unmounts during navigation.
      // Resetting here causes the button to briefly reappear before the
      // dashboard finishes loading, making users think the sign-in failed.
    } catch (e: any) {
      setErr(e.message || 'Something went wrong.');
      setLoading(false);
    }
  }

  return (
    <>
      <style>{`
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fade-in-soft {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .fade-up       { animation: fade-up 0.35s ease-out forwards; }
        .fade-up-1     { animation: fade-up 0.35s 0.05s ease-out both; }
        .fade-up-2     { animation: fade-up 0.35s 0.1s ease-out both; }
        .fade-up-3     { animation: fade-up 0.35s 0.15s ease-out both; }
        .fade-in-soft  { animation: fade-in-soft 0.2s ease-out both; }
        .form-swap     { animation: fade-in-soft 0.18s ease-out both; }
        @keyframes pin-shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(5px); }
          60% { transform: translateX(-3px); }
          80% { transform: translateX(2px); }
        }
        .pin-shake { animation: pin-shake 0.4s ease-in-out; }
        @keyframes pin-pop {
          0% { transform: scale(1); }
          45% { transform: scale(1.25); }
          100% { transform: scale(1); }
        }
        .pin-pop { animation: pin-pop 0.25s ease-out; }
        @keyframes veil-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .veil-in { animation: veil-in 0.2s ease-out both; }
        @keyframes veil-bar {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(250%); }
        }
        .veil-bar { animation: veil-bar 0.9s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .pin-shake, .pin-pop, .veil-bar { animation: none !important; }
          .fade-up, .fade-up-1, .fade-up-2, .fade-up-3, .fade-in-soft, .form-swap, .veil-in { animation-duration: 0.01ms !important; }
        }
      `}</style>

      <div className="min-h-screen flex bg-black">
        {/* ════ LEFT — pure black brand panel ════════════════════════════ */}
        <div className="hidden lg:flex lg:w-1/2 flex-col relative overflow-hidden bg-black border-r border-white/10">
          <div
            className="absolute inset-0 pointer-events-none opacity-40"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
              backgroundSize: '48px 48px',
            }}
          />

          <div className="relative flex flex-col flex-1 px-14 py-12">
            <div className="flex-1 flex flex-col justify-center">
              <div className="flex justify-center mb-10">
                <PragatiMark size={88} />
              </div>

              <h1
                className="fade-up-1 brand-wordmark text-center text-white"
                style={{ fontSize: 'clamp(56px, 5.5vw, 80px)' }}
              >
                Pragati
              </h1>

              <div className="fade-up-2 flex justify-center mt-6">
                <div className="h-px w-12 bg-white/25" />
              </div>

              <p
                className="fade-up-2 text-center text-white/35 mt-6 leading-relaxed mx-auto tracking-wide"
                style={{ fontSize: 13, maxWidth: 280 }}
              >
                Work visible to the whole team.
              </p>
            </div>

            <div className="text-center pb-2 fade-up-3">
              <p className="text-[11px] text-white/25 tracking-[0.16em] uppercase font-semibold">
                Sign in to continue
              </p>
            </div>
          </div>
        </div>

        {/* ════ RIGHT — Form panel ═══════════════════════════════════════ */}
        <div className="flex-1 flex flex-col justify-center items-center px-6 py-12 relative bg-black lg:bg-black">
          <div className="w-full max-w-[340px] fade-up relative">
            <div className="flex flex-col items-center mb-10 lg:hidden">
              <PragatiMark size={48} />
              <div className="brand-wordmark text-[1.75rem] text-white mt-4">Pragati</div>
              <div className="text-xs text-white/40 mt-1 tracking-wide">The whole board</div>
            </div>

            <div className="p-0">
              {/* Deactivated-account notice */}
              {notice && (
                <div
                  className="mb-5 border border-red-500/30 bg-red-500/10 px-4 py-3 flex items-start gap-2.5 fade-in-soft"
                  style={{ borderRadius: 4 }}
                >
                  <span className="text-red-400 font-bold shrink-0 mt-0.5 text-sm">!</span>
                  <div className="text-sm text-red-200 leading-snug">{notice}</div>
                </div>
              )}

              {dbDown && (
                <div
                  className="mb-5 border border-amber-500/30 bg-amber-500/10 px-4 py-3 fade-in-soft"
                  style={{ borderRadius: 4 }}
                >
                  <div className="text-sm text-amber-200 leading-snug">
                    <strong>Can’t reach the database.</strong> Sign-in won’t work until it’s back.
                  </div>
                  <div className="text-[12px] text-amber-200/70 leading-snug mt-1.5">
                    Check <code className="font-mono">MONGODB_URI</code> and Atlas Network Access, then
                    redeploy. <code className="font-mono">/api/health</code> →{' '}
                    <code className="font-mono">ok</code> when fixed.
                  </div>
                </div>
              )}

              {/* ── Quick-PIN unlock (trusted device) ─────────────────────── */}
              {mode === 'unlock' && (
                <div className="form-swap" key="unlock">
                  {/* Avatar + name — two concentric rings rotate slowly around the
                    avatar (the returning-user echo of the brand mark's orbit),
                    with a soft breathing halo, so re-entry feels alive. */}
                  <div className="flex flex-col items-center text-center mb-7">
                    <div className="relative mb-5 grid place-items-center">
                      <div
                        className="relative rounded-full p-[1px]"
                        style={{ background: 'rgba(255,255,255,0.2)' }}
                      >
                        <div className="rounded-full p-[2px] bg-black">
                          {deviceAvatar.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={deviceAvatar.image}
                              alt=""
                              className="block w-20 h-20 rounded-full object-cover"
                            />
                          ) : (
                            <div
                              className="w-20 h-20 rounded-full flex items-center justify-center text-2xl select-none"
                              style={{
                                background: deviceAvatar.bg || '#18181b',
                                color: deviceAvatar.bg ? avatarFg(deviceAvatar.bg) : '#ffffff',
                                fontFamily: (AVATAR_FONTS[deviceAvatar.font] || AVATAR_FONTS[0]).family,
                                fontWeight: (AVATAR_FONTS[deviceAvatar.font] || AVATAR_FONTS[0]).weight,
                              }}
                            >
                              {(deviceAvatar.letter || getInitials(deviceName)).slice(0, 2).toUpperCase()}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] mb-1.5 fade-up-1">
                      Welcome back
                    </p>
                    <h2 className="font-display text-[26px] font-black text-white tracking-tight leading-none fade-up-1">
                      {deviceName || 'You'}
                    </h2>
                    <p className="text-[13px] text-white/40 mt-2 leading-snug fade-up-2">
                      Enter your PIN
                    </p>
                  </div>

                  {/* 4-box PIN input — keyboard plus touch keypad, so it works on every device.
                    The row shakes on a wrong PIN and the dots pop green on success. */}
                  <div
                    className={`relative flex justify-center gap-3 mb-4 cursor-text ${shake ? 'pin-shake' : ''}`}
                    onClick={() => pinInputRef.current?.focus()}
                  >
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="w-[52px] h-[58px] flex items-center justify-center transition-all duration-150"
                        style={{
                          borderRadius: 4,
                          border: `1px solid ${
                            unlocked
                              ? '#22c55e'
                              : shake
                                ? '#ef4444'
                                : pin.length === i
                                  ? '#ffffff'
                                  : pin.length > i
                                    ? 'rgba(255,255,255,0.35)'
                                    : 'rgba(255,255,255,0.14)'
                          }`,
                          background: unlocked
                            ? 'rgba(34,197,94,0.1)'
                            : shake
                              ? 'rgba(239,68,68,0.1)'
                              : pin.length > i
                                ? 'rgba(255,255,255,0.08)'
                                : '#0a0a0a',
                          boxShadow:
                            !unlocked && !shake && pin.length === i
                              ? '0 0 0 2px rgba(255,255,255,0.12)'
                              : 'none',
                        }}
                      >
                        {pin.length > i && (
                          <div
                            className={`w-2.5 h-2.5 rounded-full ${unlocked ? 'bg-green-500 pin-pop' : 'bg-white'}`}
                          />
                        )}
                      </div>
                    ))}

                    {/* Invisible input layered over the boxes — captures all keystrokes */}
                    <input
                      ref={pinInputRef}
                      autoFocus
                      type="text"
                      inputMode="numeric"
                      pattern="\d*"
                      maxLength={4}
                      value={pin}
                      disabled={loading}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                        setPin(v);
                        setErr('');
                        if (v.length === 4) unlock(v);
                      }}
                      className="absolute inset-0 opacity-0 w-full h-full cursor-text"
                      style={{ color: 'transparent', caretColor: 'transparent' }}
                      aria-label="Quick PIN"
                    />
                  </div>

                  {/* Keypad removed by design — just type the PIN. The 4-box
                    indicator above lights up as digits are entered and the
                    form auto-submits on the 4th character. */}

                  {err && (
                    <div
                      role="alert"
                      aria-live="assertive"
                      className="mt-1 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 leading-snug flex items-start gap-2 fade-in-soft"
                    >
                      <span aria-hidden="true" className="font-bold leading-none mt-0.5">
                        !
                      </span>
                      <span>{err}</span>
                    </div>
                  )}

                  {loading && !unlocked && (
                    <div className="mt-2 fade-in-soft">
                      <BirdsEyeLoader size="sm" inline label="Signing in…" sublabel="" />
                    </div>
                  )}

                  <div className="mt-6 flex flex-col items-center gap-2">
                    <div className="flex items-center gap-2 w-full">
                      <span className="h-px flex-1 bg-white/10" />
                      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">
                        or
                      </span>
                      <span className="h-px flex-1 bg-white/10" />
                    </div>
                    <button
                      onClick={usePasswordInstead}
                      type="button"
                      className="w-full py-2.5 text-sm font-semibold text-white/60 hover:text-white border border-white/15 hover:border-white/30 hover:bg-white/[0.04] transition-colors"
                      style={{ borderRadius: 4 }}
                    >
                      Use password / switch account
                    </button>
                  </div>
                </div>
              )}

              {/* Heading */}
              {mode !== 'unlock' && (
                <div className="mb-8 form-swap" key={mode + '-h'}>
                  <h2 className="text-2xl font-black text-white tracking-tight">
                    {mode === 'login' ? 'Sign in' : 'Set up workspace'}
                  </h2>
                  <p className="text-sm text-white/40 mt-1.5 leading-snug">
                    {mode === 'login' ? 'Enter credentials to continue.' : 'Create the first lead account.'}
                  </p>
                </div>
              )}

              {mode !== 'unlock' && (
                <form onSubmit={submit} className="space-y-4 form-swap" key={mode + '-f'}>
                  {mode === 'setup' && (
                    <>
                      <div>
                        <label className="block text-[10px] font-bold text-white/40 uppercase tracking-[0.14em] mb-1.5">
                          Full name
                        </label>
                        <input
                          className="input"
                          placeholder="Your name"
                          required
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-white/40 uppercase tracking-[0.14em] mb-1.5">
                          Job title <span className="normal-case font-normal text-white/25">(optional)</span>
                        </label>
                        <input
                          className="input"
                          placeholder="e.g. Team Lead"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                        />
                      </div>
                    </>
                  )}

                  <div>
                    <label className="block text-[10px] font-bold text-white/40 uppercase tracking-[0.14em] mb-1.5">
                      {mode === 'login' ? 'Username' : 'Email'}
                    </label>
                    <input
                      className="input"
                      type={mode === 'login' ? 'text' : 'email'}
                      placeholder={mode === 'login' ? 'username or employee ID' : 'you@company.com'}
                      required
                      autoComplete={mode === 'login' ? 'username' : 'email'}
                      spellCheck={false}
                      autoCapitalize="none"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-white/40 uppercase tracking-[0.14em] mb-1.5">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        className="input pr-10"
                        type={showPw ? 'text' : 'password'}
                        required
                        minLength={mode === 'setup' ? 8 : 1}
                        placeholder={mode === 'setup' ? 'Min 8 characters' : '••••••••'}
                        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        style={{ WebkitAppearance: 'none' } as React.CSSProperties}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPw((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/35 hover:text-white/70 transition-colors"
                        tabIndex={-1}
                        aria-label={showPw ? 'Hide password' : 'Show password'}
                      >
                        {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                    {mode === 'setup' && <StrengthMeter password={password} />}
                  </div>

                  {err && (
                    <div
                      role="alert"
                      aria-live="assertive"
                      className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 px-3 py-2.5 leading-snug flex items-start gap-2 fade-in-soft"
                      style={{ borderRadius: 4 }}
                    >
                      <span aria-hidden="true" className="font-bold leading-none mt-0.5">
                        !
                      </span>
                      <span>{err}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    aria-busy={loading}
                    className="btn-primary w-full justify-center py-3 text-sm font-bold group mt-1"
                  >
                    {loading ? (
                      <>
                        <span
                          className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin"
                          aria-hidden="true"
                        />
                        <span>{mode === 'login' ? 'Signing in…' : 'Creating workspace…'}</span>
                      </>
                    ) : (
                      <>
                        {mode === 'login' ? 'Sign in' : 'Create workspace'}
                        <ArrowRight size={15} aria-hidden="true" />
                      </>
                    )}
                  </button>
                </form>
              )}

              {mode !== 'unlock' && (
                <div className="mt-6 text-center">
                  {mode === 'setup' ? (
                    <p className="text-sm text-white/40">
                      Already have an account?{' '}
                      <button
                        onClick={() => {
                          setMode('login');
                          setErr('');
                        }}
                        className="text-white font-semibold hover:underline"
                      >
                        Sign in
                      </button>
                    </p>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowForgot((v) => !v)}
                        className="text-xs text-white/35 hover:text-white/70 underline underline-offset-2 transition-colors"
                      >
                        Forgot your password?
                      </button>
                      {showForgot && (
                        <div
                          className="mt-3 border border-white/10 bg-white/[0.04] px-4 py-3 text-left fade-in-soft"
                          style={{ borderRadius: 4 }}
                        >
                          <p className="text-[12px] text-white/55 leading-snug">
                            Contact your administrator to reset your password.
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Post-unlock welcome veil ─────────────────────────────────────
          Raised the instant the PIN verifies and held while the dashboard
          route loads underneath, so unlocking reads as one continuous
          motion: dots pop green → veil rises → workspace appears. */}
      {unlocked && (
        <div
          className="fixed inset-0 z-[80] veil-in flex flex-col items-center justify-center bg-black"
          aria-live="polite"
        >
          <PragatiMark size={56} />
          <div className="font-display text-2xl font-black text-white tracking-tight mt-8 fade-up-1">
            Welcome back{deviceName ? `, ${deviceName.split(/\s+/)[0]}` : ''}
          </div>
          <div className="text-[13px] text-white/40 mt-2 fade-up-2">Loading workspace…</div>
          <div className="mt-8 w-36 h-px overflow-hidden bg-white/10 fade-up-3">
            <div className="h-full w-1/2 veil-bar bg-white" />
          </div>
        </div>
      )}
    </>
  );
}
