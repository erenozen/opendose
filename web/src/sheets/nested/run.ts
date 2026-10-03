// Nested t test and nested one-way ANOVA: engine payloads and option
// types. Pure (no React, no engine import) so the payload builder is
// unit-tested with node --test; see __tests__/run.test.ts.
//
// Engine handlers (engine/opendose/api.py, engine/opendose/nested.py):
// data = {groups: [{name, subgroups: [[values...], ...], subgroup_names}]}
// with groups = data sets, subgroups = subcolumns, values = rows.
// "nested_ttest" options: ci_level, swap, negative_variance.
// "nested_anova" options: comparisons, control_index, ci_level,
// negative_variance.
import { parseCell, withExclusionsBlanked } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";

/** The slice of EngineBridge the analyses need. */
export interface Engine { analyze: (payload: unknown) => unknown }

export const ANALYSIS_NESTED_T = "nested_ttest";
export const ANALYSIS_NESTED_ANOVA = "nested_anova";
export const GRAPH_NESTED = "nested_scatter";

export type NegativeVariance = "allow" | "zero";
export type NestedComparisons =
  | "none" | "tukey" | "dunnett" | "bonferroni" | "sidak" | "holm_sidak" | "fisher";

export const NESTED_COMPARISONS_LABELS: Record<NestedComparisons, string> = {
  none: "No multiple comparisons",
  tukey: "Tukey (compare every pair)",
  dunnett: "Dunnett (compare to control)",
  bonferroni: "Bonferroni (every pair)",
  sidak: "Šídák (every pair)",
  holm_sidak: "Holm-Šídák (every pair)",
  fisher: "Fisher's LSD (no correction)",
};

export interface NestedTOptions {
  groupA: number;
  groupB: number;
  /** false: difference = B − A; true: A − B. */
  swap: boolean;
  ciLevel: number;
  negativeVariance: NegativeVariance;
}

export interface NestedAnovaOptions {
  comparisons: NestedComparisons;
  controlIndex: number;
  ciLevel: number;
  negativeVariance: NegativeVariance;
}

export const DEFAULT_NESTED_T: NestedTOptions = {
  groupA: 0, groupB: 1, swap: false, ciLevel: 0.95, negativeVariance: "allow",
};

export const DEFAULT_NESTED_ANOVA: NestedAnovaOptions = {
  comparisons: "tukey", controlIndex: 0, ciLevel: 0.95, negativeVariance: "allow",
};

const idx = (v: unknown, d: number) =>
  (Number.isInteger(v) && (v as number) >= 0 ? v as number : d);
const level = (v: unknown) =>
  (typeof v === "number" && v > 0.5 && v < 1 ? v : 0.95);
const negVar = (v: unknown): NegativeVariance => (v === "zero" ? "zero" : "allow");

export function normalizeNestedT(raw: unknown): NestedTOptions {
  const o = raw && typeof raw === "object" ? raw as Partial<NestedTOptions> : {};
  return {
    groupA: idx(o.groupA, 0), groupB: idx(o.groupB, 1), swap: o.swap === true,
    ciLevel: level(o.ciLevel), negativeVariance: negVar(o.negativeVariance),
  };
}

export function normalizeNestedAnova(raw: unknown): NestedAnovaOptions {
  const o = raw && typeof raw === "object" ? raw as Partial<NestedAnovaOptions> : {};
  return {
    comparisons: o.comparisons && o.comparisons in NESTED_COMPARISONS_LABELS
      ? o.comparisons : DEFAULT_NESTED_ANOVA.comparisons,
    controlIndex: idx(o.controlIndex, 0),
    ciLevel: level(o.ciLevel), negativeVariance: negVar(o.negativeVariance),
  };
}

export function groupName(t: DataTableModel, d: number): string {
  return t.datasets[d]?.name?.trim() || `Group ${String.fromCharCode(65 + (d % 26))}`;
}

/** A subcolumn's label: its title, or the grid's automatic "A1", "B2"... */
export function subgroupName(t: DataTableModel, d: number, s: number): string {
  return t.datasets[d]?.subTitles?.[s]?.trim()
    || `${String.fromCharCode(65 + (d % 26))}${s + 1}`;
}

export interface NestedGroup {
  index: number;               // dataset index in the table
  name: string;
  subgroups: { index: number; name: string; values: number[] }[];
}

/** Every dataset with its non-empty subcolumns (excluded cells dropped). */
export function nestedGroups(t: DataTableModel): NestedGroup[] {
  const b = withExclusionsBlanked(t);
  return b.datasets.map((ds, d) => {
    const nSub = Math.max(1, ds.rows[0]?.length ?? 1);
    const subgroups: NestedGroup["subgroups"] = [];
    for (let s = 0; s < nSub; s++) {
      const values = ds.rows.map((row) => parseCell(row[s] ?? ""))
        .filter((v): v is number => v !== null);
      if (values.length) subgroups.push({ index: s, name: subgroupName(t, d, s), values });
    }
    return { index: d, name: groupName(t, d), subgroups };
  });
}

export type Built = { payload: unknown; error?: undefined } | { payload?: undefined; error: string };

function groupsData(groups: NestedGroup[]) {
  return {
    groups: groups.map((g) => ({
      name: g.name,
      subgroups: g.subgroups.map((s) => s.values),
      subgroup_names: g.subgroups.map((s) => s.name),
    })),
  };
}

function checkGroups(groups: NestedGroup[]): string | null {
  const empty = groups.filter((g) => !g.subgroups.length).map((g) => g.name);
  if (empty.length === groups.length) {
    return "Enter replicate values: one subcolumn per subgroup, values down the rows";
  }
  if (empty.length) return `Enter values for ${empty.join(", ")}`;
  const nSub = groups.reduce((a, g) => a + g.subgroups.length, 0);
  if (nSub <= groups.length) {
    return "At least one group needs two or more subcolumns (subgroups) with "
      + "values, or the variance among subgroups cannot be estimated";
  }
  if (!groups.some((g) => g.subgroups.some((s) => s.values.length > 1))) {
    return "Enter more than one replicate value in at least one subcolumn";
  }
  return null;
}

export function nestedTPayload(t: DataTableModel, o: NestedTOptions): Built {
  const all = nestedGroups(t);
  if (all.length < 2) return { error: "The nested t test needs two groups (data set columns)" };
  const a = Math.min(o.groupA, all.length - 1);
  const b = Math.min(o.groupB, all.length - 1);
  if (a === b) return { error: "Choose two different groups to compare" };
  const groups = [all[a], all[b]];
  const err = checkGroups(groups);
  if (err) return { error: err };
  return {
    payload: {
      analysis: "nested_ttest",
      data: groupsData(groups),
      options: { ci_level: o.ciLevel, swap: o.swap, negative_variance: o.negativeVariance },
    },
  };
}

export function nestedAnovaPayload(t: DataTableModel, o: NestedAnovaOptions): Built {
  const groups = nestedGroups(t);
  if (groups.length < 2) return { error: "Nested ANOVA needs at least two groups (data set columns)" };
  const err = checkGroups(groups);
  if (err) return { error: err };
  return {
    payload: {
      analysis: "nested_anova",
      data: groupsData(groups),
      options: {
        comparisons: o.comparisons === "none" ? null : o.comparisons,
        control_index: Math.min(o.controlIndex, groups.length - 1),
        ci_level: o.ciLevel,
        negative_variance: o.negativeVariance,
      },
    },
  };
}

export function runNestedT(engine: Engine, t: DataTableModel, o: NestedTOptions):
  Record<string, unknown> {
  const b = nestedTPayload(t, o);
  if (b.error !== undefined) return { error: b.error };
  return engine.analyze(b.payload) as Record<string, unknown>;
}

export function runNestedAnova(engine: Engine, t: DataTableModel, o: NestedAnovaOptions):
  Record<string, unknown> {
  const b = nestedAnovaPayload(t, o);
  if (b.error !== undefined) return { error: b.error };
  return engine.analyze(b.payload) as Record<string, unknown>;
}

export function nestedAutoTitles(t: DataTableModel) {
  return { x: "", y: t.yTitle || "Value" };
}
