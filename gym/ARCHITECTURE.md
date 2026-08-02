# IronLog — Architecture Contract

IronLog is a multi-user gym logging web app (Fitbod × Apple Health × ExRx) built as a
**pure static site**: plain HTML/CSS/JS, no build step, no external dependencies, no
CDNs. It must work when served from GitHub Pages **and** when opened via `file://`.

This document is the binding contract between modules. Every module is a plain
`<script>` file that attaches exactly one namespace to `window`. **Do not use ES
modules (`import`/`export`)** — they break on `file://`. Do not reference a namespace
from another module at top level except where the load order below guarantees it
exists; prefer referencing other namespaces lazily (inside functions).

## Files & load order (script tags in index.html, in this order)

| File | Namespace | Purpose |
|---|---|---|
| `js/util.js` | `U` | shared helpers (DOM, dates, formatting, ids) — **already written, read it** |
| `js/exercises.js` | `ExerciseDB` | built-in exercise encyclopedia (250+) |
| `js/store.js` | `Store` | state, persistence (localStorage), users/workouts CRUD, demo seed |
| `js/sync.js` | `Sync` | optional Firebase Realtime DB REST sync (plain `fetch`) |
| `js/analytics.js` | `Analytics` | pure computation over state (no DOM) |
| `js/charts.js` | `Charts` | hand-rolled responsive SVG charts (no deps) |
| `js/musclemap.js` | `MuscleMap` | front/back SVG body with per-muscle heat coloring |
| `js/applehealth.js` | `AppleHealth` | Apple Health export.zip/xml import, CSV/JSON export |
| `js/app.js` | `App` | shell: router, nav, modals, toasts, onboarding, settings, profiles |
| `js/views-log.js` | — | registers views: `log`, `history`, `templates` |
| `js/views-library.js` | — | registers views: `library` (+ exercise detail) |
| `js/views-insights.js` | — | registers views: `dashboard`, `analytics`, `body`, `leaderboard` |

`App.init()` is called from an inline `DOMContentLoaded` handler in `index.html`
(after all scripts). View files call `App.registerView(...)` at top level — `App`
is guaranteed to exist by load order.

Other assets: `css/styles.css`, `index.html`, `manifest.webmanifest`, `sw.js`
(service worker, cache-first app shell), `icons/icon.svg` (+ 192/512 png optional),
`README.md`.

## Conventions (binding)

- **Weights are stored in kg** (number, may be fractional). Convert only at the UI
  boundary with `U.kgToDisplay/U.displayToKg` using the current user's `units`.
  `U.LB_PER_KG = 2.2046226218`.
- **Dates are local-timezone strings `'YYYY-MM-DD'`** produced by `U.todayStr()` /
  `U.dateToStr(d)` (never `toISOString()`, which shifts timezone). Timestamps are
  `Date.now()` ms numbers, field name `updatedAt`/`createdAt`.
- **Ids** come from `U.uid()` (short random string). Never use array index as identity.
- **XSS safety:** any user-entered string interpolated into HTML MUST go through
  `U.esc()`. Attribute values too. No exceptions.
- All views must render useful **empty states** (no data yet) — never a blank panel,
  never `NaN`/`undefined` text. Guard divisions by zero.
- Touch targets ≥ 44px; all interactive elements are `<button>`/`<a>`/inputs (no
  clickable bare `<div>` without `role`/`tabindex`); modals close on Escape and
  backdrop click.
- No network calls anywhere except `js/sync.js` (user-configured Firebase URL) and
  the service worker. App must be fully functional offline / with sync disabled.
- Every module file starts with `'use strict';` inside an IIFE:
  `(function(){ 'use strict'; ... window.Name = Name; })();`
- Code style: 2-space indent, single quotes, semicolons, `const`/`let`, template
  literals for HTML. Comments only where a constraint isn't obvious from code.

## Data model (single state object, persisted to localStorage key `ironlog/v1`)

```js
{
  schemaVersion: 1,
  currentUserId: 'u_x1' | null,
  users: [{
    id, name, emoji,            // emoji: single emoji avatar, e.g. '🦍'
    color,                      // one of PALETTE.series hexes (user identity color)
    createdAt, updatedAt,
    settings: {
      units: 'lb' | 'kg',
      restTimerSec: 90,          // default rest between sets
      weeklyWorkoutGoal: 4,      // workouts/week for rings
      weeklySetGoal: 15,         // target working sets per muscle group per week (10–20)
      barWeightKg: 20.4,         // for plate calculator (45 lb bar default)
      plateWeightsKg: [20.4, 15.9, 11.3, 4.5, 2.3, 1.1]  // 45/35/25/10/5/2.5 lb
    }
  }],
  workouts: [{
    id, userId,
    date: 'YYYY-MM-DD',
    name,                       // e.g. 'Push Day'
    notes: '',
    startedAt, endedAt,         // ms or null
    durationMin,                // number or null (derived from times if present)
    source: 'manual' | 'apple',
    createdAt, updatedAt,
    entries: [{                 // one entry per exercise, ordered
      id, exerciseId,           // exerciseId references ExerciseDB or custom (prefix 'cx_')
      notes: '',
      sets: [{ weightKg, reps, type: 'work'|'warmup', rpe: null|number(6-10) }]
    }]
  }],
  templates: [{
    id, userId,                 // null userId = shared with everyone
    name, emoji,
    entries: [{ exerciseId, targetSets, targetRepsLow, targetRepsHigh }],
    createdAt, updatedAt
  }],
  bodyMetrics: [{               // one row per (userId, date, kind)
    id, userId, date, kind: 'weightKg'|'bodyFatPct', value, source: 'manual'|'apple', updatedAt
  }],
  healthSamples: [{             // daily aggregates from Apple Health import
    id, userId, date,
    kind: 'steps'|'restingHR'|'activeEnergyKcal'|'exerciseMin'|'vo2max'|'sleepHours',
    value, source: 'apple', updatedAt
  }],
  customExercises: [{           // same shape as ExerciseDB entries, id prefix 'cx_'
    id, name, primaryMuscles, secondaryMuscles, equipment, category, mechanics,
    instructions: [], tips: [], custom: true, createdAt, updatedAt
  }],
  deleted: { workouts: {}, templates: {}, bodyMetrics: {}, healthSamples: {},
             customExercises: {}, users: {} },   // id -> deletedAt ms (tombstones for sync)
  sync: { url: '', secret: '', enabled: false, lastSyncAt: null, deviceId }
}
```

## Canonical muscle ids (exactly these 18 — everywhere)

```
chest, front_delts, side_delts, rear_delts, traps, lats, upper_back, lower_back,
biceps, triceps, forearms, abs, obliques, glutes, quads, hamstrings, adductors, calves
```
Display labels via `ExerciseDB.MUSCLES` (see below). MuscleMap SVG paths carry these
ids. Analytics aggregates by these ids. Never invent another muscle id.

Equipment ids: `barbell, dumbbell, kettlebell, machine, cable, bodyweight, band,
smith, ez_bar, trap_bar, other`. Category ids: `push, pull, legs, core, cardio,
full_body, olympic`. Mechanics: `compound | isolation`.

## Module APIs

### `U` (js/util.js — already written; read the file for exact behavior)
`U.$(sel, root?)`, `U.$$(sel, root?)`, `U.el(html) -> Element`, `U.esc(s)`,
`U.uid(prefix?)`, `U.todayStr()`, `U.dateToStr(date)`, `U.strToDate(s)`,
`U.addDays(str, n) -> str`, `U.weekStart(str) -> str` (Monday),
`U.daysBetween(a, b)`, `U.fmtDate(str)` ('Mar 14'), `U.fmtDateLong(str)`,
`U.relDate(str)` ('Today'/'Yesterday'/'Mar 14'), `U.fmtDuration(min)`,
`U.fmtNum(n)` (1,284 / 12.9k compact), `U.round1(n)`, `U.kgToDisplay(kg, units)`,
`U.displayToKg(v, units)`, `U.unitLabel(units)`, `U.clamp(n, lo, hi)`,
`U.debounce(fn, ms)`, `U.groupBy(arr, fn)`, `U.sum(arr, fn?)`, `U.download(filename,
text, mime)`, `U.readFileText(file) -> Promise`, `U.on(root, evt, sel, fn)`
(delegated events).

### `ExerciseDB` (js/exercises.js)
```js
ExerciseDB.MUSCLES        // ordered [{id, label, short}] for the 18 ids ('Front Delts' etc.)
ExerciseDB.MUSCLE_LABEL   // {id: label}
ExerciseDB.EQUIPMENT      // [{id, label}]
ExerciseDB.CATEGORIES     // [{id, label}]
ExerciseDB.all()          // built-ins + Store custom exercises (lazy-read Store if present)
ExerciseDB.byId(id)       // -> exercise | null (checks custom too)
ExerciseDB.search(q, {muscle, equipment, category} = {}) // name+alias substring, ranked
```
Exercise shape: `{ id: 'bench_press', name, aliases: [], primaryMuscles: [muscleId],
secondaryMuscles: [], equipment, category, mechanics, level: 'beginner'|'intermediate'|
'advanced', instructions: [3-6 steps], tips: [1-3] }`.

### `Store` (js/store.js)
```js
Store.load()                       // read localStorage (migrate if needed) -> state
Store.state                        // the live state object (after load)
Store.save()                       // persist + notify subscribers + Sync.queuePush()
Store.subscribe(fn)                // fn(state) after every save; returns unsubscribe
Store.uid                          // = U.uid
// users
Store.addUser({name, emoji, color, settings?}) -> user   // fills setting defaults
Store.updateUser(id, patch)        // deep-merges settings; bumps updatedAt
Store.deleteUser(id)               // cascades workouts/metrics/samples; tombstones
Store.setCurrentUser(id)
Store.currentUser() -> user|null
// workouts (all auto-set userId to current user if absent)
Store.addWorkout(w) -> workout     Store.updateWorkout(id, patch)
Store.deleteWorkout(id)            Store.workoutsFor(userId) // date desc, then createdAt desc
Store.workoutById(id)
// templates / body / health / custom exercises: add/update/delete + list accessors
Store.templatesFor(userId)         // own + shared(null)
Store.bodyMetricsFor(userId, kind) // date asc
Store.healthFor(userId, kind)      // date asc
Store.addBodyMetric({userId, date, kind, value, source}) // upsert by (userId,date,kind)
Store.addHealthSamples(rows)       // bulk upsert by (userId,date,kind); returns count added
Store.addCustomExercise(x)         Store.customExercises()
// backup
Store.exportJSON() -> string       Store.importJSON(text, {merge:true}) -> {ok, error?}
Store.seedDemo()                   // create 3 demo users + ~10 weeks realistic history
Store.mergeRemote(remoteState)     // entity-level last-write-wins by updatedAt + tombstones
```
`importJSON` with `merge:false` replaces everything (confirm in UI first).
`seedDemo` must produce realistic progressive-overload data (see README goals) so
analytics views look alive: 3 users, 4–5 workouts/week for ~10 weeks, plausible
lifts (e.g. bench 60→75 kg), body weight series, a few PRs, some health samples.

### `Sync` (js/sync.js) — optional Firebase Realtime Database via REST (plain fetch)
```js
Sync.configure({url, secret})   // url like https://xxx-default-rtdb.firebaseio.com/ironlog
Sync.enabled() -> bool
Sync.queuePush()                // debounced (2s) push after local change (no-op if disabled)
Sync.syncNow() -> Promise<{ok, pulled, pushed, error?}>  // pull -> mergeRemote -> push
Sync.status() -> {enabled, lastSyncAt, inFlight, lastError}
Sync.onStatus(fn)
```
REST: `GET/PUT {url}.json?auth={secret}` (auth param omitted when secret empty).
Handle fetch failures gracefully (offline = fine, show status, never throw to UI).
Never sync `sync` config itself. Push after merging pull. No SDK, no other endpoints.

### `Analytics` (js/analytics.js) — pure functions, no DOM, no Store writes
```js
Analytics.e1rm(weightKg, reps)         // Epley: w*(1+r/30); reps 1 -> w; 0 if invalid
Analytics.setVolume(set)               // weightKg*reps for type 'work'; warmups 0
Analytics.workoutVolume(w)             // sum entries
Analytics.workoutSets(w)               // count 'work' sets
Analytics.weeklySeries(workouts, weeks)      // [{weekStart, volumeKg, sets, workouts}] asc, zero-filled
Analytics.muscleWeeklySets(workouts, weekStartStr)  // {muscleId: sets} — primary 1.0, secondary 0.5 per work set
Analytics.muscleVolume28d(workouts, endDateStr)     // {muscleId: volumeKg} same weighting
Analytics.exerciseHistory(workouts, exerciseId)
//  -> [{date, workoutId, topWeightKg, topSet:{weightKg,reps}, e1rm, volumeKg, sets}] date asc
Analytics.prs(workouts)                // date-asc PR events: [{date, exerciseId, kind:'weight'|'e1rm'|'reps'|'volume', value, prev}]
Analytics.recentPrs(workouts, sinceDateStr)
Analytics.streaks(workouts)            // {currentWeeks, bestWeeks} — consecutive weeks with >=1 workout
Analytics.calendar(workouts, days)     // {dateStr: volumeKg} for heatmap
Analytics.repRanges(workouts)          // {strength(1-5), hypertrophy(6-12), endurance(13+)} -> working-set counts
Analytics.muscleRecovery(workouts, nowMs) // {muscleId: {freshness 0..1, lastTrained, setsLast7d}}
                                       // freshness = min(1, hoursSince/recoveryHours); recoveryHours 48 + 12*min(sets,6)/6
Analytics.recommendFocus(workouts, nowMs) // top 3-5 freshest+undertrained muscles + suggested exerciseIds
Analytics.bodySeries(metrics)          // [{date, value}] + 7-sample moving avg [{date, avg}]
Analytics.trendSlope(points)           // per-week linear-regression slope of {x: dateStr, y}
Analytics.leaderboard(users, allWorkouts, weekStartStr) // [{user, volumeKg, workouts, sets, prCount}] desc volume
Analytics.consistency(workouts, weeks) // {perWeek: [...], goalHitRate 0..1} given goal from caller
Analytics.duration(workouts)           // {avgMin, totalHours}
```
Determinism: all functions take data in, return data out. Weeks start Monday
(`U.weekStart`). Zero-fill missing weeks in series. Never NaN — return 0/null.

### `Charts` (js/charts.js) — all render into a container el, responsive SVG (viewBox + width:100%)
```js
Charts.line(el, {series:[{label, color, points:[{x:'YYYY-MM-DD'|number, y}]}],
                 yFmt?, xTicks?, goalY?, area?})   // 2px lines, ≥8px end markers w/ 2px surface ring,
                                                    // crosshair + tooltip, area fill 10% opacity
Charts.bars(el, {data:[{label, value, color?}], yFmt?, horizontal?})
                                                    // ≤24px bars, 4px rounded data-end (square baseline),
                                                    // 2px surface gaps, per-bar hover tooltip
Charts.groupedBars(el, {groups:[{label, values:[{seriesLabel, value, color}]}], yFmt?})
Charts.heatCalendar(el, {values:{dateStr:number}, weeks, color})  // GitHub-style, 5-step ramp from surface
Charts.rings(el, {rings:[{value, goal, color, label}]})           // Apple-style concentric activity rings
Charts.spark(el, {points:[{x,y}], color})                          // small inline sparkline, no axes
Charts.donut(el, {slices:[{label, value, color}]})                 // 2px surface gaps between slices
Charts.tooltip                                                     // shared singleton, positioned near cursor
```
Chart chrome (fixed): gridlines `rgba(255,255,255,.06)` 1px solid hairlines,
axis/tick text `var(--text-muted)` 11px, no chart borders, tick values rounded
clean + compact (`U.fmtNum`). Text never wears series color. Legend (colored dot +
label, text tokens) whenever ≥2 series; none for a single series. Tooltips list all
series at hovered x with swatches. Everything must degrade gracefully with 0 or 1
data points.

### `MuscleMap` (js/musclemap.js)
```js
MuscleMap.render(el, {values:{muscleId: 0..1}, onSelect?, selected?})
```
Renders stylized front + back human silhouettes side by side (shared SVG, viewBox
~`0 0 220 260` each), every one of the 18 muscle ids present as clickable paths
(front shows chest/front_delts/side_delts/abs/obliques/biceps/forearms/quads/
adductors/calves…; back shows traps/rear_delts/lats/upper_back/lower_back/triceps/
glutes/hamstrings/calves…; muscles visible from both sides may appear in both).
Fill = sequential ramp from `rgba(255,255,255,.06)` (0) to `var(--accent)` green
(1) via `MuscleMap.heatColor(v)`. Hover shows muscle label + value via title/tooltip;
click calls `onSelect(muscleId)`. Bodies must look clean and anatomical-ish (smooth
bezier paths, symmetric), not cartoonish blobs.

### `AppleHealth` (js/applehealth.js)
```js
AppleHealth.importFile(file, {onProgress}) -> Promise<parsed>
// Accepts export.zip (locate apple_health_export/export.xml via a minimal ZIP
// central-directory reader + DecompressionStream('deflate-raw'); 'stored' entries too)
// or a raw export.xml File. Parses STREAMING (TextDecoder chunks + per-line regex —
// files can be 100MB+; never DOMParser on the whole thing).
// parsed = { workouts:[{date, name, durationMin, kcal?, source}],
//            bodyMass:[{date, valueKg}], bodyFat:[{date, pct}],
//            daily:{steps:{date:val}, restingHR:{...}, activeEnergyKcal:{...},
//                   exerciseMin:{...}, vo2max:{...}, sleepHours:{...}},
//            counts:{records, skipped} }
// Record types: HKQuantityTypeIdentifierBodyMass (unit-aware kg/lb), BodyFatPercentage,
// StepCount (sum/day), RestingHeartRate (avg/day), ActiveEnergyBurned (sum/day),
// AppleExerciseTime (sum/day), VO2Max (last/day), HKCategoryTypeIdentifierSleepAnalysis
// (asleep intervals summed/day). Workouts: HKWorkoutActivityType* rows (strength/
// functional/HIIT/etc -> friendly names).
AppleHealth.applyImport(parsed, userId, {since?}) // -> {workoutsAdded, metricsAdded, samplesAdded}
// strength-type workouts become empty logged workouts (source 'apple') only when no
// manual workout exists that date; others become exerciseMin samples only.
AppleHealth.exportWorkoutsCSV(userId) -> csv string   // one row per set, display units
AppleHealth.shortcutsGuide                            // HTML string used by settings view
```

### `App` (js/app.js)
```js
App.init()
App.registerView(id, {title, icon, render(container, params), nav: true|false, order})
   // icon: inline SVG string 24x24, stroke currentColor
App.navigate(id, params?)       // hash routing '#/log?workout=w_1'; params object
App.current                     // {view, params}
App.rerender()                  // re-render current view (call after Store changes)
App.toast(msg, kind?)           // kind: 'ok'|'err'|'info'
App.confirm({title, message, danger?, confirmLabel?}) -> Promise<bool>
App.modal({title, content, actions?, onClose?}) -> {close, el}   // content: Element|html string
App.sheet(...)                  // bottom sheet on mobile, modal on desktop (same API)
App.fmtWeight(kg, opts?)        // -> '135 lb' per current user units
App.units()                     // current user units 'lb'|'kg'
App.icons                       // {dashboard, log, history, library, analytics, body, users, settings, plus, trash, edit, close, chevron, timer, trophy, flame, heart, sync, apple, search, check, copy, download, upload, ...}
```
Shell layout: top header (app wordmark, profile switcher avatar menu, sync status
dot) + content + nav. Nav = bottom tab bar `<768px` (5 items: Dashboard, History,
**big center Log button**, Analytics, Library) and left sidebar `≥768px` (all
views + settings/profiles at bottom). Onboarding when `users.length === 0`:
welcome screen → create first profile (name/emoji/color/units) → or "Explore with
demo data" (`Store.seedDemo()`). Profile switcher: avatar chips + "Manage
profiles". Settings view includes: profile editor, units, goals, rest timer,
plates, Apple Health import/export panel, Firebase sync panel, JSON backup/restore,
danger zone. `App.rerender()` is subscribed to Store changes automatically.

## Design system (css/styles.css) — tokens (`:root`)

```css
--bg: #0b0d10;          /* page */
--surface: #14171c;     /* panels/nav */
--card: #1b1f26;        /* cards & chart surface */
--card-2: #232935;      /* elevated/hover */
--border: rgba(255,255,255,.08);
--text: #f2f5f7;  --text-2: #98a2ae;  --text-muted: #6b7683;
--accent: #30d158;      /* brand green — buttons, active nav, rings (UI only) */
--accent-ink: #04220d;  /* text on accent */
--blue: #0a84ff; --orange: #ff9f0a; --purple: #bf5af2; --red: #ff453a;
--teal: #64d2ff; --yellow: #ffd60a; --pink: #ff375f;
/* CHART SERIES (validated CVD-safe order — use ONLY these for data series, in order) */
--s1: #2ca350; --s2: #0a84ff; --s3: #cf7c00; --s4: #bf5af2; --s5: #ff375f; --s6: #3399cc;
--radius: 16px; --radius-sm: 10px;
--shadow: 0 8px 24px rgba(0,0,0,.35);
font stack: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, Inter, system-ui, sans-serif;
```
Dark-only theme (`color-scheme: dark`). JS reads series colors via
`Charts.SERIES = ['#2ca350', '#0a84ff', '#cf7c00', '#bf5af2', '#ff375f', '#3399cc']`.
**Chart rules:** max 3 series per chart (fold rest into "Other"); ≥2 series always
get a legend AND direct/user labels (the 3-series set validates only with labels);
status/goal colors never used as series; user identity colors come from
`Charts.SERIES` (assigned at profile creation, stable per user).

Component classes (all styled in styles.css; UI modules use these, don't invent new
patterns when one exists): `.app`, `.topbar`, `.sidebar`, `.tabbar`, `.tab`,
`.fab-log`, `.view`, `.view-head`, `.card`, `.card-title`, `.stat-grid`, `.stat`
(label/value/delta/spark slots), `.btn` (+ `.primary .ghost .danger .small .icon`),
`.input`, `.select`, `.field` (label+control), `.chip` (+ `.active`), `.chip-row`,
`.segmented`, `.list`, `.list-row` (leading icon/avatar, title, sub, trailing),
`.avatar` (emoji on colored circle), `.badge`, `.modal-backdrop`, `.modal`,
`.sheet`, `.toast-wrap`, `.toast`, `.empty` (icon+title+sub+action), `.table-wrap`
(+ responsive `.table`), `.set-row` (log screen set entry grid), `.rest-timer`,
`.progress-bar`, `.muscle-legend`, `.searchbar`, `.divider`, `.kpi-ring-wrap`.
Breakpoints: single 768px. Bottom safe-area (`env(safe-area-inset-bottom)`) on
tabbar. Focus-visible rings on all interactive elements. Subtle transitions
(.15s ease) — no gratuitous animation; `prefers-reduced-motion` respected.

## Routing / view ids

`dashboard` (default), `log`, `history`, `templates`, `library`, `analytics`,
`body`, `leaderboard`, `settings`, `profiles`. Hash format `#/viewId` +
`?key=value` params. Unknown hash → dashboard.

## Quality bars

- `node --check` passes on every JS file.
- No console errors on load, navigation, or any primary flow.
- Fully usable at 375px wide and at 1440px.
- Analytics functions are pure and unit-testable in Node with a `window` stub.
- Everything keyboard-reachable; escape closes modals; labels on inputs.

---

# V2 CONTRACT ADDENDUM — "Capability" (P1)

Everything above still binds. This addendum extends it; where it conflicts, the
addendum wins. schemaVersion becomes 2 (a marker only — reading is governed by
permanent read-time invariants, never a one-shot migration).

## Read-time invariants (permanent, applied in load, mergeRemote-normalize, importJSON)

- `entry.type` absent ⇒ `'lift'` (existing entries untouched, byte-for-byte).
- `set.type` absent ⇒ `'work'`.
- Unknown entry types pass through VERBATIM (never stripped/flattened).
- normalizeEntry becomes a discriminated union dispatch on `entry.type` with a
  per-type normalizer table; the 'lift' normalizer is the existing code.

## Typed workout entries (inside workout.entries, alongside 'lift')

```js
// cardio — modes: run | ruck | swim | bike | row | stairs | circuit
{ id, type:'cardio', mode, distanceKm?, durationMin, avgHR?, maxHR?,
  effort?: 'easy'|'moderate'|'hard',      // easy/hard classification fallback when no HR
  surface?: 'road'|'trail'|'track'|'treadmill'|'sand',
  tempC?: number, fluidMl?: number,        // fluid prompted only when durationMin >= 90
  // ruck-only:
  loadKgDry?, loadKgTotal?, footwear?: 'boots'|'trainers', footNote?: string,
  notes?: string }

// mobility / durability session work
{ id, type:'mobility', modality:'static'|'dynamic'|'yoga'|'foam_roll',
  durationMin, targetMuscles:[muscleId], notes? }
{ id, type:'durability', items:[exerciseId], durationMin?, notes? }
  // durability items come from the DURABILITY_CHECKLIST exercise set

// test entry (unified history — tests are workouts containing one test entry)
{ id, type:'test', protocol: string,      // e.g. 'acft','run2mi','run5mi','ruck12mi',
                                          // 'pushups2min','situps2min','pullups_max',
                                          // 'plank','swim500m','slcalf_l','slcalf_r','deadhang'
  results: object,                        // per-protocol shape, defined in P2 protocols.js;
                                          // P1 stores {value} for simple timed/rep tests
  score?: number, notes? }
```

Workout-level additions (all optional, old clients round-trip them):
`workout.rpe` (session RPE 1-10, prompted at finish for every session type),
`workout.feel` ('easy'|'normal'|'hard'|'hurt'), `workout.checkin` (string — the
post-session check-in answer), `workout.kind` (convenience: 'lift'|'run'|'ruck'|
'swim'|'bike'|'row'|'circuit'|'mobility'|'durability'|'test'|'mixed', derived at
save from entries; display only, never load-bearing).

## New top-level collections (shim-protected; standard tombstones in deleted.*)

```js
painLog: [{ id, userId, date, muscleId,            // canonical 18 ids; 'shin_l','shin_r',
                                                    // 'foot_l','foot_r','knee_l','knee_r',
                                                    // 'ankle_l','ankle_r' also allowed (region ids)
  severity: 0-10, worseDuring: bool, boneLine: bool, morning: bool,
  note?, createdAt, updatedAt }]
coachJournal: [{ id, userId, date, entry, source:'user'|'checkin'|'coach',
  createdAt, updatedAt }]
```
Store API: `Store.addPainEntry(p)`, `Store.painFor(userId)` (date desc),
`Store.addJournalEntry(j)`, `Store.journalFor(userId)` (date desc), plus
update/delete with tombstones. Red-flag evaluation lives in guardrails, not Store.

## New per-user top-level fields (NOT under settings — mergeSettings whitelist trap)

```js
user.goals   = { preset: null|'sfas'|'general', selectionDate: null|'YYYY-MM-DD',
                 targets: { [protocol]: {min, competitive} }, updatedAt }
user.profile = { sex: null|'male'|'female', birthYear: null|number, updatedAt }
```
`user.settings.trainingProfile: 'simple'|'performance'` (add to defaultSettings;
default 'simple'). Performance mode is entered via goal setup ("Training for
something specific?") which also sets goals.preset.

## New module: js/guardrails.js — namespace Guardrails (pure, node-testable)

```js
Guardrails.checkSession(draftWorkout, priorWorkouts, user) -> [{level:'warn'|'stop',
  code, message}]   // evaluated at save: ruck load+distance double-increase vs
                    // last week, >2 rucks this week, dry load > 22.7kg (50 lb),
                    // longest-run jump > 25%, run mileage this week already
                    // > 110% of trailing 4-wk avg
Guardrails.weeklyStatus(workouts, user, weekStartStr) -> {
  runMileageKm, runRampPct, easySharePct, ruckCount, ruckLoadMiles,
  restDayTaken, warnings: [{code, message}] }   // >10% ramp, easy share < 75%,
                                                 // no rest day
Guardrails.painFlags(painLog) -> [{level:'warn'|'red', code, message, entryIds}]
  // red: boneLine, morning pain, severity>=7, same region rising 3+ entries,
  // worseDuring on consecutive sessions -> message includes "get it assessed"
Guardrails.MESSAGES  // plain-language, non-preachy copy for every code
```
Warnings are surfaced, never blocking — the user can always save ('stop' level
renders as a strong confirm, not a wall). All plain arithmetic, zero AI.

## ExerciseDB v2

- CATEGORIES gains `{id:'durability', label:'Durability'}` and
  `{id:'mobility', label:'Mobility'}`.
- ~40 new entries: unilateral lower (split squats, step-downs, SL RDL, SL calf
  raises, lateral lunges), calf/tibialis (bent+straight knee raises, tib raises,
  wall tib holds), grip (dead hangs, farmer/suitcase carries, plate pinch), core
  anti-rotation (Pallof, side plank, suitcase hold, bird dog), Copenhagen planks,
  hip airplanes, ankle/calf mobility, hip flexor + T-spine work. Same shape,
  canonical muscle ids only.
- `ExerciseDB.DURABILITY_CHECKLIST` = ordered [{id: exerciseId, slot:
  'unilateral'|'calf_tib'|'grip'|'core'}] used by the weekly compliance UI.

## Cross-type semantics (P1 acceptance criteria — binding)

- Streaks, rings ("workouts"), calendar presence: ANY session with >=1 entry counts.
- Calendar heat: volumeKg when > 0, else durationMin-scaled (charts unchanged;
  caller passes blended values).
- muscleWeeklySets / muscleVolume28d / muscleRecovery / recommendFocus / PRs /
  e1RM: LIFT ENTRIES ONLY (existing Analytics functions keep exact semantics;
  they silently skip non-lift entries — verify, don't rewrite).
- 'Repeat last workout' = most recent workout containing lift entries.
- History rows and workout detail get a kind glyph + kind-appropriate summary
  line (cardio: distance · pace · load; mobility: duration · areas).
- Leaderboard volume stays lift-volume in P1 (P3 adds badges/toggle).
- Templates remain lift-only in P1.

## Mode gate (binding)

Simple mode (default): UI identical to v1 plus at most 'Cardio' and 'Stretch'
chips on the log start screen; no guardrail banners, no pain log UI, no test
type, no goals/countdown. Performance mode unlocks: full chip row (Run/Ruck/
Swim/Bike/Row/Circuit/Durability/Test), guardrail surfacing, pain quick-log
(dashboard card + body view section), check-in prompts, goals editor.
Mode switch: Settings > Training, and via onboarding/goal question. Per-user.

## Logging UX (binding)

- Start screen: primary button unchanged ('Start empty workout'); chip row under
  it ordered by that user's recency; chips unused 4+ weeks collapse into 'More…'.
- Cardio logger: single screen, mode segmented control, big numeric fields
  (distance, duration), pace auto-computed live, ruck reveals load/footwear/
  foot-check fields, temp+fluid revealed for long sessions. After-the-fact entry
  in <=20 seconds. Saves a complete typed workout directly via Store (no draft).
- Finish flow (all types): RPE chip row 1-10 + feel chips + check-in question
  (P1: canned per-kind questions; free-text answer -> workout.checkin + a
  coachJournal entry with source 'checkin'). Skippable in one tap.
- Guardrails run on save: warnings render as a pre-save summary line + toast;
  'stop' level requires confirm. Weekly status line renders on dashboard
  (performance mode only).
- Pain quick-log: dashboard card 'Log a niggle' -> muscle-map tap + severity
  slider + 3 toggles + note. Red flags -> full-screen advisory (professional
  assessment message). History listed in Body view.

---

# V2 ADDENDUM — P2: STANDARDS ENGINE

## New module: js/protocols.js — namespace Protocols (pure; loaded after guardrails.js)

Static reference data + scoring math. NEVER stored in Store state (versioned code,
not user data). User overrides live in user.goals.targets.

```js
Protocols.LIST // ordered [{id, name, kind:'multi'|'time'|'reps'|'hold'|'pass',
               //  unit?, lowerIsBetter?, events?}] for:
// acft (multi: mdl 3RM lb, spt m, hrp reps, sdc mm:ss, plk mm:ss, tmr mm:ss)
// run2mi, run5mi, ruck12mi (time, lowerIsBetter), pushups2min, situps2min,
// pullups_max (reps), plank, deadhang (hold mm:ss), swim500m (pass|time),
// slcalf_l, slcalf_r (reps)
Protocols.byId(id)
Protocols.scoreACFT(results, {sex, birthYear}) -> { events: {mdl:{raw,points},...},
  total, pass, minEvent }   // official 2022 ACFT scoring tables, age/sex brackets
                            // (17-21,22-26,27-31,32-36,37-41,42-46,...), linear
                            // interpolation between table rows; missing events
                            // score null and exclude from total; pass = all
                            // entered events >= 60 pts
Protocols.DEFAULT_TIERS // {protocolId: {sfas: {min, competitive}, general: {...}}}
  // sfas per the master plan table (run2mi 930/810s, run5mi 2400/2250s,
  // ruck12mi 10800/9900s, pullups 8/15, pushups 60/80, plank 120/210s,
  // trapbar_rel 1.5/2.0, acft 360? use pass-line 60x6/500, swim pass/pass)
Protocols.tiersFor(protocolId, user) -> {min, competitive} | null
  // user.goals.targets[protocolId] overrides defaults; preset picks column
Protocols.currentBest(protocolId, {workouts, bodyMetrics}) -> {value, date} | null
  // from test entries (best by direction); trapbar_rel derived: best trap-bar
  // deadlift e1RM (Analytics.exerciseHistory ids: trap_bar_deadlift) / latest
  // bodyweightKg — both converted lb-free (ratio)
Protocols.readiness(user, {workouts, bodyMetrics}) -> {
  rows: [{protocolId, name, current, min, competitive, pct,   // pct 0-1 toward
          direction, lastTested}],                            // competitive
  overallPct, weakest: protocolId|null }                      // weakest = lowest pct
  // pct clamps 0..1; time protocols: pct = clamp((min-current)/(min-competitive));
  // untested rows: current null, pct 0, sorted last but weakest ignores untested
  // unless EVERYTHING is untested
Protocols.phaseFor(selectionDateStr, todayStr) -> { weeksOut, phase:
  'base'(>16w)|'build'(8-16w)|'peak'(3-8w)|'taper'(<3w), heatBlock: weeksOut<=3 }
Protocols.fmtValue(protocolId, value, units?) // '13:42', '15 reps', '512 pts', '2.1×BW'
```

`workout.entries[].type:'test'` results shapes (P2 canonical): single-metric
protocols {value:number} (seconds for time/hold, reps for reps); acft
{mdl,spt,hrp,sdc,plk,tmr} raw values + computed {score} cached on the entry at
save. P1's simple {value} entries remain readable as-is.

## Views (performance mode only)

- New registered view 'standards' (title 'Standards', nav:true order 55) in a NEW
  file js/views-standards.js (script tag after views-insights.js). App nav gains
  per-view `visible()` predicate support (App.registerView accepts visible: fn;
  sidebar/tabbar re-evaluate on render; view itself redirects to dashboard when
  not visible). Content: readiness scorecard (rows: name, current fmt, bar to
  competitive with min tick, last tested), weakest-link callout card ('Attack
  this: Pull-ups — 9 of 15'), phase/countdown card (weeksOut, phase name, phase
  guidance line, heat-block flag), test history list (all test workouts, tap ->
  detail), 'Record a test' button -> wizard.
- Test wizard (in views-standards.js, App.sheet): protocol picker -> per-protocol
  form (acft: 6 event inputs w/ live per-event points + running total; time
  protocols mm:ss masked input; reps numeric) -> saves workout {kind:'test'} with
  typed test entry (+cached score for acft) -> toast w/ result vs tiers.
- Dashboard (views-insights.js): readiness snapshot card (performance mode):
  overallPct ring + weakest link line + 'Standards' link; phase line added to
  countdown chip ('35 weeks out · Build').
- History detail for test workouts renders scored results (acft event table).

## Store touch (minimal)

Nothing new — test entries already flow through P1's normalizer; P2 may extend
the 'test' normalizer to preserve acft fields + cached score.
# V2 ADDENDUM — P3: STRUCTURED SET WORK (setwork)

User-approved rework (with mockups) of how flexibility, durability, and circuit
work are logged. Motivation: mobility was a minutes+body-map blob and durability
a tick-only checklist — both are really *sets of something that isn't
weight×reps* (holds, carries, per-side reps, stretches with an exertion scale)
and deserve the same logging quality as lifts. The capability attaches to the
EXERCISE, not to a workout mode: any workout may mix lift, setwork, cardio,
mobility, durability, and test entries.

## Why a NEW entry type (binding rationale — do not "simplify" this away)

Verified against old-client code paths; the fleet is mixed-version:

- New fields on LIFT sets are FATAL: old normalizeSet rebuilds every lift set to
  exactly {weightKg, reps, type, rpe} at load time, and Store.save on a stale
  device pushes the stripped state through sync — silent fleet-wide loss. All
  lift edit paths also filter sets to reps>0 and delete entries with no
  surviving sets, which would destroy hold-only sets outright.
- New fields on the existing 'mobility'/'durability' types are FATAL on edit:
  old quick-logger save paths rebuild those entries from scratch, dropping
  unknown fields, and dispatchWorkoutEdit routes single-entry sessions straight
  into them.
- Unknown entry TYPES are provably safe: normalizeEntry passes them through
  verbatim (incl. mergeRemote/importJSON via normalizeState), the detail view
  renders "Logged by a newer version of IronLog — kept as-is", and the mixed
  editor lists them read-only and re-emits them untouched on save.

## New entry type: 'setwork'

```js
{ id,                              // U.uid('en')
  type: 'setwork',
  exerciseRef: 'dead_hang',        // ExerciseDB or custom id.
  method?: 'static'|'dynamic'|'pnf'|'loaded',  // stretches only; omit otherwise
  sets: [ {                        // >=1 valid set; valid = reps>0||holdSec>0||distanceM>0
    reps?: number,                 // >0 — rep-based drills / dynamic stretches
    holdSec?: number,              // >0 — timed holds & static/pnf/loaded stretches
    distanceM?: number,            // >0 — carries (meters; km belongs to cardio)
    weightKg?: number,             // >=0 — added/implement load; absent = bodyweight.
                                   //   Carries: TOTAL implement load per hand summed.
    side?: 'L'|'R',                // absent = bilateral/both
    intensity?: 1|2|3|4,           // STRETCH DEPTH scale (below); stretches only
    rpe?: number                   // 6-10, durability strength drills only
  } ],
  notes?: string }
```

FORBIDDEN NAMES (load-bearing invisibility guarantees — binding):

| Never | Why |
|---|---|
| `exerciseId` on a setwork entry | old exerciseHistory/prevSetsFor/creditWorkSets dispatch on that key and would pollute lift charts and hints with zero-value rows |
| `type` on a setwork set (esp. `'work'`) | old workSets/setVolume/workoutSets/creditWorkSets count s.type==='work'; absent key ⇒ old clients compute zero volume/PRs/muscle credit from setwork |

normalizeSetworkEntry (added to the entry-normalizer dispatch): shallow-copy,
coerce id/exerciseRef/notes, coerce each set (delete `type` defensively; numeric
coercion deletes non-finite; intensity clamps to int 1..4; side coerced to
'L'|'R' or deleted), UNKNOWN KEYS PASS THROUGH VERBATIM at both entry and set
level. `method` coerced to the enum or deleted. This normalizer must never
strip fields it does not know — that asymmetry is the bug this phase fixes;
same rule applies to every NEW edit form this phase adds.

Division of labor (binding): weighted-reps durability drills (split squat,
single-leg RDL, lateral step-down, weighted calf raises...) are logged as PLAIN
LIFT ENTRIES — they already earn volume/PRs/e1RM/muscle credit. setwork covers
holds, carries, stretches, and per-side bodyweight rep work. The exercise's
`setShape` (below) decides, not the workout kind.

## ExerciseDB additions

- Every exercise MAY carry `setShape: 'weight_reps'|'hold'|'carry'|'stretch'`;
  absent ⇒ 'weight_reps' (all existing entries unchanged). Set on: planks,
  hangs, wall-sits → 'hold'; farmer/suitcase/overhead carries → 'carry'; all
  category-'mobility' entries → 'stretch'.
- `perSide: true` on unilateral exercises (side chips + L/R auto-alternate).
- ~20 new stretch entries (category 'mobility', setShape 'stretch', method
  defaults, primary/secondary muscles) covering an SFAS athlete's gaps:
  couch stretch, pigeon, 90/90, pancake, seated/standing hamstring, jefferson
  curl (loaded), calf wall + soleus, ankle KOT, hip flexor kneeling, adductor
  rockback, thoracic extension, wall slide, pec doorway, lat hang side bend,
  wrist flexor/extensor, plantar rolling, cossack squat, world's greatest,
  leg swings (dynamic), elephant walk (dynamic).
- `ExerciseDB.DURABILITY_ROUTINES` — code-defined (NOT user templates: the
  template normalizer on old clients flattens structured targets):
  `{ A: [{exerciseId, sets, targetReps?|targetHoldSec?|targetDistanceM?, weightHint?}], B: [...] }`
  A: split_squat, single_leg_calf_raise, dead_hang, pallof_press, farmer_carry.
  B: lateral_step_down, tibialis_raise, side_plank, copenhagen_plank, single_leg_rdl.
  DURABILITY_CHECKLIST and its slots stay — they now power derived coverage.

## Stretch depth scale (intensity 1–4) — binding anchors, shown in the UI

1 **Easy** — first stretch sensation, ~50–70% of range; could hold for minutes.
2 **Working** — clear stretch that FADES over the hold; slow nasal breathing.
    The daily-driver dose.
3 **Deep** — end range, does not fade, needs deliberate exhales. PNF/loaded
    only, warm, 2–3×/week.
4 **Limit** — involuntary guarding: shaking, breath-holding, sharp/nervy.
    Loggable for honesty; treated as a flag, never a target.

## Builder integration (views-log.js)

- mountEditor dispatches a row renderer per entry type at the top of
  setRowHTML/entryCardHTML/buildFinishedEntries; the lift branch stays
  byte-for-byte current behavior. Simple mode can never create setwork entries.
- Row grids reuse .set-row vocabulary:
  hold → SET | PREV | HOLD (mm:ss mask, shared parser) | SIDE | ✓
  carry → SET | PREV | KG | METERS | ✓
  stretch → hold/reps rows per method + one 4-chip STRETCH DEPTH row per entry
  (sticky per entry; default 2 · Working)
- SIDE chip cycles L→R; Add set on a perSide exercise auto-alternates and
  clones the previous row otherwise (same as lifts). PREV hints come from the
  user's last setwork entry for that exerciseRef; ✓ accepts hint values.
- Hold countdown timer: timer glyph on hold-shape cards starts a countdown pill
  reusing the rest-timer singleton chrome, target = filled/prefilled seconds
  (default 30); on finish: vibrate, write holdSec = target, mark set done.
  Starting it cancels a running rest timer. Typing always works; the timer is
  never required. Countdown only — max-effort hangs belong in the Test wizard.
- Exercise picker inside a draft: picking a setShape-'hold'/'carry'/'stretch'
  exercise creates a setwork entry (performance mode; in simple mode those
  categories stay filtered out of the picker as today).
- Durability chip → mini-sheet: "Durability B" primary (auto-alternates vs the
  user's last routine letter), "Repeat last", "Quick checklist" (legacy path,
  unchanged shape). First two seed a normal draft via startDraft.
- Stretch quick sheet (legacy 'mobility' shape, still the default forever):
  adds (a) "Same as last time" prefill chip when a prior mobility session
  exists — the one family-visible change, it writes the unchanged legacy shape;
  (b) performance-mode-only "Log individual stretches" button swapping the
  sheet content to a mini-builder of setwork stretch cards ('Add stretch' →
  picker filtered to category mobility). If the last stretch session was
  structured, the repeat chip repeats THAT (values prefilled, ~3 taps).
- Edit: setwork sessions get an editable branch in dispatchWorkoutEdit/mixed
  editor (new clients). PATCH THE CURRENT GEN TOO: mobility/durability/test
  edit forms must start preserving unknown keys (cardio's CARDIO_KNOWN_KEYS
  pattern) so the NEXT schema evolution isn't trapped by rebuilt entries.

## Cardio entry — additive fields (safe: old cardio editor preserves unknown keys)

```js
{ ...existing cardio fields...,
  elevationM?: number,          // vert gain — run/ruck/stairs
  intervals?: { reps, distanceM?, workSec?, restSec?, restType?: 'jog'|'stand' },
  rounds?: number,              // circuit mode
  stations?: [{ exerciseId?, name?, reps?, durationSec?, weightKg? }] }
```
- Circuit logger: collapsed optional "Structure" card (rounds stepper + station
  list); zero new required fields; "repeat last circuit" prefills everything.
- Run/swim interval section writes the interval TOTAL into distanceKm so weekly
  mileage guardrails stay truthful on every client.
- Stations NEVER feed volume/muscle analytics (lift-only semantics stay binding).
- normalizeCardioEntry keeps preserving unknown keys; the new fields get
  numeric/shape coercion, station array items shallow-copied.

## Derivations (read-time unions over legacy + setwork; no migrations)

- Guardrails.weeklyStatus gains durability coverage:
  `durability: { slots: { unilateral, calf_tib, grip, core }, covered, total: 4 }`
  where each slot = work-set count vs code-defined target
  (unilateral 6, calf_tib 4, grip 3, core 4). Sources, week-windowed:
  (a) lift-entry work sets whose exerciseId is in DURABILITY_CHECKLIST,
  (b) setwork valid sets whose exerciseRef is in the checklist (L and R rows
  count 1 each), (c) legacy durability items[] — 1 nominal set per id.
  'durability_gap' warning fires only from day 5 of the week (no mid-week nag).
- Stretch-intensity guardrails: any intensity-4 set → 'warn' nudge at save
  ("that's guarding, not stretching — back off and log a niggle if it's
  sharp"); >=3 intensity-3+ sets on the SAME exerciseRef within 14 days AND a
  pain-log entry on an overlapping muscle → 'warn' with a pain quick-log link.
  Deterministic, pure, unit-tested in guardrails.js.
- Analytics additions (pure): `drillHistory(workouts, exerciseRef)` →
  [{date, bestHoldSec?, topWeightKg?, distanceM?, side?}] for library
  progression charts (hold seconds / carry load over time);
  `stretchMinutesByMuscle(workouts, since)` → {muscleId: minutes} from setwork
  stretch sets (holdSec, primary 1.0 / secondary 0.5 weighting; dynamic sets
  0.5 min nominal each) UNIONED with legacy mobility blobs (durationMin split
  across targetMuscles). Powers a performance-mode-only "Stretched" toggle
  layer on the Body view muscle map.
- Standards: `Protocols.trainingBest(protocolId, workouts)` reads setwork holds
  (dead_hang → deadhang, plank family → plank) and renders as a secondary
  "training" series + "Record as test" CTA prefilling the test wizard.
  currentBest/readiness stay TEST-ONLY — training data never writes them.
- PR semantics: Analytics.prs stays lift-only (P1 contract). Hold/carry bests
  surface via drillHistory only this phase.

## Rendering

- History summaries: 'Durability · 4 drills · 14 sets · 25 min',
  'Stretch · 6 stretches · 18 min · hips, hamstrings'; kind glyphs for setwork
  chosen by majority exercise category (mobility → stretch glyph, else shield).
- Detail: lifts-style table per setwork entry with unit-aware strings —
  '3×8/side @ 24 kg', '3×0:45', 'L 0:40 · R 0:38', '3 × 40 m @ 32 kg',
  stretch rows append depth ('@ Working'). Old clients degrade to the
  kept-as-is card (acceptable, documented).
- workout.kind for setwork-only sessions derives via the existing generic path;
  display-only as before.

## Mode gate & family safety

Simple mode is byte-identical EXCEPT the "Same as last time" chip on the quick
stretch sheet. Simple-mode UI can neither create nor edit setwork entries.
Automated leak check extends to: no SIDE/HOLD/depth UI, no durability routine
sheet, no structure card, no stretched-map toggle in simple mode.

## Acceptance tests (binding)

1. setwork fixture round-trips byte-identical through normalizeState (unknown
   entry/set keys preserved).
2. Every existing Analytics function returns IDENTICAL output on a state with
   and without setwork entries (invisibility proof).
3. Old-client simulation: P1-era normalizers (from git history) preserve a
   setwork workout through load→save→merge unchanged.
4. Mixed workout (lift + setwork): lift edit paths untouched; setwork editable
   branch round-trips; legacy mobility/durability quick edits still work.
5. Coverage math: lift + setwork + legacy checklist sources union correctly;
   L/R rows count 1 each; double-logging the same drill both ways never
   produces NaN or double compliance beyond set counts.
6. Guardrail intensity rules unit-tested incl. the 14-day window and muscle
   overlap.
7. Playwright smoke extends: durability routine flow (seed B, ✓ a hold with
   timer, save), structured stretch flow (repeat chip, depth chip, save),
   circuit structure add + repeat, simple-mode leak check additions.

## Release

sw.js CACHE_NAME bumps to 'ironlog-v2p3'; no SHELL additions expected (no new
files planned — protocols/views files exist; if a new file IS added, SHELL must
list it). Deploy = PR → squash merge → verify live cache string.

# V2 ADDENDUM — P3.5: GUIDED SESSION PLAYER + ROUTINE PLANNER

User-approved (with mockups) evolution of P3: sessions should be APP-LED, not
logged after the fact. The app runs the workout — timers, sides, rests, cues —
and the log is a byproduct of doing. Plus a planner: users build their own
routines (pick exercises, customize sets/reps/holds/rests) and the player runs
them. All P3 data-model semantics are unchanged — the player WRITES ordinary
lift/setwork/cardio entries.

## New collection: routines (fleet-safe by design)

NOT the templates collection: old clients' template normalizer rebuilds items
to {exerciseId,targetSets,targetRepsLow,targetRepsHigh} and would flatten
structured targets. A NEW top-level entity collection rides the P0 shim's
unknown-collection pathway instead — old clients preserve and entity-merge
collections they don't know, with tombstone union (this is the exact scenario
the P0 forward-compat work was built for; prove it in the acceptance tests).

```js
state.routines: [{
  id: U.uid('rt'), userId, name,             // user-visible name
  kind: 'stretch'|'durability'|'circuit'|'custom',
  items: [{
    exerciseId,                              // ExerciseDB/custom id; setShape drives the row
    sets,                                    // integer >= 1
    targetReps?, targetHoldSec?, targetDistanceM?, targetWeightKg?,
    restSec?,                                // per-item override of routine restSec
    method?,                                 // stretch method override
    note?: string
  }],
  restSec,                                   // default rest between sets (sec)
  createdAt, updatedAt                       // LWW via updatedAt like all entities
}]
state.deleted.routines: { [id]: ts }         // tombstones
```

Store API: `routinesFor(userId)` (name asc), `addRoutine`, `updateRoutine`,
`deleteRoutine` (tombstone), `normalizeRoutine` in the collection dispatch —
shallow-copy, coerce, unknown keys preserved at routine and item level.
COLLECTIONS/DELETED_KEYS gain 'routines'; sync merge needs no changes (entity
LWW already generic).

## Routine planner (performance mode)

- Entry points: 'New routine' in the durability and stretch entry sheets; a
  'Routines' card in the Templates view (perf mode only) listing the user's
  routines with edit/duplicate/delete.
- Editor sheet: name input; kind chips; item list — each row shows exercise
  name + per-setShape target controls (reps stepper / hold mm:ss / distance m /
  weight kg — pick from ex.setShape, default weight_reps), sets stepper, rest
  override, reorder ▲▼, remove; 'Add exercise' → existing picker (perf mode,
  all categories); default-rest stepper; Save / Delete.
- Built-in DURABILITY_ROUTINES A/B stay code-defined and appear alongside user
  routines with a 'Duplicate to customize' action (copies into state.routines).

## Session player (NEW file js/player.js)

A full-screen overlay OWNED OUTSIDE the view system (appended to body; chrome
hidden while active via the existing setChromeHidden; App.navigate while a
session is active pauses — never destroys — the session).

Timeline compiler (pure, unit-testable, exported as Player.compile):
routine → ordered steps:
  {type:'work', shape:'hold'|'reps'|'carry'|'weight_reps', exerciseId, side?,
   setIdx, targetSec?/targetReps?/targetM?/targetKg?}
  {type:'rest', sec, afterEntryIdx}       // from item restSec ?? routine restSec
  perSide items expand each set to L then R (no rest between sides unless
  configured); circuit kind compiles to a rounds structure instead (below).

Step behaviors:
- hold: countdown ring from target; auto-advance at 0 with vibrate + beep +
  optional voice ('switch sides' / next exercise name); pause/resume; −15s/+15s
  adjusts the CURRENT step target; completing early (tap ring) records ACTUAL
  elapsed seconds — the entry gets what really happened, never blindly the plan.
- reps/weight_reps/carry: target shown large with last-time line; 'Done' tap
  advances (inline steppers to adjust actual reps/kg/m before advancing).
- rest: countdown + one-tap STRETCH DEPTH ask for the just-finished hold/
  stretch set (writes intensity on that set) + next-up card (name, target,
  last-time) + 'Skip rest'.
- circuit: round player — big round counter, elapsed/AMRAP countdown clock,
  station list with current highlighted (tap station to advance, big 'Round
  done' to close a round); finish writes the cardio circuit entry (rounds,
  stations, durationMin) exactly per the P3 additive schema.

Session lifecycle:
- Start points (perf mode only): durability chip sheet ('Start guided —
  Durability B' primary, 'Repeat last, guided'), stretch sheet ('Start
  guided' when any stretch routine exists), circuit logger ('Start guided'),
  any routine row. Manual forms remain, labeled as the fallback path
  ('Trained without the phone?').
- Accumulates entries in memory; persists {routineRef, stepIdx, actuals,
  startedAt} to localStorage 'ironlog/activeSession' on every step; app boot
  with a persisted session offers Resume/Discard (mirror activeWorkout draft
  semantics).
- Finish → summary screen (per-entry actuals, editable) → Save writes ONE
  workout via Store.addWorkout (setwork/lift/cardio entries per shapes;
  durationMin from wall clock; startedAt/endedAt) → existing post-save
  check-in flow runs unchanged. Quit mid-session → confirm; saving partial
  keeps completed steps only.

Hardware/browser (all try/catch, all optional, no external deps):
- Screen wake lock: navigator.wakeLock.request('screen'), re-acquired on
  visibilitychange (iOS 16.4+/Chrome; silently absent elsewhere).
- Vibration: navigator.vibrate patterns (end-of-hold vs end-of-rest distinct).
- Beep: WebAudio oscillator (no audio assets), created lazily on first user
  gesture (autoplay policy).
- Voice: speechSynthesis utterances ('switch sides', next exercise name,
  'last ten seconds'); mute toggle in the player top bar persisted at
  user.settings.playerVoice ('on' default); voice never required for flow.

## Mode gate & family safety

Everything perf-gated; simple mode BYTE-IDENTICAL this phase (no exceptions).
The routines collection syncs through old clients untouched (P0 pathway);
player-written workouts are ordinary P3 entries — old clients render them via
the existing kept-as-is path. No changes to lift analytics semantics.

## Acceptance tests (binding)

1. routines round-trip: fixture with unknown routine/item keys byte-identical
   through normalizeState; P1-era client sim (git show bdc9639:gym/js/store.js)
   preserves + entity-merges the routines collection and its tombstones.
2. Player.compile unit tests: perSide L→R expansion, rest insertion + per-item
   override, set counts, circuit rounds structure, empty/1-item routines.
3. Player e2e (Playwright, short targets: 2s holds/rests): run a 2-exercise
   routine to completion — assert written workout (actual elapsed holdSec,
   depth from rest-tap, sides, kind, durationMin >= wall time), AND a
   mid-session reload → Resume path continues at the same step.
4. Circuit guided e2e: 2 rounds → saved cardio entry rounds/stations correct.
5. Simple-mode leak: no guided/planner/routines UI anywhere for a simple user.
6. Analytics invisibility suite still green (player writes normal entries).

## Release

js/player.js added: index.html script tag AFTER views-log.js; sw.js SHELL adds
'./js/player.js'; CACHE_NAME → 'ironlog-v2p4'. Deploy = PR → squash merge →
verify live cache string.

# V2 ADDENDUM — P4: INTELLIGENCE (load model · recovery · Apple Health v2)

Implements the master plan's "P3 · Intelligence" phase (renumbered P4 after the
setwork/player insertions) and its Daily/Weekly feedback loops. Deterministic
arithmetic only — same philosophy as guardrails: auditable thresholds, no ML.

## New module: js/loadmodel.js — namespace LoadModel (pure; after analytics.js)

Per-modality load, NEVER blended into one number:
- run: km/week (runs incl. treadmill; surface-agnostic)
- ruck: load-miles/week = Σ(loadKgTotal × km) (per plan, headline ruck number)
- lift: tonnage kg/week (existing Analytics.workoutVolume over lift entries)
- engine-other: minutes/week (swim/bike/row/stairs/circuit durationMin)

```js
LoadModel.weekly(workouts, modality, weekStart) -> number
LoadModel.acwr(workouts, modality, todayStr) -> { acute, chronic, ratio|null }
  // acute = trailing 7d sum; chronic = mean of trailing 4 weekly sums (7d
  // windows ending today); ratio null when chronic < a floor (insufficient
  // history — never divide by ~0)
LoadModel.status(workouts, todayStr) -> {
  perModality: { run:{acute,chronic,ratio,zone}, ruck:{...}, lift:{...},
                 other:{...} },
  headline: string|null }        // plain-language daily guidance, worst zone
  // zones: ratio > 1.4 'ramping-fast' · 1.3–1.4 'ramping' · 0.8–1.3 'steady'
  //        < 0.8 'detraining' (chronic-established only)
  // headline example (plan verbatim style): 'Ramping fast — 40% above your
  // 4-week ruck average. Today should be easy or off.'
LoadModel.restingHR(healthSamples, todayStr) -> { today|latest, baseline28,
  spike: bool }                  // spike = latest >= baseline28 × 1.07 for the
                                 // 2 most recent consecutive sampled days
LoadModel.greenWeek(workouts, user, weekStart) -> { sessions, restDayTaken,
  green: bool }                  // green = >=4 sessions AND >=1 full rest day
                                 // (elapsed-days rule for the current week)
LoadModel.ruckEconomy(workouts) -> [{ date, km, loadKg, minPerKm }]
  // rucks with distance+duration; view plots pace vs load
```

## Surfaces (performance mode only; typeof-guarded everywhere)

- Dashboard: TODAY strip at top — LoadModel.status headline + per-modality
  ACWR chips (zone-colored, CVD-safe palette); resting-HR spike appends an
  'easy day' advisory. Green-week chip replaces the streak flame for
  performance users only (simple-mode streaks byte-identical).
- Analytics view gains a Performance section: easy/hard weekly split stacked
  bars (existing classification) · ruck economy scatter (pace vs load, last 12
  wk highlighted) · benchmark pace trends (2mi/5mi from test entries + best
  cardio efforts at those distances) · per-modality weekly load bars with
  chronic line. Max 3 series/chart, direct labels, existing Charts idioms.
- Recovery strip (dashboard card): resting-HR sparkline w/ baseline + spike
  flag · sleep hours (7d avg vs 28d) from healthSamples · open pain entries
  count · rest-day status. Absent data degrades to hints, never crashes.
- Deload integration: guardrails gains checkWeekly inputs — easy-split
  collapse and restingHR spike produce 'warn' advisories in weekly status
  (existing TEMPLATES pattern); red-flag pain rules unchanged and still
  supreme.

## Apple Health v2 (applehealth.js + views wiring)

- Workout import: parse <Workout> elements for Running/Walking/Hiking (ruck
  candidate)/Swimming/Cycling/Rowing/StairClimbing → typed cardio entries
  (distanceKm, durationMin, avgHR when present, source 'apple'); Hiking with
  the user's confirmation maps to ruck (loadKg left null — prompt once per
  import session). Import writes workouts with source:'apple' + a stable
  appleId (HK uuid or start-timestamp hash) on the workout.
- Double-count protection: skip an Apple workout when (a) same appleId already
  imported, or (b) a manual workout of the same user exists on the same date
  whose kind matches and |durationMin delta| <= 25% — list skipped items in
  the import summary instead of silently dropping.
- healthSamples continues to carry restingHR/sleep/steps/vo2max rows (already
  implemented); the recovery strip reads them read-only.
- Old clients: imported workouts are ordinary cardio workouts (P1 shape) —
  no new entry types; forward-compat untouched.

## Leaderboard (family view) — the one family-visible change, per the approved
master plan ('activity badges so your 12-mile ruck finally counts'):
- Each member card gains small activity badges for the trailing 4 weeks:
  sessions count + per-kind icons (lift/run/ruck/swim/other) with counts.
  Volume metric stays lift-only. Additive rows only; no layout reflow of
  existing elements; simple-mode users see the same badges (they are part of
  the shared family surface, sanctioned by the plan).

## Acceptance tests (binding)

1. LoadModel pure functions: weekly windows (Mon boundaries per app
   convention), ACWR floors/zones incl. insufficient-history null, headline
   selection (worst zone wins; ties: ruck > run > lift > other), restingHR
   spike (consecutive-sampled-days rule, gaps tolerated), greenWeek elapsed
   rule, ruckEconomy filtering. 100+ asserts.
2. Analytics invisibility: existing functions byte-identical outputs (suite
   extension); simple-mode leak sweep extended (no TODAY strip, no recovery
   strip, no perf analytics section; leaderboard badges ARE allowed).
3. Apple import: fixture export.xml with workouts+samples → correct typed
   entries, appleId dedupe, manual-overlap skip, Hiking→ruck confirm path,
   import summary counts. Node-level harness on the parser + Playwright
   file-input flow.
4. sw.js CACHE_NAME → 'ironlog-v2p5'; loadmodel.js in SHELL + index.html after
   analytics.js.

# V2 ADDENDUM — P4.5: ONE LIVE SESSION (pace as a layer)

User-approved (with mockups) correction of P3.5. The guided player kept its OWN
compiled timeline and actuals (`S.compiled.steps`, `S.actuals`,
`ironlog/activeSession`) — a shadow copy of a workout. That is precisely why
nothing could be edited mid-session: editing would have to mutate a frozen
script that maps to nothing. This phase inverts the ownership.

USER'S REQUIREMENT (binding): "I need to be able to do the durability workout
and edit what I'm doing on it, concurrently... player can work in its sets, or
at the level of each rep, or at the level of the exercise if rest time is
determined... making it such that all of this is selectable and variable."

## Principle

**One session record: the draft.** `ironlog/activeWorkout` is the single source
of truth for EVERY session type. The timing engine drives `draft.entries[i].sets[j]`
directly. The focus view is a RENDERER over that draft, never an owner.
`ironlog/activeSession`, `S.compiled`, `S.actuals` and the player's private save
path are DELETED. Player.compile survives only as a derived projection
recomputed on demand (for "what's next" and time-left estimates) — never as
stored state.

## Pace: a scope, with cadence as an orthogonal modifier

RESOLVED against a competing "monotone ladder incl. rep" proposal: rep-cadence
is a CUE that runs inside a timed set; it advances nothing, so it must not be a
mutually-exclusive value of the same enum.

```js
pace: 'off' | 'set' | 'exercise' | 'session'   // what the app DRIVES
cadence: boolean                                // tempo metronome INSIDE a timed set
```

| pace | app drives | hands back after | rest |
|---|---|---|---|
| `off` | nothing (elapsed clock only) | — | today's advisory pill, unchanged |
| `set` | ONE set to completion | that set | advisory only |
| `exercise` | remaining sets of ONE entry, work→rest→next | that entry | DRIVEN (auto-start, skippable, ±15s, no trailing rest) |
| `session` | chains exercise-pace across entries | end of workout | driven, incl. inter-exercise transition |

Governing rule: **the app drives every step it can time deterministically; the
user triggers every step it cannot.** Holds/rests are timeable; reps are not
unless a tempo exists. So `weight_reps` gets no set-level driver without a
tempo — it advances on ✓.

Per-shape set drivers:
```
hold, stretch(static|pnf|loaded) -> countdown(target); at end write
                                    holdSec = ACTUAL elapsed seconds, done = true
stretch(dynamic), weight_reps    -> only with a tempo: metronome + auto-✓ at
                                    targetReps; otherwise no driver (✓ advances)
carry                            -> elapsed stopwatch; ✓ stops it; never
                                    auto-writes distanceM/weightKg
```

Tempo is a PRESCRIPTION, never an observation: `normalizeSet` rebuilds every
lift set to exactly {weightKg, reps, type, rpe} on this and every older client,
so a tempo can physically never be recorded on a lift set. Stored on the routine
item (`item.tempo: '3-1-3'`); the UI must never imply it was recorded.

## Direct manipulation beats configuration (the 95% path)

- **Tap a set's NUMBER** → run exactly that set, whatever the resolved pace.
- **Tap a card's stopwatch** → run that exercise (its sets + rests), then STOP.
The picker exists only for Off / Whole-session / cadence / changing defaults.

## Precedence (lowest → highest)

```
user.settings.pace[kind]      // per-workout-kind default
  -> routine.pace             // routine-level, when seeded from a routine
  -> item.pace                // routine item override
  -> draft._pace              // session chip (this session only)
  -> entry._pace              // card override
  -> the button just tapped   // wins for that one action
```

Defaults table (binding): durability `set` · stretch `set` · **lift `off`** ·
circuit `session` · interval (run/swim) `set` · steady cardio `off` (quick
logger unchanged — a 40-minute steady run does not belong in a live session
screen). cadence default false.

Storage: `user.settings.pace` (object keyed by kind), `user.settings.cadence`,
`user.settings.restSec`. VERIFIED SAFE: mergeSettings carries unknown settings
keys through untouched (P0 forward-compat clause, store.js), so old clients
preserve these. `settings.restTimerSec` and `settings.playerVoice` keep their
current meanings. Routine-level `pace`/`tempo` ride the routines collection's
existing unknown-key preservation.

## Set identity — draft-local, provably unpersisted

Timers bind to `(entryId, _sid)`, never to array index or object reference
(`repaint()` rebuilds `root.innerHTML`, destroying identity).

```js
function sidOf(set) { return set._sid || (set._sid = U.uid('s')); }
// loadDraft() backfills alongside the existing `if (!en.id)` loop.
```

`_sid` is draft-local and MUST NOT reach Store or sync. Proof chain (all
pre-existing, verify in tests): `cleanSetworkEntry` skips `_`-prefixed keys at
entry AND set level; `buildFinishedEntries` builds lift sets as 4-key literals;
the finish payload enumerates its fields. NO normalizer change, NO contract
change, NO old-client exposure. Do NOT introduce a persisted set id — lift sets
are rebuilt to four keys by `normalizeSet` on every client, so a persisted id
would be legal on setwork and silently dropped on lifts; asymmetric set identity
is a permanent trap.

## Reconciliation — one choke point

Every draft mutation already funnels through `saveDraft()` (`ctx.persist`), so:

```js
function saveDraft() {
  if (!draft) return;
  rev++;
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));   // existing
  Session.reconcile();       // retarget / orphan-check the running timer
  notifySubscribers(rev);    // focus view repaints; builder opts out
}
```

Authoritative timer↔edit rules:
- Editing the RUNNING set's target → retarget live, preserving elapsed
  (`remain = newTarget - elapsed`; if already past, expire immediately).
- Deleting the running SET, or its ENTRY → cancel the timer cleanly, keep the
  session, record nothing for it, advance the cursor to the next pending set.
- Reordering around the running set → binding is by `_sid`, so it follows.
- Starting a second timer → the first is cancelled (single timer slot).
- Backgrounded/expired while hidden → mark `boundary`, do not silently record;
  on return show what expired and let the user confirm or adjust.
- The cursor (`draft._active`) is ADVISORY, never modal: editing any other row
  never moves it.

## Two presentations, one state

`draft._view: 'builder'|'focus'`. Switching is one tap in BOTH directions and
never interrupts a running timer. Focus view keeps every bit of P3.5 chrome
(name, ring, ±15s, pause, side badge, next-up, depth ask, voice/vibrate/beep,
wake lock) and gains: a Builder button, and a tap-a-set sheet that edits the
draft in place WHILE THE CLOCK KEEPS RUNNING. Circuits open in focus by default;
durability/stretch open in builder.

## Bug fixed in passing (binding)

Today the builder's hold timer writes `holdSec = target` while the player writes
actual elapsed — two answers for one thing. ONE RULE EVERYWHERE: `holdSec` is
always the seconds ACTUALLY held (early stop records the short time; overtime
records the long one).

## Scope boundary

In the live substrate: lift (pace off by default), durability, stretch,
circuit/AMRAP, run/swim intervals. NOT in it: steady cardio — its quick logger
is unchanged. Manual after-the-fact logging for every type stays exactly as it
is today.

## Mode gate

Performance mode only for all pace UI. Simple mode BYTE-IDENTICAL: family users
keep today's lift flow (pace off, advisory rest pill), the quick loggers, and no
pace controls anywhere. Lift default `off` guarantees the flow the user praised
is unchanged for everyone.

## Acceptance tests (binding)

1. `_sid` never persists: fixtures through save/finish/merge/import contain no
   `_`-prefixed key at workout, entry, or set level; P1-era client sim
   round-trips a player-written workout unchanged.
2. Concurrent edit (Playwright, short targets): with set 2 running, edit set 3's
   target, add a set, delete a different exercise, reorder — the timer keeps
   running, stays bound to set 2, and records set 2's ACTUAL seconds.
3. Retarget/orphan rules: each authoritative rule above asserted.
4. Pace precedence resolves per the chain; the tapped button wins; defaults
   table honored per kind.
5. Builder↔focus toggle mid-timer preserves timer, cursor and edits in both
   directions; editing from inside focus writes through to the draft.
6. holdSec is ACTUAL in both views (early stop and overtime cases).
7. Simple-mode leak sweep: no pace UI anywhere; lift flow byte-identical to the
   P4 baseline.
8. Existing suites stay green; `ironlog/activeSession` is gone and a stale one
   left by P3.5 is discarded safely on boot.

## Release

sw.js CACHE_NAME → next version; no new files expected (player.js is
refactored, not replaced).

# V2 ADDENDUM — P5: VISUAL SYSTEM AND PER-PROFILE THEMES

User-approved. The app ships ONE look ("Field / Issued": stamped 6px geometry,
monospace numerals, stencil section eyebrows, the redrawn anatomical muscle map)
and SEVERAL palettes. Each profile picks its own palette — "Just change the
colors. Styles stays the same."

## Two layers, strictly separated

**UNIVERSAL (never varies by theme):** geometry (--radius*), type scale
(--fs-*, --lh-*, --fw-*), spacing (--sp-*, --card-pad, --card-gap, --grid-gap,
--row-gap, --title-gap, --chip-pad-*), --label-track, font stacks
(--font-ui/--font-num), all layout, all markup, and musclemap.js geometry
(every path coordinate and stroke width).

**THEME (varies):** surfaces --bg/--surface/--card/--card-2/--border/--hairline;
ink --text/--text-2/--text-muted; --accent/--accent-ink; status --blue/--orange/
--purple/--red/--teal/--yellow/--pink; chart series --s1..--s6; muscle-map
--heat-0..--heat-5 plus --plate and --seam; and the row tints (--accent-tint,
--accent-tint-strong, --red-tint, --blue-tint, --amber-tint).

A theme that touches a universal token is malformed. A theme that omits a theme
token is malformed — the set above is exhaustive and required.

## Semantic roles are binding across every theme

- `--accent` = GO: primary, FAB, active tab, completed set, hit goal. Exactly
  one hue carries this; nothing informational may borrow it (see the badge rule).
- `--orange` = caution / rest / warm-up · `--red` = stop / red-flag / over-limit
- `--blue` = the session is DRIVING this set (must stay unmistakable from
  --accent and --orange on the live session screen, where done / running /
  resting rows sit adjacent — measure on the COMPOSITED row background)
- `--yellow` = personal record · `--purple`/`--teal`/`--pink` = secondary data
- `--s1..--s6` = chart series only; they must sit far from the accent hue so a
  chart line never reads as a GO state.

## COLOUR MUST NOT BE FROZEN IN JAVASCRIPT (the rule this phase exists to enforce)

A value copied into a JS constant cannot follow a theme. Every JS colour
consumer resolves from the CSS custom properties at render time:
`getComputedStyle(document.documentElement).getPropertyValue('--x')`, cached per
render pass and NEVER at module load (the theme changes while the app is open),
with a literal fallback so nothing renders colourless.

Known consumers — all of these must comply:
- `charts.js` — SERIES, SURFACE, GRID, CROSS, GOAL, MUTED, TEXT2, EXTRA
- `views-insights.js` — P4_MUTED, P4_TEXT2, the muscle-balance target bar
- `musclemap.js` — STOPS (heat ramp), BODY (plate), SEAM
- `store.js` — profile identity colours (keyed off --s1..--s6, never the accent)
- `player.js`, `app.js` — inline state tints
Prose must not name a colour ("green bars mean…"): a themed app cannot promise a
hue. Describe the meaning instead.

## Storage and application

`user.settings.theme` = a theme slug; absent ⇒ the default. Rides the settings
object, which mergeSettings already carries through untouched on older clients
(P0 forward-compat clause), so a family member on a stale build keeps their
choice instead of losing it.

Applied as `data-theme="<slug>"` on `document.documentElement`, set on boot and
on every profile switch. The default theme's tokens live in the base `:root` so
an unthemed/unknown slug degrades to a complete, valid palette. Theme blocks are
`:root[data-theme="<slug>"]` overrides containing ONLY theme tokens.

## Shipping themes

`field-issued` (default) · `classic` (the original green identity, preserved for
continuity and repaired) · `slate` · `ember`.

## Validation bar — every theme, no exceptions

1. Chart series: worst-case CIEDE2000 ≥ 9.0 across all 15 pairs under normal,
   protanopia, deuteranopia and tritanopia, derived by constrained search, not
   taste. (For reference: the pre-P5 palette scored 1.9 — two series were
   literally indistinguishable to a tritanope.)
2. Contrast: every body-text pair ≥ 4.5:1 and UI/large ≥ 3:1, measured on the
   ACTUAL composited background including the tinted session rows — not on flat
   token pairs.
3. Heat ramp: --heat-0..5 strictly increasing in L*, and still strictly
   increasing under all three dichromat simulations, so the muscle map reads
   with zero colour vision.

## Mode gate

The theme picker is available to EVERY user, simple mode included — it is a
personal preference, not a performance-mode feature. It changes colour only:
markup, gating and layout stay byte-identical between themes.

## Acceptance tests (binding)

1. Every theme defines exactly the theme-token set; none defines a universal
   token; an unknown slug renders a complete valid palette.
2. Switching profiles switches theme live, with no reload and no stale colour:
   assert rendered chart paints, muscle-map fills and state tints all change.
3. No JS colour constant survives: grep the shipped JS for palette literals and
   assert charts/map/identity colours equal the computed tokens per theme.
4. Per theme: the validation bar above, re-measured on RENDERED nodes.
5. Markup invariance: the DOM outline of every view is byte-identical across all
   themes and unchanged from pre-P5, in both modes.
6. A theme choice survives a sync round-trip through a P1-era client.

# V2 ADDENDUM — P6: AI COACH

User-approved, with two decisions taken verbatim from him:

- **Context:** "Everything." The coach sees the whole log, every request.
- **Powers:** "Propose, I approve, but it allows the optionality to use parts,
  edit, other stuff like that." A proposal is an EDITABLE DRAFT, never a
  yes/no.

And one standing instruction from the phase that requested it: the coach may
ask questions ("how did that feel?"), and its questions must make it smarter
over time rather than evaporating into a chat log.

## The spine of this phase (read this before writing any code)

There is exactly one loop that makes the coach worth its price:

    coach asks a question -> the user answers -> the answer is written to
    coachJournal (source 'checkin') -> the next dossier contains it -> the
    coach is permanently better informed

Every other feature here is in service of that loop. A coach that only replies
to prompts is a chatbot with a gym theme. `coachJournal` is not a nicety, it is
the memory organ, and it already exists (P1) with the exact `source` enum this
needs: `user` | `checkin` | `coach`.

## Non-negotiable: the model has no write path

**The model never writes to the Store.** It has no tools, no function calls
that mutate, and no privileged channel. It returns a proposal object; the app
validates it; the USER commits it. This is not a policy the prompt asks for —
it is the shape of the code, and it is what makes every other safety claim in
this addendum true rather than hopeful.

Consequence worth stating: the dossier necessarily contains user-authored free
text (workout notes, journal entries, custom exercise names). That text is
DATA. Even if something in it is written to look like an instruction, there is
nothing for it to instruct — no write path exists to subvert. The charter says
so as well, but the architecture is what enforces it.

## Guardrails are un-overridable (binding)

**The model proposes. `Guardrails` disposes.**

- Every proposal is run through `Guardrails.checkSession`,
  `Guardrails.weeklyStatus`, `Guardrails.painFlags` and `LoadModel.status`
  TWICE: once before it is rendered, and again at accept time (the log moves
  between those two moments).
- A proposal item that trips a red flag renders with the flag attached and
  **cannot be accepted as-is**. It must be edited under the limit first. There
  is no "accept anyway", no override toggle, no setting that unlocks one.
- No system prompt, no user message, and no model output can weaken this. The
  checks are deterministic functions run on the app side after the response
  has already been received.
- The coach is TOLD about the guardrails so it proposes inside them and can
  explain them, but its compliance is never trusted — it is verified.

Rationale: this app's founding promise is that a first session produces no
scary warnings and an over-reaching session produces a real one, both by rule.
A model that can talk its way past a rule turns every guardrail into a
suggestion.

## The key: on-device only (binding, and the repo is PUBLIC)

Stored at localStorage key **`ironlog/coachKey`** — a separate key, NOT inside
`state`. Three independent reasons, each of which is alone sufficient:

1. `Store.exportJSON()` serialises `state` wholesale — a key inside `state`
   would be written into every backup file the user shares.
2. `Sync` pushes `state` to the family Firebase database — a key inside `state`
   would be readable by every family member and by anyone who obtains the DB
   URL.
3. The repository is public, so nothing key-shaped may ever be committed.

Therefore: never in `state`, never in `settings`, never in a workout, routine,
or journal row, never in a URL, never in a log line, never in a toast, never in
an error string, never in a screenshot, never in a commit. The only two places
the key exists are the Settings field the user typed it into and the
`x-api-key` header of a request to `https://api.anthropic.com`.

- The API origin is **hardcoded**. There is no configurable base URL, so no
  configuration mistake and no injected string can redirect the key elsewhere.
- Displayed masked (`sk-ant-…` + last 4) with a Remove button. `Remove` is the
  full path: clear the key, clear the in-memory copy, clear the thread if the
  user asks.
- "Erase everything" already sweeps every `ironlog*` localStorage key, so the
  key is included in a full wipe. That is intended.
- The key does NOT sync. Each device is keyed separately, on purpose.

## New module: js/coach.js — namespace Coach

Loaded after `applehealth.js`, before `app.js`. Split so the expensive part is
testable without a browser:

- **Pure (node-testable, no DOM, no network, no timers):** `Coach.dossier(...)`,
  `Coach.charter(...)`, `Coach.validateProposal(...)`, `Coach.cost(usage)`,
  `Coach.messagesFor(thread, delta)`.
- **Impure:** `Coach.send(...)` (the single `fetch`), key IO, thread IO.

No SDK. Plain `fetch`, consistent with the zero-dependency rule that has held
since P0.

## Wire format (binding — every item here is a 400 or a silent failure if wrong)

    POST https://api.anthropic.com/v1/messages
    x-api-key: <the user's key>
    anthropic-version: 2023-06-01
    content-type: application/json
    anthropic-dangerous-direct-browser-access: true

That last header is **required, not optional** — verified in Chromium against
the live API, not assumed. Without it the preflight response carries no
`Access-Control-Allow-Origin` and the browser blocks the request before it is
sent; with it the request passes CORS normally. The service worker already
ignores non-GET and cross-origin requests, so it never touches these calls, and
`index.html` ships no CSP that would need a `connect-src` entry — but if one is
ever added, `https://api.anthropic.com` must be in it.

Body rules for `claude-opus-5`:

- `model: 'claude-opus-5'`.
- `thinking: {type: 'adaptive'}`. **`budget_tokens` is REJECTED with a 400 on
  Opus 5** — never send it.
- **Never send `temperature`, `top_p` or `top_k`** (400 on Opus 5).
- **Never use an assistant prefill** (400). Constrain output with
  `output_config: {format: {type: 'json_schema', schema}}` instead.
- Stream whenever `max_tokens` exceeds ~16000, to avoid request timeouts.
- **Check `stop_reason === 'refusal'` BEFORE reading `content`.** Reading
  content first on a refusal is how you ship a crash.
- 401 -> "that key was rejected", link to Settings. 429/529 -> exponential
  backoff with a visible retry, never a silent hang. Any error surfaces
  `error.type` plainly; no error message may ever interpolate the key.

## Context: "Everything", and how it stays affordable

The dossier is large by design. Prompt caching is what makes sending it on
every message sane rather than ruinous, and caching is prefix-matched, so the
cached block must be **byte-stable**.

    system: [
      { type: 'text', text: <charter> },
      { type: 'text', text: <DOSSIER>, cache_control: {type:'ephemeral', ttl:'1h'} }
    ]
    messages: [ ...settled turns (2nd breakpoint on the last one)...,
                { role:'user', content: <volatile delta + the new message> } ]

Binding consequences:

- The dossier is built ONCE and reused verbatim until the underlying data
  actually changes (a workout saved, a journal entry added, a profile switch).
  Rebuilding it per message changes bytes, misses the cache, and pays full
  price for the whole log every single turn.
- **Nothing volatile may appear inside a cached block.** No `Date.now()`, no
  "3 days ago" phrasing, no floating-point that drifts, no unordered object
  iteration. Serialise deterministically: fixed key order, rows sorted by date
  then id, numbers rounded to fixed precision. Today's date, the live draft and
  the just-logged set live AFTER the last breakpoint.
- One breakpoint covers charter + dossier together. Opus 5 requires a minimum
  512-token cacheable prefix, and the charter alone may fall under it; the
  combined block never will. Max 4 breakpoints exist; this design uses 2.
- **Verify, do not assume:** assert `usage.cache_read_input_tokens > 0` on the
  second and subsequent requests of a session. A caching bug is invisible
  except on the bill, so it must be asserted in tests and surfaced in the UI.

### What the dossier contains

Strictly ONE user's data (the current profile). Family rows never enter it —
the leaderboard contributes at most a name-and-rank line, never another
person's notes.

- Profile: name, mode, units, goal preset, selection date and
  `Protocols.phaseFor` phase, body metrics series.
- Every workout: date, kind, duration, RPE, notes, and full set detail for
  every entry type (`lift`, `setwork`, `cardio`, circuit, interval) using the
  P3 field names — **`exerciseRef`, and sets that never carry a `type` key**.
- Every pain-log row, every `coachJournal` row (all three sources), the health
  sample summary, the user's routines and templates.
- Derived state computed by the app's OWN deterministic engines and included
  verbatim, so the coach reasons from the same numbers the app displays and
  cannot arrive at a different answer: `Analytics.prs / streaks /
  muscleWeeklySets / muscleRecovery / consistency`, `LoadModel.status / acwr /
  greenWeek / restingHR / ruckEconomy`, `Guardrails.weeklyStatus / painFlags`,
  `Protocols.trainingBest / currentBest / tiersFor / readiness`.

**Truncation must be declared, never silent.** Full detail covers the recent
window; older training is included as weekly rollups; PRs, pain and journal
rows are included in full at any age because they are small and load-bearing.
The dossier states its own boundary in-band ("full detail from <date>; earlier
weeks are rolled up") so the coach knows what it cannot see instead of
confabulating over the gap.

## Proposals: an editable draft, never a yes/no

Returned as validated structured output via `output_config.format`. The schema
mirrors the shape the P4.5 builder already consumes — same field names, same
units, same forbidden names.

The proposal card renders as a working document:

- **Per item: accept / skip.**
- **Every number is editable inline before accepting** — sets, reps, weight,
  hold seconds, distance, rest, intensity.
- **Accept selected** seeds the existing `ironlog/activeWorkout` draft through
  the same path `Player.start` uses. A coach-proposed session is structurally
  byte-identical to a hand-built one. **P6 introduces no second session
  concept** — P4.5's one-live-session rule holds without exception.
- **Save as routine** writes to `routines`.
- **Reject** writes nothing; the proposal remains in the thread as history.
- Nothing is ever auto-applied. There is no mode in which the coach logs
  anything on the user's behalf.

Validation before render: every `exerciseRef` is resolved against
`ExerciseDB`. An unresolvable reference becomes an editable free-text row with
a visible "not in your library" marker — never silently dropped, never
silently accepted.

## New collection: coachChats (shim-protected)

Added to `COLLECTIONS` and `DELETED_KEYS` with standard tombstones. Rows are
`userId`-scoped like everything else, so the thread follows the user across
devices, and P1–P5 clients preserve it untouched via the P0 forward-compat
clause.

Bounded on purpose: `state` is one localStorage blob pushed wholesale on sync,
so an unbounded chat log would bloat every sync for every family member. Keep a
capped recent window per user and roll older turns off. The dossier is NEVER
stored — it is derived.

## Check-ins

After a session is saved the coach may hold ONE queued question. Answering it
writes a `coachJournal` row with `source: 'checkin'`. Declining costs nothing
and is never nagged. The structured schema carries an explicit optional
`question` field so a question is machine-detectable rather than regex-scraped
out of prose.

## Cost is the user's money, so it is shown

Every response's `usage` is recorded. The view shows the running session cost
from the published Opus 5 rates ($5 / $25 per MTok, cache reads at 0.1x),
labelled an estimate with an "as of" date, alongside how much caching saved.
A user paying per token is entitled to see the meter.

## Mode gate and empty states

The Coach view is visible when **performance mode is on AND a key is set**, via
a `visible()` predicate.

The mode half of that is a deliberate reversal of the first draft of this
section, which put the coach in both modes on the grounds that a family member
might want coaching without wanting ACWR. The reasoning was fine and the
engineering was not: the coach's central act is "propose a session, then run
it", and the guided player it hands off to (`Player.start`) is performance-mode
only. A simple-mode coach would be a coach that cannot do the main thing, bought
at the price of a second accept path, a second charter, and a fresh chance to
leak performance surfaces into simple mode — a bug this project has already
shipped once. Performance mode is one toggle, and it is already the documented
way every other intelligence surface unlocks.

With no key, Settings explains what the coach does, what it costs, and where to
get a key. Offline, the view renders the thread and queues the message. Neither
state is ever a broken screen.

## Acceptance tests (binding)

1. The key never leaves the device except as an `x-api-key` header to the
   hardcoded API origin: assert it is absent from `Store.exportJSON()`, from
   the sync payload, from `state` in localStorage, and from every rendered
   node; grep the repo for key-shaped strings in CI.
2. `stop_reason === 'refusal'` is handled before `content` is read; a refusal
   renders a message, not an exception.
3. Prompt caching works: on the second request of a session,
   `usage.cache_read_input_tokens > 0`, and the dossier bytes are identical to
   the first request's given unchanged data.
4. The dossier is deterministic: building it twice over the same state yields
   byte-identical output, and it contains no timestamp, relative date or
   unordered iteration.
5. A guardrail-tripping proposal cannot be accepted whole through any UI path,
   including "accept all"; editing it under the limit unblocks it.
6. The model has no write path: with a stubbed transport returning an
   adversarial response — including one whose text instructs the app to save
   workouts, disable guardrails or reveal the key — the Store is unchanged and
   the key is not read.
7. Partial acceptance works: accepting 2 of 5 items with one edited number
   seeds a draft containing exactly those 2 items with the edited value.
8. An accepted proposal produces a draft structurally indistinguishable from a
   hand-built one; no second session record is created and no `_`-prefixed key
   is persisted.
9. A coach question answered writes exactly one `coachJournal` row with
   `source: 'checkin'`, and that row appears in the next dossier.
10. No key, offline, 401, 429 and refusal each render a specific, actionable
    state; none renders a blank screen, a hang, or a message containing the
    key.
11. Family safety: with no key set, every view's DOM outline is unchanged from
    P5 in both modes, and a P6 `coachChats` collection survives a sync
    round-trip through a P1-era client.

## Release

New files `js/coach.js` and `js/views-coach.js` must be added to `index.html`
in load order AND to the `SHELL` array in `sw.js`, and `CACHE_NAME` bumped —
otherwise installed PWAs serve the pre-coach app forever.
