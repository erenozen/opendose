import { emptyTable } from "../../project/table";
import DataGrid from "../common/DataGrid";
import type { TableTypeDef } from "../types";

// Editor final; nested t test, nested one-way ANOVA (mixed model) and the
// nested scatter graph are the next work package.
export const nestedTable: TableTypeDef = {
  type: "nested",
  label: "Nested",
  short: "Nest",
  description: "Two-level hierarchy: each column is a group, its subcolumns "
    + "are subgroups (e.g. animals or culture dishes), and replicate values "
    + "run down the rows. For nested t tests and nested ANOVA.",
  status: "entry-only",
  defaultTable: (init) => emptyTable("nested", init),
  Editor: DataGrid,
  entryHint: "Each column is a treatment group; each subcolumn one subgroup "
    + "within it (an animal, a dish); enter that subgroup's replicate "
    + "measurements down the rows.",
  analyses: [],
  graphs: [],
};
