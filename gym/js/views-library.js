/* IronLog — Library view: ExRx-style exercise encyclopedia + detail sheets +
   custom exercise CRUD. Registers the 'library' view on App. Attaches no
   namespace of its own. */
(function () {
  'use strict';

  const DRAFT_KEY = 'ironlog/activeWorkout';

  /* ======================================================================
     Shared helpers
     ====================================================================== */

  function curUser() { return Store.currentUser(); }

  function readDraft() {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY));
      return d && typeof d === 'object' ? d : null;
    } catch (e) { return null; }
  }

  function writeDraft(d) {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); }
    catch (e) { /* storage full — draft simply not persisted */ }
  }

  function sizedIcon(svg, px) {
    return String(svg || '').replace('width="24" height="24"', 'width="' + px + '" height="' + px + '"');
  }

  function chevronHtml() {
    return sizedIcon(App.icons.chevron, 16).replace('<svg ', '<svg class="chevron" ');
  }

  function labelOf(list, id) {
    for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i].label;
    return id || '';
  }

  function muscleLabel(id) { return ExerciseDB.MUSCLE_LABEL[id] || id; }

  function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }

  function secHead(t) {
    return '<h4 style="margin:20px 0 8px;font-size:12px;font-weight:700;letter-spacing:.07em;' +
      'text-transform:uppercase;color:var(--text-muted)">' + U.esc(t) + '</h4>';
  }

  function badgeHtml(label, cls) {
    return '<span class="badge' + (cls ? ' ' + cls : '') + '">' + U.esc(label) + '</span>';
  }

  function mkSets() {
    const sets = [];
    for (let i = 0; i < 3; i++) sets.push({ weightKg: 0, reps: 0, type: 'work', rpe: null });
    return sets;
  }

  function newEntry(exerciseId) {
    return { id: U.uid('e'), exerciseId: exerciseId, notes: '', sets: mkSets() };
  }

  function newDraft(user, exerciseId) {
    const now = Date.now();
    return {
      id: U.uid('w'),
      userId: user.id,
      date: U.todayStr(),
      name: 'Workout',
      notes: '',
      startedAt: now,
      endedAt: null,
      durationMin: null,
      source: 'manual',
      createdAt: now,
      updatedAt: now,
      entries: [newEntry(exerciseId)]
    };
  }

  /* ======================================================================
     Filter state (survives rerenders within the session)
     ====================================================================== */

  const F = { q: '', muscle: null, equipment: null, category: null };
  let consumedMuscleParam = null; // so a stale ?muscle= param doesn't fight chip clicks

  function isFiltered() {
    return !!(F.q || F.muscle || F.equipment || F.category);
  }

  /* ======================================================================
     View registration
     ====================================================================== */

  App.registerView('library', {
    title: 'Library',
    icon: App.icons.library,
    nav: true,
    order: 35,
    render: renderLibrary
  });

  function renderLibrary(container, params) {
    // Honor deep links from the dashboard (#/library?muscle=chest) exactly once.
    if (params && params.muscle && params.muscle !== consumedMuscleParam) {
      consumedMuscleParam = params.muscle;
      if (ExerciseDB.MUSCLE_LABEL[params.muscle]) {
        F.muscle = params.muscle;
      }
    }

    container.innerHTML =
      '<div class="view-head"><h2>Library</h2></div>' +
      '<div id="lib-controls" style="position:sticky;' +
        'top:calc(var(--topbar-h) + env(safe-area-inset-top, 0px));z-index:20;' +
        'background:var(--bg);padding:6px 0 10px;">' +
        '<div class="searchbar">' + App.icons.search +
          '<input id="lib-search" class="input" type="search" ' +
            'placeholder="Search 250+ exercises" aria-label="Search exercises" ' +
            'autocomplete="off" value="' + U.esc(F.q) + '">' +
        '</div>' +
        chipRowHtml('muscle') +
        chipRowHtml('equipment') +
        chipRowHtml('category') +
      '</div>' +
      '<div id="lib-results" aria-live="polite"></div>' +
      '<button type="button" id="lib-add" class="btn ghost" ' +
        'style="width:100%;margin:14px 0 4px;justify-content:center;gap:8px;">' +
        sizedIcon(App.icons.plus, 18) + '<span>Create custom exercise</span></button>';

    updateChips(container);
    renderResults(container);

    // -------- events (delegated once per render; container is fresh) --------

    const search = U.$('#lib-search', container);
    const applySearch = U.debounce(function () {
      F.q = search.value.trim();
      updateChips(container); // just toggles the clear chip; chips are not rebuilt
      renderResults(container);
    }, 120);
    search.addEventListener('input', applySearch);

    U.on(container, 'click', '.chip[data-f]', function (e, chip) {
      const f = chip.getAttribute('data-f');
      const v = chip.getAttribute('data-v') || null;
      F[f] = (!v || F[f] === v) ? null : v;
      updateChips(container);
      renderResults(container);
    });

    U.on(container, 'click', '#lib-clear', function () {
      F.q = ''; F.muscle = null; F.equipment = null; F.category = null;
      const s = U.$('#lib-search', container);
      if (s) s.value = '';
      updateChips(container);
      renderResults(container);
    });

    U.on(container, 'click', '.list-row[data-ex]', function (e, row) {
      openDetail(row.getAttribute('data-ex'));
    });

    U.on(container, 'click', '#lib-add', function () { openCustomForm(null); });
  }

  /* ======================================================================
     Filter chips
     ====================================================================== */

  function chipRowHtml(kind) {
    let chips = '';
    if (kind === 'muscle') {
      // 'x clear' chip lives at the head of the first row; hidden until filtered
      chips += '<button type="button" id="lib-clear" class="chip" style="display:none;' +
        'color:var(--text-2);gap:4px;">' + sizedIcon(App.icons.close, 13) + ' clear</button>';
    }
    chips += '<button type="button" class="chip" data-f="' + kind + '" data-v="">All</button>';
    if (kind === 'muscle') {
      ExerciseDB.MUSCLES.forEach(function (m) {
        chips += '<button type="button" class="chip" data-f="muscle" data-v="' + U.esc(m.id) + '">' +
          U.esc(m.short) + '</button>';
      });
    } else if (kind === 'equipment') {
      ExerciseDB.EQUIPMENT.forEach(function (eq) {
        chips += '<button type="button" class="chip" data-f="equipment" data-v="' + U.esc(eq.id) + '">' +
          U.esc(eq.label) + '</button>';
      });
    } else {
      ExerciseDB.CATEGORIES.forEach(function (c) {
        chips += '<button type="button" class="chip" data-f="category" data-v="' + U.esc(c.id) + '">' +
          U.esc(c.label) + '</button>';
      });
    }
    return '<div class="chip-row" style="margin-top:8px;" role="group" aria-label="Filter by ' +
      kind + '">' + chips + '</div>';
  }

  function updateChips(container) {
    U.$$('.chip[data-f]', container).forEach(function (chip) {
      const f = chip.getAttribute('data-f');
      const v = chip.getAttribute('data-v') || null;
      const active = v ? F[f] === v : !F[f];
      chip.classList.toggle('active', active);
      chip.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    const clear = U.$('#lib-clear', container);
    if (clear) clear.style.display = isFiltered() ? '' : 'none';
  }

  /* ======================================================================
     Results list
     ====================================================================== */

  // exerciseId -> number of workouts of the current user containing it
  function loggedCounts() {
    const map = {};
    const u = curUser();
    if (!u) return map;
    const workouts = Store.workoutsFor(u.id);
    for (let i = 0; i < workouts.length; i++) {
      const seen = {};
      const entries = workouts[i].entries || [];
      for (let j = 0; j < entries.length; j++) {
        const id = entries[j].exerciseId;
        if (!id || seen[id]) continue;
        seen[id] = true;
        map[id] = (map[id] || 0) + 1;
      }
    }
    return map;
  }

  function rowHtml(ex, count) {
    const prim = (ex.primaryMuscles || []).map(muscleLabel).join(', ');
    const sub = (prim || '—') + ' · ' + labelOf(ExerciseDB.EQUIPMENT, ex.equipment);
    return '<button type="button" class="list-row" data-ex="' + U.esc(ex.id) + '">' +
      '<span class="body">' +
        '<span class="title">' + U.esc(ex.name) +
          (ex.custom ? ' <span class="badge green">Custom</span>' : '') + '</span>' +
        '<span class="sub">' + U.esc(sub) + '</span>' +
      '</span>' +
      '<span class="trailing">' +
        (count ? '<span style="font-size:12px;color:var(--text-muted);">logged ' + count + 'x</span>' : '') +
        chevronHtml() +
      '</span>' +
    '</button>';
  }

  function renderResults(container) {
    const el = U.$('#lib-results', container);
    if (!el) return;

    const list = ExerciseDB.search(F.q, {
      muscle: F.muscle,
      equipment: F.equipment,
      category: F.category
    });
    const counts = loggedCounts();

    let html = '<div style="font-size:13px;color:var(--text-muted);margin:2px 2px 8px;">' +
      list.length + ' exercise' + (list.length === 1 ? '' : 's') + '</div>';

    if (!list.length) {
      html += '<section class="card"><div class="empty">' + App.icons.search +
        '<h3>No exercises match</h3>' +
        '<p>Try a different search or clear the filters — or create a custom exercise below.</p>' +
        '</div></section>';
      el.innerHTML = html;
      return;
    }

    // Build all rows as a single HTML string — 250+ rows render in one paint.
    let rows = '';
    if (!isFiltered()) {
      // A–Z groups only for the untouched full list (search() returns it alphabetical)
      let letter = '';
      for (let i = 0; i < list.length; i++) {
        const ex = list[i];
        let l = (ex.name.charAt(0) || '#').toUpperCase();
        if (l < 'A' || l > 'Z') l = '#';
        if (l !== letter) {
          letter = l;
          rows += '<div style="padding:' + (i ? '16px' : '10px') + ' 16px 4px;font-size:12px;' +
            'font-weight:700;letter-spacing:.07em;color:var(--text-muted);">' + letter + '</div>';
        }
        rows += rowHtml(ex, counts[ex.id] || 0);
      }
    } else {
      for (let i = 0; i < list.length; i++) rows += rowHtml(list[i], counts[list[i].id] || 0);
    }
    html += '<section class="card" style="padding:4px 0;overflow:hidden;"><div class="list">' +
      rows + '</div></section>';
    el.innerHTML = html;
  }

  /* ======================================================================
     Exercise detail sheet
     ====================================================================== */

  function fmtSetShort(s, units) {
    return U.kgToDisplay(s.weightKg || 0, units) + 'x' + (s.reps || 0);
  }

  function openDetail(exId) {
    const ex = ExerciseDB.byId(exId);
    if (!ex) { App.toast('Exercise not found', 'err'); return; }

    const u = curUser();
    const units = App.units();
    const unitLbl = U.unitLabel(units);
    const workouts = u ? Store.workoutsFor(u.id) : [];
    const hist = Analytics.exerciseHistory(workouts, ex.id);

    // ---------- header badges (+ edit/delete for custom) ----------
    let html = '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">' +
      badgeHtml(labelOf(ExerciseDB.EQUIPMENT, ex.equipment)) +
      badgeHtml(labelOf(ExerciseDB.CATEGORIES, ex.category)) +
      badgeHtml(cap(ex.mechanics || 'compound')) +
      badgeHtml(cap(ex.level || 'beginner')) +
      (ex.custom
        ? '<span class="badge green">Custom</span>' +
          '<span style="margin-left:auto;display:flex;gap:6px;">' +
          '<button type="button" class="btn icon ghost" data-act="cx-edit" aria-label="Edit exercise" title="Edit">' +
            sizedIcon(App.icons.edit, 18) + '</button>' +
          '<button type="button" class="btn icon ghost" data-act="cx-del" aria-label="Delete exercise" title="Delete">' +
            sizedIcon(App.icons.trash, 18) + '</button></span>'
        : '') +
      '</div>';

    // ---------- muscle map ----------
    const values = {};
    (ex.primaryMuscles || []).forEach(function (m) { values[m] = 1; });
    (ex.secondaryMuscles || []).forEach(function (m) {
      if (values[m] === undefined) values[m] = 0.45;
    });
    const primNames = (ex.primaryMuscles || []).map(muscleLabel).join(', ');
    const secNames = (ex.secondaryMuscles || []).map(muscleLabel).join(', ');

    html += '<div class="ex-mm" style="margin-top:14px;"></div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;align-items:center;">' +
        '<span class="chip" style="pointer-events:none;gap:6px;">' +
          '<span style="width:10px;height:10px;border-radius:50%;background:' +
          MuscleMap.heatColor(1) + ';"></span>Primary</span>' +
        '<span class="chip" style="pointer-events:none;gap:6px;">' +
          '<span style="width:10px;height:10px;border-radius:50%;background:' +
          MuscleMap.heatColor(0.45) + ';"></span>Secondary</span>' +
      '</div>' +
      '<div style="font-size:12px;color:var(--text-muted);margin-top:8px;line-height:1.5;">' +
        (primNames ? '<strong style="color:var(--text-2);font-weight:600;">Primary:</strong> ' +
          U.esc(primNames) : '') +
        (secNames ? (primNames ? ' &nbsp;·&nbsp; ' : '') +
          '<strong style="color:var(--text-2);font-weight:600;">Secondary:</strong> ' +
          U.esc(secNames) : '') +
      '</div>';

    // ---------- how to + tips ----------
    if ((ex.instructions || []).length) {
      html += secHead('How to') +
        '<ol style="margin:0;padding-left:22px;display:flex;flex-direction:column;gap:8px;' +
          'font-size:14px;line-height:1.55;color:var(--text-2);">' +
        ex.instructions.map(function (s) { return '<li>' + U.esc(s) + '</li>'; }).join('') +
        '</ol>';
    }
    if ((ex.tips || []).length) {
      html += secHead('Tips') +
        '<ul style="margin:0;padding-left:22px;display:flex;flex-direction:column;gap:6px;' +
          'font-size:14px;line-height:1.55;color:var(--text-2);">' +
        ex.tips.map(function (s) { return '<li>' + U.esc(s) + '</li>'; }).join('') +
        '</ul>';
    }

    // ---------- your history ----------
    html += secHead('Your history');
    if (!hist.length) {
      html += '<div class="empty" style="padding:22px 16px;">' + App.icons.log +
        '<h3>You haven’t logged this yet</h3>' +
        '<p>Sets you log for this exercise will show up here with your strength trend.</p></div>';
    } else {
      let bestE1 = 0, topW = 0, totalSets = 0;
      for (let i = 0; i < hist.length; i++) {
        if (hist[i].e1rm > bestE1) bestE1 = hist[i].e1rm;
        if (hist[i].topWeightKg > topW) topW = hist[i].topWeightKg;
        totalSets += hist[i].sets;
      }
      const lastDone = U.relDate(hist[hist.length - 1].date);
      html += '<div class="stat-grid">' +
        '<div class="stat"><div class="label">Best e1RM</div><div class="value">' +
          U.fmtNum(U.kgToDisplay(bestE1, units)) + ' <span class="unit">' + unitLbl + '</span></div></div>' +
        '<div class="stat"><div class="label">Top weight</div><div class="value">' +
          U.fmtNum(U.kgToDisplay(topW, units)) + ' <span class="unit">' + unitLbl + '</span></div></div>' +
        '<div class="stat"><div class="label">Total sets</div><div class="value">' +
          U.fmtNum(totalSets) + '</div></div>' +
        '<div class="stat"><div class="label">Last done</div><div class="value" style="font-size:17px;">' +
          U.esc(lastDone) + '</div></div>' +
        '</div>';

      if (hist.length >= 2) {
        html += '<div style="margin-top:12px;">' +
          '<div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">e1RM trend</div>' +
          '<div class="ex-spark"></div></div>';
      }

      const recent = hist.slice(-3).reverse();
      let lines = '';
      for (let i = 0; i < recent.length; i++) {
        const r = recent[i];
        const w = Store.workoutById(r.workoutId);
        const sets = [];
        if (w) {
          (w.entries || []).forEach(function (en) {
            if (en.exerciseId !== ex.id) return;
            (en.sets || []).forEach(function (s) {
              if (s.type !== 'warmup') sets.push(fmtSetShort(s, units));
            });
          });
        }
        lines += '<div style="padding:7px 0;font-size:13px;color:var(--text-2);' +
          'font-variant-numeric:tabular-nums;' +
          (i ? 'border-top:1px solid var(--border);' : '') + '">' +
          '<span style="color:var(--text);font-weight:500;">' + U.esc(U.fmtDate(r.date)) + '</span>' +
          ' · ' + U.esc(sets.length ? sets.join(', ') : 'no work sets') + '</div>';
      }
      html += '<div style="margin-top:10px;">' + lines + '</div>';
    }

    const content = U.el('<div>' + html + '</div>');

    // ---------- action: add to draft / start a workout ----------
    const draft = readDraft();
    const hasMyDraft = !!(draft && u && draft.userId === u.id);

    const sheet = App.sheet({
      title: ex.name,
      content: content,
      actions: [{
        label: hasMyDraft ? 'Add to current workout' : 'Start workout with this',
        kind: 'primary',
        keepOpen: true, // we close manually (confirm flow is async)
        onClick: function (api) { addToWorkoutAction(ex, api); }
      }]
    });

    // Render map + spark now that the content element is in the DOM.
    MuscleMap.render(U.$('.ex-mm', content), { values: values });
    const sparkEl = U.$('.ex-spark', content);
    if (sparkEl) {
      Charts.spark(sparkEl, {
        points: hist.map(function (r) {
          return { x: r.date, y: U.kgToDisplay(r.e1rm, units) };
        }),
        color: Charts.SERIES[0]
      });
    }

    // ---------- custom exercise edit/delete ----------
    if (ex.custom) {
      U.on(content, 'click', '[data-act="cx-edit"]', function () {
        sheet.close();
        openCustomForm(ex);
      });
      U.on(content, 'click', '[data-act="cx-del"]', function () {
        App.confirm({
          title: 'Delete exercise?',
          message: '"' + ex.name + '" will be removed from your library. Workouts you already ' +
            'logged keep their history for it, so past stats stay intact.',
          danger: true,
          confirmLabel: 'Delete'
        }).then(function (ok) {
          if (!ok) return;
          Store.deleteCustomExercise(ex.id);
          sheet.close();
          App.toast('Exercise deleted', 'ok');
        });
      });
    }
  }

  function addToWorkoutAction(ex, api) {
    const u = curUser();
    if (!u) { App.toast('Create a profile first', 'err'); return; }
    const d = readDraft();

    if (d && d.userId === u.id) {
      d.entries = Array.isArray(d.entries) ? d.entries : [];
      d.entries.push(newEntry(ex.id));
      d.updatedAt = Date.now();
      writeDraft(d);
      App.toast('Added ' + ex.name + ' to your workout', 'ok');
      api.close();
      App.navigate('log');
      return;
    }

    const start = function () {
      writeDraft(newDraft(u, ex.id));
      App.toast('Workout started with ' + ex.name, 'ok');
      api.close();
      App.navigate('log');
    };

    if (d && d.userId && d.userId !== u.id) {
      // The single draft slot holds another profile's unfinished workout.
      App.confirm({
        title: 'Replace workout in progress?',
        message: 'Another profile has an unfinished workout draft. Starting a new workout will discard it.',
        danger: true,
        confirmLabel: 'Start new workout'
      }).then(function (ok) { if (ok) start(); });
    } else {
      start();
    }
  }

  /* ======================================================================
     Custom exercise create / edit form
     ====================================================================== */

  function muscleChipsHtml(group, selectedIds) {
    const sel = selectedIds || [];
    return ExerciseDB.MUSCLES.map(function (m) {
      const on = sel.indexOf(m.id) >= 0;
      return '<button type="button" class="chip' + (on ? ' active' : '') + '" data-mg="' + group +
        '" data-m="' + U.esc(m.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
        U.esc(m.short) + '</button>';
    }).join('');
  }

  function optionsHtml(list, selected) {
    return list.map(function (o) {
      return '<option value="' + U.esc(o.id) + '"' + (o.id === selected ? ' selected' : '') + '>' +
        U.esc(o.label) + '</option>';
    }).join('');
  }

  function openCustomForm(existing) {
    const isEdit = !!existing;
    const mech = existing ? existing.mechanics : 'compound';

    const html =
      '<div class="field">' +
        '<label for="cx-name">Name</label>' +
        '<input id="cx-name" class="input" type="text" maxlength="80" ' +
          'placeholder="e.g. Banded Face Pull" value="' + U.esc(existing ? existing.name : '') + '">' +
      '</div>' +
      '<div class="field" style="margin-top:12px;">' +
        '<label>Primary muscles</label>' +
        '<div class="chip-row" style="flex-wrap:wrap;overflow:visible;" role="group" ' +
          'aria-label="Primary muscles">' +
          muscleChipsHtml('primary', existing ? existing.primaryMuscles : []) + '</div>' +
        '<div class="hint">Pick at least one</div>' +
      '</div>' +
      '<div class="field" style="margin-top:12px;">' +
        '<label>Secondary muscles <span style="color:var(--text-muted);font-weight:400;">(optional)</span></label>' +
        '<div class="chip-row" style="flex-wrap:wrap;overflow:visible;" role="group" ' +
          'aria-label="Secondary muscles">' +
          muscleChipsHtml('secondary', existing ? existing.secondaryMuscles : []) + '</div>' +
      '</div>' +
      '<div class="field-row" style="margin-top:12px;">' +
        '<div class="field">' +
          '<label for="cx-equip">Equipment</label>' +
          '<select id="cx-equip" class="select">' +
            optionsHtml(ExerciseDB.EQUIPMENT, existing ? existing.equipment : 'dumbbell') + '</select>' +
        '</div>' +
        '<div class="field">' +
          '<label for="cx-cat">Category</label>' +
          '<select id="cx-cat" class="select">' +
            optionsHtml(ExerciseDB.CATEGORIES, existing ? existing.category : 'push') + '</select>' +
        '</div>' +
      '</div>' +
      '<div class="field" style="margin-top:12px;">' +
        '<label>Mechanics</label>' +
        '<div class="segmented" id="cx-mech">' +
          '<button type="button" data-v="compound" class="' + (mech !== 'isolation' ? 'active' : '') + '">Compound</button>' +
          '<button type="button" data-v="isolation" class="' + (mech === 'isolation' ? 'active' : '') + '">Isolation</button>' +
        '</div>' +
      '</div>' +
      '<div class="field" style="margin-top:12px;">' +
        '<label for="cx-steps">How to — one step per line (2–4 steps)</label>' +
        '<textarea id="cx-steps" class="input" rows="4" ' +
          'placeholder="Set up with…&#10;Then…">' +
          U.esc(existing ? (existing.instructions || []).join('\n') : '') + '</textarea>' +
      '</div>';

    const content = U.el('<div>' + html + '</div>');

    U.on(content, 'click', '.chip[data-mg]', function (e, chip) {
      const on = chip.classList.toggle('active');
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    U.on(content, 'click', '#cx-mech > button', function (e, btn) {
      U.$$('#cx-mech > button', content).forEach(function (b) {
        b.classList.toggle('active', b === btn);
      });
    });

    App.sheet({
      title: isEdit ? 'Edit custom exercise' : 'Create custom exercise',
      content: content,
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        {
          label: isEdit ? 'Save changes' : 'Create exercise',
          kind: 'primary',
          keepOpen: true,
          onClick: function (api) { saveCustomForm(content, existing, api); }
        }
      ]
    });
  }

  function selectedMuscles(content, group) {
    return U.$$('.chip[data-mg="' + group + '"].active', content).map(function (c) {
      return c.getAttribute('data-m');
    });
  }

  function saveCustomForm(content, existing, api) {
    const name = (U.$('#cx-name', content).value || '').trim();
    if (!name) { App.toast('Name is required', 'err'); return; }

    const primary = selectedMuscles(content, 'primary');
    if (!primary.length) { App.toast('Pick at least one primary muscle', 'err'); return; }
    const secondary = selectedMuscles(content, 'secondary').filter(function (m) {
      return primary.indexOf(m) < 0;
    });

    const steps = (U.$('#cx-steps', content).value || '').split('\n')
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return !!s; });
    if (steps.length < 2) { App.toast('Add at least 2 instruction steps (one per line)', 'err'); return; }

    const mechBtn = U.$('#cx-mech > button.active', content);
    const patch = {
      name: name,
      primaryMuscles: primary,
      secondaryMuscles: secondary,
      equipment: U.$('#cx-equip', content).value,
      category: U.$('#cx-cat', content).value,
      mechanics: mechBtn && mechBtn.getAttribute('data-v') === 'isolation' ? 'isolation' : 'compound',
      instructions: steps
    };

    let id;
    if (existing) {
      Store.updateCustomExercise(existing.id, patch);
      id = existing.id;
      App.toast('Exercise updated', 'ok');
    } else {
      const ex = Store.addCustomExercise(patch);
      id = ex.id;
      App.toast('Exercise created', 'ok');
    }
    api.close();
    openDetail(id);
  }
})();
