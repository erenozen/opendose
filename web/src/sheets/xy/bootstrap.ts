// Bootstrap CIs of a curve fit (FEATURE-PLAN P-101): the engine options
// built from the typed settings, and the words the results say about how
// the intervals were made (engine/opendose/fitboot.py computes them:
// case or residual resampling, percentile intervals, a seeded generator).
// Pure; unit-tested.
import { parseNumber } from "../../components/ui/Field.validation.ts";
import type { BootstrapState, FitResult, OptionsState } from "../../types.ts";

export const BOOTSTRAP_DEFAULTS: BootstrapState = { method: "case", resamples: "2000", seed: "1" };
export const MIN_RESAMPLES = 200;
export const MAX_RESAMPLES = 10_000;
export const MAX_SEED = 2 ** 32 - 1;

export const RESAMPLING_LABELS: Record<BootstrapState["method"], string> = {
  case: "Resample the points (cases)",
  residual: "Resample the residuals",
};

/** The settings, defaults filled in (files saved before have none). */
export function bootstrapState(options: Pick<OptionsState, "bootstrap">): BootstrapState {
  const b = options.bootstrap;
  return {
    method: b?.method === "residual" ? "residual" : "case",
    resamples: typeof b?.resamples === "string" ? b.resamples : BOOTSTRAP_DEFAULTS.resamples,
    seed: typeof b?.seed === "string" ? b.seed : BOOTSTRAP_DEFAULTS.seed,
  };
}

/** The engine's bootstrap option for ci_method "bootstrap", else {}.
 *  A blank field takes its default; a number goes to the engine as typed,
 *  which says what to enter when it is out of range (the field says so
 *  too, and flags text that is not a number). */
export function bootstrapOption(options: Pick<OptionsState, "ciMethod" | "bootstrap">):
  { bootstrap?: { method: "case" | "residual"; resamples: number; seed: number } } {
  if (options.ciMethod !== "bootstrap") return {};
  const s = bootstrapState(options);
  return {
    bootstrap: {
      method: s.method,
      resamples: parseNumber(s.resamples) ?? Number(BOOTSTRAP_DEFAULTS.resamples),
      seed: parseNumber(s.seed) ?? Number(BOOTSTRAP_DEFAULTS.seed),
    },
  };
}

const count = (n: number) => n.toLocaleString("en-US");

/** One line under the parameters table: how the CIs were made, or why
 *  there are none. Null when the fit's CIs are not bootstrap ones and
 *  no bootstrap was asked for. */
export function bootstrapNote(fit: Pick<FitResult, "bootstrap" | "ci_method">): string | null {
  const b = fit.bootstrap;
  if (!b) return null;
  if (b.error) return `${b.error.replace(/\.$/, "")}.`;
  const what = b.method === "residual" ? "residual" : "case";
  const n = b.resamples ?? 0;
  const failed = b.failed ?? 0;
  const done = failed ? `${count(n - failed)} refitted` : "all refitted";
  return `Bootstrap percentile CIs from ${count(n)} ${what} resamples (seed ${b.seed}), ${done}. `
    + "Std. Error is asymptotic; bands and interpolated values use the asymptotic covariance.";
}

/** The bootstrap's caveats (failed refits, values undefined in some
 *  resamples), as the engine words them. */
export function bootstrapWarnings(fit: Pick<FitResult, "bootstrap">): string[] {
  return (fit.bootstrap?.warnings ?? []).map((w) => `${w.replace(/\.$/, "")}.`);
}

export interface BootstrapRow {
  name: string;
  se: number | null;
  bias: number | null;
  asymptotic: [number, number] | null;
}

/** The fold under the table: each value's bootstrap SE and bias, next to
 *  the asymptotic CI it replaces, in the table's order. */
export function bootstrapRows(fit: Pick<FitResult, "bootstrap" | "param_order" | "params">): BootstrapRow[] {
  const params = fit.bootstrap?.params;
  if (!params || fit.bootstrap?.error) return [];
  const order = fit.param_order ?? Object.keys(fit.params);
  return order.filter((n) => params[n]).map((name) => ({
    name,
    se: params[name].se,
    bias: params[name].bias,
    asymptotic: params[name].asymptotic_ci95 ?? null,
  }));
}

/** The CI method in words (results header, fit report, methods). */
export function ciMethodWords(method: string | undefined): string {
  return method === "profile" ? "profile likelihood"
    : method === "bootstrap" ? "bootstrap percentile" : "asymptotic";
}
