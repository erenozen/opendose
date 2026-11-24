// The X axis break of a curve-fit graph (P-104): a log(X) model leaves out
// the wells whose X has no logarithm (a zero dose, the vehicle), and the
// graph can draw them in their own segment left of a break, at their
// entered X, while the log-dose axis and the curve stay to the right. No
// dose is made up for them (FEATURE-PLAN do-not-build 9): the segment is
// a separate axis labelled with the X entered, and the curve never
// crosses the break. Pure; unit-tested in __tests__/zeroBreak.test.ts.
import type { Layout } from "../../graph/apply.ts";
import type { AxisFormat } from "../../graph/format.ts";
import { formatSig } from "../../types.ts";
import { zeroDosePlan } from "./zeroDose.ts";
import type { AnalysisResult, OptionsState } from "../../types.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

/** One left-out row of one data set: its X as entered and the mean and
 *  error bar the graph would draw there. */
export interface ZeroPoint { ds: number; row: number; x: number; y: number; plus: number; minus: number }

/** The rows each data set's log(X) fit left out (engine log_x_dropped
 *  rows), with their mean and error bar from the result's points. */
export function zeroPoints(result: unknown): ZeroPoint[] {
  const r = result as R | null;
  if (!r || r.error || !Array.isArray(r.datasets)) return [];
  const out: ZeroPoint[] = [];
  (r.datasets as R[]).forEach((ds, i) => {
    const d = ds?.log_x_dropped;
    const rows: unknown = d?.rows;
    const xs: unknown = d?.row_x;
    if (!Array.isArray(rows) || !Array.isArray(xs) || rows.length !== xs.length) return;
    rows.forEach((row, k) => {
      const b = ds.points?.bars?.[row];
      if (typeof row !== "number" || typeof xs[k] !== "number" || typeof b?.mean !== "number") return;
      out.push({ ds: i, row, x: xs[k], y: b.mean,
        plus: typeof b.hi === "number" ? b.hi - b.mean : 0,
        minus: typeof b.lo === "number" ? b.mean - b.lo : 0 });
    });
  });
  return out;
}

/** The figure-legend sentence for the segment ("" without one). */
export function zeroBreakLegend(result: unknown, options: unknown): string {
  if (!zeroPoints(result).length) return "";
  const plan = zeroDosePlan(result as AnalysisResult, (options ?? {}) as OptionsState);
  const xs = [...new Set(zeroPoints(result).map((p) => p.x))].sort((a, b) => a - b);
  const at = xs.map((x) => formatSig(x)).join(", ");
  let s = `Points left of the break in the X axis are at X = ${at}, which has no logarithm: `
    + "they are not points on the curve";
  if (plan?.active && plan.held.length) {
    s += `, and each curve's ${plan.active.param} is held at the mean of its own wells there`;
  } else if (plan?.constrained && plan.plateau) {
    s += `, and ${plan.plateau} is constrained to their mean`;
  } else {
    s += ", and the curve was fitted without them";
  }
  return `${s}.`;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Default share of the X axis given to the zero-dose segment. */
export const ZERO_SEGMENT = 0.12;
/** Width of the break between the segments, as a share of the axis. */
const BREAK = 0.035;

/**
 * Add the zero-dose segment to a formatted curve-fit figure: the X axis
 * (`xaxis`) moves right, a new axis `xaxis3` takes the left `segment` of
 * the plot, each data set's left-out rows are drawn there as copies of
 * its formatted point trace (same symbol, colour, error bars), and two
 * break marks sit on the X axis line. Returns the inputs unchanged when
 * there is nothing to draw.
 */
export function addZeroSegment(traces: R[], layout: Layout, pts: ZeroPoint[], fmt: AxisFormat | undefined,
  opts: { unit: string; ink: string }): { traces: R[]; layout: Layout } {
  if (!pts.length) return { traces, layout };
  const xs = [...new Set(pts.map((p) => p.x))].sort((a, b) => a - b);
  const pos = new Map(xs.map((x, i) => [x, i]));
  const added: R[] = [];
  const byDs = new Map<number, ZeroPoint[]>();
  for (const p of pts) (byDs.get(p.ds) ?? byDs.set(p.ds, []).get(p.ds)!).push(p);
  for (const [ds, list] of byDs) {
    const src = traces.find((t) => t?.meta?.odTag?.ds === ds && t.meta.odTag.role === "points"
      && (t.xaxis ?? "x") === "x" && (t.yaxis ?? "y") !== "y3");
    if (!src || src.visible === false) continue;
    const t = structuredClone(src);
    t.x = list.map((p) => pos.get(p.x)!);
    t.y = list.map((p) => p.y);
    t.xaxis = "x3";
    t.showlegend = false;
    t.mode = String(t.mode ?? "markers").includes("text") ? "markers+text" : "markers";
    t.meta = { ...t.meta, odTag: { ...t.meta.odTag, rows: list.map((p) => p.row) }, zeroDose: true };
    if (Array.isArray(t.text)) {
      const rows: number[] = src.meta.odTag.rows ?? [];
      t.text = list.map((p) => {
        const k = rows.indexOf(p.row);
        return k >= 0 ? src.text[k] : "";
      });
    }
    for (const k of Object.keys(t.marker ?? {})) {
      if (Array.isArray(t.marker[k])) t.marker[k] = list.map(() => t.marker[k][0]);
    }
    if (t.error_y) {
      const has = list.some((p) => p.plus > 0 || p.minus > 0);
      t.error_y = has ? { ...t.error_y, array: list.map((p) => p.plus),
        arrayminus: list.map((p) => p.minus) } : undefined;
    }
    delete t.error_x;
    t.hovertemplate = `${t.name ?? ""}<br>X = %{customdata} (no logarithm: not on the curve)`
      + "<br>response = %{y:.4g}<extra></extra>";
    t.customdata = list.map((p) => formatSig(p.x));
    added.push(t);
  }
  if (!added.length) return { traces, layout };
  const L: R = { ...layout };
  if (L.yaxis3) {
    for (const t of [...added]) added.push({ ...structuredClone(t), yaxis: "y3" });
  }
  const x0: R = L.xaxis ?? {};
  const [d0, d1] = Array.isArray(x0.domain) ? x0.domain as [number, number] : [0, 1];
  const share = isNum(fmt?.segment) ? fmt!.segment! : ZERO_SEGMENT;
  const w = d1 - d0;
  const zEnd = d0 + share * w * (1 - BREAK);
  const dStart = zEnd + BREAK * w;
  const label = (x: number) => (fmt?.zeroLabel?.trim() && xs.length === 1 ? fmt.zeroLabel.trim()
    : `${formatSig(x)}${opts.unit ? ` ${opts.unit}` : ""}`);
  const x3: R = { ...x0 };
  for (const k of ["title", "rangebreaks", "minor", "dtick", "tick0", "nticks", "tickformat",
    "exponentformat", "showexponent", "matches", "scaleanchor", "overlaying", "rangemode"]) delete x3[k];
  Object.assign(x3, { domain: [d0, zEnd], range: [-0.6, xs.length - 0.4], autorange: false,
    type: "linear", tickmode: "array", tickvals: xs.map((_, i) => i), ticktext: xs.map(label),
    showgrid: false, zeroline: false });
  L.xaxis3 = x3;
  L.xaxis = { ...x0, domain: [dStart, d1] };
  // the Y axes keep their line at the far left, beside the zero segment
  for (const k of ["yaxis", "yaxis3"]) {
    const ax = L[k];
    if (ax && (ax.anchor === undefined || ax.anchor === "x")) L[k] = { ...ax, anchor: "x3" };
  }
  // break marks where the X axis line is cut: two short slants
  const yLine = x0.anchor === "free" && isNum(x0.position) ? x0.position
    : (Array.isArray(L.yaxis?.domain) ? L.yaxis.domain[0] : 0);
  const color = x0.linecolor ?? opts.ink;
  const mark = (px: number, side: string) => ({ type: "line", name: `xbreak:${side}`,
    xref: "paper", yref: "paper", xsizemode: "pixel", ysizemode: "pixel", xanchor: px, yanchor: yLine,
    x0: -4, x1: 4, y0: -7, y1: 7, line: { color, width: 1.5 } });
  L.shapes = [...(L.shapes ?? []), mark(zEnd, "left"), mark(dStart, "right")];
  return { traces: [...traces, ...added], layout: L as Layout };
}
