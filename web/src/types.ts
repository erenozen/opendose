export type Cell = string; // raw user input; "" = blank

export interface DatasetState {
  name: string;
  rows: Cell[][]; // rows x replicate subcolumns
}

export interface ModelMeta {
  label: string;
  family: string;
  xLabel: string;     // axis title stem
  needsLogX: boolean; // engine expects X as log10(concentration)
  constrainable: string[];
  constants?: string[]; // experimental constants the user must supply
}

// Mirrors the engine's nlfit registry (keep in sync).
export const MODELS_META: Record<string, ModelMeta> = {
  log_inhibitor_vs_response_4pl: {
    label: "log(inhibitor) vs. response - Variable slope (four parameters)",
    family: "Dose-response: Inhibition", xLabel: "log[Inhibitor]",
    needsLogX: true, constrainable: ["Top", "Bottom", "HillSlope"],
  },
  log_inhibitor_vs_response_3pl: {
    label: "log(inhibitor) vs. response (three parameters)",
    family: "Dose-response: Inhibition", xLabel: "log[Inhibitor]",
    needsLogX: true, constrainable: ["Top", "Bottom"],
  },
  log_agonist_vs_response_4pl: {
    label: "log(agonist) vs. response - Variable slope (four parameters)",
    family: "Dose-response: Stimulation", xLabel: "log[Agonist]",
    needsLogX: true, constrainable: ["Top", "Bottom", "HillSlope"],
  },
  log_agonist_vs_response_3pl: {
    label: "log(agonist) vs. response (three parameters)",
    family: "Dose-response: Stimulation", xLabel: "log[Agonist]",
    needsLogX: true, constrainable: ["Top", "Bottom"],
  },
  michaelis_menten: {
    label: "Michaelis-Menten", family: "Enzyme kinetics",
    xLabel: "[Substrate]", needsLogX: false, constrainable: ["Vmax", "Km"],
  },
  saturation_binding: {
    label: "One site - Specific binding", family: "Binding: Saturation",
    xLabel: "[Ligand]", needsLogX: false, constrainable: ["Bmax", "Kd"],
  },
  one_site_competition: {
    label: "One site - Fit logIC50", family: "Binding: Competitive",
    xLabel: "log[Competitor]", needsLogX: true,
    constrainable: ["Top", "Bottom"],
  },
  one_site_fit_ki: {
    label: "One site - Fit Ki", family: "Binding: Competitive",
    xLabel: "log[Competitor]", needsLogX: true,
    constrainable: ["Top", "Bottom"],
    constants: ["HotNM", "HotKdNM"],
  },
  two_site_competition: {
    label: "Two sites - Fit logIC50", family: "Binding: Competitive",
    xLabel: "log[Competitor]", needsLogX: true,
    constrainable: ["Top", "Bottom"],
  },
  ec50_shift: {
    label: "EC50 shift (Gaddum/Schild), global fit",
    family: "Binding: Competitive",
    xLabel: "log[Agonist]", needsLogX: true,
    constrainable: ["Top", "Bottom", "HillSlope"],
  },
  one_phase_decay: {
    label: "One phase decay", family: "Exponential",
    xLabel: "Time", needsLogX: false,
    constrainable: ["Y0", "Plateau", "K"],
  },
  one_phase_association: {
    label: "One phase association", family: "Exponential",
    xLabel: "Time", needsLogX: false,
    constrainable: ["Y0", "Plateau", "K"],
  },
  exponential_growth: {
    label: "Exponential growth", family: "Exponential",
    xLabel: "Time", needsLogX: false, constrainable: ["Y0", "K"],
  },
  two_phase_decay: {
    label: "Two phase decay", family: "Exponential",
    xLabel: "Time", needsLogX: false, constrainable: ["Y0", "Plateau"],
  },
  straight_line: {
    label: "Straight line", family: "Lines",
    xLabel: "X", needsLogX: false, constrainable: ["Slope", "Yintercept"],
  },
  polynomial_second: {
    label: "Second order polynomial", family: "Lines",
    xLabel: "X", needsLogX: false, constrainable: [],
  },
  polynomial_third: {
    label: "Third order polynomial", family: "Lines",
    xLabel: "X", needsLogX: false, constrainable: [],
  },
};

export type ModelId = keyof typeof MODELS_META & string;

export const MODEL_FAMILIES: string[] = [...new Set(
  Object.values(MODELS_META).map((m) => m.family),
)];

export type WeightingKind = "none" | "1/Y" | "1/Y2" | "1/X" | "1/X2";

export const WEIGHTING_LABELS: Record<WeightingKind, string> = {
  none: "No weighting (ordinary least squares)",
  "1/Y": "Weight by 1/Y (Poisson-like)",
  "1/Y2": "Weight by 1/Y² (relative distance)",
  "1/X": "Weight by 1/X",
  "1/X2": "Weight by 1/X²",
};

export type CIMethod = "asymptotic" | "profile";

export type ErrorBarKind = "sd" | "sem" | "ci95" | "range" | "none";

export const ERROR_BAR_LABELS: Record<ErrorBarKind, string> = {
  sd: "SD",
  sem: "SEM",
  ci95: "95% CI",
  range: "Range (min–max)",
  none: "None",
};

export interface ConstraintState {
  enabled: boolean;
  value: string;
}

export interface NormalizeState {
  enabled: boolean;
  zeroMode: "smallest" | "first" | "value";
  zeroValue: string;
  hundredMode: "largest" | "last" | "value" | "sum";
  hundredValue: string;
  asPercent: boolean;
  subcolumns: "mean" | "separate";
}

export interface OptionsState {
  model: ModelId;
  xIsLog: boolean;
  errorBars: ErrorBarKind;
  top: ConstraintState;
  bottom: ConstraintState;
  hillSlope: ConstraintState;
  normalize: NormalizeState;
  weighting: WeightingKind;
  ciMethod: CIMethod;
  routEnabled: boolean;
  routQ: string; // percent, e.g. "1"
  bands: "none" | "confidence" | "prediction";
  diagnostics: boolean;
  interpolateY: string;      // comma/newline-separated Y values, "" = off
  sharedParams: string[];    // non-empty -> global fit
  modelConstants: Record<string, string>; // e.g. HotNM for "Fit Ki"
  antagonist: string;        // ec50_shift: comma-separated [B] per dataset
  schildSlopeUnity: boolean; // ec50_shift: constrain SchildSlope = 1
}

// --- engine result shapes ---

export interface ParamEntry {
  value: number;
  se: number | null;
  ci95: [number, number] | null;
  constrained: boolean;
  derived?: boolean;
  shared?: boolean; // global fit: one value across datasets
}

export interface FitResult {
  model: string;
  label?: string;
  equation: string;
  status: "converged" | "ambiguous";
  dependency: Record<string, number>;
  weighting?: WeightingKind;
  ci_method?: CIMethod;
  param_order?: string[];
  params: Record<string, ParamEntry>;
  goodness: {
    df: number;
    n_points: number;
    r_squared: number | null;
    ss_res: number;
    sy_x: number;
  };
  curve: { x: number[]; y: number[] };
}

export interface ErrorBar {
  mean: number | null;
  lo: number | null;
  hi: number | null;
  n: number;
}

export interface RoutInfo {
  q: number;
  rsdr: number;
  n_outliers: number;
  outliers: { x: number; y: number; residual: number }[];
}

export interface BandData {
  x: number[];
  y: number[];
  lower: number[];
  upper: number[];
}

export interface DatasetResult {
  name: string;
  fit?: FitResult;
  rout?: RoutInfo;
  bands?: BandData;
  interpolated_x?: (number | null)[];
  diagnostics?: Record<string, unknown>;
  error?: string;
  points: { x: (number | null)[]; bars: ErrorBar[] };
}

export interface AnalysisResult {
  analysis: string;
  datasets: DatasetResult[];
  error?: string;
}

// --- column-table statistics ---

export type TableMode = "xy" | "column" | "contingency" | "survival";

export type ColumnAnalysisKind =
  | "column_statistics"
  | "ttest"
  | "anova"
  | "rm_anova"
  | "two_way_anova"
  | "rm_two_way"
  | "correlation"
  | "roc"
  | "bland_altman"
  | "outliers";

export const COLUMN_ANALYSIS_LABELS: Record<ColumnAnalysisKind, string> = {
  column_statistics: "Column statistics (descriptive + normality)",
  ttest: "t test / nonparametric (two groups)",
  anova: "One-way ANOVA (and nonparametric)",
  rm_anova: "Repeated-measures ANOVA / Friedman (rows = subjects)",
  two_way_anova: "Two-way ANOVA (rows × datasets)",
  rm_two_way: "Two-way ANOVA, repeated measures",
  correlation: "Correlation (two datasets)",
  roc: "ROC curve (patients vs controls)",
  bland_altman: "Bland-Altman method comparison",
  outliers: "Identify outliers (Grubbs / ROUT)",
};

export type TwoWayComparisons = "none" | "tukey" | "sidak" | "bonferroni";

export type TwoWayDirection =
  | "columns_within_rows" | "rows_within_columns"
  | "column_means" | "row_means";

export const TWO_WAY_DIRECTION_LABELS: Record<TwoWayDirection, string> = {
  columns_within_rows: "Within each row, compare datasets",
  rows_within_columns: "Within each dataset, compare rows",
  column_means: "Compare dataset main-effect means",
  row_means: "Compare row main-effect means",
};

export type ColumnGraphType = "scatter" | "bar" | "box" | "violin";

export const COLUMN_GRAPH_LABELS: Record<ColumnGraphType, string> = {
  scatter: "Scatter (points + mean ± SD)",
  bar: "Bar (mean ± SD + points)",
  box: "Box & whiskers",
  violin: "Violin",
};

export type TTestKind = "unpaired" | "welch" | "paired" | "mann_whitney" | "wilcoxon";

export const TTEST_LABELS: Record<TTestKind, string> = {
  unpaired: "Unpaired t test",
  welch: "Unpaired t with Welch's correction",
  paired: "Paired t test",
  mann_whitney: "Mann-Whitney (unpaired, nonparametric)",
  wilcoxon: "Wilcoxon matched pairs (nonparametric)",
};

export type ComparisonsMethod =
  | "none" | "tukey" | "dunnett" | "bonferroni" | "sidak" | "holm_sidak";

export const COMPARISONS_LABELS: Record<ComparisonsMethod, string> = {
  none: "No multiple comparisons",
  tukey: "Tukey (compare every pair)",
  dunnett: "Dunnett (compare to control)",
  bonferroni: "Bonferroni (every pair)",
  sidak: "Šídák (every pair)",
  holm_sidak: "Holm-Šídák (every pair)",
};

export interface ColumnOptionsState {
  analysis: ColumnAnalysisKind;
  hypothetical: string;        // column stats one-sample value ("" = off)
  ttestKind: TTestKind;
  datasetA: number;
  datasetB: number;
  anovaKind: "parametric" | "nonparametric";
  comparisons: ComparisonsMethod;
  controlIndex: number;
  grubbsAlpha: string;
  corrMethod: "pearson" | "spearman";
  rmKind: "parametric" | "nonparametric";
  outlierMethod: "grubbs" | "rout";
  routQ: string;
  twoWayComparisons: TwoWayComparisons;
  twoWayDirection: TwoWayDirection;
  rmTwoDesign: "mixed" | "both";
  graphType: ColumnGraphType;
}

export function parseCell(v: Cell): number | null {
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function formatSig(v: number | null | undefined, sig = 4): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "n/a";
  if (v === 0) return "0";
  const abs = Math.abs(v);
  if (abs >= 1e5 || abs < 1e-3) return v.toExponential(sig - 1);
  return Number(v.toPrecision(sig)).toString();
}
