/* ============================================================
   Air Tracker — Service Worker
   - Pre-caches local static assets
   - Runtime caches Google Fonts (CSS + WOFF2) for offline use
   ============================================================ */

const CACHE_NAME    = 'air-tracker-v2';
const FONT_CACHE    = 'air-tracker-fonts-v1';

const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon-180.png',
];

const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Use addAll with a permissive fallback so a single missing asset doesn't fail the install
      Promise.all(
        STATIC_ASSETS.map((url) =>
          cache.add(url).catch((err) => console.warn('SW skip cache:', url, err))
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== FONT_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Google Fonts: cache-first with background revalidate.
  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirstFont(req));
    return;
  }

  // Same-origin: cache-first then network
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirstStatic(req));
    return;
  }

  // Other origins: just try network, fall back to cache if available
  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});

async function cacheFirstStatic(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, res.clone());
    }
    return res;
  } catch (e) {
    // Last resort: return the index.html shell for navigation requests
    if (req.mode === 'navigate') {
      const fallback = await caches.match('./index.html');
      if (fallback) return fallback;
    }
    throw e;
  }
}

async function cacheFirstFont(req) {
  const cache = await caches.open(FONT_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    return cached || Response.error();
  }
}
