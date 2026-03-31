/* ═══════════════════════════════════════════════
   RUPEETRACK — Service Worker (sw.js)
   Enables: Offline support, App install, Caching
   Strategy: Cache First for assets, Network First for Firebase
═══════════════════════════════════════════════ */

const CACHE_NAME    = 'rupeetrack-v3';
const OFFLINE_URL   = './offline.html';

// Files to cache for offline use
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './offline.html',
  './icons/icon-192.png',
  './icons/icon-512.png',
  // External CDN assets
  'https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap',
  'https://cdn.jsdelivr.net/npm/remixicon@4.2.0/fonts/remixicon.css',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
];

// ── INSTALL: Cache all static assets ──────────
self.addEventListener('install', event => {
  console.log('[SW] Installing RupeeTrack Service Worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching static assets');
        // Cache files one by one to avoid failing on CDN issues
        return Promise.allSettled(
          STATIC_ASSETS.map(url => cache.add(url).catch(err => console.warn('[SW] Failed to cache:', url, err)))
        );
      })
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: Clean old caches ─────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating RupeeTrack Service Worker...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ── FETCH: Smart caching strategy ─────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip Firebase requests — always need network for real-time data
  if (url.hostname.includes('firebase') ||
      url.hostname.includes('firebaseio') ||
      url.hostname.includes('googleapis.com/identitytoolkit') ||
      url.hostname.includes('anthropic.com')) {
    return;
  }

  // For HTML pages — Network First (get latest), fallback to cache
  if (event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request).then(r => r || caches.match(OFFLINE_URL)))
    );
    return;
  }

  // For CSS, JS, fonts, images — Cache First (fast load), fallback to network
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) return cachedResponse;
        return fetch(event.request)
          .then(response => {
            if (!response || response.status !== 200 || response.type === 'opaque') return response;
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
            return response;
          })
          .catch(() => {
            // Return offline fallback for images
            if (event.request.destination === 'image') return new Response('', { status: 200 });
          });
      })
  );
});

// ── BACKGROUND SYNC (future use) ──────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-transactions') {
    console.log('[SW] Background sync triggered');
  }
});

// ── PUSH NOTIFICATIONS (future use) ──────────
self.addEventListener('push', event => {
  if (event.data) {
    const data = event.data.json();
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/rupeetrack/icons/icon-192.png',
      badge: '/rupeetrack/icons/icon-96.png'
    });
  }
});
