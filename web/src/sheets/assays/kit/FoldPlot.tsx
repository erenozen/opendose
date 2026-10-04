// Fold-change graph shared by the qPCR and densitometry modules: one point
// per biological replicate, the geometric mean with its asymmetric CI,
// a reference line at 1, optional paired lines (one per blot / subject),
// and a log2 Y axis unless the user picked another scale in Format axes.
// Groups are the format layer's data sets (colour, symbol per group);
// clusters (targets) sit side by side on a category axis.
import { useMemo } from "react";
import type Plotly from "plotly.js-dist-min";
import { tagTrace, type GraphFormat } from "../../../graph";
import { withLog2 } from "./format";
import FormattedPlot from "../../../graph/FormattedPlot";
import { useDarkMode } from "../../../graph/useDarkMode";
import { CHROME_DARK, CHROME_LIGHT, PLOT_FONT, seriesStyle, type SchemeId } from "../../../lib/palette";

export interface FoldPoint { y: number; label: string; key?: string }

export interface FoldCluster {
  name: string;
  groups: { group: string; points: FoldPoint[]; center: number | null; ci: number[] | null }[];
}

export interface FoldPlotProps {
  groups: string[];
  clusters: FoldCluster[];
  /** Connect points sharing a key within a cluster (paired by blot). */
  pairedLines?: boolean;
  yTitle: string;
  scheme: SchemeId;
  format?: GraphFormat;
  onFormatChange?: (f: GraphFormat) => void;
  filename: string;
  label: string;
  empty?: string;
}

const GAP = 0.8;

export default function FoldPlot({ groups, clusters, pairedLines, yTitle, scheme, format,
  onFormatChange, filename, label, empty }: FoldPlotProps) {
  const dark = useDarkMode();
  const fig = useMemo(() => {
    const chrome = dark ? CHROME_DARK : CHROME_LIGHT;
    const traces: Plotly.Data[] = [];
    const tickvals: number[] = [];
    const ticktext: string[] = [];
    const annotations: Partial<Plotly.Annotations>[] = [];
    let x = 0;
    let any = false;
    const multi = clusters.length > 1;
    for (const c of clusters) {
      const start = x;
      const pos = new Map<string, number>();
      for (const g of c.groups) {
        const gi = Math.max(0, groups.indexOf(g.group));
        const st = seriesStyle(gi, dark, scheme);
        pos.set(g.group, x);
        tickvals.push(x);
        ticktext.push(g.group);
        if (g.points.length) {
          any = true;
          const n = g.points.length;
          traces.push(tagTrace({
            type: "scatter", mode: "markers", name: g.group, showlegend: false,
            x: g.points.map((_, i) => x + (n > 1 && !pairedLines ? ((i % 5) - 2) * 0.06 : 0)),
            y: g.points.map((p) => p.y), text: g.points.map((p) => p.label),
            hovertemplate: "%{text}<extra></extra>",
            marker: { color: st.color, symbol: st.symbol, size: 8, line: { color: chrome.surface, width: 1 } },
          }, { ds: gi, role: "points" }) as Plotly.Data);
        }
        if (g.center !== null && g.center > 0) {
          const ci = g.ci && g.ci.length === 2 ? g.ci : null;
          traces.push(tagTrace({
            type: "scatter", mode: "markers", showlegend: false, name: `${g.group} geometric mean`,
            x: [x + 0.22], y: [g.center],
            text: [`${c.name ? `${c.name}, ` : ""}${g.group}: ${Number(g.center.toPrecision(4))}`
              + (ci ? ` (CI ${Number(ci[0].toPrecision(4))} to ${Number(ci[1].toPrecision(4))})` : "")],
            hovertemplate: "%{text}<extra>geometric mean</extra>",
            marker: { color: chrome.ink, symbol: "line-ew", size: 18, line: { color: chrome.ink, width: 2.5 } },
            error_y: ci ? {
              type: "data", symmetric: false, array: [ci[1] - g.center], arrayminus: [g.center - ci[0]],
              color: chrome.ink, thickness: 1.5, width: 6, visible: true,
            } : undefined,
          }, { ds: gi, role: "summary" }) as Plotly.Data);
        }
        x += 1;
      }
      if (pairedLines) {
        const byKey = new Map<string, { x: number; y: number }[]>();
        for (const g of c.groups) {
          for (const p of g.points) {
            if (!p.key) continue;
            byKey.set(p.key, [...(byKey.get(p.key) ?? []), { x: pos.get(g.group)!, y: p.y }]);
          }
        }
        for (const [key, pts] of byKey) {
          if (pts.length < 2) continue;
          traces.push(tagTrace({
            type: "scatter", mode: "lines", x: pts.map((p) => p.x), y: pts.map((p) => p.y),
            line: { color: chrome.muted, width: 1 }, hoverinfo: "skip", showlegend: false, name: key,
          }, { ds: 0, role: "decor" }) as Plotly.Data);
        }
      }
      if (multi) {
        annotations.push({
          text: `<b>${c.name.replace(/</g, "&lt;")}</b>`, x: (start + x - 1) / 2, xref: "x", y: 0, yref: "paper",
          yanchor: "top", yshift: -28, showarrow: false, font: { size: 13, color: chrome.ink, family: PLOT_FONT },
        });
      }
      x += GAP;
    }
    const xEnd = Math.max(1, x - GAP) - 1;
    traces.unshift(tagTrace({
      type: "scatter", mode: "lines", x: [-0.6, xEnd + 0.6], y: [1, 1],
      line: { color: chrome.muted, width: 1, dash: "dash" }, hoverinfo: "skip", showlegend: false, name: "fold change 1",
    }, { ds: 0, role: "decor" }) as Plotly.Data);
    if (!any) {
      annotations.push({ text: empty ?? "No fold changes yet", showarrow: false, x: 0.5, y: 0.5,
        xref: "paper", yref: "paper", font: { color: chrome.muted, size: 13 } });
    }
    const layout: Partial<Plotly.Layout> = {
      paper_bgcolor: chrome.surface, plot_bgcolor: chrome.surface,
      font: { family: PLOT_FONT, color: chrome.inkSecondary, size: 13 },
      margin: { l: 64, r: 16, t: 12, b: multi ? 72 : 48 },
      showlegend: false,
      xaxis: { tickvals, ticktext, range: [-0.6, xEnd + 0.6], zeroline: false, showgrid: false,
        linecolor: chrome.axis, tickfont: { color: chrome.inkSecondary }, fixedrange: true },
      yaxis: { title: { text: yTitle }, gridcolor: chrome.grid, zeroline: false, linecolor: chrome.axis,
        tickfont: { color: chrome.muted } },
      annotations, dragmode: "pan", uirevision: "keep",
    };
    return { traces, layout };
  }, [dark, scheme, groups, clusters, pairedLines, yTitle, empty]);
  const fmt = useMemo(() => withLog2(format), [format]);
  const ctx = useMemo(() => ({ dark, scheme, datasets: groups }), [dark, scheme, groups]);
  return (
    <FormattedPlot traces={fig.traces} layout={fig.layout} format={fmt} onFormatChange={onFormatChange}
      ctx={ctx} filename={filename} label={label} />
  );
}
