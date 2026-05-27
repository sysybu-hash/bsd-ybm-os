/** PWA + Web Push — אל תיירט fetch ל-API, Next, או דומיינים חיצוניים */
const CACHE_NAME = 'bsd-ybm-os-v7';

const PRECACHE_URLS = [
  '/offline.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

/** בקשות שלא אמורות לעבור דרך ה-SW */
function shouldBypass(request) {
  const url = new URL(request.url);

  if (!isSameOrigin(url)) {
    return true;
  }

  if (request.method !== 'GET') {
    return true;
  }

  const path = url.pathname;
  if (path.startsWith('/api/')) return true;
  if (path.startsWith('/_next/')) return true;
  if (path.startsWith('/auth/')) return true;

  return false;
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(PRECACHE_URLS).catch(() => undefined),
    ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        ),
      ),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener('fetch', (event) => {
  if (shouldBypass(event.request)) {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => response)
        .catch(() =>
          caches.match('/offline.html').then(
            (offline) =>
              offline ||
              new Response('Offline', {
                status: 503,
                headers: { 'Content-Type': 'text/plain; charset=utf-8' },
              }),
          ),
        ),
    );
    return;
  }

  const url = new URL(event.request.url);
  const isPrecacheAsset = PRECACHE_URLS.includes(url.pathname);
  if (!isPrecacheAsset) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then(
          (cached) =>
            cached ||
            new Response('', { status: 504, statusText: 'Gateway Timeout' }),
        ),
      ),
  );
});

self.addEventListener('push', (event) => {
  let data = { title: 'BSD-YBM', body: '', url: '/os' };
  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch {
    data.body = event.data ? event.data.text() : data.body;
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'BSD-YBM', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'bsd-ybm',
      data: { url: data.url || '/os' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/os';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    }),
  );
});
