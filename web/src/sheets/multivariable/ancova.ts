// Baseline-adjusted comparison (ANCOVA, P-82) on a multiple-variables
// table: one row per subject with its group, its baseline value and its
// follow-up value. The follow-up is compared between groups adjusted for
// the baseline (engine handler ancova, multivar.ancova). Pure (no React,
// no engine import): unit-tested in __tests__/ancova.test.ts.
import { parseCell, withExclusionsBlanked } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";
import { formatSig } from "../../types.ts";
import type { Chip } from "../../guide/checks.ts";
import { SRC } from "../../guide/sources.ts";
import { pLabel } from "../../report/pformat.ts";
import { ciFraction, mergeOptions, variableName } from "./model.ts";
import { ROW_TITLES } from "./mixedGrouping.ts";

export { ROW_TITLES };

// Ids are stored in project files: never rename it.
export const ANALYSIS_MV_ANCOVA = "mv_ancova";

export interface AncovaOptions {
  /** The follow-up measurement. */
  outcome: string;
  baseline: string;
  /** A column name, or ROW_TITLES for the row titles (a first column of
   *  text is imported as row titles). */
  group: string;
  /** "" = the first level in the table. */
  referenceLevel: string;
  ciLevel: string;
}

const BASELINE_RE = /baseline|before|^pre|pre[-_ ]?(treatment|dose)?$|day ?0|week ?0|^t ?0$|initial/i;
const FOLLOW_RE = /follow|after|^post|post[-_ ]?(treatment|dose)?$|end|final|outcome/i;
const GROUP_RE = /group|arm|treatment|condition|genotype/i;

/** A column holding text (categorical, or any value that is no number). */
function isText(t: DataTableModel, i: number): boolean {
  const d = t.datasets[i];
  return d.varType === "categorical"
    || d.rows.some((r) => (r[0] ?? "").trim() !== "" && parseCell(r[0] ?? "") === null);
}

/** Distinct non-blank values of column `i`, in order, up to `max` + 1. */
function distinct(t: DataTableModel, i: number, max: number): string[] {
  const out: string[] = [];
  for (const r of t.datasets[i].rows) {
    const v = (r[0] ?? "").trim();
    if (v && !out.includes(v)) out.push(v);
    if (out.length > max) break;
  }
  return out;
}

/** First guess: the group a text column (or a numeric one with few
 *  levels, named like a group), the baseline and follow-up the numeric
 *  columns named like them, else the first and last numeric columns. */
export function defaultAncova(t: DataTableModel): AncovaOptions {
  const names = t.datasets.map((_, i) => variableName(t, i));
  const text = names.filter((_, i) => isText(t, i));
  const nums = names.filter((_, i) => !isText(t, i));
  const fewLevels = nums.filter((n) => {
    const k = distinct(t, names.indexOf(n), 6).length;
    return k >= 2 && k <= 6 && GROUP_RE.test(n);
  });
  const titles = t.rowTitles.map((x) => x.trim()).filter(Boolean);
  const titleGroups = titles.length > 0 && new Set(titles).size >= 2 && new Set(titles).size < titles.length;
  const group = text.find((n) => GROUP_RE.test(n)) ?? text[0] ?? fewLevels[0]
    ?? (titleGroups ? ROW_TITLES : "");
  const numeric = nums.filter((n) => n !== group);
  const baseline = numeric.find((n) => BASELINE_RE.test(n)) ?? numeric[0] ?? "";
  const outcome = numeric.find((n) => n !== baseline && FOLLOW_RE.test(n))
    ?? [...numeric].reverse().find((n) => n !== baseline) ?? "";
  return { outcome, baseline, group, referenceLevel: "", ciLevel: "95" };
}

export function normalizeAncova(raw: unknown, t: DataTableModel): AncovaOptions {
  return mergeOptions(defaultAncova(t), raw);
}

/** The levels of the group column, as the controls list them. */
export function groupLevels(t: DataTableModel, group: string): string[] {
  if (group === ROW_TITLES) {
    return [...new Set(t.rowTitles.map((x) => x.trim()).filter(Boolean))].slice(0, 51);
  }
  const i = t.datasets.findIndex((_, j) => variableName(t, j) === group);
  return i < 0 ? [] : distinct(t, i, 50);
}

export type Built = { payload: Record<string, unknown>; error?: undefined }
  | { payload?: undefined; error: string };

/** The engine payload: the outcome and baseline as numbers (text that is
 *  not a number counts as missing), the group as text labels (a group
 *  typed as 1 / 2 is still a set of labels); excluded cells blank. */
export function ancovaPayload(table: DataTableModel, o: AncovaOptions): Built {
  const names = table.datasets.map((_, i) => variableName(table, i));
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) return { error: `Two or more variables are called “${dup}”; give each variable a unique name` };
  if (!names.includes(o.outcome)) return { error: "Choose the follow-up measurement (the outcome)" };
  if (!names.includes(o.baseline)) return { error: "Choose the baseline measurement" };
  if (!names.includes(o.group) && o.group !== ROW_TITLES) return { error: "Choose the group column" };
  if (new Set([o.outcome, o.baseline, o.group]).size < 3) {
    return { error: "The follow-up, the baseline and the group must be three different variables" };
  }
  const t = withExclusionsBlanked(table);
  const column = (n: string, numeric: boolean) => (n === ROW_TITLES
    ? t.rowTitles.map((x) => x.trim() || null)
    : t.datasets[names.indexOf(n)].rows.map((row) => {
      const v = (row[0] ?? "").trim();
      if (!v) return null;
      return numeric ? parseCell(v) : v;
    }));
  const levels = groupLevels(table, o.group);
  // row titles go to the engine as "Group" (or "Row title" if a column has that name)
  const gname = o.group !== ROW_TITLES ? o.group : names.includes("Group") ? "Row title" : "Group";
  return {
    payload: {
      analysis: "ancova",
      data: {
        variables: [
          { name: gname, kind: "categorical", values: column(o.group, false) },
          { name: o.baseline, kind: "continuous", values: column(o.baseline, true) },
          { name: o.outcome, kind: "continuous", values: column(o.outcome, true) },
        ],
      },
      options: {
        outcome: o.outcome, group: gname, baseline: o.baseline,
        reference_level: levels.includes(o.referenceLevel) ? o.referenceLevel : null,
        ci_level: ciFraction(o.ciLevel),
      },
    },
  };
}

type Ci = [number, number];
interface TRow { estimate: number; se: number; ci: Ci; t: number; df: number; p: number }

export interface AncovaResult {
  error?: string;
  analysis?: "ancova";
  outcome: string; group: string; baseline: string;
  reference_level: string; levels: string[];
  n_rows_analyzed: number; n_rows_skipped: number;
  ci_level: number; baseline_mean: number;
  adjusted_means: { level: string; n: number; mean: number; se: number; ci: Ci }[];
  differences: (TRow & { level: string; vs: string })[];
  baseline_slope: TRow & { name: string };
  unadjusted: { level: string; n: number; baseline_mean: number; baseline_sd: number | null;
    outcome_mean: number; outcome_sd: number | null }[];
  anova: { source: string; ss: number; df: number; ms: number; F?: number; p?: number }[];
  equal_slopes: { F: number; df1: number; df2: number; p: number;
    slopes: { level: string; slope: number; se: number }[] } | { error: string };
  goodness: { r_squared: number; adjusted_r_squared: number; sy_x: number; df: number };
  warnings: string[];
}

export interface Engine { analyze: (payload: unknown) => unknown }

export function runAncova(engine: Engine, table: DataTableModel, o: AncovaOptions): AncovaResult {
  const b = ancovaPayload(table, o);
  if (b.error !== undefined) return { error: b.error } as AncovaResult;
  return engine.analyze(b.payload) as AncovaResult;
}

/** The equal-slopes check as the Checks row says it (Vickers & Altman
 *  2001: ANCOVA assumes one baseline slope for every group). */
export function equalSlopesChip(analysisId: string, result: unknown): Chip | null {
  if (analysisId !== ANALYSIS_MV_ANCOVA) return null;
  const r = result as AncovaResult | null;
  if (!r || r.error || !r.equal_slopes) return null;
  const es = r.equal_slopes;
  const sources = [SRC.vickersAltman2001];
  if ("error" in es) {
    return { id: "equal-slopes", label: "Equal slopes not checked", state: "info", sources,
      detail: `The group × ${r.baseline} interaction could not be tested: ${es.error}.` };
  }
  const test = `F(${es.df1}, ${es.df2}) = ${formatSig(es.F, 4)}, ${pLabel(es.p)}`;
  const slopes = es.slopes.map((s) => `${s.level} ${formatSig(s.slope, 4)}`).join(", ");
  if (es.p < 0.05) {
    return { id: "equal-slopes", label: `Slopes differ between groups (${pLabel(es.p)})`, state: "warn", sources,
      detail: `ANCOVA assumes the follow-up rises with the baseline at the same rate in every group. Here the `
        + `slopes differ (group × ${r.baseline} interaction ${test}; slopes ${slopes}), so the adjusted difference `
        + `depends on the baseline value and one number does not summarise it. Report the slopes, or compare `
        + "the groups at stated baseline values." };
  }
  return { id: "equal-slopes", label: `Equal slopes (${pLabel(es.p)})`, state: "ok", sources,
    detail: `The follow-up rises with the baseline at a similar rate in every group (group × ${r.baseline} `
      + `interaction ${test}; slopes ${slopes}), as ANCOVA assumes. A large P does not prove the slopes are `
      + "equal: with few subjects per group the test has little power." };
}
