// The plugin contract between the app shell and each data-table type.
// See ./README.md for how to add a table type, an analysis or a graph.
import type { ComponentType } from "react";
import type { EngineBridge } from "../lib/engine";
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
  /** Run the analysis. Synchronous: the engine call blocks; return the
   *  result object (put `error` on it rather than throwing). */
  run: (engine: EngineBridge, table: DataTableModel, options: O) => R;
  /** Graph kind created together with a new results sheet (or null). */
  defaultGraph: string | null;
  ControlsPanel?: ComponentType<ControlsProps<O>>;
  ResultsPanel?: ComponentType<ResultsProps<O, R>>;
  MethodsPanel?: ComponentType<ResultsProps<O, R>>;
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
