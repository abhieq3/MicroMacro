'use client';
import Link from 'next/link';
import { ReactNode, useEffect, useRef, useState } from 'react';

// ── Status dots ───────────────────────────────────────────────────────────────
const STATUS_DOT: Record<string, string> = {
  todo: '#94a3b8',
  in_progress: '#3b82f6',
  review: '#f59e0b',
  blocked: '#ef4444',
  done: '#22c55e',
  planning: '#94a3b8',
  on_hold: '#f59e0b',
  completed: '#22c55e',
  cancelled: '#ef4444',
};

const STATUS_LABEL: Record<string, string> = {
  todo: 'Todo',
  in_progress: 'In progress',
  review: 'Review',
  blocked: 'Blocked',
  done: 'Done',
  planning: 'Planning',
  on_hold: 'On hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const STATUS_COLORS: Record<string, string> = {
  todo: 'bg-slate-100 text-slate-600',
  in_progress: 'bg-blue-50 text-blue-700',
  review: 'bg-amber-50 text-amber-700',
  blocked: 'bg-red-50 text-red-600',
  done: 'bg-green-50 text-green-700',
  planning: 'bg-slate-100 text-slate-600',
  on_hold: 'bg-amber-50 text-amber-700',
  completed: 'bg-green-50 text-green-700',
  cancelled: 'bg-red-50 text-red-600',
};

export const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-slate-100 text-slate-500',
  medium: 'bg-sky-50 text-sky-700',
  high: 'bg-orange-50 text-orange-700',
  critical: 'bg-red-50 text-red-700',
};

const PRIORITY_DOT: Record<string, string> = {
  low: '#94a3b8',
  medium: '#0ea5e9',
  high: '#f97316',
  critical: '#ef4444',
};

export const LIFECYCLE_LABELS: Record<string, string> = {
  // Generic templates
  agile_sprint: 'Sprint',
  software_release: 'Release',
  product_launch: 'Launch',
  research: 'Research',
  // Life Sciences templates
  csv: 'CSV',
  sop: 'SOP',
  deviation: 'Deviation',
  capa: 'CAPA',
  deviation_capa: 'Issue/CAPA',
  change_control: 'Change Control',
  software_change: 'SW Change',
  audit: 'Audit',
  validation: 'Validation',
  data_integrity: 'Data Integrity',
  pharmacovigilance: 'Safety Reporting',
  generic: 'Generic',
};

export const LIFECYCLE_COLORS: Record<string, string> = {
  // Generic templates
  agile_sprint: 'text-violet-700 bg-violet-50',
  software_release: 'text-sky-700 bg-sky-50',
  product_launch: 'text-orange-700 bg-orange-50',
  research: 'text-teal-700 bg-teal-50',
  // Life Sciences templates
  csv: 'text-indigo-700 bg-indigo-50',
  sop: 'text-emerald-700 bg-emerald-50',
  deviation: 'text-rose-700 bg-rose-50',
  capa: 'text-orange-700 bg-orange-50',
  deviation_capa: 'text-red-600 bg-red-50',
  change_control: 'text-amber-700 bg-amber-50',
  software_change: 'text-blue-700 bg-blue-50',
  audit: 'text-purple-700 bg-purple-50',
  validation: 'text-sky-700 bg-sky-50',
  data_integrity: 'text-teal-700 bg-teal-50',
  pharmacovigilance: 'text-pink-700 bg-pink-50',
  generic: 'text-slate-600 bg-slate-100',
};

// ── Tag primitives ────────────────────────────────────────────────────────────
export function Tag({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

/* ── Role badge — the only thing we show for a person besides their name.
   No job titles or designations anywhere: a person is a Team Lead
   (green), an Individual Contributor (blue), or the Admin (amber). */
export const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  pm: 'Team Lead',
  lead: 'Team Lead',
  contributor: 'Individual Contributor',
  employee: 'Individual Contributor',
};
const ROLE_BADGE_CLASS: Record<string, string> = {
  admin: 'bg-amber-50 text-amber-800 border-amber-200',
  pm: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  lead: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  contributor: 'bg-blue-50 text-blue-700 border-blue-200',
  employee: 'bg-blue-50 text-blue-700 border-blue-200',
};
export function roleLabel(role?: string | null): string {
  return ROLE_LABEL[role || 'contributor'] ?? 'Individual Contributor';
}
export function RoleBadge({ role, className = '' }: { role?: string | null; className?: string }) {
  const r = role || 'contributor';
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold ${ROLE_BADGE_CLASS[r] ?? ROLE_BADGE_CLASS.contributor} ${className}`}
    >
      {roleLabel(r)}
    </span>
  );
}

export function StatusTag({ status }: { status?: string | null }) {
  if (!status) return null;
  const dot = STATUS_DOT[status] ?? '#94a3b8';
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dot }} />
      {STATUS_LABEL[status] ?? status.replace('_', ' ')}
    </span>
  );
}

export function PriorityTag({ priority }: { priority?: string | null }) {
  if (!priority || priority === 'low') return null;
  const dot = PRIORITY_DOT[priority] ?? '#94a3b8';
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold capitalize ${PRIORITY_COLORS[priority] ?? 'bg-slate-100 text-slate-600'}`}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dot }} />
      {priority}
    </span>
  );
}

export function LifecycleTag({ lifecycle }: { lifecycle?: string | null }) {
  if (!lifecycle || lifecycle === 'generic') return null;
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${LIFECYCLE_COLORS[lifecycle] ?? 'bg-slate-100 text-slate-600'}`}
    >
      {LIFECYCLE_LABELS[lifecycle] ?? lifecycle}
    </span>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────
export function ProgressBar({ value, className = '' }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      className={`relative w-full bg-slate-100 dark:bg-white/10 rounded-full h-1 overflow-hidden ${className}`}
    >
      <div
        className="progress-bar-fill h-1 rounded-full"
        // Spring-like easing so the fill glides into place rather than a flat
        // linear crawl — reads as "progress made", not a loading bar.
        style={{ width: `${pct}%`, transition: 'width 900ms cubic-bezier(0.22, 1, 0.36, 1)' }}
      >
        {/* Travelling sheen — active whenever the bar has any fill. */}
        {pct > 0 && <span aria-hidden className="progress-bar-sheen" />}
      </div>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────
export function Card({
  title,
  action,
  children,
  className = '',
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`card p-4 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-3">
          {title && <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

// ── Utilities ─────────────────────────────────────────────────────────────────
export function formatDate(s?: string | Date | null) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return String(s);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Safe date+time for tooltips/metadata. Returns '—' for null and '' for an
 *  unparseable value — never the literal "Invalid Date" string a raw
 *  `new Date(x).toLocaleString()` leaks into the UI. */
export function formatDateTime(s?: string | Date | null) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Safe full date (no time). Same null/invalid guards as formatDateTime. */
export function formatFullDate(s?: string | Date | null) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function daysUntil(s?: string | Date | null) {
  if (!s) return null;
  // Date-only strings (YYYY-MM-DD) are pinned to local noon; full timestamps
  // (the form a Mongoose `Date` serialises to — UTC midnight for a date-only
  // due date) are taken as-is. We then compare *calendar days* in local time,
  // not raw millisecond deltas, so "due today" is always 0, "tomorrow" is 1,
  // and "yesterday" is -1 regardless of timezone or the hour of the day.
  const d = typeof s === 'string' && s.length === 10 ? new Date(s + 'T12:00:00') : new Date(s);
  if (isNaN(d.getTime())) return null;
  const dueDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((dueDay - today) / 86400000);
}

/** Single source of truth for "is this work past its date". A task is overdue
 *  only when its due *calendar day* is strictly before today (local time) and
 *  it isn't already done — so a task due today never reads as overdue. Use this
 *  everywhere instead of `new Date(due) < new Date()`, which (because date-only
 *  dues are stored at UTC midnight) wrongly flags due-today work as overdue
 *  from the early morning onward in any positive-offset timezone (e.g. IST). */
export function isOverdue(due?: string | Date | null, status?: string | null): boolean {
  if (!due || status === 'done') return false;
  const d = daysUntil(due);
  return d !== null && d < 0;
}

// ── Avatar ────────────────────────────────────────────────────────────────────
// Each palette entry is a [lighter, darker] gradient pair for a soft 3-D feel.
const AVATAR_GRADIENTS: Array<[string, string]> = [
  ['#1E88E5', '#1565C0'], // brand blue
  ['#5E35B1', '#311B92'], // deep purple
  ['#00897B', '#00695C'], // teal
  ['#EF6C00', '#E65100'], // orange
  ['#43A047', '#2E7D32'], // forest
  ['#C62828', '#B71C1C'], // red
  ['#039BE5', '#0277BD'], // light blue
  ['#7B1FA2', '#4A148C'], // purple
  ['#6D4C41', '#4E342E'], // warm brown
  ['#546E7A', '#37474F'], // blue grey
];

/**
 * Hand-picked monogram combinations. Every (bg, font, foreground) tuple here
 * has been visually QA'd at the 28–32px sizes avatars typically render at,
 * so the "Surprise me" picker can roll a coherent look every time without
 * showing the user a sea of swatches. Ordered for variety — consecutive
 * spins land on different families.
 */
export const AVATAR_PRESETS: Array<{ bg: string; font: number }> = [
  // Sans on rich solids — the safe, professional defaults
  { bg: '#1565C0', font: 0 }, // brand blue + system sans
  { bg: '#2E7D32', font: 0 }, // brand green + system sans
  { bg: '#7B1FA2', font: 1 }, // royal purple + Helvetica heavy
  { bg: '#C62828', font: 1 }, // crimson + Helvetica heavy
  { bg: '#00897B', font: 3 }, // teal + Avenir
  { bg: '#EF6C00', font: 3 }, // amber + Avenir
  // Display weights for confident strokes
  { bg: '#0F172A', font: 5 }, // ink + Futura
  { bg: '#1976D2', font: 5 }, // brand blue + Futura
  { bg: '#0D47A1', font: 4 }, // navy + Impact
  { bg: '#365314', font: 4 }, // olive + Impact
  // Serifs on lighter pastels — soft and editorial
  { bg: '#FED7AA', font: 6 }, // peach + Georgia
  { bg: '#BAE6FD', font: 6 }, // sky + Georgia
  { bg: '#FBCFE8', font: 7 }, // blush + Playfair
  { bg: '#A7F3D0', font: 7 }, // mint + Playfair
  // Mono — quietly technical
  { bg: '#334155', font: 9 }, // slate + Courier
  { bg: '#0F766E', font: 9 }, // pine + Courier
];

// Font choices for the monogram letter. Curated typefaces that always read
// well at the small sizes avatars live in — a wider variety than the original
// 5 system fallbacks. Sample strings show the actual character shape.
export const AVATAR_FONTS: Array<{ family: string; weight: number; sample: string }> = [
  // Sans-serif — the workhorse defaults
  { family: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', weight: 700, sample: 'Aa' },
  { family: '"Helvetica Neue", Helvetica, Arial, sans-serif', weight: 800, sample: 'Aa' },
  { family: '"Trebuchet MS", "Lucida Sans Unicode", sans-serif', weight: 700, sample: 'Aa' },
  { family: '"Avenir Next", Avenir, "Segoe UI", sans-serif', weight: 600, sample: 'Aa' },
  // Display / heavy — strong, confident
  { family: 'Impact, "Arial Black", sans-serif', weight: 900, sample: 'Aa' },
  { family: '"Futura", "Trebuchet MS", sans-serif', weight: 700, sample: 'Aa' },
  // Serif — classic
  { family: 'Georgia, "Times New Roman", serif', weight: 700, sample: 'Aa' },
  { family: '"Playfair Display", Georgia, serif', weight: 700, sample: 'Aa' },
  { family: '"Garamond", "Times New Roman", serif', weight: 600, sample: 'Aa' },
  // Slab / mono — technical, GxP-flavoured
  { family: '"Courier New", ui-monospace, monospace', weight: 700, sample: 'Aa' },
  { family: '"Rockwell", "Courier New", serif', weight: 700, sample: 'Aa' },
  // Script / handwritten — for a personal touch
  { family: '"Brush Script MT", "Lucida Handwriting", cursive', weight: 400, sample: 'Aa' },
  { family: '"Snell Roundhand", "Apple Chancery", cursive', weight: 500, sample: 'Aa' },
];

// Pick a sensible foreground for a given background — black for light pastels,
// white for dark fills. Keeps the letter readable across the palette.
export function avatarFg(bg: string): string {
  const hex = bg.replace('#', '');
  if (hex.length !== 6) return '#111';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  // Perceived luminance, ITU-R BT.709
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 170 ? '#1f2937' : '#ffffff';
}

interface AvatarProps {
  name?: string | null;
  size?: number;
  /** Custom monogram letter — overrides the name-derived initials. */
  letter?: string | null;
  /** Solid background colour. When set, replaces the hash-derived gradient. */
  bg?: string | null;
  /** Index into AVATAR_FONTS. */
  font?: number | null;
  /** Render a subtle white ring border around the circular avatar. */
  ring?: boolean;
  /** Uploaded photo (compressed data URL). When set, wins over the monogram. */
  image?: string | null;
}

export function Avatar({ name, size = 28, letter, bg, font, ring, image }: AvatarProps) {
  // Initials: first letter of first word + first letter of last word.
  // Single-word names render a single letter. Coloured deterministically by name.
  const trimmed = (name || '').trim();
  const parts = trimmed ? trimmed.split(/\s+/).filter(Boolean) : [];
  const first = (parts[0]?.[0] || '?').toUpperCase();
  const last = parts.length > 1 ? (parts[parts.length - 1][0] || '').toUpperCase() : '';
  const defaultInitials = first + last || '?';
  const initials = (letter || defaultInitials).slice(0, 2).toUpperCase() || '?';

  // Monogram override: solid colour + chosen font. Falls back to the
  // legacy hash-coloured gradient + system font when no override is set.
  const useMonogram = !!bg;
  const hash = trimmed.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const [lo, hi] = AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
  const background = useMonogram ? bg! : `linear-gradient(135deg, ${lo} 0%, ${hi} 100%)`;
  const color = useMonogram ? avatarFg(bg!) : '#ffffff';
  const fontDef = AVATAR_FONTS[font ?? 0] || AVATAR_FONTS[0];
  // SVG text uses the glyph metrics (dominant-baseline:central + text-anchor:middle)
  // so the letter is pixel-centred regardless of the font's ascender/descender
  // ratio. CSS line-box centring drifted noticeably with display & script faces.
  const fontSize = size * (initials.length === 1 ? 0.52 : 0.44);

  return (
    <div
      className="flex items-center justify-center shrink-0 select-none overflow-hidden"
      style={{
        width: size,
        height: size,
        // aspectRatio + flex:none guarantee a perfect circle even inside a
        // flex row that would otherwise squish one axis into an oval.
        aspectRatio: '1 / 1',
        flex: 'none',
        background,
        // Circle avatars across the whole app (Google/LinkedIn style).
        borderRadius: '50%',
        // Rings are symmetric box-shadows (no directional drop) so the edge
        // reads as a clean circle, not a faintly egg-shaped one.
        boxShadow: ring
          ? '0 0 0 2px rgba(255,255,255,0.92), 0 0 0 3.5px rgba(15,23,42,0.08)'
          : useMonogram
            ? '0 1px 2px rgba(15,23,42,0.12)'
            : 'inset 0 1px 0 rgba(255,255,255,0.22), 0 1px 2px rgba(15,23,42,0.12)',
      }}
      title={trimmed || ''}
      aria-label={trimmed || 'User'}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          width={size}
          height={size}
          className="w-full h-full object-cover rounded-full select-none"
          draggable={false}
        />
      ) : (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <text
            x={size / 2}
            y={size / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily={fontDef.family}
            fontWeight={fontDef.weight}
            fontSize={fontSize}
            fill={color}
            letterSpacing="0.02em"
          >
            {initials}
          </text>
        </svg>
      )}
    </div>
  );
}

// ── Status option sets ────────────────────────────────────────────────────────
export const TASK_STATUS_OPTIONS = ['todo', 'in_progress', 'review', 'blocked', 'done'] as const;
export const PROJECT_STATUS_OPTIONS = [
  'planning',
  'in_progress',
  'on_hold',
  'completed',
  'cancelled',
] as const;

// ── StatusSelect — custom pill dropdown replacing native <select> ─────────────
export function StatusSelect({
  value,
  onChange,
  options = TASK_STATUS_OPTIONS as unknown as string[],
  size = 'md',
  pending = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options?: readonly string[] | string[];
  size?: 'sm' | 'md';
  pending?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const dot = STATUS_DOT[value] ?? '#94a3b8';
  const label = STATUS_LABEL[value] ?? value.replace(/_/g, ' ');

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => !pending && setOpen((o) => !o)}
        disabled={pending}
        className={`inline-flex items-center gap-1.5 rounded-lg border bg-white transition-all font-semibold text-slate-700 disabled:opacity-70 ${
          open
            ? 'border-blue-300 ring-2 ring-blue-100'
            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
        } ${size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1.5 text-xs'}`}
      >
        {pending ? (
          <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin opacity-60 shrink-0" />
        ) : (
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dot }} />
        )}
        {label}
        {!pending && (
          <svg
            width="9"
            height="9"
            viewBox="0 0 10 10"
            fill="none"
            className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          >
            <path
              d="M2.5 3.5L5 6.5L7.5 3.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1 z-50 bg-white rounded-xl border border-slate-100 overflow-hidden"
          style={{
            minWidth: 148,
            boxShadow: '0 4px 20px rgba(15,23,42,0.12), 0 1px 4px rgba(15,23,42,0.06)',
          }}
        >
          {(options as string[]).map((opt) => {
            const optDot = STATUS_DOT[opt] ?? '#94a3b8';
            const optLabel = STATUS_LABEL[opt] ?? opt.replace(/_/g, ' ');
            const active = opt === value;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  onChange(opt);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-slate-50 text-slate-900'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                }`}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: optDot }} />
                {optLabel}
                {active && <span className="ml-auto text-blue-600 text-[10px] font-bold">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── StatusPillRow ───────────────────────────────────────────────────────────
// Inline pill-row replacement for the StatusSelect dropdown. Used on
// detail pages (task / project) where there's room to show every status
// at once; the click target is the pill itself, so changing status is one
// tap instead of two (open dropdown + pick). Mirrors Kite's direct-action
// philosophy — no extra modal, no extra confirmation step.
export function StatusPillRow({
  value,
  onChange,
  options = TASK_STATUS_OPTIONS as unknown as string[],
  pending = false,
  className = '',
  collapsible = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options?: readonly string[] | string[];
  pending?: boolean;
  className?: string;
  /** When true, only the current status shows; the other options expand
   *  horizontally on hover/focus. Keeps the header calm until you reach for it. */
  collapsible?: boolean;
}) {
  const pill = (opt: string) => {
    const active = opt === value;
    const optDot = STATUS_DOT[opt] ?? '#94a3b8';
    const optLabel = STATUS_LABEL[opt] ?? opt.replace(/_/g, ' ');
    return (
      <button
        key={opt}
        type="button"
        disabled={pending}
        onClick={() => !active && onChange(opt)}
        aria-pressed={active}
        className={`relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap ${
          active
            ? 'bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_0_0_1px_rgba(21,101,192,0.18)]'
            : 'text-slate-500 hover:text-slate-800 hover:bg-white/60'
        } disabled:opacity-50`}
      >
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: optDot }} />
        {optLabel}
      </button>
    );
  };

  if (collapsible) {
    const others = (options as string[]).filter((o) => o !== value);
    return (
      <div
        className={`group inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.04] p-1 ${className}`}
        title="Change status"
      >
        {pill(value)}
        {/* Animated 0fr→1fr width reveal — CSS-only, no layout jank. */}
        <div className="grid grid-cols-[0fr] transition-[grid-template-columns] duration-300 ease-out group-hover:grid-cols-[1fr] group-focus-within:grid-cols-[1fr]">
          <div className="overflow-hidden min-w-0 flex items-center gap-1">{others.map(pill)}</div>
        </div>
        {pending && (
          <span className="ml-1 w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin opacity-60 text-slate-400" />
        )}
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50/70 p-1 ${className}`}
    >
      {(options as string[]).map(pill)}
      {pending && (
        <span className="ml-1 w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin opacity-60 text-slate-400" />
      )}
    </div>
  );
}

// ── useToast — simple ephemeral notification ──────────────────────────────────
export function useToast() {
  const [toast, setToastState] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string, kind: 'ok' | 'err' = 'ok') {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToastState({ msg, kind });
    timerRef.current = setTimeout(() => setToastState(null), 3000);
  }

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const ToastEl = toast ? (
    <div
      role="status"
      className={`fixed bottom-5 right-5 z-[9999] flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg border text-sm font-semibold fade-in-soft`}
      style={{
        background: toast.kind === 'ok' ? '#f0fdf4' : '#fef2f2',
        borderColor: toast.kind === 'ok' ? '#bbf7d0' : '#fecaca',
        color: toast.kind === 'ok' ? '#15803d' : '#dc2626',
      }}
    >
      {toast.kind === 'ok' ? (
        <span className="text-green-500">✓</span>
      ) : (
        <span className="text-red-500">!</span>
      )}
      {toast.msg}
    </div>
  ) : null;

  return { showToast, ToastEl };
}

// ── Links ─────────────────────────────────────────────────────────────────────
export function TaskLink({
  task,
  children,
  className,
}: {
  task: { id: string; title?: string };
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={`/tasks/${task.id}`}
      className={className ?? 'font-medium text-slate-800 hover:text-blue-700 transition-colors'}
    >
      {children || task.title}
    </Link>
  );
}
