// The update prompt, driven through a REAL service-worker lifecycle: serve a
// copy of the app, load it, change the bytes on disk (a "deploy"), ask the
// registration to check, and assert the user is told — then that taking the
// update actually lands them on the new build.
//
// Stubbing navigator.serviceWorker would test the bar and nothing that
// matters. The whole defect lived in the lifecycle.
const P = require('./lib/paths');
const { chromium } = P.playwright();
const http = require('http');
const fs = require('fs');
const path = require('path');

const SRC = P.GYM;
const ROOT = '/tmp/sw-update-fixture';

function copyTree(from, to) {
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true });
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

function serveNoStore(root) {
  // no-store on everything: the BROWSER HTTP cache must not stand in for the
  // service-worker cache, or this test would measure the wrong layer.
  const server = http.createServer(function (req, res) {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const abs = path.join(root, p);
    if (!abs.startsWith(root) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
      res.writeHead(404); res.end('nope'); return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(abs)] || 'application/octet-stream',
      'cache-control': 'no-store, must-revalidate'
    });
    res.end(fs.readFileSync(abs));
  });
  return new Promise(function (resolve) {
    server.listen(0, '127.0.0.1', function () { resolve(server); });
  });
}

(async () => {
  copyTree(SRC, ROOT);
  const server = await serveNoStore(ROOT);
  const port = server.address().port;
  const base = 'http://127.0.0.1:' + port + '/';

  let pass = 0; const fails = [];
  function ok(c, m) { if (c) pass++; else fails.push(m); }
  function eq(a, b, m) { ok(a === b, m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
  async function waitForBar(ms) {
    try {
      return await page.waitForFunction(function () {
        return !!document.querySelector('.update-bar');
      }, null, { timeout: ms || 20000, polling: 200 });
    } catch (e) {
      const st = await page.evaluate(function () {
        return navigator.serviceWorker.getRegistration().then(function (r) {
          return { url: location.href, navs: 'n/a',
            installing: r && r.installing ? r.installing.state : null,
            waiting: r && r.waiting ? r.waiting.state : null,
            active: r && r.active ? r.active.state : null,
            controller: !!navigator.serviceWorker.controller,
            barInDom: !!document.querySelector('.update-bar'),
            bodyKids: document.body.children.length };
        });
      }).catch(function (x) { return { evalFailed: String(x.message).slice(0, 80) }; });
      console.log('WAITBAR FAILED, state=' + JSON.stringify(st) + ' navs=' + navs.length);
      throw e;
    }
  }

  const browser = await chromium.launch({ executablePath: P.chromiumPath() });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', function (e) { errs.push(e.message); });
  const navs = [];
  // Document loads, not framenavigated: App.navigate() is a same-document
  // hash change and must not read as a reload.
  page.on('load', function () { navs.push(Date.now()); });

  /* ---------- first load: install, and stay quiet ---------- */
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForFunction(function () {
    return navigator.serviceWorker && navigator.serviceWorker.controller;
  }, null, { timeout: 20000 }).catch(function () {});
  await page.waitForTimeout(1500);

  const firstInstall = await page.evaluate(function () {
    return { controlled: !!navigator.serviceWorker.controller,
      bar: !!document.querySelector('.update-bar') };
  });
  ok(firstInstall.controlled, 'the service worker installs and controls the page');
  ok(!firstInstall.bar, 'FIRST install shows no update bar — there is nothing to update from');
  /* The first install claims the page, which fires controllerchange. Reloading
     on that is a spurious refresh in every new user's first seconds, and it
     reads as a crash. Exactly one navigation so far: the original goto. */
  eq(navs.length, 1, 'the first install does NOT reload the page');

  const v1 = await page.evaluate(function () { return window.__BUILD_MARK || null; });

  /* ---------- version visibility: the page can ASK what is running ---------- */
  const verInstalled = await page.evaluate(function () { return App.installedVersion(); });
  ok(typeof verInstalled === 'string' && verInstalled.indexOf('ironlog-') === 0,
    'the RUNNING worker answers GET_VERSION (' + verInstalled + ')');
  const verLatest = await page.evaluate(function () { return App.latestVersion(); });
  eq(verLatest, verInstalled, 'before a deploy, installed and latest agree');
  const verCard = await page.evaluate(function () {
    Store.seedDemo();
    Store.setCurrentUser(Store.state.users[0].id);
    App.navigate('settings');
    return new Promise(function (resolve) {
      setTimeout(function () {
        resolve({
          hasCard: !!document.querySelector('#ver-installed'),
          hasBtn: !!document.querySelector('#ver-check')
        });
      }, 800);
    });
  });
  ok(verCard.hasCard && verCard.hasBtn, 'Settings shows the App version card with a check button');
  await page.waitForFunction(function () {
    const el = document.querySelector('#ver-installed');
    return el && el.textContent.indexOf('ironlog-') === 0;
  }, null, { timeout: 8000 });
  const shown = await page.evaluate(function () {
    return { installed: document.querySelector('#ver-installed').textContent,
      verdict: document.querySelector('#ver-verdict').textContent };
  });
  eq(shown.installed, verInstalled, 'the card shows the real running version');
  ok(/latest version/i.test(shown.verdict), 'and says you are current when you are');
  await page.evaluate(function () { App.navigate('dashboard'); });
  await page.waitForTimeout(400);

  /* ---------- deploy: change a shell file and the cache name ---------- */
  const swPath = path.join(ROOT, 'sw.js');
  fs.writeFileSync(swPath, fs.readFileSync(swPath, 'utf8')
    .replace(/const CACHE_NAME = '[^']+'/, "const CACHE_NAME = 'ironlog-TEST-NEXT'"));
  const appPath = path.join(ROOT, 'js', 'app.js');
  fs.writeFileSync(appPath, fs.readFileSync(appPath, 'utf8') +
    '\nwindow.__BUILD_MARK = "v2";\n');

  /* the app asks on foreground; simulate returning to it */
  await page.evaluate(function () {
    return navigator.serviceWorker.getRegistration().then(function (r) { return r.update(); });
  });

  await page.waitForTimeout(1500);

  /* Source-pinned, not behavioral, and honestly so: the fixture server sends
     no-store on everything (it must — the browser HTTP cache would otherwise
     stand in for the SW cache), which makes it impossible to reproduce the
     production CDN's max-age=600 here. The defense against THAT layer is the
     no-store on the request itself. */
  const appSrc = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  ok(/fetch\('\.\/sw\.js',\s*\{\s*cache:\s*'no-store'/.test(appSrc),
    "latestVersion carries cache:'no-store' — GitHub Pages caches sw.js for 10 minutes");

  const latestAfterDeploy = await page.evaluate(function () { return App.latestVersion(); });
  eq(latestAfterDeploy, 'ironlog-TEST-NEXT',
    'after a deploy, latestVersion reads the NEW build past every cache');

  await waitForBar();
  const offered = await page.evaluate(function () {
    const b = document.querySelector('.update-bar');
    return { text: b.textContent.replace(/\s+/g, ' ').trim(),
      hasUpdate: !!b.querySelector('[data-act="update"]'),
      hasLater: !!b.querySelector('[data-act="later"]') };
  });
  ok(offered.text.indexOf('New version') !== -1, 'a waiting worker produces a visible offer');
  ok(offered.hasUpdate && offered.hasLater, 'the offer can be taken or dismissed');

  /* the old build is STILL running — no silent swap */
  const stillOld = await page.evaluate(function () { return window.__BUILD_MARK || null; });
  eq(stillOld, v1, 'the running page is untouched until the user accepts (no mixed-version state)');

  const swState = await page.evaluate(function () {
    return navigator.serviceWorker.getRegistration().then(function (r) {
      return { waiting: !!r.waiting, active: !!r.active };
    });
  });
  ok(swState.waiting, 'the new worker WAITS rather than activating behind the user');

  /* ---------- Later dismisses without updating ---------- */
  await page.click('.update-bar [data-act="later"]');
  await page.waitForTimeout(300);
  const afterLater = await page.evaluate(function () {
    return { bar: !!document.querySelector('.update-bar'), mark: window.__BUILD_MARK || null };
  });
  ok(!afterLater.bar, '"Later" dismisses the bar');
  eq(afterLater.mark, v1, '"Later" does not update anything');

  /* ---------- "Later" must not be forever ----------
     A dismissed update has to come back, or one stray tap strands the user on
     the old build. Coming back to the app is what a person actually does, so
     that is what re-offers: a foreground, NOT another update() call (there is
     nothing newer to find — the worker is already waiting). */
  await page.evaluate(function () {
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await waitForBar(15000);
  ok(true, 'a dismissed update is offered again when the app is foregrounded');

  /* ---------- take the update: it must actually land ---------- */
  await page.click('.update-bar [data-act="update"]');

  // The page reloads on controllerchange; wait for the NEW build's marker.
  await page.waitForFunction(function () {
    return window.__BUILD_MARK === 'v2';
  }, null, { timeout: 25000 });

  const landed = await page.evaluate(function () {
    return navigator.serviceWorker.getRegistration().then(function (r) {
      return { mark: window.__BUILD_MARK, waiting: !!r.waiting,
        bar: !!document.querySelector('.update-bar') };
    });
  });
  eq(landed.mark, 'v2', 'accepting the update actually lands the user on the new build');
  ok(!landed.waiting, 'no worker is left waiting after the handover');
  ok(!landed.bar, 'the bar is gone once the update is applied');

  const cacheState = await page.evaluate(function () {
    return caches.keys();
  });
  ok(cacheState.indexOf('ironlog-TEST-NEXT') !== -1, 'the new cache is in place');
  ok(cacheState.length === 1, 'old caches were cleaned up (got ' + JSON.stringify(cacheState) + ')');

  /* ---------- no reload loop ---------- */
  const navsAfter = navs.length;
  await page.waitForTimeout(3000);
  ok(navs.length === navsAfter,
    'no reload loop after the update settles (' + (navs.length - navsAfter) + ' further navigations)');
  eq(navs.length, 2, 'exactly two navigations all run: the initial load, and the accepted update');

  ok(errs.length === 0, 'no page errors: ' + errs.slice(0, 3).join(' | '));

  console.log('passed:', pass);
  if (fails.length) fails.forEach(function (f) { console.log('FAIL:', f); });
  await browser.close();
  server.close();
  fs.rmSync(ROOT, { recursive: true, force: true });
  console.log(fails.length ? 'FAIL: sw update e2e' : 'PASS: sw update e2e (' + pass + ' assertions)');
  process.exit(fails.length ? 1 : 0);
})().catch(function (e) { console.error('HARNESS:', e.message); process.exit(2); });
