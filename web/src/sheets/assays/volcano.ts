// Volcano plot from an imported fold-change / P table (multiple-variables
// tables): thresholds, optional FDR adjustment by the engine
// (fdr_adjust), up / down / not-significant counts, top-N labels and a
// linked table of the hits. The volcano of multiple t tests on grouped
// tables is a separate graph of that analysis.
import type { EngineBridge } from "../../lib/engine";
import type { DataTableModel } from "../../project/types";
import { parseCell } from "../../project/table";
import { lazyPart } from "../lazy";
import { defineAnalysis, defineGraph } from "../types";
import type { AssayModule } from "./index";
import { emptyLayout } from "./kit/columns";
import {
  A_VOLCANO, G_VOLCANO, classify, hitsTable, normalizeVolcano, volcanoRows,
  type Classified, type Status, type VolcanoOptions,
} from "./volcanoModel";
import { volcanoSample } from "./volcanoSample";

const panels = () => import("./volcanoPanels");
const VolcanoControls = lazyPart(panels, "VolcanoControls");
const VolcanoResults = lazyPart(panels, "VolcanoResults");
const VolcanoMethods = lazyPart(panels, "VolcanoMethods");
const VolcanoTablePlot = lazyPart(panels, "VolcanoTablePlot");
const VolcanoTableOptions = lazyPart(panels, "VolcanoTableOptions");

export interface VolcanoResult {
  error?: string;
  rows?: Classified[];
  counts?: Record<Status, number>;
  omitted?: number;
  adjusted?: boolean;
  method?: string;
}

export function runVolcano(engine: EngineBridge, table: DataTableModel, o: VolcanoOptions): VolcanoResult {
  const { rows, omitted, error } = volcanoRows(table, o);
  if (error) return { error };
  if (!rows.length) return { error: "No rows with both a fold change and a P value between 0 and 1" };
  let adjusted: (number | null)[] | null = null;
  if (!o.pAdjusted && o.fdr !== "none") {
    const r = engine.analyze({
      analysis: "fdr_adjust",
      data: { p_values: rows.map((x) => x.p), labels: rows.map((x) => x.name) },
      options: { method: o.fdr, alpha: parseCell(o.alpha) ?? 0.05, q: parseCell(o.alpha) ?? 0.05 },
    }) as { error?: string; adjusted?: (number | null)[] };
    if (r.error) return { error: r.error };
    adjusted = r.adjusted ?? null;
  }
  const c = classify(rows, adjusted, o);
  return { rows: c.rows, counts: c.counts, omitted, adjusted: !!adjusted || o.pAdjusted,
    method: o.pAdjusted ? "given" : o.fdr };
}

export const volcanoAnalysis = defineAnalysis<VolcanoOptions, VolcanoResult>({
  id: A_VOLCANO,
  label: "Volcano plot from a fold-change and P value table",
  short: "Volcano",
  description: "A DESeq2, limma or proteomics export: fold-change and P thresholds, "
    + "optional FDR adjustment, counts up / down, labelled top hits, a table of the hits.",
  sheetName: (t) => `Volcano of ${t}`,
  defaultOptions: ({ table }) => normalizeVolcano({}, table),
  normalizeOptions: (raw, { table }) => normalizeVolcano(raw, table),
  run: runVolcano,
  defaultGraph: G_VOLCANO,
  ControlsPanel: VolcanoControls,
  ResultsPanel: VolcanoResults,
  MethodsPanel: VolcanoMethods,
  derivedOnDemand: true,
  derivedTable: (result) => (result.error || !result.rows ? null
    : hitsTable(result.rows, result.rows.some((r) => r.q !== null))),
  derivedName: (t) => `Hits of ${t}`,
});

export const volcanoGraph = defineGraph<VolcanoOptions, VolcanoResult>({
  id: G_VOLCANO,
  label: "Volcano plot",
  group: "mv_volcano",
  analysis: A_VOLCANO,
  autoTitles: (_t, o) => ({
    x: o?.fcScale === "ratio" ? `log2(${o.fc || "fold change"})` : (o?.fc || "log2 fold change"),
    y: `−log10(${o?.p || "P"})`,
  }),
  exportName: "volcano-plot",
  PlotPanel: VolcanoTablePlot,
  OptionsPanel: VolcanoTableOptions,
  formatFeatures: { points: true },
  formatDatasets: () => ["Down", "Up", "Not significant"],
  sheetName: (t) => `Volcano plot of ${t}`,
});

export const volcanoAssay: AssayModule = {
  id: "volcano",
  label: "Volcano plot from a table",
  description: "A DESeq2, limma or proteomics export (name, fold change, P value): "
    + "thresholds, optional FDR adjustment, counts up and down, labelled top hits and a "
    + "linked table of the hits.",
  tableType: "multivariable",
  tableName: "Differential expression",
  emptyTable: () => emptyLayout(volcanoSample()),
  sampleTable: volcanoSample,
  mainAnalysis: A_VOLCANO,
  analyses: [{ def: volcanoAnalysis, types: ["multivariable"] }],
  graphs: [{ def: volcanoGraph, types: ["multivariable"] }],
  templates: [{
    id: "volcano-table",
    name: "Fold-change table (volcano plot)",
    description: "Gene, log2 fold change and P value for 240 genes, as a DESeq2 or limma "
      + "export reduces to. P values are adjusted by Benjamini-Hochberg; genes with an "
      + "adjusted P below 0.05 and at least a two-fold change are counted and labelled.",
    tableName: "Differential expression",
    table: volcanoSample,
    analysis: A_VOLCANO,
  }],
};
