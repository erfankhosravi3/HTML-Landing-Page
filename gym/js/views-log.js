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

     A draft that cannot be written is a session that vanishes on reload, so
     the failure is reported rather than swallowed (see Store.onSaveError).
     ====================================================================== */

  let draft = null;

  /* P4.5 — set identity. Timers bind to (entryId, _sid), never to an array
     index or an object reference (repaint() rebuilds root.innerHTML, which
     destroys both). `_sid` is DRAFT-LOCAL and provably never reaches Store or
     sync: cleanSetworkEntry skips '_'-prefixed keys at entry AND set level,
     buildFinishedEntries/openWorkoutEdit/openMixedWorkoutEdit build lift sets
     as 4-key literals, and the finish payload enumerates its fields. Do NOT
     turn this into a persisted set id — normalizeSet rebuilds lift sets to
     four keys on every client, so a persisted id would survive on setwork and
     vanish on lifts (asymmetric set identity is a permanent trap). */
  function sidOf(set) { return set._sid || (set._sid = U.uid('s')); }

  function loadDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      if (!d || typeof d !== 'object' || !Array.isArray(d.entries)) return null;
      d.entries = d.entries.filter(function (en) { return en && typeof en === 'object'; });
      let minted = false;
      d.entries.forEach(function (en) {
        if (!en.id) en.id = U.uid('en');
        // Only shapes that legitimately carry sets get one grown for them.
        // A cardio/circuit/mobility entry is a typed blob that saves verbatim,
        // so injecting `sets: []` here put an empty array on the stored
        // workout (cleanTypedEntry copies unknown keys through).
        if (isSetBearingEntry(en) && !Array.isArray(en.sets)) en.sets = [];
        // Backfill set identity alongside the entry-id backfill above. Setwork
        // only: those are the rows the Session can drive, and lift draft rows
        // stay byte-for-byte what they are today.
        if (en.type !== 'setwork') return;
        en.sets.forEach(function (s) {
          if (s && typeof s === 'object' && !s._sid) { sidOf(s); minted = true; }
        });
      });
      // Let the focus view's substrate backfill anything else it needs on the
      // same pass (its backfill is idempotent and only fills what is missing).
      if (playerSession() && playerSession().backfill(d)) minted = true;
      // Write the backfill straight back: renderLog re-reads the draft on every
      // render, so an unpersisted _sid would be regenerated and orphan a
      // running timer.
      if (minted) {
        try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); reportSave(false); }
        catch (e) { reportSave(true); }
      }
      return d;
    } catch (e) {
      return null;
    }
  }

  /* P4.5 — THE reconcile choke point. Every draft mutation already funnels
     through here (mountEditor's ctx.persist === saveDraft for the live draft,
     plus the handful of direct saveDraft() calls), so retargeting the running
     timer and repainting the focus view need no extra hooks anywhere. */
  let draftRev = 0;
  const draftSubs = [];

  function subscribeDraft(fn) {
    if (typeof fn !== 'function') return function () {};
    draftSubs.push(fn);
    return function () {
      const i = draftSubs.indexOf(fn);
      if (i >= 0) draftSubs.splice(i, 1);
    };
  }

  function notifySubscribers(rev) {
    if (!draftSubs.length) return;
    draftSubs.slice().forEach(function (fn) {
      try { fn(rev, draft); } catch (e) { /* a bad subscriber never breaks a save */ }
    });
  }

  let reconciling = false;

  // Storage failures are the Store's to announce; it owns the one banner.
  function reportSave(broken) {
    if (window.Store && typeof Store.reportSaveFailure === 'function') {
      Store.reportSaveFailure(broken);
    }
  }

  function saveDraft() {
    if (!draft) return;
    draftRev++;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); reportSave(false); }
    catch (e) { reportSave(true); }
    // A reconcile that expires a timer WRITES, and that write must not
    // re-enter this function — the localStorage line above still runs for it.
    if (reconciling) return;
    reconciling = true;
    try {
      const PS = playerSession();  // retarget / orphan-check the running timer
      if (PS) { try { PS.reconcile(); } catch (e) { /* never break a save */ } }
    } finally {
      reconciling = false;
    }
    notifySubscribers(draftRev);  // focus view repaints; the builder opts out
  }

  /* js/player.js (loaded AFTER this file) owns the ONE timing engine
     (Player.Session) and the focus presentation. This file owns draft storage,
     the builder DOM and the finish flow, and binds itself as the engine's
     host: the engine reads and writes the session record only through these
     accessors, which is what keeps it I/O-free and unit-testable in Node.
     Reference it lazily and never require it. */
  let playerBound = false;
  function playerSession() {
    const P = window.Player;
    const S = P && P.Session;
    if (!S || typeof S.reconcile !== 'function' || typeof S.backfill !== 'function') return null;
    if (!playerBound && typeof S.bind === 'function') {
      playerBound = true;
      try {
        S.bind({
          getDraft: function () { return draft; },
          saveDraft: saveDraft,
          setDraft: function (d) { draft = d; },
          clearDraft: clearDraft,
          rerender: function () { App.rerender(); },
          // 'the ✓ would have filled this in' — the engine asks before it
          // records a carry it stopped with nothing typed. It never measures
          // distance or load itself.
          prefill: fillFromPrev
        });
        S.subscribe(onSessionState);
      } catch (e) { /* an unbindable player just stays a no-op */ }
    }
    return S;
  }

  function clearDraft() {
    const S = playerSession();
    if (S) { try { S.cancel(); } catch (e) { /* nothing on the clock */ } }
    draft = null;
    stopRest();
    stopHold();
    dismissPill();
    clearRunningRow();
    lastSessSig = 'idle';
    draftRev++;
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }
    notifySubscribers(draftRev);
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
    Session.cancel();
    draft = {
      userId: u.id,
      date: U.todayStr(),
      name: opts.name || defaultDraftName(),
      startedAt: Date.now(),
      entries: Array.isArray(opts.entries) ? opts.entries : [],
      notes: '',
      fromTemplateId: opts.fromTemplateId || null
    };
    // P4.5 live-session layer — all draft-local ('_'-prefixed, never persisted
    // to Store). Absent keys resolve through the precedence chain instead.
    if (PACE_KIND_DEFAULT[opts.kind]) draft._kind = opts.kind;
    if (paceVal(opts.pace)) draft._pace = paceVal(opts.pace);
    if (opts.view === 'focus' || opts.view === 'builder') draft._view = opts.view;
    if (opts.routine && typeof opts.routine === 'object') draft._routine = opts.routine;
    if (opts.circuit && typeof opts.circuit === 'object') draft._circuit = opts.circuit;
    draft.entries.forEach(function (en) {
      if (!en || en.type !== 'setwork') return;
      (en.sets || []).forEach(function (s) { if (s && typeof s === 'object') sidOf(s); });
    });
    saveDraft();
  }

  function beginFromWorkout(w) {
    const entries = [];
    (w.entries || []).forEach(function (en) {
      if (!en) return;
      // P3: setwork entries repeat as draft-editable copies (values prefilled,
      // not done) — same copy path the durability sheet's 'Repeat last' uses.
      if (isSetworkEntry(en)) { entries.push(swDraftCopyOf(en)); return; }
      // other typed entries (cardio/mobility/durability/test blobs) never
      // flow through the lift editor
      if (!isLiftEntry(en)) return;
      entries.push({
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
      });
    });
    startDraft({ name: w.name || defaultDraftName(), entries: entries });
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

  /* ---------- P4.5: a PRESCRIPTION is never an observation ----------
     A routine's targets must not be seeded into the very fields the finish
     flow reads as "what happened" (reps/weightKg on a lift set, holdSec/reps/
     distanceM on a setwork set) — that is how an untouched guided session came
     to save work nobody did. The seeder (Player.draftFromRoutine) emits BLANK
     sets carrying the item's targets in draft-local, '_t'-prefixed keys:

       lift    : _tWeightKg, _tReps
       setwork : _tHoldSec, _tReps, _tDistanceM, _tWeightKg

     and the builder renders them as PLACEHOLDERS, exactly like the template
     path's _repLow/_repHigh. '_'-prefixed keys never persist (cleanSetworkEntry
     skips them at entry and set level; the lift save paths build 4-key
     literals), so nothing here reaches Store or sync.

     Nothing below invents a target: with no '_t' keys present every reader
     falls straight through to today's last-time hint, so an older seed — or a
     build whose seeder has not been updated yet — renders and saves exactly as
     it does now. */
  function tgtNum(s, key) {
    const n = Number(s && s['_t' + key]);
    return n > 0 ? n : 0;
  }

  // The prescription shaped like a hint set, so every prefill path can consume
  // it unchanged. null when the set carries no targets.
  const TARGET_KEYS = [
    { t: 'HoldSec', k: 'holdSec' }, { t: 'Reps', k: 'reps' },
    { t: 'DistanceM', k: 'distanceM' }, { t: 'WeightKg', k: 'weightKg' }
  ];

  function targetSetOf(s) {
    if (!s) return null;
    const o = {};
    let any = false;
    TARGET_KEYS.forEach(function (d) {
      const n = tgtNum(s, d.t);
      if (n <= 0) return;
      o[d.k] = d.k === 'weightKg' ? n : Math.round(n);
      any = true;
    });
    return any ? o : null;
  }

  /* ======================================================================
     P3 — structured set work ('setwork' entries: holds, carries, stretches).
     FORBIDDEN NAMES (binding, see ARCHITECTURE.md): the entry key is
     exerciseRef, never exerciseId; setwork sets never carry a 'type' key.
     ====================================================================== */

  const SW_METHOD_DEFS = [
    { id: 'static', label: 'Static' }, { id: 'dynamic', label: 'Dynamic' },
    { id: 'pnf', label: 'PNF' }, { id: 'loaded', label: 'Loaded' }
  ];

  // Stretch depth scale 1-4 — binding anchors, shown as chip tooltips.
  const SW_DEPTHS = [
    { n: 1, label: 'Easy', hint: 'First stretch sensation, ~50–70% of range; could hold it for minutes.' },
    { n: 2, label: 'Working', hint: 'Clear stretch that fades over the hold; slow nasal breathing. The daily-driver dose.' },
    { n: 3, label: 'Deep', hint: 'End range, does not fade, needs deliberate exhales. PNF/loaded only, warm, 2–3×/week.' },
    { n: 4, label: 'Limit', hint: 'Involuntary guarding: shaking, breath-holding, sharp or nervy. A flag, never a target.' }
  ];

  function isSetworkEntry(en) {
    return !!en && en.type === 'setwork';
  }

  // Shapes that legitimately carry a `sets` array (the same test player.js
  // uses). Everything else — cardio/circuit, mobility, test blobs — is a typed
  // entry that saves verbatim, and must never grow a `sets` key.
  function isSetBearingEntry(en) {
    return isLiftEntry(en) || isSetworkEntry(en);
  }

  function setShapeOf(ex) {
    return (ex && ex.setShape) || 'weight_reps';
  }

  function swIsStretch(en) {
    const ex = exOf(en.exerciseRef);
    return setShapeOf(ex) === 'stretch' || !!en.method;
  }

  function swMethodOf(en) {
    if (SW_METHOD_DEFS.some(function (m) { return m.id === en.method; })) return en.method;
    const ex = exOf(en.exerciseRef);
    return (ex && ex.defaultMethod) || 'static';
  }

  // hold | reps | carry — which input row a setwork entry renders
  function swRowShapeOf(en) {
    const shape = setShapeOf(exOf(en.exerciseRef));
    if (shape === 'carry') return 'carry';
    if (shape === 'stretch') return swMethodOf(en) === 'dynamic' ? 'reps' : 'hold';
    return 'hold';
  }

  function swDepthOf(en) {
    const d = parseInt(en._depth, 10);
    return d >= 1 && d <= 4 ? d : 2;
  }

  // Valid setwork set: reps>0 || holdSec>0 || distanceM>0 (NEVER the lift
  // reps>0 filter).
  function swValidSet(s) {
    return !!s && ((Number(s.reps) || 0) > 0 ||
      (Number(s.holdSec) || 0) > 0 || (Number(s.distanceM) || 0) > 0);
  }

  function newSetworkEntry(exerciseId, nSets, seed) {
    const ex = exOf(exerciseId);
    const shape = setShapeOf(ex);
    const perSide = !!(ex && ex.perSide);
    const en = { id: U.uid('en'), type: 'setwork', exerciseRef: exerciseId, notes: '', sets: [] };
    if (shape === 'stretch') {
      en.method = (ex && ex.defaultMethod) || 'static';
      en._depth = 2;
    }
    const n = U.clamp(Number(nSets) || (shape === 'stretch' ? 2 : 3), 1, 10);
    for (let i = 0; i < n; i++) {
      const s = { done: false, _sid: U.uid('s') };
      if (perSide) s.side = i % 2 === 0 ? 'L' : 'R';
      if (seed) {
        if ((seed.holdSec || 0) > 0) s.holdSec = seed.holdSec;
        if ((seed.reps || 0) > 0) s.reps = seed.reps;
        if ((seed.distanceM || 0) > 0) s.distanceM = seed.distanceM;
      }
      en.sets.push(s);
    }
    return en;
  }

  // Picker dispatch inside a draft: hold/carry/stretch-shape exercises become
  // setwork entries in performance mode; simple mode always creates lifts.
  function newEntryFor(exerciseId, u) {
    if (perfMode(u) && setShapeOf(exOf(exerciseId)) !== 'weight_reps') {
      return newSetworkEntry(exerciseId);
    }
    return newEntry(exerciseId, 3);
  }

  // Sets from the user's most recent setwork entry for this exerciseRef.
  function prevSetworkFor(userId, exerciseRef, opts) {
    opts = opts || {};
    if (!exerciseRef) return [];
    const ws = Store.workoutsFor(userId); // date desc
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i];
      if (opts.excludeId && w.id === opts.excludeId) continue;
      if (opts.maxDate && w.date > opts.maxDate) continue;
      let sets = [];
      (w.entries || []).forEach(function (en) {
        if (en && en.type === 'setwork' && en.exerciseRef === exerciseRef) {
          sets = sets.concat(en.sets || []);
        }
      });
      if (sets.length) return sets;
    }
    return [];
  }

  // Side-aware hint: an L row prefers the i-th previous L set, and so on.
  function swHintSetOf(en, prev, i) {
    if (!prev.length) return null;
    const s = en.sets[i];
    if (s && (s.side === 'L' || s.side === 'R')) {
      const same = prev.filter(function (p) { return p && p.side === s.side; });
      if (same.length) {
        let idx = 0;
        for (let j = 0; j < i; j++) {
          if (en.sets[j] && en.sets[j].side === s.side) idx++;
        }
        return same[Math.min(idx, same.length - 1)];
      }
    }
    return prev[Math.min(i, prev.length - 1)];
  }

  /* P4.5 — the host's prefill hint, handed to Player.Session.bind(). Mirrors
     the ✓ behavior: an untouched set accepts the values it would have been
     prefilled with, so a carry stopped on the stopwatch still saves. The
     engine never invents these — it asks, exactly once, at record time. */
  function swFillFromPrev(en, s) {
    if (!en || !s || swValidSet(s) || !draft) return;
    const i = (en.sets || []).indexOf(s);
    // the row's own prescribed target outranks the carry-forward and the hint
    let src = targetSetOf(s);
    if (!src) {
      for (let j = i - 1; j >= 0; j--) {
        if (swValidSet(en.sets[j])) { src = en.sets[j]; break; }
      }
      if (!src) src = swHintSetOf(en, prevSetworkFor(draft.userId, en.exerciseRef), i);
    }
    if (!src) return;
    if ((src.distanceM || 0) > 0 && !((s.distanceM || 0) > 0)) s.distanceM = src.distanceM;
    if ((src.weightKg || 0) > 0 && !((s.weightKg || 0) > 0)) s.weightKg = src.weightKg;
    if ((src.reps || 0) > 0 && !((s.reps || 0) > 0)) s.reps = src.reps;
    if ((src.holdSec || 0) > 0 && !((s.holdSec || 0) > 0)) s.holdSec = src.holdSec;
  }

  /* P4.5 — the SAME hint for lift entries. swFillFromPrev looks history up by
     en.exerciseRef, which a lift entry does not have, so it bailed on every
     lift row: a set driven to completion (focus 'Done ✓', or a metronome that
     wrote only its rep count) with nothing typed recorded nothing at all, or
     recorded reps at 0 kg. This mirrors onCheck() exactly — the row's own
     prescribed target, then the nearest earlier filled row, then last time —
     and delegates setwork rows to the cleaner that already handles them. */
  function fillFromPrev(en, s) {
    if (!en || !s) return;
    if (isSetworkEntry(en)) { swFillFromPrev(en, s); return; }
    if (!isLiftEntry(en) || !en.exerciseId || !draft) return;
    if ((s.weightKg || 0) > 0 && (s.reps || 0) > 0) return;
    const i = (en.sets || []).indexOf(s);
    let src = targetSetOf(s);
    if (!src) {
      for (let j = i - 1; j >= 0; j--) {
        const p = en.sets[j];
        if ((p.weightKg || 0) > 0 || (p.reps || 0) > 0) { src = p; break; }
      }
      if (!src) src = hintSetOf(prevSetsFor(draft.userId, en.exerciseId), Math.max(0, i));
    }
    if (!src) return;
    if (!((s.weightKg || 0) > 0)) s.weightKg = src.weightKg || 0;
    if (!((s.reps || 0) > 0)) s.reps = src.reps || 0;
  }

  function swHintText(hs, rowShape) {
    if (!hs) return '';
    const w = (hs.weightKg || 0) > 0 ? dispW(hs.weightKg) : '';
    if (rowShape === 'carry') {
      const m = (hs.distanceM || 0) > 0 ? Math.round(hs.distanceM) + ' m' : '';
      if (!m && !w) return '';
      return [w, m].filter(Boolean).join(' × ');
    }
    if (rowShape === 'reps') {
      if (!((hs.reps || 0) > 0)) return '';
      return (w ? w + ' × ' : '') + hs.reps;
    }
    if (!((hs.holdSec || 0) > 0)) return '';
    return (w ? w + ' · ' : '') + fmtClock(hs.holdSec);
  }

  // Save-shape cleaner shared by the finish flow, the mixed editor and the
  // stretch mini-builder. Unknown keys pass through VERBATIM at both entry
  // and set level (the asymmetry this phase fixes); transient '_'-prefixed
  // keys and the builder 'done' flag are stripped. Returns null when no set
  // survives the valid-set rule.
  function cleanSetworkEntry(en) {
    if (!en || !en.exerciseRef) return null;
    const stretch = swIsStretch(en);
    const depth = swDepthOf(en);
    const sets = [];
    (en.sets || []).forEach(function (s) {
      if (!swValidSet(s)) return;
      const o = {};
      for (const k in s) {
        if (k === 'done' || k === 'type' || k.charAt(0) === '_') continue;
        o[k] = s[k];
      }
      ['reps', 'holdSec', 'distanceM', 'weightKg'].forEach(function (k) {
        if (!((Number(o[k]) || 0) > 0)) delete o[k];
      });
      if (o.side !== 'L' && o.side !== 'R') delete o.side;
      // P4.5: a set's OWN intensity wins over the card-level aim, so per-set
      // depth captured live (the rest-step depth ask) survives the save.
      if (stretch) {
        const own = parseInt(o.intensity, 10);
        o.intensity = own >= 1 && own <= 4 ? own : depth;
      } else delete o.intensity;
      sets.push(o);
    });
    if (!sets.length) return null;
    const out = {};
    for (const k in en) {
      if (k === 'showRpe' || k.charAt(0) === '_') continue;
      out[k] = en[k];
    }
    out.id = en.id || U.uid('en');
    out.type = 'setwork';
    out.exerciseRef = en.exerciseRef;
    delete out.exerciseId; // FORBIDDEN on setwork — old clients dispatch on it
    out.sets = sets;
    if (stretch) out.method = swMethodOf(en);
    else delete out.method;
    if (out.notes) out.notes = String(out.notes);
    else delete out.notes;
    return out;
  }

  // Draft-editable copy of a saved setwork entry (values prefilled, not done).
  function swDraftCopyOf(x) {
    const en = { id: U.uid('en'), type: 'setwork', exerciseRef: x.exerciseRef, notes: '', sets: [] };
    if (x.method) en.method = x.method;
    (x.sets || []).forEach(function (s) {
      const c = { done: false, _sid: U.uid('s') };
      if ((s.reps || 0) > 0) c.reps = s.reps;
      if ((s.holdSec || 0) > 0) c.holdSec = s.holdSec;
      if ((s.distanceM || 0) > 0) c.distanceM = s.distanceM;
      if ((s.weightKg || 0) > 0) c.weightKg = s.weightKg;
      if (s.side === 'L' || s.side === 'R') c.side = s.side;
      en.sets.push(c);
    });
    if (!en.sets.length) en.sets.push({ done: false, _sid: U.uid('s') });
    const first = (x.sets || []).find(function (s) { return s && s.intensity >= 1; });
    if (swIsStretch(en)) en._depth = first ? U.clamp(Math.round(first.intensity), 1, 4) : 2;
    return en;
  }

  // Unit-aware summary string for one setwork entry: '3×0:45',
  // 'L 0:40 · R 0:38', '3×8/side @ 24 kg', '3×40 m @ 32 kg' (+ ' @ Working').
  function setworkSetsString(en) {
    const stretch = swIsStretch(en);
    const sets = (en.sets || []).filter(swValidSet);
    if (!sets.length) return '';
    function tok(s) {
      if ((s.holdSec || 0) > 0) return fmtClock(s.holdSec);
      if ((s.distanceM || 0) > 0) return Math.round(s.distanceM) + ' m';
      return String(s.reps || 0);
    }
    function allEq(a) {
      return a.every(function (x) { return x === a[0]; });
    }
    const toks = sets.map(tok);
    const hasSides = sets.some(function (s) { return s.side === 'L' || s.side === 'R'; });
    let core;
    if (!hasSides) {
      core = allEq(toks) && sets.length > 1 ? sets.length + '×' + toks[0] : toks.join(' · ');
    } else {
      const L = [];
      const R = [];
      sets.forEach(function (s, i) { (s.side === 'R' ? R : L).push(toks[i]); });
      if (L.length && L.length === R.length && allEq(L) && allEq(R) && L[0] === R[0]) {
        core = L.length + '×' + L[0] + '/side';
      } else {
        core = sets.map(function (s, i) {
          return (s.side === 'L' || s.side === 'R' ? s.side + ' ' : '') + toks[i];
        }).join(' · ');
      }
    }
    const kgs = sets.map(function (s) { return s.weightKg || 0; });
    if (kgs.some(function (k) { return k > 0; })) {
      core += ' @ ' + App.fmtWeight(allEq(kgs) ? kgs[0] : Math.max.apply(null, kgs), { precise: true });
    }
    if (stretch) {
      const first = sets.find(function (s) { return s.intensity >= 1; });
      const d = first ? U.clamp(Math.round(first.intensity), 1, 4) : swDepthOf(en);
      core += ' @ ' + SW_DEPTHS[d - 1].label;
    }
    return core;
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
    // P4.5 — ONE rest authority. While the live Session is driving a step it
    // owns the single pill slot; a legacy advisory rest mounted on top of it
    // would cover the running label AND fire a false 'Rest done' cue mid-rest.
    // (Session is initialised long before any click can reach this.)
    if (Session.isRunning()) return;
    stopHold(); // one pill at a time — the hold countdown owns the same slot
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

  /* ---------- P3: hold countdown (reuses the rest-timer pill chrome) ----------
     Countdown only — max-effort hangs belong in the Test wizard. Starting it
     cancels a running rest timer (and vice versa). Typing always works; the
     timer is never required. */

  const holdT = { el: null, timeEl: null, fillEl: null, iv: null, endsAt: 0, totalSec: 0, startedAt: 0, onDone: null };

  function startHold(sec, onDone) {
    if (!sec || sec <= 0) return;
    stopRest();
    stopHold();
    holdT.startedAt = Date.now();
    holdT.endsAt = holdT.startedAt + sec * 1000;
    holdT.totalSec = sec;
    holdT.onDone = onDone || null;
    holdT.el = U.el('<div class="rest-timer hold-pill" role="timer">' +
      '<span style="display:inline-flex;color:var(--blue)">' + ic().timer + '</span>' +
      '<span class="time">' + fmtClock(sec) + '</span>' +
      '<span class="track"><span class="fill" style="width:100%"></span></span>' +
      '<button type="button" class="btn small primary" data-h="done">Done</button>' +
      '<button type="button" class="btn small ghost" data-h="cancel">Cancel</button>' +
      '</div>');
    holdT.timeEl = holdT.el.querySelector('.time');
    holdT.fillEl = holdT.el.querySelector('.fill');
    holdT.el.querySelector('[data-h="done"]').addEventListener('click', function () { endHoldEarly(); });
    holdT.el.querySelector('[data-h="cancel"]').addEventListener('click', function () { stopHold(); });
    document.body.appendChild(holdT.el);
    holdT.iv = setInterval(tickHold, 250);
    tickHold();
  }

  function stopHold() {
    if (holdT.iv) { clearInterval(holdT.iv); holdT.iv = null; }
    if (holdT.el) { holdT.el.remove(); holdT.el = null; holdT.timeEl = null; holdT.fillEl = null; }
    holdT.onDone = null;
  }

  function tickHold() {
    if (!holdT.el) return;
    const remainMs = holdT.endsAt - Date.now();
    if (remainMs <= 0) { finishHold(); return; }
    holdT.timeEl.textContent = fmtClock(Math.ceil(remainMs / 1000));
    const pct = holdT.totalSec > 0 ? (remainMs / (holdT.totalSec * 1000)) * 100 : 0;
    holdT.fillEl.style.width = U.clamp(pct, 0, 100) + '%';
  }

  function finishHold() {
    const done = holdT.onDone;
    const actual = (Date.now() - holdT.startedAt) / 1000;
    stopHold();
    if (navigator.vibrate) { try { navigator.vibrate([180, 90, 180]); } catch (e) { /* ignore */ } }
    App.toast('Hold done', 'ok');
    if (typeof done === 'function') done(actual);
  }

  // Early stop from the sheet-level hold pill — BINDING (P4.5): holdSec is the
  // seconds ACTUALLY held, so stopping short records the short time.
  function endHoldEarly() {
    const done = holdT.onDone;
    const actual = (Date.now() - holdT.startedAt) / 1000;
    stopHold();
    if (typeof done === 'function') done(actual);
  }

  /* ======================================================================
     P4.5 — ONE LIVE SESSION: pace as a layer.

     The draft ('ironlog/activeWorkout') is the single session record for EVERY
     session type. The timing engine below drives draft.entries[i].sets[j]
     directly — there is no compiled timeline and no shadow copy of actuals.
     The builder and the focus view are two renderers over the same state.
     ====================================================================== */

  const PACE_ORDER = ['off', 'set', 'exercise', 'session'];
  const PACE_DEFS = [
    { id: 'off', label: 'Off', sub: 'I tap everything — same as lifting' },
    { id: 'set', label: 'This set', sub: 'One set at a time, on the row you tap' },
    { id: 'exercise', label: 'This exercise', sub: 'Runs its sets + rests, then hands back' },
    { id: 'session', label: 'Whole session', sub: 'Hands-free start to finish · default for circuits' }
  ];
  const PACE_SHORT = { off: 'Off', set: 'Set', exercise: 'Exercise', session: 'Session' };
  // Binding defaults table (ARCHITECTURE.md P4.5). Lift 'off' is today's exact
  // behavior — that is what keeps the family lift flow byte-identical.
  const PACE_KIND_DEFAULT = {
    durability: 'set', stretch: 'set', lift: 'off',
    circuit: 'session', interval: 'set', cardio: 'off'
  };
  const PACE_KIND_ROWS = [
    { id: 'durability', label: 'Durability' },
    { id: 'stretch', label: 'Stretch' },
    { id: 'lift', label: 'Lift' },
    { id: 'circuit', label: 'Circuit / AMRAP' },
    { id: 'interval', label: 'Intervals (run · swim)' },
    { id: 'cardio', label: 'Steady cardio', fixed: 'Off — quick log' }
  ];
  const DEFAULT_REST_SEC = 60;
  const DEFAULT_HOLD_SEC = 30;

  // ◎ — switch to the focus presentation (not in App.icons)
  const FOCUS_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" ' +
    'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ' +
    'aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.4" fill="currentColor" stroke="none"/></svg>';

  function paceVal(v) { return PACE_ORDER.indexOf(v) >= 0 ? v : null; }

  /* ---------- storage: user.settings.pace / cadence / restSec ----------
     VERIFIED SAFE: store.js mergeSettings copies every key it does not know
     through untouched (the P0 forward-compat clause), so old clients preserve
     these. settings.restTimerSec and settings.playerVoice keep their current
     meanings — restTimerSec still drives today's advisory lift rest pill. */

  function paceSettingsOf(u) {
    const raw = ((u && u.settings) || {}).pace;
    const src = raw && typeof raw === 'object' ? raw : {};
    const out = {};
    for (const k in PACE_KIND_DEFAULT) out[k] = paceVal(src[k]) || PACE_KIND_DEFAULT[k];
    return out;
  }

  /* The map to WRITE BACK. settings.pace is stored with REPLACE semantics
     (store.js mergeSettings swaps an unknown key wholesale), which is only safe
     because every writer hands in the COMPLETE map. paceSettingsOf above is the
     DISPLAY resolver: it emits exactly the kinds this build knows, so using it
     as the write map silently deletes kinds a newer client stored — and even
     'mixed', which player.js's own PACE_DEFAULTS has and this table does not.
     This starts from the RAW stored object so unknown kinds survive verbatim,
     then backfills the known defaults. */
  function paceSettingsForWrite(u) {
    const raw = ((u && u.settings) || {}).pace;
    const src = raw && typeof raw === 'object' ? raw : {};
    const out = {};
    for (const k in src) {
      if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
      // known kinds are coerced to a legal pace; unknown kinds pass through
      out[k] = PACE_KIND_DEFAULT[k] ? (paceVal(src[k]) || PACE_KIND_DEFAULT[k]) : src[k];
    }
    for (const k in PACE_KIND_DEFAULT) if (!paceVal(out[k])) out[k] = PACE_KIND_DEFAULT[k];
    return out;
  }

  function cadenceSettingOf(u) { return ((u && u.settings) || {}).cadence === true; }

  function restSecSettingOf(u) {
    const n = Number(((u && u.settings) || {}).restSec);
    return n > 0 ? Math.round(n) : DEFAULT_REST_SEC;
  }

  // Session kind for the defaults table. Explicit at seed time (the entry
  // sheets set it); otherwise derived from what is actually in the draft.
  function draftKind(d) {
    d = d || draft;
    if (!d) return 'lift';
    if (PACE_KIND_DEFAULT[d._kind]) return d._kind;
    const S = playerSession();
    if (S) return S.kindOfDraft(d);
    const sw = (d.entries || []).filter(isSetworkEntry);
    if (!sw.length) return 'lift';
    return sw.every(swIsStretch) ? 'stretch' : 'durability';
  }

  /* ---------- pace / driver resolution: ONE authority ----------
     Player.Session (js/player.js) owns the precedence chain
       user.settings.pace[kind] -> routine.pace -> item.pace -> draft._pace
         -> entry._pace -> the button just tapped,
     the rest chain that mirrors it, the per-shape driver table and the tempo
     prescription. The wrappers below keep the names the builder DOM and the
     window.ViewsLog consumers already use and add NOTHING of their own. With
     no player.js loaded (the Node smoke harness) they answer inert defaults,
     so the builder still renders — it just cannot drive anything. */

  function resolvePace(en, d) {
    const S = playerSession();
    return S ? S.resolvePace(en || null, null, d || draft || undefined) : 'off';
  }

  function resolveCadence(d) {
    const S = playerSession();
    return S ? !!S.resolveCadence(null, d || draft || undefined) : false;
  }

  function resolveRestSec(en, d) {
    const S = playerSession();
    return S ? S.restSecFor(en || null, d || draft || undefined) : restSecSettingOf(user());
  }

  /* Tempo is a PRESCRIPTION, never an observation: normalizeSet rebuilds every
     lift set to exactly {weightKg, reps, type, rpe} on this and every older
     client, so a tempo can physically never be recorded on a set. */
  function resolveTempo(en, d) {
    const S = playerSession();
    return S ? S.tempoOf(en || null, d || draft || undefined) : null;
  }

  /* ---------- per-shape set drivers ----------
     Governing rule: the app drives every step it can time deterministically;
     the user triggers every step it cannot. The table lives in Player.Session;
     this maps its {driver,...} answer onto the 'countdown'|'stopwatch'|'tempo'
     string the builder rows and the ViewsLog consumers read. */
  function driverFor(en, s, d) {
    const S = playerSession();
    if (!S || !en || !s) return null;
    const drv = S.driverFor(en, s, d || draft || undefined);
    if (!drv) return null;
    if (drv.driver === 'stopwatch') return 'stopwatch';
    return drv.driver === 'metronome' ? 'tempo' : 'countdown';
  }

  function entryHasDriver(en) {
    return ((en && en.sets) || []).some(function (s) { return !!driverFor(en, s); });
  }

  function targetSecFor(en, s) {
    const S = playerSession();
    return S && en && s ? S.targetSecOf(en, s) : 0;
  }

  /* ======================================================================
     Session — a FAÇADE over Player.Session (js/player.js), which owns the
     app's one and only timer slot.

     Nothing here holds session state: every verb forwards, and every read is a
     projection of Player.Session.state(). The projection keeps the
     {kind, mode, scope} snapshot shape the builder rows, the pill and the
     P4.5 probes already read, and answers null when nothing is on the clock.
     ====================================================================== */

  const Session = {};
  let liveRepaint = null;   // builder repaint hook (set by renderActiveDraft)
  let lastSessSig = 'idle'; // what the builder last painted a session for

  function sessEntry(id) {
    if (!draft) return null;
    return (draft.entries || []).find(function (x) { return x && x.id === id; }) || null;
  }

  function sessSet(en, sid) {
    const list = (en && en.sets) || [];
    for (let i = 0; i < list.length; i++) if (list[i] && list[i]._sid === sid) return list[i];
    return null;
  }

  function sessIndex(en, sid) {
    const list = (en && en.sets) || [];
    for (let i = 0; i < list.length; i++) if (list[i] && list[i]._sid === sid) return i;
    return -1;
  }

  // The running step, or null when the slot is free.
  function sessionStep() {
    const S = playerSession();
    if (!S || !S.timer()) return null;
    const st = S.state();
    if (!st || (!st.running && !st.boundary)) return null;
    return {
      kind: st.phase === 'rest' ? 'rest' : 'work',
      entryId: st.entryId,
      sid: st.sid,
      mode: st.driver === 'stopwatch' ? 'stopwatch' : 'countdown',
      scope: st.chain || 'set',
      targetSec: st.targetSec,
      boundary: !!st.boundary,
      paused: !!st.paused,
      elapsedSec: st.elapsedSec,
      remainSec: st.remainSec
    };
  }

  Session.state = sessionStep;
  Session.isRunning = function () { return !!sessionStep(); };

  // Row-level state for renderers (builder rows, focus rows).
  Session.rowState = function (entryId, sid) {
    const st = sessionStep();
    if (!st || st.entryId !== entryId || st.sid !== sid) return null;
    const pct = st.mode === 'countdown' && st.targetSec > 0
      ? U.clamp((st.elapsedSec / st.targetSec) * 100, 0, 100)
      : 0;
    return {
      kind: st.kind, mode: st.mode, boundary: st.boundary, paused: st.paused,
      remainSec: st.remainSec, elapsedSec: st.elapsedSec, pct: pct
    };
  };

  // Direct manipulation: tapping a set's NUMBER runs exactly that set, whatever
  // the resolved pace — the button just tapped wins for that one action.
  Session.runSet = function (entryId, sid, opts) {
    const S = playerSession();
    if (!S || !draft) return false;
    const en = sessEntry(entryId);
    const s = en ? sessSet(en, sid) : null;
    if (!en || !s) return false;
    if (!driverFor(en, s)) {
      App.toast('Nothing to time here — tap ✓ when you finish the set', 'info');
      return false;
    }
    opts = opts || {};
    stopRest();
    stopHold();
    return S.runSet(entryId, sid, { pace: paceVal(opts.scope) || undefined }) !== false;
  };

  // Tapping a card's stopwatch runs that exercise (its sets + rests), then stops.
  Session.runEntry = function (entryId) {
    const S = playerSession();
    if (!S || !draft) return false;
    const en = sessEntry(entryId);
    if (!en) return false;
    const s = (en.sets || []).find(function (x) { return x && !x.done && driverFor(en, x); });
    if (!s) { App.toast('All sets are done', 'info'); return false; }
    stopRest();
    stopHold();
    return S.runExercise(entryId) !== false;
  };

  Session.runSession = function () {
    const S = playerSession();
    if (!S || !draft) return false;
    const es = draft.entries || [];
    let found = null;
    for (let j = 0; j < es.length && !found; j++) {
      found = (es[j].sets || []).find(function (x) { return x && !x.done && driverFor(es[j], x); }) || null;
    }
    if (!found) { App.toast('Nothing left to run', 'info'); return false; }
    stopRest();
    stopHold();
    return S.runSession() !== false;
  };

  // Cancel cleanly: keep the session, record nothing for the running step.
  Session.cancel = function () {
    const S = playerSession();
    if (S) S.cancel();
  };

  Session.doneNow = function () {
    const S = playerSession();
    const st = sessionStep();
    if (!S || !st) return;
    if (st.boundary) { S.confirmBoundary(); return; }
    if (st.kind === 'rest') { S.skipRest(); return; }
    S.done();
  };

  /* The pill multiplexes Done / Skip rest / Record it onto ONE node, and the
     first tap re-labels it synchronously — so a double-tap's second activation
     silently means something the finger never aimed at (it skipped the driven
     rest the first tap had just armed). Re-arm the control when its MEANING
     changes: an activation landing inside the window on a different meaning is
     the tail of a double-tap and is dropped. A deliberate later tap reads the
     new label and works. The focus view is immune already (it rebuilds
     .player-foot per phase), so this guard lives with the pill. */
  const DONE_REARM_MS = 450;
  const doneTap = { stamp: '', at: 0 };

  function doneStampOf(st) {
    return st ? st.kind + ':' + st.entryId + ':' + st.sid + (st.boundary ? ':b' : '') : '';
  }

  function armDoneTap() {
    const stamp = doneStampOf(sessionStep());
    const now = Date.now();
    if (doneTap.stamp && doneTap.stamp !== stamp && now - doneTap.at < DONE_REARM_MS) {
      doneTap.at = now; // a whole flurry of taps keeps the guard armed
      return false;
    }
    doneTap.stamp = stamp;
    doneTap.at = now;
    return true;
  }

  Session.skipRest = function () {
    const S = playerSession();
    const st = sessionStep();
    if (S && st && st.kind === 'rest') S.skipRest();
  };

  // ±15s adjusts the CURRENT step target only — it never writes back into the
  // set, so a user-typed target is never clobbered by the remote control.
  Session.adjust = function (deltaSec) {
    const S = playerSession();
    if (S) S.adjust(deltaSec);
  };

  Session.pause = function () { const S = playerSession(); if (S) S.pause(); };
  Session.resume = function () { const S = playerSession(); if (S) S.resume(); };

  /* Authoritative timer<->edit reconciliation lives in Player.Session and runs
     inside saveDraft(), so every draft mutation is covered:
       - editing the RUNNING set's target retargets live, preserving elapsed
         (remain = newTarget - elapsed; already past => expire immediately)
       - deleting the running SET or its ENTRY cancels cleanly, records nothing
         and advances the cursor to the next pending set
       - reordering follows, because the binding is by _sid
       - the cursor is advisory: editing any other row never moves it */
  Session.reconcile = function () {
    const S = playerSession();
    if (S) S.reconcile();
  };

  /* The engine publishes 'change' and 'tick'. The pill repaints on both (it is
     a handful of text nodes); the BUILDER only repaints when the session
     actually moved — a full repaint on every keystroke would eat the caret. */
  function onSessionState() {
    const st = sessionStep();
    paintPill(st);
    const ld = draft && draft._lastDone;
    const sig = (st
      ? st.kind + ':' + st.entryId + ':' + st.sid + (st.boundary ? 'b' : '') + (st.paused ? 'p' : '')
      : 'idle') + '|' + (ld ? ld.sid + ':' + ld.at : '');
    if (sig === lastSessSig) return;
    lastSessSig = sig;
    if (liveRepaint) liveRepaint();
  }

  /* ---------- the timer pill: a remote control for whichever row owns it,
     however far the user has scrolled ---------- */

  const pill = { el: null, timeEl: null, fillEl: null, labelEl: null, nextEl: null, doneEl: null };

  function dismissPill() {
    if (pill.el) { pill.el.remove(); pill.el = null; }
    pill.timeEl = pill.fillEl = pill.labelEl = pill.nextEl = pill.doneEl = null;
    doneTap.stamp = '';
    doneTap.at = 0;
  }

  function buildPill() {
    dismissPill();
    pill.el = U.el('<div class="rest-timer sess-pill" role="timer">' +
      '<span class="sess-ic">' + ic().timer + '</span>' +
      '<span class="time">0:00</span>' +
      '<button type="button" class="btn small ghost" data-s="minus">−15s</button>' +
      '<button type="button" class="btn small ghost" data-s="plus">+15s</button>' +
      '<button type="button" class="btn small primary" data-s="done">Done</button>' +
      '<button type="button" class="btn icon ghost sess-x" data-s="cancel" aria-label="Stop timer">' +
      ic().close + '</button>' +
      '<span class="track"><span class="fill" style="width:0%"></span></span>' +
      '<span class="sess-sub"><span class="l"></span><span class="r"></span></span>' +
      '</div>');
    pill.timeEl = pill.el.querySelector('.time');
    pill.fillEl = pill.el.querySelector('.fill');
    pill.labelEl = pill.el.querySelector('.sess-sub .l');
    pill.nextEl = pill.el.querySelector('.sess-sub .r');
    pill.doneEl = pill.el.querySelector('[data-s="done"]');
    U.on(pill.el, 'click', 'button[data-s]', function (e, btn) {
      const a = btn.getAttribute('data-s');
      if (a === 'minus') Session.adjust(-15);
      else if (a === 'plus') Session.adjust(15);
      else if (a === 'done') { if (armDoneTap()) Session.doneNow(); }
      else if (a === 'cancel') Session.cancel();
    });
    document.body.appendChild(pill.el);
  }

  // A rest is bound to the set it LEADS TO, so 'next' during a rest is the
  // step the pill is already pointing at.
  function stepLabels(st) {
    if (!st || !draft) return { l: '', r: '' };
    const en = sessEntry(st.entryId);
    if (!en) return { l: '', r: '' };
    const i = sessIndex(en, st.sid);
    const total = (en.sets || []).length;
    const name = exName(en.exerciseRef || en.exerciseId);
    const s = sessSet(en, st.sid);
    const side = s && (s.side === 'L' || s.side === 'R') ? ' ' + s.side : '';
    const here = name + side + ' · set ' + (i + 1) + ' of ' + total;
    if (st.kind === 'rest') return { l: 'Rest · next ' + here, r: '' };
    let next = '';
    if (st.scope !== 'set') {
      const S = playerSession();
      const nx = S ? S.next(draft) : null;
      const sameEntry = nx && nx.entryId === en.id;
      if (nx && (sameEntry || st.scope === 'session')) {
        const nSide = nx.set.side === 'L' || nx.set.side === 'R' ? ' ' + nx.set.side : '';
        next = sameEntry
          // staying on this card — name the set, not the exercise again
          ? 'Next: set ' + (sessIndex(en, nx.sid) + 1) + nSide
          : 'Next: ' + exName(nx.entry.exerciseRef || nx.entry.exerciseId) + nSide;
      }
    }
    return { l: here, r: next };
  }

  function paintPill(st) {
    if (!st) {
      if (pill.el) dismissPill();
      clearRunningRow();
      return;
    }
    // one pill at a time — the advisory rest / sheet hold pills share the slot.
    // Evict them on EVERY paint, not just the first: an advisory pill that
    // mounted AFTER the session pill would otherwise sit on top of it (both are
    // pinned to the same anchor) and cover the running-step label.
    stopRest();
    stopHold();
    if (!pill.el) buildPill();
    const secs = st.mode === 'countdown' ? st.remainSec : st.elapsedSec;
    const resting = st.kind === 'rest';
    pill.el.classList.toggle('is-rest', resting);
    pill.el.classList.toggle('is-boundary', st.boundary);
    pill.timeEl.textContent = fmtClock(st.boundary ? st.targetSec : Math.ceil(secs));
    const pct = st.mode === 'countdown' && st.targetSec > 0
      ? U.clamp((st.remainSec / st.targetSec) * 100, 0, 100) : 100;
    pill.fillEl.style.width = pct + '%';
    if (pill.doneEl) pill.doneEl.textContent = resting ? 'Skip rest' : (st.boundary ? 'Record it' : 'Done');
    const lab = stepLabels(st);
    pill.labelEl.textContent = st.boundary
      ? 'Ended while the screen was off — record it or discard'
      : (st.paused ? 'Paused · ' + lab.l : lab.l);
    pill.nextEl.textContent = lab.r;
    if (resolveCadence() && !resting && !st.boundary) pill.el.classList.add('has-cadence');
    else pill.el.classList.remove('has-cadence');
    paintRunningRow(st);
  }

  function clearRunningRow() {
    U.$$('.set-row.running').forEach(function (r) {
      r.classList.remove('running', 'resting');
      const p = r.querySelector('.sess-prog');
      if (p) p.remove();
      const inp = r.querySelector('input[readonly]');
      if (inp) inp.removeAttribute('readonly');
    });
  }

  function paintRunningRow(st) {
    if (!st) return;
    const root = document.getElementById('lg-entries');
    if (!root) return;
    const row = root.querySelector('.set-row[data-sid="' + st.sid + '"]');
    U.$$('.set-row.running', root).forEach(function (r) {
      if (r !== row) {
        r.classList.remove('running', 'resting');
        const p = r.querySelector('.sess-prog');
        if (p) p.remove();
      }
    });
    if (!row) return;
    row.classList.add('running');
    row.classList.toggle('resting', st.kind === 'rest');
    let prog = row.querySelector('.sess-prog');
    if (!prog) {
      prog = U.el('<span class="sess-prog" aria-hidden="true"><i></i></span>');
      row.appendChild(prog);
    }
    const pct = st.mode === 'countdown' && st.targetSec > 0
      ? U.clamp((st.elapsedSec / st.targetSec) * 100, 0, 100) : 0;
    prog.firstChild.style.width = pct + '%';
    if (st.kind === 'work') {
      const inp = row.querySelector('input[data-act="sw-hold"]');
      if (inp && st.mode === 'countdown') {
        // A pending boundary is a QUESTION ('record it or discard'), not a
        // running clock: the addendum promises the user can adjust before
        // confirming, so the row must stay typeable. Writing the formatted
        // target into a locked field made the plan the only answer. Hand the
        // field back to the SET (blank when nothing is recorded yet) instead
        // of leaving the hijacked countdown text sitting in it as a fake
        // answer — but never while the user has the caret in it.
        if (st.boundary) {
          inp.removeAttribute('readonly');
          if (document.activeElement !== inp) {
            const bs = sessSet(sessEntry(st.entryId), st.sid);
            inp.value = bs && (bs.holdSec || 0) > 0 ? fmtClock(bs.holdSec) : '';
          }
        } else {
          inp.value = fmtClock(st.remainSec);
          inp.setAttribute('readonly', 'readonly');
        }
      }
    }
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) onSessionState();
  });

  /* ======================================================================
     P4.5 — pace UI (performance mode only).

     Direct manipulation beats configuration: tapping a set number runs that
     set and tapping a card's stopwatch runs that exercise. These sheets exist
     only for Off / Whole-session / cadence / changing defaults.
     ====================================================================== */

  function paceRadioHTML(sel, kindDefault) {
    return '<div class="pace-list" role="radiogroup" aria-label="How much should the app drive?">' +
      PACE_DEFS.map(function (p) {
        const on = sel === p.id;
        return '<button type="button" class="pace-row' + (on ? ' active' : '') + '" data-pace="' + p.id +
          '" role="radio" aria-checked="' + (on ? 'true' : 'false') + '">' +
          '<span class="dot" aria-hidden="true"></span>' +
          '<span class="body"><span class="t">' + U.esc(p.label) +
          (p.id === kindDefault ? ' <span class="badge">default</span>' : '') + '</span>' +
          '<span class="s">' + U.esc(p.sub) + '</span></span></button>';
      }).join('') + '</div>';
  }

  // The session chip in the active-draft header. Writes draft._pace (this
  // session only) unless 'Remember' is on, which writes the per-kind default.
  function openPaceSheet() {
    const u = user();
    if (!u || !draft) return;
    const kind = draftKind(draft);
    const kindLabel = (PACE_KIND_ROWS.find(function (r) { return r.id === kind; }) || { label: capStr(kind) }).label;
    const defaults = paceSettingsOf(u);
    const st = {
      pace: resolvePace(null, draft),
      cadence: resolveCadence(draft),
      restSec: resolveRestSec(null, draft),
      remember: false
    };

    const content = document.createElement('div');
    function paint() {
      content.innerHTML =
        '<div class="card" style="margin-bottom:12px">' +
        '<div class="card-title">How much should the app drive?</div>' +
        paceRadioHTML(st.pace, PACE_KIND_DEFAULT[kind]) +
        '<div class="pace-opt">' +
        '<div class="body"><div class="t">Rep cadence cues</div>' +
        '<div class="s">3-1-3 tick inside a timed set</div></div>' +
        '<div class="segmented" data-slot="cadence">' +
        '<button type="button" class="seg' + (st.cadence ? '' : ' active') + '" data-cad="0" aria-pressed="' +
        (st.cadence ? 'false' : 'true') + '">Off</button>' +
        '<button type="button" class="seg' + (st.cadence ? ' active' : '') + '" data-cad="1" aria-pressed="' +
        (st.cadence ? 'true' : 'false') + '">On</button>' +
        '</div></div>' +
        '<div class="pace-opt">' +
        '<div class="body"><div class="t">Rest between sets</div>' +
        '<div class="s">Used by This exercise / Whole session</div></div>' +
        '<div class="sw-stepper"><button type="button" class="btn icon ghost" data-rest="-15" aria-label="Less rest">−</button>' +
        '<span class="val" id="pace-rest">' + st.restSec + 's</span>' +
        '<button type="button" class="btn icon ghost" data-rest="15" aria-label="More rest">+</button></div>' +
        '</div>' +
        '<button type="button" class="pace-remember' + (st.remember ? ' active' : '') + '" data-act="remember" ' +
        'role="checkbox" aria-checked="' + (st.remember ? 'true' : 'false') + '">' +
        '<span class="box" aria-hidden="true"></span>' +
        '<span class="body"><span class="t">Remember this for ' + U.esc(kindLabel) + '</span>' +
        '<span class="s">Applies to new ' + U.esc(kindLabel.toLowerCase()) + ' sessions</span></span></button>' +
        '</div>' +
        '<div class="card"><div class="card-title">Your defaults</div>' +
        '<div class="pace-defaults">' + PACE_KIND_ROWS.map(function (r) {
          const v = r.fixed || PACE_DEFS.find(function (p) { return p.id === defaults[r.id]; }).label;
          const tone = r.fixed ? 'off' : defaults[r.id];
          return '<div class="row"><span>' + U.esc(r.label) + '</span>' +
            '<span class="v tone-' + tone + '">' + U.esc(v) + '</span></div>';
        }).join('') + '</div>' +
        '<p class="hint" style="margin-top:10px">A routine can override the default, an exercise can ' +
        'override the routine, and this sheet overrides both for the session you\'re in. Nothing here is ' +
        'needed to train: tapping a set number runs that set, tapping a card\'s stopwatch runs that exercise.</p>' +
        '</div>';
    }
    paint();

    U.on(content, 'click', '[data-pace]', function (e, btn) {
      st.pace = paceVal(btn.getAttribute('data-pace')) || 'off';
      paint();
    });
    U.on(content, 'click', '[data-cad]', function (e, btn) {
      st.cadence = btn.getAttribute('data-cad') === '1';
      paint();
    });
    U.on(content, 'click', '[data-rest]', function (e, btn) {
      st.restSec = U.clamp(st.restSec + parseInt(btn.getAttribute('data-rest'), 10), 0, 600);
      paint();
    });
    U.on(content, 'click', '[data-act="remember"]', function () {
      st.remember = !st.remember;
      paint();
    });

    App.sheet({
      title: 'Session pace',
      content: content,
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        {
          label: 'Apply',
          kind: 'primary',
          onClick: function () {
            if (!draft) return;
            draft._pace = st.pace;
            draft._cadence = st.cadence;
            draft._restSec = st.restSec;
            if (st.remember) {
              // The COMPLETE map, built from what is actually stored — a kind
              // this build does not know (a newer client's, or 'mixed') must
              // survive a Remember tap on some other kind.
              const pace = paceSettingsForWrite(u);
              pace[kind] = st.pace;
              // mergeSettings replaces an unknown key wholesale, so always
              // hand it the COMPLETE pace map, never a partial patch.
              Store.updateUser(u.id, {
                settings: { pace: pace, cadence: st.cadence, restSec: st.restSec }
              });
            }
            saveDraft();
            App.rerender();
          }
        }
      ]
    });
  }

  /* ======================================================================
     P4.5 — the live-session substrate handed to the focus renderer.

     ONE session record: this draft. The focus view never owns state — it
     renders and mutates through here, and every mutation lands in the same
     saveDraft() choke point the builder uses.
     ====================================================================== */

  function focusRenderer() {
    const P = window.Player;
    return P && typeof P.renderFocus === 'function' ? P.renderFocus : null;
  }

  // P3.5 left a private session record behind; the draft is now the only one.
  // A stale 'ironlog/activeSession' is discarded (never resumed) on first sight.
  let legacyDiscarded = false;
  function discardLegacySession() {
    if (legacyDiscarded) return;
    legacyDiscarded = true;
    try { localStorage.removeItem('ironlog/activeSession'); } catch (e) { /* ignore */ }
  }

  // The renderer's PORT: what Player.renderFocus(container, live) is handed.
  // Storage and DOM verbs are this file's; every timing member below is a
  // delegate to Player.Session, so the focus view and the builder drive the
  // same clock through the same choke point.
  function liveSessionApi() {
    return {
      draft: draft,
      rev: draftRev,
      kind: draftKind(draft),
      Session: Session,
      sidOf: sidOf,
      save: saveDraft,
      subscribe: subscribeDraft,
      resolvePace: function (en) { return resolvePace(en, draft); },
      resolveRestSec: function (en) { return resolveRestSec(en, draft); },
      resolveCadence: function () { return resolveCadence(draft); },
      resolveTempo: function (en) { return resolveTempo(en, draft); },
      driverFor: function (en, s) { return driverFor(en, s, draft); },
      targetSecFor: targetSecFor,
      openPaceSheet: openPaceSheet,
      openEntryPaceSheet: openEntryPaceSheet,
      openPicker: openExercisePicker,
      newEntryFor: newEntryFor,
      finish: openFinishSheet,
      discard: function () { clearDraft(); App.rerender(); },
      toBuilder: function () {
        if (!draft) return;
        draft._view = 'builder';
        saveDraft();
        App.rerender();
      }
    };
  }

  // Per-card override -> entry._pace (draft-local, never persisted).
  function openEntryPaceSheet(en, ctx) {
    if (!en) return;
    const inherited = resolvePace(null, draft);
    const cur = paceVal(en._pace);
    const content = document.createElement('div');
    content.innerHTML =
      '<p class="muted" style="font-size:13px;margin-bottom:10px">' +
      U.esc(exName(en.exerciseRef || en.exerciseId)) + ' — how much should the app drive this one?</p>' +
      '<div class="pace-list" role="radiogroup" aria-label="Pace for this exercise">' +
      '<button type="button" class="pace-row' + (cur ? '' : ' active') + '" data-pace="" role="radio" ' +
      'aria-checked="' + (cur ? 'false' : 'true') + '"><span class="dot" aria-hidden="true"></span>' +
      '<span class="body"><span class="t">Use the session setting</span>' +
      '<span class="s">Currently ' + U.esc(PACE_DEFS.find(function (p) { return p.id === inherited; }).label) +
      '</span></span></button>' +
      PACE_DEFS.map(function (p) {
        const on = cur === p.id;
        return '<button type="button" class="pace-row' + (on ? ' active' : '') + '" data-pace="' + p.id +
          '" role="radio" aria-checked="' + (on ? 'true' : 'false') + '">' +
          '<span class="dot" aria-hidden="true"></span>' +
          '<span class="body"><span class="t">' + U.esc(p.label) + '</span>' +
          '<span class="s">' + U.esc(p.sub) + '</span></span></button>';
      }).join('') + '</div>';

    let api = null;
    U.on(content, 'click', '[data-pace]', function (e, btn) {
      const v = paceVal(btn.getAttribute('data-pace'));
      const live = draft ? (draft.entries || []).find(function (x) { return x.id === en.id; }) : null;
      const target = live || en;
      if (v) target._pace = v; else delete target._pace;
      if (draft && target === live) saveDraft();
      else if (ctx && ctx.persist) ctx.persist();
      if (api) api.close();
      App.rerender();
    });
    api = App.sheet({ title: 'Pace for this exercise', content: content });
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
    const prevSwCache = {};

    function prevFor(exId) {
      if (!(exId in prevCache)) prevCache[exId] = ctx.prev ? ctx.prev(exId) : [];
      return prevCache[exId];
    }

    function prevSwFor(ref) {
      if (!(ref in prevSwCache)) prevSwCache[ref] = ctx.prevSw ? ctx.prevSw(ref) : [];
      return prevSwCache[ref];
    }

    function findEntry(cardEl) {
      const eid = cardEl.getAttribute('data-eid');
      return ctx.model.entries.find(function (x) { return x.id === eid; }) || null;
    }

    /* ONE rest authority: at exercise/session pace the Session drives the rests
       (auto-start, skippable, ±15s), so the legacy advisory pill must not fire
       from a ✓ alongside it. Inert unless this editor IS the live draft and a
       chain is armed — pace 'off'/'set' (all of simple mode, and today's lift
       default) keep today's exact advisory rest. */
    function chainedRest() {
      if (!ctx.live || !draft) return false;
      if (Session.isRunning()) return true;
      const c = draft._chain;
      return !!(c && (c.pace === 'exercise' || c.pace === 'session'));
    }

    /* The builder's ✓ is the ONLY control a lift row has (no run affordance),
       so it is what must continue an armed chain — without this hook a session
       pace stalls dead on the first lift set it reaches. Guarded on an armed
       chain as well as ctx.live, so it is a provable no-op at pace 'off'/'set'
       and in simple mode. */
    function noteChainDone(en, s) {
      if (!ctx.live || !s || !s.done || !draft || !draft._chain) return;
      const S = playerSession();
      if (!S || typeof S.noteSetDone !== 'function') return;
      try { S.noteSetDone(en.id, sidOf(s)); } catch (e) { /* the ✓ still stands */ }
    }

    /* ---- P3: setwork row/card renderers (dispatched before the lift branch;
       the lift branch below stays byte-for-byte current behavior) ---- */

    function swRowHTML(en, s, i, rowShape, perSide, prev) {
      const draftMode = ctx.mode === 'draft';
      const done = draftMode && s.done;
      const hs = swHintSetOf(en, prev, i);
      const hint = swHintText(hs, rowShape);
      // P4.5 — live-session row state. `_sid` is only minted inside the live
      // draft; the saved-workout editors never grow one.
      const sid = ctx.live ? sidOf(s) : null;
      const run = sid ? Session.rowState(en.id, sid) : null;
      const cursor = !run && sid && draft && draft._active &&
        draft._active.entryId === en.id && draft._active.sid === sid;
      const drivable = ctx.live && !done && !!driverFor(en, s);
      const cls = 'set-row ' + (rowShape === 'carry' ? 'sw-carry' : 'no-rpe') + (done ? ' done' : '') +
        (run ? ' running' + (run.kind === 'rest' ? ' resting' : '') : '') + (cursor ? ' cursor' : '');
      const aid = 'swa_' + en.id + '_' + i;
      const bid = 'swb_' + en.id + '_' + i;

      let html = '<div class="' + cls + '" data-i="' + i + '"' +
        (sid ? ' data-sid="' + U.esc(sid) + '"' : '') + '>';
      html += drivable
        ? '<button type="button" class="set-num set-run" data-act="sw-run" title="Run this set" ' +
          'aria-label="Run set ' + (i + 1) + '">' + (i + 1) + '</button>'
        : '<span class="set-num" aria-label="Set ' + (i + 1) + '">' + (i + 1) + '</span>';
      html += '<div class="set-prev" style="display:flex;align-items:center;min-width:0">' +
        '<button type="button" data-act="sw-hint"' + (hint ? '' : ' disabled') +
        ' title="Fill from last time" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;' +
        'white-space:nowrap;text-align:left;color:inherit;min-height:40px;padding:0 2px">' +
        (hint ? U.esc(hint) : '—') + '</button>' +
        (draftMode
          ? '<button type="button" class="btn icon ghost" data-act="rmset" aria-label="Remove set" ' +
            'style="width:32px;height:40px;min-height:40px;border:none;color:var(--text-muted)">' + ic().close + '</button>'
          : '') +
        '</div>';
      // P4.5 — the item's TARGET is a placeholder, never a value: it outranks
      // the last-time hint for what the empty field SUGGESTS, and contributes
      // nothing to what gets saved.
      const tgt = targetSetOf(s);
      if (rowShape === 'carry') {
        const phW = tgt && tgt.weightKg > 0 ? dispW(tgt.weightKg)
          : (hs && hs.weightKg > 0 ? dispW(hs.weightKg) : '');
        const phM = tgt && tgt.distanceM > 0 ? String(Math.round(tgt.distanceM))
          : (hs && hs.distanceM > 0 ? String(Math.round(hs.distanceM)) : '');
        html += '<input class="input set-weight" id="' + aid + '" data-act="sw-kg" type="text" inputmode="decimal" ' +
          'autocomplete="off" enterkeyhint="next" aria-label="Load" placeholder="' + U.esc(phW) + '" ' +
          'value="' + (s.weightKg > 0 ? U.esc(dispW(s.weightKg)) : '') + '">';
        html += '<input class="input" id="' + bid + '" data-act="sw-m" type="text" inputmode="numeric" ' +
          'autocomplete="off" enterkeyhint="next" aria-label="Meters" placeholder="' + U.esc(phM) + '" ' +
          'value="' + (s.distanceM > 0 ? Math.round(s.distanceM) : '') + '">';
      } else if (rowShape === 'reps') {
        const phR = tgt && tgt.reps > 0 ? String(tgt.reps) : (hs && hs.reps > 0 ? String(hs.reps) : '');
        html += '<input class="input" id="' + aid + '" data-act="sw-reps" type="text" inputmode="numeric" ' +
          'autocomplete="off" enterkeyhint="next" aria-label="Reps" placeholder="' + U.esc(phR) + '" ' +
          'value="' + (s.reps > 0 ? s.reps : '') + '">';
        html += perSide
          ? '<button type="button" class="sw-side" data-act="sw-side" aria-label="Side, tap to switch">' +
            U.esc(s.side === 'R' ? 'R' : 'L') + '</button>'
          : '<div></div>';
      } else {
        // hold — mm:ss mask shared with parseTimeToSec ('45' = seconds)
        // While the Session drives this row the field shows the live countdown
        // and is read-only; ±15s on the pill retargets instead.
        const phH = tgt && tgt.holdSec > 0 ? fmtClock(tgt.holdSec)
          : (hs && hs.holdSec > 0 ? fmtClock(hs.holdSec) : '0:30');
        const live = run && run.kind === 'work';
        html += '<input class="input" id="' + aid + '" data-act="sw-hold" type="text" inputmode="numeric" ' +
          'autocomplete="off" enterkeyhint="next" aria-label="Hold time" placeholder="' + U.esc(phH) + '" ' +
          (live ? 'readonly ' : '') +
          'value="' + (live ? U.esc(fmtClock(run.remainSec)) : (s.holdSec > 0 ? U.esc(fmtClock(s.holdSec)) : '')) + '">';
        html += perSide
          ? '<button type="button" class="sw-side" data-act="sw-side" aria-label="Side, tap to switch">' +
            U.esc(s.side === 'R' ? 'R' : 'L') + '</button>'
          : '<div></div>';
      }
      html += draftMode
        ? '<button type="button" class="set-check" data-act="sw-check" aria-pressed="' + (done ? 'true' : 'false') +
          '" aria-label="Mark set complete">' + ic().check + '</button>'
        : '<button type="button" class="set-check" data-act="rmset" aria-label="Remove set">' + ic().close + '</button>';
      if (run) {
        html += '<span class="sess-prog" aria-hidden="true"><i style="width:' +
          U.clamp(run.pct, 0, 100) + '%"></i></span>';
      }
      html += '</div>';
      return html;
    }

    function swHeadHTML(rowShape, perSide) {
      const unit = U.unitLabel(App.units()).toUpperCase();
      if (rowShape === 'carry') {
        return '<div class="set-row set-head sw-carry" aria-hidden="true">' +
          '<div>SET</div><div style="text-align:left;padding-left:2px">PREV</div>' +
          '<div>' + unit + '</div><div>METERS</div><div></div></div>';
      }
      const main = rowShape === 'reps' ? 'REPS' : 'HOLD';
      return '<div class="set-row set-head no-rpe" aria-hidden="true">' +
        '<div>SET</div><div style="text-align:left;padding-left:2px">PREV</div>' +
        '<div>' + main + '</div><div>' + (perSide ? 'SIDE' : '') + '</div><div></div></div>';
    }

    function swCardHTML(en) {
      const ex = exOf(en.exerciseRef);
      const stretch = swIsStretch(en);
      const method = stretch ? swMethodOf(en) : null;
      const rowShape = swRowShapeOf(en);
      const perSide = !!(ex && ex.perSide);
      const prev = prevSwFor(en.exerciseRef);
      const notesShown = notesShownOf(en);
      // P4.5 — in the LIVE draft the stopwatch runs the whole exercise (its
      // sets + rests, then stops). Outside it (stretch mini-builder, saved
      // workout editors) it stays the single sheet-level hold countdown.
      const holdTimerOk = ctx.live
        ? entryHasDriver(en)
        : (ctx.mode === 'draft' && setShapeOf(ex) === 'hold');
      const paceOk = ctx.live && perfMode(user());
      const paceOverridden = paceOk && !!paceVal(en._pace);

      let html = '<div class="card" data-eid="' + U.esc(en.id) + '">';
      html += '<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px">' +
        '<div style="flex:1;min-width:0">' +
        '<div style="font-size:16px;font-weight:600;line-height:1.3">' + U.esc(exName(en.exerciseRef)) + '</div>' +
        '<div class="muted" style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
        U.esc(exSub(ex)) + '</div></div>' +
        '<div style="display:flex;gap:2px;flex:none">' +
        (holdTimerOk
          ? '<button type="button" class="btn icon ghost" data-act="sw-timer" title="' +
            (ctx.live ? 'Run this exercise' : 'Hold countdown') + '" aria-label="' +
            (ctx.live ? 'Run this exercise' : 'Hold countdown') + '">' + ic().timer + '</button>'
          : '') +
        (paceOk
          ? '<button type="button" class="btn icon ghost' + (paceOverridden ? ' pace-on' : '') +
            '" data-act="pace" title="How much the app drives this exercise — ' +
            U.esc(PACE_SHORT[resolvePace(en)]) + '" aria-label="Pace for this exercise">' + FOCUS_ICON + '</button>'
          : '') +
        '<button type="button" class="btn icon ghost" data-act="exnotes" title="Exercise notes" aria-label="Exercise notes">' + ic().edit + '</button>' +
        '<button type="button" class="btn icon ghost" data-act="delentry" title="Remove exercise" aria-label="Remove exercise">' + ic().trash + '</button>' +
        '</div></div>';

      if (stretch) {
        html += '<div class="chip-row" style="margin-bottom:6px">' +
          SW_METHOD_DEFS.map(function (m) {
            const on = method === m.id;
            return '<button type="button" class="chip' + (on ? ' active' : '') + '" data-act="sw-method" data-method="' +
              m.id + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + m.label + '</button>';
          }).join('') + '</div>';
      }

      if ((en.sets || []).length) {
        html += swHeadHTML(rowShape, perSide);
        html += en.sets.map(function (s, i) { return swRowHTML(en, s, i, rowShape, perSide, prev); }).join('');
      } else {
        html += '<p class="muted" style="font-size:13px;margin:4px 0 8px">No sets — add one below.</p>';
      }

      if (stretch) {
        const depth = swDepthOf(en);
        html += '<div class="sw-depth-label">Stretch depth</div>' +
          '<div class="sw-depth-row" role="group" aria-label="Stretch depth">' +
          SW_DEPTHS.map(function (d) {
            const on = depth === d.n;
            return '<button type="button" class="chip' + (on ? ' active' : '') + '" data-act="sw-depth" data-depth="' +
              d.n + '" aria-pressed="' + (on ? 'true' : 'false') + '" title="' + U.esc(d.hint) + '">' +
              '<span class="n">' + d.n + '</span>' + d.label + '</button>';
          }).join('') + '</div>';
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

    // ✓ accepts hint values; rest timer starts for hold/carry work (not
    // stretches — flow moves straight to the next stretch).
    function onSwCheck(en, i, rowEl, btn) {
      const s = en.sets[i];
      if (!s) return;
      const rowShape = swRowShapeOf(en);
      if (!s.done) {
        if (!swValidSet(s)) {
          // A ✓ accepts what the row SHOWS: its own prescribed target first
          // (that is the placeholder the user is looking at), then the
          // carry-forward, then the last-time hint. An UNTOUCHED set is still
          // never filled — this only runs on the row the user just ticked.
          let src = targetSetOf(s);
          if (!src) {
            for (let j = i - 1; j >= 0; j--) {
              if (swValidSet(en.sets[j])) { src = en.sets[j]; break; }
            }
            if (!src) src = swHintSetOf(en, prevSwFor(en.exerciseRef), i);
          }
          if (src) {
            if (rowShape === 'carry') {
              if (!((s.distanceM || 0) > 0) && (src.distanceM || 0) > 0) s.distanceM = src.distanceM;
              if (!((s.weightKg || 0) > 0) && (src.weightKg || 0) > 0) s.weightKg = src.weightKg;
            } else if (rowShape === 'reps') {
              if (!((s.reps || 0) > 0) && (src.reps || 0) > 0) s.reps = src.reps;
            } else if (!((s.holdSec || 0) > 0) && (src.holdSec || 0) > 0) {
              s.holdSec = src.holdSec;
            }
          }
        }
        s.done = true;
        if (!swIsStretch(en) && !chainedRest()) startRest(settingsOf(user()).restTimerSec);
      } else {
        s.done = false;
      }
      rowEl.classList.toggle('done', !!s.done);
      btn.setAttribute('aria-pressed', s.done ? 'true' : 'false');
      // P4.5 — a manual ✓ continues an armed chain (exercise/session pace)
      noteChainDone(en, s);
      const aIn = rowEl.querySelector('#swa_' + en.id + '_' + i);
      const bIn = rowEl.querySelector('#swb_' + en.id + '_' + i);
      if (aIn && aIn.value === '') {
        if (rowShape === 'carry' && s.weightKg > 0) aIn.value = dispW(s.weightKg);
        if (rowShape === 'reps' && s.reps > 0) aIn.value = String(s.reps);
        if (rowShape === 'hold' && s.holdSec > 0) aIn.value = fmtClock(s.holdSec);
      }
      if (bIn && bIn.value === '' && s.distanceM > 0) bIn.value = String(Math.round(s.distanceM));
      ctx.persist();
      if (ctx.onStats) ctx.onStats();
    }

    // Sheet-level hold countdown (the stretch mini-builder and the saved-workout
    // editors — the LIVE draft uses the Session engine instead). Target = the
    // first open set's filled/prefilled seconds, default 30.
    // P4.5 BUG FIX (binding): this used to write holdSec = target while the
    // player wrote actual elapsed — two answers for one thing. holdSec is now
    // ALWAYS the seconds actually held, here too.
    function startSwTimer(en) {
      const open = (en.sets || []).find(function (s) { return !s.done; });
      if (!open) { App.toast('All sets are done', 'info'); return; }
      let target = (open.holdSec || 0) > 0 ? open.holdSec : 0;
      if (!target) {
        const hs = swHintSetOf(en, prevSwFor(en.exerciseRef), en.sets.indexOf(open));
        if (hs && (hs.holdSec || 0) > 0) target = hs.holdSec;
      }
      if (!target) target = DEFAULT_HOLD_SEC;
      const eid = en.id;
      startHold(target, function (actualSec) {
        const held = Math.max(1, Math.round(actualSec > 0 ? actualSec : target));
        // draft may have been reloaded by a rerender — re-resolve by entry id
        if (ctx.mode === 'draft' && draft && ctx.model === draft) {
          const live = draft.entries.find(function (x) { return x.id === eid; });
          const t = live ? (live.sets || []).find(function (x) { return !x.done; }) : null;
          if (!t) return;
          t.holdSec = held;
          t.done = true;
          saveDraft();
          App.rerender();
          return;
        }
        const live = ctx.model.entries.find(function (x) { return x.id === eid; });
        const t = live ? (live.sets || []).find(function (x) { return !x.done; }) : null;
        if (!t) return;
        t.holdSec = held;
        t.done = true;
        ctx.persist();
        repaint();
      });
    }

    function onSetworkClick(en, btn) {
      const act = btn.getAttribute('data-act');
      const rowEl = btn.closest('.set-row');
      const i = rowEl ? parseInt(rowEl.getAttribute('data-i'), 10) : -1;
      const s = i >= 0 ? en.sets[i] : null;

      // P4.5 direct manipulation — tap a set's NUMBER to run exactly that set.
      if (act === 'sw-run' && s) { Session.runSet(en.id, sidOf(s), {}); return; }

      if (act === 'pace') { openEntryPaceSheet(en, ctx); return; }

      if (act === 'sw-check' && s) {
        // ✓ on the running row hands the Session the stop, so the ACTUAL
        // seconds land on the set instead of whatever was typed.
        const st = ctx.live && s._sid ? Session.rowState(en.id, s._sid) : null;
        if (st && st.kind === 'work') { Session.doneNow(); return; }
        onSwCheck(en, i, rowEl, btn);
        return;
      }

      if (act === 'sw-side' && s) {
        s.side = s.side === 'L' ? 'R' : 'L';
        btn.textContent = s.side;
        ctx.persist();
        return;
      }

      if (act === 'sw-hint' && s) {
        const hs = swHintSetOf(en, prevSwFor(en.exerciseRef), i);
        if (!hs) return;
        const rowShape = swRowShapeOf(en);
        const aIn = rowEl.querySelector('#swa_' + en.id + '_' + i);
        const bIn = rowEl.querySelector('#swb_' + en.id + '_' + i);
        if (rowShape === 'carry') {
          if ((hs.distanceM || 0) > 0) s.distanceM = hs.distanceM;
          s.weightKg = hs.weightKg || 0;
          if (aIn) aIn.value = s.weightKg > 0 ? dispW(s.weightKg) : '';
          if (bIn) bIn.value = s.distanceM > 0 ? String(Math.round(s.distanceM)) : '';
        } else if (rowShape === 'reps') {
          if ((hs.reps || 0) > 0) s.reps = hs.reps;
          if (aIn) aIn.value = s.reps > 0 ? String(s.reps) : '';
        } else {
          if ((hs.holdSec || 0) > 0) s.holdSec = hs.holdSec;
          if (aIn) aIn.value = s.holdSec > 0 ? fmtClock(s.holdSec) : '';
        }
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
        const ex = exOf(en.exerciseRef);
        const last = en.sets[en.sets.length - 1] || null;
        const next = { done: false, _sid: U.uid('s') };
        if (last) {
          if ((last.reps || 0) > 0) next.reps = last.reps;
          if ((last.holdSec || 0) > 0) next.holdSec = last.holdSec;
          if ((last.distanceM || 0) > 0) next.distanceM = last.distanceM;
          if ((last.weightKg || 0) > 0) next.weightKg = last.weightKg;
        }
        if (ex && ex.perSide) {
          // auto-alternate the side; clone values from the previous same-side set
          next.side = last && last.side === 'L' ? 'R' : 'L';
        } else if (last && (last.side === 'L' || last.side === 'R')) {
          next.side = last.side === 'L' ? 'R' : 'L';
        }
        en.sets.push(next);
        ctx.persist();
        repaint();
        focusInput('swa_' + en.id + '_' + (en.sets.length - 1));
        return;
      }

      if (act === 'sw-depth') {
        en._depth = U.clamp(parseInt(btn.getAttribute('data-depth'), 10) || 2, 1, 4);
        // An explicit chip tap is a statement about the WHOLE entry, and it is
        // the only depth control the UI offers. Since P4.5 the save cleaner
        // lets a set's OWN intensity outrank the card aim — and it writes one
        // onto every set — so without this write-through the chip goes inert
        // the moment a workout has been saved once (a silent no-op in the
        // saved-workout editor). Rows already completed in a LIVE draft keep
        // what was captured for them (the rest-step depth ask).
        (en.sets || []).forEach(function (s) {
          if (!s || (ctx.mode === 'draft' && s.done)) return;
          s.intensity = en._depth;
        });
        ctx.persist();
        repaint();
        return;
      }

      if (act === 'sw-method') {
        const prevShape = swRowShapeOf(en);
        en.method = btn.getAttribute('data-method');
        const nextShape = swRowShapeOf(en);
        // A hold<->reps flip changes which value field the rows display; clear
        // the now-hidden field on draft rows the user hasn't checked so no
        // phantom value keeps an empty-looking row 'valid' or gets saved.
        // Done rows — and saved sets in the edit sheet — keep their recorded
        // data intact (flipping back re-displays it).
        if (prevShape !== nextShape && ctx.mode === 'draft') {
          (en.sets || []).forEach(function (s) {
            if (!s || s.done) return;
            if (nextShape === 'reps') delete s.holdSec;
            else if (nextShape === 'hold') delete s.reps;
          });
        }
        ctx.persist();
        repaint();
        return;
      }

      if (act === 'sw-timer') {
        // live draft: run the exercise (sets + rests, then stop).
        if (ctx.live) Session.runEntry(en.id);
        else startSwTimer(en);
        return;
      }

      if (act === 'exnotes') {
        en._notesOpen = !notesShownOf(en);
        ctx.persist();
        repaint();
        if (en._notesOpen) focusInput('enn_' + en.id);
        return;
      }

      if (act === 'delentry') {
        const hasData = (en.sets || []).some(swValidSet);
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
            message: exName(en.exerciseRef) + ' and its logged sets will be removed from this workout.',
            danger: true,
            confirmLabel: 'Remove'
          }).then(function (ok) { if (ok) doRemove(); });
        } else {
          doRemove();
        }
      }
    }

    function setRowHTML(en, s, i, showRpe, prev) {
      if (isSetworkEntry(en)) {
        const swEx = exOf(en.exerciseRef);
        return swRowHTML(en, s, i, swRowShapeOf(en), !!(swEx && swEx.perSide), prevSwFor(en.exerciseRef));
      }
      const draftMode = ctx.mode === 'draft';
      const done = draftMode && s.done;
      const hs = hintSetOf(prev, i);
      const hint = hs && hs.reps
        ? (hs.weightKg > 0 ? dispW(hs.weightKg) : 'BW') + ' × ' + hs.reps
        : '';
      // P4.5 — a routine target renders as a placeholder (see targetSetOf);
      // with none present this is byte-for-byte the previous behavior.
      const tgt = targetSetOf(s);
      const phW = tgt && tgt.weightKg > 0 ? dispW(tgt.weightKg)
        : (hs && hs.weightKg > 0 ? dispW(hs.weightKg) : '');
      const phR = tgt && tgt.reps > 0 ? String(tgt.reps)
        : (hs && hs.reps ? String(hs.reps)
          : (en._repLow && en._repHigh ? en._repLow + '–' + en._repHigh : ''));
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
      if (isSetworkEntry(en)) return swCardHTML(en);
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

    /* P4.5 — NEVER rebuild under the caret. Every session-step transition
       repaints the whole builder (root.innerHTML), which replaces the node the
       user is typing into: focus is lost, the rest of the word goes nowhere and
       the half-parsed prefix ('1' of '1:15') is what survives to the draft.
       Every editable field carries a stable id, so save the RAW in-progress
       string plus the selection and put them back. Restoring the raw string
       matters as much as the focus: otherwise the formatter rewrites '1:' to
       '0:01' the moment the step moves. Timer-written cells (the running row's
       readonly countdown) are deliberately excluded — they must keep updating. */
    function keepCaret() {
      const a = document.activeElement;
      if (!a || !a.id || !root.contains(a)) return null;
      if (typeof a.value !== 'string' || a.hasAttribute('readonly')) return null;
      const k = { id: a.id, value: a.value, s: null, e: null };
      try { k.s = a.selectionStart; k.e = a.selectionEnd; } catch (err) { /* not text-shaped */ }
      return k;
    }

    function restoreCaret(k) {
      if (!k) return;
      const el = document.getElementById(k.id);
      if (!el || !root.contains(el) || el.hasAttribute('readonly')) return;
      el.value = k.value;
      try { el.focus({ preventScroll: true }); } catch (err) { el.focus(); }
      if (k.s === null) return;
      try { el.setSelectionRange(k.s, k.e); } catch (err) { /* not text-shaped */ }
    }

    function repaint() {
      const keep = keepCaret();
      if (!ctx.model.entries.length) {
        root.innerHTML = '<div class="empty" style="padding:32px 24px">' + ic().log +
          '<h3>No exercises yet</h3><p>Add an exercise to start logging sets.</p></div>';
      } else {
        root.innerHTML = ctx.model.entries.map(entryCardHTML).join('');
      }
      restoreCaret(keep);
      if (ctx.onStats) ctx.onStats();
    }

    function onCheck(en, i, rowEl, btn) {
      const s = en.sets[i];
      if (!s) return;
      if (!s.done) {
        if (!s.weightKg || !s.reps) {
          // the ✓ accepts what the row SHOWS — prescribed target, then the
          // carry-forward, then last time (null target => today's exact path)
          let src = targetSetOf(s);
          if (!src) {
            for (let j = i - 1; j >= 0; j--) {
              const p = en.sets[j];
              if ((p.weightKg || 0) > 0 || (p.reps || 0) > 0) { src = p; break; }
            }
            if (!src) src = hintSetOf(prevFor(en.exerciseId), i);
          }
          if (src) {
            if (!s.weightKg) s.weightKg = src.weightKg || 0;
            if (!s.reps) s.reps = src.reps || 0;
          }
        }
        s.done = true;
        if (s.type !== 'warmup' && !chainedRest()) startRest(settingsOf(user()).restTimerSec);
      } else {
        s.done = false;
      }
      rowEl.classList.toggle('done', !!s.done);
      btn.setAttribute('aria-pressed', s.done ? 'true' : 'false');
      // P4.5 — a manual ✓ continues an armed chain (exercise/session pace)
      noteChainDone(en, s);
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
      if (isSetworkEntry(en)) { onSetworkClick(en, btn); return; }
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
      if (isSetworkEntry(en)) {
        if (act === 'sw-hold') {
          const sec = parseTimeToSec(inp.value, 'sec');
          s.holdSec = sec === null || sec <= 0 ? 0 : Math.round(sec);
        } else if (act === 'sw-reps') {
          const n = parseInt(inp.value, 10);
          s.reps = isNaN(n) || n < 0 ? 0 : n;
        } else if (act === 'sw-kg') {
          s.weightKg = inp.value.trim() === '' ? 0 : U.displayToKg(inp.value, App.units());
        } else if (act === 'sw-m') {
          const m = parseFloat(inp.value);
          s.distanceM = isNaN(m) || m < 0 ? 0 : m;
        }
        ctx.persist();
        if (ctx.onStats) ctx.onStats();
        return;
      }
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
      const swEn = ctx.model.entries.find(function (x) { return x.id === eid; });
      if (isSetworkEntry(swEn)) {
        if (inp.id.indexOf('swa_') === 0 && document.getElementById('swb_' + eid + '_' + i)) {
          focusInput('swb_' + eid + '_' + i);
          return;
        }
        if (i + 1 < swEn.sets.length) { focusInput('swa_' + eid + '_' + (i + 1)); return; }
        inp.blur();
        return;
      }
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
    // (opts.category narrows recents and results, e.g. the stretch builder)
    const recents = [];
    if (u) {
      const ws = Store.workoutsFor(u.id);
      for (let i = 0; i < ws.length && recents.length < 10; i++) {
        (ws[i].entries || []).forEach(function (en) {
          const rid = en.exerciseId || (en.type === 'setwork' ? en.exerciseRef : null);
          const rex = rid ? exOf(rid) : null;
          if (recents.length < 10 && rex && recents.indexOf(rid) < 0 &&
              (!opts.category || rex.category === opts.category)) {
            recents.push(rid);
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
      const list = ExerciseDB.search(state.q, {
        muscle: state.muscle, equipment: state.equip, category: opts.category || null
      });
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
     V2 — typed sessions (cardio / mobility / durability / test)
     Additive layer around the lift-logging flow. Guardrails and MuscleMap
     are referenced lazily (window.*) so absence never breaks this module.
     ====================================================================== */

  const KM_PER_MILE = 1.609344;

  const KIND_LABELS = {
    lift: 'Lift', run: 'Run', ruck: 'Ruck', swim: 'Swim', bike: 'Bike',
    row: 'Row', stairs: 'Stairs', circuit: 'Circuit', cardio: 'Cardio',
    mobility: 'Mobility', durability: 'Durability', test: 'Test', mixed: 'Mixed',
    setwork: 'Set work'
  };

  const CARDIO_MODE_DEFS = [
    { id: 'run', label: 'Run' }, { id: 'ruck', label: 'Ruck' },
    { id: 'swim', label: 'Swim' }, { id: 'bike', label: 'Bike' },
    { id: 'row', label: 'Row' }, { id: 'stairs', label: 'Stairs' },
    { id: 'circuit', label: 'Circuit' }
  ];

  const FEEL_DEFS = [
    { id: 'easy', label: 'Easy' }, { id: 'normal', label: 'Normal' },
    { id: 'hard', label: 'Hard' }, { id: 'hurt', label: 'Hurt' }
  ];

  const MODALITY_DEFS = [
    { id: 'static', label: 'Static' }, { id: 'dynamic', label: 'Dynamic' },
    { id: 'yoga', label: 'Yoga' }, { id: 'foam_roll', label: 'Foam roll' }
  ];

  const SLOT_LABELS = {
    unilateral: 'Unilateral lower', calf_tib: 'Calf & tibialis',
    grip: 'Grip', core: 'Core', other: 'Durability work'
  };

  // P1 test protocols. unit: 'time' (mm:ss, stored seconds) | 'reps' | 'score'.
  // plain: how a bare number (no colon) in the value field is interpreted.
  const TEST_PROTOCOLS = [
    { id: 'run2mi', label: '2-mile run', unit: 'time', hint: 'mm:ss', plain: 'min' },
    { id: 'run5mi', label: '5-mile run', unit: 'time', hint: 'mm:ss', plain: 'min' },
    { id: 'ruck12mi', label: '12-mile ruck', unit: 'time', hint: 'h:mm:ss', plain: 'min' },
    { id: 'swim500m', label: '500 m swim', unit: 'time', hint: 'mm:ss', plain: 'min' },
    { id: 'pushups2min', label: 'Push-ups (2 min)', unit: 'reps' },
    { id: 'situps2min', label: 'Sit-ups (2 min)', unit: 'reps' },
    { id: 'pullups_max', label: 'Pull-ups (max)', unit: 'reps' },
    { id: 'plank', label: 'Plank hold', unit: 'time', hint: 'mm:ss', plain: 'sec' },
    { id: 'deadhang', label: 'Dead hang', unit: 'time', hint: 'mm:ss', plain: 'sec' },
    { id: 'slcalf_l', label: 'Single-leg calf raises (L)', unit: 'reps' },
    { id: 'slcalf_r', label: 'Single-leg calf raises (R)', unit: 'reps' },
    { id: 'acft', label: 'ACFT (total score)', unit: 'score' }
  ];

  // Small kind glyphs (15px) — App.icons has no cardio/mobility icons, so these
  // live locally. Same stroke language as App.icons.
  function svgK(inner) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="15" height="15" ' +
      'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
  }

  const KIND_ICONS = {
    lift: svgK('<path d="M6.3 7.7v8.6M3.4 9.7v4.6M17.7 7.7v8.6M20.6 9.7v4.6M6.3 12h11.4"/>'),
    run: svgK('<circle cx="14.7" cy="4.6" r="1.9"/><path d="M13.2 8.3 9.6 10l1.6 3.6-3.3 4.9M13.2 8.3l2.4 3.1 3.6.6M13.2 8.3 9.9 7.7 6.8 10M11.2 13.6l3.2 2 1 4.9"/>'),
    ruck: svgK('<rect x="6" y="7.5" width="12" height="12.5" rx="3"/><path d="M9.2 7.5V5.8a2.8 2.8 0 0 1 5.6 0v1.7M6 12.5h12"/>'),
    swim: svgK('<circle cx="16.4" cy="6.8" r="1.8"/><path d="M4.2 12.5 11 8.6l3.4 3M2.8 17.4c1.5-1.3 3.1-1.3 4.6 0s3.1 1.3 4.6 0 3.1-1.3 4.6 0 3.1 1.3 4.6 0"/>'),
    bike: svgK('<circle cx="6" cy="16.3" r="3.6"/><circle cx="18" cy="16.3" r="3.6"/><path d="M6 16.3 9.8 9h5.4l2.8 7.3M9.8 9 8 5.6h3.2"/>'),
    row: svgK('<path d="M3 15.6c3.2 1.9 14.8 1.9 18 0l-2.6 3.9H5.6Z"/><path d="M12 15.6 17.2 5M15.4 8.7l3.7 1.7"/>'),
    stairs: svgK('<path d="M3.5 20h4.3v-4h4.2v-4h4.2V8h4.3"/>'),
    circuit: svgK('<path d="M12 21c3.8 0 6.4-2.5 6.4-6 0-2.4-1.2-4.5-2.9-6.2-.3 1-.9 1.9-1.8 2.5.3-2.7-1-5.6-3.6-7.6.3 3-1 4.6-2.4 6.2C6.4 11.4 5.6 13 5.6 15c0 3.5 2.6 6 6.4 6Z"/>'),
    cardio: svgK('<path d="M12 20.4S4.2 15.6 4.2 9.9C4.2 7.2 6.1 5.2 8.6 5.2c1.5 0 2.8.7 3.4 1.9.6-1.2 1.9-1.9 3.4-1.9 2.5 0 4.4 2 4.4 4.7 0 5.7-7.8 10.5-7.8 10.5Z"/>'),
    mobility: svgK('<circle cx="12" cy="4.6" r="1.9"/><path d="M12 7.6v5.2M12 12.8l-4.6 6.7M12 12.8l4.6 6.7M4.6 8.4 12 10.9l7.4-2.5"/>'),
    durability: svgK('<path d="M12 3l7 2.8V11c0 4.8-3 8.4-7 10-4-1.6-7-5.2-7-10V5.8Z"/><path d="M9 11.6l2 2 4-4"/>'),
    test: svgK('<circle cx="12" cy="13.5" r="7.2"/><path d="M12 10v3.7l2.3 1.5M9.6 2.7h4.8M12 2.7v3.6"/>'),
    mixed: svgK('<path d="M12 3 3 8l9 5 9-5Z"/><path d="M3 13l9 5 9-5"/>')
  };

  // P3: a lone setwork entry defaults to the durability shield.
  KIND_ICONS.setwork = KIND_ICONS.durability;

  function kindGlyph(kind) {
    return '<span style="display:inline-flex;align-items:center;flex:none;color:var(--text-muted)" aria-hidden="true">' +
      (KIND_ICONS[kind] || KIND_ICONS.lift) + '</span>';
  }

  // P3: setwork workouts pick their glyph by majority exercise category —
  // mobility-heavy sessions read as stretch, everything else as durability.
  function workoutGlyphKind(w) {
    const k = kindOfWorkout(w);
    if (k !== 'setwork') return k;
    let mob = 0;
    let oth = 0;
    ((w && w.entries) || []).forEach(function (en) {
      if (!isSetworkEntry(en)) return;
      if (swIsStretch(en)) mob++;
      else oth++;
    });
    return mob >= oth && mob > 0 ? 'mobility' : 'durability';
  }

  /* ---------- entry / workout kind helpers ---------- */

  function perfMode(u) {
    return !!(u && u.settings && u.settings.trainingProfile === 'performance');
  }

  // P3.5: guided sessions live in js/player.js (loaded AFTER this file) —
  // always reference lazily; absence means the feature quietly stays hidden.
  function playerApi() {
    const P = window.Player;
    return P && typeof P.start === 'function' ? P : null;
  }

  function stretchRoutinesFor(u) {
    if (!u || typeof Store.routinesFor !== 'function') return [];
    return (Store.routinesFor(u.id) || []).filter(function (r) {
      return r && r.kind === 'stretch' && (r.items || []).length;
    });
  }

  function isLiftEntry(en) {
    return !!en && (en.type === undefined || en.type === null || en.type === 'lift');
  }

  function liftEntriesOf(w) {
    return ((w && w.entries) || []).filter(isLiftEntry);
  }

  function typedEntriesOf(w) {
    return ((w && w.entries) || []).filter(function (en) { return en && !isLiftEntry(en); });
  }

  function setworkEntriesOf(w) {
    return ((w && w.entries) || []).filter(isSetworkEntry);
  }

  // Repeating a workout seeds lift entries and (P3) draft-editable setwork
  // entries into the draft — other typed entries (cardio/mobility/durability/
  // test blobs) stay non-repeatable and never flow through the editor.
  function repeatableView(w) {
    const keep = ((w && w.entries) || []).filter(function (en) {
      return isLiftEntry(en) || isSetworkEntry(en);
    });
    return keep.length === ((w && w.entries) || []).length
      ? w
      : { name: w.name, entries: keep };
  }

  function entryKindOf(en) {
    if (isLiftEntry(en)) return 'lift';
    if (en.type === 'cardio') return typeof en.mode === 'string' && en.mode ? en.mode : 'cardio';
    return typeof en.type === 'string' ? en.type : 'lift';
  }

  function kindOfWorkout(w) {
    if (w && typeof w.kind === 'string' && w.kind) return w.kind;
    const ks = [];
    ((w && w.entries) || []).forEach(function (en) {
      if (!en) return;
      const k = entryKindOf(en);
      if (ks.indexOf(k) < 0) ks.push(k);
    });
    return ks.length === 1 ? ks[0] : (ks.length ? 'mixed' : 'lift');
  }

  function capStr(s) {
    s = String(s || '').replace(/_/g, ' ');
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  }

  /* ---------- distance / pace / time formatting ---------- */

  function distUnit() { return App.units() === 'lb' ? 'mi' : 'km'; }

  function kmToDist(km) { return App.units() === 'lb' ? km / KM_PER_MILE : km; }

  function distToKm(v) {
    const n = parseFloat(v);
    if (isNaN(n) || n <= 0) return 0;
    return App.units() === 'lb' ? n * KM_PER_MILE : n;
  }

  function fmtKm(km) {
    if (!km || km <= 0) return '';
    return (Math.round(kmToDist(km) * 100) / 100) + ' ' + distUnit();
  }

  function paceStr(durationMin, km) {
    if (!km || km <= 0 || !durationMin || durationMin <= 0) return '';
    const per = durationMin / kmToDist(km);
    if (!isFinite(per) || per <= 0) return '';
    let m = Math.floor(per);
    let s = Math.round((per - m) * 60);
    if (s === 60) { m++; s = 0; }
    return m + ':' + pad2(s) + ' /' + distUnit();
  }

  function fmtSec(sec) {
    if (sec === null || sec === undefined || isNaN(sec)) return '';
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h ? h + ':' + pad2(m) + ':' + pad2(s) : m + ':' + pad2(s);
  }

  // 'mm:ss' / 'h:mm:ss' -> seconds; a bare number is minutes or seconds
  // depending on plainUnit. null on garbage.
  function parseTimeToSec(str, plainUnit) {
    str = String(str || '').trim();
    if (!str) return null;
    if (str.indexOf(':') >= 0) {
      const parts = str.split(':').map(function (p) { return p.trim(); });
      if (parts.some(function (p) { return p === '' || isNaN(Number(p)) || Number(p) < 0; })) return null;
      const n = parts.map(Number);
      if (n.length === 2) return n[0] * 60 + n[1];
      if (n.length === 3) return n[0] * 3600 + n[1] * 60 + n[2];
      return null;
    }
    const v = parseFloat(str);
    if (isNaN(v) || v < 0) return null;
    return plainUnit === 'sec' ? v : v * 60;
  }

  function testProtocolOf(id) {
    return TEST_PROTOCOLS.find(function (p) { return p.id === id; }) || null;
  }

  function fmtTestValue(protocolId, results, score) {
    const p = testProtocolOf(protocolId);
    const v = results && typeof results.value === 'number' ? results.value : null;
    if (v === null) return typeof score === 'number' ? score + ' pts' : '';
    if (p && p.unit === 'time') return fmtSec(v);
    if (p && p.unit === 'score') return v + ' pts';
    return v + ' reps';
  }

  /* ---------- scored test results (P2 — Protocols) ---------- */

  const ACFT_EVENT_IDS = ['mdl', 'spt', 'hrp', 'sdc', 'plk', 'tmr'];

  function hasAcftRaws(results) {
    if (!results || typeof results !== 'object') return false;
    return ACFT_EVENT_IDS.some(function (id) {
      return typeof results[id] === 'number' && isFinite(results[id]);
    });
  }

  // Entries the simple test editor must never touch: ACFT results carry six
  // raw event fields plus a cached score, and the editor's {value}-only
  // rebuild would silently destroy them. These route to the read-only
  // scored detail (openAcftTestDetail) instead.
  function isAcftTestEntry(en) {
    return !!en && en.type === 'test' &&
      (en.protocol === 'acft' || hasAcftRaws(en.results));
  }

  function fmtAcftRaw(ev, raw) {
    if (ev.unit === 'mm:ss') return fmtSec(raw);
    if (ev.unit === 'lb') return Math.round(raw) + ' lb';
    if (ev.unit === 'm') return (Math.round(raw * 10) / 10) + ' m';
    return Math.round(raw) + ' reps';
  }

  // Scored rows for a test entry in the workout detail: ACFT entries with raw
  // event values get a per-event table (name, raw, points) plus total and
  // pass/fail; everything else a Protocols-formatted value. Returns '' when
  // Protocols is unavailable so callers fall back to the P1 rendering.
  function testScoredHTML(en, w) {
    if (typeof Protocols === 'undefined' || !Protocols) return '';
    if (en.protocol === 'acft' && hasAcftRaws(en.results) &&
        typeof Protocols.scoreACFT === 'function' && typeof Protocols.byId === 'function') {
      const owner = (Store.state.users || []).find(function (x) { return x.id === w.userId; });
      const prof = (owner && owner.profile) || {};
      let sc = null;
      try {
        sc = Protocols.scoreACFT(en.results, { sex: prof.sex, birthYear: prof.birthYear, date: w.date });
      } catch (e) { sc = null; }
      const def = Protocols.byId('acft');
      if (!sc || !sc.events || !def || !Array.isArray(def.events)) return '';
      let html = '<div class="table-wrap" style="margin:8px 0 2px"><table class="table"><thead><tr>' +
        '<th>Event</th><th>Result</th><th class="num">Points</th></tr></thead><tbody>';
      def.events.forEach(function (ev) {
        const row = sc.events[ev.id] || { raw: null, points: null };
        html += '<tr><td>' + U.esc(ev.name) + '</td>' +
          '<td>' + (row.raw === null ? '—' : U.esc(fmtAcftRaw(ev, row.raw))) + '</td>' +
          '<td class="num">' + (row.points === null ? '—' : row.points) + '</td></tr>';
      });
      html += '</tbody></table></div>';
      html += kvRow('Total', sc.total + ' pts');
      html += kvRow('Result', sc.pass ? 'Pass — every event 60+' : 'Fail — an event under 60');
      return html;
    }
    const v = en.results && typeof en.results.value === 'number' ? en.results.value
      : typeof en.score === 'number' ? en.score : null;
    if (v === null || typeof Protocols.fmtValue !== 'function') return '';
    let out = '';
    try { out = Protocols.fmtValue(en.protocol, v, App.units()); } catch (e) { return ''; }
    return out ? kvRow('Result', out) : '';
  }

  function muscleLabelOf(m) {
    const map = window.ExerciseDB && ExerciseDB.MUSCLE_LABEL;
    return (map && map[m]) || capStr(m);
  }

  /* ---------- guardrails (lazy — module may be absent) ---------- */

  function guardrailsFor(draftW, u) {
    if (!u || !perfMode(u)) return [];
    const G = window.Guardrails;
    if (!G || typeof G.checkSession !== 'function') return [];
    try {
      // painLog (P3) activates the stretch/pain-overlap rule; optional arg,
      // older Guardrails builds ignore it.
      const pain = typeof Store.painFor === 'function' ? (Store.painFor(u.id) || []) : [];
      return G.checkSession(draftW, Store.workoutsFor(u.id), u, pain) || [];
    } catch (e) {
      return [];
    }
  }

  function guardHTML(warns) {
    if (!warns.length) return '';
    return warns.map(function (g) {
      const stop = g.level === 'stop';
      return '<p style="font-size:13px;line-height:1.5;margin:6px 0;color:' +
        (stop ? 'var(--red)' : 'var(--orange)') + '">' +
        (stop ? '⛔ ' : '⚠️ ') + U.esc(g.message) + '</p>';
    }).join('');
  }

  // 'stop'-level findings require an explicit 'Save anyway'; warns never block.
  function confirmStops(warns) {
    const stops = warns.filter(function (g) { return g.level === 'stop'; });
    if (!stops.length) return Promise.resolve(true);
    return App.confirm({
      title: 'Sure about this one?',
      message: stops.map(function (g) { return g.message; }).join('\n\n'),
      danger: true,
      confirmLabel: 'Save anyway'
    });
  }

  function toastWarns(warns) {
    if (warns.length) App.toast('⚠️ ' + warns[0].message);
  }

  /* ---------- session RPE / feel / check-in ---------- */

  function rpeFeelHTML(sel) {
    sel = sel || {};
    let html = '<div class="field"><label>Session effort (RPE 1–10)</label>' +
      '<div class="chip-row" data-slot="rpe" style="flex-wrap:wrap">';
    for (let i = 1; i <= 10; i++) {
      const on = sel.rpe === i;
      html += '<button type="button" class="chip' + (on ? ' active' : '') + '" data-rpe="' + i +
        '" aria-pressed="' + (on ? 'true' : 'false') +
        '" style="min-width:42px;justify-content:center;padding:7px 6px">' + i + '</button>';
    }
    html += '</div></div>';
    html += '<div class="field"><label>How it felt</label>' +
      '<div class="chip-row" data-slot="feel" style="flex-wrap:wrap">' +
      FEEL_DEFS.map(function (f) {
        const on = sel.feel === f.id;
        return '<button type="button" class="chip' + (on ? ' active' : '') + '" data-feel="' + f.id +
          '" aria-pressed="' + (on ? 'true' : 'false') + '">' + f.label + '</button>';
      }).join('') + '</div></div>';
    return html;
  }

  function wireRpeFeel(root, sel) {
    U.on(root, 'click', '[data-rpe]', function (e, chip) {
      const v = parseInt(chip.getAttribute('data-rpe'), 10);
      sel.rpe = sel.rpe === v ? null : v;
      U.$$('[data-rpe]', root).forEach(function (c) {
        const on = parseInt(c.getAttribute('data-rpe'), 10) === sel.rpe;
        c.classList.toggle('active', on);
        c.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    });
    U.on(root, 'click', '[data-feel]', function (e, chip) {
      const v = chip.getAttribute('data-feel');
      sel.feel = sel.feel === v ? null : v;
      U.$$('[data-feel]', root).forEach(function (c) {
        const on = c.getAttribute('data-feel') === sel.feel;
        c.classList.toggle('active', on);
        c.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    });
  }

  function checkinQuestion(kind, entry) {
    if (kind === 'ruck') return 'How did your feet and shoulders hold up?';
    if (kind === 'run') {
      const pushed = entry && (entry.effort === 'moderate' || entry.effort === 'hard');
      return pushed ? 'How did that feel?' : 'Could you have held a conversation?';
    }
    if (kind === 'mobility') return 'Anything still feel tight?';
    if (kind === 'durability') return 'Anything feel off during the work?';
    if (kind === 'test') return 'How did that effort feel?';
    return 'How did that feel?';
  }

  // Post-save check-in sheet, used by every direct-save session type.
  // Simple mode: RPE + feel only (no check-in question, no journal writes).
  // Ruck: extra foot-check line, appended to the ruck entry's footNote.
  function openSessionCheckin(workout) {
    const u = user();
    if (!u || !workout || !workout.id) return;
    const perf = perfMode(u);
    const kind = kindOfWorkout(workout);
    const firstTyped = typedEntriesOf(workout)[0] || null;
    const isRuck = (workout.entries || []).some(function (en) {
      return en && en.type === 'cardio' && en.mode === 'ruck';
    });
    const sel = { rpe: null, feel: null };

    const content = document.createElement('div');
    let html = rpeFeelHTML(sel);
    if (isRuck) {
      html += '<div class="field"><label for="ck-foot">Foot check</label>' +
        '<input class="input" id="ck-foot" autocomplete="off" placeholder="Hot spots, blisters, numbness?"></div>';
    }
    if (perf) {
      html += '<div class="field"><label for="ck-answer">' +
        U.esc(checkinQuestion(kind, firstTyped)) + '</label>' +
        '<textarea class="input" id="ck-answer" rows="2" placeholder="One line — optional"></textarea></div>';
    }
    content.innerHTML = html;
    wireRpeFeel(content, sel);

    App.sheet({
      title: 'Quick check-in',
      content: content,
      actions: [
        { label: 'Skip', kind: 'ghost' },
        {
          label: 'Save',
          kind: 'primary',
          onClick: function () {
            const patch = {};
            if (sel.rpe) patch.rpe = sel.rpe;
            if (sel.feel) patch.feel = sel.feel;
            const footEl = U.$('#ck-foot', content);
            const foot = footEl ? footEl.value.trim() : '';
            const ansEl = U.$('#ck-answer', content);
            const answer = ansEl ? ansEl.value.trim() : '';
            if (answer) patch.checkin = answer;
            if (foot) {
              const live = Store.workoutById(workout.id);
              if (live) {
                patch.entries = (live.entries || []).map(function (en) {
                  if (en && en.type === 'cardio' && en.mode === 'ruck') {
                    const copy = JSON.parse(JSON.stringify(en));
                    copy.footNote = (copy.footNote ? copy.footNote + ' — ' : '') + foot;
                    return copy;
                  }
                  return en;
                });
              }
            }
            if (Object.keys(patch).length) Store.updateWorkout(workout.id, patch);
            if (perf && answer) {
              Store.addJournalEntry({
                userId: workout.userId,
                date: workout.date,
                source: 'checkin',
                entry: kind + ' ' + workout.date + ': ' + answer
              });
            }
          }
        }
      ]
    });
  }

  /* ---------- start-screen quick chips ---------- */

  function chipDefsFor(u) {
    if (perfMode(u)) {
      return [
        { id: 'run', label: 'Run' }, { id: 'ruck', label: 'Ruck' },
        { id: 'swim', label: 'Swim' }, { id: 'bike', label: 'Bike' },
        { id: 'row', label: 'Row' }, { id: 'circuit', label: 'Circuit' },
        { id: 'mobility', label: 'Stretch' }, { id: 'durability', label: 'Durability' },
        { id: 'test', label: 'Test' }
      ];
    }
    return [{ id: 'cardio', label: 'Cardio' }, { id: 'mobility', label: 'Stretch' }];
  }

  // last-used date per chip id, from this user's typed entries
  function chipLastUse(u) {
    const map = {};
    Store.workoutsFor(u.id).forEach(function (w) {
      (w.entries || []).forEach(function (en) {
        if (!en || isLiftEntry(en)) return;
        const ids = [entryKindOf(en)];
        if (en.type === 'cardio') ids.push('cardio');
        // setwork sessions refresh the chip they were started from
        if (en.type === 'setwork') ids.push(swIsStretch(en) ? 'mobility' : 'durability');
        ids.forEach(function (id) {
          if (!map[id] || map[id] < w.date) map[id] = w.date;
        });
      });
    });
    return map;
  }

  // Recency-ordered chips; chips unused 4+ weeks collapse behind 'More…'.
  function quickKindChips(u, expanded) {
    const defs = chipDefsFor(u);
    const lastUse = chipLastUse(u);
    const cutoff = U.addDays(U.todayStr(), -28);
    let recent = defs.filter(function (d) { return lastUse[d.id] && lastUse[d.id] >= cutoff; });
    recent.sort(function (a, b) {
      return lastUse[a.id] === lastUse[b.id] ? 0 : (lastUse[a.id] < lastUse[b.id] ? 1 : -1);
    });
    let rest = defs.filter(function (d) { return recent.indexOf(d) < 0; });
    if (!recent.length) { recent = rest.slice(0, 2); rest = rest.slice(2); }
    if (expanded) { recent = recent.concat(rest); rest = []; }
    return { visible: recent, hidden: rest };
  }

  function kindChipRowHTML(u, expanded) {
    const g = quickKindChips(u, expanded);
    let html = '<div class="chip-row" id="lg-kinds" style="margin-top:2px;flex-wrap:wrap">';
    html += g.visible.map(function (d) {
      return '<button type="button" class="chip" data-kind="' + U.esc(d.id) + '">' +
        kindGlyph(d.id) + ' ' + U.esc(d.label) + '</button>';
    }).join('');
    if (g.hidden.length) {
      html += '<button type="button" class="chip" id="lg-more" aria-expanded="false">More…</button>';
    }
    html += '</div>';
    return html;
  }

  function openKindLogger(id) {
    if (id === 'cardio') { openCardioLogger('run', null); return; }
    if (CARDIO_MODE_DEFS.some(function (m) { return m.id === id; })) { openCardioLogger(id, null); return; }
    if (id === 'mobility') { openMobilityLogger(null); return; }
    if (id === 'durability') {
      // P3: routine mini-sheet in performance mode; legacy checklist otherwise
      if (perfMode(user())) openDurabilitySheet();
      else openDurabilityLogger(null);
      return;
    }
    if (id === 'test') { openTestLogger(null); return; }
  }

  /* ---------- cardio logger (single screen, direct save; also edit form) ---------- */

  const CARDIO_KNOWN_KEYS = ['id', 'type', 'mode', 'distanceKm', 'durationMin', 'avgHR', 'maxHR',
    'effort', 'surface', 'tempC', 'fluidMl', 'loadKgDry', 'loadKgTotal', 'footwear', 'footNote', 'notes',
    'elevationM', 'intervals', 'rounds', 'stations']; // P3 additive fields — rebuilt by the form below

  const BIG_NUM_STYLE = 'font-size:24px;font-weight:600;text-align:center;min-height:52px';

  // P3: the user's most recent circuit entry carrying structure, for the
  // 'Repeat last circuit' prefill.
  function lastCircuitEntry(u) {
    const ws = Store.workoutsFor(u.id);
    for (let i = 0; i < ws.length; i++) {
      const en = (ws[i].entries || []).find(function (x) {
        return x && x.type === 'cardio' && x.mode === 'circuit' &&
          ((x.rounds || 0) > 0 || (x.stations || []).length > 0);
      });
      if (en) return en;
    }
    return null;
  }

  // edit = {workoutId, entryId} | null
  function openCardioLogger(initialMode, edit) {
    const u = user();
    if (!u) { App.toast('Create a profile first', 'err'); return; }

    let editW = null;
    let editEn = null;
    if (edit && edit.workoutId) {
      editW = Store.workoutById(edit.workoutId);
      editEn = editW ? (editW.entries || []).find(function (x) { return x && x.id === edit.entryId; }) : null;
      if (!editW || !editEn) { App.toast('Workout not found', 'err'); return; }
    }
    const singleEntry = !editW || (editW.entries || []).length === 1;

    const st = {
      mode: editEn ? (editEn.mode || 'run') : (initialMode || 'run'),
      effort: editEn && editEn.effort ? editEn.effort : null,
      footwear: editEn && editEn.footwear ? editEn.footwear : null,
      // P3 structure state (performance mode only; simple mode UI unchanged)
      restType: editEn && editEn.intervals && editEn.intervals.restType ? editEn.intervals.restType : null,
      rounds: editEn && editEn.rounds > 0 ? Math.round(editEn.rounds) : 0,
      stations: (editEn && Array.isArray(editEn.stations) ? editEn.stations : []).map(function (x) {
        const c = {};
        for (const k in x) c[k] = x[k];
        return c;
      }),
      intOpen: !!(editEn && editEn.intervals),
      structOpen: !!(editEn && (editEn.rounds > 0 || (editEn.stations || []).length))
    };
    const perf = perfMode(u);
    const unit = U.unitLabel(App.units());

    function modeChipsHTML() {
      return CARDIO_MODE_DEFS.map(function (m) {
        const on = st.mode === m.id;
        return '<button type="button" class="chip' + (on ? ' active' : '') + '" data-cmode="' + m.id +
          '" aria-pressed="' + (on ? 'true' : 'false') + '">' + kindGlyph(m.id) + ' ' + m.label + '</button>';
      }).join('');
    }

    function effortChipsHTML() {
      return ['easy', 'moderate', 'hard'].map(function (id) {
        const on = st.effort === id;
        return '<button type="button" class="chip' + (on ? ' active' : '') + '" data-ceffort="' + id +
          '" aria-pressed="' + (on ? 'true' : 'false') + '">' + capStr(id) + '</button>';
      }).join('');
    }

    function restChipsHTML() {
      return ['jog', 'stand'].map(function (id) {
        const on = st.restType === id;
        return '<button type="button" class="chip' + (on ? ' active' : '') + '" data-crest="' + id +
          '" aria-pressed="' + (on ? 'true' : 'false') + '">' + capStr(id) + '</button>';
      }).join('');
    }

    // P3 additive sections — performance mode only; the simple-mode sheet is
    // byte-identical. All fields optional.
    const ivPre = (editEn && editEn.intervals) || {};
    const lastCircuit = perf && !editEn ? lastCircuitEntry(u) : null;
    const p3Html = !perf ? '' :
      '<div class="field" id="cl-elev-wrap" hidden><label for="cl-elev">Elevation gain (m)</label>' +
      '<input class="input" id="cl-elev" type="text" inputmode="numeric" autocomplete="off" value="' +
      (editEn && editEn.elevationM > 0 ? U.esc(String(editEn.elevationM)) : '') + '"></div>' +
      '<div class="cl-collapse" id="cl-int" hidden>' +
      '<button type="button" class="btn ghost small" id="cl-int-toggle" aria-expanded="' +
      (st.intOpen ? 'true' : 'false') + '">' + ic().plus + ' Intervals — optional</button>' +
      '<div class="cl-collapse-body" id="cl-int-body"' + (st.intOpen ? '' : ' hidden') + '>' +
      '<div class="field-row">' +
      '<div class="field"><label for="cl-int-reps">Reps</label>' +
      '<input class="input" id="cl-int-reps" type="text" inputmode="numeric" autocomplete="off" value="' +
      (ivPre.reps > 0 ? ivPre.reps : '') + '"></div>' +
      '<div class="field"><label for="cl-int-dist">Distance (m)</label>' +
      '<input class="input" id="cl-int-dist" type="text" inputmode="numeric" autocomplete="off" value="' +
      (ivPre.distanceM > 0 ? ivPre.distanceM : '') + '"></div></div>' +
      '<div class="field-row">' +
      '<div class="field"><label for="cl-int-work">Work (mm:ss)</label>' +
      '<input class="input" id="cl-int-work" type="text" inputmode="numeric" autocomplete="off" value="' +
      (ivPre.workSec > 0 ? U.esc(fmtSec(ivPre.workSec)) : '') + '"></div>' +
      '<div class="field"><label for="cl-int-rest">Rest (sec)</label>' +
      '<input class="input" id="cl-int-rest" type="text" inputmode="numeric" autocomplete="off" value="' +
      (ivPre.restSec > 0 ? ivPre.restSec : '') + '"></div></div>' +
      '<div class="field"><label>Rest type</label>' +
      '<div class="chip-row" data-slot="crest">' + restChipsHTML() + '</div></div>' +
      '<p class="hint" id="cl-int-total" style="margin-top:-2px"></p>' +
      '</div></div>' +
      '<div class="cl-collapse" id="cl-struct" hidden>' +
      '<button type="button" class="btn ghost small" id="cl-struct-toggle" aria-expanded="' +
      (st.structOpen ? 'true' : 'false') + '">' + ic().plus + ' Structure — optional</button>' +
      '<div class="cl-collapse-body" id="cl-struct-body"' + (st.structOpen ? '' : ' hidden') + '>' +
      (lastCircuit
        ? '<button type="button" class="chip" id="cl-struct-repeat" style="margin-bottom:8px">' +
          ic().copy + ' Repeat last circuit</button>'
        : '') +
      // P3.5: hand rounds/stations/AMRAP to the guided round player (new
      // sessions only — the AMRAP cap exists only as guided config, the manual
      // save never reads it)
      (editEn ? '' :
        '<div style="display:flex;gap:8px;align-items:flex-end;margin-bottom:8px">' +
        '<div class="field" style="flex:1;margin-bottom:0"><label for="cl-amrap">AMRAP cap (min) — optional</label>' +
        '<input class="input" id="cl-amrap" type="text" inputmode="numeric" autocomplete="off" placeholder="—"></div>' +
        '<button type="button" class="btn primary" id="cl-guided" style="flex:none;min-height:44px">▶ Start guided</button>' +
        '</div>') +
      '<div class="field"><label>Rounds</label><div class="sw-stepper">' +
      '<button type="button" class="btn icon ghost" data-cr="-1" aria-label="Fewer rounds">−</button>' +
      '<span class="val" id="cl-rounds">' + (st.rounds || 0) + '</span>' +
      '<button type="button" class="btn icon ghost" data-cr="1" aria-label="More rounds">+</button>' +
      '</div></div>' +
      '<div class="field"><label>Stations</label><div id="cl-stations"></div>' +
      '<div style="display:flex;gap:8px;margin-top:6px">' +
      '<button type="button" class="btn ghost small" id="cl-st-add">' + ic().plus + ' Add station</button>' +
      '<button type="button" class="btn ghost small" id="cl-st-lib">' + ic().search + ' From library</button>' +
      '</div></div></div></div>';

    const content = document.createElement('div');
    content.innerHTML =
      '<div class="chip-row" data-slot="cmodes" style="margin-bottom:12px">' + modeChipsHTML() + '</div>' +
      (singleEntry
        ? '<div class="field"><label for="cl-date">Date</label>' +
          '<input class="input" id="cl-date" type="date" value="' +
          U.esc(editW ? editW.date : U.todayStr()) + '"></div>'
        : '') +
      '<div class="field-row">' +
      '<div class="field"><label for="cl-dist">Distance (<span id="cl-du">' + distUnit() + '</span>)</label>' +
      '<input class="input" id="cl-dist" type="text" inputmode="decimal" autocomplete="off" ' +
      'style="' + BIG_NUM_STYLE + '" value="' +
      (editEn && editEn.distanceKm ? U.esc(String(Math.round(kmToDist(editEn.distanceKm) * 100) / 100)) : '') + '"></div>' +
      '<div class="field"><label for="cl-dur">Duration (min)</label>' +
      '<input class="input" id="cl-dur" type="text" inputmode="decimal" autocomplete="off" ' +
      'style="' + BIG_NUM_STYLE + '" value="' +
      (editEn && editEn.durationMin ? U.esc(String(editEn.durationMin)) : '') + '"></div></div>' +
      '<p class="muted" id="cl-pace" style="font-size:13px;min-height:18px;margin:-4px 2px 10px;font-variant-numeric:tabular-nums"></p>' +
      '<div id="cl-ruck" hidden>' +
      '<div class="field-row">' +
      '<div class="field"><label for="cl-dry">Dry load (' + U.esc(unit) + ')</label>' +
      '<input class="input" id="cl-dry" type="text" inputmode="decimal" autocomplete="off" value="' +
      (editEn && editEn.loadKgDry ? U.esc(dispW(editEn.loadKgDry)) : '') + '"></div>' +
      '<div class="field"><label for="cl-total">Total load (' + U.esc(unit) + ')</label>' +
      '<input class="input" id="cl-total" type="text" inputmode="decimal" autocomplete="off" value="' +
      (editEn && editEn.loadKgTotal ? U.esc(dispW(editEn.loadKgTotal)) : '') + '"></div></div>' +
      '<div class="field"><label>Footwear</label><div class="segmented block" data-slot="footwear">' +
      ['boots', 'trainers'].map(function (id) {
        const on = st.footwear === id;
        return '<button type="button" class="seg' + (on ? ' active' : '') + '" data-cfoot="' + id +
          '" aria-pressed="' + (on ? 'true' : 'false') + '">' + capStr(id) + '</button>';
      }).join('') + '</div></div></div>' +
      '<div class="field-row">' +
      '<div class="field"><label for="cl-hr">Avg HR</label>' +
      '<input class="input" id="cl-hr" type="text" inputmode="numeric" autocomplete="off" placeholder="bpm" value="' +
      (editEn && editEn.avgHR ? U.esc(String(editEn.avgHR)) : '') + '"></div>' +
      '<div class="field"><label for="cl-maxhr">Max HR</label>' +
      '<input class="input" id="cl-maxhr" type="text" inputmode="numeric" autocomplete="off" placeholder="bpm" value="' +
      (editEn && editEn.maxHR ? U.esc(String(editEn.maxHR)) : '') + '"></div></div>' +
      '<div class="field" id="cl-effort-wrap"><label>Effort</label>' +
      '<div class="chip-row" data-slot="ceffort">' + effortChipsHTML() + '</div>' +
      '<p class="hint">Rough gauge for sessions without a heart-rate monitor.</p></div>' +
      '<div class="field"><label for="cl-surface">Surface</label>' +
      '<select class="select" id="cl-surface">' +
      '<option value="">—</option>' +
      ['road', 'trail', 'track', 'treadmill', 'sand'].map(function (s) {
        return '<option value="' + s + '"' + (editEn && editEn.surface === s ? ' selected' : '') + '>' +
          capStr(s) + '</option>';
      }).join('') + '</select></div>' +
      p3Html +
      '<div id="cl-long" hidden><div class="field-row">' +
      '<div class="field"><label for="cl-temp">Temp (°C)</label>' +
      '<input class="input" id="cl-temp" type="text" inputmode="decimal" autocomplete="off" value="' +
      (editEn && typeof editEn.tempC === 'number' ? U.esc(String(editEn.tempC)) : '') + '"></div>' +
      '<div class="field"><label for="cl-fluid">Fluid (ml)</label>' +
      '<input class="input" id="cl-fluid" type="text" inputmode="numeric" autocomplete="off" value="' +
      (editEn && editEn.fluidMl ? U.esc(String(editEn.fluidMl)) : '') + '"></div></div>' +
      '<p class="hint" style="margin-top:-4px">Long session — log heat and fluids so trends mean something.</p></div>' +
      '<div class="field"><label for="cl-notes">Notes</label>' +
      '<textarea class="input" id="cl-notes" rows="2" placeholder="Optional">' +
      U.esc((editEn && editEn.notes) || '') + '</textarea></div>' +
      '<div id="cl-guard"></div>';

    function $id(sel) { return U.$(sel, content); }

    function readDur() {
      const v = parseFloat($id('#cl-dur').value);
      return isNaN(v) || v <= 0 ? 0 : v;
    }

    // P3: interval block -> entry.intervals. Unknown sub-keys from the edited
    // entry ride along untouched; reps is the gate for emitting anything.
    const IV_KNOWN = ['reps', 'distanceM', 'workSec', 'restSec', 'restType'];

    function readIntervals() {
      const repsEl = $id('#cl-int-reps');
      if (!repsEl) return null;
      const reps = parseInt(repsEl.value, 10);
      if (isNaN(reps) || reps <= 0) return null;
      const o = {};
      if (editEn && editEn.intervals && typeof editEn.intervals === 'object') {
        for (const k in editEn.intervals) {
          if (IV_KNOWN.indexOf(k) < 0) o[k] = editEn.intervals[k];
        }
      }
      o.reps = reps;
      const dm = parseFloat($id('#cl-int-dist').value);
      if (!isNaN(dm) && dm > 0) o.distanceM = dm;
      const wk = parseTimeToSec($id('#cl-int-work').value, 'sec');
      if (wk !== null && wk > 0) o.workSec = Math.round(wk);
      const rs = parseInt($id('#cl-int-rest').value, 10);
      if (!isNaN(rs) && rs > 0) o.restSec = rs;
      if (st.restType) o.restType = st.restType;
      return o;
    }

    // Stations keep every key they arrived with; the form only rewrites
    // name/exerciseId/reps. Stations never feed volume or muscle analytics.
    function cleanStation(x) {
      const c = {};
      for (const k in x) c[k] = x[k];
      if (!((parseInt(c.reps, 10) || 0) > 0)) delete c.reps;
      else c.reps = parseInt(c.reps, 10);
      if (typeof c.name === 'string') c.name = c.name.trim();
      if (!c.name) delete c.name;
      if (!c.exerciseId) delete c.exerciseId;
      return c.exerciseId || c.name ? c : null;
    }

    function paintStations() {
      const box = $id('#cl-stations');
      if (!box) return;
      if (!st.stations.length) {
        box.innerHTML = '<p class="muted" style="font-size:13px;padding:2px 0">No stations yet — free text or pick from the library.</p>';
        return;
      }
      box.innerHTML = st.stations.map(function (x, i) {
        const nameVal = x.exerciseId ? exName(x.exerciseId) : (x.name || '');
        return '<div class="cl-station-row">' +
          '<input class="input" data-stname="' + i + '" placeholder="Station" autocomplete="off" ' +
          'style="flex:2;min-width:0" value="' + U.esc(nameVal) + '">' +
          '<input class="input" data-streps="' + i + '" type="text" inputmode="numeric" placeholder="Reps" ' +
          'autocomplete="off" style="width:64px;text-align:center;flex:none" value="' +
          ((x.reps || 0) > 0 ? x.reps : '') + '">' +
          '<button type="button" class="btn icon ghost" data-strm="' + i + '" aria-label="Remove station">' +
          ic().close + '</button></div>';
      }).join('');
    }

    function readDate() {
      const el = $id('#cl-date');
      const v = el ? el.value : '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
      return editW ? editW.date : U.todayStr();
    }

    function buildEntry() {
      const en = { type: 'cardio', mode: st.mode, durationMin: readDur() };
      if (editEn) {
        en.id = editEn.id;
        // preserve fields written by newer app versions
        for (const k in editEn) {
          if (CARDIO_KNOWN_KEYS.indexOf(k) < 0) en[k] = editEn[k];
        }
        if (editEn.footNote) en.footNote = editEn.footNote;
      } else {
        en.id = U.uid('en');
      }
      const km = distToKm($id('#cl-dist').value);
      if (km > 0) en.distanceKm = Math.round(km * 1000) / 1000;
      const hr = parseInt($id('#cl-hr').value, 10);
      if (!isNaN(hr) && hr > 0) en.avgHR = hr;
      const mhr = parseInt($id('#cl-maxhr').value, 10);
      if (!isNaN(mhr) && mhr > 0) en.maxHR = mhr;
      if (!en.avgHR && st.effort) en.effort = st.effort;
      const surf = $id('#cl-surface').value;
      if (surf) en.surface = surf;
      if (en.durationMin >= 90) {
        const t = parseFloat($id('#cl-temp').value);
        if (!isNaN(t)) en.tempC = t;
        const f = parseInt($id('#cl-fluid').value, 10);
        if (!isNaN(f) && f > 0) en.fluidMl = f;
      }
      if (st.mode === 'ruck') {
        const dry = U.displayToKg($id('#cl-dry').value, App.units());
        if (dry > 0) en.loadKgDry = Math.round(dry * 100) / 100;
        const tot = U.displayToKg($id('#cl-total').value, App.units());
        if (tot > 0) en.loadKgTotal = Math.round(tot * 100) / 100;
        if (st.footwear) en.footwear = st.footwear;
      }
      // P3 structure fields — written by the performance-mode form; the
      // simple-mode form never shows them, so it carries them through verbatim.
      if (perf) {
        if (['run', 'ruck', 'stairs'].indexOf(st.mode) >= 0) {
          const ev = parseFloat($id('#cl-elev').value);
          if (!isNaN(ev) && ev > 0) en.elevationM = Math.round(ev);
        }
        if (['run', 'swim'].indexOf(st.mode) >= 0) {
          const iv = readIntervals();
          if (iv) en.intervals = iv;
        }
        if (st.mode === 'circuit') {
          if (st.rounds > 0) en.rounds = st.rounds;
          const sts = st.stations.map(cleanStation).filter(Boolean);
          if (sts.length) en.stations = sts;
        }
      } else if (editEn) {
        ['elevationM', 'intervals', 'rounds', 'stations'].forEach(function (k) {
          if (k in editEn) en[k] = editEn[k];
        });
      }
      const notes = $id('#cl-notes').value.trim();
      if (notes) en.notes = notes;
      return en;
    }

    let lastWarns = [];
    let cardioSheet = null; // assigned below; the guided handoff closes it

    function sync() {
      // P3: section visibility + the interval TOTAL written into distance so
      // weekly mileage guardrails stay truthful on every client.
      if (perf) {
        $id('#cl-elev-wrap').hidden = ['run', 'ruck', 'stairs'].indexOf(st.mode) < 0;
        $id('#cl-int').hidden = ['run', 'swim'].indexOf(st.mode) < 0;
        $id('#cl-struct').hidden = st.mode !== 'circuit';
        const iv = ['run', 'swim'].indexOf(st.mode) >= 0 ? readIntervals() : null;
        const totEl = $id('#cl-int-total');
        if (totEl) {
          if (iv && (iv.distanceM || 0) > 0) {
            const totKm = iv.reps * iv.distanceM / 1000;
            $id('#cl-dist').value = String(Math.round(kmToDist(totKm) * 100) / 100);
            totEl.textContent = 'Interval total ' + fmtKm(totKm) + ' — written to distance.';
          } else {
            totEl.textContent = '';
          }
        }
      }
      const dur = readDur();
      const km = distToKm($id('#cl-dist').value);
      $id('#cl-pace').textContent = km > 0 && dur > 0
        ? 'Pace ' + paceStr(dur, km) + ' · ' + fmtKm(km) + ' in ' + U.fmtDuration(dur)
        : '';
      $id('#cl-ruck').hidden = st.mode !== 'ruck';
      $id('#cl-long').hidden = dur < 90;
      const hasHR = parseInt($id('#cl-hr').value, 10) > 0;
      $id('#cl-effort-wrap').style.display = hasHR ? 'none' : '';
      if (!editEn) {
        lastWarns = guardrailsFor({ date: readDate(), entries: [buildEntry()] }, u);
        $id('#cl-guard').innerHTML = guardHTML(lastWarns);
      }
    }

    U.on(content, 'click', '[data-cmode]', function (e, chip) {
      st.mode = chip.getAttribute('data-cmode');
      U.$('[data-slot="cmodes"]', content).innerHTML = modeChipsHTML();
      sync();
    });
    U.on(content, 'click', '[data-ceffort]', function (e, chip) {
      const v = chip.getAttribute('data-ceffort');
      st.effort = st.effort === v ? null : v;
      U.$('[data-slot="ceffort"]', content).innerHTML = effortChipsHTML();
      sync();
    });
    U.on(content, 'click', '[data-cfoot]', function (e, btn) {
      const v = btn.getAttribute('data-cfoot');
      st.footwear = st.footwear === v ? null : v;
      U.$$('[data-cfoot]', content).forEach(function (b) {
        const on = b.getAttribute('data-cfoot') === st.footwear;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    });
    if (perf) {
      function wireToggle(btnSel, bodySel) {
        const btn = $id(btnSel);
        if (!btn) return;
        btn.addEventListener('click', function () {
          const body = $id(bodySel);
          body.hidden = !body.hidden;
          btn.setAttribute('aria-expanded', body.hidden ? 'false' : 'true');
        });
      }
      wireToggle('#cl-int-toggle', '#cl-int-body');
      wireToggle('#cl-struct-toggle', '#cl-struct-body');
      U.on(content, 'click', '[data-crest]', function (e, chip) {
        const v = chip.getAttribute('data-crest');
        st.restType = st.restType === v ? null : v;
        U.$('[data-slot="crest"]', content).innerHTML = restChipsHTML();
        sync();
      });
      U.on(content, 'click', '[data-cr]', function (e, b) {
        st.rounds = U.clamp((st.rounds || 0) + parseInt(b.getAttribute('data-cr'), 10), 0, 99);
        const rEl = $id('#cl-rounds');
        if (rEl) rEl.textContent = String(st.rounds);
      });
      U.on(content, 'input', 'input[data-stname]', function (e, inp) {
        const i = parseInt(inp.getAttribute('data-stname'), 10);
        if (!st.stations[i]) return;
        st.stations[i].name = inp.value;
        delete st.stations[i].exerciseId; // typed over — now free text
      });
      U.on(content, 'input', 'input[data-streps]', function (e, inp) {
        const i = parseInt(inp.getAttribute('data-streps'), 10);
        if (!st.stations[i]) return;
        const n = parseInt(inp.value, 10);
        st.stations[i].reps = isNaN(n) || n < 0 ? 0 : n;
      });
      U.on(content, 'click', 'button[data-strm]', function (e, b) {
        st.stations.splice(parseInt(b.getAttribute('data-strm'), 10), 1);
        paintStations();
      });
      const stAdd = $id('#cl-st-add');
      if (stAdd) {
        stAdd.addEventListener('click', function () {
          st.stations.push({ name: '' });
          paintStations();
          const inputs = U.$$('input[data-stname]', content);
          if (inputs.length) inputs[inputs.length - 1].focus();
        });
      }
      const stLib = $id('#cl-st-lib');
      if (stLib) {
        stLib.addEventListener('click', function () {
          openExercisePicker({
            title: 'Add stations',
            multi: true,
            onPick: function (ids) {
              ids.forEach(function (id) { st.stations.push({ exerciseId: id }); });
              paintStations();
            }
          });
        });
      }
      const guidedBtn = $id('#cl-guided');
      if (guidedBtn) {
        guidedBtn.addEventListener('click', function () {
          const stations = st.stations.map(cleanStation).filter(Boolean);
          if (!stations.length) { App.toast('Add at least one station first', 'err'); return; }
          const routine = {
            name: 'Circuit',
            kind: 'circuit',
            restSec: 0,
            items: stations.map(function (x) {
              const it = {};
              if (x.exerciseId) it.exerciseId = x.exerciseId;
              if (x.name) it.name = x.name;
              if ((x.reps || 0) > 0) it.targetReps = x.reps;
              if ((x.durationSec || 0) > 0) it.targetHoldSec = x.durationSec;
              if ((x.weightKg || 0) > 0) it.targetWeightKg = x.weightKg;
              return it;
            })
          };
          if (st.rounds > 0) routine.rounds = st.rounds;
          const amEl = $id('#cl-amrap');
          const am = amEl ? parseFloat(amEl.value) : NaN;
          if (!isNaN(am) && am > 0) routine.amrapSec = Math.round(am * 60);
          // P4.5: circuits are a LIVE SESSION that OPENS IN FOCUS (the round
          // player). Seeding goes through Player.start, which owns the circuit
          // projection over the draft — building a second one here would give
          // the session both a cardio circuit entry and a set of per-station
          // entries, i.e. double-logged stations.
          const P = playerApi();
          if (!P) { App.toast('Update the app to run live sessions', 'err'); return; }
          if (P.start(routine, { name: 'Circuit', view: 'focus' }) && cardioSheet) cardioSheet.close();
        });
      }
      const repBtn = $id('#cl-struct-repeat');
      if (repBtn) {
        repBtn.addEventListener('click', function () {
          st.rounds = lastCircuit.rounds > 0 ? Math.round(lastCircuit.rounds) : 0;
          st.stations = (lastCircuit.stations || []).map(function (x) {
            const c = {};
            for (const k in x) c[k] = x[k];
            return c;
          });
          const rEl = $id('#cl-rounds');
          if (rEl) rEl.textContent = String(st.rounds);
          if (lastCircuit.durationMin && !$id('#cl-dur').value) {
            $id('#cl-dur').value = String(lastCircuit.durationMin);
          }
          paintStations();
          sync();
        });
      }
      paintStations();
    }
    U.on(content, 'input', 'input, select, textarea', function () { sync(); });
    sync();

    cardioSheet = App.sheet({
      title: editEn ? 'Edit session' : 'Log cardio',
      content: content,
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        {
          label: editEn ? 'Save changes' : 'Save session',
          kind: 'primary',
          keepOpen: true,
          onClick: function (api) {
            const dur = readDur();
            if (!dur) { App.toast('Enter a duration', 'err'); focusInput('cl-dur'); return; }
            const en = buildEntry();
            const dateStr = readDate();

            if (editEn) {
              const live = Store.workoutById(editW.id);
              if (!live) { api.close(); return; }
              const entries = (live.entries || []).map(function (x) {
                return x && x.id === editEn.id ? en : x;
              });
              const patch = { entries: entries };
              if (singleEntry) {
                patch.date = dateStr;
                patch.durationMin = Math.max(1, Math.round(dur));
              }
              Store.updateWorkout(editW.id, patch);
              api.close();
              App.toast('Workout updated', 'ok');
              return;
            }

            const warns = lastWarns;
            confirmStops(warns).then(function (ok) {
              if (!ok) return;
              const w = Store.addWorkout({
                userId: u.id,
                date: dateStr,
                name: KIND_LABELS[st.mode] || 'Cardio',
                durationMin: Math.max(1, Math.round(dur)),
                entries: [en]
              });
              api.close();
              App.toast('Session saved', 'ok');
              toastWarns(warns);
              App.navigate('history');
              openSessionCheckin(w);
            });
          }
        }
      ]
    });
    focusInput('cl-dist');
  }

  /* ---------- mobility logger ---------- */

  // P3: legacy quick-edit forms must preserve unknown keys so the NEXT schema
  // evolution isn't trapped by rebuilt entries (CARDIO_KNOWN_KEYS pattern).
  const MOBILITY_KNOWN_KEYS = ['id', 'type', 'modality', 'durationMin', 'targetMuscles', 'notes'];
  const DURABILITY_KNOWN_KEYS = ['id', 'type', 'items', 'durationMin', 'notes'];
  const TEST_KNOWN_KEYS = ['id', 'type', 'protocol', 'results', 'score', 'notes'];

  function openMobilityLogger(edit) {
    const u = user();
    if (!u) { App.toast('Create a profile first', 'err'); return; }

    let editW = null;
    let editEn = null;
    if (edit && edit.workoutId) {
      editW = Store.workoutById(edit.workoutId);
      editEn = editW ? (editW.entries || []).find(function (x) { return x && x.id === edit.entryId; }) : null;
      if (!editW || !editEn) { App.toast('Workout not found', 'err'); return; }
    }
    const singleEntry = !editW || (editW.entries || []).length === 1;

    const st = { modality: editEn ? (editEn.modality || 'static') : 'static' };
    const selected = {};
    ((editEn && editEn.targetMuscles) || []).forEach(function (m) { selected[m] = true; });

    // P3: 'Same as last time' prefill chip (renders only when a prior stretch
    // session exists — the one family-visible change in simple mode) and the
    // performance-only structured-stretch entry point.
    const perf = perfMode(u);
    const lastSession = editEn ? null : lastStretchSession(u, perf);
    // P4.5: live-session entry point (perf only) — seeds the draft from a
    // stretch routine / the last structured session and opens the builder.
    const guidedAvailable = perf && !editEn;
    const quickRowHTML = editEn ? '' :
      ((lastSession || perf)
        ? '<div class="chip-row" style="margin-bottom:12px">' +
          (guidedAvailable
            ? '<button type="button" class="chip" id="mb-guided">▶ Start stretch session</button>'
            : '') +
          (lastSession
            ? '<button type="button" class="chip" id="mb-same">' + ic().copy + ' Same as last time</button>'
            : '') +
          (perf
            ? '<button type="button" class="chip" id="mb-individual">' + ic().plus + ' Log individual stretches</button>'
            : '') +
          '</div>'
        : '');

    const content = document.createElement('div');
    content.innerHTML =
      quickRowHTML +
      (singleEntry
        ? '<div class="field"><label for="mb-date">Date</label>' +
          '<input class="input" id="mb-date" type="date" value="' +
          U.esc(editW ? editW.date : U.todayStr()) + '"></div>'
        : '') +
      '<div class="field"><label for="mb-dur">Duration (min)</label>' +
      '<input class="input" id="mb-dur" type="text" inputmode="decimal" autocomplete="off" ' +
      'style="' + BIG_NUM_STYLE + '" value="' +
      (editEn && editEn.durationMin ? U.esc(String(editEn.durationMin)) : '') + '"></div>' +
      '<div class="field"><label>Modality</label><div class="segmented block">' +
      MODALITY_DEFS.map(function (m) {
        const on = st.modality === m.id;
        return '<button type="button" class="seg' + (on ? ' active' : '') + '" data-modality="' + m.id +
          '" aria-pressed="' + (on ? 'true' : 'false') + '">' + m.label + '</button>';
      }).join('') + '</div></div>' +
      '<div class="field"><label>Target areas — tap the body</label>' +
      '<div id="mb-map"></div>' +
      '<p class="hint" id="mb-selected"></p></div>' +
      '<div class="field"><label for="mb-notes">Notes</label>' +
      '<textarea class="input" id="mb-notes" rows="2" placeholder="Optional">' +
      U.esc((editEn && editEn.notes) || '') + '</textarea></div>';

    function selectedLabel() {
      const ids = Object.keys(selected);
      return ids.length
        ? ids.map(muscleLabelOf).join(', ')
        : 'Nothing selected yet — whole-body session is fine too.';
    }

    function paintMap() {
      const el = U.$('#mb-map', content);
      const values = {};
      Object.keys(selected).forEach(function (m) { values[m] = 1; });
      const MM = window.MuscleMap;
      if (MM && typeof MM.render === 'function') {
        MM.render(el, {
          values: values,
          onSelect: function (m) {
            if (selected[m]) delete selected[m];
            else selected[m] = true;
            paintMap();
          }
        });
      } else {
        // fallback when the muscle map module is unavailable
        const muscles = (window.ExerciseDB && ExerciseDB.MUSCLES) || [];
        el.innerHTML = '<div class="chip-row" style="flex-wrap:wrap">' +
          muscles.map(function (m) {
            const on = !!selected[m.id];
            return '<button type="button" class="chip' + (on ? ' active' : '') + '" data-mtarget="' +
              U.esc(m.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + U.esc(m.short) + '</button>';
          }).join('') + '</div>';
      }
      U.$('#mb-selected', content).textContent = selectedLabel();
    }

    U.on(content, 'click', '[data-mtarget]', function (e, chip) {
      const m = chip.getAttribute('data-mtarget');
      if (selected[m]) delete selected[m];
      else selected[m] = true;
      paintMap();
    });
    U.on(content, 'click', '[data-modality]', function (e, btn) {
      st.modality = btn.getAttribute('data-modality');
      U.$$('[data-modality]', content).forEach(function (b) {
        const on = b.getAttribute('data-modality') === st.modality;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    });
    paintMap();

    let sheetApi = null;
    const sameBtn = U.$('#mb-same', content);
    if (sameBtn) {
      sameBtn.addEventListener('click', function () {
        if (lastSession.kind === 'structured') {
          // last stretch session was structured — repeat THAT, values prefilled
          if (sheetApi) sheetApi.close();
          openStretchBuilder({ from: { entries: lastSession.entries } });
          return;
        }
        const en = lastSession.en;
        const durEl = U.$('#mb-dur', content);
        if (durEl && en.durationMin) durEl.value = String(en.durationMin);
        st.modality = en.modality || 'static';
        U.$$('[data-modality]', content).forEach(function (b) {
          const on = b.getAttribute('data-modality') === st.modality;
          b.classList.toggle('active', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        Object.keys(selected).forEach(function (k) { delete selected[k]; });
        (en.targetMuscles || []).forEach(function (m) { selected[m] = true; });
        paintMap();
      });
    }
    const indivBtn = U.$('#mb-individual', content);
    if (indivBtn) {
      indivBtn.addEventListener('click', function () {
        if (sheetApi) sheetApi.close();
        openStretchBuilder(null);
      });
    }
    const guidedBtn = U.$('#mb-guided', content);
    if (guidedBtn) {
      guidedBtn.addEventListener('click', function () {
        if (sheetApi) sheetApi.close();
        seedStretchSession(u);
      });
    }

    sheetApi = App.sheet({
      title: editEn ? 'Edit mobility' : 'Log mobility',
      content: content,
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        {
          label: editEn ? 'Save changes' : 'Save session',
          kind: 'primary',
          keepOpen: true,
          onClick: function (api) {
            const dur = parseFloat(U.$('#mb-dur', content).value);
            if (isNaN(dur) || dur <= 0) { App.toast('Enter a duration', 'err'); focusInput('mb-dur'); return; }
            const dateEl = U.$('#mb-date', content);
            const dateStr = dateEl && /^\d{4}-\d{2}-\d{2}$/.test(dateEl.value)
              ? dateEl.value
              : (editW ? editW.date : U.todayStr());
            const en = {
              id: editEn ? editEn.id : U.uid('en'),
              type: 'mobility',
              modality: st.modality,
              durationMin: dur,
              targetMuscles: Object.keys(selected)
            };
            const notes = U.$('#mb-notes', content).value.trim();
            if (notes) en.notes = notes;
            // P3: preserve fields written by newer app versions (CARDIO_KNOWN_KEYS pattern)
            if (editEn) {
              for (const k in editEn) {
                if (MOBILITY_KNOWN_KEYS.indexOf(k) < 0) en[k] = editEn[k];
              }
            }

            if (editEn) {
              const live = Store.workoutById(editW.id);
              if (!live) { api.close(); return; }
              const entries = (live.entries || []).map(function (x) {
                return x && x.id === editEn.id ? en : x;
              });
              const patch = { entries: entries };
              if (singleEntry) {
                patch.date = dateStr;
                patch.durationMin = Math.max(1, Math.round(dur));
              }
              Store.updateWorkout(editW.id, patch);
              api.close();
              App.toast('Workout updated', 'ok');
              return;
            }

            const w = Store.addWorkout({
              userId: u.id,
              date: dateStr,
              name: 'Mobility',
              durationMin: Math.max(1, Math.round(dur)),
              entries: [en]
            });
            api.close();
            App.toast('Session saved', 'ok');
            App.navigate('history');
            openSessionCheckin(w);
          }
        }
      ]
    });
    focusInput('mb-dur');
  }

  /* ---------- durability logger ---------- */

  function durabilityChecklist() {
    const db = window.ExerciseDB;
    const list = db && Array.isArray(db.DURABILITY_CHECKLIST) ? db.DURABILITY_CHECKLIST : [];
    const items = list.filter(function (it) { return it && it.id && exOf(it.id); });
    if (items.length) return items;
    // fallback: anything categorized 'durability' in the library
    const all = db && typeof db.all === 'function' ? db.all() : [];
    return all.filter(function (x) { return x && x.category === 'durability'; })
      .map(function (x) { return { id: x.id, slot: 'other' }; });
  }

  function openDurabilityLogger(edit) {
    const u = user();
    if (!u) { App.toast('Create a profile first', 'err'); return; }

    let editW = null;
    let editEn = null;
    if (edit && edit.workoutId) {
      editW = Store.workoutById(edit.workoutId);
      editEn = editW ? (editW.entries || []).find(function (x) { return x && x.id === edit.entryId; }) : null;
      if (!editW || !editEn) { App.toast('Workout not found', 'err'); return; }
    }
    const singleEntry = !editW || (editW.entries || []).length === 1;

    const picked = {};
    ((editEn && editEn.items) || []).forEach(function (id) { picked[id] = true; });
    const checklist = durabilityChecklist();

    function rowsHTML() {
      if (!checklist.length) {
        return '<p class="muted" style="font-size:13px;padding:6px 2px">Durability checklist unavailable — update the app to get the built-in drill list.</p>';
      }
      // Items on the entry but not on the checklist (older logs, future
      // checklist revisions) must render and survive a save, not vanish.
      const extras = ((editEn && editEn.items) || [])
        .filter(function (id) { return !checklist.some(function (it) { return it.id === id; }); })
        .map(function (id) { return { id: id, slot: 'other' }; });
      const bySlot = U.groupBy(checklist.concat(extras), function (it) { return it.slot || 'other'; });
      let html = '';
      Object.keys(SLOT_LABELS).forEach(function (slot) {
        const items = bySlot[slot];
        if (!items || !items.length) return;
        html += sectionLabel(SLOT_LABELS[slot]) + '<div class="list">' +
          items.map(function (it) {
            const on = !!picked[it.id];
            return '<button type="button" class="list-row" data-ditem="' + U.esc(it.id) +
              '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
              '<div class="body"><div class="title">' + U.esc(exName(it.id)) + '</div></div>' +
              (on ? '<span class="trailing" style="color:var(--accent)">' + ic().check + '</span>' : '') +
              '</button>';
          }).join('') + '</div>';
      });
      return html;
    }

    const content = document.createElement('div');
    content.innerHTML =
      (singleEntry
        ? '<div class="field"><label for="db-date">Date</label>' +
          '<input class="input" id="db-date" type="date" value="' +
          U.esc(editW ? editW.date : U.todayStr()) + '"></div>'
        : '') +
      '<div class="field"><label for="db-dur">Duration (min) — optional</label>' +
      '<input class="input" id="db-dur" type="text" inputmode="decimal" autocomplete="off" value="' +
      (editEn && editEn.durationMin ? U.esc(String(editEn.durationMin)) : '') + '"></div>' +
      '<div id="db-rows">' + rowsHTML() + '</div>' +
      '<div class="field" style="margin-top:10px"><label for="db-notes">Notes</label>' +
      '<textarea class="input" id="db-notes" rows="2" placeholder="Optional">' +
      U.esc((editEn && editEn.notes) || '') + '</textarea></div>';

    U.on(content, 'click', '[data-ditem]', function (e, row) {
      const id = row.getAttribute('data-ditem');
      if (picked[id]) delete picked[id];
      else picked[id] = true;
      U.$('#db-rows', content).innerHTML = rowsHTML();
    });

    App.sheet({
      title: editEn ? 'Edit durability' : 'Log durability',
      content: content,
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        {
          label: editEn ? 'Save changes' : 'Save session',
          kind: 'primary',
          keepOpen: true,
          onClick: function (api) {
            const knownIds = checklist.map(function (it) { return it.id; });
            const extraIds = ((editEn && editEn.items) || [])
              .filter(function (id) { return knownIds.indexOf(id) === -1; });
            const items = knownIds.concat(extraIds)
              .filter(function (id) { return picked[id]; });
            if (!items.length) { App.toast('Tick at least one drill', 'err'); return; }
            const dateEl = U.$('#db-date', content);
            const dateStr = dateEl && /^\d{4}-\d{2}-\d{2}$/.test(dateEl.value)
              ? dateEl.value
              : (editW ? editW.date : U.todayStr());
            const dur = parseFloat(U.$('#db-dur', content).value);
            const en = { id: editEn ? editEn.id : U.uid('en'), type: 'durability', items: items };
            if (!isNaN(dur) && dur > 0) en.durationMin = dur;
            const notes = U.$('#db-notes', content).value.trim();
            if (notes) en.notes = notes;
            // P3: preserve fields written by newer app versions
            if (editEn) {
              for (const k in editEn) {
                if (DURABILITY_KNOWN_KEYS.indexOf(k) < 0) en[k] = editEn[k];
              }
            }

            if (editEn) {
              const live = Store.workoutById(editW.id);
              if (!live) { api.close(); return; }
              const entries = (live.entries || []).map(function (x) {
                return x && x.id === editEn.id ? en : x;
              });
              const patch = { entries: entries };
              if (singleEntry) {
                patch.date = dateStr;
                if (en.durationMin) patch.durationMin = Math.max(1, Math.round(en.durationMin));
              }
              Store.updateWorkout(editW.id, patch);
              api.close();
              App.toast('Workout updated', 'ok');
              return;
            }

            const w = Store.addWorkout({
              userId: u.id,
              date: dateStr,
              name: 'Durability',
              durationMin: en.durationMin ? Math.max(1, Math.round(en.durationMin)) : null,
              entries: [en]
            });
            api.close();
            App.toast('Session saved', 'ok');
            App.navigate('history');
            openSessionCheckin(w);
          }
        }
      ]
    });
  }

  /* ---------- P3: durability routine mini-sheet (performance mode) ----------
     Routines are code-defined (ExerciseDB.DURABILITY_ROUTINES) — never user
     templates. Seeding creates a NORMAL draft: weight_reps drills become plain
     lift entries (they keep earning volume/PRs/muscle credit); holds/carries
     become setwork entries. */

  function lastRoutineWorkout(u) {
    return Store.workoutsFor(u.id).find(function (w) {
      return /^Durability [AB]\b/.test(w.name || '');
    }) || null;
  }

  // opts.pace forces the session pace ('off' = the manual, after-the-fact path).
  function seedDurabilityDraft(letter, opts) {
    opts = opts || {};
    const db = window.ExerciseDB;
    const routines = db && db.DURABILITY_ROUTINES;
    const items = routines && routines[letter];
    if (!items || !items.length) { App.toast('Routine unavailable — update the app', 'err'); return; }
    const routine = { items: {} };
    items.forEach(function (it) {
      if (!it || !it.exerciseId) return;
      const layer = {};
      if (Number(it.restSec) > 0) layer.restSec = Math.round(it.restSec);
      if (typeof it.tempo === 'string' && it.tempo) layer.tempo = it.tempo;
      if (paceVal(it.pace)) layer.pace = paceVal(it.pace);
      routine.items[it.exerciseId] = layer;
    });
    const entries = items.map(function (it) {
      const ex = exOf(it.exerciseId);
      if (setShapeOf(ex) === 'weight_reps') {
        const en = newEntry(it.exerciseId, it.sets || 3);
        if (it.targetReps) { en._repLow = it.targetReps; en._repHigh = it.targetReps; }
        if (it.weightHint) en.notes = it.weightHint;
        return en;
      }
      // perSide setwork drills: the routine's 'sets' is a PER-SIDE count —
      // emit sets*2 rows (newSetworkEntry alternates L/R) so an odd routine
      // count can never prescribe one side more work than the other.
      const rows = (it.sets || 3) * (ex && ex.perSide ? 2 : 1);
      return newSetworkEntry(it.exerciseId, rows, {
        holdSec: it.targetHoldSec, reps: it.targetReps, distanceM: it.targetDistanceM
      });
    });
    startDraft({
      name: 'Durability ' + letter,
      entries: entries,
      kind: 'durability',
      pace: opts.pace,
      routine: routine
    });
    App.navigate('log');
    App.rerender();
  }

  // Draft entries from a saved workout, keeping setwork entries editable with
  // their values prefilled (unlike repeatableView, which strips typed entries).
  function seedRepeatDurability(w, opts) {
    opts = opts || {};
    const entries = [];
    (w.entries || []).forEach(function (en) {
      if (!en) return;
      if (isLiftEntry(en)) {
        entries.push({
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
        });
      } else if (isSetworkEntry(en)) {
        entries.push(swDraftCopyOf(en));
      }
    });
    if (!entries.length) { App.toast('Nothing repeatable in that session', 'err'); return; }
    startDraft({
      name: w.name || 'Durability',
      entries: entries,
      kind: opts.kind || 'durability',
      pace: opts.pace
    });
    App.navigate('log');
    App.rerender();
  }

  function openDurabilitySheet() {
    const u = user();
    if (!u) { App.toast('Create a profile first', 'err'); return; }
    const lastW = lastRoutineWorkout(u);
    const m = lastW ? /^Durability ([AB])\b/.exec(lastW.name || '') : null;
    const lastLetter = m ? m[1] : null;
    const next = lastLetter === 'A' ? 'B' : 'A'; // auto-alternate vs last routine letter
    const db = window.ExerciseDB;
    const items = (db && db.DURABILITY_ROUTINES && db.DURABILITY_ROUTINES[next]) || [];
    const preview = items.map(function (it) { return exName(it.exerciseId); }).join(' · ');
    const P = playerApi();
    const paceLabel = PACE_DEFS.find(function (p) {
      return p.id === paceSettingsOf(u).durability;
    }).label;

    // P4.5: the LIVE SESSION is the front door — one record (the draft), opened
    // in the builder, with the app driving whatever the resolved pace says.
    // Manual after-the-fact logging stays, demoted to the 'trained without the
    // phone' fallback, and runs with pace off.
    let html = '<button type="button" class="btn primary" data-dur="guided" ' +
      'style="width:100%;min-height:54px;font-size:16px">▶ Start Durability ' + next +
      (lastLetter ? ' <span style="font-weight:400;font-size:13px;opacity:.75">(' + lastLetter +
        ' was ' + U.esc(U.relDate(lastW.date).toLowerCase()) + ')</span>' : '') +
      '</button>' +
      '<p class="hint" style="margin:6px 2px 0">' + U.esc(preview || '5 drills') + '</p>' +
      '<p class="hint" style="margin:2px 2px 0">The app drives: ' + U.esc(paceLabel) +
      ' — tap a set number to run it, or a card\'s ⏱ to run the exercise.</p>';
    if (lastW) {
      html += '<button type="button" class="btn ghost" data-dur="repeat-guided" ' +
        'style="width:100%;min-height:48px;margin-top:10px">' + ic().copy + ' Repeat last — ' +
        U.esc(lastW.name) + '</button>';
    }
    html += sectionLabel('Trained without the phone?');
    html += '<div class="list">' +
      '<button type="button" class="list-row" data-dur="routine">' +
      '<span class="leading" style="color:var(--accent)">' + KIND_ICONS.durability + '</span>' +
      '<div class="body"><div class="title">Log Durability ' + next + ' manually</div>' +
      '<div class="sub">' + U.esc(preview || '5 drills') + '</div></div>' +
      '<span class="chevron">' + ic().chevron + '</span></button>';
    if (lastW) {
      html += '<button type="button" class="list-row" data-dur="repeat">' +
        '<span class="leading">' + ic().copy + '</span>' +
        '<div class="body"><div class="title">Repeat last, manually</div>' +
        '<div class="sub">' + U.esc(lastW.name) + ' · ' + U.esc(U.relDate(lastW.date)) + '</div></div>' +
        '<span class="chevron">' + ic().chevron + '</span></button>';
    }
    html += '<button type="button" class="list-row" data-dur="checklist">' +
      '<span class="leading">' + ic().check + '</span>' +
      '<div class="body"><div class="title">Quick checklist</div>' +
      '<div class="sub">Tick off drills without logging sets</div></div>' +
      '<span class="chevron">' + ic().chevron + '</span></button></div>';
    if (P && typeof P.editRoutine === 'function') {
      html += '<button type="button" class="btn ghost small" data-dur="new-routine" style="margin-top:10px">' +
        ic().plus + ' New routine</button>';
    }

    const content = document.createElement('div');
    content.innerHTML = html;
    let api = null;
    U.on(content, 'click', '[data-dur]', function (e, row) {
      const act = row.getAttribute('data-dur');
      if (api) api.close();
      if (act === 'guided') seedDurabilityDraft(next);
      else if (act === 'repeat-guided' && lastW) seedRepeatDurability(lastW);
      else if (act === 'new-routine' && P) {
        P.editRoutine({ kind: 'durability', restSec: DEFAULT_REST_SEC, items: [] }, { userId: u.id });
      } else if (act === 'routine') seedDurabilityDraft(next, { pace: 'off' });
      else if (act === 'repeat' && lastW) seedRepeatDurability(lastW, { pace: 'off' });
      else if (act === 'checklist') openDurabilityLogger(null); // legacy flow, unchanged shape
    });
    api = App.sheet({ title: 'Durability', content: content });
  }

  /* ---------- P3: structured stretch mini-builder (performance mode) ---------- */

  // Most recent stretch session: a legacy 'mobility' entry, or (performance
  // mode) a structured setwork stretch session — whichever is newer.
  function lastStretchSession(u, includeStructured) {
    const ws = Store.workoutsFor(u.id); // date desc, createdAt desc
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i];
      const mob = (w.entries || []).find(function (en) { return en && en.type === 'mobility'; });
      if (mob) return { kind: 'legacy', w: w, en: mob };
      if (includeStructured) {
        const sw = (w.entries || []).filter(function (en) {
          return isSetworkEntry(en) && swIsStretch(en);
        });
        if (sw.length) return { kind: 'structured', w: w, entries: sw };
      }
    }
    return null;
  }

  // Nominal minutes matching Analytics.stretchMinutesByMuscle: holdSec/60 per
  // set, 0.5 min per rep-only dynamic set.
  function stretchSessionMinutes(entries) {
    let sec = 0;
    let dyn = 0;
    entries.forEach(function (en) {
      (en.sets || []).forEach(function (s) {
        if ((s.holdSec || 0) > 0) sec += s.holdSec;
        else dyn++;
      });
    });
    return Math.max(1, Math.round(sec / 60 + dyn * 0.5));
  }

  /* P4.5 — a stretch session is a LIVE SESSION (the draft), opened in the
     builder. Seeded from the user's stretch routine when they have one, else
     from their last structured stretch session, else empty. The legacy quick
     sheet and the 'Log individual stretches' mini-builder both stay put as the
     after-the-fact paths. */
  function seedStretchSession(u) {
    const routines = stretchRoutinesFor(u);
    const r = routines.length ? routines[0] : null;
    let entries = [];
    const layer = { items: {} };
    if (r) {
      if (paceVal(r.pace)) layer.pace = paceVal(r.pace);
      if (Number(r.restSec) > 0) layer.restSec = Math.round(r.restSec);
      entries = (r.items || []).map(function (it) {
        const ex = exOf(it.exerciseId);
        const perSide = !!(ex && ex.perSide);
        const rows = U.clamp(Number(it.sets) || 2, 1, 10) * (perSide ? 2 : 1);
        const en = newSetworkEntry(it.exerciseId, rows, {
          holdSec: it.targetHoldSec, reps: it.targetReps, distanceM: it.targetDistanceM
        });
        if (it.method) en.method = it.method;
        const cell = {};
        if (Number(it.restSec) > 0) cell.restSec = Math.round(it.restSec);
        if (typeof it.tempo === 'string' && it.tempo) cell.tempo = it.tempo;
        if (paceVal(it.pace)) cell.pace = paceVal(it.pace);
        layer.items[it.exerciseId] = cell;
        return en;
      }).filter(function (en) { return !!en.exerciseRef; });
    }
    if (!entries.length) {
      const last = lastStretchSession(u, true);
      if (last && last.kind === 'structured') entries = last.entries.map(swDraftCopyOf);
    }
    startDraft({
      name: r && r.name ? r.name : 'Stretch',
      entries: entries,
      kind: 'stretch',
      routine: layer
    });
    App.navigate('log');
    App.rerender();
    if (!entries.length) App.toast('Add the stretches you are doing — the app times each hold', 'info');
  }

  // opts.from = a prior structured session ({entries}) to prefill for repeat.
  function openStretchBuilder(opts) {
    const u = user();
    if (!u) { App.toast('Create a profile first', 'err'); return; }
    opts = opts || {};
    const model = { entries: [] };
    if (opts.from && Array.isArray(opts.from.entries)) {
      model.entries = opts.from.entries.map(swDraftCopyOf);
    }

    const content = document.createElement('div');
    content.innerHTML =
      '<div class="field"><label for="sb-date">Date</label>' +
      '<input class="input" id="sb-date" type="date" value="' + U.esc(U.todayStr()) + '"></div>' +
      '<div id="sb-entries" style="display:flex;flex-direction:column;gap:12px"></div>' +
      '<button type="button" class="btn ghost" id="sb-add" style="width:100%;margin-top:10px">' +
      ic().plus + ' Add stretch</button>';

    const editor = mountEditor(U.$('#sb-entries', content), {
      mode: 'draft',
      model: model,
      persist: function () {},
      prev: function (exId) { return prevSetsFor(u.id, exId); },
      prevSw: function (ref) { return prevSetworkFor(u.id, ref); }
    });

    U.$('#sb-add', content).addEventListener('click', function () {
      openExercisePicker({
        title: 'Add stretch',
        multi: true,
        category: 'mobility',
        onPick: function (ids) {
          ids.forEach(function (id) { model.entries.push(newSetworkEntry(id)); });
          editor.repaint();
        }
      });
    });

    App.sheet({
      title: 'Log stretches',
      content: content,
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        {
          label: 'Save session',
          kind: 'primary',
          keepOpen: true,
          onClick: function (api) {
            const entries = model.entries.map(cleanSetworkEntry).filter(Boolean);
            if (!entries.length) {
              App.toast('Log at least one stretch — a hold time or reps', 'err');
              return;
            }
            const dateEl = U.$('#sb-date', content);
            const dateStr = dateEl && /^\d{4}-\d{2}-\d{2}$/.test(dateEl.value) ? dateEl.value : U.todayStr();
            const warns = guardrailsFor({ date: dateStr, entries: entries }, u);
            confirmStops(warns).then(function (ok) {
              if (!ok) return;
              const w = Store.addWorkout({
                userId: u.id,
                date: dateStr,
                name: 'Stretch',
                durationMin: stretchSessionMinutes(entries),
                entries: entries
              });
              api.close();
              App.toast('Session saved', 'ok');
              toastWarns(warns);
              App.navigate('history');
              openSessionCheckin(w);
            });
          }
        }
      ]
    });
  }

  /* ---------- test quick-log ---------- */

  function openTestLogger(edit) {
    const u = user();
    if (!u) { App.toast('Create a profile first', 'err'); return; }

    let editW = null;
    let editEn = null;
    if (edit && edit.workoutId) {
      editW = Store.workoutById(edit.workoutId);
      editEn = editW ? (editW.entries || []).find(function (x) { return x && x.id === edit.entryId; }) : null;
      if (!editW || !editEn) { App.toast('Workout not found', 'err'); return; }
      // Defense in depth: never let an ACFT entry into the {value}-only editor.
      if (isAcftTestEntry(editEn)) { openAcftTestDetail(editW.id, editEn.id); return; }
    }
    const singleEntry = !editW || (editW.entries || []).length === 1;

    const st = {
      protocol: editEn && testProtocolOf(editEn.protocol) ? editEn.protocol : TEST_PROTOCOLS[0].id
    };

    function proto() { return testProtocolOf(st.protocol) || TEST_PROTOCOLS[0]; }

    function valueLabel() {
      const p = proto();
      if (p.unit === 'time') return 'Time (' + (p.hint || 'mm:ss') + ')';
      if (p.unit === 'score') return 'Score (points)';
      return 'Reps';
    }

    function initialValue() {
      if (!editEn || !editEn.results || typeof editEn.results.value !== 'number') return '';
      const p = testProtocolOf(editEn.protocol);
      return p && p.unit === 'time' ? fmtSec(editEn.results.value) : String(editEn.results.value);
    }

    const content = document.createElement('div');
    content.innerHTML =
      (singleEntry
        ? '<div class="field"><label for="ts-date">Date</label>' +
          '<input class="input" id="ts-date" type="date" value="' +
          U.esc(editW ? editW.date : U.todayStr()) + '"></div>'
        : '') +
      '<div class="field"><label for="ts-proto">Protocol</label>' +
      '<select class="select" id="ts-proto">' +
      TEST_PROTOCOLS.map(function (p) {
        return '<option value="' + p.id + '"' + (st.protocol === p.id ? ' selected' : '') + '>' +
          U.esc(p.label) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field"><label for="ts-value" id="ts-value-label">' + U.esc(valueLabel()) + '</label>' +
      '<input class="input" id="ts-value" type="text" inputmode="decimal" autocomplete="off" ' +
      'style="' + BIG_NUM_STYLE + '" placeholder="' + U.esc(proto().unit === 'time' ? (proto().hint || 'mm:ss') : '') +
      '" value="' + U.esc(initialValue()) + '"></div>' +
      '<div class="field"><label for="ts-notes">Notes</label>' +
      '<textarea class="input" id="ts-notes" rows="2" placeholder="Optional">' +
      U.esc((editEn && editEn.notes) || '') + '</textarea></div>';

    U.$('#ts-proto', content).addEventListener('change', function (e) {
      st.protocol = e.target.value;
      U.$('#ts-value-label', content).textContent = valueLabel();
      U.$('#ts-value', content).placeholder = proto().unit === 'time' ? (proto().hint || 'mm:ss') : '';
    });

    App.sheet({
      title: editEn ? 'Edit test' : 'Log a test',
      content: content,
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        {
          label: editEn ? 'Save changes' : 'Save test',
          kind: 'primary',
          keepOpen: true,
          onClick: function (api) {
            const p = proto();
            const raw = U.$('#ts-value', content).value;
            let value = null;
            if (p.unit === 'time') {
              value = parseTimeToSec(raw, p.plain || 'min');
              if (value !== null) value = Math.round(value);
            } else if (p.unit === 'reps') {
              const n = parseInt(raw, 10);
              value = isNaN(n) || n < 0 ? null : n;
            } else {
              const n = parseFloat(raw);
              value = isNaN(n) || n < 0 ? null : n;
            }
            if (value === null || (p.unit !== 'time' && String(raw).trim() === '')) {
              App.toast(p.unit === 'time' ? 'Enter a time like 14:30' : 'Enter a number', 'err');
              focusInput('ts-value');
              return;
            }
            const dateEl = U.$('#ts-date', content);
            const dateStr = dateEl && /^\d{4}-\d{2}-\d{2}$/.test(dateEl.value)
              ? dateEl.value
              : (editW ? editW.date : U.todayStr());
            // Merge over the entry's existing results so unknown fields (a
            // pass marker, fields from newer versions) survive a value edit;
            // switching protocols starts the results fresh.
            const results = editEn && editEn.protocol === st.protocol &&
              editEn.results && typeof editEn.results === 'object'
              ? Object.assign({}, editEn.results) : {};
            results.value = value;
            const en = {
              id: editEn ? editEn.id : U.uid('en'),
              type: 'test',
              protocol: st.protocol,
              results: results
            };
            // Keep a cached score only while the underlying value is unchanged;
            // an edited value makes the old score stale.
            if (editEn && typeof editEn.score === 'number' &&
                editEn.results && editEn.results.value === value) {
              en.score = editEn.score;
            }
            if (p.unit === 'score') en.score = value;
            const notes = U.$('#ts-notes', content).value.trim();
            if (notes) en.notes = notes;
            // P3: preserve fields written by newer app versions
            if (editEn) {
              for (const k in editEn) {
                if (TEST_KNOWN_KEYS.indexOf(k) < 0) en[k] = editEn[k];
              }
            }
            const durMin = p.unit === 'time' && value > 0 ? Math.max(1, Math.round(value / 60)) : null;

            if (editEn) {
              const live = Store.workoutById(editW.id);
              if (!live) { api.close(); return; }
              const entries = (live.entries || []).map(function (x) {
                return x && x.id === editEn.id ? en : x;
              });
              const patch = { entries: entries };
              if (singleEntry) {
                patch.date = dateStr;
                if (durMin) patch.durationMin = durMin;
              }
              Store.updateWorkout(editW.id, patch);
              api.close();
              App.toast('Workout updated', 'ok');
              return;
            }

            const warns = guardrailsFor({ date: dateStr, entries: [en] }, u);
            confirmStops(warns).then(function (ok) {
              if (!ok) return;
              const w = Store.addWorkout({
                userId: u.id,
                date: dateStr,
                name: p.label,
                durationMin: durMin,
                entries: [en]
              });
              api.close();
              App.toast('Test logged', 'ok');
              toastWarns(warns);
              App.navigate('history');
              openSessionCheckin(w);
            });
          }
        }
      ]
    });
    focusInput('ts-value');
  }

  /* ---------- typed summaries / detail blocks ---------- */

  function typedSummaryBits(w) {
    const bits = [];
    let durShown = false;
    const swEntries = [];
    (w.entries || []).forEach(function (en) {
      if (!en || isLiftEntry(en)) return;
      if (en.type === 'setwork') { swEntries.push(en); return; } // aggregated below
      if (en.type === 'cardio') {
        if (en.distanceKm) {
          bits.push(fmtKm(en.distanceKm));
          const p = paceStr(en.durationMin, en.distanceKm);
          if (p) bits.push(p);
        } else if (en.durationMin) {
          bits.push(U.fmtDuration(en.durationMin));
          durShown = true;
        }
        if (en.mode === 'ruck') {
          const L = en.loadKgTotal || en.loadKgDry;
          if (L) bits.push(App.fmtWeight(L, { precise: true }) + ' load');
        }
      } else if (en.type === 'mobility') {
        if (en.durationMin) { bits.push(U.fmtDuration(en.durationMin)); durShown = true; }
        const n = (en.targetMuscles || []).length;
        if (n) bits.push(n + ' area' + (n === 1 ? '' : 's'));
      } else if (en.type === 'durability') {
        const n = (en.items || []).length;
        if (n) bits.push(n + ' drill' + (n === 1 ? '' : 's'));
        if (en.durationMin) { bits.push(U.fmtDuration(en.durationMin)); durShown = true; }
      } else if (en.type === 'test') {
        const p = testProtocolOf(en.protocol);
        const v = fmtTestValue(en.protocol, en.results, en.score);
        bits.push((p ? p.label : String(en.protocol || 'Test')) + (v ? ' — ' + v : ''));
      }
    });
    // P3: setwork aggregates to one clause — 'N drills · M sets' for
    // durability-style work, 'N stretches · areas' for mobility-majority.
    if (swEntries.length) {
      const refs = {};
      const areaCounts = {};
      let sets = 0;
      let mob = 0;
      let oth = 0;
      swEntries.forEach(function (en) {
        refs[en.exerciseRef] = true;
        const stretch = swIsStretch(en);
        if (stretch) mob++;
        else oth++;
        const valid = (en.sets || []).filter(swValidSet).length;
        sets += valid;
        if (stretch) {
          const ex = exOf(en.exerciseRef);
          ((ex && ex.primaryMuscles) || []).forEach(function (m) {
            areaCounts[m] = (areaCounts[m] || 0) + Math.max(valid, 1);
          });
        }
      });
      const n = Object.keys(refs).length;
      if (mob >= oth && mob > 0) {
        bits.push(n + ' stretch' + (n === 1 ? '' : 'es'));
        const top = Object.keys(areaCounts).sort(function (a, b) {
          return areaCounts[b] - areaCounts[a];
        }).slice(0, 2).map(function (m) { return muscleLabelOf(m).toLowerCase(); });
        if (top.length) bits.push(top.join(', '));
      } else {
        bits.push(n + ' drill' + (n === 1 ? '' : 's'));
        if (sets) bits.push(sets + ' set' + (sets === 1 ? '' : 's'));
      }
    }
    return { bits: bits, durShown: durShown };
  }

  // Kind-appropriate one-liner; pure-lift workouts keep the v1 summary verbatim.
  function workoutSubAny(w) {
    const typed = typedEntriesOf(w);
    if (!typed.length) return workoutSub(w);
    const r = typedSummaryBits(w);
    const bits = r.bits;
    const lifts = liftEntriesOf(w);
    if (lifts.length) {
      bits.push(lifts.length + ' lift' + (lifts.length === 1 ? '' : 's'));
      const vol = Analytics.workoutVolume(w);
      if (vol > 0) bits.push(fmtVol(vol));
    }
    if (!r.durShown && w.durationMin) bits.push(U.fmtDuration(w.durationMin));
    return bits.join(' · ');
  }

  function kvRow(label, value) {
    if (value === undefined || value === null || value === '') return '';
    return '<div style="display:flex;justify-content:space-between;gap:12px;padding:7px 0;' +
      'border-bottom:1px solid var(--border);font-size:14px">' +
      '<span style="color:var(--text-2);flex:none">' + U.esc(label) + '</span>' +
      '<span style="font-weight:500;text-align:right;overflow-wrap:anywhere">' + U.esc(value) + '</span></div>';
  }

  function typedEntryDetailHTML(en, w) {
    let title = 'Session entry';
    let rows = '';
    if (en.type === 'cardio') {
      title = KIND_LABELS[en.mode] || 'Cardio';
      rows += kvRow('Distance', en.distanceKm ? fmtKm(en.distanceKm) : '');
      rows += kvRow('Duration', en.durationMin ? U.fmtDuration(en.durationMin) : '');
      rows += kvRow('Pace', paceStr(en.durationMin, en.distanceKm));
      if (en.loadKgDry) rows += kvRow('Dry load', App.fmtWeight(en.loadKgDry, { precise: true }));
      if (en.loadKgTotal) rows += kvRow('Total load', App.fmtWeight(en.loadKgTotal, { precise: true }));
      if (en.avgHR) rows += kvRow('Avg HR', en.avgHR + ' bpm');
      if (en.maxHR) rows += kvRow('Max HR', en.maxHR + ' bpm');
      if (en.effort) rows += kvRow('Effort', capStr(en.effort));
      if (en.surface) rows += kvRow('Surface', capStr(en.surface));
      if (en.footwear) rows += kvRow('Footwear', capStr(en.footwear));
      if (typeof en.tempC === 'number') rows += kvRow('Temp', en.tempC + ' °C');
      if (en.fluidMl) rows += kvRow('Fluid', en.fluidMl + ' ml');
      if (en.footNote) rows += kvRow('Foot check', en.footNote);
    } else if (en.type === 'mobility') {
      title = 'Mobility';
      const mod = MODALITY_DEFS.find(function (m) { return m.id === en.modality; });
      rows += kvRow('Modality', mod ? mod.label : capStr(en.modality));
      rows += kvRow('Duration', en.durationMin ? U.fmtDuration(en.durationMin) : '');
      const areas = (en.targetMuscles || []).map(muscleLabelOf).join(', ');
      rows += kvRow('Target areas', areas || 'Whole body');
    } else if (en.type === 'durability') {
      title = 'Durability';
      rows += kvRow('Drills', (en.items || []).map(exName).join(', '));
      rows += kvRow('Duration', en.durationMin ? U.fmtDuration(en.durationMin) : '');
    } else if (en.type === 'test') {
      title = 'Test';
      const p = testProtocolOf(en.protocol);
      rows += kvRow('Protocol', p ? p.label : String(en.protocol || ''));
      // P2: scored rendering via Protocols (ACFT event table, formatted values);
      // falls back to the P1 rendering when Protocols is unavailable.
      const scored = w ? testScoredHTML(en, w) : '';
      if (scored) {
        rows += scored;
      } else {
        rows += kvRow('Result', fmtTestValue(en.protocol, en.results, en.score));
        if (typeof en.score === 'number') rows += kvRow('Score', en.score + ' pts');
      }
    } else {
      rows += kvRow('Type', String(en.type));
      rows += '<p class="muted" style="font-size:13px;margin:6px 0">Logged by a newer version of IronLog — kept as-is.</p>';
    }
    if (en.notes) rows += kvRow('Notes', en.notes);
    return '<div class="card" style="padding:12px 14px;margin-bottom:12px">' +
      '<div style="display:flex;align-items:center;gap:8px;font-weight:600;margin-bottom:2px">' +
      kindGlyph(entryKindOf(en)) + '<span>' + U.esc(title) + '</span></div>' + rows + '</div>';
  }

  // Read-only detail for ACFT test entries (mirrors the Standards test detail
  // sheet: Delete + Close). The simple test editor rebuilds results as {value}
  // only, which would silently destroy the six raw event fields and the cached
  // score — so ACFT entries are view/delete-only here; changes go through
  // re-recording the test in Standards.
  function openAcftTestDetail(workoutId, entryId) {
    const w = Store.workoutById(workoutId);
    if (!w) return;
    const en = (w.entries || []).find(function (x) { return x && x.id === entryId; });
    if (!en) return;
    const solo = (w.entries || []).filter(function (x) { return !!x; }).length === 1;

    let html = '<p class="muted" style="font-size:13px;margin-bottom:12px">' +
      U.esc(U.fmtDateLong(w.date)) +
      (w.durationMin ? ' · ' + U.esc(U.fmtDuration(w.durationMin)) : '') + '</p>';
    html += typedEntryDetailHTML(en, w);
    html += '<p class="muted" style="font-size:13px;line-height:1.5;margin-top:4px">' +
      'ACFT results are scored from the raw event values, so they can’t be ' +
      'edited here. To change this test, delete it and re-record it in Standards.</p>';

    App.sheet({
      title: 'ACFT',
      content: html,
      actions: [
        {
          label: 'Delete',
          kind: 'danger',
          onClick: function () {
            App.confirm({
              title: 'Delete test?',
              message: (solo
                ? '“' + w.name + '” on ' + U.fmtDateLong(w.date) + ' will be permanently deleted.'
                : 'The ACFT result will be removed from “' + w.name + '”.') +
                ' Readiness will fall back to your previous best.',
              danger: true
            }).then(function (ok) {
              if (!ok) return;
              const live = Store.workoutById(w.id);
              if (!live) return;
              const rest = (live.entries || []).filter(function (x) { return x && x.id !== en.id; });
              if (rest.length) Store.updateWorkout(w.id, { entries: rest });
              else Store.deleteWorkout(w.id);
              App.toast('Test deleted');
            });
          }
        },
        {
          label: 'Re-record in Standards',
          kind: 'primary',
          onClick: function () { App.navigate('standards'); }
        },
        { label: 'Close', kind: 'ghost' }
      ]
    });
  }

  /* ---------- typed / mixed workout editing ---------- */

  // Entry-type dispatch around the (unchanged) lift editor.
  function dispatchWorkoutEdit(id) {
    const w = Store.workoutById(id);
    if (!w) return;
    const typed = typedEntriesOf(w);
    if (!typed.length) { openWorkoutEdit(id); return; }
    if (typed.length === 1 && (w.entries || []).length === 1) {
      const en = typed[0];
      if (en.type === 'cardio') { openCardioLogger(en.mode, { workoutId: w.id, entryId: en.id }); return; }
      if (en.type === 'mobility') { openMobilityLogger({ workoutId: w.id, entryId: en.id }); return; }
      if (en.type === 'durability') { openDurabilityLogger({ workoutId: w.id, entryId: en.id }); return; }
      if (en.type === 'test') {
        // ACFT entries can't round-trip through the simple editor — view only.
        if (isAcftTestEntry(en)) openAcftTestDetail(w.id, en.id);
        else openTestLogger({ workoutId: w.id, entryId: en.id });
        return;
      }
    }
    openMixedWorkoutEdit(w.id);
  }

  function typedEntrySummaryLine(en) {
    if (en.type === 'cardio') {
      const parts = [];
      if (en.distanceKm) parts.push(fmtKm(en.distanceKm));
      if (en.durationMin) parts.push(U.fmtDuration(en.durationMin));
      return parts.join(' · ') || 'Cardio session';
    }
    if (en.type === 'mobility') return (en.durationMin ? U.fmtDuration(en.durationMin) + ' · ' : '') + 'mobility';
    if (en.type === 'durability') return ((en.items || []).length || 0) + ' drills';
    if (en.type === 'test') return fmtTestValue(en.protocol, en.results, en.score) || 'test';
    if (en.type === 'setwork') {
      const s = setworkSetsString(en);
      return exName(en.exerciseRef) + (s ? ' · ' + s : '');
    }
    return 'Kept as-is';
  }

  // Editor for workouts mixing typed entries with lifts (or holding several
  // typed entries). Lift entries reuse mountEditor on a lift-only model; typed
  // entries edit through their own forms and are merged back in order on save.
  function openMixedWorkoutEdit(id) {
    const w = Store.workoutById(id);
    if (!w) return;
    const lifts = liftEntriesOf(w);
    // P3: setwork entries are editable in this editor in performance mode;
    // simple mode lists them read-only and re-emits them untouched on save.
    const swEditable = perfMode(user());
    const editableSw = {};
    const typed = typedEntriesOf(w).filter(function (en) {
      if (swEditable && isSetworkEntry(en) && en.id) { editableSw[en.id] = true; return false; }
      return true;
    });
    const model = JSON.parse(JSON.stringify({
      name: w.name,
      date: w.date,
      notes: w.notes || '',
      entries: (w.entries || []).filter(function (en) {
        return en && (isLiftEntry(en) || (en.id && editableSw[en.id]));
      })
    }));
    model.entries.forEach(function (en) {
      if (!isSetworkEntry(en)) return;
      const first = (en.sets || []).find(function (s) { return s && s.intensity >= 1; });
      en._depth = first ? U.clamp(Math.round(first.intensity), 1, 4) : 2;
    });
    // Snapshot each editable setwork entry's model as opened: entries the user
    // never touches re-emit the LIVE store entry verbatim on save instead of a
    // rebuilt model, so a zero-edit save can never normalize values or drop
    // off-nominal/future-format sets it didn't touch.
    const swOpenSnapshot = {};
    model.entries.forEach(function (en) {
      if (isSetworkEntry(en) && en.id) swOpenSnapshot[en.id] = JSON.stringify(en);
    });

    const content = document.createElement('div');
    content.innerHTML =
      '<div class="field-row">' +
      '<div class="field" style="flex:2"><label for="me-name">Name</label>' +
      '<input class="input" id="me-name" autocomplete="off" value="' + U.esc(model.name) + '"></div>' +
      '<div class="field" style="flex:1"><label for="me-date">Date</label>' +
      '<input class="input" id="me-date" type="date" value="' + U.esc(model.date) + '"></div></div>' +
      (typed.length
        ? sectionLabel('Session entries') + '<div class="list" style="margin-bottom:12px">' +
          typed.map(function (en) {
            const editable = ['cardio', 'mobility', 'durability', 'test'].indexOf(en.type) >= 0;
            return '<div class="list-row">' +
              '<span class="leading plain">' + kindGlyph(entryKindOf(en)) + '</span>' +
              '<div class="body"><div class="title">' + U.esc(KIND_LABELS[entryKindOf(en)] || capStr(en.type)) + '</div>' +
              '<div class="sub">' + U.esc(typedEntrySummaryLine(en)) + '</div></div>' +
              (editable
                ? '<button type="button" class="btn ghost small" data-tedit="' + U.esc(en.id || '') + '">' +
                  (isAcftTestEntry(en) ? 'View' : ic().edit + ' Edit') + '</button>'
                : '<span class="trailing muted" style="font-size:12px">Kept as-is</span>') +
              '</div>';
          }).join('') + '</div>'
        : '') +
      (model.entries.length ? sectionLabel(model.entries.length > lifts.length ? 'Exercises' : 'Lifts') : '') +
      '<div id="me-entries" style="display:flex;flex-direction:column;gap:12px"></div>' +
      '<div style="margin:10px 0"><button type="button" class="btn ghost" id="me-addex" style="width:100%">' +
      ic().plus + ' Add exercise</button></div>' +
      '<div class="field"><label for="me-notes">Notes</label>' +
      '<textarea class="input" id="me-notes" rows="2">' + U.esc(model.notes) + '</textarea></div>';

    const editor = mountEditor(U.$('#me-entries', content), {
      mode: 'edit',
      model: model,
      persist: function () {},
      prev: function (exId) { return prevSetsFor(w.userId, exId, { excludeId: w.id, maxDate: w.date }); },
      prevSw: function (ref) { return prevSetworkFor(w.userId, ref, { excludeId: w.id, maxDate: w.date }); }
    });

    U.$('#me-name', content).addEventListener('input', function (e) { model.name = e.target.value; });
    U.$('#me-date', content).addEventListener('input', function (e) { model.date = e.target.value; });
    U.$('#me-notes', content).addEventListener('input', function (e) { model.notes = e.target.value; });
    U.$('#me-addex', content).addEventListener('click', function () {
      openExercisePicker({
        title: 'Add exercise',
        multi: true,
        onPick: function (ids) {
          ids.forEach(function (exId) {
            const en = newEntryFor(exId, user());
            if (isSetworkEntry(en)) editableSw[en.id] = true;
            model.entries.push(en);
          });
          editor.repaint();
        }
      });
    });
    U.on(content, 'click', '[data-tedit]', function (e, btn) {
      const enId = btn.getAttribute('data-tedit');
      const live = Store.workoutById(w.id);
      const en = live ? (live.entries || []).find(function (x) { return x && x.id === enId; }) : null;
      if (!en) return;
      if (en.type === 'cardio') openCardioLogger(en.mode, { workoutId: w.id, entryId: en.id });
      else if (en.type === 'mobility') openMobilityLogger({ workoutId: w.id, entryId: en.id });
      else if (en.type === 'durability') openDurabilityLogger({ workoutId: w.id, entryId: en.id });
      else if (en.type === 'test') {
        if (isAcftTestEntry(en)) openAcftTestDetail(w.id, en.id);
        else openTestLogger({ workoutId: w.id, entryId: en.id });
      }
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
            // clean the edited lift entries exactly like the lift-only editor;
            // setwork entries clean through their own (unknown-key-preserving) path
            const cleaned = {};
            const cleanedOrder = [];
            const untouchedSw = {};
            model.entries.forEach(function (en) {
              if (isSetworkEntry(en)) {
                if (en.id && swOpenSnapshot[en.id] &&
                    JSON.stringify(en) === swOpenSnapshot[en.id]) {
                  // untouched — the live store entry passes through verbatim
                  untouchedSw[en.id] = true;
                  return;
                }
                const c = cleanSetworkEntry(en);
                if (c) { cleaned[en.id] = c; cleanedOrder.push(en.id); }
                return;
              }
              if (!en.exerciseId) return;
              const sets = (en.sets || [])
                .filter(function (s) { return (s.reps || 0) > 0; })
                .map(function (s) {
                  return {
                    weightKg: s.weightKg || 0,
                    reps: s.reps || 0,
                    type: s.type === 'warmup' ? 'warmup' : 'work',
                    rpe: s.rpe === null || s.rpe === undefined ? null : s.rpe
                  };
                });
              if (!sets.length) return;
              cleaned[en.id] = { id: en.id, exerciseId: en.exerciseId, notes: en.notes || '', sets: sets };
              cleanedOrder.push(en.id);
            });
            // reassemble in original order: typed entries come fresh from the
            // store (their edits save directly), lifts from the editor model
            const fresh = Store.workoutById(w.id);
            const base = fresh ? (fresh.entries || []) : (w.entries || []);
            const used = {};
            const entries = [];
            base.forEach(function (en) {
              if (!en) return;
              if (isLiftEntry(en)) {
                if (en.id && cleaned[en.id]) { entries.push(cleaned[en.id]); used[en.id] = true; }
              } else if (isSetworkEntry(en) && en.id && editableSw[en.id]) {
                // untouched entries round-trip verbatim; edited ones come from
                // the cleaner (deleted/emptied entries drop)
                if (untouchedSw[en.id]) { entries.push(en); used[en.id] = true; }
                else if (cleaned[en.id]) { entries.push(cleaned[en.id]); used[en.id] = true; }
              } else {
                entries.push(en);
              }
            });
            cleanedOrder.forEach(function (enId) {
              if (!used[enId]) entries.push(cleaned[enId]);
            });
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

    // P4.5 — two presentations, one state. The focus view is a RENDERER over
    // the same draft (js/player.js, loaded after this file); when it is not
    // available the session simply stays in the builder.
    // Mode gate (binding): the focus presentation is Performance-mode only. A
    // draft that reached simple mode still carrying _view:'focus' (a mid-draft
    // profile switch) falls back to the builder rather than rendering pace UI a
    // family user must never see.
    if (draft && draft._view === 'focus' && !perfMode(u)) {
      draft._view = 'builder';
      saveDraft();
    }
    if (draft && draft._view === 'focus') {
      const render = focusRenderer();
      if (render) {
        liveRepaint = null;
        discardLegacySession();
        render(container, liveSessionApi());
        return;
      }
      draft._view = 'builder';
      saveDraft();
    }

    if (!draft) {
      // honor deep-link params
      if (params && params.repeat) {
        const w = Store.workoutById(params.repeat);
        if (w && (liftEntriesOf(w).length || setworkEntriesOf(w).length)) {
          beginFromWorkout(repeatableView(w));
          App.navigate('log');
          return;
        }
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
    // 'Repeat last workout' = most recent workout WITH lift entries (v2);
    // P3: its setwork entries seed too, so the card counts the repeatable view.
    const last = Store.workoutsFor(u.id).find(function (w) { return liftEntriesOf(w).length > 0; }) || null;
    const templates = Store.templatesFor(u.id).slice()
      .sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });

    let html = '<div class="view-head"><h1>Workout</h1></div>' +
      '<button type="button" class="btn primary" id="lg-start" style="width:100%;min-height:54px;font-size:16px">' +
      ic().plus + ' Start empty workout</button>' +
      kindChipRowHTML(u, false);

    if (last) {
      // count only what Repeat will actually seed (lift + setwork entries)
      const rep = repeatableView(last);
      const sets = Analytics.workoutSets(rep) + rep.entries.reduce(function (a, en) {
        return isSetworkEntry(en) ? a + (en.sets || []).length : a;
      }, 0);
      html += '<div class="card"><div class="card-title">Repeat last workout</div>' +
        '<div class="list-row" style="padding:0;min-height:0">' +
        '<div class="body"><div class="title">' + U.esc(last.name) + '</div>' +
        '<div class="sub">' + U.esc(U.relDate(last.date)) + ' · ' + rep.entries.length + ' exercises · ' +
        sets + ' sets · ' + U.esc(fmtVol(Analytics.workoutVolume(rep))) + '</div></div>' +
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
      if (w) { beginFromWorkout(repeatableView(w)); App.rerender(); }
    });
    U.on(container, 'click', '[data-kind]', function (e, chip) {
      openKindLogger(chip.getAttribute('data-kind'));
    });
    U.on(container, 'click', '#lg-more', function () {
      const row = U.$('#lg-kinds', container);
      if (row) row.outerHTML = kindChipRowHTML(u, true);
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
      const sw = isSetworkEntry(en); // setwork sets never feed volume
      (en.sets || []).forEach(function (s) {
        total++;
        if (s.done) {
          done++;
          if (!sw && s.type !== 'warmup') vol += (s.weightKg || 0) * (s.reps || 0);
        }
      });
    });
    el.textContent = done + '/' + total + ' sets · ' + fmtVol(vol);
  }

  function renderActiveDraft(container, u) {
    const notesShown = draft._notesOpen === undefined ? !!draft.notes : !!draft._notesOpen;
    // P4.5 — pace UI is performance-mode only; simple mode keeps today's header
    // exactly (elapsed · stats · discard).
    const perf = perfMode(u);
    const focusOk = perf && !!focusRenderer();
    const pace = perf ? resolvePace(null, draft) : 'off';
    // Mode gate (binding): simple mode is BYTE-IDENTICAL. A draft that reached
    // it carrying setwork entries (via Repeat, a sync, or a mid-session switch)
    // must not keep the live layer — and a timer already on the clock when the
    // switch happened is cancelled here, recording nothing, which also unmounts
    // the pill. ctx.live below is the single gate for _sid minting, the set-run
    // buttons, the card stopwatch's 'run this exercise' meaning and every run
    // dispatch, so one flag restores exact P4 behavior.
    if (!perf && Session.isRunning()) Session.cancel();

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
      (perf
        ? '<button type="button" class="chip pace-chip' + (pace === 'off' ? '' : ' active') + '" id="lg-pace" ' +
          'title="How much should the app drive?" aria-label="Session pace: ' + U.esc(PACE_SHORT[pace]) + '">' +
          ic().timer + ' ' + U.esc(PACE_SHORT[pace]) + '</button>'
        : '') +
      (focusOk
        ? '<button type="button" class="btn icon ghost" id="lg-focus" title="Focus view" aria-label="Switch to focus view">' +
          FOCUS_ICON + '</button>'
        : '') +
      '<button type="button" class="btn icon ghost" id="lg-discard" aria-label="Discard workout" title="Discard workout">' +
      ic().trash + '</button></div></div>' +
      '<div id="lg-entries" style="display:flex;flex-direction:column;gap:16px"></div>' +
      '<button type="button" class="btn primary" id="lg-addex" style="width:100%">' + ic().plus + ' Add exercise</button>' +
      (notesShown
        ? '<div class="card"><div class="card-title">Workout notes</div>' +
          '<textarea class="input" id="lg-notes" rows="3" placeholder="How did it go?">' + U.esc(draft.notes || '') + '</textarea></div>'
        : '<button type="button" class="btn ghost small" id="lg-notes-btn" style="align-self:flex-start">' +
          ic().edit + ' Add notes</button>');

    const editor = mountEditor(U.$('#lg-entries', container), {
      mode: 'draft',
      live: perf,          // P4.5 — THE live session record, Performance mode only
      model: draft,
      persist: saveDraft,
      prev: function (exId) { return prevSetsFor(u.id, exId); },
      prevSw: function (ref) { return prevSetworkFor(u.id, ref); },
      onStats: updateDraftStats
    });

    // The builder repaints itself surgically instead of subscribing (a full
    // repaint on every keystroke would eat the caret); the Session engine calls
    // this when it writes a set.
    liveRepaint = function () {
      if (!document.getElementById('lg-entries')) { liveRepaint = null; return; }
      editor.repaint();
    };

    const paceBtn = U.$('#lg-pace', container);
    if (paceBtn) paceBtn.addEventListener('click', openPaceSheet);
    const focusBtn = U.$('#lg-focus', container);
    if (focusBtn) {
      focusBtn.addEventListener('click', function () {
        // one tap in BOTH directions; never interrupts a running timer
        draft._view = 'focus';
        saveDraft();
        App.rerender();
      });
    }

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
          ids.forEach(function (id) { draft.entries.push(newEntryFor(id, user())); });
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
    // the draft object was re-read by renderLog — re-bind the pill/row paint
    if (Session.isRunning()) Session.reconcile();
    onSessionState();
  }

  /* ---------- state C: finish flow ---------- */

  // Valid set: reps > 0 (weight 0 is fine — bodyweight). Drops the 'done' flag.
  // Setwork entries dispatch to their own cleaner (valid = reps>0 || holdSec>0
  // || distanceM>0 — never the lift reps>0 filter).
  // P4.5: a live session can put TYPED entries in the draft (the circuit round
  // player writes the ordinary P3 cardio entry with rounds + stations). They
  // save verbatim, minus draft-local '_'-prefixed keys — the same
  // preserve-unknown-keys rule the mixed editor already follows. Lift and
  // setwork paths below are untouched, so simple mode stays byte-identical.
  function cleanTypedEntry(en) {
    const out = {};
    for (const k in en) {
      if (k.charAt(0) === '_') continue;
      out[k] = en[k];
    }
    out.id = en.id || U.uid('en');
    // THE write boundary: a typed entry never carries sets. An empty array
    // injected while the draft was live (by any past or future backfill, and
    // by drafts already polluted on disk) is dropped here rather than copied
    // verbatim into the stored workout.
    if (Array.isArray(out.sets) && out.sets.length === 0) delete out.sets;
    if (out.type === 'cardio' && out.mode === 'circuit' && !((Number(out.rounds) || 0) > 0)) return null;
    return out;
  }

  function buildFinishedEntries() {
    const entries = [];
    (draft.entries || []).forEach(function (en) {
      if (isSetworkEntry(en)) {
        const c = cleanSetworkEntry(en);
        if (c) entries.push(c);
        return;
      }
      if (!isLiftEntry(en)) {
        const t = cleanTypedEntry(en);
        if (t) entries.push(t);
        return;
      }
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
    const swSets = entries.reduce(function (a, en) {
      return isSetworkEntry(en) ? a + en.sets.length : a;
    }, 0);
    const sets = Analytics.workoutSets(candidate) + swSets;

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

    // v2: session RPE + feel for everyone; check-in question + guardrails in
    // performance mode only.
    const finishUser = user();
    const perf = perfMode(finishUser);
    const sel = { rpe: null, feel: null };
    html += rpeFeelHTML(sel);
    if (perf) {
      html += '<div class="field"><label for="fs-checkin">How did that feel?</label>' +
        '<textarea class="input" id="fs-checkin" rows="2" placeholder="One line — optional"></textarea></div>';
    }
    const warns = guardrailsFor({ date: draft.date, entries: entries }, finishUser);
    html += guardHTML(warns);

    const content = document.createElement('div');
    content.innerHTML = html;
    wireRpeFeel(content, sel);

    App.sheet({
      title: 'Finish workout',
      content: content,
      actions: [
        { label: 'Keep logging', kind: 'ghost' },
        {
          label: 'Save workout',
          kind: 'primary',
          keepOpen: true,
          onClick: function (api) {
            if (!draft) { api.close(); return; }
            const doSave = function () {
              if (!draft) { api.close(); return; }
              // Rebuild at save time: the hold countdown keeps running behind
              // this sheet and writes holdSec+done into the draft — persisting
              // the open-time snapshot would silently drop that set.
              const rebuilt = buildFinishedEntries();
              const finalEntries = rebuilt.length ? rebuilt : entries;
              const endedAt = Date.now();
              const answerEl = U.$('#fs-checkin', content);
              const answer = perf && answerEl ? answerEl.value.trim() : '';
              const payload = {
                userId: draft.userId,
                date: draft.date,
                name: U.$('#fs-name', content).value.trim() || draft.name || defaultDraftName(),
                notes: U.$('#fs-notes', content).value,
                startedAt: draft.startedAt,
                endedAt: endedAt,
                durationMin: Math.max(1, Math.round((endedAt - draft.startedAt) / 60000)),
                entries: finalEntries
              };
              if (sel.rpe) payload.rpe = sel.rpe;
              if (sel.feel) payload.feel = sel.feel;
              if (answer) payload.checkin = answer;
              const saved = Store.addWorkout(payload);
              if (perf && answer) {
                Store.addJournalEntry({
                  userId: saved.userId,
                  date: saved.date,
                  source: 'checkin',
                  entry: kindOfWorkout(saved) + ' ' + saved.date + ': ' + answer
                });
              }
              clearDraft();
              api.close();
              App.navigate('history');
              App.toast('Workout saved', 'ok');
              toastWarns(warns);
            };
            confirmStops(warns).then(function (ok) { if (ok) doSave(); });
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
          '<div class="body"><div class="title" style="display:flex;align-items:center;gap:6px">' +
          kindGlyph(workoutGlyphKind(w)) + '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
          U.esc(w.name) + '</span></div>' +
          '<div class="sub">' + U.esc(workoutSubAny(w)) + '</div></div>' +
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
    const lifts = liftEntriesOf(w);
    const allTyped = typedEntriesOf(w);
    const swEntries = allTyped.filter(isSetworkEntry);
    const typed = allTyped.filter(function (en) { return !isSetworkEntry(en); });

    let html = '<p class="muted" style="font-size:13px;margin-bottom:12px;display:flex;align-items:center;gap:6px">' +
      kindGlyph(workoutGlyphKind(w)) + '<span>' +
      U.esc(U.fmtDateLong(w.date)) + ' · ' + U.esc(workoutSubAny(w)) + '</span></p>';

    if (typed.length) {
      html += typed.map(function (en) { return typedEntryDetailHTML(en, w); }).join('');
    }

    // P3: lifts-style table per setwork entry, unit-aware strings
    if (swEntries.length) {
      html += '<div class="table-wrap"><table class="table"><thead><tr>' +
        '<th>Drill</th><th>Sets</th></tr></thead><tbody>' +
        swEntries.map(function (en) {
          return '<tr><td>' + U.esc(exName(en.exerciseRef)) + '</td>' +
            '<td style="white-space:normal">' + U.esc(setworkSetsString(en)) +
            (en.notes ? '<div class="muted" style="font-size:12px">' + U.esc(en.notes) + '</div>' : '') +
            '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }

    if (lifts.length) {
      html += '<div class="table-wrap"><table class="table"><thead><tr>' +
        '<th>Exercise</th><th>Sets (' + U.esc(U.unitLabel(App.units())) + ' × reps)</th><th class="num">Volume</th>' +
        '</tr></thead><tbody>' +
        lifts.map(function (en) {
          const vol = U.sum(en.sets || [], Analytics.setVolume);
          return '<tr><td>' + U.esc(exName(en.exerciseId)) + '</td>' +
            '<td style="white-space:normal">' + U.esc(setsString(en.sets)) + '</td>' +
            '<td class="num">' + U.esc(fmtVol(vol)) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }

    if (w.rpe || w.feel || w.checkin) {
      const feelDef = FEEL_DEFS.find(function (f) { return f.id === w.feel; });
      const bits = [];
      if (w.rpe) bits.push('RPE ' + w.rpe);
      if (feelDef) bits.push('Felt ' + feelDef.label.toLowerCase());
      html += sectionLabel('Session') +
        '<p style="font-size:14px;color:var(--text-2)">' + U.esc(bits.join(' · ')) +
        (w.checkin ? (bits.length ? '<br>' : '') + '“' + U.esc(w.checkin) + '”' : '') + '</p>';
    }

    if (w.notes) {
      html += sectionLabel('Notes') +
        '<p style="font-size:14px;color:var(--text-2);white-space:pre-wrap">' + U.esc(w.notes) + '</p>';
    }
    // Lift entries only — typed entries render their notes in their own card.
    const exNotes = w.entries.filter(function (en) {
      return en.notes && (!en.type || en.type === 'lift');
    });
    if (exNotes.length) {
      html += sectionLabel('Exercise notes') + exNotes.map(function (en) {
        return '<p style="font-size:13px;color:var(--text-2);margin-bottom:6px"><b>' +
          U.esc(exName(en.exerciseId)) + ':</b> ' + U.esc(en.notes) + '</p>';
      }).join('');
    }

    const actions = [
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
      { label: 'Edit', kind: 'ghost', onClick: function () { dispatchWorkoutEdit(w.id); } }
    ];
    if (lifts.length || swEntries.length) {
      actions.push({
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
              if (ok) { beginFromWorkout(repeatableView(w)); App.navigate('log'); }
            });
          } else {
            beginFromWorkout(repeatableView(w));
            App.navigate('log');
          }
        }
      });
    }

    App.sheet({
      title: w.name,
      content: html,
      actions: actions
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

    // P3.5: routines — guided session plans (performance mode only). NOT
    // templates: they live in their own fleet-safe collection and run in the
    // player. Rendered in the templates view's card idiom.
    const P = perfMode(u) ? playerApi() : null;
    if (P && typeof Store.routinesFor === 'function') {
      const routines = Store.routinesFor(u.id) || [];
      html += sectionLabel('Routines');
      if (!routines.length) {
        html += '<div class="card"><div class="card-title">Routines</div>' +
          '<p class="muted" style="font-size:14px;margin-bottom:10px">Guided session plans — holds, sides and rests, run by the app step by step.</p>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<button type="button" class="btn primary small" id="rt-new">' + ic().plus + ' New routine</button>' +
          '<button type="button" class="btn ghost small" id="rt-builtin">Built-in routines</button>' +
          '</div></div>';
      } else {
        html += routines.map(function (r) {
          const names = (r.items || []).map(function (it) { return exName(it.exerciseId); });
          const preview = names.slice(0, 4).join(' · ') + (names.length > 4 ? ' · +' + (names.length - 4) + ' more' : '');
          return '<div class="card" data-rid="' + U.esc(r.id) + '">' +
            '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">' +
            '<span class="leading" style="color:var(--accent)">' +
            (KIND_ICONS[r.kind === 'stretch' ? 'mobility' : r.kind] || KIND_ICONS.durability) + '</span>' +
            '<div style="flex:1;min-width:0"><div style="font-weight:600;font-size:16px">' + U.esc(r.name || 'Routine') + '</div>' +
            '<div class="muted" style="font-size:12px">' + U.esc(capStr(r.kind || 'custom')) + ' · ' +
            (r.items || []).length + ' exercise' + ((r.items || []).length === 1 ? '' : 's') + '</div></div></div>' +
            (names.length
              ? '<p class="muted" style="font-size:13px;margin-bottom:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
                U.esc(preview) + '</p>'
              : '') +
            '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
            '<button type="button" class="btn primary small" data-ract="start">▶ Start guided</button>' +
            '<button type="button" class="btn ghost small" data-ract="edit">' + ic().edit + ' Edit</button>' +
            '<button type="button" class="btn ghost small" data-ract="dup">' + ic().copy + ' Duplicate</button>' +
            '<span style="flex:1"></span>' +
            '<button type="button" class="btn icon ghost" data-ract="del" aria-label="Delete routine">' + ic().trash + '</button>' +
            '</div></div>';
        }).join('') +
          '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<button type="button" class="btn ghost small" id="rt-new">' + ic().plus + ' New routine</button>' +
          '<button type="button" class="btn ghost small" id="rt-builtin">Built-in routines</button>' +
          '</div>';
      }
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

    // P3.5: routines card actions (elements exist only in performance mode)
    const rtNew = U.$('#rt-new', container);
    if (rtNew) {
      rtNew.addEventListener('click', function () {
        const Pl = playerApi();
        if (Pl) Pl.editRoutine(null, { userId: u.id });
      });
    }
    const rtBuiltin = U.$('#rt-builtin', container);
    if (rtBuiltin) {
      rtBuiltin.addEventListener('click', function () {
        const Pl = playerApi();
        if (Pl) Pl.openPlanner(u.id);
      });
    }
    U.on(container, 'click', '[data-rid] [data-ract]', function (e, btn) {
      const Pl = playerApi();
      const rid = btn.closest('[data-rid]').getAttribute('data-rid');
      const r = typeof Store.routinesFor === 'function'
        ? (Store.routinesFor(u.id) || []).find(function (x) { return x.id === rid; })
        : null;
      if (!r) return;
      const act = btn.getAttribute('data-ract');
      if (act === 'start' && Pl) {
        Pl.start(r, { routineRef: r.id });
      } else if (act === 'edit' && Pl) {
        Pl.editRoutine(r, { userId: u.id });
      } else if (act === 'dup') {
        // shallow-copy preserving unknown keys at routine and item level
        const copy = {};
        for (const k in r) copy[k] = r[k];
        delete copy.id;
        delete copy.createdAt;
        delete copy.updatedAt;
        copy.userId = u.id;
        copy.name = (r.name || 'Routine') + ' (copy)';
        copy.items = (r.items || []).map(function (it) {
          const c = {};
          for (const k in it) c[k] = it[k];
          return c;
        });
        Store.addRoutine(copy);
        App.toast('Routine duplicated', 'ok');
      } else if (act === 'del') {
        App.confirm({
          title: 'Delete routine?',
          message: '“' + (r.name || 'Routine') + '” will be removed everywhere.',
          danger: true
        }).then(function (ok) {
          if (ok) { Store.deleteRoutine(r.id); App.toast('Routine deleted'); }
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

  // P3.5: hooks for js/player.js (loaded after this file). The guided player
  // reuses the full exercise picker and the shared post-save check-in flow so
  // player-written sessions behave exactly like direct-save loggers.
  window.ViewsLog = {
    openExercisePicker: openExercisePicker,
    openSessionCheckin: openSessionCheckin,
    // P4.5 — the live-session substrate. ONE session record: the draft, and
    // ONE timing engine: Player.Session. The focus view renders and mutates
    // through this API, so every change lands in the same saveDraft()
    // reconcile choke point the builder uses. `Session` below is the façade
    // over Player.Session, kept for the snapshot shape older callers read.
    live: liveSessionApi,
    getDraft: function () { return draft; },
    saveDraft: saveDraft,
    subscribeDraft: subscribeDraft,
    sidOf: sidOf,
    Session: Session,
    resolvePace: resolvePace,
    resolveRestSec: resolveRestSec,
    resolveCadence: resolveCadence,
    resolveTempo: resolveTempo,
    driverFor: driverFor,
    targetSecFor: targetSecFor,
    draftKind: draftKind,
    paceSettingsOf: paceSettingsOf,
    openPaceSheet: openPaceSheet,
    openEntryPaceSheet: openEntryPaceSheet,
    startDraft: startDraft,
    clearDraft: clearDraft,
    finish: openFinishSheet,
    // named hooks the focus view calls back into (js/player.js)
    openFinishSheet: openFinishSheet,
    startRestPill: function (sec) { startRest(sec); },
    stopRestPill: stopRest,
    buildFinishedEntries: function () { return draft ? buildFinishedEntries() : []; },
    PACE_KIND_DEFAULT: PACE_KIND_DEFAULT
  };

})();
