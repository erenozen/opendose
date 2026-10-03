import { ANALYSIS_CONTINGENCY } from "../../project/builtin";
import { emptyTable, normalizeTable, withExclusionsBlanked } from "../../project/table";
import DataGrid from "../common/DataGrid";
import { defineAnalysis, type TableTypeDef } from "../types";
import { ContingencyControls, ContingencyResults } from "./panels";

// Rows = groups, columns = outcomes; each dataset is one outcome column.
export const contingencyAnalysis = defineAnalysis<unknown, Record<string, unknown>>({
  id: ANALYSIS_CONTINGENCY,
  label: "Contingency analysis (Fisher, chi-square, OR, RR)",
  short: "Contingency",
  sheetName: (t) => `Contingency of ${t}`,
  defaultOptions: () => ({}),
  run: (engine, table) => {
    const t = withExclusionsBlanked(table);
    const counts = t.x.map((_, r) =>
      t.datasets.map((d) => Number((d.rows[r]?.[0] ?? "").trim() || "0")));
    if (counts.some((row) => row.some((v) => !Number.isFinite(v) || v < 0))) {
      return { error: "Enter counts as whole, non-negative numbers" };
    }
    return engine.analyze({
      analysis: "contingency", data: { table: counts }, options: {},
    }) as Record<string, unknown>;
  },
  defaultGraph: null,
  ControlsPanel: ContingencyControls,
  ResultsPanel: ContingencyResults,
});

function contingencySample() {
  return normalizeTable({
    type: "contingency",
    x: ["", ""],
    rowTitles: ["Exposed", "Not exposed"],
    datasets: [
      { name: "Event", rows: [["15"], ["5"]] },
      { name: "No event", rows: [["85"], ["95"]] },
    ],
  });
}

export const contingencyTable: TableTypeDef = {
  type: "contingency",
  label: "Contingency",
  short: "Cont",
  description: "Counts of subjects: rows are groups (e.g. exposed or not), "
    + "columns are outcomes. For Fisher's exact and chi-square tests, odds "
    + "ratio and relative risk.",
  status: "ready",
  defaultTable: (init) => emptyTable("contingency", init),
  sampleTable: contingencySample,
  sampleName: "Contingency example",
  Editor: DataGrid,
  analyses: [contingencyAnalysis],
  graphs: [],
};
