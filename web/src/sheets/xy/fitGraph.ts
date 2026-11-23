// Options of the curve-fit graph (graph kind "xy"), stored on the graph
// sheet as `settings.xy`, and the IC50 / EC50 drop lines they turn on.
// Absent fields draw the graph exactly as before these options existed:
// no drop lines, no value label, no legend sentence in the figure. Pure.
//
// Drop lines (P-23): from the point of the curve at the fitted IC50 or
// EC50 to both axes, dashed in the data set's colour.
//  - Relative IC50 / EC50 (the dose-response models below): the point is
//    (midpoint, (Top + Bottom) / 2), read from the engine's range flags
//    (rangeflags.py: `midpoint` in the fit's X units, `half_response`),
//    the numbers the results report. The 5PL's EC50 is defined at the
//    same half-way response (its equation sets LogXb so that it is).
//  - Absolute IC50 (absolute_ic50 / absolute_ic50_log): the point is
//    (LogAbsoluteIC50 or AbsoluteIC50, (Top + Baseline) / 2), where the
//    model's own equation crosses its "Fifty" (equations.py).
// No line is drawn for a fit the results flag (the same rules they use):
// ambiguous (guide/checks.ts fitAmbiguous), or a midpoint beyond the
// concentrations tested (range flags, fit.extrapolation); the legend says
// why instead (fitLegend.ts).
import { fitAmbiguous } from "../../guide/checks.ts";
import { axisMap } from "../../graph/axes.ts";
import { datasetFmt, type GraphFormat } from "../../graph/format.ts";
import type { Layout } from "../../graph/apply.ts";
import { seriesStyle, type SchemeId } from "../../lib/palette.ts";
import { formatSig } from "../../types.ts";
import type { CaptionMode } from "../column/graphSettings.ts";

export interface XYGraphSettings {
  /** Dashed lines from the curve at the IC50 / EC50 to both axes. */
  dropLines: boolean;
  /** The IC50 / EC50 value written next to the point (with drop lines). */
  dropLabel: boolean;
  /** The figure legend: under the graph, in the figure, or folded. */
  caption: CaptionMode;
}

export const DEFAULT_XY_GRAPH: XYGraphSettings = {
  dropLines: false, dropLabel: false, caption: "off",
};

export function normalizeXYGraph(raw: unknown): XYGraphSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    dropLines: o.dropLines === true,
    dropLabel: o.dropLabel === true,
    caption: o.caption === "below" || o.caption === "figure" ? o.caption : "off",
  };
}

/** Models whose IC50 / EC50 is the half-way response between the fitted
 *  (or normalised 0 and 100) plateaus. */
const RELATIVE_MODELS = new Set([
  "log_inhibitor_vs_response_4pl", "log_inhibitor_vs_response_3pl",
  "log_agonist_vs_response_4pl", "log_agonist_vs_response_3pl", "one_site_competition",
  "log_agonist_vs_normalized_response", "log_agonist_vs_normalized_response_variable",
  "agonist_vs_response", "agonist_vs_response_variable",
  "agonist_vs_normalized_response", "agonist_vs_normalized_response_variable",
  "log_inhibitor_vs_normalized_response", "log_inhibitor_vs_normalized_response_variable",
  "inhibitor_vs_response", "inhibitor_vs_response_variable",
  "inhibitor_vs_normalized_response", "inhibitor_vs_normalized_response_variable",
  "asymmetric_5pl_log", "asymmetric_5pl",
]);
const ABSOLUTE_MODELS = new Set(["absolute_ic50_log", "absolute_ic50"]);

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

interface DropBase {
  ds: number;
  name: string;
  /** "IC50", "EC50" or "absolute IC50". */
  label: string;
  kind: "relative" | "absolute";
}

export type DropPoint =
  | DropBase & { drawn: true; x: number; y: number;
    /** The IC50 / EC50 in concentration units (the label's number). */
    value: number | null }
  | DropBase & { drawn: false; reason: string };

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function beyond(label: string, above: boolean): string {
  return `the ${label} lies ${above ? "above the highest" : "below the lowest"} concentration tested`;
}

/** Where each fitted curve's drop lines go, or why they are not drawn.
 *  Data sets whose model has no single IC50 / EC50 are left out. */
export function dropPoints(result: unknown): DropPoint[] {
  const r = result as R | null;
  if (!r || r.error || !Array.isArray(r.datasets)) return [];
  const out: DropPoint[] = [];
  r.datasets.forEach((d: R, ds: number) => {
    const fit = d?.fit as R | undefined;
    if (!fit || d.error) return;
    const name = String(d.name ?? `Data set ${ds + 1}`);
    if (RELATIVE_MODELS.has(fit.model)) {
      const f = fit.range_flags as R | undefined;
      if (!f || f.error || !num(f.midpoint) || !num(f.half_response)) return;
      const label = String(f.label ?? "EC50");
      const base: DropBase = { ds, name, label, kind: "relative" };
      if (fitAmbiguous(fit)) out.push({ ...base, drawn: false, reason: "the fit is ambiguous" });
      else if (f.ec50_above_range || f.ec50_below_range) {
        out.push({ ...base, drawn: false, reason: beyond(label, !!f.ec50_above_range) });
      } else if (fit.extrapolation) {
        out.push({ ...base, drawn: false, reason: beyond(label, fit.extrapolation.direction === "above") });
      } else {
        const v = fit.params?.[label]?.value;
        out.push({ ...base, drawn: true, x: f.midpoint, y: f.half_response, value: num(v) ? v : null });
      }
      return;
    }
    if (ABSOLUTE_MODELS.has(fit.model)) {
      const p = (fit.params ?? {}) as Record<string, { value?: unknown }>;
      const logX = fit.model === "absolute_ic50_log";
      const x = p[logX ? "LogAbsoluteIC50" : "AbsoluteIC50"]?.value;
      const top = p.Top?.value, baseline = p.Baseline?.value;
      if (!num(x) || !num(top) || !num(baseline)) return;
      const base: DropBase = { ds, name, label: "absolute IC50", kind: "absolute" };
      const tested = ((d.points?.x ?? []) as unknown[]).filter(num);
      if (fitAmbiguous(fit)) {
        out.push({ ...base, drawn: false, reason: "the fit is ambiguous" });
      } else if (tested.length && (x > Math.max(...tested) || x < Math.min(...tested))) {
        out.push({ ...base, drawn: false, reason: beyond("absolute IC50", x > Math.max(...tested)) });
      } else {
        const v = p.AbsoluteIC50?.value;
        out.push({ ...base, drawn: true, x, y: (top + baseline) / 2, value: num(v) ? v : null });
      }
    }
  });
  return out;
}

/** "IC50 = 1.04e-7 M": the label next to the point. */
export function dropLabelText(p: Extract<DropPoint, { drawn: true }>, unit: string): string {
  const v = p.value;
  return `${p.label} = ${v === null ? "n/a" : formatSig(v)}${unit && v !== null ? ` ${unit}` : ""}`;
}

type Gap = { from: number; to: number } | null | undefined;

/** The part of a discontinuous Y axis (Format axes: a break from `from`
 *  to `to`, data units) that shows a response: "y" up to the break,
 *  "y3" from its end (graph/apply.ts splitAxis), null inside it. Without
 *  a break, "y". */
export function gapSegment(y: number, gap: Gap): "y" | "y3" | null {
  if (!gap || !(gap.to > gap.from)) return "y";
  if (y <= gap.from) return "y";
  return y >= gap.to ? "y3" : null;
}

/** The drop lines (and labels) as Plotly shapes and annotations, added to
 *  a formatted layout. Each line has one end on the curve (axis units)
 *  and one on the plot's edge (axis domain 0), so it reaches the axis at
 *  any zoom without taking part in autorange. On a discontinuous Y axis
 *  the lines go on the segment that holds the response: above the break,
 *  the vertical line runs to that segment's foot and on down the lower
 *  segment (`drop:<ds>:v2`), broken at the break like the axis; a
 *  response inside the break gets no lines (the legend says so, see
 *  dropLegend). Nothing is drawn for hidden data sets or for a point an
 *  axis scale cannot show (log of a value at or below 0). */
export function addDropLines(layout: Layout, points: DropPoint[], format: GraphFormat,
  opts: { dark: boolean; scheme: SchemeId; label: boolean; unit: string; ink: string }): Layout {
  const drawn = points.filter((p): p is Extract<DropPoint, { drawn: true }> => p.drawn);
  if (!drawn.length) return layout;
  const gap = (layout as R).yaxis3 ? format.y?.gap : null;
  const mx = axisMap(format.x), my = axisMap(format.y);
  const shapes = [...((layout.shapes as R[] | undefined) ?? [])];
  const annotations = [...((layout.annotations as R[] | undefined) ?? [])];
  for (const p of drawn) {
    const f = datasetFmt(format, p.ds);
    if (f.show === false) continue;
    const x = mx.to(p.x), y = my.to(p.y);
    if (x === null || y === null || !num(x) || !num(y)) continue;
    const seg = gapSegment(p.y, gap);
    if (!seg) continue;
    const color = f.color ?? seriesStyle(p.ds, opts.dark, opts.scheme).color;
    const line = { color, width: 1.25, dash: "dash" };
    shapes.push(
      { type: "line", name: `drop:${p.ds}:v`, xref: "x", yref: [seg, `${seg} domain`],
        x0: x, x1: x, y0: y, y1: 0, line, layer: "below" },
      { type: "line", name: `drop:${p.ds}:h`, xref: ["x", "x domain"], yref: seg,
        x0: x, x1: 0, y0: y, y1: y, line, layer: "below" },
    );
    if (seg === "y3") {
      shapes.push({ type: "line", name: `drop:${p.ds}:v2`, xref: "x", yref: "y domain",
        x0: x, x1: x, y0: 1, y1: 0, line, layer: "below" });
    }
    if (opts.label) {
      annotations.push({ name: `drop:${p.ds}:label`, xref: "x", yref: seg, x, y,
        text: dropLabelText(p, opts.unit), showarrow: false, xanchor: "left", yanchor: "bottom",
        xshift: 6, yshift: 4, font: { color: opts.ink, size: 12 } });
    }
  }
  return { ...layout, shapes, annotations } as Layout;
}

/** What the legend says about the drop lines: what they mark, and the
 *  data sets left without them and why ("" when they are off). `yGap`
 *  is the graph's Y axis break (Format axes), if any: a response inside
 *  it has no lines. */
export function dropLegend(result: unknown, settings: Pick<XYGraphSettings, "dropLines">,
  yGap?: Gap): string {
  if (!settings.dropLines) return "";
  const pts = dropPoints(result).map((p): DropPoint => (p.drawn && !gapSegment(p.y, yGap)
    ? { ds: p.ds, name: p.name, label: p.label, kind: p.kind, drawn: false,
      reason: `the response at the ${p.label} (${formatSig(p.y)}) falls in the break of the Y axis` }
    : p));
  const parts: string[] = [];
  const drawn = pts.filter((p) => p.drawn);
  if (drawn.length) {
    const labels = [...new Set(drawn.map((p) => p.label))];
    const what = drawn[0].kind === "absolute"
      ? "where the curve crosses (Top + Baseline) / 2"
      : "the concentration giving a response half-way between the fitted Top and Bottom";
    parts.push(`Dashed lines mark the ${labels.join(" and ")} (${what}).`);
  }
  for (const p of pts) {
    if (!p.drawn) parts.push(`No ${p.label} lines for ${p.name}: ${p.reason}.`);
  }
  return parts.join(" ");
}
