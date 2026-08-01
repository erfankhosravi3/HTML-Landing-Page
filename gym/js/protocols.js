/* IronLog — Protocols: standards reference data + scoring math (P2 addendum).
   Pure module: no DOM, no Store — reference tables are versioned code, never
   user data; user overrides live in user.goals.targets. Analytics is read
   lazily (trap-bar e1RM); everything is node-testable with a window/U stub.

   ACFT scoring encodes the official April 2022 US Army ACFT scoring scales as
   ANCHOR ROWS at 0 / 60 / 70 / 80 / 90 / 100 points per event, age bracket
   (17-21, 22-26, 27-31, 32-36, 37-41, 42-46, 47-51, 52-56, 57-61, 62+) and
   sex. Raw values between anchors are linearly interpolated and rounded, so a
   score between anchor rows can differ by a point or two from the printed
   table; anchor values themselves (notably the 60-point pass lines and
   100-point maxima) follow the official scales. Points clamp to [0, 100].

   Units: time/hold protocol values are SECONDS; reps are reps; acft raw
   values are lb (mdl), meters (spt), reps (hrp) and seconds (sdc, plk, tmr);
   trapbar_rel is a unit-free bodyweight ratio (kg / kg). */
(function () {
  'use strict';

  const Protocols = {};

  /* ---------- protocol catalogue ---------- */

  const ACFT_EVENTS = [
    { id: 'mdl', name: '3-Rep Max Deadlift', unit: 'lb' },
    { id: 'spt', name: 'Standing Power Throw', unit: 'm' },
    { id: 'hrp', name: 'Hand-Release Push-ups', unit: 'reps' },
    { id: 'sdc', name: 'Sprint-Drag-Carry', unit: 'mm:ss', lowerIsBetter: true },
    { id: 'plk', name: 'Plank', unit: 'mm:ss' },
    { id: 'tmr', name: '2-Mile Run', unit: 'mm:ss', lowerIsBetter: true }
  ];

  // Ordered, recordable protocols (ids match P1 test entries in views-log.js).
  const LIST = [
    { id: 'acft', name: 'ACFT', kind: 'multi', unit: 'pts', events: ACFT_EVENTS },
    { id: 'run2mi', name: '2-mile run', kind: 'time', unit: 'mm:ss', lowerIsBetter: true },
    { id: 'run5mi', name: '5-mile run', kind: 'time', unit: 'mm:ss', lowerIsBetter: true },
    { id: 'ruck12mi', name: '12-mile ruck', kind: 'time', unit: 'h:mm:ss', lowerIsBetter: true },
    { id: 'pushups2min', name: 'Push-ups (2 min)', kind: 'reps', unit: 'reps' },
    { id: 'situps2min', name: 'Sit-ups (2 min)', kind: 'reps', unit: 'reps' },
    { id: 'pullups_max', name: 'Pull-ups (max)', kind: 'reps', unit: 'reps' },
    { id: 'plank', name: 'Plank hold', kind: 'hold', unit: 'mm:ss' },
    { id: 'deadhang', name: 'Dead hang', kind: 'hold', unit: 'mm:ss' },
    { id: 'swim500m', name: '500 m swim', kind: 'pass', unit: 'mm:ss', lowerIsBetter: true },
    { id: 'slcalf_l', name: 'Single-leg calf raises (L)', kind: 'reps', unit: 'reps' },
    { id: 'slcalf_r', name: 'Single-leg calf raises (R)', kind: 'reps', unit: 'reps' }
  ];

  // Derived pseudo-protocol (not recordable, so not in LIST): best trap-bar
  // deadlift e1RM / latest bodyweight. byId and readiness know it.
  const TRAPBAR_REL = {
    id: 'trapbar_rel', name: 'Trap-bar deadlift', kind: 'ratio', unit: '×BW', derived: true
  };

  const BY_ID = {};
  for (const p of LIST) BY_ID[p.id] = p;
  BY_ID[TRAPBAR_REL.id] = TRAPBAR_REL;

  Protocols.LIST = LIST;
  Protocols.byId = function (id) {
    return BY_ID[id] || null;
  };

  /* ---------- ACFT scoring tables ----------
     Per event and sex: 10 bracket rows (17-21 .. 62+), each row the raw
     values at [0, 60, 70, 80, 90, 100] points. Rows are strictly monotonic —
     ascending for higher-is-better events, descending for timed events. */

  const POINT_ANCHORS = [0, 60, 70, 80, 90, 100];

  const MDL_M = [
    [80, 140, 180, 230, 300, 340],   // 17-21
    [80, 140, 190, 240, 310, 340],   // 22-26
    [80, 140, 190, 240, 310, 340],   // 27-31
    [80, 140, 190, 240, 300, 340],   // 32-36
    [80, 140, 180, 230, 300, 340],   // 37-41
    [80, 140, 180, 230, 290, 330],   // 42-46
    [80, 140, 170, 220, 280, 320],   // 47-51
    [80, 140, 170, 210, 270, 310],   // 52-56
    [80, 140, 160, 200, 250, 300],   // 57-61
    [80, 140, 150, 190, 230, 290]    // 62+
  ];
  const MDL_F = [
    [80, 140, 150, 160, 180, 210],
    [80, 140, 150, 170, 190, 220],
    [80, 140, 160, 180, 200, 230],
    [80, 140, 160, 180, 200, 230],
    [80, 140, 160, 180, 200, 230],
    [80, 140, 150, 170, 190, 220],
    [80, 140, 150, 160, 180, 210],
    [80, 140, 145, 155, 170, 200],
    [80, 140, 145, 150, 165, 190],
    [80, 140, 142, 148, 160, 180]
  ];

  const SPT_M = [
    [3.9, 6.0, 6.8, 7.8, 9.5, 12.5],
    [4.0, 6.3, 7.1, 8.1, 9.9, 12.6],
    [4.0, 6.3, 7.1, 8.2, 10.0, 12.7],
    [3.9, 6.2, 7.0, 8.1, 9.8, 12.5],
    [3.8, 6.0, 6.8, 7.8, 9.4, 12.2],
    [3.7, 5.8, 6.5, 7.4, 9.0, 11.8],
    [3.6, 5.6, 6.3, 7.1, 8.6, 11.2],
    [3.4, 5.3, 5.9, 6.7, 8.0, 10.6],
    [3.2, 5.0, 5.6, 6.3, 7.5, 9.9],
    [3.0, 4.7, 5.2, 5.9, 7.0, 9.2]
  ];
  const SPT_F = [
    [2.6, 3.9, 4.5, 5.1, 6.1, 8.4],
    [2.7, 4.0, 4.6, 5.3, 6.4, 8.5],
    [2.8, 4.1, 4.7, 5.4, 6.5, 8.6],
    [2.8, 4.0, 4.6, 5.3, 6.4, 8.5],
    [2.7, 3.9, 4.5, 5.1, 6.2, 8.3],
    [2.6, 3.8, 4.3, 4.9, 5.9, 8.0],
    [2.5, 3.6, 4.1, 4.7, 5.6, 7.6],
    [2.4, 3.4, 3.9, 4.4, 5.2, 7.2],
    [2.2, 3.2, 3.6, 4.1, 4.9, 6.7],
    [2.1, 3.0, 3.4, 3.8, 4.5, 6.2]
  ];

  const HRP_M = [
    [0, 10, 16, 23, 33, 57],
    [0, 10, 17, 25, 36, 61],
    [0, 10, 17, 25, 37, 62],
    [0, 10, 17, 24, 36, 60],
    [0, 10, 16, 23, 34, 57],
    [0, 9, 15, 21, 31, 53],
    [0, 8, 14, 19, 28, 48],
    [0, 7, 12, 17, 25, 43],
    [0, 6, 11, 15, 22, 38],
    [0, 5, 9, 13, 19, 33]
  ];
  const HRP_F = [
    [0, 10, 14, 19, 27, 50],
    [0, 10, 14, 20, 28, 52],
    [0, 10, 15, 20, 29, 53],
    [0, 10, 14, 20, 28, 51],
    [0, 9, 13, 19, 26, 48],
    [0, 8, 12, 17, 24, 44],
    [0, 7, 11, 15, 21, 40],
    [0, 6, 10, 13, 19, 36],
    [0, 5, 8, 11, 16, 31],
    [0, 4, 7, 10, 14, 27]
  ];

  const SDC_M = [
    [215, 148, 134, 121, 107, 93],   // 2:28 pass, 1:33 max
    [212, 145, 131, 118, 104, 91],
    [212, 145, 131, 118, 104, 91],
    [215, 148, 134, 120, 106, 92],
    [220, 152, 138, 124, 110, 95],
    [227, 158, 143, 129, 114, 99],
    [235, 165, 150, 135, 120, 104],
    [245, 173, 157, 142, 126, 110],
    [256, 182, 166, 150, 133, 117],
    [268, 192, 175, 158, 141, 124]
  ];
  const SDC_F = [
    [235, 175, 160, 145, 129, 112],
    [232, 172, 157, 142, 127, 110],
    [232, 172, 157, 142, 127, 110],
    [236, 175, 160, 145, 129, 112],
    [242, 180, 164, 149, 133, 116],
    [250, 187, 171, 155, 138, 121],
    [259, 195, 178, 162, 145, 127],
    [270, 204, 187, 170, 152, 134],
    [282, 214, 196, 178, 160, 141],
    [295, 225, 206, 187, 168, 149]
  ];

  // Plank standards are the same for both sexes.
  const PLK_X = [
    [30, 90, 110, 132, 168, 220],    // 1:30 pass, 3:40 max
    [30, 92, 112, 135, 172, 225],
    [30, 92, 112, 135, 172, 225],
    [30, 90, 110, 132, 168, 220],
    [28, 88, 107, 128, 163, 214],
    [26, 84, 102, 122, 156, 205],
    [24, 80, 97, 116, 148, 195],
    [22, 75, 91, 109, 139, 183],
    [20, 70, 85, 102, 130, 171],
    [18, 65, 79, 94, 120, 158]
  ];

  const TMR_M = [
    [1620, 1320, 1180, 1046, 920, 802],  // 22:00 pass, 13:22 max
    [1632, 1330, 1189, 1054, 926, 806],
    [1650, 1345, 1202, 1065, 936, 813],
    [1668, 1360, 1215, 1077, 946, 821],
    [1692, 1380, 1233, 1092, 959, 831],
    [1722, 1405, 1255, 1112, 976, 845],
    [1758, 1435, 1282, 1136, 997, 862],
    [1800, 1470, 1313, 1163, 1020, 881],
    [1848, 1510, 1349, 1194, 1046, 902],
    [1902, 1555, 1389, 1229, 1076, 926]
  ];
  const TMR_F = [
    [1770, 1402, 1265, 1136, 1027, 929], // 23:22 pass
    [1782, 1412, 1274, 1144, 1034, 935],
    [1800, 1427, 1287, 1156, 1045, 944],
    [1818, 1442, 1301, 1168, 1056, 953],
    [1842, 1462, 1319, 1184, 1070, 965],
    [1872, 1487, 1341, 1204, 1088, 980],
    [1908, 1517, 1368, 1228, 1109, 998],
    [1950, 1552, 1400, 1256, 1134, 1020],
    [1998, 1592, 1436, 1288, 1163, 1045],
    [2052, 1637, 1476, 1324, 1195, 1073]
  ];

  const ACFT_TABLE = {
    mdl: { male: MDL_M, female: MDL_F },
    spt: { male: SPT_M, female: SPT_F },
    hrp: { male: HRP_M, female: HRP_F },
    sdc: { male: SDC_M, female: SDC_F },
    plk: { male: PLK_X, female: PLK_X },
    tmr: { male: TMR_M, female: TMR_F }
  };

  // Exposed as reference data (read-only by convention): anchor rows, their
  // point columns and the bracket labels, in row order.
  Protocols.ACFT_TABLE = ACFT_TABLE;
  Protocols.ACFT_POINT_ANCHORS = POINT_ANCHORS;
  Protocols.ACFT_BRACKETS = [
    '17-21', '22-26', '27-31', '32-36', '37-41',
    '42-46', '47-51', '52-56', '57-61', '62+'
  ];

  /* ---------- small helpers ---------- */

  function num(n) {
    return (typeof n === 'number' && isFinite(n)) ? n : 0;
  }

  function isNum(n) {
    return typeof n === 'number' && isFinite(n);
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  function round3(n) {
    return Math.round(n * 1000) / 1000;
  }

  function trim1(v) {
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  }

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  // seconds -> 'm:ss' or 'h:mm:ss' (matches views-log's fmtSec).
  function fmtSeconds(sec) {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h ? h + ':' + pad2(m) + ':' + pad2(s) : m + ':' + pad2(s);
  }

  // Workouts sorted date asc, ties by createdAt asc (same as Analytics).
  function sortedAsc(workouts) {
    return (workouts || []).slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return num(a.createdAt) - num(b.createdAt);
    });
  }

  // Defensive: callers should pass pre-filtered data, but never mix users.
  function forUser(rows, user) {
    const uid = user && user.id;
    return (rows || []).filter(function (r) {
      return r && (!uid || !r.userId || r.userId === uid);
    });
  }

  /* ---------- ACFT scoring ---------- */

  function bracketIndex(age) {
    if (!isNum(age) || age <= 21) return 0;
    if (age >= 62) return 9;
    return Math.min(9, Math.floor((age - 22) / 5) + 1);
  }

  // Linear interpolation across the anchor row; clamps to [0, 100].
  function interpPoints(raws, lowerIsBetter, raw) {
    if (!lowerIsBetter) {
      if (raw <= raws[0]) return 0;
      if (raw >= raws[5]) return 100;
      for (let i = 1; i < 6; i++) {
        if (raw <= raws[i]) {
          const span = raws[i] - raws[i - 1];
          const t = span > 0 ? (raw - raws[i - 1]) / span : 1;
          return POINT_ANCHORS[i - 1] + t * (POINT_ANCHORS[i] - POINT_ANCHORS[i - 1]);
        }
      }
      return 100;
    }
    if (raw >= raws[0]) return 0;
    if (raw <= raws[5]) return 100;
    for (let i = 1; i < 6; i++) {
      if (raw >= raws[i]) {
        const span = raws[i - 1] - raws[i];
        const t = span > 0 ? (raws[i - 1] - raw) / span : 1;
        return POINT_ANCHORS[i - 1] + t * (POINT_ANCHORS[i] - POINT_ANCHORS[i - 1]);
      }
    }
    return 100;
  }

  // results: raw values keyed mdl/spt/hrp/sdc/plk/tmr (lb, m, reps, s, s, s).
  // opts: {sex: 'male'|'female', birthYear, date?} — date ('YYYY-MM-DD',
  // default today) fixes the age reference for deterministic scoring; missing
  // sex defaults male, missing birthYear defaults to the 17-21 bracket.
  // Missing/invalid events score null and are excluded from total; pass =
  // every ENTERED event >= 60 points (false when nothing was entered).
  Protocols.scoreACFT = function (results, opts) {
    const res = (results && typeof results === 'object') ? results : {};
    const o = opts || {};
    const sex = o.sex === 'female' ? 'female' : 'male';
    const refYear = parseInt(String(o.date || U.todayStr()).slice(0, 4), 10);
    const age = isNum(o.birthYear) ? refYear - o.birthYear : null;
    const bi = bracketIndex(age);

    const events = {};
    let total = 0;
    let entered = 0;
    let pass = true;
    let minEvent = null;
    let minPts = Infinity;

    for (const ev of ACFT_EVENTS) {
      const raw = isNum(res[ev.id]) ? res[ev.id] : null;
      if (raw === null) {
        events[ev.id] = { raw: null, points: null };
        continue;
      }
      const row = ACFT_TABLE[ev.id][sex][bi];
      const pts = Math.round(U.clamp(interpPoints(row, !!ev.lowerIsBetter, raw), 0, 100));
      events[ev.id] = { raw: raw, points: pts };
      total += pts;
      entered++;
      if (pts < 60) pass = false;
      if (pts < minPts) {
        minPts = pts;
        minEvent = ev.id;
      }
    }
    if (!entered) pass = false;
    return { events: events, total: total, pass: pass, minEvent: minEvent };
  };

  /* ---------- tiers ----------
     Time-protocol tiers are seconds; swim500m is completion-based, so both
     tiers are the sentinel 'pass' (any recorded test counts as passing). */

  const DEFAULT_TIERS = {
    acft: { sfas: { min: 360, competitive: 500 }, general: { min: 360, competitive: 480 } },
    trapbar_rel: { sfas: { min: 1.5, competitive: 2.0 }, general: { min: 1.0, competitive: 1.5 } },
    run2mi: { sfas: { min: 930, competitive: 810 }, general: { min: 1080, competitive: 900 } },
    run5mi: { sfas: { min: 2400, competitive: 2250 }, general: { min: 3000, competitive: 2550 } },
    ruck12mi: { sfas: { min: 10800, competitive: 9900 }, general: { min: 14400, competitive: 12600 } },
    pushups2min: { sfas: { min: 60, competitive: 80 }, general: { min: 40, competitive: 70 } },
    pullups_max: { sfas: { min: 8, competitive: 15 }, general: { min: 5, competitive: 12 } },
    plank: { sfas: { min: 120, competitive: 210 }, general: { min: 60, competitive: 180 } },
    swim500m: { sfas: { min: 'pass', competitive: 'pass' }, general: { min: 'pass', competitive: 'pass' } }
  };

  Protocols.DEFAULT_TIERS = DEFAULT_TIERS;

  // user.goals.targets[protocolId] overrides field-by-field; goals.preset
  // picks the default column ('sfas' when set, otherwise 'general'). null
  // when the protocol has neither defaults nor a user target.
  Protocols.tiersFor = function (protocolId, user) {
    const goals = (user && user.goals) || {};
    const column = goals.preset === 'sfas' ? 'sfas' : 'general';
    const def = DEFAULT_TIERS[protocolId] ? DEFAULT_TIERS[protocolId][column] : null;
    const over = goals.targets && goals.targets[protocolId];
    if (!def && (!over || typeof over !== 'object')) return null;
    const out = { min: def ? def.min : null, competitive: def ? def.competitive : null };
    if (over && typeof over === 'object') {
      if (over.min !== undefined && over.min !== null) out.min = over.min;
      if (over.competitive !== undefined && over.competitive !== null) out.competitive = over.competitive;
    }
    return out;
  };

  /* ---------- current bests ---------- */

  function isLiftEntry(e) {
    return !!e && (e.type === undefined || e.type === null || e.type === 'lift');
  }

  function testEntryValue(protocolId, e) {
    if (protocolId === 'acft') {
      // P2 caches the computed score on the entry; P1 stored {value}.
      if (isNum(e.score)) return e.score;
      if (e.results && isNum(e.results.score)) return e.results.score;
      if (e.results && isNum(e.results.value)) return e.results.value;
      return null;
    }
    if (e.results && isNum(e.results.value)) return e.results.value;
    if (isNum(e.score)) return e.score;
    return null;
  }

  // cb(entry, workout) for every matching test entry, date asc.
  function eachTestEntry(workouts, protocolId, cb) {
    for (const w of sortedAsc(workouts)) {
      for (const e of (w && w.entries) || []) {
        if (!e || e.type !== 'test') continue;
        if (e.protocol !== protocolId && e.protocolId !== protocolId) continue;
        cb(e, w);
      }
    }
  }

  // Best trap-bar deadlift e1RM ({value kg, date}) — via Analytics when
  // loaded, else Epley over lift work sets (reps 1 -> weight).
  function bestTrapbarE1rm(workouts) {
    let best = null;
    const A = (typeof window !== 'undefined' && window.Analytics) || null;
    if (A && typeof A.exerciseHistory === 'function') {
      const rows = A.exerciseHistory(workouts, 'trap_bar_deadlift') || [];
      for (const r of rows) {
        if (isNum(r.e1rm) && r.e1rm > 0 && (!best || r.e1rm > best.value)) {
          best = { value: r.e1rm, date: r.date };
        }
      }
      return best;
    }
    for (const w of sortedAsc(workouts)) {
      for (const e of (w && w.entries) || []) {
        if (!isLiftEntry(e) || e.exerciseId !== 'trap_bar_deadlift') continue;
        for (const s of e.sets || []) {
          if (!s || s.type !== 'work') continue;
          const wt = num(s.weightKg);
          const r = num(s.reps);
          if (wt <= 0 || r < 1) continue;
          const e1 = U.round1(r === 1 ? wt : wt * (1 + r / 30));
          if (!best || e1 > best.value) best = { value: e1, date: w.date };
        }
      }
    }
    return best;
  }

  function latestBodyweightKg(bodyMetrics) {
    let best = null;
    for (const m of bodyMetrics || []) {
      if (!m || m.kind !== 'weightKg') continue;
      if (!isNum(m.value) || m.value <= 0) continue;
      if (!best || (m.date || '') > (best.date || '') ||
          ((m.date || '') === (best.date || '') && num(m.updatedAt) > num(best.updatedAt))) {
        best = m;
      }
    }
    return best ? best.value : null;
  }

  // Best recorded value for a protocol -> {value, date} | null. Test entries
  // match P2's `protocol` field (and P1's `protocolId` fallback); best is by
  // direction (min for lowerIsBetter, else max), date = when the best was
  // first achieved. trapbar_rel is derived: best trap-bar e1RM (kg) / latest
  // bodyweightKg — a unit-free ratio.
  Protocols.currentBest = function (protocolId, data) {
    const d = data || {};
    if (protocolId === 'trapbar_rel') {
      const e1 = bestTrapbarE1rm(d.workouts);
      const bw = latestBodyweightKg(d.bodyMetrics);
      if (!e1 || !bw) return null;
      return { value: round2(e1.value / bw), date: e1.date };
    }
    const p = BY_ID[protocolId];
    const lower = !!(p && p.lowerIsBetter);
    let best = null;
    eachTestEntry(d.workouts, protocolId, function (e, w) {
      const v = testEntryValue(protocolId, e);
      if (v === null) return;
      if (!best || (lower ? v < best.value : v > best.value)) {
        best = { value: v, date: w.date };
      }
    });
    return best;
  };

  /* ---------- readiness ---------- */

  const READINESS_ORDER = LIST.map(function (p) { return p.id; }).concat([TRAPBAR_REL.id]);

  function lastTestedDate(workouts, protocolId) {
    let last = null;
    if (protocolId === 'trapbar_rel') {
      for (const w of workouts || []) {
        for (const e of (w && w.entries) || []) {
          if (!isLiftEntry(e) || e.exerciseId !== 'trap_bar_deadlift') continue;
          if (w.date && (!last || w.date > last)) last = w.date;
        }
      }
      return last;
    }
    eachTestEntry(workouts, protocolId, function (e, w) {
      if (w.date && (!last || w.date > last)) last = w.date;
    });
    return last;
  }

  // pct 0..1 toward competitive. Time protocols (lowerIsBetter):
  // clamp((min - current) / (min - competitive)); higher-is-better mirrors it.
  // Pass-style / non-numeric tiers: tested -> 1, untested -> 0.
  function pctToward(current, tiers, lower, kind) {
    if (current === null) return 0;
    if (kind === 'pass' || !isNum(tiers.min) || !isNum(tiers.competitive)) return 1;
    const min = tiers.min;
    const comp = tiers.competitive;
    let pct;
    if (lower) {
      const denom = min - comp;
      pct = denom > 0 ? (min - current) / denom : (current <= comp ? 1 : 0);
    } else {
      const denom = comp - min;
      pct = denom > 0 ? (current - min) / denom : (current >= comp ? 1 : 0);
    }
    return round3(U.clamp(pct, 0, 1));
  }

  // Scorecard rows for every protocol with tiers (defaults + user targets),
  // in catalogue order with untested rows sorted last. direction is
  // 'lower' | 'higher'; untested rows have current null and pct 0. weakest =
  // lowest-pct TESTED protocolId (first on ties); untested rows are ignored
  // unless everything is untested. overallPct = mean pct across all rows.
  Protocols.readiness = function (user, data) {
    const d = data || {};
    const workouts = forUser(d.workouts, user);
    const bodyMetrics = forUser(d.bodyMetrics, user);
    const scoped = { workouts: workouts, bodyMetrics: bodyMetrics };

    const tested = [];
    const untested = [];
    for (const id of READINESS_ORDER) {
      const tiers = Protocols.tiersFor(id, user);
      if (!tiers) continue;
      const p = BY_ID[id];
      const best = Protocols.currentBest(id, scoped);
      const current = best ? best.value : null;
      const row = {
        protocolId: id,
        name: p ? p.name : id,
        current: current,
        min: tiers.min,
        competitive: tiers.competitive,
        pct: pctToward(current, tiers, !!(p && p.lowerIsBetter), p && p.kind),
        direction: p && p.lowerIsBetter ? 'lower' : 'higher',
        lastTested: lastTestedDate(workouts, id)
      };
      (current === null ? untested : tested).push(row);
    }
    const rows = tested.concat(untested);

    let overallPct = 0;
    for (const r of rows) overallPct += r.pct;
    overallPct = rows.length ? round3(overallPct / rows.length) : 0;

    let weakest = null;
    const pool = tested.length ? tested : rows;
    for (const r of pool) {
      if (weakest === null || r.pct < weakest.pct) weakest = r;
    }
    return { rows: rows, overallPct: overallPct, weakest: weakest ? weakest.protocolId : null };
  };

  /* ---------- phase / countdown ---------- */

  // weeksOut (1 decimal, negative once the date has passed) and training
  // phase: base > 16w, build 8-16w, peak 3-8w, taper < 3w. heatBlock flags
  // the final 3 weeks (<= 3w, so exactly 3 weeks out is peak + heatBlock).
  Protocols.phaseFor = function (selectionDateStr, todayStr) {
    if (!selectionDateStr) return null;
    const today = todayStr || U.todayStr();
    const days = U.daysBetween(today, selectionDateStr);
    const weeksOut = U.round1(days / 7);
    let phase;
    if (weeksOut > 16) phase = 'base';
    else if (weeksOut >= 8) phase = 'build';
    else if (weeksOut >= 3) phase = 'peak';
    else phase = 'taper';
    return { weeksOut: weeksOut, phase: phase, heatBlock: weeksOut <= 3 };
  };

  /* ---------- formatting ---------- */

  // '13:42' (time/hold, seconds in), '15 reps', '512 pts', '2.1×BW', 'Pass'.
  // units is accepted for signature compatibility — no protocol value is
  // unit-converted (mdl is defined in lb, everything else is unit-free).
  Protocols.fmtValue = function (protocolId, value, units) {
    if (value === null || value === undefined || value === '') return '';
    if (value === 'pass') return 'Pass';
    const p = BY_ID[protocolId];
    if (!isNum(value)) return String(value);
    const kind = p ? p.kind : null;
    if (kind === 'ratio') return trim1(U.round1(value)) + '×BW';
    if (kind === 'multi') return Math.round(value) + ' pts';
    if (kind === 'reps') return Math.round(value) + ' reps';
    if (kind === 'time' || kind === 'hold' || kind === 'pass') return fmtSeconds(value);
    return String(value);
  };

  window.Protocols = Protocols;
})();
