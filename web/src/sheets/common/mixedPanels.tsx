// The results panel, methods text, shared controls and the nested scatter
// of the two mixed models with a unit as a random intercept: the grouped
// table's nested two-way ANOVA (grouped/nestedTwoWay.ts) and the multiple-
// variables table's grouping-column model (multivariable/mixedGrouping.ts).
// The comparisons table with its family header is also used by the
// time-course module (assays/timecourse).
import { useMemo } from "react";
import type Plotly from "plotly.js-dist-min";
import { OptCheck } from "../../components/GraphOptionControls";
import { tagTrace } from "../../graph";
import FormattedPlot from "../../graph/FormattedPlot";
import { useDarkMode } from "../../graph/useDarkMode";
import { CHROME_DARK, CHROME_LIGHT, PLOT_FONT, seriesStyle } from "../../lib/palette";
import { formatSig } from "../../types";
import CopyableMethods from "./CopyableMethods";
import TableCopy from "./TableCopy";
import { asRecord, useGraphOptions } from "./graphOptions";
import {
  adjustedText, bracketX, CELL_GAP, cellX, factorsOf, iccSentence, MIXED_COMPARISON_LABELS,
  MIXED_SRC, mixedMethodsText, nestedBrackets, scopeLabel, SCOPES, UNIT_PRESETS, unitWords,
  type ComparisonScope, type MixedComparisons, type MixedUnitOptions, type Source, type UnitWords,
} from "./mixedModel";
import { fmtCI, fmtP, levelPct, stars } from "./statFormat";
import type { GraphOptionsProps, PlotProps, ResultsProps } from "../types";
import "./sheetKit.css";
import "./mixed.css";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const f = (v: unknown, d?: number) => (num(v) ? formatSig(v, d) : "n/a");
const raw = (v: unknown) => (num(v) ? String(v) : v == null ? "" : String(v));

/** A cited source: a link when it has a URL, else the reference in words. */
export function Cite({ src }: { src: Source }) {
  return src.url
    ? <a href={src.url} target="_blank" rel="noreferrer">{src.label}</a>
    : <cite>{src.label}</cite>;
}

export function Sources({ list }: { list: Source[] }) {
  return (
    <p className="hint-block mixed-method">
      Sources:{" "}
      {list.map((s, i) => <span key={s.label}>{i ? "; " : ""}<Cite src={s} /></span>)}.
    </p>
  );
}

// ------------------------------------------------------------ comparisons

/** A comparisons block of the engine (family_comparisons) as a table under
 *  its family header: what is compared, how P is adjusted, unadjusted and
 *  adjusted P side by side. */
export function FamilyComparisons({ block, what, name, ciLevel = 0.95, familyHead = "Within" }: {
  block: R | null | undefined; what: string; name: string; ciLevel?: number; familyHead?: string;
}) {
  if (!block || !Array.isArray(block.comparisons) || !block.comparisons.length) return null;
  const rows = block.comparisons as R[];
  const tukey = block.method === "tukey";
  const hasFamily = rows.some((c) => c.family);
  const famOf = (c: R) => String(c.family ?? "").replace(/^[^:]*: /, "").replace(/^Time /, "");
  const matrix = () => [
    [...(hasFamily ? [familyHead] : []), "Comparison", "Mean difference", "SE", "CI lower", "CI upper",
      tukey ? "q" : "t", "df", "P unadjusted", "P adjusted"],
    ...rows.map((c) => [...(hasFamily ? [famOf(c)] : []), String(c.pair), raw(c.difference), raw(c.se),
      raw(c.ci?.[0]), raw(c.ci?.[1]), raw(c.statistic), raw(c.df), raw(c.p_unadjusted), raw(c.p_adjusted)]),
  ];
  return (
    <section className="mixed-block" aria-label={name}>
      <h4>{name}</h4>
      <p className="mixed-family" role="note">
        {what}. P values {adjustedText(block)}.
      </p>
      <TableCopy name={name} matrix={matrix} />
      <div className="results-scroll">
        <table className="results-table">
          <caption className="sr-only">{name}</caption>
          <thead>
            <tr>
              {hasFamily && <th scope="col">{familyHead}</th>}
              <th scope="col">Comparison</th><th scope="col">Mean difference</th>
              <th scope="col">{levelPct(ciLevel)} CI</th><th scope="col">{tukey ? "q" : "t"}</th>
              <th scope="col">df</th><th scope="col">P (unadjusted)</th>
              <th scope="col">P (adjusted)</th><th scope="col">Summary</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c, i) => (
              <tr key={i}>
                {hasFamily && <td>{famOf(c)}</td>}
                <th scope="row">{String(c.pair)}</th>
                <td>{f(c.difference)}</td>
                <td>{c.ci ? fmtCI(c.ci) : "n/a (step-down)"}</td>
                <td>{f(c.statistic)}</td><td>{f(c.df)}</td>
                <td>{fmtP(c.p_unadjusted)}</td><td>{fmtP(c.p_adjusted)}</td>
                <td>{stars(c.p_adjusted)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(block.method === "holm" || block.method === "holm_sidak") && (
        <p className="hint-block">Step-down methods give adjusted P values but no simultaneous
          confidence intervals.</p>
      )}
    </section>
  );
}

// ------------------------------------------------------------ controls

/** Unit, comparisons, CI level and negative variance (both analyses). */
export function UnitControls<O extends MixedUnitOptions>({ o, set, a, b, la, lb }: {
  o: O; set: (patch: Partial<O>) => void; a: string; b: string | null; la: string[]; lb: string[];
}) {
  const words = unitWords(o.unit, o.unitCustom);
  const scopes: ComparisonScope[] = b ? SCOPES : ["a_means"];
  // Dunnett's control: a level of the factor being compared
  const levels = !b ? la : o.scope === "b_within_a" || o.scope === "b_means" ? lb
    : o.scope === "cells" ? la.flatMap((x) => lb.map((y) => `${x} / ${y}`)) : la;
  return (
    <>
      <section>
        <h3>Experimental unit</h3>
        <label className="check-row">
          <span>Each unit is a</span>
          <select aria-label="Experimental unit" value={o.unit}
            onChange={(e) => set({ unit: e.target.value } as Partial<O>)}>
            {UNIT_PRESETS.map((u) => <option key={u.id} value={u.id}>{u.singular}</option>)}
            <option value="other">Other…</option>
          </select>
        </label>
        {o.unit === "other" && (
          <label className="check-row">
            <span>Units are called (plural)</span>
            <input aria-label="Unit name (plural)" value={o.unitCustom} placeholder="e.g. organoids"
              onChange={(e) => set({ unitCustom: e.target.value } as Partial<O>)} />
          </label>
        )}
        <p className="hint-block">
          The {words.singular} is the experimental unit: it gets a random intercept, and the
          factors are tested against the variation between {words.plural}, so n is the number
          of {words.plural}, not of values (<Cite src={MIXED_SRC.lazic2010} />).
        </p>
      </section>
      <section>
        <h3>Multiple comparisons</h3>
        <label className="check-row">
          <span>Method</span>
          <select aria-label="Multiple comparisons method" value={o.comparisons}
            onChange={(e) => set({ comparisons: e.target.value as MixedComparisons } as Partial<O>)}>
            {(Object.keys(MIXED_COMPARISON_LABELS) as MixedComparisons[]).map((k) => (
              <option key={k} value={k}>{MIXED_COMPARISON_LABELS[k]}</option>
            ))}
          </select>
        </label>
        {o.comparisons !== "none" && (
          <label className="check-row">
            <span>Compare</span>
            <select aria-label="Comparisons to make" value={b ? o.scope : "a_means"} disabled={!b}
              onChange={(e) => set({ scope: e.target.value as ComparisonScope } as Partial<O>)}>
              {scopes.map((s) => <option key={s} value={s}>{scopeLabel(s, a, b)}</option>)}
            </select>
          </label>
        )}
        {o.comparisons === "dunnett" && levels.length > 0 && (
          <label className="check-row">
            <span>Control</span>
            <select aria-label="Control level" value={Math.min(o.controlIndex, levels.length - 1)}
              onChange={(e) => set({ controlIndex: Number(e.target.value) } as Partial<O>)}>
              {levels.map((l, i) => <option key={l} value={i}>{l}</option>)}
            </select>
          </label>
        )}
        <p className="hint-block">Comparisons use the model-estimated means and the same df as
          the F tests. Tukey and Dunnett adjust within each family; Šídák, Bonferroni and Holm
          count every comparison of every family.</p>
      </section>
      <section>
        <h3>Options</h3>
        <label className="check-row">
          <span>Confidence level</span>
          <select aria-label="Confidence level" value={o.ciLevel}
            onChange={(e) => set({ ciLevel: Number(e.target.value) } as Partial<O>)}>
            {[0.9, 0.95, 0.99].map((l) => <option key={l} value={l}>{levelPct(l)}</option>)}
          </select>
        </label>
        <label className="check-row">
          <span>Negative unit variance</span>
          <select aria-label="Negative unit variance" value={o.negativeVariance}
            onChange={(e) => set({ negativeVariance: e.target.value === "zero" ? "zero" : "allow" } as Partial<O>)}>
            <option value="allow">Allow (equals the classical nested ANOVA)</option>
            <option value="zero">Constrain to zero</option>
          </select>
        </label>
      </section>
    </>
  );
}

// ------------------------------------------------------------ results

function wordsOf(r: R): UnitWords {
  const w = r.unit_words;
  return w && typeof w.singular === "string" ? w : { singular: "unit", plural: "units" };
}

export function MixedUnitResults({ options, result: r }: ResultsProps<MixedUnitOptions, R>) {
  if (!r) return null;
  if (r.error) return <div className="results-error" role="alert">{String(r.error)}</div>;
  const words = wordsOf(r);
  const { a, b } = factorsOf(r);
  const grouping = r.analysis === "mixed_grouping";
  const vc = r.variance_components ?? {};
  const level = options.ciLevel ?? 0.95;
  const formula = String(r.formula ?? "").replace(/\(1 \| unit\)/, `(1 | ${words.singular})`);
  const anova: R[] = Array.isArray(r.anova) ? r.anova : [];
  const cells: R[] = Array.isArray(r.cell_means) ? r.cell_means : [];
  const units: R[] = Array.isArray(r.units) ? r.units : [];
  const ud = r.units_differ;
  const anovaMatrix = () => [["Source", "F", "DFn", "DFd", "P", "Tested against"],
    ...anova.map((x) => [x.term, raw(x.f), raw(x.dfn), raw(x.dfd), raw(x.p), String(x.error_term ?? "")])];
  const cellMatrix = () => [[a, ...(b ? [b] : []), "Mean", "SE", "CI lower", "CI upper", "df", words.plural, "Values"],
    ...cells.map((c) => [c.a, ...(b ? [c.b] : []), raw(c.mean), raw(c.se), raw(c.ci?.[0]), raw(c.ci?.[1]),
      raw(c.df), raw(c.n_units), raw(c.n_values)])];
  return (
    <div className="result-card mixed-results">
      <h3>{grouping ? `Mixed model with ${r.grouping} as a random intercept`
        : "Nested two-way ANOVA (mixed model)"}</h3>
      <p className="mixed-design-note" role="note" aria-label="Where the df come from">{r.design_note}</p>
      <p className="model-line">
        Linear mixed model fitted by REML: {b ? `${a}, ${b} and ${a} × ${b}` : a} fixed,
        {" "}{words.singular} a random intercept. {r.n_units} {words.plural}, {r.n_values} values
        in {r.n_cells} cells.{grouping ? ` Outcome: ${r.outcome}.` : ""}
      </p>
      <p className="mixed-formula">lme4: {formula}</p>
      {(r.warnings ?? []).map((w: string) => <p key={w} className="result-note result-note-warn" role="note">{w}</p>)}

      <section className="mixed-block" aria-label="ANOVA table">
        <h4>ANOVA table (Type III Wald F tests)</h4>
        <TableCopy name="Mixed model ANOVA table" matrix={anovaMatrix} />
        <div className="results-scroll">
          <table className="results-table mixed-anova">
            <caption className="sr-only">ANOVA table</caption>
            <thead>
              <tr><th scope="col">Source of variation</th><th scope="col">F (DFn, DFd)</th>
                <th scope="col">P value</th><th scope="col">Summary</th><th scope="col">Tested against</th></tr>
            </thead>
            <tbody>
              {anova.map((x) => (
                <tr key={x.term}>
                  <th scope="row">{x.term}</th>
                  <td>F({x.dfn}, {x.dfd}) = {f(x.f, 4)}</td>
                  <td>{fmtP(x.p)}</td><td>{stars(x.p)}</td>
                  <td>{x.error_term === "residual" ? "residual (varies within units)" : `${words.plural} (${x.dfd} df)`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mixed-block" aria-label="Variance components">
        <h4>Variance components</h4>
        <div className="results-scroll">
          <table className="results-table">
            <caption className="sr-only">Variance components</caption>
            <thead><tr><th scope="col">Source</th><th scope="col">Variance</th><th scope="col">SD</th>
              <th scope="col">% of total</th></tr></thead>
            <tbody>
              <tr><th scope="row">Between {words.plural}</th><td>{f(vc.unit?.variance)}</td>
                <td>{f(vc.unit?.sd)}</td><td>{num(vc.unit?.percent_of_total) ? `${formatSig(vc.unit.percent_of_total, 3)}%` : "n/a"}</td></tr>
              <tr><th scope="row">Within {words.plural} (residual)</th><td>{f(vc.residual?.variance)}</td>
                <td>{f(vc.residual?.sd)}</td><td>{num(vc.residual?.percent_of_total) ? `${formatSig(vc.residual.percent_of_total, 3)}%` : "n/a"}</td></tr>
            </tbody>
          </table>
        </div>
        <table className="results-table goodness">
          <tbody>
            <tr><th scope="row">Intraclass correlation (ICC)</th><td>{f(r.icc, 3)}</td></tr>
            <tr><th scope="row">Design effect</th><td>{f(r.design_effect, 3)} ({f(r.mean_values_per_unit, 3)} values per {words.singular})</td></tr>
            <tr><th scope="row">Effective number of independent values</th><td>{f(r.effective_n, 3)} of {r.n_values}</td></tr>
            {ud && <tr><th scope="row">Do the {words.plural} differ? (likelihood ratio)</th>
              <td>χ²({ud.df}) = {f(ud.chi_square)}, {fmtP(ud.p)} {stars(ud.p)}</td></tr>}
          </tbody>
        </table>
        <p className="hint-block mixed-method">
          {iccSentence(r, words)} (<Cite src={MIXED_SRC.aarts2014} />)
        </p>
        {num(vc.unit?.variance) && vc.unit.variance < 0 && (
          <p className="result-note" role="note">The between-{words.singular} variance is estimated as
            negative ({words.plural} vary less than their values predict). It is kept, which
            reproduces the classical nested ANOVA; “Constrain to zero” bounds it instead.</p>
        )}
      </section>

      <section className="mixed-block" aria-label="Cell means">
        <h4>Cell means (model estimates)</h4>
        <TableCopy name="Mixed model cell means" matrix={cellMatrix} />
        <div className="results-scroll">
          <table className="results-table">
            <caption className="sr-only">Cell means</caption>
            <thead>
              <tr><th scope="col">{a}</th>{b && <th scope="col">{b}</th>}<th scope="col">Mean</th>
                <th scope="col">SE</th><th scope="col">{levelPct(level)} CI</th><th scope="col">df</th>
                <th scope="col">{words.plural}</th><th scope="col">Values</th></tr>
            </thead>
            <tbody>
              {cells.map((c, i) => (
                <tr key={i}>
                  <th scope="row">{c.a}</th>{b && <td>{c.b}</td>}
                  <td>{f(c.mean)}</td><td>{f(c.se)}</td><td>{fmtCI(c.ci)}</td><td>{c.df}</td>
                  <td>{c.n_units}</td><td>{c.n_values}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <FamilyComparisons block={r.comparisons} ciLevel={level}
        name="Multiple comparisons" familyHead="Within"
        what={`Compared: ${r.comparisons ? scopeLabel(r.comparisons.scope as ComparisonScope, a, b) : ""}`} />

      <details className="mixed-units mixed-block">
        <summary>Each {words.singular} ({units.length})</summary>
        <div className="results-scroll">
          <table className="results-table">
            <caption className="sr-only">Each {words.singular}</caption>
            <thead><tr><th scope="col">{words.singular}</th><th scope="col">{a}</th>{b && <th scope="col">{b}</th>}
              <th scope="col">n</th><th scope="col">Mean</th><th scope="col">SD</th></tr></thead>
            <tbody>
              {units.map((u, i) => (
                <tr key={i}><th scope="row">{u.unit}</th><td>{u.a}</td>{b && <td>{u.b}</td>}
                  <td>{u.n}</td><td>{f(u.mean)}</td><td>{f(u.sd)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <section className="mixed-block" aria-label="Goodness of fit">
        <h4>Goodness of fit</h4>
        <table className="results-table goodness">
          <tbody>
            <tr><th scope="row">REML criterion</th><td>{f(r.goodness_of_fit?.reml_criterion)}</td></tr>
            <tr><th scope="row">AIC</th><td>{f(r.goodness_of_fit?.aic)}</td></tr>
            <tr><th scope="row">BIC</th><td>{f(r.goodness_of_fit?.bic)}</td></tr>
            <tr><th scope="row">df ({words.plural} / residual)</th><td>{r.df?.units} / {r.df?.residual}</td></tr>
          </tbody>
        </table>
        <p className="hint-block">Denominator df: {String(r.df_method ?? "")}.</p>
      </section>
      <Sources list={[MIXED_SRC.gpNested, MIXED_SRC.aarts2014, MIXED_SRC.lazic2010, MIXED_SRC.lme4]} />
    </div>
  );
}

export function MixedUnitMethods({ result: r }: ResultsProps<MixedUnitOptions, R>) {
  if (!r || r.error || !Array.isArray(r.anova)) return null;
  return <CopyableMethods text={mixedMethodsText(r, wordsOf(r), String(r.outcome ?? "the value"))} />;
}

// ------------------------------------------------------------ graph

interface NestedScatterOptions { brackets: boolean; cellCI: boolean }

function sanitize(v: unknown): NestedScatterOptions {
  const o = asRecord(v);
  return { brackets: o.brackets !== false, cellCI: o.cellCI !== false };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Mean of each unit (points) within each cell, the model's cell mean with
 *  its CI, A groups side by side with their B cells; brackets from the
 *  comparisons (shown unless the graph's own comparisons format says
 *  otherwise, or the "Brackets" option is off). */
export function MixedNestedPlot({ graph, options, result, titles, scheme, format,
  onFormatChange }: PlotProps<MixedUnitOptions | null, R>) {
  const dark = useDarkMode();
  const opts = sanitize(graph.settings.mixedNested);
  const level = typeof options?.ciLevel === "number" ? options.ciLevel : 0.95;
  const fig = useMemo(() => {
    const chrome = dark ? CHROME_DARK : CHROME_LIGHT;
    const traces: Plotly.Data[] = [];
    const annotations: Partial<Plotly.Annotations>[] = [];
    const ok = result && !result.error && Array.isArray(result.units);
    const { b, la, lb } = factorsOf(ok ? result : null);
    const nB = b ? lb.length : 1;
    const tickvals: number[] = [];
    const ticktext: string[] = [];
    const names = b ? lb : la;
    const words = ok ? wordsOf(result) : { singular: "unit", plural: "units" };
    if (ok) {
      la.forEach((av, ai) => {
        const bl = b ? lb : [null];
        bl.forEach((bv, bi) => {
          const x = cellX(ai, bi, nB);
          const ds = b ? bi : ai;
          const { color, symbol } = seriesStyle(ds, dark, scheme);
          const us = (result.units as R[]).filter((u) => u.a === av && (b ? u.b === bv : true));
          if (b) { tickvals.push(x); ticktext.push(escapeHtml(String(bv))); }
          const ys = us.map((u) => u.mean as number);
          const off = ys.map((_, j) => (ys.length > 1 ? ((j % 5) - 2) * 0.08 : 0));
          traces.push(tagTrace({
            type: "scatter", mode: "markers", x: ys.map((_, j) => x + off[j]), y: ys,
            text: us.map((u) => `${escapeHtml(String(u.unit))}: mean ${formatSig(u.mean)} (${u.n} values)`),
            hovertemplate: "%{text}<extra></extra>", name: String(b ? bv : av), showlegend: false,
            marker: { color, symbol, size: 10, line: { color: chrome.surface, width: 1.4 } },
          }, { ds, role: "points" }) as Plotly.Data);
          const cm = (result.cell_means as R[]).find((c) => c.a === av && (b ? c.b === bv : true));
          if (opts.cellCI && cm && num(cm.mean)) {
            traces.push(tagTrace({
              type: "scatter", mode: "lines", x: [x - 0.32, x + 0.32], y: [cm.mean, cm.mean],
              line: { color: chrome.ink, width: 2.5 }, hoverinfo: "skip", showlegend: false,
            }, { ds, role: "decor" }) as Plotly.Data);
            if (Array.isArray(cm.ci)) {
              traces.push(tagTrace({
                type: "scatter", mode: "markers", x: [x], y: [cm.mean],
                marker: { size: 1, color: chrome.ink, opacity: 0 }, showlegend: false,
                error_y: { type: "data", symmetric: false, array: [cm.ci[1] - cm.mean],
                  arrayminus: [cm.mean - cm.ci[0]], color: chrome.ink, thickness: 1.5, width: 9, visible: true },
                hovertemplate: `${escapeHtml(String(av))}${b ? ` · ${escapeHtml(String(bv))}` : ""}: mean `
                  + `${formatSig(cm.mean)} (${levelPct(level)} CI ${formatSig(cm.ci[0])} to `
                  + `${formatSig(cm.ci[1])}; ${cm.n_units} ${words.plural})<extra>model estimate</extra>`,
              }, { ds, role: "decor" }) as Plotly.Data);
            }
          }
        });
        const center = cellX(ai, (nB - 1) / 2, nB);
        if (!b) { tickvals.push(center); ticktext.push(escapeHtml(String(av))); } else {
          annotations.push({
            text: `<b>${escapeHtml(String(av))}</b>`, x: center, xref: "x", y: 0, yref: "paper",
            yanchor: "top", yshift: -28, showarrow: false,
            font: { color: chrome.ink, size: 13, family: PLOT_FONT },
          });
        }
      });
    } else {
      annotations.push({ text: result?.error ? "No graph: the analysis did not run"
        : "No results yet: this graph draws a nested two-way ANOVA or a mixed model with a grouping column",
        showarrow: false, font: { color: chrome.muted, size: 13 }, x: 0.5, y: 0.5,
        xref: "paper", yref: "paper" });
    }
    const right = Math.max(1, la.length) * (nB + CELL_GAP) - CELL_GAP - 1;
    const layout: Partial<Plotly.Layout> = {
      paper_bgcolor: chrome.surface, plot_bgcolor: chrome.surface,
      font: { family: PLOT_FONT, color: chrome.inkSecondary, size: 13 },
      margin: { l: 64, r: 16, t: 12, b: b ? 70 : 52 }, showlegend: false,
      xaxis: { tickvals, ticktext, zeroline: false, showgrid: false, range: [-0.7, right + 0.7],
        linecolor: chrome.axis, tickcolor: chrome.axis,
        tickfont: { color: chrome.inkSecondary, size: 11.5 }, fixedrange: true },
      yaxis: { title: { text: titles.y, font: { color: chrome.inkSecondary } }, gridcolor: chrome.grid,
        zeroline: false, linecolor: chrome.axis, tickcolor: chrome.axis, tickfont: { color: chrome.muted } },
      annotations, dragmode: "pan", uirevision: "keep",
    };
    return { traces, layout, names };
  }, [result, dark, scheme, titles.y, opts.cellCI, level]);
  const brackets = useMemo(() => nestedBrackets(result), [result]);
  const fmt = useMemo(() => (opts.brackets && brackets?.set.comparisons.length && !format?.comparisons
    ? { ...(format ?? {}), comparisons: { show: true } } : format), [format, opts.brackets, brackets]);
  const ctx = useMemo(() => ({
    dark, scheme, datasets: fig.names,
    comparisons: opts.brackets ? brackets?.set.comparisons : undefined,
    groupX: (name: string, family?: string) => bracketX(brackets, name, family),
    groupHalf: 0.35,
  }), [dark, scheme, fig.names, brackets, opts.brackets]);
  return (
    <FormattedPlot traces={fig.traces} layout={fig.layout} format={fmt} onFormatChange={onFormatChange}
      ctx={ctx} filename="nested-mixed" label="Nested scatter of unit means" />
  );
}

export function MixedNestedOptions({ graph }: GraphOptionsProps<MixedUnitOptions | null, R>) {
  const [opts, set] = useGraphOptions(graph, "mixedNested", sanitize);
  return (
    <>
      <OptCheck label="Cell means and CIs from the model" checked={opts.cellCI}
        onChange={(cellCI) => set({ cellCI })} />
      <OptCheck label="Brackets from the multiple comparisons" checked={opts.brackets}
        onChange={(brackets) => set({ brackets })} />
    </>
  );
}

