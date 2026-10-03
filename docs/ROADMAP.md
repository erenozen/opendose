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
- [ ] Grouped tables: two grouping variables with replicate
      subcolumns; interleaved / stacked / separated bar graphs, grouped
      scatter; two-way ANOVA and RM two-way move here from Column mode
- [x] Parts-of-whole tables: pie, donut, stacked-bar graphs; chi-square
      goodness of fit against expected fractions; fraction of total
- [x] Multiple-variables tables: one row per observation, one column per
      variable (continuous / categorical); descriptive stats, correlation
      matrix (with heat map), multiple linear regression, simple and
      multiple logistic regression (odds ratios, ROC of the fit), PCA
      (scree, loadings, biplot), extract & rearrange, select & transform
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
      Grouped-table analyses pick this up when they land)
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
- [ ] Rounding as a transform; data-table limits documented
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
      DONE (2026-10-03) on XY and Column tables (Grouped picks them up
      once its analyses ship), each with a methods sentence
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

**Graphs: Format Graph**
- [ ] Per-dataset symbol shape / size / fill / border, line style and
      width, bar fill and pattern, front-to-back order, nudging
- [ ] Point-to-point lines, spaghetti plots, line of identity, grand
      mean/median line, forest plots, horizontal error bars (X error),
      error envelopes
- [ ] Heat maps (grouped tables, correlation matrices) with color
      mapping, labels, gaps
- [ ] Three-way grouped graphs; row-vs-column titles under bars;
      plotting order; dataset spacing
- [ ] Legends: show/hide, position, combined vs separate, text edits
- [ ] Fonts and sizes for titles, axis numbering, legends
- [ ] Semitransparent fills

**Graphs: Format Axes**
- [ ] Axis range, major/minor ticks, tick direction, numbering format
      (decimal, scientific, power-of-ten, antilog), discontinuous axes,
      additional ticks and grid lines, hide axis / scale bars
- [ ] Right Y axis with datasets assigned to it
- [ ] Frame styles and origin; grid lines
- [ ] Dates and elapsed-time axis formats

**Annotations on graphs**
- [ ] Text boxes, lines, arrows, rectangles, ellipses, aligned/nudged
- [ ] Pairwise-comparison brackets with significance stars or exact P,
      taken from the comparisons table (one-way, two-way, t tests)
- [ ] Compact letter display for multiple comparisons
- [ ] Number-at-risk table under survival curves
- [ ] Embedding results (parameter table, equation) on the graph

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
- [ ] User-defined sheet groups; floating notes
- [ ] Templates: save a table-plus-settings as a reusable template;
      "apply this table's analyses and graph to another table" (Wand)
- [x] Preferences: default table type, error bar, CI method, scheme,
      theme, decimal places; keyboard shortcuts list
- [x] Autosave to the browser with recovery of the last session
- [x] "How to cite" text and version stamp in the exported methods
      (2026-10-03: info popover and methods text; version and build
      from the build, SciPy/NumPy/Python/Pyodide versions from the
      running engine; plain and BibTeX citations; a generic methods
      sentence for analyses without their own)

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

## Next up

1. ~~Publish the site~~ LIVE (2026-08-11): https://erenozen.dev/opendose/
   (public repo, MIT license, deployed via GitHub Actions + Pages; full
   e2e suite verified against the production URL)
2. Further screenshot validations against the user's Prism install
   (survival, ANOVA sheets, competitive binding)
3. Mixed-effects models for RM designs with missing values (scheduled in
   the user-guide review above, nested-models work package)

## Validation protocol

Every analysis lands with tests cross-checked against an independent
implementation (statsmodels, hand-derived formulas, or published values)
(see engine/tests/). Number-level comparison against a real Prism
installation: docs/prism-validation.md (user provides screenshots).
