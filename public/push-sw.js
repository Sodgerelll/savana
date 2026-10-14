// Web Push handlers, pulled into the generated Workbox service worker through
// `workbox.importScripts` in vite.config.ts. Kept as its own file because the
// precaching service worker is generated at build time and cannot be edited by hand.

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'SAVANA';
  const options = {
    body: data.body || '',
    icon: '/pwa-192.png',
    badge: '/pwa-192.png',
    // The same tag replaces the earlier notification, so "order placed" followed by
    // "order paid" shows as one entry that rings again rather than two.
    tag: data.tag || 'savana',
    renotify: true,
    data: { url: data.url || '/account/orders' },
  };

  // Browsers (iOS in particular) revoke a subscription whose pushes are not shown.
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/account/orders', self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          if ('navigate' in client) {
            try {
              await client.navigate(target);
            } catch {
              // A client that cannot be navigated still came to the front.
            }
          }
          return;
        }
      }
      await self.clients.openWindow(target);
    }),
  );
});
