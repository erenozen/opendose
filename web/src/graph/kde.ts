// Kernel density of one group, for violins and the cloud of a raincloud
// plot. The bandwidth is chosen by one stated rule and returned, so the
// figure legend can say what was drawn. Pure.
//
// Kernel: Gaussian, f(y) = 1 / (n h) Σ φ((y - x_i) / h), the estimate of
// scipy.stats.gaussian_kde with bw_method = h / SD (SD on n - 1) and of
// R's density(x, bw = h).
// Bandwidth: Silverman's rule of thumb as R's bw.nrd0 (Silverman 1986,
// Density Estimation, eq. 3.31): h = 0.9 min(SD, IQR / 1.34) n^(-1/5),
// IQR by R's quantile type 7 (numpy's linear method); when the IQR is 0
// the SD is used, as bw.nrd0 does. A group with fewer than 2 values, or
// with all values equal, has no density (bw.nrd0 would invent a width
// from the value itself); kdeOf returns null and the legend says why.
// Grid: 512 points from min - 3h to max + 3h, R density()'s n and cut.
// Reference values: __tests__/reference/kde.py (numpy, scipy).
import { percentileOf } from "./boxStats.ts";

export const KDE_POINTS = 512;
export const KDE_CUT = 3;

/** Silverman's rule (R bw.nrd0), or null when there is no spread. */
export function nrd0(values: readonly number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x));
  const n = v.length;
  if (n < 2) return null;
  const mean = v.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  if (!(sd > 0)) return null;
  const s = [...v].sort((a, b) => a - b);
  const iqr = percentileOf(s, 75, "linear")! - percentileOf(s, 25, "linear")!;
  const lo = iqr > 0 ? Math.min(sd, iqr / 1.34) : sd;
  return 0.9 * lo * n ** -0.2;
}

const INV_SQRT_2PI = 1 / Math.sqrt(2 * Math.PI);

/** Gaussian kernel density of `values` with bandwidth `h` at each of `at`. */
export function kdeAt(values: readonly number[], h: number, at: readonly number[]): number[] {
  const v = values.filter((x) => Number.isFinite(x));
  const k = INV_SQRT_2PI / (v.length * h);
  return at.map((y) => {
    let s = 0;
    for (const x of v) {
      const z = (y - x) / h;
      s += Math.exp(-0.5 * z * z);
    }
    return s * k;
  });
}

export interface Kde {
  /** Bandwidth (data units). */
  h: number;
  n: number;
  /** Evaluation grid, ascending. */
  y: number[];
  density: number[];
  /** Largest density on the grid (for scaling the violin's width). */
  max: number;
}

/** The density of one group on R's grid, or null (fewer than 2 values,
 *  or all values equal). */
export function kdeOf(values: readonly number[]): Kde | null {
  const v = values.filter((x) => Number.isFinite(x));
  const h = nrd0(v);
  if (h === null) return null;
  let lo = Infinity, hi = -Infinity;
  for (const x of v) { if (x < lo) lo = x; if (x > hi) hi = x; }
  const a = lo - KDE_CUT * h, b = hi + KDE_CUT * h;
  const y = Array.from({ length: KDE_POINTS }, (_, i) => a + (b - a) * i / (KDE_POINTS - 1));
  const density = kdeAt(v, h, y);
  return { h, n: v.length, y, density, max: Math.max(...density) };
}

/** Why a group has no density. */
export type NoDensity = "few" | "equal" | "nonpositive";

export interface GroupDensity {
  kde: Kde | null;
  /** The density is of log10(values) (the graph's Y axis is log10). */
  log: boolean;
  why?: NoDensity;
}

/** The density a violin of one group draws: of the values, or of their
 *  log10 when the Y axis is log10 (a value of 0 or less has none). */
export function groupDensity(values: readonly number[], logY: boolean): GroupDensity {
  const v = values.filter((x) => Number.isFinite(x));
  if (logY && v.some((x) => x <= 0)) return { kde: null, log: true, why: "nonpositive" };
  const k = kdeOf(logY ? v.map(Math.log10) : v);
  if (k) return { kde: k, log: logY };
  return { kde: null, log: logY, why: v.length < 2 ? "few" : "equal" };
}

/** Half-width of the violin at `y` (linear between grid points), for a
 *  violin whose widest point is `half` wide. 0 outside the grid. */
export function widthAt(k: Kde, y: number, half: number): number {
  const { y: g, density: d } = k;
  if (!(y >= g[0] && y <= g[g.length - 1])) return 0;
  const step = (g[g.length - 1] - g[0]) / (g.length - 1);
  const i = Math.min(g.length - 2, Math.floor((y - g[0]) / step));
  const t = (y - g[i]) / step;
  return (d[i] + (d[i + 1] - d[i]) * t) / k.max * half;
}

/** A bandwidth as the legend writes it: 3 significant digits, e-notation
 *  outside 0.001 to 100,000 (the rule of types.ts formatSig). */
export function bandwidthText(h: number): string {
  const a = Math.abs(h);
  if (a >= 1e5 || a < 1e-3) return h.toExponential(2);
  return Number(h.toPrecision(3)).toString();
}
