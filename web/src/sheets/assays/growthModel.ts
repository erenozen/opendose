// Microbial growth curves (OD600 or counts against time) on XY tables:
// blank subtraction and log transform (engine growth_transform), then a
// growth model fitted to every curve (dose_response with a model of the
// engine's "Growth equations" family), with the doubling time. Pure.
import { numericData, normalizeTable, parseCell } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";

export const ANALYSIS_GROWTH = "growth_curves";
export const GRAPH_GROWTH = "growth_curves_graph";

export type GrowthBlank = "none" | "min" | "value" | "dataset";
export type GrowthLog = "none" | "ln" | "log10" | "log2";

export interface GrowthOptions {
  blank: GrowthBlank;
  blankValue: string;
  blankDataset: number;
  log: GrowthLog;
  relativeToFirst: boolean;
  model: string;
}

export const DEFAULT_GROWTH: GrowthOptions = {
  blank: "min",
  blankValue: "0",
  blankDataset: 0,
  log: "none",
  relativeToFirst: false,
  model: "logistic_growth",
};

/** Growth models offered, with what their rate parameter means for the
 *  doubling time. Engine ids (list_models, family "Growth equations"). */
export const GROWTH_MODELS: { id: string; label: string; scale: "linear" | "log" }[] = [
  { id: "logistic_growth", label: "Logistic growth (Growthcurver's model)", scale: "linear" },
  { id: "gompertz_growth", label: "Gompertz growth", scale: "linear" },
  { id: "exponential_growth", label: "Exponential growth", scale: "linear" },
  { id: "exponential_plateau", label: "Exponential plateau", scale: "linear" },
  { id: "zwietering_logistic", label: "Logistic with lag (Zwietering), Y = ln(N/N0)", scale: "log" },
  { id: "zwietering_gompertz", label: "Gompertz with lag (Zwietering), Y = ln(N/N0)", scale: "log" },
  { id: "zwietering_richards", label: "Richards with lag (Zwietering), Y = ln(N/N0)", scale: "log" },
  { id: "zwietering_logistic_baseline", label: "Logistic with lag and baseline Y0 (Zwietering)", scale: "log" },
  { id: "zwietering_gompertz_baseline", label: "Gompertz with lag and baseline Y0 (Zwietering)", scale: "log" },
  { id: "zwietering_richards_baseline", label: "Richards with lag and baseline Y0 (Zwietering)", scale: "log" },
];

const pick = <T extends string>(v: unknown, allowed: readonly T[], d: T): T =>
  (typeof v === "string" && (allowed as readonly string[]).includes(v) ? v as T : d);

export function normalizeGrowth(raw: unknown): GrowthOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_GROWTH;
  return {
    blank: pick(o.blank, ["none", "min", "value", "dataset"] as const, d.blank),
    blankValue: typeof o.blankValue === "string" ? o.blankValue : d.blankValue,
    blankDataset: typeof o.blankDataset === "number" && o.blankDataset >= 0 ? Math.floor(o.blankDataset) : 0,
    log: pick(o.log, ["none", "ln", "log10", "log2"] as const, d.log),
    relativeToFirst: typeof o.relativeToFirst === "boolean" ? o.relativeToFirst : d.relativeToFirst,
    model: typeof o.model === "string" && GROWTH_MODELS.some((m) => m.id === o.model) ? o.model : d.model,
  };
}

export function growthTransformPayload(table: DataTableModel, o: GrowthOptions): Record<string, unknown> {
  const data = numericData(table);
  const options: Record<string, unknown> = {
    log: o.log === "none" ? null : o.log,
    relative_to_first: o.relativeToFirst,
  };
  if (o.blank === "min") options.blank = "min";
  if (o.blank === "value") options.blank = parseCell(o.blankValue) ?? 0;
  if (o.blank === "dataset" && table.datasets.length > 1) {
    options.blank_dataset = Math.min(o.blankDataset, table.datasets.length - 1);
  }
  return { analysis: "growth_transform", data, options };
}

const LN2 = Math.log(2);
const LOG_FACTOR: Record<GrowthLog, number | null> = {
  none: null, ln: 1, log2: 1 / LN2, log10: Math.log10(2) / LN2,
};

export interface Doubling {
  value: number | null;
  ci: [number, number] | null;
  how: string;
}

interface Param { value?: number | null; ci95?: [number | null, number | null] | null }

/** Doubling time of one fit. Zwietering models report ln 2 / MuMax for
 *  Y in natural logs (converted here for log2 / log10 data); the logistic
 *  and exponential models' K is a specific growth rate, so ln 2 / K (the
 *  doubling time at low density, Growthcurver's t_gen). The CI is the
 *  rate's CI carried through the (monotone) transform. */
export function doublingTime(model: string, params: Record<string, Param> | undefined,
  log: GrowthLog): Doubling | null {
  if (!params) return null;
  const zw = model.startsWith("zwietering_");
  if (zw) {
    const factor = LOG_FACTOR[log];
    const td = params.DoublingTime;
    if (factor === null || !td || typeof td.value !== "number") return null;
    const ci = td.ci95 && typeof td.ci95[0] === "number" && typeof td.ci95[1] === "number"
      ? [td.ci95[0] * factor, td.ci95[1] * factor] as [number, number] : null;
    return { value: td.value * factor, ci, how: log === "ln" ? "ln 2 / MuMax" : `${log}(2) / MuMax` };
  }
  if (model === "logistic_growth" || model === "exponential_growth") {
    const td = params.DoublingTime;
    if (td && typeof td.value === "number") {
      const ci = td.ci95 && typeof td.ci95[0] === "number" && typeof td.ci95[1] === "number"
        ? [td.ci95[0], td.ci95[1]] as [number, number] : null;
      return { value: td.value, ci, how: "ln 2 / K" };
    }
    const k = params.K;
    if (!k || typeof k.value !== "number" || !(k.value > 0)) return null;
    const lo = k.ci95?.[0];
    const hi = k.ci95?.[1];
    const ci = typeof lo === "number" && typeof hi === "number" && lo > 0 && hi > 0
      ? [LN2 / hi, LN2 / lo] as [number, number] : null;
    return { value: LN2 / k.value, ci, how: "ln 2 / K" };
  }
  return null;
}

/** The transformed curves as an XY table (the linked "growth-ready"
 *  table), from the growth_transform result. */
export function transformedTable(source: DataTableModel,
  prep: { x: (number | null)[]; datasets: { name: string; ys: (number | null)[][] }[] },
  o: GrowthOptions): DataTableModel {
  const cell = (v: number | null) => (v === null || !Number.isFinite(v) ? "" : String(v));
  const yTitle = growthYTitle(source, o);
  return normalizeTable({
    type: "xy",
    x: source.x,
    xTitle: source.xTitle,
    xUnit: source.xUnit,
    xFormat: source.xFormat,
    yTitle,
    rowTitles: source.rowTitles,
    datasets: prep.datasets.map((d) => ({ name: d.name, rows: d.ys.map((r) => r.map(cell)) })),
  });
}

export function growthYTitle(table: DataTableModel, o: GrowthOptions): string {
  const y = table.yTitle.trim() || "OD";
  const blanked = o.blank === "none" ? y : `${y} − blank`;
  if (o.log === "none") return o.relativeToFirst ? `${blanked} / first` : blanked;
  const inner = o.relativeToFirst ? `N/N0` : blanked;
  return `${o.log}(${inner})`;
}
