// Controls (with the "which analysis?" guide), results and methods text of
// the time-course analyses.
import { useProject } from "../../../app/context";
import { analysisSheets } from "../../../app/factory";
import { newId } from "../../../project/ids";
import { addSheets, findSheet, updateResultsOptions } from "../../../project/ops";
import { formatSig } from "../../../types";
import CopyableMethods from "../../common/CopyableMethods";
import { MIXED_SRC } from "../../common/mixedModel";
import { Cite, FamilyComparisons, Sources } from "../../common/mixedPanels";
import { fmtCI, fmtP, levelPct, stars } from "../../common/statFormat";
import TableCopy from "../../common/TableCopy";
import type { ControlsProps, ResultsProps } from "../../types";
import { pText } from "../format";
import { timeTitle, valueTitle } from "../tumour";
import { TumourAucMethods, TumourAucResults } from "../tumourPanels";
import type { TumourBase, TumourColumns } from "../tumourModel";
import { Card, Check, Grid, KV, LinkedTable, Note, Problem, Row, Select, TextIn } from "../ui";
import {
  A_TC_AUC, A_TC_MIXED, A_TC_WINDOW, COVARIANCE_LABELS, dfNote, TC_COMPARISON_LABELS, tcMethodsText,
  tcColumnTable, WINDOW_LABELS, type Covariance, type TcAucOptions, type TcComparisons, type TcMixedOptions,
  type TcWindowOptions, type WindowSummary,
} from "./model";
import "../../common/mixed.css";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

const f = (v: unknown, d?: number) => (typeof v === "number" && Number.isFinite(v) ? formatSig(v, d) : "n/a");
const raw = (v: unknown) => (typeof v === "number" ? String(v) : v == null ? "" : String(v));

const PER_TIME_WARNING = "Avoid a separate t test at each time point: repeated tests on the "
  + "same subjects push the chance of a false positive well above the nominal 5% (Oberg et "
  + "al. 2021, Sci Rep 11:8076). Analyse the whole time course with one of the three analyses "
  + "below.";

const GUIDE: { id: string; title: string; text: string }[] = [
  { id: A_TC_MIXED, title: "Mixed model of group × time",
    text: "Uses every measurement, including subjects with missing times, and tests group, time "
      + "and their interaction; the covariance of the repeated measurements can be chosen and "
      + "compared by AIC. The usual first choice." },
  { id: A_TC_AUC, title: "Area under each subject's curve",
    text: "One number per subject (the trapezoid area of its curve), compared between groups "
      + "with a t test or one-way ANOVA: the glucose tolerance test's usual summary." },
  { id: A_TC_WINDOW, title: "Summary over a time window",
    text: "Each subject's mean, peak or area between two times you choose (for example 60 to "
      + "120 min), compared between groups: one pre-specified question instead of many tests." },
];

function TcGuide({ sheetId, parentId, current, readOnly }: {
  sheetId: string; parentId: string; current: string; readOnly: boolean;
}) {
  const { project, apply, select } = useProject();
  const siblings = project.sheets.filter((s) => s.kind === "results" && s.parentId === parentId);
  const add = (id: string) => {
    const existing = siblings.find((s) => s.kind === "results" && s.analysis === id);
    if (existing) { select(existing.id); return; }
    let rid = "";
    apply((p) => {
      const more = analysisSheets(p, parentId, id, newId);
      rid = more[0]?.id ?? "";
      const src = findSheet(p, sheetId);
      const o = src?.kind === "results" ? src.options as TumourBase : null;
      // the new analysis reads the same columns and transform as this one
      const patched = more.map((s) => (s.kind === "results" && o
        ? { ...s, options: { ...(s.options as object), columns: o.columns, log: o.log, offset: o.offset } } : s));
      return addSheets(p, patched);
    });
    if (rid) select(rid);
  };
  return (
    <section>
      <h3>Which analysis?</h3>
      <Note warn>{PER_TIME_WARNING}</Note>
      <ul className="assay-guide">
        {GUIDE.map((g) => {
          const on = g.id === current;
          const has = siblings.some((s) => s.kind === "results" && s.analysis === g.id);
          return (
            <li key={g.id} className={on ? "current" : undefined}>
              <strong>{g.title}{on && <span className="assay-current-tag"> · this sheet</span>}</strong>
              {g.text}
              {!on && !readOnly && (
                <div>
                  <button type="button" onClick={() => add(g.id)}
                    aria-label={`${has ? "Open" : "Add"}: ${g.title}`}>
                    {has ? "Open this analysis" : "Add this analysis"}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ColumnPicks({ names, value, onChange }: {
  names: string[]; value: TumourColumns; onChange: (c: TumourColumns) => void;
}) {
  const pickRow = (key: keyof TumourColumns, label: string, optional = false) => (
    <Row label={label}>
      <select aria-label={label} value={value[key]} onChange={(e) => onChange({ ...value, [key]: e.target.value })}>
        <option value="">{optional ? "(none: one group)" : "Choose…"}</option>
        {names.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </Row>
  );
  return (
    <section>
      <h3>Columns</h3>
      {pickRow("subject", "Subject (animal ID)")}
      {pickRow("group", "Group", true)}
      {pickRow("time", "Time")}
      {pickRow("value", "Measured value")}
      <p className="hint-block">One row per measurement (long format).</p>
    </section>
  );
}

export function TcControls({ sheet, table, options, onChange, readOnly }: ControlsProps<any>) {
  const o = options as TumourBase & R;
  const set = (patch: R) => onChange({ ...o, ...patch });
  const id = sheet.analysis;
  const names = table.datasets.map((d, i) => d.name.trim() || `Variable ${i + 1}`);
  const m = o as TcMixedOptions;
  const w = o as TcWindowOptions;
  return (
    <div className="controls">
      <TcGuide sheetId={sheet.id} parentId={sheet.parentId} current={id} readOnly={readOnly} />
      {table.type === "multivariable" ? (
        <ColumnPicks names={names} value={o.columns} onChange={(columns) => set({ columns })} />
      ) : (
        <section>
          <h3>Layout</h3>
          <p className="hint-block">
            {table.type === "grouped"
              ? "Rows are time points (the number in each row title is the time), data sets are groups and each subcolumn is one subject followed down the rows."
              : "X is time, data sets are groups and each subcolumn is one subject followed down the rows."}
          </p>
        </section>
      )}
      <section>
        <h3>Transform</h3>
        <Check label="Analyse the natural log of the values" checked={o.log} onChange={(log) => set({ log })} />
        {o.log && (
          <TextIn label="Add before taking logs" value={o.offset} onChange={(offset) => set({ offset })}
            hint="Values at or below zero after adding this are left out and counted." />
        )}
      </section>
      {id === A_TC_MIXED && (
        <>
          <section>
            <h3>Model</h3>
            <Select label="Covariance of the repeated measurements" value={m.covariance}
              options={(Object.keys(COVARIANCE_LABELS) as Covariance[]).map((k) => [k, COVARIANCE_LABELS[k]] as const)}
              onChange={(covariance) => set({ covariance })}
              hint={<>Compound symmetry (every pair of times equally correlated) is the model of
                the <Cite src={MIXED_SRC.gpMixedRm} />; AR(1), unstructured and random slopes go
                beyond it. Compare them by AIC from the results.</>} />
            <Select label="Time enters as" value={m.timeAs}
              options={[["factor", "Categories (a mean at each time)"], ["linear", "A straight line (slopes compared)"]]}
              onChange={(timeAs) => set({ timeAs })} />
            <Check label="Adjust for the first time point (baseline as a covariate)"
              checked={m.baselineCovariate} onChange={(baselineCovariate) => set({ baselineCovariate })} />
          </section>
          <section>
            <h3>Group differences at each time</h3>
            <Select label="Correction" value={m.comparisons}
              options={(Object.keys(TC_COMPARISON_LABELS) as TcComparisons[]).map((k) => [k, TC_COMPARISON_LABELS[k]] as const)}
              onChange={(comparisons) => set({ comparisons })}
              hint="Read the Group × Time interaction first. The differences at each time come from the same model and are corrected together." />
            {m.comparisons === "dunnett" && (
              <TextIn label="Control group (number, 1 = first)" value={String(m.controlIndex + 1)} inputMode="numeric"
                onChange={(v) => set({ controlIndex: Math.max(0, (parseInt(v, 10) || 1) - 1) })} />
            )}
            <Select label="Confidence level" value={String(m.ciLevel) as "0.95"}
              options={[["0.9", "90%"], ["0.95", "95%"], ["0.99", "99%"]] as const}
              onChange={(v) => set({ ciLevel: Number(v) })} />
          </section>
        </>
      )}
      {id === A_TC_AUC && (
        <section>
          <h3>Area</h3>
          <Select label="Baseline" value={(o as TcAucOptions).baseline}
            options={[["zero", "Zero"], ["first", "Each subject's first value"]]}
            onChange={(baseline) => set({ baseline })} />
          <Check label="Divide by the follow-up time (AUC per unit time)"
            checked={(o as TcAucOptions).perTime} onChange={(perTime) => set({ perTime })} />
          <Check label="Do not assume equal SDs (Welch's t test)"
            checked={(o as TcAucOptions).welch} onChange={(welch) => set({ welch })} />
          <p className="hint-block">Above “each subject's first value”, the area measures the
            rise from baseline (the incremental AUC of a glucose tolerance test).</p>
        </section>
      )}
      {id === A_TC_WINDOW && (
        <section>
          <h3>Window</h3>
          <Select label="Summary of each subject" value={w.summary}
            options={(Object.keys(WINDOW_LABELS) as WindowSummary[]).map((k) => [k, WINDOW_LABELS[k]] as const)}
            onChange={(summary) => set({ summary })} />
          <TextIn label="From time" value={w.from} onChange={(from) => set({ from })}
            hint="Blank: from the first time." />
          <TextIn label="To time" value={w.to} onChange={(to) => set({ to })}
            hint="Blank: to the last time. Choose the window before looking at the data." />
          <Check label="Do not assume equal SDs (Welch's t test)" checked={w.welch}
            onChange={(welch) => set({ welch })} />
        </section>
      )}
    </div>
  );
}

// ------------------------------------------------------------ results

function DataSummary({ result, table, options }: { result: R; table: any; options: TumourBase }) {
  const info = result.info ?? {};
  return (
    <KV caption="Data" rows={[
      ["Subjects", `${info.nSubjects ?? "?"} in ${info.groups?.length ?? "?"} groups (${(info.groups ?? []).join(", ")})`],
      ["Read from", info.source === "long" ? `long records: ${options.columns.subject}, ${options.columns.group || "(one group)"}, ${options.columns.time}, ${options.columns.value}`
        : info.source === "grouped" ? "grouped table, subjects as subcolumns" : "XY table, subjects as subcolumns"],
      ["Analysed", options.log ? `ln(${valueTitle(table, options)})` : valueTitle(table, options)],
    ]} />
  );
}

function useOptionSetter(sheet: ResultsProps["sheet"]): ((patch: R) => void) | null {
  const api = useProject();
  if (sheet.frozen || api.readOnly) return null;
  return (patch) => api.apply((p) => updateResultsOptions(p, sheet.id,
    (o) => ({ ...(o && typeof o === "object" ? o : {}), ...patch })), null);
}

const PARAM_LABELS: Record<string, string> = {
  subject_variance: "Between-subject variance", residual_variance: "Residual variance",
  correlation: "Correlation between two times of a subject", rho: "AR(1) correlation of adjacent times (ρ)",
  intercept_variance: "Intercept variance", slope_variance: "Slope variance",
  intercept_slope_covariance: "Intercept-slope covariance", intercept_slope_correlation: "Intercept-slope correlation",
};

function ModelComparison({ result, set, options }: { result: R; set: ((p: R) => void) | null; options: TcMixedOptions }) {
  const mc = result.model_comparison as R | undefined;
  const rows: R[] = Array.isArray(mc?.rows) ? mc!.rows : [];
  return (
    <section className="mixed-block" aria-label="Covariance structures">
      <h4>Covariance structure</h4>
      <p className="hint-block mixed-method">
        Fitted: {String(result.covariance?.label ?? "")}. Choose the structure with the smallest
        AIC among those that make sense for the design (times far apart less correlated: AR(1);
        subjects on their own trend: random slopes); a difference under 2 is no real preference,
        and then the simpler structure is the safer one (<Cite src={MIXED_SRC.littell2006} />;
        {" "}<Cite src={MIXED_SRC.pinheiroBates} />).
      </p>
      {set && (
        <div className="mixed-actions">
          {!options.compareCovariances && (
            <button type="button" onClick={() => set({ compareCovariances: true })}>
              Compare covariance structures (AIC)
            </button>
          )}
          {mc?.best && mc.best !== options.covariance && (
            <button type="button" onClick={() => set({ covariance: mc.best })}>
              Use the best structure ({String(rows.find((r) => r.kind === mc.best)?.label ?? mc.best)})
            </button>
          )}
        </div>
      )}
      {rows.length > 0 && (
        <>
          <TableCopy name="Covariance structures" matrix={() => [["Structure", "Parameters", "-2 log L", "AIC", "Delta AIC", "BIC", "Best"],
            ...rows.map((r) => [r.label, raw(r.n_parameters), raw(r.minus2_log_likelihood), raw(r.aic), raw(r.delta_aic), raw(r.bic), r.best ? "best" : ""])]} />
          <div className="results-scroll">
            <table className="results-table mixed-aic">
              <caption className="sr-only">Covariance structures compared by AIC</caption>
              <thead>
                <tr><th scope="col">Structure</th><th scope="col">Parameters</th><th scope="col">−2 log L ({String(mc!.method ?? "REML")})</th>
                  <th scope="col">AIC</th><th scope="col">ΔAIC</th><th scope="col">BIC</th><th scope="col">Best</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.kind} className={r.best ? "mixed-best" : undefined}>
                    <th scope="row">{r.label}{r.kind === result.covariance?.kind ? " (fitted)" : ""}</th>
                    <td>{r.n_parameters}</td><td>{f(r.minus2_log_likelihood)}</td><td>{f(r.aic)}</td>
                    <td>{f(r.delta_aic, 3)}</td><td>{f(r.bic)}</td><td>{r.best ? "Best (lowest AIC)" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {mc!.note && <p className="hint-block">{String(mc!.note)}</p>}
          {set && <button type="button" onClick={() => set({ compareCovariances: false })}>Hide the comparison</button>}
        </>
      )}
    </section>
  );
}

export function TcMixedResults({ sheet, table, options, result }: ResultsProps<TcMixedOptions, R>) {
  const set = useOptionSetter(sheet);
  if (!result) return null;
  if (result.error) return <Problem result={result} />;
  const info = result.info ?? {};
  const anova: R[] = Array.isArray(result.anova) ? result.anova : [];
  const groups: string[] = Array.isArray(result.groups) ? result.groups : [];
  const times: string[] = Array.isArray(result.times) ? result.times : [];
  const gat: R[] = Array.isArray(result.group_at_time) ? result.group_at_time : [];
  const params = (result.covariance?.parameters ?? {}) as R;
  const level = options.ciLevel ?? 0.95;
  const tt = timeTitle(table, options);
  return (
    <>
      <Card title="Time course: mixed model" className="mixed-results">
        <DataSummary result={result} table={table} options={options} />
        {info.timeFromOrder && <Note warn>Some row titles hold no number, so rows are numbered 1, 2, 3, … as the time.</Note>}
        {info.dropped > 0 && <Note warn>{info.dropped} value{info.dropped === 1 ? " is" : "s are"} at or below zero and left out (no logarithm).</Note>}
        <p className="model-line">{String(result.method ?? "")}. {result.n_subjects} subjects, {result.n_values} values
          {result.n_missing ? ` (${result.n_missing} missing, kept out without dropping their subjects)` : ""}.</p>
        <p className="mixed-formula">{String(result.formula ?? "")}</p>
        {(result.warnings ?? []).map((w: string) => <Note key={w} warn>{w}</Note>)}
        {result.time_note && <p className="hint-block">{result.time_note}</p>}
        {result.baseline_note && <p className="hint-block">{result.baseline_note}</p>}
        <section className="mixed-block" aria-label="ANOVA table">
          <h4>Fixed effects (Type III Wald F tests)</h4>
          <TableCopy name="Time course ANOVA table" matrix={() => [["Source", "F", "DFn", "DFd", "P"],
            ...anova.map((x) => [x.term, raw(x.f), raw(x.dfn), raw(x.dfd), raw(x.p)])]} />
          <div className="results-scroll">
            <table className="results-table mixed-anova">
              <caption className="sr-only">ANOVA table</caption>
              <thead><tr><th scope="col">Source of variation</th><th scope="col">F (DFn, DFd)</th>
                <th scope="col">P value</th><th scope="col">Summary</th></tr></thead>
              <tbody>
                {anova.map((x) => (
                  <tr key={x.term}><th scope="row">{x.term}</th><td>F({x.dfn}, {x.dfd}) = {f(x.f, 4)}</td>
                    <td>{fmtP(x.p)}</td><td>{stars(x.p)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint-block">{dfNote(result)} A significant Group × Time interaction means
            the groups' curves differ in shape, not only in level.</p>
        </section>
        <ModelComparison result={result} set={set} options={options} />
        <section className="mixed-block" aria-label="Covariance parameters">
          <h4>Covariance parameters</h4>
          <KV caption="Covariance parameters" rows={Object.entries(params)
            .filter(([, v]) => typeof v === "number")
            .map(([k, v]) => [PARAM_LABELS[k] ?? k.replace(/_/g, " "), f(v)])} />
        </section>
      </Card>
      <Card title={`Group means at each ${tt.toLowerCase().replace(/\s*\(.*\)$/, "")} (model estimates)`}>
        <TableCopy name="Group means at each time" matrix={() => [["Time", "Group", "Mean", "SE", "CI lower", "CI upper", "n"],
          ...gat.map((g) => [String(g.time), g.group, raw(g.mean), raw(g.se), raw(g.ci?.[0]), raw(g.ci?.[1]), raw(g.n)])]} />
        <Grid caption="Group means at each time" head={[tt, ...groups.map((g) => `${g}: mean (${levelPct(level)} CI)`)]}
          rows={times.map((t) => [t, ...groups.map((g) => {
            const c = gat.find((x) => String(x.time) === t && x.group === g);
            return c ? `${f(c.mean)} (${fmtCI(c.ci)})` : "n/a";
          })])} />
        <FamilyComparisons block={result.group_difference_at_time} ciLevel={level}
          name="Group differences at each time" familyHead={tt}
          what="Groups compared at each time point on the model's estimated means (read the Group × Time interaction first)" />
        <KV caption="Fit" rows={[
          ["−2 log likelihood", f(result.fit?.minus2_log_likelihood)],
          ["AIC / BIC", `${f(result.fit?.aic)} / ${f(result.fit?.bic)}`],
          ["Covariance parameters", String(result.fit?.n_covariance_parameters ?? "")],
        ]} />
        <Sources list={[MIXED_SRC.gpMixedRm, MIXED_SRC.pinheiroBates, MIXED_SRC.littell2006]} />
      </Card>
    </>
  );
}

export function TcMixedMethods({ table, options, result }: ResultsProps<TcMixedOptions, R>) {
  if (!result || result.error || !Array.isArray(result.anova)) return null;
  return <CopyableMethods text={tcMethodsText(result, options, valueTitle(table, options).toLowerCase())} />;
}

export const TcAucResults = TumourAucResults;
export const TcAucMethods = TumourAucMethods;

export function TcWindowResults({ sheet, table, options, result }: ResultsProps<TcWindowOptions, R>) {
  if (!result) return null;
  if (result.error) return <Problem result={result} />;
  const subjects: R[] = result.subjects ?? [];
  const groups: R[] = result.groups ?? [];
  const nGroups = (result.table?.datasets ?? []).filter((d: R) => d.ys.length >= 2).length;
  const what = WINDOW_LABELS[options.summary];
  const yTitle = what.replace(/ \(.*\)$/, "");
  const win = `${options.from.trim() || "the first time"} to ${options.to.trim() || "the last time"}`;
  const cmp = result.comparison as R | undefined;
  const area = options.summary === "auc" || options.summary === "auc_per_time";
  const parent = sheet.name.replace(/^Window summary of /, "");
  return (
    <>
      <Card title="Summary of each subject over a time window">
        <DataSummary result={result} table={table} options={options} />
        <p className="model-line">{what}, from {win}.</p>
        <Grid caption="Window summary per group" head={["Group", "n", "Mean", "SD", "SEM", "95% CI"]}
          rows={groups.map((g) => [g.group, g.n, f(g.mean), f(g.sd), f(g.sem), fmtCI(g.ci)])} />
        {cmp ? (
          <KV caption="Group comparison" rows={cmp.F != null
            ? [[cmp.test, `F(${cmp.dfn}, ${cmp.dfd}) = ${f(cmp.F)}, ${pText(cmp.p)} ${stars(cmp.p)}`]]
            : [[cmp.test, `t(${formatSig(cmp.df, 4)}) = ${f(cmp.t)}, ${pText(cmp.p)} ${stars(cmp.p)}`],
              [`Difference (${cmp.names?.[0]} − ${cmp.names?.[1]})`, f(cmp.difference)]]} />
        ) : <Note>Comparing groups needs at least two groups with two or more subjects each.</Note>}
        <LinkedTable resultsId={sheet.id} name={`Window summary of ${parent}`} label="Create the window column table"
          make={() => tcColumnTable(result, yTitle)}
          options={() => (nGroups > 2
            ? { analysis: "anova", anovaKind: "parametric", comparisons: "tukey" }
            : { analysis: "ttest", ttestKind: options.welch ? "welch" : "unpaired" })}
          note="One column per group, one value per subject, analysed with a t test (two groups) or one-way ANOVA. The table is linked: it follows edits to the data and these settings." />
      </Card>
      <Card title="Each subject">
        <Grid caption="Window summary per subject" head={["Subject", "Group", yTitle, ...(area ? ["Points"] : [])]}
          rows={subjects.map((s) => [s.subject, s.group, s.auc == null ? "n/a (fewer than 2 points)" : f(s.auc),
            ...(area ? [s.n_points] : [])])} />
      </Card>
    </>
  );
}

export function TcWindowMethods({ table, options, result }: ResultsProps<TcWindowOptions, R>) {
  if (!result || result.error) return null;
  const value = valueTitle(table, options).toLowerCase();
  const what: Record<WindowSummary, string> = {
    mean: "the mean of its measurements", max: "its largest measurement",
    auc: "the area under its curve (trapezoid rule)", auc_per_time: "the area under its curve divided by the window's duration",
  };
  const test = result.comparison?.test;
  const text = `For each subject, ${options.log ? `log ${value}` : value} was summarised by ${what[options.summary]} `
    + `between ${options.from.trim() || "the first"} and ${options.to.trim() || "the last"} time point${options.from.trim() || options.to.trim() ? "s (a window chosen before the analysis)" : "s"}. `
    + (test ? `These values were compared between groups with ${test === "one-way ANOVA" ? "an ordinary one-way ANOVA" : `an ${test}`}. ` : "")
    + "Analysis in OpenDose (open-source, built on SciPy).";
  return <CopyableMethods text={text} />;
}
