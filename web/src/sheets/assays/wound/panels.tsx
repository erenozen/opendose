// Wound-healing (scratch) assay: controls (rate window, target closure,
// rate basis, control condition, test), the results sheet (rates, time to
// target closure, the comparison, per-well table with flags), methods text
// and the % closure graph (mean ± SD per condition over time).
import { useMemo } from "react";
import type Plotly from "plotly.js-dist-min";
import { tagTrace } from "../../../graph";
import FormattedPlot from "../../../graph/FormattedPlot";
import { useDarkMode } from "../../../graph/useDarkMode";
import { CHROME_DARK, CHROME_LIGHT, PLOT_FONT, seriesStyle } from "../../../lib/palette";
import CopyableMethods from "../../common/CopyableMethods";
import type { ControlsProps, PlotProps, ResultsProps } from "../../types";
import { interval, num, pValue, testSummary } from "../kit/format";
import { Chip, KV, Note, Warnings } from "../kit/ui";
import { areaUnit, timeUnit, type WoundOptions, type WoundResult } from "./model";

/* eslint-disable @typescript-eslint/no-explicit-any */

const UNIT_NOTE = "Each well counts as one replicate. Wells scratched in the same experiment share "
  + "its cells, medium and handling, so they agree more closely than repeated experiments do; to "
  + "test between experiments, repeat the assay and compare the experiment means.";

// ------------------------------------------------------------ controls

export function WoundControls({ table, options: o, onChange, readOnly }: ControlsProps<WoundOptions>) {
  const set = (patch: Partial<WoundOptions>) => onChange({ ...o, ...patch });
  const tu = timeUnit(table);
  const wells = table.datasets.reduce((n, d) => n + (d.rows[0]?.length ?? 0), 0);
  return (
    <div className="controls assay-controls">
      <section>
        <h3>Wound healing (scratch assay)</h3>
        <p className="hint-block">
          X is the time; each data set is a condition and each replicate column one well, holding the
          wound area (or width) from ImageJ. {table.datasets.length} condition
          {table.datasets.length === 1 ? "" : "s"}, {wells} wells.
        </p>
      </section>
      <section>
        <h3>Closure rate</h3>
        <div className="wizard-row">
          <label className="field field-num">
            <span>Fit the rate from ({tu})</span>
            <input defaultValue={o.windowStart} disabled={readOnly} inputMode="decimal" aria-label="Rate window start"
              placeholder="first time" onBlur={(e) => set({ windowStart: e.target.value.trim() })} />
          </label>
          <label className="field field-num">
            <span>to ({tu})</span>
            <input defaultValue={o.windowEnd} disabled={readOnly} inputMode="decimal" aria-label="Rate window end"
              placeholder="last time" onBlur={(e) => set({ windowEnd: e.target.value.trim() })} />
          </label>
          <label className="field field-num">
            <span>Report the time to (% closure)</span>
            <input type="number" min={1} max={100} step={1} defaultValue={o.target} disabled={readOnly}
              aria-label="Target closure" onBlur={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v) && v > 0 && v <= 100) set({ target: v });
              }} />
          </label>
        </div>
        <p className="hint-block">
          The rate is the slope of a straight line through each well's wound size over the window
          (Jonkman et al. 2014). If the wound closes completely or levels off, end the window
          before that so the line follows the linear part.
        </p>
      </section>
      <section>
        <h3>Statistics</h3>
        <div className="wizard-row">
          <label className="field">
            <span>Compare</span>
            <select value={o.rateBasis} disabled={readOnly} aria-label="Rate compared"
              onChange={(e) => set({ rateBasis: e.target.value as WoundOptions["rateBasis"] })}>
              <option value="percent">Rate in % of the initial wound per {tu} (recommended)</option>
              <option value="absolute">Rate in {areaUnit(table)} per {tu}</option>
            </select>
          </label>
          <label className="field">
            <span>Control condition</span>
            <select value={Math.min(o.controlIndex, Math.max(0, table.datasets.length - 1))} disabled={readOnly}
              aria-label="Control condition" onChange={(e) => set({ controlIndex: Number(e.target.value) })}>
              {table.datasets.map((d, i) => <option key={i} value={i}>{d.name || `Data set ${i + 1}`}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Test</span>
            <select value={o.test} disabled={readOnly} aria-label="Wound test"
              onChange={(e) => set({ test: e.target.value as WoundOptions["test"] })}>
              <option value="auto">t test (two conditions) or one-way ANOVA (more)</option>
              <option value="none">No statistics</option>
            </select>
          </label>
          <label className="field">
            <span>Post test (three or more)</span>
            <select value={o.comparisons} disabled={readOnly} aria-label="Post test"
              onChange={(e) => set({ comparisons: e.target.value as WoundOptions["comparisons"] })}>
              <option value="dunnett">Dunnett: each condition vs the control</option>
              <option value="tukey">Tukey: every pair</option>
              <option value="bonferroni">Bonferroni</option>
              <option value="sidak">Šidák</option>
            </select>
          </label>
        </div>
        <p className="hint-block">{UNIT_NOTE}</p>
      </section>
    </div>
  );
}

// ------------------------------------------------------------ results

const FLAGS: Record<string, string> = {
  initial_not_positive: "no initial wound", no_value_at_first_time: "starts late",
  too_few_points_in_window: "no rate (window)",
};

const meanSd = (s: any) => (s?.n ? `${num(s.mean)}${s.sd != null ? ` ± ${num(s.sd)}` : ""}` : "");

export function WoundResults({ table, options: o, result: r }: ResultsProps<WoundOptions, WoundResult>) {
  if (!r) return null;
  if (r.error) {
    return <div className="result-card assay-results"><h3>Wound healing</h3><div className="results-error">{r.error}</div></div>;
  }
  const tu = timeUnit(table);
  const au = areaUnit(table);
  const st = r.statistics;
  const sum = testSummary(st);
  const level = `${Math.round(o.ciLevel * 100)}%`;
  const rateUnit = r.rate_basis === "percent" ? `% per ${tu}` : `${au} per ${tu}`;
  const target = num(r.target);
  const win = r.window ?? [null, null];
  const winText = win[0] == null && win[1] == null ? "every time point"
    : `${win[0] ?? "the first time"} to ${win[1] ?? "the last time"} ${tu}`;
  return (
    <div className="result-card assay-results wound-results">
      <h3>Wound healing (scratch assay)</h3>
      <p className="model-line">
        {r.wells.length} wells in {r.conditions.length} conditions; rate fitted over {winText}; control: {r.control}.
      </p>
      <h4>By condition</h4>
      <div className="results-scroll">
        <table className="results-table">
          <thead><tr><th scope="col">Condition</th><th scope="col">Wells</th>
            <th scope="col">Rate (% per {tu}), mean ± SD</th><th scope="col">Rate ({au} per {tu})</th>
            <th scope="col">Time to {target}% ({tu})</th><th scope="col">Closure at the end (%)</th></tr></thead>
          <tbody>
            {(r.summaries ?? []).map((s: any) => (
              <tr key={s.condition}><th scope="row">{s.condition}</th><td>{s.n_wells}</td>
                <td><strong>{meanSd(s.rate_percent)}</strong></td><td>{meanSd(s.rate)}</td>
                <td>{meanSd(s.time_to_target)}{s.n_target_not_reached
                  ? `${s.time_to_target?.n ? "; " : ""}${s.n_target_not_reached} well${s.n_target_not_reached === 1 ? "" : "s"} not reached`
                  : ""}</td>
                <td>{meanSd(s.final_closure)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      {sum ? (
        <>
          <h4>{sum.name} on the closure rates</h4>
          <p className="model-line">Rates compared in {rateUnit}.</p>
          <KV rows={[
            ...(st.names ? [[`Difference ${st.names[0]} − ${st.names[1]}`, <strong key="d">{num(st.difference)}</strong>] as [string, React.ReactNode]] : []),
            ...(st.ci_difference ? [[`${level} CI of the difference`, interval(st.ci_difference)] as [string, React.ReactNode]] : []),
            ["Statistic", sum.statistic || "n/a"],
            ["P value (two-tailed)", pValue(sum.p)],
          ]} />
          {(st.comparisons ?? []).length > 0 && (
            <div className="results-scroll">
              <table className="results-table">
                <thead><tr><th scope="col">Comparison</th><th scope="col">Difference ({rateUnit})</th>
                  <th scope="col">{level} CI</th><th scope="col">P (adjusted)</th></tr></thead>
                <tbody>
                  {st.comparisons.map((c: any) => (
                    <tr key={c.pair}><th scope="row">{c.pair}</th><td><strong>{num(c.difference)}</strong></td>
                      <td>{interval(c.ci)}</td><td>{pValue(c.p_adjusted)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="hint-block">{st.note}</p>
          <Note>{UNIT_NOTE}</Note>
        </>
      ) : null}
      <h4>Wells</h4>
      <div className="results-scroll">
        <table className="results-table">
          <thead><tr><th scope="col">Condition</th><th scope="col">Well</th><th scope="col">Initial ({au})</th>
            <th scope="col">Rate ({au} per {tu})</th><th scope="col">Rate (% per {tu})</th><th scope="col">R²</th>
            <th scope="col">Time to {target}% ({tu})</th><th scope="col">Closure at the end (%)</th>
            <th scope="col">Flags</th></tr></thead>
          <tbody>
            {(r.wells ?? []).map((w: any, i: number) => (
              <tr key={i} className={w.flags?.length ? "qc-row-fail" : ""}>
                <td>{w.condition}</td><th scope="row">{w.well}</th><td>{num(w.initial)}</td>
                <td>{num(w.rate)}</td><td>{num(w.rate_percent)}</td><td>{num(w.rate_r_squared, 3)}</td>
                <td>{w.target_reached ? num(w.time_to_target) : "not reached"}</td><td>{num(w.final_closure)}</td>
                <td className="flags">{w.flags?.length
                  ? w.flags.map((f: string) => <Chip key={f} tone="warn">{FLAGS[f] ?? f}</Chip>)
                  : <Chip tone="pass">ok</Chip>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Warnings items={r.warnings} />
    </div>
  );
}

// ------------------------------------------------------------ methods

export function WoundMethods({ table, options: o, result: r }: ResultsProps<WoundOptions, WoundResult>) {
  if (!r || r.error) return null;
  const tu = timeUnit(table);
  const name = testSummary(r.statistics)?.name;
  const post = { dunnett: "Dunnett's", tukey: "Tukey's", bonferroni: "Bonferroni's", sidak: "Šidák's" }[o.comparisons];
  const win = r.window ?? [null, null];
  const text = `Wound area was measured at each time point and expressed as percent closure relative to the `
    + `same wound at the first time point, (A0 − At) / A0 × 100. The closure rate of each well was the `
    + `least-squares slope of wound area against time `
    + (win[0] == null && win[1] == null ? "over all time points" : `from ${win[0] ?? "the first time"} to ${win[1] ?? "the last time"} ${tu}`)
    + `, reported in area and in percent of the initial wound per ${tu}; the time to ${num(r.target)}% `
    + `closure was interpolated linearly between time points. `
    + (name ? `Rates (${r.rate_basis === "percent" ? `% per ${tu}` : `area per ${tu}`}) were compared with `
      + `${name === "One-way ANOVA" ? "an ordinary one-way ANOVA" : `an ${name.toLowerCase()}`}`
      + (r.statistics?.comparisons?.length ? ` followed by ${post} multiple comparisons against ${r.control}` : "")
      + `, with wells as the unit (n = ${r.wells.length} wells). ` : "")
    + `Analysed in OpenDose.`;
  return <CopyableMethods text={text} />;
}

// ------------------------------------------------------------ graph

export function WoundPlot({ table, result, titles, scheme, format, onFormatChange }:
  PlotProps<WoundOptions, WoundResult>) {
  const dark = useDarkMode();
  const fig = useMemo(() => {
    const chrome = dark ? CHROME_DARK : CHROME_LIGHT;
    const traces: Plotly.Data[] = [];
    const sums: any[] = result && !result.error ? result.summaries ?? [] : [];
    sums.forEach((s, i) => {
      const st = seriesStyle(i, dark, scheme);
      const pts = (s.curve ?? []).filter((c: any) => c.mean != null);
      traces.push(tagTrace({
        type: "scatter", mode: "lines+markers", name: s.condition,
        x: pts.map((c: any) => c.time), y: pts.map((c: any) => c.mean),
        text: pts.map((c: any) => `${s.condition}, ${c.time}: ${Number(c.mean.toPrecision(4))}%`
          + (c.sd != null ? ` ± ${Number(c.sd.toPrecision(3))} (n = ${c.n})` : "")),
        hovertemplate: "%{text}<extra></extra>",
        line: { color: st.color, width: 2, dash: st.dash },
        marker: { color: st.color, symbol: st.symbol, size: 8, line: { color: chrome.surface, width: 1 } },
        error_y: pts.some((c: any) => c.sd != null) ? {
          type: "data", array: pts.map((c: any) => c.sd ?? 0), color: st.color, thickness: 1.5, width: 4, visible: true,
        } : undefined,
      }, { ds: i, role: "points" }) as Plotly.Data);
    });
    const layout: Partial<Plotly.Layout> = {
      paper_bgcolor: chrome.surface, plot_bgcolor: chrome.surface,
      font: { family: PLOT_FONT, color: chrome.inkSecondary, size: 13 },
      margin: { l: 64, r: 16, t: 12, b: 56 },
      showlegend: sums.length > 1, legend: { orientation: "h", y: -0.2 },
      xaxis: { title: { text: titles.x }, gridcolor: chrome.grid, zeroline: false, linecolor: chrome.axis,
        tickfont: { color: chrome.muted } },
      yaxis: { title: { text: titles.y }, gridcolor: chrome.grid, zeroline: true, zerolinecolor: chrome.axis,
        linecolor: chrome.axis, tickfont: { color: chrome.muted } },
      annotations: sums.length ? [] : [{ text: result?.error ?? "Enter wound areas to draw closure over time",
        showarrow: false, x: 0.5, y: 0.5, xref: "paper", yref: "paper", font: { color: chrome.muted, size: 13 } }],
      dragmode: "pan", uirevision: "keep",
    };
    return { traces, layout };
  }, [dark, scheme, result, titles.x, titles.y]);
  const ctx = useMemo(() => ({ dark, scheme, datasets: table.datasets.map((d) => d.name) }),
    [dark, scheme, table.datasets]);
  return (
    <FormattedPlot traces={fig.traces} layout={fig.layout} format={format} onFormatChange={onFormatChange}
      ctx={ctx} filename="wound-closure" label="Wound closure over time" />
  );
}
