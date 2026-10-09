"""Survival analysis (Prism: survival tables -> Kaplan-Meier).

Prism statistics guide, "Survival analysis": Kaplan-Meier product-limit
estimator; median survival; comparison of curves by the log-rank
(Mantel-Cox) test and the Gehan-Breslow-Wilcoxon test (weights = number
at risk); hazard ratio for two groups by the Mantel-Haenszel approach
(HR = exp((O1-E1)/V)) with its 95% CI from the log-hazard SE 1/sqrt(V).
Survival CIs use Greenwood's variance with the log-log transformation
(Prism 5+ default).

Also reported: the Greenwood standard error of S(t) at each event time
("se", as R's summary.survfit "std.err"); the Kaplan-Meier table of each
curve ("table": time, at_risk before the time, events, censored,
survival, se, lower/upper (log-log) and lower_log/upper_log (log band),
R's summary.survfit rows); the confidence interval of the
median survival by Brookmeyer and Crowley's inversion (the median's CI is
where the pointwise survival CI crosses 0.5: lower limit from the lower
band, upper limit from the upper band; a band flat at exactly 0.5 gives
the midpoint to the next drop, as R's quantile.survfit), for the log-log
band ("median_ci") and for the log band R's survfit uses by default
("median_ci_log"); and both log-rank statistics: the Peto form
sum((O-E)^2/E) Prism reports ("chi2", "p") and the Mantel-Haenszel
variance form U'V^-1U that R's survdiff reports ("chi2_variance",
"p_variance").
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats


def km_curve(times, events, ci_level: float = 0.95) -> dict:
    """times: durations; events: 1 = event (death), 0 = censored."""
    pairs = sorted((float(t), int(e)) for t, e in zip(times, events)
                   if t is not None and e is not None)
    if not pairs:
        raise ValueError("no survival data")
    n = len(pairs)
    zcrit = stats.norm.ppf((1 + ci_level) / 2)

    points = [{"time": 0.0, "survival": 1.0, "lower": 1.0, "upper": 1.0,
               "se": 0.0, "at_risk": n}]
    # log-transform band (R survfit's default conf.type = "log") for the
    # median's CI: S exp(+-z sqrt(Greenwood)), the upper limit capped at 1
    log_band = [(0.0, 1.0, 1.0)]
    table = []  # R's summary.survfit rows (event times only)
    s = 1.0
    greenwood = 0.0
    median = None
    at_risk = n
    i = 0
    while i < n:
        t = pairs[i][0]
        d = sum(1 for tt, ee in pairs[i:] if tt == t and ee == 1)
        c = sum(1 for tt, ee in pairs[i:] if tt == t and ee == 0)
        m = d + c
        if d > 0:
            s *= (at_risk - d) / at_risk
            if at_risk > d:
                greenwood += d / (at_risk * (at_risk - d))
            lower = upper = s
            if 0 < s < 1 and greenwood > 0:
                # log-log CI: S^exp(±z*se(log(-log S)))
                se_loglog = math.sqrt(greenwood) / abs(math.log(s))
                lower = s ** math.exp(zcrit * se_loglog)
                upper = s ** math.exp(-zcrit * se_loglog)
            se_s = s * math.sqrt(greenwood)
            if at_risk > d:
                lo_l = s * math.exp(-zcrit * math.sqrt(greenwood))
                hi_l = min(1.0, s * math.exp(zcrit * math.sqrt(greenwood)))
            else:  # S = 0: the band is undefined (NA in R)
                lo_l = hi_l = None
            log_band.append((t, lo_l, hi_l))
            points.append({"time": t, "survival": s,
                           "lower": lower, "upper": upper,
                           "se": se_s, "at_risk": at_risk - m})
            table.append({"time": t, "at_risk": at_risk, "events": d,
                          "censored": c, "survival": s, "se": se_s,
                          "lower": lower, "upper": upper,
                          "lower_log": lo_l, "upper_log": hi_l})
            if median is None and s <= 0.5:
                median = t
        at_risk -= m
        i += m

    n_events = sum(e for _, e in pairs)
    times_ = [pt["time"] for pt in points]
    median_ci = {
        # the band is undefined where S = 0 (as the log band)
        "lower": _quantile_time(times_, [pt["lower"] if pt["survival"] > 0
                                         else None for pt in points]),
        "upper": _quantile_time(times_, [pt["upper"] if pt["survival"] > 0
                                         else None for pt in points]),
        "level": ci_level, "transform": "log-log",
        "method": "Brookmeyer-Crowley (inverted pointwise CI)"}
    median_ci_log = {
        "lower": _quantile_time([b[0] for b in log_band],
                                [b[1] for b in log_band]),
        "upper": _quantile_time([b[0] for b in log_band],
                                [b[2] for b in log_band]),
        "level": ci_level, "transform": "log",
        "method": "Brookmeyer-Crowley (inverted pointwise CI), R "
                  "survfit's default log band"}
    return {"points": points, "table": table,
            "table_columns": {
                "time": "event time",
                "at_risk": "number at risk just before the time (R's "
                           "n.risk)",
                "events": "events at the time (n.event)",
                "censored": "censored at the time",
                "survival": "Kaplan-Meier S(t)",
                "se": "Greenwood SE of S(t) (std.err)",
                "lower": f"{ci_level:.0%} CI, log-log transform (Prism)",
                "upper": f"{ci_level:.0%} CI, log-log transform (Prism)",
                "lower_log": f"{ci_level:.0%} CI, log transform (R "
                             "survfit's default; null where S = 0)",
                "upper_log": f"{ci_level:.0%} CI, log transform (R "
                             "survfit's default; capped at 1)"},
            "n": n, "n_events": n_events,
            "n_censored": n - n_events, "median_survival": median,
            "median_ci": median_ci, "median_ci_log": median_ci_log}


def _quantile_time(times, ys, p=0.5):
    """First time a decreasing step curve reaches p (None if never); a
    curve flat at exactly p gives the midpoint between that time and the
    time it drops below p (R's quantile.survfit rule, tolerance
    sqrt(eps))."""
    tol = math.sqrt(np.finfo(float).eps)
    idx = next((k for k, v in enumerate(ys)
                if v is not None and v <= p + tol), None)
    if idx is None:
        return None
    if abs(ys[idx] - p) <= tol:
        nxt = next((k for k in range(idx + 1, len(ys))
                    if ys[k] is not None and ys[k] < p - tol), None)
        if nxt is not None:
            return (times[idx] + times[nxt]) / 2.0
    return times[idx]


def _logrank_tables(groups):
    """groups: list of (times, events) pairs -> per-event-time tables."""
    all_pairs = []
    for gi, (times, events) in enumerate(groups):
        for t, e in zip(times, events):
            if t is not None and e is not None:
                all_pairs.append((float(t), int(e), gi))
    event_times = sorted({t for t, e, _ in all_pairs if e == 1})
    k = len(groups)
    tables = []
    for t in event_times:
        n_at = [sum(1 for tt, _, g in all_pairs if tt >= t and g == gi)
                for gi in range(k)]
        d_at = [sum(1 for tt, ee, g in all_pairs
                    if tt == t and ee == 1 and g == gi) for gi in range(k)]
        N, D = sum(n_at), sum(d_at)
        if N > 0 and D > 0:
            tables.append((t, n_at, d_at, N, D))
    return tables, k


def _weighted_logrank(groups, weight_fn):
    """Returns per-group weighted O, E, the full covariance matrix of the
    weighted (O-E) vector (hypergeometric, summed over event times), and
    the group count. The correct test statistic for weights != 1 is the
    quadratic form U' V^-1 U on the first k-1 groups."""
    tables, k = _logrank_tables(groups)
    O = np.zeros(k)
    E = np.zeros(k)
    V = np.zeros((k, k))
    for t, n_at, d_at, N, D in tables:
        w = weight_fn(N)
        for gi in range(k):
            e_gi = D * n_at[gi] / N
            O[gi] += w * d_at[gi]
            E[gi] += w * e_gi
        if N > 1:
            factor = w * w * D * (N - D) / (N - 1)
            for gi in range(k):
                for gj in range(k):
                    p_i, p_j = n_at[gi] / N, n_at[gj] / N
                    V[gi, gj] += factor * (p_i * (1 - p_i) if gi == gj
                                           else -p_i * p_j)
    return O, E, V, k


def _quadratic_form_chi2(O, E, V, k):
    """chi2 = U' Vsub^-1 U on the first k-1 components."""
    U = (O - E)[: k - 1]
    Vsub = V[: k - 1, : k - 1]
    try:
        return float(U @ np.linalg.solve(Vsub, U))
    except np.linalg.LinAlgError:
        return float("nan")


def compare_survival(groups, names=None, *, ci_level: float = 0.95) -> dict:
    """Log-rank (Mantel-Cox) + Gehan-Breslow-Wilcoxon comparison.
    groups: [(times, events), ...]"""
    names = names or [f"Group {i}" for i in range(len(groups))]
    out: dict = {"curves": {}}
    for name, (times, events) in zip(names, groups):
        out["curves"][name] = km_curve(times, events, ci_level)

    # Log-rank chi-square: Prism reports the Peto form sum((O-E)^2/E),
    # df = k-1 ("How the log-rank test works").
    O, E, V, k = _weighted_logrank(groups, lambda N: 1.0)
    chi2 = float(np.sum((O - E) ** 2 / np.where(E > 0, E, np.nan)))
    p = float(stats.chi2.sf(chi2, k - 1))
    # the variance (Mantel-Haenszel) form U'V^-1U, R's survdiff
    chi2_v = _quadratic_form_chi2(O, E, V, k)
    p_v = float(stats.chi2.sf(chi2_v, k - 1))
    out["logrank"] = {
        "chi2": chi2, "df": k - 1, "p": p,
        "chi2_peto": chi2, "p_peto": p,
        "chi2_variance": chi2_v, "p_variance": p_v,
        "observed": O.tolist(), "expected": E.tolist(),
        "group_names": list(names),
        "method": ("chi2 / p (= chi2_peto / p_peto): Peto form "
                   "sum((O-E)^2/E), the approximation the engine reports "
                   "as documented in the GraphPad statistics guide; chi2_variance / p_variance: Mantel-Haenszel "
                   "variance form U'V^-1U (hypergeometric variance), the "
                   "exact log-rank statistic R's survdiff and SAS LIFETEST "
                   "report and the Cox score test equals for two groups; "
                   "df = groups - 1 for both. The Peto form is never "
                   "larger, so its P is never smaller.")}

    # Gehan-Breslow-Wilcoxon: weights = n at risk; the valid statistic is
    # the quadratic form on the weighted (O-E) with its covariance.
    Ow, Ew, Vw, _ = _weighted_logrank(groups, lambda N: float(N))
    chi2_w = _quadratic_form_chi2(Ow, Ew, Vw, k)
    out["gehan_breslow_wilcoxon"] = {
        "chi2": chi2_w, "df": k - 1,
        "p": float(stats.chi2.sf(chi2_w, k - 1)),
    }

    if k == 2 and V[0, 0] > 0:
        # Mantel-Haenszel hazard ratio (group0 vs group1)
        log_hr = (O[0] - E[0]) / V[0, 0]
        se = 1.0 / math.sqrt(V[0, 0])
        zcrit = stats.norm.ppf((1 + ci_level) / 2)
        out["hazard_ratio"] = {
            "value": math.exp(log_hr),
            "ci": [math.exp(log_hr - zcrit * se),
                   math.exp(log_hr + zcrit * se)],
            "method": "mantel_haenszel",
        }
    return out
