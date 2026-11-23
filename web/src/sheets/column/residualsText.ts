// Wording of the engine's residual warnings for the Residuals section.
/** The engine counts rows from 0 ("row 2, counting from 0"); the grid
 *  numbers them from 1 ("row 3"). */
export function rowsFromOne(w: string): string {
  return w.replace(/\b(rows?) ([\d, ]+), counting from 0/g, (_, word: string, list: string) =>
    `${word} ${list.split(",").map((x) => Number(x.trim()) + 1).join(", ")}`);
}

export interface ResidualCaptions {
  toggle: string;
  teaser: (n: number) => string;
  residualAxis: string;
  fittedAxis: string;
  fittedLabel: string;
  againstX: string;
  againstFitted: string;
  qq: string;
  shapiroRole: string;
}

/** The words of the Residuals section for the kind of model the
 *  residuals come from (residualsPanel.tsx): the one-group-mean model of
 *  t tests and one-way ANOVA (no kind), a curve fit or line ("fit") or
 *  another ANOVA model ("model", which names its fitted value). None of
 *  them suggests choosing a test from a normality P (FEATURE-PLAN, do not
 *  build 5). */
export function residualCaptions(data: Record<string, unknown>): ResidualCaptions {
  const residualAxis = typeof data.residual_label === "string" ? data.residual_label : "Residual";
  const shapiroRole = "a supporting summary, not a gate between tests";
  if (data.kind === "fit") {
    const weighted = data.weighted === true;
    return {
      toggle: "Residuals: vs. X, vs. fitted and QQ plot",
      teaser: (n) => `Residuals against X and against the fitted Y, and a QQ plot (${n} values): look for a pattern before trusting the fit.`,
      residualAxis,
      fittedAxis: "Fitted Y (the curve)",
      fittedLabel: `${residualAxis}s against the fitted Y, with a zero line`,
      againstX: "Points should scatter evenly around zero along X; a curve, or long runs above or below zero, means the model misses the shape of the data.",
      againstFitted: weighted
        ? "With the weighting chosen the band should be even; a funnel left means the weighting does not match how the scatter grows with Y."
        : "A band of even width is what the fit assumes; a funnel (scatter growing with Y) suggests weighting the fit.",
      qq: "Points close to the dashed line mean the scatter around the curve is roughly Gaussian, as the confidence intervals assume; a few points far off the ends are possible outliers.",
      shapiroRole: "a supporting summary of the QQ plot",
    };
  }
  if (data.kind === "model") {
    const fittedAxis = typeof data.fitted_label === "string" ? data.fitted_label : "Fitted value";
    return {
      toggle: "Residuals: QQ plot and residuals vs. fitted",
      teaser: (n) => `Check the Gaussian assumption on the residuals (${n} values) by eye before trusting a normality test.`,
      residualAxis,
      fittedAxis,
      fittedLabel: `Residuals against the fitted values (${fittedAxis.replace(/^Fitted value \((.*)\)$/, "$1")}), with a zero line`,
      againstX: "",
      againstFitted: "Spread should be about the same at every fitted value; spreads that grow with the fitted value mean the SD grows with the mean, which analysing log values often evens out.",
      qq: "Points close to the dashed line support the Gaussian assumption; a curved band means skew (try log values for concentrations and ratios), and a few points far off the ends are outliers or heavy tails.",
      shapiroRole,
    };
  }
  return {
    toggle: "Residuals: QQ plot and residuals vs. fitted",
    teaser: (n) => `Check the Gaussian assumption on the residuals (${n} values) by eye before trusting a normality test.`,
    residualAxis,
    fittedAxis: data.paired ? "Pair (row)" : "Fitted value (group mean)",
    fittedLabel: data.paired ? "Residuals of the paired differences by pair, with a zero line"
      : "Residuals against fitted values (group means), with a zero line",
    againstX: "",
    againstFitted: "Each column of points is one group; spreads that grow with the group mean mean unequal SDs: use Welch's test, or analyse log values, before switching to ranks.",
    qq: "Points close to the dashed line support the Gaussian assumption; a curved band means skew (try log values for concentrations and ratios), and a few points far off the ends are outliers or heavy tails.",
    shapiroRole,
  };
}
