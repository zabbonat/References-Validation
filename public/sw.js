// CheckIfExist Service Worker
// Provides offline support by caching the app shell and API responses

const CACHE_NAME = 'checkifexist-v1';

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

// Fetch: network-first strategy for API calls, cache-first for app shell
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // API calls (CrossRef, SemanticScholar, OpenAlex) — network only, don't cache
  if (
    url.hostname.includes('api.crossref.org') ||
    url.hostname.includes('api.semanticscholar.org') ||
    url.hostname.includes('api.openalex.org')
  ) {
    return; // Let the browser handle normally
  }

  // App shell and assets — cache-first, fallback to network
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        // Cache successful responses for static assets
        if (response.ok && (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.html'))) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback for navigation requests
        if (request.mode === 'navigate') {
          return caches.match('/References-Validation/index.html');
        }
      });
    })
  );
});
