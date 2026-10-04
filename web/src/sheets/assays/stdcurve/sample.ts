// Example ELISA plate (synthetic, numpy seed 42): eight standards in
// duplicate from 1000 to 7.81 pg/mL on a 4PL (Bottom 0.06, Top 2.6, EC50
// 180, Hill 1.1, 2.5% noise) plus a blank of 0.06. The 7.81 standard was
// made imprecise on purpose (CV 31%), so the LLOQ moves up to 15.63 pg/mL
// (ICH M10). Unknowns at 1:2: three controls and three treated samples,
// one treated sample above the ULOQ and one control below the LLOQ, and a
// QC pool diluted 1:2 to 1:16 for the parallelism check. The e2e test
// checks the LLOQ and a concentration computed natively by the engine.
import type { DataTableModel } from "../../../project/types.ts";
import { longTable } from "../kit/columns.ts";

const ROWS: [string, string, string, string, string, string, string][] = [
  // type, name, group, concentration, dilution, signal 1, signal 2
  ["Standard", "Std 1", "", "1000", "", "2.343", "2.267"],
  ["Standard", "Std 2", "", "500", "", "2.074", "2.083"],
  ["Standard", "Std 3", "", "250", "", "1.541", "1.566"],
  ["Standard", "Std 4", "", "125", "", "1.142", "1.13"],
  ["Standard", "Std 5", "", "62.5", "", "0.724", "0.71"],
  ["Standard", "Std 6", "", "31.25", "", "0.451", "0.451"],
  ["Standard", "Std 7", "", "15.63", "", "0.282", "0.288"],
  ["Standard", "Std 8", "", "7.81", "", "0.236", "0.202"],
  ["Blank", "Blank", "", "0", "", "0.063", "0.058"],
  ["Unknown", "S1", "Control", "", "2", "0.603", "0.581"],
  ["Unknown", "S2", "Control", "", "2", "0.721", "0.703"],
  ["Unknown", "S3", "Control", "", "2", "0.525", "0.518"],
  ["Unknown", "S4", "Treated", "", "2", "1.307", "1.257"],
  ["Unknown", "S5", "Treated", "", "2", "1.462", "1.466"],
  ["Unknown", "S6", "Treated", "", "2", "1.183", "1.177"],
  ["Unknown", "QC pool", "", "", "2", "1.8", "1.801"],
  ["Unknown", "QC pool", "", "", "4", "1.388", "1.293"],
  ["Unknown", "QC pool", "", "", "8", "0.846", "0.839"],
  ["Unknown", "QC pool", "", "", "16", "0.536", "0.544"],
  ["Unknown", "S7", "Treated", "", "2", "2.532", "2.527"],
  ["Unknown", "S8", "Control", "", "2", "0.168", "0.179"],
];

const COLS = ["Type", "Name", "Group", "Concentration", "Dilution", "Signal 1", "Signal 2"];

function build(rows: string[][], cols: string[] = COLS): DataTableModel {
  return longTable(cols.map((name, c) => ({
    name,
    varType: c < 3 || name === "Plate" ? "categorical" : "continuous",
    values: rows.map((r) => r[c] ?? ""),
  })));
}

export function stdcurveSample(): DataTableModel {
  return build(ROWS);
}

/** The layout without values: eight standard rows, a blank and unknowns,
 *  three replicate signals and an optional Plate column. */
export function emptyStdcurve(): DataTableModel {
  const rows: string[][] = [
    ...Array.from({ length: 8 }, (_, i) => ["Standard", `Std ${i + 1}`]),
    ["Blank", "Blank", "", "0"],
    ...Array.from({ length: 11 }, (_, i) => ["Unknown", `S${i + 1}`, "", "", "1"]),
  ];
  return build(rows, [...COLS, "Signal 3", "Plate"]);
}
