// Nested scatter: each subcolumn a cluster of points with its mean line,
// clustered under its group, plus the model's group mean and CI when the
// bound results sheet has them. Options live in the graph sheet's
// settings under "nested".
import "../common/sheetKit.css";
import { useEffect, useRef, useState } from "react";
import Plotly from "plotly.js-dist-min";
import {
  CHROME_DARK, CHROME_LIGHT, PLOT_FONT, isDarkMode, onThemeChange, seriesStyle,
} from "../../lib/palette";
import { parseCell } from "../../project/table";
import { formatSig } from "../../types";
import { asRecord, useGraphOptions } from "../common/graphOptions";
import { levelPct } from "../common/statFormat";
import type { PlotProps } from "../types";
import { groupName, subgroupName } from "./run";

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

export function NestedPlot({ graph, table, options, result, titles, scheme }:
  PlotProps<{ ciLevel?: number } | null, Record<string, any>>) {
  const el = useRef<HTMLDivElement>(null);
  const [dark, setDark] = useState(isDarkMode());
  const [opts, setOpts] = useGraphOptions(graph, "nested", sanitize);
  const means: any[] | null = result && !result.error && Array.isArray(result.group_means)
    ? result.group_means : null;
  const ciLevel: number | null = typeof options?.ciLevel === "number" ? options.ciLevel : null;

  useEffect(() => onThemeChange(() => setDark(isDarkMode())), []);

  useEffect(() => {
    const div = el.current;
    if (!div) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if ((div as unknown as { _fullLayout?: unknown })._fullLayout) {
          Plotly.Plots.resize(div);
        }
      });
    });
    ro.observe(div);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, []);

  useEffect(() => {
    if (!el.current) return;
    const chrome = dark ? CHROME_DARK : CHROME_LIGHT;
    const traces: Plotly.Data[] = [];
    const tickvals: number[] = [];
    const ticktext: string[] = [];
    const annotations: Partial<Plotly.Annotations>[] = [];
    let x = 0;
    let any = false;

    table.datasets.forEach((ds, g) => {
      const { color, symbol } = seriesStyle(g, dark, scheme);
      const gname = groupName(table, g);
      const nSub = Math.max(1, ds.rows[0]?.length ?? 1);
      const start = x;
      const px: number[] = [];
      const py: number[] = [];
      const ptext: string[] = [];
      const mx: number[] = [];
      const my: number[] = [];
      const mtext: string[] = [];
      for (let s = 0; s < nSub; s++) {
        const sname = subgroupName(table, g, s);
        const values = ds.rows.map((row) => parseCell(row[s] ?? ""))
          .filter((v): v is number => v !== null);
        tickvals.push(x);
        ticktext.push(sname);
        if (values.length) {
          any = true;
          const mean = values.reduce((a, b) => a + b, 0) / values.length;
          mx.push(x);
          my.push(mean);
          mtext.push(`${gname} · ${sname}: mean ${formatSig(mean)} (n = ${values.length})`);
          if (!opts.meansOnly) {
            values.forEach((v, j) => {
              px.push(x + (values.length > 1 ? ((j % 5) - 2) * 0.07 : 0));
              py.push(v);
              ptext.push(`${gname} · ${sname}: ${formatSig(v)}`);
            });
          }
        }
        x += 1;
      }
      const end = x - 1;
      if (!opts.meansOnly && px.length) {
        traces.push({
          type: "scatter", mode: "markers", x: px, y: py, text: ptext,
          hovertemplate: "%{text}<extra></extra>",
          marker: { color, symbol, size: 8, line: { color: chrome.surface, width: 1.2 } },
          showlegend: false, name: gname,
        } as Plotly.Data);
      }
      if (mx.length) {
        traces.push(opts.meansOnly ? {
          type: "scatter", mode: "markers", x: mx, y: my, text: mtext,
          hovertemplate: "%{text}<extra></extra>",
          marker: { color, symbol, size: 10, line: { color: chrome.surface, width: 1.5 } },
          showlegend: false, name: `${gname} subcolumn means`,
        } as Plotly.Data : {
          type: "scatter", mode: "markers", x: mx, y: my, text: mtext,
          hovertemplate: "%{text}<extra></extra>",
          marker: { color, symbol: "line-ew", size: 24, line: { color, width: 2.5 } },
          showlegend: false, name: `${gname} subcolumn means`,
        } as Plotly.Data);
      }
      const center = (start + end) / 2;
      annotations.push({
        text: `<b>${escapeHtml(gname)}</b>`, x: center, xref: "x", y: 0, yref: "paper",
        yanchor: "top", yshift: -30, showarrow: false,
        font: { color: chrome.ink, size: 13, family: PLOT_FONT },
      });
      const gm = means?.find((m) => m.name === gname);
      if (opts.groupCI && gm && typeof gm.mean === "number") {
        const half = 0.5 * (end - start) + 0.38;
        traces.push({
          type: "scatter", mode: "lines",
          x: [center - half, center + half], y: [gm.mean, gm.mean],
          line: { color: chrome.ink, width: 2.5 },
          hoverinfo: "skip", showlegend: false,
        } as Plotly.Data);
        if (Array.isArray(gm.ci)) {
          traces.push({
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
          } as Plotly.Data);
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

    Plotly.react(el.current, traces, {
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
    }, {
      responsive: true, scrollZoom: true, displaylogo: false,
      toImageButtonOptions: { format: "svg", filename: "nested" },
    });
  }, [table, dark, scheme, titles.y, opts.meansOnly, opts.groupCI, means, ciLevel]);

  return (
    <>
      {!graph.frozen && (
        <div className="graph-opts" role="group" aria-label="Graph options">
          <label>
            <input type="checkbox" checked={opts.meansOnly}
              onChange={(e) => setOpts({ meansOnly: e.target.checked })} />
            Plot subcolumn means only
          </label>
          <label title={means ? undefined : "Shown once the analysis has run"}>
            <input type="checkbox" checked={opts.groupCI}
              onChange={(e) => setOpts({ groupCI: e.target.checked })} />
            Group mean and {ciLevel ? levelPct(ciLevel) : "95%"} CI (from the analysis)
          </label>
        </div>
      )}
      <div className="plot" ref={el} />
    </>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
