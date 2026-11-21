// Kinetic plate reads on XY tables: time in X, one data set per sample
// (named by its substrate concentration for Michaelis-Menten work), one
// replicate column per well. Options, the engine payload
// (assay_kinetic.kinetic_rates) and the linked substrate-vs-rate table set
// up for the Michaelis-Menten fit. Pure, unit-tested.
import { numericData, normalizeTable, parseCell } from "../../../project/table.ts";
import type { DataTableModel } from "../../../project/types.ts";
import { cellOf } from "../kit/columns.ts";

export const ANALYSIS_KINETIC = "assay_kinetic_rates";
export const GRAPH_KINETIC = "assay_kinetic_traces";

export type KMethod = "steepest" | "auto" | "window";

export const K_METHOD_LABELS: Record<KMethod, string> = {
  steepest: "Steepest slope over consecutive reads (plate-reader “Vmax”, default)",
  auto: "Longest straight stretch from the first read (R² rule)",
  window: "A time window I choose",
};

export interface KineticOptions {
  method: KMethod;
  /** Reads in the steepest stretch. */
  k: number;
  minR2: number;
  minPoints: number;
  windowStart: string;
  windowEnd: string;
  /** Data set of no-enzyme (blank) wells: -1 = one named like a blank
   *  ("No enzyme", "Blank", ...), -2 = none. */
  blankIndex: number;
  /** Signal per concentration unit (ε × path length), "" = none. */
  factor: string;
  /** Rate unit after conversion, e.g. "µM/min". */
  factorUnit: string;
  /** Signal at or above which a read is flagged, "" = none. */
  saturation: string;
  /** Unit of the substrate concentrations (the sample names), for Km. */
  substrateUnit: string;
}

export const DEFAULT_KINETIC: KineticOptions = {
  method: "steepest", k: 5, minR2: 0.99, minPoints: 3, windowStart: "", windowEnd: "",
  blankIndex: -1, factor: "", factorUnit: "", saturation: "", substrateUnit: "µM",
};

export function normalizeKinetic(raw: unknown): KineticOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_KINETIC;
  const int = (v: unknown, min: number, def: number) =>
    (typeof v === "number" && Number.isInteger(v) && v >= min ? v : def);
  const str = (v: unknown, def: string) => (typeof v === "string" ? v : def);
  return {
    method: o.method === "auto" || o.method === "window" ? o.method : "steepest",
    k: int(o.k, 2, d.k),
    minR2: typeof o.minR2 === "number" && o.minR2 > 0 && o.minR2 <= 1 ? o.minR2 : d.minR2,
    minPoints: int(o.minPoints, 3, d.minPoints),
    windowStart: str(o.windowStart, d.windowStart), windowEnd: str(o.windowEnd, d.windowEnd),
    blankIndex: typeof o.blankIndex === "number" && Number.isInteger(o.blankIndex) && o.blankIndex >= -2
      ? o.blankIndex : d.blankIndex,
    factor: str(o.factor, d.factor), factorUnit: str(o.factorUnit, d.factorUnit),
    saturation: str(o.saturation, d.saturation),
    substrateUnit: str(o.substrateUnit, d.substrateUnit),
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export type KineticResult = Record<string, any> & { error?: string };

/** The blank data set: the chosen one, else one named like a no-enzyme control. */
export function blankIndexOf(table: DataTableModel, o: KineticOptions): number {
  if (o.blankIndex >= 0 && o.blankIndex < table.datasets.length) return o.blankIndex;
  if (o.blankIndex === -2) return -1;      // explicitly none
  return table.datasets.findIndex((d) => /^(no[ -]?enzyme|blank|buffer|no substrate|background|control blank)$/i
    .test(d.name.trim()));
}

export function kineticPayload(table: DataTableModel, o: KineticOptions): Record<string, unknown> {
  const blank = blankIndexOf(table, o);
  return {
    analysis: "kinetic_rates",
    data: numericData(table),
    options: {
      method: o.method, k: o.k, min_r2: o.minR2, min_points: o.minPoints,
      window: [parseCell(o.windowStart), parseCell(o.windowEnd)],
      ...(blank >= 0 ? { blank_index: blank } : {}),
      ...(parseCell(o.factor) !== null ? { factor: parseCell(o.factor) } : {}),
      ...(parseCell(o.saturation) !== null ? { saturation: parseCell(o.saturation) } : {}),
    },
  };
}

export function runKinetic(analyze: (p: unknown) => unknown, table: DataTableModel,
  o: KineticOptions): KineticResult {
  if (table.subcolumnFormat !== "replicates") {
    return { error: "A kinetic table needs the reads of each well (one replicate column per well), not means with errors" };
  }
  if (!table.datasets.length) return { error: "Add a data set per sample, one replicate column per well." };
  const f = parseCell(o.factor);
  if (o.factor.trim() !== "" && (f === null || f <= 0)) return { error: "The conversion factor must be a positive number." };
  return analyze(kineticPayload(table, o)) as KineticResult;
}

/** Linked XY table for the Michaelis-Menten fit: X the substrate
 *  concentration (the samples whose names are numbers, blank left out),
 *  one replicate column per well, Y the initial rate. */
export function rateTable(res: KineticResult, source: DataTableModel, o: KineticOptions): DataTableModel | null {
  if (!res || res.error || !Array.isArray(res.samples)) return null;
  const samples = res.samples.filter((s: any) => s.substrate !== null && !s.is_blank);
  if (samples.length < 3) return null;
  const reps = Math.max(1, ...samples.map((s: any) => s.velocities.length));
  return normalizeTable({
    type: "xy",
    x: samples.map((s: any) => String(s.substrate)),
    // the unit in the title is what the fit reports Km in
    xTitle: `Substrate (${o.substrateUnit.trim() || "units"})`, xUnit: o.substrateUnit.trim() || "units",
    yTitle: `Initial rate (${rateUnit(source, o)})`,
    datasets: [{
      name: "Initial rate",
      rows: samples.map((s: any) => Array.from({ length: reps }, (_, k) => cellOf(s.velocities[k] ?? null))),
    }],
  });
}

/** The fit the linked table starts with: Michaelis-Menten on raw X. */
export function michaelisSettings(prev: unknown): unknown {
  const p = (prev && typeof prev === "object" ? prev : {}) as Record<string, any>;
  return { ...p, xIsLog: false, normalize: { ...(p.normalize ?? {}), enabled: false }, model: "michaelis_menten" };
}

/** "min" from "Time (min)". */
export function timeUnit(table: DataTableModel): string {
  const m = /\(([^)]+)\)\s*$/.exec(table.xTitle ?? "");
  if (m) return m[1];
  const u = table.xUnit?.trim() ?? "";
  return /^(s|sec|min|h|hr|hours?)$/i.test(u) ? u : "time unit";
}

/** The rate unit: the conversion's, else "<signal>/<time>". */
export function rateUnit(table: DataTableModel, o: KineticOptions): string {
  if (parseCell(o.factor) !== null && o.factorUnit.trim()) return o.factorUnit.trim();
  const sig = table.yTitle?.trim() || "signal";
  return `${sig}/${timeUnit(table)}`;
}
