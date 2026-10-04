import { emptyTable } from "../../project/table";
import DataGrid from "../common/DataGrid";
import { lazyPart } from "../lazy";
import { defineAnalysis, defineGraph, type TableTypeDef } from "../types";
import "./mv.css";
import {
  defaultCorrelation, defaultDescriptive, defaultLogistic, defaultPca,
  defaultRearrange, defaultRegression, mergeOptions, tableFromRearranged,
  type CorrelationOptions, type DescriptiveOptions, type LogisticOptions,
  type PcaOptions, type RearrangeOptions, type RegressionOptions,
} from "./model";
import {
  biplotFormatDatasets, mvCatFormatDatasets, mvXYFormatDatasets,
} from "./graphSettings";
import {
  runCorrelation, runDescriptive, runLogistic, runPca, runRearrange,
  runRegression, type CorrelationResult, type DescriptiveResult,
  type LogisticResult, type PcaResult, type RearrangeResult, type RegressionResult,
} from "./run";
import { multivariableSample } from "./sample";
import { VOLCANO_GROUPS } from "./volcanoModel";
import { coxDefinitions } from "../survival";

// Panels load on first use (sheets/lazy.ts).
const controlsModule = () => import("./controls");
const CorrelationControls = lazyPart(controlsModule, "CorrelationControls");
const DescriptiveControls = lazyPart(controlsModule, "DescriptiveControls");
const LogisticControls = lazyPart(controlsModule, "LogisticControls");
const PcaControls = lazyPart(controlsModule, "PcaControls");
const RearrangeControls = lazyPart(controlsModule, "RearrangeControls");
const RegressionControls = lazyPart(controlsModule, "RegressionControls");
const volcanoModule = () => import("./volcano");
const MvVolcanoPlot = lazyPart(volcanoModule, "MvVolcanoPlot");
const MvVolcanoOptions = lazyPart(volcanoModule, "MvVolcanoOptions");
const plotsModule = () => import("./plots");
const BiplotOptions = lazyPart(plotsModule, "BiplotOptions");
const BiplotPlot = lazyPart(plotsModule, "BiplotPlot");
const CorrHeatOptions = lazyPart(plotsModule, "CorrHeatOptions");
const CorrHeatmap = lazyPart(plotsModule, "CorrHeatmap");
const ForestOptions = lazyPart(plotsModule, "ForestOptions");
const LoadingsOptions = lazyPart(plotsModule, "LoadingsOptions");
const LoadingsPlot = lazyPart(plotsModule, "LoadingsPlot");
const LogitCurvePlot = lazyPart(plotsModule, "LogitCurvePlot");
const LogitOddsPlot = lazyPart(plotsModule, "LogitOddsPlot");
const LogitRocPlot = lazyPart(plotsModule, "LogitRocPlot");
const MvCatOptions = lazyPart(plotsModule, "MvCatOptions");
const MvCategoricalPlot = lazyPart(plotsModule, "MvCategoricalPlot");
const MvXYOptions = lazyPart(plotsModule, "MvXYOptions");
const MvXYPlot = lazyPart(plotsModule, "MvXYPlot");
const RegActualPlot = lazyPart(plotsModule, "RegActualPlot");
const RegForestPlot = lazyPart(plotsModule, "RegForestPlot");
const RegResidualPlot = lazyPart(plotsModule, "RegResidualPlot");
const ScreePlot = lazyPart(plotsModule, "ScreePlot");
const resultsModule = () => import("./results");
const CorrelationMethods = lazyPart(resultsModule, "CorrelationMethods");
const CorrelationResults = lazyPart(resultsModule, "CorrelationResults");
const DescriptiveMethods = lazyPart(resultsModule, "DescriptiveMethods");
const DescriptiveResults = lazyPart(resultsModule, "DescriptiveResults");
const LogisticMethods = lazyPart(resultsModule, "LogisticMethods");
const LogisticResults = lazyPart(resultsModule, "LogisticResults");
const PcaMethods = lazyPart(resultsModule, "PcaMethods");
const PcaResults = lazyPart(resultsModule, "PcaResults");
const RearrangeResults = lazyPart(resultsModule, "RearrangeResults");
const RegressionMethods = lazyPart(resultsModule, "RegressionMethods");
const RegressionResults = lazyPart(resultsModule, "RegressionResults");

// Ids are stored in project files: never rename them.
export const ANALYSIS_MV_DESCRIPTIVE = "mv_descriptive";
export const ANALYSIS_MV_CORRELATION = "mv_correlation";
export const ANALYSIS_MV_REGRESSION = "mv_regression";
export const ANALYSIS_MV_LOGISTIC = "mv_logistic";
export const ANALYSIS_MV_PCA = "mv_pca";
export const ANALYSIS_MV_REARRANGE = "mv_rearrange";
export const ANALYSIS_MV_COX = "mv_cox";

// Cox regression with time and event variables (panels in sheets/survival).
const mvCox = coxDefinitions(ANALYSIS_MV_COX, "mv_cox", "Cox proportional hazards regression");

// ------------------------------------------------------------ analyses

export const mvDescriptive = defineAnalysis<DescriptiveOptions, DescriptiveResult>({
  id: ANALYSIS_MV_DESCRIPTIVE,
  label: "Descriptive statistics and graph of the data",
  short: "Descriptive",
  description: "Column statistics per continuous variable, level counts per "
    + "categorical one, and a graph of any variable against another.",
  sheetName: (t) => `Descriptive stats of ${t}`,
  defaultOptions: defaultDescriptive,
  normalizeOptions: (raw) => mergeOptions(defaultDescriptive(), raw),
  run: runDescriptive,
  defaultGraph: "mv_xy",
  ControlsPanel: DescriptiveControls,
  ResultsPanel: DescriptiveResults,
  MethodsPanel: DescriptiveMethods,
});

export const mvCorrelation = defineAnalysis<CorrelationOptions, CorrelationResult>({
  id: ANALYSIS_MV_CORRELATION,
  label: "Correlation matrix",
  short: "Correlation",
  description: "Pearson or Spearman r, P values, CIs and n for every pair of "
    + "variables, with a heat map.",
  sheetName: (t) => `Correlation matrix of ${t}`,
  defaultOptions: defaultCorrelation,
  normalizeOptions: (raw) => mergeOptions(defaultCorrelation(), raw),
  run: runCorrelation,
  defaultGraph: "mv_corr_heatmap",
  ControlsPanel: CorrelationControls,
  ResultsPanel: CorrelationResults,
  MethodsPanel: CorrelationMethods,
});

export const mvRegression = defineAnalysis<RegressionOptions, RegressionResult>({
  id: ANALYSIS_MV_REGRESSION,
  label: "Multiple linear regression",
  short: "Regression",
  description: "Least-squares fit of one continuous outcome on several "
    + "predictors, with categorical predictors and interactions.",
  sheetName: (t) => `Multiple regression of ${t}`,
  defaultOptions: ({ table }) => defaultRegression(table),
  normalizeOptions: (raw, { table }) => mergeOptions(defaultRegression(table), raw),
  run: runRegression,
  defaultGraph: "mv_reg_actual",
  ControlsPanel: RegressionControls,
  ResultsPanel: RegressionResults,
  MethodsPanel: RegressionMethods,
});

export const mvLogistic = defineAnalysis<LogisticOptions, LogisticResult>({
  id: ANALYSIS_MV_LOGISTIC,
  label: "Logistic regression (simple or multiple)",
  short: "Logistic",
  description: "Binary outcome: odds ratios, likelihood ratio test, "
    + "pseudo R², Hosmer-Lemeshow, classification table and ROC.",
  sheetName: (t) => `Logistic regression of ${t}`,
  defaultOptions: ({ table }) => defaultLogistic(table),
  normalizeOptions: (raw, { table }) => mergeOptions(defaultLogistic(table), raw),
  run: runLogistic,
  defaultGraph: "mv_logit_curve",
  ControlsPanel: LogisticControls,
  ResultsPanel: LogisticResults,
  MethodsPanel: LogisticMethods,
});

export const mvPca = defineAnalysis<PcaOptions, PcaResult>({
  id: ANALYSIS_MV_PCA,
  label: "Principal component analysis (PCA)",
  short: "PCA",
  description: "Eigenvalues, loadings and scores; components chosen by "
    + "parallel analysis or a classic rule.",
  sheetName: (t) => `PCA of ${t}`,
  defaultOptions: defaultPca,
  normalizeOptions: (raw) => mergeOptions(defaultPca(), raw),
  run: runPca,
  defaultGraph: "mv_pca_scree",
  ControlsPanel: PcaControls,
  ResultsPanel: PcaResults,
  MethodsPanel: PcaMethods,
});

export const mvRearrange = defineAnalysis<RearrangeOptions, RearrangeResult>({
  id: ANALYSIS_MV_REARRANGE,
  label: "Extract & rearrange / select & transform",
  short: "Rearrange",
  description: "Pick variables and rows, transform variables, and send the "
    + "result to a new data table.",
  sheetName: (t) => `Rearranged ${t}`,
  defaultOptions: defaultRearrange,
  normalizeOptions: (raw) => mergeOptions(defaultRearrange(), raw),
  run: runRearrange,
  defaultGraph: null,
  ControlsPanel: RearrangeControls,
  ResultsPanel: RearrangeResults,
  // "Create data table" makes a linked table that follows the source and
  // these settings (Unlink keeps it as ordinary data).
  derivedOnDemand: true,
  derivedTable: (result, source) => (result.error || !result.variables
    ? null : tableFromRearranged(source, result)),
  derivedName: (t) => `${t} (rearranged)`,
});

// ------------------------------------------------------------ graphs

const none = () => ({ x: "", y: "" });

export const mvGraphs = [
  defineGraph({
    id: "mv_xy", label: "XY: one variable against another (bubble, color, size)",
    group: "mv_data", analysis: null, autoTitles: none, exportName: "multiple-variables",
    PlotPanel: MvXYPlot, OptionsPanel: MvXYOptions,
    formatDatasets: mvXYFormatDatasets,
    formatFeatures: { points: true, connect: true, errorBars: true },
  }),
  defineGraph({
    id: "mv_categorical", label: "Categorical: groups on X (points, bars, box, violin)",
    group: "mv_data", analysis: null, autoTitles: none, exportName: "categorical-graph",
    PlotPanel: MvCategoricalPlot, OptionsPanel: MvCatOptions,
    formatDatasets: mvCatFormatDatasets,
    formatFeatures: { categorical: true, points: true, errorBars: true, bars: true, boxes: true },
  }),
  defineGraph({
    id: "mv_volcano", label: "Volcano plot (fold change against P, from a results table)",
    group: "mv_data", analysis: null, autoTitles: none, exportName: "volcano-plot",
    PlotPanel: MvVolcanoPlot, OptionsPanel: MvVolcanoOptions,
    formatDatasets: () => VOLCANO_GROUPS,
    formatFeatures: { points: true },
  }),
  defineGraph<CorrelationOptions, CorrelationResult>({
    id: "mv_corr_heatmap", label: "Heat map of r", group: "mv_corr",
    analysis: ANALYSIS_MV_CORRELATION, autoTitles: none, showXTitle: false,
    exportName: "correlation-heat-map", PlotPanel: CorrHeatmap, OptionsPanel: CorrHeatOptions,
    formatFeatures: { noDatasets: true, noAxes: true },
  }),
  defineGraph<RegressionOptions, RegressionResult>({
    id: "mv_reg_actual", label: "Actual vs predicted", group: "mv_reg",
    analysis: ANALYSIS_MV_REGRESSION, autoTitles: none, exportName: "actual-vs-predicted",
    PlotPanel: RegActualPlot,
    formatDatasets: () => ["Observations"], formatFeatures: { points: true },
  }),
  defineGraph<RegressionOptions, RegressionResult>({
    id: "mv_reg_residuals", label: "Residuals vs predicted", group: "mv_reg",
    analysis: ANALYSIS_MV_REGRESSION, autoTitles: none, exportName: "residuals",
    PlotPanel: RegResidualPlot,
    formatDatasets: () => ["Observations"], formatFeatures: { points: true },
  }),
  defineGraph<RegressionOptions, RegressionResult>({
    id: "mv_reg_forest", label: "Coefficients with CIs (forest plot)", group: "mv_reg",
    analysis: ANALYSIS_MV_REGRESSION, autoTitles: none, exportName: "coefficients",
    PlotPanel: RegForestPlot, OptionsPanel: ForestOptions,
    formatFeatures: { noDatasets: true },
  }),
  defineGraph<LogisticOptions, LogisticResult>({
    id: "mv_logit_curve", label: "Fitted curve (one continuous predictor)", group: "mv_logit",
    analysis: ANALYSIS_MV_LOGISTIC, autoTitles: none, exportName: "logistic-fit",
    PlotPanel: LogitCurvePlot,
    formatDatasets: () => ["Fit and observations"], formatFeatures: { points: true, lines: true },
  }),
  defineGraph<LogisticOptions, LogisticResult>({
    id: "mv_logit_roc", label: "ROC curve of the fit", group: "mv_logit",
    analysis: ANALYSIS_MV_LOGISTIC, autoTitles: none, exportName: "roc-curve",
    PlotPanel: LogitRocPlot,
    formatDatasets: () => ["ROC curve"], formatFeatures: { lines: true, color: true },
  }),
  defineGraph<LogisticOptions, LogisticResult>({
    id: "mv_logit_odds", label: "Odds ratios with CIs (forest plot)", group: "mv_logit",
    analysis: ANALYSIS_MV_LOGISTIC, autoTitles: none, exportName: "odds-ratios",
    PlotPanel: LogitOddsPlot, OptionsPanel: ForestOptions,
    formatFeatures: { noDatasets: true },
  }),
  defineGraph<PcaOptions, PcaResult>({
    id: "mv_pca_scree", label: "Scree plot", group: "mv_pca",
    analysis: ANALYSIS_MV_PCA, autoTitles: none, exportName: "scree-plot",
    PlotPanel: ScreePlot,
    formatDatasets: () => ["Eigenvalues"], formatFeatures: { lines: true, color: true },
  }),
  defineGraph<PcaOptions, PcaResult>({
    id: "mv_pca_loadings", label: "Loadings plot", group: "mv_pca",
    analysis: ANALYSIS_MV_PCA, autoTitles: none, exportName: "pca-loadings",
    PlotPanel: LoadingsPlot, OptionsPanel: LoadingsOptions,
    formatFeatures: { noDatasets: true },
  }),
  defineGraph<PcaOptions, PcaResult>({
    id: "mv_pca_biplot", label: "Biplot (PC scores with loading vectors)", group: "mv_pca",
    analysis: ANALYSIS_MV_PCA, autoTitles: none, exportName: "pca-biplot",
    PlotPanel: BiplotPlot, OptionsPanel: BiplotOptions,
    formatDatasets: biplotFormatDatasets, formatFeatures: { points: true },
  }),
];

export const multivariableTable: TableTypeDef = {
  type: "multivariable",
  label: "Multiple variables",
  short: "Multi",
  description: "Spreadsheet-style: one row per observation, one column per "
    + "variable, each continuous or categorical. For correlation matrices, "
    + "multiple regression, logistic regression, Cox regression and PCA.",
  status: "ready",
  defaultTable: (init) => emptyTable("multivariable", init),
  sampleTable: multivariableSample,
  sampleName: "Dose study (multiple variables)",
  Editor: DataGrid,
  entryHint: "Each row is one observation (subject, sample); each column one "
    + "variable. Set a column to categorical for text levels such as "
    + "\"male\" / \"female\". Row titles can hold subject IDs.",
  analyses: [mvDescriptive, mvCorrelation, mvRegression, mvLogistic, mvCox.analysis, mvPca,
    mvRearrange],
  graphs: [...mvGraphs, ...mvCox.graphs],
};
