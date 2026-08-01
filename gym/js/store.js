/* IronLog — Store: state, persistence (localStorage), CRUD, demo seed. */
(function () {
  'use strict';

  const KEY = 'ironlog/v1';
  const COLLECTIONS = ['users', 'workouts', 'templates', 'bodyMetrics', 'healthSamples', 'customExercises', 'painLog', 'coachJournal'];
  const DELETED_KEYS = ['workouts', 'templates', 'bodyMetrics', 'healthSamples', 'customExercises', 'users', 'painLog', 'coachJournal'];
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
      plateWeightsKg: [20.4, 15.9, 11.3, 4.5, 2.3, 1.1],
      trainingProfile: 'simple'
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
      schemaVersion: 2, // marker only — reading is governed by permanent read-time invariants
      currentUserId: null,
      users: [],
      workouts: [],
      templates: [],
      bodyMetrics: [],
      healthSamples: [],
      customExercises: [],
      painLog: [],
      coachJournal: [],
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
    // Users are shallow-copied (like workouts below) so normalizeState never
    // mutates the caller's objects — mergeRemote feeds caller-owned data here.
    st.users = st.users.map(function (u) {
      const copy = shallowCopy(u);
      copy.settings = mergeSettings(u.settings, null);
      return copy;
    });
    // Read-time invariant (permanent, never a one-shot migration): every workout
    // entry is normalized by its type on every read — entry.type absent => the
    // existing lift normalizer (byte-for-byte for already-normal entries),
    // set.type absent => 'work', unknown entry types pass through verbatim.
    // Workouts are shallow-copied so caller-owned objects are never mutated.
    st.workouts = st.workouts.map(normalizeWorkoutRead);
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
      ['healthSamples', 'healthSamples'],
      ['painLog', 'painLog'],
      ['coachJournal', 'coachJournal']
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

  // v2 conveniences — user.goals / user.profile live at the TOP LEVEL of the
  // user (not under settings, which is whitelist-merged). updateUser's generic
  // patch loop already passes them through; these normalize the shape too.
  Store.setGoals = function (userId, goals) {
    ensureLoaded();
    const u = state.users.find(function (x) { return x.id === userId; });
    if (!u) return null;
    goals = goals && typeof goals === 'object' ? goals : {};
    const now = Date.now();
    u.goals = {
      preset: goals.preset === 'sfas' || goals.preset === 'general' ? goals.preset : null,
      selectionDate: typeof goals.selectionDate === 'string' && goals.selectionDate ? goals.selectionDate : null,
      targets: goals.targets && typeof goals.targets === 'object' && !Array.isArray(goals.targets) ? goals.targets : {},
      updatedAt: now
    };
    u.updatedAt = now;
    Store.save();
    return u;
  };

  Store.setProfile = function (userId, profile) {
    ensureLoaded();
    const u = state.users.find(function (x) { return x.id === userId; });
    if (!u) return null;
    profile = profile && typeof profile === 'object' ? profile : {};
    const now = Date.now();
    const by = Number(profile.birthYear);
    u.profile = {
      sex: profile.sex === 'male' || profile.sex === 'female' ? profile.sex : null,
      birthYear: isFinite(by) && by > 1900 && by < 2100 ? Math.round(by) : null,
      updatedAt: now
    };
    u.updatedAt = now;
    Store.save();
    return u;
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

  // 'lift' normalizer — the pre-v2 normalizeEntry, unchanged. Entries without a
  // type go through this exact code so existing data round-trips byte-for-byte.
  function normalizeLiftEntry(e) {
    return {
      id: e.id || U.uid('en'),
      exerciseId: e.exerciseId || '',
      notes: e.notes || '',
      sets: (Array.isArray(e.sets) ? e.sets : []).map(normalizeSet)
    };
  }

  /* ---- typed-entry normalizers (v2). Each preserves its addendum fields with
     sane coercion and passes any other keys through untouched, so data written
     by newer app versions survives a round trip through this one. ---- */

  const CARDIO_MODES = ['run', 'ruck', 'swim', 'bike', 'row', 'stairs', 'circuit'];
  const CARDIO_EFFORTS = ['easy', 'moderate', 'hard'];
  const CARDIO_SURFACES = ['road', 'trail', 'track', 'treadmill', 'sand'];
  const CARDIO_FOOTWEAR = ['boots', 'trainers'];
  const MOBILITY_MODALITIES = ['static', 'dynamic', 'yoga', 'foam_roll'];

  function shallowCopy(o) {
    const out = {};
    for (const k in o) out[k] = o[k];
    return out;
  }

  function coerceNum(out, key) {
    if (!(key in out)) return;
    const n = Number(out[key]);
    if (out[key] === null || out[key] === undefined || out[key] === '' || !isFinite(n)) delete out[key];
    else out[key] = n;
  }

  function coerceEnum(out, key, allowed) {
    if (!(key in out)) return;
    if (allowed.indexOf(out[key]) < 0) delete out[key];
  }

  function coerceStr(out, key) {
    if (!(key in out)) return;
    if (out[key] === null || out[key] === undefined) delete out[key];
    else out[key] = String(out[key]);
  }

  function normalizeCardioEntry(e) {
    const out = shallowCopy(e);
    out.id = e.id || U.uid('en');
    out.type = 'cardio';
    out.mode = CARDIO_MODES.indexOf(e.mode) >= 0 ? e.mode : 'run';
    out.durationMin = Number(e.durationMin) || 0;
    coerceNum(out, 'distanceKm');
    coerceNum(out, 'avgHR');
    coerceNum(out, 'maxHR');
    coerceEnum(out, 'effort', CARDIO_EFFORTS);
    coerceEnum(out, 'surface', CARDIO_SURFACES);
    coerceNum(out, 'tempC');
    coerceNum(out, 'fluidMl');
    coerceNum(out, 'loadKgDry');
    coerceNum(out, 'loadKgTotal');
    coerceEnum(out, 'footwear', CARDIO_FOOTWEAR);
    coerceStr(out, 'footNote');
    coerceStr(out, 'notes');
    return out;
  }

  function normalizeMobilityEntry(e) {
    const out = shallowCopy(e);
    out.id = e.id || U.uid('en');
    out.type = 'mobility';
    out.modality = MOBILITY_MODALITIES.indexOf(e.modality) >= 0 ? e.modality : 'static';
    out.durationMin = Number(e.durationMin) || 0;
    out.targetMuscles = (Array.isArray(e.targetMuscles) ? e.targetMuscles : [])
      .filter(function (m) { return typeof m === 'string' && m; });
    coerceStr(out, 'notes');
    return out;
  }

  function normalizeDurabilityEntry(e) {
    const out = shallowCopy(e);
    out.id = e.id || U.uid('en');
    out.type = 'durability';
    out.items = (Array.isArray(e.items) ? e.items : [])
      .filter(function (x) { return typeof x === 'string' && x; });
    coerceNum(out, 'durationMin');
    coerceStr(out, 'notes');
    return out;
  }

  function normalizeTestEntry(e) {
    const out = shallowCopy(e);
    out.id = e.id || U.uid('en');
    out.type = 'test';
    out.protocol = typeof e.protocol === 'string' ? e.protocol : String(e.protocol || '');
    out.results = e.results && typeof e.results === 'object' && !Array.isArray(e.results) ? e.results : {};
    coerceNum(out, 'score');
    coerceStr(out, 'notes');
    return out;
  }

  const ENTRY_NORMALIZERS = {
    cardio: normalizeCardioEntry,
    mobility: normalizeMobilityEntry,
    durability: normalizeDurabilityEntry,
    test: normalizeTestEntry
  };

  // Discriminated-union dispatch on entry.type. Absent type => 'lift' via the
  // pre-v2 code (no type field added). Unknown types pass through VERBATIM —
  // never stripped or flattened.
  function normalizeEntry(e) {
    e = e && typeof e === 'object' ? e : {};
    const t = e.type;
    if (t === undefined || t === null) return normalizeLiftEntry(e);
    if (t === 'lift') {
      const out = normalizeLiftEntry(e);
      out.type = 'lift';
      return out;
    }
    const fn = ENTRY_NORMALIZERS[t];
    return fn ? fn(e) : e;
  }

  // Read-time workout normalization: shallow copy with entries mapped through
  // normalizeEntry. Everything else on the workout passes through untouched.
  function normalizeWorkoutRead(w) {
    if (!w || typeof w !== 'object' || !Array.isArray(w.entries)) return w;
    const copy = shallowCopy(w);
    copy.entries = w.entries.map(normalizeEntry);
    return copy;
  }

  // workout.kind is display-only convenience, derived at save from entries.
  function entryKind(e) {
    if (!e || typeof e !== 'object') return 'lift';
    const t = e.type;
    if (t === undefined || t === null || t === 'lift') return 'lift';
    if (t === 'cardio') return typeof e.mode === 'string' && e.mode ? e.mode : 'cardio';
    return typeof t === 'string' ? t : 'lift';
  }

  function deriveKind(entries) {
    if (!Array.isArray(entries) || !entries.length) return null;
    const kinds = [];
    for (const e of entries) {
      const k = entryKind(e);
      if (kinds.indexOf(k) < 0) kinds.push(k);
    }
    return kinds.length === 1 ? kinds[0] : 'mixed';
  }

  const WORKOUT_FEELS = ['easy', 'normal', 'hard', 'hurt'];

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
    // Optional v2 session fields — only present when provided (old workouts stay
    // byte-for-byte identical).
    if (w.rpe !== undefined && w.rpe !== null && isFinite(Number(w.rpe))) workout.rpe = Number(w.rpe);
    if (WORKOUT_FEELS.indexOf(w.feel) >= 0) workout.feel = w.feel;
    if (typeof w.checkin === 'string' && w.checkin) workout.checkin = w.checkin;
    const kind = deriveKind(workout.entries);
    if (kind) workout.kind = kind;
    else if (typeof w.kind === 'string' && w.kind) workout.kind = w.kind;
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
    const kind = deriveKind(w.entries);
    if (kind) w.kind = kind;
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

  /* ---------- pain log (v2) ---------- */

  Store.addPainEntry = function (p) {
    ensureLoaded();
    p = p || {};
    const now = Date.now();
    const row = {
      id: p.id || U.uid('pn'),
      userId: p.userId || state.currentUserId,
      date: p.date || U.todayStr(),
      muscleId: String(p.muscleId || ''),
      severity: U.clamp(Number(p.severity) || 0, 0, 10),
      worseDuring: !!p.worseDuring,
      boneLine: !!p.boneLine,
      morning: !!p.morning,
      createdAt: typeof p.createdAt === 'number' ? p.createdAt : now,
      updatedAt: now
    };
    if (p.note !== undefined && p.note !== null && String(p.note)) row.note = String(p.note);
    state.painLog.push(row);
    Store.save();
    return row;
  };

  Store.updatePainEntry = function (id, patch) {
    ensureLoaded();
    const row = state.painLog.find(function (x) { return x.id === id; });
    if (!row) return null;
    patch = patch || {};
    for (const k in patch) {
      if (k === 'id' || k === 'createdAt') continue;
      row[k] = patch[k];
    }
    if (patch.severity !== undefined) row.severity = U.clamp(Number(patch.severity) || 0, 0, 10);
    row.updatedAt = Date.now();
    Store.save();
    return row;
  };

  Store.deletePainEntry = function (id) {
    ensureLoaded();
    const i = state.painLog.findIndex(function (x) { return x.id === id; });
    if (i < 0) return false;
    state.painLog.splice(i, 1);
    state.deleted.painLog[id] = Date.now();
    Store.save();
    return true;
  };

  Store.painFor = function (userId) {
    ensureLoaded();
    return state.painLog
      .filter(function (p) { return p.userId === userId; })
      .sort(function (a, b) {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
  };

  /* ---------- coach journal (v2) ---------- */

  const JOURNAL_SOURCES = ['user', 'checkin', 'coach'];

  Store.addJournalEntry = function (j) {
    ensureLoaded();
    j = j || {};
    const now = Date.now();
    const row = {
      id: j.id || U.uid('jr'),
      userId: j.userId || state.currentUserId,
      date: j.date || U.todayStr(),
      entry: String(j.entry || ''),
      source: JOURNAL_SOURCES.indexOf(j.source) >= 0 ? j.source : 'user',
      createdAt: typeof j.createdAt === 'number' ? j.createdAt : now,
      updatedAt: now
    };
    state.coachJournal.push(row);
    Store.save();
    return row;
  };

  Store.updateJournalEntry = function (id, patch) {
    ensureLoaded();
    const row = state.coachJournal.find(function (x) { return x.id === id; });
    if (!row) return null;
    patch = patch || {};
    for (const k in patch) {
      if (k === 'id' || k === 'createdAt') continue;
      row[k] = patch[k];
    }
    if (patch.source !== undefined && JOURNAL_SOURCES.indexOf(row.source) < 0) row.source = 'user';
    row.updatedAt = Date.now();
    Store.save();
    return row;
  };

  Store.deleteJournalEntry = function (id) {
    ensureLoaded();
    const i = state.coachJournal.findIndex(function (x) { return x.id === id; });
    if (i < 0) return false;
    state.coachJournal.splice(i, 1);
    state.deleted.coachJournal[id] = Date.now();
    Store.save();
    return true;
  };

  Store.journalFor = function (userId) {
    ensureLoaded();
    return state.coachJournal
      .filter(function (j) { return j.userId === userId; })
      .sort(function (a, b) {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
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
      // Same read-time invariants as load(): the imported state is normalized
      // (typed entries by type, unknown types verbatim) before entity merge.
      mergeEntities(normalizeState(raw));
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
      // Read-time invariants apply to pulled data too: normalize the remote
      // state before entity-level merge (also shields mergeEntities from
      // malformed remote shapes and never mutates the caller's object).
      mergeEntities(normalizeState(remoteState));
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
      // Accessories are occasionally skipped, but never below 3 entries per
      // workout: the RNG stream shifts with the run date, so without this cap
      // an unlucky date could roll enough skips to gut a workout.
      const maxSkips = Math.max(0, day.plan.length - 3);
      let skips = 0;
      for (let pi = 0; pi < day.plan.length; pi++) {
        const p = day.plan[pi];
        if (pi > 0 && chance(0.07) && skips < maxSkips) { skips++; continue; } // occasionally skip an accessory
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

    /* ---- v2: Erfan trains for SFAS (performance mode). Other users stay
       lift-only so the simple experience is represented too. ---- */
    (function seedErfanPerformance() {
      const erfan = users[0];
      const nowMs = U.strToDate(yesterday).getTime() + 20 * 3600000;
      erfan.settings.trainingProfile = 'performance';
      erfan.goals = {
        preset: 'sfas',
        selectionDate: U.addDays(today, 243), // ~8 months out
        targets: {
          run2mi: { min: 930, competitive: 810 },          // seconds
          ruck12mi: { min: 10800, competitive: 9900 },     // seconds
          pullups_max: { min: 12, competitive: 20 },
          pushups2min: { min: 60, competitive: 80 }
        },
        updatedAt: nowMs
      };
      erfan.profile = { sex: 'male', birthYear: 2001, updatedAt: nowMs };
      erfan.updatedAt = nowMs;

      function pushTyped(date, name, entry, extra) {
        const startedAt = U.strToDate(date).getTime() + (6 * 60 + 30 + ri(0, 90)) * 60000;
        const durationMin = Number(entry.durationMin) || 30;
        const w = {
          id: U.uid('w'),
          userId: erfan.id,
          date: date,
          name: name,
          notes: '',
          startedAt: startedAt,
          endedAt: startedAt + durationMin * 60000,
          durationMin: durationMin,
          source: 'manual',
          createdAt: startedAt,
          updatedAt: startedAt + durationMin * 60000,
          entries: [normalizeEntry(entry)],
          kind: deriveKind([entry])
        };
        if (extra) {
          for (const k in extra) {
            if (extra[k] !== undefined) w[k] = extra[k];
          }
        }
        state.workouts.push(w);
        return w;
      }

      // Last 4 weeks: 2 runs/wk (easy + hard, with HR), 1 ruck/wk (progressing
      // load), 1 durability session/wk. i = 0 oldest .. 3 newest.
      const ruckDryLb = [30, 35, 40, 40]; // progressing dry load, capped under 50 lb
      const footNotes = ['', 'Hot spot left heel — taped early, no blister', '', 'New insoles — feet fine at 40 lb'];
      const durabilityMenu = [
        ['split_squat', 'single_leg_calf_raise', 'dead_hang', 'pallof_press'],
        ['step_up', 'single_leg_rdl', 'farmer_carry', 'side_plank'],
        ['lateral_lunge', 'single_leg_calf_raise', 'suitcase_carry', 'bird_dog'],
        ['split_squat', 'single_leg_rdl', 'dead_hang', 'copenhagen_plank']
      ];
      for (let i = 0; i < 4; i++) {
        const back = 7 * (3 - i); // days: 21, 14, 7, 0 before "yesterday - offset"
        const easyDist = Math.round((5 + i * 0.5) * 10) / 10;
        const easyDur = Math.round(easyDist * (6.35 - i * 0.06)) + ri(-1, 1);
        pushTyped(U.addDays(yesterday, -(back + 1)), 'Easy Run', {
          type: 'cardio', mode: 'run', distanceKm: easyDist, durationMin: easyDur,
          avgHR: 143 + ri(0, 7), maxHR: 158 + ri(0, 8), effort: 'easy',
          surface: i % 2 ? 'trail' : 'road'
        }, { rpe: 3 + ri(0, 1), feel: 'easy' });

        const hardDist = Math.round((4.8 + i * 0.4) * 10) / 10;
        const hardDur = Math.round(hardDist * (5.45 - i * 0.07)) + ri(-1, 1);
        pushTyped(U.addDays(yesterday, -(back + 4)), i % 2 ? 'Interval Run' : 'Tempo Run', {
          type: 'cardio', mode: 'run', distanceKm: hardDist, durationMin: hardDur,
          avgHR: 167 + ri(0, 7), maxHR: 182 + ri(0, 6), effort: 'hard', surface: 'road'
        }, { rpe: 7 + ri(0, 2), feel: i === 1 ? 'hard' : 'normal', checkin: i === 3 ? 'Legs felt springy, splits even. Calves a bit tight after.' : undefined });

        const ruckDist = Math.round((6.5 + i) * 10) / 10;
        const ruckDur = Math.round(ruckDist * (9.6 - i * 0.15));
        const dryKg = lbToKg(ruckDryLb[i]);
        pushTyped(U.addDays(yesterday, -(back + 6)), 'Ruck', {
          type: 'cardio', mode: 'ruck', distanceKm: ruckDist, durationMin: ruckDur,
          avgHR: 132 + ri(0, 8), effort: 'moderate', surface: i % 2 ? 'trail' : 'road',
          loadKgDry: dryKg, loadKgTotal: Math.round((dryKg + 2.7) * 100) / 100,
          footwear: 'boots', footNote: footNotes[i]
        }, { rpe: 5 + ri(0, 1), feel: 'normal' });

        pushTyped(U.addDays(yesterday, -(back + 2)), 'Durability', {
          type: 'durability', items: durabilityMenu[i], durationMin: 25 + ri(0, 10)
        }, { rpe: 3, feel: 'easy' });
      }

      // Two simple test sessions (unified history: a workout with one test entry).
      pushTyped(U.addDays(yesterday, -5), 'Pull-up Test', {
        type: 'test', protocol: 'pullups_max', results: { value: 14 }, score: 14,
        notes: 'Dead hang, strict'
      }, { rpe: 9, feel: 'hard' });
      pushTyped(U.addDays(yesterday, -19), 'Plank Test', {
        type: 'test', protocol: 'plank', results: { value: 165 }, score: 165
      }, { rpe: 8, feel: 'normal' });

      // Pain log: one resolved episode, one current mild niggle.
      function painMs(date) { return U.strToDate(date).getTime() + 19 * 3600000; }
      const resolvedDate = U.addDays(yesterday, -20);
      const mildDate = U.addDays(yesterday, -3);
      state.painLog.push({
        id: U.uid('pn'), userId: erfan.id, date: resolvedDate, muscleId: 'foot_r',
        severity: 4, worseDuring: true, boneLine: false, morning: false, resolved: true,
        note: 'Right arch ache after the 30 lb ruck — resolved after two rest days',
        createdAt: painMs(resolvedDate), updatedAt: painMs(resolvedDate)
      }, {
        id: U.uid('pn'), userId: erfan.id, date: mildDate, muscleId: 'shin_l',
        severity: 2, worseDuring: false, boneLine: false, morning: false,
        note: 'Mild left shin tightness after intervals — eased with calf work',
        createdAt: painMs(mildDate), updatedAt: painMs(mildDate)
      });

      // Coach journal.
      const journalRows = [
        { back: 16, entry: 'Ruck load moves to 40 lb next week if the feet stay quiet.', source: 'coach' },
        { back: 8, entry: 'Slept badly before the tempo run but splits held. Fueling earlier helped.', source: 'user' },
        { back: 1, entry: 'Legs felt springy, splits even. Calves a bit tight after.', source: 'checkin' }
      ];
      for (const jr of journalRows) {
        const jd = U.addDays(yesterday, -jr.back);
        state.coachJournal.push({
          id: U.uid('jr'), userId: erfan.id, date: jd, entry: jr.entry, source: jr.source,
          createdAt: painMs(jd), updatedAt: painMs(jd)
        });
      }
    })();

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
