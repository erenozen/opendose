// qPCR Cq-export headers: the resolver across instrument software, the
// header row under a preamble, the mapping guess when headers do not say,
// undetermined wells. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { longTable, resolveColumns } from "../../kit/columns.ts";
import {
  findCqHeader, guessCqMapping, isUndeterminedCq, normalizeHeader, resolveCqHeaders,
} from "../headers.ts";
import { DEFAULT_QPCR_OPTIONS, QPCR_ROLES, readQpcr, tableFromStaging } from "../model.ts";

const split = (line: string) => line.split(line.includes("\t") ? "\t" : ",");
const core = (line: string) => {
  const i = resolveCqHeaders(split(line));
  return [i.sample, i.target, i.cq];
};

test("QuantStudio / StepOne / 7500: per-well CT wins over Ct Mean; Cт with a Cyrillic т", () => {
  const qs = "Well\tWell Position\tOmit\tSample Name\tTarget Name\tTask\tReporter\tQuencher\tCT\tCt Mean\tCt SD\t"
    + "Quantity\tQuantity Mean\tQuantity SD\tAutomatic Ct Threshold\tCt Threshold\tAutomatic Baseline\tBaseline Start\t"
    + "Baseline End\tComments";
  const i = resolveCqHeaders(split(qs));
  assert.deepEqual([i.sample, i.target, i.cq, i.well, i.quantity], [3, 4, 8, 0, 11]);
  const da2 = "Well,Well Position,Omit,Sample,Target,Task,Reporter,Quencher,Amp Status,Amp Score,Curve Quality,"
    + "Result Quality Issues,Cq,Cq Confidence,Cq Mean,Cq SD,Auto Threshold,Threshold,Auto Baseline,Baseline Start,Baseline End";
  assert.deepEqual(core(da2), [3, 4, 12]);
  assert.deepEqual(core("Well,Sample Name,Target Name,Task,Reporter,Quencher,Cт,Cт Mean,Cт SD,Quantity"), [1, 2, 6]);
  assert.deepEqual(core("Well,Sample Name,Detector,Task,Ct,StdDev Ct,Qty,Mean Qty,StdDev Qty,Filtered,Tm"), [1, 2, 4]);
});

test("Bio-Rad CFX: blank first header, Content, Biological Set Name as the group, SQ as quantity", () => {
  const cfx = ",Well,Fluor,Target,Content,Sample,Biological Set Name,Cq,Cq Mean,Cq Std. Dev,Starting Quantity (SQ),"
    + "Log Starting Quantity,SQ Mean,SQ Std. Dev,Set Point,Well Note";
  const i = resolveCqHeaders(split(cfx));
  assert.deepEqual([i.sample, i.target, i.cq, i.well, i.group, i.quantity], [5, 3, 7, 1, 6, 10]);
});

test("LightCycler 96 (Gene Name) is complete; LightCycler 480 (Pos, Name, Cp) has no target", () => {
  const lc96 = "Well\tSample Name\tGene Name\tCq\tConcentration\tCall\tExcluded\tSample Type\tStandard\tCq Mean\tCq Error";
  assert.deepEqual(core(lc96), [1, 2, 3]);
  const lc480 = [["Experiment: run 12  Selected Filter: SYBR Green I (465-510)"],
    ["Include", "Color", "Pos", "Name", "Cp", "Concentration", "Standard", "Status"],
    ["True", "255", "A1", "Ctrl 1", "21.4", "", "0", ""]];
  const h = findCqHeader(lc480)!;
  assert.equal(h.row, 1);
  assert.equal(h.complete, false);
  assert.deepEqual([h.idx.sample, h.idx.target, h.idx.cq, h.idx.well], [3, -1, 4, 2]);
});

test("case, separators and parentheses do not matter; means are a fallback", () => {
  assert.deepEqual(core("SAMPLE_NAME,TARGET_NAME,CT_MEAN"), [0, 1, 2]);
  assert.deepEqual(core("samplename;targetname;C(t)".replace(/;/g, ",")), [0, 1, 2]);
  assert.deepEqual(core("Well Name,Gene,Ct (dRn)"), [0, 1, 2]);
  assert.deepEqual(core("Sample ID,Assay,Cp"), [0, 1, 2]);
  assert.equal(normalizeHeader("  Cт  Mean "), "ct mean");
  // no sample column: the well doubles as the sample
  const w = resolveCqHeaders(["Well", "Target", "Ct"]);
  assert.deepEqual([w.sample, w.well, w.target, w.cq], [0, 0, 1, 2]);
});

test("the header row is found under an instrument preamble", () => {
  const m = [["* Block Type = 96-Well Block (0.2mL)"], ["* Chemistry = SYBR_GREEN"], [""],
    ["[Results]"], ["Well", "Sample Name", "Target Name", "CT"], ["1", "Ctrl 1", "GAPDH", "18.2"]];
  const h = findCqHeader(m)!;
  assert.equal(h.row, 4);
  assert.equal(h.complete, true);
  assert.equal(findCqHeader([["a", "b"], ["1", "2"]]), null);
});

test("mapping guess when the headers do not name the sample (Livak's tissue column)", () => {
  const headers = ["tissue", "replicate", "target", "Ct"];
  const rows = [["Brain", "1", "c-myc", "30.72"], ["Kidney", "1", "GAPDH", "22.76"]];
  const h = findCqHeader([headers, ...rows])!;
  assert.equal(h.complete, false);
  const g = guessCqMapping(headers, rows);
  assert.deepEqual([g.sample, g.target, g.cq], [0, 2, 3]);
  const t = tableFromStaging(headers, rows, false, g);
  const d = readQpcr(t, DEFAULT_QPCR_OPTIONS);
  assert.deepEqual(d.records.map((r) => [r.sample, r.target, r.cq]), [["Brain", "c-myc", "30.72"], ["Kidney", "GAPDH", "22.76"]]);
});

test("undetermined wells: any text in the Cq column", () => {
  for (const v of ["Undetermined", "No Ct", "NaN", "N/A", "-", "undet."]) assert.ok(isUndeterminedCq(v), v);
  for (const v of ["", "18.2", "18,2", " 30 "]) assert.ok(!isUndeterminedCq(v), v);
});

test("the qPCR table's column roles accept the same spellings", () => {
  const t = longTable([
    { name: "Sample Name", varType: "categorical", values: ["S1"] },
    { name: "Condition", varType: "categorical", values: ["A"] },
    { name: "Gene Name", varType: "categorical", values: ["T"] },
    { name: "Cт", varType: "continuous", values: ["20"] },
    { name: "Well Position", varType: "categorical", values: ["A1"] },
  ]);
  const idx = resolveColumns(t, QPCR_ROLES);
  assert.deepEqual([idx.sample, idx.group, idx.target, idx.cq, idx.well], [0, 1, 2, 3, 4]);
});
