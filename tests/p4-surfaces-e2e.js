/* P4 surfaces e2e: TODAY strip, recovery strip, green-week chip and the
   analytics Performance section render for a PERFORMANCE user with seeded
   data, and are completely absent for a SIMPLE user.
   Run: node p4-surfaces-e2e.js [--mobile] */
const P = require('./lib/paths');
const { chromium } = P.playwright();
const { serve } = require('./lib/hport');   // ephemeral, root-verified port
const path = require('path');
const fs = require('fs');

const ROOT = P.GYM;
const OUT = path.join(__dirname, 'shots');
let PORT = 0;   // assigned by hport.serve() — never hardcoded
const MOBILE = process.argv.includes('--mobile');

let pass = 0;
const failures = [];
function ok(cond, name) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { failures.push(name); console.error('  FAIL ' + name); }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve(ROOT);
  PORT = server.port;

  const errors = [];
  const browser = await chromium.launch({
    executablePath: P.chromiumPath()
  });
  const ctx = await browser.newContext({
    viewport: MOBILE ? { width: 390, height: 844 } : { width: 1366, height: 900 },
    deviceScaleFactor: 1,
    hasTouch: MOBILE,
    serviceWorkers: 'block'
  });
  const page = await ctx.newPage();
  page.on('console', function (m) { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
  page.on('pageerror', function (e) { errors.push('[pageerror] ' + e.message); });

  const shot = async function (name) {
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(OUT, (MOBILE ? 'm-' : 'd-') + 'p4-' + name + '.png'), fullPage: true });
  };

  await page.goto('http://127.0.0.1:' + PORT + '/', { waitUntil: 'load' });

  // Seed demo data (Erfan = performance user, others simple).
  await page.evaluate(function () { Store.seedDemo(); });
  await page.waitForTimeout(400);

  // loadmodel.js is not in index.html yet (release wiring is owned elsewhere);
  // inject it so the surfaces can be exercised, and report which path we took.
  const hadLoadModel = await page.evaluate(function () { return typeof window.LoadModel !== 'undefined'; });
  if (!hadLoadModel) {
    await page.addScriptTag({ path: path.join(ROOT, 'js/loadmodel.js') });
  }
  console.log(hadLoadModel ? 'LoadModel: loaded by index.html' : 'LoadModel: INJECTED by the probe (index.html tag missing)');
  ok(await page.evaluate(function () { return typeof window.LoadModel === 'object'; }), 'LoadModel available');

  /* ---- seed P4 signals for the performance user ---- */
  const seeded = await page.evaluate(function () {
    const perfUser = Store.state.users.filter(function (u) {
      return u.settings && u.settings.trainingProfile === 'performance';
    })[0];
    const simpleUser = Store.state.users.filter(function (u) {
      return !u.settings || u.settings.trainingProfile !== 'performance';
    })[0];
    const today = U.todayStr();
    const rows = [];
    // 28 days of sleep, and a resting-HR spike on the two most recent days
    for (let i = 27; i >= 0; i--) {
      const d = U.addDays(today, -i);
      rows.push({ userId: perfUser.id, date: d, kind: 'sleepHours', value: i < 7 ? 6.4 : 7.6 });
      if (i >= 2) rows.push({ userId: perfUser.id, date: d, kind: 'restingHR', value: 56 });
    }
    rows.push({ userId: perfUser.id, date: U.addDays(today, -1), kind: 'restingHR', value: 64 });
    rows.push({ userId: perfUser.id, date: today, kind: 'restingHR', value: 65 });
    Store.addHealthSamples(rows);
    // a hard ruck block this week so at least one ACWR chip has a zone
    for (let k = 0; k < 3; k++) {
      Store.addWorkout({
        userId: perfUser.id,
        date: U.addDays(today, -k),
        name: 'Ruck',
        kind: 'ruck',
        durationMin: 100,
        entries: [{
          id: U.uid('en'), type: 'cardio', mode: 'ruck', distanceKm: 12 + k,
          durationMin: 100, loadKgTotal: 20, effort: 'hard'
        }]
      });
    }
    // benchmark efforts: two recorded 2-mile tests + one logged 5-mile run
    Store.addWorkout({
      userId: perfUser.id, date: U.addDays(today, -30), name: '2-mile test', kind: 'test', durationMin: 15,
      entries: [{ id: U.uid('en'), type: 'test', protocol: 'run2mi', results: { value: 852 } }]
    });
    Store.addWorkout({
      userId: perfUser.id, date: U.addDays(today, -10), name: '2-mile test', kind: 'test', durationMin: 15,
      entries: [{ id: U.uid('en'), type: 'test', protocol: 'run2mi', results: { value: 828 } }]
    });
    Store.addWorkout({
      userId: perfUser.id, date: U.addDays(today, -16), name: 'Five miler', kind: 'run', durationMin: 41,
      entries: [{ id: U.uid('en'), type: 'cardio', mode: 'run', distanceKm: 8.05, durationMin: 41, effort: 'hard' }]
    });
    Store.setCurrentUser(perfUser.id);
    return { perfId: perfUser.id, perfName: perfUser.name, simpleId: simpleUser.id, simpleName: simpleUser.name };
  });
  console.log('perf user: ' + seeded.perfName + ' | simple user: ' + seeded.simpleName);

  /* ================= performance user: dashboard ================= */
  await page.evaluate(function () { App.navigate('dashboard'); });
  await page.waitForTimeout(500);
  await shot('perf-dashboard');

  const dash = await page.evaluate(function () {
    const v = document.querySelector('.view') || document.body;
    const strip = v.querySelector('[data-p4="today"]');
    const rec = v.querySelector('[data-p4="recovery"]');
    const gw = v.querySelector('[data-p4="greenweek"]');
    const chips = Array.from(v.querySelectorAll('[data-p4="today"] .p4-chip'));
    return {
      html: v.innerHTML,
      text: v.textContent,
      hasStrip: !!strip,
      stripText: strip ? strip.textContent : '',
      headline: strip ? (strip.querySelector('.p4-headline') || {}).textContent || '' : '',
      chips: chips.map(function (c) {
        return { zone: c.getAttribute('data-zone'), text: c.textContent.trim(), style: c.getAttribute('style') || '' };
      }),
      advisory: strip && strip.querySelector('.p4-advisory') ? strip.querySelector('.p4-advisory').textContent : '',
      hasRecovery: !!rec,
      recoveryText: rec ? rec.textContent : '',
      recoverySpark: !!(rec && rec.querySelector('[data-slot="p4-hr-spark"] svg')),
      hasGreenWeek: !!gw,
      greenWeekText: gw ? gw.textContent : '',
      hasStreakTile: v.textContent.indexOf('Current streak') !== -1,
      weeklyWarnings: Array.from(v.querySelectorAll('.card')).filter(function (c) {
        return c.textContent.indexOf('Weekly status') === 0;
      }).map(function (c) { return c.textContent; })
    };
  });

  ok(dash.hasStrip, 'perf dashboard: TODAY strip renders');
  ok(dash.headline.trim().length > 10, 'perf dashboard: strip carries a headline');
  ok(dash.chips.length >= 2, 'perf dashboard: per-modality ACWR chips render (' + dash.chips.length + ')');
  ok(dash.chips.every(function (c) { return c.zone && c.zone !== 'null'; }),
    'perf dashboard: every chip carries a zone attribute');
  ok(dash.chips.some(function (c) { return /--zone:var\(--s[1-6]\)/.test(c.style); }),
    'perf dashboard: chips are zone-colored from the CVD-safe series tokens');
  ok(dash.chips.some(function (c) { return /steady|ramping|winding down|building base/.test(c.text); }),
    'perf dashboard: chips name the zone in words, not colour alone');
  ok(/Resting HR \d+ bpm/.test(dash.advisory) && /easy/.test(dash.advisory),
    'perf dashboard: resting-HR spike appends the easy-day advisory');
  ok(dash.hasRecovery, 'perf dashboard: recovery strip renders');
  ok(/Resting HR/.test(dash.recoveryText) && /bpm/.test(dash.recoveryText),
    'recovery strip: resting HR with baseline');
  ok(/28-day baseline/.test(dash.recoveryText), 'recovery strip: 28-day baseline line');
  ok(dash.recoverySpark, 'recovery strip: HR sparkline mounted');
  ok(/Sleep \(7-day\)/.test(dash.recoveryText) && /28-day 7/.test(dash.recoveryText),
    'recovery strip: sleep 7d vs 28d');
  ok(/Open niggles/.test(dash.recoveryText), 'recovery strip: open pain count');
  ok(/Rest day/.test(dash.recoveryText), 'recovery strip: rest-day status');
  ok(dash.hasGreenWeek, 'perf dashboard: green-week chip present');
  ok(!dash.hasStreakTile, 'perf dashboard: streak flame tile replaced');
  ok(dash.html.indexOf('NaN') === -1 && dash.html.indexOf('undefined') === -1,
    'perf dashboard: no NaN/undefined in markup');

  /* ================= performance user: analytics ================= */
  await page.evaluate(function () { App.navigate('analytics'); });
  await page.waitForTimeout(600);
  await shot('perf-analytics');

  const ana = await page.evaluate(function () {
    const v = document.querySelector('.view') || document.body;
    const sec = v.querySelector('[data-p4="perf-analytics"]');
    function slotSvg(name) {
      const el = v.querySelector('[data-slot="' + name + '"]');
      return !!(el && el.querySelector('svg'));
    }
    return {
      html: v.innerHTML,
      hasSection: !!sec,
      text: sec ? sec.textContent : '',
      split: slotSvg('p4-split'),
      economy: slotSvg('p4-economy'),
      bench: slotSvg('p4-bench'),
      load: slotSvg('p4-load'),
      modButtons: Array.from(v.querySelectorAll('[data-seg-key="loadMod"]')).map(function (b) {
        return b.getAttribute('data-seg-val');
      })
    };
  });

  ok(ana.hasSection, 'perf analytics: Performance section renders');
  ok(/Easy vs hard weeks/.test(ana.text), 'perf analytics: easy/hard split card');
  ok(/Ruck economy/.test(ana.text), 'perf analytics: ruck economy card');
  ok(/Benchmark pace/.test(ana.text), 'perf analytics: benchmark trends card');
  ok(/Weekly load/.test(ana.text), 'perf analytics: per-modality load card');
  ok(ana.split, 'perf analytics: easy/hard stacked bars drew an SVG');
  ok(ana.economy, 'perf analytics: ruck economy scatter drew an SVG');
  ok(ana.bench, 'perf analytics: benchmark trend chart drew an SVG');
  ok(ana.load, 'perf analytics: weekly load bars drew an SVG');
  ok(JSON.stringify(ana.modButtons) === JSON.stringify(['run', 'ruck', 'lift', 'other']),
    'perf analytics: modality selector offers all four modalities');
  ok(ana.html.indexOf('NaN') === -1 && ana.html.indexOf('undefined') === -1,
    'perf analytics: no NaN/undefined in markup');

  // switching modality re-renders the load chart
  await page.click('[data-seg-key="loadMod"][data-seg-val="lift"]');
  await page.waitForTimeout(450);
  const liftLoad = await page.evaluate(function () {
    const v = document.querySelector('.view');
    const cap = Array.from(v.querySelectorAll('.p4-cap')).filter(function (p) {
      return p.textContent.indexOf('load per week') !== -1;
    })[0];
    return {
      caption: cap ? cap.textContent : '',
      svg: !!v.querySelector('[data-slot="p4-load"] svg')
    };
  });
  ok(/^Lift load per week/.test(liftLoad.caption) && liftLoad.svg,
    'perf analytics: modality switch redraws the load chart');
  await shot('perf-analytics-lift');

  /* ---- every view still renders cleanly with LoadModel present ---- */
  const views = ['dashboard', 'history', 'templates', 'library', 'body',
    'leaderboard', 'standards', 'settings', 'profiles'];
  for (const v of views) {
    await page.evaluate(function (id) { App.navigate(id); }, v);
    await page.waitForTimeout(320);
    const clean = await page.evaluate(function () {
      const el = document.querySelector('.view') || document.body;
      return el.innerHTML.indexOf('NaN') === -1 && el.innerHTML.length > 40;
    });
    ok(clean, 'view renders clean with LoadModel loaded: ' + v);
  }

  /* ================= simple user: everything absent ================= */
  await page.evaluate(function (id) { Store.setCurrentUser(id); App.navigate('dashboard'); }, seeded.simpleId);
  await page.waitForTimeout(500);
  await shot('simple-dashboard');

  const simpleDash = await page.evaluate(function () {
    const v = document.querySelector('.view') || document.body;
    return {
      html: v.innerHTML,
      p4Nodes: v.querySelectorAll('[data-p4]').length,
      chips: v.querySelectorAll('.p4-chip').length,
      hasStreakTile: v.textContent.indexOf('Current streak') !== -1,
      mentionsToday: /4-week|ramping|Recovery|Resting HR|Green week/.test(v.textContent)
    };
  });
  ok(simpleDash.p4Nodes === 0, 'simple dashboard: no P4 nodes at all');
  ok(simpleDash.chips === 0, 'simple dashboard: no ACWR chips');
  ok(simpleDash.hasStreakTile, 'simple dashboard: streak flame tile intact');
  ok(!simpleDash.mentionsToday, 'simple dashboard: no P4 copy leaks');

  await page.evaluate(function () { App.navigate('analytics'); });
  await page.waitForTimeout(600);
  await shot('simple-analytics');
  const simpleAna = await page.evaluate(function () {
    const v = document.querySelector('.view') || document.body;
    return {
      p4Nodes: v.querySelectorAll('[data-p4]').length,
      text: v.textContent,
      html: v.innerHTML
    };
  });
  ok(simpleAna.p4Nodes === 0, 'simple analytics: no Performance section');
  ok(!/Ruck economy|Benchmark pace|Weekly load|Easy vs hard/.test(simpleAna.text),
    'simple analytics: no P4 cards');
  ok(simpleAna.html.indexOf('NaN') === -1 && simpleAna.html.indexOf('undefined') === -1,
    'simple analytics: clean markup');

  /* ---- degradation: performance user without LoadModel ---- */
  await page.evaluate(function (id) {
    window.__savedLM = window.LoadModel;
    delete window.LoadModel;
    Store.setCurrentUser(id);
    App.navigate('dashboard');
  }, seeded.perfId);
  await page.waitForTimeout(500);
  const degraded = await page.evaluate(function () {
    const v = document.querySelector('.view') || document.body;
    return {
      p4Nodes: v.querySelectorAll('[data-p4="today"], [data-p4="greenweek"]').length,
      hasRecovery: !!v.querySelector('[data-p4="recovery"]'),
      recoveryText: (v.querySelector('[data-p4="recovery"]') || {}).textContent || '',
      hasStreakTile: v.textContent.indexOf('Current streak') !== -1,
      html: v.innerHTML
    };
  });
  await page.evaluate(function () { App.navigate('analytics'); });
  await page.waitForTimeout(500);
  const degradedAna = await page.evaluate(function () {
    const v = document.querySelector('.view') || document.body;
    const out = { p4Nodes: v.querySelectorAll('[data-p4]').length, html: v.innerHTML };
    window.LoadModel = window.__savedLM;
    delete window.__savedLM;
    return out;
  });
  await shot('degraded-dashboard');
  ok(degraded.p4Nodes === 0, 'no LoadModel: TODAY strip and green-week chip stay away');
  ok(degraded.hasStreakTile, 'no LoadModel: streak tile falls back in');
  ok(degraded.hasRecovery && /Resting HR/.test(degraded.recoveryText),
    'no LoadModel: recovery strip still renders (degraded)');
  ok(degradedAna.p4Nodes === 0, 'no LoadModel: analytics Performance section absent');
  ok(degraded.html.indexOf('NaN') === -1 && degradedAna.html.indexOf('NaN') === -1,
    'no LoadModel: no NaN anywhere');

  ok(errors.length === 0, 'no console/page errors (' + errors.join(' | ') + ')');

  await browser.close();
  server.kill();

  console.log('\n' + pass + ' passed, ' + failures.length + ' failed');
  if (failures.length) {
    console.error('Failed: ' + failures.join(' | '));
    process.exit(1);
  }
})().catch(function (e) {
  console.error(e);
  process.exit(1);
});
