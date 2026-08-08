/**
 * Shared ultra-light route loading state — one brand sweep + whisper skeleton.
 * Used by pages that previously had no loading.tsx so navigation never blanks.
 */

export function InstantLoading({ label }: { label?: string }) {
  return (
    <div className="pb-10 max-w-[1440px]">
      <style>{`
        @keyframes route-sweep-fast {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .route-sweep-fast { animation: none !important; opacity: 0.5; }
        }
      `}</style>
      <div className="fixed top-0 left-0 right-0 h-[2.5px] z-50 overflow-hidden pointer-events-none">
        <div
          className="route-sweep-fast h-full w-1/3 rounded-full"
          style={{
            background: 'linear-gradient(90deg, transparent, #1769C8 30%, #43A047 70%, transparent)',
            animation: 'route-sweep-fast 0.75s ease-in-out infinite',
          }}
        />
      </div>
      <div className="mb-4 pt-1">
        <div className="skeleton h-8 w-56 max-w-full rounded-lg" />
      </div>
      {label && (
        <p className="text-[12px] text-slate-400 dark:text-white/30 mb-6 font-medium">{label}</p>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 opacity-50">
        <div className="skeleton h-36 rounded-2xl" />
        <div className="skeleton h-36 rounded-2xl hidden lg:block" />
      </div>
    </div>
  );
}
