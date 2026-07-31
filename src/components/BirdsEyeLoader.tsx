import { PragatiMark } from '@/components/PragatiMark';

/** Shared loading mark. Plain status text only. */
export function BirdsEyeLoader({
  label = 'Loading…',
  sublabel = '',
  size = 'md',
  inline = false,
}: {
  label?: string;
  sublabel?: string;
  size?: 'sm' | 'md';
  inline?: boolean;
}) {
  const mark = size === 'sm' ? 36 : 48;
  const ring = size === 'sm' ? 'w-14 h-14' : 'w-20 h-20';
  return (
    <div
      className={`flex flex-col items-center justify-center gap-4 ${inline ? 'py-10' : 'min-h-[60vh]'}`}
    >
      <div className={`relative ${ring} flex items-center justify-center`}>
        <div
          className="absolute inset-0 rounded-full"
          style={{
            border: '1.5px solid rgba(255,255,255,0.08)',
            borderTopColor: 'rgba(255,255,255,0.55)',
            animation: 'pragati-spin 0.85s linear infinite',
          }}
        />
        <PragatiMark size={mark} flat />
      </div>

      {(label || sublabel) && (
        <div className="text-center">
          {label && (
            <div
              className={`font-semibold tracking-tight text-zinc-800 dark:text-white/80 ${
                size === 'sm' ? 'text-sm' : 'text-[15px]'
              }`}
            >
              {label}
            </div>
          )}
          {sublabel ? <div className="text-xs text-zinc-500 dark:text-white/35 mt-1">{sublabel}</div> : null}
        </div>
      )}

      <style>{`@keyframes pragati-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
