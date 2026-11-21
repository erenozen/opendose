"""MuSyC: multi-dimensional synergy of combinations (two drugs).

Method sources (reimplemented from the published equations; no code
copied):
- Meyer, Wooten et al. 2019, Cell Syst 8:97 ("Quantifying drug
  combination synergy along potency and efficacy axes"), and Wooten,
  Meyer, Lopez & Quaranta 2021, Nat Commun 12:4607 ("MuSyC is a consensus
  framework that unifies multi-drug synergy metrics"). The surface is the
  steady state of the four-state model U, A1, A2, A1,2 (Wooten Box 1,
  eqs. 11-15) without the cooperativity terms (gamma = 1; Wooten's
  analyses dropped gamma, which did not improve fits by AIC):

      M [U A1 A2 A12]^T = [0 0 0 1]^T,  E = [E0 E1 E2 E3] . [U A1 A2 A12]

  with rows dU = -(r1 d1^h1 + r2 d2^h2) U + r-1 A1 + r-2 A2,
  dA1 = r1 d1^h1 U - (r-1 + r2 (a12 d2)^h2) A1 + r-2 A12,
  dA2 = r2 d2^h2 U - (r1 (a21 d1)^h1 + r-2) A2 + r-1 A12, and
  U + A1 + A2 + A12 = 1; C_i^h_i = r-i / r_i and r1 = r2 = 100 (Wooten,
  "Fitting 2D Hill equation"). a12 is the fold change in drug 2's potency
  caused by drug 1, a21 the change in drug 1's potency caused by drug 2
  (Wooten Table 1; Meyer's alpha1 and alpha2). Under detailed balance
  (a12^h2 = a21^h1) it reduces to Meyer's closed form (eq. 1).
- Synergy parameters: alpha > 1 (log alpha > 0) synergistic potency,
  alpha < 1 antagonistic; beta = (min(E1, E2) - E3) / (E0 - min(E1,
  E2)) for an effect that falls with dose (Meyer eq. 3), the fraction by
  which the combination's maximal effect exceeds the better drug's.
  OpenDose's responses are % inhibition, which rises with dose; on 100 -
  inhibition the same beta is (E3 - max(E1, E2)) / (max(E1, E2) - E0)
  exactly. beta_obs (Meyer eq. 4) is beta at the highest doses tested,
  from the fitted surface.
- Fit (Wooten, Methods): least squares (scipy TRF) started from the
  monotherapy fits, E3 = the better drug's maximal effect and alpha = 1,
  log10 alpha bounded to [-4, 4]. 95% intervals: Wooten's Monte Carlo,
  refitting the fitted surface plus N(0, RMS) noise (n_ci times, from the
  best fit), percentiles of the refits. Wooten kept a combination only
  when R^2 > 0.7 and both EC50s lay below the highest dose tested; the
  result says when either fails.
"""

from __future__ import annotations

import math

import numpy as np
from scipy.optimize import least_squares

R_FORWARD = 100.0          # r1 = r2 = 100 (Wooten 2021)
NAMES = ["E0", "E1", "E2", "E3", "logC1", "logC2", "h1", "h2",
         "log_alpha12", "log_alpha21"]


def surface(d1, d2, p):
    """MuSyC effect at dose pairs (d1, d2) (arrays of equal shape) for the
    parameter dict p (NAMES; logs are base 10)."""
    d1 = np.asarray(d1, float)
    d2 = np.asarray(d2, float)
    shape = np.broadcast(d1, d2).shape
    d1 = np.broadcast_to(d1, shape).ravel()
    d2 = np.broadcast_to(d2, shape).ravel()
    h1, h2 = p["h1"], p["h2"]
    C1, C2 = 10.0 ** p["logC1"], 10.0 ** p["logC2"]
    a12, a21 = 10.0 ** p["log_alpha12"], 10.0 ** p["log_alpha21"]
    r1 = r2 = R_FORWARD
    rm1, rm2 = r1 * C1 ** h1, r2 * C2 ** h2
    with np.errstate(over="ignore", invalid="ignore"):
        x1, x2 = d1 ** h1, d2 ** h2
        y1, y2 = (a21 * d1) ** h1, (a12 * d2) ** h2
    M = np.zeros((d1.size, 4, 4))
    M[:, 0, 0] = -(r1 * x1 + r2 * x2)
    M[:, 0, 1] = rm1
    M[:, 0, 2] = rm2
    M[:, 1, 0] = r1 * x1
    M[:, 1, 1] = -(rm1 + r2 * y2)
    M[:, 1, 3] = rm2
    M[:, 2, 0] = r2 * x2
    M[:, 2, 2] = -(r1 * y1 + rm2)
    M[:, 2, 3] = rm1
    M[:, 3, :] = 1.0
    # scale each of the first three rows by its largest entry: the rates
    # span many orders of magnitude across a dose matrix
    scale = np.max(np.abs(M[:, :3, :]), axis=2, keepdims=True)
    scale[scale == 0] = 1.0
    M[:, :3, :] /= scale
    rhs = np.zeros((d1.size, 4))
    rhs[:, 3] = 1.0
    try:
        occ = np.linalg.solve(M, rhs[..., None])[..., 0]
    except np.linalg.LinAlgError:
        return np.full(shape, np.nan)
    E = np.array([p["E0"], p["E1"], p["E2"], p["E3"]])
    return (occ @ E).reshape(shape)


def _beta(p):
    best = max(p["E1"], p["E2"])
    den = best - p["E0"]
    return (p["E3"] - best) / den if den != 0 else math.nan


def _beta_obs(p, d1max, d2max):
    e1 = float(surface(d1max, 0.0, p))
    e2 = float(surface(0.0, d2max, p))
    e3 = float(surface(d1max, d2max, p))
    e0 = p["E0"]
    best = max(e1, e2)
    den = best - e0
    return (e3 - best) / den if den != 0 else math.nan


def _mono_start(f, conc):
    """(E0, Emax, logC, h) from an assay_synergy LL.4 fit (X =
    concentration): Bottom at zero dose when the slope is positive."""
    pos = [c for c in conc if c > 0]
    if f is None:
        return None
    p = f["params"]
    h = float(p["HillSlope"])
    lo, hi = float(p["Bottom"]), float(p["Top"])
    e0, emax = (lo, hi) if h >= 0 else (hi, lo)
    logc = float(p["LogEC50"])
    span = (math.log10(min(pos)) - 4, math.log10(max(pos)) + 4)
    return e0, emax, min(max(logc, span[0]), span[1]), max(abs(h), 0.05)


def _bounds(c1, c2):
    p1 = [c for c in c1 if c > 0]
    p2 = [c for c in c2 if c > 0]
    lo = [-200.0, -200.0, -200.0, -200.0, math.log10(min(p1)) - 4,
          math.log10(min(p2)) - 4, 0.01, 0.01, -4.0, -4.0]
    hi = [300.0, 300.0, 300.0, 300.0, math.log10(max(p1)) + 4,
          math.log10(max(p2)) + 4, 20.0, 20.0, 4.0, 4.0]
    return np.array(lo), np.array(hi)


def _fit(D1, D2, y, x0, lo, hi):
    ok = np.isfinite(y)

    def resid(v):
        r = surface(D1[ok], D2[ok], dict(zip(NAMES, v))) - y[ok]
        return np.where(np.isfinite(r), r, 1e6)
    x0 = np.clip(x0, lo + 1e-9, hi - 1e-9)
    res = least_squares(resid, x0, bounds=(lo, hi), method="trf",
                        x_scale="jac", max_nfev=4000)
    return res.x, float(np.sum(res.fun ** 2))


def fit_musyc(R, c1, c2, mono1, mono2, *, n_ci=100, seed=0,
              names=("drug 1", "drug 2")):
    """Fit MuSyC to a % inhibition matrix R (rows = c1, columns = c2,
    zero doses first) from the monotherapy LL.4 fits mono1, mono2.
    Returns the parameters (alpha's also as fold changes), beta, beta_obs,
    R^2, RMS, 95% Monte Carlo intervals and reliability notes; None when a
    monotherapy fit is missing."""
    s1, s2 = _mono_start(mono1, c1), _mono_start(mono2, c2)
    if s1 is None or s2 is None:
        return None
    R = np.asarray(R, float)
    D1, D2 = np.meshgrid(np.asarray(c1, float), np.asarray(c2, float),
                         indexing="ij")
    y = R.ravel()
    D1, D2 = D1.ravel(), D2.ravel()
    lo, hi = _bounds(c1, c2)
    e0 = 0.5 * (s1[0] + s2[0])
    best = None
    for la12 in (0.0, -1.0, 1.0):
        for la21 in (0.0, -1.0, 1.0):
            x0 = np.array([e0, s1[1], s2[1], max(s1[1], s2[1]), s1[2],
                           s2[2], s1[3], s2[3], la12, la21])
            try:
                x, sse = _fit(D1, D2, y, x0, lo, hi)
            except (ValueError, np.linalg.LinAlgError):
                continue
            if best is None or sse < best[1] - 1e-12:
                best = (x, sse)
    if best is None:
        return None
    x, sse = best
    p = dict(zip(NAMES, map(float, x)))
    ok = np.isfinite(y)
    fitted = surface(D1, D2, p)
    n = int(ok.sum())
    rms = math.sqrt(sse / n)
    sst = float(np.sum((y[ok] - y[ok].mean()) ** 2))
    r2 = 1.0 - sse / sst if sst > 0 else math.nan
    d1max, d2max = max(c1), max(c2)
    out = _report(p, d1max, d2max)
    out.update({"r_squared": r2, "rms": rms, "n": n,
                "fitted": fitted.reshape(R.shape).tolist()})
    if n_ci:
        rng = np.random.default_rng(seed)
        draws = []
        for _ in range(int(n_ci)):
            noisy = np.where(ok, fitted + rng.normal(0.0, rms, fitted.size),
                             np.nan)
            try:
                xb, _ = _fit(D1, D2, noisy, x, lo, hi)
            except (ValueError, np.linalg.LinAlgError):
                continue
            draws.append(_report(dict(zip(NAMES, map(float, xb))),
                                 d1max, d2max))
        keys = [k for k in out if isinstance(out[k], float)
                and k not in ("r_squared", "rms")]
        out["ci95"] = {}
        for k in keys:
            vals = np.array([d[k] for d in draws], float)
            vals = vals[np.isfinite(vals)]
            out["ci95"][k] = ([float(np.percentile(vals, 2.5)),
                               float(np.percentile(vals, 97.5))]
                              if vals.size >= 10 else None)
        out["n_ci"] = len(draws)
    notes = []
    if not r2 > 0.7:
        notes.append(f"R² = {r2:.3g} is not above 0.7, the cut-off "
                     "Wooten et al. used for reliable MuSyC parameters.")
    n1, n2 = names
    for k, dmax, name in (("C1", d1max, n1), ("C2", d2max, n2)):
        if not out[k] < dmax:
            notes.append(f"The fitted EC50 of {name} is not below the highest "
                         "dose tested, so its alpha and beta are poorly "
                         "determined (Wooten et al. kept only fits below it).")
    label = {"logC1": f"EC50 of {n1}", "logC2": f"EC50 of {n2}",
             "h1": f"Hill slope of {n1}", "h2": f"Hill slope of {n2}",
             "log_alpha12": f"\u03b112 ({n1} on {n2}'s potency)",
             "log_alpha21": f"\u03b121 ({n2} on {n1}'s potency)"}
    for k, v, a, b in zip(NAMES, x, lo, hi):
        if k in label and (v - a < 1e-6 * (b - a) or b - v < 1e-6 * (b - a)):
            notes.append(f"The {label[k]} ended on the edge of its search "
                         "range: these doses do not determine it.")
    for k, name in (("log10_alpha12", label["log_alpha12"]),
                    ("log10_alpha21", label["log_alpha21"])):
        ci = out.get("ci95", {}).get(k)
        if ci and ci[0] <= -3.9 and ci[1] >= 3.9:
            notes.append(f"The 95% interval of {name} covers its whole "
                         "search range (10^-4 to 10^4): not determined.")
    out["notes"] = notes
    return out


def _report(p, d1max, d2max):
    return {
        "E0": p["E0"], "E1": p["E1"], "E2": p["E2"], "E3": p["E3"],
        "C1": 10.0 ** p["logC1"], "C2": 10.0 ** p["logC2"],
        "h1": p["h1"], "h2": p["h2"],
        "alpha12": 10.0 ** p["log_alpha12"],
        "alpha21": 10.0 ** p["log_alpha21"],
        "log10_alpha12": p["log_alpha12"], "log10_alpha21": p["log_alpha21"],
        "beta": _beta(p), "beta_obs": _beta_obs(p, d1max, d2max),
    }
