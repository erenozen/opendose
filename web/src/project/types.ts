// Project model (v2): a project is an ordered list of sheets in five
// sections, mirroring how a lab notebook-style analysis project is laid
// out: data tables, info sheets, results, graphs and page layouts.
//
// Everything in this folder is plain data + pure functions (no React, no
// DOM), so it can be unit-tested with `node --test` and reused by any UI.
import type { SchemeId } from "../lib/palette.ts";
import type { GraphFormat } from "../graph/format.ts";
import type { CIMethod, ErrorBarKind } from "../types.ts";

export type Cell = string; // raw user input; "" = blank

/** The eight data-table formats. */
export type TableType =
  | "xy" | "column" | "grouped" | "contingency" | "survival"
  | "partsofwhole" | "multivariable" | "nested";

export const TABLE_TYPES: TableType[] = [
  "xy", "column", "grouped", "contingency", "survival",
  "partsofwhole", "multivariable", "nested",
];

export function isTableType(v: unknown): v is TableType {
  return typeof v === "string" && (TABLE_TYPES as string[]).includes(v);
}

/** How Y subcolumns are entered. Only "replicates" is analyzed today; the
 *  summary formats are stored so tables survive a round trip, and the
 *  follow-up work package wires them into the analyses. */
export type SubcolumnFormat =
  | "replicates"
  | "mean_sd_n" | "mean_sem_n" | "mean_cv_n" | "mean_ci_n"
  | "mean_sd" | "mean_sem" | "upper_lower";

export const SUBCOLUMN_FORMAT_LABELS: Record<SubcolumnFormat, string> = {
  replicates: "Replicate values",
  mean_sd_n: "Mean, SD, N",
  mean_sem_n: "Mean, SEM, N",
  mean_cv_n: "Mean, %CV, N",
  mean_ci_n: "Mean, 95% CI half-width, N",
  mean_sd: "Mean, SD",
  mean_sem: "Mean, SEM",
  upper_lower: "Mean, upper limit, lower limit",
};

/** Subcolumn titles each summary format implies (replicates: none). */
export const SUBCOLUMN_FORMAT_TITLES: Record<SubcolumnFormat, string[]> = {
  replicates: [],
  mean_sd_n: ["Mean", "SD", "N"],
  mean_sem_n: ["Mean", "SEM", "N"],
  mean_cv_n: ["Mean", "%CV", "N"],
  mean_ci_n: ["Mean", "CI", "N"],
  mean_sd: ["Mean", "SD"],
  mean_sem: ["Mean", "SEM"],
  upper_lower: ["Mean", "Upper", "Lower"],
};

/** Replicates entered side by side in subcolumns, or stacked down rows. */
export type ReplicateLayout = "side_by_side" | "stacked";

/** What the X column holds. Dates / elapsed times are stored as typed;
 *  parsing them into numbers lands with the date-axis work package. */
export type XFormat = "numbers" | "dates" | "elapsed";

/** Multiple-variables tables: each column is one variable. */
export type VarType = "continuous" | "categorical";

/** One Y column (a dataset / group / variable) with its subcolumns. */
export interface DataColumn {
  name: string;
  rows: Cell[][];          // rows x subcolumns
  subTitles?: string[];    // per subcolumn; "" or missing = automatic label
  excluded?: string[];     // "row:sub" keys of excluded cells
  varType?: VarType;       // multivariable tables only
}

/** The generic grid every table type is stored in. */
export interface DataTableModel {
  type: TableType;
  x: Cell[];               // X column; its length is the table's row count
  xTitle: string;
  xFormat: XFormat;
  xExcluded?: number[];    // excluded X rows
  xUnit: string;           // concentration unit shown in titles/results
  yTitle: string;          // "" = automatic Y axis title
  rowTitles: string[];     // length = row count ("" = untitled)
  datasets: DataColumn[];
  subcolumnFormat: SubcolumnFormat;
  replicateLayout: ReplicateLayout;
}

export type HighlightColor =
  | "red" | "orange" | "yellow" | "green" | "blue" | "purple";

export const HIGHLIGHT_COLORS: HighlightColor[] = [
  "red", "orange", "yellow", "green", "blue", "purple",
];

export type SheetKind = "data" | "info" | "results" | "graph" | "layout";

interface SheetBase {
  id: string;
  kind: SheetKind;
  name: string;
  frozen?: boolean;
  highlight?: HighlightColor | null;
}

export interface DataSheet extends SheetBase {
  kind: "data";
  table: DataTableModel;
}

export interface InfoConstant { name: string; value: string }

export interface InfoSheet extends SheetBase {
  kind: "info";
  parentId: string | null;  // linked data table, or null for project-wide
  notes: string;
  constants: InfoConstant[];
}

export interface ResultsSheet extends SheetBase {
  kind: "results";
  parentId: string;         // the data sheet analyzed
  analysis: string;         // analysis id from the sheets registry
  options: unknown;         // that analysis' options object
  /** Last computed result. Always present on frozen sheets (it is what they
   *  show); written for every results sheet when a project is saved. */
  cached?: unknown;
}

export interface GraphSettings {
  titles: { x: string; y: string };  // "" = automatic title
  scheme: SchemeId;
  /** Format Graph / Format Axes / annotations (sparse; absent = as drawn).
   *  Validate with readFormat() from src/graph before use. */
  format?: GraphFormat;
  [key: string]: unknown;
}

export interface GraphSheet extends SheetBase {
  kind: "graph";
  parentId: string;          // the data sheet plotted
  resultsId: string | null;  // results sheet the graph draws from, if any
  graphType: string;         // graph kind id from the sheets registry
  settings: GraphSettings;
  /** Frozen graphs keep a copy of their inputs so later edits leave them. */
  snapshot?: { table: DataTableModel; result: unknown; options: unknown };
}

export interface LayoutSheet extends SheetBase {
  kind: "layout";
  graphIds: string[];
  grid: { rows: number; cols: number };
}

export type Sheet = DataSheet | InfoSheet | ResultsSheet | GraphSheet | LayoutSheet;

/** Preferences: kept per browser, and copied into each project so a saved
 *  file reopens looking the way it was made. Theme stays per browser. */
export interface Prefs {
  defaultTableType: TableType;
  errorBars: ErrorBarKind;
  ciMethod: CIMethod;
  scheme: SchemeId;
  theme: "auto" | "light" | "dark";
  /** Significant digits shown in results tables. */
  digits: number;
}

export type ProjectPrefs = Omit<Prefs, "theme">;

export interface Project {
  version: 2;
  title: string;
  sheets: Sheet[];
  prefs: ProjectPrefs;
}

export const SECTION_ORDER: SheetKind[] =
  ["data", "info", "results", "graph", "layout"];

export const SECTION_LABELS: Record<SheetKind, string> = {
  data: "Data tables",
  info: "Info",
  results: "Results",
  graph: "Graphs",
  layout: "Layouts",
};
