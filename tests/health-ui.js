'use strict';
/* The Health connection card, in a browser, through all four states. */
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

  async function shot(name) {
    await p.evaluate(function () {
      const card = Array.from(document.querySelectorAll('.card'))
        .find(function (x) { return x.textContent.indexOf('Apple Health') !== -1; });
      if (card) card.scrollIntoView({ block: 'center' });
    });
    await p.waitForTimeout(300);
    await p.screenshot({ path: '/tmp/hl-' + name + '.png' });
  }
  async function state() {
    return p.evaluate(function () {
      const card = Array.from(document.querySelectorAll('.card'))
        .find(function (x) { return x.textContent.indexOf('Apple Health') !== -1; });
      if (!card) return null;
      const ls = card.querySelector('.link-state');
      return { cls: ls ? ls.className : '', head: ls ? (ls.querySelector('b') || {}).textContent : '',
        url: (card.querySelector('#ah-url') || {}).textContent || '',
        hasPair: !!card.querySelector('#ah-pair'), hasCopy: !!card.querySelector('#ah-copy'),
        text: card.innerText.replace(/\s+/g, ' ') };
    });
  }

  await p.evaluate(function () {
    Store.seedDemo();
    const u = Store.state.users.find(function (x) { return x.name === 'Erfan'; }) || Store.state.users[0];
    Store.setCurrentUser(u.id);
    Store.updateUser(u.id, { settings: Object.assign({}, u.settings, { trainingProfile: 'performance' }) });
    Sync.configure({ url: '' });
    App.navigate('settings');
  });
  await p.waitForTimeout(700);

  /* ---- 1. no sync configured ---- */
  let s = await state();
  ok(/off/.test(s.cls), 'no sync: off state');
  ok(/sync required/i.test(s.head), 'no sync: says sync is the prerequisite (got "' + s.head + '")');
  ok(!s.hasPair, 'no sync: no pair button offered');
  await shot('1-nosync');

  /* ---- 2. sync configured, not paired ---- */
  await p.evaluate(function () {
    Sync.configure({ url: 'https://fam-default-rtdb.firebaseio.com/ironlog-abc123' });
    App.rerender();
  });
  await p.waitForTimeout(500);
  s = await state();
  ok(/off/.test(s.cls), 'unpaired: off state');
  ok(/not connected/i.test(s.head), 'unpaired: "Not connected"');
  ok(s.hasPair, 'unpaired: offers Set up connection');
  await shot('2-unpaired');

  /* ---- 3. paired, waiting ---- */
  await p.click('#ah-pair');
  await p.waitForTimeout(600);
  s = await state();
  ok(/waiting/.test(s.cls), 'paired: waiting state');
  ok(/^https:\/\/fam-default-rtdb\.firebaseio\.com\/health-[a-z0-9]+\.json$/.test(s.url.trim()),
    'paired: a real address is shown (got ' + s.url.trim() + ')');
  ok(s.url.indexOf('ironlog-abc123') === -1, 'the address is NOT under the training-log path');
  ok(s.hasCopy, 'paired: offers Copy address');
  ok(/Health Auto Export/.test(s.text), 'paired: names the courier and the setup steps');
  await shot('3-paired');

  /* ---- 4. receiving ---- */
  await p.evaluate(function () {
    Store.state.sync.health.lastAt = Date.now();
    Store.state.sync.health.lastSummary = { rows: 6, added: 6,
      kinds: { restingHR: 2, sleepHours: 1, steps: 2, weightKg: 1 }, unknown: [] };
    Store.state.sync.health.lastRaw = '{"data":{"metrics":[{"name":"resting_heart_rate"}]}}';
    Store.save(); App.rerender();
  });
  await p.waitForTimeout(500);
  s = await state();
  ok(/live/.test(s.cls), 'receiving: live state');
  ok(/Resting heart rate/.test(s.text), 'receiving: lists what arrived');
  await shot('4-receiving');

  /* ---- 5. gone quiet ---- */
  await p.evaluate(function () {
    Store.state.sync.health.lastAt = Date.now() - 4 * 86400000;
    Store.save(); App.rerender();
  });
  await p.waitForTimeout(500);
  s = await state();
  ok(/stale/.test(s.cls), 'quiet: stale state');
  ok(/4 days/.test(s.head), 'quiet: says how long (got "' + s.head + '")');
  ok(/Sharing/.test(s.text), 'quiet: tells you where to look');
  await shot('5-quiet');

  /* ---- 6. a delivery nobody understood must be visible ---- */
  await p.evaluate(function () {
    Store.state.sync.health.lastAt = Date.now();
    Store.state.sync.health.lastSummary = { rows: 0, added: 0, kinds: {}, unknown: ['blood_glucose'] };
    Store.save(); App.rerender();
  });
  await p.waitForTimeout(500);
  s = await state();
  ok(/Not recognised/.test(s.text) || /nothing in it was recognised/.test(s.text),
    'an unrecognised delivery is called out on screen');
  await shot('6-unrecognised');

  ok(errs.length === 0, 'no page errors: ' + errs.slice(0, 2).join(' | '));

  console.log('passed:', pass);
  if (fails.length) fails.forEach(function (f) { console.log('FAIL:', f); });
  await b.close(); if (server.close) server.close();
  console.log(fails.length ? 'FAIL: health ui' : 'PASS: health ui (' + pass + ' assertions)');
  process.exit(fails.length ? 1 : 0);
})().catch(function (e) { console.error('HARNESS:', e.message); process.exit(2); });
