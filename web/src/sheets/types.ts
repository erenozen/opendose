// The plugin contract between the app shell and each data-table type.
// See ./README.md for how to add a table type, an analysis or a graph.
import type { ComponentType } from "react";
import type { EngineBridge } from "../lib/engine";
import type { FormatFeatures, GraphFormat } from "../graph/format";
import type { ComparisonSet } from "../graph/results";
import type { SchemeId } from "../lib/palette";
import type { NewTableInit } from "../project/table";
import type {
  DataSheet, DataTableModel, GraphSheet, ProjectPrefs, ResultsSheet, TableType,
} from "../project/types";

/** Apply a pure edit to the sheet's table. Edits with the same `key`
 *  arriving within ~1 s fold into one undo step (typing in one cell). */
export type TableEdit = (
  fn: (t: DataTableModel) => DataTableModel, key?: string,
) => void;

export interface EditorProps {
  sheet: DataSheet;
  table: DataTableModel;
  readOnly: boolean;        // frozen sheet, or engine still loading
  onChange: TableEdit;
}

/** Optional panel above the editor (e.g. XY plate import). It can edit the
 *  table and this family's analysis options as one undo step. */
export interface AsideProps extends EditorProps {
  editFamily: (edit: {
    table?: (t: DataTableModel) => DataTableModel;
    /** analysis id -> options updater, applied to every results sheet of
     *  that analysis in this family */
    options?: Record<string, (o: unknown) => unknown>;
  }) => void;
}

export interface ControlsProps<O = unknown> {
  sheet: ResultsSheet;
  table: DataTableModel;
  options: O;
  onChange: (o: O) => void;
  readOnly: boolean;
}

export interface ResultsProps<O = unknown, R = unknown> {
  sheet: ResultsSheet;
  table: DataTableModel;
  options: O;
  result: R | null;          // null while the first run is pending
}

export interface PlotProps<O = unknown, R = unknown> {
  graph: GraphSheet;
  table: DataTableModel;     // exclusions already blanked
  options: O | null;         // options of the bound results sheet, if any
  result: R | null;          // result of the bound results sheet, if any
  titles: { x: string; y: string };  // resolved: override or automatic
  scheme: SchemeId;
  /** Format Graph / Format Axes settings of this graph (validated); pass
   *  to applyFormat (see src/graph/README.md). */
  format?: GraphFormat;
  /** Persist a new format (annotation drags). Absent on frozen graphs. */
  onFormatChange?: (f: GraphFormat) => void;
}

/** A graph kind's own options (which variable on X, slice labels, error
 *  bars, ...), shown in the graph's Settings panel under "Graph options".
 *  They live on the graph sheet (`graph.settings.<key>`); frozen graphs do
 *  not show the panel. */
export interface GraphOptionsProps<O = unknown, R = unknown> {
  graph: GraphSheet;
  table: DataTableModel;     // exclusions already blanked
  options: O | null;
  result: R | null;
}

export interface AnalysisContext {
  table: DataTableModel;
  prefs: ProjectPrefs;
}

export interface AnalysisDef<O = unknown, R = unknown> {
  id: string;
  label: string;             // menu label: "Nonlinear regression (curve fit)"
  short: string;             // tab label: "Curve fit"
  description?: string;
  /** Name of a new results sheet for a table called `tableName`. */
  sheetName: (tableName: string) => string;
  defaultOptions: (ctx: AnalysisContext) => O;
  /** Bring options read from a file up to date (default: shallow-merge
   *  over defaultOptions). */
  normalizeOptions?: (raw: unknown, ctx: AnalysisContext) => O;
  /** Run the analysis: synchronous code, `engine.analyze()` answers at
   *  once. The app runs it in the engine worker's terms with runEngine
   *  (src/lib/engine.ts), which may call it several times until every
   *  request is answered, so it must be deterministic and free of side
   *  effects. Return the result object (put `error` on it rather than
   *  throwing). */
  run: (engine: EngineBridge, table: DataTableModel, options: O) => R;
  /** Graph kind created together with a new results sheet (or null). */
  defaultGraph: string | null;
  ControlsPanel?: ComponentType<ControlsProps<O>>;
  ResultsPanel?: ComponentType<ResultsProps<O, R>>;
  MethodsPanel?: ComponentType<ResultsProps<O, R>>;
  /** Table-producing analyses (manipulations, "chains of analyses"):
   *  the data table this result stands for. When set, adding the
   *  analysis also creates a derived data sheet linked to the source,
   *  which the shell keeps equal to this output (null = leave it as is,
   *  e.g. while the result is an error). See project/derived.ts. */
  derivedTable?: (result: R, source: DataTableModel, options: O) => DataTableModel | null;
  /** Name of that derived table for a source called `tableName`. */
  derivedName?: (tableName: string) => string;
  /** The derived table is made on request (a button in the results, e.g.
   *  "Create data table") rather than whenever the analysis is added. It
   *  is linked and kept in sync the same way once it exists. */
  derivedOnDemand?: boolean;
}

export interface GraphKindDef<O = unknown, R = unknown> {
  id: string;
  label: string;
  /** Kinds in the same group can be switched between in the graph header. */
  group: string;
  /** Analysis whose result the plot draws, or null if it plots the table. */
  analysis: string | null;
  autoTitles: (table: DataTableModel, options: O | null) => { x: string; y: string };
  showXTitle?: boolean;      // false: categorical X labeled by dataset names
  exportName: string;        // default download file name
  PlotPanel?: ComponentType<PlotProps<O, R>>;
  /** Which Format Graph controls apply (default: points, lines, error bars). */
  formatFeatures?: FormatFeatures;
  /** Graph options of this kind, shown in the Settings panel. */
  OptionsPanel?: ComponentType<GraphOptionsProps<O, R>>;
  /** Pairwise comparisons this graph can draw as brackets, when they are
   *  not one-group-per-data-set (grouped graphs). Default: read from the
   *  result for `formatFeatures.categorical` graphs. */
  comparisons?: (result: R | null, table: DataTableModel, options: O | null) =>
    ComparisonSet | null;
  /** What Format graph lists as "data sets" (index = key in
   *  GraphFormat.datasets), when it is not the table's data sets: the
   *  parts of a pie, the rows of a grouped graph clustered by data set,
   *  the levels of a colour-by variable. Must match the plot's tags. */
  formatDatasets?: (table: DataTableModel, graph: GraphSheet, options: O | null) => string[];
  /** Name of a new graph sheet for a table called `tableName` (default
   *  "Graph of …"). */
  sheetName?: (tableName: string) => string;
}

export interface TableTypeDef {
  type: TableType;
  label: string;             // "XY", "Grouped", ...
  short: string;             // navigator tag
  description: string;       // one or two sentences, our own words
  /** "ready": has analyses; "entry-only": editor final, analyses pending. */
  status: "ready" | "entry-only";
  defaultTable: (init?: Partial<NewTableInit>) => DataTableModel;
  sampleTable?: () => DataTableModel;
  sampleName?: string;
  Editor: ComponentType<EditorProps>;
  EditorAside?: ComponentType<AsideProps>;
  /** Shown under the editor when the family has no results sheet. */
  entryHint?: string;
  /** Fallback panels for analyses / graphs that do not bring their own. */
  ControlsPanel?: ComponentType<ControlsProps>;
  ResultsPanel?: ComponentType<ResultsProps>;
  PlotPanel?: ComponentType<PlotProps>;
  /** First entry = the analysis a new table of this type starts with. */
  analyses: AnalysisDef[];
  /** Graph kinds available for this table type. */
  graphs: GraphKindDef[];
}

/** Type-erase a typed analysis for storage in the registry. */
export function defineAnalysis<O, R>(def: AnalysisDef<O, R>): AnalysisDef {
  return def as unknown as AnalysisDef;
}

export function defineGraph<O, R>(def: GraphKindDef<O, R>): GraphKindDef {
  return def as unknown as GraphKindDef;
}
