/* IronLog — Store: state, persistence (localStorage), CRUD, demo seed. */
(function () {
  'use strict';

  const KEY = 'ironlog/v1';
  const COLLECTIONS = ['users', 'workouts', 'templates', 'bodyMetrics', 'healthSamples', 'customExercises'];
  const DELETED_KEYS = ['workouts', 'templates', 'bodyMetrics', 'healthSamples', 'customExercises', 'users'];
  const SERIES = ['#2ca350', '#0a84ff', '#cf7c00', '#bf5af2', '#ff375f', '#3399cc'];

  const Store = {};
  Store.uid = U.uid;

  let state = null;
  const subscribers = [];

  Object.defineProperty(Store, 'state', {
    get: function () { return state; },
    enumerable: true
  });

  /* ---------- defaults & normalization ---------- */

  function defaultSettings() {
    return {
      units: 'lb',
      restTimerSec: 90,
      weeklyWorkoutGoal: 4,
      weeklySetGoal: 15,
      barWeightKg: 20.4,
      plateWeightsKg: [20.4, 15.9, 11.3, 4.5, 2.3, 1.1]
    };
  }

  function mergeSettings(base, patch) {
    const out = defaultSettings();
    for (const src of [base, patch]) {
      if (!src || typeof src !== 'object') continue;
      for (const k in out) {
        if (src[k] === undefined) continue;
        out[k] = Array.isArray(out[k]) ? (Array.isArray(src[k]) ? src[k].slice() : out[k]) : src[k];
      }
      // Forward-compat: settings keys from newer app versions pass through untouched.
      for (const k in src) {
        if (!(k in out)) out[k] = src[k];
      }
    }
    return out;
  }

  function emptyDeleted() {
    const d = {};
    for (const k of DELETED_KEYS) d[k] = {};
    return d;
  }

  function defaultState() {
    return {
      schemaVersion: 1,
      currentUserId: null,
      users: [],
      workouts: [],
      templates: [],
      bodyMetrics: [],
      healthSamples: [],
      customExercises: [],
      deleted: emptyDeleted(),
      sync: { url: '', secret: '', enabled: false, lastSyncAt: null, deviceId: U.uid('dev') }
    };
  }

  // Builds a valid state from arbitrary parsed JSON without throwing.
  function normalizeState(raw) {
    const st = defaultState();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return st;
    for (const c of COLLECTIONS) {
      if (Array.isArray(raw[c])) {
        st[c] = raw[c].filter(function (e) { return e && typeof e === 'object' && typeof e.id === 'string'; });
      }
    }
    if (raw.deleted && typeof raw.deleted === 'object') {
      for (const k of DELETED_KEYS) {
        const src = raw.deleted[k];
        if (!src || typeof src !== 'object') continue;
        for (const id in src) {
          const t = Number(src[id]);
          if (isFinite(t) && t > 0) st.deleted[k][id] = t;
        }
      }
    }
    if (raw.sync && typeof raw.sync === 'object') {
      const s = raw.sync;
      if (typeof s.url === 'string') st.sync.url = s.url;
      if (typeof s.secret === 'string') st.sync.secret = s.secret;
      st.sync.enabled = !!s.enabled;
      if (typeof s.lastSyncAt === 'number') st.sync.lastSyncAt = s.lastSyncAt;
      if (typeof s.deviceId === 'string' && s.deviceId) st.sync.deviceId = s.deviceId;
    }
    st.users.forEach(function (u) { u.settings = mergeSettings(u.settings, null); });
    if (typeof raw.currentUserId === 'string' &&
        st.users.some(function (u) { return u.id === raw.currentUserId; })) {
      st.currentUserId = raw.currentUserId;
    }
    // Forward-compat: data written by newer app versions must survive a load by
    // this version — unknown top-level fields, unknown tombstone maps, and a
    // newer schemaVersion marker all pass through instead of being dropped.
    // Without this, one out-of-date phone would erase new collections for the
    // whole family on its next sync push.
    const knownTop = ['schemaVersion', 'currentUserId', 'deleted', 'sync'].concat(COLLECTIONS);
    for (const k in raw) {
      if (knownTop.indexOf(k) === -1) st[k] = raw[k];
    }
    if (raw.deleted && typeof raw.deleted === 'object') {
      for (const k in raw.deleted) {
        if (DELETED_KEYS.indexOf(k) !== -1) continue;
        const src = raw.deleted[k];
        if (!src || typeof src !== 'object' || Array.isArray(src)) continue;
        st.deleted[k] = {};
        for (const id in src) {
          const t = Number(src[id]);
          if (isFinite(t) && t > 0) st.deleted[k][id] = t;
        }
      }
    }
    if (typeof raw.schemaVersion === 'number' && raw.schemaVersion > st.schemaVersion) {
      st.schemaVersion = raw.schemaVersion;
    }
    return st;
  }

  function ensureLoaded() {
    if (!state) Store.load();
    return state;
  }

  /* ---------- persistence ---------- */

  Store.load = function () {
    let raw = null;
    try {
      const text = localStorage.getItem(KEY);
      if (text) raw = JSON.parse(text);
    } catch (e) { raw = null; }
    state = normalizeState(raw);
    return state;
  };

  function persist(queueSync) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) { /* quota/private mode — keep in-memory state working */ }
    for (const fn of subscribers.slice()) {
      try { fn(state); } catch (e) { /* subscriber errors must not break saves */ }
    }
    if (queueSync && window.Sync && typeof window.Sync.queuePush === 'function') {
      try { window.Sync.queuePush(); } catch (e) { /* sync optional */ }
    }
  }

  Store.save = function () {
    ensureLoaded();
    persist(true);
  };

  Store.subscribe = function (fn) {
    subscribers.push(fn);
    return function () {
      const i = subscribers.indexOf(fn);
      if (i >= 0) subscribers.splice(i, 1);
    };
  };

  /* ---------- users ---------- */

  function pickColor() {
    const used = state.users.map(function (u) { return u.color; });
    for (const c of SERIES) if (used.indexOf(c) < 0) return c;
    return SERIES[state.users.length % SERIES.length];
  }

  Store.addUser = function (opts) {
    ensureLoaded();
    opts = opts || {};
    const now = Date.now();
    const user = {
      id: U.uid('u'),
      name: String(opts.name || '').trim() || 'Athlete',
      emoji: opts.emoji || '💪',
      color: opts.color || pickColor(),
      createdAt: now,
      updatedAt: now,
      settings: mergeSettings(null, opts.settings)
    };
    state.users.push(user);
    if (!state.currentUserId) state.currentUserId = user.id;
    Store.save();
    return user;
  };

  Store.updateUser = function (id, patch) {
    ensureLoaded();
    const u = state.users.find(function (x) { return x.id === id; });
    if (!u) return null;
    patch = patch || {};
    for (const k in patch) {
      if (k === 'id' || k === 'createdAt' || k === 'settings') continue;
      u[k] = patch[k];
    }
    if (patch.settings) u.settings = mergeSettings(u.settings, patch.settings);
    u.updatedAt = Date.now();
    Store.save();
    return u;
  };

  Store.deleteUser = function (id) {
    ensureLoaded();
    const i = state.users.findIndex(function (x) { return x.id === id; });
    if (i < 0) return false;
    const now = Date.now();
    state.users.splice(i, 1);
    state.deleted.users[id] = now;
    // Cascade: workouts, owned templates, body metrics, health samples.
    const cascade = [
      ['workouts', 'workouts'],
      ['templates', 'templates'],
      ['bodyMetrics', 'bodyMetrics'],
      ['healthSamples', 'healthSamples']
    ];
    for (const pair of cascade) {
      const coll = pair[0];
      state[coll] = state[coll].filter(function (e) {
        if (e.userId !== id) return true; // shared templates (userId null) survive
        state.deleted[pair[1]][e.id] = now;
        return false;
      });
    }
    if (state.currentUserId === id) {
      state.currentUserId = state.users.length ? state.users[0].id : null;
    }
    Store.save();
    return true;
  };

  Store.setCurrentUser = function (id) {
    ensureLoaded();
    if (id === null || state.users.some(function (u) { return u.id === id; })) {
      state.currentUserId = id;
      Store.save();
    }
  };

  Store.currentUser = function () {
    ensureLoaded();
    return state.users.find(function (u) { return u.id === state.currentUserId; }) || null;
  };

  /* ---------- workouts ---------- */

  function normalizeSet(s) {
    s = s && typeof s === 'object' ? s : {};
    const rpe = s.rpe === null || s.rpe === undefined || isNaN(Number(s.rpe)) ? null : Number(s.rpe);
    return {
      weightKg: Number(s.weightKg) || 0,
      reps: Number(s.reps) || 0,
      type: s.type === 'warmup' ? 'warmup' : 'work',
      rpe: rpe
    };
  }

  function normalizeEntry(e) {
    e = e && typeof e === 'object' ? e : {};
    return {
      id: e.id || U.uid('en'),
      exerciseId: e.exerciseId || '',
      notes: e.notes || '',
      sets: (Array.isArray(e.sets) ? e.sets : []).map(normalizeSet)
    };
  }

  Store.addWorkout = function (w) {
    ensureLoaded();
    w = w || {};
    const now = Date.now();
    const startedAt = typeof w.startedAt === 'number' ? w.startedAt : null;
    const endedAt = typeof w.endedAt === 'number' ? w.endedAt : null;
    let durationMin = typeof w.durationMin === 'number' ? w.durationMin : null;
    if (durationMin === null && startedAt !== null && endedAt !== null && endedAt > startedAt) {
      durationMin = Math.round((endedAt - startedAt) / 60000);
    }
    const workout = {
      id: w.id || U.uid('w'),
      userId: w.userId || state.currentUserId,
      date: w.date || U.todayStr(),
      name: w.name || 'Workout',
      notes: w.notes || '',
      startedAt: startedAt,
      endedAt: endedAt,
      durationMin: durationMin,
      source: w.source === 'apple' ? 'apple' : 'manual',
      createdAt: typeof w.createdAt === 'number' ? w.createdAt : now,
      updatedAt: now,
      entries: (Array.isArray(w.entries) ? w.entries : []).map(normalizeEntry)
    };
    state.workouts.push(workout);
    Store.save();
    return workout;
  };

  Store.updateWorkout = function (id, patch) {
    ensureLoaded();
    const w = state.workouts.find(function (x) { return x.id === id; });
    if (!w) return null;
    patch = patch || {};
    for (const k in patch) {
      if (k === 'id' || k === 'createdAt' || k === 'entries') continue;
      w[k] = patch[k];
    }
    if (patch.entries) w.entries = (Array.isArray(patch.entries) ? patch.entries : []).map(normalizeEntry);
    if (w.durationMin == null && w.startedAt != null && w.endedAt != null && w.endedAt > w.startedAt) {
      w.durationMin = Math.round((w.endedAt - w.startedAt) / 60000);
    }
    w.updatedAt = Date.now();
    Store.save();
    return w;
  };

  Store.deleteWorkout = function (id) {
    ensureLoaded();
    const i = state.workouts.findIndex(function (x) { return x.id === id; });
    if (i < 0) return false;
    state.workouts.splice(i, 1);
    state.deleted.workouts[id] = Date.now();
    Store.save();
    return true;
  };

  Store.workoutsFor = function (userId) {
    ensureLoaded();
    return state.workouts
      .filter(function (w) { return w.userId === userId; })
      .sort(function (a, b) {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
  };

  Store.workoutById = function (id) {
    ensureLoaded();
    return state.workouts.find(function (w) { return w.id === id; }) || null;
  };

  /* ---------- templates ---------- */

  function normalizeTemplateEntry(e) {
    e = e && typeof e === 'object' ? e : {};
    return {
      exerciseId: e.exerciseId || '',
      targetSets: Number(e.targetSets) || 3,
      targetRepsLow: Number(e.targetRepsLow) || 8,
      targetRepsHigh: Number(e.targetRepsHigh) || 12
    };
  }

  Store.addTemplate = function (t) {
    ensureLoaded();
    t = t || {};
    const now = Date.now();
    const tpl = {
      id: t.id || U.uid('t'),
      userId: t.userId !== undefined ? t.userId : state.currentUserId, // explicit null = shared
      name: String(t.name || '').trim() || 'Template',
      emoji: t.emoji || '📋',
      entries: (Array.isArray(t.entries) ? t.entries : []).map(normalizeTemplateEntry),
      createdAt: typeof t.createdAt === 'number' ? t.createdAt : now,
      updatedAt: now
    };
    state.templates.push(tpl);
    Store.save();
    return tpl;
  };

  Store.updateTemplate = function (id, patch) {
    ensureLoaded();
    const t = state.templates.find(function (x) { return x.id === id; });
    if (!t) return null;
    patch = patch || {};
    for (const k in patch) {
      if (k === 'id' || k === 'createdAt' || k === 'entries') continue;
      t[k] = patch[k];
    }
    if (patch.entries) t.entries = (Array.isArray(patch.entries) ? patch.entries : []).map(normalizeTemplateEntry);
    t.updatedAt = Date.now();
    Store.save();
    return t;
  };

  Store.deleteTemplate = function (id) {
    ensureLoaded();
    const i = state.templates.findIndex(function (x) { return x.id === id; });
    if (i < 0) return false;
    state.templates.splice(i, 1);
    state.deleted.templates[id] = Date.now();
    Store.save();
    return true;
  };

  Store.templatesFor = function (userId) {
    ensureLoaded();
    return state.templates.filter(function (t) {
      return t.userId === userId || t.userId === null || t.userId === undefined;
    });
  };

  /* ---------- body metrics ---------- */

  Store.addBodyMetric = function (m) {
    ensureLoaded();
    m = m || {};
    const userId = m.userId || state.currentUserId;
    const date = m.date || U.todayStr();
    const kind = m.kind === 'bodyFatPct' ? 'bodyFatPct' : 'weightKg';
    const now = Date.now();
    let row = state.bodyMetrics.find(function (x) {
      return x.userId === userId && x.date === date && x.kind === kind;
    });
    if (row) {
      row.value = Number(m.value) || 0;
      row.source = m.source === 'apple' ? 'apple' : 'manual';
      row.updatedAt = now;
    } else {
      row = {
        id: U.uid('bm'),
        userId: userId,
        date: date,
        kind: kind,
        value: Number(m.value) || 0,
        source: m.source === 'apple' ? 'apple' : 'manual',
        updatedAt: now
      };
      state.bodyMetrics.push(row);
    }
    Store.save();
    return row;
  };

  Store.deleteBodyMetric = function (id) {
    ensureLoaded();
    const i = state.bodyMetrics.findIndex(function (x) { return x.id === id; });
    if (i < 0) return false;
    state.bodyMetrics.splice(i, 1);
    state.deleted.bodyMetrics[id] = Date.now();
    Store.save();
    return true;
  };

  Store.bodyMetricsFor = function (userId, kind) {
    ensureLoaded();
    return state.bodyMetrics
      .filter(function (m) { return m.userId === userId && (!kind || m.kind === kind); })
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  };

  /* ---------- health samples ---------- */

  Store.addHealthSamples = function (rows) {
    ensureLoaded();
    if (!Array.isArray(rows) || !rows.length) return 0;
    const index = {};
    for (const s of state.healthSamples) {
      index[s.userId + '|' + s.date + '|' + s.kind] = s;
    }
    const now = Date.now();
    let added = 0;
    for (const r of rows) {
      if (!r || typeof r !== 'object' || !r.userId || !r.date || !r.kind) continue;
      const key = r.userId + '|' + r.date + '|' + r.kind;
      const existing = index[key];
      if (existing) {
        existing.value = Number(r.value) || 0;
        existing.source = r.source || 'apple';
        existing.updatedAt = now;
      } else {
        const row = {
          id: U.uid('hs'),
          userId: r.userId,
          date: r.date,
          kind: r.kind,
          value: Number(r.value) || 0,
          source: r.source || 'apple',
          updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : now
        };
        state.healthSamples.push(row);
        index[key] = row;
        added++;
      }
    }
    Store.save();
    return added;
  };

  Store.deleteHealthSample = function (id) {
    ensureLoaded();
    const i = state.healthSamples.findIndex(function (x) { return x.id === id; });
    if (i < 0) return false;
    state.healthSamples.splice(i, 1);
    state.deleted.healthSamples[id] = Date.now();
    Store.save();
    return true;
  };

  Store.healthFor = function (userId, kind) {
    ensureLoaded();
    return state.healthSamples
      .filter(function (s) { return s.userId === userId && (!kind || s.kind === kind); })
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  };

  /* ---------- custom exercises ---------- */

  Store.addCustomExercise = function (x) {
    ensureLoaded();
    x = x || {};
    const now = Date.now();
    const ex = {
      id: x.id && String(x.id).indexOf('cx_') === 0 ? x.id : U.uid('cx'),
      name: String(x.name || '').trim() || 'Custom Exercise',
      aliases: Array.isArray(x.aliases) ? x.aliases : [],
      primaryMuscles: Array.isArray(x.primaryMuscles) ? x.primaryMuscles : [],
      secondaryMuscles: Array.isArray(x.secondaryMuscles) ? x.secondaryMuscles : [],
      equipment: x.equipment || 'other',
      category: x.category || 'full_body',
      mechanics: x.mechanics === 'isolation' ? 'isolation' : 'compound',
      level: x.level || 'beginner',
      instructions: Array.isArray(x.instructions) ? x.instructions : [],
      tips: Array.isArray(x.tips) ? x.tips : [],
      custom: true,
      createdAt: typeof x.createdAt === 'number' ? x.createdAt : now,
      updatedAt: now
    };
    state.customExercises.push(ex);
    Store.save();
    return ex;
  };

  Store.updateCustomExercise = function (id, patch) {
    ensureLoaded();
    const x = state.customExercises.find(function (e) { return e.id === id; });
    if (!x) return null;
    patch = patch || {};
    for (const k in patch) {
      if (k === 'id' || k === 'createdAt' || k === 'custom') continue;
      x[k] = patch[k];
    }
    x.updatedAt = Date.now();
    Store.save();
    return x;
  };

  Store.deleteCustomExercise = function (id) {
    ensureLoaded();
    const i = state.customExercises.findIndex(function (x) { return x.id === id; });
    if (i < 0) return false;
    state.customExercises.splice(i, 1);
    state.deleted.customExercises[id] = Date.now();
    Store.save();
    return true;
  };

  Store.customExercises = function () {
    ensureLoaded();
    return state.customExercises;
  };

  /* ---------- backup: export / import ---------- */

  Store.exportJSON = function () {
    ensureLoaded();
    return JSON.stringify(state, null, 2);
  };

  Store.importJSON = function (text, opts) {
    ensureLoaded();
    opts = opts || {};
    const merge = opts.merge !== false;
    let raw;
    try {
      raw = JSON.parse(text);
    } catch (e) {
      return { ok: false, error: 'Invalid JSON: ' + e.message };
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, error: 'Backup must be a JSON object.' };
    }
    const recognizable = (typeof raw.schemaVersion === 'number' && raw.schemaVersion >= 1) ||
      COLLECTIONS.some(function (c) { return Array.isArray(raw[c]); });
    if (!recognizable) {
      return { ok: false, error: 'Not an IronLog backup — no recognizable data found.' };
    }
    if (merge) {
      mergeEntities(raw);
      if (!state.currentUserId && state.users.length) state.currentUserId = state.users[0].id;
      persist(true);
    } else {
      state = normalizeState(raw);
      if (!state.currentUserId && state.users.length) state.currentUserId = state.users[0].id;
      persist(true);
    }
    return { ok: true };
  };

  /* ---------- sync merge (entity-level last-write-wins) ---------- */

  function mergeFingerprint() {
    const snap = {};
    for (const k in state) {
      if (k !== 'sync') snap[k] = state[k];
    }
    return JSON.stringify(snap);
  }

  // Entity-shaped array collections beyond COLLECTIONS (from newer app versions)
  // get the same LWW merge so an old client never loses them.
  function unknownCollectionsOf(obj) {
    const out = [];
    for (const k in obj) {
      if (k === 'sync' || k === 'deleted' || COLLECTIONS.indexOf(k) !== -1) continue;
      if (Array.isArray(obj[k]) && obj[k].every(function (e) {
        return e && typeof e === 'object' && typeof e.id === 'string';
      })) out.push(k);
    }
    return out;
  }

  // Merges remote entities/tombstones into local state. Does NOT persist.
  function mergeEntities(remote) {
    const rDel = remote.deleted && typeof remote.deleted === 'object' ? remote.deleted : {};
    for (const k in rDel) {
      const src = rDel[k];
      if (!src || typeof src !== 'object' || Array.isArray(src)) continue;
      if (!state.deleted[k]) state.deleted[k] = {};
      for (const id in src) {
        const t = Number(src[id]);
        if (isFinite(t) && t > 0) {
          state.deleted[k][id] = Math.max(state.deleted[k][id] || 0, t);
        }
      }
    }
    const colls = COLLECTIONS.slice();
    for (const k of unknownCollectionsOf(remote)) {
      if (colls.indexOf(k) === -1) colls.push(k);
    }
    for (const coll of colls) {
      if (!Array.isArray(state[coll])) state[coll] = [];
      const remoteArr = Array.isArray(remote[coll]) ? remote[coll] : [];
      const byId = new Map();
      for (const e of state[coll]) {
        if (e && typeof e === 'object' && e.id) byId.set(e.id, e);
      }
      for (const re of remoteArr) {
        if (!re || typeof re !== 'object' || typeof re.id !== 'string' || !re.id) continue;
        const le = byId.get(re.id);
        if (!le || (Number(re.updatedAt) || 0) > (Number(le.updatedAt) || 0)) {
          byId.set(re.id, re);
        }
      }
      const tombs = state.deleted[coll] || {};
      const out = [];
      byId.forEach(function (e, id) {
        if ((tombs[id] || 0) > (Number(e.updatedAt) || 0)) return; // deletion wins
        out.push(e);
      });
      state[coll] = out;
    }
    state.users.forEach(function (u) { u.settings = mergeSettings(u.settings, null); });
    // Keep local currentUserId; repair it only if that user no longer exists.
    if (state.currentUserId &&
        !state.users.some(function (u) { return u.id === state.currentUserId; })) {
      state.currentUserId = state.users.length ? state.users[0].id : null;
    }
  }

  Store.mergeRemote = function (remoteState) {
    ensureLoaded();
    if (!remoteState || typeof remoteState !== 'object' || Array.isArray(remoteState)) {
      return { changed: false };
    }
    const before = mergeFingerprint();
    try {
      mergeEntities(remoteState);
    } catch (e) {
      return { changed: false };
    }
    const changed = mergeFingerprint() !== before;
    if (changed) persist(false); // Sync pushes right after merging a pull — no queue needed
    return { changed: changed };
  };

  /* ---------- demo seed ---------- */

  // Exercise ids referenced by the demo seed — all exist in js/exercises.js.
  const SEED_EX = {
    bench: 'barbell_bench_press',
    inclineDb: 'incline_dumbbell_press',
    ohp: 'overhead_press',
    latRaise: 'dumbbell_lateral_raise',
    pushdown: 'triceps_pushdown',
    dip: 'chest_dip',
    pullup: 'pull_up',
    row: 'barbell_row',
    latPulldown: 'lat_pulldown',
    cableRow: 'seated_cable_row',
    facePull: 'face_pull',
    curl: 'barbell_curl',
    hammerCurl: 'hammer_curl',
    squat: 'back_squat',
    frontSquat: 'front_squat',
    deadlift: 'deadlift',
    rdl: 'romanian_deadlift',
    legPress: 'leg_press',
    legExt: 'leg_extension',
    legCurl: 'lying_leg_curl',
    hipThrust: 'barbell_hip_thrust',
    calf: 'standing_calf_raise',
    crunch: 'cable_crunch',
    plank: 'plank',
    dbBench: 'dumbbell_bench_press'
  };

  Store.seedDemo = function () {
    ensureLoaded();
    // Deterministic PRNG so the demo is stable and testable.
    let rngState = 987654321;
    function rnd() {
      rngState = (rngState * 1664525 + 1013904223) >>> 0;
      return rngState / 4294967296;
    }
    function ri(lo, hi) { return lo + Math.floor(rnd() * (hi - lo + 1)); }
    function chance(p) { return rnd() < p; }
    function pickOf(arr) { return arr[Math.floor(rnd() * arr.length)]; }
    function round5(v) { return Math.round(v / 5) * 5; }
    function lbToKg(lb) { return Math.round(lb / U.LB_PER_KG * 100) / 100; }

    const today = U.todayStr();
    const yesterday = U.addDays(today, -1);
    const DAYS = 70; // ~10 weeks
    const start = U.addDays(today, -DAYS);
    const startMs = U.strToDate(start).getTime();

    const userDefs = [
      { name: 'Erfan', emoji: '🦍', color: '#2ca350' },
      { name: 'Amu Reza', emoji: '🐻', color: '#0a84ff' },
      { name: 'Dana', emoji: '🐆', color: '#cf7c00' }
    ];
    const users = userDefs.map(function (d) {
      return {
        id: U.uid('u'),
        name: d.name,
        emoji: d.emoji,
        color: d.color,
        createdAt: startMs,
        updatedAt: startMs,
        settings: mergeSettings(null, { units: 'lb' })
      };
    });
    for (const u of users) state.users.push(u);

    // Weights below are pounds (rounded to plates); stored as kg.
    const E = SEED_EX;
    const programs = [
      { // Erfan — PPL, 5 scheduled days/week
        pattern: { 1: 'push', 2: 'pull', 3: 'legs', 5: 'push', 6: 'pull' },
        rotation: ['push', 'pull', 'legs'],
        miss: 0.15,
        days: {
          push: { name: 'Push Day', plan: [
            { ex: E.bench, start: 135, end: 165, reps: [5, 8], sets: 4, warm: true },
            { ex: E.ohp, start: 85, end: 105, reps: [6, 8], sets: 3, warm: true },
            { ex: E.inclineDb, start: 50, end: 65, reps: [8, 12], sets: 3 },
            { ex: E.latRaise, start: 15, end: 25, reps: [12, 15], sets: 3 },
            { ex: E.pushdown, start: 50, end: 70, reps: [10, 15], sets: 3 }
          ] },
          pull: { name: 'Pull Day', plan: [
            { ex: E.deadlift, start: 225, end: 285, reps: [3, 5], sets: 3, warm: true },
            { ex: E.pullup, start: 0, end: 0, reps: [6, 11], sets: 3, bw: true },
            { ex: E.row, start: 115, end: 145, reps: [8, 10], sets: 3, warm: true },
            { ex: E.facePull, start: 30, end: 45, reps: [15, 20], sets: 3 },
            { ex: E.curl, start: 60, end: 75, reps: [8, 12], sets: 3 }
          ] },
          legs: { name: 'Leg Day', plan: [
            { ex: E.squat, start: 185, end: 235, reps: [5, 8], sets: 4, warm: true },
            { ex: E.rdl, start: 135, end: 175, reps: [8, 10], sets: 3 },
            { ex: E.legPress, start: 270, end: 360, reps: [10, 12], sets: 3 },
            { ex: E.legCurl, start: 70, end: 90, reps: [10, 15], sets: 3 },
            { ex: E.calf, start: 90, end: 130, reps: [12, 15], sets: 3 }
          ] }
        }
      },
      { // Amu Reza — Upper/Lower, 4 scheduled days/week
        pattern: { 1: 'upper', 2: 'lower', 4: 'upper', 5: 'lower' },
        rotation: ['upper', 'lower'],
        miss: 0.12,
        days: {
          upper: { name: 'Upper Body', plan: [
            { ex: E.bench, start: 185, end: 215, reps: [5, 8], sets: 4, warm: true },
            { ex: E.row, start: 155, end: 185, reps: [6, 10], sets: 3, warm: true },
            { ex: E.ohp, start: 105, end: 125, reps: [6, 8], sets: 3 },
            { ex: E.latPulldown, start: 120, end: 150, reps: [8, 12], sets: 3 },
            { ex: E.hammerCurl, start: 35, end: 45, reps: [10, 12], sets: 3 },
            { ex: E.pushdown, start: 60, end: 80, reps: [10, 15], sets: 3 }
          ] },
          lower: { name: 'Lower Body', plan: [
            { ex: E.squat, start: 245, end: 295, reps: [4, 6], sets: 4, warm: true },
            { ex: E.rdl, start: 185, end: 225, reps: [6, 10], sets: 3, warm: true },
            { ex: E.legExt, start: 90, end: 120, reps: [10, 15], sets: 3 },
            { ex: E.legCurl, start: 90, end: 110, reps: [10, 12], sets: 3 },
            { ex: E.crunch, start: 80, end: 100, reps: [12, 15], sets: 3 }
          ] }
        }
      },
      { // Dana — full body 3x/week
        pattern: { 1: 'fbA', 3: 'fbB', 5: 'fbC' },
        rotation: ['fbA', 'fbB', 'fbC'],
        miss: 0.08,
        days: {
          fbA: { name: 'Full Body A', plan: [
            { ex: E.squat, start: 95, end: 135, reps: [6, 8], sets: 3, warm: true },
            { ex: E.bench, start: 75, end: 100, reps: [6, 10], sets: 3, warm: true },
            { ex: E.cableRow, start: 70, end: 95, reps: [10, 12], sets: 3 },
            { ex: E.plank, start: 0, end: 0, reps: [1, 1], sets: 3, bw: true },
            { ex: E.calf, start: 60, end: 85, reps: [12, 15], sets: 3 }
          ] },
          fbB: { name: 'Full Body B', plan: [
            { ex: E.deadlift, start: 135, end: 185, reps: [4, 6], sets: 3, warm: true },
            { ex: E.ohp, start: 55, end: 70, reps: [6, 10], sets: 3 },
            { ex: E.latPulldown, start: 70, end: 95, reps: [8, 12], sets: 3 },
            { ex: E.hipThrust, start: 135, end: 185, reps: [10, 12], sets: 3 },
            { ex: E.crunch, start: 40, end: 55, reps: [12, 15], sets: 3 }
          ] },
          fbC: { name: 'Full Body C', plan: [
            { ex: E.legPress, start: 180, end: 250, reps: [10, 12], sets: 3, warm: true },
            { ex: E.dbBench, start: 30, end: 40, reps: [8, 12], sets: 3 },
            { ex: E.pullup, start: 0, end: 0, reps: [3, 8], sets: 3, bw: true },
            { ex: E.latRaise, start: 10, end: 15, reps: [12, 15], sets: 3 },
            { ex: E.curl, start: 40, end: 55, reps: [8, 12], sets: 3 }
          ] }
        }
      }
    ];

    const workoutNotes = [
      'Felt strong today 💪', 'Low energy, kept it short', 'New gym playlist, great session',
      'Slight shoulder tweak — went lighter', 'PR attempt next week', 'Crowded gym, long rests',
      'Slept 8h, everything moved fast'
    ];
    const entryNotes = [
      'Paused reps', 'Slow eccentric', 'Grip felt off', 'Belt on top sets', 'Close grip today'
    ];

    function buildWorkout(user, date, dayKey, program, prog) {
      const day = program.days[dayKey];
      const entries = [];
      for (let pi = 0; pi < day.plan.length; pi++) {
        const p = day.plan[pi];
        if (pi > 0 && chance(0.07)) continue; // occasionally skip an accessory
        let topLb = 0;
        if (!p.bw) {
          let wobble = 0;
          if (chance(0.35)) wobble = chance(0.5) ? -5 : 5;
          topLb = Math.max(5, round5(p.start + (p.end - p.start) * prog + wobble));
        }
        const topKg = p.bw ? 0 : lbToKg(topLb);
        const sets = [];
        if (p.warm && !p.bw) {
          sets.push({ weightKg: lbToKg(Math.max(5, round5(topLb * 0.55))), reps: 10, type: 'warmup', rpe: null });
        }
        const nSets = U.clamp(p.sets + (chance(0.15) ? 1 : 0), 3, 4);
        const repBase = p.bw
          ? Math.round(p.reps[0] + (p.reps[1] - p.reps[0]) * prog)
          : 0;
        for (let si = 0; si < nSets; si++) {
          let reps;
          if (p.bw) {
            reps = Math.max(1, repBase + ri(-1, 1) - (si === nSets - 1 && chance(0.5) ? 1 : 0));
          } else {
            reps = ri(p.reps[0], p.reps[1]);
            if (si === nSets - 1 && chance(0.4)) reps = Math.max(p.reps[0] - 1, reps - 2);
          }
          const rpe = chance(0.28) ? pickOf([7, 7.5, 8, 8.5, 9]) : null;
          sets.push({ weightKg: topKg, reps: reps, type: 'work', rpe: rpe });
        }
        entries.push({
          id: U.uid('en'),
          exerciseId: p.ex,
          notes: chance(0.06) ? pickOf(entryNotes) : '',
          sets: sets
        });
      }
      const startedAt = U.strToDate(date).getTime() + (17 * 60 + ri(0, 150)) * 60000;
      const durationMin = 45 + ri(0, 35);
      const endedAt = startedAt + durationMin * 60000;
      state.workouts.push({
        id: U.uid('w'),
        userId: user.id,
        date: date,
        name: day.name,
        notes: chance(0.18) ? pickOf(workoutNotes) : '',
        startedAt: startedAt,
        endedAt: endedAt,
        durationMin: durationMin,
        source: 'manual',
        createdAt: startedAt,
        updatedAt: endedAt,
        entries: entries
      });
    }

    for (let ui = 0; ui < users.length; ui++) {
      const user = users[ui];
      const program = programs[ui];
      let rotIdx = 0;
      let lastDate = null;
      for (let d = 0; d < DAYS; d++) {
        const date = U.addDays(start, d); // start .. yesterday
        const dow = U.strToDate(date).getDay();
        const dayKey = program.pattern[dow];
        if (!dayKey) continue;
        if (chance(program.miss)) continue; // missed session
        const prog = Math.floor(d / 7) / 9; // 0 → 1 across the 10 weeks
        buildWorkout(user, date, dayKey, program, Math.min(1, prog));
        rotIdx = (program.rotation.indexOf(dayKey) + 1) % program.rotation.length;
        lastDate = date;
      }
      // Most recent workout is always yesterday.
      if (lastDate !== yesterday) {
        buildWorkout(user, yesterday, program.rotation[rotIdx], program, 1);
      }
    }

    // Body weight every ~3 days (slight trend + noise) and a few body-fat rows.
    const bodyDefs = [
      { baseLb: 181, perDayLb: -0.05, bfStart: 17.5, bfEnd: 15.9 },
      { baseLb: 212, perDayLb: 0.03, bfStart: 21.0, bfEnd: 21.4 },
      { baseLb: 149, perDayLb: -0.02, bfStart: 24.0, bfEnd: 23.2 }
    ];
    for (let ui = 0; ui < users.length; ui++) {
      const user = users[ui];
      const bd = bodyDefs[ui];
      for (let d = 0; d < DAYS; d += 3 + (chance(0.35) ? 1 : 0)) {
        const date = U.addDays(start, d);
        const lb = bd.baseLb + bd.perDayLb * d + (rnd() * 2 - 1) * 1.6;
        state.bodyMetrics.push({
          id: U.uid('bm'),
          userId: user.id,
          date: date,
          kind: 'weightKg',
          value: Math.round(lb / U.LB_PER_KG * 10) / 10,
          source: 'manual',
          updatedAt: U.strToDate(date).getTime() + 8 * 3600000
        });
      }
      for (let k = 0; k < 5; k++) {
        const d = Math.min(DAYS - 1, k * 16 + ri(0, 3));
        const date = U.addDays(start, d);
        const pct = bd.bfStart + (bd.bfEnd - bd.bfStart) * (d / DAYS) + (rnd() * 2 - 1) * 0.4;
        state.bodyMetrics.push({
          id: U.uid('bm'),
          userId: user.id,
          date: date,
          kind: 'bodyFatPct',
          value: Math.round(pct * 10) / 10,
          source: 'manual',
          updatedAt: U.strToDate(date).getTime() + 8 * 3600000
        });
      }
    }

    // ~60 days of Apple-Health-style daily samples for the first user.
    const u1 = users[0];
    for (let d = 60; d >= 1; d--) {
      const date = U.addDays(today, -d);
      const dayMs = U.strToDate(date).getTime() + 22 * 3600000;
      const trained = state.workouts.some(function (w) { return w.userId === u1.id && w.date === date; });
      const samples = [
        { kind: 'steps', value: ri(4000, 15000) },
        { kind: 'restingHR', value: U.clamp(Math.round(66 - (60 - d) * 0.12 + ri(-3, 3)), 52, 68) },
        { kind: 'activeEnergyKcal', value: ri(280, 520) + (trained ? ri(250, 450) : 0) },
        { kind: 'exerciseMin', value: ri(10, 35) + (trained ? ri(30, 60) : 0) }
      ];
      for (const s of samples) {
        state.healthSamples.push({
          id: U.uid('hs'),
          userId: u1.id,
          date: date,
          kind: s.kind,
          value: s.value,
          source: 'apple',
          updatedAt: dayMs
        });
      }
    }

    // A couple of shared templates so the templates view looks alive.
    const tplNow = Date.now();
    state.templates.push({
      id: U.uid('t'),
      userId: null,
      name: 'Push Day',
      emoji: '🔥',
      entries: [
        { exerciseId: E.bench, targetSets: 4, targetRepsLow: 5, targetRepsHigh: 8 },
        { exerciseId: E.ohp, targetSets: 3, targetRepsLow: 6, targetRepsHigh: 8 },
        { exerciseId: E.inclineDb, targetSets: 3, targetRepsLow: 8, targetRepsHigh: 12 },
        { exerciseId: E.latRaise, targetSets: 3, targetRepsLow: 12, targetRepsHigh: 15 },
        { exerciseId: E.pushdown, targetSets: 3, targetRepsLow: 10, targetRepsHigh: 15 }
      ],
      createdAt: tplNow,
      updatedAt: tplNow
    }, {
      id: U.uid('t'),
      userId: users[0].id,
      name: 'Pull Day',
      emoji: '🧲',
      entries: [
        { exerciseId: E.deadlift, targetSets: 3, targetRepsLow: 3, targetRepsHigh: 5 },
        { exerciseId: E.pullup, targetSets: 3, targetRepsLow: 6, targetRepsHigh: 10 },
        { exerciseId: E.row, targetSets: 3, targetRepsLow: 8, targetRepsHigh: 10 },
        { exerciseId: E.facePull, targetSets: 3, targetRepsLow: 15, targetRepsHigh: 20 },
        { exerciseId: E.curl, targetSets: 3, targetRepsLow: 8, targetRepsHigh: 12 }
      ],
      createdAt: tplNow,
      updatedAt: tplNow
    });

    state.currentUserId = users[0].id;
    Store.save();
    return state;
  };

  window.Store = Store;
})();
