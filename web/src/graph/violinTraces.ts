// Violins with a stated bandwidth and raincloud plots (Allen et al. 2019,
// Wellcome Open Res 4:63): the density outline is drawn from kde.ts as a
// filled path, so the shape on screen and in every export is the density
// the legend names, and the quartile lines are the column statistics'
// quartiles (boxStats.ts, the P-04 definition). Plotly's own violin trace
// picks its bandwidth itself and is kept only for violins saved before.
// Pure: returns Plotly trace objects (tagged for the format layer).
import { boxStats, percentileOf, type PercentileMethod, type WhiskerRule } from "./boxStats.ts";
import { widthAt, type GroupDensity } from "./kde.ts";
import { tagTrace, type TraceTag } from "./apply.ts";

type Trace = Record<string, unknown>;

/** Raincloud geometry, in category units around a group at x = i: the
 *  cloud (half violin) to the right, the box in the middle, the rain
 *  (points) to the left. */
export const RAIN = {
  cloudBase: -0.04, cloudHalf: 0.42,
  boxX: -0.14, boxWidth: 0.1,
  rainX: -0.3, rainHalf: 0.08,
} as const;

/** Full violin half-width (category units). */
export const VIOLIN_HALF = 0.4;

/** The closed outline of a density at x = `x0`: both sides (`side` 0) or
 *  only the right side (`side` 1, the cloud of a raincloud). Y is in data
 *  units (10^grid when the density is of log10 values). */
export function violinOutline(g: GroupDensity, x0: number, half: number, side: 0 | 1):
  { x: number[]; y: number[] } {
  const k = g.kde!;
  const ys = g.log ? k.y.map((v) => 10 ** v) : k.y;
  const w = k.density.map((d) => d / k.max * half);
  const right = ys.map((_, j) => x0 + w[j]);
  const last = ys.length - 1;
  if (side === 1) return { x: [x0, ...right, x0, x0], y: [ys[0], ...ys, ys[last], ys[0]] };
  const back = [...ys.keys()].reverse();
  return { x: [...right, ...back.map((j) => x0 - w[j]), right[0]],
    y: [...ys, ...back.map((j) => ys[j]), ys[0]] };
}

export interface ViolinStyle {
  color: string;
  name: string;
  ink: string;
  ds: number;
  rows: number[];
  keys: string[];
  /** Marker symbol and edge colour of the points. */
  symbol: string;
  edge: string;
}

const outlineTrace = (o: { x: number[]; y: number[] }, s: ViolinStyle): Trace =>
  tagTrace({
    x: o.x, y: o.y, type: "scatter", mode: "lines", fill: "toself",
    fillcolor: s.color + "33", line: { color: s.color, width: 2 },
    // unnamed: a page layout's master legend takes the group from the points
    hoverinfo: "skip", showlegend: false,
  }, { ds: s.ds, role: "violin" } as TraceTag);

const Q_NAMES = ["25th percentile", "median", "75th percentile"];

/** Quartile lines across a violin: the median solid, the quartiles
 *  dashed, each as wide as the violin at that value. */
export function quartileLines(g: GroupDensity, values: readonly number[], method: PercentileMethod,
  x0: number, half: number, s: ViolinStyle): Trace[] {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  return [25, 50, 75].map((p, j) => {
    const y = percentileOf(sorted, p, method)!;
    const w = widthAt(g.kde!, g.log ? Math.log10(y) : y, half);
    return tagTrace({
      x: [x0 - w, x0 + w], y: [y, y], type: "scatter", mode: "lines",
      line: { color: s.ink, width: j === 1 ? 2 : 1.2, dash: j === 1 ? "solid" : "dash" },
      hovertemplate: `${s.name}: ${Q_NAMES[j]} %{y:.4g}<extra></extra>`,
      showlegend: false,
    }, { ds: s.ds, role: "decor" } as TraceTag);
  });
}

function pointsTrace(values: number[], xs: number[], s: ViolinStyle): Trace {
  return tagTrace({
    x: xs, y: values, mode: "markers", type: "scatter",
    marker: { color: s.color, symbol: s.symbol, size: 6, line: { color: s.edge, width: 1 } },
    showlegend: false, name: s.name,
    hovertemplate: `${s.name}: %{y:.4g}<extra></extra>`,
  }, { ds: s.ds, role: "points", rows: s.rows, keys: s.keys } as TraceTag);
}

/** A violin with a stated bandwidth: outline, quartile lines, points.
 *  `offsets` place the points around x0. */
export function violinTraces(g: GroupDensity, values: number[], x0: number, offsets: number[],
  method: PercentileMethod, s: ViolinStyle): Trace[] {
  const out: Trace[] = [];
  if (g.kde) {
    out.push(outlineTrace(violinOutline(g, x0, VIOLIN_HALF, 0), s));
    out.push(...quartileLines(g, values, method, x0, VIOLIN_HALF, s));
  }
  out.push(pointsTrace(values, values.map((_, j) => x0 + offsets[j]), s));
  return out;
}

/** A raincloud: half violin, a narrow box (quartiles and whiskers of the
 *  column statistics) and the points beside it. `offsets` spread the
 *  rain within ±RAIN.rainHalf. */
export function raincloudTraces(g: GroupDensity, values: number[], x0: number, offsets: number[],
  method: PercentileMethod, whiskers: WhiskerRule, s: ViolinStyle): Trace[] {
  const out: Trace[] = [];
  if (g.kde) out.push(outlineTrace(violinOutline(g, x0 + RAIN.cloudBase, RAIN.cloudHalf, 1), s));
  const b = boxStats(values, method, whiskers);
  if (b) {
    const box: Trace = tagTrace({
      y: [values], x: [x0 + RAIN.boxX], type: "box",
      q1: [b.q1], median: [b.median], q3: [b.q3],
      lowerfence: [b.lowerfence], upperfence: [b.upperfence],
      width: RAIN.boxWidth, boxpoints: false, name: s.name,
      marker: { color: s.color }, line: { color: s.color, width: 1.5 },
      fillcolor: s.color + "33", showlegend: false,
      hovertemplate: `${s.name}: %{y:.4g}<extra></extra>`,
    }, { ds: s.ds, role: "box" } as TraceTag);
    // Column spacing (format.spacing) widens boxes; this one stays narrow.
    (box.meta as Record<string, unknown>).fixedWidth = true;
    out.push(box);
  }
  out.push(pointsTrace(values, values.map((_, j) => x0 + RAIN.rainX + offsets[j]), s));
  return out;
}
