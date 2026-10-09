// Dense graphs (need `large-data`): above DENSE_POINTS points, Plotly's
// SVG scatter adds one DOM node per marker, so 100,000 values take tens of
// seconds to draw and every hover or pan re-lays them out. Above that
// threshold the marker traces switch to `scattergl` (WebGL: one canvas,
// drawn in well under a second); lines, fits, summary marks and small
// traces stay SVG so they remain crisp in vector exports. Box and violin
// plots stop drawing every point (outliers only) for the same reason.
// SVG / PDF / EPS exports of a WebGL graph embed those points as an image
// (the export panel says so). Pure; unit-tested (__tests__/dense.test.ts).

/** Points per graph above which marker traces are drawn with WebGL. At
 *  5,000 SVG markers a draw takes about a second on a laptop and hover
 *  starts to lag; WebGL stays interactive into the millions. */
export const DENSE_POINTS = 5000;
/** Traces smaller than this stay SVG even in a dense graph (a mean line,
 *  a fitted curve's markers, one data set of a few points). */
export const DENSE_TRACE_MIN = 200;

type Trace = Record<string, unknown>;

const isScatter = (t: Trace) => t.type === undefined || t.type === "scatter";
const lengthOf = (v: unknown) => (Array.isArray(v) || ArrayBuffer.isView(v)
  ? (v as ArrayLike<unknown>).length : 0);

/** Number of points a trace draws as markers (0 for lines-only traces). */
export function markerPoints(t: Trace): number {
  const n = Math.max(lengthOf(t.y), lengthOf(t.x));
  if (t.type === "box" || t.type === "violin") {
    const all = t.type === "box" ? t.boxpoints === "all" : t.points === "all";
    return all ? n : 0;
  }
  if (!isScatter(t)) return 0;
  const mode = typeof t.mode === "string" ? t.mode : "markers";
  return mode.includes("markers") ? n : 0;
}

/** Can this trace be drawn by scattergl without losing what it shows? */
function glReady(t: Trace): boolean {
  if (!isScatter(t)) return false;
  if (t.fill && t.fill !== "none") return false;
  const line = t.line as { shape?: string } | undefined;
  if (line?.shape === "spline") return false;
  const mode = typeof t.mode === "string" ? t.mode : "markers";
  return mode.includes("markers") && !mode.includes("text");
}

export interface DenseResult<T> {
  traces: T[];
  /** Whether any trace now draws with WebGL. */
  webgl: boolean;
  /** Marker points in the graph. */
  points: number;
}

/**
 * The traces as drawn: unchanged (the same array) at or below
 * DENSE_POINTS marker points; above it, large marker traces become
 * `scattergl` and box / violin plots show outliers instead of every point.
 */
export function densify<T>(traces: T[]): DenseResult<T> {
  const ts = traces as unknown as Trace[];
  const points = ts.reduce((n, t) => n + markerPoints(t), 0);
  if (points <= DENSE_POINTS) return { traces, webgl: false, points };
  let webgl = false;
  const out = ts.map((t) => {
    const n = markerPoints(t);
    if (n < DENSE_TRACE_MIN) return t;
    if (t.type === "box") return { ...t, boxpoints: "outliers" };
    if (t.type === "violin") return { ...t, points: "outliers" };
    if (!glReady(t)) return t;
    webgl = true;
    // scattergl has no SVG clip-path option: drop it.
    const { cliponaxis: _c, ...rest } = t;
    void _c;
    return { ...rest, type: "scattergl" };
  });
  return { traces: out as unknown as T[], webgl, points };
}

/** Whether a drawn Plotly graph div holds WebGL traces. */
export function hasWebglTraces(gd: unknown): boolean {
  const data = (gd as { _fullData?: { type?: string }[] } | null)?._fullData;
  return Array.isArray(data) && data.some((t) => t.type === "scattergl");
}
