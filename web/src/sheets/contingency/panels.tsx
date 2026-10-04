import { formatSig } from "../../types";
import { tableP } from "../../report/pformat";
import type { ControlsProps, ResultsProps } from "../types";
import {
  DIFF_CI_LABELS, OR_CI_LABELS, PROP_CI_LABELS, RR_CI_LABELS, readCounts, strataOf,
  trendApplies,
  type CmhOptions, type ContingencyOptions, type DiffCI, type KappaOptions, type ORCI,
  type PropCI, type ProportionOptions, type RRCI,
} from "./run";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** P in the project's P-value style (src/report/pformat.ts). */
function fmtP(p: any): string {
  return tableP(p);
}

function fmtCI(ci: any): string {
  if (!Array.isArray(ci)) return "n/a";
  const f = (v: any) => (v === null || v === undefined ? "∞"
    : typeof v === "number" && !Number.isFinite(v) ? "∞" : formatSig(v));
  return `${f(ci[0])} to ${f(ci[1])}`;
}

/** "P = 0.012" or "P < 0.0001". */
const Pv = (p: any) => {
  const f = fmtP(p);
  return f.startsWith("<") ? `P ${f}` : `P = ${f}`;
};

/** NNT CI in increasing order (the engine gives 1/upper, 1/lower). */
const nntCI = (nnt: any) => (Array.isArray(nnt?.ci) && !nnt.ci_includes_infinity
  ? [...nnt.ci].sort((a: number, b: number) => a - b) : nnt?.ci);

const pct = (v: any) => (typeof v === "number" ? `${formatSig(100 * v, 4)}%` : "n/a");

function Select<T extends string>({ label, value, labels, onChange }: {
  label: string; value: T; labels: Record<T, string>; onChange: (v: T) => void;
}) {
  return (
    <label className="check-row">
      <span>{label}</span>
      <select value={value} aria-label={label} onChange={(e) => onChange(e.target.value as T)}>
        {(Object.keys(labels) as T[]).map((k) => <option key={k} value={k}>{labels[k]}</option>)}
      </select>
    </label>
  );
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <table className="results-table goodness">
      <tbody>
        {rows.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}
      </tbody>
    </table>
  );
}

function Failed({ result }: { result: any }) {
  return <div className="results-error">{String(result.error)}</div>;
}

// ------------------------------------------------------------ main analysis

export function ContingencyControls({ table, options, onChange }: ControlsProps<ContingencyOptions>) {
  const set = (patch: Partial<ContingencyOptions>) => onChange({ ...options, ...patch });
  const c = readCounts(table);
  const counts = "error" in c ? [] : c.counts;
  const is2x2 = counts.length === 2 && counts[0]?.length === 2;
  const canTrend = trendApplies(counts);
  return (
    <div className="controls">
      <section>
        <h3>How to enter data</h3>
        <p className="hint-block">
          Rows are groups (e.g. exposed / not exposed); columns are
          outcomes. Enter the number of subjects in each cell as counts,
          not percentages. Click a label to rename it.
        </p>
      </section>
      <section>
        <h3>Which test</h3>
        <p className="hint-block">
          For 2×2 tables, Fisher&apos;s exact test is reported and
          recommended. Chi-square (with and without Yates&apos;
          correction) covers larger tables; odds ratio, relative risk
          and sensitivity/specificity are computed for 2×2.
        </p>
      </section>
      <section>
        <h3>Effect sizes</h3>
        <label className="check-row">
          <input type="checkbox" checked={options.effectSizes}
            onChange={(e) => set({ effectSizes: e.target.checked })} />
          <span>{is2x2
            ? "Relative risk, difference, odds ratio, NNT and diagnostic accuracy with chosen CI methods"
            : "Effect size (Cramér's V)"}</span>
        </label>
        {options.effectSizes && is2x2 && (
          <>
            <Select label="Relative risk CI" value={options.rrCi} labels={RR_CI_LABELS}
              onChange={(rrCi: RRCI) => set({ rrCi })} />
            <Select label="Difference CI" value={options.diffCi} labels={DIFF_CI_LABELS}
              onChange={(diffCi: DiffCI) => set({ diffCi })} />
            <Select label="Odds ratio CI" value={options.orCi} labels={OR_CI_LABELS}
              onChange={(orCi: ORCI) => set({ orCi })} />
            <Select label="Proportion CI" value={options.propCi} labels={PROP_CI_LABELS}
              onChange={(propCi: PropCI) => set({ propCi })} />
            <Select label="Rows are" value={options.diagnosticLayout}
              labels={{ rows_condition: "the condition (present / absent)",
                rows_test: "the test result (positive / negative)" }}
              onChange={(diagnosticLayout) => set({ diagnosticLayout })} />
          </>
        )}
      </section>
      <section>
        <h3>Test for trend</h3>
        <label className="check-row">
          <input type="checkbox" checked={options.trend} disabled={!canTrend && !options.trend}
            onChange={(e) => set({ trend: e.target.checked })} />
          <span>Chi-square test for trend (groups in a natural order)</span>
        </label>
        {canTrend ? options.trend && (
          <label className="check-row">
            <span>Scores</span>
            <input className="interp-input" value={options.trendScores}
              aria-label="Scores of the ordered groups" placeholder="1, 2, 3, … (default)"
              onChange={(e) => set({ trendScores: e.target.value })} />
          </label>
        ) : (
          <p className="hint-block">
            Needs two outcome columns and three or more ordered rows (or
            two rows and three or more ordered columns).
          </p>
        )}
      </section>
    </div>
  );
}

function EffectSizes({ es }: { es: any }) {
  const d = es.diagnostic ?? {};
  const rows: [string, string][] = [];
  const level = `${Math.round(100 * (es.ci_level ?? 0.95))}% CI`;
  if (es.relative_risk) {
    rows.push([`Relative risk (${RR_CI_LABELS[es.relative_risk.ci_method as RRCI] ?? es.relative_risk.ci_method} ${level})`,
      `${formatSig(es.relative_risk.value)} (${fmtCI(es.relative_risk.ci)})`]);
    if (es.relative_risk.reciprocal != null) {
      rows.push(["Reciprocal of the relative risk",
        `${formatSig(es.relative_risk.reciprocal)} (${fmtCI(es.relative_risk.reciprocal_ci)})`]);
    }
  }
  if (es.difference) {
    rows.push([`Difference between proportions (${DIFF_CI_LABELS[es.difference.ci_method as DiffCI] ?? es.difference.ci_method} ${level})`,
      `${formatSig(es.difference.value)} (${fmtCI(es.difference.ci)})`]);
  }
  if (es.nnt) {
    rows.push(["Number needed to treat (NNT)",
      `${formatSig(es.nnt.value)} (${es.nnt.ci_includes_infinity
        ? `CI includes infinity: ${fmtCI(es.nnt.ci)}` : fmtCI(nntCI(es.nnt))})`]);
  }
  if (es.odds_ratio) {
    rows.push([`Odds ratio (${OR_CI_LABELS[es.odds_ratio.ci_method as ORCI] ?? es.odds_ratio.ci_method} ${level})`,
      `${formatSig(es.odds_ratio.value)} (${fmtCI(es.odds_ratio.ci)})`]);
    if (es.odds_ratio.reciprocal != null) {
      rows.push(["Reciprocal of the odds ratio", formatSig(es.odds_ratio.reciprocal)]);
    }
  }
  const diag: [string, any][] = [
    ["Sensitivity", d.sensitivity], ["Specificity", d.specificity],
    ["Positive predictive value", d.positive_predictive_value],
    ["Negative predictive value", d.negative_predictive_value],
  ];
  for (const [label, v] of diag) {
    if (v) rows.push([`${label} (${PROP_CI_LABELS[d.ci_method as PropCI] ?? d.ci_method})`,
      `${pct(v.value)} (${v.numerator}/${v.denominator}; ${fmtCI(v.ci?.map((x: number) => 100 * x))}%)`]);
  }
  if (d.likelihood_ratio) {
    rows.push(["Likelihood ratio (positive test)",
      `${formatSig(d.likelihood_ratio.value)} (${fmtCI(d.likelihood_ratio.ci)})`]);
  }
  if (d.negative_likelihood_ratio) {
    rows.push(["Likelihood ratio (negative test)",
      `${formatSig(d.negative_likelihood_ratio.value)} (${fmtCI(d.negative_likelihood_ratio.ci)})`]);
  }
  if (typeof es.phi === "number") rows.push(["Phi coefficient", formatSig(es.phi)]);
  return (
    <>
      <h4>Effect sizes</h4>
      <Rows rows={rows} />
    </>
  );
}

function Trend({ t }: { t: any }) {
  return (
    <>
      <h4>Chi-square test for trend</h4>
      <Rows rows={[
        ["Chi-square for trend, df", `${formatSig(t.chi2)}, ${t.df}`],
        ["P value (trend)", fmtP(t.p)],
        ["z, slope of the proportions", `${formatSig(t.z)}, ${formatSig(t.slope)} per score unit`],
        ["Ordered groups", t.orientation === "columns" ? "columns" : "rows"],
        ["Scores", (t.scores ?? []).map((v: number) => formatSig(v)).join(", ")],
        ["Proportions in the first outcome", (t.proportions ?? []).map((v: number) => formatSig(v)).join(", ")],
        ["Overall chi-square, df", `${formatSig(t.overall_chi_square?.chi2)}, ${t.overall_chi_square?.df}, ${Pv(t.overall_chi_square?.p)}`],
        ...(t.departure_from_trend ? [["Departure from linear trend",
          `chi-square ${formatSig(t.departure_from_trend.chi2)}, df ${t.departure_from_trend.df}, ${Pv(t.departure_from_trend.p)}`] as [string, string]] : []),
      ]} />
    </>
  );
}

export function ContingencyResults({ table, result }: ResultsProps<ContingencyOptions, any>) {
  if (!result) return null;
  if (result.error) return <Failed result={result} />;
  const is2x2 = table.x.length === 2 && table.datasets.length === 2;
  return (
    <div className="result-card">
      <h3>Contingency table analysis</h3>
      <table className="results-table goodness">
        <tbody>
          {is2x2 && result.fisher_exact && (
            <tr>
              <th>Fisher's exact test (recommended for 2×2)</th>
              <td>P = {fmtP(result.fisher_exact.p)}</td>
            </tr>
          )}
          {result.chi_square && (
            <tr>
              <th>Chi-square, df</th>
              <td>
                {formatSig(result.chi_square.chi2)}, {result.chi_square.df}
                {", "}P = {fmtP(result.chi_square.p)}
              </td>
            </tr>
          )}
          {result.chi_square_yates && (
            <tr>
              <th>Chi-square with Yates' correction</th>
              <td>{formatSig(result.chi_square_yates.chi2)}, P ={" "}
                {fmtP(result.chi_square_yates.p)}</td>
            </tr>
          )}
          {result.odds_ratio && (
            <tr>
              <th>Odds ratio (Woolf 95% CI)</th>
              <td>{formatSig(result.odds_ratio.value)}{" "}
                ({fmtCI(result.odds_ratio.ci)})</td>
            </tr>
          )}
          {result.relative_risk && (
            <tr>
              <th>Relative risk (95% CI)</th>
              <td>{formatSig(result.relative_risk.value)}{" "}
                ({fmtCI(result.relative_risk.ci)})</td>
            </tr>
          )}
          {result.proportions && (
            <tr>
              <th>Difference between proportions</th>
              <td>{formatSig(result.proportions.p1)} −{" "}
                {formatSig(result.proportions.p2)} ={" "}
                {formatSig(result.proportions.difference)}</td>
            </tr>
          )}
          {result.sensitivity && (
            <>
              <tr>
                <th>Sensitivity (Wilson 95% CI)</th>
                <td>{formatSig(result.sensitivity.value)}{" "}
                  ({fmtCI(result.sensitivity.ci)})</td>
              </tr>
              <tr>
                <th>Specificity (Wilson 95% CI)</th>
                <td>{formatSig(result.specificity.value)}{" "}
                  ({fmtCI(result.specificity.ci)})</td>
              </tr>
            </>
          )}
          {result.cramers_v && (
            <tr>
              <th>Cramér&apos;s V</th>
              <td>{formatSig(result.cramers_v.value)}</td>
            </tr>
          )}
        </tbody>
      </table>
      {result.effect_sizes && <EffectSizes es={result.effect_sizes} />}
      {result.trend && <Trend t={result.trend} />}
    </div>
  );
}

// ------------------------------------------------------------ McNemar

export function McNemarControls({ table }: ControlsProps<Record<string, never>>) {
  const c = readCounts(table);
  const n = "error" in c ? 0 : c.counts.length;
  return (
    <div className="controls">
      <section>
        <h3>Paired design</h3>
        <p className="hint-block">
          Use this when each subject is measured twice (before and after),
          or each case is matched with one control. Count <em>pairs</em>, not
          subjects: rows are the outcome of the first member of the pair,
          columns the outcome of the second, in the same order. A 2×2 table
          gives McNemar&apos;s test; a larger square table gives Bowker&apos;s
          test of symmetry.
        </p>
        <p className="hint-block">
          Only the discordant pairs (the off-diagonal cells) carry
          information about a difference.
        </p>
        {n > 0 && (n !== ("error" in c ? 0 : c.counts[0].length)) && (
          <p className="results-error">This table is not square.</p>
        )}
      </section>
    </div>
  );
}

export function McNemarResults({ result }: ResultsProps<unknown, any>) {
  if (!result) return null;
  if (result.error) return <Failed result={result} />;
  if (result.test === "bowker") {
    return (
      <div className="result-card">
        <h3>Bowker&apos;s test of symmetry (paired data)</h3>
        <Rows rows={[
          ["Chi-square, df", `${formatSig(result.chi2)}, ${result.df}`],
          ["P value", fmtP(result.p)],
          ["Number of pairs", formatSig(result.n_pairs)],
        ]} />
      </div>
    );
  }
  const [b, c] = result.discordant ?? [];
  return (
    <div className="result-card">
      <h3>McNemar&apos;s test (paired data)</h3>
      <Rows rows={[
        ["Discordant pairs (row 1 / column 2, row 2 / column 1)", `${formatSig(b)}, ${formatSig(c)}`],
        ["Number of pairs", formatSig(result.n_pairs)],
        ...(result.note ? [["Note", String(result.note)] as [string, string]] : []),
        ...(result.binomial ? [["P value, exact binomial test (recommended)",
          fmtP(result.binomial.p_two_tailed)] as [string, string]] : []),
        ...(result.chi_square ? [["Chi-square, df (no correction)",
          `${formatSig(result.chi_square.chi2)}, ${result.chi_square.df}, ${Pv(result.chi_square.p)}`] as [string, string]] : []),
        ...(result.chi_square_yates ? [["Chi-square with Yates' correction",
          `${formatSig(result.chi_square_yates.chi2)}, ${Pv(result.chi_square_yates.p)}`] as [string, string]] : []),
        ...(result.odds_ratio ? [["Odds ratio (discordant pairs, exact 95% CI)",
          `${formatSig(result.odds_ratio.value)} (${fmtCI(result.odds_ratio.ci)})`] as [string, string]] : []),
      ]} />
    </div>
  );
}

// ------------------------------------------------------------ CMH

export function CmhControls({ table, options, onChange }: ControlsProps<CmhOptions>) {
  const c = readCounts(table);
  const strata = "error" in c ? c : strataOf(c);
  return (
    <div className="controls">
      <section>
        <h3>Stratified 2×2 tables</h3>
        <p className="hint-block">
          Enter two outcome columns and two rows per stratum: rows 1–2 are
          the first stratum, rows 3–4 the second, and so on (insert rows as
          needed). Name a stratum by starting both of its row titles with
          the same word and a colon, e.g. &ldquo;Site A: exposed&rdquo; and
          &ldquo;Site A: not exposed&rdquo;.
        </p>
        {"error" in strata ? <p className="hint-block">{strata.error}</p> : (
          <p className="hint-block">
            {strata.length} strata: {strata.map((s) => s.name).join(", ")}.
          </p>
        )}
      </section>
      <section>
        <h3>Options</h3>
        <label className="check-row">
          <input type="checkbox" checked={options.correction}
            onChange={(e) => onChange({ ...options, correction: e.target.checked })} />
          <span>Continuity correction in the CMH test</span>
        </label>
      </section>
    </div>
  );
}

export function CmhResults({ result }: ResultsProps<CmhOptions, any>) {
  if (!result) return null;
  if (result.error) return <Failed result={result} />;
  const rows: [string, string][] = [["Number of strata", String(result.n_strata)]];
  if (result.cmh_test) {
    rows.push([`Cochran-Mantel-Haenszel chi-square, df${result.cmh_test.continuity_correction ? " (corrected)" : ""}`,
      `${formatSig(result.cmh_test.chi2)}, ${result.cmh_test.df}`],
    ["P value", fmtP(result.cmh_test.p)]);
  }
  if (result.odds_ratio) {
    rows.push([`Common odds ratio (Mantel-Haenszel, ${result.odds_ratio.ci_method} 95% CI)`,
      `${formatSig(result.odds_ratio.value)} (${fmtCI(result.odds_ratio.ci)})`]);
  }
  if (result.relative_risk) {
    rows.push([`Common relative risk (Mantel-Haenszel, ${result.relative_risk.ci_method} 95% CI)`,
      `${formatSig(result.relative_risk.value)} (${fmtCI(result.relative_risk.ci)})`]);
  }
  if (result.breslow_day) {
    rows.push(["Breslow-Day test of equal odds ratios",
      `chi-square ${formatSig(result.breslow_day.chi2)}, df ${result.breslow_day.df}, ${Pv(result.breslow_day.p)}`],
    ["… with Tarone's adjustment",
      `chi-square ${formatSig(result.breslow_day.chi2_tarone)}, ${Pv(result.breslow_day.p_tarone)}`]);
  }
  return (
    <div className="result-card">
      <h3>Cochran-Mantel-Haenszel analysis</h3>
      <Rows rows={rows} />
      {Array.isArray(result.strata) && (
        <>
          <h4>Strata</h4>
          <table className="results-table">
            <thead><tr><th>Stratum</th><th>n</th><th>Odds ratio</th></tr></thead>
            <tbody>
              {result.strata.map((s: any) => (
                <tr key={s.name}><th>{s.name}</th><td>{formatSig(s.n)}</td>
                  <td>{s.odds_ratio == null ? "n/a" : formatSig(s.odds_ratio)}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------ kappa

export function KappaControls({ options, onChange }: ControlsProps<KappaOptions>) {
  return (
    <div className="controls">
      <section>
        <h3>Agreement between two raters</h3>
        <p className="hint-block">
          Rows are the categories given by rater 1, columns the same
          categories (same order) given by rater 2; each cell counts the
          subjects rated that way. Agreement lies on the diagonal.
        </p>
      </section>
      <section>
        <h3>Weights</h3>
        <Select label="Disagreements count" value={options.weights}
          labels={{ none: "All equally (unweighted kappa)",
            linear: "By distance (linear weights)", quadratic: "By squared distance (quadratic weights)" }}
          onChange={(weights) => onChange({ ...options, weights })} />
        <p className="hint-block">Weights suit ordered categories.</p>
      </section>
    </div>
  );
}

export function KappaResults({ result }: ResultsProps<KappaOptions, any>) {
  if (!result) return null;
  if (result.error) return <Failed result={result} />;
  return (
    <div className="result-card">
      <h3>Cohen&apos;s kappa{result.weights === "linear" || result.weights === "quadratic"
        ? ` (${result.weights} weights)` : " (unweighted)"}</h3>
      <Rows rows={[
        ["Kappa", formatSig(result.kappa)],
        ["SE", formatSig(result.se)],
        ["95% CI", fmtCI(result.ci)],
        ["Strength of agreement", String(result.strength ?? "n/a")],
        ["z (kappa vs. 0), P", `${formatSig(result.z)}, ${Pv(result.p)}`],
        ["Observed agreement", pct(result.observed_agreement)],
        ["Agreement expected by chance", pct(result.expected_agreement)],
        ["Number of subjects", formatSig(result.n)],
      ]} />
    </div>
  );
}

// ------------------------------------------------------------ proportions

export function ProportionControls({ table, options, onChange }: ControlsProps<ProportionOptions>) {
  const set = (patch: Partial<ProportionOptions>) => onChange({ ...options, ...patch });
  const c = readCounts(table);
  const titles = "error" in c ? [] : c.rowTitles;
  const pick = (label: string, key: "rowA" | "rowB") => (
    <label className="check-row">
      <span>{label}</span>
      <select value={options[key]} aria-label={label}
        onChange={(e) => set({ [key]: Number(e.target.value) })}>
        {titles.map((t, i) => <option key={i} value={i}>{t}</option>)}
      </select>
    </label>
  );
  return (
    <div className="controls">
      <section>
        <h3>Data</h3>
        <p className="hint-block">
          Each row is a group: the first column counts subjects with the
          outcome, the second those without it.
        </p>
        <Select label="Analyze" value={options.mode}
          labels={{ one: "One proportion (CI, binomial test)", two: "Compare two proportions" }}
          onChange={(mode) => set({ mode })} />
        {pick(options.mode === "one" ? "Group" : "Group 1", "rowA")}
        {options.mode === "two" && pick("Group 2", "rowB")}
        {options.mode === "one" && (
          <label className="check-row">
            <span>Hypothetical proportion</span>
            <input className="constraint-value" inputMode="decimal" placeholder="e.g. 0.5"
              aria-label="Hypothetical proportion"
              value={options.p0} onChange={(e) => set({ p0: e.target.value })} />
          </label>
        )}
      </section>
      <section>
        <h3>Confidence intervals</h3>
        <Select label="Proportion CI" value={options.ciMethod} labels={PROP_CI_LABELS}
          onChange={(ciMethod) => set({ ciMethod })} />
        {options.mode === "two" && (
          <>
            <Select label="Difference CI" value={options.diffCi} labels={DIFF_CI_LABELS}
              onChange={(diffCi) => set({ diffCi })} />
            <Select label="Relative risk CI" value={options.rrCi} labels={RR_CI_LABELS}
              onChange={(rrCi) => set({ rrCi })} />
            <Select label="Odds ratio CI" value={options.orCi} labels={OR_CI_LABELS}
              onChange={(orCi) => set({ orCi })} />
          </>
        )}
      </section>
    </div>
  );
}

export function ProportionResults({ result }: ResultsProps<ProportionOptions, any>) {
  if (!result) return null;
  if (result.error) return <Failed result={result} />;
  if (!result.groups) {
    const rows: [string, string][] = [
      ["Proportion", `${formatSig(result.proportion)} (${result.successes} of ${result.trials})`],
      [`95% CI (${PROP_CI_LABELS[result.ci_method as PropCI] ?? result.ci_method})`, fmtCI(result.ci)],
    ];
    if (result.binomial_test) {
      rows.push([`Binomial test vs. ${formatSig(result.hypothetical)}`,
        `${Pv(result.binomial_test.p_two_tailed)} (two-tailed), ${fmtP(result.binomial_test.p_one_tailed)} (one-tailed)`]);
    }
    return (
      <div className="result-card">
        <h3>{result.names?.[0] ?? "Proportion"}</h3>
        <Rows rows={rows} />
      </div>
    );
  }
  const [a, b] = result.names ?? ["Group 1", "Group 2"];
  const [ga, gb] = result.groups;
  return (
    <div className="result-card">
      <h3>Two proportions: {a} vs. {b}</h3>
      <Rows rows={[
        [`${a}`, `${formatSig(ga.proportion)} (${ga.successes}/${ga.trials}; 95% CI ${fmtCI(ga.ci)})`],
        [`${b}`, `${formatSig(gb.proportion)} (${gb.successes}/${gb.trials}; 95% CI ${fmtCI(gb.ci)})`],
        ["Fisher's exact test", `${Pv(result.fisher_exact?.p)}`],
        ...(result.z_test ? [["z test (chi-square without correction)",
          `z = ${formatSig(result.z_test.z)}, ${Pv(result.z_test.p)}`] as [string, string]] : []),
        ...(result.z_test_yates ? [["z test with continuity correction",
          `z = ${formatSig(result.z_test_yates.z)}, ${Pv(result.z_test_yates.p)}`] as [string, string]] : []),
        ...(result.difference_ci ? [[`Difference (${DIFF_CI_LABELS[result.difference_ci.ci_method as DiffCI] ?? result.difference_ci.ci_method} 95% CI)`,
          `${formatSig(result.difference_ci.value)} (${fmtCI(result.difference_ci.ci)})`] as [string, string]] : []),
        ...(result.nnt ? [["Number needed to treat",
          `${formatSig(result.nnt.value)} (${result.nnt.ci_includes_infinity ? "CI includes infinity: " : ""}${fmtCI(nntCI(result.nnt))})`] as [string, string]] : []),
        ...(result.relative_risk ? [[`Relative risk (${RR_CI_LABELS[result.relative_risk.ci_method as RRCI] ?? result.relative_risk.ci_method} 95% CI)`,
          `${formatSig(result.relative_risk.value)} (${fmtCI(result.relative_risk.ci)})`] as [string, string]] : []),
        ...(result.odds_ratio ? [[`Odds ratio (${OR_CI_LABELS[result.odds_ratio.ci_method as ORCI] ?? result.odds_ratio.ci_method} 95% CI)`,
          `${formatSig(result.odds_ratio.value)} (${fmtCI(result.odds_ratio.ci)})`] as [string, string]] : []),
      ]} />
    </div>
  );
}
