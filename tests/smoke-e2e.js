// IronLog e2e smoke: loads the app over http, seeds demo data, walks every view,
// exercises the core logging flow, captures console/page errors and screenshots.
const P = require('./lib/paths');
const { chromium } = P.playwright();
const { serve } = require('./lib/hport');   // ephemeral, root-verified port
const path = require('path');
const fs = require('fs');

const ROOT = P.GYM;
const OUT = path.join(__dirname, 'shots');
let PORT = 0;   // assigned by hport.serve() — never hardcoded
const MOBILE = process.argv.includes('--mobile');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve(ROOT);
  PORT = server.port;

  const errors = [];
  const browser = await chromium.launch({ executablePath: P.chromiumPath() });
  const ctx = await browser.newContext({
    viewport: MOBILE ? { width: 390, height: 844 } : { width: 1366, height: 900 },
    deviceScaleFactor: 2,
    hasTouch: MOBILE,
    serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  page.on('requestfailed', r => {
    if (!r.url().includes('favicon')) errors.push('[requestfailed] ' + r.url() + ' ' + r.failure().errorText);
  });
  page.on('dialog', d => d.accept());

  const shot = async (name) => {
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, `${MOBILE ? 'm-' : 'd-'}${name}.png`) });
    console.log('shot:', name, '| errors so far:', errors.length);
  };
  const step = async (name, fn) => {
    try { await fn(); } catch (e) { errors.push('[step:' + name + '] ' + e.message.split('\n')[0]); }
    await shot(name);
  };

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await shot('00-onboarding');

  await step('01-dashboard', async () => {
    const demoBtn = page.locator('button', { hasText: /demo/i }).first();
    if (await demoBtn.count()) await demoBtn.click();
    else await page.evaluate(() => { Store.seedDemo(); App.navigate('dashboard'); });
    await page.waitForTimeout(800);
  });

  for (const v of ['history', 'templates', 'library', 'analytics', 'body', 'leaderboard', 'settings', 'profiles']) {
    await step('10-' + v, async () => {
      await page.evaluate(id => App.navigate(id), v);
      await page.waitForTimeout(450);
    });
  }

  // Core flow: start an empty workout, add an exercise, log a set, finish.
  await step('20-log-start', async () => {
    await page.evaluate(() => App.navigate('log'));
    await page.waitForTimeout(400);
  });
  await step('21-log-active', async () => {
    await page.locator('button', { hasText: /start empty/i }).first().click();
    await page.waitForTimeout(400);
  });
  await step('22-picker', async () => {
    await page.locator('button', { hasText: /add exercise/i }).first().click();
    await page.waitForTimeout(400);
    const search = page.locator('.sheet input, .modal input').first();
    await search.fill('bench press');
    await page.waitForTimeout(400);
  });
  await step('23-picked', async () => {
    await page.locator('.sheet .list-row, .modal .list-row, .sheet button', { hasText: /barbell bench press/i }).first().click();
    await page.waitForTimeout(300);
    const commit = page.locator('.sheet button, .modal button', { hasText: /add|done/i }).last();
    if (await commit.count()) await commit.click().catch(() => {});
    await page.waitForTimeout(400);
  });
  await step('24-set-entry', async () => {
    const weight = page.locator('.set-row input').first();
    await weight.fill('135');
    const reps = page.locator('.set-row input').nth(1);
    await reps.fill('8');
    const check = page.locator('.set-row button').last();
    await check.click();
    await page.waitForTimeout(400);
  });
  await step('25-finish', async () => {
    await page.locator('button', { hasText: /finish/i }).first().click();
    await page.waitForTimeout(500);
    const save = page.locator('button', { hasText: /save workout/i }).first();
    if (await save.count()) await save.click();
    await page.waitForTimeout(600);
  });

  // Library detail + profile switching
  await step('30-exercise-detail', async () => {
    await page.evaluate(() => App.navigate('library'));
    await page.waitForTimeout(400);
    await page.locator('.list-row', { hasText: /deadlift/i }).first().click();
    await page.waitForTimeout(500);
  });
  await step('31-switch-user', async () => {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const u = Store.state.users[1];
      Store.setCurrentUser(u.id);
      App.navigate('dashboard');
    });
    await page.waitForTimeout(500);
  });

  // ---- P1 flows ----
  await step('40-perf-dashboard', async () => {
    await page.evaluate(() => {
      const erfan = Store.state.users.find(u => u.name === 'Erfan');
      Store.setCurrentUser(erfan.id);
      App.navigate('dashboard');
    });
    await page.waitForTimeout(600);
  });
  await step('41-cardio-logger', async () => {
    await page.evaluate(() => App.navigate('log'));
    await page.waitForTimeout(400);
    const clicked = await page.evaluate(() => {
      const els = [...document.querySelectorAll('button, .chip')];
      const el = els.find(e => /\brun\b/i.test(e.textContent)) || els.find(e => /cardio/i.test(e.textContent));
      if (el) { el.click(); return el.textContent.trim(); }
      return null;
    });
    if (!clicked) errors.push('[41] no Run/Cardio chip found');
    await page.waitForTimeout(400);
  });
  await step('42-cardio-save', async () => {
    const dist = page.locator('input[inputmode], input[type=number]').first();
    await dist.fill('5');
    const dur = page.locator('input[inputmode], input[type=number]').nth(1);
    await dur.fill('26');
    const save = page.locator('button', { hasText: /save/i }).last();
    await save.click();
    await page.waitForTimeout(600);
  });
  await step('43-ruck-logger', async () => {
    await page.evaluate(() => App.navigate('log'));
    await page.waitForTimeout(400);
    const rc = await page.evaluate(() => {
      const els = [...document.querySelectorAll('button, .chip')];
      const el = els.find(e => /\bruck\b/i.test(e.textContent));
      if (el) { el.click(); return true; }
      return false;
    });
    if (!rc) errors.push('[43] no Ruck chip found');
    await page.waitForTimeout(500);
  });
  await step('44-pain-log', async () => {
    await page.evaluate(() => App.navigate('dashboard'));
    await page.waitForTimeout(400);
    const ng = await page.evaluate(() => {
      const els = [...document.querySelectorAll('button, .card, .card button')];
      const el = els.find(e => /niggle|pain/i.test(e.textContent) && e.textContent.length < 200);
      if (el) { el.click(); return el.textContent.trim().slice(0, 40); }
      return null;
    });
    if (!ng) errors.push('[44] no pain/niggle card found on perf dashboard');
    await page.waitForTimeout(500);
  });
  await step('45-simple-mode-clean', async () => {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const leak = await page.evaluate(() => {
      const amu = Store.state.users.find(u => u.name === 'Amu Reza');
      Store.setCurrentUser(amu.id);
      App.navigate('dashboard');
      return new Promise(r => setTimeout(() => {
        const txt = document.body.innerText.toLowerCase();
        r(['niggle', 'selection', 'ramp'].filter(w => txt.includes(w)));
      }, 500));
    });
    if (leak.length) errors.push('[perf-leak] simple mode shows: ' + leak.join(','));
  });
  await step('46-settings-training', async () => {
    await page.evaluate(() => App.navigate('settings'));
    await page.waitForTimeout(400);
  });

  // ---- P2 flows: standards view ----
  await step('50-standards-view', async () => {
    const ok = await page.evaluate(() => {
      const erfan = Store.state.users.find(u => u.name === 'Erfan');
      Store.setCurrentUser(erfan.id);
      App.navigate('standards');
      return new Promise(r => setTimeout(() => {
        const txt = document.body.innerText;
        r({
          scorecard: /2-mile run|Pull-ups|Ruck/i.test(txt),
          record: /record a test/i.test(txt),
        });
      }, 600));
    });
    if (!ok.scorecard) errors.push('[50] readiness scorecard not rendered');
    if (!ok.record) errors.push('[50] Record a test button missing');
  });
  await step('51-test-wizard-picker', async () => {
    await page.locator('[data-act="record"]').first().click();
    await page.waitForTimeout(500);
    const hasPicker = await page.evaluate(() =>
      /pull|push|plank|acft/i.test((document.querySelector('.sheet') || {}).innerText || ''));
    if (!hasPicker) errors.push('[51] protocol picker sheet did not open');
  });
  await step('52-record-reps-test', async () => {
    const saved = await page.evaluate(() => {
      const sheet = document.querySelector('.sheet');
      const rows = [...sheet.querySelectorAll('button, .list-row')];
      const el = rows.find(e => /pull-?ups?\s*\(max\)|pull-?ups?\b/i.test(e.textContent));
      if (!el) return 'no-pullups-row';
      el.click();
      return 'clicked';
    });
    if (saved !== 'clicked') errors.push('[52] ' + saved);
    await page.waitForTimeout(500);
    const input = page.locator('.sheet #sf-value');
    await input.fill('12');
    const before = await page.evaluate(() =>
      Store.workoutsFor(Store.currentUser().id).filter(w => w.kind === 'test').length);
    await page.locator('.sheet button', { hasText: /save/i }).last().click();
    await page.waitForTimeout(700);
    const after = await page.evaluate(() =>
      Store.workoutsFor(Store.currentUser().id).filter(w => w.kind === 'test').length);
    if (after !== before + 1) errors.push('[52] test workout not saved (' + before + '->' + after + ')');
  });
  await step('53-acft-live-score', async () => {
    await page.evaluate(() => App.navigate('standards'));
    await page.waitForTimeout(400);
    await page.locator('[data-act="record"]').first().click();
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      const sheet = document.querySelector('.sheet');
      const rows = [...sheet.querySelectorAll('button, .list-row')];
      const el = rows.find(e => /acft/i.test(e.textContent));
      if (el) el.click();
    });
    await page.waitForTimeout(500);
    const inputs = page.locator('.sheet input[data-af]');
    const n = await inputs.count();
    if (n < 6) { errors.push('[53] acft form has ' + n + ' event inputs'); return; }
    const modes = await page.evaluate(() =>
      [...document.querySelectorAll('.sheet input[data-af]')].map(el => el.dataset.af + ':' + el.dataset.mode));
    const byEvent = { mdl: '250', spt: '9', hrp: '40', sdc: '1:45', plk: '2:30', tmr: '15:00' };
    for (let i = 0; i < 6; i++) {
      const ev = modes[i].split(':')[0];
      await inputs.nth(i).fill(byEvent[ev] || '10');
    }
    await page.waitForTimeout(400);
    const live = await page.evaluate(() =>
      /\d{2,3}\s*(pts|points)|total/i.test((document.querySelector('.sheet') || {}).innerText || ''));
    if (!live) errors.push('[53] no live ACFT total visible');
    await page.locator('.sheet button', { hasText: /save/i }).last().click();
    await page.waitForTimeout(700);
    const scored = await page.evaluate(() => {
      const tests = Store.workoutsFor(Store.currentUser().id).filter(w => w.kind === 'test');
      const acft = tests.map(w => w.entries[0]).find(e => e && e.protocol === 'acft');
      return acft ? (typeof acft.score === 'number' ? 'scored:' + acft.score : 'unscored') : 'missing';
    });
    if (!/^scored:/.test(scored)) errors.push('[53] acft entry ' + scored);
  });
  await step('54-standards-simple-gate', async () => {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const gate = await page.evaluate(() => {
      const amu = Store.state.users.find(u => u.name === 'Amu Reza');
      Store.setCurrentUser(amu.id);
      App.navigate('standards');
      return new Promise(r => setTimeout(() => {
        const navHasStandards = [...document.querySelectorAll('nav a, nav button, .sidebar a, .sidebar button, .tabbar button')]
          .some(e => /standards/i.test(e.textContent));
        r({ view: App.currentView || (location.hash || ''), navHasStandards,
            onDash: /muscle recovery|last workout/i.test(document.body.innerText) });
      }, 600));
    });
    if (gate.navHasStandards) errors.push('[54] Standards nav visible in simple mode');
    if (!gate.onDash) errors.push('[54] simple-mode navigate(standards) did not land on dashboard');
  });
  await step('55-dashboard-readiness-card', async () => {
    const card = await page.evaluate(() => {
      const erfan = Store.state.users.find(u => u.name === 'Erfan');
      Store.setCurrentUser(erfan.id);
      App.navigate('dashboard');
      return new Promise(r => setTimeout(() => {
        const txt = document.body.innerText;
        r({ readiness: /readiness/i.test(txt), phase: /base|build|peak|taper/i.test(txt) });
      }, 700));
    });
    if (!card.readiness) errors.push('[55] readiness snapshot card missing on perf dashboard');
    if (!card.phase) errors.push('[55] phase label missing');
  });

  const sanity = await page.evaluate(() => ({
    users: Store.state.users.length,
    workouts: Store.state.workouts.length,
    exercises: ExerciseDB.all().length,
    currentUser: Store.currentUser() && Store.currentUser().name,
    activeDraft: !!localStorage.getItem('ironlog/activeWorkout'),
  }));
  console.log('sanity:', JSON.stringify(sanity));

  console.log('\n=== ERRORS (' + errors.length + ') ===');
  [...new Set(errors)].slice(0, 50).forEach(e => console.log(e));

  await browser.close();
  server.kill();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILURE:', e); process.exit(2); });
