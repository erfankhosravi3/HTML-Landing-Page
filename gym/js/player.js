/* IronLog — P4.5: ONE LIVE SESSION. Attaches window.Player.

   THE INVERSION (P4.5 corrects P3.5): there is exactly ONE session record —
   the draft at localStorage 'ironlog/activeWorkout'. The timing engine
   (Player.Session) drives draft.entries[i].sets[j] DIRECTLY; the full-screen
   focus view is a RENDERER over that draft, never an owner. The P3.5 shadow
   state ('ironlog/activeSession', S.compiled, S.actuals and the player's
   private save path) is DELETED — a stale key left by a shipped P3.5 client is
   discarded on boot (Player.discardLegacySession, called from resumePending).

   ONE ENGINE: Player.Session is the only timing engine in the app. views-log.js
   owns draft STORAGE, the builder DOM and the finish flow, and binds itself as
   this engine's host (bind({getDraft, saveDraft, setDraft, clearDraft,
   rerender, prefill})); it holds no timer slot of its own. Because every piece
   of I/O is injected, the engine is exercised end to end in Node
   (scratchpad/test-session-core.js) with no browser at all.

   Player.compile survives ONLY as a derived projection, recomputed on demand
   for 'what's next' and time-left (Player.projectDraft). It is never stored.

   Timers bind to (entryId, set._sid) — never to an array index or an object
   reference, because a repaint rebuilds innerHTML and destroys identity.
   `_sid` is draft-local and provably unpersisted: every save path strips
   '_'-prefixed keys (cleanSetworkEntry) or enumerates its fields
   (buildFinishedEntries builds lift sets as 4-key literals).

   Player.compile / stepEstimateSec / builtinRoutine / routineFromWorkout stay
   PURE and unit-testable in Node with a bare window stub: nothing at the top
   level of this file touches document, localStorage or timers.

   Compiled step shapes (contract, unchanged):
     { type:'work', shape:'hold'|'reps'|'carry'|'weight_reps', exerciseId,
       side?, setIdx, targetSec?, targetReps?, targetM?, targetKg?, entryIdx }
     { type:'rest', sec, afterEntryIdx }
   Circuit-kind routines compile to a rounds structure instead:
     { kind:'circuit', rounds, amrapSec|null, stations:[{exerciseId?, name?,
       reps?, durationSec?, weightKg?}], restSec } */
(function () {
  'use strict';

  const Player = {};
  const DRAFT_KEY = 'ironlog/activeWorkout';
  const LEGACY_SESSION_KEY = 'ironlog/activeSession'; // P3.5 shadow state — DELETED
  const DEFAULT_HOLD_SEC = 30;
  const DEFAULT_TEMPO_REPS = 8;   // a metronome row with nothing typed yet
  const DEFAULT_REST_SEC = 90;
  const ENGINE_STALL_MS = 1500;   // no tick for this long => the clock was dead
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

  // P4.5 pace: what the app DRIVES. cadence (tempo metronome inside a timed
  // set) is an ORTHOGONAL modifier, never a value of this enum.
  const PACES = ['off', 'set', 'exercise', 'session'];
  const PACE_LABELS = { off: 'Off', set: 'This set', exercise: 'This exercise', session: 'Whole session' };
  // Binding defaults table (P4.5): lift 'off' keeps today's flow byte-identical.
  const PACE_DEFAULTS = {
    durability: 'set',
    stretch: 'set',
    lift: 'off',
    circuit: 'session',
    interval: 'set',
    cardio: 'off',   // steady cardio is NOT in the live substrate
    mixed: 'off'
  };

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

  // Runtime-only environment probes — never evaluated at load time.
  function hasLS() {
    try { return typeof localStorage !== 'undefined' && !!localStorage; } catch (e) { return false; }
  }

  function hasDoc() {
    try { return typeof document !== 'undefined' && !!document && !!document.body; } catch (e) { return false; }
  }

  function isHidden() {
    try {
      return typeof document !== 'undefined' && document && document.visibilityState === 'hidden';
    } catch (e) { return false; }
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
        // legacy-shaped lift entry (no type key). Seed from WORK sets — warmup
        // sets must not set the target load or inflate the set count; fall back
        // to all rep-bearing sets only when no work sets exist.
        const all = (en.sets || []).filter(function (s) { return s && num(s.reps) > 0; });
        const work = all.filter(function (s) { return s.type !== 'warmup'; });
        const ls = work.length ? work : all;
        if (!ls.length) return;
        const item = { exerciseId: en.exerciseId, sets: ls.length };
        item.targetReps = Math.round(num(ls[0].reps));
        if (num(ls[0].weightKg) > 0) item.targetWeightKg = num(ls[0].weightKg);
        items.push(item);
        return;
      }
      if (en.exerciseId && en.type === 'lift') {
        const all2 = (en.sets || []).filter(function (s) { return s && num(s.reps) > 0; });
        const work2 = all2.filter(function (s) { return s.type !== 'warmup'; });
        const ls2 = work2.length ? work2 : all2;
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
     Draft projection — Player.compile's live counterpart.

     The draft is the session record; this recomputes the SAME step shapes
     from it on demand (next-up, 'n of m', time left). Never stored.
     ====================================================================== */

  function isSetworkEntry(en) { return !!en && en.type === 'setwork'; }

  function isLiftEntry(en) {
    return !!en && (en.type === undefined || en.type === null || en.type === 'lift');
  }

  function isCircuitEntry(en) {
    return !!en && en.type === 'cardio' && en.mode === 'circuit';
  }

  // Shapes that legitimately carry a `sets` array. Everything else (cardio,
  // mobility, test blobs) is a typed entry that saves verbatim — never grow a
  // `sets` key on one.
  function isSetBearingEntry(en) {
    return isLiftEntry(en) || isSetworkEntry(en);
  }

  // Entries the live substrate can drive: lift + setwork. Cardio/mobility/
  // durability/test blobs are logged, never stepped through.
  function isRunnableEntry(en) {
    return isLiftEntry(en) ? !!en.exerciseId : isSetworkEntry(en) && !!en.exerciseRef;
  }

  function entryExId(en) {
    if (!en) return '';
    return isSetworkEntry(en) ? en.exerciseRef : en.exerciseId;
  }

  function entryMethod(en) {
    const ex = exOf(entryExId(en));
    if (en && METHODS.indexOf(en.method) >= 0) return en.method;
    return (ex && ex.defaultMethod) || 'static';
  }

  // Which driver shape a DRAFT set has. Mirrors views-log's swRowShapeOf for
  // setwork; lift entries are always weight_reps.
  function shapeOfEntry(en) {
    if (!en) return null;
    if (isLiftEntry(en)) return 'weight_reps';
    if (!isSetworkEntry(en)) return null;
    const shape = setShapeOf(exOf(en.exerciseRef));
    if (shape === 'carry') return 'carry';
    if (shape === 'stretch') return entryMethod(en) === 'dynamic' ? 'reps' : 'hold';
    if (shape === 'weight_reps') return 'weight_reps';
    return 'hold';
  }

  function entryIsStretch(en) {
    return isSetworkEntry(en) && setShapeOf(exOf(en.exerciseRef)) === 'stretch';
  }

  function setIsDone(s) { return !!(s && s.done); }

  // A step-shaped projection of one draft set (same keys Player.compile emits).
  function stepOfSet(en, s, si, ei) {
    const shape = shapeOfEntry(en);
    const step = {
      type: 'work',
      shape: shape || 'weight_reps',
      exerciseId: entryExId(en),
      setIdx: si,
      entryIdx: ei
    };
    if (s && (s.side === 'L' || s.side === 'R')) step.side = s.side;
    // What actually happened wins; the routine's PRESCRIPTION (draft-local
    // '_t' keys) is the fallback. The projection is exactly the 'what's next /
    // time left' surface, so it must still know the plan now that the plan no
    // longer squats in the observation fields.
    const tgt = function (k) {
      const own = num(s && s[k]);
      return own > 0 ? own : num(s && s['_t' + k.charAt(0).toUpperCase() + k.slice(1)]);
    };
    if (tgt('holdSec') > 0) step.targetSec = Math.round(tgt('holdSec'));
    if (tgt('reps') > 0) step.targetReps = Math.round(tgt('reps'));
    if (tgt('distanceM') > 0) step.targetM = Math.round(tgt('distanceM'));
    if (tgt('weightKg') > 0) step.targetKg = tgt('weightKg');
    return step;
  }

  // Live projection over a draft: pending steps (+ the rests a driven pace
  // would insert), how much is done, and a time-left estimate.
  Player.projectDraft = function (d, opts) {
    opts = opts || {};
    const out = { kind: 'steps', steps: [], workCount: 0, doneCount: 0, estSec: 0, remainSec: 0 };
    const entries = (d && Array.isArray(d.entries)) ? d.entries : [];
    entries.forEach(function (en, ei) {
      if (!isRunnableEntry(en)) return;
      const sets = Array.isArray(en.sets) ? en.sets : [];
      const restSec = opts.restSec === undefined ? Session.restSecFor(en, d) : Math.max(0, Math.round(num(opts.restSec)));
      sets.forEach(function (s, si) {
        const step = stepOfSet(en, s, si, ei);
        out.workCount++;
        if (setIsDone(s)) { out.doneCount++; step.done = true; }
        out.steps.push(step);
        if (restSec > 0) out.steps.push({ type: 'rest', sec: restSec, afterEntryIdx: ei });
      });
    });
    while (out.steps.length && out.steps[out.steps.length - 1].type === 'rest') out.steps.pop();
    out.steps.forEach(function (st) {
      const sec = stepEstimateSec(st);
      out.estSec += sec;
      if (!st.done) out.remainSec += sec;
    });
    return out;
  };

  /* ======================================================================
     Routine -> DRAFT (the session record). Pure: no storage, no DOM.
     ====================================================================== */

  function blankLiftSet(item) {
    // PRESCRIPTION never lands in an observation field: blank set + '_t' targets
    const s = { weightKg: 0, reps: 0, type: 'work', rpe: null, done: false };
    if (num(item && item.targetWeightKg) > 0) s._tWeightKg = num(item.targetWeightKg);
    if (num(item && item.targetReps) > 0) s._tReps = Math.round(num(item.targetReps));
    return s;
  }

  function blankSetworkSet(item, shape, side) {
    const s = { done: false };
    if (side) s.side = side;
    if (shape === 'hold' && num(item.targetHoldSec) > 0) s._tHoldSec = Math.round(num(item.targetHoldSec));
    if (shape === 'reps' && num(item.targetReps) > 0) s._tReps = Math.round(num(item.targetReps));
    if (shape === 'carry') {
      if (num(item.targetDistanceM) > 0) s._tDistanceM = Math.round(num(item.targetDistanceM));
      if (num(item.targetWeightKg) > 0) s._tWeightKg = num(item.targetWeightKg);
    } else if (shape !== 'reps' && num(item.targetWeightKg) > 0) {
      s._tWeightKg = num(item.targetWeightKg);
    }
    return s;
  }

  // Routine -> a draft-shaped session record. Draft-local keys ('_'-prefixed)
  // carry the routine/item layer of the pace precedence chain; they never
  // reach Store (every save path strips or enumerates).
  Player.draftFromRoutine = function (routine, opts) {
    opts = opts || {};
    routine = routine || {};
    const items = Array.isArray(routine.items) ? routine.items : [];
    const d = {
      userId: opts.userId || null,
      date: (window.U && U.todayStr) ? U.todayStr() : '',
      name: opts.name || routine.name || 'Session',
      startedAt: opts.startedAt || (Date.now()),
      entries: [],
      notes: '',
      fromTemplateId: null,
      _routine: {
        id: opts.routineRef || routine.id || null,
        kind: routine.kind || 'custom',
        restSec: num(routine.restSec) > 0 ? Math.round(num(routine.restSec)) : 0
      },
      _view: routine.kind === 'circuit' ? 'focus' : 'builder'
    };
    if (PACES.indexOf(routine.pace) >= 0) d._routine.pace = routine.pace;
    if (routine.tempo) d._routine.tempo = String(routine.tempo);

    if (routine.kind === 'circuit') {
      const c = Player.compile(routine);
      const en = {
        id: U.uid('en'),
        type: 'cardio',
        mode: 'circuit',
        durationMin: 0,
        rounds: 0,
        stations: c.stations.map(function (st) {
          const o = {};
          for (const k in st) o[k] = st[k];
          return o;
        })
      };
      en._targetRounds = c.rounds;
      if (c.amrapSec > 0) en._amrapSec = c.amrapSec;
      // The CIRCUIT's own start. A routine started on top of an open draft
      // joins it (one live session), so d.startedAt is the whole session and
      // would charge the whole day's lifting to this circuit's durationMin.
      en._startedAt = d.startedAt || Date.now();
      d.entries.push(en);
      return d;
    }

    items.forEach(function (item) {
      if (!item || typeof item !== 'object' || !item.exerciseId) return;
      const ex = exOf(item.exerciseId);
      const perSide = !!(ex && ex.perSide);
      const nSets = clampInt(item.sets, 1, 20, 1);
      const shape = itemShape(item);
      let en;
      if (shape === 'weight_reps') {
        en = { id: U.uid('en'), exerciseId: String(item.exerciseId), notes: '', sets: [] };
        for (let i = 0; i < nSets; i++) {
          // lift sets can never carry a side (normalizeSet rebuilds them to
          // four keys on every client) — a perSide lift item expands to two
          // plain sets per prescribed set, exactly as P3.5 compiled it.
          en.sets.push(blankLiftSet(item));
          if (perSide) en.sets.push(blankLiftSet(item));
        }
      } else {
        en = { id: U.uid('en'), type: 'setwork', exerciseRef: String(item.exerciseId), notes: '', sets: [] };
        if (setShapeOf(ex) === 'stretch') {
          en.method = itemMethod(item, ex);
          en._depth = 2;
        }
        for (let i = 0; i < nSets; i++) {
          if (perSide) {
            en.sets.push(blankSetworkSet(item, shape, 'L'));
            en.sets.push(blankSetworkSet(item, shape, 'R'));
          } else {
            en.sets.push(blankSetworkSet(item, shape, null));
          }
        }
      }
      if (item.restSec !== undefined && item.restSec !== null) {
        en._itemRestSec = Math.max(0, Math.round(num(item.restSec)));
      }
      if (PACES.indexOf(item.pace) >= 0) en._itemPace = item.pace;
      if (item.tempo) en._tempo = String(item.tempo);
      if (item.note) en._note = String(item.note);
      d.entries.push(en);
    });
    return d;
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
     Player.Session — the live session substrate.

     ONE session record: the draft ('ironlog/activeWorkout'). Session owns the
     single timer slot, the pace resolution chain and the reconcile choke
     point; it NEVER owns workout data. Everything it mutates lives on the
     draft, so the builder and the focus view are two presentations of one
     state.

     Host binding (views-log calls this once — see the API notes at the bottom
     of this file):
       Player.Session.bind({ getDraft, saveDraft, setDraft?, clearDraft?,
                             rerender? })
     Unbound, Session falls back to reading/writing DRAFT_KEY directly, so the
     engine works in Node tests and before the log view has ever rendered.
     ====================================================================== */

  const Session = {};
  Player.Session = Session;

  const host = { getDraft: null, saveDraft: null, setDraft: null, clearDraft: null, rerender: null, prefill: null };
  const subs = [];
  let cacheRaw = null;
  let cacheDraft = null;
  let draftFromHost = false;
  let reconciling = false;
  let engineIv = null;
  let nowFn = null;
  // Where the running set / the cursor sat at the PREVIOUS reconcile. reconcile
  // runs after the mutation, so a deleted set's position has to be memoized
  // while it is still alive — that is what lets the orphan branches advance
  // FORWARD instead of rescanning the draft from the top.
  let lastPos = null;
  let lastCursorPos = null;

  function now() { return nowFn ? nowFn() : Date.now(); }

  Session.__setNow = function (fn) { nowFn = typeof fn === 'function' ? fn : null; };

  Session.bind = function (h) {
    h = h || {};
    host.getDraft = typeof h.getDraft === 'function' ? h.getDraft : null;
    host.saveDraft = typeof h.saveDraft === 'function' ? h.saveDraft : null;
    host.setDraft = typeof h.setDraft === 'function' ? h.setDraft : null;
    host.clearDraft = typeof h.clearDraft === 'function' ? h.clearDraft : null;
    host.rerender = typeof h.rerender === 'function' ? h.rerender : null;
    // Optional: the host's "accept the values this row would have been
    // prefilled with" hint, applied when a stopwatch-shaped set (a carry) is
    // stopped with nothing typed. The engine never MEASURES distance or load —
    // it only asks the host for what the builder's ✓ would have filled in.
    host.prefill = typeof h.prefill === 'function' ? h.prefill : null;
    Player.discardLegacySession();
    resumeEngine();
    return Session;
  };

  Session.unbind = function () {
    host.getDraft = host.saveDraft = host.setDraft = host.clearDraft = host.rerender = null;
    host.prefill = null;
    cacheRaw = null;
    cacheDraft = null;
  };

  /* ---------- the host's other exports (never an engine) ----------
     views-log.js owns draft STORAGE, the builder DOM and the finish flow; it
     drives this engine and renders its state. There is exactly one timer slot
     and it lives here. */

  function VLAPI() { return window.ViewsLog || null; }

  /* ---------- draft IO ---------- */

  function lsRead() {
    if (!hasLS()) return null;
    let raw = null;
    try { raw = localStorage.getItem(DRAFT_KEY); } catch (e) { return null; }
    if (!raw) { cacheRaw = null; cacheDraft = null; return null; }
    if (raw === cacheRaw && cacheDraft) return cacheDraft;
    try {
      const d = JSON.parse(raw);
      if (!d || typeof d !== 'object' || !Array.isArray(d.entries)) return null;
      cacheRaw = raw;
      cacheDraft = d;
      return d;
    } catch (e) { return null; }
  }

  function lsWrite(d) {
    if (!hasLS()) return;
    try {
      cacheRaw = JSON.stringify(d);
      cacheDraft = d;
      localStorage.setItem(DRAFT_KEY, cacheRaw);
    } catch (e) { /* storage full — the session keeps running in memory */ }
  }

  // The live draft: the host's object when bound (so the builder and the
  // engine mutate the SAME object), else the localStorage copy.
  Session.draft = function () {
    let d = null;
    const getter = host.getDraft || (VLAPI() && VLAPI().getDraft) || null;
    if (getter) {
      try { d = getter(); } catch (e) { d = null; }
    }
    if (d && typeof d === 'object' && Array.isArray(d.entries)) {
      cacheDraft = d;
      cacheRaw = null; // host object is authoritative; don't trust the string cache
      draftFromHost = true;
      return d;
    }
    draftFromHost = false;
    return lsRead();
  };

  // Replace the whole session record (routine seeding / tests).
  Session.setDraft = function (d) {
    if (host.setDraft) {
      try { host.setDraft(d); } catch (e) { /* fall through to LS */ }
    }
    if (d) Session.backfill(d);
    lsWrite(d);
    if (!host.setDraft && host.rerender) { try { host.rerender(); } catch (e) { /* ignore */ } }
    Session.reconcile();
    return d;
  };

  Session.clearDraft = function () {
    if (host.clearDraft) { try { host.clearDraft(); } catch (e) { /* ignore */ } }
    if (hasLS()) { try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ } }
    cacheRaw = null;
    cacheDraft = null;
    stopEngine();
    notify();
  };

  // Persist a mutation. When the host owns the live object its saveDraft() is
  // THE choke point (it writes, reconciles and notifies). When it does not —
  // the log view has not rendered yet, so the host's own draft variable is
  // still null — write the key directly instead of asking the host to
  // serialize a draft it does not have.
  function persist(d) {
    const live = Session.draft();
    d = d || live;
    const saver = host.saveDraft || (VLAPI() && VLAPI().saveDraft) || null;
    if (saver && draftFromHost && live === d) {
      try { saver(); return; } catch (e) { /* fall through */ }
    }
    lsWrite(d);
    if (!reconciling) Session.reconcile();
  }

  Session.save = function () { persist(Session.draft()); };

  /* ---------- set identity: (entryId, _sid), draft-local ---------- */

  function sidOf(set) {
    if (!set || typeof set !== 'object') return null;
    return set._sid || (set._sid = U.uid('s'));
  }

  Session.sidOf = sidOf;

  // Backfill entry ids + set sids. loadDraft() should call this alongside its
  // existing `if (!en.id)` loop. Returns true when anything was assigned.
  Session.backfill = function (d) {
    let changed = false;
    if (!d || !Array.isArray(d.entries)) return false;
    d.entries.forEach(function (en) {
      if (!en || typeof en !== 'object') return;
      if (!en.id) { en.id = U.uid('en'); changed = true; }
      // Only SET-BEARING shapes get an empty sets array. A typed entry (the
      // cardio circuit) has no sets by design and now saves verbatim, so a
      // lift-shaped `sets` key normalised on here would be written into the
      // user's permanent record.
      if (isSetBearingEntry(en) && !Array.isArray(en.sets)) { en.sets = []; changed = true; }
      (Array.isArray(en.sets) ? en.sets : []).forEach(function (s) {
        if (s && typeof s === 'object' && !s._sid) { s._sid = U.uid('s'); changed = true; }
      });
    });
    return changed;
  };

  Session.entryOf = function (entryId, d) {
    d = d || Session.draft();
    if (!d || !entryId) return null;
    return d.entries.find(function (en) { return en && en.id === entryId; }) || null;
  };

  // -> {entry, set, ei, si} | null
  Session.findSet = function (entryId, sid, d) {
    d = d || Session.draft();
    if (!d) return null;
    for (let ei = 0; ei < d.entries.length; ei++) {
      const en = d.entries[ei];
      if (!en || (entryId && en.id !== entryId)) continue;
      const sets = Array.isArray(en.sets) ? en.sets : [];
      for (let si = 0; si < sets.length; si++) {
        if (sets[si] && sets[si]._sid === sid) return { entry: en, set: sets[si], ei: ei, si: si };
      }
      if (entryId) return null;
    }
    return null;
  };

  /* ---------- subscriptions ---------- */

  Session.subscribe = function (fn) {
    if (typeof fn !== 'function') return function () { /* noop */ };
    subs.push(fn);
    return function () {
      const i = subs.indexOf(fn);
      if (i >= 0) subs.splice(i, 1);
    };
  };

  // reason: 'change' (structure/values moved — safe to repaint) | 'tick'
  // (clock only — subscribers MUST NOT rebuild DOM that holds focus/caret).
  function notify(reason) {
    const st = Session.state();
    st.reason = reason || 'change';
    for (let i = 0; i < subs.length; i++) {
      try { subs[i](st); } catch (e) { /* a bad subscriber never breaks the clock */ }
    }
  }

  Session.notify = notify;

  /* ---------- kinds + pace resolution ---------- */

  function isPace(v) { return PACES.indexOf(v) >= 0; }

  Session.PACES = PACES;
  Session.PACE_LABELS = PACE_LABELS;
  Session.PACE_DEFAULTS = PACE_DEFAULTS;
  Session.isPace = isPace;

  // Pace kind of ONE entry (what the defaults table is keyed by).
  Session.kindOfEntry = function (en) {
    if (!en) return 'mixed';
    if (isLiftEntry(en)) return 'lift';
    if (isSetworkEntry(en)) return entryIsStretch(en) ? 'stretch' : 'durability';
    if (en.type === 'cardio') {
      if (en.mode === 'circuit') return 'circuit';
      if (en.intervals && num(en.intervals.reps) > 0) return 'interval';
      return 'cardio';
    }
    return 'mixed';
  };

  // Pace kind of the WHOLE draft (what the session chip and the defaults table
  // key off). An explicit `_kind`, stamped by the entry sheets at seed time,
  // wins over what the entries happen to look like.
  Session.kindOfDraft = function (d) {
    d = d || Session.draft();
    if (d && PACE_DEFAULTS[d._kind] !== undefined) return d._kind;
    const kinds = [];
    ((d && d.entries) || []).forEach(function (en) {
      const k = Session.kindOfEntry(en);
      if (kinds.indexOf(k) < 0) kinds.push(k);
    });
    if (!kinds.length) return 'lift';
    if (kinds.length === 1) return kinds[0];
    // A routine that mixes lifts with one drivable kind is that kind: lifts
    // have no driver, so they never contest the session default.
    const driven = kinds.filter(function (k) { return k !== 'lift'; });
    return driven.length === 1 ? driven[0] : 'mixed';
  };

  function paceSettings(u) {
    const s = (u || user() || {}).settings || {};
    const p = s.pace;
    if (p && typeof p === 'object') return p;
    if (isPace(p)) {
      // tolerate a scalar written by a future/other client
      const map = {};
      Object.keys(PACE_DEFAULTS).forEach(function (k) { map[k] = p; });
      return map;
    }
    return {};
  }

  Session.defaultPaceFor = function (kind) {
    const stored = paceSettings()[kind];
    if (isPace(stored)) return stored;
    return PACE_DEFAULTS[kind] || 'off';
  };

  // The routine ITEM layer of the precedence chain. Both spellings are read:
  // draftFromRoutine mirrors an item onto the entry ('_itemPace',
  // '_itemRestSec', '_tempo'), and a draft seeded elsewhere may instead carry
  // the routine's own item map at draft._routine.items[exerciseRef].
  function routineItemOf(en, d) {
    const rt = d && d._routine;
    const items = rt && rt.items;
    if (!en || !items || typeof items !== 'object' || Array.isArray(items)) return null;
    const ref = en.exerciseRef || en.exerciseId;
    const it = ref ? items[ref] : null;
    return it && typeof it === 'object' ? it : null;
  }

  // Precedence (lowest -> highest), binding:
  //   user.settings.pace[kind] -> routine.pace -> item.pace -> draft._pace
  //   -> entry._pace -> the button just tapped
  Session.resolvePace = function (entryOrId, action, d) {
    d = d || Session.draft();
    const en = typeof entryOrId === 'string' ? Session.entryOf(entryOrId, d) : entryOrId;
    const kind = en ? Session.kindOfEntry(en) : Session.kindOfDraft(d);
    let p = Session.defaultPaceFor(kind);
    if (d && d._routine && isPace(d._routine.pace)) p = d._routine.pace;
    const item = routineItemOf(en, d);
    if (item && isPace(item.pace)) p = item.pace;
    if (en && isPace(en._itemPace)) p = en._itemPace;
    if (d && isPace(d._pace)) p = d._pace;
    if (en && isPace(en._pace)) p = en._pace;
    if (isPace(action)) p = action;
    return p;
  };

  // cadence — the tempo metronome INSIDE a timed set; orthogonal to pace.
  Session.resolveCadence = function (entryOrId, d) {
    d = d || Session.draft();
    const en = typeof entryOrId === 'string' ? Session.entryOf(entryOrId, d) : entryOrId;
    const u = user();
    let c = !!(u && u.settings && u.settings.cadence);
    if (d && d._routine && typeof d._routine.cadence === 'boolean') c = d._routine.cadence;
    if (d && typeof d._cadence === 'boolean') c = d._cadence;
    if (en && typeof en._cadence === 'boolean') c = en._cadence;
    return c;
  };

  // Tempo is a PRESCRIPTION, never an observation: it lives on the routine
  // item (mirrored to entry._tempo) and can physically never be recorded on a
  // lift set (normalizeSet rebuilds them to four keys everywhere).
  Session.tempoOf = function (entryOrId, d) {
    d = d || Session.draft();
    const en = typeof entryOrId === 'string' ? Session.entryOf(entryOrId, d) : entryOrId;
    const item = routineItemOf(en, d);
    const raw = (en && en._tempo) || (item && item.tempo) ||
      (d && d._routine && d._routine.tempo) || null;
    return raw ? String(raw) : null;
  };

  // '3-1-3' / '3-0-1-0' -> seconds per rep (0 when unusable).
  Session.tempoSecPerRep = function (tempo) {
    if (!tempo) return 0;
    const parts = String(tempo).split(/[^0-9.]+/).filter(function (x) { return x !== ''; });
    if (!parts.length) return 0;
    let sum = 0;
    parts.forEach(function (p) { sum += num(p); });
    return sum > 0 ? sum : 0;
  };

  // Rest chain mirrors the pace chain:
  //   user.settings.restSec (or restTimerSec) -> routine.restSec
  //   -> item restSec -> draft._restSec -> entry._restSec
  Session.restSecFor = function (entryOrId, d) {
    d = d || Session.draft();
    const en = typeof entryOrId === 'string' ? Session.entryOf(entryOrId, d) : entryOrId;
    const s = (user() || {}).settings || {};
    let sec = num(s.restSec) > 0 ? Math.round(num(s.restSec))
      : (num(s.restTimerSec) > 0 ? Math.round(num(s.restTimerSec)) : DEFAULT_REST_SEC);
    if (d && d._routine && d._routine.restSec !== undefined && d._routine.restSec !== null) {
      sec = Math.max(0, Math.round(num(d._routine.restSec)));
    }
    const restItem = routineItemOf(en, d);
    if (restItem && num(restItem.restSec) > 0) sec = Math.round(num(restItem.restSec));
    if (en && en._itemRestSec !== undefined && en._itemRestSec !== null) {
      sec = Math.max(0, Math.round(num(en._itemRestSec)));
    }
    if (d && d._restSec !== undefined && d._restSec !== null) {
      sec = Math.max(0, Math.round(num(d._restSec)));
    }
    if (en && en._restSec !== undefined && en._restSec !== null) {
      sec = Math.max(0, Math.round(num(en._restSec)));
    }
    return Math.max(0, sec);
  };

  /* ---------- pace / cadence writers ---------- */

  Session.setSessionPace = function (p) {
    const d = Session.draft();
    if (!d) return false;
    if (isPace(p)) d._pace = p; else delete d._pace;
    persist(d);
    return true;
  };

  Session.setEntryPace = function (entryId, p) {
    const d = Session.draft();
    const en = Session.entryOf(entryId, d);
    if (!en) return false;
    if (isPace(p)) en._pace = p; else delete en._pace;
    persist(d);
    return true;
  };

  Session.setCadence = function (on) {
    const d = Session.draft();
    if (!d) return false;
    d._cadence = !!on;
    persist(d);
    return true;
  };

  Session.setRestSec = function (sec) {
    const d = Session.draft();
    if (!d) return false;
    d._restSec = Math.max(0, Math.round(num(sec)));
    persist(d);
    return true;
  };

  // Remember a pace as this user's default for a kind. mergeSettings carries
  // unknown settings keys through untouched (P0 forward-compat clause), so
  // old clients preserve `settings.pace` — but it REPLACES the object, so the
  // whole map is written every time.
  Session.setPaceDefault = function (kind, p) {
    const u = user();
    if (!u || !isPace(p) || !kind) return false;
    const map = {};
    const cur = paceSettings(u);
    Object.keys(cur).forEach(function (k) { if (isPace(cur[k])) map[k] = cur[k]; });
    map[kind] = p;
    if (window.Store && Store.updateUser) Store.updateUser(u.id, { settings: { pace: map } });
    return true;
  };

  Session.setCadenceDefault = function (on) {
    const u = user();
    if (!u) return false;
    if (window.Store && Store.updateUser) Store.updateUser(u.id, { settings: { cadence: !!on } });
    return true;
  };

  /* ---------- drivers ---------- */

  Session.shapeOf = function (entryOrId, d) {
    const en = typeof entryOrId === 'string' ? Session.entryOf(entryOrId, d) : entryOrId;
    return shapeOfEntry(en);
  };

  // Target seconds for a hold-shaped set: its own value, else the nearest
  // filled value in the same entry, else 30s (P3 builder rule).
  Session.targetSecOf = function (en, set) {
    if (num(set && set.holdSec) > 0) return Math.round(num(set.holdSec));
    if (num(set && set._tHoldSec) > 0) return Math.round(num(set._tHoldSec));
    const sets = (en && Array.isArray(en.sets)) ? en.sets : [];
    for (let i = 0; i < sets.length; i++) {
      if (num(sets[i] && sets[i].holdSec) > 0) return Math.round(num(sets[i].holdSec));
      if (num(sets[i] && sets[i]._tHoldSec) > 0) return Math.round(num(sets[i]._tHoldSec));
    }
    return DEFAULT_HOLD_SEC;
  };

  // Per-shape set drivers (binding table):
  //   hold, stretch(static|pnf|loaded) -> countdown(target)
  //   stretch(dynamic), weight_reps    -> metronome ONLY with a tempo
  //   carry                            -> elapsed stopwatch
  // 'The app drives every step it can time deterministically; the user
  //  triggers every step it cannot.'
  Session.driverFor = function (en, set, d) {
    const shape = shapeOfEntry(en);
    if (!shape) return null;
    if (shape === 'hold') {
      return { driver: 'countdown', targetSec: Session.targetSecOf(en, set) };
    }
    if (shape === 'carry') return { driver: 'stopwatch', targetSec: 0 };
    // 'only with a tempo': the TEMPO is what makes a reps set timeable. The
    // rep count is only how long it runs, so an unfilled row falls back to its
    // own PRESCRIBED count (_tReps — the routine target that no longer squats
    // in the observation field), then to the nearest filled/prescribed row in
    // the same entry (the P3 builder rule), and only then to 8.
    const perRep = Session.tempoSecPerRep(Session.tempoOf(en, d));
    if (!(perRep > 0)) return null; // no driver — ✓ advances
    const own = num(set && set.reps) > 0 ? Math.round(num(set.reps))
      : (num(set && set._tReps) > 0 ? Math.round(num(set._tReps)) : 0);
    const borrowed = own > 0 ? null : ownRepsFallback(en);
    const reps = borrowed ? borrowed.reps : own;
    // DEFAULT_TEMPO_REPS only gives the CLOCK a length. It was never
    // prescribed and was never counted, so it must not be recorded as an
    // observation — the row stays empty and is dropped at save, exactly as it
    // would be with no tempo at all.
    const drv = { driver: 'metronome', targetSec: Math.round(perRep * reps), autoReps: reps, perRep: perRep };
    if (borrowed && borrowed.fabricated) drv.repsFabricated = 1;
    return drv;
  };

  /* ---------- timer slot (single, bound to (entryId, _sid)) ---------- */

  function timerOf(d) { return (d && d._timer) || null; }

  Session.timer = function () { return timerOf(Session.draft()); };

  Session.isRunning = function () {
    const t = timerOf(Session.draft());
    return !!t && !t.boundary;
  };

  function elapsedMs(t) {
    if (!t) return 0;
    const end = t.frozenAt || t.pausedAt || now();
    return Math.max(0, end - t.startedAt - (t.pausedMs || 0));
  }

  function remainMs(t) {
    if (!t || !(t.targetSec > 0)) return Infinity;
    return t.targetSec * 1000 - elapsedMs(t);
  }

  Session.elapsedSec = function () { return Math.round(elapsedMs(timerOf(Session.draft())) / 1000); };

  function setCursorRef(d, entryId, sid) {
    if (!d) return;
    if (!entryId) { delete d._active; return; }
    d._active = { entryId: entryId, sid: sid || null };
  }

  Session.cursor = function () {
    const d = Session.draft();
    return (d && d._active) || null;
  };

  // The cursor is ADVISORY, never modal — editing any other row never moves it.
  Session.setCursor = function (entryId, sid) {
    const d = Session.draft();
    if (!d) return false;
    setCursorRef(d, entryId, sid);
    persist(d);
    return true;
  };

  function ensureEngine() {
    if (engineIv || typeof setInterval !== 'function') return;
    engineIv = setInterval(function () { Session.tick(); }, 250);
  }

  function stopEngine() {
    if (engineIv && typeof clearInterval === 'function') clearInterval(engineIv);
    engineIv = null;
  }

  // The timer is persisted ON the draft, so it outlives the JS context: a
  // reload, a PWA relaunch, a discarded tab or a crash rehydrates a live
  // _timer with no interval behind it. armTimer() is the only other caller of
  // ensureEngine(), so without this the rehydrated timer is a zombie — it
  // never ticks, never expires, fires no cue, and is finally reaped by
  // reconcile() with a wall-clock holdSec. ensureEngine() is idempotent and
  // Session.tick() stops the interval once the slot is empty.
  function resumeEngine(d) {
    const t = timerOf(d || Session.draft());
    if (t && !t.boundary && !t.pausedAt) ensureEngine();
    return !!t;
  }

  function armTimer(d, en, set, opts) {
    opts = opts || {};
    const t = {
      entryId: en.id,
      sid: set ? sidOf(set) : null,
      phase: opts.phase === 'rest' ? 'rest' : 'work',
      driver: opts.driver || 'countdown',
      targetSec: Math.max(0, Math.round(num(opts.targetSec))),
      armedTarget: Math.max(0, Math.round(num(opts.armedTarget !== undefined ? opts.armedTarget : opts.targetSec))),
      chain: isPace(opts.chain) ? opts.chain : 'set',
      startedAt: now(),
      pausedAt: 0,
      pausedMs: 0,
      frozenAt: 0,
      boundary: 0,
      saidTen: 0,
      tickedAt: now()
    };
    if (num(opts.autoReps) > 0) t.autoReps = Math.round(num(opts.autoReps));
    // seconds per rep — lets an early stop record the reps that were actually
    // metronomed instead of the whole prescription
    if (num(opts.perRep) > 0) t.perRep = num(opts.perRep);
    // the rep count was invented for the clock's length, never prescribed
    if (opts.repsFabricated) t.repsFabricated = 1;
    d._timer = t;
    ensureEngine();
    return t;
  }

  function clearTimer(d) {
    if (d && d._timer) delete d._timer;
    lastPos = null;   // a stale position must never leak into a later session
    stopEngine();
  }

  function clearChain(d) {
    if (d && d._chain) delete d._chain;
  }

  /* ---------- pending-set walk ---------- */

  function refAt(d, ei, si) {
    const en = d.entries[ei];
    const set = en && Array.isArray(en.sets) ? en.sets[si] : null;
    if (!en || !set) return null;
    return { entry: en, set: set, ei: ei, si: si };
  }

  // Next set that is not done, in draft order, strictly after (ei, si).
  // scopeEntryId limits the walk to one entry ('exercise' pace).
  function nextPending(d, ei, si, scopeEntryId) {
    if (!d) return null;
    for (let e = ei < 0 ? 0 : ei; e < d.entries.length; e++) {
      const en = d.entries[e];
      if (!isRunnableEntry(en)) continue;
      if (scopeEntryId && en.id !== scopeEntryId) continue;
      const sets = Array.isArray(en.sets) ? en.sets : [];
      for (let s = 0; s < sets.length; s++) {
        if (e === ei && s <= si) continue;
        if (!setIsDone(sets[s])) return refAt(d, e, s);
      }
      if (scopeEntryId) return null;
    }
    return null;
  }

  // Recovery for an orphaned binding: the next pending set AFTER where it sat,
  // falling back to the first pending one only when nothing is left ahead.
  // The deleted set/entry took its index with it and everything behind it
  // shifted down into that slot, so the scan resumes AT the vacated index —
  // one before where the orphan sat — never at the top of the draft.
  function pendingAfter(d, pos, entryAlive) {
    if (!pos) return nextPending(d, 0, -1, null);
    const si = entryAlive ? pos.si - 1 : -1;
    return nextPending(d, pos.ei, si, null) || nextPending(d, 0, -1, null);
  }

  Session.next = function (d) {
    d = d || Session.draft();
    const cur = Session.cursor();
    let ei = -1;
    let si = -1;
    if (cur) {
      const at = Session.findSet(cur.entryId, cur.sid, d);
      if (at) { ei = at.ei; si = at.si; }
    }
    const ref = nextPending(d, ei < 0 ? 0 : ei, si, null);
    if (!ref) return null;
    return { entryId: ref.entry.id, sid: sidOf(ref.set), entry: ref.entry, set: ref.set };
  };

  // First pending set of the whole draft (or of one entry).
  Session.firstPending = function (entryId, d) {
    d = d || Session.draft();
    const ref = nextPending(d, 0, -1, entryId || null);
    if (!ref) return null;
    return { entryId: ref.entry.id, sid: sidOf(ref.set), entry: ref.entry, set: ref.set };
  };

  Session.progress = function (d) {
    d = d || Session.draft();
    const p = Player.projectDraft(d);
    return { done: p.doneCount, total: p.workCount, remainSec: p.remainSec, estSec: p.estSec };
  };

  /* ---------- public run verbs ---------- */

  // Tap a set's NUMBER -> run exactly that set, whatever the resolved pace.
  Session.runSet = function (entryId, sid, opts) {
    opts = opts || {};
    const d = Session.draft();
    if (!d) return false;
    Session.backfill(d);
    const at = Session.findSet(entryId, sid, d);
    if (!at) return false;
    const pace = Session.resolvePace(at.entry, opts.pace, d);
    const chain = pace === 'off' ? 'set' : pace;
    return startWork(d, at.entry, at.set, chain, opts);
  };

  // Tap a card's STOPWATCH -> run that exercise (its sets + rests), then STOP.
  Session.runExercise = function (entryId, opts) {
    opts = opts || {};
    const d = Session.draft();
    if (!d) return false;
    Session.backfill(d);
    const first = Session.firstPending(entryId, d);
    if (!first) { toast('Every set here is done'); return false; }
    return startWork(d, first.entry, first.set, 'exercise', opts);
  };

  Session.runSession = function (opts) {
    opts = opts || {};
    const d = Session.draft();
    if (!d) return false;
    Session.backfill(d);
    const cur = Session.cursor();
    let first = null;
    if (cur) {
      const at = Session.findSet(cur.entryId, cur.sid, d);
      if (at && !setIsDone(at.set)) first = { entry: at.entry, set: at.set };
    }
    if (!first) first = Session.firstPending(null, d);
    if (!first) { toast('Every set is done'); return false; }
    return startWork(d, first.entry, first.set, 'session', opts);
  };

  // Low-level arm: the tapped button always wins for that one action.
  function startWork(d, en, set, chain, opts) {
    opts = opts || {};
    const drv = Session.driverFor(en, set, d);
    setCursorRef(d, en.id, sidOf(set));
    if (chain === 'exercise' || chain === 'session') {
      d._chain = { pace: chain, entryId: en.id };
    } else {
      clearChain(d);
    }
    if (!drv) {
      // nothing to time (reps without a tempo) — hand back to the user; ✓
      // continues the chain via Session.noteSetDone().
      clearTimer(d);
      persist(d);
      cueSetArmed(en, set);
      notify();
      return true;   // handled — Session.isRunning() reports whether a clock ticks
    }
    const targetSec = num(opts.targetSec) > 0 ? Math.round(num(opts.targetSec)) : drv.targetSec;
    armTimer(d, en, set, {
      phase: 'work',
      driver: drv.driver,
      targetSec: targetSec,
      armedTarget: drv.driver === 'countdown' ? ownTargetSec(set) : 0,
      chain: chain,
      autoReps: drv.autoReps,
      perRep: drv.perRep,
      repsFabricated: drv.repsFabricated
    });
    persist(d);
    cueSetArmed(en, set);
    notify();
    return true;
  }

  // -> {reps, fabricated}. 'Borrow the sibling row's reps (typed or prescribed)'
  // and 'invent 8 so the clock has a length' are two different things: only the
  // first is a real prescription, and only the first may ever be written back
  // to the set. A guided routine's target now rides on _tReps rather than in
  // `reps`, so it must be read here too — otherwise a prescribed tempo lift
  // silently drops to DEFAULT_TEMPO_REPS.
  function ownRepsFallback(en) {
    const sets = (en && Array.isArray(en.sets)) ? en.sets : [];
    for (let i = 0; i < sets.length; i++) {
      const s = sets[i];
      if (num(s && s.reps) > 0) return { reps: Math.round(num(s.reps)), fabricated: false };
      if (num(s && s._tReps) > 0) return { reps: Math.round(num(s._tReps)), fabricated: false };
    }
    return { reps: DEFAULT_TEMPO_REPS, fabricated: true };
  }

  // Only the running set's OWN typed target retargets it — editing a sibling
  // row must never move the running clock (nor the cursor).
  function ownTargetSec(set) {
    return num(set && set.holdSec) > 0 ? Math.round(num(set.holdSec)) : 0;
  }

  Session.arm = function (entryId, sid, opts) { return Session.runSet(entryId, sid, opts); };

  // −15s / +15s adjusts the CURRENT target; never below 5s total or 1s left.
  // Re-deriving from REAL elapsed keeps 'seconds actually held' honest.
  Session.adjust = function (deltaSec) {
    const d = Session.draft();
    const t = timerOf(d);
    if (!t || !(t.targetSec > 0)) return false;
    let next;
    if (t.boundary) {
      // A frozen boundary is asking 'how long was that really?'. Its elapsed
      // floor is meaningless (the clock stopped), and refusing the adjust is
      // what forced 'confirm the full target or nothing' — i.e. holdSec became
      // the plan, which the binding rule forbids. Clamp to the 5s floor only.
      next = Math.max(5, t.targetSec + Math.round(num(deltaSec)));
    } else {
      const el = Math.max(0, Math.round(elapsedMs(t) / 1000));
      next = Math.max(5, Math.max(el + 1, t.targetSec + Math.round(num(deltaSec))));
    }
    if (next === t.targetSec) return false;
    t.targetSec = next;
    // armedTarget tracks the SET's own value, not the timer's — leaving it
    // alone is what lets reconcile tell 'the row was edited' from 'the pill
    // was tapped', so an adjust survives the next save.
    persist(d);
    notify();
    return true;
  };

  Session.pause = function () { return setPaused(true); };
  Session.resume = function () { return setPaused(false); };
  Session.togglePause = function () {
    const t = timerOf(Session.draft());
    return setPaused(!(t && t.pausedAt));
  };

  function setPaused(want) {
    const d = Session.draft();
    const t = timerOf(d);
    if (!t || t.boundary) return false;
    if (want && !t.pausedAt) t.pausedAt = now();
    else if (!want && t.pausedAt) {
      t.pausedMs = (t.pausedMs || 0) + Math.max(0, now() - t.pausedAt);
      t.pausedAt = 0;
    } else return false;
    persist(d);
    notify();
    return true;
  }

  Session.isPaused = function () {
    const t = timerOf(Session.draft());
    return !!(t && t.pausedAt);
  };

  // Cancel the timer cleanly: keep the session, record NOTHING for it.
  Session.cancel = function (opts) {
    opts = opts || {};
    const d = Session.draft();
    if (!d) return false;
    const had = !!d._timer;
    clearTimer(d);
    if (!opts.keepChain) clearChain(d);
    if (had || !opts.keepChain) persist(d);
    notify();
    return had;
  };

  // Early finish (or the driver expiring) — records what ACTUALLY happened.
  // ONE RULE EVERYWHERE: holdSec is the seconds actually held; an early stop
  // records the short time and overtime records the long one.
  Session.done = function (vals) {
    const d = Session.draft();
    const t = timerOf(d);
    if (!d || !t) return false;
    if (t.phase === 'rest') return Session.skipRest();
    const at = Session.findSet(t.entryId, t.sid, d);
    if (!at) { clearTimer(d); persist(d); notify(); return false; }
    const actualSec = Math.max(1, Math.round(elapsedMs(t) / 1000));
    return completeWork(d, at.entry, at.set, t, actualSec, vals || null);
  };

  // The builder's ✓ (or the focus 'Done' on an untimed set): record + chain.
  Session.completeSet = function (entryId, sid, vals) {
    const d = Session.draft();
    if (!d) return false;
    const at = Session.findSet(entryId, sid, d);
    if (!at) return false;
    const t = timerOf(d);
    const mine = t && t.phase === 'work' && t.entryId === entryId && t.sid === sid;
    const actualSec = mine ? Math.max(1, Math.round(elapsedMs(t) / 1000)) : 0;
    return completeWork(d, at.entry, at.set, mine ? t : null, actualSec, vals || null);
  };

  // Hook for the builder's own ✓ handler: it already wrote the values and
  // set.done — this only continues an armed chain (no-op when idle).
  Session.noteSetDone = function (entryId, sid) {
    const d = Session.draft();
    if (!d) return false;
    const t = timerOf(d);
    if (boundaryOwedElsewhere(t, entryId, sid)) {
      // An 'expired while the screen was off' answer is still owed. Never
      // reuse the slot from another row: the chain's rest would overwrite the
      // boundary and the set the user really held would be silently lost.
      persist(d);
      notify();
      return false;
    }
    if (t && t.phase === 'work' && t.entryId === entryId && t.sid === sid) {
      clearTimer(d);
    }
    const chain = d._chain;
    if (!chain || (chain.pace !== 'exercise' && chain.pace !== 'session')) {
      persist(d);
      notify();
      return false;
    }
    const at = Session.findSet(entryId, sid, d);
    if (!at) { persist(d); notify(); return false; }
    if (chain.pace === 'exercise' && chain.entryId !== entryId) { persist(d); notify(); return false; }
    afterWork(d, at.entry, at.set, chain.pace);
    persist(d);
    notify();
    return true;
  };

  // A set that would record NOTHING is dropped by buildFinishedEntries; the
  // builder's ✓ never does that, so neither may the focus view's Done.
  function recordableSet(en, set) {
    if (!set) return false;
    return isSetworkEntry(en)
      ? (num(set.reps) > 0 || num(set.holdSec) > 0 || num(set.distanceM) > 0)
      : num(set.reps) > 0;
  }

  // Reps that were really metronomed. A full run yields exactly the target (so
  // the driver table's 'auto-✓ at targetReps' is preserved); an early stop
  // records the short count, exactly as holdSec records the short time.
  function metronomedReps(t, actualSec) {
    const target = Math.round(num(t && t.autoReps));
    if (!(target > 0)) return 0;
    const per = num(t && t.perRep);
    if (!(per > 0) || !(actualSec > 0)) return target;
    return Math.min(target, Math.max(1, Math.round(actualSec / per)));
  }

  function writeActuals(en, set, t, actualSec, vals) {
    const shape = shapeOfEntry(en);
    vals = vals || {};
    // t.repsFabricated: the count exists only to give the clock a length — it
    // was never prescribed and never counted, so it is never written back.
    const autoReps = (t && num(t.autoReps) > 0 && !t.repsFabricated) ? metronomedReps(t, actualSec) : 0;
    if (isSetworkEntry(en)) {
      if (shape === 'hold' && actualSec > 0) set.holdSec = Math.max(1, Math.round(actualSec));
      if (num(vals.holdSec) > 0) set.holdSec = Math.max(1, Math.round(num(vals.holdSec)));
      if (num(vals.reps) > 0) set.reps = Math.round(num(vals.reps));
      else if (shape === 'reps' && autoReps > 0 && !(num(set.reps) > 0)) {
        set.reps = autoReps;
      }
      if (num(vals.distanceM) > 0) set.distanceM = Math.round(num(vals.distanceM));
      if (num(vals.weightKg) > 0) set.weightKg = num(vals.weightKg);
      if (num(vals.intensity) > 0) set.intensity = U.clamp(Math.round(num(vals.intensity)), 1, 4);
    } else {
      // lift set — exactly {weightKg, reps, type, rpe} survives to Store
      if (num(vals.reps) > 0) set.reps = Math.round(num(vals.reps));
      else if (autoReps > 0 && !(num(set.reps) > 0)) set.reps = autoReps;
      if (num(vals.weightKg) > 0) set.weightKg = num(vals.weightKg);
      // A metronome writes the rep count itself, which makes the set
      // 'recordable' and so skips the host's hint entirely. Its own PRESCRIBED
      // load is the load the row was showing, so a driven tempo set is not
      // logged at a phantom 0 kg. Nothing is invented: no _t key, no write.
      else if (autoReps > 0 && !(num(set.weightKg) > 0) && num(set._tWeightKg) > 0) {
        set.weightKg = num(set._tWeightKg);
      }
    }
    // A carry is an elapsed stopwatch: the clock NEVER measures distance or
    // load. And the focus view's 'Done ✓' reaches here with vals = null on rows
    // the user never typed into. Either way, stopping a set with nothing
    // recordable accepts exactly what the builder's ✓ would have prefilled,
    // via the host's hint — asked once, at record time; nothing is invented
    // here, and a row with no hint anywhere still records nothing.
    if (host.prefill && (shape === 'carry' || !recordableSet(en, set))) {
      try { host.prefill(en, set); } catch (e) { /* a missing hint never blocks a save */ }
    }
    if (!isSetworkEntry(en)) {
      // after the hint, so a prefilled row still ends up four-key shaped
      if (set.type !== 'warmup') set.type = 'work';
      if (set.rpe === undefined) set.rpe = null;
    }
    set.done = true;
  }

  // A boundary is pending, and it belongs to some OTHER set — the slot is not
  // free and no unrelated action may take it.
  function boundaryOwedElsewhere(t, entryId, sid) {
    return !!(t && t.boundary && !(t.entryId === entryId && t.sid === sid));
  }

  function completeWork(d, en, set, t, actualSec, vals) {
    writeActuals(en, set, t, actualSec, vals);
    const chain = t && isPace(t.chain) ? t.chain : ((d._chain && d._chain.pace) || 'set');
    // Completing an untimed set must not evict a boundary owed on another row
    // (the focus view's Done, or a ✓ elsewhere): keep the slot and the chain,
    // and just record this set. The boundary keeps asking until it is answered.
    const keep = boundaryOwedElsewhere(timerOf(d), en.id, sidOf(set));
    if (!keep) clearTimer(d);
    d._lastDone = { entryId: en.id, sid: sidOf(set), stretch: entryIsStretch(en), at: now() };
    if (!keep) afterWork(d, en, set, chain);
    persist(d);
    notify();
    return true;
  }

  // Chain semantics: 'set' hands back after that set; 'exercise' drives
  // work->rest->next inside ONE entry and stops at its end; 'session' chains
  // across entries (incl. the inter-exercise transition). Never a trailing
  // rest: the session is over when the work is.
  function afterWork(d, en, set, chain) {
    if (chain !== 'exercise' && chain !== 'session') {
      clearChain(d);
      const nx = nextPending(d, indexOfEntry(d, en.id), indexOfSet(en, set), null);
      if (nx) setCursorRef(d, nx.entry.id, sidOf(nx.set));
      advisoryRest(d, en);
      return;
    }
    const scope = chain === 'exercise' ? en.id : null;
    const nx = nextPending(d, indexOfEntry(d, en.id), indexOfSet(en, set), scope);
    if (!nx) {
      clearTimer(d);
      clearChain(d);
      const after = nextPending(d, indexOfEntry(d, en.id), indexOfSet(en, set), null);
      if (after) setCursorRef(d, after.entry.id, sidOf(after.set));
      cueDone(!after);
      return;
    }
    setCursorRef(d, nx.entry.id, sidOf(nx.set));
    d._chain = { pace: chain, entryId: chain === 'exercise' ? en.id : nx.entry.id };
    // A rest is bound to the set it LEADS TO, not the one that just finished:
    // the focus view reads the timer's binding as 'what is up next' (its
    // next-up card and ring) and reads d._lastDone for 'what just finished'
    // (the depth ask). Anchoring forward is also what makes deleting the
    // upcoming set cancel the rest that exists only to precede it.
    const restSec = Session.restSecFor(nx.entry, d);
    if (restSec > 0) {
      armTimer(d, nx.entry, nx.set, {
        phase: 'rest', driver: 'countdown', targetSec: restSec, armedTarget: restSec, chain: chain
      });
      cueRestStart();
      return;
    }
    armNext(d, chain, nx);
  }

  function indexOfEntry(d, entryId) {
    for (let i = 0; i < d.entries.length; i++) {
      if (d.entries[i] && d.entries[i].id === entryId) return i;
    }
    return -1;
  }

  function indexOfSet(en, set) {
    const sets = (en && Array.isArray(en.sets)) ? en.sets : [];
    return sets.indexOf(set);
  }

  // Rest is over -> arm the next set if it has a driver, else hand back (the
  // chain stays armed so the user's ✓ resumes it).
  function armNext(d, chain, ref) {
    const nx = ref || nextPendingFromCursor(d, chain);
    if (!nx) {
      clearTimer(d);
      clearChain(d);
      cueDone(true);
      return false;
    }
    setCursorRef(d, nx.entry.id, sidOf(nx.set));
    const drv = Session.driverFor(nx.entry, nx.set, d);
    if (!drv) {
      clearTimer(d);
      d._chain = { pace: chain, entryId: nx.entry.id };
      cueSetArmed(nx.entry, nx.set);
      return false;
    }
    d._chain = { pace: chain, entryId: nx.entry.id };
    armTimer(d, nx.entry, nx.set, {
      phase: 'work',
      driver: drv.driver,
      targetSec: drv.targetSec,
      armedTarget: drv.driver === 'countdown' ? ownTargetSec(nx.set) : 0,
      chain: chain,
      autoReps: drv.autoReps,
      perRep: drv.perRep,
      repsFabricated: drv.repsFabricated
    });
    cueSetArmed(nx.entry, nx.set);
    return true;
  }

  function nextPendingFromCursor(d, chain) {
    const cur = d._active;
    const scope = chain === 'exercise' ? (d._chain && d._chain.entryId) : null;
    if (cur) {
      const at = Session.findSet(cur.entryId, cur.sid, d);
      if (at && !setIsDone(at.set) && (!scope || at.entry.id === scope)) return at;
      if (at) return nextPending(d, at.ei, at.si, scope);
    }
    return nextPending(d, 0, -1, scope);
  }

  Session.skipRest = function () {
    const d = Session.draft();
    const t = timerOf(d);
    if (!t || t.phase !== 'rest') return false;
    const chain = isPace(t.chain) ? t.chain : 'set';
    clearTimer(d);
    armNext(d, chain, null);
    persist(d);
    notify();
    return true;
  };

  // Advisory rest (pace off/set): the app does NOT drive it — it just tells
  // the builder to show today's rest pill, unchanged.
  function advisoryRest(d, en) {
    if (entryIsStretch(en)) return;
    const sec = Session.restSecFor(en, d);
    if (!(sec > 0)) return;
    const VL = window.ViewsLog;
    if (VL && typeof VL.startRestPill === 'function') {
      try { VL.startRestPill(sec); return; } catch (e) { /* fall through */ }
    }
    try {
      if (hasDoc() && typeof CustomEvent === 'function') {
        document.dispatchEvent(new CustomEvent('ironlog:advisory-rest', { detail: { sec: sec } }));
      }
    } catch (e) { /* ignore */ }
  }

  /* ---------- cues ---------- */

  function cueSetArmed(en, set) {
    const shape = shapeOfEntry(en);
    if (set && (set.side === 'L' || set.side === 'R')) {
      speak(set.side === 'L' ? 'left side' : 'right side');
    } else {
      speak(exName(entryExId(en)));
    }
    if (shape === 'hold') vibrate(40);
  }

  function cueRestStart() { vibrate(30); }

  function cueDone(sessionOver) {
    vibrate([180, 90, 180]);
    beep(sessionOver ? 'finish' : 'work');
    if (sessionOver) speak('all done');
  }

  /* ---------- tick / expiry / boundary ---------- */

  Session.tick = function (nowMs) {
    if (typeof nowMs === 'number') {
      const prev = nowFn;
      nowFn = function () { return nowMs; };
      try { return Session.tick(); } finally { nowFn = prev; }
    }
    const d = Session.draft();
    const t = timerOf(d);
    if (!t) { stopEngine(); if (d) notify('tick'); return false; }
    // heartbeat: proof the clock was alive at this instant. reconcile() reads
    // it to tell 'the target was edited below elapsed' (live, expire now) from
    // 'this passed zero while nothing was running' (the user never saw it).
    t.tickedAt = now();
    if (t.boundary || t.pausedAt) { notify('tick'); return false; }
    if (t.driver === 'stopwatch') { notify('tick'); return false; }
    const left = remainMs(t);
    if (t.phase === 'work' && !t.saidTen && t.targetSec >= 20 && left <= 10400 && left > 8000) {
      t.saidTen = 1;
      speak('last ten seconds');
    }
    if (left > 0) { notify('tick'); return false; }
    expire(d, t);
    return true;
  };

  // Expired while the tab is hidden -> MARK a boundary, never silently
  // record. On return the UI shows what expired and the user confirms or
  // adjusts.
  function expire(d, t) {
    if (isHidden()) {
      t.boundary = 1;
      t.frozenAt = t.startedAt + (t.pausedMs || 0) + t.targetSec * 1000;
      persist(d);
      notify();
      return;
    }
    resolveExpiry(d, t);
  }

  function resolveExpiry(d, t) {
    const at = Session.findSet(t.entryId, t.sid, d);
    if (!at) { clearTimer(d); persist(d); notify(); return; }
    if (t.phase === 'rest') {
      const chain = isPace(t.chain) ? t.chain : 'set';
      clearTimer(d);
      vibrate([90]);
      beep('rest');
      armNext(d, chain, null);
      persist(d);
      notify();
      return;
    }
    // A countdown that RAN to zero records the seconds it ran (its target) —
    // that is what actually happened. A target edited BELOW the seconds
    // already held expires immediately and records the real elapsed time
    // instead; either way holdSec is never the plan when the plan is a lie.
    const actual = t.overrun
      ? Math.max(1, Math.round(elapsedMs(t) / 1000))
      : Math.max(1, Math.round(t.targetSec));
    vibrate([180, 90, 180]);
    beep('work');
    completeWork(d, at.entry, at.set, t, actual, null);
  }

  Session.boundary = function () {
    const t = timerOf(Session.draft());
    if (!t || !t.boundary) return null;
    const d = Session.draft();
    const at = Session.findSet(t.entryId, t.sid, d);
    return {
      entryId: t.entryId,
      sid: t.sid,
      phase: t.phase,
      sec: t.targetSec,
      exerciseId: at ? entryExId(at.entry) : null,
      expiredAt: t.frozenAt || 0
    };
  };

  // Confirm what expired while hidden (optionally with an adjusted actual).
  Session.confirmBoundary = function (opts) {
    opts = opts || {};
    const d = Session.draft();
    const t = timerOf(d);
    if (!t || !t.boundary) return false;
    t.boundary = 0;
    if (num(opts.sec) > 0) t.targetSec = Math.round(num(opts.sec));
    resolveExpiry(d, t);
    return true;
  };

  // Throw away what expired while hidden — records nothing, keeps the session.
  Session.discardBoundary = function () {
    const d = Session.draft();
    const t = timerOf(d);
    if (!t || !t.boundary) return false;
    clearTimer(d);
    clearChain(d);
    persist(d);
    notify();
    return true;
  };

  /* ---------- reconcile: THE choke point ----------
     Every draft mutation funnels through saveDraft(); this retargets or
     orphan-checks the running timer. Authoritative rules (binding):
       - editing the RUNNING set's target -> retarget live, preserving elapsed
         (remain = newTarget − elapsed; already past -> expire immediately)
       - deleting the running SET, or its ENTRY -> cancel cleanly, keep the
         session, record nothing, advance the cursor to the next pending set
       - reordering around the running set -> binding is by _sid, so it follows
       - starting a second timer -> the first is cancelled (single slot)
       - backgrounded/expired while hidden -> mark boundary, never record
       - the cursor is ADVISORY: editing any other row never moves it
  */

  Session.reconcile = function () {
    if (reconciling) return false;
    const d = Session.draft();
    if (!d) { stopEngine(); return false; }
    reconciling = true;
    let dirty = false;
    let expired = null;
    try {
      dirty = Session.backfill(d) || dirty;
      const t = timerOf(d);
      if (t) {
        resumeEngine(d);   // un-zombie a timer that survived a reload/relaunch
        const at = Session.findSet(t.entryId, t.sid, d);
        const en = Session.entryOf(t.entryId, d);
        if (!en || !at) {
          // running set (or its whole entry) deleted
          const cur = d._active;
          const was = lastPos;          // clearTimer() drops the memo
          clearTimer(d);
          clearChain(d);
          if (cur && cur.entryId === t.entryId && cur.sid === t.sid) {
            // 'advance the cursor to the NEXT pending set' — resume from where
            // the running set actually sat, never from the top of the draft. A
            // scan from index 0 teleports a user who is deep in a workout back
            // to exercise 1 whenever anything earlier is still pending.
            const nx = pendingAfter(d, was, !!Session.entryOf(t.entryId, d));
            if (nx) setCursorRef(d, nx.entry.id, sidOf(nx.set));
            else delete d._active;
          }
          dirty = true;
        } else if (t.phase === 'work' && setIsDone(at.set) && !t.boundary) {
          // the set was completed elsewhere (builder ✓) — release the slot
          clearTimer(d);
          dirty = true;
        } else if (t.boundary) {
          // A frozen boundary still answers to the same 'editing the RUNNING
          // set's target retargets it' rule: adopt a typed correction so the
          // user's number survives confirmBoundary() instead of being
          // clobbered by the stale plan.
          lastPos = { ei: at.ei, si: at.si };
          const own = t.phase === 'work' && t.driver === 'countdown' ? ownTargetSec(at.set) : 0;
          if (own > 0 && own !== t.armedTarget) {
            t.armedTarget = own;
            t.targetSec = own;
            dirty = true;
          }
        } else {
          lastPos = { ei: at.ei, si: at.si };
          const want = t.phase === 'rest'
            ? Session.restSecFor(at.entry, d)
            : (t.driver === 'countdown' ? ownTargetSec(at.set) : 0);
          if (t.driver !== 'stopwatch' && want > 0 && want !== t.armedTarget) {
            t.armedTarget = want;
            t.targetSec = want;      // elapsed is preserved by construction
            dirty = true;
          }
          if (t.driver !== 'stopwatch' && t.targetSec > 0 && !t.pausedAt && remainMs(t) <= 0) {
            if (now() - num(t.tickedAt || t.startedAt) > ENGINE_STALL_MS) {
              // The clock was NOT running when this passed zero (reload, PWA
              // relaunch, discarded tab). The user did not witness it, so it
              // must never be recorded — least of all as wall-clock-since-arm,
              // which grows with idle time. Route it into the boundary flow
              // the contract prescribes for an expiry nobody saw.
              t.boundary = 1;
              t.frozenAt = t.startedAt + (t.pausedMs || 0) + t.targetSec * 1000;
              dirty = true;
            } else {
              t.overrun = 1;         // 'if already past, expire immediately'
              expired = t;
            }
          }
        }
      }
      if (d._chain && !Session.entryOf(d._chain.entryId, d)) {
        clearChain(d);
        dirty = true;
      }
      if (d._active) {
        const curAt = Session.findSet(d._active.entryId, d._active.sid, d);
        if (curAt) {
          lastCursorPos = { ei: curAt.ei, si: curAt.si };
        } else {
          // same rule as a deleted running set: forward from where it sat
          const nx = pendingAfter(d, lastCursorPos, !!Session.entryOf(d._active.entryId, d));
          if (nx) setCursorRef(d, nx.entry.id, sidOf(nx.set));
          else delete d._active;
          lastCursorPos = null;
          dirty = true;
        }
      }
      if (dirty) {
        if (host.saveDraft) { try { host.saveDraft(); } catch (e) { lsWrite(d); } }
        else lsWrite(d);
      }
    } finally {
      reconciling = false;
    }
    if (expired) expire(d, expired);
    notify();
    return dirty;
  };

  /* ---------- renderer-facing snapshot ---------- */

  Session.state = function () {
    const d = Session.draft();
    const t = timerOf(d);
    const st = {
      hasDraft: !!d,
      view: (d && d._view) || 'builder',
      pace: d ? Session.resolvePace(null, null, d) : 'off',
      cadence: d ? Session.resolveCadence(null, d) : false,
      running: false,
      phase: null,
      driver: null,
      chain: (d && d._chain && d._chain.pace) || null,
      entryId: null,
      sid: null,
      targetSec: 0,
      elapsedSec: 0,
      remainSec: 0,
      frac: 0,
      paused: false,
      boundary: false,
      cursor: (d && d._active) || null,
      lastDone: (d && d._lastDone) || null
    };
    if (!t) return st;
    st.running = !t.boundary;
    st.phase = t.phase;
    st.driver = t.driver;
    st.entryId = t.entryId;
    st.sid = t.sid;
    st.targetSec = t.targetSec;
    st.elapsedSec = Math.round(elapsedMs(t) / 1000);
    st.paused = !!t.pausedAt;
    st.boundary = !!t.boundary;
    if (t.targetSec > 0) {
      const left = Math.max(0, remainMs(t));
      st.remainSec = Math.ceil(left / 1000);
      st.frac = U.clamp(left / (t.targetSec * 1000), 0, 1);
    } else {
      st.remainSec = 0;
      st.frac = 0;
    }
    return st;
  };

  /* ---------- depth (stretch) ---------- */

  // Writes STRETCH DEPTH onto ONE set (per-set actuals stay per-set) and
  // remembers it as the entry's sticky aim.
  Session.setDepth = function (entryId, sid, n) {
    const d = Session.draft();
    const at = Session.findSet(entryId, sid, d);
    if (!at) return false;
    const v = U.clamp(Math.round(num(n)) || 2, 1, 4);
    at.set.intensity = v;
    at.entry._depth = v;
    persist(d);
    notify();
    return true;
  };

  /* ---------- circuit rounds (the draft's cardio circuit entry) ---------- */

  // The circuit's live record. views-log seeds the rounds/stations/AMRAP
  // config as the draft-local `_circuit` layer (plus one real entry per
  // station); a draft-local layer can never be saved, so the round player
  // materializes the ordinary P3 cardio entry that carries rounds + stations
  // and keeps the two in step. Nothing is compiled and nothing is copied —
  // both live on the same single record.
  Session.circuitEntry = function (d) {
    d = d || Session.draft();
    if (!d || !Array.isArray(d.entries)) return null;
    let en = d.entries.find(isCircuitEntry) || null;
    const cfg = d._circuit && typeof d._circuit === 'object' ? d._circuit : null;
    if (!en && cfg) {
      en = {
        id: U.uid('en'),
        type: 'cardio',
        mode: 'circuit',
        durationMin: 0,
        rounds: Math.max(0, Math.round(num(cfg.rounds0))),
        stations: (Array.isArray(cfg.stations) ? cfg.stations : []).map(function (st) {
          const o = {};
          for (const k in st) { if (k.charAt(0) !== '_') o[k] = st[k]; }
          return o;
        })
      };
      if (num(cfg.rounds) > 0) en._targetRounds = Math.round(num(cfg.rounds));
      if (num(cfg.amrapSec) > 0) en._amrapSec = Math.round(num(cfg.amrapSec));
      en._startedAt = now();   // this circuit's own start, not the session's
      d.entries.push(en);
      persist(d);
    }
    if (en && cfg) cfg.rounds0 = Math.max(0, Math.round(num(en.rounds)));
    return en;
  };

  // When the circuit itself started. Draft-local ('_'-prefixed), so it never
  // reaches Store; a missing value degrades to the session's start.
  function circuitStartedAt(en, d) {
    if (en && num(en._startedAt) > 0) return num(en._startedAt);
    if (d && num(d.startedAt) > 0) return num(d.startedAt);
    return now();
  }

  Session.closeRound = function (entryId) {
    const d = Session.draft();
    const en = entryId ? Session.entryOf(entryId, d) : Session.circuitEntry(d);
    if (!en) return false;
    en.rounds = Math.max(0, Math.round(num(en.rounds))) + 1;
    en._stationIdx = 0;
    // The circuit's OWN elapsed time. Falling back to d.startedAt keeps an
    // in-flight draft written by an older build working (it just degrades to
    // the old number rather than throwing).
    en.durationMin = Math.max(1, Math.round((now() - circuitStartedAt(en, d)) / 60000));
    vibrate([180, 90, 180]);
    beep('work');
    persist(d);
    notify();
    return true;
  };

  Session.setStation = function (entryId, idx) {
    const d = Session.draft();
    const en = entryId ? Session.entryOf(entryId, d) : Session.circuitEntry(d);
    if (!en) return false;
    en._stationIdx = Math.max(0, Math.round(num(idx)));
    persist(d);
    notify();
    return true;
  };

  /* ---------- set editing helpers (used by the focus fix-sheet) ---------- */

  Session.updateSet = function (entryId, sid, patch) {
    const d = Session.draft();
    const at = Session.findSet(entryId, sid, d);
    if (!at || !patch) return false;
    const s = at.set;
    Object.keys(patch).forEach(function (k) {
      const v = patch[k];
      if (v === null || v === undefined || v === '') { if (k !== 'done') delete s[k]; return; }
      if (k === 'side') {
        // Lift sets can NEVER carry a side — normalizeSet rebuilds them to
        // four keys on every client, so accepting one here would show the
        // user a badge for a distinction that is dropped at save.
        if (isLiftEntry(at.entry)) { delete s.side; return; }
        s.side = v === 'L' || v === 'R' ? v : undefined; if (!s.side) delete s.side; return;
      }
      if (k === 'done') { s.done = !!v; return; }
      const n = num(v);
      if (n > 0) s[k] = k === 'weightKg' ? n : Math.round(n);
      else delete s[k];
    });
    persist(d);
    notify();
    return true;
  };

  Session.addSet = function (entryId, seedSid) {
    const d = Session.draft();
    const en = Session.entryOf(entryId, d);
    if (!en) return null;
    if (!Array.isArray(en.sets)) en.sets = [];
    const last = en.sets[en.sets.length - 1] || null;
    const ex = exOf(entryExId(en));
    const next = { done: false };
    if (isLiftEntry(en)) {
      next.weightKg = last ? num(last.weightKg) : 0;
      next.reps = last ? Math.round(num(last.reps)) : 0;
      next.type = last && last.type === 'warmup' ? 'warmup' : 'work';
      next.rpe = null;
    } else if (last) {
      ['reps', 'holdSec', 'distanceM', 'weightKg'].forEach(function (k) {
        if (num(last[k]) > 0) next[k] = last[k];
      });
    }
    if (isLiftEntry(en)) {
      // A lift set can never carry a side. A perSide LIFT expands to TWO
      // plain sets, exactly as draftFromRoutine seeds it — the L/R rhythm
      // lives in the set COUNT, which survives normalizeSet.
      sidOf(next);
      en.sets.push(next);
      if (ex && ex.perSide) {
        const twin = { weightKg: next.weightKg, reps: next.reps, type: next.type, rpe: null, done: false };
        sidOf(twin);
        en.sets.push(twin);
      }
    } else {
      if (ex && ex.perSide) next.side = last && last.side === 'L' ? 'R' : 'L';
      else if (last && (last.side === 'L' || last.side === 'R')) next.side = last.side === 'L' ? 'R' : 'L';
      sidOf(next);
      en.sets.push(next);
    }
    persist(d);
    notify();
    return next._sid;
  };

  Session.removeSet = function (entryId, sid) {
    const d = Session.draft();
    const at = Session.findSet(entryId, sid, d);
    if (!at) return false;
    at.entry.sets.splice(at.si, 1);
    persist(d);   // reconcile cancels the timer if this was the running set
    notify();
    return true;
  };

  Session.removeEntry = function (entryId) {
    const d = Session.draft();
    if (!d) return false;
    const before = d.entries.length;
    d.entries = d.entries.filter(function (en) { return !en || en.id !== entryId; });
    if (d.entries.length === before) return false;
    persist(d);
    notify();
    return true;
  };

  Session.moveEntry = function (entryId, delta) {
    const d = Session.draft();
    if (!d) return false;
    const i = indexOfEntry(d, entryId);
    const j = i + (num(delta) > 0 ? 1 : -1);
    if (i < 0 || j < 0 || j >= d.entries.length) return false;
    const tmp = d.entries[i];
    d.entries[i] = d.entries[j];
    d.entries[j] = tmp;
    persist(d);
    notify();
    return true;
  };

  /* ---------- presentation ---------- */

  Session.view = function () {
    const d = Session.draft();
    return (d && d._view) || 'builder';
  };

  // Switching is one tap in BOTH directions and never interrupts a timer.
  Session.setView = function (v) {
    const d = Session.draft();
    if (!d) return false;
    d._view = v === 'focus' ? 'focus' : 'builder';
    const VL = VLAPI();
    if (d._view === 'focus') {
      persist(d);
      Player.openFocus();
    } else {
      Player.closeFocus({ navigate: false });
      const live = VL && typeof VL.live === 'function' ? VL.live() : null;
      if (live && typeof live.toBuilder === 'function') live.toBuilder();
      else {
        persist(d);
        if (window.App && App.navigate) App.navigate('log');
        if (window.App && App.rerender) App.rerender();
      }
    }
    notify();
    return true;
  };

  /* ======================================================================
     Legacy P3.5 shadow state — DELETED.

     A stale 'ironlog/activeSession' left by a shipped P3.5 client is
     discarded safely on boot (app.js still calls Player.resumePending(),
     which now always answers null after cleaning up).
     ====================================================================== */

  Player.discardLegacySession = function () {
    if (!hasLS()) return false;
    try {
      if (localStorage.getItem(LEGACY_SESSION_KEY) === null) return false;
      localStorage.removeItem(LEGACY_SESSION_KEY);
      return true;
    } catch (e) { return false; }
  };

  Player.resumePending = function () { Player.discardLegacySession(); return null; };
  Player.discardPending = function () { Player.discardLegacySession(); };
  Player.resume = function () { Player.discardLegacySession(); return false; };

  /* ======================================================================
     Session start — seed the ONE session record, then present it
     ====================================================================== */

  Player.isActive = function () { return !!root; };

  // Start (or extend) the live session from a routine. Performance mode only.
  Player.start = function (routine, opts) {
    opts = opts || {};
    const u = user();
    if (!u) { toast('Create a profile first', 'err'); return false; }
    if (!perfMode(u)) { toast('Guided sessions live in Performance mode', 'err'); return false; }
    Player.discardLegacySession();
    const seeded = Player.draftFromRoutine(routine, {
      userId: u.id,
      name: opts.name || (routine && routine.name),
      routineRef: opts.routineRef
    });
    if (!seeded || !seeded.entries.length) { toast('This routine has nothing to run yet', 'err'); return false; }

    const cur = Session.draft();
    if (cur && cur.userId && cur.userId !== u.id) {
      toast('Another profile has a workout in progress', 'err');
      return false;
    }
    let d;
    if (cur && Array.isArray(cur.entries) && cur.entries.length) {
      // one live session: a routine started on top of an open draft joins it
      seeded.entries.forEach(function (en) { cur.entries.push(en); });
      if (!cur._routine) cur._routine = seeded._routine;
      d = cur;
      Session.backfill(d);
      Session.save();
      toast('Added to your workout', 'ok');
    } else {
      d = Session.setDraft(seeded);
    }
    const wantFocus = opts.view === 'focus' ||
      (opts.view !== 'builder' && Session.kindOfDraft(d) === 'circuit');
    d._view = wantFocus ? 'focus' : 'builder';
    Session.save();
    // Hand the record to the log view: it re-reads the draft and dispatches to
    // the builder or (via Player.renderFocus) to the focus presentation.
    if (!wantFocus) Player.closeFocus({ navigate: false });
    if (window.App && App.navigate) App.navigate('log');
    if (window.App && App.rerender) App.rerender();
    if (wantFocus) Player.openFocus();
    return true;
  };

  /* ======================================================================
     Focus view — a RENDERER over the draft. It owns no session data.
     ====================================================================== */

  let root = null;         // overlay element
  let paintIv = null;
  let chromePrev = null;
  let unsub = null;
  let lastSig = '';
  let armedAt = 0;         // re-render-under-pointer guard for the ring

  function onVisibility() {
    if (!root) return;
    if (document.visibilityState === 'visible') {
      acquireWake();        // re-acquire (iOS drops it)
      Session.tick();
      repaint(true);
    }
  }

  function onKeydown(e) {
    if (!root || e.key !== 'Escape') return;
    if (document.querySelector('.modal-backdrop')) return; // sheets own Escape
    e.preventDefault();
    Session.setView('builder');
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

  function svgI(inner) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" ' +
      'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
  }

  const VOICE_ON_ICON = svgI('<path d="M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.4 5.6a9 9 0 0 1 0 12.8"/>');
  const VOICE_OFF_ICON = svgI('<path d="M11 5 6 9H3v6h3l5 4zM16 9.8l4.4 4.4M20.4 9.8 16 14.2"/>');
  const BUILDER_ICON = svgI('<rect x="4" y="3.5" width="16" height="17" rx="3"/><path d="M8 8.5h8M8 12.5h8M8 16.5h4.5"/>');

  /* views-log's renderLog() hands the log view over to the focus
     presentation with Player.renderFocus(container, live) whenever
     draft._view === 'focus'. The focus view is a full-screen overlay owned
     outside the view system (chrome hidden, never destroyed by navigation),
     so the container only carries a non-blank fallback panel behind it. */
  Player.renderFocus = function (container, live) {
    if (!container) return false;
    Player.discardLegacySession();
    container.innerHTML =
      '<div class="card" style="text-align:center;padding:28px 20px">' +
        '<h3 style="font-size:17px;margin-bottom:6px">Focus view</h3>' +
        '<p class="muted" style="font-size:14px;max-width:340px;margin:0 auto 16px">' +
          'Running this session full screen. Everything you log here lands in the same workout.</p>' +
        '<button type="button" class="btn ghost" id="pl-to-builder">Back to builder</button>' +
      '</div>';
    const back = U.$('#pl-to-builder', container);
    if (back) {
      back.addEventListener('click', function () {
        if (live && typeof live.toBuilder === 'function') live.toBuilder();
        else Session.setView('builder');
      });
    }
    const ok = Player.openFocus({ from: 'view' });
    if (!ok && live && typeof live.toBuilder === 'function') live.toBuilder();
    return ok;
  };

  Player.openFocus = function (opts) {
    opts = opts || {};
    if (!hasDoc()) return false;
    const d = Session.draft();
    if (!d) { toast('No workout in progress', 'err'); return false; }
    if (!perfMode()) { toast('The focus view lives in Performance mode', 'err'); return false; }
    if (root) { repaint(true); return true; }
    if (d._view !== 'focus') { d._view = 'focus'; Session.save(); }

    root = U.el(
      '<div class="player-overlay" role="dialog" aria-modal="true" aria-label="Session focus view">' +
        '<div class="player-top">' +
          '<button type="button" class="player-x" data-p="quit" aria-label="Back to builder">' +
            (ic().close || '✕') + '</button>' +
          '<div class="player-meta">' +
            '<div class="nm"></div>' +
            '<div class="sub" data-p="sub"></div>' +
          '</div>' +
          '<button type="button" class="player-x" data-p="voice" aria-label="Toggle voice cues" aria-pressed="false"></button>' +
          '<button type="button" class="player-x" data-p="builder" aria-label="Back to builder" ' +
            'style="width:auto;border-radius:999px;padding:0 12px;gap:6px;color:var(--text)">' +
            BUILDER_ICON + '<span style="font-size:12.5px;font-weight:700">Builder</span></button>' +
        '</div>' +
        '<div class="player-rail"><div class="fill" data-p="rail"></div></div>' +
        '<div class="player-stage" data-p="stage"></div>' +
        '<div class="player-foot" data-p="foot"></div>' +
      '</div>');
    root.querySelector('.player-meta .nm').textContent = d.name || 'Session';
    document.body.appendChild(root);
    document.body.style.overflow = 'hidden';
    hideChrome();
    paintVoiceBtn();

    U.on(root, 'click', '[data-p="quit"]', function () { Session.setView('builder'); });
    U.on(root, 'click', '[data-p="builder"]', function () { Session.setView('builder'); });
    U.on(root, 'click', '[data-p="voice"]', function () {
      const u = user();
      const next = voiceOn() ? 'off' : 'on';
      if (u && window.Store && Store.updateUser) Store.updateUser(u.id, { settings: { playerVoice: next } });
      paintVoiceBtn();
      toast(next === 'on' ? 'Voice cues on' : 'Voice cues muted');
    });
    // audio context needs a user gesture — any tap inside the overlay arms it
    root.addEventListener('pointerdown', ensureAudio);

    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('keydown', onKeydown, true);
    acquireWake();
    if (paintIv) clearInterval(paintIv);
    // repaint() is signature-guarded: it only rebuilds the stage when the
    // screen actually changed and otherwise just moves the clock. Polling it
    // keeps the overlay honest even when a repaint is triggered by a draft
    // write that lands between two engine notifications.
    paintIv = setInterval(function () { repaint(); }, 250);
    if (!unsub) {
      const offA = Session.subscribe(function (st) {
        if (!root) return;
        if (st.reason === 'tick') paintClock();
        else repaint();
      });
      // views-log also publishes a draft revision on every write
      const VL = VLAPI();
      const offB = VL && typeof VL.subscribeDraft === 'function'
        ? VL.subscribeDraft(function () { if (root) repaint(); })
        : null;
      unsub = function () { offA(); if (offB) offB(); };
    }
    lastSig = '';
    repaint(true);
    return true;
  };

  Player.closeFocus = function (opts) {
    opts = opts || {};
    if (paintIv) { clearInterval(paintIv); paintIv = null; }
    if (unsub) { unsub(); unsub = null; }
    if (!root) return false;
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('keydown', onKeydown, true);
    releaseWake();
    try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    root.remove();
    root = null;
    restoreChrome();
    document.body.style.overflow = '';
    lastSig = '';
    if (opts.navigate !== false && window.App && App.navigate) App.navigate('log');
    return true;
  };

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

  // Every structural render REPLACES the stage/foot nodes so the previous
  // screen's delegated listeners die with them (P3.5 ghost-tap fix).
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

  function ringHTML(sizePx, radius, stroke, color, asButton) {
    const c = 2 * Math.PI * radius;
    const cx = sizePx / 2;
    const svg =
      '<svg width="' + sizePx + '" height="' + sizePx + '" viewBox="0 0 ' + sizePx + ' ' + sizePx + '">' +
        '<circle cx="' + cx + '" cy="' + cx + '" r="' + radius + '" stroke="rgba(255,255,255,.09)" stroke-width="' + stroke + '" fill="none"/>' +
        '<circle class="ring-arc" cx="' + cx + '" cy="' + cx + '" r="' + radius + '" stroke="' + color + '" stroke-width="' + stroke + '" fill="none" ' +
          'stroke-linecap="round" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="0"/>' +
      '</svg>';
    const inner = svg +
      '<div class="ring-time"><div class="big" data-p="clock">0:00</div><div class="of" data-p="of"></div></div>';
    if (asButton) {
      return '<button type="button" class="player-ring" style="width:' + sizePx + 'px;height:' + sizePx + 'px" ' +
        'data-p="ring" aria-label="Finish this set now">' + inner + '</button>';
    }
    return '<div class="player-ring" style="width:' + sizePx + 'px;height:' + sizePx + 'px">' + inner + '</div>';
  }

  function sideBadge(set) {
    if (!set || (set.side !== 'L' && set.side !== 'R')) return '';
    return '<div class="player-side-badge">' + (set.side === 'L' ? 'LEFT' : 'RIGHT') + '</div>';
  }

  function setTargetLabel(en, s) {
    const shape = shapeOfEntry(en);
    const bits = [];
    if (shape === 'hold') bits.push(fmtClock(Session.targetSecOf(en, s)));
    if (num(s && s.reps) > 0 && shape !== 'hold') bits.push('× ' + Math.round(num(s.reps)));
    if (num(s && s.distanceM) > 0) bits.push(Math.round(num(s.distanceM)) + ' m');
    if (num(s && s.weightKg) > 0) bits.push('@ ' + fmtWeight(s.weightKg));
    return bits.join(' ');
  }

  // 'Last time' line from history — mirrors the builder's PREV hints.
  function lastTimeText(en, s) {
    const u = user();
    if (!window.Store || !Store.workoutsFor || !u) return '';
    const exId = entryExId(en);
    const ws = Store.workoutsFor(u.id);
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i];
      const sets = [];
      let lift = false;
      (w.entries || []).forEach(function (x) {
        if (!x) return;
        if (x.type === 'setwork' && x.exerciseRef === exId) {
          (x.sets || []).forEach(function (y) { sets.push(y); });
        } else if (x.exerciseId === exId && (!x.type || x.type === 'lift')) {
          lift = true;
          (x.sets || []).forEach(function (y) { sets.push(y); });
        }
      });
      if (!sets.length) continue;
      let pick = sets[0];
      if (s && (s.side === 'L' || s.side === 'R')) {
        for (let j = 0; j < sets.length; j++) {
          if (sets[j].side === s.side) { pick = sets[j]; break; }
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

  // The set the focus view is showing: the cursor when it still points at a
  // pending set, else the first pending one.
  function focusRef(d, st) {
    if (st && st.entryId && (st.running || st.boundary)) {
      const bound = Session.findSet(st.entryId, st.sid, d);
      if (bound) return bound;
    }
    const t = d && d._timer;
    if (t) {
      const at = Session.findSet(t.entryId, t.sid, d);
      if (at) return at;
    }
    const cur = d && d._active;
    if (cur) {
      const at = Session.findSet(cur.entryId, cur.sid, d);
      if (at) return at;
    }
    const first = Session.firstPending(null, d);
    return first ? Session.findSet(first.entryId, first.sid, d) : null;
  }

  function nextStripHTML(d, at) {
    const nx = at ? nextPendingRef(d, at) : null;
    if (!nx) return '<div class="player-next"><span class="lbl">NEXT</span><span>Finish 🎉</span></div>';
    const sameOtherSide = nx.entry.id === at.entry.id && nx.set.side && at.set.side && nx.set.side !== at.set.side;
    const label = sameOtherSide
      ? exName(entryExId(nx.entry)) + ' — ' + (nx.set.side === 'L' ? 'left' : 'right') + ' side'
      : exName(entryExId(nx.entry));
    return '<div class="player-next"><span class="lbl">NEXT</span>' +
      '<span class="nm">' + U.esc(label) + '</span>' +
      '<span class="tg">' + U.esc(setTargetLabel(nx.entry, nx.set)) + '</span></div>';
  }

  function nextPendingRef(d, at) {
    for (let e = at.ei; e < d.entries.length; e++) {
      const en = d.entries[e];
      if (!isRunnableEntry(en)) continue;
      const sets = en.sets || [];
      for (let s = 0; s < sets.length; s++) {
        if (e === at.ei && s <= at.si) continue;
        if (!sets[s].done) return { entry: en, set: sets[s], ei: e, si: s };
      }
    }
    return null;
  }

  /* ---------- the set peek strip (tap a set — the clock keeps running) ---------- */

  // A peek chip is the same three states as a builder set row, so it spends the
  // same palette tokens: DONE is the accent tint (the completed-set colour the
  // manual log already uses — one meaning, one hue), RUNNING is the --blue
  // tint (the machine is driving this set), pending is the plain card. The
  // values are read from the stylesheet at paint time via var(), so a per-user
  // theme moves the chips with everything else — no colour is frozen here.
  function peekHTML(d, at) {
    const sets = (at.entry.sets || []);
    const t = d._timer;
    let html = '<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-top:14px">';
    sets.forEach(function (s, i) {
      const sid = sidOf(s);
      const running = !!(t && t.phase === 'work' && t.sid === sid);
      const done = !!s.done;
      const cls = done ? 'done' : (running ? 'cur' : '');
      html += '<button type="button" data-peek="' + U.esc(sid) + '" ' +
        'style="display:inline-flex;align-items:center;gap:6px;padding:7px 11px;border-radius:999px;' +
        'border:1px solid ' + (running ? 'var(--blue)' : (done ? 'var(--accent-tint-strong)' : 'var(--border)')) + ';background:' +
        (done ? 'var(--accent-tint)' : (running ? 'var(--blue-tint)' : 'var(--card)')) + ';' +
        'color:var(--text);font-size:13px;font-variant-numeric:tabular-nums;min-height:36px" ' +
        'class="' + cls + '" aria-label="Set ' + (i + 1) + '">' +
        // secondary ink on a TINTED chip is --text-2, never --text-muted: the
        // composited tint drops muted under 4.5:1 (see §11 in css/styles.css).
        '<span style="color:' + (done || running ? 'var(--text-2)' : 'var(--text-muted)') +
        ';font-size:11px;font-weight:700">' + (i + 1) + '</span>' +
        U.esc(setTargetLabel(at.entry, s) || '—') + (done ? ' ✓' : '') + '</button>';
    });
    html += '<button type="button" data-peekadd="1" style="padding:7px 11px;border-radius:999px;' +
      'border:1px dashed var(--border);background:transparent;color:var(--text-2);min-height:36px">+</button>';
    html += '</div>' +
      '<div class="player-aim muted" style="font-size:12px;margin-top:4px">tap a set to fix it — the clock keeps running</div>';
    return html;
  }

  function wirePeek(stage, d, at) {
    U.on(stage, 'click', '[data-peek]', function (e, b) {
      openFixSheet(at.entry.id, b.getAttribute('data-peek'));
    });
    U.on(stage, 'click', '[data-peekadd]', function () {
      const sid = Session.addSet(at.entry.id);
      if (sid) openFixSheet(at.entry.id, sid);
    });
  }

  // The contextual escape: fix any set without leaving focus, without pausing.
  function openFixSheet(entryId, sid) {
    if (!window.App || !App.sheet) return;
    const d = Session.draft();
    const found = Session.findSet(entryId, sid, d);
    if (!found) return;
    const en = found.entry;
    const shape = shapeOfEntry(en);
    const s = found.set;
    const unit = U.unitLabel(window.App && App.units ? App.units() : 'kg');
    const content = document.createElement('div');
    let fields = '';
    if (shape === 'hold') {
      fields += '<div class="field"><label for="pf-hold">Hold (mm:ss)</label>' +
        '<input class="input" id="pf-hold" inputmode="numeric" autocomplete="off" value="' +
        (num(s.holdSec) > 0 ? fmtClock(s.holdSec) : '') + '" placeholder="0:45"></div>';
    }
    if (shape === 'reps' || shape === 'weight_reps') {
      fields += '<div class="field"><label for="pf-reps">Reps</label>' +
        '<input class="input" id="pf-reps" type="number" min="0" step="1" inputmode="numeric" value="' +
        (num(s.reps) > 0 ? Math.round(num(s.reps)) : '') + '"></div>';
    }
    if (shape === 'carry') {
      fields += '<div class="field"><label for="pf-m">Meters</label>' +
        '<input class="input" id="pf-m" type="number" min="0" step="5" inputmode="numeric" value="' +
        (num(s.distanceM) > 0 ? Math.round(num(s.distanceM)) : '') + '"></div>';
    }
    if (shape !== 'hold' || num(s.weightKg) > 0) {
      fields += '<div class="field"><label for="pf-kg">Weight (' + U.esc(unit) + ')</label>' +
        '<input class="input" id="pf-kg" type="number" min="0" step="0.5" inputmode="decimal" value="' +
        (num(s.weightKg) > 0 ? kgToDisplay(s.weightKg) : '') + '"></div>';
    }
    // never offer L/R on a lift set: the key does not survive normalizeSet, so
    // showing the chips would imply a distinction that is silently dropped
    const perSide = !isLiftEntry(en) &&
      (!!(exOf(entryExId(en)) || {}).perSide || s.side === 'L' || s.side === 'R');
    if (perSide) {
      fields += '<div class="field"><label>Side</label><div class="chip-row" id="pf-side">' +
        ['L', 'R'].map(function (x) {
          return '<button type="button" class="chip' + (s.side === x ? ' active' : '') + '" data-side="' + x + '">' +
            (x === 'L' ? 'Left' : 'Right') + '</button>';
        }).join('') + '</div></div>';
    }
    content.innerHTML =
      '<div class="muted" style="font-size:13px;margin-bottom:8px">' +
        U.esc(exName(entryExId(en))) + ' · set ' + (found.si + 1) + '</div>' + fields;

    const sheet = App.sheet({
      title: 'Fix this set',
      content: content,
      actions: [
        {
          label: 'Remove set',
          kind: 'danger',
          onClick: function () { Session.removeSet(entryId, sid); }
        },
        {
          label: 'Save',
          kind: 'primary',
          onClick: function () {
            const patch = {};
            const h = U.$('#pf-hold', content);
            const r = U.$('#pf-reps', content);
            const m = U.$('#pf-m', content);
            const k = U.$('#pf-kg', content);
            if (h) { const sec = parseSec(h.value); patch.holdSec = sec === null ? null : Math.round(sec); }
            if (r) patch.reps = r.value === '' ? null : Math.round(num(r.value));
            if (m) patch.distanceM = m.value === '' ? null : Math.round(num(m.value));
            if (k) patch.weightKg = k.value === '' ? null : displayToKg(k.value);
            Session.updateSet(entryId, sid, patch);
          }
        }
      ]
    });
    U.on(content, 'click', '[data-side]', function (e, b) {
      Session.updateSet(entryId, sid, { side: b.getAttribute('data-side') });
      U.$$('[data-side]', content).forEach(function (c) { c.classList.toggle('active', c === b); });
    });
    return sheet;
  }

  /* ---------- repaint ---------- */

  // What the screen depends on. Built from the NORMALIZED snapshot so it works
  // whether the local engine or views-log's drives the session.
  function sigOf(d, st, at) {
    return [
      st.view,
      (st.running || st.boundary)
        // a frozen boundary renders its target as text ("Confirm 0:15"), so an
        // adjust there has to move the signature; a live clock's target is
        // painted by paintClock and must not rebuild the stage under a finger
        ? st.phase + ':' + st.entryId + ':' + st.sid + (st.boundary ? 'b' + st.targetSec : '') +
          (st.paused ? 'p' : '')
        : 'idle',
      at ? at.entry.id + ':' + sidOf(at.set) : 'none',
      (d && d.entries.length) || 0,
      Session.progress(d).done,
      d && d._lastDone ? d._lastDone.sid : '',
      // The focused entry's own CONTENT. updateSet/addSet/removeSet — the three
      // verbs the fix sheet and the '+' chip call — move set fields or the sets
      // array of exactly one entry and nothing above. Without this term the
      // stage and the peek strip keep rendering the pre-edit targets until an
      // unrelated event moves the signature, i.e. the renderer contradicts the
      // draft it renders.
      at ? setsSig(at.entry) : '',
      at ? (at.entry._depth || '') : ''
    ].join('|');
  }

  function setsSig(en) {
    return ((en && en.sets) || []).map(function (s) {
      return sidOf(s) + '#' + (s.done ? 1 : 0) + '/' + (s.holdSec || '') + '/' + (s.reps || '') +
        '/' + (s.weightKg || '') + '/' + (s.distanceM || '') + '/' + (s.side || '') + '/' + (s.type || '');
    }).join(',');
  }

  function repaint(force) {
    if (!root) return;
    const d = Session.draft();
    if (!d) { Player.closeFocus(); return; }
    const st = Session.state();
    const nm = root.querySelector('.player-meta .nm');
    if (nm && nm.textContent !== (d.name || 'Session')) nm.textContent = d.name || 'Session';

    const circuit = Session.circuitEntry(d);
    const at = circuit ? null : focusRef(d, st);
    const sig = circuit ? 'circuit|' + circuit.rounds + '|' + (circuit._stationIdx || 0) : sigOf(d, st, at);
    if (!force && sig === lastSig) { paintClock(); return; }
    lastSig = sig;
    resetStageFoot();
    if (circuit) { renderCircuit(d, circuit); return; }
    if (st.boundary) { renderBoundary(d, st); return; }
    if (!at) { renderNothingPending(d); return; }
    if (st.running && st.phase === 'rest') renderRest(d, at, st);
    else renderWork(d, at, st);
  }

  function headerFor(d, at) {
    const p = Session.progress(d);
    const mins = Math.max(1, Math.round(p.remainSec / 60));
    setSub(Math.min(p.done + 1, Math.max(1, p.total)) + ' of ' + p.total + ' · about ' + mins + ' min left');
    setRail(p.total ? p.done / p.total : 0, !!(d._timer && d._timer.phase === 'rest'));
  }

  /* ---------- work screen ---------- */

  function renderWork(d, at, st) {
    const stage = stageEl();
    const foot = footEl();
    const en = at.entry;
    const s = at.set;
    const shape = shapeOfEntry(en);
    const running = st.running && st.phase === 'work';
    const stretch = entryIsStretch(en);
    const last = lastTimeText(en, s);
    const setNo = at.si + 1;
    const total = (en.sets || []).length;
    headerFor(d, at);
    armedAt = Date.now();

    let aim = '';
    if (stretch) {
      const dep = DEPTHS[U.clamp(Math.round(num(en._depth)) || 2, 1, 4) - 1];
      aim = 'Aim: <b>' + U.esc(dep.label) + ' depth</b> — ' + U.esc(dep.aim);
    } else if (num(s.weightKg) > 0) {
      aim = 'Load: <b>' + U.esc(fmtWeight(s.weightKg)) + '</b>';
    }

    let body;
    if (running && (st.driver === 'countdown' || st.driver === 'metronome')) {
      body = ringHTML(196, 88, 10, 'var(--accent)', true) +
        (aim ? '<div class="player-aim">' + aim + '</div>' : '') +
        (last ? '<div class="player-aim muted">' + U.esc(last) + '</div>' : '') +
        '<div class="player-adjust">' +
          '<button type="button" class="pm" data-p="minus">−15s</button>' +
          '<button type="button" class="pause" data-p="pause" aria-label="' + (st.paused ? 'Resume' : 'Pause') + '">' +
            (st.paused ? '▶' : '⏸') + '</button>' +
          '<button type="button" class="pm" data-p="plus">+15s</button>' +
        '</div>';
    } else if (running && st.driver === 'stopwatch') {
      body = ringHTML(196, 88, 10, 'var(--blue)', true) +
        (aim ? '<div class="player-aim">' + aim + '</div>' : '') +
        (last ? '<div class="player-aim muted">' + U.esc(last) + '</div>' : '');
    } else {
      const tgt = setTargetLabel(en, s) || (shape === 'hold' ? fmtClock(Session.targetSecOf(en, s)) : '—');
      body = '<div class="player-big-target">' + U.esc(tgt) + '</div>' +
        (aim ? '<div class="player-aim">' + aim + '</div>' : '') +
        (last ? '<div class="player-aim muted">' + U.esc(last) + '</div>' : '') +
        ((en._note) ? '<div class="player-aim muted">' + U.esc(en._note) + '</div>' : '');
    }

    stage.innerHTML =
      '<div class="player-ex-name">' + U.esc(exName(entryExId(en))) + '</div>' +
      '<div class="player-aim muted" style="margin-top:-2px">set ' + setNo + ' of ' + total + '</div>' +
      sideBadge(s) +
      body +
      peekHTML(d, at);

    const startable = !!Session.driverFor(en, s, d);
    foot.innerHTML =
      (running
        ? '<button type="button" class="player-bigbtn" data-p="done">Done ✓</button>'
        : (startable
          ? '<button type="button" class="player-bigbtn" data-p="start">▶ Start ' +
            U.esc(shape === 'hold' ? fmtClock(Session.targetSecOf(en, s)) : (setTargetLabel(en, s) || 'set')) + '</button>'
          : '<button type="button" class="player-bigbtn" data-p="done">Done ✓</button>')) +
      nextStripHTML(d, at);

    U.on(stage, 'click', '[data-p="ring"]', function () {
      if (Date.now() - armedAt < 300) return; // double-tap under a fresh render
      Session.done();
    });
    U.on(stage, 'click', '[data-p="pause"]', function () { Session.togglePause(); });
    U.on(stage, 'click', '[data-p="minus"]', function () { Session.adjust(-15); });
    U.on(stage, 'click', '[data-p="plus"]', function () { Session.adjust(15); });
    U.on(foot, 'click', '[data-p="start"]', function () { Session.runSet(en.id, sidOf(s)); });
    U.on(foot, 'click', '[data-p="done"]', function () {
      if (Session.isRunning() && st.phase === 'work') Session.done();
      else Session.completeSet(en.id, sidOf(s), null);
    });
    wirePeek(stage, d, at);
    paintClock();
  }

  /* ---------- rest screen ---------- */

  function renderRest(d, at, st) {
    const stage = stageEl();
    const foot = footEl();
    headerFor(d, at);
    const ld = lastDoneRef(d, at);
    let depthAsk = '';
    if (ld && ld.stretch) {
      const ref = Session.findSet(ld.entryId, ld.sid, d);
      const selected = ref && num(ref.set.intensity) >= 1
        ? U.clamp(Math.round(num(ref.set.intensity)), 1, 4)
        : U.clamp(Math.round(num(ref && ref.entry._depth)) || 2, 1, 4);
      depthAsk =
        '<div class="card player-ask">' +
          '<div class="lbl">THAT ' + U.esc(exName(ref ? entryExId(ref.entry) : '').toUpperCase()) +
            ' — HOW DEEP DID IT FEEL?</div>' +
          '<div class="segmented block player-depth">' +
            DEPTHS.map(function (dp) {
              return '<button type="button" data-depth="' + dp.n + '"' +
                (dp.n === selected ? ' class="active"' : '') + '>' + dp.n + ' · ' + dp.label + '</button>';
            }).join('') +
          '</div>' +
        '</div>';
    }
    const nx = at;
    const lt = lastTimeText(nx.entry, nx.set);
    const nextCard =
      '<div class="card player-ask">' +
        '<div class="lbl">NEXT UP</div>' +
        '<div class="nx">' + U.esc(exName(entryExId(nx.entry))) +
          (nx.set.side ? ' — ' + (nx.set.side === 'L' ? 'left' : 'right') : '') +
          (setTargetLabel(nx.entry, nx.set) ? ' · ' + U.esc(setTargetLabel(nx.entry, nx.set)) : '') + '</div>' +
        (lt ? '<div class="sub">' + U.esc(lt) + '</div>' : '') +
      '</div>';

    stage.innerHTML =
      '<div class="player-phase-lbl">REST</div>' +
      ringHTML(164, 72, 9, 'var(--blue)', false) +
      '<div class="player-adjust">' +
        '<button type="button" class="pm" data-p="minus">−15s</button>' +
        '<button type="button" class="pause" data-p="pause" aria-label="Pause">' + (st.paused ? '▶' : '⏸') + '</button>' +
        '<button type="button" class="pm" data-p="plus">+15s</button>' +
      '</div>' +
      depthAsk + nextCard;
    foot.innerHTML = '<button type="button" class="player-bigbtn ghost" data-p="skip">Skip rest →</button>';

    U.on(stage, 'click', '[data-depth]', function (e, b) {
      const n = U.clamp(parseInt(b.getAttribute('data-depth'), 10) || 2, 1, 4);
      if (ld) Session.setDepth(ld.entryId, ld.sid, n);
      U.$$('[data-depth]', stage).forEach(function (c) { c.classList.toggle('active', c === b); });
    });
    U.on(stage, 'click', '[data-p="pause"]', function () { Session.togglePause(); });
    U.on(stage, 'click', '[data-p="minus"]', function () { Session.adjust(-15); });
    U.on(stage, 'click', '[data-p="plus"]', function () { Session.adjust(15); });
    U.on(foot, 'click', '[data-p="skip"]', function () { Session.skipRest(); });
    paintClock();
  }

  // The set a rest belongs to. A rest is bound to the set it LEADS TO, so
  // 'what just finished' comes from d._lastDone; the walk backwards from the
  // cursor is the fallback for a rest that outlived its _lastDone record.
  function lastDoneRef(d, at) {
    if (d && d._lastDone) {
      const ref = Session.findSet(d._lastDone.entryId, d._lastDone.sid, d);
      if (ref) {
        return { entryId: d._lastDone.entryId, sid: d._lastDone.sid, stretch: entryIsStretch(ref.entry) };
      }
    }
    if (!at) return null;
    for (let e = at.ei; e >= 0; e--) {
      const en = d.entries[e];
      if (!isRunnableEntry(en)) continue;
      const sets = en.sets || [];
      for (let i = (e === at.ei ? at.si - 1 : sets.length - 1); i >= 0; i--) {
        if (sets[i] && sets[i].done) {
          return { entryId: en.id, sid: sidOf(sets[i]), stretch: entryIsStretch(en) };
        }
      }
    }
    return null;
  }

  /* ---------- boundary (expired while hidden) ---------- */

  function renderBoundary(d, st) {
    const stage = stageEl();
    const foot = footEl();
    const b = Session.boundary();
    const name = b && b.exerciseId ? exName(b.exerciseId) : 'That set';
    setSub('While you were away');
    stage.innerHTML =
      '<div class="player-ex-name">' + U.esc(name) + '</div>' +
      '<div class="player-big-target">' + U.esc(fmtClock(b ? b.sec : 0)) + '</div>' +
      '<div class="player-aim">' + (b && b.phase === 'rest'
        ? 'Your rest finished while the app was in the background.'
        : 'This ' + U.esc(fmtClock(b ? b.sec : 0)) + ' timer finished while the app was in the background — nothing was recorded yet.') +
      '</div>' +
      '<div class="player-aim muted">Confirm it, adjust it, or drop it and keep training.</div>' +
      // 'let the user confirm OR ADJUST' — without these the only honest
      // answer to 'I let go after 5 seconds' is to discard the whole set
      '<div class="player-adjust">' +
        '<button type="button" class="pm" data-p="minus">−15s</button>' +
        '<button type="button" class="pm" data-p="plus">+15s</button>' +
      '</div>';
    foot.innerHTML =
      '<button type="button" class="player-bigbtn" data-p="confirm">Confirm ' + U.esc(fmtClock(b ? b.sec : 0)) + '</button>' +
      '<button type="button" class="player-bigbtn ghost" data-p="drop">Didn’t happen</button>';
    U.on(stage, 'click', '[data-p="minus"]', function () { Session.adjust(-15); });
    U.on(stage, 'click', '[data-p="plus"]', function () { Session.adjust(15); });
    U.on(foot, 'click', '[data-p="confirm"]', function () { Session.confirmBoundary(); });
    U.on(foot, 'click', '[data-p="drop"]', function () { Session.discardBoundary(); });
  }

  /* ---------- nothing pending ---------- */

  function renderNothingPending(d) {
    const stage = stageEl();
    const foot = footEl();
    const p = Session.progress(d);
    setSub(p.total ? 'All ' + p.total + ' sets done' : 'Nothing to run yet');
    setRail(1, false);
    stage.innerHTML =
      '<div class="player-ex-name" style="font-size:24px">' + (p.total ? 'Nice work 💪' : 'Empty session') + '</div>' +
      '<div class="player-aim muted">' + (p.total
        ? 'Every set in this workout is logged. Finish it, or head back and add more.'
        : 'Add exercises in the builder to get going.') + '</div>';
    foot.innerHTML =
      '<button type="button" class="player-bigbtn" data-p="finish">Finish workout</button>' +
      '<button type="button" class="player-bigbtn ghost" data-p="builder2">Back to builder</button>';
    U.on(foot, 'click', '[data-p="finish"]', function () { Player.finishSession(); });
    U.on(foot, 'click', '[data-p="builder2"]', function () { Session.setView('builder'); });
  }

  // Finishing goes through the ONE finish flow (views-log's finish sheet) —
  // the player has no private save path any more.
  Player.finishSession = function () {
    const VL = window.ViewsLog;
    Player.closeFocus({ navigate: false });
    if (window.App && App.navigate) App.navigate('log');
    const finish = VL && (VL.openFinishSheet || VL.finish);
    if (typeof finish === 'function') {
      try { finish(); return true; } catch (e) { /* fall through */ }
    }
    toast('Tap Finish to save this workout');
    return false;
  };

  /* ---------- circuit rounds ---------- */

  function renderCircuit(d, en) {
    const stage = stageEl();
    const foot = footEl();
    const stations = Array.isArray(en.stations) ? en.stations : [];
    const rounds = Math.max(0, Math.round(num(en.rounds)));
    const target = Math.max(0, Math.round(num(en._targetRounds)));
    const amrap = Math.max(0, Math.round(num(en._amrapSec)));
    const stationIdx = Math.max(0, Math.round(num(en._stationIdx)));
    setSub(amrap ? 'AMRAP · ' + fmtClock(amrap) : 'Circuit · ' + (target || '∞') + ' rounds');

    function stationRow(st, i) {
      const nm = st.exerciseId ? exName(st.exerciseId) : (st.name || 'Station');
      const bits = [];
      if (num(st.reps) > 0) bits.push('× ' + st.reps);
      if (num(st.durationSec) > 0) bits.push(fmtClock(st.durationSec));
      if (num(st.weightKg) > 0) bits.push('@ ' + fmtWeight(st.weightKg));
      const done = i < stationIdx;
      const cur = i === stationIdx;
      return '<button type="button" class="player-station' + (done ? ' done' : '') + (cur ? ' cur' : '') +
        '" data-st="' + i + '">' +
        (done ? '<span class="ck">' + (ic().check || '✓') + '</span>' : (cur ? '<span class="ck">→</span>' : '')) +
        '<span class="nm">' + U.esc(nm) + '</span>' +
        (bits.length ? '<span class="n">' + U.esc(bits.join(' · ')) + '</span>' : '') +
      '</button>';
    }

    stage.innerHTML =
      '<div class="player-phase-lbl">ROUND</div>' +
      '<div class="player-round-num" data-p="round">' + (rounds + 1) + '</div>' +
      '<div class="player-aim muted" data-p="circlock"></div>' +
      '<div class="player-stations">' + stations.map(stationRow).join('') + '</div>';
    foot.innerHTML =
      '<button type="button" class="player-bigbtn" data-p="rounddone">Round done ✓</button>' +
      '<button type="button" class="player-bigbtn ghost" data-p="finish">Finish workout</button>';

    let coolAt = 0;
    function cooling() { return coolAt && Date.now() - coolAt < 400; }

    U.on(stage, 'click', '[data-st]', function (e, b) {
      if (cooling()) return;
      const i = parseInt(b.getAttribute('data-st'), 10) || 0;
      const next = i === stationIdx ? stationIdx + 1 : i;
      if (next >= stations.length) { coolAt = Date.now(); Session.closeRound(en.id); return; }
      Session.setStation(en.id, next);
    });
    U.on(foot, 'click', '[data-p="rounddone"]', function () {
      if (cooling()) return;
      coolAt = Date.now();
      Session.closeRound(en.id);
    });
    U.on(foot, 'click', '[data-p="finish"]', function () { Player.finishSession(); });
    paintClock();
  }

  /* ---------- clock-only painting (never rebuilds DOM) ---------- */

  function paintClock() {
    if (!root) return;
    const d = Session.draft();
    if (!d) return;
    const st = Session.state();
    const clock = root.querySelector('[data-p="clock"]');
    const of = root.querySelector('[data-p="of"]');
    const arc = root.querySelector('.ring-arc');
    if (clock) {
      clock.textContent = st.driver === 'stopwatch' ? fmtClock(st.elapsedSec) : fmtClock(st.remainSec);
    }
    if (of) of.textContent = st.targetSec > 0 ? 'of ' + fmtClock(st.targetSec) : '';
    if (arc) {
      const c = parseFloat(arc.getAttribute('stroke-dasharray')) || 0;
      arc.setAttribute('stroke-dashoffset', String((c * (1 - st.frac)).toFixed(1)));
    }
    const circ = root.querySelector('[data-p="circlock"]');
    if (circ) {
      const en = Session.circuitEntry(d);
      // the CIRCUIT's clock — an AMRAP joined onto an hour-old draft must open
      // with its full time left, not already expired
      const elapsedSec = Math.round((Date.now() - circuitStartedAt(en, d)) / 1000);
      const amrap = en ? Math.max(0, Math.round(num(en._amrapSec))) : 0;
      if (amrap) {
        const left = amrap - elapsedSec;
        circ.textContent = fmtClock(Math.max(0, left)) + ' left · ' + fmtClock(elapsedSec) + ' in';
        setRail(U.clamp(elapsedSec / amrap, 0, 1), true);
      } else {
        circ.textContent = fmtClock(elapsedSec) + ' in';
        const target = en ? Math.max(0, Math.round(num(en._targetRounds))) : 0;
        setRail(target ? U.clamp(Math.round(num(en.rounds)) / target, 0, 1) : 0, true);
      }
    }
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

  /* ======================================================================
     PUBLIC API (P4.5) — stable + additive. Everything else is private.

     Player.compile(routine, opts?)          pure timeline projection (P3.5)
     Player.stepEstimateSec(step)            pure
     Player.builtinRoutine(letter)           pure
     Player.routineFromWorkout(workout)      pure
     Player.projectDraft(draft, opts?)       LIVE projection over the draft:
                                             {steps, workCount, doneCount,
                                              estSec, remainSec}
     Player.draftFromRoutine(routine, opts)  pure: routine -> draft record
     Player.start(routine, opts?)            seed/extend the live session
                                             (perf only). opts: {name,
                                             routineRef, view:'focus'|'builder'}
     Player.openFocus() / closeFocus(opts?)  present the draft full-screen
     Player.finishSession()                  hands to ViewsLog.openFinishSheet()
     Player.isActive()                       focus overlay is up
     Player.openPlanner(userId?) / editRoutine(routine, opts?)
     Player.discardLegacySession()           removes a stale P3.5 key
     Player.resumePending() -> null          legacy shim (app.js boot)

     Player.Session — the live substrate, and the app's ONLY timing engine
     (see the section header above):
       bind(host) / unbind()      host: {getDraft, saveDraft, setDraft?,
                                  clearDraft?, rerender?, prefill?}
                                  prefill(entry, set): the host's '✓ would have
                                  filled this in' hint, used when a carry's
                                  stopwatch stops with nothing typed
       draft() setDraft(d) clearDraft() save()
       backfill(draft) -> bool    assign entry ids + set._sid (loadDraft hook)
       sidOf(set) entryOf(id) findSet(entryId, sid) firstPending(entryId?)
       next() progress() cursor() setCursor(entryId, sid)
       subscribe(fn) -> unsubscribe   fn(state); state.reason 'change'|'tick'
                                      ('tick' = clock only, NEVER repaint DOM
                                       that holds focus/caret)
       reconcile()                THE choke point — call at the end of
                                  saveDraft(), after the localStorage write
       resolvePace(entryOrId, action?, draft?) resolveCadence(entryOrId)
       restSecFor(entryOrId) defaultPaceFor(kind) kindOfEntry(en) kindOfDraft()
       PACES PACE_LABELS PACE_DEFAULTS isPace(v)
       setSessionPace(p) setEntryPace(entryId, p) setCadence(bool)
       setRestSec(sec) setPaceDefault(kind, p) setCadenceDefault(bool)
       shapeOf(entryOrId) driverFor(entry, set) targetSecOf(entry, set)
       tempoOf(entryOrId) tempoSecPerRep(str)
       runSet(entryId, sid, opts?)   opts: {pace, targetSec}
       runExercise(entryId, opts?) runSession(opts?) arm(...)
       adjust(±sec) pause() resume() togglePause() isPaused() isRunning()
       done(vals?)                 early finish -> records ACTUAL
       completeSet(entryId, sid, vals?)   record + chain (focus 'Done')
       noteSetDone(entryId, sid)   builder ✓ hook — continues an armed chain
       skipRest() cancel(opts?) timer() state() elapsedSec()
       boundary() confirmBoundary(opts?) discardBoundary()
       setDepth(entryId, sid, 1..4)
       updateSet(entryId, sid, patch) addSet(entryId) removeSet(entryId, sid)
       removeEntry(entryId) moveEntry(entryId, ±1)
       circuitEntry() closeRound(entryId?) setStation(entryId, idx)
       view() setView('builder'|'focus')
       tick(nowMs?) __setNow(fn)   test hooks

     views-log wiring (required for the two presentations to share one state):
       1. loadDraft():  Player.Session.backfill(d), persisted straight back
       2. saveDraft():  ... localStorage.setItem(...); Player.Session.reconcile();
                        behind a re-entrancy guard (a reconcile that expires a
                        timer writes, and that write must not recurse)
       3. once:         Player.Session.bind({getDraft, saveDraft, setDraft,
                                             clearDraft, rerender, prefill})
       4. export:       window.ViewsLog.openFinishSheet (or .finish) — the
                        focus view's Finish hands off to the ONE finish flow
                        window.ViewsLog.startRestPill(sec) (advisory rest)
       5. the builder's ✓ calls Player.Session.noteSetDone(entryId, sid);
          a set NUMBER tap calls runSet, a card stopwatch calls runExercise,
          and the timer pill's −15s/+15s/Done call adjust/done
       6. cleanSetworkEntry: prefer a set's OWN `intensity` over the entry aim
          so per-set depth captured live survives the save.
       window.ViewsLog.Session is a thin façade over this object (it keeps the
       {kind, mode, scope} snapshot shape older probes read); it owns nothing.
     ====================================================================== */

  window.Player = Player;
})();
