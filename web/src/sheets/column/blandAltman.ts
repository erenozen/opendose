// Bland-Altman method comparison of two columns: bias and limits of
// agreement with confidence intervals (approximate, exact or MOVER),
// proportional-bias regression with regression-based limits, ratio and
// percent-difference variants, and repeated measurements per subject.
// Pure; engine handler bland_altman_extras (engine/opendose/api.py,
// methodcomp.py). Pairs are taken row by row: a row with either value
// blank (or excluded) is not a pair.
import { numericData } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";

export const ANALYSIS_BLAND_ALTMAN = "bland_altman";

export type BaVariant = "difference" | "ratio" | "percent";
export type BaLimitsCi = "approximate" | "exact" | "mover" | "none";
export type BaRepeated = "none" | "varies" | "constant";

export interface BaOptions {
  datasetA: number;
  datasetB: number;
  variant: BaVariant;
  agreement: string;
  ciLevel: string;
  limitsCi: BaLimitsCi;
  regression: boolean;
  repeated: BaRepeated;
  /** Subject of each row: "rows" = row titles, or a data set index. */
  subject: string;
}

export function defaultBaOptions(): BaOptions {
  return {
    datasetA: 0, datasetB: 1, variant: "difference", agreement: "95", ciLevel: "95",
    limitsCi: "exact", regression: false, repeated: "none", subject: "rows",
  };
}

export function normalizeBaOptions(raw: unknown): BaOptions {
  const d = defaultBaOptions();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Record<string, unknown>;
  const out = { ...d } as Record<string, unknown>;
  for (const k of Object.keys(d) as (keyof BaOptions)[]) {
    if (typeof r[k] === typeof d[k]) out[k] = r[k];
  }
  const o = out as unknown as BaOptions;
  if (!["difference", "ratio", "percent"].includes(o.variant)) o.variant = "difference";
  if (!["approximate", "exact", "mover", "none"].includes(o.limitsCi)) o.limitsCi = "exact";
  if (!["none", "varies", "constant"].includes(o.repeated)) o.repeated = "none";
  return o;
}

const pctFraction = (s: string, d: number) => {
  const n = Number(String(s).trim());
  const v = String(s).trim() !== "" && Number.isFinite(n) ? n : d;
  return Math.min(0.9999, Math.max(0.5, v > 1 ? v / 100 : v));
};

/** Row-aligned values of one data set's first subcolumn (null = blank or
 *  excluded). */
function column(table: DataTableModel, d: number): (number | null)[] {
  return numericData(table).datasets[d]?.ys.map((row) => row[0] ?? null) ?? [];
}

/** Rows holding both values, as [a, b] pairs (the pairing every
 *  Bland-Altman output uses). */
export function pairedRows(table: DataTableModel, a: number, b: number):
  { rows: number[]; a: number[]; b: number[] } {
  const ca = column(table, a);
  const cb = column(table, b);
  const out = { rows: [] as number[], a: [] as number[], b: [] as number[] };
  ca.forEach((v, r) => {
    const w = cb[r];
    if (v !== null && w !== null && w !== undefined) {
      out.rows.push(r);
      out.a.push(v);
      out.b.push(w);
    }
  });
  return out;
}

export type BaPayload = { error: string } | { payload: { analysis: string; data: unknown; options: Record<string, unknown> } };

export function baPayload(table: DataTableModel, o: BaOptions): BaPayload {
  const n = table.datasets.length;
  const ok = (i: number) => Number.isInteger(i) && i >= 0 && i < n;
  if (n < 2) return { error: "Bland-Altman needs two columns: one per method." };
  if (!ok(o.datasetA) || !ok(o.datasetB) || o.datasetA === o.datasetB) {
    return { error: "Choose two different columns for the two methods." };
  }
  if (table.subcolumnFormat !== "replicates") {
    return { error: "Bland-Altman needs the individual measurements, not means with errors." };
  }
  const agreement = pctFraction(o.agreement, 95);
  const ci_level = pctFraction(o.ciLevel, 95);
  if (o.repeated !== "none") {
    const subjCol = o.subject === "rows" ? null : Number(o.subject);
    if (subjCol !== null && (!ok(subjCol) || subjCol === o.datasetA || subjCol === o.datasetB)) {
      return { error: "Choose the column (or the row titles) that names each row's subject." };
    }
    const a = column(table, o.datasetA);
    const b = column(table, o.datasetB);
    const subjRaw = subjCol === null ? table.rowTitles
      : table.datasets[subjCol].rows.map((row) => row[0] ?? "");
    const subjects: string[] = [];
    const aa: (number | null)[] = [];
    const bb: (number | null)[] = [];
    a.forEach((v, r) => {
      const s = (subjRaw[r] ?? "").trim();
      const w = b[r] ?? null;
      if (!s || (v === null && w === null)) return;
      // true value varies: each row must be a pair
      if (o.repeated === "varies" && (v === null || w === null)) return;
      subjects.push(s);
      aa.push(v);
      bb.push(w);
    });
    if (!subjects.length) {
      return { error: subjCol === null
        ? "Repeated measures need each row's subject: type the subject in the row titles (or pick a subject column)."
        : "No rows with a subject and a measurement." };
    }
    return { payload: { analysis: "bland_altman_extras",
      data: { subjects, a: aa, b: bb },
      options: { repeated: o.repeated, agreement, ci_level } } };
  }
  const pairs = pairedRows(table, o.datasetA, o.datasetB);
  if (pairs.a.length < 3) return { error: "Bland-Altman needs at least three rows with both measurements." };
  return { payload: { analysis: "bland_altman_extras",
    data: { datasets: [
      { name: table.datasets[o.datasetA].name, ys: pairs.a.map((v) => [v]) },
      { name: table.datasets[o.datasetB].name, ys: pairs.b.map((v) => [v]) },
    ] },
    options: { dataset_a: 0, dataset_b: 1, agreement, ci_level,
      variants: ["difference", "ratio", "percent"], regression: true } } };
}

// ------------------------------------------------------------ results

export interface BaLimitsCiSet {
  approximate?: { lower: [number, number]; upper: [number, number]; se?: number };
  exact?: { lower: [number, number]; upper: [number, number] };
  mover?: { lower: [number, number]; upper: [number, number] };
}

export interface BaBlock {
  n: number; bias: number; bias_ci: [number, number]; sd: number; z: number;
  loa_lower: number; loa_upper: number; loa_ci: BaLimitsCiSet;
  points: { average: number; difference: number; subject?: string }[];
  ratio_bias?: number; ratio_bias_ci?: [number, number]; ratio_loa?: [number, number];
  ratio_loa_ci?: BaLimitsCiSet;
}

export interface BaResult {
  error?: string;
  analysis: "bland_altman_extras" | "bland_altman_repeated";
  names: [string, string];
  agreement: number;
  ci_level: number;
  difference?: BaBlock;
  ratio?: BaBlock;
  percent?: BaBlock;
  proportional_bias?: {
    intercept: number; slope: number; slope_se: number; slope_t: number; df: number; slope_p: number;
    abs_residual_intercept: number; abs_residual_slope: number;
    curve: { average: number[]; bias: number[]; lower: number[]; upper: number[] };
  };
  normality?: Record<string, { p: number; passed_alpha_05: boolean; W?: number; K2?: number }>;
  /** repeated measures */
  true_value?: "varies" | "constant";
  n_subjects?: number;
  n_pairs?: number;
  bias?: number;
  bias_ci?: [number, number];
  sd?: number;
  loa_lower?: number;
  loa_upper?: number;
  loa_ci?: { lower: [number, number]; upper: [number, number] };
  points?: { subject?: string; average: number; difference: number }[];
  var_between?: number;
  var_within?: number;
  /** options as run */
  options: BaOptions;
  /** rows of the table each point came from (paired analysis) */
  rows?: number[];
}

type Engine = { analyze: (p: unknown) => unknown };

export function runBa(engine: Engine, table: DataTableModel, o: BaOptions): BaResult {
  const p = baPayload(table, o);
  if ("error" in p) return { error: p.error } as BaResult;
  const r = engine.analyze(p.payload) as BaResult;
  if (r.error) return { error: String(r.error) } as BaResult;
  const names: [string, string] = [table.datasets[o.datasetA]?.name ?? "A", table.datasets[o.datasetB]?.name ?? "B"];
  return {
    ...r, names, options: o,
    agreement: pctFraction(o.agreement, 95), ci_level: pctFraction(o.ciLevel, 95),
    ...(o.repeated === "none" ? { rows: pairedRows(table, o.datasetA, o.datasetB).rows } : {}),
  };
}

/** The block to show for the chosen variant (paired analysis). */
export function baBlock(r: BaResult): BaBlock | null {
  if (r.analysis !== "bland_altman_extras") return null;
  return r[r.options.variant] ?? r.difference ?? null;
}

/** CIs of the two limits by the chosen method. */
export function limitsCi(block: BaBlock, how: BaLimitsCi):
  { lower: [number, number]; upper: [number, number] } | null {
  if (how === "none") return null;
  return block.loa_ci[how] ?? null;
}

export const LIMITS_CI_LABELS: Record<BaLimitsCi, string> = {
  exact: "Exact (Carkeet 2015, tolerance factors)",
  approximate: "Approximate (Bland & Altman 1999)",
  mover: "MOVER (Zou 2013)",
  none: "None",
};

export const VARIANT_LABELS: Record<BaVariant, string> = {
  difference: "Difference (A − B)",
  ratio: "Ratio A / B (log scale)",
  percent: "Percent difference 100 × (A − B) / mean",
};
