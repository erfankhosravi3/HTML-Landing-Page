/* IronLog — optional Firebase Realtime Database sync via plain REST fetch.
   Pull -> Store.mergeRemote -> push full state (minus sync config). The only
   module allowed to make network calls (besides the service worker). */
(function () {
  'use strict';

  const Sync = {};

  const TIMEOUT_MS = 15000;
  const PUSH_DEBOUNCE_MS = 2000;
  const AUTO_SYNC_MIN_MS = 60000;

  let inFlight = false;
  let lastError = null;
  let currentRun = null;    // promise of the sync currently on the wire
  let queuedRun = null;     // promise of the single coalesced follow-up sync
  let suppressQueue = false; // true while Sync itself calls Store.save() (no push loops)
  let lastAutoAt = 0;       // last auto-triggered sync (online/visibility), ms
  const listeners = [];

  /* ---------- config access (lazy — never touch Store at load time) ---------- */

  function cfg() {
    const Store = window.Store;
    if (!Store) return null;
    const state = Store.state || (typeof Store.load === 'function' ? Store.load() : null);
    return state && state.sync ? state.sync : null;
  }

  function disabledResult() {
    return { ok: false, pulled: false, pushed: false, error: 'Sync is not configured' };
  }

  /* ---------- status ---------- */

  Sync.enabled = function () {
    const c = cfg();
    return !!(c && c.enabled && c.url);
  };

  Sync.status = function () {
    const c = cfg();
    return {
      enabled: !!(c && c.enabled && c.url),
      lastSyncAt: c && c.lastSyncAt ? c.lastSyncAt : null,
      inFlight: inFlight,
      lastError: lastError
    };
  };

  Sync.onStatus = function (fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.push(fn);
    return function () {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  };

  function notify() {
    const s = Sync.status();
    for (const fn of listeners.slice()) {
      try { fn(s); } catch (e) { /* listener errors must not break sync */ }
    }
  }

  /* ---------- configure ---------- */

  Sync.configure = function (opts) {
    opts = opts || {};
    const c = cfg();
    if (!c) return Sync.status();
    let url = String(opts.url === undefined || opts.url === null ? '' : opts.url).trim();
    url = url.replace(/\/+$/, '');
    if (/\.json$/i.test(url)) url = url.slice(0, -5);
    url = url.replace(/\/+$/, '');
    c.url = url;
    c.secret = String(opts.secret === undefined || opts.secret === null ? '' : opts.secret).trim();
    c.enabled = !!url;
    lastError = null;
    if (window.Store && typeof window.Store.save === 'function') {
      window.Store.save(); // persists config; queues a first push when now enabled
    }
    notify();
    return Sync.status();
  };

  /* ---------- debounced push after local changes ---------- */

  const firePush = U.debounce(function () {
    if (Sync.enabled()) Sync.syncNow();
  }, PUSH_DEBOUNCE_MS);

  Sync.queuePush = function () {
    if (suppressQueue) return;      // Sync's own save of lastSyncAt — not a data change
    if (!Sync.enabled()) return;
    firePush();
  };

  /* ---------- HTTP helpers ---------- */

  function endpoint(c) {
    return c.url + '.json' + (c.secret ? '?auth=' + encodeURIComponent(c.secret) : '');
  }

  // Auth secrets must never leak into UI-visible error text.
  function stripSecret(msg) {
    let s = String(msg === null || msg === undefined ? '' : (msg && msg.message) || msg);
    const c = cfg();
    if (c && c.secret) {
      s = s.split(c.secret).join('***');
      const enc = encodeURIComponent(c.secret);
      if (enc !== c.secret) s = s.split(enc).join('***');
    }
    return s.replace(/auth=[^&\s"']+/gi, 'auth=***');
  }

  function request(url, opts) {
    opts = opts || {};
    let timer = null;
    if (typeof AbortController !== 'undefined') {
      const ctrl = new AbortController();
      opts.signal = ctrl.signal;
      timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
    }
    return Promise.resolve(window.fetch(url, opts)).then(
      function (res) {
        if (timer) clearTimeout(timer);
        return res;
      },
      function (err) {
        if (timer) clearTimeout(timer);
        if (err && err.name === 'AbortError') {
          throw new Error('Request timed out (' + TIMEOUT_MS / 1000 + 's)');
        }
        throw err;
      }
    );
  }

  async function httpError(res) {
    let detail = '';
    try {
      const body = JSON.parse(await res.text());
      if (body && typeof body.error === 'string') detail = body.error;
    } catch (e) { /* non-JSON error body — status alone is enough */ }
    return new Error('HTTP ' + res.status + (detail ? ': ' + detail : ''));
  }

  // Persist without re-triggering queuePush (Store.save() calls Sync.queuePush()).
  function saveQuietly() {
    const Store = window.Store;
    if (!Store || typeof Store.save !== 'function') return;
    suppressQueue = true;
    try { Store.save(); } finally { suppressQueue = false; }
  }

  /* ---------- sync core: pull -> merge -> push ---------- */

  async function doSync() {
    const c = cfg();
    if (!c || !c.enabled || !c.url) return disabledResult();
    let pulled = false;
    try {
      const url = endpoint(c);
      const getRes = await request(url, { method: 'GET' });
      if (!getRes.ok) throw await httpError(getRes);
      const remote = await getRes.json();
      if (remote !== null && remote !== undefined) {
        window.Store.mergeRemote(remote);
        pulled = true;
      }
      // Full serializable state, excluding the sync config (url/secret stay local).
      const payload = Object.assign({}, window.Store.state);
      delete payload.sync;
      const putRes = await request(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!putRes.ok) throw await httpError(putRes);
      const c2 = cfg();
      if (c2) c2.lastSyncAt = Date.now();
      lastError = null;
      saveQuietly();
      return { ok: true, pulled: pulled, pushed: true };
    } catch (err) {
      lastError = stripSecret(err) || 'Sync failed';
      return { ok: false, pulled: pulled, pushed: false, error: lastError };
    }
  }

  function runSync() {
    inFlight = true;
    notify();
    currentRun = doSync()
      .catch(function (err) { // safety net — doSync already never rejects
        lastError = stripSecret(err) || 'Sync failed';
        return { ok: false, pulled: false, pushed: false, error: lastError };
      })
      .then(function (res) {
        inFlight = false;
        currentRun = null;
        notify();
        return res;
      });
    return currentRun;
  }

  Sync.syncNow = function () {
    if (!Sync.enabled()) return Promise.resolve(disabledResult());
    if (inFlight && currentRun) {
      // Never two syncs on the wire: coalesce into one follow-up after this run.
      if (!queuedRun) {
        queuedRun = currentRun.then(function () {
          queuedRun = null;
          if (!Sync.enabled()) return disabledResult();
          return runSync();
        });
      }
      return queuedRun;
    }
    return runSync();
  };

  /* ---------- auto sync on reconnect / tab return (max once per 60s) ---------- */

  function maybeAutoSync() {
    if (!Sync.enabled()) return;
    const c = cfg();
    const last = Math.max(lastAutoAt, (c && Number(c.lastSyncAt)) || 0);
    if (Date.now() - last < AUTO_SYNC_MIN_MS) return;
    lastAutoAt = Date.now();
    Sync.syncNow();
  }

  if (typeof window.addEventListener === 'function') {
    window.addEventListener('online', maybeAutoSync);
  }
  const doc = window.document;
  if (doc && typeof doc.addEventListener === 'function') {
    doc.addEventListener('visibilitychange', function () {
      if (doc.visibilityState === 'visible') maybeAutoSync();
    });
  }

  window.Sync = Sync;
})();
