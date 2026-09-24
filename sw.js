const CACHE = 'teryaq-master-tool-v2.5.0';
const SCOPE_URL = new URL(self.registration.scope);
const ROOT_URL = SCOPE_URL.href;
const APP_SHELL_URL = new URL('index.html', SCOPE_URL).href;

const CORE_ASSETS = [
  ROOT_URL,
  APP_SHELL_URL,
  new URL('styles.v2.5.0.css', SCOPE_URL).href,
  new URL('platform.v2.5.0.js', SCOPE_URL).href,
  new URL('app.v2.5.0.js', SCOPE_URL).href,
  new URL('vendor/jszip.min.js', SCOPE_URL).href,
  new URL('vendor/JSZip-LICENSE.md', SCOPE_URL).href,
  new URL('manifest.webmanifest', SCOPE_URL).href,
  new URL('VERSION.json', SCOPE_URL).href,
  new URL('fonts/Tajawal-Regular.ttf', SCOPE_URL).href,
  new URL('fonts/Tajawal-Medium.ttf', SCOPE_URL).href,
  new URL('fonts/Tajawal-Bold.ttf', SCOPE_URL).href,
  new URL('icons/icon-192.png', SCOPE_URL).href,
  new URL('icons/icon-512.png', SCOPE_URL).href,
];

const OPTIONAL_ASSETS = [];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE_ASSETS);
    await Promise.allSettled(OPTIONAL_ASSETS.map(asset => cache.add(asset)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function cachedAppShell(request) {
  return (await caches.match(request, { ignoreSearch: true }))
    || (await caches.match(APP_SHELL_URL, { ignoreSearch: true }))
    || (await caches.match(ROOT_URL, { ignoreSearch: true }));
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Safari/iPad may relaunch at /, /index.html, or a URL with a query string.
  // Treat every navigation as the same cached application shell.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          const cache = await caches.open(CACHE);
          await Promise.all([
            cache.put(APP_SHELL_URL, response.clone()),
            cache.put(ROOT_URL, response.clone()),
          ]);
        }
        return response;
      } catch (_) {
        const cached = await cachedAppShell(request);
        return cached || new Response('TERYAQ Master Tool is not cached yet. Connect once, reopen the app online, then try again offline.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;

    try {
      const response = await fetch(request);
      if (response && response.ok) {
        const cache = await caches.open(CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    } catch (_) {
      return caches.match(APP_SHELL_URL, { ignoreSearch: true });
    }
  })());
});
