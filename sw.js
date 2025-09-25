/* Service Worker for Weather PWA
 * - Precaches static assets
 * - Runtime caching for OpenWeather API (network-first with fallback)
 */
const CACHE_STATIC = 'static-v3';
const CACHE_RUNTIME = 'runtime-v3';
const PRECACHE = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.map((key) => {
        if (![CACHE_STATIC, CACHE_RUNTIME].includes(key)) {
          return caches.delete(key);
        }
      })
    );
  })());
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.hostname.endsWith('openweathermap.org')) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (PRECACHE.some((path) => url.pathname.endsWith(path.replace('./', '/')))) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  const cache = await caches.open(CACHE_RUNTIME);
  cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_RUNTIME);
  try {
    const response = await fetch(request);
    cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw error;
  }
}
