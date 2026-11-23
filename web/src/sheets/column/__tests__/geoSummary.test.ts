// Geometric mean ×/÷ geometric SD and the back-transformed CI of the
// column graphs (graphSettings.ts summaryOf), against numpy / scipy
// (reference/geo_summary.py). Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeTable } from "../../../project/table.ts";
import { composeLegend } from "../../../graph/legend.ts";
import {
  COLUMN_SUMMARY_LABELS, geoRefused, normalizeColumnGraph, summaryOf,
} from "../graphSettings.ts";

const here = dirname(fileURLToPath(import.meta.url));
const ref = JSON.parse(readFileSync(join(here, "reference", "geo_summary.json"), "utf8"));

const close = (a: number, b: number, rel = 1e-12) =>
  Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b));

test("×/÷ geometric SD: bar ends g × s* and g / s* (numpy, scipy gmean / gstd)", () => {
  for (const key of ["fold", "fold_x10", "one", "equal", "tiny", "huge", "lognormal"]) {
    const r = ref[key];
    const st = summaryOf(r.values, "geo_sd")!;
    assert.ok(close(st.center, r.gmean), `${key} centre ${st.center} vs ${r.gmean}`);
    assert.ok(close(st.center + st.hi, r.upper), `${key} upper ${st.center + st.hi} vs ${r.upper}`);
    assert.ok(close(st.center - st.lo, r.lower, 1e-11), `${key} lower ${st.center - st.lo} vs ${r.lower}`);
  }
});

test("the acceptance values: fold changes 0.5, 1, 2, 4", () => {
  const st = summaryOf([0.5, 1, 2, 4], "geo_sd")!;
  assert.equal(st.center.toFixed(5), "1.41421");
  assert.equal((st.center + st.hi).toFixed(4), "3.4605");
  assert.equal((st.center - st.lo).toFixed(5), "0.57795");
  assert.equal(st.label, "geometric mean 1.414 ×/÷ geometric SD 2.447");
});

test("back-transformed 95% CI of the logs (scipy t)", () => {
  for (const key of ["fold", "fold_x10", "tiny", "huge", "lognormal", "one"]) {
    const r = ref[key];
    const st = summaryOf(r.values, "geo_ci")!;
    assert.ok(close(st.center - st.lo, r.ci[0], 1e-9), `${key} ${st.center - st.lo} vs ${r.ci[0]}`);
    assert.ok(close(st.center + st.hi, r.ci[1], 1e-9), `${key} ${st.center + st.hi} vs ${r.ci[1]}`);
  }
});

test("scaling the values scales the geometric mean; s* is unit-free", () => {
  const a = summaryOf([0.5, 1, 2, 4], "geo_sd")!;
  const b = summaryOf([5, 10, 20, 40], "geo_sd")!;
  assert.ok(close(b.center, 10 * a.center));
  assert.ok(close((b.center + b.hi) / b.center, (a.center + a.hi) / a.center));
  // order does not matter
  const c = summaryOf([4, 0.5, 2, 1], "geo_sd")!;
  assert.ok(close(c.center, a.center) && close(c.hi, a.hi));
});

test("zero or negative values: no geometric summary, the groups are named", () => {
  assert.equal(summaryOf([0, 1, 2], "geo_sd"), null);
  assert.equal(summaryOf([-1, 1, 2], "geo_ci"), null);
  assert.equal(summaryOf([], "geo_sd"), null);
  // the arithmetic summaries are unchanged by the rule
  assert.equal(summaryOf([0, 1, 2], "mean_sd")!.center, 1);
  const t = normalizeTable({ type: "column", datasets: [
    { name: "Control", rows: [["1"], ["0"]] }, { name: "Drug", rows: [["2"], ["3"]] },
    { name: "", rows: [["-1"], [""]] }] });
  assert.deepEqual(geoRefused(t, "geo_sd"), ["Control", "Data set 3"]);
  assert.deepEqual(geoRefused(t, "mean_sd"), []);
});

test("settings and legend words", () => {
  assert.equal(normalizeColumnGraph({ summary: "geo_sd" }).summary, "geo_sd");
  assert.equal(normalizeColumnGraph({ summary: "geo_ci" }).summary, "geo_ci");
  assert.equal(COLUMN_SUMMARY_LABELS.geo_sd, "Geometric mean ×/÷ geometric SD");
  assert.equal(composeLegend({ display: "bar", summary: "geo_sd", points: true,
    groups: [{ name: "A", n: 4 }, { name: "B", n: 4 }] }),
  "Geometric mean ×/÷ geometric SD (bars), with individual values. n = 4 per group.");
  assert.equal(composeLegend({ display: "scatter", summary: "geo_ci", points: true,
    groups: [{ name: "A", n: 4 }], refused: ["B"] }),
  "Geometric mean with 95% CI (from the logarithms), with individual values. No geometric mean "
    + "for B: a value of 0 or less has no logarithm. n = 4 per group.");
});
