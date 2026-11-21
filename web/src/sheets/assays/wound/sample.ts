// Example scratch assay (synthetic, numpy seed 17): wound area (µm²) of
// four wells per condition imaged every 6 h for 24 h, a control, a
// knock-down that slows migration and TGF-β that speeds it up. Natively
// the engine gives closure rates of 2.375, 1.268 and 3.448 % per hour
// (one-way ANOVA F(2, 9) = 89.64; Dunnett: siRNA − Control −1.107 %/h,
// 95% CI −1.533 to −0.681), 50% closure at 21.31 h (Control) and
// 14.65 h (TGF-β), siRNA not reaching 50% by 24 h.
import { normalizeTable } from "../../../project/table.ts";
import type { DataTableModel } from "../../../project/types.ts";

const TIMES = [0, 6, 12, 18, 24];
const DATA: [string, number[][]][] = [
  ["Control", [[555212, 445756, 509239, 478893], [486823, 376206, 443435, 409073],
    [427960, 295605, 361637, 346841], [336790, 236501, 286945, 276174], [266840, 154891, 231203, 216271]]],
  ["siRNA", [[550388, 484187, 452506, 477332], [509390, 450560, 418105, 431038],
    [475188, 416073, 385735, 383761], [434108, 391804, 348138, 338512], [394299, 352768, 319965, 300303]]],
  ["TGF-β", [[508134, 534575, 498313, 554640], [404025, 434494, 398322, 432548],
    [303173, 339176, 289495, 306232], [205724, 222543, 182187, 198147], [123190, 100289, 91070, 39164]]],
];

export function woundSample(): DataTableModel {
  return normalizeTable({
    type: "xy",
    xTitle: "Time (h)",
    xUnit: "",
    yTitle: "Wound area (µm²)",
    x: TIMES.map(String),
    datasets: DATA.map(([name, rows]) => ({ name, rows: rows.map((r) => r.map(String)) })),
  });
}
