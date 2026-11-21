// Dual-luciferase reporter assay: reading well records (experiment, well,
// group, Firefly and Renilla readings), the engine payload
// (assay_luciferase.luciferase) and the linked table of ratios. Pure,
// unit-tested.
import { normalizeTable } from "../../../project/table.ts";
import type { DataTableModel } from "../../../project/types.ts";
import {
  cellOf, distinctValues, longTable, numberColumn, resolveColumns, textColumn,
  type ColumnChoice, type ColumnIndex, type RoleSpec,
} from "../kit/columns.ts";

export type LRole = "experiment" | "well" | "group" | "firefly" | "renilla";

export const LUC_ROLES: RoleSpec<LRole>[] = [
  { key: "experiment", label: "Experiment (independent transfection)", required: false,
    patterns: [/^(experiment|exp|transfection|replicate|biological replicate|run|day)$/i],
    hint: "With two or more experiments, each experiment counts once in the test." },
  { key: "well", label: "Well", required: false, patterns: [/^(well|well id|position|sample)$/i] },
  { key: "group", label: "Group / construct", required: true,
    patterns: [/^(group|construct|condition|treatment|plasmid)$/i] },
  { key: "firefly", label: "Firefly (experimental reporter)", required: true,
    patterns: [/^(firefly|fluc|f-?luc|firefly rlu|luc2?|experimental)/i] },
  { key: "renilla", label: "Renilla (control reporter)", required: true,
    patterns: [/^(renilla|rluc|r-?luc|renilla rlu|control reporter|hrluc)/i] },
];

export type LTest = "auto" | "ratio_paired" | "rm_anova" | "unpaired" | "anova" | "none";

export const L_TEST_LABELS: Record<LTest, string> = {
  auto: "Automatic: experiments as the unit when recorded, otherwise wells",
  ratio_paired: "Ratio paired t test, experiment as the pair (two groups)",
  rm_anova: "Repeated-measures one-way ANOVA on log ratios, experiment as subject",
  unpaired: "Unpaired t test on log ratios, wells as the unit",
  anova: "One-way ANOVA on log ratios, wells as the unit",
  none: "No statistics",
};

export interface LucOptions {
  columns: ColumnChoice<LRole>;
  controlGroup: string;
  /** Group of mock / untransfected wells used as background ("" = none). */
  blankGroup: string;
  test: LTest;
  comparisons: "dunnett" | "tukey" | "bonferroni" | "sidak";
  /** Flag wells whose Renilla is below this fraction of the median (0 = off). */
  lowRenilla: number;
  ciLevel: number;
}

export const DEFAULT_LUC_OPTIONS: LucOptions = {
  columns: {}, controlGroup: "", blankGroup: "", test: "auto", comparisons: "dunnett",
  lowRenilla: 0.1, ciLevel: 0.95,
};

export function normalizeLucOptions(raw: unknown): LucOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const low = typeof o.lowRenilla === "number" && o.lowRenilla >= 0 && o.lowRenilla < 1 ? o.lowRenilla : 0.1;
  return {
    columns: o.columns && typeof o.columns === "object" ? { ...(o.columns as ColumnChoice<LRole>) } : {},
    controlGroup: typeof o.controlGroup === "string" ? o.controlGroup : "",
    blankGroup: typeof o.blankGroup === "string" ? o.blankGroup : "",
    test: Object.keys(L_TEST_LABELS).includes(o.test as string) ? o.test as LTest : "auto",
    comparisons: ["dunnett", "tukey", "bonferroni", "sidak"].includes(o.comparisons as string)
      ? o.comparisons as LucOptions["comparisons"] : "dunnett",
    lowRenilla: low,
    ciLevel: typeof o.ciLevel === "number" ? o.ciLevel : 0.95,
  };
}

// ------------------------------------------------------------ reading

export interface LucData {
  idx: ColumnIndex<LRole>;
  records: Record<string, unknown>[];
  /** Every group in the table, blank group included. */
  groups: string[];
  experiments: string[];
  problem: string | null;
}

export function readWells(t: DataTableModel, o: LucOptions): LucData {
  const idx = resolveColumns(t, LUC_ROLES, o.columns);
  const missing = LUC_ROLES.filter((r) => r.required && idx[r.key] < 0).map((r) => r.label);
  if (missing.length) {
    return { idx, records: [], groups: [], experiments: [], problem: `Choose the column for: ${missing.join(", ")}.` };
  }
  const exp = textColumn(t, idx.experiment); const well = textColumn(t, idx.well);
  const group = textColumn(t, idx.group);
  const ff = numberColumn(t, idx.firefly); const rl = numberColumn(t, idx.renilla);
  const records: Record<string, unknown>[] = [];
  for (let r = 0; r < t.x.length; r++) {
    if (!group[r] || (ff[r] === null && rl[r] === null)) continue;
    records.push({
      group: group[r], firefly: ff[r], renilla: rl[r], well: well[r] || String(r + 1),
      ...(idx.experiment >= 0 && exp[r] ? { experiment: exp[r] } : {}),
    });
  }
  return {
    idx, records,
    groups: distinctValues(records.map((x) => String(x.group))),
    experiments: distinctValues(records.map((x) => String(x.experiment ?? "")).filter(Boolean)),
    problem: records.length ? null : "No wells yet: each row needs a group and the Firefly and Renilla readings.",
  };
}

const BLANK_RE = /^(mock|blank|background|untransfected|no transfection|non-?transfected|cells only|empty well)$/i;

/** The blank group: the chosen one, else a group named like mock / blank. */
export function blankOf(o: LucOptions, groups: string[]): string {
  if (o.blankGroup === "(none)") return "";
  if (groups.includes(o.blankGroup)) return o.blankGroup;
  return groups.find((g) => BLANK_RE.test(g.trim())) ?? "";
}

/** Groups that are compared (every group but the blank one). */
export function sampleGroups(o: LucOptions, groups: string[]): string[] {
  const b = blankOf(o, groups);
  return groups.filter((g) => g !== b);
}

export const controlOf = (o: LucOptions, groups: string[]): string => {
  const s = sampleGroups(o, groups);
  return s.includes(o.controlGroup) ? o.controlGroup : s[0] ?? "";
};

// ------------------------------------------------------------ engine

/* eslint-disable @typescript-eslint/no-explicit-any */

export type LucResult = Record<string, any> & { error?: string };

export function lucPayload(d: LucData, o: LucOptions): unknown {
  const blank = blankOf(o, d.groups);
  return {
    analysis: "luciferase",
    data: { records: d.records },
    options: {
      control_group: controlOf(o, d.groups), ...(blank ? { blank_group: blank } : {}),
      groups: sampleGroups(o, d.groups), test: o.test, comparisons: o.comparisons,
      low_renilla: o.lowRenilla, ci_level: o.ciLevel,
    },
  };
}

export function runLuc(analyze: (p: unknown) => unknown, t: DataTableModel, o: LucOptions): LucResult {
  const d = readWells(t, o);
  if (d.problem) return { error: d.problem };
  if (!sampleGroups(o, d.groups).length) return { error: "Every well is in the blank group: add the groups to compare." };
  return analyze(lucPayload(d, o)) as LucResult;
}

// ------------------------------------------------------------ outputs

/** Linked column table of Firefly / Renilla ratios: with experiments, one
 *  row per experiment (its wells averaged), set up for the ratio paired t
 *  test or repeated-measures ANOVA; without, one row per well. */
export function ratioTable(res: LucResult): DataTableModel | null {
  if (!res || res.error) return null;
  const groups: string[] = res.groups ?? [];
  if (!groups.length) return null;
  if (res.unit === "experiment") {
    const m = res.matched_ratio;
    if (!m || !Array.isArray(m.experiments) || !m.experiments.length) return null;
    return normalizeTable({
      type: "column", x: m.experiments.map(() => ""), rowTitles: m.experiments.map(String),
      yTitle: "Firefly / Renilla (mean of the wells)",
      datasets: groups.map((g) => ({
        name: g, rows: m.experiments.map((_: unknown, i: number) => [cellOf(m.groups?.[g]?.[i] ?? null)]),
      })),
    });
  }
  const by: Record<string, number[]> = res.ratios_by_group ?? {};
  const n = Math.max(0, ...groups.map((g) => by[g]?.length ?? 0));
  if (!n) return null;
  return normalizeTable({
    type: "column", x: Array.from({ length: n }, () => ""),
    yTitle: "Firefly / Renilla",
    datasets: groups.map((g) => ({
      name: g, rows: Array.from({ length: n }, (_, i) => [cellOf(by[g]?.[i] ?? null)]),
    })),
  });
}

export function ratioSettings(prev: unknown, table: DataTableModel | null, res: LucResult): unknown {
  const p = (prev && typeof prev === "object" ? prev : {}) as Record<string, unknown>;
  const k = table?.datasets.length ?? 0;
  if (res?.unit !== "experiment") return p;
  if (k === 2) return { ...p, analysis: "ttest", ttestKind: "ratio_paired", datasetA: 1, datasetB: 0 };
  if (k > 2) return { ...p, analysis: "rm_anova", rmKind: "parametric", comparisons: "dunnett", controlIndex: 0 };
  return p;
}

export const WELL_COLUMNS: [LRole, string, "categorical" | "continuous"][] = [
  ["experiment", "Experiment", "categorical"], ["well", "Well", "categorical"],
  ["group", "Group", "categorical"], ["firefly", "Firefly", "continuous"],
  ["renilla", "Renilla", "continuous"],
];

export function wellTable(rows: Partial<Record<LRole, string>>[]): DataTableModel {
  return longTable(WELL_COLUMNS.map(([k, name, varType]) => ({
    name, varType, values: rows.map((r) => r[k] ?? ""),
  })));
}
