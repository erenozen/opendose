// Count and proportion models on a multiple-variables table (P-86):
// binomial regression of positives out of counted per row (dish, well,
// animal), with the experiment as a block and quasi-binomial SEs for
// overdispersion, and negative binomial regression of overdispersed counts
// (engine handlers binomial_regression and negative_binomial_regression,
// multivar.py). Pure (no React, no engine import): unit-tested in
// __tests__/glm.test.ts.
import type { DataTableModel } from "../../project/types.ts";
import type { Chip } from "../../guide/checks.ts";
import { SRC } from "../../guide/sources.ts";
import { formatSig } from "../../types.ts";
import {
  defaultPoisson, duplicateNames, mvPayload, mergeOptions, poissonPayload, regressionPayload, variableInfo,
  type PoissonOptions, type RegressionOptions,
} from "./model.ts";

/** A coefficient row (as run.ts's Coefficient; kept here so this module
 *  stays importable by the node unit tests). */
interface Coefficient {
  name: string; estimate: number; se: number; ci: [number | null, number | null];
  t?: number; z?: number; p: number; vif: number | null;
  odds_ratio?: number; odds_ratio_ci?: [number | null, number | null];
  rate_ratio?: number; rate_ratio_ci?: [number | null, number | null];
}

// Ids are stored in project files: never rename them.
export const ANALYSIS_MV_BINOMIAL = "mv_binomial";
export const ANALYSIS_MV_NEGBIN = "mv_negbin";

export interface BinomialOptions extends RegressionOptions {
  /** The outcome is the number positive; this is the number counted. */
  totals: string;
  ciMethod: "profile" | "wald";
  /** Quasi-binomial: SEs scaled by √φ for overdispersed proportions. */
  quasi: boolean;
}

export type NegBinOptions = Omit<PoissonOptions, "quasi">;

const POSITIVE_RE = /positive|success|respond|responder|event|dead|alive|infected|stained|marked|hits?$|yes/i;
const TOTAL_RE = /total|counted|^n$|trials|number|cells|scored|out of|denominator/i;
const BLOCK_RE = /experiment|batch|day|block|replicate|plate|run|litter|cage/i;

/** Whole numbers of 0 or more in every filled cell (counts). */
function countColumns(t: DataTableModel): { name: string; values: (number | null)[] }[] {
  return mvPayload(t).variables.filter((v) => v.kind === "continuous" && v.values.some((x) => x !== null)
    && v.values.every((x) => x === null || (typeof x === "number" && x >= 0 && Number.isInteger(x))))
    .map((v) => ({ name: v.name, values: v.values as (number | null)[] }));
}

/** First guess: the positives and totals by name (else the pair of count
 *  columns where one never exceeds the other), the other variables as
 *  predictors with a block (experiment, batch, day) last, so the first
 *  predictor is the comparison the headline reports. */
export function defaultBinomial(t: DataTableModel): BinomialOptions {
  const counts = countColumns(t);
  let totals = counts.find((c) => TOTAL_RE.test(c.name))?.name ?? "";
  let outcome = counts.find((c) => c.name !== totals && POSITIVE_RE.test(c.name))?.name ?? "";
  const within = (a: (number | null)[], b: (number | null)[]) =>
    a.every((x, i) => x === null || b[i] === null || x <= (b[i] as number));
  if (!outcome || !totals) {
    for (const a of counts) {
      const b = counts.find((c) => c.name !== a.name && (!totals || c.name === totals)
        && within(a.values, c.values));
      if (b && (!outcome || a.name === outcome)) { outcome = a.name; totals = b.name; break; }
    }
  }
  const rest = variableInfo(t).filter((v) => v.name !== outcome && v.name !== totals).map((v) => v.name);
  const predictors = [...rest.filter((n) => !BLOCK_RE.test(n)), ...rest.filter((n) => BLOCK_RE.test(n))];
  return { outcome, totals, predictors, interactions: [], referenceLevels: {}, ciLevel: "95",
    ciMethod: "profile", quasi: false };
}

export function normalizeBinomial(raw: unknown, t: DataTableModel): BinomialOptions {
  return mergeOptions(defaultBinomial(t), raw);
}

export function defaultNegBin(t: DataTableModel): NegBinOptions {
  const o: Partial<PoissonOptions> = defaultPoisson(t);
  delete o.quasi;
  return o as NegBinOptions;
}

export function normalizeNegBin(raw: unknown, t: DataTableModel): NegBinOptions {
  return mergeOptions(defaultNegBin(t), raw);
}

type Built = { error: string } | { options: Record<string, unknown> };

/** Engine options for binomial_regression: the regression model plus the
 *  totals (a count column other than the positives and the predictors). */
export function binomialPayload(t: DataTableModel, o: BinomialOptions): Built {
  const info = variableInfo(t);
  const tot = info.find((v) => v.name === o.totals);
  if (!o.outcome || !info.some((v) => v.name === o.outcome)) {
    return { error: "Choose the column of positives (the number with the outcome)" };
  }
  if (!tot || tot.kind !== "continuous" || o.totals === o.outcome) {
    return { error: "Choose the column of totals (the number counted)" };
  }
  const p = regressionPayload(t, { ...o, predictors: o.predictors.filter((x) => x !== o.totals) });
  if ("error" in p) return p;
  return { options: { ...p.options, totals: o.totals, ci_method: o.ciMethod, ...(o.quasi ? { quasi: true } : {}) } };
}

export function negBinPayload(t: DataTableModel, o: NegBinOptions): Built {
  const p = poissonPayload(t, { ...o, quasi: false });
  if ("error" in p) return p;
  return p;
}

export interface Engine { analyze: (payload: unknown) => unknown }

interface Failure { error?: string; error_kind?: string }

export interface BinomialResult extends Failure {
  analysis?: "binomial_regression";
  outcome: string; totals: string; family: "binomial" | "quasibinomial";
  n_rows_analyzed: number; n_rows_skipped: number; total_positive: number; total_counted: number;
  n_parameters: number; reference_levels: Record<string, string>;
  ci_level: number; ci_method: string; coefficients: Coefficient[];
  log_likelihood: number; null_log_likelihood: number;
  deviance: number; deviance_df: number; deviance_p: number; null_deviance: number;
  dispersion: { pearson_chi2: number; df: number; phi: number; phi_deviance: number; se_factor?: number };
  likelihood_ratio_test: { G: number; df: number; p: number | null };
  term_tests: { term: string; df: number; deviance_drop: number; p: number; F?: number; df2?: number }[];
  f_test?: { F: number | null; df1: number; df2: number; p: number | null };
  model_comparison?: Record<"intercept_only" | "selected",
    { df: number; aic: number; aicc: number | null; log_likelihood: number }>;
  warnings: string[];
  /** Added here: the options as run. */
  predictors?: string[];
}

export interface NegBinResult extends Failure {
  analysis?: "negative_binomial_regression";
  outcome: string; exposure: string | null; family: "negbin";
  n_rows_analyzed: number; n_rows_skipped: number; total_count: number;
  n_parameters: number; reference_levels: Record<string, string>;
  ci_level: number; ci_method: string; coefficients: Coefficient[];
  theta: number; alpha: number;
  log_likelihood: number; null_log_likelihood: number; poisson_log_likelihood: number;
  dispersion: { pearson_chi2: number; df: number; phi: number };
  likelihood_ratio_test: { G: number; df: number; p: number | null };
  vs_poisson: { LR: number; p: number };
  aic: number; aicc: number | null;
  warnings: string[];
  predictors?: string[];
}

function guard(t: DataTableModel): string | null {
  const dup = duplicateNames(t);
  return dup.length ? `Two or more variables are called “${dup[0]}”; give each variable a unique name` : null;
}

export function runBinomial(engine: Engine, t: DataTableModel, o: BinomialOptions): BinomialResult {
  const err = guard(t);
  if (err) return { error: err } as BinomialResult;
  const p = binomialPayload(t, o);
  if ("error" in p) return { error: p.error } as BinomialResult;
  const r = engine.analyze({ analysis: "binomial_regression", data: mvPayload(t), options: p.options }) as BinomialResult;
  return r.error ? r : { ...r, predictors: p.options.predictors as string[] };
}

export function runNegBin(engine: Engine, t: DataTableModel, o: NegBinOptions): NegBinResult {
  const err = guard(t);
  if (err) return { error: err } as NegBinResult;
  const p = negBinPayload(t, o);
  if ("error" in p) return { error: p.error } as NegBinResult;
  const r = engine.analyze({ analysis: "negative_binomial_regression", data: mvPayload(t),
    options: p.options }) as NegBinResult;
  return r.error ? r : { ...r, predictors: p.options.predictors as string[] };
}

/** The dispersion check of a binomial regression, always in the Checks
 *  row (P-86): overdispersed proportions offer quasi-binomial SEs in one
 *  click; with too few residual df it says so instead of judging. */
export function binomialDispersionChip(analysisId: string, result: unknown, resultsId: string): Chip | null {
  if (analysisId !== ANALYSIS_MV_BINOMIAL) return null;
  const r = result as BinomialResult | null;
  if (!r || r.error || !r.dispersion || !Number.isFinite(r.dispersion.phi)) return null;
  const { phi, df } = r.dispersion;
  const ph = formatSig(phi, 4);
  const factor = formatSig(Math.sqrt(phi), 4);
  const sources = [SRC.wedderburn1974, SRC.wartonHui2011];
  const base = { id: "dispersion", action: "quasi-binomial" as const, target: resultsId, sources };
  if (r.family === "quasibinomial") {
    return { ...base, label: `Quasi-binomial SEs (φ = ${ph})`, state: "ok",
      detail: `Every standard error is the binomial one multiplied by √φ = ${factor}; the P values come from t `
        + `with ${df} df and the term tests are F tests. The estimates and odds ratios are the binomial ones.`
        + (phi < 1 ? " φ is below 1, so these SEs are smaller than the binomial ones." : "") };
  }
  if (df < 5) {
    return { ...base, action: undefined, label: `Dispersion φ = ${ph} on ${df} df`, state: "info",
      detail: `The rows' proportions vary ${ph} times as much as counting alone allows (Pearson χ² / df), but `
        + `${df} residual df are too few to judge overdispersion. With more dishes per group and experiment the `
        + "check can tell whether the dishes differ more than counting error." };
  }
  if (phi > 1.5) {
    return { ...base, label: `Proportions are overdispersed (φ = ${ph})`, state: "warn",
      detail: `The rows' proportions vary ${ph} times as much as counting alone allows (Pearson χ² / df): the `
        + "dishes differ more than counting error, so the binomial standard errors, confidence intervals and "
        + `P values are too small. Quasi-binomial keeps the estimates and multiplies every standard error by `
        + `√φ = ${factor}.` };
  }
  return { ...base, action: undefined, label: `No overdispersion (φ = ${ph})`, state: "ok",
    detail: `The rows' proportions vary about as much as counting alone allows (Pearson χ² / df = ${ph} on `
      + `${df} df), so the binomial standard errors hold.` };
}

