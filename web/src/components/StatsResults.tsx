import { formatSig } from "../types";

interface Props {
  result: Record<string, unknown> | null;
}

type Row = [string, string];

function fmtP(p: unknown): string {
  if (typeof p !== "number") return "n/a";
  if (p < 0.0001) return "< 0.0001";
  return formatSig(p, 4);
}

function stars(p: unknown): string {
  if (typeof p !== "number") return "";
  if (p < 0.0001) return "****";
  if (p < 0.001) return "***";
  if (p < 0.01) return "**";
  if (p < 0.05) return "*";
  return "ns";
}

function fmtCI(ci: unknown): string {
  if (!Array.isArray(ci) || ci.length !== 2) return "n/a";
  return `${formatSig(ci[0] as number)} to ${formatSig(ci[1] as number)}`;
}

function KV({ title, rows }: { title?: string; rows: Row[] }) {
  return (
    <table className="results-table goodness">
      {title && <thead><tr><th colSpan={2}>{title}</th></tr></thead>}
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}><th>{k}</th><td>{v}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */

function ColumnStats({ result }: { result: any }) {
  return (
    <>
      {result.datasets.map((ds: any, i: number) => {
        const d = ds.descriptive;
        const rows: Row[] = [
          ["n", String(d.n)],
          ["Minimum", formatSig(d.minimum)],
          ["25% percentile", formatSig(d.percentile25)],
          ["Median", formatSig(d.median)],
          ["75% percentile", formatSig(d.percentile75)],
          ["Maximum", formatSig(d.maximum)],
          ["Mean", formatSig(d.mean)],
          ["SD", formatSig(d.sd)],
          ["SEM", formatSig(d.sem)],
          ["95% CI of mean", fmtCI(d.ci_mean)],
          ["CV", d.cv_percent != null ? `${formatSig(d.cv_percent)}%` : "n/a"],
          ["Geometric mean", formatSig(d.geometric_mean)],
          ["Skewness", formatSig(d.skewness)],
          ["Kurtosis", formatSig(d.kurtosis)],
          ["Sum", formatSig(d.sum)],
        ];
        const norm: Row[] = Object.entries(ds.normality ?? {}).map(
          ([key, v]: [string, any]) => {
            const label = {
              shapiro_wilk: "Shapiro-Wilk",
              dagostino_pearson: "D'Agostino-Pearson",
              anderson_darling: "Anderson-Darling",
            }[key] ?? key;
            return [label,
              `P = ${fmtP(v.p)}, ${v.passed_alpha_05 ? "passed" : "failed"} (α=0.05)`];
          });
        const extra: Row[] = [];
        if (ds.one_sample_t) {
          const t = ds.one_sample_t;
          extra.push(
            ["One-sample t vs " + formatSig(t.hypothetical),
             `t=${formatSig(t.t)}, df=${t.df}, P=${fmtP(t.p_two_tailed)} ${stars(t.p_two_tailed)}`],
            ["Discrepancy (95% CI)",
             `${formatSig(t.discrepancy)} (${fmtCI(t.ci_discrepancy)})`],
          );
          if (ds.wilcoxon) {
            extra.push(["Wilcoxon signed rank",
              `W=${formatSig(ds.wilcoxon.W)}, P=${fmtP(ds.wilcoxon.p_two_tailed)}`]);
          }
        }
        return (
          <div key={i} className="result-card">
            <h3>{ds.name}</h3>
            <div className="stat-cols">
              <KV title="Descriptive" rows={rows} />
              <div>
                <KV title="Normality" rows={norm} />
                {extra.length > 0 && <KV title="One-sample tests" rows={extra} />}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

function TTest({ result }: { result: any }) {
  const [nameA, nameB] = result.names ?? ["A", "B"];
  const rows: Row[] = [];
  rows.push(["P value (two-tailed)", `${fmtP(result.p_two_tailed)} ${stars(result.p_two_tailed)}`]);
  if (result.t !== undefined) {
    rows.push(["t, df", `t=${formatSig(result.t)}, df=${formatSig(result.df)}`]);
  }
  if (result.U !== undefined) rows.push(["Mann-Whitney U", formatSig(result.U)]);
  if (result.W !== undefined) rows.push(["Sum of signed ranks W", formatSig(result.W)]);
  if (result.difference !== undefined) {
    rows.push(
      [`Mean of ${nameA}`, `${formatSig(result.mean_a)} ± ${formatSig(result.sem_a)} (n=${result.n_a})`],
      [`Mean of ${nameB}`, `${formatSig(result.mean_b)} ± ${formatSig(result.sem_b)} (n=${result.n_b})`],
      ["Difference between means",
       `${formatSig(result.difference)} ± ${formatSig(result.se_difference)}`],
      ["95% CI of difference", fmtCI(result.ci_difference)],
    );
  }
  if (result.mean_difference !== undefined) {
    rows.push(
      ["Mean of differences", formatSig(result.mean_difference)],
      ["95% CI of difference", fmtCI(result.ci_difference)],
    );
  }
  if (result.median_a !== undefined) {
    rows.push(
      [`Median of ${nameA}`, formatSig(result.median_a)],
      [`Median of ${nameB}`, formatSig(result.median_b)],
      ["Hodges-Lehmann difference", formatSig(result.hodges_lehmann_difference)],
    );
  }
  if (result.median_difference !== undefined) {
    rows.push(["Median of differences", formatSig(result.median_difference)]);
  }
  if (result.r_squared !== undefined) {
    rows.push(["R squared (eta squared)", formatSig(result.r_squared)]);
  }
  if (result.f_test_variances) {
    const f = result.f_test_variances;
    rows.push(["F test (variances)",
      `F=${formatSig(f.F)} (${f.dfn}, ${f.dfd}), P=${fmtP(f.p)}`]);
  }
  if (result.pairing_correlation?.r != null &&
      !Number.isNaN(result.pairing_correlation.r)) {
    rows.push(["Pairing effectiveness",
      `r=${formatSig(result.pairing_correlation.r)}, P=${fmtP(result.pairing_correlation.p)}`]);
  }
  return (
    <div className="result-card">
      <h3>{nameA} vs. {nameB}</h3>
      <KV rows={rows} />
    </div>
  );
}

function ComparisonsTable({ mc }: { mc: any }) {
  return (
    <table className="results-table">
      <thead>
        <tr>
          <th>Comparison</th><th>Difference</th><th>CI</th>
          <th>Adjusted P</th><th>Summary</th>
        </tr>
      </thead>
      <tbody>
        {mc.comparisons.map((c: any, i: number) => (
          <tr key={i}>
            <th>{c.pair}</th>
            <td>{formatSig(c.difference ?? c.mean_rank_difference)}</td>
            <td>{fmtCI(c.ci)}</td>
            <td>{fmtP(c.p_adjusted)}</td>
            <td>{stars(c.p_adjusted)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Anova({ result }: { result: any }) {
  if (result.kind === "nonparametric") {
    return (
      <div className="result-card">
        <h3>Kruskal-Wallis test</h3>
        <KV rows={[
          ["Kruskal-Wallis H", formatSig(result.H)],
          ["P value", `${fmtP(result.p)} ${stars(result.p)}`],
        ]} />
        {result.dunns && (
          <>
            <h4>Dunn's multiple comparisons</h4>
            <ComparisonsTable mc={result.dunns} />
          </>
        )}
      </div>
    );
  }
  const t = result.table;
  return (
    <div className="result-card">
      <h3>Ordinary one-way ANOVA</h3>
      <KV rows={[
        ["F (DFn, DFd)", `F(${t.df_between}, ${t.df_within}) = ${formatSig(t.F)}`],
        ["P value", `${fmtP(t.p)} ${stars(t.p)}`],
        ["R squared", formatSig(t.r_squared)],
        ["SS (treatment / residual)",
         `${formatSig(t.ss_between)} / ${formatSig(t.ss_within)}`],
        ["Brown-Forsythe",
         `F=${formatSig(result.brown_forsythe.F)}, P=${fmtP(result.brown_forsythe.p)}`],
        ["Bartlett's",
         `${formatSig(result.bartlett.statistic)}, P=${fmtP(result.bartlett.p)}`],
      ]} />
      {result.multiple_comparisons && (
        <>
          <h4>
            {String(result.multiple_comparisons.method).replace("_", "-")} multiple
            comparisons (df={result.multiple_comparisons.df})
          </h4>
          <ComparisonsTable mc={result.multiple_comparisons} />
        </>
      )}
    </div>
  );
}

function Outliers({ result }: { result: any }) {
  return (
    <>
      {result.datasets.map((ds: any, i: number) => (
        <div key={i} className="result-card">
          <h3>{ds.name}: Grubbs' test (α={ds.alpha})</h3>
          {ds.outliers.length === 0 ? (
            <p className="model-line">No outliers detected (n={ds.n}).</p>
          ) : (
            <KV rows={ds.outliers.map((o: any, j: number) => [
              `Outlier ${j + 1}`,
              `${formatSig(o.value)} (G=${formatSig(o.G)} > ${formatSig(o.G_critical)})`,
            ])} />
          )}
        </div>
      ))}
    </>
  );
}

function Correlation({ result }: { result: any }) {
  const [a, b] = result.names ?? ["A", "B"];
  const rows: Row[] = [
    [result.method === "pearson" ? "Pearson r" : "Spearman r", formatSig(result.r)],
    ["95% CI of r", fmtCI(result.ci_r)],
    ["P value (two-tailed)", `${fmtP(result.p_two_tailed)} ${stars(result.p_two_tailed)}`],
    ["n (XY pairs)", String(result.n)],
  ];
  if (result.r_squared !== undefined) {
    rows.splice(2, 0, ["R squared", formatSig(result.r_squared)]);
  }
  return (
    <div className="result-card">
      <h3>Correlation: {a} vs. {b}</h3>
      <KV rows={rows} />
    </div>
  );
}

function TwoWayAnova({ result }: { result: any }) {
  const entries = Object.entries(result.sources) as [string, any][];
  return (
    <div className="result-card">
      <h3>Two-way ANOVA ({result.type})</h3>
      <table className="results-table">
        <thead>
          <tr>
            <th>Source of variation</th><th>% of total</th><th>SS</th>
            <th>DF</th><th>MS</th><th>F</th><th>P value</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([name, s]) => (
            <tr key={name}>
              <th>{name}</th>
              <td>{s.percent_of_total != null
                ? `${formatSig(s.percent_of_total, 3)}%` : "n/a"}</td>
              <td>{formatSig(s.ss)}</td>
              <td>{s.df}</td>
              <td>{formatSig(s.ms)}</td>
              <td>{s.F != null ? formatSig(s.F) : "n/a"}</td>
              <td>{s.p != null ? `${fmtP(s.p)} ${stars(s.p)}` : "n/a"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {result.multiple_comparisons && (
        <>
          <h4>
            {String(result.multiple_comparisons.method) === "tukey"
              ? "Tukey" : String(result.multiple_comparisons.method)
                .replace(/^./, (ch: string) => ch.toUpperCase())}{" "}
            multiple comparisons
            (MS<sub>residual</sub> = {formatSig(result.multiple_comparisons.ms_residual)},
            df = {result.multiple_comparisons.df_residual})
          </h4>
          <table className="results-table">
            <thead>
              <tr>
                <th>Family</th><th>Comparison</th><th>Difference</th>
                <th>95% CI</th><th>Adjusted P</th><th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {result.multiple_comparisons.comparisons.map((c: any, i: number) => (
                <tr key={i}>
                  <th>{c.family}</th>
                  <th>{c.pair}</th>
                  <td>{formatSig(c.difference)}</td>
                  <td>{fmtCI(c.ci95)}</td>
                  <td>{fmtP(c.p_adjusted)}</td>
                  <td>{stars(c.p_adjusted)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function RMTwoWay({ result }: { result: any }) {
  const order = ["interaction", "row_factor", "column_factor",
    "subjects", "residual"];
  const entries = order
    .filter((k) => result.sources[k])
    .map((k) => [k, result.sources[k]] as [string, any]);
  const label: Record<string, string> = {
    interaction: "Interaction",
    row_factor: "Row factor (repeated)",
    column_factor: "Column factor",
    subjects: "Subjects",
    residual: "Residual (within-subject)",
  };
  return (
    <div className="result-card">
      <h3>Two-way repeated-measures ANOVA</h3>
      <p className="model-line">{result.design}, n = {result.n_subjects}{" "}
        subjects{result.gg_epsilon != null &&
          `, Geisser-Greenhouse ε = ${formatSig(result.gg_epsilon)}`}</p>
      <table className="results-table">
        <thead>
          <tr>
            <th>Source of variation</th><th>% of total</th><th>SS</th>
            <th>DF</th><th>MS</th><th>F</th><th>P value</th><th>P (GG)</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([name, s]) => (
            <tr key={name}>
              <th>{label[name] ?? name}</th>
              <td>{s.percent_of_total != null
                ? `${formatSig(s.percent_of_total, 3)}%` : "n/a"}</td>
              <td>{formatSig(s.ss)}</td>
              <td>{s.df}</td>
              <td>{formatSig(s.ms)}</td>
              <td>{s.F != null ? formatSig(s.F) : "n/a"}</td>
              <td>{s.p != null ? `${fmtP(s.p)} ${stars(s.p)}` : "n/a"}</td>
              <td>{s.p_geisser_greenhouse != null
                ? fmtP(s.p_geisser_greenhouse) : "n/a"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RMAnova({ result }: { result: any }) {
  const t = result.table;
  return (
    <div className="result-card">
      <h3>Repeated-measures one-way ANOVA</h3>
      <KV rows={[
        ["F (treatment)", formatSig(t.F)],
        ["P (Geisser-Greenhouse corrected)",
         `${fmtP(t.p_geisser_greenhouse)} ${stars(t.p_geisser_greenhouse)}`],
        ["P (assuming sphericity)", fmtP(t.p_assuming_sphericity)],
        ["Geisser-Greenhouse epsilon", formatSig(t.gg_epsilon)],
        ["SS treatment / subject / error",
         `${formatSig(t.ss_treatment)} / ${formatSig(t.ss_subject)} / ${formatSig(t.ss_error)}`],
        ["n subjects (complete rows)", String(result.n_subjects)],
        ["R squared", formatSig(result.r_squared)],
      ]} />
    </div>
  );
}

function Friedman({ result }: { result: any }) {
  return (
    <div className="result-card">
      <h3>Friedman test</h3>
      <KV rows={[
        ["Friedman statistic", formatSig(result.statistic)],
        ["P value", `${fmtP(result.p)} ${stars(result.p)}`],
        ["n subjects", String(result.n_subjects)],
      ]} />
      {result.dunns && (
        <>
          <h4>Dunn's multiple comparisons</h4>
          <ComparisonsTable mc={result.dunns} />
        </>
      )}
    </div>
  );
}

function Roc({ result }: { result: any }) {
  const [pat, ctl] = result.names ?? ["patients", "controls"];
  return (
    <div className="result-card">
      <h3>ROC: {pat} vs. {ctl}</h3>
      <KV rows={[
        ["Area under the ROC curve", formatSig(result.auc.value)],
        ["SE (DeLong)", formatSig(result.auc.se)],
        ["95% CI", fmtCI(result.auc.ci)],
        ["P (AUC vs 0.5)", `${fmtP(result.auc.p_vs_05)} ${stars(result.auc.p_vs_05)}`],
        ["n patients / controls",
         `${result.n_patients} / ${result.n_controls}`],
      ]} />
    </div>
  );
}

function BlandAltman({ result }: { result: any }) {
  const [a, b] = result.names ?? ["A", "B"];
  return (
    <div className="result-card">
      <h3>Bland-Altman: {a} vs. {b}</h3>
      <KV rows={[
        ["Bias (mean difference)",
         `${formatSig(result.bias.value)} (95% CI ${fmtCI(result.bias.ci)})`],
        ["SD of differences", formatSig(result.sd_of_differences)],
        ["95% limits of agreement",
         `${formatSig(result.loa_lower.value)} to ${formatSig(result.loa_upper.value)}`],
        ["n pairs", String(result.n)],
      ]} />
    </div>
  );
}

function RoutColumn({ result }: { result: any }) {
  return (
    <>
      {result.datasets.map((ds: any, i: number) => (
        <div key={i} className="result-card">
          <h3>{ds.name}: ROUT (Q = {ds.q * 100}%)</h3>
          {ds.outliers.length === 0 ? (
            <p className="model-line">No outliers detected (n={ds.n}).</p>
          ) : (
            <KV rows={[["Outliers",
              ds.outliers.map((v: number) => formatSig(v)).join(", ")]]} />
          )}
        </div>
      ))}
    </>
  );
}

export default function StatsResults({ result }: Props) {
  if (!result) return null;
  if (result.error) {
    return <div className="results-error">Analysis failed: {String(result.error)}</div>;
  }
  switch (result.analysis) {
    case "column_statistics": return <ColumnStats result={result} />;
    case "ttest": return <TTest result={result} />;
    case "anova": return <Anova result={result} />;
    case "rm_one_way_anova": return <RMAnova result={result} />;
    case "friedman": return <Friedman result={result} />;
    case "two_way_anova": return <TwoWayAnova result={result} />;
    case "rm_two_way_mixed":
    case "rm_two_way_both": return <RMTwoWay result={result} />;
    case "correlation": return <Correlation result={result} />;
    case "roc": return <Roc result={result} />;
    case "bland_altman": return <BlandAltman result={result} />;
    case "outliers": return <Outliers result={result} />;
    case "rout_column": return <RoutColumn result={result} />;
    default: return null;
  }
}
