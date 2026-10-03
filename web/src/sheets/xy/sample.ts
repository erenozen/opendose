import { normalizeTable } from "../../project/table";
import type { DataTableModel } from "../../project/types";

// Reference dataset, identical to engine/tests/test_api.py REF_Y, so the
// app boots showing the dataset used for numeric cross-validation.
const REF_X = ["1e-9", "3.162e-9", "1e-8", "3.162e-8", "1e-7",
  "3.162e-7", "1e-6", "3.162e-6", "1e-5"];
const REF_ROWS = [
  ["98.2", "101.5", "99.1"],
  ["97.0", "95.8", "99.9"],
  ["93.4", "90.1", "92.7"],
  ["78.9", "82.3", "80.0"],
  ["51.2", "48.7", "50.9"],
  ["22.1", "25.6", "24.0"],
  ["8.9", "10.2", "7.5"],
  ["3.1", "4.4", "2.2"],
  ["1.0", "0.5", "2.1"],
];

export function xySample(): DataTableModel {
  return normalizeTable({
    type: "xy", x: REF_X, xTitle: "[Conc.]", xUnit: "M",
    datasets: [{ name: "Drug A", rows: REF_ROWS }],
  });
}
