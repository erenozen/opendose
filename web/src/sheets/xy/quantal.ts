// Quantal (all-or-none) dose-response on XY tables: X = dose, and for
// each data set the number of responders and the number of subjects per
// dose. Probit, logit or complementary log-log on transformed dose,
// LD50 / ECx with Fieller and delta-method CIs, goodness of fit with the
// heterogeneity factor, natural (control) response, and parallel lines
// across data sets with relative potency (Finney 1971). Pure; engine
// handler quantal (engine/opendose/api.py, quantal.py).
import { numericData } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";

export const ANALYSIS_QUANTAL = "quantal";

export type QuantalLink = "probit" | "logit" | "cloglog";
export type QuantalTransform = "log10" | "ln" | "none";

export interface QuantalOptions {
  /** "subcolumns": each data set holds Y1 = responders, Y2 = N.
   *  "pairs": data sets come in pairs (responders, then N). */
  layout: "subcolumns" | "pairs";
  link: QuantalLink;
  doseTransform: QuantalTransform;
  natural: "none" | "estimate" | "fixed";
  naturalValue: string;
  ecLevels: string;
  heterogeneity: "auto" | "always" | "never";
  parallel: boolean;
  reference: number;
  ciLevel: string;
  /** Upper asymptote (the plateau the response levels off at): 1 (100%),
   *  a known proportion, or estimated (drc's binomial LL.3 d). */
  upper: "one" | "fixed" | "estimate";
  upperValue: string;
  /** Dose 0 rows with a log dose transform: the control group (natural
   *  response estimated from them unless set otherwise) or left out. */
  zeroDose: "control" | "omit";
  /** Standard errors from the expected (Fisher) or observed information
   *  (as drc). */
  information: "expected" | "observed";
}

export function defaultQuantalOptions(): QuantalOptions {
  return {
    layout: "subcolumns", link: "probit", doseTransform: "log10", natural: "none",
    naturalValue: "", ecLevels: "50", heterogeneity: "auto", parallel: false, reference: 0,
    ciLevel: "95", upper: "one", upperValue: "", zeroDose: "control", information: "expected",
  };
}

export function normalizeQuantalOptions(raw: unknown): QuantalOptions {
  const d = defaultQuantalOptions();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Record<string, unknown>;
  const out = { ...d } as Record<string, unknown>;
  for (const k of Object.keys(d) as (keyof QuantalOptions)[]) {
    if (typeof r[k] === typeof d[k]) out[k] = r[k];
  }
  const o = out as unknown as QuantalOptions;
  const one = <T extends string>(v: T, ok: readonly T[], dv: T) => (ok.includes(v) ? v : dv);
  o.layout = one(o.layout, ["subcolumns", "pairs"] as const, d.layout);
  o.link = one(o.link, ["probit", "logit", "cloglog"] as const, d.link);
  o.doseTransform = one(o.doseTransform, ["log10", "ln", "none"] as const, d.doseTransform);
  o.natural = one(o.natural, ["none", "estimate", "fixed"] as const, d.natural);
  o.heterogeneity = one(o.heterogeneity, ["auto", "always", "never"] as const, d.heterogeneity);
  o.upper = one(o.upper, ["one", "fixed", "estimate"] as const, d.upper);
  o.zeroDose = one(o.zeroDose, ["control", "omit"] as const, d.zeroDose);
  o.information = one(o.information, ["expected", "observed"] as const, d.information);
  return o;
}

/** ECx levels from "50, 90" (percent, 0 < x < 100). */
export function parseLevels(s: string): number[] {
  const out = s.split(/[,;\s]+/).map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0 && v < 100);
  return out.length ? [...new Set(out)] : [50];
}

const fraction = (s: string, d: number) => {
  const n = Number(String(s).trim());
  const v = String(s).trim() !== "" && Number.isFinite(n) ? n : d;
  return v > 1 ? v / 100 : v;
};

export interface QuantalGroup { name: string; dose: number[]; responders: number[]; n: number[] }

/** One line per data set (or pair of data sets), rows with a dose, a
 *  responder count and an N; others are skipped. */
export function quantalGroups(table: DataTableModel, o: QuantalOptions): QuantalGroup[] {
  const data = numericData(table);
  const groups: QuantalGroup[] = [];
  const push = (name: string, r: (number | null)[], n: (number | null)[]) => {
    const g: QuantalGroup = { name, dose: [], responders: [], n: [] };
    data.x.forEach((x, i) => {
      const ri = r[i];
      const ni = n[i];
      if (x === null || ri == null || ni == null) return;
      g.dose.push(x);
      g.responders.push(ri);
      g.n.push(ni);
    });
    groups.push(g);
  };
  if (o.layout === "pairs") {
    for (let d = 0; d + 1 < data.datasets.length; d += 2) {
      push(table.datasets[d].name || `Data set ${d + 1}`,
        data.datasets[d].ys.map((row) => row[0] ?? null),
        data.datasets[d + 1].ys.map((row) => row[0] ?? null));
    }
  } else {
    data.datasets.forEach((ds, d) => push(table.datasets[d].name || `Data set ${d + 1}`,
      ds.ys.map((row) => row[0] ?? null), ds.ys.map((row) => row[1] ?? null)));
  }
  return groups.filter((g) => g.dose.length > 0);
}

export type QuantalPayload = { analysis: "quantal"; data: unknown; options: Record<string, unknown> };

/** Rows of a group whose dose is above 0. */
function positiveDoses(g: QuantalGroup): QuantalGroup {
  const keep = g.dose.map((x) => x > 0);
  return {
    ...g,
    dose: g.dose.filter((_, i) => keep[i]),
    responders: g.responders.filter((_, i) => keep[i]),
    n: g.n.filter((_, i) => keep[i]),
  };
}

export function quantalPayload(table: DataTableModel, o: QuantalOptions):
  { error: string } | { payload: QuantalPayload; groups: QuantalGroup[]; notes: string[] } {
  if (table.subcolumnFormat !== "replicates") {
    return { error: "Quantal dose-response reads counts: enter responders and N as replicate subcolumns, not means with errors." };
  }
  let groups = quantalGroups(table, o);
  if (!groups.length) {
    return { error: o.layout === "pairs"
      ? "Each line needs two data sets: responders, then the number of subjects (N), with the doses in X."
      : "Each data set needs two subcolumns: Y1 = responders, Y2 = number of subjects (N), with the doses in X." };
  }
  const logDose = o.doseTransform !== "none";
  const parallel = o.parallel && groups.length > 1;
  for (const g of groups) {
    const bad = g.responders.findIndex((r, i) => r < 0 || r > g.n[i] || g.n[i] <= 0);
    if (bad >= 0) return { error: `${g.name}: at dose ${g.dose[bad]}, responders must be between 0 and N (N > 0).` };
    if (logDose && g.dose.some((x) => x < 0)) {
      return { error: `${g.name}: a negative dose cannot be log-transformed. Correct the dose or choose no dose transform.` };
    }
  }
  const notes: string[] = [];
  let natural: null | "estimate" | number = o.natural === "estimate" ? "estimate"
    : o.natural === "fixed" ? Math.min(0.99, Math.max(0, fraction(o.naturalValue, 0))) : null;
  const upper: null | "estimate" | number = parallel || o.upper === "one" ? null
    : o.upper === "estimate" ? "estimate"
      : Math.min(1, Math.max(0.01, fraction(o.upperValue, 1)));
  const hasZero = logDose && groups.some((g) => g.dose.some((x) => x === 0));
  if (hasZero) {
    // Dose 0 has no log: the engine uses such rows as the control group
    // when it models a natural response (they inform it alone) or an
    // upper asymptote (they sit on the plateau the curve reaches at dose
    // 0). Natural response 0 or a parallel-line fit cannot use them.
    const omit = o.zeroDose === "omit" || parallel || natural === 0;
    if (omit) {
      groups = groups.map(positiveDoses).filter((g) => g.dose.length > 0);
      notes.push(parallel && o.zeroDose !== "omit"
        ? "Dose 0 rows are left out: the parallel-line fit has no natural response to estimate from them."
        : "Dose 0 rows are left out of the fit (natural response 0).");
      if (!groups.length) return { error: "No dose above 0 is left to fit." };
    } else if (natural === null && upper === null) {
      natural = "estimate";
      notes.push("Dose 0 rows are used as the control: natural response estimated from them.");
    } else if (natural === null) {
      notes.push("Dose 0 rows are used as the control: they sit on the plateau the curve approaches as the dose goes to 0.");
    } else {
      notes.push(natural === "estimate"
        ? "Dose 0 rows are used as the control: natural response estimated from them."
        : "Dose 0 rows are used as the control, at the natural response entered.");
    }
  }
  const options: Record<string, unknown> = {
    link: o.link, dose_transform: o.doseTransform, natural_response: natural,
    ec_levels: parseLevels(o.ecLevels), ci_level: Math.min(0.9999, Math.max(0.5, fraction(o.ciLevel, 95))),
    heterogeneity: o.heterogeneity, parallel,
    ...(parallel ? { reference: Math.min(Math.max(0, o.reference), groups.length - 1) } : {}),
  };
  if (upper !== null) options.upper_asymptote = upper;
  if (o.information === "observed" && !parallel) options.information = "observed";
  return {
    groups,
    notes,
    payload: {
      analysis: "quantal",
      data: { groups: groups.map((g) => ({ name: g.name, dose: g.dose, responders: g.responders, n: g.n })) },
      options,
    },
  };
}

// ------------------------------------------------------------ results

export interface QuantalEc {
  level: number; x: number; se_x: number; x_ci_delta: [number, number];
  x_ci_fieller: [number | null, number | null] | null; g: number; dose: number;
  dose_ci_delta: [number, number]; dose_ci_fieller: [number | null, number | null] | null;
}

export interface QuantalFit {
  name: string;
  error?: string;
  link: QuantalLink;
  dose_transform: QuantalTransform;
  natural_response_mode: null | "estimate" | number;
  natural_response_used: number;
  natural_response?: { value: number; se?: number };
  upper_asymptote_mode?: null | "estimate" | number;
  upper_asymptote_used?: number;
  information?: "expected" | "observed";
  n_groups: number;
  n_total: number;
  parameters: Record<string, { value: number; se: number; ci: [number, number] }>;
  slope_test?: { statistic: number; p: number };
  goodness_of_fit: { pearson_chi2: number; deviance: number; df: number; p_pearson: number; p_deviance?: number };
  heterogeneity: { applied: boolean; factor: number; mode?: string; critical_value: number; distribution?: string };
  ec: QuantalEc[];
  table: { dose: number; x: number; n: number; responders: number; observed: number; expected: number; pearson_residual: number }[];
  curve: { x: number[]; dose: number[]; p: number[]; lower: number[]; upper: number[] };
  converged?: boolean;
  warnings?: string[];
}

export interface QuantalParallel {
  analysis: "quantal_parallel";
  link: QuantalLink;
  dose_transform: QuantalTransform;
  groups: { name: string; intercept: { value: number; se: number }; ec: QuantalEc[] }[];
  slope: { value: number; se: number; ci: [number, number] };
  parallelism: { chi2: number; df: number; p: number };
  separate_slopes: number[];
  goodness_of_fit: { pearson_chi2: number; deviance: number; df: number; p_pearson: number };
  heterogeneity: { applied: boolean; factor: number; critical_value: number };
  relative_potency: {
    group: string; reference: string; log_potency: number; se_log_potency: number;
    log_ci_fieller: [number | null, number | null] | null; log_ci_delta: [number, number];
    potency: number; potency_ci_fieller: [number | null, number | null] | null; potency_ci_delta: [number, number];
  }[];
  natural_response_used?: number;
  converged?: boolean;
  warnings?: string[];
}

export interface QuantalResult {
  error?: string;
  /** How dose 0 rows were used, and similar notes on the data. */
  notes?: string[];
  /** one fit per line (always filled when not parallel) */
  fits?: QuantalFit[];
  parallel?: QuantalParallel;
  groups: QuantalGroup[];
  options: QuantalOptions;
  ci_level: number;
}

type Engine = { analyze: (p: unknown) => unknown };

export function runQuantal(engine: Engine, table: DataTableModel, o: QuantalOptions): QuantalResult {
  const p = quantalPayload(table, o);
  if ("error" in p) return { error: p.error } as QuantalResult;
  const r = engine.analyze(p.payload) as Record<string, unknown> & { error?: string };
  if (r.error) return { error: String(r.error) } as QuantalResult;
  const base = { groups: p.groups, options: o, ci_level: p.payload.options.ci_level as number, notes: p.notes };
  if (r.analysis === "quantal_parallel") return { ...base, parallel: r as unknown as QuantalParallel };
  const fits = (r.datasets as QuantalFit[]) ?? [];
  if (fits.every((x) => x.error)) return { error: fits.map((x) => `${x.name}: ${x.error}`).join(" ") } as QuantalResult;
  return { ...base, fits };
}

// ------------------------------------------------------------ helpers for graphs

/** Standard normal CDF (Abramowitz & Stegun 7.1.26 via erf; |error| < 1.5e-7). */
export function normCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t
    + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/** Inverse link: probability of response at linear predictor eta. */
export function linkInverse(link: QuantalLink, eta: number): number {
  if (link === "probit") return normCdf(eta);
  if (link === "logit") return 1 / (1 + Math.exp(-eta));
  return 1 - Math.exp(-Math.exp(eta));
}

/** X on the model's scale for a dose. */
export function transformDose(t: QuantalTransform, dose: number): number {
  return t === "log10" ? Math.log10(dose) : t === "ln" ? Math.log(dose) : dose;
}

export function untransform(t: QuantalTransform, x: number): number {
  return t === "log10" ? 10 ** x : t === "ln" ? Math.exp(x) : x;
}

/** Wilson score interval for a proportion. */
export function wilson(x: number, n: number, level = 0.95): [number, number] {
  if (n <= 0) return [0, 1];
  const z = level >= 0.99 ? 2.5758 : level >= 0.95 ? 1.96 : level >= 0.9 ? 1.6449 : 1.96;
  const p = x / n;
  const den = 1 + z * z / n;
  const mid = (p + z * z / (2 * n)) / den;
  const half = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / den;
  return [Math.max(0, mid - half), Math.min(1, mid + half)];
}

export const LINK_LABELS: Record<QuantalLink, string> = {
  probit: "Probit (normal tolerance)",
  logit: "Logit (logistic tolerance)",
  cloglog: "Complementary log-log",
};

export const TRANSFORM_LABELS: Record<QuantalTransform, string> = {
  log10: "log10(dose)",
  ln: "ln(dose)",
  none: "None (X is already the dose metameter)",
};
