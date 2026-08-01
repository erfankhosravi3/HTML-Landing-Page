/* IronLog service worker — cache-first app shell, network-first navigations. */
'use strict';

const CACHE_NAME = 'ironlog-v2p0';

const SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './js/util.js',
  './js/exercises.js',
  './js/store.js',
  './js/sync.js',
  './js/analytics.js',
  './js/charts.js',
  './js/musclemap.js',
  './js/applehealth.js',
  './js/app.js',
  './js/views-log.js',
  './js/views-library.js',
  './js/views-insights.js',
  './manifest.webmanifest',
  './icons/icon.svg'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
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
