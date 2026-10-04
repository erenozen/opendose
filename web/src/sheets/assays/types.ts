// The shape of one assay module (see ./index.ts).
import type { DataTableModel, TableType } from "../../project/types";
import type { AnalysisDef, GraphKindDef } from "../types";

/** An example table set up for the module, offered as a built-in
 *  template ("New data table" → From a template). */
export interface AssayTemplate {
  id: string;                 // stored as "builtin:<id>": never rename
  name: string;
  description: string;
  tableName: string;
  table: () => DataTableModel;
  analysis: string;           // analysis the family starts with
  options?: Record<string, unknown>;
  graphType?: string;
}

export interface AssayModule {
  id: string;
  label: string;
  analyses?: Partial<Record<TableType, AnalysisDef[]>>;
  graphs?: Partial<Record<TableType, GraphKindDef[]>>;
  templates?: AssayTemplate[];
}
