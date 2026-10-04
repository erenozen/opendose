"""Extended built-in equation library + global fitting with data-set
constants.

Implements the equations of the GraphPad Prism curve-fitting guide,
chapter "Models (equations) built-in to Prism" (one page per equation;
the page file names are cited next to each family below), registered
into nlfit.MODELS so every analysis (fit, ROUT, bands, interpolation,
simulation) can use them:

- Dose-response - Stimulation / Inhibition (reg_dr_stim*.htm,
  reg_dr_inhibit*.htm): normalized response, standard and variable slope,
  X as log(concentration) or as concentration.
- Dose-response - Special (reg_asymmetric_dose_response_ec*.htm,
  reg_biphasic_dose_response*.htm, reg_bellshaped_dose_response*.htm,
  reg_operational_model_depletion*.htm,
  reg_operational_model_partialag*.htm, reg_gaddumschild*.htm,
  reg_doseshift*.htm, reg_allosteric_dr*.htm, reg_ecanything*.htm,
  reg_absolute_ic50*.htm), both the log(X) and the X forms.
- Receptor binding - Saturation (reg_one_site_total.htm,
  reg_one_site_fit_total_and_ns.htm, reg_one_site_total_depletion.htm,
  reg_two_sites_specific.htm, reg_two_sites_total_and_ns.htm,
  reg_saturation_allosteric.htm, reg_specific_hill.htm).
- Receptor binding - Competitive (reg_competition_two_sites_ki.htm,
  reg_one_site_accounting_for_depletion.htm,
  reg_homologous_one_site_two_conc.htm, reg_allosteric_competition.htm).
- Receptor binding - Kinetics (reg_dissociation.htm, reg_association1.htm,
  reg_association2.htm, reg_equaton_association_then_disso.htm,
  reg_kinetics_of_competitive_bindin.htm).
- Enzyme kinetics (reg_kcat.htm, reg_allosteric_enzyme.htm,
  reg_competitive_inhibition.htm, reg_noncompetitive_inhibition.htm,
  reg_uncompetitive_inhibition.htm, reg_mixered_model.htm,
  reg_substrate_inhibition.htm, reg_morrison.htm).
- Exponential (reg_exponential_decay_plateau.htm,
  reg_exponential_decay_3phase.htm,
  reg_exponential_plateau_then_association.htm,
  reg_exponential_association_2phase.htm).
- Lines (reg_linear_with_nonlinear.htm "horizontal line",
  reg_linethruorigin.htm, reg_segmental_linear_regression.htm,
  reg_equation-hinge-function.htm, reg_fitting_lines_to_semilog.htm,
  reg_finding-the-crossing-point-of-.htm).
- Polynomial (reg_howtopolynomial.htm, reg_centered_polynomial_equations.htm):
  first to sixth order, ordinary and centered (XMean = mean X, a data-set
  constant).
- Gaussian (reg_how_to_gaussian.htm, reg_how_to_lognormal.htm,
  reg_howto_cumulative_gaussian.htm, reg_how_to_lorentzian.htm).
- Sine waves (reg_standard_sine_wave.htm, reg_damped_sine_wave.htm,
  reg_sinc_wave.htm, reg_sine_wave_nonzero_baseline.htm).
- Growth equations (reg_log-of-exponential-growth.htm,
  reg_logistic-growth.htm, reg_gompertz-growth.htm,
  reg_exponential-plateau.htm, reg_beta-growth-and-decline.htm).
- Linear-quadratic model (reg_linear-quadratic-*.htm).
- Classic equations whose form the guide states in text: Boltzmann
  sigmoid (reg_classic_boltzmann.htm) and power series
  (reg_classic_powerseries.htm, initial values all 1.0 as documented).

Parameter names and the equations follow the guide verbatim. Where the
guide documents defaults they are implemented: experimental constants the
user must enter ("You must constrain ... to constant values") are
required constants; parameters "shared" between data sets and data-set
constants taken from column titles define the global fits; the <A> /
<~A> lines of the guide's equations become a parameter scope (first data
set / every other data set). Derived values follow the "Interpret the
parameters" sections (EC50 from LogEC50 and vice versa, half-lives, Kd =
Koff/Kon, ...), with CIs per "Choosing transforms of parameters to report".

Initial values: the guide does not publish the rules of the built-in
equations (except "1.0 for each" polynomial / power-series parameter and
the sine-wave hints), so these use the documented rule vocabulary of
"Entering rules for initial values" (YMIN, YMAX, YMID, XMIN, XMAX, XMID,
X at YMID, Y at XMID, SIGN(YatXmax - YatXmin), slopes) with choices made
here; they only start the fit.

Deviations, each noted at the equation: the X-is-concentration "EC50
shift" page prints EC=EC50Control + EC50Ratio although it defines
EC50Ratio as a ratio, so the product is used; "One site - Homologous"
prints "+ Bottom" while its text speaks of a shared NS, so the printed
equation is used with an individual Bottom per data set; the Morrison
page gives IC50 = Et/2 + Ki, reported here as Et/2 + Ki*(1+S/Km) (the
same when S = 0).
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats
from . import lsq, nlfit
from .nlfit import ModelSpec, Transform, register

LN2 = math.log(2.0)
SQRT2PI = math.sqrt(2.0 * math.pi)


# ------------------------------------------------------- data statistics

def _arr(x):
    return np.asarray(x, dtype=float)


def _row_means(x, y):
    """Distinct X values (sorted) and the mean Y at each."""
    x, y = _arr(x), _arr(y)
    ux = np.unique(x)
    uy = np.array([float(np.mean(y[x == v])) for v in ux])
    return ux, uy


def _interp_at(xa, ya, xb, yb, level):
    if yb == ya:
        return (xa + xb) / 2.0
    return xa + (level - ya) * (xb - xa) / (yb - ya)


def _slope(xs, ys):
    if xs.size < 2 or np.ptp(xs) == 0:
        return 0.0
    return float(np.polyfit(xs, ys, 1)[0])


class DataStats:
    """The quantities "Entering rules for initial values" offers.

    YMID / XMID are the means of the extremes. "Value of Y at XMID"
    follows GraphPad FAQ 1413: the straight line between the point with
    the largest X below XMID and the point with the smallest X above it;
    "X at YMID" likewise between the point with the largest Y below YMID
    and the one with the smallest Y above it. Slopes at XMIN / XMID / XMAX:
    regression on the first, middle or last 10% of the points with 30 or
    more points, else the first or last two points (two middle points
    when even, three when odd); computed on the distinct-X means so
    replicates never give a zero X-difference.
    """

    def __init__(self, x, y):
        x, y = _arr(x), _arr(y)
        self.x, self.y = x, y
        self.ymin, self.ymax = float(np.min(y)), float(np.max(y))
        self.xmin, self.xmax = float(np.min(x)), float(np.max(x))
        self.ymid = (self.ymin + self.ymax) / 2.0
        self.xmid = (self.xmin + self.xmax) / 2.0
        self.xrange = max(self.xmax - self.xmin, 1e-12)
        self.x_at_ymax = float(x[int(np.argmax(y))])
        self.x_at_ymin = float(x[int(np.argmin(y))])
        ux, uy = _row_means(x, y)
        self.ux, self.uy = ux, uy
        self.y_at_xmin = float(uy[0])
        self.y_at_xmax = float(uy[-1])
        d = self.y_at_xmax - self.y_at_xmin
        self.sign = 1.0 if d >= 0 else -1.0
        self.y_at_xmid = self._y_at_xmid()
        self.x_at_ymid = self.x_at_level(self.ymid)
        self.slope_at_xmin, self.slope_at_xmid, self.slope_at_xmax = \
            self._slopes()

    def _y_at_xmid(self):
        x, y, m = self.x, self.y, self.xmid
        if np.any(x == m):
            return float(np.mean(y[x == m]))
        below, above = x < m, x > m
        if not below.any() or not above.any():
            return self.ymid
        xa = float(np.max(x[below]))
        xb = float(np.min(x[above]))
        ya = float(np.mean(y[x == xa]))
        yb = float(np.mean(y[x == xb]))
        return ya + (m - xa) * (yb - ya) / (xb - xa)

    def x_at_level(self, level):
        """FAQ 1413 rule applied to any Y level (YMID by default)."""
        x, y = self.x, self.y
        if np.any(y == level):
            return float(np.mean(x[y == level]))
        below, above = y < level, y > level
        if not below.any() or not above.any():
            return self.xmid
        ia = int(np.flatnonzero(below)[np.argmax(y[below])])
        ib = int(np.flatnonzero(above)[np.argmin(y[above])])
        return float(_interp_at(x[ia], y[ia], x[ib], y[ib], level))

    def _slopes(self):
        ux, uy = self.ux, self.uy
        n = ux.size
        if n < 2:
            return 0.0, 0.0, 0.0
        if n >= 30:
            k = max(n // 10, 2)
            mid = n // 2
            lo = max(mid - k // 2, 0)
            return (_slope(ux[:k], uy[:k]), _slope(ux[lo:lo + k], uy[lo:lo + k]),
                    _slope(ux[-k:], uy[-k:]))
        if n % 2 == 0:
            mid = slice(n // 2 - 1, n // 2 + 1)
        else:
            mid = slice(max(n // 2 - 1, 0), n // 2 + 2)
        return (_slope(ux[:2], uy[:2]), _slope(ux[mid], uy[mid]),
                _slope(ux[-2:], uy[-2:]))


def _positive(v, fallback):
    return float(v) if (math.isfinite(v) and v > 0) else float(fallback)


def _pos_x(s: DataStats):
    """Positive X values (concentrations) for geometric rules."""
    px = s.ux[s.ux > 0]
    return px if px.size else np.array([1.0])


def _geo_quantile(s: DataStats, q):
    px = _pos_x(s)
    return float(10.0 ** np.quantile(np.log10(px), q))


def _x_at_ymid_pos(s: DataStats):
    v = s.x_at_ymid
    return v if v > 0 else _geo_quantile(s, 0.5)


# ------------------------------------------------------- transform helpers

def _pow10_of(name, new):
    return Transform(new, lambda p, n=name: 10.0 ** p[n], (name,))


def _log10_of(name, new):
    return Transform(new, lambda p, n=name: math.log10(p[n])
                     if p[n] > 0 else math.nan, (name,))


def _neg_pow10_of(name, new):
    return Transform(new, lambda p, n=name: 10.0 ** (-p[n]), (name,))


def _half_life(k, new="HalfLife"):
    return Transform(new, lambda p, n=k: LN2 / p[n] if p[n] != 0 else math.nan,
                     (k,))


def _tau(k, new="Tau"):
    return Transform(new, lambda p, n=k: 1.0 / p[n] if p[n] != 0 else math.nan,
                     (k,))


def _diff(a, b, new):
    return Transform(new, lambda p: p[a] - p[b], (a, b), ci="symmetrical")


def _ratio(a, b, new):
    return Transform(new, lambda p: p[a] / p[b] if p[b] != 0 else math.nan,
                     (a, b), ci="symmetrical")


def _reg(name, label, family, equation, params, func, initials, *,
         transforms=None, x_is_log=False, x_label="X", y_label="Y",
         multistart=None, multistart_mode=None, required=(),
         dataset_constants=(), shared=(), param_scope=None,
         global_only=False, global_initials=None, bounds=None,
         data_constants=None, initials_fixed=False, jac=None):
    register(ModelSpec(
        name=name, label=label, equation=equation, params=list(params),
        func=func, initials=initials, multistart=multistart,
        x_is_log=x_is_log, x_label=x_label, y_label=y_label,
        required_constants=tuple(required), family=family,
        transforms=list(transforms or []) or None,
        multistart_mode=multistart_mode, data_constants=data_constants,
        bounds=bounds, dataset_constants=tuple(dataset_constants),
        shared=tuple(p for p in shared if p in params),
        param_scope=param_scope,
        global_only=global_only, global_initials=global_initials,
        initials_fixed=initials_fixed, jac=jac))


def _p10(v):
    return np.power(10.0, v)


# Families of the entries registered in nlfit.py itself (their specs keep
# their original fields untouched; list_models reads this map).
LEGACY_FAMILIES = {
    "log_inhibitor_vs_response_4pl": "Dose-response - Inhibition",
    "log_inhibitor_vs_response_3pl": "Dose-response - Inhibition",
    "log_agonist_vs_response_4pl": "Dose-response - Stimulation",
    "log_agonist_vs_response_3pl": "Dose-response - Stimulation",
    "michaelis_menten": "Enzyme kinetics - Velocity as a function of substrate",
    "one_site_competition": "Receptor binding - Competitive binding",
    "one_site_fit_ki": "Receptor binding - Competitive binding",
    "two_site_competition": "Receptor binding - Competitive binding",
    "saturation_binding": "Receptor binding - Saturation binding",
    "one_phase_decay": "Exponential",
    "one_phase_association": "Exponential",
    "exponential_growth": "Exponential",
    "two_phase_decay": "Exponential",
    "polynomial_second": "Polynomial",
    "polynomial_third": "Polynomial",
    "straight_line": "Lines",
}


def model_family(spec) -> str:
    return spec.family or LEGACY_FAMILIES.get(spec.name, "")


# ============================================ Dose-response: stimulation
FAM_STIM = "Dose-response - Stimulation"
FAM_INH = "Dose-response - Inhibition"
FAM_SPEC_LOG = "Dose-response - Special, X is log(concentration)"
FAM_SPEC_CONC = "Dose-response - Special, X is concentration"


def _init_norm_log(slope):
    def initials(x, y):
        s = DataStats(x, y)
        out = {"LogEC50": s.x_at_level(50.0)}
        if slope:
            out["HillSlope"] = s.sign
        return out
    return initials


def _init_norm_log_ic(slope):
    def initials(x, y):
        s = DataStats(x, y)
        out = {"LogIC50": s.x_at_level(50.0)}
        if slope:
            out["HillSlope"] = s.sign
        return out
    return initials


_reg("log_agonist_vs_normalized_response",
     "log(agonist) vs. normalized response", FAM_STIM,
     "Y=100/(1+10^(LogEC50-X))", ["LogEC50"],
     lambda x, p: 100.0 / (1.0 + _p10(p["LogEC50"] - _arr(x))),
     _init_norm_log(False), transforms=[_pow10_of("LogEC50", "EC50")],
     x_is_log=True, x_label="log[Agonist]", y_label="Response (%)",
     multistart="LogEC50", multistart_mode="x")

_reg("log_agonist_vs_normalized_response_variable",
     "log(agonist) vs. normalized response -- Variable slope", FAM_STIM,
     "Y=100/(1+10^((LogEC50-X)*HillSlope))", ["LogEC50", "HillSlope"],
     lambda x, p: 100.0 / (1.0 + _p10((p["LogEC50"] - _arr(x))
                                      * p["HillSlope"])),
     _init_norm_log(True), transforms=[_pow10_of("LogEC50", "EC50")],
     x_is_log=True, x_label="log[Agonist]", y_label="Response (%)",
     multistart="LogEC50", multistart_mode="x")


def _init_conc(kind, slope, normalized):
    """[Agonist]/[Inhibitor] vs. response rules: Bottom = YMIN, Top =
    YMAX, EC50 = X at YMID (X at Y = 50 when normalized), HillSlope =
    SIGN(YatXmax - YatXmin)."""
    def initials(x, y):
        s = DataStats(x, y)
        mid = s.x_at_level(50.0) if normalized else s.x_at_ymid
        mid = mid if mid > 0 else _geo_quantile(s, 0.5)
        out = {kind: mid}
        if not normalized:
            out.update(Bottom=s.ymin, Top=s.ymax)
        if slope:
            out["HillSlope"] = s.sign
        return out
    return initials


_reg("agonist_vs_response", "[Agonist] vs. response", FAM_STIM,
     "Y=Bottom + X*(Top-Bottom)/(EC50 + X)", ["Bottom", "Top", "EC50"],
     lambda x, p: p["Bottom"] + _arr(x) * (p["Top"] - p["Bottom"])
     / (p["EC50"] + _arr(x)),
     _init_conc("EC50", False, False), transforms=[_log10_of("EC50", "LogEC50")],
     x_label="[Agonist]", y_label="Response",
     multistart="EC50", multistart_mode="x")


def _agonist_var(x, p):
    xh = np.power(_arr(x), p["HillSlope"])
    return p["Bottom"] + xh * (p["Top"] - p["Bottom"]) / (
        xh + np.power(p["EC50"], p["HillSlope"]))


_reg("agonist_vs_response_variable",
     "[Agonist] vs. response -- Variable slope", FAM_STIM,
     "Y=Bottom + (X^Hillslope)*(Top-Bottom)/(X^HillSlope + EC50^HillSlope)",
     ["Bottom", "Top", "EC50", "HillSlope"], _agonist_var,
     _init_conc("EC50", True, False),
     transforms=[_log10_of("EC50", "LogEC50")],
     x_label="[Agonist]", y_label="Response",
     multistart="EC50", multistart_mode="x")

_reg("agonist_vs_normalized_response", "[Agonist] vs. normalized response",
     FAM_STIM, "Y=100*X/(EC50+X)", ["EC50"],
     lambda x, p: 100.0 * _arr(x) / (p["EC50"] + _arr(x)),
     _init_conc("EC50", False, True),
     transforms=[_log10_of("EC50", "LogEC50")],
     x_label="[Agonist]", y_label="Response (%)",
     multistart="EC50", multistart_mode="x")


def _agonist_norm_var(x, p):
    xh = np.power(_arr(x), p["HillSlope"])
    return 100.0 * xh / (np.power(p["EC50"], p["HillSlope"]) + xh)


_reg("agonist_vs_normalized_response_variable",
     "[Agonist] vs. normalized response -- Variable slope", FAM_STIM,
     "Y=100*(X^HillSlope)/(EC50^HillSlope + (X^HillSlope))",
     ["EC50", "HillSlope"], _agonist_norm_var,
     _init_conc("EC50", True, True),
     transforms=[_log10_of("EC50", "LogEC50")],
     x_label="[Agonist]", y_label="Response (%)",
     multistart="EC50", multistart_mode="x")

# ============================================ Dose-response: inhibition

_reg("log_inhibitor_vs_normalized_response",
     "log(inhibitor) vs. normalized response", FAM_INH,
     "Y=100/(1+10^(X-LogIC50))", ["LogIC50"],
     lambda x, p: 100.0 / (1.0 + _p10(_arr(x) - p["LogIC50"])),
     _init_norm_log_ic(False), transforms=[_pow10_of("LogIC50", "IC50")],
     x_is_log=True, x_label="log[Inhibitor]", y_label="Response (%)",
     multistart="LogIC50", multistart_mode="x")

_reg("log_inhibitor_vs_normalized_response_variable",
     "log(inhibitor) vs. normalized response -- Variable slope", FAM_INH,
     "Y=100/(1+10^((LogIC50-X)*HillSlope))", ["LogIC50", "HillSlope"],
     lambda x, p: 100.0 / (1.0 + _p10((p["LogIC50"] - _arr(x))
                                      * p["HillSlope"])),
     _init_norm_log_ic(True), transforms=[_pow10_of("LogIC50", "IC50")],
     x_is_log=True, x_label="log[Inhibitor]", y_label="Response (%)",
     multistart="LogIC50", multistart_mode="x")

_reg("inhibitor_vs_response", "[Inhibitor] vs. response", FAM_INH,
     "Y=Bottom + (Top-Bottom)/(1+(X/IC50))", ["Bottom", "Top", "IC50"],
     lambda x, p: p["Bottom"] + (p["Top"] - p["Bottom"])
     / (1.0 + _arr(x) / p["IC50"]),
     _init_conc("IC50", False, False),
     transforms=[_log10_of("IC50", "LogIC50")],
     x_label="[Inhibitor]", y_label="Response",
     multistart="IC50", multistart_mode="x")

_reg("inhibitor_vs_response_variable",
     "[Inhibitor] vs. response -- Variable slope", FAM_INH,
     "Y=Bottom + (Top-Bottom)/(1+(IC50/X)^HillSlope)",
     ["Bottom", "Top", "IC50", "HillSlope"],
     lambda x, p: p["Bottom"] + (p["Top"] - p["Bottom"])
     / (1.0 + np.power(p["IC50"] / _arr(x), p["HillSlope"])),
     _init_conc("IC50", True, False),
     transforms=[_log10_of("IC50", "LogIC50")],
     x_label="[Inhibitor]", y_label="Response",
     multistart="IC50", multistart_mode="x")

_reg("inhibitor_vs_normalized_response", "[Inhibitor] vs. normalized response",
     FAM_INH, "Y=100/(1+X/IC50)", ["IC50"],
     lambda x, p: 100.0 / (1.0 + _arr(x) / p["IC50"]),
     _init_conc("IC50", False, True),
     transforms=[_log10_of("IC50", "LogIC50")],
     x_label="[Inhibitor]", y_label="Response (%)",
     multistart="IC50", multistart_mode="x")

_reg("inhibitor_vs_normalized_response_variable",
     "[Inhibitor] vs. normalized response -- Variable slope", FAM_INH,
     "Y=100/(1+(IC50/X)^HillSlope)", ["IC50", "HillSlope"],
     lambda x, p: 100.0 / (1.0 + np.power(p["IC50"] / _arr(x),
                                          p["HillSlope"])),
     _init_conc("IC50", True, True),
     transforms=[_log10_of("IC50", "LogIC50")],
     x_label="[Inhibitor]", y_label="Response (%)",
     multistart="IC50", multistart_mode="x")


# ============================================ Dose-response: special

def _init_4pl_log(mid="LogEC50"):
    def initials(x, y):
        s = DataStats(x, y)
        return {"Bottom": s.ymin, "Top": s.ymax, mid: s.x_at_ymid,
                "HillSlope": s.sign}
    return initials


def _five_pl_log(x, p):
    h, sym = p["HillSlope"], p["S"]
    log_xb = p["LogEC50"] + (1.0 / h) * np.log10(2.0 ** (1.0 / sym) - 1.0)
    return p["Bottom"] + (p["Top"] - p["Bottom"]) / np.power(
        1.0 + _p10((log_xb - _arr(x)) * h), sym)


_reg("asymmetric_5pl_log", "Asymmetrical (five parameter), X is log(concentration)",
     FAM_SPEC_LOG,
     "LogXb = LogEC50 + (1/HillSlope)*Log((2^(1/S))-1); "
     "Numerator = Top - Bottom; Denominator = (1+10^((LogXb-X)*HillSlope))^S; "
     "Y = Bottom + (Numerator/Denominator)",
     ["Bottom", "Top", "LogEC50", "HillSlope", "S"], _five_pl_log,
     lambda x, y: dict(_init_4pl_log()(x, y), S=1.0),
     transforms=[_pow10_of("LogEC50", "EC50")], x_is_log=True,
     x_label="log[Agonist]", y_label="Response",
     multistart="LogEC50", multistart_mode="x")


def _five_pl(x, p):
    h, sym = p["HillSlope"], p["S"]
    den = np.power(1.0 + (2.0 ** (1.0 / sym) - 1.0)
                   * np.power(p["EC50"] / _arr(x), h), sym)
    return p["Bottom"] + (p["Top"] - p["Bottom"]) / den


_reg("asymmetric_5pl", "Asymmetrical (five parameter), X is concentration",
     FAM_SPEC_CONC,
     "Denominator = (1+(2^(1/S)-1)*((EC50/X)^HillSlope))^S; "
     "Numerator = Top - Bottom; Y = Bottom + (Numerator/Denominator)",
     ["Bottom", "Top", "EC50", "HillSlope", "S"], _five_pl,
     lambda x, y: dict(_init_conc("EC50", True, False)(x, y), S=1.0),
     transforms=[_log10_of("EC50", "LogEC50")],
     x_label="[Agonist]", y_label="Response",
     multistart="EC50", multistart_mode="x")


def _biphasic_log(x, p):
    x = _arr(x)
    span = p["Top"] - p["Bottom"]
    s1 = span * p["Frac"] / (1.0 + _p10((p["LogEC50_1"] - x) * p["nH1"]))
    s2 = span * (1.0 - p["Frac"]) / (1.0 + _p10((p["LogEC50_2"] - x)
                                                * p["nH2"]))
    return p["Bottom"] + s1 + s2


def _init_biphasic_log(x, y):
    s = DataStats(x, y)
    return {"Bottom": s.ymin, "Top": s.ymax, "Frac": 0.5,
            "LogEC50_1": s.xmin + 0.3 * s.xrange, "nH1": s.sign,
            "LogEC50_2": s.xmin + 0.7 * s.xrange, "nH2": s.sign}


_reg("biphasic_log", "Biphasic dose-response, X is log(concentration)",
     FAM_SPEC_LOG,
     "Span=Top-Bottom; Section1=Span*Frac/(1+10^((LogEC50_1-X)*nH1)); "
     "Section2=Span* (1-Frac)/(1+10^((LogEC50_2-X)*nH2)); "
     "Y=Bottom + Section1 +Section2",
     ["Bottom", "Top", "Frac", "LogEC50_1", "nH1", "LogEC50_2", "nH2"],
     _biphasic_log, _init_biphasic_log,
     transforms=[_pow10_of("LogEC50_1", "EC50_1"),
                 _pow10_of("LogEC50_2", "EC50_2")],
     x_is_log=True, x_label="log[Agonist]", y_label="Response",
     multistart="LogEC50_1", multistart_mode="x")


def _biphasic(x, p):
    x = _arr(x)
    span = p["Top"] - p["Bottom"]
    s1 = span * p["Frac"] / (1.0 + np.power(p["EC50_1"] / x, p["nH1"]))
    s2 = span * (1.0 - p["Frac"]) / (1.0 + np.power(p["EC50_2"] / x,
                                                    p["nH2"]))
    return p["Bottom"] + s1 + s2


def _init_biphasic(x, y):
    s = DataStats(x, y)
    return {"Bottom": s.ymin, "Top": s.ymax, "Frac": 0.5,
            "EC50_1": _geo_quantile(s, 0.3), "nH1": s.sign,
            "EC50_2": _geo_quantile(s, 0.7), "nH2": s.sign}


_reg("biphasic", "Biphasic dose-response, X is concentration", FAM_SPEC_CONC,
     "Span=Top-Bottom; Section1=Span*Frac/(1+(EC50_1/X)^nH1); "
     "Section2=Span* (1-Frac)/(1+(EC50_2/X)^nH2); Y=Bottom + Section1 +Section2",
     ["Bottom", "Top", "Frac", "EC50_1", "nH1", "EC50_2", "nH2"],
     _biphasic, _init_biphasic,
     transforms=[_log10_of("EC50_1", "LogEC50_1"),
                 _log10_of("EC50_2", "LogEC50_2")],
     x_label="[Agonist]", y_label="Response",
     multistart="EC50_1", multistart_mode="x")


def _bell_log(x, p):
    x = _arr(x)
    s1 = (p["Plateau1"] - p["Dip"]) / (1.0 + _p10((p["LogEC50_1"] - x)
                                                  * p["nH1"]))
    s2 = (p["Plateau2"] - p["Dip"]) / (1.0 + _p10((x - p["LogEC50_2"])
                                                  * p["nH2"]))
    return p["Dip"] + s1 + s2


def _bell_dip(s: DataStats):
    """Dip (or peak): the extreme farthest from the two end plateaus.
    With the guide's equation the curve runs Plateau1 -> Dip -> Plateau2
    from left to right when nH1 and nH2 are negative, so both start at
    -1."""
    ends = (s.y_at_xmin + s.y_at_xmax) / 2.0
    if ends - s.ymin >= s.ymax - ends:
        return s.ymin, s.x_at_ymin
    return s.ymax, s.x_at_ymax


def _init_bell_log(x, y):
    s = DataStats(x, y)
    dip, xd = _bell_dip(s)
    return {"Dip": dip, "Plateau1": s.y_at_xmin, "Plateau2": s.y_at_xmax,
            "LogEC50_1": (s.xmin + xd) / 2.0, "nH1": -1.0,
            "LogEC50_2": (xd + s.xmax) / 2.0, "nH2": -1.0}


_reg("bell_shaped_log", "Bell-shaped dose-response, X is log(concentration)",
     FAM_SPEC_LOG,
     "Span1=Plateau1-Dip; Span2=Plateau2-Dip; "
     "Section1=Span1/(1+10^((LogEC50_1-X)*nH1)); "
     "Section2=Span2/(1+10^((X-LogEC50_2)*nH2)); Y=Dip+Section1+Section2",
     ["Dip", "Plateau1", "Plateau2", "LogEC50_1", "nH1", "LogEC50_2", "nH2"],
     _bell_log, _init_bell_log,
     transforms=[_pow10_of("LogEC50_1", "EC50_1"),
                 _pow10_of("LogEC50_2", "EC50_2")],
     x_is_log=True, x_label="log[Agonist]", y_label="Response",
     multistart="LogEC50_1", multistart_mode="x")


def _bell(x, p):
    x = _arr(x)
    s1 = (p["Plateau1"] - p["Dip"]) / (1.0 + np.power(p["EC50_1"] / x,
                                                      p["nH1"]))
    s2 = (p["Plateau2"] - p["Dip"]) / (1.0 + np.power(x / p["EC50_2"],
                                                      p["nH2"]))
    return p["Dip"] + s1 + s2


def _init_bell(x, y):
    s = DataStats(x, y)
    dip, xd = _bell_dip(s)
    lo = math.log10(_pos_x(s)[0])
    hi = math.log10(_pos_x(s)[-1])
    ld = math.log10(xd) if xd > 0 else (lo + hi) / 2
    return {"Dip": dip, "Plateau1": s.y_at_xmin, "Plateau2": s.y_at_xmax,
            "EC50_1": 10.0 ** ((lo + ld) / 2), "nH1": -1.0,
            "EC50_2": 10.0 ** ((ld + hi) / 2), "nH2": -1.0}


_reg("bell_shaped", "Bell-shaped dose-response, X is concentration",
     FAM_SPEC_CONC,
     "Span1=Plateau1-Dip; Span2=Plateau2-Dip; "
     "Section1=Span1/(1+(EC50_1/X)^nH1); Section2=Span2/(1+(X/EC50_2)^nH2); "
     "Y=Dip+Section1+Section2",
     ["Dip", "Plateau1", "Plateau2", "EC50_1", "nH1", "EC50_2", "nH2"],
     _bell, _init_bell,
     transforms=[_log10_of("EC50_1", "LogEC50_1"),
                 _log10_of("EC50_2", "LogEC50_2")],
     x_label="[Agonist]", y_label="Response",
     multistart="EC50_1", multistart_mode="x")


# ---- operational model (Black & Leff), global fits

def _operate_log(x, p):
    x = _arr(x)
    return np.power((_p10(p["LogKA"]) + _p10(x)) / _p10(p["LogTau"] + x),
                    p["n"])


def _op_depletion_log(x, p):
    return p["Basal"] + (p["Effectmax"] - p["Basal"]) / (1.0 + _operate_log(x, p))


def _op_global_initials(log_x, partial):
    """Effectmax a little above the largest response, Basal = YMIN; each
    curve's tau from its top relative to Effectmax (top fraction =
    tau^n/(1+tau^n) with n = 1) and KA from the first curve's X at YMID
    (EC50 = KA/(1+tau))."""
    def initials(datasets):
        stats_ = [DataStats(d["x"], d["y"]) for d in datasets]
        basal = min(s.ymin for s in stats_)
        top_a = stats_[0].ymax
        emax = top_a if partial else basal + 1.1 * (
            max(s.ymax for s in stats_) - basal)
        out = []
        for i, s in enumerate(stats_):
            frac = (s.ymax - basal) / max(emax - basal, 1e-12)
            frac = min(max(frac, 0.05), 0.95)
            tau = frac / (1.0 - frac)
            ec50 = s.x_at_ymid if log_x else _x_at_ymid_pos(s)
            if log_x:
                d = {"Basal": basal, "Effectmax": emax, "n": 1.0,
                     "LogTau": math.log10(tau),
                     "LogKA": ec50 + math.log10(1.0 + tau),
                     "LogEC50": ec50}
            else:
                d = {"Basal": basal, "Effectmax": emax, "n": 1.0, "Tau": tau,
                     "KA": ec50 * (1.0 + tau), "EC50": ec50}
            out.append(d)
        if not partial:  # one shared KA, from the undepleted curve
            key = "LogKA" if log_x else "KA"
            for d in out:
                d[key] = out[0][key]
        return out
    return initials


def _single_from_global(ginit):
    return lambda x, y: ginit([{"x": x, "y": y, "constants": {}}])[0]


_reg("operational_depletion_log",
     "Operational model - Depletion, X is log(concentration)", FAM_SPEC_LOG,
     "operate= (((10^logKA)+(10^X))/(10^(logtau+X)))^n; "
     "Y=Basal + (Effectmax-Basal)/(1+operate)",
     ["Basal", "Effectmax", "LogKA", "n", "LogTau"], _op_depletion_log,
     _single_from_global(_op_global_initials(True, False)),
     transforms=[_pow10_of("LogKA", "KA"), _pow10_of("LogTau", "Tau")],
     x_is_log=True, x_label="log[Agonist]", y_label="Response",
     shared=("Basal", "Effectmax", "LogKA", "n"), global_only=True,
     global_initials=_op_global_initials(True, False))


def _operate(x, p):
    x = _arr(x)
    return np.power((p["KA"] + x) / (p["Tau"] * x), p["n"])


_reg("operational_depletion",
     "Operational model - Depletion, X is concentration", FAM_SPEC_CONC,
     "operate= ((Ka+X)/(Tau*X))^n; Y=Basal + (Effectmax-Basal)/(1+operate)",
     ["Basal", "Effectmax", "KA", "n", "Tau"],
     lambda x, p: p["Basal"] + (p["Effectmax"] - p["Basal"])
     / (1.0 + _operate(x, p)),
     _single_from_global(_op_global_initials(False, False)),
     transforms=[_log10_of("KA", "LogKA"), _log10_of("Tau", "LogTau")],
     x_label="[Agonist]", y_label="Response",
     shared=("Basal", "Effectmax", "KA", "n"), global_only=True,
     global_initials=_op_global_initials(False, False))


def _partial_log(x, p):
    x = _arr(x)
    if int(p.get("_dataset", 0)) == 0:  # <A>: the full agonist
        return p["Basal"] + (p["Effectmax"] - p["Basal"]) / (
            1.0 + _p10((p["LogEC50"] - x) * p["n"]))
    return _op_depletion_log(x, p)


_reg("operational_partial_agonist_log",
     "Operational model - Partial agonist, X is log(concentration)",
     FAM_SPEC_LOG,
     "operate= (((10^logKA)+(10^X))/(10^(logtau+X)))^n; "
     "<A> Y = Basal + (Effectmax-Basal)/(1+10^((LogEC50-X)*n)); "
     "<~A> Y = Basal + (Effectmax-Basal)/(1+operate)",
     ["Basal", "Effectmax", "n", "LogEC50", "LogKA", "LogTau"], _partial_log,
     _single_from_global(_op_global_initials(True, True)),
     transforms=[_pow10_of("LogEC50", "EC50"), _pow10_of("LogKA", "KA"),
                 _pow10_of("LogTau", "Tau")],
     x_is_log=True, x_label="log[Agonist]", y_label="Response",
     shared=("Basal", "Effectmax", "n"),
     param_scope={"LogEC50": "first", "LogKA": "rest", "LogTau": "rest"},
     global_only=True, global_initials=_op_global_initials(True, True))


def _partial(x, p):
    x = _arr(x)
    if int(p.get("_dataset", 0)) == 0:
        return p["Basal"] + (p["Effectmax"] - p["Basal"]) / (
            1.0 + np.power(p["EC50"] / x, p["n"]))
    return p["Basal"] + (p["Effectmax"] - p["Basal"]) / (1.0 + _operate(x, p))


_reg("operational_partial_agonist",
     "Operational model - Partial agonist, X is concentration", FAM_SPEC_CONC,
     "operate= ((Ka+X)/(Tau*X))^n; "
     "<A> Y = Basal + (Effectmax-Basal)/(1+(EC50/X)^n); "
     "<~A> Y = Basal + (Effectmax-Basal)/(1+operate)",
     ["Basal", "Effectmax", "n", "EC50", "KA", "Tau"], _partial,
     _single_from_global(_op_global_initials(False, True)),
     transforms=[_log10_of("EC50", "LogEC50"), _log10_of("KA", "LogKA"),
                 _log10_of("Tau", "LogTau")],
     x_label="[Agonist]", y_label="Response",
     shared=("Basal", "Effectmax", "n"),
     param_scope={"EC50": "first", "KA": "rest", "Tau": "rest"},
     global_only=True, global_initials=_op_global_initials(False, True))


# ---- Gaddum/Schild, EC50 shift, allosteric EC50 shift (B = column title)

def _control_index(datasets, key):
    vals = [float(d["constants"].get(key, 0.0)) for d in datasets]
    return int(np.argmin(vals)), vals


def _schild_initials(log_x, slope1):
    def initials(datasets):
        ic, bs = _control_index(datasets, "B")
        ally = np.concatenate([_arr(d["y"]) for d in datasets])
        s0 = DataStats(datasets[ic]["x"], datasets[ic]["y"])
        nz = [b for b in bs if b > 0]
        base = {"Bottom": float(ally.min()), "Top": float(ally.max()),
                "HillSlope": 1.0,
                "pA2": -math.log10(min(nz)) if nz else 6.0}
        if log_x:
            base["LogEC50"] = s0.x_at_ymid
        else:
            base["EC50"] = _x_at_ymid_pos(s0)
        if not slope1:
            base["SchildSlope"] = 1.0
        return [dict(base) for _ in datasets]
    return initials


def _schild_log(slope1):
    def f(x, p):
        s = 1.0 if slope1 else p["SchildSlope"]
        antag = 1.0 + np.power(p["B"] / 10.0 ** (-p["pA2"]), s)
        log_ec = np.log10(10.0 ** p["LogEC50"] * antag)
        return p["Bottom"] + (p["Top"] - p["Bottom"]) / (
            1.0 + _p10((log_ec - _arr(x)) * p["HillSlope"]))
    return f


def _schild_conc(slope1):
    def f(x, p):
        s = 1.0 if slope1 else p["SchildSlope"]
        antag = 1.0 + np.power(p["B"] / 10.0 ** (-p["pA2"]), s)
        return p["Bottom"] + (p["Top"] - p["Bottom"]) / (
            1.0 + np.power(p["EC50"] * antag / _arr(x), p["HillSlope"]))
    return f


for _slope1 in (False, True):
    _sfx = "_slope1" if _slope1 else ""
    _lbl = " (SchildSlope=1)" if _slope1 else ""
    _extra = [] if _slope1 else ["SchildSlope"]
    _kb = ([_neg_pow10_of("pA2", "Kb"),
            Transform("LogKb", lambda p: -p["pA2"], ("pA2",))]
           if _slope1 else [_neg_pow10_of("pA2", "A2")])
    _reg(f"gaddum_schild{_sfx}_log",
         f"Gaddum/Schild EC50 shift{_lbl}, X is log(concentration)",
         FAM_SPEC_LOG,
         "EC50=10^LogEC50; Antag=1+(B/(10^(-1*pA2)))"
         + ("" if _slope1 else "^SchildSlope")
         + "; LogEC=Log(EC50*Antag); "
         "Y=Bottom + (Top-Bottom)/(1+10^((LogEC-X)*HillSlope))",
         ["Bottom", "Top", "LogEC50", "HillSlope", "pA2"] + _extra + ["B"],
         _schild_log(_slope1),
         _single_from_global(_schild_initials(True, _slope1)),
         transforms=[_pow10_of("LogEC50", "EC50")] + _kb,
         x_is_log=True, x_label="log[Agonist]", y_label="Response",
         required=("B",), dataset_constants=("B",),
         shared=("Bottom", "Top", "LogEC50", "HillSlope", "pA2",
                 "SchildSlope"),
         global_only=True, global_initials=_schild_initials(True, _slope1))
    _reg(f"gaddum_schild{_sfx}",
         f"Gaddum/Schild EC50 shift{_lbl}, X is concentration",
         FAM_SPEC_CONC,
         "Antag=1+(B/(10^(-1*pA2)))" + ("" if _slope1 else "^SchildSlope")
         + "; Y=Bottom + (Top-Bottom)/(1+(EC50*Antag/X)^HillSlope)",
         ["Bottom", "Top", "EC50", "HillSlope", "pA2"] + _extra + ["B"],
         _schild_conc(_slope1),
         _single_from_global(_schild_initials(False, _slope1)),
         transforms=[_log10_of("EC50", "LogEC50")] + _kb,
         x_label="[Agonist]", y_label="Response",
         required=("B",), dataset_constants=("B",),
         shared=("Bottom", "Top", "EC50", "HillSlope", "pA2", "SchildSlope"),
         global_only=True, global_initials=_schild_initials(False, _slope1))


def _shift_initials(log_x):
    def initials(datasets):
        st = [DataStats(d["x"], d["y"]) for d in datasets]
        ally = np.concatenate([_arr(d["y"]) for d in datasets])
        out = []
        for s in st:
            d = {"Bottom": float(ally.min()), "Top": float(ally.max()),
                 "HillSlope": st[0].sign}
            if log_x:
                d["LogEC50Control"] = st[0].x_at_ymid
                d["EC50Ratio"] = 10.0 ** (s.x_at_ymid - st[0].x_at_ymid)
            else:
                c = _x_at_ymid_pos(st[0])
                d["EC50Control"] = c
                d["EC50Ratio"] = _x_at_ymid_pos(s) / c
            out.append(d)
        return out
    return initials


def _shift_log(x, p):
    log_ec = p["LogEC50Control"]
    if int(p.get("_dataset", 0)) != 0:
        log_ec = log_ec + np.log10(p["EC50Ratio"])
    return p["Bottom"] + (p["Top"] - p["Bottom"]) / (
        1.0 + _p10((log_ec - _arr(x)) * p["HillSlope"]))


_reg("ec50_shift_log", "EC50 shift, X is log(concentration)", FAM_SPEC_LOG,
     "<A>LogEC=LogEC50Control; <~A>LogEC=LogEC50Control + log(EC50Ratio); "
     "Y=Bottom + (Top-Bottom)/(1+10^((LogEC-X)*HillSlope))",
     ["Bottom", "Top", "HillSlope", "LogEC50Control", "EC50Ratio"], _shift_log,
     _single_from_global(_shift_initials(True)),
     transforms=[_pow10_of("LogEC50Control", "EC50Control")],
     x_is_log=True, x_label="log[Agonist]", y_label="Response",
     shared=("Bottom", "Top", "HillSlope", "LogEC50Control"),
     param_scope={"EC50Ratio": "rest"}, global_only=True,
     global_initials=_shift_initials(True))


def _shift(x, p):
    ec = p["EC50Control"]
    if int(p.get("_dataset", 0)) != 0:
        ec = ec * p["EC50Ratio"]  # guide prints "+": see module docstring
    return p["Bottom"] + (p["Top"] - p["Bottom"]) / (
        1.0 + np.power(ec / _arr(x), p["HillSlope"]))


_reg("ec50_shift", "EC50 shift, X is concentration", FAM_SPEC_CONC,
     "<A>EC=EC50Control; <~A>EC=EC50Control*EC50Ratio; "
     "Y=Bottom + (Top-Bottom)/(1+(EC/X)^HillSlope)",
     ["Bottom", "Top", "HillSlope", "EC50Control", "EC50Ratio"], _shift,
     _single_from_global(_shift_initials(False)),
     transforms=[_log10_of("EC50Control", "LogEC50Control")],
     x_label="[Agonist]", y_label="Response",
     shared=("Bottom", "Top", "HillSlope", "EC50Control"),
     param_scope={"EC50Ratio": "rest"}, global_only=True,
     global_initials=_shift_initials(False))


def _allo_initials(log_x):
    def initials(datasets):
        ic, bs = _control_index(datasets, "B")
        ih = int(np.argmax(bs))
        st = [DataStats(d["x"], d["y"]) for d in datasets]
        ally = np.concatenate([_arr(d["y"]) for d in datasets])
        nz = sorted(b for b in bs if b > 0) or [1.0]
        kb = float(np.median(nz))
        if log_x:
            shift = st[ih].x_at_ymid - st[ic].x_at_ymid
        else:
            shift = math.log10(_x_at_ymid_pos(st[ih]) / _x_at_ymid_pos(st[ic]))
        alpha = 0.1 if shift > 0 else 10.0
        d = {"Bottom": float(ally.min()), "Top": float(ally.max()),
             "HillSlope": st[ic].sign}
        if log_x:
            d.update(LogEC50=st[ic].x_at_ymid, LogKB=math.log10(kb),
                     LogAlpha=math.log10(alpha))
        else:
            d.update(EC50=_x_at_ymid_pos(st[ic]), KB=kb, Alpha=alpha)
        return [dict(d) for _ in datasets]
    return initials


def _allo_log(x, p):
    kb, alpha = 10.0 ** p["LogKB"], 10.0 ** p["LogAlpha"]
    antag = (1.0 + p["B"] / kb) / (1.0 + alpha * p["B"] / kb)
    log_ec = np.log10(10.0 ** p["LogEC50"] * antag)
    return p["Bottom"] + (p["Top"] - p["Bottom"]) / (
        1.0 + _p10((log_ec - _arr(x)) * p["HillSlope"]))


_reg("allosteric_ec50_shift_log",
     "Allosteric EC50 shift, X is log(concentration)", FAM_SPEC_LOG,
     "EC50=10^LogEC50; KB=10^LogKB; alpha=10^Logalpha; "
     "Antag=(1+B/KB)/(1+alpha*B/KB); LogEC=Log(EC50*Antag); "
     "Y=Bottom+(Top-Bottom)/(1+10^((LogEC-X)*HillSlope))",
     ["Bottom", "Top", "HillSlope", "LogEC50", "LogKB", "LogAlpha", "B"],
     _allo_log, _single_from_global(_allo_initials(True)),
     transforms=[_pow10_of("LogEC50", "EC50"), _pow10_of("LogKB", "KB"),
                 _pow10_of("LogAlpha", "Alpha")],
     x_is_log=True, x_label="log[Agonist]", y_label="Response",
     required=("B",), dataset_constants=("B",),
     shared=("Bottom", "Top", "HillSlope", "LogEC50", "LogKB", "LogAlpha"),
     global_only=True, global_initials=_allo_initials(True))


def _allo(x, p):
    antag = (1.0 + p["B"] / p["KB"]) / (1.0 + p["Alpha"] * p["B"] / p["KB"])
    return p["Bottom"] + (p["Top"] - p["Bottom"]) / (
        1.0 + np.power(p["EC50"] * antag / _arr(x), p["HillSlope"]))


_reg("allosteric_ec50_shift", "Allosteric EC50 shift, X is concentration",
     FAM_SPEC_CONC,
     "Antag=(1+B/KB)/(1+alpha*B/KB); "
     "Y=Bottom+(Top-Bottom)/(1+(EC50*Antag/X)^HillSlope)",
     ["Bottom", "Top", "HillSlope", "EC50", "KB", "Alpha", "B"], _allo,
     _single_from_global(_allo_initials(False)),
     transforms=[_log10_of("EC50", "LogEC50"), _log10_of("KB", "LogKB"),
                 _log10_of("Alpha", "LogAlpha")],
     x_label="[Agonist]", y_label="Response",
     required=("B",), dataset_constants=("B",),
     shared=("Bottom", "Top", "HillSlope", "EC50", "KB", "Alpha"),
     global_only=True, global_initials=_allo_initials(False))


# ---- ECanything, absolute IC50

def _ecf_log(x, p):
    h, f = p["HillSlope"], p["F"]
    log_ec50 = p["LogECF"] - (1.0 / h) * np.log10(f / (100.0 - f))
    return p["Bottom"] + (p["Top"] - p["Bottom"]) / (
        1.0 + _p10((log_ec50 - _arr(x)) * h))


def _init_ecf_log(x, y, fixed):
    s = DataStats(x, y)
    f = float(fixed.get("F", 50.0))
    level = s.ymin + f / 100.0 * (s.ymax - s.ymin) if s.sign > 0 else \
        s.ymax - f / 100.0 * (s.ymax - s.ymin)
    return {"Bottom": s.ymin, "Top": s.ymax, "LogECF": s.x_at_level(level),
            "HillSlope": s.sign, "F": f}


_reg("log_agonist_vs_response_ecanything",
     "log(agonist) vs. response -- Find ECanything", FAM_SPEC_LOG,
     "logEC50=logECF - (1/HillSlope)*log(F/(100-F)); "
     "Y=Bottom + (Top-Bottom)/(1+10^((LogEC50-X)*HillSlope))",
     ["Bottom", "Top", "LogECF", "HillSlope", "F"], _ecf_log, _init_ecf_log,
     transforms=[_pow10_of("LogECF", "ECF")], x_is_log=True,
     x_label="log[Agonist]", y_label="Response", required=("F",),
     multistart="LogECF", multistart_mode="x", initials_fixed=True)


def _ecf(x, p):
    h, f = p["HillSlope"], p["F"]
    ec50 = p["ECF"] / np.power(f / (100.0 - f), 1.0 / h)
    return p["Bottom"] + (p["Top"] - p["Bottom"]) / (
        1.0 + np.power(ec50 / _arr(x), h))


def _init_ecf(x, y, fixed):
    d = _init_ecf_log(x, y, fixed)
    s = DataStats(x, y)
    v = d.pop("LogECF")
    d["ECF"] = v if v > 0 else _geo_quantile(s, 0.5)
    return d


_reg("agonist_vs_response_ecanything",
     "[Agonist] vs. response -- Find ECanything", FAM_SPEC_CONC,
     "EC50=ECF / (F/(100-F))^(1/HillSlope); "
     "Y=Bottom + (Top-Bottom)/(1+(EC50/X)^HillSlope)",
     ["Bottom", "Top", "ECF", "HillSlope", "F"], _ecf, _init_ecf,
     transforms=[_log10_of("ECF", "LogECF")],
     x_label="[Agonist]", y_label="Response", required=("F",),
     multistart="ECF", multistart_mode="x", initials_fixed=True)


def _abs_ic50_log(x, p):
    top, bottom = p["Top"], p["Bottom"]
    fifty = (top + p["Baseline"]) / 2.0
    return bottom + (top - bottom) / (1.0 + _p10(
        (p["LogAbsoluteIC50"] - _arr(x)) * p["HillSlope"]
        + np.log10((top - bottom) / (fifty - bottom) - 1.0)))


def _init_abs_log(x, y, fixed):
    s = DataStats(x, y)
    top = s.ymax
    base = float(fixed.get("Baseline", s.ymin))
    return {"Bottom": s.ymin, "Top": top,
            "LogAbsoluteIC50": s.x_at_level((top + base) / 2.0),
            "HillSlope": s.sign, "Baseline": base}


_reg("absolute_ic50_log", "Absolute IC50, X is log(concentration)",
     FAM_SPEC_LOG,
     "Fifty=(Top+Baseline)/2; Y= Bottom + (Top-Bottom)/(1+10^((LogAbsoluteIC50-X)"
     "*HillSlope + log((Top-Bottom)/(Fifty-Bottom)-1)))",
     ["Bottom", "Top", "LogAbsoluteIC50", "HillSlope", "Baseline"],
     _abs_ic50_log, _init_abs_log,
     transforms=[_pow10_of("LogAbsoluteIC50", "AbsoluteIC50")],
     x_is_log=True, x_label="log[Inhibitor]", y_label="Response",
     required=("Baseline",), multistart="LogAbsoluteIC50",
     multistart_mode="x", initials_fixed=True)


def _abs_ic50(x, p):
    top, bottom = p["Top"], p["Bottom"]
    fifty = (top + p["Baseline"]) / 2.0
    return bottom + (top - bottom) / (
        1.0 + ((top - bottom) / (fifty - bottom) - 1.0)
        * np.power(p["AbsoluteIC50"] / _arr(x), p["HillSlope"]))


def _init_abs(x, y, fixed):
    d = _init_abs_log(x, y, fixed)
    v = d.pop("LogAbsoluteIC50")
    d["AbsoluteIC50"] = v if v > 0 else _geo_quantile(DataStats(x, y), 0.5)
    return d


_reg("absolute_ic50", "Absolute IC50, X is concentration", FAM_SPEC_CONC,
     "Fifty=(Top+Baseline)/2; Y= Bottom + (Top-Bottom)/(1+((Top-Bottom)/"
     "(Fifty-Bottom)-1)*(AbsoluteIC50/X)^HillSlope)",
     ["Bottom", "Top", "AbsoluteIC50", "HillSlope", "Baseline"],
     _abs_ic50, _init_abs,
     transforms=[_log10_of("AbsoluteIC50", "LogAbsoluteIC50")],
     x_label="[Inhibitor]", y_label="Response", required=("Baseline",),
     multistart="AbsoluteIC50", multistart_mode="x", initials_fixed=True)


# ============================================ Receptor binding: saturation
FAM_SAT = "Receptor binding - Saturation binding"
FAM_COMP = "Receptor binding - Competitive binding"
FAM_KIN = "Receptor binding - Kinetics"


def _init_total(x, y):
    s = DataStats(x, y)
    ns = max(s.slope_at_xmax, 0.0)
    bg = s.y_at_xmin - ns * s.xmin
    spec_y = s.uy - ns * s.ux - bg
    bmax = max(float(np.max(spec_y)), 1e-12)
    st = DataStats(s.ux, spec_y)
    return {"Bmax": bmax, "Kd": _positive(st.x_at_ymid, s.xmid),
            "NS": ns, "Background": bg}


_reg("one_site_total", "One site -- Total binding", FAM_SAT,
     "Y=Bmax*X/(Kd+X) + NS*X + Background",
     ["Bmax", "Kd", "NS", "Background"],
     lambda x, p: p["Bmax"] * _arr(x) / (p["Kd"] + _arr(x))
     + p["NS"] * _arr(x) + p["Background"],
     _init_total, x_label="[Radioligand]", y_label="Total binding",
     multistart="Kd", multistart_mode="x")


def _total_ns(x, p):
    x = _arr(x)
    nonspecific = p["NS"] * x + p["Background"]
    if int(p.get("_dataset", 0)) == 0:  # <A> total binding
        return p["Bmax"] * x / (x + p["Kd"]) + nonspecific
    return nonspecific                    # <B> nonspecific binding


def _total_ns_initials(two_sites):
    def initials(datasets):
        a, b = datasets[0], datasets[-1]
        xb, yb = _arr(b["x"]), _arr(b["y"])
        if len(datasets) > 1 and np.ptp(xb) > 0:
            ns, bg = (float(v) for v in np.polyfit(xb, yb, 1))
        else:
            ns, bg = 0.0, float(np.min(a["y"]))
        xa, ya = _arr(a["x"]), _arr(a["y"])
        spec_y = ya - ns * xa - bg
        st = DataStats(xa, spec_y)
        bmax = max(st.ymax, 1e-12)
        kd = _positive(st.x_at_ymid, st.xmid)
        if two_sites:
            d = {"BmaxHi": bmax / 2, "KdHi": kd / 5, "BmaxLo": bmax / 2,
                 "KdLo": kd * 5, "NS": ns, "Background": bg}
        else:
            d = {"Bmax": bmax, "Kd": kd, "NS": ns, "Background": bg}
        return [dict(d) for _ in datasets]
    return initials


_reg("one_site_total_and_nonspecific",
     "One site -- Fit total and nonspecific binding", FAM_SAT,
     "specific=Bmax*X/(X+Kd); nonspecific=NS*X + Background; "
     "<A>Y=specific+nonspecific; <B>Y=nonspecific",
     ["Bmax", "Kd", "NS", "Background"], _total_ns,
     _single_from_global(_total_ns_initials(False)),
     x_label="[Radioligand]", y_label="Binding",
     shared=("NS", "Background"),
     param_scope={"Bmax": "first", "Kd": "first"}, global_only=True,
     global_initials=_total_ns_initials(False))


def _total_depletion(x, p):
    x = _arr(x)
    kdcpm = p["KdnM"] * p["Vol"] * 1000.0 * p["SpAct"]
    ns = p["NS"]
    a = -1.0 - ns
    b = kdcpm + ns * kdcpm + x + 2.0 * x * ns + p["Bmax"]
    c = -1.0 * x * (ns * kdcpm + x * ns + p["Bmax"])
    return (-b + np.sqrt(b * b - 4.0 * a * c)) / (2.0 * a)


def _init_total_depletion(x, y, fixed):
    s = DataStats(x, y)
    vol, spact = float(fixed.get("Vol", 1.0)), float(fixed.get("SpAct", 1.0))
    ns = max(s.slope_at_xmax, 0.0)
    spec_y = s.uy - ns * s.ux
    st = DataStats(s.ux, spec_y)
    kdcpm = _positive(st.x_at_ymid, s.xmid)
    return {"Bmax": max(st.ymax, 1e-12),
            "KdnM": kdcpm / (vol * 1000.0 * spact), "NS": ns,
            "SpAct": spact, "Vol": vol}


_reg("one_site_total_ligand_depletion",
     "One site -- Total, accounting for ligand depletion", FAM_SAT,
     "KdCPM=KdnM * Vol * 1000 * SpAct; a=-1-NS; "
     "b=KdCPM + NS*KdCPM + X + 2*X*NS + Bmax; c=-1*X*(NS*KdCPM + X*NS+Bmax); "
     "Y=(-b+sqrt(b*b-4*a*c) )/(2*a)",
     ["Bmax", "KdnM", "NS", "SpAct", "Vol"], _total_depletion,
     _init_total_depletion, x_label="[Radioligand] (cpm)",
     y_label="Total binding (cpm)", required=("SpAct", "Vol"),
     initials_fixed=True)


def _two_sites(x, p):
    x = _arr(x)
    return p["BmaxHi"] * x / (p["KdHi"] + x) + p["BmaxLo"] * x / (p["KdLo"] + x)


def _init_two_sites(x, y):
    s = DataStats(x, y)
    kd = _positive(s.x_at_ymid, s.xmid)
    return {"BmaxHi": s.ymax / 2, "KdHi": kd / 5, "BmaxLo": s.ymax / 2,
            "KdLo": kd * 5}


_reg("two_sites_specific", "Two sites -- Specific binding", FAM_SAT,
     "Site1=BmaxHi*X/(KdHi+X); Site2=BmaxLo*X/(KdLo+X); Y=Site1 + Site2",
     ["BmaxHi", "KdHi", "BmaxLo", "KdLo"], _two_sites, _init_two_sites,
     x_label="[Radioligand]", y_label="Specific binding",
     multistart="KdHi", multistart_mode="x")


def _two_total_ns(x, p):
    x = _arr(x)
    nonspecific = p["NS"] * x + p["Background"]
    if int(p.get("_dataset", 0)) == 0:
        return _two_sites(x, p) + nonspecific
    return nonspecific


_reg("two_sites_total_and_nonspecific",
     "Two sites -- Fit total and nonspecific binding", FAM_SAT,
     "Specific1=BmaxHi*X/(X+KdHi); Specific2=BmaxLo*X/(X+KdLo); "
     "Nonspecific=NS*X + Background; <A>Y=Specific1 + Specific2 + Nonspecific; "
     "<B>Y=Nonspecific",
     ["BmaxHi", "KdHi", "BmaxLo", "KdLo", "NS", "Background"], _two_total_ns,
     _single_from_global(_total_ns_initials(True)),
     x_label="[Radioligand]", y_label="Binding",
     shared=("NS", "Background"),
     param_scope={"BmaxHi": "first", "KdHi": "first", "BmaxLo": "first",
                  "KdLo": "first"},
     global_only=True, global_initials=_total_ns_initials(True))


def _sat_allo(x, p):
    hot = _arr(x)
    alpha, kb = 10.0 ** p["LogAlpha"], 10.0 ** p["LogKB"]
    kapp = p["KdHot"] * ((1.0 + p["Allo"] / kb) / (1.0 + alpha * p["Allo"] / kb))
    return p["Bmax"] * hot / (hot + kapp)


def _sat_allo_initials(datasets):
    ic, vals = _control_index(datasets, "Allo")
    ih = int(np.argmax(vals))
    st = [DataStats(d["x"], d["y"]) for d in datasets]
    kd = _positive(st[ic].x_at_ymid, st[ic].xmid)
    kd_hi = _positive(st[ih].x_at_ymid, st[ih].xmid)
    nz = sorted(v for v in vals if v > 0) or [1.0]
    alpha = 0.1 if kd_hi > kd else 10.0
    d = {"Bmax": st[ic].ymax * 1.2, "KdHot": kd,
         "LogAlpha": math.log10(alpha), "LogKB": math.log10(float(np.median(nz)))}
    return [dict(d) for _ in datasets]


_reg("saturation_allosteric", "One site with allosteric modulator", FAM_SAT,
     "Hot=X; Alpha=10^logalpha; KB=10^logKB; "
     "KApp=KDHot*((1+Allo/KB)/(1+alpha*Allo/KB)); Y=Bmax*Hot/(Hot+KApp)",
     ["Bmax", "KdHot", "LogAlpha", "LogKB", "Allo"], _sat_allo,
     _single_from_global(_sat_allo_initials),
     transforms=[_pow10_of("LogAlpha", "Alpha"), _pow10_of("LogKB", "KB")],
     x_label="[Radioligand]", y_label="Specific binding",
     required=("Allo",), dataset_constants=("Allo",),
     shared=("Bmax", "KdHot", "LogAlpha", "LogKB"), global_only=True,
     global_initials=_sat_allo_initials)


def _hill_binding(x, p):
    xh = np.power(_arr(x), p["h"])
    return p["Bmax"] * xh / (np.power(p["Kd"], p["h"]) + xh)


_reg("specific_binding_hill", "Specific binding with Hill slope", FAM_SAT,
     "Y=Bmax*X^h/(Kd^h + X^h)", ["Bmax", "Kd", "h"], _hill_binding,
     lambda x, y: {"Bmax": DataStats(x, y).ymax,
                   "Kd": _x_at_ymid_pos(DataStats(x, y)), "h": 1.0},
     x_label="[Radioligand]", y_label="Specific binding",
     multistart="Kd", multistart_mode="x")


# ============================================ Receptor binding: competitive

def _two_site_ki(x, p):
    x = _arr(x)
    log_lo = np.log10(10.0 ** p["LogKiLo"] * (1.0 + p["HotNM"] / p["HotKdNMLo"]))
    log_hi = np.log10(10.0 ** p["LogKiHi"] * (1.0 + p["HotNM"] / p["HotKdNMHi"]))
    span = p["Top"] - p["Bottom"]
    part1 = p["FractionHi"] * span / (1.0 + _p10(x - log_hi))
    part2 = (1.0 - p["FractionHi"]) * span / (1.0 + _p10(x - log_lo))
    return p["Bottom"] + part1 + part2


def _init_two_site_ki(x, y, fixed):
    s = DataStats(x, y)
    hot = float(fixed.get("HotNM", 1.0))
    shi = math.log10(1.0 + hot / float(fixed.get("HotKdNMHi", 1.0)))
    slo = math.log10(1.0 + hot / float(fixed.get("HotKdNMLo", 1.0)))
    xs = np.sort(s.x)
    return {"Top": s.ymax, "Bottom": s.ymin, "FractionHi": 0.5,
            "LogKiHi": float(np.percentile(xs, 25)) - shi,
            "LogKiLo": float(np.percentile(xs, 75)) - slo,
            **{k: float(fixed.get(k, 1.0))
               for k in ("HotNM", "HotKdNMHi", "HotKdNMLo")}}


_reg("two_sites_fit_ki", "Two sites -- Fit Ki", FAM_COMP,
     "logEC50Lo=log(10^logKiLo*(1+HotNM/HotKdNMLo)); "
     "logEC50Hi=log(10^logKiHi*(1+HotNM/HotKdNMHi)); Span=Top - Bottom; "
     "Part1=FractionHi*Span/(1+10^(X-LogEC50Hi) ); "
     "Part2=(1-FractionHi)*Span/(1+10^(X-LogEC50Lo) ); Y=Bottom + Part1 + Part2",
     ["Top", "Bottom", "FractionHi", "LogKiHi", "LogKiLo", "HotNM",
      "HotKdNMHi", "HotKdNMLo"], _two_site_ki, _init_two_site_ki,
     transforms=[_pow10_of("LogKiHi", "KiHi"), _pow10_of("LogKiLo", "KiLo")],
     x_is_log=True, x_label="log[Competitor]", y_label="Binding",
     required=("HotNM", "HotKdNMHi", "HotKdNMLo"),
     multistart="LogKiHi", multistart_mode="x", initials_fixed=True)


def _hetero_depletion(x, p):
    x = _arr(x)
    kdcpm = p["KdNM"] * p["SpAct"] * p["Vol"] * 1000.0
    r = p["NS"] + 1.0
    s_ = (1.0 + _p10(x - p["LogKi"])) * kdcpm + p["Hot"]
    a = -1.0 * r
    b = r * s_ + p["NS"] * p["Hot"] + p["Bmax"]
    c = -1.0 * p["Hot"] * (s_ * p["NS"] + p["Bmax"])
    return (-1.0 * b + np.sqrt(b * b - 4.0 * a * c)) / (2.0 * a)


def _init_hetero(x, y, fixed):
    s = DataStats(x, y)
    hot = float(fixed.get("Hot", 1.0))
    kdcpm = (float(fixed.get("KdNM", 1.0)) * float(fixed.get("SpAct", 1.0))
             * float(fixed.get("Vol", 1.0)) * 1000.0)
    ns = max(s.ymin, 0.0) / max(hot - s.ymin, 1e-12)
    bmax = max(s.ymax - s.ymin, 1e-12) * (kdcpm + hot) / max(hot, 1e-12)
    return {"LogKi": s.x_at_ymid - math.log10(1.0 + hot / max(kdcpm, 1e-300)),
            "Bmax": bmax, "NS": ns,
            **{k: float(fixed.get(k, 1.0)) for k in ("Hot", "KdNM", "SpAct", "Vol")}}


_reg("one_site_heterologous_depletion",
     "One site -- Heterologous with depletion", FAM_COMP,
     "KdCPM=KdnM*SpAct*vol*1000; R=NS+1; S=[1+10^(X-LogKi)]*KdCPM+Hot; "
     "a=-1*R; b=R*S+NS*Hot + Bmax; c= -1*Hot*(S*NS + Bmax); "
     "Y= (-1*b + sqrt(b*b-4*a*c))/(2*a)",
     ["LogKi", "Bmax", "NS", "Hot", "KdNM", "SpAct", "Vol"], _hetero_depletion,
     _init_hetero, transforms=[_pow10_of("LogKi", "Ki")], x_is_log=True,
     x_label="log[Competitor]", y_label="Binding (cpm)",
     required=("Hot", "KdNM", "SpAct", "Vol"), multistart="LogKi",
     multistart_mode="x", initials_fixed=True)


def _homologous(x, p):
    cold = _p10(_arr(x) + 9.0)
    kd = 10.0 ** (p["LogKd"] + 9.0)
    return (p["Bmax"] * p["HotnM"]) / (p["HotnM"] + cold + kd) + p["Bottom"]


def _homologous_initials(datasets):
    out = []
    for d in datasets:
        s = DataStats(d["x"], d["y"])
        hot = float(d["constants"].get("HotnM", 1.0))
        ic50 = 10.0 ** (s.x_at_ymid + 9.0)
        kd = max(ic50 - hot, ic50 * 0.5)
        out.append({"LogKd": math.log10(kd) - 9.0,
                    "Bmax": (s.ymax - s.ymin) * (hot + kd) / hot,
                    "Bottom": s.ymin})
    lk = float(np.mean([o["LogKd"] for o in out]))
    for o in out:
        o["LogKd"] = lk
    return out


_reg("one_site_homologous", "One site -- Homologous", FAM_COMP,
     "ColdNM=10^(x+9); KdNM=10^(logKD+9); "
     "Y=(Bmax*HotnM)/(HotnM + ColdNM + KdNM) + Bottom",
     ["LogKd", "Bmax", "Bottom", "HotnM"], _homologous,
     lambda x, y, fixed: dict(_homologous_initials(
         [{"x": x, "y": y, "constants": fixed}])[0],
         HotnM=float(fixed.get("HotnM", 1.0))),
     transforms=[_pow10_of("LogKd", "Kd")], x_is_log=True,
     x_label="log[Unlabeled ligand]", y_label="Binding",
     required=("HotnM",), dataset_constants=("HotnM",),
     shared=("LogKd", "Bmax"), global_initials=_homologous_initials,
     multistart="LogKd", multistart_mode="x", initials_fixed=True)


def _allo_titration(x, p):
    allo = _p10(_arr(x) + 9.0)
    kb = 10.0 ** (p["LogKb"] + 9.0)
    alpha = 10.0 ** p["LogAlpha"]
    kapp = p["HotKdNM"] * ((1.0 + allo / kb) / (1.0 + alpha * (allo / kb)))
    occ = p["RadioligandNM"] / (p["RadioligandNM"] + p["HotKdNM"])
    return (p["Y0"] / occ) * (p["RadioligandNM"] / (p["RadioligandNM"] + kapp))


def _init_allo_titration(x, y, fixed):
    s = DataStats(x, y)
    return {"Y0": s.y_at_xmin, "LogKb": s.x_at_ymid,
            "LogAlpha": -1.0 if s.sign < 0 else 1.0,
            **{k: float(fixed.get(k, 1.0)) for k in ("RadioligandNM", "HotKdNM")}}


_reg("allosteric_modulator_titration", "Allosteric modulator titration",
     FAM_COMP,
     "AlloNM=10^(X+9); KbNM=10^(logKb +9); alpha=10^logAlpha; "
     "KAppNM=HotKDnm*(((1+(AlloNM/KBNM))/(1+alpha*(AlloNM/KBNM)))); "
     "HotOccupancy = RadioligandNM/(RadioligandNM + HotKDnm); "
     "Y=(Y0/HotOccupancy)*(RadioligandNM/(RadioligandNM + KAppNM))",
     ["Y0", "LogKb", "LogAlpha", "RadioligandNM", "HotKdNM"], _allo_titration,
     _init_allo_titration,
     transforms=[_pow10_of("LogKb", "Kb"), _pow10_of("LogAlpha", "Alpha")],
     x_is_log=True, x_label="log[Modulator]", y_label="Specific binding",
     required=("RadioligandNM", "HotKdNM"), multistart="LogKb",
     multistart_mode="x", initials_fixed=True)


# ============================================ Receptor binding: kinetics

def _half_time(s: DataStats, start_y, end_y, after=None):
    """X (minus the start) where Y has gone half way from start to end."""
    mid = (start_y + end_y) / 2.0
    xs, ys = s.ux, s.uy
    lo = s.xmin if after is None else after
    for i in range(xs.size - 1):
        if xs[i] < lo:
            continue
        a, b = ys[i] - mid, ys[i + 1] - mid
        if a == 0:
            return max(xs[i] - lo, s.xrange / 20)
        if a * b < 0:
            return max(_interp_at(xs[i], ys[i], xs[i + 1], ys[i + 1], mid) - lo,
                       s.xrange / 20)
    return s.xrange / 3.0


def _init_dissociation(x, y):
    s = DataStats(x, y)
    y0, ns = s.y_at_xmin, s.y_at_xmax
    return {"Y0": y0, "NS": ns, "K": LN2 / _half_time(s, y0, ns)}


_reg("dissociation_one_phase", "Dissociation - One phase exponential decay",
     FAM_KIN, "Y=(Y0-NS)*exp(-K*X) + NS", ["Y0", "NS", "K"],
     lambda x, p: (p["Y0"] - p["NS"]) * np.exp(-p["K"] * _arr(x)) + p["NS"],
     _init_dissociation, transforms=[_half_life("K")],
     x_label="Time", y_label="Binding", multistart="K")


def _association(x, p):
    kd = p["Koff"] / p["Kon"]
    lig = p["Hotnm"] * 1e-9
    kob = p["Kon"] * lig + p["Koff"]
    occ = lig / (lig + kd)
    return occ * p["Bmax"] * (1.0 - np.exp(-1.0 * kob * _arr(x)))


def _init_association(x, y, fixed):
    s = DataStats(x, y)
    hot = float(fixed.get("Hotnm", 1.0))
    koff = float(fixed.get("Koff", 0.1))
    lig = hot * 1e-9
    kob = LN2 / _half_time(s, 0.0, s.ymax)
    kon = max((kob - koff) / lig, kob / lig * 0.1)
    occ = lig / (lig + koff / kon)
    return {"Kon": kon, "Koff": koff, "Bmax": s.ymax / occ, "Hotnm": hot}


_reg("association_one_conc", "Association kinetics (one ligand concentration)",
     FAM_KIN,
     "Kd=Koff/Kon; L=Hotnm*1e-9; Kob=Kon*L+Koff; Occupancy=L/(L+Kd); "
     "Ymax=Occupancy*Bmax; Y=Ymax*(1 - exp(-1*kob*X))",
     ["Kon", "Koff", "Bmax", "Hotnm"], _association, _init_association,
     transforms=[_ratio("Koff", "Kon", "Kd")],
     x_label="Time", y_label="Specific binding",
     required=("Hotnm", "Koff"), initials_fixed=True)


def _association_initials(datasets):
    kobs, ligs, tops = [], [], []
    for d in datasets:
        s = DataStats(d["x"], d["y"])
        lig = float(d["constants"].get("Hotnm", 1.0)) * 1e-9
        kobs.append(LN2 / _half_time(s, 0.0, s.ymax))
        ligs.append(lig)
        tops.append(s.ymax)
    if len(set(ligs)) > 1:
        kon, koff = (float(v) for v in np.polyfit(ligs, kobs, 1))
    else:
        kon, koff = kobs[0] / ligs[0] / 2, kobs[0] / 2
    kon = kon if kon > 0 else kobs[-1] / ligs[-1] / 2
    koff = koff if koff > 0 else min(kobs) / 2
    i = int(np.argmax(ligs))
    occ = ligs[i] / (ligs[i] + koff / kon)
    d = {"Kon": kon, "Koff": koff, "Bmax": tops[i] / occ}
    return [dict(d) for _ in datasets]


_reg("association_two_conc",
     "Association kinetics (two or more ligand concentrations)", FAM_KIN,
     "Kd=Koff/Kon; L=Hotnm*1e-9; Kob=Kon*L+Koff; Occupancy=L/(L+Kd); "
     "Ymax=Occupancy*Bmax; Y=Ymax*(1 - exp(-1*kob*X))",
     ["Kon", "Koff", "Bmax", "Hotnm"], _association,
     lambda x, y, fixed: dict(_association_initials(
         [{"x": x, "y": y, "constants": fixed}])[0],
         Hotnm=float(fixed.get("Hotnm", 1.0))),
     transforms=[_ratio("Koff", "Kon", "Kd")],
     x_label="Time", y_label="Specific binding",
     required=("Hotnm",), dataset_constants=("Hotnm",),
     shared=("Kon", "Koff", "Bmax"), global_only=True,
     global_initials=_association_initials, initials_fixed=True)


def _assoc_dissoc(x, p):
    x = _arr(x)
    lig = p["HotNM"] * 1e-9
    kob = lig * p["Kon"] + p["Koff"]
    kd = p["Koff"] / p["Kon"]
    eq = p["Bmax"] * lig / (lig + kd)
    association = eq * (1.0 - np.exp(-1.0 * kob * x))
    y_t0 = eq * (1.0 - np.exp(-1.0 * kob * p["Time0"]))
    dissociation = y_t0 * np.exp(-1.0 * p["Koff"] * (x - p["Time0"]))
    return np.where(x < p["Time0"], association, dissociation) + p["NS"]


def _init_assoc_dissoc(x, y, fixed):
    s = DataStats(x, y)
    hot = float(fixed.get("HotNM", 1.0))
    t0 = float(fixed.get("Time0", s.xmid))
    lig = hot * 1e-9
    ns = s.y_at_xmin
    before = s.ux < t0
    peak = float(np.max(s.uy[before])) if before.any() else s.ymax
    kob = LN2 / _half_time(s, ns, peak)
    koff = LN2 / _half_time(s, peak, ns, after=t0)
    kon = max((kob - koff) / lig, kob / lig * 0.1)
    kd = koff / kon
    eq = (peak - ns) / max(1.0 - math.exp(-kob * max(t0 - s.xmin, 0.0)), 0.05)
    return {"Kon": kon, "Koff": koff, "Bmax": eq * (lig + kd) / lig,
            "NS": ns, "HotNM": hot, "Time0": t0}


_reg("association_then_dissociation", "Association then dissociation",
     FAM_KIN,
     "Radioligand=HotNM*1e-9; Kob=[Radioligand]*Kon+Koff; Kd=Koff/Kon; "
     "Eq=Bmax*radioligand/(radioligand + Kd); Association=Eq*(1-exp(-1*Kob*X)); "
     "YatTime0 = Eq*(1-exp(-1*Kob*Time0)); "
     "Dissociation= YatTime0*exp(-1*Koff*(X-Time0)); "
     "Y=IF(X<Time0, Association, Dissociation) + NS",
     ["Kon", "Koff", "Bmax", "NS", "HotNM", "Time0"], _assoc_dissoc,
     _init_assoc_dissoc, transforms=[_ratio("Koff", "Kon", "Kd")],
     x_label="Time", y_label="Binding", required=("HotNM", "Time0"),
     initials_fixed=True)


def _competitive_kinetics(x, p):
    x = _arr(x)
    ka = p["K1"] * p["L"] * 1e-9 + p["K2"]
    kb = p["K3"] * p["I"] * 1e-9 + p["K4"]
    s_ = np.sqrt((ka - kb) ** 2 + 4.0 * p["K1"] * p["K3"] * p["L"] * p["I"] * 1e-18)
    kf = 0.5 * (ka + kb + s_)
    ks = 0.5 * (ka + kb - s_)
    diff = kf - ks
    q = p["Bmax"] * p["K1"] * p["L"] * 1e-9 / diff
    return q * (p["K4"] * diff / (kf * ks) + ((p["K4"] - kf) / kf)
                * np.exp(-kf * x) - ((p["K4"] - ks) / ks) * np.exp(-ks * x))


def _comp_kin_initials(datasets, fixed=None):
    out = []
    bm = []
    for d in datasets:
        c = dict(d["constants"])
        if fixed:
            c.update(fixed)
        k1, k2, lig = (float(c.get(k, 1.0)) for k in ("K1", "K2", "L"))
        ii = float(c.get("I", 0.0))
        kd_nm = k2 / k1 * 1e9
        s = DataStats(d["x"], d["y"])
        y_end = s.y_at_xmax
        bm.append(y_end * (1.0 + lig / kd_nm + ii / kd_nm) / (lig / kd_nm))
        out.append({"K3": k1, "K4": k2})
    b = float(np.mean(bm))
    for o in out:
        o["Bmax"] = b
    return out


_reg("kinetics_competitive_binding", "Kinetics of competitive binding",
     FAM_KIN,
     "KA = K1*L*1E-9 + k2; KB = K3*I*1e-9 + K4; "
     "S=SQRT((KA-KB)^2+4*K1*K3*L*I*1e-18); KF = 0.5 * (Ka + KB + S); "
     "KS = 0.5 * (KA + KB - S); DIFF=KF - KS; Q=Bmax*K1*L*1e-9/DIFF; "
     "Y=Q*(k4*DIFF/(KF*KS)+((K4-Kf)/KF)*exp(-KF*X)-((K4-KS)/KS)*exp(-KS*X))",
     ["K3", "K4", "Bmax", "K1", "K2", "L", "I"], _competitive_kinetics,
     lambda x, y, fixed: dict(_comp_kin_initials(
         [{"x": x, "y": y, "constants": fixed}])[0],
         **{k: float(fixed.get(k, 1.0)) for k in ("K1", "K2", "L", "I")}),
     transforms=[_ratio("K4", "K3", "Kd")],
     x_label="Time", y_label="Specific binding (cpm)",
     required=("K1", "K2", "L", "I"), dataset_constants=("I",),
     shared=("K3", "K4", "Bmax"), global_only=True,
     global_initials=_comp_kin_initials, initials_fixed=True)


# ============================================ Enzyme kinetics
FAM_ENZ = "Enzyme kinetics - Velocity as a function of substrate"
FAM_ENZ_INH = "Enzyme kinetics - Inhibition"

_reg("kcat", "Michaelis-Menten -- Determine kcat", FAM_ENZ,
     "Y = Et*kcat*X/(Km + X)", ["kcat", "Km", "Et"],
     lambda x, p: p["Et"] * p["kcat"] * _arr(x) / (p["Km"] + _arr(x)),
     lambda x, y, fixed: {"kcat": DataStats(x, y).ymax
                          / float(fixed.get("Et", 1.0)),
                          "Km": _x_at_ymid_pos(DataStats(x, y)),
                          "Et": float(fixed.get("Et", 1.0))},
     transforms=[Transform("Vmax", lambda p: p["Et"] * p["kcat"],
                           ("Et", "kcat"))],
     x_label="[Substrate]", y_label="Enzyme velocity", required=("Et",),
     multistart="Km", multistart_mode="x", initials_fixed=True)

_reg("allosteric_sigmoidal", "Allosteric sigmoidal", FAM_ENZ,
     "Y=Vmax*X^h/(Khalf^h + X^h)", ["Vmax", "h", "Khalf"],
     lambda x, p: p["Vmax"] * np.power(_arr(x), p["h"])
     / (np.power(p["Khalf"], p["h"]) + np.power(_arr(x), p["h"])),
     lambda x, y: {"Vmax": DataStats(x, y).ymax, "h": 1.0,
                   "Khalf": _x_at_ymid_pos(DataStats(x, y))},
     transforms=[Transform("Kprime", lambda p: p["Khalf"] ** p["h"]
                           if p["Khalf"] > 0 else math.nan,
                           ("Khalf", "h"), ci="symmetrical")],
     x_label="[Substrate]", y_label="Enzyme velocity",
     multistart="Khalf", multistart_mode="x")


def _init_substrate_inhibition(x, y):
    s = DataStats(x, y)
    xp = s.x_at_ymax if s.x_at_ymax > 0 else _geo_quantile(s, 0.5)
    return {"Vmax": 1.5 * s.ymax, "Km": xp / 4.0, "Ki": xp * 4.0}


_reg("substrate_inhibition", "Substrate inhibition", FAM_ENZ_INH,
     "Y=Vmax*X/(Km + X*(1+X/Ki))", ["Vmax", "Km", "Ki"],
     lambda x, p: p["Vmax"] * _arr(x) / (p["Km"] + _arr(x)
                                         * (1.0 + _arr(x) / p["Ki"])),
     _init_substrate_inhibition, x_label="[Substrate]",
     y_label="Enzyme velocity", multistart="Km", multistart_mode="x")


def _morrison(x, p):
    x = _arr(x)
    q = p["Ki"] * (1.0 + p["S"] / p["Km"])
    et = p["Et"]
    return p["Vo"] * (1.0 - (((et + x + q) - np.power(
        np.power(et + x + q, 2) - 4.0 * et * x, 0.5)) / (2.0 * et)))


def _init_morrison(x, y, fixed):
    s = DataStats(x, y)
    et, sub, km = (float(fixed.get(k, 1.0)) for k in ("Et", "S", "Km"))
    ic50 = _x_at_ymid_pos(s)
    ki = max(ic50 - et / 2.0, ic50 * 0.1) / (1.0 + sub / km)
    return {"Vo": s.y_at_xmin, "Ki": ki, "Et": et, "S": sub, "Km": km}


_reg("morrison_tight_binding", "Tight inhibition (Morrison equation)",
     FAM_ENZ_INH,
     "Q=(Ki*(1+(S/Km))); "
     "Y=Vo*(1-((((Et+X+Q)-(((Et+X+Q)^2)-4*Et*X)^0.5))/(2*Et)))",
     ["Vo", "Ki", "Et", "S", "Km"], _morrison, _init_morrison,
     transforms=[Transform("IC50", lambda p: p["Et"] / 2.0 + p["Ki"]
                           * (1.0 + p["S"] / p["Km"]),
                           ("Et", "Ki", "S", "Km"))],
     x_label="[Inhibitor]", y_label="Enzyme activity",
     required=("Et", "S", "Km"), multistart="Ki", multistart_mode="x",
     initials_fixed=True)


def _inhib_initials(kind):
    """Vmax and Km from the curve with the lowest inhibitor concentration
    (YMAX, X at YMID); Ki = mean of the nonzero column titles (the guide's
    "Mean of column title values" rule); Alpha = 1."""
    def initials(datasets):
        ic, vals = _control_index(datasets, "I")
        s = DataStats(datasets[ic]["x"], datasets[ic]["y"])
        nz = [v for v in vals if v > 0] or [1.0]
        d = {"Vmax": s.ymax * 1.1, "Km": _x_at_ymid_pos(s)}
        ki = float(np.mean(nz))
        if kind == "uncompetitive":
            d["AlphaKi"] = ki
        else:
            d["Ki"] = ki
        if kind == "mixed":
            d["Alpha"] = 1.0
        return [dict(d) for _ in datasets]
    return initials


def _competitive_inh(x, p):
    km_obs = p["Km"] * (1.0 + p["I"] / p["Ki"])
    return p["Vmax"] * _arr(x) / (km_obs + _arr(x))


def _noncompetitive_inh(x, p):
    vmax = p["Vmax"] / (1.0 + p["I"] / p["Ki"])
    return vmax * _arr(x) / (p["Km"] + _arr(x))


def _uncompetitive_inh(x, p):
    f = 1.0 + p["I"] / p["AlphaKi"]
    return (p["Vmax"] / f) * _arr(x) / (p["Km"] / f + _arr(x))


def _mixed_inh(x, p):
    vmax = p["Vmax"] / (1.0 + p["I"] / (p["Alpha"] * p["Ki"]))
    km = p["Km"] * (1.0 + p["I"] / p["Ki"]) / (1.0 + p["I"] / (p["Alpha"]
                                                              * p["Ki"]))
    return vmax * _arr(x) / (km + _arr(x))


for _id, _label, _eq, _params, _f, _kind in (
        ("competitive_inhibition", "Competitive inhibition",
         "KmObs=Km*(1+[I]/Ki); Y=Vmax*X/(KmObs+X)",
         ["Vmax", "Km", "Ki"], _competitive_inh, "competitive"),
        ("noncompetitive_inhibition", "Noncompetitive inhibition",
         "Vmaxinh=Vmax/(1+I/Ki); Y=Vmaxinh*X/(Km+X)",
         ["Vmax", "Km", "Ki"], _noncompetitive_inh, "noncompetitive"),
        ("uncompetitive_inhibition", "Uncompetitive inhibition",
         "VmaxApp=Vmax/(1+I/AlphaKi); KmApp=Km/(1+I/AlphaKi); "
         "Y=VmaxApp*X/(Kmapp+X)",
         ["Vmax", "Km", "AlphaKi"], _uncompetitive_inh, "uncompetitive"),
        ("mixed_model_inhibition", "Mixed model inhibition",
         "VmaxApp=Vmax/(1+I/(Alpha*Ki)); KmApp=Km*(1+I/Ki)/(1+I/(Alpha*Ki)); "
         "Y=VmaxApp*X/(KmApp + X)",
         ["Vmax", "Km", "Ki", "Alpha"], _mixed_inh, "mixed")):
    _reg(_id, _label, FAM_ENZ_INH, _eq, _params + ["I"], _f,
         (lambda k: lambda x, y, fixed: dict(_inhib_initials(k)(
             [{"x": x, "y": y, "constants": fixed}])[0],
             I=float(fixed.get("I", 0.0))))(_kind),
         x_label="[Substrate]", y_label="Enzyme velocity",
         required=("I",), dataset_constants=("I",), shared=tuple(_params),
         global_only=True, global_initials=_inhib_initials(_kind),
         initials_fixed=True)


# ============================================ Exponential
FAM_EXP = "Exponential"


def _init_plateau_decay(x, y):
    s = DataStats(x, y)
    y0, plateau = s.y_at_xmin, s.y_at_xmax
    # X0: the last X still within 10% of the span from the start plateau
    span = y0 - plateau
    x0 = s.xmin
    for xv, yv in zip(s.ux, s.uy):
        if abs(yv - y0) <= 0.1 * abs(span):
            x0 = float(xv)
        else:
            break
    return {"X0": x0, "Y0": y0, "Plateau": plateau,
            "K": LN2 / _half_time(s, y0, plateau, after=x0)}


def _plateau_decay(x, p):
    x = _arr(x)
    return np.where(x < p["X0"], p["Y0"], p["Plateau"] + (p["Y0"] - p["Plateau"])
                    * np.exp(-p["K"] * (x - p["X0"])))


_EXP_TRANSFORMS = [_half_life("K"), _tau("K"), _diff("Y0", "Plateau", "Span")]

_reg("plateau_one_phase_decay", "Plateau followed by one phase decay", FAM_EXP,
     "Y= IF( X<X0, Y0, Plateau+(Y0-Plateau)*exp(-K*(X-X0)))",
     ["X0", "Y0", "Plateau", "K"], _plateau_decay, _init_plateau_decay,
     transforms=_EXP_TRANSFORMS, x_label="Time",
     multistart="X0", multistart_mode="x")


def _plateau_assoc(x, p):
    x = _arr(x)
    return np.where(x < p["X0"], p["Y0"], p["Y0"] + (p["Plateau"] - p["Y0"])
                    * (1.0 - np.exp(-p["K"] * (x - p["X0"]))))


_reg("plateau_one_phase_association",
     "Plateau followed by one phase association", FAM_EXP,
     "Y= IF( X<X0, Y0,Y0 + (Plateau-Y0)*(1 - exp(-K*(X-X0))))",
     ["X0", "Y0", "Plateau", "K"], _plateau_assoc, _init_plateau_decay,
     transforms=[_half_life("K"), _tau("K"), _diff("Plateau", "Y0", "Span")],
     x_label="Time", multistart="X0", multistart_mode="x")


def _three_phase(x, p):
    x = _arr(x)
    span = p["Y0"] - p["Plateau"]
    return (p["Plateau"]
            + span * p["PercentFast"] * 0.01 * np.exp(-p["KFast"] * x)
            + span * (100.0 - p["PercentFast"] - p["PercentSlow"]) * 0.01
            * np.exp(-p["KMedium"] * x)
            + span * p["PercentSlow"] * 0.01 * np.exp(-p["KSlow"] * x))


def _init_three_phase(x, y):
    s = DataStats(x, y)
    t = _half_time(s, s.y_at_xmin, s.ymin)
    k = LN2 / t
    return {"Y0": s.y_at_xmin, "Plateau": s.ymin, "PercentFast": 33.3,
            "PercentSlow": 33.3, "KFast": 5.0 * k, "KMedium": k,
            "KSlow": k / 5.0}


_reg("three_phase_decay", "Three phase decay", FAM_EXP,
     "YFast=(Y0-Plateau)*PercentFast*.01*exp(-KFast*X); "
     "YSlow=(Y0-Plateau)*PercentSlow*.01*exp(-KSlow*X); "
     "YMedium=(Y0-Plateau)*(100-PercentFast - PercentSlow)*.01*exp(-Kmedium*X); "
     "Y=Plateau + YFast + YMedium +YSlow",
     ["Y0", "Plateau", "PercentFast", "PercentSlow", "KFast", "KMedium",
      "KSlow"], _three_phase, _init_three_phase,
     transforms=[_half_life("KFast", "HalfLifeFast"),
                 _half_life("KMedium", "HalfLifeMedium"),
                 _half_life("KSlow", "HalfLifeSlow")],
     x_label="Time", multistart="KFast")


def _two_phase_assoc(x, p):
    x = _arr(x)
    span = p["Plateau"] - p["Y0"]
    return (p["Y0"] + span * p["PercentFast"] * 0.01 * (1.0 - np.exp(-p["KFast"] * x))
            + span * (100.0 - p["PercentFast"]) * 0.01
            * (1.0 - np.exp(-p["KSlow"] * x)))


def _init_two_phase_assoc(x, y):
    s = DataStats(x, y)
    k = LN2 / _half_time(s, s.y_at_xmin, s.y_at_xmax)
    return {"Y0": s.y_at_xmin, "Plateau": s.y_at_xmax, "PercentFast": 50.0,
            "KFast": 3.0 * k, "KSlow": k / 3.0}


_reg("two_phase_association", "Two phase association", FAM_EXP,
     "SpanFast=(Plateau-Y0)*PercentFast*.01; "
     "SpanSlow=(Plateau-Y0)*(100-PercentFast)*.01; "
     "Y=Y0+ SpanFast*(1-exp(-KFast*X)) + SpanSlow*(1-exp(-KSlow*X))",
     ["Y0", "Plateau", "PercentFast", "KFast", "KSlow"], _two_phase_assoc,
     _init_two_phase_assoc,
     transforms=[_half_life("KFast", "HalfLifeFast"),
                 _half_life("KSlow", "HalfLifeSlow"),
                 _tau("KFast", "TauFast"), _tau("KSlow", "TauSlow"),
                 _diff("Plateau", "Y0", "Span")],
     x_label="Time", multistart="KFast")


# ============================================ Lines
FAM_LINES = "Lines"

_reg("horizontal_line", "Horizontal line", FAM_LINES, "Y = Mean + 0*X",
     ["Mean"], lambda x, p: p["Mean"] + 0.0 * _arr(x),
     lambda x, y: {"Mean": float(np.mean(y))})

_reg("line_through_origin", "Line through origin", FAM_LINES, "Y=Slope*X",
     ["Slope"], lambda x, p: p["Slope"] * _arr(x),
     lambda x, y: {"Slope": float(np.sum(_arr(x) * _arr(y))
                                  / max(np.sum(_arr(x) ** 2), 1e-300))})


def _segmental(x, p):
    x = _arr(x)
    y1 = p["Intercept1"] + p["Slope1"] * x
    y_at_x0 = p["Slope1"] * p["X0"] + p["Intercept1"]
    y2 = y_at_x0 + p["Slope2"] * (x - p["X0"])
    return np.where(x < p["X0"], y1, y2)


def _two_halves(x, y):
    s = DataStats(x, y)
    left = s.ux <= s.xmid
    right = s.ux >= s.xmid
    if left.sum() < 2:
        left = np.arange(s.ux.size) < 2
    if right.sum() < 2:
        right = np.arange(s.ux.size) >= s.ux.size - 2
    b1, a1 = np.polyfit(s.ux[left], s.uy[left], 1)
    b2, _ = np.polyfit(s.ux[right], s.uy[right], 1)
    return s, float(a1), float(b1), float(b2)


def _init_segmental(x, y):
    s, a1, b1, b2 = _two_halves(x, y)
    return {"Intercept1": a1, "Slope1": b1, "Slope2": b2, "X0": s.xmid}


_reg("segmental_linear", "Segmental linear regression", FAM_LINES,
     "Y1 = intercept1 + slope1*X; YatX0 = slope1*X0 + intercept1; "
     "Y2 = YatX0 + slope2*(X - X0); Y = IF(X<X0, Y1, Y2)",
     ["Intercept1", "Slope1", "Slope2", "X0"], _segmental, _init_segmental,
     multistart="X0", multistart_mode="x")


def _hinge(x, p):
    x = _arr(x)
    d = p["Delta"]
    return (p["Intercept"] + p["Slope1"] * (x - p["X0"])
            + (p["Slope2"] - p["Slope1"]) * d * np.logaddexp(0.0, (x - p["X0"]) / d))


def _init_hinge(x, y):
    s, a1, b1, b2 = _two_halves(x, y)
    return {"Intercept": a1 + b1 * s.xmid, "Slope1": b1, "Slope2": b2,
            "X0": s.xmid, "Delta": s.xrange / 20.0}


_reg("hinge_function",
     "Hinge function. Segmental regression lines with gentle connection",
     FAM_LINES,
     "Y= Intercept + Slope1*(X - X0) + (Slope2 - Slope1)*Delta*ln(1+exp((X-X0)/Delta))",
     ["Intercept", "Slope1", "Slope2", "X0", "Delta"], _hinge, _init_hinge,
     bounds={"Delta": (0.0, None)}, multistart="X0", multistart_mode="x")


def _polyfit_init(xt, yt, names):
    xt, yt = _arr(xt), _arr(yt)
    ok = np.isfinite(xt) & np.isfinite(yt)
    if ok.sum() >= 2 and np.ptp(xt[ok]) > 0:
        slope, icpt = np.polyfit(xt[ok], yt[ok], 1)
    else:
        slope, icpt = 1.0, 0.0
    return {names[0]: float(slope), names[1]: float(icpt)}


def _safe_log10(v):
    v = _arr(v)
    return np.where(v > 0, np.log10(np.where(v > 0, v, 1.0)), np.nan)


_reg("semilog_line_x_log", "Semilog line -- X axis is logarithmic, Y axis is linear",
     FAM_LINES, "Y=Yintercept + Slope*log(X)", ["Slope", "Yintercept"],
     lambda x, p: p["Yintercept"] + p["Slope"] * np.log10(_arr(x)),
     lambda x, y: _polyfit_init(_safe_log10(x), y, ("Slope", "Yintercept")))

_reg("semilog_line_y_log", "Semilog line -- X axis is linear, Y axis is logarithmic",
     FAM_LINES, "Y=10^(Slope*X + Yintercept)", ["Slope", "Yintercept"],
     lambda x, p: _p10(p["Slope"] * _arr(x) + p["Yintercept"]),
     lambda x, y: _polyfit_init(x, _safe_log10(y), ("Slope", "Yintercept")))

_reg("log_log_line", "Log-log line -- Both X and Y axes are logarithmic",
     FAM_LINES, "Y = 10^(slope*log(X) + Yintercept)", ["Slope", "Yintercept"],
     lambda x, p: _p10(p["Slope"] * np.log10(_arr(x)) + p["Yintercept"]),
     lambda x, y: _polyfit_init(_safe_log10(x), _safe_log10(y),
                                ("Slope", "Yintercept")))


def _crossing_initials(datasets):
    lines = []
    for d in datasets:
        xs, ys = _arr(d["x"]), _arr(d["y"])
        b, a = np.polyfit(xs, ys, 1) if np.ptp(xs) > 0 else (0.0, float(ys.mean()))
        lines.append((float(a), float(b)))
    (a1, b1), (a2, b2) = lines[0], lines[-1]
    if b1 != b2:
        xc = (a2 - a1) / (b1 - b2)
    else:
        xc = float(np.mean(np.concatenate([_arr(d["x"]) for d in datasets])))
    yc = a1 + b1 * xc
    return [{"Xcross": xc, "Ycross": yc, "Slope": b} for _, b in lines]


_reg("two_lines_crossing", "Two intersecting lines -- fit the crossing point",
     FAM_LINES, "Y= Ycross + (X - Xcross)*Slope", ["Xcross", "Ycross", "Slope"],
     lambda x, p: p["Ycross"] + (_arr(x) - p["Xcross"]) * p["Slope"],
     _single_from_global(_crossing_initials),
     shared=("Xcross", "Ycross"), global_only=True,
     global_initials=_crossing_initials)


# ============================================ Polynomial
FAM_POLY = "Polynomial"
_ORDINALS = {1: "First", 2: "Second", 3: "Third", 4: "Fourth", 5: "Fifth",
             6: "Sixth", 7: "Seventh", 8: "Eighth", 9: "Ninth", 10: "Tenth"}


def _poly_eq(order, xv="X"):
    terms = ["B0"] + [f"B1*{xv}"] + [f"B{i}*{xv}^{i}" for i in range(2, order + 1)]
    return "Y=" + " + ".join(terms[:order + 1])


def _mean_unique_x(x, y):
    return float(np.mean(np.unique(_arr(x))))


def _centered(order):
    def f(x, p):
        xc = _arr(x) - p["XMean"]
        return sum(p[f"B{i}"] * xc ** i for i in range(order + 1))
    return f


def _centered_jac(order):
    """df/dB_i = XC^i, df/dXMean = -sum i B_i XC^(i-1) (XMean is normally
    the fixed data constant)."""
    def jac(x, p):
        xc = _arr(x) - p["XMean"]
        V = np.vander(xc, order + 1, increasing=True)
        dmean = -sum(i * p[f"B{i}"] * V[:, i - 1] for i in range(1, order + 1))
        return np.column_stack([V, np.broadcast_to(dmean, xc.shape)])
    return jac


def _centered_init(order):
    def initials(x, y):
        xm = _mean_unique_x(x, y)
        coefs = np.polyfit(_arr(x) - xm, _arr(y), order)
        out = {f"B{i}": float(c) for i, c in enumerate(coefs[::-1])}
        out["XMean"] = xm
        return out
    return initials


for _order in range(1, 11):
    if _order >= 4 or _order == 1:
        _reg(f"polynomial_{_ORDINALS[_order].lower()}",
             f"{_ORDINALS[_order]} order polynomial", FAM_POLY,
             _poly_eq(_order), [f"B{i}" for i in range(_order + 1)],
             nlfit._poly_func(_order), nlfit._poly_initials(_order),
             jac=nlfit._poly_jac(_order))
    _reg(f"centered_polynomial_{_ORDINALS[_order].lower()}",
         f"Centered {_ORDINALS[_order].lower()} order polynomial", FAM_POLY,
         "XC = X - Xmean; " + _poly_eq(_order, "XC"),
         [f"B{i}" for i in range(_order + 1)] + ["XMean"],
         _centered(_order), _centered_init(_order),
         data_constants={"XMean": _mean_unique_x},
         jac=_centered_jac(_order))


# ============================================ Gaussian family
FAM_GAUSS = "Gaussian"


def _peak_width(s: DataStats, center_y, level_frac=0.5):
    """Half-width of the region where the mean Y exceeds a fraction of
    the peak (FWHM/2 for level_frac = 0.5)."""
    above = s.ux[s.uy >= s.ymin + level_frac * (center_y - s.ymin)]
    w = (float(above.max() - above.min()) / 2.0) if above.size > 1 else \
        s.xrange / 6.0
    return max(w, s.xrange / 50.0)


def _gauss(x, p):
    return p["Amplitude"] * np.exp(-0.5 * ((_arr(x) - p["Mean"]) / p["SD"]) ** 2)


def _init_gauss(x, y):
    s = DataStats(x, y)
    return {"Amplitude": s.ymax, "Mean": s.x_at_ymax,
            "SD": _peak_width(s, s.ymax) / 1.1774}


_reg("gaussian", "Gaussian distribution", FAM_GAUSS,
     "Y=Amplitude*exp(-0.5*((X-Mean)/SD)^2)", ["Amplitude", "Mean", "SD"],
     _gauss, _init_gauss,
     transforms=[Transform("Area", lambda p: p["Amplitude"] * p["SD"] * SQRT2PI,
                           ("Amplitude", "SD"), ci="symmetrical")],
     x_label="Bin center", y_label="Frequency")


def _two_peaks(s: DataStats):
    """The two highest local maxima of the distinct-X means."""
    uy = s.uy
    idx = [i for i in range(uy.size)
           if (i == 0 or uy[i] >= uy[i - 1]) and (i == uy.size - 1
                                                   or uy[i] >= uy[i + 1])]
    idx = sorted(idx, key=lambda i: -uy[i])[:2]
    if len(idx) < 2:
        idx = [int(np.argmax(uy)), int(np.argmin(np.abs(s.ux - (
            s.xmin + s.xmax - s.ux[int(np.argmax(uy))]))))]
    return sorted(idx, key=lambda i: s.ux[i])


def _init_two_gauss(width_name, center_name, width_scale):
    def initials(x, y):
        s = DataStats(x, y)
        i1, i2 = _two_peaks(s)
        w = max(abs(s.ux[i2] - s.ux[i1]) / 4.0, s.xrange / 50.0) / width_scale
        return {"Amplitude1": float(s.uy[i1]), f"{center_name}1": float(s.ux[i1]),
                f"{width_name}1": w, "Amplitude2": float(s.uy[i2]),
                f"{center_name}2": float(s.ux[i2]), f"{width_name}2": w}
    return initials


_reg("sum_two_gaussians", "Sum of two Gaussian distributions", FAM_GAUSS,
     "One=Amplitude1*exp(-0.5*((X-Mean1)/SD1)^2); "
     "Two=Amplitude2*exp(-0.5*((X-Mean2)/SD2)^2); Y= One + Two",
     ["Amplitude1", "Mean1", "SD1", "Amplitude2", "Mean2", "SD2"],
     lambda x, p: _gauss(x, {"Amplitude": p["Amplitude1"], "Mean": p["Mean1"],
                             "SD": p["SD1"]})
     + _gauss(x, {"Amplitude": p["Amplitude2"], "Mean": p["Mean2"],
                  "SD": p["SD2"]}),
     _init_two_gauss("SD", "Mean", 1.0),
     x_label="Bin center", y_label="Frequency")


def _lognormal(x, p):
    x = _arr(x)
    return (p["A"] / x) * np.exp(-0.5 * (np.log(x / p["GeoMean"])
                                         / np.log(p["GeoSD"])) ** 2)


def _init_lognormal(x, y):
    s = DataStats(x, y)
    gm = s.x_at_ymax if s.x_at_ymax > 0 else _geo_quantile(s, 0.5)
    pos = s.ux > 0
    lx = np.log(s.ux[pos])
    w = s.uy[pos] * s.ux[pos]  # Y*X is Gaussian in ln(X)
    if w.sum() > 0 and lx.size > 2:
        m = float(np.sum(w * lx) / np.sum(w))
        sd = float(math.sqrt(max(np.sum(w * (lx - m) ** 2) / np.sum(w), 1e-6)))
        gm = math.exp(m)
    else:
        sd = 0.5
    gsd = math.exp(max(sd, 0.05))
    amp = s.ymax
    return {"A": amp * gm / math.exp(0.5 * math.log(gsd) ** 2),
            "GeoMean": gm, "GeoSD": gsd}


_reg("lognormal", "Lognormal distribution", FAM_GAUSS,
     "Y=(A/X)*exp(-0.5*(ln(X/GeoMean)/ln(GeoSD))^2)", ["A", "GeoMean", "GeoSD"],
     _lognormal, _init_lognormal,
     transforms=[Transform("Amplitude", lambda p: p["A"] / (
         p["GeoMean"] / math.exp(0.5 * math.log(p["GeoSD"]) ** 2)),
         ("A", "GeoMean", "GeoSD"), ci="symmetrical"),
         Transform("Area", lambda p: p["A"] * SQRT2PI * math.log(p["GeoSD"]),
                   ("A", "GeoSD"), ci="symmetrical")],
     x_label="Bin center", y_label="Frequency")


def _cum_gauss(top):
    def f(x, p):
        t = p["N"] if top is None else top
        return t * stats.norm.cdf((_arr(x) - p["Mean"]) / p["SD"])
    return f


def _init_cum_gauss(top):
    def initials(x, y, fixed):
        s = DataStats(x, y)
        t = float(fixed.get("N", s.ymax)) if top is None else top
        m = s.x_at_level(0.5 * t)
        q16 = s.x_at_level(0.1587 * t)
        q84 = s.x_at_level(0.8413 * t)
        sd = (q84 - q16) / 2.0
        out = {"Mean": m, "SD": sd if sd > 0 else s.xrange / 4.0}
        if top is None:
            out["N"] = t
        return out
    return initials


for _id, _lbl, _top, _eqtop in (
        ("cumulative_gaussian_percent", "Cumulative Gaussian -- Y values are percentages", 100.0, "Top=100"),
        ("cumulative_gaussian_fraction", "Cumulative Gaussian -- Y values are fractions", 1.0, "Top=1.0"),
        ("cumulative_gaussian_count", "Cumulative Gaussian -- Y values are counts", None, None)):
    _reg(_id, _lbl, FAM_GAUSS,
         (f"{_eqtop}; z=(X-Mean)/SD; Y=Top * zdist(z)" if _eqtop
          else "z=(X-Mean)/SD; Y=N * zdist(z)"),
         ["Mean", "SD"] + (["N"] if _top is None else []),
         _cum_gauss(_top), _init_cum_gauss(_top),
         x_label="Value", y_label="Cumulative frequency",
         required=("N",) if _top is None else (), initials_fixed=True)


def _lorentz(x, p):
    return p["Amplitude"] / (1.0 + ((_arr(x) - p["Center"]) / p["Width"]) ** 2)


_reg("lorentzian", "Lorentzian distribution", FAM_GAUSS,
     "Y=Amplitude/(1+((X-Center)/Width)^2)", ["Amplitude", "Center", "Width"],
     _lorentz,
     lambda x, y: {"Amplitude": DataStats(x, y).ymax,
                   "Center": DataStats(x, y).x_at_ymax,
                   "Width": _peak_width(DataStats(x, y), DataStats(x, y).ymax)},
     x_label="Bin center", y_label="Frequency")

_reg("sum_two_lorentzians", "Sum of two Lorentzian distributions", FAM_GAUSS,
     "One=Amplitude1/(1+((X-Center1)/Width1)^2); "
     "Two=Amplitude2/(1+((X-Center2)/Width2)^2); Y=One + Two",
     ["Amplitude1", "Center1", "Width1", "Amplitude2", "Center2", "Width2"],
     lambda x, p: _lorentz(x, {"Amplitude": p["Amplitude1"],
                               "Center": p["Center1"], "Width": p["Width1"]})
     + _lorentz(x, {"Amplitude": p["Amplitude2"], "Center": p["Center2"],
                    "Width": p["Width2"]}),
     _init_two_gauss("Width", "Center", 1.0),
     x_label="Bin center", y_label="Frequency")


# ============================================ Sine waves
FAM_SINE = "Sine waves"


def _count_peaks(uy):
    return sum(1 for i in range(1, uy.size - 1)
               if uy[i] > uy[i - 1] and uy[i] >= uy[i + 1])


def _sine_init(x, y, baseline, damped):
    """Wavelength: the guide's hint 1/(NumberOfPeaks/(b-a)) is one
    candidate; a grid of wavelengths is also scored by linear least
    squares of Y on sin/cos (plus a constant for the baseline form), which
    gives Amplitude and PhaseShift for each candidate directly."""
    s = DataStats(x, y)
    xa, ya = s.x, s.y
    peaks = _count_peaks(s.uy)
    cands = [s.xrange / peaks] if peaks else []
    dx = np.min(np.diff(s.ux)) if s.ux.size > 1 else s.xrange
    lo = max(2.0 * dx, s.xrange / 200.0)
    cands += list(np.geomspace(lo, 2.0 * s.xrange, 160))
    best = None
    for w in cands:
        cols = [np.sin(2 * np.pi * xa / w), np.cos(2 * np.pi * xa / w)]
        if baseline:
            cols.append(np.ones_like(xa))
        A = np.column_stack(cols)
        coef, *_ = np.linalg.lstsq(A, ya, rcond=None)
        sse = float(np.sum((ya - A @ coef) ** 2))
        if best is None or sse < best[0]:
            best = (sse, w, coef)
    _, w, coef = best
    a, b = coef[0], coef[1]
    out = {"Amplitude": float(math.hypot(a, b)), "Wavelength": float(w),
           "PhaseShift": float(math.atan2(b, a))}
    if baseline:
        out["Baseline"] = float(coef[2])
    if damped:
        out["K"] = 0.1 / s.xrange
    return out


_reg("sine_wave", "Standard sine wave", FAM_SINE,
     "Y= Amplitude*sin((2*pi*X/Wavelength)+PhaseShift)",
     ["Amplitude", "Wavelength", "PhaseShift"],
     lambda x, p: p["Amplitude"] * np.sin(2 * np.pi * _arr(x) / p["Wavelength"]
                                          + p["PhaseShift"]),
     lambda x, y: _sine_init(x, y, False, False),
     transforms=[_tau("Wavelength", "Frequency")], x_label="Time")

_reg("damped_sine_wave", "Damped sine wave", FAM_SINE,
     "Y= Amplitude*exp(-K*X)*sin((2*pi*X/Wavelength)+PhaseShift)",
     ["Amplitude", "Wavelength", "PhaseShift", "K"],
     lambda x, p: p["Amplitude"] * np.exp(-p["K"] * _arr(x)) * np.sin(
         2 * np.pi * _arr(x) / p["Wavelength"] + p["PhaseShift"]),
     lambda x, y: _sine_init(x, y, False, True),
     transforms=[_tau("Wavelength", "Frequency"), _half_life("K")],
     x_label="Time")


def _sinc(x, p):
    x = _arr(x)
    z = 2 * np.pi * x / p["Wavelength"]
    safe = np.where(x == 0, 1.0, z)
    return np.where(x == 0, p["Amplitude"], p["Amplitude"] * np.sin(safe) / safe)


def _init_sinc(x, y):
    s = DataStats(x, y)
    i0 = int(np.argmin(np.abs(s.ux)))
    amp = float(s.uy[i0])
    # first zero crossing to the right of the centre is at X = W/2
    w = s.xrange / 2.0
    for i in range(i0, s.ux.size - 1):
        if s.uy[i] * s.uy[i + 1] <= 0 and s.ux[i + 1] != s.ux[i0]:
            xz = _interp_at(s.ux[i], s.uy[i], s.ux[i + 1], s.uy[i + 1], 0.0)
            w = 2.0 * abs(xz - s.ux[i0]) if xz != s.ux[i0] else w
            break
    return {"Amplitude": amp, "Wavelength": w}


_reg("sinc_wave", "Sinc() function", FAM_SINE,
     "Y=IF(X=0,Amplitude,Amplitude*sin(2*pi*X/Wavelength)/(2*pi*X/Wavelength) )",
     ["Amplitude", "Wavelength"], _sinc, _init_sinc,
     transforms=[_tau("Wavelength", "Frequency")])

_reg("sine_wave_baseline", "Sine wave with nonzero baseline", FAM_SINE,
     "Y= Amplitude*sin((2*pi*X/Wavelength)+PhaseShift) + Baseline",
     ["Amplitude", "Wavelength", "PhaseShift", "Baseline"],
     lambda x, p: p["Amplitude"] * np.sin(2 * np.pi * _arr(x) / p["Wavelength"]
                                          + p["PhaseShift"]) + p["Baseline"],
     lambda x, y: _sine_init(x, y, True, False),
     transforms=[_tau("Wavelength", "Frequency")], x_label="Time")


# ============================================ Growth equations
FAM_GROWTH = "Growth equations"

_reg("log_exponential_growth", "log of exponential growth", FAM_GROWTH,
     "Y=logY0 + k*X", ["LogY0", "K"],
     lambda x, p: p["LogY0"] + p["K"] * _arr(x),
     lambda x, y: _polyfit_init(x, y, ("K", "LogY0")),
     transforms=[_half_life("K", "DoublingTime")], x_label="Time",
     y_label="ln(Population)")


def _growth_init(x, y):
    s = DataStats(x, y)
    y0 = s.y_at_xmin if s.y_at_xmin > 0 else max(s.ymin, 1e-6 * s.ymax)
    ym = s.y_at_xmax * 1.05 if s.y_at_xmax > 0 else s.ymax
    return {"Y0": y0, "YM": ym,
            "K": LN2 / _half_time(s, s.y_at_xmin, s.y_at_xmax) * 0.5}


_reg("logistic_growth", "Logistic growth", FAM_GROWTH,
     "Y=YM*Y0/((YM-Y0)*exp(-k*x) +Y0)", ["Y0", "YM", "K"],
     lambda x, p: p["YM"] * p["Y0"] / ((p["YM"] - p["Y0"])
                                       * np.exp(-p["K"] * _arr(x)) + p["Y0"]),
     _growth_init, x_label="Time", y_label="Population", multistart="K")

_reg("gompertz_growth", "Gompertz growth", FAM_GROWTH,
     "Y = YM*(Y0/YM)^(exp(-K*X))", ["Y0", "YM", "K"],
     lambda x, p: p["YM"] * np.power(p["Y0"] / p["YM"], np.exp(-p["K"] * _arr(x))),
     _growth_init, x_label="Time", y_label="Population", multistart="K")

_reg("exponential_plateau", "Exponential plateau", FAM_GROWTH,
     "Y=YM -(YM-Y0)*exp(-k*x)", ["Y0", "YM", "K"],
     lambda x, p: p["YM"] - (p["YM"] - p["Y0"]) * np.exp(-p["K"] * _arr(x)),
     lambda x, y: {"Y0": DataStats(x, y).y_at_xmin,
                   "YM": DataStats(x, y).y_at_xmax,
                   "K": LN2 / _half_time(DataStats(x, y),
                                         DataStats(x, y).y_at_xmin,
                                         DataStats(x, y).y_at_xmax)},
     x_label="Time", y_label="Population", multistart="K")


def _beta_growth(x, p):
    x = _arr(x)
    te, tm = p["Te"], p["Tm"]
    return p["Ym"] * (1.0 + (te - x) / (te - tm)) * np.power(x / te, te / (te - tm))


_reg("beta_growth_decline", "Beta growth and decline", FAM_GROWTH,
     "Y=Ym*(1+ (Te - X)/(Te - Tm))*(X/Te)^(Te/(Te-Tm))", ["Ym", "Te", "Tm"],
     _beta_growth,
     lambda x, y: {"Ym": DataStats(x, y).ymax, "Te": DataStats(x, y).x_at_ymax,
                   "Tm": DataStats(x, y).x_at_ymax / 2.0},
     x_label="Time", y_label="Population")


# ============================================ Linear-quadratic
FAM_LQ = "Linear-quadratic model of cell death by radiation"


def _lq_init(scale_from, dead):
    """A and B by linear regression of -ln(surviving fraction) on X and X^2
    (through the origin); Y0 for the count forms from the data."""
    def initials(x, y):
        s = DataStats(x, y)
        x_, y_ = _arr(x), _arr(y)
        if scale_from == "data":
            y0 = s.y_at_xmin if not dead else s.ymax / 0.9
        else:
            y0 = scale_from
        frac = (1.0 - y_ / y0) if dead else y_ / y0
        ok = (frac > 0) & (frac < 1.0 + 1e-9) & np.isfinite(frac)
        if ok.sum() >= 2:
            A = np.column_stack([x_[ok], x_[ok] ** 2])
            coef, *_ = np.linalg.lstsq(A, -np.log(np.clip(frac[ok], 1e-300, None)),
                                       rcond=None)
            a, b = float(coef[0]), float(coef[1])
        else:
            a, b = 1.0 / s.xrange, 0.0
        out = {"A": a, "B": b}
        if scale_from == "data":
            out["Y0"] = y0
        return out
    return initials


def _lq(scale, dead):
    def f(x, p):
        x = _arr(x)
        surv = np.exp(-1.0 * (p["A"] * x + p["B"] * x ** 2))
        k = p["Y0"] if scale is None else scale
        return k * ((1.0 - surv) if dead else surv)
    return f


for _id, _lbl, _scale, _dead, _eq in (
        ("lq_fraction_surviving", "Linear quadratic: Y is fraction surviving", 1.0, False,
         "Y = exp(-1*(A*X + B*X^2))"),
        ("lq_percent_surviving", "Linear quadratic: Y is percentage surviving", 100.0, False,
         "Y = 100 * exp(-1*(A*X + B*X^2))"),
        ("lq_number_surviving", "Linear quadratic: Y is number of cells surviving", None, False,
         "Y = Y0 * exp(-1*(A*X + B*X^2))"),
        ("lq_fraction_dead", "Linear quadratic: Y is fraction dead", 1.0, True,
         "Y = 1.0 - exp(-1*(A*X + B*X^2))"),
        ("lq_percent_dead", "Linear quadratic: Y is percentage dead", 100.0, True,
         "Y = 100 * [ 1.0 -exp(-1*(A*X + B*X^2))]"),
        ("lq_number_dead", "Linear quadratic: Y is number of cells dead", None, True,
         "Y = Y0 * [1.0 - exp(-1*(A*X + B*X^2))]")):
    _reg(_id, _lbl, FAM_LQ, _eq, ["A", "B"] + (["Y0"] if _scale is None else []),
         _lq(_scale, _dead),
         _lq_init("data" if _scale is None else _scale, _dead),
         x_label="Dose", y_label="Survival" if not _dead else "Dead")


# ============================================ Classic equations
FAM_CLASSIC = "Classic equations"


def _init_boltzmann(x, y):
    s = DataStats(x, y)
    return {"Bottom": s.ymin, "Top": s.ymax, "V50": s.x_at_ymid,
            "Slope": s.sign * s.xrange / 10.0}


_reg("boltzmann_sigmoid", "Boltzmann sigmoid", FAM_CLASSIC,
     "Y=Bottom + (Top-Bottom)/(1+exp((V50-X)/Slope))",
     ["Bottom", "Top", "V50", "Slope"],
     lambda x, p: p["Bottom"] + (p["Top"] - p["Bottom"])
     / (1.0 + np.exp((p["V50"] - _arr(x)) / p["Slope"])),
     _init_boltzmann, x_label="Potential", y_label="Conductance",
     multistart="V50", multistart_mode="x")

_reg("power_series", "Power series", FAM_CLASSIC, "Y=A*X^B + C*X^D",
     ["A", "B", "C", "D"],
     lambda x, p: p["A"] * np.power(_arr(x), p["B"])
     + p["C"] * np.power(_arr(x), p["D"]),
     lambda x, y: {"A": 1.0, "B": 1.0, "C": 1.0, "D": 1.0})


# ============================================ global fitting

def _scope_owners(spec, name, n):
    scope = (spec.param_scope or {}).get(name)
    if callable(scope):  # user equations: data sets whose lines use it
        return [i for i in range(n) if scope(i)]
    if scope == "first":
        return [0]
    if scope == "rest":
        return list(range(1, n))
    return list(range(n))


def fit_global_model(datasets, model: str, *, shared=None, constraints=None,
                     weighting: str = "none", initial=None) -> dict:
    """Global fit of one registered model to several data sets.

    datasets: [{"name", "x", "y", "constants": {name: value}}]; the
    constants supply each data set's column constants (spec.dataset_
    constants, e.g. I for enzyme inhibition, B for Gaddum/Schild).
    shared: parameter names with one value for all data sets (default:
    the model's documented shared set). constraints: {name: value} fixed
    for every data set. Parameters scoped to the first data set (<A>) or
    to the others (<~A>) are fitted only where they appear.

    Statistics are those of one pooled fit (curve-fitting guide, "Global
    nonlinear regression"): df = N_total - number of fitted parameters,
    asymptotic SEs from the joint covariance, t-based 95% CIs. Weighting
    by 1/Y or 1/Y^2 iterates the weights from the predicted curve as in
    nlfit._ols_fit.
    """
    if model not in nlfit.MODELS:
        raise ValueError(f"unknown model: {model}")
    spec = nlfit.MODELS[model]
    if weighting not in ("none", "1/Y", "1/Y2", "1/X", "1/X2"):
        raise ValueError(f"unknown weighting: {weighting}")
    shared = list(spec.shared if shared is None else shared)
    constraints = {k: float(v) for k, v in (constraints or {}).items()}
    for name in list(shared) + list(constraints):
        if name not in spec.params:
            raise ValueError(f"unknown parameter for {model}: {name}")
    n = len(datasets)
    if n < 1:
        raise ValueError("global fit needs at least one data set")

    data = []
    for i, ds in enumerate(datasets):
        x, y = nlfit._clean_xy(ds["x"], ds["y"])
        if x.size == 0:
            raise ValueError(f"data set {ds.get('name', i + 1)!r} has no data")
        consts = {}
        given = ds.get("constants") or {}
        for c in spec.dataset_constants:
            if c in constraints:
                consts[c] = constraints[c]
            elif c in given and given[c] is not None:
                consts[c] = float(given[c])
            else:
                raise ValueError(
                    f"{spec.label} needs the data-set constant {c} for "
                    f"data set {ds.get('name', i + 1)!r} (its column title)")
        for name, rule in (spec.data_constants or {}).items():
            if name not in constraints:
                consts[name] = float(rule(x, y))
        data.append({"name": ds.get("name", ""), "x": x, "y": y,
                     "constants": consts})
    missing = [c for c in spec.required_constants
               if c not in constraints and c not in spec.dataset_constants]
    if missing:
        raise ValueError(f"{spec.label} needs experimental constants set via "
                         "constraints: " + ", ".join(missing))

    layout = []  # (param, owner index or None when shared, owners)
    for p in spec.params:
        if p in constraints or p in spec.dataset_constants \
                or p in (spec.data_constants or {}):
            continue
        owners = _scope_owners(spec, p, n)
        if not owners:
            continue
        if p in shared:
            layout.append((p, None, tuple(owners)))
        else:
            layout.extend((p, i, (i,)) for i in owners)
    n_total = sum(d["x"].size for d in data)
    df = n_total - len(layout)
    if df < 1:
        raise ValueError(f"not enough data points ({n_total}) for "
                         f"{len(layout)} fitted parameters")

    def params_for(theta, i):
        p = dict(constraints)
        p.update(data[i]["constants"])
        p["_dataset"] = i
        for (name, _, owners), v in zip(layout, theta):
            if i in owners:
                p[name] = float(v)
        return p

    # initial values
    if spec.global_initials is not None:
        inits = spec.global_initials([{"x": d["x"], "y": d["y"],
                                       "constants": dict(d["constants"],
                                                         **constraints)}
                                      for d in data])
    else:
        inits = []
        for d in data:
            fixed = dict(constraints, **d["constants"])
            inits.append(spec.initials(d["x"], d["y"], fixed)
                         if spec.initials_fixed
                         else spec.initials(d["x"], d["y"]))
    theta0 = []
    for name, owner, owners in layout:
        if initial and name in initial:
            theta0.append(float(initial[name]))
        elif owner is None:
            theta0.append(float(np.mean([inits[i][name] for i in owners])))
        else:
            theta0.append(float(inits[owner][name]))

    bounds = spec.bounds or {}
    box = None
    if any(name in bounds for name, _, _ in layout):
        lo = np.array([(bounds.get(nm, (None, None))[0]) for nm, _, _ in layout],
                      dtype=float)
        hi = np.array([(bounds.get(nm, (None, None))[1]) for nm, _, _ in layout],
                      dtype=float)
        box = (np.where(np.isnan(lo), -np.inf, lo), np.where(np.isnan(hi), np.inf, hi))

    def predict(theta):
        return [spec.func(d["x"], params_for(theta, i)) for i, d in enumerate(data)]

    def weights(theta):
        out = []
        for i, d in enumerate(data):
            if weighting in ("1/Y", "1/Y2"):
                base = spec.func(d["x"], params_for(theta, i))
            else:
                base = d["x"]
            out.append(nlfit._weights(d["x"], base, weighting))
        return out

    all_x = np.concatenate([d["x"] for d in data])
    all_y = np.concatenate([d["y"] for d in data])
    names = [nm for nm, _, _ in layout]
    roles = getattr(spec, "param_roles", None)

    def solve(theta_start, wts, floor):
        sw = [np.sqrt(w) for w in wts]

        def resid(theta):
            return np.concatenate([(d["y"] - spec.func(d["x"], params_for(theta, i)))
                                   * sw[i] for i, d in enumerate(data)])
        start = (theta_start if box is None
                 else nlfit._inside(theta_start, box))
        with np.errstate(all="ignore"):
            res = lsq.solve(resid, start, floor, box=box, max_nfev=40000)
        if not res.success and res.status <= 0:
            raise RuntimeError("did not converge")
        res.wresid = resid
        res.floor = floor
        return res

    def run(start):
        # finite-difference scales (lsq module docstring)
        floor = lsq.scale_floor(names, start, all_x, all_y, roles)
        if weighting in ("1/Y", "1/Y2"):
            res = solve(start, [np.ones_like(d["x"]) for d in data], floor)
            prev = res.x
            for _ in range(60):
                res = solve(prev, weights(prev), floor)
                if lsq.same_point(res.x, prev, floor):
                    break
                prev = res.x
            return res
        return solve(start, weights(start), floor)

    starts = [np.array(theta0, dtype=float)]
    ms = spec.multistart
    if ms and any(nm == ms for nm, _, _ in layout):
        allx = np.unique(np.concatenate([d["x"] for d in data]))
        for v in allx:
            seed = v if spec.multistart_mode == "x" else abs(3.0 / max(abs(v), 1e-9))
            st = np.array(theta0, dtype=float)
            for j, (nm, _, _) in enumerate(layout):
                if nm == ms:
                    st[j] = seed
            starts.append(st)
    best = None
    for st in starts:
        try:
            res = run(st)
        except (RuntimeError, ValueError):
            continue
        if not np.all(np.isfinite(res.x)):
            continue
        if best is None or 2 * res.cost < 2 * best.cost - 1e-12:
            best = res
    if best is None:
        raise ValueError("global fit did not converge from any starting value")
    # polish the best start (final frozen weights) and build the
    # covariance from the scale-aware central-difference Jacobian
    with np.errstate(all="ignore"):
        theta, J = lsq.polish(best.wresid, best.x, best.floor, box=box)
        f = best.wresid(theta)
    wss = float(f @ f)
    s2 = wss / df
    cov = lsq.covariance(J, s2)
    se_vec = np.sqrt(np.clip(np.diag(cov), 0.0, None))
    tcrit = float(stats.t.ppf(0.975, df))

    per = []
    ss_total = 0.0
    for i, d in enumerate(data):
        fitted = params_for(theta, i)
        params, free_names, index, ci_map = {}, [], {}, {}
        for j, (name, owner, owners) in enumerate(layout):
            if i not in owners:
                continue
            v, se = float(theta[j]), float(se_vec[j])
            ci = [v - tcrit * se, v + tcrit * se]
            params[name] = {"value": v, "se": se, "ci95": ci,
                            "constrained": False, "shared": owner is None}
            free_names.append(name)
            index[name] = j
            ci_map[name] = tuple(ci)
        for name in spec.params:
            if name in params:
                continue
            if name in constraints or name in d["constants"]:
                params[name] = {"value": float(fitted[name]), "se": None,
                                "ci95": None, "constrained": True,
                                "shared": False,
                                "dataset_constant": name in d["constants"]}
        order = [nm for nm in spec.params if nm in params]
        derived = nlfit.transform_entries(
            spec.transforms, fitted, free_names, cov, ci_map, tcrit,
            "asymptotic", curve=spec.func, x=d["x"], cov_index=index)
        for dname, entry in derived.items():
            used = [t for t in spec.transforms if t.name == dname][0].params
            if any(u not in fitted for u in used):
                continue
            entry["shared"] = all(index.get(u) is not None
                                  and layout[index[u]][1] is None
                                  for u in used if u in index)
            params[dname] = entry
            order.append(dname)
        if "Top" in params and "Bottom" in params:
            span = fitted["Top"] - fitted["Bottom"]
            entry = {"value": span, "se": None, "ci95": None,
                     "constrained": False, "derived": True}
            it, ib = index.get("Top"), index.get("Bottom")
            if it is not None and ib is not None:
                var = cov[it, it] + cov[ib, ib] - 2 * cov[it, ib]
                if var >= 0 and math.isfinite(var):
                    entry["se"] = math.sqrt(var)
                    entry["ci95"] = [span - tcrit * entry["se"],
                                     span + tcrit * entry["se"]]
            params["Span"] = entry
            order.append("Span")
        yhat = spec.func(d["x"], fitted)
        ss = float(np.sum((d["y"] - yhat) ** 2))
        ss_total += ss
        ss_tot = float(np.sum((d["y"] - d["y"].mean()) ** 2))
        fv = {k: v for k, v in fitted.items() if k != "_dataset"}
        per.append({"name": d["name"], "params": params, "param_order": order,
                    "fitted_values": fv, "constants": dict(d["constants"]),
                    "ss_res": ss,
                    "r_squared": 1 - ss / ss_tot if ss_tot > 0 else None,
                    "n_points": int(d["x"].size)})

    shared_out = sorted({name for name, owner, _ in layout if owner is None},
                        key=spec.params.index)
    return {
        "model": model,
        "label": spec.label,
        "equation": spec.equation,
        "x_is_log": spec.x_is_log,
        "shared": shared_out,
        "datasets": per,
        "goodness": {"df": df, "n_points": n_total,
                     "ss_res": ss_total,
                     "ss_res_weighted": wss if weighting != "none" else None,
                     "sy_x": math.sqrt(wss / df)},
        "weighting": weighting,
        "_cov": {"layout": [[nm, owner] for nm, owner, _ in layout],
                 "matrix": cov.tolist()},
    }


def global_curve(model: str, entry: dict, index: int, xs) -> list:
    """Fitted curve of data set `index` of a fit_global_model result."""
    spec = nlfit.MODELS[model]
    p = dict(entry["fitted_values"], _dataset=index)
    with np.errstate(all="ignore"):
        ys = spec.func(_arr(xs), p)
    return [float(v) if np.isfinite(v) else None for v in np.broadcast_to(
        ys, np.shape(xs))]
