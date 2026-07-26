'use client';

/**
 * Minimal install surfaces for Pragati.
 *
 * - No full-width banner (never interrupts the work path).
 * - Account menu: one quiet line, only after ~14 days of use (see PwaProvider).
 * - Settings: always-available instructions (user-initiated).
 */

import { Download, Share, Smartphone, CheckCircle2 } from 'lucide-react';
import { usePwa } from './PwaProvider';

/** @deprecated Big banners removed — always renders null. */
export function PwaInstallBanner() {
  return null;
}

/** Compact control for account menu — only after eligibility + not installed. */
export function PwaInstallMenuItem({
  dark,
  onDone,
}: {
  dark?: boolean;
  onDone?: () => void;
}) {
  const { canInstall, isIos, install, showInstallHint } = usePwa();
  if (!showInstallHint) return null;

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
        title="Add Pragati to your Home Screen"
      >
        <Download size={16} className={dark ? 'text-white/40' : 'text-slate-400'} />
        <span>Install app</span>
      </a>
    );
  }

  if (!canInstall) return null;

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

/** Settings card — always available, never pushy. */
export function PwaInstallSection() {
  const { canInstall, isInstalled, isIos, install } = usePwa();

  return (
    <div id="install-app" className="card rounded-xl border overflow-hidden scroll-mt-6">
      <div className="section-head px-5 py-3.5 border-b flex items-center gap-2.5">
        <Smartphone size={15} className="text-blue-500 shrink-0" />
        <div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-white/90">Install app</h3>
          <p className="text-[11px] text-slate-400 dark:text-white/35 mt-0.5">
            Optional. Home screen / dock — live data still loads from the server.
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
                Running as an app. Nothing is cached offline by design.
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
              <Download size={14} /> Install
            </button>
            <p className="text-[12px] text-slate-400 dark:text-white/35 leading-snug max-w-md">
              Opens in its own window. Uninstall anytime from the OS.
            </p>
          </div>
        ) : isIos ? (
          <ol className="text-[12.5px] text-slate-600 dark:text-white/65 space-y-1.5 list-decimal list-inside leading-snug">
            <li>
              Tap <Share size={12} className="inline -mt-0.5" /> <strong>Share</strong> in Safari
            </li>
            <li>
              Tap <strong>Add to Home Screen</strong>
            </li>
            <li>
              Confirm with <strong>Add</strong>
            </li>
          </ol>
        ) : (
          <p className="text-[12.5px] text-slate-500 dark:text-white/45 leading-snug">
            Chrome / Edge: menu → <em>Install app</em>, or the install icon in the address bar
            (HTTPS or localhost).
          </p>
        )}
      </div>
    </div>
  );
}
