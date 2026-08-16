'use strict';
/* The split wire protocol, against a stand-in Firebase.

   The old protocol GET the whole state and PUT the whole state back on every
   sync. With habit ticks about to become the app's highest-frequency write,
   that made every tap cost a full download and a full upload — the bandwidth
   ceiling identified in the database review. The new protocol pulls
   conditionally (ETag / if-none-match) and pushes a diff (PATCH of only the
   collections whose bytes changed since this device's last push).

   What would break it silently:
     1. The diff quietly regressing to push-everything (the split undone).
     2. if-none-match never sent, so 304 can never happen (download ceiling
        back, invisibly — everything still works).
     3. A 200 whose ETag matches the cached one still merging (wasted CPU,
        but worse: masks that the conditional path is dead).
     4. A stale ETag surviving our own PATCH, or a database switch — a wrong
        304 there means a skipped pull of real changes.
     5. The PATCH body growing a 'sync' key (device credentials uploaded).
   Each is pinned below, then re-verified by mutation. */
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

/* ---- the stand-in Firebase ---- */
let calls = [];
let remoteBody = null;        // body served on GET 200
let remoteTag = 'tag-1';      // current server ETag
let honor304 = true;          // whether the server honors if-none-match
let tagOnWrite = true;        // whether writes answer with the new ETag

function resp(status, body, tag) {
  return {
    ok: status >= 200 && status < 300,
    status: status,
    headers: { get: function (h) { return h.toLowerCase() === 'etag' ? (tag || null) : null; } },
    json: function () { return Promise.resolve(body); }
  };
}

global.fetch = function (url, opts) {
  opts = opts || {};
  const method = opts.method || 'GET';
  const call = { method: method, url: String(url), headers: opts.headers || {},
    body: opts.body ? JSON.parse(opts.body) : null };
  calls.push(call);
  if (method === 'GET') {
    const inm = call.headers['if-none-match'];
    if (honor304 && inm && inm === remoteTag) return Promise.resolve(resp(304, null, remoteTag));
    return Promise.resolve(resp(200, remoteBody, remoteTag));
  }
  if (method === 'PATCH') {
    remoteTag = 'tag-w' + calls.length;
    if (remoteBody && typeof remoteBody === 'object') Object.assign(remoteBody, call.body);
    else remoteBody = call.body;
    return Promise.resolve(resp(200, null, tagOnWrite ? remoteTag : null));
  }
  return Promise.resolve(resp(200, null, null));
};

function gets() { return calls.filter(function (c) { return c.method === 'GET'; }); }
function patches() { return calls.filter(function (c) { return c.method === 'PATCH'; }); }
function lastPatch() { const p = patches(); return p.length ? p[p.length - 1] : null; }

function reset() {
  storage.clear();
  Store.load();
  const u = Store.addUser({ name: 'Erfan' });
  Store.setCurrentUser(u.id);
  Sync.configure({ url: 'https://fam-default-rtdb.firebaseio.com/ironlog-abc123' });
  calls = []; remoteBody = null; remoteTag = 'tag-1'; honor304 = true; tagOnWrite = true;
  return u;
}

(async function () {

  /* ---------- 1. first sync pushes everything, once ---------- */
  reset();
  let r = await Sync.syncNow();
  ok(r.ok && r.pushed, 'first sync succeeds and pushes');
  let g = gets()[0];
  ok(g.headers['X-Firebase-ETag'] === 'true', 'the pull asks for an ETag');
  ok(!('if-none-match' in g.headers), 'no if-none-match before any ETag is known');
  let p = lastPatch();
  ok(!!p, 'the push is a PATCH, not a PUT');
  ok('workouts' in p.body && 'users' in p.body && 'deleted' in p.body,
    'the first push carries the full state');
  ok(!('sync' in p.body), 'the sync key (credentials, health inbox) is NEVER pushed');

  /* ---------- 2. idle sync: 304, no merge, no push ---------- */
  calls = [];
  r = await Sync.syncNow();
  ok(r.ok, 'idle sync succeeds');
  eq(gets().length, 1, 'idle sync is one GET');
  g = gets()[0];
  ok(g.headers['if-none-match'] === remoteTag, 'the cached ETag rides if-none-match');
  eq(patches().length, 0, 'NOTHING DIRTY, NOTHING PUSHED — no PATCH at all');
  eq(r.pushed, false, 'and the result says so');

  /* ---------- 3. one change pushes one collection ---------- */
  calls = [];
  Store.addWorkout({ userId: Store.state.currentUserId, date: '2026-08-01', entries: [] });
  r = await Sync.syncNow();
  p = lastPatch();
  ok(!!p, 'a change produces a push');
  const keys = Object.keys(p.body);
  ok(keys.indexOf('workouts') !== -1, 'the changed collection is in the PATCH');
  ok(keys.length <= 2, 'THE SPLIT: only what changed goes out (got: ' + keys.join(', ') + ')');
  ok(keys.indexOf('users') === -1, 'untouched collections stay home');

  /* ---------- 4. steady state: 50 tick-sized cycles ---------- */
  let fatPushes = 0, totalPatches = 0;
  for (let i = 0; i < 50; i++) {
    calls = [];
    Store.state.painLog.push({ id: 'p' + i, userId: Store.state.currentUserId, date: '2026-08-01' });
    Store.save();
    await Sync.syncNow();
    const pp = lastPatch();
    if (pp) {
      totalPatches++;
      if (Object.keys(pp.body).length > 1) fatPushes++;
    }
  }
  eq(totalPatches, 50, 'every cycle pushed');
  eq(fatPushes, 0, '50 CYCLES, 50 SINGLE-COLLECTION PUSHES — the ceiling is gone');

  /* ---------- 5. degraded server: 200 with the same ETag ---------- */
  calls = [];
  honor304 = false;                    // server ignores if-none-match
  let merges = 0;
  const realMerge = Store.mergeRemote;
  Store.mergeRemote = function (s) { merges++; return realMerge.call(Store, s); };
  r = await Sync.syncNow();
  ok(r.ok, 'degraded pull still succeeds');
  eq(merges, 0, 'a 200 with an unchanged ETag merges nothing');
  eq(r.pulled, false, 'and reports pulled:false');

  /* ---------- 6. a real remote change merges ---------- */
  calls = [];
  remoteTag = 'tag-other-device';
  remoteBody = { workouts: [], users: Store.state.users, deleted: {} };
  r = await Sync.syncNow();
  ok(merges >= 1, 'a new ETag with new data DOES merge');
  ok(r.pulled, 'and reports pulled:true');
  Store.mergeRemote = realMerge;

  /* ---------- 7. write without an ETag answer drops the cache ---------- */
  reset();
  await Sync.syncNow();                // establish etag + snapshot
  tagOnWrite = false;
  Store.addWorkout({ userId: Store.state.currentUserId, date: '2026-08-02', entries: [] });
  await Sync.syncNow();                // PATCH answered with no ETag
  calls = [];
  await Sync.syncNow();                // next pull must be honestly full
  g = gets()[0];
  ok(!('if-none-match' in g.headers),
    'after an ETag-less write the cached tag is DROPPED — never a wrong 304 against our own push');

  /* ---------- 8. write WITH an ETag answer keeps 304s alive ---------- */
  reset();
  await Sync.syncNow();
  Store.addWorkout({ userId: Store.state.currentUserId, date: '2026-08-03', entries: [] });
  await Sync.syncNow();                // tagOnWrite=true: response carried the new tag
  calls = [];
  r = await Sync.syncNow();
  g = gets()[0];
  ok(g.headers['if-none-match'] === remoteTag, 'the write\'s ETag becomes the next conditional pull');
  eq(patches().length, 0, 'and nothing re-pushes');

  /* ---------- 9. switching databases resets the wire ---------- */
  Sync.configure({ url: 'https://other-db.firebaseio.com/ironlog-zzz' });
  calls = [];
  await Sync.syncNow();
  g = gets()[0];
  ok(!('if-none-match' in g.headers), 'a new database gets no stale ETag');
  p = lastPatch();
  ok(p && 'users' in p.body && 'workouts' in p.body,
    'and receives the full state again (fresh push snapshot)');

  /* ---------- 10. unknown collections from newer clients survive ---------- */
  reset();
  remoteBody = { futureStuff: [{ id: 'f1', mystery: true }], users: [], workouts: [] };
  remoteTag = 'tag-future';
  await Sync.syncNow();
  ok(Array.isArray(Store.state.futureStuff) || (Store.state.futureStuff && typeof Store.state.futureStuff === 'object'),
    'an unknown collection merged from remote rides local state (P0 shim)');
  const pushedKeys = Object.keys(lastPatch().body);
  ok(pushedKeys.indexOf('sync') === -1, 'sync still never pushed alongside it');

  console.log('passed:', pass);
  if (fails.length) { fails.forEach(function (f) { console.log('FAIL:', f); }); process.exit(1); }
  console.log('PASS: sync split (' + pass + ' assertions)');
})().catch(function (e) {
  console.log('HARNESS ERROR:', e && e.stack || e);
  process.exit(1);
});
