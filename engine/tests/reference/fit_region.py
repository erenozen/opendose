"""Independent reference for the parameter covariance and the joint
confidence region of two parameters (FEATURE-PLAN P-102).

R is not installed (the plan names vcov(nls), cov2cor and
nlstools::nlsContourRSS), so:

- Covariance: scipy.optimize.curve_fit's pcov with the 4PL's analytic
  Jacobian written out here (s^2 (J'J)^-1, s^2 = SS / (n - p)), and
  cov2cor by hand. The engine's matrix must reproduce it and its SEs must
  be the square roots of its diagonal.
- Joint region of LogIC50 and HillSlope (Bates & Watts 1988, chapters 2
  and 6: the profile region { S~(a, b) <= S^ [1 + 2/(n-p) F(2, n-p)] }).
  With LogIC50 and HillSlope held, the 4PL is linear in Top and Bottom
  (Y = Bottom (1 - g) + Top g, g = 1/(1 + 10^((LogIC50 - X) HillSlope))),
  so S~ is an exact linear least-squares problem here: no optimiser.
  (a) The boundary along each of the engine's 72 rays (angles t_k =
  2 pi k / 72 through the ellipse of the 2 x 2 covariance block, as
  opendose/fitregion.py documents), found by brentq on the exact S~.
  (b) The region's area on a 600 x 600 grid of exact S~ values, against
  the engine polygon's area.
- Michaelis-Menten on R's Puromycin data (treated), two parameters and
  no nuisance: the region { S(Vmax, Km) <= S^ [1 + 2/(n-2) F(2, n-2)] }
  is Beale's joint region itself; its area on a grid of direct S values.

F(0.95; 2, 23) = 3.4221 and F(0.95; 2, 10) = 4.1028 also match the
printed tables (e.g. Draper & Smith 1998, table of the F distribution).

Run: /home/eren/opendose/.venv/bin/python engine/tests/reference/fit_region.py
writes fit_region.json next to this file.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from scipy import stats
from scipy.optimize import brentq, curve_fit

HERE = Path(__file__).resolve().parent
CONC = [1e-9, 3.162e-9, 1e-8, 3.162e-8, 1e-7, 3.162e-7, 1e-6, 3.162e-6, 1e-5]
ROWS = [[98.2, 101.5, 99.1], [97.0, 95.8, 99.9], [93.4, 90.1, 92.7],
        [78.9, 82.3, 80.0], [51.2, 48.7, 50.9], [22.1, 25.6, 24.0],
        [8.9, 10.2, 7.5], [3.1, 4.4, 2.2], [1.0, 0.5, 2.1]]
NAMES = ["Top", "Bottom", "LogIC50", "HillSlope"]
RAYS = 72
LN10 = math.log(10.0)

# R datasets::Puromycin, state == "treated"
PURO_CONC = [0.02, 0.02, 0.06, 0.06, 0.11, 0.11, 0.22, 0.22, 0.56, 0.56,
             1.10, 1.10]
PURO_RATE = [76, 47, 97, 107, 123, 139, 159, 152, 191, 201, 207, 200]


def f4(x, top, bottom, logic50, hill):
    return bottom + (top - bottom) / (1 + 10.0 ** ((logic50 - x) * hill))


def jac4(x, top, bottom, logic50, hill):
    e = 10.0 ** ((logic50 - x) * hill)
    g = 1.0 / (1.0 + e)
    dg = -g * g * e * LN10          # d g / d(exponent)
    return np.column_stack([g, 1.0 - g, (top - bottom) * dg * hill,
                            (top - bottom) * dg * (logic50 - x)])


def data():
    x = np.repeat([math.log10(c) for c in CONC], 3)
    y = np.array(ROWS, float).ravel()
    return x, y


def profile_ss(x, y, logic50, hill):
    """Exact S~: Top and Bottom by linear least squares."""
    g = 1.0 / (1.0 + 10.0 ** ((logic50 - x) * hill))
    A = np.column_stack([g, 1.0 - g])
    coef, *_ = np.linalg.lstsq(A, y, rcond=None)
    r = y - A @ coef
    return float(r @ r)


def area_on_grid(inside, xs, ys):
    dx, dy = xs[1] - xs[0], ys[1] - ys[0]
    return float(np.count_nonzero(inside)) * dx * dy


def four_pl():
    x, y = data()
    p, pcov = curve_fit(f4, x, y, p0=[101.5, 0.5, -7.0, -1.0], jac=jac4,
                        method="lm", xtol=1e-15, ftol=1e-15, gtol=1e-15)
    n, k = x.size, 4
    r = y - f4(x, *p)
    ss = float(r @ r)
    J = jac4(x, *p)
    cov = ss / (n - k) * np.linalg.inv(J.T @ J)
    sd = np.sqrt(np.diag(cov))
    corr = cov / np.outer(sd, sd)
    fcrit = float(stats.f.ppf(0.95, 2, n - k))
    thr = ss * (1 + 2 / (n - k) * fcrit)
    # rays through the ellipse of the (LogIC50, HillSlope) block
    C = cov[2:, 2:]
    L = np.linalg.cholesky(C)
    rad = math.sqrt(2 * fcrit)
    center = p[2:]
    points = []
    for t in np.linspace(0, 2 * math.pi, RAYS, endpoint=False):
        d = rad * (L @ np.array([math.cos(t), math.sin(t)]))

        def g(s):
            a, b = center + s * d
            return profile_ss(x, y, a, b) - thr
        hi = 1.0
        while g(hi) < 0:
            hi *= 1.5
        s = brentq(g, 0.0, hi, xtol=1e-12)
        points.append((center + s * d).tolist())
    # the area on a grid of exact S~
    pts = np.array(points)
    xs = np.linspace(pts[:, 0].min() - 0.002, pts[:, 0].max() + 0.002, 600)
    ys = np.linspace(pts[:, 1].min() - 0.005, pts[:, 1].max() + 0.005, 600)
    inside = np.array([[profile_ss(x, y, a, b) <= thr for a in xs]
                       for b in ys])
    return {"estimates": dict(zip(NAMES, map(float, p))),
            "ss_min": ss, "df": n - k, "f_crit": fcrit, "threshold": thr,
            "covariance": cov.tolist(), "se": sd.tolist(),
            "correlation": corr.tolist(),
            "scipy_pcov": pcov.tolist(),
            "region": {"params": ["LogIC50", "HillSlope"],
                       "boundary": points,
                       "grid_area": area_on_grid(inside, xs, ys),
                       "grid": [600, 600],
                       "grid_cell": [float(xs[1] - xs[0]),
                                     float(ys[1] - ys[0])]}}


def michaelis_menten():
    x = np.array(PURO_CONC, float)
    y = np.array(PURO_RATE, float)

    def mm(xv, vmax, km):
        return vmax * xv / (km + xv)
    p, pcov = curve_fit(mm, x, y, p0=[200.0, 0.1], method="lm",
                        xtol=1e-15, ftol=1e-15, gtol=1e-15)
    r = y - mm(x, *p)
    ss = float(r @ r)
    n = x.size
    fcrit = float(stats.f.ppf(0.95, 2, n - 2))
    thr = ss * (1 + 2 / (n - 2) * fcrit)
    vs = np.linspace(p[0] - 30, p[0] + 30, 700)
    ks = np.linspace(max(p[1] - 0.04, 1e-6), p[1] + 0.05, 700)
    V, K = np.meshgrid(vs, ks)
    S = ((y[None, None, :] - V[..., None] * x / (K[..., None] + x)) ** 2
         ).sum(axis=-1)
    inside = S <= thr
    edge = inside[0].any() or inside[-1].any() or inside[:, 0].any() \
        or inside[:, -1].any()
    assert not edge, "grid too small"
    return {"estimates": {"Vmax": float(p[0]), "Km": float(p[1])},
            "ss_min": ss, "df": n - 2, "f_crit": fcrit, "threshold": thr,
            "grid_area": area_on_grid(inside, vs, ks),
            "grid_cell": [float(vs[1] - vs[0]), float(ks[1] - ks[0])],
            "vmax_range": [float(V[inside].min()), float(V[inside].max())],
            "km_range": [float(K[inside].min()), float(K[inside].max())]}


def main():
    ref = {"four_pl": four_pl(), "michaelis_menten": michaelis_menten()}
    (HERE / "fit_region.json").write_text(json.dumps(ref, indent=1) + "\n")
    print(json.dumps({k: {kk: vv for kk, vv in v.items()
                          if kk not in ("region",)}
                      for k, v in ref.items()}, indent=1)[:3000])


if __name__ == "__main__":
    main()
