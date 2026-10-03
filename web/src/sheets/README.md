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
    xy/ column/ contingency/ survival/ multivariable/   ready
    grouped/ partsofwhole/ nested/   editor only
  components/       shell UI: Navigator, Header, FamilyWorkspace, dialogs,
                    plus the existing panels the sheets wrap
```

## Data model in one paragraph

A project is `{version: 2, title, sheets, prefs}`. A *data* sheet holds a
`DataTableModel`: an X column (`x`, whose length is the row count), row
titles, and `datasets` (Y columns) each with `rows[row][subcolumn]` raw
strings, optional `subTitles`, `excluded` cell keys (`"row:sub"`) and, for
multiple-variables tables, `varType`. `subcolumnFormat` (replicates or a
summary format such as Mean/SD/N) and `replicateLayout` are stored for the
summary-data work package. A *results* sheet binds an analysis id and its
options to a data sheet (`parentId`); a *graph* sheet binds a graph kind
and its settings to a data sheet and optionally a results sheet. A data
sheet plus its results and graphs is a *family*. Edit tables only through
the pure functions in `project/table.ts` (they keep every invariant and
remap exclusions when rows move).

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
`analyses`. Brand-new table types need a `TableType` member in
`project/types.ts`, a `tableShape` entry in `project/table.ts`, and a
registry entry.
