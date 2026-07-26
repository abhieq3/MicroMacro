'use client';
import { useEffect, useLayoutEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Sparkles,
  Kanban,
  Sun,
  Users,
  ArrowRight,
  X,
  UserCircle,
  LayoutDashboard,
  ShieldCheck,
  Check,
  Info,
  Presentation,
} from 'lucide-react';

const STORAGE_KEY = 'pragati-tour-v5';

/* Hand-written accents (step counter, "you are here" captions) use a casual
   system stack — no webfont download, so the tour stays weightless. */
const SCRIBBLE_FONT = "'Segoe Print', 'Bradley Hand', 'Marker Felt', 'Comic Sans MS', cursive";

interface Step {
  target?: string;
  title: string;
  body: string;
  icon: any;
  iconBg: string;
  iconColor: string;
  side?: 'right' | 'bottom' | 'top' | 'left';
  mobileTarget?: string;
  /** Final recap card: the role's rights, two columns — so the mental map of
   *  "what's mine to drive here" is explicit before the tour lets go. */
  cheat?: { yours: string[]; context: string[] };
}

/**
 * Role-aware steps. Same skeleton for everyone (the app's shape shouldn't
 * change per role), but the words describe what THIS role will actually do
 * on each surface, and the closing cheat-sheet spells out their rights.
 * All targets anchor to the AppShell nav, which exists on every page.
 */
function buildSteps(role: string): Step[] {
  const isAdmin = role === 'admin' || role === 'master_admin';
  const isLead = role === 'lead' || isAdmin;
  const roleLabel = isAdmin ? 'Admin' : isLead ? 'Team Lead' : 'Individual Contributor';

  const steps: Step[] = [
    {
      title: 'Welcome to Pragati!',
      body: `A 40-second walk through where things live — tuned to what you can do as ${
        isAdmin ? 'the workspace admin' : isLead ? 'a team lead' : 'a contributor'
      }. Skip whenever you like.`,
      icon: Sparkles,
      iconBg: '#DBEAFE',
      iconColor: '#1565C0',
    },
    {
      target: '[data-tour="nav-dashboard"]',
      mobileTarget: '[data-mobile-tour="nav-dashboard"]',
      title: 'Your Dashboard',
      body: isLead
        ? "Your whole scope at a glance — project health, who's loaded, what's overdue or about to slip, and the Bird's-eye button for the full tree."
        : "Your work at a glance — what's due today, what's coming up next, and the projects you're part of.",
      icon: LayoutDashboard,
      iconBg: '#E3F2FD',
      iconColor: '#1565C0',
      side: 'right',
    },
    {
      target: '[data-tour="nav-projects"]',
      mobileTarget: '[data-mobile-tour="nav-projects"]',
      title: isLead ? 'Run projects' : 'Your projects',
      body: isLead
        ? 'Create shared projects from ready-made lifecycle templates or your own, run the Kanban board, and assign work. Drag a card to change status — it saves instantly.'
        : 'Tasks assigned to you live here, on Kanban boards. You also get private personal projects — a space only you can see, ever.',
      icon: Kanban,
      iconBg: '#F3E5F5',
      iconColor: '#7B1FA2',
      side: 'right',
    },
    {
      target: '[data-tour="nav-teams"]',
      mobileTarget: '[data-mobile-tour="nav-teams"]',
      title: isLead ? 'Lead your teams' : 'Your teams',
      body: isLead
        ? "Create teams, pick members, and steer delivery. Each team can switch on extra modules — Quality (QMS) tracking and a Support-ticket queue — right from its settings. Every team page also opens its own bird's-eye view and exports reports."
        : 'See the teams you belong to and the colleagues you deliver with. If your team has Quality (QMS) tracking or a ticket queue switched on, you’ll find them as tabs on the team page.',
      icon: Users,
      iconBg: '#E8F5E9',
      iconColor: '#2E7D32',
      side: 'right',
    },
    {
      target: '[data-tour="nav-whiteboard"]',
      title: 'Think here first',
      body: 'A full-screen whiteboard, yours alone. Sketch the problem before you argue the solution — no slides, no deck, markers and thinking. When it’s solved, wipe it clean and move on.',
      icon: Presentation,
      iconBg: '#E0F7FA',
      iconColor: '#0E7490',
      side: 'right',
    },
  ];

  if (isLead) {
    steps.push({
      target: '[data-tour="nav-teams"]',
      mobileTarget: '[data-mobile-tour="nav-teams"]',
      title: 'Switch on team modules',
      body: 'New: when you create or edit a team, toggle on Quality (QMS) tracking — a configurable tracker where you define your own columns — and a lightweight Support-ticket queue. They stay hidden until you turn them on, so teams that don’t need them never see the clutter.',
      icon: Sparkles,
      iconBg: '#E0F7FA',
      iconColor: '#0E7490',
      side: 'right',
    });
  }

  if (isAdmin) {
    steps.push({
      target: '[data-tour="nav-console"]',
      title: 'Administration',
      body: 'The Console shows the whole workspace — counts, locked accounts, pending invites, recent audit activity. People manages accounts; Logs is the immutable trail.',
      icon: ShieldCheck,
      iconBg: '#FEF3C7',
      iconColor: '#B45309',
      side: 'right',
    });
  }

  steps.push(
    {
      target: '[data-tour="nav-my-day"]',
      mobileTarget: '[data-mobile-tour="nav-my-day"]',
      title: 'My Day is yours alone',
      body: 'A private scratchpad to empty your head, then turn the lines that matter into tracked tasks. Only you can see it.',
      icon: Sun,
      iconBg: '#FEF9C3',
      iconColor: '#A16207',
      side: 'right',
    },
    {
      target: '[data-tour="account-menu"]',
      title: 'Profile & settings',
      body: 'Your avatar, Quick PIN, dark mode, notifications — and your public profile with its activity heatmap and streak.',
      icon: UserCircle,
      iconBg: '#FCE4EC',
      iconColor: '#C2185B',
      side: 'right',
    },
    {
      title: `Your map as ${roleLabel}`,
      body: 'Pin this mental model — it covers 90% of what you’ll do here.',
      icon: isAdmin ? ShieldCheck : isLead ? Users : Check,
      iconBg: isAdmin ? '#FEF3C7' : '#DCFCE7',
      iconColor: isAdmin ? '#B45309' : '#16A34A',
      cheat: isAdmin
        ? {
            yours: [
              'Everything a lead can do — plus every team & shared project is visible to you',
              'Console / People / Logs: accounts, roles, resets, audit trail',
              'Bulk actions & sign-out-everywhere for incident response',
              'Delete any shared project (password sign-off, fully audited)',
            ],
            context: [
              'Personal projects stay private to their owners — even from you',
              'Sensitive changes need your password + a reason (e-signature)',
            ],
          }
        : isLead
          ? {
              yours: [
                'Create teams & shared projects; assign and rebalance work',
                "Bird's-eye any team or project; export Excel / PDF reports",
                'Edit any task in your scope; spot work that may slip before it does',
                'My Day & personal projects — private to you',
              ],
              context: [
                'Deleting tasks & phases is for the project owner (and admins)',
                'People & Logs are admin surfaces — ask your admin for accounts',
              ],
            }
          : {
              yours: [
                'Work your assigned tasks; drag Kanban cards to update status',
                'Personal projects + My Day — private to you',
                'Follow colleagues; grow your streak & contribution graph',
                'Press ? anywhere for keyboard shortcuts',
              ],
              context: [
                'Leads create teams & shared projects and assign the work',
                'Your profile (/your-username) shows what you deliver',
              ],
            },
    },
  );

  return steps;
}

const SPOTLIGHT_PAD = 8;
const TOOLTIP_GAP = 56; // generous gap — the curved arrow lives in it
const TOOLTIP_W = 340;

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return mobile;
}

function useTargetRect(selector: string | undefined): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }
    let frame = 0;
    const measure = () => {
      const el = document.querySelector(selector) as HTMLElement | null;
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect((prev) =>
        prev &&
        prev.top === r.top &&
        prev.left === r.left &&
        prev.width === r.width &&
        prev.height === r.height
          ? prev
          : r,
      );
    };
    measure();
    const onChange = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    window.addEventListener('resize', onChange);
    window.addEventListener('scroll', onChange, true);
    const interval = setInterval(measure, 250);
    setTimeout(() => clearInterval(interval), 4000);
    return () => {
      window.removeEventListener('resize', onChange);
      window.removeEventListener('scroll', onChange, true);
      clearInterval(interval);
      cancelAnimationFrame(frame);
    };
  }, [selector]);
  return rect;
}

// Scribble underline SVG for the title
function ScribbleUnderline({ color = '#1565C0' }: { color?: string }) {
  return (
    <svg viewBox="0 0 120 8" className="w-full h-2 mt-0.5" preserveAspectRatio="none" aria-hidden>
      <path
        d="M2 5 C 10 2, 20 7, 30 4 C 40 1, 50 7, 60 4 C 70 1, 80 7, 90 5 C 100 3, 110 6, 118 4"
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}

/* Curved, dotted, hand-drawn arrow from the card toward the target. The dots
   crawl along the path (dashoffset animation) so the line itself points the
   eye in the right direction. Each side gets its own swing so the arrow
   always bows outward like a quick marker stroke. */
function ScribbleCurvedArrow({ side }: { side: 'right' | 'left' | 'top' | 'bottom' }) {
  // Paths are drawn FROM the card edge TO the target, so the crawl animation
  // (negative dashoffset) flows toward what we're pointing at.
  const geo: Record<string, { vb: string; w: number; h: number; d: string; head: string }> = {
    left: {
      vb: '0 0 84 64',
      w: 84,
      h: 64,
      d: 'M 80 16 C 56 8, 26 14, 10 40',
      head: 'M 10 40 L 13 26 M 10 40 L 24 38',
    },
    right: {
      vb: '0 0 84 64',
      w: 84,
      h: 64,
      d: 'M 4 16 C 28 8, 58 14, 74 40',
      head: 'M 74 40 L 71 26 M 74 40 L 60 38',
    },
    top: {
      vb: '0 0 64 84',
      w: 64,
      h: 84,
      d: 'M 16 80 C 8 56, 14 26, 40 10',
      head: 'M 40 10 L 26 13 M 40 10 L 38 24',
    },
    bottom: {
      vb: '0 0 64 84',
      w: 64,
      h: 84,
      d: 'M 16 4 C 8 28, 14 58, 40 74',
      head: 'M 40 74 L 26 71 M 40 74 L 38 60',
    },
  };
  const g = geo[side];
  return (
    <svg viewBox={g.vb} width={g.w} height={g.h} aria-hidden style={{ overflow: 'visible' }}>
      <path
        d={g.d}
        fill="none"
        stroke="rgba(255,255,255,0.9)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="0.5 9"
        style={{ animation: 'tour-dot-crawl 1.4s linear infinite' }}
      />
      <path
        d={g.head}
        fill="none"
        stroke="rgba(255,255,255,0.9)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FirstTimeTour({
  alreadySeen = false,
  role = 'contributor',
}: {
  alreadySeen?: boolean;
  role?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const isMobile = useIsMobile();
  const STEPS = buildSteps(role);

  useEffect(() => {
    setMounted(true);
    if (typeof window === 'undefined') return;
    if (alreadySeen) return;
    if (localStorage.getItem(STORAGE_KEY)) return;
    const t = setTimeout(() => setOpen(true), 600);
    return () => clearTimeout(t);
  }, [alreadySeen]);

  const close = useCallback(() => {
    setOpen(false);
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, '1');
    fetch('/api/me/tour-seen', { method: 'POST', credentials: 'include' }).catch(() => {});
  }, []);

  const s = STEPS[step];

  // On mobile, prefer the mobile-specific target if present
  const targetSelector = isMobile && s?.mobileTarget ? s.mobileTarget : s?.target;
  const rect = useTargetRect(targetSelector);

  if (!mounted || !open || !s) return null;

  const Icn = s.icon;
  const last = step === STEPS.length - 1;

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;

  const hasTarget = !!targetSelector && !!rect;
  const hole = rect
    ? {
        top: Math.max(0, rect.top - SPOTLIGHT_PAD),
        left: Math.max(0, rect.left - SPOTLIGHT_PAD),
        width: Math.min(vw, rect.width + SPOTLIGHT_PAD * 2),
        height: Math.min(vh, rect.height + SPOTLIGHT_PAD * 2),
      }
    : null;

  // On mobile with no visible target, center the tooltip
  const effectiveHole = isMobile && !hole ? null : hole;

  // Tooltip position
  let tip: { top: number; left: number } = {
    top: vh / 2 - 180,
    left: Math.max(16, vw / 2 - TOOLTIP_W / 2),
  };

  if (effectiveHole) {
    const side = s.side || 'right';
    if (side === 'right') {
      tip = {
        top: Math.max(16, Math.min(vh - 320, effectiveHole.top + effectiveHole.height / 2 - 130)),
        left: Math.min(vw - TOOLTIP_W - 16, effectiveHole.left + effectiveHole.width + TOOLTIP_GAP),
      };
      if (tip.left + TOOLTIP_W > vw - 16) {
        tip = {
          top: Math.min(vh - 320, effectiveHole.top + effectiveHole.height + TOOLTIP_GAP),
          left: Math.max(
            16,
            Math.min(vw - TOOLTIP_W - 16, effectiveHole.left + effectiveHole.width / 2 - TOOLTIP_W / 2),
          ),
        };
      }
    } else if (side === 'bottom') {
      tip = {
        top: Math.min(vh - 320, effectiveHole.top + effectiveHole.height + TOOLTIP_GAP),
        left: Math.max(
          16,
          Math.min(vw - TOOLTIP_W - 16, effectiveHole.left + effectiveHole.width / 2 - TOOLTIP_W / 2),
        ),
      };
    } else if (side === 'top') {
      tip = {
        top: Math.max(16, effectiveHole.top - 280 - TOOLTIP_GAP),
        left: Math.max(
          16,
          Math.min(vw - TOOLTIP_W - 16, effectiveHole.left + effectiveHole.width / 2 - TOOLTIP_W / 2),
        ),
      };
    } else {
      tip = {
        top: Math.max(16, Math.min(vh - 320, effectiveHole.top + effectiveHole.height / 2 - 130)),
        left: Math.max(16, effectiveHole.left - TOOLTIP_W - TOOLTIP_GAP),
      };
    }
  }

  // On mobile, always center the tooltip vertically if near bottom
  if (isMobile) {
    tip.left = Math.max(12, Math.min(vw - TOOLTIP_W - 12, tip.left));
    if (!effectiveHole) {
      tip.top = Math.max(80, vh / 2 - 180);
      tip.left = Math.max(12, vw / 2 - TOOLTIP_W / 2);
    }
  }

  // The connector arrow side (opposite of tooltip placement relative to target)
  const arrowSide: 'left' | 'right' | 'top' | 'bottom' = effectiveHole
    ? tip.left > effectiveHole.left + effectiveHole.width
      ? 'left'
      : tip.left + TOOLTIP_W < effectiveHole.left
        ? 'right'
        : tip.top > effectiveHole.top + effectiveHole.height
          ? 'top'
          : 'bottom'
    : 'left';

  return createPortal(
    <div role="dialog" aria-modal aria-label="Product tour" className="fixed inset-0 z-[9998]">
      {/* Sketch wobble filter + the dot-crawl keyframes used by the ring and
          the curved arrows. */}
      <svg width="0" height="0" className="absolute" aria-hidden>
        <defs>
          <filter id="tour-rough" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="4" result="noise" />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="3"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>
      <style>{`
        @keyframes tour-dot-crawl { to { stroke-dashoffset: -19; } }
        @media (prefers-reduced-motion: reduce) {
          [style*='tour-dot-crawl'] { animation: none !important; }
        }
      `}</style>

      {/* Dim overlay */}
      {hasTarget && effectiveHole ? (
        <>
          <div
            className="absolute inset-x-0 top-0 tour-overlay-bg"
            style={{ height: effectiveHole.top }}
            onClick={close}
          />
          <div
            className="absolute inset-x-0 tour-overlay-bg"
            style={{ top: effectiveHole.top + effectiveHole.height, bottom: 0 }}
            onClick={close}
          />
          <div
            className="absolute tour-overlay-bg"
            style={{
              top: effectiveHole.top,
              height: effectiveHole.height,
              left: 0,
              width: effectiveHole.left,
            }}
            onClick={close}
          />
          <div
            className="absolute tour-overlay-bg"
            style={{
              top: effectiveHole.top,
              height: effectiveHole.height,
              left: effectiveHole.left + effectiveHole.width,
              right: 0,
            }}
            onClick={close}
          />
          {/* Dotted spotlight ring — round dots crawling slowly around the
              target, with a hand-sketch wobble. Replaces the old static
              dashed outline. */}
          <svg
            className="absolute pointer-events-none"
            style={{
              top: effectiveHole.top - 9,
              left: effectiveHole.left - 9,
              filter: 'url(#tour-rough)',
            }}
            width={effectiveHole.width + 18}
            height={effectiveHole.height + 18}
            aria-hidden
          >
            <rect
              x={5}
              y={5}
              width={effectiveHole.width + 8}
              height={effectiveHole.height + 8}
              rx={16}
              fill="none"
              stroke="rgba(21,101,192,0.45)"
              strokeWidth={6}
              opacity={0.5}
            />
            <rect
              x={5}
              y={5}
              width={effectiveHole.width + 8}
              height={effectiveHole.height + 8}
              rx={16}
              fill="none"
              stroke="rgba(255,255,255,0.95)"
              strokeWidth={3}
              strokeLinecap="round"
              strokeDasharray="0.5 9"
              style={{ animation: 'tour-dot-crawl 1.8s linear infinite' }}
            />
          </svg>
        </>
      ) : (
        <div className="absolute inset-0 tour-overlay-bg" onClick={close} />
      )}

      {/* Tooltip card — hand-drawn paper aesthetic */}
      <div
        className="absolute tour-card-enter"
        style={{
          top: tip.top,
          left: tip.left,
          width: Math.min(TOOLTIP_W, vw - 24),
          zIndex: 9999,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Curved dotted connector arrow (visible only when there's a target) */}
        {effectiveHole && (
          <div
            className="absolute pointer-events-none"
            style={{
              ...(arrowSide === 'left'
                ? { right: '100%', top: 8, transform: 'translateX(6px)' }
                : arrowSide === 'right'
                  ? { left: '100%', top: 8, transform: 'translateX(-6px)' }
                  : arrowSide === 'top'
                    ? { bottom: '100%', left: 14, transform: 'translateY(6px)' }
                    : { top: '100%', left: 14, transform: 'translateY(-6px)' }),
            }}
          >
            <ScribbleCurvedArrow side={arrowSide} />
          </div>
        )}

        {/* Card body */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: '#ffffff',
            border: '2px solid #e2e8f0',
            boxShadow: '0 20px 60px rgba(15,23,42,0.18), 0 4px 16px rgba(15,23,42,0.08)',
            filter: 'url(#tour-rough)',
          }}
        >
          {/* Coloured header strip */}
          <div
            className="px-5 pt-5 pb-4 relative"
            style={{ background: 'linear-gradient(135deg, #F8FAFF 0%, #EFF6FF 100%)' }}
          >
            <button
              onClick={close}
              className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              aria-label="Close tour"
            >
              <X size={13} />
            </button>

            {/* Step counter — handwritten */}
            <div className="text-[11px] text-slate-400 mb-3 -rotate-1" style={{ fontFamily: SCRIBBLE_FONT }}>
              step {step + 1} of {STEPS.length}
            </div>

            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center mb-3"
              style={{
                background: s.iconBg,
                border: `2px solid ${s.iconColor}22`,
                boxShadow: `0 0 0 4px ${s.iconBg}, 0 4px 12px ${s.iconColor}22`,
              }}
            >
              <Icn size={20} style={{ color: s.iconColor }} />
            </div>

            <div>
              <h2 className="text-[17px] font-black text-slate-900 tracking-tight leading-tight">
                {s.title}
              </h2>
              <ScribbleUnderline color={s.iconColor} />
            </div>
            <p className="text-[13px] text-slate-500 mt-2 leading-relaxed">{s.body}</p>

            {/* Role cheat-sheet — the closing mental map */}
            {s.cheat && (
              <div className="mt-3 space-y-3">
                <div>
                  <div
                    className="text-[12px] text-green-700 mb-1.5 -rotate-1"
                    style={{ fontFamily: SCRIBBLE_FONT }}
                  >
                    yours to drive
                  </div>
                  <ul className="space-y-1">
                    {s.cheat.yours.map((line) => (
                      <li
                        key={line}
                        className="flex items-start gap-2 text-[12px] text-slate-600 leading-snug"
                      >
                        <Check size={12} className="text-green-600 shrink-0 mt-0.5" />
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div
                    className="text-[12px] text-slate-400 mb-1.5 -rotate-1"
                    style={{ fontFamily: SCRIBBLE_FONT }}
                  >
                    worth knowing
                  </div>
                  <ul className="space-y-1">
                    {s.cheat.context.map((line) => (
                      <li
                        key={line}
                        className="flex items-start gap-2 text-[12px] text-slate-500 leading-snug"
                      >
                        <Info size={12} className="text-slate-300 shrink-0 mt-0.5" />
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 pb-4 pt-3 flex items-center justify-between bg-white border-t border-slate-100">
            {/* Progress dots */}
            <div className="flex items-center gap-1.5">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setStep(i)}
                  className="transition-all duration-300"
                  style={{
                    width: i === step ? 18 : 6,
                    height: 6,
                    borderRadius: 9999,
                    background: i === step ? s.iconColor : i < step ? `${s.iconColor}55` : '#e2e8f0',
                  }}
                  aria-label={`Step ${i + 1}`}
                />
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              {step > 0 && (
                <button
                  onClick={() => setStep((v) => v - 1)}
                  className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 px-2 py-1.5 transition-colors rounded-lg hover:bg-slate-100"
                >
                  Back
                </button>
              )}
              <button
                onClick={() => (last ? close() : setStep((v) => v + 1))}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-white rounded-xl px-4 py-2 transition-all hover:scale-105 active:scale-95"
                style={{
                  background: `linear-gradient(135deg, ${s.iconColor} 0%, ${s.iconColor}cc 100%)`,
                  boxShadow: `0 4px 14px ${s.iconColor}44`,
                }}
              >
                {last ? "Let's go!" : 'Next'}
                <ArrowRight size={12} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
