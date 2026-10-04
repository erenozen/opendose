// Example blots (synthetic, numpy seed 11): four blots, each with two
// control and two drug lanes (true effect 2.3-fold), integrated band
// intensities of the target and of β-actin with their local backgrounds,
// and blot-to-blot exposure differences of up to 2.7-fold, the situation
// the ratio paired t test is for. Natively the engine gives a geometric
// mean ratio of 2.427 (95% CI 1.990 to 2.960), P = 0.00076.
import type { DataTableModel } from "../../../project/types.ts";
import { laneTable } from "./model.ts";

const LANES: [string, string, string, string, number, number, number, number][] = [
  ["Blot 1", "1", "C1.1", "Control", 9654, 21899, 1221, 617],
  ["Blot 1", "2", "C1.2", "Control", 6692, 20745, 891, 1169],
  ["Blot 1", "3", "D1.3", "Drug", 20566, 23236, 1264, 765],
  ["Blot 1", "4", "D1.4", "Drug", 24480, 23442, 1159, 1090],
  ["Blot 2", "1", "C2.1", "Control", 10083, 24896, 1139, 812],
  ["Blot 2", "2", "C2.2", "Control", 13458, 27416, 1407, 677],
  ["Blot 2", "3", "D2.3", "Drug", 19275, 21524, 1427, 858],
  ["Blot 2", "4", "D2.4", "Drug", 21824, 22255, 1431, 730],
  ["Blot 3", "1", "C3.1", "Control", 10536, 29215, 1434, 1018],
  ["Blot 3", "2", "C3.2", "Control", 12319, 26169, 1498, 876],
  ["Blot 3", "3", "D3.3", "Drug", 24253, 24744, 1392, 953],
  ["Blot 3", "4", "D3.4", "Drug", 24880, 23811, 921, 615],
  ["Blot 4", "1", "C4.1", "Control", 11211, 24416, 937, 637],
  ["Blot 4", "2", "C4.2", "Control", 8972, 18245, 1364, 714],
  ["Blot 4", "3", "D4.3", "Drug", 16550, 21809, 1309, 896],
  ["Blot 4", "4", "D4.4", "Drug", 22595, 20155, 981, 1187],
];

export function densitometrySample(): DataTableModel {
  return laneTable(LANES.map(([blot, lane, sample, group, target, reference, background, refBackground]) => ({
    blot, lane, sample, group, target: String(target), reference: String(reference),
    background: String(background), refBackground: String(refBackground),
  })));
}

export function emptyDensitometry(): DataTableModel {
  return laneTable(Array.from({ length: 12 }, (_, i) => ({
    blot: `Blot ${Math.floor(i / 4) + 1}`, lane: String((i % 4) + 1),
  })));
}
