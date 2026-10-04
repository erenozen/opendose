// Quantal dose-response payloads. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../../project/table.ts";
import {
  defaultQuantalOptions, linkInverse, normCdf, parseLevels, quantalGroups, quantalPayload, wilson,
} from "../quantal.ts";
import { budwormTable } from "../quantalSample.ts";

test("budworm: one group per data set from responders / N subcolumns", () => {
  const g = quantalGroups(budwormTable(), defaultQuantalOptions());
  assert.deepEqual(g.map((x) => x.name), ["Male", "Female"]);
  assert.deepEqual(g[1].responders, [0, 2, 6, 10, 12, 16]);
  assert.deepEqual(g[0].n, [20, 20, 20, 20, 20, 20]);
  assert.deepEqual(g[0].dose, [0, 1, 2, 3, 4, 5]);
});

test("log transform refuses dose 0; none and parallel pass through", () => {
  const t = budwormTable();
  assert.match((quantalPayload(t, defaultQuantalOptions()) as { error: string }).error, /dose of 0/);
  const p = quantalPayload(t, { ...defaultQuantalOptions(), doseTransform: "none", link: "logit",
    parallel: true, ecLevels: "25, 50, 75" });
  assert.ok("payload" in p);
  assert.deepEqual(p.payload.options.ec_levels, [25, 50, 75]);
  assert.equal(p.payload.options.parallel, true);
  assert.equal(p.payload.options.reference, 0);
  assert.equal(p.payload.options.natural_response, null);
});

test("pairs layout and bad counts", () => {
  const t = normalizeTable({ type: "xy", x: ["1", "2", ""], datasets: [
    { name: "Dead", rows: [["2"], ["5"], ["1"]] }, { name: "N", rows: [["10"], ["10"], ["10"]] }] });
  const g = quantalGroups(t, { ...defaultQuantalOptions(), layout: "pairs" });
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].dose, [1, 2]);
  const bad = normalizeTable({ type: "xy", x: ["1"], datasets: [{ name: "A", rows: [["12", "10"]] }] });
  assert.match((quantalPayload(bad, defaultQuantalOptions()) as { error: string }).error, /between 0 and N/);
});

test("helpers", () => {
  assert.deepEqual(parseLevels("90, 50;50 x 120"), [90, 50]);
  assert.ok(Math.abs(normCdf(1.959964) - 0.975) < 1e-6);
  assert.ok(Math.abs(linkInverse("logit", 0) - 0.5) < 1e-12);
  assert.ok(Math.abs(linkInverse("cloglog", Math.log(Math.log(2))) - 0.5) < 1e-12);
  const [lo, hi] = wilson(5, 20);
  assert.ok(Math.abs(lo - 0.1119) < 1e-3 && Math.abs(hi - 0.4687) < 1e-3);
});
