// ROC curve analysis of column tables: AUC with its CI, the optimal
// cut-off (Youden, closest to the top-left corner, cost- and
// prevalence-weighted) with sensitivity, specificity, likelihood ratios
// and predictive values (bootstrap CIs on request), partial AUC, binormal
// smoothing, and DeLong's comparison of two markers (paired or unpaired).
// Pure; engine handlers roc, roc_cutoff and roc_compare
// (engine/opendose/api.py, methodcomp.py).
import { numericData } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";

export const ANALYSIS_ROC = "roc_curve";

export type RocCriterion = "youden" | "closest_topleft";

export interface RocOptions {
  patients: number;
  controls: number;
  /** Higher values indicate the condition (else lower values do). */
  higherAbnormal: boolean;
  compare: boolean;
  patients2: number;
  controls2: number;
  higherAbnormal2: boolean;
  /** Both markers measured on the same subjects (rows line up). */
  paired: boolean;
  criterion: RocCriterion;
  /** Cost of a false negative relative to a false positive. */
  costRatio: string;
  /** Prevalence for the weighting and predictive values ("" = sample). */
  prevalence: string;
  bootstrap: string;
  seed: string;
  partial: boolean;
  partialFocus: "specificity" | "sensitivity";
  partialFrom: string;
  partialTo: string;
  partialCorrect: boolean;
  binormal: boolean;
  ciLevel: string;
}

export function defaultRocOptions(table?: DataTableModel): RocOptions {
  const n = table?.datasets.length ?? 2;
  return {
    patients: 0, controls: Math.min(1, n - 1), higherAbnormal: true,
    compare: n >= 4, patients2: Math.min(2, n - 1), controls2: Math.min(3, n - 1),
    higherAbnormal2: true, paired: true,
    criterion: "youden", costRatio: "1", prevalence: "", bootstrap: "0", seed: "1",
    partial: false, partialFocus: "specificity", partialFrom: "90", partialTo: "100",
    partialCorrect: false, binormal: false, ciLevel: "95",
  };
}

export function normalizeRocOptions(raw: unknown, table?: DataTableModel): RocOptions {
  const d = defaultRocOptions(table);
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Record<string, unknown>;
  const out = { ...d } as Record<string, unknown>;
  for (const k of Object.keys(d) as (keyof RocOptions)[]) {
    if (typeof r[k] === typeof d[k]) out[k] = r[k];
  }
  const o = out as unknown as RocOptions;
  if (o.criterion !== "youden" && o.criterion !== "closest_topleft") o.criterion = "youden";
  if (o.partialFocus !== "specificity" && o.partialFocus !== "sensitivity") o.partialFocus = "specificity";
  return o;
}

const numOr = (s: string, d: number) => {
  const n = Number(String(s).trim());
  return String(s).trim() !== "" && Number.isFinite(n) ? n : d;
};

export function ciFraction(s: string): number {
  const v = numOr(s, 95);
  const pct = v < 1 ? v * 100 : v;
  return Math.min(99.99, Math.max(50, pct)) / 100;
}

/** Fraction from a percent or fraction ("90" or "0.9"), clamped to 0-1. */
const frac = (s: string, d: number) => {
  const v = numOr(s, d);
  return Math.min(1, Math.max(0, v > 1 ? v / 100 : v));
};

/** A marker's display name: what its patient and control columns share
 *  ("WFNS, poor outcome" + "WFNS, good outcome" -> "WFNS"), else the
 *  patients column's name. */
export function markerName(table: DataTableModel, patients: number, controls: number): string {
  const a = table.datasets[patients]?.name.trim() ?? "";
  const b = table.datasets[controls]?.name.trim() ?? "";
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const common = a.slice(0, i).replace(/[\s,:;–—-]+$/, "").trim();
  if (common.length >= 2 && i < a.length) {
    // cut back to a word boundary
    const atBoundary = /[\s,:;–—-]/.test(a[i] ?? " ") || /[\s,:;–—-]$/.test(a.slice(0, i));
    if (atBoundary) return common;
  }
  return a || `Data set ${patients + 1}`;
}

/** Names of the curves (Format graph's data sets), as the plot names them. */
export function rocCurveNames(table: DataTableModel, o: RocOptions | null): string[] {
  if (!o) return [];
  const names = [markerName(table, o.patients, o.controls)];
  if (o.compare) names.push(markerName(table, o.patients2, o.controls2));
  return names;
}

export interface RocPayloads {
  roc: unknown[];
  cutoff: unknown[];
  compare?: unknown;
  names: string[];
}

function cutoffOptions(o: RocOptions, p: number, c: number, hia: boolean, first: boolean) {
  const prevalence = o.prevalence.trim() === "" ? undefined : frac(o.prevalence, 0.5);
  const lo = frac(o.partialFrom, 0.9);
  const hi = frac(o.partialTo, 1);
  return {
    patients: p, controls: c, higher_is_abnormal: hia,
    method: o.criterion,
    cost_ratio: Math.max(1e-6, numOr(o.costRatio, 1)),
    ...(prevalence !== undefined ? { prevalence } : {}),
    // bootstrap the first marker only (it is the slow part)
    bootstrap: first ? Math.max(0, Math.min(10000, Math.round(numOr(o.bootstrap, 0)))) : 0,
    seed: Math.round(numOr(o.seed, 1)),
    ci_level: ciFraction(o.ciLevel),
    ...(o.partial ? { partial_auc: {
      limits: [Math.max(lo, hi), Math.min(lo, hi)], focus: o.partialFocus,
      correct: o.partialCorrect } } : {}),
    ...(o.binormal ? { binormal: true } : {}),
  };
}

/** Engine payloads for the analysis, or why it cannot run. */
export function rocPayloads(table: DataTableModel, o: RocOptions): RocPayloads | { error: string } {
  const n = table.datasets.length;
  const ok = (i: number) => Number.isInteger(i) && i >= 0 && i < n;
  if (n < 2) return { error: "An ROC curve needs two columns: patients (condition present) and controls." };
  if (!ok(o.patients) || !ok(o.controls) || o.patients === o.controls) {
    return { error: "Choose two different columns for patients and controls." };
  }
  const data = numericData(table);
  const ci_level = ciFraction(o.ciLevel);
  const names = [markerName(table, o.patients, o.controls)];
  const out: RocPayloads = {
    roc: [{ analysis: "roc", data, options: {
      patients: o.patients, controls: o.controls, higher_is_abnormal: o.higherAbnormal } }],
    cutoff: [{ analysis: "roc_cutoff", data,
      options: cutoffOptions(o, o.patients, o.controls, o.higherAbnormal, true) }],
    names,
  };
  if (o.compare) {
    if (!ok(o.patients2) || !ok(o.controls2) || o.patients2 === o.controls2) {
      return { error: "Choose two different columns for the second marker's patients and controls." };
    }
    if (o.patients2 === o.patients && o.controls2 === o.controls) {
      return { error: "The second marker uses the same columns as the first." };
    }
    names.push(markerName(table, o.patients2, o.controls2));
    out.roc.push({ analysis: "roc", data, options: {
      patients: o.patients2, controls: o.controls2, higher_is_abnormal: o.higherAbnormal2 } });
    out.cutoff.push({ analysis: "roc_cutoff", data,
      options: cutoffOptions(o, o.patients2, o.controls2, o.higherAbnormal2, false) });
    out.compare = { analysis: "roc_compare", data, options: {
      curves: [[o.patients, o.controls], [o.patients2, o.controls2]], paired: o.paired,
      higher_is_abnormal: [o.higherAbnormal, o.higherAbnormal2], ci_level } };
  }
  return out;
}

// ------------------------------------------------------------ results

export interface RocPoint { cutoff: number; sensitivity: number; specificity: number }

export interface RocThreshold {
  threshold: number | null; sensitivity: number; specificity: number;
  tp: number; fn: number; tn: number; fp: number; youden: number;
  lr_positive: number | null; lr_negative: number | null;
  ppv: number | null; npv: number | null;
  sensitivity_ci?: [number, number]; specificity_ci?: [number, number];
}

export interface RocCutoff {
  method: RocCriterion; cost_ratio: number; prevalence: number | null; weight_r: number;
  n_patients: number; n_controls: number;
  optimal: RocThreshold; ties: number[]; thresholds: RocThreshold[];
  bootstrap?: { replicates: number; seed: number; threshold_ci: [number, number];
    sensitivity_ci: [number, number]; specificity_ci: [number, number]; youden_ci: [number, number] };
  partial_auc?: { focus: string; limits: [number, number]; partial_auc: number; max: number;
    chance: number; corrected?: number | null; warning?: string };
  binormal?: { a: number; b: number; auc: number;
    best: { sensitivity: number; specificity: number };
    curve: { sensitivity: number[]; specificity: number[] } };
}

export interface RocCurveResult {
  name: string;
  patients: string;
  controls: string;
  higherAbnormal: boolean;
  n_patients: number;
  n_controls: number;
  auc: { value: number; se: number; ci: [number, number]; p_vs_05: number };
  points: RocPoint[];
  cutoff: RocCutoff | null;
  cutoffError?: string;
}

export interface RocCompareResult {
  method: "delong_paired" | "delong_unpaired";
  auc: [number, number]; se: [number, number]; correlation?: number | null;
  difference: number; se_difference: number; ci: [number, number];
  statistic: number; statistic_name: "Z" | "D"; df?: number; p: number;
  n_patients?: number; n_controls?: number;
}

export interface RocResult {
  error?: string;
  analysis: "roc_curve";
  ci_level: number;
  curves: RocCurveResult[];
  compare?: RocCompareResult;
  compareError?: string;
  options: RocOptions;
}

type Engine = { analyze: (p: unknown) => unknown };
type Raw = Record<string, unknown> & { error?: string };

export function runRoc(engine: Engine, table: DataTableModel, o: RocOptions): RocResult {
  const fail = (error: string) => ({ error } as RocResult);
  if (table.subcolumnFormat !== "replicates") {
    return fail("ROC curves need the individual values, not means with errors.");
  }
  const p = rocPayloads(table, o);
  if ("error" in p) return fail(p.error);
  const curves: RocCurveResult[] = [];
  for (let i = 0; i < p.roc.length; i++) {
    const r = engine.analyze(p.roc[i]) as Raw;
    if (r.error) return fail(`${p.names[i]}: ${String(r.error)}`);
    const c = engine.analyze(p.cutoff[i]) as Raw;
    const opt = (p.roc[i] as { options: { patients: number; controls: number; higher_is_abnormal: boolean } }).options;
    curves.push({
      name: p.names[i],
      patients: table.datasets[opt.patients]?.name ?? "",
      controls: table.datasets[opt.controls]?.name ?? "",
      higherAbnormal: opt.higher_is_abnormal,
      n_patients: r.n_patients as number,
      n_controls: r.n_controls as number,
      auc: r.auc as RocCurveResult["auc"],
      points: r.points as RocPoint[],
      cutoff: c.error ? null : c as unknown as RocCutoff,
      ...(c.error ? { cutoffError: String(c.error) } : {}),
    });
  }
  const out: RocResult = { analysis: "roc_curve", ci_level: ciFraction(o.ciLevel), curves, options: o };
  if (p.compare) {
    const c = engine.analyze(p.compare) as Raw;
    if (c.error) out.compareError = String(c.error);
    else out.compare = c as unknown as RocCompareResult;
  }
  return out;
}

/** ROC curve points in plotting order (100 − specificity, sensitivity),
 *  both in percent, from (0, 0) to (100, 100). */
export function curveXY(points: RocPoint[]): { x: number[]; y: number[]; cut: number[] } {
  const pts = points.map((p) => ({ x: 100 * (1 - p.specificity), y: 100 * p.sensitivity, c: p.cutoff }))
    .sort((a, b) => a.x - b.x || a.y - b.y);
  return { x: pts.map((p) => p.x), y: pts.map((p) => p.y), cut: pts.map((p) => p.c) };
}

/** Polygon under the empirical curve between two X values (percent),
 *  for shading a partial AUC (interpolated at the edges). */
export function regionUnder(xs: number[], ys: number[], x0: number, x1: number):
  { x: number[]; y: number[] } {
  const lo = Math.min(x0, x1);
  const hi = Math.max(x0, x1);
  const at = (x: number) => {
    // the step curve may be vertical: take the highest y at x
    let best = 0;
    for (let i = 0; i < xs.length; i++) {
      if (xs[i] === x) best = Math.max(best, ys[i]);
      if (i > 0 && xs[i - 1] < x && xs[i] > x) {
        const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
        best = Math.max(best, ys[i - 1] + t * (ys[i] - ys[i - 1]));
      }
    }
    return best;
  };
  const px = [lo];
  const py = [at(lo)];
  xs.forEach((x, i) => { if (x > lo && x < hi) { px.push(x); py.push(ys[i]); } });
  px.push(hi);
  py.push(at(hi));
  return { x: [lo, ...px, hi], y: [0, ...py, 0] };
}
