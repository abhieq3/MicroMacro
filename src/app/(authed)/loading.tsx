// Server-rendered dashboard loading state — the returning user's most-seen
// screen, so it is held to the highest bar: calm, fast-feeling, almost
// invisible. Three elements only — a moving brand sweep (proof of motion),
// the greeting ghost where the greeting will land (zero layout shift on the
// most prominent element), and one quiet personalised line. No wall of grey
// boxes: a dozen pulsing rectangles reads as "slow machine"; near-empty
// space with one signal reads as "arriving".
import { LoadingQuip } from '@/components/LoadingQuip';

export default function Loading() {
  return (
    <div className="pb-12 max-w-[1440px]">
      {/* Indeterminate brand sweep — a single moving gradient line at the very
          top says "in motion" for the whole wait, with no JS. */}
      <style>{`
        @keyframes route-sweep {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .route-sweep { animation: none !important; }
        }
      `}</style>
      <div className="fixed top-0 left-0 right-0 h-[3px] z-50 overflow-hidden pointer-events-none">
        <div
          className="route-sweep h-full w-1/3 rounded-full"
          style={{
            background: 'linear-gradient(90deg, transparent, #1769C8 30%, #43A047 70%, transparent)',
            animation: 'route-sweep 1.2s ease-in-out infinite',
          }}
        />
      </div>

      {/* Greeting ghost — exactly where "Good morning, …" will materialise. */}
      <div className="mb-4 sm:mb-5 pt-1">
        <div className="skeleton h-9 w-72 max-w-full rounded-lg" />
      </div>

      {/* One human line — the only copy on the screen. */}
      <div className="mb-8">
        <LoadingQuip />
      </div>

      {/* Two whisper-light panel ghosts hold the page's shape; everything
          else stays whitespace until real content arrives. */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 items-start opacity-60">
        <div className="skeleton h-40 rounded-2xl" />
        <div className="skeleton h-40 rounded-2xl hidden lg:block" />
      </div>
    </div>
  );
}
