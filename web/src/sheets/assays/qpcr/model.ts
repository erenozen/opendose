// qPCR relative quantification: reading long Cq records (and an optional
// dilution-series block for efficiencies) from the input table, the
// engine payload (assay_qpcr.qpcr_analysis), the linked ΔCq table and the
// Cq-export import (share/recipes qPCR recipe). Pure, unit-tested.
//
// Layout: one row per well. Sample, Group, Target, Cq, Well, Pair
// (optional: links samples of one subject / experiment for paired tests)
// and Quantity (optional: rows with a quantity are a dilution series of
// their target, used for its efficiency instead of a sample).
import { normalizeTable } from "../../../project/table.ts";
import type { DataTableModel } from "../../../project/types.ts";
import {
  cellOf, distinctValues, longTable, numberColumn, resolveColumns, textColumn,
  type ColumnChoice, type ColumnIndex, type RoleSpec,
} from "../kit/columns.ts";
import { aliasPatterns, resolveCqHeaders, type CqRole } from "./headers.ts";
import { referenceCandidates, referenceCheckPayload } from "./refs.ts";

export type QRole = "sample" | "group" | "target" | "cq" | "well" | "pair" | "quantity";

// Header aliases (case, separators and instrument spellings) are shared
// with the Cq-export import: ./headers.ts.
export const QPCR_ROLES: RoleSpec<QRole>[] = [
  { key: "sample", label: "Sample (biological replicate)", required: true, patterns: aliasPatterns("sample") },
  { key: "group", label: "Group / condition", required: true, patterns: aliasPatterns("group") },
  { key: "target", label: "Target (gene)", required: true, patterns: aliasPatterns("target") },
  { key: "cq", label: "Cq / Ct", required: true, patterns: aliasPatterns("cq") },
  { key: "well", label: "Well", required: false, patterns: aliasPatterns("well") },
  { key: "pair", label: "Pair (subject / experiment)", required: false, patterns: aliasPatterns("pair"),
    hint: "Samples sharing a pair are compared paired (repeated measures)." },
  { key: "quantity", label: "Quantity (dilution series)", required: false, patterns: aliasPatterns("quantity"),
    hint: "Rows with a quantity form a standard curve of their target." },
];

export type QTest = "auto" | "unpaired" | "welch" | "paired" | "anova" | "rm_anova" | "none";

export const TEST_LABELS: Record<QTest, string> = {
  auto: "Automatic (t test or one-way ANOVA; paired / repeated measures when pairs are given)",
  unpaired: "Unpaired t test", welch: "Welch t test (unequal SDs)", paired: "Paired t test",
  anova: "One-way ANOVA", rm_anova: "Repeated-measures one-way ANOVA", none: "No statistics",
};

export type PostTest = "dunnett" | "tukey" | "bonferroni" | "sidak";

export interface QpcrOptions {
  columns: ColumnChoice<QRole>;
  referenceGenes: string[];
  /** Reference genes the stability check covers besides those in use
   *  (kept when a one-click choice sets one aside, refs.ts). */
  referenceCandidates: string[];
  calibrator: string;
  efficiencyMode: "assumed" | "entered" | "curve";
  /** target -> factor (2 = 100%) or percent, as typed. */
  efficiencies: Record<string, string>;
  maxCq: number;
  maxSpread: number;
  excludeHighCq: boolean;
  /** Cq given to undetermined wells ("" = left out). */
  undetermined: string;
  test: QTest;
  comparisons: PostTest;
  ciLevel: number;
  output?: string;
}

export const DEFAULT_QPCR_OPTIONS: QpcrOptions = {
  columns: {}, referenceGenes: [], referenceCandidates: [], calibrator: "", efficiencyMode: "assumed", efficiencies: {},
  maxCq: 35, maxSpread: 0.5, excludeHighCq: false, undetermined: "", test: "auto",
  comparisons: "dunnett", ciLevel: 0.95,
};

export function normalizeQpcrOptions(raw: unknown): QpcrOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_QPCR_OPTIONS;
  const num = (v: unknown, def: number) => (typeof v === "number" && Number.isFinite(v) ? v : def);
  const eff: Record<string, string> = {};
  if (o.efficiencies && typeof o.efficiencies === "object") {
    for (const [k, v] of Object.entries(o.efficiencies as Record<string, unknown>)) {
      if (typeof v === "string" || typeof v === "number") eff[k] = String(v);
    }
  }
  return {
    columns: o.columns && typeof o.columns === "object" ? { ...(o.columns as ColumnChoice<QRole>) } : {},
    referenceGenes: Array.isArray(o.referenceGenes) ? o.referenceGenes.filter((x): x is string => typeof x === "string") : [],
    referenceCandidates: Array.isArray(o.referenceCandidates)
      ? o.referenceCandidates.filter((x): x is string => typeof x === "string") : [],
    calibrator: typeof o.calibrator === "string" ? o.calibrator : "",
    efficiencyMode: o.efficiencyMode === "entered" || o.efficiencyMode === "curve" ? o.efficiencyMode : "assumed",
    efficiencies: eff,
    maxCq: num(o.maxCq, d.maxCq), maxSpread: num(o.maxSpread, d.maxSpread),
    excludeHighCq: o.excludeHighCq === true,
    undetermined: typeof o.undetermined === "string" ? o.undetermined : "",
    test: Object.keys(TEST_LABELS).includes(o.test as string) ? o.test as QTest : "auto",
    comparisons: ["dunnett", "tukey", "bonferroni", "sidak"].includes(o.comparisons as string)
      ? o.comparisons as PostTest : "dunnett",
    ciLevel: num(o.ciLevel, d.ciLevel),
    ...(typeof o.output === "string" ? { output: o.output } : {}),
  };
}

// ------------------------------------------------------------ reading

export interface QRecord { sample: string; group: string; target: string; cq: string; well: string; pair: string }

export interface QData {
  idx: ColumnIndex<QRole>;
  records: QRecord[];
  /** target -> dilution-series points */
  curves: Record<string, { quantity: number; cq: string }[]>;
  targets: string[];
  groups: string[];
  problem: string | null;
}

export function readQpcr(t: DataTableModel, o: QpcrOptions): QData {
  const idx = resolveColumns(t, QPCR_ROLES, o.columns);
  const missing = QPCR_ROLES.filter((r) => r.required && idx[r.key] < 0).map((r) => r.label);
  const empty: QData = { idx, records: [], curves: {}, targets: [], groups: [], problem: null };
  if (missing.length) return { ...empty, problem: `Choose the column for: ${missing.join(", ")}.` };
  const col = (k: QRole) => textColumn(t, idx[k]);
  const sample = col("sample"); const group = col("group"); const target = col("target");
  const cq = col("cq"); const well = col("well"); const pair = col("pair");
  const qty = numberColumn(t, idx.quantity);
  const records: QRecord[] = [];
  const curves: QData["curves"] = {};
  for (let r = 0; r < t.x.length; r++) {
    if (!target[r] || (!sample[r] && qty[r] === null)) continue;
    if (qty[r] !== null && qty[r]! > 0) {
      (curves[target[r]] ??= []).push({ quantity: qty[r]!, cq: cq[r] });
      continue;
    }
    if (!cq[r] && !sample[r]) continue;
    records.push({ sample: sample[r], group: group[r], target: target[r], cq: cq[r], well: well[r], pair: pair[r] });
  }
  const targets = distinctValues(records.map((x) => x.target));
  const groups = distinctValues(records.map((x) => x.group));
  return {
    idx, records, curves, targets, groups,
    problem: records.length ? null : "No Cq records yet: each row needs a sample, a target and a Cq.",
  };
}

/** Reference genes: the saved choice, else targets named like common
 *  housekeeping genes, else none (the user must choose). */
export function referenceGenes(o: QpcrOptions, targets: string[]): string[] {
  const chosen = o.referenceGenes.filter((g) => targets.includes(g));
  if (chosen.length) return chosen;
  return targets.filter((g) => /^(gapdh|actb|b2m|hprt1?|rplp0|18s|tbp|ppia|ywhaz|ubc|rpl13a|sdha|hmbs|gusb|tubb|β-?actin|beta-?actin)$/i.test(g));
}

export function calibratorOf(o: QpcrOptions, groups: string[]): string {
  return groups.includes(o.calibrator) ? o.calibrator : groups[0] ?? "";
}

// ------------------------------------------------------------ engine

/* eslint-disable @typescript-eslint/no-explicit-any */

export type QpcrResult = Record<string, any> & { error?: string };

export function qpcrPayload(d: QData, o: QpcrOptions): unknown {
  const refs = referenceGenes(o, d.targets);
  const options: Record<string, unknown> = {
    reference_genes: refs, calibrator: calibratorOf(o, d.groups),
    max_cq: o.maxCq, max_spread: o.maxSpread, exclude_high_cq: o.excludeHighCq,
    test: o.test, comparisons: o.comparisons, ci_level: o.ciLevel,
  };
  // A reference gene set aside by the reference check is not a target.
  const aside = referenceCandidates(refs, o.referenceCandidates, d.targets).filter((g) => !refs.includes(g));
  if (aside.length) options.targets = d.targets.filter((g) => !refs.includes(g) && !aside.includes(g));
  const und = Number(o.undetermined);
  if (o.undetermined.trim() !== "" && Number.isFinite(und)) options.undetermined_value = und;
  if (o.efficiencyMode === "entered") {
    const eff: Record<string, number> = {};
    for (const [k, v] of Object.entries(o.efficiencies)) {
      const n = Number(v);
      if (v.trim() !== "" && Number.isFinite(n) && n > 0 && d.targets.includes(k)) eff[k] = n;
    }
    options.efficiencies = eff;
  }
  const data: Record<string, unknown> = {
    records: d.records.map((r) => ({
      sample: r.sample, group: r.group || null, target: r.target, cq: r.cq,
      ...(r.well ? { well: r.well } : {}), ...(r.pair ? { pair: r.pair } : {}),
    })),
  };
  if (o.efficiencyMode === "curve") {
    data.standard_curves = Object.fromEntries(Object.entries(d.curves)
      .filter(([, pts]) => pts.length >= 3));
  }
  return { analysis: "qpcr", data, options };
}

export function runQpcr(analyze: (p: unknown) => unknown, t: DataTableModel, o: QpcrOptions): QpcrResult {
  const d = readQpcr(t, o);
  if (d.problem) return { error: d.problem };
  const refs = referenceGenes(o, d.targets);
  if (!refs.length) {
    return { error: "Choose the reference gene(s) in the setup wizard." };
  }
  const res = analyze(qpcrPayload(d, o)) as QpcrResult;
  // Genes set aside from the normalisation stay in the reference check
  // (refs.ts), so the reason they were left out remains on the sheet.
  const cands = referenceCandidates(refs, o.referenceCandidates, d.targets);
  if (!res || res.error || cands.length === refs.length) return res;
  const eff: Record<string, number> = {};
  for (const g of cands) {
    const e = res.efficiencies?.[g]?.efficiency;
    if (typeof e === "number") eff[g] = e;
  }
  const check = analyze(referenceCheckPayload(d, o, cands, String(res.calibrator ?? calibratorOf(o, d.groups)),
    eff, res.groups)) as QpcrResult;
  return { ...res, reference_stability: check && !check.error ? check : { error: String(check?.error ?? "no result") } };
}

// ------------------------------------------------------------ outputs

/** Linked table of ΔCq per biological sample (the values the statistics
 *  run on): a column table (groups as columns) for one target, a grouped
 *  table (targets as rows, groups as data sets, samples as replicates)
 *  for several. */
export function dcqTable(res: QpcrResult): DataTableModel | null {
  if (!res || res.error || !Array.isArray(res.results)) return null;
  const groups: string[] = res.groups ?? [];
  const targets: string[] = res.targets ?? [];
  const vals = (t: string, g: string): number[] => res.results
    .filter((r: any) => r.target === t && r.group === g && typeof r.dcq === "number")
    .map((r: any) => r.dcq);
  if (!targets.length || !groups.length) return null;
  if (targets.length === 1) {
    const n = Math.max(1, ...groups.map((g) => vals(targets[0], g).length));
    return normalizeTable({
      type: "column", x: Array<string>(n).fill(""),
      yTitle: `ΔCq (${targets[0]} − reference)`,
      datasets: groups.map((g) => {
        const v = vals(targets[0], g);
        return { name: g, rows: Array.from({ length: n }, (_, i) => [cellOf(v[i] ?? null)]) };
      }),
    });
  }
  const width = Math.max(1, ...targets.flatMap((t) => groups.map((g) => vals(t, g).length)));
  return normalizeTable({
    type: "grouped", x: targets.map(() => ""), rowTitles: targets, yTitle: "ΔCq (target − reference)",
    datasets: groups.map((g) => ({
      name: g,
      rows: targets.map((t) => {
        const v = vals(t, g);
        return Array.from({ length: width }, (_, i) => cellOf(v[i] ?? null));
      }),
    })),
  });
}

/** Statistics on the linked ΔCq table: Dunnett vs the calibrator (first
 *  column) for three or more groups, an unpaired t test for two. */
export function dcqSettings(prev: unknown, table: DataTableModel | null): unknown {
  const p = (prev && typeof prev === "object" ? prev : {}) as Record<string, unknown>;
  if (!table || table.type !== "column") return p;
  const k = table.datasets.length;
  if (k === 2) return { ...p, analysis: "ttest", ttestKind: "unpaired", datasetA: 0, datasetB: 1 };
  if (k > 2) return { ...p, analysis: "anova", anovaKind: "parametric", comparisons: "dunnett", controlIndex: 0 };
  return p;
}

// ------------------------------------------------------------ import

/** Cq export staged by the qPCR recipe (columns: role per header) into
 *  the module's layout. The group is taken from the sample name with its
 *  trailing replicate number removed ("Ctrl 2" -> "Ctrl", "LPS-3" ->
 *  "LPS") unless the export has a group column. `columns` (role -> column
 *  index, from the import's mapping step) overrides the header match. */
export function tableFromStaging(headers: string[], rows: string[][], groupFromName: boolean,
  columns?: Partial<Record<CqRole, number>>): DataTableModel {
  const roleIdx: Record<CqRole, number> = { ...resolveCqHeaders(headers), ...(columns ?? {}) };
  const get = (row: string[], k: CqRole) => (roleIdx[k] >= 0 ? (row[roleIdx[k]] ?? "").trim() : "");
  const sample = rows.map((r) => get(r, "sample"));
  const group = rows.map((r, i) => get(r, "group")
    || (groupFromName ? sample[i].replace(/[\s_.-]*\(?\d+\)?$/, "").trim() || sample[i] : ""));
  return longTable([
    { name: "Sample", varType: "categorical", values: sample },
    { name: "Group", varType: "categorical", values: group },
    { name: "Target", varType: "categorical", values: rows.map((r) => get(r, "target")) },
    { name: "Cq", varType: "continuous", values: rows.map((r) => get(r, "cq")) },
    { name: "Well", varType: "categorical", values: rows.map((r) => get(r, "well")) },
    { name: "Pair", varType: "categorical", values: rows.map((r) => get(r, "pair")) },
  ]);
}
