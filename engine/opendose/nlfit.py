"""General nonlinear regression engine + built-in equation library.

Prism curve-fitting guide references:
- Equation library: "Dose-response", "Enzyme kinetics -- Michaelis-Menten",
  "Exponential -- One phase decay / association / Two phase decay /
  Exponential growth", "Binding -- saturation", "Lines -- straight line".
- Weighting ("Unequal weighting"): Prism weights by the PREDICTED Y of the
  curve (1/Y, 1/Y^2) or by X (1/X, 1/X^2); minimized quantity is the
  weighted sum of squares.
- Asymmetrical (profile-likelihood) CIs (Prism 8+ default): the interval
  where fixing one parameter and re-optimizing the rest raises SS to
  SS_min * (1 + F(0.95; 1, df)/df).
- Robust regression and ROUT outlier removal (Motulsky & Brown 2006,
  BMC Bioinformatics 7:123): robust merit based on the Lorentzian,
  RSDR = P68 of |residuals| * N/(N-K); outliers flagged by a
  false-discovery-rate test on t = residual/RSDR with threshold Q.
- Data entered as mean, SD (or SEM) and n (curve-fitting guide, "Method
  tab" > Replicates; "Nonlinear regression with unequal weights"; FAQ
  2038 "Nonlinear regression when you entered error values directly"):
  accounting for SD and n gives exactly the least-squares results of the
  raw replicates, via SS = sum W_i [n_i (mean_i - Ycurve_i)^2 +
  (n_i - 1) SD_i^2] with sum n_i points, for every weighting scheme
  (weights are equal within a row). "Fit means only" sees one point per
  row. Weight by 1/SD^2 uses the SD of each row (entered, or computed
  from the replicates). Robust fitting and ROUT detection see the means.
- "Choosing transforms of parameters to report" (Transform,
  transform_entries): one-parameter transforms carry that parameter's CI
  through the transform (asymmetrical) or use value +/- t*SE (delta
  method, symmetrical); several parameters: delta-method SE with the full
  covariance and a symmetrical CI, none with profile-likelihood CIs;
  Y[...] interpolations use the confidence band, X[...] the band's
  crossings. "Entering default constraints": range constraints (bounds)
  switch the solver to a bounded trust-region method; data-set constants
  computed from the data (centered polynomials' XMean).
- The extended equation library (equations.py) and user-defined
  equations (userequation.py) register further ModelSpec entries; the
  entries defined in this file are unchanged by them.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Callable

import numpy as np
from scipy import stats
from scipy.optimize import brentq, curve_fit, least_squares


# ---------------------------------------------------------------- registry

@dataclass
class ModelSpec:
    name: str
    label: str                       # Prism's menu name
    equation: str                    # Prism's equation text
    params: list[str]
    func: Callable                   # func(x: ndarray, p: dict) -> ndarray
    initials: Callable               # initials(x, y) -> dict
    derived: Callable | None = None  # derived(fitted, ci_map) -> dict
    multistart: str | None = None    # param seeded across the x range
    x_is_log: bool = False           # X is log10(concentration)
    x_label: str = "X"
    y_label: str = "Y"
    required_constants: tuple = ()   # params the user MUST constrain
                                     # (Prism: "constants you must enter")
    # ---- optional metadata for the extended library (equations.py) and
    # user-defined equations (userequation.py); the defaults leave the
    # behaviour of the entries above unchanged.
    family: str = ""                 # Prism's equation panel
    transforms: list | None = None   # [Transform]: "transforms to report"
    multistart_mode: str | None = None  # "x": seed the multistart param
                                     # at each X; None: legacy rule
    data_constants: dict | None = None  # name -> fn(x, y): constant set
                                     # from the data (centered XMean)
    bounds: dict | None = None       # name -> (lo, hi) range constraints
    dataset_constants: tuple = ()    # column constants (global fits)
    shared: tuple = ()               # parameters shared by default
    param_scope: dict | None = None  # name -> "first" | "rest" (<A>/<~A>)
    global_only: bool = False        # meaningful only as a global fit
    global_initials: Callable | None = None  # fn(datasets) -> [dict]
    user: bool = False               # compiled user-defined equation
    initials_fixed: bool = False     # initials(x, y, fixed): rules that
                                     # need the experimental constants


@dataclass
class Transform:
    """One of Prism's "transforms to report" (curve-fitting guide,
    "Choosing transforms of parameters to report").

    kind:
    - "params": a function of the parameters only. One free parameter:
      the CI is that parameter's CI pushed through the transform
      ("asymmetrical", monotonic transforms only) or value +/- t*SE
      ("symmetrical", asymptotic CIs). Several free parameters: delta
      method SE and symmetrical CI, none with profile-likelihood CIs.
    - "y_interp": uses Y[...] interpolations; delta-method SE over every
      free parameter, i.e. the confidence band of the curve.
    - "x_interp": X[level] with a level depending on at most one
      parameter and nothing outside: root of the curve, CI where the
      confidence band crosses the level (asymmetrical). x_level(p) gives
      the level, outer(root) the reported value.
    - "x_interp_complex": value only (Prism reports no CI).
    """
    name: str
    fn: Callable                     # fn(p) -> float
    params: tuple = ()               # parameters referenced
    ci: str = "asymmetrical"         # "asymmetrical" | "symmetrical" | "none"
    kind: str = "params"
    x_level: Callable | None = None
    outer: Callable | None = None
    uses_x: bool = False             # fn(p, x) / x_level(p, x): needs the
                                     # fitted X values (interpolation range)


MODELS: dict[str, ModelSpec] = {}


def register(spec: ModelSpec) -> None:
    MODELS[spec.name] = spec


def _pow10(v: float) -> float:
    try:
        return 10.0 ** v
    except OverflowError:
        return math.inf


# ---- dose-response family (shared functional form) ----

def _dr_func(x, p):
    return p["Bottom"] + (p["Top"] - p["Bottom"]) / (
        1.0 + 10.0 ** ((p["LogXmid"] - np.asarray(x, dtype=float)) * p["HillSlope"]))


def _dr_initials(direction):
    def initials(x, y):
        top = float(np.max(y))
        bottom = float(np.min(y))
        half = (top + bottom) / 2
        idx = int(np.argmin(np.abs(np.asarray(y) - half)))
        return {"Top": top, "Bottom": bottom,
                "LogXmid": float(np.asarray(x)[idx]),
                "HillSlope": 1.0 if direction == "agonist" else -1.0}
    return initials


def _dr_derived(xmid_label):
    lin = xmid_label[3:]  # IC50 / EC50

    def derived(fitted, ci_map):
        out = {lin: {"value": _pow10(fitted["LogXmid"]),
                     "ci95": ([_pow10(ci_map["LogXmid"][0]),
                               _pow10(ci_map["LogXmid"][1])]
                              if "LogXmid" in ci_map else None)}}
        return out
    return derived


for _name, _direction, _xmid in [
    ("log_inhibitor_vs_response_4pl", "inhibitor", "LogIC50"),
    ("log_inhibitor_vs_response_3pl", "inhibitor", "LogIC50"),
    ("log_agonist_vs_response_4pl", "agonist", "LogEC50"),
    ("log_agonist_vs_response_3pl", "agonist", "LogEC50"),
]:
    register(ModelSpec(
        name=_name,
        label=("log(%s) vs. response -- %s" % (
            _direction,
            "Variable slope (four parameters)" if _name.endswith("4pl")
            else "(three parameters)")),
        equation=f"Y=Bottom + (Top-Bottom)/(1+10^(({_xmid}-X)*HillSlope))",
        params=["Top", "Bottom", "LogXmid", "HillSlope"],
        func=_dr_func,
        initials=_dr_initials(_direction),
        derived=_dr_derived(_xmid),
        multistart="LogXmid",
        x_is_log=True,
        x_label=f"log[{'Inhibitor' if _direction == 'inhibitor' else 'Agonist'}]",
    ))


# ---- enzyme kinetics / binding ----

register(ModelSpec(
    name="michaelis_menten",
    label="Michaelis-Menten",
    equation="Y = Vmax*X/(Km + X)",
    params=["Vmax", "Km"],
    func=lambda x, p: p["Vmax"] * np.asarray(x, float) / (p["Km"] + np.asarray(x, float)),
    initials=lambda x, y: {"Vmax": float(np.max(y)),
                           "Km": float(np.asarray(x)[
                               int(np.argmin(np.abs(np.asarray(y) - np.max(y) / 2)))])
                           or float(np.mean(x))},
    x_label="[Substrate]",
    y_label="Enzyme velocity",
))

# ---- competitive binding (Prism curve-fitting guide, "Competitive
# binding" section) ----

def _one_site_comp_func(x, p):
    x = np.asarray(x, dtype=float)
    return p["Bottom"] + (p["Top"] - p["Bottom"]) / (
        1.0 + 10.0 ** (x - p["LogIC50"]))


def _comp_initials(x, y):
    top = float(np.max(y))
    bottom = float(np.min(y))
    half = (top + bottom) / 2
    idx = int(np.argmin(np.abs(np.asarray(y) - half)))
    return {"Top": top, "Bottom": bottom,
            "LogIC50": float(np.asarray(x)[idx])}


def _log_derived(log_name, lin_name):
    def derived(fitted, ci_map):
        return {lin_name: {
            "value": _pow10(fitted[log_name]),
            "ci95": ([_pow10(ci_map[log_name][0]), _pow10(ci_map[log_name][1])]
                     if log_name in ci_map else None)}}
    return derived


register(ModelSpec(
    name="one_site_competition",
    label="One site -- Fit logIC50",
    equation="Y=Bottom + (Top-Bottom)/(1+10^(X-LogIC50))",
    params=["Top", "Bottom", "LogIC50"],
    func=_one_site_comp_func,
    initials=_comp_initials,
    derived=_log_derived("LogIC50", "IC50"),
    multistart="LogIC50",
    x_is_log=True,
    x_label="log[Competitor]",
    y_label="Binding",
))


def _one_site_ki_func(x, p):
    x = np.asarray(x, dtype=float)
    log_ec50 = np.log10(10.0 ** p["LogKi"] * (1.0 + p["HotNM"] / p["HotKdNM"]))
    return p["Bottom"] + (p["Top"] - p["Bottom"]) / (
        1.0 + 10.0 ** (x - log_ec50))


register(ModelSpec(
    name="one_site_fit_ki",
    label="One site -- Fit Ki",
    equation=("logEC50=log(10^logKi*(1+HotnM/HotKdnM)); "
              "Y=Bottom + (Top-Bottom)/(1+10^(X-logEC50))"),
    params=["Top", "Bottom", "LogKi", "HotNM", "HotKdNM"],
    func=_one_site_ki_func,
    initials=lambda x, y: {**{k: v for k, v in _comp_initials(x, y).items()
                              if k != "LogIC50"},
                           "LogKi": _comp_initials(x, y)["LogIC50"],
                           "HotNM": 1.0, "HotKdNM": 1.0},
    derived=_log_derived("LogKi", "Ki"),
    multistart="LogKi",
    x_is_log=True,
    x_label="log[Competitor]",
    y_label="Binding",
    required_constants=("HotNM", "HotKdNM"),
))


def _two_site_comp_func(x, p):
    x = np.asarray(x, dtype=float)
    span = p["Top"] - p["Bottom"]
    frac = p["FracHi"]
    return (p["Bottom"]
            + span * frac / (1.0 + 10.0 ** (x - p["LogIC50_HiAff"]))
            + span * (1.0 - frac) / (1.0 + 10.0 ** (x - p["LogIC50_LoAff"])))


def _two_site_derived(fitted, ci_map):
    out = _log_derived("LogIC50_HiAff", "IC50_HiAff")(fitted, ci_map)
    out.update(_log_derived("LogIC50_LoAff", "IC50_LoAff")(fitted, ci_map))
    return out


register(ModelSpec(
    name="two_site_competition",
    label="Two sites -- Fit logIC50",
    equation=("Y=Bottom + (Top-Bottom)*(FracHi/(1+10^(X-LogIC50_HiAff))"
              " + (1-FracHi)/(1+10^(X-LogIC50_LoAff)))"),
    params=["Top", "Bottom", "FracHi", "LogIC50_HiAff", "LogIC50_LoAff"],
    func=_two_site_comp_func,
    initials=lambda x, y: {
        "Top": float(np.max(y)), "Bottom": float(np.min(y)), "FracHi": 0.5,
        "LogIC50_HiAff": float(np.percentile(np.asarray(x, float), 25)),
        "LogIC50_LoAff": float(np.percentile(np.asarray(x, float), 75))},
    derived=_two_site_derived,
    multistart="LogIC50_HiAff",
    x_is_log=True,
    x_label="log[Competitor]",
    y_label="Binding",
))


register(ModelSpec(
    name="saturation_binding",
    label="One site -- Specific binding",
    equation="Y = Bmax*X/(Kd + X)",
    params=["Bmax", "Kd"],
    func=lambda x, p: p["Bmax"] * np.asarray(x, float) / (p["Kd"] + np.asarray(x, float)),
    initials=lambda x, y: {"Bmax": float(np.max(y)),
                           "Kd": float(np.mean(x))},
    x_label="[Ligand]",
    y_label="Specific binding",
))


# ---- exponential family ----

def _decay_derived(fitted, ci_map):
    k = fitted["K"]
    out = {"HalfLife": {"value": math.log(2) / k if k > 0 else math.inf,
                        "ci95": None},
           "Tau": {"value": 1 / k if k > 0 else math.inf, "ci95": None},
           "Span": {"value": fitted["Y0"] - fitted["Plateau"], "ci95": None}}
    if "K" in ci_map and all(v > 0 for v in ci_map["K"]):
        lo, hi = ci_map["K"]
        out["HalfLife"]["ci95"] = [math.log(2) / hi, math.log(2) / lo]
        out["Tau"]["ci95"] = [1 / hi, 1 / lo]
    return out


register(ModelSpec(
    name="one_phase_decay",
    label="One phase decay",
    equation="Y=(Y0-Plateau)*exp(-K*X) + Plateau",
    params=["Y0", "Plateau", "K"],
    func=lambda x, p: (p["Y0"] - p["Plateau"]) * np.exp(-p["K"] * np.asarray(x, float))
        + p["Plateau"],
    initials=lambda x, y: {
        "Y0": float(np.asarray(y)[int(np.argmin(np.asarray(x)))]),
        "Plateau": float(np.min(y)),
        "K": 3.0 / max(float(np.max(x) - np.min(x)), 1e-12)},
    derived=_decay_derived,
    multistart="K",
    x_label="Time",
))

register(ModelSpec(
    name="one_phase_association",
    label="One phase association",
    equation="Y=Y0 + (Plateau-Y0)*(1-exp(-K*X))",
    params=["Y0", "Plateau", "K"],
    func=lambda x, p: p["Y0"] + (p["Plateau"] - p["Y0"])
        * (1 - np.exp(-p["K"] * np.asarray(x, float))),
    initials=lambda x, y: {
        "Y0": float(np.min(y)), "Plateau": float(np.max(y)),
        "K": 3.0 / max(float(np.max(x) - np.min(x)), 1e-12)},
    derived=_decay_derived,
    multistart="K",
    x_label="Time",
))


def _growth_derived(fitted, ci_map):
    k = fitted["K"]
    out = {"DoublingTime": {"value": math.log(2) / k if k > 0 else math.inf,
                            "ci95": None}}
    if "K" in ci_map and all(v > 0 for v in ci_map["K"]):
        lo, hi = ci_map["K"]
        out["DoublingTime"]["ci95"] = [math.log(2) / hi, math.log(2) / lo]
    return out


register(ModelSpec(
    name="exponential_growth",
    label="Exponential growth",
    equation="Y=Y0*exp(K*X)",
    params=["Y0", "K"],
    func=lambda x, p: p["Y0"] * np.exp(p["K"] * np.asarray(x, float)),
    initials=lambda x, y: {
        "Y0": max(float(np.asarray(y)[int(np.argmin(np.asarray(x)))]), 1e-9),
        "K": 1.0 / max(float(np.max(x) - np.min(x)), 1e-12)},
    derived=_growth_derived,
    multistart="K",
    x_label="Time",
))

def _two_phase_decay_func(x, p):
    x = np.asarray(x, float)
    span = p["Y0"] - p["Plateau"]
    frac = p["PercentFast"] * 0.01
    return (p["Plateau"] + span * frac * np.exp(-p["KFast"] * x)
            + span * (1 - frac) * np.exp(-p["KSlow"] * x))


def _two_phase_decay_derived(fitted, ci_map):
    out = {}
    for label, key in (("HalfLifeFast", "KFast"), ("HalfLifeSlow", "KSlow")):
        k = fitted[key]
        out[label] = {"value": math.log(2) / k if k > 0 else math.inf,
                      "ci95": None}
        if key in ci_map and all(v > 0 for v in ci_map[key]):
            lo, hi = ci_map[key]
            out[label]["ci95"] = [math.log(2) / hi, math.log(2) / lo]
    return out


register(ModelSpec(
    name="two_phase_decay",
    label="Two phase decay",
    equation=("Y=Plateau + (Y0-Plateau)*PercentFast*.01*exp(-KFast*X)"
              " + (Y0-Plateau)*(1-PercentFast*.01)*exp(-KSlow*X)"),
    params=["Y0", "Plateau", "PercentFast", "KFast", "KSlow"],
    func=_two_phase_decay_func,
    initials=lambda x, y: {
        "Y0": float(np.asarray(y)[int(np.argmin(np.asarray(x)))]),
        "Plateau": float(np.min(y)), "PercentFast": 50.0,
        "KFast": 10.0 / max(float(np.max(x) - np.min(x)), 1e-12),
        "KSlow": 1.0 / max(float(np.max(x) - np.min(x)), 1e-12)},
    derived=_two_phase_decay_derived,
    multistart="KFast",
    x_label="Time",
))


def _poly_func(order):
    def f(x, p):
        x = np.asarray(x, float)
        return sum(p[f"B{i}"] * x ** i for i in range(order + 1))
    return f


def _poly_initials(order):
    def initials(x, y):
        coefs = np.polyfit(np.asarray(x, float), np.asarray(y, float), order)
        return {f"B{i}": float(c) for i, c in enumerate(coefs[::-1])}
    return initials


for _order, _name in ((2, "polynomial_second"), (3, "polynomial_third")):
    register(ModelSpec(
        name=_name,
        label=f"{'Second' if _order == 2 else 'Third'} order polynomial",
        equation="Y = " + " + ".join(
            f"B{i}*X^{i}" if i > 1 else ("B1*X" if i == 1 else "B0")
            for i in range(_order + 1)),
        params=[f"B{i}" for i in range(_order + 1)],
        func=_poly_func(_order),
        initials=_poly_initials(_order),
    ))


register(ModelSpec(
    name="straight_line",
    label="Straight line (via nonlinear engine)",
    equation="Y = Slope*X + Yintercept",
    params=["Slope", "Yintercept"],
    func=lambda x, p: p["Slope"] * np.asarray(x, float) + p["Yintercept"],
    initials=lambda x, y: {
        "Slope": float(np.polyfit(np.asarray(x, float), np.asarray(y, float), 1)[0]),
        "Yintercept": float(np.polyfit(np.asarray(x, float), np.asarray(y, float), 1)[1])},
))


# ---------------------------------------------------------------- fitting

WEIGHTINGS = ("none", "1/Y", "1/Y2", "1/X", "1/X2", "1/SD2")
WEIGHT_SOURCES = ("predicted", "observed_mean")
REPLICATE_MODES = ("account", "means_only")


def _replicate_mean_y(x, y):
    """Mean observed Y among points sharing the same X (replicates)."""
    means = {}
    for xv in np.unique(x):
        means[xv] = float(np.mean(y[x == xv]))
    return np.array([means[xv] for xv in x])


def _weights(x, ybase, weighting):
    """ybase: the Y used for Y-based weighting (see weight_source)."""
    if weighting == "none":
        return np.ones_like(x, dtype=float)
    if weighting == "1/Y":
        return 1.0 / np.clip(np.abs(ybase), 1e-12, None)
    if weighting == "1/Y2":
        return 1.0 / np.clip(ybase * ybase, 1e-24, None)
    if weighting == "1/X":
        return 1.0 / np.clip(np.abs(x), 1e-12, None)
    if weighting == "1/X2":
        return 1.0 / np.clip(x * x, 1e-24, None)
    raise ValueError(f"unknown weighting: {weighting}")


def _clean_xy(x_values, y_values):
    pairs = [(float(a), float(b)) for a, b in zip(x_values, y_values)
             if a is not None and b is not None
             and math.isfinite(float(a)) and math.isfinite(float(b))]
    return (np.array([p[0] for p in pairs]), np.array([p[1] for p in pairs]))


def _summary_inputs(x_values, y_values, sd_values, n_values, replicates,
                    weighting):
    """Rows of (X, mean, SD, n) -> (x, y, summary) for the mean/SD/n fit.

    y_values are the row means. With sd_values and n_values both None
    (only reachable with weighting '1/SD2') the inputs are raw
    replicates, collapsed here to mean/SD/n per distinct X; the fit is
    then the replicate fit with each replicate weighted by 1/SD^2 of its
    row, as Prism does when it computes the SD from replicates.

    summary keys: counts (points each row stands for), within ((n-1)SD^2
    per row, zero when fitting means only), sd_w (1/SD^2 or 1),
    mean_y (count-weighted observed mean at each X), n_obs, mode, sd, n.
    """
    if replicates not in REPLICATE_MODES:
        raise ValueError(f"unknown replicates mode: {replicates}")

    def num(v):
        if v is None:
            return None
        v = float(v)
        return v if math.isfinite(v) else None

    if sd_values is None and n_values is None:
        xr, yr = _clean_xy(x_values, y_values)
        rows = []
        for xv in np.unique(xr):
            grp = yr[xr == xv]
            sd = float(grp.std(ddof=1)) if grp.size > 1 else None
            rows.append((float(xv), float(grp.mean()), sd, float(grp.size)))
    else:
        m = len(y_values)
        sd_list = list(sd_values) if sd_values is not None else [None] * m
        n_list = list(n_values) if n_values is not None else [None] * m
        rows = []
        for xv, yv, sv, nv in zip(x_values, y_values, sd_list, n_list):
            xv, yv, sv, nv = num(xv), num(yv), num(sv), num(nv)
            if xv is None or yv is None:
                continue
            if n_values is not None:
                if nv is None or nv <= 0:
                    continue  # a row with no sample size holds no data
                if nv != round(nv):
                    raise ValueError(f"n must be a whole number (got {nv})")
            rows.append((xv, yv, sv, nv))

    has_n = n_values is not None or (sd_values is None and n_values is None)
    mode = "account" if (has_n and replicates == "account") else "means_only"
    x = np.array([r[0] for r in rows], dtype=float)
    y = np.array([r[1] for r in rows], dtype=float)
    sd = [r[2] for r in rows]
    nn = [r[3] for r in rows]
    if mode == "account":
        counts = np.array(nn, dtype=float)
        for s_i, n_i in zip(sd, nn):
            if n_i > 1 and (s_i is None or s_i < 0):
                raise ValueError("every row with n > 1 needs an SD")
        within = np.array([(n_i - 1.0) * s_i * s_i if n_i > 1 else 0.0
                           for s_i, n_i in zip(sd, nn)])
    else:
        counts = np.ones_like(y)
        within = np.zeros_like(y)
    if weighting == "1/SD2":
        if any(s_i is None or not s_i > 0 for s_i in sd):
            raise ValueError("weighting by 1/SD^2 needs a nonzero SD on "
                             "every row (and >= 2 replicates per X)")
        sd_w = np.array([1.0 / (s_i * s_i) for s_i in sd])
    else:
        sd_w = np.ones_like(y)
    mean_y = np.empty_like(y)
    for xv in np.unique(x):
        sel = x == xv
        mean_y[sel] = np.sum(counts[sel] * y[sel]) / np.sum(counts[sel])
    summary = {"counts": counts, "within": within, "sd_w": sd_w,
               "mean_y": mean_y, "n_obs": int(round(float(counts.sum()))),
               "mode": mode, "sd": sd, "n": nn}
    return x, y, summary


def _ols_fit(spec, x, y, free_names, fixed, p0_map, weighting,
             weight_source="predicted", summary=None):
    """(Weighted) least squares from one start; returns (popt, pcov, wss).

    Y-based weighting follows Prism's documented algorithm ("Math theory
    of weighting", reg_how_weigting_works.htm): the weights come from the
    PREDICTED curve Y, the first iteration is unweighted, and each
    subsequent iteration re-derives the weights from the current curve,
    i.e. iteratively reweighted least squares (IRLS). Weights are frozen
    within each iteration (never differentiated through), so the fixed
    point is Prism's, not the minimizer of the ratio objective.

    weight_source:
    - "predicted": Prism's IRLS scheme (default; validated session 3).
    - "observed_mean": weights fixed from the mean observed Y of the
      replicates at each X (a close, non-iterative approximation).

    summary (from _summary_inputs; None for raw points): y holds row
    means; each row's weight is multiplied by its n (counts) and, for
    '1/SD2', by 1/SD^2, and the within-row SS is added back to wss, so
    wss and the covariance equal those of the raw replicates.
    """

    def make_params(free_vals):
        p = dict(fixed)
        p.update(dict(zip(free_names, free_vals)))
        return p

    box = _free_bounds(spec, free_names)

    def solve(weights_sqrt, p0):
        def wresid(free_vals):
            return (y - spec.func(x, make_params(free_vals))) * weights_sqrt
        if box is None:
            res = least_squares(wresid, p0, method="lm", max_nfev=20000)
        else:  # range constraints (Prism's "between"/"greater than")
            res = least_squares(wresid, _inside(p0, box), method="trf",
                                bounds=box, x_scale="jac", max_nfev=20000)
        if not res.success and res.status <= 0:
            raise RuntimeError("did not converge")
        return res

    p0 = [p0_map[n] for n in free_names]
    y_weighted = weighting in ("1/Y", "1/Y2")
    if summary is not None:
        return _ols_fit_summary(spec, x, y, free_names, solve, p0,
                                make_params, weighting, weight_source,
                                summary)

    if not y_weighted:
        w = _weights(x, x, weighting)  # 'none' or X-based: fixed weights
        res = solve(np.sqrt(w), p0)
    elif weight_source == "observed_mean":
        w = _weights(x, _replicate_mean_y(x, y), weighting)
        res = solve(np.sqrt(w), p0)
    else:  # Prism IRLS: unweighted first, then reweight from the curve
        res = solve(np.ones_like(y), p0)
        prev = res.x
        for _ in range(60):
            w = _weights(x, spec.func(x, make_params(prev)), weighting)
            res = solve(np.sqrt(w), prev)
            if np.allclose(res.x, prev, rtol=1e-10, atol=1e-12):
                break
            prev = res.x

    J = res.jac
    wss = float(2 * res.cost)
    # covariance = (J'J)^-1 * s2 (final iteration's frozen weights)
    dof = x.size - len(free_names)
    s2 = wss / dof
    try:
        cov = np.linalg.inv(J.T @ J) * s2
    except np.linalg.LinAlgError:
        cov = np.full((len(free_names), len(free_names)), np.nan)
    return res.x, cov, wss


def _free_bounds(spec, free_names):
    """(lo, hi) arrays for least_squares when any free parameter has a
    range constraint (spec.bounds), else None (unbounded LM, as before)."""
    bounds = getattr(spec, "bounds", None) or {}
    if not any(n in bounds for n in free_names):
        return None
    lo = np.array([bounds.get(n, (None, None))[0] for n in free_names],
                  dtype=float)
    hi = np.array([bounds.get(n, (None, None))[1] for n in free_names],
                  dtype=float)
    lo = np.where(np.isnan(lo), -np.inf, lo)
    hi = np.where(np.isnan(hi), np.inf, hi)
    return lo, hi


def _inside(p0, box):
    """Move a start strictly inside the box (trf needs a feasible x0)."""
    lo, hi = box
    p = np.array(p0, dtype=float)
    width = np.where(np.isfinite(hi - lo), hi - lo, np.inf)
    pad = np.where(np.isfinite(width), width * 1e-6,
                   np.maximum(np.abs(p) * 1e-6, 1e-10))
    return np.clip(p, lo + pad, hi - pad)


def _replicate_weights(x, ybase, weighting, summary):
    """Weight of each replicate in a row (the n multiplier excluded)."""
    if weighting == "1/SD2":
        return summary["sd_w"]
    return _weights(x, ybase, weighting) * summary["sd_w"]


def _ols_fit_summary(spec, x, y, free_names, solve, p0, make_params,
                     weighting, weight_source, summary):
    """_ols_fit for rows of mean/SD/n; same iteration scheme as the raw
    path, with row weights W_i * n_i and the within-row SS added back."""
    counts, within = summary["counts"], summary["within"]
    y_weighted = weighting in ("1/Y", "1/Y2")

    if not y_weighted:
        w = _replicate_weights(x, x, weighting, summary)
        res = solve(np.sqrt(w * counts), p0)
    elif weight_source == "observed_mean":
        w = _replicate_weights(x, summary["mean_y"], weighting, summary)
        res = solve(np.sqrt(w * counts), p0)
    else:
        res = solve(np.sqrt(counts * summary["sd_w"]), p0)
        prev = res.x
        for _ in range(60):
            w = _replicate_weights(x, spec.func(x, make_params(prev)),
                                   weighting, summary)
            res = solve(np.sqrt(w * counts), prev)
            if np.allclose(res.x, prev, rtol=1e-10, atol=1e-12):
                break
            prev = res.x

    J = res.jac
    wss = float(2 * res.cost) + float(np.sum(w * within))
    dof = summary["n_obs"] - len(free_names)
    s2 = wss / dof
    try:
        cov = np.linalg.inv(J.T @ J) * s2
    except np.linalg.LinAlgError:
        cov = np.full((len(free_names), len(free_names)), np.nan)
    return res.x, cov, wss


def fit_model(x_values, y_values, model: str, *,
              constraints: dict | None = None,
              weighting: str = "none",
              weight_source: str = "predicted",
              ci_method: str = "asymptotic",
              sd=None, n=None, replicates: str = "account") -> dict:
    """Fit a registered model. Returns Prism-style results dict.

    Data entered as mean/SD/n: pass the row means as y_values with sd
    (per-row SD; convert SEM or %CV first, see opendose.summary) and n.
    replicates="account" (default, Prism's "fit all the data"): results
    equal the raw-replicate fit; df = sum(n) - K. replicates="means_only":
    one point per row; df = rows - K. Without n, only the means are fit
    (the SD is used only by weighting="1/SD2"). The result then carries a
    "replicates" entry describing what was fit.
    """
    if model not in MODELS:
        raise ValueError(f"unknown model: {model}")
    if weighting not in WEIGHTINGS:
        raise ValueError(f"unknown weighting: {weighting}")
    if weight_source not in WEIGHT_SOURCES:
        raise ValueError(f"unknown weight_source: {weight_source}")
    spec = MODELS[model]
    summary = None
    if sd is not None or n is not None or weighting == "1/SD2":
        x, y, summary = _summary_inputs(x_values, y_values, sd, n,
                                        replicates, weighting)
        n_points = summary["n_obs"]
    else:
        x, y = _clean_xy(x_values, y_values)
        n_points = int(x.size)

    constraints = dict(constraints or {})
    for _cname, _rule in (spec.data_constants or {}).items():
        constraints.setdefault(_cname, float(_rule(x, y)))
    # 3PL dose-response models = 4PL with HillSlope fixed at the standard value
    if model == "log_inhibitor_vs_response_3pl":
        constraints.setdefault("HillSlope", -1.0)
    if model == "log_agonist_vs_response_3pl":
        constraints.setdefault("HillSlope", 1.0)
    fixed = {}
    for name, val in constraints.items():
        key = ("LogXmid" if name in ("LogIC50", "LogEC50")
               and "LogXmid" in spec.params else name)
        if key not in spec.params:
            raise ValueError(f"unknown parameter for {model}: {name}")
        fixed[key] = float(val)
    missing = [c for c in spec.required_constants if c not in fixed]
    if missing:
        raise ValueError(
            f"{spec.label} needs experimental constants set via constraints: "
            + ", ".join(missing))
    free_names = [p for p in spec.params if p not in fixed]
    df = n_points - len(free_names)
    if df < 1:
        raise ValueError(
            f"not enough data points ({n_points}) to fit {len(free_names)} parameters")

    init = (spec.initials(x, y, fixed) if spec.initials_fixed
            else spec.initials(x, y))
    init.update(fixed)

    # multi-start on the designated parameter across the x range
    starts = [init]
    if spec.multistart and spec.multistart in free_names:
        for v in np.unique(x):
            if spec.multistart_mode == "x":
                seed = v
            else:
                seed = v if spec.multistart == "LogXmid" else abs(3.0 / max(abs(v), 1e-9))
            starts.append(dict(init, **{spec.multistart: float(seed)}))

    best = None
    for p0_map in starts:
        try:
            popt, pcov, wss = _ols_fit(spec, x, y, free_names, fixed, p0_map,
                                       weighting, weight_source, summary)
        except (RuntimeError, ValueError):
            continue
        if not np.all(np.isfinite(popt)):
            continue
        if best is None or wss < best[2] - 1e-12:
            best = (popt, pcov, wss)
    if best is None:
        raise ValueError("fit did not converge from any starting value")
    popt, pcov, wss = best

    fitted = dict(fixed)
    fitted.update({n: float(v) for n, v in zip(free_names, popt)})

    yhat = spec.func(x, fitted)
    if summary is not None:
        ss_res, ss_tot, r_squared_weighted = _summary_goodness(
            x, y, yhat, wss, weighting, weight_source, summary)
        r_squared = 1.0 - ss_res / ss_tot if ss_tot > 0 else None
        sy_x = math.sqrt(wss / df)
    else:
        residuals = y - yhat
        ss_res = float(np.sum(residuals ** 2))          # unweighted
        ss_tot = float(np.sum((y - y.mean()) ** 2))
        r_squared = 1.0 - ss_res / ss_tot if ss_tot > 0 else None
        sy_x = math.sqrt(wss / df)

        # Prism's "R squared (weighted)": 1 - wSS / wSS_tot, where wSS_tot
        # is taken around the weighted mean with the same weights as the
        # fit.
        r_squared_weighted = None
        if weighting != "none":
            ybase = (_replicate_mean_y(x, y)
                     if weight_source == "observed_mean" else yhat)
            w = _weights(x, ybase, weighting)
            ybar_w = float(np.sum(w * y) / np.sum(w))
            wss_tot = float(np.sum(w * (y - ybar_w) ** 2))
            if wss_tot > 0:
                r_squared_weighted = 1.0 - wss / wss_tot
    tcrit = float(stats.t.ppf(0.975, df))

    se = dict.fromkeys(spec.params)
    ci_map: dict[str, tuple[float, float]] = {}
    diag = np.sqrt(np.maximum(np.diag(pcov), 0.0))
    for i, name in enumerate(free_names):
        se[name] = float(diag[i])
        ci_map[name] = (fitted[name] - tcrit * diag[i],
                        fitted[name] + tcrit * diag[i])

    if ci_method == "profile":
        for name in free_names:
            ci_map[name] = _profile_ci(spec, x, y, free_names, fixed, fitted,
                                       wss, df, name, weighting, weight_source,
                                       fallback=ci_map[name], summary=summary)

    dependency = {}
    status = "converged"
    if len(free_names) > 1:
        try:
            cov_inv = np.linalg.inv(pcov)
            for i, name in enumerate(free_names):
                dependency[name] = float(
                    1.0 - 1.0 / max(pcov[i, i] * cov_inv[i, i], 1.0))
            if max(dependency.values()) > 0.9999:
                status = "ambiguous"
        except np.linalg.LinAlgError:
            status = "ambiguous"
    # A covariance that cannot be computed (singular J'J -> NaN SEs) means
    # the parameters are not determined at this point, whatever the
    # optimizer reported: e.g. NIST BoxBOD from Start 1, where Y = b1 and
    # exp(-b2*X) underflows, used to be labelled "converged".
    if not np.all(np.isfinite(pcov)):
        status = "ambiguous"

    # A midpoint fitted outside the x actually tested is an extrapolation:
    # the data never reaches half-maximal, so the value is read off the
    # model's tail rather than measured. This is separate from ambiguity —
    # with Top and Bottom held constant the remaining parameters can be
    # perfectly well determined relative to each other and still place the
    # midpoint far beyond the highest dose, which is where a dose-response
    # curve most often misleads.
    extrapolation = None
    if "LogXmid" in spec.params and n_points:
        mid = fitted["LogXmid"]
        lo, hi = float(np.min(x)), float(np.max(x))
        if mid < lo or mid > hi:
            beyond = "below" if mid < lo else "above"
            edge = lo if mid < lo else hi
            extrapolation = {
                "param": "LogIC50" if "IC50" in spec.equation else "LogEC50",
                "value": float(mid),
                "x_min": lo,
                "x_max": hi,
                "direction": beyond,
                # How far past the edge, in x units (log dose for these
                # models), so a caller can phrase it as a fold-difference.
                "distance": float(abs(mid - edge)),
            }

    params_out = {}
    for name in spec.params:
        display = ("LogIC50" if (name == "LogXmid" and "IC50" in spec.equation)
                   else "LogEC50" if (name == "LogXmid" and "EC50" in spec.equation)
                   else name)
        params_out[display] = {
            "value": fitted[name],
            "se": se[name],
            "ci95": list(ci_map[name]) if name in ci_map else None,
            "constrained": name in fixed,
        }

    derived_out = {}
    if spec.derived:
        for dname, entry in spec.derived(fitted, ci_map).items():
            derived_out[dname] = {"value": entry["value"], "se": None,
                                  "ci95": entry["ci95"], "constrained": False,
                                  "derived": True}

    if spec.transforms:
        derived_out.update(_apply_transforms(
            spec, x, fitted, free_names, pcov, ci_map, tcrit, ci_method))

    # Span = Top - Bottom (Prism reports it for plateau models). SE uses
    # the full covariance: var(T-B) = var(T) + var(B) - 2*cov(T,B).
    if "Top" in spec.params and "Bottom" in spec.params:
        span = fitted["Top"] - fitted["Bottom"]
        span_se = span_ci = None
        if "Top" in free_names and "Bottom" in free_names:
            it, ib = free_names.index("Top"), free_names.index("Bottom")
            var = pcov[it, it] + pcov[ib, ib] - 2 * pcov[it, ib]
            if var >= 0 and math.isfinite(var):
                span_se = math.sqrt(var)
                span_ci = [span - tcrit * span_se, span + tcrit * span_se]
        elif "Top" in free_names or "Bottom" in free_names:
            only = "Top" if "Top" in free_names else "Bottom"
            span_se = se[only]
            if span_se is not None:
                span_ci = [span - tcrit * span_se, span + tcrit * span_se]
        derived_out["Span"] = {"value": span, "se": span_se, "ci95": span_ci,
                               "constrained": False, "derived": True}

    out = {
        "model": model,
        "label": spec.label,
        "equation": spec.equation,
        "status": status,
        "dependency": dependency,
        "extrapolation": extrapolation,
        "weighting": weighting,
        "weight_source": weight_source,
        "ci_method": ci_method,
        "params": {**params_out, **derived_out},
        "param_order": list(params_out) + list(derived_out),
        "goodness": {
            "df": df, "n_points": n_points,
            "r_squared": r_squared,
            "r_squared_weighted": r_squared_weighted,
            "ss_res": ss_res,
            "ss_res_weighted": wss if weighting != "none" else None,
            "sy_x": sy_x,
        },
        "fitted_values": fitted,
        "x_is_log": spec.x_is_log,
        "_cov": {"free_names": free_names, "matrix": pcov.tolist()},
    }
    if summary is not None:
        out["replicates"] = {
            "mode": summary["mode"],          # "account" | "means_only"
            "n_rows": int(x.size),            # X rows (means) fit
            "n_points": n_points,             # points df is counted from
        }
    return out


def _summary_goodness(x, y, yhat, wss, weighting, weight_source, summary):
    """(ss_res, ss_tot, r_squared_weighted) of the replicates a mean/SD/n
    table stands for: every sum of squares splits into n_i times the
    squared deviation of the row mean plus the within-row SS."""
    counts, within = summary["counts"], summary["within"]
    ss_res = float(np.sum(counts * (y - yhat) ** 2) + np.sum(within))
    grand = float(np.sum(counts * y) / np.sum(counts))
    ss_tot = float(np.sum(counts * (y - grand) ** 2) + np.sum(within))
    r_squared_weighted = None
    if weighting != "none":
        ybase = summary["mean_y"] if weight_source == "observed_mean" else yhat
        w = _replicate_weights(x, ybase, weighting, summary)
        ybar_w = float(np.sum(w * counts * y) / np.sum(w * counts))
        wss_tot = float(np.sum(w * (counts * (y - ybar_w) ** 2 + within)))
        if wss_tot > 0:
            r_squared_weighted = 1.0 - wss / wss_tot
    return ss_res, ss_tot, r_squared_weighted


def _profile_ci(spec, x, y, free_names, fixed, fitted, wss_min, df, target,
                weighting, weight_source, fallback, summary=None):
    """Profile-likelihood CI: SS threshold = WSS_min*(1 + F(.95;1,df)/df)."""
    threshold = wss_min * (1.0 + stats.f.ppf(0.95, 1, df) / df)
    others = [n for n in free_names if n != target]

    def profile_wss(value):
        fixed2 = dict(fixed, **{target: float(value)})
        p0 = {n: fitted[n] for n in others}
        try:
            _, _, wss = _ols_fit(spec, x, y, others, fixed2, p0, weighting,
                                 weight_source, summary)
        except (RuntimeError, ValueError):
            return math.inf
        return wss

    center = fitted[target]
    scale = max(abs(fallback[1] - fallback[0]) / 2, abs(center) * 1e-3, 1e-6)

    def find_edge(direction):
        prev = center
        for i in range(1, 40):
            probe = center + direction * scale * (1.6 ** i)
            if profile_wss(probe) > threshold:
                try:
                    return brentq(lambda v: profile_wss(v) - threshold,
                                  min(prev, probe), max(prev, probe),
                                  xtol=abs(scale) * 1e-4, maxiter=60)
                except ValueError:
                    return None
            prev = probe
        return None  # never crossed: unbounded in this direction

    lo = find_edge(-1)
    hi = find_edge(+1)
    return (lo if lo is not None else -math.inf,
            hi if hi is not None else math.inf)


# ---------------------------------------------------------------- transforms

def _apply_transforms(spec, x, fitted, free_names, pcov, ci_map, tcrit,
                      ci_method):
    """Derived rows for spec.transforms (see Transform)."""
    return transform_entries(spec.transforms, fitted, free_names, pcov,
                             ci_map, tcrit, ci_method,
                             curve=spec.func, x=x)


def _num_grad(fn, base, names):
    """Central-difference gradient of fn(p) w.r.t. names."""
    g = np.zeros(len(names))
    for j, n in enumerate(names):
        h = max(abs(base[n]) * 1e-6, 1e-8)
        up, dn = dict(base), dict(base)
        up[n] += h
        dn[n] -= h
        g[j] = (fn(up) - fn(dn)) / (2 * h)
    return g


def _safe_value(fn, p):
    try:
        with np.errstate(all="ignore"):
            v = float(fn(p))
    except (ArithmeticError, ValueError, TypeError, KeyError):
        return math.nan
    return v


def _first_root(f, level, lo, hi, n=512):
    """Smallest X in [lo, hi] where f(X) = level (None if none)."""
    xs = np.linspace(lo, hi, n)
    with np.errstate(all="ignore"):
        ys = np.array([f(v) for v in xs], dtype=float) - level
    for i in range(n - 1):
        if ys[i] == 0.0:
            return float(xs[i])
        if np.isfinite(ys[i]) and np.isfinite(ys[i + 1]) \
                and ys[i] * ys[i + 1] < 0:
            return float(brentq(lambda v: f(v) - level, xs[i], xs[i + 1],
                                maxiter=200))
    return None


def _monotone_between(fn, base, name, lo, hi):
    """True when fn changes monotonically as `name` runs from lo to hi."""
    if not (math.isfinite(lo) and math.isfinite(hi)):
        return True  # unbounded CI: transform the limits that exist
    vals = []
    for v in np.linspace(lo, hi, 9):
        vals.append(_safe_value(fn, dict(base, **{name: float(v)})))
    d = np.diff(np.array(vals))
    d = d[np.isfinite(d)]
    return bool(np.all(d >= 0) or np.all(d <= 0))


def transform_entries(transforms, fitted, free_names, cov, ci_map, tcrit,
                      ci_method="asymptotic", curve=None, x=None,
                      cov_index=None):
    """Value / SE / CI of each Transform at the fitted parameters.

    cov is the covariance of free_names (cov_index maps a free name to
    its row when cov is larger, as in global fits). curve(xs, p) is the
    model, needed by interpolation transforms; x the fitted X values
    (interpolation range = data range +/- half of it, as Prism searches
    the plotted range extended by half that range each way)."""
    out = {}
    cov = np.asarray(cov, dtype=float)
    idx = cov_index or {n: i for i, n in enumerate(free_names)}
    for tr in transforms or []:
        if tr.uses_x:  # bind the data so fn(p) / x_level(p) apply below
            xs = np.asarray(x if x is not None else [], dtype=float)
            tr = Transform(tr.name, (lambda f: lambda q: f(q, xs))(tr.fn),
                           tr.params, tr.ci, tr.kind,
                           None if tr.x_level is None else
                           (lambda f: lambda q: f(q, xs))(tr.x_level),
                           tr.outer)
        value = _safe_value(tr.fn, fitted)
        entry = {"value": value if math.isfinite(value) else None,
                 "se": None, "ci95": None, "constrained": False,
                 "derived": True}
        out[tr.name] = entry
        if not math.isfinite(value) or tr.ci == "none" and tr.kind != "params":
            continue
        if tr.kind == "x_interp":
            if curve is None or x is None or not len(x):
                continue
            lo_x, hi_x = float(np.min(x)), float(np.max(x))
            pad = (hi_x - lo_x) / 2
            lo_x, hi_x = lo_x - pad, hi_x + pad
            level = _safe_value(tr.x_level, fitted)
            names = [n for n in free_names if n in idx]
            C = cov[np.ix_([idx[n] for n in names], [idx[n] for n in names])]

            def band(v, sign):
                yc = float(curve(np.array([v]), fitted)[0])
                g = _num_grad(lambda q: float(curve(np.array([v]), q)[0]),
                              fitted, names)
                return yc + sign * tcrit * math.sqrt(max(float(g @ C @ g),
                                                         0.0))
            if tr.ci == "none" or not names:
                continue
            e1 = _first_root(lambda v: band(v, +1), level, lo_x, hi_x, 128)
            e2 = _first_root(lambda v: band(v, -1), level, lo_x, hi_x, 128)
            if e1 is not None and e2 is not None:
                outer = tr.outer or (lambda v: v)
                entry["ci95"] = sorted([float(outer(e1)), float(outer(e2))])
            continue
        if tr.kind == "x_interp_complex":
            continue
        if tr.kind == "y_interp":
            names = [n for n in free_names if n in idx]
        else:
            names = [n for n in tr.params if n in free_names and n in idx]
        if not names:
            continue  # depends on constants only
        g = _num_grad(lambda q: _safe_value(tr.fn, q), fitted, names)
        ii = [idx[n] for n in names]
        var = float(g @ cov[np.ix_(ii, ii)] @ g)
        se = math.sqrt(var) if var >= 0 and math.isfinite(var) else None
        entry["se"] = se
        if tr.ci == "none":
            continue
        single = tr.kind == "params" and len(names) == 1
        if single and (tr.ci == "asymmetrical" or ci_method == "profile"):
            name = names[0]
            if name in ci_map:
                lo, hi = ci_map[name]
                if _monotone_between(tr.fn, fitted, name, lo, hi):
                    a = _safe_value(tr.fn, dict(fitted, **{name: lo}))
                    b = _safe_value(tr.fn, dict(fitted, **{name: hi}))
                    if not (math.isnan(a) or math.isnan(b)):
                        entry["ci95"] = sorted([a, b])
            continue
        if tr.kind == "params" and ci_method == "profile":
            continue  # Prism: no CI for multi-parameter transforms
        if se is not None:
            entry["ci95"] = [value - tcrit * se, value + tcrit * se]
    return out


# ---------------------------------------------------------------- robust / ROUT

def robust_fit(x_values, y_values, model: str, *,
               constraints: dict | None = None) -> dict:
    """Robust nonlinear regression (Motulsky & Brown 2006): Cauchy
    (Lorentzian) loss scaled by the RSDR, iterated to convergence."""
    spec = MODELS[model]
    x, y = _clean_xy(x_values, y_values)
    base = fit_model(x_values, y_values, model, constraints=constraints)
    fitted = dict(base["fitted_values"])
    fixed = {k: v for k, v in (constraints or {}).items()}
    for name in spec.data_constants or {}:
        fixed.setdefault(name, fitted[name])
    free_names = [p for p in spec.params if p not in fixed]
    n, k = x.size, len(free_names)

    rsdr = None
    for _ in range(6):
        resid = y - spec.func(x, fitted)
        p68 = float(np.percentile(np.abs(resid), 68.27))
        new_rsdr = max(p68 * n / max(n - k, 1), 1e-12)
        if rsdr is not None and abs(new_rsdr - rsdr) < 1e-9 * rsdr:
            break
        rsdr = new_rsdr

        def loss_resid(free_vals):
            p = dict(fixed)
            p.update(dict(zip(free_names, free_vals)))
            return (y - spec.func(x, p)) / rsdr

        res = least_squares(loss_resid, [fitted[nm] for nm in free_names],
                            loss="cauchy", method="trf", max_nfev=20000)
        fitted.update({nm: float(v) for nm, v in zip(free_names, res.x)})

    resid = y - spec.func(x, fitted)
    return {"model": model, "fitted_values": fitted, "rsdr": float(rsdr),
            "residuals": resid.tolist(), "n_points": int(n), "k_params": int(k)}


def rout_outliers(x_values, y_values, model: str, *, q: float = 0.01,
                  constraints: dict | None = None,
                  sd=None, n=None, replicates: str = "account") -> dict:
    """ROUT: robust fit, then FDR-based outlier detection at rate Q,
    then ordinary fit on the cleaned data (Motulsky & Brown 2006).

    With sd/n (rows entered as mean/SD/n) the robust fit and the outlier
    test see only the row means (robust regression cannot use SD and n;
    "Nonlinear regression with unequal weights"); an outlier removes the
    whole row, and the cleaned rows are then fit accounting for SD and n.
    """
    if sd is not None or n is not None:
        xs, ys, summ = _summary_inputs(x_values, y_values, sd, n,
                                       replicates, "none")
        out = rout_outliers(xs.tolist(), ys.tolist(), model, q=q,
                            constraints=constraints)
        flagged = {(o["x"], o["y"]) for o in out["outliers"]}
        keep = [i for i in range(xs.size)
                if (float(xs[i]), float(ys[i])) not in flagged]
        out["fit"] = fit_model(
            [float(xs[i]) for i in keep], [float(ys[i]) for i in keep],
            model, constraints=constraints,
            sd=[summ["sd"][i] for i in keep] if sd is not None else None,
            n=[summ["n"][i] for i in keep] if n is not None else None,
            replicates=replicates)
        return out
    x, y = _clean_xy(x_values, y_values)
    rob = robust_fit(x_values, y_values, model, constraints=constraints)
    resid = np.array(rob["residuals"])
    n, k = rob["n_points"], rob["k_params"]
    df = max(n - k, 1)
    t = np.abs(resid) / rob["rsdr"]
    p = 2 * stats.t.sf(t, df)

    # Benjamini-Hochberg at rate Q on the residual P values
    order = np.argsort(p)
    is_outlier = np.zeros(n, dtype=bool)
    max_k = -1
    for rank, idx in enumerate(order, start=1):
        if p[idx] <= q * rank / n:
            max_k = rank
    if max_k > 0:
        is_outlier[order[:max_k]] = True

    keep = ~is_outlier
    cleaned_fit = fit_model(x[keep].tolist(), y[keep].tolist(), model,
                            constraints=constraints)
    return {
        "method": "rout", "q": q, "rsdr": rob["rsdr"],
        "outliers": [{"x": float(x[i]), "y": float(y[i]),
                      "residual": float(resid[i])}
                     for i in range(n) if is_outlier[i]],
        "n_outliers": int(is_outlier.sum()),
        "fit": cleaned_fit,
    }


# ---------------------------------------------------------------- compare

def compare_fits_f_test(ss_simple: float, df_simple: int,
                        ss_complex: float, df_complex: int) -> dict:
    """Extra sum-of-squares F test (nested models; 'simple' has fewer
    parameters so df_simple > df_complex)."""
    if df_simple <= df_complex:
        raise ValueError("simpler model must have more degrees of freedom")
    f = ((ss_simple - ss_complex) / (df_simple - df_complex)) / \
        (ss_complex / df_complex)
    f = max(f, 0.0)
    p = float(stats.f.sf(f, df_simple - df_complex, df_complex))
    return {"F": float(f), "dfn": df_simple - df_complex, "dfd": df_complex,
            "p": p, "prefer_complex": p < 0.05}


def aicc(ss: float, n: int, k_params: int) -> float:
    """Corrected Akaike information criterion as Prism computes it
    (K counts the fitted parameters + 1 for variance)."""
    k = k_params + 1
    if n - k - 1 <= 0:
        return math.inf
    return n * math.log(ss / n) + 2 * k + 2 * k * (k + 1) / (n - k - 1)


def compare_fits_aicc(ss1: float, k1: int, ss2: float, k2: int, n: int) -> dict:
    a1, a2 = aicc(ss1, n, k1), aicc(ss2, n, k2)
    delta = a2 - a1  # positive -> model 1 preferred
    prob1 = 1.0 / (1.0 + math.exp(-0.5 * delta)) if math.isfinite(delta) else 1.0
    return {"aicc_1": a1, "aicc_2": a2, "delta": float(delta),
            "probability_1": prob1, "probability_2": 1 - prob1,
            "prefer": 1 if a1 < a2 else 2}


# The extended equation library registers itself into MODELS (it needs
# the definitions above, hence the import at the end of the module).
from . import equations as _equations  # noqa: E402,F401
