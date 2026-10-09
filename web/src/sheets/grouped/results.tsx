// Results sheets of the grouped-table analyses.
import { useProject } from "../../app/context";
import { useLinkedTable } from "../../app/linkedTable";
import StatsResults from "../../components/StatsResults";
import { findSheet } from "../../project/ops";
import type { DataTableModel, ResultsSheet } from "../../project/types";
import { formatSig } from "../../types";
import type { ResultsProps } from "../types";
import {
  CORRECTION_LABEL, LOG_TESTS, ROW_TEST_LABEL, type ColumnStatsOptions, type MultiTOptions,
  type RowMeansOptions, type ThreeWayOptions, type TwoWayOptions,
} from "./options";
import { fmtCI, fmtP, pLabel, stars } from "./format";
import { rowMeansTable, CALC_TITLE } from "./tables";
import InteractionBlock from "./interaction";
import "./grouped.css";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

const pct = (v: unknown) => (typeof v === "number" ? `${formatSig(v, 3)}%` : "n/a");

function ErrorCard({ result }: { result: R }) {
  return <div className="results-error">Analysis failed: {String(result.error)}</div>;
}

function Flag({ on, label = "Yes" }: { on: boolean | null | undefined; label?: string }) {
  if (on === null || on === undefined) return <span className="flag-no">n/a</span>;
  return on ? <span className="flag-yes">{label}</span> : <span className="flag-no">No</span>;
}

// ------------------------------------------------------------ two-way

function SourcesTable({ rows, gg }: {
  rows: [string, R][]; gg?: boolean;
}) {
  return (
    <div className="results-scroll">
      <table className="results-table">
        <thead>
          <tr>
            <th>Source of variation</th><th>% of total</th><th>SS</th><th>DF</th>
            <th>MS</th><th>F</th><th>P value</th>{gg && <th>P (Geisser-Greenhouse)</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, s]) => (
            <tr key={name}>
              <th>{name}</th>
              <td>{pct(s.percent_of_total)}</td>
              <td>{formatSig(s.ss)}</td>
              <td>{s.df}</td>
              <td>{formatSig(s.ms)}</td>
              <td>{s.F != null ? formatSig(s.F) : ""}</td>
              <td>{s.p != null ? `${fmtP(s.p)} ${stars(s.p)}` : ""}</td>
              {gg && <td>{s.p_geisser_greenhouse != null ? fmtP(s.p_geisser_greenhouse) : ""}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CellMeans({ means, rows, cols }: { means: number[][]; rows: string[]; cols: string[] }) {
  return (
    <div className="results-scroll">
      <table className="results-table">
        <thead><tr><th>Cell means</th>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>
          {means.map((r, i) => (
            <tr key={i}><th>{rows[i]}</th>{r.map((v, j) => <td key={j}>{formatSig(v)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TwoWayComparisons({ mc, note }: { mc: R; note?: string }) {
  const method = String(mc.method);
  const name = method === "tukey" ? "Tukey" : method === "sidak" ? "Šídák"
    : method.charAt(0).toUpperCase() + method.slice(1);
  return (
    <>
      <h4>{name} multiple comparisons{mc.direction === "all_cells"
        ? " of every cell mean with every other" : ""}{mc.ms_residual != null
        ? ` (MS residual ${formatSig(mc.ms_residual)}, df ${mc.df_residual})` : ""}</h4>
      {note && <p className="hint-block">{note}</p>}
      {mc.direction === "all_cells" && (
        <p className="hint-block">
          Every row × data set cell is compared with every other, using the
          residual of the full two-way model{method === "tukey"
            ? " (Tukey: the family is all the cell means)" : " (corrected for every pair of cells)"}.
        </p>
      )}
      <div className="results-scroll">
        <table className="results-table">
          <thead>
            <tr>
              <th>Family</th><th>Comparison</th><th>Difference</th><th>95% CI</th>
              <th>Adjusted P</th><th>Summary</th>
            </tr>
          </thead>
          <tbody>
            {(mc.comparisons as R[]).map((c, i) => (
              <tr key={i}>
                <th>{c.family ?? ""}</th>
                <th>{c.pair}</th>
                <td>{formatSig(c.difference)}</td>
                <td>{fmtCI(c.ci95 ?? c.ci)}</td>
                <td>{fmtP(c.p_adjusted)}</td>
                <td>{stars(c.p_adjusted)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function MixedTwoWay({ result, factors }: { result: R; factors: [string, string] }) {
  const label: Record<string, string> = {
    interaction: `${factors[0]} × ${factors[1]}`,
    row_factor: `${factors[0]} (repeated)`,
    column_factor: result.design === "both" ? `${factors[1]} (repeated)` : factors[1],
  };
  const fe = Object.entries(result.fixed_effects ?? {}) as [string, R][];
  return (
    <div className="result-card">
      <h3>Mixed-effects model: two-way repeated measures</h3>
      <p className="model-line">
        {result.method}; {result.n_subjects} subjects, {result.n_values} values
        {result.n_missing ? `, ${result.n_missing} missing` : ""}.
      </p>
      <h4>Fixed effects (type III)</h4>
      <div className="results-scroll">
        <table className="results-table">
          <thead>
            <tr><th>Effect</th><th>F (DFn, DFd)</th><th>P value</th>
              <th>Geisser-Greenhouse ε</th><th>P (GG corrected)</th></tr>
          </thead>
          <tbody>
            {fe.map(([k, f]) => (
              <tr key={k}>
                <th>{label[k] ?? k}</th>
                <td>F({formatSig(f.df_num, 3)}, {formatSig(f.df_den, 3)}) = {formatSig(f.F)}</td>
                <td>{fmtP(f.p)} {stars(f.p)}</td>
                <td>{f.epsilon != null ? formatSig(f.epsilon) : "n/a"}</td>
                <td>{f.p_geisser_greenhouse != null ? fmtP(f.p_geisser_greenhouse) : "n/a"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {result.sphericity_note && <p className="hint-block">{result.sphericity_note}</p>}
      <h4>Random effects</h4>
      <table className="results-table goodness">
        <thead><tr><th>Component</th><th>SD</th><th>Variance</th></tr></thead>
        <tbody>
          {(result.random_effects as R[] ?? []).map((r) => (
            <tr key={r.name}><th>{r.name}</th><td>{formatSig(r.sd)}</td>
              <td>{formatSig(r.variance)}</td></tr>
          ))}
        </tbody>
      </table>
      {result.matching && (
        <p className="model-line">
          Was the matching effective? χ² = {formatSig(result.matching.chi_square)},
          df {result.matching.df}, {pLabel(result.matching.p)}
        </p>
      )}
      {result.goodness_of_fit && (
        <p className="model-line">
          Goodness of fit: REML criterion {formatSig(result.goodness_of_fit.reml_criterion)},
          AIC {formatSig(result.goodness_of_fit.aic)}
          {result.goodness_of_fit.converged === false ? " (did not converge)" : ""}
        </p>
      )}
      {result.cell_means && (
        <CellMeans means={result.cell_means} rows={result.row_names} cols={result.col_names} />
      )}
      {result.multiple_comparisons && <TwoWayComparisons mc={result.multiple_comparisons} />}
    </div>
  );
}

export function TwoWayResults({ result, options, table }: ResultsProps<TwoWayOptions, R>) {
  if (!result) return null;
  if (result.error) return <ErrorCard result={result} />;
  const factors: [string, string] = result.factor_names
    ?? [options.rowFactor || "Row factor", options.colFactor || "Column factor"];
  const rowNames = table.rowTitles.map((t, i) => t.trim() || `Row ${i + 1}`);
  const colNames = table.datasets.map((d, i) => d.name || `Dataset ${i + 1}`);
  if (result.analysis === "mixed_rm_two_way") {
    return <MixedTwoWay result={result} factors={factors} />;
  }
  if (result.analysis === "rm_two_way_mixed" || result.analysis === "rm_two_way_both") {
    const label: Record<string, string> = {
      interaction: `${factors[0]} × ${factors[1]}`,
      row_factor: `${factors[0]} (repeated)`,
      column_factor: result.analysis === "rm_two_way_both"
        ? `${factors[1]} (repeated)` : factors[1],
      subjects: "Subjects (matching)",
      residual: "Residual",
    };
    const order = ["interaction", "row_factor", "column_factor", "subjects", "residual"];
    const rows = order.filter((k) => result.sources?.[k])
      .map((k) => [label[k], result.sources[k]] as [string, R]);
    // Both factors repeated: each effect is tested against its own
    // effect × subjects error term.
    for (const k of ["interaction", "row_factor", "column_factor"]) {
      const s = result.sources?.[k];
      if (s?.error_df != null) {
        rows.push([`Error: ${label[k].replace(" (repeated)", "")} × subjects`, {
          ss: s.error_ss, df: s.error_df, ms: s.error_ss / s.error_df,
        }]);
      }
    }
    const total = rows.reduce((a, [, s]) => a + (typeof s.ss === "number" ? s.ss : 0), 0);
    for (const [, s] of rows) {
      if (s.percent_of_total == null && total > 0) s.percent_of_total = 100 * s.ss / total;
    }
    const gg = rows.some(([, s]) => s.p_geisser_greenhouse != null);
    return (
      <div className="result-card">
        <h3>Two-way repeated-measures ANOVA</h3>
        <p className="model-line">
          {result.design}; {result.n_subjects} subjects
          {result.gg_epsilon != null
            ? `; Geisser-Greenhouse ε = ${formatSig(result.gg_epsilon)}` : ""}
        </p>
        <SourcesTable rows={rows} gg={gg} />
        {result.cell_means && <CellMeans means={result.cell_means} rows={rowNames} cols={colNames} />}
        {result.multiple_comparisons && (
          <TwoWayComparisons mc={result.multiple_comparisons}
            note="Comparisons use the mixed-effects fit of the same data, which
              matches repeated-measures ANOVA when no value is missing." />
        )}
        {result.comparisons_error && (
          <p className="results-error">Comparisons failed: {result.comparisons_error}</p>
        )}
      </div>
    );
  }
  // Ordinary two-way ANOVA (from replicates or from mean / SD / N).
  const src = result.sources ?? {};
  const rows: [string, R][] = Object.entries(src).map(([k, v]) => [
    k === "interaction" ? `Interaction (${factors[0]} × ${factors[1]})`
      : k === "residual" ? "Residual" : k, v as R]);
  // The interaction first when the analysis was opened to ask whether an
  // effect differs between groups; otherwise folded under the ANOVA.
  const first = options.interactionFocus === true;
  const interaction = <InteractionBlock result={result} table={table} factors={factors} first={first} />;
  return (
    <>
    {first && interaction}
    <div className="result-card">
      <h3>Two-way ANOVA</h3>
      <p className="model-line">
        Ordinary, {result.type ?? "type III"}
        {result.analysis === "two_way_anova_summary" ? "; computed from mean, SD and N" : ""}
        {result.n != null ? `; ${result.n} values` : ""}
        {result.model ? `; ${String(result.model)}` : ""}
      </p>
      {result.model && (
        <p className="hint-block">
          No interaction term: its sum of squares is part of the residual, and
          each factor is tested against that residual (R&apos;s aov(y ~ A + B)).
        </p>
      )}
      <SourcesTable rows={rows} />
      {result.comparisons_error && (
        <p className="results-error">Comparisons failed: {String(result.comparisons_error)}</p>
      )}
      {result.cell_means && <CellMeans means={result.cell_means} rows={rowNames} cols={colNames} />}
      {result.multiple_comparisons && <TwoWayComparisons mc={result.multiple_comparisons} />}
    </div>
    {!first && interaction}
    </>
  );
}

// ------------------------------------------------------------ three-way

export function ThreeWayResults({ result }: ResultsProps<ThreeWayOptions, R>) {
  if (!result) return null;
  if (result.error) return <ErrorCard result={result} />;
  const f = result.factor_names as string[];
  const rows = Object.entries(result.sources as Record<string, R>).map(([k, v]) =>
    [k === "residual" ? "Residual" : k.replace(/ x /g, " × "), v] as [string, R]);
  const b = result.b_level_names as string[];
  const c = result.c_level_names as string[];
  const mc = result.multiple_comparisons as R | undefined;
  const cm = result.cell_means as number[][][];
  const cn = result.cell_n as number[][][];
  return (
    <div className="result-card">
      <h3>Three-way ANOVA</h3>
      <p className="model-line">
        Ordinary, {result.type}; {result.n} values; levels {f[0]} {result.levels[0]},{" "}
        {f[1]} {result.levels[1]}, {f[2]} {result.levels[2]}.
      </p>
      <SourcesTable rows={rows} />
      <h4>Cell means (n)</h4>
      <div className="results-scroll">
        <table className="results-table">
          <thead>
            <tr>
              <th>{f[0]}</th>
              {b.flatMap((bn, j) => c.map((cnm, k) => (
                <th key={`${j}${k}`}>{bn} · {cnm}</th>
              )))}
            </tr>
          </thead>
          <tbody>
            {cm.map((row, i) => (
              <tr key={i}>
                <th>{result.row_titles[i]}</th>
                {row.flatMap((bj, j) => bj.map((v, k) => (
                  <td key={`${j}${k}`}>{cn[i][j][k] ? `${formatSig(v)} (${cn[i][j][k]})` : "—"}</td>
                )))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {mc && (
        <>
          <h4>
            {mc.method === "none" ? "Fisher's LSD" : String(mc.method).replace("_", "-")}{" "}
            multiple comparisons: {mc.n_comparisons} comparisons (MS error{" "}
            {formatSig(mc.ms_error)}, df {mc.df_error})
          </h4>
          {mc.discoveries != null && (
            <p className="summary-line">{mc.discoveries} discoveries at Q = {formatSig((mc.q ?? 0) * 100)}%</p>
          )}
          <div className="results-scroll">
            <table className="results-table">
              <thead>
                <tr>
                  <th>Comparison</th><th>Difference</th><th>95% CI</th>
                  <th>{mc.q != null ? "q value" : "Adjusted P"}</th>
                  <th>{mc.q != null ? "Discovery?" : "Significant?"}</th>
                </tr>
              </thead>
              <tbody>
                {(mc.comparisons as R[]).map((cmp, i) => (
                  <tr key={i} className={cmp.significant ? "row-flagged" : undefined}>
                    <th>{cmp.pair}</th>
                    <td>{formatSig(cmp.difference)}</td>
                    <td>{fmtCI(cmp.ci)}</td>
                    <td>{fmtP(cmp.p_adjusted)} {mc.q == null ? stars(cmp.p_adjusted) : ""}</td>
                    <td><Flag on={cmp.significant} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------ multiple t

export function MultiTResults({ result, options }: ResultsProps<MultiTOptions, R>) {
  if (!result) return null;
  if (result.error) return <ErrorCard result={result} />;
  const [a, b] = result.names as string[];
  const log = LOG_TESTS.includes(result.test);
  const nonpar = ["mann_whitney", "kolmogorov_smirnov", "wilcoxon"].includes(result.test);
  const fdr = result.approach === "fdr";
  const adjLabel = result.method === "none" ? null : fdr ? "q value" : "Adjusted P";
  const centre = log ? "Geometric mean" : nonpar ? "Median" : "Mean";
  const val = (r: R, k: "a" | "b") => formatSig(
    log ? r[`geometric_mean_${k}`] : nonpar ? r[`median_${k}`] : r[`mean_${k}`]);
  const stat = (result.rows as R[]).find((r) => r.statistic_name)?.statistic_name ?? "t";
  const threshold = fdr
    ? `Q = ${formatSig((result.q ?? 0) * 100)}%` : `α = ${formatSig(result.alpha)}`;
  return (
    <div className="result-card">
      <h3>Multiple {nonpar ? "tests" : "t tests"}: {a} vs. {b}</h3>
      <p className="summary-line">
        <strong>{result.n_flagged}</strong> of {result.n_tests} rows
        {fdr ? " are discoveries" : " are significant"} ({threshold};{" "}
        {CORRECTION_LABEL[options.method as keyof typeof CORRECTION_LABEL] ?? result.method}).{" "}
        {ROW_TEST_LABEL[options.test]}; difference = {result.direction.replace(" - ", " − ")}
        {log ? " (reported as a ratio)" : ""}.
        {result.n_omitted ? ` ${result.n_omitted} row(s) could not be tested.` : ""}
        {result.n_true_null_estimate != null
          ? ` Estimated true null hypotheses: ${formatSig(result.n_true_null_estimate)}.` : ""}
      </p>
      {result.pooled && (
        <table className="results-table goodness">
          <thead><tr><th colSpan={2}>Pooled across rows{result.pooled.scale === "log10"
            ? " (log10 scale)" : ""}</th></tr></thead>
          <tbody>
            <tr><th>Pooled SD</th><td>{formatSig(result.pooled.sd)}</td></tr>
            <tr><th>Pooled variance</th><td>{formatSig(result.pooled.variance)}</td></tr>
            <tr><th>df</th><td>{result.pooled.df}</td></tr>
          </tbody>
        </table>
      )}
      <div className="results-scroll">
        <table className="results-table multi-t-table">
          <thead>
            <tr>
              <th>Row</th><th>{result.flag_label}</th>
              <th>P value</th>{adjLabel && <th>{adjLabel}</th>}
              <th>{centre} {a}</th><th>{centre} {b}</th>
              <th>{log ? "Ratio" : nonpar && result.test !== "kolmogorov_smirnov"
                ? "Difference (Hodges-Lehmann)" : "Difference"}</th>
              {!nonpar && <th>SE of difference</th>}
              <th>{stat}</th>{!nonpar && <th>df</th>}<th>n</th>
            </tr>
          </thead>
          <tbody>
            {(result.rows as R[]).map((r) => (
              <tr key={r.index} className={r.significant ? "row-flagged" : undefined}>
                <th>{r.row}</th>
                <td>{r.omitted
                  ? <span className="omitted-note">{r.omitted}</span>
                  : <Flag on={r.significant} />}</td>
                <td>{fmtP(r.p)}</td>
                {adjLabel && <td>{fmtP(r.p_adjusted)}</td>}
                <td>{val(r, "a")}</td><td>{val(r, "b")}</td>
                <td>{formatSig(log ? r.ratio : (r.hodges_lehmann ?? r.difference))}</td>
                {!nonpar && <td>{formatSig(r.se_difference)}</td>}
                <td>{formatSig(r.statistic_name === "t"
                  && (log ? r.ratio < 1 : r.difference < 0) ? -Math.abs(r.statistic) : r.statistic)}</td>
                {!nonpar && <td>{formatSig(r.df, 4)}</td>}
                <td>{r.n_pairs != null ? `${r.n_pairs} pairs` : `${r.n_a}, ${r.n_b}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ row means

const ERR_COLUMNS: Record<string, [string, (r: R) => string][]> = {
  sd: [["SD", (r) => formatSig(r.sd)]],
  sem: [["SEM", (r) => formatSig(r.sem)]],
  cv: [["%CV", (r) => formatSig(r.cv_percent)]],
  ci: [["95% CI", (r) => fmtCI(r.ci)]],
  geometric_sd: [["Geometric SD factor", (r) => formatSig(r.geometric_sd)]],
  quartiles: [["25th percentile", (r) => formatSig(r.lower)],
    ["75th percentile", (r) => formatSig(r.upper)]],
  minmax: [["Minimum", (r) => formatSig(r.lower)], ["Maximum", (r) => formatSig(r.upper)]],
  percentiles: [["Lower percentile", (r) => formatSig(r.lower)],
    ["Upper percentile", (r) => formatSig(r.upper)]],
  none: [],
};

function RowTable({ rows, titles, result }: { rows: R[]; titles: string[]; result: R }) {
  const cols = ERR_COLUMNS[result.error_type] ?? [];
  return (
    <div className="results-scroll">
      <table className="results-table">
        <thead>
          <tr><th>Row</th><th>{CALC_TITLE[result.calculate] ?? "Value"}</th>
            {cols.map(([h]) => <th key={h}>{h}</th>)}<th>n</th></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <th>{titles[i]}</th><td>{formatSig(r.value)}</td>
              {cols.map(([h, f]) => <td key={h}>{f(r)}</td>)}<td>{r.n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LinkedTableRow({ result, sheet, table }: { result: R; sheet: ResultsSheet;
  table: DataTableModel }) {
  const { project, select } = useProject();
  const linked = useLinkedTable(sheet.id);
  const parentName = findSheet(project, sheet.parentId)?.name ?? "table";
  return (
    <div className="copy-table-row">
      {linked.outputs.map((d) => (
        <button key={d.id} type="button" className="grouped-btn" onClick={() => select(d.id)}>
          Open “{d.name}”
        </button>
      ))}
      <button type="button" className="grouped-btn" onClick={() => linked.create(
        rowMeansTable(result, table.yTitle.trim()),
        `${CALC_TITLE[result.calculate] ?? "Row values"} of ${parentName}`)}>
        Make a linked data table
      </button>
      <span className="hint-block">
        A grouped table of these values that follows the data and these
        settings; unlink it to edit it as ordinary data.
      </span>
    </div>
  );
}

export function RowMeansResults({ result, sheet, table }: ResultsProps<RowMeansOptions, R>) {
  if (!result) return null;
  if (result.error) return <ErrorCard result={result} />;
  const titles = result.row_titles as string[];
  const scopeText = result.scope === "row"
    ? "each dataset summarized first, then across datasets"
    : result.scope === "all_values" ? "all replicates in the row pooled" : "per dataset";
  return (
    <div className="result-card">
      <h3>Row {result.calculate === "total" ? "totals" : `${(CALC_TITLE[result.calculate] ?? "")
        .toLowerCase()}s`}</h3>
      <p className="model-line">Computed {scopeText}.</p>
      {result.scope === "dataset"
        ? (result.datasets as R[]).map((d) => (
          <div key={d.name}>
            <h4>{d.name}</h4>
            <RowTable rows={d.rows} titles={titles} result={result} />
          </div>
        ))
        : <RowTable rows={result.rows} titles={titles} result={result} />}
      <LinkedTableRow result={result} sheet={sheet} table={table} />
    </div>
  );
}

// ------------------------------------------------------------ column stats

export function ColumnStatsResults({ result }: ResultsProps<ColumnStatsOptions, R>) {
  return <StatsResults result={result} />;
}
