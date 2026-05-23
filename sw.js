/* MyFit (gym-plan) service worker — v3.7
 *
 * Goal: make the app load offline (flaky gym wifi) WITHOUT ever stranding the
 * phone on a stale version. Strategy:
 *   - HTML / navigations  → NETWORK-FIRST: always try the live index.html when
 *     online (so a fresh GitHub Pages deploy is picked up immediately), and only
 *     fall back to the cached shell when the network fails.
 *   - JSONbin API + any cross-origin (YouTube etc.) → PASS THROUGH untouched
 *     (never cached, never intercepted) so cloud sync behaves exactly as before.
 *   - Non-GET (PUT/POST cloud writes) → never intercepted.
 *
 * Rollback: if anything misbehaves, bump CACHE_VERSION (purges old caches), or
 * unregister via the browser. The app also works with no SW at all — this only
 * adds offline + faster loads. The in-app "Update" button still clears caches
 * and hard-reloads.
 */
var CACHE_VERSION = 'myfit-cache-v1';
var SHELL = ['index.html', './'];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_VERSION).then(function (c) {
      return c.addAll(SHELL).catch(function () { /* offline at install — fine */ });
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) { return k === CACHE_VERSION ? null : caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;                       // never touch cloud writes
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;         // JSONbin / YouTube pass through

  var isHTML = req.mode === 'navigate' ||
               (req.headers.get('accept') || '').indexOf('text/html') !== -1;

  if (isHTML) {
    // Network-first: fresh when online, cached shell when offline.
    e.respondWith(
      fetch(req)
        .then(function (res) {
          var copy = res.clone();
          caches.open(CACHE_VERSION).then(function (c) { c.put(req, copy); });
          return res;
        })
        .catch(function () {
          return caches.match(req).then(function (m) {
            return m || caches.match('index.html') || caches.match('./');
          });
        })
    );
    return;
  }

  // Any other same-origin GET: cache-first with network fallback.
  e.respondWith(caches.match(req).then(function (m) { return m || fetch(req); }));
});
