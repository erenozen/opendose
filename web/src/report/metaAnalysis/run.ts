// Combining experiments (meta-analysis, P-92): one row per experiment of
// a grouped table whose subcolumns hold an estimate with its SE (Mean,
// SEM) or its CI limits (Mean, upper, lower). Payload for the engine's
// "meta_analysis" handler (engine/opendose/meta.py). Pure, unit-tested.
import { numericData } from "../../project/table.ts";
import { SUBCOLUMN_FORMAT_ENGINE, type DataTableModel } from "../../project/types.ts";

/** The slice of EngineBridge the analysis needs. */
export interface Engine { analyze: (payload: unknown) => unknown }

export const ANALYSIS_META = "meta_analysis";
export const GRAPH_FOREST = "meta_forest";

export type MetaScale = "difference" | "log_ratio" | "ratio";

export interface MetaOptions {
  /** The data set (column) whose rows are combined. */
  dataset: number;
  scale: MetaScale;
  method: "REML" | "DL";
  test: "knha" | "z";
  ciLevel: number;
  /** Mean, upper, lower tables: the level of the entered limits. */
  limitsLevel: number;
}

export const DEFAULT_META: MetaOptions = {
  dataset: 0, scale: "difference", method: "REML", test: "knha", ciLevel: 0.95, limitsLevel: 0.95,
};

export const SCALE_LABELS: Record<MetaScale, string> = {
  difference: "Differences or means (pooled as entered)",
  log_ratio: "Log ratios (natural log; shown as ratios)",
  ratio: "Ratios with CI limits (pooled on the log scale)",
};

/** Formats an estimate can be read from, with the engine id. */
const READABLE = new Set(["mean_sem", "mean_sem_n", "mean_sd_n", "mean_ci_n", "mean_limits"]);

const LEVELS = [0.9, 0.95, 0.99];

export function normalizeMeta(raw: unknown): MetaOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_META;
  const level = (v: unknown, def: number) => (typeof v === "number" && LEVELS.includes(v) ? v : def);
  return {
    dataset: typeof o.dataset === "number" && Number.isInteger(o.dataset) && o.dataset >= 0 ? o.dataset : d.dataset,
    scale: o.scale === "log_ratio" || o.scale === "ratio" ? o.scale : d.scale,
    method: o.method === "DL" ? "DL" : d.method,
    test: o.test === "z" ? "z" : d.test,
    ciLevel: level(o.ciLevel, d.ciLevel),
    limitsLevel: level(o.limitsLevel, d.limitsLevel),
  };
}

export const FORMAT_ERROR = "Combining experiments needs one estimate per row with its SE or CI. "
  + "Set the table's subcolumns (Format) to Mean, SEM (the estimate and its standard error) "
  + "or to Mean, upper limit, lower limit.";

/** The engine payload, or the reason none can be made. */
export function metaPayload(table: DataTableModel, o: MetaOptions):
  { payload: Record<string, unknown> } | { error: string } {
  const format = SUBCOLUMN_FORMAT_ENGINE[table.subcolumnFormat];
  if (!READABLE.has(format)) return { error: FORMAT_ERROR };
  const data = numericData(table);
  if (!data.datasets.length) return { error: "The table has no data set." };
  const k = Math.min(o.dataset, data.datasets.length - 1);
  const ds = data.datasets[k];
  const rows: { label: string; values: (number | null)[] }[] = [];
  ds.ys.forEach((vals, r) => {
    // a row with nothing entered is not an experiment
    if (!vals.some((v) => v !== null)) return;
    rows.push({ label: table.rowTitles[r]?.trim() || `Row ${r + 1}`, values: vals });
  });
  return {
    payload: {
      analysis: ANALYSIS_META,
      data: { rows },
      options: {
        format, scale: o.scale, method: o.method, test: o.test, ci_level: o.ciLevel,
        limits_level: o.limitsLevel, name: ds.name || `Data set ${k + 1}`,
      },
    },
  };
}

type Result = Record<string, unknown>;

export function runMeta(engine: Engine, table: DataTableModel, o: MetaOptions): Result {
  const p = metaPayload(table, o);
  if ("error" in p) return { error: p.error };
  const r = engine.analyze(p.payload) as Result;
  return r && typeof r === "object" ? r : { error: "no result" };
}
