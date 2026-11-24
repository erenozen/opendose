"""Reference values for P-89 (Firth's logistic regression):
engine/tests/test_firth_logistic.py, the e2e step and the ui-stage fixture.

R is not installed (logistf not available). The oracle is an independent
implementation of the same estimator: Firth's penalized log-likelihood
l(b) + log|X'WX| / 2 maximised with scipy.optimize.minimize (BFGS on the
analytic gradient, then Newton-CG), not the engine's modified-score
Newton iteration. The profile penalized-likelihood CIs refit with the
coefficient fixed (penalty on the full model's information, as logistf
does) and solve 2 (pl_max - pl_j(b)) = chi2(0.95, 1) with brentq; the
penalized likelihood ratio test of each coefficient is 2 (pl_max -
pl_j(0)).

Published check: on the endometrial cancer data of Heinze & Schemper 2002
(Stat Med 21:2409; 79 patients, HG ~ NV + PI + EH; NV separates the
outcome), the brglm2 README prints the bias-reduced (= Firth for the
logistic model) fit: estimates 3.77456, 2.92927, -0.03475, -2.60416 and
SEs 1.48869, 1.55076, 0.03958, 0.77602; the engine test asserts those
too. Data: engine/tests/fixtures/endometrial.csv, the Rdatasets copy of
OncoDataSets::EndometrialCancer_df (from the enrichwith package).

The acceptance data: a two-group dose study where every treated animal
responds (10 per group, 3 of 10 control responders). With one binary
predictor Firth's estimate equals adding 1/2 to every cell of the 2x2
table: OR = (10.5 x 7.5) / (0.5 x 3.5) = 45.

Run from the repository root:
  /home/eren/opendose/.venv/bin/python engine/tests/reference/firth_logistic.py
"""
import csv
import json
import os

import numpy as np
from scipy import stats
from scipy.optimize import brentq, minimize
from scipy.special import expit

HERE = os.path.dirname(__file__)


def pll(X, y, b):
    eta = X @ b
    p = expit(eta)
    sign, logdet = np.linalg.slogdet(X.T @ (X * (p * (1 - p))[:, None]))
    return float(np.sum(y * eta - np.logaddexp(0, eta)) + 0.5 * logdet)


def grad(X, y, b):
    p = expit(X @ b)
    w = p * (1 - p)
    inv = np.linalg.inv(X.T @ (X * w[:, None]))
    h = np.einsum("ij,jk,ik->i", X, inv, X) * w
    return X.T @ (y - p + h * (0.5 - p))


def maximise(X, y, b0, free):
    b0 = np.array(b0, float)

    def full(bf):
        b = b0.copy()
        b[free] = bf
        return b
    f = lambda bf: -pll(X, y, full(bf))  # noqa: E731
    g = lambda bf: -grad(X, y, full(bf))[free]  # noqa: E731
    r = minimize(f, b0[free], jac=g, method="BFGS", options={"gtol": 1e-11, "maxiter": 10000})
    r = minimize(f, r.x, jac=g, method="Newton-CG",
                 hess=lambda bf: _hess(X, full(bf))[np.ix_(free, free)],
                 options={"xtol": 1e-14, "maxiter": 1000})
    return full(r.x), -r.fun


def _hess(X, b):
    # Fisher information: close enough to the penalized Hessian for Newton-CG's steps
    p = expit(X @ b)
    return X.T @ (X * (p * (1 - p))[:, None])


def firth(X, y):
    k = X.shape[1]
    b, pmax = maximise(X, y, np.zeros(k), list(range(k)))
    se = np.sqrt(np.diag(np.linalg.inv(_hess(X, b))))
    q = stats.chi2.ppf(0.95, 1)
    cis, chi2s = [], []
    for j in range(k):
        others = [i for i in range(k) if i != j]

        def prof(v):
            b0 = b.copy()
            b0[j] = v
            return 2 * (pmax - maximise(X, y, b0, others)[1])
        cis.append([float(brentq(lambda v: prof(v) - q, b[j] - 8 * se[j], b[j], xtol=1e-12)),
                    float(brentq(lambda v: prof(v) - q, b[j], b[j] + 8 * se[j], xtol=1e-12))])
        chi2s.append(float(prof(0.0)))
    b0 = np.zeros(k)
    b0[0] = b[0]
    null = maximise(X, y, b0, [0])[1]
    g = 2 * (pmax - null)
    return {"estimates": b.tolist(), "se": se.tolist(), "profile_ci": cis,
            "chi2": chi2s, "p": [float(stats.chi2.sf(c, 1)) for c in chi2s],
            "odds_ratio": np.exp(b).tolist(), "odds_ratio_ci": np.exp(cis).tolist(),
            "penalized_loglik": pmax,
            "lr_test": {"chi2": float(g), "df": k - 1, "p": float(stats.chi2.sf(g, k - 1))}}


def main():
    with open(os.path.join(HERE, "..", "fixtures", "endometrial.csv")) as fh:
        rows = list(csv.DictReader(fh))
    X = np.array([[1, float(r["NV"]), float(r["PI"]), float(r["EH"])] for r in rows])
    y = np.array([float(r["HG"]) for r in rows])
    endo = firth(X, y)
    group = ["Control"] * 10 + ["Treated"] * 10
    response = [1, 0, 0, 1, 0, 0, 0, 1, 0, 0] + [1] * 10
    Xd = np.column_stack([np.ones(20), [1.0 if g == "Treated" else 0.0 for g in group]])
    dose = firth(Xd, np.array(response, float))
    dose["data"] = {"group": group, "response": response}
    out = {"endometrial": endo, "dose_study": dose}
    with open(os.path.join(HERE, "firth_logistic.json"), "w") as fh:
        json.dump(out, fh, indent=2)
    print(json.dumps({"endometrial": {k: endo[k] for k in ("estimates", "se", "profile_ci", "chi2")},
                      "dose OR": dose["odds_ratio"][1], "dose OR CI": dose["odds_ratio_ci"][1],
                      "dose p": dose["p"][1]}, indent=1))


if __name__ == "__main__":
    main()
