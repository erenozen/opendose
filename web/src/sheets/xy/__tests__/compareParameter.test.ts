// "Compare a parameter": wording, the incomplete-curve flag, the payloads
// and the parameter choice, against the engine's compare_parameter result
// for the e2e "Two curves" table (Control vs Treated, 4PL inhibitor, X in
// M): LogIC50 -6.9828 vs -6.4584, difference 0.5244 (0.4744 to 0.5745),
// IC50 ratio 3.345 (2.981 to 3.754), F(1, 10) = 528.9, P = 5.5e-10.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../../project/table.ts";
import { modelMeta } from "../../../lib/modelLibrary.ts";
import {
  aiccText, chosenSets, comparableParameters, compareParameterLegend, compareParameterMethods,
  compareParameterPayload, compareParameterSentence, datasetPair, defaultParameter, fTestText, headline,
  isMidpoint, midpointFlag, potencyText, ratioText, runParameter, setsDifferingPairs, setsHeadline,
} from "../compareParameter.ts";
import { DEFAULT_COMPARE, chosenParameter, normalizeCompare, runCompare } from "../compareFits.ts";
import { compareFitsOptions } from "../../../components/resultsLinks.ts";

const ENGINE = {
  analysis: "compare_parameter", model: "log_inhibitor_vs_response_4pl", parameter: "LogIC50",
  parameter_internal: "LogXmid", dataset_names: ["Control", "Treated"],
  separate: [
    { name: "Control", value: -6.982774577017221, se: 0.015900978880245324,
      ci: [-7.023649344495616, -6.941899809538826], df: 5, n_points: 9, status: "converged" },
    { name: "Treated", value: -6.45836651690171, se: 0.0158651266378584,
      ci: [-6.499149123257058, -6.4175839105463615], df: 5, n_points: 9, status: "converged" },
  ],
  difference: { value: 0.524408060115511, se: 0.02246204292991383, t: 23.346409841338627, df: 10,
    p: 4.706596976374631e-10, ci: [0.4743595095683864, 0.5744566106626356] },
  ratio: { value: 3.3450919495861497, ci: [2.980983070222302, 3.7536745052200584],
    method: "antilog of the difference of log values", kind: "potency_ratio" },
  f_test: { F: 528.9074517121784, dfn: 1, dfd: 10, p: 5.456508659800599e-10 },
  aicc: { probability_1: 1.8286216138333743e-14, probability_2: 0.9999999999999817, prefer: 2,
    preferred: "separate" },
  shared_fit: { value: { value: -6.706402392857554, ci: [-6.897779058482299, -6.51502572723281] } },
  ci_level: 0.95, warnings: [], notes: [],
};

test("ratio, headline and F test in words", () => {
  assert.equal(ratioText(ENGINE, []), "3.35-fold (95% CI 2.98–3.75)");
  assert.equal(headline(ENGINE, [], "graphpad"),
    "IC50 shifted 3.35-fold (95% CI 2.98–3.75), P < 0.0001 (Treated vs Control)");
  assert.equal(fTestText(ENGINE, "graphpad"), "F(1, 10) = 528.9, P < 0.0001");
  assert.equal(aiccText(ENGINE), "AICc favours separate LogIC50 values (probability > 99.99%)");
  assert.equal(potencyText(ENGINE), "Control is 3.35 times as potent as Treated");
  // the ratio is the antilog of the difference of the two estimates
  const d = ENGINE.separate[1].value - ENGINE.separate[0].value;
  assert.ok(Math.abs(10 ** d - ENGINE.ratio.value) < 1e-9);
});

test("results sentence, legend clause and methods", () => {
  const s = compareParameterSentence(ENGINE, [], "graphpad");
  assert.match(s, /^The IC50 of Treated was 3\.35-fold that of Control \(IC50 ratio, 95% CI 2\.98 to 3\.75; Control is 3\.35 times as potent as Treated\)\./);
  assert.match(s, /One shared LogIC50 was rejected in favour of separate values \(extra-sum-of-squares F test, F\(1, 10\) = 528\.9, P < 0\.0001; AICc probability that the values differ > 99\.99%\)\.$/);
  assert.match(compareParameterSentence(ENGINE, [], "apa"), /p < \.001/);
  assert.match(compareParameterLegend(ENGINE), /LogIC50 was compared between them by the extra-sum-of-squares F test/);
  assert.match(compareParameterMethods(ENGINE, "4PL"), /antilog of that difference/);
});

test("an IC50 beyond the concentrations tested makes the ratio undefined", () => {
  const fit = { range_flags: { label: "IC50", ec50_above_range: true, report_as: "> 1e-5", report_value: 1e-5 } };
  const f = midpointFlag("Treated", fit, "M")!;
  assert.deepEqual(f, { name: "Treated", label: "IC50", relation: ">", text: "IC50 > 1e-5 M" });
  assert.equal(midpointFlag("Control", { range_flags: { ec50_in_range: true } }, "M"), null);
  assert.equal(ratioText(ENGINE, [f]), "undefined (IC50 > 1e-5 M)");
  assert.match(headline(ENGINE, [f]), /IC50 ratio \(Treated \/ Control\) undefined \(IC50 > 1e-5 M\)/);
  assert.match(compareParameterSentence(ENGINE, [f]), /ratio of Treated to Control is undefined: Treated IC50 > 1e-5 M/);
});

test("parameters, the default parameter and the data-set pair", () => {
  const m4 = modelMeta("log_inhibitor_vs_response_4pl");
  assert.deepEqual(comparableParameters(m4), ["Top", "Bottom", "LogIC50", "HillSlope"]);
  assert.deepEqual(comparableParameters(m4, { Bottom: 0 }), ["Top", "LogIC50", "HillSlope"]);
  // the 3PL's Hill slope is fixed: nothing to compare
  assert.ok(!comparableParameters(modelMeta("log_inhibitor_vs_response_3pl")).includes("HillSlope"));
  assert.equal(defaultParameter(["Top", "LogIC50"]), "LogIC50");
  assert.equal(defaultParameter(["Top", "LogIC50"], "Top"), "Top");
  assert.ok(isMidpoint("LogEC50") && isMidpoint("IC50") && !isMidpoint("HillSlope"));
  const t = normalizeTable({ type: "xy", x: ["1", "2"],
    datasets: [{ name: "A", rows: [["1"], ["2"]] }, { name: "Empty", rows: [[""], [""]] }, { name: "B", rows: [["3"], ["4"]] }] });
  assert.deepEqual(datasetPair(t, 0, 1), [0, 2]);
  assert.deepEqual(datasetPair(t, 2, 0), [2, 0]);
  const o = normalizeCompare({ mode: "parameter", model1: "log_inhibitor_vs_response_4pl", datasetA: 1, datasetB: 0 });
  assert.equal(o.mode, "parameter");
  assert.equal(chosenParameter(o), "LogIC50");
  assert.deepEqual([o.datasetA, o.datasetB], [1, 0]);
  assert.equal(normalizeCompare({}).parameter, DEFAULT_COMPARE.parameter);
});

test("payloads: compare_parameter, then the two data sets alone with their flags", () => {
  const t = normalizeTable({ type: "xy", x: ["1e-9", "1e-8", "1e-7"], xUnit: "M",
    datasets: [{ name: "Control", rows: [["99"], ["50"], ["2"]] }, { name: "Treated", rows: [["100"], ["90"], ["60"]] }] });
  const seen: any[] = [];
  const engine = { analyze: (p: any) => {
    seen.push(p);
    if (p.analysis === "compare_parameter") return ENGINE;
    return { datasets: [
      { name: "Control", points: {}, fit: { curve: {}, range_flags: { label: "IC50", ec50_in_range: true } } },
      { name: "Treated", points: {}, fit: { curve: {}, range_flags: { label: "IC50", ec50_above_range: true, report_as: "> 1e-7" } } },
    ] };
  } };
  const r = runCompare(engine, t, normalizeCompare({ mode: "parameter", model1: "log_inhibitor_vs_response_4pl" }));
  assert.equal(seen[0].analysis, "compare_parameter");
  assert.deepEqual(seen[0].options, { model: "log_inhibitor_vs_response_4pl", parameter: "LogIC50",
    dataset_a: 0, dataset_b: 1, constraints: {}, x_is_log: false });
  assert.equal(seen[1].analysis, "dose_response");
  assert.deepEqual(seen[1].data.datasets.map((d: any) => d.name), ["Control", "Treated"]);
  assert.equal(r.mode, "parameter");
  assert.deepEqual(r.flags.map((f: any) => f.text), ["IC50 > 1e-7 M"]);
  assert.equal(r.datasets.length, 2);
  // summary data and a single data set are refused with a reason
  const one = normalizeTable({ type: "xy", x: ["1"], datasets: [{ name: "A", rows: [["1"]] }] });
  assert.match(runParameter(engine, one, { model: modelMeta("log_inhibitor_vs_response_4pl"), held: {},
    parameter: "LogIC50", datasetA: 0, datasetB: 1, xIsLog: false, errorBars: "sd" }).error, /two data sets/);
});

test("the fit results' link opens the parameter comparison on the fitted model", () => {
  assert.deepEqual(compareFitsOptions("log_agonist_vs_response_4pl", false, "parameter", () => true),
    { mode: "parameter", xIsLog: false, datasetA: 0, datasetB: 1, model1: "log_agonist_vs_response_4pl" });
});

// Three or more data sets (engine compare_parameter_sets, mode "sets").
const SETS = {
  analysis: "compare_parameter", mode: "sets", model: "log_inhibitor_vs_response_4pl",
  parameter: "LogIC50", parameter_internal: "LogXmid", dataset_names: ["Ctrl", "D1", "D2"], n_sets: 3,
  potency: true, ci_level: 0.95,
  f_test: { F: 51.6494, dfn: 2, dfd: 60, p: 9.0e-14 },
  aicc: { preferred: "separate", probability_1: 1e-9, probability_2: 0.999999999 },
  pairwise: [
    { a: "Ctrl", b: "D1", value: 0.6528, p: 4.72e-11, p_holm: 1.42e-10 },
    { a: "Ctrl", b: "D2", value: 0.0895, p: 0.134, p_holm: 0.134 },
    { a: "D1", b: "D2", value: -0.5633, p: 5.04e-9, p_holm: 1.01e-8 },
  ],
};

test("all-data-sets scope: options, chosen sets and payload", () => {
  const t = normalizeTable({ type: "xy", x: ["1", "2"], datasets: [
    { name: "A", rows: [["1"], ["2"]] }, { name: "Empty", rows: [[""], [""]] },
    { name: "B", rows: [["3"], ["4"]] }, { name: "C", rows: [["5"], ["6"]] }] });
  assert.equal(normalizeCompare({}).parameterScope, "pair");
  const o = normalizeCompare({ parameterScope: "all", parameterSets: [0, 1, 3, -1, "x"] });
  assert.equal(o.parameterScope, "all");
  assert.deepEqual(o.parameterSets, [0, 1, 3]);
  assert.deepEqual(chosenSets(t, []), [0, 2, 3]);
  assert.deepEqual(chosenSets(t, [0, 1, 3]), [0, 3]);
  const base = { model: modelMeta("log_inhibitor_vs_response_4pl"), held: {}, parameter: "LogIC50",
    datasetA: 0, datasetB: 2, xIsLog: true, errorBars: "sd" };
  const p = compareParameterPayload(t, { ...base, sets: [] });
  assert.deepEqual(p.options.datasets, [0, 2, 3]);
  assert.equal("dataset_a" in p.options, false);
  assert.equal(compareParameterPayload(t, base).options.dataset_a, 0);
  assert.equal("weighting" in compareParameterPayload(t, base).options, false);
  assert.equal(compareParameterPayload(t, { ...base, weighting: "1/Y2" }).options.weighting, "1/Y2");
  const few = runParameter({ analyze: () => SETS }, t, { ...base, sets: [0, 2] });
  assert.match(few.error, /three or more/);
});

test("all-data-sets wording: headline, differing pairs, sentence, legend, methods", () => {
  assert.equal(setsHeadline(SETS), "LogIC50 differs among the 3 data sets: F(2, 60) = 51.65, P < 0.0001");
  assert.equal(setsHeadline({ ...SETS, f_test: { ...SETS.f_test, F: 1.2, p: 0.31 } }),
    "No evidence that LogIC50 differs among the 3 data sets: F(2, 60) = 1.2, P = 0.3100");
  assert.deepEqual(setsDifferingPairs(SETS), ["D1 vs Ctrl", "D2 vs D1"]);
  const s = compareParameterSentence(SETS, []);
  assert.match(s, /One LogIC50 shared by all 3 data sets was rejected/);
  assert.match(s, /Holm's adjustment: D1 vs Ctrl, D2 vs D1\./);
  assert.match(compareParameterLegend(SETS), /each of Ctrl, D1, D2 separately/);
  const m = compareParameterMethods(SETS, "4PL");
  assert.match(m, /shared by all 3/);
  assert.match(m, /Holm's method; each pair's IC50 ratio/);
});
