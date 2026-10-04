// Example plate: a synthetic 96-well viability read (numpy seed
// 20261004). Column 1 medium blank (0.05), column 2 vehicle (1.25),
// column 12 kill control (0.10); columns 3–11 nine 1:3 concentrations
// from 10 µM of three compounds (true IC50 0.5, 2 and 0.1 µM; Hill 1.0,
// 1.4, 0.8) in rows A–C, D–F and G–H, with 4% multiplicative noise. The
// layout is plate/model.ts rowsLayout(); the e2e test checks the Z′ and
// the Drug A IC50 the engine computes natively on exactly these values.
import type { DataTableModel } from "../../../project/types.ts";
import { plateTable } from "./model.ts";

export const SAMPLE_PLATE: number[][] = [
  [0.046, 1.216, 0.154, 0.251, 0.454, 0.777, 1.007, 1.152, 1.138, 1.224, 1.277, 0.086],
  [0.054, 1.186, 0.16, 0.261, 0.479, 0.829, 1.109, 1.162, 1.269, 1.249, 1.233, 0.103],
  [0.05, 1.275, 0.159, 0.263, 0.478, 0.741, 1.005, 1.166, 1.23, 1.253, 1.293, 0.112],
  [0.047, 1.246, 0.196, 0.485, 0.865, 1.099, 1.238, 1.246, 1.29, 1.264, 1.205, 0.095],
  [0.054, 1.338, 0.21, 0.474, 0.92, 1.099, 1.275, 1.266, 1.208, 1.316, 1.218, 0.105],
  [0.055, 1.242, 0.206, 0.501, 0.909, 1.191, 1.296, 1.162, 1.262, 1.275, 1.184, 0.084],
  [0.042, 1.239, 0.123, 0.162, 0.261, 0.414, 0.606, 0.833, 1.084, 1.153, 1.174, 0.094],
  [0.05, 1.199, 0.126, 0.176, 0.248, 0.394, 0.658, 0.938, 1.091, 1.066, 1.188, 0.104],
];

export function plateSample(): DataTableModel {
  return plateTable([SAMPLE_PLATE], 96);
}

export function emptyPlate(): DataTableModel {
  return plateTable([], 96);
}
