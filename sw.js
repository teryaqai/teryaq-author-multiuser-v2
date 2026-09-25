const CACHE = 'teryaq-master-tool-v2.5.12-script-reader-fixed-1';
const SCOPE_URL = new URL(self.registration.scope);
const ROOT_URL = SCOPE_URL.href;
const APP_SHELL_URL = new URL('index.html', SCOPE_URL).href;

const CORE_ASSETS = [
  ROOT_URL,
  APP_SHELL_URL,
  new URL('styles.v2.5.12.css', SCOPE_URL).href,
  new URL('platform.v2.5.12.js', SCOPE_URL).href,
  new URL('app.v2.5.12.js', SCOPE_URL).href,
  new URL('vendor/jszip.min.js', SCOPE_URL).href,
  new URL('vendor/JSZip-LICENSE.md', SCOPE_URL).href,
  new URL('manifest.webmanifest', SCOPE_URL).href,
  new URL('VERSION.json', SCOPE_URL).href,
  new URL('fonts/Tajawal-Regular.ttf', SCOPE_URL).href,
  new URL('fonts/Tajawal-Medium.ttf', SCOPE_URL).href,
  new URL('fonts/Tajawal-Bold.ttf', SCOPE_URL).href,
  new URL('icons/icon-192.png', SCOPE_URL).href,
  new URL('icons/icon-512.png', SCOPE_URL).href,
  new URL('icons/default-avatar.svg', SCOPE_URL).href,
  new URL('icons/ui/documents.svg', SCOPE_URL).href,
  new URL('icons/ui/success.svg', SCOPE_URL).href,
  new URL('icons/ui/conflict.svg', SCOPE_URL).href,
  new URL('icons/ui/sync.svg', SCOPE_URL).href,
  new URL('icons/ui/updates.svg', SCOPE_URL).href,
  new URL('icons/ui/guide.svg', SCOPE_URL).href,
  new URL('icons/ui/draft-figure.png', SCOPE_URL).href,
  new URL('icons/ui/import.png', SCOPE_URL).href,
  new URL('icons/ui/export.png', SCOPE_URL).href,
  new URL('icons/ui/sync.png', SCOPE_URL).href,
  new URL('icons/ui/blank-page.png', SCOPE_URL).href,
  new URL('icons/ui/two-document.png', SCOPE_URL).href,
  new URL('icons/ui/view.png', SCOPE_URL).href,
  new URL('icons/ui/list.png', SCOPE_URL).href,
  new URL('icons/ui/sync-cloud.png', SCOPE_URL).href,
  new URL('icons/ui/notifications.png', SCOPE_URL).href,
  new URL('icons/ui/settings.png', SCOPE_URL).href,
  new URL('icons/ui/back.png', SCOPE_URL).href,
  new URL('icons/ui/dashboard.png', SCOPE_URL).href,
  new URL('icons/ui/templates.png', SCOPE_URL).href,
  new URL('icons/ui/trash.png', SCOPE_URL).href,
  new URL('icons/ui/admin.png', SCOPE_URL).href,
  new URL('icons/ui/document.png', SCOPE_URL).href,
  new URL('icons/ui/date.png', SCOPE_URL).href,
  new URL('icons/ui/bullet-circle.png', SCOPE_URL).href,
  new URL('icons/ui/bullet-square.png', SCOPE_URL).href,
  new URL('icons/ui/bullet-rhomboid.png', SCOPE_URL).href,
  new URL('icons/ui/save.png', SCOPE_URL).href,
  new URL('icons/ui/conflict.png', SCOPE_URL).href,
  new URL('icons/ui/analytics.png', SCOPE_URL).href,
  new URL('icons/ui/users-access.png', SCOPE_URL).href,
  new URL('icons/ui/audit-log.png', SCOPE_URL).href,
  new URL('icons/ui/content-setup.png', SCOPE_URL).href,
  new URL('icons/ui/overview.png', SCOPE_URL).href,
  new URL('icons/ui/cloud-operations.png', SCOPE_URL).href,
  new URL('icons/ui/draft-text.png', SCOPE_URL).href,
  new URL('icons/ui/text-rtl.svg', SCOPE_URL).href,
  new URL('icons/ui/text-ltr.svg', SCOPE_URL).href,
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
