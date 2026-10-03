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
- [ ] Parts-of-whole tables: pie, donut, stacked-bar graphs; chi-square
      goodness of fit against expected fractions; fraction of total
- [ ] Multiple-variables tables: one row per observation, one column per
      variable (continuous / categorical); descriptive stats, correlation
      matrix (with heat map), multiple linear regression, simple and
      multiple logistic regression (odds ratios, ROC of the fit), PCA
      (scree, loadings, biplot), extract & rearrange, select & transform
- [ ] Nested tables: nested t test and nested one-way ANOVA (mixed model
      with random subgroup effect); nested scatter graph
- [ ] Entering error values computed elsewhere: Mean/SD/N, Mean/SEM/N,
      Mean/%CV/N, Mean/CI/N, upper/lower limit subcolumn formats; every
      analysis that can run from summary data does
- [ ] Side-by-side vs stacked replicates; subcolumn titles; row titles
      on Column tables (used as point labels)
- [ ] Excluding values Prism-style (value stays visible, struck through,
      skipped by analyses and graphs), with keyboard shortcut
- [ ] Sort rows, insert series (start/step), decimal-place display,
      rounding, data-table limits documented, dates / elapsed times as X
- [x] Undo / redo for every table edit (project-level history, Ctrl/Cmd+Z,
      Shift+Ctrl/Cmd+Z, coalesced typing, 100 steps)

**Importing and exporting data**
- [ ] Text / CSV / TSV import with the Source · View · Filter · Placement
      choices (skip rows, pick columns, transpose, insert at column,
      decimal-separator handling)
- [ ] Export any data or results table as CSV / TSV; copy results sheet
      as tab-separated text

**Data Inspector and calculated variables**
- [ ] User-defined transforms Y = f(X, Y) and X = f(X) with the full
      function table from the guide (abs, sqrt, ln, log, exp, trig,
      hyperbolic, floor/ceil, sgn, Gaussian / t / F / chi-square / binomial
      distribution functions, if/and/or, min/max/mean of subcolumns,
      row/column references, constants pi and e)
- [ ] Calculated variables (in-table formulas) on multiple-variables
      tables; a Data Inspector card (n, mean, SD, min, max, missing) for
      the selected block of cells

**Analyzing data: manipulations**
- [ ] Transforming concentrations (X = log(X) with a chosen replacement
      for zero), Remove baseline (subtract a column, a row, a value,
      first/last row; divide, as fraction), Transpose, Prune rows
      (average or remove every k rows, by X range), Fraction of total
- [ ] Chains of analyses: results sheets that feed another analysis
      (Transform → Normalize → Fit is the canonical case) with the chain
      visible in the navigator
- [ ] Excluding points from one analysis without excluding them from
      the table

**Simulations**
- [ ] Simulate XY / Column / Contingency tables from a model with
      Gaussian (absolute or relative SD) or Poisson scatter, seedable;
      Monte Carlo: repeat an analysis N times over simulated data and
      tabulate a chosen result (CI coverage, power)

**Graphs: Format Graph** (graph-format layer: `web/src/graph/README.md`)
- [x] Per-dataset symbol shape / size / fill / border, line style and
      width, bar fill and pattern, front-to-back order, nudging; apply to
      one, selected or all data sets
- [x] Point-to-point lines (straight, spline, staircase), spaghetti
      (before-after) plots, line of identity, grand mean/median line,
      horizontal error bars (X SD taken from another data set), error
      envelopes, error-bar direction / caps / thickness, row-title labels
- [ ] Forest plots
- [ ] Heat maps (grouped tables, correlation matrices) with color
      mapping, labels, gaps
- [x] Plotting order; dataset spacing (gap between columns)
- [ ] Three-way grouped graphs; row-vs-column titles under bars
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
- [ ] Date axes (numbering is in place; needs dates parsed in the table)

**Annotations on graphs**
- [x] Text boxes (with arrow to a point), lines, arrows, rectangles,
      ellipses; draggable on the graph, saved with it
- [ ] Align / distribute tools for annotations
- [x] Pairwise-comparison brackets with significance stars or exact P,
      taken from the comparisons table (one-way post tests, Dunn's,
      two-way main-effect comparisons, t tests, Mann-Whitney), with
      automatic stacking
- [x] Compact letter display for multiple comparisons (engine
      `compact_letters` handler when present, in-browser fallback)
- [x] Number-at-risk table under survival curves
- [x] Embedding results (best-fit values, equation, P value) on the graph
      as live text blocks

**Page layouts**
- [ ] Layout sheets: place several graphs on a page grid, resize,
      master legend, export the whole layout at once

**Exporting images**
- [ ] PDF export (vector), transparent background, export all graphs as
      a zip, copy image to clipboard, journal presets (width in mm, DPI,
      font floor)

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
- [ ] "How to cite" text and version stamp in the exported methods

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
