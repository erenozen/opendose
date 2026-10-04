// Example data for the ROC and Bland-Altman analyses.
//
// aSAH: 113 patients with aneurysmal subarachnoid haemorrhage (Turck et
// al. 2010; the pROC package's `aSAH` data): outcome at 6 months (Good /
// Poor), the WFNS clinical score and serum S100B (µg/l). The engine's
// tests pin pROC's DeLong comparison of the paired curves (WFNS vs
// S100B, Z = 2.209, P = 0.02718) and the Youden cut-off of S100B (0.205).
//
// Ejection fraction: Bland & Altman (2007), Table 1: 12 subjects, 60
// paired measurements by radionuclide ventriculography (RV) and impedance
// cardiography (IC).
import { normalizeTable } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";

const ASAH = `
G,1,0.13 G,1,0.14 G,1,0.1 G,1,0.04 P,3,0.13 P,2,0.1 G,5,0.47 P,4,0.16 G,1,0.18 G,2,0.1 P,5,0.12
G,2,0.1 P,5,0.44 P,5,0.71 G,1,0.04 G,2,0.08 P,5,0.49 G,2,0.04 P,2,0.07 P,5,0.33 P,2,0.09
G,1,0.09 P,1,0.07 G,1,0.11 G,1,0.07 G,2,0.17 G,1,0.07 G,2,0.11 G,1,0.13 G,1,0.19 G,3,0.05
G,4,0.16 P,2,0.41 G,1,0.14 G,4,0.34 P,5,0.35 P,4,0.48 G,1,0.09 P,4,0.96 P,2,0.25 G,5,0.5
G,5,0.46 G,1,0.16 G,1,0.07 G,2,0.43 G,4,0.45 G,1,0.11 G,1,0.08 G,2,0.09 P,5,0.86 P,5,0.52
G,2,0.08 G,1,0.06 G,2,0.13 P,5,2.07 G,1,0.1 G,2,0.14 G,2,0.15 P,2,0.07 G,1,0.06 P,5,0.77
G,1,0.05 G,1,0.09 P,2,0.3 P,5,0.03 P,2,0.09 G,1,0.04 P,4,0.23 P,5,0.7 G,2,0.09 P,4,0.27 P,4,0.71
P,1,0.08 P,4,0.26 G,1,0.08 G,2,0.16 G,1,0.09 P,4,0.13 P,2,0.1 G,1,0.08 P,2,0.11 G,3,0.33
G,2,0.11 G,4,0.28 G,2,0.07 G,1,0.1 G,4,0.32 P,5,0.22 G,1,0.07 G,1,0.05 G,5,0.24 G,4,0.38 G,2,0.1
G,2,0.15 G,1,0.08 G,1,0.14 G,1,0.1 G,3,0.07 G,1,0.04 G,2,0.19 P,5,0.56 P,2,0.14 P,2,0.58
P,5,0.32 P,5,0.82 P,5,0.74 G,2,0.15 G,4,0.47 G,4,0.17 P,5,0.44 G,1,0.15 G,1,0.5 G,1,0.48
`;

const EJECTION = `
1,7.83,6.57 1,7.42,5.62 1,7.89,6.9 1,7.12,6.57 1,7.88,6.35 2,6.16,4.06 2,7.26,4.29 2,6.71,4.26
2,6.54,4.09 3,4.75,4.71 3,5.24,5.5 3,4.86,5.08 3,4.78,5.02 3,6.05,6.01 3,5.42,5.67 4,4.21,4.14
4,3.61,4.2 4,3.72,4.61 4,3.87,4.68 4,3.92,5.04 5,3.13,3.03 5,2.98,2.86 5,2.85,2.77 5,3.17,2.46
5,3.09,2.32 5,3.12,2.43 6,5.92,5.9 6,6.42,5.81 6,5.92,5.7 6,6.27,5.76 7,7.13,5.09 7,6.62,4.63
7,6.58,4.61 7,6.93,5.09 8,4.54,4.72 8,4.81,4.61 8,5.11,4.36 8,5.29,4.2 8,5.39,4.36 8,5.57,4.2
9,4.48,3.17 9,4.92,3.12 9,3.97,2.96 10,4.22,4.35 10,4.65,4.62 10,4.74,3.16 10,4.44,3.53
10,4.5,3.53 11,6.78,7.2 11,6.07,6.09 11,6.52,7.0 11,6.42,7.1 11,6.41,7.4 11,5.76,6.8 12,5.06,4.5
12,4.72,4.2 12,4.9,3.8 12,4.8,3.8 12,4.9,4.2 12,5.1,4.5
`;

/** Column table: WFNS and S100B for poor and good outcome, rows of the
 *  poor-outcome columns being the same patients (and likewise for good
 *  outcome), so the two markers pair up for DeLong's paired test. */
export function asahTable(): DataTableModel {
  const rows = ASAH.trim().split(/\s+/).map((r) => r.split(","));
  const col = (outcome: string, k: number) => rows.filter((r) => r[0] === outcome).map((r) => [r[k]]);
  return normalizeTable({
    type: "column",
    datasets: [
      { name: "WFNS, poor outcome", rows: col("P", 1) },
      { name: "WFNS, good outcome", rows: col("G", 1) },
      { name: "S100B, poor outcome", rows: col("P", 2) },
      { name: "S100B, good outcome", rows: col("G", 2) },
    ],
  });
}

/** Column table: RV and IC side by side, one row per measurement pair,
 *  subject numbers as row titles. */
export function ejectionTable(): DataTableModel {
  const rows = EJECTION.trim().split(/\s+/).map((r) => r.split(","));
  return normalizeTable({
    type: "column",
    rowTitles: rows.map((r) => `Subject ${r[0]}`),
    datasets: [
      { name: "RV", rows: rows.map((r) => [r[1]]) },
      { name: "IC", rows: rows.map((r) => [r[2]]) },
    ],
  });
}
