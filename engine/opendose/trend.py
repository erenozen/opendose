"""Contingency-table analyses beyond chi-square / Fisher's test.

GraphPad statistics guide pages whose documented methods this implements:

- "Options for Contingency table analyses", "How to: Contingency table
  analysis", "Interpreting results: P values from contingency tables":
  the chi-square test for trend (Cochran-Armitage) for a table with two
  columns and three or more rows in a natural order, testing for a
  linear trend between row number and the fraction of subjects in the
  left column, computed as in Altman, Practical Statistics for Medical
  Research (1991), pp. 261-265. Rows are scored 1, 2, 3, ... (Prism
  assigns the scores itself); other scores are an OpenDose option.
  Altman's example (Caesarean section by shoe size: 5/17, 7/28, 6/36,
  7/41, 8/46, 10/140) gives chi-square for trend 8.02 (P = 0.005) out of
  an overall chi-square of 9.29 with 5 df.
- "McNemar's test": matched case-control pairs entered as a 2 x 2 table
  of pairs. The odds ratio is the ratio of the discordant pairs (25/4 =
  6.25 in the guide's example) with a CI from the exact binomial
  distribution of the discordant pairs (2.158 to 24.710); the P value
  from the exact binomial test of the discordant counts (the guide's
  recommendation; P < 0.0001), or chi-square without correction (Prism)
  or with the Yates correction (|R - S| - 1)^2 / (R + S) (QuickCalcs;
  13.79, P = 0.0002 in the example).

Not covered by the guide (no Prism dialog offers them), included as the
standard methods and validated against statsmodels:
- Bowker's test of symmetry for k x k paired tables (McNemar for k > 2).
- Cochran-Mantel-Haenszel analysis of stratified 2 x 2 tables:
  Mantel-Haenszel common odds ratio with the Robins-Breslow-Greenland
  CI, MH common relative risk with the Greenland-Robins CI, the CMH
  test of conditional independence (with or without continuity
  correction), and the Breslow-Day test of homogeneous odds ratios
  (with Tarone's adjustment).
- Cohen's kappa for agreement between two raters (unweighted, linear or
  quadratic weights): asymptotic SE of Fleiss, Cohen & Everitt (1969)
  for the CI, the null SE for the z test, and Altman's (1991) strength
  of agreement labels.
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats

from . import partsofwhole


def _table(table, *, min_shape=(2, 2)) -> np.ndarray:
    grid = np.asarray(table, dtype=float)
    if grid.ndim != 2 or grid.shape[0] < min_shape[0] or \
            grid.shape[1] < min_shape[1]:
        raise ValueError("table must be at least "
                         f"{min_shape[0]} x {min_shape[1]}")
    if not np.all(np.isfinite(grid)):
        raise ValueError("counts cannot be blank")
    if np.any(grid < 0):
        raise ValueError("counts must be non-negative")
    return grid


# ----------------------------------------------------- chi-square for trend

def chi_square_trend(table, *, scores=None) -> dict:
    """Cochran-Armitage chi-square test for trend.

    table: k rows (ordered groups) x 2 columns (outcome in the left
    column). A 2 x k table (k >= 3) is accepted and read with columns as
    the ordered groups. scores: one per ordered group (default 1..k).
    """
    grid = _table(table)
    transposed = False
    if grid.shape[1] != 2:
        if grid.shape[0] == 2:
            grid, transposed = grid.T, True
        else:
            raise ValueError("the test for trend needs a table with two "
                             "columns (or two rows)")
    k = grid.shape[0]
    x = (np.arange(1, k + 1, dtype=float) if scores is None
         else np.asarray(scores, dtype=float))
    if x.size != k:
        raise ValueError("enter one score per ordered group")
    r = grid[:, 0]
    n = grid.sum(axis=1)
    keep = n > 0
    r, n, x = r[keep], n[keep], x[keep]
    big_n, big_r = n.sum(), r.sum()
    if big_n <= 0 or big_r in (0, big_n):
        raise ValueError("every subject is in one column; no trend to test")
    p_bar = big_r / big_n
    sxx = float((n * x * x).sum() - (n * x).sum() ** 2 / big_n)
    if not sxx > 0:
        raise ValueError("the scores do not vary")
    t = float((r * x).sum() - big_r * (n * x).sum() / big_n)
    chi2 = t * t / (p_bar * (1 - p_bar) * sxx)
    slope = t / sxx  # least-squares slope of proportion on score
    overall, p_overall, dof, _ = stats.chi2_contingency(
        np.column_stack([r, n - r]), correction=False)
    departure = max(float(overall) - chi2, 0.0)
    out = {
        "test": "chi_square_trend",
        "chi2": float(chi2), "df": 1, "p": float(stats.chi2.sf(chi2, 1)),
        "z": math.copysign(math.sqrt(chi2), t),
        "slope": slope,
        "scores": x.tolist(),
        "proportions": (r / n).tolist(),
        "orientation": "columns" if transposed else "rows",
        "overall_chi_square": {"chi2": float(overall), "df": int(dof),
                               "p": float(p_overall)},
    }
    if dof > 1:
        out["departure_from_trend"] = {
            "chi2": float(departure), "df": int(dof) - 1,
            "p": float(stats.chi2.sf(departure, int(dof) - 1))}
    return out


# ---------------------------------------------------------------- McNemar

def mcnemar(table, *, ci_level: float = 0.95) -> dict:
    """McNemar's test for a 2 x 2 table of matched pairs (rows: case
    exposed +/-, columns: control exposed +/-); Bowker's test of symmetry
    for a larger square table."""
    grid = _table(table)
    if grid.shape[0] != grid.shape[1]:
        raise ValueError("paired data need a square table")
    if grid.shape != (2, 2):
        return bowker(grid)
    b, c = float(grid[0, 1]), float(grid[1, 0])
    out = {"test": "mcnemar", "discordant": [b, c],
           "n_pairs": float(grid.sum())}
    if b + c == 0:
        out.update({"odds_ratio": None, "binomial": None,
                    "chi_square": None, "chi_square_yates": None,
                    "note": "no discordant pairs"})
        return out
    if not (float(b).is_integer() and float(c).is_integer()):
        raise ValueError("enter counts of pairs (whole numbers)")
    bi, ci_ = int(b), int(c)
    lo_p, hi_p = partsofwhole.proportion_ci(bi, bi + ci_,
                                            method="clopper_pearson",
                                            ci_level=ci_level)
    to_odds = (lambda p: p / (1 - p) if p < 1 else math.inf)
    out["odds_ratio"] = {
        "value": (b / c) if c > 0 else math.inf,
        "ci": [to_odds(lo_p), to_odds(hi_p)],
        "ci_method": "exact (Clopper-Pearson on the discordant pairs)"}
    chi2 = (b - c) ** 2 / (b + c)
    chi2_y = max(abs(b - c) - 1, 0.0) ** 2 / (b + c)
    out["chi_square"] = {"chi2": chi2, "df": 1,
                         "p": float(stats.chi2.sf(chi2, 1))}
    out["chi_square_yates"] = {"chi2": chi2_y, "df": 1,
                               "p": float(stats.chi2.sf(chi2_y, 1))}
    out["binomial"] = partsofwhole.binomial_test(bi, bi + ci_, 0.5)
    out["recommended_p"] = out["binomial"]["p_two_tailed"]
    return out


def bowker(table) -> dict:
    """Bowker's test of symmetry: sum over i < j of (n_ij - n_ji)^2 /
    (n_ij + n_ji), df = k(k - 1)/2 (pairs with no counts add nothing)."""
    grid = _table(table)
    k = grid.shape[0]
    if grid.shape[1] != k:
        raise ValueError("Bowker's test needs a square table")
    stat = 0.0
    for i in range(k):
        for j in range(i + 1, k):
            s = grid[i, j] + grid[j, i]
            if s > 0:
                stat += (grid[i, j] - grid[j, i]) ** 2 / s
    df = k * (k - 1) // 2
    return {"test": "bowker", "chi2": float(stat), "df": df,
            "p": float(stats.chi2.sf(stat, df)), "n_pairs": float(grid.sum())}


# -------------------------------------------------- Cochran-Mantel-Haenszel

def cmh(tables, *, ci_level: float = 0.95, correction: bool = False,
        names=None) -> dict:
    """Stratified 2 x 2 tables [[a, b], [c, d]] (rows = groups, columns =
    outcome yes / no), one per stratum."""
    strata = [_table(t) for t in tables]
    if len(strata) < 1 or any(t.shape != (2, 2) for t in strata):
        raise ValueError("enter one 2 x 2 table per stratum")
    strata = [t for t in strata if t.sum() > 1]
    if not strata:
        raise ValueError("every stratum is empty")
    z = float(stats.norm.ppf((1 + ci_level) / 2))
    a, b, c, d = (np.array([t[i, j] for t in strata])
                  for i, j in ((0, 0), (0, 1), (1, 0), (1, 1)))
    n = a + b + c + d
    n1, n2 = a + b, c + d          # row (group) totals
    m1, m2 = a + c, b + d          # column (outcome) totals
    out = {"test": "cochran_mantel_haenszel", "n_strata": len(strata)}

    r_i, s_i = a * d / n, b * c / n
    R, S = r_i.sum(), s_i.sum()
    if R > 0 and S > 0:
        or_mh = R / S
        p_i, q_i = (a + d) / n, (b + c) / n
        var = ((p_i * r_i).sum() / (2 * R * R)
               + (p_i * s_i + q_i * r_i).sum() / (2 * R * S)
               + (q_i * s_i).sum() / (2 * S * S))
        se = math.sqrt(var)
        out["odds_ratio"] = {"value": float(or_mh), "se_log": se,
                             "ci": [float(or_mh * math.exp(-z * se)),
                                    float(or_mh * math.exp(z * se))],
                             "ci_method": "Robins-Breslow-Greenland"}
    else:
        out["odds_ratio"] = None

    num, den = (a * n2 / n).sum(), (c * n1 / n).sum()
    if num > 0 and den > 0:
        rr = num / den
        v = ((n1 * n2 * m1 - a * c * n) / (n * n)).sum() / (num * den)
        se = math.sqrt(v)
        out["relative_risk"] = {"value": float(rr), "se_log": se,
                                "ci": [float(rr * math.exp(-z * se)),
                                       float(rr * math.exp(z * se))],
                                "ci_method": "Greenland-Robins"}
    else:
        out["relative_risk"] = None

    expected = n1 * m1 / n
    var_a = n1 * n2 * m1 * m2 / (n * n * (n - 1))
    dev = abs(a.sum() - expected.sum())
    if var_a.sum() > 0:
        stat = (max(dev - (0.5 if correction else 0.0), 0.0)) ** 2 / \
            var_a.sum()
        out["cmh_test"] = {"chi2": float(stat), "df": 1,
                           "p": float(stats.chi2.sf(stat, 1)),
                           "continuity_correction": bool(correction)}
    else:
        out["cmh_test"] = None
    if out["odds_ratio"] is not None and len(strata) > 1:
        out["breslow_day"] = _breslow_day(strata, out["odds_ratio"]["value"])
    out["strata"] = []
    labels = list(names or [f"Stratum {i + 1}" for i in range(len(strata))])
    for i, t in enumerate(strata):
        ai, bi, ci, di = t.ravel()
        out["strata"].append({
            "name": labels[i] if i < len(labels) else f"Stratum {i + 1}",
            "odds_ratio": (float(ai * di / (bi * ci)) if bi * ci > 0
                           else None),
            "n": float(t.sum())})
    return out


def _breslow_day(strata, or_mh) -> dict:
    """Breslow-Day test of equal odds ratios across strata, with and
    without Tarone's (1985) adjustment."""
    stat = 0.0
    sum_a = sum_e = sum_v = 0.0
    for t in strata:
        a, b = t[0]
        c, d = t[1]
        n1, m1, n = a + b, a + c, t.sum()
        lo, hi = max(0.0, m1 - (n - n1)), min(n1, m1)
        # expected a under the common OR: root of
        # e (n - n1 - m1 + e) = OR (n1 - e)(m1 - e)
        qa = 1 - or_mh
        qb = (n - n1 - m1) + or_mh * (n1 + m1)
        qc = -or_mh * n1 * m1
        if abs(qa) < 1e-14:
            e = -qc / qb
        else:
            disc = math.sqrt(max(qb * qb - 4 * qa * qc, 0.0))
            roots = [(-qb + disc) / (2 * qa), (-qb - disc) / (2 * qa)]
            e = next((rt for rt in roots if lo - 1e-9 <= rt <= hi + 1e-9),
                     roots[0])
        v = 1.0 / (1 / e + 1 / (n1 - e) + 1 / (m1 - e) + 1 / (n - n1 - m1 + e))
        stat += (a - e) ** 2 / v
        sum_a += a
        sum_e += e
        sum_v += v
    df = len(strata) - 1
    tarone = stat - (sum_a - sum_e) ** 2 / sum_v
    return {"chi2": float(stat), "df": df,
            "p": float(stats.chi2.sf(stat, df)),
            "chi2_tarone": float(tarone),
            "p_tarone": float(stats.chi2.sf(tarone, df))}


# ------------------------------------------------------------------- kappa

def _kappa_strength(kappa: float) -> str:
    """Altman (1991), Table 14.3."""
    if kappa < 0.20:
        return "poor"
    if kappa <= 0.40:
        return "fair"
    if kappa <= 0.60:
        return "moderate"
    if kappa <= 0.80:
        return "good"
    return "very good"


def kappa(table, *, weights=None, ci_level: float = 0.95) -> dict:
    """Cohen's kappa for a k x k table (rows: rater 1, columns: rater 2).

    weights: None (unweighted), "linear", "quadratic", or a k x k matrix
    of agreement weights (1 on the diagonal)."""
    grid = _table(table)
    k = grid.shape[0]
    if grid.shape[1] != k:
        raise ValueError("kappa needs a square table (same categories "
                         "for both raters)")
    n = grid.sum()
    if n <= 0:
        raise ValueError("the table is empty")
    i, j = np.indices((k, k))
    if weights is None or weights == "none":
        w = (i == j).astype(float)
        kind = "unweighted"
    elif isinstance(weights, str):
        if k < 2:
            raise ValueError("weighted kappa needs at least 2 categories")
        if weights == "linear":
            w = 1 - np.abs(i - j) / (k - 1.0)
        elif weights == "quadratic":
            w = 1 - (i - j) ** 2 / (k - 1.0) ** 2
        else:
            raise ValueError(f"unknown weights: {weights}")
        kind = weights
    else:
        w = np.asarray(weights, dtype=float)
        if w.shape != (k, k):
            raise ValueError("the weight matrix must be k x k")
        kind = "custom"
    p = grid / n
    row, col = p.sum(axis=1), p.sum(axis=0)
    po = float((w * p).sum())
    pe = float((w * np.outer(row, col)).sum())
    if not pe < 1:
        raise ValueError("kappa is undefined: chance agreement is 100%")
    kap = (po - pe) / (1 - pe)
    wi = w @ col           # weighted row means  (w-bar_i.)
    wj = row @ w           # weighted column means (w-bar_.j)
    term = (p * (w - (wi[:, None] + wj[None, :]) * (1 - kap)) ** 2).sum()
    var = (term - (kap - pe * (1 - kap)) ** 2) / (n * (1 - pe) ** 2)
    se = math.sqrt(max(var, 0.0))
    var0 = ((np.outer(row, col) * (w - (wi[:, None] + wj[None, :])) ** 2).sum()
            - pe ** 2) / (n * (1 - pe) ** 2)
    se0 = math.sqrt(max(var0, 0.0))
    zc = float(stats.norm.ppf((1 + ci_level) / 2))
    zstat = kap / se0 if se0 > 0 else math.nan
    return {
        "test": "kappa", "weights": kind,
        "kappa": float(kap), "se": se,
        "ci": [float(kap - zc * se), float(kap + zc * se)],
        "se_null": se0, "z": float(zstat),
        "p": (float(2 * stats.norm.sf(abs(zstat))) if zstat == zstat
              else math.nan),
        "observed_agreement": po, "expected_agreement": pe,
        "n": float(n), "strength": _kappa_strength(kap),
    }
