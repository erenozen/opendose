import { emptyTable } from "../../project/table";
import DataGrid from "../common/DataGrid";
import type { TableTypeDef } from "../types";

// Editor final; fraction of total, chi-square goodness of fit and pie /
// donut / stacked-bar graphs are the next work package.
export const partsOfWholeTable: TableTypeDef = {
  type: "partsofwhole",
  label: "Parts of whole",
  short: "Parts",
  description: "Values that add up to a whole: each row is one part, titled "
    + "on the left. For fractions of the total, pie and donut charts, and "
    + "goodness of fit against expected proportions.",
  status: "entry-only",
  defaultTable: (init) => emptyTable("partsofwhole", init),
  Editor: DataGrid,
  entryHint: "Enter one value per part (counts or amounts); title each row "
    + "with the name of the part.",
  analyses: [],
  graphs: [],
};
