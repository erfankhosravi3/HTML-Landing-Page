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
