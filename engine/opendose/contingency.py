"""Contingency table analysis (Prism: Analyze -> Contingency).

Prism statistics guide, "Contingency tables":
- 2x2: Fisher's exact test (recommended) or chi-square with/without
  Yates' continuity correction; relative risk and odds ratio with CIs
  (log/Woolf method); difference between proportions; sensitivity &
  specificity with 95% CIs (Wilson).
- Larger tables: chi-square test for independence (+ df).
Rows are outcomes/exposures with counts; layout [[a, b], [c, d]] for 2x2
where row = group, column = outcome.

Every table also reports the expected counts under independence
("expected", row total x column total / N), the Pearson residuals
(O - E) / sqrt(E) and the adjusted standardized residuals
(O - E) / sqrt(E (1 - row/N) (1 - col/N)) (Agresti 2002, sec. 3.3.1; R's
chisq.test()$stdres).

Fisher's exact test. 2 x 2: two-sided P (tables no more probable than the
observed one), both one-sided P values, and R fisher.test's conditional
maximum-likelihood odds ratio (the MLE of the noncentral hypergeometric
distribution) with its exact conditional confidence interval (two-sided,
and the one-sided bounds). Larger tables (Freeman-Halton extension; Prism
offers Fisher's test for 2 x 2 tables only): the exact P, i.e. the sum of
the hypergeometric probabilities of every table with the observed margins
that is no more probable than the observed table (relative tolerance
1e-7, as R), computed with the network algorithm of Mehta & Patel (1983,
JASA 78:427): columns are filled one at a time, nodes are the remaining
row totals (merged when they are equal as multisets, together with equal
past probabilities), and the exact longest and shortest remaining paths
decide whole subtrees at once (every completion counts, or none does);
the total probability of a subtree has the closed form
S! / (prod s_i! prod c_j!). A work limit keeps it interactive: beyond it
the exact P is not reported (use the chi-square test, or ask for the
larger budget with fisher_rxc=True).

"effect_size" (opendose.effectsize): phi (signed for 2 x 2), Cramer's V
with a noncentral chi-square CI, the bias-corrected V (Bergsma 2013) and
Cohen's w with its conventional label; for 2 x 2 tables also the odds
ratio label of Chen, Cohen & Chen (2010).
"""

from __future__ import annotations

import bisect
import math

import numpy as np
from scipy import optimize, special, stats

from . import effectsize

#: work limits of the r x c exact test (table moves enumerated; ~0.25 s per
#: 100 000 in CPython): the default run inside every contingency analysis
#: stays under ~0.3 s; fisher_rxc=True allows the larger one (~10 s)
FISHER_RXC_AUTO_WORK = 100_000
FISHER_RXC_MAX_WORK = 4_000_000


def _wilson_ci(k: int, n: int, ci_level: float = 0.95) -> list:
    z = stats.norm.ppf((1 + ci_level) / 2)
    p = k / n
    denom = 1 + z * z / n
    center = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return [center - half, center + half]


def contingency(table, *, yates: bool = True, ci_level: float = 0.95,
                fisher_rxc="auto") -> dict:
    """fisher_rxc (tables larger than 2 x 2): "auto" computes the exact P
    when it fits a small work budget, True with the large budget, False
    never."""
    grid = np.asarray(table, dtype=float)
    if grid.ndim != 2 or grid.shape[0] < 2 or grid.shape[1] < 2:
        raise ValueError("contingency table must be at least 2x2")
    if np.any(grid < 0):
        raise ValueError("counts must be non-negative")

    out: dict = {"rows": int(grid.shape[0]), "cols": int(grid.shape[1]),
                 "total": float(grid.sum())}

    chi2, p, dof, _ = stats.chi2_contingency(grid, correction=False)
    out["chi_square"] = {"chi2": float(chi2), "df": int(dof), "p": float(p)}
    out.update(_expected_and_residuals(grid))

    if grid.shape != (2, 2) and fisher_rxc is not False:
        if np.all(grid == np.round(grid)):
            budget = (FISHER_RXC_MAX_WORK if fisher_rxc is True
                      else FISHER_RXC_AUTO_WORK)
            try:
                p_exact = fisher_exact_rxc(grid.astype(int),
                                           max_work=budget)
                out["fisher_exact"] = {
                    "p": p_exact,
                    "method": "Freeman-Halton (exact, network algorithm)"}
            except ValueError as exc:
                out["fisher_exact"] = {"p": None, "note": str(exc)}

    if grid.shape == (2, 2):
        chi2_y, p_y, _, _ = stats.chi2_contingency(grid, correction=True)
        out["chi_square_yates"] = {"chi2": float(chi2_y), "p": float(p_y)}
        odds, p_fisher = stats.fisher_exact(grid.astype(int))
        out["fisher_exact"] = {"p": float(p_fisher)}
        if np.all(grid == np.round(grid)):
            out["fisher_exact"].update(
                fisher_2x2_conditional(grid.astype(int), ci_level=ci_level))
        if not yates:
            out["recommended_p"] = out["chi_square"]["p"]
        a, b = grid[0]
        c, d = grid[1]
        z = stats.norm.ppf((1 + ci_level) / 2)

        if all(v > 0 for v in (a, b, c, d)):
            or_val = (a * d) / (b * c)
            se_log_or = math.sqrt(1 / a + 1 / b + 1 / c + 1 / d)
            out["odds_ratio"] = {
                "value": float(or_val),
                "ci": [float(or_val * math.exp(-z * se_log_or)),
                       float(or_val * math.exp(z * se_log_or))],
            }
        else:
            out["odds_ratio"] = None

        p1 = a / (a + b) if a + b > 0 else None
        p2 = c / (c + d) if c + d > 0 else None
        if p1 is not None and p2 is not None:
            out["proportions"] = {"p1": float(p1), "p2": float(p2),
                                  "difference": float(p1 - p2)}
            if p2 > 0 and a > 0 and c > 0:
                rr = p1 / p2
                se_log_rr = math.sqrt((1 - p1) / a + (1 - p2) / c)
                out["relative_risk"] = {
                    "value": float(rr),
                    "ci": [float(rr * math.exp(-z * se_log_rr)),
                           float(rr * math.exp(z * se_log_rr))],
                }
            else:
                out["relative_risk"] = None
            # sensitivity/specificity when columns = test result
            # (row0 = condition present, row1 = absent)
            if a + b > 0 and c + d > 0:
                out["sensitivity"] = {"value": float(a / (a + b)),
                                      "ci": _wilson_ci(int(a), int(a + b), ci_level)}
                out["specificity"] = {"value": float(d / (c + d)),
                                      "ci": _wilson_ci(int(d), int(c + d), ci_level)}
    es = effectsize.safe(effectsize.phi_cramers_v, grid, ci_level=ci_level)
    if es is not None and out.get("odds_ratio"):
        es["odds_ratio_interpretation"] = effectsize.odds_ratio_label(
            out["odds_ratio"]["value"])
    out["effect_size"] = es
    return out


# ------------------------------------------------ expected and residuals

def _expected_and_residuals(grid) -> dict:
    n = grid.sum()
    rows, cols = grid.sum(axis=1), grid.sum(axis=0)
    expected = np.outer(rows, cols) / n if n > 0 else np.zeros_like(grid)
    with np.errstate(divide="ignore", invalid="ignore"):
        pearson = (grid - expected) / np.sqrt(expected)
        adj = (grid - expected) / np.sqrt(
            expected * np.outer(1 - rows / n, 1 - cols / n))

    def clean(a):
        return [[float(v) if np.isfinite(v) else None for v in row]
                for row in a]
    return {"expected": clean(expected),
            "residuals_pearson": clean(pearson),
            "residuals_standardized": clean(adj)}


# ------------------------------------------- Fisher's exact test, 2 x 2

def fisher_2x2_conditional(table, *, ci_level: float = 0.95) -> dict:
    """One-sided P values, the conditional MLE odds ratio and its exact
    conditional CIs for a 2 x 2 table [[a, b], [c, d]] (R fisher.test's
    algorithm, with the roots found to full precision)."""
    t = np.asarray(table, dtype=int)
    x = int(t[0, 0])
    m, n = int(t[:, 0].sum()), int(t[:, 1].sum())
    k = int(t[0].sum())
    lo, hi = max(0, k - n), min(k, m)
    support = np.arange(lo, hi + 1)
    logdc = stats.hypergeom.logpmf(support, m + n, m, k)

    def dnhyper(ncp):
        d = logdc + math.log(ncp) * support
        d = np.exp(d - d.max())
        return d / d.sum()

    def mnhyper(ncp):
        if ncp == 0:
            return lo
        if math.isinf(ncp):
            return hi
        return float(np.sum(support * dnhyper(ncp)))

    def pnhyper(q, ncp, upper=False):
        if ncp == 1:
            return float(stats.hypergeom.sf(q - 1, m + n, m, k) if upper
                         else stats.hypergeom.cdf(q, m + n, m, k))
        d = dnhyper(ncp)
        return float(d[support >= q].sum() if upper
                     else d[support <= q].sum())

    def root(f, a, b):
        return optimize.brentq(f, a, b, xtol=1e-15, rtol=4 * np.finfo(float).eps,
                               maxiter=500)

    tiny = np.finfo(float).eps

    def mle():
        if x == lo:
            return 0.0
        if x == hi:
            return math.inf
        mu = mnhyper(1.0)
        if mu > x:
            return root(lambda u: mnhyper(u) - x, tiny, 1.0)
        if mu < x:
            return 1.0 / root(lambda u: mnhyper(1.0 / u) - x, tiny, 1.0)
        return 1.0

    def ncp_upper(alpha):
        if x == hi:
            return math.inf
        p = pnhyper(x, 1.0)
        if p < alpha:
            return root(lambda u: pnhyper(x, u) - alpha, tiny, 1.0)
        if p > alpha:
            return 1.0 / root(lambda u: pnhyper(x, 1.0 / u) - alpha, tiny,
                              1.0)
        return 1.0

    def ncp_lower(alpha):
        if x == lo:
            return 0.0
        p = pnhyper(x, 1.0, upper=True)
        if p > alpha:
            return root(lambda u: pnhyper(x, u, upper=True) - alpha, tiny,
                        1.0)
        if p < alpha:
            return 1.0 / root(lambda u: pnhyper(x, 1.0 / u, upper=True)
                              - alpha, tiny, 1.0)
        return 1.0

    alpha = 1.0 - ci_level
    out = {"p_less": pnhyper(x, 1.0), "p_greater": pnhyper(x, 1.0, True)}
    try:
        out["odds_ratio_conditional_mle"] = mle()
        out["ci_conditional"] = [ncp_lower(alpha / 2), ncp_upper(alpha / 2)]
        out["ci_conditional_less"] = [0.0, ncp_upper(alpha)]
        out["ci_conditional_greater"] = [ncp_lower(alpha), math.inf]
    except (ValueError, RuntimeError):
        pass
    return out


# ------------------------------------------- Fisher's exact test, r x c

def fisher_exact_rxc(table, *, max_work: int = FISHER_RXC_MAX_WORK) -> float:
    """Exact P of Fisher's test for an r x c table (module docstring)."""
    t = np.asarray(table, dtype=np.int64)
    if np.any(t < 0):
        raise ValueError("counts must be non-negative")
    t = t[t.sum(axis=1) > 0][:, t.sum(axis=0) > 0]
    if t.shape[0] < 2 or t.shape[1] < 2:
        return 1.0
    if t.shape[0] > t.shape[1]:
        t = t.T                      # nodes hold the shorter margin
    rows = [int(v) for v in t.sum(axis=1)]
    cols = [int(v) for v in sorted(t.sum(axis=0), reverse=True)]
    n_tot = int(t.sum())
    c = len(cols)
    lf = [float(v) for v in special.gammaln(np.arange(n_tot + 2) + 1.0)]
    log_k = sum(lf[v] for v in rows) + sum(lf[v] for v in cols) - lf[n_tot]
    thresh = (log_k - sum(lf[int(v)] for v in t.ravel())
              + math.log1p(1e-7))
    suffix_lf = [sum(lf[v] for v in cols[j:]) for j in range(c + 1)]
    work = [0]

    def tick(count=1):
        work[0] += count
        if work[0] > max_work:
            raise ValueError("table too large for the exact test (work "
                             "limit reached); use the chi-square test")

    move_cache: dict = {}

    def moves(j, s):
        """[(remaining row totals after column j, sorted; log weight
        -sum log x_i!)] for every way to fill column j."""
        key = (j, s)
        got = move_cache.get(key)
        if got is not None:
            return got
        out = []
        cj, n = cols[j], len(s)
        suf = [0] * (n + 1)
        for i in range(n - 1, -1, -1):
            suf[i] = suf[i + 1] + s[i]
        x = [0] * n

        def rec(i, left):
            if i == n - 1:
                if left <= s[i]:
                    x[i] = left
                    out.append((tuple(sorted(a - b for a, b in zip(s, x))),
                                -sum(lf[q] for q in x)))
                return
            for v in range(max(0, left - suf[i + 1]), min(left, s[i]) + 1):
                x[i] = v
                rec(i + 1, left - v)
        rec(0, cj)
        tick(len(out))
        move_cache[key] = out
        return out

    path_cache: dict = {}

    def longest_shortest(j, s):
        key = (j, s)
        got = path_cache.get(key)
        if got is not None:
            return got
        if j == c - 1:
            v = -sum(lf[q] for q in s)
            got = (v, v)
        else:
            hi, lo = -math.inf, math.inf
            for ns, w in moves(j, s):
                h, low = longest_shortest(j + 1, ns)
                hi = max(hi, w + h)
                lo = min(lo, w + low)
            got = (hi, lo)
        path_cache[key] = got
        return got

    last_cache: dict = {}

    def last_two(s):
        got = last_cache.get(s)
        if got is None:
            vals = sorted(w - sum(lf[q] for q in ns)
                          for ns, w in moves(c - 2, s))
            vmax = vals[-1]
            pref = [0.0]
            for v in vals:
                pref.append(pref[-1] + math.exp(v - vmax))
            got = (vals, vmax, pref)
            last_cache[s] = got
        return got

    p = 0.0
    stage = {tuple(sorted(rows)): {round(log_k, 9): [log_k, 1.0]}}
    for j in range(c - 1):
        nxt: dict = {}
        for s, pasts in stage.items():
            tot = lf[sum(s)] - sum(lf[q] for q in s) - suffix_lf[j]
            hi, lo = longest_shortest(j, s)
            for past, wgt in pasts.values():
                if past + hi <= thresh:      # every completion counts
                    p += wgt * math.exp(past + tot)
                    continue
                if past + lo > thresh:       # none does
                    continue
                if j == c - 2:               # the last column is forced
                    vals, vmax, pref = last_two(s)
                    kk = bisect.bisect_right(vals, thresh - past)
                    p += wgt * math.exp(past + vmax) * pref[kk]
                    tick()
                    continue
                mv = moves(j, s)
                for ns, w in mv:
                    np_ = past + w
                    d = nxt.get(ns)
                    if d is None:
                        d = nxt[ns] = {}
                    key = round(np_, 9)
                    e = d.get(key)
                    if e is None:
                        d[key] = [np_, wgt]
                    else:
                        e[1] += wgt
                tick(len(mv))
        stage = nxt
    return float(min(p, 1.0))
