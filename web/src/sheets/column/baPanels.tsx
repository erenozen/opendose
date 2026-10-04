// Bland-Altman analysis: controls, results, methods text and the graph
// (differences against averages, bias and limits with their CI bands,
// the proportional-bias regression line).
import { useMemo } from "react";
import type Plotly from "plotly.js-dist-min";
import { tagTrace } from "../../graph";
import { seriesStyle } from "../../lib/palette";
import { formatSig } from "../../types";
import {
  Card, Check, Field, KV, Note, Problem, Section, Select, SOFTWARE, TextNum,
} from "../common/clinicalKit";
import CopyableMethods from "../common/CopyableMethods";
import { fmtP, levelPct } from "../common/statFormat";
import { baseLayout, chromeFor, useDark } from "../multivariable/chart";
import { PlotMessage, PlotlyChart } from "../multivariable/plotkit";
import type { ControlsProps, PlotProps, ResultsProps } from "../types";
import {
  baBlock, limitsCi, LIMITS_CI_LABELS, VARIANT_LABELS, type BaBlock, type BaOptions,
  type BaResult,
} from "./blandAltman";

const f = (v: number | null | undefined, sig?: number) => formatSig(v ?? null, sig);
const ciTxt = (c: [number, number] | undefined | null) => (c ? `${f(c[0])} to ${f(c[1])}` : "n/a");

/* ------------------------------------------------------------ controls */

export function BaControls({ table, options, onChange }: ControlsProps<BaOptions>) {
  const set = (p: Partial<BaOptions>) => onChange({ ...options, ...p });
  const pick = (label: string, key: "datasetA" | "datasetB") => (
    <Field label={label}>
      <select aria-label={label} value={options[key]} onChange={(e) => set({ [key]: Number(e.target.value) })}>
        {table.datasets.map((d, i) => <option key={i} value={i}>{d.name || `Data set ${i + 1}`}</option>)}
      </select>
    </Field>
  );
  const repeated = options.repeated !== "none";
  return (
    <div className="controls">
      <Section title="Methods to compare">
        {pick("Method A", "datasetA")}
        {pick("Method B", "datasetB")}
        <p className="hint-block">Each row is one subject measured by both methods; rows missing either value are skipped.</p>
      </Section>
      <Section title="Repeated measurements">
        <Select label="Several rows per subject" value={options.repeated}
          options={[["none", "No: one pair per subject"],
            ["varies", "Yes, the true value varies between a subject's measurements"],
            ["constant", "Yes, the true value is constant (rows may hold only A or only B)"]]}
          onChange={(repeated) => set({ repeated })} />
        {repeated && (
          <Field label="Subject of each row">
            <select aria-label="Subject of each row" value={options.subject}
              onChange={(e) => set({ subject: e.target.value })}>
              <option value="rows">Row titles</option>
              {table.datasets.map((d, i) => (i !== options.datasetA && i !== options.datasetB
                ? <option key={i} value={String(i)}>{d.name || `Data set ${i + 1}`}</option> : null))}
            </select>
          </Field>
        )}
      </Section>
      <Section title="Limits of agreement">
        {!repeated && (
          <Select label="Plot" value={options.variant}
            options={Object.entries(VARIANT_LABELS) as [BaOptions["variant"], string][]}
            onChange={(variant) => set({ variant })} />
        )}
        <TextNum label="Agreement (%)" value={options.agreement} onChange={(agreement) => set({ agreement })}
          note="95 = limits containing 95% of differences (bias ± 1.96 SD)." />
        {!repeated && (
          <Select label="CIs of the limits" value={options.limitsCi}
            options={Object.entries(LIMITS_CI_LABELS) as [BaOptions["limitsCi"], string][]}
            onChange={(limitsCi) => set({ limitsCi })} />
        )}
        <TextNum label="Confidence level (%)" value={options.ciLevel} onChange={(ciLevel) => set({ ciLevel })} />
        {!repeated && (
          <Check label="Proportional bias: regress the differences on the averages (regression-based limits)"
            checked={options.regression} onChange={(regression) => set({ regression })} />
        )}
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------ results */

function unitsOf(r: BaResult): { scale: (v: number) => number; label: string } {
  if (r.options.variant === "ratio" && r.analysis === "bland_altman_extras") {
    return { scale: (v) => Math.exp(v), label: "ratio" };
  }
  return { scale: (v) => v, label: r.options.variant === "percent" ? "%" : "" };
}

export function BaResults({ result }: ResultsProps<BaOptions, BaResult>) {
  if (!result) return null;
  if (result.error) return <Problem error={result.error} />;
  const [a, b] = result.names;
  const agr = levelPct(result.agreement);
  const lvl = levelPct(result.ci_level);
  if (result.analysis === "bland_altman_repeated") {
    return (
      <Card title={`Bland-Altman with repeated measurements: ${a} vs ${b}`}>
        <p className="hint-block">
          {result.n_subjects} subjects, {result.n_pairs} {result.true_value === "varies" ? "pairs" : "measurements"};
          true value {result.true_value === "varies" ? "varies within a subject" : "constant within a subject"}
          {" "}(Bland & Altman 2007).
        </p>
        <KV className="kv-wide" rows={[
          ["Bias (mean of A − B)", `${f(result.bias)} (${lvl} CI ${ciTxt(result.bias_ci)})`],
          ["SD of differences (between + within subjects)", f(result.sd)],
          [`${agr} limits of agreement`, `${f(result.loa_lower)} to ${f(result.loa_upper)}`],
          [`${lvl} CI of the lower limit`, ciTxt(result.loa_ci?.lower)],
          [`${lvl} CI of the upper limit`, ciTxt(result.loa_ci?.upper)],
          ...(result.var_between != null ? [["Variance between / within subjects", `${f(result.var_between)} / ${f(result.var_within)}`] as [string, string]] : []),
        ]} />
        <p className="hint-block">Limit CIs by the MOVER method for replicated data (Zou 2013).</p>
      </Card>
    );
  }
  const block = baBlock(result);
  if (!block) return null;
  const u = unitsOf(result);
  const ratio = result.options.variant === "ratio";
  const lci = limitsCi(block, result.options.limitsCi === "none" ? "exact" : result.options.limitsCi);
  const rlci = ratio ? block.ratio_loa_ci?.[result.options.limitsCi === "none" ? "exact" : result.options.limitsCi] : null;
  const pb = result.proportional_bias;
  const norm = result.normality ?? {};
  const normRows: [string, string][] = Object.entries(norm).map(([k, v]) => [
    k === "shapiro_wilk" ? "Shapiro-Wilk" : k === "dagostino_pearson" ? "D'Agostino-Pearson" : k,
    `${v.W != null ? `W = ${f(v.W)}, ` : v.K2 != null ? `K² = ${f(v.K2)}, ` : ""}P = ${fmtP(v.p)} (${v.passed_alpha_05 ? "passes" : "fails"} at 0.05)`]);
  const methodLabel = LIMITS_CI_LABELS[result.options.limitsCi === "none" ? "exact" : result.options.limitsCi];
  return (
    <Card title={`Bland-Altman: ${a} vs ${b}`}>
      <p className="hint-block">{block.n} pairs. Plotted: {VARIANT_LABELS[result.options.variant].replace("A", a).replace("B", b)}.</p>
      <KV className="kv-wide" rows={ratio ? [
        ["Mean ratio A / B (geometric)", `${f(block.ratio_bias)} (${lvl} CI ${ciTxt(block.ratio_bias_ci)})`],
        [`${agr} limits of agreement (ratio)`, block.ratio_loa ? `${f(block.ratio_loa[0])} to ${f(block.ratio_loa[1])}` : "n/a"],
        ...(rlci ? [[`${lvl} CI of the lower limit`, ciTxt(rlci.lower)], [`${lvl} CI of the upper limit`, ciTxt(rlci.upper)]] as [string, string][] : []),
        ["Bias of log ratios (SD)", `${f(block.bias)} (${f(block.sd)})`],
      ] : [
        [`Bias (mean of A − B${u.label === "%" ? ", %" : ""})`, `${f(block.bias)} (${lvl} CI ${ciTxt(block.bias_ci)})`],
        ["SD of differences", f(block.sd)],
        [`${agr} limits of agreement`, `${f(block.loa_lower)} to ${f(block.loa_upper)}`],
        ...(lci ? [[`${lvl} CI of the lower limit`, ciTxt(lci.lower)], [`${lvl} CI of the upper limit`, ciTxt(lci.upper)]] as [string, string][] : []),
      ]} />
      <p className="hint-block">Limit CIs: {methodLabel}. A bias CI that excludes 0 means a systematic difference between the methods.</p>
      <div className="stat-cols">
        {pb && (
          <KV title="Proportional bias (differences on averages)" rows={[
            ["Slope", `${f(pb.slope)} (SE ${f(pb.slope_se)})`],
            ["Intercept", f(pb.intercept)],
            [`t (df ${pb.df})`, f(pb.slope_t)],
            ["P value (slope = 0)", fmtP(pb.slope_p)],
            ["Reading", pb.slope_p < 0.05 ? "the difference changes with the magnitude: use regression-based limits"
              : "no evidence that the difference depends on the magnitude"],
          ]} />
        )}
        {normRows.length > 0 && <KV title="Normality of the differences" rows={normRows} />}
      </div>
      {pb && pb.slope_p < 0.05 && !result.options.regression && result.options.variant === "difference" && (
        <Note warn>The differences grow or shrink with the magnitude (P = {fmtP(pb.slope_p)}). Tick “Proportional bias” to draw regression-based limits, or plot ratios or percent differences.</Note>
      )}
      {result.options.regression && pb && result.options.variant === "difference" && (
        <p className="hint-block">
          Regression-based limits (Bland & Altman 1999): bias = {f(pb.intercept)} + {f(pb.slope)} × average;
          limits = bias ± {f(block.z * Math.sqrt(Math.PI / 2))} × ({f(pb.abs_residual_intercept)} + {f(pb.abs_residual_slope)} × average).
        </p>
      )}
    </Card>
  );
}

export function BaMethods({ result }: ResultsProps<BaOptions, BaResult>) {
  if (!result || result.error) return null;
  const [a, b] = result.names;
  const agr = levelPct(result.agreement);
  const lvl = levelPct(result.ci_level);
  let text: string;
  if (result.analysis === "bland_altman_repeated") {
    text = `Agreement between ${a} and ${b} was assessed by the Bland-Altman method for repeated measurements `
      + `per subject (Bland & Altman 2007; true value ${result.true_value === "varies" ? "varying" : "constant"} within subjects), `
      + `using ${SOFTWARE}: ${result.n_subjects} subjects, ${result.n_pairs} measurements. Bias ${f(result.bias)} `
      + `(${lvl} CI ${ciTxt(result.bias_ci)}); ${agr} limits of agreement ${f(result.loa_lower)} to ${f(result.loa_upper)}, `
      + `with ${lvl} confidence intervals by the MOVER method (Zou 2013): lower ${ciTxt(result.loa_ci?.lower)}, upper ${ciTxt(result.loa_ci?.upper)}.`;
  } else {
    const block = baBlock(result);
    if (!block) return null;
    const how = result.options.limitsCi === "none" ? "exact" : result.options.limitsCi;
    const lci = limitsCi(block, how);
    const cite = how === "mover" ? "the MOVER method (Zou 2013)" : how === "exact"
      ? "exact tolerance factors (Carkeet 2015)" : "the approximate method of Bland & Altman (1999)";
    const ratio = result.options.variant === "ratio";
    const pb = result.proportional_bias;
    text = `Agreement between ${a} and ${b} was assessed by the Bland-Altman method (Bland & Altman 1999) `
      + `using ${SOFTWARE} on ${block.n} paired measurements`
      + (ratio ? `, analysing log-transformed ratios ${a}/${b}: geometric mean ratio ${f(block.ratio_bias)} (${lvl} CI ${ciTxt(block.ratio_bias_ci)}), `
        + `${agr} limits of agreement ${block.ratio_loa ? `${f(block.ratio_loa[0])} to ${f(block.ratio_loa[1])}` : "n/a"}`
        : `${result.options.variant === "percent" ? ", as percent differences relative to the mean of the two methods" : ""}: `
          + `bias ${f(block.bias)} (${lvl} CI ${ciTxt(block.bias_ci)}), SD of differences ${f(block.sd)}, `
          + `${agr} limits of agreement ${f(block.loa_lower)} to ${f(block.loa_upper)}`)
      + (result.options.limitsCi !== "none" && lci && !ratio
        ? `, with ${lvl} confidence intervals by ${cite} (lower limit ${ciTxt(lci.lower)}, upper limit ${ciTxt(lci.upper)})` : "")
      + ".";
    const sw = result.normality?.shapiro_wilk;
    if (sw) text += ` Normality of the differences: Shapiro-Wilk P = ${fmtP(sw.p)}.`;
    if (pb) {
      text += ` Proportional bias was examined by regressing the differences on the averages (slope ${f(pb.slope)}, P = ${fmtP(pb.slope_p)})`
        + (result.options.regression ? "; regression-based limits of agreement were derived from the absolute residuals (Bland & Altman 1999)." : ".");
    }
  }
  return <CopyableMethods text={text} />;
}

/* ------------------------------------------------------------ graph */

const NAMES = ["Differences"];

export function BaPlot({ table, result, titles, scheme, format, onFormatChange }:
  PlotProps<BaOptions, BaResult>) {
  const dark = useDark();
  const fig = useMemo(() => {
    if (!result || result.error) return null;
    const chrome = chromeFor(dark);
    const st = seriesStyle(0, dark, scheme);
    const repeated = result.analysis === "bland_altman_repeated";
    const block: BaBlock | null = repeated ? null : baBlock(result);
    const points = repeated ? result.points ?? [] : block?.points ?? [];
    if (!points.length) return null;
    const ratio = !repeated && result.options.variant === "ratio";
    const tr = (v: number) => (ratio ? Math.exp(v) : v);
    const xs = points.map((p) => p.average);
    const ys = points.map((p) => tr(p.difference));
    const lo = Math.min(...xs);
    const hi = Math.max(...xs);
    const pad = (hi - lo) * 0.04 || 1;
    const x0 = lo - pad;
    const x1 = hi + pad;
    const bias = repeated ? result.bias! : ratio ? block!.ratio_bias! : block!.bias;
    const lower = repeated ? result.loa_lower! : ratio ? block!.ratio_loa![0] : block!.loa_lower;
    const upper = repeated ? result.loa_upper! : ratio ? block!.ratio_loa![1] : block!.loa_upper;
    const biasCi = repeated ? result.bias_ci : ratio ? block!.ratio_bias_ci : block!.bias_ci;
    const how = result.options.limitsCi;
    const lci = repeated ? result.loa_ci ?? null : how === "none" ? null
      : ratio ? block!.ratio_loa_ci?.[how] ?? null : limitsCi(block!, how);
    const rows = result.rows;
    const traces: Plotly.Data[] = [];
    const shapes: Partial<Plotly.Shape>[] = [];
    const annotations: Partial<Plotly.Annotations>[] = [];
    const band = (c: [number, number] | undefined | null, color: string) => {
      if (!c) return;
      shapes.push({ type: "rect", xref: "x", yref: "y", x0, x1, y0: c[0], y1: c[1],
        fillcolor: color, line: { width: 0 }, layer: "below" });
    };
    const regression = !repeated && result.options.regression && result.options.variant === "difference"
      && result.proportional_bias;
    if (!regression) {
      band(biasCi, `${st.color}26`);
      band(lci?.lower, `${chrome.muted}2e`);
      band(lci?.upper, `${chrome.muted}2e`);
      const line = (y: number, label: string, dash: "solid" | "dash") => {
        shapes.push({ type: "line", xref: "x", yref: "y", x0, x1, y0: y, y1: y,
          line: { color: dash === "solid" ? st.color : chrome.inkSecondary, width: 1.6, dash } });
        annotations.push({ x: 1, xref: "paper", y, yref: "y", xanchor: "right", yanchor: "bottom",
          showarrow: false, text: `${label} ${f(y)}`, font: { color: chrome.inkSecondary, size: 12 } });
      };
      line(bias, ratio ? "Mean ratio" : "Bias", "solid");
      line(upper, `+${levelPct(result.agreement)} limit`, "dash");
      line(lower, `−${levelPct(result.agreement)} limit`, "dash");
    } else {
      const pb = result.proportional_bias!;
      const c = pb.curve;
      traces.push(tagTrace({ x: c.average, y: c.bias, mode: "lines", name: "Bias (regression)",
        line: { color: st.color, width: 2 }, hoverinfo: "skip" }, { ds: 0, role: "fit" }) as Plotly.Data);
      for (const ys2 of [c.upper, c.lower]) {
        traces.push(tagTrace({ x: c.average, y: ys2, mode: "lines", name: "Limits (regression)",
          line: { color: chrome.inkSecondary, width: 1.6, dash: "dash" }, hoverinfo: "skip", showlegend: false },
        { ds: 0, role: "decor" }) as Plotly.Data);
      }
    }
    traces.unshift(tagTrace({
      x: xs, y: ys, mode: "markers", type: "scatter", name: "Pairs",
      marker: { color: `${st.color}b3`, size: 8, symbol: st.symbol, line: { color: chrome.surface, width: 1 } },
      hovertext: points.map((p, i) => `${repeated ? `Subject ${p.subject}` : rows ? table.rowTitles[rows[i]]?.trim() || `Row ${rows[i] + 1}` : ""}`
        + `<br>average ${f(p.average)}<br>${ratio ? "ratio" : "difference"} ${f(ys[i])}`),
      hoverinfo: "text",
    }, { ds: 0, role: "points", ...(rows ? { rows } : {}) }) as Plotly.Data);
    const [a, b] = result.names;
    const yTitle = ratio ? `${a} / ${b}` : result.options.variant === "percent" && !repeated
      ? `100 × (${a} − ${b}) / average (%)` : `${a} − ${b}`;
    const layout = baseLayout(chrome, titles.x || `Average of ${a} and ${b}`, titles.y || yTitle, {
      showlegend: false, shapes, annotations, margin: { l: 64, r: 16, t: 12, b: 52 },
    });
    if (ratio) layout.yaxis = { ...layout.yaxis, type: "log" };
    layout.xaxis = { ...layout.xaxis, range: [x0, x1] };
    return { traces, layout };
  }, [result, dark, scheme, titles, table.rowTitles]);
  if (!result) return <PlotMessage>Calculating…</PlotMessage>;
  if (result.error) return <PlotMessage>No graph: {result.error}</PlotMessage>;
  if (!fig) return <PlotMessage>No pairs to draw.</PlotMessage>;
  return <PlotlyChart data={fig.traces} layout={fig.layout} filename="bland-altman"
    label="Bland-Altman plot: differences against averages with the limits of agreement"
    format={format} onFormatChange={onFormatChange} dark={dark} scheme={scheme} names={NAMES}
    rowTitles={table.rowTitles} />;
}

