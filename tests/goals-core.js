'use strict';
/* The Goals probe: store invariants and the judgment engine, against the
   binding spec in the P7 addendum. Every threshold asserted here is a number
   the ARCHITECTURE file promises; if one drifts, this suite is the tripwire.

   The refusals get the hardest testing, because a system that judges from
   thin data fails EXACTLY like a system with no judgment at all — it prints
   something, and the something is wrong. */
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
['util.js', 'exercises.js', 'store.js', 'goals.js'].forEach(function (f) {
  vm.runInThisContext(fs.readFileSync(path.join(P.JS, f), 'utf8'), { filename: f });
});

let pass = 0; const fails = [];
function ok(c, m) { if (c) pass++; else fails.push(m); }
function eq(a, b, m) { ok(a === b, m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }

function reset() {
  storage.clear();
  Store.load();
  const u = Store.addUser({ name: 'Erfan' });
  Store.setCurrentUser(u.id);
  return u;
}

const TODAY = '2026-09-06';

/* ==================================================================
   1. STORE — data invariants
   ================================================================== */
let u = reset();

const g1 = Store.addGoal({ name: 'Save $6,000', why: 'buffer', shape: 'reach',
  measure: { name: 'balance', unit: '$', refresh: 'asked' },
  baseline: { value: 2150, at: '2026-08-16' },
  target: { value: 6000, date: '2026-12-31' } });
ok(!!g1 && g1.id && g1.userId === u.id, 'addGoal stamps id and user');
eq(g1.status, 'active', 'goals default to active');
ok(Array.isArray(g1.versions) && g1.versions.length === 1, 'v1 is recorded at creation');

Store.addGoal({ name: 'Farsi' });
Store.addGoal({ name: 'EMT cert' });
const fourth = Store.addGoal({ name: 'One too many' });
eq(fourth, null, 'THE CAP: a fourth active goal is refused');
const later = Store.addGoal({ name: 'Motorcycle license', status: 'later' });
ok(!!later, 'but the Later list is always open');
eq(Store.updateGoal(later.id, { status: 'active' }), null,
  'and promoting from Later respects the same cap');

Store.deleteGoal(later.id);
ok(Store.state.deleted.goals[later.id] > 0, 'deleting a goal tombstones it');

// Tick idempotency — the double-tap defense.
const p1 = Store.addPractice({ goalId: g1.id, cue: 'payday', action: 'transfer $650',
  cadence: { type: 'weekly', times: 2 } });
const t1 = Store.tickPractice(p1.id, '2026-09-01');
const t2 = Store.tickPractice(p1.id, '2026-09-01');
ok(t1 && t2 && t1.id === t2.id, 'ONE TICK PER DAY: a double-tap returns the same tick');
eq(Store.state.ticks.length, 1, 'and mints nothing');
Store.untickPractice(p1.id, '2026-09-01');
eq(Store.state.ticks.length, 0, 'untick removes it');
ok(Object.keys(Store.state.deleted.ticks).length === 1, 'and tombstones it, so sync cannot resurrect it');

// Measure same-date correction.
Store.reportMeasure(g1.id, '2026-09-01', 2700);
Store.reportMeasure(g1.id, '2026-09-01', 2750);
eq(Store.state.measures.length, 1, 'ONE POINT PER DAY: re-reporting corrects');
eq(Store.state.measures[0].value, 2750, 'to the newer value');

// Standing practice.
const st = Store.addPractice({ cue: '05:00', action: 'up', floor: 6 });
eq(st.goalId, '', 'no goalId = standing');

/* ---- forward-compat: unknown keys inside P7 entities survive ---- */
Store.updateGoal(g1.id, { futureField: { nested: true } });
const dumped = Store.exportJSON();
storage.set('ironlog/v1', dumped);
Store.load();
const reloaded = Store.state.goals.find(function (g) { return g.id === g1.id; });
ok(reloaded && reloaded.futureField && reloaded.futureField.nested === true,
  'unknown keys inside a goal survive a save/load round trip (shim)');
ok(Store.state.practices.length === 2 && Store.state.measures.length === 1,
  'all P7 collections survive the round trip');

/* ---- old-client shape: a state WITHOUT the collections loads clean ---- */
const legacy = JSON.parse(dumped);
delete legacy.goals; delete legacy.practices; delete legacy.ticks;
delete legacy.measures; delete legacy.accomplishments;
storage.set('ironlog/v1', JSON.stringify(legacy));
Store.load();
ok(Array.isArray(Store.state.goals) && Store.state.goals.length === 0,
  'a pre-P7 state loads with empty collections, never undefined');

/* ==================================================================
   2. ENGINE — rates
   ================================================================== */
u = reset();
const goal = Store.addGoal({ name: 'Farsi fallbacks', shape: 'reach',
  measure: { name: 'fallbacks', unit: '', refresh: 'asked' },
  baseline: { value: 31, at: '2026-08-16' },
  target: { value: 10, date: '2026-11-30' } });

function pts(list) {
  return list.map(function (pair) { return { goalId: goal.id, date: pair[0], value: pair[1] }; });
}

// requiredRate: (10 - 24) / days('2026-09-06' -> '2026-11-30') = -14 / 85
let rr = Goals.requiredRate(goal, 24, TODAY);
ok(Math.abs(rr - (-14 / 85)) < 1e-9, 'requiredRate is (target-latest)/daysLeft, from TODAY');

// observedRate: perfect line -0.5/day over 3 weekly points
let obs = Goals.observedRate(Goals.sortedPoints(pts([
  ['2026-08-23', 31], ['2026-08-30', 27.5], ['2026-09-06', 24]])));
ok(Math.abs(obs - (-0.5)) < 1e-9, 'observedRate is the least-squares slope per day');

// window: only the last 5 points count
obs = Goals.observedRate(Goals.sortedPoints(pts([
  ['2026-07-01', 100], ['2026-08-09', 31], ['2026-08-16', 30],
  ['2026-08-23', 29], ['2026-08-30', 28], ['2026-09-06', 27]])));
ok(Math.abs(obs - (-1 / 7)) < 1e-6,
  'the ancient outlier is outside the 5-point trend window (got ' + obs + ')');

/* ==================================================================
   3. ENGINE — verdict precedence (the refusals)
   ================================================================== */
// 2 points, ON PACE — still 'measuring'. The refusal beats the flattery.
let v = Goals.verdict(goal, pts([['2026-08-30', 31], ['2026-09-06', 20]]), TODAY);
eq(v.state, 'measuring', 'TWO POINTS IS NO TREND, even a flattering one');

// 3 points but stale — 'stale' even when ahead of required.
v = Goals.verdict(goal, pts([['2026-07-01', 31], ['2026-07-08', 20], ['2026-07-15', 11]]),
  TODAY);
eq(v.state, 'stale', 'A STALE MEASURE SUSPENDS THE VERDICT, even a winning one');
ok(v.requiredRate === null && v.observedRate === null,
  'and no rates are computed on suspended data');

// staleness boundary: exactly 14 days old is NOT stale; 15 is.
v = Goals.verdict(goal, pts([['2026-08-09', 31], ['2026-08-16', 29], ['2026-08-23', 27]]), TODAY);
eq(v.state, 'ontrack', '14 days old (exactly 2x weekly refresh) still gets a real verdict');
v = Goals.verdict(goal, pts([['2026-08-08', 31], ['2026-08-15', 29], ['2026-08-22', 27]]), TODAY);
eq(v.state, 'stale', '15 days old crosses 2x the refresh interval');

// ontrack vs behind
v = Goals.verdict(goal, pts([['2026-08-23', 31], ['2026-08-30', 27.5], ['2026-09-06', 24]]), TODAY);
eq(v.state, 'ontrack', '-0.5/day observed vs -0.165 required is on track');
v = Goals.verdict(goal, pts([['2026-08-23', 25], ['2026-08-30', 24.5], ['2026-09-06', 24]]), TODAY);
eq(v.state, 'behind', 'a real but insufficient rate is behind');
ok(v.daysBehind > 0, 'with a projected days-behind (got ' + v.daysBehind + ')');
// arrival: 14 left at 1/14 per day = 196 days from last point; needed 85 -> 111 behind
eq(v.daysBehind, 111, 'daysBehind is projection minus promise');

// moving AWAY: behind with NO number — never a fabricated projection
v = Goals.verdict(goal, pts([['2026-08-23', 24], ['2026-08-30', 25], ['2026-09-06', 26]]), TODAY);
eq(v.state, 'behind', 'moving away from the target is behind');
eq(v.daysBehind, null, 'with NO days-behind number — at this rate you never arrive');

// target already reached
v = Goals.verdict(goal, pts([['2026-08-23', 12], ['2026-08-30', 11], ['2026-09-06', 9]]), TODAY);
eq(v.state, 'ontrack', 'reaching the target is on track regardless of slope');

/* ==================================================================
   4. ENGINE — adherence and floors
   ================================================================== */
const daily = { id: 'pd', cadence: { type: 'daily' } };
const weekly3 = { id: 'pw', cadence: { type: 'weekly', times: 3 } };
function ticksOn(id, dates) {
  return dates.map(function (d) { return { practiceId: id, date: d }; });
}

let a = Goals.adherence(daily, ticksOn('pd',
  ['2026-09-06', '2026-09-05', '2026-09-04', '2026-09-03', '2026-09-02']), TODAY, 7);
eq(a.done, 5, '5 ticks counted in the 7-day window');
eq(a.scheduled, 7, 'daily schedules 7 in 7');
ok(Math.abs(a.rate - 5 / 7) < 1e-9, 'rate is done/scheduled');

a = Goals.adherence(weekly3, ticksOn('pw', ['2026-09-01', '2026-09-03']), TODAY, 7);
eq(a.scheduled, 3, 'weekly x3 schedules 3 per whole week');
a = Goals.adherence(weekly3, [], TODAY, 10);
eq(a.scheduled, 3, 'a 10-day window still counts ONE whole week — no partial-week inflation');

a = Goals.adherence(daily, ticksOn('pd', ['2026-08-30', '2026-09-07', '2026-09-06']), TODAY, 7);
eq(a.done, 1, 'ticks outside the window (too old, in the future) do not count');

const floor = { id: 'pf', cadence: { type: 'daily' }, floor: 5 };
let f = Goals.floorStatus(floor, ticksOn('pf', ['2026-09-06', '2026-09-05', '2026-09-04', '2026-09-03']), TODAY);
eq(f.state, 'below', '4 of a floor of 5 is below');
f = Goals.floorStatus(floor, ticksOn('pf', ['2026-09-06', '2026-09-05', '2026-09-04', '2026-09-03', '2026-09-02']), TODAY);
eq(f.state, 'holding', '5 of 5 holds');

/* ==================================================================
   5. ENGINE — the diagnosis 2x2
   ================================================================== */
const practice = { id: 'pp', cadence: { type: 'daily' } };
const fullWeek = ticksOn('pp', ['2026-09-06', '2026-09-05', '2026-09-04', '2026-09-03',
  '2026-09-02', '2026-09-01', '2026-08-31']);
const thinWeek = ticksOn('pp', ['2026-09-06', '2026-09-02', '2026-09-01']);

// high adherence + on track -> holding
let d = Goals.diagnosis(goal, practice, fullWeek,
  pts([['2026-08-23', 31], ['2026-08-30', 27.5], ['2026-09-06', 24]]), TODAY);
eq(d.state, 'holding', 'work done + number moving = holding');

// high adherence + flat -> pathwrong
const flatPts = pts([['2026-08-16', 24.3], ['2026-08-23', 24.2], ['2026-08-30', 24.1], ['2026-09-06', 24]]);
d = Goals.diagnosis(goal, practice, fullWeek, flatPts, TODAY);
eq(d.state, 'pathwrong', 'work done + number flat = THE PATH IS WRONG, NOT YOU');

// low adherence + the SAME flat data -> doesntfit, never pathwrong
d = Goals.diagnosis(goal, practice, thinWeek, flatPts, TODAY);
eq(d.state, 'doesntfit',
  'THE REFUSAL: a practice that was not run is never judged — low adherence reads as fit');

// high adherence + measuring -> undecided
d = Goals.diagnosis(goal, practice, fullWeek, pts([['2026-09-06', 24]]), TODAY);
eq(d.state, 'undecided', 'work done + measure too young = undecided, not a verdict');

// high adherence + moving-but-behind -> undecided (levers, not blame)
d = Goals.diagnosis(goal, practice, fullWeek,
  pts([['2026-08-23', 25], ['2026-08-30', 24.5], ['2026-09-06', 24]]), TODAY);
eq(d.state, 'undecided', 'moving but not fast enough is a lever conversation, not a failure');

/* flatness must be SUSTAINED: two quiet points inside the window are noise */
ok(!Goals.isFlat(goal, pts([['2026-08-30', 24.1], ['2026-09-06', 24]]), TODAY),
  'two points cannot establish flatness');
ok(Goals.isFlat(goal, flatPts, TODAY), 'four quiet points across three weeks can');

/* ==================================================================
   6. ENGINE — miss patterns and reviews
   ================================================================== */
// Sep 2026: the 6th is a Sunday. Tick everything except the two Tuesdays.
const allBut = [];
for (let i = 0; i < 14; i++) {
  const day = U.addDays(TODAY, -i);
  if (U.strToDate(day).getDay() !== 2) allBut.push(day);
}
let mp = Goals.missPattern({ id: 'pm', cadence: { type: 'daily' } },
  ticksOn('pm', allBut), TODAY, 14);
eq(mp.misses, 2, 'two scheduled days were missed');
eq(mp.byDay[2], 2, 'and both were Tuesdays — the pattern is counts, nothing more');
eq(Goals.missPattern({ id: 'pm', cadence: { type: 'weekly', times: 2 } }, [], TODAY, 14), null,
  'weekly practices get NO pattern — which weekday "should" have a tick is unknowable');

ok(Goals.reviewDue(null, TODAY), 'never reviewed = due');
ok(Goals.reviewDue('2026-08-30', TODAY), '7 days since = due');
ok(!Goals.reviewDue('2026-09-01', TODAY), '5 days since = not due');

console.log('passed:', pass);
if (fails.length) { fails.forEach(function (f) { console.log('FAIL:', f); }); process.exit(1); }
console.log('PASS: goals core (' + pass + ' assertions)');
