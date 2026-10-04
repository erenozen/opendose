"""Cox proportional-hazards regression.

Cox (1972) partial likelihood, maximised by Newton-Raphson with
step-halving from beta = 0. Tied event times use Efron's (1977)
approximation (the default, as in R's survival::coxph), Breslow's (1974),
or the exact partial likelihood (Kalbfleisch & Prentice 1973; R's
ties="exact"), which the GraphPad guide describes as Prism's default when
there are few ties ("The mathematics of model coefficients and the
concept of tied data"). Covariates may be continuous or categorical
(treatment / dummy coding against a reference level); strata get separate
baseline hazards (stratified partial likelihood, Kalbfleisch & Prentice
2002).

Reported, following Therneau & Grambsch (2000), "Modeling Survival Data":
- coefficients with SE (inverse observed information), Wald z and P,
  hazard ratios exp(b) with Wald CIs (and, on request, profile-likelihood
  CIs, Venzon & Moolgavkar 1988), and per-term Wald tests for
  multi-column (categorical) terms;
- the global likelihood-ratio, Wald and score (log-rank) tests;
- Harrell's concordance index C with tied risk scores counted 1/2 and
  tied times handled as in survival::concordance (a pair is comparable
  when the shorter time is an event; censoring at a death time counts as
  longer), with the infinitesimal-jackknife standard error;
- the Breslow (or Efron-adjusted, matching the ties method as
  survival::survfit.coxph does) baseline cumulative hazard and survival,
  and adjusted survival curves at chosen covariate values with the
  Tsiatis/Link variance (including the uncertainty in b) and log-scale
  CIs;
- Schoenfeld and scaled Schoenfeld residuals and the Grambsch & Therneau
  (1994) proportional-hazards test with time transforms "km" (1 - left-
  continuous Kaplan-Meier), "rank", "identity" and "log". The test is the
  score test for adding x * g(t), computed at (b, 0) exactly as
  survival::cox.zph (version 3) does, per term and globally;
- martingale and deviance residuals (Therneau, Grambsch & Fleming 1990).

The GraphPad statistics guide documents Cox proportional hazards
regression ("Cox regression (Cox proportional hazards model)", "Results
of Cox proportional hazards regression", "Residuals for Cox proportional
hazards regression": parameter estimates, hazard ratios, model tests,
scaled Schoenfeld, martingale and deviance residuals, estimated survival
curves); the definitions above are the standard ones those pages
describe.
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats


# ------------------------------------------------------------------ helpers

def _is_missing(v) -> bool:
    if v is None:
        return True
    if isinstance(v, float) and math.isnan(v):
        return True
    if isinstance(v, str) and not v.strip():
        return True
    return False


def _as_number(v):
    """float for numeric input (numbers or numeric strings), else None."""
    if isinstance(v, bool):
        return float(v)
    if isinstance(v, (int, float, np.integer, np.floating)):
        return float(v)
    if isinstance(v, str):
        try:
            return float(v.strip())
        except ValueError:
            return None
    return None


def _level_label(v) -> str:
    num = _as_number(v)
    if num is not None and not isinstance(v, str):
        return str(int(num)) if float(num).is_integer() else repr(float(num))
    return str(v).strip()


def _sort_levels(values):
    """Distinct levels, numeric ones in numeric order, then text."""
    labels = {}
    for v in values:
        labels.setdefault(_level_label(v), v)
    nums = [(k, _as_number(k)) for k in labels]
    if all(n is not None for _, n in nums):
        return [k for k, _ in sorted(nums, key=lambda kv: kv[1])]
    return sorted(labels)


def _safe_solve(a, b):
    try:
        return np.linalg.solve(a, b)
    except np.linalg.LinAlgError:
        return np.linalg.pinv(a) @ b


def _safe_inv(a):
    try:
        return np.linalg.inv(a)
    except np.linalg.LinAlgError:
        return np.linalg.pinv(a)


# ------------------------------------------------------------ design matrix

def _build_terms(covariates, n, categorical, reference, levels):
    """covariates: {name: values}. Returns list of term specs."""
    terms = []
    categorical = set(categorical or [])
    reference = reference or {}
    levels = levels or {}
    for name, values in covariates.items():
        values = list(values)
        if len(values) != n:
            raise ValueError(f"covariate '{name}' has {len(values)} values; "
                             f"expected {n}")
        present = [v for v in values if not _is_missing(v)]
        is_cat = (name in categorical or name in levels
                  or any(_as_number(v) is None for v in present))
        if not is_cat:
            terms.append({"name": name, "kind": "continuous",
                          "values": [None if _is_missing(v) else _as_number(v)
                                     for v in values]})
            continue
        if name in levels:
            lv = [_level_label(v) for v in levels[name]]
            unknown = {_level_label(v) for v in present} - set(lv)
            if unknown:
                raise ValueError(f"covariate '{name}' has values not in its "
                                 f"level list: {sorted(unknown)}")
        else:
            lv = _sort_levels(present)
        if len(lv) < 2:
            raise ValueError(f"categorical covariate '{name}' needs at least "
                             "2 levels")
        ref = _level_label(reference[name]) if name in reference else lv[0]
        if ref not in lv:
            raise ValueError(f"reference level '{ref}' not found in "
                             f"covariate '{name}'")
        terms.append({"name": name, "kind": "categorical", "levels": lv,
                      "reference": ref,
                      "values": [None if _is_missing(v) else _level_label(v)
                                 for v in values]})
    return terms


def _design_rows(terms, rows):
    """Design matrix for the given row indices; columns + labels."""
    cols, labels, assign = [], [], []
    for ti, term in enumerate(terms):
        vals = [term["values"][i] for i in rows]
        if term["kind"] == "continuous":
            cols.append(np.array(vals, dtype=float))
            labels.append(term["name"])
            assign.append(ti)
        else:
            for lv in term["levels"]:
                if lv == term["reference"]:
                    continue
                cols.append(np.array([1.0 if v == lv else 0.0 for v in vals]))
                labels.append(f"{term['name']}[{lv}]")
                assign.append(ti)
    return np.column_stack(cols), labels, assign


def _profile_row(terms, profile, means, labels):
    """One design row for a covariate profile {name: value}; columns of
    terms left out take the design-column means (R's default)."""
    row = means.copy()
    j = 0
    for term in terms:
        if term["kind"] == "continuous":
            if term["name"] in profile and not _is_missing(profile[term["name"]]):
                num = _as_number(profile[term["name"]])
                if num is None:
                    raise ValueError(f"'{term['name']}' must be numeric")
                row[j] = num
            j += 1
        else:
            k = len(term["levels"]) - 1
            if term["name"] in profile and not _is_missing(profile[term["name"]]):
                lv = _level_label(profile[term["name"]])
                if lv not in term["levels"]:
                    raise ValueError(f"unknown level '{lv}' for "
                                     f"'{term['name']}'")
                others = [x for x in term["levels"] if x != term["reference"]]
                row[j:j + k] = [1.0 if x == lv else 0.0 for x in others]
            j += k
    return row


# ------------------------------------------------------- partial likelihood

class _Strata:
    """Per-stratum sort order and tie structure (computed once)."""

    def __init__(self, time, event, strata_codes):
        self.groups = []
        for s in np.unique(strata_codes):
            idx = np.flatnonzero(strata_codes == s)
            idx = idx[np.argsort(time[idx], kind="mergesort")]
            t = time[idx]
            e = event[idx]
            death_pos = np.flatnonzero(e == 1)
            if death_pos.size:
                et, inv = np.unique(t[death_pos], return_inverse=True)
                first = np.searchsorted(t, et, side="left")
                d = np.bincount(inv, minlength=et.size)
            else:
                et = np.empty(0)
                inv = np.empty(0, dtype=int)
                first = np.empty(0, dtype=int)
                d = np.empty(0, dtype=int)
            self.groups.append({"stratum": s, "idx": idx, "t": t, "e": e,
                                "death_pos": death_pos, "death_grp": inv,
                                "event_times": et, "first": first, "d": d})


def _sub_terms(d, efron):
    grp = np.repeat(np.arange(d.size), d)
    if efron:
        frac = np.concatenate([np.arange(k) / k for k in d]) if d.size else \
            np.empty(0)
    else:
        frac = np.zeros(grp.size)
    return grp, frac


def _stratum_pieces(g, X, beta, efron, shift=True):
    """Risk-set sums for one stratum at beta (sub-term level)."""
    Xs = X[g["idx"]]
    eta = Xs @ beta
    if shift:
        eta = eta - eta.max()
    r = np.exp(eta)
    rx = r[:, None] * Xs
    rxx = rx[:, :, None] * Xs[:, None, :]
    S0 = np.cumsum(r[::-1])[::-1]
    S1 = np.cumsum(rx[::-1], axis=0)[::-1]
    S2 = np.cumsum(rxx[::-1], axis=0)[::-1]
    K = g["event_times"].size
    p = X.shape[1]
    dp, dg = g["death_pos"], g["death_grp"]
    S0D = np.bincount(dg, weights=r[dp], minlength=K)
    S1D = np.zeros((K, p))
    np.add.at(S1D, dg, rx[dp])
    S2D = np.zeros((K, p, p))
    np.add.at(S2D, dg, rxx[dp])
    grp, frac = _sub_terms(g["d"], efron)
    f = g["first"][grp]
    den = S0[f] - frac * S0D[grp]
    s1 = S1[f] - frac[:, None] * S1D[grp]
    s2 = S2[f] - frac[:, None, None] * S2D[grp]
    xbar = s1 / den[:, None]
    info_sub = s2 / den[:, None, None] - xbar[:, :, None] * xbar[:, None, :]
    return {"Xs": Xs, "eta": eta, "r": r, "grp": grp, "frac": frac,
            "den": den, "xbar": xbar, "info_sub": info_sub}


def _exact_group(Xr, r, dead):
    """Exact partial-likelihood term for one tied death set (Kalbfleisch &
    Prentice 1973): the denominator is the elementary symmetric
    polynomial of degree d of the risks over the risk set, built with the
    recursion E_j[k] = E_(j-1)[k] + r_j E_(j-1)[k-1] (Gail, Lubin &
    Rubinstein 1981), run here as d cumulative sums over the risk set.
    Returns (log E, dE/E, d2E/E)."""
    d = int(dead)
    m, p = Xr.shape
    XX = Xr[:, :, None] * Xr[:, None, :]
    prev_E = np.ones(m)
    prev_dE = np.zeros((m, p))
    prev_d2E = np.zeros((m, p, p))
    for _ in range(d):
        E_k = np.cumsum(r * prev_E)
        dE_k = np.cumsum(r[:, None] * (Xr * prev_E[:, None] + prev_dE),
                         axis=0)
        d2E_k = np.cumsum(r[:, None, None] * (
            XX * prev_E[:, None, None] + Xr[:, :, None] * prev_dE[:, None, :]
            + prev_dE[:, :, None] * Xr[:, None, :] + prev_d2E), axis=0)
        prev_E = np.concatenate([[0.0], E_k[:-1]])
        prev_dE = np.vstack([np.zeros((1, p)), dE_k[:-1]])
        prev_d2E = np.concatenate([np.zeros((1, p, p)), d2E_k[:-1]])
    E = E_k[-1]
    return math.log(E), dE_k[-1] / E, d2E_k[-1] / E


def _loglik(X, beta, strata, method):
    with np.errstate(divide="ignore", invalid="ignore", over="ignore"):
        return _loglik_terms(X, beta, strata, method)


def _loglik_terms(X, beta, strata, method):
    p = X.shape[1]
    ll = 0.0
    grad = np.zeros(p)
    info = np.zeros((p, p))
    for g in strata.groups:
        if g["event_times"].size == 0:
            continue
        pc = _stratum_pieces(g, X, beta, method == "efron")
        dp = g["death_pos"]
        ll += pc["eta"][dp].sum() - np.log(pc["den"]).sum()
        grad += pc["Xs"][dp].sum(axis=0) - pc["xbar"].sum(axis=0)
        info += pc["info_sub"].sum(axis=0)
        if method != "exact":
            continue
        for k in np.flatnonzero(g["d"] > 1):
            sub = pc["grp"] == k  # undo the Breslow term of this tie set
            ll += np.log(pc["den"][sub]).sum()
            grad += pc["xbar"][sub].sum(axis=0)
            info -= pc["info_sub"][sub].sum(axis=0)
            f = g["first"][k]
            logE, m1, m2 = _exact_group(pc["Xs"][f:], pc["r"][f:], g["d"][k])
            ll -= logE
            grad -= m1
            info += m2 - np.outer(m1, m1)
    return ll, grad, info


def _newton(X, strata, method, max_iter, tol, fixed=None, beta0=None):
    """Newton-Raphson with step-halving from beta0 (default 0). fixed =
    (j, value) holds coefficient j at value (profile likelihood)."""
    p = X.shape[1]
    beta = np.zeros(p) if beta0 is None else np.array(beta0, dtype=float)
    free = np.arange(p)
    if fixed is not None:
        beta[fixed[0]] = fixed[1]
        free = np.array([j for j in range(p) if j != fixed[0]], dtype=int)
    ll, grad, info = _loglik(X, beta, strata, method)
    ll0, grad0, info0 = ll, grad.copy(), info.copy()
    converged = free.size == 0
    it = 0
    for it in range(1, max_iter + 1):
        if free.size == 0:
            break
        step = np.zeros(p)
        step[free] = _safe_solve(info[np.ix_(free, free)], grad[free])
        if not np.all(np.isfinite(step)):
            break
        halvings = 0
        while True:
            new = beta + step
            ll_new, g_new, i_new = _loglik(X, new, strata, method)
            if np.isfinite(ll_new) and ll_new >= ll - 1e-12 * max(1.0, abs(ll)):
                break
            step = step / 2.0
            halvings += 1
            if halvings > 40:
                break
        if halvings > 40:
            break
        change = abs(ll_new - ll)
        beta, ll, grad, info = new, ll_new, g_new, i_new
        if change <= tol * max(1.0, abs(ll)) and \
                np.max(np.abs(step)) <= 1e-8 * (1.0 + np.max(np.abs(beta))):
            converged = True
            break
    return {"beta": beta, "loglik": ll, "grad": grad, "info": info,
            "loglik0": ll0, "grad0": grad0, "info0": info0,
            "iterations": it, "converged": converged}


def _profile_ci(X, strata, method, beta, ll_max, se, j, crit, max_iter, tol,
                infinite=False):
    """Profile-likelihood CI for coefficient j: the values where
    2 (l(b) - l_profile(b_j)) = crit, bracketed from the Wald interval and
    solved by Brent's method with warm starts. None for an unbounded
    side (monotone likelihood)."""
    from scipy.optimize import brentq

    warm = {"beta": beta}

    def excess(bj):
        fit = _newton(X, strata, method, max_iter, tol, fixed=(j, bj),
                      beta0=warm["beta"])
        if not np.isfinite(fit["loglik"]):
            return 1e12
        warm["beta"] = fit["beta"]
        return 2.0 * (ll_max - fit["loglik"]) - crit

    w = math.sqrt(crit) * (se[j] if se[j] > 0 and np.isfinite(se[j]) else 1.0)
    bounds = []
    for sgn in (-1.0, 1.0):
        if infinite and sgn * beta[j] > 0:  # likelihood keeps rising
            bounds.append(None)
            continue
        warm["beta"] = beta
        inner, outer = beta[j] + sgn * 0.8 * w, beta[j] + sgn * 1.25 * w
        f_in = excess(inner)
        if f_in > 0:  # Wald interval too wide on this side
            outer, inner = inner, beta[j]
            f_out, f_in = f_in, -crit
        else:
            f_out = excess(outer)
            k = 0
            while f_out <= 0 and k < 8:
                inner, f_in = outer, f_out
                outer = beta[j] + sgn * (1.25 * 2 ** (k + 1)) * w
                f_out = excess(outer)
                k += 1
            if f_out <= 0:
                bounds.append(None)
                continue
        a, b = sorted((inner, outer))
        bounds.append(brentq(excess, a, b, xtol=1e-9 * max(1.0, abs(beta[j])),
                             rtol=1e-12))
    return bounds


# ------------------------------------------------------------- concordance

def _concordance(time, event, eta, strata_codes):
    """Harrell's C as survival::concordance (reverse=TRUE for a Cox
    linear predictor), with its infinitesimal-jackknife SE."""
    n = time.size
    infl = np.zeros((n, 3))  # concordant, discordant, tied.x per obs
    conc = disc = tiex = tiey = 0.0
    for s in np.unique(strata_codes):
        idx = np.flatnonzero(strata_codes == s)
        t, e, x = time[idx], event[idx], eta[idx]
        for a in np.flatnonzero(e == 1):
            mask = (t > t[a]) | ((t == t[a]) & (e == 0))
            js = np.flatnonzero(mask)
            if js.size:
                c = x[a] > x[js]
                dd = x[a] < x[js]
                tt = ~(c | dd)
                nc, nd, nt = c.sum(), dd.sum(), tt.sum()
                conc += nc
                disc += nd
                tiex += nt
                ia = idx[a]
                infl[ia] += (nc, nd, nt)
                np.add.at(infl[:, 0], idx[js[c]], 1.0)
                np.add.at(infl[:, 1], idx[js[dd]], 1.0)
                np.add.at(infl[:, 2], idx[js[tt]], 1.0)
            tiey += (np.sum((t == t[a]) & (e == 1)) - 1) / 2.0
    npair = conc + disc + tiex
    if npair == 0:
        return {"c": None, "se": None, "concordant": 0, "discordant": 0,
                "tied_risk": 0, "tied_time": float(tiey), "comparable": 0}
    somer = (conc - disc) / npair
    dfbeta = ((infl[:, 0] - infl[:, 1])
              - infl.sum(axis=1) * somer) / (2.0 * npair)
    return {"c": float((somer + 1) / 2), "se": float(math.sqrt(np.sum(dfbeta ** 2))),
            "concordant": float(conc), "discordant": float(disc),
            "tied_risk": float(tiex), "tied_time": float(tiey),
            "comparable": float(npair)}


# ----------------------------------------------------------- main analysis

_TRANSFORMS = ("km", "rank", "identity", "log")


def _time_transform(time, event, kind):
    if kind == "identity":
        return time.astype(float)
    if kind == "log":
        if np.any(time <= 0):
            raise ValueError("log time transform needs positive times")
        return np.log(time)
    if kind == "rank":
        return stats.rankdata(time)
    if kind == "km":
        ut = np.unique(time)
        surv = np.empty(ut.size)
        s = 1.0
        for k, tk in enumerate(ut):
            at_risk = np.sum(time >= tk)
            deaths = np.sum((time == tk) & (event == 1))
            if at_risk > 0:
                s *= 1.0 - deaths / at_risk
            surv[k] = s
        pos = np.searchsorted(ut, time, side="left")  # S(t-) = surv[pos-1]
        left = np.where(pos > 0, surv[np.maximum(pos - 1, 0)], 1.0)
        return 1.0 - left
    raise ValueError(f"unknown time transform '{kind}' "
                     f"(use one of {', '.join(_TRANSFORMS)})")


def cox_regression(time, event, covariates: dict, *, categorical=None,
                   reference=None, levels=None, strata=None,
                   ties: str = "efron", ci_level: float = 0.95,
                   ph_transform: str = "km", curves_at=None,
                   hazard_method: str | None = None,
                   ci_method: str = "wald",
                   max_iter: int = 50, tol: float = 1e-12) -> dict:
    """Fit a Cox model.

    time, event: per subject (event 1 = event, 0 = censored).
    covariates: {name: [value per subject]}; text values (or names in
    `categorical` / `levels`) are categorical. reference: {name: level};
    levels: {name: [ordered levels]} (first = reference by default).
    strata: optional per-subject stratum labels.
    curves_at: list of covariate profiles {name: value} for adjusted
    survival curves (default: one curve at the covariate means, as R's
    survfit.coxph). hazard_method: "breslow" | "efron" (default: the
    ties method; Breslow for exact). ties "exact" is the exact partial
    likelihood (the discrete / conditional-logistic form of R's
    ties="exact"); without tied event times all three methods agree.
    ci_method "profile" adds profile-likelihood CIs for every coefficient
    and hazard ratio next to the Wald ones.
    """
    if ties not in ("efron", "breslow", "exact"):
        raise ValueError("ties must be 'efron', 'breslow' or 'exact'")
    if ci_method not in ("wald", "profile"):
        raise ValueError("ci_method must be 'wald' or 'profile'")
    efron = ties == "efron"
    hazard_method = hazard_method or ("breslow" if ties == "exact" else ties)
    if hazard_method not in ("efron", "breslow"):
        raise ValueError("hazard_method must be 'efron' or 'breslow'")
    ph_transform = ph_transform or "km"
    time = list(time)
    event = list(event)
    n_in = len(time)
    if len(event) != n_in:
        raise ValueError("time and event must have the same length")
    if not covariates:
        raise ValueError("Cox regression needs at least one covariate")
    strata_vals = list(strata) if strata is not None else None
    if strata_vals is not None and len(strata_vals) != n_in:
        raise ValueError("strata must have one value per subject")

    terms = _build_terms(covariates, n_in, categorical, reference, levels)
    keep = []
    for i in range(n_in):
        tv, ev = _as_number(time[i]) if not _is_missing(time[i]) else None, \
            _as_number(event[i]) if not _is_missing(event[i]) else None
        if tv is None or ev is None or not math.isfinite(tv):
            continue
        if ev not in (0.0, 1.0):
            raise ValueError("event codes must be 1 (event) or 0 (censored)")
        if any(term["values"][i] is None for term in terms):
            continue
        if strata_vals is not None and _is_missing(strata_vals[i]):
            continue
        keep.append(i)
    if not keep:
        raise ValueError("no complete cases")
    T = np.array([_as_number(time[i]) for i in keep], dtype=float)
    E = np.array([_as_number(event[i]) for i in keep], dtype=float)
    if np.any(T < 0):
        raise ValueError("survival times must be non-negative")
    n_events = int(E.sum())
    if n_events == 0:
        raise ValueError("no events: the Cox model cannot be estimated")
    X, labels, assign = _design_rows(terms, keep)
    n, p = X.shape
    for term in terms:  # categorical levels absent after dropping rows
        if term["kind"] == "categorical":
            seen = {term["values"][i] for i in keep}
            if term["reference"] not in seen:
                raise ValueError(f"reference level '{term['reference']}' of "
                                 f"'{term['name']}' has no complete cases")
    if strata_vals is not None:
        slabels = _sort_levels([strata_vals[i] for i in keep])
        smap = {lab: k for k, lab in enumerate(slabels)}
        S = np.array([smap[_level_label(strata_vals[i])] for i in keep])
    else:
        slabels = ["all"]
        S = np.zeros(n, dtype=int)

    means = X.mean(axis=0)
    Xc = X - means
    sd = X.std(axis=0)
    warnings = []
    if np.any(sd == 0):
        bad = [labels[j] for j in np.flatnonzero(sd == 0)]
        raise ValueError(f"covariate column(s) with no variation: {bad}")

    st = _Strata(T, E, S)
    fit = _newton(Xc, st, ties, max_iter, tol)
    beta = fit["beta"]
    info = fit["info"]
    if not fit["converged"]:
        warnings.append("Newton-Raphson did not converge; estimates may be "
                        "unreliable")
    big = np.abs(beta) * sd > 15
    if np.any(big):
        names = ", ".join(labels[j] for j in np.flatnonzero(big))
        warnings.append(f"coefficient(s) may be infinite (monotone "
                        f"likelihood): {names}")
    cov = _safe_inv(info)
    se = np.sqrt(np.clip(np.diag(cov), 0, None))
    zcrit = float(stats.norm.ppf((1 + ci_level) / 2))

    profile = None
    if ci_method == "profile":
        crit = float(stats.chi2.ppf(ci_level, 1))
        profile = [_profile_ci(Xc, st, ties, beta, fit["loglik"], se, j, crit,
                               max_iter, 1e-10, bool(big[j]))
                   for j in range(p)]
    coefs = []
    for j in range(p):
        term = terms[assign[j]]
        z = beta[j] / se[j] if se[j] > 0 else math.inf
        entry = {"name": labels[j], "term": term["name"],
                 "coef": float(beta[j]), "se": float(se[j]),
                 "z": float(z), "p": float(2 * stats.norm.sf(abs(z))),
                 "ci": [float(beta[j] - zcrit * se[j]),
                        float(beta[j] + zcrit * se[j])],
                 "hazard_ratio": float(math.exp(beta[j])),
                 "hazard_ratio_ci": [float(math.exp(beta[j] - zcrit * se[j])),
                                     float(math.exp(beta[j] + zcrit * se[j]))]}
        if profile is not None:
            lo, hi = profile[j]
            entry["ci_profile"] = [None if lo is None else float(lo),
                                   None if hi is None else float(hi)]
            entry["hazard_ratio_ci_profile"] = [
                None if lo is None else float(math.exp(lo)),
                None if hi is None else float(math.exp(hi))]
        if term["kind"] == "categorical":
            entry["level"] = labels[j][len(term["name"]) + 1:-1]
            entry["reference"] = term["reference"]
        coefs.append(entry)

    term_tests = []
    for ti, term in enumerate(terms):
        jj = [j for j in range(p) if assign[j] == ti]
        b = beta[jj]
        chi2 = float(b @ _safe_solve(cov[np.ix_(jj, jj)], b))
        term_tests.append({"term": term["name"], "chi2": chi2, "df": len(jj),
                           "p": float(stats.chi2.sf(chi2, len(jj)))})

    lr = 2.0 * (fit["loglik"] - fit["loglik0"])
    wald = float(beta @ info @ beta)
    score = float(fit["grad0"] @ _safe_solve(fit["info0"], fit["grad0"]))
    tests = {k: {"chi2": float(v), "df": p, "p": float(stats.chi2.sf(v, p))}
             for k, v in (("likelihood_ratio", lr), ("wald", wald),
                          ("score", score))}

    eta_c = Xc @ beta  # centred linear predictor
    conc = _concordance(T, E, eta_c, S)

    # ----- per-stratum pieces at beta-hat (unshifted, centred X)
    pieces = []
    for g in st.groups:
        pc = _stratum_pieces(g, Xc, beta, efron, shift=False)
        want = hazard_method == "efron"
        hz = pc if want == efron else \
            _stratum_pieces(g, Xc, beta, want, shift=False)
        pieces.append((g, pc, hz))

    # Schoenfeld residuals, per-time score / information (for zph)
    sch_rows, sch_time, sch_strat, sch_subj = [], [], [], []
    U_t, I_t, g_time_idx = [], [], []
    for g, pc, _ in pieces:
        K = g["event_times"].size
        if K == 0:
            continue
        grp = pc["grp"]
        cnt = np.bincount(grp, minlength=K).astype(float)
        mean_xbar = np.zeros((K, p))
        np.add.at(mean_xbar, grp, pc["xbar"])
        sum_xbar = mean_xbar.copy()
        mean_xbar /= cnt[:, None]
        Isum = np.zeros((K, p, p))
        np.add.at(Isum, grp, pc["info_sub"])
        dp, dg = g["death_pos"], g["death_grp"]
        Xd = pc["Xs"][dp]
        sumX = np.zeros((K, p))
        np.add.at(sumX, dg, Xd)
        U_t.append(sumX - sum_xbar)
        I_t.append(Isum)
        res = Xd - mean_xbar[dg]
        sch_rows.append(res)
        sch_time.append(g["t"][dp])
        sch_strat.append(np.full(dp.size, g["stratum"]))
        sch_subj.append(g["idx"][dp])
        g_time_idx.append((g, dg))
    schoen = np.vstack(sch_rows)
    sch_time = np.concatenate(sch_time)
    sch_strat = np.concatenate(sch_strat)
    sch_subj = np.concatenate(sch_subj)

    # ----- Grambsch-Therneau test (score test of x * g(t) at (b, 0))
    tt = _time_transform(T, E, ph_transform)
    gtime = tt - tt[E == 1].mean()
    u_new = np.zeros(p)
    imat = np.zeros((2 * p, 2 * p))
    for (g, dg), U, Ik in zip(g_time_idx, U_t, I_t):
        gk = gtime[g["idx"][g["first"]]]  # g at each event time
        u_new += (gk[:, None] * U).sum(axis=0)
        imat[:p, :p] += Ik.sum(axis=0)
        cross = (gk[:, None, None] * Ik).sum(axis=0)
        imat[:p, p:] += cross
        imat[p:, :p] += cross
        imat[p:, p:] += (gk[:, None, None] ** 2 * Ik).sum(axis=0)
    zph_terms = []
    for ti, term in enumerate(terms):
        jj = [j for j in range(p) if assign[j] == ti]
        kk = list(range(p)) + [p + j for j in jj]
        u = np.concatenate([np.zeros(p), u_new[jj]])
        chi2 = float(u @ _safe_solve(imat[np.ix_(kk, kk)], u))
        zph_terms.append({"term": term["name"], "chi2": chi2, "df": len(jj),
                          "p": float(stats.chi2.sf(chi2, len(jj)))})
    u_all = np.concatenate([np.zeros(p), u_new])
    chi2g = float(u_all @ _safe_solve(imat, u_all))

    # scaled Schoenfeld residuals: b + V^-1 s with V = I / (events used)
    used = np.zeros((len(st.groups), p))
    for k, g in enumerate(st.groups):
        xs = X[g["idx"]]
        nd = g["death_pos"].size
        varying = np.any(xs != xs[:1], axis=0)
        used[k] = np.where(varying, nd, 0)
    wtmat = np.zeros((p, p))
    for k in range(len(st.groups)):
        wtmat += np.minimum.outer(used[k], used[k])
    vmean = info / np.where(wtmat == 0, 1.0, wtmat)
    scaled = np.full_like(schoen, np.nan)
    for k, g in enumerate(st.groups):
        rows = sch_strat == g["stratum"]
        cols = np.flatnonzero(used[k] > 0)
        if rows.any() and cols.size:
            sub = schoen[np.ix_(rows, cols)]
            scaled[np.ix_(rows, cols)] = _safe_solve(
                vmean[np.ix_(cols, cols)], sub.T).T
    scaled = scaled + beta

    # ----- martingale and deviance residuals
    mart = np.zeros(n)
    for g, pc, _ in pieces:
        K = g["event_times"].size
        r = pc["r"]
        if K == 0:
            mart[g["idx"]] = g["e"]
            continue
        grp, frac, den = pc["grp"], pc["frac"], pc["den"]
        dH = np.bincount(grp, weights=1.0 / den, minlength=K)
        dH_dead = np.bincount(grp, weights=(1.0 - frac) / den, minlength=K)
        H = np.cumsum(dH)
        t = g["t"]
        pos = np.searchsorted(g["event_times"], t, side="left")
        Hprev = np.where(pos > 0, H[np.maximum(pos - 1, 0)], 0.0)
        at_et = (pos < K) & (g["event_times"][np.minimum(pos, K - 1)] == t)
        inc = np.where(at_et, np.where(g["e"] == 1, dH_dead[np.minimum(pos, K - 1)],
                                       dH[np.minimum(pos, K - 1)]), 0.0)
        mart[g["idx"]] = g["e"] - r * (Hprev + inc)
    with np.errstate(divide="ignore", invalid="ignore"):
        inner = mart + np.where(E == 1, E * np.log(np.where(E == 1, E - mart, 1.0)), 0.0)
    dev = np.sign(mart) * np.sqrt(np.clip(-2.0 * inner, 0, None))

    # ----- baseline hazard and adjusted survival curves
    def curve_for(x0c, label, values):
        with np.errstate(over="ignore", invalid="ignore"):
            return _curve(x0c, label, values)

    def _curve(x0c, label, values):
        out = []
        risk = math.exp(float(x0c @ beta))
        for g, _, hz in pieces:
            K = g["event_times"].size
            if K == 0:
                continue
            grp, den, xbar = hz["grp"], hz["den"], hz["xbar"]
            dH = np.bincount(grp, weights=1.0 / den, minlength=K)
            vg = np.bincount(grp, weights=1.0 / den ** 2, minlength=K)
            dvec = np.zeros((K, p))
            np.add.at(dvec, grp, (x0c - xbar) / den[:, None])
            H = np.cumsum(dH) * risk
            dcum = np.cumsum(dvec, axis=0)
            var = (np.cumsum(vg) + np.einsum("ki,ij,kj->k", dcum, cov, dcum)) \
                * risk ** 2
            seH = np.sqrt(np.clip(var, 0, None))
            surv = np.exp(-H)
            n_risk = np.array([np.sum(g["t"] >= tk) for tk in g["event_times"]])
            out.append({
                "stratum": slabels[g["stratum"]],
                "time": [0.0] + g["event_times"].tolist(),
                "n_risk": [int(g["t"].size)] + n_risk.tolist(),
                "n_events": [0] + g["d"].tolist(),
                "cumulative_hazard": [0.0] + H.tolist(),
                "survival": [1.0] + surv.tolist(),
                "se_cumulative_hazard": [0.0] + seH.tolist(),
                "se_survival": [0.0] + (surv * seH).tolist(),
                "lower": [1.0] + (surv * np.exp(-zcrit * seH)).tolist(),
                "upper": [1.0] + np.minimum(1.0, surv * np.exp(zcrit * seH)).tolist(),
            })
        return {"label": label, "covariates": values, "strata": out}

    baseline = curve_for(-means, "baseline (all covariates 0)", None)
    profiles = curves_at if curves_at else [None]
    curves = []
    for k, prof in enumerate(profiles):
        if prof is None:
            row = means.copy()
            label = "at covariate means"
            values = {lab: float(m) for lab, m in zip(labels, means)}
        else:
            row = _profile_row(terms, prof, means, labels)
            label = prof.get("label") if isinstance(prof, dict) and \
                prof.get("label") else f"profile {k + 1}"
            values = {lab: float(v) for lab, v in zip(labels, row)}
        curves.append(curve_for(row - means, label, values))

    def per_input(vals):
        full = [None] * n_in
        for pos_, i in enumerate(keep):
            full[i] = float(vals[pos_])
        return full

    return {
        "analysis": "cox",
        "ties": ties,
        "hazard_method": hazard_method,
        "n": int(n), "n_events": n_events, "n_excluded": n_in - n,
        "strata": slabels if strata_vals is not None else None,
        "terms": [{k: v for k, v in term.items() if k != "values"}
                  for term in terms],
        "coefficients": coefs,
        "term_tests": term_tests,
        "covariance": cov.tolist(),
        "means": {lab: float(m) for lab, m in zip(labels, means)},
        "loglik_null": float(fit["loglik0"]),
        "loglik": float(fit["loglik"]),
        "aic": float(-2 * fit["loglik"] + 2 * p),
        "iterations": fit["iterations"],
        "converged": fit["converged"],
        "tests": tests,
        "concordance": conc,
        "baseline": baseline,
        "curves": curves,
        "ph_test": {"transform": ph_transform, "terms": zph_terms,
                    "global": {"chi2": chi2g, "df": p,
                               "p": float(stats.chi2.sf(chi2g, p))}},
        "schoenfeld": {
            "time": sch_time.tolist(),
            "transformed_time": tt[sch_subj].tolist(),
            "stratum": [slabels[s] for s in sch_strat],
            "subject": [keep[i] for i in sch_subj],
            "columns": labels,
            "residuals": schoen.tolist(),
            "scaled": scaled.tolist(),
        },
        "residuals": {"martingale": per_input(mart),
                      "deviance": per_input(dev)},
        "linear_predictor": per_input(eta_c),
        "warnings": warnings,
    }
