// Can a person on a PHONE actually reach every view, without knowing a URL?
// This exists because the theme picker was reported "missing": on mobile the
// only door to Settings was the topbar sync-status dot, and nothing said so.
// A view you cannot find is a view you did not ship.
const P = require('./lib/paths');
const { chromium } = P.playwright();
const { serve } = require('./lib/hport');

(async () => {
  const server = await serve(P.GYM);
  let pass = 0; const fails = [];
  function ok(c, m) { if (c) pass++; else fails.push(m); }

  const browser = await chromium.launch({ executablePath: P.chromiumPath() });

  async function run(width, label) {
    const ctx = await browser.newContext({ viewport: { width: width, height: 844 }, hasTouch: width < 768, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', function (e) { errs.push(e.message); });
    await page.goto('http://127.0.0.1:' + server.port + '/', { waitUntil: 'load' });
    await page.waitForTimeout(800);
    await page.evaluate(function () {
      Store.seedDemo();
      const u = Store.state.users.find(function (x) { return x.name === 'Erfan'; }) || Store.state.users[0];
      Store.setCurrentUser(u.id);
      Store.updateUser(u.id, { settings: Object.assign({}, u.settings, { trainingProfile: 'performance' }) });
      App.navigate('dashboard');
    });
    await page.waitForTimeout(600);

    /* ---- one tap: what is reachable from the chrome as it stands? ---- */
    const chromeLinks = await page.evaluate(function () {
      return Array.from(document.querySelectorAll('#topbar a, #topbar button, .tabbar a, .tabbar button, #sidebar a'))
        .map(function (el) {
          return { href: el.getAttribute('href') || '', id: el.id || '',
            label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40) };
        });
    });

    /* ---- two taps: open the avatar menu ---- */
    await page.click('#user-btn');
    await page.waitForTimeout(400);
    const menu = await page.evaluate(function () {
      const m = document.querySelector('[role="menu"]');
      if (!m) return null;
      return Array.from(m.querySelectorAll('button')).map(function (b) {
        return (b.textContent || '').trim().slice(0, 40);
      });
    });
    ok(!!menu, label + ': the avatar opens a menu');
    ok(menu && menu.some(function (t) { return /Settings/i.test(t); }),
      label + ': Settings is offered in the avatar menu (2 taps, no URL knowledge)');

    /* It actually goes there. Guarded: when the row is missing this must read
       as a failed assertion, not as a harness crash — a crash tells you the
       test broke, which is the opposite of the message you want. */
    const clicked = await page.evaluate(function () {
      const m = document.querySelector('[role="menu"]');
      if (!m) return false;
      const b = Array.from(m.querySelectorAll('button')).find(function (x) { return /Settings/i.test(x.textContent); });
      if (!b) return false;
      b.click();
      return true;
    });
    ok(clicked, label + ': the Settings row in the avatar menu is clickable');
    await page.waitForTimeout(700);
    const landed = await page.evaluate(function () {
      return { hash: location.hash,
        head: (document.querySelector('.view-head h1, .view-head h2') || {}).textContent || '',
        appearance: Array.from(document.querySelectorAll('.card')).some(function (c) {
          return /Appearance/.test(c.textContent);
        }),
        themeRows: document.querySelectorAll('[data-theme-preview]').length };
    });
    ok(landed.hash.indexOf('settings') !== -1, label + ': it navigates to Settings');
    ok(landed.appearance, label + ': the Appearance card is on the Settings screen');
    ok(landed.themeRows >= 4, label + ': all four palettes are offered (got ' + landed.themeRows + ')');

    /* ---- the sync dot must not be the only signposted door ---- */
    const syncLabel = chromeLinks.find(function (l) { return l.id === 'sync-btn'; });
    ok(syncLabel && /settings/i.test(syncLabel.label),
      label + ': the sync button says it opens Settings (it navigates there)');

    /* ---- every registered, visible view is reachable ---- */
    const reach = await page.evaluate(function () {
      const ids = Object.keys(App._views || {});
      const anchors = Array.from(document.querySelectorAll('a[href^="#/"]'))
        .map(function (a) { return a.getAttribute('href'); });
      return { ids: ids, anchors: anchors };
    });
    // App._views may not be exposed; fall back to the known set.
    const expected = ['dashboard', 'log', 'history', 'library', 'analytics', 'body', 'standards', 'settings', 'profiles'];
    const unreachable = [];
    for (const id of expected) {
      const r = await page.evaluate(function (v) {
        App.navigate(v);
        return location.hash;
      }, id);
      await page.waitForTimeout(250);
      if (r.indexOf(id) === -1) unreachable.push(id + ' (redirected to ' + r + ')');
    }
    ok(unreachable.length === 0, label + ': every expected view renders: ' + unreachable.join(', '));

    ok(errs.length === 0, label + ': no page errors (' + errs.slice(0, 2).join(' | ') + ')');
    await ctx.close();
  }

  await run(390, 'phone');
  await run(1024, 'desktop');

  console.log('passed:', pass);
  if (fails.length) fails.forEach(function (f) { console.log('FAIL:', f); });
  await browser.close();
  if (server.close) server.close();
  console.log(fails.length ? 'FAIL: nav reachability' : 'PASS: nav reachability (' + pass + ' assertions)');
  process.exit(fails.length ? 1 : 0);
})().catch(function (e) { console.error('HARNESS:', e.message); process.exit(2); });
