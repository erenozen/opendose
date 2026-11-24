"""Reference values for engine/opendose/smooth.py (P-103), written to
smoothing.json. Run from the repository root:

    PYTHONPATH=engine .venv/bin/python engine/tests/reference/smoothing.py

R is not installed. The references are:
- R's own printed output for smooth.spline, from R's example transcript
  tests/Examples/stats-Ex.Rout.save (R source tree; the ?smooth.spline
  and ?predict.smooth.spline examples on the cars and y18 data), copied
  below as printed;
- an independent penalised regression on the cubic B-spline basis with
  knots at every distinct X (the basis R's smooth.spline uses), its
  penalty Gram matrix written out here with the Simpson constant c:
  c = 0.333 is R's sgram.f constant and reproduces R's printed df and
  fitted values; c = 1/3 is the exact penalty the engine uses;
- statsmodels.nonparametric.lowess (the LOWESS oracle; frac = R's f,
  it = R's iter, delta = R's delta passed explicitly because the two
  defaults differ: R 0.01 x range(X), statsmodels 0);
- a tridiagonal solve for the natural cubic spline written out here, and
  the textbook natural spline through e^x at 0, 1, 2, 3 (Burden & Faires,
  Numerical Analysis, 9th ed., 2011, section 3.5);
- PCHIP derivatives written out from Fritsch & Butland (1984) as Moler
  (Numerical Computing with MATLAB, 2004, section 3.4) gives them;
- Savitzky-Golay values from a numpy.polyfit of each window;
- derivatives and integrals of polynomials, known in closed form.
"""

import json
import math
import os

import numpy as np
from scipy.interpolate import BSpline
from statsmodels.nonparametric.smoothers_lowess import lowess as sm_lowess

HERE = os.path.dirname(os.path.abspath(__file__))

SPEED = [4, 4, 7, 7, 8, 9, 10, 10, 10, 11, 11, 12, 12, 12, 12, 13, 13, 13,
         13, 14, 14, 14, 14, 15, 15, 15, 16, 16, 17, 17, 17, 18, 18, 18, 18,
         19, 19, 19, 20, 20, 20, 20, 20, 22, 23, 24, 24, 24, 24, 25]
DIST = [2, 10, 4, 22, 16, 10, 18, 26, 34, 17, 28, 14, 20, 24, 28, 26, 34,
        34, 46, 26, 36, 60, 80, 20, 26, 54, 32, 40, 32, 40, 50, 42, 56, 76,
        84, 36, 46, 68, 32, 48, 52, 56, 64, 66, 54, 70, 92, 93, 120, 85]
Y18 = [1, 2, 3, 5, 4, 7, 6, 5, 4, 3, 4, 6, 8, 10, 10, 10, 10, 10]

# R's printed output (stats-Ex.Rout.save)
R_PRINTED = {
    "cars_gcv": {"lambda": 0.1112206, "df": 2.635278, "pen_crit": 4187.776,
                 "gcv": 244.1044,
                 "fitted_head": [1.6578, 11.6829, 15.0644, 18.4823, 21.9471,
                                 25.4656, 29.0505, 32.7076],
                 "lev_head": [0.399342, 0.179105, 0.069771, 0.055561,
                              0.136721, 0.077539, 0.137252, 0.126354]},
    "cars_df64": {"lambda": 0.0008526606, "df": 6.400884, "pen_crit": 3015.936,
                  "gcv": 257.2678,
                  "fitted": [5.833836, 12.575603, 15.037250, 17.795007,
                             20.935898, 24.228479, 28.488199, 33.969567,
                             38.578804, 40.986090, 43.494687, 47.156344,
                             50.862366, 52.692043, 54.754531, 66.036824,
                             75.010419, 85.290273, 95.014670]},
    "y18_gcv": {"lambda": 9.672776e-05, "df": 8.494168, "pen_crit": 3.59204,
                "gcv": 0.7155391},
    "y18_spar02": {"lambda": 3.911187e-06, "df": 15.259, "pen_crit": 0.4973656,
                   "gcv": 1.191602},
}


def collapse(x, y):
    ux, inv, cnt = np.unique(np.asarray(x, float), return_inverse=True,
                             return_counts=True)
    return ux, np.bincount(inv, weights=np.asarray(y, float)) / cnt, cnt.astype(float), inv


def bspline_smoother(x, y, lam, c):
    """Penalised cubic B-spline regression with knots at the distinct X
    (scaled to [0, 1]); the penalty Gram matrix by R's sgram rule with
    Simpson constant c. Returns (fitted at distinct X, df, leverages,
    weighted RSS of the means, RSS over all points, N)."""
    ux, ybar, w, inv = collapse(x, y)
    t = (ux - ux[0]) / (ux[-1] - ux[0])
    knots = np.concatenate([[0.0] * 3, t, [1.0] * 3])
    nb = len(knots) - 4
    B = BSpline.design_matrix(t, knots, 3).toarray()
    # second derivatives of each basis function, linear on each knot
    # interval: read at its quarter points and extended to its ends
    D2 = [BSpline(knots, np.eye(nb)[i], 3).derivative(2) for i in range(nb)]
    G = np.zeros((nb, nb))
    for k in range(len(t) - 1):
        a, b = t[k], t[k + 1]
        h = b - a
        q1 = np.array([f(a + h / 4) for f in D2], dtype=float)
        q3 = np.array([f(a + 3 * h / 4) for f in D2], dtype=float)
        d0 = q1 - (q3 - q1) / 2
        d1 = q3 + (q3 - q1) / 2
        y1, y2 = d0, d1 - d0
        G += h * (np.outer(y1, y1) + (np.outer(y2, y1) + np.outer(y1, y2)) * 0.5
                  + np.outer(y2, y2) * c)
    W = np.diag(w)
    A = B.T @ W @ B + lam * G
    H = B @ np.linalg.solve(A, B.T @ W)
    g = H @ ybar
    N = len(x)
    within = float(np.sum((np.asarray(y, float) - ybar[inv]) ** 2))
    pen = float(np.sum(w * (ybar - g) ** 2))
    return g, float(np.trace(H)), np.diag(H), pen, within + pen, N


def gcv_lambda(x, y, c):
    """lambda minimising (RSS / N) / (1 - df / N)^2: a grid in log lambda
    then golden-section refinement."""
    def crit(s):
        _, df, _, _, rss, N = bspline_smoother(x, y, math.exp(s), c)
        return (rss / N) / (1 - df / N) ** 2
    grid = np.linspace(math.log(1e-9), math.log(10.0), 121)
    vals = [crit(s) for s in grid]
    k = int(np.argmin(vals))
    a, b = grid[max(k - 1, 0)], grid[min(k + 1, len(grid) - 1)]
    gr = (math.sqrt(5) - 1) / 2
    for _ in range(80):
        c1, c2 = b - gr * (b - a), a + gr * (b - a)
        if crit(c1) < crit(c2):
            b = c2
        else:
            a = c1
    return math.exp((a + b) / 2)


def spline_case(x, y, lam, c):
    g, df, lev, pen, rss, N = bspline_smoother(x, y, lam, c)
    return {"lambda": lam, "df": df, "fitted": g.tolist(), "leverages": lev.tolist(),
            "pen_crit": pen, "rss": rss, "gcv": (rss / N) / (1 - df / N) ** 2}


def natural_spline_tridiagonal(x, y, at):
    """Natural cubic spline by its second derivatives M (M0 = Mn = 0):
    h_{i-1} M_{i-1} + 2(h_{i-1} + h_i) M_i + h_i M_{i+1} = 6 (d_i - d_{i-1})."""
    x, y = np.asarray(x, float), np.asarray(y, float)
    n = len(x)
    h = np.diff(x)
    d = np.diff(y) / h
    A = np.zeros((n, n))
    r = np.zeros(n)
    A[0, 0] = A[-1, -1] = 1.0
    for i in range(1, n - 1):
        A[i, i - 1], A[i, i], A[i, i + 1] = h[i - 1], 2 * (h[i - 1] + h[i]), h[i]
        r[i] = 6 * (d[i] - d[i - 1])
    M = np.linalg.solve(A, r)
    out = []
    for v in at:
        i = min(max(np.searchsorted(x, v) - 1, 0), n - 2)
        a, b = x[i + 1] - v, v - x[i]
        out.append(float(M[i] * a ** 3 / (6 * h[i]) + M[i + 1] * b ** 3 / (6 * h[i])
                         + (y[i] / h[i] - M[i] * h[i] / 6) * a
                         + (y[i + 1] / h[i] - M[i + 1] * h[i] / 6) * b))
    return out


def pchip_reference(x, y, at):
    x, y = np.asarray(x, float), np.asarray(y, float)
    h = np.diff(x)
    delta = np.diff(y) / h
    n = len(x)
    dv = np.zeros(n)
    for k in range(1, n - 1):
        if delta[k - 1] * delta[k] > 0:
            w1, w2 = 2 * h[k] + h[k - 1], h[k] + 2 * h[k - 1]
            dv[k] = (w1 + w2) / (w1 / delta[k - 1] + w2 / delta[k])

    def end(h0, h1, d0, d1):
        v = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1)
        if np.sign(v) != np.sign(d0):
            return 0.0
        if np.sign(d0) != np.sign(d1) and abs(v) > abs(3 * d0):
            return 3 * d0
        return v
    dv[0] = end(h[0], h[1], delta[0], delta[1])
    dv[-1] = end(h[-1], h[-2], delta[-1], delta[-2])
    out = []
    for v in at:
        i = min(max(np.searchsorted(x, v) - 1, 0), n - 2)
        s = (v - x[i]) / h[i]
        h00, h10 = 2 * s ** 3 - 3 * s ** 2 + 1, s ** 3 - 2 * s ** 2 + s
        h01, h11 = -2 * s ** 3 + 3 * s ** 2, s ** 3 - s ** 2
        out.append(float(h00 * y[i] + h10 * h[i] * dv[i] + h01 * y[i + 1]
                         + h11 * h[i] * dv[i + 1]))
    return out


def savgol_reference(y, k, order):
    y = np.asarray(y, float)
    n, win = len(y), 2 * k + 1
    out = np.zeros(n)
    idx = np.arange(win)
    for i in range(k, n - k):
        p = np.polyfit(idx, y[i - k:i + k + 1], order)
        out[i] = np.polyval(p, k)
    p0 = np.polyfit(idx, y[:win], order)
    p1 = np.polyfit(idx, y[-win:], order)
    out[:k] = np.polyval(p0, idx[:k])
    out[n - k:] = np.polyval(p1, idx[win - k:])
    return out.tolist()


def main():
    out = {"r_printed": R_PRINTED}
    # smoothing spline: R's quirk reproduced (c = 0.333) and the exact penalty
    cars_r = spline_case(SPEED, DIST, R_PRINTED["cars_gcv"]["lambda"], 0.333)
    cars_r64 = spline_case(SPEED, DIST, R_PRINTED["cars_df64"]["lambda"], 0.333)
    y18_r = spline_case(list(range(1, 19)), Y18, R_PRINTED["y18_gcv"]["lambda"], 0.333)
    out["bspline_c0333"] = {"cars_gcv": cars_r, "cars_df64": cars_r64, "y18_gcv": y18_r}
    exact = {
        "cars_at_r_lambda": spline_case(SPEED, DIST, R_PRINTED["cars_gcv"]["lambda"], 1 / 3),
        "cars_at_r_lambda64": spline_case(SPEED, DIST, R_PRINTED["cars_df64"]["lambda"], 1 / 3),
    }
    lam = gcv_lambda(SPEED, DIST, 1 / 3)
    exact["cars_gcv"] = spline_case(SPEED, DIST, lam, 1 / 3)
    lam18 = gcv_lambda(list(range(1, 19)), Y18, 1 / 3)
    exact["y18_gcv"] = spline_case(list(range(1, 19)), Y18, lam18, 1 / 3)
    out["bspline_exact"] = exact

    # LOWESS (statsmodels; R's delta passed explicitly)
    x = np.array(SPEED, float)
    y = np.array(DIST, float)
    d = 0.01 * (x.max() - x.min())
    rng = np.random.default_rng(20261124)
    xr = np.sort(rng.uniform(0, 10, 60))
    yr = np.sin(xr) + rng.normal(0, 0.3, 60)
    yr[7] += 4.0
    out["lowess"] = {
        "cars_f23": sm_lowess(y, x, frac=2 / 3, it=3, delta=d)[:, 1].tolist(),
        "cars_f02": sm_lowess(y, x, frac=0.2, it=3, delta=d)[:, 1].tolist(),
        "cars_f23_it0": sm_lowess(y, x, frac=2 / 3, it=0, delta=d)[:, 1].tolist(),
        "random_x": xr.tolist(), "random_y": yr.tolist(),
        "random_f03_it3_delta0": sm_lowess(yr, xr, frac=0.3, it=3, delta=0.0)[:, 1].tolist(),
        "delta_cars": d,
    }
    # interpolating curves
    xs = [0.5, 1.0, 2.5, 4.0, 4.5, 7.0, 9.0]
    ys = [0.2, 1.1, 1.0, 3.5, 3.6, 3.7, 8.0]
    at = np.linspace(0.5, 9.0, 35).tolist()
    out["interp"] = {
        "x": xs, "y": ys, "at": at,
        "natural": natural_spline_tridiagonal(xs, ys, at),
        "pchip": pchip_reference(xs, ys, at),
        "linear": np.interp(at, xs, ys).tolist(),
        "burden_faires_coef": {  # S_j(x) = a + b (x - j) + c (x - j)^2 + d (x - j)^3
            "a": [1.0, 2.71828, 7.38906], "b": [1.46600, 2.22285, 8.80977],
            "c": [0.0, 0.75685, 5.83007], "d": [0.25228, 1.69107, -1.94336]},
    }
    # curve operations
    xe = np.arange(0.0, 12.0)
    ye = np.array([1.0, 2.2, 2.9, 4.1, 5.3, 5.9, 7.2, 8.1, 8.8, 10.4, 11.0, 11.9])
    out["savgol"] = {"x": xe.tolist(), "y": ye.tolist(),
                     "k2_o2": savgol_reference(ye, 2, 2),
                     "k3_o0": savgol_reference(ye, 3, 0),
                     "k3_o4": savgol_reference(ye, 3, 4)}
    xq = [0.0, 0.5, 1.5, 2.0, 3.5, 5.0]
    out["calculus"] = {"x": xq,
                       "y_quadratic": [2 * v * v - 3 * v + 1 for v in xq],
                       "derivative_interior": [4 * v - 3 for v in xq[1:-1]],
                       "y_linear": [3 * v + 2 for v in xq],
                       "integral_linear": [1.5 * v * v + 2 * v for v in xq]}
    # the example ELISA kit (web/src/sheets/assays/stdcurve/sample.ts) with
    # the 7.81 standard left out, as e2e-assays leaves it: unknowns read off
    # a natural cubic spline (and straight lines) through the blank-
    # corrected level means on log10(concentration), by bisection
    std = [(1000, [2.343, 2.267]), (500, [2.074, 2.083]), (250, [1.541, 1.566]),
           (125, [1.142, 1.13]), (62.5, [0.724, 0.71]), (31.25, [0.451, 0.451]),
           (15.63, [0.282, 0.288])]
    blank = (0.063 + 0.058) / 2
    lx = [math.log10(c) for c, _ in sorted(std)]
    ly = [sum(s) / 2 - blank for _, s in sorted(std)]

    def read(signal, curve):
        f = lambda v: curve([v])[0] - signal
        grid = np.linspace(lx[0], lx[-1], 4001)
        vals = [f(v) for v in grid]
        roots = []
        for a, b, fa, fb in zip(grid[:-1], grid[1:], vals[:-1], vals[1:]):
            if fa == 0 or fa * fb < 0:
                for _ in range(200):
                    m = (a + b) / 2
                    if f(a) * f(m) <= 0:
                        b = m
                    else:
                        a = m
                roots.append((a + b) / 2)
        return [10 ** r for r in roots]
    spl = lambda v: natural_spline_tridiagonal(lx, ly, v)
    lin = lambda v: np.interp(v, lx, ly).tolist()
    kit = {}
    for name, sig in (("S1", [0.603, 0.581]), ("S4", [1.307, 1.257])):
        s = sum(sig) / 2 - blank
        kit[name] = {"spline": read(s, spl), "point_to_point": read(s, lin), "dilution": 2}
    out["kit_elisa"] = kit
    # The Cox Schoenfeld residual plot's smooth on survival::lung, age +
    # sex: the residuals and transformed time are the engine's (checked
    # against R's cox.zph in test_cox.py); the smooth is statsmodels' lowess
    # with R's lowess() defaults, sorted by transformed time
    import csv
    from opendose.cox import cox_regression
    with open(os.path.join(HERE, "..", "fixtures", "lung.csv")) as fh:
        rows = list(csv.DictReader(fh))
    fit = cox_regression([float(r["time"]) for r in rows], [r["status"] == "2" for r in rows],
                         {"age": [float(r["age"]) for r in rows],
                          "sex": [float(r["sex"]) for r in rows]})
    sch = fit["schoenfeld"]
    tt = np.array(sch["transformed_time"])
    o = np.argsort(tt, kind="stable")
    smooths = {}
    for key in ("residuals", "scaled"):
        res = np.array(sch[key])
        smooths[key] = [sm_lowess(res[o, j], tt[o], frac=2 / 3, it=3,
                                  delta=0.01 * np.ptp(tt))[:, 1].tolist()
                        for j in range(res.shape[1])]
    out["cox_lung_smooth"] = {"columns": sch["columns"], **smooths}
    with open(os.path.join(HERE, "smoothing.json"), "w") as fh:
        json.dump(out, fh, indent=1)
    print(json.dumps({k: out["bspline_c0333"][k]["df"] for k in out["bspline_c0333"]}))
    print("exact gcv lambda", lam, exact["cars_gcv"]["df"], "y18", lam18, exact["y18_gcv"]["df"])


if __name__ == "__main__":
    main()
