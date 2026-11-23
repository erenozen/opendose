"""Intraclass correlation coefficients for reliability (agreement between
raters or instruments).

Shrout PE, Fleiss JL (1979), "Intraclass correlations: uses in assessing
rater reliability", Psychol Bull 86:420-428, the six forms, and McGraw KO,
Wong SP (1996), "Forming inferences about some intraclass correlation
coefficients", Psychol Methods 1:30-46, their F-based confidence
intervals (McGraw & Wong's Table 7; the CI of ICC(A,1) uses the
Satterthwaite-type df v of their Table 7, case 2A/3A).

Layout: n targets (rows) rated by the same k raters (columns), one
rating per cell. From the two-way ANOVA without interaction: BMS = mean
square between targets, JMS = between raters (judges), EMS = residual;
the one-way within-target mean square is WMS = (SS_raters +
SS_residual) / (n (k - 1)). With one rating per cell and complete rows
the design is balanced, so the sums of squares are the textbook ones
(SS_targets = k sum (row mean - grand mean)^2, SS_raters = n sum (column
mean - grand mean)^2, SS_residual = the rest); they equal
twoway.two_way_anova(additive=True) (tests/test_icc.py checks it), which
is not called because it refuses data without residual scatter, and
perfect agreement (EMS = 0) is a result the ICC must report.

  ICC(1,1) = (BMS - WMS) / (BMS + (k - 1) WMS)        one-way random
  ICC(2,1) = (BMS - EMS) / (BMS + (k - 1) EMS + k (JMS - EMS) / n)
                                   two-way random, absolute agreement
  ICC(3,1) = (BMS - EMS) / (BMS + (k - 1) EMS)        two-way mixed,
                                                        consistency
  ICC(1,k) = (BMS - WMS) / BMS
  ICC(2,k) = (BMS - EMS) / (BMS + (JMS - EMS) / n)
  ICC(3,k) = (BMS - EMS) / BMS

The forms ending in 1 are the reliability of one rater's rating; those
ending in k of the mean of the k raters. McGraw & Wong's names: ICC(2,1)
= ICC(A,1), ICC(3,1) = ICC(C,1) (and likewise for k). The F test of
each form tests ICC = 0: BMS / WMS on (n - 1, n (k - 1)) df for the
one-way forms, BMS / EMS on (n - 1, (n - 1)(k - 1)) for the others.
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats

FORMS = ("ICC1", "ICC2", "ICC3", "ICC1k", "ICC2k", "ICC3k")


def icc(matrix, *, ci_level: float = 0.95) -> dict:
    """matrix[i][j]: rating of target i by rater j (None = missing).
    Targets missing a rating are left out (listed in incomplete_rows,
    0-based)."""
    rows = [list(r) for r in matrix]
    k = max((len(r) for r in rows), default=0)
    complete, incomplete = [], []
    for i, r in enumerate(rows):
        vals = [None if v is None else float(v) for v in r] + [None] * (k - len(r))
        if all(v is not None and math.isfinite(v) for v in vals):
            complete.append(vals)
        elif any(v is not None for v in vals):
            incomplete.append(i)
    n = len(complete)
    if n < 2:
        raise ValueError("the ICC needs at least 2 targets (rows) rated by "
                         "every rater")
    if k < 2:
        raise ValueError("the ICC needs at least 2 raters (columns)")
    y = np.array(complete, dtype=float)
    grand = float(y.mean())
    ss_t = float(np.sum((y - grand) ** 2))
    ss_rows = float(k * np.sum((y.mean(axis=1) - grand) ** 2))
    ss_cols = float(n * np.sum((y.mean(axis=0) - grand) ** 2))
    ss_err = ss_t - ss_rows - ss_cols
    if ss_err <= 1e-12 * ss_t:      # rounding: the ratings are exactly additive
        ss_err = 0.0
    bms = ss_rows / (n - 1)
    jms = ss_cols / (k - 1)
    ems = ss_err / ((n - 1) * (k - 1))
    wms = (ss_cols + ss_err) / (n * (k - 1))
    if ss_rows <= 1e-12 * ss_t:
        bms = 0.0
    if bms == 0 and wms == 0:
        raise ValueError("every rating is the same, so the ICC is not "
                         "defined")
    if bms == 0:
        raise ValueError("every target has the same mean rating, so the "
                         "ICC is not defined (no variation between targets)")
    df1 = n - 1
    df_w = n * (k - 1)
    df_e = (n - 1) * (k - 1)
    a = 1 - ci_level
    fq = stats.f.ppf

    icc1 = (bms - wms) / (bms + (k - 1) * wms)
    icc1k = (bms - wms) / bms
    f1 = bms / wms if wms > 0 else math.inf
    p1 = float(stats.f.sf(f1, df1, df_w)) if wms > 0 else 0.0

    perfect = ems == 0
    if perfect:
        icc3 = icc3k = 1.0
        # the formulas above with EMS = 0
        icc2 = bms / (bms + k * jms / n)
        icc2k = bms / (bms + jms / n)
        f3, p3 = math.inf, 0.0
    else:
        icc3 = (bms - ems) / (bms + (k - 1) * ems)
        icc3k = (bms - ems) / bms
        icc2 = (bms - ems) / (bms + (k - 1) * ems + k * (jms - ems) / n)
        icc2k = (bms - ems) / (bms + (jms - ems) / n)
        f3 = bms / ems
        p3 = float(stats.f.sf(f3, df1, df_e))

    def ci_f(fobs, d1, d2, single):
        if not math.isfinite(fobs):
            return None
        fl = fobs / fq(1 - a / 2, d1, d2)
        fu = fobs * fq(1 - a / 2, d2, d1)
        if single:
            return [(fl - 1) / (fl + k - 1), (fu - 1) / (fu + k - 1)]
        return [1 - 1 / fl, 1 - 1 / fu]

    ci = {"ICC1": ci_f(f1, df1, df_w, True),
          "ICC1k": ci_f(f1, df1, df_w, False),
          "ICC3": ci_f(f3, df1, df_e, True),
          "ICC3k": ci_f(f3, df1, df_e, False)}
    if perfect:
        ci["ICC2"] = ci["ICC2k"] = None
    else:
        fj = jms / ems
        vn = df_e * (k * icc2 * fj + n * (1 + (k - 1) * icc2) - k * icc2) ** 2
        vd = (df1 * k ** 2 * icc2 ** 2 * fj ** 2
              + (n * (1 + (k - 1) * icc2) - k * icc2) ** 2)
        v = vn / vd
        f2u = fq(1 - a / 2, df1, v)
        f2l = fq(1 - a / 2, v, df1)
        lo = n * (bms - f2u * ems) / (f2u * (k * jms + (k * n - k - n) * ems)
                                      + n * bms)
        hi = n * (f2l * bms - ems) / (k * jms + (k * n - k - n) * ems
                                      + n * f2l * bms)
        ci["ICC2"] = [lo, hi]
        ci["ICC2k"] = [lo * k / (1 + lo * (k - 1)), hi * k / (1 + hi * (k - 1))]
        ci["df_satterthwaite"] = v

    def form(key, value, model, typ, unit, fval, d2, p):
        return {"form": key, "value": float(value),
                "ci": [float(c) for c in ci[key]] if ci[key] else None,
                "model": model, "type": typ, "unit": unit,
                "F": float(fval), "df1": df1, "df2": d2, "p": p}

    forms = [
        form("ICC1", icc1, "one_way_random", "absolute", "single", f1, df_w, p1),
        form("ICC2", icc2, "two_way_random", "absolute", "single", f3, df_e, p3),
        form("ICC3", icc3, "two_way_mixed", "consistency", "single", f3, df_e, p3),
        form("ICC1k", icc1k, "one_way_random", "absolute", "average", f1, df_w, p1),
        form("ICC2k", icc2k, "two_way_random", "absolute", "average", f3, df_e, p3),
        form("ICC3k", icc3k, "two_way_mixed", "consistency", "average", f3, df_e, p3),
    ]
    return {"analysis": "icc", "n_targets": n, "k_raters": k,
            "ci_level": ci_level,
            "mean_squares": {"between_targets": bms, "between_raters": jms,
                             "residual": ems, "within_targets": wms},
            "df": {"targets": df1, "raters": k - 1, "residual": df_e,
                   "within": df_w},
            "raters_F": (float(jms / ems) if not perfect else None),
            "raters_p": (float(stats.f.sf(jms / ems, k - 1, df_e))
                         if not perfect else None),
            "forms": forms, "default": "ICC2",
            "incomplete_rows": incomplete,
            "satterthwaite_df": ci.get("df_satterthwaite")}
