/* IronLog — Goals judgment engine (P7 probe).
   Pure arithmetic over data the user gave the app. No DOM, no network, and no
   wall clock: every function takes `today` ('YYYY-MM-DD') so judgments are
   reproducible and testable. The optional coach may COMMENT on a verdict; it
   can never produce one — nothing in this file reads anything but its inputs.

   The binding spec lives in ARCHITECTURE.md (P7 addendum). The refusals are
   the point: no verdict from fewer than 3 points, no verdict from a stale
   measure, no percentage for anything that isn't a Reach trajectory, no cause
   asserted that the data cannot show. Tests pin every number here. */
(function () {
  'use strict';

  const U = window.U;
  const Goals = {};

  /* ---------- thresholds (the spec, in one place) ---------- */

  Goals.MIN_POINTS = 3;          // below this: 'measuring', never a trend
  Goals.TREND_WINDOW = 5;        // observed rate = slope of the last N points
  Goals.REFRESH_DAYS = 7;        // weekly-asked measures
  Goals.STALE_FACTOR = 2;        // stale = newest point older than 2x refresh
  Goals.ADHERENCE_HIGH = 0.8;    // the diagnosis threshold
  Goals.FLAT_FRACTION = 0.25;    // flat = |observed| < 25% of |required| ...
  Goals.FLAT_WINDOW = 28;        // ...over the trailing 28 days, >= 3 points
  Goals.REVIEW_DAYS = 7;         // a review is due weekly

  /* ---------- small date helpers ---------- */

  function days(a, b) { // whole days from date-string a to date-string b
    return Math.round((U.strToDate(b).getTime() - U.strToDate(a).getTime()) / 86400000);
  }

  function sortedPoints(measures) {
    const pts = (measures || []).filter(function (m) {
      return m && typeof m.date === 'string' && isFinite(Number(m.value));
    }).map(function (m) { return { date: m.date, value: Number(m.value) }; });
    pts.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return pts;
  }
  Goals.sortedPoints = sortedPoints;

  /* ---------- rates ---------- */

  // (target - latest) / days left, per day. Recomputed from TODAY, always —
  // the plan owes you the truth about where you are, not where you started.
  Goals.requiredRate = function (goal, latestValue, today) {
    if (!goal || !goal.target || !isFinite(Number(goal.target.value))) return null;
    if (!goal.target.date || !isFinite(Number(latestValue))) return null;
    const left = Math.max(1, days(today, goal.target.date));
    return (Number(goal.target.value) - Number(latestValue)) / left;
  };

  // Least-squares slope (value per day) of the last TREND_WINDOW points.
  // Fewer than 2 points has no slope; the caller's verdict handles < 3.
  Goals.observedRate = function (points) {
    const pts = points.slice(-Goals.TREND_WINDOW);
    if (pts.length < 2) return null;
    const x0 = pts[0].date;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    const n = pts.length;
    for (const p of pts) {
      const x = days(x0, p.date);
      sx += x; sy += p.value; sxx += x * x; sxy += x * p.value;
    }
    const denom = n * sxx - sx * sx;
    if (denom === 0) return null; // all points on one day
    return (n * sxy - sx * sy) / denom;
  };

  /* ---------- the verdict ----------
     Precedence is binding: measuring beats stale beats everything — a verdict
     the data can't fund is never rendered, even a flattering one. */
  Goals.verdict = function (goal, measures, today) {
    const pts = sortedPoints(measures);
    const out = { state: null, points: pts.length, requiredRate: null,
      observedRate: null, daysBehind: null, latest: pts.length ? pts[pts.length - 1] : null };

    if (pts.length < Goals.MIN_POINTS) { out.state = 'measuring'; return out; }

    const last = pts[pts.length - 1];
    if (days(last.date, today) > Goals.STALE_FACTOR * Goals.REFRESH_DAYS) {
      out.state = 'stale';
      return out; // suspended — the UI asks for the number instead of judging
    }

    const req = Goals.requiredRate(goal, last.value, today);
    const obs = Goals.observedRate(pts);
    out.requiredRate = req;
    out.observedRate = obs;
    if (req === null) { out.state = 'measuring'; return out; }

    // Already there? Direction comes from the BASELINE, not from the current
    // required rate — required flips sign the moment you overshoot the target,
    // and judging direction by it would read an overshoot as "behind".
    const target = Number(goal.target.value);
    const base = goal.baseline && isFinite(Number(goal.baseline.value))
      ? Number(goal.baseline.value) : null;
    const dir = base !== null && base !== target ? (target > base ? 1 : -1)
      : (req > 0 ? 1 : -1);
    if (dir > 0 ? last.value >= target : last.value <= target) {
      out.state = 'ontrack';
      return out;
    }

    const rightWay = obs !== null && obs * req > 0; // moving toward the target
    if (rightWay && Math.abs(obs) >= Math.abs(req)) {
      out.state = 'ontrack';
      return out;
    }

    out.state = 'behind';
    if (rightWay) {
      const arrivalDays = (target - last.value) / obs;             // from last point
      const needDays = days(last.date, goal.target.date);
      out.daysBehind = Math.max(0, Math.round(arrivalDays - needDays));
    }
    // Not moving toward it at all: daysBehind stays null — "at this rate you
    // never arrive" is the honest reading, and the UI says that, not a number.
    return out;
  };

  /* ---------- adherence ---------- */

  // Scheduled count over the trailing window ending today (inclusive).
  // Weekly cadences count whole weeks only — no partial-week inflation.
  Goals.scheduledIn = function (practice, windowDays) {
    const cad = practice && practice.cadence ? practice.cadence : { type: 'daily' };
    if (cad.type === 'weekly') {
      const times = Math.max(1, Number(cad.times) || 1);
      return Math.floor(windowDays / 7) * times;
    }
    return windowDays;
  };

  Goals.adherence = function (practice, ticks, today, windowDays) {
    const from = U.addDays(today, -(windowDays - 1));
    const done = (ticks || []).filter(function (t) {
      return t && t.practiceId === practice.id &&
        typeof t.date === 'string' && t.date >= from && t.date <= today;
    }).length;
    const scheduled = Goals.scheduledIn(practice, windowDays);
    return { done: done, scheduled: scheduled,
      rate: scheduled > 0 ? Math.min(1, done / scheduled) : null };
  };

  // Standing practices: adherence vs floor (times per 7 days). Never a
  // trajectory, never "done".
  Goals.floorStatus = function (practice, ticks, today) {
    const a = Goals.adherence(practice, ticks, today, 7);
    const floor = Number(practice.floor);
    if (!isFinite(floor) || floor <= 0) return { done: a.done, floor: null, state: 'untracked' };
    return { done: a.done, floor: floor, state: a.done >= floor ? 'holding' : 'below' };
  };

  /* ---------- flatness ----------
     "The number stopped moving" must be SUSTAINED before it becomes a verdict:
     slope of the points inside the trailing FLAT_WINDOW days, at least
     MIN_POINTS of them, under FLAT_FRACTION of required. One bad trial is
     noise; three quiet weeks are evidence. */
  Goals.isFlat = function (goal, measures, today) {
    const pts = sortedPoints(measures).filter(function (p) {
      return days(p.date, today) <= Goals.FLAT_WINDOW;
    });
    if (pts.length < Goals.MIN_POINTS) return false;
    const last = pts[pts.length - 1];
    const req = Goals.requiredRate(goal, last.value, today);
    const obs = Goals.observedRate(pts);
    if (req === null || obs === null) return false;
    if (obs * req > 0 && Math.abs(obs) >= Math.abs(req) * Goals.FLAT_FRACTION) return false;
    return true;
  };

  /* ---------- the Sunday diagnosis ----------
     Crossing "did the work happen" with "did the number move" is the whole
     product. The refusal in the third row is deliberate and binding: a
     practice that wasn't run CANNOT be evaluated, so low adherence never
     produces a judgment of the path — only of the fit. */
  Goals.diagnosis = function (goal, practice, ticks, measures, today) {
    const adh = Goals.adherence(practice, ticks, today, 7);
    const verdict = Goals.verdict(goal, measures, today);
    const out = { adherence: adh, verdict: verdict, state: null };

    if (adh.rate !== null && adh.rate < Goals.ADHERENCE_HIGH) {
      out.state = 'doesntfit';   // the path is UNJUDGED — it wasn't run
      return out;
    }
    if (verdict.state === 'measuring' || verdict.state === 'stale') {
      out.state = 'undecided';   // work happened; the measure can't speak yet
      return out;
    }
    if (verdict.state === 'ontrack') { out.state = 'holding'; return out; }
    if (Goals.isFlat(goal, measures, today)) { out.state = 'pathwrong'; return out; }
    out.state = 'undecided';     // moving, just not fast enough — levers, not blame
    return out;
  };

  /* ---------- miss patterns ----------
     Computed from tick dates the app actually holds — day-of-week counts of
     scheduled-but-unticked days. The MEANING of a pattern is asked, never
     guessed: this function returns counts and nothing else. */
  Goals.missPattern = function (practice, ticks, today, windowDays) {
    const cad = practice && practice.cadence ? practice.cadence : { type: 'daily' };
    if (cad.type !== 'daily') return null; // which weekday "should" have a
                                           // weekly tick is unknowable
    const win = windowDays || 28;
    const have = {};
    (ticks || []).forEach(function (t) {
      if (t && t.practiceId === practice.id) have[t.date] = true;
    });
    const byDay = [0, 0, 0, 0, 0, 0, 0]; // Sun..Sat
    let misses = 0;
    for (let i = win - 1; i >= 0; i--) {
      const d = U.addDays(today, -i);
      if (d < (practice.createdAtDate || d)) continue;
      if (!have[d]) { byDay[U.strToDate(d).getDay()]++; misses++; }
    }
    return { byDay: byDay, misses: misses };
  };

  /* ---------- reviews ---------- */

  Goals.reviewDue = function (lastReviewDate, today) {
    if (!lastReviewDate) return true;             // never reviewed
    return days(lastReviewDate, today) >= Goals.REVIEW_DAYS;
  };

  /* ---------- progress (Reach goals only) ----------
     A Reach goal MAY show a fraction honestly: (latest − baseline) over
     (target − baseline) is real arithmetic on real numbers, unlike the
     fabricated readiness percentages the spec forbids for Events. Clamped:
     an overshoot is 1, a regression below baseline is 0. */
  Goals.progress = function (goal, measures) {
    if (!goal || !goal.baseline || !goal.target) return null;
    const base = Number(goal.baseline.value);
    const target = Number(goal.target.value);
    if (!isFinite(base) || !isFinite(target) || base === target) return null;
    const pts = sortedPoints(measures);
    const latest = pts.length ? pts[pts.length - 1].value : base;
    const frac = (latest - base) / (target - base);
    return { frac: Math.max(0, Math.min(1, frac)), latest: latest };
  };

  /* ---------- streaks ----------
     Daily: consecutive ticked days ending today (an unticked today doesn't
     break it until the day is over). Weekly xN: consecutive whole weeks that
     met the cadence, counting back from the current week — the current week
     counts once it has met N, and doesn't break the streak until it's over
     and short. */
  Goals.streak = function (practice, ticks, today) {
    const have = {};
    (ticks || []).forEach(function (t) {
      if (t && t.practiceId === practice.id) have[t.date] = true;
    });
    const cad = practice.cadence || { type: 'daily' };

    if (cad.type !== 'weekly') {
      let n = 0;
      let d = today;
      if (!have[d]) d = U.addDays(d, -1);
      while (have[d]) { n++; d = U.addDays(d, -1); }
      return n;
    }

    const times = Math.max(1, Number(cad.times) || 1);
    function weekCount(endDate) {
      let c = 0;
      for (let i = 0; i < 7; i++) if (have[U.addDays(endDate, -i)]) c++;
      return c;
    }
    // Weeks end on `today`, stepping back 7 at a time. The in-progress week
    // only ever ADDS to the streak; it can't break it early.
    let n = 0;
    let end = today;
    if (weekCount(end) >= times) n++;
    end = U.addDays(end, -7);
    while (weekCount(end) >= times) { n++; end = U.addDays(end, -7); }
    return n;
  };

  /* ---------- capacity ----------
     The soft check at the door: how many daily practices already exist, and
     how well they're actually being kept (pooled 28-day adherence). The UI
     turns a strained answer into a conversation, never a wall. */
  Goals.capacity = function (practices, ticks, today) {
    const daily = (practices || []).filter(function (p) {
      return !p.cadence || p.cadence.type !== 'weekly';
    });
    let done = 0, scheduled = 0;
    daily.forEach(function (p) {
      const a = Goals.adherence(p, ticks, today, 28);
      done += a.done;
      scheduled += a.scheduled;
    });
    return { daily: daily.length,
      adh28: scheduled > 0 ? Math.min(1, done / scheduled) : null };
  };

  /* Backfill honesty: a tick can be recorded for today or yesterday, never
     deeper. The past is the record, not an editable surface. */
  Goals.canBackfill = function (date, today) {
    return date === today || date === U.addDays(today, -1);
  };

  window.Goals = Goals;
})();
