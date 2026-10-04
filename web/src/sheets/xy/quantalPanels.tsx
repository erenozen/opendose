// Quantal dose-response: controls, results, methods text and the graph
// (observed proportions with binomial CIs per dose and the fitted curve
// with its confidence band, on a log dose axis).
import { useMemo } from "react";
import type Plotly from "plotly.js-dist-min";
import { tagTrace } from "../../graph";
import { seriesStyle } from "../../lib/palette";
import { formatSig } from "../../types";
import {
  Card, Check, Field, Grid, KV, Note, Problem, Section, Select, SOFTWARE, TextNum,
} from "../common/clinicalKit";
import CopyableMethods from "../common/CopyableMethods";
import { fmtP, levelPct } from "../common/statFormat";
import { baseLayout, chromeFor, useDark } from "../multivariable/chart";
import { PlotMessage, PlotlyChart } from "../multivariable/plotkit";
import type { ControlsProps, PlotProps, ResultsProps } from "../types";
import {
  LINK_LABELS, linkInverse, parseLevels, quantalGroups, transformDose, TRANSFORM_LABELS,
  untransform, wilson, type QuantalEc, type QuantalFit, type QuantalOptions, type QuantalResult,
} from "./quantal";

const f = (v: number | null | undefined, sig?: number) => formatSig(v ?? null, sig);
const ciTxt = (c: [number | null, number | null] | null | undefined) =>
  (c && c[0] != null && c[1] != null ? `${f(c[0])} to ${f(c[1])}` : "not defined (g ≥ 1)");
const ecName = (level: number) => (level === 50 ? "LD50 / ED50" : `ED${formatSig(level, 3)}`);

/* ------------------------------------------------------------ controls */

export function QuantalControls({ table, options, onChange }: ControlsProps<QuantalOptions>) {
  const set = (p: Partial<QuantalOptions>) => onChange({ ...options, ...p });
  const groups = quantalGroups(table, options);
  return (
    <div className="controls">
      <Section title="Data">
        <Select label="Responders and N" value={options.layout}
          options={[["subcolumns", "In each data set: Y1 = responders, Y2 = N"],
            ["pairs", "In pairs of data sets: responders, then N"]]}
          onChange={(layout) => set({ layout })} />
        <p className="hint-block">
          X holds the doses. Each row is one dose group: how many subjects
          responded (died, were affected) out of how many were treated.
        </p>
      </Section>
      <Section title="Model">
        <Select label="Link" value={options.link}
          options={Object.entries(LINK_LABELS) as [QuantalOptions["link"], string][]}
          onChange={(link) => set({ link })} />
        <Select label="Dose transform" value={options.doseTransform}
          options={Object.entries(TRANSFORM_LABELS) as [QuantalOptions["doseTransform"], string][]}
          onChange={(doseTransform) => set({ doseTransform })} />
        <Select label="Natural response" value={options.natural}
          options={[["none", "None (no response without the agent)"],
            ["estimate", "Estimate it from the data (Abbott)"],
            ["fixed", "A known rate"]]}
          onChange={(natural) => set({ natural })} />
        {options.natural === "fixed" && (
          <TextNum label="Natural response (%)" value={options.naturalValue}
            onChange={(naturalValue) => set({ naturalValue })} />
        )}
        <TextNum label="ECx levels (%)" value={options.ecLevels} onChange={(ecLevels) => set({ ecLevels })}
          note="Comma-separated, e.g. 50, 90 for LD50 and LD90." />
        <Select label="Heterogeneity correction" value={options.heterogeneity}
          options={[["auto", "When the goodness-of-fit test fails (P < 0.05)"],
            ["always", "Always"], ["never", "Never"]]}
          onChange={(heterogeneity) => set({ heterogeneity })} />
        <TextNum label="Confidence level (%)" value={options.ciLevel} onChange={(ciLevel) => set({ ciLevel })} />
      </Section>
      {groups.length > 1 && (
        <Section title="Several data sets">
          <Check label="Parallel lines (common slope): parallelism test and relative potency"
            checked={options.parallel} onChange={(parallel) => set({ parallel })} />
          {options.parallel && (
            <Field label="Potency relative to">
              <select aria-label="Reference data set" value={options.reference}
                onChange={(e) => set({ reference: Number(e.target.value) })}>
                {groups.map((g, i) => <option key={i} value={i}>{g.name}</option>)}
              </select>
            </Field>
          )}
          {options.parallel && options.natural !== "none" && (
            <p className="hint-block">The parallel-line fit does not model a natural response.</p>
          )}
        </Section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ results */

function EcTable({ ec, level, transform }: { ec: QuantalEc[]; level: number; transform: string }) {
  return (
    <Grid caption="Effective doses"
      head={["", "Dose", `${levelPct(level)} CI (Fieller)`, `${levelPct(level)} CI (delta)`,
        ...(transform !== "none" ? ["log dose ± SE"] : ["SE"])]}
      rows={ec.map((e) => [ecName(e.level), f(e.dose), ciTxt(e.dose_ci_fieller), ciTxt(e.dose_ci_delta),
        transform !== "none" ? `${f(e.x)} ± ${f(e.se_x)}` : f(e.se_x)])} />
  );
}

function FitCard({ fit, level }: { fit: QuantalFit; level: number }) {
  if (fit.error) return <Card title={fit.name}><Problem error={fit.error} /></Card>;
  const gof = fit.goodness_of_fit;
  const het = fit.heterogeneity;
  const p = fit.parameters;
  return (
    <Card title={`${fit.name}: ${fit.link} fit`}>
      <p className="hint-block">
        {fit.n_groups} doses, {fit.n_total} subjects; X = {TRANSFORM_LABELS[fit.dose_transform]}.
      </p>
      <h4>Effective doses</h4>
      <EcTable ec={fit.ec} level={level} transform={fit.dose_transform} />
      <h4>Parameters</h4>
      <Grid caption="Parameters" head={["", "Estimate", "SE", `${levelPct(level)} CI`]}
        rows={Object.entries(p).map(([k, v]) => [k === "natural_response" ? "Natural response" : k[0].toUpperCase() + k.slice(1),
          f(v.value), f(v.se), v.ci ? `${f(v.ci[0])} to ${f(v.ci[1])}` : ""])} />
      <div className="stat-cols">
        <KV title="Goodness of fit" rows={[
          ["Pearson χ²", `${f(gof.pearson_chi2)} (df ${gof.df}), P = ${fmtP(gof.p_pearson)}`],
          ["Deviance", `${f(gof.deviance)}${gof.p_deviance != null ? `, P = ${fmtP(gof.p_deviance)}` : ""}`],
          ["Heterogeneity factor", het.applied ? `${f(het.factor)} (applied: SEs and CIs inflated, ${het.distribution === "t" ? "t" : "normal"} quantile ${f(het.critical_value)})` : "1 (not applied)"],
        ]} />
        {fit.slope_test && (
          <KV title="Dose effect" rows={[
            ["Slope z", f(fit.slope_test.statistic)],
            ["P value", fmtP(fit.slope_test.p)],
          ]} />
        )}
      </div>
      {fit.warnings?.length ? <Note warn>{fit.warnings.join("; ")}.</Note> : null}
    </Card>
  );
}

export function QuantalResults({ result }: ResultsProps<QuantalOptions, QuantalResult>) {
  if (!result) return null;
  if (result.error) return <Problem error={result.error} />;
  const level = result.ci_level;
  if (result.parallel) {
    const r = result.parallel;
    return (
      <>
        <Card title={`Parallel-line ${r.link} assay`}>
          <KV className="kv-wide" rows={[
            ["Common slope", `${f(r.slope.value)} (SE ${f(r.slope.se)}; ${levelPct(level)} CI ${f(r.slope.ci[0])} to ${f(r.slope.ci[1])})`],
            ["Separate slopes", r.separate_slopes.map((s) => f(s)).join(", ")],
            ["Parallelism (likelihood ratio)", `χ² = ${f(r.parallelism.chi2)}, df = ${r.parallelism.df}, P = ${fmtP(r.parallelism.p)}`],
            ["Goodness of fit", `Pearson χ² = ${f(r.goodness_of_fit.pearson_chi2)}, df = ${r.goodness_of_fit.df}, P = ${fmtP(r.goodness_of_fit.p_pearson)}`],
            ["Heterogeneity factor", r.heterogeneity.applied ? `${f(r.heterogeneity.factor)} (applied)` : "1 (not applied)"],
          ]} />
          <p className={`clin-reading ${r.parallelism.p < 0.05 ? "clin-bad" : ""}`}>
            {r.parallelism.p < 0.05
              ? "The slopes differ (P < 0.05): the lines are not parallel, so a single relative potency is not meaningful. Fit the lines separately."
              : "No evidence against parallel lines; the relative potency below compares the data sets at every response level."}
          </p>
          {r.relative_potency.length > 0 && (
            <>
              <h4>Relative potency</h4>
              {r.dose_transform !== "none" ? (
                <>
                  <Grid caption="Relative potency" head={["", "Potency", `${levelPct(level)} CI (Fieller)`, `${levelPct(level)} CI (delta)`]}
                    rows={r.relative_potency.map((rp) => [`${rp.group} vs ${rp.reference}`, f(rp.potency),
                      ciTxt(rp.potency_ci_fieller), ciTxt(rp.potency_ci_delta)])} />
                  <p className="hint-block">Potency = dose of the reference giving the same response ÷ dose of this data set (above 1: more potent).</p>
                </>
              ) : (
                <>
                  <Grid caption="Relative potency on the X scale"
                    head={["", "Log potency (X units)", `${levelPct(level)} CI (Fieller)`, `${levelPct(level)} CI (delta)`]}
                    rows={r.relative_potency.map((rp) => [`${rp.group} vs ${rp.reference}`, f(rp.log_potency),
                      ciTxt(rp.log_ci_fieller), ciTxt(rp.log_ci_delta)])} />
                  <p className="hint-block">X is already the log dose, so the potency is the horizontal shift between the lines: X of the reference minus X of this data set at the same response (negative: less potent). Raise the log base to this power for the dose ratio.</p>
                </>
              )}
            </>
          )}
        </Card>
        {r.groups.map((g) => (
          <Card key={g.name} title={`${g.name}: effective doses (common slope)`}>
            <EcTable ec={g.ec} level={level} transform={r.dose_transform} />
            <p className="hint-block">Intercept {f(g.intercept.value)} (SE {f(g.intercept.se)}).</p>
          </Card>
        ))}
      </>
    );
  }
  return <>{result.fits?.map((fit) => <FitCard key={fit.name} fit={fit} level={level} />)}</>;
}

export function QuantalMethods({ result }: ResultsProps<QuantalOptions, QuantalResult>) {
  if (!result || result.error) return null;
  const o = result.options;
  const level = levelPct(result.ci_level);
  const link = o.link === "probit" ? "probit" : o.link === "logit" ? "logit" : "complementary log-log";
  const tr = o.doseTransform === "none" ? "dose as entered" : o.doseTransform === "log10" ? "log10 dose" : "natural-log dose";
  let text = `Quantal dose-response data (responders out of subjects treated at each dose) were analysed by `
    + `maximum-likelihood ${link} regression on ${tr} (Finney 1971), using ${SOFTWARE}. Effective doses `
    + `(${parseLevels(o.ecLevels).map(ecName).join(", ")}) are given with ${level} confidence limits by Fieller's theorem `
    + `and, for comparison, by the delta method. Goodness of fit was assessed by Pearson's χ²; `
    + (o.heterogeneity === "auto" ? "when it indicated heterogeneity (P < 0.05), variances were multiplied by the heterogeneity factor χ²/df and t quantiles were used."
      : o.heterogeneity === "always" ? "variances were always multiplied by the heterogeneity factor χ²/df."
        : "no heterogeneity correction was applied.");
  if (o.natural !== "none" && !result.parallel) {
    text += o.natural === "estimate" ? " A natural (control) response rate was estimated (Abbott's formula)."
      : ` A natural response rate of ${o.naturalValue}% was assumed (Abbott's formula).`;
  }
  if (result.parallel) {
    const r = result.parallel;
    text += ` The data sets were fitted with a common slope (parallel-line assay; parallelism likelihood-ratio χ² = `
      + `${f(r.parallelism.chi2)}, df = ${r.parallelism.df}, P = ${fmtP(r.parallelism.p)}); relative potencies are given with `
      + `Fieller confidence limits. ` + r.groups.map((g) => {
      const e = g.ec.find((x) => x.level === 50) ?? g.ec[0];
      return `${g.name}: ${ecName(e.level)} ${f(e.dose)} (${level} CI ${ciTxt(e.dose_ci_fieller)})`;
    }).join("; ") + ".";
  } else if (result.fits) {
    text += " " + result.fits.filter((x) => !x.error).map((fit) => {
      const e = fit.ec.find((x) => x.level === 50) ?? fit.ec[0];
      return `${fit.name}: slope ${f(fit.parameters.slope?.value)}, ${ecName(e.level)} ${f(e.dose)} (${level} CI ${ciTxt(e.dose_ci_fieller)}); `
        + `Pearson χ² = ${f(fit.goodness_of_fit.pearson_chi2)}, df = ${fit.goodness_of_fit.df}, P = ${fmtP(fit.goodness_of_fit.p_pearson)}`;
    }).join(". ") + ".";
  }
  return <CopyableMethods text={text} />;
}

/* ------------------------------------------------------------ graph */

export function QuantalPlot({ table, result, titles, scheme, format, onFormatChange }:
  PlotProps<QuantalOptions, QuantalResult>) {
  const dark = useDark();
  const fig = useMemo(() => {
    if (!result || result.error || !result.groups?.length) return null;
    const chrome = chromeFor(dark);
    const o = result.options;
    const logAxis = o.doseTransform !== "none";
    const traces: Plotly.Data[] = [];
    const names = result.groups.map((g) => g.name);
    result.groups.forEach((g, i) => {
      const st = seriesStyle(i, dark, scheme);
      const prop = g.responders.map((r, k) => r / g.n[k]);
      const ci = g.responders.map((r, k) => wilson(r, g.n[k], result.ci_level));
      const keep = g.dose.map((d) => !logAxis || d > 0);
      const sel = <T,>(a: T[]) => a.filter((_, k) => keep[k]);
      traces.push(tagTrace({
        x: sel(g.dose), y: sel(prop).map((v) => 100 * v), mode: "markers", type: "scatter", name: g.name,
        marker: { color: st.color, size: 9, symbol: st.symbol },
        error_y: { type: "data", symmetric: false, color: st.color, thickness: 1.4, width: 5,
          array: sel(ci).map((c, k) => 100 * (c[1] - sel(prop)[k])),
          arrayminus: sel(ci).map((c, k) => 100 * (sel(prop)[k] - c[0])) },
        hovertext: sel(g.dose).map((d, k) => `${g.name}<br>dose ${f(d)}: ${sel(g.responders)[k]} of ${sel(g.n)[k]}`
          + ` (${formatSig(100 * sel(prop)[k], 3)}%)`),
        hoverinfo: "text",
      }, { ds: i, role: "points" }) as Plotly.Data);
      // fitted curve: from the engine (separate fits) or the common-slope line
      let curve: { dose: number[]; p: number[]; lower?: number[]; upper?: number[] } | null = null;
      const fit = result.fits?.find((x) => x.name === g.name && !x.error);
      if (fit?.curve) curve = fit.curve;
      else if (result.parallel) {
        const pg = result.parallel.groups.find((x) => x.name === g.name);
        if (pg) {
          const xs = g.dose.filter((d) => !logAxis || d > 0).map((d) => transformDose(o.doseTransform, d));
          const lo = Math.min(...xs);
          const hi = Math.max(...xs);
          const pad = (hi - lo) * 0.15 || 0.5;
          const grid = Array.from({ length: 101 }, (_, k) => lo - pad + ((hi - lo + 2 * pad) * k) / 100);
          curve = { dose: grid.map((x) => untransform(o.doseTransform, x)),
            p: grid.map((x) => linkInverse(o.link, pg.intercept.value + result.parallel!.slope.value * x)) };
        }
      }
      if (curve) {
        if (curve.lower && curve.upper) {
          traces.push(tagTrace({ x: curve.dose, y: curve.upper.map((v) => 100 * v), mode: "lines",
            line: { width: 0 }, hoverinfo: "skip", showlegend: false }, { ds: i, role: "decor" }) as Plotly.Data);
          traces.push(tagTrace({ x: curve.dose, y: curve.lower.map((v) => 100 * v), mode: "lines",
            line: { width: 0 }, fill: "tonexty", fillcolor: `${st.color}22`, hoverinfo: "skip", showlegend: false },
          { ds: i, role: "band" }) as Plotly.Data);
        }
        traces.push(tagTrace({ x: curve.dose, y: curve.p.map((v) => 100 * v), mode: "lines", name: `${g.name} (fit)`,
          line: { color: st.color, width: 2, dash: st.dash }, showlegend: false,
          hovertemplate: `${g.name}<br>dose %{x:.4g}: %{y:.1f}%<extra></extra>` }, { ds: i, role: "fit" }) as Plotly.Data);
      }
    });
    const layout = baseLayout(chrome, titles.x || table.xTitle || "Dose", titles.y || "Percent responding", {
      showlegend: result.groups.length > 1,
      legend: { orientation: "h", y: 1.02, yanchor: "bottom", x: 0, font: { color: chrome.ink } },
    });
    layout.yaxis = { ...layout.yaxis, range: [-3, 103] };
    if (logAxis) layout.xaxis = { ...layout.xaxis, type: "log" };
    return { traces, layout, names };
  }, [result, dark, scheme, titles, table.xTitle]);
  if (!result) return <PlotMessage>Calculating…</PlotMessage>;
  if (result.error) return <PlotMessage>No graph: {result.error}</PlotMessage>;
  if (!fig) return null;
  return <PlotlyChart data={fig.traces} layout={fig.layout} filename="quantal-dose-response"
    label="Percent responding per dose with binomial CIs and the fitted curve" format={format}
    onFormatChange={onFormatChange} dark={dark} scheme={scheme} names={fig.names} />;
}
