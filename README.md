# OpenDose: curve fitting & biostatistics, free and in the browser

A free, open-source tool for the everyday analyses of a wet lab:
dose-response curve fitting (IC50/EC50), enzyme kinetics, binding,
survival analysis, and the standard biostatistics toolbox, built on
battle-tested open-source numerics (NumPy/SciPy). All computation runs
client-side via Pyodide, in a Web Worker: the page stays responsive while
an analysis runs, a long one shows its progress ("Computing… 3.2 s") and
can be cancelled, and the first start shows a real download progress
bar. Data never leaves the browser, and hosting is a static site; after
the first visit an offline cache (a service worker that only keeps the
files the app already downloads) makes later starts read from disk and
lets the app work without a network.

Scientists moving from commercial packages should feel at home: the
implemented methods follow the published, well-documented algorithms of
the field, and every analysis ships with tests cross-checking the
numbers against independent implementations (statsmodels, pingouin,
hand-derived formulas) and, where we have access, against results
produced by commercial software (see `docs/prism-validation.md`).

## Layout

- `engine/opendose/`: the analysis engine (pure Python). Single source
  of truth for all math. Every module cites the GraphPad doc pages it
  implements. Runs natively for tests and in the browser via Pyodide.
- `engine/tests/`: validation suite (`pytest`). Includes the reference
  dataset used for number-level cross-validation (docs/prism-validation.md).
- `web/`: Vite + React + TypeScript SPA. Multi-sheet projects (data
  tables, info sheets, results, graphs, layouts) in a navigator, a data
  grid with Excel paste, analysis controls, Plotly graphs,
  publication-style results sheets. `web/src/sheets/README.md` describes
  how table types plug in.
- `docs/prism-validation.md`: the numeric validation protocol and records.

## Develop

```bash
# engine tests
.venv/bin/python -m pytest engine/tests -q

# web app (syncs the Python engine into public/ first)
cd web && npm run dev

# web unit tests (project model) and end-to-end checks (dev server running)
cd web && npm run test:unit
cd web && node scripts/e2e-check.mjs && node scripts/e2e-tiff.mjs
cd web && node scripts/e2e-export.mjs   # page layouts, PDF/PNG/zip export
cd web && node scripts/e2e-share.mjs    # share links, export bundle, import recipes
cd web && node scripts/e2e-figures.mjs  # SuperPlots, legends, P styles, classic theme, CVD check, volcano, heat-map dendrograms
cd web && node scripts/e2e-assays.mjs   # assay wizards (plate, ELISA, qPCR, flow, blots)
```

The dev server needs internet access on first load (Pyodide + SciPy come
from the jsDelivr CDN, ~30 MB, then cached). The offline cache exists only
in production builds; to measure one locally the way GitHub Pages serves
it (under `/opendose/`, gzip):

```bash
cd web && npm run build && node scripts/serve-dist.mjs 5300   # http://localhost:5300/opendose/
node scripts/validate-site.mjs http://localhost:5300/opendose/ --no-data   # performance probe only
```

The example project's results ship with the app (shown, marked as not
live, until the engine has started); after engine changes that move the
example's numbers, regenerate them against a dev server with
`node scripts/gen-sample-results.mjs http://localhost:5173/`.

## Features (v0.4.0)

### Data tables and projects

- Eight table formats: XY, Column, Grouped (rows × data sets ×
  replicates), Contingency, Survival, Parts of whole, Multiple variables
  (one row per observation, continuous or categorical variables) and
  Nested. Replicate subcolumns side by side or stacked, subcolumn and row
  titles, or summary data (mean with SD / SEM / %CV / 95% CI, with or
  without N, or upper / lower limits) on XY, Column and Grouped tables,
  with a converter from replicates to any summary format.
- Projects hold any number of tables, each with its results and graphs
  as a family, plus info sheets (notes and named constants usable in
  user formulas) and page layouts, in a navigator with rename,
  duplicate (a sheet, or a family with or without data), delete,
  reorder, freeze, highlight colours, search, user-defined groups,
  floating notes and Ctrl/Cmd+K to go to any sheet.
- Editing: Excel paste, keyboard navigation, project-wide undo / redo,
  excluded values (Ctrl/Cmd+E: struck through, skipped by analyses and
  graphs, with an optional reason asked for on the spot and kept with
  the data; results list n entered / excluded / analysed per group with
  the reasons, the methods and legend say "n = 8 enrolled, 7 analysed (1
  excluded: tumour ulceration)", and one click shows the results with
  the excluded values included beside the stored ones), sort, insert
  series, insert / delete / move rows and columns, decimal places, block
  select / copy / cut / clear / exclude, and a Data Inspector card for
  the selection. Dates and elapsed times as X (parsed, analysed in a
  chosen unit, graphed as dates or h:mm:ss).
- Large data: tested with 100,000 pasted rows (in the grid in about ten
  seconds), 200,000 points in one graph, 50 data sets and a t test on
  2 × 100,000 values. Tables over 150 rows scroll inside their card and
  render only the rows in view; graphs over 5,000 points draw them with
  WebGL (an SVG / PDF export then embeds those points as one image).
  Help → "Limits" says what happens beyond (it slows, nothing is cut).
- Import: CSV / TSV / other delimiters and .xlsx worksheets through an
  Import dialog (delimiter, decimal comma, encoding, skipped lines,
  column roles, row / column filters, every k-th row, missing code,
  trailing * = excluded, placement, transpose), offered for large pastes
  and for pasted blocks with a titles row (detected automatically;
  replicate columns name their data set after their shared stem, and
  groups the paste did not reach are dropped from an empty table);
  "From long table…" fills CMH, ROC, quantal and multi-curve XY tables
  from long records;
  import recipes for FlowJo, CellProfiler, QuPath, plate-reader grids,
  qPCR Cq exports, Incucyte time series, LabChart text exports,
  multi-read plate runs (wavelengths or kinetic reads, wells grouped
  with a plate map) and long CSVs (metadata from sample names,
  aggregation cell → image → animal, pivot to any table type); many
  per-image CSVs or a zip at once, stacked with the file name and read
  with a name template ("{condition}_rep{replicate}_img{image}.csv")
  into a SuperPlot-ready table with its replicate map; any import
  mapping saved as a recipe (in this browser and in the project, so a
  share link carries it) and applied to the next file; Reshape between long
  and wide; .prism and .pzfx files (one or all tables, summary tables as
  summary tables; also dropped on the start screen), and "Convert Prism
  files to CSV…" (several files, every data table, one zip). Export: any
  table as CSV / TSV, results as shown.
- Paste and import report: after every paste or import a line above the
  table counts the numbers read and names every other cell by address
  (blanks and #DIV/0! / #N/A kept as missing, text in a number column
  read as missing, values marked * excluded) and states that nothing was
  converted to 0; row titles and categorical columns (gene IDs such as
  0001234) are kept exactly as typed.
- Convert table to…: a new Column, Grouped, Multiple variables or
  re-stacked XY / Grouped table with every value, exclusion and pairing
  kept (checked against the original); "Describe the experiment" (New
  data table and start screen) picks the table and its layout from three
  design questions.
- Notes on every results sheet: an "Analysed" line (n per group, or
  "n = 10 pairs analysed; 2 incomplete pairs (rows 4, 9) left out"),
  every engine warning and note, and every cell skipped because it is
  not a number. Paired tests and correlation pair row by row.
- Chains of analyses: Transform (standard functions, pharmacology plots,
  user-defined formulas with live validation), Transform concentrations,
  Remove baseline, Normalize, Transpose, Prune rows and Fraction of total
  each produce a linked table that follows its source, so Transform →
  Normalize → Fit stays live.
- Simulations: XY tables from any curve model, Column and Contingency
  tables with Gaussian, relative, t or Poisson scatter and a seed; Monte
  Carlo repeats a simulation and an analysis up to 10,000 times and
  tabulates chosen results (CI coverage, power).
- Templates: a table with its analyses and graph formatting, with or
  without data, kept in the browser or as .odtemplate.json files;
  built-in starters (SRB IC50 plate, two-group t test, one-way ANOVA,
  Kaplan-Meier, the clinical examples and every assay example); "Analyze
  and graph like…" another table; one graph's format applied to every
  graph of its kind.
- Project files (JSON, versioned; every release opens every earlier
  version; a file records the version that saved it, and opening one
  saved by another version recomputes every result and says "All 48
  results reproduced" or lists each changed number with both values and
  the engine change log, also kept in History), autosave in the browser
  (the last session reopens on the next visit), preferences (default
  table type, error bars, CI method, colour scheme, theme, results
  precision up to 10 significant digits, P-value style with a selectable
  floor for exact P (0.0001, 1e-6, 1e-10 or none), effect sizes). Every
  select in the analysis controls has an accessible name, checked with
  axe-core (`scripts/a11y-audit.mjs`).

### Curve fitting

- Nonlinear regression with the full equation library the engine
  registers (dose-response including 5PL, biphasic and bell-shaped
  curves, operational and EC50-shift models, binding and competitive
  binding with Fit Ki, enzyme kinetics and inhibition, exponentials,
  polynomials, Gaussian, sine waves, growth), searchable by family, and
  user-defined equations (multi-line editor, initial values, constraints,
  exchanged as JSON).
- Constraints and shared parameters (global fits), each replicate or the
  means, weighting, asymptotic or profile CIs, absolute and relative
  IC50 / EC50 with asymmetric CIs, confidence and prediction bands,
  interpolation from standard curves, Gaddum / Schild with pA2,
  ambiguous-fit detection and multi-start optimisation, diagnostics
  (replicates test, runs test, residual normality), ROUT outlier removal.
  Weighted fits either reweight from the curve (the default) or minimise
  the weighted SS directly (as R's nls with weights). Polynomials to
  tenth order. A new XY table fits on its own only when the data look like
  a dose-response; otherwise it offers linear regression or a curve fit.
  An IC50 / EC50 beyond the concentrations tested is reported as
  "IC50 > 30 µM (not reached in the range tested)" in the table and the
  results sentence, with the reason (or, per results sheet, as the fitted
  number flagged as extrapolated).
- Linear regression on XY tables (slope, intercept, X intercept, the
  regression ANOVA table, runs test, bands, optionally through the
  origin with R² about Y = 0); Deming (Model II) regression.
- Compare fits: two models by the extra-sum-of-squares F test and AICc,
  or one curve for all data sets against a separate curve for each.
- Compare a parameter between two curves (logEC50, Hill slope, Top …):
  the EC50 ratio (potency ratio) with its CI, the difference with its
  t test, and the F test and AICc for one shared value; a ratio involving
  an IC50 beyond the tested range is reported as undefined.

### Statistics

- Column data: descriptive statistics with normality tests (Shapiro-Wilk,
  D'Agostino-Pearson, Anderson-Darling, Kolmogorov-Smirnov) and extras
  (median CI, geometric SD factor, trimmed means, percentile methods);
  one-sample t / Wilcoxon; unpaired, Welch, paired and ratio paired t;
  Mann-Whitney, Kolmogorov-Smirnov, Wilcoxon matched pairs (t with its
  sign and direction); one-way ANOVA (ordinary with its ANOVA table and
  residual SD, Welch, Brown-Forsythe; Bartlett, Brown-Forsythe and
  Fligner-Killeen tests of equal variances) with Tukey, Dunnett,
  Bonferroni, Šídák, Holm-Šídák, Holm, Newman-Keuls, Fisher's LSD,
  Games-Howell, Dunnett T3 or Tamhane T2; Kruskal-Wallis with Dunn's;
  repeated-measures ANOVA (Geisser-Greenhouse) with Tukey, Dunnett vs
  baseline, Šídák, Bonferroni or Holm comparisons that keep the matching
  (each pair's own paired differences, or the pooled error), and the
  mixed-effects model when a subject misses a value; Friedman (exact when
  small); Mood's median test; Pearson, Spearman or Kendall correlation
  with one-sided P; Grubbs and ROUT outliers. Results sheets are named
  after the test they show.
- Every comparisons table (one-way, Dunn's, two- and three-way, multiple
  t tests, nested) shows the unadjusted P beside the adjusted one and
  the family it was adjusted for ("adjusted for 6 comparisons (Tukey)"),
  in the legend and methods too. Dunn's test (Kruskal-Wallis, Friedman)
  and Šídák, Bonferroni, Holm-Šídák, Holm or Fisher's LSD after one-way
  ANOVA compare every pair, each group vs. a control or only the planned
  pairs ticked. t test and ANOVA results have a Residuals section: a QQ
  plot and residuals vs. fitted, with Shapiro-Wilk as a secondary line
  and advice that depends on n.
- "Analyse on the log scale" for unpaired / Welch t tests and one-way
  ANOVA: geometric means with CIs, the ratio of geometric means
  ("Treated/Control = 2.85-fold (95% CI 1.69–4.8)") and post hoc
  comparisons as ratios, in the sentence, legend and methods; a chip
  offers it when the SD grows with the mean, another counts values ≤ 0
  left out, and one click puts the graph on a log10 Y axis.
- Grouped data: two-way ANOVA (ordinary with or without the interaction
  term, repeated measures by rows or both factors, mixed-effects model
  when values are missing, or from mean / SD / N; factor names read from
  imported files) with multiple comparisons, including every cell mean
  against every other, three-way ANOVA, multiple t
  tests per row with FDR or family-wise correction, row means / totals,
  column statistics.
- Contingency: Fisher (r × c exact too, one-sided P for 2 × 2, the
  conditional-MLE odds ratio next to the sample odds ratio) and
  chi-square with expected counts and standardized residuals, relative
  risk and odds ratio with a choice of CI methods, NNT, likelihood
  ratios, Cramér's V, chi-square for trend, McNemar and Bowker,
  Cochran-Mantel-Haenszel with Breslow-Day and Woolf (and the
  generalized CMH test for r × c × k tables), Cohen's kappa, one and two
  proportions.
- Survival: Kaplan-Meier with per-group tables (at risk, events, SE, CI;
  Copy / CSV), log-rank in the Peto and the variance (Mantel-Haenszel)
  forms with observed and expected events, Gehan-Breslow-Wilcoxon,
  hazard ratios, median survival with CIs, number-at-risk tables;
  "median not reached" explained with the survival at the last
  follow-up, few-events warnings, survival at a chosen time and the
  restricted mean survival time (RMST) with differences and CIs; with
  three or more groups, pairwise log-rank tests (all pairs or against a
  control, Holm-Šídák or Bonferroni adjusted) and the log-rank test for
  trend.
- Survival data entry: "Survival data from…" turns alive (or dead)
  counts per day, or start and end dates with yes/no event codes, into
  one row per subject, with a preview of how each subject is read
  ("death on day 12", "censored on day 30").
- Parts of whole (fraction of total with Wilson / Clopper-Pearson CIs,
  chi-square goodness of fit with the binomial test); nested t test and
  nested one-way ANOVA as mixed models; multiple-variables tables
  (descriptive statistics, correlation matrix, multiple linear
  regression, simple and multiple logistic regression with ROC, PCA with
  parallel analysis).
- Nested two-way ANOVA (cells nested in animals in a two-factor design)
  and a mixed model with a grouping column (animal, litter, cage) on
  multiple-variables tables: the unit is a random intercept, so the df
  come from the units, not the values; variance components and ICC, cell
  means with CIs, comparisons with their family named, a nested scatter of
  unit means with brackets.
- Statistics on replicate means (SuperPlots): t tests, Wilcoxon, one-way
  or repeated-measures ANOVA and two-way ANOVA on one value per
  experiment, n = number of experiments. Estimation plots
  (Gardner-Altman and Cumming) with BCa or percentile bootstrap CIs and
  permutation P values.

### Clinical statistics and study design

- Cox proportional-hazards regression (hazard ratios with Wald or
  profile CIs, proportional-hazards test, adjusted curves, forest plot,
  Schoenfeld residuals); ROC with optimal cut-offs (Youden, top-left,
  cost- and prevalence-weighted) and bootstrap CIs, partial AUC, binormal
  smoothing and DeLong's comparison of two markers; Bland-Altman with
  approximate, exact or MOVER CIs on the limits, proportional bias,
  regression-based limits and repeated measurements; quantal
  dose-response (probit, logit, cloglog; LD50 / ECx with Fieller CIs,
  parallel lines, relative potency, an upper asymptote below 100%, dose-0
  rows as the natural-response control). Templates on published data.
- Power and sample size (Tools): a priori n, achieved power or detectable
  effect for t tests, one-way ANOVA, proportions, McNemar, chi-square,
  correlation and log-rank (unrounded n per group and total N labelled
  apart; the detectable effect also in raw units from the SDs), with
  power curves and an ARRIVE-style
  justification sentence; a seeded randomisation list generator (simple,
  shuffled, permuted blocks, stratified) to CSV. "Sample size for the next experiment…"
  on t test and one-way ANOVA results opens it with the pilot SD filled
  in and the effect to detect chosen by the user (never observed power).

### Assay modules

New data table › Start from an assay, or Analyze on a table of the right
type; each starts from the instrument or lab export and produces linked
sheets that follow the data.

- Plate reader → dose-response (wizard): 96 / 384-well plates, pasted or
  imported (several at once), a click-and-drag plate-map editor with
  templates, Z′ and robust Z′, signal window, control and replicate CVs,
  edge-effect check, then normalised XY tables with the 4PL fit set up.
  The SRB/MTT importer on XY tables stays as the one-plate shortcut.
- Standard curve / ELISA (wizard): standards, blanks and unknowns with
  dilution factors, 4PL / 5PL / linear / log-log with weighting,
  back-calculated recovery with ICH M10 acceptance, LLOQ / ULOQ,
  refitting without a rejected standard, flags, parallelism, and a linked
  concentrations table.
- qPCR (wizard): technical-replicate QC, several reference genes,
  efficiencies, statistics on ΔCq, fold changes with asymmetric CIs on a
  log2 axis (MIQE 2.0); exports are read whatever the instrument calls
  its sample, target and Cq columns, with a mapping step when unsure.
  Reference genes are checked before any fold change (Cq per group, the
  shift with treatment, geNorm M), with one-click choice of references.
- Flow cytometry (wizard): a FlowJo statistics table to one value per
  donor and condition (FMO / isotype subtraction), a paired t test or
  repeated-measures ANOVA with the donor as the block, and a SuperPlot.
- Time course: any measurement followed over time in the same subjects
  (a glucose tolerance test, weights): a mixed model with compound
  symmetry, AR(1), unstructured or random-slope covariance compared by
  AIC, group means and differences at each time, AUC and a time-window
  summary per subject as linked column tables.
- Western blot densitometry (wizard): ImageJ / Image Lab exports,
  background and loading-control normalisation, fold change within blot,
  ratio paired t test with blot as the pair.
- From an example or an empty layout: growth curves (blank and log
  preprocessing, logistic / Gompertz / Zwietering lag models, doubling
  time with CI); tumour growth (mixed model on log volume, AUC per
  animal, time to endpoint as a survival table); area under the curve;
  drug-combination synergy (HSA, Bliss, Loewe, ZIP, Chou–Talalay; the
  expected and ZIP-fitted matrices as selectable landscapes; combination
  indices withheld, with the reason, when a median-effect fit is
  invalid); volcano plots from a fold-change / P table; clustered heat
  maps with dendrograms, tree cuts and k-means.

### Graphs and figures

- Graphs for every table type: XY fits with error bars and bands; column
  scatter / bar / box / violin with beeswarm or symmetric point layouts;
  grouped bars (interleaved, stacked, separated), scatter, box, lines,
  three-way graphs and heat maps (z-scores, clustering with dendrograms);
  survival curves with censor marks and nudging; pie, donut and stacked
  bars; nested scatter; bubble, ellipse and hull graphs, PCA biplots,
  forest plots of coefficients; volcano plots.
- Format graph / Format axes / Annotations / Pairwise comparisons on
  every graph kind: per-dataset symbols, colours, transparency, lines,
  bar patterns, error bars and envelopes; axis ranges, log / probability
  scales, numbering, ticks, grids, gaps, right Y axis, frames; legends,
  fonts; draggable text, arrows and shapes; live results blocks;
  significance brackets and compact letters from the comparisons table.
- Figure conventions: SuperPlot mode on column and grouped graphs (values
  coloured by experiment, experiment means, statistics on the means with
  brackets on the graph); a note when bars hide small groups; a
  colour-vision check with CIEDE2000 differences and contrast; a Classic
  theme; colour schemes including colour-blind safe and print.
- Page layouts (several live graphs on a page with panel letters, text,
  a master legend and pictures) and export at exact size as PNG, TIFF at
  a chosen DPI, JPEG, WebP, SVG or vector PDF, journal width presets
  with a font-floor warning, clipboard copy, all graphs as a zip;
  Ctrl/Cmd+P prints the selected sheet.
- PowerPoint export (.pptx, made in the browser): one slide per graph
  or page layout, each graph a vector picture that PowerPoint's
  "Convert to Shape" makes editable, with its figure legend in the
  notes. "Copy for Word" on every results sheet pastes as a formatted
  table; "Copy" under a graph puts it on the clipboard as PNG and SVG.

### Reporting

- One P-value style for the whole project (GraphPad, APA 7 or NEJM; "ns"
  can be hidden), set in Preferences → Reporting and used by results
  tables, sentences, legends, star scales and graph brackets; a graph
  can override it.
- Effect sizes with 95% CIs on every comparison (Cohen's d / Hedges' g,
  Glass's Δ, d_z, η², partial and generalized η², ω², Cramér's V, φ, r,
  Cliff's δ, rank-biserial r, Kendall's W).
- Under each results sheet: a results sentence, the figure legend (what
  is plotted, n with its unit and independent experiments, test and
  sidedness, post hoc and correction, star scale, software version; the
  same legend sits under the graph), equivalent R and Python code, the
  methods text and a "Statistical analysis" paragraph. The unit of n and
  the experiments come from Reporting details or from the table's
  replicate assignment ("n = 18 cells from 3 independent experiments").
- "What this means" under every result: one sentence in the table's own
  groups and units (the difference with its CI and as a %, what P
  means, the hazard ratio as "45% of Control's", IC50 and Hill slope),
  how that result is often misread, and the test run and why it fits,
  with sources. A non-significant result reads "the data do not show a
  difference" with the CI, never "no difference" or "a trend".
- Journal checklists (Nature reporting summary, eLife, Cell STAR Methods,
  SAMPL, ARRIVE items 1-3, 7, 10) ticked from the project with reasons;
  History (provenance of every analysis with its options and table
  fingerprints); "How to cite" with the app and SciPy / NumPy versions.

### Guidance

- A start screen (on the first visit, or when there is no session to
  reopen) with picture cards for the eight table types, "paste data and
  get a table type", templates and the example project with a five-step
  tour; `?example=1` opens the example project directly.
- A "Which test?" wizard ("Help me choose…", first in Analyze) that reads
  the table, asks about the design in terms of the user's own rows ("Is
  row 1 of Control the same animal as row 1 of Treated?"), runs the data
  checks it can and opens the recommended analysis pre-configured, with
  its reason on the results sheet; links from results to Cox regression
  (survival) and Compare fits (curve fits); assumption
  chips and plain-language banners on results (ambiguous fits, omnibus vs
  pairwise disagreement, normalised controls, "n might be cells" with
  one-click replicate assignment); "Why your number may differ" notes;
  data-entry prompts; sourced explainers in a searchable Help panel
  (Ctrl/Cmd+/) with the keyboard shortcuts.
- n-awareness: with one independent value in a group a t test or ANOVA
  reports no P (descriptive, exploratory results, with the n a test would
  need); at n = 2–3 a chip gives the smallest effect the design can detect
  and the CI width (power engine). New tables are asked "What does each
  value represent?"; technical repeats and cells get a replicate map
  (column, grouped and XY tables) and statistics on experiment means, so
  the legend reads "n = 3 independent experiments (9 wells) per group".
  The wizard asks whether each condition ran once per experiment on
  different days and opens the analysis matched by day, which reports the
  day-to-day variation it removed; three or more t tests on one table get
  a chip with their familywise error and one click to Dunnett's ANOVA or
  Holm-Šídák.
- Planning before the data: "Plan an experiment…" asks the wizard's
  design questions plus how many independent units per group and whether
  samples are pooled, then creates the planned table and analysis, gives
  an a priori n from the power engine and a sourced design check list
  (one pooled sample per group is n = 1, cage as the unit, technical
  repeats, controls, randomisation, blinding). An analysis plan on an
  info sheet (test, sidedness, n, exclusion rule, α) can be locked; later
  changes need a reason, results that depart from it get a chip, and the
  methods text states the plan with each deviation and its reason.
- "Is the treatment effect different between groups?" routes to two-way
  ANOVA with the interaction first: the difference of the two effects
  with its CI, simple effects, an interaction plot and the warning that
  "significant in one, not in the other" is not a difference.

### Sharing, export and trust

- Share links: the project (or one family) compressed into the URL
  fragment, no server; opens read-only with "Make a copy".
- Export bundle: project file, tidy (with `excluded` and
  `exclusion_reason` columns) and wide CSV of every table, results
  CSV, SVG and PNG graphs, methods, figure legends and results
  sentences, provenance.json, citation and a README with the software
  versions. .pzfx export of XY, column, grouped, contingency and
  survival tables.
- Apply to new data: next week's file (CSV, TSV, pasted, .xlsx, .pzfx)
  goes into the tables of this project, a project file or a bundle's
  provenance.json; every analysis, graph and layout is kept and re-run,
  and a replay log lists which numbers changed (P values first).
- "How OpenDose is validated": every pinned cross-check (Prism
  screenshots, NIST, statistics-guide examples, published tables,
  statsmodels, pingouin, R) with both values and the source, also as
  "How this is validated" on every results sheet, filtered to that
  analysis' checks. Privacy:
  computation in the browser, nothing sent anywhere.

## Roadmap

See `docs/ROADMAP.md` (full done/remaining list) and the numeric
validation records in `docs/prism-validation.md`.

## License

MIT; see `LICENSE`.

## Trademarks & affiliation

OpenDose is an independent open-source project. It is not affiliated
with, endorsed by, or sponsored by GraphPad Software. "GraphPad Prism"
is a trademark of its owner and is referenced in this repository only
nominatively: to cite which published, publicly documented algorithms
are implemented, and to record cross-validation of numerical results.
OpenDose contains no GraphPad code or assets.
