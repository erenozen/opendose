// Parametric survival (P-91): exponential, Weibull or log-normal
// accelerated failure time model with the group as the covariate.
// Engine: engine/opendose/parametric_survival.py (api
// `parametric_survival`). The engine computes every number; this module
// holds the options (stored on the results sheet; new keys, never
// rename), the run and the wording. Pure; unit-tested
// (__tests__/parametric.test.ts).
import { numericData } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";
import { timeUnitOf } from "./entry.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

interface EngineBridge { analyze: (payload: unknown) => unknown }

export type AftDist = "weibull" | "exponential" | "lognormal";

export const DIST_LABEL: Record<AftDist, string> = {
  weibull: "Weibull", exponential: "Exponential", lognormal: "Log-normal",
};

export interface ParametricOptions {
  dist: AftDist;
  /** Fractions that have had the event, for the percentile times. */
  percentiles: number[];
}

export const DEFAULT_PERCENTILES = [0.25, 0.5, 0.75];

export const DEFAULT_PARAMETRIC_OPTIONS: ParametricOptions = {
  dist: "weibull", percentiles: DEFAULT_PERCENTILES,
};

export function normalizeParametricOptions(raw: unknown): ParametricOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as R;
  const pcts = Array.isArray(o.percentiles)
    ? [...new Set((o.percentiles as unknown[]).filter((v): v is number =>
      typeof v === "number" && v > 0 && v < 1))].sort((a, b) => a - b)
    : [];
  return {
    dist: (["weibull", "exponential", "lognormal"] as const).includes(o.dist) ? o.dist : "weibull",
    percentiles: pcts.length ? pcts : DEFAULT_PERCENTILES,
  };
}

/** "10, 50, 90" -> [0.1, 0.5, 0.9]; null when any entry is not a percent
 *  strictly between 0 and 100. */
export function parsePercentiles(text: string): number[] | null {
  const parts = text.split(/[,;\s]+/).map((s) => s.trim().replace(/%$/, "")).filter(Boolean);
  if (!parts.length) return null;
  const out: number[] = [];
  for (const s of parts) {
    const v = Number(s.replace(",", "."));
    if (!Number.isFinite(v) || v <= 0 || v >= 100) return null;
    out.push(Math.round(v * 1e6) / 1e8);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

/** [0.25, 0.5] -> "25, 50". */
export function percentilesText(p: number[]): string {
  return p.map((v) => String(Number((v * 100).toPrecision(6)))).join(", ");
}

export function runParametric(engine: EngineBridge, table: DataTableModel, raw: unknown): R {
  const o = normalizeParametricOptions(raw);
  const res = engine.analyze({
    analysis: "parametric_survival", data: numericData(table),
    options: { dist: o.dist, percentiles: o.percentiles },
  }) as R;
  if (!res || res.error) return res;
  return { ...res, time_unit: timeUnitOf(table) };
}

/** "Median (50%)", "25%": the row label of a percentile. */
export function percentileLabel(p: number): string {
  const pct = `${Number((p * 100).toPrecision(6))}%`;
  return p === 0.5 ? `Median (${pct})` : pct;
}

/** The distribution with the smallest AIC among those that fitted. */
export function bestByAic(compare: R[] | undefined): string | null {
  const ok = (compare ?? []).filter((c) => typeof c.aic === "number");
  if (!ok.length) return null;
  return ok.reduce((a, b) => (b.aic < a.aic ? b : a)).dist;
}

/** Warnings, once each. */
export function parametricWarnings(result: R | null): string[] {
  return [...new Set(((result?.warnings ?? []) as unknown[]).map(String))];
}

/** The distribution in a sentence: "Weibull" (a name), "log-normal". */
export function distWord(dist: string): string {
  return dist === "weibull" ? "Weibull" : (DIST_LABEL[dist as AftDist] ?? dist).toLowerCase();
}

/** The methods paragraph. */
export function parametricMethodsText(result: R | null, software: string): string {
  if (!result || result.error) return "";
  const dist = distWord(String(result.dist));
  const names = (result.group_names ?? []) as string[];
  const parts = [
    `${result.dist === "exponential" ? "An" : "A"} ${dist} accelerated failure time model${names.length > 1
      ? ` with the group as a factor (reference: ${result.reference})` : ""} was fitted by maximum `
      + "likelihood to the right-censored survival times (as R's survreg); standard errors come from "
      + "the observed information.",
  ];
  if (names.length > 1) {
    parts.push("Time ratios are exp(coefficient), the factor by which every percentile of the "
      + "survival time is multiplied relative to the reference group, with Wald 95% confidence intervals.");
  }
  parts.push("Percentile survival times (the time by which a given fraction of subjects has had the "
    + "event) are reported with 95% confidence intervals by the delta method on the log scale; times "
    + "after a group's last follow-up are extrapolations of the model.");
  parts.push(software);
  return parts.join(" ");
}
