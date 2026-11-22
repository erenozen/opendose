# Design decisions

Every direction decision of the 2026-11 UI/UX overhaul, with what was
rejected and why. Agents read this before changing a surface; nobody
reopens a decision here without new evidence (emil-prep-for-prod hard
rule 11). Rulings that settle conflicts between skills live in
`UI-UX-PLAN.md` section 2 and are not repeated here.

## 0. Product verdict

Written by the lead from `docs/research/needs/` (3,666 observations, 178
needs) following emil-product-thinking's verdict format, because no
interview was run before the session.

1. **The one good idea.** Paste the numbers a bench experiment produced and
   get the right fit or test, with its caveats stated plainly, in a browser
   tab, free, with nothing to install or license (needs `ic50-no-code-fit`
   rank 6, `no-code-approachable` 9, `design-first-test-chooser` 1,
   `free-access` 5, `runs-anywhere` 18).
2. **The chain of must-be-trues.**
   1. **(under test now)** A scientist with data on the clipboard sees a
      fitted curve or a test result within one screen and a few actions of
      landing, before deciding to leave.
   2. They trust it: the number agrees with what they know, and the caveats
      (small n, ambiguous fit, extrapolation) are visible next to it.
   3. The figure and the methods sentence are good enough to drop into a lab
      meeting or a paper without redoing them elsewhere.
   4. They come back, and they send it to a colleague (project file, share
      link, `.pzfx` round trip).
3. **Biggest unanswered risk.** The 30 MB runtime download sits between
   paste and result on a first visit, and the result then lands below the
   fold (audit RS-01: first results card at y = 944 in a 900 px window).
   Cheapest test: stage a cold start on a throttled connection, count the
   actions and seconds from landing to a visible fitted curve, and compare
   with the redesigned path.
4. **This month.** Executed at 100%: the path from landing to the first
   result (start screen, paste, engine boot, the results sheet's top
   screen) and the feedback that tells a user what just happened. Half
   built on purpose: rare dialogs, layout sheets, assay wizard internals and
   the navigator's long tail get tokens, primitives and accessibility fixes
   but no new design.
5. **Principles the product currently violates.**
   - 6 (count the steps): the start screen offers five entry routes and eight
     table cards before the first result; the result itself is below the
     fold.
   - 9 (do less, remove the switch): seven banner styles, three menu
     implementations and 23 button classes are seven ways of saying one
     thing.
   - 12 (design the system, not the mockup): no screen was reviewed with
     80-character names, 40 columns or a failed fit before this pass.
   - 18 (quality from irrational investments): the first thing a phone user
     meets is an input that zooms the page and a header that jumps.
6. **What this did not resolve.** No named user was interviewed, so the
   person in link 1 is a composite. Whether phones are used to analyse or
   only to read shared results is unknown; this pass treats the phone as a
   reading and light-editing device and keeps desktop the place for
   analysis.

**Step count, landing to first fitted curve (baseline, measured in the
code at 177053f):** paste route = focus the paste box, paste, press
"Create XY table" (3 actions), wait for the engine, scroll to the results
card (1 more action at 1400 x 900). Four actions plus the cold-start wait.

## 1. Subtract pass (emil-unslop-design steps 1 and 2)

Squint test on the baseline (`.design/baseline/`): apart from the logo and
the data, nothing ties the screens to OpenDose; the look is a generic
system palette with pill buttons. Walked every element and asked "what
breaks if this is gone?". Deleted or merged in phase 4 unless a decision
below keeps it:

- **Duplicate navigation.** Results and graph sheets are listed twice in the
  navigator: nested under their table and again in RESULTS / GRAPHS
  sections. Keep one (the family tree).
- **Instruction captions that restate the UI.** "Paste directly from Excel;
  tab-separated blocks expand automatically." under every grid; the
  DATA INSPECTOR card whose resting content is only "Click a cell to
  summarize…"; the Prism section's three-line explanation on the start
  screen. Replace with an empty state that appears only when it helps.
- **Uppercase micro-labels everywhere** (DATA INSPECTOR, MODEL, CONSTRAIN
  (HOLD CONSTANT), ERROR BARS, ADVANCED: WEIGHTING, OUTLIERS, BANDS…, DATA
  TABLES, INFO, RESULTS). Sentence-case section labels at one size.
- **Native resize corners on every card** (GR-12). Splitters already resize.
- **Pill shape on every button** (radius 980px) and four circular icon
  buttons in a row in the header (info, theme, help, preferences): theme and
  info move into one menu; pills give way to the radius scale.
- **Ten grid toolbar buttons wrapping to three rows** (Import, Export, Sort,
  Insert series, Rows, Columns, Format, Convert, Convert table to, Reshape),
  and on phones they come before the data. Keep the frequent four, the rest
  behind one "More" menu (GR-11).
- **Competing tinted callouts** in the results column (unit question,
  validation link line, sample-size link line, chips, notes) above the
  result (RS-01, RS-05). One tinted callout at most per pane.
- **Double depth cues**: cards with a border and a shadow on a gray page.
  One cue per surface (ruling 6).
- **"+ Table, + Info, + Layout, + Note"** as four pills at the top of the
  navigator: one "New" menu (the header already has New).
- **Seven banner styles** (K5): one Banner primitive.

What makes it OpenDose (to keep and repeat, step 4): the data itself. The
signature is typographic precision on numbers (tabular, decimal-aligned,
slashed zero, real superscripts in labels) and the plot palette as the
single source of colour, so the app and the figures it exports read as one
instrument.

## 2. Surface treatment: Instrument, mixed

Decided from the `surface` prototype (five variants on the real app, light
and dark, 1400 and 390 px, worst-content fixture; screenshots were in
`.design/proto/surface/`, prototype deleted).

- **Direction: Instrument.** The workspace is a set of tiled panes meeting
  at 1px seams (the splitters themselves are the seams, with a ±4px hit area
  from `::before`), not floating cards on a gray page. The navigator is a
  ruled sidebar pinned under the header. Data separators are solid 1px
  lines; floating layers (menus, popovers, dialogs, toasts) sit on the
  shadow stack. More data per screen, and the app reads as a measuring
  instrument, which is what a tool used for hours on a desktop should be.
- **Neutrals (OKLCH, hue 255, chroma ≤ 0.012).** Light: page L 0.935,
  surface L 0.995, float white, inset L 0.955, line L 0.86, ink L 0.20,
  muted L 0.48. Dark (ruling 11 settled: lifted, not #000): page L 0.15,
  surface L 0.20, float L 0.25, inset L 0.245, lines solid at page + 0.14,
  ink and muted from the inverted ramp. WCAG: ink ≥ 14:1, muted ≥ 5.4:1 on
  every surface in both themes (measured).
- **Accent = plot series 1** (`web/src/lib/palette.ts`, OKLCH hue 255.5), so
  the app and its figures share one hue. Light `oklch(0.50 0.18 258)`, dark
  text `oklch(0.73 0.14 258)`, dark fill `oklch(0.52 0.18 258)` with white
  ink. Accent marks state only (selection, primary action, links); it is not
  decoration.
- **Focus ring: neutral ink** (ruling 5), mixed in from Bench paper and
  Ledger: 2px ink, offset 2px; Lc 91 or more on every surface. The accent
  ring also passed, but with accent reserved for state, an ink ring keeps
  "focused" and "selected" distinct.
- **Radius: 4px controls and panes, 6px menus and popovers, 8px dialogs.**
  No pill shapes except the segmented control's track.
- **Buttons:** standalone actions are keycaps (inset 1px line, no fill);
  commands inside a toolbar are ghost buttons (mixed in from Bench paper),
  so a toolbar no longer reads as ten boxes; one filled primary per view.
- **Labels: sentence case, 12px/600, muted** (mixed in from Bench paper /
  Quiet cards; Instrument's uppercase micro-labels rejected by the subtract
  pass).
- **Numerals:** `tabular-nums slashed-zero` on every data cell and result
  number (Instrument's signature).
- **Dark floating layers:** a 1px white ring at 0.09 plus the shadow stack
  (ruling 6).
- **No glass header**, no resize corners, no body colour transition.
- **Plotly chrome** follows the tokens through one JS source resolved to hex
  (ruling 7); exported figures keep their pinned export chrome (ruling 10).

Rejected:
- **Apple system (baseline):** generic at a squint, pills and resize corners,
  #000 dark page with 1.23:1 separation, fails K7 and K11.
- **Bench paper:** the warmest and most distinctive light mode, but sections
  lose their structure on a long results pane, the warm page makes the
  plot surface off-white (exports would need decoupling first), and the warm
  near-black reads brown. Its ink ring, ghost toolbar buttons and sentence
  case labels were kept.
- **Quiet cards:** lowest risk, least change: still reads as the baseline.
- **Ledger:** strongest typographic idea (booktabs, colour only for data),
  but the brand mark goes monochrome, ink links are hard to find, and the
  whole app reads severe. Booktabs survives in the results decision.

## 3. Results pane: Answer first, with a typeset table

Decided from the `results` prototype (five variants on live engine output,
seven worst-content cases, 1400 and 390 px, light and dark; prototype
deleted). The measure that decided it: the y-position of the first key
number.

| Content @ 1400 / 390 | Current | Answer first | Journal | Checks rail | Notebook |
|---|---|---|---|---|---|
| Example IC50 | 1188 / 3237 | 164 / 210 | 400 / 577 | 420 / 621 | 256 / 361 |
| Withheld P | 758 / 2080 | 164 / 210 | 357 / 420 | 553 / 720 | 700 / 930 |
| Tukey, 780 rows | 1060 / 2986 | 164 / 210 | 241 / 300 | 239 / 322 | 183 / 270 |

- **Base: Answer first.** The results pane opens with a headline block per
  result: the sheet's name, then for each data set (up to 3, then "Show all
  N") the key estimate in large figures with its CI line, R² / n line, and
  the existing plain-language sentence ("What this means") at a 65ch
  measure. Then one Checks row with status icons and counts (ok, warn,
  info, open questions) that discloses all guidance (unit question, chips,
  small-n, validation link, sample-size link); at most one tinted callout,
  the most severe. Then the graph, then the full results table. On phones
  the results come first in the column order.
- **Key-facts mappers** pick the headline per analysis: curve fit (IC50/EC50
  or the model's key parameter), t test (difference, CI, P), ANOVA (F, P),
  withheld P (the withheld message), errors (the error and what to try).
  Analyses without a mapper fall back to table first. Every value is read
  from the existing formatters; ruling 10 is untouched.
- **Ambiguous estimates** are demoted: reason first, figure at 0.66 size in
  `--ink-2`, so a value the app says "should not be reported" is never
  the loudest thing on the screen.
- **Headline figure:** 30px/600, tracking −0.02em, proportional figures
  (tabular figures widen the e-notation hyphen: "1.040e - 7"); CI line
  13px; sentence 14/1.55.
- **Mixed in from Journal: the table is typeset.** Booktabs rules (top and
  bottom 1.5px ink, 1px ink under the head, no row borders, no zebra, the
  derived row marked by a rule, not a tint); numeric and range cells
  right-aligned with `tabular-nums`, headers aligned with their columns;
  headers in sentence case, 12px/600 muted (not uppercase, decision 2).
- **Caveat badges** (Ambiguous, Extrapolated) become `<button
  aria-expanded>` disclosures that reveal their full explanation (C-02);
  40px tall on coarse pointers. Numbers in prose never break at the hyphen
  (no-wrap spans).
- **Slashed zero** is dropped from ruling 8's list unless the phase 2 font
  work finds an Inter build that carries the `zero` feature without a new
  dependency: the shipped `@fontsource-variable/inter` ignores it.

Rejected:
- **Journal table as the base:** the most trustworthy-looking table, but the
  key number still sits at y = 400 and the margin rail only fits beside
  the table above 820px of column. Its table typography is kept.
- **Checks rail:** keeps every number inside the table (IC50 at y = 420) and
  hides questions until the strip opens; the sticky strip idea survives as
  the Checks row.
- **Notebook:** reads beautifully as a record, but its lead sentence prints
  3 significant digits next to a 4-digit table, and the table lands at
  y = 1236. Its sentence-led reading stays available in the Report sheet.
- **×10ⁿ display of e-notation:** not built; copy, CSV/TSV and e2e read the
  DOM text, so it would need a parallel text channel. Not worth it now.

## 4. First run: land on a live example, paste anywhere to make it yours

Decided from the `first-run` prototype (five variants, five states each:
landing mid-download, pasted and waiting, live result, worst content,
engine failed; 1400 and 390 px, light and dark; prototype deleted).
Measured: actions from landing to an IC50 on screen with the visitor's
own data, and layout shift (CLS) during the engine boot.

| Variant | 1400 | 390 | CLS during boot |
|---|---|---|---|
| Current catalogue | 4 | 7 | 0.113 / 0.028 |
| Paste first (separate landing) | 2 | 3 | 0 |
| Straight to the bench | 1 | 2 | 0 |
| Live example | 0 to see a result, 1 for own data | 0 / 2 | 0 |
| Goal first | 2 | 6 | 0 |

- **Base: Straight to the bench, mixed with Live example and Paste first.**
  No separate landing screen. A first visit lands in the real workspace on
  the example dose-response table with its shipped result already visible
  (0 actions to see what OpenDose produces), labelled "Example data". A
  paste anywhere outside a field (Ctrl/⌘+V), or into the table, replaces
  the example with the visitor's numbers: the table type is guessed and
  shown with its reason and a "Read as" select (from Paste first), Excel
  error values become empty cells with a counted note, and the default
  analysis runs. Example chips switch to the contingency and survival
  examples. Returning visitors land in their autosaved project as today.
- **The start screen's catalogue moves, it is not deleted:** the eight
  table types with their sketches live in New table; "Describe your
  experiment" and "Plan an experiment" in the New menu; .pzfx/.prism import
  in Open. One instruction line replaces the hero: "Paste a block from Excel
  anywhere on this page. Doses in the first column, responses next to it; a
  header row is fine."
- **Engine boot in a fixed slot** (340 x 34 px, always mounted, CLS 0): a dot,
  the phase words as the only `role=status` ("Downloading the analysis
  engine" / "Starting the analysis engine" / "Ready: analyses run on this
  device" / "The analysis engine did not load" + Try again), bytes in tabular
  figures (aria-hidden), and a 2px bar drawn with `transform: scaleX`. The
  header status text is gone (decision 5 owns feedback).
- **Provenance line** under each result title, fixed at two lines:
  "Computed on this device for the data in the table." / "Computed when this
  version was built. Recomputed here once the engine has loaded." / "Waiting
  for the analysis engine." / "No result: the analysis engine did not load."
  This is the honesty the product promise needs while the engine boots.
- **Failed engine:** the result area says "Nothing could be fitted: the
  analysis engine did not load. Your table is kept. Check the connection,
  then try again." with a primary Try again; shipped example results stay
  visible, relabelled.
- **Layout bar for the first result:** at 1400 x 900 the key estimate of the
  first analysis is on screen without scrolling (decision 3); on phones the
  result card comes first with a fixed height so its arrival shifts nothing.
- **Primary verbs by table type** replace "Create X table": "Fit the curve",
  "Compare the groups", "Run two-way ANOVA", "Test the table", "Draw survival
  curves", "Show the fractions", "Describe the variables", "Run the nested
  test".
- **Inter is preloaded** (it removed 0.005 to 0.026 of font-swap shift).

Bugs the prototype found, assigned to phase 4 (both hurt link 2, trust):
- `web/src/guide/paste.ts` buildTable reads a header "Rep 1, Rep 2, Rep 3"
  as three data sets, so a pasted triplicate gives three IC50s instead of
  one data set with three replicates (territory B).
- An X header in µM labels the IC50 "(µM)" but the graph's X axis still
  says "log[Inhibitor], M" (territory D).

Rejected:
- **Current catalogue:** 4 / 7 actions, result below the fold, the boot note
  shifts the page (0.113).
- **Paste first as a separate landing:** clean and honest, but it keeps a
  landing screen to maintain and costs one more click than landing in the
  bench; its type confirmation and error-value note were kept.
- **Straight to the bench with a faded ghost:** 1 action, but the first
  screen explains nothing and the ghost has to be inert to pass contrast; a
  live, labelled example says more for the same space.
- **Goal first:** one extra decision before any data and 6 actions on a
  phone; the goal list would need curating and user testing.

## 5. Shell: one bar, grouped menus, a command palette

Decided from the `shell` prototype (five command models on the Instrument
surface, the 74-sheet and long-names fixtures, 1400 and 390 px; prototype
deleted).

| | Current | One bar | Two tiers | Command first | Navigator-led |
|---|---|---|---|---|---|
| Header controls 1400 / 390 | 14 / 9 | 8 / 7 | 6+10 / 5 | 8 / 7 | 5+4 / 4 |
| Open by keyboard | impossible | ⌘O | ⌘O | ⌘O | ⌘O |
| Drawer keeps focus | no (K4) | yes | yes | yes | yes |

- **Base: One bar** (44px; 52px on coarse pointers): navigator toggle, logo
  (wordmark hidden at ≤1100px), the project title as an input (13.5px/600,
  `field-sizing: content`, max 300px, 16px on coarse pointers), the
  analysis tabs and Analyze (the bar's one keycap), then at the right undo,
  redo, **File** and **View** menus. Commands are grouped by noun:
  - File: New project, Open… (⌘O), Save project (⌘S; merges "Download
    project file"), Print; New data table, info sheet, layout, floating
    note; Share and export (share link, bundle .zip, tables as .pzfx,
    graphs to PowerPoint); Tools (Apply to new data, Convert Prism files to
    CSV, Power and sample size, Randomisation list).
  - View: theme as a `menuitemradio` group (Auto, Light, Dark), Help and
    tour, About (a dialog with the info popover's words), Preferences, Go to
    sheet.
- **Mixed in from Command first: the find field and the ⌘K palette.** A
  "Find a command or sheet" field (`flex: 0 1 280px`, inset fill, ⌘K/Ctrl K
  keycap; a search icon at ≤760px) opens the palette: the GoToSheet dialog
  extended to one combobox + listbox over one command registry and the
  sheets, ranked by word prefix, with commands for the visible table,
  results and graph ahead of global ones. Empty query shows Suggested and
  Recent sheets. Menus stay for browsing; the palette is the fast path.
- **One Menu primitive** (phase 3) built from that command registry: roving
  tabindex, arrow wrap, Home/End, type-ahead, Tab closes, Escape and item
  activation return focus to the trigger unless a dialog takes it. Items
  28px (44px coarse), group headings 12px/600 muted.
- **Open is a real button** (sr-only file input); ⌘S and ⌘O are new
  shortcuts; a skip link "Skip to the sheet" precedes the header.
- **Drawer at ≤900px is a modal dialog:** everything behind is `inert`,
  Escape returns focus to the toggle.
- **Navigator:** the duplicate Results and Graphs sections go, the four
  "+" pills go (New lives in File and the palette); the family tree is the
  one listing.
- **Grid toolbar:** Import, Export, Rows, Columns visible as ghost buttons;
  Sort, Insert series, Format, Convert, Convert table to, Reshape under
  "More".
- **Status leaves the header** (decision 6 owns where it goes).

Rejected:
- **Current:** 14 controls, Open unreachable by keyboard, focus leaks out
  of the drawer, toolbar wraps to three rows.
- **Two tiers:** commands next to their pane is a good idea, but it is
  modeful (commands move with focus), costs 40px at 1400 and about 90px on a
  phone, and needs DataGrid's toolbar lifted out. Results and graph export
  stay in their panes instead.
- **Command first alone:** depends on knowing the verb ("exp" returns 10
  matches); kept as the palette, not as the only route.
- **Navigator-led:** no analysis switcher in the header and three taps on a
  phone for New, Analyze or Theme.

## 6. Feedback: toasts for events, one Banner for conditions

Decided from the `feedback` prototype (five variants mounted on the real
app with every message routed through one log; worst cases: a 120-character
error, three messages in one second, an error during boot, the boot from 0
to 31 MB and its failure, the Prism chooser, the restore prompt, the shared
link; prototype deleted). Measured: the largest layout shift and the
live-region writes.

| | Current | Toasts | Inline | Status bar | Activity log |
|---|---|---|---|---|---|
| Largest shift on a message, 1400 / 390 | 780 / 61 px | 0 / 0 | 132 / 150 | 0 / 0 | 132 / 150 |
| Engine boot to ready | 227 px | 0 | 0 | 0 | 0 |

- **Base: Toasts for events.** A stack bottom-right (bottom-centre on
  phones, above the safe area): width 380, `--float`, radius 6, the
  elevation stack (dark: 1px white ring at 0.09), at most 3 visible, newest
  at the bottom, gap 8, moved by transform from measured heights. Success
  and info auto-dismiss after max(4000 ms, words at 200 wpm + 1000 ms),
  paused on hover, focus-within and a hidden tab. Errors stay until
  dismissed, with a 2px danger inset rule, a danger icon and a next-step
  action ("Choose another file"). Long operations (opening a .pzfx, an
  export) get a progress toast that resolves in place. Deleting a sheet
  shows Undo. `notify()` gains a `tone` (success, info, error, progress).
- **Mixed in from Inline: the control says it for copy, save and
  download.** Copy, Copy for Word, Save project and Download swap their own
  label for 2000 ms ("Copied", "Saved", "Downloaded") with the width
  reserved at mount, and raise no toast. A failure still raises an error
  toast.
- **Mixed in from Status bar: engine state in a fixed slot**, already
  decided in section 4 (always mounted, CLS 0).
- **Conditions are one Banner primitive**, placed at the top of the pane
  they concern (restore autosave, Prism table chooser, shared-link
  read-only, engine boot or failure, ReproduceStrip, grid note, log chip):
  a full-width tile on a 1px seam, `--inset` background, grid of 16px icon
  / body / actions / dismiss, title 13/1.45, detail 12.5/18 muted; error
  tone `oklch(0.52 0.2 27 / 0.07)` (dark `oklch(0.72 0.16 25 / 0.12)`) with a
  2px danger inset rule; actions as keycaps, one filled primary; dismiss
  24px with a 44px hit area; actions wrap below 620px (container query).
  The engine banner swaps to "Results are live" at the same height, so the
  boot moves nothing.
- **Announcer:** one polite `role=status` and one `role=alert` region,
  mounted once at the root; each write clears, then writes in the next
  frame; phases are spoken, counters never. Toasts and banners never take
  focus. A toast region hotkey (F6 cycles to it) is part of the Toast
  primitive.
- **Motion:** enter opacity + translateY(16px toasts, -6px banners) 200 ms
  `--ease-out`; exit 150 ms same curve; content below snaps (no height
  animation). Reduced motion: opacity only, 150 ms in, 120 ms out.
- **Success colour** is its own token (`oklch(0.55 0.13 150)` light, `0.76
  0.14 150` dark), never the accent; one success token replaces the three
  greens (GHI-12).
- **Copy for the engine banner:** "Saved results for this example. The live
  engine is loading and will recompute them." / "Results are live.
  Recomputed on this device. Edits are analysed as you type." / "The
  analysis engine did not load: the download stopped at 9.4 of 31 MB. These
  are saved results; edits are not analysed until it loads. Check the
  connection, then try again." + Try again.

Rejected:
- **Current:** the header moves up to 780px, errors are blue and polite,
  bursts overwrite each other.
- **Inline everywhere:** messages with no source control need a banner that
  shifts the pane by 77 to 150px; its button labels survive.
- **Status bar:** 0 shift, but 28px of height forever, 12px text, a long
  error truncates on a phone, and it is far from the controls that act.
- **Activity log:** a success gives no immediate feedback, errors still
  shift the pane, and a bell-style count reads as notifications.
- **Message history and a navigator Undo note:** left out; Undo lives in the
  toast and the undo button.
