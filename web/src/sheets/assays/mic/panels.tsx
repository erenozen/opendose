// MIC (broth microdilution): controls (blank, growth cut-off, IC50 fit),
// the results sheet (MIC per strain and per series with flags, MIC50 /
// MIC90, IC50), methods text and the % growth graph (mean ± SD per strain
// on a log2 concentration axis, the fitted curve and the MIC marked).
import { useMemo } from "react";
import type Plotly from "plotly.js-dist-min";
import { tagTrace } from "../../../graph";
import FormattedPlot from "../../../graph/FormattedPlot";
import { useDarkMode } from "../../../graph/useDarkMode";
import { CHROME_DARK, CHROME_LIGHT, PLOT_FONT, seriesStyle } from "../../../lib/palette";
import { formatSig } from "../../../types";
import CopyableMethods from "../../common/CopyableMethods";
import type { ControlsProps, PlotProps, ResultsProps } from "../../types";
import { interval, num } from "../kit/format";
import { Chip, KV, Note, Warnings } from "../kit/ui";
import { concUnit, type MicOptions, type MicResult } from "./model";
import { NumberField } from "../../../components/ui";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ------------------------------------------------------------ controls

export function MicControls({ table, options: o, onChange, readOnly }: ControlsProps<MicOptions>) {
  const set = (patch: Partial<MicOptions>) => onChange({ ...o, ...patch });
  const series = table.datasets.reduce((n, d) => n + (d.rows[0]?.length ?? 0), 0);
  return (
    <div className="controls assay-controls">
      <section>
        <h3>MIC (broth microdilution)</h3>
        <p className="hint-block">
          X is the drug concentration, with 0 for the growth control; each data set is a strain and each
          replicate column one dilution series, holding the endpoint OD. {table.datasets.length} strain
          {table.datasets.length === 1 ? "" : "s"}, {series} series.
        </p>
      </section>
      <section>
        <h3>Reading growth</h3>
        <div className="wizard-row">
          <label className="field field-num">
            <span>Blank (medium only) OD</span>
            <input defaultValue={o.blank} disabled={readOnly} inputMode="decimal" aria-label="Blank OD"
              placeholder="none" onBlur={(e) => set({ blank: e.target.value.trim() })} />
            <span className="field-note">subtracted from every well</span>
          </label>
          <label className="field">
            <span>No growth when</span>
            <select value={o.thresholdMode} disabled={readOnly} aria-label="No-growth rule"
              onChange={(e) => set({ thresholdMode: e.target.value as MicOptions["thresholdMode"] })}>
              <option value="percent">Growth is at most a % of the growth control</option>
              <option value="od">The blank-corrected OD is at most a cut-off</option>
            </select>
          </label>
          {o.thresholdMode === "percent" ? (
            <NumberField label="Growth at most (% of control)" description="10 = at least 90% inhibition; 20 = 80%; 50 = 50%" fieldClassName="field-num" min={0} max={99} step={1} defaultValue={String(o.threshold)} disabled={readOnly} onBlur={(e) => {
                  const v = Number(e.currentTarget.value);
                  if (Number.isFinite(v) && v >= 0 && v < 100) set({ threshold: v });
                }} />
          ) : (
            <label className="field field-num">
              <span>OD cut-off</span>
              <input defaultValue={o.odCutoff} disabled={readOnly} inputMode="decimal" aria-label="OD cut-off"
                onBlur={(e) => set({ odCutoff: e.target.value.trim() })} />
            </label>
          )}
        </div>
        <label className="check-row">
          <input type="checkbox" checked={o.fitIc50} disabled={readOnly}
            onChange={(e) => set({ fitIc50: e.target.checked })} /> Fit a dose-response curve for the IC50
        </label>
        <p className="hint-block">
          The MIC of a series is the lowest concentration from which every higher well shows no growth.
          One skipped well (clear below a well with growth) is read at the higher MIC; a series with
          more than one is not read; a growth control that did not grow invalidates its series (CLSI M07).
        </p>
      </section>
    </div>
  );
}

// ------------------------------------------------------------ results

const FLAGS: Record<string, [string, "warn" | "fail" | "info"]> = {
  skipped_well: ["one skipped well", "warn"],
  multiple_skipped_wells: ["skipped wells: not read", "fail"],
  growth_control_did_not_grow: ["growth control did not grow", "fail"],
  no_growth_control: ["no growth control", "fail"],
  growth_control_from_strain_mean: ["growth control: strain mean", "info"],
};

export function MicResults({ table, options: o, result: r }: ResultsProps<MicOptions, MicResult>) {
  if (!r) return null;
  if (r.error) {
    return <div className="result-card assay-results"><h3>MIC</h3><div className="results-error">{r.error}</div></div>;
  }
  const u = concUnit(table);
  const unit = u ? ` ${u}` : "";
  const level = `${Math.round(o.ciLevel * 100)}%`;
  const rule = r.threshold_mode === "od" ? `blank-corrected OD at most ${num(r.od_cutoff)}`
    : `growth at most ${num(r.threshold)}% of the growth control (at least ${num(100 - r.threshold)}% inhibition)`;
  const cum = r.cumulative;
  return (
    <div className="result-card assay-results mic-results">
      <h3>MIC (broth microdilution)</h3>
      <p className="model-line">
        {r.strains.length} strain{r.strains.length === 1 ? "" : "s"}, {r.series.length} dilution series; no growth
        = {rule}; blank {r.blank ? num(r.blank) : "none"}.
      </p>
      <h4>MIC by strain</h4>
      <div className="results-scroll">
        <table className="results-table">
          <thead><tr><th scope="col">Strain</th><th scope="col">MIC{unit && ` (${u})`}</th>
            <th scope="col">Replicate MICs</th><th scope="col">Within one dilution</th>
            {o.fitIc50 && <><th scope="col">IC50{unit && ` (${u})`}</th><th scope="col">{level} CI</th></>}</tr></thead>
          <tbody>
            {r.strains.map((s: any) => (
              <tr key={s.strain}><th scope="row">{s.strain}</th>
                <td><strong>{s.mic_label ?? "not read"}</strong></td>
                <td>{s.replicate_mics.map((m: string | null) => m ?? "–").join(", ")}</td>
                <td>{s.within_one_dilution ? "yes" : <Chip tone="warn">no</Chip>}</td>
                {o.fitIc50 && <><td>{s.ic50?.value != null
                  ? `${num(s.ic50.value)}${s.ic50.outside_range ? " (outside the range tested)" : ""}`
                  : s.ic50?.reason ?? ""}</td><td>{interval(s.ic50?.ci)}</td></>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cum && (
        <>
          <h4>Across strains</h4>
          <KV rows={[
            [`MIC50${unit && ` (${u})`}`, <strong key="50">{cum.mic50_label}</strong>],
            [`MIC90${unit && ` (${u})`}`, <strong key="90">{cum.mic90_label}</strong>],
            ["Range", `${cum.range[0]} to ${cum.range[1]}`],
            ["Strains", String(cum.n_strains)],
          ]} />
          <p className="hint-block">MIC50 and MIC90: the MICs that inhibit 50% and 90% of the strains, read from the
            ranked strain MICs at ranks ⌈0.5 n⌉ and ⌈0.9 n⌉ (CLSI M39).</p>
        </>
      )}
      <h4>Dilution series</h4>
      <div className="results-scroll">
        <table className="results-table">
          <thead><tr><th scope="col">Strain</th><th scope="col">Series</th><th scope="col">Growth control OD</th>
            <th scope="col">MIC</th><th scope="col">Flags</th></tr></thead>
          <tbody>
            {r.series.map((s: any, i: number) => (
              <tr key={i} className={s.valid ? "" : "qc-row-fail"}>
                <td>{s.strain}</td><th scope="row">{s.series}</th><td>{num(s.growth_control)}</td>
                <td>{s.mic_label ?? "not read"}</td>
                <td className="flags">{s.flags.length
                  ? s.flags.map((f: string) => <Chip key={f} tone={FLAGS[f]?.[1] ?? "warn"}>{FLAGS[f]?.[0] ?? f}</Chip>)
                  : <Chip tone="pass">ok</Chip>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Note>The MIC is read on the two-fold dilution scale, so one dilution apart is the expected
        reproducibility (CLSI essential agreement). The IC50 is a continuous measure from a
        four-parameter logistic fit of % growth against log concentration; it is not the MIC.</Note>
      <Warnings items={r.warnings} />
    </div>
  );
}

// ------------------------------------------------------------ methods

export function MicMethods({ table, options: o, result: r }: ResultsProps<MicOptions, MicResult>) {
  if (!r || r.error) return null;
  const u = concUnit(table);
  const rule = r.threshold_mode === "od" ? `a blank-corrected OD of at most ${num(r.od_cutoff)}`
    : `growth of at most ${num(r.threshold)}% of the growth control (≥ ${num(100 - r.threshold)}% inhibition)`;
  const text = `Minimum inhibitory concentrations were determined by broth microdilution in two-fold `
    + `dilution series and read by optical density. ${r.blank ? `The medium blank (OD ${num(r.blank)}) was subtracted and g` : "G"}`
    + `rowth was expressed as a percentage of the growth control of the same series; no growth was `
    + `defined as ${rule}. The MIC of each series was the lowest concentration from which all higher `
    + `concentrations showed no growth; a single skipped well was read at the higher MIC and series with `
    + `more than one skipped well or without growth in the growth control were not read (CLSI M07). The MIC `
    + `of each strain was the modal replicate MIC (ties resolved upward)`
    + (r.cumulative ? `, and MIC50 and MIC90 were read from the ranked strain MICs (CLSI M39; `
      + `n = ${r.cumulative.n_strains} strains)` : "")
    + `. ` + (o.fitIc50 ? `IC50 values${u ? ` (${u})` : ""} were estimated by fitting a four-parameter logistic `
      + `model to % growth against log10 concentration, with ${Math.round(o.ciLevel * 100)}% confidence intervals. ` : "")
    + `Analysed in OpenDose.`;
  return <CopyableMethods text={text} />;
}

// ------------------------------------------------------------ graph

export function MicPlot({ table, result, titles, scheme, format, onFormatChange }:
  PlotProps<MicOptions, MicResult>) {
  const dark = useDarkMode();
  const fig = useMemo(() => {
    const chrome = dark ? CHROME_DARK : CHROME_LIGHT;
    const traces: Plotly.Data[] = [];
    const strains: any[] = result && !result.error ? result.strains ?? [] : [];
    const concs = new Set<number>();
    strains.forEach((s, i) => {
      const st = seriesStyle(i, dark, scheme);
      const pts = (s.curve ?? []).filter((c: any) => c.mean != null);
      pts.forEach((c: any) => concs.add(c.concentration));
      if (s.ic50?.curve) {
        traces.push(tagTrace({
          type: "scatter", mode: "lines", name: `${s.strain} fit`, showlegend: false, hoverinfo: "skip",
          x: s.ic50.curve.concentration, y: s.ic50.curve.growth,
          line: { color: st.color, width: 2, dash: st.dash },
        }, { ds: i, role: "fit" }) as Plotly.Data);
      }
      traces.push(tagTrace({
        type: "scatter", mode: s.ic50?.curve ? "markers" : "lines+markers", name: s.strain,
        x: pts.map((c: any) => c.concentration), y: pts.map((c: any) => c.mean),
        text: pts.map((c: any) => `${s.strain}, ${formatSig(c.concentration)}: ${formatSig(c.mean, 3)}% growth`
          + (c.sd != null ? ` ± ${formatSig(c.sd, 3)} (n = ${c.n})` : "")),
        hovertemplate: "%{text}<extra></extra>",
        line: { color: st.color, width: 1.5 },
        marker: { color: st.color, symbol: st.symbol, size: 8, line: { color: chrome.surface, width: 1 } },
        error_y: pts.some((c: any) => c.sd != null) ? {
          type: "data", array: pts.map((c: any) => c.sd ?? 0), color: st.color, thickness: 1.5, width: 4, visible: true,
        } : undefined,
      }, { ds: i, role: "points" }) as Plotly.Data);
      if (s.mic && s.mic.qualifier === "=") {
        traces.push(tagTrace({
          type: "scatter", mode: "markers", name: `${s.strain} MIC`, showlegend: false,
          x: [s.mic.value], y: [-8], text: [`${s.strain}: MIC ${s.mic_label}`],
          hovertemplate: "%{text}<extra></extra>",
          marker: { color: st.color, symbol: "triangle-up", size: 11, line: { color: chrome.surface, width: 1 } },
        }, { ds: i, role: "decor" }) as Plotly.Data);
      }
    });
    const ticks = [...concs].sort((a, b) => a - b);
    const cut = result && !result.error && result.threshold_mode === "percent" ? result.threshold : null;
    const shapes: Partial<Plotly.Shape>[] = cut != null ? [{
      type: "line", xref: "paper", x0: 0, x1: 1, yref: "y", y0: cut, y1: cut,
      line: { color: chrome.muted, width: 1, dash: "dash" },
    }] : [];
    const layout: Partial<Plotly.Layout> = {
      paper_bgcolor: chrome.surface, plot_bgcolor: chrome.surface,
      font: { family: PLOT_FONT, color: chrome.inkSecondary, size: 13 },
      margin: { l: 64, r: 16, t: 12, b: 56 },
      showlegend: strains.length > 1, legend: { orientation: "h", y: -0.22 },
      xaxis: { type: "log", title: { text: titles.x }, tickvals: ticks, ticktext: ticks.map((v) => formatSig(v, 3)),
        gridcolor: chrome.grid, zeroline: false, linecolor: chrome.axis, tickfont: { color: chrome.muted } },
      yaxis: { title: { text: titles.y }, range: [-14, 115], gridcolor: chrome.grid, zeroline: true,
        zerolinecolor: chrome.axis, linecolor: chrome.axis, tickfont: { color: chrome.muted } },
      shapes,
      annotations: strains.length ? (cut != null ? [{ text: "no-growth cut-off", x: 1, xref: "paper", xanchor: "right",
        y: cut, yref: "y", yanchor: "bottom", showarrow: false, font: { size: 11, color: chrome.muted } }] : [])
        : [{ text: result?.error ?? "Enter ODs to draw growth against concentration", showarrow: false, x: 0.5, y: 0.5,
          xref: "paper", yref: "paper", font: { color: chrome.muted, size: 13 } }],
      dragmode: "pan", uirevision: "keep",
    };
    return { traces, layout };
  }, [dark, scheme, result, titles.x, titles.y]);
  const ctx = useMemo(() => ({ dark, scheme, datasets: table.datasets.map((d) => d.name) }),
    [dark, scheme, table.datasets]);
  return (
    <FormattedPlot traces={fig.traces} layout={fig.layout} format={format} onFormatChange={onFormatChange}
      ctx={ctx} filename="mic-growth" label="Growth against concentration" />
  );
}
