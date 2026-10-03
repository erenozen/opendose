// Settings a graph sheet created from now on starts with: the figure
// conventions journals ask for (points spread symmetrically, the legend
// sentence under the graph, censor marks on survival curves). Graphs saved
// before these existed lack the keys and keep drawing exactly as before.
import type { TableType } from "../../project/types.ts";
import { NEW_COLUMN_GRAPH } from "../column/graphSettings.ts";
import { NEW_GROUPED_GRAPH } from "../grouped/options.ts";

/** Extra `GraphSettings` keys for a new graph of a table of this type. */
export function newGraphSettings(type: TableType): Record<string, unknown> {
  switch (type) {
    case "column": return { column: { ...NEW_COLUMN_GRAPH } };
    case "grouped": return { grouped: { ...NEW_GROUPED_GRAPH } };
    case "survival": return { survival: { censorMarks: true } };
    default: return {};
  }
}
