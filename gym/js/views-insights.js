/* IronLog — Insight views: dashboard, analytics, body, leaderboard.
   Registers views on App; reads Store/Analytics/Charts/MuscleMap lazily inside
   render functions. Attaches no namespace of its own. */
(function () {
  'use strict';

  const DRAFT_KEY = 'ironlog/activeWorkout';

  /* ======================================================================
     Shared helpers
     ====================================================================== */

  function curUser() { return Store.currentUser(); }

  function myWorkouts() {
    const u = curUser();
    return u ? Store.workoutsFor(u.id) : [];
  }

  function unitLbl() { return U.unitLabel(App.units()); }

  function dispVol(kg) { return U.kgToDisplay(kg || 0, App.units()); }

  function fmtVol(kg) { return U.fmtNum(dispVol(kg)) + ' ' + unitLbl(); }

  function exName(id) {
    const x = ExerciseDB.byId(id);
    return x ? x.name : 'Unknown exercise';
  }

  function muscleLabel(id) { return ExerciseDB.MUSCLE_LABEL[id] || id; }

  function setting(key, dflt) {
    const u = curUser();
    const v = u && u.settings && u.settings[key];
    return typeof v === 'number' && isFinite(v) && v > 0 ? v : dflt;
  }

  function sizedIcon(svg, px) {
    return String(svg || '').replace('width="24" height="24"', 'width="' + px + '" height="' + px + '"');
  }

  function readDraft() {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY));
      return d && typeof d === 'object' ? d : null;
    } catch (e) { return null; }
  }

  function cardOpen(title, rightHtml) {
    return '<section class="card"><div class="card-title"><span>' + U.esc(title) + '</span>' +
      (rightHtml || '') + '</div>';
  }

  function emptyHtml(iconSvg, title, sub, btnHtml) {
    return '<div class="empty">' + (iconSvg || '') +
      '<h3>' + U.esc(title) + '</h3>' +
      (sub ? '<p>' + U.esc(sub) + '</p>' : '') +
      (btnHtml || '') + '</div>';
  }

  function miniStat(label, value, sub) {
    return '<div style="min-width:0;">' +
      '<div style="font-size:12px;color:var(--text-muted);white-space:nowrap;">' + U.esc(label) + '</div>' +
      '<div style="font-size:17px;font-weight:700;letter-spacing:-.01em;" class="tabular">' + U.esc(value) + '</div>' +
      (sub ? '<div style="font-size:12px;color:var(--text-2);">' + U.esc(sub) + '</div>' : '') +
      '</div>';
  }

  function miniStatRow(items) {
    return '<div style="display:flex;flex-wrap:wrap;gap:14px 28px;margin-top:14px;">' + items.join('') + '</div>';
  }

  function segmented(idPrefix, key, items, active) {
    return '<div class="segmented">' + items.map(function (it) {
      const on = it.value === active;
      return '<button type="button" class="seg' + (on ? ' active' : '') + '" data-seg-key="' + U.esc(key) +
        '" data-seg-val="' + U.esc(it.value) + '" aria-pressed="' + on + '" id="' + U.esc(idPrefix + '-' + it.value) + '">' +
        U.esc(it.label) + '</button>';
    }).join('') + '</div>';
  }

  function fmtSlope(slope, unit) {
    const s = U.round1(slope || 0);
    return (s > 0 ? '+' : '') + s + ' ' + unit + '/wk';
  }

  const PR_KIND_LABEL = { weight: 'Top weight', e1rm: 'e1RM', reps: 'Rep record', volume: 'Session volume' };

  function fmtPrValue(p) {
    if (p.kind === 'reps') return Math.round(p.value) + ' reps';
    if (p.kind === 'volume') return fmtVol(p.value);
    return App.fmtWeight(p.value, { precise: true });
  }

  function rangeSince(range) {
    const today = U.todayStr();
    if (range === '8w') return U.addDays(today, -55);
    if (range === '6m') return U.addDays(today, -182);
    return null; // all
  }

  const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  function monthLabel(ym) { // 'YYYY-MM'
    const y = +ym.slice(0, 4);
    const m = +ym.slice(5, 7);
    const name = MONTH_FULL[m - 1] || ym;
    return name + (y === new Date().getFullYear() ? '' : ' ' + y);
  }

  /* ======================================================================
     Dashboard
     ====================================================================== */

  App.registerView('dashboard', {
    title: 'Dashboard',
    icon: App.icons.dashboard,
    nav: true,
    order: 10,
    render: renderDashboard
  });

  function renderDashboard(container) {
    const u = curUser();
    if (!u) {
      container.innerHTML = emptyHtml(App.icons.users, 'No profile selected',
        'Create a profile to start logging workouts.');
      return;
    }
    const w = myWorkouts();
    const today = U.todayStr();
    const hr = new Date().getHours();
    const greet = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';

    const series13 = Analytics.weeklySeries(w, 13);
    const thisWk = series13[series13.length - 1] || { volumeKg: 0, sets: 0, workouts: 0 };
    const lastWk = series13[series13.length - 2] || { volumeKg: 0, sets: 0, workouts: 0 };
    const prior4 = series13.slice(-5, -1);
    const avg4Kg = prior4.length ? U.sum(prior4, function (r) { return r.volumeKg; }) / prior4.length : 0;
    const st = Analytics.streaks(w);
    const goalW = Math.max(1, Math.round(setting('weeklyWorkoutGoal', 4)));

    const monthStart = today.slice(0, 8) + '01';
    const prsMonth = Analytics.recentPrs(w, monthStart).length;

    // volume delta vs last week
    let deltaCls = 'flat', deltaTxt = 'no data last week';
    if (lastWk.volumeKg > 0) {
      const pct = Math.round(((thisWk.volumeKg - lastWk.volumeKg) / lastWk.volumeKg) * 100);
      deltaCls = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
      deltaTxt = Math.abs(pct) + '% vs last week';
    } else if (thisWk.volumeKg > 0) {
      deltaCls = 'up';
      deltaTxt = 'first week of data';
    }

    const draft = readDraft();
    const focus = Analytics.recommendFocus(w, Date.now());
    const rec = Analytics.muscleRecovery(w, Date.now());
    const heatValues = {};
    for (const m in rec) heatValues[m] = rec[m].freshness;

    // pick up to 3 suggested exercises, round-robin across focus muscles
    const suggestIds = [];
    outer:
    for (let i = 0; i < 3; i++) {
      for (const f of focus) {
        const id = (f.suggestedExerciseIds || [])[i];
        if (id && suggestIds.indexOf(id) === -1) {
          suggestIds.push(id);
          if (suggestIds.length >= 3) break outer;
        }
      }
    }
    const focusLabels = focus.slice(0, 3).map(function (f) { return muscleLabel(f.muscleId); });

    const last = w[0] || null; // workoutsFor is date desc

    let html = '';

    /* greeting */
    html += '<div class="view-head"><h2>' + U.esc(greet) + ', ' + U.esc(u.name) + '</h2>' +
      '<div class="sub">' + U.esc(U.fmtDateLong(today)) + '</div></div>';

    /* resume banner */
    if (draft) {
      const dn = draft.name || 'Workout';
      const dCount = Array.isArray(draft.entries) ? draft.entries.length : 0;
      html += '<button type="button" class="card interactive" data-act="resume" ' +
        'style="display:flex;align-items:center;gap:14px;background:var(--accent-tint);' +
        'border-color:rgba(48,209,88,.45);">' +
        '<span style="flex:none;width:44px;height:44px;border-radius:12px;display:inline-flex;' +
        'align-items:center;justify-content:center;background:var(--accent);color:var(--accent-ink);">' +
        sizedIcon(App.icons.timer, 22) + '</span>' +
        '<span style="flex:1;min-width:0;text-align:left;">' +
        '<span style="display:block;font-weight:700;">Workout in progress</span>' +
        '<span style="display:block;font-size:13px;color:var(--text-2);overflow:hidden;' +
        'text-overflow:ellipsis;white-space:nowrap;">' + U.esc(dn) +
        (dCount ? ' · ' + dCount + (dCount === 1 ? ' exercise' : ' exercises') : '') + '</span></span>' +
        '<span style="flex:none;display:inline-flex;align-items:center;gap:2px;font-weight:600;' +
        'color:var(--accent);font-size:14px;">Resume ' + sizedIcon(App.icons.chevron, 16) + '</span>' +
        '</button>';
    }

    /* stat grid */
    html += '<div class="stat-grid">';
    html += '<div class="stat"><span class="label">This week</span>' +
      '<span class="value">' + U.esc(U.fmtNum(dispVol(thisWk.volumeKg))) +
      '<span class="unit">' + U.esc(unitLbl()) + '</span></span>' +
      '<span class="delta ' + deltaCls + '">' + U.esc(deltaTxt) + '</span>' +
      '<div class="spark" data-slot="spark-vol"></div></div>';
    html += '<div class="stat"><span class="label">Workouts</span>' +
      '<span class="value">' + thisWk.workouts + '<span class="unit">/' + goalW + '</span></span>' +
      (thisWk.workouts >= goalW
        ? '<span class="delta up">weekly goal hit</span>'
        : '<span class="delta flat">' + (goalW - thisWk.workouts) + ' to go this week</span>') +
      '</div>';
    html += '<div class="stat"><span class="label">Current streak</span>' +
      '<span class="value" style="display:flex;align-items:center;gap:6px;">' +
      '<span style="color:var(--orange);display:inline-flex;">' + sizedIcon(App.icons.flame, 20) + '</span>' +
      '<span>' + st.currentWeeks + '<span class="unit">wk</span></span></span>' +
      '<span class="delta flat">best ' + st.bestWeeks + ' wk</span></div>';
    html += '<div class="stat"><span class="label">PRs this month</span>' +
      '<span class="value" style="display:flex;align-items:center;gap:6px;">' +
      '<span style="color:var(--yellow);display:inline-flex;">' + sizedIcon(App.icons.trophy, 20) + '</span>' +
      '<span>' + prsMonth + '</span></span>' +
      '<span class="delta flat">' + (prsMonth ? 'keep it up' : 'none yet') + '</span></div>';
    html += '</div>';

    /* rings + recent PRs */
    html += '<div class="grid-2">';
    html += cardOpen('This week') + '<div data-slot="rings"></div></section>';

    html += cardOpen('Recent PRs');
    const prsAll = Analytics.prs(w);
    const recent = prsAll.slice(-5).reverse();
    if (!recent.length) {
      html += emptyHtml(App.icons.trophy, 'No PRs yet', 'PRs will appear as you train.');
    } else {
      html += '<div class="list">' + recent.map(function (p) {
        return '<div class="list-row">' +
          '<span class="leading" style="color:var(--yellow);">' + sizedIcon(App.icons.trophy, 20) + '</span>' +
          '<div class="body"><span class="title">' + U.esc(exName(p.exerciseId)) + '</span>' +
          '<span class="sub">' + U.esc(PR_KIND_LABEL[p.kind] || p.kind) + ' · ' + U.esc(U.relDate(p.date)) + '</span></div>' +
          '<span class="trailing">' + U.esc(fmtPrValue(p)) + '</span></div>';
      }).join('') + '</div>';
    }
    html += '</section>';
    html += '</div>';

    /* muscle recovery */
    html += cardOpen('Muscle recovery');
    html += '<div data-slot="musclemap" class="muscle-map"></div>';
    html += '<div class="muscle-legend"><span>Needs rest</span><span class="ramp"></span><span>Ready to train</span></div>';
    if (focus.length) {
      html += '<div style="margin-top:14px;font-size:13px;font-weight:600;color:var(--text-2);">Ready to train</div>' +
        '<div class="chip-row" style="margin-top:8px;">' + focus.map(function (f) {
          return '<button type="button" class="chip" data-muscle="' + U.esc(f.muscleId) + '">' +
            U.esc(muscleLabel(f.muscleId)) + '</button>';
        }).join('') + '</div>';
    }
    if (suggestIds.length) {
      html += '<div class="divider"></div>' +
        '<div class="row between" style="flex-wrap:wrap;gap:10px;">' +
        '<div style="min-width:0;">' +
        '<div style="font-size:13px;font-weight:600;color:var(--text-2);">Suggested next workout</div>' +
        '<div style="font-size:13px;color:var(--text-muted);">' + U.esc(focusLabels.join(' · ')) + '</div></div>' +
        '<button type="button" class="btn primary small" data-act="start-suggested">Start this workout</button></div>' +
        '<div class="list" style="margin-top:6px;">' + suggestIds.map(function (id) {
          const ex = ExerciseDB.byId(id);
          const prim = ex && ex.primaryMuscles && ex.primaryMuscles[0] ? muscleLabel(ex.primaryMuscles[0]) : '';
          return '<div class="list-row"><span class="leading">' + sizedIcon(App.icons.log, 20) + '</span>' +
            '<div class="body"><span class="title">' + U.esc(exName(id)) + '</span>' +
            (prim ? '<span class="sub">' + U.esc(prim) + ' · 3 sets</span>' : '') + '</div></div>';
        }).join('') + '</div>';
    }
    html += '</section>';

    /* last workout */
    html += cardOpen('Last workout');
    if (!last) {
      html += emptyHtml(App.icons.log, 'No workouts yet', 'Your most recent session will show up here.',
        '<button type="button" class="btn primary" data-act="go-log">Start your first workout</button>');
    } else {
      const vol = Analytics.workoutVolume(last);
      const sets = Analytics.workoutSets(last);
      const exCount = (last.entries || []).length;
      html += '<div class="list-row" style="padding-left:0;padding-right:0;">' +
        '<span class="leading">' + sizedIcon(App.icons.log, 20) + '</span>' +
        '<div class="body"><span class="title">' + U.esc(last.name || 'Workout') + '</span>' +
        '<span class="sub">' + U.esc(U.relDate(last.date)) +
        ' · ' + exCount + (exCount === 1 ? ' exercise' : ' exercises') +
        ' · ' + sets + ' sets · ' + U.esc(fmtVol(vol)) +
        (last.durationMin ? ' · ' + U.esc(U.fmtDuration(last.durationMin)) : '') + '</span></div>' +
        '<button type="button" class="btn ghost small" data-act="repeat" data-id="' + U.esc(last.id) + '">Repeat</button>' +
        '</div>';
    }
    html += '</section>';

    container.innerHTML = html;

    /* mount charts */
    Charts.rings(U.$('[data-slot="rings"]', container), {
      rings: [
        { value: thisWk.workouts, goal: goalW, color: '#30d158', label: 'Workouts' },
        {
          value: Math.round(dispVol(thisWk.volumeKg)),
          goal: Math.max(1, Math.round(dispVol(avg4Kg > 0 ? avg4Kg : (thisWk.volumeKg || 1)))),
          color: Charts.SERIES[1],
          label: 'Volume (' + unitLbl() + ')'
        },
        { value: st.currentWeeks, goal: Math.max(1, st.bestWeeks), color: Charts.SERIES[2], label: 'Streak (wk)' }
      ]
    });

    Charts.spark(U.$('[data-slot="spark-vol"]', container), {
      points: series13.slice(-8).map(function (r) { return { x: r.weekStart, y: dispVol(r.volumeKg) }; }),
      color: Charts.SERIES[0]
    });

    MuscleMap.render(U.$('[data-slot="musclemap"]', container), {
      values: heatValues,
      onSelect: function (m) { App.navigate('library', { muscle: m }); }
    });

    /* events */
    U.on(container, 'click', '[data-act="resume"]', function () { App.navigate('log'); });
    U.on(container, 'click', '[data-act="go-log"]', function () { App.navigate('log'); });
    U.on(container, 'click', '[data-act="repeat"]', function (e, btn) {
      App.navigate('log', { repeat: btn.getAttribute('data-id') });
    });
    U.on(container, 'click', '.chip[data-muscle]', function (e, chip) {
      App.navigate('library', { muscle: chip.getAttribute('data-muscle') });
    });
    U.on(container, 'click', '[data-act="start-suggested"]', function () {
      startSuggestedWorkout(suggestIds, focusLabels);
    });
  }

  function startSuggestedWorkout(ids, labels) {
    const u = curUser();
    if (!u || !ids.length) return;
    if (readDraft()) {
      App.toast('A workout is already in progress — resuming it', 'info');
      App.navigate('log');
      return;
    }
    const now = Date.now();
    const entries = ids.map(function (id) {
      const sets = [];
      for (let i = 0; i < 3; i++) sets.push({ weightKg: 0, reps: 0, type: 'work', rpe: null });
      return { id: U.uid('e'), exerciseId: id, notes: '', sets: sets };
    });
    const draft = {
      id: U.uid('w'),
      userId: u.id,
      date: U.todayStr(),
      name: labels.length ? labels.join(' · ') : 'Suggested workout',
      notes: '',
      startedAt: now,
      endedAt: null,
      durationMin: null,
      source: 'manual',
      createdAt: now,
      updatedAt: now,
      entries: entries
    };
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch (e) { /* storage full */ }
    App.navigate('log', { suggest: ids.join(',') });
  }

  /* ======================================================================
     Analytics
     ====================================================================== */

  const aState = { exId: null, range: '8w', metric: 'volume', prKind: 'all' };

  App.registerView('analytics', {
    title: 'Analytics',
    icon: App.icons.analytics,
    nav: true,
    order: 40,
    render: renderAnalytics
  });

  function renderAnalytics(container) {
    const u = curUser();
    const w = myWorkouts();
    const today = U.todayStr();

    if (!u || !w.length) {
      container.innerHTML = '<div class="view-head"><h2>Analytics</h2></div>' +
        '<section class="card">' + emptyHtml(App.icons.analytics, 'Nothing to analyze yet',
          'Log a few workouts and your strength, volume and balance trends will light up here.',
          '<button type="button" class="btn primary" data-act="go-log">Log a workout</button>') + '</section>';
      U.on(container, 'click', '[data-act="go-log"]', function () { App.navigate('log'); });
      return;
    }

    /* --- exercise frequency (for the strength selector) --- */
    const freq = {};
    for (const wo of w) {
      const seen = {};
      for (const en of wo.entries || []) {
        if (!en.exerciseId || seen[en.exerciseId]) continue;
        seen[en.exerciseId] = 1;
        freq[en.exerciseId] = (freq[en.exerciseId] || 0) + 1;
      }
    }
    const logged = Object.keys(freq).sort(function (a, b) {
      return (freq[b] - freq[a]) || exName(a).localeCompare(exName(b));
    });
    if (!aState.exId || !freq[aState.exId]) aState.exId = logged[0] || null;

    const hist = aState.exId ? Analytics.exerciseHistory(w, aState.exId) : [];
    const since = rangeSince(aState.range);
    const histShown = since ? hist.filter(function (r) { return r.date >= since; }) : hist;
    const e1rmPts = histShown.map(function (r) { return { x: r.date, y: U.kgToDisplay(r.e1rm, App.units()) }; });

    let topSet = null;
    let totalSets = 0;
    for (const r of hist) {
      totalSets += r.sets;
      if (r.topSet && (!topSet || r.topWeightKg > topSet.weightKg)) topSet = r.topSet;
    }
    const currentE1 = hist.length ? hist[hist.length - 1].e1rm : 0;
    const slope = Analytics.trendSlope(e1rmPts);

    /* --- weekly volume --- */
    const ws12 = Analytics.weeklySeries(w, 12);
    const metricOf = function (r) {
      if (aState.metric === 'sets') return r.sets;
      if (aState.metric === 'workouts') return r.workouts;
      return dispVol(r.volumeKg);
    };
    const volPts = ws12.map(function (r) { return { x: r.weekStart, y: U.round1(metricOf(r)) }; });
    const prior4 = ws12.slice(-5, -1);
    const goalAvg = prior4.length ? U.round1(U.sum(prior4, metricOf) / prior4.length) : 0;
    const metricLabel = aState.metric === 'sets' ? 'Sets' : aState.metric === 'workouts' ? 'Workouts' : 'Volume (' + unitLbl() + ')';

    /* --- muscle balance: mean weekly sets over current + prior 3 weeks --- */
    const cw = U.weekStart(today);
    const weekMaps = [0, 1, 2, 3].map(function (i) {
      return Analytics.muscleWeeklySets(w, U.addDays(cw, -7 * i));
    });
    const avgSets = [];
    for (const m in weekMaps[0]) {
      let s = 0;
      for (const wm of weekMaps) s += wm[m] || 0;
      const v = s / weekMaps.length;
      if (v > 0) avgSets.push({ id: m, v: v });
    }
    avgSets.sort(function (a, b) { return b.v - a.v; });
    const setGoal = setting('weeklySetGoal', 15);
    const topMuscles = avgSets.slice(0, 12);
    const restSum = U.sum(avgSets.slice(12), function (r) { return r.v; });
    const balanceData = topMuscles.map(function (r) {
      return {
        label: muscleLabel(r.id),
        value: U.round1(r.v),
        color: r.v >= setGoal ? Charts.SERIES[0] : 'rgba(255,255,255,.25)'
      };
    });
    if (restSum > 0) balanceData.push({ label: 'Other', value: U.round1(restSum), color: 'rgba(255,255,255,.25)' });

    const mv28 = Analytics.muscleVolume28d(w, today);
    let mvMax = 0;
    for (const m in mv28) if (mv28[m] > mvMax) mvMax = mv28[m];
    const heat28 = {};
    for (const m in mv28) heat28[m] = mvMax > 0 ? U.clamp(mv28[m] / mvMax, 0, 1) : 0;

    /* --- rep ranges / consistency / PRs --- */
    const rr = Analytics.repRanges(w);
    const st = Analytics.streaks(w);
    const goalW = Math.max(1, Math.round(setting('weeklyWorkoutGoal', 4)));
    const cons = Analytics.consistency(w, 26, goalW);
    const calVals = Analytics.calendar(w, 182);
    // heat calendar shows display-unit volume so tooltips match the rest of the app
    const calDisp = {};
    for (const d in calVals) calDisp[d] = Math.round(dispVol(calVals[d]));

    const prsDesc = Analytics.prs(w).slice().reverse();
    const prShown = aState.prKind === 'all' ? prsDesc :
      prsDesc.filter(function (p) { return p.kind === aState.prKind; });

    /* ------------------------------ markup ------------------------------ */

    let html = '<div class="view-head"><h2>Analytics</h2>' +
      '<div class="sub">Strength, volume and balance across your training.</div></div>';

    /* Strength progress */
    html += cardOpen('Strength progress', segmented('a-range', 'range',
      [{ value: '8w', label: '8W' }, { value: '6m', label: '6M' }, { value: 'all', label: 'All' }], aState.range));
    html += '<button type="button" class="btn ghost" data-act="pick-ex" id="a-ex-pick" ' +
      'style="width:100%;justify-content:space-between;margin-bottom:12px;">' +
      '<span class="truncate" style="font-weight:600;">' + U.esc(aState.exId ? exName(aState.exId) : 'Choose exercise') + '</span>' +
      '<span style="display:inline-flex;transform:rotate(90deg);color:var(--text-muted);">' +
      sizedIcon(App.icons.chevron, 16) + '</span></button>';
    if (!histShown.length) {
      html += emptyHtml(App.icons.analytics, 'No sessions in this range',
        'Try a longer range, or log this exercise again.');
    } else {
      html += '<div data-slot="e1rm-chart"></div>';
    }
    html += miniStatRow([
      miniStat('Current e1RM', currentE1 > 0 ? App.fmtWeight(currentE1, { precise: true }) : '—'),
      miniStat('All-time top set', topSet ? App.fmtWeight(topSet.weightKg, { precise: true }) + ' × ' + topSet.reps : '—'),
      miniStat('Total sets', String(totalSets)),
      miniStat('Trend', e1rmPts.length >= 2 ? fmtSlope(slope, unitLbl()) : '—')
    ]);
    html += '</section>';

    /* Training volume */
    html += cardOpen('Training volume', segmented('a-metric', 'metric',
      [{ value: 'volume', label: 'Volume' }, { value: 'sets', label: 'Sets' }, { value: 'workouts', label: 'Workouts' }],
      aState.metric));
    html += '<div data-slot="vol-chart"></div>';
    html += '<p style="font-size:12px;color:var(--text-muted);margin-top:8px;">Last 12 weeks · goal line is your trailing 4-week average.</p>';
    html += '</section>';

    /* Muscle balance */
    html += cardOpen('Muscle balance');
    html += '<div class="grid-2">';
    html += '<div>';
    if (!balanceData.length) {
      html += emptyHtml(App.icons.body, 'No sets this month', 'Weekly sets per muscle will chart here.');
    } else {
      html += '<div data-slot="balance-bars"></div>';
    }
    html += '<p style="font-size:12px;color:var(--text-muted);margin-top:8px;">Average weekly sets per muscle over the last 4 weeks — green bars meet your ' +
      setGoal + '-set target, gray bars are below it.</p></div>';
    html += '<div><div style="font-size:13px;font-weight:600;color:var(--text-2);margin-bottom:6px;">Last 28 days</div>' +
      '<div data-slot="balance-map" class="muscle-map"></div>' +
      '<div class="muscle-legend"><span>Less volume</span><span class="ramp"></span><span>More volume</span></div></div>';
    html += '</div></section>';

    /* Rep ranges + Consistency */
    html += '<div class="grid-2">';
    html += cardOpen('Rep ranges');
    html += '<div data-slot="rep-donut"></div>';
    html += '<p style="font-size:12px;color:var(--text-muted);margin-top:10px;">1–5 reps builds maximal strength · 6–12 builds muscle size · 13+ builds muscular endurance.</p>';
    html += '</section>';

    html += cardOpen('Consistency');
    html += '<div data-slot="heat-cal"></div>';
    html += miniStatRow([
      miniStat('Current streak', st.currentWeeks + ' wk'),
      miniStat('Best streak', st.bestWeeks + ' wk'),
      miniStat('Avg / week', String(cons.avgPerWeek)),
      miniStat('Goal hit rate', Math.round(cons.goalHitRate * 100) + '%')
    ]);
    html += '</section>';
    html += '</div>';

    /* PR timeline */
    html += cardOpen('PR timeline');
    html += '<div class="chip-row" style="margin-bottom:6px;">' +
      [{ v: 'all', l: 'All' }, { v: 'weight', l: 'Weight' }, { v: 'e1rm', l: 'e1RM' },
       { v: 'reps', l: 'Reps' }, { v: 'volume', l: 'Volume' }].map(function (k) {
        return '<button type="button" class="chip' + (aState.prKind === k.v ? ' active' : '') +
          '" data-prkind="' + k.v + '" id="a-pr-' + k.v + '">' + k.l + '</button>';
      }).join('') + '</div>';
    if (!prShown.length) {
      html += emptyHtml(App.icons.trophy, 'No PRs here yet', 'Personal records show up the moment you beat an old best.');
    } else {
      const capped = prShown.slice(0, 100);
      let lastMonth = '';
      html += '<div class="list">';
      for (const p of capped) {
        const ym = p.date.slice(0, 7);
        if (ym !== lastMonth) {
          lastMonth = ym;
          html += '<div style="padding:14px 16px 4px;font-size:12px;font-weight:700;color:var(--text-muted);' +
            'text-transform:uppercase;letter-spacing:.05em;">' + U.esc(monthLabel(ym)) + '</div>';
        }
        html += '<div class="list-row"><span class="leading" style="color:var(--yellow);">' +
          sizedIcon(App.icons.trophy, 20) + '</span>' +
          '<div class="body"><span class="title">' + U.esc(exName(p.exerciseId)) + '</span>' +
          '<span class="sub">' + U.esc(PR_KIND_LABEL[p.kind] || p.kind) + ' · ' + U.esc(U.fmtDate(p.date)) + '</span></div>' +
          '<span class="trailing">' + U.esc(fmtPrValue(p)) + '</span></div>';
      }
      html += '</div>';
      if (prShown.length > capped.length) {
        html += '<p style="font-size:12px;color:var(--text-muted);margin-top:8px;">+ ' +
          (prShown.length - capped.length) + ' earlier PRs</p>';
      }
    }
    html += '</section>';

    container.innerHTML = html;

    /* mounts */
    const e1El = U.$('[data-slot="e1rm-chart"]', container);
    if (e1El) {
      Charts.line(e1El, {
        series: [{ label: 'e1RM (' + unitLbl() + ')', color: Charts.SERIES[0], points: e1rmPts }],
        area: true,
        yFmt: U.fmtNum
      });
    }
    Charts.line(U.$('[data-slot="vol-chart"]', container), {
      series: [{ label: metricLabel, color: Charts.SERIES[0], points: volPts }],
      area: true,
      goalY: goalAvg > 0 ? goalAvg : undefined,
      yFmt: U.fmtNum
    });
    const balEl = U.$('[data-slot="balance-bars"]', container);
    if (balEl) {
      Charts.bars(balEl, {
        data: balanceData,
        horizontal: true,
        yFmt: function (v) { return String(U.round1(v)); }
      });
    }
    MuscleMap.render(U.$('[data-slot="balance-map"]', container), {
      values: heat28,
      onSelect: function (m) { App.navigate('library', { muscle: m }); }
    });
    Charts.donut(U.$('[data-slot="rep-donut"]', container), {
      slices: [
        { label: 'Strength (1–5)', value: rr.strength, color: Charts.SERIES[0] },
        { label: 'Hypertrophy (6–12)', value: rr.hypertrophy, color: Charts.SERIES[1] },
        { label: 'Endurance (13+)', value: rr.endurance, color: Charts.SERIES[2] }
      ]
    });
    Charts.heatCalendar(U.$('[data-slot="heat-cal"]', container), {
      values: calDisp,
      weeks: 26,
      color: Charts.SERIES[0]
    });

    /* events */
    U.on(container, 'click', '[data-seg-key]', function (e, btn) {
      const key = btn.getAttribute('data-seg-key');
      const val = btn.getAttribute('data-seg-val');
      if (aState[key] === val) return;
      aState[key] = val;
      App.rerender();
    });
    U.on(container, 'click', '[data-prkind]', function (e, chip) {
      const v = chip.getAttribute('data-prkind');
      if (aState.prKind === v) return;
      aState.prKind = v;
      App.rerender();
    });
    U.on(container, 'click', '[data-act="pick-ex"]', function () {
      openExercisePicker(logged, freq);
    });
  }

  function openExercisePicker(logged, freq) {
    const box = document.createElement('div');
    box.innerHTML =
      '<div class="searchbar"><span class="search-icon">' + sizedIcon(App.icons.search, 18) + '</span>' +
      '<input class="input" type="search" id="a-ex-search" placeholder="Search logged exercises" autocomplete="off"></div>' +
      '<div class="list" id="a-ex-list" style="margin-top:10px;max-height:55vh;overflow-y:auto;"></div>';

    const listEl = U.$('#a-ex-list', box);
    const input = U.$('#a-ex-search', box);

    function draw(q) {
      const needle = (q || '').trim().toLowerCase();
      const rows = logged.filter(function (id) {
        return !needle || exName(id).toLowerCase().indexOf(needle) !== -1;
      });
      if (!rows.length) {
        listEl.innerHTML = emptyHtml(App.icons.search, 'No matches', 'Only exercises you have logged appear here.');
        return;
      }
      listEl.innerHTML = rows.map(function (id) {
        const on = id === aState.exId;
        return '<button type="button" class="list-row" data-id="' + U.esc(id) + '">' +
          '<div class="body"><span class="title">' + U.esc(exName(id)) + '</span>' +
          '<span class="sub">' + freq[id] + (freq[id] === 1 ? ' session' : ' sessions') + '</span></div>' +
          (on ? '<span class="trailing" style="color:var(--accent);">' + sizedIcon(App.icons.check, 18) + '</span>' : '') +
          '</button>';
      }).join('');
    }
    draw('');

    const sheet = App.sheet({ title: 'Choose exercise', content: box });
    input.addEventListener('input', U.debounce(function () { draw(input.value); }, 120));
    U.on(box, 'click', '.list-row[data-id]', function (e, row) {
      aState.exId = row.getAttribute('data-id');
      sheet.close();
      App.rerender();
    });
  }

  /* ======================================================================
     Body
     ====================================================================== */

  const bState = { range: '8w' };

  App.registerView('body', {
    title: 'Body',
    icon: App.icons.body,
    nav: true,
    order: 50,
    render: renderBody
  });

  function renderBody(container) {
    const u = curUser();
    if (!u) {
      container.innerHTML = emptyHtml(App.icons.body, 'No profile selected',
        'Create a profile to track body metrics.');
      return;
    }
    const today = U.todayStr();
    const units = App.units();

    const weightRows = Store.bodyMetricsFor(u.id, 'weightKg');
    const fatRows = Store.bodyMetricsFor(u.id, 'bodyFatPct');
    const bs = Analytics.bodySeries(weightRows.map(function (m) { return { date: m.date, value: m.value }; }));
    const fatBs = Analytics.bodySeries(fatRows.map(function (m) { return { date: m.date, value: m.value }; }));

    const since = rangeSince(bState.range);
    const wPts = (since ? bs.points.filter(function (p) { return p.date >= since; }) : bs.points)
      .map(function (p) { return { x: p.date, y: U.kgToDisplay(p.value, units) }; });
    const wAvg = (since ? bs.avg.filter(function (p) { return p.date >= since; }) : bs.avg)
      .map(function (p) { return { x: p.date, y: U.kgToDisplay(p.avg, units) }; });

    const latest = bs.points.length ? bs.points[bs.points.length - 1] : null;

    // 30-day change: latest vs the most recent reading at least 30 days older
    let change30 = null;
    if (latest) {
      const cutoff = U.addDays(latest.date, -30);
      for (let i = bs.points.length - 1; i >= 0; i--) {
        if (bs.points[i].date <= cutoff) { change30 = latest.value - bs.points[i].value; break; }
      }
    }
    const trendPts = bs.points
      .filter(function (p) { return p.date >= U.addDays(today, -55); })
      .map(function (p) { return { x: p.date, y: U.kgToDisplay(p.value, units) }; });
    const wSlope = Analytics.trendSlope(trendPts);

    /* health samples */
    const hKinds = ['restingHR', 'steps', 'vo2max', 'sleepHours'];
    const health = {};
    for (const k of hKinds) health[k] = Store.healthFor(u.id, k);
    const hasHealth = hKinds.some(function (k) { return health[k].length > 0; });

    function lastN(rows, n) { return rows.slice(Math.max(0, rows.length - n)); }
    function avgOf(rows) {
      return rows.length ? U.sum(rows, function (r) { return r.value; }) / rows.length : 0;
    }

    let html = '<div class="view-head"><h2>Body</h2>' +
      '<div class="sub">Weight, body fat and Apple Health trends.</div></div>';

    /* quick entry */
    html += cardOpen('Log a measurement');
    html += '<form id="bw-form">' +
      '<div class="field-row" style="flex-wrap:wrap;">' +
      '<div class="field"><label for="bw-weight">Weight (' + U.esc(unitLbl()) + ')</label>' +
      '<input class="input" id="bw-weight" type="number" step="0.1" min="0" inputmode="decimal" placeholder="' +
      (latest ? U.esc(String(U.kgToDisplay(latest.value, units))) : (units === 'lb' ? '180' : '80')) + '"></div>' +
      '<div class="field"><label for="bw-fat">Body fat % <span style="color:var(--text-muted);font-weight:400;">(optional)</span></label>' +
      '<input class="input" id="bw-fat" type="number" step="0.1" min="1" max="70" inputmode="decimal" placeholder="—"></div>' +
      '<div class="field"><label for="bw-date">Date</label>' +
      '<input class="input" id="bw-date" type="date" value="' + today + '" max="' + today + '"></div>' +
      '</div>' +
      '<button type="submit" class="btn primary" id="bw-save">Save</button></form>';
    html += '</section>';

    /* weight chart */
    html += cardOpen('Weight', segmented('b-range', 'range',
      [{ value: '8w', label: '8W' }, { value: '6m', label: '6M' }, { value: 'all', label: 'All' }], bState.range));
    if (!wPts.length) {
      html += emptyHtml(App.icons.body, bs.points.length ? 'No entries in this range' : 'No weight logged yet',
        bs.points.length ? 'Try a longer range.' : 'Log your weight above to start the trend line.');
    } else {
      html += '<div data-slot="weight-chart"></div>';
      html += '<div class="stat-grid" style="margin-top:14px;">';
      html += '<div class="stat"><span class="label">Current</span><span class="value">' +
        U.esc(String(U.kgToDisplay(latest.value, units))) + '<span class="unit">' + U.esc(unitLbl()) + '</span></span>' +
        '<span class="delta" style="color:var(--text-2);">' + U.esc(U.relDate(latest.date)) + '</span></div>';
      html += '<div class="stat"><span class="label">30-day change</span><span class="value">' +
        (change30 === null ? '—' :
          U.esc((change30 > 0 ? '+' : '') + String(U.round1(U.kgToDisplay(Math.abs(change30), units) * (change30 < 0 ? -1 : 1))))) +
        (change30 === null ? '' : '<span class="unit">' + U.esc(unitLbl()) + '</span>') + '</span>' +
        '<span class="delta" style="color:var(--text-2);">' +
        (change30 === null ? 'needs 30 days of data' : 'vs a month ago') + '</span></div>';
      html += '<div class="stat"><span class="label">Trend</span><span class="value" style="font-size:22px;">' +
        (trendPts.length >= 2 ? U.esc(fmtSlope(wSlope, unitLbl())) : '—') + '</span>' +
        '<span class="delta" style="color:var(--text-2);">last 8 weeks</span></div>';
      html += '</div>';
    }
    html += '</section>';

    /* body fat chart */
    if (fatBs.points.length) {
      const fPts = (since ? fatBs.points.filter(function (p) { return p.date >= since; }) : fatBs.points)
        .map(function (p) { return { x: p.date, y: p.value }; });
      html += cardOpen('Body fat');
      if (!fPts.length) {
        html += emptyHtml(App.icons.body, 'No entries in this range', 'Try a longer range.');
      } else {
        html += '<div data-slot="fat-chart"></div>';
        const fLatest = fatBs.points[fatBs.points.length - 1];
        html += miniStatRow([
          miniStat('Current', U.round1(fLatest.value) + '%', U.relDate(fLatest.date))
        ]);
      }
      html += '</section>';
    }

    /* Apple Health */
    if (!hasHealth) {
      html += '<section class="card">' + emptyHtml(App.icons.apple, 'No Apple Health data',
        'Import your Apple Health export to see resting heart rate, steps, VO2 max and sleep here.',
        '<button type="button" class="btn primary" data-act="go-settings">Connect Apple Health in Settings</button>') +
        '</section>';
    } else {
      const hr = health.restingHR;
      const steps = health.steps;
      const vo2 = health.vo2max;
      const sleep = health.sleepHours;

      html += cardOpen('From Apple Health');
      html += '<div class="stat-grid">';
      html += '<div class="stat"><span class="label">Resting HR</span><span class="value">' +
        (hr.length ? Math.round(hr[hr.length - 1].value) + '<span class="unit">bpm</span>' : '—') + '</span>' +
        (hr.length ? '<span class="delta" style="color:var(--text-2);">' + U.esc(U.relDate(hr[hr.length - 1].date)) + '</span>' : '') + '</div>';
      html += '<div class="stat"><span class="label">Steps</span><span class="value">' +
        (steps.length ? U.esc(U.fmtNum(avgOf(lastN(steps, 7)))) : '—') + '</span>' +
        '<span class="delta" style="color:var(--text-2);">7-day avg</span></div>';
      html += '<div class="stat"><span class="label">VO2 max</span><span class="value">' +
        (vo2.length ? U.esc(String(U.round1(vo2[vo2.length - 1].value))) : '—') + '</span>' +
        (vo2.length ? '<span class="delta" style="color:var(--text-2);">' + U.esc(U.relDate(vo2[vo2.length - 1].date)) + '</span>' : '') + '</div>';
      html += '<div class="stat"><span class="label">Sleep</span><span class="value">' +
        (sleep.length ? U.esc(String(U.round1(avgOf(lastN(sleep, 7))))) + '<span class="unit">h</span>' : '—') + '</span>' +
        '<span class="delta" style="color:var(--text-2);">7-day avg</span></div>';
      html += '</div>';

      const hrSince = U.addDays(today, -55);
      const hrPts = hr.filter(function (r) { return r.date >= hrSince; })
        .map(function (r) { return { x: r.date, y: r.value }; });
      const stepWeeks = {};
      for (const r of steps) {
        const wk = U.weekStart(r.date);
        (stepWeeks[wk] || (stepWeeks[wk] = [])).push(r.value);
      }
      const wkSince = U.addDays(U.weekStart(today), -49);
      const stepPts = Object.keys(stepWeeks).sort().filter(function (wk) { return wk >= wkSince; })
        .map(function (wk) {
          return { x: wk, y: Math.round(U.sum(stepWeeks[wk]) / stepWeeks[wk].length) };
        });

      html += '<div class="grid-2" style="margin-top:14px;">';
      html += '<div><div style="font-size:13px;font-weight:600;color:var(--text-2);margin-bottom:6px;">Resting heart rate — 8 weeks</div>' +
        (hrPts.length ? '<div data-slot="hr-chart"></div>' :
          '<p style="font-size:13px;color:var(--text-muted);">No recent readings.</p>') + '</div>';
      html += '<div><div style="font-size:13px;font-weight:600;color:var(--text-2);margin-bottom:6px;">Steps — weekly average</div>' +
        (stepPts.length ? '<div data-slot="steps-chart"></div>' :
          '<p style="font-size:13px;color:var(--text-muted);">No recent readings.</p>') + '</div>';
      html += '</div>';
      html += '</section>';
    }

    container.innerHTML = html;

    /* mounts */
    const wcEl = U.$('[data-slot="weight-chart"]', container);
    if (wcEl) {
      const series = [{ label: 'Weight', color: Charts.SERIES[0], points: wPts }];
      if (wAvg.length >= 2) series.push({ label: '7-day avg', color: Charts.SERIES[1], points: wAvg });
      Charts.line(wcEl, { series: series, area: false, yFmt: function (v) { return String(U.round1(v)); } });
    }
    const fcEl = U.$('[data-slot="fat-chart"]', container);
    if (fcEl) {
      const fPts = (since ? fatBs.points.filter(function (p) { return p.date >= since; }) : fatBs.points)
        .map(function (p) { return { x: p.date, y: p.value }; });
      Charts.line(fcEl, {
        series: [{ label: 'Body fat', color: Charts.SERIES[0], points: fPts }],
        area: false,
        yFmt: function (v) { return U.round1(v) + '%'; }
      });
    }
    const hrEl = U.$('[data-slot="hr-chart"]', container);
    if (hrEl) {
      const hrSince = U.addDays(today, -55);
      Charts.line(hrEl, {
        series: [{
          label: 'Resting HR',
          color: Charts.SERIES[4],
          points: health.restingHR.filter(function (r) { return r.date >= hrSince; })
            .map(function (r) { return { x: r.date, y: r.value }; })
        }],
        area: false,
        yFmt: function (v) { return Math.round(v) + ''; }
      });
    }
    const stEl = U.$('[data-slot="steps-chart"]', container);
    if (stEl) {
      const stepWeeks = {};
      for (const r of health.steps) {
        const wk = U.weekStart(r.date);
        (stepWeeks[wk] || (stepWeeks[wk] = [])).push(r.value);
      }
      const wkSince = U.addDays(U.weekStart(today), -49);
      Charts.line(stEl, {
        series: [{
          label: 'Steps',
          color: Charts.SERIES[1],
          points: Object.keys(stepWeeks).sort().filter(function (wk) { return wk >= wkSince; })
            .map(function (wk) {
              return { x: wk, y: Math.round(U.sum(stepWeeks[wk]) / stepWeeks[wk].length) };
            })
        }],
        area: true,
        yFmt: U.fmtNum
      });
    }

    /* events */
    U.on(container, 'submit', '#bw-form', function (e) {
      e.preventDefault();
      const wRaw = U.$('#bw-weight', container).value;
      const fRaw = U.$('#bw-fat', container).value;
      let date = U.$('#bw-date', container).value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) date = today;
      const wVal = parseFloat(wRaw);
      const fVal = parseFloat(fRaw);
      const hasW = isFinite(wVal) && wVal > 0;
      const hasF = isFinite(fVal) && fVal > 0 && fVal < 100;
      if (!hasW && !hasF) {
        App.toast('Enter a weight or body fat %', 'err');
        return;
      }
      if (hasW) {
        Store.addBodyMetric({
          userId: u.id, date: date, kind: 'weightKg',
          value: U.displayToKg(wVal, units), source: 'manual'
        });
      }
      if (hasF) {
        Store.addBodyMetric({
          userId: u.id, date: date, kind: 'bodyFatPct',
          value: U.round1(fVal), source: 'manual'
        });
      }
      App.toast('Measurement saved', 'ok');
    });
    U.on(container, 'click', '[data-seg-key]', function (e, btn) {
      const val = btn.getAttribute('data-seg-val');
      if (bState.range === val) return;
      bState.range = val;
      App.rerender();
    });
    U.on(container, 'click', '[data-act="go-settings"]', function () { App.navigate('settings'); });
  }

  /* ======================================================================
     Leaderboard ("Family")
     ====================================================================== */

  const lState = { offset: 0 };

  App.registerView('leaderboard', {
    title: 'Family',
    icon: App.icons.leaderboard,
    nav: true,
    order: 60,
    render: renderLeaderboard
  });

  function renderLeaderboard(container) {
    const viewer = curUser();
    const users = (Store.state && Store.state.users) || [];
    const allW = (Store.state && Store.state.workouts) || [];
    const today = U.todayStr();

    if (!users.length) {
      container.innerHTML = '<div class="view-head"><h2>Family</h2></div>' +
        '<section class="card">' + emptyHtml(App.icons.users, 'No lifters yet',
          'Create profiles for your family and compete on weekly volume.',
          '<button type="button" class="btn primary" data-act="go-profiles">Open Profiles</button>') + '</section>';
      U.on(container, 'click', '[data-act="go-profiles"]', function () { App.navigate('profiles'); });
      return;
    }

    lState.offset = U.clamp(lState.offset, 0, 260);
    const ws = U.addDays(U.weekStart(today), -7 * lState.offset);
    const we = U.addDays(ws, 6);
    const weekLabel = lState.offset === 0 ? 'This week' : U.fmtDate(ws) + ' – ' + U.fmtDate(we);

    const rows = Analytics.leaderboard(users, allW, ws);

    /* all-time aggregates */
    const totalKg = U.sum(allW, Analytics.workoutVolume);
    const totalLb = totalKg * U.LB_PER_KG;
    const perUser = users.map(function (u2) {
      const mine = allW.filter(function (x) { return x.userId === u2.id; });
      return {
        user: u2,
        count: mine.length,
        bestWeeks: Analytics.streaks(mine).bestWeeks,
        vol12: U.sum(Analytics.weeklySeries(mine, 12), function (r) { return r.volumeKg; }),
        workouts: mine
      };
    });
    let streakHolder = null;
    let workoutHolder = null;
    for (const p of perUser) {
      if (!streakHolder || p.bestWeeks > streakHolder.bestWeeks) streakHolder = p;
      if (!workoutHolder || p.count > workoutHolder.count) workoutHolder = p;
    }

    /* fun equivalents (physical weights — unit independent, shown in viewer units) */
    const EQUIV = [
      { one: 'blue whale', many: 'blue whales', emoji: '🐋', lb: 140000 },
      { one: 'school bus', many: 'school buses', emoji: '🚌', lb: 25000 },
      { one: 'elephant', many: 'elephants', emoji: '🐘', lb: 13000 }
    ];
    let funLine = '';
    if (totalLb > 0) {
      let pick = null;
      for (const it of EQUIV) {
        if (totalLb / it.lb >= 1) { pick = it; break; }
      }
      if (!pick) pick = EQUIV[EQUIV.length - 1];
      const cnt = totalLb / pick.lb;
      const shown = cnt >= 1 ? U.fmtNum(Math.floor(cnt)) : String(U.round1(cnt));
      const noun = (cnt >= 1 && Math.floor(cnt) === 1) ? pick.one : pick.many;
      funLine = 'that’s ' + shown + ' ' + noun + ' ' + pick.emoji;
    }

    let html = '<div class="view-head"><h2>Family</h2>' +
      '<div class="sub">Who’s lifting the most this week?</div></div>';

    /* weekly leaderboard */
    html += cardOpen(weekLabel,
      '<span class="row" style="gap:4px;">' +
      '<button type="button" class="btn icon ghost small" data-act="wk-prev" aria-label="Previous week" id="lb-prev">' +
      '<span style="display:inline-flex;transform:rotate(180deg);">' + sizedIcon(App.icons.chevron, 18) + '</span></button>' +
      '<button type="button" class="btn icon ghost small" data-act="wk-next" aria-label="Next week" id="lb-next"' +
      (lState.offset === 0 ? ' disabled style="opacity:.35;"' : '') + '>' +
      sizedIcon(App.icons.chevron, 18) + '</button></span>');

    const anyActivity = rows.some(function (r) { return r.workouts > 0; });
    if (!anyActivity) {
      html += emptyHtml(App.icons.trophy, 'A quiet week', 'No workouts were logged this week. The podium is wide open.');
    } else {
      html += '<div class="list">' + rows.map(function (r, i) {
        const isViewer = viewer && r.user.id === viewer.id;
        const rank = i === 0
          ? '<span class="leading" style="background:rgba(255,214,10,.14);color:var(--yellow);">' +
            sizedIcon(App.icons.trophy, 20) + '</span>'
          : '<span class="leading" style="font-size:14px;font-weight:700;color:var(--text-muted);">' + (i + 1) + '</span>';
        return '<div class="list-row"' + (isViewer ? ' style="background:rgba(48,209,88,.07);"' : '') + '>' +
          rank +
          '<span class="avatar sm" style="--c:' + U.esc(r.user.color || '#2ca350') + ';">' + U.esc(r.user.emoji || '🏋️') + '</span>' +
          '<div class="body"><span class="title">' + U.esc(r.user.name) +
          (isViewer ? ' <span class="badge green">You</span>' : '') + '</span>' +
          '<span class="sub">' + r.workouts + (r.workouts === 1 ? ' workout' : ' workouts') +
          ' · ' + r.sets + ' sets</span></div>' +
          '<span class="trailing" style="gap:8px;">' +
          (r.prCount > 0 ? '<span class="badge orange">' + r.prCount + ' PR' + (r.prCount === 1 ? '' : 's') + '</span>' : '') +
          '<span style="font-weight:700;color:var(--text);">' + U.esc(fmtVol(r.volumeKg)) + '</span></span>' +
          '</div>';
      }).join('') + '</div>';
    }
    html += '</section>';

    if (users.length === 1) {
      html += '<section class="card">' + emptyHtml(App.icons.users, 'It’s lonely at the top',
        'Add your uncle, your sister, your gym buddy — anyone. Family leaderboards are better with rivals.',
        '<button type="button" class="btn primary" data-act="go-profiles">Add your uncle in Profiles</button>') +
        '</section>';
    }

    /* all-time */
    html += cardOpen('All time');
    if (totalKg <= 0) {
      html += emptyHtml(App.icons.log, 'Nothing lifted yet', 'Every rep you log adds to the family total.');
    } else {
      html += '<div style="font-size:28px;font-weight:800;letter-spacing:-.02em;line-height:1.2;">' +
        'Together you’ve lifted ' + U.esc(U.fmtNum(dispVol(totalKg))) + ' ' + U.esc(unitLbl()) + '</div>';
      if (funLine) {
        html += '<div style="font-size:15px;color:var(--text-2);margin-top:4px;">— ' + U.esc(funLine) + '</div>';
      }
      html += '<div style="display:flex;flex-wrap:wrap;gap:8px 24px;margin-top:14px;">' +
        EQUIV.map(function (it) {
          const cnt = totalLb / it.lb;
          const itemDisp = U.fmtNum(U.kgToDisplay(it.lb / U.LB_PER_KG, App.units())) + ' ' + unitLbl();
          return '<span style="font-size:13px;color:var(--text-2);white-space:nowrap;">' + it.emoji + ' ' +
            U.esc(it.one.charAt(0).toUpperCase() + it.one.slice(1) + ' (' + itemDisp + ')') +
            ' <b class="tabular">× ' + U.esc(cnt >= 10 ? U.fmtNum(Math.floor(cnt)) : String(U.round1(cnt))) + '</b></span>';
        }).join('') + '</div>';
      html += '<div class="divider"></div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:14px 28px;">' +
        miniStat('Longest streak',
          streakHolder && streakHolder.bestWeeks > 0
            ? streakHolder.user.name + ' · ' + streakHolder.bestWeeks + ' wk' : '—') +
        miniStat('Most workouts',
          workoutHolder && workoutHolder.count > 0
            ? workoutHolder.user.name + ' · ' + workoutHolder.count : '—') +
        '</div>';
    }
    html += '</section>';

    /* per-user 12-week comparison */
    html += cardOpen('Weekly volume — last 12 weeks');
    const byVol = perUser.slice().sort(function (a, b) { return b.vol12 - a.vol12; });
    const shown = byVol.slice(0, 3);
    const usedColors = [];
    const series = shown.map(function (p) {
      let c = p.user.color && Charts.SERIES.indexOf(p.user.color) !== -1 ? p.user.color : null;
      if (!c || usedColors.indexOf(c) !== -1) {
        c = Charts.SERIES.filter(function (x) { return usedColors.indexOf(x) === -1; })[0] || Charts.SERIES[0];
      }
      usedColors.push(c);
      return {
        label: p.user.name,
        color: c,
        points: Analytics.weeklySeries(p.workouts, 12).map(function (r) {
          return { x: r.weekStart, y: Math.round(dispVol(r.volumeKg)) };
        })
      };
    });
    html += '<div data-slot="family-chart"></div>';
    if (byVol.length > 3) {
      html += '<p style="font-size:12px;color:var(--text-muted);margin-top:8px;">Showing the top 3 of ' +
        byVol.length + ' lifters by 12-week volume.</p>';
    }
    html += '</section>';

    container.innerHTML = html;

    Charts.line(U.$('[data-slot="family-chart"]', container), {
      series: series,
      area: false,
      yFmt: U.fmtNum
    });

    /* events */
    U.on(container, 'click', '[data-act="wk-prev"]', function () {
      lState.offset = Math.min(260, lState.offset + 1);
      App.rerender();
    });
    U.on(container, 'click', '[data-act="wk-next"]', function () {
      if (lState.offset === 0) return;
      lState.offset -= 1;
      App.rerender();
    });
    U.on(container, 'click', '[data-act="go-profiles"]', function () { App.navigate('profiles'); });
  }
})();
