// IronLog P4.5 — ONE LIVE SESSION: the acceptance harness.
//
// Covers the binding acceptance tests 2, 5, 7 and 8 of the P4.5 addendum in a
// real browser, against the real app (no mocks, no stubs), driving real DOM:
//
//   AT2  CONCURRENT EDIT — with set 2 RUNNING: edit set 3's target, add a set,
//        delete a different exercise, reorder. The timer must keep running,
//        stay bound to set 2 (by _sid, not index), and record set 2's ACTUAL
//        seconds.
//   AT5  BUILDER<->FOCUS toggle mid-timer in BOTH directions preserves the
//        timer, the cursor and the edits; editing from inside focus writes
//        through to the one draft.
//   AT7  SIMPLE-MODE LEAK SWEEP — no pace UI anywhere, and the lift flow is
//        byte-identical to the P4 baseline (served side by side and diffed).
//   AT8  A stale P3.5 'ironlog/activeSession' is discarded without breaking
//        boot, and the ONE draft still resumes.
//
// Short targets throughout (2s rests; the concurrently-edited hold is finished
// early on purpose — that IS the actual-seconds assertion).
const P = require('./lib/paths');
const { chromium } = P.playwright();
const { serve: hserve, assertTreeIsRev } = require('./lib/hport');   // ephemeral, root-verified ports
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const fs = require('fs');

const ROOT = P.GYM;
/* The pristine P4 tree this suite byte-diffs against. Rebuilt from git into
   /tmp on demand rather than committed: a second copy of the whole app in the
   repo would be dead weight, and — worse — a checked-in baseline drifts. Git
   is the only thing that can prove a tree IS a revision. */
const BASE_REV = '408b22f';
const BASE_ROOT = path.join(os.tmpdir(), 'ironlog-baseline-' + BASE_REV, 'gym');

function buildBaseline() {
  const parent = path.dirname(BASE_ROOT);
  fs.rmSync(parent, { recursive: true, force: true });
  fs.mkdirSync(parent, { recursive: true });
  execFileSync('bash', ['-c', 'cd ' + JSON.stringify(P.REPO) + ' && git archive ' + BASE_REV +
    ' gym | tar -x -C ' + JSON.stringify(parent)]);
}
const OUT = path.join(__dirname, 'shots');
let PORT = 0;
let BASE_PORT = 0;

const results = [];   // {test, name, ok, detail}
let currentTest = '-';
function check(name, cond, detail) {
  results.push({ test: currentTest, name: name, ok: !!cond, detail: cond ? '' : String(detail === undefined ? '' : detail).slice(0, 400) });
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (cond ? '' : '  <- ' + String(detail === undefined ? '' : detail).slice(0, 400)));
}
function fatal(name, e) {
  results.push({ test: currentTest, name: name, ok: false, detail: 'THREW: ' + (e && e.message ? e.message.split('\n')[0] : e) });
  console.log('  FAIL ' + name + '  <- THREW: ' + (e && e.message ? e.message.split('\n')[0] : e));
}

// ports come from the OS (hport.js): a stale http.server on a hardcoded port
// used to shadow the tree under test and silently invalidate the byte-diff
function serve(root) { return hserve(root); }

// strip volatile bits so a structural diff of two trees is meaningful
function stable(s) {
  return String(s)
    .replace(/(en|w|u|cx|s|rt|dev)_[a-z0-9]{6,}/g, '$1_ID')
    .replace(/\b1[0-9]{12}\b/g, 'TS')
    .replace(/\d{4}-\d{2}-\d{2}/g, 'DATE')
    .replace(/\b\d+:\d{2}\b/g, 'CLOCK');
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  if (!fs.existsSync(BASE_ROOT)) {
    try { buildBaseline(); }
    catch (e) {
      console.log('COULD NOT BUILD BASELINE from git ' + BASE_REV + ': ' + e.message);
      process.exit(2);
    }
  }
  // the baseline must BE P4, not something that drifted in
  try { assertTreeIsRev(BASE_ROOT, BASE_REV); }
  catch (e) { console.log('BASELINE CHECK FAILED: ' + e.message); process.exit(2); }
  console.log('baseline verified: ' + BASE_ROOT + ' === git ' + BASE_REV + ' gym/');
  const server = await serve(ROOT);
  const baseServer = await serve(BASE_ROOT);
  PORT = server.port;
  BASE_PORT = baseServer.port;

  const browser = await chromium.launch({ executablePath: P.chromiumPath() });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));

  const shot = async (n) => { await page.waitForTimeout(150); await page.screenshot({ path: path.join(OUT, 'p45-' + n + '.png') }); };
  const draftOf = () => page.evaluate(() => JSON.parse(localStorage.getItem('ironlog/activeWorkout') || 'null'));
  const timerState = () => page.evaluate(() => window.ViewsLog.Session.state());
  const pillLabel = () => page.evaluate(() => {
    const el = document.querySelector('.sess-pill .sess-sub .l');
    return el ? el.textContent.trim() : null;
  });
  const clearDraft = async () => {
    await page.evaluate(() => {
      try { window.ViewsLog.Session.cancel(); } catch (e) { /* no timer */ }
      try { Player.closeFocus({ navigate: false }); } catch (e) { /* not open */ }
      localStorage.removeItem('ironlog/activeWorkout');
      App.navigate('log');
      App.rerender();
    });
    await page.waitForTimeout(300);
  };
  // click a modal/sheet confirm button if one is up (delentry asks when a set has data)
  const confirmIfAsked = async (re) => {
    await page.waitForTimeout(250);
    const btn = page.locator('.modal button, .sheet button', { hasText: re || /^(remove|discard|delete)$/i }).last();
    if (await btn.count()) { await btn.click().catch(() => {}); await page.waitForTimeout(300); }
  };

  await page.goto('http://127.0.0.1:' + PORT + '/', { waitUntil: 'load' });
  await page.waitForTimeout(400);

  /* ================================================================
     Setup: demo data, Erfan (performance mode)
     ================================================================ */
  currentTest = 'setup';
  console.log('\n--- setup ---');
  try {
    await page.evaluate(() => { Store.seedDemo(); });
    await page.waitForTimeout(700);
    const uid = await page.evaluate(() => {
      const erfan = Store.state.users.find(u => u.name === 'Erfan');
      Store.setCurrentUser(erfan.id);
      localStorage.removeItem('ironlog/activeWorkout');
      localStorage.removeItem('ironlog/activeSession');
      App.navigate('log');
      return { id: erfan.id, mode: erfan.settings.trainingProfile, pace: erfan.settings.pace };
    });
    check('demo seeded, Erfan is a performance user', uid.mode === 'performance', uid.mode);
    check('settings.pace defaults table reached the user record',
      uid.pace && uid.pace.lift === 'off' && uid.pace.durability === 'set' && uid.pace.circuit === 'session',
      JSON.stringify(uid.pace));
  } catch (e) { fatal('setup', e); }

  /* ================================================================
     ACCEPTANCE 2 — CONCURRENT EDIT (the user's core requirement)
     ================================================================ */
  currentTest = 'AT2 concurrent edit';
  console.log('\n--- ACCEPTANCE 2: concurrent edit while a set is running ---');
  try {
    // A durability routine: 3 exercises, the first with 3 sets of a 12s hold.
    const ids = await page.evaluate(() => {
      const u = Store.currentUser();
      const r = Store.addRoutine({
        userId: u.id, name: 'P45 Concurrent', kind: 'durability', restSec: 2,
        items: [
          { exerciseId: 'dead_hang', sets: 3, targetHoldSec: 12 },
          { exerciseId: 'plank', sets: 2, targetHoldSec: 8 },
          { exerciseId: 'wall_sit', sets: 1, targetHoldSec: 8 }
        ]
      });
      localStorage.removeItem('ironlog/activeWorkout');
      Player.start(r, { view: 'builder' });
      const d = JSON.parse(localStorage.getItem('ironlog/activeWorkout'));
      return {
        routineId: r.id,
        entries: d.entries.map(en => ({ id: en.id, ref: en.exerciseRef, sids: en.sets.map(s => s._sid) }))
      };
    });
    await page.waitForTimeout(500);
    check('routine seeded ONE session record with 3 entries', ids.entries.length === 3, JSON.stringify(ids.entries.length));
    const E1 = ids.entries[0], E2 = ids.entries[1], E3 = ids.entries[2];
    check('every set carries a draft-local _sid', ids.entries.every(e => e.sids.every(Boolean)));
    const sid2 = E1.sids[1], sid3 = E1.sids[2];

    // --- start SET 2 by tapping its number in the builder (real DOM) ---
    await page.locator('.set-row[data-sid="' + sid2 + '"] [data-act="sw-run"]').click();
    await page.waitForTimeout(1300);
    let st = await timerState();
    check('tapping set 2\'s number runs exactly that set',
      st && st.kind === 'work' && st.entryId === E1.id && st.sid === sid2, JSON.stringify(st));
    check('the running pill names set 2', /set 2 of 3/.test(await pillLabel() || ''), await pillLabel());
    const elapsedAtStart = st.elapsedSec;
    await shot('at2-01-set2-running');

    // --- edit 1: set 3's TARGET, while set 2 runs ---
    await page.locator('.set-row[data-sid="' + sid3 + '"] input[data-act="sw-hold"]').fill('0:25');
    await page.waitForTimeout(350);
    st = await timerState();
    let d = await draftOf();
    check('EDIT set 3 target: the timer keeps running',
      st && st.entryId === E1.id && st.sid === sid2, JSON.stringify(st));
    check('EDIT set 3 target: the running set was NOT retargeted',
      st && st.targetSec === 12, st && st.targetSec);
    check('EDIT set 3 target: the edit landed in the one draft',
      d.entries[0].sets[2].holdSec === 25, d.entries[0].sets[2].holdSec);
    // "un-recorded" now means literally un-recorded: the 12s PRESCRIPTION rides
    // on _tHoldSec and holdSec stays absent until the set is actually held.
    // (This assertion used to demand holdSec === 12 — i.e. it demanded the
    // phantom-write defect: a plan sitting in an observation field.)
    check('EDIT set 3 target: set 2 is still un-recorded and pending',
      d.entries[0].sets[1].done !== true && !((d.entries[0].sets[1].holdSec || 0) > 0) &&
      d.entries[0].sets[1]._tHoldSec === 12,
      JSON.stringify(d.entries[0].sets[1]));

    // --- edit 2: ADD A SET to the running entry ---
    await page.locator('[data-eid="' + E1.id + '"] [data-act="addset"]').click();
    await page.waitForTimeout(350);
    st = await timerState();
    d = await draftOf();
    check('ADD SET: a 4th set exists', (d.entries[0].sets || []).length === 4, (d.entries[0].sets || []).length);
    check('ADD SET: the timer keeps running, still bound to set 2',
      st && st.entryId === E1.id && st.sid === sid2, JSON.stringify(st));
    check('ADD SET: the pill re-counts without losing the binding',
      /set 2 of 4/.test(await pillLabel() || ''), await pillLabel());

    // --- edit 3: DELETE A DIFFERENT EXERCISE (wall sit) ---
    await page.locator('[data-eid="' + E3.id + '"] [data-act="delentry"]').click();
    await confirmIfAsked(/^remove$/i);
    await page.waitForTimeout(350);
    st = await timerState();
    d = await draftOf();
    check('DELETE other exercise: it is gone from the draft',
      d.entries.length === 2 && !d.entries.some(e => e.id === E3.id), d.entries.length);
    check('DELETE other exercise: the timer keeps running, still bound to set 2',
      st && st.entryId === E1.id && st.sid === sid2, JSON.stringify(st));

    // --- edit 4: REORDER around the running set ---
    const how = await page.evaluate((eid) => {
      const card = document.querySelector('[data-eid="' + eid + '"]');
      const mv = card && card.querySelector('[data-act="mvdn"], [data-act="movedown"], [data-mv="down"]');
      if (mv) { mv.click(); return 'dom'; }
      Player.Session.moveEntry(eid, 1);   // the production reorder path
      return 'api';
    }, E1.id);
    await page.waitForTimeout(400);
    st = await timerState();
    d = await draftOf();
    check('REORDER: the running entry actually moved (' + how + ')',
      d.entries[0].id === E2.id && d.entries[1].id === E1.id,
      d.entries.map(e => e.id).join(','));
    check('REORDER: the binding is by _sid, so the timer follows',
      st && st.entryId === E1.id && st.sid === sid2, JSON.stringify(st));
    check('REORDER: the clock never restarted', st && st.elapsedSec >= elapsedAtStart, st && st.elapsedSec);
    await shot('at2-02-after-four-edits');

    // --- finish set 2 EARLY through the pill: ACTUAL seconds, never the target ---
    const before = (await timerState()).elapsedSec;
    await page.locator('.sess-pill [data-s="done"]').click();
    await page.waitForTimeout(400);
    st = await timerState();
    d = await draftOf();
    const s2 = d.entries.find(e => e.id === E1.id).sets[1];
    check('the running set finished and the slot is free', st === null, JSON.stringify(st));
    check('set 2 is marked done', s2.done === true, JSON.stringify(s2));
    check('set 2 recorded its ACTUAL seconds (' + s2.holdSec + 's), not the 12s target',
      s2.holdSec >= 2 && s2.holdSec < 12 && Math.abs(s2.holdSec - before) <= 2,
      'holdSec=' + s2.holdSec + ' elapsedAtTap=' + before);
    const e1 = d.entries.find(e => e.id === E1.id);
    check('the concurrent edits all survived the recording',
      e1.sets.length === 4 && e1.sets[2].holdSec === 25 && e1.sets[0].done !== true &&
      d.entries.length === 2,
      JSON.stringify(e1.sets.map(s => ({ h: s.holdSec, d: !!s.done }))));
    check('no shadow session was written at any point',
      (await page.evaluate(() => localStorage.getItem('ironlog/activeSession'))) === null);
  } catch (e) { fatal('AT2 harness step', e); }

  /* ================================================================
     ACCEPTANCE 5 — builder <-> focus, both directions, mid-timer
     ================================================================ */
  currentTest = 'AT5 builder<->focus';
  console.log('\n--- ACCEPTANCE 5: builder <-> focus mid-timer, both directions ---');
  try {
    await clearDraft();
    const ids = await page.evaluate(() => {
      const u = Store.currentUser();
      const r = Store.addRoutine({
        userId: u.id, name: 'P45 Toggle', kind: 'durability', restSec: 2,
        items: [
          { exerciseId: 'dead_hang', sets: 2, targetHoldSec: 40 },
          { exerciseId: 'plank', sets: 1, targetHoldSec: 8 }
        ]
      });
      Player.start(r, { view: 'builder' });
      const d = JSON.parse(localStorage.getItem('ironlog/activeWorkout'));
      return { entries: d.entries.map(en => ({ id: en.id, sids: en.sets.map(s => s._sid) })) };
    });
    await page.waitForTimeout(500);
    const A = ids.entries[0], B = ids.entries[1];
    const sidA1 = A.sids[0];

    await page.locator('.set-row[data-sid="' + sidA1 + '"] [data-act="sw-run"]').click();
    await page.waitForTimeout(1400);
    let st = await timerState();
    check('a set is running in the builder', st && st.sid === sidA1, JSON.stringify(st));
    const cursorBefore = JSON.stringify((await draftOf())._active);
    const elapsedInBuilder = st.elapsedSec;

    // --- direction 1: builder -> focus (one tap, real button) ---
    await page.locator('#lg-focus').click();
    await page.waitForTimeout(700);
    st = await timerState();
    let d = await draftOf();
    check('builder -> focus: the overlay opened', (await page.locator('.player-overlay').count()) > 0);
    check('builder -> focus: draft._view is focus (same record, other presentation)', d._view === 'focus', d._view);
    check('builder -> focus: the timer survived, same binding',
      st && st.sid === sidA1 && st.entryId === A.id, JSON.stringify(st));
    check('builder -> focus: the clock kept counting up', st && st.elapsedSec >= elapsedInBuilder,
      st && st.elapsedSec + ' vs ' + elapsedInBuilder);
    check('builder -> focus: the cursor is preserved', JSON.stringify(d._active) === cursorBefore,
      JSON.stringify(d._active) + ' vs ' + cursorBefore);
    check('builder -> focus: app chrome is hidden',
      (await page.evaluate(() => document.getElementById('topbar').style.display)) === 'none');
    await shot('at5-01-focus-midtimer');

    // --- editing FROM INSIDE focus writes through to the draft ---
    const sidA2 = A.sids[1];
    const peeked = await page.evaluate((sid) => {
      const b = document.querySelector('.player-overlay [data-peek="' + sid + '"]');
      if (!b) return false;
      b.click();
      return true;
    }, sidA2);
    check('focus exposes a tap-a-set strip for the other sets', peeked);
    if (peeked) {
      await page.waitForTimeout(450);
      const hold = page.locator('.sheet #pf-hold');
      if (await hold.count()) {
        await hold.fill('0:33');
        await page.locator('.sheet button', { hasText: /^save$/i }).last().click();
        await page.waitForTimeout(450);
      }
      st = await timerState();
      d = await draftOf();
      const target = d.entries.find(e => e.id === A.id).sets[1];
      check('edit FROM FOCUS wrote through to the one draft', target.holdSec === 33, JSON.stringify(target));
      check('edit FROM FOCUS never interrupted the running timer',
        st && st.sid === sidA1 && st.entryId === A.id, JSON.stringify(st));
    }
    await shot('at5-02-focus-edit');

    // --- direction 2: focus -> builder (one tap, real button) ---
    const elapsedInFocus = (await timerState()).elapsedSec;
    await page.locator('.player-overlay [data-p="builder"]').click();
    await page.waitForTimeout(700);
    st = await timerState();
    d = await draftOf();
    check('focus -> builder: the overlay closed', (await page.locator('.player-overlay').count()) === 0);
    check('focus -> builder: chrome is back',
      (await page.evaluate(() => document.getElementById('topbar').style.display)) !== 'none');
    check('focus -> builder: draft._view is builder', d._view === 'builder', d._view);
    check('focus -> builder: the timer STILL runs, same binding',
      st && st.sid === sidA1 && st.entryId === A.id, JSON.stringify(st));
    check('focus -> builder: the clock kept counting up', st && st.elapsedSec >= elapsedInFocus,
      st && st.elapsedSec + ' vs ' + elapsedInFocus);
    check('focus -> builder: the cursor is preserved', JSON.stringify(d._active) === cursorBefore,
      JSON.stringify(d._active));
    check('focus -> builder: the focus edit is visible in the builder DOM',
      (await page.evaluate((sid) => {
        const i = document.querySelector('.set-row[data-sid="' + sid + '"] input[data-act="sw-hold"]');
        return i ? i.value : null;
      }, sidA2)) === '0:33');
    check('focus -> builder: the running row is still the pill\'s subject',
      /set 1 of 2/.test(await pillLabel() || ''), await pillLabel());
    await shot('at5-03-back-in-builder');

    // finish it early once more — holdSec is ACTUAL in this direction too
    const tapAt = (await timerState()).elapsedSec;
    await page.locator('.sess-pill [data-s="done"]').click();
    await page.waitForTimeout(400);
    const rec = (await draftOf()).entries.find(e => e.id === A.id).sets[0];
    check('a set started in the builder and finished after two toggles records ACTUAL seconds',
      rec.done === true && rec.holdSec >= 2 && rec.holdSec < 40 && Math.abs(rec.holdSec - tapAt) <= 2,
      'holdSec=' + rec.holdSec + ' tapAt=' + tapAt);
    check('the other entry was untouched by all of it',
      (await draftOf()).entries.some(e => e.id === B.id));
  } catch (e) { fatal('AT5 harness step', e); }

  /* ================================================================
     ACCEPTANCE 8 — a stale P3.5 shadow session is discarded on boot
     ================================================================ */
  currentTest = 'AT8 stale activeSession';
  console.log('\n--- ACCEPTANCE 8: stale P3.5 ironlog/activeSession discarded on boot ---');
  try {
    // leave a real-shaped P3.5 record behind, plus a live draft that MUST survive
    await page.evaluate(() => {
      localStorage.setItem('ironlog/activeSession', JSON.stringify({
        v: 1, userId: Store.currentUser().id, name: 'Durability B',
        routineRef: 'rt_legacy', stepIdx: 4, startedAt: Date.now() - 300000,
        compiled: { steps: [{ type: 'work', shape: 'hold', exerciseId: 'dead_hang', setIdx: 0, targetSec: 45 }] },
        actuals: [{ exerciseId: 'dead_hang', holdSec: 41 }]
      }));
    });
    const errBefore = errors.length;
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(900);
    const boot = await page.evaluate(() => ({
      legacy: localStorage.getItem('ironlog/activeSession'),
      draft: localStorage.getItem('ironlog/activeWorkout'),
      modal: (document.querySelector('.modal-backdrop') || {}).innerText || '',
      content: (document.getElementById('content') || {}).childElementCount || 0
    }));
    check('the stale shadow session is GONE after boot', boot.legacy === null, boot.legacy);
    check('no P3.5 resume modal appears', !/guided session in progress/i.test(boot.modal), boot.modal);
    check('boot completed and rendered a view', boot.content > 0, boot.content);
    check('boot produced no console/page errors', errors.length === errBefore, errors.slice(errBefore).join(' | '));
    check('the ONE session record (the draft) survived the reload', !!boot.draft);

    await page.evaluate(() => App.navigate('log'));
    await page.waitForTimeout(600);
    const resumed = await page.evaluate(() => ({
      cards: document.querySelectorAll('#lg-entries [data-eid]').length,
      recorded: (JSON.parse(localStorage.getItem('ironlog/activeWorkout')).entries[0].sets || [])
        .filter(s => s.done).length,
      sids: JSON.parse(localStorage.getItem('ironlog/activeWorkout')).entries
        .every(en => (en.sets || []).every(s => !!s._sid))
    }));
    check('the draft resume flow covers the guided session (builder rendered it)', resumed.cards > 0, resumed.cards);
    check('recorded work survived the reload', resumed.recorded >= 1, resumed.recorded);
    check('_sid survived the reload, so timers can re-bind', resumed.sids === true);

    // legacy key must not come back, and the API refuses to resurrect it
    const api = await page.evaluate(() => {
      localStorage.setItem('ironlog/activeSession', '{"v":1}');
      const pending = Player.resumePending();
      const resumedOk = Player.resume();
      return { pending: pending, resumedOk: resumedOk, left: localStorage.getItem('ironlog/activeSession') };
    });
    check('Player.resumePending() never resurrects a shadow session', api.pending === null, JSON.stringify(api.pending));
    check('Player.resume() refuses', api.resumedOk === false, api.resumedOk);
    check('touching the legacy API also cleans the key', api.left === null, api.left);
    await shot('at8-01-after-boot');
  } catch (e) { fatal('AT8 harness step', e); }

  /* ================================================================
     ACCEPTANCE 7 — simple-mode leak sweep + lift flow byte-identical
     ================================================================ */
  currentTest = 'AT7 simple-mode';
  console.log('\n--- ACCEPTANCE 7: simple-mode leak sweep + lift byte-diff ---');
  try {
    await clearDraft();
    await page.evaluate(() => {
      const amu = Store.state.users.find(u => u.name === 'Amu Reza');
      Store.setCurrentUser(amu.id);
      localStorage.removeItem('ironlog/activeWorkout');
      App.navigate('log');
    });
    await page.waitForTimeout(500);
    const mode = await page.evaluate(() => Store.currentUser().settings.trainingProfile);
    check('Amu Reza is a simple-mode user', mode === 'simple', mode);

    const PACE_SEL = '#lg-pace, #lg-focus, .pace-chip, .pace-row, .pace-list, .pace-defaults, ' +
      '[data-act="pace"], [data-pace], .set-run, [data-act="sw-run"], [data-act="sw-timer"], ' +
      '.player-overlay, .sess-pill, [data-peek]';
    const sweep = async (where) => {
      const r = await page.evaluate((sel) => ({
        hits: [...document.querySelectorAll(sel)].map(e => e.id || e.className || e.tagName),
        txt: document.body.innerText
      }), PACE_SEL);
      check('no pace UI on ' + where, r.hits.length === 0, r.hits.join(','));
      check('no pace wording on ' + where,
        !/whole session|this exercise\b|hands-free|guided|cadence|metronome/i.test(r.txt),
        (r.txt.match(/whole session|this exercise\b|hands-free|guided|cadence|metronome/i) || [''])[0]);
    };

    // CONTROL: the sweep selector list must actually match something in
    // performance mode, or every "no pace UI" assertion below is vacuous.
    const control = await page.evaluate((sel) => {
      const erfan = Store.state.users.find(u => u.name === 'Erfan');
      Store.setCurrentUser(erfan.id);
      const r = Store.routinesFor(erfan.id).find(x => x.name === 'P45 Toggle') ||
        Store.routinesFor(erfan.id)[0];
      localStorage.removeItem('ironlog/activeWorkout');
      Player.start(r, { view: 'builder' });
      App.rerender();
      return document.querySelectorAll(sel).length;
    }, PACE_SEL);
    await page.waitForTimeout(400);
    const controlAfter = await page.evaluate((sel) => document.querySelectorAll(sel).length, PACE_SEL);
    check('CONTROL: the leak-sweep selectors DO match in performance mode',
      Math.max(control, controlAfter) > 0, 'perf hits=' + Math.max(control, controlAfter));
    await page.evaluate(() => {
      const amu = Store.state.users.find(u => u.name === 'Amu Reza');
      try { window.ViewsLog.Session.cancel(); } catch (e) { /* none */ }
      localStorage.removeItem('ironlog/activeWorkout');
      Store.setCurrentUser(amu.id);
      App.navigate('log');
      App.rerender();
    });
    await page.waitForTimeout(450);

    await sweep('the log start screen');
    // an ACTIVE lift draft is where the pace chip/focus button would live
    await page.locator('#lg-start').click();
    await page.waitForTimeout(400);
    await page.locator('#lg-addex').click();
    await page.waitForTimeout(500);
    await page.locator('.sheet input').first().fill('bench press');
    await page.waitForTimeout(500);
    await page.locator('.sheet .list-row button, .sheet .list-row').first().click();
    await page.waitForTimeout(300);
    const addBtn = page.locator('.sheet button', { hasText: /^add\b/i }).last();
    if (await addBtn.count()) await addBtn.click();
    await page.waitForTimeout(500);
    await sweep('an active simple-mode lift draft');
    await shot('at7-01-simple-draft');

    for (const v of ['templates', 'dashboard', 'settings', 'history']) {
      await page.evaluate((x) => App.navigate(x), v);
      await page.waitForTimeout(450);
      await sweep('the ' + v + ' view');
    }

    // the mode gate itself
    const refused = await page.evaluate(() => {
      const r = { name: 'x', kind: 'durability', restSec: 0, items: [{ exerciseId: 'dead_hang', sets: 1, targetHoldSec: 30 }] };
      const started = Player.start(r);
      const focus = Player.openFocus();
      return { started: started, focus: focus, overlay: !!document.querySelector('.player-overlay') };
    });
    check('Player.start refuses a simple-mode user', refused.started === false, refused.started);
    check('Player.openFocus refuses a simple-mode user', refused.focus === false, refused.focus);
    check('no overlay was created for a simple-mode user', refused.overlay === false);

    // ---- lift flow byte-identical vs the P4 baseline (both trees, same script) ----
    const liftFlow = async (p) => {
      await p.evaluate(() => {
        localStorage.clear();
        Store.load();
        const u = Store.addUser({ name: 'Lift', emoji: 'L', color: '#2ca350' });
        Store.setCurrentUser(u.id);
        App.navigate('log');
        App.rerender();
      });
      await p.waitForTimeout(400);
      const start = await p.evaluate(() => document.querySelector('.view').innerHTML);
      await p.locator('#lg-start').click();
      await p.waitForTimeout(400);
      await p.locator('#lg-addex').click();
      await p.waitForTimeout(500);
      await p.locator('.sheet input').first().fill('bench press');
      await p.waitForTimeout(500);
      await p.locator('.sheet .list-row').first().click();
      await p.waitForTimeout(300);
      const add = p.locator('.sheet button', { hasText: /^add\b/i }).last();
      if (await add.count()) await add.click();
      await p.waitForTimeout(500);
      await p.locator('.set-row input[data-act="w"]').first().fill('60');
      await p.locator('.set-row input[data-act="r"]').first().fill('8');
      await p.waitForTimeout(250);
      await p.locator('.set-row [data-act="check"]').first().click();
      await p.waitForTimeout(300);
      const draftHTML = await p.evaluate(() => document.querySelector('.view').innerHTML);
      const restPill = await p.evaluate(() => {
        const el = document.querySelector('.rest-timer');
        return el ? el.className + '|' + /\d+:\d\d/.test(el.textContent) : null;
      });
      await p.locator('#lg-finish').click();
      await p.waitForTimeout(500);
      const finishHTML = await p.evaluate(() => (document.querySelector('.sheet') || {}).innerHTML || '');
      await p.locator('.sheet button', { hasText: /save workout/i }).last().click();
      await p.waitForTimeout(600);
      const skip = p.locator('.sheet button', { hasText: /^skip$/i }).last();
      if (await skip.count()) await skip.click().catch(() => {});
      await p.waitForTimeout(400);
      const saved = await p.evaluate(() => JSON.stringify(Store.workoutsFor(Store.currentUser().id)[0]));
      return { start, draftHTML, restPill, finishHTML, saved };
    };

    const basePage = await ctx.newPage();
    await basePage.goto('http://127.0.0.1:' + BASE_PORT + '/', { waitUntil: 'load' });
    await basePage.waitForTimeout(400);
    const baseRun = await liftFlow(basePage);
    const headPage = await ctx.newPage();
    await headPage.goto('http://127.0.0.1:' + PORT + '/', { waitUntil: 'load' });
    await headPage.waitForTimeout(400);
    const headRun = await liftFlow(headPage);

    const diff = (k) => {
      const a = stable(baseRun[k]), b = stable(headRun[k]);
      if (a === b) return null;
      let i = 0; while (i < a.length && a[i] === b[i]) i++;
      return 'first delta @' + i + '\n  base: ' + a.slice(Math.max(0, i - 60), i + 120) +
        '\n  head: ' + b.slice(Math.max(0, i - 60), i + 120);
    };
    // CONTROL: the scripted flow must actually have logged a lift, or the
    // diffs below compare two identically-empty screens.
    const liftReal = (run) => {
      try {
        const w = JSON.parse(run.saved);
        const en = (w.entries || [])[0];
        // default units are lb, so the typed 60 lands as 60 lb == 27.2155 kg
        return !!(en && /bench/.test(en.exerciseId || '') && (en.sets || []).length &&
          Math.abs(en.sets[0].weightKg - 27.2155) < 0.01 && en.sets[0].reps === 8 &&
          en.sets[0].type === 'work');
      } catch (e) { return false; }
    };
    check('CONTROL: the baseline run really logged bench press 60 lb x 8', liftReal(baseRun), baseRun.saved);
    check('CONTROL: the head run really logged bench press 60 lb x 8', liftReal(headRun), headRun.saved);
    check('simple-mode lift START SCREEN byte-identical to the P4 baseline', diff('start') === null, diff('start'));
    check('simple-mode lift DRAFT (card, set rows, header) byte-identical', diff('draftHTML') === null, diff('draftHTML'));
    check('simple-mode advisory rest pill identical (same chrome, still a pill)',
      baseRun.restPill === headRun.restPill, baseRun.restPill + ' vs ' + headRun.restPill);
    check('simple-mode FINISH sheet byte-identical', diff('finishHTML') === null, diff('finishHTML'));
    check('the SAVED lift workout is byte-identical', diff('saved') === null, diff('saved'));
    await headPage.screenshot({ path: path.join(OUT, 'p45-at7-02-lift-head.png') });
    await basePage.screenshot({ path: path.join(OUT, 'p45-at7-03-lift-base.png') });
    await basePage.close();
    await headPage.close();
  } catch (e) { fatal('AT7 harness step', e); }

  /* ================================================================ */
  console.log('\n=== CONSOLE / PAGE ERRORS (' + errors.length + ') ===');
  [...new Set(errors)].slice(0, 25).forEach(e => console.log('  ' + e));

  console.log('\n=== ACCEPTANCE SUMMARY ===');
  const byTest = {};
  results.forEach(r => {
    byTest[r.test] = byTest[r.test] || { pass: 0, fail: 0, fails: [] };
    if (r.ok) byTest[r.test].pass++;
    else { byTest[r.test].fail++; byTest[r.test].fails.push(r.name + ' :: ' + r.detail); }
  });
  Object.keys(byTest).forEach(t => {
    const b = byTest[t];
    console.log((b.fail ? 'FAIL ' : 'PASS ') + t + '  (' + b.pass + ' ok, ' + b.fail + ' failed)');
    b.fails.forEach(f => console.log('       - ' + f));
  });
  const totalFail = results.filter(r => !r.ok).length;
  console.log('\nTOTAL: ' + (results.length - totalFail) + '/' + results.length + ' assertions passed; ' +
    errors.length + ' console errors');

  await browser.close();
  server.kill();
  baseServer.kill();
  process.exit(totalFail || errors.length ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILURE:', e); process.exit(2); });
