'use strict';
const CACHE = 'bauanalytix-pn98-shell-v2.2-20260922';
const ASSETS = ['./', './index.html', './styles.css', './storage.js', './app.js', './pdf.js', './vendor/jspdf.umd.min.js', './manifest.webmanifest', './bauanalytix_rz_farbe%20einzeln_klein.jpg', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable.png', './icons/app-qr.svg'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('bauanalytix-pn98-shell-') && name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data === 'ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(event.request, { ignoreSearch: event.request.mode === 'navigate' });
    if (cached) return cached;
    if (event.request.mode === 'navigate') return cache.match('./index.html');
    return fetch(event.request);
  })());
});
