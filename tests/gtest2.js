'use strict';
const P = require('./lib/paths');
global.window = global;
const fs = require('fs');
const path = '' + P.JS + '/';
eval(fs.readFileSync(path + 'util.js', 'utf8'));
eval(fs.readFileSync(path + 'guardrails.js', 'utf8'));
const G = window.Guardrails;
let fails = 0;
function eq(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { fails++; console.log('FAIL', name, '\n  got ', g, '\n  want', w); }
  else console.log('ok  ', name);
}
function codes(arr) { return arr.map(x => x.code + ':' + x.level); }
const userLb = { id: 'u1', settings: { units: 'lb' } };
const userKg = { id: 'u1', settings: { units: 'kg' } };
function w(date, entries, id) { return { id: id, userId: 'u1', date: date, entries: entries }; }
function run(km, min, extra) { return Object.assign({ type: 'cardio', mode: 'run', distanceKm: km, durationMin: min }, extra || {}); }
function ruck(km, min, dry, total, extra) {
  const e = { type: 'cardio', mode: 'ruck', distanceKm: km, durationMin: min };
  if (dry != null) e.loadKgDry = dry;
  if (total != null) e.loadKgTotal = total;
  return Object.assign(e, extra || {});
}

// (a) draft dated Sunday 2026-08-02; a workout Monday 2026-08-03 must NOT count in the draft's week
{
  const prior = [w('2026-08-03', [ruck(5, 55, 15, null)]), w('2026-07-30', [ruck(5, 55, 15, null)])];
  const draft = w('2026-08-02', [ruck(5, 55, 15, null)]);
  const out = G.checkSession(draft, prior, userKg);
  eq('(a) next-monday ruck excluded (2 in week, no warn)', codes(out).includes('ruck_week_count:warn'), false);
  const prior2 = [w('2026-08-02', [ruck(5, 55, 15, null)]), w('2026-07-27', [ruck(5, 55, 15, null)])];
  eq('(a2) sunday+monday same week -> 3rd warns', codes(G.checkSession(draft, prior2, userKg)).includes('ruck_week_count:warn'), true);
}

// (b) weeklyStatus with mid-week date vs exact Monday identical
{
  const ws = [
    w('2026-07-22', [run(10, 60, { effort: 'easy' })]),
    w('2026-07-28', [run(6, 36, { effort: 'easy' })]),
    w('2026-08-02', [run(4, 24, { effort: 'hard' })]) // Sunday of same week
  ];
  const a = G.weeklyStatus(ws, userKg, '2026-07-27');
  const b = G.weeklyStatus(ws, userKg, '2026-07-30');
  const c = G.weeklyStatus(ws, userKg, '2026-08-02');
  eq('(b) same rollup any day of week', [a.runMileageKm, a.easySharePct], [b.runMileageKm, b.easySharePct]);
  eq('(b2) sunday same rollup', [a.runMileageKm, a.easySharePct], [c.runMileageKm, c.easySharePct]);
  eq('(b3) sunday run inside week', a.runMileageKm, 10);
}

// (c) lb-user double-increase message units
{
  const prior = [w('2026-07-22', [ruck(8.04672, 90, null, 18.14)])]; // 5 mi, ~40 lb
  const draft = w('2026-08-01', [ruck(9.65606, 108, null, 20.41)]);  // 6 mi, ~45 lb
  const out = G.checkSession(draft, prior, userLb);
  const stop = out.find(x => x.code === 'ruck_double_increase');
  console.log('   (c) msg:', stop && stop.message);
  eq('(c) mentions mi and lb', !!stop && /mi/.test(stop.message) && /lb/.test(stop.message), true);
}

// (d) painFlags same-day ordering by createdAt (advisory depends on newest-first)
{
  function p(id, date, sev, extra, createdAt) {
    return Object.assign({ id: id, userId: 'u1', date: date, muscleId: 'shin_l', severity: sev,
      worseDuring: false, boneLine: false, morning: false, createdAt: createdAt }, extra || {});
  }
  // older same-day entry has boneLine, newer does not -> latest (by createdAt) wins -> no red
  const f = G.painFlags([p('old', '2026-08-01', 5, { boneLine: true }, 100), p('new', '2026-08-01', 2, null, 200)]);
  eq('(d) same-day createdAt ordering', codes(f), []);
  // newer has boneLine -> red tied to 'new'
  const f2 = G.painFlags([p('old', '2026-08-01', 2, null, 100), p('new', '2026-08-01', 3, { boneLine: true }, 200)]);
  eq('(d2) red on newest', f2.length === 1 && f2[0].entryIds[0] === 'new', true);
}

// (e) draft containing both run and ruck evaluates both rule families
{
  const prior = [
    w('2026-07-22', [ruck(5, 55, 18, 20)]),
    w('2026-07-20', [run(8, 48)])
  ];
  const draft = w('2026-08-01', [ruck(6, 65, 21, 23), run(10.5, 63)]);
  const out = G.checkSession(draft, prior, userKg);
  eq('(e) both families', codes(out).sort(),
    ['ruck_double_increase:stop', 'run_long_jump:warn', 'run_weekly_volume:warn'].sort());
}

// (f) float-noise boundary: 6.6 vs avg 6.0 -> exactly +10.0% -> no warn
{
  const prior = [
    w('2026-07-01', [run(6, 36)]), w('2026-07-08', [run(6, 36)]),
    w('2026-07-15', [run(6, 36)]), w('2026-07-22', [run(6, 36)])
  ];
  const draft = w('2026-08-01', [run(6.6, 40)]);
  eq('(f) 6.6 vs 6.0 avg exactly 10% no warn', codes(G.checkSession(draft, prior, userKg)).includes('run_weekly_volume:warn'), false);
  const draft2 = w('2026-08-01', [run(6.7, 40)]);
  eq('(f2) 6.7 warns (+11.7%)', codes(G.checkSession(draft2, prior, userKg)).includes('run_weekly_volume:warn'), true);
}

// (g) restDayTaken semantics: user trained every elapsed day (Mon-Wed), status queried Wed
{
  const ws = [
    w('2026-07-27', [run(5, 30, { effort: 'easy' })]),
    w('2026-07-28', [run(5, 30, { effort: 'easy' })]),
    w('2026-07-29', [run(5, 30, { effort: 'easy' })])
  ];
  const s = G.weeklyStatus(ws, userKg, '2026-07-29');
  console.log('   (g) restDayTaken mid-week after training every day so far =', s.restDayTaken);
}

// (h) weeklyStatus when workouts arg contains malformed workout (no date/entries)
{
  const s = G.weeklyStatus([{ id: 'x' }, null, w('2026-07-28', [run(5, 30)])], userKg, '2026-08-01');
  eq('(h) tolerates malformed rows', s.runMileageKm, 5);
}

console.log(fails ? '\n' + fails + ' FAILURES' : '\nALL PASS');
