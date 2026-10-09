"""Incomplete-curve flags for dose-response fits.

An EC50/IC50 is only measured when the tested concentrations bracket it
and both plateaus are defined by the data. The GraphPad curve-fitting
guide says so in "Incomplete dose-response curves" / "Dose-response
curves: when the plateaus are not defined" (fix or constrain Top or
Bottom, or treat the EC50 as an extrapolation), and its "Interpreting
the extrapolated EC50" advice is to report an EC50 beyond the data as
greater (or less) than the highest (lowest) concentration tested rather
than as a number. Motulsky & Christopoulos (2004), Fitting Models to
Biological Data Using Linear and Nonlinear Regression, ch. 38 ("Fitting
an incomplete curve"), make the same point, as do the assay guidance
notes of Sebaugh (2011, Pharm Stat 10:128, "Guidelines for accurate
EC50/IC50 estimation": at least two concentrations beyond each plateau's
lower/upper bound and a CI-based check of each asymptote).

range_flags() never changes a fitted number; it reads the fit and the
tested X values and returns:

- x_min_tested / x_max_tested: the tested X range in the fit's X units
  (log10 concentration for log-X models), x_units, and the same range in
  concentration units (range_conc);
- ec50_in_range / ec50_above_range / ec50_below_range: where the fitted
  midpoint (LogEC50 / LogIC50 / EC50 / IC50) lies relative to that range;
- top_defined / bottom_defined: the plateau was constrained (or is fixed
  by the model, e.g. normalised-response models), or its CI is finite and
  narrower than 10 x the observed response range (max Y - min Y): a
  plateau whose CI is wider than ten response ranges is not determined by
  the data (the rule of thumb of this engine, stated so the user can
  judge it; Sebaugh 2011 uses the asymptote CI the same way);
- crosses_half: the observed means at the tested X values lie on both
  sides of the midpoint between the fitted Top and Bottom (the data
  actually reach the half-maximal response);
- report_as: "> 30" (midpoint above the range) or "< 0.1" (below), the
  tested concentration in original units (10**x for log-X fits), else
  None; report_relation/report_value carry the same as data.
"""

from __future__ import annotations

import math

import numpy as np

MIDPOINT_NAMES = ("LogEC50", "LogIC50", "LogXmid", "EC50", "IC50")
PLATEAU_FACTOR = 10.0


def _fmt(v: float) -> str:
    s = f"{v:.4g}"
    if "e" in s:
        mant, exp = s.split("e")
        s = f"{mant}e{int(exp)}"
    return s


def _defined(entry, response_range):
    """(defined, why) for a plateau parameter entry."""
    if entry is None:
        return True, "fixed by the model (normalized response)"
    if entry.get("constrained"):
        return True, "constrained"
    ci = entry.get("ci95")
    if not ci or ci[0] is None or ci[1] is None:
        return False, "no confidence interval (the fit cannot determine it)"
    lo, hi = float(ci[0]), float(ci[1])
    if not (math.isfinite(lo) and math.isfinite(hi)):
        return False, "confidence interval not finite"
    width = hi - lo
    if response_range > 0 and width >= PLATEAU_FACTOR * response_range:
        return False, (f"confidence interval width {width:.4g} is at least "
                       f"{PLATEAU_FACTOR:g} x the observed response range "
                       f"{response_range:.4g}")
    return True, "confidence interval finite and narrow enough"


def range_flags(params: dict, xs, ys, *, x_is_log: bool) -> dict | None:
    """Flags for one fitted curve. params: the fit's parameter dict
    ({name: {value, ci95, constrained}}); xs/ys: the fitted points (X in
    the fit's units). Returns None when the model has no single midpoint
    parameter (EC50/IC50)."""
    name = next((n for n in MIDPOINT_NAMES if n in params), None)
    if name is None:
        return None
    xs = np.asarray([float(v) for v in xs], dtype=float)
    ys = np.asarray([float(v) for v in ys], dtype=float)
    ok = np.isfinite(xs) & np.isfinite(ys)
    xs, ys = xs[ok], ys[ok]
    if xs.size == 0:
        return None
    mid_is_log = name.startswith("Log")
    lo, hi = float(xs.min()), float(xs.max())
    # 12 significant digits undo the log10 round trip (10**log10(30) =
    # 29.999999999999996) without touching real precision
    to_conc = ((lambda v: float(f"{10.0 ** v:.12g}")) if x_is_log
               else (lambda v: v))
    # the midpoint in the fit's X units
    mid = params[name].get("value")
    if mid is not None and mid_is_log and not x_is_log:
        mid = 10.0 ** mid
    elif mid is not None and not mid_is_log and x_is_log:
        mid = math.log10(mid) if mid > 0 else None
    mid = float(mid) if mid is not None and math.isfinite(mid) else None
    label = "IC50" if "IC50" in name else "EC50"

    above = mid is not None and mid > hi
    below = mid is not None and mid < lo
    inside = mid is not None and not above and not below

    response_range = float(ys.max() - ys.min())
    top, bottom = params.get("Top"), params.get("Bottom")
    top_def, top_why = _defined(top, response_range)
    bot_def, bot_why = _defined(bottom, response_range)

    top_v = top["value"] if top is not None else 100.0
    bot_v = bottom["value"] if bottom is not None else 0.0
    half = (float(top_v) + float(bot_v)) / 2.0
    means = [float(ys[xs == u].mean()) for u in np.unique(xs)]
    crosses = bool(min(means) <= half <= max(means)) if means else False

    relation = value = report = None
    if above:
        relation, value = ">", to_conc(hi)
    elif below:
        relation, value = "<", to_conc(lo)
    if relation:
        report = f"{relation} {_fmt(value)}"
    notes = []
    if above or below:
        notes.append(
            f"The {label} lies {'above' if above else 'below'} the "
            "concentrations tested: report it as "
            f"{label} {report} (not reached in the range tested), not as "
            "the extrapolated number.")
    if not top_def:
        notes.append(f"Top plateau not defined by the data ({top_why}).")
    if not bot_def:
        notes.append(f"Bottom plateau not defined by the data ({bot_why}).")
    if not crosses:
        notes.append("The observed means never cross the half-way response "
                     "between the fitted Top and Bottom.")
    return {
        "midpoint_param": name, "label": label,
        "midpoint": mid,
        "x_units": "log10" if x_is_log else "linear",
        "x_min_tested": lo, "x_max_tested": hi,
        "range_conc": [to_conc(lo), to_conc(hi)],
        "ec50_in_range": bool(inside), "ec50_above_range": bool(above),
        "ec50_below_range": bool(below),
        "top_defined": bool(top_def), "top_reason": top_why,
        "bottom_defined": bool(bot_def), "bottom_reason": bot_why,
        "half_response": half, "crosses_half": crosses,
        "report_as": report, "report_relation": relation,
        "report_value": value,
        "plateau_rule": (f"defined = constrained, or CI finite and narrower "
                         f"than {PLATEAU_FACTOR:g} x the observed response "
                         "range"),
        "notes": notes,
    }
