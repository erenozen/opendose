// Example broth-microdilution plate (synthetic, numpy seed 29): six
// isolates, three dilution series each, two-fold from 0.125 to 64 µg/mL
// plus a growth control (0), endpoint OD600 with a medium blank of
// 0.045. Isolate 3's second series has one skipped well (clear at
// 1 µg/mL, growth at 2). Natively the engine gives, at a 90% inhibition
// cut-off: MICs 2, 4, 8, 16, 4 and 64 µg/mL (Isolate 3 read at the higher
// MIC, flagged), MIC50 4 and MIC90 64 µg/mL (with the 10-isolate warning),
// and IC50s from 0.6716 (Isolate 1) to 22.56 µg/mL (Isolate 6).
import { normalizeTable } from "../../../project/table.ts";
import type { DataTableModel } from "../../../project/types.ts";

const CONC = [0, 0.125, 0.25, 0.5, 1, 2, 4, 8, 16, 32, 64];
// per isolate: three dilution series, OD in CONC order
const PLATE: [string, number[][]][] = [
  ["Isolate 1", [[0.804, 0.797, 0.755, 0.529, 0.185, 0.065, 0.052, 0.04, 0.042, 0.038, 0.032],
    [0.961, 0.953, 0.902, 0.638, 0.217, 0.075, 0.056, 0.069, 0.047, 0.046, 0.03],
    [0.939, 0.917, 0.893, 0.767, 0.349, 0.1, 0.05, 0.06, 0.037, 0.048, 0.051]]],
  ["Isolate 2", [[0.948, 0.935, 0.955, 0.904, 0.626, 0.215, 0.059, 0.047, 0.051, 0.041, 0.046],
    [0.882, 0.9, 0.897, 0.86, 0.675, 0.274, 0.088, 0.04, 0.054, 0.038, 0.047],
    [0.838, 0.827, 0.818, 0.795, 0.615, 0.229, 0.062, 0.045, 0.061, 0.043, 0.05]]],
  ["Isolate 3", [[0.928, 0.924, 0.919, 0.911, 0.799, 0.471, 0.125, 0.06, 0.045, 0.042, 0.05],
    [0.909, 0.9, 0.883, 0.888, 0.048, 0.591, 0.19, 0.072, 0.048, 0.036, 0.051],
    [0.967, 0.991, 0.99, 0.981, 0.948, 0.75, 0.302, 0.08, 0.052, 0.044, 0.039]]],
  ["Isolate 4", [[0.788, 0.798, 0.788, 0.809, 0.794, 0.766, 0.534, 0.21, 0.072, 0.039, 0.062],
    [0.904, 0.909, 0.912, 0.923, 0.89, 0.827, 0.57, 0.174, 0.055, 0.047, 0.056],
    [0.979, 0.978, 0.99, 0.98, 0.963, 0.941, 0.648, 0.208, 0.076, 0.049, 0.05]]],
  ["Isolate 5", [[0.848, 0.853, 0.82, 0.78, 0.505, 0.178, 0.056, 0.057, 0.053, 0.04, 0.05],
    [0.963, 0.955, 0.955, 0.906, 0.68, 0.251, 0.072, 0.043, 0.059, 0.031, 0.048],
    [0.961, 0.94, 0.935, 0.813, 0.434, 0.12, 0.058, 0.059, 0.035, 0.052, 0.04]]],
  ["Isolate 6", [[0.88, 0.881, 0.864, 0.884, 0.889, 0.877, 0.882, 0.857, 0.708, 0.298, 0.085],
    [0.845, 0.832, 0.834, 0.828, 0.832, 0.845, 0.83, 0.812, 0.665, 0.291, 0.088],
    [0.889, 0.894, 0.9, 0.895, 0.883, 0.916, 0.89, 0.834, 0.578, 0.192, 0.067]]],
];

export const MIC_SAMPLE_BLANK = "0.045";

export function micSample(): DataTableModel {
  return normalizeTable({
    type: "xy",
    xTitle: "Concentration (µg/mL)",
    xUnit: "",
    yTitle: "OD600",
    x: CONC.map(String),
    datasets: PLATE.map(([name, series]) => ({
      name, rows: CONC.map((_, i) => series.map((s) => String(s[i]))),
    })),
  });
}
