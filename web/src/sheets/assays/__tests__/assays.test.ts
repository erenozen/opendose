// Unit tests for the assay modules' pure parts: AUC geometry and payload,
// growth doubling time, tumour-growth records / layouts / endpoints,
// synergy matrices, volcano classification, clustering matrices, the
// examples' empty layouts.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../../project/table.ts";
import { groupedSample } from "../../grouped/sample.ts";
import { aucPayload, DEFAULT_AUC, shadedRegions, trapezoid } from "../aucModel.ts";
import { DEFAULT_GROWTH, doublingTime, growthTransformPayload, growthYTitle } from "../growthModel.ts";
import { growthSample } from "../growthSample.ts";
import {
  endpointRows, groupedFromRecords, guessColumns, normalizeMixed, subjectSeries,
  survivalFromEndpoints, timeFromTitle, transformed, tumourRecords,
} from "../tumourModel.ts";
import { tumourSample } from "../tumourSample.ts";
import {
  concOf, normalizeSynergy, parseMatrixBlocks, scoreReading, synergyData, synergyTable,
} from "../synergyModel.ts";
import { synergySample } from "../synergySample.ts";
import { classify, guessVolcano, hitsTable, normalizeVolcano, volcanoRows } from "../volcanoModel.ts";
import { volcanoSample } from "../volcanoSample.ts";
import { clusterMatrix, clusterPayload, membershipTable, normalizeCluster } from "../clusterModel.ts";
import { clusterSample } from "../clusterSample.ts";
import { aucSample } from "../aucSample.ts";
import { emptyLayout } from "../kit/columns.ts";

const close = (a: number, b: number, tol = 1e-9) =>
  assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} != ${b}`);

test("AUC: trapezoid and shaded regions split at baseline crossings", () => {
  close(trapezoid([0, 1, 2, 3], [0, 2, 4, 2]), 7);
  const regs = shadedRegions([0, 1, 2], [-1, 1, 1], 0);
  assert.equal(regs.length, 2);
  assert.equal(regs[0].sign, -1);
  close(regs[0].x[1], 0.5);                       // crossing at x = 0.5
  assert.equal(regs[1].sign, 1);
  // each polygon closes on the baseline
  assert.deepEqual(regs[1].y.slice(-2), [0, 0]);
});

test("AUC payload: options, summary format passed through", () => {
  const t = normalizeTable({ type: "xy", x: ["0", "1"], datasets: [{ name: "A", rows: [["1"], ["3"]] }] });
  const p = aucPayload(t, { ...DEFAULT_AUC, baseline: "value", baselineValue: "0.5", ciLevel: "90" });
  const o = p.options as Record<string, unknown>;
  assert.equal(p.analysis, "auc");
  assert.equal(o.baseline_value, 0.5);
  assert.equal(o.ci_level, 0.9);
  assert.equal(o.summary_format, undefined);
});

test("growth: Growthcurver example, payload and ln 2 / K doubling time with CI", () => {
  const t = growthSample();
  assert.equal(t.x.length, 145);
  close(Number(t.x[6]), 1);
  const p = growthTransformPayload(t, DEFAULT_GROWTH);
  assert.equal((p.options as Record<string, unknown>).blank, "min");
  assert.equal((p.options as Record<string, unknown>).log, null);
  const d = doublingTime("logistic_growth", { K: { value: 1.118657, ci95: [1.0887, 1.1486] } }, "none")!;
  close(d.value!, Math.LN2 / 1.118657);
  assert.equal(d.value!.toPrecision(4), "0.6196");
  close(d.ci![0], Math.LN2 / 1.1486);
  // Zwietering on log2 data: ln 2 / MuMax rescaled to log2 units
  const z = doublingTime("zwietering_logistic", { DoublingTime: { value: Math.LN2 / 0.5, ci95: null } }, "log2")!;
  close(z.value!, 2);
  assert.equal(doublingTime("gompertz_growth", { K: { value: 1 } }, "none"), null);
  assert.equal(growthYTitle(t, { ...DEFAULT_GROWTH, log: "ln", relativeToFirst: true }), "ln(N/N0)");
});

test("tumour: long records from the multiple-variables example", () => {
  const t = tumourSample();
  const cols = guessColumns(t);
  assert.deepEqual(cols, { subject: "Mouse", group: "Group", time: "Day", value: "Volume" });
  const rec = tumourRecords(t, cols);
  assert.equal(rec.records.length, 181);
  const s = subjectSeries(rec.records);
  assert.deepEqual(s.groups, ["Vehicle", "Drug A", "Drug B"]);
  assert.equal(s.subjects.length, 24);
  const g = groupedFromRecords(transformed(rec.records, normalizeMixed({}, t)).records, "Day");
  assert.equal(g.type, "grouped");
  assert.equal(g.rowTitles[0], "Day 0");
  assert.equal(g.rowTitles.length, 8);
  assert.equal(g.datasets.length, 3);
  assert.equal(g.datasets[0].rows[0].length, 8);
  // vehicle mice are removed before day 24: blank cells there
  assert.ok(g.datasets[0].rows[7].every((v) => v === ""));
  close(Number(g.datasets[0].rows[0][0]), Math.log(75.0), 1e-9);
});

test("tumour: grouped tables with subjects as subcolumns, time from row titles", () => {
  assert.equal(timeFromTitle("Day 14"), 14);
  assert.equal(timeFromTitle("t = 2.5 h"), 2.5);
  assert.equal(timeFromTitle("baseline"), null);
  const rec = tumourRecords(groupedSample(), { subject: "", group: "", time: "", value: "" });
  assert.equal(rec.source, "grouped");
  assert.equal(rec.records.length, 18);
  assert.deepEqual([...new Set(rec.records.map((r) => r.time))], [7, 14, 21]);
  assert.equal(subjectSeries(rec.records).subjects.length, 6);
});

test("tumour: time to endpoint, log-linear interpolation and censoring", () => {
  const recs = [
    { subject: "a", label: "a", group: "G", time: 0, value: 100 },
    { subject: "a", label: "a", group: "G", time: 10, value: 400 },
    { subject: "a", label: "a", group: "G", time: 20, value: 1600 },
    { subject: "b", label: "b", group: "G", time: 0, value: 100 },
    { subject: "b", label: "b", group: "G", time: 20, value: 500 },
  ];
  const rows = endpointRows(recs, 800, true);
  // ln 800 is halfway between ln 400 and ln 1600
  close(rows[0].time, 15);
  assert.equal(rows[0].event, 1);
  assert.deepEqual([rows[1].time, rows[1].event], [20, 0]);
  assert.equal(endpointRows(recs, 800, false)[0].time, 20);
  const st = survivalFromEndpoints(rows, ["G"]);
  assert.equal(st.type, "survival");
  assert.deepEqual(st.datasets[0].rows, [["15", "1"], ["20", "0"]]);
});

test("synergy: matrix from the grouped example, replicates, paste", () => {
  const t = synergySample();
  const o = normalizeSynergy({}, t);
  const d = synergyData(t, o);
  assert.ok(!("error" in d));
  if ("error" in d) return;
  assert.equal(d.nReplicates, 1);
  const data = d.data as { conc1: number[]; conc2: number[]; responses: number[][] };
  assert.deepEqual(data.conc1, [0, 9.7656, 39.0626, 156.25, 625, 2500]);
  assert.equal(data.conc2[5], 50);
  close(data.responses[5][5], 7.802637);
  assert.equal(concOf("10 nM"), 10);
  const bad = synergyData(normalizeTable({ type: "grouped", rowTitles: ["zero"], x: [""],
    datasets: [{ name: "0", rows: [["1"]] }] }), o);
  assert.ok("error" in bad);
  const pasted = parseMatrixBlocks("\t0\t1\t2\n0\t100\t90\t80\n5\t70\t60\t50\n\n\t0\t1\t2\n0\t98\t91\t79\n5\t72\t58\t49");
  assert.ok(!("error" in pasted));
  if ("error" in pasted) return;
  assert.deepEqual(pasted.conc2, ["0", "1", "2"]);
  assert.equal(pasted.reps.length, 2);
  const rt = synergyTable(pasted.conc1, pasted.conc2, pasted.reps);
  assert.deepEqual(rt.datasets[2].rows[1], ["50", "49"]);
  const d2 = synergyData(rt, o);
  assert.ok(!("error" in d2) && d2.nReplicates === 2);
  assert.equal(scoreReading(10.86), "likely synergistic");
  assert.equal(scoreReading(-3), "likely additive");
});

test("volcano: columns guessed, raw-P classification and the hits table", () => {
  const t = volcanoSample();
  const g = guessVolcano(t);
  assert.deepEqual([g.name, g.fc, g.fcScale, g.p, g.pAdjusted], ["Gene", "log2FoldChange", "log2", "pvalue", false]);
  const o = { ...normalizeVolcano({}, t), fdr: "none" as const };
  const { rows, omitted } = volcanoRows(t, o);
  assert.equal(rows.length, 240);
  assert.equal(omitted, 0);
  const c = classify(rows, null, o);
  assert.deepEqual(c.counts, { up: 19, down: 12, ns: 209 });
  assert.equal(c.rows.filter((r) => r.top).length, 10);
  const ht = hitsTable(c.rows, false);
  assert.equal(ht.x.length, 31);
  assert.deepEqual(ht.datasets.map((d) => d.name), ["Name", "log2 fold change", "P", "Direction"]);
  // a plain ratio is converted to log2
  const ratio = normalizeTable({ type: "multivariable", datasets: [
    { name: "FC", varType: "continuous", rows: [["4"]] }, { name: "P", varType: "continuous", rows: [["0.01"]] }] });
  const r = volcanoRows(ratio, { ...normalizeVolcano({}, ratio), fc: "FC", p: "P", fcScale: "ratio" });
  close(r.rows[0].log2fc, 2);
});

test("clustering: grouped cell means, missing rows dropped, memberships", () => {
  const t = normalizeTable({ type: "grouped", rowTitles: ["A", "B", "C"], x: ["", "", ""],
    datasets: [
      { name: "X", rows: [["1", "3"], ["8", ""], ["", ""]] },
      { name: "Y", rows: [["2", "2"], ["9", "9"], ["4", ""]] },
    ] });
  const o = normalizeCluster({ scale: "none" }, t);
  const m = clusterMatrix(t, o);
  assert.deepEqual(m.values, [[2, 2], [8, 9]]);
  assert.deepEqual(m.dropped, ["C"]);
  const p = clusterPayload(m, { ...o, kRows: "2" });
  assert.equal((p.options as Record<string, unknown>).k_rows, 2);
  const mt = membershipTable({ rows: { clusters: [0, 1] } }, m, o)!;
  assert.deepEqual(mt.datasets[1].rows, [["1"], ["2"]]);
  const ex = clusterSample();
  const mo = normalizeCluster({}, ex);
  assert.equal(mo.labelVariable, "Gene");
  const em = clusterMatrix(ex, mo);
  assert.equal(em.values.length, 24);
  assert.equal(em.colNames.length, 8);
});

test("empty layouts keep the example's columns and drop its values", () => {
  for (const ex of [growthSample(), tumourSample(), synergySample(), volcanoSample(), clusterSample(), aucSample()]) {
    const e = emptyLayout(ex);
    assert.equal(e.type, ex.type);
    assert.deepEqual(e.datasets.map((d) => [d.name, d.varType]), ex.datasets.map((d) => [d.name, d.varType]));
    assert.ok(e.x.length >= 1 && e.x.length <= 48);
    assert.equal(e.rowTitles.length, e.x.length);
    assert.ok(e.x.every((v) => v === "") && e.rowTitles.every((v) => v === ""));
    for (const [j, d] of e.datasets.entries()) {
      assert.equal(d.rows.length, e.x.length);
      assert.ok(d.rows.every((r) => r.every((v) => v === "")));
      assert.equal(d.rows[0].length, ex.datasets[j].rows[0].length);
    }
  }
  const m = emptyLayout(synergySample(), { keepRowTitles: true });
  assert.deepEqual(m.rowTitles, synergySample().rowTitles);
});

test("AUC example: a glucose tolerance test, one subcolumn per mouse", () => {
  const t = aucSample();
  assert.equal(t.type, "xy");
  assert.deepEqual(t.x, ["0", "15", "30", "60", "90", "120"]);
  assert.deepEqual(t.datasets.map((d) => d.rows[0].length), [4, 4]);
  const mouse1 = t.datasets[0].rows.map((r) => Number(r[0]));
  close(trapezoid([0, 15, 30, 60, 90, 120], mouse1), 20602.5);
});
