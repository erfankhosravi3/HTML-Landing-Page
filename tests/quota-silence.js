// What does a full localStorage actually cost the user?
//
// Store.save() swallows QuotaExceededError to keep the in-memory app alive.
// That is a defensible choice — but only if the user is TOLD. Otherwise they
// log a session, see it on screen, close the app, and it is gone. This checks
// what actually happens, and whether anything anywhere says so.
const P = require('./lib/paths');
const { chromium } = P.playwright();
const { serve } = require('./lib/hport');

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
  await page.waitForTimeout(900);

  const r = await page.evaluate(function () {
    Store.load();
    const u = Store.addUser({ name: 'Erfan' });
    Store.setCurrentUser(u.id);
    Store.addWorkout({ userId: u.id, date: U.todayStr(), kind: 'lift',
      entries: [{ exerciseId: 'back_squat', sets: [{ weightKg: 100, reps: 5 }] }] });
    const persistedBefore = String(localStorage.getItem('ironlog/v1') || '');
    const beforeCount = (persistedBefore.match(/"kind":"lift"/g) || []).length;

    // Storage is now full. Everything after this point cannot be persisted.
    const realSet = localStorage.setItem.bind(localStorage);
    let blocked = 0;
    localStorage.setItem = function (k, v) {
      if (k === 'ironlog/v1') {
        blocked++;
        const err = new Error('QuotaExceededError');
        err.name = 'QuotaExceededError';
        throw err;
      }
      return realSet(k, v);
    };

    let toasted = null;
    const realToast = App.toast;
    App.toast = function (msg, kind) { toasted = String(msg) + ' [' + kind + ']'; return realToast.apply(App, arguments); };

    // The user logs a second session and sees it appear.
    Store.addWorkout({ userId: u.id, date: U.todayStr(), kind: 'cardio',
      entries: [{ type: 'cardio', mode: 'run', durationMin: 40, distanceKm: 8 }] });

    const inMemory = Store.workoutsFor(u.id).length;
    const persistedAfter = String(localStorage.getItem('ironlog/v1') || '');
    const afterCount = (persistedAfter.match(/"kind":"(lift|cardio)"/g) || []).length;

    localStorage.setItem = realSet;
    App.toast = realToast;

    return { blocked: blocked, inMemory: inMemory, persistedBefore: beforeCount,
      persistedAfter: afterCount, toasted: toasted,
      bodyMentionsProblem: /storage|space|full|could not save|couldn't save/i.test(document.body.innerText) };
  });

  ok(r.blocked > 0, 'the quota failure was actually triggered');
  ok(r.inMemory === 2, 'the app shows both workouts on screen (' + r.inMemory + ')');
  ok(r.persistedAfter === r.persistedBefore,
    'DIAGNOSIS: the second workout never reached storage (persisted ' +
    r.persistedBefore + ' -> ' + r.persistedAfter + ')');

  // The finding: screen and disk disagree, and nothing tells the user.
  const silent = !r.toasted && !r.bodyMentionsProblem;
  console.log('toast shown:', JSON.stringify(r.toasted));
  console.log('any on-screen mention of a storage problem:', r.bodyMentionsProblem);
  ok(!silent, 'the user is TOLD the save failed (banner or on-screen notice)');

  /* The banner must also tell them the ONE thing that still works. */
  const banner = await page.evaluate(function () {
    const b = document.querySelector('.storage-bar');
    if (!b) return null;
    return { text: b.innerText.replace(/\s+/g, ' '),
      hasExport: !!b.querySelector('[data-act="sb-export"]'),
      dismissable: !!b.querySelector('[data-act="later"], [data-act="dismiss"], .close') };
  });
  ok(!!banner, 'a storage banner is rendered');
  ok(banner && /not being saved|not saved/i.test(banner.text),
    'it says plainly that changes are NOT being saved');
  ok(banner && banner.hasExport, 'it offers the export, which still works from memory');
  ok(banner && !banner.dismissable,
    'it cannot be dismissed — dismissing restores the silence that made this dangerous');

  /* Export must genuinely succeed while storage is refusing writes. */
  const exportWorks = await page.evaluate(function () {
    try {
      /* Identify the workout by what it CONTAINS, not by a kind we assumed:
         addWorkout derives `kind` from the entries, so a cardio workout whose
         entry is a run is stored as 'run'. Asserting on a guessed kind tests
         the guess, not the app. */
      const j = JSON.parse(Store.exportJSON());
      return (j.workouts || []).some(function (w) {
        return (w.entries || []).some(function (e) {
          return e.type === 'cardio' && e.mode === 'run' && e.durationMin === 40;
        });
      });
    } catch (e) { return false; }
  });
  ok(exportWorks, 'the emergency export contains the unsaved workout');

  /* And it clears once storage recovers. */
  const cleared = await page.evaluate(function () {
    Store.reportSaveFailure(false);
    return !document.querySelector('.storage-bar');
  });
  ok(cleared, 'the banner clears when saving recovers');

  ok(errs.length === 0, 'no page errors');

  console.log('passed:', pass);
  if (fails.length) fails.forEach(function (f) { console.log('FAIL:', f); });
  await browser.close();
  if (server.close) server.close();
  process.exit(fails.length ? 1 : 0);
})().catch(function (e) { console.error('HARNESS:', e.message); process.exit(2); });
