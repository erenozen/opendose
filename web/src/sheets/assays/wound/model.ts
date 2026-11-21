// Wound-healing (scratch) assay on XY tables: time in X, one data set per
// condition, one replicate column per well holding the wound area (or
// width). Options, the engine payload (assay_wound.wound_healing) and the
// linked table of % closure. Pure, unit-tested.
import { numericData, normalizeTable, parseCell } from "../../../project/table.ts";
import type { DataTableModel } from "../../../project/types.ts";
import { cellOf } from "../kit/columns.ts";

export const ANALYSIS_WOUND = "assay_wound_healing";
export const GRAPH_WOUND = "assay_wound_closure";

export interface WoundOptions {
  /** Rate window ("" = from the first / to the last time). */
  windowStart: string;
  windowEnd: string;
  /** Closure (%) whose time is reported. */
  target: number;
  rateBasis: "percent" | "absolute";
  /** Data set index of the control condition. */
  controlIndex: number;
  test: "auto" | "none";
  comparisons: "dunnett" | "tukey" | "bonferroni" | "sidak";
  ciLevel: number;
}

export const DEFAULT_WOUND: WoundOptions = {
  windowStart: "", windowEnd: "", target: 50, rateBasis: "percent", controlIndex: 0,
  test: "auto", comparisons: "dunnett", ciLevel: 0.95,
};

export function normalizeWound(raw: unknown): WoundOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_WOUND;
  return {
    windowStart: typeof o.windowStart === "string" ? o.windowStart : d.windowStart,
    windowEnd: typeof o.windowEnd === "string" ? o.windowEnd : d.windowEnd,
    target: typeof o.target === "number" && o.target > 0 && o.target <= 100 ? o.target : d.target,
    rateBasis: o.rateBasis === "absolute" ? "absolute" : "percent",
    controlIndex: typeof o.controlIndex === "number" && o.controlIndex >= 0 ? Math.floor(o.controlIndex) : 0,
    test: o.test === "none" ? "none" : "auto",
    comparisons: ["dunnett", "tukey", "bonferroni", "sidak"].includes(o.comparisons as string)
      ? o.comparisons as WoundOptions["comparisons"] : "dunnett",
    ciLevel: typeof o.ciLevel === "number" ? o.ciLevel : d.ciLevel,
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export type WoundResult = Record<string, any> & { error?: string };

export function woundPayload(table: DataTableModel, o: WoundOptions): Record<string, unknown> {
  const data = numericData(table);
  return {
    analysis: "wound_healing",
    data,
    options: {
      window: [parseCell(o.windowStart), parseCell(o.windowEnd)],
      target: o.target, rate_basis: o.rateBasis,
      control_index: Math.min(o.controlIndex, Math.max(0, table.datasets.length - 1)),
      test: o.test, comparisons: o.comparisons, ci_level: o.ciLevel,
    },
  };
}

export function runWound(analyze: (p: unknown) => unknown, table: DataTableModel,
  o: WoundOptions): WoundResult {
  if (table.subcolumnFormat !== "replicates") {
    return { error: "A wound-healing table needs the measured values (one replicate column per well), not means with errors" };
  }
  if (!table.datasets.length) return { error: "Add a data set per condition, one replicate column per well." };
  return analyze(woundPayload(table, o)) as WoundResult;
}

/** The linked XY table of % closure: same rows (times) as the source,
 *  one data set per condition, one replicate column per well. */
export function closureTable(res: WoundResult, source: DataTableModel): DataTableModel | null {
  if (!res || res.error || !Array.isArray(res.wells)) return null;
  const xs = numericData(source).x;
  const conds: string[] = res.conditions ?? [];
  return normalizeTable({
    type: "xy",
    x: source.x, xTitle: source.xTitle, xUnit: source.xUnit, xFormat: source.xFormat,
    rowTitles: source.rowTitles,
    yTitle: "Wound closure (%)",
    datasets: conds.map((name) => {
      const ws = res.wells.filter((w: any) => w.condition === name);
      const reps = Math.max(1, ...ws.map((w: any) => w.well));
      return {
        name,
        rows: xs.map((t) => Array.from({ length: reps }, (_, k) => {
          const w = ws.find((x: any) => x.well === k + 1);
          const i = w && t !== null ? (w.times as number[]).indexOf(t) : -1;
          return i >= 0 ? cellOf(w.closure[i]) : "";
        })),
      };
    }),
  });
}

/** "h" from "Time (h)", for rate units. */
export function timeUnit(table: DataTableModel): string {
  const m = /\(([^)]+)\)\s*$/.exec(table.xTitle ?? "");
  if (m) return m[1];
  // the X unit only when it is a time (new tables default it to "M")
  const u = table.xUnit?.trim() ?? "";
  return /^(s|sec|min|h|hr|hours?|d|days?)$/i.test(u) ? u : "time unit";
}

/** "µm²" from "Wound area (µm²)", for absolute rates. */
export function areaUnit(table: DataTableModel): string {
  const m = /\(([^)]+)\)\s*$/.exec(table.yTitle ?? "");
  return m ? m[1] : "units";
}
