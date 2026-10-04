# OpenDose: curve fitting & biostatistics, free and in the browser

A free, open-source tool for the everyday analyses of a wet lab:
dose-response curve fitting (IC50/EC50), enzyme kinetics, binding,
survival analysis, and the standard biostatistics toolbox, built on
battle-tested open-source numerics (NumPy/SciPy). All computation runs
client-side via Pyodide; data never leaves the browser, and hosting is
a static site.

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
cd web && node scripts/e2e-figures.mjs  # SuperPlots, legend sentence, classic theme, CVD check, volcano
```

The dev server needs internet access on first load (Pyodide + SciPy come
from the jsDelivr CDN, ~30 MB, then cached).

## Implemented (v0.1)

- Data: grouped XY table, replicate subcolumns, paste from Excel.
- Transform: X = log(X) and the standard function library.
- Normalize: flexible 0%/100% definitions (percent/fraction,
  subcolumn handling).
- Nonlinear regression: log(inhibitor|agonist) vs. response, 3- and
  4-parameter logistic, "Constant equal to" constraints, each replicate as
  an individual point, asymptotic SEs and 95% CIs, IC50/EC50 with
  asymmetric CI, R², Sy.x, df.
- Error bars: SD, SEM, 95% CI, range.
- Fit status: ambiguous-fit detection via parameter dependency > 0.9999;
  multi-start optimization for local-minimum robustness.
- Plate import (SRB/MTT/viability): xlsx or pasted grid auto-detection,
  blank subtraction, per-group 0-dose normalization, % viability or %
  inhibition → dose-response table; validated against a synthetic plate
  fixture with analytic ground truth (`engine/tests/fixtures/`).

- Statistics (column mode): column statistics with three normality tests,
  one-sample t / Wilcoxon, unpaired/Welch/paired t, Mann-Whitney, Wilcoxon
  matched pairs, one-way ANOVA + Tukey/Dunnett/Bonferroni/Šídák/Holm-Šídák,
  Kruskal-Wallis + Dunn's, RM-ANOVA (Geisser-Greenhouse) / Friedman,
  two-way ANOVA (Type III) with Tukey/Šídák/Bonferroni follow-up
  comparisons, two-way repeated-measures ANOVA (mixed and fully
  repeated), correlation, ROC, Bland-Altman, Grubbs/ROUT outlier tests.
- Curves: interpolation from standard curves, confidence/prediction
  bands, absolute IC50, global fitting with shared parameters, linear
  regression with runs test, fit diagnostics (replicates/runs/normality),
  competitive binding (one/two site, Fit Ki) and Gaddum/Schild EC50
  shift with pA2.
- Survival mode: Kaplan-Meier, log-rank, Gehan-Breslow-Wilcoxon, hazard
  ratio. Contingency mode: Fisher/chi-square/OR/RR, effect sizes with a
  choice of CI methods (Koopman, Newcombe, Baptista-Pike, NNT, likelihood
  ratios, Cramér's V), chi-square test for trend, McNemar / Bowker for
  paired data, Cochran-Mantel-Haenszel for stratified 2×2 tables, Cohen's
  kappa, one and two proportions.
- Equation library: every model the engine registers (dose-response
  variants including five-parameter asymmetric, biphasic and bell-shaped
  curves, operational and EC50-shift models, binding kinetics, enzyme
  inhibition, exponentials, polynomials, Gaussian, sine waves, growth and
  more) in a searchable picker grouped by family, with experimental and
  per-data-set constants and global fits. User-defined equations: a
  multi-line editor with live validation, initial-value rules, default
  constraints and values to report, saved in the browser and exchanged
  as JSON. Deming (Model II) regression for method comparison.
- More column tests: Kolmogorov-Smirnov, ratio paired t, Welch and
  Brown-Forsythe ANOVA with Games-Howell / Dunnett T3 / Tamhane T2,
  Newman-Keuls, Fisher's LSD, uncorrected Dunn's, Mood's median test,
  exact Friedman, KS normality test, percentile methods and extra
  descriptive statistics (median CI, geometric SD factor, harmonic and
  quadratic means, mode, trimmed means).
- Parts of whole: fraction of total (column/row/grand, with Wilson/Brown,
  Wilson or Clopper-Pearson CIs), chi-square goodness of fit against
  expected counts/percentages/fractions with the binomial test for two
  categories; pie, donut and stacked-bar (absolute or 100%) graphs.
- Nested: nested t test and nested one-way ANOVA as a mixed model (random
  subcolumn effect, variance components, subcolumn LR test, multiple
  comparisons, hierarchical ANOVA table); nested scatter graph.
- Grouped tables (rows × datasets × replicates): two-way ANOVA (ordinary,
  repeated measures, mixed-effects model when values are missing, or from
  mean/SD/N), three-way ANOVA, multiple t tests one per row with FDR or
  Holm-Šídák/Šídák/Bonferroni correction and a volcano plot, row
  means/totals (also as a linked table), column statistics;
  interleaved/stacked/separated bars, grouped scatter, box plots,
  connected lines, three-way graphs and heat maps with color mapping,
  with comparison brackets from the two-way, three-way or multiple
  t tests results. XY tables offer the same grouped graphs (X rows as
  groups). Prism grouped tables import as grouped tables.
- Projects: any number of data tables of eight formats (XY, Column,
  Grouped, Contingency, Survival, Parts of whole, Multiple variables,
  Nested), each with its results and graphs as a family, plus info sheets
  (notes and named constants) and layout sheets, in a navigator with
  rename, duplicate (sheet, or whole family with or without data),
  delete, reorder, freeze, highlight colors and search.
- Organising projects: templates (save a table with its analyses, graph
  settings and formatting, with or without its data; kept in the browser
  and as downloadable .odtemplate.json files; built-in starters such as a
  96-well SRB IC50 plate, a two-group t test, one-way ANOVA with Tukey and
  a Kaplan-Meier comparison), "Analyze and graph like…" another table,
  one graph's format applied to every graph of its kind, user-defined
  sheet groups (drag sheets in, fold, rename), floating notes on any
  sheet, info sheets nested under their table with constants usable in
  user formulas, collapse / expand all and Ctrl/Cmd+K to go to any sheet.
- Multiple-variables tables (one row per observation, continuous or
  categorical variables, row titles as IDs): descriptive statistics,
  correlation matrix with a heat map, multiple linear regression
  (categorical predictors, interactions, term tests, residual normality;
  actual-vs-predicted, residual and coefficient forest plots), simple and
  multiple logistic regression (odds ratios, likelihood ratio test, pseudo
  R², Hosmer-Lemeshow, classification table, fitted curve and ROC), PCA
  (parallel analysis, scree, loadings and biplot), extract & rearrange /
  select & transform into a new linked table, and graphs of the data (bubble
  graphs colored and sized by variables, data ellipses, convex hulls,
  categorical strip / bar / box / violin).
- Editing: project-wide undo/redo (Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z),
  keyboard navigation in the grid, excluded values (Ctrl/Cmd+E: kept
  visible, struck through, skipped by analyses and graphs), subcolumn and
  row titles (Column tables included). A toolbar over every table: sort
  rows (by X, row title or a dataset; rows and exclusions move
  together), insert arithmetic or geometric series, insert / delete /
  move rows and columns, decimal places shown, block selection (drag,
  Shift+click, Shift+arrows) to clear, copy, cut or exclude, and a Data
  Inspector card (n, mean, SD, SEM, min, max, missing, excluded) for the
  selection.
- Import and export of data: CSV / TSV / semicolon / space-separated
  text or .xlsx worksheets through an Import dialog (Source: delimiter,
  decimal comma, encoding, lines to skip, titles row; View: what each
  column becomes; Filter: row / column ranges, every k-th row, missing
  code, blank-X rows, trailing * = excluded; Placement: replace, append
  or write at a cell, transpose, replicates per dataset), offered
  automatically for large or comma-separated pastes. Any data table
  exports as CSV / TSV (excluded values marked, blank or kept; point or
  comma decimals) or copies as tab-separated text; results sheets export
  what they show.
- Summary data: XY, Column and Grouped tables can hold Mean with SD /
  SEM / %CV / 95% CI limits (with or without N), mean ± errors or
  upper / lower limits. Curve fits use SD and N exactly as the raw
  replicates would be fitted (or fit the means only); unpaired / Welch /
  one-sample t tests and ordinary one- and two-way ANOVA run from the
  summaries; graphs draw the entered error bars; a converter turns
  replicates into any summary format as a new table.
- Dates and elapsed times as X: typed in common formats, analyzed as
  days (or weeks / years / hours) since the earliest date or as seconds
  (or minutes / hours / days), shown and graphed as dates or h:mm:ss.
- Chains of analyses: Transform (standard functions, pharmacology plots
  and user-defined formulas with live validation and a function
  reference), Transform concentrations, Remove baseline, Normalize,
  Transpose, Prune rows and Fraction of total each produce a linked
  table that updates when its source or settings change, so Transform →
  Normalize → Fit stays live end to end.
- Simulations: XY tables from any curve model, Column and Contingency
  tables, with Gaussian, relative, t or Poisson scatter and a seed
  ("Simulate again" re-rolls). Monte Carlo repeats a simulation and an
  analysis up to 10,000 times, tabulating chosen results (summary,
  histogram) and counting hits such as CI coverage or P < 0.05.
- App: project save/load (JSON v2; v1 files open and migrate), autosave
  to the browser with "Restore last session?", preferences (default table
  type, error bars, CI method, color scheme, theme, results precision),
  Prism file import (.prism and .pzfx, one or all tables),
  auto-generated methods text, plate import (SRB/MTT), column graphs
  (scatter / bar / box / violin), editable axis titles, graph color
  schemes (default, colorblind safe, black and white for print,
  sequential), graph export at exact size (PNG/SVG/JPEG/WebP, plus TIFF
  at a chosen DPI for journal submission).
- Figures: vector PDF export (text stays text), transparent backgrounds,
  journal column widths at 300/600 dpi with a 6 pt font-floor warning,
  copy to clipboard, every graph at once as a zip. Page layouts compose
  several live graphs on an A4/Letter/custom page with panel letters,
  text, a master legend and unlinked pictures, and export the page as
  one PNG/TIFF/PDF/SVG. Printing (Ctrl/Cmd+P) prints just the selected
  sheet.
- Citing: "How to cite OpenDose" (plain and BibTeX) in the info popover
  and under the methods text, stamped with the app version and the
  SciPy/NumPy versions the analysis actually ran on.
- Graph formatting (Settings → Format graph / Format axes / Annotations /
  Pairwise comparisons), on every graph kind from XY fits to pie charts,
  heat maps and PCA biplots, with each graph's own options (variables,
  error bars, slice labels, ...) in the same Settings panel: per-dataset
  symbols, colours, transparency,
  lines, bar patterns, error bars and envelopes, X error, order and
  nudging; axis ranges, log10/log2/ln/probability scales, numbering
  formats, ticks, grids, extra ticks, gaps, right Y axis, frames;
  legends, fonts and titles; text, arrows and shapes you can drag on the
  graph; live results blocks; significance brackets and compact letters
  from the comparisons table; number-at-risk tables under survival
  curves. `web/src/graph/README.md` describes how a plot adopts it.
- Figure conventions journals ask for: SuperPlot mode on column and
  grouped graphs (every value coloured by experiment, experiment means as
  large symbols, the grand mean ± SD or 95% CI of the experiment means)
  with "Statistics on replicate means" (t tests, Wilcoxon, one-way or
  repeated-measures ANOVA, two-way ANOVA; n = number of experiments) whose
  brackets land on the graph; beeswarm and symmetric point layouts; a
  legend sentence ("Mean ± SD … n = 6 per group", the asterisk scale when
  stars are drawn) under the graph, in the figure or in the Figure legend
  card; centre and error bars per column graph (SD, SEM, 95% CI, median
  with IQR); a note when a bar graph hides the points of a group with
  n < 10; a colour-vision check (protanopia, deuteranopia, tritanopia,
  achromatopsia, grayscale; CIEDE2000 differences and contrast against the
  background; a warning for transparency with the colour-blind scheme); a
  "Classic" theme (white, black, bold Arial, offset axes ending on a tick,
  minor ticks); APA, NEJM or GraphPad-style P values with "hide ns"; a
  volcano plot from a fold-change / P table; heat-map z-scores; censor
  ticks and nudging on survival curves.
- Sharing (`web/src/share/`): Save menu → "Copy share link" puts the
  whole project (or, from a sheet's menu, one family) into the URL
  fragment, compressed, with no server: `#p=` followed by base64url of
  the raw-DEFLATE project JSON, without preferences or autosave. The
  link opens read-only with "Make a copy"; links over 64 kB are refused
  in favour of the project file.
- Export bundle (Save menu): one zip with the project file, every data
  table as wide and long (tidy) CSV, every results sheet as CSV, every
  graph as SVG and PNG, methods text, figure legends and results
  sentences (legends.txt), provenance of every analysis
  (provenance.json), citation and a README naming the software versions.
- Reporting (`web/src/report/`): every comparison shows its effect size
  with a 95% CI and a labelled interpretation (Cohen's d / Hedges' g,
  Glass's Δ, d_z, η², partial and generalized η², ω², Cramér's V, φ, r,
  Cliff's δ, rank-biserial r, Kendall's W), the default family chosen in
  Preferences → Reporting. Under each results sheet: a results sentence
  in APA 7, NEJM or GraphPad style (one P-value style for tables,
  sentences and legends; "ns" can be hidden), the figure legend (what is
  plotted, n with its unit and independent experiments, test and
  sidedness, post hoc and correction, star scale, software version; also
  under each graph), equivalent R and Python code with caveats where
  defaults differ, and a "Statistical analysis" paragraph in the methods
  text. Journal checklists (Nature reporting summary, eLife, Cell STAR
  Methods, SAMPL, ARRIVE 2.0 items 1-3, 7, 10) are ticked from the
  project with a reason and a fix for each item; History lists every
  analysis with its full options (defaults marked), table fingerprints
  and software versions, copyable as JSON. Reporting details of a table
  (unit of n, experiments, exclusions, sample-size reasoning) feed all of
  these.
- Estimation plots (column and grouped tables): Gardner-Altman (two
  groups) and Cumming (shared control, multiple two-group, paired
  baseline or sequential) plots with BCa or percentile bootstrap CIs, a
  fixed seed and permutation P values (DABEST method, Ho et al. 2019).
- Import recipes (Import → Recipes): FlowJo tables, CellProfiler
  per-object CSVs, QuPath measurements, plate-reader grids, qPCR Cq
  exports and long-format CSVs become typed long records; group, animal
  and time can be read from sample names; values are aggregated up the
  hierarchy (cell → image → animal) by mean, median, sum or count before
  pivoting to a column, grouped, XY, multiple-variables, survival or
  nested table. Reshape (data-table toolbar) turns any table long, or a
  long table wide.
- Trust: the info popover links to "How OpenDose is validated", a page
  listing every pinned cross-check (Prism screenshots, NIST Longley,
  guide examples, Dunnett and Spearman tables, statsmodels, pingouin)
  with our value, the reference and its source, and states the privacy
  model: computation in the browser, nothing sent anywhere, autosave in
  the browser's own storage, share links carry the data themselves.
- File format: project files carry a version, and every release opens
  every earlier version (v1 files migrate on open; the migration is
  unit-tested). A file never needs the newest build.
- Guidance (`web/src/guide/`): a start screen with picture cards for the
  eight table types, "paste data and get a table type", the example
  project and a five-step guided tour (shown once, replayable from Help);
  a "Which test?" wizard (Analyze menu) that asks about the design, runs
  the data checks it can (n, normality, SD ratio, zero-variance and
  normalised controls) and opens the recommended analysis pre-configured;
  assumption chips and plain-language banners on results (ambiguous or
  extrapolated fits, omnibus vs pairwise disagreement, normalised
  controls, the mixed-model switch); a "Why your number may differ" note
  per analysis; data-entry prompts; sourced explainers in a searchable
  Help panel (Ctrl/Cmd+/) with the keyboard shortcuts. `?example=1` opens
  the example project directly, without the start screen or the tour.

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
