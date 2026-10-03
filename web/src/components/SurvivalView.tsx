import { useEffect, useRef, useState } from "react";
import Plotly from "plotly.js-dist-min";
import { formatSig } from "../types";
import {
  CHROME_DARK, CHROME_LIGHT, DEFAULT_SCHEME, isDarkMode, onThemeChange,
  seriesStyle, PLOT_FONT, type SchemeId,
} from "../lib/palette";
import {
  applyFormat, EMPTY_FORMAT, plotConfig, resultBlocks, riskSetsFromResult, tagTrace,
  usePlotEdits, type GraphFormat, type RiskSet,
} from "../graph";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface PlotProps {
  result: Record<string, any> | null;
  scheme?: SchemeId;
  xTitle?: string;
  yTitle?: string;
  /** Format Graph / Format Axes settings (graph/README.md). */
  format?: GraphFormat;
  onFormatChange?: (f: GraphFormat) => void;
  /** Follow-up times per group, for the number-at-risk table (computed
   *  from the result's curves when absent). */
  riskSets?: RiskSet[];
}

function fmtP(p: any): string {
  if (typeof p !== "number") return "n/a";
  return p < 0.0001 ? "< 0.0001" : formatSig(p, 4);
}

/** Kaplan-Meier curves (the graph). */
export function SurvivalPlot({
  result, scheme = DEFAULT_SCHEME,
  xTitle = "Time", yTitle = "Percent survival", format = EMPTY_FORMAT,
  onFormatChange, riskSets,
}: PlotProps) {
  const el = useRef<HTMLDivElement>(null);
  const [dark, setDark] = useState(isDarkMode());
  const { rev, attach } = usePlotEdits(format, onFormatChange);

  useEffect(() => onThemeChange(() => setDark(isDarkMode())), []);

  // Redraw when the island or column is resized (splitter drag, the
  // card's resize handle); Plotly's own listener only covers the window.
  useEffect(() => {
    const div = el.current;
    if (!div) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        // Not while hidden (a Suspense fallback shows): Plotly refuses.
        if ((div as unknown as { _fullLayout?: unknown })._fullLayout
          && div.getClientRects().length) {
          Plotly.Plots.resize(div);
        }
      });
    });
    ro.observe(div);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, []);

  useEffect(() => {
    if (!el.current || !result || result.error || !result.curves) return;
    const chrome = dark ? CHROME_DARK : CHROME_LIGHT;
    const traces: Plotly.Data[] = [];
    Object.entries(result.curves).forEach(([name, curve]: [string, any], i) => {
      const { color, dash } = seriesStyle(i, dark, scheme);
      const xs = curve.points.map((p: any) => p.time);
      const ys = curve.points.map((p: any) => p.survival * 100);
      traces.push(tagTrace({
        x: xs, y: ys,
        mode: "lines",
        line: { color, width: 2, shape: "hv", dash },
        name,
        hovertemplate: `${name}<br>t=%{x}: %{y:.1f}%<extra></extra>`,
      }, { ds: i, role: "line" }) as Plotly.Data);
    });
    const layout: Partial<Plotly.Layout> = {
      paper_bgcolor: chrome.surface,
      plot_bgcolor: chrome.surface,
      font: {
        family: PLOT_FONT,
        color: chrome.inkSecondary, size: 13,
      },
      margin: { l: 60, r: 16, t: 8, b: 48 },
      xaxis: {
        title: { text: xTitle, font: { color: chrome.inkSecondary } },
        gridcolor: chrome.grid, zeroline: false,
        linecolor: chrome.axis, tickfont: { color: chrome.muted },
      },
      yaxis: {
        title: { text: yTitle, font: { color: chrome.inkSecondary } },
        range: [0, 105], gridcolor: chrome.grid, zeroline: false,
        linecolor: chrome.axis, tickfont: { color: chrome.muted },
      },
      legend: { orientation: "h", y: 1.02, yanchor: "bottom", x: 0,
                font: { color: chrome.ink } },
      dragmode: "pan",
      uirevision: "keep",
    };
    const out = applyFormat(traces as never, layout, format, {
      dark, scheme, datasets: Object.keys(result.curves),
      riskSets: riskSets ?? riskSetsFromResult(result),
      results: resultBlocks(result), editRevision: rev,
    });
    const div = el.current;
    Plotly.react(div, out.traces as Plotly.Data[], out.layout, plotConfig(
      { responsive: true, scrollZoom: true, displaylogo: false,
        toImageButtonOptions: { format: "svg", filename: "survival" } },
      format, !!onFormatChange)).then(() => attach(div));
  }, [result, dark, scheme, xTitle, yTitle, format, rev, riskSets, onFormatChange, attach]);

  return <div className="plot" ref={el} />;
}

/** Kaplan-Meier table and curve comparison tests (the results sheet). */
export function SurvivalResults({ result }: { result: Record<string, any> | null }) {
  if (!result) return null;
  if (result.error) {
    return <div className="results-error">
      Survival analysis failed: {String(result.error)}. Each dataset needs
      two subcolumns: time (Y1) and event code (Y2: 1 = event, 0 = censored).
    </div>;
  }

  return (
    <div className="result-card">
        <h3>Kaplan-Meier survival analysis</h3>
        <table className="results-table">
          <thead>
            <tr><th>Group</th><th>n</th><th>Events</th><th>Censored</th>
              <th>Median survival</th></tr>
          </thead>
          <tbody>
            {Object.entries(result.curves ?? {}).map(([name, c]: [string, any]) => (
              <tr key={name}>
                <th>{name}</th>
                <td>{c.n}</td>
                <td>{c.n_events}</td>
                <td>{c.n_censored}</td>
                <td>{c.median_survival != null
                  ? formatSig(c.median_survival) : "not reached"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {result.logrank && (
          <table className="results-table goodness">
            <tbody>
              <tr>
                <th>Log-rank (Mantel-Cox)</th>
                <td>χ² = {formatSig(result.logrank.chi2)},
                  df {result.logrank.df}, P = {fmtP(result.logrank.p)}</td>
              </tr>
              <tr>
                <th>Gehan-Breslow-Wilcoxon</th>
                <td>χ² = {formatSig(result.gehan_breslow_wilcoxon.chi2)},
                  P = {fmtP(result.gehan_breslow_wilcoxon.p)}</td>
              </tr>
              {result.hazard_ratio && (
                <tr>
                  <th>Hazard ratio (Mantel-Haenszel)</th>
                  <td>{formatSig(result.hazard_ratio.value)}
                    {" "}(95% CI {formatSig(result.hazard_ratio.ci[0])} to{" "}
                    {formatSig(result.hazard_ratio.ci[1])})</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
    </div>
  );
}
