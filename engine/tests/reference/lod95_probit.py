"""Independent reference for the qPCR LoD95 from a hit-rate dilution
series (FEATURE-PLAN P-29). R (glm with binomial(probit)) is not
installed here, so statsmodels GLM(family=Binomial(link=probit)) is the
oracle: the probit of the hit rate on log10 quantity, LoD95 = 10^((z95 -
a) / b) with z95 = Phi^-1(0.95), the delta-method CI on the log scale,
and Fieller's interval solved by hand as the roots of the quadratic
(b^2 - z^2 v_bb) t^2 - 2 (q b - z^2 v_qb) t + (q^2 - z^2 v_qq) = 0 with
q = z95 - a (np.roots, not opendose.quantal.fieller), all with the
statsmodels covariance (expected information) and z = 1.959964.

Data: a hand-built series, 8 quantities (copies per reaction) of 12
replicate wells each, with the number of wells that gave a Cq.

Run: /home/eren/opendose/.venv/bin/python engine/tests/reference/lod95_probit.py
writes lod95_probit.json next to this file.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import statsmodels.api as sm
from scipy import stats

HERE = Path(__file__).resolve().parent

QUANTITY = [1000, 100, 50, 20, 10, 5, 2, 1]
N = [12] * 8
DETECTED = [12, 12, 12, 11, 9, 6, 3, 1]


def main():
    x = np.log10(np.array(QUANTITY, float))
    endog = np.column_stack([DETECTED, np.array(N) - np.array(DETECTED)])
    model = sm.GLM(endog, sm.add_constant(x),
                   family=sm.families.Binomial(link=sm.families.links.Probit()))
    fit = model.fit()
    a, b = (float(v) for v in fit.params)
    cov = np.asarray(fit.cov_params())
    z95 = float(stats.norm.ppf(0.95))
    z = float(stats.norm.ppf(0.975))
    theta = (z95 - a) / b
    # delta method on the log10 scale
    grad = np.array([-1 / b, -(z95 - a) / b ** 2])
    se = math.sqrt(float(grad @ cov @ grad))
    delta = [10 ** (theta - z * se), 10 ** (theta + z * se)]
    # Fieller: roots in t of (q - b t)^2 = z^2 var(q - b t)
    vqq, vqb, vbb = cov[0, 0], -cov[0, 1], cov[1, 1]
    q = z95 - a
    coef = [b * b - z * z * vbb, -2 * (q * b - z * z * vqb), q * q - z * z * vqq]
    roots = sorted(float(r.real) for r in np.roots(coef))
    out = {
        "data": {"quantity": QUANTITY, "n": N, "detected": DETECTED},
        "intercept": a, "slope": b, "cov": cov.tolist(),
        "pearson_chi2": float(fit.pearson_chi2), "df": int(fit.df_resid),
        "p_pearson": float(stats.chi2.sf(fit.pearson_chi2, fit.df_resid)),
        "lod95": 10 ** theta, "log10_lod95": theta,
        "ci_delta": delta,
        "ci_fieller": [10 ** roots[0], 10 ** roots[1]],
    }
    (HERE / "lod95_probit.json").write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({k: v for k, v in out.items() if k not in ("data", "cov")}, indent=2))


if __name__ == "__main__":
    main()
