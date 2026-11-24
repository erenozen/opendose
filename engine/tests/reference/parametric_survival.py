"""Reference values for P-91 (parametric survival: exponential, Weibull and
log-normal AFT models): engine/tests/test_parametric_survival.py, the e2e
step and the ui-stage fixture.

R is not installed (survival::survreg not available). Oracles:

1. An independent censored maximum-likelihood fit written here: the
   log-likelihood of log T = x'b + s W written from the densities in
   scipy.stats (gumbel_l for the Weibull's extreme-value W, norm for the
   log-normal), maximised with scipy.optimize.minimize (BFGS, then
   Nelder-Mead polish), standard errors from a central finite-difference
   Hessian, percentiles exp(x'b + s w_p) with the delta method on a
   finite-difference gradient. The engine uses Newton-Raphson on analytic
   derivatives instead.

2. lifelines 0.30.3 (WeibullAFTFitter, LogNormalAFTFitter; installed
   only for this script: pip install lifelines==0.30.3, not a project
   dependency). lifelines' lambda_ coefficients are survreg's, its rho_
   is 1 / scale (Weibull); its mu_ and sigma_ are the log-normal's.

3. Closed form for the exponential model with one group factor: the
   rate of group g is d_g / T_g (events over total time), so the
   intercept is log(T_1 / d_1), the group coefficient log(T_g d_1 /
   (T_1 d_g)), with SE sqrt(1/d_1 + 1/d_g) (Collett 2015, section 5.1).

4. Published survreg output: Therneau, "The survival package" vignette
   (survival.pdf, CRAN, section 4.1, fetched 2026-11-24):
   survreg(Surv(time, status) ~ age + sex + ph.karno, data = lung,
   dist = 'weibull'): coefficients 5.326344, -0.008910282, 0.3701786,
   0.009263843; Scale = 0.7551354; Loglik(model) = -1138.7,
   Loglik(intercept only) = -1147.5; n = 227. survreg stops at a
   relative log-likelihood change of 1e-9, so its printed coefficients
   agree with the exact maximum to about 5 significant digits.

Data: engine/tests/fixtures/ovarian.csv and lung.csv (Rdatasets copies
of survival::ovarian and survival::cancer).

Run from the repository root:
  PYTHONPATH=<dir with lifelines> /home/eren/opendose/.venv/bin/python \
    engine/tests/reference/parametric_survival.py
"""
import csv
import json
import math
import os
import warnings

import numpy as np
from scipy import optimize, stats

HERE = os.path.dirname(__file__)
FIX = os.path.join(HERE, "..", "fixtures")
Z95 = stats.norm.ppf(0.975)


def negll(params, dist, X, t, e):
    p = X.shape[1]
    b = params[:p]
    s = 1.0 if dist == "exponential" else math.exp(params[p])
    w = (np.log(t) - X @ b) / s
    if dist == "lognormal":
        logf, logS = stats.norm.logpdf(w), stats.norm.logsf(w)
    else:
        logf, logS = stats.gumbel_l.logpdf(w), stats.gumbel_l.logsf(w)
    # density of T: f_W(w) / (s t) for events, S_W(w) for censored
    ll = np.where(e == 1, logf - math.log(s) - np.log(t), logS)
    return -float(np.sum(ll))


def hessian(f, x, h=1e-4):
    k = len(x)
    H = np.zeros((k, k))
    for i in range(k):
        for j in range(k):
            ei = np.eye(k)[i] * h
            ej = np.eye(k)[j] * h
            H[i, j] = (f(x + ei + ej) - f(x + ei - ej) - f(x - ei + ej) + f(x - ei - ej)) / (4 * h * h)
    return H


def fit(dist, X, t, e):
    p = X.shape[1]
    k = p + (0 if dist == "exponential" else 1)
    x0 = np.zeros(k)
    x0[0] = float(np.log(t).mean())
    fun = lambda q: negll(q, dist, X, t, e)  # noqa: E731
    r = optimize.minimize(fun, x0, method="BFGS", options={"gtol": 1e-10, "maxiter": 10000})
    r = optimize.minimize(fun, r.x, method="Nelder-Mead",
                          options={"xatol": 1e-12, "fatol": 1e-14, "maxiter": 40000})
    r = optimize.minimize(fun, r.x, method="BFGS", options={"gtol": 1e-11, "maxiter": 10000})
    V = np.linalg.inv(hessian(fun, r.x))
    return r.x, V, -r.fun


def wq(dist, p):
    return stats.norm.ppf(p) if dist == "lognormal" else math.log(-math.log(1 - p))


def percentile(dist, theta, V, x, p):
    k = len(x)

    def logt(q):
        s = 1.0 if dist == "exponential" else math.exp(q[k])
        return float(np.dot(x, q[:k]) + s * wq(dist, p))
    lt = logt(theta)
    g = np.array([(logt(theta + np.eye(len(theta))[i] * 1e-6) - logt(theta - np.eye(len(theta))[i] * 1e-6)) / 2e-6
                  for i in range(len(theta))])
    se = math.sqrt(g @ V @ g)
    return {"time": math.exp(lt), "ci": [math.exp(lt - Z95 * se), math.exp(lt + Z95 * se)], "se_log": se}


def ovarian():
    with open(os.path.join(FIX, "ovarian.csv")) as f:
        rows = list(csv.DictReader(f))
    t = np.array([float(r["futime"]) for r in rows])
    e = np.array([int(r["fustat"]) for r in rows], float)
    rx2 = np.array([1.0 if r["rx"] == "2" else 0.0 for r in rows])
    return t, e, rx2


def lung():
    with open(os.path.join(FIX, "lung.csv")) as f:
        rows = [r for r in csv.DictReader(f) if r["ph.karno"] != ""]
    t = np.array([float(r["time"]) for r in rows])
    e = np.array([int(r["status"]) - 1 for r in rows], float)
    X = np.array([[1.0, float(r["age"]), float(r["sex"]), float(r["ph.karno"])] for r in rows])
    return t, e, X


def main():
    out = {}
    t, e, rx2 = ovarian()
    X = np.column_stack([np.ones_like(t), rx2])
    ov = {}
    for dist in ("weibull", "exponential", "lognormal"):
        theta, V, ll = fit(dist, X, t, e)
        se = np.sqrt(np.diag(V))
        groups = {}
        for name, x in (("rx 1", [1.0, 0.0]), ("rx 2", [1.0, 1.0])):
            groups[name] = {str(p): percentile(dist, theta, V, np.array(x), p) for p in (0.25, 0.5, 0.75)}
        k = 2 if dist == "exponential" else 3
        ov[dist] = {"coef": theta[:2].tolist(), "se": se[:2].tolist(),
                    "scale": 1.0 if dist == "exponential" else math.exp(theta[2]),
                    "log_scale_se": None if dist == "exponential" else float(se[2]),
                    "loglik": ll, "aic": -2 * ll + 2 * k, "percentiles": groups,
                    "time_ratio": math.exp(theta[1]),
                    "time_ratio_ci": [math.exp(theta[1] - Z95 * se[1]), math.exp(theta[1] + Z95 * se[1])]}
        th0, _, ll0 = fit(dist, np.ones((len(t), 1)), t, e)
        ov[dist]["loglik_null"] = ll0
        ov[dist]["lr_chi2"] = 2 * (ll - ll0)
    # closed form, exponential
    d1, d2 = e[rx2 == 0].sum(), e[rx2 == 1].sum()
    T1, T2 = t[rx2 == 0].sum(), t[rx2 == 1].sum()
    ov["exponential_closed_form"] = {"coef": [math.log(T1 / d1), math.log(T2 * d1 / (T1 * d2))],
                                     "se": [math.sqrt(1 / d1), math.sqrt(1 / d1 + 1 / d2)],
                                     "median": {"rx 1": math.log(2) * T1 / d1, "rx 2": math.log(2) * T2 / d2}}
    try:
        import pandas as pd
        from lifelines import LogNormalAFTFitter, WeibullAFTFitter
        df = pd.DataFrame({"T": t, "E": e, "rx2": rx2})
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            w = WeibullAFTFitter().fit(df, "T", "E")
            ln = LogNormalAFTFitter().fit(df, "T", "E")
        ov["lifelines"] = {
            "weibull": {"coef": [float(w.params_["lambda_"]["Intercept"]), float(w.params_["lambda_"]["rx2"])],
                        "scale": 1 / math.exp(float(w.params_["rho_"]["Intercept"])),
                        "loglik": float(w.log_likelihood_),
                        "median": [float(v) for v in w.predict_median(pd.DataFrame({"rx2": [0.0, 1.0]})).values]},
            "lognormal": {"coef": [float(ln.params_["mu_"]["Intercept"]), float(ln.params_["mu_"]["rx2"])],
                          "scale": math.exp(float(ln.params_["sigma_"]["Intercept"])),
                          "loglik": float(ln.log_likelihood_),
                          "median": [float(v) for v in ln.predict_median(pd.DataFrame({"rx2": [0.0, 1.0]})).values]},
            "version": "lifelines 0.30.3"}
    except ImportError:
        print("lifelines not installed: its cross-check is skipped")
    out["ovarian"] = ov
    out["ovarian_data"] = {"futime": t.tolist(), "fustat": e.astype(int).tolist(),
                           "rx": [2 if v else 1 for v in rx2]}

    t, e, X = lung()
    theta, V, ll = fit("weibull", X, t, e)
    out["lung_weibull"] = {"coef": theta[:4].tolist(), "scale": math.exp(theta[4]), "loglik": ll,
                           "se": np.sqrt(np.diag(V))[:4].tolist(), "n": len(t),
                           "published": {"coef": [5.326344, -0.008910282, 0.3701786, 0.009263843],
                                         "scale": 0.7551354, "loglik": -1138.7,
                                         "loglik_null": -1147.5, "n": 227}}
    with open(os.path.join(HERE, "parametric_survival.json"), "w") as f:
        json.dump(out, f, indent=1)
    print(json.dumps({k: v for k, v in out.items() if k != "ovarian_data"}, indent=1)[:4000])


if __name__ == "__main__":
    main()
