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
    // A different database is a different wire: a cached ETag or push
    // snapshot from the old one would wrongly suppress pulls and pushes.
    if (typeof Sync.resetWire === 'function') Sync.resetWire();
    if (window.Store && typeof window.Store.save === 'function') {
      window.Store.save(); // persists config; queues a first push when now enabled
    }
    notify();
    return Sync.status();
  };

  /* ======================================================================
     THE HEALTH LINK
     ======================================================================
     A courier holding HealthKit permission (Health Auto Export) POSTs to a
     private inbox on a schedule. The app drains that inbox and merges what it
     finds. No file ever changes hands.

     THE INBOX IS A SIBLING OF THE SYNC PATH, not a child of it. Same database,
     separate top-level key with its own unguessable token — so the address you
     hand a third-party app cannot be walked up into your training log, and a
     leak exposes recent health metrics and nothing else.

     The token lives in state.sync, which is deleted before every push, so it
     never travels to the family database it points at. */

  function origin(u) {
    const m = /^(https?:\/\/[^/]+)/i.exec(String(u || ''));
    return m ? m[1] : '';
  }

  /* The shape of every inbox name this app will ever mint.

     It is published in two places that must agree byte for byte: here, and in
     the database rules the user pastes into the Firebase console (see
     Sync.rulesJson). If the generator drifts from the pattern, the rules stop
     matching and every delivery is rejected with a permission error that looks
     like the courier's fault. tests/db-rules.js pins them together.

     The bound is a MINIMUM, not the generator's exact 24, and that is
     deliberate. Addresses minted before the lockdown shipped came from a
     variable-length generator and are typically 27 characters. Publishing
     {24} would have 401'd every one of them the moment the user pasted the
     rules — precisely the "it looks like the courier's fault" failure this
     comment exists to prevent, and it would have hit the one person already
     using the feature. Nothing is given up: what protects an inbox is the
     entropy of a name you must already know in full, 16 base-36 characters is
     82 bits of it, and the rule opens nothing you could not already name.
     Anything shorter than the bound is caught by Sync.conformingInbox(). */
  Sync.HEALTH_INBOX_RE = /^health-[a-z0-9]{16,}$/;

  const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

  /* A token of EXACTLY n characters, drawn from crypto when the browser has it.

     The previous version concatenated Math.random().toString(36) slices, which
     yields a variable length — "0.5" is a legal result and contributes one
     character, not eight. That mattered more than it looks: this token is now
     the only thing standing between a stranger and the health inbox, so its
     length has to be a guarantee rather than an average. */
  function token(n) {
    const out = [];
    const limit = 256 - (256 % ALPHABET.length);   // reject above this: no modulo bias
    const g = window.crypto && window.crypto.getRandomValues
      ? function (len) { return window.crypto.getRandomValues(new Uint8Array(len)); }
      : null;
    while (out.length < n) {
      const need = n - out.length;
      const bytes = g ? g(need + 8) : null;
      for (let i = 0; i < need + 8 && out.length < n; i++) {
        const b = bytes ? bytes[i] : Math.floor(Math.random() * 256);
        if (b >= limit) continue;
        out.push(ALPHABET[b % ALPHABET.length]);
      }
    }
    return out.join('');
  }
  Sync.token = token;

  Sync.healthInbox = function () {
    const c = cfg();
    return c && c.health && c.health.inbox ? c.health.inbox : '';
  };

  // The address the courier posts to. Empty until paired, or if sync has no URL.
  Sync.healthInboxUrl = function () {
    const c = cfg();
    if (!c || !c.url) return '';
    const box = Sync.healthInbox();
    if (!box) return '';
    const o = origin(c.url);
    if (!o) return '';
    return o + '/' + box + '.json' + (c.secret ? '?auth=' + encodeURIComponent(c.secret) : '');
  };

  /* Would the published rules accept the address the courier is posting to?

     True when there is nothing to worry about — unpaired, or paired with a
     conforming name. False only when a real address exists that the rules
     would reject, which is a link that breaks the moment the user locks the
     database down and breaks SILENTLY: the courier keeps posting, Firebase
     keeps answering 401, and the app just stops seeing new data. Worth a
     screen. */
  Sync.conformingInbox = function () {
    const box = Sync.healthInbox();
    if (!box) return true;
    return Sync.HEALTH_INBOX_RE.test(box);
  };

  Sync.pairHealth = function () {
    const c = cfg();
    if (!c) return '';
    if (!c.health) c.health = { inbox: '', lastAt: null, lastSummary: null, lastRaw: '', outbox: false };
    // Long, unguessable, and its own secret — independent of the sync path so
    // rotating one does not disturb the other.
    c.health.inbox = 'health-' + token(24);
    if (window.Store && window.Store.save) window.Store.save();
    notify();
    return Sync.healthInboxUrl();
  };

  Sync.unpairHealth = function () {
    const c = cfg();
    if (!c || !c.health) return;
    c.health = { inbox: '', lastAt: null, lastSummary: null, lastRaw: '', outbox: false };
    if (window.Store && window.Store.save) window.Store.save();
    notify();
  };

  /* ======================================================================
     IS THE DATABASE ACTUALLY PRIVATE?
     ======================================================================
     The setup instructions say to start the database in test mode and append a
     long random path segment "to keep it private". The second half of that
     sentence was false, and had been since the first sync shipped.

     Test-mode rules are written at the ROOT:

         { "rules": { ".read": true, ".write": true } }

     Read permission in Firebase cascades DOWNWARD, so a rule at the root is a
     rule about the root: GET https://<project>.firebaseio.com/.json returns the
     entire database in one request. The random segment is never asked for. And
     the project name is not a secret — it is in the hostname, it is short, and
     it is usually the owner's name.

     So: a strangers' probe, sent WITHOUT the auth parameter (an attacker has no
     secret either), and a rules block that makes the path segments into real
     secrets by denying the root outright. */

  // The first path segment of the sync URL — the part that must be pinned.
  Sync.syncSegment = function () {
    const c = cfg();
    if (!c || !c.url) return '';
    const rest = String(c.url).slice(origin(c.url).length);
    const parts = rest.split('/').filter(function (p) { return p !== ''; });
    return parts.length ? decodeURIComponent(parts[0]) : '';
  };

  /* The rules to paste into Firebase console -> Realtime Database -> Rules.

     Root is denied, so nobody can enumerate what exists. The training path is
     pinned by name — read access cascades down, so children are covered. Health
     inboxes are matched by PATTERN rather than by name, because the app mints
     and rotates them on its own and a rule that had to be edited every time
     would simply stop being edited.

     Returns '' when the sync URL has no path segment, because there is nothing
     to pin: locking the root would lock the app out along with everyone else,
     and saying that plainly is better than emitting rules that break sync. */
  Sync.rulesJson = function () {
    const seg = Sync.syncSegment();
    if (!seg) return '';
    const pattern = String(Sync.HEALTH_INBOX_RE);
    return [
      '{',
      '  "rules": {',
      '    ".read": false,',
      '    ".write": false,',
      '',
      '    ' + JSON.stringify(seg) + ': {',
      '      ".read": true,',
      '      ".write": true',
      '    },',
      '',
      '    "$inbox": {',
      '      ".read": "$inbox.matches(' + pattern + ')",',
      '      ".write": "$inbox.matches(' + pattern + ')"',
      '    }',
      '  }',
      '}'
    ].join('\n');
  };

  /* Ask the database what an anonymous stranger can see.

     ?shallow=true returns keys only, so this costs one small response even on a
     large log. NO auth parameter is attached, deliberately and permanently: the
     question is what someone WITHOUT your secret can read, and sending the
     secret would answer a different question with a reassuring yes. */
  Sync.probeExposure = function () {
    const c = cfg();
    if (!c || !c.url) return Promise.resolve({ state: 'unknown', reason: 'Sync is not configured' });
    const o = origin(c.url);
    if (!o) return Promise.resolve({ state: 'unknown', reason: 'Sync URL is not a URL' });
    return request(o + '/.json?shallow=true', { method: 'GET' }).then(function (res) {
      if (res && (res.status === 401 || res.status === 403)) {
        return { state: 'locked', keys: 0 };
      }
      if (!res || !res.ok) {
        return { state: 'unknown', reason: 'HTTP ' + (res ? res.status : '?') };
      }
      return res.json().then(function (body) {
        let keys = 0;
        if (body && typeof body === 'object') { for (const k in body) keys++; }
        return { state: 'open', keys: keys };
      }, function () {
        return { state: 'open', keys: 0 };
      });
    }).catch(function (err) {
      return { state: 'unknown', reason: stripSecret(err) || 'probe failed' };
    });
  };

  /* One delivery, or a map of them. Firebase POST appends under a push key, so
     the inbox is usually { "-Nabc...": {delivery}, ... }; a PUT writes the
     delivery straight in. Handle both rather than betting on which verb the
     courier uses — that is not something this code can verify from here. */
  function deliveriesIn(payload) {
    if (!payload || typeof payload !== 'object') return [];
    if (payload.data || payload.metrics) return [payload];      // written by PUT
    const out = [];
    for (const k in payload) {
      const v = payload[k];
      if (v && typeof v === 'object') out.push(v);
    }
    return out;
  }

  /* Drains the inbox into healthSamples. Returns a summary; NEVER rejects, so
     a failing link degrades the status line instead of the app. */
  Sync.drainHealth = function () {
    const c = cfg();
    const AH = window.AppleHealth;
    const Store = window.Store;
    if (!c || !c.url || !Sync.healthInbox() || !AH || !Store) {
      return Promise.resolve({ ok: false, reason: 'not-configured' });
    }
    const url = Sync.healthInboxUrl();
    const user = Store.currentUser && Store.currentUser();
    if (!user) return Promise.resolve({ ok: false, reason: 'no-profile' });

    return request(url, { method: 'GET' }).then(function (res) {
      if (!res.ok) throw new Error('inbox HTTP ' + res.status);
      return res.json();
    }).then(function (payload) {
      const list = deliveriesIn(payload);
      if (!list.length) return { ok: true, empty: true, added: 0 };

      let rows = [];
      const kinds = {};
      const unknown = [];
      for (let i = 0; i < list.length; i++) {
        const parsed = AH.parseDelivery(list[i], user.id);
        rows = rows.concat(parsed.rows);
        for (const k in parsed.kinds) kinds[k] = (kinds[k] || 0) + parsed.kinds[k];
        parsed.unknown.forEach(function (n) { if (unknown.indexOf(n) < 0) unknown.push(n); });
      }
      const added = rows.length ? Store.addHealthSamples(rows) : 0;

      if (!c.health) c.health = {};
      c.health.lastAt = Date.now();
      c.health.lastSummary = { rows: rows.length, added: added, kinds: kinds, unknown: unknown };
      /* Keep the raw body of the newest delivery. If the courier's shape ever
         differs from what the parser expects, this is the difference between
         "nothing arrived, no idea why" and a five-minute fix. */
      try { c.health.lastRaw = JSON.stringify(list[list.length - 1]).slice(0, 4000); }
      catch (e) { c.health.lastRaw = ''; }
      Store.save();

      // Only clear the inbox once the rows are safely merged and saved.
      return request(url, { method: 'DELETE' }).then(function () {
        return { ok: true, added: added, rows: rows.length, kinds: kinds, unknown: unknown };
      }).catch(function () {
        // Merged but not cleared: the next drain re-merges the same rows, and
        // addHealthSamples is idempotent, so this is safe to shrug at.
        return { ok: true, added: added, rows: rows.length, kinds: kinds,
          unknown: unknown, uncleared: true };
      });
    }).catch(function (err) {
      return { ok: false, reason: stripSecret(err) || 'fetch failed' };
    });
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

  /* ---------- sync core: conditional pull -> merge -> diff push ----------

     P7 replaced the whole-blob protocol. It used to GET the entire state and
     PUT the entire state back on every sync — which meant every logged set,
     and now every habit tick, cost a full download AND a full upload. With
     ticks as the highest-frequency write in the app, that protocol was the
     bandwidth ceiling (Firebase meters download).

     PULL is conditional: the ETag of the last-seen remote rides if-none-match,
     so an unchanged database answers 304 and we skip the download and the
     merge outright. Servers that ignore if-none-match degrade gracefully —
     a 200 whose ETag matches the cached one is treated as a 304 after the
     download (CPU saved, bandwidth not; still correct).

     PUSH is a diff: each top-level collection is serialized and compared to
     what THIS DEVICE last successfully pushed; only changed keys go out, via
     PATCH, which writes the named keys and leaves siblings untouched. The
     remote layout is byte-identical to the old protocol (collections are keys
     of one root object), so a P0-era client full-PUTting the blob still
     round-trips everything — and our PATCH can never delete a newer client's
     unknown collection, because an unchanged key is never sent.

     lastPushed starts empty, so the first push of a session sends everything
     once (exactly the old behavior); the steady state sends only what moved. */

  let etag = null;           // ETag of the remote state this device last saw
  let lastPushed = {};       // collection name -> serialized form last pushed

  Sync.resetWire = function () { etag = null; lastPushed = {}; };

  function serializeState() {
    const state = window.Store.state;
    const out = {};
    for (const k in state) {
      if (k === 'sync') continue;   // url/secret/health inbox stay on-device
      out[k] = JSON.stringify(state[k] === undefined ? null : state[k]);
    }
    return out;
  }

  async function doSync() {
    const c = cfg();
    if (!c || !c.enabled || !c.url) return disabledResult();
    let pulled = false;
    try {
      const url = endpoint(c);
      const getHeaders = { 'X-Firebase-ETag': 'true' };
      if (etag) getHeaders['if-none-match'] = etag;
      const getRes = await request(url, { method: 'GET', headers: getHeaders });

      if (getRes.status === 304) {
        // Nothing changed remotely. No body, no merge.
      } else {
        if (!getRes.ok) throw await httpError(getRes);
        const freshTag = getRes.headers && typeof getRes.headers.get === 'function'
          ? getRes.headers.get('ETag') : null;
        if (freshTag && etag && freshTag === etag) {
          // The server ignored if-none-match but the state is the one we
          // already merged — same outcome as a 304, minus the bandwidth.
        } else {
          const remote = await getRes.json();
          if (remote !== null && remote !== undefined) {
            window.Store.mergeRemote(remote);
            pulled = true;
          }
        }
        if (freshTag) etag = freshTag;
      }

      // Diff push: only the keys whose bytes changed since our last push.
      const now = serializeState();
      const dirty = {};
      let dirtyCount = 0;
      for (const k in now) {
        if (now[k] !== lastPushed[k]) { dirty[k] = JSON.parse(now[k]); dirtyCount++; }
      }

      let pushed = false;
      if (dirtyCount > 0) {
        const patchRes = await request(url, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'X-Firebase-ETag': 'true' },
          body: JSON.stringify(dirty)
        });
        if (!patchRes.ok) throw await httpError(patchRes);
        for (const k in now) lastPushed[k] = now[k];
        // Our own write changed the remote's ETag. If the server told us the
        // new one, the next pull can still 304; if not, drop the cached tag so
        // the next pull is honestly full instead of wrongly skipped.
        const wroteTag = patchRes.headers && typeof patchRes.headers.get === 'function'
          ? patchRes.headers.get('ETag') : null;
        etag = wroteTag || null;
        pushed = true;
      }

      const c2 = cfg();
      if (c2) c2.lastSyncAt = Date.now();
      lastError = null;
      saveQuietly();
      return { ok: true, pulled: pulled, pushed: pushed };
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
