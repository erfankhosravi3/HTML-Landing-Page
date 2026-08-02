/* Node test suite for gym/js/guardrails.js — stub window, load real util.js
   for U, then the module under test. Run: node guardrails.test.js */
'use strict';

const P = require('./lib/paths');
global.window = global; // modules attach namespaces to window
require(require('path').join(P.JS, 'util.js'));
require(require('path').join(P.JS, 'guardrails.js'));

const G = global.Guardrails;
const U = global.U;

let pass = 0;
let fail = 0;
const failures = [];

function ok(cond, name) {
  if (cond) { pass++; } else { fail++; failures.push(name); console.error('FAIL: ' + name); }
}
function eq(actual, expected, name) {
  const c = JSON.stringify(actual) === JSON.stringify(expected);
  if (!c) console.error('  expected ' + JSON.stringify(expected) + ' got ' + JSON.stringify(actual));
  ok(c, name);
}
function codes(arr) { return arr.map(w => w.code); }
function byCode(arr, code) { return arr.find(w => w.code === code); }

/* ---------- fixture helpers ----------
   Fixed calendar: draft week = Mon 2026-07-27 .. Sun 2026-08-02.
   Last week      = Mon 2026-07-20 .. Sun 2026-07-26.
   Trailing 4 wks = Mon 2026-06-29 .. Sun 2026-07-26. */
const WS = '2026-07-27';
let n = 0;
function wk(date, entries, extra) {
  return Object.assign({ id: 'w' + (++n), userId: 'u1', date, entries }, extra || {});
}
function run(km, extra) {
  return Object.assign({ id: 'e' + (++n), type: 'cardio', mode: 'run', distanceKm: km, durationMin: km * 6 }, extra || {});
}
function ruck(loadKg, km, extra) {
  return Object.assign({ id: 'e' + (++n), type: 'cardio', mode: 'ruck', loadKgTotal: loadKg, distanceKm: km, durationMin: km * 10 }, extra || {});
}
function lift() {
  return { id: 'e' + (++n), type: 'lift', exerciseId: 'bench_press', sets: [{ weightKg: 60, reps: 5, type: 'work' }] };
}
const kgUser = { id: 'u1', settings: { units: 'kg' }, profile: {} };
const lbUser = { id: 'u1', settings: { units: 'lb' }, profile: {} };

/* ============================================================
   MESSAGES
   ============================================================ */
const EXPECTED_CODES = ['ruck_double_increase', 'ruck_week_count', 'ruck_dry_load',
  'run_long_jump', 'run_weekly_volume', 'run_ramp', 'easy_share_low', 'no_rest_day',
  'pain_bone_line', 'pain_morning', 'pain_severe', 'pain_rising',
  'pain_worse_consecutive', 'pain_worse_during'];
for (const c of EXPECTED_CODES) {
  ok(typeof G.MESSAGES[c] === 'string' && G.MESSAGES[c].length > 10, 'MESSAGES has ' + c);
}
ok(G.MESSAGES.ruck_double_increase === 'Load AND distance both jumped this week — pick one. Overuse injuries end preps.',
  'ruck_double_increase base copy verbatim');

/* ============================================================
   units formatting (fmtDistanceKm)
   ============================================================ */
eq(G.fmtDistanceKm(6.8, 'kg'), '6.8 km', 'fmt 6.8 km for kg user');
eq(G.fmtDistanceKm(6.759, 'lb'), '4.2 mi', 'fmt 6.759 km -> 4.2 mi for lb user'); // 6.759/1.609344 = 4.2001
eq(G.fmtDistanceKm(8.04672, 'lb'), '5 mi', 'fmt exact 5 mi trims .0');
eq(G.fmtDistanceKm(12, 'kg'), '12 km', 'fmt integer km trims .0');

/* ============================================================
   checkSession — empty history safety
   ============================================================ */
eq(G.checkSession(wk(WS, [run(5)]), [], kgUser), [], 'first-ever run: zero warnings');
eq(G.checkSession(wk(WS, [ruck(15, 4)]), [], kgUser), [], 'first-ever ruck: zero warnings');
eq(G.checkSession(wk(WS, [lift()]), [], kgUser), [], 'plain lift session: zero warnings');
eq(G.checkSession(wk(WS, []), [], kgUser), [], 'empty draft: zero warnings');
eq(G.checkSession(null, null, null), [], 'all-null inputs: zero warnings');

/* ============================================================
   checkSession — ruck double-increase (stop)
   ============================================================ */
// Last week max ruck: 20 kg over 4 km.
const lastWeekRuck = [wk('2026-07-22', [ruck(20, 4)])];

let r = G.checkSession(wk('2026-07-29', [ruck(22, 5)]), lastWeekRuck, kgUser);
eq(codes(r), ['ruck_double_increase'], 'load+distance both up -> stop');
eq(r[0].level, 'stop', 'double-increase level is stop');
ok(r[0].message.indexOf('22 kg') >= 0 && r[0].message.indexOf('5 km') >= 0 &&
   r[0].message.indexOf('20 kg') >= 0 && r[0].message.indexOf('4 km') >= 0,
  'double-increase message carries kg/km specifics');
ok(r[0].message.indexOf('Load AND distance both jumped this week — pick one. Overuse injuries end preps.') === 0,
  'double-increase message starts with canonical copy');

r = G.checkSession(wk('2026-07-29', [ruck(22, 5)]), lastWeekRuck, lbUser);
// 22 kg = 48.5 lb; 5 km = 3.1 mi; 20 kg = 44.1 lb; 4 km = 2.5 mi
ok(r[0].message.indexOf('48.5 lb') >= 0 && r[0].message.indexOf('3.1 mi') >= 0 &&
   r[0].message.indexOf('44.1 lb') >= 0 && r[0].message.indexOf('2.5 mi') >= 0,
  'double-increase message in lb/mi for lb user');

eq(G.checkSession(wk('2026-07-29', [ruck(22, 4)]), lastWeekRuck, kgUser), [],
  'load up, distance equal -> no stop');
eq(G.checkSession(wk('2026-07-29', [ruck(20, 5)]), lastWeekRuck, kgUser), [],
  'distance up, load equal -> no stop');
eq(G.checkSession(wk('2026-07-29', [ruck(20, 4)]), lastWeekRuck, kgUser), [],
  'both equal -> no stop');
eq(G.checkSession(wk('2026-07-29', [ruck(22, 5)]),
  [wk('2026-07-12', [ruck(20, 4)])], kgUser), [],
  'baseline ruck older than last week -> no stop');
// last week's maxima may come from different rucks
r = G.checkSession(wk('2026-07-29', [ruck(23, 7)]),
  [wk('2026-07-20', [ruck(22, 3)]), wk('2026-07-24', [ruck(10, 6)])], kgUser);
eq(codes(r), ['ruck_double_increase'], 'maxima taken across separate last-week rucks');
// loadKgDry used when loadKgTotal absent
r = G.checkSession(wk('2026-07-29', [{ id: 'x', type: 'cardio', mode: 'ruck', loadKgDry: 22, distanceKm: 5, durationMin: 50 }]),
  lastWeekRuck, kgUser);
eq(codes(r), ['ruck_double_increase'], 'dry load used as load when total absent');

/* ============================================================
   checkSession — >2 rucks per Mon-Sun week
   ============================================================ */
r = G.checkSession(wk('2026-07-29', [ruck(15, 4)]),
  [wk('2026-07-27', [ruck(15, 4)]), wk('2026-07-28', [ruck(15, 4)])], kgUser);
eq(codes(r), ['ruck_week_count'], '3rd ruck of the week warns');
ok(r[0].message.indexOf('Ruck #3 this week') >= 0, 'ruck count message names #3');
eq(G.checkSession(wk('2026-07-29', [ruck(15, 4)]),
  [wk('2026-07-27', [ruck(15, 4)])], kgUser), [], '2nd ruck of the week is fine');
eq(G.checkSession(wk('2026-07-29', [ruck(15, 4)]),
  [wk('2026-07-20', [ruck(15, 4)]), wk('2026-07-21', [ruck(15, 4)])], kgUser), [],
  'last-week rucks do not count against this week');
// Sunday belongs to the week, next Monday does not
r = G.checkSession(wk('2026-08-02', [ruck(15, 4)]),
  [wk('2026-07-27', [ruck(15, 4)]), wk('2026-08-01', [ruck(15, 4)])], kgUser);
eq(codes(r), ['ruck_week_count'], 'Sunday draft counts within Mon-Sun week');

/* ============================================================
   checkSession — dry load cap (22.7 kg / 50 lb)
   ============================================================ */
function dryRuck(dry) {
  return { id: 'e' + (++n), type: 'cardio', mode: 'ruck', loadKgDry: dry, loadKgTotal: dry + 2, distanceKm: 3, durationMin: 40 };
}
eq(G.checkSession(wk(WS, [dryRuck(22.7)]), [], kgUser), [], 'dry load exactly 22.7 kg -> no warn');
r = G.checkSession(wk(WS, [dryRuck(22.8)]), [], kgUser);
eq(codes(r), ['ruck_dry_load'], 'dry load 22.8 kg warns');
eq(r[0].level, 'warn', 'dry load level is warn');
ok(r[0].message.indexOf('22.8 kg') >= 0 && r[0].message.indexOf('22.7 kg') >= 0,
  'dry load message shows load and cap in kg');
r = G.checkSession(wk(WS, [dryRuck(25)]), [], lbUser);
ok(r[0].message.indexOf('55.1 lb') >= 0 && r[0].message.indexOf('50 lb') >= 0,
  'dry load message shows 55.1 lb over the 50 lb line for lb user');
// loadKgTotal alone never triggers the dry-load rule
eq(G.checkSession(wk(WS, [ruck(30, 3)]), [], kgUser), [], 'total load 30 kg without dry field -> no dry warn');

/* ============================================================
   checkSession — longest-run jump > 25% vs trailing 4-wk longest
   ============================================================ */
// Trailing longest: 8 km; each trailing week padded to 10 km total so the
// weekly-volume rule (avg 10 km/wk) stays quiet and long-jump is isolated.
const trailRuns8 = [
  wk('2026-06-30', [run(8), run(2)]),
  wk('2026-07-07', [run(5), run(5)]),
  wk('2026-07-14', [run(6), run(4)]),
  wk('2026-07-21', [run(7), run(3)])
];
eq(G.checkSession(wk('2026-07-29', [run(10)]), trailRuns8, kgUser), [],
  'exactly +25% long run (8 -> 10) -> no warn (and week=avg, no volume warn)');
r = G.checkSession(wk('2026-07-29', [run(10.1)]), trailRuns8, kgUser);
eq(codes(r), ['run_long_jump'], '8 -> 10.1 km (+26.2%) warns');
ok(r[0].message.indexOf('10.1 km') >= 0 && r[0].message.indexOf('8 km') >= 0 &&
   r[0].message.indexOf('26.2%') >= 0, 'long-jump message has both distances and pct');
r = G.checkSession(wk('2026-07-29', [run(10.01)]), trailRuns8, kgUser);
eq(codes(r), ['run_long_jump'], '8 -> 10.01 km (+25.1% rounded) warns');
eq(G.checkSession(wk('2026-07-29', [run(9)]),
  [wk('2026-06-20', [run(7)])], kgUser), [],
  'prior long run outside 4-wk window -> no baseline, no warn');
// last week counts inside the trailing window; trailing padded with 2 km runs
// (total 10 km, avg 2.5) so the volume rule stays quiet (2.6 < 2.75)
r = G.checkSession(wk('2026-07-29', [run(2.6)]),
  [wk('2026-07-24', [run(2)]), wk('2026-07-14', [run(2), run(2), run(2), run(2)])], kgUser);
eq(codes(r), ['run_long_jump'], 'last-week run is part of trailing window (2 -> 2.6 km = +30%)');

/* ============================================================
   checkSession — weekly run mileage > 110% of trailing 4-wk avg
   ============================================================ */
// Trailing 4 weeks: 40 km total -> avg 10 km/wk.
const trail40 = [
  wk('2026-06-29', [run(4), run(6)]),   // wk1: 10
  wk('2026-07-08', [run(5)]), wk('2026-07-09', [run(5)]), // wk2: 10
  wk('2026-07-15', [run(4)]), wk('2026-07-17', [run(6)]), // wk3: 10
  wk('2026-07-21', [run(6)]), wk('2026-07-25', [run(4)])  // wk4: 10
];
// This week already 6 km; draft adds 5 -> 11 km = exactly 110% -> no warn.
const thisWeek6 = trail40.concat([wk('2026-07-27', [run(6)])]);
eq(G.checkSession(wk('2026-07-30', [run(5)]), thisWeek6, kgUser), [],
  'week at exactly 110% of avg -> no warn');
r = G.checkSession(wk('2026-07-30', [run(5.2)]), thisWeek6, kgUser);
eq(codes(r), ['run_weekly_volume'], 'week at 112% of avg warns');
ok(r[0].message.indexOf('11.2 km') >= 0 && r[0].message.indexOf('10 km') >= 0,
  'weekly-volume message shows week total and 4-wk avg');
r = G.checkSession(wk('2026-07-30', [run(5.2)]), thisWeek6, lbUser);
ok(r[0].message.indexOf('7 mi') >= 0 && r[0].message.indexOf('6.2 mi') >= 0,
  'weekly-volume message in miles for lb user'); // 11.2/1.609344=6.96->7; 10/1.609344=6.21->6.2
// max long run 6km prior; draft 5.2 < 6 so no long-jump interference confirmed
eq(codes(r), ['run_weekly_volume'], 'only weekly-volume fires in that fixture');

// draft with same id in priors is excluded (editing an existing workout)
const editDraft = wk('2026-07-30', [run(5)]);
const priorsWithSelf = thisWeek6.concat([{ id: editDraft.id, userId: 'u1', date: '2026-07-30', entries: [run(50)] }]);
eq(G.checkSession(editDraft, priorsWithSelf, kgUser), [],
  'prior copy of the draft (same id) is not double-counted');

// other users' workouts are ignored when tagged
eq(G.checkSession(wk('2026-07-30', [run(5.2)]),
  thisWeek6.map(w => Object.assign({}, w, { userId: 'u2' })), kgUser), [],
  'another user\'s history never triggers warnings');

/* ============================================================
   checkSession — stop sorts before warns; multiple rules stack
   ============================================================ */
r = G.checkSession(
  wk('2026-07-29', [Object.assign(ruck(25, 6), { loadKgDry: 24 })]),
  [wk('2026-07-22', [ruck(20, 4)]),
   wk('2026-07-27', [ruck(15, 3)]), wk('2026-07-28', [ruck(15, 3)])],
  kgUser);
eq(codes(r), ['ruck_double_increase', 'ruck_week_count', 'ruck_dry_load'],
  'stop first, then warns, all three ruck rules stack');
eq(r.map(x => x.level), ['stop', 'warn', 'warn'], 'levels of stacked findings');

/* ============================================================
   weeklyStatus — core numbers
   ============================================================ */
// Trailing avg 9 km (36 km over 4 wks); this week: run 5 easy, ruck 20kg/4km easy, run 5 hard.
const wsFixture = [
  wk('2026-06-30', [run(9)]), wk('2026-07-07', [run(9)]),
  wk('2026-07-14', [run(9)]), wk('2026-07-21', [run(9)]),
  wk('2026-07-27', [run(5, { effort: 'easy' })]),
  wk('2026-07-28', [ruck(20, 4, { effort: 'easy' })]),
  wk('2026-07-29', [run(5, { effort: 'hard' })])
];
let s = G.weeklyStatus(wsFixture, kgUser, WS);
eq(s.runMileageKm, 10, 'weekly run mileage = 10 km (ruck km excluded)');
eq(s.runRampPct, 11.1, 'ramp = (10/9-1)*100 -> 11.1%');
eq(s.easySharePct, 66.7, 'easy share 2/3 -> 66.7%');
eq(s.ruckCount, 1, 'ruck count 1');
eq(s.ruckLoadMiles, 49.7, 'ruckLoadMiles = 20kg * 2.485mi -> 49.7');
eq(s.restDayTaken, true, '3 session days -> rest day exists');
eq(codes(s.warnings), ['run_ramp', 'easy_share_low'], 'ramp + easy-share warnings fire');
ok(byCode(s.warnings, 'run_ramp').message.indexOf('11.1%') >= 0, 'ramp message carries pct');
ok(byCode(s.warnings, 'easy_share_low').message.indexOf('66.7%') >= 0, 'easy-share message carries pct');

// weekStartStr normalization: any day of the week maps to its Monday
eq(G.weeklyStatus(wsFixture, kgUser, '2026-07-30'), s, 'mid-week date normalizes to week start');

/* ---------- ramp boundary: exactly 10% no warn, 10.1% warns ---------- */
const trailBase = [
  wk('2026-06-30', [run(10)]), wk('2026-07-07', [run(10)]),
  wk('2026-07-14', [run(10)]), wk('2026-07-21', [run(10)])
]; // avg exactly 10
s = G.weeklyStatus(trailBase.concat([wk('2026-07-27', [run(11)])]), kgUser, WS);
eq(s.runRampPct, 10, 'exactly 10% ramp computed');
eq(codes(s.warnings), [], 'exactly 10% ramp -> no warning');
s = G.weeklyStatus(trailBase.concat([wk('2026-07-27', [run(11.01)])]), kgUser, WS);
eq(s.runRampPct, 10.1, '10.1% ramp computed (float noise killed)');
eq(codes(s.warnings), ['run_ramp'], '10.1% ramp -> warning');
// negative ramp
s = G.weeklyStatus(trailBase.concat([wk('2026-07-27', [run(5)])]), kgUser, WS);
eq(s.runRampPct, -50, 'down week reports negative ramp');
eq(codes(s.warnings), [], 'down week -> no ramp warning');

/* ---------- easy share via HR when birthYear known ---------- */
const hrUser = { id: 'u1', settings: { units: 'kg' }, profile: { birthYear: 1990 } };
// refYear 2026 -> age 36 -> maxHR 184 -> easy threshold 138.
s = G.weeklyStatus([
  wk('2026-07-27', [run(5, { avgHR: 137 })]),          // easy (below threshold)
  wk('2026-07-28', [run(5, { avgHR: 138 })]),          // hard (at threshold)
  wk('2026-07-29', [run(5, { avgHR: 170, effort: 'easy' })]) // HR overrides effort -> hard
], hrUser, WS);
eq(s.easySharePct, 33.3, 'HR classification: 1 easy of 3 (threshold + override cases)');
eq(codes(s.warnings), ['easy_share_low'], 'HR-based easy share below 75% warns');
// no birthYear -> effort field governs even when HR present
s = G.weeklyStatus([wk('2026-07-27', [run(5, { avgHR: 190, effort: 'easy' })])], kgUser, WS);
eq(s.easySharePct, 100, 'without birthYear the effort field governs');
// entry with neither HR-context nor effort is unclassifiable
s = G.weeklyStatus([wk('2026-07-27', [run(5)])], kgUser, WS);
eq(s.easySharePct, null, 'no classifiable cardio -> easySharePct null');
eq(codes(s.warnings), [], 'null easy share never warns');
// exactly 75% -> no warn (3 easy, 1 hard)
s = G.weeklyStatus([wk('2026-07-27', [
  run(2, { effort: 'easy' }), run(2, { effort: 'easy' }),
  run(2, { effort: 'easy' }), run(2, { effort: 'moderate' })
])], kgUser, WS);
eq(s.easySharePct, 75, 'exactly 75% easy share computed (moderate counts hard)');
eq(codes(s.warnings), [], 'exactly 75% easy share -> no warning');

/* ---------- rest day ---------- */
const sevenDays = [];
for (let i = 0; i < 7; i++) sevenDays.push(wk(U.addDays(WS, i), [lift()]));
s = G.weeklyStatus(sevenDays, kgUser, WS);
eq(s.restDayTaken, false, '7 straight session days -> no rest day');
eq(codes(s.warnings), ['no_rest_day'], 'no rest day warns');
ok(byCode(s.warnings, 'no_rest_day').message === G.MESSAGES.no_rest_day, 'rest message matches MESSAGES');
// two sessions same day still leaves rest days
s = G.weeklyStatus([wk(WS, [lift()]), wk(WS, [run(5, { effort: 'easy' })])], kgUser, WS);
eq(s.restDayTaken, true, 'double session day still leaves rest days');

/* ---------- weeklyStatus empty safety ---------- */
s = G.weeklyStatus([], kgUser, WS);
// P3: weeklyStatus gained the durability coverage block (contract-mandated
// shape change); with ExerciseDB absent in this suite the checklist is
// unknowable, so slot counts stay 0 and durability_gap never fires here.
eq(s, { runMileageKm: 0, runRampPct: 0, easySharePct: null, ruckCount: 0,
  ruckLoadMiles: 0, restDayTaken: true,
  durability: { slots: { unilateral: 0, calf_tib: 0, grip: 0, core: 0 }, covered: 0, total: 4 },
  warnings: [] },
  'empty history weeklyStatus: zeros/null, no warnings, no NaN');
s = G.weeklyStatus(null, null, WS);
eq(s.warnings, [], 'null inputs weeklyStatus safe');
// first active week with no trailing baseline: ramp stays 0, no warn
s = G.weeklyStatus([wk('2026-07-27', [run(20, { effort: 'easy' })])], kgUser, WS);
eq(s.runRampPct, 0, 'no trailing baseline -> ramp 0 (not Infinity/NaN)');
eq(codes(s.warnings), [], 'first running week -> no ramp warning');

/* ============================================================
   painFlags
   ============================================================ */
function pain(date, muscleId, severity, extra) {
  return Object.assign({ id: 'p' + (++n), userId: 'u1', date, muscleId, severity,
    worseDuring: false, boneLine: false, morning: false, createdAt: ++n }, extra || {});
}

eq(G.painFlags([]), [], 'empty pain log -> no flags');
eq(G.painFlags(null), [], 'null pain log -> no flags');
eq(G.painFlags([pain('2026-07-29', 'calves', 3)]), [], 'mild single entry -> no flags');

let f = G.painFlags([pain('2026-07-29', 'shin_l', 4, { boneLine: true })]);
eq(codes(f), ['pain_bone_line'], 'boneLine -> red');
eq(f[0].level, 'red', 'boneLine level red');
ok(f[0].message.indexOf('Left shin') === 0, 'boneLine message names region');
ok(f[0].message.indexOf('get it assessed') >= 0, 'boneLine message says get it assessed');
eq(f[0].entryIds.length, 1, 'boneLine entryIds has the entry');

f = G.painFlags([pain('2026-07-29', 'knee_r', 4, { morning: true })]);
eq(codes(f), ['pain_morning'], 'morning pain -> red');
ok(f[0].message.indexOf('Right knee') === 0 && f[0].message.indexOf('Get it assessed') >= 0,
  'morning message region + assessment');

f = G.painFlags([pain('2026-07-29', 'calves', 7)]);
eq(codes(f), ['pain_severe'], 'severity 7 -> red');
ok(f[0].message.indexOf('severity 7/10') >= 0, 'severe message carries 7/10');
eq(G.painFlags([pain('2026-07-29', 'calves', 6)]), [], 'severity 6 -> no flag');

/* rising: strictly increasing severity across the 3 most recent same-region entries */
const rising = [
  pain('2026-07-20', 'shin_l', 2), pain('2026-07-23', 'shin_l', 4), pain('2026-07-26', 'shin_l', 5)
];
f = G.painFlags(rising);
eq(codes(f), ['pain_rising'], 'strictly rising 3 entries -> red');
eq(f[0].entryIds, [rising[0].id, rising[1].id, rising[2].id], 'rising entryIds oldest->newest');
ok(f[0].message.indexOf('Left shin') === 0 && /get it assessed/i.test(f[0].message),
  'rising message region + assessment');
eq(G.painFlags([
  pain('2026-07-20', 'shin_l', 2), pain('2026-07-23', 'shin_l', 4), pain('2026-07-26', 'shin_l', 4)
]), [], 'plateau (2,4,4) -> not rising');
// only the 3 MOST RECENT count: 5,2,3,4 -> last three 2<3<4 rises
f = G.painFlags([
  pain('2026-07-18', 'shin_l', 5), pain('2026-07-21', 'shin_l', 2),
  pain('2026-07-24', 'shin_l', 3), pain('2026-07-27', 'shin_l', 4)
]);
eq(codes(f), ['pain_rising'], 'rising judged on the 3 most recent entries only');
// regions independent: rising must be same region
eq(G.painFlags([
  pain('2026-07-20', 'shin_l', 2), pain('2026-07-23', 'shin_r', 4), pain('2026-07-26', 'shin_l', 5)
]), [], 'severity climb across different regions -> no rising flag');

/* worseDuring */
f = G.painFlags([pain('2026-07-29', 'quads', 3, { worseDuring: true })]);
eq(codes(f), ['pain_worse_during'], 'single worseDuring -> warn');
eq(f[0].level, 'warn', 'single worseDuring level warn');
f = G.painFlags([
  pain('2026-07-27', 'quads', 3, { worseDuring: true }),
  pain('2026-07-29', 'quads', 3, { worseDuring: true })
]);
eq(codes(f), ['pain_worse_consecutive'], 'consecutive worseDuring -> red only (warn subsumed)');
eq(f[0].level, 'red', 'consecutive worseDuring level red');
ok(f[0].message.indexOf('get it assessed') >= 0, 'consecutive message includes get it assessed');
eq(f[0].entryIds.length, 2, 'consecutive entryIds has both entries');
f = G.painFlags([
  pain('2026-07-27', 'quads', 3, { worseDuring: true }),
  pain('2026-07-29', 'quads', 3, { worseDuring: false })
]);
eq(f, [], 'worseDuring resolved on latest entry -> no flag');

/* latest-entry semantics for point-in-time flags */
eq(G.painFlags([
  pain('2026-07-20', 'shin_l', 8, { boneLine: true, morning: true }),
  pain('2026-07-29', 'shin_l', 2)
]), [], 'old red-flag entry superseded by a clean latest entry -> no flags');

/* multiple conditions on one entry stack; red sorts before warn */
f = G.painFlags([
  pain('2026-07-28', 'quads', 2, { worseDuring: true }),
  pain('2026-07-29', 'shin_l', 8, { boneLine: true })
]);
eq(codes(f), ['pain_bone_line', 'pain_severe', 'pain_worse_during'],
  'reds (bone line + severe) sort before the warn');
eq(f.map(x => x.level), ['red', 'red', 'warn'], 'levels ordered red, red, warn');

/* tie-break by createdAt on same date */
f = G.painFlags([
  Object.assign(pain('2026-07-29', 'quads', 3, { worseDuring: true }), { createdAt: 100 }),
  Object.assign(pain('2026-07-29', 'quads', 3, { worseDuring: false }), { createdAt: 200 })
]);
eq(f, [], 'same-date entries ordered by createdAt; later clean entry wins');

/* ============================================================
   P3 setwork rules — DB-free cases only (this suite deliberately runs
   without ExerciseDB; checklist/muscle-overlap cases live in
   test-setwork-rules.js). Appended by P3.
   ============================================================ */
for (const c of ['durability_gap', 'stretch_limit', 'stretch_pain_link']) {
  ok(typeof G.MESSAGES[c] === 'string' && G.MESSAGES[c].length > 10, 'MESSAGES has ' + c);
}
ok(G.MESSAGES.stretch_limit ===
  'A stretch hit depth 4 — that\'s guarding, not stretching. Back off and log a niggle if it\'s sharp.',
  'stretch_limit base copy verbatim');
ok(typeof G.DURABILITY_TARGETS === 'object' &&
  G.DURABILITY_TARGETS.unilateral === 6 && G.DURABILITY_TARGETS.calf_tib === 4 &&
  G.DURABILITY_TARGETS.grip === 3 && G.DURABILITY_TARGETS.core === 4,
  'DURABILITY_TARGETS exported as 6/4/3/4');

// depth-4 stretch warns even without ExerciseDB (name falls back to the ref)
r = G.checkSession(wk(WS, [{ id: 'sx1', type: 'setwork', exerciseRef: 'couch_stretch',
  method: 'static', sets: [{ holdSec: 40, intensity: 4 }] }]), [], kgUser);
eq(codes(r), ['stretch_limit'], 'intensity-4 setwork set -> stretch_limit warn (no DB)');
eq(r[0].level, 'warn', 'stretch_limit level warn');
ok(r[0].message.indexOf('Couch stretch') === 0, 'stretch_limit names the drill from the ref');
ok(r[0].message.indexOf('guarding, not stretching') >= 0, 'stretch_limit carries contract copy');

// depth 3 is a training dose, not a flag
eq(G.checkSession(wk(WS, [{ id: 'sx2', type: 'setwork', exerciseRef: 'couch_stretch',
  method: 'pnf', sets: [{ holdSec: 40, intensity: 3 }] }]), [], kgUser), [],
  'intensity 3 alone -> no warning');

// without ExerciseDB the pain-link rule stays silent (overlap unknowable)
eq(G.checkSession(
  wk(WS, [{ id: 'sx3', type: 'setwork', exerciseRef: 'couch_stretch', method: 'pnf',
    sets: [{ holdSec: 40, intensity: 3 }, { holdSec: 40, intensity: 3 }, { holdSec: 40, intensity: 3 }] }]),
  [], kgUser,
  [{ id: 'pl1', userId: 'u1', date: WS, muscleId: 'quads', severity: 4 }]), [],
  'pain-link rule silent without ExerciseDB');

// weeklyStatus durability block: present, zeroed, gap never fires without DB
s = G.weeklyStatus([wk(WS, [{ id: 'sx4', type: 'setwork', exerciseRef: 'dead_hang',
  sets: [{ holdSec: 40 }] }])], kgUser, WS);
eq(s.durability, { slots: { unilateral: 0, calf_tib: 0, grip: 0, core: 0 }, covered: 0, total: 4 },
  'durability block zeroed when checklist unavailable');
ok(!byCode(s.warnings, 'durability_gap'), 'durability_gap never fires without the checklist');

/* ============================================================
   P4 — weekly deload advisories
   (easy-split collapse + resting-HR spike)
   ============================================================ */

for (const c of ['easy_split_collapse', 'resting_hr_spike']) {
  ok(typeof G.MESSAGES[c] === 'string' && G.MESSAGES[c].length > 10, 'MESSAGES has ' + c);
}
ok(G.MESSAGES.easy_split_collapse.indexOf('easy/hard split has collapsed') >= 0,
  'easy_split_collapse base copy names the failure');
ok(G.MESSAGES.resting_hr_spike.indexOf('28-day baseline') >= 0,
  'resting_hr_spike base copy names the baseline');
ok(G.LIMITS.EASY_SPLIT_COLLAPSE_PCT === 50 && G.LIMITS.EASY_SPLIT_MIN_SESSIONS === 4 &&
  G.LIMITS.RESTING_HR_FRESH_DAYS === 3, 'P4 thresholds exported (50% / 4 sessions / 3 days)');

/* ---------- easy-split collapse ---------- */
function easyRun() { return run(3, { effort: 'easy' }); }
function hardRun() { return run(3, { effort: 'hard' }); }

// 4 classified sessions, 1 easy -> 25% -> collapse, and it SUBSUMES easy_share_low
s = G.weeklyStatus([wk(WS, [easyRun(), hardRun(), hardRun(), hardRun()])], kgUser, WS);
eq(s.easySharePct, 25, '1 of 4 easy -> 25%');
eq(codes(s.warnings), ['easy_split_collapse'], 'collapse fires and replaces easy_share_low');
ok(byCode(s.warnings, 'easy_split_collapse').message.indexOf('25%') >= 0,
  'collapse message carries the share');
ok(byCode(s.warnings, 'easy_split_collapse').message.indexOf('4 sessions') >= 0,
  'collapse message carries the session count');

// exactly 50% is not a collapse (strict <) -> the softer warning stands
s = G.weeklyStatus([wk(WS, [easyRun(), easyRun(), hardRun(), hardRun()])], kgUser, WS);
eq(s.easySharePct, 50, '2 of 4 easy -> 50%');
eq(codes(s.warnings), ['easy_share_low'], 'exactly 50% -> easy_share_low, no collapse');

// under the session floor the collapse rule stays quiet (3 classified, 33.3%)
s = G.weeklyStatus([wk(WS, [easyRun(), hardRun(), hardRun()])], kgUser, WS);
eq(codes(s.warnings), ['easy_share_low'], '3 sessions never collapse (floor is 4)');

// 5 sessions at 40% collapse
s = G.weeklyStatus([wk(WS, [easyRun(), easyRun(), hardRun(), hardRun(), hardRun()])], kgUser, WS);
eq(s.easySharePct, 40, '2 of 5 easy -> 40%');
eq(codes(s.warnings), ['easy_split_collapse'], '40% over 5 sessions collapses');

// unclassifiable sessions never count toward the floor
s = G.weeklyStatus([wk(WS, [easyRun(), hardRun(), hardRun(), run(3), run(3)])], kgUser, WS);
eq(s.easySharePct, 33.3, 'unclassified runs excluded from the share');
eq(codes(s.warnings), ['easy_share_low'], 'unclassified runs do not reach the collapse floor');

// a good week says nothing
s = G.weeklyStatus([wk(WS, [easyRun(), easyRun(), easyRun(), hardRun()])], kgUser, WS);
eq(codes(s.warnings), [], '75% easy across 4 sessions -> silence');

/* ---------- resting-HR spike: silent without LoadModel ---------- */
// Dates are relative to the real today so the freshness rule is exercised
// honestly; the reported week is the current one.
const TODAY = U.todayStr();
const CWS = U.weekStart(TODAY);
function hrRow(dayOffset, value, extra) {
  return Object.assign({ id: 'h' + (++n), userId: 'u1', date: U.addDays(TODAY, dayOffset),
    kind: 'restingHR', value: value, source: 'apple' }, extra || {});
}
// 26 baseline days at 55 bpm, then two consecutive days at 61 (>= 55 * 1.07).
const spikeSamples = [];
for (let i = 27; i >= 2; i--) spikeSamples.push(hrRow(-i, 55));
spikeSamples.push(hrRow(-1, 61));
spikeSamples.push(hrRow(0, 61));

ok(typeof global.LoadModel === 'undefined', 'LoadModel not loaded yet');
s = G.weeklyStatus([], kgUser, CWS, { healthSamples: spikeSamples });
ok(!byCode(s.warnings, 'resting_hr_spike'), 'no advisory without LoadModel (typeof guard)');

/* ---------- resting-HR spike: with LoadModel ---------- */
require(require('path').join(P.JS, 'loadmodel.js'));
ok(typeof global.LoadModel === 'object', 'LoadModel loaded');

s = G.weeklyStatus([], kgUser, CWS, { healthSamples: spikeSamples });
ok(!!byCode(s.warnings, 'resting_hr_spike'), 'spike advisory fires');
const hrMsg = byCode(s.warnings, 'resting_hr_spike').message;
ok(hrMsg.indexOf('61') >= 0 && hrMsg.indexOf('bpm') >= 0, 'advisory carries value and unit');
// baseline28 is the mean of the whole window (26 days at 55 + 2 at 61 = 55.4)
ok(hrMsg.indexOf('10%') >= 0 && hrMsg.indexOf('55.4') >= 0,
  'advisory carries percent over baseline and the baseline itself (61 vs 55.4 -> 10%)');

// a bare array is accepted as the 4th argument too
eq(codes(G.weeklyStatus([], kgUser, CWS, spikeSamples).warnings), codes(s.warnings),
  'bare healthSamples array accepted');

// flat data never advises
const flatSamples = [];
for (let i = 27; i >= 0; i--) flatSamples.push(hrRow(-i, 55));
s = G.weeklyStatus([], kgUser, CWS, { healthSamples: flatSamples });
ok(!byCode(s.warnings, 'resting_hr_spike'), 'flat resting HR -> no advisory');

// one high day is not a spike (the rule needs two consecutive sampled days)
const oneDay = flatSamples.slice(0, flatSamples.length - 1).concat([hrRow(0, 61)]);
s = G.weeklyStatus([], kgUser, CWS, { healthSamples: oneDay });
ok(!byCode(s.warnings, 'resting_hr_spike'), 'single high reading -> no advisory');

// stale spike (last reading 5 days old) is history, not advice
const stale = [];
for (let i = 30; i >= 7; i--) stale.push(hrRow(-i, 55));
stale.push(hrRow(-6, 61));
stale.push(hrRow(-5, 61));
s = G.weeklyStatus([], kgUser, CWS, { healthSamples: stale });
ok(!byCode(s.warnings, 'resting_hr_spike'), 'stale spike (5 days old) stays silent');

// another user's samples are ignored
s = G.weeklyStatus([], kgUser, CWS, {
  healthSamples: spikeSamples.map(function (r) { return Object.assign({}, r, { userId: 'u2' }); })
});
ok(!byCode(s.warnings, 'resting_hr_spike'), 'foreign-user samples ignored');

// non-restingHR kinds are ignored
s = G.weeklyStatus([], kgUser, CWS, {
  healthSamples: spikeSamples.map(function (r) { return Object.assign({}, r, { kind: 'steps' }); })
});
ok(!byCode(s.warnings, 'resting_hr_spike'), 'non-restingHR kinds ignored');

// empty / malformed inputs stay safe
ok(!byCode(G.weeklyStatus([], kgUser, CWS, {}).warnings, 'resting_hr_spike'), 'empty opts safe');
ok(!byCode(G.weeklyStatus([], kgUser, CWS, { healthSamples: [] }).warnings, 'resting_hr_spike'),
  'empty samples safe');
ok(!byCode(G.weeklyStatus([], kgUser, CWS, { healthSamples: [null, {}] }).warnings, 'resting_hr_spike'),
  'garbage samples safe');

// the P1/P3 return shape is unchanged by the P4 inputs
eq(Object.keys(G.weeklyStatus([], kgUser, CWS, { healthSamples: spikeSamples })).sort(),
  ['durability', 'easySharePct', 'restDayTaken', 'ruckCount', 'ruckLoadMiles',
    'runMileageKm', 'runRampPct', 'warnings'],
  'weeklyStatus keys unchanged by P4 advisories');

// a past week never reads today's samples (reference date clamps to week end)
s = G.weeklyStatus([], kgUser, U.addDays(CWS, -70), { healthSamples: spikeSamples });
ok(!byCode(s.warnings, 'resting_hr_spike'), 'reporting an old week ignores current HR data');

/* ============================================================
   done
   ============================================================ */
console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.error('Failed: ' + failures.join(' | ')); process.exit(1); }
