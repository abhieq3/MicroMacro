'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client/api';
import { PragatiMark } from '@/components/PragatiMark';
import { BirdsEyeLoader } from '@/components/BirdsEyeLoader';
import { BUILTIN_QUOTES, dailyQuoteOffset, readingMs } from '@/lib/quotes';
import { ArrowRight, Sparkles, Eye, EyeOff } from 'lucide-react';
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

/* Rotating, unattributed wisdom — Jensen Huang, drawn from his keynotes,
   interviews, and commencement addresses (Stanford GSB, Caltech, NTU),
   curated to what Pragati is for: doing the work — mission first, resilience,
   urgency, ownership, intellectual honesty, first principles, craft.
   No name is ever shown, only the line. Never repeats on a device until the
   whole library has been shown (see unseenQuoteIndices / pickUnseen below). See
   src/lib/quotes.ts for the sourcing rules. */

// Bumped when the library is re-curated (the ledger is positional, so a fresh
// key avoids old indices pre-marking different lines): v2 = Elon→Naval pool,
// v3 = Bezos + his reading list, v4 = Elon Musk + the books he recommends,
// v5 = Naval Ravikant + the thinkers and books he champions,
// v6 = Elon Musk + the books, authors, and leaders he admires,
// v7 = Jensen Huang, v8 = Sundar Pichai + the books he recommends,
// v9 = Jensen Huang only.
const QUOTES_SEEN_KEY = 'pragati_quotes_seen_v9';

/** Indices not yet shown on this device; resets only once the whole set is
 *  exhausted. Takes the library size so a re-curation of the list stays in
 *  bounds. */
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
    /* private mode — quotes simply rotate without the ledger */
  }
}

/** A random index this device hasn't shown yet (never `exclude`). Only once
 *  every quote has been shown does the ledger reset and a fresh full pass
 *  begin — the single point at which any line can recur, and never two in a
 *  row. So no quote repeats until all the others have had their turn. */
function pickUnseen(count: number, exclude?: number): number {
  if (count <= 0) return 0;
  const unseen = unseenQuoteIndices(count).filter((x) => x !== exclude);
  const pool =
    unseen.length > 0 ? unseen : Array.from({ length: count }, (_, x) => x).filter((x) => x !== exclude);
  if (pool.length === 0) return exclude ?? 0;
  return pool[Math.floor(Math.random() * pool.length)];
}

function RotatingQuote() {
  // Deterministic seed only so server and first client render match (no
  // localStorage on the server); the mount effect immediately advances off it
  // to a genuinely-unseen line, so revisiting the page never re-opens on the
  // same quote.
  const [i, setI] = useState(() => dailyQuoteOffset(BUILTIN_QUOTES.length));
  const [show, setShow] = useState(true);

  // First real pick: leave the deterministic seed for an unseen line and record
  // it. This is what kills the "same quote every visit" repeat — the old code
  // re-seeded to the daily offset on every load and never marked it seen.
  useEffect(() => {
    const first = pickUnseen(BUILTIN_QUOTES.length);
    markQuoteSeen(first);
    setI(first);
  }, []);

  // Self-scheduling rotation: each quote stays up for its own reading time
  // (proportional to length), so a long line isn't cut off and a short one
  // doesn't linger. Re-runs after every advance to size the next dwell.
  useEffect(() => {
    if (BUILTIN_QUOTES.length < 2) return;
    const dwell = readingMs(BUILTIN_QUOTES[i % BUILTIN_QUOTES.length]?.text || '');
    const t = setTimeout(() => {
      setShow(false);
      // Compute + record the next line outside the state updater (no side
      // effects in a reducer): an unseen index, never the current one.
      const next = pickUnseen(BUILTIN_QUOTES.length, i);
      markQuoteSeen(next);
      setTimeout(() => {
        setI(next);
        setShow(true);
      }, 400);
    }, dwell);
    return () => clearTimeout(t);
  }, [i]);

  const q = BUILTIN_QUOTES[i % BUILTIN_QUOTES.length];
  return (
    <div
      style={{
        fontSize: 12,
        transition: 'opacity 0.4s ease',
        opacity: show ? 1 : 0,
        minHeight: 30,
      }}
      className="text-white/40 tracking-wide max-w-[320px] mx-auto leading-snug"
    >
      <span style={{ fontStyle: 'italic' }}>“{q.text}”</span>
    </div>
  );
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
              style={{ background: i <= score ? barColor : '#E2E8F0' }}
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
            className={`transition-colors ${c.ok ? 'text-forest-600 font-medium' : 'text-slate-300'}`}
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
        @keyframes glow-pulse {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50%      { opacity: 0.85; transform: scale(1.08); }
        }
        @keyframes logo-float {
          0%, 100% { transform: translateY(0px); }
          50%      { transform: translateY(-8px); }
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fade-in-soft {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer-line {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        /* Rising-chevron echo: a soft, expanding ring that breathes outward
           from the logo's centre. Echoes the *meaning* of the chevrons
           (forward / upward motion) rather than the previous two dots circling
           the mark, which read as decorative noise. Two staggered rings keep
           the motion sustained without being busy. */
        @keyframes pulse-ring {
          0%   { transform: scale(0.65); opacity: 0.55; }
          70%  { opacity: 0.04; }
          100% { transform: scale(1.55); opacity: 0; }
        }
        .logo-float    { animation: logo-float 5.5s ease-in-out infinite; }
        .fade-up       { animation: fade-up 0.55s ease-out forwards; }
        .fade-up-1     { animation: fade-up 0.55s 0.10s ease-out both; }
        .fade-up-2     { animation: fade-up 0.55s 0.20s ease-out both; }
        .fade-up-3     { animation: fade-up 0.55s 0.32s ease-out both; }
        .fade-in-soft  { animation: fade-in-soft 0.35s ease-out both; }
        .form-swap     { animation: fade-in-soft 0.32s ease-out both; }
        .shimmer-line::after {
          content: '';
          position: absolute; inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent);
          animation: shimmer-line 2.6s ease-in-out infinite;
        }
        .pulse-ring    { animation: pulse-ring 3.6s ease-out infinite; }
        .pulse-ring-2  { animation: pulse-ring 3.6s 1.2s ease-out infinite; }
        .pulse-ring-3  { animation: pulse-ring 3.6s 2.4s ease-out infinite; }
        /* Returning-user orbit rings around the PIN avatar. */
        @keyframes spin-cw  { to { transform: rotate(360deg); } }
        @keyframes spin-ccw { to { transform: rotate(-360deg); } }
        .pin-orbit-a { animation: spin-cw 22s linear infinite; }
        .pin-orbit-b { animation: spin-ccw 16s linear infinite; }
        /* Wrong-PIN feedback: one decisive horizontal shake of the box row —
           the universal "nope" gesture — instead of only a red message below. */
        @keyframes pin-shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-7px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(3px); }
        }
        .pin-shake { animation: pin-shake 0.45s ease-in-out; }
        /* Correct-PIN feedback: dots pop green before the welcome veil rises. */
        @keyframes pin-pop {
          0% { transform: scale(1); }
          45% { transform: scale(1.35); }
          100% { transform: scale(1); }
        }
        .pin-pop { animation: pin-pop 0.3s ease-out; }
        /* Post-unlock welcome veil — fades up over everything and holds while
           the dashboard loads behind it. */
        @keyframes veil-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .veil-in { animation: veil-in 0.35s ease-out both; }
        @keyframes veil-bar {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(250%); }
        }
        .veil-bar { animation: veil-bar 1.1s ease-in-out infinite; }
        /* Aurora — three large, slow-drifting colour blobs behind the brand
           panel. Gives the login a living, premium backdrop without the busy
           orbiting dots. GPU-friendly (transform + opacity only). */
        @keyframes aurora-1 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(8%, 6%) scale(1.15); } }
        @keyframes aurora-2 { 0%,100% { transform: translate(0,0) scale(1.1); } 50% { transform: translate(-7%, -5%) scale(1); } }
        @keyframes aurora-3 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(5%, -8%) scale(1.2); } }
        .aurora-1 { animation: aurora-1 16s ease-in-out infinite; }
        .aurora-2 { animation: aurora-2 20s ease-in-out infinite; }
        .aurora-3 { animation: aurora-3 24s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .logo-float, .pulse-ring, .pulse-ring-2, .pulse-ring-3, .shimmer-line::after,
          .pin-orbit-a, .pin-orbit-b, .aurora-1, .aurora-2, .aurora-3,
          .pin-shake, .pin-pop, .veil-bar { animation: none !important; }
          .fade-up, .fade-up-1, .fade-up-2, .fade-up-3, .fade-in-soft, .form-swap, .veil-in { animation-duration: 0.01ms !important; }
        }
      `}</style>

      <div className="min-h-screen flex">
        {/* ════ LEFT — Pragati brand panel ═══════════════════════════════ */}
        <div
          className="hidden lg:flex lg:w-[54%] flex-col relative overflow-hidden"
          style={{
            background: 'linear-gradient(160deg, #050E1D 0%, #091828 40%, #0B1F3A 70%, #0C2347 100%)',
          }}
        >
          {/* Aurora — three slow-drifting colour blobs give the panel a living,
              premium backdrop. Blurred + blended so they read as soft light. */}
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

          {/* Dot grid texture (above the aurora, very faint) */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)',
              backgroundSize: '28px 28px',
            }}
          />

          <div className="relative flex flex-col flex-1 px-14 py-12">
            <div className="flex-1 flex flex-col justify-center">
              {/* Pragati mark with three staggered, expanding rings —
                  reads as outward / forward motion, the literal meaning of
                  "pragati". Replaced the two orbiting dots that were
                  reported as visually noisy and unrelated to the brand
                  narrative. The rings stay behind the mark so they read
                  as a soft halo, never crossing the logo itself. */}
              <div className="flex justify-center mb-10">
                <div className="relative logo-float" style={{ width: 112, height: 112 }}>
                  {/* Three staggered rings echo the rising-chevron motion. */}
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

              {/* Wordmark */}
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
                A bird's-eye view of every project,
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
        <div
          className="flex-1 flex flex-col justify-center items-center px-6 py-12 relative
          bg-white lg:bg-white"
        >
          {/* Mobile shimmer background — only visible on small screens where the
              left brand panel is hidden */}
          <div className="absolute inset-0 lg:hidden profile-hero-shimmer opacity-90" />
          <div
            className="absolute top-0 left-0 right-0 h-[3px]"
            style={{ background: 'linear-gradient(90deg, #1565C0 0%, #1769C8 50%, #2B8C29 100%)' }}
          />

          <div className="w-full max-w-[340px] fade-up relative">
            {/* Mobile branding — floating card over the shimmer */}
            <div className="flex flex-col items-center mb-8 lg:hidden">
              <div
                className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center mb-1"
                style={{ boxShadow: '0 8px 24px rgba(15,23,42,0.3)' }}
              >
                <PragatiMark size={44} />
              </div>
              <div className="brand-wordmark text-[2rem] text-white mt-3 drop-shadow">Pragati</div>
              <div className="text-sm text-white/70 mt-1">The view from above</div>
            </div>

            {/* White card on mobile to contrast the shimmer; transparent on desktop */}
            <div className="rounded-2xl bg-white p-6 shadow-2xl lg:p-0 lg:rounded-none lg:bg-transparent lg:shadow-none">
              {/* Deactivated-account notice */}
              {notice && (
                <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-2.5 fade-in-soft">
                  <span className="text-red-500 font-bold shrink-0 mt-0.5 text-sm">!</span>
                  <div className="text-sm text-red-800 leading-snug">{notice}</div>
                </div>
              )}

              {/* Database unreachable — sign-in cannot succeed until it's back.
                  For a fresh self-hosted deploy this is almost always Atlas
                  Network Access or a mistyped MONGODB_URI. */}
              {dbDown && (
                <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 fade-in-soft">
                  <div className="text-sm text-amber-800 leading-snug">
                    <strong>Can’t reach the database.</strong> Sign-in won’t work until it’s back.
                  </div>
                  <div className="text-[12px] text-amber-700/90 leading-snug mt-1.5">
                    Fresh deployment? Check <code className="font-mono">MONGODB_URI</code> and your Atlas{' '}
                    <em>Network Access</em> (allow <code className="font-mono">0.0.0.0/0</code>), then
                    redeploy. <code className="font-mono">/api/health</code> flips to{' '}
                    <code className="font-mono">ok</code> when it's fixed.
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
                    <div
                      className="relative mb-5 grid place-items-center"
                      style={{ width: 104, height: 104 }}
                    >
                      {/* Breathing brand halo */}
                      <div
                        aria-hidden
                        className="absolute inset-0 rounded-full"
                        style={{
                          background: 'radial-gradient(circle, rgba(21,101,192,0.30) 0%, transparent 70%)',
                          animation: 'glow-pulse 3.4s ease-in-out infinite',
                        }}
                      />
                      {/* Crisp brand-gradient ring around a clean circular avatar —
                          the returning-user echo of the brand mark, polished. */}
                      <div
                        className="relative rounded-full p-[3px]"
                        style={{
                          background: 'conic-gradient(from 210deg, #1565C0, #2E7D32, #1976D2, #1565C0)',
                          boxShadow: '0 14px 34px -8px rgba(21,101,192,0.45)',
                        }}
                      >
                        <div className="rounded-full p-[3px] bg-white">
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
                                background:
                                  deviceAvatar.bg || 'linear-gradient(135deg, #1565C0 0%, #1a237e 100%)',
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
                    <p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.22em] mb-1.5 fade-up-1">
                      Welcome back
                    </p>
                    {/* Name in the display face — matches the brand wordmark
                      treatment so it reads as crafted, not default sans. */}
                    <h2 className="font-display text-[26px] font-black text-slate-900 tracking-tight leading-none fade-up-1">
                      {deviceName || 'You'}
                    </h2>
                    <p className="text-[13px] text-slate-400 mt-2 leading-snug fade-up-2 inline-flex items-center gap-1.5">
                      <Sparkles size={12} className="text-blue-400" />
                      Enter your Quick PIN to continue
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
                        className="w-[54px] h-[62px] rounded-2xl border-2 flex items-center justify-center transition-all duration-200"
                        style={{
                          borderColor: unlocked
                            ? '#16a34a'
                            : shake
                              ? '#ef4444'
                              : pin.length === i
                                ? '#1565C0'
                                : pin.length > i
                                  ? '#93c5fd'
                                  : '#e2e8f0',
                          background: unlocked
                            ? '#f0fdf4'
                            : shake
                              ? '#fef2f2'
                              : pin.length > i
                                ? '#eff6ff'
                                : pin.length === i
                                  ? '#f0f9ff'
                                  : 'white',
                          boxShadow:
                            !unlocked && !shake && pin.length === i
                              ? '0 0 0 3px rgba(21,101,192,0.13)'
                              : 'none',
                          transform: pin.length > i ? 'scale(1.04)' : 'scale(1)',
                        }}
                      >
                        {pin.length > i && (
                          <div
                            className={`w-3 h-3 rounded-full ${unlocked ? 'bg-green-600 pin-pop' : 'bg-blue-600'}`}
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
                      <BirdsEyeLoader
                        size="sm"
                        inline
                        label="Unlocking your workspace…"
                        sublabel="One moment — getting your bird's-eye view ready."
                      />
                    </div>
                  )}

                  <div className="mt-6 flex flex-col items-center gap-2">
                    <div className="flex items-center gap-2 w-full">
                      <span className="h-px flex-1 bg-slate-200" />
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                        or
                      </span>
                      <span className="h-px flex-1 bg-slate-200" />
                    </div>
                    <button
                      onClick={usePasswordInstead}
                      type="button"
                      className="w-full py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:text-blue-700 hover:border-blue-300 hover:bg-blue-50/50 transition-colors"
                    >
                      Use password / switch account
                    </button>
                  </div>
                </div>
              )}

              {/* Heading */}
              {mode !== 'unlock' && (
                <div className="mb-7 form-swap" key={mode + '-h'}>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                    {mode === 'login' ? 'Sign in' : 'Set up workspace'}
                  </h2>
                  <p className="text-sm text-slate-400 mt-1 leading-snug">
                    {mode === 'login'
                      ? 'Welcome to Pragati — sign in to continue.'
                      : 'Create the first lead account.'}
                  </p>
                </div>
              )}

              {mode !== 'unlock' && (
                <form onSubmit={submit} className="space-y-4 form-swap" key={mode + '-f'}>
                  {mode === 'setup' && (
                    <>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
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
                        <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                          Job title <span className="normal-case font-normal text-slate-300">(optional)</span>
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
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
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
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
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
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
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
                      className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 leading-snug flex items-start gap-2 fade-in-soft"
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
                    style={{ boxShadow: '0 4px 14px rgba(21,101,192,0.35)' }}
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
                        <ArrowRight
                          size={15}
                          className="transition-transform group-hover:translate-x-0.5"
                          aria-hidden="true"
                        />
                      </>
                    )}
                  </button>
                </form>
              )}

              {mode !== 'unlock' && (
                <div className="mt-5 text-center">
                  {mode === 'setup' ? (
                    <p className="text-sm text-slate-400">
                      Already have an account?{' '}
                      <button
                        onClick={() => {
                          setMode('login');
                          setErr('');
                        }}
                        className="text-blue-600 font-semibold hover:underline"
                      >
                        Sign in
                      </button>
                    </p>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowForgot((v) => !v)}
                        className="text-xs text-slate-400 hover:text-blue-600 underline underline-offset-2 transition-colors"
                      >
                        Forgot your password?
                      </button>
                      {showForgot && (
                        <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-left fade-in-soft">
                          <p className="text-[12px] text-blue-700 leading-snug">
                            Contact your administrator to reset your password.
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
            {/* end white card */}
          </div>
        </div>
      </div>

      {/* ── Post-unlock welcome veil ─────────────────────────────────────
          Raised the instant the PIN verifies and held while the dashboard
          route loads underneath, so unlocking reads as one continuous
          motion: dots pop green → veil rises → workspace appears. */}
      {unlocked && (
        <div
          className="fixed inset-0 z-[80] veil-in flex flex-col items-center justify-center"
          style={{
            background: 'linear-gradient(160deg, #050E1D 0%, #091828 40%, #0B1F3A 70%, #0C2347 100%)',
          }}
          aria-live="polite"
        >
          <div className="relative mb-6 grid place-items-center" style={{ width: 96, height: 96 }}>
            <div
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(66,165,245,0.36) 0%, transparent 70%)',
                animation: 'glow-pulse 2.4s ease-in-out infinite',
              }}
            />
            <div
              className="relative rounded-full p-[3px]"
              style={{
                background: 'conic-gradient(from 210deg, #1769C8, #43A047, #1976D2, #1769C8)',
                boxShadow: '0 16px 40px -8px rgba(21,101,192,0.55)',
              }}
            >
              <div className="rounded-full p-[3px]" style={{ background: '#0B1F3A' }}>
                {deviceAvatar.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={deviceAvatar.image}
                    alt=""
                    className="block w-[74px] h-[74px] rounded-full object-cover"
                  />
                ) : (
                  <div
                    className="w-[74px] h-[74px] rounded-full flex items-center justify-center text-xl select-none"
                    style={{
                      background: deviceAvatar.bg || 'linear-gradient(135deg, #1565C0 0%, #1a237e 100%)',
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
          <div className="font-display text-2xl font-black text-white tracking-tight fade-up-1">
            Welcome back{deviceName ? `, ${deviceName.split(/\s+/)[0]}` : ''}
          </div>
          <div className="text-[13px] text-white/50 mt-2 fade-up-2">
            Taking you to your bird&apos;s-eye view…
          </div>
          <div className="mt-7 w-44 h-1 rounded-full overflow-hidden bg-white/10 fade-up-3">
            <div
              className="h-full w-1/2 rounded-full veil-bar"
              style={{ background: 'linear-gradient(90deg, #1769C8, #43A047)' }}
            />
          </div>
        </div>
      )}
    </>
  );
}
