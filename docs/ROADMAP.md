# Feature roadmap

The analysis catalog follows the standard methods of the field as they
are publicly documented in GraphPad's guides (referenced nominatively
as the de-facto catalog of what a wet lab needs; see the trademark
note in the README): [user guide](https://www.graphpad.com/guides/prism/latest/user-guide/index.htm),
[curve fitting](https://www.graphpad.com/guides/prism/latest/curve-fitting/index.htm),
[statistics](https://www.graphpad.com/guides/prism/latest/statistics/index.htm).

## Done

### Curve fitting / XY workflow
- [x] Dose-response models: log(inhibitor|agonist) vs. response, 3PL/4PL,
      Prism's exact equations and initial values
- [x] "Constant equal to" constraints; each-replicate-individual-point fitting
- [x] Asymptotic SEs, t-based 95% CIs, IC50/EC50 with asymmetric CI
- [x] R², Sy.x, df, sum of squares; multi-start optimizer;
      Prism "Ambiguous" flag (dependency > 0.9999)
- [x] Transforms (X=log(X) etc.), Normalize (full dialog semantics),
      error bars SD/SEM/95% CI/range
- [x] Plate quantification: SRB/MTT xlsx or pasted grid, blank subtraction,
      % viability / % inhibition vs 0-dose control, per-group splitting

### Curve fitting, round 2
- [x] General model registry: Michaelis-Menten, saturation binding,
      one-phase decay/association (half-life, tau), exponential growth
      (doubling time), straight line
- [x] Weighting by predicted Y (1/Y, 1/Y²) and by X (1/X, 1/X²)
- [x] Profile-likelihood ("asymmetrical") CIs, the Prism 8+ default method
- [x] Robust regression + ROUT outlier elimination (Motulsky-Brown, FDR Q)
- [x] Compare fits: extra sum-of-squares F test + AICc probabilities
- [x] Analyses added 2026-10-04: the engine's equation library (every
      built-in model, listed by the engine at start-up) in a searchable,
      family-grouped picker with experimental and per-data-set constants,
      sharing and global-only models; user-defined equations (editor with
      live validation, initial-value rules, default constraints, values to
      report; saved in the browser, JSON import/export, global fits when a
      parameter is shared); Deming (Model II) regression with its line on
      the XY graph

### Statistics (column data)
- [x] Column statistics: full descriptive set + geometric mean/CI, CV,
      skewness, kurtosis
- [x] Normality: Shapiro-Wilk, D'Agostino-Pearson, Anderson-Darling
- [x] One-sample t, Wilcoxon signed rank
- [x] t tests: unpaired, Welch, paired (+ pairing correlation), Mann-Whitney
      (+ Hodges-Lehmann), Wilcoxon matched pairs; F test for variances
- [x] One-way ANOVA (+ Brown-Forsythe, Bartlett); Tukey-Kramer, Dunnett,
      Bonferroni, Šídák, Holm-Šídák; Kruskal-Wallis + Dunn's
- [x] Outliers: Grubbs (iterative ESD)
- [x] Correlation: Pearson (Fisher-z CI), Spearman
- [x] Two-way ANOVA: Type III SS via effect-coded GLM (balanced and
      unbalanced), % of total variation
- [x] Contingency: chi-square (±Yates), Fisher exact, odds ratio (Woolf),
      relative risk, sensitivity/specificity (Wilson CIs), R×C tables
- [x] Analyses added 2026-10-04: Kolmogorov-Smirnov and ratio paired
      t tests; Welch and Brown-Forsythe ANOVA ("do not assume equal SDs")
      with Games-Howell, Dunnett T3, Tamhane T2 or uncorrected Welch
      comparisons; Newman-Keuls and Fisher's LSD; uncorrected Dunn's;
      Mood's median test; exact Friedman; Pratt zero handling and exact /
      approximate P labels for the rank tests; KS normality test,
      percentile methods and more descriptive statistics. Contingency:
      effect sizes (Koopman RR, Newcombe difference, Baptista-Pike OR, NNT,
      likelihood ratios, phi / Cramér's V), chi-square test for trend,
      McNemar (Bowker for k×k), Cochran-Mantel-Haenszel for stratified
      2×2 tables (two rows per stratum), Cohen's kappa with weights, one
      and two proportions with CI method choices. Methods text for each

### App
- [x] XY + Column table modes, Excel paste, plate import UI, Plotly graphs
      (dose-response curves, column scatter with mean±SD), Prism-style
      results sheets, ambiguity badge

### Roadmap completion (2026-08-11)
- [x] Interpolation from standard curves (Y→X) + confidence/prediction
      bands (delta method); absolute IC50 with band-crossing CI
- [x] Global fitting with shared parameters (pooled df/SEs, UI sharing
      checkboxes)
- [x] Dedicated linear regression (slope/intercept CIs, X-intercept,
      F test, exact runs test, closed-form bands); two-phase decay;
      2nd/3rd order polynomials
- [x] Diagnostics: replicates (lack-of-fit) test, runs test, residual
      normality, all behind one checkbox in the app
- [x] Survival: Kaplan-Meier (Greenwood log-log CIs, medians), log-rank
      (Peto form, Prism's), Gehan-Breslow-Wilcoxon (proper quadratic-form
      variance, matches statsmodels), Mantel-Haenszel hazard ratio;
      full Survival mode in the app
- [x] RM one-way ANOVA (Geisser-Greenhouse, matches statsmodels AnovaRM),
      Friedman + Dunn's, ROC (DeLong), Bland-Altman, column ROUT
- [x] App: project save/load (JSON), methods-text generator with copy
      button, survival table mode, interpolation panel, global-fit UI

### Final round (2026-08-11)
- [x] Competitive binding: One site - Fit logIC50, One site - Fit Ki
      (Cheng-Prusoff, hot-ligand constants), Two sites - Fit logIC50
- [x] Gaddum/Schild EC50 shift: global fit across agonist curves with
      per-dataset antagonist concentration; pA2, SchildSlope, KB with CI;
      dose ratios per curve; optional SchildSlope = 1 constraint
- [x] Two-way ANOVA multiple comparisons: Tukey / Šídák / Bonferroni,
      within rows, within columns, or on main-effect means, with pooled
      MS_residual and df from the two-way model
- [x] Two-way repeated-measures ANOVA: mixed design (groups × repeated
      rows; matches pingouin.mixed_anova to machine precision, GG epsilon
      included) and fully-repeated design (matches statsmodels AnovaRM)
- [x] Prism-file import, both formats: .pzfx XML and the .prism archive
      Prism 10/11 writes (zipped JSON sheets with the numbers in CSV).
      XY / Column / Grouped / Survival tables, dataset titles, replicate
      layout, excluded-value handling, multi-table chooser in the app
      (Open button). Which format a file is comes from its bytes, not its
      name. Analysis output inside a project (transforms, results tables,
      the 999-point drawn curves) is skipped: OpenDose recomputes it.
- [x] Graph types for column data: bar (mean ± SD + points), box &
      whiskers, violin
- [x] Export controls: PNG/SVG/JPEG/WebP at exact width × height × scale
      for every graph
- [x] TIFF export at a chosen DPI (8-bit RGB, Deflate, resolution tags
      written into the file) for journals that require it
- [x] Extrapolation flag: a fitted IC50/EC50 that falls outside the doses
      actually tested is badged "Extrapolated", with the fold-distance
      past the nearest dose. Separate from the ambiguity flag, which
      measures parameter dependency and stays silent when both plateaus
      are constrained — the case where a dose-response curve most often
      reports a midpoint it never reached.
- [x] Editable axis titles on every graph, kept per graph type and saved
      with the project. Empty means "use the automatic title", so clearing
      a field undoes an edit; the placeholder shows what that restores.
- [x] Graph color schemes: default, colorblind safe, black and white for
      print, sequential for ordered series. Every palette is checked with
      a validator (lightness band, chroma floor, CVD separation over every
      pair, normal-vision floor, surface contrast) rather than picked by
      eye, and each scheme also varies the marker symbol so series
      identity never rests on color alone. Slot counts are what the
      checks allow: 6 hues in light mode, 4 in dark.

### UI/UX pass (2026-08-11)
- [x] Visual identity: Apple system palette (grouped-gray page, flat
      white cards, system-blue accent, WCAG-AA-verified contrast), Inter
      variable font (self-hosted), logo mark, tabular numerals
- [x] Layout/navigation: translucent sticky header with segmented-control
      tabs (sliding thumb, role=tablist + arrow keys, compact labels on
      narrow screens), full-width main grid, privacy/non-affiliation
      note in a header info popover
- [x] Onboarding/empty states: welcome panel with spinner + live engine
      status; editor column inert until the engine is ready; engine-load
      failures show a plain-language error with Try again
- [x] Workspace: draggable column splitter (keyboard-adjustable,
      persisted) and two-axis island resizing with live plot redraw
- [x] Theme: auto/light/dark toggle overriding the OS, persisted,
      driving both CSS tokens and Plotly chrome
- [x] Motion: gated animation set (engine-ready reveal, entrances,
      label crossfades), prefers-reduced-motion respected
- [x] Mobile: single-column reflow, ≥40px touch targets, resize/splitter
      affordances disabled on touch
- [x] Accessibility: visible focus ring everywhere, aria-live status,
      labeled selects/file inputs, per-mode data preserved on tab
      switches, all text ≥4.5:1 contrast in both themes
- [x] Robustness: engine file fetches validated (HTML-fallback
      detection + retry), idempotent sync-py so live dev servers stay
      coherent

## User-guide review (2026-10-03)

A topic-by-topic pass over the 448 pages of the Prism 11 user guide
(fetched from its table of contents) sorted every section into one of
three buckets. Analyses live in the two other guides and are tracked
above; this pass covers the *application*: tables, data handling,
graphs, layouts, export, project management.

### Out of scope (not meaningful for a browser tool)
Windows/Mac differences, installation, firewalls, SSO, command-line
switches, LabArchives, Prism Cloud, scripts (replaced by project files
+ URL-free static hosting), printing beyond the browser's own print,
Word/PowerPoint one-click send, EPS/EMF/CMYK output, "Prism Labs".

### Already covered
XY / Column / Contingency / Survival tables; Excel paste; .pzfx and
.prism import; Normalize and fixed Transforms; replicates with SD /
SEM / CI / range error bars; XY, column (scatter/bar/box/violin) and
survival graphs; confidence/prediction bands; log axes; axis titles;
color schemes; PNG/SVG/JPEG/WebP/TIFF export at exact size; project
save/load; methods text; theme; accessibility pass.

### To implement — grouped by guide section

**Data tables (the eight kinds)**
- [x] Grouped tables: two grouping variables with replicate
      subcolumns (or mean/SD/N); interleaved / stacked / separated bar
      graphs, grouped scatter, box plots, connected lines; two-way ANOVA
      (ordinary, RM by rows or both factors, mixed-effects model when
      repeated values are missing), three-way ANOVA, multiple t tests per
      row with FDR / family-wise correction and a volcano plot, row
      means/totals (as a linked table), column statistics; Prism
      grouped tables import as grouped (Column mode keeps two-way ANOVA).
      2026-10-04: brackets from the two-way, three-way (per panel) and
      multiple t tests comparisons on the grouped bar graphs; the grouped
      graph kinds are offered on XY tables too (X rows as groups)
- [x] Parts-of-whole tables: pie, donut, stacked-bar graphs; chi-square
      goodness of fit against expected fractions; fraction of total
- [x] Multiple-variables tables: one row per observation, one column per
      variable (continuous / categorical); descriptive stats, correlation
      matrix (with heat map), multiple linear regression, simple and
      multiple logistic regression (odds ratios, ROC of the fit), PCA
      (scree, loadings, biplot), extract & rearrange, select & transform
      (into a linked table since 2026-10-04)
      (2026-10-03: plus XY/bubble graphs of the data with color and size
      legends, labels, connecting lines, data ellipses, convex hulls and
      mean ± SD per group, and categorical strip/bar/box/violin graphs;
      row titles as observation IDs)
- [x] Nested tables: nested t test and nested one-way ANOVA (mixed model
      with random subgroup effect); nested scatter graph
- [x] Entering error values computed elsewhere: Mean/SD/N, Mean/SEM/N,
      Mean/%CV/N, Mean/CI/N, upper/lower limit subcolumn formats; every
      analysis that can run from summary data does (2026-10-03: XY, Column
      and Grouped tables; curve fits account for SD and N or fit means
      only; unpaired / Welch / one-sample t, one- and two-way ANOVA;
      entered error bars on graphs; replicates -> summary converter.
      Grouped tables: two-way ANOVA from mean/SD/N and the grouped graphs
      with entered error bars)
- [x] Side-by-side vs stacked replicates (XY / Grouped side by side,
      Column / Nested stacked); subcolumn titles; row titles on Column
      tables (editable; using them as point labels is a graph item)
- [x] Excluding values Prism-style (value stays visible, struck through,
      skipped by analyses and graphs), with keyboard shortcut (also on a
      selected block)
- [x] Sort rows, insert series (start/step, arithmetic or geometric),
      decimal-place display, dates / elapsed times as X (parsed, analyzed
      in a chosen unit, graphed with date / h:mm:ss ticks), insert /
      delete / move rows and columns, block select / copy / cut / clear
- [x] Rounding as a transform (Transform: "Y rounded to K decimals", and
      ROUND() in user formulas)
- [ ] Data-table limits documented (rows, data sets, subcolumns)
- [x] Undo / redo for every table edit (project-level history, Ctrl/Cmd+Z,
      Shift+Ctrl/Cmd+Z, coalesced typing, 100 steps)

**Importing and exporting data**
- [x] Text / CSV / TSV import with the Source · View · Filter · Placement
      choices (skip rows, pick columns, transpose, insert at column,
      decimal-separator handling), .xlsx worksheets, encodings, every
      k-th row, missing-value code, trailing * = excluded, unstacking
      indexed data; offered for large or comma-separated pastes (not yet:
      by-rows / by-columns reflow, filter criteria on a column, Info &
      Notes import)
- [x] Export any data or results table as CSV / TSV; copy results sheet
      as tab-separated text

**Data Inspector and calculated variables**
- [x] User-defined transforms Y = f(X, Y) and X = f(X) with the full
      function table from the guide (abs, sqrt, ln, log, exp, trig,
      hyperbolic, floor/ceil, sgn, Gaussian / t / F / chi-square / binomial
      distribution functions, if/and/or, min/max/mean of subcolumns,
      row/column references, constants pi and e). DONE (2026-10-03):
      Transform → "User-defined formulas": X and Y formula fields,
      multi-line programs with <B> / <~A> data-set lines, constants
      (shared or per data set), live validation with the error position,
      searchable function reference built from the engine's own list,
      examples; plus the pharmacology plots (Eadie-Hofstee, Hanes-Woolf,
      Lineweaver-Burk, log-log, Scatchard, Hill) and extra standard Y
      functions (Y^K, |Y|, z score, logit, probit, trig, Y·X, …)
- [ ] Calculated variables (in-table formulas) on multiple-variables
      tables
- [x] A Data Inspector card (n, mean, SD, SEM, min, max, missing,
      excluded) for the selected block of cells, or the current column

**Analyzing data: manipulations**
- [x] Transforming concentrations (X = log(X) with a chosen replacement
      for zero), Remove baseline (subtract a column, a row, a value,
      first/last row; divide, as fraction), Transpose, Prune rows
      (average or remove every k rows, by X range), Fraction of total.
      DONE (2026-10-03) on XY, Column and Grouped tables, each with a
      methods sentence
- [x] Chains of analyses: results sheets that feed another analysis
      (Transform → Normalize → Fit is the canonical case) with the chain
      visible in the navigator. DONE (2026-10-03): a manipulation's output
      is a linked, read-only data table (`project/derived.ts`) kept in
      sync from its source and settings (`app/useDerivedSync.ts`), shown
      under its source with a link icon and breadcrumbs; Unlink turns it
      into ordinary data
- [ ] Excluding points from one analysis without excluding them from
      the table

**Simulations**
- [x] Simulate XY / Column / Contingency tables from a model with
      Gaussian (absolute or relative SD) or Poisson scatter, seedable;
      Monte Carlo: repeat an analysis N times over simulated data and
      tabulate a chosen result (CI coverage, power). DONE (2026-10-03):
      "Simulate data…" in the New data table dialog; simulated tables
      keep their settings ("Simulate again", "Settings…", methods
      sentence). Monte Carlo analysis on XY (curve fit, optionally with
      a results sheet's settings), Column (t test, ANOVA, descriptive)
      and Contingency tables: result-value picker, hit conditions,
      chunked cancellable runs with progress, summary table, histogram

**Graphs: Format Graph** (graph-format layer: `web/src/graph/README.md`)
- [x] Per-dataset symbol shape / size / fill / border, line style and
      width, bar fill and pattern, front-to-back order, nudging; apply to
      one, selected or all data sets
- [x] Point-to-point lines (straight, spline, staircase), spaghetti
      (before-after) plots, line of identity, grand mean/median line,
      horizontal error bars (X SD taken from another data set), error
      envelopes, error-bar direction / caps / thickness, row-title labels
- [ ] Forest plots as a graph type of the data (estimate and CI per row);
      the regression and logistic-regression results have coefficient /
      odds-ratio forest plots already
- [x] Heat maps: grouped tables (single hue / diverging / grayscale from
      the scheme, min / max / center, reverse, cell labels, gaps, legend,
      blank-cell color) and correlation matrices (multiple-variables)
- [x] Plotting order; dataset spacing (gap between columns)
- [x] The format layer on every graph kind (2026-10-04): XY, column,
      survival, parts of whole (pie / donut: per-part colour, legend
      text, order, show / hide; title, legend, fonts, annotations),
      nested, grouped (with heat map and volcano), every multiple-
      variables graph, Monte Carlo histogram, summary-data column graphs;
      each graph's own options in the same Settings panel; layouts and
      batch export draw graphs as formatted
- [x] Three-way grouped graphs; row-vs-column titles under bars
      (grouped tables; also grand mean/median line and before-after
      lines there)
- [x] Legends: show/hide, position (corners, above, outside right,
      below), layout, per-dataset text (one legend per graph; separate
      legends not offered)
- [x] Fonts and sizes for graph title, axis titles, axis numbering, legend
- [x] Semitransparent fills (with a contrast warning for user colours)

**Graphs: Format Axes**
- [x] Axis range, major/minor ticks, tick direction, numbering format
      (decimal, scientific, power-of-ten, antilog), discontinuous left Y
      axis, additional ticks and grid lines, hide axis; log10, log2, ln
      and probability scales
- [ ] Scale bars instead of axes
- [x] Right Y axis with datasets assigned to it
- [x] Frame styles (plain axes, box, offset axes, none) and origin
      (zero lines); major and minor grid lines
- [x] Elapsed-time axis numbering (h:mm, h:mm:ss)
- [x] Dates and elapsed times as X: parsed in the table, analyzed as
      numbers, graphed with date or h:mm:ss tick labels
- [ ] Format axes "Date" numbering on such tables (X reaches the graph as
      days since the first date, not as calendar dates)

**Annotations on graphs**
- [x] Text boxes (with arrow to a point), lines, arrows, rectangles,
      ellipses; draggable on the graph, saved with it
- [ ] Align / distribute tools for annotations
- [x] Pairwise-comparison brackets with significance stars or exact P,
      taken from the comparisons table (one-way post tests, Dunn's,
      two-way main-effect comparisons, t tests, Mann-Whitney), with
      automatic stacking; since 2026-10-04 also two-way comparisons
      within rows or data sets, three-way cell comparisons (each panel),
      multiple t tests (one bracket per row) on grouped graphs, and the
      nested ANOVA's comparisons on the nested scatter graph. Asterisks
      follow P ≤ 0.05 / 0.01 / 0.001 / 0.0001 in results and on graphs
- [x] Compact letter display for multiple comparisons (engine
      `compact_letters` handler when present, in-browser fallback)
- [x] Number-at-risk table under survival curves
- [x] Embedding results (best-fit values, equation, P value) on the graph
      as live text blocks

**Page layouts**
- [x] Layout sheets: place several graphs on a page grid, resize,
      master legend, export the whole layout at once (2026-10-03: page
      composer with A4/Letter/custom pages, grid presets and free
      placement with snapping and keyboard nudging, live graphs bound
      from a picker or filled in project order, panel letters, text
      blocks, master legend, unlinked pictures, duplicate, page export
      as PNG/TIFF/JPEG/WebP at a DPI or vector SVG/PDF, print at the
      page's own size; `web/src/project/layout.ts`)

**Exporting images**
- [x] PDF export (vector), transparent background, export all graphs as
      a zip, copy image to clipboard, journal presets (width in mm, DPI,
      font floor) (2026-10-03: plus DPI written into PNGs, print
      colours for dark theme, file names from sheet names, last
      settings remembered per project; EPS stays out of scope)
- [x] Printing: Ctrl/Cmd+P or Print in a sheet's menu prints the
      selected sheet only (table, results, graph or layout page)

**Project organisation (navigator)**
- [x] Multi-sheet projects: any number of data tables of any type, each
      with its results and graphs, plus Info/notes sheets, in a
      navigator tree; rename, duplicate (with or without data), delete,
      sort, freeze
- [x] Highlight sheets; search sheets
- [x] User-defined sheet groups; floating notes (2026-10-04: groups inside
      the Data tables / Results / Graphs sections, drag or "Move to
      group…", fold, rename, delete keeping the sheets; coloured notes on
      any sheet, folded into chips above it, listed under Info, searched by
      the navigator, never printed or exported; both saved in the project)
- [x] Templates: save a table-plus-settings as a reusable template;
      "apply this table's analyses and graph to another table" (Wand)
      (2026-10-04: templates with or without Y values, kept in the browser
      and as .odtemplate.json files, built-in lab starters; "Analyze and
      graph like…"; apply one graph's format to every graph of its kind)
- [x] Info sheets nested under their linked table; info constants usable
      in user-formula transforms (hooked by name, values follow the info
      sheet); collapse / expand all; Ctrl/Cmd+K go to sheet; complete
      keyboard shortcuts list
- [x] Preferences: default table type, error bar, CI method, scheme,
      theme, decimal places; keyboard shortcuts list
- [x] Autosave to the browser with recovery of the last session
- [x] "How to cite" text and version stamp in the exported methods
      (2026-10-03: info popover and methods text; version and build
      from the build, SciPy/NumPy/Python/Pyodide versions from the
      running engine; plain and BibTeX citations; a generic methods
      sentence for analyses without their own; version 0.2.0 from
      2026-10-04)

### Order of work
1. Engine first, in parallel: multiple-variables analyses, parts of whole,
   nested models and mixed-effects RM (the open item 3 below), summary-
   data entry, formula evaluator and manipulations, simulations.
2. ~~App backbone: multi-sheet project model with navigator, undo/redo,
   project JSON v2 with migration from v1.~~ DONE (2026-10-03): see
   `web/src/sheets/README.md` for the table-type plugin contract. The
   Grouped / Parts of whole / Multiple variables / Nested editors are
   final; each needs only its analyses and graphs registered. Also landed
   with it: excluded values in the grid (Ctrl/Cmd+E, struck through,
   skipped by analyses and graphs), subcolumn titles, summary subcolumn
   formats stored (not yet analyzed), info-sheet constants (read-only).
3. App features on top of the backbone, in parallel per area: new table
   types and their graphs; table editing and import/export; Format
   Graph / Format Axes / annotations; layouts and export.
4. e2e coverage for each new workflow; methods text extended to every
   new analysis.

### Open items (2026-10-04)
What the integration pass of 2026-10-04 leaves open, from the list above
and the notes the feature work left in the code and READMEs:
- Forest plots as a graph type of the data (estimate and CI per row).
- Scale bars instead of axes.
- Align / distribute tools for annotations.
- Date axes: tables keep dates as day numbers (since the earliest date),
  so Format axes' "Date" numbering has no calendar dates to show; the XY
  graph labels its own date ticks.
- Kruskal-Wallis exact P for small samples without ties (the chi-square
  approximation is used now).
- Calculated variables (in-table formulas) on multiple-variables tables.
- Excluding points from one analysis without excluding them from the table.
- Data-table limits documented.
- Grouped graphs: brackets between the two panels of the three-way graph,
  compact letters, and Format graph colours on separated bars (those are
  coloured by group).
- Contingency tables have no graphs of their own (only the Monte Carlo
  histogram).
- Text import: by-rows / by-columns reflow, filter criteria on a column,
  Info & Notes import. Info-sheet constants as analysis inputs.
- Graph-format limits (`web/src/graph/README.md`): axes crossing at a
  value, separate legends, crossing ticks, X error subcolumns in the
  table model, a discontinuous right Y axis.

## User research (2026-10-04)

Five research reports in `docs/research/` (forums and Q&A sites with
GraphPad's own 1,539-title FAQ index; review sites and alternative tools;
bench workflows and journal rules; usability, teaching and trust; Hacker
News, GitHub trackers and the methods literature) were read against what
the app already does. Reddit blocks automated access and is absent.
Context worth knowing: BarelySig (WebR in the browser, launched
2026-09-24) and BioRender Graphing now compete on the same ground;
48.4% of preclinical papers report using Prism. The themes below are ordered by how often and how
intensely they recur across all four reports, with the evidence file in
brackets. Each theme lists what is already covered and what is now
scheduled.

### Theme 1. "Which test, and what does the result mean?"
The single most frequent need (forums #1, #2, #6; reviews #4; UX #9):
design-first test choice, multiple comparisons after two-way ANOVA,
plain-language fit diagnostics ("ambiguous", "hit constraint", omnibus
significant but no pairwise), SD vs SEM, what n is. Prism's guidance is
its most praised feature; users want more of it.
- Covered: ambiguity and extrapolation badges, diagnostics checkbox,
  analysis checklists in results for fits. Guidance package
  (`web/src/guide/`, 2026-10-04): everything ticked below, plus
  data-entry prompts (numeric row titles in a Grouped table, hundreds of
  rows in a Column table, normalised controls) and a stacked vs
  side-by-side note in the New table dialog.
- [x] "Which test?" wizard: a design-first dialog (how many groups /
      factors, paired or matched, replicate structure, outcome type,
      normality and variance checks run on the data) that recommends a
      test with a one-paragraph reason and opens it pre-configured
- [x] Assumption checklist chips on every results sheet (normality,
      equal SDs, sphericity, n per group, zero-variance control) with
      advice rather than gatekeeping
- [x] Plain-language banners: ambiguous / hit constraint / did not
      converge with concrete fixes; omnibus-vs-post-hoc disagreement
      explained next to the table; "control normalised to 1 has SD 0,
      use a one-sample or ratio paired t test"; "n is the number of
      cells: see replicates"
- [x] Explainers in place: SD vs SEM vs CI, relative vs absolute IC50,
      which post hoc for which question, log-rank vs Gehan, R² is not
      curve quality
- [x] "Why your number may differ from Prism / R / SPSS" notes per
      analysis stating tails, ties, correction, quantile definition and
      CI method (forums #4)
- [x] Start screen with picture cards for the eight table types (mini
      table, mini graph, allowed analyses), "paste data and suggest a
      type", and a five-minute guided example tour (UX (b))
- [ ] Follow-ups: a one-click stacked/side-by-side converter from the New
      table dialog (today it points to Import › Unstack indexed data);
      Šídák correction restricted to the planned pairs ("selected pairs"
      family) and Dunn's test vs a control only; pairwise comparisons
      after repeated-measures one-way ANOVA

### Theme 2. Replicates, n and SuperPlots
Technical vs biological replicates, pooling experiments, n = cells
(forums #3, reviews #12, workflows §9–10; JCB endorses SuperPlots).
- Covered: nested t test and ANOVA, mixed models, paired lines.
- [x] SuperPlot mode on column and grouped graphs: a replicate column
      colours the points, overlays replicate means, and the statistics
      run on the replicate means (paired when linked by experiment)
      (table-level replicate map: subcolumns or a label column;
      "Statistics on replicate means" for column and grouped tables)
- [x] Hierarchical aggregation dialog for long-format exports (cell →
      image → animal/replicate by mean or median) that keeps the
      cell-level points for display (the import recipes' Aggregate step;
      the lower level is kept as a nested table)
- [ ] Biological vs technical replicate prompt when a table looks like
      pooled cells; n with its unit on the graph and in the legend
      (n with its unit is in the legend sentence; the prompt is open)

### Theme 3. Assay modules that start from the instrument export
IC50 from plate readers, ELISA standard curves with QC, qPCR ΔΔCt,
Western blot densitometry, tumour growth, flow summary statistics
(reviews #5, #19; workflows §1–7; forums #5, #10, #8).
- Covered: SRB/MTT plate import, dose-response fitting, interpolation,
  ratio paired t test, mixed models, Kaplan–Meier.
- [x] Plate-reader module: plate-map editor, blank and control wells,
      % of control, Z′ and replicate-CV QC, straight into a fit
- [x] Standard-curve module: standards plus unknowns layout, 4PL/5PL
      with weighting, back-calculated recovery per level, %CV, LLOQ and
      ULOQ by precision profile, dilution factors, "<LLOQ" flags, a
      concentrations table and graph
- [x] qPCR module: technical-replicate averaging with Ct flags, ΔCt and
      ΔΔCt with efficiency correction and geometric mean of reference
      genes, statistics on ΔCt, fold change with asymmetric CI on a log2
      axis (MIQE 2.0 wording)
- [x] Densitometry module: background, loading-control or total-protein
      normalisation, fold change within blot, ratio paired t test
- [ ] Tumour-growth module: long format in, mixed model on log volume,
      AUC per animal with group comparison, time-to-endpoint survival
- [ ] Synergy: Bliss, HSA, Loewe, ZIP and Chou–Talalay from a
      combination matrix, with landscapes
- [ ] AUC analysis as in the statistics guide, with SE from replicates
      and comparison between datasets

### Theme 4. Reporting that satisfies reviewers
Exact P, effect sizes with CIs, named tests with sidedness, n with its
unit, methods paragraphs; Prism 11 sells effect sizes as a Pro feature
(forums #17, reviews #13–15, workflows journal section).
- Covered: methods text with software versions, exact P in tables,
  compact letters, number-at-risk tables.
- [x] Effect sizes with CIs on every comparison: Cohen's d, Hedges' g,
      Glass's Δ, η², partial η², ω², Cramér's V and φ, r, Cliff's δ
      (results sheets; default family in Preferences → Reporting)
- [x] Estimation plots (Gardner–Altman and Cumming) with bootstrap CIs
      next to every two-group and multi-group comparison (column and
      grouped tables; Analyze → Estimation plot)
- [x] Results sentence in APA, NEJM or GraphPad style; figure-legend
      generator (n and unit, test, sidedness, post hoc, centre and
      dispersion, error-bar meaning, star scale); one P-value style for
      tables, sentences and legends
- [x] Journal checklists (Nature reporting summary, eLife, Cell STAR,
      SAMPL, ARRIVE Essential 10 items 1-3, 7, 10) auto-ticked from the
      project
- [x] Provenance panel: every analysis step with its parameters and
      defaults; provenance.json and legends.txt in the export bundle
      (the bundle already had tidy CSV, results tables, SVG/PNG figures,
      methods text, README). Not yet: replaying a provenance file onto
      new data, PDF figures in the bundle
- [x] Equivalent R and Python snippets per analysis for cross-checking
- [ ] Graph brackets follow the P-value style preset (needs the
      figure-conventions package to read `currentReportPrefs()`)

### Theme 5. Sharing, interoperability, trust
Licence expiry locking people out of their own files, version lock-in,
unnamed CSVs inside .prism, mixed R/Prism labs, privacy of web tools
(UX §3–4, reviews #10, #25, forums #14, #23).
- Covered: free, no account, all computation in the browser, .pzfx and
  .prism import, project JSON, templates.
- [x] Share by link: the project compressed into the URL fragment (no
      server), opening read-only with "make a copy"
- [x] .pzfx export so collaborators with Prism can open OpenDose work,
      including replicate subcolumns and mean/SD/N summary tables
- [x] Import recipes for FlowJo, CellProfiler, QuPath and plate-reader
      exports: metadata parsing from sample names, long-to-wide pivot
      (plus qPCR Cq and tidy CSV; Reshape on every table)
- [x] A validation page in the app listing the pinned cross-checks
      (Prism screenshots, NIST, statsmodels, R) with numbers
- [x] A privacy statement in the info popover: data never leaves the
      browser
- [x] Export bundle (tidy and wide CSV, results CSV, SVG and PNG graphs,
      methods, citation, README) from the Save menu; file-format
      promise (every release opens every earlier version) stated in the
      info popover and README

### Theme 6. Figures as journals now expect them
Show every point, SD or CI rather than SEM, colour-vision safety,
exact P on brackets, consistent styles, Prism-recognisable look
(reviews #11, #24; UX (c); workflows (c)).
- Covered: column graphs default to points with mean ± SD, validated
  colour-blind-safe schemes, brackets, Magic-style format copying,
  journal size presets, vector export.
- [x] Error-bar meaning written into the legend automatically; n per
      group label; a warning when a bar graph hides n < 10
      (`legendSentence` in web/src/graph/legend.ts)
- [x] Colour-vision-deficiency simulation and contrast check in the
      graph settings (Datawrapper-style)
- [x] A "Classic" theme preset: white background, bold labels, offset
      axes ending at the last tick, minor ticks, hidden legend title
- [x] Volcano plot from an imported fold-change / P table (thresholds,
      colours, top-N labels)
- [ ] Clustered heat map with dendrogram (linkage, distance), k-means
      (row / column z-scores are in, and rows / columns cluster through
      the engine's `cluster_heatmap` (average linkage, Euclidean); drawing
      the dendrograms, linkage and distance choices and k-means are open)
- [ ] P-value style presets for brackets, tables and sentences (APA
      ".012 / <.001", NEJM "P<0.001", GraphPad "0.0123 / <0.0001" with
      ****), "hide ns", and the star-threshold scale written into the
      legend (done for brackets, results blocks and the legend sentence
      via `GraphFormat.pStyle`; results tables and methods sentences
      still use the house style)
- [x] Prism-style symmetric point placement (points at the same value
      spread symmetrically about the centre) as the default scatter
      layout, alongside jitter and beeswarm (default for new graphs)
- [x] Survival curves: nudge overlapping curves apart at 100%, censor
      marks, P in the chosen journal style

### Theme 7. Statistics still missing
Power and sample size (Prism has none), Cox regression, comparing ROC
curves, CI on Bland–Altman limits, quantal (probit/logit) dose-response
with n per dose, growth curves with lag (workflows §7–8, §12–13;
forums #18, #25).
- [x] Power and sample size for t tests, ANOVA, proportions,
      correlation and survival, plus a randomisation list generator
- [x] Cox proportional hazards with hazard ratios and CIs
- [x] ROC: compare two curves (DeLong, paired and unpaired), Youden and
      cost-weighted optimal cut-offs
- [x] Bland–Altman: CIs on the limits of agreement, proportional bias,
      repeated measures per subject
- [x] Quantal dose-response: probit and logit with n per dose, LD50 /
      ECx with Fieller CIs
- [ ] Growth: Zwietering lag-phase parameterisations of logistic and
      Gompertz; doubling time with CI

### Order of work
1. Engine, in parallel: effect sizes, estimation statistics and power;
   Cox, ROC comparison, Bland–Altman extras, quantal fits, AUC, .pzfx
   writing; assay engines (standard-curve QC, qPCR, densitometry, plate
   QC, synergy, clustering, SuperPlot aggregation).
2. App, in parallel and engine-independent: guidance and onboarding
   (Theme 1); sharing and import recipes (Theme 5); figure conventions
   and SuperPlots (Themes 2, 6).
3. App, as engines land: reporting (Theme 4); assay modules (Theme 3);
   clinical statistics and power (Theme 7).

## Next up

1. ~~Publish the site~~ LIVE (2026-08-11): https://erenozen.dev/opendose/
   (public repo, MIT license, deployed via GitHub Actions + Pages; full
   e2e suite verified against the production URL)
2. Further screenshot validations against the user's Prism install
   (survival, ANOVA sheets, competitive binding, nested and mixed
   models, the new equation library, multiple t tests with FDR)
3. Mixed-effects models for RM designs with missing values (scheduled in
   the user-guide review above, nested-models work package)

## Validation protocol

Every analysis lands with tests cross-checked against an independent
implementation (statsmodels, hand-derived formulas, or published values)
(see engine/tests/). Number-level comparison against a real Prism
installation: docs/prism-validation.md (user provides screenshots).
