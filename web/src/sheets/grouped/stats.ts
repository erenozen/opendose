// Pure helpers for grouped tables: per-cell summaries (from replicates or
// from entered mean / SD / N), error bars, bar positions and heat-map
// color mapping. No React, no DOM: unit-tested with node --test
// (src/sheets/grouped/__tests__).
import { parseCell } from "../../project/table.ts";
import type { DataTableModel, SubcolumnFormat } from "../../project/types.ts";

// ------------------------------------------------------------ distributions

/** ln Γ(x), Lanczos approximation (|error| < 2e-10 for x > 0). */
function lnGamma(x: number): number {
  const g = [76.18009172947146, -86.50532032941678, 24.01409824083091,
    -1.231739572450155, 0.001208650973866179, -0.000005395239384953];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let ser = 1.00000000019;
  for (const c of g) ser += c / ++y;
  return -tmp + Math.log(2.5066282746310007 * ser / x);
}

/** Continued fraction for the incomplete beta function (modified Lentz). */
function betacf(a: number, b: number, x: number): number {
  const TINY = 1e-300;
  let c = 1;
  let d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a, b). */
export function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b)
    + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2)
    ? bt * betacf(a, b, x) / a
    : 1 - bt * betacf(b, a, 1 - x) / b;
}

/** Student t cumulative distribution P(T <= t). */
export function tCdf(t: number, df: number): number {
  const tail = 0.5 * incompleteBeta(df / (df + t * t), df / 2, 0.5);
  return t >= 0 ? 1 - tail : tail;
}

/** Student t quantile (inverse CDF) by bisection; exact to ~1e-12. */
export function tQuantile(p: number, df: number): number {
  if (!(df > 0) || !(p > 0 && p < 1)) return NaN;
  if (p === 0.5) return 0;
  if (p < 0.5) return -tQuantile(1 - p, df);
  let lo = 0;
  let hi = 1;
  while (tCdf(hi, df) < p) hi *= 2;
  for (let i = 0; i < 200 && hi - lo > 1e-13 * Math.max(1, hi); i++) {
    const mid = (lo + hi) / 2;
    if (tCdf(mid, df) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// ------------------------------------------------------------ cell summaries

/** One row × dataset cell, summarized. `values` holds the replicates
 *  (empty for summary-format tables). */
export interface CellStat {
  n: number;
  mean: number;
  sd: number | null;
  sem: number | null;
  /** Bounds of the CI of the mean (95%), when computable. */
  ciLo: number | null;
  ciHi: number | null;
  min: number | null;
  max: number | null;
  median: number | null;
  q1: number | null;
  q3: number | null;
  geoMean: number | null;
  /** Entered limits (upper/lower format) or null. */
  lo: number | null;
  hi: number | null;
  values: number[];
}

/** Percentile with linear interpolation between ranks (the same rule as
 *  the engine's column statistics, numpy's default). */
export function percentile(sorted: number[], p: number): number | null {
  const n = sorted.length;
  if (!n) return null;
  const h = (n - 1) * p;
  const k = Math.floor(h);
  if (k >= n - 1) return sorted[n - 1];
  return sorted[k] + (h - k) * (sorted[k + 1] - sorted[k]);
}

export function summarize(values: number[]): CellStat | null {
  const v = values.filter((x) => Number.isFinite(x));
  const n = v.length;
  if (!n) return null;
  const mean = v.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1
    ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : null;
  const sem = sd !== null ? sd / Math.sqrt(n) : null;
  const half = sem !== null ? tQuantile(0.975, n - 1) * sem : null;
  const sorted = [...v].sort((a, b) => a - b);
  const geoMean = v.every((x) => x > 0)
    ? Math.exp(v.reduce((a, b) => a + Math.log(b), 0) / n) : null;
  return {
    n, mean, sd, sem,
    ciLo: half !== null ? mean - half : null,
    ciHi: half !== null ? mean + half : null,
    min: sorted[0], max: sorted[n - 1],
    median: percentile(sorted, 0.5),
    q1: percentile(sorted, 0.25), q3: percentile(sorted, 0.75),
    geoMean, lo: null, hi: null, values: v,
  };
}

/** A cell entered in a summary format (mean with SD / SEM / %CV / CI and
 *  N, or limits). Returns null when no mean was entered. */
export function summaryCell(cells: (number | null)[], fmt: SubcolumnFormat):
  CellStat | null {
  const [m, e, third] = cells;
  if (m === null || m === undefined || !Number.isFinite(m)) return null;
  const n0 = fmt.endsWith("_n") && third != null && third > 0 ? third : null;
  let sd: number | null = null;
  let sem: number | null = null;
  let lo: number | null = null;
  let hi: number | null = null;
  const err = e ?? null;
  switch (fmt) {
    case "mean_sd_n": case "mean_sd": sd = err; break;
    case "mean_sem_n": case "mean_sem": sem = err; break;
    case "mean_cv_n": sd = err !== null ? Math.abs(m) * err / 100 : null; break;
    case "mean_ci_n":
      if (err !== null && n0 !== null && n0 > 1) {
        sem = err / tQuantile(0.975, n0 - 1);
      }
      break;
    case "upper_lower":
      hi = err; lo = third ?? null;
      break;
    default: break;
  }
  if (sd === null && sem !== null && n0) sd = sem * Math.sqrt(n0);
  if (sem === null && sd !== null && n0) sem = sd / Math.sqrt(n0);
  let ciLo: number | null = null;
  let ciHi: number | null = null;
  if (sem !== null && n0 && n0 > 1) {
    const h = tQuantile(0.975, n0 - 1) * sem;
    ciLo = m - h; ciHi = m + h;
  }
  return {
    n: n0 ?? 0, mean: m, sd, sem, ciLo, ciHi, min: null, max: null,
    median: null, q1: null, q3: null, geoMean: null, lo, hi, values: [],
  };
}

/** cells[row][dataset] for the table (exclusions should already be
 *  blanked by the caller). */
export function cellStats(t: DataTableModel): (CellStat | null)[][] {
  const nRows = t.rowTitles.length;
  return Array.from({ length: nRows }, (_, r) => t.datasets.map((d) => {
    const raw = (d.rows[r] ?? []).map(parseCell);
    if (t.subcolumnFormat !== "replicates") {
      return summaryCell(raw, t.subcolumnFormat);
    }
    return summarize(raw.filter((v): v is number => v !== null));
  }));
}

export type ErrorKind = "sd" | "sem" | "ci" | "range" | "none";

export const ERROR_LABELS: Record<ErrorKind, string> = {
  sd: "Mean ± SD",
  sem: "Mean ± SEM",
  ci: "Mean with 95% CI",
  range: "Mean with range",
  none: "Mean only",
};

/** [below, above] lengths of an error bar around the cell mean. */
export function errorExtent(c: CellStat, kind: ErrorKind): [number, number] {
  const pair = (lo: number | null, hi: number | null): [number, number] =>
    (lo === null || hi === null ? [0, 0] : [c.mean - lo, hi - c.mean]);
  if (c.lo !== null && c.hi !== null && kind !== "none") return pair(c.lo, c.hi);
  switch (kind) {
    case "sd": return c.sd !== null ? [c.sd, c.sd] : [0, 0];
    case "sem": return c.sem !== null ? [c.sem, c.sem] : [0, 0];
    case "ci": return pair(c.ciLo, c.ciHi);
    case "range": return pair(c.min, c.max);
    default: return [0, 0];
  }
}

/** Grand mean or median of every value in the table (summary tables:
 *  of the cell means). */
export function grandValue(cells: (CellStat | null)[][], kind: "mean" | "median"):
  number | null {
  const all: number[] = [];
  for (const row of cells) {
    for (const c of row) {
      if (!c) continue;
      if (c.values.length) all.push(...c.values); else all.push(c.mean);
    }
  }
  if (!all.length) return null;
  if (kind === "mean") return all.reduce((a, b) => a + b, 0) / all.length;
  const s = [...all].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ------------------------------------------------------------ layout

/** Centers of the bars in each cluster. Cluster i is centered on i; the
 *  cluster gap and the gap between bars are fractions (of the cluster
 *  pitch and of one bar width). Returns the bar width as well. */
export function barPositions(nClusters: number, nSeries: number,
  clusterGap: number, barGap: number): { width: number; x: number[][] } {
  const k = Math.max(1, nSeries);
  const g = Math.min(Math.max(clusterGap, 0), 0.9);
  const b = Math.min(Math.max(barGap, 0), 2);
  const width = (1 - g) / (k + (k - 1) * b);
  const x = Array.from({ length: nClusters }, (_, i) => {
    const start = i - (1 - g) / 2 + width / 2;
    return Array.from({ length: k }, (_, j) => start + j * width * (1 + b));
  });
  return { width, x };
}

/** Order of indices 0..n-1, optionally reversed. */
export function ordered(n: number, reverse: boolean): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  return reverse ? idx.reverse() : idx;
}

// ------------------------------------------------------------ colors

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: [number, number, number]): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v)))
    .toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Mix a with b: t = 0 gives a, t = 1 gives b (sRGB). */
export function mixHex(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t,
    A[2] + (B[2] - A[2]) * t]);
}

/** WCAG relative luminance of a hex color. */
export function luminance(hex: string): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Black or white, whichever reads better on `bg`. */
export function inkOn(bg: string): string {
  const L = luminance(bg);
  const onWhite = 1.05 / (L + 0.05);
  const onDark = (L + 0.05) / (luminance("#1d1d1f") + 0.05);
  return onWhite >= onDark ? "#ffffff" : "#1d1d1f";
}

export type ColorStops = [number, string][];

/** Color at position t (0..1) of a stop list. */
export function colorAt(stops: ColorStops, t: number): string {
  const x = Math.min(1, Math.max(0, t));
  for (let i = 1; i < stops.length; i++) {
    const [p1, c1] = stops[i];
    const [p0, c0] = stops[i - 1];
    if (x <= p1) return mixHex(c0, c1, p1 === p0 ? 0 : (x - p0) / (p1 - p0));
  }
  return stops[stops.length - 1][1];
}

export type HeatPalette = "sequential" | "diverging" | "grayscale";

/** Heat-map color stops built from the graph's color scheme: a single-hue
 *  ramp of the scheme's lead color, a two-hue diverging map through a
 *  neutral midpoint, or grays. `center` (0..1) places the diverging
 *  midpoint. */
export function heatStops(palette: HeatPalette, lead: string, second: string,
  reverse: boolean, center = 0.5): ColorStops {
  let stops: ColorStops;
  if (palette === "grayscale" || lead === second) {
    stops = [[0, "#f4f4f6"], [1, "#1d1d1f"]];
  } else if (palette === "diverging") {
    const c = Math.min(0.95, Math.max(0.05, center));
    stops = [
      [0, mixHex(lead, "#000000", 0.25)], [c / 2, mixHex(lead, "#ffffff", 0.35)],
      [c, "#f4f4f2"],
      [c + (1 - c) / 2, mixHex(second, "#ffffff", 0.35)],
      [1, mixHex(second, "#000000", 0.25)],
    ];
  } else {
    stops = [[0, mixHex(lead, "#ffffff", 0.9)], [0.5, mixHex(lead, "#ffffff", 0.35)],
      [0.8, lead], [1, mixHex(lead, "#000000", 0.45)]];
  }
  if (reverse) {
    stops = stops.map(([p, col]) => [1 - p, col] as [number, string]).reverse();
  }
  return stops;
}

// ------------------------------------------------------------ engine payloads

/** Grouped payload: row titles plus each dataset's replicate rows. */
export function groupedPayload(t: DataTableModel): {
  row_titles: string[];
  datasets: { name: string; ys: (number | null)[][] }[];
} {
  return {
    row_titles: t.rowTitles.map((r, i) => r.trim() || `Row ${i + 1}`),
    datasets: t.datasets.map((d, i) => ({
      name: d.name || `Dataset ${i + 1}`,
      ys: d.rows.map((row) => row.map(parseCell)),
    })),
  };
}

/** Repeated measures: true when a subject (subcolumn) that has any value
 *  is missing a value somewhere it should have one, so the fit must be
 *  the mixed-effects model rather than RM ANOVA. `both`: every dataset
 *  shares subjects, so subcolumn k must be complete across datasets. */
export function hasMissingRM(ys: (number | null)[][][], both: boolean): boolean {
  const used = (d: number) => {
    const out = new Set<number>();
    ys[d].forEach((row) => row.forEach((v, s) => { if (v !== null) out.add(s); }));
    return out;
  };
  const subjects = both
    ? [...new Set(ys.flatMap((_, d) => [...used(d)]))]
    : null;
  for (let d = 0; d < ys.length; d++) {
    const subs = subjects ?? [...used(d)];
    for (const row of ys[d]) {
      for (const s of subs) if (row[s] === null || row[s] === undefined) return true;
    }
  }
  return false;
}
