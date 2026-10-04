// Example expression matrix for the clustered heat map: log2 expression
// of 24 genes in 4 control and 4 treated samples. Synthetic and fixed:
// three modules of eight genes (up with treatment, down with treatment,
// unrelated to it), listed in shuffled order.
import { normalizeTable } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";

const SAMPLES = ["Ctrl 1", "Ctrl 2", "Ctrl 3", "Ctrl 4", "Trt 1", "Trt 2", "Trt 3", "Trt 4"];
const ROWS: [string, ...number[]][] = [
  ["Rpl2", 7.15, 8.04, 7.77, 7.76, 7.22, 7.99, 7.06, 8.37],
  ["Il8", 5.2, 4.5, 5.21, 4.9, 6.87, 7.18, 6.94, 7.39],
  ["Rpl1", 7.08, 7.42, 7.05, 8.19, 7.21, 7.71, 7.4, 7.07],
  ["Il7", 5.98, 6.91, 6.88, 6.78, 8.62, 8.23, 8.51, 8.62],
  ["Col6", 6.02, 6.55, 6.82, 6.3, 3.7, 4.48, 3.68, 4.06],
  ["Rpl7", 7.9, 9.32, 8.64, 8.39, 8.26, 8.91, 8.53, 8.98],
  ["Col1", 10.11, 10.45, 10.6, 10.18, 8.22, 8.07, 8.45, 8.19],
  ["Rpl8", 6.0, 5.86, 5.22, 6.39, 6.2, 6.39, 4.43, 6.19],
  ["Rpl4", 8.94, 9.24, 8.61, 8.49, 8.49, 8.98, 8.61, 8.8],
  ["Col8", 7.5, 7.72, 6.68, 7.39, 5.21, 5.84, 5.26, 5.46],
  ["Il3", 5.9, 5.45, 5.7, 6.05, 8.41, 8.37, 7.47, 8.65],
  ["Il6", 8.29, 8.44, 9.22, 8.38, 10.87, 10.83, 10.45, 10.52],
  ["Il1", 6.53, 6.99, 6.37, 6.6, 9.16, 8.95, 9.15, 8.96],
  ["Col5", 7.2, 7.76, 7.79, 7.19, 5.72, 5.8, 5.4, 5.57],
  ["Col2", 7.3, 7.05, 6.79, 7.3, 4.61, 5.11, 5.83, 5.01],
  ["Il2", 3.94, 3.82, 4.3, 3.79, 6.05, 5.88, 6.45, 6.52],
  ["Col7", 5.95, 6.6, 5.82, 5.87, 4.31, 4.23, 4.11, 3.59],
  ["Rpl3", 8.59, 9.48, 8.32, 8.83, 8.89, 8.4, 8.13, 8.56],
  ["Col3", 10.07, 11.22, 9.84, 10.32, 8.14, 7.98, 8.22, 8.48],
  ["Il4", 5.9, 5.57, 5.27, 5.57, 7.65, 7.5, 7.19, 8.3],
  ["Rpl6", 8.41, 7.79, 7.27, 8.1, 7.58, 8.42, 8.01, 7.88],
  ["Rpl5", 5.48, 6.73, 6.53, 6.66, 5.43, 5.5, 5.2, 6.1],
  ["Il5", 6.08, 5.55, 5.54, 5.72, 8.28, 8.65, 7.95, 8.73],
  ["Col4", 6.12, 6.92, 6.31, 7.63, 5.2, 4.79, 4.78, 4.27],
];

export function clusterSample(): DataTableModel {
  return normalizeTable({
    type: "multivariable",
    rowTitles: ROWS.map(() => ""),
    datasets: [
      { name: "Gene", varType: "categorical", rows: ROWS.map((r) => [r[0]]) },
      ...SAMPLES.map((s, j) => ({ name: s, varType: "continuous" as const,
        rows: ROWS.map((r) => [String(r[j + 1])]) })),
    ],
  });
}
