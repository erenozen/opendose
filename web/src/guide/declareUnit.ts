// "What does each value represent?" (need `declare-experimental-unit`):
// asked above the results of a table whose shape suggests replicates (two
// or more subcolumns, or six or more values in a group) until answered or
// dismissed; the answer is kept on the data sheet (DataSheet.report.valueIs).
//
//  - an independent experiment / an animal: n is the number of values; the
//    unit goes to the reporting details ("n = 6 animals per group");
//  - a technical repeat / a cell: the values are not independent (GraphPad
//    Statistics Guide, "The need for independent samples"; Lazic 2010). The
//    table gets a replicate map (which values share an experiment: one
//    subcolumn each, blocks of subcolumns, or blocks of rows through an
//    "Experiment" label data set), the family's graphs become SuperPlots,
//    and column / grouped tables get "Statistics on replicate means", so
//    the test's n is the experiments and the legend reads "n = 3
//    independent experiments (9 wells) per group". XY tables get the map
//    (the legend counts experiments; curve fits keep every value).
// Pure apart from ids (injected); unit-tested.
import type { IdFactory } from "../project/ids.ts";
import { findSheet, updateSheet, updateTable } from "../project/ops.ts";
import type {
  DataSheet, DataTableModel, GraphSheet, Project, ReplicateMap, Sheet,
} from "../project/types.ts";
import type { ValueIs } from "../report/meta.ts";
import { normalizeSuperPlot, replicateInfo } from "../sheets/common/superplot.ts";

export type ValueKind = Exclude<ValueIs, "dismissed">;

export const VALUE_KINDS: { id: ValueKind; label: string; name: string }[] = [
  { id: "experiment", label: "An independent experiment", name: "Each value is an independent experiment" },
  { id: "animal", label: "An animal or patient", name: "Each value is an animal or patient" },
  { id: "technical", label: "A technical repeat (well, read)", name: "Each value is a technical repeat" },
  { id: "cell", label: "A cell or field", name: "Each value is a cell or field" },
];

/** Which values share an experiment, for technical repeats and cells. */
export type Layout = "subcolumns" | "subcolumn-blocks" | "row-blocks";

export interface UnitAnswer {
  kind: ValueKind;
  layout?: Layout;
  /** Subcolumns or rows per experiment (blocks). */
  size?: number;
  /** What one value is ("wells", "cells"). */
  unit?: string;
}

const MAPPABLE = new Set(["column", "grouped", "xy"]);
const maxSub = (t: DataTableModel) => Math.max(1, ...t.datasets.map((d) => d.rows[0]?.length ?? 1));
const filled = (c: string | undefined) => (c ?? "").trim() !== "";

/** Values in each data set (all subcolumns). */
function perGroup(t: DataTableModel): number[] {
  return t.datasets.map((d) => d.rows.reduce((a, r) => a + r.filter(filled).length, 0));
}

/** Does this data sheet get the question? */
export function needsUnitQuestion(data: DataSheet | null | undefined): boolean {
  if (!data || data.kind !== "data" || data.derived) return false;
  const t = data.table;
  if (!MAPPABLE.has(t.type) || t.subcolumnFormat !== "replicates") return false;
  if (data.report?.valueIs || data.report?.unit || t.replicates) return false;
  const counts = perGroup(t);
  if (!counts.some((n) => n > 0)) return false;
  return maxSub(t) >= 2 || (t.type === "column" && Math.max(...counts) >= 6);
}

/** The layouts that fit the table, the first being the default. */
export function layoutsFor(t: DataTableModel): Layout[] {
  const n = maxSub(t);
  const out: Layout[] = [];
  if (n >= 2) out.push("subcolumns");
  if (n >= 4) out.push("subcolumn-blocks");
  if (t.type === "column" && n === 1) out.push("row-blocks");
  return out;
}

/** Rows holding any value (the last one), for row blocks. */
function lastRow(t: DataTableModel): number {
  let last = -1;
  t.datasets.forEach((d) => d.rows.forEach((r, i) => { if (r.some(filled)) last = Math.max(last, i); }));
  return last;
}

/** A sensible block size: 3 when it divides the values, else 2, else 1. */
export function defaultBlock(t: DataTableModel, layout: Layout): number {
  const n = layout === "row-blocks" ? lastRow(t) + 1 : maxSub(t);
  for (const k of [3, 2, 4]) if (n >= 2 * k && n % k === 0) return k;
  return n >= 2 ? Math.max(1, Math.floor(n / 2)) : 1;
}

/** The table with the replicate map the answer describes. */
export function mapTable(t: DataTableModel, a: UnitAnswer): DataTableModel {
  const unit = a.unit?.trim() || (a.kind === "cell" ? "cells" : "wells");
  const layout = a.layout ?? layoutsFor(t)[0] ?? "subcolumns";
  const size = Math.max(1, Math.floor(a.size ?? defaultBlock(t, layout)));
  if (layout === "row-blocks" && t.type === "column") {
    const last = lastRow(t);
    const labels = t.x.map((_, r) => (r <= last ? [`E${Math.floor(r / size) + 1}`] : [""]));
    const datasets = [...t.datasets, { name: "Experiment", rows: labels }];
    return { ...t, datasets,
      replicates: { by: "column", column: datasets.length - 1, unit } };
  }
  const n = maxSub(t);
  const of = Array.from({ length: n }, (_, k) => (layout === "subcolumn-blocks" ? Math.floor(k / size) : k));
  const map: ReplicateMap = { by: "subcolumns", unit, ...(layout === "subcolumn-blocks" ? { of } : {}) };
  return { ...t, replicates: map };
}

/** Experiments and values per group the answer would give (for the
 *  preview line: "3 experiments, 9 wells per group"). */
export function previewOf(t: DataTableModel, a: UnitAnswer): { experiments: number; values: number[] } {
  const m = mapTable(t, a);
  const info = replicateInfo(m.type === "column" ? m : { ...m, type: "grouped" });
  const idCol = info.idColumn;
  const values = t.type === "grouped" || t.type === "xy"
    ? t.datasets.flatMap((d) => d.rows.map((r) => r.filter(filled).length)).filter((n) => n > 0)
    : perGroup(t).filter((_, i) => i !== idCol).filter((n) => n > 0);
  return { experiments: info.names.length, values };
}

const REP_MEANS: Record<string, string> = {
  column: "column_replicate_means", grouped: "grouped_replicate_means",
};
const SUPERPLOT_KINDS = new Set(["scatter", "bar", "box", "violin", "grouped_interleaved",
  "grouped_separated", "grouped_scatter"]);

function withReport(p: Project, dataId: string, valueIs: ValueIs, unit?: string): Project {
  return updateSheet<Sheet>(p, dataId, (s) => {
    if (s.kind !== "data") return s;
    const report = { ...(s.report ?? {}), valueIs,
      ...(unit && !s.report?.unit ? { unit } : {}) };
    return { ...s, report };
  });
}

/** The results sheet adder (guide/actions.ts addConfiguredAnalysis),
 *  injected so this module stays free of the registry. */
export type AddAnalysis = (p: Project, dataId: string, analysisId: string, ids: IdFactory) =>
  { project: Project; resultsId: string | null };

/** Apply an answer (or "dismissed"). Returns the project and the sheet to
 *  show next (the replicate-means results, when one was added). */
export function applyUnitAnswer(p: Project, dataId: string, a: UnitAnswer | "dismissed",
  ids: IdFactory, addAnalysis?: AddAnalysis): { project: Project; select: string | null } {
  const data = findSheet(p, dataId);
  if (!data || data.kind !== "data") return { project: p, select: null };
  if (a === "dismissed") return { project: withReport(p, dataId, "dismissed"), select: null };
  if (a.kind === "experiment") {
    return { project: withReport(p, dataId, "experiment", "independent experiments"), select: null };
  }
  if (a.kind === "animal") return { project: withReport(p, dataId, "animal", "animals"), select: null };
  let q = withReport(p, dataId, a.kind);
  q = updateTable(q, dataId, (t) => mapTable(t, a));
  // The family's graphs show every experiment (SuperPlot).
  for (const g of q.sheets) {
    if (g.kind !== "graph" || g.parentId !== dataId || g.frozen || !SUPERPLOT_KINDS.has(g.graphType)) continue;
    const key = g.graphType.startsWith("grouped_") ? "grouped" : "column";
    q = updateSheet<Sheet>(q, g.id, (s) => {
      if (s.kind !== "graph") return s;
      const own = (s.settings[key] ?? {}) as Record<string, unknown>;
      return { ...s, settings: { ...s.settings,
        [key]: { ...own, superplot: { ...normalizeSuperPlot(own.superplot), on: true } } } };
    });
  }
  const means = REP_MEANS[data.table.type];
  if (!means || !addAnalysis) return { project: q, select: null };
  const existing = q.sheets.find((s) => s.kind === "results" && s.parentId === dataId && s.analysis === means);
  if (existing) return { project: q, select: existing.id };
  const info = replicateInfo(findSheet(q, dataId)?.kind === "data"
    ? (findSheet(q, dataId) as DataSheet).table : data.table);
  if (info.names.length < 2) return { project: q, select: null };
  const r = addAnalysis(q, dataId, means, ids);
  return { project: r.project, select: r.resultsId };
}

/** Graph sheets of a family bound to a results sheet (for tests). */
export function graphsOf(p: Project, dataId: string): GraphSheet[] {
  return p.sheets.filter((s): s is GraphSheet => s.kind === "graph" && s.parentId === dataId);
}
