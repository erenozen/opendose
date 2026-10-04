"""Method-comparison & diagnostic-accuracy analyses: ROC and Bland-Altman.

Prism statistics guide:
- "ROC curves": enter values for patients (with the condition) and
  controls (without). Prism computes sensitivity/specificity at each
  cutoff, the area under the curve with SE and 95% CI, and P vs
  AUC = 0.5. AUC SE here uses DeLong et al. (1988), the modern standard
  (Prism uses Hanley-McNeil by default with DeLong optional).
- "Bland-Altman": difference vs average of two methods; reports bias
  (mean difference), SD of differences, and the 95% limits of agreement
  (bias ± 1.96 SD) with their CIs.

Extras (below): comparison of two ROC curves by DeLong's test, optimal
cut-offs with likelihood ratios, partial AUC and binormal smoothing; for
Bland-Altman, exact / approximate / MOVER CIs of the limits, proportional
bias, ratio and percentage differences and repeated measures per subject.
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats


def roc_curve(patients, controls, *, ci_level: float = 0.95,
              higher_is_abnormal: bool = True) -> dict:
    pos = np.array([float(v) for v in patients if v is not None])
    neg = np.array([float(v) for v in controls if v is not None])
    if pos.size == 0 or neg.size == 0:
        raise ValueError("both patient and control groups need values")
    if not higher_is_abnormal:
        pos, neg = -pos, -neg

    thresholds = np.unique(np.concatenate([pos, neg]))
    cutpoints = np.concatenate([
        [thresholds[0] - 1.0],
        (thresholds[:-1] + thresholds[1:]) / 2,
        [thresholds[-1] + 1.0],
    ])
    points = []
    for c in cutpoints[::-1]:  # from most to least strict
        sens = float(np.mean(pos > c))
        spec = float(np.mean(neg <= c))
        points.append({"cutoff": float(c) if higher_is_abnormal else float(-c),
                       "sensitivity": sens, "specificity": spec})

    # AUC via the Mann-Whitney relation; SE and CI by DeLong.
    n1, n2 = pos.size, neg.size
    v10 = np.array([(np.mean(neg < p) + 0.5 * np.mean(neg == p)) for p in pos])
    v01 = np.array([(np.mean(pos > q) + 0.5 * np.mean(pos == q)) for q in neg])
    auc = float(v10.mean())
    var = (np.var(v10, ddof=1) / n1 if n1 > 1 else 0.0) + \
          (np.var(v01, ddof=1) / n2 if n2 > 1 else 0.0)
    se = math.sqrt(max(var, 0.0))
    zcrit = stats.norm.ppf((1 + ci_level) / 2)
    z = (auc - 0.5) / se if se > 0 else math.inf
    return {
        "analysis": "roc",
        "n_patients": int(n1), "n_controls": int(n2),
        "auc": {"value": auc, "se": se,
                "ci": [max(auc - zcrit * se, 0.0), min(auc + zcrit * se, 1.0)],
                "p_vs_05": 2 * float(stats.norm.sf(abs(z)))},
        "points": points,
    }


def bland_altman(values_a, values_b, *, ci_level: float = 0.95) -> dict:
    pairs = [(float(a), float(b)) for a, b in zip(values_a, values_b)
             if a is not None and b is not None]
    if len(pairs) < 2:
        raise ValueError("Bland-Altman needs at least 2 complete pairs")
    a = np.array([p[0] for p in pairs])
    b = np.array([p[1] for p in pairs])
    diff = a - b
    avg = (a + b) / 2
    n = diff.size
    bias = float(diff.mean())
    sd = float(diff.std(ddof=1))
    zcrit = stats.norm.ppf((1 + ci_level) / 2)
    loa_lo, loa_hi = bias - zcrit * sd, bias + zcrit * sd
    # CIs of bias and of the limits (Bland & Altman 1986)
    tcrit = float(stats.t.ppf((1 + ci_level) / 2, n - 1))
    se_bias = sd / math.sqrt(n)
    se_loa = sd * math.sqrt(3.0 / n)
    return {
        "analysis": "bland_altman",
        "n": int(n),
        "bias": {"value": bias,
                 "ci": [bias - tcrit * se_bias, bias + tcrit * se_bias]},
        "sd_of_differences": sd,
        "loa_lower": {"value": float(loa_lo),
                      "ci": [loa_lo - tcrit * se_loa, loa_lo + tcrit * se_loa]},
        "loa_upper": {"value": float(loa_hi),
                      "ci": [loa_hi - tcrit * se_loa, loa_hi + tcrit * se_loa]},
        "points": [{"average": float(x), "difference": float(d)}
                   for x, d in zip(avg, diff)],
    }


def rout_column(values, *, q: float = 0.01) -> dict:
    """ROUT for column data (Prism: 'Identify outliers' -> ROUT): robust
    location/scale from the median and the P68 of absolute deviations
    (the RSDR analogue with k=1 parameter), then the same FDR test as
    curve-fit ROUT (Motulsky & Brown 2006)."""
    arr = np.array([float(v) for v in values if v is not None])
    n = arr.size
    if n < 3:
        raise ValueError("ROUT needs at least 3 values")
    center = float(np.median(arr))
    resid = arr - center
    p68 = float(np.percentile(np.abs(resid), 68.27))
    rsdr = max(p68 * n / (n - 1), 1e-12)
    t = np.abs(resid) / rsdr
    p = 2 * stats.t.sf(t, n - 1)
    order = np.argsort(p)
    is_out = np.zeros(n, dtype=bool)
    max_k = -1
    for rank, idx in enumerate(order, start=1):
        if p[idx] <= q * rank / n:
            max_k = rank
    if max_k > 0:
        is_out[order[:max_k]] = True
    return {
        "method": "rout", "q": q, "n": int(n),
        "median": center, "rsdr": rsdr,
        "outliers": [float(v) for v in arr[is_out]],
        "cleaned": [float(v) for v in arr[~is_out]],
    }


# ------------------------------------------------------------- ROC extras
# Comparison of ROC curves (DeLong, DeLong & Clarke-Pearson 1988;
# unpaired form with Welch-Satterthwaite df as in pROC, Robin et al. 2011),
# optimal cut-offs (Youden 1950 J; cost- and prevalence-weighted criterion
# se + r * sp with r = (1 - prevalence) / (cost_fn/fp * prevalence), and
# closest-to-(0, 1), as pROC's best.weights), likelihood ratios per
# cut-off, partial AUC over a specificity or sensitivity range with the
# McClish (1989) standardisation, and binormal smoothing (Metz 1978; the
# least-squares fit of probit(sp) on probit(se) used by pROC's
# smooth(method = "binormal")). The statistics guide's "ROC curves" pages
# describe the curve, AUC and likelihood ratios these build on.

def _roc_values(patients, controls, higher_is_abnormal=True):
    pos = np.array([float(v) for v in patients if v is not None])
    neg = np.array([float(v) for v in controls if v is not None])
    if pos.size == 0 or neg.size == 0:
        raise ValueError("both patient and control groups need values")
    if not higher_is_abnormal:
        pos, neg = -pos, -neg
    return pos, neg


def _placements(pos, neg):
    """DeLong placement values: V10 per case, V01 per control, AUC."""
    neg_s = np.sort(neg)
    pos_s = np.sort(pos)
    lt = np.searchsorted(neg_s, pos, side="left")
    le = np.searchsorted(neg_s, pos, side="right")
    v10 = (lt + 0.5 * (le - lt)) / neg.size
    gt = pos.size - np.searchsorted(pos_s, neg, side="right")
    ge = pos.size - np.searchsorted(pos_s, neg, side="left")
    v01 = (gt + 0.5 * (ge - gt)) / pos.size
    return v10, v01, float(v10.mean())


def _p_alternative(stat, alternative, dist):
    if alternative == "two_sided":
        return float(2 * dist.sf(abs(stat)))
    if alternative == "greater":
        return float(dist.sf(stat))
    if alternative == "less":
        return float(dist.cdf(stat))
    raise ValueError("alternative must be 'two_sided', 'greater' or 'less'")


def roc_compare(patients_a, controls_a, patients_b, controls_b, *,
                paired: bool = True, higher_is_abnormal=(True, True),
                ci_level: float = 0.95, alternative: str = "two_sided") -> dict:
    """Compare the AUCs of two ROC curves by DeLong's method.

    paired: the two markers were measured on the same subjects, so
    patients_a[i] and patients_b[i] (and the controls likewise) belong to
    the same person; subjects missing either value are dropped. Unpaired:
    independent samples; D = diff / sqrt(V1 + V2) on Welch-Satterthwaite
    df (pROC's unpaired DeLong test)."""
    hia = higher_is_abnormal
    if isinstance(hia, bool):
        hia = (hia, hia)
    if paired:
        if len(patients_a) != len(patients_b) or \
                len(controls_a) != len(controls_b):
            raise ValueError("paired ROC curves need the same subjects in "
                             "both markers (equal-length columns)")
        pp = [(a, b) for a, b in zip(patients_a, patients_b)
              if a is not None and b is not None]
        cc = [(a, b) for a, b in zip(controls_a, controls_b)
              if a is not None and b is not None]
        if len(pp) < 2 or len(cc) < 2:
            raise ValueError("need at least 2 complete patients and controls")
        pa, na = _roc_values([p[0] for p in pp], [c[0] for c in cc], hia[0])
        pb, nb = _roc_values([p[1] for p in pp], [c[1] for c in cc], hia[1])
        x1, y1, auc1 = _placements(pa, na)
        x2, y2, auc2 = _placements(pb, nb)
        m, n = pa.size, na.size
        sx = np.cov(np.vstack([x1, x2]), ddof=1)
        sy = np.cov(np.vstack([y1, y2]), ddof=1)
        S = sx / m + sy / n
        d = auc1 - auc2
        var = S[0, 0] + S[1, 1] - 2 * S[0, 1]
        sig = math.sqrt(max(var, 0.0))
        z = d / sig if sig > 0 else 0.0
        zc = float(stats.norm.ppf((1 + ci_level) / 2))
        return {"analysis": "roc_compare", "method": "delong_paired",
                "n_patients": int(m), "n_controls": int(n),
                "auc": [auc1, auc2],
                "se": [math.sqrt(S[0, 0]), math.sqrt(S[1, 1])],
                "correlation": float(S[0, 1] / math.sqrt(S[0, 0] * S[1, 1]))
                if S[0, 0] > 0 and S[1, 1] > 0 else None,
                "difference": d, "se_difference": sig,
                "ci": [d - zc * sig, d + zc * sig],
                "statistic": float(z), "statistic_name": "Z",
                "p": _p_alternative(z, alternative, stats.norm) if sig > 0
                else 1.0,
                "alternative": alternative}
    pa, na = _roc_values(patients_a, controls_a, hia[0])
    pb, nb = _roc_values(patients_b, controls_b, hia[1])
    out = []
    for pos, neg in ((pa, na), (pb, nb)):
        x, y, auc = _placements(pos, neg)
        m, n = pos.size, neg.size
        if m < 2 or n < 2:
            raise ValueError("each curve needs at least 2 patients and "
                             "2 controls")
        s = np.var(x, ddof=1) / m + np.var(y, ddof=1) / n
        out.append((auc, s, m + n))
    (auc1, s1, n1), (auc2, s2, n2) = out
    d = auc1 - auc2
    sig = math.sqrt(s1 + s2)
    D = d / sig
    df = (s1 + s2) ** 2 / (s1 ** 2 / (n1 - 1) + s2 ** 2 / (n2 - 1))
    tc = float(stats.t.ppf((1 + ci_level) / 2, df))
    return {"analysis": "roc_compare", "method": "delong_unpaired",
            "auc": [auc1, auc2], "se": [math.sqrt(s1), math.sqrt(s2)],
            "difference": d, "se_difference": sig,
            "ci": [d - tc * sig, d + tc * sig],
            "statistic": float(D), "statistic_name": "D", "df": float(df),
            "p": _p_alternative(D, alternative, stats.t(df)),
            "alternative": alternative}


def _threshold_table(pos, neg):
    """pROC-style thresholds (midpoints, +-inf) with se and sp."""
    vals = np.unique(np.concatenate([pos, neg]))
    thr = np.concatenate([[-np.inf], (vals[:-1] + vals[1:]) / 2, [np.inf]])
    ps, ns = np.sort(pos), np.sort(neg)
    tp = pos.size - np.searchsorted(ps, thr, side="right")
    tn = np.searchsorted(ns, thr, side="right")
    return thr, tp, tn


def _best_index(se, sp, method, r):
    if method == "youden":
        crit = se + r * sp
        best = np.flatnonzero(np.isclose(crit, crit.max(), rtol=0,
                                         atol=1e-12))
    elif method == "closest_topleft":
        crit = (1 - se) ** 2 + r * (1 - sp) ** 2
        best = np.flatnonzero(np.isclose(crit, crit.min(), rtol=0,
                                         atol=1e-12))
    else:
        raise ValueError("method must be 'youden' or 'closest_topleft'")
    return best, crit


def roc_cutoffs(patients, controls, *, higher_is_abnormal: bool = True,
                method: str = "youden", cost_ratio: float = 1.0,
                prevalence=None, bootstrap: int = 0, seed=None,
                ci_level: float = 0.95) -> dict:
    """Optimal cut-off and the full threshold table with likelihood
    ratios. cost_ratio = cost of a false negative / cost of a false
    positive; prevalence = proportion with the condition in the target
    population (default: the sample's). bootstrap > 0 adds stratified
    percentile CIs for the optimal threshold and its se / sp."""
    pos, neg = _roc_values(patients, controls, higher_is_abnormal)
    m, n = pos.size, neg.size
    prev_w = 0.5 if prevalence is None else float(prevalence)
    if not 0 < prev_w < 1 or cost_ratio <= 0:
        raise ValueError("prevalence must be in (0, 1) and cost_ratio > 0")
    r = (1 - prev_w) / (cost_ratio * prev_w)
    thr, tp, tn = _threshold_table(pos, neg)
    se, sp = tp / m, tn / n
    best, crit = _best_index(se, sp, method, r)
    sign = 1.0 if higher_is_abnormal else -1.0
    prev_ppv = m / (m + n) if prevalence is None else float(prevalence)
    rows = []
    for k in range(thr.size):
        lrp = se[k] / (1 - sp[k]) if sp[k] < 1 else math.inf
        lrn = (1 - se[k]) / sp[k] if sp[k] > 0 else math.inf
        ppv_den = se[k] * prev_ppv + (1 - sp[k]) * (1 - prev_ppv)
        npv_den = (1 - se[k]) * prev_ppv + sp[k] * (1 - prev_ppv)
        rows.append({"threshold": float(sign * thr[k]),
                     "sensitivity": float(se[k]), "specificity": float(sp[k]),
                     "tp": int(tp[k]), "fn": int(m - tp[k]),
                     "tn": int(tn[k]), "fp": int(n - tn[k]),
                     "youden": float(se[k] + sp[k] - 1),
                     "lr_positive": float(lrp), "lr_negative": float(lrn),
                     "ppv": float(se[k] * prev_ppv / ppv_den) if ppv_den else None,
                     "npv": float(sp[k] * (1 - prev_ppv) / npv_den)
                     if npv_den else None})
    if not higher_is_abnormal:
        rows = rows[::-1]
    k0 = int(best[0])
    best_row = dict(rows[k0] if higher_is_abnormal else rows[thr.size - 1 - k0])
    a = 1 - ci_level

    def cp(x, total):
        lo = stats.beta.ppf(a / 2, x, total - x + 1) if x > 0 else 0.0
        hi = stats.beta.ppf(1 - a / 2, x + 1, total - x) if x < total else 1.0
        return [float(lo), float(hi)]

    best_row["sensitivity_ci"] = cp(best_row["tp"], m)
    best_row["specificity_ci"] = cp(best_row["tn"], n)
    out = {"analysis": "roc_cutoff", "method": method,
           "cost_ratio": cost_ratio, "prevalence": prevalence,
           "weight_r": r, "n_patients": int(m), "n_controls": int(n),
           "optimal": best_row,
           "ties": [float(sign * thr[k]) for k in best],
           "thresholds": rows}
    if bootstrap and bootstrap > 0:
        rng = np.random.default_rng(seed)
        bt, bse, bsp, bj = [], [], [], []
        for _ in range(int(bootstrap)):
            p_b = pos[rng.integers(0, m, m)]
            n_b = neg[rng.integers(0, n, n)]
            t_b, tp_b, tn_b = _threshold_table(p_b, n_b)
            se_b, sp_b = tp_b / m, tn_b / n
            idx, _ = _best_index(se_b, sp_b, method, r)
            j = int(idx[0])
            bt.append(sign * t_b[j])
            bse.append(se_b[j])
            bsp.append(sp_b[j])
            bj.append(se_b[j] + sp_b[j] - 1)
        q = [100 * a / 2, 100 * (1 - a / 2)]
        finite = np.array([v for v in bt if np.isfinite(v)])
        out["bootstrap"] = {
            "replicates": int(bootstrap), "seed": seed,
            "threshold_ci": np.percentile(finite, q).tolist()
            if finite.size else None,
            "sensitivity_ci": np.percentile(bse, q).tolist(),
            "specificity_ci": np.percentile(bsp, q).tolist(),
            "youden_ci": np.percentile(bj, q).tolist()}
    return out


def _curve_points(pos, neg):
    thr, tp, tn = _threshold_table(pos, neg)
    return tp / pos.size, tn / neg.size  # se decreasing, sp increasing


def _integrate(xv, yv, lo, hi):
    """Integral of the polyline y(x) over [lo, hi] (x non-decreasing)."""
    area = 0.0
    for i in range(xv.size - 1):
        x0, x1 = xv[i], xv[i + 1]
        if x1 <= x0:
            continue
        a, b = max(lo, x0), min(hi, x1)
        if b <= a:
            continue
        y0, y1 = yv[i], yv[i + 1]
        ya = y0 + (y1 - y0) * (a - x0) / (x1 - x0)
        yb = y0 + (y1 - y0) * (b - x0) / (x1 - x0)
        area += (b - a) * (ya + yb) / 2
    return area


def roc_partial_auc(patients, controls, *, limits=(1.0, 0.9),
                    focus: str = "specificity", correct: bool = False,
                    higher_is_abnormal: bool = True) -> dict:
    """Partial AUC over a specificity (or sensitivity) range, pROC's
    definition; correct=True applies McClish's standardisation (0.5 for
    a chance curve, 1 for a perfect one; undefined below the diagonal)."""
    pos, neg = _roc_values(patients, controls, higher_is_abnormal)
    lo, hi = sorted(float(v) for v in limits)
    if not 0 <= lo < hi <= 1:
        raise ValueError("limits must lie in [0, 1] and differ")
    se, sp = _curve_points(pos, neg)
    if focus == "specificity":
        pauc = _integrate(sp, se, lo, hi)
    elif focus == "sensitivity":
        pauc = _integrate(se[::-1], sp[::-1], lo, hi)
    else:
        raise ValueError("focus must be 'specificity' or 'sensitivity'")
    width = hi - lo
    diag = width - (hi * hi - lo * lo) / 2
    out = {"analysis": "roc_partial_auc", "focus": focus,
           "limits": [hi, lo], "partial_auc": float(pauc),
           "max": width, "chance": diag}
    if correct:
        if pauc < diag:
            out["corrected"] = None
            out["warning"] = ("the McClish correction is not defined for a "
                              "curve below the diagonal")
        else:
            out["corrected"] = float((1 + (pauc - diag) / (width - diag)) / 2)
    return out


def roc_binormal(patients, controls, *, higher_is_abnormal: bool = True,
                 n_points: int = 512) -> dict:
    """Binormal smoothed ROC: least squares of probit(sp) on probit(se)
    over the empirical points with both in (0, 1) (pROC's smooth
    binormal), the smoothed curve, its AUC (analytic and trapezoid) and
    the Youden-best point on the smoothed grid."""
    pos, neg = _roc_values(patients, controls, higher_is_abnormal)
    se, sp = _curve_points(pos, neg)
    ok = (se > 0) & (se < 1) & (sp > 0) & (sp < 1)
    if ok.sum() < 2:
        raise ValueError("ROC curve not smoothable (not enough points)")
    zse, zsp = stats.norm.ppf(se[ok]), stats.norm.ppf(sp[ok])
    c1, c0 = np.polyfit(zse, zsp, 1)
    a, b = -c0 / c1, -1.0 / c1  # probit(TPR) = a + b * probit(FPR)
    grid = stats.norm.ppf(np.linspace(0, 1, int(n_points)))
    s_se = stats.norm.cdf(grid)
    s_sp = stats.norm.cdf(c0 + c1 * grid)
    sp_all = np.concatenate([[0.0], s_sp[::-1], [1.0]])
    se_all = np.concatenate([[1.0], s_se[::-1], [0.0]])
    order = np.argsort(sp_all, kind="mergesort")
    sp_o, se_o = sp_all[order], se_all[order]
    auc_trap = float(np.sum(np.diff(sp_o) * (se_o[1:] + se_o[:-1]) / 2))
    inner = slice(1, -1)
    j = int(np.argmax((s_se + s_sp)[inner])) + 1
    return {"analysis": "roc_binormal", "intercept": float(c0),
            "slope": float(c1), "a": float(a), "b": float(b),
            "auc": float(stats.norm.cdf(a / math.sqrt(1 + b * b))),
            "auc_trapezoid": auc_trap,
            "best": {"sensitivity": float(s_se[j]),
                     "specificity": float(s_sp[j])},
            "curve": {"sensitivity": s_se.tolist(),
                      "specificity": s_sp.tolist()}}


def binormal_sensitivity(fit: dict, specificity: float) -> float:
    return float(stats.norm.cdf((stats.norm.ppf(specificity) - fit["intercept"])
                                / fit["slope"]))


def binormal_specificity(fit: dict, sensitivity: float) -> float:
    return float(stats.norm.cdf(fit["intercept"]
                                + fit["slope"] * stats.norm.ppf(sensitivity)))


# ---------------------------------------------------- Bland-Altman extras
# Bland & Altman (1999), Stat Methods Med Res 8:135-160: approximate CI of
# the limits, SE = s * sqrt(1/n + z^2 / (2(n - 1))) with t(n - 1); the
# regression approach for differences that change with magnitude (D on A,
# then |residuals| on A, limits b0 + b1 A +/- z sqrt(pi/2) (c0 + c1 A));
# log-transformed differences (ratio limits); differences as a percentage
# of the average. Carkeet (2015), Optom Vis Sci 92:e71: exact CI of the
# limits from the noncentral t distribution. MOVER CIs: Zou (2011) and
# Donner & Zou (2012). Repeated measures: Bland & Altman (2007), J Biopharm
# Stat 17:571, for a true value that varies (paired replicates) or is
# constant (unpaired replicates), with Zou (2013) MOVER CIs, Stat Methods
# Med Res 22:630.

def _loa_cis(bias, sd, n, z, ci_level, mover_mean="t"):
    a = 1 - ci_level
    t = float(stats.t.ppf(1 - a / 2, n - 1))
    se = sd * math.sqrt(1.0 / n + z * z / (2.0 * (n - 1)))
    lo, hi = bias - z * sd, bias + z * sd
    approx = {"lower": [lo - t * se, lo + t * se],
              "upper": [hi - t * se, hi + t * se], "se": se}
    k = z * math.sqrt(n)
    q_lo = float(stats.nct.ppf(a / 2, n - 1, k))
    q_hi = float(stats.nct.ppf(1 - a / 2, n - 1, k))
    rn = math.sqrt(n)
    exact = {"upper": [bias + sd * q_lo / rn, bias + sd * q_hi / rn],
             "lower": [bias - sd * q_hi / rn, bias - sd * q_lo / rn]}
    tm = t if mover_mean == "t" else float(stats.norm.ppf(1 - a / 2))
    l_mu, u_mu = bias - tm * sd / rn, bias + tm * sd / rn
    l_sd = sd * math.sqrt((n - 1) / stats.chi2.ppf(1 - a / 2, n - 1))
    u_sd = sd * math.sqrt((n - 1) / stats.chi2.ppf(a / 2, n - 1))
    mover = _mover_loa(bias, sd, z, l_mu, u_mu, l_sd, u_sd)
    return approx, exact, mover


def _mover_loa(bias, sd, z, l_mu, u_mu, l_sd, u_sd):
    up = bias + z * sd
    lw = bias - z * sd
    return {
        "upper": [up - math.sqrt((bias - l_mu) ** 2 + z * z * (sd - l_sd) ** 2),
                  up + math.sqrt((u_mu - bias) ** 2 + z * z * (u_sd - sd) ** 2)],
        "lower": [lw - math.sqrt((bias - l_mu) ** 2 + z * z * (u_sd - sd) ** 2),
                  lw + math.sqrt((u_mu - bias) ** 2 + z * z * (sd - l_sd) ** 2)],
    }


def _ba_block(diff, avg, agreement, ci_level, z=None, mover_mean="t"):
    n = diff.size
    bias = float(diff.mean())
    sd = float(diff.std(ddof=1))
    z = float(stats.norm.ppf((1 + agreement) / 2)) if z is None else float(z)
    t = float(stats.t.ppf((1 + ci_level) / 2, n - 1))
    approx, exact, mover = _loa_cis(bias, sd, n, z, ci_level, mover_mean)
    return {"n": int(n), "bias": bias,
            "bias_ci": [bias - t * sd / math.sqrt(n), bias + t * sd / math.sqrt(n)],
            "sd": sd, "z": z,
            "loa_lower": bias - z * sd, "loa_upper": bias + z * sd,
            "loa_ci": {"approximate": approx, "exact": exact, "mover": mover},
            "points": [{"average": float(a), "difference": float(d)}
                       for a, d in zip(avg, diff)]}


def bland_altman_extras(values_a, values_b, *, agreement: float = 0.95,
                        ci_level: float = 0.95, variants=("difference",
                                                          "ratio", "percent"),
                        regression: bool = True, z=None,
                        mover_mean: str = "t") -> dict:
    """Bland-Altman with CIs of the limits (approximate, exact, MOVER),
    proportional-bias regression, ratio (log) and percentage variants and
    a normality check of the differences. z overrides the normal quantile
    for the limits (Bland & Altman round it to 1.96); mover_mean "t"
    (default) or "z" sets the quantile for the mean in the MOVER limits
    (SimplyAgree's agreement_limit uses z)."""
    if mover_mean not in ("t", "z"):
        raise ValueError("mover_mean must be 't' or 'z'")
    from .columnstats import normality_tests

    pairs = [(float(a), float(b)) for a, b in zip(values_a, values_b)
             if a is not None and b is not None]
    if len(pairs) < 3:
        raise ValueError("Bland-Altman extras need at least 3 complete pairs")
    a = np.array([p[0] for p in pairs])
    b = np.array([p[1] for p in pairs])
    avg = (a + b) / 2
    out = {"analysis": "bland_altman_extras", "agreement": agreement,
           "ci_level": ci_level}
    if "difference" in variants:
        out["difference"] = _ba_block(a - b, avg, agreement, ci_level, z,
                                      mover_mean)
    if "percent" in variants:
        if np.any(avg == 0):
            out["percent"] = {"error": "an average of zero: percentage "
                                       "differences are undefined"}
        else:
            out["percent"] = _ba_block(100 * (a - b) / avg, avg, agreement,
                                       ci_level, z, mover_mean)
    if "ratio" in variants:
        if np.any(a <= 0) or np.any(b <= 0):
            out["ratio"] = {"error": "the ratio (log) method needs positive "
                                     "values"}
        else:
            blk = _ba_block(np.log(a) - np.log(b), avg, agreement, ci_level,
                            z, mover_mean)

            def ex(v):
                return [math.exp(x) for x in v] if isinstance(v, list) \
                    else math.exp(v)
            blk["ratio_bias"] = ex(blk["bias"])
            blk["ratio_bias_ci"] = ex(blk["bias_ci"])
            blk["ratio_loa"] = [ex(blk["loa_lower"]), ex(blk["loa_upper"])]
            blk["ratio_loa_ci"] = {k: {s: ex(v[s]) for s in ("lower", "upper")}
                                   for k, v in blk["loa_ci"].items()}
            blk["note"] = ("natural-log differences; ratios are A/B "
                           "(back-transformed)")
            out["ratio"] = blk
    diff = a - b
    n = diff.size
    if regression:
        X = np.column_stack([np.ones(n), avg])
        coef, *_ = np.linalg.lstsq(X, diff, rcond=None)
        resid = diff - X @ coef
        s2 = float(resid @ resid / (n - 2))
        cov = s2 * np.linalg.inv(X.T @ X)
        t_slope = coef[1] / math.sqrt(cov[1, 1])
        acoef, *_ = np.linalg.lstsq(X, np.abs(resid), rcond=None)
        zq = float(stats.norm.ppf((1 + agreement) / 2)) if z is None \
            else float(z)
        grid = np.linspace(avg.min(), avg.max(), 50)
        centre = coef[0] + coef[1] * grid
        spread = zq * math.sqrt(math.pi / 2) * (acoef[0] + acoef[1] * grid)
        out["proportional_bias"] = {
            "intercept": float(coef[0]), "slope": float(coef[1]),
            "slope_se": float(math.sqrt(cov[1, 1])),
            "slope_t": float(t_slope), "df": n - 2,
            "slope_p": float(2 * stats.t.sf(abs(t_slope), n - 2)),
            "abs_residual_intercept": float(acoef[0]),
            "abs_residual_slope": float(acoef[1]),
            "curve": {"average": grid.tolist(), "bias": centre.tolist(),
                      "lower": (centre - spread).tolist(),
                      "upper": (centre + spread).tolist()}}
    out["normality"] = normality_tests(diff.tolist(),
                                       ("shapiro_wilk", "dagostino_pearson")
                                       if n >= 8 else ("shapiro_wilk",))
    return out


def _oneway_ms(values, groups):
    """Between / within mean squares of a one-way layout."""
    labels = list(dict.fromkeys(groups))
    vals = np.asarray(values, dtype=float)
    g = np.array([labels.index(v) for v in groups])
    k, N = len(labels), vals.size
    m = np.bincount(g, minlength=k).astype(float)
    means = np.bincount(g, weights=vals, minlength=k) / m
    grand = vals.mean()
    ssb = float(np.sum(m * (means - grand) ** 2))
    ssw = float(np.sum((vals - means[g]) ** 2))
    return ssb / (k - 1), ssw / (N - k), m, means, k, N


def bland_altman_repeated(subjects, values_a, values_b, *,
                          true_value: str = "varies",
                          agreement: float = 0.95,
                          ci_level: float = 0.95, z=None) -> dict:
    """Limits of agreement with several observations per subject.

    true_value="varies": rows are pairs measured together (Bland & Altman
    2007, first method): one-way ANOVA of the differences by subject.
    true_value="constant": replicates by each method need not be paired
    (rows may hold only A or only B); between-subject variance of the
    subject mean differences plus the within-subject variances. CIs of
    the limits use the MOVER of Zou (2013). z overrides the normal
    quantile (Bland & Altman use 1.96)."""
    z = float(stats.norm.ppf((1 + agreement) / 2)) if z is None else float(z)
    al = 1 - ci_level
    if true_value == "varies":
        rows = [(str(s), float(a), float(b)) for s, a, b in
                zip(subjects, values_a, values_b)
                if s is not None and a is not None and b is not None]
        if not rows:
            raise ValueError("no complete pairs")
        subj = [r[0] for r in rows]
        d = np.array([r[1] - r[2] for r in rows])
        msb, msw, m, _, n, N = _oneway_ms(d, subj)
        if n < 2 or N - n < 1:
            raise ValueError("need at least 2 subjects and some replication")
        lam = (N * N - np.sum(m * m)) / ((n - 1) * N)
        var_b = max((msb - msw) / lam, 0.0)
        var_d = var_b + msw
        sd = math.sqrt(var_d)
        bias = float(d.mean())
        # MOVER on var_d = msb / lam + (1 - 1/lam) msw (when var_b > 0)
        c1, c2 = 1 / lam, 1 - 1 / lam
        if (msb - msw) / lam < 0:
            c1, c2 = 0.0, 1.0
        df1, df2 = n - 1, N - n
        l_v = var_d - math.sqrt(
            (c1 * msb * (1 - df1 / stats.chi2.ppf(1 - al / 2, df1))) ** 2
            + (c2 * msw * (1 - df2 / stats.chi2.ppf(1 - al / 2, df2))) ** 2)
        u_v = var_d + math.sqrt(
            (c1 * msb * (df1 / stats.chi2.ppf(al / 2, df1) - 1)) ** 2
            + (c2 * msw * (df2 / stats.chi2.ppf(al / 2, df2) - 1)) ** 2)
        var_mean = var_b * np.sum(m * m) / N ** 2 + msw / N
        t = float(stats.t.ppf(1 - al / 2, n - 1))
        se_mean = math.sqrt(var_mean)
        l_mu, u_mu = bias - t * se_mean, bias + t * se_mean
        mover = _mover_loa(bias, sd, z, l_mu, u_mu, math.sqrt(max(l_v, 0.0)),
                           math.sqrt(u_v))
        return {"analysis": "bland_altman_repeated", "true_value": "varies",
                "n_subjects": int(n), "n_pairs": int(N),
                "bias": bias, "bias_ci": [l_mu, u_mu],
                "ms_subjects": msb, "ms_residual": msw, "divisor": float(lam),
                "var_between": var_b, "var_within": msw, "var_total": var_d,
                "sd": sd, "loa_lower": bias - z * sd, "loa_upper": bias + z * sd,
                "loa_ci": mover,
                "points": [{"subject": s, "average": (r[1] + r[2]) / 2,
                            "difference": r[1] - r[2]}
                           for s, r in zip(subj, rows)]}
    if true_value != "constant":
        raise ValueError("true_value must be 'varies' or 'constant'")
    xa = [(str(s), float(v)) for s, v in zip(subjects, values_a)
          if s is not None and v is not None]
    xb = [(str(s), float(v)) for s, v in zip(subjects, values_b)
          if s is not None and v is not None]
    subs = [s for s in dict.fromkeys([p[0] for p in xa])
            if s in {p[0] for p in xb}]
    xa = [p for p in xa if p[0] in subs]
    xb = [p for p in xb if p[0] in subs]
    n = len(subs)
    if n < 2:
        raise ValueError("need at least 2 subjects measured by both methods")
    _, msw_a, ma, mean_a, _, Na = _oneway_ms([p[1] for p in xa],
                                             [p[0] for p in xa])
    _, msw_b, mb, mean_b, _, Nb = _oneway_ms([p[1] for p in xb],
                                             [p[0] for p in xb])
    # align subject order
    order_a = list(dict.fromkeys(p[0] for p in xa))
    order_b = list(dict.fromkeys(p[0] for p in xb))
    ia = [order_a.index(s) for s in subs]
    ib = [order_b.index(s) for s in subs]
    dmeans = mean_a[ia] - mean_b[ib]
    var_dm = float(np.var(dmeans, ddof=1))
    ka = 1 - np.mean(1 / ma[ia])
    kb = 1 - np.mean(1 / mb[ib])
    if Na - n < 1 and Nb - n < 1:
        raise ValueError("the constant-value method needs replicates")
    msw_a = msw_a if Na > n else 0.0
    msw_b = msw_b if Nb > n else 0.0
    var_d = var_dm + ka * msw_a + kb * msw_b
    sd = math.sqrt(var_d)
    bias = float(np.mean([p[1] for p in xa]) - np.mean([p[1] for p in xb]))
    comps = [(var_dm, n - 1), (ka * msw_a, Na - n), (kb * msw_b, Nb - n)]
    lo_terms = [(c * (1 - df / stats.chi2.ppf(1 - al / 2, df))) ** 2
                for c, df in comps if df > 0 and c > 0]
    hi_terms = [(c * (df / stats.chi2.ppf(al / 2, df) - 1)) ** 2
                for c, df in comps if df > 0 and c > 0]
    l_v = var_d - math.sqrt(sum(lo_terms))
    u_v = var_d + math.sqrt(sum(hi_terms))
    t = float(stats.t.ppf(1 - al / 2, n - 1))
    se_mean = math.sqrt(var_dm / n)
    l_mu, u_mu = bias - t * se_mean, bias + t * se_mean
    mover = _mover_loa(bias, sd, z, l_mu, u_mu, math.sqrt(max(l_v, 0.0)),
                       math.sqrt(u_v))
    return {"analysis": "bland_altman_repeated", "true_value": "constant",
            "n_subjects": n, "n_a": int(Na), "n_b": int(Nb),
            "bias": bias, "bias_ci": [l_mu, u_mu],
            "mean_of_subject_differences": float(dmeans.mean()),
            "var_subject_differences": var_dm,
            "var_within_a": msw_a, "var_within_b": msw_b,
            "multiplier_a": float(ka), "multiplier_b": float(kb),
            "var_total": var_d, "sd": sd,
            "loa_lower": bias - z * sd, "loa_upper": bias + z * sd,
            "loa_ci": mover,
            "subjects": [{"subject": s, "mean_a": float(mean_a[i]),
                          "mean_b": float(mean_b[j]),
                          "difference": float(mean_a[i] - mean_b[j])}
                         for s, i, j in zip(subs, ia, ib)]}
