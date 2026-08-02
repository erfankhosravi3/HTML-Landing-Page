/* Smoke test: load real util/exercises/store/analytics/guardrails/app/views-insights
   with DOM stubs, render dashboard/analytics/body/leaderboard in simple and
   performance mode, and assert mode gating + no NaN/undefined in markup. */
'use strict';
const P = require('./lib/paths');
const fs = require('fs');
const path = require('path');
const JS = P.JS;

function fakeEl() {
  return {
    innerHTML: '', textContent: '', title: '', value: '', style: { setProperty() {} },
    appendChild() {}, remove() {}, focus() {}, click() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    addEventListener() {}, removeEventListener() {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {}, getAttribute() { return null; }, contains() { return false; }
  };
}

global.window = global;
global.localStorage = {
  _m: {},
  getItem(k) { return Object.prototype.hasOwnProperty.call(this._m, k) ? this._m[k] : null; },
  setItem(k, v) { this._m[k] = String(v); },
  removeItem(k) { delete this._m[k]; },
  key(i) { return Object.keys(this._m)[i] || null; },
  get length() { return Object.keys(this._m).length; }
};
window.localStorage = global.localStorage;
global.document = {
  title: '',
  body: fakeEl(),
  head: fakeEl(),
  addEventListener() {}, removeEventListener() {},
  createElement() { return fakeEl(); },
  getElementById() { return null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  activeElement: null
};
global.location = { hash: '', protocol: 'file:' };
global.requestAnimationFrame = function (fn) { fn(); };
try { global.navigator = {}; } catch (e) { /* node >= 21 exposes a getter */ }

function load(f) { new Function(fs.readFileSync(path.join(JS, f), 'utf8'))(); }

load('util.js');
load('exercises.js');
load('store.js');
load('analytics.js');
load('guardrails.js');

// Stub Charts + MuscleMap (render-only modules)
window.Charts = {
  SERIES: ['#2ca350', '#0a84ff', '#cf7c00', '#bf5af2', '#ff375f', '#3399cc'],
  line() {}, bars() {}, groupedBars() {}, heatCalendar(el, o) { window.__lastHeat = o; },
  rings() {}, spark() {}, donut() {}
};
window.MuscleMap = { render() {}, heatColor() { return ''; } };

load('app.js');

// Capture view renders
const captured = {};
const origRegister = App.registerView;
App.registerView = function (id, def) { captured[id] = def; origRegister(id, def); };
load('views-insights.js');

let failures = 0;
function check(name, cond) {
  if (cond) console.log('PASS ' + name);
  else { failures++; console.log('FAIL ' + name); }
}
function render(view) {
  const c = fakeEl();
  captured[view].render(c, {});
  return c.innerHTML;
}
function clean(html) {
  return !/NaN|undefined/.test(html);
}

Store.load();
const u = Store.addUser({ name: 'Test <x> "q"', emoji: '🦍', color: '#2ca350', settings: { units: 'lb' } });
Store.setCurrentUser(u.id);

// ---- simple mode, no workouts ----
let d = render('dashboard');
check('simple: no Weekly status card', d.indexOf('Weekly status') === -1);
check('simple: no Log a niggle card', d.indexOf('Log a niggle') === -1);
check('simple: no countdown', d.indexOf('to selection') === -1);
check('simple: dashboard clean', clean(d));
check('simple: XSS-escaped name', d.indexOf('Test &lt;x&gt;') !== -1 && d.indexOf('<x>') === -1);
check('simple: analytics renders', clean(render('analytics')));
check('simple: body renders, no pain/journal', (function () {
  const h = render('body');
  return clean(h) && h.indexOf('Pain &amp; niggles') === -1 && h.indexOf('data-act="add-journal"') === -1;
})());
check('simple: leaderboard renders', clean(render('leaderboard')));

// ---- add a lift workout + a typed (cardio) workout ----
const today = U.todayStr();
Store.addWorkout({
  userId: u.id, date: U.addDays(today, -1), name: 'Push Day', notes: '', source: 'manual',
  entries: [{ id: U.uid('e'), exerciseId: 'bench_press', notes: '', sets: [
    { weightKg: 60, reps: 5, type: 'work', rpe: null },
    { weightKg: 60, reps: 5, type: 'work', rpe: null }
  ] }]
});
Store.addWorkout({
  userId: u.id, date: today, name: 'Easy run', notes: '', source: 'manual', durationMin: 42,
  entries: [{ id: U.uid('e'), type: 'cardio', mode: 'run', distanceKm: 6.4, durationMin: 42, effort: 'easy' }]
});

d = render('dashboard');
check('simple: typed last workout shows Run summary', d.indexOf('Easy run') !== -1 && d.indexOf('Run') !== -1);
check('simple: typed last workout shows pace', /\d:\d\d \/mi/.test(d));
check('simple: typed last workout no Repeat', !/data-act="repeat"/.test(d.slice(d.indexOf('Last workout'))));
check('simple: dashboard clean with typed workout', clean(d));

let a = render('analytics');
check('simple: analytics clean with typed workout', clean(a));
check('calendar heats duration-only workout (42min*40=1680kg -> lb)', (function () {
  const heat = window.__lastHeat && window.__lastHeat.values;
  if (!heat) return false;
  const v = heat[today];
  // 1680 kg -> ~3704 lb display units
  return typeof v === 'number' && v > 3000 && v < 4500;
})());
check('simple: body clean', clean(render('body')));
check('simple: leaderboard clean (no NaN from typed workout)', clean(render('leaderboard')));

// ---- performance mode ----
Store.updateUser(u.id, { settings: { trainingProfile: 'performance' } });
Store.setGoals(u.id, { preset: 'sfas', selectionDate: U.addDays(today, 70), targets: {} });
Store.setProfile(u.id, { sex: 'male', birthYear: 1998 });
check('App.isPerformance() true', App.isPerformance() === true);

d = render('dashboard');
check('perf: Weekly status card present', d.indexOf('Weekly status') !== -1);
check('perf: countdown chip 10 weeks', d.indexOf('10 weeks to selection') !== -1);
check('perf: Log a niggle card present', d.indexOf('Log a niggle') !== -1);
check('perf: dashboard clean', clean(d));
check('perf: weekly status mentions running distance', /running/.test(d));

// pain + journal data
Store.addPainEntry({ userId: u.id, date: today, muscleId: 'shin_l', severity: 8, worseDuring: true, boneLine: true, morning: false, note: 'ouch <b>' });
Store.addJournalEntry({ userId: u.id, date: today, entry: 'Felt <script>alert(1)</script> ok', source: 'checkin' });

const b = render('body');
check('perf: body shows Pain & niggles', b.indexOf('Pain &amp; niggles') !== -1);
check('perf: body shows Left shin entry', b.indexOf('Left shin') !== -1);
check('perf: pain red flag surfaced', b.indexOf('assessed') !== -1);
check('perf: journal entry escaped', b.indexOf('&lt;script&gt;') !== -1 && b.indexOf('<script>alert') === -1);
check('perf: pain note escaped', b.indexOf('ouch &lt;b&gt;') !== -1);
check('perf: body clean', clean(b));

d = render('dashboard');
check('perf: dashboard red-flag notice', d.indexOf('red flag') !== -1);

// painFlags targeting: red flags reference the new entry
const flags = Guardrails.painFlags(Store.painFor(u.id));
check('painFlags returns red for bone-line', flags.some(function (f) { return f.level === 'red'; }));

// resolve gating: resolved entries drop out of flag evaluation
const pid = Store.painFor(u.id)[0].id;
Store.updatePainEntry(pid, { resolved: true });
const openFlags = Guardrails.painFlags(Store.painFor(u.id).filter(function (p) { return !p.resolved; }));
check('resolved entry no longer flagged', openFlags.length === 0);

// selection date today / past
Store.setGoals(u.id, { preset: 'sfas', selectionDate: today, targets: {} });
d = render('dashboard');
check('perf: selection today label', d.indexOf('Selection is today') !== -1);
Store.setGoals(u.id, { preset: 'sfas', selectionDate: U.addDays(today, -3), targets: {} });
d = render('dashboard');
check('perf: past selection date hides chip', d.indexOf('to selection') === -1 && d.indexOf('Selection is today') === -1);

// mixed workout (lift + cardio) last-workout card
Store.addWorkout({
  userId: u.id, date: today, name: 'Brick', notes: '', source: 'manual', durationMin: 60,
  entries: [
    { id: U.uid('e'), exerciseId: 'back_squat', notes: '', sets: [{ weightKg: 100, reps: 5, type: 'work', rpe: null }] },
    { id: U.uid('e'), type: 'cardio', mode: 'ruck', distanceKm: 4.8, durationMin: 55, loadKgDry: 20 }
  ]
});
d = render('dashboard');
check('perf: mixed workout shows lift + ruck summary', d.indexOf('Brick') !== -1 && d.indexOf('Ruck') !== -1 && /1 exercise/.test(d));
check('perf: mixed workout keeps Repeat', /data-act="repeat"/.test(d.slice(d.indexOf('Last workout'))));
check('perf: dashboard clean (mixed)', clean(d));
check('perf: analytics clean (mixed)', clean(render('analytics')));
check('perf: leaderboard clean (mixed)', clean(render('leaderboard')));

// mobility / durability / test summaries
Store.addWorkout({
  userId: u.id, date: today, name: 'Stretch', source: 'manual', durationMin: 20,
  entries: [{ id: U.uid('e'), type: 'mobility', modality: 'static', durationMin: 20, targetMuscles: ['hamstrings', 'calves'] }]
});
d = render('dashboard');
check('perf: mobility summary duration + areas', d.indexOf('Mobility') !== -1 && d.indexOf('20 min') !== -1 && d.indexOf('Hamstrings') !== -1);
Store.addWorkout({
  userId: u.id, date: today, name: 'Test day', source: 'manual',
  entries: [{ id: U.uid('e'), type: 'test', protocol: 'run2mi', results: { value: 14.5 }, score: 88 }]
});
d = render('dashboard');
check('perf: test summary protocol + score', d.indexOf('2-mile run') !== -1 && d.indexOf('score 88') !== -1);
check('perf: dashboard clean (all types)', clean(d));

// unknown typed entry passes without breaking
Store.addWorkout({
  userId: u.id, date: today, name: 'Future thing', source: 'manual',
  entries: [{ id: U.uid('e'), type: 'sauna', durationMin: 15 }]
});
d = render('dashboard');
check('perf: unknown entry type summarized generically', d.indexOf('1 activity') !== -1 && clean(d));

// Guardrails.weeklyStatus warning surfacing (hard week: no rest day)
for (let i = 0; i < 7; i++) {
  const dd = U.addDays(U.weekStart(today), i);
  if (dd > today) break;
  Store.addWorkout({
    userId: u.id, date: dd, name: 'grind', source: 'manual',
    entries: [{ id: U.uid('e'), type: 'cardio', mode: 'run', distanceKm: 8, durationMin: 45, effort: 'hard' }]
  });
}
d = render('dashboard');
const wsNow = Guardrails.weeklyStatus(Store.workoutsFor(u.id), Store.currentUser(), today);
check('weeklyStatus warnings render amber on dashboard',
  wsNow.warnings.length === 0 || wsNow.warnings.every(function (wr) { return d.indexOf(U.esc(wr.message)) !== -1; }));
check('perf: dashboard clean (heavy week)', clean(d));

// back to simple: all v2 UI disappears
Store.updateUser(u.id, { settings: { trainingProfile: 'simple' } });
d = render('dashboard');
check('back to simple: no v2 cards', d.indexOf('Weekly status') === -1 && d.indexOf('Log a niggle') === -1 && d.indexOf('to selection') === -1);
const b2 = render('body');
check('back to simple: no pain/journal sections', b2.indexOf('Pain &amp; niggles') === -1 && b2.indexOf('data-act="add-journal"') === -1);

console.log(failures === 0 ? '\nALL PASS' : '\n' + failures + ' FAILURES');
process.exit(failures ? 1 : 0);
