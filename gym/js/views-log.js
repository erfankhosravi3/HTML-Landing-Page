/* IronLog — views-log.js
   Registers the 'log', 'history' and 'templates' views and owns the active
   workout draft, persisted to localStorage 'ironlog/activeWorkout' on every
   change so it survives refresh / tab close. */
(function () {
  'use strict';

  const DRAFT_KEY = 'ironlog/activeWorkout';
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const TEMPLATE_EMOJIS = ['📋', '💪', '🏋️', '🦵', '🔥', '⚡', '🏃', '🧗', '🚴', '🎯', '🦍', '🐻', '🥇', '🧘', '🤸', '🛠️'];
  const BAR_EQUIPMENT = ['barbell', 'smith', 'ez_bar', 'trap_bar'];

  // per-side plate icon (not in App.icons)
  const PLATE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" ' +
    'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ' +
    'aria-hidden="true"><circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="12" r="3.4"/><path d="M12 3.4v2.6M12 18v2.6"/></svg>';

  /* ======================================================================
     Shared helpers
     ====================================================================== */

  function ic() { return App.icons; }
  function user() { return Store.currentUser(); }

  function settingsOf(u) {
    const s = (u && u.settings) || {};
    return {
      restTimerSec: typeof s.restTimerSec === 'number' && s.restTimerSec > 0 ? s.restTimerSec : 90,
      barWeightKg: typeof s.barWeightKg === 'number' && s.barWeightKg > 0 ? s.barWeightKg : 20.4,
      plateWeightsKg: Array.isArray(s.plateWeightsKg) && s.plateWeightsKg.length
        ? s.plateWeightsKg.slice()
        : [20.4, 15.9, 11.3, 4.5, 2.3, 1.1]
    };
  }

  function exOf(id) { return ExerciseDB.byId(id); }

  function exName(id) {
    const ex = exOf(id);
    return ex ? ex.name : 'Unknown exercise';
  }

  function exSub(ex) {
    if (!ex) return '';
    const mus = (ex.primaryMuscles || [])
      .map(function (m) { return ExerciseDB.MUSCLE_LABEL[m] || m; })
      .join(', ');
    const eqDef = ExerciseDB.EQUIPMENT.find(function (e) { return e.id === ex.equipment; });
    return [mus, eqDef ? eqDef.label : ''].filter(Boolean).join(' · ');
  }

  // weight in display units as a bare string ('135' / '62.5')
  function dispW(kg) { return String(U.kgToDisplay(kg || 0, App.units())); }

  function fmtVol(kg) {
    return U.fmtNum(U.kgToDisplay(kg || 0, App.units())) + ' ' + U.unitLabel(App.units());
  }

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  function fmtClock(totalSec) {
    totalSec = Math.max(0, Math.round(totalSec));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    if (m < 60) return m + ':' + pad2(s);
    return Math.floor(m / 60) + ':' + pad2(m % 60) + ':' + pad2(s);
  }

  function sectionLabel(txt) {
    return '<div style="font-size:12px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;' +
      'color:var(--text-muted);margin:14px 2px 6px">' + U.esc(txt) + '</div>';
  }

  function focusInput(id) {
    const el = document.getElementById(id);
    if (el) {
      el.focus();
      if (el.select) { try { el.select(); } catch (e) { /* ignore */ } }
    }
  }

  /* ======================================================================
     Active workout draft — localStorage IO
     ====================================================================== */

  let draft = null;

  function loadDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      if (!d || typeof d !== 'object' || !Array.isArray(d.entries)) return null;
      d.entries = d.entries.filter(function (en) { return en && typeof en === 'object'; });
      d.entries.forEach(function (en) {
        if (!en.id) en.id = U.uid('en');
        if (!Array.isArray(en.sets)) en.sets = [];
      });
      return d;
    } catch (e) {
      return null;
    }
  }

  function saveDraft() {
    if (!draft) return;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch (e) { /* storage full */ }
  }

  function clearDraft() {
    draft = null;
    stopRest();
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }
  }

  function defaultDraftName() {
    return WEEKDAYS[new Date().getDay()] + ' Workout';
  }

  function blankSet() {
    return { weightKg: 0, reps: 0, type: 'work', rpe: null, done: false };
  }

  function newEntry(exerciseId, nSets) {
    const sets = [];
    for (let i = 0; i < (nSets || 3); i++) sets.push(blankSet());
    return { id: U.uid('en'), exerciseId: exerciseId, notes: '', sets: sets };
  }

  function startDraft(opts) {
    const u = user();
    if (!u) return;
    opts = opts || {};
    draft = {
      userId: u.id,
      date: U.todayStr(),
      name: opts.name || defaultDraftName(),
      startedAt: Date.now(),
      entries: Array.isArray(opts.entries) ? opts.entries : [],
      notes: '',
      fromTemplateId: opts.fromTemplateId || null
    };
    saveDraft();
  }

  function beginFromWorkout(w) {
    startDraft({
      name: w.name || defaultDraftName(),
      entries: (w.entries || []).map(function (en) {
        return {
          id: U.uid('en'),
          exerciseId: en.exerciseId,
          notes: '',
          sets: (en.sets || []).map(function (s) {
            return {
              weightKg: s.weightKg || 0,
              reps: s.reps || 0,
              type: s.type === 'warmup' ? 'warmup' : 'work',
              rpe: null,
              done: false
            };
          })
        };
      })
    });
  }

  function beginFromTemplate(t) {
    startDraft({
      name: t.name || defaultDraftName(),
      fromTemplateId: t.id,
      entries: (t.entries || []).map(function (e) {
        const en = newEntry(e.exerciseId, U.clamp(Number(e.targetSets) || 3, 1, 10));
        en._repLow = e.targetRepsLow || null;   // used as reps placeholder only
        en._repHigh = e.targetRepsHigh || null; // (stripped by Store on save)
        return en;
      })
    });
  }

  /* ======================================================================
     Previous-performance hints
     ====================================================================== */

  // Combined sets from the most recent workout containing exerciseId.
  function prevSetsFor(userId, exerciseId, opts) {
    opts = opts || {};
    const ws = Store.workoutsFor(userId); // date desc
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i];
      if (opts.excludeId && w.id === opts.excludeId) continue;
      if (opts.maxDate && w.date > opts.maxDate) continue;
      let sets = [];
      (w.entries || []).forEach(function (en) {
        if (en.exerciseId === exerciseId) sets = sets.concat(en.sets || []);
      });
      if (sets.length) return sets;
    }
    return [];
  }

  function hintSetOf(prev, i) {
    return prev.length ? prev[Math.min(i, prev.length - 1)] : null;
  }

  /* ======================================================================
     Rest timer (singleton pill, lives on <body>, survives rerenders)
     ====================================================================== */

  const rest = { el: null, timeEl: null, fillEl: null, iv: null, endsAt: 0, totalSec: 0 };

  function buildRestEl() {
    rest.el = U.el('<div class="rest-timer" role="timer">' +
      '<span style="display:inline-flex;color:var(--accent)">' + ic().timer + '</span>' +
      '<span class="time">0:00</span>' +
      '<span class="track"><span class="fill" style="width:100%"></span></span>' +
      '<button type="button" class="btn small ghost" data-r="add">+30s</button>' +
      '<button type="button" class="btn small ghost" data-r="skip">Skip</button>' +
      '</div>');
    rest.timeEl = rest.el.querySelector('.time');
    rest.fillEl = rest.el.querySelector('.fill');
    rest.el.querySelector('[data-r="add"]').addEventListener('click', function () {
      rest.endsAt += 30000;
      rest.totalSec += 30;
      tickRest();
    });
    rest.el.querySelector('[data-r="skip"]').addEventListener('click', function () { stopRest(); });
    document.body.appendChild(rest.el);
  }

  function startRest(sec) {
    if (!sec || sec <= 0) return;
    rest.endsAt = Date.now() + sec * 1000;
    rest.totalSec = sec;
    if (!rest.el) buildRestEl();
    if (rest.iv) clearInterval(rest.iv);
    rest.iv = setInterval(tickRest, 500);
    tickRest();
  }

  function stopRest() {
    if (rest.iv) { clearInterval(rest.iv); rest.iv = null; }
    if (rest.el) { rest.el.remove(); rest.el = null; rest.timeEl = null; rest.fillEl = null; }
  }

  function tickRest() {
    if (!rest.el) return;
    const remainMs = rest.endsAt - Date.now();
    if (remainMs <= 0) { finishRest(); return; }
    rest.timeEl.textContent = fmtClock(Math.ceil(remainMs / 1000));
    const pct = rest.totalSec > 0 ? (remainMs / (rest.totalSec * 1000)) * 100 : 0;
    rest.fillEl.style.width = U.clamp(pct, 0, 100) + '%';
  }

  function finishRest() {
    stopRest();
    if (navigator.vibrate) { try { navigator.vibrate([180, 90, 180]); } catch (e) { /* ignore */ } }
    App.toast('Rest done', 'ok'); // silent by design — no sound
  }

  /* ======================================================================
     Elapsed-time ticker for the active draft header
     ====================================================================== */

  let elapsedIv = null;

  function startElapsedTicker() {
    if (elapsedIv) clearInterval(elapsedIv);
    function tick() {
      const el = document.getElementById('lg-elapsed');
      if (!el || !draft) {
        if (elapsedIv) { clearInterval(elapsedIv); elapsedIv = null; }
        return;
      }
      el.textContent = fmtClock((Date.now() - draft.startedAt) / 1000);
    }
    elapsedIv = setInterval(tick, 1000);
    tick();
  }

  /* ======================================================================
     Set editor — shared by the active draft and the saved-workout editor.
     ctx = { mode: 'draft'|'edit', model: {entries:[...]}, persist(),
             prev(exerciseId) -> sets[], onStats() }
     ====================================================================== */

  function showRpeOf(en) {
    if (en.showRpe === undefined) {
      return (en.sets || []).some(function (s) { return s.rpe !== null && s.rpe !== undefined; });
    }
    return !!en.showRpe;
  }

  function notesShownOf(en) {
    return en._notesOpen === undefined ? !!en.notes : !!en._notesOpen;
  }

  function mountEditor(root, ctx) {
    const prevCache = {};

    function prevFor(exId) {
      if (!(exId in prevCache)) prevCache[exId] = ctx.prev ? ctx.prev(exId) : [];
      return prevCache[exId];
    }

    function findEntry(cardEl) {
      const eid = cardEl.getAttribute('data-eid');
      return ctx.model.entries.find(function (x) { return x.id === eid; }) || null;
    }

    function setRowHTML(en, s, i, showRpe, prev) {
      const draftMode = ctx.mode === 'draft';
      const done = draftMode && s.done;
      const hs = hintSetOf(prev, i);
      const hint = hs && hs.reps
        ? (hs.weightKg > 0 ? dispW(hs.weightKg) : 'BW') + ' × ' + hs.reps
        : '';
      const phW = hs && hs.weightKg > 0 ? dispW(hs.weightKg) : '';
      const phR = hs && hs.reps ? String(hs.reps)
        : (en._repLow && en._repHigh ? en._repLow + '–' + en._repHigh : '');
      const cls = 'set-row' + (showRpe ? '' : ' no-rpe') +
        (done ? ' done' : '') + (s.type === 'warmup' ? ' warmup' : '');
      const wid = 'sw_' + en.id + '_' + i;
      const rid = 'sr_' + en.id + '_' + i;
      const pid = 'sp_' + en.id + '_' + i;

      let html = '<div class="' + cls + '" data-i="' + i + '">';
      // set number — tap cycles work/warm-up
      html += '<button type="button" class="set-num" data-act="type" style="min-height:40px" ' +
        'title="Toggle warm-up" aria-label="Set ' + (i + 1) + (s.type === 'warmup' ? ', warm-up' : '') +
        ', toggle warm-up">' + (i + 1) + '</button>';
      // previous performance (tap to fill) + inline remove in draft mode
      html += '<div class="set-prev" style="display:flex;align-items:center;min-width:0">' +
        '<button type="button" data-act="hint"' + (hint ? '' : ' disabled') +
        ' title="Fill from last time" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;' +
        'white-space:nowrap;text-align:left;color:inherit;min-height:40px;padding:0 2px">' +
        (hint ? U.esc(hint) : '—') + '</button>' +
        (ctx.mode === 'draft'
          ? '<button type="button" class="btn icon ghost" data-act="rmset" aria-label="Remove set" ' +
            'style="width:32px;height:40px;min-height:40px;border:none;color:var(--text-muted)">' + ic().close + '</button>'
          : '') +
        '</div>';
      // weight + reps inputs
      html += '<input class="input set-weight" id="' + wid + '" data-act="w" type="text" inputmode="decimal" ' +
        'autocomplete="off" enterkeyhint="next" aria-label="Weight" placeholder="' + U.esc(phW) + '" ' +
        'value="' + (s.weightKg > 0 ? U.esc(dispW(s.weightKg)) : '') + '">';
      html += '<input class="input" id="' + rid + '" data-act="r" type="text" inputmode="numeric" ' +
        'autocomplete="off" enterkeyhint="next" aria-label="Reps" placeholder="' + U.esc(phR) + '" ' +
        'value="' + (s.reps > 0 ? s.reps : '') + '">';
      if (showRpe) {
        html += '<input class="input" id="' + pid + '" data-act="rpe-in" type="text" inputmode="decimal" ' +
          'autocomplete="off" aria-label="RPE" placeholder="RPE" ' +
          'value="' + (s.rpe !== null && s.rpe !== undefined ? U.esc(String(s.rpe)) : '') + '">';
      }
      // trailing: check (draft) / remove (edit)
      html += ctx.mode === 'draft'
        ? '<button type="button" class="set-check" data-act="check" aria-pressed="' + (done ? 'true' : 'false') +
          '" aria-label="Mark set complete">' + ic().check + '</button>'
        : '<button type="button" class="set-check" data-act="rmset" aria-label="Remove set">' + ic().close + '</button>';
      html += '</div>';
      return html;
    }

    function entryCardHTML(en) {
      const ex = exOf(en.exerciseId);
      const showRpe = showRpeOf(en);
      const prev = prevFor(en.exerciseId);
      const notesShown = notesShownOf(en);
      const plateOk = ex && BAR_EQUIPMENT.indexOf(ex.equipment) >= 0;
      const unit = U.unitLabel(App.units()).toUpperCase();

      let html = '<div class="card" data-eid="' + U.esc(en.id) + '">';
      html += '<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px">' +
        '<div style="flex:1;min-width:0">' +
        '<div style="font-size:16px;font-weight:600;line-height:1.3">' + U.esc(exName(en.exerciseId)) + '</div>' +
        '<div class="muted" style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
        U.esc(exSub(ex)) + '</div></div>' +
        '<div style="display:flex;gap:2px;flex:none">' +
        '<button type="button" class="btn ghost small" data-act="rpe" aria-pressed="' + (showRpe ? 'true' : 'false') +
        '" title="Toggle RPE column"' + (showRpe ? ' style="color:var(--accent);border-color:rgba(48,209,88,.45)"' : '') + '>RPE</button>' +
        (plateOk
          ? '<button type="button" class="btn icon ghost" data-act="plates" title="Plate calculator" aria-label="Plate calculator">' + PLATE_ICON + '</button>'
          : '') +
        '<button type="button" class="btn icon ghost" data-act="exnotes" title="Exercise notes" aria-label="Exercise notes">' + ic().edit + '</button>' +
        '<button type="button" class="btn icon ghost" data-act="swap" title="Swap exercise" aria-label="Swap exercise">' + ic().sync + '</button>' +
        '<button type="button" class="btn icon ghost" data-act="delentry" title="Remove exercise" aria-label="Remove exercise">' + ic().trash + '</button>' +
        '</div></div>';

      if ((en.sets || []).length) {
        html += '<div class="set-row set-head' + (showRpe ? '' : ' no-rpe') + '" aria-hidden="true">' +
          '<div>SET</div><div style="text-align:left;padding-left:2px">PREV</div><div>' + unit + '</div>' +
          '<div>REPS</div>' + (showRpe ? '<div>RPE</div>' : '') + '<div></div></div>';
        html += en.sets.map(function (s, i) { return setRowHTML(en, s, i, showRpe, prev); }).join('');
      } else {
        html += '<p class="muted" style="font-size:13px;margin:4px 0 8px">No sets — add one below.</p>';
      }

      html += '<div style="display:flex;gap:8px;margin-top:6px">' +
        '<button type="button" class="btn ghost small" data-act="addset">' + ic().plus + ' Add set</button></div>';
      if (notesShown) {
        html += '<textarea class="input" data-act="ennotes" rows="2" placeholder="Exercise notes" ' +
          'id="enn_' + U.esc(en.id) + '" style="margin-top:8px">' + U.esc(en.notes || '') + '</textarea>';
      }
      html += '</div>';
      return html;
    }

    function repaint() {
      if (!ctx.model.entries.length) {
        root.innerHTML = '<div class="empty" style="padding:32px 24px">' + ic().log +
          '<h3>No exercises yet</h3><p>Add an exercise to start logging sets.</p></div>';
      } else {
        root.innerHTML = ctx.model.entries.map(entryCardHTML).join('');
      }
      if (ctx.onStats) ctx.onStats();
    }

    function onCheck(en, i, rowEl, btn) {
      const s = en.sets[i];
      if (!s) return;
      if (!s.done) {
        if (!s.weightKg || !s.reps) {
          let src = null;
          for (let j = i - 1; j >= 0; j--) {
            const p = en.sets[j];
            if ((p.weightKg || 0) > 0 || (p.reps || 0) > 0) { src = p; break; }
          }
          if (!src) src = hintSetOf(prevFor(en.exerciseId), i);
          if (src) {
            if (!s.weightKg) s.weightKg = src.weightKg || 0;
            if (!s.reps) s.reps = src.reps || 0;
          }
        }
        s.done = true;
        if (s.type !== 'warmup') startRest(settingsOf(user()).restTimerSec);
      } else {
        s.done = false;
      }
      rowEl.classList.toggle('done', !!s.done);
      btn.setAttribute('aria-pressed', s.done ? 'true' : 'false');
      const wIn = rowEl.querySelector('[data-act="w"]');
      const rIn = rowEl.querySelector('[data-act="r"]');
      if (wIn && s.weightKg > 0 && wIn.value === '') wIn.value = dispW(s.weightKg);
      if (rIn && s.reps > 0 && rIn.value === '') rIn.value = String(s.reps);
      ctx.persist();
      if (ctx.onStats) ctx.onStats();
    }

    U.on(root, 'click', 'button[data-act]', function (e, btn) {
      const card = btn.closest('[data-eid]');
      if (!card) return;
      const en = findEntry(card);
      if (!en) return;
      const act = btn.getAttribute('data-act');
      const rowEl = btn.closest('.set-row');
      const i = rowEl ? parseInt(rowEl.getAttribute('data-i'), 10) : -1;
      const s = i >= 0 ? en.sets[i] : null;

      if (act === 'check' && s) { onCheck(en, i, rowEl, btn); return; }

      if (act === 'type' && s) {
        s.type = s.type === 'warmup' ? 'work' : 'warmup';
        rowEl.classList.toggle('warmup', s.type === 'warmup');
        ctx.persist();
        if (ctx.onStats) ctx.onStats();
        return;
      }

      if (act === 'hint' && s) {
        const hs = hintSetOf(prevFor(en.exerciseId), i);
        if (!hs) return;
        s.weightKg = hs.weightKg || 0;
        s.reps = hs.reps || 0;
        const wIn = rowEl.querySelector('[data-act="w"]');
        const rIn = rowEl.querySelector('[data-act="r"]');
        if (wIn) wIn.value = s.weightKg > 0 ? dispW(s.weightKg) : '';
        if (rIn) rIn.value = s.reps > 0 ? String(s.reps) : '';
        ctx.persist();
        if (ctx.onStats) ctx.onStats();
        return;
      }

      if (act === 'rmset' && s) {
        en.sets.splice(i, 1);
        ctx.persist();
        repaint();
        return;
      }

      if (act === 'addset') {
        const last = en.sets[en.sets.length - 1] || null;
        en.sets.push({
          weightKg: last ? last.weightKg || 0 : 0,
          reps: last ? last.reps || 0 : 0,
          type: last && last.type === 'warmup' ? 'warmup' : 'work',
          rpe: null,
          done: false
        });
        ctx.persist();
        repaint();
        focusInput('sw_' + en.id + '_' + (en.sets.length - 1));
        return;
      }

      if (act === 'rpe') {
        en.showRpe = !showRpeOf(en);
        ctx.persist();
        repaint();
        return;
      }

      if (act === 'exnotes') {
        en._notesOpen = !notesShownOf(en);
        ctx.persist();
        repaint();
        if (en._notesOpen) focusInput('enn_' + en.id);
        return;
      }

      if (act === 'swap') {
        openExercisePicker({
          title: 'Swap exercise',
          multi: false,
          onPick: function (ids) {
            if (!ids.length || ids[0] === en.exerciseId) return;
            // in draft mode the draft object may have been reloaded by a
            // rerender while the picker was open — re-resolve by entry id
            if (ctx.mode === 'draft' && draft) {
              const live = draft.entries.find(function (x) { return x.id === en.id; });
              if (live) {
                live.exerciseId = ids[0];
                saveDraft();
                App.rerender();
              }
              return;
            }
            en.exerciseId = ids[0];
            delete prevCache[ids[0]];
            ctx.persist();
            repaint();
          }
        });
        return;
      }

      if (act === 'plates') {
        let kg = 0;
        for (let j = en.sets.length - 1; j >= 0; j--) {
          if ((en.sets[j].weightKg || 0) > 0) { kg = en.sets[j].weightKg; break; }
        }
        if (!kg) {
          const prev = prevFor(en.exerciseId);
          const hs = prev.length ? prev[prev.length - 1] : null;
          if (hs) kg = hs.weightKg || 0;
        }
        openPlateCalc(kg);
        return;
      }

      if (act === 'delentry') {
        const hasData = (en.sets || []).some(function (x) { return (x.reps || 0) > 0 || (x.weightKg || 0) > 0; });
        const doRemove = function () {
          if (ctx.mode === 'draft' && draft) {
            draft.entries = draft.entries.filter(function (x) { return x.id !== en.id; });
            saveDraft();
            App.rerender();
            return;
          }
          ctx.model.entries = ctx.model.entries.filter(function (x) { return x !== en; });
          ctx.persist();
          repaint();
        };
        if (hasData) {
          App.confirm({
            title: 'Remove exercise?',
            message: exName(en.exerciseId) + ' and its logged sets will be removed from this workout.',
            danger: true,
            confirmLabel: 'Remove'
          }).then(function (ok) { if (ok) doRemove(); });
        } else {
          doRemove();
        }
      }
    });

    U.on(root, 'input', 'input[data-act], textarea[data-act]', function (e, inp) {
      const card = inp.closest('[data-eid]');
      if (!card) return;
      const en = findEntry(card);
      if (!en) return;
      const act = inp.getAttribute('data-act');
      if (act === 'ennotes') { en.notes = inp.value; ctx.persist(); return; }
      const rowEl = inp.closest('.set-row');
      if (!rowEl) return;
      const s = en.sets[parseInt(rowEl.getAttribute('data-i'), 10)];
      if (!s) return;
      if (act === 'w') {
        s.weightKg = inp.value.trim() === '' ? 0 : U.displayToKg(inp.value, App.units());
      } else if (act === 'r') {
        const n = parseInt(inp.value, 10);
        s.reps = isNaN(n) || n < 0 ? 0 : n;
      } else if (act === 'rpe-in') {
        const f = parseFloat(inp.value);
        s.rpe = isNaN(f) ? null : U.clamp(f, 6, 10);
      }
      ctx.persist();
      if (ctx.onStats) ctx.onStats();
    });

    // Enter advances weight -> reps -> next set's weight -> next exercise
    U.on(root, 'keydown', 'input[data-act]', function (e, inp) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const card = inp.closest('[data-eid]');
      const rowEl = inp.closest('.set-row');
      if (!card || !rowEl) return;
      const eid = card.getAttribute('data-eid');
      const i = parseInt(rowEl.getAttribute('data-i'), 10);
      if (inp.getAttribute('data-act') === 'w') { focusInput('sr_' + eid + '_' + i); return; }
      const entries = ctx.model.entries;
      const ei = entries.findIndex(function (x) { return x.id === eid; });
      if (ei < 0) return;
      if (i + 1 < entries[ei].sets.length) { focusInput('sw_' + eid + '_' + (i + 1)); return; }
      for (let j = ei + 1; j < entries.length; j++) {
        if ((entries[j].sets || []).length) { focusInput('sw_' + entries[j].id + '_0'); return; }
      }
      inp.blur();
    });

    repaint();
    return { repaint: repaint };
  }

  /* ======================================================================
     Exercise picker sheet (search + filters + recents + multi-add + custom)
     ====================================================================== */

  function openExercisePicker(opts) {
    opts = opts || {};
    const multi = !!opts.multi;
    const u = user();
    const sel = [];
    const state = { q: '', muscle: null, equip: null };

    // last 10 distinct exercises for this user, most recent first
    const recents = [];
    if (u) {
      const ws = Store.workoutsFor(u.id);
      for (let i = 0; i < ws.length && recents.length < 10; i++) {
        (ws[i].entries || []).forEach(function (en) {
          if (recents.length < 10 && en.exerciseId &&
              recents.indexOf(en.exerciseId) < 0 && exOf(en.exerciseId)) {
            recents.push(en.exerciseId);
          }
        });
      }
    }

    const content = document.createElement('div');
    content.innerHTML =
      '<div class="searchbar" style="margin-bottom:10px">' + ic().search +
      '<input class="input" id="xp-q" type="search" placeholder="Search exercises" autocomplete="off"></div>' +
      '<div class="chip-row" id="xp-mus" style="margin-bottom:8px"></div>' +
      '<div class="chip-row" id="xp-eq" style="margin-bottom:4px"></div>' +
      '<div id="xp-res" style="max-height:46vh;overflow-y:auto;overscroll-behavior:contain"></div>' +
      (multi
        ? '<div style="padding-top:12px"><button type="button" class="btn primary" id="xp-commit" style="width:100%" disabled>Add exercises</button></div>'
        : '');

    const resEl = U.$('#xp-res', content);
    const qEl = U.$('#xp-q', content);

    function chipsHTML() {
      function chip(attr, id, label, active) {
        return '<button type="button" class="chip' + (active ? ' active' : '') + '" ' + attr + '="' +
          U.esc(id) + '" aria-pressed="' + (active ? 'true' : 'false') + '">' + U.esc(label) + '</button>';
      }
      U.$('#xp-mus', content).innerHTML =
        chip('data-mus', '', 'All muscles', !state.muscle) +
        ExerciseDB.MUSCLES.map(function (m) { return chip('data-mus', m.id, m.short, state.muscle === m.id); }).join('');
      U.$('#xp-eq', content).innerHTML =
        chip('data-eq', '', 'All equipment', !state.equip) +
        ExerciseDB.EQUIPMENT.map(function (e) { return chip('data-eq', e.id, e.label, state.equip === e.id); }).join('');
    }

    function rowHTML(ex) {
      const on = sel.indexOf(ex.id) >= 0;
      return '<button type="button" class="list-row" data-x="' + U.esc(ex.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
        '<div class="body"><div class="title">' + U.esc(ex.name) + '</div>' +
        '<div class="sub">' + U.esc(exSub(ex)) + '</div></div>' +
        (on ? '<span class="trailing" style="color:var(--accent)">' + ic().check + '</span>' : '') +
        '</button>';
    }

    function renderResults() {
      const filtering = !!(state.q || state.muscle || state.equip);
      const list = ExerciseDB.search(state.q, { muscle: state.muscle, equipment: state.equip });
      let html = '';
      if (!filtering && recents.length) {
        html += sectionLabel('Recent') +
          '<div class="list">' + recents.map(function (id) { return rowHTML(exOf(id)); }).join('') + '</div>';
      }
      html += sectionLabel(filtering ? 'Results' : 'All exercises');
      html += list.length
        ? '<div class="list">' + list.slice(0, 80).map(rowHTML).join('') + '</div>'
        : '<p class="muted" style="font-size:13px;padding:8px 2px">No exercises match. Try fewer filters, or create your own below.</p>';
      html += '<div class="list" style="margin-top:10px">' +
        '<button type="button" class="list-row" data-x="__create">' +
        '<span class="leading">' + ic().plus + '</span>' +
        '<div class="body"><div class="title">Create custom exercise</div>' +
        '<div class="sub">Add your own movement to the library</div></div></button></div>';
      resEl.innerHTML = html;
    }

    function updateCommit() {
      if (!multi) return;
      const btn = U.$('#xp-commit', content);
      btn.disabled = !sel.length;
      btn.textContent = sel.length
        ? 'Add ' + sel.length + ' exercise' + (sel.length > 1 ? 's' : '')
        : 'Add exercises';
    }

    let api = null;
    function finish(ids) {
      if (api) api.close();
      if (typeof opts.onPick === 'function' && ids.length) opts.onPick(ids);
    }

    U.on(content, 'click', '.chip[data-mus]', function (e, chip) {
      const id = chip.getAttribute('data-mus');
      state.muscle = id || null;
      chipsHTML();
      renderResults();
    });
    U.on(content, 'click', '.chip[data-eq]', function (e, chip) {
      const id = chip.getAttribute('data-eq');
      state.equip = id || null;
      chipsHTML();
      renderResults();
    });
    qEl.addEventListener('input', function () {
      state.q = qEl.value.trim();
      renderResults();
    });

    U.on(content, 'click', '.list-row[data-x]', function (e, row) {
      const id = row.getAttribute('data-x');
      if (id === '__create') {
        openCustomExerciseForm(function (ex) {
          if (multi) {
            if (sel.indexOf(ex.id) < 0) sel.push(ex.id);
            renderResults();
            updateCommit();
          } else {
            finish([ex.id]);
          }
        });
        return;
      }
      if (multi) {
        const at = sel.indexOf(id);
        if (at >= 0) sel.splice(at, 1);
        else sel.push(id);
        renderResults();
        updateCommit();
      } else {
        finish([id]);
      }
    });

    if (multi) {
      U.$('#xp-commit', content).addEventListener('click', function () { finish(sel.slice()); });
    }

    chipsHTML();
    renderResults();
    api = App.sheet({ title: opts.title || 'Add exercise', content: content });
  }

  function openCustomExerciseForm(cb) {
    const content = document.createElement('div');
    content.innerHTML =
      '<div class="field"><label for="cx-name">Name</label>' +
      '<input class="input" id="cx-name" placeholder="e.g. Landmine Press" autocomplete="off"></div>' +
      '<div class="field"><label for="cx-prim">Primary muscle</label>' +
      '<select class="select" id="cx-prim">' +
      ExerciseDB.MUSCLES.map(function (m) {
        return '<option value="' + U.esc(m.id) + '">' + U.esc(m.label) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field"><label>Secondary muscles</label>' +
      '<div class="chip-row" id="cx-sec" style="flex-wrap:wrap">' +
      ExerciseDB.MUSCLES.map(function (m) {
        return '<button type="button" class="chip" data-m="' + U.esc(m.id) + '" aria-pressed="false">' +
          U.esc(m.short) + '</button>';
      }).join('') + '</div></div>' +
      '<div class="field-row">' +
      '<div class="field"><label for="cx-eq">Equipment</label><select class="select" id="cx-eq">' +
      ExerciseDB.EQUIPMENT.map(function (e) {
        return '<option value="' + U.esc(e.id) + '">' + U.esc(e.label) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field"><label for="cx-cat">Category</label><select class="select" id="cx-cat">' +
      ExerciseDB.CATEGORIES.map(function (c) {
        return '<option value="' + U.esc(c.id) + '">' + U.esc(c.label) + '</option>';
      }).join('') + '</select></div></div>';

    U.on(content, 'click', '.chip[data-m]', function (e, chip) {
      const on = !chip.classList.contains('active');
      chip.classList.toggle('active', on);
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    App.modal({
      title: 'Custom exercise',
      content: content,
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        {
          label: 'Create',
          kind: 'primary',
          keepOpen: true,
          onClick: function (api) {
            const name = U.$('#cx-name', content).value.trim();
            if (!name) { App.toast('Give the exercise a name', 'err'); return; }
            const prim = U.$('#cx-prim', content).value;
            const secondary = U.$$('#cx-sec .chip.active', content)
              .map(function (c) { return c.getAttribute('data-m'); })
              .filter(function (m) { return m !== prim; });
            const ex = Store.addCustomExercise({
              name: name,
              primaryMuscles: [prim],
              secondaryMuscles: secondary,
              equipment: U.$('#cx-eq', content).value,
              category: U.$('#cx-cat', content).value
            });
            api.close();
            App.toast('Exercise created', 'ok');
            if (typeof cb === 'function') cb(ex);
          }
        }
      ]
    });
  }

  /* ======================================================================
     Plate calculator
     ====================================================================== */

  // Plates stored in kg are approximations of their nominal size (11.3 kg ~ 25 lb).
  // Snap the display value to the nearest 0.25 so labels read clean (25, not 24.9).
  function plateDisp(kg) {
    const v = Math.round(U.kgToDisplay(kg || 0, App.units()) * 4) / 4;
    return v + ' ' + U.unitLabel(App.units());
  }

  function plateBreakdownHTML(targetKg, s) {
    if (!targetKg || targetKg <= 0) {
      return '<p class="muted" style="font-size:14px">Enter a target weight to see the per-side plate breakdown.</p>';
    }
    const barTxt = plateDisp(s.barWeightKg);
    if (targetKg < s.barWeightKg - 1e-6) {
      return '<p class="muted" style="font-size:14px">' + U.esc(App.fmtWeight(targetKg, { precise: true })) +
        ' is lighter than the bar (' + U.esc(barTxt) + '). Use a lighter bar or dumbbells.</p>';
    }
    let perSide = (targetKg - s.barWeightKg) / 2;
    const plates = s.plateWeightsKg.slice().sort(function (a, b) { return b - a; });
    const picks = [];
    plates.forEach(function (p) {
      if (p <= 0) return;
      const n = Math.floor((perSide + 1e-6) / p);
      if (n > 0) { picks.push({ p: p, n: n }); perSide -= n * p; }
    });
    const loadedKg = s.barWeightKg + 2 * picks.reduce(function (a, x) { return a + x.p * x.n; }, 0);

    let html = '<div class="list-row" style="padding:10px 0;min-height:0">' +
      '<div class="body"><div class="title">Bar</div></div>' +
      '<span class="trailing">' + U.esc(barTxt) + '</span></div>';
    if (picks.length) {
      html += sectionLabel('Per side') + picks.map(function (x) {
        return '<div class="list-row" style="padding:10px 0;min-height:0">' +
          '<span class="leading" style="width:32px;height:32px;font-size:14px;color:var(--accent)">' + PLATE_ICON + '</span>' +
          '<div class="body"><div class="title">' + U.esc(plateDisp(x.p)) + '</div></div>' +
          '<span class="trailing" style="font-weight:600">× ' + x.n + '</span></div>';
      }).join('');
      html += '<p class="muted" style="font-size:13px;margin-top:10px">Bar + per side: ' +
        U.esc(picks.map(function (x) {
          return plateDisp(x.p).replace(' ' + U.unitLabel(App.units()), '') + ' × ' + x.n;
        }).join(', ')) + '</p>';
    } else {
      html += '<p class="muted" style="font-size:14px;margin-top:8px">Empty bar — no plates needed.</p>';
    }
    if (perSide > 0.05) {
      html += '<p style="font-size:13px;color:var(--orange);margin-top:6px">Loads to ' +
        U.esc(App.fmtWeight(loadedKg, { precise: true })) + ' — about ' +
        U.esc(App.fmtWeight(perSide, { precise: true })) + ' short per side with your plates.</p>';
    }
    return html;
  }

  function openPlateCalc(initialKg) {
    const s = settingsOf(user());
    const units = App.units();
    const content = document.createElement('div');
    content.innerHTML =
      '<div class="field"><label for="pc-w">Target weight (' + U.esc(U.unitLabel(units)) + ')</label>' +
      '<input class="input" id="pc-w" type="text" inputmode="decimal" autocomplete="off" ' +
      'value="' + (initialKg > 0 ? U.esc(dispW(initialKg)) : '') + '"></div>' +
      '<div id="pc-out"></div>';
    const inp = U.$('#pc-w', content);
    const out = U.$('#pc-out', content);
    function compute() {
      out.innerHTML = plateBreakdownHTML(U.displayToKg(inp.value, units), s);
    }
    inp.addEventListener('input', compute);
    compute();
    App.sheet({ title: 'Plate calculator', content: content });
  }

  /* ======================================================================
     LOG view
     ====================================================================== */

  function renderLog(container, params) {
    const u = user();
    if (!u) {
      container.innerHTML = '<div class="empty">' + ic().users +
        '<h3>No profile selected</h3><p>Pick a profile to start logging.</p></div>';
      return;
    }
    draft = loadDraft();

    // draft belongs to a different family member
    if (draft && draft.userId !== u.id) {
      const owner = Store.state.users.find(function (x) { return x.id === draft.userId; });
      if (!owner) {
        clearDraft(); // orphaned draft (profile deleted)
      } else {
        renderDraftConflict(container, owner);
        return;
      }
    }

    if (!draft) {
      // honor deep-link params
      if (params && params.repeat) {
        const w = Store.workoutById(params.repeat);
        if (w) { beginFromWorkout(w); App.navigate('log'); return; }
      }
      if (params && params.template) {
        const t = Store.templatesFor(u.id).find(function (x) { return x.id === params.template; });
        if (t) { beginFromTemplate(t); App.navigate('log'); return; }
      }
      renderStartScreen(container, u);
      return;
    }

    renderActiveDraft(container, u);
  }

  function renderDraftConflict(container, owner) {
    container.innerHTML =
      '<div class="view-head"><h1>Workout</h1></div>' +
      '<div class="card" style="text-align:center;padding:28px 20px">' +
      '<div class="avatar" style="--user-color:' + U.esc(owner.color || 'var(--accent)') +
      ';width:56px;height:56px;font-size:26px;margin:0 auto 12px">' + U.esc(owner.emoji || '💪') + '</div>' +
      '<h3 style="font-size:17px;margin-bottom:6px">' + U.esc(owner.name) + ' has a workout in progress</h3>' +
      '<p class="muted" style="font-size:14px;max-width:340px;margin:0 auto 16px">Started ' +
      U.esc(U.relDate(draft.date).toLowerCase()) + ' with ' + draft.entries.length + ' exercise' +
      (draft.entries.length === 1 ? '' : 's') + '. Switch profiles to continue it, or discard it to start your own.</p>' +
      '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">' +
      '<button type="button" class="btn primary" id="lg-resume">Resume as ' + U.esc(owner.name) + '</button>' +
      '<button type="button" class="btn danger" id="lg-conflict-discard">' + ic().trash + ' Discard it</button>' +
      '</div></div>';

    U.$('#lg-resume', container).addEventListener('click', function () {
      Store.setCurrentUser(draft.userId);
      App.rerender();
    });
    U.$('#lg-conflict-discard', container).addEventListener('click', function () {
      App.confirm({
        title: 'Discard their workout?',
        message: 'This deletes ' + (draft ? draft.entries.length : 0) + ' logged exercise(s) from their unfinished workout.',
        danger: true,
        confirmLabel: 'Discard'
      }).then(function (ok) {
        if (ok) { clearDraft(); App.rerender(); }
      });
    });
  }

  /* ---------- state A: start screen ---------- */

  function renderStartScreen(container, u) {
    const last = Store.workoutsFor(u.id)[0] || null;
    const templates = Store.templatesFor(u.id).slice()
      .sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });

    let html = '<div class="view-head"><h1>Workout</h1></div>' +
      '<button type="button" class="btn primary" id="lg-start" style="width:100%;min-height:54px;font-size:16px">' +
      ic().plus + ' Start empty workout</button>';

    if (last) {
      const sets = Analytics.workoutSets(last);
      html += '<div class="card"><div class="card-title">Repeat last workout</div>' +
        '<div class="list-row" style="padding:0;min-height:0">' +
        '<div class="body"><div class="title">' + U.esc(last.name) + '</div>' +
        '<div class="sub">' + U.esc(U.relDate(last.date)) + ' · ' + last.entries.length + ' exercises · ' +
        sets + ' sets · ' + U.esc(fmtVol(Analytics.workoutVolume(last))) + '</div></div>' +
        '<button type="button" class="btn ghost small" data-repeat="' + U.esc(last.id) + '">' +
        ic().copy + ' Start</button></div></div>';
    }

    if (templates.length) {
      html += sectionLabel('Templates') + '<div class="list">' + templates.map(function (t) {
        const shared = t.userId === null || t.userId === undefined;
        return '<div class="list-row">' +
          '<span class="leading">' + U.esc(t.emoji || '📋') + '</span>' +
          '<div class="body"><div class="title">' + U.esc(t.name) +
          (shared ? ' <span class="badge blue">Shared</span>' : '') + '</div>' +
          '<div class="sub">' + t.entries.length + ' exercise' + (t.entries.length === 1 ? '' : 's') + '</div></div>' +
          '<button type="button" class="btn ghost small" data-tstart="' + U.esc(t.id) + '">Start</button>' +
          '</div>';
      }).join('') + '</div>' +
        '<button type="button" class="btn ghost small" id="lg-manage-tpl" style="align-self:flex-start">' +
        ic().templates + ' Manage templates</button>';
    } else {
      html += '<div class="card"><div class="card-title">Templates</div>' +
        '<p class="muted" style="font-size:14px;margin-bottom:10px">Build reusable workout plans and start them in one tap.</p>' +
        '<button type="button" class="btn ghost small" id="lg-manage-tpl">' + ic().plus + ' Create a template</button></div>';
    }

    container.innerHTML = html;

    U.$('#lg-start', container).addEventListener('click', function () {
      startDraft({});
      App.rerender();
    });
    U.$('#lg-manage-tpl', container).addEventListener('click', function () {
      App.navigate('templates');
    });
    U.on(container, 'click', '[data-repeat]', function (e, btn) {
      const w = Store.workoutById(btn.getAttribute('data-repeat'));
      if (w) { beginFromWorkout(w); App.rerender(); }
    });
    U.on(container, 'click', '[data-tstart]', function (e, btn) {
      const t = Store.templatesFor(u.id).find(function (x) { return x.id === btn.getAttribute('data-tstart'); });
      if (t) { beginFromTemplate(t); App.rerender(); }
    });
  }

  /* ---------- state B: active draft ---------- */

  function updateDraftStats() {
    const el = document.getElementById('lg-stats');
    if (!el || !draft) return;
    let total = 0, done = 0, vol = 0;
    draft.entries.forEach(function (en) {
      (en.sets || []).forEach(function (s) {
        total++;
        if (s.done) {
          done++;
          if (s.type !== 'warmup') vol += (s.weightKg || 0) * (s.reps || 0);
        }
      });
    });
    el.textContent = done + '/' + total + ' sets · ' + fmtVol(vol);
  }

  function renderActiveDraft(container, u) {
    const notesShown = draft._notesOpen === undefined ? !!draft.notes : !!draft._notesOpen;

    container.innerHTML =
      '<div class="card" style="position:sticky;top:calc(var(--topbar-h) + env(safe-area-inset-top, 0px) + 8px);z-index:20">' +
      '<div style="display:flex;gap:8px;align-items:center">' +
      '<input class="input" id="lg-name" aria-label="Workout name" autocomplete="off" ' +
      'style="flex:1;font-weight:600;min-width:0" value="' + U.esc(draft.name) + '">' +
      '<button type="button" class="btn primary" id="lg-finish">Finish</button></div>' +
      '<div style="display:flex;align-items:center;gap:10px;margin-top:8px;font-size:13px;color:var(--text-2)">' +
      '<span style="display:inline-flex;align-items:center;gap:4px;color:var(--accent);font-variant-numeric:tabular-nums">' +
      ic().timer + '<span id="lg-elapsed">0:00</span></span>' +
      '<span id="lg-stats" style="font-variant-numeric:tabular-nums"></span>' +
      '<span style="flex:1"></span>' +
      '<button type="button" class="btn icon ghost" id="lg-discard" aria-label="Discard workout" title="Discard workout">' +
      ic().trash + '</button></div></div>' +
      '<div id="lg-entries" style="display:flex;flex-direction:column;gap:16px"></div>' +
      '<button type="button" class="btn primary" id="lg-addex" style="width:100%">' + ic().plus + ' Add exercise</button>' +
      (notesShown
        ? '<div class="card"><div class="card-title">Workout notes</div>' +
          '<textarea class="input" id="lg-notes" rows="3" placeholder="How did it go?">' + U.esc(draft.notes || '') + '</textarea></div>'
        : '<button type="button" class="btn ghost small" id="lg-notes-btn" style="align-self:flex-start">' +
          ic().edit + ' Add notes</button>');

    mountEditor(U.$('#lg-entries', container), {
      mode: 'draft',
      model: draft,
      persist: saveDraft,
      prev: function (exId) { return prevSetsFor(u.id, exId); },
      onStats: updateDraftStats
    });

    U.$('#lg-name', container).addEventListener('input', function (e) {
      draft.name = e.target.value;
      saveDraft();
    });
    U.$('#lg-name', container).addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
    });

    U.$('#lg-finish', container).addEventListener('click', openFinishSheet);

    U.$('#lg-discard', container).addEventListener('click', function () {
      App.confirm({
        title: 'Discard workout?',
        message: 'All sets logged in this session will be lost. This cannot be undone.',
        danger: true,
        confirmLabel: 'Discard'
      }).then(function (ok) {
        if (ok) {
          clearDraft();
          App.rerender();
          App.toast('Workout discarded');
        }
      });
    });

    U.$('#lg-addex', container).addEventListener('click', function () {
      openExercisePicker({
        title: 'Add exercise',
        multi: true,
        onPick: function (ids) {
          if (!draft) return;
          ids.forEach(function (id) { draft.entries.push(newEntry(id, 3)); });
          saveDraft();
          App.rerender();
          const cards = U.$$('#lg-entries [data-eid]');
          if (cards.length) cards[cards.length - 1].scrollIntoView({ block: 'center' });
        }
      });
    });

    const notesBtn = U.$('#lg-notes-btn', container);
    if (notesBtn) {
      notesBtn.addEventListener('click', function () {
        draft._notesOpen = true;
        saveDraft();
        App.rerender();
        focusInput('lg-notes');
      });
    }
    const notesTa = U.$('#lg-notes', container);
    if (notesTa) {
      notesTa.addEventListener('input', function (e) {
        draft.notes = e.target.value;
        saveDraft();
      });
    }

    updateDraftStats();
    startElapsedTicker();
  }

  /* ---------- state C: finish flow ---------- */

  // Valid set: reps > 0 (weight 0 is fine — bodyweight). Drops the 'done' flag.
  function buildFinishedEntries() {
    const entries = [];
    (draft.entries || []).forEach(function (en) {
      if (!en.exerciseId) return;
      const sets = (en.sets || [])
        .filter(function (s) { return (s.reps || 0) > 0; })
        .map(function (s) {
          return {
            weightKg: s.weightKg || 0,
            reps: s.reps,
            type: s.type === 'warmup' ? 'warmup' : 'work',
            rpe: s.rpe === null || s.rpe === undefined ? null : s.rpe
          };
        });
      if (sets.length) entries.push({ id: en.id, exerciseId: en.exerciseId, notes: en.notes || '', sets: sets });
    });
    return entries;
  }

  function prKey(p) { return p.date + '|' + p.exerciseId + '|' + p.kind + '|' + p.value; }

  function prLabel(p) {
    if (p.kind === 'weight') {
      return 'Top weight ' + App.fmtWeight(p.value, { precise: true }) +
        (p.prev ? ' — was ' + App.fmtWeight(p.prev, { precise: true }) : '');
    }
    if (p.kind === 'e1rm') {
      return 'e1RM ' + App.fmtWeight(p.value) + (p.prev ? ' — was ' + App.fmtWeight(p.prev) : '');
    }
    if (p.kind === 'reps') {
      return p.value + ' reps at top weight' + (p.prev ? ' — was ' + p.prev : '');
    }
    return 'Session volume ' + fmtVol(p.value) + (p.prev ? ' — was ' + fmtVol(p.prev) : '');
  }

  function openFinishSheet() {
    if (!draft) return;
    const entries = buildFinishedEntries();
    if (!entries.length) {
      App.toast('Log at least one set with reps first', 'err');
      return;
    }
    const durationMin = Math.max(1, Math.round((Date.now() - draft.startedAt) / 60000));
    // createdAt must be later than any earlier same-day workout so PR ordering
    // (Analytics sorts same-date ties by createdAt asc) treats this as the latest.
    const candidate = { date: draft.date, createdAt: Date.now(), entries: entries };
    const vol = Analytics.workoutVolume(candidate);
    const sets = Analytics.workoutSets(candidate);

    // new PRs = events present after adding this workout that weren't before
    const mine = Store.workoutsFor(draft.userId);
    const before = Analytics.prs(mine);
    const after = Analytics.prs(mine.concat([candidate]));
    const seen = {};
    before.forEach(function (p) { const k = prKey(p); seen[k] = (seen[k] || 0) + 1; });
    const newPrs = after.filter(function (p) {
      const k = prKey(p);
      if (seen[k]) { seen[k]--; return false; }
      return p.date === draft.date;
    });

    function stat(label, value) {
      return '<div class="stat"><span class="label">' + U.esc(label) + '</span>' +
        '<span class="value" style="font-size:20px">' + U.esc(value) + '</span></div>';
    }

    let html = '<div class="stat-grid" style="grid-template-columns:repeat(2,1fr);margin-bottom:14px">' +
      stat('Duration', U.fmtDuration(durationMin)) +
      stat('Volume', fmtVol(vol)) +
      stat('Sets', String(sets)) +
      stat('Exercises', String(entries.length)) +
      '</div>';

    if (newPrs.length) {
      html += sectionLabel(newPrs.length + ' new PR' + (newPrs.length > 1 ? 's' : '') + ' 🎉') +
        '<div class="list" style="margin-bottom:14px">' + newPrs.slice(0, 10).map(function (p) {
          return '<div class="list-row"><span class="leading" style="background:rgba(255,159,10,.14)">🏆</span>' +
            '<div class="body"><div class="title">' + U.esc(exName(p.exerciseId)) + '</div>' +
            '<div class="sub">' + U.esc(prLabel(p)) + '</div></div></div>';
        }).join('') + '</div>';
    }

    html += '<div class="field"><label for="fs-name">Workout name</label>' +
      '<input class="input" id="fs-name" autocomplete="off" value="' + U.esc(draft.name) + '"></div>' +
      '<div class="field"><label for="fs-notes">Notes</label>' +
      '<textarea class="input" id="fs-notes" rows="2" placeholder="Optional">' + U.esc(draft.notes || '') + '</textarea></div>';

    const content = document.createElement('div');
    content.innerHTML = html;

    App.sheet({
      title: 'Finish workout',
      content: content,
      actions: [
        { label: 'Keep logging', kind: 'ghost' },
        {
          label: 'Save workout',
          kind: 'primary',
          onClick: function () {
            if (!draft) return;
            const endedAt = Date.now();
            Store.addWorkout({
              userId: draft.userId,
              date: draft.date,
              name: U.$('#fs-name', content).value.trim() || draft.name || defaultDraftName(),
              notes: U.$('#fs-notes', content).value,
              startedAt: draft.startedAt,
              endedAt: endedAt,
              durationMin: Math.max(1, Math.round((endedAt - draft.startedAt) / 60000)),
              entries: entries
            });
            clearDraft();
            App.navigate('history');
            App.toast('Workout saved', 'ok');
          }
        }
      ]
    });
  }

  /* ======================================================================
     HISTORY view
     ====================================================================== */

  function workoutSub(w) {
    const bits = [];
    bits.push(w.entries.length + ' exercise' + (w.entries.length === 1 ? '' : 's'));
    bits.push(Analytics.workoutSets(w) + ' sets');
    const vol = Analytics.workoutVolume(w);
    if (vol > 0) bits.push(fmtVol(vol));
    const dur = U.fmtDuration(w.durationMin);
    if (dur) bits.push(dur);
    return bits.join(' · ');
  }

  function renderHistory(container) {
    const u = user();
    if (!u) { container.innerHTML = '<div class="empty">' + ic().users + '<h3>No profile selected</h3></div>'; return; }
    const ws = Store.workoutsFor(u.id); // date desc

    let html = '<div class="view-head"><h1>History</h1>' +
      '<button type="button" class="btn ghost small" id="hist-log">' + ic().plus + ' Log workout</button></div>';

    if (!ws.length) {
      html += '<div class="empty">' + ic().history +
        '<h3>No workouts yet</h3><p>Finished workouts land here, grouped by week, with volume and PR highlights.</p>' +
        '<button type="button" class="btn primary" id="hist-start">' + ic().plus + ' Log your first workout</button></div>';
      container.innerHTML = html;
      U.$('#hist-log', container).addEventListener('click', function () { App.navigate('log'); });
      U.$('#hist-start', container).addEventListener('click', function () { App.navigate('log'); });
      return;
    }

    const prByDate = U.groupBy(Analytics.prs(ws), function (p) { return p.date; });
    const thisWeek = U.weekStart(U.todayStr());
    const lastWeek = U.addDays(thisWeek, -7);

    // sequential week groups (input already date desc)
    const groups = [];
    let cur = null;
    ws.forEach(function (w) {
      const k = U.weekStart(w.date);
      if (!cur || cur.key !== k) { cur = { key: k, rows: [] }; groups.push(cur); }
      cur.rows.push(w);
    });

    groups.forEach(function (g) {
      const label = g.key === thisWeek ? 'This week'
        : g.key === lastWeek ? 'Last week'
        : U.fmtDate(g.key) + ' – ' + U.fmtDate(U.addDays(g.key, 6));
      html += sectionLabel(label) + '<div class="list">' + g.rows.map(function (w) {
        const d = U.strToDate(w.date);
        const prCount = (prByDate[w.date] || []).filter(function (p) {
          return w.entries.some(function (en) { return en.exerciseId === p.exerciseId; });
        }).length;
        return '<button type="button" class="list-row" data-wid="' + U.esc(w.id) + '">' +
          '<span class="leading" style="flex-direction:column;line-height:1.05;gap:0">' +
          '<b style="font-size:15px">' + d.getDate() + '</b>' +
          '<span style="font-size:9px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted)">' +
          U.esc(U.fmtDate(w.date).split(' ')[0]) + '</span></span>' +
          '<div class="body"><div class="title">' + U.esc(w.name) + '</div>' +
          '<div class="sub">' + U.esc(workoutSub(w)) + '</div></div>' +
          '<span class="trailing">' +
          (prCount ? '<span class="badge orange">🏆 ' + prCount + '</span>' : '') +
          '<span class="chevron">' + ic().chevron + '</span></span></button>';
      }).join('') + '</div>';
    });

    container.innerHTML = html;
    U.$('#hist-log', container).addEventListener('click', function () { App.navigate('log'); });
    U.on(container, 'click', '.list-row[data-wid]', function (e, row) {
      openWorkoutDetail(row.getAttribute('data-wid'));
    });
  }

  function setsString(sets) {
    return (sets || []).map(function (s) {
      return (s.type === 'warmup' ? 'W ' : '') + dispW(s.weightKg) + '×' + (s.reps || 0);
    }).join(', ');
  }

  function openWorkoutDetail(id) {
    const w = Store.workoutById(id);
    if (!w) return;

    let html = '<p class="muted" style="font-size:13px;margin-bottom:12px">' +
      U.esc(U.fmtDateLong(w.date)) + ' · ' + U.esc(workoutSub(w)) + '</p>';

    html += '<div class="table-wrap"><table class="table"><thead><tr>' +
      '<th>Exercise</th><th>Sets (' + U.esc(U.unitLabel(App.units())) + ' × reps)</th><th class="num">Volume</th>' +
      '</tr></thead><tbody>' +
      w.entries.map(function (en) {
        const vol = U.sum(en.sets || [], Analytics.setVolume);
        return '<tr><td>' + U.esc(exName(en.exerciseId)) + '</td>' +
          '<td style="white-space:normal">' + U.esc(setsString(en.sets)) + '</td>' +
          '<td class="num">' + U.esc(fmtVol(vol)) + '</td></tr>';
      }).join('') + '</tbody></table></div>';

    if (w.notes) {
      html += sectionLabel('Notes') +
        '<p style="font-size:14px;color:var(--text-2);white-space:pre-wrap">' + U.esc(w.notes) + '</p>';
    }
    const exNotes = w.entries.filter(function (en) { return en.notes; });
    if (exNotes.length) {
      html += sectionLabel('Exercise notes') + exNotes.map(function (en) {
        return '<p style="font-size:13px;color:var(--text-2);margin-bottom:6px"><b>' +
          U.esc(exName(en.exerciseId)) + ':</b> ' + U.esc(en.notes) + '</p>';
      }).join('');
    }

    App.sheet({
      title: w.name,
      content: html,
      actions: [
        {
          label: 'Delete',
          kind: 'danger',
          onClick: function () {
            App.confirm({
              title: 'Delete workout?',
              message: '“' + w.name + '” on ' + U.fmtDateLong(w.date) + ' will be permanently deleted.',
              danger: true
            }).then(function (ok) {
              if (ok) {
                Store.deleteWorkout(w.id);
                App.toast('Workout deleted');
              }
            });
          }
        },
        { label: 'Edit', kind: 'ghost', onClick: function () { openWorkoutEdit(w.id); } },
        {
          label: 'Repeat',
          kind: 'primary',
          onClick: function () {
            const existing = loadDraft();
            if (existing) {
              App.confirm({
                title: 'Replace workout in progress?',
                message: 'There is already an unfinished workout. Starting this one will discard it.',
                danger: true,
                confirmLabel: 'Replace'
              }).then(function (ok) {
                if (ok) { beginFromWorkout(w); App.navigate('log'); }
              });
            } else {
              beginFromWorkout(w);
              App.navigate('log');
            }
          }
        }
      ]
    });
  }

  /* ---------- edit a saved workout ---------- */

  function openWorkoutEdit(id) {
    const w = Store.workoutById(id);
    if (!w) return;
    const model = JSON.parse(JSON.stringify({
      name: w.name, date: w.date, notes: w.notes || '', entries: w.entries || []
    }));

    const content = document.createElement('div');
    content.innerHTML =
      '<div class="field-row">' +
      '<div class="field" style="flex:2"><label for="we-name">Name</label>' +
      '<input class="input" id="we-name" autocomplete="off" value="' + U.esc(model.name) + '"></div>' +
      '<div class="field" style="flex:1"><label for="we-date">Date</label>' +
      '<input class="input" id="we-date" type="date" value="' + U.esc(model.date) + '"></div></div>' +
      '<div id="we-entries" style="display:flex;flex-direction:column;gap:12px"></div>' +
      '<div style="margin:10px 0"><button type="button" class="btn ghost" id="we-addex" style="width:100%">' +
      ic().plus + ' Add exercise</button></div>' +
      '<div class="field"><label for="we-notes">Notes</label>' +
      '<textarea class="input" id="we-notes" rows="2">' + U.esc(model.notes) + '</textarea></div>';

    const editor = mountEditor(U.$('#we-entries', content), {
      mode: 'edit',
      model: model,
      persist: function () {},
      prev: function (exId) { return prevSetsFor(w.userId, exId, { excludeId: w.id, maxDate: w.date }); }
    });

    U.$('#we-name', content).addEventListener('input', function (e) { model.name = e.target.value; });
    U.$('#we-date', content).addEventListener('input', function (e) { model.date = e.target.value; });
    U.$('#we-notes', content).addEventListener('input', function (e) { model.notes = e.target.value; });
    U.$('#we-addex', content).addEventListener('click', function () {
      openExercisePicker({
        title: 'Add exercise',
        multi: true,
        onPick: function (ids) {
          ids.forEach(function (exId) { model.entries.push(newEntry(exId, 3)); });
          editor.repaint();
        }
      });
    });

    App.sheet({
      title: 'Edit workout',
      content: content,
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        {
          label: 'Save changes',
          kind: 'primary',
          onClick: function () {
            const entries = model.entries.map(function (en) {
              return {
                id: en.id,
                exerciseId: en.exerciseId,
                notes: en.notes || '',
                sets: (en.sets || [])
                  .filter(function (s) { return (s.reps || 0) > 0; })
                  .map(function (s) {
                    return {
                      weightKg: s.weightKg || 0,
                      reps: s.reps || 0,
                      type: s.type === 'warmup' ? 'warmup' : 'work',
                      rpe: s.rpe === null || s.rpe === undefined ? null : s.rpe
                    };
                  })
              };
            }).filter(function (en) { return en.exerciseId && en.sets.length; });
            Store.updateWorkout(w.id, {
              name: model.name.trim() || w.name,
              date: /^\d{4}-\d{2}-\d{2}$/.test(model.date) ? model.date : w.date,
              notes: model.notes,
              entries: entries
            });
            App.toast('Workout updated', 'ok');
          }
        }
      ]
    });
  }

  /* ======================================================================
     TEMPLATES view
     ====================================================================== */

  function renderTemplates(container) {
    const u = user();
    if (!u) { container.innerHTML = '<div class="empty">' + ic().users + '<h3>No profile selected</h3></div>'; return; }
    const templates = Store.templatesFor(u.id).slice()
      .sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
    const activeDraft = loadDraft();

    let html = '<div class="view-head"><h1>Templates</h1>' +
      '<button type="button" class="btn primary small" id="tp-new">' + ic().plus + ' New template</button></div>';

    if (activeDraft && activeDraft.userId === u.id && activeDraft.entries.length) {
      html += '<button type="button" class="card interactive" id="tp-fromdraft" style="display:flex;align-items:center;gap:12px">' +
        '<span class="icon-bubble">' + ic().copy + '</span>' +
        '<span style="flex:1;min-width:0;text-align:left"><b>Save current workout as template</b>' +
        '<span class="muted" style="display:block;font-size:13px">' + U.esc(activeDraft.name) + ' · ' +
        activeDraft.entries.length + ' exercise' + (activeDraft.entries.length === 1 ? '' : 's') + '</span></span>' +
        '<span class="chevron" style="color:var(--text-muted)">' + ic().chevron + '</span></button>';
    }

    if (!templates.length) {
      html += '<div class="empty">' + ic().templates +
        '<h3>No templates yet</h3><p>Templates are reusable workout plans — pick exercises, set targets, start in one tap.</p>' +
        '<button type="button" class="btn primary" id="tp-empty-new">' + ic().plus + ' Create your first template</button></div>';
    } else {
      html += templates.map(function (t) {
        const shared = t.userId === null || t.userId === undefined;
        const names = t.entries.map(function (e) { return exName(e.exerciseId); });
        const preview = names.slice(0, 4).join(' · ') + (names.length > 4 ? ' · +' + (names.length - 4) + ' more' : '');
        return '<div class="card" data-tid="' + U.esc(t.id) + '">' +
          '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">' +
          '<span style="font-size:26px;line-height:1">' + U.esc(t.emoji || '📋') + '</span>' +
          '<div style="flex:1;min-width:0"><div style="font-weight:600;font-size:16px">' + U.esc(t.name) +
          (shared ? ' <span class="badge blue">Shared</span>' : '') + '</div>' +
          '<div class="muted" style="font-size:12px">' + t.entries.length + ' exercise' +
          (t.entries.length === 1 ? '' : 's') + '</div></div></div>' +
          (names.length
            ? '<p class="muted" style="font-size:13px;margin-bottom:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
              U.esc(preview) + '</p>'
            : '') +
          '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
          '<button type="button" class="btn primary small" data-act="start">Start</button>' +
          '<button type="button" class="btn ghost small" data-act="edit">' + ic().edit + ' Edit</button>' +
          '<button type="button" class="chip' + (shared ? ' active' : '') + '" data-act="share" aria-pressed="' +
          (shared ? 'true' : 'false') + '" title="Share with the whole family">' + ic().users + ' Shared</button>' +
          '<span style="flex:1"></span>' +
          '<button type="button" class="btn icon ghost" data-act="del" aria-label="Delete template">' + ic().trash + '</button>' +
          '</div></div>';
      }).join('');
    }

    container.innerHTML = html;

    U.$('#tp-new', container).addEventListener('click', function () { openTemplateEditor(null, null); });
    const emptyNew = U.$('#tp-empty-new', container);
    if (emptyNew) emptyNew.addEventListener('click', function () { openTemplateEditor(null, null); });

    const fromDraft = U.$('#tp-fromdraft', container);
    if (fromDraft) {
      fromDraft.addEventListener('click', function () {
        const d = loadDraft();
        if (!d) return;
        openTemplateEditor(null, {
          name: d.name,
          emoji: '📋',
          shared: false,
          entries: d.entries.filter(function (en) { return en.exerciseId; }).map(function (en) {
            const reps = (en.sets || []).map(function (s) { return s.reps || 0; }).filter(function (r) { return r > 0; });
            return {
              exerciseId: en.exerciseId,
              targetSets: Math.max(1, (en.sets || []).length),
              targetRepsLow: reps.length ? Math.min.apply(null, reps) : 8,
              targetRepsHigh: reps.length ? Math.max.apply(null, reps) : 12
            };
          })
        });
      });
    }

    U.on(container, 'click', '[data-tid] [data-act]', function (e, btn) {
      const tid = btn.closest('[data-tid]').getAttribute('data-tid');
      const t = Store.templatesFor(u.id).find(function (x) { return x.id === tid; });
      if (!t) return;
      const act = btn.getAttribute('data-act');

      if (act === 'start') {
        const existing = loadDraft();
        if (existing) {
          App.confirm({
            title: 'Replace workout in progress?',
            message: 'There is already an unfinished workout. Starting this template will discard it.',
            danger: true,
            confirmLabel: 'Replace'
          }).then(function (ok) {
            if (ok) { beginFromTemplate(t); App.navigate('log'); }
          });
        } else {
          beginFromTemplate(t);
          App.navigate('log');
        }
      } else if (act === 'edit') {
        openTemplateEditor(t, null);
      } else if (act === 'share') {
        const shared = t.userId === null || t.userId === undefined;
        Store.updateTemplate(t.id, { userId: shared ? u.id : null });
        App.toast(shared ? 'Template is now private' : 'Template shared with the family', 'ok');
      } else if (act === 'del') {
        App.confirm({
          title: 'Delete template?',
          message: '“' + t.name + '” will be deleted' +
            (t.userId === null || t.userId === undefined ? ' for everyone' : '') + '.',
          danger: true
        }).then(function (ok) {
          if (ok) { Store.deleteTemplate(t.id); App.toast('Template deleted'); }
        });
      }
    });
  }

  function openTemplateEditor(t, prefill) {
    const u = user();
    if (!u) return;
    const model = t
      ? JSON.parse(JSON.stringify({
          name: t.name,
          emoji: t.emoji || '📋',
          shared: t.userId === null || t.userId === undefined,
          entries: t.entries || []
        }))
      : (prefill || { name: '', emoji: '📋', shared: false, entries: [] });

    const content = document.createElement('div');
    content.innerHTML =
      '<div class="field"><label for="tp-name">Name</label>' +
      '<input class="input" id="tp-name" placeholder="e.g. Push Day" autocomplete="off" value="' + U.esc(model.name) + '"></div>' +
      '<div class="field"><label>Emoji</label><div class="chip-row" id="tp-emoji" style="flex-wrap:wrap"></div></div>' +
      '<div class="field"><label>Sharing</label>' +
      '<button type="button" class="chip" id="tp-shared">' + ic().users + ' Share with family</button>' +
      '<p class="hint">Shared templates show up for every profile.</p></div>' +
      sectionLabel('Exercises') +
      '<div id="tp-rows"></div>' +
      '<button type="button" class="btn ghost" id="tp-addex" style="width:100%;margin-top:8px">' +
      ic().plus + ' Add exercises</button>';

    const rowsEl = U.$('#tp-rows', content);
    const emojiEl = U.$('#tp-emoji', content);
    const sharedBtn = U.$('#tp-shared', content);

    function paintEmoji() {
      emojiEl.innerHTML = TEMPLATE_EMOJIS.map(function (em) {
        const on = model.emoji === em;
        return '<button type="button" class="chip' + (on ? ' active' : '') + '" data-em="' + U.esc(em) +
          '" aria-pressed="' + (on ? 'true' : 'false') + '" style="padding:7px 10px;font-size:16px">' + em + '</button>';
      }).join('');
    }

    function paintShared() {
      sharedBtn.classList.toggle('active', !!model.shared);
      sharedBtn.setAttribute('aria-pressed', model.shared ? 'true' : 'false');
    }

    function paintRows() {
      if (!model.entries.length) {
        rowsEl.innerHTML = '<p class="muted" style="font-size:13px;padding:6px 2px">No exercises yet — add some below.</p>';
        return;
      }
      rowsEl.innerHTML = model.entries.map(function (e, i) {
        return '<div data-idx="' + i + '" style="display:flex;align-items:center;gap:6px;padding:6px 0;' +
          'border-bottom:1px solid var(--hairline)">' +
          '<div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:500;overflow:hidden;' +
          'text-overflow:ellipsis;white-space:nowrap">' + U.esc(exName(e.exerciseId)) + '</div>' +
          '<div class="muted" style="font-size:11px">sets × rep range</div></div>' +
          '<input class="input" data-f="sets" inputmode="numeric" aria-label="Target sets" ' +
          'style="width:52px;text-align:center;padding:8px 4px;min-height:40px" value="' + (Number(e.targetSets) || 3) + '">' +
          '<span class="muted">×</span>' +
          '<input class="input" data-f="low" inputmode="numeric" aria-label="Reps low" ' +
          'style="width:52px;text-align:center;padding:8px 4px;min-height:40px" value="' + (Number(e.targetRepsLow) || 8) + '">' +
          '<span class="muted">–</span>' +
          '<input class="input" data-f="high" inputmode="numeric" aria-label="Reps high" ' +
          'style="width:52px;text-align:center;padding:8px 4px;min-height:40px" value="' + (Number(e.targetRepsHigh) || 12) + '">' +
          '<button type="button" class="btn icon ghost" data-f="del" aria-label="Remove exercise">' + ic().close + '</button>' +
          '</div>';
      }).join('');
    }

    U.$('#tp-name', content).addEventListener('input', function (e) { model.name = e.target.value; });

    U.on(content, 'click', '.chip[data-em]', function (e, chip) {
      model.emoji = chip.getAttribute('data-em');
      paintEmoji();
    });
    sharedBtn.addEventListener('click', function () {
      model.shared = !model.shared;
      paintShared();
    });

    U.on(rowsEl, 'input', 'input[data-f]', function (e, inp) {
      const row = inp.closest('[data-idx]');
      const entry = model.entries[parseInt(row.getAttribute('data-idx'), 10)];
      if (!entry) return;
      const n = parseInt(inp.value, 10);
      const f = inp.getAttribute('data-f');
      if (f === 'sets') entry.targetSets = isNaN(n) ? 3 : U.clamp(n, 1, 10);
      else if (f === 'low') entry.targetRepsLow = isNaN(n) ? 8 : U.clamp(n, 1, 50);
      else if (f === 'high') entry.targetRepsHigh = isNaN(n) ? 12 : U.clamp(n, 1, 50);
    });
    U.on(rowsEl, 'click', 'button[data-f="del"]', function (e, btn) {
      const row = btn.closest('[data-idx]');
      model.entries.splice(parseInt(row.getAttribute('data-idx'), 10), 1);
      paintRows();
    });

    U.$('#tp-addex', content).addEventListener('click', function () {
      openExercisePicker({
        title: 'Add exercises',
        multi: true,
        onPick: function (ids) {
          ids.forEach(function (exId) {
            model.entries.push({ exerciseId: exId, targetSets: 3, targetRepsLow: 8, targetRepsHigh: 12 });
          });
          paintRows();
        }
      });
    });

    paintEmoji();
    paintShared();
    paintRows();

    App.sheet({
      title: t ? 'Edit template' : 'New template',
      content: content,
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        {
          label: t ? 'Save changes' : 'Create template',
          kind: 'primary',
          keepOpen: true,
          onClick: function (api) {
            const name = model.name.trim();
            if (!name) { App.toast('Give the template a name', 'err'); return; }
            if (!model.entries.length) { App.toast('Add at least one exercise', 'err'); return; }
            const entries = model.entries.map(function (e) {
              const low = U.clamp(Number(e.targetRepsLow) || 8, 1, 50);
              const high = U.clamp(Number(e.targetRepsHigh) || 12, 1, 50);
              return {
                exerciseId: e.exerciseId,
                targetSets: U.clamp(Number(e.targetSets) || 3, 1, 10),
                targetRepsLow: Math.min(low, high),
                targetRepsHigh: Math.max(low, high)
              };
            });
            const payload = { name: name, emoji: model.emoji, userId: model.shared ? null : u.id, entries: entries };
            if (t) Store.updateTemplate(t.id, payload);
            else Store.addTemplate(payload);
            api.close();
            App.toast(t ? 'Template updated' : 'Template created', 'ok');
          }
        }
      ]
    });
  }

  /* ======================================================================
     Register views
     ====================================================================== */

  App.registerView('log', {
    title: 'Log', icon: App.icons.log, nav: false, order: 10, render: renderLog
  });
  App.registerView('history', {
    title: 'History', icon: App.icons.history, nav: true, order: 20, render: renderHistory
  });
  App.registerView('templates', {
    title: 'Templates', icon: App.icons.templates, nav: true, order: 30, render: renderTemplates
  });
})();
