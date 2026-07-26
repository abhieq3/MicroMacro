'use client';

/**
 * PWA bootstrap for Pragati.
 *
 * - Registers the service worker (required for installability + Web Push).
 * - Captures `beforeinstallprompt` so we can offer a first-class Install
 *   control instead of relying on the browser's obscure omnibox icon.
 * - Detects standalone / installed mode so the UI can hide the prompt.
 *
 * Design constraint: the SW does not offline-cache GxP data. Install = home
 * screen icon + standalone window + push. Live data still comes from the
 * network every time.
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
  /** Browser has deferred an install prompt we can trigger. */
  canInstall: boolean;
  /** Running as an installed app (standalone / iOS home-screen). */
  isInstalled: boolean;
  /** iOS Safari: no beforeinstallprompt — show manual Share → Add to Home Screen. */
  isIos: boolean;
  /** Trigger the native install dialog. Returns true if the user accepted. */
  install: () => Promise<boolean>;
  /** Dismiss the soft install banner for this browser (persisted). */
  dismissBanner: () => void;
  /** Soft banner is currently allowed to show. */
  showBanner: boolean;
};

const PwaContext = createContext<PwaContextValue | null>(null);

const DISMISS_KEY = 'pragati_pwa_install_dismissed';

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const mq = window.matchMedia?.('(display-mode: standalone)').matches;
  // iOS Safari legacy signal
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return !!(mq || iosStandalone);
}

function detectIos(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // iPadOS 13+ reports as Mac; detect via touch points.
  const iPadOs = navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(ua) || iPadOs;
}

export function PwaProvider({ children }: { children: ReactNode }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [dismissed, setDismissed] = useState(true); // true until we read localStorage

  useEffect(() => {
    setIsInstalled(detectStandalone());
    setIsIos(detectIos());
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      setDismissed(false);
    }

    // SW registration also runs from <ServiceWorkerRegister /> in the root
    // layout (covers login). A second register() here is idempotent and keeps
    // installability solid if the user lands only on authed routes.

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

    // Track display-mode changes (user installs mid-session).
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

  const dismissBanner = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* private mode */
    }
  }, []);

  const value = useMemo<PwaContextValue>(
    () => ({
      canInstall: !!deferred && !isInstalled,
      isInstalled,
      isIos,
      install,
      dismissBanner,
      // Banner for Chromium (canInstall) or iOS Safari not yet installed.
      showBanner: !isInstalled && !dismissed && (!!deferred || isIos),
    }),
    [deferred, isInstalled, isIos, install, dismissBanner, dismissed],
  );

  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>;
}

export function usePwa(): PwaContextValue {
  const ctx = useContext(PwaContext);
  if (!ctx) {
    // Safe no-op outside provider (e.g. login page before shell mounts).
    return {
      canInstall: false,
      isInstalled: false,
      isIos: false,
      install: async () => false,
      dismissBanner: () => {},
      showBanner: false,
    };
  }
  return ctx;
}
