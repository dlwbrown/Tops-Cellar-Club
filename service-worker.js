/* Tops Cellar Selection service worker
   Responsibilities:
   1. Receive and display push notifications (the whole point of the install gate).
   2. Open the right screen when a notification is tapped.
   3. A conservative cache so the shell loads offline — never cache the SW itself.
   Bump CACHE_VERSION on every release so clients update. */

const CACHE_VERSION = 'cellar-v8';
const SHELL = ['/', '/index.html', '/css/tokens.css', '/css/app.css', '/js/app.js', '/js/config.js', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* Network-first for navigations (always try fresh content, fall back to cache offline). */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('/index.html')))
  );
});

/* PUSH: the admin broadcast / Edge Function delivers a payload here. */
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data && event.data.text() }; }
  const title = data.title || 'Tops Cellar Selection';
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    image: data.image || undefined,
    data: { url: data.link || '/' },
    vibrate: [60, 30, 60]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) { if ('focus' in w) { w.navigate(url); return w.focus(); } }
      return clients.openWindow(url);
    })
  );
});
