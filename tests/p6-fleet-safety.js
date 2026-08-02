'use strict';
/* AT11 (fleet half): a P6 client's coachChats must survive a round-trip
   through an OLD client that has never heard of the collection. The old
   client is simulated the only honest way — by loading the store from the
   last commit that predates P6 and letting it normalize/merge P6 data. */
const P = require('./lib/paths');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');

const GYM = P.JS;
const TMP = '/tmp/p6-fleet';
// The last release BEFORE coachChats existed. This is the "old family phone"
// whose store must round-trip a collection it has never heard of.
const P5_REV = '2a58032';

// The P5 tree = "an old family phone".
fs.mkdirSync(TMP, { recursive: true });
for (const f of ['util.js', 'store.js']) {
  const old = execSync('git -C ' + JSON.stringify(P.REPO) + ' show ' + P5_REV + ':gym/js/' + f,
    { maxBuffer: 1 << 28 });
  fs.writeFileSync(path.join(TMP, f), old);
}

let pass = 0; const fails = [];
function ok(c, m) { if (c) pass++; else fails.push(m); }
function eq(a, b, m) { ok(a === b, m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }

function makeClient(dir, files) {
  const map = new Map();
  const sandbox = {
    localStorage: {
      getItem: function (k) { return map.has(k) ? map.get(k) : null; },
      setItem: function (k, v) { map.set(k, String(v)); },
      removeItem: function (k) { map.delete(k); }
    },
    console: console,
    JSON: JSON, Math: Math, Date: Date, Object: Object, Array: Array,
    String: String, Number: Number, isFinite: isFinite, parseInt: parseInt,
    setTimeout: setTimeout, clearTimeout: clearTimeout
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const f of files) {
    vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), sandbox, { filename: dir + '/' + f });
  }
  return { sandbox: sandbox, map: map };
}

/* ---- 1. a P6 client writes a coach conversation ---- */
const nu = makeClient(GYM, ['util.js', 'exercises.js', 'store.js']);
const S6 = nu.sandbox.Store;
S6.load();
const u = S6.addUser({ name: 'Erfan' });
S6.setCurrentUser(u.id);
S6.addWorkout({ userId: u.id, date: '2026-08-01', kind: 'lift',
  entries: [{ exerciseId: 'back_squat', sets: [{ weightKg: 100, reps: 5 }] }] });
S6.addChatMessage({ userId: u.id, role: 'user', text: 'what should I train?' });
S6.addChatMessage({ userId: u.id, role: 'assistant', text: 'Grip work.',
  question: 'How did the hangs feel?', usage: { input_tokens: 10, output_tokens: 5 } });
const newState = JSON.parse(JSON.stringify(S6.state));
eq(newState.coachChats.length, 2, 'P6 client stores the conversation');

/* ---- 2. an OLD (P5) client loads that state ---- */
const old = makeClient(TMP, ['util.js', 'store.js']);
old.map.set('ironlog/v1', JSON.stringify(newState));
const S5 = old.sandbox.Store;
S5.load();
ok(Array.isArray(S5.state.coachChats), 'P5 client preserves the unknown coachChats collection on load');
eq(S5.state.coachChats.length, 2, 'P5 client keeps both messages');
ok(!!S5.state.deleted.coachChats, 'P5 client preserves the unknown tombstone bucket');

/* the old client then does ordinary work and saves */
S5.addWorkout({ userId: u.id, date: '2026-08-02', kind: 'lift',
  entries: [{ exerciseId: 'back_squat', sets: [{ weightKg: 102, reps: 5 }] }] });
const roundTripped = JSON.parse(old.map.get('ironlog/v1'));
eq(roundTripped.coachChats.length, 2,
  'AT11: the conversation survives a save by a client that has never heard of it');
eq(roundTripped.coachChats[1].question, 'How did the hangs feel?',
  'AT11: unknown per-row fields survive too');

/* ---- 3. back to the P6 client ---- */
nu.map.set('ironlog/v1', JSON.stringify(roundTripped));
S6.load();
eq(S6.chatFor(u.id).length, 2, 'AT11: P6 client reads its conversation back intact');
eq(S6.workoutsFor(u.id).length, 2, 'the old client\'s workout came along');

/* ---- 4. a P6 tombstone must also survive ---- */
const removed = S6.chatFor(u.id)[0].id;
S6.clearChat(u.id);
ok(!!S6.state.deleted.coachChats[removed], 'P6 records tombstones for cleared chat');
old.map.set('ironlog/v1', JSON.stringify(S6.state));
S5.load();
ok(!!S5.state.deleted.coachChats && !!S5.state.deleted.coachChats[removed],
  'AT11: the P5 client preserves P6 tombstones, so a clear does not resurrect');

/* ---- 5. the key is not in any of this ---- */
ok(JSON.stringify(roundTripped).indexOf('sk-ant') === -1,
  'AT1: no key anywhere in the synced payload');

console.log('passed:', pass);
if (fails.length) { fails.forEach(function (f) { console.log('FAIL:', f); }); process.exit(1); }
console.log('PASS: p6 fleet safety (' + pass + ' assertions)');
