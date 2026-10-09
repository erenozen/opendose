// The survival analysis' extras: pairwise log-rank tests with a
// multiplicity correction and the log-rank test for trend
// (engine survival_pairwise), Kaplan-Meier survival at a chosen time with
// the "median not reached" explanation (survival_at_time) and the
// restricted mean survival time (rmst). The engine computes every number;
// this module holds the options (stored on the results sheet: new keys,
// never rename), the run that asks the engine, and the wording. Pure,
// unit-tested (__tests__/extras.test.ts).
import { numericData } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";
import { fmtTime, timeUnitOf, type TimeUnit } from "./entry.ts";
import { survivalGroups } from "./kmTable.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

/** The engine as `run` sees it (lib/engine.ts EngineBridge). */
interface EngineBridge { analyze: (payload: unknown) => unknown }

export type PairwiseFamily = "all" | "control";
export type PairwiseCorrection = "holm_sidak" | "bonferroni" | "none";

/** Options of the survival analysis (results sheet `options`). Older
 *  sheets store `{}`: every key falls back to its default. */
export interface SurvivalOptions {
  /** Pairwise log-rank family with 3 or more groups: every pair, or each
   *  group against a control. */
  pairwiseFamily: PairwiseFamily;
  /** Name of the control group ("" = the first group). */
  pairwiseControl: string;
  pairwiseCorrection: PairwiseCorrection;
  /** The groups are ordered (doses, grades): show the log-rank test for
   *  trend (scores 1, 2, 3, … in table order). */
  trend: boolean;
  /** Time at which survival is reported (null = the last time every group
   *  was still followed). */
  survivalAt: number | null;
  /** Truncation time of the RMST (null = the engine's default). */
  rmstTau: number | null;
}

export const DEFAULT_SURVIVAL_OPTIONS: SurvivalOptions = {
  pairwiseFamily: "all", pairwiseControl: "", pairwiseCorrection: "holm_sidak",
  trend: false, survivalAt: null, rmstTau: null,
};

const posNum = (v: unknown): number | null =>
  (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);

export function normalizeSurvivalOptions(raw: unknown): SurvivalOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as R;
  return {
    pairwiseFamily: o.pairwiseFamily === "control" ? "control" : "all",
    pairwiseControl: typeof o.pairwiseControl === "string" ? o.pairwiseControl : "",
    pairwiseCorrection: (["holm_sidak", "bonferroni", "none"] as const).includes(o.pairwiseCorrection)
      ? o.pairwiseCorrection : "holm_sidak",
    trend: o.trend === true,
    survivalAt: typeof o.survivalAt === "number" && Number.isFinite(o.survivalAt) && o.survivalAt >= 0
      ? o.survivalAt : null,
    rmstTau: posNum(o.rmstTau),
  };
}

export const CORRECTION_LABEL: Record<PairwiseCorrection, string> = {
  holm_sidak: "Holm-Šídák", bonferroni: "Bonferroni", none: "none",
};

/** "adjusted for 6 comparisons (Holm-Šídák)" / "not adjusted for the 6
 *  comparisons". */
export function adjustedHeader(k: number, correction: string): string {
  const name = CORRECTION_LABEL[correction as PairwiseCorrection] ?? correction;
  const what = `${k} comparison${k === 1 ? "" : "s"}`;
  return correction === "none" ? `not adjusted for the ${what}` : `adjusted for ${what} (${name})`;
}

/** The last time every group was still followed: the smallest of the
 *  groups' largest times (the default time for "survival at" and the
 *  engine's default RMST tau). Null without data. */
export function lastCommonTime(table: DataTableModel): number | null {
  const gs = survivalGroups(table).filter((g) => g.times.length);
  if (!gs.length) return null;
  return Math.min(...gs.map((g) => Math.max(...g.times)));
}

/** Index of the control group among the analysed groups. */
export function controlIndex(names: string[], control: string): number {
  const i = names.indexOf(control);
  return i >= 0 ? i : 0;
}

/** The survival result with the extras the engine computed (each an
 *  engine result, possibly `{ error }`). */
export interface SurvivalExtras {
  pairwise?: R;
  at_time?: R;
  rmst?: R;
  /** The time "survival at" used, and whether it was the default. */
  at_time_used?: number | null;
  at_time_default?: boolean;
  /** The user said the groups are ordered: report the test for trend. */
  trend_shown?: boolean;
}

/** Kaplan-Meier and log-rank (engine `survival`), then the extras. */
export function runSurvival(engine: EngineBridge, table: DataTableModel, raw: unknown): R {
  const o = normalizeSurvivalOptions(raw);
  const data = numericData(table);
  const base = engine.analyze({ analysis: "survival", data, options: {} }) as R;
  if (!base || base.error) return base;
  const names = Object.keys(base.curves ?? {});
  const extras: SurvivalExtras = {};
  if (names.length >= 3) {
    extras.pairwise = engine.analyze({
      analysis: "survival_pairwise", data,
      options: {
        family: o.pairwiseFamily,
        control: controlIndex(names, o.pairwiseControl),
        correction: o.pairwiseCorrection,
      },
    }) as R;
    extras.trend_shown = o.trend;
  }
  const t = o.survivalAt ?? lastCommonTime(table);
  extras.at_time_used = t;
  extras.at_time_default = o.survivalAt === null;
  if (t !== null) {
    extras.at_time = engine.analyze({ analysis: "survival_at_time", data, options: { times: [t] } }) as R;
  }
  extras.rmst = engine.analyze({
    analysis: "rmst", data, options: o.rmstTau !== null ? { tau: o.rmstTau } : {},
  }) as R;
  return { ...base, extras };
}

// ------------------------------------------------------------ wording

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** The median cell when the curve never fell to 50%: "not reached: 62%
 *  survived to day 60 (last follow-up)". From the engine's explanation
 *  block (survival_at_time), null when the median was reached. */
export function notReachedText(explanation: R | undefined | null, unit: TimeUnit): string | null {
  if (!explanation || explanation.median_reached !== false) return null;
  const f = explanation.fraction_at_last;
  const t = explanation.last_time;
  if (typeof f !== "number" || typeof t !== "number") return "not reached";
  const when = unit ? `${unit.replace(/s$/, "")} ${fmtTime(t)}` : `time ${fmtTime(t)}`;
  return `not reached: ${pct(f)} survived to ${when} (last follow-up)`;
}

/** Medians not reached, by group name. */
export function notReachedByGroup(atTime: R | undefined, unit: TimeUnit): Record<string, string> {
  const out: Record<string, string> = {};
  for (const g of (Array.isArray(atTime?.groups) ? atTime.groups : []) as R[]) {
    const t = notReachedText(g.explanation, unit);
    if (t) out[String(g.name)] = t;
  }
  return out;
}

/** The time in words for headings: "day 60", "time 60". */
export function atTimeLabel(t: number, unit: TimeUnit): string {
  return unit ? `${unit.replace(/s$/, "")} ${fmtTime(t)}` : `time ${fmtTime(t)}`;
}

/** Warnings of the survival result and its extras, once each. */
export function survivalWarnings(result: R | null): string[] {
  if (!result) return [];
  const ex = (result.extras ?? {}) as SurvivalExtras;
  const all = [result.warnings, ex.pairwise?.warnings, ex.at_time?.warnings, ex.rmst?.warnings]
    .flatMap((w) => (Array.isArray(w) ? w : [])).map(String);
  return [...new Set(all)];
}

/** The methods paragraph of a survival analysis, from what was run. */
export function survivalMethodsText(result: R | null, table: DataTableModel, software: string): string {
  if (!result || result.error) return "";
  const ex = (result.extras ?? {}) as SurvivalExtras;
  const unit = timeUnitOf(table);
  const names = Object.keys(result.curves ?? {});
  const parts: string[] = [];
  parts.push("Survival was estimated with the Kaplan-Meier product-limit method, with "
    + "Greenwood standard errors and 95% confidence intervals on the log-log scale; the median "
    + "survival is the first time the curve falls to 50% or below.");
  if (names.length >= 2) {
    parts.push("Survival curves were compared with the log-rank (Mantel-Cox) test.");
  }
  const pw = ex.pairwise;
  if (pw && !pw.error && Array.isArray(pw.comparisons) && pw.comparisons.length) {
    const k = pw.family_size ?? pw.comparisons.length;
    const fam = pw.comparisons[0] && String(pw.family?.label ?? "").startsWith("each group")
      ? `each group was compared with ${pw.comparisons[0].a} (control)`
      : "every pair of groups was compared";
    parts.push(`For pairwise comparisons, ${fam} with its own two-group log-rank test, and the P `
      + `values were ${pw.correction === "none"
        ? `not adjusted for the ${k} comparisons`
        : `adjusted for ${k} comparisons with the ${CORRECTION_LABEL[pw.correction as PairwiseCorrection]
          ?? pw.correction} method`}.`);
  }
  if (pw && !pw.error && pw.trend && ex.trend_shown) {
    parts.push(`A log-rank test for trend was used across the ordered groups (${names.join(", ")}; `
      + `scores ${(pw.trend.scores as number[] ?? []).map(fmtTime).join(", ")}).`);
  }
  const at = ex.at_time;
  if (at && !at.error && ex.at_time_used != null) {
    parts.push(`Survival at ${atTimeLabel(ex.at_time_used, unit)} is reported with its Greenwood `
      + "standard error and log-log 95% confidence interval.");
  }
  const rm = ex.rmst;
  if (rm && !rm.error && typeof rm.tau === "number") {
    parts.push(`The restricted mean survival time (the area under the Kaplan-Meier curve) up to `
      + `${atTimeLabel(rm.tau, unit)} was estimated for each group, with differences from `
      + `${rm.reference} and normal-theory 95% confidence intervals (Royston & Parmar 2013; `
      + "Uno et al. 2014).");
  }
  parts.push(software);
  return parts.join(" ");
}
