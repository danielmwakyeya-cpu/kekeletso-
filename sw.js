// Keke's Days — service worker
// Cache-first for the app shell so it opens instantly and works with no
// signal (in placement, on the ward, on an overnight shift). Bump CACHE_NAME
// whenever you change index.html so returning devices pick up the update
// instead of being stuck on a stale cached copy.

const CACHE_NAME = 'kekes-days-v6';
const RUNTIME_CACHE = 'kekes-days-runtime-v1';

const APP_SHELL = [
  './',
  './index.html',
  './sw.js'
];

const OFFLINE_FALLBACK = './index.html';

// Install: cache the app shell
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching app shell');
        return cache.addAll(APP_SHELL);
      })
      .catch((err) => {
        console.error('[SW] Install error:', err);
      })
  );
  // Take control immediately after install
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            // Delete old versioned caches but keep the current ones
            if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .catch((err) => {
        console.error('[SW] Activation error:', err);
      })
  );
  // Claim clients immediately
  self.clients.claim();
});

// Fetch: cache-first strategy with network fallback
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const { method, url } = request;

  // Only handle GET requests
  if (method !== 'GET') {
    return;
  }

  // Handle HTML pages with network-first approach (better for updates)
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Only cache successful responses
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, copy);
            });
          }
          return response;
        })
        .catch(() => {
          // Return from cache or offline fallback
          return caches.match(request)
            .then((cached) => cached || caches.match(OFFLINE_FALLBACK));
        })
    );
    return;
  }

  // For everything else, use cache-first strategy
  event.respondWith(
    caches.match(request)
      .then((cached) => {
        if (cached) {
          return cached;
        }
        return fetch(request)
          .then((response) => {
            // Validate response before caching
            if (!response || response.status !== 200 || response.type === 'error') {
              return response;
            }

            // Clone and cache the response
            const copy = response.clone();
            caches.open(RUNTIME_CACHE)
              .then((cache) => {
                cache.put(request, copy);
              })
              .catch((err) => {
                console.warn('[SW] Cache.put error:', err);
              });

            return response;
          })
          .catch((err) => {
            console.warn('[SW] Fetch error:', err);
            // Return cached version if available, otherwise return offline page
            return caches.match(request)
              .then((cached) => cached || caches.match(OFFLINE_FALLBACK));
          });
      })
  );
});

// Handle messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
