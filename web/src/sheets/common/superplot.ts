// SuperPlots (Lord, Velle, Mullins & Fritz-Laylin 2020, J Cell Biol):
// every value shown and coloured by its biological replicate (independent
// experiment), each replicate's mean drawn as a larger symbol, and the
// statistics run on the replicate means, so n is the number of
// experiments rather than the number of cells.
//
// The table says which values belong to which experiment
// (DataTableModel.replicates, see project/types.ts ReplicateMap); the
// graph sheet holds the display settings (SuperPlotSettings). Pure.
import { parseCell } from "../../project/table.ts";
import type { DataTableModel, ReplicateMap } from "../../project/types.ts";
import { summarize, type CellStat } from "../grouped/stats.ts";

// ------------------------------------------------------------ settings

export type SuperCenter = "mean" | "median";
export type SuperError = "sd" | "sem" | "ci" | "none";
export type SuperEncode = "both" | "color" | "shape";

export interface SuperPlotSettings {
  /** SuperPlot mode. Unset: on when the graph draws statistics on
   *  replicate means, off otherwise. */
  on?: boolean;
  /** Each replicate's summary symbol. */
  center: SuperCenter;
  /** Spread of the replicate means around the grand mean. */
  error: SuperError;
  /** How replicates are told apart: colour and symbol, or one of them. */
  encode: SuperEncode;
  /** Join each replicate's means across groups (matched experiments). */
  link: boolean;
}

export const DEFAULT_SUPERPLOT: SuperPlotSettings = {
  center: "mean", error: "sd", encode: "both", link: false,
};

const obj = (v: unknown): Record<string, unknown> =>
  (v && typeof v === "object" ? v as Record<string, unknown> : {});

export function normalizeSuperPlot(raw: unknown): SuperPlotSettings {
  const o = obj(raw);
  const d = DEFAULT_SUPERPLOT;
  const out: SuperPlotSettings = {
    center: o.center === "median" ? "median" : d.center,
    error: o.error === "sem" || o.error === "ci" || o.error === "none" ? o.error : d.error,
    encode: o.encode === "color" || o.encode === "shape" ? o.encode : d.encode,
    link: typeof o.link === "boolean" ? o.link : d.link,
  };
  if (typeof o.on === "boolean") out.on = o.on;
  return out;
}

/** Whether SuperPlot mode is on for a graph with these settings and this
 *  bound result. */
export function superPlotOn(s: SuperPlotSettings, result: unknown): boolean {
  return s.on ?? isReplicateMeansResult(result);
}

// ------------------------------------------------------------ replicates

export interface ReplicateInfo {
  source: "subcolumns" | "column";
  /** Replicate (experiment) names, in order. */
  names: string[];
  /** Data sets that are groups (every data set but an id column). */
  groups: number[];
  /** The id column (source "column"), else null. */
  idColumn: number | null;
  /** Replicate index of the value at (data set, row, subcolumn); -1 = none. */
  of: (ds: number, row: number, sub: number) => number;
}

const maxSub = (t: DataTableModel) =>
  Math.max(1, ...t.datasets.map((d) => d.rows[0]?.length ?? 1));

/** The replicate structure of a table (subcolumns by default). */
export function replicateInfo(table: DataTableModel): ReplicateInfo {
  const map: ReplicateMap = table.replicates ?? { by: "subcolumns" };
  const col = map.column;
  if (map.by === "column" && table.type === "column" && Number.isInteger(col)
    && col! >= 0 && col! < table.datasets.length && table.datasets.length > 1) {
    const idDs = table.datasets[col!];
    const labels = idDs.rows.map((r) => (r[0] ?? "").trim());
    const names: string[] = [];
    const idx = new Map<string, number>();
    for (const l of labels) {
      if (l && !idx.has(l)) { idx.set(l, names.length); names.push(l); }
    }
    const byRow = labels.map((l) => (l ? idx.get(l)! : -1));
    return {
      source: "column",
      names: names.map((n, i) => map.names?.[i]?.trim() || n),
      groups: table.datasets.map((_, i) => i).filter((i) => i !== col),
      idColumn: col!,
      of: (ds, row) => (ds === col ? -1 : byRow[row] ?? -1),
    };
  }
  const n = maxSub(table);
  const of = Array.from({ length: n }, (_, k) => {
    const v = map.by === "subcolumns" ? map.of?.[k] : undefined;
    return Number.isInteger(v) && v! >= 0 ? v! : k;
  });
  // Keep replicate numbers dense (0..R-1) in order of first use.
  const used = [...new Set(of)].sort((a, b) => a - b);
  const dense = new Map(used.map((r, i) => [r, i]));
  const ofDense = of.map((r) => dense.get(r)!);
  const first = (r: number) => ofDense.indexOf(r);
  const names = used.map((r, i) => map.names?.[r]?.trim()
    || table.datasets[0]?.subTitles?.[first(i)]?.trim()
    || `Experiment ${i + 1}`);
  return {
    source: "subcolumns",
    names,
    groups: table.datasets.map((_, i) => i),
    idColumn: null,
    of: (_ds, _row, sub) => (sub >= 0 && sub < ofDense.length ? ofDense[sub] : -1),
  };
}

/** Whether a table has at least two replicates to compare. */
export function hasReplicates(table: DataTableModel): boolean {
  return table.subcolumnFormat === "replicates" && replicateInfo(table).names.length >= 2;
}

export interface ReplicatePoint { value: number; row: number; sub: number; rep: number }

/** Values of one data set with their replicate (values with no replicate,
 *  e.g. a blank id, are left out). */
export function replicatePoints(table: DataTableModel, ds: number,
  info: ReplicateInfo = replicateInfo(table)): ReplicatePoint[] {
  const out: ReplicatePoint[] = [];
  table.datasets[ds]?.rows.forEach((row, r) => row.forEach((cell, s) => {
    const v = parseCell(cell);
    const rep = info.of(ds, r, s);
    if (v !== null && rep >= 0) out.push({ value: v, row: r, sub: s, rep });
  }));
  return out;
}

export interface GroupReplicates {
  ds: number;
  name: string;
  /** Summary (mean or median) of each replicate; null = no values. */
  means: (number | null)[];
  /** Values per replicate. */
  counts: number[];
  points: ReplicatePoint[];
  /** Grand summary across the replicate means. */
  grand: CellStat | null;
}

const center = (v: number[], how: SuperCenter): number | null => {
  if (!v.length) return null;
  if (how === "mean") return v.reduce((a, b) => a + b, 0) / v.length;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Per group: points, replicate means and the grand summary of the means. */
export function replicateSummary(table: DataTableModel, how: SuperCenter = "mean"):
  { info: ReplicateInfo; groups: GroupReplicates[] } {
  const info = replicateInfo(table);
  const groups = info.groups.map((ds) => {
    const points = replicatePoints(table, ds, info);
    const byRep = info.names.map(() => [] as number[]);
    for (const p of points) byRep[p.rep]?.push(p.value);
    const means = byRep.map((v) => center(v, how));
    const ok = means.filter((m): m is number => m !== null);
    return {
      ds,
      name: table.datasets[ds].name || `Data set ${ds + 1}`,
      means,
      counts: byRep.map((v) => v.length),
      points,
      grand: ok.length ? summarize(ok) : null,
    };
  });
  return { info, groups };
}

/** The replicate-mean table: a column table with one data set per group
 *  and one row per replicate (row titles = replicate names), so paired
 *  tests and repeated-measures ANOVA match the groups by experiment. */
export function replicateMeanTable(table: DataTableModel, how: SuperCenter = "mean"):
  DataTableModel {
  const { info, groups } = replicateSummary(table, how);
  const cell = (v: number | null) => (v === null ? "" : String(v));
  return {
    type: "column",
    x: info.names.map(() => ""),
    xTitle: "",
    xFormat: "numbers",
    xUnit: "",
    yTitle: table.yTitle,
    rowTitles: [...info.names],
    datasets: groups.map((g) => ({ name: g.name, rows: g.means.map((m) => [cell(m)]) })),
    subcolumnFormat: "replicates",
    replicateLayout: "side_by_side",
  };
}

/** A grouped table's replicate means: same rows and data sets, one
 *  subcolumn per replicate holding the mean of its subcolumns. */
export function groupedReplicateMeanTable(table: DataTableModel, how: SuperCenter = "mean"):
  DataTableModel {
  const info = replicateInfo({ ...table, type: "grouped" });
  const R = info.names.length;
  return {
    ...table,
    replicates: undefined,
    datasets: table.datasets.map((d, di) => ({
      name: d.name,
      subTitles: [...info.names],
      rows: d.rows.map((row, r) => Array.from({ length: R }, (_, k) => {
        const vals = row.flatMap((c, s) => {
          const v = parseCell(c);
          return v !== null && info.of(di, r, s) === k ? [v] : [];
        });
        const m = center(vals, how);
        return m === null ? "" : String(m);
      })),
    })),
  };
}

/** Number of experiments that contributed to each group (the n of
 *  statistics on replicate means). */
export function replicateCounts(groups: GroupReplicates[]): number[] {
  return groups.map((g) => g.means.filter((m) => m !== null).length);
}

// ------------------------------------------------------------ results

export interface ReplicateMeansInfo {
  /** Number of experiments (replicates) the statistics used. */
  n: number;
  replicates: string[];
  center: SuperCenter;
}

/** The `superplot` block a statistics-on-replicate-means result carries. */
export function replicateMeansInfo(result: unknown): ReplicateMeansInfo | null {
  const s = obj(obj(result).superplot);
  return typeof s.n === "number" && Array.isArray(s.replicates)
    ? { n: s.n, replicates: s.replicates.map(String), center: s.center === "median" ? "median" : "mean" }
    : null;
}

export function isReplicateMeansResult(result: unknown): boolean {
  return replicateMeansInfo(result) !== null && !obj(result).error;
}
