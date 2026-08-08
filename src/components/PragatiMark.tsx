/** Pragati's brand mark — CSS / SVG only, no image asset.
 *
 *  Two rising chevrons stacked inside a rounded-square gradient tile. Reads
 *  as forward / upward motion — the literal meaning of "pragati" (progress).
 *  Pairs cleanly with the wordmark "Pragati" rendered alongside it; the mark
 *  is symbolic, not a literal P.
 *
 *  The tile uses a single, *symmetric* squircle radius (equal on all four
 *  corners) so the mark reads identically everywhere it appears — sidebar,
 *  login, loaders, favicon, apple-icon — and lines up with the rounded-xl
 *  avatar shape system used across the app.
 *
 *  Use this everywhere the app needs a logo (login, signup, forgot-password,
 *  sidebar, loading state, favicon). No external assets, no corporate logo.
 */
export function PragatiMark({
  size = 96,
  /** when true, drops the glow + heavy shadow (good for inline use in the sidebar) */
  flat = false,
  className = '',
}: {
  size?: number;
  flat?: boolean;
  className?: string;
}) {
  // Symmetric squircle — one radius on every corner (matches icon.svg's rx and
  // the rounded-xl avatar treatment). ~27% keeps it soft without going pill.
  const r = Math.round(size * 0.27);
  const shadow = flat
    ? 'inset 0 1px 0 rgba(255,255,255,0.22)'
    : 'inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -1px 0 rgba(0,0,0,0.18), ' +
      '0 18px 48px rgba(21,101,192,0.40), 0 6px 14px rgba(0,0,0,0.18)';

  return (
    <div
      aria-label="Pragati"
      role="img"
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: r,
        background: 'linear-gradient(135deg, #1565C0 0%, #1769C8 45%, #2B8C29 100%)',
        boxShadow: shadow,
      }}
    >
      {/* Inner glossy ring */}
      <div
        className="absolute pointer-events-none"
        style={{
          inset: Math.max(2, size * 0.04),
          borderRadius: Math.round(r * 0.8),
          background: 'linear-gradient(155deg, rgba(255,255,255,0.14) 0%, transparent 55%)',
        }}
      />

      {/* Two stacked rising chevrons — reads as "progress / forward motion".
         The lower chevron is the same white as the wordmark; the upper one
         carries a soft forest tint to echo the brand gradient. */}
      <svg
        width={size * 0.58}
        height={size * 0.58}
        viewBox="0 0 64 64"
        className="relative"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 40 L32 22 L50 40" stroke="#ffffff" strokeWidth="7" />
        <path d="M18 52 L32 38 L46 52" stroke="#B7E4C2" strokeWidth="5" opacity="0.92" />
      </svg>
    </div>
  );
}
