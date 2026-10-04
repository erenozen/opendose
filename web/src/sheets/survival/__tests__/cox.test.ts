// Cox regression payloads from survival and multiple-variables tables.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable, toggleExcluded } from "../../../project/table.ts";
import {
  coxModel, coxPayload, curveProfiles, defaultCoxOptions, guessTimeEvent, lowess,
  normalizeCoxOptions, survivalCoxData, survivalCovariateNames,
} from "../cox.ts";
import {
  addSurvivalCovariate, removeSurvivalCovariate, renameSurvivalCovariate,
} from "../covariates.ts";

const surv = () => normalizeTable({
  type: "survival",
  datasets: [
    { name: "Male", subTitles: ["Time", "Event", "Age"],
      rows: [["306", "1", "74"], ["455", "1", "68"], ["1010", "0", "56"], ["", "", ""]] },
    { name: "Female", subTitles: ["Time", "Event", "Age"],
      rows: [["310", "1", "68"], ["361", "0", "71"], ["654", "1", "x"], ["50", "2", "60"]] },
  ],
});

test("survival subjects: group and covariate columns, rows needing time and 0/1 event", () => {
  const t = surv();
  assert.deepEqual(survivalCovariateNames(t), ["Age"]);
  const d = survivalCoxData(t);
  // the blank row and the row with event code 2 are not subjects
  assert.deepEqual(d.time, [306, 455, 1010, 310, 361, 654]);
  assert.deepEqual(d.event, [1, 1, 0, 1, 0, 1]);
  assert.deepEqual(d.covariates.Group, ["Male", "Male", "Male", "Female", "Female", "Female"]);
  assert.deepEqual(d.covariates.Age, [74, 68, 56, 68, 71, "x"]);
  assert.equal(d.labels[3], "Female, row 1");
});

test("excluded cells count as missing", () => {
  const t = toggleExcluded(surv(), { kind: "y", dataset: 0, row: 1, sub: 2 });
  assert.equal(survivalCoxData(t).covariates.Age[1], null);
});

test("survival payload: group categorical with reference, curves per group", () => {
  const t = surv();
  const o = { ...defaultCoxOptions(t), reference: { Age: "56" } };
  assert.equal(o.curvesBy, "Group");
  const p = coxPayload(t, o);
  assert.ok("payload" in p);
  const { data, options } = p.payload as { data: Record<string, unknown>; options: Record<string, unknown> };
  assert.deepEqual(Object.keys(data.covariates as object), ["Group", "Age"]);
  // "x" in Age makes it text, so categorical
  assert.deepEqual(options.categorical, ["Group", "Age"]);
  // the first group is the reference unless another level is chosen
  assert.deepEqual(options.reference, { Group: "Male", Age: "56" });
  assert.equal(options.ties, "efron");
  assert.equal(options.ci_level, 0.95);
  assert.deepEqual(options.curves_at, [{ Group: "Male", label: "Male" }, { Group: "Female", label: "Female" }]);
});

test("dropping, strata and fixed values", () => {
  const t = surv();
  let o = { ...defaultCoxOptions(t), strata: "Group", curvesBy: "Age", curvesFixed: {} };
  const m = coxModel(t, o);
  assert.deepEqual(m.covariates, ["Age"]);
  assert.equal(m.strata, "Group");
  const p = coxPayload(t, o);
  assert.ok("payload" in p);
  assert.deepEqual((p.payload.data as { strata: string[] }).strata.slice(0, 2), ["Male", "Male"]);
  o = { ...o, strata: "", dropped: ["Group", "Age"] };
  assert.match((coxPayload(t, o) as { error: string }).error, /include at least one/);
});

test("continuous curves at quartiles, others fixed", () => {
  const t = normalizeTable({ type: "survival", datasets: [
    { name: "All", subTitles: ["Time", "Event", "Age", "Dose"],
      rows: [["1", "1", "40", "1"], ["2", "0", "50", "2"], ["3", "1", "60", "1"], ["4", "1", "70", "2"]] },
  ] });
  const o = { ...defaultCoxOptions(t), curvesBy: "Age", curvesFixed: { Dose: "2" } };
  const prof = curveProfiles(o, coxModel(t, o));
  assert.deepEqual(prof.map((x) => x.Age), [47.5, 55, 62.5]);
  assert.ok(prof.every((x) => x.Dose === 2));
  assert.equal(prof[1].label, "Age = 55 (median)");
});

test("one group and no covariates is explained", () => {
  const t = normalizeTable({ type: "survival", datasets: [
    { name: "All", rows: [["1", "1"], ["2", "0"]] }] });
  assert.match((coxPayload(t, defaultCoxOptions(t)) as { error: string }).error, /Add covariate/);
});

test("multiple-variables payload with guessed time / event / event code", () => {
  const t = normalizeTable({ type: "multivariable", datasets: [
    { name: "time", varType: "continuous", rows: [["306"], ["455"], ["1010"], ["210"]] },
    { name: "status", varType: "continuous", rows: [["2"], ["2"], ["1"], ["2"]] },
    { name: "age", varType: "continuous", rows: [["74"], ["68"], ["56"], ["57"]] },
    { name: "sex", varType: "categorical", rows: [["m"], ["f"], ["m"], ["f"]] },
  ] });
  assert.deepEqual(guessTimeEvent(t), { time: "time", event: "status", eventCode: "2" });
  const o = normalizeCoxOptions({ reference: { sex: "m" } }, t);
  const p = coxPayload(t, o);
  assert.ok("payload" in p);
  const opts = p.payload.options;
  assert.equal(opts.time, "time");
  assert.equal(opts.event_code, 2);
  assert.deepEqual(opts.covariates, ["age", "sex"]);
  assert.deepEqual(opts.categorical, ["sex"]);
  const vars = (p.payload.data as { variables: { name: string; kind: string; values: unknown[] }[] }).variables;
  assert.equal(vars[3].kind, "categorical");
  assert.equal(vars[3].values[0], "m");
});

test("normalize keeps well-typed fields only", () => {
  const o = normalizeCoxOptions({ ties: "bogus", ciMethod: "profile", dropped: ["a", 3] });
  assert.equal(o.ties, "efron");
  assert.equal(o.ciMethod, "profile");
  assert.deepEqual(o.dropped, ["a"]);
});

test("covariate columns are added, renamed and removed in every group", () => {
  let t = normalizeTable({ type: "survival", datasets: [
    { name: "A", rows: [["1", "1"]] }, { name: "B", rows: [["2", "0"]] }] });
  t = addSurvivalCovariate(t, "Age");
  assert.deepEqual(t.datasets.map((d) => d.rows[0].length), [3, 3]);
  assert.deepEqual(t.datasets[1].subTitles, ["Time", "Event", "Age"]);
  t = addSurvivalCovariate(t, "Dose");
  t = renameSurvivalCovariate(t, 0, "Years");
  assert.deepEqual(survivalCovariateNames(t), ["Years", "Dose"]);
  t = toggleExcluded(t, { kind: "y", dataset: 0, row: 0, sub: 3 });
  t = removeSurvivalCovariate(t, 0);
  assert.deepEqual(survivalCovariateNames(t), ["Dose"]);
  assert.deepEqual(t.datasets[0].excluded, ["0:2"]);
});

test("lowess of a straight line is the line", () => {
  const xs = [1, 2, 3, 4, 5, 6, 7, 8];
  const ys = xs.map((x) => 2 * x + 1);
  lowess(xs, ys).forEach((v, i) => assert.ok(Math.abs(v - ys[i]) < 1e-9));
});
