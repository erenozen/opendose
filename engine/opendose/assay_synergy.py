"""Drug-combination synergy from a dose-response matrix: HSA, Bliss,
Loewe and ZIP scores with landscapes, and Chou-Talalay combination
indices.

Method sources:
- Highest single agent (HSA; Berenbaum 1989, Pharmacol Rev 41:93):
  reference = max of the two monotherapy responses at the same doses.
- Bliss independence (Bliss 1939, Ann Appl Biol 26:585): with responses
  as % inhibition, reference = y1 + y2 - y1*y2/100.
- Loewe additivity (Loewe & Muischnek 1926; Berenbaum 1989): the
  additive response y solves d1/D1(y) + d2/D2(y) = 1, with D_i(y) the
  dose of drug i alone giving y, from its monotherapy four-parameter
  log-logistic fit (the inverse of the fitted curve; 0 on the zero-dose
  side of its range, infinite where the curve never reaches y, as
  SynergyFinder's .SolveExpDose). The equation is solved exactly
  (bracketing on a 400-step grid, then brentq) where SynergyFinder 3
  takes the best of 100 grid values; where no y solves it, the larger
  single-drug response at the total dose d1 + d2 is used (SynergyFinder
  3's fallback; the count is reported). The Loewe combination index
  sum d_i/D_i(y_observed) (SynergyFinder's Loewe_ci) is reported too.
- Zero interaction potency (ZIP; Yadav, Wennerberg, Aittokallio & Tang
  2015, Comput Struct Biotechnol J 13:504) as implemented in
  SynergyFinder 3 (Ianevski et al. 2017 Bioinformatics 33:2413; 2020
  NAR 48:W488; R package synergyfinder, ZIP()): the reference is the
  Bliss combination of the fitted monotherapy curves; at each fixed
  dose of one drug the responses along the other drug's doses (zero
  dose included) are refitted with the same model, its zero-dose
  parameter fixed at the observed response of that slice at dose 0 and
  the other three free (with the far plateau fixed at 100 as a fallback
  when a slice has too few doses); the ZIP fit is the mean of the two
  refitted surfaces and delta = fit - reference. Under Bliss-
  independent drugs with 4PL monotherapies the delta is exactly 0.
- Chou-Talalay median-effect method (Chou & Talalay 1984 Adv Enzyme
  Regul 22:27; Chou 2006 Pharmacol Rev 58:621; Chou 2010 Cancer Res
  70:440): log(fa/fu) = m*log(D) - m*log(Dm) fitted by linear
  regression per drug (m slope, Dm median-effect dose, r linear
  correlation); for each combination with effect fa, Dx_i = Dm_i *
  (fa/(1 - fa))^(1/m_i) and CI = d1/Dx1 + d2/Dx2 (mutually exclusive
  drugs), DRI_i = Dx_i/d_i; CI < 1 synergism, = 1 additive, > 1
  antagonism, with Chou's descriptive ranges.

Monotherapy and ZIP fits run through nlfit with the model registered
here, "Log-logistic (four parameters), X is concentration": Y = Bottom +
(Top - Bottom)/(1 + 10^((LogEC50 - log10 X)*HillSlope)), X the
concentration so the zero-dose cells are fitted as well. It is drc's
LL.4 (used by SynergyFinder) with c = Bottom, d = Top, e = 10^LogEC50
and b = -HillSlope, unweighted least squares as there. Fits can
differ from drc's where the data are step-like and the least-squares
surface has several minima.
"""

from __future__ import annotations

import math

import numpy as np
from scipy.optimize import brentq

from . import equations, linregress, nlfit
from .nlfit import ModelSpec, Transform, register

MODEL = "log_logistic_4pl_conc"


def _ll4_func(x, p):
    with np.errstate(all="ignore"):
        lx = np.log10(np.asarray(x, dtype=float))   # log10(0) = -inf
        return p["Bottom"] + (p["Top"] - p["Bottom"]) / (
            1.0 + np.power(10.0, (p["LogEC50"] - lx) * p["HillSlope"]))


def _ll4_initials(x, y):
    x, y = np.asarray(x, float), np.asarray(y, float)
    s = equations.DataStats(x, y)
    pos = x[x > 0]
    xm = s.x_at_ymid
    log_mid = (math.log10(xm) if xm > 0 else
               float(np.mean(np.log10(pos))) if pos.size else 0.0)
    return {"Bottom": s.y_at_xmin, "Top": s.y_at_xmax, "LogEC50": log_mid,
            "HillSlope": s.sign}


# drc's LL.4 (SynergyFinder's model) in nlfit's registry: X is the
# concentration itself, so a zero dose sits exactly on a plateau, and
# the potency is fitted as LogEC50, which keeps the least-squares search
# well conditioned when the data are step-like (an EC50 far below the
# lowest dose). Same curve as "[Inhibitor] vs. response -- Variable
# slope" with IC50 = 10^LogEC50.
register(ModelSpec(
    name=MODEL,
    label="Log-logistic (four parameters), X is concentration",
    equation="Y=Bottom + (Top-Bottom)/(1+10^((LogEC50-log(X))*HillSlope))",
    params=["Bottom", "Top", "LogEC50", "HillSlope"],
    func=_ll4_func, initials=_ll4_initials,
    multistart="LogEC50", multistart_mode="x",
    bounds={"Bottom": (-1000.0, 1000.0), "Top": (-1000.0, 1000.0),
            "LogEC50": (-30.0, 30.0), "HillSlope": (-50.0, 50.0)},
    x_label="[Drug]", y_label="Response",
    family="Dose-response - Special, X is concentration",
    transforms=[Transform("EC50", lambda p: 10.0 ** p["LogEC50"],
                          ("LogEC50",))],
))
_CI_RANGES = [(0.1, "very strong synergism"), (0.3, "strong synergism"),
              (0.7, "synergism"), (0.85, "moderate synergism"),
              (0.9, "slight synergism"), (1.1, "nearly additive"),
              (1.2, "slight antagonism"), (1.45, "moderate antagonism"),
              (3.3, "antagonism"), (10.0, "strong antagonism"),
              (math.inf, "very strong antagonism")]


def ci_interpretation(ci):
    """Chou (2006, Pharmacol Rev 58:621) descriptive ranges of the CI."""
    if ci is None or not math.isfinite(ci):
        return None
    for limit, label in _CI_RANGES:
        if ci < limit:
            return label
    return _CI_RANGES[-1][1]


def _num(v):
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


# ------------------------------------------------------------ input

def build_matrix(records=None, *, conc1=None, conc2=None, responses=None,
                 response_kind="inhibition"):
    """-> (conc1, conc2, reps) with reps an array (n_rep, n1, n2) of %
    inhibition (NaN = missing). Either long records [{conc1, conc2,
    response, replicate?}] or conc1/conc2 lists with responses as one
    matrix or a list of replicate matrices (rows = conc1)."""
    if response_kind not in ("inhibition", "viability"):
        raise ValueError("response_kind must be 'inhibition' or 'viability'")
    if records:
        c1 = sorted({float(r["conc1"]) for r in records})
        c2 = sorted({float(r["conc2"]) for r in records})
        cells = {}
        for r in records:
            v = _num(r.get("response"))
            if v is None:
                continue
            key = (c1.index(float(r["conc1"])), c2.index(float(r["conc2"])))
            cells.setdefault(key, []).append((r.get("replicate"), v))
        n_rep = max((len(v) for v in cells.values()), default=0)
        reps = np.full((max(n_rep, 1), len(c1), len(c2)), np.nan)
        rep_ids = []
        for vals in cells.values():
            for rid, _ in vals:
                if rid is not None and rid not in rep_ids:
                    rep_ids.append(rid)
        for (i, j), vals in cells.items():
            for k, (rid, v) in enumerate(vals):
                idx = rep_ids.index(rid) if (rid is not None and rid in
                                             rep_ids and len(rep_ids) ==
                                             n_rep) else k
                reps[idx, i, j] = v
    else:
        if conc1 is None or conc2 is None or responses is None:
            raise ValueError("give records or conc1, conc2 and responses")
        c1 = [float(v) for v in conc1]
        c2 = [float(v) for v in conc2]
        arr = np.array([[[np.nan if v is None else float(v) for v in row]
                         for row in mat] for mat in
                        (responses if np.ndim(responses) == 3 or
                         (responses and isinstance(responses[0][0], list))
                         else [responses])], dtype=float)
        if arr.shape[1:] != (len(c1), len(c2)):
            raise ValueError(f"response matrix must be {len(c1)} x "
                             f"{len(c2)} (rows = conc1)")
        order1, order2 = np.argsort(c1), np.argsort(c2)
        reps = arr[:, order1][:, :, order2]
        c1, c2 = sorted(c1), sorted(c2)
    if response_kind == "viability":
        reps = 100.0 - reps
    if c1[0] != 0 or c2[0] != 0:
        raise ValueError("the matrix needs the zero dose of each drug "
                         "(monotherapy row and column)")
    return c1, c2, reps


# ------------------------------------------------------------ fitting

def _fit_ll4(x, y, constraints=None):
    """4-parameter log-logistic Y = Bottom + (Top - Bottom)/(1 +
    (EC50/X)^HillSlope) in X = concentration (drc's LL.4 with c =
    Bottom, d = Top, e = EC50, b = -HillSlope; any slope sign, so the
    zero dose sits at Bottom for rising and at Top for falling curves).
    Returns {"params", "fit"} or None when the fit fails."""
    x = np.asarray(x, float)
    y = np.asarray(y, float)
    ok = np.isfinite(y)
    x, y = x[ok], y[ok]
    free = 4 - len(constraints or {})
    if x.size <= free or np.unique(x).size < min(free, 3):
        return None
    if np.ptp(y) == 0:          # as SynergyFinder: a flat curve cannot be
        y = y.copy()            # fitted; nudge the last value
        y[-1] += 1e-10
    try:
        with np.errstate(all="ignore"):
            fit = nlfit.fit_model(x.tolist(), y.tolist(), MODEL,
                                  constraints=dict(constraints or {}))
    except (ValueError, RuntimeError, np.linalg.LinAlgError):
        return None
    p = dict(fit["fitted_values"])
    if not all(math.isfinite(v) for v in p.values()) or abs(
            p["LogEC50"]) > 300:
        return None
    p["EC50"] = 10.0 ** p["LogEC50"]
    return {"params": p, "fit": fit}


def _ll4(x, p):
    return _ll4_func(x, {"Bottom": p["Bottom"], "Top": p["Top"],
                         "LogEC50": math.log10(p["EC50"]),
                         "HillSlope": p["HillSlope"]})


def _inverse_dose(y, p):
    """Dose of a fitted monotherapy giving effect y: 0 where y is on the
    zero-dose side of the curve's range, inf where the curve never
    reaches it (as SynergyFinder's .SolveExpDose)."""
    b, t, e, h = p["Bottom"], p["Top"], p["EC50"], p["HillSlope"]
    lo, hi = min(b, t), max(b, t)
    start = b if h > 0 else t            # response at zero dose
    if y <= lo or y >= hi:
        reach = hi if start == lo else lo
        if (y >= hi and reach == hi) or (y <= lo and reach == lo):
            return math.inf
        return 0.0
    u = (y - b) / (t - y)
    return e * u ** (1.0 / h)


def loewe_response(d1, d2, p1, p2):
    """Loewe-additive effect of doses d1, d2: the y solving d1/D1(y) +
    d2/D2(y) = 1 (None when no y does)."""
    terms = [(d, p) for d, p in ((d1, p1), (d2, p2))
             if d > 0 and p is not None]
    if not terms:
        return None
    lo = min(min(p["Bottom"], p["Top"]) for _, p in terms)
    hi = max(max(p["Bottom"], p["Top"]) for _, p in terms)
    if not hi > lo:
        return None

    def f(y):
        s = 0.0
        for d, p in terms:
            X = _inverse_dose(y, p)
            if X == 0.0:
                return math.inf
            s += 0.0 if math.isinf(X) else d / X
        return s - 1.0
    def g(v):
        r = f(v)
        return r if math.isfinite(r) else 1e300
    ys = np.linspace(lo, hi, 401)[1:-1]
    vals = [g(v) for v in ys]
    for a, b, fa, fb in zip(ys, ys[1:], vals, vals[1:]):
        if fa == 0.0:
            return float(a)
        if fa > 0 > fb:
            return float(brentq(g, a, b, xtol=1e-12, rtol=1e-12,
                                maxiter=200))
    return None


def loewe_ci(y, doses, params):
    """SynergyFinder's Loewe combination index sum(d_i / D_i(y)) at the
    observed combination effect y."""
    total = 0.0
    for d, p in zip(doses, params):
        if p is None:
            return None
        X = _inverse_dose(y, p)
        if X == 0.0:
            return math.inf
        total += 0.0 if math.isinf(X) else d / X
    return total


# ------------------------------------------------------------ models

def _baseline_correct(R, c1, c2, method):
    if method == "none":
        return R, None
    if method not in ("part", "all"):
        raise ValueError("baseline_correction must be 'none', 'part' or "
                         "'all'")
    f1 = _fit_ll4(c1, R[:, 0])
    f2 = _fit_ll4(c2, R[0, :])
    mins = []
    for f, x in ((f1, c1), (f2, c2)):
        if f is not None:
            mins.append(float(np.min(_ll4(x, f["params"]))))
    if not mins:
        return R, None
    base = min(mins)        # SynergyFinder: Reduce(min, fitted values)
    out = R.copy()
    mask = np.isfinite(out) if method == "all" else (out < 0)
    out[mask] = out[mask] - (100.0 - out[mask]) / 100.0 * base
    return out, base


def _scores(R, c1, c2):
    """Every model on one response matrix -> dict of matrices + info."""
    n1, n2 = R.shape
    y1, y2 = R[:, 0], R[0, :]
    hsa_ref = np.maximum.outer(y1, y2)
    bliss_ref = y1[:, None] + y2[None, :] - np.outer(y1, y2) / 100.0
    f1, f2 = _fit_ll4(c1, y1), _fit_ll4(c2, y2)
    p1 = f1["params"] if f1 else None
    p2 = f2["params"] if f2 else None
    fit1 = _ll4(c1, p1) if p1 else np.array(y1, float)
    fit2 = _ll4(c2, p2) if p2 else np.array(y2, float)
    loewe_ref = np.full((n1, n2), np.nan)
    loewe_cix = np.full((n1, n2), np.nan)
    n_fallback = 0
    for i in range(1, n1):
        for j in range(1, n2):
            y = loewe_response(c1[i], c2[j], p1, p2)
            if y is None:
                # SynergyFinder's fallback: the larger single-drug response
                # at the total dose
                y = max(float(_ll4([c1[i] + c2[j]], p)[0])
                        for p in (p1, p2) if p is not None) \
                    if (p1 or p2) else max(R[i, 0], R[0, j])
                n_fallback += 1
            loewe_ref[i, j] = y
            if math.isfinite(R[i, j]):
                ci = loewe_ci(R[i, j], (c1[i], c2[j]), (p1, p2))
                loewe_cix[i, j] = np.nan if ci is None else ci
    # ZIP (SynergyFinder 3): every slice of one drug's doses (zero dose
    # included) at a fixed dose of the other is refitted with the
    # lower parameter fixed at the slice's observed zero-dose response
    zip_ref = fit1[:, None] + fit2[None, :] - np.outer(fit1, fit2) / 100.0
    along1 = np.full((n1, n2), np.nan)    # fixed d2 (column j), vary d1
    along2 = np.full((n1, n2), np.nan)    # fixed d1 (row i), vary d2
    n_zip_fallback = 0

    def slice_fit(x, y):
        nonlocal n_zip_fallback
        for cons in ({"Bottom": float(y[0])},
                     {"Bottom": float(y[0]), "Top": 100.0}):
            f = _fit_ll4(x, y, cons)
            if f is not None:
                return _ll4(x, f["params"])
        n_zip_fallback += 1
        return np.asarray(y, float)
    for j in range(1, n2):
        along1[:, j] = slice_fit(c1, R[:, j])
    for i in range(1, n1):
        along2[i, :] = slice_fit(c2, R[i, :])
    zip_fit = (along1 + along2) / 2.0
    out = {}
    for name, ref, obs in (("hsa", hsa_ref, R), ("bliss", bliss_ref, R),
                           ("loewe", loewe_ref, R), ("zip", zip_ref, zip_fit)):
        syn = obs - ref
        syn[0, :] = 0.0
        syn[:, 0] = 0.0
        comb = syn[1:, 1:]
        score = float(np.nanmean(comb)) if np.isfinite(comb).any() else None
        out[name] = {"reference": ref, "synergy": syn, "score": score}
    out["zip"]["fitted"] = zip_fit
    out["loewe"]["n_fallback"] = n_fallback
    out["loewe"]["ci"] = loewe_cix
    out["zip"]["n_fallback_observed"] = n_zip_fallback
    out["_mono"] = (f1, f2, fit1, fit2)
    return out


#: Minimum r^2 of a monotherapy median-effect regression for its
#: combination indices to be computed: r >= 0.90, Chou's (2006,
#: Pharmacol Rev 58:621, "Conformity of data to the mass-action law")
#: lower limit for animal data (he asks r > 0.95 in vitro). Below it the
#: median-effect line does not describe the drug and Dx = Dm (fa/fu)^(1/m)
#: is meaningless (a flat or noisy monotherapy gives m near 0 and
#: indices of 1e+28).
MEDIAN_EFFECT_MIN_R2 = 0.81
#: Fewest monotherapy doses with 0 < fa < 1: the r of a line through two
#: points is +/-1 by construction.
MEDIAN_EFFECT_MIN_POINTS = 3


def _median_effect(doses, fa):
    """Median-effect regression log(fa/fu) = m log D - m log Dm of one
    drug, with "valid" (False and a "reason" when its indices must not be
    computed: fewer than MEDIAN_EFFECT_MIN_POINTS doses with 0 < fa < 1,
    m <= 0, or r^2 below MEDIAN_EFFECT_MIN_R2). None when no line can be
    drawn at all."""
    pts = [(d, f) for d, f in zip(doses, fa)
           if d > 0 and f is not None and math.isfinite(f) and 0 < f < 1]
    if len(pts) < 2:
        return None
    x = [math.log10(d) for d, _ in pts]
    y = [math.log10(f / (1 - f)) for _, f in pts]
    if len(pts) == 2:
        m = (y[1] - y[0]) / (x[1] - x[0]) if x[1] != x[0] else None
        if m is None or m == 0:
            return None
        b = y[0] - m * x[0]
        r = 1.0 if m > 0 else -1.0
        n = 2
    else:
        reg = linregress.linear_regression(x, y)
        m, b = reg["slope"]["value"], reg["y_intercept"]["value"]
        if m == 0:
            return None
        r2 = reg["r_squared"] or 0.0
        r = math.copysign(math.sqrt(max(r2, 0.0)), m)
        n = reg["n"]
    reason = None
    if n < MEDIAN_EFFECT_MIN_POINTS:
        reason = (f"only {n} monotherapy doses with 0 < fa < 1 (at least "
                  f"{MEDIAN_EFFECT_MIN_POINTS} are needed)")
    elif m <= 0:
        reason = (f"median-effect slope m = {m:.3g} is not positive "
                  f"(r = {r:.3f}; the effect does not rise with the dose)")
    elif r * r < MEDIAN_EFFECT_MIN_R2:
        reason = (f"median-effect fit r = {r:.3f} (r^2 = {r * r:.3f}) is "
                  f"below the r^2 >= {MEDIAN_EFFECT_MIN_R2} threshold")
    return {"m": m, "Dm": 10.0 ** (-b / m), "r": r, "r_squared": r * r,
            "n": n, "intercept": b, "valid": reason is None,
            "reason": reason}


def chou_talalay(R, c1, c2, names=("Drug 1", "Drug 2")) -> dict:
    """Median-effect fits and the combination index of each cell.

    A cell gets a CI only when its observed fraction affected is strictly
    inside (0, 1) and both monotherapy median-effect fits are valid
    (_median_effect); otherwise ci is None and "reason" says why. Nothing
    is capped: a CI that is not a finite number is not reported."""
    fa = R / 100.0
    d1 = _median_effect(c1, list(fa[:, 0]))
    d2 = _median_effect(c2, list(fa[0, :]))
    fit_reason = []
    for name, d in zip(names, (d1, d2)):
        if d is None:
            fit_reason.append(f"{name}: no median-effect line (fewer than "
                              "two doses with 0 < fa < 1)")
        elif not d["valid"]:
            fit_reason.append(f"{name}: {d['reason']}")
    combos = []
    for i in range(1, len(c1)):
        for j in range(1, len(c2)):
            f = fa[i, j]
            row = {"conc1": c1[i], "conc2": c2[j],
                   "fa": float(f) if math.isfinite(f) else None,
                   "ci": None, "dri1": None, "dri2": None,
                   "interpretation": None, "reason": None}
            if fit_reason:
                row["reason"] = "; ".join(fit_reason)
            elif not math.isfinite(f):
                row["reason"] = "no combination response"
            elif not 0 < f < 1:
                row["reason"] = (f"fa = {f:.3g} is not strictly between 0 "
                                 "and 1 (no median-effect dose exists)")
            else:
                odds = f / (1 - f)
                with np.errstate(all="ignore"):
                    dx1 = d1["Dm"] * odds ** (1.0 / d1["m"])
                    dx2 = d2["Dm"] * odds ** (1.0 / d2["m"])
                    ci = c1[i] / dx1 + c2[j] / dx2
                if all(math.isfinite(v) and v > 0 for v in (dx1, dx2)) \
                        and math.isfinite(ci):
                    row.update(ci=ci, dx1=dx1, dx2=dx2, dri1=dx1 / c1[i],
                               dri2=dx2 / c2[j],
                               interpretation=ci_interpretation(ci))
                else:
                    row["reason"] = ("the equivalent single-drug doses "
                                     "overflow (Dx is not a finite number)")
            combos.append(row)
    return {"drug1": d1, "drug2": d2, "combinations": combos,
            "fa_ci": [{"fa": c["fa"], "ci": c["ci"]} for c in combos
                      if c["ci"] is not None],
            "min_r_squared": MEDIAN_EFFECT_MIN_R2,
            "min_points": MEDIAN_EFFECT_MIN_POINTS,
            "n_computed": sum(1 for c in combos if c["ci"] is not None),
            "note": ("Combination indices are computed only where the "
                     "observed fa is strictly inside (0, 1) and both "
                     "monotherapy median-effect fits are valid (m > 0, "
                     f"r^2 >= {MEDIAN_EFFECT_MIN_R2}, at least "
                     f"{MEDIAN_EFFECT_MIN_POINTS} doses). Chou-Talalay "
                     "refers to Loewe additivity of median-effect "
                     "(Hill-type) curves, Bliss and HSA to other "
                     "reference models, so a cell can legitimately be "
                     "synergistic under one and not another; they agree "
                     "in sign on clear synergy.")}


def _jsonable(M):
    return [[None if not math.isfinite(v) else float(v) for v in row]
            for row in np.asarray(M, float)]


def synergy(records=None, *, conc1=None, conc2=None, responses=None,
            response_kind="inhibition", baseline_correction="none",
            drug1="Drug 1", drug2="Drug 2") -> dict:
    """HSA, Bliss, Loewe and ZIP synergy landscapes and summary scores,
    and Chou-Talalay combination indices, from a dose-response matrix."""
    c1, c2, reps = build_matrix(records, conc1=conc1, conc2=conc2,
                                responses=responses,
                                response_kind=response_kind)
    if len(c1) < 3 or len(c2) < 3:
        raise ValueError("synergy needs at least 2 non-zero doses of each "
                         "drug (a 3 x 3 matrix)")
    warnings = []
    with np.errstate(all="ignore"):
        mean = np.nanmean(reps, axis=0)
        sd = (np.nanstd(reps, axis=0, ddof=1) if reps.shape[0] > 1
              else np.full(mean.shape, np.nan))
    if np.isnan(mean[:, 0]).any() or np.isnan(mean[0, :]).any():
        raise ValueError("every monotherapy dose needs a response")
    if np.isnan(mean).any():
        warnings.append("Some combination cells are missing; HSA and Bliss "
                        "are reported there as missing and the summaries "
                        "average the cells present.")
    R, base = _baseline_correct(mean, c1, c2, baseline_correction)
    main = _scores(R, c1, c2)
    f1, f2, fit1, fit2 = main.pop("_mono")
    if f1 is None or f2 is None:
        warnings.append("A monotherapy curve could not be fitted; Loewe "
                        "and ZIP use fallbacks (observed responses).")
    if main["loewe"]["n_fallback"]:
        warnings.append(f"Loewe additivity had no solution at "
                        f"{main['loewe']['n_fallback']} cell(s); the larger "
                        "single-drug response at the total dose was used "
                        "there (SynergyFinder's fallback).")

    per_rep = []
    n_rep = reps.shape[0]
    if n_rep > 1:
        for k in range(n_rep):
            Rk = reps[k]
            if np.isnan(Rk[:, 0]).any() or np.isnan(Rk[0, :]).any():
                continue
            Rk, _ = _baseline_correct(Rk, c1, c2, baseline_correction)
            sk = _scores(Rk, c1, c2)
            sk.pop("_mono")
            per_rep.append(sk)
    models = {}
    for name in ("hsa", "bliss", "loewe", "zip"):
        m = main[name]
        entry = {"reference": _jsonable(m["reference"]),
                 "synergy": _jsonable(m["synergy"]),
                 "score": m["score"]}
        if name == "zip":
            entry["fitted"] = _jsonable(m["fitted"])
            entry["n_fallback_observed"] = m["n_fallback_observed"]
        if name == "loewe":
            entry["n_fallback"] = m["n_fallback"]
            entry["combination_index"] = _jsonable(m["ci"])
        if len(per_rep) > 1:
            scores = [p[name]["score"] for p in per_rep
                      if p[name]["score"] is not None]
            stack = np.array([p[name]["synergy"] for p in per_rep])
            with np.errstate(all="ignore"):
                entry["synergy_sd"] = _jsonable(np.nanstd(stack, axis=0,
                                                          ddof=1))
            entry["replicate_scores"] = scores
            entry["score_mean_of_replicates"] = (float(np.mean(scores))
                                                 if scores else None)
            entry["score_sd"] = (float(np.std(scores, ddof=1))
                                 if len(scores) > 1 else None)
        models[name] = entry

    ct = chou_talalay(R, c1, c2, names=(drug1, drug2))
    bad = [d for d in (ct["drug1"], ct["drug2"]) if d is None or
           not d["valid"]]
    if bad:
        reasons = sorted({c["reason"] for c in ct["combinations"]
                          if c["reason"]})
        warnings.append("Chou-Talalay combination indices were not "
                        "computed: " + "; ".join(reasons) + ".")

    def mono(f, x, fitted, name):
        if f is None:
            return {"drug": name, "fitted": False}
        p = f["params"]
        xs = [v for v in x if v > 0]
        grid = np.logspace(math.log10(min(xs)) - 0.5,
                           math.log10(max(xs)) + 0.5, 100)
        return {"drug": name, "fitted": True,
                "params": {"Bottom": p["Bottom"], "Top": p["Top"],
                           "EC50": p["EC50"], "HillSlope": p["HillSlope"]},
                "fitted_values": [float(v) for v in fitted],
                "r_squared": f["fit"]["goodness"]["r_squared"],
                "curve": {"x": grid.tolist(),
                          "y": _ll4(grid, p).tolist()}}
    return {
        "analysis": "synergy",
        "drug1": drug1, "drug2": drug2, "conc1": c1, "conc2": c2,
        "response_kind": response_kind,
        "response_scale": "% inhibition",
        "n_replicates": int(n_rep),
        "response": _jsonable(R), "response_mean_raw": _jsonable(mean),
        "response_sd": _jsonable(sd),
        "baseline_correction": baseline_correction, "baseline": base,
        "monotherapy": {"drug1": mono(f1, c1, fit1, drug1),
                        "drug2": mono(f2, c2, fit2, drug2)},
        "models": models,
        "scores": {k: v["score"] for k, v in models.items()},
        "landscapes": {k: v["synergy"] for k, v in models.items()},
        "chou_talalay": ct,
        "warnings": warnings,
    }
