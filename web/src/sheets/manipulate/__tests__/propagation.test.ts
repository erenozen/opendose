// P-98 uncertainty carried through Remove baseline and Normalize: the
// typed baseline's SD and n, the propagated rows as the results show
// them and the banner that keeps them out of tests (the engine payload is
// driven end to end in e2e-results). Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { propagationBanner, propagationRows, sharedErrorNote, typedBaselineError } from "../propagation.ts";

// engine/tests/reference/propagation.json (Python uncertainties)
const REF = JSON.parse(readFileSync(new URL("../../../../../engine/tests/reference/propagation.json",
  import.meta.url), "utf8"));
const T = { type: "grouped" as const, rowTitles: ["Sample A", "Sample B", ""], x: ["", "", ""] };

test("typed baseline: SD and n both blank is exact, else both must make sense", () => {
  assert.equal(typedBaselineError("", " "), null);
  assert.deepEqual(typedBaselineError("0.0035", "3"), { value_sd: 0.0035, value_n: 3 });
  assert.throws(() => typedBaselineError("-1", "3"), /SD as 0 or more/);
  assert.throws(() => typedBaselineError("0.0035", ""), /whole number of 1 or more/);
  assert.throws(() => typedBaselineError("0.0035", "2.5"), /whole number/);
});

test("rows: one per derived row with its n, value, SD, SEM and the baseline's share", () => {
  const rows = REF.subtract_value.map((r: Record<string, number>) => ({ n: 3, ...r }));
  const p = propagationRows({ datasets: [{ rows, notes: [] }] }, ["OD"], T)!;
  assert.equal(p.rows.length, 3);
  assert.deepEqual(p.rows[0], { dataset: "OD", row: "“Sample A”", n: "3", value: "0.3537", sd: "0.007286",
    se: "0.004518", fromRef: "0.002021" });
  assert.equal(p.rows[2].row, "row 3");
  const none = propagationRows({ datasets: [{ rows: null, notes: ["Each replicate has its own baseline."] },
    { rows: [null, { n: 1, value: 0.35, sd: null, se: null, from_baseline: 0.002 }], notes: ["one value"] }] },
  ["A", "B"], T)!;
  assert.deepEqual(none.notes, ["A: Each replicate has its own baseline.", "B: one value"]);
  assert.deepEqual(none.rows.map((r) => [r.row, r.sd, r.se, r.fromRef]), [["“Sample B”", "n/a", "n/a", "0.002"]]);
  assert.equal(propagationRows(null, [], T), null);
});

test("banner: only when propagating, pointing to the raw values with the control as a block", () => {
  const result = { extra: { propagation: { rows: [], notes: [] } } };
  const b = propagationBanner("remove_baseline", { propagate: true }, result)!;
  assert.equal(b.title, "Propagated SDs are not replicates");
  assert.match(b.body, /uncertainty of the baseline/);
  assert.match(b.fixes[0], /analyse the raw values with the control \(blank\) as a block/);
  assert.ok(b.sources.some((s) => s.url === "https://doi.org/10.1111/bph.14153"));
  assert.match(propagationBanner("normalize", { propagate: true }, result)!.body, /the references/);
  assert.equal(propagationBanner("remove_baseline", { propagate: false }, result), null);
  assert.equal(propagationBanner("remove_baseline", { propagate: true }, { error: "x" }), null);
});

test("derived table note: only when the values share an estimated baseline or reference", () => {
  const rows = { baseline: "first_row", replicates: "mean" };
  assert.match(sharedErrorNote("remove_baseline", rows) ?? "", /^Every value shares the error of the baseline/);
  assert.match(sharedErrorNote("remove_baseline", rows) ?? "", /control \(blank\) as a block/);
  assert.equal(sharedErrorNote("remove_baseline", { ...rows, replicates: "each" }), null);
  assert.equal(sharedErrorNote("remove_baseline", { baseline: "value", value: "0.05" }), null);
  assert.ok(sharedErrorNote("remove_baseline", { baseline: "value", valueSd: "0.003", valueN: "3" }));
  assert.ok(sharedErrorNote("normalize", { zeroMode: "first", hundredMode: "value" }));
  assert.equal(sharedErrorNote("normalize", { zeroMode: "value", hundredMode: "value" }), null);
  assert.equal(sharedErrorNote("transform", {}), null);
});
