'use strict';
/* Import is the one place a user hands the app a file from outside. It must
   never throw, never lose the existing log, and never accept junk as data.
   Everything here is a file a real person could plausibly produce: a truncated
   download, a wrong-app export, a hand-edited backup, a doubled merge. */
const P = require('./lib/paths');
const fs = require('fs'), path = require('path'), vm = require('vm');
const GYM = P.JS;

function freshStore() {
  const map = new Map();
  const sandbox = {
    localStorage: {
      getItem: function (k) { return map.has(k) ? map.get(k) : null; },
      setItem: function (k, v) { map.set(k, String(v)); },
      removeItem: function (k) { map.delete(k); }
    },
    console: console, JSON: JSON, Math: Math, Date: Date, Object: Object,
    Array: Array, String: String, Number: Number, isFinite: isFinite,
    parseInt: parseInt, parseFloat: parseFloat, setTimeout: setTimeout
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  ['util.js', 'exercises.js', 'store.js'].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(GYM, f), 'utf8'), sandbox, { filename: f });
  });
  return sandbox;
}

let pass = 0; const fails = [];
function ok(c, m) { if (c) pass++; else fails.push(m); }

// A known-good backup to mutate.
const seed = freshStore();
seed.Store.load();
const su = seed.Store.addUser({ name: 'Erfan' });
seed.Store.setCurrentUser(su.id);
seed.Store.addWorkout({ userId: su.id, date: '2026-08-01', kind: 'lift',
  entries: [{ exerciseId: 'back_squat', sets: [{ weightKg: 100, reps: 5 }] }] });
const GOOD = seed.Store.exportJSON();

const CASES = {
  'empty string': '',
  'not json': 'this is not json at all',
  'html error page': '<!doctype html><title>404</title>',
  'truncated mid-object': GOOD.slice(0, Math.floor(GOOD.length * 0.6)),
  'json null': 'null',
  'json array': '[1,2,3]',
  'json number': '42',
  'empty object': '{}',
  'wrong app export': JSON.stringify({ app: 'someOtherTracker', entries: [{ x: 1 }] }),
  'collections wrong type': JSON.stringify({ users: 'nope', workouts: {}, deleted: 5 }),
  'workout with no entries array': JSON.stringify({ users: [], workouts: [{ id: 'w1', userId: 'u1' }] }),
  'entries with nulls': JSON.stringify({ users: [], workouts: [{ id: 'w1', userId: 'u1', entries: [null, 5, 'x'] }] }),
  'sets not an array': JSON.stringify({ users: [], workouts: [{ id: 'w1', userId: 'u1',
    entries: [{ type: 'setwork', exerciseRef: 'dead_hang', sets: 'lots' }] }] }),
  'NaN-ish numbers': JSON.stringify({ users: [], workouts: [{ id: 'w1', userId: 'u1',
    entries: [{ exerciseId: 'x', sets: [{ weightKg: 'heavy', reps: null }] }] }] }),
  'huge nesting': JSON.stringify({ users: [], workouts: [{ id: 'w1', userId: 'u1',
    entries: [{ exerciseId: 'x', sets: [{ weightKg: 1e308, reps: 1e308 }] }] }] }),
  'ids not strings': JSON.stringify({ users: [{ id: 7, name: 'x' }], workouts: [{ id: null }] }),
  'prototype pollution attempt': '{"__proto__":{"polluted":true},"users":[],"workouts":[]}',
  'deleted map with junk': JSON.stringify({ users: [], workouts: [], deleted: { workouts: { a: 'soon', b: -1 } } }),
  'good backup': GOOD
};

for (const name in CASES) {
  const s = freshStore();
  s.Store.load();
  // pre-existing data that must survive a BAD import
  const u = s.Store.addUser({ name: 'Existing' });
  s.Store.setCurrentUser(u.id);
  s.Store.addWorkout({ userId: u.id, date: '2026-07-01', kind: 'lift',
    entries: [{ exerciseId: 'deadlift', sets: [{ weightKg: 80, reps: 3 }] }] });
  const before = s.Store.workoutsFor(u.id).length;

  let threw = null, result = null;
  try { result = s.Store.importJSON(CASES[name], { mode: 'merge' }); }
  catch (e) { threw = e; }

  const after = (function () {
    try { return s.Store.state.workouts.length; } catch (e) { return -1; }
  })();
  const usable = (function () {
    try { s.Store.addWorkout({ userId: u.id, date: '2026-07-02', kind: 'lift', entries: [] }); return true; }
    catch (e) { return false; }
  })();

  const good = name === 'good backup';
  ok(!threw, name + ': import does not throw (' + (threw && threw.message) + ')');
  ok(after >= before || good, name + ': existing workouts are not destroyed (' + before + ' -> ' + after + ')');
  ok(usable, name + ': the store still works afterwards');
  if (name === 'prototype pollution attempt') {
    ok(!({}).polluted && !s.Object.prototype.polluted, name + ': Object.prototype not polluted');
  }
}

console.log('passed:', pass);
if (fails.length) { fails.forEach(function (f) { console.log('FAIL:', f); }); process.exit(1); }
console.log('PASS: import fuzz (' + pass + ' assertions over ' + Object.keys(CASES).length + ' hostile files)');
