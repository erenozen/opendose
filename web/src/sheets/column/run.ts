// Column analyses (t tests, ANOVA, nonparametric, correlation, ROC,
// Bland-Altman, outliers). They read each dataset's values; X is ignored,
// so they also run on the Y columns of an XY table.
/** The engine bridge (lib/engine.ts), structurally: keeps this module
 *  free of the browser runtime for node --test. */
type EngineBridge = { analyze: (payload: unknown) => unknown };
import { numericData, parseCell } from "../../project/table.ts";
import {
  SUBCOLUMN_FORMAT_ENGINE, SUBCOLUMN_FORMAT_LABELS, type DataTableModel,
} from "../../project/types.ts";
import type { ColumnOptionsState } from "../../types.ts";
import { COLUMN_ANALYSIS_LABELS, DEFAULT_NORMALITY_TESTS } from "../../types.ts";
import { allCellsComparisons } from "../common/allCells.ts";
import { withWithheld } from "../common/withheld.ts";

export function runColumn(engine: EngineBridge, table: DataTableModel,
  o: ColumnOptionsState): Record<string, unknown> {
  if (table.subcolumnFormat !== "replicates") return runColumnSummary(engine, table, o);
  const r = engine.analyze(columnPayload(table, o)) as Record<string, unknown>;
  if (o.analysis === "two_way_anova" && o.twoWayDirection === "all_cells"
    && o.twoWayComparisons !== "none" && r && !r.error) {
    return { ...r, multiple_comparisons: twoWayAllCells(engine, table, o) };
  }
  // Fewer than two independent values in a group: no P (common/withheld.ts).
  return withWithheld(table, o, r);
}

/** Every cell mean against every other: needs the interaction model. */
function twoWayAllCells(engine: EngineBridge, table: DataTableModel,
  o: ColumnOptionsState): Record<string, unknown> | null {
  if (o.twoWayModel === "additive") return null;
  const d = numericData(table).datasets;
  const nRows = Math.max(0, ...d.map((ds) => ds.ys.length));
  const rowNames = Array.from({ length: nRows }, (_, i) =>
    table.rowTitles[i]?.trim() || `Row ${i + 1}`);
  const mc = allCellsComparisons(engine, {
    rowNames, colNames: d.map((ds, j) => ds.name || `Dataset ${j + 1}`),
    cells: rowNames.map((_, i) => d.map((ds) => ds.ys[i] ?? [])),
  }, o.twoWayComparisons);
  return mc.error ? null : mc;
}

const sameList = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v) => b.includes(v));



/** Engine payload of a column analysis. Options left at their defaults add
 *  nothing, so the original analyses send exactly what they always did. */
export function columnPayload(table: DataTableModel, o: ColumnOptionsState):
  Record<string, unknown> {
  const base = { data: numericData(table) };
  const pratt = o.zeroMethod === "pratt" ? { zero_method: "pratt" } : {};
  if (o.analysis === "column_statistics") {
    const tests = o.normalityTests ?? DEFAULT_NORMALITY_TESTS;
    const trim = parseCell(o.trimK ?? "");
    return { analysis: "column_statistics", ...base,
      options: {
        hypothetical: parseCell(o.hypothetical),
        ...(sameList(tests, DEFAULT_NORMALITY_TESTS) ? {} : { normality_tests: tests }),
        ...(o.percentileMethod === "prism" ? { percentile_method: "prism" } : {}),
        ...(o.descriptiveExtras ? { extras: true, ...(trim !== null ? { trim_k: trim } : {}) } : {}),
        ...(o.ratioT ? { ratio_t: true } : {}),
        ...pratt,
      } };
  }
  if (o.analysis === "ttest") {
    return { analysis: "ttest", ...base,
      options: {
        kind: o.ttestKind === "welch" ? "unpaired" : o.ttestKind,
        welch: o.ttestKind === "welch",
        dataset_a: o.datasetA, dataset_b: o.datasetB,
        ...(o.ttestKind === "wilcoxon" ? pratt : {}),
      } };
  }
  if (o.analysis === "anova") {
    if (o.anovaKind === "parametric" && o.anovaSd === "unequal") {
      const cmp = o.unequalComparisons ?? "games_howell";
      const family = cmp === "games_howell" ? "all" : o.unequalFamily ?? "all";
      return { analysis: "anova_unequal_var", ...base,
        options: {
          comparisons: cmp === "none" ? null : cmp,
          family, control_index: o.controlIndex,
        } };
    }
    return { analysis: "anova", ...base,
      options: {
        kind: o.anovaKind,
        comparisons: o.comparisons === "none" ? null : o.comparisons,
        control_index: o.controlIndex,
        ...(o.anovaKind === "nonparametric" && o.dunnCorrected === false
          ? { dunn_corrected: false } : {}),
      } };
  }
  if (o.analysis === "median_test") return { analysis: "median_test", ...base, options: {} };
  if (o.analysis === "correlation") {
    // One-sided P values come with every result; corrTails only picks
    // which one the results show.
    return { analysis: "correlation", ...base,
      options: { method: o.corrMethod,
                 dataset_a: o.datasetA, dataset_b: o.datasetB } };
  }
  if (o.analysis === "two_way_anova") {
    // "All cell means" are compared by runColumn (one-way on the cells).
    const allCells = o.twoWayDirection === "all_cells";
    return { analysis: "two_way_anova", ...base,
      options: {
        row_factor: "Rows", col_factor: "Datasets",
        comparisons: o.twoWayComparisons === "none" || allCells
          ? null : o.twoWayComparisons,
        direction: allCells ? "columns_within_rows" : o.twoWayDirection,
        ...(o.twoWayModel === "additive" ? { model: "additive" } : {}),
      } };
  }
  if (o.analysis === "rm_two_way") {
    return { analysis: "rm_two_way", ...base,
      options: { design: o.rmTwoDesign } };
  }
  if (o.analysis === "rm_anova") {
    return { analysis: "rm_anova", ...base,
      options: { kind: o.rmKind,
        ...(o.rmKind === "nonparametric" && o.rmExact ? { exact: true } : {}) } };
  }
  if (o.analysis === "roc") {
    return { analysis: "roc", ...base,
      options: { patients: o.datasetA, controls: o.datasetB } };
  }
  if (o.analysis === "bland_altman") {
    // Pairs are rows holding both values: the engine's bland_altman
    // flattens each column, so blank rows would shift the pairing. Send
    // only the complete rows of the two columns.
    const d = base.data.datasets;
    const a = d[o.datasetA]?.ys.map((r) => r[0] ?? null) ?? [];
    const b = d[o.datasetB]?.ys.map((r) => r[0] ?? null) ?? [];
    const keep = a.map((v, r) => v !== null && b[r] !== null && b[r] !== undefined);
    const pick = (col: (number | null)[]) => col.filter((_, r) => keep[r]).map((v) => [v]);
    return { analysis: "bland_altman", data: { x: [], datasets: [
      { name: d[o.datasetA]?.name ?? "", ys: pick(a) },
      { name: d[o.datasetB]?.name ?? "", ys: pick(b) },
    ] }, options: { dataset_a: 0, dataset_b: 1 } };
  }
  if (o.outlierMethod === "rout") {
    return { analysis: "rout_column", ...base,
      options: { q: (parseCell(o.routQ) ?? 1) / 100 } };
  }
  return { analysis: "outliers", ...base,
    options: { alpha: parseCell(o.grubbsAlpha) ?? 0.05 } };
}

type Result = Record<string, unknown>;

/** Column analyses of data entered as mean with SD / SEM / %CV / CI and
 *  N: unpaired (Welch) and one-sample t tests, ordinary one-way and
 *  two-way ANOVA run exactly from the summaries; descriptive statistics
 *  show what the summaries determine. Everything else needs the raw
 *  values, and says so. One group per dataset is taken from the first
 *  row holding a mean. */
export function runColumnSummary(engine: EngineBridge, table: DataTableModel,
  o: ColumnOptionsState): Result {
  const fmtLabel = SUBCOLUMN_FORMAT_LABELS[table.subcolumnFormat];
  const format = SUBCOLUMN_FORMAT_ENGINE[table.subcolumnFormat];
  const sets = numericData(table).datasets;
  const data = { format, datasets: sets.map((d) => ({ name: d.name, rows: d.ys })) };
  const call = (analysis: string, options: Result, rename: string): Result => {
    const r = engine.analyze({ analysis, data, options }) as Result;
    if (r.error) return { error: `not possible from ${fmtLabel} data: ${String(r.error)}` };
    return { ...r, analysis: rename, from_summary: true };
  };
  switch (o.analysis) {
    case "column_statistics": {
      const r = engine.analyze({ analysis: "summary_convert", data,
        options: { error_bars: "ci95" } }) as Result;
      if (r.error) return { error: String(r.error) };
      type Row = { mean: number | null; sd: number | null; sem: number | null; n: number | null };
      type Bar = { lo: number | null; hi: number | null; kind: string | null };
      const out: Result[] = [];
      (r.datasets as { name: string; rows: Row[]; bars: Bar[] }[]).forEach((d) => {
        const filled = d.rows.map((row, i) => ({ row, bar: d.bars[i], i }))
          .filter((x) => x.row.mean !== null);
        filled.forEach(({ row, bar, i }) => {
          out.push({
            name: filled.length > 1 ? `${d.name}, row ${i + 1}` : d.name,
            descriptive: {
              n: row.n ?? "n/a", mean: row.mean, sd: row.sd, sem: row.sem,
              ci_mean: bar?.kind === "ci95" ? [bar.lo, bar.hi] : null,
              cv_percent: row.sd !== null && row.mean ? (100 * row.sd) / Math.abs(row.mean) : null,
            },
            normality: {},
          });
        });
      });
      return { analysis: "column_statistics", from_summary: true, datasets: out };
    }
    case "ttest":
      return call("ttest_summary", {
        kind: o.ttestKind === "welch" ? "unpaired" : o.ttestKind,
        welch: o.ttestKind === "welch",
        dataset_a: o.datasetA, dataset_b: o.datasetB,
      }, "ttest");
    case "anova":
      if (o.anovaKind === "parametric" && o.anovaSd === "unequal") {
        return { error: "The Welch and Brown-Forsythe ANOVA need the raw values; "
          + `they are not available from data entered as ${fmtLabel}.` };
      }
      return call("anova_summary", {
        kind: o.anovaKind,
        comparisons: o.comparisons === "none" ? null : o.comparisons,
        control_index: o.controlIndex,
      }, "anova");
    case "two_way_anova": {
      // cells without a mean are blank, and trailing empty rows are dropped
      let last = -1;
      sets.forEach((d) => d.ys.forEach((row, i) => { if (row[0] != null) last = Math.max(last, i); }));
      const twoData = { format, datasets: sets.map((d) => ({
        name: d.name,
        rows: d.ys.slice(0, last + 1).map((row) => (row[0] == null ? null : row)),
      })) };
      const allCells = o.twoWayDirection === "all_cells";
      const rowNames = table.rowTitles.slice(0, last + 1).map((t, i) => t.trim() || `Row ${i + 1}`);
      const r = engine.analyze({ analysis: "two_way_anova_summary", data: twoData,
        options: {
          row_factor: "Rows", col_factor: "Datasets",
          comparisons: o.twoWayComparisons === "none" || allCells ? null : o.twoWayComparisons,
          direction: allCells ? "columns_within_rows" : o.twoWayDirection,
          row_names: rowNames,
          ...(o.twoWayModel === "additive" ? { model: "additive" } : {}),
        } }) as Result;
      if (r.error) return { error: `not possible from ${fmtLabel} data: ${String(r.error)}` };
      let mc: Result | null = null;
      if (allCells && o.twoWayComparisons !== "none" && o.twoWayModel !== "additive") {
        // one group per cell, from that cell's mean / SD / N
        const cells = rowNames.flatMap((rn, i) => sets
          .filter((d) => d.ys[i]?.[0] != null)
          .map((d) => ({ name: `${rn}:${d.name}`, rows: [d.ys[i]] })));
        const c = engine.analyze({ analysis: "anova_summary", data: { format, datasets: cells },
          options: { kind: "parametric", comparisons: o.twoWayComparisons } }) as Result;
        const m = c.multiple_comparisons as Result | undefined;
        if (!c.error && m) {
          const comps = (m.comparisons as Result[]).map((x) => ({
            family: "All cells", pair: x.pair, difference: x.difference, ci95: x.ci ?? null,
            statistic: x.statistic, p_adjusted: x.p_adjusted, significant_05: x.significant_05 }));
          mc = { method: o.twoWayComparisons, direction: "all_cells",
            ms_residual: (c.table as Result)?.ms_within, df_residual: (c.table as Result)?.df_within,
            n_comparisons: comps.length, comparisons: comps };
        }
      }
      return { ...r, analysis: "two_way_anova", from_summary: true,
        ...(mc ? { multiple_comparisons: mc } : {}) };
    }
    default:
      return {
        error: `${COLUMN_ANALYSIS_LABELS[o.analysis] ?? "This analysis"} needs the raw `
          + `values; it is not possible from data entered as ${fmtLabel}. `
          + "Unpaired and one-sample t tests and ordinary one- and two-way ANOVA work "
          + "from summary data.",
      };
  }
}
