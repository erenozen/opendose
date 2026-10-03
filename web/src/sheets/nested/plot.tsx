// Nested scatter: each subcolumn a cluster of points with its mean line,
// clustered under its group, plus the model's group mean and CI when the
// bound results sheet has them. Options live in the graph sheet's
// settings under "nested" (edited in the Settings panel: NestedOptions);
// Format graph styles each group (data set), and pairwise comparisons of
// the nested ANOVA land on the group centres.
import { useMemo } from "react";
import type Plotly from "plotly.js-dist-min";
import { OptCheck } from "../../components/GraphOptionControls";
import { tagTrace } from "../../graph";
import FormattedPlot from "../../graph/FormattedPlot";
import { useDarkMode } from "../../graph/useDarkMode";
import { CHROME_DARK, CHROME_LIGHT, PLOT_FONT, seriesStyle } from "../../lib/palette";
import { parseCell } from "../../project/table";
import { formatSig } from "../../types";
import { asRecord, useGraphOptions } from "../common/graphOptions";
import { levelPct } from "../common/statFormat";
import type { GraphOptionsProps, PlotProps } from "../types";
import { groupName, nestedComparisons, subgroupName } from "./run";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface NestedGraphOptions {
  meansOnly: boolean;   // plot each subcolumn's mean instead of its values
  groupCI: boolean;     // overlay the model's group mean ± CI
}

function sanitize(raw: unknown): NestedGraphOptions {
  const o = asRecord(raw);
  return { meansOnly: o.meansOnly === true, groupCI: o.groupCI !== false };
}

const GAP = 0.9;        // space between groups, in subcolumn widths

export function NestedPlot({ graph, table, options, result, titles, scheme, format,
  onFormatChange }: PlotProps<{ ciLevel?: number } | null, Record<string, any>>) {
  const dark = useDarkMode();
  const opts = sanitize(graph.settings.nested);
  const means: any[] | null = result && !result.error && Array.isArray(result.group_means)
    ? result.group_means : null;
  const ciLevel: number | null = typeof options?.ciLevel === "number" ? options.ciLevel : null;

  const fig = useMemo(() => {
    const chrome = dark ? CHROME_DARK : CHROME_LIGHT;
    const traces: Plotly.Data[] = [];
    const tickvals: number[] = [];
    const ticktext: string[] = [];
    const annotations: Partial<Plotly.Annotations>[] = [];
    const centers = new Map<string, number>();
    let halfWidth = 0.45;
    let x = 0;
    let any = false;

    table.datasets.forEach((ds, g) => {
      const { color, symbol } = seriesStyle(g, dark, scheme);
      const gname = groupName(table, g);
      const nSub = Math.max(1, ds.rows[0]?.length ?? 1);
      const start = x;
      const px: number[] = [];
      const py: number[] = [];
      const prow: number[] = [];
      const ptext: string[] = [];
      const mx: number[] = [];
      const my: number[] = [];
      const mtext: string[] = [];
      for (let s = 0; s < nSub; s++) {
        const sname = subgroupName(table, g, s);
        const vals: { v: number; r: number }[] = [];
        ds.rows.forEach((row, r) => {
          const v = parseCell(row[s] ?? "");
          if (v !== null) vals.push({ v, r });
        });
        tickvals.push(x);
        ticktext.push(sname);
        if (vals.length) {
          any = true;
          const mean = vals.reduce((a, b) => a + b.v, 0) / vals.length;
          mx.push(x);
          my.push(mean);
          mtext.push(`${gname} · ${sname}: mean ${formatSig(mean)} (n = ${vals.length})`);
          if (!opts.meansOnly) {
            vals.forEach(({ v, r }, j) => {
              px.push(x + (vals.length > 1 ? ((j % 5) - 2) * 0.07 : 0));
              py.push(v);
              prow.push(r);
              ptext.push(`${gname} · ${sname}: ${formatSig(v)}`);
            });
          }
        }
        x += 1;
      }
      const end = x - 1;
      if (!opts.meansOnly && px.length) {
        traces.push(tagTrace({
          type: "scatter", mode: "markers", x: px, y: py, text: ptext,
          hovertemplate: "%{text}<extra></extra>",
          marker: { color, symbol, size: 8, line: { color: chrome.surface, width: 1.2 } },
          showlegend: false, name: gname,
        }, { ds: g, role: "points", rows: prow }) as Plotly.Data);
      }
      if (mx.length) {
        traces.push(opts.meansOnly ? tagTrace({
          type: "scatter", mode: "markers", x: mx, y: my, text: mtext,
          hovertemplate: "%{text}<extra></extra>",
          marker: { color, symbol, size: 10, line: { color: chrome.surface, width: 1.5 } },
          showlegend: false, name: gname,
        }, { ds: g, role: "points" }) as Plotly.Data : tagTrace({
          type: "scatter", mode: "markers", x: mx, y: my, text: mtext,
          hovertemplate: "%{text}<extra></extra>",
          marker: { color, symbol: "line-ew", size: 24, line: { color, width: 2.5 } },
          showlegend: false, name: `${gname} subcolumn means`,
        }, { ds: g, role: "summary" }) as Plotly.Data);
      }
      const center = (start + end) / 2;
      centers.set(gname, center);
      halfWidth = Math.max(halfWidth, 0.5 * (end - start) + 0.4);
      annotations.push({
        text: `<b>${escapeHtml(gname)}</b>`, x: center, xref: "x", y: 0, yref: "paper",
        yanchor: "top", yshift: -30, showarrow: false,
        font: { color: chrome.ink, size: 13, family: PLOT_FONT },
      });
      const gm = means?.find((m) => m.name === gname);
      if (opts.groupCI && gm && typeof gm.mean === "number") {
        const half = 0.5 * (end - start) + 0.38;
        traces.push(tagTrace({
          type: "scatter", mode: "lines",
          x: [center - half, center + half], y: [gm.mean, gm.mean],
          line: { color: chrome.ink, width: 2.5 },
          hoverinfo: "skip", showlegend: false,
        }, { ds: g, role: "decor" }) as Plotly.Data);
        if (Array.isArray(gm.ci)) {
          traces.push(tagTrace({
            type: "scatter", mode: "markers", x: [center], y: [gm.mean],
            marker: { size: 1, color: chrome.ink, opacity: 0 },
            error_y: {
              type: "data", symmetric: false,
              array: [gm.ci[1] - gm.mean], arrayminus: [gm.mean - gm.ci[0]],
              color: chrome.ink, thickness: 1.5, width: 10, visible: true,
            },
            hovertemplate: `${escapeHtml(gname)}: mean ${formatSig(gm.mean)}`
              + (ciLevel ? ` (${levelPct(ciLevel)} CI ${formatSig(gm.ci[0])} to `
                + `${formatSig(gm.ci[1])})` : "") + "<extra>model estimate</extra>",
            showlegend: false,
          }, { ds: g, role: "decor" }) as Plotly.Data);
        }
      }
      x += GAP;
    });
    if (!any) {
      annotations.push({
        text: "Enter replicate values in the data table to draw this graph",
        showarrow: false, font: { color: chrome.muted, size: 13 },
        x: 0.5, y: 0.5, xref: "paper", yref: "paper",
      });
    }

    const layout: Partial<Plotly.Layout> = {
      paper_bgcolor: chrome.surface,
      plot_bgcolor: chrome.surface,
      font: { family: PLOT_FONT, color: chrome.inkSecondary, size: 13 },
      margin: { l: 64, r: 16, t: 12, b: 72 },
      showlegend: false,
      xaxis: {
        tickvals, ticktext, zeroline: false, showgrid: false,
        range: [-0.7, Math.max(x - GAP, 1) - 1 + 0.7],
        linecolor: chrome.axis, tickcolor: chrome.axis,
        tickfont: { color: chrome.inkSecondary, size: 11.5 },
        fixedrange: true,
      },
      yaxis: {
        title: { text: titles.y, font: { color: chrome.inkSecondary } },
        gridcolor: chrome.grid, zeroline: false,
        linecolor: chrome.axis, tickcolor: chrome.axis, tickfont: { color: chrome.muted },
      },
      annotations,
      dragmode: "pan",
      uirevision: "keep",
    };
    return { traces, layout, centers, halfWidth };
  }, [table, dark, scheme, titles.y, opts.meansOnly, opts.groupCI, means, ciLevel]);

  const comparisons = useMemo(() => nestedComparisons(result, table)?.comparisons,
    [result, table]);
  const ctx = useMemo(() => ({
    dark, scheme, datasets: table.datasets.map((d) => d.name), rowTitles: table.rowTitles,
    comparisons,
    groupX: (name: string, family?: string) => (family ? null : fig.centers.get(name) ?? null),
    groupHalf: fig.halfWidth,
  }), [dark, scheme, table, comparisons, fig.centers, fig.halfWidth]);

  return (
    <FormattedPlot traces={fig.traces} layout={fig.layout} format={format}
      onFormatChange={onFormatChange} ctx={ctx} filename="nested"
      label="Nested scatter graph" />
  );
}

/** Graph options in the Settings panel. */
export function NestedOptions({ graph, options, result }:
  GraphOptionsProps<{ ciLevel?: number } | null, Record<string, any>>) {
  const [opts, setOpts] = useGraphOptions(graph, "nested", sanitize);
  const ciLevel = typeof options?.ciLevel === "number" ? options.ciLevel : null;
  const hasMeans = !!result && !result.error && Array.isArray(result.group_means);
  return (
    <>
      <OptCheck label="Plot subcolumn means only" checked={opts.meansOnly}
        onChange={(meansOnly) => setOpts({ meansOnly })} />
      <OptCheck label={`Group mean and ${ciLevel ? levelPct(ciLevel) : "95%"} CI (from the analysis)`}
        title={hasMeans ? undefined : "Shown once the analysis has run"}
        checked={opts.groupCI} onChange={(groupCI) => setOpts({ groupCI })} />
    </>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
