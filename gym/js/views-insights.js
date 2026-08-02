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
     v2 (Capability P1) helpers — typed workouts, guardrails, pain log
     ====================================================================== */

  const KM_PER_MILE = 1.609344;

  // Pain regions beyond the 18 canonical muscles: lower-leg spots that are not
  // on the muscle map get chip pickers instead.
  const EXTRA_REGIONS = [
    { id: 'shin_l', label: 'Left shin' }, { id: 'shin_r', label: 'Right shin' },
    { id: 'knee_l', label: 'Left knee' }, { id: 'knee_r', label: 'Right knee' },
    { id: 'ankle_l', label: 'Left ankle' }, { id: 'ankle_r', label: 'Right ankle' },
    { id: 'foot_l', label: 'Left foot' }, { id: 'foot_r', label: 'Right foot' }
  ];
  const EXTRA_REGION_LABEL = {};
  EXTRA_REGIONS.forEach(function (r) { EXTRA_REGION_LABEL[r.id] = r.label; });

  function regionLabel(id) {
    return EXTRA_REGION_LABEL[id] || ExerciseDB.MUSCLE_LABEL[id] || id;
  }

  // Distance in the viewer's units ('lb' users think in miles).
  function fmtDistKm(km) {
    if (window.Guardrails && Guardrails.fmtDistanceKm) {
      return Guardrails.fmtDistanceKm(km, App.units());
    }
    return U.round1(km || 0) + ' km';
  }

  function paceStr(durMin, distKm) {
    if (!(durMin > 0) || !(distKm > 0)) return '';
    const units = App.units();
    const per = units === 'lb' ? durMin / (distKm / KM_PER_MILE) : durMin / distKm;
    if (!isFinite(per) || per <= 0) return '';
    let m = Math.floor(per);
    let s = Math.round((per - m) * 60);
    if (s === 60) { m += 1; s = 0; }
    return m + ':' + String(s).padStart(2, '0') + (units === 'lb' ? ' /mi' : ' /km');
  }

  const CARDIO_LABEL = {
    run: 'Run', ruck: 'Ruck', swim: 'Swim', bike: 'Bike', row: 'Row',
    stairs: 'Stairs', circuit: 'Circuit'
  };
  const PROTOCOL_LABEL = {
    acft: 'ACFT', run2mi: '2-mile run', run5mi: '5-mile run', ruck12mi: '12-mile ruck',
    pushups2min: 'Push-ups (2 min)', situps2min: 'Sit-ups (2 min)',
    pullups_max: 'Max pull-ups', plank: 'Plank', swim500m: '500 m swim',
    slcalf_l: 'Single-leg calf raises (L)', slcalf_r: 'Single-leg calf raises (R)',
    deadhang: 'Dead hang'
  };

  function typedEntries(w) {
    return ((w && w.entries) || []).filter(function (e) {
      return e && e.type && e.type !== 'lift';
    });
  }

  function workoutKind(w) {
    if (w && typeof w.kind === 'string' && w.kind) return w.kind;
    const kinds = {};
    let n = 0;
    for (const e of (w && w.entries) || []) {
      if (!e) continue;
      const k = !e.type || e.type === 'lift' ? 'lift'
        : e.type === 'cardio' ? (e.mode || 'run') : e.type;
      if (!kinds[k]) { kinds[k] = 1; n++; }
    }
    if (n === 0) return 'lift';
    if (n === 1) return Object.keys(kinds)[0];
    return 'mixed';
  }

  function kindIcon(kind) {
    const ic = App.icons;
    const map = {
      run: ic.run, ruck: ic.ruck, swim: ic.swim, bike: ic.bike, row: ic.row,
      stairs: ic.stairs, circuit: ic.flame, mobility: ic.stretch,
      durability: ic.shield, setwork: ic.shield, test: ic.clipboard
    };
    return map[kind] || ic.log;
  }

  // P3: is a setwork entry a stretch? Mirrors views-log's swIsStretch —
  // method is stretch-only, else the exercise's setShape. Guarded so the
  // dashboard never crashes when ExerciseDB failed to load.
  function setworkIsStretch(e) {
    if (e && e.method) return true;
    const db = window.ExerciseDB;
    const ex = db && db.byId ? db.byId(e && e.exerciseRef) : null;
    return !!(ex && ex.setShape === 'stretch');
  }

  // P3: setwork workouts pick their glyph by majority exercise category —
  // mobility-heavy sessions read as stretch, everything else as durability
  // (same rule as views-log's workoutGlyphKind).
  function workoutGlyphKind(w) {
    const k = workoutKind(w);
    if (k !== 'setwork') return k;
    let mob = 0;
    let oth = 0;
    for (const e of (w && w.entries) || []) {
      if (!e || e.type !== 'setwork') continue;
      if (setworkIsStretch(e)) mob++;
      else oth++;
    }
    return mob >= oth && mob > 0 ? 'mobility' : 'durability';
  }

  // Kind-appropriate one-line summary for the typed (non-lift) part of a
  // workout: cardio -> distance · pace · load; mobility -> duration · areas;
  // durability -> duration · drills; test -> protocol; setwork (P3) ->
  // 'N stretches · duration · areas' | 'N drills · M sets'.
  function typedSummary(w) {
    const typed = typedEntries(w);
    const parts = [];
    const cardioEs = typed.filter(function (e) { return e.type === 'cardio'; });
    if (cardioEs.length) {
      const e = cardioEs[0];
      parts.push(CARDIO_LABEL[e.mode] || 'Cardio');
      if (typeof e.distanceKm === 'number' && e.distanceKm > 0) parts.push(fmtDistKm(e.distanceKm));
      const pace = paceStr(e.durationMin, e.distanceKm);
      if (pace) parts.push(pace);
      if (e.mode === 'ruck') {
        const load = typeof e.loadKgTotal === 'number' && e.loadKgTotal > 0 ? e.loadKgTotal
          : typeof e.loadKgDry === 'number' && e.loadKgDry > 0 ? e.loadKgDry : 0;
        if (load) parts.push('@ ' + App.fmtWeight(load));
      }
      if (!pace && typeof e.durationMin === 'number' && e.durationMin > 0) {
        parts.push(U.fmtDuration(e.durationMin));
      }
      if (cardioEs.length > 1) parts.push('+' + (cardioEs.length - 1) + ' more');
      return parts.join(' · ');
    }
    const mob = typed.filter(function (e) { return e.type === 'mobility'; })[0];
    if (mob) {
      parts.push('Mobility');
      if (mob.durationMin > 0) parts.push(U.fmtDuration(mob.durationMin));
      const areas = (mob.targetMuscles || []).slice(0, 3).map(muscleLabel);
      if (areas.length) parts.push(areas.join(', '));
      return parts.join(' · ');
    }
    const dur = typed.filter(function (e) { return e.type === 'durability'; })[0];
    if (dur) {
      parts.push('Durability');
      if (dur.durationMin > 0) parts.push(U.fmtDuration(dur.durationMin));
      const nItems = (dur.items || []).length;
      if (nItems) parts.push(nItems + (nItems === 1 ? ' drill' : ' drills'));
      return parts.join(' · ');
    }
    const test = typed.filter(function (e) { return e.type === 'test'; })[0];
    if (test) {
      parts.push('Test');
      parts.push(PROTOCOL_LABEL[test.protocol] || String(test.protocol || 'protocol'));
      if (typeof test.score === 'number' && isFinite(test.score)) parts.push('score ' + test.score);
      return parts.join(' · ');
    }
    // P3 setwork aggregates like the History summaries: 'N stretches ·
    // duration · areas' when stretches are the majority, else 'N drills ·
    // M sets'. Valid set = reps>0||holdSec>0||distanceM>0 (setwork rule,
    // never the lift filter). Area labels need ExerciseDB; skipped without it.
    const sw = typed.filter(function (e) { return e.type === 'setwork'; });
    if (sw.length) {
      const db = window.ExerciseDB;
      const refs = {};
      const areaCounts = {};
      let sets = 0;
      let mob = 0;
      let oth = 0;
      sw.forEach(function (e) {
        refs[e.exerciseRef || ''] = true;
        const stretch = setworkIsStretch(e);
        if (stretch) mob++;
        else oth++;
        const valid = (e.sets || []).filter(function (s) {
          return !!s && ((Number(s.reps) || 0) > 0 ||
            (Number(s.holdSec) || 0) > 0 || (Number(s.distanceM) || 0) > 0);
        }).length;
        sets += valid;
        if (stretch && db && db.byId) {
          const ex = db.byId(e.exerciseRef);
          ((ex && ex.primaryMuscles) || []).forEach(function (m) {
            areaCounts[m] = (areaCounts[m] || 0) + Math.max(valid, 1);
          });
        }
      });
      const n = Object.keys(refs).length;
      if (mob >= oth && mob > 0) {
        parts.push(n + (n === 1 ? ' stretch' : ' stretches'));
        if (typeof w.durationMin === 'number' && w.durationMin > 0) {
          parts.push(U.fmtDuration(w.durationMin));
        }
        const top = Object.keys(areaCounts).sort(function (a, b) {
          return areaCounts[b] - areaCounts[a];
        }).slice(0, 2).map(function (m) { return muscleLabel(m).toLowerCase(); });
        if (top.length) parts.push(top.join(', '));
      } else {
        parts.push(n + (n === 1 ? ' drill' : ' drills'));
        if (sets) parts.push(sets + (sets === 1 ? ' set' : ' sets'));
      }
      return parts.join(' · ');
    }
    // Unknown entry types pass through the store verbatim — count, don't guess.
    return typed.length + (typed.length === 1 ? ' activity' : ' activities');
  }

  // Calendar heat blend (v2 cross-type semantics): a workout heats by lift
  // volume when it has any, else by time. CAL_KG_PER_MIN = 40 maps minutes
  // onto the kg scale the heat ramp already uses — a 45-min no-lift session
  // (run, ruck, mobility, imported cardio) heats like a ~1,800 kg lift day,
  // i.e. a light-but-real training day.
  const CAL_KG_PER_MIN = 40;

  function blendedCalendar(workouts, days) {
    const n = Math.max(1, days | 0);
    const today = U.todayStr();
    const start = U.addDays(today, -(n - 1));
    const out = {};
    for (let i = 0; i < n; i++) out[U.addDays(start, i)] = 0;
    for (const w of workouts || []) {
      if (!w || !w.date || w.date < start || w.date > today) continue;
      const vol = Analytics.workoutVolume(w);
      const durMin = typeof w.durationMin === 'number' && isFinite(w.durationMin) && w.durationMin > 0
        ? w.durationMin : 0;
      out[w.date] += vol > 0 ? vol : durMin * CAL_KG_PER_MIN;
    }
    for (const d in out) out[d] = U.round1(out[d]);
    return out;
  }

  /* ---------- readiness snapshot (P2, performance mode) ---------- */

  // Compact single-value ring in the Charts.rings visual language (track at
  // 12% opacity, round cap, -90° start) with the percentage in the center.
  function readinessRingSvg(pct, color) {
    const R = 34;
    const C = Math.round(2 * Math.PI * R * 10) / 10;
    const off = Math.round(C * (1 - U.clamp(pct, 0, 100) / 100) * 10) / 10;
    return '<svg viewBox="0 0 84 84" width="84" height="84" role="img" ' +
      'aria-label="Overall readiness ' + pct + '%" style="flex:none">' +
      '<circle cx="42" cy="42" r="' + R + '" fill="none" stroke="' + color +
        '" stroke-opacity=".12" stroke-width="10"/>' +
      '<circle cx="42" cy="42" r="' + R + '" fill="none" stroke="' + color +
        '" stroke-width="10" stroke-linecap="round" stroke-dasharray="' + C +
        '" stroke-dashoffset="' + off + '" transform="rotate(-90 42 42)"/>' +
      '<text x="42" y="48" text-anchor="middle" style="font-size:19px;font-weight:700;' +
        'fill:var(--text)">' + pct + '%</text></svg>';
  }

  // Dashboard readiness snapshot card. Returns '' unless Protocols is loaded
  // and produced rows — the dashboard must never crash on a bad load order.
  function readinessCardHTML(u, w) {
    if (typeof Protocols === 'undefined' || !Protocols || !Protocols.readiness) return '';
    let rd = null;
    try {
      rd = Protocols.readiness(u, { workouts: w, bodyMetrics: Store.bodyMetricsFor(u.id, 'weightKg') });
    } catch (e) { rd = null; }
    if (!rd || !Array.isArray(rd.rows) || !rd.rows.length) return '';
    const pct = Math.round(U.clamp(rd.overallPct || 0, 0, 1) * 100);
    const anyTested = rd.rows.some(function (r) {
      return r.current !== null && r.current !== undefined;
    });
    const weakRow = rd.weakest
      ? rd.rows.filter(function (r) { return r.protocolId === rd.weakest; })[0]
      : null;
    let weakLine = '';
    if (!anyTested) {
      weakLine = 'No tests recorded yet — record one to see where you stand.';
    } else if (weakRow) {
      let cur = '', target = '';
      try {
        cur = Protocols.fmtValue(weakRow.protocolId, weakRow.current, App.units());
        target = Protocols.fmtValue(weakRow.protocolId, weakRow.competitive, App.units());
      } catch (e) { /* formatting is cosmetic */ }
      weakLine = 'Weakest link: ' + weakRow.name +
        (cur ? ' — ' + cur : '') + (target ? ' vs ' + target + ' target' : '');
    }
    let html = cardOpen('Readiness',
      '<button type="button" class="btn ghost small" data-act="go-standards">Standards</button>');
    html += '<div style="display:flex;align-items:center;gap:16px;margin-top:4px">' +
      readinessRingSvg(pct, Charts.SERIES[0]) +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-size:14px;font-weight:600">' + pct + '% of the way to competitive</div>' +
        (weakLine
          ? '<div style="font-size:13px;color:var(--text-2);margin-top:4px;line-height:1.5">' +
            U.esc(weakLine) + '</div>'
          : '') +
      '</div></div>';
    html += '</section>';
    return html;
  }

  /* ---------- durability coverage (P3, performance mode) ----------
     Derived weekly coverage card — no self-reported checkboxes. Set counts
     come from Guardrails.weeklyStatus().durability (the read-time union of
     lift work sets, setwork valid sets and legacy checklist ticks); this file
     only adds the contributing exercise names, which are display-only. */

  const DUR_SLOTS = [
    { id: 'unilateral', label: 'Single-leg', nudge: 'split squats or step-downs' },
    { id: 'calf_tib', label: 'Calves & shins', nudge: 'calf raises or tib raises' },
    { id: 'grip', label: 'Grip', nudge: 'a dead hang or farmer carry' },
    { id: 'core', label: 'Core', nudge: 'side planks or Pallof presses' }
  ];
  const DUR_TARGET_FALLBACK = { unilateral: 6, calf_tib: 4, grip: 3, core: 4 };

  function validSetworkSet(s) {
    return !!s && ((typeof s.reps === 'number' && s.reps > 0) ||
      (typeof s.holdSec === 'number' && s.holdSec > 0) ||
      (typeof s.distanceM === 'number' && s.distanceM > 0));
  }

  // Contributing exercise names per slot for the Mon-Sun week starting ws —
  // same three sources as the Guardrails count, names only (counts stay
  // authoritative from weeklyStatus).
  function durabilitySlotNames(workouts, ws) {
    const names = { unilateral: [], calf_tib: [], grip: [], core: [] };
    const db = window.ExerciseDB;
    const list = db && Array.isArray(db.DURABILITY_CHECKLIST) ? db.DURABILITY_CHECKLIST : [];
    if (!list.length) return names;
    const slotOf = {};
    for (const it of list) {
      if (it && it.id && names[it.slot]) slotOf[it.id] = it.slot;
    }
    const we = U.addDays(ws, 6);
    function push(slot, id) {
      const ex = ExerciseDB.byId(id);
      const nm = (ex && ex.name ? ex.name : String(id).replace(/_/g, ' ')).toLowerCase();
      if (names[slot].indexOf(nm) === -1) names[slot].push(nm);
    }
    for (const w of workouts || []) {
      if (!w || !w.date || w.date < ws || w.date > we) continue;
      for (const e of w.entries || []) {
        if (!e) continue;
        if (e.type === 'setwork') {
          const slot = slotOf[e.exerciseRef];
          if (slot && (e.sets || []).some(validSetworkSet)) push(slot, e.exerciseRef);
        } else if (e.type === 'durability') {
          for (const id of e.items || []) {
            if (slotOf[id]) push(slotOf[id], id);
          }
        } else if (!e.type || e.type === 'lift') {
          const slot = slotOf[e.exerciseId];
          if (slot && (e.sets || []).some(function (s) { return s && (!s.type || s.type === 'work'); })) {
            push(slot, e.exerciseId);
          }
        }
      }
    }
    return names;
  }

  // Returns '' unless weeklyStatus produced the P3 durability shape AND the
  // checklist is loaded — the dashboard never crashes (or nags on unknowable
  // coverage) when either is missing.
  function durabilityCardHTML(gs, workouts, today) {
    const d = gs && gs.durability;
    if (!d || typeof d !== 'object' || !d.slots || typeof d.slots !== 'object') return '';
    const db = window.ExerciseDB;
    if (!db || !Array.isArray(db.DURABILITY_CHECKLIST) || !db.DURABILITY_CHECKLIST.length) return '';
    const targets = (window.Guardrails && Guardrails.DURABILITY_TARGETS) || DUR_TARGET_FALLBACK;
    const covered = typeof d.covered === 'number' && isFinite(d.covered) ? d.covered : 0;
    const total = typeof d.total === 'number' && isFinite(d.total) && d.total > 0 ? d.total : 4;
    const names = durabilitySlotNames(workouts, U.weekStart(today));

    function countOf(slotId) {
      const v = d.slots[slotId];
      return typeof v === 'number' && isFinite(v) && v > 0 ? v : 0;
    }
    function targetOf(slotId) {
      const t = targets[slotId];
      return typeof t === 'number' && isFinite(t) && t > 0 ? t : DUR_TARGET_FALLBACK[slotId] || 1;
    }

    let html = cardOpen('Durability this week',
      '<span style="font-size:13px;font-weight:600;color:' +
      (covered >= total ? 'var(--accent)' : 'var(--text-2)') + '">' +
      covered + ' of ' + total + ' areas</span>');
    html += '<div style="display:flex;flex-direction:column;gap:14px;margin-top:8px">';
    for (const slot of DUR_SLOTS) {
      const count = countOf(slot.id);
      const target = targetOf(slot.id);
      const pct = U.clamp(count / target, 0, 1);
      const color = pct >= 1 ? 'var(--accent)' : count > 0 ? 'var(--orange)' : 'var(--red)';
      const nm = (names[slot.id] || []).slice(0, 3).join(', ');
      const sub = count > 0
        ? Math.round(count * 10) / 10 + (count === 1 ? ' set' : ' sets') + (nm ? ' · ' + nm : '')
        : 'nothing yet';
      html += '<div>' +
        '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;' +
        'font-size:13px;margin-bottom:5px">' +
        '<span style="font-weight:600;flex:none">' + U.esc(slot.label) + '</span>' +
        '<span style="color:' + (count > 0 ? 'var(--text-2)' : 'var(--text-muted)') +
        ';min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
        U.esc(sub) + '</span></div>' +
        '<div class="progress-bar"><span style="width:' + Math.max(4, Math.round(pct * 100)) +
        '%;background:' + color + '"></span></div>' +
        '</div>';
    }
    html += '</div>';
    let nudge = '';
    for (const slot of DUR_SLOTS) {
      const count = countOf(slot.id);
      const target = targetOf(slot.id);
      if (count >= target) continue;
      nudge = count === 0
        ? slot.label + ' is uncovered — ' + slot.nudge + ' slot into any session.'
        : slot.label + ' needs ' + Math.ceil(target - count) + ' more ' +
          (Math.ceil(target - count) === 1 ? 'set' : 'sets') + ' — ' + slot.nudge + ' slot into any session.';
      break;
    }
    if (!nudge) nudge = 'All four areas covered — the small tissues got their work this week.';
    html += '<div style="margin-top:12px;font-size:13px;color:var(--text-2);line-height:1.5">' +
      U.esc(nudge) + '</div>';
    html += '</section>';
    return html;
  }

  /* ======================================================================
     P4 (Intelligence) — load model surfaces
     ======================================================================
     Every surface below reads window.LoadModel LAZILY and renders nothing at
     all when it is missing (older cached shell, script-order accident) — the
     dashboard degrades, it never crashes. All arithmetic lives in LoadModel
     and Guardrails; this file only picks colors, words and units. */

  function loadModel() {
    return (window.LoadModel && typeof LoadModel.status === 'function') ? window.LoadModel : null;
  }

  // ACWR zone -> plain word + CVD-safe series color. Color is never the only
  // signal: every chip carries the word too.
  const ZONE_META = {
    'ramping-fast': { label: 'ramping fast', color: 'var(--s5)' },
    ramping: { label: 'ramping', color: 'var(--s3)' },
    steady: { label: 'steady', color: 'var(--s1)' },
    detraining: { label: 'winding down', color: 'var(--s6)' }
  };

  // LoadModel owns the zone wording when it publishes it (lower-cased here so
  // the chip reads '1.52× ramping fast'); the local map is the fallback.
  function zoneWord(zone) {
    const LM = loadModel();
    const fromModel = LM && LM.ZONE_LABELS ? LM.ZONE_LABELS[zone] : null;
    const word = fromModel || (ZONE_META[zone] ? ZONE_META[zone].label : '');
    return word ? word.charAt(0).toLowerCase() + word.slice(1) : '';
  }

  const MODALITY_ORDER = ['run', 'ruck', 'lift', 'other'];
  const MODALITY_LABEL = { run: 'Run', ruck: 'Ruck', lift: 'Lift', other: 'Engine' };

  function fmtMinSec(minutes) {
    const total = Math.max(0, Math.round((minutes || 0) * 60));
    return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
  }

  function fmtSecClock(seconds) {
    const total = Math.max(0, Math.round(seconds || 0));
    return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
  }

  // Resting-HR snapshot for the current user, or null when there is no data.
  // The freshness threshold comes from Guardrails.LIMITS so the dashboard and
  // the weekly advisory agree on when a spike is still news.
  function restingHrInfo(u, today) {
    const rows = Store.healthFor(u.id, 'restingHR');
    if (!rows.length) return null;
    const last = rows[rows.length - 1];
    const LM = loadModel();
    if (!LM || typeof LM.restingHR !== 'function') {
      return { latest: last.value, latestDate: last.date, baseline28: null,
        spike: false, fresh: false, pct: null, rows: rows };
    }
    let hr = null;
    try { hr = LM.restingHR(rows, today); } catch (e) { hr = null; }
    if (!hr || hr.latest === null || hr.latest === undefined) return null;
    const freshDays = (window.Guardrails && Guardrails.LIMITS &&
      Guardrails.LIMITS.RESTING_HR_FRESH_DAYS) || 3;
    const fresh = !!hr.latestDate && hr.latestDate >= U.addDays(today, -freshDays);
    return {
      latest: hr.latest,
      latestDate: hr.latestDate,
      baseline28: hr.baseline28,
      spike: !!hr.spike && fresh,
      fresh: fresh,
      pct: hr.baseline28 > 0 ? Math.round((hr.latest / hr.baseline28 - 1) * 100) : null,
      rows: rows
    };
  }

  function greenWeekOf(w, u, today) {
    const LM = loadModel();
    if (!LM || typeof LM.greenWeek !== 'function') return null;
    try { return LM.greenWeek(w, u, U.weekStart(today)); } catch (e) { return null; }
  }

  /* ---------- TODAY strip ---------- */

  function acwrChipHTML(mod, row) {
    const meta = row.zone ? ZONE_META[row.zone] : null;
    const known = typeof row.ratio === 'number' && isFinite(row.ratio);
    return '<span class="p4-chip" data-zone="' + U.esc(row.zone || 'none') + '"' +
      (meta ? ' style="--zone:' + meta.color + '"' : '') + '>' +
      '<span class="dot"></span>' +
      '<span class="nm">' + U.esc(MODALITY_LABEL[mod] || mod) + '</span>' +
      (known
        ? '<b class="tabular">' + U.esc(row.ratio.toFixed(2)) + '×</b>' +
          '<span class="zn">' + U.esc(zoneWord(row.zone)) + '</span>'
        : '<span class="zn">building base</span>') +
      '</span>';
  }

  // Daily guidance strip: LoadModel headline + one ACWR chip per modality that
  // has any load in the window, plus the resting-HR easy-day advisory.
  function todayStripHTML(w, today, hr) {
    const LM = loadModel();
    if (!LM) return '';
    let st = null;
    try { st = LM.status(w, today); } catch (e) { st = null; }
    if (!st || !st.perModality) return '';

    const chips = [];
    let anyRatio = false;
    for (const mod of MODALITY_ORDER) {
      const row = st.perModality[mod];
      if (!row) continue;
      if (typeof row.ratio === 'number' && isFinite(row.ratio)) anyRatio = true;
      if (!(row.acute > 0) && !(row.chronic > 0)) continue;
      chips.push(acwrChipHTML(mod, row));
    }
    // A chip is emitted for any load at all, but a ratio only exists once a
    // modality has an established four-week baseline. Without one there is no
    // normal range to be inside of — say so instead of claiming steadiness.
    let line = st.headline;
    if (!line) {
      if (!chips.length) {
        line = 'No training load in the last four weeks. Log a session and today\'s guidance fills in.';
      } else if (anyRatio) {
        line = 'Steady — every modality is inside its four-week normal range.';
      } else {
        line = 'Building your baseline — four weeks of history unlocks load guidance.';
      }
    }
    let html = '<section class="card p4-today" data-p4="today">';
    html += '<div class="p4-eyebrow">Today</div>';
    html += '<p class="p4-headline">' + U.esc(line) + '</p>';
    if (chips.length) html += '<div class="p4-chips">' + chips.join('') + '</div>';
    if (hr && hr.spike) {
      const advisory = 'Resting HR ' + Math.round(hr.latest) + ' bpm' +
        (hr.pct !== null ? ' is ' + hr.pct + '% over your 28-day baseline' : ' is over your baseline') +
        ' two readings running — make today easy or take it off.';
      html += '<div class="p4-advisory">' +
        '<span class="ic">' + sizedIcon(App.icons.heart, 16) + '</span>' +
        '<span>' + U.esc(advisory) + '</span></div>';
    }
    html += '</section>';
    return html;
  }

  /* ---------- green-week stat tile (replaces the streak flame in perf mode) ---------- */

  function greenWeekStatHTML(gw, st) {
    const LM = loadModel();
    const goal = Math.max(1, (LM && LM.GREEN_WEEK_SESSIONS) || 4);
    const short = Math.max(0, goal - gw.sessions);
    let deltaCls = 'flat';
    let deltaTxt;
    if (gw.green) {
      deltaCls = 'up';
      deltaTxt = 'green week · streak ' + st.currentWeeks + ' wk';
    } else if (short > 0) {
      deltaTxt = short + (short === 1 ? ' session' : ' sessions') + ' to go' +
        (gw.restDayTaken ? '' : ' · rest day still needed');
    } else {
      deltaTxt = 'no rest day yet · streak ' + st.currentWeeks + ' wk';
    }
    return '<div class="stat" data-p4="greenweek"><span class="label">Green week</span>' +
      '<span class="value" style="display:flex;align-items:center;gap:6px;">' +
      '<span style="color:' + (gw.green ? 'var(--accent)' : 'var(--text-muted)') +
      ';display:inline-flex;">' + sizedIcon(gw.green ? App.icons.check : App.icons.calendar, 20) + '</span>' +
      '<span>' + gw.sessions + '<span class="unit">/' + goal + '</span></span></span>' +
      '<span class="delta ' + deltaCls + '">' + U.esc(deltaTxt) + '</span></div>';
  }

  /* ---------- recovery strip ---------- */

  function recCellHTML(label, value, sub) {
    return '<div class="p4-rec-cell"><div class="lb">' + U.esc(label) + '</div>' +
      '<div class="v tabular">' + value + '</div>' +
      '<div class="sub">' + U.esc(sub || '') + '</div></div>';
  }

  // Resting HR (+ 28-day baseline & spike flag), sleep 7d vs 28d, open pain
  // entries and rest-day status. Missing health data degrades to a hint line —
  // the card always renders something useful in performance mode.
  function recoveryCardHTML(u, today, gs, hr, gw) {
    const sleepRows = Store.healthFor(u.id, 'sleepHours');

    function meanOver(rows, days) {
      const start = U.addDays(today, -(days - 1));
      const win = rows.filter(function (r) { return r.date >= start && r.date <= today; });
      if (!win.length) return null;
      return U.round1(U.sum(win, function (r) { return r.value; }) / win.length);
    }
    const sleep7 = meanOver(sleepRows, 7);
    const sleep28 = meanOver(sleepRows, 28);

    const openPain = Store.painFor(u.id).filter(function (p) { return !p.resolved; });
    const restTaken = gs && typeof gs.restDayTaken === 'boolean' ? gs.restDayTaken
      : gw ? gw.restDayTaken : null;

    let html = '<section class="card" data-p4="recovery">';
    html += '<div class="card-title"><span>Recovery</span>' +
      (hr && hr.spike ? '<span class="badge orange">HR spike</span>' : '') + '</div>';
    html += '<div class="p4-rec">';

    if (hr && hr.latest) {
      let sub;
      if (hr.baseline28) {
        sub = '28-day baseline ' + U.round1(hr.baseline28) + ' bpm · ' +
          (hr.pct > 0 ? '+' : '') + hr.pct + '%';
      } else {
        sub = 'baseline builds as more days sync';
      }
      if (!hr.fresh) sub += ' · last read ' + U.relDate(hr.latestDate);
      html += '<div class="p4-rec-hr">' +
        '<div class="lb">Resting HR</div>' +
        '<div class="v tabular">' + Math.round(hr.latest) + '<span class="unit"> bpm</span></div>' +
        '<div class="sub">' + U.esc(sub) + '</div>' +
        '<div data-slot="p4-hr-spark" class="p4-spark"></div></div>';
    } else {
      html += '<div class="p4-rec-hr">' +
        '<div class="lb">Resting HR</div>' +
        '<div class="v">—</div>' +
        '<div class="sub">No resting-heart-rate days yet.</div>' +
        '<button type="button" class="btn ghost small" data-act="go-settings" ' +
        'style="margin-top:8px">Import Apple Health</button></div>';
    }

    // The 7-day window is a subset of the 28-day one, so a stale feed (rows
    // 8-28 days old, none since) leaves sleep7 null while sleep28 is real.
    // Differencing them there would coerce null to 0 and print the whole
    // baseline as a fabricated deficit.
    let sleepSub;
    if (sleep28 === null) {
      sleepSub = 'no sleep data yet';
    } else if (sleep7 === null) {
      sleepSub = '28-day ' + sleep28 + ' h · no nights logged in the last 7 days';
    } else {
      sleepSub = '28-day ' + sleep28 + ' h · ' + (sleep7 >= sleep28 ? '+' : '') +
        U.round1(sleep7 - sleep28) + ' h';
    }
    html += '<div class="p4-rec-cells">';
    html += recCellHTML('Sleep (7-day)',
      sleep7 === null ? '—' : U.esc(String(sleep7)) + '<span class="unit"> h</span>',
      sleepSub);
    html += recCellHTML('Open niggles', String(openPain.length),
      openPain.length ? 'in the pain log' : 'nothing logged');
    html += recCellHTML('Rest day',
      restTaken === null ? '—' : (restTaken ? 'Taken' : 'Not yet'),
      gw ? gw.sessions + (gw.sessions === 1 ? ' session' : ' sessions') + ' this week' : 'this week');
    html += '</div></div>';

    if (!hr && sleep7 === null) {
      html += '<p class="p4-hint">Recovery signals come from Apple Health — import once and ' +
        'resting HR and sleep track themselves.</p>';
    }
    html += '</section>';
    return html;
  }

  /* ---------- P4 mini-charts ----------
     Two shapes js/charts.js does not cover (stacked bars, scatter). The chrome
     deliberately mirrors it: hairline gridlines, 11px muted tick text, no chart
     border, 2px surface gaps, viewBox sized to the measured container so text
     renders at true 11px, re-drawn on container resize. */

  /* Colour comes from the CSS custom properties, never from a JS constant:
     per-user themes are applied as :root[data-theme="slug"], so a frozen value
     would stop following the theme mid-session. js/charts.js owns the resolver
     (one cache, one pass, one theme for every chart on the view); the local
     branch below only runs when Charts is absent or stubbed, e.g. headless.
     SVG presentation attributes cannot substitute var(), so these must be
     resolved literals — HTML style attributes still spend var() directly. */
  const P4_FALLBACK = {
    '--hairline': 'rgba(233,222,190,.08)',
    '--border': 'rgba(233,222,190,.15)',
    '--card': '#1c1f14',
    '--text-2': '#b5ae98',
    '--text-muted': '#96917f',
    '--accent': '#ff7a1f'
  };

  function p4Color(name) {
    if (window.Charts && typeof Charts.token === 'function') return Charts.token(name);
    let v = '';
    try {
      if (typeof getComputedStyle === 'function' &&
          typeof document !== 'undefined' && document.documentElement) {
        v = getComputedStyle(document.documentElement).getPropertyValue(name);
      }
    } catch (e) { v = ''; }
    v = String(v || '').trim();
    return v || P4_FALLBACK[name] || '#96917f';
  }

  function p4Alpha(name, a) {
    const c = p4Color(name);
    if (window.Charts && typeof Charts.alpha === 'function') return Charts.alpha(c, a);
    return c;
  }

  function p4Grid() { return p4Color('--hairline'); }
  function p4Goal() { return p4Color('--text-muted'); }  // drawn at .45 opacity
  function p4Muted() { return p4Color('--text-muted'); }
  function p4Text2() { return p4Color('--text-2'); }

  function p4r(v) { return Math.round(v * 100) / 100; }

  function p4Width(el) {
    let width = el && el.clientWidth ? el.clientWidth : 0;
    if (width > 0) {
      const cs = getComputedStyle(el);
      width -= (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    }
    return width > 60 ? width : 640;
  }

  function p4Responsive(el, draw) {
    if (!el) return;
    draw();
    if (el.__p4ro) { el.__p4ro.disconnect(); el.__p4ro = null; }
    if (typeof ResizeObserver === 'undefined') return;
    let lastW = el.clientWidth;
    const ro = new ResizeObserver(U.debounce(function () {
      if (!document.body.contains(el)) { ro.disconnect(); return; }
      const now = el.clientWidth;
      if (Math.abs(now - lastW) > 8) { lastW = now; draw(); }
    }, 120));
    ro.observe(el);
    el.__p4ro = ro;
  }

  function p4Empty(el, h, note) {
    el.innerHTML = '<div style="height:' + h + 'px;display:flex;align-items:center;' +
      'justify-content:center;color:' + p4Muted() + ';font-size:12px;">' +
      U.esc(note || 'No data yet') + '</div>';
  }

  function p4Text(x, y, s, anchor, fill, size, weight) {
    return '<text x="' + p4r(x) + '" y="' + p4r(y) + '" text-anchor="' + (anchor || 'start') +
      '" fill="' + (fill || p4Muted()) + '" font-size="' + (size || 11) + '"' +
      (weight ? ' font-weight="' + weight + '"' : '') + '>' + U.esc(s) + '</text>';
  }

  function p4Legend(items) {
    if (items.length < 2) return '';
    return '<div style="display:flex;flex-wrap:wrap;gap:4px 14px;margin:2px 2px 8px;">' +
      items.map(function (it) {
        return '<span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:' +
          p4Text2() + ';"><span style="width:10px;height:10px;border-radius:50%;background:' +
          it.color + ';flex:none;"></span>' + U.esc(it.label) + '</span>';
      }).join('') + '</div>';
  }

  // Clean 0..max tick ladder (1 / 2 / 5 x 10^n steps). The top tick always
  // sits at or above max — charts scale to it, so a short ladder would draw
  // bars and dots outside the plot.
  // `integer` is opt-in from axes whose formatter rounds to whole numbers
  // (counts, whole kg, anything through U.fmtNum): without it max<=2 yields a
  // 0.5 step and two distinct gridlines collapse onto the same label
  // (0,1,1,2,2). Axes with a decimal formatter leave it off.
  function p4Ticks(max, count, integer) {
    if (!(max > 0)) return [0, 1];
    const raw = max / Math.max(1, count || 4);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    let step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
    if (integer) step = Math.max(1, Math.round(step)); // ladder is 1/2/5x10^n, so this is a no-op above 1
    const hi = Math.ceil((max - step * 1e-9) / step) * step;
    const out = [];
    for (let i = 0; i * step <= hi + step * 1e-9; i++) {
      out.push(Math.round(i * step * 1000) / 1000);
    }
    if (out.length < 2) out.push(Math.round(step * 1000) / 1000);
    return out;
  }

  function p4TextWidth(s) { return String(s).length * 11 * 0.62; }

  // rounded data end, square baseline (same idiom as Charts.bars)
  function p4TopRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h);
    return 'M' + p4r(x) + ',' + p4r(y + h) + ' L' + p4r(x) + ',' + p4r(y + rr) +
      ' Q' + p4r(x) + ',' + p4r(y) + ' ' + p4r(x + rr) + ',' + p4r(y) +
      ' L' + p4r(x + w - rr) + ',' + p4r(y) +
      ' Q' + p4r(x + w) + ',' + p4r(y) + ' ' + p4r(x + w) + ',' + p4r(y + rr) +
      ' L' + p4r(x + w) + ',' + p4r(y + h) + ' Z';
  }

  // Stacked (or single-series) column chart with an optional reference line.
  // opts: {groups:[{label, values:[{seriesLabel, value, color}]}], yFmt,
  //        refLine, refLabel, note, integer}
  function p4Bars(el, opts) {
    if (!el) return;
    p4Responsive(el, function () {
      const H = 200;
      const groups = opts.groups || [];
      const yFmt = opts.yFmt || U.fmtNum;
      const ref = typeof opts.refLine === 'number' && isFinite(opts.refLine) && opts.refLine > 0
        ? opts.refLine : null;
      let maxV = ref || 0;
      groups.forEach(function (g) {
        let total = 0;
        (g.values || []).forEach(function (v) { total += Math.max(0, v.value || 0); });
        if (total > maxV) maxV = total;
      });
      if (!groups.length || maxV <= 0) { p4Empty(el, H, opts.note); return; }

      const ticks = p4Ticks(maxV, 4, opts.integer);
      const yHi = ticks[ticks.length - 1];
      const W = p4Width(el);
      let tickW = 0;
      ticks.forEach(function (t) { tickW = Math.max(tickW, p4TextWidth(yFmt(t))); });
      const pad = { t: 12, r: 10, b: 24, l: Math.max(30, Math.ceil(tickW) + 12) };
      const pw = W - pad.l - pad.r;
      const ph = H - pad.t - pad.b;
      const baseY = pad.t + ph;
      const Y = function (v) { return pad.t + (1 - v / yHi) * ph; };

      let g = '';
      ticks.forEach(function (t) {
        const y = Y(t);
        g += '<line x1="' + pad.l + '" y1="' + p4r(y) + '" x2="' + p4r(pad.l + pw) +
          '" y2="' + p4r(y) + '" stroke="' + p4Grid() + '" stroke-width="1"/>';
        g += p4Text(pad.l - 8, y + 3.5, yFmt(t), 'end');
      });

      const slot = pw / groups.length;
      const barW = Math.max(3, Math.min(24, slot * 0.62));
      const legendSeen = {};
      const legend = [];
      groups.forEach(function (grp, gi) {
        const cx = pad.l + slot * gi + slot / 2;
        let acc = 0;
        const vals = (grp.values || []).filter(function (v) { return (v.value || 0) > 0; });
        vals.forEach(function (v, vi) {
          if (!legendSeen[v.seriesLabel]) {
            legendSeen[v.seriesLabel] = 1;
            legend.push({ label: v.seriesLabel, color: v.color });
          }
          const y0 = Y(acc);
          const y1 = Y(acc + v.value);
          const top = vi === vals.length - 1;
          const gap = top ? 0 : 2; // 2px surface gap between segments
          const h = Math.max(0, y0 - y1 - gap);
          if (h > 0.5) {
            // The gap comes off the segment's TOP edge, so the space lands on
            // the boundary with the segment above. Shrinking height alone would
            // strand it at the bottom and float the whole stack off the axis.
            const ry = y1 + gap;
            g += '<path d="' + (top ? p4TopRect(cx - barW / 2, ry, barW, h, 4)
              : 'M' + p4r(cx - barW / 2) + ',' + p4r(ry) + ' h' + p4r(barW) + ' v' + p4r(h) +
                ' h' + p4r(-barW) + ' Z') +
              '" fill="' + v.color + '"><title>' + U.esc(grp.label + ' · ' + v.seriesLabel +
              ' ' + yFmt(v.value)) + '</title></path>';
          }
          acc += v.value;
        });
      });

      if (ref !== null) {
        const y = Y(ref);
        g += '<line x1="' + pad.l + '" y1="' + p4r(y) + '" x2="' + p4r(pad.l + pw) + '" y2="' + p4r(y) +
          '" stroke="' + p4Goal() + '" stroke-opacity=".45" stroke-width="1" stroke-dasharray="4 4"/>';
        g += p4Text(pad.l + pw, y - 5, opts.refLabel || 'average', 'end', p4Text2());
      }

      const every = Math.max(1, Math.ceil(groups.length / Math.max(2, Math.floor(pw / 76))));
      groups.forEach(function (grp, gi) {
        if (gi % every !== 0 && gi !== groups.length - 1) return;
        g += p4Text(pad.l + slot * gi + slot / 2, H - 7, grp.label, 'middle');
      });

      el.innerHTML = p4Legend(legend) +
        '<svg viewBox="0 0 ' + p4r(W) + ' ' + H + '" width="100%" style="display:block" role="img">' +
        g + '</svg>';
    });
  }

  // Scatter plot. opts: {points:[{x, y, label, recent}], xFmt, yFmt, xTitle,
  //                      yTitle, color, mutedColor, note, integer}
  function p4Scatter(el, opts) {
    if (!el) return;
    p4Responsive(el, function () {
      const H = 210;
      const pts = (opts.points || []).filter(function (p) {
        return p && isFinite(p.x) && isFinite(p.y);
      });
      if (!pts.length) { p4Empty(el, H, opts.note); return; }
      const xFmt = opts.xFmt || U.fmtNum;
      const yFmt = opts.yFmt || U.fmtNum;

      let xMax = 0;
      let yMin = Infinity;
      let yMax = -Infinity;
      pts.forEach(function (p) {
        if (p.x > xMax) xMax = p.x;
        if (p.y < yMin) yMin = p.y;
        if (p.y > yMax) yMax = p.y;
      });
      if (yMin === yMax) { yMin -= 0.5; yMax += 0.5; }
      const yPad = (yMax - yMin) * 0.15;
      const yLo = Math.max(0, yMin - yPad);
      const yHi = yMax + yPad;
      const xTicks = p4Ticks(xMax || 1, 4, opts.integer);
      const xHi = xTicks[xTicks.length - 1];
      const yTicks = [yLo, yLo + (yHi - yLo) / 2, yHi];

      const W = p4Width(el);
      let tickW = 0;
      yTicks.forEach(function (t) { tickW = Math.max(tickW, p4TextWidth(yFmt(t))); });
      const pad = { t: 26, r: 12, b: 34, l: Math.max(34, Math.ceil(tickW) + 12) };
      const pw = W - pad.l - pad.r;
      const ph = H - pad.t - pad.b;
      const X = function (v) { return pad.l + (xHi > 0 ? v / xHi : 0.5) * pw; };
      const Y = function (v) { return pad.t + (1 - (v - yLo) / (yHi - yLo)) * ph; };

      let g = '';
      yTicks.forEach(function (t) {
        const y = Y(t);
        g += '<line x1="' + pad.l + '" y1="' + p4r(y) + '" x2="' + p4r(pad.l + pw) + '" y2="' +
          p4r(y) + '" stroke="' + p4Grid() + '" stroke-width="1"/>';
        g += p4Text(pad.l - 8, y + 3.5, yFmt(t), 'end');
      });
      xTicks.forEach(function (t) {
        g += p4Text(X(t), H - 16, xFmt(t), 'middle');
      });
      if (opts.yTitle) g += p4Text(pad.l - tickW - 4, 12, opts.yTitle, 'start', p4Text2());
      if (opts.xTitle) g += p4Text(pad.l + pw / 2, H - 3, opts.xTitle, 'middle', p4Text2());

      const color = opts.color || Charts.SERIES[0];
      const muted = opts.mutedColor || p4Alpha('--text-muted', .55);
      pts.forEach(function (p) {
        g += '<circle cx="' + p4r(X(p.x)) + '" cy="' + p4r(Y(p.y)) + '" r="4.5" fill="' +
          (p.recent ? color : muted) + '" fill-opacity="' + (p.recent ? '.95' : '.75') +
          '" stroke="' + p4Color('--card') + '" stroke-width="1.5"><title>' + U.esc(p.label || '') +
          '</title></circle>';
      });

      const legend = [];
      if (pts.some(function (p) { return p.recent; })) legend.push({ label: 'Last 12 weeks', color: color });
      if (pts.some(function (p) { return !p.recent; })) legend.push({ label: 'Earlier', color: muted });

      el.innerHTML = p4Legend(legend) +
        '<svg viewBox="0 0 ' + p4r(W) + ' ' + H + '" width="100%" style="display:block" role="img">' +
        g + '</svg>';
    });
  }

  /* ---------- Analytics: Performance section data ---------- */

  const BENCHMARKS = [
    { id: 'run2mi', label: '2-mile', miles: 2 },
    { id: 'run5mi', label: '5-mile', miles: 5 }
  ];
  // a logged run counts as a benchmark effort within +-3% of the distance
  const BENCH_TOL = 0.03;

  // Mirrors Guardrails' internal effort classification (HR beats the effort
  // field when both avgHR and birthYear are known); the HR fraction is read
  // from Guardrails.LIMITS so there is one source of truth for the threshold.
  function classifyCardio(e, u, refYear) {
    const frac = (window.Guardrails && Guardrails.LIMITS &&
      Guardrails.LIMITS.EASY_HR_FRACTION) || 0.75;
    const by = u && u.profile && u.profile.birthYear;
    if (by && typeof e.avgHR === 'number' && e.avgHR > 0) {
      return e.avgHR < frac * (220 - (refYear - by)) ? 'easy' : 'hard';
    }
    if (e.effort === 'easy') return 'easy';
    if (e.effort === 'moderate' || e.effort === 'hard') return 'hard';
    return null;
  }

  function effortSplitWeeks(w, u, weeks, today) {
    const cw = U.weekStart(today);
    const rows = [];
    const index = {};
    for (let i = weeks - 1; i >= 0; i--) {
      const ws = U.addDays(cw, -7 * i);
      const row = { weekStart: ws, easy: 0, hard: 0 };
      rows.push(row);
      index[ws] = row;
    }
    for (const wo of w || []) {
      if (!wo || !wo.date) continue;
      const row = index[U.weekStart(wo.date)];
      if (!row) continue;
      const refYear = parseInt(row.weekStart.slice(0, 4), 10);
      for (const e of wo.entries || []) {
        if (!e || e.type !== 'cardio') continue;
        const cls = classifyCardio(e, u, refYear);
        if (cls === 'easy') row.easy++;
        else if (cls === 'hard') row.hard++;
      }
    }
    return rows;
  }

  // Benchmark efforts per date: test entries for the protocol plus any logged
  // run within tolerance of the distance; the fastest effort wins the day.
  function benchmarkPoints(w) {
    const best = { run2mi: {}, run5mi: {} };
    function put(id, date, sec) {
      if (!best[id] || !(sec > 0)) return;
      if (best[id][date] === undefined || sec < best[id][date]) best[id][date] = sec;
    }
    for (const wo of w || []) {
      if (!wo || !wo.date) continue;
      for (const e of wo.entries || []) {
        if (!e) continue;
        if (e.type === 'test') {
          const v = e.results && typeof e.results.value === 'number' ? e.results.value : null;
          if (v !== null) put(e.protocol, wo.date, v);
        } else if (e.type === 'cardio' && e.mode === 'run') {
          const km = typeof e.distanceKm === 'number' ? e.distanceKm : 0;
          const min = typeof e.durationMin === 'number' ? e.durationMin : 0;
          if (km > 0 && min > 0) {
            for (const b of BENCHMARKS) {
              const target = b.miles * KM_PER_MILE;
              if (Math.abs(km - target) <= target * BENCH_TOL) put(b.id, wo.date, min * 60);
            }
          }
        }
      }
    }
    const out = {};
    for (const b of BENCHMARKS) {
      out[b.id] = Object.keys(best[b.id]).sort().map(function (d) {
        return { x: d, y: Math.round(best[b.id][d]) };
      });
    }
    return out;
  }

  // Per-modality display conversion — the load model works in km, kg·mi, kg
  // and minutes; the viewer sees their own units.
  function modalityUnitLabel(mod) {
    const units = App.units();
    if (mod === 'run') return units === 'lb' ? 'mi' : 'km';
    if (mod === 'ruck') return units === 'lb' ? 'lb·mi' : 'kg·mi';
    if (mod === 'lift') return unitLbl();
    return 'min';
  }

  function modalityDisplay(mod, value) {
    const v = typeof value === 'number' && isFinite(value) ? value : 0;
    if (mod === 'run') return U.round1(App.units() === 'lb' ? v / KM_PER_MILE : v);
    if (mod === 'ruck' || mod === 'lift') return Math.round(dispVol(v));
    return Math.round(v);
  }

  /* ---------- Analytics: Performance section ---------- */

  // Everything the section needs, or null when LoadModel is unavailable.
  function perfAnalyticsData(u, w, today) {
    const LM = loadModel();
    if (!LM) return null;
    let economy = [];
    try { economy = LM.ruckEconomy(w) || []; } catch (e) { economy = []; }

    const cw = U.weekStart(today);
    const load = {};
    for (const mod of MODALITY_ORDER) {
      const weeks = [];
      let total = 0;
      for (let i = 11; i >= 0; i--) {
        const ws = U.addDays(cw, -7 * i);
        let v = 0;
        try { v = LM.weekly(w, mod, ws); } catch (e) { v = 0; }
        if (!(typeof v === 'number' && isFinite(v))) v = 0;
        total += v;
        weeks.push({ weekStart: ws, value: v });
      }
      let chronic = 0;
      try {
        const a = LM.acwr(w, mod, today);
        chronic = a && typeof a.chronic === 'number' && isFinite(a.chronic) ? a.chronic : 0;
      } catch (e) { chronic = 0; }
      load[mod] = { weeks: weeks, total: total, chronic: chronic };
    }

    // The card opens on the first modality with any load, so it starts on
    // something worth looking at — but only until the user picks. Re-applying
    // this on every render would revert an explicit tap on an untrained
    // modality, leaving three of four segments dead. Once they choose we honour
    // it and p4Bars shows the "No <modality> load…" note it already prepares.
    if (aState.loadModUser !== u.id) {
      aState.loadModUser = u.id;
      aState.loadMod = 'run';
      aState.loadModAuto = true;
    }
    let mod = aState.loadMod;
    if (aState.loadModAuto && (!load[mod] || !(load[mod].total > 0))) {
      mod = '';
      for (const m of MODALITY_ORDER) {
        if (load[m].total > 0) { mod = m; break; }
      }
      if (!mod) mod = 'run';
      aState.loadMod = mod;
    }
    if (!load[mod]) mod = 'run'; // stale/unknown key guard

    return {
      split: effortSplitWeeks(w, u, 12, today),
      economy: economy,
      bench: benchmarkPoints(w),
      load: load,
      mod: mod,
      today: today
    };
  }

  function perfAnalyticsHTML(data) {
    if (!data) return '';
    let html = '<div class="p4-perf" data-p4="perf-analytics">';
    html += '<div class="p4-sec-head">Performance</div>';

    /* easy/hard weekly split */
    html += cardOpen('Easy vs hard weeks');
    const anySplit = data.split.some(function (r) { return r.easy + r.hard > 0; });
    if (!anySplit) {
      html += emptyHtml(App.icons.run, 'No classified cardio yet',
        'Log runs, rucks or rows with an effort (or a heart rate) and the weekly split charts here.');
    } else {
      html += '<div data-slot="p4-split"></div>';
    }
    html += '<p class="p4-cap">Cardio sessions per week by effort — about three in four should be ' +
      'easy. Heart rate decides when it is known, otherwise the effort you logged.</p></section>';

    /* ruck economy */
    html += cardOpen('Ruck economy');
    if (!data.economy.length) {
      html += emptyHtml(App.icons.ruck, 'No rucks to plot yet',
        'Rucks logged with both distance and duration plot pace against pack load here.');
    } else {
      html += '<div data-slot="p4-economy"></div>';
    }
    html += '<p class="p4-cap">One dot per ruck: pack load across, pace down. Lower is faster — ' +
      'watch how much pace slides as the load climbs.</p></section>';

    /* benchmark pace trends */
    html += cardOpen('Benchmark pace');
    const benchPts = data.bench.run2mi.length + data.bench.run5mi.length;
    if (!benchPts) {
      html += emptyHtml(App.icons.clipboard, 'No benchmark efforts yet',
        'Record a 2-mile or 5-mile test — or just log a run at that distance — and the trend starts here.');
    } else {
      html += '<div data-slot="p4-bench"></div>';
    }
    html += '<p class="p4-cap">Best 2-mile and 5-mile efforts as pace per ' +
      (App.units() === 'lb' ? 'mile' : 'kilometre') + ' — recorded tests plus any logged run ' +
      'within 3% of the distance. Lower is faster.</p></section>';

    /* per-modality weekly load */
    html += cardOpen('Weekly load', segmented('a-loadmod', 'loadMod',
      MODALITY_ORDER.map(function (m) { return { value: m, label: MODALITY_LABEL[m] }; }), data.mod));
    html += '<div data-slot="p4-load"></div>';
    html += '<p class="p4-cap">' + U.esc(MODALITY_LABEL[data.mod]) + ' load per week in ' +
      U.esc(modalityUnitLabel(data.mod)) + ' — modalities never blend into one number. ' +
      'The dashed line is your four-week average (chronic load).</p></section>';

    html += '</div>';
    return html;
  }

  function mountPerfAnalytics(container, data) {
    if (!data) return;
    const units = App.units();

    const splitEl = U.$('[data-slot="p4-split"]', container);
    if (splitEl) {
      p4Bars(splitEl, {
        groups: data.split.map(function (r) {
          return {
            label: U.fmtDate(r.weekStart),
            // Two series, so the contract's in-order CVD-safe pair (s1 + s2).
            // The old s1 + s5 green/pink read as one flat olive under
            // deuteranopia, and neither segment carries a direct label.
            values: [
              { seriesLabel: 'Easy', value: r.easy, color: Charts.SERIES[0] },
              { seriesLabel: 'Hard', value: r.hard, color: Charts.SERIES[1] }
            ]
          };
        }),
        yFmt: function (v) { return String(Math.round(v)); },
        integer: true // session counts — never half a session on the axis
      });
    }

    const ecoEl = U.$('[data-slot="p4-economy"]', container);
    if (ecoEl) {
      const cutoff = U.addDays(data.today, -83); // last 12 weeks highlighted
      const paceUnit = units === 'lb' ? '/mi' : '/km';
      p4Scatter(ecoEl, {
        points: data.economy.map(function (r) {
          const pace = units === 'lb' ? r.minPerKm * KM_PER_MILE : r.minPerKm;
          return {
            x: U.kgToDisplay(r.loadKg, units),
            y: pace,
            recent: r.date >= cutoff,
            label: U.fmtDate(r.date) + ' · ' + fmtDistKm(r.km) + ' @ ' +
              App.fmtWeight(r.loadKg) + ' · ' + fmtMinSec(pace) + ' ' + paceUnit
          };
        }),
        xFmt: function (v) { return U.fmtNum(Math.round(v)); },
        yFmt: fmtMinSec,
        integer: true, // whole kg/lb on the load axis — xFmt rounds
        xTitle: 'Pack load (' + unitLbl() + ')',
        yTitle: 'min ' + paceUnit,
        color: Charts.SERIES[1]
      });
    }

    const benchEl = U.$('[data-slot="p4-bench"]', container);
    if (benchEl) {
      // Plotted as PACE, not finishing time: a 2-mile and a 5-mile total would
      // never share a sensible axis, but their per-mile pace does.
      const series = BENCHMARKS.map(function (b, i) {
        const per = units === 'lb' ? b.miles : b.miles * KM_PER_MILE;
        return {
          label: b.label,
          color: Charts.SERIES[i],
          points: data.bench[b.id].map(function (p) {
            return { x: p.x, y: Math.round(p.y / per) };
          })
        };
      }).filter(function (s) { return s.points.length > 0; });
      Charts.line(benchEl, { series: series, yFmt: fmtSecClock });
    }

    const loadEl = U.$('[data-slot="p4-load"]', container);
    if (loadEl) {
      const mod = data.mod;
      const row = data.load[mod];
      p4Bars(loadEl, {
        groups: row.weeks.map(function (r) {
          return {
            label: U.fmtDate(r.weekStart),
            values: [{
              seriesLabel: MODALITY_LABEL[mod] + ' (' + modalityUnitLabel(mod) + ')',
              value: modalityDisplay(mod, r.value),
              color: Charts.SERIES[0]
            }]
          };
        }),
        refLine: modalityDisplay(mod, row.chronic),
        refLabel: '4-week average',
        yFmt: U.fmtNum,
        // U.fmtNum rounds to whole numbers, so this axis is integral too: a
        // light week (1.9 mi) would otherwise ladder in 0.5 steps and label
        // five gridlines 0/1/1/2/2.
        integer: true,
        note: 'No ' + MODALITY_LABEL[mod].toLowerCase() + ' load in the last 12 weeks'
      });
    }
  }

  /* ---------- pain quick-log ---------- */

  function toggleRow(id, label) {
    return '<label for="' + U.esc(id) + '" style="display:flex;align-items:center;gap:10px;min-height:44px;' +
      'font-size:14px;font-weight:600;cursor:pointer">' +
      '<input type="checkbox" id="' + U.esc(id) + '" style="width:20px;height:20px;accent-color:var(--accent)">' +
      '<span>' + U.esc(label) + '</span></label>';
  }

  function openPainSheet(u) {
    const st = { region: null, severity: 3 };
    const box = document.createElement('div');
    box.innerHTML =
      '<p class="text-2 small-text" style="margin:0 0 10px">Tap where it hurts.</p>' +
      '<div data-slot="pain-map" class="muscle-map"></div>' +
      '<div class="chip-row" style="margin-top:10px">' + EXTRA_REGIONS.map(function (r) {
        return '<button type="button" class="chip" data-region="' + U.esc(r.id) + '">' + U.esc(r.label) + '</button>';
      }).join('') + '</div>' +
      '<div id="pn-picked" class="small-text" style="margin-top:10px;font-weight:600;color:var(--text-2)">Nothing selected yet</div>' +
      '<div class="field" style="margin-top:12px">' +
        '<label for="pn-sev">Severity — <span id="pn-sev-val">3</span>/10</label>' +
        '<input id="pn-sev" type="range" min="0" max="10" step="1" value="3" ' +
          'style="width:100%;accent-color:var(--accent);min-height:44px">' +
      '</div>' +
      toggleRow('pn-worse', 'Worse during activity') +
      toggleRow('pn-bone', 'Hurts right on the bone') +
      toggleRow('pn-morning', 'Worse in the morning') +
      '<div class="field" style="margin-top:12px">' +
        '<label for="pn-note">Note <span class="muted">(optional)</span></label>' +
        '<input class="input" id="pn-note" type="text" maxlength="200" autocomplete="off" ' +
          'placeholder="e.g. started halfway through the ruck">' +
      '</div>';

    const mapEl = U.$('[data-slot="pain-map"]', box);
    function paintPick() {
      MuscleMap.render(mapEl, { values: {}, selected: st.region, onSelect: pick });
      U.$$('.chip[data-region]', box).forEach(function (c) {
        c.classList.toggle('active', c.getAttribute('data-region') === st.region);
      });
      U.$('#pn-picked', box).textContent = st.region
        ? 'Selected: ' + regionLabel(st.region) : 'Nothing selected yet';
    }
    function pick(id) { st.region = id; paintPick(); }
    paintPick();
    U.on(box, 'click', '.chip[data-region]', function (e, c) { pick(c.getAttribute('data-region')); });
    const sev = U.$('#pn-sev', box);
    sev.addEventListener('input', function () {
      st.severity = U.clamp(parseInt(sev.value, 10) || 0, 0, 10);
      U.$('#pn-sev-val', box).textContent = String(st.severity);
    });

    App.sheet({
      title: 'Log a niggle',
      content: box,
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        {
          label: 'Save',
          kind: 'primary',
          keepOpen: true,
          onClick: function (api) {
            if (!st.region) { App.toast('Tap where it hurts first', 'err'); return; }
            const row = Store.addPainEntry({
              userId: u.id,
              date: U.todayStr(),
              muscleId: st.region,
              severity: st.severity,
              worseDuring: U.$('#pn-worse', box).checked,
              boneLine: U.$('#pn-bone', box).checked,
              morning: U.$('#pn-morning', box).checked,
              note: U.$('#pn-note', box).value.trim()
            });
            api.close();
            App.toast('Logged — keep an eye on it', 'ok');
            const flags = window.Guardrails && Guardrails.painFlags
              ? Guardrails.painFlags(Store.painFor(u.id).filter(function (p) { return !p.resolved; }))
              : [];
            const reds = flags.filter(function (f) {
              return f.level === 'red' && (f.entryIds || []).indexOf(row.id) !== -1;
            });
            if (reds.length) openPainAdvisory(reds);
          }
        }
      ]
    });
  }

  const RED_FLAG_EXPLAINERS = {
    pain_bone_line: 'Pain you can pinpoint on the bone itself (rather than in muscle) is the classic early sign of a bone stress injury.',
    pain_morning: 'Pain that is there in the morning, before any training, means the tissue is not recovering between sessions.',
    pain_severe: 'Severity 7 or higher is past the level training should ever produce.',
    pain_rising: 'Pain that gets worse on every check-in is trending the wrong way despite continued loading.',
    pain_worse_consecutive: 'Pain that worsened during two sessions in a row means the load itself is aggravating it.'
  };

  function openPainAdvisory(reds) {
    const seen = {};
    const explainers = reds.filter(function (f) {
      if (seen[f.code] || !RED_FLAG_EXPLAINERS[f.code]) return false;
      seen[f.code] = 1;
      return true;
    });
    const html =
      '<p style="font-size:15px;line-height:1.6;margin:2px 0 12px">' +
        'What you just logged matches a pattern that is worth taking seriously. This is not a diagnosis — ' +
        'but it is the point where the smart move is to <b>get it assessed by a professional</b> ' +
        '(a physio or sports-medicine doctor) before loading it again.</p>' +
      '<div class="list" style="margin-bottom:12px">' +
      reds.map(function (f) {
        return '<div class="list-row" style="min-height:44px">' +
          '<span class="leading" style="color:var(--red)">' + sizedIcon(App.icons.alert, 18) + '</span>' +
          '<div class="body"><span class="title" style="white-space:normal;font-size:14px">' +
          U.esc(f.message) + '</span></div></div>';
      }).join('') + '</div>' +
      (explainers.length
        ? '<div style="font-size:13px;font-weight:700;color:var(--text-2);margin-bottom:6px">Why this is a red flag</div>' +
          '<ul style="padding-left:18px;display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--text-2);line-height:1.55">' +
          explainers.map(function (f) {
            return '<li>' + U.esc(RED_FLAG_EXPLAINERS[f.code]) + '</li>';
          }).join('') + '</ul>'
        : '') +
      '<p style="font-size:13px;color:var(--text-2);line-height:1.55;margin-top:12px">' +
        'Until it is looked at: keep training everything that does not hurt, and stop loading the area that does. ' +
        'Catching these early usually means days off, not months.</p>';
    const m = App.modal({
      title: 'Worth getting checked',
      content: html,
      actions: [{ label: 'Got it', kind: 'primary' }]
    });
    // Advisory reads like a full page, not a popup.
    const boxEl = m.el.querySelector('.modal');
    if (boxEl) {
      boxEl.style.maxWidth = '560px';
      boxEl.style.width = '100%';
      boxEl.style.minHeight = '60vh';
    }
  }

  /* ---------- journal add / edit ---------- */

  function openJournalSheet(u, existing) {
    const box = document.createElement('div');
    box.innerHTML =
      '<div class="field">' +
        '<label for="jr-text">' + (existing ? 'Edit entry' : 'What happened, how did it feel?') + '</label>' +
        '<textarea class="input" id="jr-text" rows="4" maxlength="1000" ' +
          'style="resize:vertical;min-height:96px" ' +
          'placeholder="e.g. Left knee felt fine on the run — keeping mileage flat one more week."></textarea>' +
      '</div>';
    if (existing) U.$('#jr-text', box).value = existing.entry || '';
    App.sheet({
      title: existing ? 'Edit journal entry' : 'Journal entry',
      content: box,
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        {
          label: 'Save',
          kind: 'primary',
          keepOpen: true,
          onClick: function (api) {
            const text = U.$('#jr-text', box).value.trim();
            if (!text) { App.toast('Write something first', 'err'); return; }
            if (existing) {
              Store.updateJournalEntry(existing.id, { entry: text });
              App.toast('Entry updated', 'ok');
            } else {
              Store.addJournalEntry({ userId: u.id, date: U.todayStr(), entry: text, source: 'user' });
              App.toast('Added to your journal', 'ok');
            }
            api.close();
          }
        }
      ]
    });
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
    const perf = App.isPerformance();
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

    /* TODAY strip (P4, performance mode + LoadModel loaded) */
    const hrInfo = perf ? restingHrInfo(u, today) : null;
    const greenWk = perf ? greenWeekOf(w, u, today) : null;
    const todayStrip = perf ? todayStripHTML(w, today, hrInfo) : '';

    /* countdown chip (performance mode, selection date set) */
    if (perf && u.goals && u.goals.selectionDate) {
      const daysTo = U.daysBetween(today, u.goals.selectionDate);
      if (daysTo >= 0) {
        const wksTo = Math.ceil(daysTo / 7);
        let cdLabel = daysTo === 0 ? 'Selection is today'
          : wksTo + (wksTo === 1 ? ' week' : ' weeks') + ' to selection';
        // v2 (P2): training phase appended — '35 weeks to selection · Build'
        if (typeof Protocols !== 'undefined' && Protocols && Protocols.phaseFor) {
          try {
            const ph = Protocols.phaseFor(u.goals.selectionDate, today);
            if (ph && ph.phase) {
              cdLabel += ' · ' + ph.phase.charAt(0).toUpperCase() + ph.phase.slice(1);
            }
          } catch (e) { /* phase is decoration — the chip still renders */ }
        }
        html += '<div style="margin:-6px 0 14px">' +
          '<span class="badge" style="display:inline-flex;align-items:center;gap:6px;font-size:13px;padding:6px 12px">' +
          sizedIcon(App.icons.roadmap, 16) + '<span>' + U.esc(cdLabel) + '</span></span></div>';
      }
    }

    html += todayStrip;

    /* resume banner */
    if (draft) {
      const dn = draft.name || 'Workout';
      const dCount = Array.isArray(draft.entries) ? draft.entries.length : 0;
      html += '<button type="button" class="card interactive" data-act="resume" ' +
        'style="display:flex;align-items:center;gap:14px;background:var(--accent-tint);' +
        'border-color:var(--accent-tint-strong);">' +
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
    // P4: performance users get the green-week chip in place of the streak
    // flame; simple mode keeps the flame tile byte-for-byte.
    if (greenWk) {
      html += greenWeekStatHTML(greenWk, st);
    } else {
      html += '<div class="stat"><span class="label">Current streak</span>' +
        '<span class="value" style="display:flex;align-items:center;gap:6px;">' +
        '<span style="color:var(--orange);display:inline-flex;">' + sizedIcon(App.icons.flame, 20) + '</span>' +
        '<span>' + st.currentWeeks + '<span class="unit">wk</span></span></span>' +
        '<span class="delta flat">best ' + st.bestWeeks + ' wk</span></div>';
    }
    html += '<div class="stat"><span class="label">PRs this month</span>' +
      '<span class="value" style="display:flex;align-items:center;gap:6px;">' +
      '<span style="color:var(--yellow);display:inline-flex;">' + sizedIcon(App.icons.trophy, 20) + '</span>' +
      '<span>' + prsMonth + '</span></span>' +
      '<span class="delta flat">' + (prsMonth ? 'keep it up' : 'none yet') + '</span></div>';
    html += '</div>';

    /* weekly status (computed first: the recovery strip reuses its rest-day
       verdict, and P4 feeds it resting-HR samples for the spike advisory) */
    const gs = perf && window.Guardrails && Guardrails.weeklyStatus
      ? Guardrails.weeklyStatus(w, u, today, { healthSamples: Store.healthFor(u.id, 'restingHR') })
      : null;

    /* recovery strip (P4, performance mode) */
    if (perf) html += recoveryCardHTML(u, today, gs, hrInfo, greenWk);

    /* readiness snapshot (performance mode + Protocols loaded) */
    if (perf) html += readinessCardHTML(u, w);

    /* weekly status line (performance mode only) */
    if (gs) {
      const bits = [];
      if (gs.runMileageKm > 0) {
        bits.push(fmtDistKm(gs.runMileageKm) + ' running' +
          (gs.runRampPct ? ' (' + (gs.runRampPct > 0 ? '+' : '') + gs.runRampPct + '% vs 4-wk avg)' : ''));
      }
      if (gs.easySharePct !== null) bits.push(gs.easySharePct + '% of cardio easy');
      if (gs.ruckCount > 0) bits.push(gs.ruckCount + (gs.ruckCount === 1 ? ' ruck' : ' rucks'));
      const restBit = gs.restDayTaken ? 'rest day taken' : 'no rest day yet';
      const line = bits.length
        ? 'This week: ' + bits.join(' · ') + ' · ' + restBit + '.'
        : 'No cardio logged this week · ' + restBit + '.';
      html += cardOpen('Weekly status');
      html += '<p style="font-size:14px;color:var(--text-2);line-height:1.55;margin:4px 0 0">' + U.esc(line) + '</p>';
      if (!gs.warnings.length) {
        html += '<div style="display:flex;align-items:center;gap:8px;margin-top:10px;color:var(--accent);' +
          'font-size:14px;font-weight:600">' + sizedIcon(App.icons.check, 18) +
          '<span>Green week — nothing to flag.</span></div>';
      } else {
        html += gs.warnings.map(function (wr) {
          return '<div style="display:flex;align-items:flex-start;gap:8px;margin-top:10px;color:var(--orange);' +
            'font-size:13px;line-height:1.5">' +
            '<span style="flex:none;display:inline-flex;margin-top:1px">' + sizedIcon(App.icons.alert, 16) + '</span>' +
            '<span>' + U.esc(wr.message) + '</span></div>';
        }).join('');
      }
      html += '</section>';

      /* durability coverage (P3): derived from the same weeklyStatus call */
      html += durabilityCardHTML(gs, w, today);
    }

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
    } else if (!typedEntries(last).length) {
      // v1 lift rendering — unchanged for workouts without typed entries
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
    } else {
      // v2 typed workout — kind glyph + kind-appropriate summary
      const liftSets = Analytics.workoutSets(last);
      let sub = U.esc(U.relDate(last.date));
      if (liftSets > 0) {
        const vol = Analytics.workoutVolume(last);
        const liftCount = (last.entries || []).length - typedEntries(last).length;
        sub += ' · ' + liftCount + (liftCount === 1 ? ' exercise' : ' exercises') +
          ' · ' + liftSets + ' sets · ' + U.esc(fmtVol(vol));
      }
      sub += ' · ' + U.esc(typedSummary(last));
      html += '<div class="list-row" style="padding-left:0;padding-right:0;">' +
        '<span class="leading">' + sizedIcon(kindIcon(workoutGlyphKind(last)), 20) + '</span>' +
        '<div class="body"><span class="title">' + U.esc(last.name || 'Workout') + '</span>' +
        '<span class="sub">' + sub + '</span></div>' +
        (liftSets > 0
          ? '<button type="button" class="btn ghost small" data-act="repeat" data-id="' + U.esc(last.id) + '">Repeat</button>'
          : '') +
        '</div>';
    }
    html += '</section>';

    /* pain quick-log (performance mode only) */
    if (perf) {
      const openPain = Store.painFor(u.id).filter(function (p) { return !p.resolved; });
      const redFlags = window.Guardrails && Guardrails.painFlags
        ? Guardrails.painFlags(openPain).filter(function (f) { return f.level === 'red'; })
        : [];
      html += cardOpen('Log a niggle');
      html += '<p class="text-2 small-text" style="margin:4px 0 12px">Sore spot, hot spot, something ' +
        '&quot;off&quot;? Log it in 20 seconds — catching overuse early is what keeps you training.</p>';
      if (redFlags.length) {
        html += '<div style="display:flex;align-items:center;gap:8px;margin:0 0 12px;color:var(--red);' +
          'font-size:13px;font-weight:600">' + sizedIcon(App.icons.alert, 16) +
          '<span>' + redFlags.length + (redFlags.length === 1 ? ' red flag' : ' red flags') +
          ' in your pain log — details in Body.</span></div>';
      }
      html += '<div class="btn-row">' +
        '<button type="button" class="btn primary small" data-act="log-pain">' + App.icons.plus + ' Log a niggle</button>' +
        '<button type="button" class="btn ghost small" data-act="go-body">History</button>' +
        '</div>';
      html += '</section>';
    }

    container.innerHTML = html;

    /* mount charts */
    Charts.rings(U.$('[data-slot="rings"]', container), {
      rings: [
        { value: thisWk.workouts, goal: goalW, color: Charts.SERIES[0], label: 'Workouts' },
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

    /* P4 recovery strip: 28-day resting-HR sparkline */
    const hrSparkEl = U.$('[data-slot="p4-hr-spark"]', container);
    if (hrSparkEl) {
      const hrRows = (hrInfo && hrInfo.rows ? hrInfo.rows : []).filter(function (r) {
        return r.date >= U.addDays(today, -27) && r.date <= today;
      });
      Charts.spark(hrSparkEl, {
        points: hrRows.map(function (r) { return { x: r.date, y: r.value }; }),
        color: hrInfo && hrInfo.spike ? Charts.SERIES[4] : Charts.SERIES[1]
      });
    }

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
    U.on(container, 'click', '[data-act="log-pain"]', function () { openPainSheet(u); });
    U.on(container, 'click', '[data-act="go-body"]', function () { App.navigate('body'); });
    U.on(container, 'click', '[data-act="go-standards"]', function () { App.navigate('standards'); });
    U.on(container, 'click', '[data-act="go-settings"]', function () { App.navigate('settings'); });
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

  // loadModAuto: the weekly-load modality is still the auto-picked default, so
  // the fallback may move it; a tap clears the flag and the choice sticks.
  const aState = {
    exId: null, range: '8w', metric: 'volume', prKind: 'all',
    loadMod: 'run', loadModAuto: true, loadModUser: null
  };

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
    const metTargetColor = p4Color('--accent');
    const underTargetColor = p4Alpha('--text-muted', .55);
    const balanceData = topMuscles.map(function (r) {
      return {
        label: muscleLabel(r.id),
        value: U.round1(r.v),
        // --accent is the app's GO / hit-a-target colour; everything short of
        // the target recedes to muted ink. Both resolved from the live theme.
        color: r.v >= setGoal ? metTargetColor : underTargetColor
      };
    });
    if (restSum > 0) balanceData.push({ label: 'Other', value: U.round1(restSum), color: underTargetColor });

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
    // v2: blendedCalendar instead of Analytics.calendar so sessions with no
    // lift volume (runs, rucks, mobility) still heat the calendar by time.
    const calVals = blendedCalendar(w, 182);
    // heat calendar shows display-unit volume so tooltips match the rest of the app
    const calDisp = {};
    for (const d in calVals) calDisp[d] = Math.round(dispVol(calVals[d]));

    const prsDesc = Analytics.prs(w).slice().reverse();
    const prShown = aState.prKind === 'all' ? prsDesc :
      prsDesc.filter(function (p) { return p.kind === aState.prKind; });

    /* P4 performance section (performance mode + LoadModel loaded) */
    const perfData = App.isPerformance() ? perfAnalyticsData(u, w, today) : null;

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
    html += '<p style="font-size:12px;color:var(--text-muted);margin-top:8px;">Average weekly sets per muscle over the last 4 weeks — filled bars meet your ' +
      setGoal + '-set target, faded bars are below it.</p></div>';
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

    html += perfAnalyticsHTML(perfData);

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
    mountPerfAnalytics(container, perfData);

    /* events */
    U.on(container, 'click', '[data-seg-key]', function (e, btn) {
      const key = btn.getAttribute('data-seg-key');
      const val = btn.getAttribute('data-seg-val');
      if (aState[key] === val) return;
      aState[key] = val;
      if (key === 'loadMod') aState.loadModAuto = false; // explicit tap wins from here on
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

  const bState = { range: '8w', mapLayer: 'trained' };

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

    /* v2 (P3): muscle map with a 'Stretched' layer (performance mode only).
       Trained = working-set volume (lift-only, as everywhere); Stretched =
       Analytics.stretchMinutesByMuscle over setwork stretches + legacy
       mobility blobs. Relative heat: each layer normalizes to its own max. */
    const perf = App.isPerformance();
    let mapVals = null;
    if (perf && typeof Analytics.stretchMinutesByMuscle === 'function') {
      const w = myWorkouts();
      const layer = bState.mapLayer === 'stretched' ? 'stretched' : 'trained';
      let raw = {};
      try {
        raw = (layer === 'stretched'
          ? Analytics.stretchMinutesByMuscle(w, U.addDays(today, -27))
          : Analytics.muscleVolume28d(w, today)) || {};
      } catch (e) { raw = {}; }
      let rawMax = 0;
      for (const m in raw) {
        if (typeof raw[m] === 'number' && isFinite(raw[m]) && raw[m] > rawMax) rawMax = raw[m];
      }
      mapVals = {};
      for (const m in raw) {
        mapVals[m] = rawMax > 0 ? U.clamp((raw[m] || 0) / rawMax, 0, 1) : 0;
      }

      html += cardOpen('Muscle map',
        '<div class="segmented">' + [
          { v: 'trained', l: 'Trained' }, { v: 'stretched', l: 'Stretched' }
        ].map(function (it) {
          const on = it.v === layer;
          return '<button type="button" class="seg' + (on ? ' active' : '') +
            '" data-map-layer="' + it.v + '" aria-pressed="' + on + '">' + it.l + '</button>';
        }).join('') + '</div>');
      html += '<div data-slot="body-map" class="muscle-map"></div>';
      html += '<div class="muscle-legend"><span>' +
        (layer === 'stretched' ? 'Not stretched' : 'Less volume') +
        '</span><span class="ramp"></span><span>' +
        (layer === 'stretched' ? 'Most stretched' : 'More volume') + '</span></div>';
      if (layer === 'stretched') {
        if (rawMax <= 0) {
          html += '<p style="font-size:12px;color:var(--text-muted);margin-top:8px;">No stretching in the ' +
            'last 28 days yet — structured stretches and quick-sheet sessions will heat this map.</p>';
        } else {
          const top = [];
          for (const m in raw) {
            if (raw[m] > 0) top.push({ id: m, v: raw[m] });
          }
          top.sort(function (a, b) { return b.v - a.v; });
          const topTxt = top.slice(0, 3).map(function (r) {
            return muscleLabel(r.id) + ' ' + Math.round(r.v) + ' min';
          }).join(' · ');
          html += '<p style="font-size:12px;color:var(--text-muted);margin-top:8px;">Stretch minutes over ' +
            'the last 28 days — most stretched: ' + U.esc(topTxt) + '.</p>';
        }
      } else {
        html += '<p style="font-size:12px;color:var(--text-muted);margin-top:8px;">Working-set volume by ' +
          'muscle over the last 28 days.</p>';
      }
      html += '</section>';
    }

    /* v2: pain & niggles + journal (performance mode only) */
    if (perf) {
      const pain = Store.painFor(u.id); // date desc
      const openPain = pain.filter(function (p) { return !p.resolved; });
      const flags = window.Guardrails && Guardrails.painFlags ? Guardrails.painFlags(openPain) : [];

      html += cardOpen('Pain & niggles',
        '<button type="button" class="btn ghost small" data-act="log-pain">' + App.icons.plus + ' Log</button>');
      if (flags.length) {
        html += flags.slice(0, 4).map(function (f) {
          const red = f.level === 'red';
          return '<div style="display:flex;align-items:flex-start;gap:8px;margin:2px 0 8px;color:' +
            (red ? 'var(--red)' : 'var(--orange)') + ';font-size:13px;line-height:1.5">' +
            '<span style="flex:none;display:inline-flex;margin-top:1px">' + sizedIcon(App.icons.alert, 16) + '</span>' +
            '<span>' + U.esc(f.message) + '</span></div>';
        }).join('');
      }
      if (!pain.length) {
        html += emptyHtml(App.icons.shield, 'No niggles logged',
          'Log aches early — trends show up here long before they become injuries.');
      } else {
        const shownPain = pain.slice(0, 10);
        html += '<div class="list">' + shownPain.map(function (p) {
          const sev = typeof p.severity === 'number' && isFinite(p.severity) ? p.severity : 0;
          const dotColor = sev >= 7 ? 'var(--red)' : sev >= 4 ? 'var(--orange)' : 'var(--accent)';
          const tags = [];
          if (p.worseDuring) tags.push('worse during activity');
          if (p.boneLine) tags.push('bone-line');
          if (p.morning) tags.push('worse in morning');
          return '<div class="list-row"' + (p.resolved ? ' style="opacity:.55"' : '') + '>' +
            '<span class="leading plain"><span style="display:inline-block;width:12px;height:12px;' +
              'border-radius:50%;background:' + dotColor + '"></span></span>' +
            '<div class="body"><span class="title">' + U.esc(regionLabel(p.muscleId)) + ' · ' + sev + '/10' +
              (p.resolved ? ' <span class="badge" style="margin-left:6px">Resolved</span>' : '') + '</span>' +
            '<span class="sub">' + U.esc(U.relDate(p.date)) +
              (tags.length ? ' · ' + U.esc(tags.join(' · ')) : '') +
              (p.note ? ' · ' + U.esc(p.note) : '') + '</span></div>' +
            '<span class="trailing">' +
              (!p.resolved
                ? '<button type="button" class="btn icon ghost" data-pain-resolve="' + U.esc(p.id) +
                  '" aria-label="Mark resolved" title="Mark resolved">' + App.icons.check + '</button>'
                : '') +
              '<button type="button" class="btn icon ghost" data-pain-del="' + U.esc(p.id) +
                '" aria-label="Delete entry">' + App.icons.trash + '</button>' +
            '</span></div>';
        }).join('') + '</div>';
        if (pain.length > shownPain.length) {
          html += '<p style="font-size:12px;color:var(--text-muted);margin-top:8px">+ ' +
            (pain.length - shownPain.length) + ' earlier entries</p>';
        }
      }
      html += '</section>';

      const journal = Store.journalFor(u.id); // newest first
      html += cardOpen('Journal',
        '<button type="button" class="btn ghost small" data-act="add-journal">' + App.icons.plus + ' Add entry</button>');
      if (!journal.length) {
        html += emptyHtml(App.icons.journal, 'No journal entries yet',
          'Post-session check-ins land here automatically — or add your own notes.');
      } else {
        const shownJ = journal.slice(0, 10);
        html += '<div class="list">' + shownJ.map(function (j) {
          const srcLabel = j.source === 'checkin' ? 'Check-in' : j.source === 'coach' ? 'Coach' : 'You';
          return '<div class="list-row">' +
            '<span class="leading">' + sizedIcon(App.icons.journal, 20) + '</span>' +
            '<div class="body"><span class="title" style="white-space:normal">' + U.esc(j.entry) + '</span>' +
            '<span class="sub">' + U.esc(U.relDate(j.date)) + ' · ' + U.esc(srcLabel) + '</span></div>' +
            '<span class="trailing">' +
              '<button type="button" class="btn icon ghost" data-journal-edit="' + U.esc(j.id) +
                '" aria-label="Edit entry">' + App.icons.edit + '</button>' +
              '<button type="button" class="btn icon ghost" data-journal-del="' + U.esc(j.id) +
                '" aria-label="Delete entry">' + App.icons.trash + '</button>' +
            '</span></div>';
        }).join('') + '</div>';
        if (journal.length > shownJ.length) {
          html += '<p style="font-size:12px;color:var(--text-muted);margin-top:8px">+ ' +
            (journal.length - shownJ.length) + ' earlier entries</p>';
        }
      }
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

    const mmEl = U.$('[data-slot="body-map"]', container);
    if (mmEl && mapVals) {
      MuscleMap.render(mmEl, {
        values: mapVals,
        onSelect: function (m) { App.navigate('library', { muscle: m }); }
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
    U.on(container, 'click', '[data-map-layer]', function (e, btn) {
      const v = btn.getAttribute('data-map-layer');
      if (bState.mapLayer === v) return;
      bState.mapLayer = v;
      App.rerender();
    });
    U.on(container, 'click', '[data-act="go-settings"]', function () { App.navigate('settings'); });

    /* v2 pain & journal events (elements exist only in performance mode) */
    U.on(container, 'click', '[data-act="log-pain"]', function () { openPainSheet(u); });
    U.on(container, 'click', '[data-pain-resolve]', function (e, b) {
      Store.updatePainEntry(b.getAttribute('data-pain-resolve'), { resolved: true });
      App.toast('Marked resolved', 'ok');
    });
    U.on(container, 'click', '[data-pain-del]', function (e, b) {
      const id = b.getAttribute('data-pain-del');
      App.confirm({
        title: 'Delete pain entry?',
        message: 'This removes the entry from your pain log. Red-flag checks will no longer see it.',
        danger: true,
        confirmLabel: 'Delete entry'
      }).then(function (ok) {
        if (!ok) return;
        Store.deletePainEntry(id);
        App.toast('Entry deleted', 'ok');
      });
    });
    U.on(container, 'click', '[data-act="add-journal"]', function () { openJournalSheet(u, null); });
    U.on(container, 'click', '[data-journal-edit]', function (e, b) {
      const id = b.getAttribute('data-journal-edit');
      const j = Store.journalFor(u.id).find(function (x) { return x.id === id; });
      if (j) openJournalSheet(u, j);
    });
    U.on(container, 'click', '[data-journal-del]', function (e, b) {
      const id = b.getAttribute('data-journal-del');
      App.confirm({
        title: 'Delete journal entry?',
        message: 'This permanently removes the entry.',
        danger: true,
        confirmLabel: 'Delete entry'
      }).then(function (ok) {
        if (!ok) return;
        Store.deleteJournalEntry(id);
        App.toast('Entry deleted', 'ok');
      });
    });
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
        /* P4: flex-wrap lets the activity-badge row below sit on its own line.
           Every existing child keeps its hypothetical main size (.body is
           flex:1 ⇒ base 0, the others are flex:none), so line 1 is laid out
           exactly as before — proven by p4a4-lb-badges / the geometry probe. */
        return '<div class="list-row" style="flex-wrap:wrap;' + (isViewer ? 'background:rgba(48,209,88,.07);' : '') + '">' +
          rank +
          '<span class="avatar sm" style="--c:' + U.esc(r.user.color || '#2ca350') + ';">' + U.esc(r.user.emoji || '🏋️') + '</span>' +
          '<div class="body"><span class="title">' + U.esc(r.user.name) +
          (isViewer ? ' <span class="badge green">You</span>' : '') + '</span>' +
          '<span class="sub">' + r.workouts + (r.workouts === 1 ? ' workout' : ' workouts') +
          ' · ' + r.sets + ' sets</span></div>' +
          '<span class="trailing" style="gap:8px;">' +
          (r.prCount > 0 ? '<span class="badge orange">' + r.prCount + ' PR' + (r.prCount === 1 ? '' : 's') + '</span>' : '') +
          '<span style="font-weight:700;color:var(--text);">' + U.esc(fmtVol(r.volumeKg)) + '</span></span>' +
          /* P4: additive activity-badge row — see "Leaderboard activity badges" below */
          lbActivityBadgesHtml(r.user.id, allW, ws) +
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

  /* ======================================================================
     P4 · Leaderboard activity badges — SELF-CONTAINED SECTION

     Owned by the P4 release wiring. The ONLY code outside this section that
     belongs to it is the single lbActivityBadgesHtml(...) call inside
     renderLeaderboard's row map (marked with a "P4:" comment there).

     Contract (ARCHITECTURE.md > "V2 ADDENDUM — P4" > Leaderboard): each member
     card gains small activity badges for the trailing 4 weeks — session count
     plus per-kind icons (lift/run/ruck/swim/other) with counts. Additive rows
     only, no reflow of the existing row content, and shown to EVERY user: this
     is the one family-visible P4 change, sanctioned by the approved plan
     ('activity badges so your 12-mile ruck finally counts'). The volume/PR
     metrics on the card stay lift-only and are untouched.
     ====================================================================== */

  // Icon key on App.icons + singular/plural wording for titles. Order is the
  // display order of the badges.
  const LB_BADGE_KINDS = [
    { id: 'lift', icon: 'log', one: 'lift session', many: 'lift sessions' },
    { id: 'run', icon: 'run', one: 'run', many: 'runs' },
    { id: 'ruck', icon: 'ruck', one: 'ruck', many: 'rucks' },
    { id: 'swim', icon: 'swim', one: 'swim', many: 'swims' },
    { id: 'other', icon: 'dashboard', one: 'other session', many: 'other sessions' }
  ];

  function lbKindBucket(kind) {
    if (kind === 'lift' || kind === 'run' || kind === 'ruck' || kind === 'swim') return kind;
    return 'other';
  }

  // The single badge bucket a session belongs to. workout.kind is display-only
  // (and absent on v1 rows), so 'mixed', missing and unknown kinds fall back to
  // entry inspection over the P1/P3 shapes: cardio entries carry `mode`, lift
  // entries carry no type (or 'lift'), and every other type (setwork, mobility,
  // durability, test, or anything a newer client wrote) is 'other'. Priority
  // ruck > run > swim > lift > other keeps a lift+ruck day in the ruck column —
  // the whole point of the badges — and keeps the per-kind counts summing to
  // exactly the session count.
  function lbSessionBucket(w) {
    const kind = w && typeof w.kind === 'string' ? w.kind : '';
    if (kind && kind !== 'mixed') return lbKindBucket(kind);
    let hasRuck = false;
    let hasRun = false;
    let hasSwim = false;
    let hasLift = false;
    let hasOther = false;
    for (const e of (w && w.entries) || []) {
      if (!e) continue;
      if (!e.type || e.type === 'lift') { hasLift = true; continue; }
      if (e.type === 'cardio') {
        const mode = typeof e.mode === 'string' ? e.mode : 'run';
        if (mode === 'ruck') hasRuck = true;
        else if (mode === 'run') hasRun = true;
        else if (mode === 'swim') hasSwim = true;
        else hasOther = true;
        continue;
      }
      hasOther = true;
    }
    if (hasRuck) return 'ruck';
    if (hasRun) return 'run';
    if (hasSwim) return 'swim';
    if (hasLift) return 'lift';
    if (hasOther) return 'other';
    return lbKindBucket(kind); // entry-less session (e.g. an Apple Health import)
  }

  // Trailing 4 weeks = the 28 days ending on the last day of the week the card
  // is showing, so the badges stay in step with the week navigator (offset 0 ⇒
  // the four weeks up to and including this week). Dates are 'YYYY-MM-DD', so
  // lexicographic comparison is chronological.
  function lbActivityCounts(userId, allW, weekStartStr) {
    const counts = { sessions: 0, lift: 0, run: 0, ruck: 0, swim: 0, other: 0 };
    const to = U.addDays(weekStartStr, 6);
    const from = U.addDays(weekStartStr, -21);
    for (const w of allW || []) {
      if (!w || w.userId !== userId) continue;
      if (typeof w.date !== 'string' || w.date < from || w.date > to) continue;
      counts.sessions++;
      counts[lbSessionBucket(w)]++;
    }
    return counts;
  }

  // Compact .badge pills: the row shares its width with the (untouched) volume
  // slot, so at 375px they have to stay small enough to fit 2-3 per line
  // instead of stacking one per line and stretching the card.
  function lbBadgeHtml(kindId, iconSvg, count, title, suffix) {
    return '<span class="badge" role="img" data-lb-kind="' + U.esc(kindId) + '"' +
      ' data-lb-count="' + count + '" aria-label="' + U.esc(title) + '" title="' + U.esc(title) + '"' +
      ' style="padding:2px 7px;font-size:10.5px;gap:3px;">' +
      sizedIcon(iconSvg, 11) + '<span class="tabular">' + count + '</span>' +
      (suffix ? '<span style="opacity:.65;">' + U.esc(suffix) + '</span>' : '') + '</span>';
  }

  function lbActivityBadgesHtml(userId, allW, weekStartStr) {
    const c = lbActivityCounts(userId, allW, weekStartStr);
    if (!c.sessions) return ''; // nothing logged in the window — no empty row
    const ic = App.icons || {};
    const to = U.addDays(weekStartStr, 6);
    const window4 = to >= U.todayStr() ? 'in the last 4 weeks' : 'in the 4 weeks to ' + U.fmtDate(to);
    // Own line inside the member card (flex:0 0 100% can never share a line),
    // indented to the member name: leading 40 + gap 12 + .avatar.sm 28 + gap 12.
    let html = '<span class="lb-activity" data-lb-activity="1" data-lb-sessions="' + c.sessions +
      '" style="flex:0 0 100%;display:flex;flex-wrap:wrap;align-items:center;gap:4px;' +
      'padding-left:92px;">' + // the row's own 12px gap already spaces the line
      lbBadgeHtml('sessions', ic.calendar, c.sessions,
        c.sessions + (c.sessions === 1 ? ' session ' : ' sessions ') + window4, '· 4w');
    for (const k of LB_BADGE_KINDS) {
      const n = c[k.id];
      if (!n) continue;
      html += lbBadgeHtml(k.id, ic[k.icon], n, n + ' ' + (n === 1 ? k.one : k.many) + ' ' + window4);
    }
    return html + '</span>';
  }
})();
