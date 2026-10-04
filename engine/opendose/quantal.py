"""Quantal (all-or-none) dose-response: probit, logit and cloglog fits.

Each dose group contributes r responders out of n subjects. The model is
the binomial generalized linear model

    P(dose) = C + (1 - C) * F(a + b * x),    x = log10(dose) by default,

with F the standard normal (probit; Bliss 1934, Finney 1971 "Probit
Analysis"), logistic (logit; Berkson 1944) or Gompertz/complementary
log-log CDF, fitted by maximum likelihood with Fisher scoring (iteratively
reweighted least squares). C is the natural (control) response rate:
zero by default, a fixed value (Abbott's 1925 correction) or estimated
jointly with a and b (Finney 1971, chapter 7; control groups at dose 0
then inform C only). Standard errors use the expected (Fisher)
information, as R's glm and MASS::dose.p do.

ECx (LD50, ED90, ...) is the dose at which F reaches x%, theta =
(F^-1(x/100) - a) / b. Its confidence interval is given two ways:
- Fieller's theorem (Fieller 1954; Finney 1971, section 4.5), which is
  bounded only when g = t^2 var(b) / b^2 < 1;
- the delta method (as MASS::dose.p), symmetric on the x scale.
Goodness of fit is the Pearson chi-square over dose groups (and the
deviance) on k - (number of parameters) df. When that chi-square is
significant, Finney's heterogeneity correction multiplies the covariance
by h = chi2 / df and uses t on df degrees of freedom instead of z
("heterogeneity": "auto" with heterogeneity_alpha, default 0.05; SPSS
PROBIT uses 0.15; "always" / "never" force it).

Several dose-response lines can be fitted with a common slope (parallel
line assay, Finney 1971 chapter 5): the parallelism likelihood-ratio
test, each group's ECx under the common slope and the relative potency
of every group against a reference with Fieller and delta CIs.

The GraphPad curve-fitting guide fits graded dose-response curves by
nonlinear regression; all-or-none responses counted out of n per dose are
the binomial case handled here.
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats

_LINKS = ("probit", "logit", "cloglog")
_TRANSFORMS = ("log10", "ln", "none")


def _cdf(link, eta):
    if link == "probit":
        return stats.norm.cdf(eta)
    if link == "logit":
        return 1.0 / (1.0 + np.exp(-eta))
    return -np.expm1(-np.exp(np.minimum(eta, 700.0)))


def _pdf(link, eta):
    if link == "probit":
        return stats.norm.pdf(eta)
    if link == "logit":
        f = 1.0 / (1.0 + np.exp(-eta))
        return f * (1.0 - f)
    e = np.exp(np.minimum(eta, 700.0))
    return e * np.exp(-e)


def _quantile(link, p):
    p = np.asarray(p, dtype=float)
    if link == "probit":
        return stats.norm.ppf(p)
    if link == "logit":
        return np.log(p / (1.0 - p))
    return np.log(-np.log1p(-p))


def fieller(num, den, v_nn, v_nd, v_dd, tcrit):
    """Fieller CI for num/den given (co)variances; None if unbounded."""
    a = den * den - tcrit ** 2 * v_dd
    if a <= 0:
        return None
    bq = num * den - tcrit ** 2 * v_nd
    c = num * num - tcrit ** 2 * v_nn
    disc = bq * bq - a * c
    if disc < 0:
        return None
    root = math.sqrt(disc)
    return [(bq - root) / a, (bq + root) / a]


def _transform_doses(dose, kind):
    if kind not in _TRANSFORMS:
        raise ValueError(f"dose_transform must be one of {_TRANSFORMS}")
    x = np.full(dose.size, np.nan)
    pos = dose > 0
    if kind == "log10":
        x[pos] = np.log10(dose[pos])
    elif kind == "ln":
        x[pos] = np.log(dose[pos])
    else:
        x = dose.astype(float).copy()
    return x


def _back(x, kind):
    if x is None:
        return None
    if kind == "log10":
        return float(10.0 ** x)
    if kind == "ln":
        return float(math.exp(x))
    return float(x)


def _clean(dose, n, r):
    rows = []
    for d, nn, rr in zip(dose, n, r):
        if d is None or nn is None or rr is None:
            continue
        d, nn, rr = float(d), float(nn), float(rr)
        if not (math.isfinite(d) and math.isfinite(nn) and math.isfinite(rr)):
            continue
        if nn <= 0:
            continue
        if rr < 0 or rr > nn:
            raise ValueError("responders must be between 0 and n")
        rows.append((d, nn, rr))
    if not rows:
        raise ValueError("no complete dose groups")
    arr = np.array(rows)
    return arr[:, 0], arr[:, 1], arr[:, 2]


class _Model:
    """Binomial model mu = C + (1 - C) F(Z beta) with Z rows per group
    (zero rows / mask for control groups that inform C only)."""

    def __init__(self, link, Z, active, n, r, c_mode):
        self.link, self.Z, self.active = link, Z, active
        self.n, self.r = n, r
        self.c_mode = c_mode  # None, float (fixed), "estimate"
        self.p_lin = Z.shape[1]

    def split(self, theta):
        if self.c_mode == "estimate":
            return theta[:-1], float(theta[-1])
        c = 0.0 if self.c_mode is None else float(self.c_mode)
        return theta, c

    def mu_and_grad(self, theta):
        beta, c = self.split(theta)
        eta = self.Z @ beta
        F = np.where(self.active, _cdf(self.link, eta), 0.0)
        f = np.where(self.active, _pdf(self.link, eta), 0.0)
        mu = c + (1.0 - c) * F
        D = (1.0 - c) * f[:, None] * self.Z
        if self.c_mode == "estimate":
            D = np.column_stack([D, 1.0 - F])
        return mu, D, eta

    def loglik(self, theta):
        mu, _, _ = self.mu_and_grad(theta)
        mu = np.clip(mu, 1e-300, 1 - 1e-16)
        return float(np.sum(self.r * np.log(mu)
                            + (self.n - self.r) * np.log1p(-mu)))

    def fisher(self, theta):
        mu, D, _ = self.mu_and_grad(theta)
        mu = np.clip(mu, 1e-12, 1 - 1e-12)
        w = self.n / (mu * (1.0 - mu))
        score = D.T @ ((self.r - self.n * mu) / (mu * (1.0 - mu)))
        info = D.T @ (w[:, None] * D)
        return score, info


def _start(link, Z, active, n, r, c0):
    p = (r + 0.5) / (n + 1.0)
    if c0:
        p = np.clip((p - c0) / (1.0 - c0), 0.02, 0.98)
    y = _quantile(link, np.clip(p, 1e-4, 1 - 1e-4))
    w = n * active
    Zw = Z * np.sqrt(w)[:, None]
    beta, *_ = np.linalg.lstsq(Zw, y * np.sqrt(w), rcond=None)
    return beta


def _fit(model, theta0, max_iter=200):
    theta = theta0.copy()
    ll = model.loglik(theta)
    converged = False
    it = 0
    for it in range(1, max_iter + 1):
        score, info = model.fisher(theta)
        try:
            step = np.linalg.solve(info, score)
        except np.linalg.LinAlgError:
            step = np.linalg.pinv(info) @ score
        lam = 1.0
        while True:
            new = theta + lam * step
            if model.c_mode == "estimate":
                new[-1] = min(max(new[-1], 0.0), 0.999)
            ll_new = model.loglik(new)
            if np.isfinite(ll_new) and ll_new >= ll - 1e-12 * max(1, abs(ll)):
                break
            lam /= 2.0
            if lam < 1e-10:
                break
        change = abs(ll_new - ll)
        moved = np.max(np.abs(new - theta))
        theta, ll = new, ll_new
        if change < 1e-13 * max(1.0, abs(ll)) and moved < 1e-9 * (1 + np.max(np.abs(theta))):
            converged = True
            break
    return theta, ll, converged, it


def _gof(model, theta, n_params):
    mu, _, _ = model.mu_and_grad(theta)
    n, r = model.n, model.r
    mu_c = np.clip(mu, 1e-12, 1 - 1e-12)
    pearson_resid = (r - n * mu_c) / np.sqrt(n * mu_c * (1 - mu_c))
    chi2 = float(np.sum(pearson_resid ** 2))
    with np.errstate(divide="ignore", invalid="ignore"):
        t1 = np.where(r > 0, r * np.log(r / (n * mu_c)), 0.0)
        t2 = np.where(n - r > 0, (n - r) * np.log((n - r) / (n * (1 - mu_c))), 0.0)
    dev = float(2 * np.sum(t1 + t2))
    df = int(n.size - n_params)
    return mu, pearson_resid, chi2, dev, df


def _ec_entry(level, link, a, b, v, kind, tcrit, scale):
    """ECx with delta and Fieller CIs; v = 2x2 covariance of (a, b)."""
    q = float(_quantile(link, level / 100.0))
    theta = (q - a) / b
    var = (v[0, 0] + 2 * theta * v[0, 1] + theta ** 2 * v[1, 1]) * scale
    se = math.sqrt(max(var, 0.0)) / abs(b)
    delta = [theta - tcrit * se, theta + tcrit * se]
    fl = fieller(q - a, b, v[0, 0] * scale, -v[0, 1] * scale, v[1, 1] * scale,
                 tcrit)
    g = tcrit ** 2 * v[1, 1] * scale / (b * b)
    entry = {"level": level, "x": theta, "se_x": se,
             "x_ci_delta": delta, "x_ci_fieller": fl, "g": g,
             "dose": _back(theta, kind),
             "dose_ci_delta": [_back(delta[0], kind), _back(delta[1], kind)],
             "dose_ci_fieller": [_back(fl[0], kind), _back(fl[1], kind)]
             if fl else None}
    if kind == "none":
        entry["dose_ci_delta"] = delta
    return entry


def _heterogeneity(chi2, df, mode, alpha):
    p = float(stats.chi2.sf(chi2, df)) if df > 0 else None
    if mode not in ("auto", "always", "never"):
        raise ValueError("heterogeneity must be 'auto', 'always' or 'never'")
    use = df > 0 and (mode == "always" or (mode == "auto" and p is not None
                                           and p < alpha))
    return use, p


def quantal_fit(dose, n, responders, *, link: str = "probit",
                dose_transform: str = "log10", natural_response=None,
                ec_levels=(50,), ci_level: float = 0.95,
                heterogeneity: str = "auto", heterogeneity_alpha: float = 0.05,
                curve_points: int = 101) -> dict:
    """Fit one quantal dose-response line. natural_response: None (0),
    a fixed proportion (Abbott), or "estimate"."""
    if link not in _LINKS:
        raise ValueError(f"link must be one of {_LINKS}")
    d, nn, rr = _clean(dose, n, responders)
    x = _transform_doses(d, dose_transform)
    control = ~np.isfinite(x)
    c_mode = natural_response
    if isinstance(c_mode, str) and c_mode != "estimate":
        raise ValueError("natural_response must be null, a proportion or "
                         "'estimate'")
    if c_mode is not None and not isinstance(c_mode, str):
        c_mode = float(c_mode)
        if not 0 <= c_mode < 1:
            raise ValueError("a fixed natural response must be in [0, 1)")
    if control.any() and c_mode is None:
        raise ValueError("dose 0 cannot be log-transformed; drop the control "
                         "group or set natural_response to 'estimate' or a "
                         "fixed rate")
    active = ~control
    if np.unique(x[active]).size < 2:
        raise ValueError("need at least two distinct doses")
    Z = np.column_stack([np.ones(d.size), np.where(active, x, 0.0)])
    if c_mode == "estimate":
        c0 = float(rr[control].sum() / nn[control].sum()) if control.any() \
            else float(max(min((rr / nn).min() * 0.5, 0.5), 0.01))
        c0 = min(max(c0, 1e-3), 0.9)
    else:
        c0 = c_mode or 0.0
    model = _Model(link, Z, active, nn, rr, c_mode)
    beta0 = _start(link, Z, active, nn, rr, c0)
    theta0 = np.append(beta0, c0) if c_mode == "estimate" else beta0
    theta, ll, converged, iters = _fit(model, theta0)
    n_par = theta.size
    _, info = model.fisher(theta)
    try:
        cov = np.linalg.inv(info)
    except np.linalg.LinAlgError:
        cov = np.linalg.pinv(info)
    warnings = []
    if not converged:
        warnings.append("the fit did not converge")
    if c_mode == "estimate" and theta[-1] <= 1e-10:
        warnings.append("natural response estimated at 0 (boundary)")
    mu, presid, chi2, dev, df = _gof(model, theta, n_par)
    use_h, p_chi2 = _heterogeneity(chi2, df, heterogeneity, heterogeneity_alpha)
    h = chi2 / df if use_h else 1.0
    tcrit = float(stats.t.ppf((1 + ci_level) / 2, df)) if use_h else \
        float(stats.norm.ppf((1 + ci_level) / 2))
    a, b = float(theta[0]), float(theta[1])
    v_ab = cov[:2, :2]
    se = np.sqrt(np.clip(np.diag(cov) * h, 0, None))
    params = {
        "intercept": {"value": a, "se": float(se[0]),
                      "ci": [a - tcrit * se[0], a + tcrit * se[0]]},
        "slope": {"value": b, "se": float(se[1]),
                  "ci": [b - tcrit * se[1], b + tcrit * se[1]]},
    }
    if c_mode == "estimate":
        c = float(theta[-1])
        params["natural_response"] = {"value": c, "se": float(se[-1]),
                                      "ci": [max(0.0, c - tcrit * se[-1]),
                                             min(1.0, c + tcrit * se[-1])]}
    _, c_used = model.split(theta)
    z_slope = b / se[1] if se[1] > 0 else math.inf
    slope_test = {"statistic": float(z_slope),
                  "p": float(2 * (stats.t.sf(abs(z_slope), df) if use_h
                                  else stats.norm.sf(abs(z_slope))))}
    ecs = [_ec_entry(float(lv), link, a, b, v_ab, dose_transform, tcrit, h)
           for lv in ec_levels]
    if any(e["x_ci_fieller"] is None for e in ecs):
        warnings.append("Fieller interval unbounded (g >= 1): the slope is "
                        "not significantly different from zero")

    obs = []
    for i in range(d.size):
        p_obs = rr[i] / nn[i]
        obs.append({"dose": float(d[i]),
                    "x": None if control[i] else float(x[i]),
                    "n": float(nn[i]), "responders": float(rr[i]),
                    "observed": p_obs,
                    "abbott_corrected": (p_obs - c_used) / (1 - c_used)
                    if c_used else p_obs,
                    "expected": float(mu[i]),
                    "expected_responders": float(nn[i] * mu[i]),
                    "pearson_residual": float(presid[i])})

    xs = x[active]
    lo, hi = float(xs.min()), float(xs.max())
    pad = 0.1 * (hi - lo)
    grid = np.linspace(lo - pad, hi + pad, max(int(curve_points), 2))
    eta = a + b * grid
    var_eta = (v_ab[0, 0] + 2 * grid * v_ab[0, 1] + grid ** 2 * v_ab[1, 1]) * h
    se_eta = np.sqrt(np.clip(var_eta, 0, None))
    curve = {
        "x": grid.tolist(),
        "dose": [_back(v, dose_transform) for v in grid],
        "p": (c_used + (1 - c_used) * _cdf(link, eta)).tolist(),
        "lower": (c_used + (1 - c_used) * _cdf(link, eta - tcrit * se_eta)).tolist(),
        "upper": (c_used + (1 - c_used) * _cdf(link, eta + tcrit * se_eta)).tolist(),
    }
    return {
        "analysis": "quantal",
        "link": link, "dose_transform": dose_transform,
        "natural_response_mode": natural_response,
        "natural_response_used": c_used,
        "n_groups": int(d.size), "n_total": float(nn.sum()),
        "parameters": params,
        "covariance": (cov * h).tolist(),
        "slope_test": slope_test,
        "loglik": ll,
        "goodness_of_fit": {"pearson_chi2": chi2, "deviance": dev, "df": df,
                            "p_pearson": p_chi2,
                            "p_deviance": float(stats.chi2.sf(dev, df))
                            if df > 0 else None},
        "heterogeneity": {"applied": bool(use_h), "factor": h,
                          "mode": heterogeneity, "alpha": heterogeneity_alpha,
                          "critical_value": tcrit,
                          "distribution": f"t({df})" if use_h else "normal"},
        "ec": ecs,
        "table": obs,
        "curve": curve,
        "iterations": iters, "converged": converged,
        "warnings": warnings,
    }


def quantal_parallel(groups, *, link: str = "probit",
                     dose_transform: str = "log10", ec_levels=(50,),
                     reference: int = 0, ci_level: float = 0.95,
                     heterogeneity: str = "auto",
                     heterogeneity_alpha: float = 0.05) -> dict:
    """Parallel-line quantal assay. groups: [{"name", "dose", "n",
    "responders"}]. Common slope, one intercept per group."""
    if link not in _LINKS:
        raise ValueError(f"link must be one of {_LINKS}")
    if len(groups) < 2:
        raise ValueError("a parallel-line assay needs at least two groups")
    names, xs, ns, rs, gid = [], [], [], [], []
    for gi, grp in enumerate(groups):
        d, nn, rr = _clean(grp["dose"], grp["n"], grp["responders"])
        x = _transform_doses(d, dose_transform)
        if not np.all(np.isfinite(x)):
            raise ValueError("dose 0 cannot be log-transformed in a "
                             "parallel-line assay")
        names.append(grp.get("name") or f"Group {gi + 1}")
        xs.append(x)
        ns.append(nn)
        rs.append(rr)
        gid.append(np.full(x.size, gi))
    k = len(groups)
    x = np.concatenate(xs)
    nn = np.concatenate(ns)
    rr = np.concatenate(rs)
    g = np.concatenate(gid)
    active = np.ones(x.size, dtype=bool)
    G = (g[:, None] == np.arange(k)[None, :]).astype(float)

    # common slope
    Zc = np.column_stack([G, x])
    mc = _Model(link, Zc, active, nn, rr, None)
    th_c, ll_c, conv_c, _ = _fit(mc, _start(link, Zc, active, nn, rr, 0.0))
    # separate slopes
    Zs = np.column_stack([G, G * x[:, None]])
    ms = _Model(link, Zs, active, nn, rr, None)
    th_s, ll_s, conv_s, _ = _fit(ms, _start(link, Zs, active, nn, rr, 0.0))
    lr = 2 * (ll_s - ll_c)
    _, info = mc.fisher(th_c)
    cov = np.linalg.inv(info)
    mu, presid, chi2, dev, df = _gof(mc, th_c, th_c.size)
    use_h, p_chi2 = _heterogeneity(chi2, df, heterogeneity, heterogeneity_alpha)
    h = chi2 / df if use_h else 1.0
    tcrit = float(stats.t.ppf((1 + ci_level) / 2, df)) if use_h else \
        float(stats.norm.ppf((1 + ci_level) / 2))
    b = float(th_c[k])
    se = np.sqrt(np.clip(np.diag(cov) * h, 0, None))
    per_group = []
    for gi in range(k):
        idx = [gi, k]
        v = cov[np.ix_(idx, idx)]
        a = float(th_c[gi])
        per_group.append({
            "name": names[gi],
            "intercept": {"value": a, "se": float(se[gi])},
            "ec": [_ec_entry(float(lv), link, a, b, v, dose_transform, tcrit, h)
                   for lv in ec_levels],
        })
    potency = []
    ref = int(reference)
    for gi in range(k):
        if gi == ref:
            continue
        num = float(th_c[gi] - th_c[ref])
        v_nn = (cov[gi, gi] + cov[ref, ref] - 2 * cov[gi, ref]) * h
        v_nd = (cov[gi, k] - cov[ref, k]) * h
        v_dd = cov[k, k] * h
        m = num / b
        se_m = math.sqrt(max(v_nn - 2 * m * v_nd + m * m * v_dd, 0.0)) / abs(b)
        fl = fieller(num, b, v_nn, v_nd, v_dd, tcrit)
        delta = [m - tcrit * se_m, m + tcrit * se_m]
        potency.append({
            "group": names[gi], "reference": names[ref],
            "log_potency": m, "se_log_potency": se_m,
            "log_ci_fieller": fl, "log_ci_delta": delta,
            "potency": _back(m, dose_transform) if dose_transform != "none" else None,
            "potency_ci_fieller": [_back(fl[0], dose_transform),
                                   _back(fl[1], dose_transform)]
            if fl and dose_transform != "none" else None,
            "potency_ci_delta": [_back(delta[0], dose_transform),
                                 _back(delta[1], dose_transform)]
            if dose_transform != "none" else None,
        })
    return {
        "analysis": "quantal_parallel",
        "link": link, "dose_transform": dose_transform,
        "groups": per_group,
        "slope": {"value": b, "se": float(se[k]),
                  "ci": [b - tcrit * se[k], b + tcrit * se[k]]},
        "covariance": (cov * h).tolist(),
        "parallelism": {"chi2": float(lr), "df": k - 1,
                        "p": float(stats.chi2.sf(lr, k - 1))},
        "separate_slopes": [float(v) for v in th_s[k:]],
        "goodness_of_fit": {"pearson_chi2": chi2, "deviance": dev, "df": df,
                            "p_pearson": p_chi2},
        "heterogeneity": {"applied": bool(use_h), "factor": h,
                          "critical_value": tcrit},
        "relative_potency": potency,
        "converged": bool(conv_c and conv_s),
        "loglik": ll_c,
    }
