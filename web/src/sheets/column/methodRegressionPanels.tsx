// Method-comparison regression (P-42): controls, results, methods text and
// the graph (the pairs, the Passing-Bablok line and the line of identity).
import { useMemo } from "react";
import type Plotly from "plotly.js-dist-min";
import { tagTrace } from "../../graph";
import { seriesStyle } from "../../lib/palette";
import { formatSig } from "../../types";
import { Card, Field, Grid, KV, Note, Problem, Section, SOFTWARE, TextNum } from "../common/clinicalKit";
import CopyableMethods from "../common/CopyableMethods";
import { levelPct, pLabel } from "../common/statFormat";
import { baseLayout, chromeFor, useDark } from "../multivariable/chart";
import { PlotMessage, PlotlyChart } from "../multivariable/plotkit";
import type { ControlsProps, PlotProps, ResultsProps } from "../types";
import { maxOf, minOf } from "../../lib/extent";
import { cccCaveat, cccRows } from "../common/ccc";
import {
  identityReading, lineOver, type Estimate, type MethodComparison, type MethodRegOptions,
  type MethodRegResult, type PbFit,
} from "./methodRegression";

const f = (v: number | null | undefined) => formatSig(v ?? null);
const ciTxt = (c: [number, number] | null | undefined) => (c ? `${f(c[0])} to ${f(c[1])}` : "n/a");

/* ------------------------------------------------------------ controls */

export function MethodRegControls({ table, options, onChange }: ControlsProps<MethodRegOptions>) {
  const set = (p: Partial<MethodRegOptions>) => onChange({ ...options, ...p });
  const pick = (label: string, key: "datasetA" | "datasetB") => (
    <Field label={label}>
      <select aria-label={label} value={options[key]} onChange={(e) => set({ [key]: Number(e.target.value) })}>
        {table.datasets.map((d, i) => <option key={i} value={i}>{d.name || `Data set ${i + 1}`}</option>)}
      </select>
    </Field>
  );
  return (
    <div className="controls">
      <Section title="Passing-Bablok regression">
        <p className="hint-block">
          Compares two methods that measure the same quantity without assuming normal errors or
          a known ratio of their error variances, and is robust to outliers (Passing &amp; Bablok
          1983). Theil-Sen (Sen 1968) and Deming regression with equal error variances are fitted
          to the same pairs for comparison.
        </p>
      </Section>
      <Section title="Methods to compare">
        {table.type === "xy" ? (
          <p className="hint-block">
            X holds method 1; each data set is method 2 and is compared with X separately.
            Replicates pair with their row&apos;s X.
          </p>
        ) : (
          <>
            {pick("Method 1 (X)", "datasetA")}
            {pick("Method 2 (Y)", "datasetB")}
            <p className="hint-block">Each row is one sample measured by both methods; rows missing either value are skipped.</p>
          </>
        )}
      </Section>
      <Section title="Output">
        <TextNum label="Confidence level (%)" value={options.ciLevel} onChange={(ciLevel) => set({ ciLevel })} />
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------ results */

function estCells(e: Estimate | undefined, withCi = true): string[] {
  if (!e) return ["n/a", "n/a"];
  return [f(e.value), withCi ? ciTxt(e.ci) : "not defined"];
}

function fitRows(c: MethodComparison): string[][] {
  const row = (label: string, fit: { error?: string; slope: Estimate; intercept: Estimate },
    interceptCi = true) => (fit.error
    ? [label, "n/a", "n/a", "n/a", "n/a"]
    : [label, ...estCells(fit.slope), ...estCells(fit.intercept, interceptCi)]);
  return [
    row("Passing-Bablok", c.passing_bablok),
    row("Theil-Sen", c.theil_sen, false),
    row("Deming (equal error variances)", c.deming),
  ];
}

function cusumText(fit: PbFit): string {
  const c = fit.cusum;
  if (c.H == null || c.p == null) return c.unavailable ?? "not computed";
  return `H = ${f(c.H)}, ${pLabel(c.p)}: ${c.linear ? "no significant deviation from linearity"
    : "the relation is not linear"}`;
}

function Comparison({ c, lvl }: { c: MethodComparison; lvl: string }) {
  const pb = c.passing_bablok;
  const errors = [["Passing-Bablok", pb.error], ["Theil-Sen", c.theil_sen.error],
    ["Deming", c.deming.error]].filter(([, e]) => e) as [string, string][];
  return (
    <Card title={`Passing-Bablok regression: ${c.name} vs ${c.x_name}`}>
      <p className="hint-block">{c.n} pairs; {c.name} (Y) on {c.x_name} (X).</p>
      <Grid caption={`Regression lines of ${c.name} on ${c.x_name}`}
        head={["Method", "Slope", `${lvl} CI of the slope`, "Intercept", `${lvl} CI of the intercept`]}
        rows={fitRows(c)} />
      {errors.map(([m, e]) => <Problem key={m} error={`${m}: ${e}.`} />)}
      {c.ccc && (
        <>
          <KV className="kv-wide" rows={cccRows(c.ccc)} />
          {cccCaveat(c.ccc) && <p className="hint-block">{cccCaveat(c.ccc)}</p>}
        </>
      )}
      {!pb.error && (
        <>
          <KV className="kv-wide" title="Assumptions of Passing-Bablok regression" rows={[
            ["Kendall's tau (positive correlation)", `${f(pb.kendall.tau)} (${pLabel(pb.kendall.p)})`],
            ["Linearity (CUSUM test)", cusumText(pb)],
          ]} />
          {pb.ci_note && <Note warn>No confidence intervals: {pb.ci_note}.</Note>}
          {pb.kendall.p >= 0.05 && (
            <Note warn>Kendall&apos;s tau is not significantly positive ({pLabel(pb.kendall.p)}). Passing &amp; Bablok
              (1983) require a positive correlation: with this little evidence of one, the line may not describe the
              relation.</Note>
          )}
          {pb.cusum.linear === false && (
            <Note warn>The CUSUM test rejects linearity ({pLabel(pb.cusum.p)}): the residuals are not randomly
              arranged along the line, so a straight line does not describe the relation (Passing &amp; Bablok 1983).</Note>
          )}
          {identityReading(pb) && <p className="hint-block">{identityReading(pb)}</p>}
        </>
      )}
      <p className="hint-block">
        CUSUM: H = max |cumulative sum| / √(points below the line + 1), compared with the
        Kolmogorov-Smirnov distribution (5% critical value 1.36; P from its asymptotic tail).
        Theil-Sen has no CI of the intercept (median(Y) − slope × median(X); Conover 1980).
      </p>
    </Card>
  );
}

export function MethodRegResults({ result }: ResultsProps<MethodRegOptions, MethodRegResult>) {
  if (!result) return null;
  if (result.error) return <Problem error={result.error} />;
  const lvl = levelPct(result.ci_level);
  return <div className="results">{result.comparisons.map((c, i) => <Comparison key={i} c={c} lvl={lvl} />)}</div>;
}

export function MethodRegMethods({ result }: ResultsProps<MethodRegOptions, MethodRegResult>) {
  if (!result || result.error) return null;
  const lvl = levelPct(result.ci_level);
  const each = result.comparisons.filter((c) => !c.passing_bablok.error).map((c) => {
    const pb = c.passing_bablok;
    return `${c.name} on ${c.x_name} (${c.n} pairs): slope ${f(pb.slope.value)} (${lvl} CI ${ciTxt(pb.slope.ci)}), `
      + `intercept ${f(pb.intercept.value)} (${lvl} CI ${ciTxt(pb.intercept.ci)})`
      + (pb.cusum.H != null ? `, CUSUM test of linearity H = ${f(pb.cusum.H)} (${pLabel(pb.cusum.p)})` : "");
  });
  if (!each.length) return null;
  const text = "The methods were compared by Passing-Bablok regression (Passing & Bablok 1983), with "
    + "Kendall's tau to check the positive correlation it assumes and the CUSUM test of linearity, "
    + `using ${SOFTWARE}. ${each.join("; ")}. Theil-Sen regression (Sen 1968) and Deming regression with `
    + "equal error variances were fitted to the same pairs for comparison.";
  return <CopyableMethods text={text} />;
}

/* ------------------------------------------------------------ graph */

export function MethodRegPlot({ result, titles, scheme, format, onFormatChange }:
  PlotProps<MethodRegOptions, MethodRegResult>) {
  const dark = useDark();
  const names = useMemo(() => result?.comparisons?.map((c) => c.name) ?? [], [result]);
  const fig = useMemo(() => {
    if (!result || result.error || !result.comparisons?.length) return null;
    const chrome = chromeFor(dark);
    const all = result.comparisons.flatMap((c) => [...c.points.x, ...c.points.y]);
    if (!all.length) return null;
    const lo = minOf(all);
    const hi = maxOf(all);
    const pad = (hi - lo) * 0.04 || 1;
    const traces: Plotly.Data[] = [
      tagTrace({ x: [lo - pad, hi + pad], y: [lo - pad, hi + pad], mode: "lines", name: "Line of identity",
        line: { color: chrome.inkSecondary, width: 1.2, dash: "dash" }, hoverinfo: "skip" },
      { ds: 0, role: "decor" }) as Plotly.Data,
    ];
    result.comparisons.forEach((c, i) => {
      const st = seriesStyle(i, dark, scheme);
      traces.push(tagTrace({ x: c.points.x, y: c.points.y, mode: "markers", type: "scatter", name: c.name,
        marker: { color: `${st.color}b3`, size: 8, symbol: st.symbol, line: { color: chrome.surface, width: 1 } },
        hovertemplate: `${c.x_name} %{x}<br>${c.name} %{y}<extra></extra>` }, { ds: i, role: "points" }) as Plotly.Data);
      const line = lineOver(c.passing_bablok, minOf(c.points.x), maxOf(c.points.x));
      if (line) {
        traces.push(tagTrace({ ...line, mode: "lines", name: `${c.name}: Passing-Bablok`,
          line: { color: st.color, width: 2 }, hoverinfo: "skip" }, { ds: i, role: "fit" }) as Plotly.Data);
      }
    });
    const first = result.comparisons[0];
    const layout = baseLayout(chrome, titles.x || first.x_name,
      titles.y || (result.comparisons.length === 1 ? first.name : "Method 2"), {
        showlegend: true, legend: { orientation: "h", y: -0.18, font: { color: chrome.ink, size: 12 } },
        margin: { l: 64, r: 16, t: 12, b: 84 },
      });
    return { traces, layout };
  }, [result, dark, scheme, titles]);
  if (!result) return <PlotMessage>Calculating…</PlotMessage>;
  if (result.error) return <PlotMessage>No graph: {result.error}</PlotMessage>;
  if (!fig) return <PlotMessage>No pairs to draw.</PlotMessage>;
  return <PlotlyChart data={fig.traces} layout={fig.layout} filename="passing-bablok"
    label="Method comparison: the pairs, the Passing-Bablok line and the line of identity"
    format={format} onFormatChange={onFormatChange} dark={dark} scheme={scheme} names={names} />;
}
