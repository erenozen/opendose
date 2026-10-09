// Comparing fits on an XY table, two ways:
//  - "models": two models (or one model with and without a parameter held
//    constant) fitted to each data set, compared by the engine's
//    `compare_fits` handler: the extra-sum-of-squares F test when the
//    models are nested (the simpler has more degrees of freedom) and
//    Akaike's criterion corrected for small samples (AICc) either way;
//  - "global": one curve for all data sets (every parameter shared: the
//    data sets pooled into one fit) against a separate curve for each
//    (each data set fitted on its own), compared here with the same
//    F test and AICc as the engine (fitStats.ts);
//  - "parameter": one parameter (logEC50, Hill slope, Top ...) of model 1
//    between two chosen data sets, by the engine's `compare_parameter`
//    (difference / ratio with CI, F test and AICc for sharing it;
//    compareParameter.ts).
// The result keeps the per-data-set fit shape the XY graph draws (model 1
// or the separate curves as `fit`, the other model's curve under
// `altCurves`). Pure: unit-tested with node --test.
import { numericData } from "../../project/table.ts";
import { SUBCOLUMN_FORMAT_ENGINE, type DataTableModel } from "../../project/types.ts";
import type { ConstraintState, ErrorBarKind } from "../../types.ts";
import { MODELS_META, modelMeta, modelsByFamily, type ModelMeta } from "../../lib/modelLibrary.ts";
import {
  compareAicc, extraSumOfSquaresF, type AiccComparison, type FTest,
} from "./fitStats.ts";
import { comparableParameters, defaultParameter, runParameter } from "./compareParameter.ts";
import { tQuantile } from "../grouped/stats.ts";

export const ANALYSIS_COMPARE = "compare_fits";
export const GRAPH_COMPARE = "compare_fits_xy";

export type CompareMode = "models" | "global" | "parameter";
/** Which comparison to report: both, the F test (nested models) or AICc
 *  only (models that are not nested). */
export type CompareMethod = "both" | "f" | "aicc";

export interface CompareOptions {
  mode: CompareMode;
  /** Model 1 (and the model of the "global" comparison). */
  model1: string;
  model2: string;
  constraints1: Record<string, ConstraintState>;
  constraints2: Record<string, ConstraintState>;
  method: CompareMethod;
  /** X values are already log10(concentration) (log-X models). */
  xIsLog: boolean;
  errorBars: ErrorBarKind;
  /** "parameter" mode: the parameter compared ("" = the model's midpoint,
   *  logEC50 / logIC50) and the two data sets (indices into the table's
   *  data sets; the ratio is B / A). */
  parameter: string;
  datasetA: number;
  datasetB: number;
}

export const DEFAULT_COMPARE: CompareOptions = {
  mode: "models",
  model1: "log_inhibitor_vs_response_3pl",
  model2: "log_inhibitor_vs_response_4pl",
  constraints1: {}, constraints2: {},
  method: "both", xIsLog: false, errorBars: "sd",
  parameter: "", datasetA: 0, datasetB: 1,
};

const isConstraints = (v: unknown): v is Record<string, ConstraintState> =>
  !!v && typeof v === "object" && !Array.isArray(v);

export function normalizeCompare(raw: unknown): CompareOptions {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<CompareOptions>;
  return {
    mode: r.mode === "global" || r.mode === "parameter" ? r.mode : "models",
    model1: typeof r.model1 === "string" && r.model1 ? r.model1 : DEFAULT_COMPARE.model1,
    model2: typeof r.model2 === "string" && r.model2 ? r.model2 : DEFAULT_COMPARE.model2,
    constraints1: isConstraints(r.constraints1) ? r.constraints1 : {},
    constraints2: isConstraints(r.constraints2) ? r.constraints2 : {},
    method: r.method === "f" || r.method === "aicc" ? r.method : "both",
    xIsLog: !!r.xIsLog,
    errorBars: (["sd", "sem", "ci95", "range", "none"] as const).includes(r.errorBars as ErrorBarKind)
      ? r.errorBars as ErrorBarKind : "sd",
    parameter: typeof r.parameter === "string" ? r.parameter : "",
    datasetA: Number.isInteger(r.datasetA) && (r.datasetA as number) >= 0 ? r.datasetA as number : 0,
    datasetB: Number.isInteger(r.datasetB) && (r.datasetB as number) >= 0 ? r.datasetB as number : 1,
  };
}

/** Library models this comparison can fit to one data set at a time
 *  (not global-only models, nor models needing typed-in constants). */
export function comparable(m: ModelMeta): boolean {
  return !m.globalOnly && !(m.datasetConstants?.length) && !(m.constants?.length) && !m.special;
}

export function comparableModels(): { family: string; models: ModelMeta[] }[] {
  return modelsByFamily().map((g) => ({ family: g.family, models: g.models.filter(comparable) }))
    .filter((g) => g.models.length);
}

/** Held-constant parameters of a model from the options' constraint rows. */
export function constraintValues(meta: ModelMeta, c: Record<string, ConstraintState>):
  Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of meta.constrainable) {
    const st = c[p];
    if (!st?.enabled) continue;
    const t = (st.value ?? "").trim();
    const v = t === "" ? NaN : Number(t);
    if (Number.isFinite(v)) out[p] = v;
  }
  return out;
}

/** Label of a model with its held-constant parameters. */
export function modelLabel(meta: ModelMeta, held: Record<string, number>): string {
  const h = Object.entries(held).map(([k, v]) => `${k} = ${v}`);
  return h.length ? `${meta.label} (${h.join(", ")})` : meta.label;
}

export interface ModelRow { label: string; ss: number; df: number; k: number }

export interface CompareRow {
  name: string;
  error?: string;
  n?: number;
  models?: [ModelRow, ModelRow];
  /** F test, simpler model = the one with more degrees of freedom. */
  f?: (FTest & { simpler: 1 | 2 }) | null;
  aicc?: AiccComparison | null;
}

/** The model the chosen method prefers (alpha = 0.05 for the F test):
 *  `by` says which test decided. */
export function preferred(row: CompareRow, method: CompareMethod):
  { by: "f" | "aicc"; model: 1 | 2 } | null {
  if (method !== "aicc" && row.f && Number.isFinite(row.f.p)) {
    const complex = row.f.simpler === 1 ? 2 : 1;
    return { by: "f", model: row.f.p < 0.05 ? complex : row.f.simpler };
  }
  if (method !== "f" && row.aicc) return { by: "aicc", model: row.aicc.prefer };
  return null;
}

/** One curve for all data sets vs one per data set, from the two fits'
 *  sums of squares and degrees of freedom. */
export function globalComparison(pooled: { ss: number; df: number; n: number },
  separate: { ss: number; df: number; n: number }[]):
  { n: number; models: [ModelRow, ModelRow]; f: (FTest & { simpler: 1 | 2 }) | null; aicc: AiccComparison } {
  const ss2 = separate.reduce((a, s) => a + s.ss, 0);
  const df2 = separate.reduce((a, s) => a + s.df, 0);
  const n = separate.reduce((a, s) => a + s.n, 0);
  const k1 = pooled.n - pooled.df, k2 = n - df2;
  const f = extraSumOfSquaresF(pooled.ss, pooled.df, ss2, df2);
  return {
    n,
    models: [
      { label: "One curve for all data sets", ss: pooled.ss, df: pooled.df, k: k1 },
      { label: "A separate curve for each data set", ss: ss2, df: df2, k: k2 },
    ],
    f: f ? { ...f, simpler: 1 } : null,
    aicc: compareAicc(pooled.ss, k1, ss2, k2, n),
  };
}

// ------------------------------------------------------------ engine runs

/* eslint-disable @typescript-eslint/no-explicit-any */
type Engine = { analyze: (p: any) => any };

/** Mean with error bars of each row (SD, SEM, 95% CI, range or none of
 *  the replicates; the entered SD or SEM of a summary table), with X on
 *  the scale the models fit (log10 for log-X models given
 *  concentrations). */
export function meanPoints(table: DataTableModel, logX: boolean, kind: ErrorBarKind = "sd") {
  const d = numericData(table);
  const fmt = table.subcolumnFormat;
  const x = d.x.map((v) => (v === null ? null : logX ? (v > 0 ? Math.log10(v) : null) : v));
  return d.datasets.map((ds) => ({
    x,
    bars: ds.ys.map((row) => {
      if (fmt !== "replicates") {
        const mean = row[0] ?? null;
        const err = kind !== "none" && (fmt.startsWith("mean_sd") || fmt.startsWith("mean_sem"))
          ? row[1] ?? null : null;
        return { mean, lo: mean !== null && err !== null ? mean - err : null,
          hi: mean !== null && err !== null ? mean + err : null, n: mean === null ? 0 : 1 };
      }
      const v = row.filter((y): y is number => y !== null);
      const n = v.length;
      if (!n) return { mean: null, lo: null, hi: null, n: 0 };
      const mean = v.reduce((a, b) => a + b, 0) / n;
      if (kind === "none") return { mean, lo: null, hi: null, n };
      if (kind === "range") return { mean, lo: Math.min(...v), hi: Math.max(...v), n };
      const sd = n > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : null;
      const half = sd === null ? null : kind === "sem" ? sd / Math.sqrt(n)
        : kind === "ci95" ? tQuantile(0.975, n - 1) * sd / Math.sqrt(n) : sd;
      return { mean, lo: half === null ? null : mean - half, hi: half === null ? null : mean + half, n };
    }),
  }));
}

function summaryOptions(table: DataTableModel): Record<string, unknown> {
  return table.subcolumnFormat !== "replicates"
    ? { summary_format: SUBCOLUMN_FORMAT_ENGINE[table.subcolumnFormat], replicates: "account" } : {};
}

const fail = (error: string) => ({ analysis: ANALYSIS_COMPARE, rows: [], datasets: [], error });

const kOf = (g: any) => (g?.n_points ?? 0) - (g?.df ?? 0);

function runModels(engine: Engine, table: DataTableModel, o: CompareOptions): any {
  const m1 = modelMeta(o.model1), m2 = modelMeta(o.model2);
  if (!MODELS_META[o.model1] || !MODELS_META[o.model2]) return fail("Choose two models from the list");
  if (m1.needsLogX !== m2.needsLogX) {
    return fail("The two models must read X the same way: choose two models of "
      + "log(concentration), or two models of X itself");
  }
  const c1 = constraintValues(m1, o.constraints1), c2 = constraintValues(m2, o.constraints2);
  const label1 = modelLabel(m1, c1), label2 = modelLabel(m2, c2);
  if (o.model1 === o.model2 && JSON.stringify(c1) === JSON.stringify(c2)) {
    return fail("Model 1 and model 2 are the same: choose another model, or hold a parameter "
      + "constant in one of them");
  }
  const data = numericData(table);
  const extra = summaryOptions(table);
  const pts = meanPoints(table, m1.needsLogX && !o.xIsLog, o.errorBars);
  const rows: CompareRow[] = [];
  const datasets: any[] = [];
  data.datasets.forEach((ds, i) => {
    const r = engine.analyze({
      analysis: "compare_fits",
      data,
      options: {
        dataset: i, x_is_log: o.xIsLog,
        model_1: { model: m1.engineId, constraints: c1, ...extra },
        model_2: { model: m2.engineId, constraints: c2, ...extra },
      },
    });
    const out: any = { name: ds.name, points: pts[i] };
    if (!r || r.error) {
      rows.push({ name: ds.name, error: String(r?.error ?? "no result") });
      datasets.push({ ...out, error: String(r?.error ?? "no result") });
      return;
    }
    const g1 = r.model_1.goodness, g2 = r.model_2.goodness;
    const f = r.f_test ? { F: r.f_test.F, dfn: r.f_test.dfn, dfd: r.f_test.dfd, p: r.f_test.p,
      simpler: r.f_test.simpler_model as 1 | 2 } : null;
    const a = r.aicc ? { aicc1: r.aicc.aicc_1, aicc2: r.aicc.aicc_2, delta: r.aicc.delta,
      probability1: r.aicc.probability_1, probability2: r.aicc.probability_2,
      prefer: r.aicc.prefer as 1 | 2 } : null;
    rows.push({
      name: ds.name, n: g1.n_points,
      models: [
        { label: label1, ss: g1.ss_res, df: g1.df, k: kOf(g1) },
        { label: label2, ss: g2.ss_res, df: g2.df, k: kOf(g2) },
      ],
      f, aicc: a,
    });
    datasets.push({
      ...out,
      fit: { ...r.model_1, label: `Model 1: ${label1}` },
      fit2: { ...r.model_2, label: `Model 2: ${label2}` },
      altCurves: [{ label: `${ds.name}, model 2`, curve: r.model_2.curve }],
    });
  });
  return { analysis: ANALYSIS_COMPARE, mode: "models", method: o.method,
    labels: [label1, label2], rows, datasets };
}

/** The table with its data sets stacked into one (X repeated per data
 *  set), so one fit treats every point alike: one curve for all. */
export function pooledData(data: ReturnType<typeof numericData>):
  { x: (number | null)[]; datasets: { name: string; ys: (number | null)[][] }[] } {
  return {
    x: data.datasets.flatMap(() => data.x),
    datasets: [{ name: "All data sets", ys: data.datasets.flatMap((d) => d.ys) }],
  };
}

function runGlobal(engine: Engine, table: DataTableModel, o: CompareOptions): any {
  const m = modelMeta(o.model1);
  if (!MODELS_META[o.model1]) return fail("Choose a model from the list");
  const data = numericData(table);
  const withData = data.datasets.filter((d) => d.ys.some((r) => r.some((v) => v !== null)));
  if (withData.length < 2) {
    return fail("Comparing one curve with separate curves needs two or more data sets with values");
  }
  const c = constraintValues(m, o.constraints1);
  const options = {
    model: m.engineId, x_is_log: o.xIsLog, error_bars: o.errorBars, constraints: c,
    ...summaryOptions(table),
  };
  const sep = engine.analyze({ analysis: "dose_response", data: { x: data.x, datasets: withData }, options });
  if (!sep || sep.error) return fail(String(sep?.error ?? "no result"));
  const bad = (sep.datasets ?? []).filter((d: any) => d.error || !d.fit);
  if (bad.length) {
    return fail(`Could not fit ${bad.map((d: any) => `${d.name}: ${d.error ?? "no fit"}`).join("; ")}`);
  }
  const pool = engine.analyze({ analysis: "dose_response",
    data: pooledData({ x: data.x, datasets: withData }), options });
  const pfit = pool?.datasets?.[0]?.fit;
  if (!pfit) return fail(`Could not fit one curve to all data sets: ${pool?.error ?? pool?.datasets?.[0]?.error ?? "no fit"}`);
  const cmp = globalComparison(
    { ss: pfit.goodness.ss_res, df: pfit.goodness.df, n: pfit.goodness.n_points },
    sep.datasets.map((d: any) => ({ ss: d.fit.goodness.ss_res, df: d.fit.goodness.df, n: d.fit.goodness.n_points })));
  const label = modelLabel(m, c);
  const row: CompareRow = { name: "All data sets", ...cmp };
  return {
    analysis: ANALYSIS_COMPARE, mode: "global", method: o.method, labels: [label, label],
    rows: [row], pooled: pfit,
    datasets: sep.datasets.map((d: any, i: number) => ({
      name: d.name, points: d.points, fit: { ...d.fit, label: `${label}, fitted to ${d.name} alone` },
      ...(i === 0 ? { altCurves: [{ label: "One curve for all data sets", curve: pfit.curve, ink: true }] } : {}),
    })),
  };
}

/** The parameter a "parameter" comparison uses with these options. */
export function chosenParameter(o: CompareOptions): string {
  const m = modelMeta(o.model1);
  return defaultParameter(comparableParameters(m, constraintValues(m, o.constraints1)), o.parameter);
}

function runOneParameter(engine: Engine, table: DataTableModel, o: CompareOptions): any {
  if (!MODELS_META[o.model1]) return fail("Choose a model from the list");
  const m = modelMeta(o.model1);
  return runParameter(engine, table, {
    model: m, held: constraintValues(m, o.constraints1), parameter: chosenParameter(o),
    datasetA: o.datasetA, datasetB: o.datasetB, xIsLog: o.xIsLog, errorBars: o.errorBars,
  });
}

export function runCompare(engine: Engine, table: DataTableModel, o: CompareOptions): any {
  if (o.mode === "parameter") return runOneParameter(engine, table, o);
  return o.mode === "global" ? runGlobal(engine, table, o) : runModels(engine, table, o);
}
