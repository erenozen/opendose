// Estimation statistics (DABEST method; Ho et al. 2019, Nat Methods
// 16:565): the effect size between groups with a bootstrap confidence
// interval, drawn as a Gardner-Altman (two groups) or Cumming (more)
// estimation plot. Payloads for the engine's "estimation" handler
// (engine/opendose/estimation.py). Pure, unit-tested.
import { numericData } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";

/** The slice of EngineBridge the analysis needs. */
export interface Engine { analyze: (payload: unknown) => unknown }

export const ANALYSIS_ESTIMATION = "estimation";
export const GRAPH_ESTIMATION = "estimation";

export type EstimationDesign =
  | "auto" | "two_group" | "shared_control" | "multi_two_group"
  | "repeated_baseline" | "repeated_sequential";

export type EstimationEffect = "mean_diff" | "median_diff" | "cohens_d" | "hedges_g" | "cliffs_delta";

export interface EstimationOptions {
  design: EstimationDesign;
  /** Control group (two-group and shared-control designs). */
  controlIndex: number;
  effect: EstimationEffect;
  nBoot: number;
  seed: number;
  ciType: "bca" | "percentile";
  ciLevel: number;
}

export const DEFAULT_ESTIMATION: EstimationOptions = {
  design: "auto", controlIndex: 0, effect: "mean_diff", nBoot: 5000, seed: 12345,
  ciType: "bca", ciLevel: 0.95,
};

export const DESIGN_LABELS: Record<EstimationDesign, string> = {
  auto: "Automatic (two groups, or shared control)",
  two_group: "Two groups (Gardner-Altman)",
  shared_control: "Shared control: each group vs. the control (Cumming)",
  multi_two_group: "Multiple two-group comparisons (consecutive pairs)",
  repeated_baseline: "Paired: each condition vs. the first (baseline)",
  repeated_sequential: "Paired: each condition vs. the one before (sequential)",
};

export const EFFECT_LABELS: Record<EstimationEffect, string> = {
  mean_diff: "Mean difference",
  median_diff: "Median difference",
  cohens_d: "Cohen's d",
  hedges_g: "Hedges' g",
  cliffs_delta: "Cliff's delta",
};

const pick = <T extends string>(v: unknown, keys: readonly T[], d: T): T =>
  (typeof v === "string" && (keys as readonly string[]).includes(v) ? v as T : d);
const int = (v: unknown, lo: number, hi: number, d: number) =>
  (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);

export function normalizeEstimation(raw: unknown): EstimationOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_ESTIMATION;
  return {
    design: pick(o.design, Object.keys(DESIGN_LABELS) as EstimationDesign[], d.design),
    controlIndex: int(o.controlIndex, 0, 999, d.controlIndex),
    effect: pick(o.effect, Object.keys(EFFECT_LABELS) as EstimationEffect[], d.effect),
    nBoot: int(o.nBoot, 200, 100000, d.nBoot),
    seed: int(o.seed, 0, 2 ** 31 - 1, d.seed),
    ciType: o.ciType === "percentile" ? "percentile" : "bca",
    ciLevel: typeof o.ciLevel === "number" && o.ciLevel > 0.5 && o.ciLevel < 1 ? o.ciLevel : d.ciLevel,
  };
}

/** Engine options shared by both table types. */
function engineOptions(o: EstimationOptions): Record<string, unknown> {
  return {
    effects: [o.effect], n_boot: o.nBoot, n_permutations: 5000, seed: o.seed,
    ci_type: o.ciType, ci_level: o.ciLevel,
  };
}

/** Column table: one group per data set (paired designs align rows). */
export function columnEstimationPayload(table: DataTableModel, o: EstimationOptions) {
  const data = numericData(table);
  const datasets = data.datasets.map((d, i) => ({ name: d.name || `Group ${i + 1}`, ys: d.ys }));
  const k = datasets.length;
  const control = Math.min(o.controlIndex, Math.max(0, k - 1));
  return {
    analysis: "estimation",
    data: { datasets },
    options: {
      ...engineOptions(o),
      ...(o.design === "auto" ? {} : { design: o.design }),
      control_index: o.design === "repeated_baseline" || o.design === "repeated_sequential" ? 0 : control,
    },
  };
}

/** Grouped table: each row's data sets become groups ("Day 7: Vehicle"),
 *  and the control data set is compared with every other one within the
 *  row (multi two-group design), so two groups per row give one
 *  Gardner-Altman comparison per row on one Cumming plot. */
export function groupedEstimationPayload(table: DataTableModel, o: EstimationOptions) {
  const data = numericData(table);
  const k = data.datasets.length;
  const control = Math.min(o.controlIndex, Math.max(0, k - 1));
  const datasets: { name: string; ys: (number | null)[][] }[] = [];
  const pairs: [number, number][] = [];
  table.x.forEach((_, r) => {
    const title = table.rowTitles[r]?.trim() || `Row ${r + 1}`;
    const cells = data.datasets.map((d) => (d.ys[r] ?? []).filter((v): v is number => v !== null));
    if (cells.filter((c) => c.length).length < 2 || !cells[control]?.length) return;
    const idx = new Map<number, number>();
    cells.forEach((c, j) => {
      if (!c.length) return;
      idx.set(j, datasets.length);
      datasets.push({ name: `${title}: ${data.datasets[j].name || `Group ${j + 1}`}`, ys: c.map((v) => [v]) });
    });
    cells.forEach((c, j) => { if (j !== control && c.length) pairs.push([idx.get(control)!, idx.get(j)!]); });
  });
  return {
    analysis: "estimation",
    data: { datasets },
    options: { ...engineOptions(o), design: "multi_two_group", pairs },
  };
}

type Result = Record<string, unknown>;

export function runEstimation(engine: Engine, table: DataTableModel, o: EstimationOptions): Result {
  if (table.subcolumnFormat !== "replicates") {
    return { error: "Estimation plots need the raw values (bootstrap resampling); "
      + "this table holds mean / error / N summaries." };
  }
  const payload = table.type === "grouped" ? groupedEstimationPayload(table, o)
    : columnEstimationPayload(table, o);
  if (payload.data.datasets.length < 2) {
    return { error: "An estimation plot needs at least two groups with values." };
  }
  const r = engine.analyze(payload) as Result;
  return r && typeof r === "object" ? r : { error: "no result" };
}
