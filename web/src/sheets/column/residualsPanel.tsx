// The "Residuals" section of a t test or ANOVA result: a normal QQ plot of
// the standardized residuals with the y = x line, residuals against the
// fitted values with a zero line, each with one sentence on what to look
// for, the Shapiro-Wilk test as a secondary line and the engine's
// n-dependent advice (engine residuals_column, residuals.py). It replaces
// "trust the normality P" with "look at the residuals" (need
// `assumption-checks-residuals`; GraphPad statistics guide, "Don't automate
// the decision to use a nonparametric test").
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type Plotly from "plotly.js-dist-min";
import { loadPlotly, plotlyNow } from "../../lib/plotly";
import { useDarkMode } from "../../graph/useDarkMode";
import { CHROME_DARK, CHROME_LIGHT, PLOT_FONT, seriesStyle } from "../../lib/palette";
import { pLabel } from "../../report/pformat";
import { formatSig } from "../../types";
import "./residuals.css";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

const NORMALITY_GUIDE = "https://www.graphpad.com/guides/prism/latest/statistics/using_a_normality_test_to_choo.htm";

/** One small Plotly chart (no graph-format layer: a diagnostic, not a figure). */
function DiagnosticPlot({ traces, layout, label, testId }: {
  traces: Plotly.Data[]; layout: Partial<Plotly.Layout>; label: string; testId: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const div = el.current;
    if (!div) return;
    void loadPlotly().then((P) => P.react(div, traces, layout, {
      responsive: true, displaylogo: false, displayModeBar: false, staticPlot: false,
    }));
  }, [traces, layout]);
  useEffect(() => {
    const div = el.current;
    return () => { if (div) plotlyNow()?.purge(div); };
  }, []);
  return <div className="resid-plot" ref={el} role="img" aria-label={label} data-plot={testId} />;
}

function axis(chrome: typeof CHROME_LIGHT, title: string): Partial<Plotly.LayoutAxis> {
  return {
    title: { text: title, font: { size: 12, color: chrome.inkSecondary } },
    gridcolor: chrome.grid, zeroline: false, linecolor: chrome.axis, tickcolor: chrome.axis,
    tickfont: { color: chrome.muted, size: 11 }, automargin: true,
  };
}

export default function ResidualsSection({ data }: { data: R | null | undefined }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const dark = useDarkMode();
  const ok = !!data && !data.unavailable && Array.isArray(data.points);
  const paired = !!data?.paired;

  const figs = useMemo(() => {
    if (!ok) return null;
    const chrome = dark ? CHROME_DARK : CHROME_LIGHT;
    const pts = (data!.points as R[]);
    const groups = (data!.groups as R[] | undefined) ?? [];
    const names = groups.length ? groups.map((g) => String(g.group))
      : [...new Set(pts.map((p) => String(p.group)))];
    const qq = pts.filter((p) => typeof p.theoretical === "number" && typeof p.standardized === "number");
    const traceFor = (gi: number, xs: number[], ys: number[], text: string[]): Plotly.Data => {
      const st = seriesStyle(gi, dark);
      return { type: "scatter", mode: "markers", x: xs, y: ys, text, name: names[gi] ?? `Group ${gi + 1}`,
        marker: { color: st.color, symbol: st.symbol, size: 8, line: { width: 1, color: chrome.surface } },
        hovertemplate: "%{text}<br>x %{x:.3g}, y %{y:.3g}<extra></extra>" } as Plotly.Data;
    };
    const byGroup = (list: R[], x: (p: R) => number, y: (p: R) => number) => names.map((_, gi) => {
      const g = list.filter((p) => (typeof p.group_index === "number" ? p.group_index : names.indexOf(String(p.group))) === gi);
      return traceFor(gi, g.map(x), g.map(y),
        g.map((p) => `${p.group}, ${paired ? "pair" : "value"} ${Number(p.index) + 1}: ${formatSig(p.value)}`));
    }).filter((t) => ((t as { x: number[] }).x).length > 0);
    // QQ: theoretical normal quantile vs. standardized residual, y = x
    const tq = qq.map((p) => p.theoretical as number);
    const lo = Math.min(-2, ...tq, ...qq.map((p) => p.standardized as number));
    const hi = Math.max(2, ...tq, ...qq.map((p) => p.standardized as number));
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
    const rvLayout: Partial<Plotly.Layout> = { ...base(300),
      xaxis: axis(chrome, paired ? "Pair (row)" : "Fitted value (group mean)"),
      yaxis: axis(chrome, "Residual"),
      shapes: [{ type: "line", xref: "paper", x0: 0, x1: 1, y0: 0, y1: 0, layer: "below",
        line: { color: chrome.muted, width: 1.25, dash: "dash" } }] };
    return { qqTraces, qqLayout, rvTraces, rvLayout };
  }, [ok, data, dark, paired]);

  if (!data) return null;
  const sw = data.shapiro as R | null | undefined;
  const advice = data.advice as R | undefined;
  return (
    <div className="result-card residuals-card">
      <button type="button" className="resid-toggle" aria-expanded={open} aria-controls={id}
        onClick={() => setOpen((v) => !v)}>
        <span className="resid-caret" aria-hidden="true">{open ? "▾" : "▸"}</span>
        Residuals: QQ plot and residuals vs. fitted
      </button>
      {!open && ok && (
        <p className="hint-block resid-teaser">
          Check the Gaussian assumption on the residuals ({data.n_qq} values) by eye before
          trusting a normality test.
        </p>
      )}
      <div id={id} hidden={!open}>
        {open && data.unavailable && <p className="hint-block">{String(data.unavailable)}</p>}
        {open && ok && figs && (
          <>
            <p className="model-line">{String(data.note ?? "")}</p>
            <div className="resid-grid">
              <figure className="resid-fig">
                <DiagnosticPlot traces={figs.qqTraces} layout={figs.qqLayout} testId="qq"
                  label="Normal QQ plot of the standardized residuals, with the line y = x" />
                <figcaption>
                  <strong>QQ plot.</strong> Points close to the dashed line support the
                  Gaussian assumption; a curved band means skew (try log values for
                  concentrations and ratios), and a few points far off the ends are
                  outliers or heavy tails.
                </figcaption>
              </figure>
              <figure className="resid-fig">
                <DiagnosticPlot traces={figs.rvTraces} layout={figs.rvLayout} testId="resid-fitted"
                  label={paired ? "Residuals of the paired differences by pair, with a zero line"
                    : "Residuals against fitted values (group means), with a zero line"} />
                <figcaption>
                  {paired ? (
                    <><strong>Residuals by pair.</strong> Each point is one pair&apos;s difference
                      minus the mean difference; look for a single pair far from zero or a
                      drift along the rows.</>
                  ) : (
                    <><strong>Residuals vs. fitted.</strong> Each column of points is one
                      group; spreads that grow with the group mean mean unequal SDs: use
                      Welch&apos;s test, or analyse log values, before switching to ranks.</>
                  )}
                </figcaption>
              </figure>
            </div>
            <p className="model-line resid-shapiro">
              {sw ? `Shapiro-Wilk on the ${sw.n} pooled residuals: W = ${formatSig(sw.W, 4)}, ${pLabel(sw.p)} (a supporting summary, not a gate between tests).`
                : `Shapiro-Wilk: ${String(data.shapiro_note ?? "not computed")}`}
            </p>
            {advice?.text && (
              <p className="hint-block resid-advice">
                {String(advice.text)}{" "}
                <span className="source-line">
                  Source: {String(advice.source ?? "")}{" "}
                  (<a href={NORMALITY_GUIDE} target="_blank" rel="noreferrer">GraphPad
                    statistics guide: don&apos;t automate the decision to use a nonparametric test</a>).
                </span>
              </p>
            )}
            {Array.isArray(data.warnings) && data.warnings.length > 0 && (
              <ul className="resid-warnings">
                {(data.warnings as string[]).map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
