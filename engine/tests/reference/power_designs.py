"""Independent reference values for power_designs (FEATURE-PLAN P-95).

G*Power and R (PowerTOST) are not installed here. Published values are
pinned in the test itself (Faul et al. 2007, the G*Power 3.1 manual,
Hsieh et al. 1998, Borm et al. 2007). This script computes the rest by
methods that share no code with the engine:

- repeated measures ANOVA: Monte Carlo of the univariate RM ANOVA F test
  on compound-symmetric normal data (numpy; F from the sums of squares),
  for the Faul et al. (2007) Figure 4 within effect at N = 30;
- regression: statsmodels FTestPowerF2 (ncp = f^2 (df1 + df2 + ncc), so
  ncc = 1 gives lambda = f^2 N; the older FTestPower swaps df_num and
  df_denom and is not used);
- ANCOVA: the unconditional power by adaptive quadrature over the F(1,
  N - 2) density of the covariate imbalance (the engine uses Gaussian
  quadrature in another variable), and a Monte Carlo of the ANCOVA;
- ANCOVA: Monte Carlo of the two-group ANCOVA (numpy least squares on
  [1, group, baseline], random normal baseline);
- rank tests: Monte Carlo of scipy's mannwhitneyu and wilcoxon (normal
  and Laplace parents);
- TOST: the power integrated in the other order (over the estimate D,
  with the chi-square CDF of the SD; scipy dblquad-free 1-D quad), and a
  Monte Carlo of the two one-sided t tests (scipy.stats.ttest_ind with
  alternative "greater" and "less");
- logistic: Monte Carlo of the Wald test (statsmodels Logit) for the
  binary-covariate example of Hsieh et al. (1998).

Run: /home/eren/opendose/.venv/bin/python engine/tests/reference/power_designs.py
writes power_designs.json next to this file (about a minute).
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import statsmodels.api as sm
from scipy import integrate, stats
from statsmodels.stats.power import FTestPowerF2

HERE = Path(__file__).resolve().parent
OUT: dict = {}


def mc_rm_within(N, k, m, rho, f, reps, seed):
    """Univariate RM ANOVA, within effect: column means set so that the
    SD of the m time means over sigma is f (equal groups, no between or
    interaction effect)."""
    rng = np.random.default_rng(seed)
    sigma = 1.0
    t = np.linspace(-1, 1, m)
    mu = t / np.sqrt(np.mean(t ** 2)) * f * sigma
    cov = sigma ** 2 * (rho * np.ones((m, m)) + (1 - rho) * np.eye(m))
    L = np.linalg.cholesky(cov)
    n = N // k
    crit = stats.f.isf(0.05, m - 1, (N - k) * (m - 1))
    hits = 0
    for _ in range(reps):
        y = rng.standard_normal((N, m)) @ L.T + mu
        g = np.repeat(np.arange(k), n)
        grand = y.mean()
        subj = y.mean(axis=1)
        time = y.mean(axis=0)
        cell = np.array([y[g == i].mean(axis=0) for i in range(k)])
        ss_time = N * np.sum((time - grand) ** 2)
        # residual = subject x time within groups
        resid = y - subj[:, None] - cell[g] + cell[g].mean(axis=1)[:, None]
        ss_err = np.sum(resid ** 2)
        F = (ss_time / (m - 1)) / (ss_err / ((N - k) * (m - 1)))
        hits += F > crit
    return hits / reps


def ancova_quad(d, rho, n1, n2, alpha=0.05):
    N = n1 + n2
    nu = N - 2
    delta = d / math.sqrt(1 - rho ** 2) * math.sqrt(n1 * n2 / N)
    tc = stats.t.isf(alpha / 2, N - 3)

    def g(x):
        ncp = delta / math.sqrt(1 + x / nu)
        p = stats.nct.sf(tc, N - 3, ncp) + stats.nct.cdf(-tc, N - 3, ncp)
        return p * stats.f.pdf(x, 1, nu)

    a, _ = integrate.quad(g, 0, 1, limit=200, epsabs=1e-13, epsrel=1e-11)
    b, _ = integrate.quad(g, 1, np.inf, limit=200, epsabs=1e-13,
                          epsrel=1e-11)
    return a + b


def mc_ancova(n1, n2, d, rho, reps, seed, alpha=0.05):
    rng = np.random.default_rng(seed)
    N = n1 + n2
    g = np.r_[np.zeros(n1), np.ones(n2)]
    tc = stats.t.isf(alpha / 2, N - 3)
    x = rng.standard_normal((reps, N))
    e = rng.standard_normal((reps, N))
    y = d * g + rho * x + math.sqrt(1 - rho ** 2) * e
    hits = 0
    for i in range(reps):
        X = np.column_stack([np.ones(N), g, x[i]])
        beta, rss, *_ = np.linalg.lstsq(X, y[i], rcond=None)
        s2 = rss[0] / (N - 3)
        cov = s2 * np.linalg.inv(X.T @ X)
        hits += abs(beta[1] / math.sqrt(cov[1, 1])) > tc
    return hits / reps


def mc_rank(kind, n, d, parent, reps, seed, alpha=0.05, alternative="two-sided"):
    rng = np.random.default_rng(seed)
    if parent == "normal":
        draw = lambda size: rng.standard_normal(size)
    else:  # Laplace with SD 1
        draw = lambda size: rng.laplace(0, 1 / math.sqrt(2), size)
    if kind == "mw":
        a = draw((reps, n))
        b = draw((reps, n)) + d
        p = stats.mannwhitneyu(b, a, axis=1, alternative=alternative).pvalue
    else:
        x = draw((reps, n)) + d
        p = stats.wilcoxon(x, axis=1, alternative=alternative).pvalue
    return float(np.mean(p <= alpha))


def tost_by_d(theta, lower, upper, sd, c, nu, alpha):
    """Integrate over the estimate D: P(s < min(D - L, U - D) / (t c))."""
    t = stats.t.isf(alpha, nu)
    se = sd * c

    def g(D):
        lim = min(D - lower, upper - D) / (t * c)
        if lim <= 0:
            return 0.0
        # s^2 = sd^2 chi2_nu / nu < lim^2
        return stats.norm.pdf(D, theta, se) * stats.chi2.cdf(
            nu * lim ** 2 / sd ** 2, nu)

    val, _ = integrate.quad(g, lower, upper, points=[(lower + upper) / 2,
                                                       theta], limit=400,
                            epsabs=1e-13, epsrel=1e-11)
    return val


def mc_tost(n1, n2, theta, lower, upper, sd, alpha, reps, seed):
    rng = np.random.default_rng(seed)
    a = rng.normal(0, sd, (reps, n1))
    b = rng.normal(theta, sd, (reps, n2))
    p_lo = stats.ttest_ind(b - lower, a, axis=1, alternative="greater").pvalue
    p_hi = stats.ttest_ind(b - upper, a, axis=1, alternative="less").pvalue
    return float(np.mean((p_lo <= alpha) & (p_hi <= alpha)))


def mc_logistic_binary(N, p0, p1, B, reps, seed):
    rng = np.random.default_rng(seed)
    hits = done = 0
    x = np.r_[np.zeros(N - int(round(N * B))), np.ones(int(round(N * B)))]
    X = sm.add_constant(x)
    for _ in range(reps):
        y = rng.random(N) < np.where(x == 1, p1, p0)
        try:
            r = sm.Logit(y.astype(float), X).fit(disp=0)
        except Exception:  # separation: count as not significant
            done += 1
            continue
        done += 1
        hits += r.pvalues[1] < 0.05
    return hits / done


def main():
    # Regression (statsmodels FTestPowerF2; ncc = 1 makes lambda = f^2 N)
    fp = FTestPowerF2()
    OUT["regression"] = {
        "omnibus_p5_n95_r2_0.10": float(fp.power(
            effect_size=0.1 / 0.9, df_num=5, df_denom=89, alpha=0.05,
            ncc=1)),
        "increase_q3_p12_n200_f2_0.075_a0.01": float(fp.power(
            # 12 predictors, 3 tested: df = (3, 187) and lambda = f^2 N
            # needs ncc = N - 3 - 187 = 10 (ncc = 1 would be Cohen's
            # f^2 (u + v + 1) approximation, 14.3)
            effect_size=0.075, df_num=3, df_denom=187, alpha=0.01, ncc=10)),
        "a_priori_p3_f2_0.15_power0.8": int(math.ceil(fp.solve_power(
            effect_size=0.15, df_num=3, df_denom=None, alpha=0.05,
            power=0.8, ncc=1) + 3 + 1 - 1e-9)),
    }
    OUT["ancova_quad"] = [
        {"d": d, "rho": r, "n1": a, "n2": b, "power": ancova_quad(d, r, a, b)}
        for (d, r, a, b) in [(0.5, 0.7, 33, 33), (1.2, 0.6, 8, 8),
                             (0.3, 0.5, 160, 160), (0.1, 0.5, 3000, 3000),
                             (2.0, 0.2, 3, 3), (0.4, 0.5, 20, 35)]]
    # RM ANOVA within: Faul et al. Figure 4 within effect (f = 0.2572,
    # k = 3, m = 3, rho = 0.3) at a smaller N so the power is not ~1.
    OUT["rm_within_mc"] = {"N": 30, "k": 3, "m": 3, "rho": 0.3,
                           "f": 0.2572, "reps": 20000,
                           "power": mc_rm_within(30, 3, 3, 0.3, 0.2572,
                                                 20000, 1)}
    # ANCOVA: d = 0.5, rho = 0.7, 33 per group (Borm example size).
    OUT["ancova_mc"] = {"n1": 33, "n2": 33, "d": 0.5, "rho": 0.7,
                        "reps": 40000,
                        "power": mc_ancova(33, 33, 0.5, 0.7, 40000, 2)}
    OUT["ancova_mc_small"] = {"n1": 8, "n2": 8, "d": 1.2, "rho": 0.6,
                              "reps": 100000,
                              "power": mc_ancova(8, 8, 1.2, 0.6, 100000, 3)}
    # Rank tests by simulation (A.R.E. is asymptotic)
    OUT["rank_mc"] = {
        "mw_normal_n30_d0.6": mc_rank("mw", 30, 0.6, "normal", 40000, 4),
        "mw_laplace_n30_d0.6": mc_rank("mw", 30, 0.6, "laplace", 40000, 5),
        "sr_normal_n25_d0.5": mc_rank("sr", 25, 0.5, "normal", 40000, 6),
        "reps": 40000,
    }
    # TOST: other integration order and Monte Carlo
    cases = []
    for (n1, n2, theta, lo, hi, sd, alpha) in [
            (20, 20, 0.0, -0.5, 0.5, 0.5, 0.05),
            (15, 30, 0.1, -0.4, 0.6, 0.5, 0.05),
            (10, 10, 0.05, -1.0, 1.0, 1.0, 0.05)]:
        c = math.sqrt(1 / n1 + 1 / n2)
        nu = n1 + n2 - 2
        cases.append({
            "n1": n1, "n2": n2, "theta": theta, "lower": lo, "upper": hi,
            "sd": sd, "alpha": alpha,
            "power_by_d": tost_by_d(theta, lo, hi, sd, c, nu, alpha),
            "power_mc": mc_tost(n1, n2, theta, lo, hi, sd, alpha, 200000, 7),
            "mc_reps": 200000})
    OUT["tost"] = cases
    # paired / one sample: c = 1/sqrt(n), nu = n - 1
    OUT["tost_paired"] = {"n": 12, "theta": 0.0, "lower": -0.6,
                          "upper": 0.6, "sd": 0.7, "alpha": 0.05,
                          "power_by_d": tost_by_d(0.0, -0.6, 0.6, 0.7,
                                                  1 / math.sqrt(12), 11,
                                                  0.05)}
    # Logistic, Hsieh Table I example 4 (binary covariate), Wald test MC
    OUT["logistic_binary_mc"] = {
        "N": 1437, "p0": 0.05, "p1": 0.1, "B": 0.5, "reps": 4000,
        "power": mc_logistic_binary(1437, 0.05, 0.1, 0.5, 4000, 8)}
    (HERE / "power_designs.json").write_text(json.dumps(OUT, indent=1))
    print(json.dumps(OUT, indent=1))


if __name__ == "__main__":
    main()
