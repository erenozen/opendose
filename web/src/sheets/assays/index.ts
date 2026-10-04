// Assay modules: wizards that start from an instrument export (a plate
// grid, a Cq export, lane intensities ...) and produce a small family of
// linked sheets. Each module lives in its own folder and exports one
// AssayModule; adding a module = one import and one entry in ASSAYS.
//
// What the shell does with them:
// - New data table › "Start from an assay" lists ASSAYS and creates the
//   module's input table (empty layout or example) with `mainAnalysis`
//   and its default graph, then opens the module's wizard
//   (kit/create.ts: createAssayFamily, requestWizard);
// - registry.ts appends every module's analyses and graphs to the table
//   types listed with them, so the Analyze menu offers an assay on any
//   table of those types (after the type's own analyses, under an
//   "Assays" heading: ids start with "assay_").
// Shared pieces for module authors: kit/ (column roles, wizard, linked
// output tables, QC chips). Ids are stored in project files: never
// rename an analysis or graph id.
import type { DataTableModel, TableType } from "../../project/types";
import type { AnalysisDef, GraphKindDef } from "../types";
import { densitometryAssay } from "./densitometry";
import { plateAssay } from "./plate";
import { qpcrAssay } from "./qpcr";
import { stdcurveAssay } from "./stdcurve";

export interface AssayModule {
  /** Stable id ("plate", "qpcr", ...). */
  id: string;
  /** Name in the New table dialog: "Plate reader → dose-response". */
  label: string;
  /** One or two sentences: what goes in, what comes out. */
  description: string;
  /** Type of the input table a new assay family starts with. */
  tableType: TableType;
  /** Default name of that table. */
  tableName: string;
  /** The input table in the module's layout, without values. */
  emptyTable: () => DataTableModel;
  /** A small synthetic example in the same layout. */
  sampleTable: () => DataTableModel;
  /** Settings that go with the example (merged over the main analysis'
   *  defaults), e.g. the example plate's plate map. */
  sampleOptions?: () => object;
  /** Analysis a new assay family starts with (one of `analyses`, offered
   *  for `tableType`). */
  mainAnalysis: string;
  /** Analyses the module adds, and the table types that offer them. Ids
   *  start with "assay_". */
  analyses: { def: AnalysisDef; types: TableType[] }[];
  /** Graph kinds the module adds, per table type. */
  graphs: { def: GraphKindDef; types: TableType[] }[];
}

/** Display order in the New table dialog. */
export const ASSAYS: AssayModule[] = [
  plateAssay,
  stdcurveAssay,
  qpcrAssay,
  densitometryAssay,
];

export function assayById(id: string): AssayModule | undefined {
  return ASSAYS.find((m) => m.id === id);
}

/** Analyses of every module offered for a table type. */
export function assayAnalyses(type: TableType): AnalysisDef[] {
  return ASSAYS.flatMap((m) => m.analyses.filter((a) => a.types.includes(type)).map((a) => a.def));
}

/** Graph kinds of every module available for a table type. */
export function assayGraphs(type: TableType): GraphKindDef[] {
  return ASSAYS.flatMap((m) => m.graphs.filter((g) => g.types.includes(type)).map((g) => g.def));
}

/** Analysis ids of assay modules start with "assay_" (the Analyze menu
 *  lists them under their own heading). */
export const isAssayAnalysis = (id: string): boolean => id.startsWith("assay_");
