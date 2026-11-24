"""Reference values for engine/tests/test_meta.py (P-92), computed
independently of opendose.meta.

Run from the repository root with the project venv (statsmodels 0.15):

    /home/eren/opendose/.venv/bin/python engine/tests/reference/meta_reference.py

It prints the values and writes them to meta_reference.json beside it
(read by the e2e suites).

Sources:
- dat.bcg (Colditz et al. 1994, JAMA 271:698; shipped with R metafor):
  13 BCG vaccine trials, log risk ratios and their sampling variances as
  metafor's escalc(measure = "RR") computes them.
- REML tau^2 here by Fisher scoring (the iteration metafor's rma.uni
  uses; Viechtbauer 2005, J Educ Behav Stat 30:261, eq. 11), not by the
  bracketed root of the score that opendose.meta solves.
- The Hartung-Knapp interval (Hartung & Knapp 2001) written out from the
  formula; the DerSimonian-Laird random-effects model and its HKSJ
  interval from statsmodels.stats.meta_analysis.combine_effects.
- The prediction interval mu +/- t_{k-2} sqrt(tau^2 + SE^2) (Riley,
  Higgins & Deeks 2011, BMJ 342:d549).

metafor's own printed output for dat.bcg (REML and FE) and the R
metafor / meta outputs stored in statsmodels' test suite are pinned in
the test itself with their citations.
"""

import json
import math
from pathlib import Path

import numpy as np
from scipy import stats
from statsmodels.stats.meta_analysis import combine_effects

BCG = [  # tpos, tneg, cpos, cneg
    (4, 119, 11, 128), (6, 300, 29, 274), (3, 228, 11, 209),
    (62, 13536, 248, 12619), (33, 5036, 47, 5761), (180, 1361, 372, 1079),
    (8, 2537, 10, 619), (505, 87886, 499, 87892), (29, 7470, 45, 7232),
    (17, 1699, 65, 1600), (186, 50448, 141, 27197), (5, 2493, 3, 2338),
    (27, 16886, 29, 17825),
]


def bcg_yi_vi():
    y = [math.log((a / (a + b)) / (c / (c + d))) for a, b, c, d in BCG]
    v = [1 / a - 1 / (a + b) + 1 / c - 1 / (c + d) for a, b, c, d in BCG]
    return np.array(y), np.array(v)


def reml_fisher(y, v, tol=1e-12, maxit=1000):
    """REML tau^2 by Fisher scoring, truncated at 0 (metafor's default)."""
    tau2 = max(0.0, np.var(y, ddof=1) - v.mean())
    for _ in range(maxit):
        w = 1 / (v + tau2)
        sw = w.sum()
        P = np.diag(w) - np.outer(w, w) / sw
        Py = P @ y
        score = 0.5 * (Py @ Py - np.trace(P))
        info = 0.5 * np.trace(P @ P)
        new = max(0.0, tau2 + score / info)
        if abs(new - tau2) < tol:
            return new, 1 / math.sqrt(info)
        tau2 = new
    raise RuntimeError("no convergence")


def random_effects(y, v, tau2, level=0.95):
    w = 1 / (v + tau2)
    mu = (w * y).sum() / w.sum()
    se_z = math.sqrt(1 / w.sum())
    k = y.size
    se_hk = math.sqrt((w * (y - mu) ** 2).sum() / ((k - 1) * w.sum()))
    t = stats.t.ppf(0.5 + level / 2, k - 1)
    z = stats.norm.ppf(0.5 + level / 2)
    tp = stats.t.ppf(0.5 + level / 2, k - 2)
    return {"mu": mu, "se_z": se_z, "ci_z": [mu - z * se_z, mu + z * se_z],
            "se_hk": se_hk, "ci_hk": [mu - t * se_hk, mu + t * se_hk],
            "p_hk": 2 * stats.t.sf(abs(mu / se_hk), k - 1),
            "pi_hk": [mu - tp * math.sqrt(tau2 + se_hk ** 2),
                      mu + tp * math.sqrt(tau2 + se_hk ** 2)],
            "pi_z": [mu - tp * math.sqrt(tau2 + se_z ** 2),
                     mu + tp * math.sqrt(tau2 + se_z ** 2)]}


def main():
    out = {}
    y, v = bcg_yi_vi()
    tau2, tau2_se = reml_fisher(y, v)
    re = random_effects(y, v, tau2)
    out["bcg_reml"] = {"tau2": tau2, "tau2_se": tau2_se, **re}
    res = combine_effects(y, v, method_re="dl", use_t=True)
    ci = res.conf_int(alpha=0.05, use_t=True)
    out["bcg_dl_statsmodels"] = {
        "tau2": float(res.tau2), "mu_re": float(res.mean_effect_re),
        "mu_fe": float(res.mean_effect_fe),
        "se_hksj": float(res.sd_eff_w_re_hksj),
        "ci_re_hksj": [float(ci[3][0]), float(ci[3][1])],
        "q": float(res.q), "i2": float(res.i2)}
    # three experiments (the few-studies case): estimates and SEs
    y3 = np.array([1.2, 0.4, 0.9])
    se3 = np.array([0.30, 0.25, 0.40])
    t3, t3se = reml_fisher(y3, se3 ** 2)
    out["three_reml"] = {"tau2": t3, "tau2_se": t3se,
                         **random_effects(y3, se3 ** 2, t3)}
    text = json.dumps(out, indent=1)
    Path(__file__).with_suffix(".json").write_text(text + "\n")
    print(text)


if __name__ == "__main__":
    main()
