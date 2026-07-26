'use client';

import { useEffect } from 'react';

/**
 * Registers `/sw.js` on every page (including login). Chrome's installability
 * criteria require an active service worker; registering only inside the
 * authed shell would delay install until after sign-in.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        // Pull a fresh SW on each load so deploys aren't stuck behind a tab.
        void reg.update();
      })
      .catch(() => {
        /* never block the shell */
      });
  }, []);
  return null;
}
