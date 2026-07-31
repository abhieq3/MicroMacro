/** Pragati brand mark — first principles.
 *
 *  Black tile. Two white rising chevrons. No gradient, no gloss, no glow.
 *  Reads as progress / forward motion. Identical in every context.
 */
export function PragatiMark({
  size = 96,
  /** when true, drops outer depth (inline / sidebar) */
  flat = false,
  className = '',
}: {
  size?: number;
  flat?: boolean;
  className?: string;
}) {
  const r = Math.max(3, Math.round(size * 0.12));

  return (
    <div
      aria-label="Pragati"
      role="img"
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: r,
        background: '#000000',
        border: flat ? '1px solid rgba(255,255,255,0.12)' : '1px solid #000000',
        boxShadow: flat ? 'none' : 'none',
      }}
    >
      <svg
        width={size * 0.56}
        height={size * 0.56}
        viewBox="0 0 64 64"
        className="relative"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 40 L32 22 L50 40" stroke="#ffffff" strokeWidth="6.5" />
        <path d="M18 52 L32 38 L46 52" stroke="#ffffff" strokeWidth="5" opacity="0.55" />
      </svg>
    </div>
  );
}
