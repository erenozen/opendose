// Pure parts of the results-sheet links (ResultsLinks.tsx): which sheets
// offer "Plan next experiment", and the options a "Compare fits" sheet
// opened from a curve fit starts with. Unit-tested in
// __tests__/resultsLinks.test.ts.

/** t tests and one-way ANOVA (column analyses) offer "Plan next
 *  experiment"; the pilot SD is filled in when the result has one. */
export function offersPlanning(analysisId: string, options: unknown): boolean {
  if (analysisId !== "column") return false;
  const a = (options && typeof options === "object" ? options : {}) as Record<string, unknown>;
  return a.analysis === "ttest" || a.analysis === "anova";
}

/** Options of a Compare fits sheet opened from a fit of `model`:
 *  "models" compares the fitted model with its 3-parameter variant (Hill
 *  slope fixed) when the library has one, and otherwise with the default
 *  simpler model; "global" fits one curve for all data sets against a
 *  separate curve for each, with the fitted model. */
export function compareFitsOptions(model: string, xIsLog: boolean, mode: "models" | "global" | "parameter",
  usable: (id: string) => boolean): Record<string, unknown> {
  const own = usable(model) ? model : null;
  if (mode === "global") return { mode, xIsLog, ...(own ? { model1: own } : {}) };
  // "parameter": the fitted model's midpoint (logEC50 / logIC50) between
  // the first two data sets (sheets/xy/compareParameter.ts).
  if (mode === "parameter") return { mode, xIsLog, datasetA: 0, datasetB: 1, ...(own ? { model1: own } : {}) };
  const simpler = own && own.endsWith("_4pl") ? own.replace(/_4pl$/, "_3pl") : null;
  if (own && simpler && usable(simpler)) return { mode, xIsLog, model1: simpler, model2: own };
  // A 3-parameter fit: against its variable-slope (4PL) version.
  const fuller = own && own.endsWith("_3pl") ? own.replace(/_3pl$/, "_4pl") : null;
  if (own && fuller && usable(fuller)) return { mode, xIsLog, model1: own, model2: fuller };
  return { mode, xIsLog, ...(own ? { model2: own } : {}) };
}
