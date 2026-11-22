# OpenDose UI/UX overhaul: plan built on the emil skills

Written 2026-11-22 from a full read of all 37 installed UI skills (every
file, about 14k lines) and a code audit of `web/`. The lead session executes
it via `docs/UI-LEAD-PROMPT.md`. Line numbers refer to commit 177053f.

## 1. Where OpenDose stands

Good bones, no system. The basics are already right: a global
`:focus-visible` ring, hover gated behind `(hover:hover)` almost everywhere,
`@starting-style` entrances, `--ease-out`/`--ease-in-out` tokens that match
the skills, a virtualised grid (`sheets/common/virtualRows.ts`) with
`inputMode="decimal"` and tabular numbers, native `<dialog>` focus trapping,
an axe-core smoke harness at 1400/390 px in light and dark. What is missing
is a system behind the surface:

| Area | Evidence | Owning skill |
|---|---|---|
| Monolith CSS | `App.css` 1,332 lines mixing tokens, base, layout and feature styles; 38 global CSS files, 4,113 lines | emil-design-system-docs, emil-design-foundations |
| No scales | 22 font sizes in half-pixel steps, 7 weights (incl. 450/550/650), 119 padding values, 41 gaps, 18 radius forms, 14 literal shadows, z-index 1 to 1500 ad hoc | emil-typography, emil-surfaces, emil-ui-polish |
| Colour | hex/rgba only; every dark block written twice (media query + `data-theme`) across 5 files; three success greens; Plotly chrome hex in `lib/palette.ts:132-147` drifted from CSS (`--muted` #636368 vs #6e6e73); dark `--page` is pure #000; `.btn-danger` hardcodes #fff | emil-color, emil-surfaces |
| Theme | applied in a `useEffect` (`app/ProjectContext.tsx:159-163`), no pre-paint script, no `color-scheme`/`theme-color` meta, 300 ms body colour transition (`App.css:110`) makes the flash visible and tweens out of step with buttons and Plotly | emil-performance, emil-ui-polish, emil-mobile-native |
| Fonts | Inter imported from JS (`main.tsx:6`), not preloaded; `tabular-nums` opt-in per selector (~20 places); px font sizes cancel the rem body | emil-typography, emil-marketing-pages |
| Primitives | one Modal (31 users, configuration API); three menu implementations (MenuButton, the inline Analyze menu `Header.tsx:79-95,214-250` without Home/End or focus return, SheetMenu); ~7 popovers each with a copy-pasted outside-click/Escape effect; 23 ad-hoc button classes; no Field, Tooltip (240 native `title=`), Toast or Banner | emil-component-design, emil-forms-and-inputs |
| Feedback | `ui.notify()` (24 call sites) writes into one accent-blue header span that pulses forever (`App.css:222-226`); errors look like successes; some never clear (`useFileOpen.ts:67`) | emil-design-foundations, emil-touch-and-accessibility |
| Banners | restore-banner, pzfx-chooser (inline JSX `App.tsx:120-145`), share-banner, ReproduceStrip, engine-boot-note, grid-note, log-chip: seven bespoke styles | emil-design-foundations, emil-unslop-design |
| Mobile | viewport meta lacks `viewport-fit=cover, interactive-widget=resizes-content`; `100vh` in ~13 places, no `dvh`, no safe-area; 14 px inputs zoom iOS on every grid cell tap (`App.css:340-343`, `404-406`, `562`, `grid.css:116`); no tap-highlight reset; no global `touch-action: manipulation`; 8 unrelated breakpoints; `.nav-more` invisible-but-focusable hover affordance (`App.css:990-996`); grid row ✕ is a ~22 px target (`DataGrid.tsx:513`) | emil-mobile-native, emil-touch-and-accessibility |
| Motion | blanket reduced-motion kill (`App.css:126-132`); segmented thumb animates `width` on keyboard input (`Header.tsx:184`, `App.css:191`); tour ring/card animate top/left/width/height (`guide.css:197-205`); dialog enters but exits instantly, backdrop never fades (`Modal.tsx:22-26`); right-aligned grid menu scales from the wrong corner (`grid.css:21`); drawer 240 ms vs scrim 200 ms (`App.css:1245/1264`); `.status` pulses forever | emil-animations, improve-animations, animate |
| Forms | parameter panels (`ControlsPanel.tsx`, `PreferencesPopover.tsx`, `GraphSettings.tsx`) have no `<form>`, so Enter commits nothing; `autoFocus` with no coarse-pointer gate (`OrganiseDialogs.tsx:38`, `DuplicateFamilyDialog.tsx:28`, `GoToSheet.tsx:35`, `Navigator.tsx:709`); 15 px checkboxes | emil-forms-and-inputs |
| First run | `index.html` has a title only: no description, OG/Twitter image, theme-color; empty `#root` until JS; the real landing is `guide/StartScreen.tsx`, the 30 MB runtime download sits on the path to the first fitted curve | emil-marketing-pages, emil-product-thinking |
| Docs | no DESIGN.md, CLAUDE.md or AGENTS.md; `web/README.md` is the untouched Vite template; the only design record is `docs/ROADMAP.md:135-159` | emil-design-system-docs, emil-unslop-writing |
| Tooling drift | `scripts/verify.sh` hardcodes `ROOT=/home/eren/OpenDose` and `.venv`, neither exists; the repo is `/home/eren/opendose`; `docs/PRODUCT-LEAD-PROMPT.md` and the memory path also use the old name | (setup) |

## 2. Decisions that settle conflicts between skills

The skills disagree in places. These rulings are binding for every agent so
nobody relitigates them mid-run (prep-for-prod Hard Rule 11: respect
documented decisions).

1. **Reduced motion is "gentler, not zero"** (animate, review-animations,
   improve-animations, find-animation-opportunities, apple-design, prep-for-prod
   F-lane) over emil-animations' "disable everything". Replace the blanket
   `0.01ms !important` rule: drop movement and scale, keep opacity and colour
   fades at 150 ms or less, stop loops.
2. **Press scale 0.97**, 160 ms `--ease-out` (current value; animate and
   design-eng). One opt-out mechanism (`data-still` attribute or `.still`
   class) replaces the seven scattered overrides. Grid cells and keyboard-heavy
   toolbars opt out.
3. **Never `ease-in`.** Exits use a short `--ease-out`, 20 to 30% faster than
   the entrance. Add `--ease-drawer: cubic-bezier(0.32,0.72,0,1)`.
4. **Theme switch never animates** (emil-performance, emil-animations,
   design-foundations) over apple-design's eased change: a pre-paint inline
   script sets `data-theme` and `color-scheme`; the toggle wraps the swap in a
   `.no-transitions` class removed after a double rAF; the 300 ms body
   transition goes.
5. **Focus ring:** keep the accent ring only if it measures at least 3:1
   (WCAG non-text) and APCA Lc 30 against every surface in both themes;
   otherwise move to a neutral ink ring (ui-polish). Record the result in the
   design docs.
6. **Elevation:** data separators (grid lines, table rules, input edges) keep
   real borders; floating layers (menus, popovers, dialogs, toasts, cards that
   float) use the emil-surfaces shadow stack; in dark mode those collapse to a
   1 px white ring at 0.09. One depth cue per surface (unslop-design).
7. **Colour space:** tokens move to OKLCH; dark mode inverts the neutral ramp
   and retunes the accent (emil-color + design-foundations). Plotly and the
   PDF/PNG exporters never receive oklch strings: they read resolved values
   from one JS source generated from or checked against the CSS tokens.
8. **Typeface stays Inter.** The distinctive decision unslop-design asks for
   comes from type scale, numerals (`tabular-nums`, `slashed-zero` on data,
   real superscripts in R², x10⁻³), spacing and the data presentation, not a
   font swap.
9. **No new runtime dependencies by default.** No motion library (the skills
   say CSS + WAAPI covers every OpenDose case), no Tailwind, no component
   library. Primitives are built in-house on native `<dialog>`, the Popover API
   where supported, and one shared dismiss/focus hook. Any exception goes
   through pick-ui-library and is justified by bundle size in the report.
10. **Scientific output is not chrome.** Exported figures, the classic graph
    theme, print CSS, results numbers and statistical wording keep their exact
    appearance and meaning unless a change is the point of the task and
    covered by `e2e-figures`/`e2e-export`. The redesign targets the app's
    interface.
11. **Dark `--page` #000** and other Apple-palette choices are reviewed in the
    direction phase (prototype both); whatever wins is documented, not
    silently changed by a fix pass.
12. **Consolidated finding format:** every audit uses one table,
    `| # | Severity | Skill | Location (file:line) | Before | After | Why |`,
    severities BLOCKER / SHOULD / POLISH from prep-for-prod's tree.

## 3. Skill coverage map

Every installed skill and where it enters. "Read" means the agent opens
`~/.claude/skills/<name>/SKILL.md` and every file it references, because
skills with `disable-model-invocation: true` (marked †) cannot be triggered
through the Skill tool; the user can run them as `/name`.

| Skill | Role in this overhaul | Phase |
|---|---|---|
| emil-ask-emil † | Router and sequencing spine: decide → start → build → refine → check; "one or two skills per task, not five" | all |
| emil-product-thinking † | Live interview; Eren can run it before the session. Otherwise the lead answers its four phases from `docs/research/needs/` evidence and writes the verdict | 1 |
| emil-unslop-design | Subtract-first pass (steps 1–2) before any restyle; final audit (steps 4–5) at the end | 1, 7 |
| emil-design-foundations | General lens for hierarchy, IA, button weight, states, copy on every surface | 1, 4 |
| emil-prototype (+ PICKER, CONTROLS, MIX) | 3–5 divergent variants of each undecided high-leverage piece behind a dev-only picker; decision blocks recorded; prototypes deleted | 1 |
| prototype † | Superseded by emil-prototype; use only its inline motion bar | – |
| emil-get-creative † | Optional: seeded generator for the logo, OG image, table-type sketches, plot palette | 1 (optional) |
| emil-build-a-tool † | "Stage" harness: load fixture projects straight into slow-to-reach states (engine booting, failed fit, deep wizard step, 40 columns, long names) for screenshots and review | 0 |
| emil-color | OKLCH tokens, ramps, contrast (APCA + WCAG), dark mode by inversion, single theme source, Plotly exemption | 2 |
| emil-typography | Closed type scale with role names, weights 400/500/600/700, numerals, floors (12 px min, 16 px inputs on touch), truncation with a path to the full text | 2 |
| emil-surfaces | Radius scale with concentric nesting, elevation tokens, hairlines, dark rings, fades via mask-image | 2 |
| emil-ui-polish | z-index scale, hit areas, layout-shift guards, empty states, no flash on refresh, scrollbars | 2, 4 |
| emil-performance | Theme-switch guard, font preload, transition specificity, no per-frame React state, code-split rare heavy UI | 2, 5 |
| emil-component-design | Button, Field, Popover, Menu, Tooltip, Toast, Banner, Dialog APIs (composition, controlled/uncontrolled, closed variant sets) | 3 |
| emil-forms-and-inputs | Labels, `<form>` wrapping, reward-early/punish-late validation, units as suffixes, no autofocus on touch, busy buttons | 3, 4 |
| emil-touch-and-accessibility | 44 px targets with pseudo-element extension, `touch-action`, inert hidden panels, focus return, tooltip warm state, Cmd/Ctrl labels | 3, 4 |
| emil-mobile-native | Viewport meta, dvh, safe areas, 16 px coarse-pointer inputs, tap highlight, overscroll, scroll lock, theme-color | 2, 4 |
| apple-design | Splitters and drags (pointer capture, 1:1), reduced transparency and contrast-more blocks, size-dependent tracking | 4, 5 |
| emil-marketing-pages | StartScreen as landing: metadata, OG image, prerendered static shell in `index.html`, state-aware CTA, font preload | 4 |
| emil-design-system-docs | `docs/design/` folder (≤100-line index + ≤150-line topic files) written from code after phases 2–3, verified by prompting a fresh agent | 3, 7 |
| emil-writing-skills | Review the design docs and the CLAUDE.md trigger section so they change agent behaviour | 7 |
| improve-animations | Read-only motion audit in 8 categories, writes `plans/NNN-*.md` | 5 |
| find-animation-opportunities | Additive, read-only: at most 5–7 opportunities plus rejected list | 5 |
| animate | Executes each motion plan in order: frequency gate → purpose → cheapest tool → curve → interruption → reduced motion | 5 |
| emil-animations (+ patterns, techniques) | Recipe source for animate (respecting the rulings above) | 5 |
| emil-design-eng | Motion philosophy, Before/After/Why review format | 5, 7 |
| review-animations † | Strict motion review of the phase-5 diff; lead follows STANDARDS.md manually, Eren can run `/review-animations` | 5 |
| emil-ask-lapse | Slow-mo takes and take diffs to verify motion, only if `AIFORUI_TOKEN` is set (private registry); otherwise Playwright `getAnimations()` + CDP `Animation.setPlaybackRate` + `emulateMedia({reducedMotion})` | 5 |
| animation-vocabulary, emil-design-vocabulary, emil-engineering-vocabulary | Precise wording in every brief and finding (light dismiss, roving tabindex, origin-aware, live region…) | all |
| emil-unslop-writing | UI microcopy, empty/error copy, README, web/README, docs prose; no em dashes in OpenDose prose | 6 |
| emil-unslop-code | Pass over every agent diff before merge | 6, every merge |
| emil-ui-review | Craft gate on each surface PR (Blocked / Approve with changes / Ship it) | 4, 7 |
| emil-prep-for-prod (9 lanes) | Phase 0 in `audit` mode as the defect baseline; phase 7 in fix mode as the ship bar | 0, 7 |
| pick-ui-library † | Consulted before any dependency is proposed; default answer is no | 3 |
| emil-borrow-a-brain † | Out of scope (builds persona skills from a public corpus; no UI value here) | – |

## 4. Phases

Each phase lists its gate. The lead does not start a phase until the
previous gate passes.

### Phase 0: setup and baseline (lead + 4–6 read-only agents)
- Fix tooling drift: `scripts/verify.sh` derives ROOT from its own location;
  create `.venv` with the CI's engine deps; fix the old path in
  `docs/PRODUCT-LEAD-PROMPT.md`.
- Extend `web/scripts/smoke-0.4.0.mjs` (or a sibling `ui-shots.mjs`) into the
  stage harness: fixture projects for worst-case content and every hard state,
  screenshots at 1400×900 and 390×844, light and dark, reduced motion on and
  off, axe-core. Save the baseline set outside git (`.design/baseline/`,
  gitignored) for before/after comparison.
- Audits, read-only, in parallel: prep-for-prod `audit` with its four
  prescribed lane agents (A+D, B+E+F, C, G+H+I); emil-ui-review per surface
  (shell, grid, results, graphs, first run, guided flows); improve-animations
  audit; find-animation-opportunities.
- Lead vets every finding at its file:line and writes `docs/design/AUDIT.md`
  in the consolidated format.
- Gate: AUDIT.md exists, baseline screenshots exist, verify.sh runs green on
  main.

### Phase 1: direction (lead + prototype agents)
- Product frame: emil-product-thinking verdict (from Eren's interview if he
  ran it, else from the needs research): the one good idea, step count from
  landing to first fitted curve, the promise to make extreme.
- unslop-design subtract pass: list everything to delete (repeated captions,
  decorative icons, double depth cues, redundant dividers) before restyling.
- emil-prototype runs, one piece each, worst-case content mandatory, real
  tokens and Inter: (a) first run / StartScreen + engine boot, (b) header and
  toolbar density, (c) results sheet layout and hierarchy, (d) feedback
  pattern (toast vs inline vs status), (e) surface treatment incl. dark page
  colour and focus ring. Optional (f) navigator.
- Lead picks each winner from the variant/axis/when-it-wins/cost table and
  writes decision blocks to `docs/design/DECISIONS.md`, including what was
  rejected and why. Prototype code is deleted.
- Gate: DECISIONS.md complete; screenshots of winners saved.

### Phase 2: foundations (one agent, then a token-adoption fan-out)
- One agent owns the token layer: split `App.css` into `web/src/styles/`
  (`tokens.css`, `base.css`, `layout.css`, then feature files next to their
  components); OKLCH colour ramps with semantic roles; dark mode from one
  definition (`light-dark()` with `color-scheme`, or one generated block,
  never two hand copies); spacing, type, radius, elevation, z-index, duration
  and easing scales; global baseline from prep-for-prod `baseline.md`
  (viewport meta, theme-color per scheme, color-scheme, font preload,
  smoothing, `font-synthesis: none`, tap highlight, `touch-action`,
  coarse-pointer 16 px inputs, dvh); pre-paint theme script; theme-switch
  guard; Plotly chrome colours from one source with a unit test that fails on
  drift.
- Then 4–6 agents adopt tokens by territory (no visual redesign yet: map
  every literal to the nearest token, collapse 22 font sizes to the scale).
- Gate: hardcoded colour/size/z-index counts near zero outside the token
  layer (script it); screenshots match baseline except intended changes;
  verify green.

### Phase 3: primitives (one or two agents)
- emil-component-design + forms + touch-a11y: `Button` (closed variant set:
  primary, secondary, ghost, danger, icon; sizes), `Field`/`NumberField`
  (label association, `inputmode`, unit suffix, `aria-invalid` +
  `aria-describedby`, reward-early/punish-late), `Popover` (one dismiss +
  Escape + focus-return hook, origin-aware transform), `Menu` (MenuButton
  absorbs the Analyze menu and SheetMenu), `Tooltip` (delay + warm state, for
  icon buttons; plain `title` stays elsewhere), `Toast` (live region, success
  vs error, duration by word count, safe-area aware) replacing the header
  status span, `Banner` replacing the seven bespoke strips, `Dialog`
  (compound parts, exit animation, backdrop fade, scroll lock, autofocus only
  on fine pointers).
- Draft `docs/design/` with emil-design-system-docs now, so phase 4 agents
  build against it. Add a short `CLAUDE.md` design section that points to it.
- Gate: primitives used by at least one real call site each; e2e green.

### Phase 4: surface redesign (up to six worktree agents in parallel)
Territories (each agent's loadout: design-foundations + the listed skills,
gated by emil-ui-review on its own diff before hand-back):
- **A. Shell:** Header, Navigator, FamilyWorkspace, nav drawer, splitters.
  ui-polish, touch-a11y, mobile-native, apple-design (drags).
- **B. Data grid and import:** `sheets/common/`, table sheets, paste and
  import dialogs. forms-and-inputs, performance, typography (numerals),
  mobile-native.
- **C. Results and report:** `ResultsPanel`, `StatsResults`, `report/`,
  methods, checklists. typography, design-foundations hierarchy, ui-polish
  empty/error states.
- **D. Graphs and layouts:** `graph/`, `layout/`, `export/`, plot panels and
  dialogs (chrome only, see ruling 10). surfaces, forms-and-inputs.
- **E. First run:** `guide/StartScreen`, `WelcomePanel`, engine boot,
  `index.html` metadata, OG image, prerendered shell. marketing-pages,
  unslop-writing.
- **F. Guided flows:** `guide/` wizards and tour, `sheets/assays/` wizard,
  `power/`, `share/` dialogs. forms-and-inputs, design-foundations (stepper,
  one primary action), touch-a11y.
- Gate: every territory merged; prep-for-prod lanes A, C, D, E clean on its
  files; screenshot diff reviewed by the lead surface by surface.

### Phase 5: motion (one agent, sequential)
- improve-animations plans (from phase 0, refreshed against the new code) +
  find-animation-opportunities picks → animate executes plan by plan.
- Known items: reduced-motion policy (ruling 1), segmented thumb (no width,
  no animation on keyboard), tour ring/card on transforms, dialog exit +
  backdrop, origin-aware menus incl. clamped positions, drawer/scrim pairing on
  `--ease-drawer`, `.status` pulse removed with the toast, popover exits about
  150 ms, `.still` opt-out.
- Verify with Lapse if available, else the Playwright fallback; then the
  review-animations STANDARDS pass with a Block/Approve verdict.
- Gate: Approve.

### Phase 6: words and code hygiene (two agents)
- emil-unslop-writing on every user-visible string touched by phases 1–5,
  empty and error states (specific, actionable), README, `web/README.md`
  (replace the Vite template), design docs. Statistical meaning unchanged.
- emil-unslop-code on the cumulative diff since 177053f.
- Gate: e2e green (role names in scripts updated where copy changed).

### Phase 7: ship bar (lead + agents)
- emil-prep-for-prod in fix mode, all nine lanes, four agents as prescribed,
  fixes applied centrally by file.
- emil-ui-review final pass per surface; unslop-design final audit (name the
  one choice a competitor could not copy-paste).
- Finalise `docs/design/` and verify it by prompting a fresh agent to build a
  small real screen (e.g. a new dialog) and reading the drift; fix the docs,
  not the output. emil-writing-skills review of the CLAUDE.md section.
- Full `scripts/verify.sh`; after-screenshots next to baseline; ROADMAP
  updated.
- Gate: prep-for-prod verdict "Ship".

## 5. Success measures
- prep-for-prod verdict moves from "Not yet" to "Ship" with zero BLOCKERs.
- axe-core: zero violations on every smoke scene, both themes, both widths.
- Token adoption: hardcoded colours outside the token layer ≤ 5 (each
  justified), font sizes ≤ 8 distinct, z-index values only from the scale,
  radius values only from the scale.
- One implementation each of dialog, menu, popover, toast, banner, button,
  field.
- Mobile: no input under 16 px on coarse pointers, no `100vh`, every tap
  target ≥ 44 px or extended, safe areas honoured.
- Theme: no flash on reload with a forced theme; no tween on toggle.
- Motion: review-animations Approve; nothing animates on keyboard actions.
- Step count from landing to first fitted curve reduced (measured in phase 1,
  re-measured at the end).
- All existing e2e suites, unit tests, lint and engine tests pass.
