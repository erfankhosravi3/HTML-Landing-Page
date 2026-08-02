// IronLog P3.5 player e2e — UPDATED for P4.5 "ONE LIVE SESSION".
//
// The player no longer owns a compiled shadow timeline, its own actuals or
// 'ironlog/activeSession'; the DRAFT ('ironlog/activeWorkout') is the single
// session record and the focus view is a renderer over it. Every assertion
// that encoded the old ownership model has been rewritten against the new
// contract — the coverage areas are unchanged:
//   1. front doors seed ONE session record (durability sheet, routine card)
//   2. run a 2-exercise routine (2s holds/rests) to completion in the focus
//      view — sides, driven rests, depth capture, ACTUAL elapsed holdSec —
//      and save it through the ONE finish flow
//   3. mid-session reload: the draft survives, the recorded work survives,
//      and no P3.5 resume modal appears (the shadow session is gone)
//   4. circuit guided: 2 rounds -> saved cardio entry rounds/stations
//   5. simple-mode leak sweep: no guided/planner/routines UI for Amu Reza
const P = require('./lib/paths');
const { chromium } = P.playwright();
const { serve } = require('./lib/hport');   // ephemeral, root-verified port
const path = require('path');
const fs = require('fs');

const ROOT = P.GYM;
const OUT = path.join(__dirname, 'shots');
let PORT = 0;   // assigned by hport.serve() — never hardcoded

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve(ROOT);
  PORT = server.port;

  const errors = [];
  const browser = await chromium.launch({ executablePath: P.chromiumPath() });
  const ctx = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    deviceScaleFactor: 2,
    serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  page.on('requestfailed', r => {
    if (!r.url().includes('favicon')) errors.push('[requestfailed] ' + r.url() + ' ' + r.failure().errorText);
  });

  const shot = async (name) => {
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(OUT, `p35-${name}.png`) });
    console.log('shot:', name, '| errors so far:', errors.length);
  };
  const step = async (name, fn) => {
    try { await fn(); } catch (e) { errors.push('[step:' + name + '] ' + e.message.split('\n')[0]); }
    await shot(name);
  };
  const clickKindChip = async (re) => {
    await page.evaluate(() => App.navigate('log'));
    await page.waitForTimeout(400);
    const hit = await page.evaluate((src) => {
      const rx = new RegExp(src, 'i');
      const more = [...document.querySelectorAll('#lg-kinds .chip')].find(e => /More…/.test(e.textContent));
      if (more) more.click();
      const chip = [...document.querySelectorAll('#lg-kinds .chip')].find(e => rx.test(e.textContent));
      if (chip) { chip.click(); return true; }
      return false;
    }, re.source);
    if (!hit) throw new Error('chip ' + re + ' not found');
    await page.waitForTimeout(450);
  };
  const skipCheckin = async () => {
    await page.waitForTimeout(400);
    const skip = page.locator('.sheet button', { hasText: /^skip$/i }).last();
    if (await skip.count()) await skip.click().catch(() => {});
    await page.waitForTimeout(300);
  };
  const overlayText = () => page.evaluate(() =>
    (document.querySelector('.player-overlay') || {}).innerText || '');
  const waitOverlayText = async (re, ms) => {
    await page.waitForFunction((src) => {
      const el = document.querySelector('.player-overlay');
      return el && new RegExp(src, 'i').test(el.innerText);
    }, re.source, { timeout: ms || 8000 });
  };
  const draftOf = () => page.evaluate(() =>
    JSON.parse(localStorage.getItem('ironlog/activeWorkout') || 'null'));
  const discardDraft = async () => {
    await page.evaluate(() => {
      const VL = window.ViewsLog;
      if (VL && VL.Session && VL.Session.cancel) VL.Session.cancel();
      if (Player.closeFocus) Player.closeFocus({ navigate: false });
      localStorage.removeItem('ironlog/activeWorkout');
      App.navigate('log');
    });
    await page.waitForTimeout(350);
  };
  // Nothing may ever write the P3.5 shadow session again.
  const noShadow = async (where) => {
    const v = await page.evaluate(() => localStorage.getItem('ironlog/activeSession'));
    if (v) throw new Error('shadow session key written at ' + where);
  };

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await step('00-setup', async () => {
    const demoBtn = page.locator('button', { hasText: /demo/i }).first();
    if (await demoBtn.count()) await demoBtn.click();
    else await page.evaluate(() => { Store.seedDemo(); });
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const erfan = Store.state.users.find(u => u.name === 'Erfan');
      Store.setCurrentUser(erfan.id);
      localStorage.removeItem('ironlog/activeWorkout');
      // a shipped P3.5 client left one of these behind (acceptance test 8)
      localStorage.setItem('ironlog/activeSession',
        JSON.stringify({ v: 1, routine: { name: 'Old', items: [] }, startedAt: Date.now(), stepIdx: 2 }));
      App.navigate('log');
    });
    await page.waitForTimeout(500);
    const boot = await page.evaluate(() => !!document.querySelector('.modal-backdrop'));
    if (boot) throw new Error('a resume modal appeared for the deleted shadow session');
  });

  await step('01-stale-shadow-discarded', async () => {
    const res = await page.evaluate(() => ({
      pending: Player.resumePending(),
      resumed: Player.resume(),
      left: localStorage.getItem('ironlog/activeSession'),
    }));
    if (res.pending !== null) throw new Error('resumePending() resurrected a P3.5 session');
    if (res.resumed !== false) throw new Error('Player.resume() did not refuse');
    if (res.left) throw new Error('stale ironlog/activeSession not discarded on boot');
  });

  // ---- 0b. durability sheet: the LIVE SESSION is the front door ----
  await step('05-durability-front-door', async () => {
    await clickKindChip(/durability/);
    const txt = await page.evaluate(() => (document.querySelector('.sheet') || {}).innerText || '');
    if (!/Start Durability [AB]/.test(txt)) throw new Error('guided primary missing');
    if (!/Trained without the phone/i.test(txt)) throw new Error('manual divider missing');
    if (!/Quick checklist/.test(txt)) throw new Error('quick checklist row missing');
    if (!(await page.locator('.sheet [data-dur="routine"]').count())) throw new Error('manual seed row missing');
    await page.locator('.sheet [data-dur="guided"]').click();
    await page.waitForTimeout(600);
    // P4.5: it seeds the ONE session record and opens the builder — durability
    // and stretch start there; only circuits open in focus.
    const d = await draftOf();
    if (!d || !d.entries.length) throw new Error('guided did not seed the draft');
    if (d._view === 'focus') throw new Error('durability should open in the builder');
    if (!d.entries.every(en => (en.sets || []).every(s => !!s._sid))) {
      throw new Error('draft sets have no _sid — timers could not bind');
    }
    const cards = await page.locator('#lg-entries [data-eid]').count();
    if (!cards) throw new Error('builder did not render the seeded session');
    await noShadow('durability guided');
    await discardDraft();
  });

  // ---- 1. two-exercise routine (2s holds/rests) to completion ----
  await step('10-create-routines', async () => {
    const ok = await page.evaluate(() => {
      const u = Store.currentUser();
      Store.addRoutine({
        userId: u.id, name: 'E2E Flow', kind: 'custom', restSec: 4, pace: 'session',
        items: [
          { exerciseId: 'couch_stretch', sets: 1, targetHoldSec: 3 }, // stretch, perSide → L,R
          { exerciseId: 'dead_hang', sets: 1, targetHoldSec: 9 },     // hold — tapped early
        ],
      });
      Store.addRoutine({
        userId: u.id, name: 'E2E Resume', kind: 'custom', restSec: 2,
        items: [{ exerciseId: 'dead_hang', sets: 2, targetHoldSec: 30 }],
      });
      return Store.routinesFor(u.id).length;
    });
    if (ok < 2) throw new Error('routines not stored: ' + ok);
    await clickKindChip(/stretch/);
    if (!(await page.locator('.sheet #mb-guided').count())) throw new Error('stretch guided entry missing (perf)');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  });

  await step('11-templates-routines-card', async () => {
    await page.evaluate(() => App.navigate('templates'));
    await page.waitForTimeout(500);
    const txt = await page.evaluate(() => document.body.innerText);
    if (!/Routines/i.test(txt)) throw new Error('Routines section missing from templates view');
    const card = page.locator('.card[data-rid]', { hasText: 'E2E Flow' });
    if (!(await card.count())) throw new Error('routine card missing');
    for (const act of ['start', 'edit', 'dup', 'del']) {
      if (!(await card.locator(`[data-ract="${act}"]`).count())) throw new Error('routine card lacks ' + act);
    }
    await card.locator('[data-ract="start"]').click();
    await page.waitForTimeout(600);
    const d = await draftOf();
    if (!d || d.entries.length !== 2) throw new Error('routine did not seed one draft entry per item');
    if (d._routine.pace !== 'session') throw new Error('routine pace did not ride the draft');
    await noShadow('routine start');
  });

  await step('12-focus-left-right-auto', async () => {
    // switch presentation — one tap, same state, and open the focus renderer
    await page.evaluate(() => Player.Session.setView('focus'));
    await page.waitForTimeout(400);
    if (!(await page.locator('.player-overlay').count())) throw new Error('focus view did not open');
    const chromeHidden = await page.evaluate(() =>
      document.getElementById('topbar').style.display === 'none');
    if (!chromeHidden) throw new Error('app chrome not hidden in the focus view');
    if (!(await page.locator('.player-overlay [data-p="builder"]').count())) {
      throw new Error('focus view has no Builder escape hatch');
    }
    if (!(await page.locator('.player-overlay [data-peek]').count())) {
      throw new Error('focus view has no tap-a-set strip');
    }
    // session pace: the whole thing runs hands-free from here
    await page.evaluate(() => Player.Session.runSession());
    await waitOverlayText(/Couch Stretch/);
    if (!/LEFT/.test(await overlayText())) throw new Error('no LEFT badge on the first side');
  });

  await step('13-rest-depth-tap', async () => {
    // the driven rest between the L and R sides (session pace)
    await waitOverlayText(/REST/, 9000);
    if (!/HOW DEEP/i.test(await overlayText())) throw new Error('depth ask missing on the rest screen');
    const tapped = await page.evaluate(() => {
      const b = document.querySelector('.player-overlay [data-depth="3"]');
      if (b) { b.click(); return true; }
      return false;
    });
    if (!tapped) throw new Error('depth chip vanished before the tap');
    const d = await draftOf();
    const couch = d.entries.find(e => e.exerciseRef === 'couch_stretch');
    if (!couch || couch.sets[0].intensity !== 3) {
      throw new Error('depth was not written onto the set that just finished: ' +
        JSON.stringify(couch && couch.sets[0]));
    }
    if (!(couch.sets[0].holdSec >= 1 && couch.sets[0].holdSec <= 4)) {
      throw new Error('L side did not record its actual seconds: ' + couch.sets[0].holdSec);
    }
    await waitOverlayText(/RIGHT/, 12000); // the rest auto-starts the right side
    if (!/Couch Stretch/i.test(await overlayText())) throw new Error('right side lost the exercise name');
  });

  await step('14-early-ring-tap', async () => {
    // anchor on the HEADLINE exercise name — 'Dead Hang' also appears in the
    // next-up strip while the previous side is still running
    await page.waitForFunction(
      () => {
        const nm = document.querySelector('.player-overlay .player-ex-name');
        return !!document.querySelector('.player-overlay button[data-p="ring"]') &&
          nm && /Dead Hang/i.test(nm.textContent);
      },
      null, { timeout: 20000 });
    await page.waitForTimeout(1200); // ~1s into a 9s target
    await page.locator('.player-overlay [data-p="ring"]').click();
    await page.waitForTimeout(400);
    const d = await draftOf();
    const dh = d.entries.find(e => e.exerciseRef === 'dead_hang');
    if (!dh || !dh.sets[0].done) throw new Error('the ring tap did not finish the set');
    if (!(dh.sets[0].holdSec >= 1 && dh.sets[0].holdSec < 9)) {
      throw new Error('early tap did not record ACTUAL elapsed seconds: ' + dh.sets[0].holdSec);
    }
  });

  await step('15-finish-and-assert', async () => {
    const before = await page.evaluate(() => Store.workoutsFor(Store.currentUser().id).length);
    // ONE finish flow: the draft's finish sheet (the player has no save path)
    await page.evaluate(() => Player.finishSession());
    await page.waitForTimeout(700);
    const sheet = page.locator('.sheet button', { hasText: /save workout/i }).last();
    if (!(await sheet.count())) throw new Error('the shared finish sheet did not open');
    await sheet.click();
    await page.waitForTimeout(700);
    await skipCheckin();
    const res = await page.evaluate(() => {
      const w = Store.workoutsFor(Store.currentUser().id)[0];
      const sw = (w.entries || []).filter(e => e && e.type === 'setwork');
      const couch = sw.find(e => e.exerciseRef === 'couch_stretch');
      const dh = sw.find(e => e.exerciseRef === 'dead_hang');
      const hits = [];
      (function walk(o, t) {
        if (Array.isArray(o)) return o.forEach((x, i) => walk(x, t + '[' + i + ']'));
        if (!o || typeof o !== 'object') return;
        Object.keys(o).forEach(k => { if (k[0] === '_') hits.push(t + '.' + k); walk(o[k], t + '.' + k); });
      })(w, '$');
      return {
        count: Store.workoutsFor(Store.currentUser().id).length,
        overlayGone: !document.querySelector('.player-overlay'),
        chromeBack: document.getElementById('topbar').style.display !== 'none',
        draftGone: !localStorage.getItem('ironlog/activeWorkout'),
        kind: w.kind, durationMin: w.durationMin,
        startedAt: w.startedAt, endedAt: w.endedAt,
        couchSets: couch && couch.sets, method: couch && couch.method,
        dhSets: dh && dh.sets,
        forbidden: sw.some(e => 'exerciseId' in e || (e.sets || []).some(s => 'type' in s)),
        underscores: hits,
        pending: localStorage.getItem('ironlog/activeSession'),
      };
    });
    if (res.count !== before + 1) throw new Error('workout not saved');
    if (!res.overlayGone || !res.chromeBack) throw new Error('overlay/chrome not restored after save');
    if (!res.draftGone) throw new Error('the draft was not cleared by the finish flow');
    if (res.pending) throw new Error('a shadow session appeared');
    if (res.underscores.length) throw new Error('draft-local keys leaked into Store: ' + res.underscores.join(','));
    if (res.kind !== 'setwork') throw new Error('kind ' + res.kind);
    if (!(res.durationMin >= 1)) throw new Error('durationMin ' + res.durationMin);
    if (!(res.startedAt > 0 && res.endedAt > res.startedAt)) throw new Error('startedAt/endedAt missing');
    if (res.method !== 'static') throw new Error('stretch method ' + res.method);
    const cs = res.couchSets || [];
    if (cs.length !== 2 || cs[0].side !== 'L' || cs[1].side !== 'R') {
      throw new Error('sides wrong: ' + JSON.stringify(cs));
    }
    if (!(cs[0].holdSec >= 1 && cs[0].holdSec <= 4) || !(cs[1].holdSec >= 1 && cs[1].holdSec <= 4)) {
      throw new Error('auto-hold seconds wrong: ' + JSON.stringify(cs));
    }
    if (cs[0].intensity !== 3) throw new Error('rest-tap depth not written to the L set: ' + cs[0].intensity);
    const dhs = (res.dhSets || [])[0] || {};
    if (!(dhs.holdSec >= 1 && dhs.holdSec < 9)) {
      throw new Error('early tap did not persist the actual elapsed: ' + dhs.holdSec);
    }
    if ('side' in dhs) throw new Error('side leaked onto a bilateral hold');
    if (res.forbidden) throw new Error('FORBIDDEN key on a session-written setwork entry');
  });

  // ---- 2. mid-session reload: ONE record survives, no resume modal ----
  await step('20-resume-setup', async () => {
    await page.evaluate(() => App.navigate('templates'));
    await page.waitForTimeout(500);
    await page.locator('.card[data-rid]', { hasText: 'E2E Resume' }).locator('[data-ract="start"]').click();
    await page.waitForTimeout(600);
    await page.evaluate(() => {
      const d = window.ViewsLog.getDraft();
      const en = d.entries[0];
      window.ViewsLog.Session.runSet(en.id, en.sets[0]._sid, {});
    });
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.ViewsLog.Session.doneNow()); // finish set 1 early (~1s)
    await page.waitForTimeout(400);
    const d = await draftOf();
    const s0 = d.entries[0].sets[0];
    if (!s0.done) throw new Error('set 1 not recorded');
    if (!(s0.holdSec >= 1 && s0.holdSec < 30)) throw new Error('actual seconds not recorded: ' + s0.holdSec);
    await noShadow('mid-session');
  });

  await step('21-reload-keeps-one-record', async () => {
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(800);
    const modal = await page.evaluate(() => (document.querySelector('.modal-backdrop') || {}).innerText || '');
    if (/guided session in progress/i.test(modal)) throw new Error('the deleted P3.5 resume modal came back');
    const d = await draftOf();
    if (!d) throw new Error('the draft did not survive the reload');
    if (!d.entries[0].sets[0].done) throw new Error('completed set lost across the reload');
    if (!d.entries[0].sets[0]._sid) throw new Error('_sid not persisted — a reload would orphan the timer');
    await noShadow('after reload');
  });

  await step('22-resume-continues-in-place', async () => {
    await page.evaluate(() => App.navigate('log'));
    await page.waitForTimeout(600);
    const res = await page.evaluate(() => {
      const d = window.ViewsLog.getDraft();
      const en = d.entries[0];
      const ok = window.ViewsLog.Session.runSet(en.id, en.sets[1]._sid, {});
      const st = window.ViewsLog.Session.state();
      return { ok: ok, sid: st && st.sid, want: en.sets[1]._sid, done0: en.sets[0].done };
    });
    if (!res.ok || res.sid !== res.want) throw new Error('could not continue on set 2 after the reload');
    if (!res.done0) throw new Error('set 1 lost its recorded work');
    // clean up
    await page.evaluate(() => {
      window.ViewsLog.Session.cancel();
      localStorage.removeItem('ironlog/activeWorkout');
      App.rerender();
    });
    await page.waitForTimeout(300);
  });

  // ---- 3. circuit guided: 2 rounds → cardio entry rounds/stations ----
  await step('30-circuit-guided', async () => {
    await clickKindChip(/circuit/);
    await page.locator('.sheet #cl-struct-toggle').click();
    await page.locator('.sheet [data-cr="1"]').click();
    await page.locator('.sheet [data-cr="1"]').click(); // rounds 2
    await page.locator('.sheet #cl-st-add').click();
    await page.locator('.sheet input[data-stname="0"]').fill('Burpees');
    await page.locator('.sheet input[data-streps="0"]').fill('10');
    await page.locator('.sheet #cl-guided').click();
    await page.waitForTimeout(800);
    if (await page.locator('.sheet').count()) throw new Error('cardio sheet left open behind the session');
    const d = await draftOf();
    if (!d) throw new Error('circuit did not seed the draft');
    const en = (d.entries || [])[0];
    if (!en || en.type !== 'cardio' || en.mode !== 'circuit') throw new Error('no circuit entry in the draft');
    if (d._view !== 'focus') throw new Error('circuits should open in the focus view');
    if (!(await page.locator('.player-overlay').count())) throw new Error('circuit focus view did not open');
    const txt = await overlayText();
    if (!/ROUND/i.test(txt) || !/Burpees/.test(txt)) throw new Error('round player content wrong');
    await noShadow('circuit');
  });

  await step('31-circuit-rounds-save', async () => {
    await page.locator('.player-overlay [data-p="rounddone"]').click();
    await page.waitForTimeout(500);
    if (!/2/.test(await page.evaluate(() =>
      (document.querySelector('[data-p="round"]') || {}).textContent || ''))) {
      throw new Error('round counter did not advance');
    }
    await page.locator('.player-overlay [data-p="rounddone"]').click();
    await page.waitForTimeout(500);
    const rounds = await page.evaluate(() =>
      (JSON.parse(localStorage.getItem('ironlog/activeWorkout')).entries[0] || {}).rounds);
    if (rounds !== 2) throw new Error('draft rounds ' + rounds);
    await page.evaluate(() => Player.finishSession());
    await page.waitForTimeout(700);
    const save = page.locator('.sheet button', { hasText: /save workout/i }).last();
    if (!(await save.count())) throw new Error('finish sheet did not open for the circuit');
    await save.click();
    await page.waitForTimeout(700);
    await skipCheckin();
    const res = await page.evaluate(() => {
      const w = Store.workoutsFor(Store.currentUser().id)[0];
      const en = (w.entries || [])[0];
      return {
        kind: w.kind, type: en && en.type, mode: en && en.mode,
        rounds: en && en.rounds, st0: en && en.stations && en.stations[0],
        stCount: en && en.stations ? en.stations.length : 0,
        durationMin: w.durationMin,
      };
    });
    if (res.type !== 'cardio' || res.mode !== 'circuit') throw new Error('entry type/mode ' + res.type + '/' + res.mode);
    if (res.kind !== 'circuit') throw new Error('kind ' + res.kind);
    if (res.rounds !== 2) throw new Error('rounds ' + res.rounds);
    if (res.stCount !== 1 || !res.st0 || res.st0.name !== 'Burpees' || res.st0.reps !== 10) {
      throw new Error('stations wrong: ' + JSON.stringify(res.st0));
    }
    if (!(res.durationMin >= 1)) throw new Error('circuit durationMin ' + res.durationMin);
  });

  // ---- 4. simple-mode leak sweep (Amu Reza) ----
  await step('40-simple-log', async () => {
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      const amu = Store.state.users.find(u => u.name === 'Amu Reza');
      Store.setCurrentUser(amu.id);
      localStorage.removeItem('ironlog/activeWorkout');
      App.navigate('log');
    });
    await page.waitForTimeout(500);
    const txt = await page.evaluate(() => document.body.innerText);
    if (/guided/i.test(txt)) throw new Error('guided wording leaked to the simple log screen');
    const chips = await page.evaluate(() =>
      [...document.querySelectorAll('#lg-kinds .chip')].map(e => e.textContent.trim()));
    if (chips.some(c => /durability/i.test(c))) throw new Error('durability chip leaked');
  });
  await step('41-simple-stretch', async () => {
    await clickKindChip(/stretch/);
    const leak = await page.evaluate(() => ({
      guided: !!document.getElementById('mb-guided'),
      txt: /start guided|start stretch session/i.test(((document.querySelector('.sheet') || {}).innerText) || ''),
    }));
    if (leak.guided || leak.txt) throw new Error('a guided entry leaked to the simple stretch sheet');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  });
  await step('42-simple-cardio', async () => {
    await clickKindChip(/cardio/);
    const leak = await page.evaluate(() => ({
      guided: !!(document.getElementById('cl-guided') || document.getElementById('cl-amrap')),
      struct: !!document.getElementById('cl-struct'),
    }));
    if (leak.guided) throw new Error('circuit guided UI leaked to simple mode');
    if (leak.struct) throw new Error('structure card leaked to simple mode');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  });
  await step('43-simple-templates', async () => {
    await page.evaluate(() => App.navigate('templates'));
    await page.waitForTimeout(500);
    const leak = await page.evaluate(() => ({
      ids: !!(document.getElementById('rt-new') || document.getElementById('rt-builtin')),
      cards: document.querySelectorAll('[data-rid], [data-ract]').length,
      txt: /new routine|start guided|built-in routines/i.test(document.body.innerText),
    }));
    if (leak.ids || leak.cards || leak.txt) throw new Error('routines UI leaked to the simple templates view');
  });
  await step('44-simple-player-refused', async () => {
    const res = await page.evaluate(() => {
      const started = Player.start({
        name: 'x', kind: 'custom', restSec: 0,
        items: [{ exerciseId: 'dead_hang', sets: 1, targetHoldSec: 30 }],
      });
      const focus = Player.openFocus();
      Player.openPlanner();
      return {
        started: started,
        focus: focus,
        overlay: !!document.querySelector('.player-overlay'),
        sheet: !!document.querySelector('.sheet'),
        draft: localStorage.getItem('ironlog/activeWorkout'),
      };
    });
    if (res.started !== false) throw new Error('Player.start did not refuse simple mode');
    if (res.focus !== false) throw new Error('Player.openFocus did not refuse simple mode');
    if (res.overlay) throw new Error('the focus overlay opened for a simple user');
    if (res.sheet) throw new Error('the planner sheet opened for a simple user');
    if (res.draft) throw new Error('a refused start still seeded a draft');
  });

  console.log('\n=== ERRORS (' + errors.length + ') ===');
  [...new Set(errors)].slice(0, 50).forEach(e => console.log(e));

  await browser.close();
  server.kill();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILURE:', e); process.exit(2); });
