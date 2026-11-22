// Example dual-luciferase plate (synthetic, numpy seed 21): three
// independent transfections, each with three mock-transfected wells
// (background) and three wells each of an empty-vector control, a
// promoter construct (true effect 4-fold) and the promoter with TNF-α
// (11-fold), with transfection efficiency varying from one experiment to
// the next, the situation normalising to Renilla and to each
// experiment's own control is for. Natively the engine gives, with the
// experiment as the unit: Promoter 4.401-fold (Dunnett 95% CI 3.951 to
// 4.902) and Promoter + TNF-α 11.20-fold (10.06 to 12.48) vs the empty
// vector, repeated-measures ANOVA on log10 ratios F(2, 4) = 2796.
import type { DataTableModel } from "../../../project/types.ts";
import { wellTable } from "./model.ts";

const WELLS: [string, string, string, number, number][] = [
  ["Exp 1", "A1", "Mock", 173, 72], ["Exp 1", "A2", "Mock", 175, 90], ["Exp 1", "A3", "Mock", 138, 82],
  ["Exp 1", "A4", "Empty vector", 7571, 95376], ["Exp 1", "A5", "Empty vector", 13670, 157646],
  ["Exp 1", "A6", "Empty vector", 10407, 157212],
  ["Exp 1", "A7", "Promoter", 41028, 106103], ["Exp 1", "A8", "Promoter", 66722, 160179],
  ["Exp 1", "A9", "Promoter", 29377, 103372],
  ["Exp 1", "A10", "Promoter + TNF-α", 114478, 120572], ["Exp 1", "A11", "Promoter + TNF-α", 124055, 155448],
  ["Exp 1", "A12", "Promoter + TNF-α", 71823, 82986],
  ["Exp 2", "B1", "Mock", 152, 106], ["Exp 2", "B2", "Mock", 138, 95], ["Exp 2", "B3", "Mock", 157, 81],
  ["Exp 2", "B4", "Empty vector", 11572, 126509], ["Exp 2", "B5", "Empty vector", 8914, 111792],
  ["Exp 2", "B6", "Empty vector", 6181, 81836],
  ["Exp 2", "B7", "Promoter", 35670, 119450], ["Exp 2", "B8", "Promoter", 23762, 65644],
  ["Exp 2", "B9", "Promoter", 50948, 143444],
  ["Exp 2", "B10", "Promoter + TNF-α", 97148, 114198], ["Exp 2", "B11", "Promoter + TNF-α", 117085, 134585],
  ["Exp 2", "B12", "Promoter + TNF-α", 102109, 118728],
  ["Exp 3", "C1", "Mock", 170, 104], ["Exp 3", "C2", "Mock", 132, 102], ["Exp 3", "C3", "Mock", 124, 83],
  ["Exp 3", "C4", "Empty vector", 6356, 76636], ["Exp 3", "C5", "Empty vector", 6336, 84418],
  ["Exp 3", "C6", "Empty vector", 12125, 162767],
  ["Exp 3", "C7", "Promoter", 48938, 140839], ["Exp 3", "C8", "Promoter", 29430, 92252],
  ["Exp 3", "C9", "Promoter", 43984, 137394],
  ["Exp 3", "C10", "Promoter + TNF-α", 109407, 132103], ["Exp 3", "C11", "Promoter + TNF-α", 88258, 92718],
  ["Exp 3", "C12", "Promoter + TNF-α", 86918, 100330],
];

export function luciferaseSample(): DataTableModel {
  return wellTable(WELLS.map(([experiment, well, group, firefly, renilla]) => ({
    experiment, well, group, firefly: String(firefly), renilla: String(renilla),
  })));
}

export function emptyLuciferase(): DataTableModel {
  return wellTable(Array.from({ length: 12 }, (_, i) => ({
    experiment: "Exp 1", well: `A${i + 1}`,
  })));
}
