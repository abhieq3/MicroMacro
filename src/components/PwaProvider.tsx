'use client';

/**
 * PWA bootstrap for Pragati.
 *
 * - Registers are handled by <ServiceWorkerRegister /> in the root layout.
 * - Captures `beforeinstallprompt` for a quiet, deferred install path.
 * - Install UI is gated: never a big banner; account-menu hint only after the
 *   user has actually used the app for ~2 weeks (see ELIGIBILITY below).
 * - Settings always exposes full install instructions (no gate).
 *
 * Design constraint: the SW does not offline-cache GxP data.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

type PwaContextValue = {
  canInstall: boolean;
  isInstalled: boolean;
  isIos: boolean;
  install: () => Promise<boolean>;
  /** Permanently hide the quiet account-menu install hint on this browser. */
  dismissHint: () => void;
  /**
   * Quiet account-menu install affordance is allowed.
   * Always false for a big banner (we don't ship one).
   */
  showInstallHint: boolean;
  /** @deprecated always false — big banners were removed. */
  showBanner: boolean;
  dismissBanner: () => void;
};

const PwaContext = createContext<PwaContextValue | null>(null);

const DISMISS_KEY = 'pragati_pwa_install_dismissed';
const FIRST_SEEN_KEY = 'pragati_pwa_first_seen';
const ACTIVE_DAYS_KEY = 'pragati_pwa_active_days';

/** Don't offer install until the user has lived with the product. */
const MIN_AGE_MS = 14 * 24 * 60 * 60 * 1000;
/** And opened the authed shell on at least this many distinct local days. */
const MIN_ACTIVE_DAYS = 5;

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const mq = window.matchMedia?.('(display-mode: standalone)').matches;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return !!(mq || iosStandalone);
}

function detectIos(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const iPadOs = navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(ua) || iPadOs;
}

function localDayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Record first-seen + today's active day. Pure localStorage; no server. */
function touchUsage(): { eligibleByAge: boolean; activeDays: number; dismissed: boolean } {
  let dismissed = false;
  let firstSeen = Date.now();
  let days: string[] = [];
  try {
    dismissed = localStorage.getItem(DISMISS_KEY) === '1';
    const rawFirst = localStorage.getItem(FIRST_SEEN_KEY);
    if (rawFirst && Number.isFinite(Number(rawFirst))) {
      firstSeen = Number(rawFirst);
    } else {
      localStorage.setItem(FIRST_SEEN_KEY, String(firstSeen));
    }
    try {
      days = JSON.parse(localStorage.getItem(ACTIVE_DAYS_KEY) || '[]');
      if (!Array.isArray(days)) days = [];
    } catch {
      days = [];
    }
    const today = localDayKey();
    if (!days.includes(today)) {
      days = [...days, today].slice(-90);
      localStorage.setItem(ACTIVE_DAYS_KEY, JSON.stringify(days));
    }
  } catch {
    /* private mode — never push install UI */
    return { eligibleByAge: false, activeDays: 0, dismissed: true };
  }
  return {
    eligibleByAge: Date.now() - firstSeen >= MIN_AGE_MS,
    activeDays: days.length,
    dismissed,
  };
}

export function PwaProvider({ children }: { children: ReactNode }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [eligible, setEligible] = useState(false);

  useEffect(() => {
    setIsInstalled(detectStandalone());
    setIsIos(detectIos());
    const usage = touchUsage();
    setDismissed(usage.dismissed);
    setEligible(usage.eligibleByAge && usage.activeDays >= MIN_ACTIVE_DAYS && !usage.dismissed);

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setIsInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', onBip);
    window.addEventListener('appinstalled', onInstalled);

    const mq = window.matchMedia?.('(display-mode: standalone)');
    const onMq = () => setIsInstalled(detectStandalone());
    mq?.addEventListener?.('change', onMq);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBip);
      window.removeEventListener('appinstalled', onInstalled);
      mq?.removeEventListener?.('change', onMq);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return false;
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      setDeferred(null);
      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [deferred]);

  const dismissHint = useCallback(() => {
    setDismissed(true);
    setEligible(false);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* private mode */
    }
  }, []);

  const canInstall = !!deferred && !isInstalled;
  // Quiet hint only: used the product for ~2 weeks, not dismissed, not installed.
  const showInstallHint =
    eligible && !isInstalled && !dismissed && (canInstall || isIos);

  const value = useMemo<PwaContextValue>(
    () => ({
      canInstall,
      isInstalled,
      isIos,
      install,
      dismissHint,
      showInstallHint,
      showBanner: false,
      dismissBanner: dismissHint,
    }),
    [canInstall, isInstalled, isIos, install, dismissHint, showInstallHint],
  );

  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>;
}

export function usePwa(): PwaContextValue {
  const ctx = useContext(PwaContext);
  if (!ctx) {
    return {
      canInstall: false,
      isInstalled: false,
      isIos: false,
      install: async () => false,
      dismissHint: () => {},
      showInstallHint: false,
      showBanner: false,
      dismissBanner: () => {},
    };
  }
  return ctx;
}
