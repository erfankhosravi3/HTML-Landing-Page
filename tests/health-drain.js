'use strict';
/* The inbox drain, against a stand-in Firebase.
   Covers the shapes a courier actually produces (POST appends under a push
   key; PUT writes the object directly), and the failure modes that decide
   whether a missed morning costs you data. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const P = require('./lib/paths');

const storage = new Map();
global.localStorage = {
  getItem: function (k) { return storage.has(k) ? storage.get(k) : null; },
  setItem: function (k, v) { storage.set(k, String(v)); },
  removeItem: function (k) { storage.delete(k); }
};
global.window = global;
global.document = { createElement: function () { return {}; }, addEventListener: function () {} };
global.AbortController = undefined;
['util.js', 'exercises.js', 'store.js', 'applehealth.js', 'sync.js'].forEach(function (f) {
  vm.runInThisContext(fs.readFileSync(path.join(P.JS, f), 'utf8'), { filename: f });
});

let pass = 0; const fails = [];
function ok(c, m) { if (c) pass++; else fails.push(m); }
function eq(a, b, m) { ok(a === b, m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }

const DELIVERY = { data: { metrics: [
  { name: 'resting_heart_rate', units: 'bpm', data: [{ date: '2026-08-01', qty: 58 }] },
  { name: 'sleep_analysis', units: 'hr', data: [{ date: '2026-08-01', qty: 6.7 }] }
] } };

/* A stand-in Firebase: records every call, serves whatever we stage. */
let box = null;
let calls = [];
let failGet = false, failDelete = false;
global.fetch = function (url, opts) {
  const method = (opts && opts.method) || 'GET';
  calls.push({ method: method, url: String(url) });
  if (method === 'GET') {
    if (failGet) return Promise.reject(new Error('network down'));
    return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(box); } });
  }
  if (method === 'DELETE') {
    if (failDelete) return Promise.reject(new Error('delete refused'));
    box = null;
    return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(null); } });
  }
  return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(null); } });
};

function reset() {
  storage.clear();
  Store.load();
  const u = Store.addUser({ name: 'Erfan' });
  Store.setCurrentUser(u.id);
  Sync.configure({ url: 'https://fam-default-rtdb.firebaseio.com/ironlog-abc123' });
  calls = []; failGet = false; failDelete = false;
  return u;
}

(async function () {
  /* ---------- pairing ---------- */
  let u = reset();
  eq(Sync.healthInboxUrl(), '', 'no inbox URL before pairing');
  const url1 = Sync.pairHealth();
  ok(/^https:\/\/fam-default-rtdb\.firebaseio\.com\/health-[a-z0-9]{12,}\.json$/.test(url1),
    'pairing mints a sibling path with a long token (got ' + url1 + ')');
  ok(url1.indexOf('ironlog-abc123') === -1,
    'the inbox is NOT under the sync path — a leak cannot be walked into the training log');
  const url2 = Sync.pairHealth();
  ok(url1 !== url2, 're-pairing mints a NEW token, so the old address is dead');

  /* ---------- a POSTed delivery (push-keyed) ---------- */
  u = reset();
  Sync.pairHealth();
  box = { '-NabcPushKey1': DELIVERY };
  let r = await Sync.drainHealth();
  ok(r.ok, 'drain succeeded');
  eq(r.added, 2, 'both metrics merged');
  eq(Store.state.healthSamples.length, 2, 'rows are in the store');
  const hr = Store.state.healthSamples.find(function (s) { return s.kind === 'restingHR'; });
  eq(hr.value, 58, 'resting HR landed with the right value');
  eq(box, null, 'the inbox is cleared after a successful merge');
  eq(calls.filter(function (c) { return c.method === 'DELETE'; }).length, 1, 'exactly one DELETE');

  /* ---------- a PUT delivery (object written directly) ---------- */
  u = reset();
  Sync.pairHealth();
  box = DELIVERY;
  r = await Sync.drainHealth();
  eq(r.added, 2, 'a directly-written delivery is handled too (PUT, not POST)');

  /* ---------- several deliveries queued from missed mornings ---------- */
  u = reset();
  Sync.pairHealth();
  box = {
    k1: { data: { metrics: [{ name: 'step_count', data: [{ date: '2026-08-01', qty: 100 }] }] } },
    k2: { data: { metrics: [{ name: 'step_count', data: [{ date: '2026-08-02', qty: 200 }] }] } },
    k3: { data: { metrics: [{ name: 'step_count', data: [{ date: '2026-08-03', qty: 300 }] }] } }
  };
  r = await Sync.drainHealth();
  eq(r.added, 3, 'three queued mornings all land in one drain');

  /* ---------- the status the UI shows ---------- */
  const h = Store.state.sync.health;
  ok(h.lastAt > 0, 'last-delivery time recorded, so silence becomes visible');
  eq(h.lastSummary.added, 3, 'the summary records what was merged');
  ok(h.lastRaw.indexOf('step_count') !== -1,
    'the raw body of the newest delivery is kept — a mis-mapped payload is diagnosable, not silent');

  /* ---------- unknown metrics are surfaced ---------- */
  u = reset();
  Sync.pairHealth();
  box = { k: { data: { metrics: [{ name: 'blood_glucose', data: [{ date: '2026-08-01', qty: 5 }] }] } } };
  r = await Sync.drainHealth();
  eq(r.added, 0, 'an unmapped metric adds nothing');
  ok(r.unknown.indexOf('blood_glucose') >= 0,
    'but it is REPORTED, so "nothing arrived" has a reason attached');

  /* ---------- empty inbox is not an error ---------- */
  u = reset();
  Sync.pairHealth();
  box = null;
  r = await Sync.drainHealth();
  ok(r.ok && r.empty, 'an empty inbox is a normal, quiet success');

  /* ---------- failures never lose data and never throw ---------- */
  u = reset();
  Sync.pairHealth();
  box = { k: DELIVERY };
  failGet = true;
  r = await Sync.drainHealth();
  ok(!r.ok, 'a network failure reports rather than throwing');
  ok(String(r.reason).indexOf('network down') !== -1, 'and says what happened');
  eq(Store.state.healthSamples.length, 0, 'nothing was merged on a failed fetch');

  // DELETE fails: rows are merged, inbox stays. The next drain re-merges the
  // same rows, which must be harmless.
  u = reset();
  Sync.pairHealth();
  box = { k: DELIVERY };
  failDelete = true;
  r = await Sync.drainHealth();
  ok(r.ok && r.uncleared, 'a failed clear still reports success — the rows ARE merged');
  eq(Store.state.healthSamples.length, 2, 'rows merged despite the failed clear');
  failDelete = false;
  const before = Store.state.healthSamples.length;
  r = await Sync.drainHealth();               // same payload, second time
  eq(Store.state.healthSamples.length, before,
    'REPLAY of an uncleared inbox adds nothing — the merge is idempotent');

  /* ---------- the token never reaches the family database ---------- */
  u = reset();
  Sync.pairHealth();
  const token = Sync.healthInbox();
  ok(token.length > 12, 'the token is long');
  const pushed = Object.assign({}, Store.state);
  delete pushed.sync;                            // what sync.js pushes
  ok(JSON.stringify(pushed).indexOf(token) === -1,
    'the inbox token is absent from everything that gets pushed');

  /* ---------- the secret never appears in an error string ---------- */
  u = reset();
  Sync.configure({ url: 'https://fam-default-rtdb.firebaseio.com/ironlog-abc123', secret: 'SUPERSECRET' });
  Sync.pairHealth();
  failGet = true;
  r = await Sync.drainHealth();
  ok(String(r.reason).indexOf('SUPERSECRET') === -1, 'the auth secret is stripped from failures');

  console.log('passed:', pass);
  if (fails.length) fails.forEach(function (f) { console.log('FAIL:', f); });
  console.log(fails.length ? 'FAIL: health drain' : 'PASS: health drain (' + pass + ' assertions)');
  process.exit(fails.length ? 1 : 0);
})().catch(function (e) { console.error('HARNESS:', e.message, e.stack); process.exit(2); });
