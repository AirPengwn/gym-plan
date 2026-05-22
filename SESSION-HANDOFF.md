# MyFit (gym-plan) — Session Handoff

**App version:** v2.80 · **Date:** 2026-05-22 · **Single file:** `index.html` (~454KB,
inline CSS/JS, no build step) → deployed to GitHub Pages → used on iPhone home screen.

This is a personal, single-user workout tracker. **Data safety is paramount** — never risk
losing logged history. The user handles **all** git commits/pushes himself; never run git.

---

## Current state (all green)

- Feature-complete for everything requested. All **15 test suites pass** (see `tests/`).
- Live JSONbin cloud verified **clean**: 23/23 set-bearing entries have `.sets`; 0 doubled
  units; 0 labeled/combined entries; 0 duplicate sessions.
- Last **real** workout data = **May 16**. Anything dated after that is invalid/test noise.

## What was built this session (v2.18 → v2.80)

1. **Design refresh** — Progress page rebuilt (Sessions/Lifts/Trends tabs, Now/Trends/Awards
   zones, deload zone, cross-day timeline; Manage moved to header 📋). Patches 3/4/5
   (delta pills, zone titles, v2 checkbox→button; backup-modal Copy + Select-All + iOS-zoom
   fix; **structured session entries** `.sets [{w,u,r}]` added alongside the kept-forever
   `.note` string, one-shot migration).
2. **Data-integrity fixes** — the big one: `cloudPUT` was sending `X-Bin-Versioning: true`,
   which the JSONbin free tier rejects with a **403**, so cloud writes silently failed.
   Removed the header (v2.72) + surface error bodies in toasts. Also fixed "lbs lbs"
   double-unit, added Repair/Split/Dedupe/Pull-from-cloud tools to the backup modal.
3. **Primary/Reader device mode** (default reader) — only the primary device writes to cloud;
   readers' writes are silent no-ops. Prevents a stray device clobbering cloud history.
4. **Adjustable day cycle** (headline feature) — `DAYS_CONFIG` (`days_config_v1`) is the single
   source of truth. Add/rename/reorder/remove(archive)/restore days. **Removing a day archives
   it** — never deletes `gymlog_<key>` — so shrinking to 3 days then expanding to 6 preserves
   every exercise's metrics/last-session/charts (history is keyed by `histEx`, not by day).
5. **2-step plan/day cloud sync** (v2.80) — plan/day edits are **LOCAL by default and never
   auto-push**. A switch (Local only / Cloud enabled) + a "Push plan now" button. The push is
   **surgical**: it GETs cloud, overlays only `plan_v2` + `days_config_v1`, and PUTs — so all
   cloud session history is preserved. Works from any device, including a reader PC.

## Pending / not done

- **OWNER-ONLY:** a real-device end-to-end gym pass with **Test Mode OFF** on the iPhone to
  prove save→sync→reload→history with live data on the new day-cycle build. Do this before
  relying on it daily.
- Deferred niceties (only if asked): multi-day cardio proper support; deload "mode" that scales
  shown targets; "Reset plan to original" undo; retire `EXERCISE_REGISTRY` cat/mins duplication.

---

## Running the tests

```
cd tests
npm install jsdom        # once
```

Then run the full suite (PowerShell or bash) — every harness should print PASS. See
**`tests/README.md`** for the exact run loop and what each harness gates. The primary safety
gate is **`verify.js`** (byte-identity: `EXERCISE_DATA` render must match `index.html.bak`).

Key suites: `verify`, `funcsmoke`, `verif_s1`, `buildcard`, `heatcheck`, `msvgcheck`,
`patch3_spot`, `patch4_spot`, `patch5_*` (spot/lossless/health/repair/split/dedupe/pull/
primary/prefill), `dayconfig_spot`, `daymgr_spot`, `plansync_spot`.

> Harnesses hardcode the absolute path to `index.html`. If the project moves, update the path
> at the top of each file.

## Backups / rollback

- `backups/v2.73-2026-05-21/` — `index-v2.73.html` (code), `jsonbin-cloud-backup.json`
  (verified-clean cloud snapshot), `RESTORE-INSTRUCTIONS.md`.
- `index.html.bak` / `index.prerefactor.html` — byte-identity baseline (never modify).

## Do-not-touch (hard constraints)

- Muscle map (`buildMuscleMapSVG`/`buildMuscleHeatMapSVG`/`MM_*`/`MUSCLE_GROUPS`/
  `DEFAULT_MUSCLES`/`dayMusclesFor`/`computeWeeklyMuscleLoad`).
- The pipe-delimited `.note` session format — **keep forever** (Patch 5 added `.sets`
  alongside it; did not replace it).
- localStorage key shapes; JSONbin merge/dedupe/sync logic; Test Mode state machine.
- Identity keys: `histEx` / `linkId` / `domId` / `data-ex` / `sessKey` / `sessTs`.
- `parseSetWeights` / `parseSetWR` / `bestEst1RM`.
- The hardcoded JSONbin master key is **intentional** ("only i use this app") — do not flag it.

## Workflow

- Plan-mode for any model/schema/data change. Bump the version badge each shippable change.
- Keep changes additive; run the regression suite (byte-identity primary) after each change.
- Flag interpretation forks; default to layout-only / preserve-current-shape when ambiguous.
- **User handles all git. Never run git.**

## Git reminder (for the user)

Commit at v2.80: `index.html`, the new `tests/` folder, `backups/`, `SESSION-HANDOFF.md`,
then push to GitHub Pages.
