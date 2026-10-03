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
- Projects: any number of data tables of eight formats (XY, Column,
  Grouped, Contingency, Survival, Parts of whole, Multiple variables,
  Nested), each with its results and graphs as a family, plus info sheets
  (notes and named constants) and layout sheets, in a navigator with
  rename, duplicate (sheet, or whole family with or without data),
  delete, reorder, freeze, highlight colors and search. Grouped, Parts of
  whole, Multiple variables and Nested tables have their final editor;
  their analyses and graphs come next.
- Editing: project-wide undo/redo (Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z),
  keyboard navigation in the grid, excluded values (Ctrl/Cmd+E: kept
  visible, struck through, skipped by analyses and graphs), subcolumn and
  row titles, summary-data formats stored with the table.
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
