// Column analyses (t tests, ANOVA, nonparametric, correlation, ROC,
// Bland-Altman, outliers). They read each dataset's values; X is ignored,
// so they also run on the Y columns of an XY table.
import type { EngineBridge } from "../../lib/engine";
import { numericData, parseCell } from "../../project/table";
import type { DataTableModel } from "../../project/types";
import type { ColumnOptionsState } from "../../types";

export function runColumn(engine: EngineBridge, table: DataTableModel,
  o: ColumnOptionsState): Record<string, unknown> {
  if (table.subcolumnFormat !== "replicates") {
    return {
      error: "Analyses of summary data (mean / SD / N) land in the next release",
    };
  }
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
