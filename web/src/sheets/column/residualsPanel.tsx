// The "Residuals" section of a t test or ANOVA result: a normal QQ plot of
// the standardized residuals with the y = x line, residuals against the
// fitted values with a zero line, each with one sentence on what to look
// for, the Shapiro-Wilk test as a secondary line and the engine's
// n-dependent advice (engine residuals_column, residuals.py). It replaces
// "trust the normality P" with "look at the residuals" (need
// `assumption-checks-residuals`; GraphPad statistics guide, "Don't automate
// the decision to use a nonparametric test").
// data.kind "fit" (a curve fit or linear regression, residuals.fit_residuals)
// adds residuals against X; data.kind "model" (two-way, three-way,
// repeated-measures, nested and mixed models, residuals.model_residuals)
// names its fitted value in data.fitted_label. Both appear in the Checks
// row (components/ResultsChecks.tsx), titled by data set.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type Plotly from "plotly.js-dist-min";
import { plotlyNow } from "../../lib/plotly";
import { PlotStatus } from "../../graph/PlotStatus";
import { usePlotLoad } from "../../graph/usePlotLoad";
import { useDarkMode } from "../../graph/useDarkMode";
import { CHROME_DARK, CHROME_LIGHT, PLOT_FONT, seriesStyle } from "../../lib/palette";
import { pLabel } from "../../report/pformat";
import { formatSig } from "../../types";
import "./residuals.css";
import { residualCaptions, rowsFromOne } from "./residualsText";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

const NORMALITY_GUIDE ="https://www.graphpad.com/guides/prism/latest/statistics/using_a_normality_test_to_choo.htm";

/** One small Plotly chart (no graph-format layer: a diagnostic, not a figure). */
function DiagnosticPlot({ traces, layout, label, testId }: {
  traces: Plotly.Data[]; layout: Partial<Plotly.Layout>; label: string; testId: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const { load, attempt, drawn, draw, retry } = usePlotLoad();
  useEffect(() => {
    const div = el.current;
    if (!div) return;
    void draw((P) => P.react(div, traces, layout, {
      responsive: true, displaylogo: false, displayModeBar: false, staticPlot: false,
    }));
  }, [traces, layout, draw, attempt]);
  useEffect(() => {
    const div = el.current;
    return () => { if (div) plotlyNow()?.purge(div); };
  }, []);
  return (
    <div className="plot-holder">
      <div className="resid-plot" ref={el} role="img" aria-label={label} data-plot={testId} />
      {!drawn && <PlotStatus load={load} onRetry={retry} />}
    </div>
  );
}

function axis(chrome: typeof CHROME_LIGHT, title: string): Partial<Plotly.LayoutAxis> {
  return {
    title: { text: title, font: { size: 12, color: chrome.inkSecondary } },
    gridcolor: chrome.grid, zeroline: false, linecolor: chrome.axis, tickcolor: chrome.axis,
    tickfont: { color: chrome.muted, size: 11 }, automargin: true,
  };
}

export default function ResidualsSection({ data, title }: { data: R | null | undefined; title?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const dark = useDarkMode();
  const ok = !!data && !data.unavailable && Array.isArray(data.points);
  const paired = !!data?.paired;
  const text = residualCaptions(data ?? {});
  const fit = data?.kind === "fit";

  const figs = useMemo(() => {
    if (!ok) return null;
    const chrome = dark ? CHROME_DARK : CHROME_LIGHT;
    const pts = (data!.points as R[]);
    const groups = (data!.groups as R[] | undefined) ?? [];
    const names = groups.length ? groups.map((g) => String(g.group))
      : [...new Set(pts.map((p) => String(p.group)))];
    const qq = pts.filter((p) => typeof p.theoretical === "number" && typeof p.standardized === "number");
    const traceFor = (gi: number, xs: number[], ys: number[], hover: string[]): Plotly.Data => {
      const st = seriesStyle(gi, dark);
      return { type: "scatter", mode: "markers", x: xs, y: ys, text: hover, name: names[gi] ?? `Group ${gi + 1}`,
        marker: { color: st.color, symbol: st.symbol, size: 8, line: { width: 1, color: chrome.surface } },
        hovertemplate: "%{text}<br>x %{x:.3g}, y %{y:.3g}<extra></extra>" } as Plotly.Data;
    };
    const byGroup = (list: R[], x: (p: R) => number, y: (p: R) => number) => names.map((_, gi) => {
      const g = list.filter((p) => (typeof p.group_index === "number" ? p.group_index : names.indexOf(String(p.group))) === gi);
      return traceFor(gi, g.map(x), g.map(y), g.map((p) => (typeof p.label === "string" ? p.label
        : fit ? `X ${formatSig(p.x)}, Y ${formatSig(p.value)}`
        : `${p.group}, ${paired ? "pair" : "value"} ${Number(p.index) + 1}: ${formatSig(p.value)}`)));
    }).filter((t) => ((t as { x: number[] }).x).length > 0);
    // QQ: theoretical normal quantile vs. standardized residual, y = x
    const tq = qq.map((p) => p.theoretical as number);
    // A loop, not Math.min(...values): spreading 100,000 values overflows the stack.
    let lo = -2, hi = 2;
    for (const v of [...tq, ...qq.map((p) => p.standardized as number)]) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const line = (x0: number, y0: number, x1: number, y1: number): Partial<Plotly.Shape> => ({
      type: "line", x0, y0, x1, y1, layer: "below",
      line: { color: chrome.muted, width: 1.25, dash: "dash" } });
    const base = (h: number): Partial<Plotly.Layout> => ({
      paper_bgcolor: chrome.surface, plot_bgcolor: chrome.surface, height: h,
      font: { family: PLOT_FONT, color: chrome.inkSecondary, size: 12 },
      margin: { l: 56, r: 12, t: 8, b: 48 }, showlegend: names.length > 1 && names.length <= 12,
      legend: { orientation: "h", y: -0.3, font: { size: 11 } },
    });
    const qqLayout: Partial<Plotly.Layout> = { ...base(300),
      xaxis: axis(chrome, "Theoretical normal quantile"),
      yaxis: axis(chrome, "Standardized residual"),
      shapes: [line(lo, lo, hi, hi)] };
    const qqTraces = byGroup(qq, (p) => p.theoretical, (p) => p.standardized);
    // Residual vs. fitted (paired: residual by pair, the fitted value is
    // the one mean difference)
    const all = pts.filter((p) => typeof p.residual === "number");
    const rvTraces = paired
      ? byGroup(all, (p) => Number(p.index) + 1, (p) => p.residual)
      : byGroup(all, (p) => p.fitted, (p) => p.residual);
    const zero: Partial<Plotly.Shape>[] = [{ type: "line", xref: "paper", x0: 0, x1: 1, y0: 0, y1: 0,
      layer: "below", line: { color: chrome.muted, width: 1.25, dash: "dash" } }];
    const rvLayout: Partial<Plotly.Layout> = { ...base(300),
      xaxis: axis(chrome, text.fittedAxis), yaxis: axis(chrome, text.residualAxis), shapes: zero };
    // a fit's residuals against X as well: a curve along X is a wrong model
    const rxTraces = fit ? byGroup(all, (p) => p.x, (p) => p.residual) : null;
    const rxLayout: Partial<Plotly.Layout> = { ...base(300),
      xaxis: axis(chrome, typeof data!.x_label === "string" ? data!.x_label : "X"),
      yaxis: axis(chrome, text.residualAxis), shapes: zero };
    return { qqTraces, qqLayout, rvTraces, rvLayout, rxTraces, rxLayout };
  }, [ok, data, dark, paired, fit, text.fittedAxis, text.residualAxis]);

  if (!data) return null;
  const sw = data.shapiro as R | null | undefined;
  const advice = data.advice as R | undefined;
  // the QQ plot leads for tests on groups; a fit leads with residuals vs. X
  const qqFig = figs && (
    <figure className="resid-fig">
      <DiagnosticPlot traces={figs.qqTraces} layout={figs.qqLayout} testId="qq"
        label="Normal QQ plot of the standardized residuals, with the line y = x" />
      <figcaption><strong>QQ plot.</strong> {text.qq}</figcaption>
    </figure>
  );
  return (
    <div className="result-card residuals-card">
      <button type="button" className="resid-toggle" aria-expanded={open} aria-controls={id}
        onClick={() => setOpen((v) => !v)}>
        <span className="resid-caret" aria-hidden="true">{open ? "▾" : "▸"}</span>
        {title ? `Residuals of “${title}”` : text.toggle}
      </button>
      {!open && ok && <p className="hint-block resid-teaser">{text.teaser(Number(data.n_qq))}</p>}
      <div id={id} hidden={!open}>
        {open && data.unavailable && <p className="hint-block">{String(data.unavailable)}</p>}
        {open && ok && figs && (
          <>
            <p className="model-line">{String(data.note ?? "")}</p>
            <div className="resid-grid">
              {!fit && qqFig}
              {figs.rxTraces && (
                <figure className="resid-fig">
                  <DiagnosticPlot traces={figs.rxTraces} layout={figs.rxLayout} testId="resid-x"
                    label={`${text.residualAxis}s against X, with a zero line`} />
                  <figcaption><strong>Residuals vs. X.</strong> {text.againstX}</figcaption>
                </figure>
              )}
              <figure className="resid-fig">
                <DiagnosticPlot traces={figs.rvTraces} layout={figs.rvLayout} testId="resid-fitted"
                  label={text.fittedLabel} />
                <figcaption>
                  {paired ? (
                    <><strong>Residuals by pair.</strong> Each point is one pair&apos;s difference
                      minus the mean difference; look for a single pair far from zero or a
                      drift along the rows.</>
                  ) : (
                    <><strong>Residuals vs. fitted.</strong> {text.againstFitted}</>
                  )}
                </figcaption>
              </figure>
              {fit && qqFig}
            </div>
            <p className="model-line resid-shapiro">
              {sw ? `Shapiro-Wilk on the ${sw.n} ${fit ? "" : "pooled "}residuals: W = ${formatSig(sw.W, 4)}, ${pLabel(sw.p)} (${text.shapiroRole}).`
                : `Shapiro-Wilk: ${String(data.shapiro_note ?? "not computed")}`}
            </p>
            {advice?.text && (
              <p className="hint-block resid-advice">
                {String(advice.text)}{" "}
                <span className="source-line">
                  Source: {String(advice.source ?? "")}
                  {!fit && <>{" "}(<a href={NORMALITY_GUIDE} target="_blank" rel="noreferrer">GraphPad
                    statistics guide: don&apos;t automate the decision to use a nonparametric test</a>)</>}.
                </span>
              </p>
            )}
          </>
        )}
      </div>
      {/* shown open or closed: the Notes strip leaves them to this section */}
      {Array.isArray(data.warnings) && data.warnings.length > 0 && (
        <ul className="resid-warnings">
          {(data.warnings as string[]).map((w, i) => <li key={i}>{rowsFromOne(String(w))}</li>)}
        </ul>
      )}
    </div>
  );
}
