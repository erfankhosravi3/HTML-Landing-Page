'use strict';
/* The "Who can read this database?" panel, in a browser.

   The logic is covered in db-rules.js. What THIS suite is for is the part that
   made the original bug survive for months: the app said the database was
   private, and there was no screen anywhere that could disagree with it. A
   correct probe that never reaches the user is worth nothing, so the states
   are exercised by clicking the button the user clicks. */
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
      const el = document.querySelector('#lk-check');
      if (el) el.scrollIntoView({ block: 'center' });
    });
    await p.waitForTimeout(300);
    await p.screenshot({ path: '/tmp/lk-' + name + '.png' });
  }

  // Everything the panel shows, read the way a user reads it.
  async function panel() {
    return p.evaluate(function () {
      const card = Array.from(document.querySelectorAll('.card'))
        .find(function (x) { return x.textContent.indexOf('Family Sync') !== -1; });
      if (!card) return null;
      const ls = Array.from(card.querySelectorAll('.link-state')).pop();
      const rules = card.querySelector('#lk-rules');
      return {
        hasCheck: !!card.querySelector('#lk-check'),
        cls: ls ? ls.className : '',
        head: ls ? (ls.querySelector('b') || {}).textContent : '',
        rules: rules ? rules.textContent : '',
        hasCopy: !!card.querySelector('#lk-copy'),
        text: card.innerText.replace(/\s+/g, ' ')
      };
    });
  }

  // A fake Firebase root. Installed in the page so the real probe runs.
  async function stubRoot(status, body) {
    await p.evaluate(function (arg) {
      window.__probes = [];
      window.fetch = function (url, opts) {
        window.__probes.push({ url: String(url), method: (opts && opts.method) || 'GET' });
        return Promise.resolve({
          ok: arg.status >= 200 && arg.status < 300,
          status: arg.status,
          json: function () { return Promise.resolve(arg.body); }
        });
      };
    }, { status: status, body: body });
  }

  await p.evaluate(function () {
    Store.seedDemo();
    const u = Store.state.users.find(function (x) { return x.name === 'Erfan'; }) || Store.state.users[0];
    Store.setCurrentUser(u.id);
    Sync.configure({ url: '' });
    App.navigate('settings');
  });
  await p.waitForTimeout(700);

  /* ---- 1. nothing to say before sync is configured ---- */
  let s = await panel();
  ok(s && !s.hasCheck, 'no sync configured: no exposure panel at all');

  /* ---- 2. configured but never checked ---- */
  await p.evaluate(function () {
    Sync.configure({ url: 'https://fam-default-rtdb.firebaseio.com/ironlog-abc123' });
    App.rerender();
  });
  await p.waitForTimeout(500);
  s = await panel();
  ok(s.hasCheck, 'configured: the Check button is on screen');
  ok(/off/.test(s.cls), 'unchecked: neutral state');
  ok(/not checked/i.test(s.head), 'unchecked: says so plainly (got "' + s.head + '")');
  ok(/test mode/i.test(s.text), 'unchecked: warns that Firebase starts open');
  await shot('1-unchecked');

  /* ---- 3. the database is wide open ----

     Sync is toggled off for this step, on purpose. Left on, its debounced push
     calls Store.save() about two seconds after any config change — which
     silently persisted the verdict for us and made the disk assertion below
     pass even with the handler's own save deleted. A real user with sync
     switched off gets no such favour. */
  await p.evaluate(function () {
    Store.state.sync.enabled = false;
    Store.save();
    App.rerender();
  });
  await p.waitForTimeout(400);
  await stubRoot(200, { 'ironlog-abc123': true, 'health-abc': true });
  await p.click('#lk-check');
  await p.waitForTimeout(900);
  s = await panel();
  ok(/risk/.test(s.cls), 'open: the alarming state, not a muted note (got "' + s.cls + '")');
  ok(/anyone can read/i.test(s.head), 'open: says exactly what is wrong (got "' + s.head + '")');
  ok(s.rules.indexOf('"ironlog-abc123"') !== -1, 'open: the fix names YOUR path, ready to paste');
  ok(/"\.read":\s*false/.test(s.rules), 'open: the fix denies root read');
  ok(s.hasCopy, 'open: offers to copy the rules');
  await shot('2-open');

  /* Filtered to the probe's own signature. Sync's debounced push shares this
     stub, and counting every fetch made an assertion whose result depended on
     a 2-second timer — it failed under an unrelated mutation and would have
     failed on a slow machine too. */
  const all = await p.evaluate(function () { return window.__probes || []; });
  const probes = all.filter(function (x) { return x.url.indexOf('shallow=true') !== -1; });
  ok(probes.length === 1, 'exactly one exposure probe per tap (got ' + probes.length +
    ' of ' + all.length + ' requests)');
  ok(probes.length && probes[0].url.indexOf('auth=') === -1,
    'the probe carried no secret (got ' + (probes[0] || {}).url + ')');
  ok(probes.length && probes[0].url.indexOf('ironlog-abc123') === -1,
    'the probe asked about the ROOT (got ' + (probes[0] || {}).url + ')');

  /* Straight to the bytes on disk, before anything else in the app has a
     reason to save. Sync's debounced push calls Store.save() a couple of
     seconds after any config change, so a verdict that is merely still on
     screen — or still there after a slow reload — proves nothing about whether
     the handler wrote it. A user who taps Check and closes the app is relying
     on this exact write. */
  const onDisk = await p.evaluate(function () {
    for (let i = 0; i < localStorage.length; i++) {
      const raw = localStorage.getItem(localStorage.key(i));
      if (!raw || raw.indexOf('exposure') === -1) continue;
      try {
        const st = JSON.parse(raw);
        if (st && st.sync && st.sync.exposure) return st.sync.exposure;
      } catch (e) { /* not our blob */ }
    }
    return null;
  });
  ok(onDisk && onDisk.state === 'open',
    'THE HANDLER ITSELF PERSISTS THE VERDICT (found ' + JSON.stringify(onDisk) + ')');

  /* Reload FIRST, before any navigation. Ordered deliberately: navigating
     saves state for its own reasons, so a later reload would pass even if the
     handler never wrote anything — the verdict would just be riding along on
     somebody else's save, and a user who taps Check and closes the app would
     lose it. Reloading here means only the handler's own save can explain it.

     This also pins the store whitelist: a key not named in normalizeState is
     silently dropped on the next load. */
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(900);
  await p.evaluate(function () { App.navigate('settings'); });
  await p.waitForTimeout(600);
  s = await panel();
  ok(/risk/.test(s.cls), 'THE OPEN VERDICT SURVIVES A RELOAD (got "' + s.cls + '")');
  ok(/anyone can read/i.test(s.head), 'and still says what is wrong after the reload');

  /* And a re-render, or it is a warning you see once. */
  await p.evaluate(function () { App.rerender(); });
  await p.waitForTimeout(400);
  s = await panel();
  ok(/risk/.test(s.cls), 'the open verdict survives a re-render');

  await p.evaluate(function () { App.navigate('log'); });
  await p.waitForTimeout(400);
  await p.evaluate(function () { App.navigate('settings'); });
  await p.waitForTimeout(500);
  s = await panel();
  ok(/risk/.test(s.cls), 'and survives leaving Settings and coming back');

  /* ---- 4. locked down ---- */
  await stubRoot(401, null);
  await p.click('#lk-check');
  await p.waitForTimeout(900);
  s = await panel();
  ok(/live/.test(s.cls), 'locked: the good state');
  ok(/locked down/i.test(s.head), 'locked: says so (got "' + s.head + '")');
  await shot('3-locked');

  /* ---- 5. a root-only URL cannot be locked down, and says why ---- */
  await p.evaluate(function () {
    Sync.configure({ url: 'https://fam-default-rtdb.firebaseio.com' });
    App.rerender();
  });
  await p.waitForTimeout(500);
  s = await panel();
  ok(s.hasCheck, 'root URL: the panel is still there');
  ok(!s.hasCopy, 'root URL: no rules offered — they would lock the app out too');
  ok(/no private path segment/i.test(s.text), 'root URL: explains what to do first');
  await shot('4-rooturl');

  ok(errs.length === 0, 'no page errors: ' + errs.slice(0, 2).join(' | '));

  console.log('passed:', pass);
  if (fails.length) fails.forEach(function (f) { console.log('FAIL:', f); });
  await b.close(); if (server.close) server.close();
  console.log(fails.length ? 'FAIL: lockdown ui' : 'PASS: lockdown ui (' + pass + ' assertions)');
  process.exit(fails.length ? 1 : 0);
})().catch(function (e) { console.error('HARNESS:', e.message); process.exit(2); });
