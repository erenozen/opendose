// Option objects of the grouped-table analyses and graphs, with defaults
// and normalizers for options read from older files. Pure (no React).
import type { TwoWayComparisons, TwoWayDirection, TwoWayModel } from "../../types.ts";
import type { ErrorKind, HeatPalette } from "./stats.ts";
import { isPointSpread, type PointSpread } from "../../graph/swarm.ts";
import { normalizeSuperPlot, type SuperPlotSettings } from "../common/superplot.ts";

// Analysis ids, stored in results sheets: never rename.
export const A_TWO_WAY = "grouped_two_way";
export const A_THREE_WAY = "grouped_three_way";
export const A_MULTI_T = "grouped_multiple_t";
export const A_ROW_MEANS = "grouped_row_means";
export const A_COLUMN_STATS = "grouped_column_stats";
export const A_REPLICATE_MEANS = "grouped_replicate_means";

// Graph kind ids, stored in graph sheets: never rename.
export const G_INTERLEAVED = "grouped_interleaved";
export const G_STACKED = "grouped_stacked";
export const G_SEPARATED = "grouped_separated";
export const G_SCATTER = "grouped_scatter";
export const G_BOX = "grouped_box";
export const G_LINES = "grouped_lines";
export const G_THREE_WAY = "grouped_three_way";
export const G_HEATMAP = "grouped_heatmap";
export const G_VOLCANO = "grouped_volcano";

const obj = (raw: unknown): Record<string, unknown> =>
  (raw && typeof raw === "object" ? raw as Record<string, unknown> : {});

function pick<T extends string>(v: unknown, allowed: readonly T[], d: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v)
    ? v as T : d;
}
const str = (v: unknown, d: string) => (typeof v === "string" ? v : d);
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const num = (v: unknown, d: number) =>
  (typeof v === "number" && Number.isFinite(v) ? v : d);
const int = (v: unknown, d: number) => Math.max(0, Math.round(num(v, d)));

// ------------------------------------------------------------ two-way

export type TwoWayDesign = "none" | "rm_rows" | "rm_both";
export type RmFit = "auto" | "mixed";

export interface TwoWayOptions {
  design: TwoWayDesign;
  rmFit: RmFit;
  rowFactor: string;
  colFactor: string;
  comparisons: TwoWayComparisons;
  direction: TwoWayDirection;
  /** Ordinary design: full model (with interaction) or main effects only. */
  model: TwoWayModel;
  /** Show the Interaction block first ("Is the treatment effect different
   *  between groups?", guide/interaction.ts). Absent = after the ANOVA. */
  interactionFocus?: boolean;
}

export const DEFAULT_TWO_WAY: TwoWayOptions = {
  design: "none",
  rmFit: "auto",
  rowFactor: "Row factor",
  colFactor: "Column factor",
  comparisons: "none",
  direction: "columns_within_rows",
  model: "full",
};

/** Factor names for the results: what the user typed, else the names the
 *  table carries from its file (row-title header, long-file factor
 *  columns), else "Row factor" / "Column factor". */
export function twoWayFactorNames(o: Pick<TwoWayOptions, "rowFactor" | "colFactor">,
  table: { factorNames?: { rows?: string; datasets?: string } }): [string, string] {
  const pick = (typed: string, def: string, fromTable?: string) => {
    const t = typed.trim();
    return t && t !== def ? t : fromTable?.trim() || t || def;
  };
  return [pick(o.rowFactor, DEFAULT_TWO_WAY.rowFactor, table.factorNames?.rows),
    pick(o.colFactor, DEFAULT_TWO_WAY.colFactor, table.factorNames?.datasets)];
}

export function normalizeTwoWay(raw: unknown): TwoWayOptions {
  const o = obj(raw);
  const d = DEFAULT_TWO_WAY;
  return {
    design: pick(o.design, ["none", "rm_rows", "rm_both"] as const, d.design),
    rmFit: pick(o.rmFit, ["auto", "mixed"] as const, d.rmFit),
    rowFactor: str(o.rowFactor, d.rowFactor),
    colFactor: str(o.colFactor, d.colFactor),
    comparisons: pick(o.comparisons,
      ["none", "tukey", "sidak", "bonferroni"] as const, d.comparisons),
    direction: pick(o.direction, ["columns_within_rows", "rows_within_columns",
      "column_means", "row_means", "all_cells"] as const, d.direction),
    model: pick(o.model, ["full", "additive"] as const, d.model),
    ...(o.interactionFocus === true ? { interactionFocus: true } : {}),
  };
}

/** Two-way ANOVA on replicate means (SuperPlots): the two-way options plus
 *  how each experiment is summarised. Experiments run every condition, so
 *  the default design matches them across rows and data sets. */
export interface RepTwoWayOptions extends TwoWayOptions {
  center: "mean" | "median";
}

export const DEFAULT_REP_TWO_WAY: RepTwoWayOptions = {
  ...DEFAULT_TWO_WAY, design: "rm_both", center: "mean",
};

export function normalizeRepTwoWay(raw: unknown): RepTwoWayOptions {
  const o = obj(raw);
  return {
    ...normalizeTwoWay({ design: DEFAULT_REP_TWO_WAY.design, ...o }),
    center: o.center === "median" ? "median" : "mean",
  };
}

// ------------------------------------------------------------ three-way

export type ThreeWayMethod =
  | "none_cmp" | "tukey" | "dunnett" | "sidak" | "bonferroni" | "holm_sidak"
  | "fisher" | "bky" | "bh" | "by";

export type ThreeWayGoal =
  | "all_cells" | "control" | "one_factor" | "row1_below" | "row_means"
  | "row_means_control" | "factor_b_means" | "factor_c_means";

export interface ThreeWayOptions {
  /** Names of factor A (rows), B and C. */
  factorNames: [string, string, string];
  bLevels: [string, string];
  cLevels: [string, string];
  /** Per dataset: [B level, C level] (0 or 1), or null = not used. */
  assign: ([number, number] | null)[];
  method: ThreeWayMethod;
  goal: ThreeWayGoal;
  oneFactor: "any" | "a" | "b" | "c";
  /** Control cell [row, B level, C level] for goal "control". */
  control: [number, number, number];
  controlRow: number;
  alpha: string;
  q: string;
}

/** The guide's layout: data sets A and B vs. C and D are factor B, A and
 *  C vs. B and D are factor C; columns after D are not used. */
export function defaultAssign(nDatasets: number): ([number, number] | null)[] {
  return Array.from({ length: nDatasets }, (_, d) =>
    (d < 4 ? [Math.floor(d / 2), d % 2] as [number, number] : null));
}

export function defaultThreeWay(nDatasets: number): ThreeWayOptions {
  return {
    factorNames: ["Row factor", "Factor B", "Factor C"],
    bLevels: ["B1", "B2"],
    cLevels: ["C1", "C2"],
    assign: defaultAssign(nDatasets),
    method: "none_cmp",
    goal: "all_cells",
    oneFactor: "any",
    control: [0, 0, 0],
    controlRow: 0,
    alpha: "0.05",
    q: "5",
  };
}

const pair = (v: unknown, d: [string, string]): [string, string] =>
  (Array.isArray(v) && v.length === 2 ? [str(v[0], d[0]), str(v[1], d[1])] : d);

export function normalizeThreeWay(raw: unknown, nDatasets: number): ThreeWayOptions {
  const o = obj(raw);
  const d = defaultThreeWay(nDatasets);
  const fn = Array.isArray(o.factorNames) && o.factorNames.length === 3
    ? o.factorNames.map((v, i) => str(v, d.factorNames[i])) as [string, string, string]
    : d.factorNames;
  let assign = d.assign;
  if (Array.isArray(o.assign)) {
    assign = Array.from({ length: nDatasets }, (_, i) => {
      const a = (o.assign as unknown[])[i];
      if (a === null) return null;
      if (Array.isArray(a) && a.length === 2) {
        return [int(a[0], 0) > 0 ? 1 : 0, int(a[1], 0) > 0 ? 1 : 0] as [number, number];
      }
      return d.assign[i];
    });
  }
  const ctl = Array.isArray(o.control) && o.control.length === 3
    ? o.control.map((v) => int(v, 0)) as [number, number, number] : d.control;
  return {
    factorNames: fn,
    bLevels: pair(o.bLevels, d.bLevels),
    cLevels: pair(o.cLevels, d.cLevels),
    assign,
    method: pick(o.method, ["none_cmp", "tukey", "dunnett", "sidak", "bonferroni",
      "holm_sidak", "fisher", "bky", "bh", "by"] as const, d.method),
    goal: pick(o.goal, ["all_cells", "control", "one_factor", "row1_below",
      "row_means", "row_means_control", "factor_b_means", "factor_c_means"] as const,
    d.goal),
    oneFactor: pick(o.oneFactor, ["any", "a", "b", "c"] as const, d.oneFactor),
    control: ctl,
    controlRow: int(o.controlRow, 0),
    alpha: str(o.alpha, d.alpha),
    q: str(o.q, d.q),
  };
}

// ------------------------------------------------------------ multiple t

export type RowTest =
  | "welch" | "unpaired" | "pooled" | "lognormal_welch" | "lognormal_unpaired"
  | "lognormal_pooled" | "paired" | "ratio_paired" | "mann_whitney"
  | "kolmogorov_smirnov" | "wilcoxon";

export const ROW_TEST_GROUPS: { label: string; tests: [RowTest, string][] }[] = [
  { label: "Parametric (unpaired)", tests: [
    ["welch", "Welch t test (unequal SDs)"],
    ["unpaired", "Unpaired t test (equal SDs, per row)"],
    ["pooled", "Unpaired t test, SD pooled across rows"],
  ] },
  { label: "Lognormal (unpaired)", tests: [
    ["lognormal_welch", "Welch t test on logarithms"],
    ["lognormal_unpaired", "Unpaired t test on logarithms"],
    ["lognormal_pooled", "t test on logarithms, SD pooled across rows"],
  ] },
  { label: "Paired", tests: [
    ["paired", "Paired t test"],
    ["ratio_paired", "Ratio paired t test"],
    ["wilcoxon", "Wilcoxon matched-pairs signed rank"],
  ] },
  { label: "Nonparametric (unpaired)", tests: [
    ["mann_whitney", "Mann-Whitney test"],
    ["kolmogorov_smirnov", "Kolmogorov-Smirnov test"],
  ] },
];

export const ROW_TEST_LABEL: Record<RowTest, string> = Object.fromEntries(
  ROW_TEST_GROUPS.flatMap((g) => g.tests)) as Record<RowTest, string>;

export type Correction =
  | "bky" | "bh" | "by" | "holm_sidak" | "holm" | "sidak" | "bonferroni" | "none";

export const CORRECTION_LABEL: Record<Correction, string> = {
  bky: "Two-stage step-up (Benjamini, Krieger, Yekutieli)",
  bh: "Original FDR method (Benjamini-Hochberg)",
  by: "FDR under dependence (Benjamini-Yekutieli)",
  holm_sidak: "Holm-Šídák step-down",
  holm: "Holm (Bonferroni step-down)",
  sidak: "Šídák-Bonferroni",
  bonferroni: "Bonferroni-Dunn",
  none: "None (each P value on its own)",
};

export const FDR_METHODS: Correction[] = ["bky", "bh", "by"];

/** Tests run on logarithms: differences are reported as ratios. */
export const LOG_TESTS: string[] = ["lognormal_welch", "lognormal_unpaired",
  "lognormal_pooled", "ratio_paired"];

export interface MultiTOptions {
  test: RowTest;
  method: Correction;
  q: string;       // percent
  alpha: string;
  datasetA: number;
  datasetB: number;
  swap: boolean;
}

export const DEFAULT_MULTI_T: MultiTOptions = {
  test: "welch", method: "bky", q: "5", alpha: "0.05",
  datasetA: 0, datasetB: 1, swap: false,
};

export function normalizeMultiT(raw: unknown): MultiTOptions {
  const o = obj(raw);
  const d = DEFAULT_MULTI_T;
  return {
    test: pick(o.test, Object.keys(ROW_TEST_LABEL) as RowTest[], d.test),
    method: pick(o.method, Object.keys(CORRECTION_LABEL) as Correction[], d.method),
    q: str(o.q, d.q),
    alpha: str(o.alpha, d.alpha),
    datasetA: int(o.datasetA, d.datasetA),
    datasetB: int(o.datasetB, d.datasetB),
    swap: bool(o.swap, d.swap),
  };
}

// ------------------------------------------------------------ row means

export type RowCalc = "mean" | "total" | "median" | "geometric_mean";
export type RowScope = "row" | "all_values" | "dataset";

export const ROW_ERRORS: Record<RowCalc, [string, string][]> = {
  mean: [["sd", "SD"], ["sem", "SEM"], ["cv", "%CV"], ["ci", "95% CI"], ["none", "None"]],
  median: [["quartiles", "Quartiles"], ["minmax", "Minimum and maximum"],
    ["percentiles", "Percentiles"], ["none", "None"]],
  geometric_mean: [["geometric_sd", "Geometric SD factor"], ["ci", "95% CI"],
    ["none", "None"]],
  total: [["none", "None"]],
};

export interface RowMeansOptions {
  calculate: RowCalc;
  error: string;
  scope: RowScope;
  percentile: string;
}

export const DEFAULT_ROW_MEANS: RowMeansOptions = {
  calculate: "mean", error: "sd", scope: "row", percentile: "10",
};

export function normalizeRowMeans(raw: unknown): RowMeansOptions {
  const o = obj(raw);
  const d = DEFAULT_ROW_MEANS;
  const calculate = pick(o.calculate,
    ["mean", "total", "median", "geometric_mean"] as const, d.calculate);
  const errs = ROW_ERRORS[calculate].map(([k]) => k);
  return {
    calculate,
    error: pick(o.error, errs, errs[0]),
    scope: pick(o.scope, ["row", "all_values", "dataset"] as const, d.scope),
    percentile: str(o.percentile, d.percentile),
  };
}

// ------------------------------------------------------------ column stats

export interface ColumnStatsOptions {
  /** "dataset": each dataset with all its rows pooled; "cell": every
   *  row × dataset cell on its own. */
  unit: "dataset" | "cell";
  hypothetical: string;
}

export const DEFAULT_COLUMN_STATS: ColumnStatsOptions = { unit: "cell", hypothetical: "" };

export function normalizeColumnStats(raw: unknown): ColumnStatsOptions {
  const o = obj(raw);
  return {
    unit: pick(o.unit, ["dataset", "cell"] as const, DEFAULT_COLUMN_STATS.unit),
    hypothetical: str(o.hypothetical, ""),
  };
}

// ------------------------------------------------------------ graph settings

export interface GroupedGraphSettings {
  error: ErrorKind;
  errorDir: "both" | "above";
  points: boolean;
  grand: "none" | "mean" | "median";
  /** Which variable forms the clusters on the X axis; null = the graph
   *  kind's default (rows, except separated bars: datasets). */
  clusterBy: "rows" | "datasets" | null;
  clusterGap: number;   // fraction of the cluster pitch
  barGap: number;       // fraction of one bar width
  seriesReverse: boolean;
  clustersReverse: boolean;
  lineMode: "means" | "subjects";
  legend: boolean;
  /** How the points of a cell are spread sideways. */
  spread: PointSpread;
  /** Legend sentence (error-bar meaning and n): under the graph, in the
   *  figure, or off (sheets/column/graphSettings.ts CaptionMode). */
  caption: "off" | "below" | "figure";
  superplot: SuperPlotSettings;
}

export const DEFAULT_GRAPH: GroupedGraphSettings = {
  error: "sd", errorDir: "both", points: true, grand: "none", clusterBy: null,
  clusterGap: 0.3, barGap: 0.08, seriesReverse: false, clustersReverse: false,
  lineMode: "means", legend: true, spread: "jitter", caption: "off",
  superplot: normalizeSuperPlot(undefined),
};

/** What a grouped graph created from now on starts with; saved graphs
 *  without these keys keep the old look. */
export const NEW_GROUPED_GRAPH: Partial<GroupedGraphSettings> = {
  spread: "symmetric", caption: "below",
};

export function normalizeGraph(raw: unknown): GroupedGraphSettings {
  const o = obj(raw);
  const d = DEFAULT_GRAPH;
  return {
    error: pick(o.error, ["sd", "sem", "ci", "range", "none"] as const, d.error),
    errorDir: pick(o.errorDir, ["both", "above"] as const, d.errorDir),
    points: bool(o.points, d.points),
    grand: pick(o.grand, ["none", "mean", "median"] as const, d.grand),
    clusterBy: o.clusterBy === "rows" || o.clusterBy === "datasets" ? o.clusterBy : null,
    clusterGap: Math.min(0.9, Math.max(0, num(o.clusterGap, d.clusterGap))),
    barGap: Math.min(2, Math.max(0, num(o.barGap, d.barGap))),
    seriesReverse: bool(o.seriesReverse, d.seriesReverse),
    clustersReverse: bool(o.clustersReverse, d.clustersReverse),
    lineMode: pick(o.lineMode, ["means", "subjects"] as const, d.lineMode),
    legend: bool(o.legend, d.legend),
    spread: isPointSpread(o.spread) ? o.spread : d.spread,
    caption: pick(o.caption, ["off", "below", "figure"] as const, d.caption),
    superplot: normalizeSuperPlot(o.superplot),
  };
}

export type HeatValue = "mean" | "median" | "geomean" | "sd" | "sem" | "cv";

export const HEAT_VALUE_LABEL: Record<HeatValue, string> = {
  mean: "Mean", median: "Median", geomean: "Geometric mean",
  sd: "SD", sem: "SEM", cv: "%CV",
};

export interface HeatSettings {
  value: HeatValue;
  palette: HeatPalette;
  reverse: boolean;
  min: string;      // "" = automatic
  max: string;
  center: string;   // diverging midpoint; "" = halfway
  labels: boolean;
  digits: number;
  gap: number;      // px between cells
  legend: boolean;
  legendTitle: string;
  missing: string;  // color for blank / excluded cells
  crossMissing: boolean;
  transpose: boolean;
  xTop: boolean;    // column labels above the map
  /** Standardise before colouring: each row (or column) to mean 0, SD 1. */
  zscore: "none" | "rows" | "columns";
  /** Reorder rows / columns by hierarchical clustering (engine handler
   *  `cluster_heatmap`, see buildHeat.ts; off until the engine has it). */
  clusterRows: boolean;
  clusterCols: boolean;
  /** Draw the clustered axes' dendrograms beside the map. */
  dendrograms: boolean;
}

export const DEFAULT_HEAT: HeatSettings = {
  value: "mean", palette: "sequential", reverse: false, min: "", max: "",
  center: "", labels: true, digits: 3, gap: 2, legend: true, legendTitle: "",
  missing: "#d1d1d6", crossMissing: true, transpose: false, xTop: false,
  zscore: "none", clusterRows: false, clusterCols: false, dendrograms: true,
};

export function normalizeHeat(raw: unknown): HeatSettings {
  const o = obj(raw);
  const d = DEFAULT_HEAT;
  return {
    value: pick(o.value, Object.keys(HEAT_VALUE_LABEL) as HeatValue[], d.value),
    palette: pick(o.palette, ["sequential", "diverging", "grayscale"] as const, d.palette),
    reverse: bool(o.reverse, d.reverse),
    min: str(o.min, d.min),
    max: str(o.max, d.max),
    center: str(o.center, d.center),
    labels: bool(o.labels, d.labels),
    digits: Math.min(8, Math.max(1, int(o.digits, d.digits))),
    gap: Math.min(20, int(o.gap, d.gap)),
    legend: bool(o.legend, d.legend),
    legendTitle: str(o.legendTitle, d.legendTitle),
    missing: typeof o.missing === "string" && /^#[0-9a-f]{6}$/i.test(o.missing)
      ? o.missing : d.missing,
    crossMissing: bool(o.crossMissing, d.crossMissing),
    transpose: bool(o.transpose, d.transpose),
    xTop: bool(o.xTop, d.xTop),
    zscore: pick(o.zscore, ["none", "rows", "columns"] as const, d.zscore),
    clusterRows: bool(o.clusterRows, d.clusterRows),
    clusterCols: bool(o.clusterCols, d.clusterCols),
    dendrograms: bool(o.dendrograms, d.dendrograms),
  };
}
