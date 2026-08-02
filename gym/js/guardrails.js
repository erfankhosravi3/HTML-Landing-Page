/* IronLog — Guardrails: pure training-safety heuristics (v2 addendum; P3 adds
   durability slot coverage and stretch-intensity rules).
   No DOM, no Store — all data is passed in, so every function is node-testable
   with a window/U stub (ExerciseDB is read lazily and may be absent). All
   distance math is km internally; messages are rendered in the user's units
   (miles for 'lb' users). Warnings never block: 'stop' renders as a strong
   confirm in the UI, not a wall. */
(function () {
  'use strict';

  const Guardrails = {};

  const KM_PER_MILE = 1.609344;

  const LIMITS = {
    DRY_LOAD_MAX_KG: 22.7,      // 50 lb dry (before water/food)
    RUCKS_PER_WEEK: 2,          // warn when a Mon-Sun week exceeds this
    LONG_RUN_JUMP_PCT: 25,      // warn when > 25% over trailing 4-wk longest run
    WEEKLY_RUN_RAMP_PCT: 10,    // warn when > 10% over trailing 4-wk avg mileage
    EASY_SHARE_MIN_PCT: 75,     // warn when easy share of cardio drops below this
    EASY_HR_FRACTION: 0.75,     // avgHR < 0.75 * (220 - age) classifies as easy
    PAIN_SEVERE: 7,             // severity >= 7 is a red flag
    STRETCH_DEEP_COUNT: 3,      // intensity-3+ sets on one drill within the window
    STRETCH_DEEP_WINDOW_DAYS: 14,
    DURABILITY_GAP_DAY: 5,      // durability_gap fires from day 5 of the week (Fri)
    // P4 deload advisories
    EASY_SPLIT_COLLAPSE_PCT: 50,   // easy share under this = the split collapsed
    EASY_SPLIT_MIN_SESSIONS: 4,    // ...but only once the week has this many
                                   // classifiable cardio sessions (one hard
                                   // session in a two-session week is not a
                                   // collapse — easy_share_low still covers it)
    RESTING_HR_FRESH_DAYS: 3       // a spike only advises while the reading is
                                   // this recent; stale wearable data says
                                   // nothing about today
  };

  // Weekly durability slot targets: work-set counts per Mon-Sun week (P3 —
  // code-defined, never user data). Keys are the DURABILITY_CHECKLIST slots.
  const DURABILITY_TARGETS = { unilateral: 6, calf_tib: 4, grip: 3, core: 4 };
  const SLOT_LABELS = {
    unilateral: 'single-leg', calf_tib: 'calf & tib', grip: 'grip', core: 'core'
  };

  Guardrails.KM_PER_MILE = KM_PER_MILE;
  Guardrails.LIMITS = LIMITS;
  Guardrails.DURABILITY_TARGETS = DURABILITY_TARGETS;
  Guardrails.SLOT_LABELS = SLOT_LABELS;

  /* ---------- formatting (user units) ---------- */

  function trim1(v) {
    // U.round1 already applied; render '4.2' but '5' (not '5.0')
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  }

  // km -> '6.8 km' for kg-units users, '4.2 mi' for lb-units users
  function fmtDist(km, units) {
    if (units === 'lb') return trim1(U.round1(km / KM_PER_MILE)) + ' mi';
    return trim1(U.round1(km)) + ' km';
  }

  function fmtLoad(kg, units) {
    return trim1(U.kgToDisplay(kg, units)) + ' ' + U.unitLabel(units);
  }

  Guardrails.fmtDistanceKm = fmtDist;

  /* ---------- message copy ---------- */

  const REGION_LABELS = {
    chest: 'chest', front_delts: 'front delts', side_delts: 'side delts',
    rear_delts: 'rear delts', traps: 'traps', lats: 'lats',
    upper_back: 'upper back', lower_back: 'lower back', biceps: 'biceps',
    triceps: 'triceps', forearms: 'forearms', abs: 'abs', obliques: 'obliques',
    glutes: 'glutes', quads: 'quads', hamstrings: 'hamstrings',
    adductors: 'adductors', calves: 'calves',
    shin_l: 'left shin', shin_r: 'right shin', foot_l: 'left foot',
    foot_r: 'right foot', knee_l: 'left knee', knee_r: 'right knee',
    ankle_l: 'left ankle', ankle_r: 'right ankle'
  };

  function regionLabel(id) {
    return REGION_LABELS[id] || String(id || '').replace(/_/g, ' ');
  }

  function cap(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  // Each template takes an optional ctx of PRE-FORMATTED strings/numbers and
  // must read well with an empty ctx (that no-ctx form is what MESSAGES holds).
  const TEMPLATES = {
    ruck_double_increase: function (c) {
      return 'Load AND distance both jumped this week — pick one. Overuse injuries end preps.' +
        (c.prevLoad ? ' Last week topped out at ' + c.prevLoad + ' over ' + c.prevDist +
          '; this ruck is ' + c.load + ' over ' + c.dist + '.' : '');
    },
    ruck_week_count: function (c) {
      return (c.count ? 'Ruck #' + c.count + ' this week.' : 'More than 2 rucks in one week.') +
        ' Two is the ceiling — ruck impact stacks faster than it feels.';
    },
    ruck_dry_load: function (c) {
      return 'Dry load ' + (c.load ? 'is ' + c.load + ' — ' : '') + 'over the ' +
        (c.cap || '22.7 kg') + ' line. Past that you\'re buying injury risk, not fitness.';
    },
    run_long_jump: function (c) {
      return c.dist
        ? 'Longest run jumps to ' + c.dist + ' — ' + c.pct + '% past your recent best of ' +
          c.prev + '. Cap long-run jumps at 25%.'
        : 'Longest run jumps more than 25% past your recent best. Cap long-run jumps at 25%.';
    },
    run_weekly_volume: function (c) {
      return c.total
        ? 'This puts the week at ' + c.total + ' — over 110% of your 4-week average (' +
          c.avg + '). Trim it or make it easy.'
        : 'Weekly run mileage is over 110% of your 4-week average. Trim it or make it easy.';
    },
    run_ramp: function (c) {
      return 'Mileage is up ' + (c.pct !== undefined && c.pct !== null ? c.pct + '%' : 'more than 10%') +
        ' on your 4-week average — keep ramps at 10% or less.';
    },
    easy_share_low: function (c) {
      return 'Only ' + (c.pct !== undefined && c.pct !== null ? c.pct + '%' : 'a minority') +
        ' of this week\'s cardio was easy. Keep about 3 in 4 sessions conversational — hard every day digs a hole.';
    },
    no_rest_day: function () {
      return 'No rest day this week. Take one — the adaptation you\'re training for happens on it.';
    },
    easy_split_collapse: function (c) {
      return 'Only ' + (c.pct !== undefined && c.pct !== null ? c.pct + '%' : 'a minority') +
        ' of this week\'s cardio was easy across ' +
        (c.sessions ? c.sessions + ' sessions' : 'several sessions') +
        ' — the easy/hard split has collapsed. Make the next two genuinely easy, or take the week down.';
    },
    resting_hr_spike: function (c) {
      return 'Resting heart rate is ' +
        (c.pct !== undefined && c.pct !== null ? c.pct + '% ' : '') +
        'over your 28-day baseline' +
        (c.value !== undefined && c.value !== null ? ' (' + c.value + ' vs ' + c.baseline + ' bpm)' : '') +
        ' two readings running — that\'s a recovery debt, not a bad night. Take an easy day.';
    },
    pain_bone_line: function (c) {
      return (c.region ? cap(c.region) + ': pain' : 'Pain') +
        ' right on the bone line — that\'s a stress-injury pattern, not soreness. Skip impact work on it and get it assessed.';
    },
    pain_morning: function (c) {
      return (c.region ? cap(c.region) + ' hurts' : 'It hurts') +
        ' in the morning before you\'ve trained — classic overuse signature. Get it assessed.';
    },
    pain_severe: function (c) {
      return (c.region ? cap(c.region) + ' at severity ' : 'Severity ') +
        (c.severity !== undefined && c.severity !== null ? c.severity : '7+') +
        '/10 — that\'s past push-through range. Get it assessed.';
    },
    pain_rising: function (c) {
      return (c.region ? cap(c.region) : 'That area') +
        ' has hurt more on each of the last 3 entries — it isn\'t settling on its own. Get it assessed.';
    },
    pain_worse_consecutive: function (c) {
      return (c.region ? cap(c.region) + ' got' : 'Pain got') +
        ' worse during back-to-back sessions. Stop loading it and get it assessed.';
    },
    pain_worse_during: function (c) {
      return 'Pain that climbs during a session is a load problem — cut ' +
        (c.region ? c.region + ' ' : '') + 'volume and watch the next one.';
    },
    durability_gap: function (c) {
      return 'Durability work is behind this week' +
        (c.covered !== undefined && c.covered !== null
          ? ' — ' + c.covered + ' of ' + (c.total || 4) + ' areas covered' : '') +
        (c.missing ? ' (open: ' + c.missing + ')' : '') +
        '. Small tissues fail before big engines — fit a routine in before Sunday.';
    },
    stretch_limit: function (c) {
      return (c.name ? cap(c.name) + ' hit depth 4' : 'A stretch hit depth 4') +
        ' — that\'s guarding, not stretching. Back off and log a niggle if it\'s sharp.';
    },
    stretch_pain_link: function (c) {
      return (c.name ? cap(c.name) : 'That stretch') + ' has gone deep ' +
        (c.count ? c.count + ' times' : '3+ times') + ' in two weeks' +
        (c.region ? ', with ' + c.region + ' already on the pain log' : ', with pain logged nearby') +
        ' — ease the depth and watch how it responds.';
    }
  };

  // Plain-language default copy for every code (no-ctx render of each template).
  const MESSAGES = {};
  Object.keys(TEMPLATES).forEach(function (code) {
    MESSAGES[code] = TEMPLATES[code]({});
  });
  Guardrails.MESSAGES = MESSAGES;

  function msg(code, ctx) {
    return TEMPLATES[code](ctx || {});
  }
  Guardrails.message = msg;

  /* ---------- data helpers (all inputs may be partial) ---------- */

  function entriesOf(w) {
    return w && Array.isArray(w.entries) ? w.entries : [];
  }

  function cardio(w, mode) {
    return entriesOf(w).filter(function (e) {
      return e && e.type === 'cardio' && (!mode || e.mode === mode);
    });
  }

  function distKm(e) {
    return typeof e.distanceKm === 'number' && e.distanceKm > 0 ? e.distanceKm : 0;
  }

  function ruckLoadKg(e) {
    if (typeof e.loadKgTotal === 'number' && e.loadKgTotal > 0) return e.loadKgTotal;
    if (typeof e.loadKgDry === 'number' && e.loadKgDry > 0) return e.loadKgDry;
    return null;
  }

  function inRange(dateStr, startStr, endStr) {
    return !!dateStr && dateStr >= startStr && dateStr <= endStr;
  }

  // Defensive: callers should pass pre-filtered workouts, but never mix users.
  function forUser(workouts, user) {
    const uid = user && user.id;
    return (workouts || []).filter(function (w) {
      return w && (!uid || !w.userId || w.userId === uid);
    });
  }

  function unitsOf(user) {
    return (user && user.settings && user.settings.units) === 'lb' ? 'lb' : 'kg';
  }

  // % above base, rounded to 1 decimal (kills float noise so the 10%/25%
  // boundaries behave: exactly 10.0 is fine, 10.1 warns). null when no base.
  function pctOver(value, base) {
    if (!base || base <= 0) return null;
    return U.round1((value / base - 1) * 100);
  }

  function isNum(v) {
    return typeof v === 'number' && isFinite(v);
  }

  // Setwork set validity per the P3 contract: reps>0 || holdSec>0 || distanceM>0.
  function validSetworkSet(s) {
    return !!s && ((isNum(s.reps) && s.reps > 0) ||
      (isNum(s.holdSec) && s.holdSec > 0) ||
      (isNum(s.distanceM) && s.distanceM > 0));
  }

  // ExerciseDB is read lazily (load order guarantees it in the browser; node
  // tests may stub or omit it — every caller handles null).
  function exdb() {
    return (typeof window !== 'undefined' && window.ExerciseDB) ? window.ExerciseDB : null;
  }

  // exerciseId -> slot from the curated durability checklist. null when the
  // checklist is unavailable — coverage is then unknowable, so durability
  // counting and the durability_gap warning stay silent instead of nagging
  // on zero data.
  function checklistSlotMap() {
    const DB = exdb();
    const list = DB && Array.isArray(DB.DURABILITY_CHECKLIST) ? DB.DURABILITY_CHECKLIST : null;
    if (!list) return null;
    const map = {};
    for (const item of list) {
      if (item && item.id && DURABILITY_TARGETS[item.slot] !== undefined) map[item.id] = item.slot;
    }
    return map;
  }

  function exerciseName(ref) {
    if (!ref) return '';
    const DB = exdb();
    const ex = DB && typeof DB.byId === 'function' ? DB.byId(ref) : null;
    return (ex && ex.name) ? ex.name : String(ref).replace(/_/g, ' ');
  }

  // primary + secondary muscle ids for an exercise ref; null when unknowable.
  function exerciseMuscles(ref) {
    const DB = exdb();
    const ex = DB && typeof DB.byId === 'function' ? DB.byId(ref) : null;
    if (!ex) return null;
    return (ex.primaryMuscles || []).concat(ex.secondaryMuscles || []);
  }

  // LoadModel owns every piece of P4 load/recovery arithmetic; guardrails only
  // renders the advisory. It is read lazily and may legitimately be absent
  // (older cached shell, node suites that don't load it) — callers then stay
  // silent rather than guessing.
  function loadModel() {
    return (typeof window !== 'undefined' && window.LoadModel &&
      typeof window.LoadModel.restingHR === 'function') ? window.LoadModel : null;
  }

  // Resting-HR spike advisory for a week, or null. The spike rule itself
  // (28-day baseline, the 2 most recent SAMPLED days both >= baseline x 1.07)
  // lives in LoadModel; here we only pick the reference date (never read past
  // the week being reported on), filter foreign users, and require the reading
  // to still be fresh — a spike from three weeks ago is history, not advice.
  function restingHrAdvisory(samples, user, ws, weekEnd) {
    if (!Array.isArray(samples) || !samples.length) return null;
    const LM = loadModel();
    if (!LM) return null;
    const uid = user && user.id;
    const rows = samples.filter(function (s) {
      return s && (s.kind === undefined || s.kind === 'restingHR') &&
        (!uid || !s.userId || s.userId === uid);
    });
    if (!rows.length) return null;
    const today = U.todayStr();
    const ref = today < weekEnd ? today : weekEnd;
    if (ref < ws) return null; // week hasn't started yet
    let hr = null;
    try { hr = LM.restingHR(rows, ref); } catch (e) { return null; }
    if (!hr || !hr.spike || !hr.baseline28 || !hr.latest) return null;
    if (!hr.latestDate || hr.latestDate < U.addDays(ref, -LIMITS.RESTING_HR_FRESH_DAYS)) return null;
    return {
      code: 'resting_hr_spike',
      message: msg('resting_hr_spike', {
        pct: Math.round((hr.latest / hr.baseline28 - 1) * 100),
        value: U.round1(hr.latest),
        baseline: hr.baseline28
      })
    };
  }

  // 'easy' | 'hard' | null (unclassifiable). HR beats the effort field when
  // both the entry's avgHR and the user's birthYear are known.
  function classifyEffort(e, user, refYear) {
    const by = user && user.profile && user.profile.birthYear;
    if (by && typeof e.avgHR === 'number' && e.avgHR > 0) {
      const maxHR = 220 - (refYear - by);
      return e.avgHR < LIMITS.EASY_HR_FRACTION * maxHR ? 'easy' : 'hard';
    }
    if (e.effort === 'easy') return 'easy';
    if (e.effort === 'moderate' || e.effort === 'hard') return 'hard';
    return null;
  }

  /* ---------- checkSession ---------- */

  // Evaluated at save time: draftWorkout is the session about to be saved,
  // priorWorkouts is history (the draft itself is excluded by id if present).
  // painLog is optional (P3): omitting it only silences the stretch/pain link
  // rule — older call sites keep working unchanged.
  // Returns [{level:'warn'|'stop', code, message}], 'stop' entries first;
  // the stretch_pain_link finding also carries painLink:true so the UI can
  // render a pain quick-log link.
  // First-ever sessions produce zero warnings: every comparison needs a baseline.
  Guardrails.checkSession = function (draftWorkout, priorWorkouts, user, painLog) {
    const out = [];
    const draft = draftWorkout || {};
    const units = unitsOf(user);
    const date = draft.date || U.todayStr();
    const ws = U.weekStart(date);
    const weekEnd = U.addDays(ws, 6);
    const lastWs = U.addDays(ws, -7);
    const lastWe = U.addDays(ws, -1);
    const trailStart = U.addDays(ws, -28);
    const prior = forUser(priorWorkouts, user).filter(function (w) {
      return !draft.id || w.id !== draft.id;
    });

    const draftRucks = cardio(draft, 'ruck');
    const draftRuns = cardio(draft, 'run');

    // 1) Ruck double-increase (STOP): this ruck's load AND distance both
    //    exceed last week's max ruck load / max ruck distance.
    if (draftRucks.length) {
      let lastMaxLoad = null;
      let lastMaxDist = 0;
      for (const w of prior) {
        if (!inRange(w.date, lastWs, lastWe)) continue;
        for (const e of cardio(w, 'ruck')) {
          const L = ruckLoadKg(e);
          if (L !== null && (lastMaxLoad === null || L > lastMaxLoad)) lastMaxLoad = L;
          const d = distKm(e);
          if (d > lastMaxDist) lastMaxDist = d;
        }
      }
      if (lastMaxLoad !== null && lastMaxDist > 0) {
        for (const e of draftRucks) {
          const L = ruckLoadKg(e);
          const d = distKm(e);
          if (L !== null && d > 0 && L > lastMaxLoad + 1e-9 && d > lastMaxDist + 1e-9) {
            out.push({
              level: 'stop',
              code: 'ruck_double_increase',
              message: msg('ruck_double_increase', {
                load: fmtLoad(L, units), dist: fmtDist(d, units),
                prevLoad: fmtLoad(lastMaxLoad, units), prevDist: fmtDist(lastMaxDist, units)
              })
            });
            break;
          }
        }
      }
    }

    // 2) More than 2 rucks in the draft's Mon-Sun week (draft included).
    if (draftRucks.length) {
      let count = draftRucks.length;
      for (const w of prior) {
        if (inRange(w.date, ws, weekEnd)) count += cardio(w, 'ruck').length;
      }
      if (count > LIMITS.RUCKS_PER_WEEK) {
        out.push({
          level: 'warn',
          code: 'ruck_week_count',
          message: msg('ruck_week_count', { count: count })
        });
      }
    }

    // 3) Dry load over 22.7 kg (50 lb).
    for (const e of draftRucks) {
      if (typeof e.loadKgDry === 'number' && e.loadKgDry > LIMITS.DRY_LOAD_MAX_KG + 1e-9) {
        out.push({
          level: 'warn',
          code: 'ruck_dry_load',
          message: msg('ruck_dry_load', {
            load: fmtLoad(e.loadKgDry, units),
            cap: fmtLoad(LIMITS.DRY_LOAD_MAX_KG, units)
          })
        });
        break;
      }
    }

    // 4) Longest-run jump > 25% vs the trailing 4 full weeks' longest run.
    let draftLongest = 0;
    for (const e of draftRuns) if (distKm(e) > draftLongest) draftLongest = distKm(e);
    if (draftLongest > 0) {
      let prevLongest = 0;
      for (const w of prior) {
        if (!inRange(w.date, trailStart, lastWe)) continue;
        for (const e of cardio(w, 'run')) {
          if (distKm(e) > prevLongest) prevLongest = distKm(e);
        }
      }
      const jump = pctOver(draftLongest, prevLongest);
      if (jump !== null && jump > LIMITS.LONG_RUN_JUMP_PCT) {
        out.push({
          level: 'warn',
          code: 'run_long_jump',
          message: msg('run_long_jump', {
            dist: fmtDist(draftLongest, units),
            prev: fmtDist(prevLongest, units),
            pct: jump
          })
        });
      }
    }

    // 5) This week's run mileage (draft included) > 110% of trailing 4-wk avg.
    let draftKm = 0;
    for (const e of draftRuns) draftKm += distKm(e);
    if (draftKm > 0) {
      let weekKm = draftKm;
      let trailKm = 0;
      for (const w of prior) {
        if (inRange(w.date, ws, weekEnd)) {
          weekKm += U.sum(cardio(w, 'run'), distKm);
        } else if (inRange(w.date, trailStart, lastWe)) {
          trailKm += U.sum(cardio(w, 'run'), distKm);
        }
      }
      const avg = trailKm / 4;
      const over = pctOver(weekKm, avg);
      if (over !== null && over > LIMITS.WEEKLY_RUN_RAMP_PCT) {
        out.push({
          level: 'warn',
          code: 'run_weekly_volume',
          message: msg('run_weekly_volume', {
            total: fmtDist(weekKm, units),
            avg: fmtDist(avg, units),
            pct: over
          })
        });
      }
    }

    // 6) Any stretch-depth-4 set in the draft: involuntary guarding — a flag,
    //    never a target. One nudge per save is enough.
    for (const e of entriesOf(draft)) {
      if (!e || e.type !== 'setwork') continue;
      let depth4 = false;
      for (const s of e.sets || []) {
        if (s && isNum(s.intensity) && s.intensity >= 4) { depth4 = true; break; }
      }
      if (depth4) {
        out.push({
          level: 'warn',
          code: 'stretch_limit',
          message: msg('stretch_limit', { name: exerciseName(e.exerciseRef) })
        });
        break;
      }
    }

    // 7) Repeated deep stretching: >= 3 intensity-3+ sets on the SAME
    //    exerciseRef within 14 days (draft included) AND a pain-log entry in
    //    the same window on a muscle that drill touches. Resolved pain entries
    //    are closed episodes and never link (same convention as the dashboards'
    //    !p.resolved filters). The draft must contribute at least one deep
    //    set — this fires on new information only.
    const deepByRef = {};
    const deepOrder = [];
    for (const e of entriesOf(draft)) {
      if (!e || e.type !== 'setwork' || !e.exerciseRef) continue;
      let deep = 0;
      for (const s of e.sets || []) {
        if (s && isNum(s.intensity) && s.intensity >= 3) deep++;
      }
      if (!deep) continue;
      if (!(e.exerciseRef in deepByRef)) deepOrder.push(e.exerciseRef);
      deepByRef[e.exerciseRef] = (deepByRef[e.exerciseRef] || 0) + deep;
    }
    if (deepOrder.length) {
      const winStart = U.addDays(date, -(LIMITS.STRETCH_DEEP_WINDOW_DAYS - 1));
      for (const w of prior) {
        if (!inRange(w.date, winStart, date)) continue;
        for (const e of entriesOf(w)) {
          if (!e || e.type !== 'setwork' || !(e.exerciseRef in deepByRef)) continue;
          for (const s of e.sets || []) {
            if (s && isNum(s.intensity) && s.intensity >= 3) deepByRef[e.exerciseRef]++;
          }
        }
      }
      const uid = user && user.id;
      const pains = (painLog || []).filter(function (p) {
        return p && p.muscleId && !p.resolved && inRange(p.date, winStart, date) &&
          (!uid || !p.userId || p.userId === uid);
      });
      for (const ref of deepOrder) {
        if (deepByRef[ref] < LIMITS.STRETCH_DEEP_COUNT) continue;
        const muscles = exerciseMuscles(ref);
        if (!muscles || !muscles.length) continue;
        let hit = null;
        for (const p of pains) {
          if (muscles.indexOf(p.muscleId) !== -1) { hit = p; break; }
        }
        if (!hit) continue;
        out.push({
          level: 'warn',
          code: 'stretch_pain_link',
          painLink: true,
          message: msg('stretch_pain_link', {
            name: exerciseName(ref),
            count: deepByRef[ref],
            region: regionLabel(hit.muscleId)
          })
        });
      }
    }

    out.sort(function (a, b) {
      return (a.level === 'stop' ? 0 : 1) - (b.level === 'stop' ? 0 : 1);
    });
    return out;
  };

  /* ---------- weeklyStatus ---------- */

  // Weekly training-status rollup for the Mon-Sun week containing weekStartStr.
  // ruckLoadMiles = sum of ruck loadKg * distance-in-miles (kg·mi; callers
  // convert load for display). runRampPct is 0 when there is no trailing
  // baseline. easySharePct is null when no cardio entry is classifiable.
  // durability (P3) = { slots: {unilateral, calf_tib, grip, core} work-set
  // counts, covered, total: 4 } vs DURABILITY_TARGETS; see the accumulation
  // comment in the loop for the three source shapes.
  // opts (P4, optional) = { healthSamples } — restingHR rows for the user (a
  // bare array is accepted too). Supplying them adds the resting-HR spike
  // advisory; omitting them changes nothing. The returned shape is unchanged.
  Guardrails.weeklyStatus = function (workouts, user, weekStartStr, opts) {
    const ws = U.weekStart(weekStartStr || U.todayStr());
    const weekEnd = U.addDays(ws, 6);
    const trailStart = U.addDays(ws, -28);
    const trailEnd = U.addDays(ws, -1);
    const list = forUser(workouts, user);
    const refYear = parseInt(ws.slice(0, 4), 10);
    const healthSamples = Array.isArray(opts) ? opts
      : (opts && Array.isArray(opts.healthSamples)) ? opts.healthSamples : null;

    let runKm = 0;
    let trailKm = 0;
    let ruckCount = 0;
    let ruckLoadMiles = 0;
    let easyN = 0;
    let classifiedN = 0;
    const sessionDates = {};

    // Durability slot coverage (P3): work-set counts per checklist slot,
    // unioned from three sources — lift work sets on checklist exercises,
    // setwork valid sets on checklist exerciseRefs (an L row and an R row
    // count 1 each), and legacy durability items[] at 1 nominal set per id.
    const slotMap = checklistSlotMap();
    const slots = { unilateral: 0, calf_tib: 0, grip: 0, core: 0 };

    for (const w of list) {
      if (inRange(w.date, trailStart, trailEnd)) {
        trailKm += U.sum(cardio(w, 'run'), distKm);
        continue;
      }
      if (!inRange(w.date, ws, weekEnd)) continue;
      sessionDates[w.date] = true; // any logged session occupies the day
      for (const e of cardio(w)) {
        if (e.mode === 'run') runKm += distKm(e);
        if (e.mode === 'ruck') {
          ruckCount++;
          const L = ruckLoadKg(e);
          if (L !== null) ruckLoadMiles += L * (distKm(e) / KM_PER_MILE);
        }
        const cls = classifyEffort(e, user, refYear);
        if (cls) {
          classifiedN++;
          if (cls === 'easy') easyN++;
        }
      }
      if (slotMap) {
        for (const e of entriesOf(w)) {
          if (!e) continue;
          if (e.type === 'setwork') {
            const slot = slotMap[e.exerciseRef];
            if (!slot) continue;
            for (const s of e.sets || []) {
              if (validSetworkSet(s)) slots[slot]++;
            }
          } else if (e.type === 'durability') {
            for (const id of e.items || []) {
              const slot = slotMap[id];
              if (slot) slots[slot]++;
            }
          } else if (!e.type || e.type === 'lift') {
            const slot = slotMap[e.exerciseId];
            if (!slot) continue;
            for (const s of e.sets || []) {
              if (s && (!s.type || s.type === 'work')) slots[slot]++;
            }
          }
        }
      }
    }

    let covered = 0;
    for (const slot in DURABILITY_TARGETS) {
      if (slots[slot] >= DURABILITY_TARGETS[slot]) covered++;
    }

    const avg = trailKm / 4;
    const rampPct = avg > 0 ? U.round1((runKm / avg - 1) * 100) : 0;
    const easySharePct = classifiedN > 0 ? U.round1((easyN / classifiedN) * 100) : null;
    // Only elapsed days can count as rest taken — mid-week, the untrained
    // remainder of the week isn't rest yet.
    let restDayTaken = false;
    const today = U.todayStr();
    for (let i = 0; i < 7; i++) {
      const day = U.addDays(ws, i);
      if (day > today) break;
      if (!sessionDates[day]) { restDayTaken = true; break; }
    }

    const warnings = [];
    if (avg > 0 && rampPct > LIMITS.WEEKLY_RUN_RAMP_PCT) {
      warnings.push({ code: 'run_ramp', message: msg('run_ramp', { pct: rampPct }) });
    }
    // Easy-split collapse (P4) is the stronger form of easy_share_low and
    // subsumes it — one message per problem, same idiom as the pain rules.
    if (easySharePct !== null &&
        classifiedN >= LIMITS.EASY_SPLIT_MIN_SESSIONS &&
        easySharePct < LIMITS.EASY_SPLIT_COLLAPSE_PCT) {
      warnings.push({
        code: 'easy_split_collapse',
        message: msg('easy_split_collapse', { pct: easySharePct, sessions: classifiedN })
      });
    } else if (easySharePct !== null && easySharePct < LIMITS.EASY_SHARE_MIN_PCT) {
      warnings.push({ code: 'easy_share_low', message: msg('easy_share_low', { pct: easySharePct }) });
    }
    const hrWarning = restingHrAdvisory(healthSamples, user, ws, weekEnd);
    if (hrWarning) warnings.push(hrWarning);
    if (!restDayTaken) {
      warnings.push({ code: 'no_rest_day', message: msg('no_rest_day') });
    }
    // No mid-week nag: the gap only warns from day 5 of the week (Friday) on,
    // and only when the checklist is loaded so coverage is actually knowable.
    if (slotMap && covered < 4 &&
        today >= U.addDays(ws, LIMITS.DURABILITY_GAP_DAY - 1)) {
      const missing = [];
      for (const slot in DURABILITY_TARGETS) {
        if (slots[slot] < DURABILITY_TARGETS[slot]) missing.push(SLOT_LABELS[slot]);
      }
      warnings.push({
        code: 'durability_gap',
        message: msg('durability_gap', { covered: covered, total: 4, missing: missing.join(', ') })
      });
    }

    return {
      runMileageKm: U.round1(runKm),
      runRampPct: rampPct,
      easySharePct: easySharePct,
      ruckCount: ruckCount,
      ruckLoadMiles: U.round1(ruckLoadMiles),
      restDayTaken: restDayTaken,
      durability: { slots: slots, covered: covered, total: 4 },
      warnings: warnings
    };
  };

  /* ---------- painFlags ---------- */

  // Evaluates the pain log per region (muscleId). Point-in-time flags
  // (boneLine, morning, severity >= 7, worseDuring) key off each region's most
  // recent entry — the latest report reflects current state. Trend flags look
  // across the region's recent entries: 'rising' = strictly increasing
  // severity over the 3 most recent; 'worse on consecutive sessions' = the 2
  // most recent entries both worseDuring (which subsumes the single-entry
  // warn). Returns [{level:'warn'|'red', code, message, entryIds}], red first.
  Guardrails.painFlags = function (painLog) {
    const flags = [];
    const sorted = (painLog || []).filter(function (p) {
      return p && p.muscleId;
    }).sort(function (a, b) {
      const ad = a.date || '';
      const bd = b.date || '';
      if (ad !== bd) return ad < bd ? 1 : -1; // date desc
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

    const byRegion = {};
    const regionOrder = [];
    for (const p of sorted) {
      if (!byRegion[p.muscleId]) {
        byRegion[p.muscleId] = [];
        regionOrder.push(p.muscleId);
      }
      byRegion[p.muscleId].push(p); // most recent first
    }

    function ids(list) {
      return list.map(function (p) { return p.id; }).filter(Boolean);
    }

    for (const region of regionOrder) {
      const entries = byRegion[region];
      const latest = entries[0];
      const label = regionLabel(region);

      if (latest.boneLine) {
        flags.push({
          muscleId: region,
          level: 'red', code: 'pain_bone_line',
          message: msg('pain_bone_line', { region: label }), entryIds: ids([latest])
        });
      }
      if (latest.morning) {
        flags.push({
          muscleId: region,
          level: 'red', code: 'pain_morning',
          message: msg('pain_morning', { region: label }), entryIds: ids([latest])
        });
      }
      if (typeof latest.severity === 'number' && latest.severity >= LIMITS.PAIN_SEVERE) {
        flags.push({
          muscleId: region,
          level: 'red', code: 'pain_severe',
          message: msg('pain_severe', { region: label, severity: latest.severity }),
          entryIds: ids([latest])
        });
      }
      if (entries.length >= 3) {
        const s0 = entries[2].severity; // oldest of the last 3
        const s1 = entries[1].severity;
        const s2 = entries[0].severity; // newest
        if (typeof s0 === 'number' && typeof s1 === 'number' && typeof s2 === 'number' &&
            s0 < s1 && s1 < s2) {
          flags.push({
          muscleId: region,
            level: 'red', code: 'pain_rising',
            message: msg('pain_rising', { region: label }),
            entryIds: ids([entries[2], entries[1], entries[0]])
          });
        }
      }
      if (latest.worseDuring && entries.length >= 2 && entries[1].worseDuring) {
        flags.push({
          muscleId: region,
          level: 'red', code: 'pain_worse_consecutive',
          message: msg('pain_worse_consecutive', { region: label }),
          entryIds: ids([entries[1], entries[0]])
        });
      } else if (latest.worseDuring) {
        flags.push({
          muscleId: region,
          level: 'warn', code: 'pain_worse_during',
          message: msg('pain_worse_during', { region: label }), entryIds: ids([latest])
        });
      }
    }

    flags.sort(function (a, b) {
      return (a.level === 'red' ? 0 : 1) - (b.level === 'red' ? 0 : 1);
    });
    return flags;
  };

  window.Guardrails = Guardrails;
})();
