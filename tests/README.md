# IronLog test suites

Every one of these was written against a real defect or a binding rule in
`gym/ARCHITECTURE.md`. They live here rather than in a scratch directory
because a test that only runs on the machine that wrote it is a test nobody
will ever run again.

```bash
./run.sh          # everything
./run.sh node     # fast, no browser needed
./run.sh p6       # anything matching "p6"
```

Node-only suites need nothing. Browser suites need Playwright
(`npm i -g playwright`); the browsers themselves are pre-installed in the dev
container at `/opt/pw-browsers` and `lib/paths.js` finds them.

## What each one defends

| Suite | Defends |
|---|---|
| `gtest.js`, `gtest2.js`, `guardrails.test.js` | The injury rules: ruck double-increases, run ramp, easy/hard split, deep-stretch limits, and the pain-flag escalation ladder. |
| `test-store.js` | Persistence, the merge, tombstones, and the read-time invariants that let a mixed-version family fleet sync safely. |
| `test-session-core.js` | The live-session engine, merged against **P1-era copies** of `util.js` and `store.js` kept in `fixtures/` — the point is to test against code that no longer exists in HEAD. |
| `p3-setwork-e2e.js` | Structured set work: holds, carries, stretches, `exerciseRef`, and sets that must never carry a `type` key. |
| `p35-player-e2e.js`, `p45-session-e2e.js` | The guided player and the one-live-session rule, including that an untouched prescription is never recorded as work performed. |
| `p4-surfaces-e2e.js`, `insights-v2-smoke.js` | Load model, recovery and the insight surfaces. |
| `p5-theme-e2e.js`, `chart-paint-audit.js` | Themes, and the rule that **no colour is ever frozen in JavaScript** — charts and the muscle map must resolve from CSS custom properties at render time. |
| `p6-coach-core.js` | The coach's pure half: dossier determinism, the truncation boundary, the request shape (no `budget_tokens`, no sampling params), and that the API key cannot reach a backup, the sync, or the request body. |
| `p6-coach-e2e.js` | The coach in a browser with the network stubbed: the mode gate, partial acceptance with edits, guardrail blocking, the check-in → journal loop, and that an adversarial reply cannot write anything. |
| `p6-stream-e2e.js`, `coach-stream-fuzz.js` | Streaming: that text arrives progressively, and that the SSE parser survives 1-byte chunks, multi-byte characters split across chunks, keep-alive comments, mid-stream errors, junk lines and truncation. |
| `p6-fleet-safety.js` | That a P5 client round-trips `coachChats` and its tombstones without destroying them — run against the **real P5 store from git**, not a mock. |
| `sw-update-e2e.js` | The update prompt, driven through a real service-worker lifecycle: install, deploy, offer, dismiss, re-offer, accept, and no reload loop. |
| `nav-reachability.js` | That every view is reachable on a phone without knowing a URL. Written after the theme picker was reported "missing" — it wasn't, Settings was. |
| `cold-start.js` | That a brand-new install with no profile and no workouts renders every view. The state least exercised in development, because the demo seed hides it. |
| `import-fuzz.js` | 19 hostile backup files — truncated, wrong app, prototype pollution — none of which may throw or destroy the existing log. |
| `quota-silence.js` | That a full `localStorage` is **announced**. It used to be swallowed: the workout appeared on screen, never reached disk, and closing the app lost it. |
| `p45-shell-crawl.js` | Release wiring: every shipped file is in the service worker's `SHELL`, the load order is intact, and `CACHE_NAME` moved. |

## Writing more

Two habits earned the hard way in this codebase:

**Assert values, never that nothing threw.** A module once imported `U` from the
wrong global; every date call silently returned a fallback and 63 assertions
passed over dead code. If a helper is pure and total, do not wrap it in a
`try` — let it crash.

**Mutation-check anything important.** Reintroduce the bug and confirm the test
fails. Several tests here passed happily against the very defect they were
written to catch until that step was done — including one that agreed with a
phantom-write bug rather than the contract.
