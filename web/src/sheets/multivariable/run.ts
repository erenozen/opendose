// Engine calls for the multiple-variables analyses. Payload and result
// shapes: engine/opendose/api.py (_multivar_descriptive ... _mv_rearrange)
// and engine/opendose/multivar.py.
import type { EngineBridge } from "../../lib/engine";
import type { DataTableModel } from "../../project/types";
import {
  ciFraction, duplicateNames, mvPayload, num, rearrangePayload,
  regressionPayload, variableInfo,
  type CorrelationOptions, type DescriptiveOptions, type LogisticOptions,
  type MvVariable, type PcaOptions, type RearrangeOptions, type RegressionOptions,
} from "./model";

// ------------------------------------------------------------ result shapes

interface Failure { error?: string }

export interface Describe {
  n: number; mean?: number; sd?: number; sem?: number; median?: number;
  minimum?: number; maximum?: number; percentile25?: number; percentile75?: number;
  ci_mean?: [number, number]; cv_percent?: number | null;
  geometric_mean?: number | null; skewness?: number; kurtosis?: number;
}
export interface DescriptiveResult extends Failure {
  n_rows: number;
  variables: (Describe & {
    name: string; kind: "continuous" | "categorical"; n_missing: number;
    levels?: { level: string; count: number; fraction: number }[];
  })[];
}

type Mat = (number | null)[][];
export interface CorrelationResult extends Failure {
  method: string; missing: string; tails: number; ci_level: number;
  names: string[]; r: Mat; r_squared: Mat; p: Mat; n: number[][];
  ci_lo: Mat; ci_hi: Mat; p_type?: (string | null)[][];
}

export interface Coefficient {
  name: string; estimate: number; se: number; ci: [number | null, number | null];
  t?: number; z?: number; p: number; vif: number | null;
  odds_ratio?: number; odds_ratio_ci?: [number | null, number | null];
}
type Normality = Record<string, { p: number; passed_alpha_05: boolean;
  W?: number; K2?: number; A2?: number }>;

export interface RegressionResult extends Failure {
  outcome: string; n_rows_analyzed: number; n_rows_skipped: number;
  n_parameters: number; reference_levels: Record<string, string>;
  coefficients: Coefficient[]; ci_level: number;
  goodness: { r_squared: number; adjusted_r_squared: number; multiple_r: number;
    sum_of_squares: number; sy_x: number; rmse: number | null;
    aicc: number | null; df: number };
  overall_test: { F: number; dfn: number; dfd: number; p: number };
  anova: { source: string; ss: number; df: number; ms?: number | null; F?: number; p?: number }[];
  term_tests: { term: string; ss: number; df: number; ms: number; F: number; p: number }[];
  normality_of_residuals: Normality;
  predicted: (number | null)[]; residuals: (number | null)[];
  /** Added here: the options as run (for the graphs). */
  predictors?: string[];
}

export interface LogisticResult extends Failure {
  outcome: string; outcome_coding: Record<string, number>;
  n_rows_analyzed: number; n_rows_skipped: number; n_ones: number; n_zeros: number;
  n_parameters: number; reference_levels: Record<string, string>;
  ci_level: number; ci_method: string; coefficients: Coefficient[];
  iterations: number; log_likelihood: number; null_log_likelihood: number;
  deviance: number; null_deviance: number;
  model_comparison: Record<"intercept_only" | "selected",
    { df: number; aic: number; aicc: number | null; log_likelihood: number }>;
  likelihood_ratio_test: { G: number; df: number; p: number };
  pseudo_r_squared: { tjur: number; mcfadden: number; cox_snell: number; nagelkerke: number };
  hosmer_lemeshow: { statistic: number; df: number; p: number | null;
    groups: { n: number; observed_1: number; expected_1: number;
      observed_0: number; expected_0: number }[] };
  classification: { cutoff: number;
    observed_0_predicted_0: number; observed_0_predicted_1: number;
    observed_1_predicted_0: number; observed_1_predicted_1: number;
    percent_correct_0: number | null; percent_correct_1: number | null;
    percent_correct: number | null; positive_predictive_power: number | null;
    negative_predictive_power: number | null };
  roc: { n_patients: number; n_controls: number;
    auc: { value: number; se: number; ci: [number, number]; p_vs_05: number };
    points: { cutoff: number; sensitivity: number; specificity: number }[] };
  predicted_probability: (number | null)[];
  observed: (number | null)[];
  x_at_50_percent?: number | null;
  predictors?: string[];
  interactions?: [string, string][];
}

export interface PcaResult extends Failure {
  names: string[]; components: string[]; standardized: boolean;
  n_rows_analyzed: number; n_rows_skipped: number;
  means: number[]; sds: number[];
  eigenvalues: number[]; proportion_of_variance: number[]; cumulative_proportion: number[];
  selection: string; n_selected: number;
  parallel_analysis: { mean: number[]; upper: number[]; lower: number[];
    percentile: number; n_simulations: number; seed: number } | null;
  eigenvectors: number[][]; loadings: number[][];
  correlation_variables_pcs: number[][]; contribution_of_variables: number[][];
  scores: (number[] | null)[]; contribution_of_cases: (number[] | null)[];
  variable_matrix: number[][];
}

export interface RearrangeResult extends Failure {
  rows: number[];
  variables: MvVariable[];
}

// ------------------------------------------------------------ runners

function guard(table: DataTableModel): string | null {
  const dup = duplicateNames(table);
  if (dup.length) {
    return `Two or more variables are called “${dup[0]}”; give each variable a unique name`;
  }
  return null;
}

const call = <R>(engine: EngineBridge, analysis: string, table: DataTableModel,
  options: Record<string, unknown>): R => engine.analyze({
  analysis, data: mvPayload(table), options,
}) as R;

export function runDescriptive(engine: EngineBridge, table: DataTableModel,
  o: DescriptiveOptions): DescriptiveResult {
  const err = guard(table);
  if (err) return { error: err } as DescriptiveResult;
  return call(engine, "multivar_descriptive", table, { ci_level: ciFraction(o.ciLevel) });
}

export function runCorrelation(engine: EngineBridge, table: DataTableModel,
  o: CorrelationOptions): CorrelationResult {
  const err = guard(table);
  if (err) return { error: err } as CorrelationResult;
  const continuous = variableInfo(table).filter((v) => v.kind === "continuous").map((v) => v.name);
  const chosen = o.variables.filter((v) => continuous.includes(v));
  if ((chosen.length || continuous.length) < 2) {
    return { error: "A correlation matrix needs at least two continuous variables" } as CorrelationResult;
  }
  return call(engine, "correlation_matrix", table, {
    method: o.method, missing: o.missing, tails: o.tails,
    ci_level: ciFraction(o.ciLevel),
    variables: chosen.length ? chosen : null,
  });
}

export function runRegression(engine: EngineBridge, table: DataTableModel,
  o: RegressionOptions): RegressionResult {
  const err = guard(table);
  if (err) return { error: err } as RegressionResult;
  const p = regressionPayload(table, o);
  if ("error" in p) return { error: p.error } as RegressionResult;
  const r = call<RegressionResult>(engine, "multiple_regression", table, p.options);
  return r.error ? r : { ...r, predictors: p.options.predictors as string[] };
}

export function runLogistic(engine: EngineBridge, table: DataTableModel,
  o: LogisticOptions): LogisticResult {
  const err = guard(table);
  if (err) return { error: err } as LogisticResult;
  const p = regressionPayload(table, o);
  if ("error" in p) return { error: p.error } as LogisticResult;
  const out = variableInfo(table).find((v) => v.name === o.outcome);
  if (out && !out.binary) {
    return { error: `${o.outcome} needs exactly two values (0 and 1, or two text levels) to be a logistic outcome` } as LogisticResult;
  }
  const positive = out?.kind === "categorical" && out.levels.includes(o.positiveLevel)
    ? o.positiveLevel : null;
  const r = call<LogisticResult>(engine, "logistic_regression", table, {
    ...p.options,
    outcome_positive: positive,
    ci_method: o.ciMethod,
    cutoff: Math.min(0.999, Math.max(0.001, num(o.cutoff, 0.5))),
    hl_groups: Math.round(Math.min(20, Math.max(3, num(o.hlGroups, 10)))),
  });
  return r.error ? r : {
    ...r,
    predictors: p.options.predictors as string[],
    interactions: p.options.interactions as [string, string][],
  };
}

export function runPca(engine: EngineBridge, table: DataTableModel,
  o: PcaOptions): PcaResult {
  const err = guard(table);
  if (err) return { error: err } as PcaResult;
  const continuous = variableInfo(table).filter((v) => v.kind === "continuous").map((v) => v.name);
  const chosen = o.variables.filter((v) => continuous.includes(v));
  if ((chosen.length || continuous.length) < 2) {
    return { error: "PCA needs at least two continuous variables" } as PcaResult;
  }
  return call(engine, "pca", table, {
    variables: chosen.length ? chosen : null,
    standardize: o.standardize,
    selection: o.selection,
    n_components: Math.max(1, Math.round(num(o.nComponents, 2))),
    variance_threshold: Math.min(100, Math.max(1, num(o.varianceThreshold, 75))),
    n_simulations: Math.round(Math.min(5000, Math.max(100, num(o.nSimulations, 1000)))),
    percentile: Math.min(99.9, Math.max(50, num(o.percentile, 95))),
    seed: Math.round(num(o.seed, 0)),
  });
}

export function runRearrange(engine: EngineBridge, table: DataTableModel,
  o: RearrangeOptions): RearrangeResult {
  const err = guard(table);
  if (err) return { error: err } as RearrangeResult;
  return call(engine, "mv_rearrange", table, rearrangePayload(table, o));
}
