// Small pieces of regression arithmetic shared by linear regression and
// the comparison of fits: the F distribution's upper tail, the regression
// ANOVA table, the extra-sum-of-squares F test and Akaike's criterion
// corrected for small samples (AICc), written exactly as the engine's
// nlfit.compare_fits_f_test / aicc / compare_fits_aicc compute them.
// Pure: unit-tested with node --test.
import { incompleteBeta } from "../grouped/stats.ts";

/** P(F' >= F) for F' ~ F(dfn, dfd): I_{dfd/(dfd + dfn F)}(dfd/2, dfn/2). */
export function fSurvival(F: number, dfn: number, dfd: number): number {
  if (!(dfn > 0) || !(dfd > 0) || Number.isNaN(F)) return NaN;
  if (F === Infinity) return 0;
  if (F <= 0) return 1;
  return incompleteBeta(dfd / (dfd + dfn * F), dfd / 2, dfn / 2);
}

export interface AnovaRow {
  source: "Regression" | "Residual" | "Total";
  ss: number;
  df: number;
  /** Mean square (none for the total). */
  ms: number | null;
}

export interface AnovaTable {
  rows: AnovaRow[];
  F: number;
  dfn: number;
  dfd: number;
  p: number;
  /** Sums of squares about Y = 0 (a line forced through the origin). */
  uncentred: boolean;
}

/** Regression ANOVA of a straight line with an intercept, from the F test
 *  of slope = 0 the engine reports: SS regression = F * SS residual / df
 *  (exactly, since F = MS regression / MS residual with 1 df), total =
 *  regression + residual on n - 1 df. */
export function anovaCentred(F: number, p: number, ssRes: number, dfd: number): AnovaTable {
  const ssReg = F * ssRes / dfd;
  return {
    rows: [
      { source: "Regression", ss: ssReg, df: 1, ms: ssReg },
      { source: "Residual", ss: ssRes, df: dfd, ms: ssRes / dfd },
      { source: "Total", ss: ssReg + ssRes, df: dfd + 1, ms: null },
    ],
    F, dfn: 1, dfd, p, uncentred: false,
  };
}

/** Regression ANOVA of a line forced through the origin (n points, one
 *  parameter): sums of squares about zero, so total = sum of Y squared on
 *  n df, regression = total - residual on 1 df, residual on n - 1 df. The
 *  uncentred R squared is 1 - SS residual / sum of Y squared. */
export function anovaThroughOrigin(sumY2: number, ssRes: number, n: number):
  AnovaTable & { r2: number | null } {
  const dfd = n - 1;
  const ssReg = sumY2 - ssRes;
  const msRes = ssRes / dfd;
  const F = msRes > 0 ? ssReg / msRes : (ssReg > 0 ? Infinity : NaN);
  return {
    rows: [
      { source: "Regression", ss: ssReg, df: 1, ms: ssReg },
      { source: "Residual", ss: ssRes, df: dfd, ms: msRes },
      { source: "Total", ss: sumY2, df: n, ms: null },
    ],
    F, dfn: 1, dfd, p: fSurvival(F, 1, dfd), uncentred: true,
    r2: sumY2 > 0 ? 1 - ssRes / sumY2 : null,
  };
}

/** AICc as the engine computes it: K = fitted parameters + 1 (the
 *  variance); infinite when n - K - 1 <= 0, minus infinity for an exact
 *  fit. */
export function aicc(ss: number, n: number, params: number): number {
  const k = params + 1;
  if (n - k - 1 <= 0) return Infinity;
  if (ss <= 0) return -Infinity;
  return n * Math.log(ss / n) + 2 * k + 2 * k * (k + 1) / (n - k - 1);
}

export interface AiccComparison {
  aicc1: number;
  aicc2: number;
  /** AICc(2) - AICc(1): positive when model 1 is more likely. */
  delta: number;
  probability1: number;
  probability2: number;
  prefer: 1 | 2;
}

export function compareAicc(ss1: number, k1: number, ss2: number, k2: number, n: number):
  AiccComparison {
  const a1 = aicc(ss1, n, k1), a2 = aicc(ss2, n, k2);
  const delta = a2 - a1;
  let p1: number;
  if (Number.isNaN(delta)) p1 = 0.5;
  else if (delta >= 0) p1 = 1 / (1 + Math.exp(-0.5 * delta));
  else { const e = Math.exp(0.5 * delta); p1 = e / (1 + e); }
  return { aicc1: a1, aicc2: a2, delta, probability1: p1, probability2: 1 - p1,
    prefer: a1 < a2 ? 1 : 2 };
}

export interface FTest { F: number; dfn: number; dfd: number; p: number }

/** Extra-sum-of-squares F test of nested fits: the simpler fit has more
 *  degrees of freedom. Null when the fits are not nested by df. */
export function extraSumOfSquaresF(ssSimple: number, dfSimple: number, ssComplex: number,
  dfComplex: number): FTest | null {
  if (!(dfSimple > dfComplex) || !(dfComplex > 0)) return null;
  const dfn = dfSimple - dfComplex;
  if (ssComplex <= 0) {
    return ssSimple > 0 ? { F: Infinity, dfn, dfd: dfComplex, p: 0 }
      : { F: NaN, dfn, dfd: dfComplex, p: 1 };
  }
  const F = Math.max(0, ((ssSimple - ssComplex) / dfn) / (ssComplex / dfComplex));
  return { F, dfn, dfd: dfComplex, p: fSurvival(F, dfn, dfComplex) };
}
