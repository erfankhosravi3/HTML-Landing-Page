/* IronLog — views-nutrition.js (P8.1)
   The nutrition pillar: a MyFitnessPal-shaped diary on IronLog's honesty
   rules. Slotted meals (breakfast/lunch/dinner/snacks) on a browsable day,
   a personal food library that makes repeat logging two taps, a daily
   budget derived from REAL burn days (never an age/height formula), the
   week strip, and a Dashboard card so the pillar stands where you already
   look every morning.

   The contracts from P8.0 hold unchanged:
     * OPT-IN per profile; off is really off — never a calorie before consent.
     * THE MODEL HAS NO WRITE PATH — photos land as editable drafts.
     * PHOTOS ARE NEVER STORED — canvas, wire, gone.
     * WORKS KEYLESS — everything but the photo button.
   New rule: meals may be logged to any PAST day (dietary recall is normal);
   the future is closed. Distinct from the tick law on purpose. */
(function () {
  'use strict';

  const NutritionUI = {};

  function N() { return window.Nutrition; }
  function curUser() { return Store.currentUser(); }
  function today() { return U.todayStr(); }

  const icon = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>';

  function nsettings() {
    const u = curUser();
    const s = u && u.settings && u.settings.nutrition;
    return s && typeof s === 'object' ? s : {};
  }
  function setNSettings(patch) {
    const u = curUser();
    if (!u) return;
    const s = Object.assign({}, u.settings);
    s.nutrition = Object.assign({}, nsettings(), patch);
    Store.updateUser(u.id, { settings: s });
  }
  function enabled() { return nsettings().enabled === true; }

  function myMeals() {
    const u = curUser();
    if (!u) return [];
    return Store.state.meals.filter(function (m) { return m.userId === u.id; });
  }
  function myFoods() {
    const u = curUser();
    if (!u) return [];
    return Store.state.foods.filter(function (f) { return f.userId === u.id; });
  }
  function mySamples() {
    const u = curUser();
    if (!u) return [];
    return Store.state.healthSamples.filter(function (s) { return s.userId === u.id; });
  }
  function myWeights() {
    const u = curUser();
    if (!u) return [];
    return Store.state.healthSamples.filter(function (s) {
      return s.userId === u.id && s.kind === 'weightKg';
    }).concat(Store.state.bodyMetrics.filter(function (b) {
      return b.userId === u.id && b.kind === 'weightKg';
    }));
  }

  function fmt(n) { return n === null || n === undefined || !isFinite(n) ? '—' : String(Math.round(n)); }

  /* ---------- state ---------- */

  let nuTab = 'diary';     // 'diary' | 'energy'
  let viewDate = null;     // the browsed day; null = today
  let draft = null;        // the editable proposal; NOT in the store
  let draftBusy = false;
  let draftSlot = 'snack';
  let addSlot = null;      // which slot's add sheet is open
  let showLibrary = false;

  function vday() { return viewDate || today(); }

  if (typeof window.addEventListener === 'function') {
    window.addEventListener('hashchange', function (e) {
      const to = String((e && e.newURL) || '').split('#')[1] || '';
      const from = String((e && e.oldURL) || '').split('#')[1] || '';
      if (to.indexOf('/nutrition') === 0 && from.indexOf('/nutrition') !== 0) {
        nuTab = 'diary'; viewDate = null; draft = null; draftBusy = false; addSlot = null; showLibrary = false;
      }
    });
  }

  /* ---------- render ---------- */

  function render(container) {
    const u = curUser();
    if (!u) { container.innerHTML = '<div class="empty">' + icon + '<h3>No profile selected</h3></div>'; return; }
    if (!N()) { container.innerHTML = '<div class="empty"><h3>Nutrition engine missing</h3></div>'; return; }
    container.innerHTML = enabled() ? mainHTML() : introHTML();
    wire(container);
  }

  function introHTML() {
    return '<div class="view-head"><h2>Nutrition</h2></div>' +
      '<div class="empty">' + icon + '<h3>Off, until you say otherwise</h3>' +
      '<p>A meal diary with a food library, a calorie budget built from your real ' +
      'burn, and your weight trend as the referee. Photos become editable drafts; ' +
      'nothing is ever logged for you. Per profile: enabling it here enables it ' +
      'for you only.</p></div>' +
      '<button type="button" class="btn primary" style="width:100%;min-height:48px" data-act="enable">Turn on nutrition</button>';
  }

  function mainHTML() {
    let h = '<div class="view-head"><h2>Nutrition</h2></div>' +
      '<div class="segmented g-tabs">' +
      '<button type="button" class="seg' + (nuTab === 'diary' ? ' active' : '') + '" data-nutab="diary">Diary</button>' +
      '<button type="button" class="seg' + (nuTab === 'energy' ? ' active' : '') + '" data-nutab="energy">Energy</button>' +
      '</div>';
    h += nuTab === 'energy' ? energyHTML() : diaryHTML();
    return h;
  }

  function diaryHTML() {
    const u = curUser();
    const t = today();
    const d = vday();
    const dayMeals = myMeals().filter(function (m) { return m.date === d; })
      .sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
    const totals = N().totals(dayMeals);
    const burn = N().dayBurn(mySamples(), u.id, d);
    const cfg = nsettings();
    const tgt = N().kcalTarget(mySamples(), u.id, t, cfg);
    const proteinTarget = cfg.proteinG || N().proteinTargetG(myWeights(), u.id);

    let h = '';

    /* ---- day nav ---- */
    h += '<div class="g-row nu-daynav">' +
      '<button type="button" class="btn ghost small" data-act="day-prev" aria-label="Previous day">‹</button>' +
      '<span class="small-text" style="font-weight:600">' + (d === t ? 'Today' : d) + '</span>' +
      '<button type="button" class="btn ghost small" data-act="day-next" aria-label="Next day"' +
      (d === t ? ' disabled' : '') + '>›</button></div>';

    /* ---- the budget ---- */
    h += '<section class="card">';
    if (tgt.state === 'ok') {
      const remaining = tgt.target - totals.kcal;
      h += '<div class="g-row"><span class="micro-label">' +
        (d === t ? 'REMAINING TODAY' : 'REMAINING · ' + d) + '</span>' +
        '<span class="micro-label num">' + fmt(totals.kcal) + ' of ' + fmt(tgt.target) + '</span></div>' +
        '<div class="num nu-remaining' + (remaining < 0 ? ' g-warn-text' : '') + '">' +
        (remaining < 0 ? fmt(-remaining) + ' over' : fmt(remaining)) + '</div>' +
        '<div class="g-bar nu-kcal-bar"><i style="width:' +
        Math.min(100, Math.round(totals.kcal / tgt.target * 100)) + '%"></i></div>' +
        '<p class="micro-label" style="margin:6px 0 0">' +
        (tgt.source === 'manual' ? 'Target set by hand'
          : 'Target = your measured ' + fmt(tgt.tdee) + ' kcal burn' +
            (tgt.rate ? (tgt.rate < 0 ? ' − ' : ' + ') + fmt(Math.abs(tgt.rate) * N().KCAL_PER_KG / 7) +
              ' for ' + Math.abs(tgt.rate) + ' kg/wk' : '')) + '</p>';
    } else {
      h += '<div class="g-row"><span class="micro-label">' + (d === t ? 'TODAY' : d) + '</span>' +
        '<span class="micro-label num">' + fmt(totals.kcal) + ' kcal in</span></div>' +
        '<p class="small-text muted" style="margin:8px 0 0">No calorie budget yet — it\'s built from ' +
        'your real burn and needs ' + N().TDEE_MIN_DAYS + ' complete burn days (it has ' + tgt.burnDays +
        '), or set one by hand in Targets below. No formulas, no guessing.</p>';
    }
    if (proteinTarget) {
      h += '<div class="g-row" style="margin-top:10px"><span class="small-text text-2">Protein</span>' +
        '<span class="num small-text">' + fmt(totals.proteinG) + ' / ' + proteinTarget + ' g</span></div>' +
        '<div class="g-bar"><i style="width:' + Math.min(100, Math.round(totals.proteinG / proteinTarget * 100)) + '%"></i></div>';
    }
    h += '<div class="g-row" style="margin-top:8px"><span class="micro-label">C ' + fmt(totals.carbsG) +
      ' g · F ' + fmt(totals.fatG) + ' g</span>' +
      (burn.burn !== null ? '<span class="micro-label num">burn ' + fmt(burn.burn) + '</span>' : '') + '</div>';
    h += '</section>';

    /* ---- week strip ---- */
    const wk = N().weekSeries(myMeals(), mySamples(), u.id, t);
    const wkMax = Math.max(tgt.state === 'ok' ? tgt.target : 0,
      Math.max.apply(null, wk.map(function (x) { return x.intake.kcal; })), 1);
    h += '<div class="nu-week">';
    wk.forEach(function (day) {
      const hgt = Math.max(3, Math.round(day.intake.kcal / wkMax * 40));
      const over = tgt.state === 'ok' && day.intake.kcal > tgt.target;
      h += '<button type="button" class="nu-day' + (day.date === d ? ' sel' : '') + '" data-day="' + day.date + '" ' +
        'aria-label="' + day.date + ', ' + day.intake.kcal + ' kcal">' +
        '<i class="' + (over ? 'over' : day.intake.meals ? 'in' : '') + '" style="height:' + hgt + 'px"></i>' +
        '<span class="micro-label">' + day.date.slice(8) + '</span></button>';
    });
    h += '</div>';

    /* ---- the diary ---- */
    N().SLOTS.forEach(function (slot) {
      const slotMeals = dayMeals.filter(function (m) { return N().slotOf(m) === slot; });
      const st = N().totals(slotMeals);
      h += '<section class="card nu-slot"><div class="card-title"><span>' + N().SLOT_NAMES[slot] + '</span>' +
        '<span class="small-text muted num">' + (slotMeals.length ? fmt(st.kcal) + ' kcal' : '') + '</span></div>';
      slotMeals.forEach(function (m, i) {
        h += '<div class="g-row" style="padding:7px 0' + (i ? ';border-top:1px solid var(--border)' : '') + '">' +
          '<span style="flex:1;min-width:0"><span class="small-text">' + U.esc(m.name || 'Meal') + '</span><br>' +
          '<span class="micro-label num">' + fmt(m.kcal) + ' kcal · P' + fmt(m.proteinG) +
          ' C' + fmt(m.carbsG) + ' F' + fmt(m.fatG) +
          (m.source === 'photo' ? ' · photo' : '') + '</span></span>' +
          '<button type="button" class="btn ghost small" data-act="meal-save-food" data-id="' + U.esc(m.id) + '" ' +
          'aria-label="Save to library">☆</button>' +
          '<button type="button" class="btn ghost small" data-act="meal-del" data-id="' + U.esc(m.id) + '">✕</button></div>';
      });

      if (addSlot === slot) {
        h += addSheetHTML(slot);
      } else {
        h += '<button type="button" class="btn ghost small" style="width:100%;margin-top:6px" ' +
          'data-act="add-open" data-slot="' + slot + '">+ Add</button>';
      }
      h += '</section>';

      if (draft && draftSlot === slot && !draftBusy) h += draftHTML();
      if (draftBusy && draftSlot === slot) {
        h += '<section class="card"><p class="small-text muted" style="margin:0">Reading the plate…</p></section>';
      }
    });

    h += '<input type="file" id="nu-file" accept="image/*" capture="environment" style="display:none">';

    /* ---- library manager ---- */
    h += '<section class="card"><div class="card-title"><span>Food library</span>' +
      '<button type="button" class="btn ghost small" data-act="library-toggle">' +
      (showLibrary ? 'Hide' : String(myFoods().length) + ' saved') + '</button></div>';
    if (showLibrary) {
      const foods = N().rankFoods(myFoods());
      if (!foods.length) {
        h += '<p class="small-text muted" style="margin:0">Empty. Tap ☆ on any logged meal to save it ' +
          'here — after two weeks most logging is two taps.</p>';
      }
      foods.forEach(function (f, i) {
        h += '<div class="g-row" style="padding:7px 0' + (i ? ';border-top:1px solid var(--border)' : '') + '">' +
          '<span style="flex:1;min-width:0"><span class="small-text">' + U.esc(f.name) + '</span><br>' +
          '<span class="micro-label num">' + fmt(f.kcal) + ' kcal · P' + fmt(f.proteinG) +
          ' · used ' + (f.uses || 0) + '×</span></span>' +
          '<button type="button" class="btn ghost small" data-act="food-del" data-id="' + U.esc(f.id) + '">✕</button></div>';
      });
    }
    h += '</section>';

    /* ---- targets ---- */
    h += '<section class="card"><div class="card-title"><span>Targets</span></div>' +
      '<div class="field"><label for="nu-rate">Goal</label>' +
      '<select class="select" id="nu-rate">' +
      '<option value="-0.5"' + (cfg.rateKgPerWeek === -0.5 ? ' selected' : '') + '>Cut · −0.5 kg/week</option>' +
      '<option value="-0.25"' + (cfg.rateKgPerWeek === -0.25 ? ' selected' : '') + '>Cut · −0.25 kg/week</option>' +
      '<option value="0"' + (!cfg.rateKgPerWeek ? ' selected' : '') + '>Maintain</option>' +
      '<option value="0.25"' + (cfg.rateKgPerWeek === 0.25 ? ' selected' : '') + '>Gain · +0.25 kg/week</option>' +
      '</select></div>' +
      '<div class="g-row" style="gap:8px;margin-top:10px">' +
      '<div class="field" style="flex:1"><label for="nu-kcal-override">Calorie target override</label>' +
      '<input class="input num" id="nu-kcal-override" type="number" inputmode="numeric" value="' +
      (cfg.kcalOverride || '') + '" placeholder="from burn"></div>' +
      '<div class="field" style="flex:1"><label for="nu-protein">Protein (g/day)</label>' +
      '<input class="input num" id="nu-protein" type="number" inputmode="numeric" value="' +
      (cfg.proteinG || '') + '" placeholder="' + (N().proteinTargetG(myWeights(), u.id) || '—') + '"></div></div>' +
      '<div class="btn-row" style="margin-top:10px">' +
      '<button type="button" class="btn small" data-act="save-targets">Save targets</button>' +
      '<button type="button" class="btn ghost small" data-act="disable">Turn off</button></div>' +
      '</section>';

    return h;
  }

  /* The per-slot add sheet: library first (two taps beats every camera),
     then yesterday, then the photo and the blank card. */
  function addSheetHTML(slot) {
    const d = vday();
    const y = U.addDays(d, -1);
    const yMeals = myMeals().filter(function (m) {
      return m.date === y && N().slotOf(m) === slot;
    });
    const foods = N().rankFoods(myFoods()).slice(0, 6);

    let h = '<div class="nu-add">';
    if (foods.length) {
      h += '<div class="micro-label" style="margin:8px 0 4px">From your library</div>';
      foods.forEach(function (f) {
        h += '<button type="button" class="nu-food" data-act="quick-log" data-id="' + U.esc(f.id) + '" data-slot="' + slot + '">' +
          '<span class="small-text" style="flex:1;text-align:left">' + U.esc(f.name) + '</span>' +
          '<span class="micro-label num">' + fmt(f.kcal) + '</span></button>';
      });
    }
    if (yMeals.length) {
      h += '<button type="button" class="btn ghost small" style="width:100%;margin-top:6px" ' +
        'data-act="copy-yesterday" data-slot="' + slot + '">Same as yesterday · ' +
        fmt(N().totals(yMeals).kcal) + ' kcal</button>';
    }
    h += '<div class="btn-row" style="margin-top:8px">' +
      '<button type="button" class="btn primary small" data-act="photo" data-slot="' + slot + '">Photo</button>' +
      '<button type="button" class="btn ghost small" data-act="manual" data-slot="' + slot + '">By hand</button>' +
      '<button type="button" class="btn ghost small" data-act="add-close">Close</button></div></div>';
    return h;
  }

  function draftHTML() {
    if (draft && !draft.ok) {
      return '<section class="card g-refuse"><div class="card-title"><span>No draft</span></div>' +
        '<p class="small-text" style="margin:0">' + U.esc(draft.reason || 'Something went wrong.') + '</p>' +
        '<div class="btn-row" style="margin-top:8px"><button type="button" class="btn ghost small" data-act="draft-reject">Dismiss</button></div></section>';
    }
    const dt = N().itemTotals(draft.items);
    let h = '<section class="card g-draft"><div class="card-title"><span>Draft — nothing saved yet</span>' +
      '<span class="chip g-chip ' + (draft.confidence === 'high' ? 'go' : draft.confidence === 'medium' ? 'warn' : 'stop') + '">' +
      draft.confidence + ' confidence</span></div>' +
      (draft.reply ? '<p class="small-text text-2" style="margin:0 0 8px">' + U.esc(draft.reply) + '</p>' : '');
    draft.items.forEach(function (it, i) {
      h += '<div class="g-row" style="gap:6px;padding:6px 0' + (i ? ';border-top:1px solid var(--border)' : '') + '">' +
        '<span style="flex:1.4;min-width:0"><span class="small-text">' + U.esc(it.name) + '</span><br>' +
        '<span class="micro-label">' + U.esc(it.portion) + '</span></span>' +
        '<input class="input num g-draft-kcal" data-i="' + i + '" type="number" inputmode="numeric" ' +
        'value="' + it.kcal + '" style="width:76px;padding:8px" aria-label="kcal for ' + U.esc(it.name) + '">' +
        '<button type="button" class="btn ghost small" data-act="draft-drop" data-i="' + i + '">✕</button></div>';
    });
    h += '<div class="g-row" style="margin-top:8px"><span class="small-text text-2">Draft total</span>' +
      '<span class="num small-text">' + fmt(dt.kcal) + ' kcal · P' + fmt(dt.proteinG) + '</span></div>' +
      '<div class="btn-row" style="margin-top:10px">' +
      '<button type="button" class="btn primary small" data-act="draft-accept">Accept</button>' +
      '<button type="button" class="btn small" data-act="draft-accept-save">Accept + ☆</button>' +
      '<button type="button" class="btn ghost small" data-act="draft-reject">Reject</button></div>' +
      '</section>';
    return h;
  }

  /* ======================================================================
     ENERGY — exercise and health data joined into one honest ledger
     ====================================================================== */

  /* The chart: intake as bars, burn as a line, training days marked from the
     workout log. Geometry here, every colour in styles.css. Incomplete days
     render muted — what happened is shown, what it means is not claimed. */
  function energyChartSVG(series) {
    const W = 340, H = 150, PADX = 8, TOP = 8, BASE = H - 22;
    const max = Math.max(1, Math.max.apply(null, series.map(function (d) {
      return Math.max(d.intake.kcal, d.burn || 0);
    })));
    const slotW = (W - 2 * PADX) / series.length;
    const barW = Math.max(6, slotW - 8);
    function Y(v) { return BASE - (v / max) * (BASE - TOP); }

    let bars = '', line = '', dots = '', marks = '', started = false;
    series.forEach(function (d, i) {
      const cx = PADX + slotW * i + slotW / 2;
      if (d.intake.meals > 0) {
        bars += '<rect class="bar' + (d.complete ? '' : ' na') + '" x="' + (cx - barW / 2).toFixed(1) +
          '" y="' + Y(d.intake.kcal).toFixed(1) + '" width="' + barW.toFixed(1) +
          '" height="' + (BASE - Y(d.intake.kcal)).toFixed(1) + '"/>';
      }
      if (d.burn !== null) {
        line += (started ? ' L' : 'M') + cx.toFixed(1) + ' ' + Y(d.burn).toFixed(1);
        started = true;
        dots += '<circle class="dot" cx="' + cx.toFixed(1) + '" cy="' + Y(d.burn).toFixed(1) + '" r="2.5"/>';
      } else {
        started = false; // a gap in burn is a gap in the line, not a bridge
      }
      if (d.trained) {
        marks += '<path class="tmark" d="M' + (cx - 4).toFixed(1) + ' ' + (H - 6) + ' L' +
          (cx + 4).toFixed(1) + ' ' + (H - 6) + ' L' + cx.toFixed(1) + ' ' + (H - 13) + ' Z"/>';
      }
    });

    return '<svg class="nu-echart" viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" ' +
      'role="img" aria-label="Fourteen days of intake bars against the burn line; triangles mark training days">' +
      '<line class="axis" x1="' + PADX + '" y1="' + BASE + '" x2="' + (W - PADX) + '" y2="' + BASE + '"/>' +
      bars + '<path class="burnline" d="' + line + '"/>' + dots + marks + '</svg>' +
      '<div class="g-row micro-label"><span>▮ intake</span><span>— burn</span><span>▲ trained (from your log)</span></div>';
  }

  function energyHTML() {
    const u = curUser();
    const t = today();
    const workouts = Store.state.workouts.filter(function (w) { return w.userId === u.id; });
    const series = N().energySeries(myMeals(), mySamples(), workouts, u.id, t);
    const split = N().trainingSplit(series);
    const completeN = series.filter(function (d) { return d.complete; }).length;

    let h = '';

    /* ---- the picture ---- */
    h += '<section class="card"><div class="card-title"><span>Last 14 days</span>' +
      '<span class="small-text muted num">' + completeN + ' complete</span></div>' +
      energyChartSVG(series);
    if (completeN < series.length) {
      h += '<p class="micro-label" style="margin:6px 0 0">Muted bars are incomplete days — intake ' +
        'without a full burn, or the reverse. They are drawn, never judged.</p>';
    }
    h += '</section>';

    /* ---- where the deficit lives ---- */
    h += '<section class="card"><div class="card-title"><span>Training days vs rest days</span></div>';
    if (split.state !== 'ok') {
      h += '<p class="small-text muted" style="margin:0">This comparison needs ' + N().SPLIT_MIN_DAYS +
        ' complete days of each kind in two weeks — it has ' + split.trainDays + ' training and ' +
        split.restDays + ' rest. Log meals and keep the health link delivering, and it will speak.</p>';
    } else {
      h += '<div class="tbl-scroll"><table class="nu-split"><tr><th></th>' +
        '<th class="num">Burn</th><th class="num">Eat</th><th class="num">Balance</th></tr>' +
        '<tr><td>Training · ' + split.train.n + 'd</td><td class="num">' + split.train.burn +
        '</td><td class="num">' + split.train.intake + '</td><td class="num' +
        (split.train.balance < 0 ? ' g-warn-text' : '') + '">' +
        (split.train.balance > 0 ? '+' : '') + split.train.balance + '</td></tr>' +
        '<tr><td>Rest · ' + split.rest.n + 'd</td><td class="num">' + split.rest.burn +
        '</td><td class="num">' + split.rest.intake + '</td><td class="num' +
        (split.rest.balance < 0 ? ' g-warn-text' : '') + '">' +
        (split.rest.balance > 0 ? '+' : '') + split.rest.balance + '</td></tr></table></div>';

      /* the finding, computed from the numbers on screen and nothing else */
      let finding;
      if (split.deltaBurn > 200 && split.deltaIntake < split.deltaBurn * 0.4) {
        finding = 'Your burn jumps +' + split.deltaBurn + ' kcal on training days but intake only moves ' +
          (split.deltaIntake >= 0 ? '+' : '') + split.deltaIntake +
          ' — THE DEFICIT LIVES ON TRAINING DAYS (' + split.train.balance + ' there vs ' +
          (split.rest.balance > 0 ? '+' : '') + split.rest.balance + ' at rest). ' +
          'If you fuel anywhere, fuel the sessions.';
      } else if (split.deltaBalance < -200) {
        finding = 'Training days run ' + Math.abs(split.deltaBalance) +
          ' kcal deeper than rest days even with intake moving — the gap is the sessions.';
      } else if (split.deltaBalance > 200) {
        finding = 'Rest days carry the deficit (' + (split.rest.balance) + ' vs ' +
          (split.train.balance > 0 ? '+' : '') + split.train.balance +
          ' on training days) — you eat with the work but not without it.';
      } else {
        finding = 'Intake tracks burn — the balance holds steady across both kinds of day.';
      }
      h += '<p class="small-text" style="margin:10px 0 0"><b>' + finding + '</b></p>';
    }
    h += '</section>';

    /* ---- the deficit flag and the scale, moved here with the analysis ---- */
    const calib = N().calibration(myMeals(), mySamples(), myWeights(), u.id, t);
    const flag = N().deficitFlag(myMeals(), mySamples(), workouts, u.id, t);

    if (flag.state === 'flag') {
      h += '<section class="card g-refuse"><div class="card-title"><span>Eating too little for this much training</span>' +
        '<span class="chip g-chip stop">' + flag.avgDeficit + ' kcal/day under</span></div>' +
        '<p class="small-text" style="margin:0">Two weeks averaging ' + flag.avgDeficit +
        ' kcal under across ' + flag.sessions + ' sessions. Injury and performance risk; no off ' +
        'switch, same as every guardrail. Fuel the work.</p></section>';
    }

    h += '<section class="card"><div class="card-title"><span>The scale as referee</span></div>';
    if (calib.state === 'insufficient') {
      h += '<p class="small-text muted" style="margin:0">The scale check needs ' + N().CALIB_MIN_DAYS +
        ' complete days in three weeks plus two weights; it has ' + calib.completeDays +
        '. Photo estimates are ±25–40% — this loop is what makes the weekly signal trustworthy anyway.</p>';
    } else {
      h += '<p class="small-text" style="margin:0 0 8px">Ledger predicted <b class="num">' + calib.predictedDeltaKg +
        ' kg</b>; the scale says <b class="num">' + calib.actualDeltaKg + ' kg</b>. Your numbers run ' +
        '<b class="num">' + Math.abs(calib.correctionKcalPerDay) + ' kcal/day ' +
        (calib.correctionKcalPerDay > 0 ? 'low' : 'high') + '</b>.</p>' +
        '<div class="g-row"><span class="small-text text-2">True daily balance ≈</span>' +
        '<span class="num small-text">' + (calib.correctedAvgBalance > 0 ? '+' : '') +
        calib.correctedAvgBalance + ' kcal</span></div>';
    }
    h += '</section>';

    return h;
  }

  /* ---------- the photo pipeline: downscale, send, drop ---------- */

  function handleFile(file) {
    if (!file) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = function () {
      try {
        const MAX = 1024;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        URL.revokeObjectURL(url);                    // the photo is gone
        const base64 = dataUrl.split(',')[1] || '';
        draftBusy = true;
        draft = null;
        App.rerender();
        N().analyzePhoto(base64, 'image/jpeg', '').then(function (res) {
          draftBusy = false;
          draft = res;
          App.rerender();
        });
      } catch (e) {
        URL.revokeObjectURL(url);
        draftBusy = false;
        draft = { ok: false, reason: 'Could not read that image.' };
        App.rerender();
      }
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      draft = { ok: false, reason: 'That file is not an image this browser can read.' };
      App.rerender();
    };
    img.src = url;
  }

  function acceptDraft(container, alsoSave) {
    if (!draft || !draft.items || !draft.items.length) { draft = null; App.rerender(); return; }
    container.querySelectorAll('.g-draft-kcal').forEach(function (inp) {
      const i = Number(inp.getAttribute('data-i'));
      if (draft.items[i]) draft.items[i].kcal = Math.max(0, Math.round(Number(inp.value) || 0));
    });
    const t = N().itemTotals(draft.items);
    const name = draft.items.map(function (it) { return it.name; }).slice(0, 3).join(', ');
    const meal = Store.addMeal({ date: vday(), slot: draftSlot,
      name: name, items: draft.items, kcal: t.kcal, proteinG: t.proteinG,
      carbsG: t.carbsG, fatG: t.fatG,
      source: draft.manual ? 'manual' : 'photo', confidence: draft.confidence });
    if (alsoSave && meal) {
      Store.addFood({ name: name, kcal: t.kcal, proteinG: t.proteinG, carbsG: t.carbsG, fatG: t.fatG });
    }
    draft = null;
    addSlot = null;
    App.toast(alsoSave ? 'Logged + saved to library' : 'Logged', 'ok');
    App.rerender();
  }

  /* ---------- wiring ---------- */

  function wire(container) {
    U.on(container, 'click', '[data-nutab]', function (e, el) {
      nuTab = el.getAttribute('data-nutab');
      addSlot = null;
      App.rerender();
    });
    U.on(container, 'click', '[data-day]', function (e, el) {
      viewDate = el.getAttribute('data-day');
      if (viewDate === today()) viewDate = null;
      addSlot = null;
      App.rerender();
    });
    U.on(container, 'click', '[data-act]', function (e, el) {
      const act = el.getAttribute('data-act');
      const id = el.getAttribute('data-id');
      const slot = el.getAttribute('data-slot');
      if (act === 'enable') { setNSettings({ enabled: true }); App.toast('Nutrition on — for this profile only', 'ok'); App.rerender(); }
      else if (act === 'disable') { setNSettings({ enabled: false }); App.rerender(); }
      else if (act === 'day-prev') { viewDate = U.addDays(vday(), -1); addSlot = null; App.rerender(); }
      else if (act === 'day-next') {
        const next = U.addDays(vday(), 1);
        if (N().canLogOn(next, today())) { viewDate = next === today() ? null : next; addSlot = null; App.rerender(); }
      }
      else if (act === 'add-open') { addSlot = slot; draft = null; App.rerender(); }
      else if (act === 'add-close') { addSlot = null; App.rerender(); }
      else if (act === 'photo') {
        draftSlot = slot || N().slotFor(new Date().getHours());
        const f = U.$('#nu-file', container);
        if (f) f.click();
      }
      else if (act === 'manual') {
        draftSlot = slot || N().slotFor(new Date().getHours());
        draft = { ok: true, reply: '', confidence: 'high',
          items: [{ name: 'Meal', portion: '', kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }],
          manual: true };
        addSlot = null;
        App.rerender();
        const first = container.querySelector('.g-draft-kcal');
        if (first) first.focus();
      }
      else if (act === 'quick-log') {
        const f = Store.state.foods.find(function (x) { return x.id === id; });
        if (!f) return;
        Store.addMeal({ date: vday(), slot: slot, name: f.name, items: [],
          kcal: f.kcal, proteinG: f.proteinG, carbsG: f.carbsG, fatG: f.fatG, source: 'manual' });
        Store.bumpFoodUse(f.id);
        addSlot = null;
        App.toast(f.name + ' — logged', 'ok');
        App.rerender();
      }
      else if (act === 'copy-yesterday') {
        const y = U.addDays(vday(), -1);
        const yMeals = myMeals().filter(function (m) {
          return m.date === y && N().slotOf(m) === slot;
        });
        yMeals.forEach(function (m) {
          Store.addMeal({ date: vday(), slot: slot, name: m.name, items: m.items,
            kcal: m.kcal, proteinG: m.proteinG, carbsG: m.carbsG, fatG: m.fatG, source: m.source });
        });
        addSlot = null;
        App.toast('Copied from yesterday', 'ok');
        App.rerender();
      }
      else if (act === 'draft-drop') {
        const i = Number(el.getAttribute('data-i'));
        if (draft && draft.items) { draft.items.splice(i, 1); App.rerender(); }
      }
      else if (act === 'draft-reject') { draft = null; App.rerender(); }
      else if (act === 'draft-accept') acceptDraft(container, false);
      else if (act === 'draft-accept-save') acceptDraft(container, true);
      else if (act === 'meal-save-food') {
        const m = Store.state.meals.find(function (x) { return x.id === id; });
        if (!m) return;
        Store.addFood({ name: m.name || 'Meal', kcal: m.kcal, proteinG: m.proteinG,
          carbsG: m.carbsG, fatG: m.fatG });
        App.toast('Saved to library', 'ok');
        App.rerender();
      }
      else if (act === 'meal-del') {
        if (el.getAttribute('data-armed')) { Store.deleteMeal(id); App.rerender(); }
        else { el.setAttribute('data-armed', '1'); el.textContent = 'Sure?'; }
      }
      else if (act === 'food-del') {
        if (el.getAttribute('data-armed')) { Store.deleteFood(id); App.rerender(); }
        else { el.setAttribute('data-armed', '1'); el.textContent = 'Sure?'; }
      }
      else if (act === 'library-toggle') { showLibrary = !showLibrary; App.rerender(); }
      else if (act === 'save-targets') {
        const rate = parseFloat((U.$('#nu-rate', container) || {}).value);
        const kcalO = parseInt((U.$('#nu-kcal-override', container) || {}).value, 10);
        const prot = parseInt((U.$('#nu-protein', container) || {}).value, 10);
        setNSettings({
          rateKgPerWeek: isFinite(rate) ? rate : 0,
          kcalOverride: isFinite(kcalO) && kcalO > 0 ? kcalO : null,
          proteinG: isFinite(prot) && prot > 0 ? prot : null
        });
        App.toast('Targets saved', 'ok');
        App.rerender();
      }
    });
    U.on(container, 'input', '.g-draft-kcal', function (e, el) {
      const i = Number(el.getAttribute('data-i'));
      if (draft && draft.items && draft.items[i]) {
        draft.items[i].kcal = Math.max(0, Math.round(Number(el.value) || 0));
      }
    });
    const file = U.$('#nu-file', container);
    if (file) {
      file.addEventListener('change', function () {
        handleFile(file.files && file.files[0]);
        file.value = '';
      });
    }
  }

  /* ======================================================================
     The Dashboard card — the pillar stands where you already look
     ====================================================================== */

  NutritionUI.dashCardHTML = function () {
    const u = curUser();
    if (!u || !window.Nutrition || !enabled()) return '';
    const t = today();
    const dayMeals = myMeals().filter(function (m) { return m.date === t; });
    const totals = N().totals(dayMeals);
    const cfg = nsettings();
    const tgt = N().kcalTarget(mySamples(), u.id, t, cfg);
    const proteinTarget = cfg.proteinG || N().proteinTargetG(myWeights(), u.id);

    let h = '<section class="card interactive" data-nu-dash><div class="card-title"><span>Nutrition</span>' +
      '<span class="small-text muted num">' + fmt(totals.kcal) + ' kcal in</span></div>';
    if (tgt.state === 'ok') {
      const remaining = tgt.target - totals.kcal;
      h += '<div class="g-row"><span class="small-text text-2">' +
        (remaining < 0 ? 'Over by' : 'Remaining') + '</span>' +
        '<span class="num" style="font-weight:600' + (remaining < 0 ? ';color:var(--orange)' : '') + '">' +
        fmt(Math.abs(remaining)) + ' kcal</span></div>' +
        '<div class="g-bar" style="margin-top:6px"><i style="width:' +
        Math.min(100, Math.round(totals.kcal / tgt.target * 100)) + '%"></i></div>';
    }
    if (proteinTarget) {
      h += '<div class="g-row" style="margin-top:6px"><span class="micro-label">Protein ' +
        fmt(totals.proteinG) + ' / ' + proteinTarget + ' g</span>' +
        '<span class="micro-label">tap to log</span></div>';
    }
    h += '</section>';
    return h;
  };

  NutritionUI.wireDash = function (container) {
    U.on(container, 'click', '[data-nu-dash]', function () {
      App.navigate('nutrition');
    });
  };

  window.NutritionUI = NutritionUI;

  App.registerView('nutrition', {
    title: 'Nutrition',
    icon: icon,
    nav: true,
    order: 47,
    render: render
  });
})();
