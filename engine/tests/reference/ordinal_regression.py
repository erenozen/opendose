"""Reference values for P-88 (ordinal, proportional-odds regression):
engine/tests/test_ordinal_regression.py, the e2e step and the ui-stage
fixture.

R is not installed (ordinal::clm and MASS::polr not available). Oracles:

- statsmodels.miscmodels.ordinal_model.OrderedModel(distr="logit") for
  the coefficients, SEs, thresholds and log-likelihoods. statsmodels
  reports the first threshold and then log increments; they are converted
  here to the thresholds theta_j = theta_1 + sum exp(increments). Its
  model is logit P(Y <= j) = theta_j - x'beta, the parameterisation of
  ordinal::clm (and of the engine). Its SEs come from a numerical
  Hessian of the transformed parameters, so the threshold SEs are taken
  by the delta method through the Jacobian of that transform.
- Profile-likelihood CIs: OrderedModel refitted with the coefficient
  fixed through its `offset`, the root of 2 (LL_max - LL(b)) = chi2(0.95, 1)
  found with brentq.
- Proportional-odds check: the partial proportional-odds model (a term's
  effect free at every threshold; Peterson & Harrell 1990) written out
  here as its own log-likelihood and maximised with scipy.optimize
  (BFGS from the proportional-odds fit, then Nelder-Mead polish), not
  the engine's Newton iteration.

Published check (asserted in the test, not generated here): Christensen,
"Cumulative link models for ordinal regression with the R package
ordinal" (the package's clm_article vignette, CRAN, section 4.1 and 4.2),
on the wine data of Randall (1989), rating ~ temp + contact: estimates
2.5031 (SE 0.5287) and 1.5278 (SE 0.4766); thresholds -1.3444, 1.2508,
3.4669, 5.0064 (SEs 0.5171, 0.4379, 0.5978, 0.7309); logLik -86.492, AIC
184.98; drop1 LRT 26.928 and 11.043; confint (profile) 1.5097627 to
3.595225 and 0.6157925 to 2.492404; nominal_test logLik -84.904 (temp,
LRT 3.1750, P 0.3654) and -86.209 (contact, LRT 0.5667, P 0.9040).
Data: engine/tests/fixtures/wine.csv, the Rdatasets copy of
ordinal::wine (Randall 1989, "The analysis of sensory data by
generalized linear model", Biometrical Journal 31:781; 72 ratings, 9
judges).

The histology example (e2e and ui-stage): EAE-like scores 0 to 4 in two
groups over three experiments, defined below.

Run from the repository root:
  /home/eren/opendose/.venv/bin/python engine/tests/reference/ordinal_regression.py
"""
import csv
import warnings
import json
import os

import numpy as np
import pandas as pd
from scipy import stats
from scipy.optimize import brentq, minimize
from scipy.special import expit
from statsmodels.miscmodels.ordinal_model import OrderedModel
import statsmodels.api as sm

HERE = os.path.dirname(__file__)
# BFGS stops on its gradient tolerance (1e-10), which statsmodels reports as
# not converged; the estimates agree with the published clm fit to 1e-7
warnings.filterwarnings("ignore", message="Maximum Likelihood optimization")


def wine():
    with open(os.path.join(HERE, "..", "fixtures", "wine.csv")) as fh:
        return pd.DataFrame(list(csv.DictReader(fh)))


def dummies(df, cols, refs):
    """Treatment coding against the given reference levels, columns in
    level order of first appearance (as the engine codes them)."""
    out = {}
    for c in cols:
        if c in refs:
            levels = list(dict.fromkeys(df[c]))
            for lev in levels:
                if lev != refs[c]:
                    out[f"{c}[{lev}]"] = (df[c] == lev).astype(float)
        else:
            out[c] = df[c].astype(float)
    return pd.DataFrame(out)


def ordered(y, X, offset=None):
    """OrderedModel fit; thresholds converted and their SEs by the delta
    method."""
    m = OrderedModel(np.asarray(y), np.asarray(X), offset=offset, distr="logit")
    r = m.fit(method="bfgs", maxiter=5000, gtol=1e-10, disp=False)
    p = X.shape[1]
    params = np.asarray(r.params)
    cov = np.asarray(r.cov_params())
    raw = params[p:]
    th = np.r_[raw[0], raw[0] + np.cumsum(np.exp(raw[1:]))]
    J1 = th.size
    jac = np.zeros((J1, J1))
    jac[:, 0] = 1.0
    for j in range(1, J1):
        jac[j, 1:j + 1] = np.exp(raw[1:j + 1])
    th_cov = jac @ cov[p:, p:] @ jac.T
    return {"beta": params[:p].tolist(), "beta_se": np.sqrt(np.diag(cov[:p, :p])).tolist(),
            "thresholds": th.tolist(), "threshold_se": np.sqrt(np.diag(th_cov)).tolist(),
            "llf": float(r.llf)}


def profile_ci(y, X, j, fit, level=0.95):
    q = stats.chi2.ppf(level, 1)
    others = np.delete(np.asarray(X), j, axis=1)
    xj = np.asarray(X)[:, j]

    def dev(b):
        sub = ordered(y, others, offset=b * xj)  # x'beta enters as +offset
        return 2 * (fit["llf"] - sub["llf"]) - q

    b, s = fit["beta"][j], fit["beta_se"][j]
    out = []
    for sign in (-1, 1):
        lo, hi = b, b + sign * s
        while dev(hi) < 0:
            lo, hi = hi, hi + sign * s
        out.append(float(brentq(dev, min(lo, hi), max(lo, hi), xtol=1e-9)))
    return out


def nominal_ll(y, J, X, Z):
    """Max log-likelihood of logit P(Y <= j) = theta_j + Z gamma_j - X beta
    (scipy.optimize on a hand-written likelihood)."""
    y = np.asarray(y, int)
    X = np.asarray(X, float)
    Z = np.asarray(Z, float)
    n, p = X.shape
    q = Z.shape[1]

    def unpack(v):
        return v[:J - 1], v[J - 1:J - 1 + (J - 1) * q].reshape(J - 1, q), v[J - 1 + (J - 1) * q:]

    def negll(v):
        th, g, b = unpack(v)
        eta = th[None, :] + Z @ g.T - (X @ b)[:, None]       # n x (J-1)
        cum = np.c_[np.zeros(n), expit(eta), np.ones(n)]
        pr = cum[np.arange(n), y + 1] - cum[np.arange(n), y]
        if np.any(pr <= 0):
            return 1e10
        return -float(np.sum(np.log(pr)))

    po = ordered(y, np.c_[X, Z])
    start = np.r_[po["thresholds"], np.tile(-np.array(po["beta"][p:]), J - 1), po["beta"][:p]]
    r = minimize(negll, start, method="BFGS", options={"gtol": 1e-9, "maxiter": 20000})
    r = minimize(negll, r.x, method="Nelder-Mead",
                 options={"xatol": 1e-10, "fatol": 1e-12, "maxiter": 40000, "maxfev": 80000})
    return -float(r.fun), po["llf"]


def histology():
    """Scores 0 to 4 for vehicle and drug in three experiments, 6 animals
    per group and experiment (a made-up EAE study)."""
    data = {
        ("Vehicle", "Exp1"): [2, 3, 3, 4, 2, 3],
        ("Drug", "Exp1"): [1, 2, 1, 0, 2, 1],
        ("Vehicle", "Exp2"): [3, 4, 4, 3, 2, 4],
        ("Drug", "Exp2"): [2, 1, 3, 2, 1, 2],
        ("Vehicle", "Exp3"): [2, 2, 3, 1, 3, 2],
        ("Drug", "Exp3"): [0, 1, 1, 2, 0, 1],
    }
    rows = []
    for exp in ("Exp1", "Exp2", "Exp3"):
        for grp in ("Vehicle", "Drug"):
            for s in data[(grp, exp)]:
                rows.append({"Group": grp, "Experiment": exp, "Score": s})
    return pd.DataFrame(rows)


def main():
    out = {}
    w = wine()
    w["rating"] = w["rating"].astype(int)
    y = w["rating"] - 1
    refs = {"temp": "cold", "contact": "no", "judge": "1"}
    X = dummies(w, ["temp", "contact"], refs)
    fit = ordered(y, X)
    fit["columns"] = list(X.columns)
    fit["profile_ci"] = [profile_ci(y, X, j, fit) for j in range(X.shape[1])]
    fit["drop1_llf"] = [ordered(y, X.drop(columns=[c]))["llf"] for c in X.columns]
    # thresholds only: the multinomial log-likelihood of the level counts
    fit["null_llf"] = float(np.sum([c * np.log(c / len(y)) for c in np.bincount(y)]))
    nom = {}
    for name in ("temp", "contact"):
        others = [c for c in X.columns if not c.startswith(name)]
        mine = [c for c in X.columns if c.startswith(name)]
        ll_nom, ll_po = nominal_ll(y, 5, X[others], X[mine])
        lr = 2 * (ll_nom - ll_po)
        nom[name] = {"llf": ll_nom, "LR": lr, "df": 3, "p": float(stats.chi2.sf(lr, 3))}
    fit["nominal"] = nom
    out["wine"] = fit

    Xj = dummies(w, ["temp", "contact", "judge"], refs)
    fj = ordered(y, Xj)
    fj["columns"] = list(Xj.columns)
    out["wine_judge"] = fj

    h = histology()
    Xh = dummies(h, ["Group", "Experiment"], {"Group": "Vehicle", "Experiment": "Exp1"})
    fh = ordered(h["Score"], Xh)
    fh["columns"] = list(Xh.columns)
    fh["profile_ci"] = [profile_ci(h["Score"], Xh, 0, fh)]
    fh["drop1_llf"] = [ordered(h["Score"], Xh.drop(columns=[c for c in Xh.columns
                                                            if c.startswith(t)]))["llf"]
                       for t in ("Group", "Experiment")]
    ll_nom, _ = nominal_ll(h["Score"], 5, Xh.drop(columns=["Group[Drug]"]), Xh[["Group[Drug]"]])
    fh["nominal_group"] = {"llf": ll_nom, "LR": 2 * (ll_nom - fh["llf"]), "df": 3,
                           "p": float(stats.chi2.sf(2 * (ll_nom - fh["llf"]), 3))}
    fh["data"] = {"group": h["Group"].tolist(), "experiment": h["Experiment"].tolist(),
                  "score": h["Score"].tolist()}
    out["histology"] = fh

    # two levels: the cumulative logit is logistic regression with the
    # sign of the slope kept and theta = -intercept
    yb = (w["rating"] >= 3).astype(float)
    lg = sm.Logit(yb, sm.add_constant(X)).fit(disp=0, tol=1e-12)
    out["two_levels"] = {"cut": 3, "intercept": float(lg.params.iloc[0]),
                         "beta": lg.params.iloc[1:].tolist(), "se": lg.bse.iloc[1:].tolist(),
                         "llf": float(lg.llf)}

    with open(os.path.join(HERE, "ordinal_regression.json"), "w") as fh_:
        json.dump(out, fh_, indent=1)
        fh_.write("\n")


if __name__ == "__main__":
    main()
