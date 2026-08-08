'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client/api';
import { PragatiMark } from '@/components/PragatiMark';
import { BirdsEyeLoader } from '@/components/BirdsEyeLoader';
import { BUILTIN_QUOTES, dailyQuoteOffset, readingMs } from '@/lib/quotes';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { AVATAR_FONTS, avatarFg } from '@/components/ui';

const QUOTES_SEEN_KEY = 'pragati_quotes_seen_v14';

function unseenQuoteIndices(count: number): number[] {
  const all = Array.from({ length: count }, (_, i) => i);
  try {
    const seen: number[] = JSON.parse(localStorage.getItem(QUOTES_SEEN_KEY) || '[]');
    const valid = new Set(seen.filter((n) => Number.isInteger(n) && n >= 0 && n < count));
    const unseen = all.filter((i) => !valid.has(i));
    if (unseen.length > 0) return unseen;
    localStorage.removeItem(QUOTES_SEEN_KEY);
    return all;
  } catch {
    return all;
  }
}

function markQuoteSeen(i: number) {
  try {
    const seen: number[] = JSON.parse(localStorage.getItem(QUOTES_SEEN_KEY) || '[]');
    if (!seen.includes(i)) localStorage.setItem(QUOTES_SEEN_KEY, JSON.stringify([...seen, i]));
  } catch {
    /* private mode */
  }
}

function pickUnseen(count: number, exclude?: number): number {
  if (count <= 0) return 0;
  const unseen = unseenQuoteIndices(count).filter((x) => x !== exclude);
  const pool =
    unseen.length > 0 ? unseen : Array.from({ length: count }, (_, x) => x).filter((x) => x !== exclude);
  if (pool.length === 0) return exclude ?? 0;
  return pool[Math.floor(Math.random() * pool.length)];
}

function RotatingQuote() {
  const [i, setI] = useState(() => dailyQuoteOffset(BUILTIN_QUOTES.length));
  const [show, setShow] = useState(true);
  useEffect(() => {
    const first = pickUnseen(BUILTIN_QUOTES.length);
    markQuoteSeen(first);
    setI(first);
  }, []);
  useEffect(() => {
    if (BUILTIN_QUOTES.length < 2) return;
    const dwell = readingMs(BUILTIN_QUOTES[i % BUILTIN_QUOTES.length]?.text || '');
    const t = setTimeout(() => {
      setShow(false);
      const next = pickUnseen(BUILTIN_QUOTES.length, i);
      markQuoteSeen(next);
      setTimeout(() => {
        setI(next);
        setShow(true);
      }, 350);
    }, dwell);
    return () => clearTimeout(t);
  }, [i]);
  const q = BUILTIN_QUOTES[i % BUILTIN_QUOTES.length];
  return (
    <div
      style={{ fontSize: 13, transition: 'opacity 0.35s ease', opacity: show ? 1 : 0, minHeight: 40 }}
      className="text-white/50 max-w-[320px] mx-auto leading-snug text-center"
    >
      “{q.text}”
    </div>
  );
}

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
        @keyframes aurora-1 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(8%, 6%) scale(1.15); } }
        @keyframes aurora-2 { 0%,100% { transform: translate(0,0) scale(1.1); } 50% { transform: translate(-7%, -5%) scale(1); } }
        @keyframes aurora-3 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(5%, -8%) scale(1.2); } }
        .aurora-1 { animation: aurora-1 16s ease-in-out infinite; }
        .aurora-2 { animation: aurora-2 20s ease-in-out infinite; }
        .aurora-3 { animation: aurora-3 24s ease-in-out infinite; }
        @keyframes pulse-ring {
          0% { transform: scale(0.92); opacity: 0.55; }
          70% { transform: scale(1.12); opacity: 0; }
          100% { opacity: 0; }
        }
        .pulse-ring { animation: pulse-ring 2.8s ease-out infinite; }
        .pulse-ring-2 { animation: pulse-ring 2.8s 0.7s ease-out infinite; }
        .pulse-ring-3 { animation: pulse-ring 2.8s 1.4s ease-out infinite; }
        @keyframes logo-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        .logo-float { animation: logo-float 4.5s ease-in-out infinite; }
        @keyframes shimmer-line-run {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .shimmer-line::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent);
          animation: shimmer-line-run 2.4s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .pin-shake, .pin-pop, .veil-bar, .aurora-1, .aurora-2, .aurora-3,
          .pulse-ring, .pulse-ring-2, .pulse-ring-3, .logo-float, .shimmer-line::after { animation: none !important; }
          .fade-up, .fade-up-1, .fade-up-2, .fade-up-3, .fade-in-soft, .form-swap, .veil-in { animation-duration: 0.01ms !important; }
        }
      `}</style>

      <div className="min-h-screen flex">
        {/* ════ LEFT — classic brand panel (blue → forest) ═══════════════ */}
        <div
          className="hidden lg:flex lg:w-[54%] flex-col relative overflow-hidden"
          style={{
            background: 'linear-gradient(160deg, #050E1D 0%, #091828 40%, #0B1F3A 70%, #0C2347 100%)',
          }}
        >
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div
              className="absolute aurora-1"
              style={{
                top: '-10%',
                left: '8%',
                width: 560,
                height: 560,
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(30,136,229,0.40) 0%, transparent 60%)',
                filter: 'blur(28px)',
              }}
            />
            <div
              className="absolute aurora-2"
              style={{
                top: '28%',
                right: '-12%',
                width: 480,
                height: 480,
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(46,125,50,0.32) 0%, transparent 62%)',
                filter: 'blur(30px)',
              }}
            />
            <div
              className="absolute aurora-3"
              style={{
                bottom: '-16%',
                left: '30%',
                width: 520,
                height: 520,
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(124,58,237,0.22) 0%, transparent 64%)',
                filter: 'blur(34px)',
              }}
            />
          </div>
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)',
              backgroundSize: '28px 28px',
            }}
          />

          <div className="relative flex flex-col flex-1 px-14 py-12">
            <div className="flex-1 flex flex-col justify-center">
              <div className="flex justify-center mb-10">
                <div className="relative logo-float" style={{ width: 112, height: 112 }}>
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      aria-hidden
                      className={i === 0 ? 'pulse-ring' : i === 1 ? 'pulse-ring-2' : 'pulse-ring-3'}
                      style={{
                        position: 'absolute',
                        inset: -18,
                        borderRadius: '32%',
                        border: '1.5px solid rgba(66,165,245,0.45)',
                        boxShadow: 'inset 0 0 18px rgba(66,165,245,0.12)',
                        pointerEvents: 'none',
                      }}
                    />
                  ))}
                  <PragatiMark size={112} />
                </div>
              </div>

              <h1
                className="fade-up-1 brand-wordmark text-center text-white"
                style={{ fontSize: 'clamp(62px, 6.2vw, 88px)' }}
              >
                Pragati
              </h1>

              <div className="fade-up-2 flex justify-center mt-5">
                <div
                  className="relative h-0.5 w-20 rounded-full overflow-hidden shimmer-line"
                  style={{ background: 'linear-gradient(90deg, #1769C8, #43A047)' }}
                />
              </div>

              <p
                className="fade-up-2 text-center text-white/55 mt-5 leading-relaxed mx-auto"
                style={{ fontSize: 14, maxWidth: 320 }}
              >
                A bird&apos;s-eye view of every project,
                <br />
                every action, every contributor.
              </p>
            </div>

            <div className="text-center pb-2 fade-up-3">
              <RotatingQuote />
            </div>
          </div>
        </div>

        {/* ════ RIGHT — Form panel ═══════════════════════════════════════ */}
        <div className="flex-1 flex flex-col justify-center items-center px-6 py-12 relative bg-white">
          <div className="absolute inset-0 lg:hidden profile-hero-shimmer opacity-90" />
          <div
            className="absolute top-0 left-0 right-0 h-[3px]"
            style={{ background: 'linear-gradient(90deg, #1565C0 0%, #1769C8 50%, #2B8C29 100%)' }}
          />

          <div className="w-full max-w-[340px] fade-up relative">
            <div className="flex flex-col items-center mb-8 lg:hidden">
              <div
                className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center mb-1"
                style={{ boxShadow: '0 8px 24px rgba(15,23,42,0.3)' }}
              >
                <PragatiMark size={44} />
              </div>
              <div className="brand-wordmark text-[2rem] text-white mt-3 drop-shadow">Pragati</div>
              <div className="text-sm text-white/70 mt-1">The view from above</div>
              <div className="mt-4 w-full max-w-[300px] bg-white/95 rounded-xl px-3 py-2.5 shadow-lg">
                <RotatingQuote />
              </div>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-2xl lg:p-0 lg:rounded-none lg:bg-transparent lg:shadow-none">
              {/* Deactivated-account notice */}
              {notice && (
                <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-2.5 fade-in-soft">
                  <span className="text-red-500 font-bold shrink-0 mt-0.5 text-sm">!</span>
                  <div className="text-sm text-red-800 leading-snug">{notice}</div>
                </div>
              )}

              {dbDown && (
                <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 fade-in-soft">
                  <div className="text-sm text-amber-800 leading-snug">
                    <strong>Can&apos;t reach the database.</strong> Sign-in won&apos;t work until it&apos;s back.
                  </div>
                  <div className="text-[12px] text-amber-700/90 leading-snug mt-1.5">
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
                        <div className="rounded-full p-[2px] bg-white">
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
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-1.5 fade-up-1">
                      Welcome back
                    </p>
                    <h2 className="font-display text-[26px] font-bold text-slate-900 tracking-tight leading-none fade-up-1">
                      {deviceName || 'You'}
                    </h2>
                    <p className="text-[13px] text-slate-500 mt-2 leading-snug fade-up-2">
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
                          borderRadius: 12,
                          border: `1px solid ${
                            unlocked
                              ? '#16a34a'
                              : shake
                                ? '#ef4444'
                                : pin.length === i
                                  ? '#1565C0'
                                  : pin.length > i
                                    ? '#536471'
                                    : '#e2e8f0'
                          }`,
                          background: unlocked
                            ? 'rgba(34,197,94,0.1)'
                            : shake
                              ? 'rgba(239,68,68,0.1)'
                              : pin.length > i
                                ? 'rgba(255,255,255,0.08)'
                                : '#ffffff',
                          boxShadow:
                            !unlocked && !shake && pin.length === i
                              ? '0 0 0 3px rgba(21,101,192,0.18)'
                              : 'none',
                        }}
                      >
                        {pin.length > i && (
                          <div
                            className={`w-2.5 h-2.5 rounded-full ${unlocked ? 'bg-green-600 pin-pop' : 'bg-blue-600'}`}
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
                      <span className="h-px flex-1 bg-slate-200" />
                      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                        or
                      </span>
                      <span className="h-px flex-1 bg-slate-200" />
                    </div>
                    <button
                      onClick={usePasswordInstead}
                      type="button"
                      className="w-full py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50 transition-colors"
                      style={{ borderRadius: 12 }}
                    >
                      Use password / switch account
                    </button>
                  </div>
                </div>
              )}

              {/* Heading */}
              {mode !== 'unlock' && (
                <div className="mb-8 form-swap" key={mode + '-h'}>
                  <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                    {mode === 'login' ? 'Sign in' : 'Set up workspace'}
                  </h2>
                  <p className="text-sm text-slate-500 mt-1.5 leading-snug">
                    {mode === 'login' ? 'Enter credentials to continue.' : 'Create the first lead account.'}
                  </p>
                </div>
              )}

              {mode !== 'unlock' && (
                <form onSubmit={submit} className="space-y-4 form-swap" key={mode + '-f'}>
                  {mode === 'setup' && (
                    <>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.14em] mb-1.5">
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
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.14em] mb-1.5">
                          Job title <span className="normal-case font-normal text-slate-400">(optional)</span>
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
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.14em] mb-1.5">
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
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.14em] mb-1.5">
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
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors"
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
                      className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 leading-snug flex items-start gap-2 fade-in-soft"
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
                          className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
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
                    <p className="text-sm text-slate-500">
                      Already have an account?{' '}
                      <button
                        onClick={() => {
                          setMode('login');
                          setErr('');
                        }}
                        className="text-[#1565C0] font-semibold hover:underline"
                      >
                        Sign in
                      </button>
                    </p>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowForgot((v) => !v)}
                        className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2 transition-colors"
                      >
                        Forgot your password?
                      </button>
                      {showForgot && (
                        <div
                          className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left fade-in-soft"
                        >
                          <p className="text-[12px] text-slate-600 leading-snug">
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
          <div className="mt-8 w-36 h-px overflow-hidden bg-slate-200 fade-up-3">
            <div className="h-full w-1/2 veil-bar bg-white" />
          </div>
        </div>
      )}
    </>
  );
}
