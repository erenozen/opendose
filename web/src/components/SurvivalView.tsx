import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type Plotly from "plotly.js-dist-min";
import { loadPlotly, plotlyNow } from "../lib/plotly";
import { graphPStyle } from "../graph/significance";
import { formatSig } from "../types";
import { pLabel } from "../report/pformat";
import {
  CHROME_DARK, CHROME_LIGHT, DEFAULT_SCHEME, isDarkMode, onThemeChange,
  seriesStyle, PLOT_FONT, type SchemeId,
} from "../lib/palette";
import {
  applyFormat, EMPTY_FORMAT, plotConfig, resultBlocks, riskSetsFromResult, tagTrace,
  usePlotEdits, type GraphFormat, type RiskSet,
} from "../graph";
import { survivalAt } from "../sheets/survival/graphSettings";
import { kmRowsFromEngine, kmTable, survivalGroups, type KmRow } from "../sheets/survival/kmTable";
import TableCopy from "../sheets/common/TableCopy";
import type { DataTableModel } from "../project/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface PlotProps {
  result: Record<string, any> | null;
  scheme?: SchemeId;
  xTitle?: string;
  yTitle?: string;
  /** Format Graph / Format Axes settings (graph/README.md). */
  format?: GraphFormat;
  onFormatChange?: (f: GraphFormat) => void;
  /** Follow-up times per group, for the number-at-risk table (computed
   *  from the result's curves when absent). */
  riskSets?: RiskSet[];
  /** Draw a tick where a subject was censored (needs `riskSets`). */
  censorMarks?: boolean;
  /** Vertical offset between curves in percentage points, so curves that
   *  overlap (all start at 100%) stay visible; 0 = none. */
  nudge?: number;
}


/** Kaplan-Meier curves (the graph). */
export function SurvivalPlot({
  result, scheme = DEFAULT_SCHEME,
  xTitle = "Time", yTitle = "Percent survival", format = EMPTY_FORMAT,
  onFormatChange, riskSets, censorMarks = false, nudge = 0,
}: PlotProps) {
  const el = useRef<HTMLDivElement>(null);
  const [dark, setDark] = useState(isDarkMode());
  const { rev, attach } = usePlotEdits(format, onFormatChange);

  useEffect(() => onThemeChange(() => setDark(isDarkMode())), []);

  // Redraw when the island or column is resized (splitter drag, the
  // card's resize handle); Plotly's own listener only covers the window.
  useEffect(() => {
    const div = el.current;
    if (!div) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        // Not while hidden (a Suspense fallback shows): Plotly refuses.
        if ((div as unknown as { _fullLayout?: unknown })._fullLayout
          && div.getClientRects().length) {
          plotlyNow()?.Plots.resize(div);
        }
      });
    });
    ro.observe(div);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, []);

  useEffect(() => {
    if (!el.current || !result || result.error || !result.curves) return;
    const chrome = dark ? CHROME_DARK : CHROME_LIGHT;
    const traces: Plotly.Data[] = [];
    const entries = Object.entries(result.curves);
    entries.forEach(([name, curve]: [string, any], i) => {
      const { color, dash } = seriesStyle(i, dark, scheme);
      const off = nudge ? ((entries.length - 1) / 2 - i) * nudge : 0;
      const set = censorMarks ? riskSets?.find((r) => r.name === name) : undefined;
      // With censor ticks, the curve runs on to the last subject followed
      // (a tick after the last event then sits on the line).
      let pts: any[] = curve.points;
      const last = pts[pts.length - 1];
      const lastCensor = set ? Math.max(-Infinity,
        ...set.times.filter((_, k) => set.events[k] === 0)) : -Infinity;
      if (last && lastCensor > last.time) pts = [...pts, { ...last, time: lastCensor }];
      const xs = pts.map((p: any) => p.time);
      const ys = pts.map((p: any) => p.survival * 100 + off);
      traces.push(tagTrace({
        x: xs, y: ys,
        mode: "lines",
        line: { color, width: 2, shape: "hv", dash },
        name,
        ...(off ? { customdata: pts.map((p: any) => p.survival * 100),
          hovertemplate: `${name}<br>t=%{x}: %{customdata:.1f}%<extra></extra>` }
          : { hovertemplate: `${name}<br>t=%{x}: %{y:.1f}%<extra></extra>` }),
      }, { ds: i, role: "line" }) as Plotly.Data);
      if (set) {
        const cx: number[] = [], cy: number[] = [];
        set.times.forEach((t, k) => {
          if (set.events[k] !== 0) return;
          const sv = survivalAt(curve.points, t);
          if (sv !== null) { cx.push(t); cy.push(sv * 100 + off); }
        });
        if (cx.length) {
          traces.push(tagTrace({
            x: cx, y: cy, mode: "markers", name: `${name} (censored)`, showlegend: false,
            marker: { color, symbol: "line-ns-open", size: 10, line: { color, width: 1.8 } },
            hovertemplate: `${name}<br>censored at t=%{x}<extra></extra>`,
          }, { ds: i, role: "outliers" }) as Plotly.Data);
        }
      }
    });
    const layout: Partial<Plotly.Layout> = {
      paper_bgcolor: chrome.surface,
      plot_bgcolor: chrome.surface,
      font: {
        family: PLOT_FONT,
        color: chrome.inkSecondary, size: 13,
      },
      margin: { l: 60, r: 16, t: 8, b: 48 },
      xaxis: {
        title: { text: xTitle, font: { color: chrome.inkSecondary } },
        gridcolor: chrome.grid, zeroline: false,
        linecolor: chrome.axis, tickfont: { color: chrome.muted },
      },
      yaxis: {
        title: { text: yTitle, font: { color: chrome.inkSecondary } },
        range: [0, 105], gridcolor: chrome.grid, zeroline: false,
        linecolor: chrome.axis, tickfont: { color: chrome.muted },
      },
      legend: { orientation: "h", y: 1.02, yanchor: "bottom", x: 0,
                font: { color: chrome.ink } },
      dragmode: "pan",
      uirevision: "keep",
    };
    const out = applyFormat(traces as never, layout, format, {
      dark, scheme, datasets: Object.keys(result.curves),
      riskSets: riskSets ?? riskSetsFromResult(result),
      results: resultBlocks(result, graphPStyle(format)), editRevision: rev,
    });
    const div = el.current;
    void loadPlotly().then((P) => P.react(div, out.traces as Plotly.Data[], out.layout, plotConfig(
      { responsive: true, scrollZoom: true, displaylogo: false,
        toImageButtonOptions: { format: "svg", filename: "survival" } },
      format, !!onFormatChange))).then(() => attach(div));
  }, [result, dark, scheme, xTitle, yTitle, format, rev, riskSets, onFormatChange, attach,
    censorMarks, nudge]);

  return <div className="plot" ref={el} />;
}

const fmt = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? formatSig(v) : "n/a");
const raw = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? String(v) : "");

/** "13 to not reached": a median's confidence interval. */
function medianCi(ci: any): string {
  if (!ci) return "n/a";
  const lo = typeof ci.lower === "number" ? formatSig(ci.lower) : "n/a";
  const hi = typeof ci.upper === "number" ? formatSig(ci.upper) : "not reached";
  return `${lo} to ${hi}`;
}

const KM_HEAD = ["Time", "At risk", "Events", "Censored", "Survival", "SE (Greenwood)",
  "Lower 95% CI (log-log)", "Upper 95% CI (log-log)"];
const KM_HEAD_LOG = ["Lower 95% CI (log)", "Upper 95% CI (log)"];

/** The Kaplan-Meier table of one group, with its own Copy / CSV. Rows
 *  with the log-band limits (the engine's table) get those columns too. */
function KmGroupTable({ name, rows }: { name: string; rows: KmRow[] }) {
  const withLog = rows.some((r) => r.lowerLog !== undefined);
  const head = withLog ? [...KM_HEAD, ...KM_HEAD_LOG] : KM_HEAD;
  const matrix = () => [head, ...rows.map((r) => [raw(r.time), String(r.atRisk), String(r.events),
    String(r.censored), raw(r.survival), raw(r.se), raw(r.lower), raw(r.upper),
    ...(withLog ? [raw(r.lowerLog), raw(r.upperLog)] : [])])];
  return (
    <div className="km-table">
      <h4>Kaplan-Meier table: {name}</h4>
      <TableCopy name={`Kaplan-Meier table ${name}`} matrix={matrix} />
      <table className="results-table">
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.time}>
              <th>{formatSig(r.time)}</th>
              <td>{r.atRisk}</td>
              <td>{r.events}</td>
              <td>{r.censored}</td>
              <td>{fmt(r.survival)}</td>
              <td>{fmt(r.se)}</td>
              <td>{fmt(r.lower)}</td>
              <td>{fmt(r.upper)}</td>
              {withLog && <td>{fmt(r.lowerLog)}</td>}
              {withLog && <td>{fmt(r.upperLog)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Kaplan-Meier table and curve comparison tests (the results sheet). */
export function SurvivalResults({ result, table, medianNotes, afterMedians, extras }: {
  result: Record<string, any> | null;
  /** The data, for the counts of the Kaplan-Meier tables. */
  table?: DataTableModel;
  /** Median cell text by group when the median is not reached
   *  ("not reached: 62% survived to day 60 (last follow-up)"). */
  medianNotes?: Record<string, string>;
  /** Shown under the medians (explanations, warnings). */
  afterMedians?: ReactNode;
  /** Shown after the log-rank tables, before the Kaplan-Meier tables
   *  (pairwise comparisons, survival at a time, RMST). */
  extras?: ReactNode;
}) {
  const groups = useMemo(() => (table ? survivalGroups(table) : []), [table]);
  if (!result) return null;
  if (result.error) {
    return <div className="results-error">
      Survival analysis failed: {String(result.error)}. Each dataset needs
      two subcolumns: time (Y1) and event code (Y2: 1 = event, 0 = censored).
    </div>;
  }
  const curves = Object.entries(result.curves ?? {}) as [string, any][];
  const lr = result.logrank;
  const level = (c: any) => `${Math.round(100 * (c?.median_ci?.level ?? 0.95))}%`;

  return (
      <div className="result-card">
        <h3>Kaplan-Meier survival analysis</h3>
        <table className="results-table">
          <thead>
            <tr><th>Group</th><th>n</th><th>Events</th><th>Censored</th>
              <th>Median survival</th><th>{level(curves[0]?.[1])} CI of the median (log-log)</th>
              <th>{level(curves[0]?.[1])} CI of the median (log, as R&apos;s survfit)</th></tr>
          </thead>
          <tbody>
            {curves.map(([name, c]) => (
              <tr key={name}>
                <th>{name}</th>
                <td>{c.n}</td>
                <td>{c.n_events}</td>
                <td>{c.n_censored}</td>
                <td>{c.median_survival != null
                  ? formatSig(c.median_survival) : medianNotes?.[name] ?? "not reached"}</td>
                <td>{c.median_survival != null ? medianCi(c.median_ci) : "n/a"}</td>
                <td>{c.median_survival != null ? medianCi(c.median_ci_log) : "n/a"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {afterMedians}
        {lr && (
          <table className="results-table goodness">
            <tbody>
              <tr>
                <th>Log-rank (Mantel-Cox), Peto form Σ(O−E)²/E</th>
                <td>χ² = {formatSig(lr.chi2_peto ?? lr.chi2)},
                  df {lr.df}, {pLabel(lr.p_peto ?? lr.p)}</td>
              </tr>
              {typeof lr.chi2_variance === "number" && (
                <tr>
                  <th>Log-rank, variance (Mantel-Haenszel) form, as R&apos;s survdiff</th>
                  <td>χ² = {formatSig(lr.chi2_variance)},
                    df {lr.df}, {pLabel(lr.p_variance)}</td>
                </tr>
              )}
              {result.gehan_breslow_wilcoxon && (
                <tr>
                  <th>Gehan-Breslow-Wilcoxon</th>
                  <td>χ² = {formatSig(result.gehan_breslow_wilcoxon.chi2)},{" "}
                    {pLabel(result.gehan_breslow_wilcoxon.p)}</td>
                </tr>
              )}
              {result.hazard_ratio && (
                <tr>
                  <th>Hazard ratio (Mantel-Haenszel)</th>
                  <td>{formatSig(result.hazard_ratio.value)}
                    {" "}(95% CI {formatSig(result.hazard_ratio.ci[0])} to{" "}
                    {formatSig(result.hazard_ratio.ci[1])})</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
        {lr && Array.isArray(lr.observed) && Array.isArray(lr.expected) && (
          <>
            <h4>Observed and expected events (log-rank)</h4>
            <table className="results-table">
              <thead><tr><th>Group</th><th>Observed (O)</th><th>Expected (E)</th><th>O / E</th></tr></thead>
              <tbody>
                {(Array.isArray(lr.group_names) ? lr.group_names as string[]
                  : curves.map(([name]) => name)).map((name, i) => (
                  <tr key={name}>
                    <th>{name}</th>
                    <td>{fmt(lr.observed[i])}</td>
                    <td>{fmt(lr.expected[i])}</td>
                    <td>{lr.expected[i] > 0 ? fmt(lr.observed[i] / lr.expected[i]) : "n/a"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="hint-block">
              Both log-rank statistics compare O with E. The Peto form adds up (O − E)² / E over
              the groups, a slightly conservative approximation; the variance form divides by the
              exact (hypergeometric) variance of O − E, as R&apos;s survdiff and the score test
              of a Cox model do. With well-balanced groups the two agree closely.
            </p>
          </>
        )}
        {extras}
        {curves.map(([name, c]) => {
          // the engine's table (event times, as R's summary.survfit), else
          // one built from the curve and the data (older engines)
          if (Array.isArray(c.table)) {
            return <KmGroupTable key={name} name={name} rows={kmRowsFromEngine(c.table)} />;
          }
          const g = groups.find((x) => x.name === name);
          if (!g || !Array.isArray(c.points)) return null;
          return <KmGroupTable key={name} name={name} rows={kmTable(g.times, g.events, c.points)} />;
        })}
        {curves.some(([, c]) => Array.isArray(c.table)) ? (
          <p className="hint-block">
            One row per event time: at risk counts the subjects followed up to that time or
            longer (just before it), censored those censored at it. Survival and its SE
            (Greenwood) change only at event times. The confidence limits use the log-log
            transform and, in the last two columns, the log transform of R&apos;s survfit.
          </p>
        ) : groups.length > 0 && (
          <p className="hint-block">
            Survival and its SE (Greenwood) change only at event times; at a time with
            censoring only, the estimate of the previous event time carries over. The
            confidence limits use the log-log transform; at risk counts the subjects followed
            up to that time or longer.
          </p>
        )}
      </div>
  );
}
