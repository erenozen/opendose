// Example FlowJo table (synthetic): CD4+ T cells of three donors (D1-D3)
// left unstimulated or stimulated with anti-CD3, anti-CD3 + anti-CD28 or
// PMA + ionomycin, one tube each, exported from the FlowJo Table Editor
// with the % CD69+ (Freq. of Parent), the CD69 median and the CD4+ count,
// plus FlowJo's Mean and SD summary rows (the import drops them). Donor
// 2 responds more and donor 3 less at every condition: the donor-to-donor
// spread a paired / repeated-measures analysis takes out.
import type { DataTableModel } from "../../../project/types.ts";
import { longTable } from "../kit/columns.ts";
import { tableFromFlowJo } from "./model.ts";

const CONDITIONS = ["Unstim", "aCD3", "aCD3+aCD28", "PMA+Iono"];
const FREQ = [[2.1, 3.4, 1.6], [18.5, 24.2, 14.8], [35.2, 41.7, 29.9], [78.4, 85.1, 71.6]];
const MEDIAN = [[412, 455, 389], [1830, 2210, 1540], [3120, 3650, 2780], [8950, 9840, 8120]];
const COUNT = [[12850, 11920, 13410], [12230, 11540, 12980], [11870, 11205, 12660], [10940, 10380, 11720]];

const HEADER = ",Lymphocytes/Single Cells/Live/CD4+/CD69+ | Freq. of Parent,"
  + "Lymphocytes/Single Cells/Live/CD4+/CD69+ | Median (BV421-A),Lymphocytes/Single Cells/Live/CD4+ | Count";

function rows(): string[] {
  const out: string[] = [];
  let tube = 0;
  for (let d = 0; d < 3; d++) {
    CONDITIONS.forEach((c, j) => {
      tube++;
      out.push(`D${d + 1}_${c}_${String(tube).padStart(3, "0")}.fcs,${FREQ[j][d]},${MEDIAN[j][d]},${COUNT[j][d]}`);
    });
  }
  return out;
}

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const sd = (v: number[]) => Math.sqrt(v.reduce((a, b) => a + (b - mean(v)) ** 2, 0) / (v.length - 1));
const all = (m: number[][]) => m.flat();
const r1 = (v: number) => String(Math.round(v * 10) / 10);

/** The example as FlowJo writes it (CSV, the summary rows at the end). */
export const FLOW_EXAMPLE_CSV = [HEADER, ...rows(),
  `Mean,${r1(mean(all(FREQ)))},${r1(mean(all(MEDIAN)))},${r1(mean(all(COUNT)))}`,
  `SD,${r1(sd(all(FREQ)))},${r1(sd(all(MEDIAN)))},${r1(sd(all(COUNT)))}`].join("\n");

export function flowSample(): DataTableModel {
  return tableFromFlowJo(FLOW_EXAMPLE_CSV)!.table;
}

export function emptyFlow(): DataTableModel {
  const blank = Array<string>(12).fill("");
  return longTable([
    { name: "Sample", varType: "categorical", values: blank },
    { name: "Statistic 1", varType: "continuous", values: blank },
  ]);
}
