# IronLog 🏋️ — Family Gym Tracker

A complete, multi-user gym logging web app for you and your family — a cross between
**Fitbod** (fast logging, muscle recovery, templates), **Apple Health** (rings,
trends, body metrics), and **ExRx.net** (a 250+ exercise encyclopedia).

Pure static HTML/CSS/JS. No accounts, no server, no build step, no dependencies.
Works offline once loaded (PWA) and installs to your home screen.

## Screenshots

| Dashboard | Workout logging | Analytics |
|---|---|---|
| ![Dashboard](screenshots/dashboard.png) | ![Logging](screenshots/logging.png) | ![Analytics](screenshots/analytics.png) |

| Family leaderboard | Exercise library | On mobile |
|---|---|---|
| ![Family](screenshots/family.png) | ![Exercise detail](screenshots/exercise-detail.png) | ![Mobile](screenshots/mobile-dashboard.png) |

## Features

- 👥 **Profiles** — unlimited family members, each with their own units (lb/kg),
  goals, and identity color. One-tap switching. Friendly weekly leaderboard.
- 🏋️ **Logging** — fast set/rep/weight entry with previous-performance hints,
  warmup sets, RPE, auto rest timer, plate calculator, templates, notes, full
  editable history.
- 📖 **Exercise library** — 250+ exercises with muscles, equipment, instructions
  and coaching tips, searchable and filterable; add your own custom exercises.
- 📊 **Analytics** — estimated 1RM progression, automatic PR detection, weekly
  volume and per-muscle set counts vs. targets, an interactive front/back muscle
  heatmap, training calendar, streaks, rep-range split, muscle recovery status and
  suggested next workout, body weight/body-fat trends.
- 🍎 **Apple Health** — import your `export.zip` right in the browser (body
  weight, resting heart rate, steps, active energy, exercise minutes, VO₂max,
  sleep, workouts). Export your lifting history as CSV, full data as JSON backup.
- ☁️ **Optional family sync** — paste a free Firebase Realtime Database URL in
  Settings and everyone's data merges across devices automatically.

## Run it

It's a static site — any web server works:

```bash
cd gym
python3 -m http.server 8000
# open http://localhost:8000
```

### Deploy on GitHub Pages

This repo already serves GitHub Pages. Once this branch is merged, the app is live at:

```
https://<your-pages-domain>/gym/
```

Then on each phone: open the URL in Safari/Chrome → Share → **Add to Home Screen**.
It launches full-screen like a native app and works offline.

## Where your data lives

All data is stored **on the device, in the browser** (localStorage). Nothing is
uploaded anywhere unless you enable sync. Two ways to share between devices:

1. **Backup files** — Settings → Data → Export backup, send the file, Import on the
   other device (choose *Merge*).
2. **Family sync (recommended)** — see below. Everyone sees everyone's workouts,
   the leaderboard works across devices, and each person keeps editing under their
   own profile.

> Tip: don't clear the browser's site data for the app's domain without exporting
> a backup first — that's where your log lives.

## Family sync setup (free, ~5 minutes, one person does it once)

1. Go to <https://console.firebase.google.com> → **Add project** (any name, no
   Analytics needed).
2. In the left menu: **Build → Realtime Database → Create database** → pick a
   location → start in **test mode**.
3. Copy the database URL, e.g. `https://yourname-default-rtdb.firebaseio.com`.
4. Add a long random path segment to keep the data private, e.g.
   `https://yourname-default-rtdb.firebaseio.com/ironlog-k92hf83hf`.
5. In IronLog: **Settings → Family Sync** → paste that URL → Enable → Sync now.
6. Send the same URL to your family; they paste it on their devices. Done.

*Note: test-mode rules mean anyone who knows the exact URL can read/write it —
the long random segment is the secret. For a small family log that's a reasonable
trade; rotate the segment if it ever leaks (change the path and re-sync).*

## Apple Health

**Import:** iPhone → Health app → your profile picture (top right) → **Export All
Health Data** → wait, then AirDrop/save the `export.zip` → in IronLog: Settings →
Apple Health → Import → pick the zip. The app parses it locally in your browser —
nothing is uploaded — and previews what it found before adding anything.

**What imports:** body weight & body fat (into Body trends), daily steps, resting
heart rate, active energy, exercise minutes, VO₂max, sleep; strength-type Apple
workouts appear in your history on days you didn't log manually.

**Export:** Settings → Apple Health → Export CSV (one row per set), or a full JSON
backup of everything.

*Live HealthKit sync isn't possible for any pure web app — Apple only exposes it
to native iOS apps. The export/import loop above is the standard approach.*

## Tech notes

- Plain script modules on `window` (`Store`, `Analytics`, `Charts`, `ExerciseDB`,
  `MuscleMap`, `AppleHealth`, `Sync`, `App`) — see `ARCHITECTURE.md`.
- All weights stored in kg internally; converted at the UI per user's units.
- Hand-rolled responsive SVG charts (validated colorblind-safe series palette).
- Apple Health zip is unpacked in-browser (tiny ZIP reader + `DecompressionStream`);
  the XML is stream-parsed so 100 MB+ exports don't crash the tab.
- Service worker caches the app shell for offline use.
