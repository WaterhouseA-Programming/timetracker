const CACHE = 'tt-tasks-v34';
// Use self.location so paths work whether served from / or a subpath (e.g. GitHub Pages)
const BASE  = self.location.pathname.replace(/sw\.js$/, '');
const SHELL = [
  BASE,
  BASE + 'index.html',
  BASE + 'manifest.json',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Always network-first for Firebase / Google APIs
  if (url.hostname.includes('firebase') || url.hostname.includes('google') || url.hostname.includes('gstatic')) return;
  // Network-first for HTML so updates are picked up immediately
  if (e.request.mode === 'navigate' || url.pathname.endsWith('.html')) {
    e.respondWith(
      fetch(e.request).then(res => {
        caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  // Cache-first for other assets
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      caches.open(CACHE).then(c => c.put(e.request, res.clone()));
      return res;
    }))
  );
});

// ── Watch alerts (Web Push from the tt-push Worker) ──
self.addEventListener('push', e => {
  let msg = {};
  try { msg = e.data ? e.data.json() : {}; } catch { msg = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(msg.title || '💡 Added from watch', {
    body: msg.body || '',
    icon: BASE + 'icon.svg',
    badge: BASE + 'icon.svg',
    tag: 'watch-' + Date.now(),
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const client = list.find(c => c.url.startsWith(self.registration.scope));
    if (client) { client.postMessage('open-ideas'); return client.focus(); }
    return self.clients.openWindow(BASE + '#ideas');
  }));
});
