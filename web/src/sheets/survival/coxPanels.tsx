// Cox proportional-hazards regression: controls, results, methods text and
// graphs (adjusted survival curves, forest plot of hazard ratios,
// Schoenfeld residuals). Shared by survival and multiple-variables tables.
import { useMemo } from "react";
import type Plotly from "plotly.js-dist-min";
import { OptCheck, OptSelect } from "../../components/GraphOptionControls";
import { tagTrace } from "../../graph";
import { seriesStyle } from "../../lib/palette";
import type { DataTableModel } from "../../project/types";
import { formatSig } from "../../types";
import { asRecord, useGraphOptions } from "../common/graphOptions";
import {
  Card, Check, Field, Grid, KV, Note, Problem, Section, Select, SOFTWARE, TextNum,
} from "../common/clinicalKit";
import CopyableMethods from "../common/CopyableMethods";
import { fmtP, levelPct, stars } from "../common/statFormat";
import { baseLayout, chromeFor, useDark } from "../multivariable/chart";
import { PlotMessage, PlotlyChart } from "../multivariable/plotkit";
import type { ControlsProps, GraphOptionsProps, PlotProps, ResultsProps } from "../types";
import {
  coefficientLabel, coxModel, lowess, phReading,
  PH_TRANSFORM_LABELS, TIES_LABELS, type CoxCoefficient, type CoxOptions, type CoxResult,
} from "./cox";

const f = (v: number | null | undefined, sig?: number) => formatSig(v ?? null, sig);
const ci = (c: [number | null, number | null] | undefined | null) =>
  (c ? `${c[0] === null ? "n/a" : f(c[0])} to ${c[1] === null ? "−" : f(c[1])}` : "n/a");

function mvNames(t: DataTableModel): { name: string; categorical: boolean }[] {
  return t.datasets.map((d, i) => ({
    name: d.name.trim() || `Variable ${String.fromCharCode(65 + (i % 26))}`,
    categorical: d.varType === "categorical",
  }));
}

/* ------------------------------------------------------------ controls */

export function CoxControls({ table, options, onChange }: ControlsProps<CoxOptions>) {
  const set = (p: Partial<CoxOptions>) => onChange({ ...options, ...p });
  const model = useMemo(() => coxModel(table, options), [table, options]);
  const mv = table.type === "multivariable";
  const vars = mv ? mvNames(table) : [];
  const toggle = (name: string, on: boolean) => set({
    dropped: on ? options.dropped.filter((n) => n !== name) : [...options.dropped, name],
  });
  const setCat = (name: string, on: boolean) => set({
    categorical: on ? [...options.categorical.filter((n) => n !== name), name]
      : options.categorical.filter((n) => n !== name),
  });
  const others = model.covariates.filter((n) => n !== options.curvesBy);
  return (
    <div className="controls">
      {mv && (
        <Section title="Survival data">
          <Select label="Time" value={options.time}
            options={[["", "Choose…"], ...vars.filter((v) => !v.categorical)
              .map((v) => [v.name, v.name] as const)]}
            onChange={(time) => set({ time })} />
          <Select label="Event" value={options.event}
            options={[["", "Choose…"], ...vars.map((v) => [v.name, v.name] as const)]}
            onChange={(event) => set({ event })} />
          <TextNum label="Event value" value={options.eventCode}
            onChange={(eventCode) => set({ eventCode })}
            note="Rows holding this value had the event; any other value is censored." />
        </Section>
      )}
      {!mv && (
        <Section title="Data">
          <p className="hint-block">
            Each row is a subject: Time, Event (1 = event, 0 = censored) and
            any covariate columns (add them with “Add covariate” above the
            table). With two or more groups, the group is a covariate too.
          </p>
        </Section>
      )}
      <fieldset className="clin-varlist">
        <legend>Covariates</legend>
        {model.candidates.length === 0 && (
          <p className="hint-block">No covariates yet.</p>
        )}
        {model.candidates.map((c) => {
          const included = !options.dropped.includes(c.name) && c.name !== model.strata;
          const isCat = model.categorical.includes(c.name);
          return (
            <div key={c.name}>
              <label className="check-row">
                <input type="checkbox" checked={included} disabled={c.name === model.strata}
                  onChange={(e) => toggle(c.name, e.target.checked)} />
                <span>{c.name}</span>
                <span className="clin-tag">{c.name === model.strata ? "strata"
                  : isCat || c.text ? "categorical" : "continuous"}</span>
              </label>
              {included && !c.text && c.levels.length > 0 && c.levels.length <= 12 && (
                <div className="clin-sub">
                  <Check label="Treat the numbers as categories" checked={isCat}
                    onChange={(on) => setCat(c.name, on)} />
                </div>
              )}
              {included && isCat && c.levels.length > 1 && (
                <div className="clin-sub">
                  <Field label="Reference level">
                    <select aria-label={`Reference level of ${c.name}`}
                      value={options.reference[c.name] && c.levels.includes(options.reference[c.name])
                        ? options.reference[c.name] : c.levels[0]}
                      onChange={(e) => set({ reference: { ...options.reference, [c.name]: e.target.value } })}>
                      {c.levels.map((lv) => <option key={lv} value={lv}>{lv}</option>)}
                    </select>
                  </Field>
                </div>
              )}
            </div>
          );
        })}
      </fieldset>
      <Section title="Model">
        <Select label="Strata" value={model.strata}
          options={[["", "None"], ...model.candidates.filter((c) => c.text || c.levels.length > 0)
            .map((c) => [c.name, c.name] as const)]}
          onChange={(strata) => set({ strata })} />
        <Select label="Tied event times" value={options.ties}
          options={Object.entries(TIES_LABELS) as [CoxOptions["ties"], string][]}
          onChange={(ties) => set({ ties })} />
        <Select label="Confidence intervals" value={options.ciMethod}
          options={[["wald", "Wald (default)"], ["profile", "Profile likelihood (asymmetric)"]]}
          onChange={(ciMethod) => set({ ciMethod })} />
        <TextNum label="Confidence level (%)" value={options.ciLevel}
          onChange={(ciLevel) => set({ ciLevel })} />
      </Section>
      <Section title="Proportional-hazards test">
        <Select label="Time scale" value={options.phTransform}
          options={Object.entries(PH_TRANSFORM_LABELS) as [CoxOptions["phTransform"], string][]}
          onChange={(phTransform) => set({ phTransform })} />
        <p className="hint-block">
          Grambsch-Therneau test of the scaled Schoenfeld residuals against
          this function of time, per covariate and for the whole model.
        </p>
      </Section>
      <Section title="Adjusted survival curves">
        <Select label="One curve per" value={options.curvesBy}
          options={[["", "None: the average subject"], ...model.covariates
            .map((n) => [n, n] as const)]}
          onChange={(curvesBy) => set({ curvesBy })} />
        {others.length > 0 && (
          <>
            <p className="hint-block">
              Other covariates are held at these values (blank = their mean;
              for a categorical one, a level).
            </p>
            {others.map((n) => (
              <TextNum key={n} label={n} value={options.curvesFixed[n] ?? ""} placeholder="mean"
                onChange={(v) => set({ curvesFixed: { ...options.curvesFixed, [n]: v } })} />
            ))}
          </>
        )}
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------ results */

const TEST_ROWS: [keyof CoxResult["tests"], string][] = [
  ["likelihood_ratio", "Likelihood ratio test"],
  ["wald", "Wald test"],
  ["score", "Score (log-rank) test"],
];

export function CoxResults({ result }: ResultsProps<CoxOptions, CoxResult>) {
  if (!result) return null;
  if (result.error) return <Problem error={result.error} />;
  const level = result.ci_level_used ?? 0.95;
  const profile = result.ci_method_used === "profile";
  const multiDf = result.term_tests.some((t) => t.df > 1);
  const phBad = result.ph_test.terms.some((t) => t.p < 0.05) || result.ph_test.global.p < 0.05;
  return (
    <Card title="Cox proportional hazards regression" className="cox-results">
      <p className="hint-block">
        {result.n} subjects, {result.n_events} events
        {result.n_excluded ? `; ${result.n_excluded} rows with a missing value were left out` : ""}.
        {result.strata_used ? ` Stratified by ${result.strata_used}.` : ""}
        {" "}Ties: {TIES_LABELS[result.ties] ?? result.ties}.
      </p>
      <h4>Hazard ratios</h4>
      <Grid caption="Coefficients and hazard ratios"
        head={["Covariate", "β", "SE", "z", "P value", "", "Hazard ratio",
          `${levelPct(level)} CI (${profile ? "profile" : "Wald"})`]}
        rows={result.coefficients.map((c) => [
          coefficientLabel(c), f(c.coef), f(c.se), f(c.z), fmtP(c.p), stars(c.p),
          f(c.hazard_ratio),
          ci(profile ? c.hazard_ratio_ci_profile ?? c.hazard_ratio_ci : c.hazard_ratio_ci),
        ])} />
      <p className="hint-block">
        A hazard ratio above 1 means a higher event rate: per unit of a
        continuous covariate, or for a level against the reference level.
      </p>
      {multiDf && (
        <>
          <h4>Each covariate (Wald test)</h4>
          <Grid caption="Wald test per covariate" head={["Covariate", "χ²", "df", "P value", ""]}
            rows={result.term_tests.map((t) => [t.term, f(t.chi2), String(t.df), fmtP(t.p), stars(t.p)])} />
        </>
      )}
      <div className="stat-cols">
        <KV title="Whole model (vs no covariates)" rows={[
          ...TEST_ROWS.map(([k, label]): [string, string] => [label,
            `χ² = ${f(result.tests[k].chi2)}, df = ${result.tests[k].df}, P ${
              result.tests[k].p < 0.0001 ? "< 0.0001" : `= ${fmtP(result.tests[k].p)}`}`]),
          ["Log partial likelihood", `${f(result.loglik)} (null ${f(result.loglik_null)})`],
          ["AIC", f(result.aic)],
        ]} />
        <KV title="Discrimination" rows={[
          ["Concordance (Harrell's C)", f(result.concordance.c)],
          ["SE of C", f(result.concordance.se)],
        ]} />
      </div>
      <h4>Proportional-hazards test ({PH_TRANSFORM_LABELS[result.ph_test.transform] ?? result.ph_test.transform} time scale)</h4>
      <Grid caption="Proportional hazards test" head={["Covariate", "χ²", "df", "P value"]}
        rows={[
          ...result.ph_test.terms.map((t) => [t.term, f(t.chi2), String(t.df), fmtP(t.p)]),
          ["Global", f(result.ph_test.global.chi2), String(result.ph_test.global.df),
            fmtP(result.ph_test.global.p)],
        ]} />
      <p className={`clin-reading ${phBad ? "clin-bad" : "clin-good"}`}>{phReading(result)}</p>
      {!result.converged && <Note warn>The fit did not converge; treat the estimates with caution.</Note>}
      {result.warnings?.length > 0 && (
        <Note warn>{result.warnings.map((w, i) => <span key={i}>{w}{i < result.warnings.length - 1 ? " " : ""}</span>)}</Note>
      )}
    </Card>
  );
}

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("")
  : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export function CoxMethods({ result }: ResultsProps<CoxOptions, CoxResult>) {
  if (!result || result.error) return null;
  const level = result.ci_level_used ?? 0.95;
  const cats = result.terms.filter((t) => t.kind === "categorical");
  const hrs = result.coefficients.map((c) => `${coefficientLabel(c)}: HR ${f(c.hazard_ratio)} `
    + `(${levelPct(level)} CI ${ci(result.ci_method_used === "profile"
      ? c.hazard_ratio_ci_profile ?? c.hazard_ratio_ci : c.hazard_ratio_ci)}), P ${
      c.p < 0.0001 ? "< 0.0001" : `= ${fmtP(c.p)}`}`);
  const g = result.ph_test.global;
  const text = `Survival was analysed by Cox proportional-hazards regression (maximum partial `
    + `likelihood, ${result.ties === "efron" ? "Efron's" : result.ties === "breslow" ? "Breslow's" : "the exact"} `
    + `method for tied event times) with ${list(result.covariates_used ?? result.terms.map((t) => t.name))} `
    + `as covariates`
    + (cats.length ? ` (categorical: ${cats.map((t) => `${t.name}, reference ${t.reference ?? "first level"}`).join("; ")})` : "")
    + (result.strata_used ? `, stratified by ${result.strata_used}` : "")
    + `, using ${SOFTWARE}; ${result.n} subjects and ${result.n_events} events were analysed`
    + (result.n_excluded ? ` (${result.n_excluded} with missing values excluded)` : "")
    + `. Hazard ratios are reported with ${levelPct(level)} ${result.ci_method_used === "profile"
      ? "profile-likelihood" : "Wald"} confidence intervals. The proportional-hazards assumption `
    + `was checked with the Grambsch-Therneau test of scaled Schoenfeld residuals `
    + `(${PH_TRANSFORM_LABELS[result.ph_test.transform]?.replace(" (default)", "") ?? result.ph_test.transform} time scale; `
    + `global χ² = ${f(g.chi2)}, df = ${g.df}, P = ${fmtP(g.p)}). Likelihood ratio test of the model: `
    + `χ² = ${f(result.tests.likelihood_ratio.chi2)}, df = ${result.tests.likelihood_ratio.df}, `
    + `P ${result.tests.likelihood_ratio.p < 0.0001 ? "< 0.0001" : `= ${fmtP(result.tests.likelihood_ratio.p)}`}; `
    + `concordance C = ${f(result.concordance.c)}. ${hrs.join("; ")}.`;
  return <CopyableMethods text={text} />;
}

/* ------------------------------------------------------------ graphs */

interface CoxGraphSettings { bands: boolean; term: string; scaled: boolean }

const sanitize = (raw: unknown): CoxGraphSettings => {
  const r = asRecord(raw);
  return {
    bands: r.bands !== false,
    term: typeof r.term === "string" ? r.term : "",
    scaled: r.scaled !== false,
  };
};

function pending(result: CoxResult | null) {
  if (!result) return <PlotMessage>Calculating…</PlotMessage>;
  if (result.error) return <PlotMessage>No graph: {result.error}</PlotMessage>;
  return null;
}

const DASHES = ["solid", "dash", "dot", "dashdot", "longdash"];

export function CoxCurvesPlot({ graph, table, options, result, titles, scheme, format,
  onFormatChange }: PlotProps<CoxOptions, CoxResult>) {
  const dark = useDark();
  const [s] = useGraphOptions(graph, "cox", sanitize);
  const fig = useMemo(() => {
    if (!result || result.error || !result.curves?.length) return null;
    const chrome = chromeFor(dark);
    const traces: Plotly.Data[] = [];
    const names = result.curves.map((c) => c.label);
    result.curves.forEach((c, i) => {
      const st = seriesStyle(i, dark, scheme);
      c.strata.forEach((sc, k) => {
        const label = c.strata.length > 1 ? `${c.label}, ${sc.stratum}` : c.label;
        if (s.bands && sc.lower && sc.upper) {
          const lo = sc.lower.map((v) => (v == null ? null : 100 * v));
          const hi = sc.upper.map((v) => (v == null ? null : 100 * v));
          traces.push(tagTrace({ x: sc.time, y: hi, mode: "lines", line: { width: 0, shape: "hv" },
            hoverinfo: "skip", showlegend: false }, { ds: i, role: "decor" }) as Plotly.Data);
          traces.push(tagTrace({ x: sc.time, y: lo, mode: "lines", line: { width: 0, shape: "hv" },
            fill: "tonexty", fillcolor: `${st.color}22`, hoverinfo: "skip", showlegend: false },
          { ds: i, role: "band" }) as Plotly.Data);
        }
        traces.push(tagTrace({
          x: sc.time, y: sc.survival.map((v) => 100 * v), mode: "lines", name: label,
          line: { color: st.color, width: 2, shape: "hv",
            dash: c.strata.length > 1 ? DASHES[k % DASHES.length] : st.dash },
          hovertemplate: `${label}<br>t = %{x}: %{y:.1f}%<extra></extra>`,
        }, { ds: i, role: "line" }) as Plotly.Data);
      });
    });
    const layout = baseLayout(chrome, titles.x || "Time", titles.y || "Adjusted percent survival", {
      showlegend: true,
      legend: { orientation: "h", y: 1.02, yanchor: "bottom", x: 0, font: { color: chrome.ink } },
    });
    layout.yaxis = { ...layout.yaxis, range: [0, 105] };
    return { traces, layout, names };
  }, [result, dark, scheme, s.bands, titles]);
  void table; void options;
  const wait = pending(result);
  if (wait) return wait;
  if (!fig) return <PlotMessage>No curves to draw.</PlotMessage>;
  return <PlotlyChart data={fig.traces} layout={fig.layout} filename="cox-adjusted-survival"
    label="Adjusted survival curves from the Cox model" format={format}
    onFormatChange={onFormatChange} dark={dark} scheme={scheme} names={fig.names} />;
}

export function CoxCurvesOptions({ graph }: GraphOptionsProps) {
  const [s, set] = useGraphOptions(graph, "cox", sanitize);
  return (
    <OptCheck label="Confidence bands" checked={s.bands} onChange={(bands) => set({ bands })} />
  );
}

export function CoxForestPlot({ result, titles, scheme, format, onFormatChange }:
  PlotProps<CoxOptions, CoxResult>) {
  const dark = useDark();
  const fig = useMemo(() => {
    if (!result || result.error || !result.coefficients?.length) return null;
    const chrome = chromeFor(dark);
    const level = result.ci_level_used ?? 0.95;
    const profile = result.ci_method_used === "profile";
    const rows = result.coefficients.map((c: CoxCoefficient) => {
      const band = profile ? c.hazard_ratio_ci_profile ?? c.hazard_ratio_ci : c.hazard_ratio_ci;
      return { name: coefficientLabel(c), hr: c.hazard_ratio, lo: band[0], hi: band[1], p: c.p };
    });
    const traces: Plotly.Data[] = [{
      x: rows.map((r) => r.hr), y: rows.map((r) => r.name), type: "scatter", mode: "markers",
      marker: { color: chrome.ink, symbol: "square", size: 10 },
      error_x: {
        type: "data", symmetric: false, color: chrome.ink, thickness: 1.5, width: 6,
        array: rows.map((r) => (r.hi == null ? 0 : r.hi - r.hr)),
        arrayminus: rows.map((r) => (r.lo == null ? 0 : r.hr - r.lo)),
      },
      hovertext: rows.map((r) => `${r.name}: HR ${f(r.hr)} (${levelPct(level)} CI ${f(r.lo)} to ${
        r.hi == null ? "−" : f(r.hi)}), P = ${fmtP(r.p)}`),
      hoverinfo: "text",
    } as Plotly.Data];
    const layout = baseLayout(chrome, titles.x || `Hazard ratio (${levelPct(level)} CI)`, titles.y, {
      showlegend: false,
      margin: { l: 140, r: 24, t: 12, b: 52 },
      shapes: [{ type: "line", xref: "x", yref: "paper", x0: 1, x1: 1, y0: 0, y1: 1,
        line: { color: chrome.muted, width: 1.5, dash: "dash" } }],
    });
    layout.xaxis = { ...layout.xaxis, type: "log" };
    layout.yaxis = { ...layout.yaxis, autorange: "reversed", showgrid: false,
      tickfont: { color: chrome.ink } };
    return { traces, layout };
  }, [result, dark, titles]);
  const wait = pending(result);
  if (wait) return wait;
  if (!fig) return <PlotMessage>No coefficients to show.</PlotMessage>;
  return <PlotlyChart data={fig.traces} layout={fig.layout} filename="hazard-ratios"
    label="Hazard ratios with confidence intervals (log scale)" format={format}
    onFormatChange={onFormatChange} dark={dark} scheme={scheme} />;
}

const SCHOEN_NAMES = ["Residuals"];

export function CoxSchoenfeldPlot({ graph, result, titles, scheme, format, onFormatChange }:
  PlotProps<CoxOptions, CoxResult>) {
  const dark = useDark();
  const [s] = useGraphOptions(graph, "cox", sanitize);
  const fig = useMemo(() => {
    const sch = result && !result.error ? result.schoenfeld : null;
    if (!sch?.columns?.length || !sch.time?.length) return null;
    const j = Math.max(0, sch.columns.indexOf(s.term));
    const col = sch.columns[j];
    const chrome = chromeFor(dark);
    const st = seriesStyle(0, dark, scheme);
    const vals = (s.scaled ? sch.scaled : sch.residuals).map((r) => r[j]);
    const xs = sch.time;
    const tx = sch.transformed_time;
    const smooth = lowess(tx, vals);
    const order = xs.map((_, i) => i).sort((a, b) => tx[a] - tx[b] || xs[a] - xs[b]);
    const coef = result!.coefficients.find((c) => c.name === col)?.coef;
    const logX = result!.ph_test.transform === "log";
    const traces: Plotly.Data[] = [
      tagTrace({ x: xs, y: vals, mode: "markers", type: "scatter", name: "Residuals",
        marker: { color: `${st.color}99`, size: 7, symbol: st.symbol,
          line: { color: chrome.surface, width: 1 } },
        hovertemplate: `t = %{x}<br>residual %{y:.3g}<extra></extra>` },
      { ds: 0, role: "points" }) as Plotly.Data,
      tagTrace({ x: order.map((i) => xs[i]), y: order.map((i) => smooth[i]), mode: "lines",
        name: "Smooth (LOWESS)", line: { color: st.color, width: 2.5 },
        hovertemplate: `t = %{x}<br>smooth %{y:.3g}<extra></extra>` },
      { ds: 0, role: "fit" }) as Plotly.Data,
    ];
    const shapes: Partial<Plotly.Shape>[] = [];
    if (s.scaled && typeof coef === "number") {
      shapes.push({ type: "line", xref: "paper", yref: "y", x0: 0, x1: 1, y0: coef, y1: coef,
        line: { color: chrome.muted, width: 1.5, dash: "dash" } });
    }
    const termTest = result!.ph_test.terms.find((t) => col === t.term || col.startsWith(`${t.term}[`));
    const layout = baseLayout(chrome, titles.x || "Time",
      titles.y || `${s.scaled ? "Scaled Schoenfeld residual" : "Schoenfeld residual"}: ${col}`, {
        showlegend: false, shapes,
        annotations: termTest ? [{ x: 1, y: 1, xref: "paper", yref: "paper", xanchor: "right",
          yanchor: "top", showarrow: false, font: { color: chrome.inkSecondary, size: 12 },
          text: `PH test ${termTest.term}: P = ${fmtP(termTest.p)}` }] : [],
      });
    if (logX) layout.xaxis = { ...layout.xaxis, type: "log" };
    return { traces, layout };
  }, [result, dark, scheme, s.term, s.scaled, titles]);
  const wait = pending(result);
  if (wait) return wait;
  if (!fig) return <PlotMessage>No residuals to draw (the model needs events).</PlotMessage>;
  return <PlotlyChart data={fig.traces} layout={fig.layout} filename="schoenfeld-residuals"
    label="Schoenfeld residuals against time with a LOWESS smooth" format={format}
    onFormatChange={onFormatChange} dark={dark} scheme={scheme} names={SCHOEN_NAMES} />;
}

export function CoxSchoenfeldOptions({ graph, result }: GraphOptionsProps<CoxOptions, CoxResult>) {
  const [s, set] = useGraphOptions(graph, "cox", sanitize);
  const cols = result && !result.error ? result.schoenfeld?.columns ?? [] : [];
  return (
    <>
      <OptSelect label="Covariate" value={cols.includes(s.term) ? s.term : cols[0] ?? ""}
        options={cols.map((c) => [c, c] as const)} onChange={(term) => set({ term })} />
      <OptCheck label="Scaled residuals (smooth ≈ β(t); dashed line = β)" checked={s.scaled}
        onChange={(scaled) => set({ scaled })} />
    </>
  );
}
