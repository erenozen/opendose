"""Parametric survival: accelerated failure time (AFT) models.

    log T = x'beta + sigma W

with W standard extreme value (Weibull; exponential when sigma = 1) or
standard normal (log-normal), fitted by maximum likelihood to
right-censored data (Kalbfleisch, J. D. & Prentice, R. L. (2002) The
Statistical Analysis of Failure Time Data, 2nd ed., Wiley, chapter 2.3
and 3.6; Collett, D. (2015) Modelling Survival Data in Medical Research,
3rd ed., chapter 6). The parameterisation is that of R's
survival::survreg (Therneau): coefficients on the log-time scale, the
scale sigma (Weibull shape = 1 / sigma), and the log-likelihood of the
times themselves (the density of T, so it includes -log t for each
event), so the coefficients, the scale, their standard errors and the
log-likelihood are directly comparable with survreg's output.

- Fit: Newton-Raphson on (beta, log sigma) with the analytic gradient
  and observed information, step halving, started from least squares on
  log time. Standard errors from the inverse observed information at the
  maximum (survreg's).
- Time ratio of a coefficient: exp(beta), the factor by which every
  percentile of the time distribution is multiplied (the acceleration
  factor), with the Wald CI exp(beta +- z se).
- Percentile survival: the time by which a fraction p of the subjects
  have had the event, t_p = exp(x'beta + sigma w_p) with w_p =
  log(-log(1 - p)) (Weibull) or Phi^-1(p) (log-normal); its CI by the
  delta method on the log scale, exp(log t_p +- z se), se^2 = g' V g
  with g = (x, sigma w_p) (Collett 2015, section 6.6). A percentile
  later than the last follow-up time is an extrapolation of the model
  beyond the data and is flagged.
- Likelihood-ratio test against the model without covariates (the
  intercept and scale only), AIC = -2 loglik + 2 k, and the AIC of the
  other distributions on the same data for comparison.
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats
from scipy.special import log_ndtr

DISTRIBUTIONS = ("weibull", "exponential", "lognormal")
LABELS = {"weibull": "Weibull", "exponential": "Exponential",
          "lognormal": "Log-normal"}


def _f(x):
    if x is None:
        return None
    x = float(x)
    return x if math.isfinite(x) else None


def _w_quantile(dist, p):
    """Quantile of the standard error distribution W at probability p."""
    if dist == "lognormal":
        return float(stats.norm.ppf(p))
    return math.log(-math.log1p(-p))


def _derivs(dist, z, event):
    """Per-observation log-likelihood terms (without -log sigma -log t),
    and their first and second derivatives with respect to z."""
    if dist == "lognormal":
        ll_e = -0.5 * z * z - 0.5 * math.log(2 * math.pi)
        a_e = -z
        b_e = -np.ones_like(z)
        ll_c = log_ndtr(-z)
        lam = np.exp(stats.norm.logpdf(z) - ll_c)  # inverse Mills ratio
        a_c = -lam
        b_c = -lam * (lam - z)
    else:  # extreme value (minimum)
        ez = np.exp(z)
        ll_e = z - ez
        a_e = 1 - ez
        b_e = -ez
        ll_c = -ez
        a_c = -ez
        b_c = -ez
    ev = event.astype(bool)
    return (np.where(ev, ll_e, ll_c), np.where(ev, a_e, a_c),
            np.where(ev, b_e, b_c))


def _loglik(dist, X, logt, event, theta, fixed_scale):
    p = X.shape[1]
    beta = theta[:p]
    log_s = 0.0 if fixed_scale else theta[p]
    s = math.exp(log_s)
    z = (logt - X @ beta) / s
    ll, a, b = _derivs(dist, z, event)
    total = float(np.sum(ll) - np.sum(event) * log_s - np.sum(event * logt))
    g_beta = -(X.T @ a) / s
    h_bb = (X.T * b) @ X / (s * s)
    if fixed_scale:
        return total, g_beta, h_bb
    g_s = float(-np.sum(a * z) - np.sum(event))
    h_bs = X.T @ (b * z + a) / s
    h_ss = float(np.sum(b * z * z + a * z))
    g = np.append(g_beta, g_s)
    h = np.zeros((p + 1, p + 1))
    h[:p, :p] = h_bb
    h[:p, p] = h_bs
    h[p, :p] = h_bs
    h[p, p] = h_ss
    return total, g, h


def _fit(dist, X, logt, event, *, max_iter=100, tol=1e-10):
    fixed = dist == "exponential"
    p = X.shape[1]
    beta0, *_ = np.linalg.lstsq(X, logt, rcond=None)
    resid = logt - X @ beta0
    sd = float(np.sqrt(np.mean(resid ** 2))) if len(resid) > 1 else 1.0
    if dist == "weibull":
        # W has mean -0.5772 and sd pi / sqrt(6)
        s0 = max(sd / (math.pi / math.sqrt(6)), 0.1)
        beta0 = beta0 + 0.5772 * s0 * (np.eye(p)[0] if p else 0)
    else:
        s0 = max(sd, 0.1)
    theta = beta0.copy() if fixed else np.append(beta0, math.log(s0))
    ll, g, h = _loglik(dist, X, logt, event, theta, fixed)
    converged = False
    it = 0
    for it in range(1, max_iter + 1):
        try:
            step = np.linalg.solve(-h, g)
        except np.linalg.LinAlgError:
            step = g * 1e-3
        if not np.all(np.isfinite(step)):
            break
        lam = 1.0
        while True:
            cand = theta + lam * step
            ll_c, g_c, h_c = _loglik(dist, X, logt, event, cand, fixed)
            if math.isfinite(ll_c) and ll_c >= ll - 1e-12:
                break
            lam /= 2
            if lam < 1e-10:
                break
        if lam < 1e-10:
            break
        change = abs(ll_c - ll)
        theta, ll, g, h = cand, ll_c, g_c, h_c
        if change < tol * (abs(ll) + tol) and float(np.max(np.abs(g))) < 1e-5:
            converged = True
            break
    return theta, ll, g, h, converged, it


def _check(time, event):
    t = np.asarray(time, float)
    e = np.asarray(event, float)
    if t.shape != e.shape:
        raise ValueError("time and event differ in length")
    if len(t) == 0:
        raise ValueError("no survival data")
    if not np.all(np.isfinite(t)) or np.any(t <= 0):
        raise ValueError("every time must be a number greater than 0: a "
                         "parametric model works on log(time)")
    if not np.all(np.isin(e, (0, 1))):
        raise ValueError("event codes must be 1 (event) or 0 (censored)")
    return t, e


def aft_fit(time, event, X, names, dist="weibull", *, ci_level=0.95):
    """Fit one AFT model. X: design matrix with an intercept column first
    (names[0] = "(Intercept)"). Returns {dist, coefficients: [{name,
    coef, se, z, p, ci, time_ratio, time_ratio_ci}], scale: {value, ci,
    log_value, log_se, fixed}, shape (Weibull: 1 / scale), loglik, aic,
    n_params, vcov (beta and log scale), converged, iterations}."""
    if dist not in DISTRIBUTIONS:
        raise ValueError(f"unknown distribution {dist!r}")
    t, e = _check(time, event)
    X = np.asarray(X, float)
    n, p = X.shape
    if e.sum() == 0:
        raise ValueError("no events: every subject is censored, so the "
                         "model cannot be fitted")
    if np.linalg.matrix_rank(X) < p:
        raise ValueError("the covariates are collinear (or a group is "
                         "empty): the coefficients are not identifiable")
    fixed = dist == "exponential"
    k = p + (0 if fixed else 1)
    if e.sum() < k and not fixed:
        raise ValueError(f"only {int(e.sum())} events for {k} parameters: "
                         "too few to fit this model")
    if not fixed and len(np.unique(t[e == 1])) < 2 and e.sum() == n:
        raise ValueError("every event happened at the same time: the "
                         "scale cannot be estimated")
    theta, ll, g, h, converged, it = _fit(dist, X, np.log(t), e)
    z = float(stats.norm.ppf((1 + ci_level) / 2))
    try:
        vcov = np.linalg.inv(-h)
    except np.linalg.LinAlgError:
        vcov = np.full((k, k), np.nan)
    se = np.sqrt(np.where(np.diag(vcov) > 0, np.diag(vcov), np.nan))
    if not np.all(np.isfinite(se)) or not np.all(np.isfinite(theta)):
        converged = False
    coefs = []
    for j, name in enumerate(names):
        b, s_ = float(theta[j]), float(se[j])
        zz = b / s_ if s_ > 0 else float("nan")
        ci = [b - z * s_, b + z * s_]
        coefs.append({
            "name": name, "coef": b, "se": _f(s_), "z": _f(zz),
            "p": _f(2 * stats.norm.sf(abs(zz))) if math.isfinite(zz) else None,
            "ci": [_f(ci[0]), _f(ci[1])],
            "time_ratio": None if j == 0 else _f(math.exp(b)),
            "time_ratio_ci": None if j == 0 else [_f(math.exp(ci[0])),
                                                  _f(math.exp(ci[1]))]})
    if fixed:
        scale = {"value": 1.0, "ci": None, "log_value": 0.0, "log_se": None,
                 "fixed": True}
    else:
        ls, lse = float(theta[p]), float(se[p])
        scale = {"value": math.exp(ls),
                 "ci": [_f(math.exp(ls - z * lse)), _f(math.exp(ls + z * lse))],
                 "log_value": ls, "log_se": _f(lse), "fixed": False}
    out = {"dist": dist, "label": LABELS[dist], "coefficients": coefs,
           "scale": scale, "loglik": ll, "n_params": k,
           "aic": -2 * ll + 2 * k, "vcov": vcov.tolist(),
           "converged": bool(converged), "iterations": it,
           "theta": theta.tolist()}
    if dist != "lognormal":
        out["shape"] = 1.0 / scale["value"]
    return out


def _percentile(fit, x, p_fail, ci_level):
    """t_p at covariate row x with its delta-method CI."""
    theta = np.asarray(fit["theta"], float)
    vcov = np.asarray(fit["vcov"], float)
    x = np.asarray(x, float)
    k = len(x)
    sigma = fit["scale"]["value"]
    w = _w_quantile(fit["dist"], p_fail)
    log_t = float(x @ theta[:k] + sigma * w)
    grad = np.append(x, sigma * w) if not fit["scale"]["fixed"] else x
    var = float(grad @ vcov @ grad)
    z = float(stats.norm.ppf((1 + ci_level) / 2))
    se_log = math.sqrt(var) if var > 0 else None
    t_p = math.exp(log_t)
    return {"p": p_fail, "time": _f(t_p), "se": _f(t_p * se_log) if se_log else None,
            "se_log": _f(se_log),
            "ci": ([_f(math.exp(log_t - z * se_log)),
                    _f(math.exp(log_t + z * se_log))] if se_log else None)}


def parametric_survival(groups, names=None, *, dist="weibull",
                        percentiles=(0.25, 0.5, 0.75), ci_level=0.95):
    """AFT model with the group as the only covariate (reference: the
    first group). groups: [(times, events)] (events 1 / 0). Returns
    {"dist", "label", "coefficients", "scale", "shape"?, "loglik",
    "loglik_null", "lr_test": {chi2, df, p} | null, "aic",
    "groups": [{name, n, events, last_time, km_median, percentiles:
    [{p, time, se, ci, beyond_follow_up}]}], "time_ratios": [{group,
    reference, value, ci, p}], "compare": [{dist, label, loglik, aic,
    converged}], "converged", "warnings"}."""
    from .survival import km_curve
    if not groups:
        raise ValueError("no survival data (need time + event subcolumns)")
    names = [str(x) for x in (names or [f"Group {i + 1}"
                                         for i in range(len(groups))])]
    k = len(groups)
    times, events, rows = [], [], []
    for gi, (t, e) in enumerate(groups):
        if len(t) != len(e):
            raise ValueError(f"group {names[gi]!r}: times and events "
                             "differ in length")
        for tt, ee in zip(t, e):
            times.append(float(tt))
            events.append(int(ee))
            rows.append([1.0] + [1.0 if gi == j else 0.0
                                 for j in range(1, k)])
    for gi, (t, e) in enumerate(groups):
        if sum(e) == 0:
            raise ValueError(
                f"no events in {names[gi]}: its time ratio has no finite "
                "estimate (the likelihood keeps rising as it grows). Leave "
                "the group out, or report its survival as not reached")
        if any(float(x) <= 0 for x in t):
            raise ValueError(f"{names[gi]}: every time must be greater "
                             "than 0 (a parametric model works on "
                             "log(time)); a subject that died at time 0 "
                             "needs a small positive time or leaving out")
    X = np.array(rows)
    coef_names = ["(Intercept)"] + [f"Group: {names[j]}"
                                    for j in range(1, k)]
    fit = aft_fit(times, events, X, coef_names, dist, ci_level=ci_level)
    warnings = []
    if not fit["converged"]:
        warnings.append("The maximum-likelihood fit did not converge: the "
                        "estimates and their CIs are not reliable.")
    null = None
    if k > 1:
        try:
            null = aft_fit(times, events, np.ones((len(times), 1)),
                           ["(Intercept)"], dist, ci_level=ci_level)
        except ValueError:
            null = None
    lr = None
    if null is not None:
        chi2 = max(0.0, 2 * (fit["loglik"] - null["loglik"]))
        lr = {"chi2": chi2, "df": k - 1,
              "p": float(stats.chi2.sf(chi2, k - 1))}
    out_groups = []
    for gi, (t, e) in enumerate(groups):
        x = X[[sum(len(g[0]) for g in groups[:gi])]][0]
        last = max(float(v) for v in t)
        km = km_curve(t, e)
        pcts = []
        for pf in percentiles:
            r = _percentile(fit, x, float(pf), ci_level)
            r["beyond_follow_up"] = r["time"] is not None and r["time"] > last
            pcts.append(r)
        out_groups.append({"name": names[gi], "n": len(t),
                           "events": int(sum(e)), "last_time": last,
                           "km_median": km["median_survival"],
                           "percentiles": pcts})
        beyond = [f"{r['p'] * 100:g}%" for r in pcts if r["beyond_follow_up"]]
        if beyond:
            which = (beyond[0] if len(beyond) == 1
                     else ", ".join(beyond[:-1]) + " and " + beyond[-1])
            warnings.append(
                f"{names[gi]}: the time by which {which} have had the "
                f"event is later than the last follow-up ({last:g}), so "
                "the model extrapolates beyond the data there.")
    ratios = []
    for j in range(1, k):
        c = fit["coefficients"][j]
        ratios.append({"group": names[j], "reference": names[0],
                       "value": c["time_ratio"], "ci": c["time_ratio_ci"],
                       "p": c["p"]})
    compare = []
    for d in DISTRIBUTIONS:
        try:
            f2 = fit if d == dist else aft_fit(times, events, X, coef_names,
                                               d, ci_level=ci_level)
            compare.append({"dist": d, "label": LABELS[d],
                            "loglik": f2["loglik"], "aic": f2["aic"],
                            "converged": f2["converged"]})
        except ValueError as exc:
            compare.append({"dist": d, "label": LABELS[d], "loglik": None,
                            "aic": None, "converged": False,
                            "error": str(exc)})
    for gi, (t, e) in enumerate(groups):
        if sum(e) < 5:
            warnings.append(f"{names[gi]}: {int(sum(e))} event"
                            f"{'s' if sum(e) != 1 else ''}; the estimates "
                            "and CIs are large-sample approximations.")
    result = {k2: v for k2, v in fit.items() if k2 not in ("theta",)}
    result.update({"loglik_null": null["loglik"] if null else None,
                   "lr_test": lr, "groups": out_groups,
                   "time_ratios": ratios, "compare": compare,
                   "reference": names[0], "group_names": names,
                   "n": len(times), "n_events": int(sum(events)),
                   "ci_level": ci_level, "percentiles_asked": list(percentiles),
                   "warnings": warnings})
    return result
