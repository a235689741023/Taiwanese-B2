// Service worker: precache app shell + data; audio served from the 'taigi-audio' cache (filled by the app).
const VERSION = '__VERSION__';
const SHELL = 'taigi-shell-' + VERSION;
const AUDIO = 'taigi-audio';
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('taigi-shell-') && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/audio/')) {
    e.respondWith(caches.open(AUDIO).then(async (c) => (await c.match(e.request, { ignoreSearch: true })) || fetch(e.request)));
    return;
  }
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('./', { cacheName: SHELL })));
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request)));
});
