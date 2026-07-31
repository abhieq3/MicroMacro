/** Pragati mark — X-era: black tile, white chevrons, no gloss. */
export function PragatiMark({
  size = 96,
  flat = false,
  className = '',
}: {
  size?: number;
  flat?: boolean;
  className?: string;
}) {
  // Slightly rounded square — closer to X app icon softness than a pill.
  const r = Math.max(4, Math.round(size * 0.22));

  return (
    <div
      aria-label="Pragati"
      role="img"
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: r,
        background: '#e7e9ea',
        border: 'none',
        boxShadow: 'none',
      }}
    >
      {/* Invert: dark chevrons on light tile (reads on pure black chrome like the X logo) */}
      <svg
        width={size * 0.56}
        height={size * 0.56}
        viewBox="0 0 64 64"
        className="relative"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 40 L32 22 L50 40" stroke="#000000" strokeWidth="7" />
        <path d="M18 52 L32 38 L46 52" stroke="#000000" strokeWidth="5.5" opacity="0.55" />
      </svg>
    </div>
  );
}
