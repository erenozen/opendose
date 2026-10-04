// Example for the area-under-the-curve assay: an intraperitoneal glucose
// tolerance test, blood glucose (mg/dL) at 0 to 120 min in four mice on
// chow and four on a high-fat diet, one subcolumn per mouse (synthetic
// numbers in the usual range; not from a publication).
import { normalizeTable } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";

const MINUTES = [0, 15, 30, 60, 90, 120];
// [mouse][time]
const CHOW = [
  [92, 210, 245, 180, 140, 110],
  [88, 195, 230, 172, 128, 102],
  [101, 225, 260, 190, 150, 118],
  [95, 205, 238, 176, 135, 108],
];
const HFD = [
  [128, 290, 345, 300, 240, 190],
  [135, 310, 362, 318, 262, 205],
  [122, 275, 330, 285, 228, 178],
  [140, 320, 375, 330, 270, 215],
];

export function aucSample(): DataTableModel {
  const rows = (mice: number[][]) => MINUTES.map((_, i) => mice.map((m) => String(m[i])));
  return normalizeTable({
    type: "xy",
    xTitle: "Time (min)",
    xUnit: "",
    yTitle: "Blood glucose (mg/dL)",
    x: MINUTES.map(String),
    datasets: [
      { name: "Chow", rows: rows(CHOW) },
      { name: "High-fat diet", rows: rows(HFD) },
    ],
  });
}
