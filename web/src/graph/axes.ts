// Axis scales, tick generation and number formats for the Format Axes
// layer. Pure functions.
//
// A log10 axis is Plotly's native log axis. log2, ln and probability
// scales have no Plotly equivalent, so their data are transformed and the
// axis is linear in the transformed units with generated tick labels.
// Either way, shapes and annotations are placed in "axis units" (log10
// of the value on a log axis, as Plotly expects), via AxisMap.to().
import type { AxisFormat, ScaleKind } from "./format.ts";

export interface AxisMap {
  scale: ScaleKind;
  /** Plotly draws the scale itself (linear, native log). */
  native: boolean;
  /** Data value -> axis units (null when the value cannot be shown). */
  to: (v: number) => number | null;
  /** Axis units -> data value. */
  from: (v: number) => number;
}

export function axisMap(a: AxisFormat | undefined): AxisMap {
  const scale = a?.scale ?? "linear";
  switch (scale) {
    case "log10":
      return { scale, native: true,
        to: (v) => (v > 0 ? Math.log10(v) : null), from: (v) => 10 ** v };
    case "log2":
      return { scale, native: false,
        to: (v) => (v > 0 ? Math.log2(v) : null), from: (v) => 2 ** v };
    case "ln":
      return { scale, native: false,
        to: (v) => (v > 0 ? Math.log(v) : null), from: (v) => Math.exp(v) };
    case "probability":
      // Values are percentages (0-100), drawn on a normal-quantile scale.
      return { scale, native: false,
        to: (v) => (v > 0 && v < 100 ? normInv(v / 100) : null),
        from: (v) => normCdf(v) * 100 };
    default:
      return { scale: "linear", native: true, to: (v) => v, from: (v) => v };
  }
}

/** True when trace data must be rewritten for this scale. */
export function transformsData(a: AxisFormat | undefined): boolean {
  return !axisMap(a).native;
}

// ------------------------------------------------------- normal quantile

/** Standard normal CDF (Abramowitz-Stegun 7.1.26 via erf, |err| < 1.5e-7). */
export function normCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t
    - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** Inverse standard normal CDF (Acklam's rational approximation). */
export function normInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687,
    138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866,
    66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996,
    3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
      / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - lo) return -normInv(1 - p);
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q
    / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

// ------------------------------------------------------------ ticks

/** A "nice" step (1, 2, 2.5 or 5 × 10^k) giving about `target` intervals. */
export function niceStep(span: number, target = 6): number {
  if (!(span > 0) || !Number.isFinite(span)) return 1;
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  const m = n < 1.5 ? 1 : n < 2.25 ? 2 : n < 3.5 ? 2.5 : n < 7.5 ? 5 : 10;
  return m * mag;
}

/** Multiples of `step` within [lo, hi] (with float tolerance). */
export function ticksBetween(lo: number, hi: number, step: number, max = 500): number[] {
  if (!(step > 0) || !Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) return [];
  const out: number[] = [];
  const start = Math.ceil(lo / step - 1e-9);
  for (let k = start; k * step <= hi + step * 1e-9 && out.length < max; k++) {
    out.push(Number((k * step).toPrecision(12)));
  }
  return out;
}

/** Compact decimal for a tick or table label. */
export function shortNumber(v: number, digits = 4): string {
  if (v === 0) return "0";
  const abs = Math.abs(v);
  if (abs >= 1e5 || abs < 1e-3) {
    const [m, e] = v.toExponential(Math.max(0, digits - 1)).split("e");
    return `${m.replace(/\.?0+$/, "")}e${Number(e)}`;
  }
  return Number(v.toPrecision(digits)).toString();
}

const SUPERSCRIPT_MINUS = "−";

/** "10<sup>−3</sup>" style label for Plotly (which renders <sup>). */
export function powerLabel(base: string, exp: number): string {
  const e = Number(exp.toPrecision(6));
  const s = e < 0 ? `${SUPERSCRIPT_MINUS}${-e}` : String(e);
  return `${base}<sup>${s}</sup>`;
}

/** Elapsed-time label for a value in `unit`: h:mm, h:mm:ss or m:ss. */
export function elapsedLabel(v: number, unit: "s" | "min" | "h", withSeconds: boolean): string {
  const secs = Math.round(v * (unit === "h" ? 3600 : unit === "min" ? 60 : 1));
  const sign = secs < 0 ? "-" : "";
  const a = Math.abs(secs);
  const h = Math.floor(a / 3600), m = Math.floor((a % 3600) / 60), s = a % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (unit === "s" && h === 0) return `${sign}${m}:${pad(s)}`;
  return withSeconds ? `${sign}${h}:${pad(m)}:${pad(s)}` : `${sign}${h}:${pad(m)}`;
}

/** Nice elapsed-time step in the axis unit (whole seconds/minutes/hours). */
export function elapsedStep(span: number, unit: "s" | "min" | "h"): number {
  const perSec = unit === "h" ? 1 / 3600 : unit === "min" ? 1 / 60 : 1;
  const secsSpan = span / perSec;
  const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200,
    10800, 21600, 43200, 86400];
  const want = secsSpan / 6;
  const s = steps.find((x) => x >= want) ?? Math.ceil(want / 86400) * 86400;
  return s * perSec;
}

/** Standard probability-axis ticks (percent). */
export const PROBABILITY_TICKS = [0.1, 1, 5, 10, 25, 50, 75, 90, 95, 99, 99.9];

export interface GeneratedTicks {
  tickvals: number[];
  ticktext: string[];
  minor?: number[];
}

/**
 * Ticks for axes whose labels Plotly cannot produce: transformed scales
 * (log2, ln, probability), antilog numbering of an axis holding log10
 * values, and elapsed times. `lo`/`hi` are the visible range in axis units.
 * Returns null when Plotly's own ticks should be used.
 */
export function generateTicks(a: AxisFormat, lo: number, hi: number): GeneratedTicks | null {
  const scale = a.scale ?? "linear";
  const numbers = a.numbers ?? "auto";
  const minorN = a.minorCount ?? 0;
  if (scale === "probability") {
    const vals = PROBABILITY_TICKS.map((p) => ({ p, v: normInv(p / 100) }))
      .filter((t) => t.v >= lo - 1e-9 && t.v <= hi + 1e-9);
    return { tickvals: vals.map((t) => t.v), ticktext: vals.map((t) => String(t.p)) };
  }
  if (scale === "log2" || scale === "ln") {
    const base = scale === "log2" ? 2 : Math.E;
    const step = a.majorStep && a.majorStep > 0 ? a.majorStep : 1;
    const vals = ticksBetween(lo, hi, step);
    const text = vals.map((v) => (numbers === "power10"
      ? powerLabel(scale === "log2" ? "2" : "e", v) : fmtNumber(base ** v, a)));
    const minor: number[] = [];
    if (minorN > 0) {
      for (const v of vals.concat([vals[0] - step])) {
        for (let k = 1; k <= minorN; k++) {
          // evenly spaced in data units between b^v and b^(v+step)
          const d0 = base ** v, d1 = base ** (v + step);
          const m = Math.log(d0 + (d1 - d0) * k / (minorN + 1)) / Math.log(base);
          if (m >= lo && m <= hi) minor.push(m);
        }
      }
    }
    return { tickvals: vals, ticktext: text, minor: minor.length ? minor : undefined };
  }
  if (scale === "linear" && numbers === "antilog") {
    const step = a.majorStep && a.majorStep > 0 ? a.majorStep : 1;
    const vals = ticksBetween(lo, hi, step);
    const minor: number[] = [];
    if (minorN > 0 && step === 1) {
      for (let e = Math.floor(lo); e <= Math.ceil(hi); e++) {
        for (let k = 2; k <= 9; k++) {
          const m = e + Math.log10(k);
          if (m >= lo && m <= hi) minor.push(m);
        }
      }
    }
    return {
      tickvals: vals,
      ticktext: vals.map((v) => shortNumber(10 ** v)),
      minor: minor.length ? minor : undefined,
    };
  }
  if (scale === "linear" && numbers === "elapsed") {
    const unit = a.elapsedUnit ?? "h";
    const step = a.majorStep && a.majorStep > 0 ? a.majorStep : elapsedStep(hi - lo, unit);
    const vals = ticksBetween(lo, hi, step);
    const secsStep = step * (unit === "h" ? 3600 : unit === "min" ? 60 : 1);
    const withSeconds = Math.abs(secsStep % 60) > 1e-6;
    return { tickvals: vals, ticktext: vals.map((v) => elapsedLabel(v, unit, withSeconds)) };
  }
  return null;
}

/** Label for one value under the decimal / scientific formats. */
export function fmtNumber(v: number, a: AxisFormat): string {
  const d = a.decimals;
  switch (a.numbers) {
    case "decimal": return d != null ? v.toFixed(d) : shortNumber(v, 6);
    case "scientific": return v.toExponential(d ?? 1);
    default: return shortNumber(v);
  }
}

/** Plotly tickformat-style attributes for formats Plotly can label itself
 *  (on linear and native log axes). */
export function plotlyNumberAttrs(a: AxisFormat): Record<string, unknown> {
  const d = a.decimals;
  switch (a.numbers) {
    case "decimal":
      return { tickformat: d != null ? `,.${d}f` : ",~f" };
    case "scientific":
      return { tickformat: `.${d ?? 1}e` };
    case "power10":
      return { exponentformat: "power", showexponent: "all" };
    case "date":
      return a.dateFormat ? { tickformat: a.dateFormat } : {};
    default:
      return {};
  }
}
