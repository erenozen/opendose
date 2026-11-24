// Competing risks (P-90): the cumulative incidence of each kind of event
// (Aalen-Johansen) and Gray's test, on a survival table whose Event
// subcolumn holds 0 = censored, 1 = the first kind of event, 2, 3, ... the
// other kinds. Engine: engine/opendose/competing_risks.py (api
// `competing_risks`). The engine computes every number; this module holds
// the options (stored on the results sheet; new keys, never rename), the
// run, the graph's settings and the wording. Pure; unit-tested
// (__tests__/competing.test.ts).
//
// The names of the kinds of event ("Tumour", "Other death") live in the
// analysis options, not in the table: the table keeps its numeric codes,
// so older files and .pzfx round trips are unchanged.
import { numericData } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";
import { timeUnitOf } from "./entry.ts";
import { atTimeLabel } from "./extras.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

interface EngineBridge { analyze: (payload: unknown) => unknown }

export interface CompetingOptions {
  /** Name of each kind of event by its code ("1" -> "Tumour"). */
  causeLabels: Record<string, string>;
  /** Time of the at-a-time table (null = the last time every group was
   *  still followed). */
  atTime: number | null;
}

export const DEFAULT_COMPETING_OPTIONS: CompetingOptions = { causeLabels: {}, atTime: null };

export function normalizeCompetingOptions(raw: unknown): CompetingOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as R;
  const labels: Record<string, string> = {};
  if (o.causeLabels && typeof o.causeLabels === "object") {
    for (const [k, v] of Object.entries(o.causeLabels as R)) {
      if (/^\d+$/.test(k) && typeof v === "string") labels[k] = v;
    }
  }
  return {
    causeLabels: labels,
    atTime: typeof o.atTime === "number" && Number.isFinite(o.atTime) && o.atTime >= 0 ? o.atTime : null,
  };
}

/** The name of a kind of event: the user's, else "Cause 1". */
export function causeLabel(code: number | string, labels: Record<string, string> | undefined): string {
  const l = labels?.[String(code)]?.trim();
  return l || `Cause ${code}`;
}

/** Rows the analysis can use: time a number >= 0, code a whole number
 *  >= 0 (the engine applies the same rule and says why it leaves a row
 *  out). */
function usable(table: DataTableModel): { times: number[]; codes: number[] }[] {
  return numericData(table).datasets.map((d) => {
    const times: number[] = [], codes: number[] = [];
    for (const row of d.ys) {
      const t = row[0], c = row[1];
      if (typeof t === "number" && t >= 0 && typeof c === "number" && Number.isInteger(c) && c >= 0) {
        times.push(t); codes.push(c);
      }
    }
    return { times, codes };
  });
}

/** The event codes in the table other than 0, ascending. */
export function causeCodes(table: DataTableModel): number[] {
  const s = new Set<number>();
  for (const g of usable(table)) for (const c of g.codes) if (c > 0) s.add(c);
  return [...s].sort((a, b) => a - b);
}

/** The smallest of the groups' last follow-up times (null without data). */
export function lastCommonFollowUp(table: DataTableModel): number | null {
  const lasts = usable(table).filter((g) => g.times.length).map((g) => Math.max(...g.times));
  return lasts.length ? Math.min(...lasts) : null;
}

/** Ask the engine; the result carries the names and the time it used. */
export function runCompeting(engine: EngineBridge, table: DataTableModel, raw: unknown): R {
  const o = normalizeCompetingOptions(raw);
  const t = o.atTime ?? lastCommonFollowUp(table);
  const res = engine.analyze({
    analysis: "competing_risks", data: numericData(table),
    options: t === null ? {} : { times: [t] },
  }) as R;
  if (!res || res.error) return res;
  return { ...res, cause_labels: o.causeLabels, at_time_used: t, at_time_default: o.atTime === null,
    at_time_label: t === null ? null : atTimeLabel(t, timeUnitOf(table)) };
}

// ------------------------------------------------------------ graph

export type CompetingCi = "none" | "band" | "lines";

/** Settings of the cumulative incidence graph (`graph.settings.competing`). */
export interface CompetingGraphSettings {
  /** The kind of event drawn (null = the first one). */
  cause: number | null;
  ci: CompetingCi;
  scale: "percent" | "fraction";
  censorMarks: boolean;
}

export function normalizeCompetingGraph(raw: unknown): CompetingGraphSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as R;
  return {
    cause: typeof o.cause === "number" && Number.isInteger(o.cause) && o.cause > 0 ? o.cause : null,
    ci: o.ci === "band" || o.ci === "lines" ? o.ci : "none",
    scale: o.scale === "fraction" ? "fraction" : "percent",
    censorMarks: o.censorMarks === true,
  };
}

/** The cause entry of the result the graph draws. */
export function graphCause(result: R | null, s: CompetingGraphSettings): R | null {
  const causes = (Array.isArray(result?.causes) ? result!.causes : []) as R[];
  return causes.find((c) => c.code === s.cause) ?? causes[0] ?? null;
}

/** The graph's automatic Y title; the plot names the kind of event in it. */
export const COMPETING_AUTO_Y = "Cumulative incidence (%)";

/** "Cumulative incidence of Tumour (%)". */
export function competingYTitle(label: string, scale: CompetingGraphSettings["scale"]): string {
  return `Cumulative incidence of ${label}${scale === "percent" ? " (%)" : ""}`;
}

/** The engine's cumulative incidence curves of one kind of event in the
 *  shape the step-curve plot reads (survival.km_curve points), stored as
 *  1 - F so that the plot's "1 − value" view draws F itself: the numbers
 *  drawn are the engine's cumulative incidence and its limits (1 − (1 − F)
 *  = F up to double rounding, about 1e-16). Missing limits (F = 0 or 1) collapse onto the
 *  curve. This is not 1 − Kaplan-Meier. */
export function plotCurves(cause: R | null): Record<string, { points: R[] }> {
  const out: Record<string, { points: R[] }> = {};
  for (const g of (Array.isArray(cause?.groups) ? cause!.groups : []) as R[]) {
    out[String(g.name)] = {
      points: (g.points as R[]).map((p) => ({
        time: p.time,
        survival: 1 - p.cif,
        lower: 1 - (typeof p.upper === "number" ? p.upper : p.cif),
        upper: 1 - (typeof p.lower === "number" ? p.lower : p.cif),
      })),
    };
  }
  return out;
}

// ------------------------------------------------------------ wording

/** Warnings of the result, once each. */
export function competingWarnings(result: R | null): string[] {
  return [...new Set(((result?.warnings ?? []) as unknown[]).map(String))];
}

/** The methods paragraph. */
export function competingMethodsText(result: R | null, table: DataTableModel, software: string): string {
  if (!result || result.error) return "";
  const labels = result.cause_labels as Record<string, string> | undefined;
  const causes = ((result.causes ?? []) as R[]).map((c) => causeLabel(c.code, labels));
  const unit = timeUnitOf(table);
  const parts = [
    `With competing events (${causes.join(", ")}), the cumulative incidence of each kind of event `
      + "was estimated with the Aalen-Johansen estimator, with delta-method standard errors and 95% "
      + "confidence intervals on the log(-log) scale (Gray's cmprsk method); 1 − Kaplan-Meier was "
      + "not used, because it overstates the incidence when another event can come first.",
  ];
  if ((result.group_names ?? []).length >= 2) {
    parts.push("The cumulative incidence of each kind of event was compared between groups with "
      + "Gray's test (Gray 1988, Ann Stat 16:1141).");
  }
  if (typeof result.at_time_used === "number") {
    parts.push(`Cumulative incidence is reported at ${atTimeLabel(result.at_time_used, unit)}.`);
  }
  parts.push(software);
  return parts.join(" ");
}

/** The time in words for headings: "day 20". */
export function competingTimeLabel(t: number, table: DataTableModel): string {
  return atTimeLabel(t, timeUnitOf(table));
}
