import { emptyTable } from "../../project/table";
import DataGrid from "../common/DataGrid";
import type { TableTypeDef } from "../types";

// Editor final; descriptive stats, correlation matrix, multiple linear and
// logistic regression, PCA are the next work package.
export const multivariableTable: TableTypeDef = {
  type: "multivariable",
  label: "Multiple variables",
  short: "Multi",
  description: "Spreadsheet-style: one row per observation, one column per "
    + "variable, each continuous or categorical. For correlation matrices, "
    + "multiple regression, logistic regression and PCA.",
  status: "entry-only",
  defaultTable: (init) => emptyTable("multivariable", init),
  Editor: DataGrid,
  entryHint: "Each row is one observation (subject, sample); each column one "
    + "variable. Set a column to categorical for text levels such as "
    + "\"male\" / \"female\".",
  analyses: [],
  graphs: [],
};
