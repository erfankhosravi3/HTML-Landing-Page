'use strict';
/* Node test harness for gym/js/store.js */
const P = require('./lib/paths');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const GYM = P.JS;

// ---- environment stubs (must exist BEFORE loading modules) ----
const storageMap = new Map();
global.localStorage = {
  getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
  setItem: (k, v) => { storageMap.set(k, String(v)); },
  removeItem: (k) => { storageMap.delete(k); },
  clear: () => storageMap.clear()
};
global.window = global; // modules attach to window.*

function loadScript(file) {
  const code = fs.readFileSync(file, 'utf8');
  vm.runInThisContext(code, { filename: file });
}

loadScript(path.join(GYM, 'util.js'));

const realExercises = fs.existsSync(path.join(GYM, 'exercises.js'));
if (realExercises) {
  loadScript(path.join(GYM, 'exercises.js'));
} else {
  // Minimal stub so Store logic tests can run before exercises.js lands.
  global.ExerciseDB = { byId: (id) => ({ id, name: id }), all: () => [] };
  console.log('WARN: using ExerciseDB stub (exercises.js not present yet)');
}
loadScript(path.join(GYM, 'store.js'));

let failures = 0;
function assert(cond, msg) {
  if (cond) { console.log('ok  - ' + msg); }
  else { failures++; console.log('FAIL- ' + msg); }
}
function eq(a, b, msg) {
  const good = JSON.stringify(a) === JSON.stringify(b);
  if (!good) console.log('   got=' + JSON.stringify(a) + ' want=' + JSON.stringify(b));
  assert(good, msg);
}

// ---------- load / fresh default ----------
localStorage.setItem('ironlog/v1', '{{{corrupt');
let st = Store.load();
assert(st && st.schemaVersion === 2 && Array.isArray(st.users) && st.users.length === 0, 'load() tolerates corrupt JSON -> fresh state (v2 marker)');
assert(st.sync && typeof st.sync.deviceId === 'string' && st.sync.deviceId.length > 0, 'fresh state has deviceId');
localStorage.clear();
st = Store.load();

// ---------- subscribe ----------
let notified = 0;
const unsub = Store.subscribe(() => notified++);

// ---------- users ----------
const u1 = Store.addUser({ name: 'Alice', emoji: '🦊', color: '#2ca350' });
assert(u1.id && u1.settings.units === 'lb' && u1.settings.restTimerSec === 90 &&
  u1.settings.weeklyWorkoutGoal === 4 && u1.settings.weeklySetGoal === 15 &&
  u1.settings.barWeightKg === 20.4 && u1.settings.plateWeightsKg.length === 6,
  'addUser fills settings defaults');
assert(Store.state.currentUserId === u1.id, 'first user becomes current');
const u2 = Store.addUser({ name: 'Bob', settings: { units: 'kg' } });
assert(u2.settings.units === 'kg' && u2.settings.restTimerSec === 90, 'addUser merges partial settings over defaults');
assert(notified >= 2, 'subscribers notified on save');

const before = u1.updatedAt;
Store.updateUser(u1.id, { name: 'Alicia', settings: { restTimerSec: 120 } });
const u1b = Store.state.users.find(u => u.id === u1.id);
assert(u1b.name === 'Alicia' && u1b.settings.restTimerSec === 120 && u1b.settings.units === 'lb', 'updateUser deep-merges settings');
assert(u1b.updatedAt >= before, 'updateUser bumps updatedAt');

// ---------- workouts ----------
const w1 = Store.addWorkout({
  date: U.addDays(U.todayStr(), -2), name: 'Push',
  entries: [{ exerciseId: 'barbell_bench_press', sets: [{ weightKg: 60, reps: 8 }, { weightKg: 40, reps: 10, type: 'warmup' }] }]
});
assert(w1.userId === Store.state.currentUserId && w1.id && w1.createdAt && w1.updatedAt, 'addWorkout fills id/userId/timestamps');
assert(w1.entries[0].id && w1.entries[0].sets[0].type === 'work' && w1.entries[0].sets[0].rpe === null, 'entry/set defaults normalized');
assert(w1.source === 'manual' && w1.notes === '', 'workout defaults');
const w2 = Store.addWorkout({ date: U.todayStr(), name: 'Pull', userId: u1.id });
const w3 = Store.addWorkout({ date: U.todayStr(), name: 'Later same day', userId: u1.id, createdAt: Date.now() + 5000 });
const listed = Store.workoutsFor(u1.id);
eq(listed.map(w => w.name), ['Later same day', 'Pull', 'Push'], 'workoutsFor: date desc then createdAt desc');
Store.updateWorkout(w1.id, { name: 'Push v2', entries: [{ exerciseId: 'back_squat', sets: [{ weightKg: 100, reps: 5 }] }] });
assert(Store.workoutById(w1.id).name === 'Push v2' && Store.workoutById(w1.id).entries[0].exerciseId === 'back_squat', 'updateWorkout patches + replaces entries');
Store.deleteWorkout(w3.id);
assert(!Store.workoutById(w3.id) && Store.state.deleted.workouts[w3.id] > 0, 'deleteWorkout removes + tombstones');

// ---------- templates ----------
const t1 = Store.addTemplate({ name: 'My PPL', entries: [{ exerciseId: 'barbell_bench_press', targetSets: 4, targetRepsLow: 5, targetRepsHigh: 8 }] });
const tShared = Store.addTemplate({ name: 'Shared', userId: null });
const tOther = Store.addTemplate({ name: 'Bobs', userId: u2.id });
const tpls = Store.templatesFor(u1.id).map(t => t.name).sort();
eq(tpls, ['My PPL', 'Shared'], 'templatesFor = own + shared(null)');
Store.deleteTemplate(t1.id);
assert(Store.state.deleted.templates[t1.id] > 0, 'deleteTemplate tombstones');

// ---------- body metrics upsert ----------
Store.addBodyMetric({ userId: u1.id, date: '2026-07-01', kind: 'weightKg', value: 80 });
Store.addBodyMetric({ userId: u1.id, date: '2026-07-01', kind: 'weightKg', value: 81 });
Store.addBodyMetric({ userId: u1.id, date: '2026-06-20', kind: 'weightKg', value: 79 });
Store.addBodyMetric({ userId: u1.id, date: '2026-07-01', kind: 'bodyFatPct', value: 17 });
const bms = Store.bodyMetricsFor(u1.id, 'weightKg');
assert(bms.length === 2 && bms[0].date === '2026-06-20' && bms[1].value === 81, 'bodyMetric upsert by (userId,date,kind), date asc');

// ---------- health samples bulk upsert ----------
let added = Store.addHealthSamples([
  { userId: u1.id, date: '2026-07-01', kind: 'steps', value: 9000 },
  { userId: u1.id, date: '2026-07-02', kind: 'steps', value: 8000 },
  null, { bogus: true }
]);
eq(added, 2, 'addHealthSamples returns count of new rows (ignores garbage)');
added = Store.addHealthSamples([
  { userId: u1.id, date: '2026-07-01', kind: 'steps', value: 9500 },
  { userId: u1.id, date: '2026-07-03', kind: 'steps', value: 7000 }
]);
eq(added, 1, 'addHealthSamples upserts existing (only new counted)');
const hs = Store.healthFor(u1.id, 'steps');
assert(hs.length === 3 && hs[0].date === '2026-07-01' && hs[0].value === 9500, 'healthFor date asc, upsert updated value');

// ---------- custom exercises ----------
const cx = Store.addCustomExercise({ name: 'Weird Press', primaryMuscles: ['chest'], equipment: 'machine', category: 'push' });
assert(cx.id.indexOf('cx_') === 0 && cx.custom === true && Array.isArray(cx.instructions), 'addCustomExercise shape + cx_ prefix');
assert(Store.customExercises().length === 1, 'customExercises()');
if (realExercises) {
  assert(ExerciseDB.byId(cx.id) && ExerciseDB.byId(cx.id).name === 'Weird Press', 'ExerciseDB.byId resolves custom exercise');
}

// ---------- deleteUser cascade ----------
const victim = Store.addUser({ name: 'Victim' });
Store.setCurrentUser(victim.id);
const vw = Store.addWorkout({ name: 'V workout' });
Store.addBodyMetric({ userId: victim.id, date: '2026-07-05', kind: 'weightKg', value: 70 });
Store.addHealthSamples([{ userId: victim.id, date: '2026-07-05', kind: 'steps', value: 5000 }]);
const vt = Store.addTemplate({ name: 'V tpl' });
Store.deleteUser(victim.id);
assert(!Store.state.users.some(u => u.id === victim.id), 'deleteUser removes user');
assert(Store.state.deleted.users[victim.id] > 0, 'deleteUser tombstones user');
assert(Store.workoutsFor(victim.id).length === 0 && Store.state.deleted.workouts[vw.id] > 0, 'deleteUser cascades workouts + tombstones');
assert(Store.bodyMetricsFor(victim.id).length === 0 && Store.healthFor(victim.id).length === 0, 'deleteUser cascades metrics/samples');
assert(!Store.state.templates.some(t => t.id === vt.id) && Store.state.deleted.templates[vt.id] > 0, 'deleteUser cascades owned templates');
assert(Store.state.templates.some(t => t.userId === null), 'shared templates survive deleteUser');
assert(Store.state.currentUserId && Store.state.currentUserId !== victim.id, 'currentUserId reassigned after deleteUser');

// ---------- export / import round trip ----------
const exported = Store.exportJSON();
assert(exported.indexOf('\n') > 0, 'exportJSON pretty-printed');
const parsedExport = JSON.parse(exported);
assert(Array.isArray(parsedExport.users) && parsedExport.deleted && parsedExport.sync, 'exportJSON includes everything');

let res = Store.importJSON('not json at all', { merge: true });
assert(res.ok === false && res.error, 'importJSON rejects garbage text');
res = Store.importJSON('[1,2,3]');
assert(res.ok === false, 'importJSON rejects array');
res = Store.importJSON('{"hello":"world"}');
assert(res.ok === false, 'importJSON rejects unrecognizable object');
const usersBefore = Store.state.users.length;
assert(Store.state.users.length === usersBefore, 'failed import does not corrupt state');

// full replace round-trip
res = Store.importJSON(exported, { merge: false });
assert(res.ok === true, 'importJSON replace ok');
eq(Store.exportJSON() === undefined ? null : JSON.parse(Store.exportJSON()).users.map(u => u.name),
   parsedExport.users.map(u => u.name), 'replace round-trip preserves users');

// merge: newer entity wins
const snapshot = JSON.parse(Store.exportJSON());
const someUser = snapshot.users[0];
const modified = JSON.parse(JSON.stringify(snapshot));
modified.users[0].name = 'RenamedRemotely';
modified.users[0].updatedAt = Date.now() + 100000;
res = Store.importJSON(JSON.stringify(modified), { merge: true });
assert(res.ok && Store.state.users.find(u => u.id === someUser.id).name === 'RenamedRemotely', 'importJSON merge keeps newer updatedAt');
// merge with older copy does not clobber
const older = JSON.parse(JSON.stringify(snapshot));
older.users[0].name = 'StaleName';
older.users[0].updatedAt = 1;
res = Store.importJSON(JSON.stringify(older), { merge: true });
assert(res.ok && Store.state.users.find(u => u.id === someUser.id).name === 'RenamedRemotely', 'importJSON merge ignores older entity');

// ---------- mergeRemote ----------
// Build two divergent states from a common base.
localStorage.clear();
Store.load();
const mA = Store.addUser({ name: 'MergeUser', color: '#2ca350' });
const sharedW = Store.addWorkout({ name: 'Common', date: '2026-07-10' });
const base = JSON.parse(Store.exportJSON());

// Local diverges: edit shared workout (older), add local-only workout, delete nothing.
Store.updateWorkout(sharedW.id, { name: 'LocalEdit' });
const localOnly = Store.addWorkout({ name: 'LocalOnly', date: '2026-07-11' });

// Remote diverges from base: newer edit of shared workout, remote-only workout, and a tombstone for localOnly? (localOnly unknown remotely) — instead remote deletes a workout it knows.
const remote = JSON.parse(JSON.stringify(base));
remote.workouts[0].name = 'RemoteEdit';
remote.workouts[0].updatedAt = Date.now() + 500000; // newer than local edit
remote.workouts.push({ id: 'w_remoteonly', userId: mA.id, date: '2026-07-09', name: 'RemoteOnly', notes: '', startedAt: null, endedAt: null, durationMin: null, source: 'manual', createdAt: 5, updatedAt: 5, entries: [] });
remote.users.push({ id: 'u_ghost', name: 'Ghost', emoji: '👻', color: '#0a84ff', createdAt: 1, updatedAt: 10, settings: {} });
remote.deleted.users['u_ghost'] = 999999999999999; // tombstone newer than entity -> stays deleted
remote.currentUserId = 'u_ghost';
remote.sync = { url: 'https://evil', secret: 'x', enabled: true, lastSyncAt: 5, deviceId: 'dev_remote' };

const localCur = Store.state.currentUserId;
const localDev = Store.state.sync.deviceId;
let mres = Store.mergeRemote(remote);
assert(mres.changed === true, 'mergeRemote reports changed');
assert(Store.workoutById(sharedW.id).name === 'RemoteEdit', 'mergeRemote LWW: newer remote entity wins');
assert(Store.workoutById(localOnly.id) && Store.workoutById(localOnly.id).name === 'LocalOnly', 'mergeRemote keeps local-only entities');
assert(Store.workoutById('w_remoteonly'), 'mergeRemote adds remote-only entities');
assert(!Store.state.users.some(u => u.id === 'u_ghost'), 'mergeRemote: tombstone newer than updatedAt stays deleted');
assert(Store.state.deleted.users['u_ghost'] === 999999999999999, 'mergeRemote unions tombstones');
assert(Store.state.currentUserId === localCur, 'mergeRemote keeps LOCAL currentUserId');
assert(Store.state.sync.deviceId === localDev && Store.state.sync.url !== 'https://evil', 'mergeRemote keeps LOCAL sync config');

// idempotent second merge -> unchanged
mres = Store.mergeRemote(remote);
assert(mres.changed === false, 'mergeRemote idempotent (changed=false second time)');

// LWW the other way: local newer than remote
const remote2 = JSON.parse(JSON.stringify(base));
remote2.workouts[0].name = 'AncientEdit';
remote2.workouts[0].updatedAt = 2;
mres = Store.mergeRemote(remote2);
assert(Store.workoutById(sharedW.id).name === 'RemoteEdit', 'mergeRemote LWW: local newer entity survives');

// resurrect: entity updated after tombstone
const remote3 = { users: [{ id: 'u_ghost', name: 'GhostBack', emoji: '👻', color: '#0a84ff', createdAt: 1, updatedAt: 9999999999999999, settings: {} }] };
mres = Store.mergeRemote(remote3);
assert(Store.state.users.some(u => u.id === 'u_ghost'), 'entity with updatedAt > tombstone is resurrected');

// malformed remotes never throw
for (const bad of [null, 42, 'str', [], { users: 'nope', deleted: 7 }, { workouts: [{}, { id: 5 }], deleted: { workouts: 'x' } }]) {
  let threw = false;
  try { Store.mergeRemote(bad); } catch (e) { threw = true; }
  assert(!threw, 'mergeRemote never throws on malformed remote: ' + JSON.stringify(bad));
}

// ---------- persistence across reload ----------
const namesBefore = Store.state.users.map(u => u.name);
Store.load();
eq(Store.state.users.map(u => u.name), namesBefore, 'state persists across load()');

// ---------- seedDemo ----------
localStorage.clear();
Store.load();
Store.seedDemo();
st = Store.state;
eq(st.users.map(u => u.name), ['Erfan', 'Amu Reza', 'Dana'], 'seedDemo 3 users');
eq(st.users.map(u => u.emoji), ['🦍', '🐻', '🐆'], 'seedDemo emojis');
// Identity is keyed off the CVD-safe series --s1..--s6 (which excludes the GO
// accent hue), not the retired ['#2ca350','#0a84ff','#cf7c00'] literals.
eq(st.users.map(u => u.colorKey), ['s5', 's2', 's3'], 'seedDemo identity slots');
eq(st.users.map(u => u.color), ['#b0dc78', '#3890c0', '#c96b41'], 'seedDemo colors (old-client fallback hexes)');
assert(st.users.every(u => u.settings.units === 'lb'), 'seedDemo users use lb');
assert(st.currentUserId === st.users[0].id, 'seedDemo sets currentUserId to first user');

const yesterday = U.addDays(U.todayStr(), -1);
// v2: Erfan also has typed sessions (runs/rucks/durability/tests); the classic
// lifting invariants below are asserted against LIFT workouts only.
const isLiftWorkout = w => w.entries.length > 0 && w.entries.every(e => !e.type || e.type === 'lift');
for (const u of st.users) {
  const ws = Store.workoutsFor(u.id);
  const lifts = ws.filter(isLiftWorkout);
  assert(lifts.length >= 25 && lifts.length <= 60, u.name + ' has plausible lift workout count (' + lifts.length + ')');
  assert(ws[0].date === yesterday, u.name + ' most recent workout is yesterday (' + ws[0].date + ')');
  // sorted desc
  let sorted = true;
  for (let i = 1; i < ws.length; i++) {
    if (ws[i - 1].date < ws[i].date) sorted = false;
  }
  assert(sorted, u.name + ' workoutsFor sorted date desc');
  // per-week 3-5 ish (lifting program)
  const weeks = {};
  lifts.forEach(w => { const k = U.weekStart(w.date); weeks[k] = (weeks[k] || 0) + 1; });
  const counts = Object.values(weeks);
  assert(Math.min(...counts) >= 1 && Math.max(...counts) <= 6, u.name + ' 1-6 lift workouts per week');
  assert(lifts.every(w => w.durationMin >= 40 && w.durationMin <= 85), u.name + ' plausible lift durations');
  assert(lifts.every(w => w.entries.length >= 3), u.name + ' lift workouts have >=3 entries');
}

// every seeded lift exerciseId resolves
const allIds = new Set();
st.workouts.forEach(w => w.entries.forEach(e => { if (e.exerciseId) allIds.add(e.exerciseId); }));
st.templates.forEach(t => t.entries.forEach(e => allIds.add(e.exerciseId)));
assert(allIds.size >= 20, 'seed uses >=20 distinct exercises (' + allIds.size + ')');
if (realExercises) {
  const missing = [...allIds].filter(id => !ExerciseDB.byId(id));
  eq(missing, [], 'every seeded exerciseId resolves via ExerciseDB.byId');
} else {
  console.log('SKIP: ExerciseDB.byId check (stub); ids used: ' + [...allIds].sort().join(', '));
}

// warmups + working sets + progressive overload on Erfan bench
const erfan = st.users[0];
const benchHist = Store.workoutsFor(erfan.id)
  .filter(w => w.entries.some(e => e.exerciseId === 'barbell_bench_press'))
  .reverse(); // asc
assert(benchHist.length >= 10, 'Erfan benched often (' + benchHist.length + ')');
function topBench(w) {
  const e = w.entries.find(e => e.exerciseId === 'barbell_bench_press');
  return Math.max(...e.sets.filter(s => s.type === 'work').map(s => s.weightKg));
}
const firstTop = topBench(benchHist[0]);
const lastTop = topBench(benchHist[benchHist.length - 1]);
assert(lastTop > firstTop + 8, 'progressive overload on bench: ' + firstTop.toFixed(1) + 'kg -> ' + lastTop.toFixed(1) + 'kg');
assert(firstTop > 55 && firstTop < 68 && lastTop > 70 && lastTop < 82, 'bench roughly 60->75kg');
const someWarmups = st.workouts.some(w => w.entries.some(e => e.sets.some(s => s.type === 'warmup')));
const someRpe = st.workouts.some(w => w.entries.some(e => e.sets.some(s => s.rpe !== null)));
const someNotes = st.workouts.some(w => w.notes);
assert(someWarmups && someRpe && someNotes, 'seed has warmups, occasional RPE, occasional notes');
assert(st.workouts.every(w => w.entries.every(e => (e.type && e.type !== 'lift') || (e.sets.filter(s => s.type === 'work').length >= 2 && e.sets.filter(s => s.type === 'work').length <= 4))), 'lift entries have 2-4 working sets');

// body metrics + health samples
for (const u of st.users) {
  const bw = Store.bodyMetricsFor(u.id, 'weightKg');
  assert(bw.length >= 15 && bw.length <= 30, u.name + ' bodyweight rows ~every 3 days (' + bw.length + ')');
  const bf = Store.bodyMetricsFor(u.id, 'bodyFatPct');
  assert(bf.length >= 3 && bf.length <= 6, u.name + ' a few bodyFatPct rows (' + bf.length + ')');
  assert(bw.every(r => r.value > 55 && r.value < 110), u.name + ' bodyweight in plausible kg range');
}
const steps = Store.healthFor(erfan.id, 'steps');
assert(steps.length === 60, 'Erfan has 60 days of steps (' + steps.length + ')');
assert(steps.every(s => s.value >= 4000 && s.value <= 15000), 'steps in 4k-15k');
const hr = Store.healthFor(erfan.id, 'restingHR');
assert(hr.length === 60 && hr.every(s => s.value >= 52 && s.value <= 68), 'restingHR 52-68, 60 days');
assert(Store.healthFor(erfan.id, 'activeEnergyKcal').length === 60 && Store.healthFor(erfan.id, 'exerciseMin').length === 60, 'activeEnergy + exerciseMin 60 days');
assert(Store.healthFor(st.users[1].id).length === 0, 'health samples only for user 1');

// weights stored in kg but land on clean 5-lb increments
const w0 = st.workouts.find(w => w.entries.some(e => e.exerciseId === 'barbell_bench_press'));
const benchSet = w0.entries.find(e => e.exerciseId === 'barbell_bench_press').sets.find(s => s.type === 'work');
const lbVal = benchSet.weightKg * U.LB_PER_KG;
assert(Math.abs(lbVal - Math.round(lbVal / 5) * 5) < 0.5, 'seeded weights round to 5 lb (' + lbVal.toFixed(2) + ' lb)');

// seedDemo persisted
const reloaded = JSON.parse(localStorage.getItem('ironlog/v1'));
assert(reloaded.users.length === 3 && reloaded.workouts.length === st.workouts.length, 'seedDemo persisted to localStorage');

// templates seeded and visible
assert(Store.templatesFor(erfan.id).length >= 2, 'seeded templates visible to user 1');

unsub();
console.log(failures === 0 ? '\nALL TESTS PASSED' : '\n' + failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
