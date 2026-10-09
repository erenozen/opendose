// The nested scatter of unit means shared by the nested two-way ANOVA
// (grouped tables) and the grouping-column mixed model (multiple-variables
// tables): one graph kind listed by both table types.
import { datasetLetter, parseCell } from "../../project/table";
import type { DataTableModel } from "../../project/types";
import { lazyPart } from "../lazy";
import { defineGraph } from "../types";
import { G_MIXED_NESTED, nestedBrackets, type MixedUnitOptions } from "./mixedModel";

/* eslint-disable @typescript-eslint/no-explicit-any */
const panels = () => import("./mixedPanels");
const MixedNestedPlot = lazyPart(panels, "MixedNestedPlot");
const MixedNestedOptions = lazyPart(panels, "MixedNestedOptions");

type Opts = (MixedUnitOptions & { factor1?: string; factor2?: string; outcome?: string }) | null;

/** Levels of a multiple-variables column, in order of first appearance. */
function columnLevels(t: DataTableModel, name: string | undefined): string[] {
  const d = t.datasets.find((x, i) => (x.name.trim() || `Variable ${datasetLetter(i)}`) === name);
  if (!d) return [];
  const out: string[] = [];
  for (const row of d.rows) {
    const v = (row[0] ?? "").trim();
    if (!v) continue;
    const label = d.varType === "categorical" ? v : String(parseCell(v) ?? v);
    if (!out.includes(label)) out.push(label);
  }
  return out;
}

export const mixedNestedGraph = defineGraph<Opts, Record<string, any>>({
  id: G_MIXED_NESTED,
  label: "Nested scatter: unit means with model cell means",
  group: "mixed_nested",
  analysis: null,
  autoTitles: (t, o) => ({ x: "", y: t.type === "multivariable" ? o?.outcome || "Value" : t.yTitle || "Value" }),
  showXTitle: false,
  exportName: "nested-mixed-model",
  PlotPanel: MixedNestedPlot,
  OptionsPanel: MixedNestedOptions,
  comparisons: (result) => nestedBrackets(result)?.set ?? null,
  formatDatasets: (t, _g, o) => (t.type === "multivariable"
    ? columnLevels(t, o?.factor2 || o?.factor1)
    : t.datasets.map((d, i) => d.name.trim() || `Data set ${String.fromCharCode(65 + (i % 26))}`)),
  formatFeatures: { points: true, errorBars: true, categoryX: true },
  sheetName: (t) => `Nested scatter of ${t}`,
});
