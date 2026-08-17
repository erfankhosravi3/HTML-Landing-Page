'use strict';
/* The nutrition engine: the wire, the arithmetic, the refusals.

   The wire gets the P6 treatment — every object in the schema must carry
   additionalProperties:false, because the API rejects the whole request
   without it, auth precedes validation, and no stub can catch it. That bug
   shipped once in this app; it does not ship twice.

   The arithmetic gets the Goals treatment — thresholds pinned, refusals
   tested hardest, because a balance computed from half a burn is worse than
   no balance at all. */
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
['util.js', 'exercises.js', 'store.js', 'nutrition.js'].forEach(function (f) {
  vm.runInThisContext(fs.readFileSync(path.join(P.JS, f), 'utf8'), { filename: f });
});

let pass = 0; const fails = [];
function ok(c, m) { if (c) pass++; else fails.push(m); }
function eq(a, b, m) { ok(a === b, m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }

const TODAY = '2026-09-06';
const UID = 'u1';

/* ==================================================================
   1. THE WIRE — schema strictness and request shape
   ================================================================== */
const UNSUPPORTED = ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum',
  'multipleOf', 'minLength', 'maxLength', 'pattern', 'minItems', 'maxItems',
  'uniqueItems', 'minProperties', 'maxProperties', 'patternProperties',
  'dependentSchemas', 'if', 'then', 'else', 'not'];

function walk(node, where, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node, where);
  if (node.properties) for (const k in node.properties) walk(node.properties[k], where + '.' + k, visit);
  if (node.items) walk(node.items, where + '[]', visit);
}
const bad = [], unsup = [];
let objects = 0;
walk(Nutrition.MEAL_SCHEMA, 'MEAL_SCHEMA', function (n, where) {
  if (n.type === 'object') {
    objects++;
    if (n.additionalProperties !== false) bad.push(where);
    if (Array.isArray(n.required)) {
      n.required.forEach(function (r) {
        if (!n.properties || !Object.prototype.hasOwnProperty.call(n.properties, r)) {
          unsup.push(where + ' requires undefined "' + r + '"');
        }
      });
    }
  }
  UNSUPPORTED.forEach(function (k) {
    if (Object.prototype.hasOwnProperty.call(n, k)) unsup.push(where + ' has ' + k);
  });
});
ok(objects >= 2, 'the schema has its objects');
ok(bad.length === 0, 'EVERY object sets additionalProperties:false' + (bad.length ? ' — missing: ' + bad.join(', ') : ''));
ok(unsup.length === 0, 'no unsupported keywords' + (unsup.length ? ' — ' + unsup.join('; ') : ''));

const req = Nutrition.buildRequest('BASE64DATA', 'image/jpeg', 'two cups rice');
eq(req.model, 'claude-opus-5', 'the model is the house model');
ok(req.thinking && req.thinking.type === 'adaptive', 'adaptive thinking');
ok(!('budget_tokens' in (req.thinking || {})), 'no budget_tokens (a 400 on this model)');
ok(!('temperature' in req) && !('top_p' in req), 'no sampling knobs (400s)');
ok(!('stream' in req), 'small bounded request: deliberately not streamed');
ok(req.output_config && req.output_config.format &&
   req.output_config.format.type === 'json_schema', 'structured output declared');
ok(JSON.stringify(req.output_config.format.schema) === JSON.stringify(Nutrition.MEAL_SCHEMA),
  'the wire carries THIS schema, not a drifted copy');
const img = req.messages[0].content[0];
ok(img.type === 'image' && img.source.type === 'base64' && img.source.data === 'BASE64DATA',
  'the image rides as base64');
ok(req.messages[0].content[1].text.indexOf('two cups rice') !== -1, 'the human note rides with it');
ok(req.messages[req.messages.length - 1].role === 'user', 'no assistant prefill');

const src = fs.readFileSync(path.join(P.JS, 'nutrition.js'), 'utf8');
ok(src.indexOf('anthropic-dangerous-direct-browser-access') !== -1,
  'the browser-access header is sent (without it Chromium blocks the call)');

/* ==================================================================
   2. PARSE — junk never throws, refusals surface
   ================================================================== */
let r = Nutrition.parseReply({ stop_reason: 'refusal', content: [] });
ok(!r.ok && /declined/.test(r.reason), 'a refusal stop_reason is surfaced, not read as content');

r = Nutrition.parseReply({ content: [{ type: 'text', text: JSON.stringify({
  reply: 'Rice and chicken.', confidence: 'medium',
  items: [{ name: 'Rice', portion: '2 cups', kcal: 410, proteinG: 8, carbsG: 90, fatG: 1 },
          { name: 'Chicken thigh', portion: '1', kcal: 280, proteinG: 26, carbsG: 0, fatG: 18 }] }) }] });
ok(r.ok && r.items.length === 2, 'a good reply parses to a draft');
eq(r.confidence, 'medium', 'confidence carried');

[null, {}, { content: 'x' }, { content: [{ type: 'text', text: 'not json' }] },
 { content: [{ type: 'text', text: '{"items": "nope"}' }] },
 { content: [{ type: 'text', text: JSON.stringify({ reply: 1, confidence: 'wild',
   items: [{ name: 'x', kcal: 'NaN' }, null, { name: 'ok', portion: '', kcal: 100,
     proteinG: -5, carbsG: 2, fatG: 2 }] }) }] }
].forEach(function (j, i) {
  let out = null, threw = null;
  try { out = Nutrition.parseReply(j); } catch (e) { threw = e.message; }
  ok(!threw && out && typeof out.ok === 'boolean', 'junk[' + i + '] never throws (' + threw + ')');
});
r = Nutrition.parseReply({ content: [{ type: 'text', text: JSON.stringify({ reply: '', confidence: 'high',
  items: [{ name: 'ok', portion: '', kcal: 100, proteinG: -5, carbsG: 2, fatG: 2 }] }) }] });
eq(r.items[0].proteinG, 0, 'negative macros clamp to zero, never subtract from a day');

/* ==================================================================
   3. ARITHMETIC — burn honesty, ledger, calibration, the flag
   ================================================================== */
function sample(date, kind, value) { return { userId: UID, date: date, kind: kind, value: value }; }
function meal(date, kcal) { return { userId: UID, date: date, kcal: kcal, proteinG: 0, carbsG: 0, fatG: 0 }; }

let b = Nutrition.dayBurn([sample(TODAY, 'basalEnergyKcal', 1700), sample(TODAY, 'activeEnergyKcal', 800)], UID, TODAY);
eq(b.burn, 2500, 'burn = basal + active');
b = Nutrition.dayBurn([sample(TODAY, 'activeEnergyKcal', 800)], UID, TODAY);
eq(b.burn, null, 'HALF A BURN IS NO BURN — active without basal refuses');
b = Nutrition.dayBurn([sample(TODAY, 'basalEnergyKcal', 1700)], UID, TODAY);
eq(b.burn, null, 'and basal without active refuses too');

let led = Nutrition.dayLedger([meal(TODAY, 2000)], [sample(TODAY, 'basalEnergyKcal', 1700),
  sample(TODAY, 'activeEnergyKcal', 800)], UID, TODAY);
eq(led.balance, -500, 'the day ledger: intake minus burn');
ok(led.complete, 'and marks itself complete');
led = Nutrition.dayLedger([], [sample(TODAY, 'basalEnergyKcal', 1700), sample(TODAY, 'activeEnergyKcal', 800)], UID, TODAY);
ok(!led.complete && led.balance === null, 'no meals logged = incomplete, no balance');

/* calibration: 21 perfect days at -500/day predicted, scale flat -> estimates run ~500 low */
let meals = [], samples = [], weights = [];
for (let i = 0; i < 21; i++) {
  const d = U.addDays(TODAY, -i);
  meals.push(meal(d, 2000));
  samples.push(sample(d, 'basalEnergyKcal', 1700));
  samples.push(sample(d, 'activeEnergyKcal', 800));
}
weights.push({ userId: UID, date: U.addDays(TODAY, -20), value: 80 });
weights.push({ userId: UID, date: TODAY, value: 80 });
let cal = Nutrition.calibration(meals, samples, weights, UID, TODAY);
eq(cal.state, 'ok', 'three full weeks calibrate');
eq(cal.avgBalance, -500, 'raw average balance');
ok(Math.abs(cal.predictedDeltaKg - (-1.3)) < 0.05, 'predicted ~-1.3 kg over 20 days (got ' + cal.predictedDeltaKg + ')');
eq(cal.actualDeltaKg, 0, 'the scale says flat');
ok(cal.correctionKcalPerDay >= 480 && cal.correctionKcalPerDay <= 520,
  'THE CLOSED LOOP: estimates run ~500 kcal/day low (got ' + cal.correctionKcalPerDay + ')');
ok(Math.abs(cal.correctedAvgBalance) <= 20, 'corrected balance ~0 — matching the scale');

/* refusals */
cal = Nutrition.calibration(meals.slice(0, 13), samples, weights, UID, TODAY);
eq(cal.state, 'insufficient', '13 complete days is below the floor — the calibration refuses');
cal = Nutrition.calibration(meals, samples, [weights[0]], UID, TODAY);
eq(cal.state, 'insufficient', 'one weight is no trend — refuses');

/* the deficit flag */
let workouts = [];
for (let i = 0; i < 14; i++) if (i % 2 === 0 || i === 13) workouts.push({ userId: UID, date: U.addDays(TODAY, -i) });
meals = []; samples = [];
for (let i = 0; i < 14; i++) {
  const d = U.addDays(TODAY, -i);
  meals.push(meal(d, 1600));
  samples.push(sample(d, 'basalEnergyKcal', 1700));
  samples.push(sample(d, 'activeEnergyKcal', 800));
}
let flag = Nutrition.deficitFlag(meals, samples, workouts, UID, TODAY);
eq(flag.state, 'flag', '900/day under across 8 sessions in 14 days FLAGS');
eq(flag.avgDeficit, 900, 'and says by how much');
flag = Nutrition.deficitFlag(meals, samples, workouts.slice(0, 3), UID, TODAY);
eq(flag.state, 'ok', 'the same deficit with little training does not flag — cutting while resting is not the risk');
flag = Nutrition.deficitFlag(meals.slice(0, 5), samples, workouts, UID, TODAY);
eq(flag.state, 'quiet', 'under 7 complete days the flag stays QUIET — never a claim on thin data');

/* protein default */
eq(Nutrition.proteinTargetG([{ userId: UID, date: TODAY, value: 80 }], UID), 144, '1.8 g/kg of the latest weight');
eq(Nutrition.proteinTargetG([], UID), null, 'no weight, no invented target');

/* ==================================================================
   4. STORE — meals ride the shim like everything else
   ================================================================== */
Store.load();
const u = Store.addUser({ name: 'Erfan' });
Store.setCurrentUser(u.id);
const m1 = Store.addMeal({ date: '2026-09-06', name: 'Rice, chicken', kcal: 690, proteinG: 34,
  items: [{ name: 'Rice', kcal: 410 }], source: 'photo', futureKey: 'survives' });
ok(!!m1 && m1.id, 'addMeal stamps');
eq(m1.source, 'photo', 'source carried');
Store.deleteMeal(m1.id);
ok(Store.state.deleted.meals[m1.id] > 0, 'meals tombstone');
const m2 = Store.addMeal({ date: '2026-09-06', kcal: 300 });
const dumped = Store.exportJSON();
storage.set('ironlog/v1', dumped);
Store.load();
ok(Store.state.meals.length === 1 && Store.state.meals[0].id === m2.id,
  'meals survive a save/load round trip');
ok(!('nutrition' in {}) && JSON.stringify(Store.state.meals).indexOf('image') === -1,
  'nothing image-shaped is anywhere near the store');


/* ==================================================================
   5. P8.1 — slots, the budget, the week, the library
   ================================================================== */
eq(Nutrition.slotFor(7), 'breakfast', 'morning defaults to breakfast');
eq(Nutrition.slotFor(12), 'lunch', 'noon to lunch');
eq(Nutrition.slotFor(19), 'dinner', 'evening to dinner');
eq(Nutrition.slotFor(23), 'snack', 'late is a snack');
eq(Nutrition.slotOf({ slot: 'dinner' }), 'dinner', 'a slotted meal keeps its slot');
eq(Nutrition.slotOf({ slot: 'brunch' }), 'snack', 'an unknown slot reads as snack, never guessed');
eq(Nutrition.slotOf({}), 'snack', 'P8.0 records without slots read as snacks');

/* the budget: TDEE from real burn days, moved by the goal rate */
samples = [];
for (let i = 0; i < 10; i++) {
  const d = U.addDays(TODAY, -i);
  samples.push(sample(d, 'basalEnergyKcal', 1700));
  samples.push(sample(d, 'activeEnergyKcal', 800));
}
let tgt = Nutrition.kcalTarget(samples, UID, TODAY, {});
eq(tgt.state, 'ok', 'ten complete burn days make a target');
eq(tgt.target, 2500, 'maintain = TDEE');
tgt = Nutrition.kcalTarget(samples, UID, TODAY, { rateKgPerWeek: -0.25 });
eq(tgt.target, 2500 - 275, 'a quarter-kilo cut is 275 kcal/day off TDEE');
tgt = Nutrition.kcalTarget(samples, UID, TODAY, { rateKgPerWeek: 0.25 });
eq(tgt.target, 2500 + 275, 'and a gain adds the same');
tgt = Nutrition.kcalTarget(samples.slice(0, 8), UID, TODAY, {});
eq(tgt.state, 'insufficient', 'FOUR BURN DAYS IS NO TDEE — the target refuses');
tgt = Nutrition.kcalTarget([], UID, TODAY, { kcalOverride: 2800 });
eq(tgt.target, 2800, 'a manual override needs no burn history');
eq(tgt.source, 'manual', 'and says where it came from');

/* the week strip: incomplete days carry intake but no balance */
const wk = Nutrition.weekSeries([meal(TODAY, 2000)], samples, UID, TODAY);
eq(wk.length, 7, 'seven days, oldest first');
eq(wk[6].date, TODAY, 'ending today');
eq(wk[6].balance, 2000 - 2500, 'the complete day carries its balance');
eq(wk[5].balance, null, 'a day with burn but NO logged intake carries none');

/* the library ranking */
const ranked = Nutrition.rankFoods([
  { name: 'rice', uses: 2, lastUsedAt: 10 },
  { name: 'oats', uses: 9, lastUsedAt: 5 },
  { name: 'eggs', uses: 2, lastUsedAt: 99 }]);
eq(ranked[0].name, 'oats', 'most used first');
eq(ranked[1].name, 'eggs', 'ties break by most recent');

/* meals log to any past day; the future stays closed */
ok(Nutrition.canLogOn(TODAY, TODAY), 'today logs');
ok(Nutrition.canLogOn('2026-08-20', TODAY), 'dietary recall: any past day logs');
ok(!Nutrition.canLogOn('2026-09-07', TODAY), 'the future is closed');

/* foods CRUD + tombstones */
const f1 = Store.addFood({ name: 'Oats + eggs', kcal: 520, proteinG: 32, carbsG: 60, fatG: 14 });
ok(!!f1 && f1.id, 'addFood stamps');
Store.bumpFoodUse(f1.id);
Store.bumpFoodUse(f1.id);
eq(Store.state.foods[0].uses, 2, 'quick-logs bump the measured frequency');
Store.deleteFood(f1.id);
ok(Store.state.deleted.foods[f1.id] > 0, 'foods tombstone');

console.log('passed:', pass);
if (fails.length) { fails.forEach(function (f) { console.log('FAIL:', f); }); process.exit(1); }
console.log('PASS: nutrition core (' + pass + ' assertions)');
