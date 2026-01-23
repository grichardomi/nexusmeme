const CACHE_NAME = 'nexusmeme-v1';
const urlsToCache = [
  '/',
  '/favicon.png',
  '/apple-touch-icon.png',
  '/manifest.json',
];

// Install event - cache essential resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip API calls - always fetch fresh
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(
          JSON.stringify({ error: 'Offline - API unavailable' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // Cache first for static assets
  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) {
        // Update cache in background
        fetch(event.request)
          .then((newResponse) => {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, newResponse);
            });
          })
          .catch(() => {
            // Network failed, use cached version
          });
        return response;
      }

      return fetch(event.request)
        .then((response) => {
          // Cache successful responses for static content
          if (
            response.ok &&
            (event.request.url.includes('.js') ||
              event.request.url.includes('.css') ||
              event.request.url.includes('.png') ||
              event.request.url.includes('.jpg') ||
              event.request.url.includes('.svg'))
          ) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Network failed, try cache
          return caches.match(event.request);
        });
    })
  );
});
