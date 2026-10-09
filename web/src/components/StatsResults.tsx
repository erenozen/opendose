import { formatSig } from "../types";
import { pLabel, tableP, tableStars } from "../report/pformat";
import { adjustedHeader, familyOf, hasUnadjusted } from "../report/family";
import FamilyLine from "../sheets/common/FamilyLine";
import ResidualsSection from "../sheets/column/residualsPanel";

interface Props {
  result: Record<string, unknown> | null;
  /** The column analysis' options (which one-sided P to show, ...). */
  options?: { corrTails?: "two" | "greater" | "less" };
}

type Row = [string, string];

// P values and asterisks follow the project's P-value style
// (Preferences -> Reporting; src/report/pformat.ts).
const fmtP = tableP;
const stars = tableStars;

function fmtCI(ci: unknown): string {
  if (!Array.isArray(ci) || ci.length !== 2) return "n/a";
  return `${formatSig(ci[0] as number)} to ${formatSig(ci[1] as number)}`;
}

/** "exact" / "approximate" (the engine's p_method), for P value labels. */
function pKind(method: unknown): string {
  return method === "exact" || method === "approximate" ? `, ${method}` : "";
}

/** A CI whose confidence level is set by the data (rank-based CIs). */
function fmtAchievedCI(ci: unknown, level: unknown): string {
  const lvl = typeof level === "number" ? ` (actual confidence ${formatSig(100 * level, 4)}%)` : "";
  return `${fmtCI(ci)}${lvl}`;
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
          [`25% percentile${d.percentile_method === "prism" ? " (rank (n + 1)p)" : ""}`,
            formatSig(d.percentile25)],
          ["Median", formatSig(d.median)],
          [`75% percentile${d.percentile_method === "prism" ? " (rank (n + 1)p)" : ""}`,
            formatSig(d.percentile75)],
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
              kolmogorov_smirnov: "Kolmogorov-Smirnov",
            }[key] ?? key;
            if (v?.error) return [label, String(v.error)];
            const pText = v.p == null && v.p_summary ? v.p_summary.replace("P>", "P > ")
              : `${pLabel(v.p)}`;
            const stat = key === "kolmogorov_smirnov" && v.KS != null
              ? `KS distance = ${formatSig(v.KS)}, ` : "";
            return [label,
              `${stat}${pText}, ${v.passed_alpha_05 ? "passed" : "failed"} (α=0.05)`];
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
            const w = ds.wilcoxon;
            extra.push(["Wilcoxon signed rank",
              `W=${formatSig(w.W)}, P=${fmtP(w.p_two_tailed)}${w.p_method ? ` (${w.p_method})` : ""}`]);
            if (w.sum_positive_ranks !== undefined) {
              extra.push(["Sum of positive, negative ranks",
                `${formatSig(w.sum_positive_ranks)}, ${formatSig(w.sum_negative_ranks)}`]);
            }
            if (w.hodges_lehmann_median !== undefined) {
              extra.push(["Hodges-Lehmann median", formatSig(w.hodges_lehmann_median)],
                ["CI of the median", fmtAchievedCI(w.ci_median, w.ci_actual_level)]);
            }
            if (w.n_zero_differences) {
              extra.push(["Values equal to the hypothetical",
                `${w.n_zero_differences} (${w.zero_method === "pratt" ? "Pratt" : "ignored"})`]);
            }
          }
          const rt = ds.one_sample_ratio_t;
          if (rt?.error) extra.push(["Ratio t test", String(rt.error)]);
          else if (rt) {
            extra.push(["Ratio t test (geometric mean / hypothetical)",
              `${formatSig(rt.ratio)} (95% CI ${fmtCI(rt.ci_ratio)}), t=${formatSig(rt.t)}, df=${rt.df}, P=${fmtP(rt.p_two_tailed)}`]);
          }
        }
        const x = ds.extras;
        const more: Row[] = [];
        if (x) {
          for (const [pct, v] of Object.entries(x.percentiles ?? {})) {
            more.push([`${pct}% percentile`, formatSig(v as number)]);
          }
          more.push(["Interquartile range", formatSig(x.interquartile_range)]);
          if (x.median_ci) {
            more.push(["CI of the median",
              x.median_ci.ci ? fmtAchievedCI(x.median_ci.ci, x.median_ci.actual_level)
                : x.median_ci.note ?? "n/a"]);
          }
          more.push(
            ["Geometric SD factor", formatSig(x.geometric_sd_factor)],
            ["Harmonic mean", `${formatSig(x.harmonic_mean)}${x.ci_harmonic_mean ? ` (95% CI ${fmtCI(x.ci_harmonic_mean)})` : ""}`],
            ["Quadratic mean", `${formatSig(x.quadratic_mean)}${x.ci_quadratic_mean ? ` (95% CI ${fmtCI(x.ci_quadratic_mean)})` : ""}`],
            ["Mode", x.mode != null ? `${formatSig(x.mode)} (${x.mode_count} times${x.n_modes > 1 ? `, ${x.n_modes} modes` : ""})` : "none (no value repeats)"],
          );
          if (x.trim_k !== undefined) {
            more.push([`Trimmed mean (K = ${x.trim_k})`, formatSig(x.trimmed_mean)],
              [`Winsorized mean (K = ${x.trim_k})`, formatSig(x.winsorized_mean)]);
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
                {more.length > 0 && <KV title={`More descriptive statistics${x?.percentile_method === "prism" ? " (percentiles: rank (n + 1)p)" : ""}`} rows={more} />}
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
  if (result.test === "kolmogorov_smirnov") return <KSTest result={result} />;
  if (result.test === "ratio_paired_t") return <RatioPaired result={result} />;
  const rows: Row[] = [];
  rows.push([`P value (two-tailed${pKind(result.p_method)})`,
    `${fmtP(result.p_two_tailed)} ${stars(result.p_two_tailed)}`]);
  if (result.t !== undefined) {
    // The engine reports |t|; t carries the sign of the difference shown
    // below (A − B, or the mean of the paired differences A − B).
    const diff = result.difference ?? result.mean_difference;
    const t = typeof result.t === "number" && typeof diff === "number" && diff < 0
      ? -Math.abs(result.t) : result.t;
    rows.push(["t, df", `t=${formatSig(t)}, df=${formatSig(result.df)}`
      + (typeof diff === "number" ? ` (direction: ${nameA} − ${nameB})` : "")]);
  }
  if (result.U !== undefined) rows.push(["Mann-Whitney U", formatSig(result.U)]);
  if (result.sum_ranks_a !== undefined) {
    rows.push([`Sum of ranks in ${nameA}, ${nameB}`,
      `${formatSig(result.sum_ranks_a)}, ${formatSig(result.sum_ranks_b)}`]);
  }
  if (result.W !== undefined) rows.push(["Sum of signed ranks W", formatSig(result.W)]);
  if (result.sum_positive_ranks !== undefined) {
    rows.push(["Sum of positive, negative ranks",
      `${formatSig(result.sum_positive_ranks)}, ${formatSig(result.sum_negative_ranks)}`]);
  }
  if (result.n_zero_differences) {
    rows.push(["Pairs with zero difference",
      `${result.n_zero_differences} (${result.zero_method === "pratt" ? "ranked, then ignored (Pratt)" : "ignored (Wilcoxon)"})`]);
  }
  if (result.difference !== undefined) {
    rows.push(
      [`Mean of ${nameA}`, `${formatSig(result.mean_a)} ± ${formatSig(result.sem_a)} (n=${result.n_a})`],
      [`Mean of ${nameB}`, `${formatSig(result.mean_b)} ± ${formatSig(result.sem_b)} (n=${result.n_b})`],
      [`Difference between means (${nameA} − ${nameB})`,
       `${formatSig(result.difference)} ± ${formatSig(result.se_difference)}`],
      ["95% CI of difference", fmtCI(result.ci_difference)],
    );
  }
  if (result.mean_difference !== undefined) {
    rows.push(
      [`Mean of differences (${nameA} − ${nameB})`, formatSig(result.mean_difference)],
      ["95% CI of difference", fmtCI(result.ci_difference)],
    );
  }
  if (result.median_a !== undefined) {
    rows.push(
      [`Median of ${nameA}`, formatSig(result.median_a)],
      [`Median of ${nameB}`, formatSig(result.median_b)],
      ["Hodges-Lehmann difference", formatSig(result.hodges_lehmann_difference)],
    );
    if (result.ci_hodges_lehmann !== undefined) {
      rows.push(["CI of the difference",
        fmtAchievedCI(result.ci_hodges_lehmann, result.ci_actual_level)]);
    }
  }
  if (result.median_difference !== undefined) {
    rows.push(["Median of differences", formatSig(result.median_difference)]);
    if (result.hodges_lehmann !== undefined) {
      rows.push(["Hodges-Lehmann median of differences", formatSig(result.hodges_lehmann)],
        ["CI of the median difference", fmtAchievedCI(result.ci_median, result.ci_actual_level)]);
    }
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

function ComparisonsTable({ mc, fallbackMethod }: { mc: any; fallbackMethod?: string }) {
  // The family (how many comparisons, which correction) and the
  // unadjusted P beside the adjusted one (report/family.ts).
  const fam = familyOf(mc, fallbackMethod);
  const unadj = hasUnadjusted(mc.comparisons);
  if (mc.method === "newman_keuls") {
    return (
      <>
        <FamilyLine family={fam} />
        <table className="results-table comparisons-table">
          <thead>
            <tr><th>Comparison</th><th>Difference</th><th>q</th><th>Steps</th>
              {unadj && <th>Unadjusted P</th>}
              <th>Significant (P &lt; 0.05)?</th></tr>
          </thead>
          <tbody>
            {mc.comparisons.map((c: any, i: number) => (
              <tr key={i}>
                <th>{c.pair}</th>
                <td>{formatSig(c.difference)}</td>
                <td>{formatSig(c.statistic)}</td>
                <td>{c.steps}</td>
                {unadj && <td>{fmtP(c.p_unadjusted)}</td>}
                <td>{c.significant ? "Yes" : c.tested === false ? "No (within a non-significant range)" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    );
  }
  const showUnadj = unadj && fam?.kind !== "unadjusted";
  return (
    <>
      <FamilyLine family={fam} />
      <table className="results-table comparisons-table">
        <thead>
          <tr>
            <th>Comparison</th><th>Difference</th><th>CI</th>
            <th>{adjustedHeader(fam)}</th>{showUnadj && <th>Unadjusted P</th>}<th>Summary</th>
          </tr>
        </thead>
        <tbody>
          {mc.comparisons.map((c: any, i: number) => (
            <tr key={i}>
              <th>{c.pair}</th>
              <td>{formatSig(c.difference ?? c.mean_rank_difference)}</td>
              <td>{fmtCI(c.ci)}</td>
              <td data-p={c.p_adjusted ?? undefined}>
                {fmtP(c.p_adjusted ?? (fam?.kind === "unadjusted" ? c.p_unadjusted : null))}</td>
              {showUnadj && <td data-p={c.p_unadjusted ?? undefined}>{fmtP(c.p_unadjusted)}</td>}
              <td>{stars(c.p_adjusted ?? (fam?.kind === "unadjusted" ? c.p_unadjusted : null))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Anova({ result }: { result: any }) {
  if (result.kind === "nonparametric") {
    return (
      <div className="result-card">
        <h3>Kruskal-Wallis test</h3>
        <KV rows={[
          ["Kruskal-Wallis H", formatSig(result.H)],
          ...(Array.isArray(result.group_summaries) && result.group_summaries.length > 1
            ? [["df (chi-square approximation)", String(result.group_summaries.length - 1)] as Row]
            : []),
          ["P value", `${fmtP(result.p)} ${stars(result.p)}`],
        ]} />
        {result.dunns && (
          <>
            <h4>{result.dunns.corrected === false
              ? "Uncorrected Dunn's test (P not adjusted for multiple comparisons)"
              : "Dunn's multiple comparisons"}</h4>
            <ComparisonsTable mc={result.dunns} fallbackMethod="dunns" />
          </>
        )}
      </div>
    );
  }
  const t = result.table;
  const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  const msWithin = num(t.ms_within) ? t.ms_within
    : num(t.ss_within) && num(t.df_within) && t.df_within > 0 ? t.ss_within / t.df_within : null;
  const msBetween = num(t.ms_between) ? t.ms_between
    : num(t.ss_between) && num(t.df_between) && t.df_between > 0 ? t.ss_between / t.df_between : null;
  const ssTotal = num(t.ss_total) ? t.ss_total
    : num(t.ss_between) && num(t.ss_within) ? t.ss_between + t.ss_within : null;
  const variance: Row[] = [];
  const bf = result.brown_forsythe, bt = result.bartlett, fk = result.fligner_killeen;
  if (bf && num(bf.F)) variance.push(["Brown-Forsythe", `F=${formatSig(bf.F)}, P=${fmtP(bf.p)}`]);
  if (bt && num(bt.statistic)) {
    variance.push(["Bartlett's", `${formatSig(bt.statistic)}, P=${fmtP(bt.p)}`]);
  }
  if (fk && num(fk.statistic)) {
    variance.push(["Fligner-Killeen (median-centred)",
      `χ²=${formatSig(fk.statistic)}, df=${fk.df}, P=${fmtP(fk.p)}`]);
  }
  return (
    <div className="result-card">
      <h3>Ordinary one-way ANOVA</h3>
      <table className="results-table anova-table">
        <caption className="sr-only">ANOVA table</caption>
        <thead>
          <tr><th scope="col">Source of variation</th><th scope="col">SS</th>
            <th scope="col">DF</th><th scope="col">MS</th><th scope="col">F (DFn, DFd)</th>
            <th scope="col">P value</th></tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Treatment (between columns)</th>
            <td>{formatSig(t.ss_between)}</td><td>{t.df_between}</td><td>{formatSig(msBetween)}</td>
            <td>{`F(${t.df_between}, ${t.df_within}) = ${formatSig(t.F)}`}</td>
            <td>{`${fmtP(t.p)} ${stars(t.p)}`}</td>
          </tr>
          <tr>
            <th scope="row">Residual (within columns)</th>
            <td>{formatSig(t.ss_within)}</td><td>{t.df_within}</td><td>{formatSig(msWithin)}</td>
            <td /><td />
          </tr>
          <tr>
            <th scope="row">Total</th>
            <td>{formatSig(ssTotal)}</td>
            <td>{num(t.df_between) && num(t.df_within) ? t.df_between + t.df_within : "n/a"}</td>
            <td /><td /><td />
          </tr>
        </tbody>
      </table>
      <KV rows={[
        ["F (DFn, DFd)", `F(${t.df_between}, ${t.df_within}) = ${formatSig(t.F)}`],
        ["P value", `${fmtP(t.p)} ${stars(t.p)}`],
        ["R squared", formatSig(t.r_squared)],
        ["SS (treatment / residual)",
         `${formatSig(t.ss_between)} / ${formatSig(t.ss_within)}`],
        ["MS (treatment / residual)", `${formatSig(msBetween)} / ${formatSig(msWithin)}`],
        ["Residual SD (pooled, √MS residual)",
         msWithin !== null ? formatSig(Math.sqrt(msWithin)) : "n/a"],
        ...variance,
      ]} />
      {result.multiple_comparisons && (
        <>
          <h4>
            {METHOD_NAMES[String(result.multiple_comparisons.method)]
              ?? String(result.multiple_comparisons.method).replace("_", "-")} multiple
            comparisons (df={result.multiple_comparisons.df})
            {result.multiple_comparisons.method === "fisher_lsd" && ", P not adjusted"}
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

function Correlation({ result, tails }: { result: any; tails?: "two" | "greater" | "less" }) {
  const [a, b] = result.names ?? ["A", "B"];
  const kendall = result.method === "kendall";
  const name = result.method === "pearson" ? "Pearson r"
    : kendall ? "Kendall's tau-b" : "Spearman r";
  const pType = result.p_type === "exact" || result.p_method === "exact" ? ", exact"
    : result.p_type === "normal" || result.p_type === "approximate" ? ", approximate" : "";
  const rows: Row[] = [
    [name, formatSig(kendall ? result.tau ?? result.r : result.r)],
    ["95% CI of r", fmtCI(result.ci_r)],
    [`P value (two-tailed${pType})`, `${fmtP(result.p_two_tailed)} ${stars(result.p_two_tailed)}`],
    ["n (XY pairs)", String(result.n)],
  ];
  if (result.r_squared !== undefined) {
    rows.splice(2, 0, ["R squared", formatSig(result.r_squared)]);
  }
  if (kendall) {
    rows.splice(1, 0, ["S (concordant − discordant pairs)",
      `${formatSig(result.S)} (${result.concordant} concordant, ${result.discordant} discordant)`]);
    rows[2] = ["95% CI of tau (Fisher z, approximate)", fmtCI(result.ci_r)];
  }
  if (tails === "greater" || tails === "less") {
    const p = tails === "greater" ? result.p_greater : result.p_less;
    const ci = tails === "greater" ? result.ci_r_greater : result.ci_r_less;
    const dir = tails === "greater" ? "positive (r > 0)" : "negative (r < 0)";
    rows.push([`P value (one-tailed, alternative: ${dir})`, `${fmtP(p)} ${stars(p)}`]);
    if (Array.isArray(ci)) rows.push([`One-sided 95% confidence bound`, fmtCI(ci)]);
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
      {result.model && (
        <p className="model-line">
          Model: {String(result.model)}. Without the interaction term its sum of
          squares is pooled into the residual, and the row and column effects are
          each tested against that residual (R&apos;s aov(y ~ A + B)).
        </p>
      )}
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
            {result.multiple_comparisons.direction === "all_cells"
              ? " of every cell mean with every other" : ""}
            {" "}(MS<sub>residual</sub> = {formatSig(result.multiple_comparisons.ms_residual)},
            df = {result.multiple_comparisons.df_residual})
          </h4>
          <FamilyLine mc={result.multiple_comparisons} />
          <table className="results-table comparisons-table">
            <thead>
              <tr>
                <th>Family</th><th>Comparison</th><th>Difference</th>
                <th>95% CI</th><th>Adjusted P</th>
                {hasUnadjusted(result.multiple_comparisons.comparisons) && <th>Unadjusted P</th>}
                <th>Summary</th>
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
                  {hasUnadjusted(result.multiple_comparisons.comparisons)
                    && <td>{fmtP(c.p_unadjusted)}</td>}
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
        [`P value${pKind(result.p_method)}`, `${fmtP(result.p)} ${stars(result.p)}`],
        ["n subjects", String(result.n_subjects)],
        ...(Array.isArray(result.rank_sums) ? [["Sum of ranks",
          result.rank_sums.map((v: number, i: number) =>
            `${result.names?.[i] ?? i + 1}: ${formatSig(v)}`).join(", ")] as Row] : []),
      ]} />
      {result.dunns && (
        <>
          <h4>Dunn's multiple comparisons</h4>
          <ComparisonsTable mc={result.dunns} fallbackMethod="dunns" />
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

const METHOD_NAMES: Record<string, string> = {
  tukey: "Tukey", dunnett: "Dunnett", bonferroni: "Bonferroni", sidak: "Šídák",
  holm_sidak: "Holm-Šídák", holm: "Holm (Bonferroni step-down)",
  newman_keuls: "Newman-Keuls", fisher_lsd: "Fisher's LSD",
  games_howell: "Games-Howell", dunnett_t3: "Dunnett T3", tamhane_t2: "Tamhane T2",
  welch_uncorrected: "Welch t (uncorrected)",
};

function KSTest({ result }: { result: any }) {
  const [a, b] = result.names ?? ["A", "B"];
  return (
    <div className="result-card">
      <h3>Kolmogorov-Smirnov test: {a} vs. {b}</h3>
      <KV rows={[
        [`P value (two-tailed${pKind(result.p_method)})`, `${fmtP(result.p)} ${stars(result.p)}`],
        ["Kolmogorov-Smirnov D", formatSig(result.D)],
        [`Median of ${a}`, `${formatSig(result.median_a)} (n=${result.n_a})`],
        [`Median of ${b}`, `${formatSig(result.median_b)} (n=${result.n_b})`],
        ...(result.ties ? [["Ties", "yes (P computed with the ties)"] as Row] : []),
      ]} />
    </div>
  );
}

function RatioPaired({ result }: { result: any }) {
  const [a, b] = result.names ?? ["A", "B"];
  return (
    <div className="result-card">
      <h3>Ratio paired t test: {a} / {b}</h3>
      <KV rows={[
        ["P value (two-tailed)", `${fmtP(result.p_two_tailed)} ${stars(result.p_two_tailed)}`],
        ["t, df", `t=${formatSig(result.t)}, df=${result.df}`],
        ["Geometric mean of the ratios", formatSig(result.geometric_mean_ratio)],
        ["95% CI of the ratio", fmtCI(result.ci_ratio)],
        ["Mean of log10(ratio)", `${formatSig(result.mean_log10_ratio)} ± ${formatSig(result.se_log10_ratio)}`],
        [`Geometric mean of ${a}, ${b}`,
          `${formatSig(result.geometric_mean_a)}, ${formatSig(result.geometric_mean_b)}`],
        ["Number of pairs", String(result.n_pairs)],
        ["R squared", formatSig(result.r_squared)],
      ]} />
    </div>
  );
}

function AnovaUnequal({ result }: { result: any }) {
  const w = result.welch, bf = result.brown_forsythe;
  const mc = result.multiple_comparisons;
  const statName = mc?.method === "games_howell" ? "q" : "t";
  const uFam = mc ? familyOf(mc) : null;
  const uUnadj = !!mc && hasUnadjusted(mc.comparisons) && mc.method !== "welch_uncorrected";
  return (
    <div className="result-card">
      <h3>One-way ANOVA, SDs not assumed equal</h3>
      <KV rows={[
        ["Welch's ANOVA W (DFn, DFd)", `W(${w.dfn}, ${formatSig(w.dfd)}) = ${formatSig(w.W)}`],
        ["Welch's P value", `${fmtP(w.p)} ${stars(w.p)}`],
        ["Brown-Forsythe ANOVA F* (DFn, DFd)", `F*(${bf.dfn}, ${formatSig(bf.dfd)}) = ${formatSig(bf.F)}`],
        ["Brown-Forsythe P value", `${fmtP(bf.p)} ${stars(bf.p)}`],
      ]} />
      <h4>Groups</h4>
      <table className="results-table">
        <thead><tr><th>Group</th><th>n</th><th>Mean</th><th>SD</th></tr></thead>
        <tbody>
          {result.group_summaries.map((g: any) => (
            <tr key={g.name}><th>{g.name}</th><td>{g.n}</td>
              <td>{formatSig(g.mean)}</td><td>{formatSig(g.sd)}</td></tr>
          ))}
        </tbody>
      </table>
      {mc && (
        <>
          <h4>{METHOD_NAMES[mc.method] ?? mc.method} multiple comparisons
            ({mc.family === "control" ? "each group vs. control" : "every pair"})</h4>
          <FamilyLine family={uFam} />
          <table className="results-table comparisons-table">
            <thead>
              <tr><th>Comparison</th><th>Difference</th><th>SE</th><th>{statName}</th>
                <th>df</th><th>{Math.round(100 * (mc.ci_level ?? 0.95))}% CI</th>
                <th>{mc.method === "welch_uncorrected" ? "P (not adjusted)" : "Adjusted P"}</th>
                {uUnadj && <th>Unadjusted P</th>}<th>Summary</th></tr>
            </thead>
            <tbody>
              {mc.comparisons.map((c: any, i: number) => (
                <tr key={i}>
                  <th>{c.pair}</th>
                  <td>{formatSig(c.difference)}</td>
                  <td>{formatSig(c.se)}</td>
                  <td>{formatSig(c.statistic)}</td>
                  <td>{formatSig(c.df)}</td>
                  <td>{fmtCI(c.ci)}</td>
                  <td>{fmtP(c.p_adjusted)}</td>
                  {uUnadj && <td>{fmtP(c.p_unadjusted)}</td>}
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

function MedianTest({ result }: { result: any }) {
  const rows: Row[] = [["Grand median", formatSig(result.grand_median)]];
  if (result.chi_square) {
    rows.push(["Chi-square, df", `${formatSig(result.chi_square.chi2)}, ${result.chi_square.df}`],
      ["P value", `${fmtP(result.chi_square.p)} ${stars(result.chi_square.p)}`]);
  }
  if (result.chi_square_yates) {
    rows.push(["Chi-square with Yates' correction",
      `${formatSig(result.chi_square_yates.chi2)}, ${pLabel(result.chi_square_yates.p)}`]);
  }
  if (result.fisher_exact) rows.push(["Fisher's exact test", `${pLabel(result.fisher_exact.p)}`]);
  if (result.note) rows.push(["Note", String(result.note)]);
  return (
    <div className="result-card">
      <h3>Median test</h3>
      <KV rows={rows} />
      {result.warning && <p className="model-line">{String(result.warning)}</p>}
      <h4>Values above and not above the grand median</h4>
      <table className="results-table">
        <thead><tr><th>Group</th><th>n</th><th>Median</th><th>Above</th><th>Not above</th></tr></thead>
        <tbody>
          {result.group_summaries.map((g: any) => (
            <tr key={g.name}><th>{g.name}</th><td>{g.n}</td><td>{formatSig(g.median)}</td>
              <td>{g.above}</td><td>{g.not_above}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function StatsResults({ result, options }: Props) {
  if (!result) return null;
  if (result.error) {
    return <div className="results-error">Analysis failed: {String(result.error)}</div>;
  }
  const main = mainResults(result, options);
  // QQ plot and residuals vs. fitted for the t tests and ANOVAs (run.ts)
  if (main && result.residual_check) {
    return <>{main}<ResidualsSection data={result.residual_check as Record<string, unknown>} /></>;
  }
  return main;
}

function mainResults(result: Record<string, unknown>, options: Props["options"]) {
  switch (result.analysis) {
    case "column_statistics": return <ColumnStats result={result} />;
    case "ttest": return <TTest result={result} />;
    case "anova": return <Anova result={result} />;
    case "anova_unequal_var": return <AnovaUnequal result={result} />;
    case "median_test": return <MedianTest result={result} />;
    case "ks_test": return <KSTest result={result} />;
    case "rm_one_way_anova": return <RMAnova result={result} />;
    case "friedman": return <Friedman result={result} />;
    case "two_way_anova": return <TwoWayAnova result={result} />;
    case "rm_two_way_mixed":
    case "rm_two_way_both": return <RMTwoWay result={result} />;
    case "correlation": return <Correlation result={result} tails={options?.corrTails} />;
    case "roc": return <Roc result={result} />;
    case "bland_altman": return <BlandAltman result={result} />;
    case "outliers": return <Outliers result={result} />;
    case "rout_column": return <RoutColumn result={result} />;
    default: return null;
  }
}
