"""Reference values for P-86 (binomial and negative binomial regression):
engine/tests/test_count_glms.py, the e2e step and the ui-stage fixture.

R is not installed (glm(cbind(s, n - s) ~ ..., binomial / quasibinomial)
and MASS::glm.nb not available). The oracles:

Binomial: statsmodels GLM(endog = [s, n - s], family=Binomial()) for the
estimates, SEs, z, P, deviance and log-likelihood; quasi-binomial from
GLM(s / n, var_weights = n).fit(scale="X2", use_t=True) (R's quasibinomial
summary); the likelihood
ratio test of each term from the deviance of the model without it (R's
drop1(test = "LRT"); for quasi, F = drop / df / phi as drop1(test = "F"));
the profile-likelihood CIs by refitting statsmodels GLM with the
coefficient fixed through an offset and solving 2 (LL - LL_j(b)) =
chi2(0.95, 1) with brentq (R's confint.glm profiles the same likelihood).

Negative binomial: statsmodels discrete NegativeBinomial(loglike_method =
"nb2") maximises the same likelihood as MASS::glm.nb over beta and theta
= 1 / alpha jointly, so its estimates are glm.nb's; the SEs are those of
glm.nb's summary, the expected information at the estimated theta:
statsmodels GLM(family=NegativeBinomial(alpha = 1 / theta)). Profile CIs
as above with theta held at its estimate; the test against Poisson from
statsmodels Poisson's log-likelihood.

Data:
- dishes: the plan's acceptance test, 3 experiments x 2 groups, positives
  out of cells counted per dish (made up for this test);
- dishes_overdispersed: 3 experiments x 2 groups x 3 dishes with more
  variation between dishes than counting allows (made up);
- ames: TA98 revertants per plate at six doses of quinoline, Margolin,
  Kaplan & Zeiger 1981 (PNAS 78:3779), the brglm2 negativeBinomial
  vignette's data; its published maximum-likelihood fit (Kenne Pagui,
  Salvan & Sartori 2020, Table 2, via the brglm2 vignette) is asserted
  in the engine test as well: b = 2.1976 (SE 0.3246), dose -0.0010
  (0.0004), log(dose + 10) 0.3125 (0.0879), dispersion 1 / theta = 0.0488;
- quine: days absent from school, 146 children (Quine 1975; MASS::quine,
  Venables & Ripley 2002 section 7.4), engine/tests/fixtures/quine.csv
  from the Rdatasets copy of MASS; model Days ~ Eth + Sex + Age + Lrn.

Run from the repository root:
  /home/eren/opendose/.venv/bin/python engine/tests/reference/count_glms.py
"""
import csv
import json
import math
import os

import numpy as np
import statsmodels.api as sm
from scipy import stats
from scipy.optimize import brentq

HERE = os.path.dirname(__file__)

DISHES = {
    "experiment": ["E1", "E1", "E2", "E2", "E3", "E3"],
    "group": ["Control", "Treated"] * 3,
    "positive": [12, 31, 18, 40, 9, 27],
    "counted": [100, 100, 120, 115, 80, 90],
}
OVER = {
    "experiment": [e for e in ("E1", "E2", "E3") for _ in range(6)],
    "group": (["Control"] * 3 + ["Treated"] * 3) * 3,
    "positive": [8, 21, 13, 30, 52, 24, 15, 6, 22, 47, 28, 61, 10, 25, 5, 33, 58, 19],
    "counted": [100, 110, 95, 105, 120, 90, 100, 85, 115, 110, 100, 120, 90, 105, 80, 100, 115, 95],
}
AMES_DOSE = [0, 10, 33, 100, 333, 1000] * 3
AMES_FREQ = [15, 16, 16, 27, 33, 20, 21, 18, 26, 41, 38, 27, 29, 21, 33, 60, 41, 42]


def dummies(values, ref):
    levels = []
    for v in values:
        if v not in levels:
            levels.append(v)
    others = [lev for lev in levels if lev != ref]
    return np.array([[1.0 if v == lev else 0.0 for lev in others] for v in values]), others


def profile_ci(fit_at, X, j, ll_hat, b_hat, se, q=stats.chi2.ppf(0.95, 1)):
    """fit_at(X_without_j, offset) -> log-likelihood of the refitted model."""
    others = np.delete(X, j, axis=1)

    def dev(b):
        return 2 * (ll_hat - fit_at(others, b * X[:, j])) - q
    out = []
    for sign in (-1, 1):
        step, inner = se, b_hat
        outer = None
        for _ in range(40):
            cand = b_hat + sign * step
            if dev(cand) > 0:
                outer = cand
                break
            inner, step = cand, step * 2
        out.append(float(brentq(dev, min(inner, outer), max(inner, outer), xtol=1e-12)))
    return out


def binomial(data, quasi_too=True):
    s = np.array(data["positive"], float)
    n = np.array(data["counted"], float)
    g, _ = dummies(data["group"], "Control")
    e, _ = dummies(data["experiment"], "E1")
    X = np.column_stack([np.ones(len(s)), g, e])
    endog = np.column_stack([s, n - s])
    fam = sm.families.Binomial()
    fit = sm.GLM(endog, X, family=fam).fit(tol=1e-14)

    def fit_at(Xs, off):
        return sm.GLM(endog, Xs, family=fam, offset=off).fit(tol=1e-14).llf
    cis = [profile_ci(fit_at, X, j, fit.llf, fit.params[j], fit.bse[j]) for j in range(X.shape[1])]
    null = sm.GLM(endog, X[:, :1], family=fam).fit(tol=1e-14)
    terms = {"group": [1], "experiment": [2, 3]}
    lrt = {}
    for t, idx in terms.items():
        red = sm.GLM(endog, np.delete(X, idx, axis=1), family=fam).fit(tol=1e-14)
        drop = red.deviance - fit.deviance
        lrt[t] = {"drop": float(drop), "df": len(idx), "p": float(stats.chi2.sf(drop, len(idx)))}
    out = {
        "data": data,
        "estimates": fit.params.tolist(), "se": fit.bse.tolist(),
        "z": np.abs(fit.tvalues).tolist(), "p": fit.pvalues.tolist(),
        "profile_ci": cis, "odds_ratio_group": float(math.exp(fit.params[1])),
        "odds_ratio_group_ci": [math.exp(c) for c in cis[1]],
        "wald_ci": fit.conf_int().tolist(),
        "deviance": float(fit.deviance), "null_deviance": float(fit.null_deviance),
        "df_resid": float(fit.df_resid), "llf": float(fit.llf), "llf_null": float(null.llf),
        "pearson_chi2": float(fit.pearson_chi2), "phi": float(fit.pearson_chi2 / fit.df_resid),
        "aic": float(fit.aic), "term_lrt": lrt,
    }
    if quasi_too:
        # proportions with the totals as variance weights: statsmodels'
        # scale="X2" with the two-column endog leaves the totals out of the
        # Pearson chi2 it divides by df
        qf = sm.GLM(s / n, X, family=fam, var_weights=n).fit(scale="X2", use_t=True, tol=1e-14)
        phi = float(qf.scale)
        assert abs(phi - fit.pearson_chi2 / fit.df_resid) < 1e-9 * phi
        qterms = {}
        for t, v in lrt.items():
            f = v["drop"] / v["df"] / phi
            qterms[t] = {"F": f, "df1": v["df"], "df2": float(qf.df_resid),
                         "p": float(stats.f.sf(f, v["df"], qf.df_resid))}
        k = X.shape[1]
        f_all = (fit.null_deviance - fit.deviance) / (k - 1) / phi
        out["quasi"] = {"phi": phi, "se": qf.bse.tolist(), "t": np.abs(qf.tvalues).tolist(),
                        "p": qf.pvalues.tolist(), "ci": qf.conf_int().tolist(),
                        "terms": qterms,
                        "f_test": {"F": float(f_all), "df1": k - 1, "df2": float(qf.df_resid),
                                   "p": float(stats.f.sf(f_all, k - 1, qf.df_resid))}}
    return out


def negbin(X, y, names):
    model = sm.NegativeBinomial(y, X, loglike_method="nb2")
    rough = model.fit(start_params=np.r_[sm.Poisson(y, X).fit(disp=0).params, 0.1],
                      method="nm", maxiter=20000, disp=0)
    nb = model.fit(start_params=rough.params, method="bfgs", maxiter=5000, gtol=1e-12, disp=0)
    nb = model.fit(start_params=nb.params, method="newton", maxiter=200, tol=1e-14, disp=0)
    alpha = float(nb.params[-1])
    theta = 1 / alpha
    fam = sm.families.NegativeBinomial(alpha=alpha)
    glm = sm.GLM(y, X, family=fam).fit(tol=1e-14)

    def fit_at(Xs, off):
        return sm.GLM(y, Xs, family=fam, offset=off).fit(tol=1e-14).llf
    cis = [profile_ci(fit_at, X, j, glm.llf, glm.params[j], glm.bse[j]) for j in range(X.shape[1])]
    pois = sm.Poisson(y, X).fit(disp=0, method="newton", tol=1e-14)
    null = sm.NegativeBinomial(y, X[:, :1], loglike_method="nb2").fit(
        method="newton", maxiter=200, tol=1e-14, disp=0)
    lr_p = 2 * (nb.llf - pois.llf)
    g = 2 * (nb.llf - null.llf)
    k = X.shape[1]
    mu = glm.mu
    return {
        "names": names, "theta": theta, "alpha": alpha,
        "estimates": nb.params[:-1].tolist(), "glm_estimates": glm.params.tolist(),
        "se": glm.bse.tolist(), "z": np.abs(glm.tvalues).tolist(), "p": glm.pvalues.tolist(),
        "profile_ci": cis, "llf": float(nb.llf), "llf_null": float(null.llf),
        "lr_test": {"G": float(g), "df": k - 1, "p": float(stats.chi2.sf(g, k - 1))},
        "vs_poisson": {"LR": float(lr_p), "p": float(stats.chi2.sf(lr_p, 1) / 2)},
        "aic": float(-2 * nb.llf + 2 * (k + 1)),
        "pearson_phi": float(np.sum((y - mu) ** 2 / (mu + mu ** 2 / theta)) / (len(y) - k)),
    }


def ames():
    dose = np.array(AMES_DOSE, float)
    X = np.column_stack([np.ones(18), dose, np.log(dose + 10)])
    out = negbin(X, np.array(AMES_FREQ, float), ["Intercept", "Dose", "log(Dose + 10)"])
    out["data"] = {"dose": AMES_DOSE, "log_dose_plus_10": np.log(dose + 10).tolist(),
                   "revertants": AMES_FREQ}
    return out


def quine():
    with open(os.path.join(HERE, "..", "fixtures", "quine.csv")) as fh:
        rows = list(csv.DictReader(fh))
    y = np.array([float(r["Days"]) for r in rows])
    cols, names = [np.ones(len(rows))], ["Intercept"]
    for var in ("Eth", "Sex", "Age", "Lrn"):
        vals = [r[var] for r in rows]
        mat, others = dummies(vals, vals[0])
        cols.append(mat)
        names += [f"{var}[{lev}]" for lev in others]
    X = np.column_stack(cols)
    return negbin(X, y, names)


def main():
    out = {"dishes": binomial(DISHES), "dishes_overdispersed": binomial(OVER),
           "ames": ames(), "quine": quine()}
    with open(os.path.join(HERE, "count_glms.json"), "w") as fh:
        json.dump(out, fh, indent=2)
    d = out["dishes"]
    print(json.dumps({"dishes OR": d["odds_ratio_group"], "CI": d["odds_ratio_group_ci"],
                      "phi": d["phi"], "over phi": out["dishes_overdispersed"]["phi"],
                      "ames theta": out["ames"]["theta"], "ames b": out["ames"]["estimates"],
                      "ames se": out["ames"]["se"], "quine theta": out["quine"]["theta"]}, indent=1))


if __name__ == "__main__":
    main()
