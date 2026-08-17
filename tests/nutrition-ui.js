'use strict';
/* The nutrition view, clicked like a thumb would: the opt-in gate, the
   photo → draft → accept loop (API stubbed at the fetch boundary so the
   REAL request builder and parser run), manual entry, per-item editing,
   rejection, and the no-calorie promise for profiles that never opted in. */
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
  ok(/Today/.test(t), 'enabling opens the ledger');
  const otherUserOff = await p.evaluate(function () {
    const other = Store.state.users.find(function (x) { return x.id !== Store.state.currentUserId; });
    return !other || !(other.settings && other.settings.nutrition && other.settings.nutrition.enabled);
  });
  ok(otherUserOff, 'PER PROFILE: enabling for one user enables nobody else');

  /* ---- 2. the photo loop, stubbed at the wire ---- */
  await p.evaluate(function () {
    window.__sent = [];
    localStorage.setItem('ironlog/coachKey', 'sk-test-not-real');
    window.fetch = function (url, opts) {
      window.__sent.push({ url: String(url), body: JSON.parse(opts.body), headers: opts.headers });
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
    // a 2x2 png, tiny but real — exercises the whole canvas pipeline
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
  ok(/medium confidence/i.test(t), 'confidence is shown, not hidden');
  let mealsN = await p.evaluate(function () { return Store.state.meals.length; });
  ok(mealsN === 0, 'THE MODEL HAS NO WRITE PATH — nothing in the store yet');

  const sent = await p.evaluate(function () { return window.__sent[0]; });
  ok(sent && /api\.anthropic\.com/.test(sent.url), 'the real request builder ran against the stub');
  ok(sent.body.output_config.format.schema.additionalProperties === false,
    'and the wire schema is strict');
  ok(sent.body.messages[0].content[0].type === 'image', 'the image rode the request');
  const noPhotoStored = await p.evaluate(function () {
    return Store.exportJSON().indexOf('base64') === -1;
  });
  ok(noPhotoStored, 'THE PHOTO IS NEVER STORED — nothing base64-shaped in the state');

  /* ---- 3. edit an item, drop an item, accept ---- */
  await p.fill('.g-draft-kcal[data-i="0"]', '500');
  await p.click('[data-act="draft-drop"][data-i="1"]');
  await p.waitForTimeout(300);
  await p.click('[data-act="draft-accept"]');
  await p.waitForTimeout(400);
  const saved = await p.evaluate(function () { return Store.state.meals[0]; });
  ok(saved && saved.kcal === 500, 'the EDITED kcal is what got saved (got ' + (saved && saved.kcal) + ')');
  ok(saved.items.length === 1, 'the dropped item stayed dropped');
  ok(saved.source === 'photo', 'source recorded');
  t = await text();
  ok(/500 kcal/.test(t), 'the meal renders in Today');

  /* ---- 4. reject saves nothing ---- */
  await p.evaluate(function () {
    const cv = document.createElement('canvas');
    cv.width = 2; cv.height = 2;
    cv.toBlob(function (blob) {
      const dt = new DataTransfer();
      dt.items.add(new File([blob], 'meal2.png', { type: 'image/png' }));
      const input = document.querySelector('#nu-file');
      input.files = dt.files;
      input.dispatchEvent(new Event('change'));
    });
  });
  await p.waitForTimeout(1200);
  await p.click('[data-act="draft-reject"]');
  await p.waitForTimeout(300);
  mealsN = await p.evaluate(function () { return Store.state.meals.length; });
  ok(mealsN === 1, 'reject leaves the store exactly as it was');

  /* ---- 5. manual entry needs no key and no network ---- */
  await p.evaluate(function () {
    localStorage.removeItem('ironlog/coachKey');
  });
  await p.click('[data-act="manual"]');
  await p.waitForTimeout(300);
  await p.fill('.g-draft-kcal[data-i="0"]', '650');
  await p.click('[data-act="draft-accept"]');
  await p.waitForTimeout(400);
  mealsN = await p.evaluate(function () { return Store.state.meals.length; });
  ok(mealsN === 2, 'a manual meal logs keyless');
  const manual = await p.evaluate(function () { return Store.state.meals[1]; });
  ok(manual.kcal === 650 && manual.source === 'manual', 'with the typed kcal and the honest source');

  /* ---- 6. the calibration refuses on thin data, in plain words ---- */
  t = await text();
  ok(/Not enough evidence yet/i.test(t), 'the calibration refuses politely instead of inventing');

  /* ---- 7. another profile still sees nothing ---- */
  await p.evaluate(function () {
    const other = Store.state.users.find(function (x) { return x.id !== Store.state.currentUserId; });
    Store.setCurrentUser(other.id);
    App.navigate('nutrition');
  });
  await p.waitForTimeout(500);
  t = await text();
  ok(/Off, until you say otherwise/i.test(t) && !/kcal/.test(t),
    'the other profile is untouched: no calorie anywhere');

  ok(errs.length === 0, 'no page errors: ' + errs.slice(0, 2).join(' | '));

  console.log('passed:', pass);
  if (fails.length) fails.forEach(function (f) { console.log('FAIL:', f); });
  await p.screenshot({ path: '/tmp/nutrition-ui.png' });
  await b.close(); if (server.close) server.close();
  console.log(fails.length ? 'FAIL: nutrition ui' : 'PASS: nutrition ui (' + pass + ' assertions)');
  process.exit(fails.length ? 1 : 0);
})().catch(function (e) { console.error('HARNESS:', e.message); process.exit(2); });
