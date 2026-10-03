import { emptyTable } from "../../project/table";
import DataGrid from "../common/DataGrid";
import type { TableTypeDef } from "../types";

// Editor final; analyses (two-way ANOVA, RM two-way) and grouped graphs
// (interleaved / stacked / separated bars, grouped scatter, heat map) are
// the next work package: add them to `analyses` / `graphs` here.
export const groupedTable: TableTypeDef = {
  type: "grouped",
  label: "Grouped",
  short: "Grp",
  description: "Two grouping factors: rows are the levels of one (titled on "
    + "the left), columns the levels of the other, with replicates side by "
    + "side. For two-way ANOVA and grouped bar graphs.",
  status: "entry-only",
  defaultTable: (init) => emptyTable("grouped", init),
  Editor: DataGrid,
  entryHint: "Title each row with a level of the first factor; each dataset "
    + "column is a level of the second factor. Replicates go side by side "
    + "in subcolumns.",
  analyses: [],
  graphs: [],
};
