// P-16 for the assays: the "Analysed" line of each assay kind, checked
// against the engine's own output on the module's example (the e2e
// table) and on a copy with rows, wells and cells left out. The engine
// results are recorded natively (analysedFixtures.gen.ts) and replayed;
// every count is compared with the engine result it comes from, and the
// line itself is pinned.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dataNotes } from "../../../project/dataNotes.ts";
import { ANALYSED_ASSAYS, assayAnalysed, cellWhy, listOf, rowsText } from "../kit/analysed.ts";
import { analysedCases, type AnalysedCase } from "./analysedCases.ts";
import { replay, replayPayloads } from "./analysedReplay.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

const cases = new Map(analysedCases().map((c) => [c.key, c]));
const run = (key: string) => {
  const c = cases.get(key)!;
  const result = replay(c) as any;
  return { c, result, notes: dataNotes({ analysisId: c.analysisId, table: c.table, options: c.options, result }) };
};
const dataTexts = (n: ReturnType<typeof dataNotes>) => n.notes.filter((x) => x.from === "data").map((x) => x.text);

test("wording helpers", () => {
  assert.equal(listOf(["a"]), "a");
  assert.equal(listOf(["a", "b", "c"]), "a, b and c");
  assert.equal(listOf(["1", "2", "3", "4"], 2), "1, 2 and 2 more");
  assert.equal(rowsText([8, 2, 2]), "rows 3 and 9");
  assert.equal(rowsText([0]), "row 1");
  const t = (analysedCases().find((c) => c.key === "plate_drops") as AnalysedCase).table;
  assert.equal(cellWhy(t, 3, 0), "blank");
  assert.equal(cellWhy(t, 4, 1), "“OVRFLW”");
  assert.equal(cellWhy(t, 0, 2), "excluded");
});

test("every assay the e2e suite runs with a drop has a reader", () => {
  for (const id of ["assay_stdcurve", "assay_qpcr", "assay_flow", "assay_densitometry", "assay_plate",
    "assay_kinetic_rates", "assay_luciferase", "assay_wound_healing", "assay_mic"]) {
    assert.ok(ANALYSED_ASSAYS.includes(id), id);
  }
  // no result, a failed run or another analysis: no line
  assert.equal(assayAnalysed("assay_qpcr", cases.get("qpcr_example")!.table, {}, { error: "x" }), null);
  assert.equal(assayAnalysed("assay_qpcr", cases.get("qpcr_example")!.table, {}, null), null);
  assert.equal(assayAnalysed("column", cases.get("qpcr_example")!.table, {}, {}), null);
});

test("standard curve: replicates in the fit, reportable unknowns, rows and signals left out", () => {
  const ex = run("stdcurve_example");
  const res = ex.result.plates[0].res;
  // the engine's counts
  const fitted = res.standards.filter((l: any) => l.concentration > 0 && !l.excluded);
  assert.equal(fitted.length, 8);
  assert.equal(fitted.reduce((s: number, l: any) => s + l.n, 0), 16);
  assert.deepEqual(res.unknowns.filter((u: any) => u.status !== "ok").map((u: any) => [u.name, u.status]),
    [["S7", ">ULOQ"], ["S8", "<LLOQ"]]);
  assert.equal(ex.notes.analysed, "standards: 16 replicates at 8 levels in the fit, blank subtracted (2 replicates); "
    + "unknowns: 10 of 12 dilutions reportable, 1 below the LLOQ (S8 1:2, row 21), 1 above the ULOQ (S7 1:2, row 20)");
  assert.deepEqual(dataTexts(ex.notes), []);
  // the rows named are the unknowns' rows in the table
  assert.equal(ex.c.table.datasets[1].rows[19][0], "S7");
  assert.equal(ex.c.table.datasets[1].rows[20][0], "S8");

  const dr = run("stdcurve_drops");
  const r2 = dr.result.plates[0].res;
  assert.equal(r2.standards.find((l: any) => l.concentration === 7.81).excluded, "excluded by the user");
  assert.equal(r2.standards.find((l: any) => l.concentration === 1000).n, 1);
  assert.equal(dr.notes.analysed, "standards: 13 replicates at 7 levels in the fit, blank subtracted (2 replicates); "
    + "unknowns: 8 of 10 dilutions reportable, 1 below the LLOQ (S8 1:2, row 21), 1 above the ULOQ (S7 1:2, row 20)");
  assert.deepEqual(dataTexts(dr.notes), [
    "1 row has no signal and was left out: row 13.",
    "1 row typed “skip” (or exclude, empty, ignore) was left out: row 14.",
    "2 signals left out: row 1 Signal 1 (excluded) and row 11 Signal 2 (“n/a”).",
    "The 7.81 pg/mL standard was left out of the fit: excluded by the user (row 8).",
  ]);
});

test("qPCR: wells used, undetermined / blank / excluded / high Cq wells by well id, controls", () => {
  const ex = run("qpcr_example");
  const sum = (r: any, k: string) => r.replicates.reduce((s: number, x: any) => s + x[k], 0);
  assert.equal(sum(ex.result, "n_used"), 108);
  assert.equal(ex.notes.analysed, "108 of 108 sample wells used; samples per group: Control 3, LPS 3, LPS + inhibitor 3");

  // "Use GAPDH only": ACTB's 27 wells stay in the engine's replicate QC
  // but are neither a reference nor a target
  const one = run("qpcr_gapdh_only");
  assert.deepEqual([one.result.reference_genes, one.result.targets], [["GAPDH"], ["IL6", "TNF"]]);
  assert.equal(one.result.replicates.filter((x: any) => x.target === "ACTB").length, 9);
  assert.equal(one.notes.analysed, "81 of 81 sample wells used; ACTB (27 wells) set aside by the reference "
    + "check, not used; samples per group: Control 3, LPS 3, LPS + inhibitor 3");

  const dr = run("qpcr_drops");
  assert.equal(sum(dr.result, "n_replicates"), 108);
  assert.equal(sum(dr.result, "n_used"), 104);
  const il6 = dr.result.replicates.find((x: any) => x.sample === "CON-1" && x.target === "IL6");
  assert.deepEqual([il6.cq_values, il6.wells], [[null, null, 27.25], ["A7", "A8", "A9"]]);
  assert.equal(dr.result.controls.n_wells, 1);
  assert.equal(dr.notes.analysed, "104 of 108 sample wells used; 3 wells without a Cq left out: "
    + "CON-1 IL6 A7 (“Undetermined”), CON-1 IL6 A8 (blank) and CON-1 TNF A10 (excluded); "
    + "1 well above Cq 35 left out: CON-2 GAPDH A14 (Cq 36.2); "
    + "samples per group: Control 3, LPS 3, LPS + inhibitor 3; 1 NTC or no-RT control well checked, not quantified");
  assert.deepEqual(dataTexts(dr.notes), ["1 row has no target and was left out: row 110."]);
  // the engine's own NTC warning stays in the strip
  assert.ok(dr.notes.notes.some((x) => x.from === "engine" && x.text.startsWith("NTC amplified for GAPDH (Cq 34")));
});

test("flow: rows to donor × condition values, rows left out named", () => {
  const ex = run("flow_example");
  assert.deepEqual(ex.result.n_technical, [[1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1]]);
  assert.equal(ex.notes.analysed, "12 of 12 rows: 3 donors × 4 conditions, one value per donor and condition");
  const dr = run("flow_drops");
  // 13 rows: 11 records sent, the engine drops the one with "n/a"
  assert.equal(dr.result.warnings[0], "1 record without a condition or a numeric value left out");
  assert.equal(dr.notes.analysed, "10 of 13 rows: 3 donors × 4 conditions, one value per donor and condition; "
    + "1 row without a sample name left out: row 8; 1 name without a donor or condition part left out: "
    + "row 13, “D2.fcs”; 1 value that is not a number left out: row 5, “n/a”");
  // 11 records reach the engine: the row without a name and the name
  // without a condition stay in the table
  assert.equal((replayPayloads("flow_drops")[0] as any).data.records.length, 11);
});

test("densitometry: lanes in the ratios, blots, lanes and rows left out, a lane without a loading control", () => {
  const ex = run("dens_example");
  assert.equal(ex.result.n_blots_used, 4);
  assert.equal(ex.notes.analysed, "16 of 16 lanes on 4 blots in the ratios; n = 4 blots");
  const dr = run("dens_drops");
  const lanes = dr.result.lanes;
  assert.equal(lanes.filter((l: any) => l.normalized === null).length, 1);
  assert.deepEqual(lanes.find((l: any) => l.flags.includes("no_reference")).lane, "3");
  assert.equal(dr.notes.analysed, "14 of 15 lanes on 4 blots in the ratios; n = 4 blots; 1 lane left out: "
    + "Blot 2 lane 1, row 5 (target not above background); 1 row left out: row 2 (target “n/a”)");
  assert.deepEqual(dataTexts(dr.notes), ["1 lane has no loading-control value, so its target signal alone stands "
    + "in for the ratio: Blot 2 lane 3, row 7. Enter the loading control, or exclude the lane."]);
});

test("plate reader: mapped wells read, wells left out by id and why, readings outside the map", () => {
  const ex = run("plate_example");
  assert.equal(ex.result.plates[0].wells.length, 96);
  assert.equal(ex.notes.analysed, "96 of 96 mapped wells read (72 sample, 24 control)");
  const dr = run("plate_drops");
  const wells = dr.result.plates[0].wells;
  assert.deepEqual(wells.filter((w: any) => w.raw === null).map((w: any) => w.well), ["A4", "B5", "C1"]);
  assert.equal(dr.result.plates[0].qc.blank.n, 7);
  assert.equal(dr.notes.analysed, "92 of 95 mapped wells read (69 sample, 23 control); 3 wells left out: "
    + "A4 (blank), B5 (“OVRFLW”) and C1 (excluded); 1 well with a reading is not in the plate map and not used: H11");
});

test("kinetic, wound, MIC: wells or series with a result, reads left out", () => {
  const k = run("kinetic_drops");
  assert.equal(k.result.wells.length, 23);
  assert.equal(k.notes.analysed, "23 of 24 wells with a rate (8 samples, “No enzyme” as the blank); "
    + "1 well left out: “25” well 2 (1 read, fewer than 2)");
  assert.deepEqual(dataTexts(k.notes), ["2 values left out: “100” well 1 row 3 (“sat”) and “200” well 3 row 2 (excluded)."]);
  assert.equal(run("kinetic_example").notes.analysed, "24 of 24 wells with a rate (8 samples, “No enzyme” as the blank)");
  const w = run("wound_drops");
  assert.deepEqual(w.result.summaries.map((s: any) => s.n_wells), [4, 3, 4]);
  assert.equal(w.notes.analysed, "11 of 12 wells with a closure rate (3 conditions); 1 well left out: "
    + "“siRNA” well 4 (1 value, fewer than 2)");
  assert.deepEqual(dataTexts(w.notes), ["1 value left out: “TGF-β” well 1 row 3 (“n/a”)."]);
  const m = run("mic_drops");
  assert.equal(m.result.series.filter((s: any) => s.valid).length, 17);
  assert.equal(m.notes.analysed, "17 of 17 dilution series valid (6 strains)");
  assert.deepEqual(dataTexts(m.notes), ["1 value left out: “Isolate 1” series 2 row 5 (“n/a”)."]);
  assert.equal(run("mic_example").notes.analysed, "18 of 18 dilution series valid (6 strains)");
});

test("luciferase: wells with a ratio, the background group, n experiments, wells and rows left out", () => {
  const ex = run("luc_example");
  assert.equal(ex.result.n_units, 3);
  assert.equal(ex.notes.analysed, "27 of 27 wells with a ratio (9 wells of “Mock” as the background); n = 3 experiments");
  const dr = run("luc_drops");
  assert.deepEqual(dr.result.wells.filter((x: any) => x.ratio === null).map((x: any) => x.well), ["A11"]);
  assert.equal(dr.notes.analysed, "24 of 25 wells with a ratio (9 wells of “Mock” as the background); n = 3 experiments; "
    + "1 well left out: A11, row 11 (a reading missing); 2 rows left out: row 6 (no group) and row 9 (no readings)");
});

test("a failed run has no Analysed line", () => {
  const c = cases.get("qpcr_example")!;
  const n = dataNotes({ analysisId: c.analysisId, table: c.table, options: c.options, result: { error: "boom" } });
  assert.equal(n.analysed, null);
});
