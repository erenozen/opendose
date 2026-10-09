// Unit tests for the time-course module's pure parts: the example, the
// records and subject names, the engine payloads, the window summaries and
// the graph series. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../../../project/table.ts";
import {
  dfNote, meanSeries, mixedPayload, normalizeTcMixed, normalizeTcWindow, numericTimes, prepare,
  subjectSummaries, tcColumnTable, tcMethodsText, timecoursePlotted, windowPayload, windowRecords,
} from "../model.ts";
import { timecourseSample } from "../sample.ts";

test("example: glucose tolerance test, 2 diets x 6 mice x 6 times", () => {
  const t = timecourseSample();
  assert.equal(t.type, "xy");
  assert.deepEqual(t.x, ["0", "15", "30", "60", "90", "120"]);
  assert.deepEqual(t.datasets.map((d) => d.rows[0].length), [6, 6]);
  assert.deepEqual(t.datasets[0].subTitles, ["C1", "C2", "C3", "C4", "C5", "C6"]);
  // the first four mice are the AUC assay's example
  assert.deepEqual(t.datasets[1].rows[2], ["345", "362", "330", "375", "350", "340"]);
  const p = prepare(t, normalizeTcMixed({}, t));
  assert.equal(p.nSubjects, 12);
  assert.equal(p.records.length, 72);
  assert.deepEqual(p.groups, ["Chow", "High-fat diet"]);
});

test("subject names: labels, or group + label when they repeat across groups", () => {
  const t = normalizeTable({ type: "grouped", rowTitles: ["Day 0", "Day 7"], x: ["", ""],
    datasets: [{ name: "A", subTitles: ["M1", "M2"], rows: [["1", "2"], ["3", "4"]] },
      { name: "B", subTitles: ["M1", "M9"], rows: [["5", "6"], ["7", ""]] }] }, "grouped");
  const p = prepare(t, normalizeTcMixed({}, t));
  assert.deepEqual([...p.names.values()], ["A M1", "M2", "B M1", "M9"]);
  const pl = mixedPayload(p, normalizeTcMixed({ covariance: "ar1", comparisons: "none" }, t)) as any;
  assert.equal(pl.analysis, "mixed_timecourse");
  assert.equal(pl.data.records.length, 7);
  assert.deepEqual(pl.data.records[0], { subject: "A M1", group: "A", time: 0, value: 1 });
  assert.equal(pl.options.covariance, "ar1");
  assert.equal(pl.options.comparisons, null);
  assert.equal(pl.options.compare_covariances, false);
});

test("options: unknown values fall back to the defaults", () => {
  const t = timecourseSample();
  const o = normalizeTcMixed({ covariance: "toeplitz", timeAs: "linear", ciLevel: 2 }, t);
  assert.equal(o.covariance, "cs");
  assert.equal(o.timeAs, "linear");
  assert.equal(o.ciLevel, 0.95);
  assert.equal(o.log, false);
  const w = normalizeTcWindow({ summary: "max", from: "60" }, t);
  assert.equal(w.summary, "max");
  assert.equal(w.from, "60");
  assert.equal(w.to, "");
});

test("window: limits, mean and peak per subject, engine payloads", () => {
  const t = timecourseSample();
  const p = prepare(t, normalizeTcMixed({}, t));
  const win = windowRecords(p.records, "60", "120");
  assert.equal(win.length, 36);
  const means = subjectSummaries(win, p.names, "mean");
  assert.equal(means[0].name, "C1");
  assert.equal(means[0].value, (180 + 140 + 110) / 3);
  assert.equal(subjectSummaries(win, p.names, "max")[0].value, 180);
  const mean = windowPayload(p, normalizeTcWindow({ from: "60", to: "120" }, t)) as any;
  // a flat line from 0 to 1 at the subject's value: its area is the value
  assert.deepEqual(mean.data.time.slice(0, 2), [0, 1]);
  assert.equal(mean.data.value[0], (180 + 140 + 110) / 3);
  assert.equal(mean.data.subject.length, 24);
  assert.equal(mean.options.per_time, false);
  const area = windowPayload(p, normalizeTcWindow({ summary: "auc_per_time", from: "60" }, t)) as any;
  assert.equal(area.data.time.length, 36);
  assert.equal(area.options.per_time, true);
  assert.ok("error" in windowPayload(p, normalizeTcWindow({ from: "500" }, t)));
});

const RESULT = {
  groups: ["Chow", "High-fat diet"], times: ["0", "15"], n_subjects: 12, time_as: "factor",
  df: { between_subjects: 10, within_subjects: 10 }, covariance: { kind: "cs", label: "Compound symmetry" },
  group_at_time: [
    { time: "0", group: "Chow", mean: 93.8, ci: [84.1, 103.5], n: 6 },
    { time: "0", group: "High-fat diet", mean: 130.3, ci: [120.6, 140], n: 6 },
    { time: "15", group: "Chow", mean: 208.8, ci: [199.1, 218.5], n: 6 },
    { time: "15", group: "High-fat diet", mean: 299.7, ci: [290, 309.4], n: 6 },
  ],
  group_difference_at_time: { method: "sidak", comparisons: [{}, {}],
    family: { size: 2, method: "sidak", per_family: false, n_families: 2 } },
  model_comparison: { rows: [{}, {}, {}, {}] },
};

test("graph series, notes and methods text", () => {
  const s = meanSeries(RESULT);
  assert.equal(s.length, 2);
  assert.deepEqual(s[1].x, [0, 15]);
  assert.deepEqual(s[1].hi, [140, 309.4]);
  assert.equal(numericTimes(["a", "1"]), null);
  assert.match(timecoursePlotted(0.95), /error bars showing its 95% confidence interval/);
  assert.match(timecoursePlotted(0.9, true, "band"), /shaded band showing its 90%.*each subject/);
  assert.match(dfNote(RESULT), /Group is tested on 10 df between subjects \(12 subjects − 2 groups\)/);
  const t = timecourseSample();
  const m = tcMethodsText(RESULT, normalizeTcMixed({}, t), "blood glucose (mg/dl)");
  assert.match(m, /random intercept per subject \(compound symmetry\)/);
  assert.match(m, /between-within method/);
  assert.match(m, /chosen among 4 candidates by Akaike/);
  assert.match(m, /adjusted for 2 comparisons \(Šídák\)/);
  const col = tcColumnTable({ table: { datasets: [{ name: "Chow", ys: [[1.5], [2]] }] } }, "AUC");
  assert.equal(col.type, "column");
  assert.deepEqual(col.datasets[0].rows, [["1.5"], ["2"]]);
});
