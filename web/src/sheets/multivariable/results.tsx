// Results sheets and methods text for the multiple-variables analyses.
import { useState, type ReactNode } from "react";
import { useProject } from "../../app/context";
import { useAddDerivedTable } from "../../app/derivedTable";
import { findSheet } from "../../project/ops";
import { formatSig } from "../../types";
import type { ResultsProps } from "../types";
import {
  rowLabel, tableFromRearranged, type CorrelationOptions, type DescriptiveOptions,
  type LogisticOptions, type PcaOptions, type RearrangeOptions, type RegressionOptions,
} from "./model";
import type {
  Coefficient, CorrelationResult, DescriptiveResult, LogisticResult, PcaResult,
  RearrangeResult, RegressionResult,
} from "./run";

/* ------------------------------------------------------------ formatting */

const f = (v: number | null | undefined, sig?: number) => formatSig(v ?? null, sig);

function fmtP(p: number | null | undefined): string {
  if (typeof p !== "number") return "n/a";
  return p < 0.0001 ? "< 0.0001" : formatSig(p, 4);
}

function summaryStars(p: number | null | undefined): string {
  if (typeof p !== "number") return "";
  if (p < 0.0001) return "****";
  if (p < 0.001) return "***";
  if (p < 0.01) return "**";
  if (p < 0.05) return "*";
  return "ns";
}

const pct = (v: number | null | undefined) => (typeof v === "number" ? `${formatSig(v, 3)}%` : "n/a");
const lvl = (level: number) => `${formatSig(level * 100, 3)}%`;
const ci = (c: [number | null, number | null] | undefined | null) =>
  c ? `${c[0] === null ? "n/a" : f(c[0])} to ${c[1] === null ? "n/a" : f(c[1])}` : "n/a";

function Card({ title, children }: { title: string; children: ReactNode }) {
  return <div className="result-card mv-results"><h3>{title}</h3>{children}</div>;
}

function KV({ title, rows }: { title?: string; rows: [string, ReactNode][] }) {
  return (
    <div className="mv-kv">
      {title && <h4>{title}</h4>}
      <table className="results-table goodness">
        <tbody>
          {rows.map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>)}
        </tbody>
      </table>
    </div>
  );
}

function Grid({ head, rows, caption }: { head: ReactNode[]; rows: ReactNode[][]; caption?: string }) {
  return (
    <div className="mv-scroll">
      <table className="results-table mv-grid">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead><tr>{head.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (j === 0
                ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Problem({ result }: { result: { error?: string } | null }) {
  if (!result) return null;
  return result.error ? <div className="results-error" role="alert">{result.error}</div> : null;
}

function Methods({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="result-card methods-text">
      <h3>Methods text</h3>
      <p>{text}</p>
      <button className="copy-btn" onClick={() => {
        void navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}>
        <span className="swap-label" key={copied ? "copied" : "copy"}>
          {copied ? "Copied ✓" : "Copy"}
        </span>
      </button>
    </div>
  );
}

const TOOL = "OpenDose (open-source, built on SciPy)";
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("")
  : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/* ------------------------------------------------------------ descriptive */

const DESC_ROWS: [string, (d: DescriptiveResult["variables"][number]) => string][] = [
  ["Number of values", (d) => String(d.n)],
  ["Number missing", (d) => String(d.n_missing)],
  ["Minimum", (d) => f(d.minimum)],
  ["25% percentile", (d) => f(d.percentile25)],
  ["Median", (d) => f(d.median)],
  ["75% percentile", (d) => f(d.percentile75)],
  ["Maximum", (d) => f(d.maximum)],
  ["Mean", (d) => f(d.mean)],
  ["SD", (d) => f(d.sd)],
  ["SEM", (d) => f(d.sem)],
  ["CI of mean", (d) => ci(d.ci_mean)],
  ["Coefficient of variation", (d) => pct(d.cv_percent)],
  ["Geometric mean", (d) => f(d.geometric_mean)],
  ["Skewness", (d) => f(d.skewness)],
  ["Kurtosis", (d) => f(d.kurtosis)],
];

export function DescriptiveResults({ options, result }:
  ResultsProps<DescriptiveOptions, DescriptiveResult>) {
  if (!result) return null;
  if (result.error) return <Problem result={result} />;
  const cont = result.variables.filter((v) => v.kind === "continuous");
  const cat = result.variables.filter((v) => v.kind === "categorical");
  return (
    <Card title="Descriptive statistics">
      <p className="hint-block">{result.n_rows} rows (observations).</p>
      {cont.length > 0 && (
        <Grid caption="Statistics of each continuous variable"
          head={["", ...cont.map((v) => v.name)]}
          rows={DESC_ROWS.map(([label, get]) => [
            label === "CI of mean" ? `${options.ciLevel || 95}% CI of mean` : label,
            ...cont.map((v) => (v.n ? get(v) : "n/a")),
          ])} />
      )}
      {cat.map((v) => (
        <div key={v.name}>
          <h4>{v.name} (categorical)</h4>
          <Grid caption={`Levels of ${v.name}`} head={["Level", "Count", "Fraction"]}
            rows={[
              ...(v.levels ?? []).map((l) => [l.level, String(l.count), pct(100 * l.fraction)]),
              ["Missing", String(v.n_missing), ""],
            ]} />
        </div>
      ))}
    </Card>
  );
}

export function DescriptiveMethods({ result }: ResultsProps<DescriptiveOptions, DescriptiveResult>) {
  if (!result || result.error) return null;
  return <Methods text={`Continuous variables were summarized as mean, SD, median and `
    + `interquartile range, and categorical variables as counts and percentages of each level, `
    + `using ${TOOL}. Blank values were treated as missing (n = ${result.n_rows} observations).`} />;
}

/* ------------------------------------------------------------ correlation */

type MatrixView = "r" | "p" | "n" | "ci" | "r2";

export function CorrelationResults({ result }: ResultsProps<CorrelationOptions, CorrelationResult>) {
  const [view, setView] = useState<MatrixView>("r");
  if (!result) return null;
  if (result.error) return <Problem result={result} />;
  const sym = result.method === "spearman" ? "Spearman r" : "Pearson r";
  const views: [MatrixView, string][] = [
    ["r", sym], ["p", "P value"], ["n", "Sample size"], ["ci", `${lvl(result.ci_level)} CI`],
    ["r2", "R squared"],
  ];
  const cell = (i: number, j: number): string => {
    if (view === "n") return String(result.n[i][j]);
    if (i === j) return view === "r" || view === "r2" ? "1" : "";
    if (view === "r") return f(result.r[i][j]);
    if (view === "r2") return f(result.r_squared[i][j]);
    if (view === "p") {
      const p = result.p[i][j];
      return p === null ? "n/a" : `${fmtP(p)} ${summaryStars(p)}`;
    }
    const lo = result.ci_lo[i][j];
    const hi = result.ci_hi[i][j];
    return lo === null || hi === null ? "n/a" : `${f(lo, 3)} to ${f(hi, 3)}`;
  };
  const exact = result.p_type?.some((row) => row.some((t) => t === "exact"));
  return (
    <Card title={`Correlation matrix (${sym})`}>
      <div className="mv-seg" role="tablist" aria-label="Matrix shown">
        {views.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={view === id}
            className={view === id ? "active" : undefined} onClick={() => setView(id)}>
            {label}
          </button>
        ))}
      </div>
      <Grid caption={`${views.find((v) => v[0] === view)![1]} matrix`}
        head={["", ...result.names]}
        rows={result.names.map((n, i) => [n, ...result.names.map((_, j) => cell(i, j))])} />
      <p className="hint-block">
        {result.missing === "pairwise"
          ? "Each pair uses every row with values for both variables."
          : "Rows with a blank in any variable were left out."}
        {" "}{result.tails === 1 ? "One-tailed" : "Two-tailed"} P values
        {exact ? "; Spearman P is exact for 9 or fewer pairs" : ""}.
      </p>
    </Card>
  );
}

export function CorrelationMethods({ result }: ResultsProps<CorrelationOptions, CorrelationResult>) {
  if (!result || result.error) return null;
  const m = result.method === "spearman" ? "Spearman rank" : "Pearson";
  return <Methods text={`${m} correlation coefficients were computed for every pair of `
    + `${list(result.names)}, with ${result.tails === 1 ? "one" : "two"}-tailed P values and `
    + `${lvl(result.ci_level)} confidence intervals; missing values were excluded `
    + `${result.missing === "pairwise" ? "pairwise" : "listwise"}. Analysis used ${TOOL}.`} />;
}

/* ------------------------------------------------------------ regression */

function equation(outcome: string, coefs: Coefficient[]): string {
  return `${outcome} = ${coefs.map((c, i) => (i === 0 ? "β0" : `β${i}·${c.name}`)).join(" + ")}`;
}

function NormalityRows({ tests }: { tests: RegressionResult["normality_of_residuals"] }) {
  const names: [string, string, string][] = [
    ["shapiro_wilk", "Shapiro-Wilk", "W"],
    ["dagostino_pearson", "D'Agostino-Pearson omnibus", "K2"],
    ["anderson_darling", "Anderson-Darling", "A2"],
  ];
  const rows = names.filter(([k]) => tests[k]).map(([k, label, stat]) => {
    const t = tests[k] as Record<string, number | boolean>;
    return [label, `${stat} = ${f(t[stat] as number)}`, fmtP(t.p as number),
      t.passed_alpha_05 ? "Yes" : "No"];
  });
  if (!rows.length) return <p className="hint-block">Too few residuals for a normality test.</p>;
  return <Grid caption="Normality of residuals" head={["Test", "Statistic", "P value", "Passed (α = 0.05)?"]} rows={rows} />;
}

export function RegressionResults({ result }: ResultsProps<RegressionOptions, RegressionResult>) {
  if (!result) return null;
  if (result.error) return <Problem result={result} />;
  const g = result.goodness;
  const o = result.overall_test;
  const refs = Object.entries(result.reference_levels);
  return (
    <Card title={`Multiple linear regression of ${result.outcome}`}>
      <p className="hint-block mv-equation">{equation(result.outcome, result.coefficients)}</p>
      <h4>Parameter estimates</h4>
      <Grid caption="Parameter estimates"
        head={["Parameter", "Estimate", "SE", `${lvl(result.ci_level)} CI`, "|t|", "P value", "", "VIF"]}
        rows={result.coefficients.map((c, i) => [
          i === 0 ? "β0 (Intercept)" : `β${i}: ${c.name}`, f(c.estimate), f(c.se), ci(c.ci),
          f(c.t), fmtP(c.p), summaryStars(c.p), c.vif === null ? "" : f(c.vif, 3),
        ])} />
      {refs.length > 0 && (
        <p className="hint-block">
          Reference levels: {refs.map(([k, v]) => `${k} = ${v}`).join("; ")}.
        </p>
      )}
      <div className="stat-cols">
        <KV title="Goodness of fit" rows={[
          ["R squared", f(g.r_squared)],
          ["Adjusted R squared", f(g.adjusted_r_squared)],
          ["Multiple R", f(g.multiple_r)],
          ["Sum of squares", f(g.sum_of_squares)],
          ["Sy.x", f(g.sy_x)],
          ["RMSE", f(g.rmse)],
          ["AICc", f(g.aicc)],
          ["Degrees of freedom", String(g.df)],
        ]} />
        <KV title="Does the model beat the intercept-only model?" rows={[
          ["F", `F (${o.dfn}, ${o.dfd}) = ${f(o.F)}`],
          ["P value", `${fmtP(o.p)} ${summaryStars(o.p)}`],
          ["Rows analyzed", String(result.n_rows_analyzed)],
          ["Rows skipped (blank values)", String(result.n_rows_skipped)],
          ["Parameters", String(result.n_parameters)],
        ]} />
      </div>
      <h4>Analysis of variance</h4>
      <Grid caption="Analysis of variance" head={["Source", "SS", "DF", "MS", "F", "P value"]}
        rows={result.anova.map((a) => [a.source, f(a.ss), String(a.df),
          a.ms == null ? "" : f(a.ms), a.F == null ? "" : f(a.F), a.p == null ? "" : fmtP(a.p)])} />
      <h4>Does each term contribute? (F test when it is dropped)</h4>
      <Grid caption="Term tests" head={["Term", "SS", "DF", "F", "P value", ""]}
        rows={result.term_tests.map((t) => [t.term, f(t.ss), String(t.df), f(t.F), fmtP(t.p), summaryStars(t.p)])} />
      <h4>Normality of residuals</h4>
      <NormalityRows tests={result.normality_of_residuals} />
    </Card>
  );
}

export function RegressionMethods({ result }: ResultsProps<RegressionOptions, RegressionResult>) {
  if (!result || result.error) return null;
  const preds = result.coefficients.slice(1).map((c) => c.name);
  const refs = Object.entries(result.reference_levels);
  const dose = result.coefficients.slice(1).map((c) =>
    `${c.name}: ${f(c.estimate)} (${lvl(result.ci_level)} CI ${ci(c.ci)}; P ${c.p < 0.0001 ? "< 0.0001" : `= ${fmtP(c.p)}`})`);
  return <Methods text={`${result.outcome} was modeled by multiple linear regression (least squares, `
    + `with an intercept) on ${list(result.predictors ?? preds)}`
    + (refs.length ? `, coding categorical predictors against reference levels ${refs.map(([k, v]) => `${k} = ${v}`).join(", ")}` : "")
    + `, using ${TOOL}; ${result.n_rows_analyzed} rows had complete data. `
    + `R² = ${f(result.goodness.r_squared)} (adjusted ${f(result.goodness.adjusted_r_squared)}); `
    + `F (${result.overall_test.dfn}, ${result.overall_test.dfd}) = ${f(result.overall_test.F)}, `
    + `P ${result.overall_test.p < 0.0001 ? "< 0.0001" : `= ${fmtP(result.overall_test.p)}`}. `
    + `Coefficients: ${dose.join("; ")}.`} />;
}

/* ------------------------------------------------------------ logistic */

export function LogisticResults({ result }: ResultsProps<LogisticOptions, LogisticResult>) {
  if (!result) return null;
  if (result.error) return <Problem result={result} />;
  const lr = result.likelihood_ratio_test;
  const pr = result.pseudo_r_squared;
  const hl = result.hosmer_lemeshow;
  const c = result.classification;
  const auc = result.roc.auc;
  const mc = result.model_comparison;
  const coding = Object.entries(result.outcome_coding)
    .sort((a, b) => a[1] - b[1]).map(([k, v]) => `${k} → ${v}`).join(", ");
  return (
    <Card title={`Logistic regression of ${result.outcome}`}>
      <p className="hint-block">
        Outcome coding: {coding}. {result.n_ones} rows are 1 and {result.n_zeros} are 0;
        {" "}{result.n_rows_analyzed} rows analyzed, {result.n_rows_skipped} skipped.
      </p>
      <h4>Parameter estimates</h4>
      <Grid caption="Parameter estimates"
        head={["Parameter", "Estimate", "SE", `${lvl(result.ci_level)} CI`, "|z|", "P value", "",
          "Odds ratio", `${lvl(result.ci_level)} CI of odds ratio`]}
        rows={result.coefficients.map((k, i) => [
          i === 0 ? "β0 (Intercept)" : `β${i}: ${k.name}`, f(k.estimate), f(k.se), ci(k.ci), f(k.z),
          fmtP(k.p), summaryStars(k.p), f(k.odds_ratio), ci(k.odds_ratio_ci ?? null),
        ])} />
      <p className="hint-block">
        {result.ci_method === "profile" ? "Profile-likelihood" : "Wald"} confidence intervals.
        {Object.keys(result.reference_levels).length > 0 && ` Reference levels: ${
          Object.entries(result.reference_levels).map(([k, v]) => `${k} = ${v}`).join("; ")}.`}
      </p>
      {typeof result.x_at_50_percent === "number" && (
        <KV rows={[[`${result.predictors?.[0] ?? "X"} at 50% probability`, f(result.x_at_50_percent)]]} />
      )}
      <div className="stat-cols">
        <KV title="Likelihood ratio test (vs intercept only)" rows={[
          ["G (likelihood ratio)", f(lr.G)],
          ["Degrees of freedom", String(lr.df)],
          ["P value", `${fmtP(lr.p)} ${summaryStars(lr.p)}`],
          ["AICc, intercept only", f(mc.intercept_only.aicc)],
          ["AICc, this model", f(mc.selected.aicc)],
          ["Log likelihood", f(result.log_likelihood)],
        ]} />
        <KV title="Pseudo R squared" rows={[
          ["Tjur's R squared", f(pr.tjur)],
          ["McFadden's R squared", f(pr.mcfadden)],
          ["Cox-Snell R squared", f(pr.cox_snell)],
          ["Nagelkerke R squared", f(pr.nagelkerke)],
        ]} />
      </div>
      <div className="stat-cols">
        <KV title="Hosmer-Lemeshow goodness of fit" rows={[
          ["Statistic", f(hl.statistic)],
          ["Degrees of freedom", String(hl.df)],
          ["P value", fmtP(hl.p)],
          ["Groups", String(hl.groups.length)],
        ]} />
        <KV title="Area under the ROC curve" rows={[
          ["Area", f(auc.value)],
          ["SE", f(auc.se)],
          [`${lvl(result.ci_level)} CI`, ci(auc.ci)],
          ["P value (vs 0.5)", fmtP(auc.p_vs_05)],
        ]} />
      </div>
      <h4>Classification (cutoff {f(c.cutoff)})</h4>
      <Grid caption="Classification table" head={["", "Predicted 0", "Predicted 1", "% correctly classified"]}
        rows={[
          ["Observed 0", String(c.observed_0_predicted_0), String(c.observed_0_predicted_1), pct(c.percent_correct_0)],
          ["Observed 1", String(c.observed_1_predicted_0), String(c.observed_1_predicted_1), pct(c.percent_correct_1)],
          ["Total", "", "", pct(c.percent_correct)],
        ]} />
      <KV rows={[
        ["Positive predictive power", pct(c.positive_predictive_power)],
        ["Negative predictive power", pct(c.negative_predictive_power)],
      ]} />
    </Card>
  );
}

export function LogisticMethods({ result }: ResultsProps<LogisticOptions, LogisticResult>) {
  if (!result || result.error) return null;
  const ors = result.coefficients.slice(1).map((k) =>
    `${k.name}: OR ${f(k.odds_ratio)} (${lvl(result.ci_level)} CI ${ci(k.odds_ratio_ci ?? null)})`);
  return <Methods text={`${result.outcome} was modeled by ${result.coefficients.length > 2 ? "multiple" : "simple"} `
    + `logistic regression (maximum likelihood) on ${list(result.predictors ?? [])}, with `
    + `${result.ci_method === "profile" ? "profile-likelihood" : "Wald"} confidence intervals, using ${TOOL} `
    + `(${result.n_rows_analyzed} rows; ${result.n_ones} events). Likelihood ratio test against the `
    + `intercept-only model: G = ${f(result.likelihood_ratio_test.G)}, df = ${result.likelihood_ratio_test.df}, `
    + `P ${result.likelihood_ratio_test.p < 0.0001 ? "< 0.0001" : `= ${fmtP(result.likelihood_ratio_test.p)}`}; `
    + `Tjur's R² = ${f(result.pseudo_r_squared.tjur)}; area under the ROC curve ${f(result.roc.auc.value)}. `
    + `${ors.join("; ")}.`} />;
}

/* ------------------------------------------------------------ PCA */

const SELECTION_TEXT: Record<string, string> = {
  parallel_analysis: "parallel analysis",
  kaiser: "the eigenvalue-greater-than-one rule",
  variance: "a cumulative-variance threshold",
  all: "keeping all components",
  number: "a fixed number of components",
};

export function PcaResults({ table, result }: ResultsProps<PcaOptions, PcaResult>) {
  if (!result) return null;
  if (result.error) return <Problem result={result} />;
  const pa = result.parallel_analysis;
  const sel = result.n_selected;
  const pcs = result.components;
  return (
    <Card title="Principal component analysis">
      <p className="hint-block">
        {result.names.length} variables, {result.standardized ? "standardized" : "centered (not scaled)"};
        {" "}{result.n_rows_analyzed} rows analyzed, {result.n_rows_skipped} skipped.
        {" "}{sel} component{sel === 1 ? "" : "s"} selected by {SELECTION_TEXT[result.selection] ?? result.selection}.
      </p>
      <h4>Eigenvalues</h4>
      <Grid caption="Eigenvalues"
        head={["Component", "Eigenvalue", "% of variance", "Cumulative %",
          ...(pa ? [`Parallel analysis (${formatSig(pa.percentile, 3)}th percentile)`] : []), "Selected"]}
        rows={result.eigenvalues.map((e, i) => [
          pcs[i], f(e), pct(100 * result.proportion_of_variance[i]),
          pct(100 * result.cumulative_proportion[i]),
          ...(pa ? [f(pa.upper[i])] : []), i < sel ? "Yes" : "",
        ])} />
      <h4>Loadings</h4>
      <Grid caption="Loadings" head={["Variable", ...pcs]}
        rows={result.names.map((n, i) => [n, ...result.loadings[i].map((v) => f(v))])} />
      <details className="advanced">
        <summary>Eigenvectors</summary>
        <section>
          <Grid caption="Eigenvectors" head={["Variable", ...pcs]}
            rows={result.names.map((n, i) => [n, ...result.eigenvectors[i].map((v) => f(v))])} />
        </section>
      </details>
      <details className="advanced">
        <summary>PC scores ({pcs.slice(0, sel).join(", ")})</summary>
        <section>
          <Grid caption="PC scores" head={["Row", ...pcs.slice(0, sel)]}
            rows={result.scores.flatMap((row, r) => (row
              ? [[rowLabel(table, r), ...row.map((v) => f(v))]] : []))} />
        </section>
      </details>
    </Card>
  );
}

export function PcaMethods({ result }: ResultsProps<PcaOptions, PcaResult>) {
  if (!result || result.error) return null;
  const pa = result.parallel_analysis;
  const selText = result.selection === "parallel_analysis" && pa
    ? `parallel analysis (components whose eigenvalue exceeded the ${formatSig(pa.percentile, 3)}th `
      + `percentile of eigenvalues from ${pa.n_simulations} simulated normal data sets of the same size)`
    : SELECTION_TEXT[result.selection] ?? result.selection;
  const cum = result.cumulative_proportion[result.n_selected - 1];
  return <Methods text={`Principal component analysis was performed on ${list(result.names)} `
    + `(${result.standardized ? "standardized to unit variance, i.e. on the correlation matrix"
      : "centered, i.e. on the covariance matrix"}; ${result.n_rows_analyzed} complete rows) using ${TOOL}. `
    + `Components were retained by ${selText}: ${result.n_selected} component${result.n_selected === 1 ? "" : "s"}, `
    + `explaining ${formatSig(100 * cum, 3)}% of the total variance.`} />;
}

/* ------------------------------------------------------------ extract & rearrange */

const PREVIEW = 12;

export function RearrangeResults({ sheet, table, options, result }:
  ResultsProps<RearrangeOptions, RearrangeResult>) {
  const { project } = useProject();
  const addTable = useAddDerivedTable();
  if (!result) return null;
  if (result.error) return <Problem result={result} />;
  const source = findSheet(project, sheet.parentId);
  const sourceName = source?.name ?? "data";
  const name = options.tableName.trim() || `${sourceName} (rearranged)`;
  const nOut = result.rows.length;
  const make = () => addTable(sheet.parentId, tableFromRearranged(table, result), name);
  const cell = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "number" ? f(v) : String(v));
  return (
    <Card title="Extract and rearrange">
      <p className="hint-block">
        {nOut} of {table.x.length} rows and {result.variables.length} variable
        {result.variables.length === 1 ? "" : "s"} go into the new table.
      </p>
      <div className="mv-actions">
        <button type="button" className="btn-primary" disabled={!nOut || !result.variables.length}
          onClick={make}>
          Create data table “{name}”
        </button>
      </div>
      <p className="hint-block">
        The new table is a copy: later edits here do not change it. Create it
        again after editing to get an updated copy.
      </p>
      {nOut > 0 && (
        <>
          <h4>Preview{nOut > PREVIEW ? ` (first ${PREVIEW} rows)` : ""}</h4>
          <Grid caption="Preview of the new table"
            head={["Row", ...result.variables.map((v) => v.name)]}
            rows={result.rows.slice(0, PREVIEW).map((r, i) => [
              rowLabel(table, r), ...result.variables.map((v) => cell(v.values[i])),
            ])} />
        </>
      )}
    </Card>
  );
}
