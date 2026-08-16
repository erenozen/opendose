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
- `web/`: Vite + React + TypeScript SPA. Grouped data table with Excel
  paste, analysis controls, Plotly graphs, publication-style results sheets.
- `docs/prism-validation.md`: the numeric validation protocol and records.

## Develop

```bash
# engine tests
.venv/bin/python -m pytest engine/tests -q

# web app (syncs the Python engine into public/ first)
cd web && npm run dev
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
- App: project save/load (JSON), Prism file import (.prism and .pzfx),
  auto-generated
  methods text, plate import (SRB/MTT), column graphs (scatter / bar /
  box / violin), graph color schemes (default, colorblind safe, black and
  white for print, sequential), graph export at exact size
  (PNG/SVG/JPEG/WebP, plus TIFF at a chosen DPI for journal submission).

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
