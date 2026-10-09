# Sheets: the table-type plugin seam

The app shell (navigator, header, workbench, persistence, undo) knows
nothing about any particular kind of data table. Everything type-specific
is looked up in `registry.ts`, which maps each of the eight table types to
a `TableTypeDef` (contract in `types.ts`).

```
src/
  project/          pure data model + reducers (no React): types, table ops,
                    sheet ops, history, persistence (v2 + v1 migration),
                    autosave, prefs. Unit tests: npm run test:unit
  app/              React providers and hooks: ProjectProvider (store,
                    selection, engine), UiProvider (dialogs), commands,
                    useAnalysisResult, autosave, file open, shortcuts
  sheets/
    registry.ts     TableType -> TableTypeDef
    types.ts        the plugin contract (below)
    common/         DataGrid (generic editor), PlaceholderPanel, P / CI
                    formatting (statFormat.ts), SuperPlots and replicate
                    maps (superplot.ts, SuperPlotOptions, ReplicateMapFields,
                    the "Assign replicates…" dialog), heat-map dendrograms
                    (dendrogram.ts)
    xy/ column/ grouped/ contingency/ survival/ partsofwhole/
    multivariable/ nested/   ready (all eight table types)
    manipulate/     cross-type: Transform, Normalize, … (derived tables),
                    user formulas, Simulate data dialog, Monte Carlo
    assays/         assay modules (plate reader, standard curve, qPCR,
                    densitometry, growth, tumour growth, AUC, synergy,
                    volcano, clustering); see below
  components/       shell UI: Navigator, Header, FamilyWorkspace, dialogs,
                    plus the existing panels the sheets wrap
  graph/            graph-format layer (Format graph / axes, annotations,
                    brackets, themes, legend sentence); see its README
  report/           reporting: P-value styles (pformat.ts), effect sizes,
                    results sentences, figure legends, methods paragraph,
                    checklists, provenance, R / Python snippets
  guide/            guidance: "Which test?" recommender and wizard, results
                    chips / banners / "why your number may differ" (fed by
                    the analysis id, options and result: no plugin work
                    needed), explainers + Help panel, start screen, tour.
                    Pure rules (recommend, paste, checks, banners, differ,
                    entry) are unit-tested in guide/__tests__
  share/            share links, export bundle, .pzfx, import recipes,
                    validation page
  power/            power and sample size, randomisation lists
```

## Writing P values, legends and n

- Results panels never write P by hand: `report/pformat.ts` (re-exported
  by `common/statFormat.ts` and `grouped/format.ts`) has `tableP` (a
  table cell), `pLabel` ("P = 0.0123" / "p = .012" / "P=0.01"), `pEquals`
  (after a written "P") and `formatPValue` (sentences), plus `tableStars`
  / `pSummary` and `starScale`. They follow the project's P-value style
  (Preferences → Reporting); graphs read it through
  `graph/significance.ts` (`graphPStyle`, `graphHideNs`), where a graph's
  own `format.pStyle` / `comparisons.hideNs` only override it.
- The figure legend under a graph and in the Report card is
  `report/legendFor.ts`; its "what is plotted" clause is the graph
  package's `legendSentence` clause (`graph/legend.ts plottedClause`) for
  column and grouped graphs, so the two never disagree. A graph kind that
  wants a better clause extends `legendSpec` / `whatIsPlotted`.
- n with its unit: Reporting details (`DataSheet.report`) first, then the
  table's replicate map (`report/replicates.ts`: `ReplicateMap.unit` and
  the number of experiments), so a SuperPlot table reports "n = 18 cells
  from 3 independent experiments" (or, on replicate means, "n = 3
  independent experiments (18 cells) per group", or "(54 cells in all)"
  when the groups differ in size). Grouped tables
  count n per row × data set cell; XY tables per X value. On experiment
  means the legend writes "n = 3 independent experiments (9 wells) per
  group". A t test or one-way ANOVA with fewer than two independent
  values in a group carries `withheld` and no P (`common/withheld.ts`):
  panels, sentences and legends describe the values instead.

## Data model in one paragraph

A project is `{version: 2, title, sheets, prefs}`. A *data* sheet holds a
`DataTableModel`: an X column (`x`, whose length is the row count), row
titles, and `datasets` (Y columns) each with `rows[row][subcolumn]` raw
strings, optional `subTitles`, `excluded` cell keys (`"row:sub"`) with
optional `exclusionReasons` under the same keys (`project/exclusions.ts`
sets, lists and counts them; the row operations keep them in step) and, for
multiple-variables tables, `varType`. `subcolumnFormat` is replicates or
a summary format such as Mean/SD/N (`SUBCOLUMN_FORMAT_ENGINE` maps it to
the engine's `summary_format` id; analyses that can use summaries pass
it, the rest return an error saying they need raw values). `xFormat`
dates / elapsed times are read into numbers by `project/xformat.ts`
(`numericData()` already does this); `decimals` is display only. A
*results* sheet binds an analysis id and its
options to a data sheet (`parentId`); a *graph* sheet binds a graph kind
and its settings to a data sheet and optionally a results sheet. A data
sheet plus its results and graphs is a *family*. Edit tables only through
the pure functions in `project/table.ts` (they keep every invariant and
remap exclusions when rows move: `sortRows`, `pickRows`, `deleteRows`,
`insertDataset`, `moveDataset`, `insertSeries`, block `clearBlock` /
`toggleBlockExcluded`, `setSubcolumnFormat`, ...). Text import lives in
`project/importText.ts`, CSV / TSV export in `project/exportTable.ts`,
the Data Inspector's numbers in `project/inspector.ts`; all unit-tested.
Project organisation is pure too: navigator groups (`project/groups.ts`,
`project.groups` + each sheet's `groupId`), floating notes
(`project/notes.ts`, `sheet.floatingNotes`), templates
(`project/templates.ts`), "Analyze and graph like…" and consistent graph
formats (`project/wand.ts`), and info constants hooked into an analysis'
`options.constants[i].info` (`project/infoLinks.ts`, synced on every edit).

`common/DataGrid` is the editor of every table type: toolbar (Import,
Export, Sort, Insert series, Rows, Columns, Format, Convert), block
selection, Data Inspector, and the dialogs in `common/`. A table type gets
all of it by using `DataGrid` as its `Editor`. Results sheets get Copy /
CSV / TSV of their rendered tables from the shell (`common/ResultsExport`).

## The contract

```ts
interface TableTypeDef {
  type: TableType;
  label: string;             // "XY", "Grouped", ...
  short: string;             // navigator tag
  description: string;       // one or two sentences, our own words
  status: "ready" | "entry-only";
  defaultTable: (init?: Partial<NewTableInit>) => DataTableModel;
  sampleTable?: () => DataTableModel;
  sampleName?: string;
  Editor: ComponentType<EditorProps>;        // usually common/DataGrid
  EditorAside?: ComponentType<AsideProps>;   // e.g. XY plate import
  entryHint?: string;
  ControlsPanel?: ComponentType<ControlsProps>;  // fallbacks for analyses /
  ResultsPanel?: ComponentType<ResultsProps>;    // graphs that do not
  PlotPanel?: ComponentType<PlotProps>;          // bring their own
  analyses: AnalysisDef[];   // first = what a new table starts with
  graphs: GraphKindDef[];
}

interface AnalysisDef<O, R> {
  id: string;                          // stored in results sheets: never rename
  label: string; short: string; description?: string;
  sheetName: (tableName: string) => string;   // "Nested t test of …"
  defaultOptions: (ctx: { table, prefs }) => O;
  normalizeOptions?: (raw: unknown, ctx) => O; // default: merge over defaults
  run: (engine: EngineBridge, table: DataTableModel, options: O) => R;
  defaultGraph: string | null;         // graph kind created with the results
  ControlsPanel?: ComponentType<ControlsProps<O>>;
  ResultsPanel?: ComponentType<ResultsProps<O, R>>;
  MethodsPanel?: ComponentType<ResultsProps<O, R>>;
  derivedTable?, derivedName?, derivedOnDemand?   // table-producing (below)
}

interface GraphKindDef<O, R> {
  id: string;                          // stored in graph sheets: never rename
  label: string;
  group: string;                       // kinds in one group are switchable
  analysis: string | null;             // results it draws, or null = raw table
  autoTitles: (table, options: O | null) => { x: string; y: string };
  showXTitle?: boolean;
  exportName: string;
  PlotPanel?: ComponentType<PlotProps<O, R>>;
  formatFeatures?: FormatFeatures;     // which Format graph controls apply
  OptionsPanel?: ComponentType<GraphOptionsProps<O, R>>;  // "Graph options"
  formatDatasets?: (table, graph, options) => string[];   // what Format graph
                                       // calls data sets, if not the table's
  comparisons?: (result, table, options) => ComparisonSet | null;  // brackets
  sheetName?: (tableName: string) => string;   // default "Graph of …"
}
```

Props the shell passes (see `types.ts` for the full shapes):

- `EditorProps { sheet, table, readOnly, onChange(fn, key?) }`:
  `onChange(t => setCell(t, …), "c:0:3:1")` applies a pure edit; edits with
  the same key within ~1 s are one undo step.
- `ControlsProps { sheet, table, options, onChange(options), readOnly }`
- `ResultsProps { sheet, table, options, result }` (`result` is null until
  the first run finishes; keep showing nothing rather than a spinner)
- `PlotProps { graph, table, options, result, titles, scheme, format,
  onFormatChange }`: render one `<div className="plot">` (Plotly) for the
  export panel to find; the shell draws the card, the graph-type switcher
  and the Settings/Export strip around it. `table` already has excluded
  values blanked. Draw through the graph-format layer (`src/graph`):
  build traces and layout, tag the traces, and render
  `graph/FormattedPlot` (or call `applyFormat` yourself); every graph kind
  sets `formatFeatures`.
- `GraphOptionsProps { graph, table, options, result }`: the graph kind's
  own options (which variable goes on X, color-by, error bars, slice
  labels, ...), rendered by the shell in the graph's Settings panel under
  "Graph options" with the controls in `components/GraphOptionControls`.
  They live on the graph sheet under `settings.<key>` (`useGraphOptions`
  in `common/graphOptions.ts`, `useGraphSetting` in `grouped/plotting.ts`,
  `useGraphSettings` in `multivariable/chart.ts`); the PlotPanel reads the
  same key. Never rename a key: saved projects store them.

The graph-type switcher offers the kinds of the graph's group that draw
the raw table or the analysis the graph is bound to.

Rules the shell enforces so plugins do not have to: frozen sheets are
read-only and show their stored result/snapshot; results recompute
(debounced) when the table or options change; results live outside undo
history; option objects from old files are normalized before use.

## Adding analyses and graphs to a table type

All eight types are ready. A type registered with `status: "entry-only"`
(editor final, analyses pending) gets a placeholder in the workbench; to
give it analyses, or to add more to a ready type (see `multivariable/`
for a complete example):

The engine (Pyodide) runs in a Web Worker, but `run` stays plain
synchronous code: the app calls it through `runEngine()` (src/lib/engine.ts),
where each `engine.analyze()` answers from a cache and the function is run
again until every request is answered (src/lib/engineReplay.ts). So `run`
must be deterministic (choose random seeds before it) and must not change
anything outside its return value. A panel that asks the engine something
itself uses `await analyzeAsync(payload)` or `await runEngine((engine) => …)`
(`getEngine()` only waits for the engine to be up). Long jobs show a busy
line with Cancel on their results sheet without any code in the sheet.

1. In `src/sheets/<type>/`, write `run.ts` (build the engine payload from
   the table with `numericData()` or by reading `table.datasets` /
   `rowTitles` / `varType` directly, call `engine.analyze`) and
   `panels.tsx` (Controls / Results / Plot components).
2. Export `defineAnalysis({...})` / `defineGraph({...})` objects from
   `index.ts`, add them to the type's `analyses` / `graphs`, and set
   `status: "ready"`.
3. That is all: the Analyze menu, header tabs, navigator, save/load,
   autosave, undo, freeze and export pick it up. Add an e2e step in
   `scripts/e2e-check.mjs` and, if the engine payload is non-trivial, a
   unit test next to `src/project/__tests__/`.

An analysis that applies to several table types (like column analyses,
which XY tables offer too) is defined once and listed in each type's
`analyses`. The data manipulations and Monte Carlo in `manipulate/` are
appended to every *ready* type's list by `registry.ts`
(`extraAnalyses` / `extraGraphs`), after the type's own analyses.

## Analyses that produce a table (chains)

Set `derivedTable(result, source, options)` (and optionally
`derivedName(tableName)`) on an `AnalysisDef` and it becomes a
table-producing analysis:

- adding it creates the results sheet *and* a data sheet flagged
  `derived: { sourceId, resultsId }` (`project/derived.ts`);
- `app/useDerivedSync.ts` (mounted once in `App.tsx`) re-runs every
  producer whose source table or options changed, upstream first, and
  writes the returned table into its derived sheet with `store.amend`
  (no undo step: undoing the source edit restores the matching derived
  table). It fills the results cache under the same key
  `useAnalysisResult` uses, so the producer's results sheet does not
  run twice;
- analyses of the derived table re-run because their table changed, so
  chains of any length stay live;
- derived tables are read-only (`updateTable` refuses them; the
  workbench passes `readOnly`); "Unlink" (`unlinkDerived`) keeps the
  values as ordinary data. Deleting the producer or the source family
  unlinks rather than deletes; copies of a derived table are plain data;
- the navigator lists derived tables under their source's family (with
  a link icon) as well as in their own row.

With `derivedOnDemand: true` the analysis is added without a table; its
results panel creates the linked table on request (`useLinkedTable` in
`app/linkedTable.ts`, `addLinkedTable` in `app/factory.ts`), and the
sync keeps it equal to the output in the same way. Extract & rearrange
(multiple variables) and Row means (grouped) work like this.

`manipulate/` is the reference user (Transform, Normalize, …). Data
sheets can also carry `simulation: { kind, seed, form }`, written by the
Simulate data dialog so a table can be re-simulated. Brand-new table types need a `TableType` member in
`project/types.ts`, a `tableShape` entry in `project/table.ts`, and a
registry entry.

## Assay modules (sheets/assays)

An assay module is a workflow that starts from an instrument or lab
export and produces a small family of linked sheets. Contract in
`assays/index.ts`: each module exports one `AssayModule` (input table
type and layout, example, main analysis, whether it has a setup wizard,
analyses and graphs per table type, optional built-in templates) and has
one entry in `ASSAYS`. The registry appends module analyses and graphs to
the listed types after each type's own (and after the cross-type
manipulations), so the Analyze menu offers them under an "Assays" divider
(`isAssayAnalysis`: ids `assay_*` plus every module's analysis ids); New
data table › Start from an assay lists every module and creates the input
table with the main analysis, opening the wizard of the modules that have
one (`kit/create.ts`); `app/templates.ts` adds each module's `templates`
to the built-in templates. Outputs are ordinary derived tables: a module
analysis is `derivedOnDemand` (`addDerivedOutputs` skips those, they are
made from the results sheet when asked for), each of its results sheets
feeds one linked table chosen by `options.output`, and `kit/create.ts`
(`ensureOutputs`, `setFamilySettings`) adds a producer per extra output
(one XY table per plate) and keeps the settings equal on all of them.
`kit/` also has the column-role resolver for long tables, the empty
layout of an example (`emptyLayout`), the wizard shell, QC chips and the
log2 fold-change graph.

Wizard modules, one folder each (ids `assay_*`):

- `plate`: plate reader → dose-response (plate map, Z′, CVs, normalised
  XY tables with the fit set up).
- `stdcurve`: standard curve / ELISA, `qpcr`: ΔCq / ΔΔCq, `densitometry`:
  Western blot densitometry. `qpcr/headers.ts` resolves Cq-export column
  names across instruments (shared with the qPCR import recipe); when an
  export does not name sample, target and Cq, the wizard asks for them.

One-file modules (pure parts `*Model.ts`, `*Sample.ts` unit-tested in
`assays/__tests__/`; panels load lazily):

- `growth`: XY growth curves → `growth_transform`, then `dose_response`
  with a growth model; doubling time ln 2 / K (or ln 2 / MuMax); the
  preprocessed curves as a linked table.
- `tumour`: long records (multiple-variables table: subject, group, time,
  value) or subjects as subcolumns of a grouped / XY table. Three
  analyses share one controls panel with a "which analysis?" guide: the
  mixed model (the grouped layout fed to the grouped sheet's
  `runTwoWay`, rendered by its `TwoWayResults`), AUC per subject (`auc`
  long mode → linked column table with its t test / ANOVA set up), time
  to endpoint (→ linked survival table).
- `synergy`: a grouped table as a combination matrix (row titles = drug 1
  concentrations, data-set titles = drug 2, subcolumns = replicate
  matrices) or long records; landscapes, monotherapy and Fa–CI graphs.
- `auc`: the XY area-under-the-curve analysis (example: a glucose
  tolerance test, one subcolumn per mouse).
- `volcano`: multiple-variables fold-change / P tables (`fdr_adjust`).
- `cluster`: grouped (cell means) and multiple-variables matrices →
  `cluster_heatmap`; dendrograms are Plotly line traces on extra axes
  aligned to the heat-map cells (`common/dendrogram.ts addDendrogram`,
  from the engine's coordinates).

The grouped heat map's "Cluster rows / columns" toggles
(`grouped/heatCluster.ts`) call the same engine handler with the cluster
assay's default linkage and distance (`DEFAULT_CLUSTER`: average,
Euclidean) on the matrix the map colours, and draw the returned
dendrograms with the same `addDendrogram` (row tree on the right, column
tree on the side away from the column labels; "Dendrograms" option). The
assay adds other linkages and distances, cluster strips, tree cuts and
k-means.

## Notes on specific analyses

- Curve-fit models come from the engine's `list_models` at boot
  (`lib/modelLibrary.ts`, which also keeps a static fallback for the
  boot sequence and for model ids older projects store). A results
  sheet with `model: "user"` carries its user-defined equation in
  `options.userEquation` (`lib/userEquation.ts`), so project files stay
  self-contained; the browser's "My equations" list is only a library.
- Stratified tables (Cochran-Mantel-Haenszel) use the ordinary
  contingency table: the rows of each stratum one after the other, every
  row title starting with its stratum and a separator ("Site A: exposed"
  / "Site A: not exposed"), the same rows and columns in every stratum.
  2×2 strata get the classic CMH test (Breslow-Day, Woolf), larger ones
  the generalized CMH test. A two-column table without such titles is
  read as two consecutive rows per stratum.
- "From long table…" (`common/LongTableButton` → `LongTableDialog`,
  pure reshapes in `common/longTable.ts`) fills the analysed table from
  long records for CMH (stratum, row, column, count), ROC (value, status),
  quantal (dose, N, responders, group) and the XY curve fit (data set, X,
  Y), as one undo step with the analysis' options adjusted.
- A new XY table's curve fit starts by itself only when the data look
  like a dose-response (`xy/autofit.ts`: four or more X values spaced
  like a dilution series, a monotone trend of the row means); otherwise
  the results offer "Choose a model": Linear regression (the results
  sheet switches analysis in place, `xy/switchAnalysis.ts`) or Fit a
  curve. `options.autoFit` is "auto" only on new results sheets; options
  without it (older files) and any explicit choice fit as before.
- Linear regression (`xy/linreg.ts`) uses the engine's
  `linear_regression` handler, or `dose_response` with
  `line_through_origin` when forced through the origin (R² and the ANOVA
  table then computed about Y = 0). Compare fits (`xy/compareFits.ts`)
  calls `compare_fits` per data set, or fits the pooled data sets (one
  curve) and each data set alone (separate curves) with `dose_response`
  and applies the F test / AICc of `xy/fitStats.ts`. Both draw through
  the XY plot; extra curves go in a data set's `altCurves`.
- Survival tables may carry covariate columns for Cox regression: a
  data set's subcolumns are Time, Event and then one subcolumn per
  covariate, named by its subcolumn title (the same position in every
  group; `survival/covariates.ts` adds, renames and removes them in all
  groups, and the editor aside above the grid calls those). Kaplan-Meier,
  log-rank and the risk tables read only the first two subcolumns; the
  .pzfx writer leaves the covariates out. Cox regression on a
  multiple-variables table names its time and event variables instead
  (`survival/cox.ts`, shared by both table types).
- ROC curves and Bland-Altman are their own analyses on column (and XY)
  tables (`column/roc.ts`, `column/blandAltman.ts`); the old entries in
  the column analysis' dropdown stay only for results sheets that already
  use them. Bland-Altman pairs values row by row.
- Quantal dose-response (`xy/quantal.ts`) reads responders and N from
  each data set's first two subcolumns, or from pairs of data sets. With
  a log dose transform, dose 0 rows are the control group (natural
  response estimated from them unless an upper asymptote or a natural
  response is set; "Leave out" drops them); the result's `notes` say so.
- The survival results list both log-rank forms (Peto Σ(O−E)²/E and the
  variance form of R's survdiff), observed and expected events, median
  CIs and a Kaplan-Meier table per group (`survival/kmTable.ts`), each
  with its own Copy / CSV (`common/TableCopy`).
- The power and sample size tool (`src/power/`) is a dialog, not a sheet
  kind; "Save to project" writes an info sheet whose constant "Sample
  size justification" holds the sentence (`findSampleSizeJustification`).
