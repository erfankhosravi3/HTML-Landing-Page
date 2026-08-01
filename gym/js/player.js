/* IronLog — P3.5: guided session player + routine planner. Attaches window.Player.
   The player is a full-screen overlay OWNED OUTSIDE the view system: appended to
   <body>, chrome hidden while it runs, never destroyed by navigation (hash
   changes pause the countdown instead). It WRITES ordinary lift/setwork/cardio
   entries per the P3 shapes — no analytics semantics change anywhere.
   Player.compile is PURE and unit-testable in Node with a window stub: nothing
   at the top level of this file touches document, localStorage or timers.

   Compiled step shapes (contract):
     { type:'work', shape:'hold'|'reps'|'carry'|'weight_reps', exerciseId,
       side?, setIdx, targetSec?, targetReps?, targetM?, targetKg?, entryIdx }
     { type:'rest', sec, afterEntryIdx }
   (entryIdx/afterEntryIdx = index of the source routine item; the runtime maps
   steps back onto the entries it accumulates.)
   Circuit-kind routines compile to a rounds structure instead:
     { kind:'circuit', rounds, amrapSec|null, stations:[{exerciseId?, name?,
       reps?, durationSec?, weightKg?}], restSec } */
(function () {
  'use strict';

  const Player = {};
  const LS_KEY = 'ironlog/activeSession';
  const DEFAULT_HOLD_SEC = 30;
  const METHODS = ['static', 'dynamic', 'pnf', 'loaded'];
  const KIND_DEFS = [
    { id: 'stretch', label: 'Stretch' },
    { id: 'durability', label: 'Durability' },
    { id: 'circuit', label: 'Circuit' },
    { id: 'custom', label: 'Custom' }
  ];
  // Stretch depth anchors (P3 binding scale) — aim line + rest-time ask.
  const DEPTHS = [
    { n: 1, label: 'Easy', aim: 'first stretch sensation, stay long' },
    { n: 2, label: 'Working', aim: 'breathe slow, let it fade' },
    { n: 3, label: 'Deep', aim: 'end range, deliberate exhales' },
    { n: 4, label: 'Limit', aim: 'guarding — back off' }
  ];

  /* ======================================================================
     Small shared helpers (lazy on window.* so Node stubs stay tiny)
     ====================================================================== */

  function db() { return window.ExerciseDB || null; }

  function exOf(id) {
    const d = db();
    return d && typeof d.byId === 'function' ? d.byId(id) : null;
  }

  function exName(id) {
    const ex = exOf(id);
    return ex ? ex.name : String(id || 'Exercise');
  }

  function user() {
    return window.Store && Store.currentUser ? Store.currentUser() : null;
  }

  function perfMode(u) {
    u = u || user();
    return !!(u && u.settings && u.settings.trainingProfile === 'performance');
  }

  function ic() { return (window.App && App.icons) || {}; }

  function num(v) {
    const n = Number(v);
    return isFinite(n) ? n : 0;
  }

  function clampInt(v, lo, hi, dflt) {
    const n = Math.round(num(v));
    if (!(n >= lo)) return dflt;
    return Math.min(hi, n);
  }

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  function fmtClock(totalSec) {
    totalSec = Math.max(0, Math.round(totalSec));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return m + ':' + pad2(s);
  }

  // 'mm:ss' / bare seconds -> seconds; null on garbage (same semantics as the
  // views-log parser for plainUnit 'sec').
  function parseSec(str) {
    str = String(str === null || str === undefined ? '' : str).trim();
    if (!str) return null;
    if (str.indexOf(':') >= 0) {
      const parts = str.split(':');
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i].trim();
        if (p === '' || isNaN(Number(p)) || Number(p) < 0) return null;
        parts[i] = Number(p);
      }
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      return null;
    }
    const v = parseFloat(str);
    if (isNaN(v) || v < 0) return null;
    return v;
  }

  function fmtWeight(kg) {
    if (window.App && App.fmtWeight) return App.fmtWeight(kg, { precise: true });
    return Math.round(kg * 10) / 10 + ' kg';
  }

  function displayToKg(v) {
    const units = window.App && App.units ? App.units() : 'kg';
    return U.displayToKg(v, units);
  }

  function kgToDisplay(kg) {
    const units = window.App && App.units ? App.units() : 'kg';
    return U.kgToDisplay(kg || 0, units);
  }

  function toast(msg, kind) {
    if (window.App && App.toast) App.toast(msg, kind);
  }

  /* ======================================================================
     Player.compile — PURE timeline compiler
     ====================================================================== */

  function setShapeOf(ex) {
    return (ex && ex.setShape) || 'weight_reps';
  }

  function itemMethod(item, ex) {
    if (item && METHODS.indexOf(item.method) >= 0) return item.method;
    return (ex && ex.defaultMethod) || 'static';
  }

  // Which step shape a routine item produces. Known exercises follow their
  // setShape (stretch splits on method); unknown ids infer from the targets so
  // a deleted custom exercise still plays sanely.
  function itemShape(item) {
    const ex = exOf(item.exerciseId);
    if (ex) {
      const s = setShapeOf(ex);
      if (s === 'carry') return 'carry';
      if (s === 'hold') return 'hold';
      if (s === 'stretch') return itemMethod(item, ex) === 'dynamic' ? 'reps' : 'hold';
      return 'weight_reps';
    }
    if (num(item.targetHoldSec) > 0) return 'hold';
    if (num(item.targetDistanceM) > 0) return 'carry';
    if (num(item.targetWeightKg) > 0) return 'weight_reps';
    return 'reps';
  }

  function itemIsStretch(item) {
    const ex = exOf(item.exerciseId);
    return setShapeOf(ex) === 'stretch';
  }

  // Lift items (weight_reps shape) save as plain lift entries and keep earning
  // volume/PRs/muscle credit; everything else saves as setwork.
  function itemIsLift(item) {
    return itemShape(item) === 'weight_reps';
  }

  function compileCircuit(routine, items) {
    const stations = [];
    items.forEach(function (item) {
      if (!item || typeof item !== 'object') return;
      const st = {};
      const ex = item.exerciseId ? exOf(item.exerciseId) : null;
      if (item.exerciseId) st.exerciseId = String(item.exerciseId);
      if (!ex) {
        const nm = item.name !== undefined ? item.name : item.exerciseId;
        if (nm !== undefined && nm !== null && nm !== '') st.name = String(nm);
      }
      if (num(item.targetReps) > 0) st.reps = Math.round(num(item.targetReps));
      if (num(item.targetHoldSec) > 0) st.durationSec = Math.round(num(item.targetHoldSec));
      if (num(item.targetWeightKg) > 0) st.weightKg = num(item.targetWeightKg);
      if (st.exerciseId || st.name) stations.push(st);
    });
    let rounds = 0;
    if (num(routine.rounds) > 0) rounds = Math.round(num(routine.rounds));
    else {
      items.forEach(function (item) {
        if (item && num(item.sets) > rounds) rounds = Math.round(num(item.sets));
      });
    }
    if (!(rounds >= 1)) rounds = 3;
    const amrap = num(routine.amrapSec) > 0 ? Math.round(num(routine.amrapSec)) : null;
    return {
      kind: 'circuit',
      rounds: rounds,
      amrapSec: amrap,
      stations: stations,
      restSec: Math.max(0, Math.round(num(routine.restSec)))
    };
  }

  Player.compile = function (routine, opts) {
    routine = routine || {};
    opts = opts || {};
    const items = Array.isArray(routine.items) ? routine.items : [];
    if (routine.kind === 'circuit') return compileCircuit(routine, items);

    const defRest = Math.max(0, Math.round(num(routine.restSec)));
    const sideRest = Math.max(0, Math.round(num(opts.sideRestSec))); // rest between L/R only when configured
    const steps = [];

    items.forEach(function (item, itemIdx) {
      if (!item || typeof item !== 'object' || !item.exerciseId) return;
      const ex = exOf(item.exerciseId);
      const shape = itemShape(item);
      const perSide = !!(ex && ex.perSide);
      const nSets = clampInt(item.sets, 1, 20, 1);
      const restSec = item.restSec === undefined || item.restSec === null
        ? defRest
        : Math.max(0, Math.round(num(item.restSec)));

      for (let s = 0; s < nSets; s++) {
        const sides = perSide ? ['L', 'R'] : [null];
        for (let si = 0; si < sides.length; si++) {
          const step = {
            type: 'work',
            shape: shape,
            exerciseId: String(item.exerciseId),
            setIdx: s,
            entryIdx: itemIdx
          };
          if (sides[si]) step.side = sides[si];
          if (num(item.targetHoldSec) > 0) step.targetSec = Math.round(num(item.targetHoldSec));
          if (num(item.targetReps) > 0) step.targetReps = Math.round(num(item.targetReps));
          if (num(item.targetDistanceM) > 0) step.targetM = Math.round(num(item.targetDistanceM));
          if (num(item.targetWeightKg) > 0) step.targetKg = num(item.targetWeightKg);
          steps.push(step);
          if (sides[si] === 'L' && sideRest > 0) {
            steps.push({ type: 'rest', sec: sideRest, afterEntryIdx: itemIdx });
          }
        }
        if (restSec > 0) steps.push({ type: 'rest', sec: restSec, afterEntryIdx: itemIdx });
      }
    });

    // no trailing rest — the session is over when the work is
    while (steps.length && steps[steps.length - 1].type === 'rest') steps.pop();

    let workCount = 0;
    let estSec = 0;
    steps.forEach(function (st) {
      if (st.type === 'work') workCount++;
      estSec += stepEstimateSec(st);
    });
    return { kind: 'steps', steps: steps, workCount: workCount, estSec: estSec };
  };

  function stepEstimateSec(step) {
    if (step.type === 'rest') return step.sec;
    if (step.shape === 'hold') return step.targetSec > 0 ? step.targetSec : DEFAULT_HOLD_SEC;
    if (step.shape === 'carry') return 45;
    return 35; // reps / weight_reps nominal
  }

  Player.stepEstimateSec = stepEstimateSec; // exposed for tests + wiring

  /* ======================================================================
     Routine helpers shared with the wiring layer
     ====================================================================== */

  // Built-in DURABILITY_ROUTINES A/B as an inline routine (never stored).
  Player.builtinRoutine = function (letter) {
    const d = db();
    const items = d && d.DURABILITY_ROUTINES && d.DURABILITY_ROUTINES[letter];
    if (!items || !items.length) return null;
    return {
      name: 'Durability ' + letter,
      kind: 'durability',
      builtin: true,
      restSec: 60,
      items: items.map(function (it) {
        const o = { exerciseId: it.exerciseId, sets: it.sets || 3 };
        if (num(it.targetReps) > 0) o.targetReps = it.targetReps;
        if (num(it.targetHoldSec) > 0) o.targetHoldSec = it.targetHoldSec;
        if (num(it.targetDistanceM) > 0) o.targetDistanceM = it.targetDistanceM;
        if (it.weightHint) o.note = it.weightHint;
        return o;
      })
    };
  };

  // Inline routine from a saved workout — powers 'Repeat last, guided'.
  Player.routineFromWorkout = function (w) {
    if (!w) return null;
    const items = [];
    let circuit = null;
    (w.entries || []).forEach(function (en) {
      if (!en) return;
      if (en.type === 'cardio' && en.mode === 'circuit') { circuit = en; return; }
      if (en.type === 'setwork' && en.exerciseRef) {
        const ex = exOf(en.exerciseRef);
        const sets = (en.sets || []).filter(function (s) {
          return s && (num(s.reps) > 0 || num(s.holdSec) > 0 || num(s.distanceM) > 0);
        });
        if (!sets.length) return;
        const perSide = !!(ex && ex.perSide);
        const item = {
          exerciseId: en.exerciseRef,
          sets: Math.max(1, perSide ? Math.round(sets.length / 2) : sets.length)
        };
        const first = sets[0];
        if (num(first.holdSec) > 0) item.targetHoldSec = Math.round(num(first.holdSec));
        if (num(first.reps) > 0) item.targetReps = Math.round(num(first.reps));
        if (num(first.distanceM) > 0) item.targetDistanceM = Math.round(num(first.distanceM));
        if (num(first.weightKg) > 0) item.targetWeightKg = num(first.weightKg);
        if (METHODS.indexOf(en.method) >= 0) item.method = en.method;
        items.push(item);
        return;
      }
      if (en.exerciseId && !en.type) {
        // legacy-shaped lift entry (no type key)
        const ls = (en.sets || []).filter(function (s) { return s && num(s.reps) > 0; });
        if (!ls.length) return;
        const item = { exerciseId: en.exerciseId, sets: ls.length };
        item.targetReps = Math.round(num(ls[0].reps));
        if (num(ls[0].weightKg) > 0) item.targetWeightKg = num(ls[0].weightKg);
        items.push(item);
        return;
      }
      if (en.exerciseId && en.type === 'lift') {
        const ls2 = (en.sets || []).filter(function (s) { return s && num(s.reps) > 0; });
        if (!ls2.length) return;
        const item2 = { exerciseId: en.exerciseId, sets: ls2.length };
        item2.targetReps = Math.round(num(ls2[0].reps));
        if (num(ls2[0].weightKg) > 0) item2.targetWeightKg = num(ls2[0].weightKg);
        items.push(item2);
      }
    });
    if (circuit) {
      const r = {
        name: w.name || 'Circuit',
        kind: 'circuit',
        restSec: 0,
        items: (circuit.stations || []).map(function (st) {
          const it = { sets: 1 };
          if (st.exerciseId) it.exerciseId = st.exerciseId;
          if (st.name) it.name = st.name;
          if (num(st.reps) > 0) it.targetReps = st.reps;
          if (num(st.durationSec) > 0) it.targetHoldSec = st.durationSec;
          if (num(st.weightKg) > 0) it.targetWeightKg = st.weightKg;
          return it;
        })
      };
      if (num(circuit.rounds) > 0) r.rounds = Math.round(num(circuit.rounds));
      return r;
    }
    if (!items.length) return null;
    return { name: w.name || 'Session', kind: 'custom', restSec: 60, items: items };
  };

  /* ======================================================================
     Hardware — every capability optional, feature-detected, try/catch
     ====================================================================== */

  let wakeLock = null;

  function acquireWake() {
    try {
      if (navigator.wakeLock && typeof navigator.wakeLock.request === 'function') {
        navigator.wakeLock.request('screen').then(function (wl) {
          wakeLock = wl;
        }).catch(function () { /* denied / unsupported — fine */ });
      }
    } catch (e) { /* silently absent */ }
  }

  function releaseWake() {
    try {
      if (wakeLock && typeof wakeLock.release === 'function') {
        wakeLock.release().catch(function () { /* already gone */ });
      }
    } catch (e) { /* ignore */ }
    wakeLock = null;
  }

  function vibrate(pattern) {
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (e) { /* ignore */ }
  }

  // WebAudio beep — context created lazily on the first user gesture inside
  // the overlay (autoplay policy). No audio assets.
  let audioCtx = null;

  function ensureAudio() {
    if (audioCtx) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    } catch (e) { audioCtx = null; }
  }

  function beepTone(freq, atMs, durMs) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const t0 = audioCtx.currentTime + atMs / 1000;
    const t1 = t0 + durMs / 1000;
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.28, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t1);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t1 + 0.02);
  }

  function beep(kind) {
    try {
      if (!audioCtx) return;
      if (audioCtx.state === 'suspended') audioCtx.resume();
      if (kind === 'rest') {
        beepTone(660, 0, 140);
      } else if (kind === 'finish') {
        beepTone(660, 0, 120);
        beepTone(880, 160, 120);
        beepTone(1100, 320, 200);
      } else { // 'work' — end of a hold
        beepTone(880, 0, 120);
        beepTone(880, 180, 160);
      }
    } catch (e) { /* ignore */ }
  }

  function voiceOn() {
    const u = user();
    return !(u && u.settings && u.settings.playerVoice === 'off'); // 'on' default
  }

  function speak(text) {
    if (!voiceOn()) return;
    try {
      if (!('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance !== 'function') return;
      const ut = new SpeechSynthesisUtterance(text);
      ut.rate = 1.0;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(ut);
    } catch (e) { /* voice is never required for flow */ }
  }

  /* ======================================================================
     Session persistence — localStorage 'ironlog/activeSession'
     ====================================================================== */

  function readPending() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      const p = JSON.parse(raw);
      if (!p || typeof p !== 'object' || !p.routine || typeof p.startedAt !== 'number') return null;
      return p;
    } catch (e) { return null; }
  }

  function writePending(S) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        v: 1,
        userId: S.userId,
        name: S.name,
        routineRef: S.routineRef || null,
        routine: S.routine,
        stepIdx: S.stepIdx,
        actuals: S.actuals,
        stickyDepth: S.stickyDepth,
        roundsDone: S.roundsDone,
        stationIdx: S.stationIdx,
        startedAt: S.startedAt,
        updatedAt: Date.now()
      }));
    } catch (e) { /* storage full/unavailable — session keeps running in memory */ }
  }

  function clearPending() {
    try { localStorage.removeItem(LS_KEY); } catch (e) { /* ignore */ }
  }

  // App-boot hook: pending session info (or null). The boot wiring offers
  // Resume/Discard and calls Player.resume() / Player.discardPending().
  Player.resumePending = function () {
    const p = readPending();
    if (!p) return null;
    return {
      userId: p.userId || null,
      name: p.name || (p.routine && p.routine.name) || 'Guided session',
      startedAt: p.startedAt,
      stepIdx: p.stepIdx || 0,
      updatedAt: p.updatedAt || p.startedAt
    };
  };

  Player.discardPending = function () { clearPending(); };

  Player.resume = function () {
    const p = readPending();
    if (!p) return false;
    if (S) return false;
    return startSession(p.routine, {
      routineRef: p.routineRef,
      name: p.name,
      resume: p
    });
  };

  /* ======================================================================
     Runtime state
     ====================================================================== */

  let S = null;         // active session (null = idle)
  let root = null;      // overlay element
  let tickIv = null;
  let chromePrev = null;

  Player.isActive = function () { return !!S; };

  function onVisibility() {
    if (!S) return;
    if (document.visibilityState === 'visible') acquireWake(); // re-acquire (iOS drops it)
    writePending(S);
  }

  function onHashChange() {
    // Contract: navigation while a session is active pauses — never destroys.
    if (S && S.counting && !S.paused) togglePause(true);
  }

  function onKeydown(e) {
    if (!S || e.key !== 'Escape') return;
    // App overlays (confirm/sheets) sit above the player and own Escape.
    if (document.querySelector('.modal-backdrop')) return;
    e.preventDefault();
    quitSession();
  }

  function hideChrome() {
    chromePrev = [];
    ['#topbar', '#sidebar', '#tabbar'].forEach(function (sel) {
      const el = U.$(sel);
      if (el) { chromePrev.push([el, el.style.display]); el.style.display = 'none'; }
    });
    const app = U.$('#app');
    if (app) {
      chromePrev.push([app, null]);
      app.style.paddingLeft = '0';
      app.style.paddingBottom = '0';
    }
  }

  function restoreChrome() {
    (chromePrev || []).forEach(function (pair) {
      if (pair[1] === null) {
        pair[0].style.paddingLeft = '';
        pair[0].style.paddingBottom = '';
      } else {
        pair[0].style.display = pair[1] || '';
      }
    });
    chromePrev = null;
  }

  /* ======================================================================
     Start / stop
     ====================================================================== */

  Player.start = function (routine, opts) {
    opts = opts || {};
    if (S) { toast('A guided session is already running'); return false; }
    const u = user();
    if (!u) { toast('Create a profile first', 'err'); return false; }
    if (!perfMode(u)) { toast('Guided sessions live in Performance mode', 'err'); return false; }
    return startSession(routine, opts);
  };

  function startSession(routine, opts) {
    if (!routine) return false;
    const compiled = Player.compile(routine);
    if (compiled.kind === 'steps' && !compiled.steps.length) {
      toast('This routine has nothing to run yet', 'err');
      return false;
    }
    if (compiled.kind === 'circuit' && !compiled.stations.length) {
      toast('Add at least one station first', 'err');
      return false;
    }
    const resume = opts.resume || null;
    const u = user();
    S = {
      userId: (resume && resume.userId) || (u && u.id) || null,
      routine: routine,
      routineRef: opts.routineRef || null,
      name: opts.name || routine.name || 'Guided session',
      compiled: compiled,
      stepIdx: 0,
      actuals: [],
      stickyDepth: {},
      startedAt: (resume && resume.startedAt) || Date.now(),
      // countdown machinery
      counting: false, paused: false, endsAt: 0, totalSec: 0, remainMsAtPause: 0,
      saidTen: false,
      lastDone: null,          // {itemIdx, setPos} of the just-finished stretch set
      // circuit machinery
      roundsDone: 0, stationIdx: 0,
      finished: false
    };
    (Array.isArray(routine.items) ? routine.items : []).forEach(function () {
      S.actuals.push({ sets: [] });
    });
    if (resume) {
      if (Array.isArray(resume.actuals)) {
        resume.actuals.forEach(function (a, i) {
          if (a && Array.isArray(a.sets) && S.actuals[i]) S.actuals[i].sets = a.sets;
        });
      }
      if (resume.stickyDepth && typeof resume.stickyDepth === 'object') S.stickyDepth = resume.stickyDepth;
      if (compiled.kind === 'steps') {
        S.stepIdx = Math.min(Math.max(0, Math.round(num(resume.stepIdx))), compiled.steps.length);
      }
      S.roundsDone = Math.max(0, Math.round(num(resume.roundsDone)));
      S.stationIdx = Math.max(0, Math.round(num(resume.stationIdx)));
    }
    openOverlay();
    writePending(S);
    if (compiled.kind === 'circuit') renderCircuit();
    else if (S.stepIdx >= compiled.steps.length) showSummary();
    else renderStep();
    return true;
  }

  function closePlayer() {
    if (tickIv) { clearInterval(tickIv); tickIv = null; }
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('hashchange', onHashChange);
    document.removeEventListener('keydown', onKeydown, true);
    releaseWake();
    try {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    } catch (e) { /* ignore */ }
    if (root) { root.remove(); root = null; }
    restoreChrome();
    document.body.style.overflow = '';
    S = null;
  }

  /* ======================================================================
     Overlay skeleton
     ====================================================================== */

  function svgI(inner) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" ' +
      'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
  }

  const VOICE_ON_ICON = svgI('<path d="M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.4 5.6a9 9 0 0 1 0 12.8"/>');
  const VOICE_OFF_ICON = svgI('<path d="M11 5 6 9H3v6h3l5 4zM16 9.8l4.4 4.4M20.4 9.8 16 14.2"/>');

  function openOverlay() {
    root = U.el(
      '<div class="player-overlay" role="dialog" aria-modal="true" aria-label="Guided session">' +
        '<div class="player-top">' +
          '<button type="button" class="player-x" data-p="quit" aria-label="End session">' +
            (ic().close || '✕') + '</button>' +
          '<div class="player-meta">' +
            '<div class="nm"></div>' +
            '<div class="sub" data-p="sub"></div>' +
          '</div>' +
          '<button type="button" class="player-x" data-p="voice" aria-label="Toggle voice cues" aria-pressed="false"></button>' +
        '</div>' +
        '<div class="player-rail"><div class="fill" data-p="rail"></div></div>' +
        '<div class="player-stage" data-p="stage"></div>' +
        '<div class="player-foot" data-p="foot"></div>' +
      '</div>');
    root.querySelector('.player-meta .nm').textContent = S.name;
    document.body.appendChild(root);
    document.body.style.overflow = 'hidden';
    hideChrome();
    paintVoiceBtn();

    // wire top bar
    U.on(root, 'click', '[data-p="quit"]', function () { quitSession(); });
    U.on(root, 'click', '[data-p="voice"]', function () {
      const u = user();
      const next = voiceOn() ? 'off' : 'on';
      if (u && window.Store && Store.updateUser) {
        Store.updateUser(u.id, { settings: { playerVoice: next } });
      }
      paintVoiceBtn();
      toast(next === 'on' ? 'Voice cues on' : 'Voice cues muted');
    });
    // audio context needs a user gesture — any tap inside the overlay arms it
    root.addEventListener('pointerdown', ensureAudio);

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('hashchange', onHashChange);
    document.addEventListener('keydown', onKeydown, true);
    acquireWake();
    if (tickIv) clearInterval(tickIv);
    tickIv = setInterval(tick, 250);
  }

  function paintVoiceBtn() {
    if (!root) return;
    const b = root.querySelector('[data-p="voice"]');
    if (!b) return;
    const on = voiceOn();
    b.innerHTML = on ? VOICE_ON_ICON : VOICE_OFF_ICON;
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.classList.toggle('muted', !on);
  }

  function stageEl() { return root ? root.querySelector('[data-p="stage"]') : null; }
  function footEl() { return root ? root.querySelector('[data-p="foot"]') : null; }

  // Every screen render REPLACES the stage/foot nodes so the previous step's
  // delegated listeners die with them. Without this they accumulate on the
  // persistent elements and a tap replays stale closures (e.g. a ring tap on
  // step 3 recording a ghost set for step 1's exercise).
  function resetStageFoot() {
    if (!root) return;
    ['stage', 'foot'].forEach(function (key) {
      const el = root.querySelector('[data-p="' + key + '"]');
      if (!el || !el.parentNode) return;
      el.parentNode.replaceChild(el.cloneNode(false), el);
    });
  }

  function setSub(text) {
    const el = root && root.querySelector('[data-p="sub"]');
    if (el) el.textContent = text;
  }

  function setRail(frac, blue) {
    const el = root && root.querySelector('[data-p="rail"]');
    if (!el) return;
    el.style.width = Math.round(U.clamp(frac, 0, 1) * 100) + '%';
    el.style.background = blue ? 'var(--blue)' : 'var(--accent)';
  }

  /* ======================================================================
     Step bookkeeping
     ====================================================================== */

  function steps() { return S.compiled.steps; }

  function curStep() { return steps()[S.stepIdx] || null; }

  function nextWorkStep(fromIdx) {
    const st = steps();
    for (let i = fromIdx; i < st.length; i++) {
      if (st[i].type === 'work') return st[i];
    }
    return null;
  }

  function workOrdinal() {
    // 1-based ordinal of the current work step ('n of m'); during rest, the
    // ordinal of the next one.
    const st = steps();
    let n = 0;
    for (let i = 0; i < S.stepIdx && i < st.length; i++) {
      if (st[i].type === 'work') n++;
    }
    const cur = curStep();
    if (cur && cur.type === 'work') n++;
    else n = Math.min(n + 1, S.compiled.workCount);
    return Math.max(1, n);
  }

  function remainingEstSec() {
    const st = steps();
    let sec = 0;
    for (let i = S.stepIdx; i < st.length; i++) {
      if (i === S.stepIdx && S.counting) {
        sec += Math.max(0, Math.round((S.endsAt - Date.now()) / 1000));
      } else {
        sec += stepEstimateSec(st[i]);
      }
    }
    return sec;
  }

  function updateHeader() {
    if (S.compiled.kind === 'circuit') return;
    const mins = Math.max(1, Math.round(remainingEstSec() / 60));
    setSub(workOrdinal() + ' of ' + S.compiled.workCount + ' · ~' + mins + ' min left');
    const done = S.stepIdx;
    setRail(steps().length ? done / steps().length : 0, curStep() && curStep().type === 'rest');
  }

  function itemOf(step) {
    const items = Array.isArray(S.routine.items) ? S.routine.items : [];
    return items[step.entryIdx] || null;
  }

  function targetLabel(step) {
    const bits = [];
    if (step.shape === 'hold') bits.push(fmtClock(step.targetSec > 0 ? step.targetSec : DEFAULT_HOLD_SEC));
    if (step.targetReps > 0 && step.shape !== 'hold') bits.push('× ' + step.targetReps);
    if (step.targetM > 0) bits.push(step.targetM + ' m');
    if (step.targetKg > 0) bits.push('@ ' + fmtWeight(step.targetKg));
    return bits.join(' ');
  }

  // 'Last time' line from the user's history (setwork first, lifts for
  // weight_reps items) — mirrors the builder's PREV hints, side-aware.
  function lastTimeText(step) {
    if (!window.Store || !Store.workoutsFor || !S.userId) return '';
    const ws = Store.workoutsFor(S.userId);
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i];
      const sets = [];
      let lift = false;
      (w.entries || []).forEach(function (en) {
        if (!en) return;
        if (en.type === 'setwork' && en.exerciseRef === step.exerciseId) {
          (en.sets || []).forEach(function (s) { sets.push(s); });
        } else if (en.exerciseId === step.exerciseId && (!en.type || en.type === 'lift')) {
          lift = true;
          (en.sets || []).forEach(function (s) { sets.push(s); });
        }
      });
      if (!sets.length) continue;
      let pick = sets[0];
      if (step.side) {
        for (let j = 0; j < sets.length; j++) {
          if (sets[j].side === step.side) { pick = sets[j]; break; }
        }
      }
      const bits = [];
      if (lift) {
        if (num(pick.weightKg) > 0) bits.push(fmtWeight(pick.weightKg));
        if (num(pick.reps) > 0) bits.push('× ' + pick.reps);
      } else {
        if (num(pick.holdSec) > 0) bits.push(fmtClock(pick.holdSec));
        if (num(pick.reps) > 0) bits.push('× ' + pick.reps);
        if (num(pick.distanceM) > 0) bits.push(Math.round(pick.distanceM) + ' m');
        if (num(pick.weightKg) > 0) bits.push('@ ' + fmtWeight(pick.weightKg));
      }
      if (!bits.length) return '';
      return 'Last time: ' + bits.join(' ');
    }
    return '';
  }

  /* ======================================================================
     Step renderers
     ====================================================================== */

  function sideBadge(step) {
    if (!step.side) return '';
    return '<div class="player-side-badge">' + (step.side === 'L' ? 'LEFT' : 'RIGHT') + '</div>';
  }

  function ringHTML(sizePx, radius, stroke, color, asButton) {
    const c = 2 * Math.PI * radius;
    const cx = sizePx / 2;
    const svg =
      '<svg width="' + sizePx + '" height="' + sizePx + '" viewBox="0 0 ' + sizePx + ' ' + sizePx + '">' +
        '<circle cx="' + cx + '" cy="' + cx + '" r="' + radius + '" stroke="rgba(255,255,255,.09)" stroke-width="' + stroke + '" fill="none"/>' +
        '<circle class="ring-arc" cx="' + cx + '" cy="' + cx + '" r="' + radius + '" stroke="' + color + '" stroke-width="' + stroke + '" fill="none" ' +
          'stroke-linecap="round" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="0"/>' +
      '</svg>';
    const inner =
      svg +
      '<div class="ring-time"><div class="big" data-p="clock">0:00</div><div class="of" data-p="of"></div></div>';
    if (asButton) {
      return '<button type="button" class="player-ring" style="width:' + sizePx + 'px;height:' + sizePx + 'px" ' +
        'data-p="ring" aria-label="Complete this hold now">' + inner + '</button>';
    }
    return '<div class="player-ring" style="width:' + sizePx + 'px;height:' + sizePx + 'px">' + inner + '</div>';
  }

  function nextStripHTML() {
    const nx = nextWorkStep(S.stepIdx + 1);
    if (!nx) return '<div class="player-next"><span class="lbl">NEXT</span><span>Finish 🎉</span></div>';
    const cur = curStep();
    const sameOtherSide = cur && cur.type === 'work' && nx.entryIdx === cur.entryIdx &&
      nx.setIdx === cur.setIdx && nx.side && cur.side && nx.side !== cur.side;
    const label = sameOtherSide
      ? exName(nx.exerciseId) + ' — ' + (nx.side === 'L' ? 'left' : 'right') + ' side'
      : exName(nx.exerciseId);
    return '<div class="player-next"><span class="lbl">NEXT</span>' +
      '<span class="nm">' + U.esc(label) + '</span>' +
      '<span class="tg">' + U.esc(targetLabel(nx)) + '</span></div>';
  }

  function startCountdown(sec) {
    S.counting = true;
    S.paused = false;
    S.totalSec = sec;
    S.endsAt = Date.now() + sec * 1000;
    S.saidTen = false;
  }

  function stopCountdown() {
    S.counting = false;
    S.paused = false;
  }

  function renderStep() {
    const step = curStep();
    if (!step) { showSummary(); return; }
    resetStageFoot();
    S.lastDoneVisible = false;
    if (step.type === 'rest') renderRest(step);
    else if (step.shape === 'hold') renderHold(step);
    else renderRepsLike(step);
    updateHeader();
  }

  /* ---------- hold ---------- */

  function renderHold(step) {
    const stage = stageEl();
    const foot = footEl();
    const item = itemOf(step);
    const stretch = item ? itemIsStretch(item) : false;
    const target = step.targetSec > 0 ? step.targetSec : DEFAULT_HOLD_SEC;
    startCountdown(target);

    let aim = '';
    if (stretch) {
      const d = DEPTHS[(S.stickyDepth[step.entryIdx] || 2) - 1];
      aim = 'Aim: <b>' + U.esc(d.label) + ' depth</b> — ' + U.esc(d.aim);
    } else if (step.targetKg > 0) {
      aim = 'Load: <b>' + U.esc(fmtWeight(step.targetKg)) + '</b>';
    }
    const last = lastTimeText(step);

    stage.innerHTML =
      '<div class="player-ex-name">' + U.esc(exName(step.exerciseId)) + '</div>' +
      sideBadge(step) +
      ringHTML(208, 94, 10, 'var(--accent)', true) +
      (aim ? '<div class="player-aim">' + aim + '</div>' : '') +
      (last ? '<div class="player-aim muted">' + U.esc(last) + '</div>' : '') +
      '<div class="player-adjust">' +
        '<button type="button" class="pm" data-p="minus">−15s</button>' +
        '<button type="button" class="pause" data-p="pause" aria-label="Pause">⏸</button>' +
        '<button type="button" class="pm" data-p="plus">+15s</button>' +
      '</div>';
    foot.innerHTML = nextStripHTML();

    U.on(stage, 'click', '[data-p="ring"]', function () {
      // completing early records the ACTUAL elapsed seconds — never the plan
      const remain = S.paused
        ? Math.round(S.remainMsAtPause / 1000)
        : Math.max(0, Math.round((S.endsAt - Date.now()) / 1000));
      const elapsed = Math.max(1, S.totalSec - remain);
      completeHold(step, elapsed);
    });
    U.on(stage, 'click', '[data-p="pause"]', function () { togglePause(); });
    U.on(stage, 'click', '[data-p="minus"]', function () { adjustHold(-15); });
    U.on(stage, 'click', '[data-p="plus"]', function () { adjustHold(15); });
    paintCountdown();
  }

  function adjustHold(deltaSec) {
    if (!S.counting) return;
    // −15s/+15s adjusts the CURRENT step target; never below 5s total or 1s left
    const newTotal = Math.max(5, S.totalSec + deltaSec);
    const applied = newTotal - S.totalSec;
    if (!applied) return;
    S.totalSec = newTotal;
    if (S.paused) S.remainMsAtPause = Math.max(1000, S.remainMsAtPause + applied * 1000);
    else S.endsAt = Math.max(Date.now() + 1000, S.endsAt + applied * 1000);
    paintCountdown();
  }

  function togglePause(force) {
    if (!S.counting) return;
    const wantPause = force === true ? true : !S.paused;
    if (wantPause === S.paused) return;
    if (wantPause) {
      S.remainMsAtPause = Math.max(0, S.endsAt - Date.now());
      S.paused = true;
    } else {
      S.endsAt = Date.now() + S.remainMsAtPause;
      S.paused = false;
    }
    const b = root && root.querySelector('[data-p="pause"]');
    if (b) {
      b.textContent = S.paused ? '▶' : '⏸';
      b.setAttribute('aria-label', S.paused ? 'Resume' : 'Pause');
    }
  }

  function completeHold(step, actualSec) {
    stopCountdown();
    recordWork(step, { holdSec: actualSec });
    vibrate([180, 90, 180]);
    beep('work');
    cueAfterWork(step);
    advance();
  }

  /* ---------- reps / weight_reps / carry ---------- */

  function renderRepsLike(step) {
    const stage = stageEl();
    const foot = footEl();
    stopCountdown();
    const item = itemOf(step);
    const last = lastTimeText(step);

    // current editable actuals (start from targets)
    const cur = {
      reps: step.targetReps > 0 ? step.targetReps : (step.shape === 'carry' ? 0 : 8),
      kg: step.targetKg > 0 ? step.targetKg : 0,
      m: step.targetM > 0 ? step.targetM : (step.shape === 'carry' ? 40 : 0)
    };
    S.curVals = cur;

    let big = '';
    if (step.shape === 'carry') big = '<span data-b="m">' + cur.m + '</span> m';
    else big = '× <span data-b="reps">' + cur.reps + '</span>';

    function stepperHTML(id, label) {
      return '<div class="player-stepper">' +
        '<span class="lb">' + U.esc(label) + '</span>' +
        '<button type="button" class="btn icon ghost" data-s="' + id + ':-">−</button>' +
        '<span class="val" data-v="' + id + '"></span>' +
        '<button type="button" class="btn icon ghost" data-s="' + id + ':+">+</button>' +
      '</div>';
    }

    let steppers = '';
    if (step.shape !== 'carry') steppers += stepperHTML('reps', 'Reps');
    if (step.shape === 'carry') steppers += stepperHTML('m', 'Meters');
    if (step.shape === 'weight_reps' || step.shape === 'carry' || cur.kg > 0) {
      steppers += stepperHTML('kg', 'Weight');
    }

    stage.innerHTML =
      '<div class="player-ex-name">' + U.esc(exName(step.exerciseId)) + '</div>' +
      sideBadge(step) +
      '<div class="player-big-target">' + big + '</div>' +
      (step.targetKg > 0 ? '<div class="player-aim">@ <b>' + U.esc(fmtWeight(step.targetKg)) + '</b></div>' : '') +
      (last ? '<div class="player-aim muted">' + U.esc(last) + '</div>' : '') +
      ((item && item.note) ? '<div class="player-aim muted">' + U.esc(item.note) + '</div>' : '') +
      '<div class="player-steppers">' + steppers + '</div>';
    foot.innerHTML =
      '<button type="button" class="player-bigbtn" data-p="done">Done ✓</button>' +
      nextStripHTML();

    function paintVals() {
      const map = { reps: String(cur.reps), m: cur.m + '', kg: String(kgToDisplay(cur.kg)) };
      U.$$('[data-v]', stage).forEach(function (el) {
        el.textContent = map[el.getAttribute('data-v')] || '0';
      });
      const bigReps = stage.querySelector('[data-b="reps"]');
      if (bigReps) bigReps.textContent = String(cur.reps);
      const bigM = stage.querySelector('[data-b="m"]');
      if (bigM) bigM.textContent = String(cur.m);
    }

    U.on(stage, 'click', '[data-s]', function (e, b) {
      const parts = b.getAttribute('data-s').split(':');
      const dir = parts[1] === '+' ? 1 : -1;
      if (parts[0] === 'reps') cur.reps = U.clamp(cur.reps + dir, 1, 200);
      else if (parts[0] === 'm') cur.m = U.clamp(cur.m + dir * 5, 5, 2000);
      else if (parts[0] === 'kg') {
        const stepDisp = 2.5; // display units — familiar plate math in lb or kg
        const disp = Math.max(0, kgToDisplay(cur.kg) + dir * stepDisp);
        cur.kg = displayToKg(disp);
      }
      paintVals();
    });

    U.on(foot, 'click', '[data-p="done"]', function () {
      const vals = {};
      if (step.shape === 'carry') {
        vals.distanceM = cur.m;
        if (cur.kg > 0) vals.weightKg = cur.kg;
      } else {
        vals.reps = cur.reps;
        if (cur.kg > 0) vals.weightKg = cur.kg;
      }
      recordWork(step, vals);
      vibrate(60);
      cueAfterWork(step);
      advance();
    });

    paintVals();
  }

  /* ---------- rest ---------- */

  function renderRest(step) {
    const stage = stageEl();
    const foot = footEl();
    startCountdown(step.sec);

    // one-tap stretch-depth ask for the set that just finished
    let depthAsk = '';
    if (S.lastDone && S.lastDone.stretch) {
      const cur = S.actuals[S.lastDone.itemIdx];
      const s = cur && cur.sets[S.lastDone.setPos];
      const selected = s && s.intensity >= 1 ? s.intensity : (S.stickyDepth[S.lastDone.itemIdx] || 2);
      depthAsk =
        '<div class="card player-ask">' +
          '<div class="lbl">THAT ' + U.esc(exName(S.lastDone.exerciseId).toUpperCase()) + ' — HOW DEEP DID IT FEEL?</div>' +
          '<div class="segmented block player-depth">' +
            DEPTHS.map(function (d) {
              return '<button type="button" data-depth="' + d.n + '"' +
                (d.n === selected ? ' class="active"' : '') + '>' + d.n + ' · ' + d.label + '</button>';
            }).join('') +
          '</div>' +
        '</div>';
    }

    const nx = nextWorkStep(S.stepIdx + 1);
    let nextCard = '';
    if (nx) {
      const lt = lastTimeText(nx);
      nextCard =
        '<div class="card player-ask">' +
          '<div class="lbl">NEXT UP</div>' +
          '<div class="nx">' + U.esc(exName(nx.exerciseId)) +
            (nx.side ? ' — ' + (nx.side === 'L' ? 'left' : 'right') : '') +
            (targetLabel(nx) ? ' · ' + U.esc(targetLabel(nx)) : '') + '</div>' +
          (lt ? '<div class="sub">' + U.esc(lt) + '</div>' : '') +
        '</div>';
    }

    stage.innerHTML =
      '<div class="player-phase-lbl">REST</div>' +
      ringHTML(164, 72, 9, 'var(--blue)', false) +
      depthAsk + nextCard;
    foot.innerHTML = '<button type="button" class="player-bigbtn ghost" data-p="skip">Skip rest →</button>';

    U.on(stage, 'click', '[data-depth]', function (e, b) {
      const n = U.clamp(parseInt(b.getAttribute('data-depth'), 10) || 2, 1, 4);
      if (S.lastDone) {
        const a = S.actuals[S.lastDone.itemIdx];
        const set = a && a.sets[S.lastDone.setPos];
        if (set) set.intensity = n; // writes intensity onto the just-finished set
        S.stickyDepth[S.lastDone.itemIdx] = n;
        writePending(S);
      }
      U.$$('[data-depth]', stage).forEach(function (c) {
        c.classList.toggle('active', c === b);
      });
    });
    U.on(foot, 'click', '[data-p="skip"]', function () { finishRest(true); });
    paintCountdown();
  }

  function finishRest(skipped) {
    stopCountdown();
    if (!skipped) {
      vibrate([90]); // distinct from the end-of-hold pattern
      beep('rest');
      const nx = nextWorkStep(S.stepIdx + 1);
      if (nx) speak(exName(nx.exerciseId));
    }
    advance();
  }

  /* ---------- shared countdown tick ---------- */

  function paintCountdown() {
    if (!root || !S || !S.counting) return;
    const clock = root.querySelector('[data-p="clock"]');
    const of = root.querySelector('[data-p="of"]');
    const arc = root.querySelector('.ring-arc');
    const remainMs = S.paused ? S.remainMsAtPause : S.endsAt - Date.now();
    const remain = Math.max(0, Math.ceil(remainMs / 1000));
    if (clock) clock.textContent = fmtClock(remain);
    if (of) of.textContent = S.totalSec > 0 ? 'of ' + fmtClock(S.totalSec) : '';
    if (arc) {
      const c = parseFloat(arc.getAttribute('stroke-dasharray')) || 0;
      const frac = S.totalSec > 0 ? U.clamp(remainMs / (S.totalSec * 1000), 0, 1) : 0;
      arc.setAttribute('stroke-dashoffset', String((c * (1 - frac)).toFixed(1)));
    }
  }

  function tick() {
    if (!S || !root) return;
    if (S.compiled.kind === 'circuit') { tickCircuit(); return; }
    if (!S.counting || S.paused) return;
    const remainMs = S.endsAt - Date.now();
    const step = curStep();
    if (!step) return;
    // 'last ten seconds' voice cue — holds long enough for it to mean anything
    if (!S.saidTen && step.type === 'work' && step.shape === 'hold' &&
        S.totalSec >= 20 && remainMs <= 10400 && remainMs > 8000) {
      S.saidTen = true;
      speak('last ten seconds');
    }
    if (remainMs <= 0) {
      if (step.type === 'rest') { finishRest(false); return; }
      if (step.shape === 'hold') { completeHold(step, S.totalSec); return; }
    }
    paintCountdown();
    updateHeader();
  }

  /* ---------- recording + advancing ---------- */

  function recordWork(step, vals) {
    const a = S.actuals[step.entryIdx] ||
      (S.actuals[step.entryIdx] = { sets: [] });
    const item = itemOf(step);
    const stretch = item ? itemIsStretch(item) : false;
    const set = {};
    if (num(vals.holdSec) > 0) set.holdSec = Math.round(num(vals.holdSec));
    if (num(vals.reps) > 0) set.reps = Math.round(num(vals.reps));
    if (num(vals.distanceM) > 0) set.distanceM = Math.round(num(vals.distanceM));
    if (num(vals.weightKg) > 0) set.weightKg = num(vals.weightKg);
    else if (step.targetKg > 0 && step.shape === 'hold') set.weightKg = step.targetKg;
    if (step.side) set.side = step.side;
    if (stretch) set.intensity = S.stickyDepth[step.entryIdx] || 2;
    a.sets.push(set);
    S.lastDone = {
      itemIdx: step.entryIdx,
      setPos: a.sets.length - 1,
      exerciseId: step.exerciseId,
      stretch: stretch
    };
  }

  function cueAfterWork(step) {
    const nx = nextWorkStep(S.stepIdx + 1);
    if (!nx) { speak('all done'); return; }
    const immediate = steps()[S.stepIdx + 1] && steps()[S.stepIdx + 1].type === 'work';
    const sameOtherSide = nx.entryIdx === step.entryIdx && nx.setIdx === step.setIdx &&
      nx.side && step.side && nx.side !== step.side;
    if (sameOtherSide) speak('switch sides');
    else if (immediate) speak(exName(nx.exerciseId));
    // otherwise the rest screen stages it and the rest-end cue names it
  }

  function advance() {
    S.stepIdx++;
    S.lastDone = S.lastDone || null;
    writePending(S);
    if (S.stepIdx >= steps().length) { showSummary(); return; }
    renderStep();
  }

  /* ======================================================================
     Circuit round player
     ====================================================================== */

  function renderCircuit() {
    const c = S.compiled;
    resetStageFoot();
    const stage = stageEl();
    const foot = footEl();
    setSub(c.amrapSec ? 'AMRAP · ' + fmtClock(c.amrapSec) : 'Circuit · ' + c.rounds + ' rounds');

    function stationRow(st, i) {
      const nm = st.exerciseId ? exName(st.exerciseId) : (st.name || 'Station');
      const bits = [];
      if (st.reps > 0) bits.push('× ' + st.reps);
      if (st.durationSec > 0) bits.push(fmtClock(st.durationSec));
      if (st.weightKg > 0) bits.push('@ ' + fmtWeight(st.weightKg));
      const done = i < S.stationIdx;
      const cur = i === S.stationIdx;
      return '<button type="button" class="player-station' + (done ? ' done' : '') + (cur ? ' cur' : '') +
        '" data-st="' + i + '">' +
        (done ? '<span class="ck">' + (ic().check || '✓') + '</span>' : (cur ? '<span class="ck">→</span>' : '')) +
        '<span class="nm">' + U.esc(nm) + '</span>' +
        (bits.length ? '<span class="n">' + U.esc(bits.join(' · ')) + '</span>' : '') +
      '</button>';
    }

    stage.innerHTML =
      '<div class="player-phase-lbl">ROUND</div>' +
      '<div class="player-round-num" data-p="round">' + (S.roundsDone + 1) + '</div>' +
      '<div class="player-aim muted" data-p="circlock"></div>' +
      '<div class="player-stations">' + c.stations.map(stationRow).join('') + '</div>';
    foot.innerHTML = '<button type="button" class="player-bigbtn" data-p="rounddone">Round done ✓</button>';

    U.on(stage, 'click', '[data-st]', function (e, b) {
      const i = parseInt(b.getAttribute('data-st'), 10) || 0;
      // tap the current station to advance past it; tap another to jump there
      if (i === S.stationIdx) S.stationIdx = Math.min(c.stations.length, S.stationIdx + 1);
      else S.stationIdx = i;
      if (S.stationIdx >= c.stations.length) { closeRound(); return; }
      writePending(S);
      renderCircuit();
    });
    U.on(foot, 'click', '[data-p="rounddone"]', function () { closeRound(); });
    tickCircuit();
  }

  function closeRound() {
    const c = S.compiled;
    S.roundsDone++;
    S.stationIdx = 0;
    vibrate([180, 90, 180]);
    beep('work');
    writePending(S);
    if (!c.amrapSec && S.roundsDone >= c.rounds) {
      beep('finish');
      showSummary();
      return;
    }
    speak('round ' + (S.roundsDone + 1));
    renderCircuit();
  }

  function tickCircuit() {
    if (!root || !S) return;
    const c = S.compiled;
    const el = root.querySelector('[data-p="circlock"]');
    const elapsedSec = Math.round((Date.now() - S.startedAt) / 1000);
    if (c.amrapSec) {
      const left = c.amrapSec - elapsedSec;
      if (left <= 0) {
        vibrate([120, 60, 120, 60, 240]);
        beep('finish');
        speak('time');
        showSummary();
        return;
      }
      if (el) el.textContent = fmtClock(left) + ' left · ' + fmtClock(elapsedSec) + ' in';
      setRail(elapsedSec / c.amrapSec, true);
    } else {
      if (el) el.textContent = fmtClock(elapsedSec) + ' in';
      setRail(c.rounds > 0 ? S.roundsDone / c.rounds : 0, true);
    }
  }

  /* ======================================================================
     Summary → save
     ====================================================================== */

  function completedItemIdxs() {
    const out = [];
    S.actuals.forEach(function (a, i) {
      if (a && a.sets.length) out.push(i);
    });
    return out;
  }

  function showSummary() {
    S.finished = true;
    stopCountdown();
    updateHeaderDone();
    resetStageFoot();
    const stage = stageEl();
    const foot = footEl();
    const items = Array.isArray(S.routine.items) ? S.routine.items : [];
    const isCircuit = S.compiled.kind === 'circuit';
    const durationMin = Math.max(1, Math.round((Date.now() - S.startedAt) / 60000));

    let entriesHTML = '';
    if (isCircuit) {
      const c = S.compiled;
      entriesHTML =
        '<div class="card player-sum-entry">' +
          '<div class="ti">Circuit</div>' +
          '<div class="player-sum-row">' +
            '<span class="lb">Rounds</span>' +
            '<input class="input" type="number" min="0" step="1" inputmode="numeric" data-sum="rounds" value="' + S.roundsDone + '">' +
          '</div>' +
          '<div class="sub">' + c.stations.map(function (st) {
            return U.esc(st.exerciseId ? exName(st.exerciseId) : (st.name || 'Station'));
          }).join(' · ') + '</div>' +
        '</div>';
    } else {
      completedItemIdxs().forEach(function (i) {
        const item = items[i] || {};
        const a = S.actuals[i];
        const stretch = item.exerciseId ? itemIsStretch(item) : false;
        let rows = '';
        a.sets.forEach(function (s, si) {
          let inputs = '';
          if (num(s.holdSec) > 0) {
            inputs += '<input class="input" data-sum="hold:' + i + ':' + si + '" value="' + fmtClock(s.holdSec) + '" inputmode="numeric" aria-label="Hold time">';
          }
          if (num(s.reps) > 0) {
            inputs += '<input class="input" type="number" min="0" step="1" inputmode="numeric" data-sum="reps:' + i + ':' + si + '" value="' + s.reps + '" aria-label="Reps">';
          }
          if (num(s.distanceM) > 0) {
            inputs += '<input class="input" type="number" min="0" step="5" inputmode="numeric" data-sum="m:' + i + ':' + si + '" value="' + s.distanceM + '" aria-label="Meters"><span class="un">m</span>';
          }
          if (num(s.weightKg) > 0 || itemShape(item) === 'weight_reps') {
            inputs += '<input class="input" type="number" min="0" step="0.5" inputmode="decimal" data-sum="kg:' + i + ':' + si + '" value="' + kgToDisplay(s.weightKg || 0) + '" aria-label="Weight"><span class="un">' +
              U.esc(window.App && App.units ? U.unitLabel(App.units()) : 'kg') + '</span>';
          }
          rows += '<div class="player-sum-row">' +
            '<span class="lb">' + (si + 1) + (s.side ? ' · ' + s.side : '') + '</span>' + inputs + '</div>';
        });
        entriesHTML +=
          '<div class="card player-sum-entry">' +
            '<div class="ti">' + U.esc(exName(item.exerciseId)) + '</div>' + rows +
            (stretch
              ? '<div class="segmented block player-depth" data-sumdepth="' + i + '">' +
                  DEPTHS.map(function (d) {
                    return '<button type="button" data-depth="' + d.n + '">' + d.n + ' · ' + d.label + '</button>';
                  }).join('') +
                '</div>'
              : '') +
          '</div>';
      });
    }

    const nothing = isCircuit ? S.roundsDone <= 0 : !completedItemIdxs().length;
    setSub('Session done · ' + U.fmtDuration(durationMin));
    setRail(1, false);

    stage.innerHTML =
      '<div class="player-ex-name" style="font-size:24px">' + (nothing ? 'Nothing recorded' : 'Nice work 💪') + '</div>' +
      '<div class="player-aim muted">' + U.esc(U.fmtDuration(durationMin)) + ' on the clock</div>' +
      (nothing
        ? '<div class="player-aim">No completed sets to save.</div>'
        : '<div class="field player-sum-name"><label for="pl-sum-name">Session name</label>' +
          '<input class="input" id="pl-sum-name" autocomplete="off" value="' + U.esc(S.name) + '"></div>' +
          '<div class="player-summary">' + entriesHTML + '</div>');
    foot.innerHTML = nothing
      ? '<button type="button" class="player-bigbtn ghost" data-p="close">Close</button>'
      : '<button type="button" class="player-bigbtn" data-p="save">Save session</button>';

    U.on(stage, 'click', '[data-sumdepth] [data-depth]', function (e, b) {
      const wrap = b.closest('[data-sumdepth]');
      const i = parseInt(wrap.getAttribute('data-sumdepth'), 10) || 0;
      const n = U.clamp(parseInt(b.getAttribute('data-depth'), 10) || 2, 1, 4);
      const a = S.actuals[i];
      if (a) a.sets.forEach(function (s) { s.intensity = n; });
      U.$$('[data-depth]', wrap).forEach(function (cbtn) { cbtn.classList.toggle('active', cbtn === b); });
    });
    U.on(stage, 'input', '[data-sum]', function (e, inp) { readSummaryInput(inp); });
    U.on(foot, 'click', '[data-p="close"]', function () {
      clearPending();
      closePlayer();
    });
    U.on(foot, 'click', '[data-p="save"]', function () { saveSession(); });
  }

  function updateHeaderDone() {
    setRail(1, false);
  }

  function readSummaryInput(inp) {
    const parts = inp.getAttribute('data-sum').split(':');
    if (parts[0] === 'rounds') {
      const n = Math.max(0, Math.round(num(inp.value)));
      S.roundsDone = n;
      return;
    }
    const i = parseInt(parts[1], 10);
    const si = parseInt(parts[2], 10);
    const a = S.actuals[i];
    const set = a && a.sets[si];
    if (!set) return;
    if (parts[0] === 'hold') {
      const sec = parseSec(inp.value);
      if (sec !== null) set.holdSec = Math.round(sec);
    } else if (parts[0] === 'reps') {
      set.reps = Math.max(0, Math.round(num(inp.value)));
    } else if (parts[0] === 'm') {
      set.distanceM = Math.max(0, Math.round(num(inp.value)));
    } else if (parts[0] === 'kg') {
      set.weightKg = Math.max(0, displayToKg(inp.value));
    }
  }

  // Actuals -> P3-shaped workout entries. Lift items become plain lift entries
  // (volume/PR credit); everything else becomes setwork. Sides only ever land
  // on setwork sets — lift sets stay exactly {weightKg, reps, type, rpe}.
  function buildEntries() {
    const entries = [];
    const items = Array.isArray(S.routine.items) ? S.routine.items : [];
    if (S.compiled.kind === 'circuit') {
      if (S.roundsDone > 0) {
        const durationMin = Math.max(1, Math.round((Date.now() - S.startedAt) / 60000));
        const en = {
          id: U.uid('en'),
          type: 'cardio',
          mode: 'circuit',
          durationMin: durationMin,
          rounds: S.roundsDone,
          stations: S.compiled.stations.map(function (st) {
            const c = {};
            for (const k in st) c[k] = st[k];
            return c;
          })
        };
        entries.push(en);
      }
      return entries;
    }
    completedItemIdxs().forEach(function (i) {
      const item = items[i];
      if (!item || !item.exerciseId) return;
      const a = S.actuals[i];
      if (itemIsLift(item)) {
        const sets = [];
        a.sets.forEach(function (s) {
          if (!(num(s.reps) > 0)) return;
          sets.push({
            weightKg: num(s.weightKg) > 0 ? num(s.weightKg) : 0,
            reps: Math.round(num(s.reps)),
            type: 'work',
            rpe: null
          });
        });
        if (sets.length) {
          entries.push({ id: U.uid('en'), exerciseId: item.exerciseId, notes: '', sets: sets });
        }
        return;
      }
      const stretch = itemIsStretch(item);
      const sets = [];
      a.sets.forEach(function (s) {
        if (!(num(s.reps) > 0 || num(s.holdSec) > 0 || num(s.distanceM) > 0)) return;
        const o = {};
        if (num(s.reps) > 0) o.reps = Math.round(num(s.reps));
        if (num(s.holdSec) > 0) o.holdSec = Math.round(num(s.holdSec));
        if (num(s.distanceM) > 0) o.distanceM = Math.round(num(s.distanceM));
        if (num(s.weightKg) > 0) o.weightKg = num(s.weightKg);
        if (s.side === 'L' || s.side === 'R') o.side = s.side;
        if (stretch) o.intensity = U.clamp(Math.round(num(s.intensity)) || 2, 1, 4);
        sets.push(o);
      });
      if (!sets.length) return;
      const en = { id: U.uid('en'), type: 'setwork', exerciseRef: item.exerciseId, sets: sets };
      if (stretch) en.method = itemMethod(item, exOf(item.exerciseId));
      entries.push(en);
    });
    return entries;
  }

  function guardrailsFor(draftW, u) {
    if (!u || !perfMode(u)) return [];
    const G = window.Guardrails;
    if (!G || typeof G.checkSession !== 'function') return [];
    try {
      const pain = window.Store && typeof Store.painFor === 'function' ? (Store.painFor(u.id) || []) : [];
      return G.checkSession(draftW, Store.workoutsFor(u.id), u, pain) || [];
    } catch (e) { return []; }
  }

  function confirmStops(warns) {
    const stops = warns.filter(function (g) { return g.level === 'stop'; });
    if (!stops.length) return Promise.resolve(true);
    if (!window.App || !App.confirm) return Promise.resolve(true);
    return App.confirm({
      title: 'Sure about this one?',
      message: stops.map(function (g) { return g.message; }).join('\n\n'),
      danger: true,
      confirmLabel: 'Save anyway'
    });
  }

  function saveSession() {
    const entries = buildEntries();
    if (!entries.length) {
      toast('Nothing recorded yet', 'err');
      return;
    }
    const nameEl = root && root.querySelector('#pl-sum-name');
    const name = nameEl && nameEl.value.trim() ? nameEl.value.trim() : S.name;
    const startedAt = S.startedAt;
    const endedAt = Date.now();
    const dateStr = U.dateToStr(new Date(startedAt));
    const durationMin = Math.max(1, Math.round((endedAt - startedAt) / 60000));
    const u = user();
    const warns = guardrailsFor({ date: dateStr, entries: entries }, u);
    confirmStops(warns).then(function (ok) {
      if (!ok) return;
      const w = Store.addWorkout({
        userId: S.userId || (u && u.id),
        date: dateStr,
        name: name,
        startedAt: startedAt,
        endedAt: endedAt,
        durationMin: durationMin,
        entries: entries
      });
      clearPending();
      closePlayer();
      toast('Session saved', 'ok');
      if (warns.length) toast('⚠️ ' + warns[0].message);
      if (window.App && App.navigate) App.navigate('history');
      fireCheckin(w);
    });
  }

  // Post-save check-in — the SAME flow every direct-save session type uses.
  // Preferred hook: views-log exports window.ViewsLog.openSessionCheckin.
  // Fallback: a document event the shell can route (documented for wiring).
  function fireCheckin(w) {
    const VL = window.ViewsLog;
    if (VL && typeof VL.openSessionCheckin === 'function') {
      try { VL.openSessionCheckin(w); return; } catch (e) { /* fall through */ }
    }
    try {
      document.dispatchEvent(new CustomEvent('ironlog:session-saved', { detail: { workoutId: w && w.id } }));
    } catch (e) { /* ignore */ }
  }

  /* ======================================================================
     Quit
     ====================================================================== */

  function quitSession() {
    if (!S) return;
    if (S.finished) {
      // summary screen — quitting = abandoning the unsaved summary
      if (window.App && App.confirm) {
        App.confirm({
          title: 'Leave without saving?',
          message: 'This session hasn’t been saved yet.',
          danger: true,
          confirmLabel: 'Discard'
        }).then(function (ok) {
          if (!ok) return;
          clearPending();
          closePlayer();
        });
      } else { clearPending(); closePlayer(); }
      return;
    }
    togglePause(true);
    const done = S.compiled.kind === 'circuit' ? S.roundsDone : completedItemIdxs().length;
    if (!done) {
      App.confirm({
        title: 'End session?',
        message: 'Nothing has been completed yet — this discards the session.',
        danger: true,
        confirmLabel: 'End session'
      }).then(function (ok) {
        if (!ok) return;
        clearPending();
        closePlayer();
      });
      return;
    }
    // completed work exists: keep going / save what's done / discard
    App.modal({
      title: 'End session?',
      content: '<p class="text-2" style="font-size:14px;line-height:1.55;margin:4px 0 8px">' +
        'You can save what you’ve completed so far — only finished ' +
        (S.compiled.kind === 'circuit' ? 'rounds' : 'sets') + ' are kept.</p>',
      actions: [
        { label: 'Keep going', kind: 'ghost' },
        {
          label: 'Discard',
          kind: 'danger',
          onClick: function () {
            clearPending();
            closePlayer();
          }
        },
        {
          label: 'Save & finish',
          kind: 'primary',
          onClick: function () { showSummary(); }
        }
      ]
    });
  }

  /* ======================================================================
     Routine planner — list sheet + editor sheet
     ====================================================================== */

  function routinesApi() {
    const St = window.Store;
    if (St && typeof St.routinesFor === 'function' && typeof St.addRoutine === 'function') return St;
    return null;
  }

  function routineSummary(r) {
    const items = Array.isArray(r.items) ? r.items : [];
    const names = items.slice(0, 4).map(function (it) {
      return it.exerciseId ? exName(it.exerciseId) : (it.name || '');
    }).filter(Boolean);
    let s = names.join(' · ');
    if (items.length > 4) s += ' +' + (items.length - 4);
    return s || 'Empty routine';
  }

  Player.openPlanner = function (userId) {
    const u = user();
    if (!u) { toast('Create a profile first', 'err'); return; }
    if (!perfMode(u)) { toast('Routines live in Performance mode', 'err'); return; }
    userId = userId || u.id;
    const api = routinesApi();
    const mine = api ? (api.routinesFor(userId) || []) : [];

    let html = '';
    if (mine.length) {
      html += '<div class="section-label">YOUR ROUTINES</div><div class="list">';
      mine.forEach(function (r) {
        html +=
          '<div class="list-row player-rt-row" data-rid="' + U.esc(r.id) + '">' +
            '<button type="button" class="player-rt-main" data-rt="edit">' +
              '<span class="title">' + U.esc(r.name || 'Routine') + '</span>' +
              '<span class="sub">' + U.esc(routineSummary(r)) + '</span>' +
            '</button>' +
            '<span class="trailing">' +
              '<button type="button" class="btn small primary" data-rt="play">▶ Start</button>' +
            '</span>' +
          '</div>';
      });
      html += '</div>';
    }
    html += '<div class="section-label">BUILT-IN</div><div class="list">';
    ['A', 'B'].forEach(function (letter) {
      const r = Player.builtinRoutine(letter);
      if (!r) return;
      html +=
        '<div class="list-row player-rt-row" data-builtin="' + letter + '">' +
          '<button type="button" class="player-rt-main" data-rt="playbuiltin">' +
            '<span class="title">Durability ' + letter + ' <span class="badge">built-in</span></span>' +
            '<span class="sub">' + U.esc(routineSummary(r)) + '</span>' +
          '</button>' +
          '<span class="trailing">' +
            '<button type="button" class="btn small ghost" data-rt="dup">' + (ic().copy || '') + ' Duplicate to customize</button>' +
          '</span>' +
        '</div>';
    });
    html += '</div>' +
      '<button type="button" class="btn primary" id="pl-rt-new" style="width:100%;margin-top:12px">' +
      (ic().plus || '+') + ' New routine</button>' +
      (!api ? '<p class="small-text muted" style="margin-top:8px">Saving routines needs the latest app version on this device.</p>' : '');

    const content = document.createElement('div');
    content.innerHTML = html;
    let sheet = null;

    U.on(content, 'click', '[data-rt]', function (e, b) {
      const act = b.getAttribute('data-rt');
      const row = b.closest('.player-rt-row');
      if (act === 'edit' || act === 'play') {
        const rid = row.getAttribute('data-rid');
        const r = mine.find(function (x) { return x.id === rid; });
        if (!r) return;
        if (sheet) sheet.close();
        if (act === 'play') Player.start(r, { routineRef: r.id });
        else Player.editRoutine(r, { userId: userId });
        return;
      }
      const letter = row.getAttribute('data-builtin');
      const builtin = Player.builtinRoutine(letter);
      if (!builtin) return;
      if (act === 'playbuiltin') {
        if (sheet) sheet.close();
        Player.start(builtin, { name: builtin.name });
        return;
      }
      if (act === 'dup') {
        if (!api) { toast('Update the app to save routines', 'err'); return; }
        const copy = {
          userId: userId,
          name: builtin.name + ' (custom)',
          kind: builtin.kind,
          restSec: builtin.restSec,
          items: builtin.items
        };
        const saved = api.addRoutine(copy);
        if (sheet) sheet.close();
        toast('Duplicated — make it yours', 'ok');
        Player.editRoutine(saved, { userId: userId });
      }
    });
    U.$('#pl-rt-new', content).addEventListener('click', function () {
      if (sheet) sheet.close();
      Player.editRoutine(null, { userId: userId });
    });

    sheet = App.sheet({ title: 'Routines', content: content });
  };

  /* ---------- editor ---------- */

  function copyRoutineForEdit(r) {
    // shallow-copy preserving unknown keys at routine and item level
    const model = {};
    for (const k in (r || {})) model[k] = r[k];
    model.name = (r && r.name) || '';
    model.kind = KIND_DEFS.some(function (kd) { return kd.id === model.kind; }) ? model.kind : 'custom';
    model.restSec = Math.max(0, Math.round(num(model.restSec)) || 0);
    model.items = (Array.isArray(r && r.items) ? r.items : []).map(function (it) {
      const c = {};
      for (const k in it) c[k] = it[k];
      c.sets = clampInt(c.sets, 1, 20, 3);
      return c;
    });
    return model;
  }

  Player.editRoutine = function (routine, opts) {
    opts = opts || {};
    const u = user();
    if (!u) { toast('Create a profile first', 'err'); return; }
    if (!perfMode(u)) { toast('Routines live in Performance mode', 'err'); return; }
    const userId = opts.userId || u.id;
    const api = routinesApi();
    const isNew = !(routine && routine.id);
    const model = copyRoutineForEdit(routine || { name: '', kind: 'custom', restSec: 60, items: [] });
    if (!model.restSec && model.restSec !== 0) model.restSec = 60;

    const content = document.createElement('div');

    function itemRowHTML(it, i) {
      const shape = it.exerciseId ? itemShape(it) : 'reps';
      const nm = it.exerciseId ? exName(it.exerciseId) : (it.name || 'Station');
      let targets = '';
      if (shape === 'hold') {
        targets += '<label class="player-it-f"><span>Hold</span>' +
          '<input class="input" data-it="hold:' + i + '" inputmode="numeric" placeholder="0:45" value="' +
          (num(it.targetHoldSec) > 0 ? fmtClock(it.targetHoldSec) : '') + '"></label>';
      }
      if (shape === 'reps' || shape === 'weight_reps') {
        targets += '<label class="player-it-f"><span>Reps</span>' +
          '<input class="input" type="number" min="0" step="1" inputmode="numeric" data-it="reps:' + i + '" value="' +
          (num(it.targetReps) > 0 ? Math.round(num(it.targetReps)) : '') + '"></label>';
      }
      if (shape === 'carry') {
        targets += '<label class="player-it-f"><span>Meters</span>' +
          '<input class="input" type="number" min="0" step="5" inputmode="numeric" data-it="m:' + i + '" value="' +
          (num(it.targetDistanceM) > 0 ? Math.round(num(it.targetDistanceM)) : '') + '"></label>';
      }
      if (shape === 'carry' || shape === 'weight_reps') {
        targets += '<label class="player-it-f"><span>' +
          U.esc(window.App && App.units ? U.unitLabel(App.units()) : 'kg') + '</span>' +
          '<input class="input" type="number" min="0" step="0.5" inputmode="decimal" data-it="kg:' + i + '" value="' +
          (num(it.targetWeightKg) > 0 ? kgToDisplay(it.targetWeightKg) : '') + '"></label>';
      }
      return '<div class="card player-it" data-item="' + i + '">' +
        '<div class="player-it-head">' +
          '<span class="ti">' + U.esc(nm) + '</span>' +
          '<span class="mv">' +
            '<button type="button" class="btn icon ghost" data-it="up:' + i + '" aria-label="Move up">▲</button>' +
            '<button type="button" class="btn icon ghost" data-it="down:' + i + '" aria-label="Move down">▼</button>' +
            '<button type="button" class="btn icon ghost" data-it="rm:' + i + '" aria-label="Remove">' + (ic().close || '✕') + '</button>' +
          '</span>' +
        '</div>' +
        '<div class="player-it-ctl">' +
          '<span class="sw-stepper"><span class="lb">Sets</span>' +
            '<button type="button" class="btn icon ghost" data-it="sets-:' + i + '">−</button>' +
            '<span class="val">' + it.sets + '</span>' +
            '<button type="button" class="btn icon ghost" data-it="sets+:' + i + '">+</button>' +
          '</span>' +
          targets +
          '<label class="player-it-f"><span>Rest</span>' +
            '<input class="input" type="number" min="0" step="15" inputmode="numeric" data-it="rest:' + i + '" ' +
            'placeholder="' + model.restSec + '" value="' +
            (it.restSec === undefined || it.restSec === null ? '' : Math.round(num(it.restSec))) + '"></label>' +
        '</div>' +
      '</div>';
    }

    function paint() {
      content.innerHTML =
        '<div class="field"><label for="pl-rt-name">Name</label>' +
          '<input class="input" id="pl-rt-name" maxlength="40" autocomplete="off" placeholder="e.g. Morning hips" value="' +
          U.esc(model.name) + '"></div>' +
        '<div class="field"><label>Kind</label><div class="chip-row" id="pl-rt-kind">' +
          KIND_DEFS.map(function (kd) {
            return '<button type="button" class="chip' + (model.kind === kd.id ? ' active' : '') +
              '" data-kind="' + kd.id + '">' + kd.label + '</button>';
          }).join('') + '</div></div>' +
        (model.kind === 'circuit'
          ? '<div class="field"><label>Rounds</label>' +
            '<span class="sw-stepper">' +
              '<button type="button" class="btn icon ghost" data-rounds="-">−</button>' +
              '<span class="val">' + (num(model.rounds) > 0 ? Math.round(num(model.rounds)) : 3) + '</span>' +
              '<button type="button" class="btn icon ghost" data-rounds="+">+</button>' +
            '</span></div>'
          : '') +
        '<div id="pl-rt-items" style="display:flex;flex-direction:column;gap:10px">' +
          model.items.map(itemRowHTML).join('') +
          (model.items.length ? '' : '<p class="small-text muted" style="padding:4px 2px">No exercises yet — add some below.</p>') +
        '</div>' +
        '<button type="button" class="btn ghost" id="pl-rt-add" style="width:100%;margin-top:10px">' +
          (ic().plus || '+') + ' Add exercise</button>' +
        '<div class="field" style="margin-top:12px"><label>Default rest between sets</label>' +
          '<span class="sw-stepper">' +
            '<button type="button" class="btn icon ghost" data-rest="-">−</button>' +
            '<span class="val">' + model.restSec + 's</span>' +
            '<button type="button" class="btn icon ghost" data-rest="+">+</button>' +
          '</span></div>';
      wire();
    }

    function readName() {
      const el = U.$('#pl-rt-name', content);
      if (el) model.name = el.value.trim();
    }

    function wire() {
      const nameEl = U.$('#pl-rt-name', content);
      if (nameEl) nameEl.addEventListener('input', readName);
      U.$('#pl-rt-add', content).addEventListener('click', function () {
        readName();
        openPicker({
          title: 'Add exercise',
          multi: true,
          onPick: function (ids) {
            ids.forEach(function (id) {
              const ex = exOf(id);
              const shape = setShapeOf(ex);
              const it = { exerciseId: id, sets: shape === 'stretch' ? 2 : 3 };
              if (shape === 'hold') it.targetHoldSec = 30;
              else if (shape === 'stretch') it.targetHoldSec = 45;
              else if (shape === 'carry') it.targetDistanceM = 40;
              else it.targetReps = 8;
              model.items.push(it);
            });
            paint();
          }
        });
      });
    }

    U.on(content, 'click', '#pl-rt-kind .chip', function (e, chip) {
      readName();
      model.kind = chip.getAttribute('data-kind');
      paint();
    });
    U.on(content, 'click', '[data-rounds]', function (e, b) {
      const dir = b.getAttribute('data-rounds') === '+' ? 1 : -1;
      model.rounds = U.clamp((num(model.rounds) > 0 ? Math.round(num(model.rounds)) : 3) + dir, 1, 20);
      readName();
      paint();
    });
    U.on(content, 'click', '[data-rest]', function (e, b) {
      const dir = b.getAttribute('data-rest') === '+' ? 1 : -1;
      model.restSec = U.clamp(model.restSec + dir * 15, 0, 600);
      readName();
      paint();
    });
    U.on(content, 'click', 'button[data-it]', function (e, b) {
      const parts = b.getAttribute('data-it').split(':');
      const act = parts[0];
      const i = parseInt(parts[1], 10);
      const it = model.items[i];
      if (!it) return;
      readName();
      if (act === 'rm') model.items.splice(i, 1);
      else if (act === 'up' && i > 0) {
        model.items[i] = model.items[i - 1];
        model.items[i - 1] = it;
      } else if (act === 'down' && i < model.items.length - 1) {
        model.items[i] = model.items[i + 1];
        model.items[i + 1] = it;
      } else if (act === 'sets+') it.sets = U.clamp(it.sets + 1, 1, 20);
      else if (act === 'sets-') it.sets = U.clamp(it.sets - 1, 1, 20);
      else return;
      paint();
    });
    U.on(content, 'input', 'input[data-it]', function (e, inp) {
      const parts = inp.getAttribute('data-it').split(':');
      const it = model.items[parseInt(parts[1], 10)];
      if (!it) return;
      const v = inp.value;
      if (parts[0] === 'hold') {
        const sec = parseSec(v);
        if (sec !== null && sec > 0) it.targetHoldSec = Math.round(sec);
        else delete it.targetHoldSec;
      } else if (parts[0] === 'reps') {
        const n = Math.round(num(v));
        if (n > 0) it.targetReps = n; else delete it.targetReps;
      } else if (parts[0] === 'm') {
        const m = Math.round(num(v));
        if (m > 0) it.targetDistanceM = m; else delete it.targetDistanceM;
      } else if (parts[0] === 'kg') {
        const kg = displayToKg(v);
        if (kg > 0) it.targetWeightKg = kg; else delete it.targetWeightKg;
      } else if (parts[0] === 'rest') {
        if (String(v).trim() === '') { delete it.restSec; return; }
        it.restSec = Math.max(0, Math.round(num(v)));
      }
    });

    const actions = [
      { label: 'Cancel', kind: 'ghost' }
    ];
    if (!isNew && api) {
      actions.push({
        label: 'Delete',
        kind: 'danger',
        keepOpen: true,
        onClick: function (sheetApi) {
          App.confirm({
            title: 'Delete this routine?',
            message: (model.name || 'This routine') + ' will be removed everywhere.',
            danger: true,
            confirmLabel: 'Delete'
          }).then(function (ok) {
            if (!ok) return;
            api.deleteRoutine(routine.id);
            sheetApi.close();
            toast('Routine deleted', 'ok');
          });
        }
      });
    }
    actions.push({
      label: 'Save',
      kind: 'primary',
      keepOpen: true,
      onClick: function (sheetApi) {
        readName();
        if (!api) { toast('Update the app to save routines', 'err'); return; }
        if (!model.name) { toast('Give the routine a name', 'err'); return; }
        if (!model.items.length) { toast('Add at least one exercise', 'err'); return; }
        const out = {};
        for (const k in model) {
          if (k.charAt(0) === '_') continue;
          out[k] = model[k];
        }
        out.userId = (routine && routine.userId) || userId;
        if (model.kind !== 'circuit') delete out.rounds;
        else if (!(num(out.rounds) > 0)) out.rounds = 3;
        if (isNew) api.addRoutine(out);
        else api.updateRoutine(routine.id, out);
        sheetApi.close();
        toast('Routine saved', 'ok');
        if (typeof opts.onSaved === 'function') opts.onSaved();
      }
    });

    paint();
    App.sheet({
      title: isNew ? 'New routine' : 'Edit routine',
      content: content,
      actions: actions
    });
  };

  /* ---------- exercise picker (prefer the log view's, fall back local) ---------- */

  function openPicker(opts) {
    const VL = window.ViewsLog;
    if (VL && typeof VL.openExercisePicker === 'function') {
      try { VL.openExercisePicker(opts); return; } catch (e) { /* fall through */ }
    }
    openMiniPicker(opts);
  }

  // Minimal built-in picker: search + ranked results via ExerciseDB.search,
  // multi-select commit. Used only when views-log doesn't export its picker.
  function openMiniPicker(opts) {
    opts = opts || {};
    const sel = [];
    const content = document.createElement('div');
    content.innerHTML =
      '<div class="searchbar" style="margin-bottom:10px">' + (ic().search || '') +
        '<input class="input" id="mp-q" type="search" placeholder="Search exercises" autocomplete="off"></div>' +
      '<div id="mp-res" style="max-height:46vh;overflow-y:auto;overscroll-behavior:contain"></div>' +
      '<div style="padding-top:12px"><button type="button" class="btn primary" id="mp-commit" style="width:100%" disabled>Add exercises</button></div>';
    const resEl = U.$('#mp-res', content);
    const qEl = U.$('#mp-q', content);
    let sheet = null;

    function renderResults() {
      const d = db();
      const list = d && d.search ? d.search(qEl.value.trim(), { category: opts.category || null }) : [];
      resEl.innerHTML = '<div class="list">' + list.slice(0, 60).map(function (ex) {
        const on = sel.indexOf(ex.id) >= 0;
        return '<button type="button" class="list-row" data-x="' + U.esc(ex.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
          '<div class="body"><div class="title">' + U.esc(ex.name) + '</div></div>' +
          (on ? '<span class="trailing" style="color:var(--accent)">' + (ic().check || '✓') + '</span>' : '') +
        '</button>';
      }).join('') + '</div>';
    }

    function updateCommit() {
      const b = U.$('#mp-commit', content);
      b.disabled = !sel.length;
      b.textContent = sel.length ? 'Add ' + sel.length + ' exercise' + (sel.length > 1 ? 's' : '') : 'Add exercises';
    }

    qEl.addEventListener('input', renderResults);
    U.on(content, 'click', '.list-row[data-x]', function (e, row) {
      const id = row.getAttribute('data-x');
      const at = sel.indexOf(id);
      if (at >= 0) sel.splice(at, 1); else sel.push(id);
      renderResults();
      updateCommit();
    });
    U.$('#mp-commit', content).addEventListener('click', function () {
      if (sheet) sheet.close();
      if (typeof opts.onPick === 'function' && sel.length) opts.onPick(sel.slice());
    });

    renderResults();
    sheet = App.sheet({ title: opts.title || 'Add exercise', content: content });
  }

  window.Player = Player;
})();
