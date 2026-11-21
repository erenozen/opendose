// Synergy for three or more drugs: reading a long table with extra
// concentration variables, the payload, and two-drug slices of a
// higher-order result. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../../project/table.ts";
import {
  defaultFixed, drugNames, guessExtraDrugs, isMultiDrug, normalizeSynergy, sliceResult, synergyData,
  synergyPayload,
} from "../synergyModel.ts";

const col = (name: string, values: string[]) =>
  ({ name, varType: "continuous", rows: values.map((v) => [v]) });
// 2 x 2 x 2 design, one well per cell
const grid = [0, 1].flatMap((a) => [0, 2].flatMap((b) => [0, 5].map((c) => [a, b, c])));
const long = normalizeTable({ type: "multivariable", datasets: [
  col("conc1", grid.map((g) => String(g[0]))),
  col("conc2", grid.map((g) => String(g[1]))),
  col("conc3", grid.map((g) => String(g[2]))),
  col("response", grid.map((_, k) => String(10 * k))),
] });

test("conc3 is guessed as drug 3 and sent as a third concentration", () => {
  assert.deepEqual(guessExtraDrugs(long), [{ name: "Drug 3", conc: "conc3" }]);
  const o = normalizeSynergy({ drug1: "A", drug2: "B", extraDrugs: [{ name: "C", conc: "conc3" }] }, long);
  assert.equal(isMultiDrug(o, long), true);
  assert.deepEqual(drugNames(o), ["A", "B", "C"]);
  const d = synergyData(long, o);
  assert.ok(!("error" in d));
  const recs = (d as { data: Record<string, unknown> }).data.records as Record<string, unknown>[];
  assert.equal(recs.length, 8);
  assert.deepEqual(recs[5], { conc1: 1, conc2: 0, conc3: 5, response: 50 });
  const p = synergyPayload(long, { ...o, outliers: "replace", musyc: true }) as { options: Record<string, unknown> };
  assert.deepEqual(p.options.drugs, ["A", "B", "C"]);
  // two-drug-only options are never sent for three drugs
  assert.equal("outliers" in p.options, false);
  assert.equal("musyc" in p.options, false);
});

test("a variable in two roles or an unchosen drug is an error, never a silent read", () => {
  const o = normalizeSynergy({}, long);
  const twice = synergyData(long, { ...o, extraDrugs: [{ name: "C", conc: "conc2" }] });
  assert.ok("error" in twice && /two roles/.test(twice.error));
  const unset = synergyData(long, { ...o, extraDrugs: [{ name: "C", conc: "" }] });
  assert.ok("error" in unset && /drug 3/.test(unset.error));
});

test("a grouped table stays a two-drug analysis", () => {
  const grouped = normalizeTable({ type: "grouped", rowTitles: ["0", "1"],
    datasets: [{ name: "0", rows: [["1"], ["2"]] }, { name: "1", rows: [["3"], ["4"]] }] });
  const o = normalizeSynergy({ extraDrugs: [{ name: "C", conc: "conc3" }] }, grouped);
  assert.deepEqual(o.extraDrugs, []);
  assert.equal(isMultiDrug(o, grouped), false);
});

test("a slice reads every cell at the fixed doses of the other drugs", () => {
  const concs = [[0, 1], [0, 2], [0, 5]];
  const cells = grid.map((g, k) => {
    const n = g.filter((v) => v > 0).length;
    const c: Record<string, unknown> = { concs: g, n_drugs: n, response: 10 * k };
    if (n >= 2) {
      for (const m of ["hsa", "bliss", "loewe", "zip", "consensus"]) c[m] = { expected: 100 + k, synergy: k };
      (c.zip as Record<string, number>).fitted = 200 + k;
    }
    return c;
  });
  const result = { analysis: "synergy_multi", drugs: ["A", "B", "C"], concs, cells,
    models: { bliss: { score: 3.5 } } };
  assert.deepEqual(defaultFixed(result), [1, 1, 1]);
  // rows A, columns C, B fixed at its highest dose (index 1 = 2)
  const s = sliceResult(result, 0, 2, [0, 1, 0])!;
  assert.equal(s.drug1, "A");
  assert.equal(s.drug2, "C");
  // cells (a, b=2, c): grid index = a*4 + 1*2 + c
  assert.deepEqual(s.response, [[20, 30], [60, 70]]);
  // (0, 2, 0): one drug present -> synergy 0, no expectation
  assert.deepEqual(s.models.bliss.synergy, [[0, 3], [6, 7]]);
  assert.deepEqual(s.models.bliss.reference, [[null, 103], [106, 107]]);
  assert.deepEqual(s.models.zip.fitted, [[null, 203], [206, 207]]);
  assert.equal(s.models.bliss.score, 3.5);
  assert.equal(sliceResult(result, 1, 1, [0, 0, 0]), null);
});
