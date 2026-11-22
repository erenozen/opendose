// Results of the frequency distribution analysis (engine
// frequency_distribution): a histogram (bars; step lines when cumulative)
// with the fitted Gaussian or cumulative Gaussian drawn over it, the
// frequency table and the fit's parameters.
import { useEffect, useMemo, useRef } from "react";
import type Plotly from "plotly.js-dist-min";
import { loadPlotly, plotlyNow } from "../../lib/plotly";
import { useDarkMode } from "../../graph/useDarkMode";
import { CHROME_DARK, CHROME_LIGHT, PLOT_FONT, seriesStyle } from "../../lib/palette";
import { formatSig } from "../../types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

/** Standard normal CDF (Abramowitz & Stegun 7.1.26, |error| < 1.5e-7): for drawing the fitted curve. */
function phi(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const e = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592)
    * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + e) : 0.5 * (1 - e);
}

function Chart({ traces, layout }: { traces: Plotly.Data[]; layout: Partial<Plotly.Layout> }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const div = el.current;
    if (!div) return;
    void loadPlotly().then((P) => P.react(div, traces, layout,
      { responsive: true, displaylogo: false, displayModeBar: false }));
  }, [traces, layout]);
  useEffect(() => {
    const div = el.current;
    return () => { if (div) plotlyNow()?.purge(div); };
  }, []);
  return <div className="freq-plot" ref={el} role="img" aria-label="Frequency distribution" />;
}

const v = (x: unknown, sig?: number) => (typeof x === "number" && Number.isFinite(x) ? formatSig(x, sig) : "n/a");

export function FrequencyResults({ result }: { result: R }) {
  const dark = useDarkMode();
  const sets = useMemo(() => (result.datasets ?? []) as R[], [result]);
  const fits = useMemo(() => (result.fits ?? []) as R[], [result]);
  const withCi = fits[0]?.model === "gaussian";
  const yLabel = result.relative === "percent" ? "Percent" : result.relative === "fraction" ? "Fraction" : "Count";
  const fig = useMemo(() => {
    const chrome = dark ? CHROME_DARK : CHROME_LIGHT;
    const traces: Plotly.Data[] = [];
    const xs: number[] = [];
    sets.forEach((s, i) => {
      const { color } = seriesStyle(i, dark);
      if (result.exact) {
        const y = result.relative === "fraction" ? s.cumulative_percent.map((p: number) => p / 100)
          : result.relative === "percent" ? s.cumulative_percent : s.cumulative;
        traces.push({ type: "scatter", mode: "lines", x: s.x, y, name: s.name, line: { color, shape: "hv", width: 2 } });
        xs.push(...s.x);
      } else if (result.cumulative) {
        traces.push({ type: "scatter", mode: "lines+markers", x: result.upper_edges, y: s.y, name: s.name,
          line: { color, shape: "hv", width: 2 } });
        xs.push(...result.lower_edges, ...result.upper_edges);
      } else {
        traces.push({ type: "bar", x: result.centers, y: s.y, name: s.name,
          marker: { color, opacity: sets.length > 1 ? 0.65 : 0.85 }, width: result.bin_width * (sets.length > 1 ? 0.9 : 1) });
        xs.push(...result.lower_edges, ...result.upper_edges);
      }
      const f = fits[i];
      if (f?.params && xs.length) {
        const lo = Math.min(...xs), hi = Math.max(...xs);
        const grid = Array.from({ length: 200 }, (_, k) => lo + (hi - lo) * k / 199);
        const m = f.params.Mean?.value, sd = f.params.SD?.value;
        const y = f.model === "gaussian"
          ? grid.map((x) => f.params.Amplitude.value * Math.exp(-0.5 * ((x - m) / sd) ** 2))
          : grid.map((x) => {
            const pct = 100 * phi((x - m) / sd);
            return result.relative === "fraction" ? pct / 100 : result.relative === "percent" ? pct : pct * s.n / 100;
          });
        traces.push({ type: "scatter", mode: "lines", x: grid, y, name: `${s.name}: fit`,
          line: { color, dash: "dash", width: 2 } });
      }
    });
    const axis = (title: string): Partial<Plotly.LayoutAxis> => ({
      title: { text: title, font: { color: chrome.inkSecondary } }, color: chrome.muted,
      gridcolor: chrome.grid, zeroline: false,
    });
    const layout: Partial<Plotly.Layout> = {
      height: 300, margin: { l: 56, r: 16, t: 10, b: 46 }, barmode: "overlay",
      paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
      font: { family: PLOT_FONT, color: chrome.ink, size: 12 },
      xaxis: axis(result.exact ? "Value" : "Bin center"),
      yaxis: axis(result.cumulative ? `Cumulative ${yLabel.toLowerCase()}` : yLabel),
      showlegend: sets.length > 1 || fits.length > 0,
      legend: { orientation: "h", y: 1.12, font: { color: chrome.ink } },
    };
    return { traces, layout };
  }, [result, sets, fits, dark, yLabel]);

  return (
    <div className="result-card">
      <h3>Frequency distribution</h3>
      {(result.warnings ?? []).map((w: string, i: number) => <p key={i} className="result-note">{w}</p>)}
      <p className="model-line">
        {result.exact ? "Exact cumulative distribution: every value plotted, no bins."
          : `Bin width ${v(result.bin_width)}${result.bin_width_auto
            ? " (automatic: 1 + log₂(n) bins over each data set's range, rounded down to a round number)" : ""}; `
            + "a value on a border goes into the higher bin."}
        {" "}{sets.map((s) => `${s.name}: ${result.exact ? s.n : s.n_binned} values`
          + `${s.n_omitted_below ? `, ${s.n_omitted_below} below the first bin left out` : ""}`
          + `${s.n_omitted_above ? `, ${s.n_omitted_above} above the upper limit left out` : ""}`).join("; ")}.
      </p>
      <Chart traces={fig.traces} layout={fig.layout} />
      {fits.length > 0 && (
        <>
          <h4>{fits[0]?.model === "gaussian" ? "Gaussian fit" : "Cumulative Gaussian fit"}</h4>
          <table className="results-table">
            <thead><tr><th>Data set</th><th>Mean</th>{withCi && <th>95% CI</th>}<th>SD</th>{withCi && <th>95% CI</th>}
              {withCi && <><th>Amplitude</th><th>Area</th></>}<th>R²</th></tr></thead>
            <tbody>
              {fits.map((f, i) => (f?.error
                ? <tr key={i}><td>{sets[i]?.name}</td><td colSpan={7}>{String(f.error)}</td></tr>
                : (
                  <tr key={i}>
                    <td>{sets[i]?.name}</td>
                    <td>{v(f.params.Mean?.value)}</td>
                    {withCi && <td>{f.params.Mean?.ci95 ? `${v(f.params.Mean.ci95[0])} to ${v(f.params.Mean.ci95[1])}` : "n/a"}</td>}
                    <td>{v(f.params.SD?.value)}</td>
                    {withCi && <td>{f.params.SD?.ci95 ? `${v(f.params.SD.ci95[0])} to ${v(f.params.SD.ci95[1])}` : "n/a"}</td>}
                    {f.model === "gaussian" && <><td>{v(f.params.Amplitude?.value)}</td><td>{v(f.params.Area?.value)}</td></>}
                    <td>{v(f.goodness?.r_squared, 4)}</td>
                  </tr>
                )))}
            </tbody>
          </table>
          <p className="model-line">
            {fits[0]?.model === "gaussian"
              ? "Least-squares fit of Amplitude × exp(−½((X − Mean)/SD)²) to the bin counts at the bin centers. It depends on the bin width; the cumulative fit does not."
              : "Least-squares fit of the cumulative Gaussian (percent) to the exact cumulative distribution. Neither fit is a normality test; for a confidence interval of the mean, use descriptive statistics on the values."}
          </p>
        </>
      )}
      <h4>{result.exact ? "Cumulative values" : "Frequency table"}</h4>
      <table className="results-table">
        {result.exact ? (
          <>
            <thead><tr><th>Data set</th><th>Value</th><th>Cumulative count</th><th>Cumulative %</th></tr></thead>
            <tbody>
              {sets.flatMap((s) => (s.x as number[]).map((x, k) => (
                <tr key={`${s.name}-${k}`}><td>{s.name}</td><td>{v(x)}</td><td>{s.cumulative[k]}</td>
                  <td>{v(s.cumulative_percent[k], 4)}</td></tr>
              )))}
            </tbody>
          </>
        ) : (
          <>
            <thead><tr><th>Bin center</th><th>Bin (from, to)</th>
              {sets.map((s) => <th key={s.name}>{s.name}{result.cumulative ? " (cumulative)" : ""}{result.relative ? ` (${result.relative})` : ""}</th>)}
            </tr></thead>
            <tbody>
              {(result.centers as number[]).map((c, k) => (
                <tr key={k}><td>{v(c)}</td><td>{v(result.lower_edges[k])} to {v(result.upper_edges[k])}</td>
                  {sets.map((s) => <td key={s.name}>{result.relative ? v(s.y[k], 4) : s.y[k]}</td>)}</tr>
              ))}
            </tbody>
          </>
        )}
      </table>
    </div>
  );
}
