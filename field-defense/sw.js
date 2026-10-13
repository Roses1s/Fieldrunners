/* ==========================================================================
   sw.js — минимальный service worker для офлайн-работы.
   Кэширует оболочку игры, чтобы после первой загрузки она открывалась
   без сети (в самолёте / в метро).
   ========================================================================== */

const CACHE = 'field-defense-v1';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/main.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// cache-first, сеть как запасной вариант
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => undefined);
        return res;
      }).catch(() => cached || Response.error());
    })
  );
});
