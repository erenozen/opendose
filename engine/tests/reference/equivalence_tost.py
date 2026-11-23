"""Independent reference for equivalence and non-inferiority tests
(FEATURE-PLAN P-12). R (TOSTER) is not installed here, so:

- t-based TOST: statsmodels 0.15 (statsmodels.stats.weightstats):
  ttost_ind (usevar "pooled" and "unequal"), ttost_paired, DescrStatsW
  .ttost_mean (one sample), and the log-ratio forms with transform=np.log
  (margins given as ratios); one-sided non-inferiority P from ttest_ind /
  ttest_rel with value = the margin and alternative "larger". The
  1 - 2 alpha CI by hand (estimate +/- t(1 - alpha, df) SE, scipy).
- two proportions: the Miettinen-Nurminen score statistic with the
  restricted maximum-likelihood estimates found by direct numerical
  maximisation of the binomial likelihood (scipy minimize_scalar, not
  the engine's closed-form cubic), and the score CI by root-finding on a
  grid. statsmodels' tost_proportions_2indep(method="score") is NOT used:
  in 0.15 its restricted estimate is not the maximum (45/50 vs 43/50 at
  delta = 0.1: p1 = 0.91538, log-likelihood -36.9292, while 0.91997 gives
  -36.9178), so its P values differ in the third digit.

Run: /home/eren/opendose/.venv/bin/python engine/tests/reference/equivalence_tost.py
writes equivalence_tost.json next to this file.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from scipy import optimize, stats
from statsmodels.stats.weightstats import (
    DescrStatsW, ttest_ind, ttost_ind, ttost_paired)

HERE = Path(__file__).resolve().parent

# The plan's acceptance data: two groups of 8, means 10.2 and 10.0, SD 0.5
# exactly (deviations +/- 0.6, 0.55, 0.35, 0.3).
DEV = [0.6, 0.55, 0.35, 0.3, -0.6, -0.55, -0.35, -0.3]
ACC_A = [round(10.2 + d, 2) for d in DEV]
ACC_B = [round(10.0 + d, 2) for d in DEV]

WELCH_A = [12.1, 11.4, 12.9, 10.8, 11.7, 12.4]
WELCH_B = [11.2, 13.9, 9.1, 12.8, 10.4, 14.1, 9.9, 11.6, 12.2]

PAIRED_A = [5.1, 4.8, 6.2, 5.5, 5.9, 4.6, 5.3, 6.0, 5.7, 5.2]
PAIRED_B = [5.0, 4.9, 6.0, 5.6, 5.7, 4.7, 5.4, 5.8, 5.5, 5.3]

ONE_SAMPLE = [99.1, 100.4, 101.2, 98.7, 100.9, 99.6, 100.2, 101.5, 99.3]

# Bioequivalence-style ratios (AUCs), margins 0.8 to 1.25
LOG_A = [102.0, 95.0, 120.0, 88.0, 110.0, 99.0, 105.0, 93.0]
LOG_B = [98.0, 101.0, 112.0, 92.0, 104.0, 97.0, 109.0, 90.0]


def hand_ci(est, se, df, alpha=0.05):
    q = float(stats.t.ppf(1 - alpha, df))
    return [est - q * se, est + q * se]


def t_case(res, est, se, df):
    p, lo, hi = res
    return {"p": float(p), "p_lower": float(lo[1]), "t_lower": float(lo[0]),
            "p_upper": float(hi[1]), "t_upper": float(hi[0]),
            "df": float(lo[2]), "estimate": est, "ci": hand_ci(est, se, df)}


def pooled_se(a, b):
    a, b = np.asarray(a, float), np.asarray(b, float)
    df = a.size + b.size - 2
    sp2 = ((a.size - 1) * a.var(ddof=1) + (b.size - 1) * b.var(ddof=1)) / df
    return math.sqrt(sp2 * (1 / a.size + 1 / b.size)), df


def unpaired(a, b, m):
    a, b = np.asarray(a, float), np.asarray(b, float)
    se, df = pooled_se(a, b)
    return t_case(ttost_ind(a, b, -m, m, usevar="pooled"),
                  float(a.mean() - b.mean()), se, df)


def welch(a, b, m):
    a, b = np.asarray(a, float), np.asarray(b, float)
    va, vb = a.var(ddof=1) / a.size, b.var(ddof=1) / b.size
    df = (va + vb) ** 2 / (va ** 2 / (a.size - 1) + vb ** 2 / (b.size - 1))
    return t_case(ttost_ind(a, b, -m, m, usevar="unequal"),
                  float(a.mean() - b.mean()), math.sqrt(va + vb), df)


def paired(a, b, m):
    a, b = np.asarray(a, float), np.asarray(b, float)
    d = a - b
    return t_case(ttost_paired(a, b, -m, m), float(d.mean()),
                  float(d.std(ddof=1) / math.sqrt(d.size)), d.size - 1)


def one_sample(x, mu, m):
    x = np.asarray(x, float)
    res = DescrStatsW(x).ttost_mean(mu - m, mu + m)
    return t_case(res, float(x.mean() - mu),
                  float(x.std(ddof=1) / math.sqrt(x.size)), x.size - 1)


def log_unpaired(a, b, lo, hi):
    a, b = np.asarray(a, float), np.asarray(b, float)
    la, lb = np.log10(a), np.log10(b)
    se, df = pooled_se(la, lb)
    out = t_case(ttost_ind(a, b, lo, hi, usevar="pooled", transform=np.log),
                 float(la.mean() - lb.mean()), se, df)
    out["ratio"] = 10 ** out["estimate"]
    out["ci_ratio"] = [10 ** v for v in out["ci"]]
    return out


def log_paired(a, b, lo, hi):
    a, b = np.asarray(a, float), np.asarray(b, float)
    d = np.log10(a) - np.log10(b)
    out = t_case(ttost_paired(a, b, lo, hi, transform=np.log), float(d.mean()),
                 float(d.std(ddof=1) / math.sqrt(d.size)), d.size - 1)
    out["ratio"] = 10 ** out["estimate"]
    out["ci_ratio"] = [10 ** v for v in out["ci"]]
    return out


def noninferiority(a, b, m):
    """H0: A - B <= -m, one-sided (statsmodels ttest_ind, value = -m)."""
    t, p, df = ttest_ind(np.asarray(a, float), np.asarray(b, float),
                         alternative="larger", usevar="pooled", value=-m)
    return {"p": float(p), "t": float(t), "df": float(df)}


# ------------------------------------------------------- two proportions

def restricted(k1, n1, k2, n2, delta):
    """argmax of the binomial likelihood with p1 - p2 = delta, numerically."""
    def nll(p2):
        p1 = p2 + delta
        out = 0.0
        for k, n, p in ((k1, n1, p1), (k2, n2, p2)):
            if k > 0:
                out -= k * math.log(p)
            if n - k > 0:
                out -= (n - k) * math.log(1 - p)
        return out
    lo, hi = max(0.0, -delta) + 1e-13, min(1.0, 1 - delta) - 1e-13
    r = optimize.minimize_scalar(nll, bounds=(lo, hi), method="bounded",
                                 options={"xatol": 1e-13, "maxiter": 2000})
    return r.x + delta, r.x


def score_z(k1, n1, k2, n2, delta):
    p1, p2 = restricted(k1, n1, k2, n2, delta)
    n = n1 + n2
    var = (p1 * (1 - p1) / n1 + p2 * (1 - p2) / n2) * n / (n - 1)
    return (k1 / n1 - k2 / n2 - delta) / math.sqrt(var)


def score_ci(k1, n1, k2, n2, level):
    zc = float(stats.norm.ppf((1 + level) / 2))
    est = k1 / n1 - k2 / n2
    grid = np.linspace(-0.999999, 0.999999, 4001)
    vals = np.array([score_z(k1, n1, k2, n2, g) for g in grid])
    lo_i = np.where((grid < est) & (vals > zc))[0]
    hi_i = np.where((grid > est) & (vals < -zc))[0]
    lo = optimize.brentq(lambda d: score_z(k1, n1, k2, n2, d) - zc,
                         grid[lo_i[-1]], est, xtol=1e-13)
    hi = optimize.brentq(lambda d: score_z(k1, n1, k2, n2, d) + zc,
                         est, grid[hi_i[0]], xtol=1e-13)
    return [float(lo), float(hi)]


def proportions_case(k1, n1, k2, n2, m, alpha=0.05):
    zl, zu = score_z(k1, n1, k2, n2, -m), score_z(k1, n1, k2, n2, m)
    pl, pu = float(stats.norm.sf(zl)), float(stats.norm.cdf(zu))
    return {"counts": [k1, n1, k2, n2], "margin": m,
            "z_lower": zl, "p_lower": pl, "z_upper": zu, "p_upper": pu,
            "p": max(pl, pu), "estimate": k1 / n1 - k2 / n2,
            "ci": score_ci(k1, n1, k2, n2, 1 - 2 * alpha)}


def main():
    ref = {
        "acceptance": {"a": ACC_A, "b": ACC_B,
                       "margin_1": unpaired(ACC_A, ACC_B, 1.0),
                       "margin_0.5": unpaired(ACC_A, ACC_B, 0.5)},
        "welch": {"a": WELCH_A, "b": WELCH_B, "margin": 1.5,
                  **welch(WELCH_A, WELCH_B, 1.5)},
        "paired": {"a": PAIRED_A, "b": PAIRED_B, "margin": 0.25,
                   **paired(PAIRED_A, PAIRED_B, 0.25)},
        "one_sample": {"values": ONE_SAMPLE, "hypothetical": 100.0,
                       "margin": 1.0, **one_sample(ONE_SAMPLE, 100.0, 1.0)},
        "log_unpaired": {"a": LOG_A, "b": LOG_B, "lower": 0.8, "upper": 1.25,
                         **log_unpaired(LOG_A, LOG_B, 0.8, 1.25)},
        "log_paired": {"a": LOG_A, "b": LOG_B, "lower": 0.8, "upper": 1.25,
                       **log_paired(LOG_A, LOG_B, 0.8, 1.25)},
        "noninferiority": {"a": ACC_A, "b": ACC_B, "margin": 0.5,
                           **noninferiority(ACC_A, ACC_B, 0.5)},
        "proportions": [proportions_case(45, 50, 43, 50, 0.1),
                        proportions_case(18, 20, 15, 20, 0.2),
                        proportions_case(7, 34, 1, 34, 0.2),
                        proportions_case(88, 100, 85, 100, 0.1)],
    }
    (HERE / "equivalence_tost.json").write_text(json.dumps(ref, indent=1) + "\n")


if __name__ == "__main__":
    main()
