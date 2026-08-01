/* IronLog — views-standards.js (v2 / P2 Standards Engine)
   Registers the 'standards' view: readiness scorecard, weakest-link callout,
   phase countdown, test history and the record-a-test wizard. Performance mode
   only — the view redirects to the dashboard when the mode gate is off.
   All tier math, scoring and value formatting comes from Protocols
   (js/protocols.js, referenced lazily); this file only renders and saves.
   Attaches no namespace of its own. */
(function () {
  'use strict';

  /* ======================================================================
     Shared helpers
     ====================================================================== */

  function P() { return window.Protocols || null; }

  function curUser() { return Store.currentUser(); }

  function myWorkouts() {
    const u = curUser();
    return u ? Store.workoutsFor(u.id) : [];
  }

  function weightRows(u) { return Store.bodyMetricsFor(u.id, 'weightKg'); }

  function sizedIcon(svg, px) {
    return String(svg || '').replace('width="24" height="24"', 'width="' + px + '" height="' + px + '"');
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

  function kvRow(label, value) {
    if (value === undefined || value === null || value === '') return '';
    return '<div style="display:flex;justify-content:space-between;gap:12px;padding:7px 0;' +
      'border-bottom:1px solid var(--border);font-size:14px">' +
      '<span style="color:var(--text-2);flex:none">' + U.esc(label) + '</span>' +
      '<span style="font-weight:500;text-align:right;overflow-wrap:anywhere">' + U.esc(value) + '</span></div>';
  }

  function focusInput(id) {
    const el = document.getElementById(id);
    if (el) {
      el.focus();
      if (el.select) { try { el.select(); } catch (e) { /* ignore */ } }
    }
  }

  function capStr(s) {
    s = String(s || '').replace(/_/g, ' ');
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  }

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  // seconds -> 'm:ss' / 'h:mm:ss' (for raw ACFT event values; protocol values
  // always go through Protocols.fmtValue instead)
  function fmtClock(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h ? h + ':' + pad2(m) + ':' + pad2(s) : m + ':' + pad2(s);
  }

  // 'mm:ss' / 'h:mm:ss' -> seconds; a colon-less number is minutes or seconds
  // depending on plainUnit ('min'|'sec', default 'sec') — mirrors P1's
  // per-protocol convention (views-log.js TEST_PROTOCOLS). null on garbage.
  function parseClock(raw, plainUnit) {
    raw = String(raw || '').trim();
    if (!raw) return null;
    if (raw.indexOf(':') >= 0) {
      const parts = raw.split(':').map(function (p) { return p.trim(); });
      if (parts.some(function (p) { return p === '' || isNaN(Number(p)) || Number(p) < 0; })) return null;
      const n = parts.map(Number);
      if (n.length === 2) return n[0] * 60 + n[1];
      if (n.length === 3) return n[0] * 3600 + n[1] * 60 + n[2];
      return null;
    }
    const v = parseFloat(raw);
    if (isNaN(v) || v < 0) return null;
    return plainUnit === 'min' ? v * 60 : v;
  }

  // Colon-less input convention per protocol, mirroring P1 (views-log.js
  // TEST_PROTOCOLS `plain`): a bare '14' means 14 minutes for the long
  // efforts and 14 seconds for the short holds.
  const PLAIN_MINUTES = ['run2mi', 'run5mi', 'ruck12mi', 'swim500m'];

  function plainUnitOf(protocolId) {
    return PLAIN_MINUTES.indexOf(protocolId) >= 0 ? 'min' : 'sec';
  }

  // keep only clock characters in a masked time input
  function maskClockInput(inp) {
    const clean = inp.value.replace(/[^\d:.]/g, '');
    if (clean !== inp.value) inp.value = clean;
    return clean;
  }

  function protoDef(id) {
    const p = P();
    if (!p || typeof p.byId !== 'function') return null;
    try { return p.byId(id) || null; } catch (e) { return null; }
  }

  function protoName(id) {
    const def = protoDef(id);
    return def && def.name ? def.name : capStr(id);
  }

  function fmtVal(id, v) {
    if (v === null || v === undefined || (typeof v === 'number' && !isFinite(v))) return '—';
    const p = P();
    if (p && typeof p.fmtValue === 'function') {
      try { return p.fmtValue(id, v, App.units()); } catch (e) { /* fall through */ }
    }
    return String(v);
  }

  function lowerBetter(id, row) {
    const def = protoDef(id);
    if (def) return !!def.lowerIsBetter;
    const d = row && row.direction;
    return d === 'lower' || d === 'down';
  }

  function numOf(v) {
    if (typeof v === 'number' && isFinite(v)) return v;
    if (v && typeof v === 'object' && typeof v.value === 'number' && isFinite(v.value)) return v.value;
    return null;
  }

  function readinessOf(u, workouts) {
    const p = P();
    if (!p || typeof p.readiness !== 'function') return null;
    try {
      return p.readiness(u, { workouts: workouts, bodyMetrics: weightRows(u) }) || null;
    } catch (e) { return null; }
  }

  function bestOf(id, u, workouts) {
    const p = P();
    if (!p || typeof p.currentBest !== 'function') return null;
    try {
      return p.currentBest(id, { workouts: workouts, bodyMetrics: weightRows(u) }) || null;
    } catch (e) { return null; }
  }

  function tiersOf(id, u) {
    const p = P();
    if (!p || typeof p.tiersFor !== 'function') return null;
    try { return p.tiersFor(id, u) || null; } catch (e) { return null; }
  }

  // P3: best hold logged in training (setwork), for deadhang/plank rows.
  // Guarded: older/partial Protocols builds without trainingBest -> null.
  function trainingBestOf(id, workouts) {
    const p = P();
    if (!p || typeof p.trainingBest !== 'function') return null;
    try { return p.trainingBest(id, workouts) || null; } catch (e) { return null; }
  }

  // every test entry for these workouts, newest first (workoutsFor is date desc)
  function testRows(workouts) {
    const rows = [];
    (workouts || []).forEach(function (w) {
      ((w && w.entries) || []).forEach(function (en) {
        if (en && en.type === 'test') rows.push({ w: w, en: en });
      });
    });
    return rows;
  }

  // headline value for a test entry: acft -> cached score, else results.value
  // (numbers, or strings like 'pass' — Protocols.fmtValue understands both)
  function resultValueOf(en) {
    const def = protoDef(en.protocol);
    if (def && def.kind === 'multi') {
      return typeof en.score === 'number' && isFinite(en.score) ? en.score : null;
    }
    const v = en.results ? en.results.value : undefined;
    if (typeof v === 'number' && isFinite(v)) return v;
    if (typeof v === 'string' && v) return v;
    return typeof en.score === 'number' && isFinite(en.score) ? en.score : null;
  }

  // a protocol the wizard can record (excludes derived rows like trapbar_rel)
  function recordable(def) {
    return !!def && !def.derived && def.kind !== 'ratio';
  }

  /* ======================================================================
     Static copy (view copy only — all tier/scoring data lives in Protocols)
     ====================================================================== */

  // bullseye — same stroke language as App.icons
  const STANDARDS_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" ' +
    'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ' +
    'aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.6"/><path d="M12 11.9v.2"/></svg>';

  const PHASE_LABEL = { base: 'Base', build: 'Build', peak: 'Peak', taper: 'Taper' };

  const PHASE_GUIDANCE = {
    base: 'Build the aerobic engine and durability — easy volume now buys the hard efforts later.',
    build: 'Layer in event-specific work: tempo runs, loaded rucks, strength that transfers.',
    peak: 'Sharpen up — goal-pace efforts, full-distance rehearsals, heaviest sustainable loads.',
    taper: 'Cut volume, keep short touches of intensity, and arrive fresh — fitness is banked.'
  };

  // ACFT event UI metadata (labels + input handling only; scoring tables live
  // in Protocols.scoreACFT). Raw units per the contract: mdl lb, spt m,
  // hrp reps, sdc/plk/tmr seconds. `plain` sets what a colon-less number
  // means in a clock field: sdc and plk are short sub-5-minute efforts where
  // a bare '90' reads as 90 seconds, while tmr mirrors run2mi — a bare '14'
  // reads as 14 minutes.
  const ACFT_EVENTS = [
    { id: 'mdl', label: '3-Rep Max Deadlift', hint: 'lb', mode: 'num' },
    { id: 'spt', label: 'Standing Power Throw', hint: 'm', mode: 'num' },
    { id: 'hrp', label: 'Hand-Release Push-ups', hint: 'reps', mode: 'int' },
    { id: 'sdc', label: 'Sprint-Drag-Carry', hint: 'mm:ss', mode: 'clock', plain: 'sec' },
    { id: 'plk', label: 'Plank', hint: 'mm:ss', mode: 'clock', plain: 'sec' },
    { id: 'tmr', label: '2-Mile Run', hint: 'mm:ss', mode: 'clock', plain: 'min' }
  ];

  function acftRawText(evId, raw) {
    if (typeof raw !== 'number' || !isFinite(raw)) return '—';
    const ev = ACFT_EVENTS.find(function (x) { return x.id === evId; });
    if (ev && ev.mode === 'clock') return fmtClock(raw);
    if (evId === 'mdl') return raw + ' lb';
    if (evId === 'spt') return raw + ' m';
    return raw + ' reps';
  }

  function scoreAcftFor(results, owner) {
    const p = P();
    if (!p || typeof p.scoreACFT !== 'function') return null;
    const prof = (owner && owner.profile) || {};
    try {
      return p.scoreACFT(results || {}, { sex: prof.sex || null, birthYear: prof.birthYear || null }) || null;
    } catch (e) { return null; }
  }

  function hasProfileFor(u) {
    const prof = (u && u.profile) || {};
    return (prof.sex === 'male' || prof.sex === 'female') && !!prof.birthYear;
  }

  function kindHint(def) {
    if (def.kind === 'multi') return '6 events · scored by age & sex';
    if (def.kind === 'time') return 'For time — mm:ss';
    if (def.kind === 'hold') return 'Max hold — mm:ss';
    if (def.kind === 'pass') return 'Pass / fail · time optional';
    return 'Max reps';
  }

  /* ======================================================================
     View registration
     ====================================================================== */

  App.registerView('standards', {
    title: 'Standards',
    icon: STANDARDS_ICON,
    nav: true,
    order: 55,
    visible: function () { return App.isPerformance(); },
    render: renderStandards
  });

  /* ======================================================================
     Render
     ====================================================================== */

  function renderStandards(container) {
    const u = curUser();
    // mode gate: never render outside performance mode
    if (!u || !App.isPerformance()) { App.navigate('dashboard'); return; }

    let html = '<div class="view-head"><h2>Standards</h2>' +
      '<div class="sub">Where you stand against the selection standards.</div></div>';

    if (!P()) {
      html += '<section class="card">' +
        emptyHtml(App.icons.test, 'Standards engine unavailable',
          'protocols.js did not load. Refresh the app — if this keeps happening, reinstall it.') +
        '</section>';
      container.innerHTML = html;
      return;
    }

    const w = myWorkouts();
    const today = U.todayStr();
    const rd = readinessOf(u, w);
    const tests = testRows(w);

    /* prominent record button */
    html += '<button type="button" class="btn primary" data-act="record" ' +
      'style="width:100%;min-height:52px;font-size:16px">' +
      App.icons.plus + ' Record a test</button>';

    /* weakest-link callout */
    if (rd && rd.weakest) {
      const wkRow = (rd.rows || []).find(function (r) { return r.protocolId === rd.weakest; });
      if (wkRow) {
        const cur = numOf(wkRow.current);
        const comp = numOf(wkRow.competitive);
        const lower = lowerBetter(wkRow.protocolId, wkRow);
        let line = wkRow.name || protoName(wkRow.protocolId);
        if (cur === null) {
          line += ' — not tested yet';
        } else if (comp !== null) {
          line += lower
            ? ' — ' + fmtVal(wkRow.protocolId, cur) + ' (competitive ' + fmtVal(wkRow.protocolId, comp) + ')'
            : ' — ' + fmtVal(wkRow.protocolId, cur) + ' of ' + fmtVal(wkRow.protocolId, comp);
        } else {
          line += ' — ' + fmtVal(wkRow.protocolId, cur);
        }
        const testable = recordable(protoDef(wkRow.protocolId));
        html += '<section class="card" style="border-color:rgba(255,159,10,.45);background:rgba(255,159,10,.08)">' +
          '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">' +
          '<span style="flex:none;width:44px;height:44px;border-radius:12px;display:inline-flex;' +
          'align-items:center;justify-content:center;background:rgba(255,159,10,.16);color:var(--orange)">' +
          sizedIcon(App.icons.flame, 22) + '</span>' +
          '<div style="flex:1;min-width:200px">' +
          '<div style="font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;' +
          'color:var(--orange)">Attack this</div>' +
          '<div style="font-weight:700;font-size:16px;line-height:1.35">' + U.esc(line) + '</div></div>' +
          (testable
            ? '<button type="button" class="btn ghost small" data-test-proto="' +
              U.esc(wkRow.protocolId) + '">Test it</button>'
            : '') +
          '</div></section>';
      }
    }

    /* readiness scorecard */
    const overallBadge = rd && typeof rd.overallPct === 'number' && isFinite(rd.overallPct)
      ? '<span class="badge green">' + Math.round(U.clamp(rd.overallPct, 0, 1) * 100) + '% overall</span>'
      : '';
    html += cardOpen('Readiness', overallBadge);
    if (!rd || !(rd.rows || []).length) {
      html += emptyHtml(STANDARDS_ICON, 'No standards to track yet',
        'Pick a goal in Settings › Training and your scorecard will build itself here.',
        '<button type="button" class="btn primary" data-act="go-settings">Open Settings</button>');
    } else {
      html += '<div class="std-list">' + rd.rows.map(function (r) {
        return stdRowHTML(r, w);
      }).join('') + '</div>';
      html += '<p class="muted" style="font-size:12px;margin-top:10px">Bars show progress toward the ' +
        'competitive tier — the notch marks the minimum standard.</p>';
    }
    html += '</section>';

    /* phase / countdown */
    html += cardOpen('Countdown');
    const selDate = u.goals && u.goals.selectionDate;
    if (selDate && U.daysBetween(today, selDate) >= 0) {
      let ph = null;
      const p = P();
      if (p && typeof p.phaseFor === 'function') {
        try { ph = p.phaseFor(selDate, today); } catch (e) { ph = null; }
      }
      if (ph) {
        // weeksOut is fractional (1 decimal) — count whole weeks remaining
        const wks = Math.ceil(typeof ph.weeksOut === 'number' && isFinite(ph.weeksOut) ? ph.weeksOut : 0);
        const headline = wks <= 0 ? 'Selection week'
          : wks + (wks === 1 ? ' week out' : ' weeks out');
        html += '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
          '<span style="font-size:28px;font-weight:800;letter-spacing:-.02em">' + U.esc(headline) + '</span>' +
          '<span class="badge green">' + U.esc(PHASE_LABEL[ph.phase] || capStr(ph.phase)) + '</span></div>';
        html += '<p style="font-size:14px;color:var(--text-2);line-height:1.55;margin:8px 0 0">' +
          U.esc(PHASE_GUIDANCE[ph.phase] || 'Keep stacking consistent weeks.') + '</p>';
        if (ph.heatBlock) {
          html += '<div style="display:flex;align-items:flex-start;gap:8px;margin-top:10px;color:var(--orange);' +
            'font-size:13px;font-weight:600;line-height:1.5">' +
            '<span style="flex:none;display:inline-flex;margin-top:1px">' + sizedIcon(App.icons.flame, 16) + '</span>' +
            '<span>Heat block — final 3 weeks. Train in the heat you will be tested in, and hydrate like it matters.</span></div>';
        }
        html += '<p class="muted" style="font-size:12px;margin-top:10px">Selection: ' +
          U.esc(U.fmtDateLong(selDate)) + '</p>';
      } else {
        html += '<p style="font-size:14px;color:var(--text-2)">Selection: ' + U.esc(U.fmtDateLong(selDate)) + '</p>';
      }
    } else if (selDate) {
      html += emptyHtml(App.icons.roadmap, 'Selection date has passed',
        'Set your next goal date in Settings › Training to restart the countdown.',
        '<button type="button" class="btn primary" data-act="go-settings">Open Settings</button>');
    } else {
      html += emptyHtml(App.icons.roadmap, 'No selection date yet',
        'Set your selection date in Settings › Training and the phase plan appears here.',
        '<button type="button" class="btn primary" data-act="go-settings">Open Settings</button>');
    }
    html += '</section>';

    /* test history */
    html += cardOpen('Test history');
    if (!tests.length) {
      html += emptyHtml(App.icons.test, 'No tests logged yet',
        'Test days are how you know the training works. Record your first one.',
        '<button type="button" class="btn primary" data-act="record">' + App.icons.plus + ' Record a test</button>');
    } else {
      const shown = tests.slice(0, 20);
      html += '<div class="list">' + shown.map(function (t) {
        const val = resultValueOf(t.en);
        return '<button type="button" class="list-row" data-wid="' + U.esc(t.w.id) + '">' +
          '<span class="leading">' + sizedIcon(App.icons.test, 20) + '</span>' +
          '<div class="body"><span class="title">' + U.esc(protoName(t.en.protocol)) + '</span>' +
          '<span class="sub">' + U.esc(U.relDate(t.w.date)) +
          (t.en.notes ? ' · ' + U.esc(t.en.notes) : '') + '</span></div>' +
          '<span class="trailing" style="font-weight:700">' +
          U.esc(val !== null ? fmtVal(t.en.protocol, val) : '—') + '</span></button>';
      }).join('') + '</div>';
      if (tests.length > shown.length) {
        html += '<p class="muted" style="font-size:12px;margin-top:8px">+ ' +
          (tests.length - shown.length) + ' earlier tests</p>';
      }
    }
    html += '</section>';

    container.innerHTML = html;

    /* events */
    U.on(container, 'click', '[data-act="record"]', function () { openProtocolPicker(u); });
    U.on(container, 'click', '[data-test-proto]', function (e, btn) {
      const pre = parseInt(btn.getAttribute('data-prefill-sec') || '', 10);
      openTestForm(btn.getAttribute('data-test-proto'), u,
        isFinite(pre) && pre > 0 ? { prefillSec: pre } : null);
    });
    U.on(container, 'click', '.list-row[data-wid]', function (e, row) {
      openTestDetail(row.getAttribute('data-wid'));
    });
    U.on(container, 'click', '[data-act="go-settings"]', function () { App.navigate('settings'); });
  }

  // The bar runs to the competitive tier with a notch at the minimum tier.
  // Protocols.readiness pct is anchored at the minimum (0 = at minimum,
  // 1 = competitive) for every protocol, so the notch sits at a fixed
  // position and pct fills the segment beyond it. The segment before the
  // notch is a display-only proportion of how close to minimum an
  // under-minimum result is (Protocols defines no sub-minimum scale).
  const MIN_TICK = 0.35;

  // One scorecard row: name · current/competitive · bar (min tick) · tiers line.
  // For the hold protocols (deadhang/plank) a secondary "training best" line
  // appears when a longer hold has been logged in training (setwork) than in
  // any recorded test — with a 'Record as test' CTA that opens the wizard
  // prefilled with that hold. Training data never moves the bar itself.
  function stdRowHTML(r, workouts) {
    const id = r.protocolId;
    const lower = lowerBetter(id, r);
    const cur = numOf(r.current);
    const min = numOf(r.min);
    const comp = numOf(r.competitive);
    const tested = r.current !== null && r.current !== undefined;
    const pct = U.clamp(typeof r.pct === 'number' && isFinite(r.pct) ? r.pct : 0, 0, 1);
    const tiered = min !== null && comp !== null;
    const metMin = tested && cur !== null && min !== null
      ? (lower ? cur <= min : cur >= min) : false;

    let fill = 0;
    let color = 'var(--accent)';
    if (tested) {
      if (!tiered) {
        fill = pct; // pass-style rows: tested -> 1
      } else if (metMin) {
        fill = MIN_TICK + pct * (1 - MIN_TICK);
      } else if (cur !== null) {
        const sub = lower
          ? (cur > 0 ? U.clamp(min / cur, 0, 1) : 0)
          : (min > 0 ? U.clamp(cur / min, 0, 1) : 0);
        fill = sub * MIN_TICK;
        color = 'var(--orange)';
      }
    }
    const testable = recordable(protoDef(id));
    const name = r.name || protoName(id);
    const curTxt = tested ? fmtVal(id, cur !== null ? cur : r.current) : null;

    let html = '';
    html += '<div class="std-row-top">' +
      '<span class="std-name">' + U.esc(name) + '</span>' +
      '<span class="std-val tabular">' +
      (tested
        ? '<b>' + U.esc(curTxt) + '</b>' +
          (comp !== null ? '<span class="muted"> / ' + U.esc(fmtVal(id, comp)) + '</span>' : '')
        : '<span class="muted">not tested</span>') +
      '</span></div>';
    html += '<div class="std-bar"><div class="progress-bar">' +
      '<span style="width:' + Math.round(fill * 100) + '%;background:' + color + '"></span></div>' +
      (tiered
        ? '<span class="tick" style="left:' + Math.round(MIN_TICK * 100) + '%" title="Minimum standard"></span>'
        : '') +
      '</div>';
    const subBits = [];
    if (r.min !== null && r.min !== undefined) subBits.push('Min ' + fmtVal(id, r.min));
    if (r.competitive !== null && r.competitive !== undefined) subBits.push('Competitive ' + fmtVal(id, r.competitive));
    subBits.push(r.lastTested ? 'tested ' + U.relDate(r.lastTested) : 'no test yet');
    html += '<div class="std-sub">' + U.esc(subBits.join(' · ')) + '</div>';

    // training-best line (holds only; trainingBestOf is null for other rows)
    let prefillSec = 0;
    const tb = trainingBestOf(id, workouts);
    const tbVal = tb ? numOf(tb.value) : null;
    if (tbVal !== null && tbVal > 0 && (cur === null || (lower ? tbVal < cur : tbVal > cur))) {
      prefillSec = Math.round(tbVal);
      html += '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;' +
        'margin-top:7px;font-size:12px;color:var(--text-2)">' +
        '<span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
        'Training best <b class="tabular">' + U.esc(fmtVal(id, tbVal)) + '</b>' +
        (cur === null ? ' — untested on the clock' : ' — beats your tested best') + '</span>' +
        (testable
          ? '<span class="btn ghost small" aria-hidden="true" style="pointer-events:none;flex:none">Record as test</span>'
          : '') +
        '</div>';
    }

    if (testable) {
      return '<button type="button" class="std-row" data-test-proto="' + U.esc(id) + '"' +
        (prefillSec > 0 ? ' data-prefill-sec="' + prefillSec + '"' : '') +
        ' title="Record a ' + U.esc(name) + ' test">' + html + '</button>';
    }
    return '<div class="std-row">' + html + '</div>';
  }

  /* ======================================================================
     Test wizard — step 1: protocol picker
     ====================================================================== */

  function openProtocolPicker(u) {
    const p = P();
    if (!p || !Array.isArray(p.LIST)) { App.toast('Standards engine unavailable', 'err'); return; }
    const w = myWorkouts();

    const box = document.createElement('div');
    box.innerHTML = '<div class="list">' + p.LIST.map(function (def) {
      const best = bestOf(def.id, u, w);
      const bestVal = best ? numOf(best.value) : null;
      return '<button type="button" class="list-row" data-proto="' + U.esc(def.id) + '">' +
        '<span class="leading">' + sizedIcon(App.icons.test, 20) + '</span>' +
        '<div class="body"><span class="title">' + U.esc(def.name) + '</span>' +
        '<span class="sub">' + U.esc(kindHint(def)) + '</span></div>' +
        (bestVal !== null
          ? '<span class="trailing tabular" style="font-size:13px">' +
            U.esc('best ' + fmtVal(def.id, bestVal)) + '</span>'
          : '') +
        '</button>';
    }).join('') + '</div>';

    const sheet = App.sheet({ title: 'Record a test', content: box });
    U.on(box, 'click', '.list-row[data-proto]', function (e, row) {
      const id = row.getAttribute('data-proto');
      sheet.close();
      openTestForm(id, u);
    });
  }

  /* ======================================================================
     Test wizard — step 2: per-protocol form
     ====================================================================== */

  function openTestForm(protocolId, u, opts) {
    const def = protoDef(protocolId);
    if (!recordable(def)) {
      App.toast('Derived from your lifts and body weight — log trap-bar deadlifts to move it', 'info');
      return;
    }
    if (def.kind === 'multi') openAcftForm(def, u);
    else openSimpleTestForm(def, u, opts);
  }

  function readDateField(root, id) {
    const el = U.$('#' + id, root);
    const v = el ? el.value : '';
    const today = U.todayStr();
    // typed dates can bypass the input's max, so also clamp future dates to
    // today (string compare is safe for YYYY-MM-DD)
    return /^\d{4}-\d{2}-\d{2}$/.test(v) && v <= today ? v : today;
  }

  function dateFieldHTML(id) {
    const today = U.todayStr();
    return '<div class="field"><label for="' + id + '">Date</label>' +
      '<input class="input" id="' + id + '" type="date" value="' + today + '" max="' + today + '"></div>';
  }

  const BIG_NUM_STYLE = 'font-size:24px;font-weight:600;text-align:center;min-height:52px';

  /* ---------- time / hold / reps / pass ---------- */

  function openSimpleTestForm(def, u, opts) {
    const isClock = def.kind === 'time' || def.kind === 'hold';
    const plain = plainUnitOf(def.id);
    const plainHint = plain === 'min' ? 'mm:ss or minutes' : 'mm:ss or raw seconds';
    const st = { pass: null };

    let html = dateFieldHTML('sf-date');
    if (isClock) {
      html += '<div class="field"><label for="sf-value">' +
        U.esc(def.kind === 'hold' ? 'Hold time' : 'Time') +
        ' <span class="muted">(' + plainHint + ')</span></label>' +
        '<input class="input" id="sf-value" type="text" inputmode="numeric" autocomplete="off" ' +
        'style="' + BIG_NUM_STYLE + '" placeholder="mm:ss">' +
        '<p class="muted tabular" id="sf-live" style="font-size:13px;min-height:18px;margin:6px 2px 0"></p></div>';
    } else if (def.kind === 'pass') {
      html += '<div class="field"><label>Result</label><div class="segmented block">' +
        '<button type="button" class="seg" data-pf="1" aria-pressed="false">Pass</button>' +
        '<button type="button" class="seg" data-pf="0" aria-pressed="false">Fail</button>' +
        '</div></div>' +
        '<div class="field"><label for="sf-value">Time <span class="muted">(optional — ' + plainHint + ')</span></label>' +
        '<input class="input" id="sf-value" type="text" inputmode="numeric" autocomplete="off" ' +
        'style="' + BIG_NUM_STYLE + '" placeholder="mm:ss">' +
        '<p class="muted tabular" id="sf-live" style="font-size:13px;min-height:18px;margin:6px 2px 0"></p></div>';
    } else {
      html += '<div class="field"><label for="sf-value">Reps</label>' +
        '<input class="input" id="sf-value" type="text" inputmode="numeric" autocomplete="off" ' +
        'style="' + BIG_NUM_STYLE + '" placeholder="0"></div>';
    }
    html += '<div class="field"><label for="sf-notes">Notes</label>' +
      '<textarea class="input" id="sf-notes" rows="2" placeholder="Optional"></textarea></div>';

    const content = document.createElement('div');
    content.innerHTML = html;

    if (isClock || def.kind === 'pass') {
      const valEl = U.$('#sf-value', content);
      const liveEl = U.$('#sf-live', content);
      valEl.addEventListener('input', function () {
        const sec = parseClock(maskClockInput(valEl), plain);
        liveEl.textContent = sec === null || sec <= 0 ? '' : '= ' + fmtVal(def.id, Math.round(sec));
      });
      // P3: the 'Record as test' CTA on a scorecard row prefills the field
      // with the training best — fully editable, live line primed to match.
      const preSec = opts && typeof opts.prefillSec === 'number' &&
        isFinite(opts.prefillSec) && opts.prefillSec > 0 ? Math.round(opts.prefillSec) : 0;
      if (preSec && isClock) {
        valEl.value = fmtClock(preSec);
        liveEl.textContent = '= ' + fmtVal(def.id, preSec);
      }
    }
    U.on(content, 'click', '[data-pf]', function (e, btn) {
      st.pass = btn.getAttribute('data-pf') === '1';
      U.$$('[data-pf]', content).forEach(function (b) {
        const on = (b.getAttribute('data-pf') === '1') === st.pass;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    });

    App.sheet({
      title: def.name,
      content: content,
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        {
          label: 'Save test',
          kind: 'primary',
          keepOpen: true,
          onClick: function (api) {
            let value = null;
            let timeSec = null;
            if (isClock) {
              const sec = parseClock(U.$('#sf-value', content).value, plain);
              if (sec === null || sec <= 0) {
                App.toast('Enter a time like 13:42, or ' +
                  (plain === 'min' ? 'minutes' : 'raw seconds'), 'err');
                focusInput('sf-value');
                return;
              }
              value = Math.round(sec);
              timeSec = value;
            } else if (def.kind === 'pass') {
              // canonical shapes: {value: seconds} when timed, {value: 'pass'|'fail'}
              const sec = parseClock(U.$('#sf-value', content).value, plain);
              timeSec = sec !== null && sec > 0 ? Math.round(sec) : null;
              if (timeSec === null && st.pass === null) {
                App.toast('Pick pass or fail — or enter a time', 'err');
                return;
              }
              value = timeSec !== null ? timeSec : (st.pass ? 'pass' : 'fail');
            } else {
              const n = parseInt(U.$('#sf-value', content).value, 10);
              if (isNaN(n) || n < 0) {
                App.toast('Enter your rep count', 'err');
                focusInput('sf-value');
                return;
              }
              value = n;
            }
            const en = { id: U.uid('en'), type: 'test', protocol: def.id, results: { value: value } };
            if (def.kind === 'pass' && timeSec !== null && st.pass !== null) en.results.pass = st.pass;
            const notes = U.$('#sf-notes', content).value.trim();
            if (notes) en.notes = notes;
            const durationMin = timeSec !== null && timeSec > 0
              ? Math.max(1, Math.round(timeSec / 60)) : null;
            saveTest(u, def, en, readDateField(content, 'sf-date'), durationMin, st);
            api.close();
          }
        }
      ]
    });
    focusInput('sf-value');
  }

  /* ---------- ACFT: 6 events, live per-event points + running total ---------- */

  function openAcftForm(def, u) {
    const profiled = hasProfileFor(u);
    let lastOut = null;
    let lastResults = {};

    let html = dateFieldHTML('af-date');
    if (!profiled) {
      html += '<p class="hint" style="margin:-4px 2px 10px">Set sex and birth year in ' +
        'Settings › Training so events score against your bracket.</p>';
    }
    html += ACFT_EVENTS.map(function (ev) {
      return '<div class="acft-row">' +
        '<label for="af-' + ev.id + '">' + U.esc(ev.label) +
        ' <span class="muted">(' + U.esc(ev.hint) + ')</span></label>' +
        '<input class="input" id="af-' + ev.id + '" data-af="' + ev.id + '" data-mode="' + ev.mode + '" ' +
        'type="text" inputmode="' + (ev.mode === 'num' ? 'decimal' : 'numeric') + '" autocomplete="off" ' +
        'placeholder="' + U.esc(ev.hint) + '">' +
        '<span class="pts tabular" id="af-pts-' + ev.id + '">—</span>' +
        '</div>';
    }).join('');
    html += '<div class="acft-total"><span>Total</span>' +
      '<span style="display:inline-flex;align-items:center;gap:8px">' +
      '<span class="badge" id="af-pass" hidden></span>' +
      '<b class="tabular" id="af-total" style="font-size:18px">—</b></span></div>';
    html += '<div class="field" style="margin-top:12px"><label for="af-notes">Notes</label>' +
      '<textarea class="input" id="af-notes" rows="2" placeholder="Optional"></textarea></div>';

    const content = document.createElement('div');
    content.innerHTML = html;

    function readEvents() {
      const res = {};
      ACFT_EVENTS.forEach(function (ev) {
        const inp = U.$('#af-' + ev.id, content);
        const raw = inp ? String(inp.value).trim() : '';
        if (!raw) return;
        let v = null;
        if (ev.mode === 'clock') {
          const sec = parseClock(raw, ev.plain);
          if (sec !== null && sec > 0) v = Math.round(sec);
        } else if (ev.mode === 'int') {
          const n = parseInt(raw, 10);
          if (!isNaN(n) && n >= 0) v = n;
        } else {
          const n = parseFloat(raw);
          if (!isNaN(n) && n >= 0) v = Math.round(n * 10) / 10;
        }
        if (v !== null) res[ev.id] = v;
      });
      return res;
    }

    function recompute() {
      lastResults = readEvents();
      const entered = Object.keys(lastResults).length;
      lastOut = entered ? scoreAcftFor(lastResults, u) : null;
      ACFT_EVENTS.forEach(function (ev) {
        const cell = U.$('#af-pts-' + ev.id, content);
        if (!cell) return;
        const evOut = lastOut && lastOut.events && lastOut.events[ev.id];
        const pts = evOut && typeof evOut.points === 'number' && isFinite(evOut.points) ? evOut.points : null;
        cell.textContent = pts === null ? '—' : pts + ' pts';
        cell.style.color = pts === null ? '' : (pts >= 60 ? 'var(--accent)' : 'var(--orange)');
      });
      const totalEl = U.$('#af-total', content);
      const passEl = U.$('#af-pass', content);
      const total = lastOut && typeof lastOut.total === 'number' && isFinite(lastOut.total) ? lastOut.total : null;
      totalEl.textContent = total === null ? '—' : total + ' pts';
      if (lastOut && entered === ACFT_EVENTS.length) {
        passEl.hidden = false;
        passEl.textContent = lastOut.pass ? 'Pass' : 'Below 60s';
        passEl.style.background = lastOut.pass ? 'var(--accent-tint)' : 'rgba(255,159,10,.16)';
        passEl.style.color = lastOut.pass ? 'var(--accent)' : 'var(--orange)';
      } else {
        passEl.hidden = true;
      }
    }

    U.on(content, 'input', 'input[data-af]', function (e, inp) {
      if (inp.getAttribute('data-mode') === 'clock') maskClockInput(inp);
      recompute();
    });
    recompute();

    App.sheet({
      title: 'ACFT',
      content: content,
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        {
          label: 'Save test',
          kind: 'primary',
          keepOpen: true,
          onClick: function (api) {
            recompute();
            if (!Object.keys(lastResults).length) {
              App.toast('Enter at least one event', 'err');
              focusInput('af-mdl');
              return;
            }
            const en = { id: U.uid('en'), type: 'test', protocol: def.id, results: lastResults };
            // cache the score at save per the contract — but only when the
            // user has a real sex/birth-year profile: scoreACFT silently
            // defaults to the male 17-21 bracket otherwise, and that wrong
            // number would be persisted on the synced entry
            if (hasProfileFor(u) && lastOut && typeof lastOut.total === 'number' && isFinite(lastOut.total)) {
              en.score = lastOut.total;
            }
            const notes = U.$('#af-notes', content).value.trim();
            if (notes) en.notes = notes;
            saveTest(u, def, en, readDateField(content, 'af-date'), null);
            api.close();
            if (en.score === undefined) {
              App.toast('Saved — set sex & birth year in Settings to score it', 'info');
            }
          }
        }
      ]
    });
    focusInput('af-mdl');
  }

  /* ---------- save + tier toast ---------- */

  function saveTest(u, def, en, dateStr, durationMin, st) {
    Store.addWorkout({
      userId: u.id,
      date: dateStr,
      name: def.name,
      kind: 'test',
      durationMin: durationMin,
      entries: [en]
    });
    tierToast(def, en, u, st);
  }

  // Compare the fresh result against this user's tiers:
  // met competitive / met minimum / below minimum.
  function tierToast(def, en, u, st) {
    const value = def.kind === 'multi'
      ? (typeof en.score === 'number' && isFinite(en.score) ? en.score : null)
      : (en.results && typeof en.results.value === 'number' ? en.results.value : null);

    const tiers = tiersOf(def.id, u);
    const min = tiers ? numOf(tiers.min) : null;
    const comp = tiers ? numOf(tiers.competitive) : null;

    if (value === null || min === null || comp === null) {
      if (def.kind === 'pass') {
        const passed = en.results && en.results.value === 'pass' ? true
          : en.results && en.results.value === 'fail' ? false
          : st && st.pass !== null && st.pass !== undefined ? st.pass : null;
        if (passed === true) { App.toast('Pass — standard met', 'ok'); return; }
        if (passed === false) { App.toast('Logged — chase that pass', 'info'); return; }
      }
      App.toast('Test saved', 'ok');
      return;
    }

    const lower = !!def.lowerIsBetter;
    const metComp = lower ? value <= comp : value >= comp;
    const metMin = lower ? value <= min : value >= min;
    if (metComp) {
      App.toast('Competitive standard met — ' + fmtVal(def.id, value) +
        ' (target ' + fmtVal(def.id, comp) + ')', 'ok');
    } else if (metMin) {
      App.toast('Minimum met — ' + fmtVal(def.id, value) +
        ' · competitive is ' + fmtVal(def.id, comp), 'info');
    } else {
      App.toast('Below minimum — ' + fmtVal(def.id, value) +
        ' vs ' + fmtVal(def.id, min) + ' required', 'err');
    }
  }

  /* ======================================================================
     Test detail sheet
     ====================================================================== */

  function acftTableHTML(en, owner) {
    const res = en.results || {};
    const out = scoreAcftFor(res, owner);
    let html = '<div class="table-wrap"><table class="table"><thead><tr>' +
      '<th>Event</th><th class="num">Raw</th><th class="num">Points</th></tr></thead><tbody>';
    html += ACFT_EVENTS.map(function (ev) {
      const evOut = out && out.events && out.events[ev.id];
      const pts = evOut && typeof evOut.points === 'number' && isFinite(evOut.points) ? String(evOut.points) : '—';
      return '<tr><td>' + U.esc(ev.label) + '</td>' +
        '<td class="num">' + U.esc(acftRawText(ev.id, res[ev.id])) + '</td>' +
        '<td class="num">' + U.esc(pts) + '</td></tr>';
    }).join('');
    html += '</tbody></table></div>';
    // the per-event points column comes from the live rescore, so the Total
    // must too — fall back to the cached score only when live scoring is
    // impossible (e.g. protocols.js unavailable)
    const total = out && typeof out.total === 'number' && isFinite(out.total) ? out.total
      : (typeof en.score === 'number' && isFinite(en.score) ? en.score : null);
    html += '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;' +
      'font-weight:700;padding:10px 2px 0">' +
      '<span>Total</span><span class="tabular">' +
      (total === null ? '—' : U.esc(total + ' pts') +
        (out && out.pass ? ' <span class="badge green">Pass</span>' : '')) +
      '</span></div>';
    return html;
  }

  function openTestDetail(workoutId) {
    const w = Store.workoutById(workoutId);
    if (!w) return;
    const owner = ((Store.state && Store.state.users) || []).find(function (x) {
      return x.id === w.userId;
    }) || curUser();
    const testEs = (w.entries || []).filter(function (en) { return en && en.type === 'test'; });

    let html = '<p class="muted" style="font-size:13px;margin-bottom:12px">' +
      U.esc(U.fmtDateLong(w.date)) +
      (w.durationMin ? ' · ' + U.esc(U.fmtDuration(w.durationMin)) : '') + '</p>';

    testEs.forEach(function (en) {
      const def = protoDef(en.protocol);
      html += '<div class="card" style="padding:12px 14px;margin-bottom:12px">';
      html += '<div style="display:flex;align-items:center;gap:8px;font-weight:600;margin-bottom:6px">' +
        sizedIcon(App.icons.test, 18) + '<span>' + U.esc(protoName(en.protocol)) + '</span></div>';
      if (def && def.kind === 'multi') {
        html += acftTableHTML(en, owner);
      } else {
        const v = resultValueOf(en);
        html += kvRow('Result', v !== null ? fmtVal(en.protocol, v) : '—');
        const tiers = tiersOf(en.protocol, owner);
        const min = tiers ? numOf(tiers.min) : null;
        const comp = tiers ? numOf(tiers.competitive) : null;
        if (min !== null) html += kvRow('Minimum', fmtVal(en.protocol, min));
        if (comp !== null) html += kvRow('Competitive', fmtVal(en.protocol, comp));
      }
      if (en.notes) html += kvRow('Notes', en.notes);
      html += '</div>';
    });

    if (w.rpe || w.feel || w.checkin) {
      const bits = [];
      if (w.rpe) bits.push('RPE ' + w.rpe);
      if (w.feel) bits.push('Felt ' + String(w.feel));
      html += '<p style="font-size:14px;color:var(--text-2)">' + U.esc(bits.join(' · ')) +
        (w.checkin ? (bits.length ? '<br>' : '') + '“' + U.esc(w.checkin) + '”' : '') + '</p>';
    }
    if (w.notes) {
      html += '<p style="font-size:14px;color:var(--text-2);white-space:pre-wrap">' + U.esc(w.notes) + '</p>';
    }

    App.sheet({
      title: w.name || 'Test',
      content: html,
      actions: [
        {
          label: 'Delete',
          kind: 'danger',
          onClick: function () {
            App.confirm({
              title: 'Delete test?',
              message: '“' + (w.name || 'Test') + '” on ' + U.fmtDateLong(w.date) +
                ' will be permanently deleted. Readiness will fall back to your previous best.',
              danger: true
            }).then(function (ok) {
              if (ok) {
                Store.deleteWorkout(w.id);
                App.toast('Test deleted');
              }
            });
          }
        },
        { label: 'Close', kind: 'ghost' }
      ]
    });
  }
})();
