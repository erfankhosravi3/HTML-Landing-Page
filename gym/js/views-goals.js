/* IronLog — views-goals.js (P7 probe)
   The Goals system: a GENERAL life instrument — a language, a certification,
   money, discipline. It deliberately depends on nothing from the training
   side: no Standards seeding, no workout auto-verification, no Analytics.
   Every judgment on these screens comes from js/goals.js, which is pure
   arithmetic over what the user typed, counted, or tested — the coach may
   comment via its own view, but nothing here asks a model anything.

   Probe scope on purpose (see ARCHITECTURE P7): Reach goals, manual ticks,
   asked measures, the Sunday review. The one question this slice exists to
   answer is whether the weekly review actually happens.

   Exposes window.GoalsUI ONLY for the dashboard Today card hook. */
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

  // Per-day rates read badly for weekly humans; everything renders per week.
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

  // Seven boxes, oldest left. A miss is a miss — no forgiving grey.
  function weekDots(practice) {
    const ticks = myTicks();
    const have = {};
    ticks.forEach(function (t) { if (t.practiceId === practice.id) have[t.date] = true; });
    let h = '<span class="g-dots" aria-hidden="true">';
    for (let i = 6; i >= 0; i--) {
      const d = U.addDays(today(), -i);
      h += '<i class="' + (have[d] ? 'hit' : (i === 0 ? '' : 'miss')) + '"></i>';
    }
    return h + '</span>';
  }

  function dailyStreak(practice) {
    const have = {};
    myTicks().forEach(function (t) { if (t.practiceId === practice.id) have[t.date] = true; });
    let n = 0;
    let d = today();
    if (!have[d]) d = U.addDays(d, -1); // an unticked today doesn't break it yet
    while (have[d]) { n++; d = U.addDays(d, -1); }
    return n;
  }

  function cadenceLabel(p) {
    const c = p.cadence || { type: 'daily' };
    return c.type === 'weekly' ? (c.times || 1) + '×/week' : 'Daily';
  }

  /* ======================================================================
     The view: list / new / detail / review, one module-level mode
     ====================================================================== */

  let mode = { screen: 'list', goalId: null };

  // Entering the view from elsewhere always lands on the list. Without this,
  // the module-level `mode` survives navigation and a user who left mid-form
  // three days ago returns to a half-filled compiler instead of their goals.
  // Rerenders within the view never change the hash, so in-flow state holds.
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('hashchange', function (e) {
      const to = String((e && e.newURL) || '').split('#')[1] || '';
      const from = String((e && e.oldURL) || '').split('#')[1] || '';
      if (to.indexOf('/goals') === 0 && from.indexOf('/goals') !== 0) {
        mode = { screen: 'list', goalId: null };
        refusal = null;
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
    if (mode.screen === 'new') html = newHTML();
    else if (mode.screen === 'detail') html = detailHTML();
    else if (mode.screen === 'review') html = reviewHTML();
    else html = listHTML();
    container.innerHTML = html;
    wire(container);
  }

  /* ---------- list ---------- */

  function listHTML() {
    const active = myGoals('active');
    const laterN = myGoals('later').length;
    const standing = myPractices().filter(function (p) { return !p.goalId; });
    const t = today();

    let h = '<div class="view-head"><h2>Goals</h2>' +
      '<span class="chip g-chip">' + active.length + ' of 3 active</span></div>';

    if (G().reviewDue(setting('goalsReviewAt'), t) && (active.length || standing.length)) {
      h += '<section class="card g-review-due" data-act="review">' +
        '<div class="card-title"><span>Weekly review due</span>' +
        '<button type="button" class="btn primary small">Start · 10 min</button></div>' +
        '<p class="text-2 small-text" style="margin:0">The plan meets the evidence. Every card ends in a decision.</p>' +
        '</section>';
    }

    if (!active.length && !standing.length) {
      h += '<div class="empty">' + icon + '<h3>Name the target. Build the path.</h3>' +
        '<p>Any goal — money, a language, a certification. The app helps make it ' +
        'measurable, then tells you every week whether the plan is working.</p></div>';
    }

    active.forEach(function (g) {
      const v = G().verdict(g, measuresFor(g.id), t);
      const prs = practicesFor(g.id);
      const latest = v.latest ? v.latest.value : (g.baseline ? g.baseline.value : null);
      h += '<section class="card interactive" data-act="open" data-id="' + U.esc(g.id) + '">' +
        '<div class="card-title"><span>' + U.esc(g.name || 'Goal') + '</span>' + verdictChip(v) + '</div>' +
        (g.why ? '<p class="small-text text-2" style="margin:2px 0 10px">' + U.esc(g.why) + '</p>' : '') +
        '<div class="g-row"><span class="small-text text-2">' +
          '<span class="num">' + fmt(latest) + '</span> → <span class="num">' +
          fmt(g.target && g.target.value) + '</span>' +
          (g.measure && g.measure.unit ? ' ' + U.esc(g.measure.unit) : '') + '</span>' +
          '<span class="small-text muted num">' + U.esc(g.target && g.target.date || '') + '</span></div>' +
        (v.requiredRate !== null
          ? '<div class="g-row" style="margin-top:6px"><span class="small-text muted">needs ' +
            '<span class="num">' + fmt(perWeek(v.requiredRate)) + '</span>/wk · getting ' +
            '<span class="num">' + fmt(perWeek(v.observedRate)) + '</span>/wk</span></div>'
          : '') +
        (prs.length
          ? '<div class="g-row" style="margin-top:8px"><span class="micro-label">This week</span>' +
            weekDots(prs[0]) + '</div>'
          : '') +
        '</section>';
    });

    if (standing.length) {
      h += '<div class="micro-label" style="margin:4px 0 6px">Standing · no finish line</div>' +
        '<section class="card">';
      standing.forEach(function (p, i) {
        const f = G().floorStatus(p, myTicks(), t);
        h += '<div class="g-row" style="padding:7px 0' +
          (i ? ';border-top:1px solid var(--border)' : '') + '">' +
          '<span class="g-dot ' + (f.state === 'below' ? 'warn' : 'go') + '"></span>' +
          '<span class="small-text" style="flex:1;margin-left:6px">' + U.esc(p.action || p.cue || 'Practice') + '</span>' +
          '<span class="micro-label num' + (f.state === 'below' ? ' g-warn-text' : '') + '">' +
          f.done + '/7' + (f.floor ? ' · floor ' + f.floor : '') + '</span></div>';
      });
      h += '</section>';
    }

    if (laterN) {
      h += '<p class="small-text muted" style="margin:2px 0 10px">Later · ' + laterN + ' waiting</p>';
    }

    h += '<div class="btn-row" style="margin-top:6px">' +
      '<button type="button" class="btn primary" style="flex:1" data-act="new">+ New goal</button>' +
      '<button type="button" class="btn ghost" data-act="new-standing">+ Standing practice</button></div>';
    return h;
  }

  /* ---------- new goal (one screen, Reach) ---------- */

  let refusal = null; // the exact missing questions, shown after a Commit try

  function newHTML() {
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
    if (!setting('goalsReviewAt')) setSetting('goalsReviewAt', today()); // anchor the cadence
    refusal = null;
    mode = { screen: 'detail', goalId: goal.id };
    App.toast('Committed — the review will hold you to it', 'ok');
    App.rerender();
  }

  function newStanding() {
    const action = (window.prompt && window.prompt('The practice (e.g. "Up at 05:00"):') || '').trim();
    if (!action) return;
    const floorS = (window.prompt && window.prompt('Floor — minimum days per week (1–7):', '5') || '').trim();
    const floor = Math.min(7, Math.max(1, parseInt(floorS, 10) || 5));
    Store.addPractice({ goalId: '', cue: '', action: action, cadence: { type: 'daily' }, floor: floor });
    App.toast('Standing practice added — no finish line, floor ' + floor + '/7', 'ok');
    App.rerender();
  }

  /* ---------- detail ---------- */

  function detailHTML() {
    const g = Store.state.goals.find(function (x) { return x.id === mode.goalId; });
    if (!g) { mode = { screen: 'list', goalId: null }; return listHTML(); }
    const t = today();
    const v = G().verdict(g, measuresFor(g.id), t);
    const prs = practicesFor(g.id);
    const latest = v.latest ? v.latest.value : (g.baseline ? g.baseline.value : null);

    let h = '<div class="view-head"><h2>' + U.esc(g.name) + '</h2>' +
      '<button type="button" class="btn ghost small" data-act="back">Back</button></div>';
    if (g.why) h += '<p class="small-text text-2" style="margin:-6px 0 12px">' + U.esc(g.why) + '</p>';

    h += '<section class="card"><div class="card-title"><span>Trajectory</span>' + verdictChip(v) + '</div>' +
      '<div class="g-row"><span class="small-text text-2">Latest</span>' +
      '<span class="num">' + fmt(latest) + (g.measure && g.measure.unit ? ' ' + U.esc(g.measure.unit) : '') + '</span></div>' +
      '<div class="g-row"><span class="small-text text-2">Target</span>' +
      '<span class="num">' + fmt(g.target && g.target.value) + ' by ' + U.esc(g.target && g.target.date || '?') + '</span></div>';
    if (v.state === 'measuring') {
      h += '<p class="small-text muted" style="margin:8px 0 0">No verdict yet, on purpose: a trend needs ' +
        G().MIN_POINTS + ' points. Report the number below as it changes.</p>';
    } else if (v.requiredRate !== null) {
      h += '<div class="g-row"><span class="small-text text-2">Needs</span><span class="num">' +
        fmt(perWeek(v.requiredRate)) + ' /wk</span></div>' +
        '<div class="g-row"><span class="small-text text-2">Getting</span><span class="num">' +
        fmt(perWeek(v.observedRate)) + ' /wk</span></div>';
    } else if (v.state === 'stale') {
      h += '<p class="small-text g-warn-text" style="margin:8px 0 0">The last number is old, so the ' +
        'verdict is suspended — report today\'s below and it comes back.</p>';
    }
    h += '</section>';

    h += '<section class="card"><div class="card-title"><span>Report the number</span></div>' +
      '<div class="g-row" style="gap:8px">' +
      '<input class="input num" id="g-report" type="number" step="any" inputmode="decimal" ' +
      'placeholder="' + U.esc(g.measure && g.measure.name || 'value') + ' today" style="flex:1">' +
      '<button type="button" class="btn primary small" data-act="report" style="flex:none;padding:0 18px">Report</button></div>' +
      '<p class="small-text muted" style="margin:8px 0 0">Reporting twice on one day corrects the ' +
      'number instead of adding a second point.</p></section>';

    if (prs.length) {
      h += '<section class="card"><div class="card-title"><span>Practices</span></div>';
      prs.forEach(function (p, i) {
        h += '<div class="g-row" style="padding:7px 0' + (i ? ';border-top:1px solid var(--border)' : '') + '">' +
          '<span class="small-text" style="flex:1">' +
          (p.cue ? 'After <b>' + U.esc(p.cue) + '</b> → ' : '') + U.esc(p.action || '') +
          ' <span class="muted">· ' + cadenceLabel(p) + '</span></span>' + weekDots(p) + '</div>';
      });
      h += '</section>';
    }

    h += '<div class="btn-row">' +
      '<button type="button" class="btn ghost small" data-act="later">Move to Later</button>' +
      '<button type="button" class="btn ghost small" data-act="done">Mark achieved</button></div>';
    return h;
  }

  /* ---------- the review ---------- */

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
            '<button type="button" class="btn small" data-act="revise" data-id="' + U.esc(prs[0].id) + '">Revise the practice</button></div>';
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
            '<button type="button" class="btn small" data-act="revise" data-id="' + U.esc(prs[0].id) + '">Resize or move the cue</button></div>';
        } else {
          h += '<p class="small-text muted" style="margin:0 0 10px">No verdict on the path this week — ' +
            (v.state === 'measuring' ? 'the measure is still young.' :
             v.state === 'stale' ? 'the number below is what unlocks it.' :
             'it\'s moving, just not fast enough yet. Watch one more week, or escalate the practice.') + '</p>';
        }
      }

      // The ask: this is what keeps self-reported measures from rotting.
      if (!g.measure || g.measure.refresh !== 'reported') {
        h += '<div class="g-row" style="gap:8px">' +
          '<input class="input num" data-report-for="' + U.esc(g.id) + '" type="number" step="any" ' +
          'inputmode="decimal" placeholder="' + U.esc(g.measure && g.measure.name || 'value') + ' today" style="flex:1">' +
          '<button type="button" class="btn small" data-act="review-report" data-id="' + U.esc(g.id) + '" ' +
          'style="flex:none;padding:0 16px">Report</button></div>';
      }
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

    const wins = Store.state.accomplishments.filter(function (a) {
      const u = curUser();
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

  /* ---------- wiring ---------- */

  function wire(container) {
    U.on(container, 'click', '[data-act]', function (e, el) {
      const act = el.getAttribute('data-act');
      const id = el.getAttribute('data-id');
      if (act === 'new') { refusal = null; mode = { screen: 'new', goalId: null }; App.rerender(); }
      else if (act === 'new-standing') newStanding();
      else if (act === 'back') { refusal = null; mode = { screen: 'list', goalId: null }; App.rerender(); }
      else if (act === 'open') { mode = { screen: 'detail', goalId: id }; App.rerender(); }
      else if (act === 'commit') commitNew(container);
      else if (act === 'review') { mode = { screen: 'review', goalId: null }; App.rerender(); }
      else if (act === 'report') {
        const input = U.$('#g-report', container);
        const val = parseFloat(input && input.value);
        if (!isFinite(val)) { App.toast('A number, please', 'err'); return; }
        Store.reportMeasure(mode.goalId, today(), val);
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
      else if (act === 'revise') {
        const p = Store.state.practices.find(function (x) { return x.id === id; });
        const next = (window.prompt && window.prompt('The practice, revised:', p ? p.action : '') || '').trim();
        if (next && p) {
          Store.updatePractice(p.id, { action: next });
          Store.addAccomplishment('Revised a practice: ' + next, 'revision');
          App.toast('Revised — the next review checks the new bet', 'ok');
          App.rerender();
        }
      }
      else if (act === 'later') {
        Store.updateGoal(mode.goalId, { status: 'later' });
        mode = { screen: 'list', goalId: null };
        App.toast('Moved to Later', 'ok');
        App.rerender();
      }
      else if (act === 'done') {
        const g = Store.state.goals.find(function (x) { return x.id === mode.goalId; });
        Store.updateGoal(mode.goalId, { status: 'done' });
        if (g) Store.addAccomplishment('Achieved: ' + g.name, 'goal');
        mode = { screen: 'list', goalId: null };
        App.toast('Achieved. It goes on the record.', 'ok');
        App.rerender();
      }
      else if (act === 'finish-review') {
        setSetting('goalsReviewAt', today());
        mode = { screen: 'list', goalId: null };
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
     The Dashboard Today card (rendered by views-insights via this hook)
     ====================================================================== */

  function dueToday(p) {
    const c = p.cadence || { type: 'daily' };
    if (c.type === 'daily') return true;
    // weekly xN: due while this week's count is short of N
    const a = G().adherence(p, myTicks(), today(), 7);
    const have = myTicks().some(function (t) { return t.practiceId === p.id && t.date === today(); });
    return have || a.done < (c.times || 1);
  }

  GoalsUI.todayCardHTML = function () {
    const u = curUser();
    if (!u || !window.Goals) return '';
    const prs = myPractices().filter(dueToday);
    if (!prs.length) return '';
    const t = today();
    const ticks = myTicks();
    const done = prs.filter(function (p) {
      return ticks.some(function (k) { return k.practiceId === p.id && k.date === t; });
    }).length;

    let h = '<section class="card"><div class="card-title"><span>Today</span>' +
      '<span class="small-text muted num">' + done + ' of ' + prs.length + '</span></div>';
    prs.forEach(function (p, i) {
      const ticked = ticks.some(function (k) { return k.practiceId === p.id && k.date === t; });
      const goal = p.goalId ? Store.state.goals.find(function (g) { return g.id === p.goalId; }) : null;
      const streak = p.cadence && p.cadence.type === 'weekly' ? null : dailyStreak(p);
      h += '<div class="g-row" style="padding:8px 0' + (i ? ';border-top:1px solid var(--border)' : '') + '">' +
        '<button type="button" class="g-tick' + (ticked ? ' done' : '') + '" data-goal-tick="' + U.esc(p.id) + '" ' +
        'aria-label="' + (ticked ? 'Untick' : 'Tick') + ' ' + U.esc(p.action || '') + '">' + (ticked ? '✓' : '') + '</button>' +
        '<span style="flex:1;margin-left:10px"><span class="small-text">' + U.esc(p.action || p.cue || '') + '</span><br>' +
        '<span class="micro-label">' + (goal ? U.esc(goal.name) : 'standing') + '</span></span>' +
        (streak ? '<span class="micro-label num">streak ' + streak + '</span>' : '') +
        '</div>';
    });
    h += '</section>';
    return h;
  };

  GoalsUI.wireToday = function (container) {
    U.on(container, 'click', '[data-goal-tick]', function (e, el) {
      const pid = el.getAttribute('data-goal-tick');
      const t = today();
      const u = curUser();
      if (!u) return;
      const has = Store.state.ticks.some(function (k) {
        return k.practiceId === pid && k.date === t && k.userId === u.id;
      });
      if (has) Store.untickPractice(pid, t);
      else Store.tickPractice(pid, t);
      App.rerender();
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
