# Test harnesses — gym-plan

jsdom-based regression + spot-check suites for `index.html`. Each is a standalone
Node script that loads the live `index.html`, runs functions in a jsdom window
(with a mocked localStorage/sessionStorage and `fetch` stubbed out), and asserts.

## Setup (once)

```
cd tests
npm init -y
npm install jsdom
```

(The harnesses read `index.html` via an absolute path:
`C:\Users\airpe\OneDrive\Desktop\gym-plan-main\index.html`. If the project moves,
update that path at the top of each file.)

## Run the full suite

```
cd tests
for t in verify funcsmoke verif_s1 buildcard heatcheck msvgcheck \
         dayconfig_spot daymgr_spot plansync_spot newday_add_spot \
         balanced_rows_spot remove_perday_spot library_spot durability_spot \
         sw_spot cloudarchive_spot finalize_spot sessgroup_spot \
         patch3_spot patch4_spot \
         patch5_spot patch5_lossless patch5_health patch5_repair \
         patch5_split patch5_dedupe patch5_pull patch5_primary patch5_prefill; do
  printf "%-18s " "$t:"; node $t.js >/dev/null 2>&1 && echo PASS || echo FAIL
done
```

All should print PASS at v3.38. (Note: `sw.js` ships alongside `index.html` from v3.7 — commit both.)
`metadata_spot.js` (v3.14) checks the richer exercise metadata: catalog entries carry
equipment/pattern/difficulty/alternatives, fields persist onto plan records + the user
library, and `exerciseMeta()` resolves them.
`balance_spot.js` (v3.25, Phase D) checks `DEFAULT_META` (built-in plan exercises now carry a
pattern/equipment so `exerciseMeta` resolves the whole plan), `_balanceGroup` bucketing
(push/pull/lower/core; cardio+mobility excluded), and the read-only `analyzePlanBalance()` +
`renderPlanBalance()` "Plan balance" card on the Manage screen (push:pull, upper:lower,
untrained-muscle alerts). The analysis never writes/syncs.
`dupscan.js` is the exercise-name near-duplicate analyzer: it hard-fails on an EXACT
normalized duplicate *within* `EXERCISE_CATALOG`, and prints advisory near-dup pairs
(catalog↔built-in and within-catalog) so new breadth batches don't add redundant
"same movement, different name" entries. Run `node dupscan.js` before adding a batch.

**CI / one-command run (v3.13):** `cd tests && npm ci && npm test` runs every CI-safe suite
via `run-all.js` (exits non-zero on any failure). A GitHub Action
(`.github/workflows/test.yml`) runs this on every push/PR to `main`. Test paths are now
`__dirname`-relative, so the suite runs anywhere (incl. the Linux CI runner).

## What each gates

**Core regression (must always pass):**
- `verify.js` — **byte-identity**: the 5 default days' rendered items match `index.html.bak`. The safety gate for the data-driven refactor. data-ex multiset preserved.
- `funcsmoke.js` — 151 functional checks (cards, dark mode, header cluster, ghost values, RPE, etc.).
- `verif_s1.js` — VERIFICATION.md §1 universal regression, 10 manual steps automated.
- `buildcard.js` — `buildCardHTML_v2` strength/notes rendering.
- `heatcheck.js` / `msvgcheck.js` — muscle map + weekly heat map (Do-Not-Touch surface). v3.37: also gates the **interactive muscle chips** below the heat map — `_muscleLoadChipsHTML` renders tappable per-muscle chips (colored by load), and `muscleDrill(key)` shows a read-only drill-in (current load, last-trained date + exercise, plan exercises that hit it). The heat-map SVG itself is unchanged; `_muscleExercises()` is read-only.

**Feature spot-checks:**
- `templates_spot.js` — v3.28 plan templates: built-in programs (PPL/Upper-Lower/Full-Body/Bro) + user-saved custom templates (`plan_templates_v1`). Every template exercise resolves to a pattern + muscles; `applyTemplate('append')` adds days alongside, `applyTemplate('replace')` archives current days (logged history preserved) and installs the program; custom save/delete (soft tombstone) + LWW merge; rides the sync payload; modal renders.
- `toast_spot.js` — v3.27 `showToast(msg, opts)`: plain auto-dismiss by default, optional longer duration, and a `{sticky:true}` toast that stays until the ✕ is tapped (used for the sync-result messages so "synced ✓" / "sync failed" can't vanish too fast).
- `progression_spot.js` — v3.36 characterization lock for the auto-progression engine: `getOverloadSuggestion()` (double-progression — hit-target→+5lbs, below-target→build-to, RPE9→hold, no-reps flat-weight→ready) and `getDeloadAdvice()` (stall + high-effort / systemic). Asserts both are **read-only** (never write gymlog) and that `loadLastTimes()` injects the `.overload-nudge` on the workout card.
- `consistency_spot.js` — v3.38 characterization lock for the consistency viz: `computeStats()` streak/cadence math (total, current streak, longest streak, days-since-last, avg-between) + `renderActivityHeatmap()` 13-week calendar. Read-only. Also guards the v3.38 fix making `longestStreak` sort day-keys chronologically (lexical sort had under-counted streaks straddling single→double-digit dates).
- `dayedit_spot.js` — v3.34 editable day button-label: the "D1" chip text is a per-day `short` setting (independent of the name), set on create + editable in the add/rename modal (`openDayEdit`/`saveDayEdit`/`editDayMeta`/`setDayLabel`), shown in the selector chips, capped at 6 chars, persisted in synced `days_config_v1`.
- `patch3_spot.js` — delta pills + PB variant + zone titles + v2-card checkbox.
- `patch4_spot.js` — backup-modal Copy/Select-All, test-mode theming.
- `patch5_*.js` — structured session entries + migration + Repair/Split/Dedupe + Pull-from-cloud + Primary/Reader mode + pre-fill fix. (`patch5_lossless` is the hard "no metric changes" canary.)
- `dayconfig_spot.js` — DAYS_CONFIG helpers + sync round-trip (Phase 0).
- `daymgr_spot.js` — add/rename/reorder/remove(archive)/restore day lifecycle + history persistence (Phase B.3).
- `plansync_spot.js` — 2-step local-default plan/day cloud sync, surgical push (Phase B / v2.80).
- `newday_add_spot.js` — adding an exercise to a brand-new day (never in the base model, never archived/restored) doesn't crash and actually lands/renders (v3.0 `_orderArr` fix).
- `balanced_rows_spot.js` — `_balancedCols` math + day-selector/stat-box/filter-chip strips lay out as balanced wrapped rows (5→3+2 etc.) instead of a horizontal scroll (v3.2); also the Plan-as-its-own-screen nav (v3.3): 📋 hides the Progress chrome + highlights, 📊 restores it and lands on Sessions.
- `remove_perday_spot.js` — per-day Remove takes an exercise off ONE day only (other days + history intact), defaults don't resurrect (presence-based order), last-day removal keeps it in the library (v3.2).
- `durability_spot.js` — v3.6 safety net: on-device snapshots rotate (keep `SNAP_KEEP`), restore re-applies a snapshot, snapshots skip in Test Mode, and the sync-status banner tracks pending/last-sync-ok.
- `sw_spot.js` — v3.7 service worker (`sw.js`): parses, network-first for HTML, never touches non-GET or cross-origin (JSONbin/YouTube), versioned cache, and `index.html` registers it with a relative path.
- `cloudarchive_spot.js` — v3.8 cloud rollback: archive bin id rides the payload + is discovered from the live bin during merge; reader devices and Test Mode never write the archive. v3.26: self-healing `loadCloudArchive` — a stale/unreadable local bin id (the iPhone "load failed") is dropped and re-resolved from the live cloud; missing archive → clear soft message; cloud unreachable → honest reassuring error.
- `finalize_spot.js` — v3.9: confirm-on-Reset only nags when there's real in-progress work; installable-PWA meta present; `getAllExercises` is memoized and self-invalidates on data change.
- `sessgroup_spot.js` — v3.10 saved-session display grouping (display only): strength sets stay inline + their `-notes` fold under the exercise; cardio's per-field entries collapse under one clean, named `<details>` header (`_humanizeCardioBase`); no raw `data-ex` keys leak.
- `library_spot.js` — `getExerciseLibrary` surfaces defaults + history-only + archived; `planAddExisting` re-adds by existing `histEx` (history preserved) and links across days; no duplicates (v3.2). Also the v3.4 seed `EXERCISE_CATALOG` (17 library-only exercises): all show in the library, none auto-scheduled, and adding one carries its category/cues/badge/muscles/video. And the v3.5 user library (`exercise_library_v1`): Save-to-library persists with no day, appears as `fromUser`, add-to-day carries fields, delete soft-tombstones, `_mergeLibraries` is last-write-wins per name (adds/edits/deletes converge across devices), and it rides the sync/backup payload.

**Live cloud utilities (hit the real JSONbin — use deliberately):**
- `review_live.js` — fetch + focused health review (Pec fly/Rear delt + summary). No writes.
- `backup_cloud.js` — write cloud snapshot to `backups/.../jsonbin-cloud-backup.json`.
- `probe_put.js` — endpoint health (GET + no-op PUT).
- `restore_cloud.js` — one-shot surgical cloud fix (specific to a past incident; read before reuse).
- `find_stragglers.js` — list set-bearing entries missing `.sets`.

**Build helpers (from the original Phase-1 refactor):** `harness.js`, `exdata.gen.js`, `integrate.js`.

## Note on the byte-identity gate

`verify.js` hardcodes `days = ['a','b','c','d','e']` and the default `counts`. It checks
that `EXERCISE_DATA` + the static `#items-a..e` placeholders render identical to
`index.html.bak`. The adjustable-day-cycle work (Phase 0/A/B) deliberately kept the 5
static panels + `EXERCISE_DATA` intact so this gate stays meaningful. Dynamic day
behavior is covered by `dayconfig_spot` / `daymgr_spot` / `plansync_spot` instead.
