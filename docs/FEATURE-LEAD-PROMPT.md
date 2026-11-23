# Prompt for a feature-lead session

Paste everything below the line into a fresh Claude Code session opened in
`/home/eren/opendose`.

---

You are the feature lead for OpenDose, a free, browser-only curve-fitting and
biostatistics tool for bench scientists. Repository `/home/eren/opendose`,
live at https://opendose.erenozen.dev/. Your job in this session: implement
every feature in `docs/research/features/FEATURE-PLAN.md`, wave by wave,
through implementation agents, fully autonomously, without breaking the
finished UI/UX system or any validated number. I (Eren) will not answer
questions mid-task; contact me only when truly blocked.

This is a scientific instrument. A wrong number, a silently dropped value or
an overconfident sentence is worse than a missing feature. Every feature
ships with tests that would catch it being wrong.

## Read first, in this order
1. `docs/research/features/FEATURE-PLAN.md`: the work list. Each feature
   (P-nn) has its sources, an acceptance test, a validation reference, the
   engine work, its UI home, its territory and its effort. Wave 0 is
   correctness and data safety and goes first.
2. `CLAUDE.md`, then `docs/design/README.md` and every topic file it
   indexes (tokens, buttons, forms, overlays, feedback, motion,
   layout-and-surfaces, content). These are binding rules for every
   visible change. `docs/design/DECISIONS.md` holds the direction
   decisions; nobody reopens them.
3. `docs/design/UI-UX-PLAN.md` section 2: twelve rulings. Ruling 10
   ("scientific output is not chrome") is the one features touch most.
4. `README.md` (Features, Develop), `web/README.md` (every script and suite),
   `web/src/sheets/README.md`, `web/src/graph/README.md`,
   `engine/opendose/api.py` (handler docstrings), `docs/prism-validation.md`
   and `docs/validation/results-engine.md`: how numbers are validated today.
5. `docs/ROADMAP.md`: what exists. `docs/research/needs/` for the user
   evidence behind each need id.

## Binding rules (never trade them away)
- **Browser only.** All computation runs in the user's browser: the Python
  engine (`engine/opendose`, numpy + scipy at runtime) in Pyodide inside a
  Web Worker. No server, account, telemetry, upload or runtime call to a
  third-party service. Static assets fetched at load (Pyodide, wheels) are
  fine. statsmodels and pandas are in the Pyodide lock but NOT shipped:
  adding a runtime package grows the 30 MB first visit (the product's
  biggest risk, DECISIONS section 0); do it only with a measured size and
  boot-time justification in your report. If a feature cannot work in the
  browser, do not build it: list it under "Skipped: breaks browser-only" in
  the ROADMAP with one sentence why.
- **The engine is the single source of truth for every number.** Existing
  pinned results stay bit-identical; the Prism display-digit pins
  (`engine/tests/test_prism_parity.py`) and every e2e assertion on a number
  keep passing. Every new module cites the published method it implements.
- **Ruling 10.** Exported figures, the classic graph theme, the pinned export
  chrome in `web/src/lib/chrome.ts`, print CSS and every results number keep
  their exact look and meaning unless changing them is the feature, and then
  e2e-figures / e2e-export / e2e-tiff cover the change.
- **The UI/UX system is finished; extend it, never fork it.** Use the
  primitives in `web/src/components/ui/` and the semantic tokens in
  `web/src/styles/tokens.css` only. Never a raw colour, size, z-index or
  duration, a new button variant, a hand-rolled dialog, menu, popover, toast
  or banner. New results follow DECISIONS section 3 (answer headline via a
  key-facts mapper where one applies, the Checks row for guidance, the
  typeset table); new commands go into `web/src/app/commandRegistry.ts` so
  the File/View menus and the Cmd+K palette find them; new grid actions go
  under the grid toolbar's More menu (DECISIONS 5); feedback uses notify()
  toasts and the Banner primitive (DECISIONS 6). If a feature needs a
  component that does not exist, build it in `web/src/components/ui/`
  following emil-component-design and document it in the matching
  `docs/design/` topic file (files stay under 150 lines).
- **Data-model changes.** The features the plan flags "data-model change"
  are approved for this session (this overrides CLAUDE.md rule 4 for those
  P-ids only), on three conditions: a migration that opens every older
  project file and share link unchanged, a unit test that loads a project
  saved before the change, and a `.pzfx` round trip that still passes.
  Any other change to `web/src/project/types.ts` or the saved file still
  needs a line in your report saying why.
- **Figure changes on purpose.** P-02, P-03, P-04 and P-24 change exported
  figures by design (fonts embedded, box-plot definition). Their
  e2e-figures / e2e-export / e2e-tiff pins are updated in the same commit,
  with the before and after values in the commit message; every other
  figure pin stays exact.
- **Statistical honesty.** Every rule a feature encodes in a chip, banner,
  explainer or methods sentence cites its source in the UI (a GraphPad guide
  page, a named paper, a journal checklist). Caveats sit next to the number
  (small n, ambiguous fit, extrapolation, a test that cannot reach P < alpha).
  The plan's "Do not build" list and the needs plan's "do not build" items
  are binding.
- **Copy:** emil-unslop-writing and `docs/design/content.md` (sentence case,
  no em dashes, specific errors with a next step). GraphPad Prism only
  nominatively ("import a .pzfx file"); never "alternative", "clone",
  "replacement", "parity".

## Testing standard (every feature, no exceptions)
A feature is done only when all of these exist and pass:
1. **Engine correctness** (any new or changed computation): pytest tests in
   `engine/tests/` against an independent implementation. Use statsmodels,
   pingouin and scipy in `.venv` (installed: statsmodels 0.15, pingouin 0.7,
   scipy 1.18; R is NOT installed), or a published worked example with its
   reported values and a citation (paper, table, page) in the test. Commit
   the script that produced every reference value next to the test, so
   anyone can regenerate it. Pin at display precision where BLAS builds
   differ. The plan carries no pinned numbers on purpose ("pin from
   reference output before merging"): every pinned value comes from a
   reference you actually ran or a published table you cite. A value you
   could not obtain that way is not pinned; say so in the report.
2. **Edge cases**, each with a test and a clear user-facing message (never a
   silent NaN, never a crash): n = 0, 1, 2; all values equal; ties; missing
   values; one group; extreme magnitudes (1e-12, 1e12); perfect separation;
   non-convergence; unit changes (results scale or stay invariant as the
   maths says).
3. **Invariance or property checks** where the maths gives one: permuting
   group order, scaling units, swapping X and Y where symmetric,
   back-transform round trips.
4. **Web unit tests** (`npm run test:unit`) for every new pure function
   (parsing, mapping, formatting, key-facts mappers).
5. **End-to-end**: a step in the right e2e suite (or a new suite added to
   `scripts/verify.sh`) that drives the feature by role and accessible name
   and asserts the numbers it displays against the engine test's reference
   values, plus the plan's acceptance test as written.
6. **Visual and accessibility**: a ui-stage scene for every new surface
   (`web/scripts/ui-stage.mjs`, at 1400 and 390 px, light and dark), looked
   at; axe 0 violations; `node scripts/design-counts.mjs` no count above
   main's; figure features also in e2e-figures / e2e-export / e2e-tiff.
7. **Independent check before merge** for every engine feature: a second
   agent that did not write the code recomputes two or three reported values
   from the published method (by hand derivation or a different library)
   and confirms the engine and the UI show them. Record the check in the
   feature's validation note.
8. **Validation record**: add the feature's references and results to
   `docs/validation/results-engine.md` (or a dated section) so the
   validation story stays complete.
Never weaken an assertion to make a test pass. When copy or structure
changes, update the selector in the same commit and say so.

## How to run the work
- Spawn implementation agents with the Agent tool, `model: "opus"`,
  `subagent_type: "general-purpose"`, `effort: "high"`, fully autonomous.
  Each brief is self-contained: the P-ids, the acceptance tests and
  validation references verbatim from the plan, the loadout skills, the
  files it owns and must not touch, the testing standard above, the verify
  commands, and it ends with "Final report: files changed, P-ids closed,
  tests added (engine / unit / e2e / ui-stage) with the reference values
  asserted, the independent check, screenshots taken (paths), anything left
  undone, your worktree branch name."
- **Loadouts** (load before code, per emil-ask-emil: two or three skills):
  engine work: none of the UI skills, but read the cited method papers;
  results UI: emil-typography + emil-design-foundations; forms and dialogs:
  emil-forms-and-inputs + emil-component-design; graphs and export:
  emil-surfaces + emil-forms-and-inputs; mobile-facing changes:
  emil-touch-and-accessibility + emil-mobile-native. Every web agent ends
  with emil-ui-review on its own diff and fixes Blocking and Should-fix.
- **Worktrees.** Every agent works in an isolated worktree
  (`isolation: "worktree"`). Worktrees are created from origin/main, which
  can lag local main: every brief starts with `git merge --no-edit main`.
  Each agent gets its own dev-server port (5301, 5302, ... never two the
  same); dev servers start with nohup and stop by the PID from
  `lsof -ti tcp:<port>`, never `pkill -f`.
- **Memory.** The machine has about 15 GB RAM. Run at most three agents
  with dev servers or browsers at once (two crashes in the last session
  came from memory pressure). Tell agents: e2e suites one at a time,
  `--jobs=1` for ui-stage, close browsers after use, commit a checkpoint at
  least every hour.
- **Territories** (from the plan's Territory column): engine, grid-import,
  results, graphs-export, guided, shell-project. One owner per territory at
  a time. Shared files (`FamilyWorkspace.tsx`, `App.tsx`, `Header.tsx`,
  `commandRegistry.ts`, `registry.ts`, `api.py`, the e2e scripts,
  `ui/index.ts`) get additive, tight edits; re-read before writing; never
  overwrite another agent's work.
- **Merging.** You merge each branch yourself (`git merge --no-ff`),
  resolve conflicts (keep both sides of e2e tails, imports, docs, ROADMAP;
  `node --check` edited scripts), review the agent's screenshots at both
  widths and both themes, then run `scripts/verify.sh` in the background and
  wait for its notification. Do not chain `git worktree remove` / `branch -D`
  after a merge with `;`: if the merge conflicts, the branch is deleted
  before you resolve it (use `&&`).
- **Flaky checks.** A few e2e timing checks are sensitive to machine load.
  Re-run the suite alone before concluding; if a check fails twice alone it
  is real. A check that keeps flaking gets made deterministic (wait for the
  state, not a fixed delay), never loosened.
- **Pushing and deploying.** Push to `origin main` only after verify passes.
  Pushing does NOT deploy. Deployment (`wrangler deploy`) is mine; never run
  it. Before pushing, `git fetch` and merge any new upstream commits
  (another session may push product work), bring their UI onto the design
  system, and re-verify.
- Write commit messages into a file and use `git commit -F` when they
  contain quotes or parentheses; end them with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Order of work
1. **Wave 0, correctness and data safety.** All of it, before any new
   feature: these are places where today's app can lose work or mislead.
2. **Wave 1, quick wins (S).** Group by territory, about one agent per
   territory, engine first where a web item needs engine support.
3. **Wave 2, medium builds (M)**, engine first, then the web packages.
4. **Wave 3, large builds (L)**, one at a time per territory.
5. **Integration pass.** One agent: a full ui-stage run of every scene
   (55+ plus the new ones) at both widths and both themes, axe 0, every new
   entry point reachable from the menus and the palette, duplicates between
   packages removed, README Features and ROADMAP updated (tick each P-id;
   "Skipped: breaks browser-only" and "Deferred" lists with reasons),
   emil-unslop-code over the cumulative diff, emil-unslop-writing over all
   new copy.
6. **Re-validate.** `engine/tests/test_reference_corpus.py` and the
   validation records: no published reference value that passed before may
   fail now; record the new counts under a dated heading in
   `docs/validation/results-engine.md`.

Before each wave: re-read its features in the plan, confirm each is still
missing at HEAD (another session may have shipped it), and list the skipped
ones with reasons in the ROADMAP before launching agents. A wave's gate is
verify.sh green on main with every feature's tests in place.

## When you finish
Update `docs/ROADMAP.md` (a dated "Feature plan" section ticking each P-id)
and the memory directory `/home/eren/.claude/projects/-home-eren-opendose/memory/`
with the end state. Then write me a report that stands on its own: what
shipped per wave with the P-ids and need ids; for each engine feature the
independent reference and the asserted values; what was skipped as breaking
browser-only and why; what was deferred; the final test counts (engine,
unit, every e2e suite, ui-stage axe); and what only I can do next (try it
with my own data, check on a phone, decide on deployment).
