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

- SynergyFinder 3's statistics (Ianevski et al. 2022 NAR 50:W739; R
  package synergyfinder, CalculateSynergy / CalculateSensitivity;
  reimplemented from the published definitions, no code copied):
  P value of each summary score = exp(-0.717 z - 0.416 z^2) (Altman &
  Bland 2011 BMJ 343:d2304) with z = |mean| / SD of the combination
  cells' synergies, or, with replicates, of the summary scores of
  p_iterations resampled matrices (per cell, the mean of n normal draws
  with that cell's replicate mean and SD). z is the mean over the SD, not
  over a standard error: a description of how consistent the synergy is,
  not a test of the mean. Most synergistic area = the 3 x 3 window of
  adjacent combination doses with the highest mean synergy. Bliss /
  Loewe consensus: expected = the largest of the HSA, Bliss and Loewe
  expectations. Sensitivity (Malyutina et al. 2019 PLoS Comput Biol
  15:e1006752): relative IC50 = the monotherapy EC50 capped at the
  highest dose; RI = mean fitted % inhibition over log10 dose between the
  lowest and highest non-zero doses; CSS1 = RI of drug 1's curve with
  drug 2 held at its IC50 (each row's LL.4 fit read there), CSS2 the
  reverse, CSS their mean.

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
import warnings

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
    try:
        return e * u ** (1.0 / h)
    except OverflowError:
        # a shallow slope (small |h|) overflows the float power: a dose
        # beyond the float range is one the curve never reaches
        return math.inf


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


# ------------------------------------------------- SynergyFinder statistics

#: Resampling passes and seed for the P value of a replicated matrix
#: (SynergyFinder's CalculateSynergy defaults: iteration = 10, seed = 123;
#: numpy's generator, so the draws differ from R's).
P_ITERATIONS = 10
P_SEED = 123


def synergy_p(values):
    """SynergyFinder's P value for a summary synergy score: z = |mean| / SD
    of `values` (SD with n - 1), P = exp(-0.717 z - 0.416 z^2), the normal
    approximation of Altman & Bland (2011, BMJ 343:d2304). `values` are the
    combination cells' synergies (no replicates) or the resampled matrices'
    summary scores (replicates). z is the mean over its SD, not over its
    standard error. None when fewer than 2 finite values or the SD is 0."""
    v = np.asarray([x for x in values if x is not None], dtype=float)
    v = v[np.isfinite(v)]
    if v.size < 2:
        return None
    sd = float(np.std(v, ddof=1))
    if not sd > 0:
        return None
    z = abs(float(np.mean(v))) / sd
    return float(math.exp(-0.717 * z - 0.416 * z * z))


def _combination_cells(m):
    comb = np.asarray(m, dtype=float)[1:, 1:]
    return comb[np.isfinite(comb)]


def _resampled(reps, rng):
    """One SynergyFinder-style resampled response matrix: per cell, the
    mean of n normal draws with that cell's replicate mean and SD (n = its
    number of replicates; a single replicate is kept as it is)."""
    with np.errstate(all="ignore"):
        n = np.sum(np.isfinite(reps), axis=0)
        mean = np.nanmean(reps, axis=0)
        sd = np.nanstd(reps, axis=0, ddof=1)
    out = np.full(mean.shape, np.nan)
    for idx in np.ndindex(mean.shape):
        k = int(n[idx])
        if k == 0:
            continue
        if k == 1 or not np.isfinite(sd[idx]):
            out[idx] = mean[idx]
        else:
            out[idx] = float(np.mean(rng.normal(mean[idx], sd[idx], k)))
    return out


def relative_inhibition(doses, responses):
    """Relative inhibition (RI; Malyutina et al. 2019, PLoS Comput Biol
    15:e1006752, as SynergyFinder's CalculateRI): the mean of the fitted
    four-parameter log-logistic curve (% inhibition) over log10 dose, from
    the lowest to the highest non-zero dose tested, i.e. the area under the
    curve on the log-dose axis divided by the width of that axis. Zero
    doses are left out of the fit; one dose gives its response. Returns
    {"ri", "fitted", "dose_range"} or None when the curve cannot be fitted."""
    x = np.asarray(doses, dtype=float)
    y = np.asarray(responses, dtype=float)
    keep = (x > 0) & np.isfinite(y)
    x, y = x[keep], y[keep]
    if x.size == 0:
        return None
    lo, hi = float(np.min(x)), float(np.max(x))
    if x.size == 1 or lo == hi:
        return {"ri": float(np.mean(y)), "fitted": False,
                "dose_range": [lo, hi]}
    if np.ptp(y) == 0:
        return {"ri": float(y[0]), "fitted": False, "dose_range": [lo, hi]}
    f = _fit_ll4(x, y)
    if f is None:
        return None
    return {"ri": _ll4_mean_log_dose(f["params"], lo, hi), "fitted": True,
            "dose_range": [lo, hi]}


def _ll4_mean_log_dose(p, lo, hi):
    """Mean of Bottom + (Top - Bottom) / (1 + 10^((LogEC50 - u) h)) over
    u = log10 dose in [log10 lo, log10 hi], in closed form:
    the integral of 1/(1 + 10^(h (m - u))) du is softplus(h ln10 (u - m))
    / (h ln10)."""
    a, b = math.log10(lo), math.log10(hi)
    bottom, top = float(p["Bottom"]), float(p["Top"])
    m, h = float(p["LogEC50"]), float(p["HillSlope"])
    k = h * math.log(10.0)
    if abs(k) < 1e-12:
        frac = 0.5
    else:
        frac = float((np.logaddexp(0.0, k * (b - m))
                      - np.logaddexp(0.0, k * (a - m))) / (k * (b - a)))
    return bottom + (top - bottom) * frac


def _fixed_dose_curve(R, conc_vary, conc_fixed, fixed_at, vary_axis):
    """Responses along `conc_vary` (non-zero doses) with the other drug at
    `fixed_at`: per dose, the observed response when the other drug has one
    non-zero dose, else the slice's LL.4 fit at fixed_at (SynergyFinder's
    CalculateCSS). A slice that cannot be fitted is read by linear
    interpolation on log10 dose (zero dose at the left end), clamped to its
    range."""
    out = []
    for i in range(1, len(conc_vary)):
        sl = R[i, :] if vary_axis == 0 else R[:, i]
        ok = np.isfinite(sl)
        xs, ys = np.asarray(conc_fixed, float)[ok], sl[ok]
        if xs.size < 2:
            out.append(np.nan)
            continue
        if np.count_nonzero(xs > 0) == 1:
            out.append(float(ys[xs > 0][0]))
            continue
        f = _fit_ll4(xs, ys)
        if f is not None:
            out.append(float(_ll4([fixed_at], f["params"])[0]))
            continue
        pos = xs > 0
        lx = np.log10(xs[pos])
        order = np.argsort(lx)
        out.append(float(np.interp(math.log10(fixed_at), lx[order],
                                   ys[pos][order])))
    return np.asarray(out, float)


def sensitivity(R, c1, c2, mono1, mono2):
    """SynergyFinder's sensitivity scores (Malyutina et al. 2019; Zheng et
    al. 2022 synergyfinder CalculateSensitivity): relative IC50 per drug
    (the monotherapy fit's EC50, capped at the highest dose tested), RI per
    drug, and the combination sensitivity score CSS = the mean of CSS1 (RI
    of drug 1's curve with drug 2 fixed at its IC50) and CSS2 (likewise)."""
    R = np.asarray(R, float)
    out = {"drug1": {}, "drug2": {}, "css": None, "css1": None, "css2": None}
    ic50 = []
    for key, f, conc, resp in (("drug1", mono1, c1, R[:, 0]),
                               ("drug2", mono2, c2, R[0, :])):
        top = float(max(conc))
        ec = None if f is None else float(f["params"]["EC50"])
        ic = None if ec is None or not math.isfinite(ec) else min(ec, top)
        ri = relative_inhibition(conc, resp)
        out[key] = {"ic50": ic, "ic50_capped": bool(ec is not None
                                                    and ic is not None
                                                    and ec > top),
                    "ri": None if ri is None else ri["ri"]}
        ic50.append(ic)
    if ic50[1] is not None:
        curve = _fixed_dose_curve(R, c1, c2, ic50[1], 0)
        ri = relative_inhibition(c1[1:], curve)
        out["css1"] = None if ri is None else ri["ri"]
    if ic50[0] is not None:
        curve = _fixed_dose_curve(R, c2, c1, ic50[0], 1)
        ri = relative_inhibition(c2[1:], curve)
        out["css2"] = None if ri is None else ri["ri"]
    parts = [v for v in (out["css1"], out["css2"]) if v is not None]
    out["css"] = float(np.mean(parts)) if len(parts) == 2 else None
    return out


def most_synergistic_area(syn, c1, c2, size: int = 3):
    """The size x size window of adjacent combination doses with the highest
    mean synergy (SynergyFinder's "most synergistic area"). None when the
    combination part of the matrix is smaller than the window."""
    comb = np.asarray(syn, float)[1:, 1:]
    n1, n2 = comb.shape
    if n1 < size or n2 < size:
        return None
    best = None
    for i in range(n1 - size + 1):
        for j in range(n2 - size + 1):
            win = comb[i:i + size, j:j + size]
            if not np.isfinite(win).all():
                continue
            v = float(win.mean())
            if best is None or v > best[0]:
                best = (v, i, j)
    if best is None:
        return None
    v, i, j = best
    return {"score": v,
            "conc1": [float(c1[1 + i]), float(c1[i + size])],
            "conc2": [float(c2[1 + j]), float(c2[j + size])],
            "size": size}


# --------------------------------------------- outliers and missing cells

#: SynergyFinder's outlier cut-off: a response more than this many %
#: inhibition from its predicted value (Ianevski et al. 2020 NAR 48:W488).
OUTLIER_THRESHOLD = 20.0


def _slice_predict(x, y, at, extrapolate=True):
    """A slice's response at dose `at` from the LL.4 fit of its other
    points (y NaN where left out); if it cannot be fitted, linear
    interpolation between the neighbouring tested doses by position
    (dose series are usually geometric), which beyond the last point
    holds the nearest response when extrapolate is True and gives None
    otherwise. None when nothing is left."""
    x = np.asarray(x, float)
    y = np.asarray(y, float)
    ok = np.isfinite(y)
    if not ok.any():
        return None
    f = _fit_ll4(x[ok], y[ok])
    if f is not None:
        v = float(_ll4([at], f["params"])[0])
        if math.isfinite(v):
            return v
    pos = np.arange(x.size, dtype=float)
    k = float(np.searchsorted(x, at))
    if not extrapolate and not (pos[ok].min() < k < pos[ok].max()):
        return None
    return float(np.interp(k, pos[ok], y[ok]))


def _slice_predictions(R, c1, c2, i, j, extrapolate=True):
    """Cell (i, j) predicted, with the cell itself left out, from each of
    its slices: a combination cell from its row (drug 2's doses at drug 1
    = c1[i]) and its column (drug 1's doses at drug 2 = c2[j]); a
    monotherapy cell from that drug's monotherapy curve; the untreated
    cell from both monotherapy curves at dose 0. extrapolate: see
    _slice_predict (False for outlier checks)."""
    R = np.array(R, dtype=float)
    R[i, j] = np.nan
    if i == 0 and j == 0:
        preds = [_slice_predict(c1, R[:, 0], 0.0, extrapolate),
                 _slice_predict(c2, R[0, :], 0.0, extrapolate)]
    elif j == 0:
        preds = [_slice_predict(c1, R[:, 0], c1[i], extrapolate)]
    elif i == 0:
        preds = [_slice_predict(c2, R[0, :], c2[j], extrapolate)]
    else:
        preds = [_slice_predict(c2, R[i, :], c2[j], extrapolate),
                 _slice_predict(c1, R[:, j], c1[i], extrapolate)]
    return [p for p in preds if p is not None]


def predict_cell(R, c1, c2, i, j):
    """The mean of the cell's left-out slice predictions (None if none)."""
    preds = _slice_predictions(R, c1, c2, i, j)
    return float(np.mean(preds)) if preds else None


def _g(v):
    return f"{v:.4g}"


def _slices_of(i, j):
    """The dose-response slices a cell's prediction uses: ("row", i) runs
    along drug 2 at drug 1 = c1[i], ("col", j) along drug 1."""
    if j == 0:
        return [("col", 0)]
    if i == 0:
        return [("row", 0)]
    return [("row", i), ("col", j)]


def _between_neighbours(R, i, j):
    """True when, on every slice of the cell where it has a tested dose on
    each side, its response lies between those two neighbours' responses
    (any monotone dose-response passes through it there)."""
    judged = False
    for kind, k in _slices_of(i, j):
        line = R[k, :] if kind == "row" else R[:, k]
        pos = j if kind == "row" else i
        left = [v for v in line[:pos] if math.isfinite(v)]
        right = [v for v in line[pos + 1:] if math.isfinite(v)]
        if not left or not right:
            continue
        judged = True
        lo, hi = sorted((left[-1], right[0]))
        if not lo <= R[i, j] <= hi:
            return False
    return judged


def find_outliers(R, c1, c2, threshold=OUTLIER_THRESHOLD,
                  max_fraction=0.25):
    """Cells whose response is more than `threshold` % inhibition from
    their left-out prediction (SynergyFinder's 20% rule, Ianevski et al.
    2020 NAR 48:W488; SynergyFinder predicts with cNMF, Ianevski et al.
    2019 Nat Mach Intell 1:568, a randomised ensemble; here each cell is
    predicted deterministically by predict_cell).

    A combination cell is flagged only when it disagrees with both its
    row's and its column's prediction: agreeing with either curve clears
    it (a very potent drug leaves a slice with no points on its rising
    part once a cell is removed, so that slice cannot predict it). Found
    one at a time: the cell deviating most (from the mean prediction) is
    set aside and the cells sharing its row or column are predicted again
    without it, so one outlier does not make its neighbours look like
    outliers. A cell lying between its neighbouring doses' responses on
    each of its slices is not flagged: a steep curve cannot be predicted
    from the points left once its middle is removed, and any monotone
    curve passes there. The untreated cell is not checked; at most
    max_fraction of the cells are flagged."""
    work = np.array(R, dtype=float)
    cells = [(i, j) for i, j in np.ndindex(work.shape)
             if not (i == 0 and j == 0) and math.isfinite(work[i, j])]
    cap = max(1, int(max_fraction * len(cells)))
    pred = {}
    out = []
    while len(out) < cap:
        for ij in cells:
            if ij not in pred and math.isfinite(work[ij]):
                pred[ij] = _slice_predictions(work, c1, c2, *ij,
                                               extrapolate=False)
        worst = None
        for ij in cells:
            preds = pred.get(ij)
            if not preds or not math.isfinite(work[ij]):
                continue
            if any(abs(work[ij] - q) <= threshold for q in preds):
                continue
            p = float(np.mean(preds))
            dev = float(work[ij] - p)
            if not _between_neighbours(work, *ij):
                if worst is None or abs(dev) > abs(worst[1]):
                    worst = (ij, dev, p)
        if worst is None:
            break
        (i, j), dev, p = worst
        out.append({"row": i, "col": j, "conc1": float(c1[i]),
                    "conc2": float(c2[j]), "observed": float(work[i, j]),
                    "predicted": p, "deviation": dev,
                    "kind": "combination" if i and j else "monotherapy"})
        work[i, j] = np.nan
        hit = set(_slices_of(i, j)) | {("row", i), ("col", j)}
        for ij in list(pred):
            if set(_slices_of(*ij)) & hit:
                del pred[ij]
    return out


def _consensus(R, scored):
    """Bliss / Loewe consensus (SynergyFinder 3, Ianevski et al. 2022 NAR
    50:W739): the expected response is the largest of the HSA, Bliss and
    Loewe expectations at each dose pair, so its synergy is the smallest of
    the three."""
    refs = np.stack([scored[k]["reference"] for k in ("hsa", "bliss",
                                                      "loewe")])
    with np.errstate(all="ignore"), warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)  # all-NaN cells
        ref = np.nanmax(refs, axis=0)
    syn = R - ref
    syn[0, :] = 0.0
    syn[:, 0] = 0.0
    comb = syn[1:, 1:]
    score = float(np.nanmean(comb)) if np.isfinite(comb).any() else None
    return {"reference": ref, "synergy": syn, "score": score}


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
            drug1="Drug 1", drug2="Drug 2", p_iterations=P_ITERATIONS,
            p_seed=P_SEED, outliers="none",
            outlier_threshold=OUTLIER_THRESHOLD, impute=False) -> dict:
    """HSA, Bliss, Loewe and ZIP synergy landscapes and summary scores,
    each with SynergyFinder's P value and most synergistic area; the Bliss /
    Loewe consensus; SynergyFinder's sensitivity scores (relative IC50, RI,
    CSS); and Chou-Talalay combination indices, from a dose-response
    matrix. With replicates the P values come from p_iterations resampled
    matrices (seed p_seed), as SynergyFinder's CalculateSynergy.

    outliers: "none", "flag" (cells more than outlier_threshold %
    inhibition from their left-out prediction are reported) or "replace"
    (and scored at that prediction, as SynergyFinder 3). impute: fill
    cells missing in every replicate with the same prediction (a missing
    monotherapy dose is otherwise an error)."""
    if outliers not in ("none", "flag", "replace"):
        raise ValueError("outliers must be 'none', 'flag' or 'replace'")
    c1, c2, reps = build_matrix(records, conc1=conc1, conc2=conc2,
                                responses=responses,
                                response_kind=response_kind)
    if len(c1) < 3 or len(c2) < 3:
        raise ValueError("synergy needs at least 2 non-zero doses of each "
                         "drug (a 3 x 3 matrix)")
    warnings = []
    with np.errstate(all="ignore"):
        mean = np.nanmean(reps, axis=0)
    outlier_cells = None
    to_fill = []
    if outliers != "none":
        outlier_cells = find_outliers(mean, c1, c2, outlier_threshold)
        if outlier_cells:
            where = "; ".join(
                f"{drug1} {_g(o['conc1'])} + {drug2} {_g(o['conc2'])}: "
                f"{_g(o['observed'])} vs {_g(o['predicted'])} predicted"
                for o in outlier_cells)
            warnings.append(
                f"{len(outlier_cells)} cell(s) differ from their predicted "
                f"response by more than {_g(outlier_threshold)}% inhibition"
                f" ({where})"
                + ("; they were replaced by the prediction." if outliers ==
                   "replace" else "; they are flagged, not changed."))
        if outliers == "replace":
            to_fill += [(o["row"], o["col"]) for o in outlier_cells]
    if impute:
        to_fill += [tuple(int(v) for v in ij)
                    for ij in np.argwhere(np.isnan(mean))]
    imputed = []
    if to_fill:
        # predict every cell from the matrix without any of them, so one
        # filled value never feeds another
        holed = mean.copy()
        for i, j in to_fill:
            holed[i, j] = np.nan
        for i, j in to_fill:
            p = predict_cell(holed, c1, c2, i, j)
            if p is None:
                continue
            reps[:, i, j] = p
            imputed.append({"conc1": float(c1[i]), "conc2": float(c2[j]),
                            "value": p,
                            "reason": ("outlier" if math.isfinite(mean[i, j])
                                       else "missing")})
        n_missing = sum(c["reason"] == "missing" for c in imputed)
        if n_missing:
            warnings.append(f"{n_missing} missing cell(s) were filled with "
                            "the response predicted from their row and "
                            "column dose-response fits.")
    with np.errstate(all="ignore"):
        mean = np.nanmean(reps, axis=0)
        sd = (np.nanstd(reps, axis=0, ddof=1) if reps.shape[0] > 1
              else np.full(mean.shape, np.nan))
    if np.isnan(mean[:, 0]).any() or np.isnan(mean[0, :]).any():
        raise ValueError("every monotherapy dose needs a response (or turn "
                         "on filling missing cells)")
    if np.isnan(mean).any():
        warnings.append("Some combination cells are missing; HSA and Bliss "
                        "are reported there as missing and the summaries "
                        "average the cells present.")
    R, base = _baseline_correct(mean, c1, c2, baseline_correction)
    main = _scores(R, c1, c2)
    f1, f2, fit1, fit2 = main.pop("_mono")
    main["consensus"] = _consensus(R, main)
    named = ("hsa", "bliss", "loewe", "zip", "consensus")
    n_rep = reps.shape[0]
    if n_rep > 1 and not p_iterations:
        # resampling turned off (each pass refits every curve: slow)
        p_values = {k: None for k in named}
        p_basis = None
    elif n_rep > 1:
        # SynergyFinder: score resampled matrices, P from their summaries
        rng = np.random.default_rng(p_seed)
        resampled = {k: [] for k in named}
        for _ in range(int(p_iterations)):
            Rb = _resampled(reps, rng)
            if np.isnan(Rb[:, 0]).any() or np.isnan(Rb[0, :]).any():
                continue
            Rb, _ = _baseline_correct(Rb, c1, c2, baseline_correction)
            sb = _scores(Rb, c1, c2)
            sb.pop("_mono")
            sb["consensus"] = _consensus(Rb, sb)
            for k in named:
                resampled[k].append(sb[k]["score"])
        p_values = {k: synergy_p(resampled[k]) for k in named}
        p_basis = (f"summary scores of {int(p_iterations)} resampled "
                   f"matrices (normal draws with each cell's replicate mean "
                   f"and SD, seed {p_seed})")
    else:
        p_values = {k: synergy_p(_combination_cells(main[k]["synergy"]))
                    for k in named}
        p_basis = "synergy of the combination cells"
    if f1 is None or f2 is None:
        warnings.append("A monotherapy curve could not be fitted; Loewe "
                        "and ZIP use fallbacks (observed responses).")
    if main["loewe"]["n_fallback"]:
        warnings.append(f"Loewe additivity had no solution at "
                        f"{main['loewe']['n_fallback']} cell(s); the larger "
                        "single-drug response at the total dose was used "
                        "there (SynergyFinder's fallback).")

    per_rep = []
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
                 "score": m["score"], "p_value": p_values[name],
                 "most_synergistic_area": most_synergistic_area(
                     m["synergy"], c1, c2)}
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
        "consensus": {
            "reference": _jsonable(main["consensus"]["reference"]),
            "synergy": _jsonable(main["consensus"]["synergy"]),
            "score": main["consensus"]["score"],
            "p_value": p_values["consensus"],
            "most_synergistic_area": most_synergistic_area(
                main["consensus"]["synergy"], c1, c2)},
        "p_value_basis": p_basis,
        "outliers": (None if outlier_cells is None else
                     {"action": outliers, "threshold": float(
                         outlier_threshold), "cells": outlier_cells}),
        "filled_cells": imputed,
        "sensitivity": sensitivity(R, c1, c2, f1, f2),
        "chou_talalay": ct,
        "warnings": warnings,
    }
