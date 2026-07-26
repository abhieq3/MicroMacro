/* Pragati service worker
 *
 * Purpose: make the app installable as a PWA and deliver Web Push.
 * Intentionally does NOT cache app shells or API responses — Pragati is a
 * live database view (GxP-adjacent work), and a stale cache would show
 * stale status. Always go to the network for page data.
 *
 * BUILD_ID: 2026-07-26-ink-text — bump this comment on UX deploys so
 * clients that re-fetch sw.js always get a new byte stream.
 */

self.addEventListener('install', (event) => {
  // Activate immediately so a fresh deploy takes over without waiting for
  // every open tab to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    /* non-JSON payload — show a generic notification */
  }
  const title = data.title || 'Pragati';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      data: { url: data.url || '/' },
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'pragati-daily-brief', // one brief a day — replace, never stack
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) {
          w.navigate(url);
          return w.focus();
        }
      }
      return clients.openWindow(url);
    }),
  );
});
