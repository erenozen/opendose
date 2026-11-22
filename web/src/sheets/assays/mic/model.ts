// MIC by broth microdilution on XY tables: X the drug concentration (0 =
// growth control), one data set per strain, one replicate column per
// dilution series holding the endpoint OD. Options, the engine payload
// (assay_mic.mic) and the linked table of % growth. Pure, unit-tested.
import { numericData, normalizeTable, parseCell } from "../../../project/table.ts";
import type { DataTableModel } from "../../../project/types.ts";
import { cellOf } from "../kit/columns.ts";

export const ANALYSIS_MIC = "assay_mic";
export const GRAPH_MIC = "assay_mic_growth";

export interface MicOptions {
  /** Medium-only OD subtracted from every well ("" = none). */
  blank: string;
  thresholdMode: "percent" | "od";
  /** No growth at or below this % of the growth control. */
  threshold: number;
  /** No growth at or below this blank-corrected OD (thresholdMode "od"). */
  odCutoff: string;
  fitIc50: boolean;
  ciLevel: number;
}

export const DEFAULT_MIC: MicOptions = {
  blank: "", thresholdMode: "percent", threshold: 10, odCutoff: "0.1", fitIc50: true, ciLevel: 0.95,
};

export function normalizeMic(raw: unknown): MicOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_MIC;
  return {
    blank: typeof o.blank === "string" ? o.blank : d.blank,
    thresholdMode: o.thresholdMode === "od" ? "od" : "percent",
    threshold: typeof o.threshold === "number" && o.threshold >= 0 && o.threshold < 100 ? o.threshold : d.threshold,
    odCutoff: typeof o.odCutoff === "string" ? o.odCutoff : d.odCutoff,
    fitIc50: typeof o.fitIc50 === "boolean" ? o.fitIc50 : d.fitIc50,
    ciLevel: typeof o.ciLevel === "number" ? o.ciLevel : d.ciLevel,
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export type MicResult = Record<string, any> & { error?: string };

export function micPayload(table: DataTableModel, o: MicOptions): Record<string, unknown> {
  return {
    analysis: "mic",
    data: numericData(table),
    options: {
      blank: parseCell(o.blank), threshold_mode: o.thresholdMode, threshold: o.threshold,
      ...(o.thresholdMode === "od" ? { od_cutoff: parseCell(o.odCutoff) } : {}),
      fit_ic50: o.fitIc50, ci_level: o.ciLevel,
    },
  };
}

export function runMic(analyze: (p: unknown) => unknown, table: DataTableModel, o: MicOptions): MicResult {
  if (table.subcolumnFormat !== "replicates") {
    return { error: "An MIC table needs the measured ODs (one replicate column per dilution series), not means with errors" };
  }
  if (!table.datasets.length) return { error: "Add a data set per strain, one replicate column per dilution series." };
  if (o.thresholdMode === "od" && parseCell(o.odCutoff) === null) {
    return { error: "Enter the OD cut-off for no growth." };
  }
  return analyze(micPayload(table, o)) as MicResult;
}

/** The linked XY table of % growth (rows: the drug concentrations of the
 *  source, growth controls left out; one data set per strain, one
 *  replicate column per dilution series). */
export function growthTable(res: MicResult, source: DataTableModel): DataTableModel | null {
  if (!res || res.error || !Array.isArray(res.series)) return null;
  const xs = numericData(source).x;
  const rows = xs.map((c, i) => ({ c, i })).filter((r) => r.c !== null && r.c > 0);
  if (!rows.length) return null;
  const strains: string[] = (res.strains ?? []).map((s: any) => s.strain);
  return normalizeTable({
    type: "xy",
    x: rows.map((r) => source.x[r.i]), xTitle: source.xTitle, xUnit: source.xUnit,
    rowTitles: rows.map((r) => source.rowTitles[r.i] ?? ""),
    yTitle: "Growth (% of the growth control)",
    datasets: strains.map((name) => {
      const ss = res.series.filter((s: any) => s.strain === name);
      const reps = Math.max(1, ...ss.map((s: any) => s.series));
      return {
        name,
        rows: rows.map((r) => Array.from({ length: reps }, (_, k) => {
          const s = ss.find((x: any) => x.series === k + 1);
          const w = s?.wells.find((x: any) => x.concentration === r.c);
          return cellOf(w?.growth ?? null);
        })),
      };
    }),
  });
}

/** "µg/mL" from "Concentration (µg/mL)", for labels. */
export function concUnit(table: DataTableModel): string {
  const m = /\(([^)]+)\)\s*$/.exec(table.xTitle ?? "");
  return m ? m[1] : "";
}
