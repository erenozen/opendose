// Project model (v2): a project is an ordered list of sheets in five
// sections, mirroring how a lab notebook-style analysis project is laid
// out: data tables, info sheets, results, graphs and page layouts.
//
// Everything in this folder is plain data + pure functions (no React, no
// DOM), so it can be unit-tested with `node --test` and reused by any UI.
import type { SchemeId } from "../lib/palette.ts";
import type { GraphFormat } from "../graph/format.ts";
import type { CIMethod, ErrorBarKind } from "../types.ts";
import type { ReportMeta } from "../report/meta.ts";
import type { ReportPrefs } from "../report/prefs.ts";

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

/** How Y subcolumns are entered: raw replicate values, or summary values
 *  computed elsewhere (mean with SD / SEM / %CV / CI limits / errors /
 *  limits, with or without N), analyzed through the engine's summary-data
 *  handlers. */
export type SubcolumnFormat =
  | "replicates"
  | "mean_sd_n" | "mean_sem_n" | "mean_cv_n" | "mean_ci_n"
  | "mean_sd" | "mean_sem" | "mean_cv" | "mean_pm" | "upper_lower";

/** Menu order of the subcolumn formats. */
export const SUBCOLUMN_FORMATS: SubcolumnFormat[] = [
  "replicates", "mean_sd_n", "mean_sem_n", "mean_cv_n", "mean_ci_n",
  "mean_sd", "mean_sem", "mean_cv", "mean_pm", "upper_lower",
];

export const SUBCOLUMN_FORMAT_LABELS: Record<SubcolumnFormat, string> = {
  replicates: "Replicate values",
  mean_sd_n: "Mean, SD, N",
  mean_sem_n: "Mean, SEM, N",
  mean_cv_n: "Mean, %CV, N",
  mean_ci_n: "Mean, 95% CI limits, N",
  mean_sd: "Mean, SD",
  mean_sem: "Mean, SEM",
  mean_cv: "Mean, %CV",
  mean_pm: "Mean, + error, − error",
  upper_lower: "Mean, upper limit, lower limit",
};

/** Subcolumn titles each summary format implies (replicates: none). */
export const SUBCOLUMN_FORMAT_TITLES: Record<SubcolumnFormat, string[]> = {
  replicates: [],
  mean_sd_n: ["Mean", "SD", "N"],
  mean_sem_n: ["Mean", "SEM", "N"],
  mean_cv_n: ["Mean", "%CV", "N"],
  mean_ci_n: ["Mean", "Lower CI", "Upper CI", "N"],
  mean_sd: ["Mean", "SD"],
  mean_sem: ["Mean", "SEM"],
  mean_cv: ["Mean", "%CV"],
  mean_pm: ["Mean", "+Error", "−Error"],
  upper_lower: ["Mean", "Upper", "Lower"],
};

/** The engine's id for each format (engine/opendose/summary.py FORMATS). */
export const SUBCOLUMN_FORMAT_ENGINE: Record<SubcolumnFormat, string> = {
  replicates: "replicates",
  mean_sd_n: "mean_sd_n", mean_sem_n: "mean_sem_n", mean_cv_n: "mean_cv_n",
  mean_ci_n: "mean_ci_n", mean_sd: "mean_sd", mean_sem: "mean_sem",
  mean_cv: "mean_cv", mean_pm: "mean_pm", upper_lower: "mean_limits",
};

/** Formats that carry N: only these support tests and full curve fits. */
export const SUBCOLUMN_FORMAT_HAS_N: Record<SubcolumnFormat, boolean> = {
  replicates: true, mean_sd_n: true, mean_sem_n: true, mean_cv_n: true,
  mean_ci_n: true, mean_sd: false, mean_sem: false, mean_cv: false,
  mean_pm: false, upper_lower: false,
};

/** Replicates entered side by side in subcolumns, or stacked down rows. */
export type ReplicateLayout = "side_by_side" | "stacked";

/** What the X column holds. Dates / elapsed times are stored as typed and
 *  converted to numbers for analyses and graphs (project/xformat.ts). */
export type XFormat = "numbers" | "dates" | "elapsed";

/** Unit dates / elapsed times are converted to for analyses and graphs. */
export type XTimeUnit = "seconds" | "minutes" | "hours" | "days" | "weeks" | "years";

/** How an ambiguous date such as 1/2/2024 is read. */
export type DateOrder = "dmy" | "mdy";

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
  /** Decimal places shown in the grid (undefined = as typed). Display only:
   *  analyses and exports use every stored digit. */
  decimals?: number;
  /** Dates / elapsed X: unit of the numbers analyses and graphs see. */
  xTimeUnit?: XTimeUnit;
  /** Dates X: reading of ambiguous dates such as 1/2/2024. */
  xDateOrder?: DateOrder;
  /** Elapsed X: whether a two-part time such as 12:30 is h:mm or m:ss. */
  xElapsedTwoPart?: "hm" | "ms";
  /** Biological replicates (independent experiments) of a column or
   *  grouped table, for SuperPlots and statistics on replicate means
   *  (sheets/common/superplot.ts). Absent = each Y subcolumn is one. */
  replicates?: ReplicateMap;
  /** Names of the factors the rows and the data sets stand for, when the
   *  table came from a file that named them (the header above the row
   *  titles; a long file's factor columns). Two-way analyses use them
   *  until the user names the factors. */
  factorNames?: { rows?: string; datasets?: string };
}

/** Which values belong to which biological replicate (experiment).
 *  "subcolumns": Y subcolumn k of every data set belongs to replicate
 *  `of[k]` (missing entries: replicate k), so technical repeats can share
 *  an experiment. "column": the data set at index `column` holds each
 *  row's experiment label (long format; column tables only) and is not a
 *  group. `names` label the replicates (default: subcolumn titles, the
 *  labels found in the column, or "Experiment n"). `unit` says what one
 *  value is ("cells", "wells", "fields"), so the figure legend can write
 *  "n = 18 cells from 3 independent experiments" (src/report). */
export interface ReplicateMap {
  by: "subcolumns" | "column";
  of?: number[];
  column?: number;
  names?: string[];
  unit?: string;
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
  /** User-defined navigator group (a SheetGroup of this sheet's section). */
  groupId?: string;
  /** Sticky notes shown over this sheet (never printed or exported). */
  floatingNotes?: FloatingNote[];
}

/** Navigator sections that can hold user-defined groups. */
export type GroupSection = "data" | "results" | "graph";

export const GROUP_SECTIONS: GroupSection[] = ["data", "results", "graph"];

export function isGroupSection(v: unknown): v is GroupSection {
  return typeof v === "string" && (GROUP_SECTIONS as string[]).includes(v);
}

/** A user-defined group of sheets inside one navigator section. Sheets
 *  join it through their `groupId`; deleting a group keeps its sheets. */
export interface SheetGroup {
  id: string;
  section: GroupSection;
  name: string;
  /** Folded in the navigator (saved with the project, outside undo). */
  collapsed?: boolean;
}

export type NoteColor = "yellow" | "blue" | "green" | "pink" | "purple";

export const NOTE_COLORS: NoteColor[] = ["yellow", "blue", "green", "pink", "purple"];

/** A floating note on a sheet: on-screen annotation only. */
export interface FloatingNote {
  id: string;
  text: string;
  color: NoteColor;
  /** Top-left corner inside the workbench, in CSS px. */
  x: number;
  y: number;
  /** Folded into its chip above the sheet. */
  collapsed?: boolean;
}

export interface DataSheet extends SheetBase {
  kind: "data";
  table: DataTableModel;
  /** Set when this table is the output of a table-producing analysis (a
   *  "chain"): it is recomputed from its source and read-only until
   *  unlinked. See derived.ts. */
  derived?: DerivedLink;
  /** Set when this table was simulated: what to re-run for "Simulate
   *  again". The table itself is ordinary, editable data. */
  simulation?: SimulationSpec;
  /** Reporting details (unit of n, independent experiments, exclusions,
   *  sample-size reasoning) for legends, methods and journal checklists
   *  (src/report). */
  report?: ReportMeta;
}

/** A derived table's provenance: the data sheet it is computed from and
 *  the results sheet (on that data sheet) whose analysis produces it. */
export interface DerivedLink {
  sourceId: string;
  resultsId: string;
}

/** How a simulated table was made. `form` is the simulation dialog's
 *  state (owned by sheets/manipulate); `seed` the seed of the last run. */
export interface SimulationSpec {
  kind: "xy" | "column" | "contingency";
  seed: number;
  form: unknown;
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
  /** Fingerprint of the input `cached` was computed from (app/analysis.ts
   *  resultKey); a reopened project reuses the result while it matches. */
  cachedKey?: string;
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

/** Page size of a layout. All layout lengths are millimetres measured
 *  from the page's top-left corner (see project/layout.ts). */
export type PageSize = "a4" | "letter" | "custom";

export interface LayoutPage {
  size: PageSize;
  orientation: "portrait" | "landscape";
  width: number;            // mm, used when size is "custom"
  height: number;
  margin: number;           // mm, all four sides
  background: string;       // CSS hex colour, or "transparent"
}

export interface LayoutRect { x: number; y: number; w: number; h: number }

/** One thing placed on a layout page. */
export type LayoutItem = LayoutRect & { id: string } & (
  /** A placeholder bound to a graph sheet (null = empty placeholder). */
  | { kind: "graph"; graphId: string | null; hideLegend?: boolean }
  /** An unlinked picture: a static SVG snapshot of a graph. */
  | { kind: "picture"; name: string; svg: string }
  | { kind: "text"; text: string; fontSize: number; bold: boolean;
      align: "left" | "center" | "right" }
  /** One legend for every graph on the page (de-duplicated). */
  | { kind: "legend"; fontSize: number; columns: number }
);

export interface PanelLetters {
  show: boolean;
  style: "upper" | "lower";
  format: "plain" | "paren" | "period";   // A, (A), A.
  fontSize: number;          // pt
  bold: boolean;
  font: "sans" | "serif";
  position: "inside" | "outside";          // top-left inside or above the panel
}

export interface LayoutSheet extends SheetBase {
  kind: "layout";
  /** Graphs placed on the page (kept in sync with `items`). */
  graphIds: string[];
  grid: { rows: number; cols: number };
  /** Absent in files from before the page composer: defaults apply and
   *  the items are built from graphIds + grid. */
  page?: LayoutPage;
  items?: LayoutItem[];
  letters?: PanelLetters;
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
  /** Last image-export settings (see export/settings.ts); travel with
   *  the project, outside undo history. */
  export?: ExportPrefs;
  /** P-value style, "ns" display and default effect-size family
   *  (src/report/prefs.ts); absent = defaults. */
  report?: ReportPrefs;
}

export type ExportFormat = "png" | "svg" | "pdf" | "tiff" | "jpeg" | "webp";

export interface ExportPrefs {
  format: ExportFormat;
  width: number;            // CSS px = 1/96 in (the graph's laid-out size)
  height: number;
  dpi: number;              // raster formats
  unit: "px" | "mm" | "in"; // how W and H are shown
  transparent: boolean;     // no background (PNG, WebP, SVG, PDF)
  paper: boolean;           // dark theme: export in light, print colours
  /** Scale the graph as drawn on screen to the export size (text shrinks
   *  or grows with it) instead of laying it out again at that size. */
  scaleText: boolean;
}

export type ProjectPrefs = Omit<Prefs, "theme">;

export interface Project {
  version: 2;
  title: string;
  sheets: Sheet[];
  prefs: ProjectPrefs;
  /** User-defined navigator groups, in display order (optional: absent in
   *  older files; repaired on load, see groups.ts). */
  groups?: SheetGroup[];
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
