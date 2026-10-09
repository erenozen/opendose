// Time course: the same subjects (mice, patients, wells) measured at several
// times, in groups. Generalises the tumour-growth module's controls to any
// longitudinal measurement: long records on a multiple-variables table, or
// subjects as subcolumns of a grouped table (rows = times) or an XY table
// (X = time); the records are read by tumourModel.ts tumourRecords. Three
// analyses share one controls panel with a "which analysis?" guide:
// - the mixed model (engine mixed_timecourse) with a covariance choice
//   (compound symmetry, AR(1), unstructured, random slope) and an AIC
//   comparison of the structures, group means and group differences at
//   each time;
// - the area under each subject's curve (engine auc, long mode) as a
//   linked column table with its t test / one-way ANOVA;
// - a summary of each subject over a time window (mean, peak, area or
//   time-weighted mean) as a linked column table.
// Pure (no React, no engine import): unit-tested in
// __tests__/timecourse.test.ts.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { parseCell } from "../../../project/table.ts";
import { adjustedText } from "../../common/mixedModel.ts";
import type { DataTableModel } from "../../../project/types.ts";
import {
  columnFromValues, normalizeTumourAuc, subjectSeries, transformed, tumourRecords, type LongRecord, type TumourAucOptions,
  type TumourBase,
} from "../tumourModel.ts";

// Stored in project files: never rename.
export const A_TC_MIXED = "assay_timecourse_mixed";
export const A_TC_AUC = "assay_timecourse_auc";
export const A_TC_WINDOW = "assay_timecourse_window";
export const G_TC_MEANS = "assay_timecourse_means";
export const G_TC_AUC = "assay_timecourse_auc_dots";
export const G_TC_WINDOW = "assay_timecourse_window_dots";

export type Covariance = "cs" | "ar1" | "unstructured" | "random_slope";

export const COVARIANCE_LABELS: Record<Covariance, string> = {
  cs: "Compound symmetry (random intercept per subject)",
  ar1: "AR(1): correlation falls with the distance in time",
  unstructured: "Unstructured (every variance and correlation free)",
  random_slope: "Random intercept and slope (each subject its own line)",
};

export type TcComparisons = "sidak" | "holm_sidak" | "bonferroni" | "tukey" | "dunnett" | "fisher" | "none";

export const TC_COMPARISON_LABELS: Record<TcComparisons, string> = {
  sidak: "Šídák", holm_sidak: "Holm-Šídák", bonferroni: "Bonferroni", tukey: "Tukey",
  dunnett: "Dunnett (each group vs. a control)", fisher: "Fisher's LSD (no correction)",
  none: "No comparisons",
};

export interface TcMixedOptions extends TumourBase {
  covariance: Covariance;
  timeAs: "factor" | "linear";
  comparisons: TcComparisons;
  controlIndex: number;
  /** Fit every structure and list them by AIC. */
  compareCovariances: boolean;
  /** The first time point enters as a covariate. */
  baselineCovariate: boolean;
  ciLevel: number;
}

export type TcAucOptions = TumourAucOptions;

export type WindowSummary = "mean" | "max" | "auc" | "auc_per_time";

export const WINDOW_LABELS: Record<WindowSummary, string> = {
  mean: "Mean of the values in the window",
  max: "Peak (largest value in the window)",
  auc: "Area under the curve over the window",
  auc_per_time: "Time-weighted mean (area / duration of the window)",
};

export interface TcWindowOptions extends TumourBase {
  summary: WindowSummary;
  /** Window limits as typed ("" = first / last time). */
  from: string;
  to: string;
  welch: boolean;
}

const obj = (raw: unknown) => (raw && typeof raw === "object" ? raw as Record<string, unknown> : {});
const pick = <T extends string>(v: unknown, allowed: readonly T[], d: T): T =>
  (typeof v === "string" && (allowed as readonly string[]).includes(v) ? v as T : d);
const str = (v: unknown, d: string) => (typeof v === "string" ? v : d);
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);

/** Columns, log and offset as the tumour module reads them (no log by
 *  default: glucose, weight, signal are analysed as measured). */
function base(raw: Record<string, unknown>, table: DataTableModel): TumourBase {
  const t = normalizeTumourAuc(raw, table);
  return { columns: t.columns, log: t.log, offset: t.offset };
}

export function normalizeTcMixed(raw: unknown, table: DataTableModel): TcMixedOptions {
  const o = obj(raw);
  const ci = typeof o.ciLevel === "number" && o.ciLevel > 0.5 && o.ciLevel < 1 ? o.ciLevel : 0.95;
  return {
    ...base(o, table),
    covariance: pick(o.covariance, ["cs", "ar1", "unstructured", "random_slope"] as const, "cs"),
    timeAs: pick(o.timeAs, ["factor", "linear"] as const, "factor"),
    comparisons: pick(o.comparisons, Object.keys(TC_COMPARISON_LABELS) as TcComparisons[], "sidak"),
    controlIndex: Number.isInteger(o.controlIndex) && (o.controlIndex as number) >= 0 ? o.controlIndex as number : 0,
    compareCovariances: bool(o.compareCovariances, false),
    baselineCovariate: bool(o.baselineCovariate, false),
    ciLevel: ci,
  };
}

export function normalizeTcAuc(raw: unknown, table: DataTableModel): TcAucOptions {
  return normalizeTumourAuc(raw, table);
}

export function normalizeTcWindow(raw: unknown, table: DataTableModel): TcWindowOptions {
  const o = obj(raw);
  return {
    ...base(o, table),
    summary: pick(o.summary, ["mean", "max", "auc", "auc_per_time"] as const, "mean"),
    from: str(o.from, ""), to: str(o.to, ""), welch: bool(o.welch, false),
  };
}

// ------------------------------------------------------------ records

export interface Prepared {
  records: LongRecord[];
  /** Subject key -> the name shown and sent to the engine. */
  names: Map<string, string>;
  source: "long" | "grouped" | "xy";
  timeFromOrder?: boolean;
  dropped: number;
  groups: string[];
  nSubjects: number;
  error?: string;
}

/** The table's records (transformed when the options say so) and a name
 *  per subject: its label, or "group label" when labels repeat across
 *  groups. */
export function prepare(table: DataTableModel, o: TumourBase): Prepared {
  const rec = tumourRecords(table, o.columns);
  const empty = { records: [], names: new Map<string, string>(), source: rec.source, dropped: 0,
    groups: [], nSubjects: 0 };
  if (rec.error) return { ...empty, error: rec.error };
  const t = transformed(rec.records, o);
  if (!t.records.length) return { ...empty, error: "No complete records yet (subject, time and value)" };
  const s = subjectSeries(t.records);
  const groupsOf = new Map<string, Set<string>>();
  for (const r of t.records) {
    if (!groupsOf.has(r.label)) groupsOf.set(r.label, new Set());
    groupsOf.get(r.label)!.add(r.group);
  }
  const names = new Map<string, string>();
  for (const r of t.records) {
    if (!names.has(r.subject)) {
      names.set(r.subject, groupsOf.get(r.label)!.size > 1 ? `${r.group} ${r.label}` : r.label);
    }
  }
  return { records: t.records, names, source: rec.source, timeFromOrder: rec.timeFromOrder,
    dropped: t.dropped, groups: s.groups, nSubjects: s.subjects.length };
}

const fmt = (v: number) => Number(v.toPrecision(12));

export function mixedPayload(p: Prepared, o: TcMixedOptions): Record<string, unknown> {
  return {
    analysis: "mixed_timecourse",
    data: { records: p.records.map((r) => ({ subject: p.names.get(r.subject), group: r.group,
      time: fmt(r.time), value: r.value })) },
    options: {
      covariance: o.covariance,
      time_as: o.timeAs,
      comparisons: o.comparisons === "none" ? null : o.comparisons,
      control_index: o.controlIndex,
      compare_covariances: o.compareCovariances,
      baseline_covariate: o.baselineCovariate,
      ci_level: o.ciLevel,
    },
  };
}

/** Records inside [from, to] (blank limits: the first / last time). */
export function windowRecords(records: LongRecord[], from: string, to: string): LongRecord[] {
  const lo = parseCell(from);
  const hi = parseCell(to);
  return records.filter((r) => (lo === null || r.time >= lo) && (hi === null || r.time <= hi));
}

export interface SubjectValue { subject: string; name: string; group: string; value: number; n: number }

/** Mean or peak of each subject's values in the records (arithmetic only;
 *  the tests are the engine's). */
export function subjectSummaries(records: LongRecord[], names: Map<string, string>,
  kind: "mean" | "max"): SubjectValue[] {
  return subjectSeries(records).subjects.map((s) => ({
    subject: s.subject, name: names.get(s.subject) ?? s.label, group: s.group, n: s.y.length,
    value: kind === "max" ? Math.max(...s.y) : s.y.reduce((a, b) => a + b, 0) / s.y.length,
  }));
}

/** The engine call of the window summary: the auc handler's per-subject
 *  mode, which also describes each group and compares them (t test or
 *  one-way ANOVA). For the area summaries it gets the window's records;
 *  for the mean and the peak each subject is sent as a flat line at its
 *  value from t = 0 to 1, whose area is exactly that value. */
export function windowPayload(p: Prepared, o: TcWindowOptions): Record<string, unknown> | { error: string } {
  const recs = windowRecords(p.records, o.from, o.to);
  if (!recs.length) return { error: "No measurement falls inside the time window" };
  let subject: string[], group: string[], time: number[], value: number[];
  if (o.summary === "auc" || o.summary === "auc_per_time") {
    subject = recs.map((r) => p.names.get(r.subject) ?? r.subject);
    group = recs.map((r) => r.group);
    time = recs.map((r) => r.time);
    value = recs.map((r) => r.value);
  } else {
    const vals = subjectSummaries(recs, p.names, o.summary);
    subject = vals.flatMap((v) => [v.name, v.name]);
    group = vals.flatMap((v) => [v.group, v.group]);
    time = vals.flatMap(() => [0, 1]);
    value = vals.flatMap((v) => [v.value, v.value]);
  }
  return {
    analysis: "auc",
    data: { subject, group, time, value },
    options: { baseline: "zero", per_time: o.summary === "auc_per_time", equal_var: !o.welch },
  };
}

/** Times of a result as numbers when they all are (else null: categories). */
export function numericTimes(times: unknown): number[] | null {
  if (!Array.isArray(times)) return null;
  const out = times.map((t) => parseCell(String(t)));
  return out.every((v): v is number => v !== null) ? out : null;
}

export interface MeanSeries { group: string; x: (number | string)[]; mean: number[]; lo: number[]; hi: number[]; n: number[] }

/** Group means of the model at each time, one series per group. */
export function meanSeries(result: Record<string, unknown> | null | undefined): MeanSeries[] {
  const rows = Array.isArray(result?.group_at_time) ? result!.group_at_time as Record<string, unknown>[] : [];
  const groups = Array.isArray(result?.groups) ? (result!.groups as unknown[]).map(String) : [];
  const times = Array.isArray(result?.times) ? (result!.times as unknown[]).map(String) : [];
  const num = numericTimes(times);
  return groups.map((g) => {
    const mine = times.map((t) => rows.find((r) => String(r.group) === g && String(r.time) === t));
    const keep = mine.map((r, i) => (r && typeof r.mean === "number" ? i : -1)).filter((i) => i >= 0);
    return {
      group: g,
      x: keep.map((i) => (num ? num[i] : times[i])),
      mean: keep.map((i) => mine[i]!.mean as number),
      lo: keep.map((i) => (mine[i]!.ci as number[])[0]),
      hi: keep.map((i) => (mine[i]!.ci as number[])[1]),
      n: keep.map((i) => mine[i]!.n as number),
    };
  });
}

/** The legend's first sentence for the group-means graph. */
export function timecoursePlotted(ciLevel = 0.95, subjects = false, ci: "bars" | "band" | "none" = "bars"): string {
  const lvl = `${Number((ciLevel * 100).toPrecision(4))}%`;
  const shown = ci === "none" ? "" : `, with ${ci === "band" ? "a shaded band" : "error bars"} showing its ${lvl} confidence interval`;
  return `Points show the mean of each group at each time estimated by the mixed model${shown}; `
    + `lines join the means of each group${subjects ? "; thin lines show each subject" : ""}.`;
}

/** The legend's first sentence for the per-subject dot plots. */
export const SUBJECT_DOTS_PLOTTED = "Points show one value per subject; horizontal lines show the "
  + "group mean with error bars showing the standard deviation (SD).";

/** "between-within df: Group on 10 df between subjects (12 subjects − 2
 *  groups), Time and Group × Time on 50 df within subjects". */
export function dfNote(r: Record<string, unknown>): string {
  const df = (r.df ?? {}) as { between_subjects?: number; within_subjects?: number };
  const groups = Array.isArray(r.groups) ? r.groups.length : 0;
  const un = (r.covariance as { kind?: string } | undefined)?.kind === "unstructured";
  return `Denominator df by the between-within method: Group is tested on ${df.between_subjects} df `
    + `between subjects (${r.n_subjects} subjects − ${groups} groups)`
    + (un ? "; with an unstructured covariance every term uses the between-subject df"
      : `, Time and Group × Time on ${df.within_subjects} df within subjects`)
    + ". Kenward-Roger or Satterthwaite df (R lmerTest, SAS DDFM=KR) can differ when the "
    + "covariance is not compound symmetry.";
}

/** Methods sentence naming the covariance structure and the df method. */
export function tcMethodsText(r: Record<string, unknown>, o: TcMixedOptions, value: string): string {
  const cov = (r.covariance as { kind?: string } | undefined)?.kind ?? o.covariance;
  const phrase: Record<string, string> = {
    cs: "a random intercept per subject (compound symmetry)",
    ar1: "a random intercept per subject and first-order autoregressive (AR(1)) residuals within subjects",
    unstructured: "an unstructured covariance matrix of the repeated measurements",
    random_slope: "a random intercept and a random slope over time per subject",
  };
  const time = r.time_as === "linear" ? "time (as a straight line)" : "time (as a categorical factor)";
  const v = value.charAt(0).toUpperCase() + value.slice(1);
  let t = `${o.log ? `${v} was log-transformed (natural log) and analysed` : `${v} was analysed`} with `
    + `a linear mixed model with group, ${time} and their interaction as fixed effects and `
    + `${phrase[cov] ?? cov}, fitted by restricted maximum likelihood (REML), using every available `
    + "measurement of each subject. Fixed effects were tested with Type III Wald F tests with "
    + "denominator degrees of freedom by the between-within method. ";
  const mc = r.model_comparison as { rows?: unknown[] } | undefined;
  if (mc && Array.isArray(mc.rows) && mc.rows.length > 1) {
    t += `The covariance structure was chosen among ${mc.rows.length} candidates by Akaike's `
      + "information criterion (AIC). ";
  }
  if (r.baseline_note) t += "The first time point entered the model as a covariate. ";
  const cmp = r.group_difference_at_time as Record<string, unknown> | null;
  if (cmp && Array.isArray(cmp.comparisons) && cmp.comparisons.length) {
    t += `Groups were compared at each time point on the model-estimated means, with P values `
      + `${adjustedText(cmp)}. `;
  }
  return `${t}Analysis in OpenDose (open-source, built on SciPy).`;
}

/** The per-subject values of an auc-handler result as a column table, one
 *  data set per group. */
export function tcColumnTable(result: Record<string, any>, yTitle: string): DataTableModel {
  return columnFromValues(result.table.datasets, yTitle);
}
