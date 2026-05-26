# Paste this into Claude Code

> Use this as the opening message in a Claude Code session at the root of the `gym-plan` repo.

---

You are picking up MyFit (`gym-plan/index.html`) at **v4.20**. Round 1 of design feedback is closed out. This is the **Round 2** batch — eleven items grouped into four phases.

## Read first, in order

1. `SESSION-HANDOFF.md` — the maintainer's data‑safety contract. Especially the sections on `verify.js` byte‑identity, the sync payload conventions, and the "additive only, no migrations" rule.
2. `design_handoff_v420_r2/README.md` — the scope, decisions, file touchpoints, and per‑item acceptance criteria for this batch. **Treat the README's scope table as authoritative** — two items (F5 Sunday retrospective, L2 Apple Health) were explicitly cut by the maintainer; do not implement them.
3. `design_handoff_v420_r2/MyFit Design Review v4.20.html` — the source review with visual mocks. Reference for shape and intent only — do not copy markup; reproduce inside `gym-plan/index.html` using its existing tokens and patterns.

## How to work

- **One phase at a time, one PR per phase.** Phases A → B → C → D in order. Stop after each phase and let the maintainer review before opening the next.
- **One commit per item within a phase**, except R1 in Phase D which is **one commit per gate retired** — see the README §2 Phase D checklist; do not batch retirements.
- **Never relax the data‑safety rules in `SESSION-HANDOFF.md`.** Specifically:
  - All new persisted keys are mirrored in the sync payload both directions. New keys this round: `rest_overrides_v1`, `units_v1`, `plate_setup_v1`. No others.
  - No data migrations. `units_v1` changes entry/display only; saved sessions keep their on‑disk unit.
  - Derived state (F1 ghost targets, F2 PR halos, L3 cycle advance) is computed on render. Never persist it.
  - `verify.js` baseline changes happen in the same commit as the markup change they cover, with a one‑line inline rationale.
- **Version bump per phase**, in the version badge and the README §1 status row. Phase A → v4.21, Phase B → v4.22, Phase C → v4.23, Phase D → v4.24+ (one per gate). Adjust if the maintainer prefers a different cadence.
- **Tests:** the full test suite under `tests/` must pass before each commit lands. If a test legitimately needs to change because the behavior changed, change the test in the same commit with an inline comment.
- **R1 retirement is the only phase that touches markup the maintainer has explicitly flagged as careful.** John's exact note was "let's do this CAREFULLY". For each gate retirement: (a) confirm the gate's launch condition has been TRUE for ≥ 2 prior versions, (b) confirm no test exercises the FALSE branch, (c) update `verify.js` in the same commit, (d) run the full suite. If any of those is unclear: stop and ask.

## What's in scope (eleven items)

In execution order:

**Phase A · Plumbing**
- **S2** `.btn` vocab consolidation (`.btn`, `.btn-primary`, `.btn-ghost`, `.btn-danger`, `.btn-sm`, `.btn-block`) — alias the existing button classes, do not rename markup in this phase.
- **S1** Dark‑mode‑only gray‑ladder cleanup — only `@media (prefers-color-scheme: dark)` blocks, replace ad‑hoc greys with the nearest token.

**Phase B · New features**
- **F4** Smart rest defaults — lookup keyed on `exerciseMeta.pattern`, new synced key `rest_overrides_v1`. Settings → Rest timer becomes `Auto | Long | Short`.
- **F1** Auto‑progression surface — reuse `v2-nudge` detection, render ghost target + "+X lb" pill on Set 1.
- **F2** PR moment — on blur, halo + "PR" tag when a set yields a new est. 1RM. Toast at save: `Session saved · N new PRs`.
- **F3** Inline plate math — barbell only, new synced key `plate_setup_v1`. Tap strip → existing plate‑calc modal.
- **L3** Cycle auto‑advance — on Workout tab open with no manual selection in the current session, auto‑select the next day in the cycle. (The maintainer's exact note was "that way.. it always opens on the next day in the cycle" — this is **auto‑select**, not just suggest.) Show an "Up next" caption above the chip row when auto; clear it on any manual chip tap.

**Phase C · Card surgery + nav**
- **C2** Settings → Units — new synced key `units_v1`, replaces the per‑set lbs/kg toggle.
- **C1** Card density collapse — fold location + demo into the existing RPE/notes footer disclosure. Workout card goes from 8 visual layers to 5.
- **M1** More tab regroup — three `<h3 class="more-group">` headers (Data & sync · Customize · About & advanced), consolidate cloud‑sync + primary‑device into one row, consolidate snapshots + cloud archive + backup‑code into one row labelled "Backup & restore".
- **L1** Notes search — search input at the top of `#p-prog` Sessions sub‑tab, substring + case‑insensitive over set‑level `note` + session‑level note.

**Phase D · Retirement (⚠ careful)**
- **R1** Retire legacy non‑v2 RPE markup + collapse `plansync_spot` / `patch5` / `patchN` gate blocks. **One gate per commit**, with verify.js baseline update inline. Stop and ask before any markup byte‑change you're not sure about.

## What's explicitly OUT

- **F5 Sunday retrospective card** — cut by maintainer ("no need for this").
- **L2 Apple Health Shortcut** — cut by maintainer ("no thanks").
- **5.2 type tokens sweep** — design‑review recommendation was to skip.

## Acceptance gates

Each item's acceptance criteria are in `design_handoff_v420_r2/README.md` §5. Treat those as the definition of done. If a criterion is ambiguous in your specific code context, ask before you guess.

## What to do first

1. Read the three files above in order.
2. Confirm you've located the touchpoints in §3 of the README in the live file (line numbers are from v4.20 and may have drifted).
3. Open Phase A · S2 (`.btn` vocab consolidation) as the first PR. Stop after it lands; do not chain into S1 without a review.

Ask any clarifying questions now before you start touching `index.html`.
