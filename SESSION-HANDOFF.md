# MyFit (gym-plan) — Session Handoff

**App version:** v3.35 · **Updated:** 2026-05-24 · **Files:** `index.html` (~520KB, inline
CSS/JS, no build step) **+ `sw.js`** (service worker, v3.7) → GitHub Pages → iPhone home screen.

Personal, single-user workout tracker. **Data safety is paramount** — never risk losing
logged history.

## Repo + git workflow (changed 2026-05-24 — Claude now manages git)

- **Canonical working copy: `C:\dev\gym-plan`** (git repo, remote
  https://github.com/AirPengwn/gym-plan). The old `…\OneDrive\Desktop\gym-plan-main` copy is
  **stale** — work here.
- **Per shipped version (auto, no prompt):** branch `release/vX.Y` → commit → tag `vX.Y` →
  merge `--no-ff` into `main` → push `main` + branch + tag. **Pages deploys from `main`.**
  Tag + branch per version = rollback (`git checkout vX.Y`).
- Auth: GCM cached as **AirPengwn** (repo owner). Local git `user.name` is still
  "AirPenguin23" (separate account) → commits authored as that unless changed. Never force-push.
- History was at v2.73 on `main` until 2026-05-24 (user had deployed via Pages *source
  settings*); main is now the source of truth.
- ⚠️ **Pages source must be set to `main` / root** in repo Settings → Pages (user action).

> **Deploy note:** as of v3.7 the app is **two files** — commit BOTH `index.html` and
> `sw.js` (at the repo root, same directory). If `sw.js` isn't deployed, the SW just
> fails to register (harmless — no offline), but you lose the offline/update benefits.

---

## Current state (all green)

- **35 test suites pass** via `cd tests && npm test` (`run-all.js`). Primary gate =
  `verify.js` (byte-identity of the unedited stock plan vs `index.html.bak`). **CI runs
  the whole suite on every push/PR to `main`** (`.github/workflows/test.yml`).
- **Exercise library = 191 catalog entries + 28 built-ins.** Grown in dup-scanned batches
  (Phase C). `dupscan.js` is a CI guard: hard-fails on an exact intra-catalog dup, prints
  advisory near-dup pairs. **Run `node tests/dupscan.js` before adding any breadth batch.**
- Last **real** workout data = **May 16, 2026**. Anything later is test noise.
- Owner-only pending: a real-device end-to-end gym pass with **Test Mode OFF** on the
  iPhone (save→sync→reload→history), and confirm the **service worker installs** + the
  app loads **offline** + add-to-home-screen opens **standalone**.

## What this build does (v2.80 → v3.9, this session)

**UX / navigation**
- **Bottom tab bar (v3.30 → 5 tabs in v3.32):** primary nav is a fixed bar —
  **🏋️ Workout · 📊 Progress · 📋 Plan · ☁️ Sync · ⚙️ Settings**. Header slimmed to
  title/version + 🌙 dark toggle; the old ⋯ overflow menu is gone. The 📊/📋 buttons kept their
  ids (`hdr-prog-btn`/`hdr-plan-btn`) + handlers, relocated into the bar. `navWorkout()`,
  `openSettings()`, `openSync()`, `renderSettings()`, `renderSync()`, `_syncNav()` drive it.
  `#test-toggle` + `_testUpdateUI` live in Settings.
- **v3.32 IA pass:** the **☁️ Sync** tab (`p-sync`/`renderSync`/`openSync`) now holds ALL cloud
  + backup — the plan/days/library cloud-sync box moved out of the 📋 Plan screen, plus
  Pull-from-cloud and a Backup&restore launcher (`showExportImport`). Plan got a **☁️ Cloud
  sync & backup** jump button, and **removed days are pinned to the bottom**
  (`mgr-removed-wrap`/`renderRemovedDays`, below balance + exercises). The **day-selector chips
  show only on Workout** (`_setDaySelectorVisible`; `sw` hides on `prog`, openSettings/openSync
  hide, `renderDaySelector` re-hides if a non-Workout panel is up). Settings = Test mode +
  Update + version. Non-day-keyed panels (`p-prog`/`p-settings`/`p-sync`) are excluded from
  `syncDayPanels()`'s inline-hide loop — **the v3.31 fix** (that loop had blanked `p-settings`).
  `plansync_spot` now renders via `renderSync()`. Pure layout/nav; `verify.js` still green.
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
- **Seed catalog** (`EXERCISE_CATALOG`): now **191** hardcoded library-only exercises
  (grown across Phase C batches 1–6). Adding one carries cat/sub/loc/video/badge/muscles
  (muscle keys must map to `MUSCLE_GROUPS`: chest/front-shoulder/tricep/lat/upper-back/
  rear-delt/bicep/core-front/core-back/quad/hamstring/glute/calf/hip-flexor/inner-thigh/
  outer-hip). **Run `dupscan.js` before adding entries**; avoid near-name dups.
- **Richer metadata (Phase B/B2, v3.14):** every catalog entry carries
  `equipment` / `pattern` / `unilateral` / `difficulty` / `alternatives[]`.
  `pattern ∈ push|pull|squat|hinge|lunge|carry|core|cardio|isolation|mobility`. There is a
  **Mobility** category + `mobility` pattern. `exerciseMeta(name|record)` resolves these;
  fields persist onto plan records + the user library; the builder has pattern/equipment/
  unilateral/alternatives inputs (`b-pattern`/`b-equip`/`b-unilat`/`b-alts`). Gated by
  `metadata_spot.js`.
- **Built-in metadata + balance intelligence (Phase D, v3.25):** `DEFAULT_META` (keyed by
  built-in `histEx`, e.g. `chest press`→push, `leg press`→squat) gives the 28 stock-plan
  exercises a pattern/equipment so `exerciseMeta` resolves the WHOLE plan (catalog wins where
  both exist; explicit record fields win over all). `analyzePlanBalance()` is a **read-only**
  scan (never writes/syncs) → push/pull/lower/core tallies + per-muscle coverage + untrained
  major muscles + advisory flags; `_balanceGroup(pattern,muscles)` buckets each placement
  (cardio/mobility/stretch contribute none). `renderPlanBalance()` paints the "📊 Plan
  balance" card at the top of the 📋 Manage screen. Gated by `balance_spot.js`.
  **NOTE:** the user flagged that Manage + Progress are getting crowded — a future pass may
  re-think nav/IA before adding more screens. Keep that in mind.
- **User library** (`exercise_library_v1`, v3.5): builder **📚 Save to library** stores an
  exercise WITHOUT a day. Soft-delete (tombstone + `updatedAt`) so deletes sync. Merged
  last-write-wins per name (`_mergeLibraries`).
- **Hide / un-hide any library exercise** (`library_hidden_v1`, v3.19):
  `hideLibraryItem`/`unhideLibraryItem`/`isLibraryHidden`. Reversible, synced, NOT a delete
  (the entry stays, just flagged `hidden`). Save-to-library un-hides. Rides the payload.

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
  Restore via Backup → ☁️ Cloud archive → Load cloud archive. **v3.26:** the read path
  self-heals — a stale/unreadable stored bin id (the cause of the iPhone "load failed":
  a stored id pointing at a bin that wouldn't read) is dropped and re-resolved from the
  live cloud; a genuinely-missing archive shows a clear soft message (rebuilds on next
  primary sync), and only a truly-unreachable cloud shows an error.
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
- **Synced payload keys** (mirror in all 7 spots — pushPlanToCloud, generateExport, import,
  buildBinPayload, mergeCloudIntoPayload, applyPayloadToLocal, TEST_EXTRA_KEYS): `gymlog_*`,
  `plan_v2`, `days_config_v1`, `exercise_library_v1`, `library_hidden_v1`, `plan_templates_v1`.

## Plan templates (v3.28)

- **Built-in `PLAN_TEMPLATES`** (PPL 3-day, Upper/Lower 4-day, Full Body 3-day, Bro Split
  5-day) + **user custom templates** (`plan_templates_v1`, LWW-merged like the user library,
  soft-delete tombstones, synced). Template exercises are catalog names so they resolve full
  metadata/muscles/cues on apply.
- `applyTemplate(id, mode)`: **always snapshots first**; `replace` ARCHIVES current active
  days (history kept + restorable) then installs the program, `append` adds the template's
  days alongside. Builds the overlay + day config then commits once.
- `saveCurrentPlanAsTemplate(name)` snapshots the current plan's active days + exercise names.
  UI: **📐 Templates** button on the 📋 Manage screen → modal (`#tpl-overlay`) listing
  built-ins + customs with day/exercise preview, Replace/Add-days/Delete, and a
  save-current-plan field. Gated by `templates_spot.js`.

## Infra: CI + automated backup (Phase A, v3.13 — live)

- **`.github/workflows/test.yml`** — runs `npm ci && npm test` (all 32 suites) on every
  push/PR to `main`, ubuntu + node 20. Test paths are `__dirname`-relative so the suite runs
  on the Linux runner. This is the merge gate.
- **`.github/workflows/backup.yml`** — daily cron: reads the JSONbin id/key out of
  `index.html`, writes a dated JSON snapshot to the **private** `AirPengwn/gym-plan-backups`
  repo using `secrets.BACKUP_TOKEN`. No-ops if the token is absent. (Private repo chosen
  deliberately — workout + body-measurement data should not be public.)

## Running the tests

```
cd tests && npm ci && npm test    # runs all 32 suites via run-all.js, exits non-zero on fail
```
Paths are `__dirname`-relative (run anywhere, incl. CI). `node tests/dupscan.js` before any
catalog breadth batch.

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
- **Claude manages git** (see the Repo section up top): auto branch+tag+merge-to-main+push
  per shipped version.

## Next up — Phase D follow-ons (NOT started)

- **Auto-progression prompts** (deferred from Phase D on purpose — touches history/PR code):
  scan logged history for stalled lifts and suggest adding weight/reps. Higher risk; do as
  its own pass with care around the `.note`/`.sets` format and `bestEst1RM`.
- **Nav / IA rethink** (user-flagged): Manage + Progress are absorbing a lot. Consider how to
  surface balance / library / day management without overloading two menus, before adding
  more screens.
- Optional balance polish: weight muscle volume by sets (not just placements), or let the
  user dismiss/snooze the balance card (would add a synced key).

## Known / deferred (not blocking)

- **Pre-fill saved as real**: `loadLastTimes` pre-fills last session's values (ghost-styled)
  and `confirmSave` saves them even if untouched. The user chose to **leave this as-is**
  (confirm-last-weights workflow).
- `EXERCISE_REGISTRY` cat/mins duplication (internal drift risk) — user opted to skip the
  refactor (risky, no user-facing benefit).
- Multi-day cardio proper support; deload "mode" scaling shown targets; "Reset plan to
  original" undo. Optional, only if asked.

## History note

v2.73 → v3.12 was committed in one merge on 2026-05-24 when git management moved to Claude
and the working copy moved to `C:\dev\gym-plan`. From there each version is its own
`release/vX.Y` branch + `vX.Y` tag merged `--no-ff` into `main`. v3.13 (CI + backup),
v3.14 (metadata), v3.16–v3.23 (Phase C breadth batches → 191 catalog entries), v3.19
(library hide/un-hide), and the `dupscan` dedup tooling all shipped this way.
