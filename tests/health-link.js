'use strict';
/* The Health delivery parser, against payload shapes a real courier emits.
   
   This is coded against an interface I cannot exercise end to end: Health Auto
   Export runs on an iPhone, and its exact body shape is not verifiable from
   here. That is the same gap that let a malformed API schema ship. The
   response is a parser that accepts several plausible shapes, never throws on
   junk, and reports what it did NOT understand — plus these tests, which pin
   every shape and every unit conversion. */
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
global.document = { createElement: function () { return {}; } };
['util.js', 'exercises.js', 'store.js', 'applehealth.js'].forEach(function (f) {
  vm.runInThisContext(fs.readFileSync(path.join(P.JS, f), 'utf8'), { filename: f });
});

let pass = 0; const fails = [];
function ok(c, m) { if (c) pass++; else fails.push(m); }
function eq(a, b, m) { ok(a === b, m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }

const U1 = 'u1';

/* ---------- 1. Health Auto Export's documented shape ---------- */
const HAE = {
  data: {
    metrics: [
      { name: 'resting_heart_rate', units: 'bpm',
        data: [{ date: '2026-08-01 00:00:00 -0700', qty: 58 },
               { date: '2026-08-02 00:00:00 -0700', qty: 56 }] },
      { name: 'step_count', units: 'count',
        data: [{ date: '2026-08-01 00:00:00 -0700', qty: 11204 }] },
      { name: 'sleep_analysis', units: 'hr',
        data: [{ date: '2026-08-02 00:00:00 -0700', qty: 6.68 }] },
      { name: 'weight_body_mass', units: 'lb',
        data: [{ date: '2026-08-01 00:00:00 -0700', qty: 181.4 }] },
      { name: 'some_metric_we_do_not_map', units: 'x',
        data: [{ date: '2026-08-01 00:00:00 -0700', qty: 1 }] }
    ]
  }
};
const a = AppleHealth.parseDelivery(HAE, U1);
eq(a.rows.length, 5, 'HAE shape: every mapped point becomes a row');
eq(a.kinds.restingHR, 2, 'two resting-HR days');
const a0 = a.rows[0] || {};
eq(a0.date, '2026-08-01', 'the date is taken from the string, NOT reparsed through a timezone');
eq(a0.kind, 'restingHR', 'metric name mapped to our kind');
eq(a0.value, 58, 'value carried');
ok(a.unknown.indexOf('some_metric_we_do_not_map') >= 0,
  'an unmapped metric is REPORTED, not silently dropped');

/* the unit conversions that would otherwise corrupt real numbers */
const w = a.rows.find(function (r) { return r.kind === 'weightKg'; }) || {};
ok(Math.abs((w.value || 0) - 82.28) < 0.05, 'pounds converted to kg (got ' + w.value + ')');
const sl = a.rows.find(function (r) { return r.kind === 'sleepHours'; }) || {};
eq(sl.value, 6.68, 'hours left as hours');

/* ---------- 2. sleep in minutes and seconds ---------- */
function sleepOnly(units, qty) {
  const r = AppleHealth.parseDelivery({ data: { metrics: [
    { name: 'sleep_analysis', units: units, data: [{ date: '2026-08-02', qty: qty }] }] } }, U1);
  return r.rows[0] || {};
}
eq(sleepOnly('min', 401).value, 6.68, 'minutes converted to hours');
eq(sleepOnly('sec', 24060).value, 6.68, 'seconds converted to hours');
eq(sleepOnly('', 6.7).value, 6.7, 'no unit, plausible hours: left alone');
eq(sleepOnly('', 402).value, 6.7, 'no unit, implausible as hours: read as minutes');

/* ---------- 3. shapes other than HAE's ---------- */
const inner = AppleHealth.parseDelivery({ metrics: [
  { name: 'resting_heart_rate', data: [{ date: '2026-08-01', qty: 60 }] }] }, U1);
eq(inner.rows.length, 1, 'accepts the inner object posted directly');

const flat = AppleHealth.parseDelivery({ restingHR: { '2026-08-01': 61 } }, U1);
eq(flat.rows.length, 1, 'accepts a flat date-keyed map from a hand-built shortcut');
eq((flat.rows[0] || {}).value, 61, 'flat map value carried');

const asString = AppleHealth.parseDelivery(JSON.stringify(HAE), U1);
eq(asString.rows.length, 5, 'accepts a JSON string body');

/* ---------- 4. junk must never throw ---------- */
const JUNK = [null, undefined, '', 'not json', 0, [], {}, { data: null }, { data: { metrics: 'nope' } },
  { data: { metrics: [null, 5, { name: 'x' }] } },
  { data: { metrics: [{ name: 'step_count', data: [{ date: 'garbage', qty: 5 },
    { date: '2026-08-01', qty: 'NaN' }, { qty: 5 }, null] }] } }];
let threw = null;
JUNK.forEach(function (j, i) {
  try {
    const r = AppleHealth.parseDelivery(j, U1);
    ok(r && Array.isArray(r.rows), 'junk[' + i + ']: returns a usable result');
  } catch (e) { threw = 'junk[' + i + ']: ' + e.message; }
});
ok(!threw, 'no payload throws — ' + threw);
eq(AppleHealth.parseDelivery({ data: { metrics: [{ name: 'step_count',
  data: [{ date: 'garbage', qty: 5 }] }] } }, U1).rows.length, 0,
  'an unparseable date drops that point rather than inventing one');

/* ---------- 5. it merges idempotently into the store ---------- */
Store.load();
const u = Store.addUser({ name: 'Erfan' });
Store.setCurrentUser(u.id);
const rows = AppleHealth.parseDelivery(HAE, u.id).rows;
const first = Store.addHealthSamples(rows);
const second = Store.addHealthSamples(rows);          // the courier retried
eq(first, 5, 'first delivery adds one row per (kind,date)');
eq(second, 0, 'REPLAY adds nothing — a retry or a double-run is a no-op');
const stored = Store.state.healthSamples.filter(function (s) { return s.userId === u.id; });
eq(stored.length, 5, 'still five rows after the replay');

/* a later delivery for the same day UPDATES rather than duplicating */
Store.addHealthSamples([{ userId: u.id, date: '2026-08-01', kind: 'restingHR', value: 55, source: 'link' }]);
const hr = Store.state.healthSamples.filter(function (s) {
  return s.userId === u.id && s.kind === 'restingHR' && s.date === '2026-08-01'; });
eq(hr.length, 1, 'same day+kind stays a single row');
eq((hr[0] || {}).value, 55, 'the newer value wins');

/* ---------- 6. the credential stays off the wire ---------- */
Store.state.sync.health = { inbox: 'INBOX-SECRET-TOKEN', lastAt: 1, lastSummary: null, lastRaw: '', outbox: false };
Store.save();
ok(Store.exportJSON().indexOf('INBOX-SECRET-TOKEN') !== -1,
  'the inbox token IS in the device state (it has to be, to work)');
// ...but sync.js deletes state.sync before pushing; assert that contract holds.
const src = fs.readFileSync(path.join(P.JS, 'sync.js'), 'utf8');
ok(/delete\s+payload\.sync/.test(src),
  'sync.js still strips the whole sync block before pushing — the inbox address never reaches the family database');

/* and it survives a reload, because normalizeState whitelists sync keys */
Store.load();
eq(Store.state.sync.health.inbox, 'INBOX-SECRET-TOKEN',
  'the health link survives a reload (it is in the sync whitelist)');

console.log('passed:', pass);
if (fails.length) { fails.forEach(function (f) { console.log('FAIL:', f); }); process.exit(1); }
console.log('PASS: health link parser (' + pass + ' assertions)');
