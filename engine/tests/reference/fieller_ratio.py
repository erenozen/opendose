"""Independent reference for the ratio to control (FEATURE-PLAN P-18).
R (mratios) is not installed here, so:

- unpaired t test: Fieller's (1954) interval by hand, as the roots of
  the quadratic (a^2 - t^2 se_a^2) rho^2 - 2 a b rho + (b^2 - t^2 se_b^2)
  = 0 with the pooled SD (np.roots; not the engine's closed form), on the
  plan's acceptance data and on a control whose mean is not clearly
  different from zero (unbounded);
- coverage: 2,000 seeded data sets (n = 5 + 5, SD 5, true ratio 0.65)
  with the hand interval; coverage within the binomial tolerance of 95%;
- Dunnett: the plug-in simultaneous intervals of Dilba, Bretz & Guiard
  (2006): the critical value c of max |T_i| by nested adaptive
  quadrature (scipy.integrate.quad; not opendose.dunnett) with the
  correlation lambda_i lambda_j, lambda_i = rho_i / sqrt(n_0/n_i +
  rho_i^2) at the estimated ratios, then Fieller's quadratic with c.

Run: /home/eren/opendose/.venv/bin/python engine/tests/reference/fieller_ratio.py
writes fieller_ratio.json next to this file.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from scipy import integrate, optimize, stats

HERE = Path(__file__).resolve().parent

CONTROL = [100.0, 95.0, 105.0, 98.0, 102.0]
TREATED = [60.0, 70.0, 65.0, 55.0, 75.0]
NEAR_ZERO_CONTROL = [3.0, -4.0, 6.0, -2.0, 1.0]
NEAR_ZERO_TREATED = [10.0, 14.0, 9.0, 12.0, 15.0]


def pooled(c, t):
    c, t = np.asarray(c, float), np.asarray(t, float)
    df = c.size + t.size - 2
    sp2 = ((c.size - 1) * c.var(ddof=1) + (t.size - 1) * t.var(ddof=1)) / df
    return c.mean(), math.sqrt(sp2 / c.size), t.mean(), math.sqrt(sp2 / t.size), df


def fieller_by_roots(a, se_a, b, se_b, crit):
    A = a * a - crit * crit * se_a * se_a
    B = -2 * a * b
    C = b * b - crit * crit * se_b * se_b
    if A <= 0:
        return None
    r = np.sort(np.real(np.roots([A, B, C])))
    return [float(r[0]), float(r[1])]


def ttest_case(c, t):
    a, sa, b, sb, df = pooled(c, t)
    crit = float(stats.t.ppf(0.975, df))
    return {"control": c, "treated": t, "ratio": b / a, "df": df,
            "ci": fieller_by_roots(a, sa, b, sb, crit)}


def coverage(n_rep=2000, seed=18):
    rng = np.random.default_rng(seed)
    hits = 0
    for _ in range(n_rep):
        c = rng.normal(100, 5, 5)
        t = rng.normal(65, 5, 5)
        a, sa, b, sb, df = pooled(c, t)
        ci = fieller_by_roots(a, sa, b, sb, float(stats.t.ppf(0.975, df)))
        hits += ci is not None and ci[0] <= 0.65 <= ci[1]
    return {"n_rep": n_rep, "seed": seed, "covered": hits}


DUNNETT_GROUPS = {
    "Control": [100.0, 95.0, 105.0, 98.0, 102.0],
    "Low": [92.0, 88.0, 97.0, 90.0, 95.0],
    "Mid": [80.0, 76.0, 85.0, 79.0, 83.0, 81.0],
    "High": [60.0, 70.0, 65.0, 55.0, 75.0],
}


def mvt_critical(lam, df, level=0.95):
    """Two-sided critical value of max |T_j| for a multivariate t with
    correlation lam_i lam_j: nested adaptive quadrature (scipy.integrate.
    quad) over the chi scale s and the common normal factor z, given
    which the T_j are independent; root by brentq. A different method
    from opendose.dunnett (trapezoidal rule on the whole line)."""
    lam = np.asarray(lam, float)
    b = np.sqrt(1 - lam ** 2)
    chi = stats.chi(df, scale=1 / math.sqrt(df))

    def inner(s, c):
        f = lambda z: stats.norm.pdf(z) * np.prod(  # noqa: E731
            stats.norm.cdf((c * s - lam * z) / b) - stats.norm.cdf((-c * s - lam * z) / b))
        return integrate.quad(f, -12, 12, epsabs=1e-13, epsrel=1e-12, limit=200)[0]

    def cdf(c):
        g = lambda s: chi.pdf(s) * inner(s, c)  # noqa: E731
        lo, hi = chi.ppf(1e-15), chi.ppf(1 - 1e-15)
        return integrate.quad(g, lo, hi, epsabs=1e-13, epsrel=1e-12, limit=200)[0]
    return float(optimize.brentq(lambda c: cdf(c) - level, 1.5, 5.0, xtol=1e-12))


def dunnett_case():
    names = list(DUNNETT_GROUPS)
    ys = [np.asarray(v, float) for v in DUNNETT_GROUPS.values()]
    ns = [y.size for y in ys]
    means = [float(y.mean()) for y in ys]
    df = sum(ns) - len(ns)
    ms = sum(float(((y - y.mean()) ** 2).sum()) for y in ys) / df
    m0, n0 = means[0], ns[0]
    rho = [means[i] / m0 for i in range(1, len(ys))]
    lam = np.array([r / math.sqrt(n0 / ns[i + 1] + r * r) for i, r in enumerate(rho)])
    c = mvt_critical(lam, df)
    out = []
    for i in range(1, len(ys)):
        out.append({"name": names[i], "ratio": means[i] / m0,
                    "ci": fieller_by_roots(m0, math.sqrt(ms / n0), means[i],
                                           math.sqrt(ms / ns[i]), c)})
    return {"groups": DUNNETT_GROUPS, "df": df, "ms_residual": ms,
            "critical_value": c, "ratios": out}


def main():
    ref = {"acceptance": ttest_case(CONTROL, TREATED),
           "near_zero": ttest_case(NEAR_ZERO_CONTROL, NEAR_ZERO_TREATED),
           "coverage": coverage(), "dunnett": dunnett_case()}
    (HERE / "fieller_ratio.json").write_text(json.dumps(ref, indent=1) + "\n")


if __name__ == "__main__":
    main()
