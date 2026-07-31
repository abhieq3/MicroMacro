'use client';
import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

/* ── Types ────────────────────────────────────────────────────────────────── */
type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
}

interface ToastCtx {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

/* ── Theme ────────────────────────────────────────────────────────────────── */
const THEME: Record<
  ToastType,
  {
    icon: any;
    bg: string;
    border: string;
    iconColor: string;
    titleColor: string;
    darkBg: string;
    darkBorder: string;
  }
> = {
  success: {
    icon: CheckCircle2,
    bg: '#ffffff',
    border: '#eff3f4',
    iconColor: '#00ba7c',
    titleColor: '#0f1419',
    darkBg: '#16181c',
    darkBorder: '#2f3336',
  },
  error: {
    icon: XCircle,
    bg: '#ffffff',
    border: '#eff3f4',
    iconColor: '#f4212e',
    titleColor: '#0f1419',
    darkBg: '#16181c',
    darkBorder: '#2f3336',
  },
  warning: {
    icon: AlertTriangle,
    bg: '#ffffff',
    border: '#eff3f4',
    iconColor: '#ffd400',
    titleColor: '#0f1419',
    darkBg: '#16181c',
    darkBorder: '#2f3336',
  },
  info: {
    icon: Info,
    bg: '#ffffff',
    border: '#eff3f4',
    iconColor: 'var(--mars)',
    titleColor: '#0f1419',
    darkBg: '#16181c',
    darkBorder: '#2f3336',
  },
};

/* ── Single toast ─────────────────────────────────────────────────────────── */
function ToastEl({ item, onDismiss }: { item: ToastItem; onDismiss: (id: string) => void }) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const t = THEME[item.type];
  const Icon = t.icon;

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(dismiss, 4200);
    return () => clearTimeout(timer);
  }, []);

  function dismiss() {
    setLeaving(true);
    setTimeout(() => onDismiss(item.id), 240);
  }

  return (
    <div
      role="alert"
      onClick={dismiss}
      className="pointer-events-auto relative overflow-hidden cursor-pointer flex items-start gap-3 px-4 py-3 max-w-[320px] w-full select-none"
      style={{
        background: isDark ? t.darkBg : t.bg,
        border: `1px solid ${isDark ? t.darkBorder : t.border}`,
        borderRadius: 16,
        boxShadow: isDark ? '0 0 15px rgba(255,255,255,0.08)' : '0 0 15px rgba(0,0,0,0.08)',
        transform: visible && !leaving ? 'translateX(0)' : 'translateX(12px)',
        opacity: visible && !leaving ? 1 : 0,
        transition: leaving
          ? 'transform 0.15s ease-in, opacity 0.15s ease-in'
          : 'transform 0.15s ease-out, opacity 0.15s ease-out',
      }}
    >
      <Icon size={15} style={{ color: t.iconColor, marginTop: 2, flexShrink: 0 }} />
      <div className="flex-1 min-w-0">
        <div
          className="text-sm font-semibold leading-tight"
          style={{ color: isDark ? '#fafafa' : t.titleColor }}
        >
          {item.title}
        </div>
        {item.description && (
          <div
            className="text-xs mt-0.5 leading-snug"
            style={{ color: isDark ? 'rgba(255,255,255,0.45)' : '#71717a' }}
          >
            {item.description}
          </div>
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={(e) => {
          e.stopPropagation();
          dismiss();
        }}
        className="shrink-0 mt-0.5 opacity-30 hover:opacity-60 transition-opacity"
      >
        <X size={13} style={{ color: t.titleColor }} />
      </button>
      {/* Drain bar */}
      <div
        className="absolute bottom-0 left-0 w-full h-[2px] origin-left"
        style={{ background: t.iconColor, opacity: 0.35, animation: 'drain 4.2s linear forwards' }}
      />
    </div>
  );
}

/* ── Context ──────────────────────────────────────────────────────────────── */
const Ctx = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: string) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  function push(type: ToastType, title: string, description?: string) {
    const id = Math.random().toString(36).slice(2, 9);
    setToasts((t) => [...t.slice(-4), { id, type, title, description }]);
  }

  const value: ToastCtx = {
    success: (t, d) => push('success', t, d),
    error: (t, d) => push('error', t, d),
    warning: (t, d) => push('warning', t, d),
    info: (t, d) => push('info', t, d),
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      <div
        className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 items-end pointer-events-none"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <ToastEl key={t.id} item={t} onDismiss={dismiss} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast must be inside ToastProvider');
  return ctx;
}
