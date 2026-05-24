# MyFit (gym-plan) — Session Handoff

**App version:** v3.9 · **Updated:** 2026-05-23 · **Files:** `index.html` (~490KB, inline
CSS/JS, no build step) **+ `sw.js`** (service worker, new in v3.7) → deployed to GitHub
Pages → used on iPhone home screen.

Personal, single-user workout tracker. **Data safety is paramount** — never risk losing
logged history. The user handles **all** git commits/pushes himself; **never run git.**

> **Deploy note:** as of v3.7 the app is **two files** — commit BOTH `index.html` and
> `sw.js` (at the repo root, same directory). If `sw.js` isn't deployed, the SW just
> fails to register (harmless — no offline), but you lose the offline/update benefits.

---

## Current state (all green)

- **28 test suites pass** (see `tests/` + `tests/README.md`). Primary gate = `verify.js`
  (byte-identity of the unedited stock plan vs `index.html.bak`).
- Last **real** workout data = **May 16, 2026**. Anything later is test noise.
- Owner-only pending: a real-device end-to-end gym pass with **Test Mode OFF** on the
  iPhone (save→sync→reload→history), and confirm the **service worker installs** + the
  app loads **offline** + add-to-home-screen opens **standalone**.

## What this build does (v2.80 → v3.9, this session)

**UX / navigation**
- Balanced-row layout (`_balancedCols`/`_applyBalancedRows`): day tabs, Progress filter
  chips, and stat boxes wrap into centered rows (5→3+2, 6→3+3, …) instead of a horizontal
  scrollbar. Day tabs restyled as distinct bordered buttons.
- **Plan is its own screen**: the header 📋 opens Manage with the Progress stat boxes +
  Sessions/Lifts/Trends tab row hidden, and 📋/📊 light up to show where you are. 📊 always
  returns to a data tab (never strands you on Manage). Logic lives in `switchProgTab`/`sw`.

**Plan / exercises**
- `_orderArr` + `getEffectivePlan` are presence-based (v3.0/v3.2): adding to a brand-new
  day no longer crashes, and an emptied day stays empty (no resurrecting defaults).
- **Per-day Remove** (`planRemoveFromDay`) replaced the global Archive: removes an exercise
  from ONE day only; history kept; removed-from-last-day → stays in the library. Manage row
  buttons are now **Edit · Remove**. (Archive plumbing kept for Swap + legacy data.)
- **Exercise library** (`getExerciseLibrary`): every distinct exercise (active days, removed
  days, history, archived, seed catalog, user library) — searchable in the builder's
  **📚 From library** tab. `planAddExisting` re-adds by existing `histEx` (history preserved)
  and links across days via shared `linkId`.
- **Seed catalog** (`EXERCISE_CATALOG`, v3.4): 17 hardcoded library-only exercises. Read-only
  seed; ask the user before editing it. Adding one carries cat/sub/loc/video/badge/muscles
  (muscle keys map to `MUSCLE_GROUPS`).
- **User library** (`exercise_library_v1`, v3.5): builder **📚 Save to library** stores an
  exercise WITHOUT a day. Soft-delete (tombstone + `updatedAt`) so deletes sync. Merged
  last-write-wins per name (`_mergeLibraries`).

**Durability / pre-production hardening (v3.6–v3.9)**
- `navigator.storage.persist()` on boot (anti-eviction).
- **On-device snapshots** (`gymlog_snapshots_v1`, keep 7): full payload saved after each
  completed session; restore via Backup → 📸 On-device snapshots. Skipped in Test Mode.
- **Sync status banner** (`#sync-banner`): shown only when `gymlog_sync_pending` is set;
  `gymlog_last_sync_ok` stamped on success.
- **Service worker** (`sw.js`): network-first for HTML (fresh when online, cached offline),
  passes through non-GET + cross-origin (JSONbin/YouTube untouched), versioned cache.
- **Cloud archive** (v3.8): separate auto-created JSONbin bin (`__archive_bin`, discovered
  via the live bin), rolling ~daily snapshots (last 14), **primary-only**, best-effort.
  Restore via Backup → ☁️ Cloud archive → Load cloud archive.
- **Confirm-on-Reset** (`confirmReset`): the manual per-day Reset now confirms when there's
  real in-progress work (post-save still calls `rst()` directly).
- **Installable PWA meta** + memoized history scans (`getAllExercises`/`buildGlobalRepMap`
  via `_gymlogSig`, self-invalidating).

## Sync model (important)

- **Logged history (`gymlog_*`)**: only the **primary device** (iPhone) writes to cloud
  (`cloudPUT` reader-gated). Union merge never shrinks the cloud.
- **Plan / days / library**: push from **any device** via "Push plan now"
  (`pushPlanToCloud`, ungated `_rawCloudPUT`). Library merges last-write-wins.
- **Cloud archive**: primary-only, ~daily, separate bin.
- The "Cloud enabled" switch + "Push plan now" button live in the Plan screen.

## Running the tests

```
cd tests && npm install jsdom    # once
```
Then run every harness (see `tests/README.md` for the exact loop) — all print PASS at v3.9.
Harnesses hardcode the absolute path to `index.html`; update it if the project moves.

## Backups / rollback (now 4 layers)

1. On-device snapshots (auto, last 7) — Backup modal.
2. Live JSONbin bin (union merge, never shrinks).
3. Cloud archive bin (rolling ~daily × 14) — Backup modal "Load cloud archive".
4. Manual Backup code / CSV + `backups/v2.73-2026-05-21/` + `index.html.bak` (byte baseline).

## Do-not-touch (hard constraints)

- Muscle map (`buildMuscleMapSVG`/`buildMuscleHeatMapSVG`/`MM_*`/`MUSCLE_GROUPS`/
  `DEFAULT_MUSCLES`/`dayMusclesFor`/`computeWeeklyMuscleLoad`).
- Pipe-delimited `.note` session format — **keep forever** (`.sets` added alongside it).
- localStorage key shapes; JSONbin merge/dedupe/sync logic; Test Mode state machine.
- Identity keys: `histEx` / `linkId` / `domId` / `data-ex` / `sessKey` / `sessTs`.
- `parseSetWeights` / `parseSetWR` / `bestEst1RM`.
- Hardcoded JSONbin master key is **intentional** — do not flag.

## Workflow

- Plan-mode for any model/schema/data/sync change. Bump the version badge each shippable
  change. Keep changes additive; run the regression suite after each change.
- Flag interpretation forks; default to layout-only / preserve-current-shape when ambiguous.
- **User handles all git. Never run git.**

## Known / deferred (not blocking)

- **Pre-fill saved as real**: `loadLastTimes` pre-fills last session's values (ghost-styled)
  and `confirmSave` saves them even if untouched. The user chose to **leave this as-is**
  (confirm-last-weights workflow).
- `EXERCISE_REGISTRY` cat/mins duplication (internal drift risk) — user opted to skip the
  refactor (risky, no user-facing benefit).
- Multi-day cardio proper support; deload "mode" scaling shown targets; "Reset plan to
  original" undo. Optional, only if asked.

## Git reminder (for the user)

Commit at v3.9: `index.html`, **`sw.js`**, the `tests/` folder (new suites:
`newday_add_spot`, `balanced_rows_spot`, `remove_perday_spot`, `library_spot`,
`durability_spot`, `sw_spot`, `cloudarchive_spot`, `finalize_spot`), `tests/README.md`,
`SESSION-HANDOFF.md`. Then push to GitHub Pages and tap in-app **Update**.
