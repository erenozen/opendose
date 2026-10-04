"""Standard-curve assays (ELISA, ligand-binding, colorimetric): fit,
back-calculation QC, quantification range and dilution-corrected
unknowns.

Method sources:
- GraphPad Prism curve-fitting guide, "Interpolating from a standard
  curve" and "Analyzing ELISA / RIA data": fit the standards (4PL with
  X = log(concentration) by default, 5PL for reproducible asymmetry),
  read unknown concentrations off the curve, back-transform log X, and
  multiply by the dilution factor. The confidence interval of an
  interpolated X is where the curve's confidence band crosses the
  unknown's Y (as interpolate.absolute_ic50). The fits run through nlfit (weighting by
  1/Y or 1/Y^2 of the predicted curve, as there) and the interpolation
  through interpolate.interpolate_x (first crossing within the data
  range extended by half that range each way).
- ICH M10 (2022) "Bioanalytical method validation and study sample
  analysis", ligand-binding assays, section 4.2.3 (calibration curve
  and range) and 4.3.2 (run acceptance): "The accuracy and precision of
  back-calculated concentrations of each calibration standard should be
  within +/-25% of the nominal concentration at the LLOQ and ULOQ, and
  within +/-20% at all other levels. At least 75% of the calibration
  standards excluding anchor points, and a minimum of 6 concentration
  levels of calibration standards, including the LLOQ and ULOQ, should
  meet the above criteria"; a rejected LLOQ or ULOQ standard makes the
  next acceptable one the limit, which keeps its original (20%)
  criterion. Implemented: each replicate standard counts toward the
  75%; a level passes when its mean back-calculated recovery and its CV
  meet the level's limits and at least half of its replicates pass (the
  M10 half-per-level rule of the QCs, applied here to replicated
  standards; a choice, M10 does not spell it out for standards). The
  wider 25% applies to the lowest and highest non-anchor levels only.
- Quantification range by the accuracy/precision profile: the LLOQ and
  ULOQ are the lowest and highest passing levels, ULOQ/LLOQ the dynamic
  range. Failing levels inside the range are reported (M10: reject and
  refit; mark the standard "exclude" to refit without it). Unknowns
  outside the range are reported as "<LLOQ" or ">ULOQ", never as
  extrapolated numbers; unknowns outside the standards are also flagged
  "extrapolated".
- Parallelism / dilutional linearity (M10 and the LBA validation
  literature, e.g. Andreasson et al. 2015 Front Neurol 6:179): the
  dilution-corrected concentrations of one sample across its in-range
  dilutions should agree (CV, default limit 30%), and the sample's
  dilution series should be parallel to the standard curve: an extra-
  sum-of-squares F test of one global fit with every shape parameter
  shared and only the location parameter (LogEC50 / EC50 / intercept)
  free per curve against separate fits (curve-fitting guide,
  "Comparing fits": extra sum-of-squares F test; "Global nonlinear
  regression"). The sample's X is its relative concentration
  1/dilution (log10 of it for log-X models).

Models: "4pl" (log(agonist) or log(inhibitor) vs. response, chosen by
the direction of the standards, or the X-is-concentration variable-
slope form when log_x is False), "5pl" (asymmetrical five parameter),
"linear" (straight line on X or log X), "loglog" (straight line of
log10 signal on log10 concentration, the usual "log-log" standard
curve).
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats
from scipy.optimize import brentq

from . import equations, interpolate, nlfit  # noqa: F401 (registers 5PL)

MODELS = ("4pl", "5pl", "linear", "loglog")
_WEIGHT_ALIASES = {"none": "none", "1/Y": "1/Y", "1/Y2": "1/Y2",
                   "1/Y^2": "1/Y2", "1/y": "1/Y", "1/y2": "1/Y2"}


def _num(v):
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def _cv(values):
    arr = np.array([v for v in values if v is not None], dtype=float)
    if arr.size < 2 or arr.mean() == 0:
        return None
    return float(100.0 * arr.std(ddof=1) / abs(arr.mean()))


def _sd(values):
    arr = np.array([v for v in values if v is not None], dtype=float)
    return float(arr.std(ddof=1)) if arr.size >= 2 else None


def _mean(values):
    arr = [v for v in values if v is not None]
    return float(np.mean(arr)) if arr else None


class _Curve:
    """The fitted standard curve plus the conversions between the
    concentration scale and the scale the model is fitted on."""

    def __init__(self, kind, log_x, fit, location, x_fit, y_fit):
        self.kind, self.log_x, self.fit = kind, log_x, fit
        self.location = location
        self.log_y = kind == "loglog"
        lo, hi = float(np.min(x_fit)), float(np.max(x_fit))
        pad = (hi - lo) / 2.0
        self.x_lo, self.x_hi = lo - pad, hi + pad
        if not self.log_x and kind in ("4pl", "5pl"):
            self.x_lo = max(self.x_lo, 0.0)
        spec = nlfit.MODELS[fit["model"]]
        f = lambda v: spec.func(np.asarray(v, float), fit["fitted_values"])
        y_lo, y_hi = float(f([self.x_lo])[0]), float(f([self.x_hi])[0])
        self.increasing = y_hi >= y_lo
        self.y_range = (min(y_lo, y_hi), max(y_lo, y_hi))
        self._grid = None

    # scale conversions
    def to_x(self, conc):
        if self.log_x:
            return math.log10(conc) if conc > 0 else None
        return conc

    def to_conc(self, x):
        if x is None:
            return None
        return 10.0 ** x if self.log_x else x

    def to_y(self, signal):
        if signal is None:
            return None
        if self.log_y:
            return math.log10(signal) if signal > 0 else None
        return signal

    def interpolate(self, signals):
        ys = [self.to_y(s) for s in signals]
        xs = interpolate.interpolate_x(self.fit, ys, self.x_lo, self.x_hi)
        return [self.to_conc(x) for x in xs]

    def side(self, signal):
        """'below' / 'above' when a signal is outside the curve's range
        (no crossing): below means a concentration under the curve."""
        y = self.to_y(signal)
        if y is None:
            return "below"
        low = y < self.y_range[0]
        if self.increasing:
            return "below" if low else "above"
        return "above" if low else "below"

    def ci(self, signal, ci_level=0.95):
        """CI of the interpolated concentration: where the confidence
        band crosses the signal (as interpolate.absolute_ic50), found on
        a dense vectorised band grid and refined with brentq."""
        y = self.to_y(signal)
        if y is None:
            return None
        if self._grid is None:
            xs = np.linspace(self.x_lo, self.x_hi, 1024)
            b = interpolate.bands(self.fit, xs, ci_level=ci_level)
            self._grid = (xs, np.array(b["upper"]), np.array(b["lower"]))
        xs, up, dn = self._grid
        tcrit = stats.t.ppf((1 + ci_level) / 2, self.fit["goodness"]["df"])
        C = np.array(self.fit["_cov"]["matrix"])

        def edge(arr, sign):
            d = arr - y
            for i in range(len(xs) - 1):
                if d[i] == 0.0:
                    return float(xs[i])
                if d[i] * d[i + 1] < 0:
                    def f(v):
                        yc = float(interpolate._curve(self.fit, [v])[0])
                        G = interpolate._gradient(self.fit, [v])
                        var = max(float((G @ C @ G.T)[0, 0]), 0.0)
                        return yc + sign * tcrit * math.sqrt(var) - y
                    return float(brentq(f, xs[i], xs[i + 1], maxiter=100))
            return None
        a, b = edge(up, +1), edge(dn, -1)
        if a is None or b is None:
            return None
        lo, hi = sorted([a, b])
        return [self.to_conc(lo), self.to_conc(hi)]


def _model_for(kind, log_x, increasing):
    if kind == "4pl":
        if log_x:
            return ("log_agonist_vs_response_4pl" if increasing
                    else "log_inhibitor_vs_response_4pl"), "LogXmid"
        return "agonist_vs_response_variable", "EC50"
    if kind == "5pl":
        return (("asymmetric_5pl_log", "LogEC50") if log_x
                else ("asymmetric_5pl", "EC50"))
    if kind == "linear":
        return "straight_line", ("Yintercept" if log_x else "Slope")
    return "straight_line", "Yintercept"          # loglog


def fit_standards(standards, *, model="4pl", weighting="none",
                  log_x=None, blank=0.0, constraints=None):
    """Fit the standard curve. standards: [{"concentration", "signals",
    "anchor"?}]. Returns (curve, prepared standards, warnings)."""
    if model not in MODELS:
        raise ValueError(f"unknown standard-curve model: {model}")
    if weighting not in _WEIGHT_ALIASES:
        raise ValueError(f"unknown weighting: {weighting}")
    weighting = _WEIGHT_ALIASES[weighting]
    if log_x is None:
        log_x = model in ("4pl", "5pl", "loglog")
    if model == "loglog":
        log_x = True
    warnings, prepared = [], []
    for s in standards:
        conc = _num(s.get("concentration", s.get("conc")))
        sig = [_num(v) for v in s.get("signals", [])]
        sig = [None if v is None else v - blank for v in sig]
        prepared.append({"concentration": conc, "signals": sig,
                         "anchor": bool(s.get("anchor", False)),
                         "excluded": ("excluded by the user"
                                      if s.get("exclude") else None)})
    xs, ys = [], []
    for s in prepared:
        c = s["concentration"]
        if s["excluded"]:
            continue
        if c is None:
            s["excluded"] = "no concentration"
            continue
        if c <= 0:
            s["excluded"] = ("zero standard: the blank is not part of the "
                             "curve (ICH M10); use blank='zero_standard'"
                             if c == 0 else "negative concentration")
            continue
        for v in s["signals"]:
            if v is None:
                continue
            if model == "loglog" and v <= 0:
                s["excluded"] = "non-positive signal on a log-log curve"
                continue
            xs.append(math.log10(c) if log_x else c)
            ys.append(math.log10(v) if model == "loglog" else v)
    if any(s["excluded"] and "zero" in s["excluded"] for s in prepared) \
            and not blank:
        warnings.append("Zero-concentration standards were left out of the "
                        "fit (use them as the blank instead).")
    if len(set(xs)) < 2:
        raise ValueError("need standards at two or more concentrations")
    increasing = (np.corrcoef(xs, ys)[0, 1] >= 0
                  if np.std(ys) > 0 and np.std(xs) > 0 else True)
    model_id, location = _model_for(model, log_x, increasing)
    with np.errstate(all="ignore"):
        fit = nlfit.fit_model(xs, ys, model_id, weighting=weighting,
                              constraints=constraints)
    curve = _Curve(model, log_x, fit, location, np.array(xs), np.array(ys))
    if fit.get("status") == "ambiguous":
        warnings.append("The standard-curve fit is ambiguous: some "
                        "parameters are not determined by the standards.")
    return curve, prepared, warnings


def standard_curve_qc(standards, unknowns=None, *, model="4pl",
                      weighting="none", log_x=None, blank=None,
                      accuracy_limit=20.0, accuracy_limit_ends=25.0,
                      precision_limit=20.0, precision_limit_ends=25.0,
                      min_fraction=0.75, min_levels=6,
                      cv_limit=20.0, cv_basis="concentration",
                      parallelism_cv_limit=30.0, ci_level=0.95,
                      constraints=None, curve_points=200) -> dict:
    """Standard-curve fit, back-calculation QC (ICH M10), LLOQ/ULOQ by
    the accuracy/precision profile, and dilution-corrected unknowns.

    standards: [{"concentration", "signals": [replicates], "anchor"?}]
    unknowns: [{"name", "signals": [replicates], "dilution"?: 1}]
    constraints: parameters held constant in the fit (nlfit names, e.g.
    {"Bottom": 0}).
    blank: a number subtracted from every signal, "zero_standard" (mean
    of the zero-concentration standards) or None.
    """
    unknowns = unknowns or []
    if cv_basis not in ("concentration", "signal"):
        raise ValueError("cv_basis must be 'concentration' or 'signal'")
    blank_value = 0.0
    if blank == "zero_standard":
        zs = [_num(v) for s in standards
              if _num(s.get("concentration", s.get("conc"))) == 0
              for v in s.get("signals", [])]
        zs = [v for v in zs if v is not None]
        if not zs:
            raise ValueError("blank='zero_standard' needs a standard with "
                             "concentration 0")
        blank_value = float(np.mean(zs))
    elif blank is not None:
        blank_value = float(blank)
    curve, prepared, warnings = fit_standards(
        standards, model=model, weighting=weighting, log_x=log_x,
        blank=blank_value, constraints=constraints)
    fit = curve.fit

    # ---- back-calculated standards
    levels = []
    for s in prepared:
        c = s["concentration"]
        sig = s["signals"]
        entry = {"concentration": c, "anchor": s["anchor"],
                 "excluded": s["excluded"], "signals": sig,
                 "n": sum(v is not None for v in sig),
                 "mean_signal": _mean(sig), "sd_signal": _sd(sig),
                 "cv_signal_pct": _cv(sig)}
        if s["excluded"] or c is None or c <= 0:
            entry.update(back_calculated=[None] * len(sig),
                         mean_back_calc=None, recovery_pct=None,
                         cv_back_calc_pct=None, replicate_error_pct=[],
                         replicate_pass=[], level_pass=None, role=None)
            levels.append(entry)
            continue
        back = curve.interpolate(sig)
        back = [b if v is not None else None for b, v in zip(back, sig)]
        mb = _mean(back)
        entry["back_calculated"] = back
        entry["mean_back_calc"] = mb
        entry["recovery_pct"] = (100.0 * mb / c) if (mb is not None and c) \
            else None
        entry["cv_back_calc_pct"] = _cv(back)
        entry["replicate_error_pct"] = [
            None if b is None else 100.0 * (b - c) / c
            for b, v in zip(back, sig) if v is not None]
        levels.append(entry)

    usable = sorted([lv for lv in levels if lv["excluded"] is None
                     and lv["concentration"] is not None
                     and lv["concentration"] > 0],
                    key=lambda lv: lv["concentration"])
    calib = [lv for lv in usable if not lv["anchor"]]
    # acceptance (M10): the lowest and highest calibration levels get the
    # wider limits; a level passes on mean recovery, CV and half of its
    # replicates
    n_std = n_pass = levels_pass = 0
    for idx, lv in enumerate(calib):
        end = idx in (0, len(calib) - 1)
        acc = accuracy_limit_ends if end else accuracy_limit
        prec = precision_limit_ends if end else precision_limit
        passes = [e is not None and abs(e) <= acc + 1e-9
                  for e in lv["replicate_error_pct"]]
        lv["replicate_pass"] = passes
        lv["accuracy_limit_pct"] = acc
        lv["precision_limit_pct"] = prec
        n_std += len(passes)
        n_pass += sum(passes)
        rec_ok = (lv["recovery_pct"] is not None
                  and abs(lv["recovery_pct"] - 100.0) <= acc + 1e-9)
        cv_ok = (lv["cv_back_calc_pct"] is None
                 or lv["cv_back_calc_pct"] <= prec + 1e-9)
        lv["level_pass"] = bool(passes and rec_ok and cv_ok
                                and sum(passes) >= len(passes) / 2.0)
        levels_pass += lv["level_pass"]
    for lv in usable:
        if lv["anchor"]:
            lv["replicate_pass"], lv["level_pass"] = [], None
    fraction = n_pass / n_std if n_std else None
    reasons = []
    if fraction is None or fraction < min_fraction - 1e-12:
        reasons.append(f"{n_pass} of {n_std} standards within limits "
                       f"(needs {100 * min_fraction:.0f}%)")
    if levels_pass < min_levels:
        reasons.append(f"{levels_pass} concentration levels pass (needs "
                       f"{min_levels})")
    acceptance = {
        "criteria": {"accuracy_limit_pct": accuracy_limit,
                     "accuracy_limit_ends_pct": accuracy_limit_ends,
                     "precision_limit_pct": precision_limit,
                     "precision_limit_ends_pct": precision_limit_ends,
                     "min_fraction": min_fraction, "min_levels": min_levels,
                     "source": "ICH M10 (2022) 4.2.3 / 4.3.2, ligand-binding "
                               "assays, calibration curve"},
        "n_standards": n_std, "n_pass": n_pass, "fraction_pass": fraction,
        "n_levels": len(calib), "n_levels_pass": levels_pass,
        "accepted": not reasons, "reasons": reasons,
    }

    # quantification range: lowest and highest passing levels
    for lv in levels:
        lv.setdefault("role", None)
    passing = [i for i, lv in enumerate(calib) if lv["level_pass"]]
    lloq = uloq = None
    rejected_inside = []
    if passing:
        i0, i1 = passing[0], passing[-1]
        lloq = calib[i0]["concentration"]
        uloq = calib[i1]["concentration"]
        calib[i0]["role"] = "LLOQ" if i1 != i0 else "LLOQ/ULOQ"
        if i1 != i0:
            calib[i1]["role"] = "ULOQ"
        rejected_inside = [calib[i]["concentration"]
                           for i in range(i0 + 1, i1)
                           if not calib[i]["level_pass"]]
        if rejected_inside:
            warnings.append(
                "Standards inside the range fail the criteria ("
                + ", ".join(f"{c:g}" for c in rejected_inside)
                + "); ICH M10 rejects such a standard and refits without "
                "it (mark it exclude).")
        if i0 != 0 or i1 != len(calib) - 1:
            warnings.append("The quantification range is narrower than the "
                            "standards: the LLOQ or ULOQ moved to the next "
                            "passing level (which keeps the 20% criterion).")
    else:
        warnings.append("No standard level meets the accuracy and precision "
                        "limits; LLOQ and ULOQ are undefined.")
    std_min = min(lv["concentration"] for lv in usable) if usable else None
    std_max = max(lv["concentration"] for lv in usable) if usable else None
    quant = {
        "lloq": lloq, "uloq": uloq,
        "dynamic_range_fold": (uloq / lloq if lloq and uloq else None),
        "dynamic_range_log10": (math.log10(uloq / lloq)
                                if lloq and uloq else None),
        "criteria": {"accuracy_pct": accuracy_limit,
                     "accuracy_ends_pct": accuracy_limit_ends,
                     "precision_cv_pct": precision_limit,
                     "precision_cv_ends_pct": precision_limit_ends},
        "standards_min": std_min, "standards_max": std_max,
        "rejected_inside_range": rejected_inside,
    }

    # ---- unknowns
    unk_out = []
    for u in unknowns:
        name = str(u.get("name", f"Sample {len(unk_out) + 1}"))
        dil = _num(u.get("dilution")) or 1.0
        sig = [_num(v) for v in u.get("signals", [])]
        sig = [None if v is None else v - blank_value for v in sig]
        present = [v for v in sig if v is not None]
        mean_sig = _mean(present)
        reps = curve.interpolate(present) if present else []
        conc = curve.interpolate([mean_sig])[0] if mean_sig is not None \
            else None
        flags = []
        status = "ok"
        if mean_sig is None:
            status = "no_data"
        elif conc is None:
            side = curve.side(mean_sig)
            status = "<LLOQ" if side == "below" else ">ULOQ"
            flags.append(status)
            flags.append("outside_curve")
        else:
            lo_lim = lloq if lloq is not None else std_min
            hi_lim = uloq if uloq is not None else std_max
            if lo_lim is not None and conc < lo_lim * (1 - 1e-12):
                status = "<LLOQ"
                flags.append("<LLOQ")
            elif hi_lim is not None and conc > hi_lim * (1 + 1e-12):
                status = ">ULOQ"
                flags.append(">ULOQ")
            if std_min is not None and (conc < std_min * (1 - 1e-12)
                                        or conc > std_max * (1 + 1e-12)):
                flags.append("extrapolated")
        if conc is not None and any(r is None for r in reps):
            flags.append("replicate_outside_curve")
        cv_sig = _cv(present)
        cv_conc = _cv([r for r in reps if r is not None]) \
            if all(r is not None for r in reps) else None
        cv_used = cv_conc if cv_basis == "concentration" else cv_sig
        if cv_used is not None and cv_used > cv_limit + 1e-9:
            flags.append("high_cv")
        ci = curve.ci(mean_sig, ci_level) if conc is not None else None
        corrected = conc * dil if conc is not None else None
        unk_out.append({
            "name": name, "dilution": dil, "signals": sig,
            "mean_signal": mean_sig, "cv_signal_pct": cv_sig,
            "interpolated_replicates": reps,
            "cv_concentration_pct": cv_conc,
            "concentration": conc,
            "concentration_ci": ci,
            "corrected": corrected,
            "corrected_ci": [ci[0] * dil, ci[1] * dil] if ci else None,
            "corrected_replicates": [None if r is None else r * dil
                                     for r in reps],
            "status": status, "flags": flags,
            "reportable": corrected if status == "ok" else None,
            "lloq_corrected": lloq * dil if lloq is not None else None,
            "uloq_corrected": uloq * dil if uloq is not None else None,
        })

    # ---- per-sample summaries and parallelism
    names = []
    for u in unk_out:
        if u["name"] not in names:
            names.append(u["name"])
    samples, parallel = [], []
    for name in names:
        entries = [u for u in unk_out if u["name"] == name]
        ok = [u for u in entries if u["status"] == "ok"]
        reps = [r for u in ok for r in u["corrected_replicates"]
                if r is not None]
        arr = np.array(reps, dtype=float)
        sample = {"name": name, "n_dilutions": len(entries),
                  "n_in_range": len(ok), "n": int(arr.size),
                  "mean": float(arr.mean()) if arr.size else None,
                  "sd": float(arr.std(ddof=1)) if arr.size > 1 else None,
                  "cv_pct": _cv(reps),
                  "status": ("ok" if ok else
                             (entries[0]["status"] if len({e["status"]
                                                          for e in entries}) == 1
                              else "out_of_range"))}
        samples.append(sample)
        dils = sorted({u["dilution"] for u in entries})
        if len(dils) >= 2:
            parallel.append(_parallelism(curve, prepared, name, entries, ok,
                                         _WEIGHT_ALIASES[weighting],
                                         parallelism_cv_limit, constraints))

    # ---- curve for plotting (concentration axis in the fit's X units)
    spec = nlfit.MODELS[fit["model"]]
    gx = np.linspace(curve.x_lo, curve.x_hi, int(curve_points))
    gy = spec.func(gx, fit["fitted_values"])
    plot = {"x": gx.tolist(),
            "y": (np.power(10.0, gy) if curve.log_y else gy).tolist(),
            "x_is_log": curve.log_x}
    fit_out = dict(fit)
    fit_out.pop("_cov", None)
    return {
        "analysis": "stdcurve_qc",
        "model": model, "model_id": fit["model"], "log_x": curve.log_x,
        "log_y": curve.log_y, "weighting": fit["weighting"],
        "blank": blank_value if blank is not None else None,
        "fit": fit_out, "curve": plot,
        "standards": levels, "acceptance": acceptance,
        "quantification_range": quant,
        "unknowns": unk_out, "samples": samples,
        "parallelism": parallel,
        "cv_limit_pct": cv_limit, "cv_basis": cv_basis,
        "warnings": warnings,
    }


def _parallelism(curve, prepared, name, entries, ok, weighting, cv_limit,
                 constraints=None):
    """Dilutional linearity (CV across in-range dilutions) and the F test
    of a dilution series parallel to the standard curve."""
    vals = [u["corrected"] for u in ok]
    cv = _cv(vals) if len(vals) >= 2 else None
    out = {"name": name, "dilutions": sorted({u["dilution"] for u in entries}),
           "n_in_range": len(ok), "corrected_by_dilution": [
               {"dilution": u["dilution"], "corrected": u["corrected"],
                "status": u["status"]} for u in entries],
           "cv_pct": cv, "cv_limit_pct": cv_limit,
           "cv_pass": (cv <= cv_limit + 1e-9) if cv is not None else None,
           "f_test": None, "f_test_note": None}
    model_id = curve.fit["model"]
    spec = nlfit.MODELS[model_id]
    # sample series on the standards' X scale: relative concentration
    sx, sy = [], []
    for u in entries:
        rel = 1.0 / u["dilution"]
        x = curve.to_x(rel)
        for v in u["signals"]:
            if v is None or x is None:
                continue
            y = curve.to_y(v)
            if y is None:
                continue
            sx.append(x)
            sy.append(y)
    fixed = {("LogXmid" if k in ("LogEC50", "LogIC50")
              and "LogXmid" in spec.params else k): float(v)
             for k, v in (constraints or {}).items()}
    n_free = len([p_ for p_ in spec.params if p_ not in fixed])
    if len(set(sx)) < n_free or len(sx) <= n_free:
        out["f_test_note"] = (f"needs at least {n_free} dilutions (and more "
                              f"points than the {n_free} parameters) to fit "
                              "the sample's own curve")
        return out
    stx, sty = [], []
    for s in prepared:
        c = s["concentration"]
        if s["excluded"] or c is None:
            continue
        x = curve.to_x(c)
        for v in s["signals"]:
            y = curve.to_y(v)
            if v is None or x is None or y is None:
                continue
            stx.append(x)
            sty.append(y)
    try:
        sep_s = curve.fit
        sep_u = nlfit.fit_model(sx, sy, model_id, weighting=weighting,
                                constraints=fixed or None)
        loc = curve.location
        shared = [p for p in spec.params if p != loc and p not in fixed]
        init = dict(sep_s["fitted_values"])
        glob = equations.fit_global_model(
            [{"name": "standards", "x": stx, "y": sty},
             {"name": name, "x": sx, "y": sy}], model_id, shared=shared,
            constraints=fixed, weighting=weighting,
            initial={p: init[p] for p in shared})
    except (ValueError, RuntimeError, np.linalg.LinAlgError) as exc:
        out["f_test_note"] = f"fit failed: {exc}"
        return out

    def wss(f):
        g = f["goodness"]
        return g["sy_x"] ** 2 * g["df"]
    ss_sep = wss(sep_s) + wss(sep_u)
    df_sep = sep_s["goodness"]["df"] + sep_u["goodness"]["df"]
    ss_par = wss(glob)
    df_par = glob["goodness"]["df"]
    dfn = df_par - df_sep
    if dfn <= 0 or df_sep <= 0 or ss_sep <= 0:
        out["f_test_note"] = "degenerate comparison (no residual df)"
        return out
    F = max(((ss_par - ss_sep) / dfn) / (ss_sep / df_sep), 0.0)
    p = float(stats.f.sf(F, dfn, df_sep))
    loc_vals = [d["fitted_values"][curve.location] for d in glob["datasets"]]
    shift = loc_vals[1] - loc_vals[0]
    out["f_test"] = {
        "F": float(F), "dfn": int(dfn), "dfd": int(df_sep), "p": p,
        "parallel_at_05": bool(p >= 0.05),
        "ss_parallel": ss_par, "df_parallel": int(df_par),
        "ss_separate": ss_sep, "df_separate": int(df_sep),
        "shared_parameters": [("LogEC50" if p_ == "LogXmid" else p_)
                              for p_ in shared],
        "location_parameter": ("LogEC50" if curve.location == "LogXmid"
                               else curve.location),
        "location_shift": float(shift),
        # the sample's undiluted concentration implied by the horizontal
        # shift of the parallel curves (log X: 10^-shift; EC50 on the
        # concentration scale: EC50_standards / EC50_sample)
        "concentration_from_shift": (
            10.0 ** (-shift) if curve.log_x and curve.location in
            ("LogXmid", "LogEC50") else
            (loc_vals[0] / loc_vals[1]) if curve.location == "EC50"
            and loc_vals[1] else None),
    }
    return out
