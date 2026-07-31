/* IronLog — Analytics: pure computation over state. No DOM, no Store access.
   Everything comes in as arguments; ExerciseDB is read lazily for muscle lookups. */
(function () {
  'use strict';

  const Analytics = {};

  // Canonical 18 muscle ids (binding contract — never invent another).
  const MUSCLE_IDS = [
    'chest', 'front_delts', 'side_delts', 'rear_delts', 'traps', 'lats',
    'upper_back', 'lower_back', 'biceps', 'triceps', 'forearms', 'abs',
    'obliques', 'glutes', 'quads', 'hamstrings', 'adductors', 'calves'
  ];
  const MUSCLE_INDEX = {};
  MUSCLE_IDS.forEach(function (id, i) { MUSCLE_INDEX[id] = i; });

  function db() {
    return (typeof window !== 'undefined' && window.ExerciseDB) ? window.ExerciseDB : null;
  }

  function num(n) {
    return (typeof n === 'number' && isFinite(n)) ? n : 0;
  }

  function zeroMuscles() {
    const out = {};
    for (const id of MUSCLE_IDS) out[id] = 0;
    return out;
  }

  function roundMuscles(obj) {
    for (const id of MUSCLE_IDS) obj[id] = U.round1(obj[id]);
    return obj;
  }

  // Workouts sorted date asc, ties by createdAt asc (stable, deterministic).
  function sortedAsc(workouts) {
    return (workouts || []).slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return num(a.createdAt) - num(b.createdAt);
    });
  }

  function workSets(entry) {
    const out = [];
    for (const s of (entry && entry.sets) || []) {
      if (s && s.type === 'work') out.push(s);
    }
    return out;
  }

  // Raw (unrounded) Epley for internal comparisons.
  function rawE1rm(weightKg, reps) {
    const w = num(weightKg);
    const r = num(reps);
    if (r < 1 || w <= 0) return 0;
    if (r === 1) return w;
    return w * (1 + r / 30);
  }

  /* ---------- basics ---------- */

  Analytics.e1rm = function (weightKg, reps) {
    return U.round1(rawE1rm(weightKg, reps));
  };

  Analytics.setVolume = function (set) {
    if (!set || set.type !== 'work') return 0;
    return num(set.weightKg) * num(set.reps);
  };

  Analytics.workoutVolume = function (w) {
    let v = 0;
    for (const e of (w && w.entries) || []) {
      for (const s of e.sets || []) v += Analytics.setVolume(s);
    }
    return v;
  };

  Analytics.workoutSets = function (w) {
    let n = 0;
    for (const e of (w && w.entries) || []) {
      for (const s of e.sets || []) if (s && s.type === 'work') n++;
    }
    return n;
  };

  /* ---------- weekly series ---------- */

  Analytics.weeklySeries = function (workouts, weeks) {
    const n = Math.max(1, weeks | 0);
    const cur = U.weekStart(U.todayStr());
    const rows = [];
    const byWeek = {};
    for (let i = n - 1; i >= 0; i--) {
      const ws = U.addDays(cur, -7 * i);
      const row = { weekStart: ws, volumeKg: 0, sets: 0, workouts: 0 };
      rows.push(row);
      byWeek[ws] = row;
    }
    for (const w of workouts || []) {
      const row = byWeek[U.weekStart(w.date)];
      if (!row) continue;
      row.volumeKg += Analytics.workoutVolume(w);
      row.sets += Analytics.workoutSets(w);
      row.workouts += 1;
    }
    for (const row of rows) row.volumeKg = U.round1(row.volumeKg);
    return rows;
  };

  /* ---------- muscle aggregation ----------
     Each work set credits primaryMuscles 1.0 and secondaryMuscles 0.5. */

  // cb(muscleId, factor, set, workout) for every work set of every known exercise
  // in workouts passing dateFilter(dateStr).
  function creditWorkSets(workouts, dateFilter, cb) {
    const DB = db();
    if (!DB) return;
    for (const w of workouts || []) {
      if (dateFilter && !dateFilter(w.date)) continue;
      for (const entry of w.entries || []) {
        const ex = DB.byId(entry.exerciseId);
        if (!ex) continue;
        for (const s of entry.sets || []) {
          if (!s || s.type !== 'work') continue;
          for (const m of ex.primaryMuscles || []) {
            if (m in MUSCLE_INDEX) cb(m, 1, s, w);
          }
          for (const m of ex.secondaryMuscles || []) {
            if (m in MUSCLE_INDEX) cb(m, 0.5, s, w);
          }
        }
      }
    }
  }

  Analytics.muscleWeeklySets = function (workouts, weekStartStr) {
    const end = U.addDays(weekStartStr, 6);
    const out = zeroMuscles();
    creditWorkSets(workouts, function (d) { return d >= weekStartStr && d <= end; },
      function (m, factor) { out[m] += factor; });
    return roundMuscles(out);
  };

  Analytics.muscleVolume28d = function (workouts, endDateStr) {
    const start = U.addDays(endDateStr, -27);
    const out = zeroMuscles();
    creditWorkSets(workouts, function (d) { return d >= start && d <= endDateStr; },
      function (m, factor, s) { out[m] += factor * num(s.weightKg) * num(s.reps); });
    return roundMuscles(out);
  };

  /* ---------- per-exercise history ---------- */

  Analytics.exerciseHistory = function (workouts, exerciseId) {
    const rows = [];
    for (const w of sortedAsc(workouts)) {
      let has = false;
      let top = null;       // best work set: highest raw e1rm, tie -> higher weight
      let topRaw = -1;
      let vol = 0;
      let sets = 0;
      for (const entry of w.entries || []) {
        if (entry.exerciseId !== exerciseId) continue;
        has = true;
        for (const s of workSets(entry)) {
          sets++;
          vol += num(s.weightKg) * num(s.reps);
          const e = rawE1rm(s.weightKg, s.reps);
          if (e > topRaw || (e === topRaw && top && num(s.weightKg) > num(top.weightKg))) {
            topRaw = e;
            top = s;
          }
        }
      }
      if (!has) continue;
      rows.push({
        date: w.date,
        workoutId: w.id,
        topWeightKg: top ? U.round1(num(top.weightKg)) : 0,
        topSet: top ? { weightKg: num(top.weightKg), reps: num(top.reps) } : null,
        e1rm: top ? U.round1(topRaw) : 0,
        volumeKg: U.round1(vol),
        sets: sets
      });
    }
    return rows;
  };

  /* ---------- PRs ----------
     Scan date asc (ties by createdAt). Per exercise, track running bests of:
     weight (top work-set weight), e1rm, reps (most reps in a single work set at
     >= 90% of current top weight), volume (single-workout volume). First-ever
     performance sets the baselines; events fire only on a strict improvement. */

  Analytics.prs = function (workouts) {
    const events = [];
    const best = {}; // exerciseId -> {topW, e1rm, reps, vol}

    for (const w of sortedAsc(workouts)) {
      // Combine work sets per exercise for this workout, preserving entry order.
      const perEx = [];
      const idx = {};
      for (const entry of w.entries || []) {
        for (const s of workSets(entry)) {
          let bucket = idx[entry.exerciseId];
          if (!bucket) {
            bucket = idx[entry.exerciseId] = { id: entry.exerciseId, sets: [] };
            perEx.push(bucket);
          }
          bucket.sets.push(s);
        }
      }

      for (const ex of perEx) {
        let maxW = 0, maxE = 0, vol = 0;
        for (const s of ex.sets) {
          const wt = num(s.weightKg);
          if (wt > maxW) maxW = wt;
          const e = Analytics.e1rm(s.weightKg, s.reps);
          if (e > maxE) maxE = e;
          vol += wt * num(s.reps);
        }

        const b = best[ex.id];
        if (!b) {
          // Baseline — not a PR.
          const nb = { topW: maxW, e1rm: maxE, reps: 0, vol: vol };
          for (const s of ex.sets) {
            if (num(s.weightKg) >= 0.9 * maxW && num(s.reps) > nb.reps) nb.reps = num(s.reps);
          }
          best[ex.id] = nb;
          continue;
        }

        if (maxW > b.topW) {
          events.push({ date: w.date, exerciseId: ex.id, kind: 'weight', value: U.round1(maxW), prev: U.round1(b.topW) });
          b.topW = maxW;
        }
        if (maxE > b.e1rm) {
          events.push({ date: w.date, exerciseId: ex.id, kind: 'e1rm', value: maxE, prev: b.e1rm });
          b.e1rm = maxE;
        }
        let maxR = 0;
        for (const s of ex.sets) {
          if (num(s.weightKg) >= 0.9 * b.topW && num(s.reps) > maxR) maxR = num(s.reps);
        }
        if (maxR > b.reps) {
          events.push({ date: w.date, exerciseId: ex.id, kind: 'reps', value: maxR, prev: b.reps });
          b.reps = maxR;
        }
        if (vol > b.vol) {
          events.push({ date: w.date, exerciseId: ex.id, kind: 'volume', value: U.round1(vol), prev: U.round1(b.vol) });
          b.vol = vol;
        }
      }
    }
    return events;
  };

  Analytics.recentPrs = function (workouts, sinceDateStr) {
    return Analytics.prs(workouts).filter(function (p) { return p.date >= sinceDateStr; });
  };

  /* ---------- streaks ---------- */

  Analytics.streaks = function (workouts) {
    const weekSet = new Set();
    for (const w of workouts || []) weekSet.add(U.weekStart(w.date));

    // Current streak: count backwards from the current week; a current week with
    // no workout yet is a grace week (skipped, not a break).
    let cursor = U.weekStart(U.todayStr());
    if (!weekSet.has(cursor)) cursor = U.addDays(cursor, -7);
    let currentWeeks = 0;
    while (weekSet.has(cursor)) {
      currentWeeks++;
      cursor = U.addDays(cursor, -7);
    }

    // Best streak anywhere in history.
    const sorted = Array.from(weekSet).sort();
    let bestWeeks = 0, run = 0, prev = null;
    for (const ws of sorted) {
      run = (prev !== null && ws === U.addDays(prev, 7)) ? run + 1 : 1;
      if (run > bestWeeks) bestWeeks = run;
      prev = ws;
    }
    return { currentWeeks: currentWeeks, bestWeeks: bestWeeks };
  };

  /* ---------- calendar heatmap ---------- */

  Analytics.calendar = function (workouts, days) {
    const n = Math.max(1, days | 0);
    const today = U.todayStr();
    const start = U.addDays(today, -(n - 1));
    const out = {};
    for (let i = 0; i < n; i++) out[U.addDays(start, i)] = 0;
    for (const w of workouts || []) {
      if (w.date >= start && w.date <= today) out[w.date] += Analytics.workoutVolume(w);
    }
    for (const d in out) out[d] = U.round1(out[d]);
    return out;
  };

  /* ---------- rep ranges ---------- */

  Analytics.repRanges = function (workouts) {
    const out = { strength: 0, hypertrophy: 0, endurance: 0 };
    for (const w of workouts || []) {
      for (const e of w.entries || []) {
        for (const s of workSets(e)) {
          const r = num(s.reps);
          if (r < 1) continue;
          if (r <= 5) out.strength++;
          else if (r <= 12) out.hypertrophy++;
          else out.endurance++;
        }
      }
    }
    return out;
  };

  /* ---------- recovery ----------
     freshness = min(1, hoursSince / recoveryHours)
     recoveryHours = 48 + 12 * min(setsLastSession, 6) / 6
     hoursSince measured from 20:00 local of the last trained date (no timestamps
     per set, so assume an evening session). Never-trained -> freshness 1. */

  Analytics.muscleRecovery = function (workouts, nowMs) {
    const now = num(nowMs) || Date.now();
    const nowDate = U.dateToStr(new Date(now));
    const weekAgo = U.addDays(nowDate, -6);

    const lastTrained = {};   // muscleId -> dateStr
    const setsByDay = {};     // muscleId -> {dateStr: creditedSets}
    const setsLast7d = zeroMuscles();

    creditWorkSets(workouts, function (d) { return d <= nowDate; },
      function (m, factor, s, w) {
        if (!lastTrained[m] || w.date > lastTrained[m]) lastTrained[m] = w.date;
        const days = setsByDay[m] || (setsByDay[m] = {});
        days[w.date] = (days[w.date] || 0) + factor;
        if (w.date >= weekAgo) setsLast7d[m] += factor;
      });

    const out = {};
    for (const m of MUSCLE_IDS) {
      const last = lastTrained[m] || null;
      if (!last) {
        out[m] = { freshness: 1, lastTrained: null, setsLast7d: 0 };
        continue;
      }
      const sessionSets = (setsByDay[m] && setsByDay[m][last]) || 0;
      const recoveryHours = 48 + 12 * Math.min(sessionSets, 6) / 6;
      const trainedAt = U.strToDate(last).getTime() + 20 * 3600000; // 20:00 local
      const hoursSince = Math.max(0, (now - trainedAt) / 3600000);
      const freshness = Math.min(1, hoursSince / recoveryHours);
      out[m] = {
        freshness: Math.round(freshness * 1000) / 1000,
        lastTrained: last,
        setsLast7d: U.round1(setsLast7d[m])
      };
    }
    return out;
  };

  /* ---------- focus recommendations ---------- */

  Analytics.recommendFocus = function (workouts, nowMs) {
    const rec = Analytics.muscleRecovery(workouts, nowMs);
    const all = MUSCLE_IDS.map(function (m) {
      return { muscleId: m, freshness: rec[m].freshness, setsLast7d: rec[m].setsLast7d };
    });
    // Freshest first; among ties prefer least-trained this week; then canonical order.
    all.sort(function (a, b) {
      if (b.freshness !== a.freshness) return b.freshness - a.freshness;
      if (a.setsLast7d !== b.setsLast7d) return a.setsLast7d - b.setsLast7d;
      return MUSCLE_INDEX[a.muscleId] - MUSCLE_INDEX[b.muscleId];
    });
    let picks = all.filter(function (r) { return r.freshness >= 0.75; }).slice(0, 5);
    if (picks.length < 3) picks = all.slice(0, 3); // always return at least 3

    const DB = db();
    let exercises = [];
    if (DB && typeof DB.all === 'function') {
      try { exercises = DB.all() || []; } catch (e) { exercises = []; }
    }
    return picks.map(function (r) {
      const matches = exercises.filter(function (x) {
        return x && (x.primaryMuscles || []).indexOf(r.muscleId) !== -1;
      });
      // Compound movements first (stable within groups).
      const compound = matches.filter(function (x) { return x.mechanics === 'compound'; });
      const isolation = matches.filter(function (x) { return x.mechanics !== 'compound'; });
      const ids = compound.concat(isolation).slice(0, 3).map(function (x) { return x.id; });
      return {
        muscleId: r.muscleId,
        freshness: r.freshness,
        setsLast7d: r.setsLast7d,
        suggestedExerciseIds: ids
      };
    });
  };

  /* ---------- body metrics ---------- */

  Analytics.bodySeries = function (metrics) {
    const points = (metrics || [])
      .filter(function (m) { return m && m.date && typeof m.value === 'number' && isFinite(m.value); })
      .map(function (m) { return { date: m.date, value: m.value }; })
      .sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
    const avg = points.map(function (p, i) {
      const from = Math.max(0, i - 6); // trailing window of up to 7 points
      let s = 0;
      for (let j = from; j <= i; j++) s += points[j].value;
      return { date: p.date, avg: U.round1(s / (i - from + 1)) };
    });
    return { points: points, avg: avg };
  };

  Analytics.trendSlope = function (points) {
    const pts = (points || []).filter(function (p) {
      return p && p.x && typeof p.y === 'number' && isFinite(p.y);
    });
    if (pts.length < 2) return 0;
    const x0 = pts[0].x;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    const n = pts.length;
    for (const p of pts) {
      const x = U.daysBetween(x0, p.x);
      sx += x; sy += p.y; sxx += x * x; sxy += x * p.y;
    }
    const denom = n * sxx - sx * sx;
    if (denom === 0) return 0;
    const perDay = (n * sxy - sx * sy) / denom;
    const perWeek = perDay * 7;
    return isFinite(perWeek) ? Math.round(perWeek * 1000) / 1000 : 0;
  };

  /* ---------- leaderboard ---------- */

  Analytics.leaderboard = function (users, allWorkouts, weekStartStr) {
    const weekEnd = U.addDays(weekStartStr, 6);
    const rows = (users || []).map(function (user, i) {
      const mine = (allWorkouts || []).filter(function (w) { return w.userId === user.id; });
      let volumeKg = 0, sets = 0, count = 0;
      for (const w of mine) {
        if (w.date < weekStartStr || w.date > weekEnd) continue;
        volumeKg += Analytics.workoutVolume(w);
        sets += Analytics.workoutSets(w);
        count++;
      }
      const prCount = Analytics.prs(mine).filter(function (p) {
        return p.date >= weekStartStr && p.date <= weekEnd;
      }).length;
      return { user: user, volumeKg: U.round1(volumeKg), workouts: count, sets: sets, prCount: prCount, _i: i };
    });
    rows.sort(function (a, b) {
      if (b.volumeKg !== a.volumeKg) return b.volumeKg - a.volumeKg;
      if (b.prCount !== a.prCount) return b.prCount - a.prCount;
      return a._i - b._i;
    });
    for (const r of rows) delete r._i;
    return rows;
  };

  /* ---------- consistency & duration ---------- */

  Analytics.consistency = function (workouts, weeks, goal) {
    const series = Analytics.weeklySeries(workouts, weeks);
    const perWeek = series.map(function (r) {
      return { weekStart: r.weekStart, count: r.workouts, workouts: r.workouts };
    });
    const total = U.sum(perWeek, function (r) { return r.count; });
    const avgPerWeek = perWeek.length ? U.round1(total / perWeek.length) : 0;
    let goalHitRate = 0;
    if (typeof goal === 'number' && goal > 0 && perWeek.length) {
      const hit = perWeek.filter(function (r) { return r.count >= goal; }).length;
      goalHitRate = Math.round((hit / perWeek.length) * 1000) / 1000;
    }
    return { perWeek: perWeek, avgPerWeek: avgPerWeek, goalHitRate: goalHitRate };
  };

  Analytics.duration = function (workouts) {
    let totalMin = 0, n = 0;
    for (const w of workouts || []) {
      if (typeof w.durationMin === 'number' && isFinite(w.durationMin) && w.durationMin > 0) {
        totalMin += w.durationMin;
        n++;
      }
    }
    if (!n) return { avgMin: 0, totalHours: 0 };
    return { avgMin: Math.round(totalMin / n), totalHours: U.round1(totalMin / 60) };
  };

  window.Analytics = Analytics;
})();
