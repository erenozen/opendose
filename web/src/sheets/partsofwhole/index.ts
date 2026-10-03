import { emptyTable, normalizeTable } from "../../project/table";
import DataGrid from "../common/DataGrid";
import { defineAnalysis, defineGraph, type TableTypeDef } from "../types";
import {
  FractionControls, FractionMethods, FractionResults, GofControls, GofMethods,
  GofResults,
} from "./panels";
import { PowOptions, PowPlot } from "./plot";
import {
  ANALYSIS_FRACTION, ANALYSIS_GOF, DEFAULT_FRACTION, DEFAULT_GOF,
  GRAPH_DONUT, GRAPH_PIE, GRAPH_STACKED, GRAPH_STACKED100,
  normalizeFraction, normalizeGof, partNames, powAutoTitles, runFraction, runGof,
  type FractionOptions, type GofOptions,
} from "./run";

export const fractionAnalysis = defineAnalysis<FractionOptions, Record<string, unknown>>({
  id: ANALYSIS_FRACTION,
  label: "Fraction of total",
  short: "Fractions",
  description: "Each value as a fraction or percentage of its column, row or "
    + "grand total, with optional confidence intervals.",
  sheetName: (t) => `Fraction of total of ${t}`,
  defaultOptions: () => ({ ...DEFAULT_FRACTION }),
  normalizeOptions: (raw) => normalizeFraction(raw),
  run: runFraction,
  defaultGraph: GRAPH_PIE,
  ControlsPanel: FractionControls,
  ResultsPanel: FractionResults,
  MethodsPanel: FractionMethods,
});

export const gofAnalysis = defineAnalysis<GofOptions, Record<string, unknown>>({
  id: ANALYSIS_GOF,
  label: "Chi-square goodness of fit (observed vs. expected)",
  short: "Goodness of fit",
  description: "Compare observed counts with an expected distribution; the "
    + "exact binomial test for two categories.",
  sheetName: (t) => `Goodness of fit of ${t}`,
  defaultOptions: () => ({ ...DEFAULT_GOF, expected: [] }),
  normalizeOptions: (raw) => normalizeGof(raw),
  run: runGof,
  defaultGraph: null,
  ControlsPanel: GofControls,
  ResultsPanel: GofResults,
  MethodsPanel: GofMethods,
});

const graph = (id: string, label: string) => defineGraph({
  id,
  label,
  group: "partsofwhole",
  analysis: null,
  autoTitles: powAutoTitles(id),
  showXTitle: false,
  exportName: "parts-of-whole",
  PlotPanel: PowPlot,
  OptionsPanel: PowOptions,
  // Format graph's "data sets" are the parts (rows): colour, legend text,
  // show / hide and order per part.
  formatDatasets: (table) => partNames(table),
  formatFeatures: id === GRAPH_PIE || id === GRAPH_DONUT
    ? { color: true, noAxes: true }
    : { bars: true, categoryX: true },
});

export const powGraphs = [
  graph(GRAPH_PIE, "Pie chart"),
  graph(GRAPH_DONUT, "Donut chart"),
  graph(GRAPH_STACKED, "Stacked bars (one per data set)"),
  graph(GRAPH_STACKED100, "Stacked bars, 100% of each data set"),
];

// Cell-cycle phase counts (cells scored per phase) for two conditions:
// small, whole-number counts, so every analysis and graph applies.
function partsOfWholeSample() {
  return normalizeTable({
    type: "partsofwhole",
    x: ["", "", ""],
    rowTitles: ["G1", "S", "G2/M"],
    yTitle: "Cells",
    datasets: [
      { name: "Control", rows: [["412"], ["188"], ["100"]] },
      { name: "Treated", rows: [["530"], ["95"], ["75"]] },
    ],
  });
}

export const partsOfWholeTable: TableTypeDef = {
  type: "partsofwhole",
  label: "Parts of whole",
  short: "Parts",
  description: "Values that add up to a whole: each row is one part, titled "
    + "on the left. For fractions of the total, pie and donut charts, and "
    + "goodness of fit against expected proportions.",
  status: "ready",
  defaultTable: (init) => emptyTable("partsofwhole", init),
  sampleTable: partsOfWholeSample,
  sampleName: "Cell cycle phases",
  Editor: DataGrid,
  entryHint: "Enter one value per part (counts or amounts); title each row "
    + "with the name of the part.",
  analyses: [fractionAnalysis, gofAnalysis],
  graphs: powGraphs,
};
