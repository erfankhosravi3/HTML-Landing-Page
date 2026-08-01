/* IronLog — LoadModel: per-modality training-load arithmetic (P4 Intelligence).
   Pure functions over (workouts | healthSamples) — no DOM, no Store access.
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
                                    no sets and setwork sets carry no 'type')
     other  engine minutes/week     swim/bike/row/stairs/circuit durationMin

   ACWR: acute = the trailing 7-day sum ending today; chronic = the mean of the
   4 trailing 7-day windows ending today / -7 / -14 / -21 (i.e. the standard
   rolling 28-day load ÷ 4, acute week included). ratio is null when chronic
   sits under a per-modality floor (insufficient history — never divide by ~0).
   Weeks start Monday (U.weekStart), like every other week window in the app. */
(function () {
  'use strict';

  const LoadModel = {};

  const KM_PER_MILE = 1.609344;

  const MODALITIES = ['run', 'ruck', 'lift', 'other'];
  const OTHER_MODES = { swim: 1, bike: 1, row: 1, stairs: 1, circuit: 1 };

  // Chronic floors: below these 4-week average weekly loads the denominator is
  // noise, so acwr reports ratio null instead of a scare number. Units match
  // each modality (km, kg·mi, kg, min). Inclusive: chronic === floor computes.
  const FLOORS = { run: 5, ruck: 20, lift: 1000, other: 30 };

  // Ratio zones, evaluated on the SAME 2-decimal ratio the object reports so a
  // chip and its number can never disagree:
  //   ratio > 1.4          'ramping-fast'
  //   1.3 < ratio <= 1.4   'ramping'
  //   0.8 <= ratio <= 1.3  'steady'
  //   ratio < 0.8          'detraining'   (chronic-established only — a null
  //                                        ratio has no zone)
  const SEVERITY = { 'ramping-fast': 3, 'ramping': 2, 'detraining': 1, 'steady': 0 };
  const ZONE_LABELS = {
    'ramping-fast': 'Ramping fast', 'ramping': 'Ramping',
    'steady': 'Steady', 'detraining': 'Winding down'
  };

  // The headline picks the worst zone; ties break ruck > run > lift > other
  // (highest-impact modality first).
  const TIE_ORDER = ['ruck', 'run', 'lift', 'other'];
  const MODALITY_LABELS = { run: 'run', ruck: 'ruck', lift: 'lift', other: 'conditioning' };

  const SPIKE_FACTOR = 1.07;        // restingHR spike = value >= baseline28 × 1.07
  const BASELINE_DAYS = 28;         // resting-HR baseline window
  const GREEN_WEEK_SESSIONS = 4;    // green week = >= 4 sessions AND >= 1 rest day

  LoadModel.KM_PER_MILE = KM_PER_MILE;
  LoadModel.MODALITIES = MODALITIES;
  LoadModel.FLOORS = FLOORS;
  LoadModel.ZONE_SEVERITY = SEVERITY;
  LoadModel.ZONE_LABELS = ZONE_LABELS;
  LoadModel.TIE_ORDER = TIE_ORDER;
  LoadModel.MODALITY_LABELS = MODALITY_LABELS;
  LoadModel.SPIKE_FACTOR = SPIKE_FACTOR;
  LoadModel.BASELINE_DAYS = BASELINE_DAYS;
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

  // Ruck load fallback, identical to Guardrails: total (wet) load first, dry
  // load second, null when the user logged neither.
  function ruckLoadKg(e) {
    if (typeof e.loadKgTotal === 'number' && e.loadKgTotal > 0) return e.loadKgTotal;
    if (typeof e.loadKgDry === 'number' && e.loadKgDry > 0) return e.loadKgDry;
    return null;
  }

  // Analytics is optional at call time: without it lift tonnage reads 0 rather
  // than throwing (node harnesses, or a partial script load).
  function analytics() {
    return (typeof window !== 'undefined' && window.Analytics) ? window.Analytics : null;
  }

  // Raw (unrounded) load one workout contributes to one modality.
  function workoutLoad(w, modality) {
    if (modality === 'lift') {
      const A = analytics();
      return A ? Math.max(0, num(A.workoutVolume(w))) : 0;
    }
    let total = 0;
    for (const e of entriesOf(w)) {
      if (!e || e.type !== 'cardio') continue;
      if (modality === 'run') {
        if (e.mode === 'run') total += Math.max(0, num(e.distanceKm));
      } else if (modality === 'ruck') {
        if (e.mode === 'ruck') {
          const load = ruckLoadKg(e);
          const km = Math.max(0, num(e.distanceKm));
          if (load !== null && km > 0) total += load * (km / KM_PER_MILE);
        }
      } else if (modality === 'other') {
        if (OTHER_MODES[e.mode] === 1) total += Math.max(0, num(e.durationMin));
      }
    }
    return total;
  }

  // Raw sum over an inclusive date window. Unknown modality sums to 0.
  function windowSum(workouts, modality, startStr, endStr) {
    let total = 0;
    for (const w of workouts || []) {
      if (w && inRange(w.date, startStr, endStr)) total += workoutLoad(w, modality);
    }
    return total;
  }

  /* ---------- weekly ---------- */

  // Load for the Mon-Sun week containing weekStart (any day in the week works —
  // it is normalized with U.weekStart). Defaults to the current week.
  LoadModel.weekly = function (workouts, modality, weekStart) {
    const ws = U.weekStart(weekStart || U.todayStr());
    return U.round1(windowSum(workouts, modality, ws, U.addDays(ws, 6)));
  };

  /* ---------- acwr ---------- */

  // { acute, chronic, ratio|null } for one modality as of todayStr (default
  // today). acute/chronic are rounded to 1 decimal and the ratio is derived
  // from those reported numbers, so the returned object is self-consistent and
  // auditable by hand. ratio is null below the modality's chronic floor.
  LoadModel.acwr = function (workouts, modality, todayStr) {
    const today = todayStr || U.todayStr();
    let sum = 0;
    let acuteRaw = 0;
    for (let k = 0; k < 4; k++) {
      const s = windowSum(workouts, modality, U.addDays(today, -6 - 7 * k), U.addDays(today, -7 * k));
      if (k === 0) acuteRaw = s;
      sum += s;
    }
    const acute = U.round1(acuteRaw);
    const chronic = U.round1(sum / 4);
    const floor = FLOORS[modality];
    let ratio = null;
    if (typeof floor === 'number' && chronic >= floor && chronic > 0) {
      ratio = Math.round((acute / chronic) * 100) / 100;
    }
    return { acute: acute, chronic: chronic, ratio: ratio };
  };

  // Zone for a ratio; a null/absent ratio has no zone (null).
  LoadModel.zoneFor = function (ratio) {
    if (typeof ratio !== 'number' || !isFinite(ratio)) return null;
    if (ratio > 1.4) return 'ramping-fast';
    if (ratio > 1.3) return 'ramping';
    if (ratio >= 0.8) return 'steady';
    return 'detraining';
  };

  /* ---------- status (daily guidance) ---------- */

  // Plain-language, non-preachy, one sentence of state + one of what to do —
  // the same voice as Guardrails.MESSAGES.
  function headlineFor(zone, ratio, modality) {
    const pct = Math.abs(Math.round((ratio - 1) * 100));
    const label = MODALITY_LABELS[modality];
    if (zone === 'ramping-fast') {
      return 'Ramping fast — ' + pct + '% above your 4-week ' + label +
        ' average. Today should be easy or off.';
    }
    if (zone === 'ramping') {
      return 'Ramping — ' + pct + '% above your 4-week ' + label +
        ' average. Keep the next few days easy.';
    }
    return 'Winding down — ' + pct + '% below your 4-week ' + label +
      ' average. Build back gradually.';
  }

  LoadModel.status = function (workouts, todayStr) {
    const today = todayStr || U.todayStr();
    const perModality = {};
    for (const m of MODALITIES) {
      const a = LoadModel.acwr(workouts, m, today);
      perModality[m] = {
        acute: a.acute,
        chronic: a.chronic,
        ratio: a.ratio,
        zone: LoadModel.zoneFor(a.ratio)
      };
    }
    // Worst zone wins the headline; walking TIE_ORDER with a strict '>' lets
    // the earlier (higher-impact) modality keep a tie. Steady and no-zone
    // (null ratio) say nothing — silence is the good news.
    let worst = null;
    for (const mod of TIE_ORDER) {
      const zone = perModality[mod].zone;
      if (!zone || SEVERITY[zone] === 0) continue;
      if (!worst || SEVERITY[zone] > SEVERITY[perModality[worst].zone]) worst = mod;
    }
    let headline = null;
    if (worst) headline = headlineFor(perModality[worst].zone, perModality[worst].ratio, worst);
    return { perModality: perModality, headline: headline };
  };

  /* ---------- resting HR ---------- */

  // 28-day baseline (mean of the sampled days in [today-27, today]) plus spike
  // detection: the 2 most recent SAMPLED days in that window are both at or
  // over baseline × 1.07. "Consecutive" means consecutive in sampling order —
  // calendar gaps between wearable syncs are tolerated; they neither break nor
  // fake a spike. One sampled day can never spike (nothing to confirm it).
  // Accepts a pre-filtered list or the raw healthSamples collection (rows of
  // another kind are skipped; kind-less rows are taken as resting HR). Filter
  // by user before calling — samples carry no user context here.
  LoadModel.restingHR = function (healthSamples, todayStr) {
    const today = todayStr || U.todayStr();
    const byDate = {};
    for (const s of healthSamples || []) {
      if (!s || !s.date || s.date > today) continue;
      if (s.kind !== undefined && s.kind !== 'restingHR') continue;
      if (typeof s.value !== 'number' || !isFinite(s.value) || s.value <= 0) continue;
      byDate[s.date] = s.value; // one sample per day (Store upserts); last wins
    }
    const dates = Object.keys(byDate).sort();
    if (!dates.length) {
      return { today: null, latest: null, latestDate: null, baseline28: null, spike: false };
    }
    const latestDate = dates[dates.length - 1];
    const winStart = U.addDays(today, -(BASELINE_DAYS - 1));
    const win = [];
    for (const d of dates) {
      if (d >= winStart) win.push(d);
    }
    let baseline = null;
    let spike = false;
    if (win.length) {
      let sum = 0;
      for (const d of win) sum += byDate[d];
      baseline = sum / win.length;
      if (win.length >= 2 && baseline > 0) {
        // Compare against the unrounded baseline, with a float-noise epsilon so
        // an exactly-at-threshold reading counts (the rule is >=).
        const threshold = baseline * SPIKE_FACTOR - 1e-9;
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

  // green = >= 4 sessions AND >= 1 full rest day. A session is any workout with
  // >= 1 entry (the P1 rings rule); any logged workout — even an empty one —
  // occupies its day for rest purposes, matching Guardrails.weeklyStatus.
  // Elapsed-days rule: in the current week only days that have already happened
  // can count as the rest day — the untrained remainder of the week isn't rest
  // yet (a future week therefore reports restDayTaken false).
  LoadModel.greenWeek = function (workouts, user, weekStart) {
    const ws = U.weekStart(weekStart || U.todayStr());
    const weekEnd = U.addDays(ws, 6);
    const today = U.todayStr();
    const uid = user && user.id;
    let sessions = 0;
    const occupied = {};
    for (const w of workouts || []) {
      if (!w || !inRange(w.date, ws, weekEnd)) continue;
      if (uid && w.userId && w.userId !== uid) continue;
      occupied[w.date] = true;
      if (entriesOf(w).length) sessions++;
    }
    let restDayTaken = false;
    for (let i = 0; i < 7; i++) {
      const day = U.addDays(ws, i);
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

  // One row per ruck entry carrying BOTH distance and duration (pace needs
  // both); the view plots pace vs load. loadKg falls back total -> dry -> 0, so
  // an unloaded march still charts, at zero load. Rows date asc, ties by
  // createdAt asc (same deterministic order as Analytics).
  LoadModel.ruckEconomy = function (workouts) {
    const sorted = (workouts || []).slice().sort(function (a, b) {
      const ad = (a && a.date) || '';
      const bd = (b && b.date) || '';
      if (ad !== bd) return ad < bd ? -1 : 1;
      return num(a && a.createdAt) - num(b && b.createdAt);
    });
    const rows = [];
    for (const w of sorted) {
      for (const e of entriesOf(w)) {
        if (!e || e.type !== 'cardio' || e.mode !== 'ruck') continue;
        const km = num(e.distanceKm);
        const min = num(e.durationMin);
        if (km <= 0 || min <= 0) continue;
        const load = ruckLoadKg(e);
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
