// A brand-new install: no profiles, no workouts, no settings, no history.
// Every view must render something useful and nothing must throw. This is the
// first thing a new family member sees, and it is the state least exercised
// during development because the demo seed hides it.
const P = require('./lib/paths');
const { chromium } = P.playwright();
const { serve } = require('./lib/hport');

const VIEWS = ['dashboard', 'log', 'history', 'library', 'analytics', 'body', 'leaderboard', 'settings', 'profiles'];

(async () => {
  const server = await serve(P.GYM);
  let pass = 0; const fails = [];
  function ok(c, m) { if (c) pass++; else fails.push(m); }

  const browser = await chromium.launch({ executablePath: P.chromiumPath() });

  async function run(label, setup) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', function (e) { errs.push(e.message); });
    page.on('console', function (m) { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
    await page.goto('http://127.0.0.1:' + server.port + '/', { waitUntil: 'load' });
    await page.waitForTimeout(900);
    if (setup) { await page.evaluate(setup); await page.waitForTimeout(500); }

    for (const v of VIEWS) {
      const r = await page.evaluate(function (view) {
        App.navigate(view);
        return null;
      }, v).then(function () { return null; }).catch(function (e) { return e.message; });
      await page.waitForTimeout(300);
      const state = await page.evaluate(function () {
        const main = document.querySelector('main') || document.body;
        const txt = (main.innerText || '').trim();
        return { hash: location.hash, chars: txt.length, blank: txt.length < 12,
          sample: txt.slice(0, 60).replace(/\s+/g, ' ') };
      });
      ok(!r, label + '/' + v + ': navigate did not throw (' + r + ')');
      ok(!state.blank, label + '/' + v + ': renders content, not a blank screen (' +
        state.chars + ' chars: "' + state.sample + '")');
    }

    // The primary action must work from nothing.
    const canStart = await page.evaluate(function () {
      const fab = document.querySelector('.fab-log, #fab-log, [data-act="fab"]');
      return !!fab;
    });
    ok(canStart, label + ': the log button exists');

    ok(errs.length === 0, label + ': no errors — ' + errs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // 1. Truly cold: nothing in storage at all.
  await run('cold', function () {
    try { localStorage.clear(); } catch (e) {}
    Store.load();
    App.rerender();
  });

  // 2. One profile, zero workouts — the state right after "create profile".
  await run('new profile', function () {
    try { localStorage.clear(); } catch (e) {}
    Store.load();
    const u = Store.addUser({ name: 'Dana' });
    Store.setCurrentUser(u.id);
    App.rerender();
  });

  // 3. Same, but performance mode on — every intelligence surface with no data
  //    to be intelligent about.
  await run('new profile, performance', function () {
    try { localStorage.clear(); } catch (e) {}
    Store.load();
    const u = Store.addUser({ name: 'Dana' });
    Store.setCurrentUser(u.id);
    Store.updateUser(u.id, { settings: Object.assign({}, u.settings, { trainingProfile: 'performance' }),
      goals: { preset: 'sfas', selectionDate: '2027-06-01' } });
    App.rerender();
  });

  // 4. Exactly one workout — the "first session" state, where averages and
  //    ratios have a denominator of one.
  await run('one workout', function () {
    try { localStorage.clear(); } catch (e) {}
    Store.load();
    const u = Store.addUser({ name: 'Dana' });
    Store.setCurrentUser(u.id);
    Store.updateUser(u.id, { settings: Object.assign({}, u.settings, { trainingProfile: 'performance' }) });
    Store.addWorkout({ userId: u.id, date: U.todayStr(), kind: 'lift',
      entries: [{ exerciseId: 'back_squat', sets: [{ weightKg: 60, reps: 5 }] }] });
    App.rerender();
  });

  console.log('passed:', pass);
  if (fails.length) fails.forEach(function (f) { console.log('FAIL:', f); });
  await browser.close();
  if (server.close) server.close();
  console.log(fails.length ? 'FAIL: cold start' : 'PASS: cold start (' + pass + ' assertions)');
  process.exit(fails.length ? 1 : 0);
})().catch(function (e) { console.error('HARNESS:', e.message); process.exit(2); });
