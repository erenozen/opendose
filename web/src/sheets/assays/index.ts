// Assay modules: workflows that start from an instrument or lab export (a
// plate grid, a Cq export, lane intensities, growth curves, a tumour study
// log, a combination matrix, a fold-change table, an expression matrix
// ...) and produce a small family of linked sheets. Each module exports
// one AssayModule (the wizard modules from their own folder, the others
// from one file each); adding a module = one import and one entry in
// ASSAYS.
//
// What the shell does with them:
// - New data table › "Start from an assay" lists ASSAYS and creates the
//   module's input table (empty layout or example) with `mainAnalysis`
//   and its default graph, then opens the module's wizard when it has one
//   (kit/create.ts: createAssayFamily, requestWizard);
// - registry.ts appends every module's analyses and graphs to the table
//   types listed with them, so the Analyze menu offers an assay on any
//   table of those types (after the type's own analyses, under an
//   "Assays" heading: see isAssayAnalysis);
// - app/templates.ts adds every module's `templates` to the built-in
//   templates (New data table › From a template).
// Shared pieces for module authors: kit/ (column roles, wizard, linked
// output tables, QC chips). Ids are stored in project files: never
// rename an analysis, graph or template id.
import type { DataTableModel, TableType } from "../../project/types";
import type { AnalysisDef, GraphKindDef } from "../types";
import { aucAssay } from "./auc";
import { clusterAssay } from "./cluster";
import { densitometryAssay } from "./densitometry";
import { flowAssay } from "./flow";
import { growthAssay } from "./growth";
import { plateAssay } from "./plate";
import { qpcrAssay } from "./qpcr";
import { stdcurveAssay } from "./stdcurve";
import { synergyAssay } from "./synergy";
import { timecourseAssay } from "./timecourse";
import { tumourAssay } from "./tumour";
import { volcanoAssay } from "./volcano";

/** An example table set up for a module, offered as a built-in template
 *  (New data table › From a template). */
export interface AssayTemplate {
  /** Stored as "builtin:<id>": never rename. */
  id: string;
  name: string;
  description: string;
  tableName: string;
  table: () => DataTableModel;
  /** Analysis the family starts with. */
  analysis: string;
  /** Settings merged over that analysis' defaults. */
  options?: Record<string, unknown>;
  graphType?: string;
}

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
  /** A small example in the same layout. */
  sampleTable: () => DataTableModel;
  /** Settings that go with the example (merged over the main analysis'
   *  defaults), e.g. the example plate's plate map. */
  sampleOptions?: () => object;
  /** Analysis a new assay family starts with (one of `analyses`, offered
   *  for `tableType`). */
  mainAnalysis: string;
  /** True when the main analysis' controls open a setup wizard on a new
   *  family (they call kit/create.ts takeWizardRequest). */
  wizard?: boolean;
  /** Analyses the module adds, and the table types that offer them. */
  analyses: { def: AnalysisDef; types: TableType[] }[];
  /** Graph kinds the module adds, per table type. */
  graphs: { def: GraphKindDef; types: TableType[] }[];
  /** Example tables offered as built-in templates. */
  templates?: AssayTemplate[];
}

/** Display order in the New table dialog. */
export const ASSAYS: AssayModule[] = [
  plateAssay,
  stdcurveAssay,
  qpcrAssay,
  densitometryAssay,
  flowAssay,
  growthAssay,
  tumourAssay,
  timecourseAssay,
  synergyAssay,
  aucAssay,
  volcanoAssay,
  clusterAssay,
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

let assayIds: Set<string> | null = null;

/** Whether an analysis comes from an assay module (the Analyze menu lists
 *  them under their own heading). The wizard modules' ids start with
 *  "assay_"; the others keep the ids they were first saved with. */
export function isAssayAnalysis(id: string): boolean {
  assayIds ??= new Set(ASSAYS.flatMap((m) => m.analyses.map((a) => a.def.id)));
  return id.startsWith("assay_") || assayIds.has(id);
}
