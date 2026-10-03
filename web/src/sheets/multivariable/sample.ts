import { normalizeTable } from "../../project/table.ts";
import type { DataTableModel, VarType } from "../../project/types.ts";

// Synthetic study, 30 subjects (numpy seed 20261003): five dose groups,
// body weight, sex, a continuous response that rises with dose, weight
// and male sex (plus noise), and a 0/1 responder drawn from a logistic
// dose-response. The e2e test and the unit tests check results computed
// natively by the engine on exactly these values.
const COLUMNS: { name: string; varType: VarType; values: string }[] = [
  { name: "Dose", varType: "continuous",
    values: "0 1 2 5 10 0 1 2 5 10 0 1 2 5 10 0 1 2 5 10 0 1 2 5 10 0 1 2 5 10" },
  { name: "Weight", varType: "continuous",
    values: "249 236 230 253 221 240 272 245 270 267 271 222 290 202 218 "
      + "225 266 274 233 223 229 219 267 194 201 190 226 237 262 273" },
  { name: "Sex", varType: "categorical",
    values: "F F M F M M M F F M M F F F M M M F F M M F F M F F F M M M" },
  { name: "Response", varType: "continuous",
    values: "31.3 33.4 41.8 43.5 63.3 37.3 44.6 45.4 49.9 66.8 43.9 35.0 42.9 "
      + "35.9 62.2 34.7 44.1 37.3 52.7 62.6 34.5 36.4 44.7 47.3 62.4 31.6 "
      + "37.4 42.7 49.6 65.4" },
  { name: "Responder", varType: "continuous",
    values: "0 1 0 0 1 0 0 0 0 0 0 0 0 0 1 0 0 1 1 1 0 1 1 0 1 0 1 0 1 1" },
];

export const SAMPLE_ROWS = 30;

export function multivariableSample(): DataTableModel {
  return normalizeTable({
    type: "multivariable",
    x: Array<string>(SAMPLE_ROWS).fill(""),
    rowTitles: Array.from({ length: SAMPLE_ROWS },
      (_, i) => `S${String(i + 1).padStart(2, "0")}`),
    datasets: COLUMNS.map((c) => ({
      name: c.name,
      varType: c.varType,
      rows: c.values.split(" ").map((v) => [v]),
    })),
  });
}
