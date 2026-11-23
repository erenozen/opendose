"""Correlation (Prism: Analyze -> Correlation).

Prism statistics guide, "Correlation": Pearson r (assumes Gaussian
scatter) or nonparametric Spearman rs; two-tailed P; 95% CI of r via the
Fisher z transformation; R squared reported for Pearson.
Spearman CI uses the Fisher z approach with the Fieller-Hartley-Pearson
variance sqrt(1.06/(n-3)), the standard approximation.
"effect_size" adds r^2 (rs^2) with the interval of the squared limits
(lower limit 0 when the r interval spans zero) and Cohen's (1988) label
(opendose.effectsize).

Kendall's tau (not a Prism option; R's cor.test(method = "kendall")):
tau-b, S = concordant - discordant pairs, and with no ties and n < 50
the exact P from the distribution of the number of inversions of a
random permutation (Mahonian numbers; Kendall 1938); otherwise the
normal approximation with the tie-corrected variance of S (Kendall 1970,
eq. 4.4; no continuity correction, as R). T = the number of concordant
pairs (R's statistic in the exact case).

One-sided results (every method): "p_greater" / "p_less" and the
one-sided confidence bounds "ci_r_greater" = [lower, 1] and
"ci_r_less" = [-1, upper] (Fisher z with the one-sided critical value,
as R's cor.test with alternative = "greater" / "less"); for Spearman
with 17 pairs or fewer the one-sided P values are exact as well.

Spearman P value. The guide ("Interpreting results: Correlation") states
that with 17 or fewer XY pairs the P value is exact, computed from all
possible permutations of the data, and that the exact calculation
handles ties; with 18 or more pairs P comes from the t ratio
t = rs sqrt((n-2)/(1-rs^2)) on n-2 df. GraphPad FAQ 1982 adds that with
ties the permutation distribution is not symmetrical, so the two-tailed
P is not twice the one-tailed P (exact values validated against
StatXact). Here the exact P is the fraction of the n! pairings of the
(mid)ranks whose |rs| is at least the observed |rs| (two-tailed), or
whose rs is at least as extreme in the observed direction (one-tailed).

The n! pairings are counted, not enumerated: S = sum_i a_i b_pi(i) for
integer scores a, b (twice the midranks) has its distribution built by
dynamic programming over the set of b's already assigned (the
partial-permutation recursion behind the permanent generating function
of Spearman's statistic; cf. van de Wiel & Di Bucchianico 2001, J Stat
Plan Inference 92:133). For n = 17 that is 2^17 states, each holding a
count vector; positions are taken in order of |a - median| so the
vectors stay short, and each layer uses the narrowest integer type its
proven row bound allows. Counts are exact integers.
"""

from __future__ import annotations

import math
from functools import lru_cache

import numpy as np
from scipy import stats

from . import effectsize, orderstats

SPEARMAN_EXACT_MAX_N = 17


def _pairs(values_a, values_b):
    if (isinstance(values_a, np.ndarray) and isinstance(values_b, np.ndarray)
            and values_a.dtype == float and values_b.dtype == float
            and values_a.ndim == values_b.ndim == 1
            and values_a.size == values_b.size):
        # float arrays hold no blanks: the same pairs, without a Python
        # loop over every value (correlation matrices of large tables)
        return values_a.copy(), values_b.copy()
    pairs = [(float(a), float(b)) for a, b in zip(values_a, values_b)
             if a is not None and b is not None]
    return (np.array([p[0] for p in pairs]), np.array([p[1] for p in pairs]))


def _fisher_ci(r: float, n: int, sd_z: float, ci_level: float) -> list | None:
    if n < 4 or abs(r) >= 1:
        return None
    z = math.atanh(r)
    zcrit = stats.norm.ppf((1 + ci_level) / 2)
    return [math.tanh(z - zcrit * sd_z), math.tanh(z + zcrit * sd_z)]


def _one_sided_bounds(r: float, n: int, sd_z: float, ci_level: float):
    """(ci_r_greater, ci_r_less): one-sided Fisher-z confidence bounds."""
    if n < 4 or abs(r) >= 1:
        return None, None
    z = math.atanh(r)
    zc = stats.norm.ppf(ci_level)
    return ([math.tanh(z - zc * sd_z), 1.0],
            [-1.0, math.tanh(z + zc * sd_z)])


def correlate(values_a, values_b, *, method: str = "pearson",
              ci_level: float = 0.95) -> dict:
    a, b = _pairs(values_a, values_b)
    n = int(a.size)
    if n < 3:
        raise ValueError("correlation needs at least 3 XY pairs")
    if method == "pearson":
        r, p = stats.pearsonr(a, b)
        r = float(r)
        sd_z = 1 / math.sqrt(n - 3) if n > 3 else math.inf
        ci = _fisher_ci(r, n, sd_z, ci_level) if n >= 4 else None
        g, le = _one_sided_bounds(r, n, sd_z, ci_level)
        df = n - 2
        t = r * math.sqrt(df / (1 - r * r)) if abs(r) < 1 else \
            math.copysign(math.inf, r)
        return {"method": "pearson", "n": n, "r": r,
                "ci_r": ci, "r_squared": float(r * r),
                "p_two_tailed": float(p), "t": t, "df": df,
                "p_greater": float(stats.t.sf(t, df)),
                "p_less": float(stats.t.cdf(t, df)),
                "ci_r_greater": g, "ci_r_less": le,
                "effect_size": _r_effect(r, ci)}
    if method == "spearman":
        rs, p = stats.spearmanr(a, b)
        rs = float(rs)
        p_type = "approximate"
        df = n - 2
        t = rs * math.sqrt(df / (1 - rs * rs)) if abs(rs) < 1 else \
            math.copysign(math.inf, rs)
        p_g, p_l = float(stats.t.sf(t, df)), float(stats.t.cdf(t, df))
        if n <= SPEARMAN_EXACT_MAX_N and math.isfinite(rs):
            p, p_type = spearman_exact_p(a, b), "exact"
            p_g = spearman_exact_p(a, b, alternative="greater")
            p_l = spearman_exact_p(a, b, alternative="less")
        sd_z = math.sqrt(1.06 / (n - 3)) if n > 3 else math.inf
        ci = _fisher_ci(rs, n, sd_z, ci_level) if n >= 4 else None
        g, le = _one_sided_bounds(rs, n, sd_z, ci_level)
        return {"method": "spearman", "n": n, "r": rs,
                "ci_r": ci, "p_two_tailed": float(p), "p_type": p_type,
                "p_greater": p_g, "p_less": p_l,
                "S": float((n ** 3 - n) * (1 - rs) / 6),
                "ci_r_greater": g, "ci_r_less": le,
                "effect_size": _r_effect(rs, ci)}
    if method == "kendall":
        return kendall(a, b, ci_level=ci_level)
    raise ValueError(f"unknown correlation method: {method}")


# ------------------------------------------------------- Kendall's tau

KENDALL_EXACT_MAX_N = 49
# Large-data threshold: up to this many pairs the n x n sign matrices are
# built (the original method); above it the concordant / discordant
# counts come from an O(n log^2 n) inversion count (identical integers).
KENDALL_DIRECT_MAX_N = 1000


@lru_cache(maxsize=64)
def _mahonian(n: int) -> tuple:
    """Number of permutations of n items with k inversions, k = 0 ..
    n(n-1)/2 (exact integers)."""
    counts = [1]
    for m in range(2, n + 1):
        new = [0] * (len(counts) + m - 1)
        run = 0
        for k in range(len(new)):
            run += counts[k] if k < len(counts) else 0
            if k - m >= 0:
                run -= counts[k - m]
            new[k] = run
        counts = new
    return tuple(counts)


def _tie_sizes(v):
    _, c = np.unique(v, return_counts=True)
    return c[c > 1].astype(float)


def kendall(values_a, values_b, *, ci_level: float = 0.95) -> dict:
    """Kendall's tau-b with exact (no ties, n < 50) or normal-approximation
    P values (module docstring)."""
    a, b = _pairs(values_a, values_b)
    n = int(a.size)
    if n < 3:
        raise ValueError("correlation needs at least 3 XY pairs")
    if n <= KENDALL_DIRECT_MAX_N:
        da = np.sign(a[:, None] - a[None, :])
        db = np.sign(b[:, None] - b[None, :])
        iu = np.triu_indices(n, 1)
        prod = (da * db)[iu]
        conc, disc = int(np.sum(prod > 0)), int(np.sum(prod < 0))
    else:
        # same integer counts without the n x n sign matrices (Knight
        # 1966 merge-sort count; opendose.orderstats.count_discordant)
        counts = orderstats.count_discordant(a, b)
        conc, disc = counts["concordant"], counts["discordant"]
    S = conc - disc
    n0 = n * (n - 1) / 2
    tx, ty = _tie_sizes(a), _tie_sizes(b)
    n1 = float(np.sum(tx * (tx - 1)) / 2)
    n2 = float(np.sum(ty * (ty - 1)) / 2)
    den = math.sqrt((n0 - n1) * (n0 - n2))
    tau = S / den if den > 0 else math.nan
    out = {"method": "kendall", "n": n, "r": tau, "tau": tau,
           "S": float(S), "concordant": conc, "discordant": disc}
    # normal approximation (tie-corrected variance of S)
    v0 = n * (n - 1) * (2 * n + 5)
    vt = float(np.sum(tx * (tx - 1) * (2 * tx + 5)))
    vu = float(np.sum(ty * (ty - 1) * (2 * ty + 5)))
    v1 = float(np.sum(tx * (tx - 1)) * np.sum(ty * (ty - 1)))
    v2 = float(np.sum(tx * (tx - 1) * (tx - 2))
               * np.sum(ty * (ty - 1) * (ty - 2)))
    var_s = (v0 - vt - vu) / 18 + v1 / (2 * n * (n - 1))
    if n > 2:
        var_s += v2 / (9 * n * (n - 1) * (n - 2))
    z = S / math.sqrt(var_s) if var_s > 0 else math.nan
    approx = {"z": z, "p_two_tailed": float(2 * stats.norm.sf(abs(z))),
              "p_greater": float(stats.norm.sf(z)),
              "p_less": float(stats.norm.cdf(z))}
    out["normal_approximation"] = approx
    if n <= KENDALL_EXACT_MAX_N and not tx.size and not ty.size:
        counts = _mahonian(n)          # by number of inversions
        total = math.factorial(n)
        q = conc                       # concordant = n0 - inversions

        def cdf(k):                    # P(T <= k), T = concordant pairs
            if k < 0:
                return 0.0
            k = min(k, int(n0))
            # T <= k  <=>  inversions >= n0 - k
            return sum(counts[int(n0) - k:]) / total
        p_less = cdf(q)
        p_greater = 1.0 - cdf(q - 1)
        out.update({"T": q, "p_type": "exact",
                    "p_two_tailed": min(1.0, 2 * min(p_less, p_greater)),
                    "p_greater": p_greater, "p_less": p_less})
    else:
        out.update({"p_type": "approximate", "z": z,
                    "p_two_tailed": approx["p_two_tailed"],
                    "p_greater": approx["p_greater"],
                    "p_less": approx["p_less"]})
    # CI of tau: Fisher z with the Fieller-Hartley-Pearson variance
    # 0.437/(n-4) (Fieller, Hartley & Pearson 1957)
    if n > 4 and math.isfinite(tau):
        sd_z = math.sqrt(0.437 / (n - 4))
        out["ci_r"] = _fisher_ci(tau, n, sd_z, ci_level)
        out["ci_r_greater"], out["ci_r_less"] = _one_sided_bounds(
            tau, n, sd_z, ci_level)
    else:
        out["ci_r"] = out["ci_r_greater"] = out["ci_r_less"] = None
    out["effect_size"] = _r_effect(tau, out["ci_r"])
    return out


# ------------------------------------------------- partial correlation

def partial_correlation(values_x, values_y, covariates, *,
                        method: str = "pearson",
                        ci_level: float = 0.95) -> dict:
    """Partial correlation of x and y controlling for the covariates:
    the Pearson r of the residuals of x and of y after least-squares
    regression on the covariates (with an intercept), on the rows where
    x, y and every covariate are present (Fisher 1924, Metron 3:329;
    the residual definition of pingouin.partial_corr and R ppcor::pcor).
    method='spearman' ranks x, y and the covariates first. With k
    covariates: t = r sqrt(df / (1 - r^2)) on df = n - 2 - k, two-tailed
    P from t; CI by Fisher z with SE 1 / sqrt(n - 3 - k)."""
    if method not in ("pearson", "spearman"):
        raise ValueError("partial correlation is computed for Pearson or "
                         "Spearman r")
    covs = [list(c) for c in covariates]
    k = len(covs)

    def present(col, i):
        return i < len(col) and col[i] is not None \
            and not (isinstance(col[i], float) and math.isnan(col[i]))

    rows = [i for i in range(len(values_x))
            if present(values_x, i) and present(values_y, i)
            and all(present(c, i) for c in covs)]
    n = len(rows)
    if n < k + 3:
        raise ValueError(f"partial correlation controlling for {k} "
                         f"variable{'s' if k != 1 else ''} needs at least "
                         f"{k + 3} complete rows; {n} found")
    x = np.array([float(values_x[i]) for i in rows])
    y = np.array([float(values_y[i]) for i in rows])
    Z = np.array([[float(c[i]) for c in covs] for i in rows]).reshape(n, k)
    if method == "spearman":
        x, y = stats.rankdata(x), stats.rankdata(y)
        Z = np.column_stack([stats.rankdata(Z[:, j]) for j in range(k)]) \
            if k else Z
    for j in range(k):
        if np.ptp(Z[:, j]) == 0:
            raise ValueError("a control variable is constant on the rows "
                             "used, so it cannot be controlled for")
    D = np.column_stack([np.ones(n), Z])
    if np.linalg.matrix_rank(D) < k + 1:
        raise ValueError("the control variables are collinear (one is a "
                         "linear combination of the others)")
    rx = x - D @ np.linalg.lstsq(D, x, rcond=None)[0]
    ry = y - D @ np.linalg.lstsq(D, y, rcond=None)[0]
    sx, sy = float(np.sqrt(rx @ rx)), float(np.sqrt(ry @ ry))
    scale_x = float(np.sqrt(np.sum((x - x.mean()) ** 2)))
    scale_y = float(np.sqrt(np.sum((y - y.mean()) ** 2)))
    if sx <= 1e-12 * max(scale_x, 1e-300) or sy <= 1e-12 * max(scale_y,
                                                                 1e-300):
        raise ValueError("the control variables explain x or y exactly, so "
                         "the partial correlation is undefined")
    r = float(np.clip((rx @ ry) / (sx * sy), -1.0, 1.0))
    df = n - 2 - k
    t = r * math.sqrt(df / (1 - r * r)) if abs(r) < 1 else \
        math.copysign(math.inf, r)
    sd_z = 1 / math.sqrt(n - 3 - k) if n - 3 - k > 0 else math.inf
    ci = None
    if n - 3 - k > 0 and abs(r) < 1:
        zc = stats.norm.ppf((1 + ci_level) / 2)
        z = math.atanh(r)
        ci = [math.tanh(z - zc * sd_z), math.tanh(z + zc * sd_z)]
    return {"method": method, "n": n, "k": k, "r": r, "df": df, "t": t,
            "p_two_tailed": float(2 * stats.t.sf(abs(t), df)),
            "p_greater": float(stats.t.sf(t, df)),
            "p_less": float(stats.t.cdf(t, df)),
            "ci_r": ci}


# ------------------------------------------- comparing two correlations

def compare_independent(r1: float, n1: int, r2: float, n2: int) -> dict:
    """Two correlations from independent samples: Fisher's z test,
    z = (atanh r1 - atanh r2) / sqrt(1/(n1 - 3) + 1/(n2 - 3)), two-tailed
    P from the normal distribution (Fisher 1921, Metron 1:3; cocor's
    "fisher1925")."""
    if n1 < 4 or n2 < 4:
        raise ValueError("comparing two correlations needs at least 4 pairs "
                         "in each")
    if abs(r1) >= 1 or abs(r2) >= 1:
        raise ValueError("a correlation of exactly 1 or -1 has no Fisher z, "
                         "so it cannot be compared")
    z = (math.atanh(r1) - math.atanh(r2)) / math.sqrt(1 / (n1 - 3)
                                                      + 1 / (n2 - 3))
    return {"test": "fisher_z_independent", "r1": r1, "n1": n1, "r2": r2,
            "n2": n2, "difference": r1 - r2, "z": z,
            "p_two_tailed": float(2 * stats.norm.sf(abs(z)))}


def _steiger_z(r_a, r_b, psi, n):
    rbar = (r_a + r_b) / 2
    c = psi / (1 - rbar ** 2) ** 2
    return (math.atanh(r_a) - math.atanh(r_b)) * math.sqrt(n - 3) \
        / math.sqrt(2 - 2 * c), c


def compare_dependent_overlapping(r_jk: float, r_jh: float, r_kh: float,
                                  n: int) -> dict:
    """Two correlations on the same n subjects that share variable j
    (r_jk against r_jh): Steiger (1980, Psychol Bull 87:245, eq. 15) Z1*,
    Fisher z of each r, their asymptotic covariance from the Pearson-
    Filon formula with both r replaced by their mean r̄:
    c = [r_kh (1 - 2 r̄²) - r̄² (1 - 2 r̄² - r_kh²) / 2] / (1 - r̄²)²,
    Z = (z_jk - z_jh) sqrt(n - 3) / sqrt(2 - 2c), two-tailed normal P."""
    if n < 4:
        raise ValueError("comparing two correlations needs at least 4 "
                         "subjects with every value")
    if max(abs(r_jk), abs(r_jh)) >= 1:
        raise ValueError("a correlation of exactly 1 or -1 has no Fisher z, "
                         "so it cannot be compared")
    rbar = (r_jk + r_jh) / 2
    psi = r_kh * (1 - 2 * rbar ** 2) \
        - 0.5 * rbar ** 2 * (1 - 2 * rbar ** 2 - r_kh ** 2)
    z, c = _steiger_z(r_jk, r_jh, psi, n)
    return {"test": "steiger_overlapping", "r1": r_jk, "r2": r_jh,
            "r_other": r_kh, "n": n, "difference": r_jk - r_jh,
            "covariance": c, "z": z,
            "p_two_tailed": float(2 * stats.norm.sf(abs(z)))}


def compare_dependent_nonoverlapping(r_jk: float, r_hm: float, r_jh: float,
                                     r_jm: float, r_kh: float, r_km: float,
                                     n: int) -> dict:
    """Two correlations on the same n subjects with no variable in common
    (r_jk against r_hm): Steiger (1980, eq. 14) Z2*, the Pearson-Filon
    covariance (Steiger eq. 3) with r_jk and r_hm replaced by their mean
    r̄, c = psi / (1 - r̄²)², Z = (z_jk - z_hm) sqrt(n - 3) / sqrt(2 - 2c)."""
    if n < 4:
        raise ValueError("comparing two correlations needs at least 4 "
                         "subjects with every value")
    if max(abs(r_jk), abs(r_hm)) >= 1:
        raise ValueError("a correlation of exactly 1 or -1 has no Fisher z, "
                         "so it cannot be compared")
    rb = (r_jk + r_hm) / 2
    psi = 0.5 * ((r_jh - rb * r_kh) * (r_km - r_kh * rb)
                 + (r_jm - r_jh * rb) * (r_kh - rb * r_jh)
                 + (r_jh - r_jm * rb) * (r_km - rb * r_jm)
                 + (r_jm - rb * r_km) * (r_kh - r_km * rb))
    z, c = _steiger_z(r_jk, r_hm, psi, n)
    return {"test": "steiger_nonoverlapping", "r1": r_jk, "r2": r_hm,
            "n": n, "difference": r_jk - r_hm, "covariance": c, "z": z,
            "p_two_tailed": float(2 * stats.norm.sf(abs(z)))}


# ------------------------------------------ repeated-measures correlation

def rm_corr(values_x, values_y, subjects, *, ci_level: float = 0.95) -> dict:
    """Repeated-measures correlation (Bakdash & Marusich 2017, Front
    Psychol 8:456; Bland & Altman 1995, BMJ 310:446): the common
    within-subject slope of an ANCOVA y ~ subject + x, as a correlation.
    With x and y centred on each subject's own means,
    r_rm = sum(x_w y_w) / sqrt(sum x_w^2 sum y_w^2), which equals
    sign(slope) sqrt(SS_x / (SS_x + SS_residual)) of that ANCOVA, on
    df = N - k - 1 (N pairs, k subjects); P from t = r sqrt(df / (1 -
    r^2)); CI by Fisher's z with SE 1 / sqrt(df - 1) (pingouin rm_corr;
    R rmcorr). It measures the association within subjects only, not
    between them. Pairs missing a value or a subject are left out;
    subjects with a single pair carry no within-subject information and
    are left out too (and counted)."""
    keep = [(float(x), float(y), str(s)) for x, y, s in
            zip(values_x, values_y, subjects)
            if x is not None and y is not None and s is not None
            and str(s).strip() != ""
            and math.isfinite(float(x)) and math.isfinite(float(y))]
    groups: dict = {}
    for x, y, s in keep:
        groups.setdefault(s.strip(), []).append((x, y))
    single = sorted(s for s, v in groups.items() if len(v) < 2)
    used = {s: v for s, v in groups.items() if len(v) >= 2}
    k = len(used)
    N = sum(len(v) for v in used.values())
    if k < 2:
        raise ValueError("repeated-measures correlation needs at least 2 "
                         "subjects with 2 or more XY pairs each")
    df = N - k - 1  # >= 1: every subject kept has 2 or more pairs
    xw, yw = [], []
    for v in used.values():
        a = np.array(v)
        xw.append(a[:, 0] - a[:, 0].mean())
        yw.append(a[:, 1] - a[:, 1].mean())
    xw, yw = np.concatenate(xw), np.concatenate(yw)
    sxx, syy = float(xw @ xw), float(yw @ yw)
    if not (sxx > 0 and syy > 0):
        raise ValueError("repeated-measures correlation is undefined: X or "
                         "Y does not vary within any subject")
    r = float(np.clip((xw @ yw) / math.sqrt(sxx * syy), -1.0, 1.0))
    slope = float((xw @ yw) / sxx)
    if abs(r) < 1:
        t = r * math.sqrt(df / (1 - r * r))
        p = float(2 * stats.t.sf(abs(t), df))
    else:
        t, p = math.copysign(math.inf, r), 0.0
    ci = None
    if df > 1 and abs(r) < 1:
        zc = float(stats.norm.ppf(0.5 + ci_level / 2))
        z, se = math.atanh(r), 1 / math.sqrt(df - 1)
        ci = [math.tanh(z - zc * se), math.tanh(z + zc * se)]
    return {"method": "rm_corr", "r": r, "df": int(df), "t": float(t),
            "p_two_tailed": p, "ci_r": ci, "ci_level": ci_level,
            "slope": slope, "n": int(N), "n_subjects": int(k),
            "subjects_single_pair": single,
            "pairs_left_out": len(values_x) - len(keep),
            "r_squared": r * r,
            "effect_size": _r_effect(r, ci),
            "scope": ("the association within subjects (the common "
                      "slope after removing each subject's mean); it says "
                      "nothing about whether subjects with higher X have "
                      "higher Y")}


def _r_effect(r, ci) -> dict:
    return {"r_squared": r * r if math.isfinite(r) else None,
            "ci_r_squared": effectsize.r_squared_interval(ci),
            "interpretation": effectsize.interpret(r, "r")}


# ------------------------------------------------- exact Spearman P value

@lru_cache(maxsize=4)
def _subset_layers(n: int):
    """Masks over n items grouped by popcount, and for every layer k and
    item j the rows of layer k lacking j with the rows of layer k+1 they
    move to when j is added."""
    masks = np.arange(1 << n, dtype=np.int64)
    pc = np.zeros(1 << n, dtype=np.int64)
    for j in range(n):
        pc += (masks >> j) & 1
    pos = np.zeros(1 << n, dtype=np.int64)
    layers = []
    for k in range(n + 1):
        lay = np.flatnonzero(pc == k)
        pos[lay] = np.arange(lay.size)
        layers.append(lay)
    trans = []
    for k in range(n):
        src = layers[k]
        tk = []
        for j in range(n):
            rows = np.flatnonzero(((src >> j) & 1) == 0)
            tk.append((rows.astype(np.intp),
                       pos[src[rows] | (1 << j)].astype(np.intp)))
        trans.append(tuple(tk))
    return tuple(lay.size for lay in layers), tuple(trans)


def _plans(a, b):
    """Ways to write sum_i a_i b_pi(i) = offset + scale * T for every pi,
    T = m * sum_{first} w_i v_pi(i) + sum_{last} w_i v_pi(i), with small
    integers w (positions, each stage ordered by |w|) and v >= 0.

    'plain' centres all of a at its median (m = 1, no 'last' stage).
    'split' is for doubled midranks where a few scores are odd (tied
    groups of even size): the even majority is processed first at half
    scale, the count vectors are then spread onto the doubled grid
    (m = 2) and the odd scores processed last, so the long vectors are
    not doubled for most of the recursion."""
    n = a.size
    bmin = int(b.min())
    v = b - bmin
    gb = int(np.gcd.reduce(v)) or 1
    v = v // gb
    amin = int(a.min())
    d = a - amin
    ga = int(np.gcd.reduce(d)) or 1
    d = d // ga

    def make(first, c, halve):
        omega = d - c
        a0 = amin + ga * c
        offset = n * a0 * bmin + a0 * gb * int(v.sum()) \
            + ga * bmin * int(omega.sum())
        wf, wl = omega[first], omega[~first]
        if halve:
            wf = wf // 2
        wf = wf[np.argsort(np.abs(wf), kind="stable")]
        wl = wl[np.argsort(np.abs(wl), kind="stable")]
        return wf, wl, v, ga * gb, offset

    plans = [make(np.ones(n, dtype=bool), int(np.sort(d)[(n - 1) // 2]),
                  False)]
    par = d % 2
    major = 0 if np.count_nonzero(par == 0) >= n / 2 else 1
    first = par == major
    if 0 < np.count_nonzero(~first):
        df = np.sort(d[first])
        plans.append(make(first, int(df[(df.size - 1) // 2]), True))
    return plans


def _assignment_range(weights, v_sorted):
    """Smallest and largest sum_i weights_i * v_sigma(i) over injective
    sigma (rearrangement inequality: negative weights take the largest
    values, positive weights the smallest, for the minimum; the reverse
    for the maximum)."""
    neg = sorted(x for x in weights if x < 0)  # most negative first
    pos = sorted((x for x in weights if x > 0), reverse=True)
    top = v_sorted[::-1]

    def dot(xs, ys):
        return sum(x * y for x, y in zip(xs, ys))

    return (dot(neg, top) + dot(pos, v_sorted),
            dot(pos, top) + dot(neg, v_sorted))


def _layer_bounds(wf, wl, v):
    """Exact support [lo_k, hi_k] of the partial sums after k positions,
    each layer in its own grid (the 'last' stage on the doubled grid)."""
    vs = sorted(v.tolist())
    wf, wl = wf.tolist(), wl.tolist()
    lo, hi = [], []
    for k in range(len(wf) + len(wl) + 1):
        if k <= len(wf):
            eff = wf[:k]
        else:
            eff = [2 * x for x in wf] + wl[:k - len(wf)]
        a, b = _assignment_range(eff, vs)
        lo.append(a)
        hi.append(b)
    return lo, hi


def _dp_cost(plan):
    wf, wl, v = plan[:3]
    n = v.size
    lo, hi = _layer_bounds(wf, wl, v)
    cost = 0
    for k in range(n):
        width = hi[k] - lo[k] + 1
        if wl.size and k == wf.size:
            width = 2 * width - 1
        cost += math.comb(n, k) * (n - k) * width
    return cost


def _perm_sum_counts(wf, wl, v):
    """counts[t - t0] = number of permutations pi with
    T = m * sum_{first} w_i v_pi(i) + sum_{last} w_i v_pi(i) = t
    (the positions are processed in the order wf then wl)."""
    w = np.concatenate([wf, wl]).astype(np.int64)
    n = w.size
    n_first = wf.size
    sizes, trans = _subset_layers(n)
    spread_at = n_first if wl.size else -1
    lo, hi = _layer_bounds(wf, wl, v)
    cur = np.ones((1, 1), dtype=np.uint16)
    rowmax = np.ones(1, dtype=np.int64)
    for k in range(n):
        src_lo = lo[k]
        if k == spread_at:
            # T so far -> 2 T: spread the counts onto the doubled grid
            src_lo = 2 * lo[k]
            spread = np.zeros((cur.shape[0], 2 * cur.shape[1] - 1),
                              dtype=cur.dtype)
            spread[:, ::2] = cur
            cur = spread
        # every new cell is a sum of at most k+1 cells of distinct source
        # rows: bound it by the sum of those rows' maxima, then pick the
        # narrowest unsigned type that cannot overflow
        # (types only ever widen; once at 64 bits no bound is needed)
        if cur.dtype != np.uint64:
            bound_rows = np.zeros(sizes[k + 1], dtype=np.int64)
            for rows, dst in trans[k]:
                bound_rows[dst] += rowmax[rows]
            bound = int(bound_rows.max())
            dt = (np.uint16 if bound < 1 << 16 else
                  np.uint32 if bound < 1 << 32 else np.uint64)
            cur = cur.astype(np.promote_types(dt, cur.dtype), copy=False)
        dt = cur.dtype
        n_cols = hi[k + 1] - lo[k + 1] + 1
        nxt = np.zeros((sizes[k + 1], n_cols), dtype=dt)
        width = cur.shape[1]
        wk = int(w[k])
        for j, (rows, dst) in enumerate(trans[k]):
            # source column c lands on column off + c; columns falling
            # outside the new layer's exact support are all zero
            off = src_lo + wk * int(v[j]) - lo[k + 1]
            c0, c1 = max(0, -off), min(width, n_cols - off)
            if c0 < c1:
                nxt[dst, off + c0:off + c1] += cur[rows, c0:c1]
        cur = nxt
        if dt != np.uint64:
            rowmax = cur.max(axis=1).astype(np.int64)
    return lo[n], cur[0].astype(np.int64)


@lru_cache(maxsize=32)
def _perm_sum_distribution(a: tuple, b: tuple):
    """Exact distribution of S = sum_i a_i b_pi(i) over all n!
    permutations pi of integer scores: (values, counts), ascending,
    nonzero counts only (read-only arrays)."""
    a = np.array(a, dtype=np.int64)
    b = np.array(b, dtype=np.int64)
    n = a.size
    if n == 0 or np.all(a == a[0]) or np.all(b == b[0]):
        values = np.array([int(a @ b)], dtype=np.int64)
        counts = np.array([math.factorial(n)], dtype=np.int64)
    else:
        # positions = whichever variable and plan is cheapest to recurse
        plans = _plans(a, b) + _plans(b, a)
        wf, wl, v, scale, offset = min(plans, key=_dp_cost)
        t0, counts = _perm_sum_counts(wf, wl, v)
        idx = np.flatnonzero(counts)
        values = offset + scale * (t0 + idx)
        counts = counts[idx]
    values.flags.writeable = False
    counts.flags.writeable = False
    return values, counts


def _double_ranks(x) -> np.ndarray:
    """2 x midranks: exact integers."""
    return np.rint(2.0 * stats.rankdata(np.asarray(x, dtype=float))).astype(
        np.int64)


def spearman_null_distribution(n: int) -> dict:
    """Exact null distribution of Spearman's rs for n pairs without ties:
    sum of squared rank differences D = sum d_i^2 (ascending), the number
    of the n! permutations giving each, and rs = 1 - 6 D / (n^3 - n)."""
    if n < 2:
        raise ValueError("need at least 2 pairs")
    ranks = tuple(range(1, n + 1))
    values, counts = _perm_sum_distribution(ranks, ranks)
    sum_sq = n * (n + 1) * (2 * n + 1) // 6
    d2 = (2 * sum_sq - 2 * values)[::-1]
    return {"n": n, "sum_d2": d2, "counts": counts[::-1].copy(),
            "rs": 1.0 - 6.0 * d2 / (n ** 3 - n),
            "total": math.factorial(n)}


def spearman_exact_p(x, y, *, alternative: str = "two-sided") -> float:
    """Exact permutation P value of Spearman's rs (ties allowed: the
    midranks are permuted).

    alternative: 'two-sided' (|rs| >= |observed|), 'greater'
    (rs >= observed), 'less' (rs <= observed). Comparisons are made on
    exact integers, so no tolerance is needed. NaN when either variable
    is constant."""
    rx, ry = _double_ranks(x), _double_ranks(y)
    n = rx.size
    if n != ry.size:
        raise ValueError("x and y must have the same length")
    if n > SPEARMAN_EXACT_MAX_N:
        raise ValueError(f"exact Spearman P is computed for at most "
                         f"{SPEARMAN_EXACT_MAX_N} pairs")
    if np.all(rx == rx[0]) or np.all(ry == ry[0]):
        return float("nan")
    values, counts = _perm_sum_distribution(tuple(sorted(rx.tolist())),
                                            tuple(sorted(ry.tolist())))
    ab = int(rx.sum()) * int(ry.sum())
    # n * S - sum(a) sum(b) = n * sum (a - mean a)(b - mean b), the
    # numerator of rs up to a positive factor
    dev = n * values - ab
    obs = n * int(rx @ ry) - ab
    if alternative == "two-sided":
        hit = np.abs(dev) >= abs(obs)
    elif alternative == "greater":
        hit = dev >= obs
    elif alternative == "less":
        hit = dev <= obs
    else:
        raise ValueError(f"unknown alternative: {alternative}")
    return int(counts[hit].sum()) / math.factorial(n)
