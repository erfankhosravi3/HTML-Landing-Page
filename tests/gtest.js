'use strict';
// Node harness: window stub + real util.js + real guardrails.js
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

const userKg = { id: 'u1', settings: { units: 'kg' } };
const userLb = { id: 'u1', settings: { units: 'lb' } };

function w(date, entries, id) { return { id: id, userId: 'u1', date: date, entries: entries }; }
function run(km, min, extra) { return Object.assign({ type: 'cardio', mode: 'run', distanceKm: km, durationMin: min }, extra || {}); }
function ruck(km, min, dry, total, extra) {
  const e = { type: 'cardio', mode: 'ruck', distanceKm: km, durationMin: min };
  if (dry != null) e.loadKgDry = dry;
  if (total != null) e.loadKgTotal = total;
  return Object.assign(e, extra || {});
}

// Draft week: 2026-07-27 (Mon) .. 2026-08-02 (Sun). Draft date Sat 2026-08-01.
// Last week: 2026-07-20 .. 2026-07-26. Trailing 4 weeks: 2026-06-29 .. 2026-07-26.

// ---- 1. ruck double increase ----
{
  const prior = [w('2026-07-22', [ruck(5, 55, 18, 20)])]; // last week: 20kg total over 5km
  const draft = w('2026-08-01', [ruck(6, 65, 20, 22)]);   // 22kg over 6km -> both increase
  const out = G.checkSession(draft, prior, userKg);
  eq('double-increase stop fires', codes(out).includes('ruck_double_increase:stop'), true);

  const draftSame = w('2026-08-01', [ruck(6, 65, 18, 20)]); // same load, more dist -> no stop
  eq('single increase no stop', codes(G.checkSession(draftSame, prior, userKg)).includes('ruck_double_increase:stop'), false);

  // last ruck 2 weeks ago -> not "last week", no baseline, no stop
  const prior2 = [w('2026-07-19', [ruck(5, 55, 18, 20)])]; // Sunday of week 7-13..7-19
  eq('2wk-old ruck not last week', codes(G.checkSession(draft, prior2, userKg)).includes('ruck_double_increase:stop'), false);

  // Sunday boundary: 2026-07-26 IS last week
  const prior3 = [w('2026-07-26', [ruck(5, 55, 18, 20)])];
  eq('sunday of last week counts', codes(G.checkSession(draft, prior3, userKg)).includes('ruck_double_increase:stop'), true);
  // Monday 2026-07-27 is THIS week, not last week
  const prior4 = [w('2026-07-27', [ruck(5, 55, 18, 20)])];
  eq('monday this week not last week baseline', codes(G.checkSession(draft, prior4, userKg)).includes('ruck_double_increase:stop'), false);
}

// ---- 2. rucks per week ----
{
  const prior = [w('2026-07-27', [ruck(5, 55, 15, null)]), w('2026-07-29', [ruck(5, 55, 15, null)])];
  const draft = w('2026-08-01', [ruck(5, 55, 15, null)]);
  const out = G.checkSession(draft, prior, userKg);
  eq('3rd ruck in week warns', codes(out).includes('ruck_week_count:warn'), true);
  const msg = out.find(x => x.code === 'ruck_week_count').message;
  eq('ruck count msg says #3', msg.indexOf('Ruck #3') === 0, true);
  // only 2 rucks -> no warn
  const out2 = G.checkSession(draft, prior.slice(0, 1), userKg);
  eq('2nd ruck no warn', codes(out2).includes('ruck_week_count:warn'), false);
  // prior ruck in ANOTHER week does not count
  const out3 = G.checkSession(draft, [w('2026-07-26', [ruck(5, 55, 15, null)]), w('2026-07-25', [ruck(5, 55, 15, null)])], userKg);
  eq('last-week rucks not counted in this week', codes(out3).includes('ruck_week_count:warn'), false);
}

// ---- 3. dry load ----
{
  const d1 = w('2026-08-01', [ruck(5, 55, 23, null)]);
  eq('23kg dry warns', codes(G.checkSession(d1, [], userKg)).includes('ruck_dry_load:warn'), true);
  const d2 = w('2026-08-01', [ruck(5, 55, 22.7, null)]);
  eq('exactly 22.7 no warn', codes(G.checkSession(d2, [], userKg)).includes('ruck_dry_load:warn'), false);
  // lb user: 50 lb = 22.6796 kg -> should NOT warn
  const d3 = w('2026-08-01', [ruck(5, 55, U.displayToKg(50, 'lb'), null)]);
  eq('50lb exact no warn', codes(G.checkSession(d3, [], userLb)).includes('ruck_dry_load:warn'), false);
  const d4 = w('2026-08-01', [ruck(5, 55, U.displayToKg(51, 'lb'), null)]);
  const o4 = G.checkSession(d4, [], userLb);
  eq('51lb warns', codes(o4).includes('ruck_dry_load:warn'), true);
  console.log('   msg:', o4.find(x => x.code === 'ruck_dry_load').message);
  // total-only load (no dry): rule keys off dry only
  const d5 = w('2026-08-01', [ruck(5, 55, null, 30)]);
  eq('total-only load no dry warn', codes(G.checkSession(d5, [], userKg)).includes('ruck_dry_load:warn'), false);
}

// ---- 4. longest run jump ----
{
  const prior = [w('2026-07-20', [run(8, 48)])];
  const d1 = w('2026-08-01', [run(10, 60)]);   // 25.0% -> no warn
  eq('exactly 25% no warn', codes(G.checkSession(d1, prior, userKg)).includes('run_long_jump:warn'), false);
  const d2 = w('2026-08-01', [run(10.1, 61)]); // 26.3% -> warn
  const o2 = G.checkSession(d2, prior, userKg);
  eq('26% warns', codes(o2).includes('run_long_jump:warn'), true);
  console.log('   msg:', o2.find(x => x.code === 'run_long_jump').message);
  // baseline exactly 4 weeks + 1 day ago (outside window) -> no warn
  const priorOld = [w('2026-06-28', [run(8, 48)])];
  eq('baseline older than 4wk ignored', codes(G.checkSession(d2, priorOld, userKg)).includes('run_long_jump:warn'), false);
  // baseline at window start 2026-06-29 counts
  const priorEdge = [w('2026-06-29', [run(8, 48)])];
  eq('baseline at 4wk window start counts', codes(G.checkSession(d2, priorEdge, userKg)).includes('run_long_jump:warn'), true);
  // no prior runs -> no warn
  eq('first run ever no warn', codes(G.checkSession(d2, [], userKg)).includes('run_long_jump:warn'), false);
}

// ---- 5. weekly run volume ----
{
  // trailing 4 weeks: 10km each -> avg 10. This week prior 5 + draft 6.1 = 11.1 -> +11% warn
  const prior = [
    w('2026-07-01', [run(10, 60)]), w('2026-07-08', [run(10, 60)]),
    w('2026-07-15', [run(10, 60)]), w('2026-07-22', [run(10, 60)]),
    w('2026-07-28', [run(5, 30)])
  ];
  const d1 = w('2026-08-01', [run(6.1, 37)]);
  const o1 = G.checkSession(d1, prior, userKg);
  eq('11.1km vs avg10 warns', codes(o1).includes('run_weekly_volume:warn'), true);
  console.log('   msg:', o1.find(x => x.code === 'run_weekly_volume').message);
  const d2 = w('2026-08-01', [run(6, 36)]); // 11.0 -> exactly +10% -> no warn
  eq('exactly 110% no warn', codes(G.checkSession(d2, prior, userKg)).includes('run_weekly_volume:warn'), false);
  // no trailing runs -> no warn (avg 0)
  const d3 = w('2026-08-01', [run(20, 120)]);
  eq('no trailing baseline no warn', codes(G.checkSession(d3, [w('2026-07-28', [run(5, 30)])], userKg)).includes('run_weekly_volume:warn'), false);
  // draft excluded by id from priors
  const dupe = w('2026-08-01', [run(6.1, 37)], 'wX');
  const o4 = G.checkSession(dupe, prior.concat([dupe]), userKg);
  eq('draft excluded by id', codes(o4).includes('run_weekly_volume:warn'), true);
  // and week total not double counted: message should say 11.1 km
  eq('week total not doubled', o4.find(x => x.code === 'run_weekly_volume').message.indexOf('11.1 km') >= 0, true);
}

// ---- weeklyStatus ----
{
  // week of 2026-07-27..08-02; trailing 06-29..07-26
  const ws = [
    w('2026-07-01', [run(10, 60)]), w('2026-07-08', [run(10, 60)]),
    w('2026-07-15', [run(10, 60)]), w('2026-07-22', [run(10, 60)]),
    w('2026-07-27', [run(6, 36, { effort: 'easy' })]),
    w('2026-07-28', [run(5.5, 33, { effort: 'hard' })])
  ];
  const s = G.weeklyStatus(ws, userKg, '2026-08-01');
  eq('runMileageKm', s.runMileageKm, 11.5);
  eq('rampPct 15', s.runRampPct, 15);
  eq('easyShare 50', s.easySharePct, 50);
  eq('ruckCount 0', s.ruckCount, 0);
  eq('restDay true (only 2 days used)', s.restDayTaken, true);
  eq('warn codes', s.warnings.map(x => x.code).sort(), ['easy_share_low', 'run_ramp']);

  // no cardio at all -> easyShare null, ramp 0, no crash
  const s2 = G.weeklyStatus([], userKg, '2026-08-01');
  eq('empty status', [s2.runMileageKm, s2.runRampPct, s2.easySharePct, s2.ruckCount, s2.ruckLoadMiles, s2.restDayTaken], [0, 0, null, 0, 0, true]);
  eq('empty warnings', s2.warnings.map(x => x.code), []);

  // all 7 days occupied -> no_rest_day
  const days = [];
  for (let i = 0; i < 7; i++) days.push(w(U.addDays('2026-07-27', i), [run(2, 12, { effort: 'easy' })]));
  const s3 = G.weeklyStatus(days, userKg, '2026-08-01');
  eq('no rest day warns', s3.warnings.map(x => x.code).includes('no_rest_day'), true);
  eq('easyShare 100 no warn', s3.warnings.map(x => x.code).includes('easy_share_low'), false);

  // HR beats effort when birthYear present: age 25 in 2026 -> maxHR 195, easy < 146.25
  const uHR = { id: 'u1', settings: { units: 'kg' }, profile: { birthYear: 2001 } };
  const s4 = G.weeklyStatus([w('2026-07-28', [run(5, 30, { effort: 'easy', avgHR: 150 })])], uHR, '2026-08-01');
  eq('HR 150 overrides easy label -> hard', s4.easySharePct, 0);
  const s5 = G.weeklyStatus([w('2026-07-28', [run(5, 30, { effort: 'hard', avgHR: 140 })])], uHR, '2026-08-01');
  eq('HR 140 overrides hard label -> easy', s5.easySharePct, 100);
  // no birthYear -> falls back to effort; moderate counts as hard
  const s6 = G.weeklyStatus([w('2026-07-28', [run(5, 30, { effort: 'moderate' })])], userKg, '2026-08-01');
  eq('moderate counts not-easy', s6.easySharePct, 0);
  // unclassifiable (no HR no effort) excluded
  const s7 = G.weeklyStatus([w('2026-07-28', [run(5, 30)])], userKg, '2026-08-01');
  eq('unclassifiable -> null share', s7.easySharePct, null);

  // ruckLoadMiles: 20kg over 1.609344 km = 1 mi -> 20 kg·mi
  const s8 = G.weeklyStatus([w('2026-07-28', [ruck(1.609344, 20, null, 20)])], userKg, '2026-08-01');
  eq('ruckLoadMiles 20', s8.ruckLoadMiles, 20);
}

// ---- painFlags ----
{
  function p(id, date, muscleId, sev, extra, createdAt) {
    return Object.assign({ id: id, userId: 'u1', date: date, muscleId: muscleId, severity: sev,
      worseDuring: false, boneLine: false, morning: false, createdAt: createdAt || 0 }, extra || {});
  }
  const f1 = G.painFlags([p('a', '2026-08-01', 'shin_l', 3, { boneLine: true })]);
  eq('boneLine red', codes(f1), ['pain_bone_line:red']);
  console.log('   msg:', f1[0].message);

  const f2 = G.painFlags([p('a', '2026-08-01', 'shin_l', 7)]);
  eq('sev7 red', codes(f2), ['pain_severe:red']);

  const f3 = G.painFlags([
    p('a', '2026-07-29', 'quads', 2, null, 1),
    p('b', '2026-07-30', 'quads', 3, null, 2),
    p('c', '2026-07-31', 'quads', 4, null, 3)
  ]);
  eq('rising 3 red', codes(f3), ['pain_rising:red']);
  eq('rising entryIds oldest->newest', f3[0].entryIds, ['a', 'b', 'c']);

  const f4 = G.painFlags([
    p('a', '2026-07-30', 'calves', 3, { worseDuring: true }, 1),
    p('b', '2026-07-31', 'calves', 3, { worseDuring: true }, 2)
  ]);
  eq('worse consecutive red', codes(f4), ['pain_worse_consecutive:red']);

  const f5 = G.painFlags([p('a', '2026-07-31', 'calves', 3, { worseDuring: true })]);
  eq('single worseDuring warn', codes(f5), ['pain_worse_during:warn']);

  // rising must be same region; mixed regions no red
  const f6 = G.painFlags([
    p('a', '2026-07-29', 'quads', 2, null, 1),
    p('b', '2026-07-30', 'calves', 3, null, 2),
    p('c', '2026-07-31', 'quads', 4, null, 3)
  ]);
  eq('mixed regions no rising', codes(f6).includes('pain_rising:red'), false);

  // morning red
  const f7 = G.painFlags([p('a', '2026-08-01', 'foot_r', 2, { morning: true })]);
  eq('morning red', codes(f7), ['pain_morning:red']);
  eq('morning msg has assess', f7[0].message.indexOf('assessed') >= 0, true);

  // old boneLine entry, newer entry same region without boneLine -> latest wins, no red
  const f8 = G.painFlags([
    p('a', '2026-07-20', 'shin_l', 5, { boneLine: true }, 1),
    p('b', '2026-08-01', 'shin_l', 2, null, 2)
  ]);
  eq('boneLine keyed to latest only', codes(f8), []);

  eq('empty painlog', G.painFlags([]), []);
  eq('null painlog', G.painFlags(null), []);
}

// ---- unit formatting ----
{
  eq('fmtDistanceKm kg', G.fmtDistanceKm(6.8, 'kg'), '6.8 km');
  eq('fmtDistanceKm lb', G.fmtDistanceKm(8.04672, 'lb'), '5 mi');
  // sort: stop first
  const prior = [w('2026-07-22', [ruck(5, 55, 18, 20)]), w('2026-07-28', [ruck(5, 55, 23, null)]), w('2026-07-29', [ruck(5, 55, 15, null)])];
  const draft = w('2026-08-01', [ruck(6, 65, 23, 25)]);
  const out = G.checkSession(draft, prior, userKg);
  eq('stop sorted first', out[0].level, 'stop');
  console.log('   all:', codes(out));
}

console.log(fails ? '\n' + fails + ' FAILURES' : '\nALL PASS');
