# MyFit · v4.20 → v4.21+ implementation plan

**Author:** Design review, round 2
**Source doc:** `MyFit Design Review v4.20.html` (in this bundle)
**Target file:** `gym-plan/index.html` (single‑file PWA, ~520 KB at v4.20)
**Style:** additive, single‑user, single‑maintainer, no data migrations

---

## 0 · About this bundle

This bundle is a developer plan for an **existing app you already know** — `gym-plan/index.html`. It is **not** a green‑field design handoff.

The HTML file in this bundle (`MyFit Design Review v4.20.html`) is a **design reference** — pixel‑shape sketches of the proposed surfaces and a written rationale. It is not production code and should not be copy‑pasted. Reproduce the visual intent inside the existing single‑file PWA using its existing CSS tokens, its existing JS structure, and its existing sync / persistence conventions documented in `SESSION-HANDOFF.md`.

Fidelity: **medium**. Colors, radii and rough proportions are deliberate (they're pulled from the live v4.20 token set). Spacing inside the mocks is illustrative, not normative — match the rest of the file's density.

---

## 1 · Scope, after the teammate review

Twelve items were proposed in the design review. Teammate (John) walked through them and made the call. Final scope is the table below.

**Implementation status — ROUND 2 COMPLETE:** Phase A (S2 + S1) → **v5.0** · Phase B (F4 + F1 + F2 + F3 + L3) → **v5.1** (+ fixes v5.1.1 / v5.1.2) · Phase C (C2 + C1 + M1 + L1) → **v5.2** · Phase D (**R1**) → **investigated & declined** (the targets are test-guarded data migrations + the live cloud-sync feature, not safe dead code — see SESSION-HANDOFF.md). All 11 functional items shipped; F5/L2/5.2 cut by owner. (Owner renumbered from the prompt's v4.21+ to start at v5.0.)

| ID | Item | Decision | Notes from John |
|---|---|---|---|
| **F1** | Auto‑progression — promote `v2-nudge` from passive label to ghost target + "+X" pill | **IN** | "let's include this" |
| **F2** | PR moment — inline halo + completion‑toast when a set sets a new est. 1RM | **IN** | "let's include this" |
| **F3** | Inline plate math under barbell weight fields | **IN** | "let's add this" |
| **F4** | Smart rest defaults by `exerciseMeta.pattern` (auto / long / short) | **IN** | "let's add this" |
| **F5** | Sunday retrospective card on Workout | **OUT** | "no need for this" |
| **C1** | Card density collapse — fold location & demo into the RPE/notes disclosure | **IN** | "let's do this" |
| **C2** | Settings → Units (replace per‑set lbs/kg toggle) | **IN** | (couples to C1) |
| **M1** | More tab regroup — 3 sub‑groups + 2 consolidations | **IN** | "let's include this" |
| **S1** | 5.3 — dark‑mode‑only gray‑ladder cleanup | **IN** | "let's do this" |
| **S2** | 5.5 — `.btn` vocab consolidation | **IN** | "let's do this one" |
| **L1** | Notes search — search field over per‑exercise + session notes | **IN** | "let's include this" |
| **L2** | Apple Health Shortcut for body measurements | **OUT** | "no thanks" |
| **L3** | Cycle auto‑advance — Workout tab opens on the next day in the cycle | **IN** ⚠ stronger than written | "that way.. it always opens on the next day in the cycle" — promote from "surface a suggestion" to "auto‑select on tab open" |
| **R1** | Retire legacy non‑v2 RPE paths + collapse `plansync_spot` / `patch5` / `patchN` gates | **IN** ⚠ caution | "let's do this CAREFULLY" — last phase, one gate per commit, no removal without a green smoke‑test that explicitly approves the markup byte‑change |

**Out of scope:** F5 (Sunday retro), L2 (Apple Health). Do not implement.

---

## 2 · Execution order (suggested)

Group the work into four phases — each phase ships independently and is mergeable on its own. The order trades risk for visible value: low‑risk plumbing first, then the user‑visible feature batch, then card surgery, then the careful retirement.

### Phase A · Plumbing (low risk, no UI change)
- **S2** `.btn` vocab consolidation — define `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-danger`, `.btn-sm`, `.btn-block`. Existing classes (`.complete-btn`, `.modal-btn-primary`, `.mgr-add-btn`, `.tray-act`, `.deload-plan-btn`, `.patch5-rerun-btn`) become aliases that compose to the new vocab. **Do not delete the old class names in this phase** — they are referenced by JS handlers (`document.querySelector('.modal-btn-primary')` etc.) and by `verify.js`. Aliasing only; rename pass is a later, separate event.
- **S1** Dark‑mode gray‑ladder cleanup — only the dark `@media (prefers-color-scheme: dark)` blocks. Replace `#888780 · #B4B2A9 · #C8C6BD · #2C2C2A` with the nearest `--muted` / `--ink` / `--border` token. Light mode is untouched.

### Phase B · New features (the user‑visible batch)
- **F4** Smart rest defaults — lookup table keyed on `exerciseMeta.pattern`. New synced key `rest_overrides_v1: { [linkId]: seconds }`. Pill copy: `Resting · 1:23 · 90s auto`. Settings → Rest timer becomes `Auto · Long · Short` (default Auto).
- **F1** Auto‑progression surface — reuse `v2-nudge` detection. Render the suggested next weight as italic ghost in the Set 1 weight input, with a small `+5 lb` pill above the tile. Tap the tile to accept; typing a value clears the ghost. Computed on render, no new persisted keys.
- **F2** PR moment — on input blur, compare the just‑typed `(weight × reps)` against historical `bestEst1RM` for that exercise (ignoring in‑progress sets). On new PR: yellow halo + "PR" tag on the set tile. On session save with ≥1 PR set, the existing top‑center toast text becomes `Session saved · 2 new PRs`. No persistence.
- **F3** Inline plate math — only for `equipment === 'barbell'`. Render a tiny plate strip under the weight input on the Workout card. Tap the strip → opens the existing plate‑calc modal (`openPlateCalc()`). Settings → Equipment: bar weight (default 45 lb) + available plates list. New synced key `plate_setup_v1: { barWeight, plates }`.
- **L3** Cycle auto‑advance — on Workout tab open (or app start when Workout is the active tab), if the user has not manually selected a day in the current session, auto‑select the next day in the plan cycle based on `lastLoggedDay`. Manual chip tap overrides for the rest of the session. Show a tiny "Up next" caption above the chip row when auto‑selected; hide it once the user taps any chip.

### Phase C · Card surgery + nav (visual change, but fully reversible)
- **C2** Settings → Units — new synced key `units_v1: 'lbs' | 'kg'` (default `'lbs'`). On change, every weight input's label and display unit switches; saved sessions keep their original unit on disk.
- **C1** Card density collapse — fold the location line and "▶ Watch demo" link into the existing RPE/notes footer disclosure. The footer chevron line copy becomes `RPE · notes · location · ▶ demo ▾`. Remove per‑set lbs/kg toggle (now global from C2). Column header above the set rows: `Weight · lb` / `Weight · kg`.
- **M1** More tab regroup — three section headers between rows: **Data & sync**, **Customize**, **About & advanced**. Consolidate cloud‑sync + primary‑device into one row (toggle + secondary‑line state); consolidate snapshots + cloud archive + backup‑code into one row labelled "Backup & restore" with the existing three flows shown after the tap. No new screens, no new disclosure patterns.
- **L1** Notes search — new search input at the top of the Sessions sub‑tab. Searches the `note` field on every logged set and the session‑level note. Hit → tap navigates to that session, scrolled to the exercise. Substring + case‑insensitive; no fuzzy.

### Phase D · Retirement ⚠ careful
- **R1** Retire legacy non‑v2 RPE markup paths + collapse `plansync_spot` / `patch5` / `patchN` gate blocks. **One gate per commit.** Each commit must:
  1. Confirm the gate's launch condition has been TRUE for ≥ 2 prior versions and no test exercises the FALSE branch.
  2. Update `verify.js` baseline in the same commit, with a one‑line note explaining why the markup byte‑change is intentional.
  3. Pass the full test suite before merging the next gate.

If any step is unclear: stop and ask the maintainer. Do not batch retirements.

---

## 3 · File touchpoints (where to look in `index.html`)

These line numbers are from v4.20. Use them as starting points; the gates may have moved by the time you implement.

| Item | Touchpoints (approx) |
|---|---|
| F1 | `v2-nudge` block (search `v2-nudge` — first hit ~L270 comment), Workout card render (`renderDay`, `renderV2Card`), exercise metadata `exerciseMeta.equipment` |
| F2 | `bestEst1RM` computation, Workout card set‑tile render, toast helper (anchored top center per v4.20, search `toast`) |
| F3 | `openPlateCalc` (~L6094), `closePlateCalc`, Workout card set‑tile render, `exerciseMeta.equipment` |
| F4 | `.rest-timer-bar` (~L122), exercise metadata `pattern`, set‑tap handler that arms the timer |
| C1 | Workout card render — the RPE/notes footer toggle is the v4.16 disclosure |
| C2 | All `<input type="number">` weight fields, `:root` token block (~L24+) for any `lbs` literal, settings render in `#p-more` |
| M1 | `#p-more` panel (~L1106), no JS change needed beyond grouping the existing rows |
| S1 | Dark‑mode CSS blocks (search `@media (prefers-color-scheme: dark)`) |
| S2 | CSS — search `.complete-btn`, `.modal-btn-primary`, `.mgr-add-btn`, `.tray-act`, `.deload-plan-btn`, `.patch5-rerun-btn` |
| L1 | `#p-prog` Sessions sub‑tab render (search `renderSessionsTab` / `prog-panel-sessions`) |
| L3 | Workout tab init / day‑chip selector (`renderDay`, sticky chip strip — search `day-selector`) |
| R1 | Search `patch5`, `plansync_spot`, `patchN`, `legacy`, the non‑v2 RPE branch in card render |

---

## 4 · Data‑safety rules (non‑negotiable, from SESSION‑HANDOFF.md)

These are absolute. Do not relax them without explicit maintainer approval.

1. **All new persisted keys must be mirrored in the sync payload** in both directions (upload + download merge). New keys this round:
   - `rest_overrides_v1: { [linkId]: seconds }`
   - `units_v1: 'lbs' | 'kg'`
   - `plate_setup_v1: { barWeight: number, plates: number[] }`
2. **No data migrations.** Existing sessions retain their on‑disk unit; `units_v1` only changes the entry/display, never rewrites history.
3. **No new keys for derived state.** F1 ghost targets, F2 PR halos, L3 cycle advance are all computed on render — never persisted.
4. **`verify.js` baseline updates** happen in the same commit as the markup change that necessitates them, with an inline rationale. R1 is the only phase that should touch the baseline more than incidentally.

---

## 5 · Per‑item acceptance criteria

### F1 · Auto‑progression surface
- [ ] On a strength card whose last 2 sessions are `≤ prev 2 + 0.5 lb` with `RPE ≤ 7`, the Set 1 weight input shows an italic ghost value of `lastWeight + step`, and a small "+X lb" pill sits above the tile.
- [ ] `step = 5 lb` for upper‑body compounds (`pattern ∈ {push, pull}` and `equipment === 'barbell'`), `2.5 lb` otherwise. Round to the increment supported by the equipment.
- [ ] On `RPE ≥ 8` stall → no bump; show subtle inline "hold" caption (existing v2‑nudge text is fine).
- [ ] Tap the tile → ghost becomes value, pill disappears.
- [ ] Typing any value → ghost + pill disappear immediately.
- [ ] No new persisted keys.

### F2 · PR moment
- [ ] On weight or reps blur for a set, compute estimated 1RM (Epley or whatever the existing helper uses — do not introduce a new formula). Compare to `bestEst1RM` for the exercise, derived from prior **completed** sessions only.
- [ ] On new PR: the set tile gets a yellow halo (`#FFF8E1` bg, `#F4D38A` border) and a "PR" badge.
- [ ] On session save with ≥1 PR set, the existing toast string changes to `Session saved · N new PRs` (singular: `Session saved · new PR`). No new toast component, no animation.
- [ ] Nothing persists. Re‑opening the session re‑derives the halos from history.

### F3 · Inline plate math
- [ ] Render the plate strip only when `exerciseMeta.equipment === 'barbell'`.
- [ ] Strip composition uses `plate_setup_v1.barWeight` and `plate_setup_v1.plates` (defaults: 45 lb bar, `[45, 25, 10, 5, 2.5]`).
- [ ] Plate colors follow the standard mock palette: 45 → `#1E5BAF`, 25 → `#0F6E56`, 10 → `#7A5A00`, 5 → `#5B4EA8`, 2.5 → `#9896C8`.
- [ ] Strip text ends with `×N per side`; if the weight is not achievable (e.g. 96 lb), show the nearest down + remainder caption.
- [ ] Tap the strip → opens the existing plate‑calc modal preloaded with the current weight.
- [ ] New Settings → Equipment row with bar weight + plates editor; writes `plate_setup_v1`.

### F4 · Smart rest defaults
- [ ] Lookup: `squat | hinge | carry → 120`, `push | pull (compound) → 90`, `isolation → 60`, `core | mobility → 30`, `cardio → 0 (no timer)`.
- [ ] `(compound)` heuristic: `equipment === 'barbell'` OR exercise name matches a known compound list — reuse the existing pattern/compound logic if present rather than inventing one.
- [ ] Settings → Rest timer becomes `Auto | Long | Short` (Long = +30s on every default, Short = −30s, floor 30s, cardio still 0).
- [ ] Per‑exercise override: long‑press the rest pill → numeric stepper, writes `rest_overrides_v1[linkId]`.
- [ ] Pill copy: `Resting · M:SS · Ns auto` (or `· Ns set` when overridden).

### C1 · Card density collapse
- [ ] Workout card layers reduce from 8 to 5: checkbox, name+sub, last‑time strip, set rows, footer disclosure.
- [ ] Footer disclosure now wraps RPE, notes, location, demo link. Chevron copy: `RPE · notes · location · ▶ demo ▾`.
- [ ] Per‑set unit toggle is gone (handled by C2).

### C2 · Settings → Units
- [ ] New row in Settings → Appearance: `Units · lbs | kg` segmented control.
- [ ] Changing the setting updates every weight input's label and every weight display in the live render. Saved data on disk is untouched.
- [ ] `units_v1` is in the sync payload, both directions.

### M1 · More tab regroup
- [ ] Three `<h3 class="more-group">` headers: **Data & sync**, **Customize**, **About & advanced**.
- [ ] Order within groups matches the proposed mock in the design review.
- [ ] Cloud sync + "this phone uploads" → one row with secondary‑line state.
- [ ] Snapshots + cloud archive + backup‑code → one row labelled `Backup & restore` with the existing three flows shown after the tap.
- [ ] No new screens; visual grouping only.

### S1 · Dark‑mode gray‑ladder cleanup
- [ ] Only the `@media (prefers-color-scheme: dark)` blocks are touched.
- [ ] Each ad‑hoc gray (`#888780 · #B4B2A9 · #C8C6BD · #2C2C2A`, and any others discovered) is replaced with the nearest existing token.
- [ ] Visual diff in dark mode: no perceptible change, but no two greys land in the same visual band any more.

### S2 · `.btn` vocab consolidation
- [ ] CSS defines: `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-danger`, `.btn-sm`, `.btn-block`. They use the existing tokens (`--primary`, `--bad`, `--r-sm`, `--r`).
- [ ] Existing button classes become aliases composing to the new vocab. No JS handlers change.
- [ ] No class renames in markup in this phase.

### L1 · Notes search
- [ ] Search input at the top of `#p-prog` Sessions sub‑tab.
- [ ] Searches: each set's `note` field, each session's session‑level note. Substring, case‑insensitive.
- [ ] Hit renders as a session card with the matched note text highlighted; tap → opens that session scrolled to the exercise (or the top, if session‑level).
- [ ] Empty search → unchanged Sessions view.

### L3 · Cycle auto‑advance
- [ ] On Workout tab open, if no manual chip selection has happened in the current page‑load session, auto‑select `nextDay(lastLoggedDay)` based on the plan cycle.
- [ ] `lastLoggedDay` is derived from the most recently logged session. If no sessions logged, fall back to Day 1.
- [ ] Caption "Up next" appears above the chip row when the selection is auto. Any chip tap clears the caption for the rest of the session.
- [ ] No new persisted keys — `lastLoggedDay` is derived per render from history.

### R1 · Retirement (⚠ separate commits)
- One gate per commit. Each commit independently passes the test suite before the next is opened. See §2 Phase D for the gating checklist.

---

## 6 · What stays out

- **F5 · Sunday retrospective card** — explicitly out per teammate.
- **L2 · Apple Health Shortcut** — explicitly out per teammate.
- **5.2 type tokens sweep** — design‑review recommendation was to skip; not in scope.
- **Volume‑weighted balance scoring** — flagged in handoff as deferred; still deferred.

---

## 7 · Files in this bundle

- `README.md` — this plan
- `PROMPT.md` — the paste‑into‑Claude‑Code prompt; references this README
- `MyFit Design Review v4.20.html` — the source review (mocks + rationale) for visual reference

The PROMPT is the file to paste into Claude Code. The README is what the prompt directs the agent to read first.
