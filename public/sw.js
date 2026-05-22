// CheckIfExist Service Worker
// Provides offline support by caching the app shell and API responses

const CACHE_NAME = 'checkifexist-v2';

// App shell files to cache on install
const APP_SHELL = [
  '/References-Validation/',
  '/References-Validation/index.html',
];

// Install: cache the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL);
    })
  );
  // Activate immediately
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch: Network-first for HTML, Cache-first for hashed assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // API calls — network only
  if (
    url.hostname.includes('api.crossref.org') ||
    url.hostname.includes('api.semanticscholar.org') ||
    url.hostname.includes('api.openalex.org')
  ) {
    return;
  }

  // HTML / Navigation requests: Network-first, fallback to cache
  if (request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/References-Validation/') {
    event.respondWith(
      fetch(request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      }).catch(() => {
        return caches.match(request).then((cached) => {
          return cached || caches.match('/References-Validation/index.html');
        });
      })
    );
    return;
  }

  // JS, CSS, Images, and other assets (which have hashes in Vite): Cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      }).catch(() => {
        // Ignore failures for assets
      });
    })
  );
});
