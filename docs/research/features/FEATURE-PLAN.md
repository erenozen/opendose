# Feature plan

Consolidated from the 2026-11-23 feature-gap swarm: `.design/features/`
needs.md (N-nn), stats.md (S-nn), fitting-graphs.md (F-nn), workflow.md
(W-nn) and external.md (X-nn), checked against main at 4b20864. Each P-id
below merges every input row that describes the same user capability; the
Sources line lists them all. A lead agent executes this wave by wave:
Wave 0 first (correctness and data safety), then Waves 1 to 3 by effort
and dependency. Deferred items carry a reason and what would change it.

## Summary

| P-id | Title | Wave | Territory | Effort |
|---|---|---|---|---|
| P-01 | Autosave that is safe with several tabs | 0 | shell-project | M |
| P-02 | PDF export with an embedded Unicode font | 0 | graphs-export | M |
| P-03 | Exported raster and SVG text in the intended font | 0 | graphs-export | S |
| P-04 | One box-plot definition | 0 | graphs-export | S |
| P-05 | Full-precision paste from Excel and Google Sheets | 0 | grid-import | S |
| P-06 | An xlsx import that never drops values silently | 0 | grid-import | S |
| P-07 | File pickers that decode bytes correctly | 0 | grid-import | S |
| P-08 | Curve fits that respect the replicate map (potency across experiments) | 0 | engine, results | M |
| P-09 | Honest checklist rule and stale docstrings | 0 | results | S |
| P-10 | Large arrays without a RangeError | 0 | graphs-export | S |
| P-11 | Residual plots for every curve fit and every ANOVA | 1 | engine, results | S |
| P-12 | Equivalence and non-inferiority tests (TOST) | 1 | engine, results | S |
| P-13 | Compare slopes and intercepts of regression lines | 1 | engine, results | S |
| P-14 | Pairwise comparisons of proportions after an r x c test | 1 | engine, results | S |
| P-15 | Say when a rank test cannot reach significance | 1 | results, guided | S |
| P-16 | An "Analysed" line for every result | 1 | results | S |
| P-17 | Fit summary table and best-fit values to a linked table | 1 | results | S |
| P-18 | Ratio to control with a Fieller CI | 1 | engine, results | S |
| P-19 | Weibull and hormesis dose-response models | 1 | engine | S |
| P-20 | Range constraints on built-in models | 1 | results, engine | S |
| P-21 | Initial values shown, typed and exported | 1 | engine, results | S |
| P-22 | Interpolated unknowns with CIs, drawn on the graph | 1 | engine, results, graphs-export | S |
| P-23 | IC50 and EC50 drop lines on fit graphs | 1 | graphs-export | S |
| P-24 | A curve-fit legend that names the model, band and exclusions | 1 | graphs-export | S |
| P-25 | Geometric mean with geometric SD, and the bar-axis warning | 1 | graphs-export, results | S |
| P-26 | Median with IQR when a rank test is the analysis | 1 | graphs-export, results | S |
| P-27 | Repeated-measures correlation | 1 | engine, results | S |
| P-28 | Difference in survival at a chosen time | 1 | engine, results | S |
| P-29 | Limit of blank, detection and quantification | 1 | engine, guided | S |
| P-30 | qPCR no-template and no-RT control checks | 1 | guided | S |
| P-31 | Full flow gate path in the methods | 1 | guided | S |
| P-32 | Keep "why this test" in the project | 1 | guided, shell-project | S |
| P-33 | Drop or open a single CSV, TSV or XLSX file | 1 | grid-import | S |
| P-34 | Read .xls and .ods workbooks | 1 | grid-import | S |
| P-35 | One-click fix for percent and unit cells | 1 | grid-import | S |
| P-36 | Find and replace in a table | 1 | grid-import | S |
| P-37 | Spreadsheet keys in the grid | 1 | grid-import | S |
| P-38 | Pair values by subject ID from a long table | 1 | grid-import | S |
| P-39 | Recipe gaps: SoftMax side by side, Incucyte without Elapsed | 1 | grid-import | S |
| P-40 | RM ANOVA reporting: Mauchly, Huynh-Feldt, partial omega squared | 1 | engine, results | S |
| P-41 | Trend across ordered groups: Jonckheere-Terpstra and Page | 1 | engine, results | S |
| P-42 | Passing-Bablok and Theil-Sen regression | 1 | engine, results | S |
| P-43 | Lin's concordance correlation coefficient | 1 | engine, results | S |
| P-44 | Reliability ICC (Shrout-Fleiss / McGraw-Wong) | 1 | engine, results | S |
| P-45 | Cochran's Q for matched yes/no outcomes | 1 | engine, results | S |
| P-46 | Quasi-Poisson for overdispersed counts | 1 | engine, results | S |
| P-47 | Compare two event rates | 1 | engine, results | S |
| P-48 | Partial correlation and comparing two correlations | 1 | engine, results | S |
| P-49 | Schild plot | 1 | graphs-export, engine | S |
| P-50 | Flow event-count and gated-percentage calculator | 1 | guided | S |
| P-51 | Simulate from a user-defined equation | 1 | engine | S |
| P-52 | Choose the drawn curve's X range and resolution | 1 | results, engine | S |
| P-53 | Raincloud plots and a stated violin bandwidth | 1 | graphs-export | S |
| P-54 | Text and line sizes in points at the exported size | 1 | graphs-export | S |
| P-55 | Normalised axes named from the settings | 1 | results | S |
| P-56 | Pin a colour to a group name | 1 | graphs-export | S |
| P-57 | Show the references behind derived numbers | 1 | results, engine | S |
| P-58 | Reproduction records saved with the project | 1 | shell-project | S |
| P-59 | Prism Info sheets round trip | 1 | grid-import, engine | S |
| P-60 | A published project-file schema | 1 | shell-project | S |
| P-61 | Study design record and ARRIVE items | 1 | guided, results | S |
| P-62 | Sex as a biological variable check | 1 | guided, results | S |
| P-63 | Export bundle with PDF graphs and layout pages | 1 | graphs-export | S |
| P-64 | Excel (.xlsx) export | 2 | graphs-export, shell-project | M |
| P-65 | Source data workbook per figure | 2 | graphs-export | M |
| P-66 | One statistics table for the whole project | 2 | results | M |
| P-67 | Script export (R and Python) | 2 | results, shell-project | M |
| P-68 | Leave a value out of one analysis | 2 | results, shell-project | M |
| P-69 | "What this means" for every analysis | 2 | results | M |
| P-70 | Residual QQ plots and histograms as graph sheets | 2 | graphs-export | M |
| P-71 | Save in place and an installable app | 2 | shell-project | M |
| P-72 | Recent projects and saved versions | 2 | shell-project | M |
| P-73 | Compare two versions or two project files | 2 | shell-project | M |
| P-74 | Add sheets from another project | 2 | shell-project | M |
| P-75 | A lab kit file | 2 | shell-project | M |
| P-76 | Import provenance and replayed imports | 2 | grid-import, shell-project | M |
| P-77 | Split a long table by a column | 2 | grid-import | M |
| P-78 | Run a family on many files | 2 | shell-project | M |
| P-79 | Merge tables on an ID and append rows | 2 | grid-import | M |
| P-80 | Decimal comma in graphs, tables and sentences | 2 | results, graphs-export | M |
| P-81 | A Y unit on every table | 2 | grid-import, results | M |
| P-82 | Baseline-adjusted comparison (ANCOVA) | 2 | engine, guided, results | M |
| P-83 | Interaction contrasts for RM designs and custom contrasts | 2 | engine, results | M |
| P-84 | Summary-data (mean, SD, N) parity | 2 | engine, results | M |
| P-85 | Aligned rank transform two-way ANOVA | 2 | engine, results | M |
| P-86 | Count and proportion models (binomial GLM, negative binomial) | 2 | engine, results, guided | M |
| P-87 | General linear mixed model on a long table | 2 | engine, results | M |
| P-88 | Ordinal (proportional-odds) regression | 2 | engine, results, guided | M |
| P-89 | Firth logistic regression for separated data | 2 | engine, results | M |
| P-90 | Competing risks: cumulative incidence and Gray's test | 2 | engine, graphs-export | M |
| P-91 | Parametric survival models | 2 | engine, results | M |
| P-92 | Forest plot of data and combining experiments (meta-analysis) | 2 | engine, graphs-export | M |
| P-93 | Delta-delta and mini-meta estimation plots | 2 | engine, graphs-export | M |
| P-94 | Assay precision and recovery (validation report) | 2 | engine, guided | M |
| P-95 | Power for more designs | 2 | engine, guided | M |
| P-96 | Simulation power for nested designs | 2 | engine, guided | M |
| P-97 | Dose-series planning | 2 | engine, guided | M |
| P-98 | Error propagation through baseline and normalize | 2 | engine, results | M |
| P-99 | Compare fits of global-only and user-defined models | 2 | engine, results | M |
| P-100 | Relative potency from parallel curves, with equivalence | 2 | engine, results | M |
| P-101 | Bootstrap CIs for fitted parameters | 2 | engine, results | M |
| P-102 | Parameter covariance and joint confidence region | 2 | engine, results, graphs-export | M |
| P-103 | Smoothing, splines and spline standard curves | 2 | engine, results | M |
| P-104 | X-axis break and per-curve zero-dose plateaus | 2 | graphs-export, results | M |
| P-105 | Significance stars per time point on XY and lines graphs | 2 | graphs-export | M |
| P-106 | Click a graph element to format it, edit titles in place | 2 | graphs-export | M |
| P-107 | Rich text in labels | 2 | graphs-export | M |
| P-108 | Journal figure presets | 2 | graphs-export | M |
| P-109 | A lab house style | 2 | graphs-export | M |
| P-110 | Align plot areas in layouts | 2 | graphs-export | M |
| P-111 | Log-rank brackets on Kaplan-Meier graphs and panel brackets | 2 | graphs-export | M |
| P-112 | A figure recipe inside exported files | 2 | graphs-export | M |
| P-113 | Kinetic plate-reader exports | 2 | grid-import | M |
| P-114 | Well-list plate exports | 2 | grid-import | M |
| P-115 | Plate layouts by paste, file and project | 2 | guided, grid-import | M |
| P-116 | One plate map per plate | 2 | guided | M |
| P-117 | RDML qPCR import | 2 | grid-import, guided | M |
| P-118 | Multiplex immunoassay: one standard curve per analyte | 2 | guided, engine | M |
| P-119 | Seahorse XF Mito Stress Test module | 2 | guided, engine | M |
| P-120 | TCID50 endpoint titre | 2 | guided, engine | M |
| P-121 | GR metrics | 2 | engine, guided | M |
| P-122 | Western blot linear range | 2 | guided, engine | M |
| P-123 | Blot image attached to the densitometry table | 2 | guided, graphs-export | M |
| P-124 | Blind a table | 2 | grid-import, shell-project | M |
| P-125 | Plate randomisation and a confounding check | 2 | guided | M |
| P-126 | Exercise links for teaching | 2 | shell-project | M |
| P-127 | Open the validation datasets | 2 | shell-project | M |
| P-128 | ELN-ready export | 2 | graphs-export | M |
| P-129 | Mixed models for counts and proportions (GLMM) | 3 | engine, results | L |
| P-130 | ANOVA with four or more factors and user contrasts | 3 | engine, results | L |
| P-131 | Benchmark dose (BMD, BMDL) | 3 | engine, results | L |
| P-132 | Differential and implicit user equations | 3 | engine | L |
| P-133 | Data sets from several tables on one graph | 3 | graphs-export, shell-project | L |
| P-134 | Whole-project report | 3 | graphs-export, results | L |
| P-135 | The interface in other languages | 3 | shell-project | L |
| D-01 to D-18 | Deferred and research-only items | Deferred | various | various |

Counts: Wave 0 has 10, Wave 1 has 53, Wave 2 has 65, Wave 3 has 7,
Deferred has 18.

## Scope and limits

1. Browser only. Every computation runs client-side in Pyodide. No server, account, upload or runtime call to a third party; offline after the first visit; static hosting.
2. Runtime packages are numpy and scipy (`web/src/lib/engine.ts` loads only these from `packageBaseUrl`, with no CDN fallback), plus openpyxl on demand. Every on-demand wheel must be vendored into `web/public/pyodide/` to stay offline.
3. statsmodels, pandas and patsy are in `pyodide-lock.json` but not shipped. Adding them grows the 30 MB first visit that DECISIONS 0.3 names as the biggest risk, so a feature may use them only with a measured justification (bytes added, seconds on a throttled cold start). They stay test oracles in `engine/tests/`.
4. xlrd, python-calamine and fonttools are in the lock but not vendored either. They load on demand (not on first visit), but each still needs vendoring and a size note.
5. No telemetry and no third-party runtime calls, including fonts, CDNs and ELN or LIMS APIs.
6. Ruling 10 (UI-UX-PLAN, CLAUDE.md rule 3): exported figures, the classic theme, print CSS, results numbers and statistical wording keep their exact look and meaning unless the change is the point of the task and is pinned in `e2e-figures` / `e2e-export` in the same PR. P-02, P-03, P-04 and P-24 change scientific output on purpose.
7. The design system is fixed (CLAUDE.md, `docs/design/`). Every feature uses an existing surface: data grid, Analyze menu, results answer pane with the Checks row and typeset table, graph sheet, layout sheet, guided wizards, File and View menus, the Cmd+K palette, toasts and banners. No new component variants.
8. Changes to `web/src/project/types.ts` or the saved file need the lead's sign-off (CLAUDE.md rule 4) and a load test of every older fixture. Risks lines flag them as "data-model change".
9. Every number is cross-checked against an independent implementation (R or Python package, published dataset, or hand derivation) in `engine/tests/` or the e2e suites before merge. A Validation line that says "pin from reference output" means the reference must be run and its numbers pinned in the test; no number in this plan is a pin.
10. Prism is named only nominatively (".pzfx file"); never "alternative", "clone", "replacement" or "parity" in user-facing text.

## Spot-check at HEAD

The claims this plan leans on most were checked again in the code at
4b20864. All held except where noted.

| Claim | Evidence | Result |
|---|---|---|
| One shared autosave slot, rotated on every boot | `web/src/project/autosave.ts:5-7, 128-137`; no `BroadcastChannel` or `navigator.locks` in `web/src` | Holds |
| No persistent-storage request | no `storage.persist` / `storage.estimate` in `web/src` | Holds |
| PDF text spelled in WinAnsi with substitutes (10⁻⁶ becomes "10-6", Δ becomes "Delta ") | `web/src/export/pdf.ts:1-30` | Holds |
| No font inlined for raster export | no `@font-face` or `woff` in `web/src/export`; `svgToCanvas` draws SVG as an image (`export/figure.ts:186`); plot font is "Inter Variable" (`lib/palette.ts:131`) | Holds; effect still to be measured (P-03) |
| Column box plot uses Plotly's own quartiles | `components/ColumnPlot.tsx:125-136` passes raw values with `type: "box"`; column stats offer `percentileMethod: "linear" \| "prism"` (`project/types.ts:388`) | Holds |
| Densitometry picker accepts .xls and decodes it as UTF-8 | `sheets/assays/densitometry/panels.tsx:246, 253` | Holds |
| Grid paste reads text/plain only | `sheets/common/DataGrid.tsx:337` | Holds |
| xlsx read with `data_only=True, read_only=True` | `lib/engine.worker.ts:264` | Holds |
| XY fits ignore the replicate map | `guide/declareUnit.ts:14-15` ("curve fits keep every value"); no map read in `sheets/xy/run.ts` | Holds |
| eLife "Source data" rule always met | `report/checklists.ts:233, 272` | Holds; the rule is used by the eLife list only (not Nature) |
| Stale "ROUT for column data is on the roadmap" | `engine/opendose/outliers.py:11`; ROUT ships in `methodcomp.py:102` | Holds |
| No residual plots for XY fits or grouped ANOVA | residuals panel mounted only from `components/StatsResults.tsx:5`; multiple regression has its own (`sheets/multivariable/index.ts:275`) | Holds |
| Built-in models offer "= constant" only | `components/ControlsPanel.tsx:33-55` | Holds |
| Generic interpolation returns X without a CI | `engine/opendose/interpolate.py:88-99` | Holds |
| No TOST, Weibull, slope comparison, pairwise proportions, ART, rmcorr, Mauchly, Jonckheere, Passing-Bablok, quasi-Poisson, Firth, ICC (reliability), LoB/LoD, TCID50, GR metrics, mini-meta, ANCOVA, competing risks | grep over `engine/opendose` and `web/src`, tests excluded: no relevant hits | Holds |
| FWER methods lack Hochberg and Hommel | `engine/opendose/fdr.py:48` | Holds |
| No xlsx writer, no manifest, Save always downloads | nothing in `web/src/export`; `web/public/` has no manifest; `app/commands.ts:109-120` | Holds |
| A lone CSV or XLSX drop falls through | `share/recipes/dropKind.ts:12-18`; `OPEN_ACCEPT` is `.json,.pzfx,.prism,.zip` (`app/useFileOpen.ts:13`) | Holds |
| Data notes return "none" for assays, multiple-variables, contingency | `project/dataNotes.ts:70-73` | Holds |
| 70 `Math.min/max(...spread)` calls | grep in `web/src`, tests excluded | Holds (70) |
| N-07: no "What this means" for Cox | `report/meaning.ts:879` handles `cox` and `mv_cox` | **False.** P-69 drops Cox from its scope |
| needs.md Appendix B and F-11: KB missing next to pA2 | `engine/opendose/schild.py:134` returns KB | **False.** KB is shipped; P-49 keeps only the Schild plot |
| W-03: readers "served on demand like openpyxl" | `web/public/pyodide/v314.0.3/` holds only numpy, scipy, openpyxl and et_xmlfile wheels | Corrected: xlrd and calamine must be vendored first (P-34) |

A reusable piece the inputs did not mention: a LOWESS (Cleveland 1979,
R `lowess()` defaults) already exists in TypeScript at
`web/src/sheets/survival/cox.ts:511`; P-103 should move it to the engine
rather than write a second one.

## Wave 0: correctness and data safety

These can lose work or put a wrong number or symbol in front of a
reader. Ship them before any new feature. Order inside the wave: P-01,
P-05, P-06, P-07, P-02, P-03, P-04, P-10, P-09, then P-08 (the largest).

### P-01 Autosave that is safe with several tabs
- **Sources:** X-03, W-23, X-04
- **What the user can do:** Work in two or more tabs without one tab's autosave overwriting another's. On the next start every unsaved session is offered, and the browser is asked to keep OpenDose's storage so Safari's eviction does not delete it.
- **Acceptance test:** Open tab A on the dose-response example and tab B on a new column table; type 1, 2, 3 into B and change one Y value in A; close both; open a new tab. The restore banner lists both sessions by title and time, and each restores its own edits. Preferences shows storage use and whether persistence was granted.
- **Validation:** No numbers. Playwright with two pages in one context (edit both, reload, both recoverable); each restored JSON equals `serializeProject` of its tab byte for byte; unit test with a mocked StorageManager.
- **Engine work:** none.
- **UI home:** Toasts-banners (the start-screen restore banner; one Banner when another tab already holds this session); Preferences for the storage line.
- **Territory:** shell-project. **Effort:** M.
- **Risks:** Today's "current"/"previous" records need a one-time migration. Use Web Locks to decide which tab owns a session. Safari may refuse `persist()`; say so and never promise. Opening a new tab must never rotate a live tab's slot.

### P-02 PDF export with an embedded Unicode font
- **Sources:** F-29
- **What the user can do:** Export a graph or a layout to PDF and get µ, Δ, ≤, the minus sign, superscript minus and subscript digits exactly as typed, as selectable text.
- **Acceptance test:** Set a Y title "ΔF/F₀ ≤ 1" and an X title "Ca²⁺ (10⁻⁶ M)" on the example graph and export PDF. Text extracted by pdf.js equals both strings; today it reads "Delta F/F0 <= 1" and "Ca²? (10-6 M)" (⁺ has no substitute, so it becomes "?").
- **Validation:** e2e-export asserts `/FontFile2` and a `ToUnicode` map, extracted text equal to a fixed label set, and glyph advance widths that match the SVG export within tolerance; pypdf extraction as a second reader in a test.
- **Engine work:** none (subset in TypeScript; fonttools in the worker is possible but must be vendored).
- **UI home:** Graph sheet and layout export panel; no new choice.
- **Territory:** graphs-export. **Effort:** M.
- **Risks:** Ruling 10: the e2e-export pin on `/BaseFont /Helvetica` changes on purpose in the same PR. The font must be OFL or Apache (Liberation Sans or Arimo, metric-compatible with Arial, or the Inter build the app ships); Arial and Helvetica cannot be embedded. File size grows by the subset.

### P-03 Exported raster and SVG text in the intended font
- **Sources:** F-30
- **What the user can do:** PNG, TIFF, JPEG and WebP exports use the same typeface on every machine and match the screen; exported SVGs carry or name a font the recipient will have.
- **Acceptance test:** In a CI container without Inter installed, export the example IC50 graph as PNG at 300 dpi. The axis title's measured pixel width equals the on-screen width times the scale within 1 px.
- **Validation:** First a measuring check in e2e-tiff or e2e-export (text width in the PNG against a reference render with the font present). If it fails, inline a base64 font subset before rasterising and pin a pixel test of a fixed string.
- **Engine work:** none.
- **UI home:** Export panel; no new UI.
- **Territory:** graphs-export. **Effort:** S for the check; M if inlining is needed.
- **Risks:** The effect is unmeasured: an SVG drawn as an image cannot load the page's self-hosted font, so a fallback font is likely. Ruling 10 pins change if the fix lands. Do it after or with P-02 so one font choice serves both.

### P-04 One box-plot definition
- **Sources:** F-25
- **What the user can do:** Box plots on column and grouped graphs take their quartiles from the project's percentile method and their whiskers from a stated rule, so a box always agrees with the column statistics table.
- **Acceptance test:** Column table with 1, 2, 3, 4, 5, 6, 7, 8, 9, 100; set the percentile method to "prism" in column statistics; draw a box plot. Q1, median and Q3 read from the drawn trace equal the statistics table, and the legend names the whisker rule (Tukey 1.5 × IQR by default; min-max, 10-90, 5-95 and 2.5-97.5 on offer).
- **Validation:** R `quantile(type = 6)` and `quantile(type = 7)`, `boxplot.stats`; e2e-figures reads q1, median, q3 and fences from the trace and compares them with the column statistics.
- **Engine work:** none (precompute in TypeScript and pass q1/median/q3/fences to Plotly, as `sheets/grouped/stats.ts:104-131` already does).
- **UI home:** Graph sheet settings; the legend sentence.
- **Territory:** graphs-export. **Effort:** S.
- **Risks:** Ruling 10: existing box plots change. Today the column box uses Plotly quartiles with Tukey whiskers and the grouped box uses type 7 with min-max whiskers; pick one default, pin both in e2e-figures, and note the change for reopened projects.

### P-05 Full-precision paste from Excel and Google Sheets
- **Sources:** W-01
- **What the user can do:** Paste a column that Excel shows rounded and get the stored full value; the paste report says how many cells were shown rounded.
- **Acceptance test:** In Excel 365 a column holds 0.123456, 0.234567 and 0.345678 formatted to two decimals (it shows 0.12, 0.23, 0.35). Copy and paste into a column table: the cells hold the six-decimal values and the report says "3 cells were shown rounded in Excel; the full values were used". A paste from a text editor behaves as today.
- **Validation:** Clipboard fixtures captured from Excel 365 on Windows and Mac, LibreOffice Calc and Google Sheets for a workbook with known values; assert cell by cell against openpyxl reading the same .xlsx.
- **Engine work:** none.
- **UI home:** Data grid paste and the paste report strip.
- **Territory:** grid-import. **Effort:** S.
- **Risks:** Excel writes `x:num` only for some formats and Sheets uses `data-sheets-value`; dates, percents and text keep today's path. If the HTML and text grids differ in shape, fall back to text/plain and say so.

### P-06 An xlsx import that never drops values silently
- **Sources:** W-05
- **What the user can do:** Import a workbook and be told when formula cells have no cached value or rows are hidden by a filter, then skip or keep them.
- **Acceptance test:** Workbook A, written by openpyxl with five `=A2*2` formulas and no cached values: the import report names the five cells that would read as blank. Workbook B, with an Excel AutoFilter hiding rows 4 to 6: the report says "3 rows are hidden by a filter in Excel"; the default matches what copying the range in Excel gives (visible rows), and one click keeps them.
- **Validation:** The two fixtures; Excel's own copy of visible cells as the outside reference for B; openpyxl in normal mode (`data_only=False`) for A.
- **Engine work:** worker reader in `web/src/lib/engine.worker.ts`: detect formulas without cached values and read `<row hidden="1">` from the sheet XML.
- **UI home:** Import dialog report line, styled as the paste report.
- **Territory:** grid-import. **Effort:** S.
- **Risks:** read-only mode does not expose row visibility; parsing the XML directly avoids loading large workbooks in normal mode.

### P-07 File pickers that decode bytes correctly
- **Sources:** W-04, W-03 (the densitometry bug)
- **What the user can do:** Every file picker detects UTF-16 with a BOM, UTF-8, and otherwise Windows-1252, so µ, ° and StepOne's Cyrillic "т" survive; the densitometry picker stops offering .xls files it cannot read.
- **Acceptance test:** Open one ImageJ results file saved as UTF-8, UTF-8 with BOM, UTF-16LE and cp1252 through the densitometry, plate, qPCR and flow pickers, the recipe dialog and Apply to new data: identical tables, with "µm²" intact. Choosing a .xls in the densitometry picker gives "Save it as .xlsx or .csv" (until P-34 reads .xls) instead of binary garbage.
- **Validation:** The four encoding fixtures must decode to identical cells.
- **Engine work:** none.
- **UI home:** Guided wizard file pickers, Import dialog (keeps its manual override), Apply to new data.
- **Territory:** grid-import. **Effort:** S.
- **Risks:** A file without a BOM that is valid UTF-8 must be read as UTF-8 before guessing cp1252. One shared `textOf(bytes)` helper, not five copies.

### P-08 Curve fits that respect the replicate map (potency across experiments)
- **Sources:** N-01, S-36, F-14, W-19
- **What the user can do:** When an XY table carries a replicate map, see one fit per experiment and a summary across experiments: mean logIC50 (pIC50) with SD and a t-based 95% CI, the geometric-mean IC50 with its asymmetric CI, and n = experiments. The per-experiment logIC50 values go to a linked column table for a t test or ANOVA between compounds. First step, shipped on its own: a Checks row chip on pooled fits that says the CI counts wells, not experiments.
- **Acceptance test:** XY table with 8 concentrations and 3 experiments of 3 wells each (replicate map: blocks of 3 subcolumns), fitted with log(inhibitor) vs response, variable slope. The results show three per-experiment IC50 values, then "Across experiments: pIC50 mean, SD, 95% CI on 2 df, n = 3 experiments" and the geometric-mean IC50 with its CI. A linked column table holds the three logIC50 values; changing one Y value updates the fit, the summary and the table.
- **Validation:** Hand derivation (t interval on log10 IC50, then antilog); R `drc::drm(..., fct = LL.4())` per experiment and `t.test` on the logIC50 values; pin from reference output before merging.
- **Engine work:** per-experiment calls to the existing `nlfit` path; a small `potency_summary` helper in the engine so the summary numbers have one source.
- **UI home:** Results answer pane (an "Across experiments" block whose key fact is the mean pIC50), Checks row chip, typeset table; the linked table through `project/derived.ts` and `app/linkedTable.ts`.
- **Territory:** engine, results. **Effort:** M.
- **Risks:** An experiment whose fit is ambiguous, unconverged or extrapolated must be named and either excluded with a reason or block the summary; never average IC50 on the linear scale. Update the comment in `guide/declareUnit.ts:14-15`. Data-model change (a linked table derived from fits).

### P-09 Honest checklist rule and stale docstrings
- **Sources:** X-01 (the checklist status), spot-check findings
- **What the user can do:** The eLife "Source data available" item stops ticking itself. It says what the bundle gives (each table as CSV) and what is missing (source data per figure) until P-65 ships.
- **Acceptance test:** Open the eLife checklist on the example project: the item shows as not yet met with that reason and a link to the export bundle. After P-65 it turns met once a layout exists and its source data can be exported.
- **Validation:** Unit test on the rule.
- **Engine work:** docstring only: `engine/opendose/outliers.py:11` says ROUT for column data "is on the roadmap"; it ships in `methodcomp.py:102`.
- **UI home:** Results (Checklist panel).
- **Territory:** results. **Effort:** S.
- **Risks:** none.

### P-10 Large arrays without a RangeError
- **Sources:** W-42
- **What the user can do:** Paste or import a few hundred thousand values and get graphs and analyses instead of a crash.
- **Acceptance test:** Paste 500,000 rows into an XY table and into a column table; the graphs draw on the WebGL path and the analyses run.
- **Validation:** e2e paste test on both table types.
- **Engine work:** none.
- **UI home:** none (no new surface).
- **Territory:** graphs-export (the calls are spread across `web/src`). **Effort:** S.
- **Risks:** Replace only spreads over data values (for example `components/PlotPanel.tsx:217`, `components/ColumnPlot.tsx:92`) with a loop helper; keep empty-array behaviour identical.

## Wave 1: quick wins (S)

Small builds on engines and surfaces that already exist. Suggested order
inside the wave follows value: P-11 to P-18 first (honesty and the most
asked-for tests), then fitting and figures (P-19 to P-26), then the rest.
Dependencies: P-17 reuses the linked-table plumbing from P-08; P-63
needs P-02.

### P-11 Residual plots for every curve fit and every ANOVA
- **Sources:** N-02, F-01
- **What the user can do:** See residuals against X and against fitted Y, plus a residual QQ plot, for any curve fit or linear regression (weighted residuals when the fit is weighted), and for two-way, three-way, RM one-way with three or more treatments, nested and mixed models.
- **Acceptance test:** Fit the dose-response example with a 4PL and open the Checks row: a Residuals section shows residual vs X, residual vs fitted and a QQ plot with 24 points. On a 2 × 3 grouped table with 4 replicates, two-way ANOVA shows a QQ plot of 24 cell-mean residuals.
- **Validation:** R `residuals(nls(...))` and scipy `curve_fit` on the NIST StRD problems the engine tests already use; weighted residuals against R `nls(weights = )`; ANOVA residuals against R `residuals(aov(y ~ A * B))`, statsmodels `ols(...).resid` and `AnovaRM`; pin from reference output before merging.
- **Engine work:** return residuals from `nlfit.fit_model` (computed, not returned: `nlfit.py`), add cell-mean and subject-plus-treatment residuals for the grouped and RM handlers.
- **UI home:** Results Checks row, the same `ResidualsSection` component the column tests use.
- **Territory:** engine, results. **Effort:** S (two small PRs: fits, then ANOVA).
- **Risks:** Residual plots inform; they must not suggest choosing a test from a normality P (do-not-build 5).

### P-12 Equivalence and non-inferiority tests (TOST)
- **Sources:** S-01, X-13
- **What the user can do:** Show "no meaningful difference": give a margin in data units or as a ratio and get the two one-sided tests, the 90% CI drawn against the margin, and a plain verdict, for unpaired, Welch, paired, one-sample and log-ratio comparisons and for two proportions.
- **Acceptance test:** Two groups of 8 with means 10.0 and 10.2 and SD 0.5; margin ±1. The answer pane says "Equivalent within ±1", and the 90% CI (about -0.24 to 0.64 by hand) sits inside the margin lines. With margin ±0.5 the verdict is "Not shown to be equivalent".
- **Validation:** statsmodels `ttost_ind` / `ttost_paired`; R `TOSTER::t_TOST`; Schuirmann 1987 identity (P_TOST is the larger one-sided P and rejects exactly when the 1 - 2α CI lies inside the margins); pin from reference output before merging.
- **Engine work:** `ttests.py` (reuse `one_sided_t`), `proportions.py` (Newcombe CI exists).
- **UI home:** Column analysis controls (an "Equivalence" option with the margin), results answer pane verdict, a margin chip in the Checks row; estimation plot margin lines.
- **Territory:** engine, results. **Effort:** S.
- **Risks:** The margin must be set before looking at the data; the plan sheet should record it (P-61 link). Wording must not turn a failed TOST into "different".

### P-13 Compare slopes and intercepts of regression lines
- **Sources:** N-26, S-29
- **What the user can do:** With two or more data sets in linear regression, get the F test for equal slopes, then (if parallel) the test for equal intercepts, the slope difference with its CI and the pooled line.
- **Acceptance test:** Zar (2010) §18.1-18.4 worked example entered as two XY data sets: the results show the slope F, its P, the elevation test and the common slope, matching the book.
- **Validation:** Zar worked examples; R `anova(lm(y ~ x + g), lm(y ~ x * g))`; statsmodels ols; pin from reference output before merging.
- **Engine work:** `linregress.py` (closed-form ANCOVA of lines), new handler in `api.py`.
- **UI home:** XY linear regression results: a "Compare slopes and intercepts" block in the typeset table.
- **Territory:** engine, results. **Effort:** S.
- **Risks:** Say plainly that the intercept test is meaningful only when slopes are not shown to differ.

### P-14 Pairwise comparisons of proportions after an r x c test
- **Sources:** N-21, S-15
- **What the user can do:** After a chi-square or Fisher test on three or more rows, compare each pair of rows (Fisher or chi-square per pair) with Holm, BH or Bonferroni, with the family stated, and draw the brackets on the contingency graph.
- **Acceptance test:** Rows WT 18/20, Het 15/20, KO 5/20 positive. The pairwise table lists three comparisons with raw and Holm-adjusted P; WT vs KO and Het vs KO stay below 0.05 after adjustment, WT vs Het does not. The FamilyLine says "3 comparisons, Holm".
- **Validation:** R `pairwise.prop.test(p.adjust = "holm")`, `rcompanion::pairwiseNominalIndependence`; scipy `fisher_exact` per pair plus `fdr.adjust`; pin from reference output before merging.
- **Engine work:** `contingency.py` pairwise family; reuse `fdr.adjust`.
- **UI home:** Contingency results typeset table with the FamilyLine; brackets on the contingency graphs.
- **Territory:** engine, results. **Effort:** S.
- **Risks:** Default to Fisher at small counts and say which test each pair used.

### P-15 Say when a rank test cannot reach significance
- **Sources:** N-28
- **What the user can do:** Before reading a rank-test result, see when the design cannot reach P < α at all, and a suggestion to use the parametric test on a suitable scale.
- **Acceptance test:** Mann-Whitney on 1, 2, 3 vs 4, 5, 6: the Checks row says "With 3 and 3 values the smallest possible two-sided P is 0.10, so this design cannot reach P < 0.05", with a link to the t test on a log scale.
- **Validation:** Hand derivation (smallest two-sided P = 2 / C(n1 + n2, n1)); scipy `mannwhitneyu(method = "exact")` and `wilcoxon` exact; the existing `exactdist.py`.
- **Engine work:** a min-attainable-P helper in `exactdist.py` for Mann-Whitney, Wilcoxon, Kruskal-Wallis and Friedman.
- **UI home:** Results Checks row (the withheld and small-n family), guided wizard explainer.
- **Territory:** results, guided. **Effort:** S.
- **Risks:** Not a reason to switch tests after seeing the data; word it as a design fact.

### P-16 An "Analysed" line for every result
- **Sources:** N-08
- **What the user can do:** See n used and which rows were dropped and why for multiple, logistic and Poisson regression, Cox, contingency and the assay modules.
- **Acceptance test:** Multiple-variables table of 30 rows where 4 rows have a blank predictor; run multiple regression. The notes strip says "Analysed 26 of 30 rows; 4 dropped for a blank in Age (rows 3, 9, 17, 22)".
- **Validation:** statsmodels `OLS/GLM(missing = "drop").nobs`; R `nobs(lm(...))` and `na.action`.
- **Engine work:** return dropped row indices where the handlers drop rows (listwise deletion in `multivar.py`, `cox.py`).
- **UI home:** Results notes strip.
- **Territory:** results. **Effort:** S.
- **Risks:** `project/dataNotes.ts:70-73` returns "none" for these on purpose (assays read text by design); each kind needs its own reader, not one rule.

### P-17 Fit summary table and best-fit values to a linked table
- **Sources:** N-17, W-19, F-14 (the linked-table half)
- **What the user can do:** For an XY results sheet with many data sets, see one sortable row per data set (IC50 or EC50 with CI, Hill slope, Top, Bottom, R², flags and their reasons) and send it to a linked table for CSV, graphs and tests.
- **Acceptance test:** XY table with 12 compounds, one data set each, fitted with a 4PL; one compound never reaches its bottom plateau. A typeset table above the cards lists 12 rows, the incomplete one flagged "Extrapolated" with its reason. "Table of parameters" makes a linked table with the same 12 rows.
- **Validation:** Each row equals its data set's card (unit test).
- **Engine work:** none.
- **UI home:** Results typeset table above the per-curve cards; linked table as for the assays.
- **Territory:** results. **Effort:** S.
- **Risks:** Depends on P-08's linked-table plumbing. Data-model change if a new derived table kind is needed.

### P-18 Ratio to control with a Fieller CI
- **Sources:** S-02
- **What the user can do:** Report treated over control (or % of control) with its Fieller interval for an unpaired t test and each Dunnett comparison, instead of a bare percentage.
- **Acceptance test:** Control 100, 95, 105, 98, 102 and treated 60, 70, 65, 55, 75. The typeset table adds "Ratio treated/control" with a 95% Fieller CI; the "What this means" sentence uses the ratio and its CI.
- **Validation:** R `mratios::ttestratio`; hand Fieller (1954); a coverage check with the existing simulate engine; pin from reference output before merging.
- **Engine work:** reuse `compare_params.fieller_ratio` in the t test and Dunnett handlers.
- **UI home:** Results typeset table row next to the difference; methods sentence.
- **Territory:** engine, results. **Effort:** S.
- **Risks:** When the control mean's CI includes zero the interval is unbounded; say so instead of printing numbers. Changes results wording (ruling 10): pin it.

### P-19 Weibull and hormesis dose-response models
- **Sources:** F-10, X-12
- **What the user can do:** Fit drc's Weibull W1.4 and W2.4 and the Brain-Cousens and Cedergreen-Ritz-Streibig hormesis models on the concentration scale, so the zero dose stays in, with ECx and CI.
- **Acceptance test:** Load drc's `ryegrass` data (rootl vs conc) as an XY table and fit W1.4: the parameters, SEs and ED50 with CI appear with the zero-dose point kept in the fit.
- **Validation:** R `drc::drm(rootl ~ conc, fct = W1.4())` on `ryegrass` and `BC.4()` on `lettuce`; Ritz et al. 2015 PLOS ONE; pin from reference output before merging.
- **Engine work:** registrations in `equations.py` with initial-value rules.
- **UI home:** Equation library picker (dose-response families).
- **Territory:** engine. **Effort:** S.
- **Risks:** ECx for asymmetric models is not the "c" parameter; label it.

### P-20 Range constraints on built-in models
- **Sources:** F-02
- **What the user can do:** Constrain a built-in model's parameter to a range (Bottom > 0, HillSlope between -3 and -0.3, Kd > 0), not only hold it constant, with the reason recorded.
- **Acceptance test:** A dose-response data set whose free fit gives a negative Bottom; set "Bottom > 0" with the reason "signal cannot be negative". The fit sits at the bound, the parameter row says "at its constraint: SE not reliable", and the methods sentence states the constraint and reason.
- **Validation:** scipy `least_squares(bounds = )` and R `nls(algorithm = "port", lower = , upper = )` on the same data; pin from reference output before merging.
- **Engine work:** none new (`nlfit.py:797-810` honours `spec.bounds`); pass bounds from the UI.
- **UI home:** Results sheet fit controls (constraint row: constant, greater than, less than, between).
- **Territory:** results, engine. **Effort:** S.
- **Risks:** Constraints can hide a bad design; require a reason (do-not-build 9 offers constraints only "with a stated reason"). Relational constraints stay out.

### P-21 Initial values shown, typed and exported
- **Sources:** F-03, N-14
- **What the user can do:** See the initial values a fit started from, type their own for built-in models, and export a complete fit report (equation, initial values, constraints, weighting, CI method, every parameter with SE and CI) as CSV or text.
- **Acceptance test:** Fit the example 4PL; open "Initial values": four values appear, generated by the rules in `equations.py`. Type a different start for LogIC50; the fit converges to the same estimates. "Copy fit report" includes the initial values.
- **Validation:** The returned values equal the documented rules; with the same start, the converged result matches R `nls`; pin from reference output before merging.
- **Engine work:** return `init` from `nlfit.fit_model`; accept user initial values.
- **UI home:** Results sheet fit controls ("Initial values" fold); results export.
- **Territory:** engine, results. **Effort:** S.
- **Risks:** Saved projects gain an option; old projects must load with "automatic".

### P-22 Interpolated unknowns with CIs, drawn on the graph
- **Sources:** F-05
- **What the user can do:** Interpolate unknowns (Y rows with no X) from any fitted curve and get each X with its CI, drawn as markers on the graph.
- **Acceptance test:** A BCA standard curve (7 standards) fitted with a quadratic plus 3 unknown rows with Y only: the typeset table lists each interpolated X with its 95% CI, and the graph shows three markers on the curve.
- **Validation:** R `investr::invest` (inversion intervals) for linear and nls fits; reuse the standard-curve band-crossing tests; e2e-figures checks marker positions; pin from reference output before merging.
- **Engine work:** `interpolate.py` gains band-crossing CIs (port from `assay_stdcurve.py:178-185`).
- **UI home:** Results typeset table and XY graph markers.
- **Territory:** engine, results, graphs-export. **Effort:** S.
- **Risks:** Unknowns outside the standards' range must be flagged "extrapolated", never silently reported.

### P-23 IC50 and EC50 drop lines on fit graphs
- **Sources:** N-45, F-21
- **What the user can do:** Show dashed drop lines from the 50% response to both axes at the fitted IC50 or EC50, with an optional value label, moving with the fit.
- **Acceptance test:** Turn on "Show IC50" on the example graph: the vertical line's x equals the reported logIC50 and its y equals the curve at that x; changing a Y value moves it.
- **Validation:** e2e-figures reads the line coordinates; relative and absolute IC50 choices both tested.
- **Engine work:** none.
- **UI home:** Graph sheet settings and Format graph.
- **Territory:** graphs-export. **Effort:** S.
- **Risks:** Hide the line when the IC50 is extrapolated or ambiguous, with the reason in the legend.

### P-24 A curve-fit legend that names the model, band and exclusions
- **Sources:** F-37
- **What the user can do:** The figure legend of a curve-fit graph names the model, what was fitted (each replicate or the means, weighting), what the band is (95% confidence or prediction) and any ROUT exclusions.
- **Acceptance test:** Fit the example with a 4PL, weighting 1/Y², confidence band on, one ROUT outlier: the legend reads in that order and names the excluded point.
- **Validation:** `node --test` on legend strings from fixture results; e2e-figures checks the in-figure caption.
- **Engine work:** none.
- **UI home:** Graph legend card and the in-figure caption.
- **Territory:** graphs-export. **Effort:** S.
- **Risks:** Ruling 10: legend wording is scientific output; pin it.

### P-25 Geometric mean with geometric SD, and the bar-axis warning
- **Sources:** F-24, N-40
- **What the user can do:** Plot the geometric mean with ×/÷ geometric SD (or a back-transformed CI) on log axes, and get a Checks note when bars sit on a log axis or on a value axis that does not include zero.
- **Acceptance test:** Column table of fold changes 0.5, 1, 2, 4 per group, log Y axis: choose "Geometric mean ×/÷ geometric SD"; the bar ends read from the trace equal exp(mean(log x)) times or divided by exp(sd(log x)). Switching to bars with Y starting at 1 shows the note offering points or an axis break.
- **Validation:** Hand and R `exp(mean(log(x)))`, `exp(sd(log(x)))`; e2e-figures reads the error-bar ends.
- **Engine work:** none.
- **UI home:** Graph sheet settings (summary select); Checks row note.
- **Territory:** graphs-export, results. **Effort:** S.
- **Risks:** Legend must name the geometric summary.

### P-26 Median with IQR when a rank test is the analysis
- **Sources:** N-36
- **What the user can do:** When the analysis is a rank test, the summary and the bound graph default to median with IQR, with one line on what the test compares.
- **Acceptance test:** Choose Mann-Whitney on the example column table: the graph switches from mean ± SD to median with IQR and the results say "compares distributions (ranks), shown as median and IQR".
- **Validation:** numpy medians and quartiles with the stated percentile method.
- **Engine work:** none.
- **UI home:** Graph sheet defaults; results answer pane line.
- **Territory:** graphs-export, results. **Effort:** S.
- **Risks:** Only change defaults on new graphs or on graphs the user has not formatted; never rewrite a figure the user styled.

### P-27 Repeated-measures correlation
- **Sources:** S-22
- **What the user can do:** Correlate X and Y when each animal or donor contributes several pairs, with a Subject column, and get the within-subject r with CI and df; a chip appears when a subject column exists but is ignored.
- **Acceptance test:** Bland & Altman 1995 pH/PaCO₂ data (47 observations, 8 subjects) with a Subject column: the result reports rm-corr r, its CI and df = 38.
- **Validation:** R `rmcorr::rmcorr`; pingouin `rm_corr`; Bakdash & Marusich 2017; pin from reference output before merging.
- **Engine work:** `correlation.py` (common-slope ANCOVA, closed form).
- **UI home:** Analyze menu (Correlation with a Subject role); Checks row chip.
- **Territory:** engine, results. **Effort:** S.
- **Risks:** Say it measures the within-subject association only, not between-subject.

### P-28 Difference in survival at a chosen time
- **Sources:** S-33
- **What the user can do:** Get S_A(t) minus S_B(t) at a chosen time (for example day 30) with a CI and P.
- **Acceptance test:** R `survival::lung` entered as a two-group survival table (sex): at 365 days the "Survival at chosen times" table gains a difference row with CI and P.
- **Validation:** Klein et al. 2007 cloglog test; hand derivation from R `summary(survfit, times = 365)` SEs; pin from reference output before merging.
- **Engine work:** `survival_extras.survival_at_times` gains a contrast.
- **UI home:** Survival results typeset table.
- **Territory:** engine, results. **Effort:** S.
- **Risks:** The time must be prespecified; say so.

### P-29 Limit of blank, detection and quantification
- **Sources:** N-30, S-43, F-13
- **What the user can do:** From blank and low-level replicates, get LoB and LoD (CLSI EP17) and LoQ, back-transformed through the fitted standard curve, next to the existing LLOQ and ULOQ; for qPCR, a labelled LoD95 from a dilution hit-rate series.
- **Acceptance test:** ELISA standard curve plus 20 blank wells and 20 low-sample wells: the quantification-range card shows LoB = mean_blank + 1.645 SD_blank and LoD = LoB + 1.645 SD_low in signal and in concentration.
- **Validation:** Armbruster & Pry 2008 formulas by hand; R `chemCal::lod` / `loq` on `din32645`; probit LoD95 against R `glm(binomial(probit))`; pin from reference output before merging.
- **Engine work:** `assay_stdcurve.py`; LoD95 reuses `quantal.py` ECx with Fieller CI.
- **UI home:** Standard-curve guided wizard ("Blanks and low samples" step) and its results; qPCR module.
- **Territory:** engine, guided. **Effort:** S.
- **Risks:** State the method (parametric or nonparametric) and the number of replicates CLSI asks for.

### P-30 qPCR no-template and no-RT control checks
- **Sources:** N-18
- **What the user can do:** Flag amplification in NTC and no-RT wells and see which samples it affects before ΔΔCq.
- **Acceptance test:** A qPCR plate where one NTC well for GAPDH has Cq 34: the QC step shows a warning chip "NTC amplified for GAPDH (Cq 34)" and lists the GAPDH samples.
- **Validation:** MIQE (Bustin et al. 2009) rules; hand-built plates.
- **Engine work:** `assay_qpcr.py` QC block.
- **UI home:** qPCR guided wizard QC chips.
- **Territory:** guided. **Effort:** S.
- **Risks:** Thresholds (for example Cq difference to the sample) must be stated and editable.

### P-31 Full flow gate path in the methods
- **Sources:** N-11
- **What the user can do:** The flow module's methods and legend print the full FlowJo gate path (Live/Singlets/CD4+/CD69+), not the last gate.
- **Acceptance test:** Import the flow example; the methods text reads "CD69+ of Live/Singlets/CD4+".
- **Validation:** String check against the imported header.
- **Engine work:** none (the path is parsed already, `sheets/assays/flow/model.ts:86-104`).
- **UI home:** Flow guided wizard results, methods text.
- **Territory:** guided. **Effort:** S.
- **Risks:** Ruling 10 (methods wording): pin it.

### P-32 Keep "why this test" in the project
- **Sources:** N-12
- **What the user can do:** The wizard's reason for the chosen test is saved with the project, so the methods paragraph still says why after reopening or sharing.
- **Acceptance test:** Choose a test in Help me choose, save, reload the file: the methods text still includes the reason.
- **Validation:** Round-trip test.
- **Engine work:** none.
- **UI home:** Results (methods text, results links).
- **Territory:** guided, shell-project. **Effort:** S.
- **Risks:** Data-model change (`guide/choice.ts:1-4` keeps it per session today).

### P-33 Drop or open a single CSV, TSV or XLSX file
- **Sources:** W-02
- **What the user can do:** Drop one table file anywhere on the page, or pick it from Open, and land in the Import dialog with recipe detection.
- **Acceptance test:** Drop `plate.csv` on the page: the Import dialog opens with a preview, not the "copy its cells and paste them" toast; File › Open accepts .csv, .tsv, .txt and .xlsx.
- **Validation:** e2e drop of csv and xlsx fixtures; the table equals the one the Import dialog makes from the same file.
- **Engine work:** none.
- **UI home:** Page drop, File menu Open, start screen, Import dialog.
- **Territory:** grid-import. **Effort:** S.
- **Risks:** Keep `isTableDrop` for 2+ files and zips unchanged.

### P-34 Read .xls and .ods workbooks
- **Sources:** W-03
- **What the user can do:** Open legacy .xls (QuantStudio, StepOne, older plate-reader PCs) and OpenDocument .ods workbooks through the Import dialog, the assay pickers and Apply to new data.
- **Acceptance test:** One sheet saved by LibreOffice as .xls, .ods and .xlsx imports to identical cells in all three.
- **Validation:** openpyxl reading of the .xlsx as the reference.
- **Engine work:** worker readers: xlrd (pure Python) for .xls; python-calamine or odfpy-style parsing for .ods.
- **UI home:** Import dialog, guided wizard pickers, Apply to new data.
- **Territory:** grid-import. **Effort:** S.
- **Risks:** Neither wheel is vendored today; xlrd first (small, pure Python). python-calamine is a compiled wasm wheel: measure its size before adding. Both load on demand only.

### P-35 One-click fix for percent and unit cells
- **Sources:** W-06
- **What the user can do:** When pasted cells read "12.5%" or "3.2 µM", the paste report offers: read as 12.5, read as 0.125, or strip the unit.
- **Acceptance test:** Paste 12.5%, 30%, 47.5%: the report says "3 cells hold a percent sign" with the two choices; nothing changes until one is clicked; undo restores the text.
- **Validation:** Unit tests: the fix reads exactly the typed digits.
- **Engine work:** none.
- **UI home:** Paste report strip action.
- **Territory:** grid-import. **Effort:** S.
- **Risks:** Never apply by default.

### P-36 Find and replace in a table
- **Sources:** W-16
- **What the user can do:** Replace values, row titles, data-set names and text codes such as "n.d." in one undo step.
- **Acceptance test:** Replace "n.d." with an empty cell in a 96-row table: 7 cells change, the report says 7, one undo restores all.
- **Validation:** Unit tests on replaced cells and the undo step.
- **Engine work:** none.
- **UI home:** Data grid find bar ("Replace…"), Cmd/Ctrl+H.
- **Territory:** grid-import. **Effort:** S.
- **Risks:** Excluded cells keep their exclusion and reason.

### P-37 Spreadsheet keys in the grid
- **Sources:** W-18
- **What the user can do:** Use Ctrl/Cmd+Arrow, Ctrl/Cmd+Shift+Arrow, Ctrl/Cmd+A, Ctrl/Cmd+D (fill down), Home and End as in Excel.
- **Acceptance test:** In a 50-row column, Ctrl+Down jumps to row 50; Ctrl+Shift+Up selects to row 1; Ctrl+D fills the selection with the top cell's text.
- **Validation:** Unit and e2e key tests; fill-down writes exactly the source text.
- **Engine work:** none.
- **UI home:** Data grid; the Help keyboard table.
- **Territory:** grid-import. **Effort:** S.
- **Risks:** Conflicts with browser and palette shortcuts; check the existing key map.

### P-38 Pair values by subject ID from a long table
- **Sources:** N-29
- **What the user can do:** Import a long table (mouse, time point, value) into a paired column table where pairs are matched by subject ID, not by order, and see which rows were paired.
- **Acceptance test:** Long table with mice M1 to M6 in a shuffled order for "before" and "after": the column table pairs M1 with M1 and so on, and the import report lists the pairs and any unmatched ID.
- **Validation:** Identity with a hand-aligned wide table.
- **Engine work:** none.
- **UI home:** Import dialog (column output) and "From long table…".
- **Territory:** grid-import. **Effort:** S.
- **Risks:** Duplicate IDs must stop the import with a message.

### P-39 Recipe gaps: SoftMax side by side, Incucyte without Elapsed
- **Sources:** W-09, N-09 (those two parts)
- **What the user can do:** Import SoftMax Pro exports whose wavelengths or plates sit side by side in one row band, and Incucyte exports without an "Elapsed" column.
- **Acceptance test:** A SoftMax dual-wavelength export in the side-by-side layout gives the same two reads as the stacked layout of the same run.
- **Validation:** SoftMax and Incucyte fixtures in both layouts give identical tables.
- **Engine work:** none.
- **UI home:** Import recipes (multi-read, Incucyte).
- **Territory:** grid-import. **Effort:** S.
- **Risks:** Real vendor samples needed; do not guess layouts from one file.

### P-40 RM ANOVA reporting: Mauchly, Huynh-Feldt, partial omega squared
- **Sources:** S-08, S-09 (the ω² part)
- **What the user can do:** See Mauchly's test and the Huynh-Feldt epsilon next to Geisser-Greenhouse in RM one-way and two-way ANOVA, and partial ω² for RM and mixed designs.
- **Acceptance test:** A 10-subject, 4-condition RM table: the sphericity chip in the Checks row lists GG ε, HF ε and Mauchly's W with P; the effect-size block adds partial ω².
- **Validation:** pingouin `sphericity`, `epsilon(correction = "hf")`; R `car::Anova` / `afex` (state which HF formula: Lecoutre 1991); R `effectsize::omega_squared(partial = TRUE)`; pin from reference output before merging.
- **Engine work:** `repeated.py`, `mixedmodel.py`, `effectsize.py`.
- **UI home:** RM ANOVA results Checks row and typeset table.
- **Territory:** engine, results. **Effort:** S.
- **Risks:** Mauchly is reported, not used to choose the correction (GG stays the default).

### P-41 Trend across ordered groups: Jonckheere-Terpstra and Page
- **Sources:** S-10
- **What the user can do:** Test for a monotone trend across ordered dose groups without normality (Jonckheere-Terpstra), and Page's test for repeated measures.
- **Acceptance test:** Page 1963 example as a matched table: the Friedman results gain a Page line matching the published L; a 4-dose column table gains "Trend across ordered columns" with the JT statistic and P.
- **Validation:** R `clinfun::jonckheere.test`, `PMCMRplus::jonckheereTest`; `scipy.stats.page_trend_test`; pin from reference output before merging.
- **Engine work:** `exactdist.py` (exact null for small n), normal approximation with ties.
- **UI home:** Analyze menu (column nonparametric tests); Friedman results.
- **Territory:** engine, results. **Effort:** S.
- **Risks:** Column order must be the dose order; confirm it in the controls.

### P-42 Passing-Bablok and Theil-Sen regression
- **Sources:** S-27
- **What the user can do:** Compare two methods with Passing-Bablok (and Theil-Sen) when the error ratio is unknown or outliers are present, with the CUSUM linearity test.
- **Acceptance test:** The `mcr` package's creatinine example as an XY table: slope and intercept with CIs and the CUSUM result appear next to Deming.
- **Validation:** R `mcr::mcreg(method.reg = "PaBa")`; `scipy.stats.theilslopes`; Passing & Bablok 1983; pin from reference output before merging.
- **Engine work:** new function beside `deming.py`, reusing `orderstats.py` selection.
- **UI home:** Analyze menu (Method comparison); Bland-Altman results link.
- **Territory:** engine, results. **Effort:** S.
- **Risks:** Passing-Bablok assumes positive correlation; refuse with a message otherwise.

### P-43 Lin's concordance correlation coefficient
- **Sources:** S-26
- **What the user can do:** Get Lin's CCC with its CI for agreement on the identity line.
- **Acceptance test:** Bland-Altman example data: a CCC row with CI appears in the Bland-Altman and Deming results.
- **Validation:** Lin 1989 (with the 2000 erratum); R `epiR::epi.ccc`, `DescTools::CCC`; pin from reference output before merging.
- **Engine work:** `methodcomp.py`.
- **UI home:** Results typeset table.
- **Territory:** engine, results. **Effort:** S.
- **Risks:** Low; state that CCC mixes precision and accuracy.

### P-44 Reliability ICC (Shrout-Fleiss / McGraw-Wong)
- **Sources:** S-24
- **What the user can do:** Measure agreement between raters or instruments with the six Shrout-Fleiss forms (single or average, consistency or absolute) and F-based CIs.
- **Acceptance test:** Shrout & Fleiss 1979 Table 4 data (6 targets, 4 judges) as a column table: all six ICCs with CIs, matching the paper's table.
- **Validation:** Shrout & Fleiss 1979 Table 4; R `psych::ICC`, `irr::icc`; pingouin `intraclass_corr`; pin from reference output before merging.
- **Engine work:** two-way ANOVA mean squares (reuse `twoway.py`).
- **UI home:** Analyze menu ("Agreement (ICC)"), results typeset table.
- **Territory:** engine, results. **Effort:** S.
- **Risks:** The form choice confuses users; a short explainer per form and a default (two-way random, absolute, single).

### P-45 Cochran's Q for matched yes/no outcomes
- **Sources:** S-14
- **What the user can do:** Test a yes/no outcome measured on the same subjects under three or more conditions, with pairwise McNemar post tests.
- **Acceptance test:** 12 subjects scored 0/1 under three stains: Q, df = 2, P, and three Holm-adjusted McNemar comparisons.
- **Validation:** statsmodels `cochrans_q`; R `DescTools::CochranQTest`; pin from reference output before merging.
- **Engine work:** `trend.py` (beside McNemar).
- **UI home:** Analyze menu (matched binary layout), results with FamilyLine.
- **Territory:** engine, results. **Effort:** S.
- **Risks:** The table layout (rows = subjects, columns = conditions, 0/1) must be validated on paste.

### P-46 Quasi-Poisson for overdispersed counts
- **Sources:** S-16 (the quasi-Poisson part)
- **What the user can do:** When Poisson regression warns of overdispersion, switch with one click to quasi-Poisson standard errors.
- **Acceptance test:** Colony counts with dispersion well above 1: the Checks chip "Counts are overdispersed (φ = …)" offers the switch; SEs grow by √φ and the methods name quasi-Poisson.
- **Validation:** R `glm(family = quasipoisson)`; pin from reference output before merging.
- **Engine work:** `multivar.py` (SE × √φ; dispersion already computed at `multivar.py:949`).
- **UI home:** Results Checks row chip.
- **Territory:** engine, results. **Effort:** S.
- **Risks:** First step of P-86 (negative binomial).

### P-47 Compare two event rates
- **Sources:** S-17
- **What the user can do:** Compare counts with different exposures (events per hour, per mm², per 10⁶ cells): exact conditional test, rate ratio with CI, exact CI of one rate.
- **Acceptance test:** 23 events in 10 h vs 41 events in 12 h: rate ratio with CI and the exact P.
- **Validation:** R `poisson.test(c(23, 41), c(10, 12))`; statsmodels `test_poisson_2indep`; pin from reference output before merging.
- **Engine work:** `proportions.py` or a new `rates.py` (scipy `binomtest`).
- **UI home:** Analyze menu (a small form, QuickCalc style).
- **Territory:** engine, results. **Effort:** S.
- **Risks:** Low.

### P-48 Partial correlation and comparing two correlations
- **Sources:** S-23
- **What the user can do:** Get partial correlations controlling for chosen variables, and compare two correlations (independent: Fisher z; dependent and overlapping: Steiger).
- **Acceptance test:** A 4-variable multiple-variables table: "Partial (control for Age)" gives the matrix of partial r; comparing r from two XY data sets gives z and P.
- **Validation:** pingouin `partial_corr`; R `ppcor::pcor`, `cocor`; pin from reference output before merging.
- **Engine work:** `correlation.py`, `multivar.py`.
- **UI home:** Correlation results (matrix option; XY comparison).
- **Territory:** engine, results. **Effort:** S.
- **Risks:** Low.

### P-49 Schild plot
- **Sources:** S-39, F-11 (KB is already shipped: `schild.py:134`)
- **What the user can do:** Draw log(DR - 1) against log[antagonist] from the Gaddum/Schild fit, with the regression line and its slope CI against 1.
- **Acceptance test:** The EC50-shift example: a linked XY table of log(DR - 1) per antagonist concentration and a Schild plot; slope CI shown; pA2 and KB as today.
- **Validation:** R `lm` of log(DR - 1) on log[B]; Arunlakshana & Schild 1959; pin from reference output before merging.
- **Engine work:** return the regression from the existing dose ratios (`schild.py`).
- **UI home:** Graph sheet (a graph kind on Gaddum/Schild results); results table.
- **Territory:** graphs-export, engine. **Effort:** S.
- **Risks:** The global Schild fit stays the estimator; the plot is a display (do-not-build 13 spirit).

### P-50 Flow event-count and gated-percentage calculator
- **Sources:** N-47, S-45
- **What the user can do:** Compute the events to acquire for a target CV at an expected frequency (Poisson), and the CI of an observed gated percentage from its counts.
- **Acceptance test:** Target CV 10% at 0.1% frequency: 100 positive events needed, so 100,000 total events; 120 of 50,000 gives a percentage with its Wilson CI.
- **Validation:** Roederer 2008 worked numbers; scipy `binomtest().proportion_ci`.
- **Engine work:** reuse `partsofwhole.proportion_ci`.
- **UI home:** Cmd+K palette entry and the flow guided wizard.
- **Territory:** guided. **Effort:** S.
- **Risks:** Low.

### P-51 Simulate from a user-defined equation
- **Sources:** N-51 (and the user-equation part of S-42)
- **What the user can do:** Simulate data and run Monte Carlo from a user-defined equation, as from built-in models.
- **Acceptance test:** User equation Y = A × exp(-k × X): Simulate makes an XY table whose ideal curve equals the equation evaluated by `nlfit`.
- **Validation:** Identity with the compiled user equation.
- **Engine work:** `simulate.py` accepts compiled user equations (`userequation.py`).
- **UI home:** Simulate dialog.
- **Territory:** engine. **Effort:** S.
- **Risks:** Low.

### P-52 Choose the drawn curve's X range and resolution
- **Sources:** F-16
- **What the user can do:** Extend the drawn curve to the vehicle dose or limit it, and set its resolution.
- **Acceptance test:** Set the curve range to start at log dose -11 on the example: the curve draws from -11; each drawn y equals the model at its x.
- **Validation:** Hand evaluation of the model at the drawn points.
- **Engine work:** `doseresponse.py:41-44` takes a range.
- **UI home:** Results sheet fit controls ("Curve" fold).
- **Territory:** results, engine. **Effort:** S.
- **Risks:** Drawing beyond the data invites extrapolation; mark the extended part dashed.

### P-53 Raincloud plots and a stated violin bandwidth
- **Sources:** F-26
- **What the user can do:** Draw raincloud plots (half violin, box, points) and violins with a stated bandwidth and quartile lines.
- **Acceptance test:** Column example as a raincloud: the legend states the KDE bandwidth; the density matches scipy `gaussian_kde` with that bandwidth.
- **Validation:** scipy `gaussian_kde`, R `density(bw = "nrd0")`; e2e-figures.
- **Engine work:** none.
- **UI home:** Graph sheet (column graph kinds).
- **Territory:** graphs-export. **Effort:** S.
- **Risks:** Quartiles must follow P-04's definition.

### P-54 Text and line sizes in points at the exported size
- **Sources:** F-33
- **What the user can do:** Set fonts and line widths in points at the exported physical size.
- **Acceptance test:** Set axis lines to 1 pt and tick labels to 7 pt, export PDF at 89 mm: the stroke is 1 pt and the `Tf` size is 7.
- **Validation:** Unit test of the conversion; e2e-export reads stroke width and `Tf`.
- **Engine work:** none.
- **UI home:** Format graph and Format axes dialogs (unit toggle); export panel.
- **Territory:** graphs-export. **Effort:** S.
- **Risks:** Existing px settings must convert exactly at 96 dpi.

### P-55 Normalised axes named from the settings
- **Sources:** N-48
- **What the user can do:** Normalize names its output from the references ("% of vehicle (mean)", "fold of matched control"), and the legend uses the same phrase.
- **Acceptance test:** Normalize with 0% = smallest mean and 100% = vehicle mean: the Y title reads "% of vehicle (mean)".
- **Validation:** Unit test on titles.
- **Engine work:** none.
- **UI home:** Normalize output table and graph title.
- **Territory:** results. **Effort:** S.
- **Risks:** Only for new outputs; never rename a title the user typed.

### P-56 Pin a colour to a group name
- **Sources:** N-49
- **What the user can do:** Choose a colour for a group name ("KO = orange") that every graph in the project uses.
- **Acceptance test:** Pin "KO" to orange: three graphs with a KO data set all draw it orange, in light and dark export.
- **Validation:** e2e-figures colour check.
- **Engine work:** none.
- **UI home:** Preferences (beside "same colour for a group on every graph").
- **Territory:** graphs-export. **Effort:** S.
- **Risks:** Data-model change (project-level colour map); the palette validator must still run.

### P-57 Show the references behind derived numbers
- **Sources:** N-35
- **What the user can do:** Normalize and Remove baseline state the 0% and 100% references used per data set; hovering a bar shows the mean, SD and n behind it.
- **Acceptance test:** Normalize the example: the results list, per data set, the value used as 0% (and that it was the smallest mean) and the value used as 100% (the vehicle mean), each equal to a hand calculation from the table.
- **Validation:** Hand derivation of the references.
- **Engine work:** `normalize.py` returns the references.
- **UI home:** Manipulation results sheet; graph hover.
- **Territory:** results, engine. **Effort:** S.
- **Risks:** Low.

### P-58 Reproduction records saved with the project
- **Sources:** W-22
- **What the user can do:** Reproduction records persist in the project file, and autosave restores and share links are checked for reproduction too.
- **Acceptance test:** Open a project, let reproduce-on-open run, save, reopen: the History panel shows the earlier record.
- **Validation:** Existing reproduce tests extended to a saved record.
- **Engine work:** none.
- **UI home:** History panel, the reproduce strip.
- **Territory:** shell-project. **Effort:** S.
- **Risks:** Data-model change.

### P-59 Prism Info sheets round trip
- **Sources:** W-36
- **What the user can do:** Import a .pzfx Info sheet's constants and notes, and export OpenDose info sheets (constants, notes, plan) into `<Info>`.
- **Acceptance test:** A .pzfx with an Info sheet holding "Cell line = HeLa" opens with that constant on the info sheet; exporting writes it back.
- **Validation:** Fixture round trip; one check in Prism per `docs/prism-validation.md`.
- **Engine work:** `pzfx.py` (today ignores Info at :18 and writes an empty one at :367).
- **UI home:** File menu (Open, Save as .pzfx).
- **Territory:** grid-import, engine. **Effort:** S.
- **Risks:** Low.

### P-60 A published project-file schema
- **Sources:** W-37
- **What the user can do:** Read a JSON Schema and a format page for the project file, checked against every fixture.
- **Acceptance test:** `docs/` holds the schema; the test suite validates every fixture and every e2e-saved project with ajv.
- **Validation:** ajv in the test suite.
- **Engine work:** none.
- **UI home:** About dialog link.
- **Territory:** shell-project. **Effort:** S.
- **Risks:** The schema must be generated from `project/types.ts`, not hand-kept.

### P-61 Study design record and ARRIVE items
- **Sources:** N-16
- **What the user can do:** Record randomisation (method, seed), blinding stages, exclusion criteria and sex, strain and age, and see them in the methods and in ARRIVE items 4, 5 and 8.
- **Acceptance test:** Fill the study design record; the ARRIVE checklist marks items 4, 5 and 8 met, and the methods paragraph names the randomisation method and seed.
- **Validation:** Checklist rules unit-tested.
- **Engine work:** none.
- **UI home:** Info sheet (beside the analysis plan) and the checklist panel.
- **Territory:** guided, results. **Effort:** S.
- **Risks:** Data-model change.

### P-62 Sex as a biological variable check
- **Sources:** X-15
- **What the user can do:** When a table has a sex column or data set, see a suggestion to include sex as a factor and report effects by sex, and a SAGER/SABV item in the journal checklists.
- **Acceptance test:** A grouped table with rows "F" and "M": the Checks row suggests a two-way ANOVA with sex and the interaction; the checklist gains a sex-reporting item.
- **Validation:** Unit tests on the detection rule; no new numbers.
- **Engine work:** none.
- **UI home:** Checks row, paste guide, journal checklist.
- **Territory:** guided, results. **Effort:** S.
- **Risks:** Detection must not fire on unrelated "M" labels; ask, do not assume.

### P-63 Export bundle with PDF graphs and layout pages
- **Sources:** W-35
- **What the user can do:** The export bundle includes each graph as PDF and each layout page as PDF and SVG.
- **Acceptance test:** Export the bundle of the example project with one layout: the zip holds `graphs/*.pdf` and `layouts/*.pdf` and `.svg`, and its README lists every file.
- **Validation:** PDFs open in pdf.js and pypdf in tests.
- **Engine work:** none.
- **UI home:** File menu (Export bundle).
- **Territory:** graphs-export. **Effort:** S.
- **Risks:** Needs P-02 so the PDFs carry the right symbols.

## Wave 2: builds (M)

One to two weeks each. Dependencies first: P-64 (xlsx writer) before
P-65 and P-66; P-76 (import provenance) before P-78; P-72 before P-73;
P-46 before P-86; P-83 before P-130; P-02 before P-107 and P-108; P-54
before P-108. Suggested order by value: P-64, P-65, P-66, P-68, P-87,
P-82, P-71, P-99, P-104, P-69, then the rest.

### P-64 Excel (.xlsx) export
- **Sources:** W-29, X-01 (the writer)
- **What the user can do:** Export every data table and every results sheet, with numbers stored as numbers, as one workbook.
- **Acceptance test:** Export the example project to .xlsx: one worksheet per table and per results sheet; numeric cells are numbers in Excel (right-aligned, summable); every value equals the CSV export.
- **Validation:** Read back with openpyxl and python-calamine in tests; LibreOffice headless conversion as a second reader.
- **Engine work:** none if written in TypeScript with fflate as `export/pptx.ts` does; or openpyxl in the worker (already vendored).
- **UI home:** File menu (Save menu), results export strip, export bundle.
- **Territory:** graphs-export, shell-project. **Effort:** M.
- **Risks:** Sheet names are limited to 31 characters and some symbols; map and report renames. Full precision must survive (no display rounding).

### P-65 Source data workbook per figure
- **Sources:** X-01, W-31, N-33
- **What the user can do:** From a layout, export one workbook per figure with one worksheet per panel ("Fig 2b") holding exactly what the panel plots: points, centre, error bars, curve, n and the test.
- **Acceptance test:** A layout with panels a (column scatter, mean ± SD) and b (dose-response fit): the workbook has sheets "a" and "b"; sheet a holds every plotted point plus each group's mean, SD and n; sheet b holds the points and the drawn curve; the eLife checklist item (P-09) turns met.
- **Validation:** Each sheet's numbers equal the graph's plot input (`graph/plotInput.ts`) for that panel; sheet names match the panel letters; read back with openpyxl.
- **Engine work:** none.
- **UI home:** Layout sheet (Export), export bundle.
- **Territory:** graphs-export. **Effort:** M.
- **Risks:** Needs P-64. Nature's size cap (30 MB) for large data; say when a panel is downsampled on screen but full in the file.

### P-66 One statistics table for the whole project
- **Sources:** N-44, W-30
- **What the user can do:** Export one table of every analysis (sheet, figure panel, test, n per group, statistic, df, exact P, adjustment and family, effect size with CI) as CSV, xlsx and a Word table.
- **Acceptance test:** Example project with a t test, a one-way ANOVA with Tukey and a dose-response fit: the table has one row per reported comparison, each equal to its results sheet.
- **Validation:** Per analysis kind, a unit test that each row equals the results sheet's numbers.
- **Engine work:** none (parts exist in `report/describe.ts`, `report/sentences.ts`).
- **UI home:** File menu (Save menu), export bundle, Copy for Word.
- **Territory:** results. **Effort:** M.
- **Risks:** Every analysis kind needs a row mapper; the unknown ones must be listed, not skipped.

### P-67 Script export (R and Python)
- **Sources:** W-32
- **What the user can do:** Get `analysis.R` and `analysis.py` in the bundle that read the bundle's CSVs and re-run each analysis with the closest standard call, caveats as comments; snippets extended to regression, logistic, Cox, ROC, Bland-Altman and mixed models.
- **Acceptance test:** Export the example bundle; running `analysis.py` reproduces the t test and the 4PL estimates within the stated tolerance.
- **Validation:** CI runs the generated Python (scipy, statsmodels) and R scripts on fixtures and compares with engine output within stated tolerances.
- **Engine work:** none.
- **UI home:** Export bundle; report card "Copy whole script".
- **Territory:** results, shell-project. **Effort:** M.
- **Risks:** Where no standard call matches exactly (for example Prism-style ROUT), the script must say so in a comment, not pretend.

### P-68 Leave a value out of one analysis
- **Sources:** N-04, F-15
- **What the user can do:** Exclude a value from one analysis only (a sensitivity run), including by clicking a point on an XY graph, keeping it in the table and in other analyses, with the reason in that analysis's methods.
- **Acceptance test:** Duplicate the example t test, leave out one value in the copy with the reason "pipetting error noted": the copy's n drops by one and its Exclusions block and methods name it; the original analysis is unchanged.
- **Validation:** Identity: excluding the same value at table level gives the same numbers.
- **Engine work:** none (applied when the payload is built).
- **UI home:** Results sheet (Exclusions block, "Leave out of this analysis…"); XY graph click.
- **Territory:** results, shell-project. **Effort:** M.
- **Risks:** Data-model change. Must not become automatic outlier deletion (do-not-build 4): always a reason, always reported with and without.

### P-69 "What this means" for every analysis
- **Sources:** N-07 (corrected: Cox is covered at `report/meaning.ts:879`)
- **What the user can do:** Get a plain-language sentence for Poisson regression, three-way ANOVA, nested two-way and grouping-column mixed models, the time-course model, quantal fits and every assay module.
- **Acceptance test:** Run Poisson regression on the colony example: a sentence reports the rate ratio with CI in words; repeat for one assay module.
- **Validation:** Wording against the sources in `guide/sources.ts`; unit tests on the meaning readers.
- **Engine work:** none.
- **UI home:** Results answer pane (the meaning line).
- **Territory:** results. **Effort:** M.
- **Risks:** Ruling 10: statistical wording; each reader pinned in tests.

### P-70 Residual QQ plots and histograms as graph sheets
- **Sources:** F-36
- **What the user can do:** Make residual QQ plots and frequency histograms real graph sheets: formatted, exported and placed in layouts.
- **Acceptance test:** From a column t test, "Make graph" on the residual QQ panel creates a graph sheet that exports to SVG; its histogram bins equal the frequency table.
- **Validation:** e2e-figures.
- **Engine work:** none.
- **UI home:** Graph sheet (graph kinds on column tables).
- **Territory:** graphs-export. **Effort:** M.
- **Risks:** Builds on P-11.

### P-71 Save in place and an installable app
- **Sources:** W-26, X-02, X-05
- **What the user can do:** Cmd+S writes back to the file that was opened; "Save as…" picks a new file; installing OpenDose as an app lets .json, .pzfx and .prism files open by double-click. Other browsers keep the download.
- **Acceptance test:** In Chromium, open `study.json`, edit, press Cmd+S: the same file on disk changes and no download appears. In Firefox the download path is unchanged.
- **Validation:** Saved bytes equal `serializeProject`; Playwright on Chromium with a mocked handle and on Firefox/WebKit for the fallback; a mocked `launchQueue` opens through the same path as `useFileOpen.ts`.
- **Engine work:** none.
- **UI home:** File menu (Save, Save as…), a save toast, About ("Install as app").
- **Territory:** shell-project. **Effort:** M.
- **Risks:** Chromium only; handles kept in IndexedDB need re-permission prompts. A web app manifest touches the offline service worker scope.

### P-72 Recent projects and saved versions
- **Sources:** W-24, X-06
- **What the user can do:** "Save a version…" with a note, a list of recent projects on the start screen and in the palette, and restore of any version, all in this browser.
- **Acceptance test:** Save versions "before reviewer" and "after reviewer"; close the tab; the start screen lists both; restoring the first gives its exact project.
- **Validation:** Round trip of every fixture project through a version, byte for byte.
- **Engine work:** none.
- **UI home:** Start screen, File menu, Cmd+K palette ("Open recent…").
- **Territory:** shell-project. **Effort:** M.
- **Risks:** Storage quota; reuse P-01's persistence and the existing Forget control.

### P-73 Compare two versions or two project files
- **Sources:** W-25
- **What the user can do:** See cells changed, exclusions added or removed, analysis options changed, and which reported numbers moved (P first).
- **Acceptance test:** Compare the two versions from P-72 where one value was excluded: the log lists the exclusion and the t test's P before and after.
- **Validation:** Unit tests on fixture pairs; the results diff reuses `project/replayDiff.ts`.
- **Engine work:** none.
- **UI home:** File menu ("Compare with…"), a History-panel style log.
- **Territory:** shell-project. **Effort:** M.
- **Risks:** Needs P-72 for the in-browser case.

### P-74 Add sheets from another project
- **Sources:** W-27
- **What the user can do:** Add families from another OpenDose project into the open one, and drop several files at once.
- **Acceptance test:** "Add from project…" with a colleague's file of two families: both appear with unique ids and working links.
- **Validation:** The merged project equals both sources sheet for sheet; ids unique; links repaired (`repairLinks`).
- **Engine work:** none.
- **UI home:** File menu ("Add from project…"), page drop.
- **Territory:** shell-project. **Effort:** M.
- **Risks:** Conflicting info constants and preferences: ask, do not overwrite.

### P-75 A lab kit file
- **Sources:** W-28
- **What the user can do:** Export templates, saved import recipes, plate layouts, graph styles and preferences as one file and import it on another machine.
- **Acceptance test:** Export a kit, use Forget this browser, import the kit: identical lists of templates, recipes and layouts.
- **Validation:** Round trip.
- **Engine work:** none.
- **UI home:** Preferences, templates picker.
- **Territory:** shell-project. **Effort:** M.
- **Risks:** Versioning of the kit format.

### P-76 Import provenance and replayed imports
- **Sources:** W-21, N-05 (the replay part)
- **What the user can do:** Each table records its source file (name, SHA-256), recipe and settings, plate map, and which cells were edited by hand afterwards; Apply to new data re-runs that import.
- **Acceptance test:** Import a plate-reader file through a recipe, edit one cell; History shows the file name, hash, recipe and "1 cell edited by hand". Apply to new data with next week's file re-runs the recipe.
- **Validation:** Replaying a recorded recipe on its own file reproduces the table byte for byte.
- **Engine work:** none (Web Crypto for the hash).
- **UI home:** History panel; Apply to new data.
- **Territory:** grid-import, shell-project. **Effort:** M.
- **Risks:** Data-model change.

### P-77 Split a long table by a column
- **Sources:** W-17, N-05 (the split part)
- **What the user can do:** Split a long table by a column (compound, plate, donor) into one family per value with the same analyses and graph, and stack families back.
- **Acceptance test:** A long table of 6 compounds: "Split by Compound" makes 6 families; each family's IC50 equals the one from that subset entered by hand.
- **Validation:** Identity with hand subsets.
- **Engine work:** none.
- **UI home:** Data grid menu (Reshape dialog), Duplicate family.
- **Territory:** grid-import. **Effort:** M.
- **Risks:** Large splits create many sheets; pair with P-17's summary table.

### P-78 Run a family on many files
- **Sources:** W-20, N-05 (the many-files part)
- **What the user can do:** Run one family or template on many files: one family per file, failures isolated and named, plus a summary table of chosen numbers.
- **Acceptance test:** Apply the IC50 template to 5 plate files, one of them malformed: 4 families and a summary table of 4 IC50s; the failed file is named with its error.
- **Validation:** Each file's result equals a one-file Apply to new data.
- **Engine work:** none (sequential engine jobs).
- **UI home:** File menu ("Apply to new data…", one family per file).
- **Territory:** shell-project. **Effort:** M.
- **Risks:** Needs P-76 to re-run imports.

### P-79 Merge tables on an ID and append rows
- **Sources:** N-32, W-15
- **What the user can do:** Join two tables on an ID column (keep all of the first, or only matches) and append rows of a table with the same layout, with unmatched IDs listed.
- **Acceptance test:** Scores for 20 mice and a metadata table of 19 mice: a left join gives 20 rows, one with blank metadata, and the report names that ID.
- **Validation:** pandas `merge` and dplyr `left_join` on fixtures with duplicate, missing and differently typed keys.
- **Engine work:** none.
- **UI home:** Data grid menu ("Merge with…"), producing a linked table.
- **Territory:** grid-import. **Effort:** M.
- **Risks:** Duplicate keys must stop with a message.

### P-80 Decimal comma in graphs, tables and sentences
- **Sources:** W-38
- **What the user can do:** Choose decimal comma and thousands style for graphs, results tables and sentences, as the CSV export already allows.
- **Acceptance test:** Set decimal comma: axis ticks read "0,5", the IC50 reads "1,23 µM", and copying the results gives the same digits as before with only the separator changed.
- **Validation:** Unit tests that digits are unchanged.
- **Engine work:** none.
- **UI home:** Preferences (Reporting).
- **Territory:** results, graphs-export. **Effort:** M.
- **Risks:** Ruling 10: every pinned number gains a locale variant; keep "." as the default and pins unchanged.

### P-81 A Y unit on every table
- **Sources:** W-43
- **What the user can do:** Set a Y unit (µM, ng/mL, %) that flows to axis titles, parameter tables, sentences and methods.
- **Acceptance test:** Set the Y unit "ng/mL" on a standard curve: interpolated concentrations and the axis title carry it.
- **Validation:** Display only: numbers unchanged.
- **Engine work:** none.
- **UI home:** Data table format dialog; results tables.
- **Territory:** grid-import, results. **Effort:** M.
- **Risks:** Data-model change; units of derived parameters (for example Hill slope has none) must not be invented.

### P-82 Baseline-adjusted comparison (ANCOVA)
- **Sources:** N-31, S-06
- **What the user can do:** For "measured before and after in two or more groups", compare follow-up adjusted for baseline: adjusted means, the adjusted difference with CI, and the equal-slopes check; the wizard routes there.
- **Acceptance test:** Two groups of 10 with baseline and follow-up columns: the answer is the adjusted difference with 95% CI; the Checks row shows the group × baseline slope test.
- **Validation:** R `lm(post ~ group + pre)` with `emmeans`, `car::Anova(type = 3)`; statsmodels ols; Vickers & Altman 2001 framing; pin from reference output before merging.
- **Engine work:** `multivar.py` OLS plus adjusted means.
- **UI home:** Guided wizard (Help me choose: "measured before treatment too?"), Analyze menu, results answer pane.
- **Territory:** engine, guided, results. **Effort:** M.
- **Risks:** Today the wizard sends "Before and after" to repeated measures (`guide/designToTable.ts:74-75`); explain both routes.

### P-83 Interaction contrasts for RM designs and custom contrasts
- **Sources:** N-06, S-05
- **What the user can do:** Get the difference of differences with CI and simple effects in RM and mixed two-way designs, and type custom contrast coefficients after one-way or two-way ANOVA (Scheffé for post hoc contrasts).
- **Acceptance test:** A 2 × 2 design (genotype between, drug within, 6 per group): the Interaction block shows "Drug effect in KO minus drug effect in WT" with CI; for 2 × 2 it equals a t test on per-subject differences of differences.
- **Validation:** R `afex::aov_ez` plus `emmeans::contrast(interaction = "pairwise")`, `multcomp::glht`; Maxwell & Delaney worked examples; pin from reference output before merging.
- **Engine work:** `repeated.py`, `mixedmodel.py` (estimate with ddfm SEs), `twoway_contrasts.py`.
- **UI home:** Grouped results (Interaction block); comparisons picker ("Custom contrast…").
- **Territory:** engine, results. **Effort:** M.
- **Risks:** Custom contrasts invite post hoc fishing; label planned vs post hoc and adjust the latter.

### P-84 Summary-data (mean, SD, N) parity
- **Sources:** N-03
- **What the user can do:** Mean/SD/N tables get planned families and Holm in one-way ANOVA, the log-scale analysis (stated as approximate) and Compare a parameter; the RM mixed-model path gets Holm and planned families.
- **Acceptance test:** Enter means, SDs and Ns for 4 groups; choose planned comparisons vs control with Holm: the results equal the raw-data path on data simulated with exactly those means, SDs and Ns.
- **Validation:** Exact-moment simulated raw data through the raw path; R `emmeans` on reconstructed data.
- **Engine work:** `summary.py` one-way options; lognormal moment conversion.
- **UI home:** Analysis controls (comparisons picker, log-scale switch).
- **Territory:** engine, results. **Effort:** M.
- **Risks:** The log-scale route from mean/SD is approximate; say so in the results.

### P-85 Aligned rank transform two-way ANOVA
- **Sources:** N-15, S-13
- **What the user can do:** Run a nonparametric two-factor ANOVA with the interaction (ART) and ART-C contrasts, with a note on when a log transform is the better route.
- **Acceptance test:** ARTool's `Higgins1990Table5` data as a grouped table: main effects and the interaction F and P match ARTool.
- **Validation:** R `ARTool::art` plus `anova` and `art.con`; Wobbrock et al. 2011; pin from reference output before merging.
- **Engine work:** align and rank, then the existing Type III OLS (`twoway.py`).
- **UI home:** Analyze menu (Two-way ANOVA variant), wizard non-Gaussian branch.
- **Territory:** engine, results. **Effort:** M.
- **Risks:** Not for unbalanced designs with empty cells; refuse with a message.

### P-86 Count and proportion models (binomial GLM, negative binomial)
- **Sources:** N-19, S-16 (the negative-binomial part)
- **What the user can do:** Model "positive out of counted" per dish with a binomial GLM (odds ratio with CI, overdispersion check, experiment as a block), and overdispersed counts with negative binomial; the wizard routes counts and percentages here instead of a t test on percentages.
- **Acceptance test:** 3 experiments × 2 groups, each with positives and totals: the result gives the odds ratio for group with CI, experiment as a block, and a dispersion check.
- **Validation:** R `glm(cbind(s, n - s) ~ group + experiment, binomial)` and `quasibinomial`; `MASS::glm.nb` on `quine`; statsmodels GLM; pin from reference output before merging.
- **Engine work:** IRLS in `multivar.py` (as Poisson), θ search for NB.
- **UI home:** Analyze menu (multiple-variables), guided wizard counts branch (`guide/recommend.ts`).
- **Territory:** engine, results, guided. **Effort:** M.
- **Risks:** Separation and zero cells; reuse the logistic separation checks.

### P-87 General linear mixed model on a long table
- **Sources:** S-30
- **What the user can do:** Fit a mixed model with continuous covariates, two nested random levels (animal / slice / cell; litter / pup) and random slopes, with KR or Satterthwaite df.
- **Acceptance test:** lme4 `sleepstudy` as a long table (Reaction ~ Days, random intercept by Subject): fixed effects and SEs match lme4; lme4 `Pastes` for two nested levels.
- **Validation:** R `lme4::lmer` plus `lmerTest`; statsmodels `MixedLM` with `vc_formula`; pin from reference output before merging.
- **Engine work:** design-matrix work around `mixedmodel.fit_reml` and `ddfm.py` (already handle several variance components).
- **UI home:** Analyze menu ("Mixed model with a grouping column": a nested column and covariate roles).
- **Territory:** engine, results. **Effort:** M.
- **Risks:** Boundary fits (variance at zero) and non-convergence must be stated plainly. This is the highest-volume partial need (animal / slice / cell).

### P-88 Ordinal (proportional-odds) regression
- **Sources:** N-25, S-18
- **What the user can do:** Analyse scores (histology 0 to 4, EAE) with a cumulative logit model: odds ratios with CIs, a proportional-odds check, optional experiment term; the wizard's "ordinal scores" answer routes here.
- **Acceptance test:** The `ordinal` package's wine data: `rating ~ temp + contact` coefficients and SEs match `clm`.
- **Validation:** R `ordinal::clm`, `MASS::polr`; statsmodels `OrderedModel`; pin from reference output before merging.
- **Engine work:** Newton-Raphson on the cumulative logit (pattern of `logistic_regression`).
- **UI home:** Analyze menu (multiple-variables), guided wizard routing.
- **Territory:** engine, results, guided. **Effort:** M.
- **Risks:** Empty categories and separation; profile CIs.

### P-89 Firth logistic regression for separated data
- **Sources:** S-19
- **What the user can do:** When logistic regression is refused for separation, fit with Firth's correction from the banner.
- **Acceptance test:** A 2-group dose study where all treated respond: the separation banner offers Firth; the result gives a finite odds ratio with a profile penalized-likelihood CI.
- **Validation:** R `logistf::logistf` on the Heinze & Schemper 2002 endometrial data; pin from reference output before merging.
- **Engine work:** `multivar.py` IRLS with the Jeffreys penalty.
- **UI home:** Results banner action.
- **Territory:** engine, results. **Effort:** M.
- **Risks:** Explain that the estimate is shrunk.

### P-90 Competing risks: cumulative incidence and Gray's test
- **Sources:** S-34
- **What the user can do:** With several event types, see cumulative incidence curves (Aalen-Johansen) and Gray's test instead of 1 - KM.
- **Acceptance test:** A survival table with event codes 1 (tumour) and 2 (other death): a cumulative incidence graph per cause and Gray's P.
- **Validation:** R `cmprsk::cuminc`; lifelines `AalenJohansenFitter`; pin from reference output before merging.
- **Engine work:** new functions beside `survival.py`.
- **UI home:** Survival table event codes; graph sheet (cumulative incidence kind).
- **Territory:** engine, graphs-export. **Effort:** M.
- **Risks:** Data-model change if event codes beyond 0/1 need a new subcolumn meaning.

### P-91 Parametric survival models
- **Sources:** S-35, X-17
- **What the user can do:** Fit exponential, Weibull and log-normal AFT models, with median and percentile survival with CIs and time ratios.
- **Acceptance test:** R `ovarian` data as a survival table with a treatment column: Weibull AFT coefficient, scale and median survival per group.
- **Validation:** R `survival::survreg` on `ovarian` and `lung`; pin from reference output before merging.
- **Engine work:** censored MLE with scipy optimize.
- **UI home:** Analyze menu (Survival, next to Cox).
- **Territory:** engine, results. **Effort:** M.
- **Risks:** Extrapolation beyond follow-up must be flagged.

### P-92 Forest plot of data and combining experiments (meta-analysis)
- **Sources:** F-27, N-50 (forest plot), S-40
- **What the user can do:** Plot an estimate and CI per row (experiments, subgroups) as a forest plot, and pool them with fixed and random effects (REML, Hartung-Knapp CI for few studies), I², τ² and a prediction interval.
- **Acceptance test:** metafor `dat.bcg` (log risk ratios with variances) entered as estimate and SE rows: the forest plot draws 13 rows and the pooled diamond; REML estimate and τ² match metafor.
- **Validation:** R `metafor::rma(method = "REML", test = "knha")` on `dat.bcg`; statsmodels `combine_effects`; pin from reference output before merging.
- **Engine work:** new `meta.py` (closed form plus a 1-D REML root).
- **UI home:** Analyze menu ("Combine experiments"), graph sheet (forest kind).
- **Territory:** engine, graphs-export. **Effort:** M.
- **Risks:** With 3 experiments τ² is poorly estimated; say so and default to Hartung-Knapp.

### P-93 Delta-delta and mini-meta estimation plots
- **Sources:** S-09 (DABEST part), X-14, F-42, N-50 (DABEST part)
- **What the user can do:** Get the DABEST delta-delta for 2 × 2 designs and the mini-meta weighted effect across independent repeats of a two-group experiment, in the estimation plot.
- **Acceptance test:** Three repeats of a control-vs-drug experiment: the estimation plot adds a weighted mean difference with its bootstrap CI.
- **Validation:** dabest (Python) `mini_meta=True` and delta-delta on its test datasets with fixed seeds; pin from reference output before merging.
- **Engine work:** `estimation.py` (BCa code exists).
- **UI home:** Analyze menu (Estimation plot); graph.
- **Territory:** engine, graphs-export. **Effort:** M.
- **Risks:** Shares pooling logic with P-92; one implementation.

### P-94 Assay precision and recovery (validation report)
- **Sources:** S-28, N-43
- **What the user can do:** From a run × replicate (× day) design, get within-run, between-run and total CV with CIs, the repeatability coefficient, and spike recovery with chosen acceptance limits.
- **Acceptance test:** VCA package `dataEP05A2_1` as a nested table: repeatability, between-run and total CV match VCA.
- **Validation:** R `VCA::anovaVCA` / `remlVCA` on the CLSI EP05 data; Bland & Altman 1996; ICH M10 formulas by hand; pin from reference output before merging.
- **Engine work:** ANOVA estimators or REML on a nested random design (`mixedmodel.fit_reml`).
- **UI home:** Standard-curve guided wizard ("Precision" report); Analyze menu on nested tables.
- **Territory:** engine, guided. **Effort:** M.
- **Risks:** Negative variance components: report as zero and say so.

### P-95 Power for more designs
- **Sources:** S-41
- **What the user can do:** Plan sample size for RM ANOVA (ρ, ε), ANCOVA (variance shrinks by 1 - ρ²), Mann-Whitney and Wilcoxon (A.R.E.), equivalence (TOST), multiple regression R² and logistic regression.
- **Acceptance test:** G*Power manual RM within example: same total N and power.
- **Validation:** G*Power 3.1 manual worked examples; R `PowerTOST::power.TOST`; Borm et al. 2007 for ANCOVA; pin from reference output before merging.
- **Engine work:** `power.py` KINDS.
- **UI home:** Power tool (palette and Plan an experiment).
- **Territory:** engine, guided. **Effort:** M.
- **Risks:** Never offer observed power (do-not-build 3).

### P-96 Simulation power for nested designs
- **Sources:** N-37, S-42
- **What the user can do:** Plan animals vs cells from between- and within-animal SD (or ICC), and simulation power for rank tests and Dunnett families.
- **Acceptance test:** ICC 0.3, 10 cells per animal: the nested card returns animals per group; it agrees with the design-effect formula 1 + (m - 1) × ICC.
- **Validation:** Design-effect hand check (Aarts et al. 2014); R `simr` on the same design; pin from reference output before merging.
- **Engine work:** `simulate.monte_carlo` gains nested data generation; balanced nested t uses unit means for speed.
- **UI home:** Power tool ("Nested design" card with progress).
- **Territory:** engine, guided. **Effort:** M.
- **Risks:** Runtime in WASM; cap repeats and show Monte Carlo error.

### P-97 Dose-series planning
- **Sources:** N-39, F-18
- **What the user can do:** Before the experiment, check a planned dose series: number of concentrations, range and spacing, expected IC50 CI width and whether both plateaus will be defined.
- **Acceptance test:** 8 half-log doses around an expected IC50 of 1 µM: the card reports the expected CI width; shifting the range so the top plateau is missed widens it and raises a flag.
- **Validation:** Monte Carlo coverage; asymptotic SE from the expected information matrix by hand; Sebaugh 2011 guidance.
- **Engine work:** reuse `simulate_xy` and Monte Carlo.
- **UI home:** Plan an experiment (guided wizard); explainer.
- **Territory:** engine, guided. **Effort:** M.
- **Risks:** Needs assumed slope and noise; say they are assumptions.

### P-98 Error propagation through baseline and normalize
- **Sources:** N-42
- **What the user can do:** Carry uncertainty through Remove baseline and Normalize (delta method), or be pointed to analysing raw values with the control as a block.
- **Acceptance test:** Subtract a blank mean (SD known, n = 3) from samples: the output carries propagated SDs; a note points to the blocked analysis.
- **Validation:** Python `uncertainties` and R `propagate`; hand derivation; pin from reference output before merging.
- **Engine work:** `normalize.py`, `formulas.py`.
- **UI home:** Manipulation options and results.
- **Territory:** engine, results. **Effort:** M.
- **Risks:** Propagated SDs must not be fed to tests as if they were raw replicates.

### P-99 Compare fits of global-only and user-defined models
- **Sources:** F-04
- **What the user can do:** Compare competitive vs mixed vs noncompetitive inhibition, Schild slope free vs 1, or two user equations, by F test and AICc.
- **Acceptance test:** A published inhibition dataset fitted with competitive and mixed models: Compare fits reports the extra-SS F, P and AICc, matching the published values.
- **Validation:** R `anova(nls_a, nls_b)` on an indicator-coded global model; AICc by hand; pin from reference output before merging.
- **Engine work:** `equations.fit_global_model` already returns SS and df; lift the `comparable()` exclusion (`sheets/xy/compareFits.ts:123`).
- **UI home:** Analyze menu (Compare fits model pickers).
- **Territory:** engine, results. **Effort:** M.
- **Risks:** F test valid only for nested models; say when AICc is the only valid choice.

### P-100 Relative potency from parallel curves, with equivalence
- **Sources:** S-37, F-20
- **What the user can do:** Fit a constrained parallel model (shared Top, Bottom, Hill slope; separate logEC50), test parallelism by F and by equivalence margins (USP <1032>), and get the potency ratio with a Fieller CI.
- **Acceptance test:** drc's `S.alba` data: parallelism verdict and relative potency with CI match `EDcomp`.
- **Validation:** R `drc::EDcomp`, `compParm`; USP <1034> worked examples; Hauck et al. 2005; pin from reference output before merging.
- **Engine work:** `globalfit.fit_global` plus `fieller_ratio` and the extra-SS F test.
- **UI home:** Analyze menu (Compare fits: "Relative potency").
- **Territory:** engine, results. **Effort:** M.
- **Risks:** Equivalence margins must be user-set before the data.

### P-101 Bootstrap CIs for fitted parameters
- **Sources:** F-06
- **What the user can do:** Choose bootstrap (case or residual resampling) CIs for parameters and derived values (IC50, ratios, ECx).
- **Acceptance test:** The example 4PL with "Bootstrap, 2,000 resamples": a progress bar, then percentile CIs within Monte Carlo error of R.
- **Validation:** R `nlstools::nlsBoot`, `boot::boot`; coverage with `simulate_xy`; pin from reference output before merging.
- **Engine work:** chunked refits in the worker (`lib/engine.worker.ts`).
- **UI home:** Results sheet fit controls (CI method select).
- **Territory:** engine, results. **Effort:** M.
- **Risks:** Seconds of compute per fit; must be cancellable and seeded for reproducibility.

### P-102 Parameter covariance and joint confidence region
- **Sources:** F-07
- **What the user can do:** See the covariance and correlation matrix of the parameters, and plot the joint confidence region of two.
- **Acceptance test:** The example 4PL: a folded table shows the correlation matrix; a region plot for LogIC50 and HillSlope.
- **Validation:** R `vcov(nls)`, `cov2cor`; scipy `curve_fit` pcov; region against `nlstools::nlsContourRSS`; pin from reference output before merging.
- **Engine work:** keep `_cov` (today popped at `api.py:180`).
- **UI home:** Results typeset table (folded); graph sheet.
- **Territory:** engine, results, graphs-export. **Effort:** M (the matrix alone is S).
- **Risks:** Low.

### P-103 Smoothing, splines and spline standard curves
- **Sources:** S-32, F-17
- **What the user can do:** Fit LOWESS or a smoothing spline through XY data, use point-to-point or cubic-spline standard curves where a kit prescribes them, and smooth, differentiate or integrate a curve into a linked table.
- **Acceptance test:** A kit standard curve with "Cubic spline (no CI)": unknowns interpolate and the results say no model CI exists.
- **Validation:** R `lowess()`, `smooth.spline()`, `splinefun("natural")`; statsmodels `lowess`; pin from reference output before merging.
- **Engine work:** scipy `make_smoothing_spline`, `CubicSpline`, `PchipInterpolator`; move the TypeScript LOWESS (`sheets/survival/cox.ts:511`) into the engine.
- **UI home:** Analyze menu (XY: "Smooth / spline"); standard-curve model picker.
- **Territory:** engine, results. **Effort:** M.
- **Risks:** No invented CIs for interpolating splines.

### P-104 X-axis break and per-curve zero-dose plateaus
- **Sources:** N-22, F-22
- **What the user can do:** Break the X axis so the vehicle dose sits left of a break on a log-dose graph, choose segment proportions on either axis, and constrain each curve's plateau from its own zero-dose wells.
- **Acceptance test:** Example with a vehicle row at dose 0: the X break puts the vehicle point in its own segment; break marks drawn; each point lands at its value.
- **Validation:** e2e-figures and e2e-export geometry; per-curve constraint against R `drc` with fixed `c`/`d`; pin from reference output before merging.
- **Engine work:** none for the axis; constraint per data set in the fit options.
- **UI home:** Graph sheet (Format axes, X); ZeroDoseBar on XY results.
- **Territory:** graphs-export, results. **Effort:** M.
- **Risks:** Never invent a dose for the vehicle (do-not-build 9).

### P-105 Significance stars per time point on XY and lines graphs
- **Sources:** F-23
- **What the user can do:** Put stars per time point on lines graphs and time courses from two-way ANOVA within rows, the time-course model, or multiple t tests.
- **Acceptance test:** A tumour-growth grouped table with Sidak comparisons per day: each day's star matches the adjusted P in the project's P style; the legend gives the star scale.
- **Validation:** e2e-figures reads stars against engine P values.
- **Engine work:** none.
- **UI home:** Graph sheet (Comparisons dialog).
- **Territory:** graphs-export. **Effort:** M.
- **Risks:** Per-time-point tests are not the analysis of a curve (do-not-build 1); the Checks row must keep pointing to the curve-level test.

### P-106 Click a graph element to format it, edit titles in place
- **Sources:** N-34, F-43
- **What the user can do:** Click an axis, data set, legend or title to open its Format section; edit titles and legend entries in place; drag the legend.
- **Acceptance test:** Click the Y axis: Format axes opens at Y. Double-click the title, type a new one: it lands in the graph's settings and survives export.
- **Validation:** e2e-figures.
- **Engine work:** none.
- **UI home:** Graph sheet.
- **Territory:** graphs-export. **Effort:** M.
- **Risks:** Touch: no hover, keep the dialog route.

### P-107 Rich text in labels
- **Sources:** N-27, F-28
- **What the user can do:** Use italics, superscripts, subscripts and Greek letters in every label (axis titles, legend, annotations) through a small documented markup, identical in SVG, PDF and PNG.
- **Acceptance test:** Y title "*Gapdh* mRNA (10^-6^ M)": italic gene name and superscript in SVG tspans, in the PDF (text extracts as Unicode) and in PNG.
- **Validation:** e2e-figures (tspan font-style and baseline-shift); e2e-export with pdf.js extraction.
- **Engine work:** none.
- **UI home:** Graph sheet title and annotation fields (a small marks toolbar).
- **Territory:** graphs-export. **Effort:** M.
- **Risks:** Needs P-02. Today Plotly tags pass through axis titles by accident; existing titles with "<" must not change meaning.

### P-108 Journal figure presets
- **Sources:** F-31, F-41
- **What the user can do:** Pick a named journal (Nature, Science, Cell Press, PLOS, eLife, JBC) that sets width, maximum height, font, minimum and maximum pt, line weights, panel-letter style, format, DPI and TIFF compression (LZW, grayscale where asked).
- **Acceptance test:** Choose "Nature, single column": export is 89 mm wide, text 5 to 7 pt in the chosen font, TIFF with the DPI tag.
- **Validation:** Each number pinned to the journal's author-guideline URL with a fetch date in a fixture; e2e-export checks size, DPI, minimum pt, font; e2e-tiff decodes LZW with tifffile/Pillow.
- **Engine work:** none.
- **UI home:** Export panel, layout page setup.
- **Territory:** graphs-export. **Effort:** M.
- **Risks:** Guidelines change; show the fetch date. Needs P-54 and P-02.

### P-109 A lab house style
- **Sources:** F-32
- **What the user can do:** Save fonts, sizes, line widths, axis frame and palette as a style and apply it to every graph kind, in this project and the next.
- **Acceptance test:** Save a style and apply it to a column, an XY and a grouped graph: the exported SVGs share fonts and widths.
- **Validation:** e2e-figures.
- **Engine work:** none.
- **UI home:** Preferences (Figure style); File menu import/export of a style; part of P-75's kit.
- **Territory:** graphs-export. **Effort:** M.
- **Risks:** The classic theme stays the default (ruling 10).

### P-110 Align plot areas in layouts
- **Sources:** F-34
- **What the user can do:** Align panels' plot areas (equal axis lengths and left edges in a row or column) and optionally share Y ranges.
- **Acceptance test:** Two panels stacked in a column with different tick-label widths: "Align plot areas" makes their left axis lines coincide within 0.1 px in the exported SVG.
- **Validation:** e2e-export geometry.
- **Engine work:** none.
- **UI home:** Layout sheet inspector.
- **Territory:** graphs-export. **Effort:** M.
- **Risks:** Explicit margins per panel interact with the font floor check.

### P-111 Log-rank brackets on Kaplan-Meier graphs and panel brackets
- **Sources:** F-40
- **What the user can do:** Draw pairwise log-rank brackets on KM graphs and brackets between the panels of the three-way graph.
- **Acceptance test:** 3-group survival with pairwise log-rank, Holm: brackets show the adjusted P values from the results.
- **Validation:** e2e-figures against the engine's adjusted P.
- **Engine work:** none.
- **UI home:** Graph sheet (Comparisons dialog).
- **Territory:** graphs-export. **Effort:** M.
- **Risks:** Bracket placement on step curves; keep to the right margin.

### P-112 A figure recipe inside exported files
- **Sources:** F-38
- **What the user can do:** Opt in to embed the graph's data, settings and OpenDose version in exported SVG, PNG and PDF, and reopen the figure by dropping the file back.
- **Acceptance test:** Export a PNG with the recipe, drop it on the page: the graph reopens and re-exports identically.
- **Validation:** e2e-export round trip.
- **Engine work:** none.
- **UI home:** Export panel checkbox; page drop.
- **Territory:** graphs-export. **Effort:** M.
- **Risks:** Privacy: data travels inside images; off by default and said plainly.

### P-113 Kinetic plate-reader exports
- **Sources:** W-07
- **What the user can do:** Import Gen5, Tecan Spark and BMG MARS kinetic "time × wells" exports to an XY table, grouped by the plate map, ready for kinetic rates or growth curves.
- **Acceptance test:** A Gen5 kinetic export of 96 wells × 60 reads: an XY table grouped by the plate map; the kinetic module's rates equal those from the same data typed by hand.
- **Validation:** Vendor sample exports; Gen5's Vmax column as outside reference.
- **Engine work:** none.
- **UI home:** Import recipes ("Plate reader, kinetic table"), then the kinetic or growth guided wizard.
- **Territory:** grid-import. **Effort:** M.
- **Risks:** Temperature columns and overflow markers ("OVRFLW") must be named in the import report.

### P-114 Well-list plate exports
- **Sources:** W-08
- **What the user can do:** Import one-row-per-well exports (EnVision, Magellan, MARS table view, LIMS) with a recognised Well column, grouped by the plate map, plate by plate.
- **Acceptance test:** Well-list and grid exports of the same plate give identical tables and identical Z′.
- **Validation:** Identity between the two layouts; the plate module's numbers.
- **Engine work:** none.
- **UI home:** Import recipes (tidy, with a Well role); plate map editor.
- **Territory:** grid-import. **Effort:** M.
- **Risks:** Well names "A1" vs "A01".

### P-115 Plate layouts by paste, file and project
- **Sources:** W-13
- **What the user can do:** Paste an 8 × 12 grid of labels or a Well/Condition/Concentration list into the plate map, read a dispenser file (Tecan D300e, Echo), and export and import layouts as files and in the project.
- **Acceptance test:** Paste a 96-well label grid: the map matches cell for cell; export, re-import: identical.
- **Validation:** Round trip; a D300e fixture gives expected concentrations.
- **Engine work:** none.
- **UI home:** Plate map editor in the guided wizard.
- **Territory:** guided, grid-import. **Effort:** M.
- **Risks:** Data-model change (layouts in the project instead of localStorage only).

### P-116 One plate map per plate
- **Sources:** W-14, N-46
- **What the user can do:** Use a different plate map for each plate of a multi-plate run (copy, then edit).
- **Acceptance test:** Two plates with swapped compound positions: per-plate results equal running each plate alone.
- **Validation:** Identity: identical maps reproduce today's pooled result.
- **Engine work:** none.
- **UI home:** Plate map editor (plate tabs).
- **Territory:** guided. **Effort:** M.
- **Risks:** Data-model change.

### P-117 RDML qPCR import
- **Sources:** W-10, N-09 (qPCR part)
- **What the user can do:** Import qPCR runs from RDML (CFX Maestro, LightCycler, QuantStudio Design & Analysis, Rotor-Gene, qbase+): Cq, targets, samples and dilutions.
- **Acceptance test:** An RDML example from rdml.org: the Cq table equals the same run's text export.
- **Validation:** rdml.org examples; `rdmlpython` as an independent parser.
- **Engine work:** none (fflate and DOMParser).
- **UI home:** qPCR guided wizard file picker; qPCR recipe.
- **Territory:** grid-import, guided. **Effort:** M.
- **Risks:** RDML versions 1.1 to 1.3; reject what is not understood.

### P-118 Multiplex immunoassay: one standard curve per analyte
- **Sources:** W-11
- **What the user can do:** Import Luminex xPONENT, Bio-Plex, LEGENDplex and MSD exports and get one standard curve per analyte with LLOQ/ULOQ flags and a concentrations table per analyte.
- **Acceptance test:** An xPONENT export with 10 analytes: 10 curves, 10 concentration tables, out-of-range samples flagged.
- **Validation:** R `nCal` and `drLumi` on their example data; existing 5PL validation; pin from reference output before merging.
- **Engine work:** loop over analytes in `assay_stdcurve.py`.
- **UI home:** Standard-curve guided wizard; import recipe.
- **Territory:** guided, engine. **Effort:** M.
- **Risks:** Vendor formats vary by version; one fixture per vendor minimum.

### P-119 Seahorse XF Mito Stress Test module
- **Sources:** W-12
- **What the user can do:** Turn a Wave export (OCR/ECAR per well and measurement) into Mito Stress Test parameters per group (basal, ATP-linked, proton leak, maximal, spare capacity, non-mitochondrial) and run the usual statistics.
- **Acceptance test:** A published Wave export: per-well parameters equal Wave's own report generator.
- **Validation:** Agilent report-generator definitions by hand on a published example.
- **Engine work:** new assay module on `sheets/assays/kit/` (subtractions and min/max per phase).
- **UI home:** Guided wizard (assay module).
- **Territory:** guided, engine. **Effort:** M.
- **Risks:** Experiment-as-unit: wells are not n; route to replicate maps.

### P-120 TCID50 endpoint titre
- **Sources:** X-09
- **What the user can do:** Enter positive and total wells per dilution and get the titre by Spearman-Kärber and Reed-Muench (for comparability) with a CI, a model-based ID50 (probit or logit), and a plain note on the classic formulas' bias.
- **Acceptance test:** The Reed & Muench 1938 worked example: both classic titres match the paper; the probit ID50 appears with its Fieller CI.
- **Validation:** Hand derivation of Reed & Muench and Kärber; jbloom/reedmuenchcalculator; R `glm(binomial(probit))`; pin from reference output before merging.
- **Engine work:** closed forms plus `quantal.py`.
- **UI home:** Guided wizard (assay module); results answer pane and Checks row.
- **Territory:** guided, engine. **Effort:** M.
- **Risks:** Lead with the model-based estimate; label the classic ones as legacy.

### P-121 GR metrics
- **Sources:** X-11
- **What the user can do:** From cell counts at time 0 and at the end, get GR50, GRmax, GRinf, GR AOC and hGR per drug and cell line.
- **Acceptance test:** The GRmetrics vignette dataset: GR50 and GRmax per cell line and drug match the vignette.
- **Validation:** Bioconductor GRmetrics on its example; pin from reference output before merging.
- **Engine work:** GR transform plus the existing sigmoid fit and range flags.
- **UI home:** Normalisation option or assay module; results table.
- **Territory:** engine, guided. **Effort:** M.
- **Risks:** Needs time-0 counts; refuse without them.

### P-122 Western blot linear range
- **Sources:** N-13
- **What the user can do:** Fit signal against load for a loading dilution series and flag sample bands outside the linear range before any fold change.
- **Acceptance test:** A 6-point loading series saturating at the top: the linear range is reported and two sample bands above it are flagged.
- **Validation:** R `lm` on the series; Pillai-Kastoori et al. 2020; pin from reference output before merging.
- **Engine work:** `assay_densitometry.py`.
- **UI home:** Densitometry guided wizard step and results chip.
- **Territory:** guided, engine. **Effort:** M.
- **Risks:** "Linear" criteria (R², residual pattern) must be stated.

### P-123 Blot image attached to the densitometry table
- **Sources:** N-10
- **What the user can do:** Attach the uncropped source image to a densitometry table with lane labels and export it as a supplementary panel.
- **Acceptance test:** Attach a TIFF, label lanes 1 to 8, add it to a layout: the exported image is byte-identical to the attached one (hash).
- **Validation:** Hash check.
- **Engine work:** none.
- **UI home:** Densitometry guided wizard; layout picture item.
- **Territory:** guided, graphs-export. **Effort:** M.
- **Risks:** Project size and IndexedDB quota (priced in `docs/research/needs/raw-image-provenance-design.md`). Data-model change. No image processing (do not build).

### P-124 Blind a table
- **Sources:** N-20
- **What the user can do:** Show group names as codes until unblinding; exclusions made while blind are marked so in the methods.
- **Acceptance test:** Blind a 4-group table: names show as A to D on grid, graph and results; exclude one value; unblind: names return and the methods say the exclusion was made blind.
- **Validation:** Identity: results unchanged by blinding.
- **Engine work:** none.
- **UI home:** Data grid menu ("Blind this table"); a Banner while blind.
- **Territory:** grid-import, shell-project. **Effort:** M.
- **Risks:** Data-model change; the mapping must not leak through exports while blind.

### P-125 Plate randomisation and a confounding check
- **Sources:** N-24
- **What the user can do:** Generate a randomised plate layout (blocks per plate, controls spread) and get a warning when a group coincides with a day or plate.
- **Acceptance test:** 4 groups × 6 replicates on 2 plates: the layout is balanced per plate; a table where all KO samples ran on day 2 raises a Checks chip.
- **Validation:** Balance properties by enumeration; hand-built confounded tables.
- **Engine work:** extend the randomisation list (`power.py:984`).
- **UI home:** Plan an experiment (guided wizard), plate map editor, Checks row chip.
- **Territory:** guided. **Effort:** M.
- **Risks:** Seeded and recorded in P-61's design record.

### P-126 Exercise links for teaching
- **Sources:** W-40
- **What the user can do:** Share a link with a task note that hides chosen outputs (test name, P, conclusion) until the student commits a choice in Help me choose.
- **Acceptance test:** Create an exercise link hiding the test and P; opening it shows the data and task; after choosing a test, the results appear.
- **Validation:** e2e for hide and reveal.
- **Engine work:** none.
- **UI home:** Share dialog; the withheld-results surface.
- **Territory:** shell-project. **Effort:** M.
- **Risks:** Hidden only in the UI; the link payload holds the answer (say so to instructors).

### P-127 Open the validation datasets
- **Sources:** W-41
- **What the user can do:** Open any published reference dataset on the validation page as a project and reproduce the reference number.
- **Acceptance test:** On the validation page, "Open this dataset" on a NIST StRD check opens a project whose result equals the listed value.
- **Validation:** The check itself.
- **Engine work:** none.
- **UI home:** Validation page.
- **Territory:** shell-project. **Effort:** M.
- **Risks:** Dataset licences; NIST and textbook data first.

### P-128 ELN-ready export
- **Sources:** W-34
- **What the user can do:** Export an `.eln` (RO-Crate) file wrapping the bundle for eLabFTW, RSpace, Kadi4Mat, Chemotion and openBIS, and "Copy for ELN" with figure, legend, results sentence and methods as one rich-text item.
- **Acceptance test:** Export `.eln` from the example: `rocrate-validator` passes; an offline eLabFTW instance imports it.
- **Validation:** `rocrate-validator` (Python); local eLabFTW import.
- **Engine work:** none.
- **UI home:** File menu (Save menu), Copy menu.
- **Territory:** graphs-export. **Effort:** M.
- **Risks:** A file only; never an ELN API call.

## Wave 3: large builds (L)

Weeks each, with the most validation risk. Start only after the Wave 2
pieces they build on.

### P-129 Mixed models for counts and proportions (GLMM)
- **Sources:** S-21
- **What the user can do:** Fit binomial or Poisson models with experiment or animal as a random intercept.
- **Acceptance test:** lme4 `cbpp` (incidence/size ~ period + (1 | herd)) as a long table: fixed effects and the herd variance match `glmer`.
- **Validation:** R `lme4::glmer`, `GLMMadaptive` (statsmodels' Bayesian mixed GLM is not a valid oracle); pin from reference output before merging.
- **Engine work:** Laplace or adaptive Gauss-Hermite for one random intercept.
- **UI home:** Analyze menu ("Mixed model with a grouping column": outcome type picker).
- **Territory:** engine, results. **Effort:** L.
- **Risks:** Convergence and boundary fits must be surfaced honestly. Needs P-86 and P-87.

### P-130 ANOVA with four or more factors and user contrasts
- **Sources:** N-23, X-18
- **What the user can do:** Run N-way ANOVA from a long multiple-variables table with factor roles, with marginal-means comparisons and contrasts by ticking cell means.
- **Acceptance test:** A 2 × 2 × 2 × 3 dataset: Type III table matches R.
- **Validation:** statsmodels `anova_lm(typ = 3)`; R `car::Anova(type = 3)` plus `emmeans::contrast`; pin from reference output before merging.
- **Engine work:** OLS with sum-to-zero coding.
- **UI home:** Analyze menu (multiple-variables).
- **Territory:** engine, results. **Effort:** L.
- **Risks:** Rare at the bench; empty cells. Needs P-83.

### P-131 Benchmark dose (BMD, BMDL)
- **Sources:** S-38, X-10
- **What the user can do:** Get BMD and BMDL for a chosen benchmark response from continuous or quantal fits, then model averaging.
- **Acceptance test:** An EPA BMDS example dataset: BMD and BMDL per model match pybmds output run offline by the developer.
- **Validation:** pybmds / BMDS on EPA's example datasets; R `drc::bmd`; EFSA 2022 guidance; pin from reference output before merging.
- **Engine work:** profile-likelihood BMDL on existing fits; model averaging in scipy (pybmds cannot run in Pyodide).
- **UI home:** Dose-response and quantal results (parameter transforms).
- **Territory:** engine, results. **Effort:** L.
- **Risks:** Regulatory users expect BMDS numbers exactly; ship single-model BMDL first. Uses P-19's models.

### P-132 Differential and implicit user equations
- **Sources:** F-09
- **What the user can do:** Write user equations as Y' = … or implicit equations and fit them.
- **Acceptance test:** One-phase association written as an ODE reproduces the explicit fit to about 1e-6.
- **Validation:** Closed-form library models; R `deSolve` plus `FME::modFit` on `Theoph`; pin from reference output before merging.
- **Engine work:** `userequation.py` with `solve_ivp` / `brentq`.
- **UI home:** User-defined equation editor.
- **Territory:** engine. **Effort:** L.
- **Risks:** Slow in WASM; tolerances and worker time.

### P-133 Data sets from several tables on one graph
- **Sources:** N-41, F-35
- **What the user can do:** Add data sets from several tables and fits from several results to one graph, each with its own X.
- **Acceptance test:** Two XY tables with different X values: one graph draws both with their fits.
- **Validation:** e2e-figures.
- **Engine work:** none.
- **UI home:** Graph sheet ("Data sets on graph…").
- **Territory:** graphs-export, shell-project. **Effort:** L.
- **Risks:** Data-model change (a graph today has one parent and one results id).

### P-134 Whole-project report
- **Sources:** W-33
- **What the user can do:** Get one document (self-contained HTML, PDF through print, or .docx) with each family's figure, legend, results sentence, tables, methods, exclusions and citation.
- **Acceptance test:** Export the example as .docx: it opens in LibreOffice and python-docx with every family.
- **Validation:** Contents equal the per-sheet outputs.
- **Engine work:** none.
- **UI home:** File menu (Save menu: "Report…"), print.
- **Territory:** graphs-export, results. **Effort:** L.
- **Risks:** Builds on P-66, P-02 and P-107.

### P-135 The interface in other languages
- **Sources:** N-38, W-39
- **What the user can do:** Use the start screen, paste report, Help explainers and "What this means" in other languages (zh, ja, ko, de, es first), with statistical terms in both; methods stay in English unless asked.
- **Acceptance test:** Switch to German: the start screen and the paste report are German; every reported number is byte-identical.
- **Validation:** Native-speaker terminology review; snapshot tests per language.
- **Engine work:** none.
- **UI home:** View menu (Language), every surface.
- **Territory:** shell-project. **Effort:** L.
- **Risks:** An i18n layer touches every component; strings in TSX today.

## Deferred and research-only

Each item is out of the waves because its value is weak for bench users,
its validation is doubtful in the browser, or it waits on a platform
feature. Each says what would bring it back.

### D-01 Williams' test
- **Sources:** S-11
- **Why deferred:** Critical values need Williams' tables (limited k and df) or a fixed-seed Monte Carlo of the isotonic maximum; matching R `PMCMRplus::williamsTest` to reported precision is unproven. P-41 (Jonckheere) plus Dunnett cover dose groups now.
- **What would change it:** A spike that matches PMCMRplus and Williams 1971/1972 examples to 3 significant digits.

### D-02 Bayes factors for t tests and correlation
- **Sources:** S-03, X-16
- **Why deferred:** Little bench-biology demand in the sources; a second inferential framework next to P adds a number users will misread. P-12 (TOST) answers "evidence of no effect" in the frequentist frame already used.
- **What would change it:** User requests from bench labs, not only psychology; then an off-by-default row validated against R `BayesFactor::ttestBF`.

### D-03 Barnard and Boschloo exact 2 × 2 tests
- **Sources:** S-20
- **Why deferred:** Low value; another test choice against DECISIONS principle 9 (do less); scipy is the implementation, so only R `Exact` is an independent oracle.
- **What would change it:** Evidence that Fisher's conservatism costs users real decisions.

### D-04 Tolerance and reference intervals
- **Sources:** S-44
- **Why deferred:** No need signal in needs.json; clinical-chemistry use more than bench.
- **What would change it:** Requests from animal-facility or clinical labs.

### D-05 Hochberg and Hommel adjustments
- **Sources:** S-07
- **Why deferred:** Low value; Holm and BH cover the bench need; each new method widens every family picker.
- **What would change it:** A pairing with P-83 custom contrasts where a reviewer asks for them.

### D-06 Fleiss' kappa for three or more raters
- **Sources:** S-25
- **Why deferred:** Low value next to P-44 (ICC) and the existing Cohen's kappa.
- **What would change it:** Scoring labs asking after P-44 ships; validation is easy (R `irr::kappam.fleiss`).

### D-07 Heteroscedasticity-robust (HC3) standard errors
- **Sources:** S-31
- **Why deferred:** Low value at bench n; the log-scale and Welch routes already address unequal spread.
- **What would change it:** Multiple-regression users asking; statsmodels `cov_type = "HC3"` is the oracle.

### D-08 Yuen and Brunner-Munzel tests
- **Sources:** S-04
- **Why deferred:** Low-medium value; adds a "Robust" group to an already long test picker. Welch and the log-scale tests cover most cases.
- **What would change it:** A wizard rule that needs Brunner-Munzel for unequal-spread rank comparisons.

### D-09 Conover, DSCF and Steel post hoc tests
- **Sources:** S-12
- **Why deferred:** Dunn's test ships; extra rank post hoc tests are rarely asked for at the bench.
- **What would change it:** Reviewer requests in user feedback.

### D-10 Isobologram
- **Sources:** S-46
- **Why deferred:** Low value; the synergy module already reports Loewe, Bliss, HSA, ZIP and MuSyC with landscapes.
- **What would change it:** Synergy users asking for it as a figure.

### D-11 Nonlinear mixed-effects dose-response
- **Sources:** F-19
- **Why deferred:** L effort and numerically fragile in WASM with no library; P-08 (per-experiment fits, n = experiments) and P-92 answer the same question honestly.
- **What would change it:** A stable numpy implementation validated against R `nlme::nlme`.

### D-12 Robust regression standard errors
- **Sources:** F-08
- **Why deferred:** The sandwich covariance of an M-estimator is itself a method choice; oracles disagree; occasional use.
- **What would change it:** A clear reference (statsmodels `RLM` for the straight line, `robustbase::nlrob` for nonlinear) agreeing within tolerance.

### D-13 Biased agonism (bias factors)
- **Sources:** F-12
- **Why deferred:** Niche (GPCR labs); needs the transduction-ratio model and ΔΔlog(τ/KA) conventions that vary between papers.
- **What would change it:** Requests plus published worked values (Kenakin 2012; van der Westhuizen 2014) reproduced.

### D-14 Scale bars and align/distribute for annotations
- **Sources:** F-39
- **Why deferred:** Low value; trace figures are rare in this product's use.
- **What would change it:** Electrophysiology users.

### D-15 Dashed error bars per data set
- **Sources:** X-19
- **Why deferred:** Occasional; greyscale figures already have marker and line-style choices.
- **What would change it:** Fold into P-109 (house style) if it ships.

### D-16 System share sheet
- **Sources:** X-07
- **Why deferred:** DECISIONS 0.6 treats phones as reading devices; desktop Chrome support is partial; share links exist.
- **What would change it:** Evidence of tablet analysis use.

### D-17 Watch an instrument export and re-import
- **Sources:** X-08
- **Why deferred:** FileSystemObserver's shipping status was not confirmed; Chromium desktop only; it needs P-76 (provenance) and P-71 (file handles).
- **What would change it:** The API shipping in stable Chromium and P-76 and P-71 done.

### D-18 QuantStudio .eds files
- **Sources:** N-09 (.eds), W-10 (second step)
- **Why deferred:** Undocumented zip of XML or JSON that differs between software versions; RDML (P-117) and the text export already work.
- **What would change it:** A documented format, or a corpus of .eds files across versions with matching text exports.

## Do not build

Binding: the IMPROVEMENT-PLAN "Do not build (offer this instead)" list.
These would make results worse if built as asked.

1. Per-dose or per-time-point t tests as the analysis of a curve. Offer curve comparison, AUC per subject or a mixed model over time; "multiple t tests per row" stays for omics-style screens with FDR, labelled as many comparisons. P-105 draws stars per time point only from an analysis the user chose, and the Checks row keeps pointing to the curve-level test.
2. SEM as the default error bar. SD with points to describe, 95% CI for precision; SEM only by explicit choice and named in the legend.
3. Post hoc (observed) power. Offer the CI of the effect and the smallest detectable effect; prospective power only (P-95, P-96).
4. Automatic outlier deletion. Flag (ROUT, Grubbs), keep the point visible, require a reason, report with and without (P-68).
5. Choosing parametric vs rank tests from a normality-test P. Choose from the design and the scale; show residual plots (P-11) and use Welch before ranks.
6. Bar graphs of means as the default for small samples. Dot or box plots with every point (the default today); bars for counts and proportions.
7. Stars instead of P values. Brackets from the analysis with exact P available, effect sizes with CIs, star thresholds in the legend.
8. One-tailed tests chosen after seeing the data. Two-tailed by default; one-tailed only when declared in the analysis plan.
9. Inventing data to make a fit or graph work (an untested concentration, a number for the vehicle's zero, a fake row). Offer constraints with a reason (P-20), vehicle wells as the plateau (P-104), "IC50 > top dose", manual axis ranges.
10. Data-driven "optimal" survival cut-points. Pre-specified cut-points or Cox on the continuous variable; ROC cut-offs only as diagnostics with their optimism stated.
11. Testing fold changes with the control fixed at 1, or averaging 2^-ΔΔCt. Statistics on ΔCt or log ratios; fold change with an asymmetric CI at the end.
12. Counting cells, wells or repeated reads as n. Statistics on experiment means (SuperPlots) or a nested or mixed model (P-08, P-87).
13. Linearised fits (Lineweaver-Burk, Scatchard) as estimators. Nonlinear fits; linear plots stay display transforms (P-49 is a display).

Out of scope for the product (merged from all five inputs):

- **statsmodels, pandas or patsy at runtime.** In the Pyodide lock but not vendored; they grow the first visit. Only with a measured justification.
- **MCMC Bayesian models and Bayesian curve fitting.** Long chains block a tab, convergence diagnostics a bench user cannot judge, priors cut against the promise; Stan and PyMC are not in the lock.
- **Fine-Gray subdistribution-hazards regression.** L effort for a rare need; P-90 covers the descriptive and comparative question.
- **Exact conditional logistic regression.** Combinatorial; P-89 (Firth) covers small-sample separation.
- **Group-sequential and adaptive designs, MANOVA, discriminant analysis, SEM, multiple imputation, ARIMA and spectral time series, ML classifiers.** Outside the bench promise; no surface presents them.
- **Band and lane detection on blot or gel images.** Stays in Fiji, ImageJ and Image Lab; P-123 keeps the image linked without processing.
- **Gating and compensation on FCS files.** FlowJo's domain; P-31 keeps the gate path.
- **Vendor SDK or encrypted instrument files** (LabChart `.adicht`, Bio-Rad `.pcrd`, LightCycler `.ixo`). No vendor DLLs; no breaking encryption; text exports and RDML cover them.
- **Crossing tick marks.** Plotly has none; a custom axis layer costs more than it is worth.
- **Anything server-side.** Accounts, cloud sync, live co-editing, synced comments, shared team libraries, remote compute, Prism Cloud-style sharing, ELN or LIMS API pushes (Benchling, LabArchives), data-lake connectors.
- **Opening data from a URL** (Zenodo, OSF, GitHub). A runtime third-party fetch.
- **SPSS, SAS and Stata files, and .RData/.rds.** No reader in the shipped set; users export CSV.
- **21 CFR Part 11 audit trail with e-signatures.** Needs identities and tamper-proof storage; P-76 and P-72 give the honest light version.
- **Re-creating Prism analyses and graphs from .prism files.** Undocumented; OpenDose recomputes.
- **webR or any second runtime in the app.** Tens of MB, breaks the one-engine story; useful at development time as a cross-check only. P-67 exports scripts instead.
- **WebGPU compute.** Pyodide's numpy and scipy cannot use it; nothing is GPU-bound.
- **Local or server LLM assistance.** Server agents break the no-third-party rule; browser-vendor models are Chrome-only and not app-controlled.
- **Running pybmds itself.** Its C++ core is not a Pyodide package; P-131 reimplements and validates against it.
- **Video and behaviour coding; electrophysiology (ABF), mass spectrometry (mzML), sequencing formats.** Other products.
- **Local Font Access.** Exports would differ per machine.
- **Web Serial and WebHID instrument streaming.** Chromium only, device protocols vary; file import covers the workflow.
- **EPS, EMF and CMYK output.** CMYK without the printer's ICC profile cannot be verified; journals accept RGB TIFF and PDF.
- **Embedding Arial or Helvetica.** Licences forbid it; P-02 uses an OFL or Apache font.
- **Full LaTeX or MathJax in labels.** Heavy, and it does not survive `toImage` or svg2pdf reliably; P-107's subset covers figure labels.
- **3D surface fits and 3D graphs** beyond the synergy landscapes. One X column per table; low demand.
- **Live OLE links to Word or PowerPoint, and a free-form vector editor.** The .pptx export, Copy for Word and layouts cover the need.
- **×10ⁿ display of e-notation in results** (DECISIONS 3). Copy, CSV and e2e read DOM text; it would need a parallel text channel.

## Already shipped

The research found these done; do not rebuild them.

- **Tests and estimates:** one-tailed t, Mann-Whitney and Wilcoxon (`ttests.py:82`); exact Kruskal-Wallis (`anova.py:562`); Kenward-Roger and Satterthwaite df (`ddfm.py`); lag-1 autocorrelation (`columnstats.lag1_autocorrelation`); KB next to pA2 (`schild.py:134`); delta-method ED50 CIs and parallel-line relative potency for quantal data (`quantal.py:512`); Dunn's against a control and for planned pairs; RM post hoc and the RM trend test (`rm_posthoc.py`); EC50 ratio between curves for two or more sets (`compare_params.py`); Cox regression with profile CIs (`cox.py`); Hosmer-Lemeshow (`multivar.py:561`); MuSyC and synergy for three or more drugs; Fligner-Killeen; weighted kappa (`trend.py:377`); generalized CMH; effect sizes with CIs (Cohen's f, η², partial η², φ/V, d/g/Glass Δ: `effectsize.py`); lognormal t test and ANOVA (`logscale.py`); median survival CI, pairwise log-rank, at-risk table, RMST; automatic k in clustering; profile CIs for logistic; ROUT for column data (`methodcomp.py:102`); Hougaard skewness; X-intercept CI; Grubbs; detectable effect instead of observed power (`guide/smallN.ts`); estimation plots with shared control (`estimation.py`); the multiple-regression ANOVA table; SynergyFinder statistics.
- **Curve fitting:** 91 model registrations (dose-response families, 3PL to 5PL, biphasic, bell, ECanything, absolute IC50, operational models, EC50 and allosteric shift, Gaddum/Schild, binding saturation, competition and kinetics, enzyme models and inhibition, exponentials, segmental lines, polynomials, peaks, growth models, Boltzmann); hold-constant constraints; weighting with a choice of source; asymptotic or profile CIs; robust fits and ROUT; global fits with shared parameters; user-defined equations with range constraints and initial-value rules; confidence and prediction bands; replicates, runs and residual-normality tests; range flags; fits to mean/SD/N; Compare fits (F test and AICc, one vs separate curves, one parameter between data sets, Slope included); zero-dose note and one-curve constraint (`sheets/xy/zeroDose.ts`).
- **Graphs and figures:** Format graph and Format axes, brackets and compact letters, classic theme, CVD and grayscale checks, validated palettes, one colour per group name by first appearance, SuperPlots, estimation, volcano and clustered heat maps, Kaplan-Meier with censor marks, at-risk table and CI bands, contingency graphs, discontinuous left Y axis, layouts with panel letters, export to PNG, SVG, JPEG, WebP, PDF and TIFF with DPI, .pptx, the font-floor check, forest plots for regression and Cox results.
- **Data in and out:** the paste report with identifiers kept as typed; Import dialog (delimiter, decimal comma, encoding, transpose, xlsx worksheets); recipes (FlowJo, CellProfiler, QuPath, plate grid, qPCR Cq text, Incucyte, LabChart, multi-read, per-image zips, tidy); Reshape; Convert table to; calculated columns with window and conditional functions (`formulas.py`); info constants as inputs; Find; Exclude by ID; sort; insert series; Extract and rearrange with row filters; manipulations (transform, normalise, baseline, transpose, prune, fraction of total); templates; Duplicate family; Apply to new data (one source per table); reproduce-on-open; History; plain and password share links; export bundle with wide and tidy CSV; .pzfx export and Prism-to-CSV batch; Copy for Word; batch graph export; CSV with decimal comma; R and Python snippets for about 20 analysis kinds; journal checklists (Nature, eLife, Cell STAR, SAMPL, ARRIVE Essential 10 partly); citation; virtualised grid and WebGL graphs; engine Web Worker; offline service worker; frozen tables; two-slot autosave (made tab-safe by P-01).
- **Guidance:** Help me choose, the experimental-unit question with replicate maps and "Statistics on replicate means" for column and grouped tables, blocking, multiplicity defaults, the analysis plan with deviations, design-stage checks, small-n withholding, "Did you mean an XY table?" for per-dose tests, qPCR reference genes and undetermined-Cq rules, kinetic assay to a linked Michaelis-Menten fit, flow statistics to tests, time-course models, per-plate standard curves.
