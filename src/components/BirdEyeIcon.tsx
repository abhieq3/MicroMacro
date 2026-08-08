'use client';

/**
 * Custom Bird's-Eye glyph used as the trigger icon across the app.
 * An eye-shaped overview lens containing a tiny top-down hierarchy. The eye
 * makes the action recognisable at a glance; the connected nodes distinguish
 * it from a generic preview/visibility control.
 *
 * Pass `blink` to draw attention on first paint — pulses the icon twice
 * then settles. Useful as a feature-discovery cue without a tour modal.
 */
export function BirdEyeIcon({
  size = 18,
  className = '',
  blink = false,
  title = "Bird's-eye view",
}: {
  size?: number;
  className?: string;
  blink?: boolean;
  title?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-label={title}
      className={`${blink ? 'pragati-birdeye-blink' : ''} ${className}`.trim()}
    >
      <title>{title}</title>
      {/* Overview lens. */}
      <path
        d="M2.5 12s3.45-6 9.5-6 9.5 6 9.5 6-3.45 6-9.5 6-9.5-6-9.5-6Z"
        fill="currentColor"
        fillOpacity="0.08"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />

      {/* Top-down hierarchy inside the lens. */}
      <path
        d="M12 8.6v2.1m0 0-3.5 2.7m3.5-2.7 3.5 2.7M12 10.7v2.7"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="8.1" r="1.65" fill="currentColor" />
      <circle cx="8.25" cy="14.2" r="1.25" fill="white" stroke="currentColor" strokeWidth="1.15" />
      <circle cx="12" cy="14.2" r="1.25" fill="white" stroke="currentColor" strokeWidth="1.15" />
      <circle cx="15.75" cy="14.2" r="1.25" fill="white" stroke="currentColor" strokeWidth="1.15" />
    </svg>
  );
}
