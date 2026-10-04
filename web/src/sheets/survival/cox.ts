// Cox proportional-hazards regression: options, engine payloads and the
// result shape. Pure (no React, no DOM), unit-tested with node --test
// (__tests__/cox.test.ts). Engine: engine/opendose/api.py `_cox` and
// engine/opendose/cox.py.
//
// Two sources of data:
// - a survival table: each data set is a group, each row a subject with
//   subcolumns Time, Event (1 = event, 0 = censored) and, from the third
//   subcolumn on, covariates named by their subcolumn title (the same
//   position in every group). The group itself is the covariate "Group"
//   (categorical) when there are two or more groups.
// - a multiple-variables table: options name the time and event variables
//   (and the value that means an event); the other variables are the
//   candidate covariates.
import { datasetLetter, withExclusionsBlanked } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";

export type CoxTies = "efron" | "breslow" | "exact";
export type CoxCiMethod = "wald" | "profile";
export type CoxPhTransform = "km" | "rank" | "identity" | "log";

export interface CoxOptions {
  /** Multiple-variables tables: the time and event variables and the
   *  event value (anything else non-blank counts as censored). */
  time: string;
  event: string;
  eventCode: string;
  /** Covariates left out of the model (new covariates start included). */
  dropped: string[];
  /** Numeric covariates to treat as categorical (text ones always are). */
  categorical: string[];
  /** Reference level per categorical covariate ("" / missing = first). */
  reference: Record<string, string>;
  /** Stratify by this covariate ("" = no strata); it leaves the model. */
  strata: string;
  ties: CoxTies;
  ciMethod: CoxCiMethod;
  ciLevel: string;
  phTransform: CoxPhTransform;
  /** Adjusted curves: one per level of this covariate (a continuous one:
   *  at its quartiles); "" = one curve for the average subject. */
  curvesBy: string;
  /** Values the other covariates are held at ("" = their mean). */
  curvesFixed: Record<string, string>;
}

export const GROUP_COVARIATE = "Group";

export const TIES_LABELS: Record<CoxTies, string> = {
  efron: "Efron (default)",
  breslow: "Breslow",
  exact: "Exact partial likelihood",
};

export const PH_TRANSFORM_LABELS: Record<CoxPhTransform, string> = {
  km: "Kaplan-Meier (default)",
  rank: "Rank of time",
  identity: "Time",
  log: "log(time)",
};

/** One candidate covariate with what the controls need to know. */
export interface CoxCovariate {
  name: string;
  /** Text values (or a group): always categorical. */
  text: boolean;
  /** Levels in order of first appearance (categorical or few values). */
  levels: string[];
  /** Numeric values present (for quartiles). */
  numbers: number[];
}

export type CoxValue = number | string | null;

/** The model's data, row-aligned: one entry per subject. */
export interface CoxData {
  time: (number | null)[];
  event: (number | null)[];
  covariates: Record<string, CoxValue[]>;
  /** Subject labels ("Control, row 3"), for residual hovers. */
  labels: string[];
}

export interface CoxCoefficient {
  name: string; term: string; level?: string; reference?: string;
  coef: number; se: number; z: number; p: number;
  ci: [number | null, number | null];
  ci_profile?: [number | null, number | null];
  hazard_ratio: number;
  hazard_ratio_ci: [number | null, number | null];
  hazard_ratio_ci_profile?: [number | null, number | null];
}

export interface CoxTest { chi2: number; df: number; p: number }

export interface CoxStratumCurve {
  stratum: string;
  time: number[];
  survival: number[];
  lower: (number | null)[];
  upper: (number | null)[];
  n_risk?: number[];
  cumulative_hazard?: number[];
}

export interface CoxCurve {
  label: string;
  covariates: Record<string, number> | null;
  strata: CoxStratumCurve[];
}

export interface CoxResult {
  error?: string;
  analysis?: string;
  ties: CoxTies;
  n: number;
  n_events: number;
  n_excluded: number;
  strata: unknown;
  terms: { name: string; kind: string; levels?: string[]; reference?: string }[];
  coefficients: CoxCoefficient[];
  term_tests: ({ term: string } & CoxTest)[];
  means: Record<string, number>;
  loglik_null: number;
  loglik: number;
  aic: number;
  iterations: number;
  converged: boolean;
  tests: { likelihood_ratio: CoxTest; wald: CoxTest; score: CoxTest };
  concordance: { c: number; se: number; concordant?: number; discordant?: number };
  curves: CoxCurve[];
  ph_test: { transform: CoxPhTransform; terms: ({ term: string } & CoxTest)[]; global: CoxTest };
  schoenfeld: {
    time: number[]; transformed_time: number[]; stratum: string[];
    columns: string[]; residuals: number[][]; scaled: number[][];
  };
  residuals?: { martingale: number[]; deviance: number[] };
  warnings: string[];
  /** Added by the app: options as run. */
  ci_level_used?: number;
  ci_method_used?: CoxCiMethod;
  source?: "survival" | "multivariable";
  covariates_used?: string[];
  categorical_used?: string[];
  strata_used?: string;
}

// ------------------------------------------------------------ defaults

export function defaultCoxOptions(table?: DataTableModel): CoxOptions {
  const base: CoxOptions = {
    time: "", event: "", eventCode: "1", dropped: [], categorical: [],
    reference: {}, strata: "", ties: "efron", ciMethod: "wald", ciLevel: "95",
    phTransform: "km", curvesBy: "", curvesFixed: {},
  };
  if (!table) return base;
  if (table.type === "survival") {
    return { ...base, curvesBy: table.datasets.length > 1 ? GROUP_COVARIATE : "" };
  }
  const guess = guessTimeEvent(table);
  return { ...base, ...guess };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

const strRecord = (v: unknown): Record<string, string> => {
  if (!isRecord(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, x] of Object.entries(v)) if (typeof x === "string") out[k] = x;
  return out;
};

const strList = (v: unknown): string[] =>
  (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function pick<T extends string>(v: unknown, allowed: readonly T[], d: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? v as T : d;
}

/** Stored options brought up to date (unknown or ill-typed fields fall
 *  back to the defaults for this table). */
export function normalizeCoxOptions(raw: unknown, table?: DataTableModel): CoxOptions {
  const d = defaultCoxOptions(table);
  if (!isRecord(raw)) return d;
  const s = (k: string, def: string) => (typeof raw[k] === "string" ? raw[k] as string : def);
  return {
    time: s("time", d.time),
    event: s("event", d.event),
    eventCode: s("eventCode", d.eventCode),
    dropped: strList(raw.dropped),
    categorical: strList(raw.categorical),
    reference: strRecord(raw.reference),
    strata: s("strata", d.strata),
    ties: pick(raw.ties, ["efron", "breslow", "exact"] as const, d.ties),
    ciMethod: pick(raw.ciMethod, ["wald", "profile"] as const, d.ciMethod),
    ciLevel: s("ciLevel", d.ciLevel),
    phTransform: pick(raw.phTransform, ["km", "rank", "identity", "log"] as const, d.phTransform),
    curvesBy: s("curvesBy", d.curvesBy),
    curvesFixed: strRecord(raw.curvesFixed),
  };
}

/** "95" (percent) -> 0.95, clamped to 50-99.99 %. */
export function ciFraction(s: string): number {
  const n = Number(String(s).trim());
  const v = String(s).trim() !== "" && Number.isFinite(n) ? n : 95;
  const pct = v < 1 ? v * 100 : v;
  return Math.min(99.99, Math.max(50, pct)) / 100;
}

// ------------------------------------------------------------ reading tables

const cellValue = (raw: string | undefined): CoxValue => {
  const t = (raw ?? "").trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : t;
};

/** Covariate subcolumns of a survival table: names by position (the
 *  first title given at that position in any group, else
 *  "Covariate k"). */
export function survivalCovariateNames(t: DataTableModel): string[] {
  const width = Math.max(2, ...t.datasets.map((d) => d.rows[0]?.length ?? 2));
  const names: string[] = [];
  for (let s = 2; s < width; s++) {
    const title = t.datasets.map((d) => d.subTitles?.[s]?.trim() ?? "").find((x) => x) ?? "";
    let name = title || `Covariate ${s - 1}`;
    while (names.includes(name) || name === GROUP_COVARIATE) name = `${name} (${s - 1})`;
    names.push(name);
  }
  return names;
}

function groupName(t: DataTableModel, d: number): string {
  return t.datasets[d]?.name.trim() || `Group ${datasetLetter(d)}`;
}

/** Subjects of a survival table, row-aligned. Rows without both a time
 *  and an event code (1 = event, 0 = censored) are not subjects; an
 *  excluded value counts as blank. */
export function survivalCoxData(table: DataTableModel): CoxData {
  const t = withExclusionsBlanked(table);
  const names = survivalCovariateNames(t);
  const out: CoxData = { time: [], event: [], covariates: {}, labels: [] };
  const withGroup = t.datasets.length > 1;
  if (withGroup) out.covariates[GROUP_COVARIATE] = [];
  for (const n of names) out.covariates[n] = [];
  t.datasets.forEach((d, di) => {
    d.rows.forEach((row, r) => {
      const time = cellValue(row[0]);
      const ev = cellValue(row[1]);
      if (typeof time !== "number" || (ev !== 0 && ev !== 1)) return;
      out.time.push(time);
      out.event.push(ev);
      out.labels.push(`${groupName(t, di)}, row ${r + 1}`);
      if (withGroup) out.covariates[GROUP_COVARIATE].push(groupName(t, di));
      names.forEach((n, k) => out.covariates[n].push(cellValue(row[2 + k])));
    });
  });
  return out;
}

function variableName(t: DataTableModel, i: number): string {
  return t.datasets[i]?.name.trim() || `Variable ${datasetLetter(i)}`;
}

/** Multiple-variables table as name -> values (excluded = blank). */
function mvColumns(table: DataTableModel): { name: string; categorical: boolean; values: CoxValue[] }[] {
  const t = withExclusionsBlanked(table);
  return t.datasets.map((d, i) => {
    const categorical = d.varType === "categorical";
    return {
      name: variableName(t, i),
      categorical,
      values: d.rows.map((row) => {
        const v = cellValue(row[0]);
        return categorical && v !== null ? String(v) : v;
      }),
    };
  });
}

const TIME_RE = /time|day|week|month|year|futime|duration|follow/i;
const EVENT_RE = /event|status|dead|death|died|censor|relapse|fustat/i;

/** First guess of the time and event variables of a multiple-variables
 *  table (by name, then by shape). */
export function guessTimeEvent(t: DataTableModel): Pick<CoxOptions, "time" | "event" | "eventCode"> {
  const cols = mvColumns(t);
  const distinct = (vals: CoxValue[]) => [...new Set(vals.filter((v) => v !== null).map(String))];
  const binary = (c: typeof cols[number]) => distinct(c.values).length === 2;
  const event = cols.find((c) => EVENT_RE.test(c.name) && binary(c))
    ?? cols.find((c) => !c.categorical && binary(c)
      && distinct(c.values).every((v) => v === "0" || v === "1"));
  const time = cols.find((c) => c !== event && !c.categorical && TIME_RE.test(c.name))
    ?? cols.find((c) => c !== event && !c.categorical && !binary(c));
  let eventCode = "1";
  if (event) {
    const lv = distinct(event.values).sort();
    if (lv.length === 2 && lv[0] === "1" && lv[1] === "2") eventCode = "2";
    else if (!lv.includes("1")) eventCode = lv[lv.length - 1] ?? "1";
  }
  return { time: time?.name ?? "", event: event?.name ?? "", eventCode };
}

function describe(name: string, values: CoxValue[], forceText = false): CoxCovariate {
  const present = values.filter((v): v is number | string => v !== null);
  const text = forceText || present.some((v) => typeof v === "string");
  const levels: string[] = [];
  for (const v of present) {
    const s = String(v);
    if (!levels.includes(s)) levels.push(s);
  }
  return {
    name, text,
    levels: text || levels.length <= 12 ? levels : [],
    numbers: present.filter((v): v is number => typeof v === "number"),
  };
}

/** Candidate covariates of a table (before the user's choices). */
export function coxCandidates(table: DataTableModel, o: CoxOptions): CoxCovariate[] {
  if (table.type === "survival") {
    const d = survivalCoxData(table);
    return Object.entries(d.covariates).map(([n, v]) => describe(n, v, n === GROUP_COVARIATE));
  }
  return mvColumns(table)
    .filter((c) => c.name !== o.time && c.name !== o.event)
    .map((c) => describe(c.name, c.values, c.categorical));
}

/** The model's covariates, strata and categorical list after the user's
 *  choices (unknown names dropped). */
export function coxModel(table: DataTableModel, o: CoxOptions): {
  candidates: CoxCovariate[]; covariates: string[]; categorical: string[]; strata: string;
} {
  const candidates = coxCandidates(table, o);
  const known = new Set(candidates.map((c) => c.name));
  const strata = o.strata && known.has(o.strata) ? o.strata : "";
  const covariates = candidates.map((c) => c.name)
    .filter((n) => n !== strata && !o.dropped.includes(n));
  const categorical = candidates
    .filter((c) => covariates.includes(c.name) && (c.text || o.categorical.includes(c.name)))
    .map((c) => c.name);
  return { candidates, covariates, categorical, strata };
}

/** Quantile by linear interpolation (type 7). */
function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const h = (sorted.length - 1) * q;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (h - lo);
}

const roundNice = (v: number) => Number(v.toPrecision(4));

/** Covariate profiles for the adjusted curves (engine `curves_at`). */
export function curveProfiles(o: CoxOptions, model: ReturnType<typeof coxModel>):
  Record<string, string | number>[] {
  const fixed: Record<string, string | number> = {};
  for (const n of model.covariates) {
    const raw = (o.curvesFixed[n] ?? "").trim();
    if (!raw || n === o.curvesBy) continue;
    const num = Number(raw);
    fixed[n] = model.categorical.includes(n) || !Number.isFinite(num) ? raw : num;
  }
  const by = model.candidates.find((c) => c.name === o.curvesBy && model.covariates.includes(c.name));
  if (!by) return [{ ...fixed, label: Object.keys(fixed).length ? "Chosen covariate values" : "Average subject" }];
  if (model.categorical.includes(by.name)) {
    return by.levels.map((lv) => ({
      ...fixed, [by.name]: lv,
      label: by.name === GROUP_COVARIATE ? lv : `${by.name} = ${lv}`,
    }));
  }
  const s = [...by.numbers].sort((a, b) => a - b);
  return [0.25, 0.5, 0.75].map((q) => {
    const v = roundNice(quantile(s, q));
    return { ...fixed, [by.name]: v, label: `${by.name} = ${v} (${q === 0.5 ? "median" : `${q * 100}th percentile`})` };
  });
}

// ------------------------------------------------------------ payloads

export type CoxPayload =
  | { error: string }
  | { payload: { analysis: "cox"; data: unknown; options: Record<string, unknown> };
      model: ReturnType<typeof coxModel> };

function commonOptions(o: CoxOptions, model: ReturnType<typeof coxModel>): Record<string, unknown> {
  // The reference level is always sent: the first level as the table
  // lists it (the first group, for Group) unless the user chose another.
  const reference: Record<string, string> = {};
  for (const n of model.categorical) {
    const ref = o.reference[n];
    const c = model.candidates.find((x) => x.name === n);
    if (ref && c?.levels.includes(ref)) reference[n] = ref;
    else if (c?.levels.length) reference[n] = c.levels[0];
  }
  return {
    categorical: model.categorical,
    reference,
    ties: o.ties,
    ci_method: o.ciMethod,
    ci_level: ciFraction(o.ciLevel),
    ph_transform: o.phTransform,
    curves_at: curveProfiles(o, model),
  };
}

/** Engine payload for a Cox model of a survival or multiple-variables
 *  table, or the reason it cannot be specified. */
export function coxPayload(table: DataTableModel, o: CoxOptions): CoxPayload {
  const model = coxModel(table, o);
  if (table.type === "survival") {
    const d = survivalCoxData(table);
    if (!d.time.length) {
      return { error: "No subjects yet: each row needs a time and an event code (1 = event, 0 = censored)." };
    }
    if (!model.covariates.length) {
      return { error: model.candidates.length
        ? "Every covariate is left out or used as strata: include at least one."
        : "A Cox model needs a covariate: add a second group, or a covariate column with “Add covariate” above the table." };
    }
    const covariates: Record<string, CoxValue[]> = {};
    for (const n of model.covariates) covariates[n] = d.covariates[n];
    return {
      model,
      payload: {
        analysis: "cox",
        data: { time: d.time, event: d.event, covariates,
          ...(model.strata ? { strata: d.covariates[model.strata] } : {}) },
        options: commonOptions(o, model),
      },
    };
  }
  const cols = mvColumns(table);
  const names = cols.map((c) => c.name);
  if (!o.time || !names.includes(o.time)) return { error: "Choose the variable that holds the follow-up time." };
  if (!o.event || !names.includes(o.event)) return { error: "Choose the variable that holds the event code." };
  if (o.time === o.event) return { error: "Time and event must be different variables." };
  if (!model.covariates.length) return { error: "Choose at least one covariate." };
  return {
    model,
    payload: {
      analysis: "cox",
      data: { variables: cols.map((c) => ({
        name: c.name, values: c.values,
        kind: model.categorical.includes(c.name) ? "categorical" : "continuous",
      })) },
      options: {
        ...commonOptions(o, model),
        time: o.time, event: o.event,
        event_code: Number.isFinite(Number(o.eventCode)) && o.eventCode.trim() !== ""
          ? Number(o.eventCode) : o.eventCode.trim(),
        covariates: model.covariates,
        ...(model.strata ? { strata: model.strata } : {}),
      },
    },
  };
}

/** Run the model (structural engine bridge keeps this module testable). */
export function runCox(engine: { analyze: (p: unknown) => unknown }, table: DataTableModel,
  o: CoxOptions): CoxResult {
  const p = coxPayload(table, o);
  if ("error" in p) return { error: p.error } as CoxResult;
  const r = engine.analyze(p.payload) as CoxResult;
  if (r.error) return { error: String(r.error) } as CoxResult;
  return {
    ...r,
    ci_level_used: ciFraction(o.ciLevel),
    ci_method_used: o.ciMethod,
    source: table.type === "survival" ? "survival" : "multivariable",
    covariates_used: p.model.covariates,
    categorical_used: p.model.categorical,
    strata_used: p.model.strata,
  };
}

// ------------------------------------------------------------ reading results

/** "Group: Female vs Male", "Age (per unit)". */
export function coefficientLabel(c: CoxCoefficient): string {
  if (c.level !== undefined) return `${c.term}: ${c.level} vs ${c.reference ?? "reference"}`;
  return c.term;
}

/** The plain-language reading of the proportional-hazards test. */
export function phReading(r: CoxResult, alpha = 0.05): string {
  const bad = r.ph_test.terms.filter((t) => t.p < alpha).map((t) => t.term);
  const g = r.ph_test.global;
  if (!bad.length && g.p >= alpha) {
    return "No evidence that the hazard ratios change over time (every P ≥ 0.05): "
      + "the proportional-hazards assumption looks reasonable. Check the Schoenfeld "
      + "residual plots too; a flat smooth supports it.";
  }
  const which = bad.length ? bad.join(", ") : "the model as a whole";
  return `The hazard ratio of ${which} appears to change over time (P < 0.05), so the `
    + "proportional-hazards assumption is questionable there. Look at the Schoenfeld "
    + "residual plot: a trend means the effect grows or fades with time. Remedies: "
    + "stratify by that covariate (it then has no hazard ratio), split follow-up time, "
    + "or report the hazard ratio as an average over follow-up.";
}

/** LOWESS smooth (Cleveland 1979; tricube weights, local linear, two
 *  robustness iterations), as R's lowess() with f = 2/3. */
export function lowess(xs: number[], ys: number[], f = 2 / 3, iter = 2): number[] {
  const n = xs.length;
  if (n < 3) return [...ys];
  const order = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b]);
  const x = order.map((i) => xs[i]);
  const y = order.map((i) => ys[i]);
  const r = Math.max(2, Math.min(n, Math.ceil(f * n)));
  const fit = new Array<number>(n).fill(0);
  let robust = new Array<number>(n).fill(1);
  for (let it = 0; it <= iter; it++) {
    for (let i = 0; i < n; i++) {
      const dist = x.map((v) => Math.abs(v - x[i]));
      const h = [...dist].sort((a, b) => a - b)[r - 1] || 1e-12;
      let sw = 0, swx = 0, swy = 0, swxx = 0, swxy = 0;
      for (let j = 0; j < n; j++) {
        const u = dist[j] / h;
        if (u >= 1) continue;
        const w = (1 - u ** 3) ** 3 * robust[j];
        sw += w; swx += w * x[j]; swy += w * y[j];
        swxx += w * x[j] * x[j]; swxy += w * x[j] * y[j];
      }
      if (sw <= 0) { fit[i] = y[i]; continue; }
      const mx = swx / sw;
      const my = swy / sw;
      const vxx = swxx / sw - mx * mx;
      const b = vxx > 1e-12 * (1 + mx * mx) ? (swxy / sw - mx * my) / vxx : 0;
      fit[i] = my + b * (x[i] - mx);
    }
    if (it === iter) break;
    const res = y.map((v, i) => Math.abs(v - fit[i]));
    const m = [...res].sort((a, b) => a - b)[Math.floor(n / 2)] * 6;
    if (!(m > 0)) break;
    robust = res.map((e) => (e < m ? (1 - (e / m) ** 2) ** 2 : 0));
  }
  const out = new Array<number>(n);
  order.forEach((i, k) => { out[i] = fit[k]; });
  return out;
}
