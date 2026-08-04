'use strict';
/* Is the database actually private, and do the rules we hand out actually fit
   the app that has to live under them?

   Background: every version of this app before now told the user that a long
   random path segment kept their Firebase database private. It did not.
   Test-mode rules are written at the root and read permission cascades
   downward, so GET /.json returns everything and the segment is never asked
   for. The fix is a rules block the user pastes into the console — and a rules
   block is exactly the kind of artefact that rots, because nothing executes it.

   So these are the things that would break it silently:

     1. The inbox generator drifts from the pattern the rules match. Every
        delivery then 401s and it looks like the courier's fault.
     2. The probe attaches the auth secret, and cheerfully reports "locked"
        for a database that is wide open to everyone without one.
     3. The probe checks the sync path instead of the root — the one place
        where test-mode rules do NOT show up as a problem.
     4. The README and the app publish different patterns.

   Each of those is pinned below. */
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

let calls = [];
let reply = { ok: true, status: 200, body: {} };
global.fetch = function (url, opts) {
  calls.push({ url: String(url), method: (opts && opts.method) || 'GET' });
  if (reply.throw) return Promise.reject(new Error(reply.throw));
  return Promise.resolve({
    ok: reply.ok, status: reply.status,
    json: function () {
      if (reply.badJson) return Promise.reject(new Error('not json'));
      return Promise.resolve(reply.body);
    }
  });
};

function reset(url, secret) {
  storage.clear();
  Store.load();
  const u = Store.addUser({ name: 'Erfan' });
  Store.setCurrentUser(u.id);
  Sync.configure({ url: url === undefined ? 'https://fam-default-rtdb.firebaseio.com/ironlog-abc123' : url,
    secret: secret || '' });
  calls = [];
  return u;
}

(async function () {

  /* ==============================================================
     1. The token IS the secret now, so its length is a guarantee
     ============================================================== */
  reset();
  const seen = {};
  let shortest = 999, badChars = 0, offPattern = 0;
  for (let i = 0; i < 500; i++) {
    Sync.pairHealth();
    const box = Sync.healthInbox();
    if (!Sync.HEALTH_INBOX_RE.test(box)) offPattern++;
    const body = box.slice('health-'.length);
    if (body.length < shortest) shortest = body.length;
    if (!/^[a-z0-9]+$/.test(body)) badChars++;
    seen[box] = (seen[box] || 0) + 1;
  }
  eq(offPattern, 0, '500 minted inboxes ALL match the published pattern');
  eq(shortest, 24, 'every MINTED token is exactly 24 characters — never a short one');
  eq(badChars, 0, 'tokens stay inside [a-z0-9], the charset the rules allow');
  eq(Object.keys(seen).length, 500, '500 mints produced 500 distinct tokens');

  /* The old generator concatenated Math.random().toString(36) slices. On a
     browser without crypto that path is still live, so it gets the same test. */
  const realCrypto = global.crypto;   // getter-only on modern node, hence defineProperty
  Object.defineProperty(global, 'crypto', { value: undefined, configurable: true, writable: true });
  ok(window.crypto === undefined, 'the no-crypto branch is genuinely the one under test');
  let fallbackBad = 0, fallbackShort = 0;
  for (let i = 0; i < 200; i++) {
    Sync.pairHealth();
    const box = Sync.healthInbox();
    if (!Sync.HEALTH_INBOX_RE.test(box)) fallbackBad++;
    if (box.slice('health-'.length).length !== 24) fallbackShort++;
  }
  eq(fallbackBad, 0, 'the no-crypto fallback also produces conforming tokens');
  eq(fallbackShort, 0, 'and they are the same length — the old code could emit 13');
  Object.defineProperty(global, 'crypto', { value: realCrypto, configurable: true, writable: true });

  /* ==============================================================
     1b. Addresses that already exist, minted before the lockdown
     ==============================================================
     The one person using this feature paired on the previous build. If the
     published rules reject that address, locking the database down silently
     kills their health link: the courier keeps posting, Firebase keeps
     answering 401, and the app just stops seeing new data. That is the exact
     failure the pattern was supposed to prevent, aimed at the only user who
     could hit it. */
  reset();
  // What the old generator actually produced: uid (11) + two base-36 slices.
  const LEGACY = 'health-mkq3z8h4t2v9x1c7b5n0w6';       // 26, the common case
  const LEGACY_SHORT = 'health-mkq3z8h4t2v';             // 12, the pathological case
  ok(Sync.HEALTH_INBOX_RE.test(LEGACY),
    'a pre-lockdown address still passes the published rules');
  ok(!Sync.HEALTH_INBOX_RE.test(LEGACY_SHORT),
    'but a pathologically short one does not — those need re-minting');

  Store.state.sync.health.inbox = LEGACY;
  ok(Sync.conformingInbox(), 'a conforming address raises nothing');
  Store.state.sync.health.inbox = LEGACY_SHORT;
  ok(!Sync.conformingInbox(),
    'A NON-CONFORMING ADDRESS IS REPORTED, so the app can offer a new one ' +
    'instead of going quiet after the rules are published');
  Store.state.sync.health.inbox = '';
  ok(Sync.conformingInbox(), 'an unpaired link has nothing to warn about');
  Sync.pairHealth();
  ok(Sync.conformingInbox(), 'and a freshly minted address always conforms');

  /* ==============================================================
     2. The segment the rules have to pin
     ============================================================== */
  reset('https://fam-default-rtdb.firebaseio.com/ironlog-abc123');
  eq(Sync.syncSegment(), 'ironlog-abc123', 'the pinned segment is the first path element');

  reset('https://fam-default-rtdb.firebaseio.com/ironlog-abc123/sub/deeper');
  eq(Sync.syncSegment(), 'ironlog-abc123', 'a nested URL still pins the TOP segment (rules cascade down)');

  reset('https://fam-default-rtdb.firebaseio.com/ironlog-abc123.json');
  eq(Sync.syncSegment(), 'ironlog-abc123', 'configure strips .json, so it never reaches the rules');

  reset('https://fam-default-rtdb.firebaseio.com/');
  eq(Sync.syncSegment(), '', 'a root URL has no segment to pin');
  eq(Sync.rulesJson(), '',
    'and emits NO rules — locking the root would lock the app out too');

  /* ==============================================================
     3. The rules block itself
     ============================================================== */
  reset('https://fam-default-rtdb.firebaseio.com/ironlog-abc123');
  const inboxUrl = Sync.pairHealth();
  const inbox = Sync.healthInbox();
  const text = Sync.rulesJson();

  let rules = null;
  try { rules = JSON.parse(text); } catch (e) { /* asserted next */ }
  ok(rules && rules.rules, 'the emitted rules are valid JSON with a "rules" root');
  const R = (rules && rules.rules) || {};

  eq(R['.read'], false, 'ROOT READ IS DENIED — this is the whole fix');
  eq(R['.write'], false, 'root write is denied');
  ok(R['ironlog-abc123'], 'the training path is pinned by name');
  eq(R['ironlog-abc123']['.read'], true, 'and is readable, so sync still works');
  eq(R['ironlog-abc123']['.write'], true, 'and writable');

  /* The drift pin. Rebuild the regex FROM THE RULES TEXT and run the app's own
     freshly minted inbox name through it. If the generator and the published
     pattern ever disagree, this is where it shows up — not in production, as a
     permission error the user reads as a broken courier. */
  ok(R.$inbox && typeof R.$inbox['.read'] === 'string', 'health inboxes are matched by pattern');
  const m = /\$inbox\.matches\(\/(.+)\/\)/.exec(R.$inbox['.read'] || '');
  ok(!!m, 'the wildcard rule is a .matches(/…/) expression Firebase understands');
  if (m) {
    const fromRules = new RegExp(m[1]);
    ok(fromRules.test(inbox),
      'THE RULES ACCEPT THE NAME THE APP ACTUALLY MINTS (' + inbox + ')');
    ok(!fromRules.test('ironlog-abc123'),
      'the wildcard does NOT also open the training path — that would undo the pinning');
    ok(!fromRules.test('health-short'), 'a short guessable name is rejected');
    ok(!fromRules.test('health-' + 'a'.repeat(24) + '/child'),
      'anchored at the end, so no walking down into a child path');
    ok(!fromRules.test('notahealth-' + 'a'.repeat(24)),
      'anchored at the start, so no prefixing your way in');
    ok(!fromRules.test('health-' + 'a'.repeat(23) + '.'),
      'punctuation is outside the charset the rules allow');
    eq(R.$inbox['.write'], R.$inbox['.read'],
      'read and write use the same pattern (the courier writes, the app reads and deletes)');
  }

  /* The two URLs the app itself uses must both be reachable under these rules. */
  ok(inboxUrl.indexOf('/' + inbox + '.json') !== -1, 'the inbox URL is the pinned inbox');
  ok(inboxUrl.indexOf('ironlog-abc123') === -1,
    'the inbox is still a SIBLING of the training path, not a child of it');

  /* ==============================================================
     4. The probe: it must ask the question a stranger would ask
     ============================================================== */
  reset('https://fam-default-rtdb.firebaseio.com/ironlog-abc123', 'SUPERSECRET');
  reply = { ok: true, status: 200, body: { 'ironlog-abc123': true, 'health-xyz': true } };
  let res = await Sync.probeExposure();
  eq(res.state, 'open', '200 on the root means anyone can read it');
  eq(res.keys, 2, 'and it reports how many top-level keys were exposed');

  eq(calls.length, 1, 'the probe is one request');
  const probeUrl = calls[0].url;
  eq(calls[0].method, 'GET', 'a read, never a write');
  ok(probeUrl.indexOf('auth=') === -1,
    'THE PROBE SENDS NO SECRET — with one attached it answers a different, ' +
    'reassuring question (got ' + probeUrl + ')');
  ok(probeUrl.indexOf('SUPERSECRET') === -1, 'the secret does not ride along in any form');
  ok(probeUrl.indexOf('ironlog-abc123') === -1,
    'it probes the ROOT, not the sync path — the sync path answers 200 either way');
  ok(/\/\.json\?shallow=true$/.test(probeUrl),
    'shallow=true, so a large log costs one small response (got ' + probeUrl + ')');

  reset('https://fam-default-rtdb.firebaseio.com/ironlog-abc123', 'SUPERSECRET');
  reply = { ok: false, status: 401, body: null };
  res = await Sync.probeExposure();
  eq(res.state, 'locked', '401 means the rules are doing their job');

  reset();
  reply = { ok: false, status: 403, body: null };
  res = await Sync.probeExposure();
  eq(res.state, 'locked', '403 counts as locked too');

  reset();
  reply = { ok: false, status: 500, body: null };
  res = await Sync.probeExposure();
  eq(res.state, 'unknown', 'a server error is NOT reported as safe');
  ok(String(res.reason).indexOf('500') !== -1, 'and says what happened');

  reset('https://fam-default-rtdb.firebaseio.com/ironlog-abc123', 'SUPERSECRET');
  reply = { throw: 'network down auth=SUPERSECRET' };
  res = await Sync.probeExposure();
  eq(res.state, 'unknown', 'an offline probe is unknown, not locked');
  ok(String(res.reason).indexOf('SUPERSECRET') === -1,
    'and the secret never reaches the error text the UI shows');

  reset();
  reply = { ok: true, status: 200, badJson: true };
  res = await Sync.probeExposure();
  eq(res.state, 'open', 'a 200 that will not parse is still a readable root');

  reset('');
  reply = { ok: true, status: 200, body: {} };
  res = await Sync.probeExposure();
  eq(res.state, 'unknown', 'unconfigured sync cannot be probed');
  eq(calls.length, 0, 'and makes no request');

  /* ==============================================================
     5. The README publishes the same pattern the code mints
     ============================================================== */
  const readme = fs.readFileSync(path.join(P.GYM, 'README.md'), 'utf8');
  const rm = /\$inbox\.matches\(\/(.+?)\/\)/.exec(readme);
  ok(!!rm, 'the README shows the $inbox rule');
  if (rm) {
    eq('/' + rm[1] + '/', String(Sync.HEALTH_INBOX_RE),
      'the README and the code publish the SAME pattern');
  }
  ok(/\.read"?\s*:\s*false/.test(readme), 'the README rules deny root read');
  ok(readme.indexOf('cascades') !== -1,
    'the README explains WHY the old advice was wrong, not just what to do now');

  /* The old false claim must be gone, not merely contradicted further down. */
  ok(!/random (path )?segment to keep it private/i.test(readme),
    'the "random segment keeps it private" claim is deleted');

  console.log('passed:', pass);
  if (fails.length) { fails.forEach(function (f) { console.log('FAIL:', f); }); process.exit(1); }
  console.log('PASS: database lockdown (' + pass + ' assertions)');
})().catch(function (e) {
  console.log('HARNESS ERROR:', e && e.stack || e);
  process.exit(1);
});
