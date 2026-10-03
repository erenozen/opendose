// Point placement for column-type graphs: how the points of one group are
// spread sideways around the group's centre. Pure (no DOM): the plots pass
// the pixel scale of the plot area, so non-overlap holds at the size the
// graph is drawn at.
//
//   jitter     the classic deterministic offsets (five lanes), as before
//   swarm      beeswarm: no two markers overlap; each point takes the free
//              position nearest the centre line, lowest values first
//   symmetric  points with (nearly) equal values sit side by side, spread
//              symmetrically about the centre; every point keeps its exact
//              Y (the layout of scatter dot plots in GraphPad Prism)

export type PointSpread = "jitter" | "swarm" | "symmetric";

export const POINT_SPREADS: readonly (readonly [PointSpread, string])[] = [
  ["jitter", "Jitter (fixed lanes)"],
  ["swarm", "Beeswarm (no overlap)"],
  ["symmetric", "Symmetric (equal values side by side)"],
];

export function isPointSpread(v: unknown): v is PointSpread {
  return v === "jitter" || v === "swarm" || v === "symmetric";
}

/** The original fixed-lane jitter of column graphs, in category units. */
export function laneJitter(n: number, step = 0.045): number[] {
  return Array.from({ length: n }, (_, j) => (n > 1 ? ((j % 5) - 2) * step : 0));
}

export interface SpreadScale {
  /** Pixels per data unit on the value (Y) axis. */
  pxPerY: number;
  /** Pixels per category unit on the X axis (the distance between groups). */
  pxPerX: number;
  /** Marker diameter in px (plus any gap wanted between markers). */
  marker: number;
  /** Largest offset either side, in category units (default 0.42). */
  maxHalf?: number;
}

/**
 * Beeswarm offsets in category units, aligned with `values`.
 *
 * Points are placed in order of value; each takes, among the centre line
 * and the positions just touching an already placed neighbour, the one
 * nearest the centre that overlaps nothing. Ties alternate sides, so equal
 * values fan out evenly. When the swarm would be wider than `maxHalf` it
 * is compressed to fit (overlap is then unavoidable).
 */
export function beeswarm(values: number[], s: SpreadScale): number[] {
  const n = values.length;
  const out = new Array<number>(n).fill(0);
  if (n <= 1 || !(s.pxPerY > 0) || !(s.pxPerX > 0) || !(s.marker > 0)) return out;
  const d = s.marker;
  const order = values.map((_, i) => i).sort((a, b) => values[a] - values[b] || a - b);
  const placed: { x: number; y: number }[] = [];   // px
  let right = false;
  for (const i of order) {
    const y = values[i] * s.pxPerY;
    // Only neighbours within one diameter vertically can collide.
    const near = placed.filter((p) => Math.abs(p.y - y) < d);
    const cands = [0];
    for (const p of near) {
      const dx = Math.sqrt(Math.max(0, d * d - (p.y - y) ** 2));
      cands.push(p.x + dx, p.x - dx);
    }
    const ok = (x: number) => near.every((p) => (p.x - x) ** 2 + (p.y - y) ** 2 >= d * d - 1e-6);
    let best = Number.POSITIVE_INFINITY;
    for (const c of cands) {
      if (!ok(c)) continue;
      const a = Math.abs(c), b = Math.abs(best);
      if (a < b - 1e-9 || (Math.abs(a - b) <= 1e-9 && (right ? c > best : c < best))) best = c;
    }
    if (!Number.isFinite(best)) best = 0;
    if (Math.abs(best) > 1e-9) right = !right;
    placed.push({ x: best, y });
    out[i] = best / s.pxPerX;
  }
  return fit(out, s.maxHalf ?? 0.42);
}

/**
 * Symmetric offsets in category units: values closer than one marker
 * height to the lowest value of their run share a row, and each row of k
 * points is centred, one marker apart: (j − (k − 1) / 2) · d.
 */
export function symmetricSpread(values: number[], s: SpreadScale): number[] {
  const n = values.length;
  const out = new Array<number>(n).fill(0);
  if (n <= 1 || !(s.pxPerY > 0) || !(s.pxPerX > 0) || !(s.marker > 0)) return out;
  const order = values.map((_, i) => i).sort((a, b) => values[a] - values[b] || a - b);
  const tol = s.marker / s.pxPerY;          // one marker height, data units
  let start = 0;
  while (start < n) {
    const base = values[order[start]];
    let end = start + 1;
    while (end < n && values[order[end]] - base < tol) end++;
    const k = end - start;
    for (let j = 0; j < k; j++) {
      out[order[start + j]] = ((j - (k - 1) / 2) * s.marker) / s.pxPerX;
    }
    start = end;
  }
  return fit(out, s.maxHalf ?? 0.42);
}

/** Offsets for one group, in category units, by the chosen layout. */
export function spreadOffsets(values: number[], how: PointSpread, s: SpreadScale | null,
  laneStep = 0.045): number[] {
  if (how === "jitter" || !s) return laneJitter(values.length, laneStep);
  return how === "swarm" ? beeswarm(values, s) : symmetricSpread(values, s);
}

/** Scale offsets down so none exceeds `half` (keeps their proportions). */
function fit(xs: number[], half: number): number[] {
  const m = Math.max(0, ...xs.map(Math.abs));
  if (!(half > 0) || m <= half) return xs;
  return xs.map((x) => (x * half) / m);
}

/**
 * The pixel scale for spreading points: the plot area's height and width
 * in px, the value range shown and the number of category slots across X.
 * The layouts only need the scale to within a few per cent, so the range
 * is padded the way Plotly pads an automatic axis.
 */
export function spreadScale(heightPx: number, widthPx: number, yMin: number, yMax: number,
  slots: number, markerPx: number, maxHalf?: number): SpreadScale | null {
  const span = yMax - yMin;
  if (!(heightPx > 0) || !(widthPx > 0) || !(slots > 0)) return null;
  const pxPerY = span > 0 ? heightPx / (span * 1.1) : heightPx;
  return { pxPerY, pxPerX: widthPx / slots, marker: markerPx, maxHalf };
}
