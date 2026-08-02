// IronLog P3 e2e: structured set work (setwork) flows.
// Covers: durability routine seed -> hold check with countdown timer -> save ->
// detail strings; structured stretch (depth chip, L/R side) save; quick stretch
// sheet legacy flow + structured repeat; circuit structure add + repeat;
// simple-mode leak checks (no SIDE/HOLD/depth/durability-sheet UI for Amu Reza).
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
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(OUT, `p3-${name}.png`) });
    console.log('shot:', name, '| errors so far:', errors.length);
  };
  const step = async (name, fn) => {
    try { await fn(); } catch (e) { errors.push('[step:' + name + '] ' + e.message.split('\n')[0]); }
    await shot(name);
  };
  // start-screen chip by label (expands More… first when collapsed)
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
      App.navigate('log');
    });
    await page.waitForTimeout(500);
  });

  // ---- 1. durability routine seed -> hold check w/ timer -> save -> detail ----
  await step('10-durability-sheet', async () => {
    await clickKindChip(/durability/);
    const txt = await page.evaluate(() => (document.querySelector('.sheet') || {}).innerText || '');
    if (!/Durability [AB]/.test(txt)) throw new Error('routine row missing');
    if (!/Repeat last|Quick checklist/.test(txt)) throw new Error('sheet options missing');
  });
  await step('11-routine-seeded', async () => {
    await page.locator('.sheet [data-dur="routine"]').click();
    await page.waitForTimeout(700);
    const state = await page.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('ironlog/activeWorkout') || 'null');
      return {
        name: d && d.name,
        kinds: d ? d.entries.map(e => e.type || 'lift') : [],
        refs: d ? d.entries.filter(e => e.type === 'setwork').map(e => e.exerciseRef) : [],
        headText: document.getElementById('lg-entries') ? document.getElementById('lg-entries').innerText : '',
      };
    });
    if (!/^Durability [AB]$/.test(state.name || '')) throw new Error('draft name ' + state.name);
    if (!state.kinds.includes('setwork') || !state.kinds.includes('lift')) {
      throw new Error('routine draft should mix lift + setwork: ' + state.kinds.join(','));
    }
    if (!/HOLD/.test(state.headText)) throw new Error('no HOLD column header');
    if (!/METERS/.test(state.headText) && !/SIDE/.test(state.headText)) {
      throw new Error('no METERS/SIDE column header');
    }
  });
  // P4.5 (was: sheet-level hold pill writing holdSec = target). The live draft
  // is now THE session record: the card stopwatch runs the whole exercise via
  // the Session engine, the pill is a remote control, and holdSec is the
  // seconds ACTUALLY held.
  await step('12-hold-timer', async () => {
    // shrink the first open hold to 2s so the countdown finishes in-test
    const holdCard = page.locator('#lg-entries .card', { has: page.locator('[data-act="sw-timer"]') }).first();
    const holdInput = holdCard.locator('input[data-act="sw-hold"]').first();
    await holdInput.fill('2');
    await page.waitForTimeout(150);
    await holdCard.locator('[data-act="sw-timer"]').click();
    await page.waitForTimeout(400);
    if (!(await page.locator('.rest-timer.sess-pill').count())) throw new Error('session pill not shown');
    if (!(await page.locator('#lg-entries .set-row.running').count())) throw new Error('no active row indication');
    const bound = await page.evaluate(() => {
      const st = ViewsLog.Session.state();
      const row = document.querySelector('#lg-entries .set-row.running');
      return { sid: st && st.sid, rowSid: row && row.getAttribute('data-sid'), kind: st && st.kind };
    });
    if (!bound.sid || bound.sid !== bound.rowSid) throw new Error('pill not bound to the running row by _sid');
    if (bound.kind !== 'work') throw new Error('expected a work step, got ' + bound.kind);
    await page.waitForTimeout(2600);
    const done = await page.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('ironlog/activeWorkout') || 'null');
      const en = d && d.entries.find(e => e.type === 'setwork' &&
        (e.sets || []).some(s => s.done && s.holdSec === 2));
      const st = ViewsLog.Session.state();
      return { wrote: !!en, step: st && st.kind, noSidInStore: true };
    });
    if (!done.wrote) throw new Error('timer did not write the ACTUAL holdSec (2) + done');
    // card stopwatch == 'this exercise': the driven rest follows automatically
    if (done.step !== 'rest') throw new Error('exercise pace did not drive into rest, got ' + done.step);
    await page.locator('.rest-timer.sess-pill [data-s="cancel"]').click();
    await page.waitForTimeout(300);
    if (await page.locator('.rest-timer.sess-pill').count()) throw new Error('cancel did not stop the timer');
  });
  // P4.5 acceptance: concurrent edit — with a set running, edit ANOTHER set's
  // target, add a set and delete a different exercise; the timer keeps running,
  // stays bound by _sid, and records its own ACTUAL seconds on early stop.
  await step('12b-concurrent-edit', async () => {
    const holdCard = page.locator('#lg-entries .card', { has: page.locator('[data-act="sw-timer"]') }).first();
    const rows = holdCard.locator('.set-row:not(.set-head)');
    const target = rows.nth(1);
    await target.locator('input[data-act="sw-hold"]').fill('30');
    await page.waitForTimeout(150);
    await target.locator('.set-run').click();       // tap the set NUMBER
    await page.waitForTimeout(1200);
    const sid0 = await page.evaluate(() => ViewsLog.Session.state().sid);
    // concurrent edits everywhere BUT the running row
    await rows.nth(2).locator('input[data-act="sw-hold"]').fill('55');
    await page.waitForTimeout(120);
    await holdCard.locator('[data-act="addset"]').click();
    await page.waitForTimeout(250);
    await page.evaluate(() => {
      const d = ViewsLog.getDraft();
      const victim = d.entries.find(e => e.id !== document.querySelector('#lg-entries .card').getAttribute('data-eid'));
      if (victim) { d.entries = d.entries.filter(e => e !== victim); ViewsLog.saveDraft(); }
      App.rerender();
    });
    await page.waitForTimeout(1400);
    const mid = await page.evaluate(() => {
      const st = ViewsLog.Session.state();
      const row = document.querySelector('#lg-entries .set-row.running');
      return { sid: st && st.sid, running: !!st, rowSid: row && row.getAttribute('data-sid') };
    });
    if (!mid.running) throw new Error('timer died during concurrent edits');
    if (mid.sid !== sid0) throw new Error('timer re-bound to a different set');
    if (mid.rowSid !== sid0) throw new Error('running row lost its binding');
    // early stop records the SHORT time, not the 30s target
    await page.locator('.rest-timer.sess-pill [data-s="done"]').click();
    await page.waitForTimeout(300);
    const rec = await page.evaluate((sid) => {
      const d = JSON.parse(localStorage.getItem('ironlog/activeWorkout') || 'null');
      let hit = null;
      (d.entries || []).forEach(e => (e.sets || []).forEach(s => { if (s._sid === sid) hit = s; }));
      return hit;
    }, sid0);
    if (!rec || !rec.done) throw new Error('early stop did not complete the set');
    if (!(rec.holdSec > 0 && rec.holdSec < 15)) {
      throw new Error('holdSec must be the ACTUAL seconds held, got ' + (rec && rec.holdSec));
    }
    await page.evaluate(() => ViewsLog.Session.cancel());
    await page.waitForTimeout(200);
  });
  await step('13-durability-save', async () => {
    const before = await page.evaluate(() => Store.workoutsFor(Store.currentUser().id).length);
    await page.locator('#lg-finish').click();
    await page.waitForTimeout(500);
    await page.locator('.sheet button', { hasText: /save workout/i }).last().click();
    await page.waitForTimeout(700);
    const res = await page.evaluate(() => {
      const w = Store.workoutsFor(Store.currentUser().id)[0];
      const sw = (w.entries || []).filter(e => e && e.type === 'setwork');
      return {
        count: Store.workoutsFor(Store.currentUser().id).length,
        name: w.name,
        swCount: sw.length,
        forbiddenExId: sw.some(e => 'exerciseId' in e),
        forbiddenSetType: sw.some(e => (e.sets || []).some(s => 'type' in s)),
        hasHold: sw.some(e => (e.sets || []).some(s => s.holdSec > 0)),
        hasCarry: sw.some(e => (e.sets || []).some(s => s.distanceM > 0)),
        liftCount: (w.entries || []).filter(e => !e.type || e.type === 'lift').length,
      };
    });
    if (res.count !== before + 1) throw new Error('workout not saved');
    if (!/^Durability [AB]$/.test(res.name)) throw new Error('saved name ' + res.name);
    if (res.swCount < 1) throw new Error('no setwork entries saved');
    if (res.forbiddenExId) throw new Error('FORBIDDEN: exerciseId on setwork entry');
    if (res.forbiddenSetType) throw new Error('FORBIDDEN: type key on setwork set');
    if (!res.hasHold) throw new Error('no holdSec saved');
    if (!res.hasCarry && res.swCount > 1) throw new Error('no carry distanceM saved');
  });
  await step('14-durability-detail', async () => {
    await page.evaluate(() => App.navigate('history'));
    await page.waitForTimeout(450);
    const listTxt = await page.evaluate(() => document.body.innerText);
    if (!/drill/i.test(listTxt)) errors.push('[14] history summary lacks drills clause');
    await page.locator('.list-row[data-wid]').first().click();
    await page.waitForTimeout(500);
    const txt = await page.evaluate(() => (document.querySelector('.sheet') || {}).innerText || '');
    if (!/0:02/.test(txt)) throw new Error('detail lacks 0:02 hold string');
    if (!/\d+ m\b/.test(txt) && !/×/.test(txt)) throw new Error('detail lacks unit-aware set strings');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  });

  // ---- 1b. setwork edit round-trip (mixed editor) + unknown-key preservation ----
  await step('15-setwork-edit', async () => {
    // plant unknown keys a future version might write, then edit through the UI
    await page.evaluate(() => {
      const w = Store.workoutsFor(Store.currentUser().id).find(x => /^Durability [AB]$/.test(x.name));
      const en = w.entries.find(e => e && e.type === 'setwork');
      en.futureKey = 'keep-me';
      en.sets[0].futureSetKey = 42;
      Store.updateWorkout(w.id, { entries: w.entries });
    });
    await page.evaluate(() => App.navigate('history'));
    await page.waitForTimeout(400);
    await page.locator('.list-row[data-wid]', { hasText: /durability a|durability b/i }).first().click();
    await page.waitForTimeout(400);
    await page.locator('.sheet button', { hasText: /^edit$/i }).last().click();
    await page.waitForTimeout(500);
    const sheetTxt = await page.evaluate(() => (document.querySelector('.sheet') || {}).innerText || '');
    if (!/HOLD/.test(sheetTxt)) throw new Error('mixed editor lacks setwork HOLD rows');
    await page.locator('.sheet input[data-act="sw-hold"]').first().fill('0:50');
    await page.locator('.sheet button', { hasText: /save changes/i }).last().click();
    await page.waitForTimeout(600);
    const res = await page.evaluate(() => {
      const w = Store.workoutsFor(Store.currentUser().id).find(x => /^Durability [AB]$/.test(x.name));
      const en = w.entries.find(e => e && e.type === 'setwork');
      return {
        holdSec: en.sets[0].holdSec,
        futureKey: en.futureKey,
        futureSetKey: en.sets[0].futureSetKey,
        ref: en.exerciseRef,
        forbidden: 'exerciseId' in en || en.sets.some(s => 'type' in s),
      };
    });
    if (res.holdSec !== 50) throw new Error('edited holdSec not saved: ' + res.holdSec);
    if (res.futureKey !== 'keep-me') throw new Error('unknown entry key stripped by edit');
    if (res.futureSetKey !== 42) throw new Error('unknown set key stripped by edit');
    if (!res.ref) throw new Error('exerciseRef lost in edit');
    if (res.forbidden) throw new Error('FORBIDDEN key appeared after edit');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  });

  // ---- 2. structured stretch: depth chip + L/R side -> save ----
  await step('20-stretch-builder-open', async () => {
    await clickKindChip(/stretch/);
    const hasBtn = await page.locator('#mb-individual').count();
    if (!hasBtn) throw new Error('Log individual stretches missing (perf mode)');
    await page.locator('#mb-individual').click();
    await page.waitForTimeout(400);
  });
  await step('21-stretch-add', async () => {
    await page.locator('#sb-add').click();
    await page.waitForTimeout(400);
    await page.locator('.sheet #xp-q').last().fill('couch');
    await page.waitForTimeout(350);
    await page.locator('.sheet .list-row', { hasText: /couch stretch/i }).last().click();
    await page.waitForTimeout(250);
    await page.locator('.sheet #xp-commit').last().click();
    await page.waitForTimeout(400);
    const txt = await page.evaluate(() => (document.querySelector('.sheet') || {}).innerText || '');
    if (!/Couch Stretch/i.test(txt)) throw new Error('stretch card missing');
    if (!/Stretch depth/i.test(txt)) throw new Error('depth row missing');
    if (!/Working/.test(txt) || !/Limit/.test(txt)) throw new Error('depth anchor labels missing');
  });
  await step('22-stretch-fill-save', async () => {
    await page.locator('.sheet [data-act="sw-depth"][data-depth="3"]').first().click();
    await page.waitForTimeout(300);
    await page.locator('.sheet input[data-act="sw-hold"]').first().fill('0:30');
    const side = page.locator('.sheet [data-act="sw-side"]').first();
    const before = await side.textContent();
    await side.click(); // cycles L -> R
    const after = await side.textContent();
    if (before === after) throw new Error('side chip did not cycle');
    await page.locator('.sheet button', { hasText: /save session/i }).last().click();
    await skipCheckin();
    const res = await page.evaluate(() => {
      const w = Store.workoutsFor(Store.currentUser().id)[0];
      const en = (w.entries || []).find(e => e && e.type === 'setwork');
      const s = en && (en.sets || [])[0];
      return {
        name: w.name, kind: w.kind,
        method: en && en.method,
        intensity: s && s.intensity, side: s && s.side, holdSec: s && s.holdSec,
        forbidden: en && ('exerciseId' in en || (en.sets || []).some(x => 'type' in x)),
      };
    });
    if (res.name !== 'Stretch') throw new Error('stretch workout name ' + res.name);
    if (res.method !== 'static') throw new Error('method ' + res.method);
    if (res.intensity !== 3) throw new Error('depth chip not saved: intensity ' + res.intensity);
    if (res.side !== 'R') throw new Error('side not saved: ' + res.side);
    if (res.holdSec !== 30) throw new Error('holdSec ' + res.holdSec);
    if (res.forbidden) throw new Error('FORBIDDEN key on structured stretch');
  });

  // ---- 3. quick stretch sheet: structured repeat + unchanged legacy flow ----
  await step('30-repeat-structured', async () => {
    await clickKindChip(/stretch/);
    const same = page.locator('#mb-same');
    if (!(await same.count())) throw new Error('Same as last time chip missing');
    await same.click();
    await page.waitForTimeout(500);
    const txt = await page.evaluate(() => (document.querySelector('.sheet') || {}).innerText || '');
    if (!/Log stretches/i.test(txt)) throw new Error('structured repeat did not open the builder');
    if (!/Couch Stretch/i.test(txt)) throw new Error('repeat did not prefill last session');
    const val = await page.locator('.sheet input[data-act="sw-hold"]').first().inputValue();
    if (val !== '0:30') throw new Error('repeat did not prefill hold value: ' + val);
    await page.locator('.sheet button', { hasText: /cancel/i }).last().click();
    await page.waitForTimeout(300);
  });
  await step('31-legacy-flow-unchanged', async () => {
    await clickKindChip(/stretch/);
    const txt = await page.evaluate(() => (document.querySelector('.sheet') || {}).innerText || '');
    if (!/Duration \(min\)/i.test(txt) || !/Modality/i.test(txt)) throw new Error('legacy sheet fields missing');
    await page.locator('.sheet #mb-dur').fill('12');
    await page.locator('.sheet button', { hasText: /save session/i }).last().click();
    await skipCheckin();
    const res = await page.evaluate(() => {
      const w = Store.workoutsFor(Store.currentUser().id)[0];
      const en = (w.entries || [])[0];
      return { type: en && en.type, modality: en && en.modality, dur: en && en.durationMin,
        keys: en ? Object.keys(en).sort().join(',') : '' };
    });
    if (res.type !== 'mobility') throw new Error('legacy save wrote type ' + res.type);
    if (res.dur !== 12) throw new Error('legacy durationMin ' + res.dur);
    if (!/^id,modality,durationMin,targetMuscles,type$/.test(res.keys.split(',').sort().join(',')) &&
        res.keys !== 'durationMin,id,modality,targetMuscles,type') {
      errors.push('[31] legacy entry keys changed: ' + res.keys);
    }
  });

  // ---- 4. circuit structure add + repeat ----
  await step('40-circuit-structure', async () => {
    await clickKindChip(/circuit/);
    await page.locator('.sheet #cl-dur').fill('20');
    const structHidden = await page.evaluate(() => document.querySelector('#cl-struct').hidden);
    if (structHidden) throw new Error('Structure card hidden in circuit mode');
    await page.locator('.sheet #cl-struct-toggle').click();
    await page.locator('.sheet [data-cr="1"]').click();
    await page.locator('.sheet [data-cr="1"]').click();
    await page.locator('.sheet #cl-st-add').click();
    await page.locator('.sheet input[data-stname="0"]').fill('Burpees');
    await page.locator('.sheet input[data-streps="0"]').fill('10');
    await page.locator('.sheet button', { hasText: /save session/i }).last().click();
    await skipCheckin();
    const res = await page.evaluate(() => {
      const w = Store.workoutsFor(Store.currentUser().id)[0];
      const en = (w.entries || [])[0];
      return { mode: en && en.mode, rounds: en && en.rounds,
        st0: en && en.stations && en.stations[0] };
    });
    if (res.mode !== 'circuit') throw new Error('mode ' + res.mode);
    if (res.rounds !== 2) throw new Error('rounds ' + res.rounds);
    if (!res.st0 || res.st0.name !== 'Burpees' || res.st0.reps !== 10) {
      throw new Error('station not saved: ' + JSON.stringify(res.st0));
    }
  });
  await step('41-circuit-repeat', async () => {
    await clickKindChip(/circuit/);
    await page.locator('.sheet #cl-struct-toggle').click();
    const rep = page.locator('.sheet #cl-struct-repeat');
    if (!(await rep.count())) throw new Error('Repeat last circuit chip missing');
    await rep.click();
    await page.waitForTimeout(300);
    const rounds = await page.evaluate(() => document.getElementById('cl-rounds').textContent);
    if (rounds !== '2') throw new Error('repeat rounds ' + rounds);
    const name = await page.locator('.sheet input[data-stname="0"]').inputValue();
    if (name !== 'Burpees') throw new Error('repeat station ' + name);
    await page.locator('.sheet button', { hasText: /cancel/i }).last().click();
    await page.waitForTimeout(300);
  });

  // ---- 4b. run intervals: TOTAL written into distanceKm ----
  await step('42-run-intervals', async () => {
    await clickKindChip(/^\s*run\b/);
    const intHidden = await page.evaluate(() => document.querySelector('#cl-int').hidden);
    if (intHidden) throw new Error('interval section hidden in run mode');
    await page.locator('.sheet #cl-int-toggle').click();
    await page.locator('.sheet #cl-int-reps').fill('4');
    await page.locator('.sheet #cl-int-dist').fill('400');
    await page.waitForTimeout(250);
    const distVal = await page.locator('.sheet #cl-dist').inputValue();
    if (!(parseFloat(distVal) > 0)) throw new Error('interval total not written to distance: ' + distVal);
    const totTxt = await page.evaluate(() => document.getElementById('cl-int-total').textContent);
    if (!/total/i.test(totTxt)) throw new Error('interval total hint missing');
    await page.locator('.sheet #cl-dur').fill('10');
    await page.locator('.sheet button', { hasText: /save session/i }).last().click();
    await skipCheckin();
    const res = await page.evaluate(() => {
      const w = Store.workoutsFor(Store.currentUser().id)[0];
      const en = (w.entries || [])[0];
      return { iv: en && en.intervals, km: en && en.distanceKm };
    });
    if (!res.iv || res.iv.reps !== 4 || res.iv.distanceM !== 400) {
      throw new Error('intervals not saved: ' + JSON.stringify(res.iv));
    }
    if (!(res.km > 1.55 && res.km < 1.65)) throw new Error('distanceKm not interval total: ' + res.km);
  });

  // ---- 5. simple-mode leak checks (Amu Reza) ----
  await step('50-simple-start-screen', async () => {
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      const amu = Store.state.users.find(u => u.name === 'Amu Reza');
      Store.setCurrentUser(amu.id);
      localStorage.removeItem('ironlog/activeWorkout');
      App.navigate('log');
    });
    await page.waitForTimeout(500);
    const chips = await page.evaluate(() =>
      [...document.querySelectorAll('#lg-kinds .chip')].map(e => e.textContent.trim()));
    if (chips.some(c => /durability/i.test(c))) throw new Error('Durability chip leaked to simple mode');
    if (chips.some(c => /run|ruck|swim|circuit|test/i.test(c))) {
      throw new Error('perf chips leaked: ' + chips.join(','));
    }
  });
  await step('51-simple-cardio-clean', async () => {
    await clickKindChip(/cardio/);
    const leak = await page.evaluate(() => {
      const s = document.querySelector('.sheet');
      const txt = (s && s.innerText) || '';
      return {
        struct: /Structure — optional|Intervals — optional|Elevation gain/i.test(txt),
        ids: !!(document.getElementById('cl-struct') || document.getElementById('cl-int') || document.getElementById('cl-elev')),
      };
    });
    if (leak.struct || leak.ids) throw new Error('structure/interval UI leaked to simple mode');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  });
  await step('52-simple-stretch-clean', async () => {
    await clickKindChip(/stretch/);
    const leak = await page.evaluate(() => {
      const txt = ((document.querySelector('.sheet') || {}).innerText) || '';
      return /Log individual stretches/i.test(txt);
    });
    if (leak) throw new Error('Log individual stretches leaked to simple mode');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  });
  await step('53-simple-picker-lift-only', async () => {
    await page.evaluate(() => App.navigate('log'));
    await page.waitForTimeout(300);
    await page.locator('button', { hasText: /start empty/i }).first().click();
    await page.waitForTimeout(400);
    await page.locator('button', { hasText: /add exercise/i }).first().click();
    await page.waitForTimeout(400);
    await page.locator('.sheet #xp-q').fill('plank');
    await page.waitForTimeout(350);
    await page.locator('.sheet .list-row', { hasText: /^plank/i }).first().click();
    await page.waitForTimeout(250);
    await page.locator('.sheet #xp-commit').click();
    await page.waitForTimeout(450);
    const res = await page.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('ironlog/activeWorkout') || 'null');
      const en = d && d.entries[0];
      const txt = document.getElementById('lg-entries').innerText;
      return {
        isLift: !!en && !en.type && en.exerciseId === 'plank',
        holdUI: /HOLD/.test(txt) || /Stretch depth/i.test(txt) || /SIDE/.test(txt),
        timerBtn: !!document.querySelector('[data-act="sw-timer"]'),
      };
    });
    if (!res.isLift) throw new Error('simple-mode pick did not create a lift entry');
    if (res.holdUI || res.timerBtn) throw new Error('HOLD/SIDE/depth UI leaked to simple mode');
    await page.evaluate(() => { localStorage.removeItem('ironlog/activeWorkout'); App.rerender(); });
    await page.waitForTimeout(300);
  });

  console.log('\n=== ERRORS (' + errors.length + ') ===');
  [...new Set(errors)].slice(0, 50).forEach(e => console.log(e));

  await browser.close();
  server.kill();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILURE:', e); process.exit(2); });
