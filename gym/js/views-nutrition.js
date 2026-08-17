/* IronLog — views-nutrition.js (P8)
   The nutrition view: opt-in per profile, a photo that becomes an editable
   draft, first-class manual entry, and the Balance ledger with its
   weight-trend calibration and the deficit flag.

   Contracts held here:
     * OPT-IN. A profile that hasn't enabled nutrition sees an intro screen
       and never a calorie. The setting is per-user and syncs with the user.
     * THE MODEL HAS NO WRITE PATH. A photo produces a draft; every item is
       editable; nothing exists in the store until Accept.
     * PHOTOS ARE NEVER STORED. Downscaled in a canvas, sent, dropped.
     * WORKS KEYLESS. Manual entry, balance, calibration and the flag need
       no API. Only the photo button needs the coach key. */
(function () {
  'use strict';

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

  let draft = null;        // the editable proposal; NOT in the store
  let draftBusy = false;
  let draftNote = '';

  if (typeof window.addEventListener === 'function') {
    window.addEventListener('hashchange', function (e) {
      const to = String((e && e.newURL) || '').split('#')[1] || '';
      const from = String((e && e.oldURL) || '').split('#')[1] || '';
      if (to.indexOf('/nutrition') === 0 && from.indexOf('/nutrition') !== 0) {
        draft = null; draftBusy = false; draftNote = '';
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
      '<p>Log meals by photo or by hand, see intake against the burn your health ' +
      'link already delivers, and let your weight trend calibrate the estimates. ' +
      'Per profile: enabling it here enables it for you only.</p></div>' +
      '<button type="button" class="btn primary" style="width:100%;min-height:48px" data-act="enable">Turn on nutrition</button>';
  }

  function mainHTML() {
    const u = curUser();
    const t = today();
    const meals = myMeals().filter(function (m) { return m.date === t; })
      .sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
    const totals = N().totals(meals);
    const burn = N().dayBurn(mySamples(), u.id, t);
    const proteinTarget = nsettings().proteinG || N().proteinTargetG(myWeights(), u.id);

    let h = '<div class="view-head"><h2>Nutrition</h2>' +
      '<span class="small-text muted num">' + t + '</span></div>';

    /* ---- today ---- */
    h += '<section class="card"><div class="card-title"><span>Today</span>' +
      '<span class="small-text muted num">' + fmt(totals.kcal) + ' kcal in</span></div>';
    if (!meals.length) {
      h += '<p class="small-text muted" style="margin:0 0 10px">Nothing logged yet.</p>';
    }
    meals.forEach(function (m, i) {
      h += '<div class="g-row" style="padding:7px 0' + (i ? ';border-top:1px solid var(--border)' : '') + '">' +
        '<span style="flex:1;min-width:0"><span class="small-text">' + U.esc(m.name || 'Meal') + '</span><br>' +
        '<span class="micro-label num">' + fmt(m.kcal) + ' kcal · P' + fmt(m.proteinG) +
        ' C' + fmt(m.carbsG) + ' F' + fmt(m.fatG) +
        (m.source === 'photo' ? ' · photo' : '') + '</span></span>' +
        '<button type="button" class="btn ghost small" data-act="meal-del" data-id="' + U.esc(m.id) + '">✕</button></div>';
    });
    h += '<div class="g-row" style="margin-top:8px">' +
      '<span class="small-text text-2">Protein</span>' +
      '<span class="num small-text">' + fmt(totals.proteinG) +
      (proteinTarget ? ' / ' + proteinTarget : '') + ' g</span></div>';
    if (burn.burn !== null) {
      h += '<div class="g-row"><span class="small-text text-2">Burn (health link)</span>' +
        '<span class="num small-text">' + fmt(burn.burn) + ' kcal</span></div>' +
        '<div class="g-row"><span class="small-text text-2">Balance</span>' +
        '<span class="num small-text">' + (totals.kcal - burn.burn > 0 ? '+' : '') +
        fmt(totals.kcal - burn.burn) + ' kcal</span></div>';
    } else {
      h += '<p class="small-text muted" style="margin:8px 0 0">No full burn for today yet — ' +
        'balance needs both basal and active energy from the health link. Add ' +
        '<b>basal energy burned</b> to your Health Auto Export metrics.</p>';
    }
    h += '</section>';

    /* ---- add ---- */
    h += '<div class="btn-row">' +
      '<button type="button" class="btn primary" style="flex:1" data-act="photo">Photo a meal</button>' +
      '<button type="button" class="btn ghost" data-act="manual">By hand</button></div>' +
      '<input type="file" id="nu-file" accept="image/*" capture="environment" style="display:none">';

    /* ---- the draft ---- */
    if (draftBusy) {
      h += '<section class="card"><p class="small-text muted" style="margin:0">Reading the plate…</p></section>';
    } else if (draft && !draft.ok) {
      h += '<section class="card g-refuse"><div class="card-title"><span>No draft</span></div>' +
        '<p class="small-text" style="margin:0">' + U.esc(draft.reason || 'Something went wrong.') + '</p></section>';
    } else if (draft) {
      const dt = N().itemTotals(draft.items);
      h += '<section class="card g-draft"><div class="card-title"><span>Draft — nothing saved yet</span>' +
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
        '<button type="button" class="btn ghost small" data-act="draft-reject">Reject</button></div>' +
        '</section>';
    }

    /* ---- balance & calibration ---- */
    const calib = N().calibration(myMeals(), mySamples(), myWeights(), u.id, t);
    const flag = N().deficitFlag(myMeals(), mySamples(),
      Store.state.workouts.filter(function (w) { return w.userId === u.id; }), u.id, t);

    if (flag.state === 'flag') {
      h += '<section class="card g-refuse"><div class="card-title"><span>Eating too little for this much training</span>' +
        '<span class="chip g-chip stop">' + flag.avgDeficit + ' kcal/day under</span></div>' +
        '<p class="small-text" style="margin:0">Over the last two weeks you averaged a ' +
        flag.avgDeficit + ' kcal daily deficit across ' + flag.sessions + ' training sessions. ' +
        'That is an injury and performance risk, and this flag has no off switch — same as the ' +
        'ruck-ramp guardrail. Fuel the work.</p></section>';
    }

    h += '<section class="card"><div class="card-title"><span>Calibration</span></div>';
    if (calib.state === 'insufficient') {
      h += '<p class="small-text muted" style="margin:0">Not enough evidence yet — the scale check needs <b>' +
        N().CALIB_MIN_DAYS + ' complete days</b> (intake logged + full burn) in three weeks, plus two ' +
        'weights. It has ' + calib.completeDays + '. Photo estimates are honestly ±25–40%; this is ' +
        'what makes the weekly signal trustworthy anyway.</p>';
    } else {
      h += '<p class="small-text" style="margin:0 0 8px">Your ledger predicted <b class="num">' +
        calib.predictedDeltaKg + ' kg</b>; the scale says <b class="num">' + calib.actualDeltaKg +
        ' kg</b>. Your numbers run about <b class="num">' + Math.abs(calib.correctionKcalPerDay) +
        ' kcal/day ' + (calib.correctionKcalPerDay > 0 ? 'low' : 'high') + '</b>.</p>' +
        '<div class="g-row"><span class="small-text text-2">True daily balance ≈</span>' +
        '<span class="num small-text">' + (calib.correctedAvgBalance > 0 ? '+' : '') +
        calib.correctedAvgBalance + ' kcal</span></div>';
    }
    h += '</section>';

    /* ---- settings ---- */
    h += '<section class="card"><div class="card-title"><span>Targets</span></div>' +
      '<div class="g-row" style="gap:8px">' +
      '<div class="field" style="flex:1"><label for="nu-protein">Protein target (g/day)</label>' +
      '<input class="input num" id="nu-protein" type="number" inputmode="numeric" value="' +
      (nsettings().proteinG || '') + '" placeholder="' + (N().proteinTargetG(myWeights(), u.id) || '—') + '"></div>' +
      '<button type="button" class="btn ghost small" data-act="save-protein" style="align-self:flex-end;min-height:44px">Save</button></div>' +
      '<p class="small-text muted" style="margin:8px 0 0">Default is ' + N().PROTEIN_G_PER_KG +
      ' g/kg from your latest weight. This screen is yours alone — nutrition is off for every ' +
      'profile that hasn\'t turned it on.</p>' +
      '<div class="btn-row" style="margin-top:10px">' +
      '<button type="button" class="btn ghost small" data-act="disable">Turn nutrition off</button></div>' +
      '</section>';

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
        N().analyzePhoto(base64, 'image/jpeg', draftNote).then(function (res) {
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

  /* ---------- wiring ---------- */

  function wire(container) {
    U.on(container, 'click', '[data-act]', function (e, el) {
      const act = el.getAttribute('data-act');
      const id = el.getAttribute('data-id');
      if (act === 'enable') { setNSettings({ enabled: true }); App.toast('Nutrition on — for this profile only', 'ok'); App.rerender(); }
      else if (act === 'disable') { setNSettings({ enabled: false }); App.rerender(); }
      else if (act === 'photo') {
        const f = U.$('#nu-file', container);
        if (f) f.click();
      }
      else if (act === 'manual') {
        // A blank draft: the same editable card, human-authored from the start.
        draft = { ok: true, reply: '', confidence: 'high',
          items: [{ name: 'Meal', portion: '', kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }],
          manual: true };
        App.rerender();
        const first = container.querySelector('.g-draft-kcal');
        if (first) first.focus();
      }
      else if (act === 'draft-drop') {
        const i = Number(el.getAttribute('data-i'));
        if (draft && draft.items) { draft.items.splice(i, 1); App.rerender(); }
      }
      else if (act === 'draft-reject') { draft = null; App.rerender(); }
      else if (act === 'draft-accept') {
        if (!draft || !draft.items || !draft.items.length) { draft = null; App.rerender(); return; }
        // Pull any kcal edits out of the inputs before totalling.
        container.querySelectorAll('.g-draft-kcal').forEach(function (inp) {
          const i = Number(inp.getAttribute('data-i'));
          if (draft.items[i]) draft.items[i].kcal = Math.max(0, Math.round(Number(inp.value) || 0));
        });
        const t = N().itemTotals(draft.items);
        Store.addMeal({ date: today(),
          name: draft.items.map(function (it) { return it.name; }).slice(0, 3).join(', '),
          items: draft.items, kcal: t.kcal, proteinG: t.proteinG, carbsG: t.carbsG, fatG: t.fatG,
          source: draft.manual ? 'manual' : 'photo',
          confidence: draft.confidence });
        draft = null;
        App.toast('Logged', 'ok');
        App.rerender();
      }
      else if (act === 'meal-del') {
        if (el.getAttribute('data-armed')) { Store.deleteMeal(id); App.rerender(); }
        else { el.setAttribute('data-armed', '1'); el.textContent = 'Sure?'; }
      }
      else if (act === 'save-protein') {
        const v = parseInt((U.$('#nu-protein', container) || {}).value, 10);
        setNSettings({ proteinG: isFinite(v) && v > 0 ? v : null });
        App.toast('Target saved', 'ok');
        App.rerender();
      }
    });
    // Edits write through to the draft LIVE. Without this, any rerender
    // between typing and accepting (dropping an item, a sync tick) rebuilds
    // the card from the draft and silently eats the edit — the same failure
    // family as the capacity-warning form wipe, fixed the same way.
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

  App.registerView('nutrition', {
    title: 'Nutrition',
    icon: icon,
    nav: true,
    order: 47,
    render: render
  });
})();
