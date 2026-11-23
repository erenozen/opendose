// The assay tables the "Analysed" line readers (kit/analysed.ts, P-16)
// are checked on: each module's example (the table the e2e suite starts
// from) and a copy with rows, wells and cells the analysis leaves out
// (blank, text, excluded, out of range, controls). Shared by the fixture
// generator (analysedFixtures.gen.ts, which runs the engine natively) and
// the unit test (analysed.test.ts, which replays the recorded results).
import { normalizeTable } from "../../../project/table.ts";
import type { DataTableModel } from "../../../project/types.ts";
import { DEFAULT_DENS_OPTIONS, normalizeDensOptions, runDens } from "../densitometry/model.ts";
import { densitometrySample } from "../densitometry/sample.ts";
import { DEFAULT_FLOW_OPTIONS, normalizeFlowOptions, runFlow } from "../flow/model.ts";
import { flowSample } from "../flow/sample.ts";
import { DEFAULT_KINETIC, normalizeKinetic, runKinetic } from "../kinetic/model.ts";
import { kineticSample } from "../kinetic/sample.ts";
import { DEFAULT_LUC_OPTIONS, normalizeLucOptions, runLuc } from "../luciferase/model.ts";
import { luciferaseSample } from "../luciferase/sample.ts";
import { DEFAULT_MIC, normalizeMic, runMic } from "../mic/model.ts";
import { micSample } from "../mic/sample.ts";
import { DEFAULT_PLATE_OPTIONS, normalizePlateOptions, rowsLayout, runPlateQc } from "../plate/model.ts";
import { plateSample } from "../plate/sample.ts";
import { DEFAULT_QPCR_OPTIONS, normalizeQpcrOptions, runQpcr } from "../qpcr/model.ts";
import { qpcrSample } from "../qpcr/sample.ts";
import { DEFAULT_STD_OPTIONS, normalizeStdOptions, runStdCurve } from "../stdcurve/model.ts";
import { stdcurveSample } from "../stdcurve/sample.ts";
import { DEFAULT_WOUND, normalizeWound, runWound } from "../wound/model.ts";
import { woundSample } from "../wound/sample.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface AnalysedCase {
  key: string;
  analysisId: string;
  table: DataTableModel;
  options: unknown;
  run: (analyze: (p: unknown) => unknown) => unknown;
}

/** Set one cell (data set `ds`, row `r`, subcolumn `s`). */
function put(t: DataTableModel, ds: number, r: number, v: string, s = 0): DataTableModel {
  return { ...t, datasets: t.datasets.map((d, i) => (i !== ds ? d : {
    ...d, rows: d.rows.map((row, k) => (k !== r ? row : row.map((c, j) => (j === s ? v : c)))),
  })) };
}
function exclude(t: DataTableModel, ds: number, r: number, s = 0): DataTableModel {
  return { ...t, datasets: t.datasets.map((d, i) => (i !== ds ? d
    : { ...d, excluded: [...(d.excluded ?? []), `${r}:${s}`] })) };
}
/** Append a row to a long (one value per data set) table. */
function addRow(t: DataTableModel, values: string[]): DataTableModel {
  return normalizeTable({ ...t, x: [...t.x, ""], rowTitles: [...(t.rowTitles ?? []), ""],
    datasets: t.datasets.map((d, i) => ({ ...d, rows: [...d.rows, [values[i] ?? ""]] })) });
}
const col = (t: DataTableModel, name: string) => t.datasets.findIndex((d) => d.name === name);

function stdcurve(key: string, t: DataTableModel, raw: object): AnalysedCase {
  const o = normalizeStdOptions({ ...DEFAULT_STD_OPTIONS, ...raw });
  return { key, analysisId: "assay_stdcurve", table: t, options: o, run: (a) => runStdCurve(a, t, o) };
}
function qpcr(key: string, t: DataTableModel, raw: object): AnalysedCase {
  const o = normalizeQpcrOptions({ ...DEFAULT_QPCR_OPTIONS, referenceGenes: ["GAPDH", "ACTB"], ...raw });
  return { key, analysisId: "assay_qpcr", table: t, options: o, run: (a) => runQpcr(a, t, o) };
}

export function analysedCases(): AnalysedCase[] {
  const out: AnalysedCase[] = [];

  // standard curve: a signal that is not a number, an unknown row with no
  // signal, an excluded standard replicate, a level left out by the user,
  // a row typed "skip"
  out.push(stdcurve("stdcurve_example", stdcurveSample(), {}));
  {
    let t = stdcurveSample();
    const s2 = col(t, "Signal 2");
    const s1 = col(t, "Signal 1");
    t = put(t, s2, 10, "n/a");
    t = put(put(t, s1, 12, ""), s2, 12, "");
    t = exclude(t, s1, 0);
    t = put(t, col(t, "Type"), 13, "skip");
    out.push(stdcurve("stdcurve_drops", t, { excludeLevels: [7.81] }));
  }

  // qPCR: an "Undetermined" Cq, a blank Cq, an excluded Cq, a Cq above the
  // limit with high Cq excluded, an NTC that amplified and a row without
  // a target
  out.push(qpcr("qpcr_example", qpcrSample(), {}));
  // the reference check's "Use GAPDH only" (e2e-assays): ACTB set aside
  out.push(qpcr("qpcr_gapdh_only", qpcrSample(), { referenceGenes: ["GAPDH"],
    referenceCandidates: ["GAPDH", "ACTB"] }));
  {
    let t = qpcrSample();
    const cq = col(t, "Cq");
    t = put(t, cq, 6, "Undetermined");
    t = put(t, cq, 7, "");
    t = exclude(t, cq, 9);
    t = put(t, cq, 13, "36.2");
    t = addRow(t, ["NTC", "", "GAPDH", "34", "P1"]);
    t = addRow(t, ["CON-1", "Control", "", "25.1", "P2"]);
    out.push(qpcr("qpcr_drops", t, { excludeHighCq: true }));
  }

  // flow: a row without a sample name, a name with no condition part, a
  // value that is not a number
  {
    const o = normalizeFlowOptions(DEFAULT_FLOW_OPTIONS);
    const t = flowSample();
    out.push({ key: "flow_example", analysisId: "assay_flow", table: t, options: o, run: (a) => runFlow(a, t, o) });
    let v = put(t, 1, 4, "n/a");
    v = put(v, 0, 7, "");
    v = addRow(v, ["D2.fcs", "5.5", "500", "1000"]);
    out.push({ key: "flow_drops", analysisId: "assay_flow", table: v, options: o, run: (a) => runFlow(a, v, o) });
  }

  // densitometry: a target that is not a number, a lane below background,
  // a lane without a loading-control value
  {
    const o = normalizeDensOptions(DEFAULT_DENS_OPTIONS);
    const t = densitometrySample();
    out.push({ key: "dens_example", analysisId: "assay_densitometry", table: t, options: o, run: (a) => runDens(a, t, o) });
    let v = put(t, col(t, "Target"), 1, "n/a");
    v = put(v, col(v, "Target background"), 4, "99999");
    v = put(v, col(v, "Loading control"), 6, "");
    out.push({ key: "dens_drops", analysisId: "assay_densitometry", table: v, options: o, run: (a) => runDens(a, v, o) });
    // the loading-control column chosen, no value in any lane
    let n = t;
    for (let row = 0; row < 16; row++) n = put(n, col(n, "Loading control"), row, "");
    out.push({ key: "dens_no_reference", analysisId: "assay_densitometry", table: n, options: o,
      run: (a) => runDens(a, n, o) });
  }

  // plate: a blank sample well, a text reading, an excluded control well,
  // a reading in a well the map leaves empty (a sample well without its
  // concentration is refused before the engine: mapProblem)
  {
    const o = normalizePlateOptions({ ...DEFAULT_PLATE_OPTIONS, wells: rowsLayout() });
    const t = plateSample();
    out.push({ key: "plate_example", analysisId: "assay_plate", table: t, options: o, run: (a) => runPlateQc(a, t, o) });
    let v = put(t, 3, 0, "");          // D1 -> A4 (column 4, row A)
    v = put(v, 4, 1, "OVRFLW");        // B5
    v = exclude(v, 0, 2);              // C1 (blank)
    const wells = { ...rowsLayout() };
    delete wells.H11;
    const ov = normalizePlateOptions({ ...DEFAULT_PLATE_OPTIONS, wells });
    out.push({ key: "plate_drops", analysisId: "assay_plate", table: v, options: ov, run: (a) => runPlateQc(a, v, ov) });
  }

  // kinetic: a well with one read left, a read that is not a number, an
  // excluded read
  {
    const o = normalizeKinetic(DEFAULT_KINETIC);
    const t = kineticSample();
    out.push({ key: "kinetic_example", analysisId: "assay_kinetic_rates", table: t, options: o,
      run: (a) => runKinetic(a, t, o) });
    let v = t;
    for (let r = 1; r < t.x.length; r++) v = put(v, 1, r, "", 1);   // "25", well 2: one read
    v = put(v, 3, 2, "sat", 0);                                     // "100", well 1, row 3
    v = exclude(v, 4, 1, 2);                                        // "200", well 3, row 2
    out.push({ key: "kinetic_drops", analysisId: "assay_kinetic_rates", table: v, options: o,
      run: (a) => runKinetic(a, v, o) });
  }

  // luciferase: a row without a group, a row without readings, a well
  // whose Renilla is missing
  {
    const o = normalizeLucOptions(DEFAULT_LUC_OPTIONS);
    const t = luciferaseSample();
    out.push({ key: "luc_example", analysisId: "assay_luciferase", table: t, options: o, run: (a) => runLuc(a, t, o) });
    let v = put(t, col(t, "Group"), 5, "");
    v = put(put(v, col(v, "Firefly"), 8, ""), col(v, "Renilla"), 8, "");
    v = put(v, col(v, "Renilla"), 10, "");
    out.push({ key: "luc_drops", analysisId: "assay_luciferase", table: v, options: o, run: (a) => runLuc(a, v, o) });
  }

  // wound: a well with one value left, a value that is not a number
  {
    const o = normalizeWound(DEFAULT_WOUND);
    const t = woundSample();
    out.push({ key: "wound_example", analysisId: "assay_wound_healing", table: t, options: o,
      run: (a) => runWound(a, t, o) });
    let v = t;
    for (let r = 1; r < t.x.length; r++) v = put(v, 1, r, "", 3);  // siRNA well 4
    v = put(v, 2, 2, "n/a", 0);                                     // TGF-β well 1, row 3
    out.push({ key: "wound_drops", analysisId: "assay_wound_healing", table: v, options: o,
      run: (a) => runWound(a, v, o) });
  }

  // MIC: a dilution series with no readings, a reading that is not a number
  {
    const o = normalizeMic(DEFAULT_MIC);
    const t = micSample();
    out.push({ key: "mic_example", analysisId: "assay_mic", table: t, options: o, run: (a) => runMic(a, t, o) });
    let v = t;
    for (let r = 0; r < t.x.length; r++) v = put(v, 2, r, "", 2);  // Isolate 3, series 3
    v = put(v, 0, 4, "n/a", 1);                                     // Isolate 1, series 2, row 5
    out.push({ key: "mic_drops", analysisId: "assay_mic", table: v, options: o, run: (a) => runMic(a, v, o) });
  }
  return out;
}

/** The recorded fixture file (analysedFixtures.gen.ts). */
export const FIXTURE_FILE = "analysed.fixtures.json";

/** The engine results of one case, in the order its run asked for them. */
export interface RecordedCase { payloads: unknown[]; results: any[] }
