/* IronLog — LoadModel: per-modality training-load arithmetic (P4 Intelligence).
   Pure functions over (workouts | healthSamples) — no DOM, no Store access;
   Analytics is read lazily for lift tonnage (script load order guarantees it in
   the browser; node tests load analytics.js first). Deterministic arithmetic
   only — auditable thresholds, no ML.

   Per-modality load, NEVER blended into one number:
     run    km/week                 cardio mode 'run' (incl. treadmill —
                                    surface-agnostic)
     ruck   load-miles/week (kg·mi) Σ loadKg × distance-in-miles, the plan's
                                    headline ruck number — same unit and same
                                    load fallback (loadKgTotal else loadKgDry)
                                    as Guardrails.weeklyStatus ruckLoadMiles so
                                    both surfaces agree on the same week
     lift   tonnage kg/week         Analytics.workoutVolume (lift work sets
                                    only by construction — cardio entries have
                                    no sets, setwork sets carry no 'type')
     other  engine minutes/week     swim/bike/row/stairs/circuit durationMin

   ACWR: acute = trailing 7-day sum ending today; chronic = mean of the 4
   trailing 7-day windows ending today / -7 / -14 / -21. ratio is null when
   chronic sits under a per-modality floor (insufficient history — never
   divide by ~0). Weeks start Monday (U.weekStart). */
(function () {
  'use strict';

  var LoadModel = {};

  var KM_PER_MILE = 1.609344;

  var MODALITIES = ['run', 'ruck', 'lift', 'other'];
  var OTHER_MODES = { swim: 1, bike: 1, row: 1, stairs: 1, circuit: 1 };

  // Chronic floors: below these 4-week average weekly loads the denominator is
  // noise, so acwr reports ratio null instead of a scare number. Units match
  // each modality (km, kg·mi, kg, min). Inclusive: chronic == floor computes.
  var FLOORS = { run: 5, ruck: 20, lift: 1000, other: 30 };

  // Ratio zones (evaluated on the 2-decimal-rounded ratio so float noise can
  // never flip a boundary):
  //   ratio > 1.4          'ramping-fast'
  //   1.3 < ratio <= 1.4   'ramping'
  //   0.8 <= ratio <= 1.3  'steady'
  //   ratio < 0.8          'detraining'   (chronic-established only — a null
  //                                        ratio has no zone)
  var SEVERITY = { 'ramping-fast': 3, 'ramping': 2, 'detraining': 1, 'steady': 0 };

  // Headline picks the worst zone; ties break ruck > run > lift > other
  // (highest-impact modality first).
  var TIE_ORDER = ['ruck', 'run', 'lift', 'other'];
  var MODALITY_LABELS = { run: 'run', ruck: 'ruck', lift: 'lift', other: 'conditioning' };

  var SPIKE_FACTOR = 1.07;        // restingHR spike = value >= baseline28 × 1.07
  var GREEN_WEEK_SESSIONS = 4;    // green week = >= 4 sessions AND >= 1 rest day

  LoadModel.KM_PER_MILE = KM_PER_MILE;
  LoadModel.MODALITIES = MODALITIES;
  LoadModel.FLOORS = FLOORS;
  LoadModel.TIE_ORDER = TIE_ORDER;
  LoadModel.MODALITY_LABELS = MODALITY_LABELS;
  LoadModel.SPIKE_FACTOR = SPIKE_FACTOR;
  LoadModel.GREEN_WEEK_SESSIONS = GREEN_WEEK_SESSIONS;

  /* ---------- helpers ---------- */

  function num(n) {
    return (typeof n === 'number' && isFinite(n)) ? n : 0;
  }

  function entriesOf(w) {
    return (w && Array.isArray(w.entries)) ? w.entries : [];
  }

  function inRange(dateStr, startStr, endStr) {
    return !!dateStr && dateStr >= startStr && dateStr <= endStr;
  }

  function ruckLoadKg(e) {
    if (typeof e.loadKgTotal === 'number' && e.loadKgTotal > 0) return e.loadKgTotal;
    if (typeof e.loadKgDry === 'number' && e.loadKgDry > 0) return e.loadKgDry;
    return null;
  }

  function analytics() {
    return (typeof window !== 'undefined' && window.Analytics) ? window.Analytics : null;
  }

  // Raw (unrounded) load one workout contributes to a modality.
  function workoutLoad(w, modality) {
    if (modality === 'lift') {
      var A = analytics();
      return A ? num(A.workoutVolume(w)) : 0;
    }
    var total = 0;
    var entries = entriesOf(w);
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (!e || e.type !== 'cardio') continue;
      if (modality === 'run') {
        if (e.mode === 'run') total += Math.max(0, num(e.distanceKm));
      } else if (modality === 'ruck') {
        if (e.mode === 'ruck') {
          var load = ruckLoadKg(e);
          var km = num(e.distanceKm);
          if (load !== null && km > 0) total += load * (km / KM_PER_MILE);
        }
      } else if (modality === 'other') {
        if (OTHER_MODES[e.mode] === 1) total += Math.max(0, num(e.durationMin));
      }
    }
    return total;
  }

  // Raw sum over an inclusive date window.
  function windowSum(workouts, modality, startStr, endStr) {
    var total = 0;
    for (var i = 0; i < (workouts || []).length; i++) {
      var w = workouts[i];
      if (w && inRange(w.date, startStr, endStr)) total += workoutLoad(w, modality);
    }
    return total;
  }

  /* ---------- weekly ---------- */

  // Load for the Mon-Sun week containing weekStart (normalized to Monday).
  LoadModel.weekly = function (workouts, modality, weekStart) {
    var ws = U.weekStart(weekStart || U.todayStr());
    return U.round1(windowSum(workouts, modality, ws, U.addDays(ws, 6)));
  };

  /* ---------- acwr ---------- */

  LoadModel.acwr = function (workouts, modality, todayStr) {
    var today = todayStr || U.todayStr();
    var sum = 0;
    var acute = 0;
    for (var k = 0; k < 4; k++) {
      var s = windowSum(workouts, modality, U.addDays(today, -6 - 7 * k), U.addDays(today, -7 * k));
      if (k === 0) acute = s;
      sum += s;
    }
    var chronic = sum / 4;
    var floor = FLOORS[modality];
    var ratio = null;
    if (typeof floor === 'number' && chronic >= floor - 1e-9) {
      ratio = Math.round((acute / chronic) * 100) / 100;
    }
    return { acute: U.round1(acute), chronic: U.round1(chronic), ratio: ratio };
  };

  // Zone for a (rounded) ratio; null ratio has no zone.
  LoadModel.zoneFor = function (ratio) {
    if (typeof ratio !== 'number' || !isFinite(ratio)) return null;
    if (ratio > 1.4) return 'ramping-fast';
    if (ratio > 1.3) return 'ramping';
    if (ratio >= 0.8) return 'steady';
    return 'detraining';
  };

  /* ---------- status (daily guidance) ---------- */

  function headlineFor(zone, ratio, modality) {
    var pct = Math.abs(Math.round((ratio - 1) * 100));
    var label = MODALITY_LABELS[modality];
    if (zone === 'ramping-fast') {
      return 'Ramping fast — ' + pct + '% above your 4-week ' + label +
        ' average. Today should be easy or off.';
    }
    if (zone === 'ramping') {
      return 'Ramping — ' + pct + '% above your 4-week ' + label +
        ' average. Keep the next few days easy.';
    }
    // detraining
    return 'Winding down — ' + pct + '% below your 4-week ' + label +
      ' average. Build back gradually.';
  }

  LoadModel.status = function (workouts, todayStr) {
    var today = todayStr || U.todayStr();
    var perModality = {};
    for (var i = 0; i < MODALITIES.length; i++) {
      var m = MODALITIES[i];
      var a = LoadModel.acwr(workouts, m, today);
      perModality[m] = {
        acute: a.acute,
        chronic: a.chronic,
        ratio: a.ratio,
        zone: LoadModel.zoneFor(a.ratio)
      };
    }
    // Worst zone wins the headline; iterating in TIE_ORDER with a strict '>'
    // makes the earlier modality win ties. Steady and no-zone say nothing.
    var worst = null;
    for (var j = 0; j < TIE_ORDER.length; j++) {
      var mod = TIE_ORDER[j];
      var zone = perModality[mod].zone;
      if (!zone || SEVERITY[zone] === 0) continue;
      if (!worst || SEVERITY[zone] > SEVERITY[perModality[worst].zone]) worst = mod;
    }
    var headline = null;
    if (worst) {
      var row = perModality[worst];
      headline = headlineFor(row.zone, row.ratio, worst);
    }
    return { perModality: perModality, headline: headline };
  };

  /* ---------- resting HR ---------- */

  // 28-day baseline (mean of sampled days in [today-27, today]) and spike
  // detection: the 2 most recent SAMPLED days in that window are both at or
  // over baseline × 1.07. Consecutive means consecutive in sampling order —
  // calendar gaps between wearable syncs are tolerated, they neither break
  // nor fake a spike. Rows may be pre-filtered or the raw healthSamples
  // collection (kind other than 'restingHR' is skipped; kind-less rows pass).
  LoadModel.restingHR = function (healthSamples, todayStr) {
    var today = todayStr || U.todayStr();
    var byDate = {};
    for (var i = 0; i < (healthSamples || []).length; i++) {
      var s = healthSamples[i];
      if (!s || !s.date || s.date > today) continue;
      if (s.kind !== undefined && s.kind !== 'restingHR') continue;
      if (typeof s.value !== 'number' || !isFinite(s.value) || s.value <= 0) continue;
      byDate[s.date] = s.value; // one sample per day; later rows win
    }
    var dates = Object.keys(byDate).sort();
    if (!dates.length) {
      return { today: null, latest: null, latestDate: null, baseline28: null, spike: false };
    }
    var latestDate = dates[dates.length - 1];
    var winStart = U.addDays(today, -27);
    var win = [];
    for (var d = 0; d < dates.length; d++) {
      if (dates[d] >= winStart) win.push(dates[d]);
    }
    var baseline = null;
    var spike = false;
    if (win.length) {
      var sum = 0;
      for (var b = 0; b < win.length; b++) sum += byDate[win[b]];
      baseline = sum / win.length;
      if (win.length >= 2 && baseline > 0) {
        var threshold = baseline * SPIKE_FACTOR - 1e-9;
        spike = byDate[win[win.length - 1]] >= threshold &&
          byDate[win[win.length - 2]] >= threshold;
      }
    }
    return {
      today: byDate[today] !== undefined ? byDate[today] : null,
      latest: byDate[latestDate],
      latestDate: latestDate,
      baseline28: baseline === null ? null : U.round1(baseline),
      spike: spike
    };
  };

  /* ---------- green week ---------- */

  // green = >= 4 sessions AND >= 1 full rest day. A session is any workout
  // with >= 1 entry (the P1 rings rule); any logged workout occupies its day
  // for rest purposes (same as Guardrails.weeklyStatus). Elapsed-days rule:
  // in the current week only days that have already happened can count as the
  // rest day — the untrained remainder of the week isn't rest yet.
  LoadModel.greenWeek = function (workouts, user, weekStart) {
    var ws = U.weekStart(weekStart || U.todayStr());
    var weekEnd = U.addDays(ws, 6);
    var today = U.todayStr();
    var uid = user && user.id;
    var sessions = 0;
    var occupied = {};
    for (var i = 0; i < (workouts || []).length; i++) {
      var w = workouts[i];
      if (!w || !inRange(w.date, ws, weekEnd)) continue;
      if (uid && w.userId && w.userId !== uid) continue;
      occupied[w.date] = true;
      if (entriesOf(w).length) sessions++;
    }
    var restDayTaken = false;
    for (var d = 0; d < 7; d++) {
      var day = U.addDays(ws, d);
      if (day > today) break;
      if (!occupied[day]) { restDayTaken = true; break; }
    }
    return {
      sessions: sessions,
      restDayTaken: restDayTaken,
      green: sessions >= GREEN_WEEK_SESSIONS && restDayTaken
    };
  };

  /* ---------- ruck economy ---------- */

  // One row per ruck entry that has both distance and duration; the view
  // plots pace vs load. loadKg falls back total -> dry -> 0 (an unloaded
  // walk still charts, at zero load). Rows date asc, ties by createdAt asc.
  LoadModel.ruckEconomy = function (workouts) {
    var sorted = (workouts || []).slice().sort(function (a, b) {
      var ad = (a && a.date) || '';
      var bd = (b && b.date) || '';
      if (ad !== bd) return ad < bd ? -1 : 1;
      return num(a && a.createdAt) - num(b && b.createdAt);
    });
    var rows = [];
    for (var i = 0; i < sorted.length; i++) {
      var w = sorted[i];
      var entries = entriesOf(w);
      for (var j = 0; j < entries.length; j++) {
        var e = entries[j];
        if (!e || e.type !== 'cardio' || e.mode !== 'ruck') continue;
        var km = num(e.distanceKm);
        var min = num(e.durationMin);
        if (km <= 0 || min <= 0) continue;
        var load = ruckLoadKg(e);
        rows.push({
          date: w.date,
          km: U.round1(km),
          loadKg: load === null ? 0 : U.round1(load),
          minPerKm: U.round1(min / km)
        });
      }
    }
    return rows;
  };

  window.LoadModel = LoadModel;
})();
