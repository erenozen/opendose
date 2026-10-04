// Clustered heat maps: the matrix a grouped table (cell means, rows ×
// data sets) or a multiple-variables table (observations × continuous
// variables) gives, the options of the engine's cluster_heatmap, and the
// cluster memberships as a table. Pure (no React).
import { normalizeTable, parseCell, withExclusionsBlanked } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";

export const A_CLUSTER = "cluster_heatmap";
export const G_CLUSTER = "clustered_heatmap";

export type Linkage = "average" | "complete" | "single" | "ward" | "weighted" | "centroid" | "median";
export type Metric = "euclidean" | "manhattan" | "correlation";
export type Scaling = "none" | "center" | "zscore";
export type Axis = "rows" | "columns";

export const LINKAGE_LABEL: Record<Linkage, string> = {
  average: "Average (UPGMA)",
  complete: "Complete (furthest neighbour)",
  single: "Single (nearest neighbour)",
  ward: "Ward (minimum variance)",
  weighted: "Weighted average (WPGMA)",
  centroid: "Centroid (UPGMC)",
  median: "Median (WPGMC)",
};
export const METRIC_LABEL: Record<Metric, string> = {
  euclidean: "Euclidean",
  manhattan: "Manhattan (city block)",
  correlation: "Correlation (1 − Pearson r)",
};
export const SCALE_LABEL: Record<Scaling, string> = {
  none: "None (values as entered)",
  center: "Centre (subtract the mean)",
  zscore: "z-score (subtract the mean, divide by the SD)",
};

export interface ClusterOptions {
  method: Linkage;
  metric: Metric;
  scale: Scaling;
  scaleAxis: Axis;
  clusterRows: boolean;
  clusterColumns: boolean;
  /** Cut each tree into k clusters ("" = no cut). */
  kRows: string;
  kColumns: string;
  kmeans: boolean;
  kmeansK: string;
  kmeansAxis: Axis;
  seed: string;
  chooseK: boolean;
  kMax: string;
  /** Multiple-variables tables: variables to use ([] = every continuous). */
  variables: string[];
  /** Multiple-variables tables: variable naming each row ("" = row titles). */
  labelVariable: string;
  /** Grouped tables: what a cell's replicates collapse to. */
  cell: "mean" | "median";
}

export const DEFAULT_CLUSTER: ClusterOptions = {
  method: "average",
  metric: "euclidean",
  scale: "zscore",
  scaleAxis: "rows",
  clusterRows: true,
  clusterColumns: true,
  kRows: "",
  kColumns: "",
  kmeans: false,
  kmeansK: "3",
  kmeansAxis: "rows",
  seed: "1",
  chooseK: false,
  kMax: "8",
  variables: [],
  labelVariable: "",
  cell: "mean",
};

const pick = <T extends string>(v: unknown, allowed: readonly T[], d: T): T =>
  (typeof v === "string" && (allowed as readonly string[]).includes(v) ? v as T : d);

export function normalizeCluster(raw: unknown, table?: DataTableModel): ClusterOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_CLUSTER;
  const s = (k: keyof ClusterOptions) => (typeof o[k] === "string" ? o[k] as string : d[k] as string);
  const b = (k: keyof ClusterOptions) => (typeof o[k] === "boolean" ? o[k] as boolean : d[k] as boolean);
  let labelVariable = s("labelVariable");
  if (!("labelVariable" in o) && table?.type === "multivariable") {
    const i = table.datasets.findIndex((x) => x.varType === "categorical");
    labelVariable = i >= 0 ? table.datasets[i].name.trim() : "";
  }
  return {
    method: pick(o.method, Object.keys(LINKAGE_LABEL) as Linkage[], d.method),
    metric: pick(o.metric, Object.keys(METRIC_LABEL) as Metric[], d.metric),
    scale: pick(o.scale, ["none", "center", "zscore"] as const, d.scale),
    scaleAxis: pick(o.scaleAxis, ["rows", "columns"] as const, d.scaleAxis),
    clusterRows: b("clusterRows"),
    clusterColumns: b("clusterColumns"),
    kRows: s("kRows"),
    kColumns: s("kColumns"),
    kmeans: b("kmeans"),
    kmeansK: s("kmeansK"),
    kmeansAxis: pick(o.kmeansAxis, ["rows", "columns"] as const, d.kmeansAxis),
    seed: s("seed"),
    chooseK: b("chooseK"),
    kMax: s("kMax"),
    variables: Array.isArray(o.variables) ? o.variables.filter((v): v is string => typeof v === "string") : [],
    labelVariable,
    cell: o.cell === "median" ? "median" : "mean",
  };
}

export interface ClusterMatrix {
  values: number[][];
  rowNames: string[];
  colNames: string[];
  /** Rows left out because a value is missing. */
  dropped: string[];
  error?: string;
}

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Make row / column names unique (heat-map axes key on them). */
function unique(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const k = seen.get(n) ?? 0;
    seen.set(n, k + 1);
    return k ? `${n} (${k + 1})` : n;
  });
}

export function clusterMatrix(table: DataTableModel, o: ClusterOptions): ClusterMatrix {
  const t = withExclusionsBlanked(table);
  const values: number[][] = [];
  const rowNames: string[] = [];
  const dropped: string[] = [];
  let colNames: string[] = [];
  if (t.type === "grouped") {
    colNames = t.datasets.map((d, j) => d.name.trim() || `Data set ${j + 1}`);
    t.rowTitles.forEach((title, r) => {
      const name = title.trim() || `Row ${r + 1}`;
      const row = t.datasets.map((d) => {
        const v = (d.rows[r] ?? []).map(parseCell).filter((x): x is number => x !== null);
        if (!v.length) return null;
        return o.cell === "median" ? median(v) : v.reduce((a, b) => a + b, 0) / v.length;
      });
      if (row.every((v) => v === null)) return;
      if (row.some((v) => v === null)) { dropped.push(name); return; }
      values.push(row as number[]);
      rowNames.push(name);
    });
  } else if (t.type === "multivariable") {
    const names = t.datasets.map((d, i) => d.name.trim() || `Variable ${i + 1}`);
    const cols = names.map((n, i) => ({ n, i })).filter(({ n, i }) =>
      t.datasets[i].varType !== "categorical" && n !== o.labelVariable
      && (!o.variables.length || o.variables.includes(n)));
    colNames = cols.map((c) => c.n);
    const li = o.labelVariable ? names.indexOf(o.labelVariable) : -1;
    for (let r = 0; r < t.x.length; r++) {
      const label = (li >= 0 ? t.datasets[li].rows[r]?.[0] : t.rowTitles[r])?.trim() || `Row ${r + 1}`;
      const row = cols.map(({ i }) => parseCell(t.datasets[i].rows[r]?.[0] ?? ""));
      if (row.every((v) => v === null)) continue;
      if (row.some((v) => v === null)) { dropped.push(label); continue; }
      values.push(row as number[]);
      rowNames.push(label);
    }
  } else {
    return { values: [], rowNames: [], colNames: [], dropped: [],
      error: "Clustered heat maps read grouped or multiple-variables tables" };
  }
  if (values.length < 2 && colNames.length < 2) {
    return { values, rowNames, colNames, dropped, error: "Clustering needs at least two complete rows or two columns" };
  }
  if (!values.length) return { values, rowNames, colNames, dropped, error: "No complete rows to cluster" };
  return { values, rowNames: unique(rowNames), colNames: unique(colNames), dropped };
}

const int = (s: string, lo: number, hi: number): number | null => {
  const v = parseCell(s);
  if (v === null) return null;
  const k = Math.round(v);
  return k >= lo && k <= hi ? k : null;
};

export function clusterPayload(m: ClusterMatrix, o: ClusterOptions): Record<string, unknown> {
  const nr = m.values.length;
  const nc = m.colNames.length;
  const options: Record<string, unknown> = {
    method: o.method, metric: o.metric, scale: o.scale, scale_axis: o.scaleAxis,
    cluster_rows: o.clusterRows, cluster_columns: o.clusterColumns,
  };
  const kr = o.clusterRows ? int(o.kRows, 2, nr) : null;
  const kc = o.clusterColumns ? int(o.kColumns, 2, nc) : null;
  if (kr) options.k_rows = kr;
  if (kc) options.k_columns = kc;
  const seed = int(o.seed, 0, 2 ** 31) ?? 0;
  const items = o.kmeansAxis === "columns" ? nc : nr;
  if (o.kmeans) {
    const k = int(o.kmeansK, 1, items);
    if (k) options.kmeans = { k, axis: o.kmeansAxis, seed, n_init: 10 };
  }
  if (o.chooseK && items >= 3) {
    options.choose_k = { k_max: Math.min(int(o.kMax, 2, 30) ?? 8, items - 1), axis: o.kmeansAxis,
      seed, n_init: 10, n_reference: 20 };
  }
  return {
    analysis: "cluster_heatmap",
    data: { values: m.values, row_names: m.rowNames, column_names: m.colNames },
    options,
  };
}

/** Cluster memberships (hierarchical cut and / or k-means) as a
 *  multiple-variables table, one row per item in the original order. */
interface MembershipInput {
  rows?: { clusters?: number[] };
  columns?: { clusters?: number[] };
  kmeans?: { labels: number[]; axis: string; silhouette?: { widths: number[] } };
}

export function membershipTable(raw: object, m: ClusterMatrix, o: ClusterOptions): DataTableModel | null {
  const result = raw as MembershipInput;
  const axis: Axis = result.kmeans ? (result.kmeans.axis === "columns" ? "columns" : "rows")
    : result.rows?.clusters ? "rows" : result.columns?.clusters ? "columns" : o.kmeansAxis;
  const names = axis === "columns" ? m.colNames : m.rowNames;
  const cut = axis === "columns" ? result.columns?.clusters : result.rows?.clusters;
  const km = result.kmeans;
  if (!cut && !km) return null;
  const lab = (v: number | undefined) => (v === undefined ? "" : String(v + 1));
  const datasets: { name: string; varType: "categorical" | "continuous"; rows: string[][] }[] = [
    { name: axis === "columns" ? "Column" : "Row", varType: "categorical", rows: names.map((n) => [n]) },
  ];
  if (cut) datasets.push({ name: "Tree cluster", varType: "categorical", rows: names.map((_, i) => [lab(cut[i])]) });
  if (km) {
    datasets.push({ name: "k-means cluster", varType: "categorical", rows: names.map((_, i) => [lab(km.labels[i])]) });
    if (km.silhouette) {
      datasets.push({ name: "Silhouette width", varType: "continuous",
        rows: names.map((_, i) => [String(Number((km.silhouette!.widths[i] ?? 0).toPrecision(8)))]) });
    }
  }
  return normalizeTable({ type: "multivariable", rowTitles: names.map(() => ""), datasets });
}
