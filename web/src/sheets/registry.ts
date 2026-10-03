// Table type -> its editor, analyses and graphs. The app shell knows
// nothing about any specific table type; it reads everything from here.
// Adding a table type = one folder under src/sheets/<type>/ plus one entry
// below. See ./README.md.
import type { TableType } from "../project/types";
import { columnTable } from "./column";
import { contingencyTable } from "./contingency";
import { groupedTable } from "./grouped";
import { multivariableTable } from "./multivariable";
import { nestedTable } from "./nested";
import { partsOfWholeTable } from "./partsofwhole";
import { survivalTable } from "./survival";
import type { AnalysisDef, GraphKindDef, TableTypeDef } from "./types";
import { xyTable } from "./xy";

export const REGISTRY: Record<TableType, TableTypeDef> = {
  xy: xyTable,
  column: columnTable,
  grouped: groupedTable,
  contingency: contingencyTable,
  survival: survivalTable,
  partsofwhole: partsOfWholeTable,
  multivariable: multivariableTable,
  nested: nestedTable,
};

/** Display order in the "New data table" dialog. */
export const TABLE_ORDER: TableType[] = [
  "xy", "column", "grouped", "contingency", "survival", "partsofwhole",
  "multivariable", "nested",
];

export function tableDef(type: TableType): TableTypeDef {
  return REGISTRY[type] ?? REGISTRY.xy;
}

export function analysisDef(type: TableType, id: string): AnalysisDef | undefined {
  return tableDef(type).analyses.find((a) => a.id === id);
}

export function graphDef(type: TableType, id: string): GraphKindDef | undefined {
  return tableDef(type).graphs.find((g) => g.id === id);
}
