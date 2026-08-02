'use strict';
/* Node harness for gym/js/player.js — P4.5 ONE LIVE SESSION, unit level.
   Binding acceptance tests 1, 3, 4 and 6:
     1. `_sid` never persists: fixtures through save / finish / merge / import
        contain no '_'-prefixed key at workout, entry or set level, and a
        P1-era client sim round-trips a player-written workout unchanged.
     3. Retarget/orphan rules: every authoritative timer<->edit rule asserted.
     4. Pace precedence resolves per the chain; the tapped button wins;
        the defaults table is honored per kind.
     6. holdSec is ALWAYS the seconds ACTUALLY held (early stop AND overtime).
   Plus: the shadow state is gone (acceptance 8, unit half), the draft
   projection, chain semantics (set/exercise/session, driven rests, no
   trailing rest), the boundary rule, and the cadence/tempo modifier.

   No browser: Session drives the draft through a stubbed localStorage and an
   injected clock. Player.Session is the app's ONE timing engine — views-log.js
   binds itself as its host and holds no timer slot of its own, which is why
   every rule below can be proven here with no DOM at all. */
const P = require('./lib/paths');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const GYM = P.JS;
// P1-era copies of util.js and store.js: the "old family phone" this suite
// merges against. Kept as fixtures because the point is to test against code
// that no longer exists in HEAD.
const SCRATCH = require('path').join(__dirname, 'fixtures');

const storageMap = new Map();
global.localStorage = {
  getItem: function (k) { return storageMap.has(k) ? storageMap.get(k) : null; },
  setItem: function (k, v) { storageMap.set(k, String(v)); },
  removeItem: function (k) { storageMap.delete(k); },
  clear: function () { storageMap.clear(); },
  get length() { return storageMap.size; },
  key: function (i) { return Array.from(storageMap.keys())[i]; }
};
global.window = global;

function loadScript(file) {
  vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file });
}
loadScript(path.join(GYM, 'util.js'));
loadScript(path.join(GYM, 'exercises.js'));
loadScript(path.join(GYM, 'store.js'));
loadScript(path.join(GYM, 'analytics.js'));
loadScript(path.join(GYM, 'player.js'));

const S = Player.Session;
const DRAFT_KEY = 'ironlog/activeWorkout';
const LEGACY_KEY = 'ironlog/activeSession';

let failures = 0;
let count = 0;
function assert(cond, msg) {
  count++;
  if (cond) console.log('ok  - ' + msg);
  else { failures++; console.log('FAIL- ' + msg); }
}
function eq(a, b, msg) {
  const good = JSON.stringify(a) === JSON.stringify(b);
  if (!good) console.log('   got=' + JSON.stringify(a) + '\n  want=' + JSON.stringify(b));
  assert(good, msg);
}
function clone(x) { return JSON.parse(JSON.stringify(x)); }

/* ---------------- fake clock + fake draft host ---------------- */

let T0 = 1770000000000;   // fixed epoch — every elapsed assertion is exact
let clock = T0;
S.__setNow(function () { return clock; });
function at(ms) { clock = T0 + ms; }
function advance(ms) { clock += ms; S.tick(); }

// The host mirrors views-log's contract: getDraft returns the live object and
// saveDraft persists it then calls Session.reconcile() — THE choke point.
let hostDraft = null;
let saves = 0;
S.bind({
  getDraft: function () { return hostDraft; },
  saveDraft: function () {
    if (!hostDraft) return;
    saves++;
    localStorage.setItem(DRAFT_KEY, JSON.stringify(hostDraft));
    S.reconcile();
  },
  clearDraft: function () { hostDraft = null; }
});

function setDraft(d) {
  hostDraft = d;
  S.backfill(d);
  localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  S.reconcile();
  return d;
}
function edit(fn) {           // any builder edit -> saveDraft -> reconcile
  fn(hostDraft);
  localStorage.setItem(DRAFT_KEY, JSON.stringify(hostDraft));
  S.reconcile();
}
function sid(entryId, i) {
  const en = S.entryOf(entryId);
  return S.sidOf(en.sets[i]);
}
function setOf(entryId, i) { return S.entryOf(entryId).sets[i]; }

/* ---------------- users ---------------- */

localStorage.clear();
Store.load();
const perfUser = Store.addUser({ name: 'Erfan', settings: { trainingProfile: 'performance', units: 'kg' } });
const simpleUser = Store.addUser({ name: 'Amu Reza' });
Store.setCurrentUser(perfUser.id);

/* ================= 0. the shadow state is GONE (acceptance 8) ================= */

localStorage.setItem(LEGACY_KEY, JSON.stringify({ v: 1, routine: { items: [] }, startedAt: 1, stepIdx: 3 }));
assert(localStorage.getItem(LEGACY_KEY) !== null, 'A8 a stale P3.5 session key can exist on disk');
assert(Player.resumePending() === null, 'A8 resumePending() never resurrects a P3.5 session');
assert(localStorage.getItem(LEGACY_KEY) === null, 'A8 the stale ironlog/activeSession is discarded on boot');
assert(Player.resume() === false, 'A8 Player.resume() refuses (there is nothing to resume)');
assert(Player.discardLegacySession() === false, 'A8 discarding twice is a safe no-op');
assert(typeof Player.compile === 'function', 'compile survives as a pure projection');
assert(typeof Player.projectDraft === 'function', 'projectDraft is the live counterpart');
const srcP = fs.readFileSync(path.join(GYM, 'player.js'), 'utf8');
assert(!/S\.actuals|S\.compiled\b/.test(srcP.split('*/').slice(1).join('*/')),
  'no S.actuals / S.compiled shadow state left in the code');
assert(srcP.indexOf("localStorage.setItem(LEGACY_SESSION_KEY") < 0,
  'nothing ever writes ironlog/activeSession again');

/* ================= 1. draft seeding + set identity ================= */

const routine = {
  id: 'rt_1', name: 'Durability B', kind: 'durability', restSec: 20,
  items: [
    { exerciseId: 'dead_hang', sets: 3, targetHoldSec: 45 },
    { exerciseId: 'side_plank', sets: 1, targetHoldSec: 30 },
    { exerciseId: 'split_squat', sets: 2, targetReps: 8, targetWeightKg: 20 }
  ]
};
let d = Player.draftFromRoutine(routine, { userId: perfUser.id, routineRef: 'rt_1' });
assert(d.entries.length === 3, 'draftFromRoutine makes one entry per item');
assert(d.entries[0].type === 'setwork' && d.entries[0].exerciseRef === 'dead_hang',
  'hold item seeds a setwork entry (exerciseRef, never exerciseId)');
assert(!('exerciseId' in d.entries[0]), 'FORBIDDEN exerciseId never appears on a setwork entry');
// P4.5 binding rule (ARCHITECTURE.md): a routine target is a PRESCRIPTION and
// must NEVER be seeded into the field the finish flow reads as an observation.
// It rides on the draft-local '_t' keys instead; the builder renders those as
// placeholders. (This assertion used to demand the opposite — that is exactly
// the phantom-writes defect: finishing an untouched guided session saved work
// nobody did.)
assert(d.entries[0].sets.length === 3 && !('holdSec' in d.entries[0].sets[0]),
  'hold targets NEVER prefill the observation field');
assert(d.entries[0].sets.every(function (s) { return s._tHoldSec === 45; }),
  'hold targets ride along as _tHoldSec');
assert(d.entries[1].sets.length === 2 && d.entries[1].sets[0].side === 'L' && d.entries[1].sets[1].side === 'R',
  'perSide setwork item expands L then R');
assert(d.entries[2].exerciseId === 'split_squat' && d.entries[2].type === undefined,
  'weight_reps item seeds a plain LIFT entry (volume/PR credit)');
assert(!('side' in d.entries[2].sets[0]), 'lift sets never carry a side');
assert(d.entries[2].sets.length === 4, 'perSide lift item expands to two plain sets per prescribed set');
eq(Object.keys(d.entries[2].sets[0]).filter(function (k) { return k.charAt(0) !== '_'; }).sort(),
  ['done', 'reps', 'rpe', 'type', 'weightKg'],
  'seeded lift set keys stay inside the four persisted ones (+ the builder done flag)');
assert(d.entries[2].sets[0].reps === 0 && d.entries[2].sets[0].weightKg === 0,
  'a seeded lift set is BLANK — the prescription is not an observation');
assert(d.entries[2].sets.every(function (s) { return s._tReps === 8 && s._tWeightKg === 20; }),
  'the lift prescription rides on _tReps / _tWeightKg');
assert(d._routine.id === 'rt_1' && d._routine.restSec === 20, 'routine layer rides draft._routine');
assert(d._view === 'builder', 'durability opens in the builder');
assert(Player.draftFromRoutine({ kind: 'circuit', rounds: 2, items: [{ name: 'Burpees', targetReps: 10 }] })._view === 'focus',
  'circuits open in focus by default');

setDraft(d);
const E0 = d.entries[0].id;
const E1 = d.entries[1].id;
const E2 = d.entries[2].id;
assert(!!sid(E0, 0) && sid(E0, 0) !== sid(E0, 1), 'backfill mints a unique _sid per set');
const keepSid = sid(E0, 1);
edit(function () { /* any save */ });
assert(sid(E0, 1) === keepSid, '_sid is stable across saves (it is persisted in the draft blob)');
assert(JSON.parse(localStorage.getItem(DRAFT_KEY)).entries[0].sets[1]._sid === keepSid,
  '_sid round-trips through the draft blob so a reload keeps the binding');
const found = S.findSet(E0, keepSid);
assert(found && found.si === 1, 'findSet resolves (entryId, _sid) to a live set');
assert(S.findSet(E0, 'nope') === null, 'findSet on a dead sid returns null');

/* ================= 2. pace precedence + defaults table (acceptance 4) ================= */

eq(S.PACE_DEFAULTS, {
  durability: 'set', stretch: 'set', lift: 'off', circuit: 'session',
  interval: 'set', cardio: 'off', mixed: 'off'
}, 'A4 defaults table is the binding one (lift off, circuit session)');
assert(S.kindOfEntry(S.entryOf(E0)) === 'durability', 'A4 hold setwork entry is kind durability');
assert(S.kindOfEntry(S.entryOf(E2)) === 'lift', 'A4 lift entry is kind lift');
const stretchDraft = Player.draftFromRoutine(
  { kind: 'stretch', restSec: 0, items: [{ exerciseId: 'couch_stretch', sets: 1, targetHoldSec: 60 }] },
  { userId: perfUser.id });
assert(S.kindOfEntry(stretchDraft.entries[0]) === 'stretch', 'A4 stretch-shape setwork entry is kind stretch');
assert(S.kindOfEntry({ type: 'cardio', mode: 'circuit' }) === 'circuit', 'A4 circuit cardio entry is kind circuit');
assert(S.kindOfEntry({ type: 'cardio', mode: 'run', intervals: { reps: 6 } }) === 'interval',
  'A4 interval run is kind interval');
assert(S.kindOfEntry({ type: 'cardio', mode: 'run' }) === 'cardio', 'A4 steady cardio is kind cardio');

assert(S.resolvePace(E0) === 'set', 'A4 durability default is set');
assert(S.resolvePace(E2) === 'off', 'A4 lift default is off — today’s flow, unchanged');
// 1. user setting under everything
Store.updateUser(perfUser.id, { settings: { pace: { durability: 'exercise', lift: 'off' } } });
assert(S.resolvePace(E0) === 'exercise', 'A4 user.settings.pace[kind] beats the built-in default');
// 2. routine
edit(function (dd) { dd._routine.pace = 'session'; });
assert(S.resolvePace(E0) === 'session', 'A4 routine.pace beats the user default');
// 3. item
edit(function (dd) { dd.entries[0]._itemPace = 'set'; });
assert(S.resolvePace(E0) === 'set', 'A4 item.pace beats routine.pace');
assert(S.resolvePace(E1) === 'session', 'A4 an item override touches only its own entry');
// 4. session chip
edit(function (dd) { dd._pace = 'exercise'; });
assert(S.resolvePace(E0) === 'exercise', 'A4 draft._pace (session chip) beats item.pace');
// 5. entry override
edit(function (dd) { dd.entries[0]._pace = 'off'; });
assert(S.resolvePace(E0) === 'off', 'A4 entry._pace (card override) beats the session chip');
// 6. the tapped button
assert(S.resolvePace(E0, 'session') === 'session', 'A4 the button just tapped wins for that one action');
assert(S.resolvePace(E0, 'garbage') === 'off', 'A4 a bogus action value never wins');
edit(function (dd) {
  delete dd._pace; delete dd._routine.pace;
  delete dd.entries[0]._pace; delete dd.entries[0]._itemPace;
});
Store.updateUser(perfUser.id, { settings: { pace: {} } });
assert(S.resolvePace(E0) === 'set', 'A4 clearing every override falls back to the defaults table');

// cadence — an ORTHOGONAL modifier, never a pace value
assert(S.PACES.indexOf('cadence') < 0, 'A4 cadence is not a value of the pace enum');
assert(S.resolveCadence(E0) === false, 'A4 cadence defaults to false');
Store.updateUser(perfUser.id, { settings: { cadence: true } });
assert(S.resolveCadence(E0) === true, 'A4 user.settings.cadence turns the metronome on');
edit(function (dd) { dd._cadence = false; });
assert(S.resolveCadence(E0) === false, 'A4 draft._cadence overrides the user setting');
edit(function (dd) { dd.entries[0]._cadence = true; });
assert(S.resolveCadence(E0) === true, 'A4 entry._cadence overrides the session');
Store.updateUser(perfUser.id, { settings: { cadence: false } });
edit(function (dd) { delete dd._cadence; delete dd.entries[0]._cadence; });

// rest chain mirrors the pace chain
Store.updateUser(perfUser.id, { settings: { restSec: 75 } });
edit(function (dd) { delete dd._routine.restSec; });
assert(S.restSecFor(E0) === 75, 'A4 rest falls back to user.settings.restSec');
edit(function (dd) { dd._routine.restSec = 20; });
assert(S.restSecFor(E0) === 20, 'A4 routine restSec beats the user setting');
edit(function (dd) { dd.entries[0]._itemRestSec = 10; });
assert(S.restSecFor(E0) === 10, 'A4 item restSec beats the routine');
edit(function (dd) { dd._restSec = 30; });
assert(S.restSecFor(E0) === 30, 'A4 the session sheet beats the item');
edit(function (dd) { dd.entries[0]._restSec = 5; });
assert(S.restSecFor(E0) === 5, 'A4 the card override beats everything');
edit(function (dd) { delete dd._restSec; delete dd.entries[0]._restSec; delete dd.entries[0]._itemRestSec; });
assert(S.restSecFor(E0) === 20, 'A4 rest overrides clear back to the routine value');

// per-shape drivers
const hold0 = setOf(E0, 0);
const drvHold = S.driverFor(S.entryOf(E0), hold0);
assert(drvHold && drvHold.driver === 'countdown' && drvHold.targetSec === 45,
  'A4 hold shape drives a countdown at the set target');
const carryDraft = Player.draftFromRoutine(
  { kind: 'durability', restSec: 0, items: [{ exerciseId: 'farmer_carry', sets: 1, targetDistanceM: 40, targetWeightKg: 32 }] },
  { userId: perfUser.id });
const drvCarry = S.driverFor(carryDraft.entries[0], carryDraft.entries[0].sets[0]);
assert(drvCarry && drvCarry.driver === 'stopwatch' && drvCarry.targetSec === 0,
  'A4 carry drives an elapsed stopwatch, never a countdown');
assert(S.driverFor(S.entryOf(E2), setOf(E2, 0)) === null,
  'A4 weight_reps gets NO set driver without a tempo — the checkmark advances it');
assert(S.tempoSecPerRep('3-1-3') === 7 && S.tempoSecPerRep('') === 0, 'A4 tempo parses to seconds per rep');
edit(function (dd) { dd.entries[2]._tempo = '3-1-3'; dd.entries[2].sets[0].reps = 8; });
const drvTempo = S.driverFor(S.entryOf(E2), setOf(E2, 0));
assert(drvTempo && drvTempo.driver === 'metronome' && drvTempo.targetSec === 56 && drvTempo.autoReps === 8,
  'A4 a tempo turns weight_reps into a metronome (8 reps x 7s) with auto-check');
edit(function (dd) { delete dd.entries[2]._tempo; });
assert(S.driverFor(S.entryOf(E2), setOf(E2, 0)) === null, 'A4 removing the tempo removes the driver again');
const dynDraft = Player.draftFromRoutine(
  { kind: 'stretch', restSec: 0, items: [{ exerciseId: 'leg_swing', sets: 1, targetReps: 10 }] },
  { userId: perfUser.id });
assert(S.shapeOf(dynDraft.entries[0]) === 'reps', 'A4 dynamic stretch is a reps shape');
assert(S.driverFor(dynDraft.entries[0], dynDraft.entries[0].sets[0]) === null,
  'A4 dynamic stretch has no driver without a tempo either');

/* ================= 3. one set, one clock — holdSec is ALWAYS actual (6) ================= */

at(0);
assert(S.runSet(E0, sid(E0, 0)) === true, 'runSet arms the tapped set');
assert(S.isRunning() === true, 'the clock is running');
let st = S.state();
assert(st.phase === 'work' && st.entryId === E0 && st.sid === sid(E0, 0),
  'the timer slot binds to (entryId, _sid)');
assert(st.targetSec === 45 && st.remainSec === 45, 'countdown starts at the set target');
advance(12000);
st = S.state();
assert(st.elapsedSec === 12 && st.remainSec === 33, 'elapsed/remain track the clock');
assert(S.done() === true, 'tapping the ring finishes the set early');
assert(setOf(E0, 0).holdSec === 12, 'A6 EARLY STOP records the seconds ACTUALLY held (12, not 45)');
assert(setOf(E0, 0).done === true, 'the finished set is marked done');
assert(S.isRunning() === false, 'the timer slot is free again');
assert(!('holdSec' in setOf(E0, 1)) && setOf(E0, 1)._tHoldSec === 45,
  'the other sets keep their planned targets — as targets, not as recorded holds');

// overtime: the tab is hidden, the timer expires, the user confirms later
at(100000);
S.runSet(E0, sid(E0, 1));
advance(45000 + 9000);            // 9s past the 45s target, visible
assert(setOf(E0, 1).holdSec === 45, 'A6 an unattended expiry records the full target');
assert(setOf(E0, 1).done === true, 'expiry marks the set done');

// explicit overtime through a paused/late Done
at(200000);
edit(function () { setOf(E0, 2).holdSec = 30; });
S.runSet(E0, sid(E0, 2));
clock += 41000;                    // no tick fired (e.g. a throttled background tab)
assert(S.done() === true, 'a late Done still resolves the set');
assert(setOf(E0, 2).holdSec === 41, 'A6 OVERTIME records the long time (41s held vs a 30s plan)');

/* ================= 4. ±15s, pause/resume, cancel ================= */

at(300000);
S.runSet(E1, sid(E1, 0));         // side_plank L, 30s
assert(S.state().targetSec === 30, 'target comes from the set');
advance(5000);
S.adjust(15);
assert(S.state().targetSec === 45 && S.state().remainSec === 40, '+15s extends the target, elapsed preserved');
S.adjust(-15);
assert(S.state().targetSec === 30, '-15s comes back down');
S.adjust(-600);
assert(S.state().targetSec === 6, '-15s clamps to elapsed+1s, never below the floor');
S.adjust(600);
assert(S.state().targetSec === 606, 'a big +adjust just adds');
assert(S.pause() === true && S.isPaused() === true, 'pause holds the clock');
clock += 60000;
assert(S.state().elapsedSec === 5, 'paused time does not count toward elapsed');
assert(S.resume() === true && S.isPaused() === false, 'resume restarts it');
advance(3000);
assert(S.state().elapsedSec === 8, 'elapsed continues from where it paused');
S.cancel();
assert(S.isRunning() === false, 'cancel frees the slot');
assert(!('holdSec' in setOf(E1, 0)) || setOf(E1, 0).holdSec === 30, 'cancel records NOTHING for the set');
assert(setOf(E1, 0).done !== true, 'a cancelled set stays pending');

/* ================= 5. authoritative timer<->edit rules (acceptance 3) ================= */

// (a) editing the RUNNING set's target retargets live, preserving elapsed
at(400000);
edit(function () { setOf(E1, 0).holdSec = 30; });
S.runSet(E1, sid(E1, 0));
advance(10000);
edit(function () { setOf(E1, 0).holdSec = 50; });      // builder edit -> saveDraft -> reconcile
st = S.state();
assert(st.targetSec === 50 && st.elapsedSec === 10 && st.remainSec === 40,
  'A3 retarget live: remain = newTarget - elapsed');
assert(S.isRunning() === true, 'A3 retargeting never interrupts the clock');

// (b) editing ANOTHER row never touches the running clock or the cursor
const cursorBefore = JSON.stringify(S.cursor());
edit(function () { setOf(E0, 1).holdSec = 999; });
assert(S.state().targetSec === 50, 'A3 editing a different set does not retarget the running one');
assert(JSON.stringify(S.cursor()) === cursorBefore, 'A3 the cursor is advisory — another row never moves it');
edit(function () { setOf(E0, 1).holdSec = 45; });

// (c) retarget into the past expires immediately
edit(function () { setOf(E1, 0).holdSec = 4; });        // already 10s in
assert(setOf(E1, 0).holdSec === 10, 'A3 retargeting below elapsed expires immediately, recording the ACTUAL 10s');
assert(setOf(E1, 0).done === true, 'A3 the expired-on-retarget set is done');
assert(S.isRunning() === false, 'A3 the slot is free after that expiry');

// (d) starting a second timer cancels the first
at(500000);
edit(function () { const s1 = setOf(E0, 1); s1.done = false; s1.holdSec = 45; });
S.runSet(E0, sid(E0, 1));
advance(3000);
const firstSid = S.state().sid;
S.runSet(E1, sid(E1, 1));
assert(S.state().sid === sid(E1, 1) && S.state().sid !== firstSid, 'A3 a second timer takes the single slot');
assert(setOf(E0, 1).done !== true, 'A3 the abandoned set records nothing');
assert(S.state().elapsedSec === 0, 'A3 the new timer starts from zero');

// (e) deleting the RUNNING set cancels cleanly and advances the cursor
edit(function (dd) {
  const en = dd.entries.find(function (x) { return x.id === E1; });
  en.sets.splice(1, 1);                                 // remove the running R set
});
assert(S.isRunning() === false, 'A3 deleting the running set cancels the timer');
assert(S.draft().entries.find(function (x) { return x.id === E1; }).sets.length === 1,
  'A3 the deletion itself went through');
assert(!!S.cursor() && S.cursor().entryId !== E1 || S.cursor().sid !== firstSid,
  'A3 the cursor advanced to the next pending set');
assert(S.findSet(S.cursor().entryId, S.cursor().sid) !== null, 'A3 the cursor points at a live set');

// (f) deleting the running set's ENTRY cancels cleanly too
at(600000);
S.runSet(E2, sid(E2, 0), { pace: 'off' });
assert(S.isRunning() === false, 'a lift set with no tempo starts no clock (the checkmark advances it)');
edit(function () { setOf(E0, 1).holdSec = 45; setOf(E0, 1).done = false; delete setOf(E0, 1).holdSec2; });
S.runSet(E0, sid(E0, 1));
assert(S.isRunning() === true, 'armed a hold inside entry 0');
advance(2000);
edit(function (dd) { dd.entries = dd.entries.filter(function (x) { return x.id !== E0; }); });
assert(S.isRunning() === false, 'A3 deleting the running set’s ENTRY cancels the timer');
assert(S.draft().entries.length === 2, 'A3 the entry is gone');
assert(S.state().hasDraft === true, 'A3 the session itself keeps going');

// (g) reordering follows the binding, because it is by _sid
at(700000);
const reD = Player.draftFromRoutine({
  kind: 'durability', restSec: 0,
  items: [
    { exerciseId: 'dead_hang', sets: 2, targetHoldSec: 40 },
    { exerciseId: 'wall_sit', sets: 1, targetHoldSec: 60 }
  ]
}, { userId: perfUser.id });
setDraft(reD);
const R0 = reD.entries[0].id;
const R1 = reD.entries[1].id;
const runSid = sid(R0, 1);
S.runSet(R0, runSid);
advance(6000);
edit(function (dd) {                                   // reorder entries
  const tmp = dd.entries[0]; dd.entries[0] = dd.entries[1]; dd.entries[1] = tmp;
});
assert(S.isRunning() === true, 'A3 a reorder never interrupts the clock');
assert(S.state().sid === runSid && S.state().entryId === R0, 'A3 the binding followed the set across the reorder');
assert(S.state().elapsedSec === 6, 'A3 elapsed survived the reorder');
edit(function (dd) {                                   // reorder sets inside the entry
  const en = dd.entries.find(function (x) { return x.id === R0; });
  const tmp = en.sets[0]; en.sets[0] = en.sets[1]; en.sets[1] = tmp;
});
assert(S.state().sid === runSid, 'A3 a set reorder inside the entry follows too');
advance(4000);
S.done();
assert(S.findSet(R0, runSid).set.holdSec === 10, 'A3 the reordered set recorded its own ACTUAL 10s');

// (h) adding a set mid-timer changes nothing about the running one
at(800000);
edit(function () { const s0 = S.findSet(R0, runSid).set; s0.done = false; delete s0.holdSec; });
S.runSet(R0, runSid);
advance(5000);
const addedSid = S.addSet(R0);
assert(!!addedSid, 'a set can be added while the clock runs');
assert(S.isRunning() === true && S.state().sid === runSid, 'A3 adding a set never disturbs the running timer');
assert(S.state().elapsedSec === 5, 'A3 elapsed unaffected by the insert');
S.cancel();

/* ================= 6. chain semantics: set / exercise / session ================= */

function chainDraft() {
  const cd = Player.draftFromRoutine({
    kind: 'durability', restSec: 10,
    items: [
      { exerciseId: 'dead_hang', sets: 2, targetHoldSec: 20 },
      { exerciseId: 'wall_sit', sets: 1, targetHoldSec: 30 }
    ]
  }, { userId: perfUser.id });
  setDraft(cd);
  return cd;
}

// 'set' — one set to completion, then hand back. Rest is advisory only.
at(1000000);
let cd = chainDraft();
let C0 = cd.entries[0].id;
let C1 = cd.entries[1].id;
S.runSet(C0, sid(C0, 0), { pace: 'set' });
advance(20000);
assert(setOf(C0, 0).done === true, 'set pace: the driven set completes');
assert(S.isRunning() === false, 'set pace hands back after that set — no driven rest');
assert(S.cursor().sid === sid(C0, 1), 'set pace still advances the advisory cursor');

// 'exercise' — remaining sets of ONE entry, work -> rest -> next, then stop
at(1100000);
cd = chainDraft();
C0 = cd.entries[0].id;
C1 = cd.entries[1].id;
S.runExercise(C0);
assert(S.state().phase === 'work' && S.state().sid === sid(C0, 0), 'exercise pace starts at the first pending set');
advance(20000);
assert(setOf(C0, 0).done === true, 'exercise pace records set 1');
assert(S.state().phase === 'rest' && S.state().targetSec === 10, 'exercise pace DRIVES the rest between sets');
assert(S.cursor().sid === sid(C0, 1), 'the cursor points at what the rest leads to');
advance(10000);
assert(S.state().phase === 'work' && S.state().sid === sid(C0, 1), 'the rest auto-starts the next set');
advance(20000);
assert(setOf(C0, 1).done === true, 'exercise pace records set 2');
assert(S.isRunning() === false, 'NO TRAILING REST — the chain stops at the end of the entry');
assert(setOf(C1, 0).done !== true, 'exercise pace never crosses into the next exercise');
assert(S.cursor().entryId === C1, 'the cursor still hands off to the next exercise');

// 'session' — chains across entries, including the transition rest
at(1200000);
cd = chainDraft();
C0 = cd.entries[0].id;
C1 = cd.entries[1].id;
S.runSession();
advance(20000);
assert(S.state().phase === 'rest', 'session pace drives the rest after set 1');
S.skipRest();
assert(S.state().phase === 'work' && S.state().sid === sid(C0, 1), 'skip rest jumps straight to the next set');
advance(20000);
assert(S.state().phase === 'rest', 'session pace drives the INTER-EXERCISE transition rest');
advance(10000);
assert(S.state().entryId === C1 && S.state().phase === 'work', 'session pace crossed into the next exercise');
advance(30000);
assert(setOf(C1, 0).done === true, 'session pace recorded the last set');
assert(S.isRunning() === false, 'no trailing rest at the end of the session either');
assert(S.progress().done === 3 && S.progress().total === 3, 'every set in the session is logged');

// an untimeable set hands back mid-chain; the checkmark resumes the chain
at(1300000);
const mixD = Player.draftFromRoutine({
  kind: 'custom', restSec: 5,
  items: [
    { exerciseId: 'dead_hang', sets: 1, targetHoldSec: 15 },
    { exerciseId: 'back_squat', sets: 1, targetReps: 5, targetWeightKg: 100 }
  ]
}, { userId: perfUser.id });
setDraft(mixD);
const M0 = mixD.entries[0].id;
const M1 = mixD.entries[1].id;
S.runSession();
advance(15000);
assert(S.state().phase === 'rest', 'chain rests after the hold');
advance(5000);
assert(S.isRunning() === false, 'the untimeable lift set hands back (no driver, no clock)');
assert(S.cursor().entryId === M1, 'the cursor moved onto the lift set');
assert(S.state().chain === 'session', 'the chain stays armed while the user does the reps');
edit(function () { const s0 = S.entryOf(M1).sets[0]; s0.reps = 5; s0.weightKg = 100; s0.done = true; });
S.noteSetDone(M1, sid(M1, 0));
assert(S.isRunning() === false && S.state().chain === null,
  'the checkmark on the last set ends the chain without a trailing rest');

/* ================= 7. boundary rule (expired while hidden) ================= */

at(1400000);
const bd = Player.draftFromRoutine(
  { kind: 'durability', restSec: 0, items: [{ exerciseId: 'dead_hang', sets: 1, targetHoldSec: 20 }] },
  { userId: perfUser.id });
setDraft(bd);
const B0 = bd.entries[0].id;
S.runSet(B0, sid(B0, 0));
global.document = { visibilityState: 'hidden' };        // phone in the pocket
advance(21000);
assert(setOf(B0, 0).done !== true, 'BOUNDARY: an expiry while hidden records NOTHING silently');
const b = S.boundary();
assert(!!b && b.sec === 20 && b.entryId === B0, 'BOUNDARY: what expired is marked for confirmation');
assert(S.isRunning() === false, 'BOUNDARY: the clock is not treated as running');
advance(60000);
assert(setOf(B0, 0).done !== true, 'BOUNDARY: later ticks never auto-resolve it');
global.document = { visibilityState: 'visible' };
assert(S.confirmBoundary() === true, 'BOUNDARY: the user confirms on return');
assert(setOf(B0, 0).holdSec === 20 && setOf(B0, 0).done === true, 'BOUNDARY: confirming records the target seconds');
assert(S.boundary() === null, 'BOUNDARY: cleared after confirmation');

at(1500000);
edit(function () { const s0 = setOf(B0, 0); s0.done = false; s0.holdSec = 20; });
S.runSet(B0, sid(B0, 0));
global.document = { visibilityState: 'hidden' };
advance(21000);
assert(!!S.boundary(), 'BOUNDARY: marked again');
assert(S.discardBoundary() === true, 'BOUNDARY: or dropped entirely');
assert(setOf(B0, 0).done !== true, 'BOUNDARY: dropping records nothing');
assert(S.isRunning() === false, 'BOUNDARY: dropping frees the slot');
delete global.document;

/* --- P4.5 review regressions: a pending boundary is OWED, and adjustable --- */

// (i) a ✓ on ANOTHER row must not eat the boundary (the chain's rest used to
//     overwrite the slot, leaving the held set pending with nothing recorded)
at(1550000);
const bd2 = Player.draftFromRoutine(
  { kind: 'durability', restSec: 30, items: [{ exerciseId: 'dead_hang', sets: 3, targetHoldSec: 20 }] },
  { userId: perfUser.id });
setDraft(bd2);
const B2 = bd2.entries[0].id;
S.runExercise(B2);                                     // exercise pace -> chain armed
global.document = { visibilityState: 'hidden' };
advance(21000);
assert(!!S.boundary() && S.boundary().sid === sid(B2, 0), 'BOUNDARY: pending on set 1 with a chain armed');
global.document = { visibilityState: 'visible' };
edit(function () { const s1 = setOf(B2, 1); s1.holdSec = 20; s1.done = true; });
S.noteSetDone(B2, sid(B2, 1));                         // the builder's ✓ on set 2
assert(!!S.boundary() && S.boundary().sid === sid(B2, 0),
  'BOUNDARY: ticking an unrelated row never throws the pending boundary away');
assert(setOf(B2, 0).done !== true, 'BOUNDARY: and the expired set is still waiting for its answer');
assert(S.completeSet(B2, sid(B2, 2), { holdSec: 9 }) === true, 'a third row can still be completed');
assert(!!S.boundary() && S.boundary().sid === sid(B2, 0),
  'BOUNDARY: completeSet elsewhere leaves it alone too (completeWork cleared the slot)');

// (ii) 'confirm OR ADJUST': the ±15s taps must work on a frozen boundary, and
//      a typed correction on the row must survive confirmBoundary()
assert(S.adjust(-15) === true, 'BOUNDARY: -15s is live at a boundary, not a dead button');
assert(!!S.timer() && S.timer().targetSec === 5, 'BOUNDARY: the adjust clamps to the 5s floor, ignoring frozen elapsed');
assert(S.adjust(15) === true, 'BOUNDARY: +15s too');
assert(!!S.timer() && S.timer().targetSec === 20, 'BOUNDARY: back to 20');
S.updateSet(B2, sid(B2, 0), { holdSec: 6 });           // typed into the row instead
assert(!!S.timer() && S.timer().targetSec === 6, 'BOUNDARY: a typed correction retargets the frozen timer');
assert(S.confirmBoundary() === true, 'BOUNDARY: confirm');
assert(setOf(B2, 0).holdSec === 6,
  'A6 BOUNDARY: confirming records the CORRECTED seconds, never the stale plan');
S.cancel();

// (iii) the tick engine restarts for a timer that outlived its JS context
at(1560000);
const zd = Player.draftFromRoutine(
  { kind: 'durability', restSec: 0, items: [{ exerciseId: 'dead_hang', sets: 1, targetHoldSec: 6 }] },
  { userId: perfUser.id });
setDraft(zd);
const Z0 = zd.entries[0].id;
S.runSet(Z0, sid(Z0, 0));
// simulate a reload: the draft (and its _timer) rehydrate from storage into a
// fresh context — nothing has ticked since it was armed
const frozen = JSON.parse(localStorage.getItem(DRAFT_KEY));
delete frozen._timer.tickedAt;
hostDraft = frozen;
localStorage.setItem(DRAFT_KEY, JSON.stringify(frozen));
clock += 30000;                                        // 30s of dead idle
S.reconcile();
assert(setOf(Z0, 0).holdSec !== 30 && setOf(Z0, 0).holdSec !== 24,
  'ZOMBIE: a rehydrated timer never records wall-clock-since-arm as holdSec');
assert(!!S.boundary(), 'ZOMBIE: an expiry nobody witnessed becomes a boundary, not a silent record');
assert(!!S.boundary() && S.boundary().sec === 6, 'ZOMBIE: the boundary offers the 6s target it was armed with');
assert(S.confirmBoundary() === true && setOf(Z0, 0).holdSec === 6,
  'A6 ZOMBIE: confirming records the target that was actually being held, not the idle time');

// a LIVE clock still expires immediately when retargeted below elapsed
at(1570000);
edit(function () { const s0 = setOf(Z0, 0); s0.done = false; s0.holdSec = 30; });
S.runSet(Z0, sid(Z0, 0));
advance(10000);
edit(function () { setOf(Z0, 0).holdSec = 4; });
assert(setOf(Z0, 0).holdSec === 10 && setOf(Z0, 0).done === true,
  'A3 a LIVE retarget below elapsed still expires immediately with the ACTUAL time');

/* --- P4.5 review regression: cursor advance on a deleted running set --- */

at(1580000);
const kd = Player.draftFromRoutine({
  kind: 'durability', restSec: 0,
  items: [
    { exerciseId: 'dead_hang', sets: 2, targetHoldSec: 20 },
    { exerciseId: 'plank', sets: 2, targetHoldSec: 20 },
    { exerciseId: 'wall_sit', sets: 2, targetHoldSec: 20 }
  ]
}, { userId: perfUser.id });
setDraft(kd);
const K0 = kd.entries[0].id;
const K2 = kd.entries[2].id;
const nextCursorSid = sid(K2, 1);                             // must become the cursor
S.runSet(K2, sid(K2, 0));                               // start mid-list; K0/K1 all pending
advance(3000);
edit(function (dd) {
  dd.entries.find(function (x) { return x.id === K2; }).sets.splice(0, 1);
});
assert(S.isRunning() === false, 'CURSOR: deleting the running set cancels the clock');
assert(!!S.cursor() && S.cursor().entryId === K2 && S.cursor().sid === nextCursorSid,
  'CURSOR: it advances to the NEXT pending set, never back to the top of the draft');
assert(S.runSession() === true && S.state().entryId === K2,
  'CURSOR: whole-session play resumes where the user was, not at exercise 1');
S.cancel();

/* --- P4.5 review regression: the focus Done never records an empty set --- */

at(1590000);
let prefillCalls = 0;
S.bind({
  getDraft: function () { return hostDraft; },
  saveDraft: function () {
    if (!hostDraft) return;
    saves++;
    localStorage.setItem(DRAFT_KEY, JSON.stringify(hostDraft));
    S.reconcile();
  },
  clearDraft: function () { hostDraft = null; },
  // the host's 'what the ✓ would have prefilled' hint, mirroring views-log's
  prefill: function (en, s) {
    prefillCalls++;
    const sets = en.sets || [];
    for (let i = sets.indexOf(s) - 1; i >= 0; i--) {
      if ((sets[i].reps || 0) > 0) { s.reps = sets[i].reps; s.weightKg = sets[i].weightKg; return; }
    }
  }
});
const fd = setDraft({
  userId: perfUser.id, date: '2026-08-02', name: 'Focus Done', startedAt: clock, notes: '',
  entries: [{ id: 'fe1', exerciseId: 'bench_press', notes: '', sets: [
    { weightKg: 60, reps: 8, type: 'work', rpe: null, done: true },
    { weightKg: 0, reps: 0, type: 'work', rpe: null, done: false },
    { weightKg: 0, reps: 0, type: 'work', rpe: null, done: false }
  ] }]
});
prefillCalls = 0;
assert(S.completeSet('fe1', sid('fe1', 1), null) === true, 'the focus Done completes an unfilled lift set');
assert(prefillCalls === 1, 'FOCUS DONE: the engine ASKS the host what the ✓ would have filled in');
eq({ weightKg: setOf('fe1', 1).weightKg, reps: setOf('fe1', 1).reps, type: setOf('fe1', 1).type,
  rpe: setOf('fe1', 1).rpe, done: setOf('fe1', 1).done },
  { weightKg: 60, reps: 8, type: 'work', rpe: null, done: true },
  'FOCUS DONE: an unfilled row records what the builder ✓ would have — and stays four-key');
// no hint anywhere -> still records nothing (the fix must not invent values)
const noHintD = setDraft({
  userId: perfUser.id, date: '2026-08-02', name: 'No hint', startedAt: clock, notes: '',
  entries: [{ id: 'ne1', exerciseId: 'bench_press', notes: '', sets: [
    { weightKg: 0, reps: 0, type: 'work', rpe: null, done: false }
  ] }]
});
S.completeSet('ne1', sid('ne1', 0), null);
assert(!(setOf('ne1', 0).reps > 0), 'FOCUS DONE: with no hint anywhere, nothing is invented');
assert(setOf('ne1', 0).done === true, 'FOCUS DONE: the set is still marked done');

/* --- P4.5 review regression: no fabricated reps, no side on lift sets --- */

at(1600000);
const td = setDraft({
  userId: perfUser.id, date: '2026-08-02', name: 'Tempo', startedAt: clock, notes: '',
  _routine: { tempo: '3-1-3', pace: 'set' },             // 7s per rep
  entries: [{ id: 'te1', exerciseId: 'bulgarian_split_squat', notes: '', sets: [
    { weightKg: 0, reps: 0, type: 'work', rpe: null, done: false },
    { weightKg: 0, reps: 0, type: 'work', rpe: null, done: false }
  ] }]
});
let tdrv = S.driverFor(S.entryOf('te1'), setOf('te1', 0), td);
assert(tdrv && tdrv.driver === 'metronome' && tdrv.targetSec === 56,
  'TEMPO: an untyped row still gets a metronome of the default length');
S.runSet('te1', sid('te1', 0));
advance(56000);
assert(setOf('te1', 0).done === true, 'TEMPO: the metronome auto-checks at the end');
assert(!(setOf('te1', 0).reps > 0),
  'TEMPO: a rep count that was never prescribed is NEVER recorded (no invented 8)');
edit(function () { const s0 = setOf('te1', 0); s0.done = false; s0.reps = 6; });
S.runSet('te1', sid('te1', 1));                          // borrows the sibling's 6 -> 42s
assert(S.state().targetSec === 42, 'TEMPO: a borrowed sibling rep count sets the clock length');
advance(14000);
S.done();
assert(setOf('te1', 1).reps === 2,
  'TEMPO: an early stop records the reps actually metronomed (14s/7s = 2), not the planned 6');

assert(S.updateSet('te1', sid('te1', 0), { side: 'L' }) === true, 'updateSet accepts the call');
assert(!('side' in setOf('te1', 0)), 'SIDE: a LIFT set never accepts a side key');
const addedLift = S.addSet('te1');
assert(!!addedLift, 'addSet on a perSide lift entry returns a sid');
assert(S.entryOf('te1').sets.every(function (s) { return !('side' in s); }),
  'SIDE: addSet never stamps a side on a lift set either');
assert(S.entryOf('te1').sets.length === 4,
  'SIDE: a perSide LIFT expands to TWO plain sets, exactly as draftFromRoutine seeds it');
const swSide = setDraft(Player.draftFromRoutine(
  { kind: 'durability', restSec: 0, items: [{ exerciseId: 'side_plank', sets: 1, targetHoldSec: 20 }] },
  { userId: perfUser.id }));
const SW0 = swSide.entries[0].id;
assert(S.updateSet(SW0, sid(SW0, 0), { side: 'R' }) === true && setOf(SW0, 0).side === 'R',
  'SIDE: setwork sets still carry L/R (only lifts are gated)');

/* --- P4.5 review regression: no lift-shaped `sets` key on a typed entry --- */

at(1610000);
const circD = setDraft({
  userId: perfUser.id, date: '2026-08-02', name: 'Finisher', startedAt: clock - 62 * 60000, notes: '',
  entries: [
    { id: 'ce0', exerciseId: 'bench_press', notes: '', sets: [{ weightKg: 60, reps: 8, type: 'work', rpe: null, done: true }] },
    { id: 'ce1', type: 'cardio', mode: 'circuit', durationMin: 0, rounds: 0,
      stations: [{ exerciseId: 'push_up', reps: 10 }], _startedAt: clock }
  ]
});
assert(!('sets' in S.entryOf('ce1')), 'CIRCUIT: backfill never injects a `sets` array into a typed entry');
assert(Array.isArray(S.entryOf('ce0').sets), 'CIRCUIT: set-bearing entries still get theirs');
clock += 90000;                                          // 1.5 min of circuit
assert(S.closeRound('ce1') === true, 'a round closes');
assert(S.entryOf('ce1').durationMin === 2,
  'CIRCUIT: durationMin is the CIRCUIT’s own time (2 min), not the 62-minute session’s');
assert(!('sets' in S.entryOf('ce1')), 'CIRCUIT: and closing a round does not grow one either');

// hand the suite back exactly the host and the draft section 8 expects
S.bind({
  getDraft: function () { return hostDraft; },
  saveDraft: function () {
    if (!hostDraft) return;
    saves++;
    localStorage.setItem(DRAFT_KEY, JSON.stringify(hostDraft));
    S.reconcile();
  },
  clearDraft: function () { hostDraft = null; }
});
setDraft(bd);

/* ================= 8. projection (compile as a derived view) ================= */

at(1600000);
const pj = Player.projectDraft(S.draft());
assert(pj.kind === 'steps', 'projectDraft returns the compile-shaped projection');
assert(pj.workCount === 1 && pj.doneCount === 0, 'projection counts work steps and how many are done');
assert(pj.steps[0].type === 'work' && pj.steps[0].shape === 'hold', 'projected step keeps the compile shape');
assert(pj.steps[pj.steps.length - 1].type !== 'rest', 'projection never ends on a rest');
const pj2 = Player.projectDraft(cd);
assert(pj2.remainSec === 0 || pj2.remainSec > 0, 'projection produces a time-left estimate');
assert(localStorage.getItem('ironlog/compiled') === null, 'the projection is never stored anywhere');

/* ================= 9. ACCEPTANCE 1 — `_sid` never persists ================= */

// The save path, exactly as views-log builds it (buildFinishedEntries +
// cleanSetworkEntry): lift sets are rebuilt as 4-key literals and every
// '_'-prefixed key is skipped at entry AND set level.
function cleanSetworkEntryLikeViewsLog(en) {
  const stretch = ((ExerciseDB.byId(en.exerciseRef) || {}).setShape) === 'stretch';
  const depth = (function () { const n = parseInt(en._depth, 10); return n >= 1 && n <= 4 ? n : 2; })();
  const sets = [];
  (en.sets || []).forEach(function (s) {
    if (!((s.reps || 0) > 0 || (s.holdSec || 0) > 0 || (s.distanceM || 0) > 0)) return;
    const o = {};
    for (const k in s) {
      if (k === 'done' || k === 'type' || k.charAt(0) === '_') continue;
      o[k] = s[k];
    }
    ['reps', 'holdSec', 'distanceM', 'weightKg'].forEach(function (k) {
      if (!((Number(o[k]) || 0) > 0)) delete o[k];
    });
    if (o.side !== 'L' && o.side !== 'R') delete o.side;
    if (stretch) o.intensity = (Number(s.intensity) || 0) >= 1 ? Math.min(4, Math.max(1, Math.round(s.intensity))) : depth;
    else delete o.intensity;
    sets.push(o);
  });
  if (!sets.length) return null;
  const out = {};
  for (const k in en) {
    if (k === 'showRpe' || k.charAt(0) === '_') continue;
    out[k] = en[k];
  }
  out.id = en.id;
  out.type = 'setwork';
  out.exerciseRef = en.exerciseRef;
  delete out.exerciseId;
  out.sets = sets;
  if (!out.notes) delete out.notes;
  return out;
}
function buildFinishedEntriesLikeViewsLog(dd) {
  const entries = [];
  (dd.entries || []).forEach(function (en) {
    if (en.type === 'setwork') {
      const c = cleanSetworkEntryLikeViewsLog(en);
      if (c) entries.push(c);
      return;
    }
    if (!en.exerciseId) return;
    const sets = (en.sets || []).filter(function (s) { return (s.reps || 0) > 0; }).map(function (s) {
      return {
        weightKg: s.weightKg || 0,
        reps: s.reps,
        type: s.type === 'warmup' ? 'warmup' : 'work',
        rpe: s.rpe === null || s.rpe === undefined ? null : s.rpe
      };
    });
    if (sets.length) entries.push({ id: en.id, exerciseId: en.exerciseId, notes: en.notes || '', sets: sets });
  });
  return entries;
}
function underscoreKeys(obj, trail) {
  trail = trail || '$';
  let hits = [];
  if (Array.isArray(obj)) {
    obj.forEach(function (x, i) { hits = hits.concat(underscoreKeys(x, trail + '[' + i + ']')); });
    return hits;
  }
  if (!obj || typeof obj !== 'object') return hits;
  Object.keys(obj).forEach(function (k) {
    if (k.charAt(0) === '_') hits.push(trail + '.' + k);
    hits = hits.concat(underscoreKeys(obj[k], trail + '.' + k));
  });
  return hits;
}

at(2000000);
const saveD = Player.draftFromRoutine({
  id: 'rt_2', name: 'Mixed live session', kind: 'custom', restSec: 15, pace: 'exercise',
  items: [
    { exerciseId: 'couch_stretch', sets: 1, targetHoldSec: 30, pace: 'set', restSec: 5, tempo: '2-0-2' },
    { exerciseId: 'farmer_carry', sets: 1, targetDistanceM: 40, targetWeightKg: 32 },
    { exerciseId: 'back_squat', sets: 2, targetReps: 5, targetWeightKg: 100 }
  ]
}, { userId: perfUser.id, routineRef: 'rt_2' });
setDraft(saveD);
const V0 = saveD.entries[0].id;
const V1 = saveD.entries[1].id;
const V2 = saveD.entries[2].id;
S.runSet(V0, sid(V0, 0));
advance(26000);
S.done();                                   // stretch L, actual 26s
S.setDepth(V0, sid(V0, 0), 3);
S.runSet(V0, sid(V0, 1));
advance(30000);                             // stretch R expires at target
S.runSet(V1, sid(V1, 0));                   // carry — stopwatch
advance(35000);
S.done();
edit(function () {
  const c = S.entryOf(V1).sets[0];
  c.distanceM = 40; c.weightKg = 32;
  const l0 = S.entryOf(V2).sets[0];
  l0.reps = 5; l0.weightKg = 100; l0.done = true;
});
assert(underscoreKeys(S.draft()).length > 0, 'A1 the DRAFT does carry draft-local keys (_sid, _timer, _routine…)');
assert(S.draft().entries[0].sets[0]._sid, 'A1 …including the set identity the timers bind to');

const finalEntries = buildFinishedEntriesLikeViewsLog(S.draft());
assert(finalEntries.length === 3, 'A1 the finish path emits every entry with valid sets');
eq(underscoreKeys(finalEntries), [], 'A1 NO underscore key survives buildFinishedEntries/cleanSetworkEntry');
const liftEntry = finalEntries.find(function (e) { return e.exerciseId === 'back_squat'; });
eq(Object.keys(liftEntry.sets[0]).sort(), ['reps', 'rpe', 'type', 'weightKg'],
  'A1 lift sets are rebuilt as exactly the four persisted keys');
const swEntry = finalEntries.find(function (e) { return e.exerciseRef === 'couch_stretch'; });
assert(swEntry.sets[0].holdSec === 26, 'A1 the stretch set kept its ACTUAL 26 seconds');
assert(swEntry.sets[0].intensity === 3, 'A1 per-set depth captured live survives the save');
assert(swEntry.sets[0].side === 'L' && swEntry.sets[1].side === 'R', 'A1 sides survive');
assert(!('exerciseId' in swEntry), 'A1 FORBIDDEN exerciseId never lands on a setwork entry');
assert(!swEntry.sets.some(function (x) { return 'type' in x; }), 'A1 FORBIDDEN set.type never lands on a setwork set');

const saved = Store.addWorkout({
  userId: perfUser.id, date: U.todayStr(), name: 'Mixed live session',
  startedAt: 1, endedAt: 2, durationMin: 20, entries: finalEntries
});
eq(underscoreKeys(Store.workoutById(saved.id)), [], 'A1 the STORED workout has no underscore key at any level');
eq(underscoreKeys(JSON.parse(Store.exportJSON()).workouts), [], 'A1 the exported backup has none either');
const dump = Store.exportJSON();
const impRes = Store.importJSON(dump, { merge: true });
assert(impRes.ok, 'A1 importJSON(merge) round-trips');
eq(underscoreKeys(Store.workoutById(saved.id)), [], 'A1 no underscore key after import');
Store.mergeRemote(JSON.parse(dump));
eq(underscoreKeys(Store.workoutById(saved.id)), [], 'A1 no underscore key after mergeRemote');

// A player-written workout carrying a stray _sid (belt and braces): the
// normalizer must not invent one on lifts, and the cleaner strips it on
// setwork before it ever gets here.
const dirty = Store.addWorkout({
  userId: perfUser.id, date: U.todayStr(), name: 'Dirty',
  entries: [{ id: 'en_d', exerciseId: 'bench_press', sets: [{ weightKg: 60, reps: 5, _sid: 's_leak', done: true }] }]
});
eq(underscoreKeys(Store.workoutById(dirty.id)), [],
  'A1 normalizeSet structurally drops a stray _sid from a LIFT set');
Store.deleteWorkout(dirty.id);

/* ---- P1-era client simulation (git show bdc9639:gym/js/{util,store}.js) ---- */

const oldLS = new Map();
const oldCtx = {
  console: console, setTimeout: setTimeout, clearTimeout: clearTimeout,
  localStorage: {
    getItem: function (k) { return oldLS.has(k) ? oldLS.get(k) : null; },
    setItem: function (k, v) { oldLS.set(k, String(v)); },
    removeItem: function (k) { oldLS.delete(k); },
    clear: function () { oldLS.clear(); }
  }
};
oldCtx.window = oldCtx;
vm.createContext(oldCtx);
vm.runInContext(fs.readFileSync(path.join(SCRATCH, 'p1-era-util.js'), 'utf8'), oldCtx, { filename: 'p1-era-util.js' });
vm.runInContext(fs.readFileSync(path.join(SCRATCH, 'p1-era-store.js'), 'utf8'), oldCtx, { filename: 'p1-era-store.js' });
const OldStore = oldCtx.Store;
assert(typeof OldStore.load === 'function', 'A1 P1-era Store loads in an isolated context');

const playerWorkoutStr = JSON.stringify(Store.workoutById(saved.id));
oldCtx.localStorage.setItem('ironlog/v1', Store.exportJSON());
OldStore.load();
assert(JSON.stringify(OldStore.workoutById(saved.id)) === playerWorkoutStr,
  'A1 P1-era load: the player-written workout is byte-identical');
eq(underscoreKeys(OldStore.workoutById(saved.id)), [], 'A1 P1-era load: still no underscore keys');
OldStore.updateWorkout(saved.id, { name: 'Renamed on the old phone', entries: OldStore.workoutById(saved.id).entries });
assert(JSON.stringify(OldStore.workoutById(saved.id).entries) === JSON.stringify(JSON.parse(playerWorkoutStr).entries),
  'A1 P1-era edit re-emits the entries unchanged');
const oldPersisted = JSON.parse(oldCtx.localStorage.getItem('ironlog/v1'));
eq(underscoreKeys(oldPersisted.workouts), [], 'A1 P1-era save keeps the fleet clean');
oldLS.clear();
OldStore.load();
const mr = OldStore.mergeRemote(JSON.parse(Store.exportJSON()));
assert(mr.changed === true, 'A1 P1-era mergeRemote pulls the session');
assert(JSON.stringify(OldStore.workoutById(saved.id)) === playerWorkoutStr,
  'A1 P1-era mergeRemote: byte-identical');
assert(OldStore.mergeRemote(JSON.parse(Store.exportJSON())).changed === false,
  'A1 P1-era mergeRemote is idempotent (no sync loop)');

// the draft blob itself is never a Store citizen
assert(localStorage.getItem(DRAFT_KEY) !== null, 'A1 the draft lives in its own key…');
assert(JSON.stringify(Store.state).indexOf('_sid') < 0, 'A1 …and _sid is nowhere in the Store state');
assert(JSON.stringify(Store.state).indexOf('_timer') < 0, 'A1 …nor is the timer slot');

/* ================= 10. cursor, progress, next ================= */

at(2200000);
const nd = Player.draftFromRoutine({
  kind: 'durability', restSec: 0,
  items: [{ exerciseId: 'dead_hang', sets: 3, targetHoldSec: 10 }]
}, { userId: perfUser.id });
setDraft(nd);
const N0 = nd.entries[0].id;
assert(S.firstPending().sid === sid(N0, 0), 'firstPending starts at the top');
S.setCursor(N0, sid(N0, 1));
assert(S.cursor().sid === sid(N0, 1), 'the cursor can be placed by hand');
assert(S.next().sid === sid(N0, 2), 'next() is the pending set after the cursor');
edit(function () { setOf(N0, 0).done = true; setOf(N0, 0).holdSec = 9; });
eq(S.progress(), { done: 1, total: 3, remainSec: 20, estSec: 29 }, 'progress counts done/total and time left');
S.setCursor(N0, sid(N0, 2));
edit(function (dd) { dd.entries[0].sets.splice(2, 1); });
assert(S.cursor().sid === sid(N0, 1), 'a cursor pointing at a deleted set advances to the next pending one');
assert(S.removeEntry(N0) === true, 'removeEntry drops the whole card');
assert(S.draft().entries.length === 0, 'the draft is empty again');
assert(S.cursor() === null, 'the cursor clears when nothing is pending');
assert(S.runSession() === false, 'runSession on an empty draft is a safe no-op');

/* ================= 11. two presentations, one state ================= */

at(2300000);
const vd = Player.draftFromRoutine(
  { kind: 'durability', restSec: 0, items: [{ exerciseId: 'dead_hang', sets: 1, targetHoldSec: 30 }] },
  { userId: perfUser.id });
setDraft(vd);
const P0 = vd.entries[0].id;
assert(S.view() === 'builder', 'durability sessions open in the builder');
S.runSet(P0, sid(P0, 0));
advance(4000);
vd._view = 'focus';                                   // (the overlay itself needs a DOM)
S.save();
assert(S.isRunning() === true && S.state().elapsedSec === 4,
  'switching presentation never interrupts the timer');
assert(S.view() === 'focus', 'the view flag lives on the draft — one state, two presentations');
advance(3000);
S.done();
assert(S.findSet(P0, sid(P0, 0)).set.holdSec === 7, 'A6 holdSec is ACTUAL in the focus presentation too');

/* ================= 12. simple mode stays byte-identical ================= */

Store.setCurrentUser(simpleUser.id);
assert(S.defaultPaceFor('lift') === 'off', 'simple mode: lift pace is off — the P4 flow, unchanged');
assert(Player.start({ kind: 'durability', restSec: 0, items: [{ exerciseId: 'dead_hang', sets: 1 }] }) === false,
  'simple mode: Player.start refuses');
assert(Player.openFocus() === false, 'simple mode: the focus view refuses (no DOM either)');
Store.setCurrentUser(perfUser.id);

/* ================= 13. API surface the other modules build against ========== */

['bind', 'draft', 'setDraft', 'save', 'backfill', 'sidOf', 'entryOf', 'findSet', 'subscribe',
  'reconcile', 'resolvePace', 'resolveCadence', 'restSecFor', 'defaultPaceFor', 'kindOfEntry',
  'kindOfDraft', 'driverFor', 'targetSecOf', 'shapeOf', 'tempoOf', 'tempoSecPerRep',
  'runSet', 'runExercise', 'runSession', 'arm', 'adjust', 'pause', 'resume', 'togglePause',
  'done', 'completeSet', 'noteSetDone', 'skipRest', 'cancel', 'state', 'timer', 'isRunning',
  'isPaused', 'boundary', 'confirmBoundary', 'discardBoundary', 'setDepth', 'updateSet',
  'addSet', 'removeSet', 'removeEntry', 'moveEntry', 'circuitEntry', 'closeRound', 'setStation',
  'cursor', 'setCursor', 'next', 'firstPending', 'progress', 'view', 'setView', 'tick',
  'setSessionPace', 'setEntryPace', 'setCadence', 'setRestSec', 'setPaceDefault'
].forEach(function (k) {
  assert(typeof S[k] === 'function', 'Player.Session.' + k + '() is exposed');
});
['compile', 'stepEstimateSec', 'builtinRoutine', 'routineFromWorkout', 'projectDraft',
  'draftFromRoutine', 'start', 'openFocus', 'closeFocus', 'renderFocus', 'finishSession',
  'openPlanner', 'editRoutine', 'discardLegacySession', 'resumePending'
].forEach(function (k) {
  assert(typeof Player[k] === 'function', 'Player.' + k + '() is exposed');
});
assert(typeof S.external === 'undefined',
  'the external-engine interop layer is GONE — Player.Session is the only engine');
assert(!global.ViewsLog || !global.ViewsLog.Session || typeof global.ViewsLog.Session !== 'object' ||
  typeof global.ViewsLog.Session.reconcile !== 'function' ||
  global.ViewsLog.Session.reconcile === S.reconcile,
  'nothing shadows the engine — every test above ran the one in player.js');

// subscriptions
let ticks = 0;
let changes = 0;
const off = S.subscribe(function (stt) {
  if (stt.reason === 'tick') ticks++; else changes++;
});
S.runSet(P0, sid(P0, 0));
advance(1000);
assert(ticks > 0, 'subscribers see clock ticks separately…');
assert(changes > 0, '…from structural changes (so the builder never repaints under a caret)');
off();
const before = ticks + changes;
advance(1000);
assert(ticks + changes === before, 'unsubscribe stops the stream');
S.cancel();

/* ================= done ================= */

console.log('\n' + (failures ? 'FAILURES: ' + failures : 'ALL PASS') + ' (' + count + ' asserts)');
process.exit(failures ? 1 : 0);
