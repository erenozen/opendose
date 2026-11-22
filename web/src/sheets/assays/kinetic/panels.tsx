// Kinetic plate reads: controls (how the linear part is found, blank,
// conversion, saturation), the results sheet (rate per sample and per well
// with its window, R² and flags; the linked Michaelis-Menten table),
// methods text and the traces graph with each well's fitted stretch.
import { useMemo } from "react";
import type Plotly from "plotly.js-dist-min";
import { tagTrace } from "../../../graph";
import FormattedPlot from "../../../graph/FormattedPlot";
import { useDarkMode } from "../../../graph/useDarkMode";
import { CHROME_DARK, CHROME_LIGHT, PLOT_FONT, seriesStyle } from "../../../lib/palette";
import { formatSig } from "../../../types";
import CopyableMethods from "../../common/CopyableMethods";
import type { ControlsProps, PlotProps, ResultsProps } from "../../types";
import { num } from "../kit/format";
import { Chip, LinkedOutputs, Note, Warnings } from "../kit/ui";
import { useAssay, type SpecsFor } from "../kit/useAssay";
import {
  blankIndexOf, K_METHOD_LABELS, michaelisSettings, rateTable, rateUnit, runKinetic, timeUnit,
  type KineticOptions, type KineticResult, type KMethod,
} from "./model";
import { NumberField } from "../../../components/ui";

/* eslint-disable @typescript-eslint/no-explicit-any */

const specsFor = (tableName: string): SpecsFor<KineticOptions> => (engine, table, o) => {
  const res = runKinetic((p) => engine.analyze(p), table, o);
  const t = rateTable(res, table, o);
  return t ? [{
    key: "mm", name: `Initial rates of ${tableName}`, table: t,
    configure: (prev: unknown) => michaelisSettings(prev),
  }] : [];
};

const DEFAULTS_NOTE = "Defaults, as most plate-reader software reports kinetic rates: the steepest "
  + "slope over 5 consecutive reads (SoftMax Pro “Vmax”, Gen5 “Max V”), which follows the initial "
  + "rate when substrate depletion bends a trace. The R² rule (longest straight stretch from the "
  + "first read, R² ≥ 0.99, at least 3 reads) is offered, but R² stays high on gently curved traces "
  + "and then underestimates the rate. Blank wells are always fitted over every read (drift).";

// ------------------------------------------------------------ controls

export function KineticControls({ sheet, table, options: o, readOnly }: ControlsProps<KineticOptions>) {
  const a = useAssay<KineticOptions>(sheet);
  const set = (patch: Partial<KineticOptions>) => a.save({ ...o, ...patch });
  const tu = timeUnit(table);
  const blank = blankIndexOf(table, o);
  const wells = table.datasets.reduce((n, d) => n + (d.rows[0]?.length ?? 0), 0);
  return (
    <div className="controls assay-controls">
      <section>
        <h3>Kinetic plate reads</h3>
        <p className="hint-block">
          X is the read time; each data set is a sample (name it by its substrate concentration, e.g.
          “50”, for a Michaelis-Menten fit) and each replicate column one well. {table.datasets.length} sample
          {table.datasets.length === 1 ? "" : "s"}, {wells} wells.
        </p>
      </section>
      <section>
        <h3>Initial rate</h3>
        <label className="field">
          <span>Take the rate from</span>
          <select value={o.method} disabled={readOnly} aria-label="Rate method"
            onChange={(e) => set({ method: e.target.value as KMethod })}>
            {(Object.keys(K_METHOD_LABELS) as KMethod[]).map((k) => <option key={k} value={k}>{K_METHOD_LABELS[k]}</option>)}
          </select>
        </label>
        <div className="wizard-row">
          {o.method === "steepest" && (
            <NumberField label="Consecutive reads" fieldClassName="field-num" min={2} step={1} defaultValue={String(o.k)} disabled={readOnly}
                onBlur={(e) => { const v = Number(e.currentTarget.value); if (Number.isInteger(v) && v >= 2) set({ k: v }); }} />
          )}
          {o.method === "auto" && (
            <>
              <NumberField label="R² at least" fieldClassName="field-num" min={0.5} max={1} step={0.001} defaultValue={String(o.minR2)} disabled={readOnly} onBlur={(e) => {
                    const v = Number(e.currentTarget.value); if (v > 0 && v <= 1) set({ minR2: v });
                  }} />
              <NumberField label="Reads at least" fieldClassName="field-num" min={3} step={1} defaultValue={String(o.minPoints)} disabled={readOnly} onBlur={(e) => {
                    const v = Number(e.currentTarget.value); if (Number.isInteger(v) && v >= 3) set({ minPoints: v });
                  }} />
            </>
          )}
          {o.method === "window" && (
            <>
              <label className="field field-num">
                <span>From ({tu})</span>
                <input defaultValue={o.windowStart} disabled={readOnly} inputMode="decimal" aria-label="Window start"
                  placeholder="first read" onBlur={(e) => set({ windowStart: e.target.value.trim() })} />
              </label>
              <label className="field field-num">
                <span>To ({tu})</span>
                <input defaultValue={o.windowEnd} disabled={readOnly} inputMode="decimal" aria-label="Window end"
                  placeholder="last read" onBlur={(e) => set({ windowEnd: e.target.value.trim() })} />
              </label>
            </>
          )}
        </div>
        <p className="hint-block">{DEFAULTS_NOTE}</p>
      </section>
      <section>
        <h3>Blank and units</h3>
        <div className="wizard-row">
          <label className="field">
            <span>Blank (no-enzyme) wells</span>
            <select value={blank >= 0 ? blank : -2} disabled={readOnly} aria-label="Blank data set"
              onChange={(e) => set({ blankIndex: Number(e.target.value) })}>
              <option value={-2}>None</option>
              {table.datasets.map((d, i) => <option key={i} value={i}>{d.name || `Data set ${i + 1}`}</option>)}
            </select>
          </label>
          <label className="field field-num">
            <span>Divide rates by (ε × path)</span>
            <input defaultValue={o.factor} disabled={readOnly} inputMode="decimal" aria-label="Conversion factor"
              placeholder="none" onBlur={(e) => set({ factor: e.target.value.trim() })} />
            <span className="field-note">e.g. 6.22 for NADH at 340 nm (mM⁻¹ cm⁻¹ × 1 cm)</span>
          </label>
          <label className="field">
            <span>Converted unit</span>
            <input defaultValue={o.factorUnit} disabled={readOnly} aria-label="Converted unit"
              placeholder="e.g. mM/min" onBlur={(e) => set({ factorUnit: e.target.value.trim() })} />
          </label>
          <label className="field field-num">
            <span>Flag reads at or above</span>
            <input defaultValue={o.saturation} disabled={readOnly} inputMode="decimal" aria-label="Saturation limit"
              placeholder="none" onBlur={(e) => set({ saturation: e.target.value.trim() })} />
            <span className="field-note">the detector's upper limit</span>
          </label>
        </div>
      </section>
      <section>
        <h3>Michaelis-Menten</h3>
        <label className="field field-num">
          <span>Substrate unit (sample names)</span>
          <input defaultValue={o.substrateUnit} disabled={readOnly} aria-label="Substrate unit"
            onBlur={(e) => set({ substrateUnit: e.target.value.trim() })} />
          <span className="field-note">µM unless you change it; Km is reported in this unit</span>
        </label>
        <LinkedOutputs outputs={a.outputs}
          onMake={readOnly || a.outputs.length ? undefined : () => { void a.commit(o, null, specsFor(a.tableName)); }}
          makeLabel="Make the substrate vs rate table"
          hint="An XY table of initial rate against substrate (samples named by a number), opened with the Michaelis-Menten fit." />
      </section>
    </div>
  );
}

// ------------------------------------------------------------ results

const FLAGS: Record<string, [string, "warn" | "fail"]> = {
  no_linear_phase: ["no stretch with the R² asked", "warn"],
  saturated: ["reaches the saturation limit", "warn"],
  too_few_points_in_window: ["too few reads in the window", "fail"],
  fewer_reads_than_window: ["fewer reads than the stretch", "fail"],
  no_fit: ["no fit", "fail"],
};

const methodText = (r: KineticResult, tu: string) => (r.method === "steepest"
  ? `the steepest slope over ${r.k} consecutive reads`
  : r.method === "auto" ? `the longest stretch from the first read with R² ≥ ${num(r.min_r2)} (at least ${r.min_points} reads)`
    : `the reads from ${r.window?.[0] ?? "the first"} to ${r.window?.[1] ?? "the last"} ${tu}`);

export function KineticResults({ sheet, table, options: o, result: r }: ResultsProps<KineticOptions, KineticResult>) {
  const a = useAssay<KineticOptions>(sheet);
  if (!r) return null;
  if (r.error) {
    return <div className="result-card assay-results"><h3>Kinetic plate reads</h3><div className="results-error">{r.error}</div></div>;
  }
  const tu = timeUnit(table);
  const ru = rateUnit(table, o);
  return (
    <div className="result-card assay-results kinetic-results">
      <h3>Kinetic plate reads</h3>
      <p className="model-line">
        {r.wells.length} wells; rate = {methodText(r, tu)}; blank: {r.blank
          ? `${r.blank} (${num(r.blank_rate)} per ${tu}, every read) subtracted` : "none"}
        {r.factor ? `; divided by ${num(r.factor)}` : ""}; signal {r.direction} with time.
      </p>
      <h4>Initial rate by sample</h4>
      <p className="model-line">Rates in {ru}{r.direction === "decreasing" ? " (the signal falls, so rates are given as their size)" : ""}.</p>
      <div className="results-scroll">
        <table className="results-table">
          <thead><tr><th scope="col">Sample</th><th scope="col">Wells</th><th scope="col">Rate, mean</th>
            <th scope="col">SD</th></tr></thead>
          <tbody>
            {(r.samples ?? []).map((s: any) => (
              <tr key={s.sample}><th scope="row">{s.sample}{s.is_blank ? " (blank)" : ""}</th><td>{s.n_wells}</td>
                <td>{s.is_blank ? "" : <strong>{num(s.velocity_mean)}</strong>}</td>
                <td>{s.is_blank ? "" : num(s.velocity_sd)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <h4>Michaelis-Menten</h4>
      {r.michaelis_menten_ready ? (
        <LinkedOutputs outputs={a.outputs}
          onMake={a.outputs.length || sheet.frozen ? undefined : () => { void a.commit(o, null, specsFor(a.tableName)); }}
          makeLabel="Make the substrate vs rate table"
          hint="Opens with the Michaelis-Menten fit (Vmax and Km with their CIs)." />
      ) : <p className="hint-block">Name three or more samples by their substrate concentration (e.g. “50”) to fit
        Michaelis-Menten kinetics to the rates.</p>}
      <h4>Wells</h4>
      <div className="results-scroll">
        <table className="results-table">
          <thead><tr><th scope="col">Sample</th><th scope="col">Well</th><th scope="col">Slope ({table.yTitle || "signal"}/{tu})</th>
            <th scope="col">SE</th><th scope="col">R²</th><th scope="col">Reads used ({tu})</th>
            <th scope="col">Rate ({ru})</th><th scope="col">Flags</th></tr></thead>
          <tbody>
            {(r.wells ?? []).map((w: any, i: number) => (
              <tr key={i} className={w.flags?.some((f: string) => FLAGS[f]?.[1] === "fail") ? "qc-row-fail" : ""}>
                <td>{w.sample}</td><th scope="row">{w.well}</th><td>{num(w.rate)}</td><td>{num(w.rate_se)}</td>
                <td>{num(w.r_squared, 4)}</td>
                <td>{w.window ? `${formatSig(w.window[0])}–${formatSig(w.window[1])} (${w.n_points})` : ""}</td>
                <td>{w.is_blank ? "blank" : num(w.velocity)}</td>
                <td className="flags">{w.flags?.length
                  ? w.flags.map((f: string) => <Chip key={f} tone={FLAGS[f]?.[1] ?? "warn"}>{FLAGS[f]?.[0] ?? f}</Chip>)
                  : <Chip tone="pass">ok</Chip>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Note>{DEFAULTS_NOTE}</Note>
      <Warnings items={r.warnings} />
    </div>
  );
}

// ------------------------------------------------------------ methods

export function KineticMethods({ table, options: o, result: r }: ResultsProps<KineticOptions, KineticResult>) {
  if (!r || r.error) return null;
  const tu = timeUnit(table);
  const text = `Initial rates were taken from kinetic reads of each well as the least-squares slope of `
    + `${table.yTitle || "signal"} against time over ${methodText(r, tu)}`
    + (r.method === "steepest" ? ` (the plate-reader “Vmax” rate)` : "") + `. `
    + (r.blank ? `The mean slope of the ${r.blank} wells, fitted over every read, was subtracted. ` : "")
    + (r.factor ? `Rates were divided by ${num(r.factor)} (molar absorptivity × path length) to give `
      + `${rateUnit(table, o)}. ` : "")
    + (r.michaelis_menten_ready ? `Michaelis-Menten parameters can be estimated by nonlinear regression of `
      + `the initial rate against substrate concentration. ` : "")
    + `Analysed in OpenDose.`;
  return <CopyableMethods text={text} />;
}

// ------------------------------------------------------------ graph

export function KineticPlot({ table, result, titles, scheme, format, onFormatChange }:
  PlotProps<KineticOptions, KineticResult>) {
  const dark = useDarkMode();
  const fig = useMemo(() => {
    const chrome = dark ? CHROME_DARK : CHROME_LIGHT;
    const traces: Plotly.Data[] = [];
    const wells: any[] = result && !result.error ? result.wells ?? [] : [];
    const seen = new Set<number>();
    for (const w of wells) {
      const st = seriesStyle(w.dataset, dark, scheme);
      const first = !seen.has(w.dataset);
      seen.add(w.dataset);
      traces.push(tagTrace({
        type: "scatter", mode: "markers", name: w.sample, legendgroup: w.sample, showlegend: first,
        x: w.times, y: w.signal, hovertemplate: `${w.sample}, well ${w.well}: %{y} at %{x}<extra></extra>`,
        marker: { color: st.color, symbol: st.symbol, size: 5, opacity: 0.75 },
      }, { ds: w.dataset, role: "points" }) as Plotly.Data);
      if (w.window && w.rate != null && w.intercept != null) {
        const [t0, t1] = w.window;
        traces.push(tagTrace({
          type: "scatter", mode: "lines", name: `${w.sample} fit`, legendgroup: w.sample, showlegend: false,
          x: [t0, t1], y: [w.intercept + w.rate * t0, w.intercept + w.rate * t1], hoverinfo: "skip",
          line: { color: st.color, width: 3 },
        }, { ds: w.dataset, role: "fit" }) as Plotly.Data);
      }
    }
    const layout: Partial<Plotly.Layout> = {
      paper_bgcolor: chrome.surface, plot_bgcolor: chrome.surface,
      font: { family: PLOT_FONT, color: chrome.inkSecondary, size: 13 },
      margin: { l: 64, r: 16, t: 12, b: 56 },
      showlegend: seen.size > 1, legend: { orientation: "h", y: -0.2 },
      xaxis: { title: { text: titles.x }, gridcolor: chrome.grid, zeroline: false, linecolor: chrome.axis,
        tickfont: { color: chrome.muted } },
      yaxis: { title: { text: titles.y }, gridcolor: chrome.grid, zeroline: false, linecolor: chrome.axis,
        tickfont: { color: chrome.muted } },
      annotations: wells.length ? [] : [{ text: result?.error ?? "Enter kinetic reads to draw the traces",
        showarrow: false, x: 0.5, y: 0.5, xref: "paper", yref: "paper", font: { color: chrome.muted, size: 13 } }],
      dragmode: "pan", uirevision: "keep",
    };
    return { traces, layout };
  }, [dark, scheme, result, titles.x, titles.y]);
  const ctx = useMemo(() => ({ dark, scheme, datasets: table.datasets.map((d) => d.name) }),
    [dark, scheme, table.datasets]);
  return (
    <FormattedPlot traces={fig.traces} layout={fig.layout} format={format} onFormatChange={onFormatChange}
      ctx={ctx} filename="kinetic-traces" label="Kinetic traces with the fitted stretches" />
  );
}
