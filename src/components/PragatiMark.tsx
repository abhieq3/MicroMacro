/** Pragati mark — black tile, white rising chevrons. High contrast in tabs + dark chrome. */
export function PragatiMark({
  size = 96,
  flat = false,
  className = '',
}: {
  size?: number;
  flat?: boolean;
  className?: string;
}) {
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
        background: '#000000',
        border: flat ? '1px solid #2f3336' : '1px solid #000000',
        boxShadow: 'none',
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
        <path d="M14 40 L32 22 L50 40" stroke="#ffffff" strokeWidth="7" />
        <path d="M18 52 L32 38 L46 52" stroke="#ffffff" strokeWidth="5.5" opacity="0.55" />
      </svg>
    </div>
  );
}
