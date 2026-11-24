"""Ordinal (proportional-odds) regression: the cumulative logit model for
scores on an ordered scale (histology 0 to 4, clinical EAE score).

The model (McCullagh 1980, "Regression models for ordinal data", J R Stat
Soc B 42:109; Agresti 2010, Analysis of Ordinal Categorical Data, 2nd ed.,
chapter 3) for an outcome with ordered levels 1 < 2 < ... < J is

    logit P(Y <= j | x) = theta_j - x'beta,    j = 1, ..., J - 1,

with the parameterisation of R's ordinal::clm (Christensen 2019,
"Cumulative link models for ordinal regression with the R package
ordinal", the package's clm_article vignette, equation 10): a positive
beta moves the scores up, and exp(beta) is the odds ratio of a score in
category j or above, the same for every j (the proportional-odds
assumption). The fit is maximum likelihood by Newton-Raphson on the
analytic gradient and observed Hessian, with step halving so the
log-likelihood never decreases and the thresholds stay ordered (as
clm's default fitter does). Standard errors come from the inverse
observed Hessian; confidence intervals of the coefficients are profile
likelihood (clm's confint default) or Wald; each term is tested by the
likelihood ratio of dropping it (clm's drop1), the model against the
thresholds-only model by the likelihood ratio G.

Proportional-odds check: for each term, the likelihood ratio test of the
model against the partial proportional-odds model in which that term
has a separate effect at every threshold (Peterson & Harrell 1990,
"Partial proportional odds models for ordinal response variables", Appl
Stat 39:205; ordinal::nominal_test, Christensen 2019 section 4.2), on
(J - 2) x (columns of the term) df.

Refusals, each with a sentence: fewer than two observed levels; a
declared level with no observations (empty category, whose threshold is
not identifiable); more parameters than rows; separation, found by a
linear program over the directions in which the likelihood rises
without bound (the cumulative-link analogue of Albert & Anderson 1984,
"On the existence of maximum likelihood estimates in logistic regression
models", Biometrika 71:1): the scores are then ordered (almost)
perfectly by the predictors and an odds ratio is infinite.
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats
from scipy.special import expit

from . import multivar


# ------------------------------------------------------------------ outcome

def _num_text(v: float) -> str:
    return str(int(v)) if float(v).is_integer() else repr(float(v))


def _code_levels(var, rows, order=None):
    """The ordered levels of the outcome over the analysed rows and the
    0-based category of each row. Numbers sort numerically; text levels
    need `order` (lowest first) unless every level reads as a number."""
    vals = [var["values"][i] for i in rows]
    warnings = []
    if order:
        order = [multivar._level_text(o) for o in order]
        if len(set(order)) != len(order):
            raise ValueError("the order of the outcome levels names a level twice")
        texts = [multivar._level_text(v) for v in vals]
        unknown = sorted(set(texts) - set(order))
        if unknown:
            raise ValueError(f"outcome level {unknown[0]!r} is not in the order of levels; "
                             "add it to the order")
        empty = [o for o in order if o not in set(texts)]
        if empty:
            raise ValueError(f"no row has the outcome level {empty[0]!r}: an empty "
                             "category has no threshold to estimate; remove it from the "
                             "order or merge it with a neighbouring level")
        levels = order
        y = np.array([order.index(t) for t in texts], dtype=int)
    elif var["kind"] == "continuous":
        uniq = sorted(set(vals))
        levels = [_num_text(u) for u in uniq]
        y = np.array([uniq.index(v) for v in vals], dtype=int)
        if all(float(u).is_integer() for u in uniq) and len(uniq) >= 2:
            gaps = [int(u) for u in range(int(uniq[0]), int(uniq[-1]) + 1)
                    if float(u) not in set(uniq)]
            if gaps:
                warnings.append(
                    f"No analysed row has the score {', '.join(str(g) for g in gaps)}: "
                    f"the model uses the {len(uniq)} observed scores "
                    f"({', '.join(levels)}), so the thresholds jump over "
                    f"{'that score' if len(gaps) == 1 else 'those scores'}.")
    else:
        uniq = list(dict.fromkeys(vals))
        nums = [multivar._as_number(u) for u in uniq]
        if any(n is None for n in nums):
            raise ValueError(f"outcome {var['name']} has text levels: give their order "
                             "(lowest first) so the model knows which is higher")
        pairs = sorted(zip(nums, uniq))
        levels = [u for _, u in pairs]
        y = np.array([levels.index(v) for v in vals], dtype=int)
    if len(levels) < 2:
        raise ValueError(f"the outcome {var['name']} has only one level in the analysed "
                         "rows; ordinal regression needs two or more")
    return levels, y, warnings


# ---------------------------------------------------------- likelihood core

def _rows(y, J, X, Z):
    """Linear-predictor rows of each observation's upper and lower
    cumulative logit, as matrices over the parameter vector
    (theta_1..theta_{J-1}, gamma (Z's columns at each threshold), beta):
    eta_ij = theta_j + Z_i gamma_j - X_i beta. Rows for the infinite ends
    (j = 0 lower, j = J upper) are flagged by `has_up` / `has_lo`."""
    n = y.size
    q = Z.shape[1]
    p = X.shape[1]
    k = (J - 1) * (1 + q) + p
    up = np.zeros((n, k))
    lo = np.zeros((n, k))
    has_up = y < J - 1
    has_lo = y > 0
    iu, il = np.flatnonzero(has_up), np.flatnonzero(has_lo)
    up[iu, y[iu]] = 1.0
    lo[il, y[il] - 1] = 1.0
    for c in range(q):
        up[iu, J - 1 + y[iu] * q + c] = Z[iu, c]
        lo[il, J - 1 + (y[il] - 1) * q + c] = Z[il, c]
    up[iu, k - p:] = -X[iu]
    lo[il, k - p:] = -X[il]
    return up, lo, has_up, has_lo


def _ll_parts(phi, up, lo, has_up, has_lo, offset):
    a = up @ phi + offset
    b = lo @ phi + offset
    Fa = np.where(has_up, expit(a), 1.0)
    Fb = np.where(has_lo, expit(b), 0.0)
    # P(Y = j) = F(a) - F(b), computed as F(a) (1 - F(b)) (1 - e^(b - a)) to
    # keep its relative precision when both ends are near 0 or near 1
    with np.errstate(over="ignore", invalid="ignore"):
        pr = np.where(has_up & has_lo, Fa * (1 - Fb) * -np.expm1(b - a), Fa - Fb)
    return a, b, Fa, Fb, pr


def _loglik(phi, up, lo, has_up, has_lo, offset, J):
    if J > 2:
        th = phi[:J - 1]
        if np.any(np.diff(th) <= 0):
            return -math.inf
    _, _, _, _, pr = _ll_parts(phi, up, lo, has_up, has_lo, offset)
    if np.any(~(pr > 0)):
        return -math.inf
    return float(np.sum(np.log(pr)))


def _grad_hess(phi, up, lo, has_up, has_lo, offset):
    a, b, Fa, Fb, pr = _ll_parts(phi, up, lo, has_up, has_lo, offset)
    fa = np.where(has_up, Fa * (1 - Fa), 0.0)
    fb = np.where(has_lo, Fb * (1 - Fb), 0.0)
    dfa = fa * (1 - 2 * Fa)
    dfb = fb * (1 - 2 * Fb)
    ga, gb = fa / pr, -fb / pr
    grad = up.T @ ga + lo.T @ gb
    haa = dfa / pr - ga ** 2
    hbb = -dfb / pr - gb ** 2
    hab = -ga * gb
    hess = (up.T @ (up * haa[:, None]) + lo.T @ (lo * hbb[:, None])
            + up.T @ (lo * hab[:, None]) + lo.T @ (up * hab[:, None]))
    return grad, hess


def _start(y, J, k, p, q):
    cum = np.cumsum(np.bincount(y, minlength=J))[:-1] / y.size
    cum = np.clip(cum, 1e-3, 1 - 1e-3)
    phi = np.zeros(k)
    phi[:J - 1] = np.log(cum / (1 - cum))
    if J > 2 and np.any(np.diff(phi[:J - 1]) <= 0):
        phi[:J - 1] = np.linspace(-1, 1, J - 1)
    return phi


def _fit(y, J, X, Z=None, *, offset=None, phi0=None, max_iter: int = 200,
         tol: float = 1e-10) -> dict:
    """Maximum likelihood of the cumulative logit model by Newton-Raphson
    with step halving (steps that lower the log-likelihood, put a
    threshold out of order or a fitted probability at or below 0 are
    halved). Converged when the largest absolute score falls below
    1e-8 (clm's gradTol is 1e-6) and the step below tol."""
    n = y.size
    Z = np.zeros((n, 0)) if Z is None else Z
    p, q = X.shape[1], Z.shape[1]
    k = (J - 1) * (1 + q) + p
    up, lo, has_up, has_lo = _rows(y, J, X, Z)
    offset = np.zeros(n) if offset is None else offset
    phi = _start(y, J, k, p, q) if phi0 is None else np.array(phi0, dtype=float)
    ll = _loglik(phi, up, lo, has_up, has_lo, offset, J)
    if not math.isfinite(ll):
        phi = _start(y, J, k, p, q)
        ll = _loglik(phi, up, lo, has_up, has_lo, offset, J)
    converged = False
    it = 0
    for it in range(1, max_iter + 1):
        grad, hess = _grad_hess(phi, up, lo, has_up, has_lo, offset)
        try:
            step = np.linalg.solve(-hess, grad)
        except np.linalg.LinAlgError:
            step = np.linalg.lstsq(-hess, grad, rcond=None)[0]
        if not np.all(np.isfinite(step)) or float(grad @ step) <= 0:
            step = grad  # not an ascent direction: fall back to the gradient
        t = 1.0
        cand, ll_new = phi, ll
        for _ in range(60):
            c = phi + t * step
            l_c = _loglik(c, up, lo, has_up, has_lo, offset, J)
            if l_c >= ll - 1e-12 * (1 + abs(ll)):
                cand, ll_new = c, l_c
                break
            t /= 2
        delta = float(np.max(np.abs(cand - phi))) if k else 0.0
        phi, ll = cand, ll_new
        if (float(np.max(np.abs(grad))) < 1e-8 * max(1.0, n / 100)
                and delta < 1e-6) or delta < tol * (1 + float(np.max(np.abs(phi)))):
            converged = float(np.max(np.abs(
                _grad_hess(phi, up, lo, has_up, has_lo, offset)[0]))) < 1e-5 * max(1.0, n / 1000)
            break
    grad, hess = _grad_hess(phi, up, lo, has_up, has_lo, offset)
    _, _, _, _, pr = _ll_parts(phi, up, lo, has_up, has_lo, offset)
    return {"phi": phi, "ll": ll, "hess": hess, "grad": grad, "converged": converged,
            "iterations": it, "prob": pr}


# ---------------------------------------------------------------- separation

def detect_separation(y, J, X, tol: float = 1e-7):
    """Linear program for a direction d = (d_theta, d_beta) along which
    the log-likelihood rises without bound: every row's upper cumulative
    logit d_theta_y - x d_beta >= 0 and lower one d_theta_{y-1} - x d_beta
    <= 0, the thresholds staying ordered (d_theta nondecreasing), with
    some of those inequalities strict. None when the maximum-likelihood
    estimate exists, else "complete" (every row strict) or
    "quasi-complete"."""
    from scipy.optimize import linprog

    n, p = X.shape
    if p == 0:
        return None
    scale = np.max(np.abs(X), axis=0)
    scale[scale == 0] = 1.0
    Xs = X / scale
    rows = []
    for i in range(n):
        j = y[i]
        if j < J - 1:
            r = np.zeros(J - 1 + p)
            r[j] = 1.0
            r[J - 1:] = -Xs[i]
            rows.append(r)
        if j > 0:
            r = np.zeros(J - 1 + p)
            r[j - 1] = -1.0
            r[J - 1:] = Xs[i]
            rows.append(r)
    A = np.array(rows)
    order = np.zeros((J - 2, J - 1 + p))
    for j in range(J - 2):
        order[j, j], order[j, j + 1] = 1.0, -1.0  # d_theta_j - d_theta_{j+1} <= 0
    kk = J - 1 + p
    # complete: maximize t with A d >= t, |d| <= 1
    res = linprog(np.r_[np.zeros(kk), -1.0],
                  A_ub=np.vstack([np.hstack([-A, np.ones((A.shape[0], 1))]),
                                  np.hstack([order, np.zeros((J - 2, 1))])]),
                  b_ub=np.zeros(A.shape[0] + J - 2),
                  bounds=[(-1, 1)] * kk + [(None, 1)], method="highs")
    if res.status == 0 and -res.fun > tol:
        return "complete"
    res = linprog(-A.sum(axis=0), A_ub=np.vstack([-A, order]),
                  b_ub=np.zeros(A.shape[0] + J - 2),
                  bounds=[(-1, 1)] * kk, method="highs")
    if res.status == 0 and -res.fun > tol * A.shape[0]:
        return "quasi-complete"
    return None


class SeparationError(ValueError):
    """Ordinal regression refused for (quasi-)separation."""
    kind = "separation"


# ------------------------------------------------------------- profile CIs

def _profile_ci(y, J, X, fit, j, se_j, q):
    """Profile-likelihood interval of coefficient beta_j: the values b
    where 2 (LL_max - max LL with beta_j = b) equals the chi-square(1)
    critical value q. None for a side that never reaches q."""
    from scipy.optimize import brentq

    p = X.shape[1]
    others = np.delete(X, j, axis=1)
    bhat = fit["phi"][J - 1 + j]
    start = np.delete(fit["phi"], J - 1 + j)

    def dev(b):
        sub = _fit(y, J, others, offset=-b * X[:, j], phi0=start)
        return 2 * (fit["ll"] - sub["ll"]) - q

    out = []
    for sign in (-1.0, 1.0):
        step = se_j if se_j > 0 and math.isfinite(se_j) else 1.0
        inner, outer = bhat, None
        for _ in range(40):
            cand = bhat + sign * step
            if dev(cand) > 0:
                outer = cand
                break
            inner = cand
            step *= 2
        out.append(None if outer is None else float(
            brentq(dev, min(inner, outer), max(inner, outer), xtol=1e-10, rtol=1e-12)))
    assert p >= 1
    return out


def _exp(v: float) -> float:
    """exp, infinite past the float range (an odds ratio per 1e-12 unit)."""
    return math.exp(v) if v < 709.78 else math.inf


def _aicc(ll, k, n):
    aic = -2 * ll + 2 * k
    return aic, (aic + 2 * k * (k + 1) / (n - k - 1) if n - k - 1 > 0 else None)


# ------------------------------------------------------------------ the model

def ordinal_regression(variables, outcome: str, predictors, *, interactions=(),
                       reference_levels=None, outcome_order=None,
                       ci_level: float = 0.95, ci_method: str = "profile",
                       proportional_odds_test: bool = True) -> dict:
    """Cumulative logit (proportional-odds) regression of an ordered
    outcome on predictors (module docstring).

    outcome_order: the outcome's levels lowest first (needed for text
    levels; numbers sort numerically). Categorical predictors are dummy
    coded against their reference level (default: the first in the table);
    an experiment or batch entered as a categorical predictor is a block.
    """
    if ci_method not in ("profile", "wald"):
        raise ValueError(f"unknown CI method: {ci_method}")
    table = multivar.parse_table(variables)
    d = multivar._design(table, outcome, predictors, interactions, reference_levels)
    # every column is fitted scaled to max |x| = 1 (and reported back in its
    # own units), so the fit and its tests do not depend on the units
    col_scale = np.max(np.abs(d["X"][:, 1:]), axis=0) if d["X"].shape[1] > 1 else np.ones(0)
    col_scale[col_scale == 0] = 1.0
    X = d["X"][:, 1:] / col_scale
    columns = d["columns"][1:]
    terms = {t: [c - 1 for c in cols] for t, cols in d["terms"].items()}
    levels, y, warnings = _code_levels(multivar._by_name(table)[outcome], d["rows"],
                                       outcome_order)
    n, p = X.shape
    J = len(levels)
    k = J - 1 + p
    if n <= k:
        raise ValueError(f"need more rows ({n}) than parameters ({k}: {J - 1} thresholds "
                         f"and {p} coefficients)")
    try:
        sep = detect_separation(y, J, X)
        lp_checked = True
    except Exception:  # LP solver unavailable: fall back to the fit
        sep, lp_checked = None, False
    if sep:
        raise SeparationError(
            f"Separation: the predictors order the {outcome} scores perfectly or almost "
            "perfectly, so at least one odds ratio is infinite and cannot be reported. "
            "Merge sparse neighbouring scores, or compare the groups with a rank test "
            "(Mann-Whitney or Kruskal-Wallis)")
    fit = _fit(y, J, X)
    if not fit["converged"] or (not lp_checked
                                and np.max(np.abs(fit["phi"][J - 1:]), initial=0) > 30):
        raise SeparationError("ordinal regression did not converge (the predictors may "
                              "order the scores perfectly)")
    phi, ll = fit["phi"], fit["ll"]
    try:
        cov = np.linalg.inv(-fit["hess"])
    except np.linalg.LinAlgError:
        raise ValueError("the information matrix is singular: a predictor is constant "
                         "within the analysed rows or duplicates another") from None
    se = np.sqrt(np.diag(cov))
    zcrit = float(stats.norm.ppf((1 + ci_level) / 2))
    q = float(stats.chi2.ppf(ci_level, 1))
    eig = np.linalg.eigvalsh(-fit["hess"])
    cond_h = float(eig[-1] / eig[0]) if eig[0] > 0 else math.inf

    counts = np.bincount(y, minlength=J)
    thresholds = [{"name": f"{levels[j]}|{levels[j + 1]}", "estimate": float(phi[j]),
                   "se": float(se[j]), "z": float(phi[j] / se[j])} for j in range(J - 1)]
    coefs = []
    for j, name in enumerate(columns):
        u = col_scale[j]
        b, s = float(phi[J - 1 + j] / u), float(se[J - 1 + j] / u)
        ci = ([None if c is None else c / u
               for c in _profile_ci(y, J, X, fit, j, s * u, q)] if ci_method == "profile"
              else [b - zcrit * s, b + zcrit * s])
        z = b / s
        coefs.append({"name": name, "estimate": b, "se": s, "ci": ci, "z": float(abs(z)),
                      "z_signed": float(z), "p": float(2 * stats.norm.sf(abs(z))),
                      "odds_ratio": _exp(b),
                      "odds_ratio_ci": [None if c is None else _exp(c) for c in ci]})

    # thresholds-only model: the cumulative proportions, in closed form
    ll0 = float(np.sum(counts * np.log(counts / n)))
    g = max(2 * (ll - ll0), 0.0)
    aic, aicc = _aicc(ll, k, n)
    aic0, aicc0 = _aicc(ll0, J - 1, n)

    term_tests = []
    for term, cols in terms.items():
        keep = [c for c in range(p) if c not in cols]
        sub = _fit(y, J, X[:, keep], phi0=np.r_[phi[:J - 1], phi[J - 1:][keep]])
        lr = max(2 * (ll - sub["ll"]), 0.0)
        term_tests.append({"term": term, "df": len(cols), "log_likelihood": sub["ll"],
                           "aic": -2 * sub["ll"] + 2 * (k - len(cols)), "LR": lr,
                           "p": float(stats.chi2.sf(lr, len(cols)))})

    po = None
    if proportional_odds_test:
        po = proportional_odds_check(y, J, X, terms, fit)
        if po["any_violation"]:
            warnings.append(
                "The proportional-odds check rejects equal effects across the thresholds "
                f"for {', '.join(t['term'] for t in po['tests'] if t['p'] is not None and t['p'] < 0.05)}"
                " (P < 0.05): its odds ratio is an average over the cut points, and the "
                "effect differs between low and high scores.")

    return {
        "outcome": outcome, "link": "logit", "levels": levels,
        "level_counts": [int(c) for c in counts],
        "n_rows_analyzed": n, "n_rows_skipped": d["n_rows"] - n, "rows_used": d["rows"],
        "n_parameters": k, "reference_levels": d["reference"],
        "ci_level": ci_level, "ci_method": ci_method,
        "thresholds": thresholds, "coefficients": coefs,
        # of the fit with each column scaled to max |x| = 1 (clm's cond.H for
        # 0/1 dummies)
        "iterations": fit["iterations"], "condition_number_hessian": cond_h,
        "max_abs_gradient": float(np.max(np.abs(fit["grad"]))),
        "log_likelihood": ll, "null_log_likelihood": ll0,
        "aic": aic, "aicc": aicc,
        "model_comparison": {
            "thresholds_only": {"n_parameters": J - 1, "aic": aic0, "aicc": aicc0,
                                "log_likelihood": ll0},
            "selected": {"n_parameters": k, "aic": aic, "aicc": aicc, "log_likelihood": ll},
        },
        "likelihood_ratio_test": {"G": g, "df": p,
                                  "p": float(stats.chi2.sf(g, p)) if p else None},
        "term_tests": term_tests,
        "proportional_odds": po,
        "warnings": warnings,
    }


def proportional_odds_check(y, J, X, terms, fit) -> dict:
    """Likelihood ratio test, for each term, of proportional odds against
    that term's effect varying across the J - 1 thresholds (the partial
    proportional-odds model of Peterson & Harrell 1990; ordinal::
    nominal_test). df = (J - 2) x the term's columns. A term whose
    relaxed model cannot be fitted (fitted probabilities forced to 0 by
    empty cells) gets p None and a reason."""
    tests = []
    p = X.shape[1]
    for term, cols in terms.items():
        df = (J - 2) * len(cols)
        if df == 0:
            continue
        keep = [c for c in range(p) if c not in cols]
        # nominal columns enter with a positive sign at each threshold
        # (theta_j + Z gamma_j), as clm's nominal effects do
        beta = fit["phi"][J - 1:]
        phi0 = np.r_[fit["phi"][:J - 1], np.tile(-beta[cols], J - 1), beta[keep]]
        sub = _fit(y, J, X[:, keep], Z=X[:, cols], phi0=phi0)
        row = {"term": term, "df": df}
        if not math.isfinite(sub["ll"]) or sub["ll"] < fit["ll"] - 1e-6:
            row.update({"log_likelihood": None, "LR": None, "p": None,
                        "note": "the model with a separate effect at each threshold "
                                "could not be fitted"})
        else:
            lr = max(2 * (sub["ll"] - fit["ll"]), 0.0)
            row.update({"log_likelihood": sub["ll"],
                        "aic": -2 * sub["ll"] + 2 * (J - 1 + p + df), "LR": lr,
                        "p": float(stats.chi2.sf(lr, df)),
                        "converged": bool(sub["converged"])})
            if not sub["converged"]:
                row["note"] = ("some threshold-specific effects run to infinity (an empty "
                               "cell); the likelihood ratio uses the supremum of the "
                               "likelihood")
        tests.append(row)
    return {"method": "likelihood ratio vs partial proportional odds (nominal effects)",
            "tests": tests,
            "any_violation": any(t["p"] is not None and t["p"] < 0.05 for t in tests)}
