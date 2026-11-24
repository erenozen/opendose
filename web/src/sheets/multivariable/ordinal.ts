// Ordinal (proportional-odds) regression on a multiple-variables table
// (P-88): scores on an ordered scale (histology 0 to 4, clinical EAE
// score) modelled by the cumulative logit, with the experiment as an
// optional block and the proportional-odds check (engine handler
// ordinal_regression, engine/opendose/ordinal.py). Pure (no React, no
// engine import): unit-tested in __tests__/ordinal.test.ts.
import type { DataTableModel } from "../../project/types.ts";
import type { Chip } from "../../guide/checks.ts";
import { SRC } from "../../guide/sources.ts";
import { pLabel } from "../../report/pformat.ts";
import { formatSig } from "../../types.ts";
import {
  duplicateNames, mergeOptions, mvPayload, regressionPayload, variableInfo, type RegressionOptions,
} from "./model.ts";

// Ids are stored in project files: never rename them.
export const ANALYSIS_MV_ORDINAL = "mv_ordinal";

export interface OrdinalOptions extends RegressionOptions {
  /** A text outcome's levels, lowest first, separated by commas ("" for
   *  numeric scores, which sort by value). */
  outcomeOrder: string;
  ciMethod: "profile" | "wald";
}

const SCORE_RE = /score|grade|rating|severity|eae|histolog|stage|lesion|clinical/i;
const BLOCK_RE = /experiment|batch|day|block|replicate|plate|run|litter|cage/i;

/** Whole-number columns with 3 to 11 distinct values: candidate scores. */
function scoreColumns(t: DataTableModel): string[] {
  return mvPayload(t).variables.filter((v) => {
    if (v.kind !== "continuous") return false;
    const nums = v.values.filter((x): x is number => typeof x === "number");
    const distinct = new Set(nums).size;
    return nums.length > 0 && nums.every((x) => Number.isInteger(x)) && distinct >= 3 && distinct <= 11;
  }).map((v) => v.name);
}

/** First guess: the score column (by name, else the last whole-number
 *  column with 3 to 11 values), the other variables as predictors with a
 *  block (experiment, batch, day) last, so the first predictor is the
 *  comparison the headline reports. */
export function defaultOrdinal(t: DataTableModel): OrdinalOptions {
  const scores = scoreColumns(t);
  const outcome = scores.find((n) => SCORE_RE.test(n)) ?? scores[scores.length - 1] ?? "";
  const rest = variableInfo(t).filter((v) => v.name !== outcome && !(v.kind === "continuous" && v.binary))
    .map((v) => v.name);
  return { outcome, predictors: [...rest.filter((n) => !BLOCK_RE.test(n)), ...rest.filter((n) => BLOCK_RE.test(n))],
    interactions: [], referenceLevels: {}, ciLevel: "95", outcomeOrder: "", ciMethod: "profile" };
}

export function normalizeOrdinal(raw: unknown, t: DataTableModel): OrdinalOptions {
  return mergeOptions(defaultOrdinal(t), raw);
}

/** The typed order of a text outcome's levels. */
export function parseOrder(text: string): string[] {
  return text.split(/[,;\n]/).map((s) => s.trim()).filter((s) => s !== "");
}

type Built = { error: string } | { options: Record<string, unknown> };

/** Engine options for ordinal_regression. A text outcome needs its order
 *  unless every level reads as a number: the app never guesses which
 *  text level is higher. */
export function ordinalPayload(t: DataTableModel, o: OrdinalOptions): Built {
  const p = regressionPayload(t, o);
  if ("error" in p) return p;
  const v = variableInfo(t).find((x) => x.name === o.outcome);
  const order = parseOrder(o.outcomeOrder);
  const opts: Record<string, unknown> = { ...p.options, ci_method: o.ciMethod };
  if (v?.kind === "categorical") {
    const numeric = v.levels.every((l) => l.trim() !== "" && Number.isFinite(Number(l)));
    if (order.length) opts.outcome_order = order;
    else if (!numeric) {
      return { error: `Give the order of the levels of ${o.outcome}, lowest first (for example `
        + `${v.levels.slice(0, 3).join(", ")}), so the model knows which is higher` };
    }
  }
  return { options: opts };
}

export interface Engine { analyze: (payload: unknown) => unknown }

interface Failure { error?: string; error_kind?: string }

export interface OrdinalCoefficient {
  name: string; estimate: number; se: number; ci: [number | null, number | null];
  z: number; z_signed: number; p: number;
  odds_ratio: number | null; odds_ratio_ci: [number | null, number | null];
}

export interface PoTest {
  term: string; df: number; log_likelihood: number | null; LR: number | null; p: number | null;
  converged?: boolean; note?: string;
}

export interface OrdinalResult extends Failure {
  analysis?: "ordinal_regression";
  outcome: string; link: "logit"; levels: string[]; level_counts: number[];
  n_rows_analyzed: number; n_rows_skipped: number; n_parameters: number;
  reference_levels: Record<string, string>; ci_level: number; ci_method: "profile" | "wald";
  thresholds: { name: string; estimate: number; se: number; z: number }[];
  coefficients: OrdinalCoefficient[];
  iterations: number; condition_number_hessian: number | null; max_abs_gradient: number;
  log_likelihood: number; null_log_likelihood: number; aic: number; aicc: number | null;
  likelihood_ratio_test: { G: number; df: number; p: number | null };
  term_tests: { term: string; df: number; LR: number; p: number; aic: number }[];
  proportional_odds: { method: string; tests: PoTest[]; any_violation: boolean } | null;
  warnings: string[];
  /** Added here: the options as run. */
  predictors?: string[];
}

export function runOrdinal(engine: Engine, t: DataTableModel, o: OrdinalOptions): OrdinalResult {
  const dup = duplicateNames(t);
  if (dup.length) {
    return { error: `Two or more variables are called “${dup[0]}”; give each variable a unique name` } as OrdinalResult;
  }
  const p = ordinalPayload(t, o);
  if ("error" in p) return { error: p.error } as OrdinalResult;
  const r = engine.analyze({ analysis: "ordinal_regression", data: mvPayload(t), options: p.options }) as OrdinalResult;
  return r.error ? r : { ...r, predictors: p.options.predictors as string[] };
}

/** The proportional-odds check in the Checks row (P-88): each term's
 *  likelihood ratio test against a separate effect at every cut point. */
export function proportionalOddsChip(analysisId: string, result: unknown): Chip | null {
  if (analysisId !== ANALYSIS_MV_ORDINAL) return null;
  const r = result as OrdinalResult | null;
  const tests = r && !r.error ? r.proportional_odds?.tests ?? [] : [];
  if (!tests.length) return null;
  const sources = [SRC.petersonHarrell1990, SRC.christensenOrdinal];
  const each = tests.map((t) => (t.p === null ? `${t.term}: could not be tested`
    : `${t.term}: χ² = ${formatSig(t.LR, 4)} on ${t.df} df, ${pLabel(t.p)}`)).join("; ");
  const bad = tests.filter((t) => t.p !== null && t.p < 0.05);
  if (bad.length) {
    const names = bad.map((t) => t.term).join(", ");
    return { id: "proportional-odds", state: "warn", sources,
      label: `Proportional odds rejected for ${names}`,
      detail: `A model that lets the effect of ${names} differ at each cut point between scores fits better `
        + `(${each}). The odds ratio of ${names} is then an average over the cut points: the effect differs `
        + "between low and high scores. Report it with this caveat, or analyse the cut point that matters "
        + "(score at or above a threshold) with logistic regression." };
  }
  const untested = tests.filter((t) => t.p === null);
  return { id: "proportional-odds", state: untested.length ? "info" : "ok", sources,
    label: untested.length ? "Proportional odds partly checked" : "Proportional odds not rejected",
    detail: `Likelihood ratio test of each term against a separate effect at every cut point (${each}). `
      + "With few rows per score this test has little power: a large P does not show that the odds ratios "
      + "are equal at every cut point." };
}
