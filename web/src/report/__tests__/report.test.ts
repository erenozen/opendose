// Reporting package: P-value styles, effect sizes, results sentences (a
// table per analysis and style against native engine results), legends,
// journal checklists, provenance, R/Python snippets, estimation payloads.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateChecklists, checklistSummary, RULES, type FamilyFacts } from "../checklists.ts";
import { describeResult } from "../describe.ts";
import { effectGroups, primaryEffect, relabel } from "../effects.ts";
import { legendParagraph, nStatement, whatIsPlotted } from "../legend.ts";
import { parseReportMeta } from "../meta.ts";
import { statsMethodsParagraph } from "../methods.ts";
import { formatPValue, pNumber, pSummary, starScale } from "../pformat.ts";
import { DEFAULT_REPORT, sanitizeReport } from "../prefs.ts";
import { fnv1a64, optionEntries, projectProvenance, tableFingerprint } from "../provenance.ts";
import { resultSentence, resultSentences } from "../sentences.ts";
import { ident, snippetsFor } from "../snippets.ts";
import { columnEstimationPayload, groupedEstimationPayload, normalizeEstimation } from "../estimation/run.ts";
import { swarmOffsets } from "../estimation/figure.ts";
import { normalizeTable } from "../../project/table.ts";
import type { Project } from "../../project/types.ts";
import { SENTENCES } from "./sentence-table.ts";

const here = dirname(fileURLToPath(import.meta.url));
// Native engine results for the example tables (fixtures.py).
const FX: Record<string, { options: unknown; result: Record<string, unknown> }> =
  JSON.parse(readFileSync(join(here, "fixtures.json"), "utf8"));
const R = (k: string) => FX[k].result;

// ------------------------------------------------------------ P values

test("P values in each style, with the documented floors", () => {
  const cases: [number, string, string, string][] = [
    // p, GraphPad, APA, NEJM
    [0.0321, "P = 0.0321", "p = .032", "P=0.03"],
    [0.5, "P = 0.5000", "p = .500", "P=0.50"],
    [0.0049, "P = 0.0049", "p = .005", "P=0.005"],
    [0.00049, "P = 0.0005", "p < .001", "P<0.001"],
    [0.00002, "P < 0.0001", "p < .001", "P<0.001"],
    [0.99999, "P > 0.9999", "p > .999", "P>0.99"],
  ];
  for (const [p, gp, apa, nejm] of cases) {
    assert.equal(formatPValue(p, "graphpad"), gp);
    assert.equal(formatPValue(p, "apa"), apa);
    assert.equal(formatPValue(p, "nejm"), nejm);
  }
  assert.equal(formatPValue(0.01, "apa", "adjusted P"), "adjusted p = .010");
});

test("results tables keep their precision in the GraphPad style", () => {
  assert.equal(pNumber(0.009358640629429057, "graphpad", "table"), "0.009359");
  assert.equal(pNumber(0.0006337354542241824, "graphpad", "table"), "6.337e-4");
  assert.equal(pNumber(0.00002, "graphpad", "table"), "< 0.0001");
  assert.equal(pNumber(0.0006337, "apa", "table"), "< .001");
  assert.equal(pNumber(0.0321, "nejm", "table"), "0.03");
});

test("asterisks: GraphPad to ****, APA and NEJM stop at ***, ns can be hidden", () => {
  assert.equal(pSummary(0.00005, "graphpad", false), "****");
  assert.equal(pSummary(0.00005, "apa", false), "***");
  assert.equal(pSummary(0.03, "nejm", false), "*");
  assert.equal(pSummary(0.2, "graphpad", false), "ns");
  assert.equal(pSummary(0.2, "graphpad", true), "");
  assert.match(starScale("graphpad", false), /\*\*\*\* P ≤ 0\.0001; ns, not significant: P > 0\.05/);
  assert.match(starScale("apa", false), /\*\*\* p ≤ \.001;/);
  assert.doesNotMatch(starScale("apa", false), /\*\*\*\*/);
});

test("reporting preferences are validated", () => {
  assert.deepEqual(sanitizeReport(undefined), DEFAULT_REPORT);
  assert.deepEqual(sanitizeReport({ pStyle: "apa", hideNs: true, smd: "g", variance: "omega2" }),
    { pStyle: "apa", hideNs: true, smd: "g", variance: "omega2" });
  assert.equal(sanitizeReport({ pStyle: "chicago" }).pStyle, "graphpad");
});

// ------------------------------------------------------------ effect sizes

test("every comparison result yields effect sizes; the preferred one follows the prefs", () => {
  const withEffects = ["ttest_unpaired", "ttest_welch", "ttest_paired", "mann_whitney", "wilcoxon",
    "anova_tukey", "kruskal", "rm_anova", "friedman", "correlation", "column_statistics",
    "two_way", "rm_two_way", "multi_t", "contingency_2x2", "contingency_2x3"];
  for (const k of withEffects) {
    assert.ok(effectGroups(R(k), DEFAULT_REPORT).length > 0, k);
  }
  const d = primaryEffect(effectGroups(R("ttest_unpaired"), DEFAULT_REPORT))!;
  assert.equal(d.id, "d");
  assert.equal(d.measure, "Cohen's d (pooled SD)");
  // Native: d = -3.2307 with the noncentral-t 95% CI [-4.9963, -1.4035].
  assert.ok(Math.abs(d.value - -3.2307070175501176) < 1e-12);
  assert.deepEqual(d.ci, [-4.996334770223879, -1.4034947744291542]);
  assert.equal(d.interpretation?.label, "large");
  const g = primaryEffect(effectGroups(R("ttest_unpaired"), { smd: "g", variance: "eta2" }))!;
  assert.equal(g.id, "g");
  const w = primaryEffect(effectGroups(R("anova_tukey"), { smd: "d", variance: "omega2" }))!;
  assert.equal(w.id, "omega2");
  const twoWay = effectGroups(R("two_way"), DEFAULT_REPORT);
  assert.deepEqual(twoWay.map((x) => x.title), ["Interaction", "Day", "Treatment"]);
  assert.equal(twoWay[0].rows.find((x) => x.preferred)?.id, "partial_eta2");
  assert.equal(effectGroups(R("multi_t"), DEFAULT_REPORT).length, 3);
});

test("interpretation labels follow the engine's rule on other measures", () => {
  const base = { label: "large", scale: "d", thresholds: [0.2, 0.5, 0.8], source: "Cohen (1988)" };
  assert.equal(relabel(0.1, base)?.label, "negligible");
  assert.equal(relabel(-0.6, base)?.label, "medium");
  assert.equal(relabel(0.8, base)?.label, "large");
});

// ------------------------------------------------------------ sentences

test("results sentences: one expected sentence per analysis and style", () => {
  assert.ok(SENTENCES.length >= 90);
  for (const [k, style, expected] of SENTENCES) {
    assert.equal(resultSentence(R(k), { style }), expected, `${k} (${style})`);
  }
});

test("sentences carry the parts reviewers ask for", () => {
  const apa = resultSentence(R("ttest_welch"), { style: "apa" });
  assert.match(apa, /t\(9\.88\) = 5\.60/);         // Welch df to two decimals
  assert.match(apa, /p < \.001/);                   // APA floor, no leading zero
  assert.match(apa, /d = 3\.23, 95% CI \[1\.40, 5\.00\]/);
  assert.match(apa, /two-tailed/);
  assert.match(resultSentence(R("ttest_unpaired"), { style: "nejm" }), /P<0\.001/);
  assert.match(resultSentence(R("ttest_unpaired"), { style: "graphpad" }), /P = 0\.0002/);
  assert.match(resultSentence(R("ttest_unpaired"), { style: "apa", prefs: { smd: "g", variance: "eta2" } }),
    /g = 2\.98, 95% CI \[1\.30, 4\.61\]/);
  assert.deepEqual(resultSentences({ error: "no" }), []);
  assert.deepEqual(resultSentences({ analysis: "something_new" }), []);
});

// ------------------------------------------------------------ legends

test("n with its unit", () => {
  const info = { nUnit: "values" as const };
  assert.equal(nStatement([{ name: "A", n: 6 }, { name: "B", n: 6 }], info), "n = 6 per group");
  assert.equal(nStatement([{ name: "A", n: 6 }, { name: "B", n: 6 }], info, { unit: "wells", experiments: 3 }),
    "n = 6 wells per group from 3 independent experiments");
  assert.equal(nStatement([{ name: "A", n: 6 }, { name: "B", n: 5 }], info, { unit: "mice" }),
    "n = 6 (A), 5 (B) mice");
  assert.equal(nStatement([{ name: "A", n: 6 }, { name: "B", n: 6 }], { nUnit: "pairs" }), "n = 6 pairs");
});

test("figure legend: what is plotted, n, test with sidedness, correction, stars, software", () => {
  const text = legendParagraph({
    graphType: "scatter", result: R("anova_tukey"), errorBars: "sd", starsShown: true,
    style: "graphpad", software: "OpenDose 0.2.0 (SciPy 1.14.1, NumPy 2.0.2)",
    unit: { unit: "wells", experiments: 3 },
  });
  assert.equal(text, "Points show individual values; horizontal lines show the mean and error bars "
    + "the standard deviation (SD). n = 6 wells per group from 3 independent experiments. An ordinary "
    + "one-way ANOVA (two-tailed) followed by Tukey's multiple comparisons test, with P values adjusted "
    + "for multiple comparisons (Tukey) was used. * P ≤ 0.05, ** P ≤ 0.01, *** P ≤ 0.001, "
    + "**** P ≤ 0.0001; ns, not significant: P > 0.05. Analysed and drawn with OpenDose 0.2.0 "
    + "(SciPy 1.14.1, NumPy 2.0.2).");
  const t = legendParagraph({ graphType: "bar", result: R("ttest_unpaired"), style: "apa", software: "OpenDose" });
  assert.match(t, /n = 6 per group/);
  assert.match(t, /An unpaired t test \(two-tailed\) was used\./);
  assert.ok(whatIsPlotted("estimation", { estimation: R("estimation_two") })?.includes("BCa"));
  assert.equal(whatIsPlotted("mystery"), null);
});

test("statistical-analysis paragraph", () => {
  const p = statsMethodsParagraph(R("anova_tukey"), DEFAULT_REPORT,
    { unit: "mice", experiments: 2, exclusions: "none", sampleSize: "pilot data" });
  assert.match(p, /ordinary one-way ANOVA \(two-tailed\), followed by Tukey's multiple comparisons test \(Tukey adjustment/);
  assert.match(p, /down to P < 0\.0001 \(GraphPad style\)/);
  assert.match(p, /Effect sizes are reported as η² with 95% confidence intervals/);
  assert.match(p, /n is the number of mice, from 2 independent experiments\./);
  assert.match(p, /Exclusions: none\. Sample size: pilot data\./);
  assert.equal(statsMethodsParagraph(R("dose_response"), DEFAULT_REPORT, undefined).length > 0, true);
});

// ------------------------------------------------------------ checklists

function facts(over: Partial<FamilyFacts> = {}): FamilyFacts {
  return {
    dataId: "d1", dataName: "Group comparison",
    results: [{ sheetId: "r1", name: "Column stats", info: describeResult(R("anova_tukey")),
      effect: true, effectCI: true, estimateCI: false }],
    graphs: [{ sheetId: "g1", name: "Graph", described: true, errorBars: "sd", pointsShown: true }],
    meta: {}, excludedCount: 0, minN: 6, powerJustification: null,
    software: "OpenDose 0.2.0 with SciPy and NumPy", normalityChecked: false, ...over,
  };
}

test("checklist rules tick from the project, with reasons and fixes", () => {
  const f = facts();
  assert.equal(RULES.test_named(f).status, "met");
  assert.equal(RULES.sidedness(f).status, "met");
  assert.equal(RULES.effect_ci(f).status, "met");
  assert.equal(RULES.multiplicity(f).status, "met");
  assert.match(RULES.multiplicity(f).reason, /Tukey/);
  assert.equal(RULES.points_small_n(f).status, "met");
  assert.equal(RULES.software(f).status, "met");
  assert.equal(RULES.n_unit(f).status, "unmet");
  assert.equal(RULES.n_unit(f).fix?.kind, "details");
  assert.equal(RULES.exclusions(f).status, "unmet");
  assert.equal(RULES.sample_size(f).status, "unmet");
  assert.equal(RULES.sample_size(facts({ powerJustification: "A sample size of 6 per group gives 80% power" })).status, "met");
  assert.equal(RULES.exclusions(facts({ meta: { exclusions: "none" } })).status, "met");
  assert.match(RULES.exclusions(facts({ excludedCount: 2 })).reason, /2 values are excluded/);
  // uncorrected comparisons and SEM bars are flagged
  const lsd = facts({ results: [{ sheetId: "r2", name: "LSD", info: describeResult(R("anova_lsd")),
    effect: true, effectCI: true, estimateCI: false }] });
  assert.equal(RULES.multiplicity(lsd).status, "unmet");
  assert.equal(RULES.no_sem(facts({ graphs: [{ sheetId: "g", name: "Bars", described: true,
    errorBars: "sem", pointsShown: false }] })).status, "unmet");
  assert.equal(RULES.points_small_n(facts({ minN: 12 })).status, "na");
  // Welch's ANOVA has no effect size with CI: flagged with a fix
  const welch = facts({ results: [{ sheetId: "r3", name: "Welch", info: describeResult(R("welch_anova")),
    effect: false, effectCI: false, estimateCI: false }] });
  assert.equal(RULES.effect_ci(welch).status, "unmet");
  assert.equal(RULES.effect_ci(welch).fix?.kind, "analyze");
});

test("the five checklists, combined items and summary", () => {
  const lists = evaluateChecklists(facts());
  assert.deepEqual(lists.map((l) => l.id), ["nature", "elife", "star", "sampl", "arrive"]);
  const arrive = lists.find((l) => l.id === "arrive")!;
  assert.deepEqual(arrive.items.map((i) => i.id), ["e1", "e2", "e3", "e7", "e10"]);
  assert.equal(arrive.items.find((i) => i.id === "e10")!.status, "met");
  assert.equal(arrive.items.find((i) => i.id === "e2")!.status, "unmet");
  const s = checklistSummary(lists);
  assert.ok(s.met > 0 && s.unmet > 0);
  const full = checklistSummary(evaluateChecklists(facts({
    meta: { unit: "mice", experiments: 3, exclusions: "none", sampleSize: "power analysis" },
  })));
  assert.equal(full.unmet, 0);
  for (const l of lists) for (const it of l.items) assert.ok(it.reason.length > 0 && it.source.length > 0);
});

test("reporting details are validated", () => {
  assert.equal(parseReportMeta(null), undefined);
  assert.equal(parseReportMeta({ unit: "  " }), undefined);
  assert.deepEqual(parseReportMeta({ unit: "mice", experiments: 3, exclusions: "none", junk: 1 }),
    { unit: "mice", experiments: 3, exclusions: "none" });
  assert.deepEqual(parseReportMeta({ experiments: 2.5 }), undefined);
});

// ------------------------------------------------------------ provenance

const COLUMN = normalizeTable({
  type: "column",
  datasets: [
    { name: "Control", rows: [["23.1"], ["25.4"], ["21.8"], ["24.9"], ["22.6"], ["26.0"]] },
    { name: "Treated A", rows: [["28.4"], ["30.2"], ["27.1"], ["31.5"], ["29.0"], ["28.8"]] },
    { name: "Treated B", rows: [["35.2"], ["33.9"], ["37.4"], ["34.1"], ["36.6"], ["35.8"]] },
  ],
});

test("fingerprints: FNV-1a 64 and a stable table fingerprint", () => {
  assert.equal(fnv1a64(""), "cbf29ce484222325");
  assert.equal(fnv1a64("a"), "af63dc4c8601ec8c");
  const fp = tableFingerprint(COLUMN);
  assert.match(fp, /^fnv1a64:[0-9a-f]{16}$/);
  assert.equal(tableFingerprint({ ...COLUMN, decimals: 2 }), fp);   // display only
  const edited = { ...COLUMN, datasets: COLUMN.datasets.map((d, i) => (i ? d : { ...d, excluded: ["0:0"] })) };
  assert.notEqual(tableFingerprint(edited), fp);
});

test("provenance lists every analysis with its options, defaults marked", () => {
  assert.deepEqual(optionEntries({ a: 1, b: "x", c: [1] }, { a: 1, b: "y" }), {
    a: { value: 1, default: true }, b: { value: "x", default: false }, c: { value: [1], default: false },
  });
  const p: Project = {
    version: 2, title: "T", prefs: { defaultTableType: "column", errorBars: "sd", ciMethod: "asymptotic",
      scheme: "default", digits: 4 },
    sheets: [
      { id: "d1", kind: "data", name: "Group comparison", table: COLUMN },
      { id: "r1", kind: "results", name: "t test", parentId: "d1", analysis: "column",
        options: { analysis: "ttest", ttestKind: "welch" } },
      { id: "g1", kind: "graph", name: "Graph", parentId: "d1", resultsId: "r1", graphType: "scatter",
        settings: { titles: { x: "", y: "" }, scheme: "default" } },
    ],
  };
  const defaults = { analysis: "column_statistics", ttestKind: "unpaired", datasetA: 0 };
  const doc = projectProvenance(p, {
    analysisLabel: () => "Column analyses",
    defaultOptions: () => defaults,
    resolveOptions: (_t, _i, raw) => ({ ...defaults, ...(raw as object) }),
    result: () => R("ttest_welch"),
  }, { app: "OpenDose test", engine: { scipy: "1.14.1" }, date: "2026-10-04T00:00:00Z" });
  assert.equal(doc.opendose_provenance, 1);
  const fam = doc.families[0];
  assert.equal(fam.table.fingerprint, tableFingerprint(COLUMN));
  const step = fam.steps[0] as Record<string, unknown>;
  assert.equal(step.kind, "analysis");
  const opts = step.options as Record<string, { value: unknown; default: boolean }>;
  assert.deepEqual(opts.ttestKind, { value: "welch", default: false });
  assert.deepEqual(opts.datasetA, { value: 0, default: true });
  assert.equal((step.input as { fingerprint: string }).fingerprint, fam.table.fingerprint);
  assert.equal(fam.steps[1].kind, "graph");
  assert.equal(JSON.parse(JSON.stringify(doc)).engine.scipy, "1.14.1");
});

// ------------------------------------------------------------ snippets

test("R and Python snippets carry the data and the options", () => {
  assert.equal(ident("Treated A", 0, new Set()), "treated_a");
  assert.equal(ident("2nd dose", 1, new Set()), "g2_2nd_dose");
  const w = snippetsFor(R("ttest_welch"), { datasetA: 0, datasetB: 1 }, COLUMN);
  assert.match(w.r, /control <- c\(23\.1, 25\.4, 21\.8, 24\.9, 22\.6, 26\)/);
  assert.match(w.r, /t\.test\(control, treated_a, var\.equal = FALSE\)/);
  assert.match(w.python, /stats\.ttest_ind\(control, treated_a, equal_var=False\)/);
  const a = snippetsFor(R("anova_tukey"), {}, COLUMN);
  assert.match(a.r, /aov\(value ~ group, data = d\)/);
  assert.match(a.r, /TukeyHSD\(fit\)/);
  assert.match(a.python, /stats\.tukey_hsd\(control, treated_a, treated_b\)/);
  const m = snippetsFor(R("mann_whitney"), {}, COLUMN);
  assert.ok(m.caveats.some((c) => /ties/.test(c)));
  const e = snippetsFor(R("estimation_two"), {}, COLUMN);
  assert.match(e.python, /random_seed=12345/);
  assert.deepEqual(snippetsFor({ error: "x" }, {}, COLUMN), { r: "", python: "", caveats: [] });
});

// ------------------------------------------------------------ estimation

test("estimation payloads", () => {
  const o = normalizeEstimation({ nBoot: 2000, seed: 7, design: "shared_control", controlIndex: 1 });
  const p = columnEstimationPayload(COLUMN, o) as { options: Record<string, unknown> };
  assert.equal(p.options.design, "shared_control");
  assert.equal(p.options.control_index, 1);
  assert.equal(p.options.n_boot, 2000);
  assert.equal(p.options.seed, 7);
  assert.equal(columnEstimationPayload(COLUMN, normalizeEstimation({})).options.design, undefined);
  const grouped = normalizeTable({
    type: "grouped", rowTitles: ["Day 7", "Day 14"], x: ["", ""],
    datasets: [
      { name: "Vehicle", rows: [["152", "168", "141"], ["298", "341", "312"]] },
      { name: "Drug", rows: [["148", "139", "160"], ["221", "205", "239"]] },
    ],
  });
  const g = groupedEstimationPayload(grouped, normalizeEstimation({}));
  assert.deepEqual(g.data.datasets.map((d) => d.name),
    ["Day 7: Vehicle", "Day 7: Drug", "Day 14: Vehicle", "Day 14: Drug"]);
  assert.deepEqual(g.options.pairs, [[0, 1], [2, 3]]);
  assert.equal(g.options.design, "multi_two_group");
});

test("swarm offsets keep close values apart and stay within the column", () => {
  const offs = swarmOffsets([1, 1, 1, 1, 5], 0.5);
  assert.equal(offs[4], 0);
  assert.equal(new Set(offs.slice(0, 4)).size, 4);
  assert.ok(offs.every((x) => Math.abs(x) <= 0.38));
});
