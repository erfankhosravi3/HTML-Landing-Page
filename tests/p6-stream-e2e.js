// Does the reply actually appear PROGRESSIVELY? The fix is worthless if the
// text still lands in one lump at the end — that is the same silent wait with
// extra machinery. Sample the DOM while the stream is in flight.
const P = require('./lib/paths');
const { chromium } = P.playwright();
const { serve } = require('./lib/hport');

const REPLY_TEXT = 'Grip is your limiter, not your back. Across the last three weeks every hang ' +
  'set fell off before your lats did, and your forty-five second best has not moved since the ' +
  'twelfth of July while pull-up volume climbed thirty percent. That is a tissue being asked to ' +
  'do more without being trained directly, and it is the first thing I would change this week.';

(async () => {
  const server = await serve(P.GYM);
  let pass = 0; const fails = [];
  function ok(c, m) { if (c) pass++; else fails.push(m); }

  const browser = await chromium.launch({ executablePath: P.chromiumPath() });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', function (e) { errs.push(e.message); });

  await page.goto('http://127.0.0.1:' + server.port + '/', { waitUntil: 'load' });
  await page.waitForTimeout(800);

  // A deliberately SLOW stream, so "progressive" is observable rather than a
  // race the test would win or lose by accident.
  await page.evaluate(function (text) {
    const json = JSON.stringify({ reply: text });
    window.fetch = function () {
      const enc = new TextEncoder();
      const evs = [];
      evs.push('event: message_start\ndata: ' + JSON.stringify({
        type: 'message_start', message: { usage: { input_tokens: 100, cache_read_input_tokens: 9000 } } }) + '\n\n');
      for (let i = 0; i < json.length; i += 40) {
        evs.push('event: content_block_delta\ndata: ' + JSON.stringify({
          type: 'content_block_delta', index: 0,
          delta: { type: 'text_delta', text: json.slice(i, i + 40) } }) + '\n\n');
      }
      evs.push('event: message_delta\ndata: ' + JSON.stringify({
        type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 200 } }) + '\n\n');
      let i = 0;
      const stream = new ReadableStream({
        pull: function (c) {
          if (i >= evs.length) { c.close(); return; }
          const chunk = evs[i++];
          return new Promise(function (res) {
            setTimeout(function () { c.enqueue(enc.encode(chunk)); res(); }, 90);
          });
        }
      });
      return Promise.resolve({ ok: true, status: 200, body: stream,
        text: function () { return Promise.resolve(evs.join('')); } });
    };
    Store.seedDemo();
    const u = Store.state.users.find(function (x) { return x.name === 'Erfan'; }) || Store.state.users[0];
    Store.setCurrentUser(u.id);
    Store.updateUser(u.id, { settings: Object.assign({}, u.settings, { trainingProfile: 'performance' }) });
    Coach.setKey('sk-ant-api03-STREAM-TEST-0000');
    App.navigate('coach');
  }, REPLY_TEXT);
  await page.waitForTimeout(700);

  await page.fill('#coach-input', 'what is limiting my pull-ups?');
  await page.click('#coach-send');

  /* Sample the live bubble while it fills. */
  const samples = [];
  for (let i = 0; i < 30; i++) {
    const s = await page.evaluate(function () {
      const live = document.querySelector('#coach-live .cm-bubble');
      const done = Store.chatFor(Store.currentUser().id).some(function (m) {
        return m.role === 'assistant' && m.text;
      });
      return { len: live ? live.textContent.length : -1, done: done,
        caret: !!document.querySelector('.cm-caret') };
    });
    samples.push(s);
    if (s.done) break;
    await page.waitForTimeout(120);
  }

  const growing = samples.filter(function (s) { return s.len > 0; });
  const distinct = {};
  growing.forEach(function (s) { distinct[s.len] = true; });
  const nDistinct = Object.keys(distinct).length;

  ok(growing.length > 0, 'the reply is visible while still streaming');
  ok(nDistinct >= 3, 'the text grows in steps rather than landing in one lump (' + nDistinct + ' distinct lengths)');
  ok(growing.some(function (s) { return s.caret; }), 'a caret shows the reply is still arriving');

  const monotonic = growing.every(function (s, i) { return i === 0 || s.len >= growing[i - 1].len; });
  ok(monotonic, 'the visible text only ever grows — it never flickers backwards');

  /* and it finishes correctly */
  await page.waitForTimeout(1200);
  const final = await page.evaluate(function () {
    const t = Store.chatFor(Store.currentUser().id);
    const last = t[t.length - 1];
    return { role: last.role, text: last.text, live: !!document.querySelector('#coach-live'),
      usage: last.usage || null };
  });
  ok(final.role === 'assistant', 'the finished reply is stored');
  ok(final.text === REPLY_TEXT, 'the streamed text assembles EXACTLY, with no lost or doubled chunk');
  ok(!final.live, 'the live bubble is replaced by the stored message');
  ok(final.usage && final.usage.cache_read_input_tokens === 9000,
    'usage from message_start survives the stream (cache accounting intact)');

  ok(errs.length === 0, 'no page errors: ' + errs.slice(0, 2).join(' | '));

  console.log('passed:', pass);
  if (fails.length) fails.forEach(function (f) { console.log('FAIL:', f); });
  await browser.close();
  if (server.close) server.close();
  console.log(fails.length ? 'FAIL: p6 stream e2e' : 'PASS: p6 stream e2e (' + pass + ' assertions)');
  process.exit(fails.length ? 1 : 0);
})().catch(function (e) { console.error('HARNESS:', e.message); process.exit(2); });
