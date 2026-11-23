"""Independent reference for the Weibull and hormesis dose-response
models (FEATURE-PLAN P-19). R and drc are not installed here, so the
oracle is scipy.optimize.least_squares on the published model formulas,
written here without any OpenDose code:

- Weibull type 1 and 2 (drc W1.4, W2.4; Ritz C (2010) Environ Toxicol
  Chem 29:220-229, eqs. for the two Weibull models; drc's weibull1 /
  weibull2 help pages):
    W1.4  f(x) = c + (d - c) exp(-exp(b (log x - log e)))
    W2.4  f(x) = c + (d - c) (1 - exp(-exp(b (log x - log e))))
- Brain-Cousens hormesis (Brain P, Cousens R (1989) Weed Res 29:93-96;
  drc BC.5, and BC.4 with c = 0):
    f(x) = c + (d - c + f x) / (1 + exp(b (log x - log e)))
- Cedergreen-Ritz-Streibig hormesis (Cedergreen N, Ritz C, Streibig JC
  (2005) Environ Toxicol Chem 24:3166-3172; drc CRS.5a, and CRS.4a with
  c = 0; alpha = 1):
    f(x) = c + (d - c + f exp(-1 / x^alpha)) / (1 + exp(b (log x - log e)))

The zero dose stays in the fit (all four are written on the
concentration scale). Least squares from a grid of starts, the best kept;
covariance s^2 (J'J)^-1 with a central-difference Jacobian (the
Gauss-Newton covariance of R's nls and of OpenDose, pinned in the tests)
and, separately, s^2 (H/2)^-1 with H the central-difference Hessian of
the residual sum of squares (what drc's summary and ED report: it
reproduces the published drc standard errors below); ED p solved
numerically on a dense log-concentration grid (bisection) as the
concentration where the curve has moved p% of the way from its value at
zero concentration (d) to its high-concentration limit (c), the
definition of drc's "relative" ED; delta-method SE by central
differences and a t(0.975, df) interval, as drc's ED(interval =
"delta").

Anchor: the same code fits drc's LL.3 to ryegrass (f(x) = d / (1 +
exp(b (log x - log e)))) and is checked against the values Ritz et al.
(2015) print in their S1 File (Example 2): b = 2.47033 (SE 0.34168),
d = 7.85543 (0.20438), e = 3.26336 (0.19641), ED10 = 1.34086 (0.94773
to 1.7340). The estimates and EDs match with either covariance; the
standard errors and ED intervals match with the Hessian one ("_drc"
keys), so the data copy and the method agree with drc before the new
models are pinned.

Run: /home/eren/opendose/.venv/bin/python engine/tests/reference/weibull_hormesis.py
writes weibull_hormesis.json next to this file.
"""

from __future__ import annotations

import itertools
import json
from pathlib import Path

import numpy as np
from scipy import stats
from scipy.optimize import least_squares

HERE = Path(__file__).resolve().parent
DATA = json.loads((HERE.parent / "fixtures" / "drc_datasets.json").read_text())


def _u(x, b, e):
    """exp(b (log x - log e)) = (x / e)^b, with x = 0 as its limit."""
    with np.errstate(all="ignore"):
        return np.power(np.asarray(x, float) / e, b)


def ll3(x, b, d, e):
    return d / (1 + _u(x, b, e))


def w1(x, b, c, d, e):
    return c + (d - c) * np.exp(-_u(x, b, e))


def w2(x, b, c, d, e):
    return c + (d - c) * (1 - np.exp(-_u(x, b, e)))


def bc5(x, b, c, d, e, f):
    return c + (d - c + f * np.asarray(x, float)) / (1 + _u(x, b, e))


def bc4(x, b, d, e, f):
    return bc5(x, b, 0.0, d, e, f)


def crs5(x, b, c, d, e, f, alpha=1.0):
    x = np.asarray(x, float)
    with np.errstate(all="ignore"):
        h = np.where(x > 0, np.exp(-1.0 / np.power(np.where(x > 0, x, 1.0),
                                                     alpha)), 0.0)
    return c + (d - c + f * h) / (1 + _u(x, b, e))


def crs4(x, b, d, e, f):
    return crs5(x, b, 0.0, d, e, f)


MODELS = {
    "LL3": (ll3, ["b", "d", "e"]),
    "W1.4": (w1, ["b", "c", "d", "e"]),
    "W2.4": (w2, ["b", "c", "d", "e"]),
    "BC.5": (bc5, ["b", "c", "d", "e", "f"]),
    "BC.4": (bc4, ["b", "d", "e", "f"]),
    "CRS.5a": (crs5, ["b", "c", "d", "e", "f"]),
    "CRS.4a": (crs4, ["b", "d", "e", "f"]),
}


def _jac(fun, x, p, rel=1e-6):
    J = np.empty((len(x), len(p)))
    for i in range(len(p)):
        h = rel * max(abs(p[i]), 1e-3)
        up, dn = np.array(p, float), np.array(p, float)
        up[i] += h
        dn[i] -= h
        J[:, i] = (fun(x, *up) - fun(x, *dn)) / (2 * h)
    return J


#: The sign of b that gives each model its own shape on a decreasing
#: curve (drc's self-starters start there): W1.4 and W2.4 are the same
#: family once b may change sign (W1.4 with b < 0 is W2.4 with b < 0 and
#: c, d swapped), so a fit free to flip b lands on whichever shape fits
#: better. The hormesis models need b > 0 (the f term otherwise grows
#: without bound): they are fitted with b bounded below by 0.
B_SIGN = {"LL3": 1, "W1.4": 1, "W2.4": -1, "BC.5": 1, "BC.4": 1,
          "CRS.5a": 1, "CRS.4a": 1}
HORMESIS = ("BC.5", "BC.4", "CRS.5a", "CRS.4a")


def fit(name, x, y):
    fun, names = MODELS[name]
    x, y = np.asarray(x, float), np.asarray(y, float)
    sign = B_SIGN[name]
    grids = {"b": [sign * v for v in (0.5, 1, 2, 4)],
             "c": [float(y.min()), 0.0],
             "d": [float(y.max()), float(np.mean(y[x == x.min()]))],
             "e": list(np.quantile(x[x > 0], [0.1, 0.3, 0.5, 0.7, 0.9])),
             "f": [0.0, 1.0]}
    lo = np.full(len(names), -np.inf)
    if name in HORMESIS:
        lo[0] = 0.0
    best = None
    for start in itertools.product(*(grids[n] for n in names)):
        try:
            with np.errstate(all="ignore"):
                if name in HORMESIS:
                    r = least_squares(lambda p: fun(x, *p) - y, start,
                                      bounds=(lo, np.inf), method="trf",
                                      x_scale="jac", xtol=1e-13, ftol=1e-13,
                                      gtol=1e-13, max_nfev=5000)
                else:
                    r = least_squares(lambda p: fun(x, *p) - y, start,
                                      method="lm", xtol=1e-15, ftol=1e-15,
                                      gtol=1e-15, max_nfev=20000)
        except ValueError:
            continue
        if not np.all(np.isfinite(r.fun)) or np.sign(r.x[0]) != sign:
            continue  # crossed to the other shape (Weibull) or failed
        sse = float(r.fun @ r.fun)
        if best is None or sse < best[1] - 1e-14:
            best = (r.x, sse)
    p, sse = best
    df = len(x) - len(names)
    s2 = sse / df
    J = _jac(fun, x, p)
    cov = s2 * np.linalg.inv(J.T @ J)
    return fun, names, p, cov, sse, df


def hessian_cov(fun, x, y, p, sse, df):
    """drc's covariance: s^2 (H/2)^-1, H the Hessian of the residual SS."""
    x, y = np.asarray(x, float), np.asarray(y, float)

    def ss(q):
        r = fun(x, *q) - y
        return float(r @ r)
    k = len(p)
    H = np.empty((k, k))
    for i in range(k):
        for j in range(k):
            hi, hj = 1e-4 * max(abs(p[i]), 1e-3), 1e-4 * max(abs(p[j]), 1e-3)

            def at(a, b):
                q = np.array(p, float)
                q[i] += a
                q[j] += b
                return ss(q)
            H[i, j] = (at(hi, hj) - at(hi, -hj) - at(-hi, hj)
                       + at(-hi, -hj)) / (4 * hi * hj)
    return np.linalg.inv(H / 2) * sse / df


def _limits(names, p):
    """(value at zero concentration, high-concentration limit)."""
    q = dict(zip(names, p))
    c = q.get("c", 0.0)
    d = q["d"]
    if names[0] == "b" and "c" in q and q["b"] < 0:
        return c, d
    return d, c


def ed(fun, names, p, pct, model):
    """Concentration where the curve has moved pct% of the way from its
    zero-concentration value to its high-concentration limit (bisection
    on a log grid, the first crossing)."""
    q = dict(zip(names, p))
    if model == "W2.4":
        z, inf = (q["d"], q["c"]) if q["b"] < 0 else (q["c"], q["d"])
    elif model in ("W1.4",):
        z, inf = (q["d"], q["c"]) if q["b"] > 0 else (q["c"], q["d"])
    else:
        z, inf = q["d"], q.get("c", 0.0)
    level = z + pct / 100.0 * (inf - z)
    t = np.linspace(np.log10(q["e"]) - 12, np.log10(q["e"]) + 12, 24001)
    g = (fun(10.0 ** t, *p) - level) * np.sign(z - level)
    i = int(np.argmax(g <= 0))
    lo, hi = t[i - 1], t[i]
    for _ in range(200):
        mid = (lo + hi) / 2
        gm = (fun(np.array([10.0 ** mid]), *p)[0] - level) * np.sign(z - level)
        lo, hi = (mid, hi) if gm > 0 else (lo, mid)
    return 10.0 ** ((lo + hi) / 2)


def ed_delta(fun, names, p, cov, df, pct, model):
    v = ed(fun, names, p, pct, model)
    g = np.empty(len(p))
    for i in range(len(p)):
        h = 1e-6 * max(abs(p[i]), 1e-3)
        up, dn = np.array(p, float), np.array(p, float)
        up[i] += h
        dn[i] -= h
        g[i] = (ed(fun, names, up, pct, model)
                - ed(fun, names, dn, pct, model)) / (2 * h)
    se = float(np.sqrt(g @ cov @ g))
    t = float(stats.t.ppf(0.975, df))
    return {"value": float(v), "se": se,
            "ci95": [float(v - t * se), float(v + t * se)]}


def run(name, x, y):
    fun, names, p, cov, sse, df = fit(name, x, y)
    hcov = hessian_cov(fun, x, y, p, sse, df)
    out = {"params": {n: {"value": float(v), "se": float(np.sqrt(cov[i, i])),
                          "se_drc": float(np.sqrt(hcov[i, i]))}
                      for i, (n, v) in enumerate(zip(names, p))},
           "ss_res": sse, "df": df, "sy_x": float(np.sqrt(sse / df))}
    for pct in (5, 10, 50, 90):
        out[f"ED{pct}"] = ed_delta(fun, names, p, cov, df, pct, name)
        drc = ed_delta(fun, names, p, hcov, df, pct, name)
        out[f"ED{pct}"].update(se_drc=drc["se"], ci95_drc=drc["ci95"])
    return out


def main():
    rye, let = DATA["ryegrass"], DATA["lettuce"]
    ref = {"ryegrass": {m: run(m, rye["conc"], rye["rootl"])
                        for m in ("LL3", "W1.4", "W2.4")},
           "lettuce": {m: run(m, let["conc"], let["weight"])
                       for m in ("BC.5", "BC.4", "CRS.5a", "CRS.4a",
                                 "W1.4")}}
    pub = DATA["published"]["ryegrass_LL3"]
    got = ref["ryegrass"]["LL3"]
    for k in ("b", "d", "e"):
        assert abs(got["params"][k]["value"] - pub[k][0]) < 6e-5, k
        assert abs(got["params"][k]["se_drc"] - pub[k][1]) < 6e-5, k
    for k in ("ED5", "ED10", "ED50"):
        assert abs(got[k]["value"] - pub[k][0]) < 6e-5, k
        assert abs(got[k]["se_drc"] - pub[k][1]) < 6e-5, k
        assert abs(got[k]["ci95_drc"][0] - pub[k][2]) < 6e-5, k
        assert abs(got[k]["ci95_drc"][1] - pub[k][3]) < 6e-4, k
    (HERE / "weibull_hormesis.json").write_text(
        json.dumps(ref, indent=1) + "\n")
    print(json.dumps(ref, indent=1))


if __name__ == "__main__":
    main()
