const CACHE_NAME = 'metalora-cache-v1';
const ASSETS = [
  '/',
  '/index.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => response || fetch(event.request))
  );
});

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.text() : '새로운 알림';
  event.waitUntil(
    self.registration.showNotification('METALORA', { body: data })
  );
});
