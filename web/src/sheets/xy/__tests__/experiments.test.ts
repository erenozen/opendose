// Potency across experiments (P-08): the engine option built from the
// replicate map, the reading of the engine's result for the table and the
// headline, and the linked column table. The result below is the engine's
// output on engine/tests/reference/potency_across_experiments.json (the
// values asserted there against scipy's curve_fit and t interval).
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../../project/table.ts";
import type { DataTableModel } from "../../../project/types.ts";
import {
  experimentsOption, molarExponent, potencySummaries, potencyTable,
} from "../experiments.ts";
import { potencyItem } from "../../../components/answer/potencyFacts.ts";

const xy = (over: Partial<DataTableModel> = {}): DataTableModel => ({
  ...normalizeTable({
    type: "xy", x: ["1e-9", "1e-8", "1e-7"], xTitle: "[Conc.]", xUnit: "M",
    datasets: [{ name: "Drug A", rows: [["98", "99", "97", "96", "95", "99", "97", "98", "96"],
      ["60", "62", "58", "70", "71", "69", "80", "78", "79"], ["3", "2", "4", "8", "9", "7", "20", "21", "19"]] }],
  }),
  ...over,
});

test("molar units give pIC50; other units do not", () => {
  assert.equal(molarExponent("M"), 0);
  assert.equal(molarExponent("µM"), -6);
  assert.equal(molarExponent("uM"), -6);
  assert.equal(molarExponent("μM"), -6); // Greek mu
  assert.equal(molarExponent("nM"), -9);
  assert.equal(molarExponent("µg/mL"), null);
  assert.equal(molarExponent(""), null);
});

test("the engine option comes from the replicate map, blocks of subcolumns", () => {
  assert.equal(experimentsOption(xy()), null); // no map: the pooled fit only
  const map = { by: "subcolumns" as const, of: [0, 0, 0, 1, 1, 1, 2, 2, 2], unit: "wells" };
  const o = experimentsOption(xy({ replicates: map }))!;
  assert.deepEqual(o.of, [0, 0, 0, 1, 1, 1, 2, 2, 2]);
  assert.deepEqual(o.names, ["Experiment 1", "Experiment 2", "Experiment 3"]);
  assert.equal(o.log10_molar, 0);
  // unequal blocks, sparse experiment numbers made dense
  const u = experimentsOption(xy({ replicates: { by: "subcolumns", of: [0, 0, 4, 4, 4, 7, 7, 7, 7] } }))!;
  assert.deepEqual(u.of, [0, 0, 1, 1, 1, 2, 2, 2, 2]);
  // µM in the X title: pIC50 shifts by 6
  assert.equal(experimentsOption(xy({ replicates: map, xTitle: "Dose (µM)" }))!.log10_molar, -6);
  assert.equal(experimentsOption(xy({ replicates: map, xUnit: "µg/mL" }))!.log10_molar, null);
  // one experiment, means with errors, or a column map: nothing to summarise
  assert.equal(experimentsOption(xy({ replicates: { by: "subcolumns", of: Array(9).fill(0) } })), null);
  assert.equal(experimentsOption(xy({ replicates: map, subcolumnFormat: "mean_sd_n" })), null);
  assert.equal(experimentsOption(xy({ replicates: { by: "column", column: 0 } })), null);
});

const fit = (name: string, log: number, included = true, reason: string | null = null) => ({
  name, included, reason, error: null, n_points: 24, param: "LogIC50", log_value: log,
  value: 10 ** log, ci95_log: [log - 0.1, log + 0.1], status: "converged",
});
const ENGINE = {
  analysis: "dose_response",
  datasets: [{
    name: "Drug A", fit: { params: {} },
    experiments: {
      param: "LogIC50", label: "IC50", n_experiments: 3,
      fits: [fit("Experiment 1", -7.345225254585074), fit("Experiment 2", -6.994097151044237),
        fit("Experiment 3", -6.764361554501192)],
      summary: { n: 3, df: 2, mean_log: -7.034561320043501, sd_log: 0.29253832440961536,
        sem_log: 0.1688970803461735, t_crit: 4.302652729749462,
        ci95_log: [-7.7612668038416786, -6.307855836245324],
        geomean: 9.23503785449478e-8, geomean_ci95: [1.7327391822346962e-8, 4.922028949790306e-7],
        p_mean: 7.034561320043501, p_ci95: [6.307855836245324, 7.7612668038416786], withheld: null },
    },
  }],
};

test("the summary reads the engine's numbers at display precision", () => {
  const [s] = potencySummaries(ENGINE);
  assert.equal(s.keyName, "pIC50");
  assert.deepEqual(s.rows.map((r) => r.value), ["4.516e-8", "1.014e-7", "1.720e-7"]);
  assert.deepEqual(s.rows.map((r) => r.logValue), ["-7.345", "-6.994", "-6.764"]);
  assert.equal(s.meanLog, "-7.035");
  assert.equal(s.sdLog, "0.2925");
  assert.equal(s.ciLog, "-7.761 to -6.308");
  assert.equal(s.pMean, "7.035");
  assert.equal(s.pCI, "6.308 to 7.761");
  assert.equal(s.geomean, "9.235e-8");
  assert.equal(s.geomeanCI, "1.733e-8 to 4.922e-7");
  assert.equal(s.n, 3);
  assert.equal(s.df, 2);
  const item = potencyItem(s, "M");
  assert.equal(item.figure.name, "Mean pIC50");
  assert.equal(item.figure.value, "7.035");
  assert.equal(item.figure.ci, "95% CI 6.308 to 7.761 (t, 2 df)");
  assert.deepEqual(item.figure.facts, ["SD 0.2925", "n = 3 experiments"]);
  assert.equal(item.geomean, "Geometric mean IC50 9.235e-8\u00a0M, 95% CI 1.733e-8 to 4.922e-7");
  assert.equal(item.perExperiment, "IC50 per experiment: 4.516e-8, 1.014e-7, 1.720e-7\u00a0M");
  assert.equal(item.figure.demoted, undefined);
});

test("no molar unit: mean logIC50, said in which unit", () => {
  const r = structuredClone(ENGINE);
  Object.assign(r.datasets[0].experiments.summary, { p_mean: null, p_ci95: null });
  const item = potencyItem(potencySummaries(r)[0], "µg/mL");
  assert.equal(item.figure.name, "Mean logIC50");
  assert.equal(item.figure.value, "-7.035");
  assert.equal(item.figure.ci, "95% CI -7.761 to -6.308 (t, 2 df)");
  assert.ok(item.figure.facts.includes("log10 of the concentration in µg/mL"));
});

test("exclusions, two experiments and a withheld summary are said next to the number", () => {
  const r = structuredClone(ENGINE);
  const e = r.datasets[0].experiments;
  e.fits[2] = fit("Experiment 3", -6.76, false, "ambiguous fit: the data do not define the parameters");
  Object.assign(e.summary, { n: 2, df: 1, t_crit: 12.706204736174698 });
  const s = potencySummaries(r)[0];
  const item = potencyItem(s, "M");
  assert.deepEqual(item.excluded,
    ["Experiment 3 left out: ambiguous fit: the data do not define the parameters."]);
  assert.ok(item.figure.facts.includes("n = 2 experiments of 3"));
  assert.match(item.notes[0], /^Two experiments: the CI rests on 1 degree of freedom \(t = 12\.71\)/);
  assert.equal(item.perExperiment, "IC50 per experiment: 4.516e-8, 1.014e-7\u00a0M");
  // fewer than two left: no SD or CI, the reason first
  Object.assign(e.summary, { n: 1, df: 0, sd_log: null, ci95_log: null, geomean_ci95: null, p_ci95: null,
    withheld: "fewer than two experiments can be summarised (1 of 3): Experiment 2: the fit failed" });
  const w = potencyItem(potencySummaries(r)[0], "M");
  assert.match(w.figure.demoted!, /^No SD or CI across experiments: fewer than two experiments/);
  assert.equal(w.figure.ci, undefined);
  assert.deepEqual(w.excluded, []);
  // an engine error (bad map, a model without logIC50) is a message, not a crash
  const bad = { analysis: "dose_response", datasets: [{ name: "E", experiments: { error: "no logIC50" } }] };
  const b = potencyItem(potencySummaries(bad)[0], "M");
  assert.equal(b.figure.demoted, "Could not fit each experiment: no logIC50.");
  assert.equal(potencyTable(bad), null);
});

test("the linked table: one data set per compound, one row per experiment", () => {
  const r = structuredClone(ENGINE);
  r.datasets.push({ ...structuredClone(ENGINE.datasets[0]), name: "Drug B" });
  r.datasets[1].experiments.fits[1] = fit("Experiment 2", -6.5, false, "the fit failed: x");
  const t = potencyTable(r)!;
  assert.equal(t.type, "column");
  assert.equal(t.yTitle, "logIC50");
  assert.deepEqual(t.datasets.map((d) => d.name), ["Drug A", "Drug B"]);
  assert.deepEqual(t.rowTitles, ["Experiment 1", "Experiment 2", "Experiment 3"]);
  assert.deepEqual(t.datasets[0].rows.map((x) => Number(x[0])),
    [-7.345225254585074, -6.994097151044237, -6.764361554501192]);
  // an experiment left out of the summary is an empty cell
  assert.equal(t.datasets[1].rows[1][0], "");
  assert.equal(potencyTable({ analysis: "dose_response", datasets: [{ name: "A" }] }), null);
  assert.equal(potencyTable({ error: "x" }), null);
});

test("permuting the experiments permutes rows, never the summary", () => {
  const r = structuredClone(ENGINE);
  r.datasets[0].experiments.fits.reverse();
  const a = potencySummaries(ENGINE)[0], b = potencySummaries(r)[0];
  assert.equal(a.pMean, b.pMean);
  assert.equal(a.ciLog, b.ciLog);
});
