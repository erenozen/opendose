// Drug-combination synergy from a dose-response matrix: monotherapy fits,
// HSA / Bliss / Loewe / ZIP synergy landscapes with summary scores (and
// their SD over replicate matrices), Chou-Talalay combination indices;
// graphs: landscapes per model, monotherapy curves, Fa-CI plot.
import { lazyPart } from "../lazy";
import { defineAnalysis, defineGraph, type GraphKindDef } from "../types";
import type { AssayModule } from "./index";
import { emptyLayout } from "./kit/columns";
import {
  A_SYNERGY, G_SYN_FACI, G_SYN_LANDSCAPE, G_SYN_MONO, normalizeSynergy, synergyPayload,
  type SynergyOptions,
} from "./synergyModel";
import { synergySample } from "./synergySample";

const panels = () => import("./synergyPanels");
const SynergyControls = lazyPart(panels, "SynergyControls");
const SynergyResults = lazyPart(panels, "SynergyResults");
const SynergyMethods = lazyPart(panels, "SynergyMethods");
const plots = () => import("./synergyPlots");
const LandscapePlot = lazyPart(plots, "LandscapePlot");
const LandscapeOptions = lazyPart(plots, "LandscapeOptions");
const MonoPlot = lazyPart(plots, "MonoPlot");
const FaCiPlot = lazyPart(plots, "FaCiPlot");

type R = Record<string, unknown>;

export const synergyAnalysis = defineAnalysis<SynergyOptions, R>({
  id: A_SYNERGY,
  label: "Drug combination synergy (Bliss, HSA, Loewe, ZIP, Chou-Talalay)",
  short: "Synergy",
  description: "A combination matrix (drug 1 as rows, drug 2 as columns, replicate "
    + "matrices as subcolumns): monotherapy fits, synergy landscapes and scores, "
    + "combination indices.",
  sheetName: (t) => `Synergy of ${t}`,
  defaultOptions: ({ table }) => normalizeSynergy({}, table),
  normalizeOptions: (raw, { table }) => normalizeSynergy(raw, table),
  run: (engine, table, options) => {
    const p = synergyPayload(table, options);
    if ("error" in p && !("analysis" in p)) return { error: p.error };
    return engine.analyze(p as Record<string, unknown>) as R;
  },
  defaultGraph: G_SYN_LANDSCAPE,
  ControlsPanel: SynergyControls,
  ResultsPanel: SynergyResults,
  MethodsPanel: SynergyMethods,
});

const graphs: GraphKindDef[] = [
  defineGraph<SynergyOptions, R>({
    id: G_SYN_LANDSCAPE, label: "Synergy landscapes (one heat map per model)",
    group: "synergy", analysis: A_SYNERGY,
    autoTitles: (_t, o) => {
      const u = o?.unit ? ` (${o.unit})` : "";
      return { x: `${o?.drug2 || "Drug 2"}${u}`, y: `${o?.drug1 || "Drug 1"}${u}` };
    },
    exportName: "synergy-landscapes",
    PlotPanel: LandscapePlot, OptionsPanel: LandscapeOptions,
    formatFeatures: { noDatasets: true, noAxes: true },
    sheetName: (t) => `Synergy landscapes of ${t}`,
  }),
  defineGraph<SynergyOptions, R>({
    id: G_SYN_MONO, label: "Monotherapy dose-response curves",
    group: "synergy", analysis: A_SYNERGY,
    autoTitles: (_t, o) => ({ x: `Concentration${o?.unit ? ` (${o.unit})` : ""}`, y: "Inhibition (%)" }),
    exportName: "monotherapy-curves",
    PlotPanel: MonoPlot,
    formatFeatures: { points: true, lines: true },
    formatDatasets: (_t, _g, o) => [o?.drug1 || "Drug 1", o?.drug2 || "Drug 2"],
  }),
  defineGraph<SynergyOptions, R>({
    id: G_SYN_FACI, label: "Fa-CI plot (Chou-Talalay)",
    group: "synergy", analysis: A_SYNERGY,
    autoTitles: () => ({ x: "Fraction affected (Fa)", y: "Combination index (CI)" }),
    exportName: "fa-ci-plot",
    PlotPanel: FaCiPlot,
    formatFeatures: { points: true },
    formatDatasets: () => ["Combinations"],
  }),
];

/** Settings of the example matrix. */
const SAMPLE_OPTIONS = { drug1: "Ispinesib", drug2: "Ibrutinib", unit: "nM", responseKind: "viability" };

export const synergyAssay: AssayModule = {
  id: "synergy",
  label: "Drug combination synergy",
  description: "A dose matrix of two drugs (drug 1 as rows, drug 2 as columns, replicate "
    + "matrices as subcolumns): monotherapy fits, Bliss, HSA, Loewe and ZIP landscapes "
    + "with scores, and Chou-Talalay combination indices.",
  tableType: "grouped",
  tableName: "Combination matrix",
  emptyTable: () => emptyLayout(synergySample(), { keepRowTitles: true }),
  sampleTable: synergySample,
  sampleOptions: () => ({ ...SAMPLE_OPTIONS }),
  mainAnalysis: A_SYNERGY,
  analyses: [{ def: synergyAnalysis, types: ["grouped", "multivariable"] }],
  graphs: graphs.map((def) => ({ def, types: ["grouped", "multivariable"] })),
  templates: [{
    id: "synergy-matrix",
    name: "Drug combination matrix (synergy)",
    description: "A 6 × 6 dose matrix of two drugs (rows: drug 1, columns: drug 2, % viability; "
      + "SynergyFinder's example block). Bliss, HSA, Loewe and ZIP landscapes and scores, and "
      + "Chou-Talalay combination indices. Replicate matrices go side by side as subcolumns.",
    tableName: "Combination matrix",
    table: synergySample,
    analysis: A_SYNERGY,
    options: SAMPLE_OPTIONS,
  }],
};
