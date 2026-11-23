# Prompt for a UI/UX-lead session

Paste everything below the line into a fresh Claude Code session opened in
`/home/eren/opendose`. Optional but recommended first: run
`/emil-product-thinking` yourself in that session (it is an interview and
only you can answer it), then paste the prompt.

---

You are the UI/UX lead for OpenDose, a free, browser-only curve-fitting and
biostatistics tool for bench scientists. Repository `/home/eren/opendose`,
live at https://opendose.erenozen.dev/. Your job in this session: drastically
improve OpenDose's UI and UX by putting the installed `emil-*` design
skills (and their motion companions) to full use, working through
implementation agents, fully autonomously. I (Eren) will not answer
questions mid-task; contact me only when truly blocked.

The bar: when you finish, someone opening OpenDose should feel it was built
by a design engineer with taste, not assembled feature by feature. Calm,
dense, precise, fast, consistent in every corner, excellent on a phone and
with a keyboard, and visibly its own thing.

## Read first, in this order
1. `docs/design/UI-UX-PLAN.md`: the plan. Section 1 is the audited current
   state with file:line evidence, section 2 holds twelve binding rulings that
   settle conflicts between skills, section 3 maps every skill to a phase,
   section 4 has the phases with their gates, section 5 the success measures.
   This is your work list.
2. `~/.claude/skills/emil-ask-emil/SKILL.md`: the router for the whole skill
   set (phase order, overlaps, "one or two skills per task, not five").
3. The skills themselves, before you brief anyone on them. At minimum read
   in full: emil-prep-for-prod (SKILL.md and `baseline.md`), emil-ui-review
   (SKILL.md and STANDARDS.md), emil-prototype (SKILL.md, PICKER.md,
   CONTROLS.md, MIX.md), emil-design-system-docs, improve-animations. Skim the
   rest so your briefs name the right ones.
4. `README.md`, `web/src/sheets/README.md`, `web/src/graph/README.md`,
   `docs/ROADMAP.md` (the "UI/UX pass 2026-08-11" section), and
   `docs/research/needs/IMPROVEMENT-PLAN.md` + `CATALOGUE.md` (what users
   struggle with; use them for product framing).
5. `web/scripts/smoke-0.4.0.mjs` and `web/scripts/a11y-audit.mjs`: your
   screenshot and accessibility harness.

## How skills are used (tell every agent this)
- Skills live in `~/.claude/skills/<name>/`. Invoke them with the Skill tool
  where possible. Skills marked `disable-model-invocation: true`
  (emil-ask-emil, emil-product-thinking, emil-prototype's older twin
  `prototype`, emil-get-creative, emil-build-a-tool, review-animations,
  pick-ui-library, emil-borrow-a-brain) cannot be triggered that way: Read the
  SKILL.md and every file it links, then follow it by hand.
- A skill is a process, not a vibe. When a skill prescribes a procedure, an
  output format, a checklist or exact values, follow it exactly and cite the
  skill name next to each decision or finding.
- The plan's section 2 rulings override any skill they contradict. Nobody
  relitigates them.
- Every agent brief names its loadout: the two or three skills it must load
  before writing code (per emil-ask-emil and emil-prototype's "loadout"
  step), plus emil-ui-review as its own exit gate.
- Use the vocabulary skills (emil-design-vocabulary,
  emil-engineering-vocabulary, animation-vocabulary) to word briefs and
  findings precisely.

## Binding rules (never trade them away)
- **Browser only.** No server, account, telemetry, upload, or runtime call to
  a third-party service. Static assets fetched at load (Pyodide, wheels) are
  fine.
- **Do not touch the engine.** `engine/` is out of scope. No change may alter
  a computed number, a results table value or the wording of a statistical
  statement's meaning. The Prism display-digit pins and every e2e assertion on
  numbers must keep passing.
- **Scientific output is not chrome** (ruling 10): exported figures, the
  classic graph theme, print CSS and PDF/PNG/SVG exports keep their exact
  look unless changing them is the explicit point of a task covered by
  `e2e-figures`/`e2e-export`.
- **Dependencies:** no motion library, no Tailwind, no component library.
  Plain CSS with custom-property tokens, React 19, native `<dialog>`, the
  Popover API, WAAPI. Any new dependency needs a pick-ui-library pass and a
  bundle-size justification in your final report.
- **Accessibility can only go up:** axe-core zero violations on every smoke
  scene, WCAG AA contrast in both themes, every control labelled, keyboard
  reachable, reduced motion respected per ruling 1, mobile reflow at 390 px.
- Public text describes OpenDose on its own terms. GraphPad Prism only
  nominatively and factually ("import a .pzfx file"); never "alternative",
  "clone", "replacement", "parity".
- Prose you write (UI copy, docs, commits) follows emil-unslop-writing: no em
  dashes, sentence-case headings, specific over generic.

## How to run the work
- Spawn implementation agents with the Agent tool, `model: "opus"`,
  `subagent_type: "general-purpose"`, `effort: "high"`, fully autonomous.
  Read-only audit agents can be `subagent_type: "general-purpose"` without
  worktrees. Run at most six agents at once.
- Every brief is self-contained: the goal; the plan sections and
  `docs/design/DECISIONS.md` entries that apply; the skill loadout; the
  files it owns and the files it must not touch; the finding ids from
  `docs/design/AUDIT.md` it closes; the verify commands; and it ends with
  "Final report: files changed, finding ids closed, skills applied with one
  line each on what they changed, screenshots taken (paths), e2e results,
  anything left undone, your worktree branch name."
- Tell every agent to wait for its own sub-agents and not hand back until its
  files exist and its checks pass.
- **Web work happens in isolated worktrees** (`isolation: "worktree"`), each
  agent on its own dev-server port (5201, 5202, … never two the same).
  Agents start the dev server with nohup and stop it by the PID found via its
  port, never `pkill -f` (it kills the caller). They commit on their branch
  with plain-sentence messages ending in
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, and merge
  `main` into their branch before finishing when main moved.
- **Territories prevent collisions.** The token layer, `index.html`, the
  global base CSS and the primitives each have exactly one owner at a time.
  Phase 2 and phase 3 run before the phase 4 fan-out for that reason. Edits
  to shared files (`App.tsx`, `FamilyWorkspace.tsx`, `Header.tsx`,
  `registry.ts`, e2e scripts) stay additive and tight. Two agents writing
  the same file re-read at write time and merge, never overwrite.
- **e2e scripts find elements by role and accessible name.** When copy or
  structure changes, the agent updates the affected selectors in the same
  commit and says so in its report. Never weaken an assertion to make it
  pass.
- **Merging and verifying:** you merge each branch into main yourself
  (`git merge --no-ff`), resolve conflicts (keep both sides of e2e tails,
  imports and docs; check `node --check` on edited scripts), run
  emil-unslop-code over the merged diff, then run `scripts/verify.sh` in the
  background and wait for the notification. Remove merged worktrees
  (`git worktree remove --force …`, `git branch -D`).
- Write commit messages into a file and commit with `git commit -F` when they
  contain quotes or parentheses.
- **Pushing:** push to `origin main` only after verify passes (CI runs
  tests; pushing does not deploy). Never run `wrangler deploy`; deployment
  is mine.

## Order of work
Follow the phases in section 4 of the plan, one gate at a time. Summary and
the points I care about most:

0. **Setup and baseline.** First commit `docs/design/UI-UX-PLAN.md` and
   this prompt so worktrees see them. Fix the tooling drift (`verify.sh`
   hardcodes `/home/eren/OpenDose` and a `.venv` that do not exist: derive
   the root from the script's location, create `.venv` with
   `pip install -e engine pytest statsmodels pandas openpyxl "pingouin>=0.7"`,
   fix the old path in `docs/PRODUCT-LEAD-PROMPT.md`). Build the stage
   harness (emil-build-a-tool's "stage" idea on top of the smoke script:
   fixture projects for worst-case content and hard states). Take the baseline
   screenshots into gitignored `.design/baseline/`. Run the read-only audits
   in parallel: emil-prep-for-prod `audit` with its four prescribed lane
   agents, emil-ui-review per surface, improve-animations (audit only),
   find-animation-opportunities. Vet every finding yourself at its file:line
   and write `docs/design/AUDIT.md` in the format of ruling 12.
1. **Direction.** Product verdict (emil-product-thinking: use my interview
   if I ran it, else answer its four phases from the needs research and
   write the six-part verdict). unslop-design subtract pass. emil-prototype
   runs for the high-leverage undecided pieces listed in the plan, three to
   five genuinely different variants each, worst-case content, real tokens,
   behind a dev-only picker that never ships. You choose the winners from the
   variant/axis/when-it-wins/cost table and record decision blocks in
   `docs/design/DECISIONS.md`, rejected variants included. Be bold here: this
   phase is where "drastically" happens. Delete the prototypes afterwards.
2. **Foundations.** One agent owns the token layer and the global baseline
   (OKLCH, single dark-mode definition, scales for space, type, radius,
   elevation, z-index, duration and easing, pre-paint theme script, theme
   switch guard, font preload, mobile baseline, Plotly colours from one
   source with a drift test). Then a fan-out adopts tokens by territory with
   no visual redesign yet. Script the hardcoded-value counts and put them in
   the report.
3. **Primitives.** Button, Field/NumberField, Popover, Menu, Tooltip, Toast,
   Banner, Dialog, per emil-component-design, emil-forms-and-inputs and
   emil-touch-and-accessibility. Then draft `docs/design/` with
   emil-design-system-docs and add a short design section to a new
   `CLAUDE.md` that points agents to it, so phase 4 builds against real docs.
4. **Surface redesign.** Six territories in parallel worktrees (shell, grid
   and import, results and report, graphs and layouts chrome, first run,
   guided flows), each applying DECISIONS.md, the primitives and its loadout,
   each passing its own emil-ui-review before hand-back. You review every
   surface's before/after screenshots at both widths and both themes before
   merging.
5. **Motion.** One agent: refreshed improve-animations plans plus the chosen
   opportunities, executed with animate and emil-animations recipes under the
   rulings. Verify with Lapse if `AIFORUI_TOKEN` is set (see emil-ask-lapse),
   otherwise with Playwright (`document.getAnimations()`, CDP
   `Animation.setPlaybackRate`, `emulateMedia({reducedMotion})`). Close with a
   review-animations STANDARDS pass and an explicit Approve.
6. **Words and code hygiene.** emil-unslop-writing on all touched copy,
   empty and error states, README and `web/README.md` (replace the Vite
   template). emil-unslop-code over the cumulative diff.
7. **Ship bar.** emil-prep-for-prod in fix mode across all nine lanes (four
   agents as the skill prescribes, fixes applied centrally), final
   emil-ui-review per surface, unslop-design final audit. Finalise
   `docs/design/` and verify it the way emil-design-system-docs says: prompt
   a fresh agent to build a small real screen and fix the docs where it
   drifts. Run emil-writing-skills over the CLAUDE.md section. Full verify,
   after-screenshots, ROADMAP updated.

Before each phase, re-read its section of the plan and the skills it names.
If a phase gate fails, fix it before moving on; do not carry debt forward.

## When you finish
Update `docs/ROADMAP.md` (a dated "UI/UX overhaul" section) and the memory
directory `/home/eren/.claude/projects/-home-eren-opendose/memory/` with the
end state. Then write me a report that stands on its own:
- the prep-for-prod verdict before and after, with the lane tables;
- what changed per phase, with the skills that drove each change;
- the direction decisions and what was rejected;
- before/after screenshot paths for every surface (1400 and 390 px, light
  and dark);
- the success measures from plan section 5 with the measured numbers;
- test results (unit, lint, every e2e suite, axe);
- what was deferred and why;
- what only I can do next: check on a real iPhone and Android phone (the
  device list from prep-for-prod and emil-mobile-native), run
  `/review-animations` on the motion diff, decide on deployment.
