// Smooth, differentiate or integrate a curve (P-103): an XY manipulation
// whose output is a linked XY table with one value per source row, from
// the engine's `curve_ops` handler (engine/opendose/smooth.py:
// Savitzky-Golay smoothing, the first derivative by central
// differences, the cumulative trapezoidal integral) on the mean of each
// row's replicates. Pure: unit-tested with node --test.
import { numericData, parseCell } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";

/** The engine as this module uses it (lib/engine's EngineBridge). */
interface Analyze { analyze: (payload: unknown) => unknown }

/** The part of run.ts's ManipResult this manipulation fills. */
export interface ManipResult {
  error?: string;
  x: (number | null)[];
  datasets: { name: string; ys: (number | null)[][] }[];
  notes: string[];
  yTitle?: string;
}

export type CurveOp = "smooth" | "derivative" | "integral";

export interface CurveOpsOptions {
  op: CurveOp;
  /** Savitzky-Golay: neighbours averaged on each side (window 2k + 1). */
  neighbours: string;
  /** Savitzky-Golay: order of the smoothing polynomial (0 = moving average). */
  order: string;
}

export const DEFAULT_CURVE_OPS: CurveOpsOptions = { op: "smooth", neighbours: "2", order: "2" };

export const CURVE_OP_LABELS: Record<CurveOp, string> = {
  smooth: "Smooth (Savitzky-Golay)",
  derivative: "First derivative (dY/dX)",
  integral: "Integral (area from the first X)",
};

export function normalizeCurveOps(raw: unknown): CurveOpsOptions {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<CurveOpsOptions>;
  return {
    op: r.op === "derivative" || r.op === "integral" ? r.op : "smooth",
    neighbours: typeof r.neighbours === "string" ? r.neighbours : DEFAULT_CURVE_OPS.neighbours,
    order: typeof r.order === "string" ? r.order : DEFAULT_CURVE_OPS.order,
  };
}

/** The live problems of the smoothing fields (null when fine). */
export function curveOpsProblems(o: CurveOpsOptions): { neighbours: string | null; order: string | null } {
  const k = parseCell(o.neighbours);
  const p = parseCell(o.order);
  const kOk = k !== null && Number.isInteger(k) && k >= 1 && k <= 50;
  return {
    neighbours: kOk ? null : "Enter a whole number from 1 to 50",
    order: p !== null && Number.isInteger(p) && p >= 0 && (!kOk || p <= 2 * k!) ? null
      : kOk ? `Enter a whole number from 0 to ${2 * k!}` : "Enter a whole number, 0 or more",
  };
}

const fail = (error: string): ManipResult => ({ error, x: [], datasets: [], notes: [] });

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Engine output -> the manipulation result (one value per source row). */
export function curveOpsResult(raw: any, table: DataTableModel, o: CurveOpsOptions): ManipResult {
  if (!raw || raw.error) return fail(String(raw?.error ?? "The engine returned nothing"));
  const sets: any[] = raw.datasets ?? [];
  if (sets.length && sets.every((d) => d.error)) return fail(String(sets[0].error));
  const notes: string[] = [];
  for (const d of sets) {
    if (d.error) notes.push(`${d.name}: ${String(d.error).replace(/\.$/, "")}; its column is empty.`);
    for (const n of d.notes ?? []) if (!notes.includes(n)) notes.push(n);
  }
  if (table.datasets.some((d) => d.rows.some((r) => r.filter((v) => v.trim() !== "").length > 1))) {
    notes.push("Each row's replicates were averaged first.");
  }
  const y = table.yTitle || "Y";
  const yTitle = o.op === "derivative" ? `d(${y})/dX` : o.op === "integral" ? `Area under ${y}` : `Smoothed ${y}`;
  return {
    x: numericData(table).x,
    datasets: sets.map((d) => ({
      name: d.name,
      ys: (d.rows ?? table.x.map(() => null)).map((v: number | null) => [v ?? null]),
    })),
    notes,
    yTitle,
  };
}

export function runCurveOps(engine: Analyze, table: DataTableModel, o: CurveOpsOptions): ManipResult {
  if (table.type !== "xy") return fail("Smooth, differentiate or integrate works on XY tables");
  if (table.subcolumnFormat !== "replicates") {
    return fail("This works on replicate values; this table holds summary data (mean / SD / N)");
  }
  const options: Record<string, unknown> = { op: o.op };
  if (o.op === "smooth") {
    const p = curveOpsProblems(o);
    if (p.neighbours || p.order) return fail(`${p.neighbours ?? p.order}.`);
    options.neighbours = parseCell(o.neighbours);
    options.order = parseCell(o.order);
  }
  try {
    return curveOpsResult(engine.analyze({ analysis: "curve_ops", data: numericData(table), options }), table, o);
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

export function curveOpsMethods(o: CurveOpsOptions): string {
  const pre = "The mean of each row's replicates was taken (rows with the same X averaged), in increasing X.";
  if (o.op === "derivative") {
    return `${pre} The first derivative was computed by central differences on the actual X spacing `
      + "(second-order accurate; one-sided differences at the first and last X).";
  }
  if (o.op === "integral") {
    return `${pre} The area under the curve was accumulated from the first X by the trapezoidal rule.`;
  }
  const k = Number(o.neighbours);
  const p = Number(o.order);
  return `${pre} The curve was smoothed by Savitzky-Golay filtering (Savitzky & Golay 1964): a polynomial of `
    + `order ${p}${p === 0 ? " (a moving average)" : ""} fitted by least squares to each window of ${2 * k + 1} `
    + "points, the first and last points from the polynomial of the first and last window.";
}
