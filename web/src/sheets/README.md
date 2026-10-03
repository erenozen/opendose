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
    common/         DataGrid (generic editor), PlaceholderPanel
    xy/ column/ grouped/ contingency/ survival/ partsofwhole/
    multivariable/ nested/   ready (all eight table types)
    manipulate/     cross-type: Transform, Normalize, … (derived tables),
                    user formulas, Simulate data dialog, Monte Carlo
  components/       shell UI: Navigator, Header, FamilyWorkspace, dialogs,
                    plus the existing panels the sheets wrap
```

## Data model in one paragraph

A project is `{version: 2, title, sheets, prefs}`. A *data* sheet holds a
`DataTableModel`: an X column (`x`, whose length is the row count), row
titles, and `datasets` (Y columns) each with `rows[row][subcolumn]` raw
strings, optional `subTitles`, `excluded` cell keys (`"row:sub"`) and, for
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
}
```

Props the shell passes (see `types.ts` for the full shapes):

- `EditorProps { sheet, table, readOnly, onChange(fn, key?) }`:
  `onChange(t => setCell(t, …), "c:0:3:1")` applies a pure edit; edits with
  the same key within ~1 s are one undo step.
- `ControlsProps { sheet, table, options, onChange(options), readOnly }`
- `ResultsProps { sheet, table, options, result }` (`result` is null until
  the first run finishes; keep showing nothing rather than a spinner)
- `PlotProps { graph, table, options, result, titles, scheme }`: render
  one `<div className="plot">` (Plotly) for the export panel to find; the
  shell draws the card, the graph-type switcher and the Settings/Export
  strip around it. `table` already has excluded values blanked.

Graph settings that belong to one graph kind (which variable goes on
X, color-by, ...) can live on the graph sheet under `settings.<key>`;
`multivariable/chart.ts` has a `useGraphSettings` hook that reads and
writes them from inside a PlotPanel. An analysis whose output is a new
data table (extract & rearrange) adds it with `useAddDerivedTable` from
`app/derivedTable.ts`.

Rules the shell enforces so plugins do not have to: frozen sheets are
read-only and show their stored result/snapshot; results recompute
(debounced) when the table or options change; results live outside undo
history; option objects from old files are normalized before use.

## Adding a table type's analyses (the follow-up work packages)

The entry-only types (`grouped`, `partsofwhole`, `nested`) already have
their folder, final editor and registry entry. To ship one (see
`multivariable/` for a complete example):

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

`manipulate/` is the reference user (Transform, Normalize, …). Data
sheets can also carry `simulation: { kind, seed, form }`, written by the
Simulate data dialog so a table can be re-simulated. Brand-new table types need a `TableType` member in
`project/types.ts`, a `tableShape` entry in `project/table.ts`, and a
registry entry.
