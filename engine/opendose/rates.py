"""Two event rates compared (counts with different exposures: events per
hour, per mm2, per 10^6 cells), as R's poisson.test(c(x1, x2), c(T1, T2)).

- Exact conditional test of rate ratio = 1 (Przyborowski & Wilenski
  1940): given the total x1 + x2 = n, x1 is binomial(n, T1 / (T1 + T2))
  under H0; the two-sided P is the binomial test's sum of the
  probabilities no larger than the observed one (scipy binomtest, as R's
  binom.test), with both one-sided P values.
- Rate ratio (x1/T1) / (x2/T2) with the exact conditional CI: the
  Clopper-Pearson interval (pL, pU) of x1 / n mapped by p / (1 - p) x
  T2 / T1 (R's poisson.test; Ulm 1990 for the single rate).
- Each rate with its exact (Garwood 1936) CI: chi2(alpha/2, 2x) / (2T)
  to chi2(1 - alpha/2, 2x + 2) / (2T); 0 as the lower limit when x = 0.

Sources: Przyborowski J & Wilenski H (1940) Biometrika 31:313; Garwood F
(1936) Biometrika 28:437; R stats::poisson.test.
"""

from __future__ import annotations

import math

from scipy import stats

SOURCE = ("exact conditional (binomial) test of the rate ratio, "
          "Przyborowski & Wilenski (1940) Biometrika 31:313; exact Poisson "
          "CI of each rate, Garwood (1936) Biometrika 28:437; as R "
          "poisson.test")


def _count(v, what):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        raise ValueError(f"enter the {what}")
    v = float(v)
    if v < 0 or not v.is_integer():
        raise ValueError(f"the {what} must be a whole number of events, "
                         "0 or more")
    return int(v)


def _exposure(v, what):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        raise ValueError(f"enter the {what}")
    v = float(v)
    if not v > 0 or not math.isfinite(v):
        raise ValueError(f"the {what} must be above 0")
    return v


def rate_ci(x: int, t: float, ci_level: float = 0.95) -> list:
    """Exact (Garwood) CI of the rate x / t."""
    a = 1 - ci_level
    lo = 0.0 if x == 0 else float(stats.chi2.ppf(a / 2, 2 * x)) / (2 * t)
    hi = float(stats.chi2.ppf(1 - a / 2, 2 * x + 2)) / (2 * t)
    return [lo, hi]


def compare_rates(x1, t1, x2, t2, *, ci_level: float = 0.95) -> dict:
    """Rate 1 = x1 / t1 against rate 2 = x2 / t2 (see the module
    docstring). With no events at all there is nothing to compare: the
    rates and their CIs are reported and "test" says why there is no P.
    A rate ratio with x2 = 0 is unbounded above (null)."""
    x1, x2 = _count(x1, "events in group 1"), _count(x2, "events in group 2")
    t1 = _exposure(t1, "exposure of group 1")
    t2 = _exposure(t2, "exposure of group 2")
    if not 0 < ci_level < 1:
        raise ValueError("the confidence level must be between 0 and 1")
    out = {
        "groups": [
            {"events": x1, "exposure": t1, "rate": x1 / t1,
             "ci": rate_ci(x1, t1, ci_level)},
            {"events": x2, "exposure": t2, "rate": x2 / t2,
             "ci": rate_ci(x2, t2, ci_level)}],
        "ci_level": ci_level, "source": SOURCE,
    }
    n = x1 + x2
    if n == 0:
        out.update(rate_ratio=None, ratio_ci=None, p_two_tailed=None,
                   p_greater=None, p_less=None,
                   test="no events in either group: there is no ratio to "
                        "estimate and no test")
        return out
    p0 = t1 / (t1 + t2)
    two = stats.binomtest(x1, n, p0, alternative="two-sided")
    out["p_two_tailed"] = float(two.pvalue)
    out["p_greater"] = float(stats.binomtest(x1, n, p0,
                                             alternative="greater").pvalue)
    out["p_less"] = float(stats.binomtest(x1, n, p0,
                                          alternative="less").pvalue)
    ci = two.proportion_ci(confidence_level=ci_level, method="exact")
    scale = t2 / t1

    def odds(p):
        return None if p >= 1 else p / (1 - p) * scale
    out["rate_ratio"] = None if x2 == 0 else (x1 / t1) / (x2 / t2)
    out["ratio_ci"] = [odds(float(ci.low)), odds(float(ci.high))]
    out["n_events"] = n
    out["expected_fraction"] = p0
    out["test"] = "exact conditional"
    return out
