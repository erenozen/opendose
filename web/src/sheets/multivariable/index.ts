import { emptyTable } from "../../project/table";
import DataGrid from "../common/DataGrid";
import { defineAnalysis, defineGraph, type TableTypeDef } from "../types";
import {
  CorrelationControls, DescriptiveControls, LogisticControls, PcaControls,
  RearrangeControls, RegressionControls,
} from "./controls";
import "./mv.css";
import {
  defaultCorrelation, defaultDescriptive, defaultLogistic, defaultPca,
  defaultRearrange, defaultRegression, mergeOptions,
  type CorrelationOptions, type DescriptiveOptions, type LogisticOptions,
  type PcaOptions, type RearrangeOptions, type RegressionOptions,
} from "./model";
import {
  BiplotPlot, CorrHeatmap, LoadingsPlot, LogitCurvePlot, LogitOddsPlot,
  LogitRocPlot, MvCategoricalPlot, MvXYPlot, RegActualPlot, RegForestPlot,
  RegResidualPlot, ScreePlot,
} from "./plots";
import {
  CorrelationMethods, CorrelationResults, DescriptiveMethods, DescriptiveResults,
  LogisticMethods, LogisticResults, PcaMethods, PcaResults, RearrangeResults,
  RegressionMethods, RegressionResults,
} from "./results";
import {
  runCorrelation, runDescriptive, runLogistic, runPca, runRearrange,
  runRegression, type CorrelationResult, type DescriptiveResult,
  type LogisticResult, type PcaResult, type RearrangeResult, type RegressionResult,
} from "./run";
import { multivariableSample } from "./sample";

// Ids are stored in project files: never rename them.
export const ANALYSIS_MV_DESCRIPTIVE = "mv_descriptive";
export const ANALYSIS_MV_CORRELATION = "mv_correlation";
export const ANALYSIS_MV_REGRESSION = "mv_regression";
export const ANALYSIS_MV_LOGISTIC = "mv_logistic";
export const ANALYSIS_MV_PCA = "mv_pca";
export const ANALYSIS_MV_REARRANGE = "mv_rearrange";

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
});

// ------------------------------------------------------------ graphs

const none = () => ({ x: "", y: "" });

export const mvGraphs = [
  defineGraph({
    id: "mv_xy", label: "XY: one variable against another (bubble, color, size)",
    group: "mv_data", analysis: null, autoTitles: none, exportName: "multiple-variables",
    PlotPanel: MvXYPlot,
  }),
  defineGraph({
    id: "mv_categorical", label: "Categorical: groups on X (points, bars, box, violin)",
    group: "mv_data", analysis: null, autoTitles: none, exportName: "categorical-graph",
    PlotPanel: MvCategoricalPlot,
  }),
  defineGraph<CorrelationOptions, CorrelationResult>({
    id: "mv_corr_heatmap", label: "Heat map of r", group: "mv_corr",
    analysis: ANALYSIS_MV_CORRELATION, autoTitles: none, showXTitle: false,
    exportName: "correlation-heat-map", PlotPanel: CorrHeatmap,
  }),
  defineGraph<RegressionOptions, RegressionResult>({
    id: "mv_reg_actual", label: "Actual vs predicted", group: "mv_reg",
    analysis: ANALYSIS_MV_REGRESSION, autoTitles: none, exportName: "actual-vs-predicted",
    PlotPanel: RegActualPlot,
  }),
  defineGraph<RegressionOptions, RegressionResult>({
    id: "mv_reg_residuals", label: "Residuals vs predicted", group: "mv_reg",
    analysis: ANALYSIS_MV_REGRESSION, autoTitles: none, exportName: "residuals",
    PlotPanel: RegResidualPlot,
  }),
  defineGraph<RegressionOptions, RegressionResult>({
    id: "mv_reg_forest", label: "Coefficients with CIs (forest plot)", group: "mv_reg",
    analysis: ANALYSIS_MV_REGRESSION, autoTitles: none, exportName: "coefficients",
    PlotPanel: RegForestPlot,
  }),
  defineGraph<LogisticOptions, LogisticResult>({
    id: "mv_logit_curve", label: "Fitted curve (one continuous predictor)", group: "mv_logit",
    analysis: ANALYSIS_MV_LOGISTIC, autoTitles: none, exportName: "logistic-fit",
    PlotPanel: LogitCurvePlot,
  }),
  defineGraph<LogisticOptions, LogisticResult>({
    id: "mv_logit_roc", label: "ROC curve of the fit", group: "mv_logit",
    analysis: ANALYSIS_MV_LOGISTIC, autoTitles: none, exportName: "roc-curve",
    PlotPanel: LogitRocPlot,
  }),
  defineGraph<LogisticOptions, LogisticResult>({
    id: "mv_logit_odds", label: "Odds ratios with CIs (forest plot)", group: "mv_logit",
    analysis: ANALYSIS_MV_LOGISTIC, autoTitles: none, exportName: "odds-ratios",
    PlotPanel: LogitOddsPlot,
  }),
  defineGraph<PcaOptions, PcaResult>({
    id: "mv_pca_scree", label: "Scree plot", group: "mv_pca",
    analysis: ANALYSIS_MV_PCA, autoTitles: none, exportName: "scree-plot",
    PlotPanel: ScreePlot,
  }),
  defineGraph<PcaOptions, PcaResult>({
    id: "mv_pca_loadings", label: "Loadings plot", group: "mv_pca",
    analysis: ANALYSIS_MV_PCA, autoTitles: none, exportName: "pca-loadings",
    PlotPanel: LoadingsPlot,
  }),
  defineGraph<PcaOptions, PcaResult>({
    id: "mv_pca_biplot", label: "Biplot (PC scores with loading vectors)", group: "mv_pca",
    analysis: ANALYSIS_MV_PCA, autoTitles: none, exportName: "pca-biplot",
    PlotPanel: BiplotPlot,
  }),
];

export const multivariableTable: TableTypeDef = {
  type: "multivariable",
  label: "Multiple variables",
  short: "Multi",
  description: "Spreadsheet-style: one row per observation, one column per "
    + "variable, each continuous or categorical. For correlation matrices, "
    + "multiple regression, logistic regression and PCA.",
  status: "ready",
  defaultTable: (init) => emptyTable("multivariable", init),
  sampleTable: multivariableSample,
  sampleName: "Dose study (multiple variables)",
  Editor: DataGrid,
  entryHint: "Each row is one observation (subject, sample); each column one "
    + "variable. Set a column to categorical for text levels such as "
    + "\"male\" / \"female\". Row titles can hold subject IDs.",
  analyses: [mvDescriptive, mvCorrelation, mvRegression, mvLogistic, mvPca, mvRearrange],
  graphs: mvGraphs,
};
