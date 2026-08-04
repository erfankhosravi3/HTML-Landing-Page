/* IronLog service worker — cache-first app shell, network-first navigations.
   RELEASE RULE: any deploy that changes a cached file MUST bump CACHE_NAME,
   or installed PWAs keep serving the old cache forever. */
'use strict';

/* Coach replies now stream, so js/coach.js, js/views-coach.js and
   css/styles.css all changed. */
const CACHE_NAME = 'ironlog-v2p16';

const SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './js/util.js',
  './js/exercises.js',
  './js/store.js',
  './js/sync.js',
  './js/analytics.js',
  './js/loadmodel.js',
  './js/guardrails.js',
  './js/protocols.js',
  './js/charts.js',
  './js/musclemap.js',
  './js/applehealth.js',
  './js/coach.js',
  './js/app.js',
  './js/views-log.js',
  './js/player.js',
  './js/views-library.js',
  './js/views-insights.js',
  './js/views-standards.js',
  './js/views-coach.js',
  './manifest.webmanifest',
  './icons/icon.svg'
];

/* INSTALL DOES NOT SKIP WAITING, deliberately.

   It used to. The effect was that a new worker activated the moment it
   finished installing and deleted the old cache out from under a page that
   was still running the OLD JavaScript — a mixed-version state the user could
   neither see nor resolve, since nothing on screen changed until they fully
   closed and reopened the app. That is how a shipped feature can be invisible
   for days.

   Now the new worker installs and WAITS. The page notices it waiting and
   offers an update; the switch happens only when the user takes it, and then
   the page reloads immediately, so old code and new cache never coexist. */
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) { return cache.addAll(SHELL); })
  );
});

// The page asks for the handover once the user has accepted it.
self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (key) {
          if (key !== CACHE_NAME) return caches.delete(key);
          return Promise.resolve();
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Never intercept cross-origin requests (Firebase sync etc.) — let the
  // network handle them directly, and never cache them.
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first so app updates land, cache fallback for offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(function (res) {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy); });
          }
          return res;
        })
        .catch(function () {
          return caches.match(req).then(function (hit) {
            return hit || caches.match('./index.html').then(function (idx) {
              return idx || caches.match('./');
            });
          });
        })
    );
    return;
  }

  // Everything else (shell assets): cache-first with network fallback.
  event.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy); });
        }
        return res;
      });
    })
  );
});
