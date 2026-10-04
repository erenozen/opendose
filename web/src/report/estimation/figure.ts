// The estimation plot as Plotly traces and layout (pure):
// - Gardner-Altman (one comparison): the raw data of both groups as a
//   swarm on the left axis; on the right, the bootstrap distribution of
//   the difference (half-violin) with the difference and its CI, on a
//   second axis whose zero is the control mean, so the difference reads
//   directly against the data (Gardner & Altman 1986; Ho et al. 2019).
// - Cumming (several comparisons): swarms above, each test group's
//   difference from its control with CI and bootstrap distribution below
//   (Cumming 2012; Ho et al. 2019).
// Paired designs join each subject's values with lines (slopegraph).
// Traces are tagged for the graph-format layer: swarms as "points" of
// their group, half-violins as "band" of the test group.
import type * as Plotly from "plotly.js";
import { tagTrace } from "../../graph/apply.ts";
import type { Chrome } from "../../lib/palette.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

export interface FigureInput {
  result: R;
  /** Colour and symbol of data set i of the table (scheme style). */
  color: (i: number) => string;
  symbol: (i: number) => string;
  /** The table's data set a plotted group belongs to (colour, format tag). */
  dsOf: (group: string) => number;
  chrome: Chrome;
  font: string;
  yTitle: string;
  /** Paired designs: each group's values by subject (row), nulls kept. */
  aligned?: Record<string, (number | null)[]>;
}

export interface Figure { traces: Plotly.Data[]; layout: Partial<Plotly.Layout>; names: string[] }

/** Beeswarm offsets: each value at the smallest horizontal offset that
 *  keeps it `dy` (axis units) away from the values already placed. */
export function swarmOffsets(values: number[], dy: number, step = 0.07, max = 0.38): number[] {
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const placed: { y: number; x: number }[] = [];
  const out = new Array<number>(values.length).fill(0);
  for (const [y, i] of order) {
    const near = placed.filter((p) => Math.abs(p.y - y) < dy);
    let x = 0;
    for (let k = 0; k < 60; k++) {
      const cand = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * step;
      if (Math.abs(cand) > max) { x = (k % 2 ? 1 : -1) * max; break; }
      if (near.every((p) => Math.abs(p.x - cand) >= step * 0.999)) { x = cand; break; }
    }
    placed.push({ y, x });
    out[i] = x;
  }
  return out;
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function estimationFigure(inp: FigureInput): Figure {
  const r = inp.result;
  const { chrome } = inp;
  const order: string[] = r.plot?.order ?? (r.groups ?? []).map((g: R) => g.name);
  const groups = new Map<string, R>((r.groups ?? []).map((g: R) => [g.name, g]));
  const comps: R[] = Array.isArray(r.comparisons) ? r.comparisons : [];
  const ga = r.plot?.kind === "gardner_altman" && comps.length === 1;
  const paired = !!r.paired;
  const traces: Plotly.Data[] = [];
  const pos = new Map(order.map((n, i) => [n, i]));
  const all: number[] = order.flatMap((n) => (groups.get(n)?.values ?? []).filter(finite));
  const lo0 = all.length ? Math.min(...all) : 0, hi0 = all.length ? Math.max(...all) : 1;
  const span = hi0 - lo0 || Math.abs(hi0) || 1;
  const dy = span * 0.03;
  const effLabel = comps[0]?.effects?.[0]?.label ?? "Mean difference";

  // ---- raw data: swarm (or slopegraph for paired designs)
  order.forEach((name, i) => {
    const g = groups.get(name);
    const vals: number[] = (g?.values ?? []).filter(finite);
    if (!vals.length) return;
    const offs = paired ? vals.map(() => 0) : swarmOffsets(vals, dy);
    const ds = inp.dsOf(name);
    traces.push(tagTrace({
      type: "scatter", mode: "markers", x: vals.map((_, j) => i + offs[j]), y: vals,
      marker: { color: inp.color(ds), symbol: inp.symbol(ds), size: 7, line: { color: chrome.surface, width: 1 } },
      name, showlegend: false, hovertemplate: `${esc(name)}: %{y:.4g}<extra></extra>`,
      xaxis: "x", yaxis: "y",
    }, { ds, role: "points" }) as Plotly.Data);
    // mean ± SD as a gapped line beside the group (DABEST style)
    if (finite(g?.mean) && finite(g?.sd) && !paired) {
      const x = i + 0.42, gap = span * 0.012;
      traces.push(tagTrace({
        type: "scatter", mode: "lines", x: [x, x, null, x, x],
        y: [g!.mean - g!.sd, g!.mean - gap, null, g!.mean + gap, g!.mean + g!.sd],
        line: { color: chrome.ink, width: 2 }, hoverinfo: "skip", showlegend: false,
        xaxis: "x", yaxis: "y",
      }, { ds, role: "decor" }) as Plotly.Data);
      traces.push(tagTrace({
        type: "scatter", mode: "markers", x: [x], y: [g!.mean],
        marker: { color: chrome.ink, size: 1, opacity: 0 }, showlegend: false,
        hovertemplate: `${esc(name)}: mean ${fmt(g!.mean)}, SD ${fmt(g!.sd)} (n = ${g!.n})<extra></extra>`,
        xaxis: "x", yaxis: "y",
      }, { ds, role: "decor" }) as Plotly.Data);
    }
  });
  if (paired && inp.aligned) {
    for (const c of comps) {
      const a = inp.aligned[c.control], b = inp.aligned[c.test];
      if (!a || !b) continue;
      const xa = pos.get(c.control)!, xb = pos.get(c.test)!;
      const xs: (number | null)[] = [], ys: (number | null)[] = [];
      a.forEach((v, k) => {
        const w = b[k];
        if (finite(v) && finite(w)) { xs.push(xa, xb, null); ys.push(v, w, null); }
      });
      traces.unshift(tagTrace({
        type: "scatter", mode: "lines", x: xs, y: ys, line: { color: chrome.axis, width: 1 },
        hoverinfo: "skip", showlegend: false, xaxis: "x", yaxis: "y",
      }, { ds: inp.dsOf(c.test), role: "decor" }) as Plotly.Data);
    }
  }

  // ---- effect sizes
  const effX = (c: R) => (ga ? order.length - 1 + 1.2 : pos.get(c.test) ?? 0);
  const effY = ga ? "y2" : "y2";
  let eLo = Infinity, eHi = -Infinity;
  comps.forEach((c) => {
    const e = c.effects?.[0];
    if (!e || !finite(e.difference)) return;
    const ti = inp.dsOf(c.test);
    const x0 = effX(c);
    const kde = e.bootstrap?.kde;
    if (kde && Array.isArray(kde.x) && Array.isArray(kde.density) && kde.x.length > 1) {
      const dmax = Math.max(...kde.density.filter(finite)) || 1;
      const w = 0.36;
      const xs = [...kde.x.map((_: number, k: number) => x0 + (w * kde.density[k]) / dmax),
        ...[...kde.x].reverse().map(() => x0)];
      const ys = [...kde.x, ...[...kde.x].reverse()];
      traces.push(tagTrace({
        type: "scatter", mode: "lines", x: xs, y: ys, fill: "toself",
        fillcolor: inp.color(ti) + "55", line: { color: inp.color(ti), width: 1 },
        hoverinfo: "skip", showlegend: false, xaxis: "x", yaxis: effY,
      }, { ds: ti, role: "band" }) as Plotly.Data);
      eLo = Math.min(eLo, ...kde.x); eHi = Math.max(eHi, ...kde.x);
    }
    const ci: [number, number] | null = Array.isArray(e.ci) && finite(e.ci[0]) && finite(e.ci[1]) ? e.ci : null;
    if (ci) { eLo = Math.min(eLo, ci[0]); eHi = Math.max(eHi, ci[1]); }
    eLo = Math.min(eLo, e.difference, 0); eHi = Math.max(eHi, e.difference, 0);
    traces.push(tagTrace({
      type: "scatter", mode: "markers", x: [x0], y: [e.difference],
      marker: { color: chrome.ink, size: 10, symbol: "circle" },
      error_y: ci ? { type: "data", symmetric: false, array: [ci[1] - e.difference],
        arrayminus: [e.difference - ci[0]], color: chrome.ink, thickness: 2, width: 0, visible: true } : undefined,
      showlegend: false,
      hovertemplate: `${esc(c.test)} − ${esc(c.control)}: ${esc(e.label ?? "difference")} ${fmt(e.difference)}`
        + (ci ? `<br>${Math.round((e.ci_level ?? 0.95) * 100)}% CI (${e.ci_type === "percentile" ? "percentile" : "BCa"}) ${fmt(ci[0])} to ${fmt(ci[1])}` : "")
        + "<extra></extra>",
      xaxis: "x", yaxis: effY,
    }, { ds: ti, role: "decor" }) as Plotly.Data);
  });
  if (!Number.isFinite(eLo)) { eLo = -1; eHi = 1; }

  const tickvals = order.map((_, i) => i);
  const ticktext = order.map((n) => `${esc(n)}<br>n = ${groups.get(n)?.n ?? 0}`);
  const axisBase = {
    linecolor: chrome.axis, tickcolor: chrome.axis, zeroline: false,
    tickfont: { color: chrome.inkSecondary, size: 11.5 }, gridcolor: chrome.grid,
  };
  const shapes: Partial<Plotly.Shape>[] = [];
  let layout: Partial<Plotly.Layout>;
  if (ga) {
    // One axis of data, the difference axis sharing its scale, offset so
    // that 0 sits at the control mean.
    const c = comps[0];
    const ref: number = finite(r.plot?.reference_mean) && c.effects?.[0]?.effect !== "median_diff"
      ? r.plot.reference_mean : finite(r.plot?.reference_median) ? r.plot.reference_median : 0;
    const scaleFree = ["cohens_d", "hedges_g", "cliffs_delta"].includes(c.effects?.[0]?.effect);
    let lo = Math.min(lo0, ref + eLo), hi = Math.max(hi0, ref + eHi);
    if (scaleFree) { lo = lo0; hi = hi0; }
    const pad = (hi - lo || 1) * 0.08;
    lo -= pad; hi += pad;
    const xEff = order.length - 1 + 1.2;
    const testMean = groups.get(c.test)?.mean;
    const ctrlMean = groups.get(c.control)?.mean;
    if (!scaleFree && finite(ctrlMean) && finite(testMean)) {
      shapes.push(
        { type: "line", xref: "x", yref: "y", x0: pos.get(c.control)! + 0.2, x1: xEff + 0.45, y0: ref, y1: ref,
          line: { color: chrome.muted, width: 1, dash: "dot" } },
        { type: "line", xref: "x", yref: "y", x0: pos.get(c.test)! + 0.2, x1: xEff + 0.45,
          y0: ref + (c.effects[0].difference ?? 0), y1: ref + (c.effects[0].difference ?? 0),
          line: { color: chrome.muted, width: 1, dash: "dot" } },
      );
    }
    const y2range = scaleFree ? [Math.min(eLo, 0) * 1.15 - 0.05, Math.max(eHi, 0) * 1.15 + 0.05]
      : [lo - ref, hi - ref];
    layout = {
      xaxis: { ...axisBase, tickvals: [...tickvals, xEff], ticktext: [...ticktext, `${esc(c.test)}<br>minus<br>${esc(c.control)}`],
        range: [-0.6, xEff + 0.65], showgrid: false, fixedrange: true },
      yaxis: { ...axisBase, title: { text: inp.yTitle, font: { color: chrome.inkSecondary } }, range: [lo, hi] },
      yaxis2: { ...axisBase, overlaying: "y", side: "right", range: y2range, showgrid: false,
        title: { text: `${effLabel}`, font: { color: chrome.inkSecondary } } },
      margin: { l: 64, r: 70, t: 14, b: 86 },
    };
  } else {
    let lo = lo0, hi = hi0;
    const pad = (hi - lo || 1) * 0.08;
    lo -= pad; hi += pad;
    const ePad = (eHi - eLo || 1) * 0.1;
    shapes.push({ type: "line", xref: "paper", yref: "y2", x0: 0, x1: 1, y0: 0, y1: 0,
      line: { color: chrome.muted, width: 1, dash: "dot" } });
    layout = {
      xaxis: { ...axisBase, tickvals, ticktext, range: [-0.6, order.length - 0.4], showgrid: false,
        fixedrange: true, anchor: "y2" },
      yaxis: { ...axisBase, title: { text: inp.yTitle, font: { color: chrome.inkSecondary } },
        range: [lo, hi], domain: [0.44, 1] },
      yaxis2: { ...axisBase, range: [eLo - ePad, eHi + ePad], domain: [0, 0.36], anchor: "x",
        title: { text: effLabel, font: { color: chrome.inkSecondary } } },
      margin: { l: 70, r: 16, t: 14, b: 86 },
    };
  }
  return {
    traces,
    layout: {
      ...layout,
      paper_bgcolor: chrome.surface, plot_bgcolor: chrome.surface,
      font: { family: inp.font, color: chrome.inkSecondary, size: 13 },
      showlegend: false, shapes, dragmode: "pan", uirevision: "keep",
    },
    names: order,
  };
}

function fmt(v: number): string { return Number(v.toPrecision(4)).toString(); }
function esc(s: string): string { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
