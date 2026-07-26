'use client';

/**
 * Install-as-app surfaces for Pragati.
 *
 * - PwaInstallBanner: soft top-of-content prompt (dismissible) when installable.
 * - PwaInstallButton: compact control for account menu / settings.
 * - PwaInstallSection: full Settings card with platform-specific guidance.
 */

import { Download, Share, X, Smartphone, CheckCircle2 } from 'lucide-react';
import { usePwa } from './PwaProvider';

export function PwaInstallBanner() {
  const { showBanner, canInstall, isIos, install, dismissBanner } = usePwa();
  if (!showBanner) return null;

  return (
    <div
      role="region"
      aria-label="Install Pragati"
      className="mx-auto max-w-[1400px] px-4 sm:px-6 pt-3"
    >
      <div className="flex items-start gap-3 rounded-xl border border-blue-200/80 dark:border-blue-400/20 bg-blue-50/90 dark:bg-blue-500/[0.08] px-3.5 py-3 shadow-sm">
        <span className="mt-0.5 shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
          <Download size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-bold text-slate-800 dark:text-white/90">
            Install Pragati
          </div>
          <p className="mt-0.5 text-[12px] leading-snug text-slate-600 dark:text-white/55">
            {isIos && !canInstall
              ? 'Add to your Home Screen for a full-screen app — tap Share, then “Add to Home Screen”.'
              : 'Pin it to your dock or home screen. Opens in its own window, like a native app.'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {canInstall && (
              <button
                type="button"
                onClick={() => void install()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold px-2.5 py-1.5 transition-colors"
              >
                <Download size={12} /> Install
              </button>
            )}
            {isIos && !canInstall && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-white/40">
                <Share size={12} /> Share → Add to Home Screen
              </span>
            )}
            <button
              type="button"
              onClick={dismissBanner}
              className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 dark:text-white/30 dark:hover:text-white/60 transition-colors"
            >
              Not now
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismissBanner}
          aria-label="Dismiss install prompt"
          className="shrink-0 p-1 rounded-md text-slate-400 hover:text-slate-600 dark:text-white/30 dark:hover:text-white/70 hover:bg-white/50 dark:hover:bg-white/[0.06] transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

/** Compact control for account menu — only renders when install is available. */
export function PwaInstallMenuItem({
  dark,
  onDone,
}: {
  dark?: boolean;
  onDone?: () => void;
}) {
  const { canInstall, isInstalled, isIos, install } = usePwa();
  if (isInstalled || (!canInstall && !isIos)) return null;

  // Chromium: fire the deferred install prompt. iOS has no prompt API — send
  // the user to Settings where the Share → Add to Home Screen steps live.
  if (!canInstall && isIos) {
    return (
      <a
        href="/settings#install-app"
        onClick={() => onDone?.()}
        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm font-semibold transition-colors ${
          dark
            ? 'text-white/70 hover:text-white hover:bg-white/5'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
        }`}
        title="How to add Pragati to your Home Screen"
      >
        <Download size={16} className={dark ? 'text-white/40' : 'text-slate-400'} />
        <span>Add to Home Screen</span>
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        void install().finally(() => onDone?.());
      }}
      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm font-semibold transition-colors ${
        dark
          ? 'text-white/70 hover:text-white hover:bg-white/5'
          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
      }`}
      title="Install Pragati on this device"
    >
      <Download size={16} className={dark ? 'text-white/40' : 'text-slate-400'} />
      <span>Install app</span>
    </button>
  );
}

/** Settings card with full install guidance. */
export function PwaInstallSection() {
  const { canInstall, isInstalled, isIos, install } = usePwa();

  return (
    <div id="install-app" className="card rounded-xl border overflow-hidden scroll-mt-6">
      <div className="section-head px-5 py-3.5 border-b flex items-center gap-2.5">
        <Smartphone size={15} className="text-blue-500 shrink-0" />
        <div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-white/90">Install app</h3>
          <p className="text-[11px] text-slate-400 dark:text-white/35 mt-0.5">
            Run Pragati from your home screen or dock — standalone window, push-ready.
          </p>
        </div>
      </div>
      <div className="p-5 space-y-3">
        {isInstalled ? (
          <div className="flex items-start gap-2.5 text-[13px] text-slate-600 dark:text-white/70">
            <CheckCircle2 size={16} className="text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-slate-800 dark:text-white/85">Installed on this device</div>
              <p className="text-[12px] text-slate-400 dark:text-white/35 mt-0.5 leading-snug">
                You&apos;re running the installed app. Live data still loads from the server — nothing
                is cached offline by design.
              </p>
            </div>
          </div>
        ) : canInstall ? (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void install()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-bold px-3 py-2 transition-colors"
            >
              <Download size={14} /> Install Pragati
            </button>
            <p className="text-[12px] text-slate-400 dark:text-white/35 leading-snug max-w-md">
              Opens in its own window. Uninstall anytime from your OS like any other app.
            </p>
          </div>
        ) : isIos ? (
          <ol className="text-[12.5px] text-slate-600 dark:text-white/65 space-y-1.5 list-decimal list-inside leading-snug">
            <li>
              Tap the <Share size={12} className="inline -mt-0.5" /> <strong>Share</strong> button in
              Safari
            </li>
            <li>
              Scroll and tap <strong>Add to Home Screen</strong>
            </li>
            <li>
              Confirm with <strong>Add</strong> — Pragati appears on your home screen
            </li>
          </ol>
        ) : (
          <p className="text-[12.5px] text-slate-500 dark:text-white/45 leading-snug">
            Use your browser&apos;s install option (Chrome / Edge: menu → <em>Install app</em> or the
            install icon in the address bar). Install works on HTTPS production deploys and
            localhost.
          </p>
        )}
      </div>
    </div>
  );
}
