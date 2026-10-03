// Column analyses (t tests, ANOVA, nonparametric, correlation, ROC,
// Bland-Altman, outliers). They read each dataset's values; X is ignored,
// so they also run on the Y columns of an XY table.
import type { EngineBridge } from "../../lib/engine";
import { numericData, parseCell } from "../../project/table";
import {
  SUBCOLUMN_FORMAT_ENGINE, SUBCOLUMN_FORMAT_LABELS, type DataTableModel,
} from "../../project/types";
import type { ColumnOptionsState } from "../../types";
import { COLUMN_ANALYSIS_LABELS } from "../../types";

export function runColumn(engine: EngineBridge, table: DataTableModel,
  o: ColumnOptionsState): Record<string, unknown> {
  if (table.subcolumnFormat !== "replicates") return runColumnSummary(engine, table, o);
  const base = { data: numericData(table) };
  let payload: Record<string, unknown>;
  if (o.analysis === "column_statistics") {
    payload = { analysis: "column_statistics", ...base,
      options: { hypothetical: parseCell(o.hypothetical) } };
  } else if (o.analysis === "ttest") {
    payload = { analysis: "ttest", ...base,
      options: {
        kind: o.ttestKind === "welch" ? "unpaired" : o.ttestKind,
        welch: o.ttestKind === "welch",
        dataset_a: o.datasetA, dataset_b: o.datasetB,
      } };
  } else if (o.analysis === "anova") {
    payload = { analysis: "anova", ...base,
      options: {
        kind: o.anovaKind,
        comparisons: o.comparisons === "none" ? null : o.comparisons,
        control_index: o.controlIndex,
      } };
  } else if (o.analysis === "correlation") {
    payload = { analysis: "correlation", ...base,
      options: { method: o.corrMethod,
                 dataset_a: o.datasetA, dataset_b: o.datasetB } };
  } else if (o.analysis === "two_way_anova") {
    payload = { analysis: "two_way_anova", ...base,
      options: {
        row_factor: "Rows", col_factor: "Datasets",
        comparisons: o.twoWayComparisons === "none"
          ? null : o.twoWayComparisons,
        direction: o.twoWayDirection,
      } };
  } else if (o.analysis === "rm_two_way") {
    payload = { analysis: "rm_two_way", ...base,
      options: { design: o.rmTwoDesign } };
  } else if (o.analysis === "rm_anova") {
    payload = { analysis: "rm_anova", ...base,
      options: { kind: o.rmKind } };
  } else if (o.analysis === "roc") {
    payload = { analysis: "roc", ...base,
      options: { patients: o.datasetA, controls: o.datasetB } };
  } else if (o.analysis === "bland_altman") {
    payload = { analysis: "bland_altman", ...base,
      options: { dataset_a: o.datasetA, dataset_b: o.datasetB } };
  } else if (o.outlierMethod === "rout") {
    payload = { analysis: "rout_column", ...base,
      options: { q: (parseCell(o.routQ) ?? 1) / 100 } };
  } else {
    payload = { analysis: "outliers", ...base,
      options: { alpha: parseCell(o.grubbsAlpha) ?? 0.05 } };
  }
  return engine.analyze(payload) as Record<string, unknown>;
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
      const r = engine.analyze({ analysis: "two_way_anova_summary", data: twoData,
        options: {
          row_factor: "Rows", col_factor: "Datasets",
          comparisons: o.twoWayComparisons === "none" ? null : o.twoWayComparisons,
          direction: o.twoWayDirection,
          row_names: table.rowTitles.slice(0, last + 1).map((t, i) => t.trim() || `Row ${i + 1}`),
        } }) as Result;
      if (r.error) return { error: `not possible from ${fmtLabel} data: ${String(r.error)}` };
      return { ...r, analysis: "two_way_anova", from_summary: true };
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
