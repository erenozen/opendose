// ROC curve analysis: controls, results, methods text and the graph (one
// or two curves, the chosen cut-off marked, the partial-AUC region
// shaded, optional binormal smooth).
import { useMemo } from "react";
import type Plotly from "plotly.js-dist-min";
import { tagTrace } from "../../graph";
import { seriesStyle } from "../../lib/palette";
import type { DataTableModel } from "../../project/types";
import { formatSig } from "../../types";
import {
  Card, Check, Field, Grid, KV, Note, Problem, Section, Select, SOFTWARE, TextNum,
} from "../common/clinicalKit";
import CopyableMethods from "../common/CopyableMethods";
import { fmtP, levelPct, pLabel, stars } from "../common/statFormat";
import { baseLayout, chromeFor, useDark } from "../multivariable/chart";
import { PlotMessage, PlotlyChart } from "../multivariable/plotkit";
import type { ControlsProps, PlotProps, ResultsProps } from "../types";
import {
  curveXY, markerName, regionUnder, type RocCurveResult, type RocOptions, type RocResult,
  type RocThreshold,
} from "./roc";

const f = (v: number | null | undefined, sig?: number) => formatSig(v ?? null, sig);
const pct = (v: number | null | undefined) => (typeof v === "number" ? `${formatSig(100 * v, 4)}%` : "n/a");
const pctCi = (c: [number, number] | undefined | null) =>
  (c ? `${formatSig(100 * c[0], 4)}% to ${formatSig(100 * c[1], 4)}%` : "");
const ciTxt = (c: [number | null, number | null] | undefined | null) =>
  (c ? `${f(c[0])} to ${f(c[1])}` : "n/a");

function DatasetPick({ label, value, table, onChange }: {
  label: string; value: number; table: DataTableModel; onChange: (i: number) => void;
}) {
  return (
    <Field label={label}>
      <select aria-label={label} value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {table.datasets.map((d, i) => <option key={i} value={i}>{d.name || `Data set ${i + 1}`}</option>)}
      </select>
    </Field>
  );
}

/* ------------------------------------------------------------ controls */

export function RocControls({ table, options, onChange }: ControlsProps<RocOptions>) {
  const set = (p: Partial<RocOptions>) => onChange({ ...options, ...p });
  const direction = (key: "higherAbnormal" | "higherAbnormal2") => (
    <Select label="The condition is indicated by" value={options[key] ? "high" : "low"}
      options={[["high", "Higher values"], ["low", "Lower values"]]}
      onChange={(v) => set({ [key]: v === "high" })} />
  );
  return (
    <div className="controls">
      <Section title={options.compare ? `Marker 1: ${markerName(table, options.patients, options.controls)}` : "Groups"}>
        <DatasetPick label="Patients (condition present)" value={options.patients} table={table}
          onChange={(patients) => set({ patients })} />
        <DatasetPick label="Controls (condition absent)" value={options.controls} table={table}
          onChange={(controls) => set({ controls })} />
        {direction("higherAbnormal")}
      </Section>
      <Section title="Compare with a second marker">
        <Check label="Compare two ROC curves (DeLong)" checked={options.compare}
          onChange={(compare) => set({ compare })} />
        {options.compare && (
          <>
            <DatasetPick label="Marker 2 patients" value={options.patients2} table={table}
              onChange={(patients2) => set({ patients2 })} />
            <DatasetPick label="Marker 2 controls" value={options.controls2} table={table}
              onChange={(controls2) => set({ controls2 })} />
            {direction("higherAbnormal2")}
            <Select label="Design" value={options.paired ? "paired" : "unpaired"}
              options={[["paired", "Paired: both markers on the same subjects (rows line up)"],
                ["unpaired", "Unpaired: different subjects"]]}
              onChange={(v) => set({ paired: v === "paired" })} />
          </>
        )}
      </Section>
      <Section title="Optimal cut-off">
        <Select label="Criterion" value={options.criterion}
          options={[["youden", "Youden index (sensitivity + specificity − 1)"],
            ["closest_topleft", "Closest to the top-left corner"]]}
          onChange={(criterion) => set({ criterion })} />
        <TextNum label="Cost of a false negative ÷ false positive" value={options.costRatio}
          onChange={(costRatio) => set({ costRatio })}
          note="1 = equal costs. With a prevalence, the weighted Youden index is maximized." />
        <TextNum label="Prevalence (%)" value={options.prevalence} placeholder="sample"
          onChange={(prevalence) => set({ prevalence })}
          note="Used for the weighting and for PPV / NPV; blank = the proportion of patients in the data." />
        <TextNum label="Bootstrap replicates" value={options.bootstrap}
          onChange={(bootstrap) => set({ bootstrap })}
          note="For CIs of the cut-off, its sensitivity and specificity (0 = none; 2000 is typical)." />
        {Number(options.bootstrap) > 0 && (
          <TextNum label="Random seed" value={options.seed} onChange={(seed) => set({ seed })} />
        )}
      </Section>
      <Section title="Partial AUC and smoothing">
        <Check label="Partial area under the curve" checked={options.partial}
          onChange={(partial) => set({ partial })} />
        {options.partial && (
          <div className="clin-sub">
            <Select label="Over a range of" value={options.partialFocus}
              options={[["specificity", "Specificity"], ["sensitivity", "Sensitivity"]]}
              onChange={(partialFocus) => set({ partialFocus })} />
            <TextNum label="From (%)" value={options.partialFrom} onChange={(partialFrom) => set({ partialFrom })} />
            <TextNum label="To (%)" value={options.partialTo} onChange={(partialTo) => set({ partialTo })} />
            <Check label="Standardize (McClish correction: 0.5 = chance, 1 = perfect)"
              checked={options.partialCorrect} onChange={(partialCorrect) => set({ partialCorrect })} />
          </div>
        )}
        <Check label="Binormal smoothed curve" checked={options.binormal}
          onChange={(binormal) => set({ binormal })} />
        <TextNum label="Confidence level (%)" value={options.ciLevel} onChange={(ciLevel) => set({ ciLevel })} />
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------ results */

function CutoffPanel({ c, level }: { c: RocCurveResult; level: number }) {
  const cut = c.cutoff;
  if (!cut) return c.cutoffError ? <Note warn>Cut-off: {c.cutoffError}</Note> : null;
  const o = cut.optimal;
  const boot = cut.bootstrap;
  const op = c.higherAbnormal ? "≥" : "≤";
  const crit = cut.method === "closest_topleft" ? "closest to the top-left corner"
    : cut.weight_r !== 1 ? `weighted Youden index (weight ${f(cut.weight_r)})` : "Youden index";
  return (
    <>
      <h4>Optimal cut-off ({crit})</h4>
      <KV className="kv-wide" rows={[
        ["Cut-off", `${op} ${f(o.threshold)}${boot ? ` (bootstrap ${levelPct(level)} CI ${ciTxt(boot.threshold_ci)})` : ""}`],
        ["Sensitivity", `${pct(o.sensitivity)} (${levelPct(level)} CI ${pctCi(boot?.sensitivity_ci ?? o.sensitivity_ci)}${boot ? ", bootstrap" : ""})`],
        ["Specificity", `${pct(o.specificity)} (${levelPct(level)} CI ${pctCi(boot?.specificity_ci ?? o.specificity_ci)}${boot ? ", bootstrap" : ""})`],
        ["Youden index", `${f(o.youden)}${boot ? ` (bootstrap CI ${ciTxt(boot.youden_ci)})` : ""}`],
        ["Likelihood ratio +", f(o.lr_positive)],
        ["Likelihood ratio −", f(o.lr_negative)],
        [`PPV (prevalence ${cut.prevalence != null ? pct(cut.prevalence) : "of the sample"})`, pct(o.ppv)],
        ["NPV", pct(o.npv)],
        ["True / false positives", `${o.tp} / ${o.fp}`],
        ["True / false negatives", `${o.tn} / ${o.fn}`],
      ]} />
      {cut.ties.length > 1 && (
        <p className="hint-block">Other cut-offs score the same: {cut.ties.filter((t) => t !== o.threshold).map((t) => f(t)).join(", ")}.</p>
      )}
      {!boot && <p className="hint-block">Sensitivity and specificity CIs are exact (Clopper-Pearson) at this cut-off; ask for bootstrap replicates to include the uncertainty of choosing it.</p>}
    </>
  );
}

function ThresholdTable({ c }: { c: RocCurveResult }) {
  if (!c.cutoff) return null;
  const op = c.higherAbnormal ? "≥" : "≤";
  const rows = c.cutoff.thresholds.filter((t) => t.threshold !== null && Number.isFinite(t.threshold));
  return (
    <details className="clin-details">
      <summary>All {rows.length} cut-offs (sensitivity, specificity, likelihood ratios)</summary>
      <Grid caption={`Cut-offs of ${c.name}`}
        head={["Cut-off", "Sensitivity", "Specificity", "Youden", "LR+", "LR−", "PPV", "NPV"]}
        rows={rows.map((t: RocThreshold) => [`${op} ${f(t.threshold)}`, pct(t.sensitivity),
          pct(t.specificity), f(t.youden), f(t.lr_positive), f(t.lr_negative), pct(t.ppv), pct(t.npv)])} />
    </details>
  );
}

export function RocResults({ result }: ResultsProps<RocOptions, RocResult>) {
  if (!result) return null;
  if (result.error) return <Problem error={result.error} />;
  const level = result.ci_level;
  const cmp = result.compare;
  return (
    <>
      {result.curves.length > 1 && (
        <Card title={`Comparison of ROC curves: ${result.curves[0].name} vs ${result.curves[1].name}`}>
          {result.compareError && <Problem error={result.compareError} />}
          {cmp && (
            <>
              <KV className="kv-wide" rows={[
                ["Method", cmp.method === "delong_paired"
                  ? "DeLong, paired (same subjects)" : "DeLong, unpaired (different subjects)"],
                [`AUC ${result.curves[0].name}`, `${f(cmp.auc[0])} (SE ${f(cmp.se[0])})`],
                [`AUC ${result.curves[1].name}`, `${f(cmp.auc[1])} (SE ${f(cmp.se[1])})`],
                ["Difference", `${f(cmp.difference)} (SE ${f(cmp.se_difference)})`],
                [`${levelPct(level)} CI of the difference`, ciTxt(cmp.ci)],
                [cmp.statistic_name === "Z" ? "Z" : `D (df ${f(cmp.df)})`, f(cmp.statistic)],
                ["P value (two-sided)", `${fmtP(cmp.p)} ${stars(cmp.p)}`],
                ...(cmp.correlation != null ? [["Correlation of the AUCs", f(cmp.correlation)] as [string, string]] : []),
                ...(cmp.n_patients != null ? [["Complete pairs", `${cmp.n_patients} patients, ${cmp.n_controls} controls`] as [string, string]] : []),
              ]} />
              <p className="clin-reading">
                {cmp.p < 0.05
                  ? `The areas differ (${pLabel(cmp.p)}): ${cmp.difference > 0 ? result.curves[0].name : result.curves[1].name} discriminates better.`
                  : `No evidence that the areas differ (${pLabel(cmp.p)}); the CI of the difference shows how large a difference the data allow.`}
              </p>
            </>
          )}
        </Card>
      )}
      {result.curves.map((c, i) => (
        <Card key={i} title={`ROC curve: ${c.name}`}>
          <p className="hint-block">
            Patients: {c.patients} (n = {c.n_patients}); controls: {c.controls} (n = {c.n_controls}).
            {" "}{c.higherAbnormal ? "Higher" : "Lower"} values indicate the condition.
          </p>
          <KV className="kv-wide" rows={[
            ["Area under the ROC curve", f(c.auc.value)],
            ["SE (DeLong)", f(c.auc.se)],
            [`${levelPct(level)} CI`, ciTxt(c.auc.ci)],
            ["P value (vs AUC = 0.5)", fmtP(c.auc.p_vs_05)],
            ...(c.cutoff?.partial_auc ? partialRows(c) : []),
            ...(c.cutoff?.binormal ? [["Binormal AUC (smoothed)", `${f(c.cutoff.binormal.auc)} (a = ${f(c.cutoff.binormal.a)}, b = ${f(c.cutoff.binormal.b)})`] as [string, string]] : []),
          ]} />
          {c.cutoff?.partial_auc?.warning && <Note warn>{c.cutoff.partial_auc.warning}</Note>}
          <CutoffPanel c={c} level={level} />
          <ThresholdTable c={c} />
        </Card>
      ))}
    </>
  );
}

function partialRows(c: RocCurveResult): [string, string][] {
  const pa = c.cutoff!.partial_auc!;
  const range = `${pa.focus} ${formatSig(100 * pa.limits[1], 3)}% to ${formatSig(100 * pa.limits[0], 3)}%`;
  return [
    [`Partial AUC (${range})`, `${f(pa.partial_auc)} of a possible ${f(pa.max)}`],
    ...(pa.corrected != null ? [["Standardized partial AUC (McClish)", f(pa.corrected)] as [string, string]] : []),
  ];
}

export function RocMethods({ result }: ResultsProps<RocOptions, RocResult>) {
  if (!result || result.error) return null;
  const level = result.ci_level;
  const o = result.options;
  const parts = result.curves.map((c) => `${c.name}: AUC ${f(c.auc.value)} (${levelPct(level)} CI ${ciTxt(c.auc.ci)}; `
    + `${c.n_patients} patients, ${c.n_controls} controls)`);
  const c0 = result.curves[0];
  const cut = c0.cutoff;
  let text = `Receiver operating characteristic (ROC) curves were constructed with ${SOFTWARE}; the area under `
    + `the curve (AUC) is given with its standard error and ${levelPct(level)} confidence interval by DeLong's method `
    + `(DeLong et al. 1988). ${parts.join("; ")}.`;
  if (result.compare) {
    const cmp = result.compare;
    text += ` The AUCs were compared by DeLong's test for ${cmp.method === "delong_paired" ? "paired" : "unpaired"} `
      + `ROC curves: difference ${f(cmp.difference)} (${levelPct(level)} CI ${ciTxt(cmp.ci)}), `
      + `${cmp.statistic_name} = ${f(cmp.statistic)}${cmp.df ? `, df = ${f(cmp.df)}` : ""}, ${pLabel(cmp.p)}.`;
  }
  if (cut) {
    const crit = cut.method === "closest_topleft" ? "the point closest to the top-left corner"
      : cut.weight_r !== 1 ? `the weighted Youden index (false-negative to false-positive cost ratio ${f(cut.cost_ratio)}${cut.prevalence != null ? `, prevalence ${pct(cut.prevalence)}` : ""})`
        : "the Youden index";
    text += ` The optimal cut-off of ${c0.name}, chosen by ${crit}, was ${c0.higherAbnormal ? "≥" : "≤"} ${f(cut.optimal.threshold)} `
      + `(sensitivity ${pct(cut.optimal.sensitivity)}, specificity ${pct(cut.optimal.specificity)}, `
      + `LR+ ${f(cut.optimal.lr_positive)}, LR− ${f(cut.optimal.lr_negative)})`
      + (cut.bootstrap ? `, with ${levelPct(level)} CIs from ${cut.bootstrap.replicates} bootstrap replicates (seed ${cut.bootstrap.seed})` : "")
      + ".";
    if (cut.partial_auc) {
      text += ` Partial AUC over ${cut.partial_auc.focus} ${formatSig(100 * cut.partial_auc.limits[1], 3)}–${formatSig(100 * cut.partial_auc.limits[0], 3)}%: `
        + `${f(cut.partial_auc.partial_auc)}${cut.partial_auc.corrected != null ? ` (McClish-standardized ${f(cut.partial_auc.corrected)})` : ""}.`;
    }
    if (cut.binormal) text += ` A binormal model gave a smoothed AUC of ${f(cut.binormal.auc)}.`;
  }
  void o;
  return <CopyableMethods text={text} />;
}

/* ------------------------------------------------------------ graph */

/** Region right of the curve between two sensitivities (percent): the
 *  partial AUC over a sensitivity range. */
function regionRight(xs: number[], ys: number[], y0: number, y1: number) {
  const r = regionUnder(ys.map((y) => y), xs.map((x) => 100 - x), y0, y1);
  // regionUnder works in (y, 100 − x); map back to (x, y)
  return { x: r.y.map((v) => 100 - v), y: r.x };
}

export function RocPlot({ result, titles, scheme, format, onFormatChange }: PlotProps<RocOptions, RocResult>) {
  const dark = useDark();
  const fig = useMemo(() => {
    if (!result || result.error || !result.curves?.length) return null;
    const chrome = chromeFor(dark);
    const traces: Plotly.Data[] = [
      { x: [0, 100], y: [0, 100], mode: "lines", line: { color: chrome.muted, width: 1.2, dash: "dash" },
        hoverinfo: "skip", showlegend: false } as Plotly.Data,
    ];
    const annotations: Partial<Plotly.Annotations>[] = [];
    result.curves.forEach((c, i) => {
      const st = seriesStyle(i, dark, scheme);
      const { x, y, cut } = curveXY(c.points);
      const pa = c.cutoff?.partial_auc;
      if (pa) {
        const lo = 100 * pa.limits[1];
        const hi = 100 * pa.limits[0];
        const reg = pa.focus === "specificity" ? regionUnder(x, y, 100 - hi, 100 - lo) : regionRight(x, y, lo, hi);
        traces.push(tagTrace({ x: reg.x, y: reg.y, mode: "lines", fill: "toself", fillcolor: `${st.color}33`,
          line: { width: 0 }, hoverinfo: "skip", showlegend: false }, { ds: i, role: "band" }) as Plotly.Data);
      }
      if (c.cutoff?.binormal) {
        const b = c.cutoff.binormal.curve;
        traces.push(tagTrace({ x: b.specificity.map((s) => 100 * (1 - s)), y: b.sensitivity.map((s) => 100 * s),
          mode: "lines", name: `${c.name} (binormal)`, line: { color: st.color, width: 1.5, dash: "dot" },
          hoverinfo: "skip" }, { ds: i, role: "decor" }) as Plotly.Data);
      }
      traces.push(tagTrace({
        x, y, mode: "lines", name: `${c.name} (AUC ${formatSig(c.auc.value, 3)})`,
        line: { color: st.color, width: 2, dash: st.dash },
        hovertext: cut.map((k, j) => `${c.name}<br>cut-off ${f(k)}<br>sensitivity ${formatSig(y[j], 3)}%`
          + `<br>specificity ${formatSig(100 - x[j], 3)}%`),
        hoverinfo: "text",
      }, { ds: i, role: "line" }) as Plotly.Data);
      const o = c.cutoff?.optimal;
      if (o) {
        const ox = 100 * (1 - o.specificity);
        const oy = 100 * o.sensitivity;
        traces.push(tagTrace({ x: [ox], y: [oy], mode: "markers", showlegend: false,
          marker: { color: st.color, size: 11, symbol: "circle", line: { color: chrome.surface, width: 2 } },
          hovertext: [`${c.name}: cut-off ${c.higherAbnormal ? "≥" : "≤"} ${f(o.threshold)}<br>`
            + `sensitivity ${pct(o.sensitivity)}, specificity ${pct(o.specificity)}`], hoverinfo: "text",
        }, { ds: i, role: "points" }) as Plotly.Data);
        annotations.push({ x: ox, y: oy, xref: "x", yref: "y", text: `${c.higherAbnormal ? "≥" : "≤"} ${f(o.threshold)}`,
          // first marker's label up and left, the second's down and right
          showarrow: true, arrowhead: 0, ax: i === 0 ? -40 : 40, ay: i === 0 ? -28 : 28,
          font: { color: chrome.ink, size: 12 },
          arrowcolor: chrome.muted });
      }
    });
    const layout = baseLayout(chrome, titles.x || "100% − specificity%", titles.y || "Sensitivity%", {
      showlegend: true,
      legend: { x: 0.98, xanchor: "right", y: 0.04, yanchor: "bottom", font: { color: chrome.ink, size: 12 },
        bgcolor: "rgba(0,0,0,0)" },
      annotations,
    });
    layout.xaxis = { ...layout.xaxis, range: [-2, 102] };
    layout.yaxis = { ...layout.yaxis, range: [-2, 102], scaleanchor: "x" };
    return { traces, layout, names: result.curves.map((c) => c.name) };
  }, [result, dark, scheme, titles]);
  if (!result) return <PlotMessage>Calculating…</PlotMessage>;
  if (result.error) return <PlotMessage>No graph: {result.error}</PlotMessage>;
  if (!fig) return null;
  return <PlotlyChart data={fig.traces} layout={fig.layout} filename="roc-curve"
    label="ROC curves with the optimal cut-off" format={format} onFormatChange={onFormatChange}
    dark={dark} scheme={scheme} names={fig.names} />;
}
