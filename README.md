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
  ratio. Contingency mode: Fisher/chi-square/OR/RR.
- Parts of whole: fraction of total (column/row/grand, with Wilson/Brown,
  Wilson or Clopper-Pearson CIs), chi-square goodness of fit against
  expected counts/percentages/fractions with the binomial test for two
  categories; pie, donut and stacked-bar (absolute or 100%) graphs.
- Nested: nested t test and nested one-way ANOVA as a mixed model (random
  subcolumn effect, variance components, subcolumn LR test, multiple
  comparisons, hierarchical ANOVA table); nested scatter graph.
- Projects: any number of data tables of eight formats (XY, Column,
  Grouped, Contingency, Survival, Parts of whole, Multiple variables,
  Nested), each with its results and graphs as a family, plus info sheets
  (notes and named constants) and layout sheets, in a navigator with
  rename, duplicate (sheet, or whole family with or without data),
  delete, reorder, freeze, highlight colors and search. Grouped, Parts of
  whole and Nested tables have their final editor; their analyses and
  graphs come next.
- Multiple-variables tables (one row per observation, continuous or
  categorical variables, row titles as IDs): descriptive statistics,
  correlation matrix with a heat map, multiple linear regression
  (categorical predictors, interactions, term tests, residual normality;
  actual-vs-predicted, residual and coefficient forest plots), simple and
  multiple logistic regression (odds ratios, likelihood ratio test, pseudo
  R², Hosmer-Lemeshow, classification table, fitted curve and ROC), PCA
  (parallel analysis, scree, loadings and biplot), extract & rearrange /
  select & transform into a new table, and graphs of the data (bubble
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
