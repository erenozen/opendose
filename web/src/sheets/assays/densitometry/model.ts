// Western blot densitometry: reading lane records (blot, lane, group,
// target and loading-control signals with their backgrounds), the engine
// payload (assay_densitometry.densitometry), the matched linked table and
// the ImageJ / Image Lab import with a column picker. Pure, unit-tested.
import { normalizeTable } from "../../../project/table.ts";
import type { DataTableModel } from "../../../project/types.ts";
import {
  cellOf, distinctValues, longTable, numberColumn, resolveColumns, textColumn,
  type ColumnChoice, type ColumnIndex, type RoleSpec,
} from "../kit/columns.ts";

export type DRole = "blot" | "lane" | "sample" | "group" | "target" | "reference" | "background" | "refBackground";

export const DENS_ROLES: RoleSpec<DRole>[] = [
  { key: "blot", label: "Blot (experiment)", required: true,
    patterns: [/^(blot|membrane|gel|experiment|replicate|exp)$/i] },
  { key: "lane", label: "Lane", required: false, patterns: [/^(lane|lane number|well)$/i] },
  { key: "sample", label: "Sample", required: false, patterns: [/^(sample|name|label)$/i] },
  { key: "group", label: "Group / treatment", required: true,
    patterns: [/^(group|treatment|condition)$/i] },
  { key: "target", label: "Target signal", required: true,
    patterns: [/^(target|target signal|protein|band|volume|adj\.? ?volume|intden|signal)/i] },
  { key: "reference", label: "Loading control / total protein", required: false,
    patterns: [/^(reference|loading|loading control|housekeeping|total protein|actin|β-?actin|beta-?actin|gapdh|tubulin|vinculin|reference signal)/i],
    hint: "Without it, target signals are compared as they are." },
  { key: "background", label: "Target background", required: false,
    patterns: [/^(target background|background|bkgd|bg)$/i] },
  { key: "refBackground", label: "Reference background", required: false,
    patterns: [/^(reference background|ref\.? background|loading background|ref bkgd)$/i] },
];

export type DTest = "auto" | "ratio_paired" | "one_sample" | "rm_anova" | "none";

export const D_TEST_LABELS: Record<DTest, string> = {
  auto: "Automatic: ratio paired t test (two groups) or repeated-measures ANOVA on logs (more)",
  ratio_paired: "Ratio paired t test, blot as the pair",
  one_sample: "One-sample t test of log fold changes against 1",
  rm_anova: "Repeated-measures one-way ANOVA on log values, blot as subject",
  none: "No statistics",
};

export interface DensOptions {
  columns: ColumnChoice<DRole>;
  controlGroup: string;
  controlMode: "group" | "lane";
  /** blot -> control lane, when each blot is normalised to one lane. */
  controlLanes: Record<string, string>;
  /** Raw intensity at or above which a band is saturated ("" = none). */
  saturation: string;
  test: DTest;
  comparisons: "dunnett" | "tukey" | "bonferroni" | "sidak";
  ciLevel: number;
  output?: string;
}

export const DEFAULT_DENS_OPTIONS: DensOptions = {
  columns: {}, controlGroup: "", controlMode: "group", controlLanes: {}, saturation: "",
  test: "auto", comparisons: "dunnett", ciLevel: 0.95,
};

export function normalizeDensOptions(raw: unknown): DensOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const lanes: Record<string, string> = {};
  if (o.controlLanes && typeof o.controlLanes === "object") {
    for (const [k, v] of Object.entries(o.controlLanes as Record<string, unknown>)) {
      if (typeof v === "string" || typeof v === "number") lanes[k] = String(v);
    }
  }
  return {
    columns: o.columns && typeof o.columns === "object" ? { ...(o.columns as ColumnChoice<DRole>) } : {},
    controlGroup: typeof o.controlGroup === "string" ? o.controlGroup : "",
    controlMode: o.controlMode === "lane" ? "lane" : "group",
    controlLanes: lanes,
    saturation: typeof o.saturation === "string" ? o.saturation : "",
    test: Object.keys(D_TEST_LABELS).includes(o.test as string) ? o.test as DTest : "auto",
    comparisons: ["dunnett", "tukey", "bonferroni", "sidak"].includes(o.comparisons as string)
      ? o.comparisons as DensOptions["comparisons"] : "dunnett",
    ciLevel: typeof o.ciLevel === "number" ? o.ciLevel : 0.95,
    ...(typeof o.output === "string" ? { output: o.output } : {}),
  };
}

// ------------------------------------------------------------ reading

export interface DensData {
  idx: ColumnIndex<DRole>;
  records: Record<string, unknown>[];
  blots: string[];
  groups: string[];
  problem: string | null;
}

export function readLanes(t: DataTableModel, o: DensOptions): DensData {
  const idx = resolveColumns(t, DENS_ROLES, o.columns);
  const missing = DENS_ROLES.filter((r) => r.required && idx[r.key] < 0).map((r) => r.label);
  if (missing.length) {
    return { idx, records: [], blots: [], groups: [], problem: `Choose the column for: ${missing.join(", ")}.` };
  }
  const blot = textColumn(t, idx.blot); const lane = textColumn(t, idx.lane);
  const sample = textColumn(t, idx.sample); const group = textColumn(t, idx.group);
  const target = numberColumn(t, idx.target); const ref = numberColumn(t, idx.reference);
  const bg = numberColumn(t, idx.background); const rbg = numberColumn(t, idx.refBackground);
  const records: Record<string, unknown>[] = [];
  for (let r = 0; r < t.x.length; r++) {
    if (!blot[r] || !group[r] || target[r] === null) continue;
    records.push({
      blot: blot[r], lane: lane[r] || String(r + 1), group: group[r],
      ...(sample[r] ? { sample: sample[r] } : {}),
      target: target[r], reference: idx.reference >= 0 ? ref[r] : null,
      ...(bg[r] !== null ? { background: bg[r] } : {}),
      ...(rbg[r] !== null ? { reference_background: rbg[r] } : {}),
    });
  }
  return {
    idx, records,
    blots: distinctValues(records.map((x) => String(x.blot))),
    groups: distinctValues(records.map((x) => String(x.group))),
    problem: records.length ? null : "No lanes yet: each row needs a blot, a group and a target signal.",
  };
}

export const controlOf = (o: DensOptions, groups: string[]): string =>
  groups.includes(o.controlGroup) ? o.controlGroup : groups[0] ?? "";

// ------------------------------------------------------------ engine

/* eslint-disable @typescript-eslint/no-explicit-any */

export type DensResult = Record<string, any> & { error?: string };

export function densPayload(d: DensData, o: DensOptions): unknown {
  const options: Record<string, unknown> = {
    control_group: controlOf(o, d.groups), test: o.test, comparisons: o.comparisons, ci_level: o.ciLevel,
  };
  const sat = Number(o.saturation);
  if (o.saturation.trim() !== "" && Number.isFinite(sat) && sat > 0) options.saturation_limit = sat;
  if (o.controlMode === "lane") {
    const lanes = Object.fromEntries(Object.entries(o.controlLanes)
      .filter(([b, l]) => d.blots.includes(b) && l.trim() !== ""));
    if (Object.keys(lanes).length) options.control_lanes = lanes;
  }
  return { analysis: "densitometry", data: { records: d.records }, options };
}

export function runDens(analyze: (p: unknown) => unknown, t: DataTableModel, o: DensOptions): DensResult {
  const d = readLanes(t, o);
  if (d.problem) return { error: d.problem };
  return analyze(densPayload(d, o)) as DensResult;
}

// ------------------------------------------------------------ outputs

/** Linked column table, blots down the rows (matched): each group's
 *  normalised signal (target / loading control, background-corrected,
 *  mean of its lanes in that blot). Ratio paired tests on it give the
 *  same ratios as the fold changes, without the control-fixed-at-1 trap. */
export function matchedTable(res: DensResult): DataTableModel | null {
  const m = res?.matched_normalized;
  if (!m || res.error || !Array.isArray(m.blots) || !m.blots.length) return null;
  const groups: string[] = res.groups ?? Object.keys(m.groups ?? {});
  return normalizeTable({
    type: "column",
    x: m.blots.map(() => ""),
    rowTitles: m.blots.map(String),
    yTitle: "Normalised signal (target / loading control)",
    datasets: groups.map((g) => ({
      name: g, rows: m.blots.map((_: unknown, i: number) => [cellOf(m.groups?.[g]?.[i] ?? null)]),
    })),
  });
}

export function matchedSettings(prev: unknown, table: DataTableModel | null): unknown {
  const p = (prev && typeof prev === "object" ? prev : {}) as Record<string, unknown>;
  const k = table?.datasets.length ?? 0;
  if (k === 2) return { ...p, analysis: "ttest", ttestKind: "ratio_paired", datasetA: 0, datasetB: 1 };
  if (k > 2) return { ...p, analysis: "rm_anova", rmKind: "parametric", comparisons: "dunnett", controlIndex: 0 };
  return p;
}

// ------------------------------------------------------------ import

export interface ImportMap {
  /** module role -> source column index (-1 = none) */
  roles: Partial<Record<DRole, number>>;
  /** Rows are bands: this column says which protein a row is ... */
  bandColumn: number;
  /** ... and these values mark the target and the loading control. */
  targetValue: string;
  referenceValue: string;
  /** Blot for every row when the export has no blot column. */
  blotName: string;
}

/** Guess the roles of an export's columns from their headers. */
export function guessImport(headers: string[]): ImportMap {
  const t = longTable(headers.map((h) => ({ name: h, varType: "categorical" as const, values: [] })));
  const idx = resolveColumns(t, DENS_ROLES, {});
  const roles: ImportMap["roles"] = {};
  for (const r of DENS_ROLES) roles[r.key] = idx[r.key];
  // Image Lab: "Adj. Volume (Int)" is background-corrected already
  const adj = headers.findIndex((h) => /adj\.?\s*(total\s*)?(band\s*)?vol/i.test(h));
  if (adj >= 0) roles.target = adj;
  return { roles, bandColumn: -1, targetValue: "", referenceValue: "", blotName: "Blot 1" };
}

/** Build the module's table from an export's data rows. */
export function tableFromExport(rows: string[][], m: ImportMap): DataTableModel {
  const get = (row: string[], k: DRole) => {
    const i = m.roles[k] ?? -1;
    return i >= 0 ? (row[i] ?? "").trim() : "";
  };
  const out: Record<DRole, string>[] = [];
  if (m.bandColumn >= 0 && m.targetValue) {
    // one row per band: pair target and loading-control rows by blot and lane
    const key = (row: string[]) => `${get(row, "blot") || m.blotName}\u0000${get(row, "lane")}`;
    const refs = new Map<string, string[]>();
    for (const row of rows) {
      if ((row[m.bandColumn] ?? "").trim() === m.referenceValue) refs.set(key(row), row);
    }
    for (const row of rows) {
      if ((row[m.bandColumn] ?? "").trim() !== m.targetValue) continue;
      const ref = refs.get(key(row));
      out.push({
        blot: get(row, "blot") || m.blotName, lane: get(row, "lane"), sample: get(row, "sample"),
        group: get(row, "group"), target: get(row, "target"), background: get(row, "background"),
        reference: ref ? get(ref, "target") : "", refBackground: ref ? get(ref, "background") : "",
      });
    }
  } else {
    for (const row of rows) {
      if (row.every((c) => !c.trim())) continue;
      out.push({
        blot: get(row, "blot") || m.blotName, lane: get(row, "lane"), sample: get(row, "sample"),
        group: get(row, "group"), target: get(row, "target"), reference: get(row, "reference"),
        background: get(row, "background"), refBackground: get(row, "refBackground"),
      });
    }
  }
  return laneTable(out);
}

export const LANE_COLUMNS: [DRole, string, "categorical" | "continuous"][] = [
  ["blot", "Blot", "categorical"], ["lane", "Lane", "categorical"], ["sample", "Sample", "categorical"],
  ["group", "Group", "categorical"], ["target", "Target", "continuous"],
  ["reference", "Loading control", "continuous"], ["background", "Target background", "continuous"],
  ["refBackground", "Reference background", "continuous"],
];

export function laneTable(rows: Partial<Record<DRole, string>>[]): DataTableModel {
  return longTable(LANE_COLUMNS.map(([k, name, varType]) => ({
    name, varType, values: rows.map((r) => r[k] ?? ""),
  })));
}
