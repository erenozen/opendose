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
