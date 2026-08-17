'use strict';
/* The nutrition pillar, clicked like a thumb would: the opt-in gate, the
   slotted diary, the photo -> draft -> accept loop (API stubbed at the fetch
   boundary so the REAL builder and parser run), the food library's two-tap
   logging, copy-yesterday, day navigation with a closed future, the budget
   built from real burn, and the Dashboard card. */
const P = require('./lib/paths');
const { chromium } = P.playwright();
const { serve } = require('./lib/hport');

(async () => {
  const server = await serve(P.GYM);
  let pass = 0; const fails = [];
  function ok(c, m) { if (c) pass++; else fails.push(m); }

  const b = await chromium.launch({ executablePath: P.chromiumPath() });
  const c = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const p = await c.newPage();
  const errs = [];
  p.on('pageerror', function (e) { errs.push(e.message); });
  await p.goto('http://127.0.0.1:' + server.port + '/', { waitUntil: 'load' });
  await p.waitForTimeout(800);

  await p.evaluate(function () {
    Store.seedDemo();
    const u = Store.state.users.find(function (x) { return x.name === 'Erfan'; }) || Store.state.users[0];
    Store.setCurrentUser(u.id);
    App.navigate('nutrition');
  });
  await p.waitForTimeout(600);

  async function text() {
    return p.evaluate(function () { return document.querySelector('#content').innerText.replace(/\s+/g, ' '); });
  }

  /* ---- 1. the opt-in gate ---- */
  let t = await text();
  ok(/Off, until you say otherwise/i.test(t), 'nutrition starts OFF');
  ok(!/kcal/.test(t), 'and shows no calorie before consent');
  await p.click('[data-act="enable"]');
  await p.waitForTimeout(400);
  t = await text();
  ok(/Breakfast/.test(t) && /Lunch/.test(t) && /Dinner/.test(t) && /Snacks/.test(t),
    'enabling opens the slotted diary');
  const otherUserOff = await p.evaluate(function () {
    const other = Store.state.users.find(function (x) { return x.id !== Store.state.currentUserId; });
    return !other || !(other.settings && other.settings.nutrition && other.settings.nutrition.enabled);
  });
  ok(otherUserOff, 'PER PROFILE: enabling for one user enables nobody else');

  /* ---- 2. no burn history: the budget refuses, plainly ---- */
  ok(/No calorie budget yet/i.test(t), 'the budget refuses without burn history — no formulas');

  /* ---- 3. the photo loop, stubbed at the wire ---- */
  await p.evaluate(function () {
    window.__sent = [];
    localStorage.setItem('ironlog/coachKey', 'sk-test-not-real');
    window.fetch = function (url, opts) {
      window.__sent.push({ url: String(url), body: JSON.parse(opts.body) });
      return Promise.resolve({
        ok: true, status: 200,
        text: function () {
          return Promise.resolve(JSON.stringify({
            stop_reason: 'end_turn',
            content: [{ type: 'text', text: JSON.stringify({
              reply: 'Rice and chicken thigh.', confidence: 'medium',
              items: [
                { name: 'Rice', portion: '2 cups', kcal: 410, proteinG: 8, carbsG: 90, fatG: 1 },
                { name: 'Chicken thigh', portion: '1', kcal: 280, proteinG: 26, carbsG: 0, fatG: 18 }
              ] }) }]
          }));
        }
      });
    };
  });
  await p.click('[data-act="add-open"][data-slot="dinner"]');
  await p.waitForTimeout(300);
  await p.evaluate(function () {
    document.querySelector('[data-act="photo"][data-slot="dinner"]').click();
    const cv = document.createElement('canvas');
    cv.width = 2; cv.height = 2;
    cv.toBlob(function (blob) {
      const dt = new DataTransfer();
      dt.items.add(new File([blob], 'meal.png', { type: 'image/png' }));
      const input = document.querySelector('#nu-file');
      input.files = dt.files;
      input.dispatchEvent(new Event('change'));
    });
  });
  await p.waitForTimeout(1200);
  t = await text();
  ok(/Draft — nothing saved yet/i.test(t), 'the reply lands as a DRAFT, not a meal');
  ok(/medium confidence/i.test(t), 'confidence is shown');
  let mealsN = await p.evaluate(function () { return Store.state.meals.length; });
  ok(mealsN === 0, 'THE MODEL HAS NO WRITE PATH — nothing in the store yet');
  const sent = await p.evaluate(function () { return window.__sent[0]; });
  ok(sent && sent.body.output_config.format.schema.additionalProperties === false,
    'the real strict schema rode the stubbed wire');
  const noPhotoStored = await p.evaluate(function () {
    return Store.exportJSON().indexOf('base64') === -1;
  });
  ok(noPhotoStored, 'THE PHOTO IS NEVER STORED');

  /* ---- 4. edit, drop, accept + save to library — lands in DINNER ---- */
  await p.fill('.g-draft-kcal[data-i="0"]', '500');
  await p.click('[data-act="draft-drop"][data-i="1"]');
  await p.waitForTimeout(300);
  await p.click('[data-act="draft-accept-save"]');
  await p.waitForTimeout(400);
  const saved = await p.evaluate(function () {
    return { meal: Store.state.meals[0], foods: Store.state.foods.length };
  });
  ok(saved.meal && saved.meal.kcal === 500, 'the EDITED kcal is what got saved');
  ok(saved.meal.slot === 'dinner', 'THE SLOT STUCK — the draft was opened from Dinner');
  ok(saved.foods === 1, 'Accept + ☆ also saved it to the library');
  t = await text();
  ok(/Dinner 500 kcal/.test(t.replace(/\s+/g, ' ')) || /Dinner/.test(t) && /500 kcal/.test(t),
    'the meal renders under its slot');

  /* ---- 5. the library: two taps logs it again ---- */
  await p.click('[data-act="add-open"][data-slot="lunch"]');
  await p.waitForTimeout(300);
  t = await text();
  ok(/From your library/i.test(t), 'the add sheet leads with the library');
  await p.click('[data-act="quick-log"]');
  await p.waitForTimeout(400);
  const quick = await p.evaluate(function () {
    return { n: Store.state.meals.length, m: Store.state.meals[1],
      uses: Store.state.foods[0].uses };
  });
  ok(quick.n === 2, 'TWO TAPS, LOGGED');
  ok(quick.m.slot === 'lunch' && quick.m.kcal === 500, 'to the right slot with the library numbers');
  ok(quick.uses === 1, 'and the use counter measured it');

  /* ---- 6. copy yesterday ---- */
  await p.evaluate(function () {
    Store.addMeal({ date: U.addDays(U.todayStr(), -1), slot: 'breakfast',
      name: 'Oats + eggs', kcal: 520, proteinG: 32, carbsG: 60, fatG: 14, source: 'manual' });
  });
  await p.click('[data-act="add-open"][data-slot="breakfast"]');
  await p.waitForTimeout(300);
  t = await text();
  ok(/Same as yesterday/i.test(t), 'yesterday\'s breakfast offers itself');
  await p.click('[data-act="copy-yesterday"][data-slot="breakfast"]');
  await p.waitForTimeout(400);
  const copied = await p.evaluate(function () {
    return Store.state.meals.filter(function (m) {
      return m.date === U.todayStr() && m.slot === 'breakfast';
    }).length;
  });
  ok(copied === 1, 'one tap clones the slot from yesterday');

  /* ---- 7. day navigation: the past opens, the future stays closed ---- */
  await p.click('[data-act="day-prev"]');
  await p.waitForTimeout(400);
  t = await text();
  ok(/Oats \+ eggs/.test(t), 'yesterday is browsable and shows its meals');
  const nextDisabled = await p.evaluate(function () {
    return document.querySelector('[data-act="day-next"]').disabled === false;
  });
  ok(nextDisabled, 'from yesterday, forward is allowed');
  await p.click('[data-act="day-next"]');
  await p.waitForTimeout(300);
  const backToToday = await p.evaluate(function () {
    return document.querySelector('[data-act="day-next"]').disabled === true;
  });
  ok(backToToday, 'at today, THE FUTURE IS CLOSED');

  /* ---- 8. the budget appears once burn history exists ---- */
  await p.evaluate(function () {
    const u = Store.currentUser();
    const t = U.todayStr();
    const rows = [];
    for (let i = 0; i < 7; i++) {
      rows.push({ userId: u.id, date: U.addDays(t, -i), kind: 'basalEnergyKcal', value: 1700, source: 'link' });
      rows.push({ userId: u.id, date: U.addDays(t, -i), kind: 'activeEnergyKcal', value: 800, source: 'link' });
    }
    Store.addHealthSamples(rows);
    App.rerender();
  });
  await p.waitForTimeout(400);
  t = await text();
  ok(/REMAINING TODAY/i.test(t), 'seven real burn days make a budget');
  ok(/measured 2500 kcal burn/i.test(t), 'and the target says where it came from');
  await p.evaluate(function () {
    const sel = document.querySelector('#nu-rate');
    sel.value = '-0.25';
  });
  await p.click('[data-act="save-targets"]');
  await p.waitForTimeout(400);
  t = await text();
  ok(/for 0.25 kg\/wk/i.test(t), 'a cut rate moves the target and says so');

  /* ---- 9. the Dashboard card ---- */
  await p.evaluate(function () { App.navigate('dashboard'); });
  await p.waitForTimeout(600);
  t = await text();
  ok(/Nutrition/.test(t) && /Remaining/i.test(t), 'the pillar stands on the Dashboard');
  await p.click('[data-nu-dash]');
  await p.waitForTimeout(500);
  const hash = await p.evaluate(function () { return location.hash; });
  ok(/nutrition/.test(hash), 'tapping it opens the diary');

  /* ---- 10. another profile: no calorie anywhere, dashboard included ---- */
  await p.evaluate(function () {
    const other = Store.state.users.find(function (x) { return x.id !== Store.state.currentUserId; });
    Store.setCurrentUser(other.id);
    App.navigate('dashboard');
  });
  await p.waitForTimeout(500);
  const dashCard = await p.evaluate(function () {
    return !!document.querySelector('[data-nu-dash]');
  });
  ok(!dashCard, 'the un-opted profile has NO nutrition card on the Dashboard — not a variant, none');
  await p.evaluate(function () { App.navigate('nutrition'); });
  await p.waitForTimeout(400);
  t = await text();
  ok(/Off, until you say otherwise/i.test(t) && !/kcal/.test(t), 'and no calorie in the view');

  /* ================================================================
     P8.2 — the Energy tab: expenditure vs intake, joined
     ================================================================ */
  await p.evaluate(function () {
    const u = Store.state.users.find(function (x) { return x.name === 'Erfan'; }) || Store.state.users[0];
    Store.setCurrentUser(u.id);
    const t = U.todayStr();
    // a clean slate for THIS user's training in the window — the demo seed
    // already has workouts that would blur the split
    Store.state.workouts = Store.state.workouts.filter(function (w) { return w.userId !== u.id; });
    Store.save();
    // 14 complete days: training every other day burns 700 more; intake flat
    const rows = [];
    for (let i = 0; i < 14; i++) {
      const d = U.addDays(t, -i);
      rows.push({ userId: u.id, date: d, kind: 'basalEnergyKcal', value: 1700, source: 'link' });
      rows.push({ userId: u.id, date: d, kind: 'activeEnergyKcal', value: i % 2 === 0 ? 1200 : 500, source: 'link' });
      if (i % 2 === 0) Store.addWorkout({ userId: u.id, date: d, entries: [] });
      if (i > 1) Store.addMeal({ date: d, slot: 'dinner', name: 'Day ' + i, items: [],
        kcal: 2400, proteinG: 120, carbsG: 220, fatG: 70, source: 'manual' });
    }
    Store.addHealthSamples(rows);
    App.navigate('nutrition');
  });
  await p.waitForTimeout(500);
  await p.click('[data-nutab="energy"]');
  await p.waitForTimeout(500);
  t = await text();
  ok(/Last 14 days/i.test(t), 'the Energy tab renders the fortnight');
  const chart = await p.evaluate(function () {
    return { bars: document.querySelectorAll('.nu-echart .bar').length,
      na: document.querySelectorAll('.nu-echart .bar.na').length,
      dots: document.querySelectorAll('.nu-echart .dot').length,
      marks: document.querySelectorAll('.nu-echart .tmark').length };
  });
  ok(chart.bars >= 10, 'intake bars drawn (' + chart.bars + ')');
  eq14: ok(chart.dots === 14, 'burn dots on every day the link delivered (' + chart.dots + ')');
  ok(chart.marks === 7, 'training triangles come from the WORKOUT LOG (' + chart.marks + ')');
  ok(/Training days vs rest days/i.test(t), 'the split card renders');
  ok(/2900/.test(t) && /2200/.test(t), 'training and rest burns shown from real numbers');
  ok(/DEFICIT LIVES ON TRAINING DAYS/i.test(t),
    'THE FINDING: flat intake across a 700 kcal burn gap is named, with the numbers');
  ok(/The scale as referee/i.test(t), 'calibration lives with the analysis');

  /* the split refuses when one side is thin */
  await p.evaluate(function () {
    const u = Store.currentUser();
    Store.state.workouts = Store.state.workouts.filter(function (w) {
      return w.userId !== u.id || w.date < U.addDays(U.todayStr(), -13);
    });
    Store.save();
    App.rerender();
  });
  await p.waitForTimeout(400);
  t = await text();
  ok(/needs 3 complete days of each kind/i.test(t),
    'zero training days in the window: the split refuses instead of comparing anecdotes');

  /* a day the health link missed must BREAK the burn line, not be bridged */
  await p.evaluate(function () {
    const u = Store.currentUser();
    const gap = U.addDays(U.todayStr(), -6);
    Store.state.healthSamples = Store.state.healthSamples.filter(function (s) {
      return !(s.userId === u.id && s.date === gap &&
        (s.kind === 'basalEnergyKcal' || s.kind === 'activeEnergyKcal'));
    });
    Store.save();
    App.rerender();
  });
  await p.waitForTimeout(400);
  const lineBreaks = await p.evaluate(function () {
    const el = document.querySelector('.nu-echart .burnline');
    return el ? (el.getAttribute('d').match(/M/g) || []).length : 0;
  });
  ok(lineBreaks === 2, 'A MISSING BURN DAY BREAKS THE LINE — never bridged (' + lineBreaks + ' segments)');

  ok(errs.length === 0, 'no page errors: ' + errs.slice(0, 2).join(' | '));

  console.log('passed:', pass);
  if (fails.length) fails.forEach(function (f) { console.log('FAIL:', f); });
  await p.screenshot({ path: '/tmp/nutrition-ui.png' });
  await b.close(); if (server.close) server.close();
  console.log(fails.length ? 'FAIL: nutrition ui' : 'PASS: nutrition ui (' + pass + ' assertions)');
  process.exit(fails.length ? 1 : 0);
})().catch(function (e) { console.error('HARNESS:', e.message); process.exit(2); });
