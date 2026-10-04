// Growth curves (OD600 / counts against time) on XY tables: blank and log
// preprocessing, a growth model per curve, doubling time with its CI, the
// preprocessed curves as a linked table. Example: Growthcurver's well A1.
import type { EngineBridge } from "../../lib/engine";
import type { DataTableModel } from "../../project/types";
import type { AnalysisResult } from "../../types";
import { lazyPart } from "../lazy";
import { defineAnalysis, defineGraph } from "../types";
import type { AssayModule } from "./types";
import {
  ANALYSIS_GROWTH, DEFAULT_GROWTH, GRAPH_GROWTH, doublingTime, growthTransformPayload,
  growthYTitle, normalizeGrowth, transformedTable, type Doubling, type GrowthOptions,
} from "./growthModel";
import { growthSample } from "./growthSample";

const panels = () => import("./growthPanels");
const GrowthControls = lazyPart(panels, "GrowthControls");
const GrowthResults = lazyPart(panels, "GrowthResults");
const GrowthMethods = lazyPart(panels, "GrowthMethods");
const GrowthPlot = lazyPart(panels, "GrowthPlot");

export interface GrowthPrep {
  x: (number | null)[];
  datasets: { name: string; ys: (number | null)[][] }[];
  blank: (number | null)[];
  n_nonpositive_dropped: number;
  n_missing_blank: number;
  log: string | null;
}

export type GrowthResult = AnalysisResult & {
  prep?: GrowthPrep;
  doubling?: (Doubling | null)[];
};

export function runGrowth(engine: EngineBridge, table: DataTableModel,
  o: GrowthOptions): GrowthResult {
  const fail = (error: string): GrowthResult => ({ analysis: "dose_response", datasets: [], error });
  if (table.subcolumnFormat !== "replicates") {
    return fail("Growth curves need the measured values (replicates), not means with errors");
  }
  const prep = engine.analyze(growthTransformPayload(table, o)) as GrowthPrep & { error?: string };
  if (prep.error) return fail(prep.error);
  const fit = engine.analyze({
    analysis: "dose_response",
    data: { x: prep.x, datasets: prep.datasets },
    options: { model: o.model, error_bars: "sd" },
  }) as AnalysisResult;
  if (fit.error) return fail(fit.error);
  const doubling = fit.datasets.map((d) => (d.fit
    ? doublingTime(o.model, d.fit.params as never, o.log) : null));
  return { ...fit, prep, doubling };
}

export const growthAnalysis = defineAnalysis<GrowthOptions, GrowthResult>({
  id: ANALYSIS_GROWTH,
  label: "Growth curves (OD600, counts): blank, log, growth model",
  short: "Growth",
  description: "Blank subtraction and log transform of growth curves, a logistic, "
    + "Gompertz or Zwietering lag model per curve, and the doubling time with its CI.",
  sheetName: (t) => `Growth curves of ${t}`,
  defaultOptions: () => ({ ...DEFAULT_GROWTH }),
  normalizeOptions: (raw) => normalizeGrowth(raw),
  run: runGrowth,
  defaultGraph: GRAPH_GROWTH,
  ControlsPanel: GrowthControls,
  ResultsPanel: GrowthResults,
  MethodsPanel: GrowthMethods,
  derivedOnDemand: true,
  derivedTable: (result, source, options) => (result.error || !result.prep
    ? null : transformedTable(source, result.prep, options)),
  derivedName: (t) => `${t} (blanked)`,
});

export const growthGraph = defineGraph<GrowthOptions, GrowthResult>({
  id: GRAPH_GROWTH,
  label: "Growth curves with the fitted model",
  group: "growth",
  analysis: ANALYSIS_GROWTH,
  autoTitles: (t, o) => ({
    x: t.xTitle && t.xTitle !== "X" ? t.xTitle : "Time",
    y: growthYTitle(t, o ?? DEFAULT_GROWTH),
  }),
  exportName: "growth-curves",
  PlotPanel: GrowthPlot,
  formatFeatures: { points: true, lines: true, connect: true, errorBars: true },
  sheetName: (t) => `Growth graph of ${t}`,
});

export const growthAssay: AssayModule = {
  id: "growth",
  label: "Growth curves",
  analyses: { xy: [growthAnalysis] },
  graphs: { xy: [growthGraph] },
  templates: [{
    id: "growth-curve",
    name: "Bacterial growth curve (OD600)",
    description: "OD600 every 10 minutes for 24 hours (Growthcurver's example well A1). "
      + "Each curve's minimum is subtracted as the blank and a logistic growth model is "
      + "fitted, giving the carrying capacity, the growth rate and the doubling time.",
    tableName: "Growth curve",
    table: growthSample,
    analysis: ANALYSIS_GROWTH,
  }],
};
