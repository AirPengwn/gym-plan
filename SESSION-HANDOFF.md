# MyFit (gym-plan) — Session Handoff

**App version:** v4.16 · **Updated:** 2026-05-25 · **Files:** `index.html` (~520KB, inline
CSS/JS, no build step) **+ `sw.js`** (service worker, v3.7) → GitHub Pages → iPhone home screen.

Personal, single-user workout tracker. **Data safety is paramount** — never risk losing
logged history.

## Repo + git workflow (changed 2026-05-24 — Claude now manages git)

- **Canonical working copy: `C:\dev\gym-plan`** (git repo, remote
  https://github.com/AirPengwn/gym-plan). The old `…\OneDrive\Desktop\gym-plan-main` copy is
  **stale** — work here.
- **Per shipped version (auto, no prompt):** branch `release/vX.Y` → commit → tag `vX.Y` →
  merge `--no-ff` into `main` → push `main` + branch + tag. Each version also bumps the badge
  in `index.html`, the `tests/README.md` "PASS at vX.Y" line, and this file's App version.
  Tag + branch per version = rollback (`git checkout vX.Y`). **Pages auto-deploys via
  `.github/workflows/pages.yml`** (see "Confirming a deploy lands" below).
- Auth: GCM cached as **AirPengwn** (repo owner). Local git `user.name` is still
  "AirPenguin23" (separate account) → commits authored as that unless changed. Never force-push.
- History was at v2.73 on `main` until 2026-05-24 (user had deployed via Pages *source
  settings*); main is now the source of truth.
- ✅ **Pages Source = "GitHub Actions"** (set) — deploys via `.github/workflows/pages.yml`,
  not the old branch-deploy. See "Confirming a deploy lands (Pages)" below.

> **Deploy note:** as of v3.7 the app is **two files** — commit BOTH `index.html` and
> `sw.js` (at the repo root, same directory). If `sw.js` isn't deployed, the SW just
> fails to register (harmless — no offline), but you lose the offline/update benefits.

---

## ▶ PICK UP HERE — v4 visual overhaul ("Build Plan")

Working through a **5-step Claude design review** (`C:\Users\airpe\Downloads\MyFit Build
Plan.html`). **Each step ships as its own version**, then **PAUSE for the user's on-device
verify before the next step**. Current badge **v4.16, shipped — PENDING owner on-device verify**.

### Design "1-line nits" pass (post-overhaul) — owner picked nits 4–20,22 (skipping 1/2/21 done, 3 day-colors)
Grouped into v4.15–v4.20, one batch per version, pause for verify each.
- **v4.15 (Workout polish):** (4) progress bar 6→8px, `.progress-fill.full`→#10B981 green at 100%,
  `barpulse` brightness flash on each tick (toggled in `tog`/cleared in `rst`); (5) `--ghost`
  kept ITALIC as the un-edited sentinel but recolored to a legible muted tone (#6E6C66 light /
  #A7A2CE dark) — `funcsmoke` token assert updated; (8) `.item.done .ex-sub/.ex-loc` contrast
  lifted (#78766D light / #9A95C4 dark), title still struck; (6) check-in bar gated — only
  injected if no check-in in the last 7d (`gymlog_checkin_ts`, local-only, set in `setCheckin`).
- **v4.16 (card footer):** (9) `.last-time` moved OUT of the collapsed `.v2-foot` to always-on
  (direct child of `.fields-wrap`, above the sets; self-hides via `.has-data`); footer toggle
  relabeled "RPE & notes". Dark style generalized `.v2-foot .last-time`→`.v2-card .last-time`.
  (7) RPE collapsed from 3 labels to one inline **pill** ("RPE 7 · Hard") beside the slider
  (`.rpe-compact`/`.rpe-pill`); kept the `.rpe-top-val` class so the inline `oninput` is
  unchanged (now prefixes "RPE "). Only the v2 (strength) card changed; the injected non-v2
  RPE path (cardio/legacy) is untouched. `funcsmoke` footer asserts updated.
- **Queued:** ~~v4.16 card footer~~; v4.17 Progress (10 hide
  empty sub-tabs, 11 13→12wk, 12 heat-map title); v4.18 Plan (14 removed container, 15 templates
  →screen push, 13 reorder control); v4.19 Sync/Settings (16 toggle switch, 18 Test-mode group,
  17 snapshot 2-step); v4.20 Modals/Toast (19 radius, 20 backup hint, 22 toast reposition).

**Done so far:**
- **Step 1 → v4.3** — bottom tab bar reduced 5 → **4 tabs** (🏋️ Workout / 📊 Progress /
  📋 Plan / ⋯ More). New `#p-more` panel + `openMore()`; Sync & Settings moved under More
  (`openSync()`/`openSettings()`/`_syncNav()`). `syncDayPanels()` now also skips `p-more`.
- **Step 2 → v4.5** — Progress **Body** sub-tab (`#prog-panel-body`); 4 sub-tabs total.
- **Step 3 → v4.6** — Plan-screen **balance pill** (`renderPlanBalance` collapsed by default,
  `_balExpanded`/`toggleBalanceCard`); Plan header **⋯ overflow** (`toggleMgrOverflow`/`mgrOvf`,
  `#mgr-ovf-menu`). **Pre-step tweak (done):** removed "Anytime Fitness Guilford" from the
  title bar. Balance is **whole-week plan** scope — labeled clearer per user.
- **v4.4** (fix) — rest-timer bar peeking behind tab bar → hidden transform now
  `translateY(calc(100% + 74px + env(safe-area-inset-bottom)))`.
- **Step 4.1 → v4.7** — 44×44 checkbox via `::before`; cardio input/button sizing.
- **v4.8** (fix) — Step-4.1 button sizing **missed cardio cards** (used `.cardio-input` /
  `.cardio-machine-btn`, not `.rep-input`); fixed both.
- **Step 4 part A → v4.9** — (4.3) **Reset** moved into a per-day **⋯ overflow** in each
  day panel's `.btn-row` (`.day-ovf-btn`/`#dayovf-<key>`/`toggleDayOverflow`/`closeDayOverflow`/
  `_dayOvfReset`); the menu item keeps `class="reset-btn"` so `renderDayItems` still syncs its
  count, and `confirmReset()` is unchanged. (4.6) **Per-day balance hint** (`.day-bal-hint`/
  `#daybal-<key>`) rendered above each day's `#items-<key>` — `analyzeDayBalance(day)` scans
  that day's last-7d `gymlog_*` sessions (read-only) and `renderDayBalanceHint(day)` paints the
  logged push/pull/lower/core mix; hidden when no resistance work in 7d. `_musclesByName(name)`
  resolves muscles for history entries (by name, not domId). Hooked into `renderDayItems` +
  `sw()`. Distinct from the whole-week plan balance pill (`renderPlanBalance`).
- **v4.9.1** (fix, owner verify) — (a) per-day balance hint window widened **7d → 21d**
  (`analyzeDayBalance` cutoff + label) so a weekly-split day reliably falls inside it; (b)
  **checkbox parity:** `button.checkbox` (v2 strength cards) only reset bg/padding/font, so it
  picked up native UA button chrome (extra border/ring) vs the `<div class="checkbox">` on
  cardio cards — added `border:0;-webkit-appearance:none;appearance:none;color:inherit` so both
  render the identical 28px ring. `patch3_spot` assertion loosened to property-checks.
- **v4.9.2** (fix, owner verify) — **checkbox redesign (owner-supplied spec).** The warm-up
  `<div>` and strength `<button>` checkboxes looked different only because the `<button>`
  picked up native UA chrome (a `<div>` can't), so the look is now fully explicit CSS. The
  spec used nested `.ring`/`.disk` spans, but our checkbox markup is locked (gated SVG + flat
  `.checkbox > svg`), so it's reproduced with **pseudo-elements**: `.checkbox::before` = the
  38px 2-tone **groove ring** (`linear-gradient(135deg,#4A476B,#2A2845,#0E0D1F)` + inset
  highlight + drop shadow); `.checkbox::after` = the 32px **disk** — `#1F1D38` when empty,
  `radial-gradient(circle at 30% 30%,#9C95EE,#7F77DD,#5B4EA8)` sphere when `.item.done`.
  Checkmark grown to 18px (z-index above the disk) with an opacity+scale check-in transition.
  Identical for `<div>` and `<button>`, checked + unchecked. `funcsmoke` updated: assert
  ::before 38px ring + ::after 32px disk.

- **Step 4 part B → v4.10** (bottom-chrome bundle): (4.2) floating **Complete & Save** pill
  (`#complete-bar`/`.complete-bar`) docked above the tab bar, shown when the SHOWN workout day
  is **≥80%** checked (`updateCompleteBar`/`hideCompleteBar`/`triggerCompleteFromBar`, day held
  in `_completeBarDay`); wired into `tog`/`sw`/`rst`/`completeDay` + hidden off-Workout via
  `_setDaySelectorVisible(false)`. Routes through existing `completeDay()` — no data change.
  (4.4) stacking: pill `z-index:1002` > timer `1001`; `body.timer-active .complete-bar` lifts it
  to `+118px` so the two pills stack, never overlap; `body.complete-ready`/`.timer-active`
  combine for day-panel bottom padding. (4.5) keyboard-aware: a `visualViewport` listener sets
  `--kb-offset` (both pills' `bottom` calc includes it, so they ride above the keyboard); a
  `focusin` handler `scrollIntoView`s a focused `.rep/.cardio/.notes/.reps-actual-input`
  (scroll happens ONLY there, not on resize). **No sticky day chips.** `funcsmoke` covers it.
- **v4.10.1** (fix, owner verify) — **iOS zoom-on-focus.** Workout entry inputs were 12–13px,
  so iOS Safari auto-zoomed on focus and never zoomed back out. Bumped `.rep-input` /
  `.reps-actual-input` (both rules) / `.notes-input` / `.cardio-input` to **16px** (the iOS
  no-zoom threshold). Fields are 40px tall so 16px fits cleanly. Did NOT touch the viewport
  meta (keeps pinch-zoom / accessibility).
- **Step 5.1 → v4.11** — header/day-chip compression. Header slimmed (title 23→20px, margin
  1rem→0.5rem). Day chips lighter (`.day-btn` font 12→11px, padding 8/6→6/8, +ellipsis); kept
  the **full-width balanced grid** (owner's choice, NOT the doc's 72px narrow chips) — note
  `_balancedCols(7)` already returns 4 (→4+3), so no math change. Button-label cap stays **6**
  (owner kept it; doc suggested 8). **Dark toggle MOVED** from the header into **More →
  Appearance** as a `#dark-toggle` `.set-item` row (`#dark-mode-label`/`#dark-mode-state`,
  `_syncDarkToggleUI`); old `#dark-toggle` header-icon CSS removed. `funcsmoke` updated
  (toggle now in `#more-appearance`, On/Off state check).

- **Step 5.4 (started) → v4.12** — emoji→monoline SVG icons. **Owner DEFERRED 5.2 + 5.3**
  (type/color/radius/shadow token sweeps): low user-visible payoff + app-wide visual-shift
  risk; revisit only if actively maintaining the CSS. Added an inline `<svg><defs><symbol>`
  sprite at the top of `<body>` (`#ic-sessions`/`#ic-lifts`/`#ic-trends`/`#ic-body`) + a `.ic`
  class (`fill:none;stroke:currentColor;stroke-width:1.8`, 18px). Swapped the **Progress
  sub-tabs** (📅/💪/📈/⚖️ → `<use href>`). Icons inherit the active/inactive button color.
  None of this touches `EXERCISE_DATA`, so **no verify.js re-baseline**.

- **Step 5.4 cont. → v4.13** — owner greenlit the monoline style; rolled it across the
  **Plan/Manage** + **More** screens. New sprite symbols: balance/add/templates/library/cloud/
  archive/backup/appearance(contrast circle)/app(gear)/test(unused)/refresh/plan(clipboard).
  Swapped: Plan title (📋→clipboard), Days-in-cycle (📆→calendar), mgr ⋯ overflow (templates/
  library/add/cloud), balance card title (📊), Add-exercise (➕), Removed + Archived titles (📦);
  More section headers (☁️/💾/🎨/⚙️) + Update (🔄). `.ic-sm` (15px) for header-size icons;
  `.set-gh` now flex. **Kept as emoji** (JS-driven `textContent`): 🧪 Test mode + 🌙/☀️ Dark
  mode label. None touch `EXERCISE_DATA` — no re-baseline.

- **Step 5.4 finish → v4.14** — remaining card actions/modals. New symbols `ic-reset`
  (rotate-ccw) + `ic-trash`. Swapped: day ⋯ **Reset day** (↺, all 5 static + dynamic
  `buildDayPanelHTML` via a single replace), **Plate Calc** button + modal title (🏋→`ic-lifts`),
  session ⋯ **Delete** + **Clear all history** (🗑→`ic-trash`), **Templates** modal title
  (📐→`ic-templates`) + **Save as template** (💾→`ic-backup`), builder **From/Save library**
  (📚→`ic-library`). ⏱ Rest was already an SVG. None touch `EXERCISE_DATA`.
  **Intentionally LEFT as emoji:** measurement sub-tabs (⚖️ Weight / 📐 Waist / 🔬 Body Fat —
  no clean monoline equivalents for waist/body-fat), the 🧪 Test-mode + 🌙/☀️ Dark-mode labels
  (JS-driven `textContent`), transient banners (🧪/💾/☁️), achievements, check-in 💪😐😴, toasts,
  and per-card `EXERCISE_DATA` content (📍 ex-loc). **Step 5.4 is effectively complete.**

**Remaining (version mapping):**
- **Deferred (cleanup only, low user payoff):** (5.2) type tokens; (5.3) color/radius/shadow
  tokens **[verify.js re-baseline]**; (5.5) `.btn` vocab consolidation. The v4 "Build Plan"
  overhaul (Steps 1–5) is otherwise DONE — these three are optional CSS-maintainability passes.

**verify.js re-baseline policy:** steps that change rendered card markup (5.3, 5.4) will break
the byte-identity gate. When intended, regenerate `index.html.bak` from the freshly-rendered
`#items-a..e`, eyeball the diff, and note the re-baseline in the commit. Do NOT re-baseline to
paper over an *unintended* render change.

**Parked decisions (confirm when reached):** Step 3 overflow 4-item vs full-8; single vs
per-day "Add exercise"; promote Primary/Reader inline; day-label maxlength 6 vs 8.

## Confirming a deploy lands (Pages)

After push, the live site lags ~1–3 min behind `main`. Two checks:

```
# 1. Live badge (cache-busted). Bash grep is fine here — no bullet/emoji in the version span.
curl -s "https://airpengwn.github.io/gym-plan/?cb=$(date +%s)" | grep -o '>v[0-9.]*</span>' | head -1

# 2. CI / Pages workflow runs (name, status, conclusion, sha)
curl -s "https://api.github.com/repos/AirPengwn/gym-plan/actions/runs?per_page=5" \
  | python -c "import sys,json;d=json.load(sys.stdin);[print(x['name'],x['status'],x['conclusion'],x['head_sha'][:7]) for x in d['workflow_runs'][:5]]"
```
Expected: badge `>vX.Y</span>` matches the just-shipped version; the **pages** workflow shows
`completed / success` at the new sha. If the badge lags but CI is green, give it a minute
(`pages.yml` queues, never drops); an empty-commit nudge is the last-resort fix.

---

## Current state (all green)

- **38 test suites pass** via `cd tests && npm test` (`run-all.js`). Primary gate =
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
- **`.github/workflows/pages.yml`** (v3.40, the deploy fix) — explicit GitHub Pages deploy on
  every push to `main`, `concurrency: cancel-in-progress:false` so builds **queue, not drop**.
  Replaced the implicit "deploy from a branch" trigger, which **debounced rapid pushes** and
  silently skipped deploys (v3.37–v3.40 lagged on the live site until an empty-commit nudge).
  **Requires repo Settings → Pages → Source = "GitHub Actions"** (done). It publishes ONLY the
  app's public files — `index.html`, `sw.js`, icons — so `tests/`, `backups/`, and `*.bak`
  are **no longer served** on the Pages URL (the old whole-root branch deploy had exposed them,
  HTTP 200). If the live badge ever lags `main` again, the empty-commit nudge still works, but
  it shouldn't be needed now.
- **Privacy cleanup (v3.40):** `backups/` (held a `jsonbin-cloud-backup.json` workout-data
  snapshot) was `git rm`'d from `main` and added to `.gitignore` — it's preserved in the
  private backup repo + cloud bin. (It remains in git *history*; not worth a history rewrite.)
  `index.html.bak` stays in the repo — `verify.js` needs it as the byte-identity baseline —
  but is excluded from the public deploy by `pages.yml`.

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
