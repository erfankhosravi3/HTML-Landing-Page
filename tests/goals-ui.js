'use strict';
/* The Goals probe UI, in a browser: the compiler's refusal, the cap, the
   Today card's tick loop, and the review that stamps its own cadence.
   The engine's arithmetic is pinned in goals-core.js; this suite proves the
   screens actually reach it — presence is not proof, so every assertion
   clicks the thing a thumb would click. */
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
    App.navigate('goals');
  });
  await p.waitForTimeout(600);

  async function text() {
    return p.evaluate(function () { return document.querySelector('#content').innerText.replace(/\s+/g, ' '); });
  }

  /* ---- 1. empty state ---- */
  let t = await text();
  ok(/Name the target/i.test(t), 'empty state: an invitation, not a blank');
  ok(/0 of 3 active/.test(t), 'the cap is visible before it binds');

  /* ---- 2. the refusal ---- */
  await p.click('[data-act="new"]');
  await p.waitForTimeout(400);
  await p.fill('#g-name', 'Get better with money');
  await p.click('[data-act="commit"]');
  await p.waitForTimeout(400);
  t = await text();
  ok(/Doesn't compile yet/i.test(t), 'a vague goal is refused');
  ok(/measured how\?/i.test(t), 'and the refusal names the exact missing question');
  let n = await p.evaluate(function () { return Store.state.goals.length; });
  ok(n === 0, 'nothing was saved by the refusal');

  /* ---- 3. a goal that compiles ---- */
  await p.fill('#g-name', 'Save $6,000');
  await p.fill('#g-why', 'Buffer before I ship');
  await p.fill('#g-measure', 'balance');
  await p.fill('#g-unit', '$');
  await p.fill('#g-base', '2150');
  await p.fill('#g-target', '6000');
  await p.fill('#g-date', '2026-12-31');
  await p.waitForTimeout(200);
  t = await text();
  ok(/needs .* per week/i.test(t), 'the arithmetic runs live while typing');
  await p.fill('#g-cue', 'payday');
  await p.fill('#g-action', 'transfer $650');
  await p.selectOption('#g-cad', 'w2');
  await p.click('[data-act="commit"]');
  await p.waitForTimeout(500);
  const made = await p.evaluate(function () {
    return { goals: Store.state.goals.length, practices: Store.state.practices.length,
      measures: Store.state.measures.length,
      anchor: (Store.currentUser().settings || {}).goalsReviewAt || null };
  });
  ok(made.goals === 1 && made.practices === 1, 'the goal and its practice exist');
  ok(made.measures === 1, 'THE BASELINE IS DAY ZERO OF THE SERIES — one point already');
  ok(!!made.anchor, 'the first goal anchors the review cadence');
  t = await text();
  ok(/Measuring · 1 of 3/i.test(t), 'one point renders as measuring, never a fake verdict');

  /* ---- 4. reporting corrects, then extends ---- */
  await p.fill('#g-report', '2300');
  await p.click('[data-act="report"]');
  await p.waitForTimeout(400);
  n = await p.evaluate(function () { return Store.state.measures.length; });
  ok(n === 1, 'a same-day report CORRECTS the point instead of adding one');

  /* ---- 5. the Today card ticks and unticks ---- */
  await p.evaluate(function () { App.navigate('dashboard'); });
  await p.waitForTimeout(600);
  t = await text();
  ok(/Today/.test(t) && /transfer \$650/.test(t), 'the practice is on the Dashboard Today card');
  ok(/Save \$6,000/.test(t), 'tagged with the goal it serves');
  await p.click('[data-goal-tick]');
  await p.waitForTimeout(400);
  let ticked = await p.evaluate(function () { return Store.state.ticks.length; });
  ok(ticked === 1, 'one tap, one tick');
  await p.click('[data-goal-tick]');
  await p.waitForTimeout(400);
  ticked = await p.evaluate(function () { return Store.state.ticks.length; });
  ok(ticked === 0, 'tapping again unticks — no ceremony');
  await p.click('[data-goal-tick]');
  await p.waitForTimeout(300);

  /* ---- 5b. leaving mid-flow and coming back lands on the LIST ---- */
  await p.evaluate(function () { App.navigate('goals'); });
  await p.waitForTimeout(400);
  t = await text();
  ok(/of 3 active/.test(t) && !/Trajectory/.test(t),
    'RE-ENTERING GOALS RESETS TO THE LIST — never a stale half-flow from days ago');

  /* ---- 6. the cap, at the door ---- */
  await p.evaluate(function () {
    Store.addGoal({ name: 'Farsi', measure: { name: 'fallbacks' }, baseline: { value: 30 },
      target: { value: 10, date: '2026-12-31' } });
    Store.addGoal({ name: 'EMT cert', measure: { name: 'mock %' }, baseline: { value: 60 },
      target: { value: 85, date: '2026-12-31' } });
    App.navigate('goals');
  });
  await p.waitForTimeout(500);
  await p.click('[data-act="new"]');
  await p.waitForTimeout(300);
  await p.fill('#g-name', 'One more thing');
  await p.fill('#g-measure', 'x');
  await p.fill('#g-base', '0');
  await p.fill('#g-target', '1');
  await p.fill('#g-date', '2026-12-31');
  await p.click('[data-act="commit"]');
  await p.waitForTimeout(400);
  t = await text();
  ok(/3 active goals/i.test(t), 'the fourth goal meets the capacity conversation');
  n = await p.evaluate(function () { return Store.state.goals.length; });
  ok(n === 3, 'and is not created');

  /* ---- 7. the review: due, diagnoses, stamps ---- */
  await p.evaluate(function () {
    const u = Store.currentUser();
    const s = Object.assign({}, u.settings, { goalsReviewAt: U.addDays(U.todayStr(), -8) });
    Store.updateUser(u.id, { settings: s });
    App.navigate('dashboard');
  });
  await p.waitForTimeout(300);
  await p.evaluate(function () { App.navigate('goals'); });
  await p.waitForTimeout(500);
  t = await text();
  ok(/Weekly review due/i.test(t), 'eight days since the anchor: the review calls');
  await p.click('.g-review-due .btn');
  await p.waitForTimeout(500);
  t = await text();
  ok(/Did the work/i.test(t) && /Number moved/i.test(t),
    'the review crosses the two numbers that matter');
  const askPh = await p.evaluate(function () {
    const el = document.querySelector('[data-report-for]');
    return el ? el.getAttribute('placeholder') : null;
  });
  ok(askPh === 'balance today', 'and ASKS for the self-reported measure (got "' + askPh + '")');
  // answering the ask must land a point
  await p.fill('[data-report-for]', '2850');
  await p.click('[data-act="review-report"]');
  await p.waitForTimeout(400);
  const pts = await p.evaluate(function () { return Store.state.measures.length; });
  ok(pts === 1, 'the review-reported number corrects today\'s point in place');
  await p.click('[data-act="finish-review"]');
  await p.waitForTimeout(500);
  const stamped = await p.evaluate(function () {
    return (Store.currentUser().settings || {}).goalsReviewAt === U.todayStr();
  });
  ok(stamped, 'finishing stamps today — the cadence restarts');
  t = await text();
  ok(!/Weekly review due/i.test(t), 'and the banner stands down');

  /* ---- 8. both modes: a simple-mode profile sees Goals too ---- */
  await p.evaluate(function () {
    const u = Store.currentUser();
    Store.updateUser(u.id, { settings: Object.assign({}, u.settings, { trainingProfile: 'simple' }) });
    App.navigate('goals');
  });
  await p.waitForTimeout(500);
  t = await text();
  ok(/Goals/.test(t) && /Save \$6,000/.test(t), 'Goals is general — no performance gate');

  ok(errs.length === 0, 'no page errors: ' + errs.slice(0, 2).join(' | '));

  console.log('passed:', pass);
  if (fails.length) fails.forEach(function (f) { console.log('FAIL:', f); });
  await p.screenshot({ path: '/tmp/goals-ui.png' });
  await b.close(); if (server.close) server.close();
  console.log(fails.length ? 'FAIL: goals ui' : 'PASS: goals ui (' + pass + ' assertions)');
  process.exit(fails.length ? 1 : 0);
})().catch(function (e) { console.error('HARNESS:', e.message); process.exit(2); });
