// Interpolated unknowns (FEATURE-PLAN P-22): the engine's "interpolation"
// block of a curve fit (interpolate.interpolate_unknown) read into the
// rows of the typeset table and the markers drawn on the curve. Each
// unknown is a Y value in a row with no X (or a typed Y): its X read off
// the curve, the 95% CI (where the curve's confidence band reaches the
// Y: the uncertainty of the curve) and the 95% prediction interval (the
// same with the scatter of one reading added). An unknown outside the
// standards is flagged "Extrapolated", one the curve never reaches has no
// X: neither is ever shown as a plain number. Every number is the
// engine's, printed with formatSig. Pure; unit-tested.
import { formatSig } from "../../types.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

export interface InterpolationRow {
  /** The data set the curve belongs to. */
  dataset: string;
  /** "Row 8", "Sample 3, replicate 2", "Typed Y 1". */
  unknown: string;
  y: string;
  /** In the fit's X units (log10 of the concentration for log-X models). */
  x: string;
  /** Concentration (10^X) for log-X models, else null. */
  conc: string | null;
  ci: string;
  pi: string;
  position: "within" | "extrapolated" | "none";
  /** The reading's flag and its reason, or "" when there is none. */
  note: string;
}

export interface InterpolationTable {
  rows: InterpolationRow[];
  /** A log-X model: X is log10(concentration) and a concentration column shows. */
  xIsLog: boolean;
  /** Prediction intervals were computed (not for weighted or summary-data fits). */
  prediction: boolean;
}

export interface UnknownMarker {
  /** Data set index (its colour on the graph). */
  ds: number;
  x: number;
  y: number;
  /** 95% CI as distances below and above x (0 where open or missing). */
  minus: number;
  plus: number;
  extrapolated: boolean;
  label: string;
}

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** "368.6 to 377.3"; an open side reads "(very wide)", as fit CIs do. */
export function rangeText(r: unknown): string {
  if (!Array.isArray(r) || r.length !== 2) return "n/a";
  const f = (v: unknown) => (num(v) ? formatSig(v) : "(very wide)");
  return `${f(r[0])} to ${f(r[1])}`;
}

function unknownLabel(item: R, table: { rowTitles?: string[] } | null, subs: number): string {
  if (item.source === "typed") return `Typed Y ${Number(item.index) + 1}`;
  const r = Number(item.row);
  const title = table?.rowTitles?.[r]?.trim();
  const base = title || `Row ${r + 1}`;
  return subs > 1 ? `${base}, replicate ${Number(item.sub) + 1}` : base;
}

function note(item: R, ir: R): string {
  const [lo, hi] = Array.isArray(ir.data_range) ? ir.data_range : [null, null];
  const range = num(lo) && num(hi) ? `${formatSig(lo)} to ${formatSig(hi)}` : "the standards";
  const parts: string[] = [];
  if (item.position === "extrapolated") {
    parts.push(`Extrapolated: X lies outside the standards (${range}), read off the model beyond the data`);
  } else if (item.position === "none") {
    parts.push(item.side === "above" || item.side === "below"
      ? `Not reached: Y is ${item.side} every value the curve takes, so it has no X`
      : "Not reached: the curve does not take this Y, so it has no X");
  }
  if (num(item.crossings) && item.crossings > 1) {
    parts.push(`The curve reaches this Y ${item.crossings} times; the first inside the standards is reported`);
  }
  return parts.length ? `${parts.join(". ")}.` : "";
}

/** Rows of every fitted data set's unknowns, in table order; null when
 *  no data set has any. `table` gives row titles and subcolumn counts. */
export function interpolationTable(result: unknown,
  table: { rowTitles?: string[]; datasets?: { rows: unknown[][] }[] } | null = null):
  InterpolationTable | null {
  const r = result as R | null;
  if (!r || typeof r !== "object" || r.error || !Array.isArray(r.datasets)) return null;
  const rows: InterpolationRow[] = [];
  let xIsLog = false;
  let prediction = true;
  (r.datasets as R[]).forEach((d, di) => {
    const ir = d.interpolation as R | undefined;
    if (!ir || !Array.isArray(ir.items) || !ir.items.length) return;
    xIsLog ||= !!ir.x_is_log;
    prediction &&= ir.prediction !== false;
    const subs = Math.max(1, ...(table?.datasets?.[di]?.rows ?? []).map((row) => row?.length ?? 1));
    for (const it of ir.items as R[]) {
      const has = num(it.x);
      rows.push({
        dataset: String(d.name ?? ""),
        unknown: unknownLabel(it, table, subs),
        y: formatSig(it.y),
        x: has ? formatSig(it.x) : "—",
        conc: ir.x_is_log ? (num(it.x_conc) ? formatSig(it.x_conc) : "—") : null,
        ci: has ? (it.ci ? rangeText(ir.x_is_log ? it.ci_conc : it.ci) : "n/a") : "—",
        pi: has ? (it.pi ? rangeText(ir.x_is_log ? it.pi_conc : it.pi) : "n/a") : "—",
        position: it.position === "extrapolated" || it.position === "none" ? it.position : "within",
        note: note(it, ir),
      });
    }
  });
  return rows.length ? { rows, xIsLog, prediction } : null;
}

/** The markers drawn on the curve: one per unknown that has an X, at
 *  (X, Y) in the graph's units, with its CI as horizontal error bars. */
export function unknownMarkers(result: unknown): UnknownMarker[] {
  const r = result as R | null;
  if (!r || typeof r !== "object" || r.error || !Array.isArray(r.datasets)) return [];
  const out: UnknownMarker[] = [];
  (r.datasets as R[]).forEach((d, ds) => {
    const items = (d.interpolation as R | undefined)?.items;
    if (!Array.isArray(items)) return;
    for (const it of items as R[]) {
      if (!num(it.x) || !num(it.y)) continue;
      const ci = Array.isArray(it.ci) ? it.ci : [];
      out.push({
        ds, x: it.x, y: it.y,
        minus: num(ci[0]) ? it.x - ci[0] : 0,
        plus: num(ci[1]) ? ci[1] - it.x : 0,
        extrapolated: it.position === "extrapolated",
        label: it.source === "typed" ? `Typed Y ${Number(it.index) + 1}` : `Row ${Number(it.row) + 1}`,
      });
    }
  });
  return out;
}
