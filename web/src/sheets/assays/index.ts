// Assay modules: workflows that start from an instrument or lab export
// (growth curves, tumour growth, synergy matrices, volcano tables,
// clustered heat maps, ...). One file per module exports an AssayModule;
// the registry appends each module's analyses and graphs to the table
// types it names, after the type's own analyses, and its example tables
// become built-in templates. Add a module: one file, one line below.
import type { TableType } from "../../project/types";
import type { AnalysisDef, GraphKindDef } from "../types";
import type { AssayModule } from "./types";
import { aucAssay } from "./auc";
import { growthAssay } from "./growth";
import { tumourAssay } from "./tumour";
import { synergyAssay } from "./synergy";
import { volcanoAssay } from "./volcano";
import { clusterAssay } from "./cluster";

export type { AssayModule, AssayTemplate } from "./types";

export const ASSAYS: AssayModule[] = [
  aucAssay,
  growthAssay,
  tumourAssay,
  synergyAssay,
  volcanoAssay,
  clusterAssay,
];

/** Analyses the assay modules add to a table type. */
export function assayAnalyses(type: TableType): AnalysisDef[] {
  return ASSAYS.flatMap((m) => m.analyses?.[type] ?? []);
}

/** Graph kinds the assay modules add to a table type. */
export function assayGraphs(type: TableType): GraphKindDef[] {
  return ASSAYS.flatMap((m) => m.graphs?.[type] ?? []);
}
