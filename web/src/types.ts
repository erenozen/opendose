export type Cell = string; // raw user input; "" = blank

export interface DatasetState {
  name: string;
  rows: Cell[][]; // rows x replicate subcolumns
}

// The model library (engine `list_models`, filled at engine boot) lives in
// lib/modelLibrary.ts; these re-exports keep the older import sites.
export {
  MODELS_META, MODEL_FAMILIES, USER_MODEL_ID, type ModelMeta,
} from "./lib/modelLibrary.ts";
import type { UserEquationDef } from "./lib/userEquation.ts";
export type { UserEquationDef } from "./lib/userEquation.ts";

/** A model id: a library id, "ec50_shift" (classic Gaddum/Schild path) or
 *  "user" (the equation in OptionsState.userEquation). */
export type ModelId = string;

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
  /** Tables of mean / SD / N: fit accounting for SD and N (same fit as
   *  the raw replicates) or the means only. Ignored for replicates. */
  summaryReplicates?: "account" | "means_only";
  /** Constants for parameters other than Top / Bottom / HillSlope (which
   *  keep their own fields above), keyed by parameter name. */
  paramConstraints?: Record<string, ConstraintState>;
  /** Data-set constants (e.g. the antagonist concentration B): parameter
   *  -> one value per data set; "" reads the number in the data set's
   *  title. */
  datasetConstants?: Record<string, string[]>;
  /** model === "user": the user-defined equation, stored with the
   *  results so a project file is self-contained. */
  userEquation?: UserEquationDef | null;
  /** A new XY table's fit starts by itself only when the data look like
   *  a dose-response ("auto", set by a new results sheet) or once the
   *  fit was asked for ("requested": a model picked, "Fit a curve", ...).
   *  Absent (older files) = "requested". See sheets/xy/autofit.ts. */
  autoFit?: "auto" | "requested";
  /** Y-based weighting: weights from the fitted curve held fixed within
   *  each iteration (the iteratively reweighted fixed point, "predicted",
   *  the default) or the weighted SS minimised directly with the weights
   *  moving with the parameters ("objective", as R's nls with weights). */
  weightSource?: "predicted" | "objective";
}

export const DEFAULT_XY_OPTIONS: OptionsState = {
  model: "log_inhibitor_vs_response_4pl",
  xIsLog: false,
  errorBars: "sd",
  top: { enabled: false, value: "100" },
  bottom: { enabled: false, value: "0" },
  hillSlope: { enabled: false, value: "-1" },
  normalize: {
    enabled: false,
    zeroMode: "smallest", zeroValue: "0",
    hundredMode: "largest", hundredValue: "100",
    asPercent: true,
    subcolumns: "mean",
  },
  weighting: "none",
  ciMethod: "asymptotic",
  routEnabled: false,
  routQ: "1",
  bands: "none",
  diagnostics: false,
  interpolateY: "",
  sharedParams: [],
  modelConstants: {},
  antagonist: "",
  schildSlopeUnity: true,
};

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
  // Present when the fitted midpoint falls outside the x actually tested,
  // i.e. the curve never reaches half-maximal within the doses used.
  extrapolation?: {
    param: string;
    value: number;
    x_min: number;
    x_max: number;
    direction: "above" | "below";
    distance: number;
  } | null;
  weighting?: WeightingKind;
  ci_method?: CIMethod;
  param_order?: string[];
  params: Record<string, ParamEntry>;
  goodness: {
    df: number;
    n_points: number;
    r_squared: number | null;
    /** Lines through the origin: R² about Y = 0 (NIST, R's lm without
     *  an intercept). */
    r_squared_uncentered?: number | null;
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
  /** User-defined equation fits: the engine's reading of the equation. */
  user_equation?: Record<string, unknown>;
}

// --- column-table statistics ---

export type ColumnAnalysisKind =
  | "column_statistics"
  | "ttest"
  | "anova"
  | "median_test"
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
  median_test: "Median test (Mood's, two or more groups)",
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
  | "column_means" | "row_means" | "all_cells";

export const TWO_WAY_DIRECTION_LABELS: Record<TwoWayDirection, string> = {
  columns_within_rows: "Within each row, compare datasets",
  rows_within_columns: "Within each dataset, compare rows",
  column_means: "Compare dataset main-effect means",
  row_means: "Compare row main-effect means",
  all_cells: "Compare every cell mean with every other cell mean",
};

/** Two-way ANOVA model: with the interaction term (full) or main effects
 *  only (additive, R's aov(y ~ A + B)). */
export type TwoWayModel = "full" | "additive";

export const TWO_WAY_MODEL_LABELS: Record<TwoWayModel, string> = {
  full: "Full model: row factor, column factor and their interaction",
  additive: "Main effects only (additive, no interaction term)",
};

/** Shown when the main-effects-only two-way model is chosen. */
export const TWO_WAY_ADDITIVE_NOTE = "The additive model leaves out the interaction: it "
  + "assumes the effect of one factor is the same at every level of the other. "
  + "The interaction's sum of squares and df join the residual, so use it only "
  + "when an interaction is implausible, or with one value per cell (where the "
  + "full model has no residual). Comparing every cell mean needs the full model.";

export type ColumnGraphType = "scatter" | "bar" | "box" | "violin";

export const COLUMN_GRAPH_LABELS: Record<ColumnGraphType, string> = {
  scatter: "Scatter (points + mean ± SD)",
  bar: "Bar (mean ± SD + points)",
  box: "Box & whiskers",
  violin: "Violin",
};

export type TTestKind =
  | "unpaired" | "welch" | "paired" | "ratio_paired"
  | "mann_whitney" | "kolmogorov_smirnov" | "wilcoxon";

export const TTEST_LABELS: Record<TTestKind, string> = {
  unpaired: "Unpaired t test",
  welch: "Unpaired t with Welch's correction",
  paired: "Paired t test",
  ratio_paired: "Ratio paired t test (paired ratios, lognormal)",
  mann_whitney: "Mann-Whitney (unpaired, nonparametric)",
  kolmogorov_smirnov: "Kolmogorov-Smirnov (unpaired, compares distributions)",
  wilcoxon: "Wilcoxon matched pairs (nonparametric)",
};

export type ComparisonsMethod =
  | "none" | "tukey" | "dunnett" | "bonferroni" | "sidak" | "holm_sidak"
  | "newman_keuls" | "fisher_lsd" | "holm";

export const COMPARISONS_LABELS: Record<ComparisonsMethod, string> = {
  none: "No multiple comparisons",
  tukey: "Tukey (compare every pair)",
  dunnett: "Dunnett (compare to control)",
  bonferroni: "Bonferroni (every pair)",
  sidak: "Šídák (every pair)",
  holm_sidak: "Holm-Šídák (every pair)",
  holm: "Holm (Bonferroni step-down, every pair)",
  newman_keuls: "Newman-Keuls (every pair)",
  fisher_lsd: "Fisher's LSD (every pair, no correction)",
};

/** Comparisons after Welch / Brown-Forsythe ANOVA (SDs not assumed equal). */
export type UnequalComparisons =
  | "none" | "games_howell" | "dunnett_t3" | "tamhane_t2" | "welch_uncorrected";

export const UNEQUAL_COMPARISONS_LABELS: Record<UnequalComparisons, string> = {
  none: "No multiple comparisons",
  games_howell: "Games-Howell (every pair)",
  dunnett_t3: "Dunnett T3",
  tamhane_t2: "Tamhane T2",
  welch_uncorrected: "Unpaired t with Welch's correction, no correction for multiple comparisons",
};

export const NORMALITY_TEST_LABELS: Record<string, string> = {
  shapiro_wilk: "Shapiro-Wilk",
  dagostino_pearson: "D'Agostino-Pearson omnibus",
  anderson_darling: "Anderson-Darling",
  kolmogorov_smirnov: "Kolmogorov-Smirnov (Lilliefors P)",
};
export const DEFAULT_NORMALITY_TESTS = ["shapiro_wilk", "dagostino_pearson", "anderson_darling"];

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
  corrMethod: "pearson" | "spearman" | "kendall";
  rmKind: "parametric" | "nonparametric";
  outlierMethod: "grubbs" | "rout";
  routQ: string;
  twoWayComparisons: TwoWayComparisons;
  twoWayDirection: TwoWayDirection;
  rmTwoDesign: "mixed" | "both";
  /** One-way ANOVA: assume equal SDs (ordinary) or not (Welch and
   *  Brown-Forsythe, engine anova_unequal_var). */
  anovaSd?: "equal" | "unequal";
  unequalComparisons?: UnequalComparisons;
  /** Unequal-SD comparisons: every pair, or each group vs. the control. */
  unequalFamily?: "all" | "control";
  /** Kruskal-Wallis: Dunn's multiplicity correction (false = uncorrected). */
  dunnCorrected?: boolean;
  /** Wilcoxon tests: values equal to the hypothetical / zero differences
   *  dropped (Wilcoxon) or ranked and ignored (Pratt). */
  zeroMethod?: "wilcox" | "pratt";
  /** Column statistics extras. */
  normalityTests?: string[];
  percentileMethod?: "linear" | "prism";
  descriptiveExtras?: boolean;
  trimK?: string;
  ratioT?: boolean;
  /** Friedman: exact P (small designs). */
  rmExact?: boolean;
  /** Correlation: also report a one-sided P (and bound) in the stated
   *  direction (R's cor.test alternative = "greater" / "less"). */
  corrTails?: "two" | "greater" | "less";
  /** Two-way ANOVA (rows × datasets): full or main-effects-only model. */
  twoWayModel?: TwoWayModel;
}

export const DEFAULT_COLUMN_OPTIONS: ColumnOptionsState = {
  analysis: "column_statistics",
  hypothetical: "",
  ttestKind: "unpaired",
  datasetA: 0,
  datasetB: 1,
  anovaKind: "parametric",
  comparisons: "tukey",
  controlIndex: 0,
  grubbsAlpha: "0.05",
  corrMethod: "pearson",
  rmKind: "parametric",
  outlierMethod: "grubbs",
  routQ: "1",
  twoWayComparisons: "none",
  twoWayDirection: "columns_within_rows",
  rmTwoDesign: "mixed",
  anovaSd: "equal",
  unequalComparisons: "games_howell",
  unequalFamily: "all",
  dunnCorrected: true,
  zeroMethod: "wilcox",
  normalityTests: [...DEFAULT_NORMALITY_TESTS],
  percentileMethod: "linear",
  descriptiveExtras: false,
  trimK: "",
  ratioT: false,
  rmExact: false,
  corrTails: "two",
  twoWayModel: "full",
};

export function parseCell(v: Cell): number | null {
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// Significant digits used by results tables; set from Preferences.
let displayDigits = 4;
export function setDisplayDigits(n: number) {
  if (Number.isFinite(n)) displayDigits = Math.min(10, Math.max(2, Math.round(n)));
}

/** The results precision (significant digits) set from Preferences. */
export function getDisplayDigits(): number {
  return displayDigits;
}

export function formatSig(
  v: number | null | undefined, sig = displayDigits,
): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "n/a";
  if (v === 0) return "0";
  const abs = Math.abs(v);
  // Large numbers stay in plain notation while every digit is shown
  // (more than 5 significant digits lift the 1e5 limit to 10^digits).
  if (abs >= Math.max(1e5, 10 ** sig) || abs < 1e-3) return v.toExponential(sig - 1);
  return Number(v.toPrecision(sig)).toString();
}
