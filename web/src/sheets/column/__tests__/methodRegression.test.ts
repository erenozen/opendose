// P-42: Passing-Bablok method comparison: the payload the engine gets
// from an XY or a column table, the options, the fitted line and the
// reading of the CIs, and the results headline.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../../project/table.ts";
import {
  agreesWithIdentity, ciFraction, identityReading, lineOver, methodRegPayload,
  normalizeMethodRegOptions, type PbFit,
} from "../methodRegression.ts";
import { keyFacts } from "../../../components/answer/keyFacts.ts";
import { formatSig } from "../../../types.ts";

const o = { datasetA: 0, datasetB: 1, ciLevel: "95" };

test("an XY table: X is method 1, every data set is compared with it", () => {
  const t = normalizeTable({ type: "xy", xTitle: "Method A", x: ["1", "5", "10"],
    datasets: [{ name: "Method B", rows: [["8"], ["16"], ["30"]] }] });
  const p = methodRegPayload(t, o) as { analysis: string; data: Record<string, unknown>; options: unknown };
  assert.equal(p.analysis, "method_regression");
  assert.deepEqual(p.data.x, [1, 5, 10]);
  assert.equal(p.data.x_name, "Method A");
  assert.deepEqual(p.options, { ci_level: 0.95 });
});

test("a column table: the two chosen columns, paired by row, blanks kept", () => {
  const t = normalizeTable({ type: "column", datasets: [
    { name: "Ref", rows: [["1"], [""], ["3"]] }, { name: "Other", rows: [["9"], ["9"], ["9"]] },
    { name: "New", rows: [["1.1"], ["2"], [""]] }] });
  const p = methodRegPayload(t, { ...o, datasetB: 2, ciLevel: "90" }) as unknown as
    { data: { a: unknown[]; b: unknown[]; names: string[] }; options: { ci_level: number } };
  assert.deepEqual(p.data.a, [1, null, 3]);
  assert.deepEqual(p.data.b, [1.1, 2, null]);
  assert.deepEqual(p.data.names, ["Ref", "New"]);
  assert.equal(p.options.ci_level, 0.9);
});

test("a column table needs two different columns", () => {
  const one = normalizeTable({ type: "column", datasets: [{ name: "A", rows: [["1"]] }] });
  assert.match((methodRegPayload(one, o) as { error: string }).error, /two columns/);
  const two = normalizeTable({ type: "column", datasets: [{ name: "A", rows: [["1"]] }, { name: "B", rows: [["1"]] }] });
  assert.match((methodRegPayload(two, { ...o, datasetB: 0 }) as { error: string }).error, /two different columns/);
});

test("options: saved junk falls back to the defaults; the CI level reads 95 or 0.95", () => {
  assert.deepEqual(normalizeMethodRegOptions({ datasetA: "x", ciLevel: 3 }), o);
  assert.equal(ciFraction("95"), 0.95);
  assert.equal(ciFraction("0.9"), 0.9);
  assert.equal(ciFraction(""), 0.95);
});

const pb = (slopeCi: [number, number] | null, interceptCi: [number, number] | null): PbFit => ({
  n: 30, slope: { value: 1.055, ci: slopeCi }, intercept: { value: 7.08, ci: interceptCi },
  kendall: { tau: 0.96, p: 1e-13 },
  cusum: { n_above: 15, n_below: 15, max_cusum: 5, H: 1.25, p: 0.0879, linear: true },
});

test("the line runs over the range of method 1", () => {
  assert.deepEqual(lineOver(pb(null, null), 0, 10), { x: [0, 10], y: [7.08, 17.63] });
  assert.equal(lineOver({ error: "no", slope: { value: 1, ci: null }, intercept: { value: 0, ci: null } }, 0, 1), null);
});

test("the CIs read against the line of identity (Passing & Bablok 1983)", () => {
  // Giavarina (2015): slope CI 1.020 to 1.091 excludes 1, intercept CI -0.30 to 19.8 includes 0
  const g = pb([1.0205, 1.0915], [-0.3049, 19.84]);
  assert.deepEqual(agreesWithIdentity(g), { slope: false, intercept: true });
  assert.equal(identityReading(g), "The methods differ: the slope's CI excludes 1 (a proportional difference).");
  assert.match(identityReading(pb([0.9, 1.1], [-1, 1]))!, /no evidence of a proportional or a constant difference/);
  assert.equal(identityReading(pb(null, null)), null);
});

test("the headline is the Passing-Bablok slope with its CI, as the table prints it", () => {
  const k = keyFacts({ analysis: "method_regression", ci_level: 0.95, comparisons: [
    { name: "Method B", x_name: "Method A", n: 30, passing_bablok: pb([1.0205, 1.0915], [-0.3049, 19.84]) },
    { name: "C", x_name: "Method A", n: 3, passing_bablok: { error: "Kendall's tau is -1" } },
  ] });
  assert.equal(k?.kind, "figures");
  if (k?.kind !== "figures") return;
  assert.equal(k.items[0].title, "Method B vs Method A");
  assert.equal(k.items[0].figure?.name, "Passing-Bablok slope");
  assert.equal(k.items[0].figure?.value, formatSig(1.055));
  assert.equal(k.items[0].figure?.ci, `95% CI ${formatSig(1.0205)} to ${formatSig(1.0915)}`);
  assert.deepEqual(k.items[0].figure?.facts,
    [`Intercept ${formatSig(7.08)} (95% CI ${formatSig(-0.3049)} to ${formatSig(19.84)})`, "30 pairs"]);
  assert.equal(k.items[1].error, "Kendall's tau is -1");
});
