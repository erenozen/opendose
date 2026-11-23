"""Independent reference for the runs test at large n (FEATURE-PLAN P-10).

Run from the repository root:

    /home/eren/opendose/.venv/bin/python engine/tests/reference/runs_test_large_n.py

It writes engine/tests/reference/runs_test_large_n.json, which
engine/tests/test_runs_large_n.py reads (web/scripts/e2e-large.mjs asserts
the "e2e_xy" numbers in the linear regression results at display
precision). Nothing here imports opendose.

The null distribution of the number of runs R among n1 positive and n2
negative signs (Wald & Wolfowitz 1940; Swed & Eisenhart 1943; Bradley
1968, Distribution-Free Statistical Tests, ch. 11):

    P(R = 2k)   = 2 C(n1-1, k-1) C(n2-1, k-1) / C(N, n1)
    P(R = 2k+1) = [C(n1-1, k) C(n2-1, k-1) + C(n1-1, k-1) C(n2-1, k)]
                  / C(N, n1).

Three computations of P(R <= r), each independent of the engine:
  1. brute force over every arrangement (N <= 14): checks the formula;
  2. fractions.Fraction with math.comb (exact rationals, N <= 3,000);
  3. decimal.Decimal at 60 significant digits, binomials by the ratio
     recurrence C(n, k) = C(n, k-1) (n - k + 1) / k, normalised by
     C(N, n1) from math.comb (exact integer); used up to N = 500,000.
The Wald-Wolfowitz normal approximation (mean 2 n1 n2 / N + 1, variance
2 n1 n2 (2 n1 n2 - N) / (N^2 (N - 1)), by hand and by statsmodels'
Runs.runs_test) is recorded beside each case to show why the engine does
not use it: it misses the exact P by up to 1.7e-3 at N = 500,000 when
one sign is 10% of the residuals, so it does not agree at the four
significant digits the results show.

"e2e_xy" rebuilds the XY table that web/scripts/e2e-large.mjs pastes
(500,000 rows, its seeded Lehmer generator and toFixed(3) text, after the
column table's 1,000,000 draws), fits the line with statsmodels OLS and
runs the test on the residual signs in row order.
"""

from __future__ import annotations

import itertools
import json
import math
import sys
from decimal import ROUND_HALF_UP, Decimal, getcontext
from fractions import Fraction
from pathlib import Path

import numpy as np
from scipy import stats
from statsmodels.regression.linear_model import OLS
from statsmodels.sandbox.stats.runs import Runs

OUT = Path(__file__).with_suffix(".json")
sys.set_int_max_str_digits(0)
getcontext().prec = 60
getcontext().Emax = 999_999_999
getcontext().Emin = -999_999_999


def count_runs(signs):
    s = [v for v in signs if v != 0]
    n1 = sum(1 for v in s if v > 0)
    n2 = len(s) - n1
    runs = 1 + sum(1 for a, b in zip(s, s[1:]) if a != b) if s else 0
    return runs, n1, n2


def p_brute(n1, n2, r):
    """Share of all C(N, n1) arrangements with at most r runs."""
    n = n1 + n2
    hit = total = 0
    for pos in itertools.combinations(range(n), n1):
        seq = [-1] * n
        for i in pos:
            seq[i] = 1
        total += 1
        hit += count_runs(seq)[0] <= r
    return Fraction(hit, total)


def _terms_exact(n1, n2):
    c = math.comb
    for j in range(2, 2 * min(n1, n2) + 2):
        if j % 2 == 0:
            k = j // 2
            t = 2 * c(n1 - 1, k - 1) * c(n2 - 1, k - 1)
        else:
            k = (j - 1) // 2
            t = c(n1 - 1, k) * c(n2 - 1, k - 1) + c(n1 - 1, k - 1) * c(n2 - 1, k)
        yield j, t


def p_fraction(n1, n2, r):
    return Fraction(sum(t for j, t in _terms_exact(n1, n2) if j <= r),
                    math.comb(n1 + n2, n1))


def _comb_row(n):
    """C(n, k) for k = 0 .. n as Decimals, by the ratio recurrence."""
    out = [Decimal(1)]
    for k in range(1, n + 1):
        out.append(out[-1] * (n - k + 1) / k)
    return out


def p_decimal(n1, n2, r):
    a, b = _comb_row(n1 - 1), _comb_row(n2 - 1)
    ca = lambda k: a[k] if 0 <= k < len(a) else Decimal(0)  # noqa: E731
    cb = lambda k: b[k] if 0 <= k < len(b) else Decimal(0)  # noqa: E731
    low = total = Decimal(0)
    for j in range(2, 2 * min(n1, n2) + 2):
        if j % 2 == 0:
            k = j // 2
            t = 2 * ca(k - 1) * cb(k - 1)
        else:
            k = (j - 1) // 2
            t = ca(k) * cb(k - 1) + ca(k - 1) * cb(k)
        total += t
        if j <= r:
            low += t
    denom = Decimal(math.comb(n1 + n2, n1))
    # the terms must add up to C(N, n1) (a check of the recurrence)
    assert abs(total / denom - 1) < Decimal("1e-40"), (n1, n2)
    return low / denom


def wald_wolfowitz(n1, n2, r):
    n = n1 + n2
    mu = 2.0 * n1 * n2 / n + 1
    var = 2.0 * n1 * n2 * (2.0 * n1 * n2 - n) / (n * n * (n - 1.0))
    z = (r - mu) / math.sqrt(var)
    return {"z": z, "p_lower": float(stats.norm.cdf(z)),
            "p_lower_continuity": float(stats.norm.cdf((r + 0.5 - mu) / math.sqrt(var)))}


def statsmodels_z(signs):
    x = np.array([1 if v > 0 else 0 for v in signs if v != 0])
    z, _ = Runs(x).runs_test(correction=False)
    return float(z)


def case(name, signs, how):
    r, n1, n2 = count_runs(signs)
    p = {"fraction": lambda: float(p_fraction(n1, n2, r)),
         "decimal": lambda: float(p_decimal(n1, n2, r))}[how]()
    ww = wald_wolfowitz(n1, n2, r)
    ww["z_statsmodels"] = statsmodels_z(signs)
    return {"name": name, "n_runs": r, "n_positive": n1, "n_negative": n2,
            "p": p, "method": how, "wald_wolfowitz": ww}


def lehmer(seed):
    while True:
        seed = (seed * 16807) % 2147483647
        yield seed / 2147483647


def to_fixed3(v):
    """JavaScript's Number.prototype.toFixed(3) for v >= 0: the exact
    binary value rounded to 3 decimals, ties up."""
    return str(Decimal(v).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP))


def e2e_xy(n=500_000):
    g = lehmer(11)
    for _ in range(2 * n):  # the column table's draws come first
        next(g)
    xs, ys = [], []
    for i in range(n):
        xs.append(float(to_fixed3(i / 1000)))
        ys.append(float(to_fixed3(2 + 0.5 * i / 1000 + next(g))))
    x, y = np.array(xs), np.array(ys)
    fit = OLS(y, np.column_stack([np.ones(n), x])).fit()
    signs = np.sign(fit.resid).tolist()
    out = case("e2e_xy", signs, "decimal")
    out.update({"rows": n, "slope": float(fit.params[1]),
                "intercept": float(fit.params[0]),
                "r_squared": float(fit.rsquared)})
    return out


def main():
    rng = np.random.default_rng(20261123)
    brute = []
    for n1, n2 in [(1, 1), (1, 3), (2, 2), (3, 4), (5, 5), (4, 9), (7, 7)]:
        for r in range(2, 2 * min(n1, n2) + 2):
            brute.append({"n1": n1, "n2": n2, "r": r,
                          "p": float(p_brute(n1, n2, r)),
                          "p_fraction": float(p_fraction(n1, n2, r))})
    moderate = []
    for n, share in [(2000, 0.5), (2001, 0.5), (2001, 0.1), (3000, 0.3)]:
        signs = np.where(rng.random(n) < share, 1, -1).tolist()
        moderate.append(case(f"n{n}_share{share}", signs, "fraction"))
        moderate[-1]["seed_index"] = len(moderate) - 1
    large = []
    for n, share in [(200_000, 0.5), (500_000, 0.5), (500_000, 0.1)]:
        signs = np.where(rng.random(n) < share, 1, -1).tolist()
        large.append(case(f"n{n}_share{share}", signs, "decimal"))
    # fewer runs than chance (residuals that follow a curve a little): a
    # sign repeats with probability 0.503 instead of 0.5
    stay = rng.random(200_000) < 0.503
    signs, s = [], 1
    for keep in stay:
        s = s if keep else -s
        signs.append(s)
    large.append(case("n200000_persist0.503", signs, "decimal"))
    OUT.write_text(json.dumps({
        "generator": "numpy default_rng(20261123): moderate cases in order, "
                     "then large; signs = where(rng.random(n) < share, 1, -1)",
        "brute": brute, "moderate": moderate, "large": large,
        "e2e_xy": e2e_xy()}, indent=1) + "\n")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
