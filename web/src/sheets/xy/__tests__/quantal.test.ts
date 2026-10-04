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

test("log transform: dose 0 rows become the control (natural response estimated)", () => {
  const t = budwormTable();
  const d = defaultQuantalOptions();
  const p0 = quantalPayload(t, d);
  assert.ok("payload" in p0);
  assert.equal(p0.payload.options.natural_response, "estimate");
  assert.match(p0.notes.join(" "), /Dose 0 rows are used as the control: natural response estimated/);
  assert.deepEqual((p0.payload.data as { groups: { dose: number[] }[] }).groups[0].dose, [0, 1, 2, 3, 4, 5]);
  assert.equal("upper_asymptote" in p0.payload.options, false);
  assert.equal("information" in p0.payload.options, false);
  // left out on request (drc's LL.2: natural response 0)
  const om = quantalPayload(t, { ...d, zeroDose: "omit" });
  assert.ok("payload" in om);
  assert.equal(om.payload.options.natural_response, null);
  assert.deepEqual((om.payload.data as { groups: { dose: number[] }[] }).groups[0].dose, [1, 2, 3, 4, 5]);
  // an upper asymptote: the controls sit on the plateau, no natural response added
  const up = quantalPayload(t, { ...d, upper: "estimate", information: "observed" });
  assert.ok("payload" in up);
  assert.equal(up.payload.options.natural_response, null);
  assert.equal(up.payload.options.upper_asymptote, "estimate");
  assert.equal(up.payload.options.information, "observed");
  assert.match(up.notes.join(" "), /plateau/);
  const fixedU = quantalPayload(t, { ...d, upper: "fixed", upperValue: "60" });
  assert.ok("payload" in fixedU);
  assert.equal(fixedU.payload.options.upper_asymptote, 0.6);
  // parallel lines cannot use the controls: left out, with a note
  const par = quantalPayload(t, { ...d, parallel: true });
  assert.ok("payload" in par);
  assert.match(par.notes.join(" "), /parallel-line fit/);
  assert.deepEqual((par.payload.data as { groups: { dose: number[] }[] }).groups[1].dose, [1, 2, 3, 4, 5]);
  // negative doses are still refused
  const neg = normalizeTable({ type: "xy", x: ["-1", "1", "2"], datasets: [{ name: "A",
    rows: [["1", "10"], ["3", "10"], ["6", "10"]] }] });
  assert.match((quantalPayload(neg, d) as { error: string }).error, /negative dose/);
});

test("no dose transform and parallel pass through", () => {
  const t = budwormTable();
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
