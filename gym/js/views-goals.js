/* IronLog — views-goals.js (P7.1)
   The Goals system as a real daily instrument, two faces of one machine:
   a HABIT TRACKER (week grids, 28-day heatmap, streaks, floors, honest
   yesterday-only backfill, the capacity conversation at the door) and a
   GOAL TRACKER (trajectory chart, honest Reach progress, editing with a
   versioned definition, the wins record).

   Still general and self-contained: nothing here reads the workout log or
   the Standards table. Every judgment comes from js/goals.js — pure
   arithmetic over what the user typed, counted, or tested.

   Colour discipline: nothing in this file holds a colour. Every painted
   thing is a class; the chart lines included (SVG styled from styles.css),
   per the P5 rule that lets themes work at all.

   Exposes window.GoalsUI only for the dashboard Today card hook. */
(function () {
  'use strict';

  const GoalsUI = {};

  function G() { return window.Goals; }
  function curUser() { return Store.currentUser(); }
  function today() { return U.todayStr(); }

  const icon = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/></svg>';

  /* ---------- data access (always per current user) ---------- */

  function myGoals(status) {
    const u = curUser();
    if (!u) return [];
    return Store.state.goals.filter(function (g) {
      return g.userId === u.id && (g.status || 'active') === (status || 'active');
    });
  }
  function myPractices() {
    const u = curUser();
    if (!u) return [];
    return Store.state.practices.filter(function (p) { return p.userId === u.id; });
  }
  function myTicks() {
    const u = curUser();
    if (!u) return [];
    return Store.state.ticks.filter(function (t) { return t.userId === u.id; });
  }
  function measuresFor(goalId) {
    const u = curUser();
    if (!u) return [];
    return Store.state.measures.filter(function (m) {
      return m.userId === u.id && m.goalId === goalId;
    });
  }
  function practicesFor(goalId) {
    return myPractices().filter(function (p) { return (p.goalId || '') === goalId; });
  }
  function goalById(id) {
    return Store.state.goals.find(function (g) { return g.id === id; }) || null;
  }
  function practiceById(id) {
    return Store.state.practices.find(function (p) { return p.id === id; }) || null;
  }

  function setting(key) {
    const u = curUser();
    return u && u.settings ? u.settings[key] : undefined;
  }
  function setSetting(key, value) {
    const u = curUser();
    if (!u) return;
    const s = Object.assign({}, u.settings);
    s[key] = value;
    Store.updateUser(u.id, { settings: s });
  }

  /* ---------- tiny render helpers ---------- */

  function fmt(n, dp) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    const p = Math.pow(10, dp === undefined ? 1 : dp);
    return String(Math.round(n * p) / p);
  }
  function perWeek(rate) { return rate === null ? null : rate * 7; }

  function verdictChip(v) {
    if (!v) return '';
    if (v.state === 'measuring') {
      return '<span class="chip g-chip blue">Measuring · ' + v.points + ' of ' + G().MIN_POINTS + ' points</span>';
    }
    if (v.state === 'stale') return '<span class="chip g-chip warn">Needs a number</span>';
    if (v.state === 'ontrack') return '<span class="chip g-chip go">On track</span>';
    if (v.daysBehind !== null) {
      return '<span class="chip g-chip warn">' + v.daysBehind + ' day' + (v.daysBehind === 1 ? '' : 's') + ' behind</span>';
    }
    return '<span class="chip g-chip stop">Moving the wrong way</span>';
  }

  function ticked(practiceId, date) {
    const u = curUser();
    return !!u && Store.state.ticks.some(function (t) {
      return t.practiceId === practiceId && t.date === date && t.userId === u.id;
    });
  }

  /* The tracker's week: seven cells, oldest left. Today and yesterday are
     LIVE — tap to tick or untick right in the row. Older cells are the
     record: rendered, never editable. Weekly cadences don't paint misses
     per-day (no single day was "the" scheduled one). */
  function weekStrip(practice) {
    const t = today();
    const daily = !practice.cadence || practice.cadence.type !== 'weekly';
    let h = '<span class="g-week">';
    for (let i = 6; i >= 0; i--) {
      const d = U.addDays(t, -i);
      const hit = ticked(practice.id, d);
      const live = G().canBackfill(d, t);
      const cls = 'g-cell' + (hit ? ' hit' : (daily && !live ? ' miss' : '')) +
        (d === t ? ' today' : '') + (live ? ' live' : '');
      h += live
        ? '<button type="button" class="' + cls + '" data-cell="' + U.esc(practice.id) + '" ' +
          'data-date="' + d + '" aria-label="' + (hit ? 'Untick' : 'Tick') + ' ' + d + '"></button>'
        : '<i class="' + cls + '"></i>';
    }
    return h + '</span>';
  }

  /* 28 days, four weeks, oldest row first — the habit tracker's memory.
     Same backfill law as the strip. */
  function heatmap(practice) {
    const t = today();
    const daily = !practice.cadence || practice.cadence.type !== 'weekly';
    let h = '<div class="g-heat">';
    for (let row = 3; row >= 0; row--) {
      h += '<div class="g-heat-row">';
      for (let col = 6; col >= 0; col--) {
        const d = U.addDays(t, -(row * 7 + col));
        const hit = ticked(practice.id, d);
        const live = G().canBackfill(d, t);
        const cls = 'g-cell' + (hit ? ' hit' : (daily && !live ? ' miss' : '')) +
          (d === t ? ' today' : '') + (live ? ' live' : '');
        h += live
          ? '<button type="button" class="' + cls + '" data-cell="' + U.esc(practice.id) + '" ' +
            'data-date="' + d + '" aria-label="' + (hit ? 'Untick' : 'Tick') + ' ' + d + '"></button>'
          : '<i class="' + cls + '" title="' + d + '"></i>';
      }
      h += '</div>';
    }
    h += '</div><p class="small-text muted" style="margin:8px 0 0">Today and yesterday are tappable. ' +
      'Anything older is the record — it doesn\'t bend.</p>';
    return h;
  }

  /* ======================================================================
     Screens. One module-level mode; fresh entry from another view resets it.
     ====================================================================== */

  let mode = { screen: 'goals', id: null, prefillGoalId: null };
  let refusal = null;
  let capAcked = false;
  let formDraft = null;   // survives the capacity-warning rerender — a warning
                          // that eats what you typed is a punishment, not a warning

  if (typeof window.addEventListener === 'function') {
    window.addEventListener('hashchange', function (e) {
      const to = String((e && e.newURL) || '').split('#')[1] || '';
      const from = String((e && e.oldURL) || '').split('#')[1] || '';
      if (to.indexOf('/goals') === 0 && from.indexOf('/goals') !== 0) {
        mode = { screen: 'goals', id: null, prefillGoalId: null };
        refusal = null;
        capAcked = false;
        formDraft = null;
      }
    });
  }

  function render(container) {
    const u = curUser();
    if (!u) {
      container.innerHTML = '<div class="empty">' + icon + '<h3>No profile selected</h3></div>';
      return;
    }
    if (!G()) { container.innerHTML = '<div class="empty"><h3>Goals engine missing</h3></div>'; return; }
    let html;
    if (mode.screen === 'new') html = newGoalHTML();
    else if (mode.screen === 'detail') html = detailHTML();
    else if (mode.screen === 'goal-edit') html = goalEditHTML();
    else if (mode.screen === 'review') html = reviewHTML();
    else if (mode.screen === 'habits') html = habitsHTML();
    else if (mode.screen === 'habit-form') html = habitFormHTML();
    else if (mode.screen === 'habit-detail') html = habitDetailHTML();
    else if (mode.screen === 'wins') html = winsHTML();
    else html = goalsHTML();
    container.innerHTML = html;
    wire(container);
  }

  function tabsHTML(active) {
    function seg(id, label) {
      return '<button type="button" class="seg' + (active === id ? ' active' : '') + '" ' +
        'data-tab="' + id + '">' + label + '</button>';
    }
    return '<div class="segmented g-tabs">' +
      seg('goals', 'Goals') + seg('habits', 'Habits') + seg('wins', 'Wins') + '</div>';
  }

  function reviewBannerHTML() {
    const t = today();
    const anything = myGoals('active').length || myPractices().length;
    if (!anything || !G().reviewDue(setting('goalsReviewAt'), t)) return '';
    return '<section class="card g-review-due" data-act="review">' +
      '<div class="card-title"><span>Weekly review due</span>' +
      '<button type="button" class="btn primary small">Start · 10 min</button></div>' +
      '<p class="text-2 small-text" style="margin:0">The plan meets the evidence. Every card ends in a decision.</p>' +
      '</section>';
  }

  /* ---------- tab 1: goals ---------- */

  function goalsHTML() {
    const active = myGoals('active');
    const laterN = myGoals('later').length;
    const t = today();

    let h = '<div class="view-head"><h2>Goals</h2>' +
      '<span class="chip g-chip">' + active.length + ' of 3 active</span></div>' +
      tabsHTML('goals') + reviewBannerHTML();

    if (!active.length) {
      h += '<div class="empty">' + icon + '<h3>Name the target. Build the path.</h3>' +
        '<p>Any goal — money, a language, a certification. The app helps make it ' +
        'measurable, then tells you every week whether the plan is working.</p></div>';
    }

    active.forEach(function (g) {
      const ms = measuresFor(g.id);
      const v = G().verdict(g, ms, t);
      const prog = G().progress(g, ms);
      const prs = practicesFor(g.id);
      h += '<section class="card interactive" data-act="open" data-id="' + U.esc(g.id) + '">' +
        '<div class="card-title"><span>' + U.esc(g.name || 'Goal') + '</span>' + verdictChip(v) + '</div>' +
        (g.why ? '<p class="small-text text-2" style="margin:2px 0 10px">' + U.esc(g.why) + '</p>' : '');
      if (prog) {
        h += '<div class="g-bar"><i style="width:' + Math.round(prog.frac * 100) + '%"></i></div>' +
          '<div class="g-row" style="margin-top:6px"><span class="small-text text-2">' +
          '<span class="num">' + fmt(prog.latest) + '</span> → <span class="num">' +
          fmt(g.target && g.target.value) + '</span>' +
          (g.measure && g.measure.unit ? ' ' + U.esc(g.measure.unit) : '') + '</span>' +
          '<span class="small-text muted num">' + U.esc(g.target && g.target.date || '') + '</span></div>';
      }
      if (v.requiredRate !== null) {
        h += '<div class="g-row" style="margin-top:6px"><span class="small-text muted">needs ' +
          '<span class="num">' + fmt(perWeek(v.requiredRate)) + '</span>/wk · getting ' +
          '<span class="num">' + fmt(perWeek(v.observedRate)) + '</span>/wk</span></div>';
      }
      if (prs.length) {
        h += '<div class="g-row" style="margin-top:10px"><span class="micro-label">' +
          U.esc(prs[0].action || 'practice') + '</span>' + weekStrip(prs[0]) + '</div>';
      }
      h += '</section>';
    });

    if (laterN) {
      h += '<p class="small-text muted" style="margin:2px 0 10px">Later · ' + laterN + ' waiting</p>';
    }
    h += '<button type="button" class="btn primary" style="width:100%" data-act="new">+ New goal</button>';
    return h;
  }

  /* ---------- tab 2: habits ---------- */

  function habitsHTML() {
    const t = today();
    const prs = myPractices();
    const ticks = myTicks();

    let h = '<div class="view-head"><h2>Habits</h2>' +
      '<span class="small-text muted num">' + prs.length + '</span></div>' +
      tabsHTML('habits') + reviewBannerHTML();

    if (!prs.length) {
      h += '<div class="empty">' + icon + '<h3>The daily machinery</h3>' +
        '<p>Cue → action, a cadence, and an honest record. Habits can serve a goal ' +
        'or stand alone with a weekly floor.</p></div>';
    }

    const standing = prs.filter(function (p) { return !p.goalId; });
    const serving = prs.filter(function (p) { return !!p.goalId; });

    function habitRow(p, i) {
      const g = p.goalId ? goalById(p.goalId) : null;
      const streak = G().streak(p, ticks, t);
      const a28 = G().adherence(p, ticks, t, 28);
      const f = p.floor ? G().floorStatus(p, ticks, t) : null;
      return '<div class="g-habit' + (i ? ' bordered' : '') + '">' +
        '<div class="g-row">' +
        '<span style="flex:1;min-width:0"><span class="small-text" style="font-weight:600">' +
        (p.cue ? 'After ' + U.esc(p.cue) + ' → ' : '') + U.esc(p.action || 'Practice') + '</span><br>' +
        '<span class="micro-label">' + (g ? U.esc(g.name) : 'standing') + ' · ' + cadenceLabel(p) +
        (f ? ' · floor ' + f.floor : '') + '</span></span>' +
        '<button type="button" class="btn ghost small" data-act="habit-open" data-id="' + U.esc(p.id) + '">Open</button>' +
        '</div>' +
        '<div class="g-row" style="margin-top:8px">' + weekStrip(p) +
        '<span class="micro-label num">' +
        (streak ? 'streak ' + streak + (p.cadence && p.cadence.type === 'weekly' ? ' wk' : '') + ' · ' : '') +
        (a28.rate === null ? '' : Math.round(a28.rate * 100) + '% / 28d') + '</span></div>' +
        '</div>';
    }

    if (standing.length) {
      h += '<div class="micro-label" style="margin:2px 0 6px">Standing · no finish line</div>' +
        '<section class="card">';
      standing.forEach(function (p, i) { h += habitRow(p, i); });
      h += '</section>';
    }
    if (serving.length) {
      h += '<div class="micro-label" style="margin:10px 0 6px">Serving a goal</div>' +
        '<section class="card">';
      serving.forEach(function (p, i) { h += habitRow(p, i); });
      h += '</section>';
    }

    h += '<button type="button" class="btn primary" style="width:100%;margin-top:6px" data-act="habit-new">+ New habit</button>';
    return h;
  }

  /* ---------- habit form (new + edit, standing + serving) ---------- */

  function habitFormHTML() {
    const editing = mode.id ? practiceById(mode.id) : null;
    const goals = myGoals('active');
    const src = formDraft || editing || {};
    const cad = src.cadence && src.cadence.type === 'weekly'
      ? 'w' + (src.cadence.times || 1) : 'daily';
    const linked = formDraft ? (formDraft.goalId || '') :
      editing ? (editing.goalId || '') : (mode.prefillGoalId || '');

    let goalOpts = '<option value="">Standing — no goal, a weekly floor</option>';
    goals.forEach(function (g) {
      goalOpts += '<option value="' + U.esc(g.id) + '"' + (linked === g.id ? ' selected' : '') + '>' +
        U.esc(g.name) + '</option>';
    });

    const cap = G().capacity(myPractices(), myTicks(), today());
    const strained = !editing && cap.daily >= 5 && cap.adh28 !== null && cap.adh28 < 0.8;

    return '<div class="view-head"><h2>' + (editing ? 'Edit habit' : 'New habit') + '</h2>' +
      '<button type="button" class="btn ghost small" data-act="habits-back">Cancel</button></div>' +

      '<section class="card">' +
      '<div class="g-row" style="gap:8px">' +
      '<div class="field" style="flex:1"><label for="h-cue">After… <span class="muted">(the cue)</span></label>' +
      '<input class="input" id="h-cue" placeholder="waking · lunch · dinner" autocomplete="off" value="' +
      U.esc(src.cue || '') + '"></div>' +
      '<div class="field" style="flex:1.4"><label for="h-action">…I will</label>' +
      '<input class="input" id="h-action" placeholder="read 20 pages" autocomplete="off" value="' +
      U.esc(src.action || '') + '"></div></div>' +
      '<div class="g-row" style="gap:8px;margin-top:10px">' +
      '<div class="field" style="flex:1"><label for="h-cad">How often</label>' +
      '<select class="select" id="h-cad">' +
      '<option value="daily"' + (cad === 'daily' ? ' selected' : '') + '>Daily</option>' +
      '<option value="w1"' + (cad === 'w1' ? ' selected' : '') + '>1×/week</option>' +
      '<option value="w2"' + (cad === 'w2' ? ' selected' : '') + '>2×/week</option>' +
      '<option value="w3"' + (cad === 'w3' ? ' selected' : '') + '>3×/week</option>' +
      '<option value="w5"' + (cad === 'w5' ? ' selected' : '') + '>5×/week</option></select></div>' +
      '<div class="field" style="flex:1"><label for="h-floor">Floor <span class="muted">(days/wk, standing)</span></label>' +
      '<input class="input num" id="h-floor" type="number" min="1" max="7" inputmode="numeric" value="' +
      U.esc(src.floor ? String(src.floor) : '') + '" placeholder="5"></div></div>' +
      '<div class="field" style="margin-top:10px"><label for="h-goal">Serves</label>' +
      '<select class="select" id="h-goal">' + goalOpts + '</select></div>' +
      '</section>' +

      (strained && !capAcked
        ? '<section class="card g-capacity"><div class="card-title"><span>Capacity check</span>' +
          '<span class="chip g-chip warn">' + cap.daily + ' daily already</span></div>' +
          '<p class="small-text" style="margin:0">Your 28-day adherence on the current daily set is <b class="num">' +
          Math.round(cap.adh28 * 100) + '%</b>. A plan you can\'t carry isn\'t a plan — park something, ' +
          'or add this knowingly.</p></section>'
        : '') +

      '<button type="button" class="btn primary" style="width:100%;min-height:48px" data-act="habit-save">' +
      (strained && !capAcked ? 'Add anyway' : 'Save habit') + '</button>' +
      (editing
        ? '<button type="button" class="btn ghost" style="width:100%;margin-top:8px" data-act="habit-delete">' +
          'Delete this habit</button>'
        : '');
  }

  function saveHabit(container) {
    const val = function (id) { return (U.$(id, container).value || '').trim(); };
    const action = val('#h-action');
    if (!action) { App.toast('The habit needs an action', 'err'); return; }

    const cap = G().capacity(myPractices(), myTicks(), today());
    const strained = !mode.id && cap.daily >= 5 && cap.adh28 !== null && cap.adh28 < 0.8;
    const cadV = val('#h-cad') || 'daily';
    if (strained && !capAcked && cadV === 'daily') {
      capAcked = true;              // the second tap is the informed one
      const floorD = parseInt(val('#h-floor'), 10);
      formDraft = { cue: val('#h-cue'), action: action,
        cadence: { type: 'daily' }, goalId: val('#h-goal'),
        floor: isFinite(floorD) ? floorD : null };
      App.rerender();
      return;
    }

    const cadence = cadV === 'daily' ? { type: 'daily' } : { type: 'weekly', times: Number(cadV.slice(1)) };
    const goalId = val('#h-goal');
    const floorN = parseInt(val('#h-floor'), 10);
    const patch = { cue: val('#h-cue'), action: action, cadence: cadence,
      goalId: goalId, floor: goalId ? null : (isFinite(floorN) ? Math.min(7, Math.max(1, floorN)) : null) };

    if (mode.id) {
      Store.updatePractice(mode.id, patch);
      App.toast('Habit updated', 'ok');
    } else {
      Store.addPractice(patch);
      App.toast(goalId ? 'Habit added to the goal' : 'Standing habit added — floor ' + (patch.floor || '—') + '/7', 'ok');
    }
    capAcked = false;
    formDraft = null;
    mode = { screen: 'habits', id: null, prefillGoalId: null };
    App.rerender();
  }

  /* ---------- habit detail: the memory ---------- */

  function habitDetailHTML() {
    const p = practiceById(mode.id);
    if (!p) { mode = { screen: 'habits', id: null }; return habitsHTML(); }
    const t = today();
    const ticks = myTicks();
    const g = p.goalId ? goalById(p.goalId) : null;
    const streak = G().streak(p, ticks, t);
    const a7 = G().adherence(p, ticks, t, 7);
    const a28 = G().adherence(p, ticks, t, 28);
    const f = p.floor ? G().floorStatus(p, ticks, t) : null;

    let h = '<div class="view-head"><h2>' + U.esc(p.action || 'Habit') + '</h2>' +
      '<button type="button" class="btn ghost small" data-act="habits-back">Back</button></div>' +
      '<p class="small-text text-2" style="margin:-6px 0 12px">' +
      (p.cue ? 'After ' + U.esc(p.cue) + ' · ' : '') + cadenceLabel(p) +
      ' · ' + (g ? 'serves ' + U.esc(g.name) : 'standing') + '</p>';

    h += '<div class="stat-grid" style="margin-bottom:12px">' +
      '<div class="stat"><span class="label">Streak</span><span class="value num">' + streak +
      (p.cadence && p.cadence.type === 'weekly' ? ' wk' : '') + '</span></div>' +
      '<div class="stat"><span class="label">This week</span><span class="value num">' +
      a7.done + '/' + a7.scheduled + '</span></div>' +
      '<div class="stat"><span class="label">28 days</span><span class="value num">' +
      (a28.rate === null ? '—' : Math.round(a28.rate * 100) + '%') + '</span></div>' +
      (f ? '<div class="stat"><span class="label">Floor</span><span class="value num' +
        (f.state === 'below' ? ' g-warn-text' : '') + '">' + f.done + '/' + f.floor + '</span></div>' : '') +
      '</div>';

    h += '<section class="card"><div class="card-title"><span>Last four weeks</span></div>' +
      heatmap(p) + '</section>';

    h += '<div class="btn-row" style="margin-top:6px">' +
      '<button type="button" class="btn ghost small" data-act="habit-edit" data-id="' + U.esc(p.id) + '">Edit</button></div>';
    return h;
  }

  /* ---------- tab 3: wins ---------- */

  function winsHTML() {
    const u = curUser();
    const wins = Store.state.accomplishments.filter(function (a) {
      return u && a.userId === u.id;
    }).sort(function (a, b) { return (b.at || 0) - (a.at || 0); });

    let h = '<div class="view-head"><h2>Wins</h2>' +
      '<span class="small-text muted num">' + wins.length + '</span></div>' +
      tabsHTML('wins');

    if (!wins.length) {
      h += '<div class="empty">' + icon + '<h3>The record</h3>' +
        '<p>Achieved goals, revised definitions, and wins you add yourself land here. ' +
        'The antidote to a system that only ever shows what\'s unfinished.</p></div>';
    } else {
      h += '<section class="card">';
      wins.forEach(function (w, i) {
        h += '<div class="g-row" style="padding:8px 0' + (i ? ';border-top:1px solid var(--border)' : '') + '">' +
          '<span class="small-text" style="flex:1">' + U.esc(w.text || '') + '</span>' +
          '<span class="micro-label num">' + (w.at ? U.dateToStr(new Date(w.at)) : '') + '</span></div>';
      });
      h += '</section>';
    }
    h += '<div class="g-row" style="gap:8px;margin-top:6px">' +
      '<input class="input" id="win-text" placeholder="A win worth recording" style="flex:1" autocomplete="off">' +
      '<button type="button" class="btn small" data-act="win-add" style="flex:none;padding:0 16px">Add</button></div>';
    return h;
  }

  /* ---------- new goal (unchanged one-screen compiler) ---------- */

  function newGoalHTML() {
    const t = today();
    return '<div class="view-head"><h2>New goal</h2>' +
      '<button type="button" class="btn ghost small" data-act="back">Cancel</button></div>' +

      '<section class="card">' +
      '<div class="field"><label for="g-name">The goal, in your own words</label>' +
      '<input class="input" id="g-name" placeholder="Save $6,000 before I ship" autocomplete="off"></div>' +
      '<div class="field"><label for="g-why">Why it matters <span class="muted">(shown on the hard days)</span></label>' +
      '<input class="input" id="g-why" autocomplete="off"></div>' +
      '</section>' +

      '<section class="card">' +
      '<div class="card-title"><span>Make it measurable</span></div>' +
      '<div class="g-row" style="gap:8px">' +
      '<div class="field" style="flex:1.4"><label for="g-measure">What number moves?</label>' +
      '<input class="input" id="g-measure" placeholder="balance, pages, score" autocomplete="off"></div>' +
      '<div class="field" style="flex:.6"><label for="g-unit">Unit</label>' +
      '<input class="input" id="g-unit" placeholder="$" autocomplete="off"></div></div>' +
      '<div class="g-row" style="gap:8px;margin-top:10px">' +
      '<div class="field" style="flex:1"><label for="g-base">Where it is today</label>' +
      '<input class="input num" id="g-base" type="number" step="any" inputmode="decimal"></div>' +
      '<div class="field" style="flex:1"><label for="g-target">Target</label>' +
      '<input class="input num" id="g-target" type="number" step="any" inputmode="decimal"></div>' +
      '<div class="field" style="flex:1.2"><label for="g-date">By</label>' +
      '<input class="input num" id="g-date" type="date" min="' + t + '"></div></div>' +
      '<div id="g-math" class="small-text text-2" style="margin-top:10px"></div>' +
      '</section>' +

      '<section class="card">' +
      '<div class="card-title"><span>One practice to drive it</span></div>' +
      '<div class="g-row" style="gap:8px">' +
      '<div class="field" style="flex:1"><label for="g-cue">After…</label>' +
      '<input class="input" id="g-cue" placeholder="payday · lunch · dinner" autocomplete="off"></div>' +
      '<div class="field" style="flex:1.4"><label for="g-action">…I will</label>' +
      '<input class="input" id="g-action" placeholder="transfer $650" autocomplete="off"></div></div>' +
      '<div class="g-row" style="gap:8px;margin-top:10px">' +
      '<div class="field" style="flex:1"><label for="g-cad">How often</label>' +
      '<select class="select" id="g-cad"><option value="daily">Daily</option>' +
      '<option value="w1">1×/week</option><option value="w2">2×/week</option>' +
      '<option value="w3">3×/week</option><option value="w5">5×/week</option></select></div></div>' +
      '<p class="small-text muted" style="margin:10px 0 0">The weekly review asks for the number, ' +
      'compares your work to its movement, and says which one needs to change. That is the deal.</p>' +
      '</section>' +

      (refusal ? '<section class="card g-refuse"><div class="card-title"><span>Doesn\'t compile yet</span>' +
        '<span class="chip g-chip stop">Not judgeable</span></div>' +
        '<p class="small-text" style="margin:0">A stranger couldn\'t tell whether you hit this. ' +
        U.esc(refusal) + '</p></section>' : '') +

      '<button type="button" class="btn primary" style="width:100%;min-height:48px" data-act="commit">Commit</button>';
  }

  function liveMath(container) {
    const base = parseFloat(U.$('#g-base', container).value);
    const target = parseFloat(U.$('#g-target', container).value);
    const date = U.$('#g-date', container).value;
    const out = U.$('#g-math', container);
    if (!out) return;
    if (!isFinite(base) || !isFinite(target) || !date) { out.innerHTML = ''; return; }
    const daysLeft = Math.max(1, Math.round((U.strToDate(date) - U.strToDate(today())) / 86400000));
    const gap = target - base;
    out.innerHTML = 'Gap: <b class="num">' + fmt(gap) + '</b> over <b class="num">' + daysLeft +
      '</b> days — needs <b class="num">' + fmt(gap / daysLeft * 7) + '</b> per week. ' +
      '<span class="muted">Is that real for you? If not, move the date now, not in month three.</span>';
  }

  function commitNew(container) {
    const val = function (id) { return (U.$(id, container).value || '').trim(); };
    const missing = [];
    if (!val('#g-name')) missing.push('what the goal is');
    if (!val('#g-measure')) missing.push('what number moves (measured how?)');
    if (!isFinite(parseFloat(val('#g-base')))) missing.push('where it is today (the baseline)');
    if (!isFinite(parseFloat(val('#g-target')))) missing.push('the target value');
    if (!val('#g-date')) missing.push('the date');
    if (missing.length) {
      refusal = 'Answer: ' + missing.join(' · ') + '.';
      App.rerender();
      return;
    }
    const goal = Store.addGoal({
      name: val('#g-name'), why: val('#g-why'), shape: 'reach',
      raw: val('#g-name'),
      measure: { name: val('#g-measure'), unit: val('#g-unit'), refresh: 'asked' },
      baseline: { value: parseFloat(val('#g-base')), at: today() },
      target: { value: parseFloat(val('#g-target')), date: val('#g-date') }
    });
    if (!goal) {
      refusal = 'You already have 3 active goals — the cap is the focus. Finish one, or move one to Later from its card.';
      App.rerender();
      return;
    }
    // Day zero is a real data point: the baseline starts the series.
    Store.reportMeasure(goal.id, today(), parseFloat(val('#g-base')));
    if (val('#g-action')) {
      const cad = val('#g-cad') || 'daily';
      Store.addPractice({ goalId: goal.id, cue: val('#g-cue'), action: val('#g-action'),
        cadence: cad === 'daily' ? { type: 'daily' } : { type: 'weekly', times: Number(cad.slice(1)) } });
    }
    if (!setting('goalsReviewAt')) setSetting('goalsReviewAt', today());
    refusal = null;
    mode = { screen: 'detail', id: goal.id };
    App.toast('Committed — the review will hold you to it', 'ok');
    App.rerender();
  }

  /* ---------- goal detail: chart, progress, practices, edit ---------- */

  /* The trajectory, drawn: the measure series as a line, the required path
     from the FIRST point to the target as a dashed reference, the target as
     a diamond. All colour comes from classes; this function only does
     geometry. */
  function chartSVG(g, ms) {
    const pts = G().sortedPoints(ms);
    if (pts.length < 2 || !g.target || !g.target.date) return '';
    const W = 340, H = 120, PAD = 10;
    const x0 = pts[0].date;
    const x1 = g.target.date > pts[pts.length - 1].date ? g.target.date : pts[pts.length - 1].date;
    const span = Math.max(1, (U.strToDate(x1) - U.strToDate(x0)) / 86400000);
    const vals = pts.map(function (p) { return p.value; })
      .concat([Number(g.target.value)]);
    const lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    const vspan = hi - lo || 1;
    function X(d) { return PAD + ((U.strToDate(d) - U.strToDate(x0)) / 86400000) / span * (W - 2 * PAD); }
    function Y(v) { return H - PAD - (v - lo) / vspan * (H - 2 * PAD); }

    let line = '';
    pts.forEach(function (p, i) { line += (i ? ' L' : 'M') + X(p.date).toFixed(1) + ' ' + Y(p.value).toFixed(1); });
    const tx = X(g.target.date), ty = Y(Number(g.target.value));

    return '<svg class="g-chart" viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" ' +
      'role="img" aria-label="Trajectory: the measure over time against the required path">' +
      '<line class="grid" x1="' + PAD + '" y1="' + (H - PAD) + '" x2="' + (W - PAD) + '" y2="' + (H - PAD) + '"/>' +
      '<line class="grid faint" x1="' + PAD + '" y1="' + (H / 2) + '" x2="' + (W - PAD) + '" y2="' + (H / 2) + '"/>' +
      '<path class="req" d="M' + X(pts[0].date).toFixed(1) + ' ' + Y(pts[0].value).toFixed(1) +
      ' L' + tx.toFixed(1) + ' ' + ty.toFixed(1) + '"/>' +
      '<path class="line" d="' + line + '"/>' +
      '<circle class="pt" cx="' + X(pts[pts.length - 1].date).toFixed(1) + '" cy="' +
      Y(pts[pts.length - 1].value).toFixed(1) + '" r="4"/>' +
      '<rect class="target" x="' + (tx - 4).toFixed(1) + '" y="' + (ty - 4).toFixed(1) +
      '" width="8" height="8" transform="rotate(45 ' + tx.toFixed(1) + ' ' + ty.toFixed(1) + ')"/>' +
      '</svg>' +
      '<div class="g-row micro-label"><span>— actual</span><span>‑ ‑ required</span><span>◆ target</span></div>';
  }

  function detailHTML() {
    const g = goalById(mode.id);
    if (!g) { mode = { screen: 'goals', id: null }; return goalsHTML(); }
    const t = today();
    const ms = measuresFor(g.id);
    const v = G().verdict(g, ms, t);
    const prog = G().progress(g, ms);
    const prs = practicesFor(g.id);

    let h = '<div class="view-head"><h2>' + U.esc(g.name) + '</h2>' +
      '<button type="button" class="btn ghost small" data-act="back">Back</button></div>';
    if (g.why) h += '<p class="small-text text-2" style="margin:-6px 0 12px">' + U.esc(g.why) + '</p>';

    h += '<section class="card"><div class="card-title"><span>Trajectory</span>' + verdictChip(v) + '</div>';
    const chart = chartSVG(g, ms);
    if (chart) h += chart;
    if (prog) {
      h += '<div class="g-bar" style="margin-top:10px"><i style="width:' + Math.round(prog.frac * 100) + '%"></i></div>' +
        '<div class="g-row" style="margin-top:6px"><span class="small-text text-2"><span class="num">' +
        fmt(prog.latest) + '</span> → <span class="num">' + fmt(g.target && g.target.value) + '</span>' +
        (g.measure && g.measure.unit ? ' ' + U.esc(g.measure.unit) : '') + '</span>' +
        '<span class="small-text muted num">' + Math.round(prog.frac * 100) + '%</span></div>';
    }
    if (v.state === 'measuring') {
      h += '<p class="small-text muted" style="margin:8px 0 0">No verdict yet, on purpose: a trend needs ' +
        G().MIN_POINTS + ' points. Report the number as it changes.</p>';
    } else if (v.requiredRate !== null) {
      h += '<div class="g-row" style="margin-top:8px"><span class="small-text text-2">Needs</span><span class="num">' +
        fmt(perWeek(v.requiredRate)) + ' /wk</span></div>' +
        '<div class="g-row"><span class="small-text text-2">Getting</span><span class="num">' +
        fmt(perWeek(v.observedRate)) + ' /wk</span></div>';
    } else if (v.state === 'stale') {
      h += '<p class="small-text g-warn-text" style="margin:8px 0 0">The last number is old, so the ' +
        'verdict is suspended — report today\'s and it comes back.</p>';
    }
    h += '</section>';

    h += '<section class="card"><div class="card-title"><span>Report the number</span></div>' +
      '<div class="g-row" style="gap:8px">' +
      '<input class="input num" id="g-report" type="number" step="any" inputmode="decimal" ' +
      'placeholder="' + U.esc(g.measure && g.measure.name || 'value') + ' today" style="flex:1">' +
      '<button type="button" class="btn primary small" data-act="report" style="flex:none;padding:0 18px">Report</button></div></section>';

    h += '<section class="card"><div class="card-title"><span>Practices</span>' +
      '<button type="button" class="btn ghost small" data-act="practice-add" data-id="' + U.esc(g.id) + '">+ Add</button></div>';
    if (!prs.length) {
      h += '<p class="small-text muted" style="margin:0">Nothing drives this goal yet — a goal without a practice is a wish.</p>';
    }
    prs.forEach(function (p, i) {
      h += '<div class="g-row" style="padding:7px 0' + (i ? ';border-top:1px solid var(--border)' : '') + '">' +
        '<span class="small-text" style="flex:1;min-width:0">' +
        (p.cue ? 'After <b>' + U.esc(p.cue) + '</b> → ' : '') + U.esc(p.action || '') +
        ' <span class="muted">· ' + cadenceLabel(p) + '</span></span>' +
        '<button type="button" class="btn ghost small" data-act="habit-open" data-id="' + U.esc(p.id) + '">Open</button></div>' +
        '<div class="g-row" style="padding:0 0 7px">' + weekStrip(p) + '</div>';
    });
    h += '</section>';

    if (Array.isArray(g.versions) && g.versions.length > 1) {
      h += '<p class="small-text muted" style="margin:0 0 10px">Definition v' + g.versions.length +
        ' — sharpened ' + (g.versions.length - 1) + ' time' + (g.versions.length > 2 ? 's' : '') + '.</p>';
    }

    h += '<div class="btn-row">' +
      '<button type="button" class="btn ghost small" data-act="goal-edit">Edit</button>' +
      '<button type="button" class="btn ghost small" data-act="later">Move to Later</button>' +
      '<button type="button" class="btn ghost small" data-act="done">Mark achieved</button></div>';
    return h;
  }

  /* ---------- goal edit: the definition, versioned ---------- */

  function goalEditHTML() {
    const g = goalById(mode.id);
    if (!g) { mode = { screen: 'goals', id: null }; return goalsHTML(); }
    return '<div class="view-head"><h2>Edit goal</h2>' +
      '<button type="button" class="btn ghost small" data-act="edit-cancel">Cancel</button></div>' +
      '<section class="card">' +
      '<div class="field"><label for="e-name">Name</label>' +
      '<input class="input" id="e-name" value="' + U.esc(g.name || '') + '" autocomplete="off"></div>' +
      '<div class="field"><label for="e-why">Why</label>' +
      '<input class="input" id="e-why" value="' + U.esc(g.why || '') + '" autocomplete="off"></div>' +
      '<div class="g-row" style="gap:8px;margin-top:2px">' +
      '<div class="field" style="flex:1"><label for="e-target">Target</label>' +
      '<input class="input num" id="e-target" type="number" step="any" inputmode="decimal" value="' +
      U.esc(g.target ? String(g.target.value) : '') + '"></div>' +
      '<div class="field" style="flex:1.2"><label for="e-date">By</label>' +
      '<input class="input num" id="e-date" type="date" value="' + U.esc(g.target ? g.target.date : '') + '"></div></div>' +
      '<p class="small-text muted" style="margin:10px 0 0">Edits are versioned — sharpening the ' +
      'definition is progress, and the record keeps it. The baseline never changes: it\'s where you ' +
      'actually started.</p>' +
      '</section>' +
      '<button type="button" class="btn primary" style="width:100%;min-height:48px" data-act="edit-save">Save · version ' +
      ((Array.isArray(g.versions) ? g.versions.length : 1) + 1) + '</button>';
  }

  function saveGoalEdit(container) {
    const g = goalById(mode.id);
    if (!g) return;
    const val = function (id) { return (U.$(id, container).value || '').trim(); };
    const target = parseFloat(val('#e-target'));
    const date = val('#e-date');
    const name = val('#e-name');
    if (!name || !isFinite(target) || !date) { App.toast('Name, target and date are the contract', 'err'); return; }
    const versions = (Array.isArray(g.versions) ? g.versions : []).slice();
    versions.push({ at: Date.now(), note: 'revised' });
    Store.updateGoal(g.id, { name: name, why: val('#e-why'),
      target: { value: target, date: date }, versions: versions });
    Store.addAccomplishment('Sharpened the definition: ' + name + ' (v' + versions.length + ')', 'revision');
    mode = { screen: 'detail', id: g.id };
    App.toast('Version ' + versions.length + ' — sharper is progress', 'ok');
    App.rerender();
  }

  /* ---------- the review (unchanged core, revise routes to the form) ---------- */

  function reviewHTML() {
    const t = today();
    const active = myGoals('active');
    const standing = myPractices().filter(function (p) { return !p.goalId; });
    const ticks = myTicks();

    let h = '<div class="view-head"><h2>Weekly review</h2>' +
      '<span class="small-text muted num">' + t + '</span></div>';

    active.forEach(function (g) {
      const prs = practicesFor(g.id);
      const ms = measuresFor(g.id);
      const v = G().verdict(g, ms, t);
      h += '<section class="card"><div class="card-title"><span>' + U.esc(g.name) + '</span>' + verdictChip(v) + '</div>';

      if (prs.length) {
        const d = G().diagnosis(g, prs[0], ticks, ms, t);
        const adhPct = d.adherence.rate === null ? null : Math.round(d.adherence.rate * 100);
        h += '<div class="g-row" style="margin-bottom:8px">' +
          '<span><span class="micro-label">Did the work</span><br><span class="num" style="font-size:18px;font-weight:600">' +
          (adhPct === null ? '—' : adhPct + '%') + '</span></span>' +
          '<span style="text-align:right"><span class="micro-label">Number moved</span><br><span class="num" style="font-size:18px;font-weight:600">' +
          (v.observedRate === null ? '—' : fmt(perWeek(v.observedRate)) + '/wk') + '</span></span></div>';

        if (d.state === 'holding') {
          h += '<p class="small-text" style="margin:0 0 10px"><b>Holding.</b> The work is happening and the number is moving. Keep going.</p>';
        } else if (d.state === 'pathwrong') {
          h += '<p class="small-text" style="margin:0 0 10px"><b>The path is wrong, not you.</b> You did the ' +
            'work and the number barely moved — the practice\'s content needs to change, not your effort.</p>' +
            '<div class="btn-row" style="margin-bottom:6px">' +
            '<button type="button" class="btn small" data-act="habit-edit" data-id="' + U.esc(prs[0].id) + '">Revise the practice</button></div>';
        } else if (d.state === 'doesntfit') {
          const mp = G().missPattern(prs[0], ticks, t, 28);
          let patternTxt = '';
          if (mp && mp.misses) {
            const names = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
            let top = 0;
            for (let i = 1; i < 7; i++) if (mp.byDay[i] > mp.byDay[top]) top = i;
            if (mp.byDay[top] > 0) {
              patternTxt = ' The ticks show ' + mp.byDay[top] + ' of ' + mp.misses +
                ' misses were ' + names[top] + ' — that\'s a scheduling fact, not a character flaw.';
            }
          }
          h += '<p class="small-text" style="margin:0 0 10px"><b>The practice doesn\'t fit your life ' +
            'as scheduled.</b>' + patternTxt + ' The path itself is unjudged — you can\'t evaluate a ' +
            'practice that wasn\'t run.</p>' +
            '<div class="btn-row" style="margin-bottom:6px">' +
            '<button type="button" class="btn small" data-act="habit-edit" data-id="' + U.esc(prs[0].id) + '">Resize or move the cue</button></div>';
        } else {
          h += '<p class="small-text muted" style="margin:0 0 10px">No verdict on the path this week — ' +
            (v.state === 'measuring' ? 'the measure is still young.' :
             v.state === 'stale' ? 'the number below is what unlocks it.' :
             'it\'s moving, just not fast enough yet. Watch one more week, or escalate the practice.') + '</p>';
        }
      }

      h += '<div class="g-row" style="gap:8px">' +
        '<input class="input num" data-report-for="' + U.esc(g.id) + '" type="number" step="any" ' +
        'inputmode="decimal" placeholder="' + U.esc(g.measure && g.measure.name || 'value') + ' today" style="flex:1">' +
        '<button type="button" class="btn small" data-act="review-report" data-id="' + U.esc(g.id) + '" ' +
        'style="flex:none;padding:0 16px">Report</button></div>';
      h += '</section>';
    });

    if (standing.length) {
      h += '<section class="card"><div class="card-title"><span>Standing</span></div>';
      standing.forEach(function (p, i) {
        const f = G().floorStatus(p, ticks, t);
        h += '<div class="g-row" style="padding:7px 0' + (i ? ';border-top:1px solid var(--border)' : '') + '">' +
          '<span class="small-text" style="flex:1">' + U.esc(p.action || '') + '</span>' +
          '<span class="micro-label num' + (f.state === 'below' ? ' g-warn-text' : '') + '">' +
          f.done + '/7' + (f.floor ? ' · floor ' + f.floor : '') + '</span></div>';
      });
      h += '</section>';
    }

    const u = curUser();
    const wins = Store.state.accomplishments.filter(function (a) {
      return u && a.userId === u.id && a.at > Date.now() - 7 * 86400000;
    });
    if (wins.length) {
      h += '<section class="card"><div class="card-title"><span>Wins this week</span></div>';
      wins.forEach(function (w) {
        h += '<p class="small-text" style="margin:0 0 4px">' + U.esc(w.text) + '</p>';
      });
      h += '</section>';
    }

    h += '<button type="button" class="btn primary" style="width:100%;min-height:48px" data-act="finish-review">' +
      'Done — next review in a week</button>';
    return h;
  }

  function cadenceLabel(p) {
    const c = p.cadence || { type: 'daily' };
    return c.type === 'weekly' ? (c.times || 1) + '×/week' : 'Daily';
  }

  /* ---------- wiring ---------- */

  function toggleTick(practiceId, date) {
    const t = today();
    if (!G().canBackfill(date, t)) return; // the record doesn't bend
    if (ticked(practiceId, date)) Store.untickPractice(practiceId, date);
    else Store.tickPractice(practiceId, date);
    App.rerender();
  }

  function wire(container) {
    U.on(container, 'click', '[data-tab]', function (e, el) {
      mode = { screen: el.getAttribute('data-tab'), id: null, prefillGoalId: null };
      App.rerender();
    });
    U.on(container, 'click', '[data-cell]', function (e, el) {
      e.stopPropagation();
      toggleTick(el.getAttribute('data-cell'), el.getAttribute('data-date'));
    });
    U.on(container, 'click', '[data-act]', function (e, el) {
      const act = el.getAttribute('data-act');
      const id = el.getAttribute('data-id');
      if (act === 'new') { refusal = null; mode = { screen: 'new', id: null }; App.rerender(); }
      else if (act === 'back') { refusal = null; mode = { screen: 'goals', id: null }; App.rerender(); }
      else if (act === 'habits-back') { capAcked = false; formDraft = null; mode = { screen: 'habits', id: null }; App.rerender(); }
      else if (act === 'open') { mode = { screen: 'detail', id: id }; App.rerender(); }
      else if (act === 'commit') commitNew(container);
      else if (act === 'review') { mode = { screen: 'review', id: null }; App.rerender(); }
      else if (act === 'habit-new') { capAcked = false; mode = { screen: 'habit-form', id: null, prefillGoalId: null }; App.rerender(); }
      else if (act === 'practice-add') { capAcked = false; mode = { screen: 'habit-form', id: null, prefillGoalId: id }; App.rerender(); }
      else if (act === 'habit-open') { mode = { screen: 'habit-detail', id: id }; App.rerender(); }
      else if (act === 'habit-edit') { capAcked = false; mode = { screen: 'habit-form', id: id }; App.rerender(); }
      else if (act === 'habit-save') saveHabit(container);
      else if (act === 'habit-delete') {
        if (el.getAttribute('data-armed')) {
          Store.deletePractice(mode.id);
          mode = { screen: 'habits', id: null };
          App.toast('Habit deleted — its ticks stay in the record', 'ok');
          App.rerender();
        } else {
          el.setAttribute('data-armed', '1');
          el.textContent = 'Tap again to delete';
        }
      }
      else if (act === 'goal-edit') { mode = { screen: 'goal-edit', id: mode.id }; App.rerender(); }
      else if (act === 'edit-cancel') { mode = { screen: 'detail', id: mode.id }; App.rerender(); }
      else if (act === 'edit-save') saveGoalEdit(container);
      else if (act === 'win-add') {
        const input = U.$('#win-text', container);
        const text = (input && input.value || '').trim();
        if (!text) return;
        Store.addAccomplishment(text, 'win');
        App.toast('On the record', 'ok');
        App.rerender();
      }
      else if (act === 'report') {
        const input = U.$('#g-report', container);
        const val = parseFloat(input && input.value);
        if (!isFinite(val)) { App.toast('A number, please', 'err'); return; }
        Store.reportMeasure(mode.id, today(), val);
        App.toast('Reported', 'ok');
        App.rerender();
      }
      else if (act === 'review-report') {
        const input = container.querySelector('[data-report-for="' + id + '"]');
        const val = parseFloat(input && input.value);
        if (!isFinite(val)) { App.toast('A number, please', 'err'); return; }
        Store.reportMeasure(id, today(), val);
        App.toast('Reported', 'ok');
        App.rerender();
      }
      else if (act === 'later') {
        Store.updateGoal(mode.id, { status: 'later' });
        mode = { screen: 'goals', id: null };
        App.toast('Moved to Later', 'ok');
        App.rerender();
      }
      else if (act === 'done') {
        const g = goalById(mode.id);
        Store.updateGoal(mode.id, { status: 'done' });
        if (g) Store.addAccomplishment('Achieved: ' + g.name, 'goal');
        mode = { screen: 'wins', id: null };
        App.toast('Achieved. It goes on the record.', 'ok');
        App.rerender();
      }
      else if (act === 'finish-review') {
        setSetting('goalsReviewAt', today());
        mode = { screen: 'goals', id: null };
        App.toast('Reviewed. Same time next week.', 'ok');
        App.rerender();
      }
    });
    ['#g-base', '#g-target', '#g-date'].forEach(function (sel) {
      const el = U.$(sel, container);
      if (el) el.addEventListener('input', function () { liveMath(container); });
    });
  }

  /* ======================================================================
     The Dashboard Today card
     ====================================================================== */

  function dueToday(p) {
    const c = p.cadence || { type: 'daily' };
    if (c.type === 'daily') return true;
    const a = G().adherence(p, myTicks(), today(), 7);
    const have = ticked(p.id, today());
    return have || a.done < (c.times || 1);
  }

  GoalsUI.todayCardHTML = function () {
    const u = curUser();
    if (!u || !window.Goals) return '';
    const prs = myPractices().filter(dueToday);
    if (!prs.length) return '';
    const t = today();
    const done = prs.filter(function (p) { return ticked(p.id, t); }).length;

    let h = '<section class="card"><div class="card-title"><span>Today</span>' +
      '<span class="small-text muted num">' + done + ' of ' + prs.length + '</span></div>';
    prs.forEach(function (p, i) {
      const isTicked = ticked(p.id, t);
      const goal = p.goalId ? goalById(p.goalId) : null;
      const weekly = p.cadence && p.cadence.type === 'weekly';
      const streak = G().streak(p, myTicks(), t);
      const a7 = weekly ? G().adherence(p, myTicks(), t, 7) : null;
      h += '<div class="g-row" style="padding:8px 0' + (i ? ';border-top:1px solid var(--border)' : '') + '">' +
        '<button type="button" class="g-tick' + (isTicked ? ' done' : '') + '" data-goal-tick="' + U.esc(p.id) + '" ' +
        'aria-label="' + (isTicked ? 'Untick' : 'Tick') + ' ' + U.esc(p.action || '') + '">' + (isTicked ? '✓' : '') + '</button>' +
        '<span style="flex:1;margin-left:10px"><span class="small-text">' + U.esc(p.action || p.cue || '') + '</span><br>' +
        '<span class="micro-label">' + (goal ? U.esc(goal.name) : 'standing') +
        (weekly && a7 ? ' · ' + a7.done + ' of ' + (p.cadence.times || 1) + ' this wk' : '') + '</span></span>' +
        (streak ? '<span class="micro-label num">streak ' + streak + (weekly ? ' wk' : '') + '</span>' : '') +
        '</div>';
    });
    h += '</section>';
    return h;
  };

  GoalsUI.wireToday = function (container) {
    U.on(container, 'click', '[data-goal-tick]', function (e, el) {
      toggleTick(el.getAttribute('data-goal-tick'), today());
    });
  };

  window.GoalsUI = GoalsUI;

  App.registerView('goals', {
    title: 'Goals',
    icon: icon,
    nav: true,
    order: 46,
    render: render
  });
})();
