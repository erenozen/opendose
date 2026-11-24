"""JSON API: the single entry point used by the web app (via Pyodide)
and by integration tests.

analyze(payload) -> result dict. payload:
{
  "analysis": "dose_response" | "normalize" | "transform" | "descriptive",
  "data": {
    "x": [floats or null],                  # X column (log10 units if x_is_log)
    "datasets": [{"name": str, "ys": [[replicate rows]]}]
  },
  "options": { ... analysis-specific ... }
}
"""

from __future__ import annotations

import base64
import json
import math
import traceback

from . import (anova, columnstats, contingency, correlation, descriptive,
               diagnostics, doseresponse, globalfit, interpolate, linregress,
               methodcomp, nlfit, normalize, outliers, plate, plate_io,
               prism_project, pzfx, repeated, schild, survival, transform,
               ttests, twoway)
from . import multivar, partsofwhole
from . import formulas, manipulate, simulate
from . import summary
from . import mixedmodel, nested
from . import fdr, letters, rowtests, threeway
from . import deming, moretests, proportions, trend
from . import icc, methodreg
from . import equations, userequation
from . import (assay_clustering, assay_densitometry, assay_growth,
               assay_kinetic, assay_luciferase, assay_mic, assay_plate,
               assay_qpcr,
               assay_stdcurve, assay_superplot, assay_synergy, assay_wound,
               synergy_multi)
from . import frequency
from . import effectsize, estimation, power
from . import auc, cox, quantal
from . import rangeflags, residuals, survival_extras
from . import competing_risks, parametric_survival
from . import logscale, rm_posthoc, twoway_contrasts
from . import compare_models, compare_params, flow, qpcr_refs, relpotency
from . import potency


def _expand(x_col, replicate_rows):
    """Pair each replicate with its row X: -> (xs, ys) flat lists."""
    xs, ys = [], []
    for xv, row in zip(x_col, replicate_rows):
        if xv is None or (isinstance(xv, float) and xv != xv):
            continue
        for yv in row:
            if yv is not None and not (isinstance(yv, float) and yv != yv):
                xs.append(float(xv))
                ys.append(float(yv))
    return xs, ys


def _abs_ic50_entry(fit, level, x_lo, x_hi):
    """Absolute IC50 as a derived parameter row (concentration units for
    log-X models)."""
    res = interpolate.absolute_ic50(fit, level, x_lo, x_hi)
    value, ci = res["x"], res["ci"]
    if fit.get("x_is_log"):
        value = 10.0 ** value if value is not None else None
        ci = [10.0 ** ci[0], 10.0 ** ci[1]] if ci else None
    entry = {"value": value, "se": None, "ci95": ci,
             "constrained": False, "derived": True}
    if "AbsoluteIC50" not in fit["param_order"]:
        fit["param_order"].append("AbsoluteIC50")
    return entry


def _fit_residual_check(res, name, *, robust=False, rout=False, x_is_log=False):
    """residuals.fit_residuals of a fit's "_residuals" (nlfit.fit_model),
    or {"unavailable": why} when the fit has none."""
    if robust:
        return {"unavailable": (
            "Residual plots are not drawn for a robust fit: it assumes the "
            "scatter follows a Lorentzian distribution, so a normal QQ plot "
            "does not describe it.")}
    if res is None:
        return {"unavailable": (
            "Residual plots need the individual values; this fit used means "
            "with an error and n, so its residuals are those of the means.")}
    out = residuals.fit_residuals(res["x"], res["y"], res["fitted"],
                                  n_params=res["n_params"],
                                  weights=res.get("weights"), name=name)
    if rout:
        out["note"] += (" Points ROUT removed as outliers are not among "
                        "them.")
    # the model's X: log10 of the concentration for log-dose models
    out["x_label"] = "log10(X)" if x_is_log else "X"
    return out


def _model_residuals(build):
    """residual diagnostics of an ANOVA model, or {"unavailable": why}:
    they must never cost the analysis."""
    try:
        return build()
    except Exception as exc:
        return {"unavailable": f"Residuals could not be computed: {exc}."}


def _dose_response(data, options):
    """Nonlinear regression for any registered model. For models whose X
    is log10(concentration), x_is_log=False means the engine applies
    X = log10(X) first (Prism's 'transform concentrations to logs').

    options.interpolate_unknowns (bool): every Y value in a row with no
    X is an unknown read off its data set's curve; with interpolate_y
    (typed Y values) the data set gets "interpolation": {"ci_level",
    "x_is_log", "data_range", "search_range", "prediction", "items":
    [{"source": "row" (with "row", "sub") | "typed" (with "index"), "y",
    "m", "x", "position" ("within" | "extrapolated" | "none"), "side",
    "crossings", "ci", "pi", and "x_conc" / "ci_conc" / "pi_conc" for
    log-X models}]} (interpolate.interpolate_unknown). The prediction
    interval is left out (pi None, "prediction": false) for weighted and
    summary-data fits.

    options.curve_range [start, end] (the fit's X units: log10 of the
    concentration for log-X models; either None for the default) and
    options.curve_points (10 to 5000, default 200): the drawn curve
    ("curve") spans that range with that many points plus the ends of the
    data, and carries "data_range" and "x_range" so the part beyond the
    data can be drawn apart (doseresponse.curve_points). Bands follow the
    drawn curve; interpolation and the absolute IC50 keep their range.
    Settings that cannot be drawn keep the default curve, with a warning
    ("Curve range not used: ...")."""
    if options.get("user_equation"):
        return _user_equation_dose_response(data, options)
    model = options.get("model", "log_inhibitor_vs_response_4pl")
    spec = nlfit.MODELS.get(model)
    if spec is None:
        raise ValueError(f"unknown model: {model}")
    constraints = options.get("constraints") or {}
    # options.bounds {name: [lo, hi]}: range constraints (nlfit.fit_model)
    bounds = options.get("bounds") or None
    # options.initial_values {name: number}: typed starts (nlfit.fit_model)
    starts = options.get("initial_values") or None
    weighting = options.get("weighting", "none")
    ci_method = options.get("ci_method", "asymptotic")
    rout_q = options.get("rout_q")  # e.g. 0.01 turns on ROUT
    # fit_method "robust": nlfit.robust_model_fit, best-fit values only
    fit_method = options.get("fit_method", "least_squares")
    if fit_method not in ("least_squares", "robust"):
        raise ValueError(f"unknown fit_method: {fit_method}")
    robust = fit_method == "robust"
    if robust and weighting != "none":
        raise ValueError("robust regression is not weighted: choose no "
                         "weighting")
    if robust and rout_q:
        raise ValueError("ROUT already finds outliers with a robust fit; "
                         "choose robust regression or ROUT, not both")
    x_col = data["x"]
    if spec.x_is_log and not options.get("x_is_log", True):
        x_col = transform.transform_list(x_col, "log10")
    # options.summary_format: ds["ys"] rows hold that format's subcolumns
    # (or ds carries summary.expand_summary_table's mean/sd/n arrays);
    # options.replicates: "account" (default) | "means_only".
    summary_fmt = options.get("summary_format")
    if summary_fmt == "replicates":
        summary_fmt = None
    if robust and summary_fmt:
        raise ValueError("robust regression needs the individual values, "
                         "not mean / SD / n")

    finite_x = [v for v in x_col if v is not None]
    curve_opt, curve_bad = _curve_option(options)
    # options.experiments: {"of": [experiment of each subcolumn], "names":
    # [...], "log10_molar": exponent of the unit in mol/L or None}: each
    # experiment is also fitted on its own and its potencies summarised
    # (potency.py), next to the fit of all the values.
    exp_opt = options.get("experiments")
    results = []
    for ds in data["datasets"]:
        entry = {"name": ds.get("name", "")}
        curve_problem = curve_bad
        try:
            s_kw = {}
            if summary_fmt:
                xs, ys, s_kw = summary.fit_inputs(
                    x_col, ds, summary_fmt,
                    options.get("replicates", "account"))
            else:
                xs, ys = _expand(x_col, ds["ys"])
            if robust:
                fit = nlfit.robust_model_fit(xs, ys, model,
                                             constraints=constraints,
                                             bounds=bounds,
                                             initial_values=starts)
            elif rout_q:
                rout = nlfit.rout_outliers(
                    xs, ys, model, q=float(rout_q), constraints=constraints,
                    weighting=weighting, ci_method=ci_method,
                    weight_source=options.get("weight_source", "predicted"),
                    bounds=bounds, initial_values=starts, **s_kw)
                fit = rout["fit"]
                entry["rout"] = {k: rout[k] for k in
                                 ("q", "rsdr", "outliers", "n_outliers")}
            else:
                fit = nlfit.fit_model(xs, ys, model, constraints=constraints,
                                      weighting=weighting, ci_method=ci_method,
                                      weight_source=options.get(
                                          "weight_source", "predicted"),
                                      bounds=bounds, initial_values=starts,
                                      **s_kw)
            fit["curve"] = doseresponse.curve_points(
                fit, min(finite_x), max(finite_x))
            x_lo, x_hi = min(fit["curve"]["x"]), max(fit["curve"]["x"])
            if curve_opt:
                # P-52: the drawn curve's range and resolution; x_lo / x_hi
                # above (interpolation, absolute IC50) stay as they were. A
                # range that cannot be drawn keeps the default curve and
                # says why: a drawing option never costs the fit.
                try:
                    fit["curve"] = doseresponse.curve_points(
                        fit, min(finite_x), max(finite_x), n=curve_opt["n"],
                        x_range=curve_opt["range"],
                        data_range=(min(xs), max(xs)))
                except ValueError as exc:
                    curve_problem = f"Curve range not used: {exc}"
            if curve_problem:
                entry["curve_warning"] = curve_problem
            if robust:
                # no covariance: no bands, interpolation CIs, absolute IC50
                # or least-squares diagnostics (the guide: none for robust)
                skipped = [k for k in ("diagnostics", "bands",
                                       "interpolate_y", "absolute_ic50_level",
                                       "interpolate_unknowns")
                           if options.get(k) not in (None, False, [], "")]
                if skipped:
                    entry["robust_skipped"] = skipped
                options = {k: v for k, v in options.items()
                           if k not in ("diagnostics", "bands",
                                        "interpolate_y",
                                        "absolute_ic50_level",
                                        "interpolate_unknowns")}
            if options.get("diagnostics"):
                entry["diagnostics"] = diagnostics.fit_diagnostics(xs, ys, fit)
                hs = diagnostics.hougaard_skewness(xs, ys, fit)
                if hs is not None:
                    entry["diagnostics"]["hougaard_skewness"] = hs
                if summary_fmt:  # replicates test from mean/SD/n (exact)
                    rx, ry = summary.replicate_view(x_col, ds, summary_fmt)
                    entry["diagnostics"]["replicates_test"] = (
                        diagnostics.replicates_test(rx, ry, fit)
                        if fit.get("replicates", {}).get("mode") == "account"
                        else None)
            band_kind = options.get("bands")  # 'confidence' | 'prediction'
            if band_kind:
                entry["bands"] = interpolate.bands(
                    fit, fit["curve"]["x"], kind=band_kind)
            interp_y = options.get("interpolate_y")
            if interp_y:
                entry["interpolated_x"] = interpolate.interpolate_x(
                    fit, interp_y, x_lo, x_hi)
            # options.interpolate_unknowns: each Y value in a row with no X
            # is an unknown, read off the curve with its CI and prediction
            # interval (interpolate.interpolate_unknown); typed
            # interpolate_y values get the same, next to interpolated_x
            unknowns = (_unknown_readings(data["x"], ds, summary_fmt)
                        if options.get("interpolate_unknowns") else [])
            if unknowns or interp_y:
                entry["interpolation"] = _interpolation(
                    fit, xs, unknowns, interp_y or [], x_is_log=spec.x_is_log,
                    prediction=(weighting == "none" and not summary_fmt))
            abs_level = options.get("absolute_ic50_level")
            if abs_level is not None:
                fit["params"]["AbsoluteIC50"] = _abs_ic50_entry(
                    fit, float(abs_level), x_lo, x_hi)
            fit.pop("_cov", None)  # internal; keep the JSON payload lean
            entry["residual_check"] = _fit_residual_check(
                fit.pop("_residuals", None), entry["name"], robust=robust,
                rout=bool(rout_q), x_is_log=spec.x_is_log)
            try:
                flags = rangeflags.range_flags(fit["params"], xs, ys,
                                               x_is_log=spec.x_is_log)
            except Exception as exc:  # flags must never cost the fit
                flags = {"error": str(exc)}
            if flags is not None:
                fit["range_flags"] = flags
            if equations.model_family(spec) == equations.FAM_HORMESIS:
                # what ED p means; EDs beyond the doses tested
                fit["notes"] = equations.ed_notes(fit, xs)
            entry["fit"] = fit
        except Exception as exc:  # per-dataset failure must not kill others
            entry["error"] = str(exc)
        if exp_opt and not summary_fmt:
            entry["experiments"] = _experiments(
                x_col, ds, exp_opt, model, spec, constraints=constraints,
                weighting=weighting, ci_method=ci_method, robust=robust,
                rout_q=rout_q, bounds=bounds, initial_values=starts,
                weight_source=options.get("weight_source", "predicted"))
        results.append(entry)

    raw_x = data["x"]
    for ds, entry in zip(data["datasets"], results):
        rows = ds.get("ys") or []
        # Y values in rows with no X at all, and in rows whose X was entered
        # but has no logarithm (X <= 0, e.g. the vehicle / zero dose) when
        # the model takes log(X): two different things, said apart.
        lost, nolog = 0, []
        for xr, xv, row in zip(raw_x, x_col, rows):
            vals = [v for v in (row or []) if not _is_missing(v)]
            if summary_fmt:              # rows of mean / SD / n: the mean
                vals = vals[:1]
            if _is_missing(xr):
                lost += len(vals)
            elif _is_missing(xv):
                nolog += [(float(xr), float(v)) for v in vals]
        warn = _nan_warnings({"datasets": [ds]})
        if entry.get("curve_warning"):
            warn.append(entry.pop("curve_warning"))
        if lost and options.get("interpolate_unknowns") \
                and "interpolation" in entry:
            warn.append(
                f"{lost} Y value{'s' if lost != 1 else ''} in rows without "
                "an X value read as unknowns: interpolated from the curve, "
                "not part of the fit")
        elif lost:
            warn.append(
                f"{lost} Y value{'s' if lost != 1 else ''} in rows without "
                "an X value left out of the fit")
        if nolog:
            xs0 = sorted({x for x, _ in nolog})
            mean0 = sum(y for _, y in nolog) / len(nolog)
            entry["log_x_dropped"] = {"n_values": len(nolog), "x_values": xs0,
                                      "mean_y": mean0}
            at = ("X = 0" if xs0 == [0.0] else
                  "X = " + ", ".join(f"{x:g}" for x in xs0))
            warn.append(
                f"{len(nolog)} Y value{'s' if len(nolog) != 1 else ''} at {at} "
                f"(mean {mean0:.4g}) left out of the fit: the model uses "
                "log(X), and zero or negative X has no logarithm. To use the "
                "zero-dose wells, constrain the plateau they represent to "
                "their mean, or normalise to them.")
        if warn:
            entry["warnings"] = warn
    error_bar_kind = options.get("error_bars", "sd")
    for ds, entry in zip(data["datasets"], results):
        entry["points"] = {
            "x": x_col,
            "bars": (summary.dataset_error_bars(ds, summary_fmt,
                                                error_bar_kind)
                     if summary_fmt else
                     descriptive.error_bars(ds["ys"], error_bar_kind)),
        }
    return {"analysis": "dose_response", "x_is_log_output": True,
            "datasets": results}


CURVE_POINTS = (10, 5000)


def _curve_option(options):
    """options.curve_range [start, end] (the fit's X units, either None
    for the default) and options.curve_points (n): (the drawn curve's
    settings for doseresponse.curve_points or None, and the reason they
    cannot be used or None). Unusable settings keep the default curve."""
    rng = options.get("curve_range")
    n = options.get("curve_points")
    if rng is None and n is None:
        return None, None
    if rng is not None:
        if (not isinstance(rng, (list, tuple)) or len(rng) != 2
                or any(v is not None and not isinstance(v, (int, float))
                       for v in rng)):
            return None, "Curve range not used: enter a start and an end X"
        rng = [None if v is None else float(v) for v in rng]
        if rng[0] is None and rng[1] is None:
            rng = None
    if n is None:
        n = 200
    if (not isinstance(n, (int, float)) or n != int(n)
            or not CURVE_POINTS[0] <= n <= CURVE_POINTS[1]):
        return None, (f"Curve range not used: enter a whole number of points "
                      f"from {CURVE_POINTS[0]} to {CURVE_POINTS[1]}")
    if rng is not None and None not in rng and rng[0] >= rng[1]:
        return None, (f"Curve range not used: the curve's start (X = "
                      f"{rng[0]:g}) must be below its end (X = {rng[1]:g})")
    return {"range": rng or (None, None), "n": int(n)}, None


def _unknown_readings(raw_x, ds, summary_fmt):
    """[(row, subcolumn, Y)] of every Y value in a row with no X (the
    unknowns of a standard curve); for rows of mean / SD / n, the mean."""
    out = []
    for r, (xr, row) in enumerate(zip(raw_x, ds.get("ys") or [])):
        if not _is_missing(xr):
            continue
        for k, v in enumerate((row or [])[:1] if summary_fmt else row or []):
            if not _is_missing(v):
                out.append((r, k, float(v)))
    return out


def _interpolation(fit, xs, unknowns, typed, *, x_is_log, prediction):
    """The unknowns of one fitted data set read off its curve
    (interpolate.interpolate_unknown), each with its 95% CI and 95%
    prediction interval, in the fit's X units and, for log-X models, as
    concentrations (10^X). The standards' range is the X range fitted."""
    lo, hi = float(min(xs)), float(max(xs))

    def conc(v):
        return None if v is None else 10.0 ** v

    def one(y, extra):
        res = interpolate.interpolate_unknown(fit, [y], lo, hi,
                                              prediction=prediction)
        res.update(extra)
        if x_is_log:
            res["x_conc"] = conc(res.get("x"))
            for k in ("ci", "pi"):
                if res.get(k):
                    res[f"{k}_conc"] = [conc(v) for v in res[k]]
        return res

    items = [one(y, {"source": "row", "row": r, "sub": k})
             for r, k, y in unknowns]
    items += [one(float(y), {"source": "typed", "index": i})
              for i, y in enumerate(typed) if y is not None]
    return {
        "ci_level": 0.95, "x_is_log": bool(x_is_log),
        "data_range": [lo, hi],
        "search_range": [lo - interpolate.SEARCH_FRACTION * (hi - lo),
                         hi + interpolate.SEARCH_FRACTION * (hi - lo)],
        "prediction": bool(prediction),
        "items": items,
    }


def _experiments(x_col, ds, exp_opt, model, spec, *, constraints, weighting,
                 ci_method, robust, rout_q, weight_source, bounds=None,
                 initial_values=None):
    """One fit per independent experiment of a data set and the summary of
    their potencies (potency.across_experiments), fitted exactly as the
    data set's own fit (model, constraints, weighting, robust or ROUT)."""
    of = [int(v) for v in exp_opt.get("of") or []]
    names = [str(n) for n in exp_opt.get("names") or []]
    if not of or not names or any(v < 0 or v >= len(names) for v in of):
        return {"error": "the replicate map does not name an experiment "
                         "for every subcolumn"}
    log10_molar = exp_opt.get("log10_molar")

    def fit_one(rows):
        xs, ys = _expand(x_col, rows)
        if robust:
            fit = nlfit.robust_model_fit(xs, ys, model,
                                         constraints=constraints,
                                         bounds=bounds,
                                         initial_values=initial_values)
        elif rout_q:
            fit = nlfit.rout_outliers(
                xs, ys, model, q=float(rout_q), constraints=constraints,
                weighting=weighting, ci_method=ci_method,
                weight_source=weight_source, bounds=bounds,
                initial_values=initial_values)["fit"]
        else:
            fit = nlfit.fit_model(xs, ys, model, constraints=constraints,
                                  weighting=weighting, ci_method=ci_method,
                                  weight_source=weight_source, bounds=bounds,
                                  initial_values=initial_values)
        fit.pop("_cov", None)
        fit.pop("_residuals", None)
        return fit, xs, ys

    def flags_of(fit, xs, ys):
        try:
            return rangeflags.range_flags(fit["params"], xs, ys,
                                          x_is_log=spec.x_is_log)
        except Exception:  # flags must never cost the summary
            return None

    try:
        return potency.across_experiments(
            x_col, ds.get("ys") or [], of, names, fit_one,
            log10_molar=(None if log10_molar is None else float(log10_molar)),
            flags_of=flags_of)
    except Exception as exc:
        return {"error": str(exc)}


def _normalize(data, options):
    """Normalize every data set (normalize.normalize_dataset). Each output
    data set also carries "references": the 0% and 100% values it used,
    their rule and row (normalize.normalize_references)."""
    out = []
    for ds in data["datasets"]:
        out.append({
            "name": ds.get("name", ""),
            "ys": normalize.normalize_dataset(
                ds["ys"],
                zero_mode=options.get("zero_mode", "smallest"),
                zero_value=options.get("zero_value"),
                hundred_mode=options.get("hundred_mode", "largest"),
                hundred_value=options.get("hundred_value"),
                as_percent=options.get("as_percent", True),
                subcolumns=options.get("subcolumns", "mean"),
            ),
            "references": normalize.normalize_references(
                ds["ys"],
                zero_mode=options.get("zero_mode", "smallest"),
                zero_value=options.get("zero_value"),
                hundred_mode=options.get("hundred_mode", "largest"),
                hundred_value=options.get("hundred_value"),
                subcolumns=options.get("subcolumns", "mean"),
            ),
        })
    return {"analysis": "normalize", "x": data["x"], "datasets": out}


def _transform(data, options):
    func = options["func"]
    k = options.get("k")
    target = options.get("target", "y")  # 'x' | 'y' | 'both'
    x = data["x"]
    if target in ("x", "both"):
        x = transform.transform_list(x, func, k)
    out = []
    for ds in data["datasets"]:
        ys = (transform.transform_grid(ds["ys"], func, k)
              if target in ("y", "both") else ds["ys"])
        out.append({"name": ds.get("name", ""), "ys": ys})
    return {"analysis": "transform", "x": x, "datasets": out}


def _descriptive(data, options):
    out = []
    for ds in data["datasets"]:
        out.append({
            "name": ds.get("name", ""),
            "rows": [descriptive.row_stats(row) for row in ds["ys"]],
        })
    return {"analysis": "descriptive", "x": data["x"], "datasets": out}


def _read_plate_grid(data, plate_format=None):
    """(grid, warnings) from {"grid"} | {"xlsx_b64"} | {"text"}; the
    shape rule and its warnings are plate_io.locate_plate's."""
    grid = data.get("grid")
    if grid is not None:
        return grid, []
    found = None
    if data.get("xlsx_b64"):
        import base64
        found = plate_io.read_xlsx(base64.b64decode(data["xlsx_b64"]),
                                   plate_format)
    elif data.get("text"):
        found = plate_io.read_text(data["text"], plate_format)
    if found is None:
        return None, []
    return found["grid"], list(found["warnings"])


def _plate_quantify(data, options):
    """data: {"grid": rows x cols} | {"text": pasted block} | {"xlsx_b64":
    base64 xlsx bytes}. options: the plate.quantify_plate layout. Returns
    per-group dose tables shaped like the main data model (x = dose,
    datasets with replicate rows), ready for the grouped table / fit."""
    grid, read_warnings = _read_plate_grid(data, options.get("plate_format"))
    if grid is None:
        raise ValueError("plate_quantify needs a plate grid")
    result = plate.quantify_plate(grid, options)
    doses = result["groups"][0]["doses"] if result["groups"] else []
    return {
        "analysis": "plate_quantify",
        "warnings": read_warnings,
        "blank": result["blank"],
        "x": doses,
        "datasets": [
            {"name": g["name"], "ys": g["values"],
             "control_mean": g["control_mean"]}
            for g in result["groups"]
        ],
    }


def _is_missing(v):
    """A blank cell: None, or a float NaN (Python callers; JSON from the
    web carries blanks as null)."""
    return v is None or (isinstance(v, float) and v != v)


def _flatten_columns(data):
    """Column-table view of the data model: every dataset's cells,
    row-major, as one flat list per dataset (X is ignored). Blank cells
    (None, NaN) are left out; _nan_warnings reports NaN values."""
    cols, names = [], []
    for ds in data["datasets"]:
        cols.append([v for row in ds["ys"] for v in (row or [])
                     if not _is_missing(v)])
        names.append(ds.get("name", ""))
    return cols, names


def _nan_warnings(data, indices=None):
    """Warnings for NaN (not-a-number) cells, which are left out like
    blanks: a NaN usually means a text or error cell upstream, so it is
    reported (nothing is dropped silently)."""
    out = []
    for i, ds in enumerate(data.get("datasets") or []):
        if indices is not None and i not in indices:
            continue
        rows = sorted({r + 1 for r, row in enumerate(ds.get("ys") or [])
                       for v in (row or [])
                       if isinstance(v, float) and v != v})
        if rows:
            out.append(f"{ds.get('name', '') or f'Data set {i + 1}'}: "
                       f"{len(rows)} non-numeric (NaN) value"
                       f"{'s' if len(rows) > 1 else ''} left out (row"
                       f"{'s' if len(rows) > 1 else ''} "
                       f"{', '.join(str(r) for r in rows)})")
    return out


def _pair_cells(data, ia, ib):
    """Row-aligned pairs from two data sets: cell (row, subcolumn) of A
    with the same cell of B. Pairs with one value missing are left out
    and their 0-based row indices returned; rows blank in both are
    ignored. With complete data the pairs are exactly the row-major
    flattened columns zipped together (the earlier behaviour)."""
    def cells(ds):
        out = {}
        for r, row in enumerate(ds.get("ys") or []):
            for c, v in enumerate(row or []):
                out[(r, c)] = v
        return out
    A = cells(data["datasets"][ia])
    B = cells(data["datasets"][ib])
    a, b, incomplete = [], [], []
    for key in sorted(set(A) | set(B)):
        ma, mb = _is_missing(A.get(key)), _is_missing(B.get(key))
        if ma and mb:
            continue
        if ma or mb:
            incomplete.append(key[0])
            continue
        a.append(A[key])
        b.append(B[key])
    return a, b, incomplete


def _incomplete_warning(incomplete, what="pair"):
    n = len(incomplete)
    rows = sorted({r + 1 for r in incomplete})
    return (f"{n} incomplete {what}{'s' if n != 1 else ''} (row"
            f"{'s' if len(rows) != 1 else ''} "
            f"{', '.join(str(r) for r in rows)}) left out")


SMALL_N_SOURCE = (
    "GraphPad statistics guide, 'The essential concepts of statistics' / "
    "'Statistical tests with n = 1' (a P value needs at least two "
    "independent values per group to estimate scatter); Motulsky, "
    "Intuitive Biostatistics, 4th ed., ch. 22 and 26 (sample size, power)")


def _withheld_two_groups(kind, names, a, b, paired=False, warnings=None):
    """Descriptive-only result when a group (or the pairs) has fewer than
    two values: no P value, the reason, and what replication buys."""
    import statistics
    ga = [float(v) for v in a]
    gb = [float(v) for v in b]
    groups = [{"name": names[0], "n": len(ga),
               "mean": statistics.fmean(ga) if ga else None,
               "median": statistics.median(ga) if ga else None,
               "values": ga},
              {"name": names[1], "n": len(gb),
               "mean": statistics.fmean(gb) if gb else None,
               "median": statistics.median(gb) if gb else None,
               "values": gb}]
    if paired:
        diffs = [x - y for x, y in zip(ga, gb)]
        min_n = len(diffs)
        difference = statistics.fmean(diffs) if diffs else None
        what = "pair" if min_n == 1 else "pairs"
        reason = (f"{min_n} complete {what}: one value allows description "
                  "only" if min_n else "no complete pairs")
    else:
        min_n = min(len(ga), len(gb))
        difference = (groups[0]["mean"] - groups[1]["mean"]
                      if ga and gb else None)
        reason = ("one value per group allows description only"
                  if min_n == 1 else "a group has no values")
    guide = []
    for n in (3, 5, 10):
        try:
            if paired:
                d = power.t_test_one("effect", n=n, power=0.8, alpha=0.05,
                                     design="paired")["effect"]["value"]
            else:
                d = power.t_test_two("effect", n1=n, n2=n, power=0.8,
                                     alpha=0.05)["effect"]["value"]
            guide.append({"n_per_group": n, "detectable_d_80": d})
        except ValueError:
            pass
    withheld = {"reason": reason, "min_n": min_n,
                "groups": [{"name": g["name"], "n": g["n"]} for g in groups],
                "replication_guide": guide,
                "text": (f"P value withheld: {reason}. Repeat the experiment "
                         "independently: with n = 3 per group a t test has "
                         "80% power only for differences of about "
                         f"{guide[0]['detectable_d_80']:.1f} SDs." if guide
                         else f"P value withheld: {reason}."),
                "source": SMALL_N_SOURCE}
    w = list(warnings or [])
    w.append(withheld["text"])
    test = {"unpaired": "unpaired_t", "paired": "paired_t",
            "mann_whitney": "mann_whitney",
            "wilcoxon": "wilcoxon_matched_pairs",
            "ratio_paired": "ratio_paired_t",
            "kolmogorov_smirnov": "kolmogorov_smirnov"}.get(kind, kind)
    out = {"test": test, "p_two_tailed": None, "p": None,
           "withheld": withheld,
           "descriptive": {"groups": groups, "difference": difference,
                           "difference_definition": (
                               "mean of (A - B) over pairs" if paired
                               else "mean A - mean B")},
           "mean_a": groups[0]["mean"], "mean_b": groups[1]["mean"],
           "n_a": len(ga), "n_b": len(gb), "difference": difference,
           "warnings": w}
    if paired:
        out["n_pairs"] = min_n
    return out


def _design_sensitivity(n1, n2=None, *, df=None, paired=False):
    """What n this small can detect: Cohen's d (paired: d_z) detectable
    with 80% power at two-sided alpha 0.05 (opendose.power, G*Power's
    sensitivity analysis), and the CI half-width in SD units:
    t_{0.975, df} sqrt(1/n1 + 1/n2) (paired: t_{0.975, n-1} / sqrt(n))."""
    from scipy import stats as _st
    if paired:
        d = power.t_test_one("effect", n=n1, power=0.8, alpha=0.05,
                             design="paired")["effect"]["value"]
        df = n1 - 1
        factor = float(_st.t.ppf(0.975, df)) * (1.0 / n1) ** 0.5
        effect, n_text = "d_z", f"n = {n1} pairs"
    else:
        d = power.t_test_two("effect", n1=n1, n2=n2, power=0.8,
                             alpha=0.05)["effect"]["value"]
        df = df if df is not None else n1 + n2 - 2
        factor = float(_st.t.ppf(0.975, df)) * (1.0 / n1 + 1.0 / n2) ** 0.5
        effect = "d"
        n_text = (f"n = {n1} per group" if n1 == n2
                  else f"n = {n1} and {n2}")
    return {
        "min_n": int(min(n1, n2) if n2 is not None else n1),
        "detectable_d_80": d, "effect": effect, "alpha": 0.05,
        "power": 0.8, "ci_halfwidth_factor": factor, "df": df,
        "text": (f"{n_text} can detect only {effect} >= {d:.2f} with 80% "
                 "power (alpha 0.05, two-sided); the 95% CI of the "
                 f"difference spans +/- {factor:.2f} SDs"),
        "source": ("G*Power sensitivity analysis (Faul et al. 2007, Behav "
                   "Res Methods 39:175) via opendose.power; CI half-width "
                   "t(0.975, df) x sqrt(1/n1 + 1/n2) in SD units"),
    }


def _column_statistics(data, options):
    """options.equivalence {"lower", "upper", "alpha"} (with a
    hypothetical value): the two one-sided tests of mean - hypothetical
    against the margins, per data set (columnstats.column_statistics)."""
    cols, names = _flatten_columns(data)
    warnings = _nan_warnings(data)
    eq = options.get("equivalence")
    if eq:
        lo, hi, scale, alpha = _equivalence_margins(eq)
        if scale != "difference":
            raise ValueError("a one-sample equivalence margin is in data "
                             "units, not a ratio")
        eq = (lo, hi, alpha)
    out = {
        "analysis": "column_statistics",
        "datasets": [
            {"name": name,
             **columnstats.column_statistics(
                 col, hypothetical=options.get("hypothetical"),
                 ci_level=options.get("ci_level", 0.95),
                 normality=options.get("normality_tests"),
                 zero_method=options.get("zero_method", "wilcox"),
                 ratio_t=options.get("ratio_t", False),
                 extras=options.get("extras", False),
                 percentile_method=options.get("percentile_method",
                                               "linear"),
                 trim_k=options.get("trim_k"),
                 lognormality_tests=options.get("lognormality", False),
                 equivalence=eq or None)}
            for name, col in zip(names, cols)
        ],
    }
    if warnings:
        out["warnings"] = warnings
    return out


_PAIRED_KINDS = ("paired", "wilcoxon", "ratio_paired")
_TTEST_KINDS = ("unpaired", "mann_whitney", "kolmogorov_smirnov") + \
    _PAIRED_KINDS


def _ttest(data, options):
    """Two-group tests. Paired kinds (paired, wilcoxon, ratio_paired)
    pair cell by cell (row, subcolumn); incomplete pairs are left out and
    listed in incomplete_pairs (0-based row indices) with a warning.
    With fewer than two values in a group (or fewer than two complete
    pairs) no test is run: p_two_tailed is null and "withheld" says why
    (small-n honesty). With the smallest n <= 3, unpaired / Welch /
    paired / ratio t tests add "design_sensitivity".

    options.log_scale (unpaired, Welch, paired): the test runs on the
    logs (options.log_base "log10" | "ln" | "log2"); the result adds
    "log_scale" {base, values_dropped, n_dropped, pairs_dropped?, note,
    source}, "geometric_means" [{name, n, mean_log, sd_log,
    geometric_mean, ci, geometric_sd_factor}], "ratio", "ratio_ci",
    "ratio_label" (paired: also geometric_mean_ratio / ci_ratio). The
    plain unpaired test adds "scale_check" (opendose.logscale).

    options.equivalence {"lower", "upper", "scale", "alpha"} adds
    "equivalence": the two one-sided tests against the margins
    (_ttest_equivalence, ttests.tost)."""
    cols, names = _flatten_columns(data)
    ia, ib = options.get("dataset_a", 0), options.get("dataset_b", 1)
    kind = options.get("kind", "unpaired")
    if kind not in _TTEST_KINDS:
        raise ValueError(f"unknown t test kind: {kind}")
    warnings = _nan_warnings(data, {ia, ib})
    incomplete = None
    if kind in _PAIRED_KINDS:
        va, vb, incomplete = _pair_cells(data, ia, ib)
        if incomplete:
            warnings.append(_incomplete_warning(incomplete))
        n_min = len(va)
    else:
        va, vb = cols[ia], cols[ib]
        n_min = min(len(va), len(vb))
    log_info = None
    if options.get("log_scale"):
        va, vb, log_info = _log_scale_inputs(
            kind, va, vb, [names[ia], names[ib]], options, warnings)
        n_min = (len(va) if kind in _PAIRED_KINDS
                 else min(len(va), len(vb)))
    if n_min < 2:
        result = _withheld_two_groups(kind, [names[ia], names[ib]], va, vb,
                                      paired=kind in _PAIRED_KINDS,
                                      warnings=warnings)
        if incomplete is not None:
            result["incomplete_pairs"] = incomplete
        result["names"] = [names[ia], names[ib]]
        if log_info is not None:
            result["log_scale"] = log_info["block"]
        return {"analysis": "ttest", **result}
    if kind == "unpaired":
        result = ttests.unpaired_t(va, vb,
                                   welch=options.get("welch", False),
                                   ci_level=options.get("ci_level", 0.95))
    elif kind == "paired":
        result = ttests.paired_t(va, vb,
                                 ci_level=options.get("ci_level", 0.95))
    elif kind == "mann_whitney":
        result = ttests.mann_whitney(va, vb,
                                     ci_level=options.get("ci_level", 0.95))
    elif kind == "wilcoxon":
        result = ttests.wilcoxon_matched_pairs(
            va, vb,
            zero_method=options.get("zero_method", "wilcox"),
            ci_level=options.get("ci_level", 0.95))
    elif kind == "ratio_paired":
        result = ttests.ratio_paired_t(va, vb,
                                       ci_level=options.get("ci_level", 0.95))
    else:
        result = moretests.ks_two_sample(va, vb)
    result["names"] = [names[ia], names[ib]]
    if incomplete is not None:
        result["incomplete_pairs"] = incomplete
    if log_info is not None:
        _log_scale_ttest_result(result, va, vb, log_info, options)
    elif kind == "unpaired":
        result["scale_check"] = logscale.scale_check(
            [va, vb], [names[ia], names[ib]])
        if not options.get("welch", False):
            # B / A, the first data set as the control (as Dunnett's
            # default), with Fieller's CI (ttests.ratio_to_control)
            result["ratio_to_control"] = {
                **ttests.ratio_to_control(
                    va, vb, ci_level=options.get("ci_level", 0.95)),
                "numerator": names[ib], "denominator": names[ia]}
    if options.get("equivalence"):
        result["equivalence"] = _ttest_equivalence(
            result, kind, options["equivalence"],
            log_info["base"] if log_info is not None else None)
    if n_min <= 3:
        if kind == "unpaired":
            result["design_sensitivity"] = _design_sensitivity(
                len(va), len(vb))
        elif kind in ("paired", "ratio_paired"):
            result["design_sensitivity"] = _design_sensitivity(
                n_min, paired=True)
    if warnings:
        result["warnings"] = warnings
    return {"analysis": "ttest", **result}


def _equivalence_margins(spec):
    """(lower, upper, scale, alpha) of options.equivalence {"lower",
    "upper" (either may be null: non-inferiority), "scale" ("difference" |
    "ratio"), "alpha" (0.05)}."""
    if not isinstance(spec, dict):
        raise ValueError("equivalence must be {lower, upper, scale}")
    num = lambda v: None if v is None else float(v)  # noqa: E731
    return (num(spec.get("lower")), num(spec.get("upper")),
            spec.get("scale", "difference"), float(spec.get("alpha", 0.05)))


def _ttest_equivalence(result, kind, spec, log_base):
    """options.equivalence of a two-group t test: the two one-sided tests
    (ttests.tost) on the test's own estimate, SE and df. Unpaired and
    Welch (difference A - B), paired (mean of A - B), and on the log
    scale (log_scale, ratio paired t) the ratio A / B with ratio margins.
    Returns the block, or {"unavailable": why} when the test has no such
    estimate or the margin is on the other scale."""
    lower, upper, scale, alpha = _equivalence_margins(spec)
    if kind == "ratio_paired":
        est, se, log_base = (result["mean_log10_ratio"],
                             result["se_log10_ratio"], "log10")
    elif kind in ("unpaired", "paired"):
        est = result["difference" if kind == "unpaired"
                     else "mean_difference"]
        se = result["se_difference"]
    else:
        return {"unavailable": "equivalence margins need a t test "
                               "(unpaired, Welch, paired or ratio paired): "
                               "a rank test has no estimate with a "
                               "standard error to compare with them"}
    on_logs = log_base is not None
    if scale == "ratio" and not on_logs:
        return {"unavailable": "a margin given as a ratio needs the log "
                               "scale or the ratio paired t test"}
    if scale != "ratio" and on_logs:
        return {"unavailable": "this test compares logarithms: give the "
                               "margin as a ratio"}
    try:
        return ttests.tost(est, se, result["df"], lower, upper, alpha=alpha,
                           scale=scale, log_base=log_base or "log10")
    except ValueError as exc:
        return {"unavailable": str(exc)}


def _log_scale_inputs(kind, va, vb, names, options, warnings):
    """options.log_scale for the t tests: unpaired / Welch and paired t
    run on the logs (options.log_base "log10" (default) | "ln" | "log2");
    values <= 0 (paired: pairs with one) are left out with a warning.
    Rank-based kinds are unchanged by a log transform and ratio_paired
    already analyses logs: the option is then ignored, with a warning."""
    if kind not in ("unpaired", "paired"):
        why = ("the ratio paired t test already analyses the logarithms"
               if kind == "ratio_paired" else
               "a rank-based test gives the same result on the logarithms")
        warnings.append(f"log_scale ignored for {kind}: {why}")
        return va, vb, None
    base = options.get("log_base", "log10")
    if kind == "paired":
        la, lb, ra, rb, n_drop, w = logscale.log_pairs(va, vb, names, base)
        warnings.extend(w)
        block = logscale.log_scale_block(base, {names[0]: n_drop,
                                                names[1]: n_drop}, n_drop)
    else:
        (la, lb), (ra, rb), dropped, w = logscale.log_groups(
            [va, vb], names, base)
        warnings.extend(w)
        block = logscale.log_scale_block(base, dropped)
    return la, lb, {"base": base, "block": block, "raw": (ra, rb),
                    "names": names}


def _log_scale_ttest_result(result, la, lb, log_info, options):
    """Back-transformed keys of a log-scale t test (additive)."""
    base, names = log_info["base"], log_info["names"]
    ci_level = options.get("ci_level", 0.95)
    result["log_scale"] = log_info["block"]
    result["geometric_means"] = logscale.geometric_means(
        [la, lb], names, base, ci_level)
    if result.get("test") == "paired_t":
        diff, ci = result["mean_difference"], result["ci_difference"]
        label = (f"geometric mean of the ratios {names[0] or 'A'} / "
                 f"{names[1] or 'B'}")
    else:
        diff, ci = result["difference"], result["ci_difference"]
        label = (f"ratio of geometric means {names[0] or 'A'} / "
                 f"{names[1] or 'B'}")
    result.update(logscale.ratio_entry(diff, ci, base))
    result["ratio_label"] = label
    if result.get("test") == "paired_t":
        result["geometric_mean_ratio"] = result["ratio"]
        result["ci_ratio"] = result["ratio_ci"]


def _drop_empty_groups(cols, names, options, empty, kind):
    """One-way ANOVA / Kruskal-Wallis: leave out groups with no values,
    renumbering the control and planned pairs to the groups kept. Returns
    (cols, names, options, {"warnings": [...]} or {"error": ...})."""
    label = lambda i: names[i] or f"Group {i + 1}"  # noqa: E731
    keep = [i for i in range(len(cols)) if i not in empty]
    new = {old: k for k, old in enumerate(keep)}
    gone = ", ".join(label(i) for i in empty)
    many = len(empty) > 1
    warnings = [f"{gone} {'have' if many else 'has'} no values and "
                f"{'were' if many else 'was'} left out of the analysis and of "
                "the comparisons."]
    options = dict(options)
    uses_control = (options.get("comparisons") == "dunnett"
                    or options.get("family") == "control"
                    or options.get("comparisons_family") == "control"
                    or (kind == "nonparametric"
                        and options.get("dunn_family") == "control"))
    for key in ("control_index", "control"):
        c = options.get(key)
        if isinstance(c, bool) or not isinstance(c, int):
            continue
        if c in empty:
            if uses_control:
                return cols, names, options, {
                    "error": f"The control group ({label(c)}) has no values: "
                             "choose another control or enter its data."}
            c = 0
        options[key] = new.get(c, 0)
    if options.get("pairs"):
        kept = [[new[a], new[b]] for a, b in options["pairs"]
                if a in new and b in new]
        if len(kept) < len(options["pairs"]):
            warnings.append("Planned comparisons involving "
                            f"{gone} were dropped.")
        options["pairs"] = kept
    return ([cols[i] for i in keep], [names[i] for i in keep], options,
            {"warnings": warnings})


def _withheld_groups(kind, cols, names, warnings):
    """One-way ANOVA / Kruskal-Wallis with a group of fewer than two
    values: descriptive results only, P withheld."""
    import statistics
    small = [{"name": nm, "n": len(c)} for nm, c in zip(names, cols)
             if len(c) < 2]
    min_n = min(len(c) for c in cols) if cols else 0
    reason = ("one value per group allows description only"
              if min_n == 1 else "a group has no values")
    text = (f"P value withheld: {reason} ("
            + ", ".join(f"{g['name'] or 'unnamed'}: n = {g['n']}"
                        for g in small)
            + "). Repeat the experiment independently to test it.")
    summaries = [{"name": nm, "n": len(c),
                  "mean": statistics.fmean(float(v) for v in c) if c else None,
                  "median": (statistics.median(float(v) for v in c)
                             if c else None)}
                 for nm, c in zip(names, cols)]
    return {"analysis": "anova", "kind": kind, "p": None, "table": None,
            "group_summaries": summaries,
            "withheld": {"reason": reason, "min_n": min_n, "groups": small,
                         "text": text, "source": SMALL_N_SOURCE},
            "warnings": list(warnings) + [text]}


def _anova(data, options):
    """One-way ANOVA (kind "parametric") or Kruskal-Wallis
    ("nonparametric"). Planned families: options.comparisons_family
    ("all" | "control" | "pairs", with options.pairs [[i, j], ...]) for
    sidak / bonferroni / holm_sidak / holm / fisher_lsd; Dunn's test:
    options.dunn_family ("all" | "control" | "pairs"), options.control
    (else control_index), options.pairs, options.dunn_correction
    ("bonferroni" | "holm" | "none"; default from dunn_corrected). A
    group with one value (ANOVA: among the non-empty groups;
    Kruskal-Wallis: any group with fewer than two) gives a descriptive
    result with p null and "withheld". With the smallest n <= 3 the
    ANOVA result adds "design_sensitivity" (the two smallest groups).
    options.log_scale (parametric): the ANOVA and post tests on the logs;
    adds "log_scale", "geometric_means" and, per comparison, "ratio",
    "ratio_ci", "ratio_label" (geometric-mean ratio of the pair). Without
    it the parametric result adds "scale_check". options.trend: the
    linear trend (parametric, "trend") or the Jonckheere-Terpstra test
    across the columns in the order entered (Kruskal-Wallis,
    "jonckheere"; moretests.jonckheere_terpstra)."""
    cols, names = _flatten_columns(data)
    warnings = _nan_warnings(data)
    kind = options.get("kind", "parametric")
    log_info = None
    if options.get("log_scale"):
        # options.log_scale: the ANOVA and its post tests on the logs
        # (options.log_base "log10" | "ln" | "log2"), values <= 0 left out
        # with a warning; geometric means and ratios back-transformed
        if kind == "nonparametric":
            warnings.append("log_scale ignored for Kruskal-Wallis: a "
                            "rank-based test gives the same result on the "
                            "logarithms")
        else:
            base = options.get("log_base", "log10")
            cols, _, dropped, w = logscale.log_groups(cols, names, base)
            warnings.extend(w)
            log_info = {"base": base,
                        "block": logscale.log_scale_block(base, dropped)}
    # A group with no values at all (an empty or fully excluded column)
    # is left out of the analysis and of the comparison family, and every
    # other group keeps its name (Prism's fix: GraphPad FAQ 1399). Control
    # and planned-pair indices are renumbered to the groups kept.
    empty = [i for i, c in enumerate(cols) if len(c) == 0]
    if empty and len(empty) < len(cols):
        cols, names, options, msg = _drop_empty_groups(cols, names, options,
                                                       empty, kind)
        if msg.get("error"):
            return {"analysis": "anova", "kind": kind, "error": msg["error"]}
        warnings.extend(msg["warnings"])
    if kind == "nonparametric":
        if any(len(c) < 2 for c in cols):
            return _withheld_groups(kind, cols, names, warnings)
        result = {"analysis": "anova", "kind": kind,
                  **anova.kruskal_wallis(
                      cols, names,
                      dunn_corrected=options.get("dunn_corrected", True),
                      dunn_family=options.get("dunn_family", "all"),
                      control=options.get("control",
                                          options.get("control_index", 0)),
                      pairs=options.get("pairs"),
                      dunn_correction=options.get("dunn_correction"),
                      exact=options.get("exact", False))}
        if options.get("trend"):
            # Jonckheere-Terpstra, the groups in the order entered
            try:
                result["jonckheere"] = moretests.jonckheere_terpstra(
                    cols, names)
            except ValueError as exc:
                result["jonckheere"] = {"error": str(exc)}
        if warnings:
            result["warnings"] = warnings
        return result
    nonempty = [c for c in cols if len(c) > 0]
    if len(nonempty) >= 2 and any(len(c) < 2 for c in nonempty):
        keep = [i for i, c in enumerate(cols) if len(c) > 0]
        out = _withheld_groups(kind, [cols[i] for i in keep],
                               [names[i] for i in keep], warnings)
        if log_info is not None:
            out["log_scale"] = log_info["block"]
        return out
    result = anova.one_way_anova(cols, names)
    if options.get("trend"):
        # columns in the order entered, coded 1, 2, ... (anova.linear_trend)
        nonempty_names = [n for n, c in zip(names, cols) if len(c) > 0]
        try:
            result["trend"] = anova.linear_trend(
                [c for c in cols if len(c) > 0], nonempty_names)
        except ValueError as exc:
            result["trend"] = {"error": str(exc)}
    if options.get("custom_contrasts"):
        # P-83: contrasts typed as coefficients (planned: t test;
        # post hoc: Scheffe), on the ANOVA's pooled residual
        t = result["table"]
        result["custom_contrasts"] = twoway_contrasts.custom_contrasts(
            [(math.fsum(float(v) for v in c) / len(c)) if len(c) else None
             for c in cols],
            [len(c) for c in cols], t["ms_within"], t["df_within"],
            options["custom_contrasts"], names=names,
            ci_level=options.get("ci_level", 0.95))
    method = options.get("comparisons")
    if method:
        result["multiple_comparisons"] = anova.multiple_comparisons(
            cols, method, names=names,
            control_index=options.get("control_index", 0),
            ci_level=options.get("ci_level", 0.95),
            family=options.get("family", "all"),
            comparisons_family=options.get("comparisons_family"),
            pairs=options.get("pairs"))
    ns = sorted(len(c) for c in nonempty)
    if ns and ns[0] <= 3:
        result["design_sensitivity"] = _design_sensitivity(
            ns[0], ns[1], df=sum(ns) - len(ns))
        result["design_sensitivity"]["scope"] = (
            "a comparison of the two smallest groups using the ANOVA's "
            "pooled residual df")
    if log_info is not None:
        result["log_scale"] = log_info["block"]
        result["geometric_means"] = logscale.geometric_means(
            cols, names, log_info["base"], options.get("ci_level", 0.95))
        if result.get("multiple_comparisons"):
            logscale.add_ratios_to_comparisons(
                result["multiple_comparisons"], log_info["base"])
    else:
        result["scale_check"] = logscale.scale_check(cols, names)
    if warnings:
        result["warnings"] = warnings
    return {"analysis": "anova", "kind": "parametric", **result}


def _outliers(data, options):
    cols, names = _flatten_columns(data)
    return {
        "analysis": "outliers",
        "datasets": [
            {"name": name, **outliers.grubbs(
                col, alpha=options.get("alpha", 0.05),
                iterative=options.get("iterative", True))}
            for name, col in zip(names, cols)
        ],
    }


def _compare_fits(data, options):
    """Fit two models to the same dataset; compare by extra-SS F test
    (nested) and AICc (Prism's two comparison methods)."""
    ds_index = options.get("dataset", 0)
    results = {}
    fits, idents = [], []
    for key in ("model_1", "model_2"):
        opts = dict(options.get(key) or {})
        # a model id, or a user-defined equation (options.user_equation,
        # fitted to this data set alone as dose_response fits it)
        model = opts.pop("model", None)
        if model is not None:
            opts["model"] = model
        sub = _dose_response(
            {"x": data["x"], "datasets": [data["datasets"][ds_index]]},
            {"x_is_log": options.get("x_is_log", True), **opts})
        entry = sub["datasets"][0]
        if model is None:
            model = (sub.get("user_equation") or {}).get("name", "equation")
        if "error" in entry:
            raise ValueError(f"{model}: {entry['error']}")
        fits.append(entry["fit"])
        idents.append(compare_models.fit_identity(
            {**entry["fit"], "user_equation": sub.get("user_equation")},
            opts.get("constraints")))
        results[key] = entry["fit"]
    g1, g2 = fits[0]["goodness"], fits[1]["goodness"]
    # Weighted fits are compared on the sums of squares they minimised
    # (the weighted SS), as Prism does and as compare_params already did;
    # comparing their unweighted SS could prefer the wrong model.
    w1, w2 = g1.get("ss_res_weighted"), g2.get("ss_res_weighted")
    if (w1 is None) != (w2 is None):
        raise ValueError("the two models must be fitted with the same "
                         "weighting to be compared")
    weighted = w1 is not None
    ss = [float(w1), float(w2)] if weighted else [g1["ss_res"], g2["ss_res"]]
    k1 = g1["n_points"] - g1["df"]
    k2 = g2["n_points"] - g2["df"]
    simple, complex_ = (0, 1) if k1 <= k2 else (1, 0)
    gs, gc = fits[simple]["goodness"], fits[complex_]["goodness"]
    f_test = None
    if gs["df"] > gc["df"]:
        f_test = nlfit.compare_fits_f_test(ss[simple], gs["df"],
                                           ss[complex_], gc["df"])
        f_test["simpler_model"] = simple + 1
    results["f_test"] = f_test
    results["aicc"] = nlfit.compare_fits_aicc(
        ss[0], k1, ss[1], k2, g1["n_points"])
    results["sum_of_squares"] = "weighted" if weighted else "unweighted"
    if weighted:
        results["notes"] = ["Both fits are weighted, so the F test and AICc "
                            "use the weighted sums of squares (the quantity "
                            "each fit minimised)."]
    # is one model a special case of the other (P-99): the F test is valid
    # only then (compare_models.nesting)
    results["nesting"] = compare_models.nesting(
        idents[0][0], idents[1][0], constraints_1=idents[0][1],
        constraints_2=idents[1][1], k_1=k1, k_2=k2)
    return {"analysis": "compare_fits", **results}


def _compare_global_fits(data, options):
    """Compare two models each fitted to ALL data sets at once (P-99):
    global-only models (enzyme inhibition, Gaddum/Schild, ...), a
    library model with parameters shared, or a user-defined equation.

    data: as global_model_fit. options: model_1 / model_2: {"model": id}
    or {"user_equation": {...}}, each with optional "constraints" and
    "shared" (default: the model's documented shared parameters, none
    for an ordinary model, so it is a separate curve per data set);
    common options as global_model_fit (x_is_log, column_constants,
    weighting, summary_format, replicates, error_bars). Both fits must
    use the same points. Result: {"model_1", "model_2" (global_model_fit
    results), "f_test" (extra-sum-of-squares, when the df differ and the
    models are not known to be non-nested), "aicc", "nesting",
    "sum_of_squares", "warnings", "notes"}."""
    common = {k: v for k, v in options.items()
              if k not in ("model_1", "model_2")}
    fits = []
    for key in ("model_1", "model_2"):
        opts = dict(options.get(key) or {})
        if not opts.get("model") and not opts.get("user_equation"):
            raise ValueError(f"{key} needs a model or a user equation")
        try:
            fits.append(_global_model_fit(data, {**common, **opts}))
        except (ValueError, RuntimeError) as exc:
            raise ValueError(f"Model {key[-1]}: {exc}") from exc
    g1, g2 = fits[0]["goodness"], fits[1]["goodness"]
    if g1["n_points"] != g2["n_points"]:
        raise ValueError(
            f"the two models fit different points ({g1['n_points']} and "
            f"{g2['n_points']}): a model of log(X) leaves out X = 0. Choose "
            "two models that read X the same way")
    w1, w2 = g1.get("ss_res_weighted"), g2.get("ss_res_weighted")
    weighted = w1 is not None and w2 is not None
    ss = [float(w1), float(w2)] if weighted else [g1["ss_res"], g2["ss_res"]]
    n = int(g1["n_points"])
    df = [int(g1["df"]), int(g2["df"])]
    k = [n - df[0], n - df[1]]
    (m1, c1), (m2, c2) = (
        compare_models.fit_identity(f, (options.get(key) or {}).get("constraints"))
        for f, key in zip(fits, ("model_1", "model_2")))
    nest = compare_models.nesting(
        m1, m2, constraints_1=c1, constraints_2=c2,
        shared_1=fits[0].get("shared"), shared_2=fits[1].get("shared"),
        k_1=k[0], k_2=k[1])
    cmp = compare_models.compare_two(ss, k, df, n, nest)
    notes = []
    if weighted:
        notes.append("Both fits are weighted, so the F test and AICc use the "
                     "weighted sums of squares (the quantity each fit "
                     "minimised).")
    return {"analysis": "compare_global_fits", "model_1": fits[0],
            "model_2": fits[1], "n_points": n, **cmp,
            "sum_of_squares": "weighted" if weighted else "unweighted",
            "notes": notes, "source": compare_models.SOURCE}


def _relative_potency(data, options):
    """Relative potency of a test sample against a reference standard from
    parallel curves (P-100; opendose.relpotency): the two data sets fitted
    with every parameter shared but the potency (the parallel model) and
    with none shared; parallelism by the F test and by equivalence
    margins; the potency ratio EC50_reference / EC50_test with Fieller's
    CI. data: as dose_response. options: model (a library model with an
    EC50 / IC50 parameter), reference (data-set index, 0), test (1),
    constraints, x_is_log, weighting, summary_format, replicates,
    error_bars, margins {param: {"lower", "upper"}} (set before seeing
    the data), ci_level (0.95), equivalence_level (0.90), alpha (0.05)."""
    model = options.get("model", "log_agonist_vs_response_4pl")
    spec = nlfit.MODELS.get(model)
    if spec is None:
        raise ValueError(f"unknown model: {model}")
    pot = relpotency.check_model(spec)
    if spec.required_constants:
        raise ValueError(f"{spec.label} needs experimental constants; choose a "
                         "dose-response model such as the 4PL")
    sets = data.get("datasets") or []
    ia, ib = int(options.get("reference", 0)), int(options.get("test", 1))
    if ia == ib:
        raise ValueError("choose two different data sets: a reference and a "
                         "test sample")
    if not (0 <= ia < len(sets) and 0 <= ib < len(sets)):
        raise ValueError("relative potency needs two data sets (a reference "
                         "and a test sample)")
    ra, rb = dict(sets[ia]), dict(sets[ib])
    ra["name"] = ra.get("name") or f"Data set {ia + 1}"
    rb["name"] = rb.get("name") or f"Data set {ib + 1}"
    if ra["name"] == rb["name"]:
        ra["name"], rb["name"] = f"{ra['name']} (reference)", f"{rb['name']} (test)"
    constraints = compare_params._internal_constraints(
        spec, model, options.get("constraints"))
    if pot in constraints:
        raise ValueError(f"{relpotency.display_name(spec, pot)} is held constant: "
                         "there is no potency to compare")
    free = [p for p in spec.params if p not in constraints
            and p not in (spec.data_constants or {})]
    common = {k: options[k] for k in ("x_is_log", "weighting", "summary_format",
                                      "replicates", "error_bars") if k in options}
    common.update(model=model, constraints=constraints)
    sub = {"x": data["x"], "datasets": [ra, rb]}
    fits = {}
    try:
        fits["parallel"] = _global_model_fit(
            sub, dict(common, shared=[p for p in free if p != pot]))
    except (ValueError, RuntimeError) as exc:
        raise ValueError(f"could not fit the parallel model: {exc}") from exc
    # the separate curves from their default start and from the parallel
    # fit (the restricted optimum is a point of the unrestricted model, so
    # this start can only lower the sum of squares); the better one is kept
    warm = {p: [d["fitted_values"][p] for d in fits["parallel"]["datasets"]]
            for p in free}
    tries, last = [], None
    for start in (None, warm):
        try:
            tries.append(_global_model_fit(
                sub, dict(common, shared=[], **({"initial_values": start}
                                                if start else {}))))
        except (ValueError, RuntimeError) as exc:
            last = exc
    if not tries:
        raise ValueError(f"could not fit the separate curves: {last}")
    fits["separate"] = min(tries, key=lambda g: relpotency._wss(g["goodness"]))
    out = relpotency.analyse(
        spec, fits["parallel"], fits["separate"],
        margins=options.get("margins"),
        ci_level=float(options.get("ci_level", 0.95)),
        equivalence_level=float(options.get("equivalence_level", 0.90)),
        alpha=float(options.get("alpha", 0.05)))
    out["warnings"] = _nan_warnings(data, {ia, ib}) + out["warnings"]
    return {"analysis": "relative_potency", "model": model, "label": spec.label,
            "x_is_log": spec.x_is_log, "parallel_fit": fits["parallel"],
            "separate_fit": fits["separate"], **out}


def _correlation(data, options):
    """Correlation of two data sets, paired cell by cell (row,
    subcolumn); pairs with a missing value are left out and listed in
    incomplete_pairs (0-based row indices) with a warning."""
    cols, names = _flatten_columns(data)
    ia, ib = options.get("dataset_a", 0), options.get("dataset_b", 1)
    labels = options.get("subject_labels")
    if labels is not None:
        # options.subject_labels: one subject per row (row titles or a
        # column of IDs): the repeated-measures correlation
        # (correlation.rm_corr), every subcolumn of a row in its subject
        xs, ys, ss = [], [], []
        da, db = data["datasets"][ia]["ys"], data["datasets"][ib]["ys"]
        for r in range(max(len(da), len(db))):
            ra = da[r] if r < len(da) else []
            rb = db[r] if r < len(db) else []
            for c in range(max(len(ra or []), len(rb or []))):
                x = ra[c] if c < len(ra or []) else None
                y = rb[c] if c < len(rb or []) else None
                if _is_missing(x) and _is_missing(y):
                    continue
                xs.append(None if _is_missing(x) else x)
                ys.append(None if _is_missing(y) else y)
                ss.append(labels[r] if r < len(labels) else None)
        result = correlation.rm_corr(xs, ys, ss,
                                     ci_level=options.get("ci_level", 0.95))
        result["names"] = [names[ia], names[ib]]
        notes = []
        if result["pairs_left_out"]:
            notes.append(f"{result['pairs_left_out']} XY pair"
                         f"{'s' if result['pairs_left_out'] != 1 else ''} "
                         "with a missing value or no subject left out")
        if result["subjects_single_pair"]:
            notes.append("subjects with a single XY pair left out (no "
                         "within-subject information): "
                         + ", ".join(result["subjects_single_pair"]))
        if notes:
            result["warnings"] = notes
        return {"analysis": "correlation", **result}
    va, vb, incomplete = _pair_cells(data, ia, ib)
    result = correlation.correlate(va, vb,
                                   method=options.get("method", "pearson"))
    result["names"] = [names[ia], names[ib]]
    result["incomplete_pairs"] = incomplete
    warnings = _nan_warnings(data, {ia, ib})
    if incomplete:
        warnings.append(_incomplete_warning(incomplete, "XY pair"))
    if warnings:
        result["warnings"] = warnings
    if options.get("compare"):
        result["comparison"] = _compare_correlations(
            data, names, ia, ib, result, options["compare"])
    return {"analysis": "correlation", **result}


def _compare_correlations(data, names, ia, ib, first, opts):
    """The r of data sets A and B against the r of data sets C and D
    (opts: {dataset_c, dataset_d, design: independent|dependent}).
    Independent samples: Fisher's z (correlation.compare_independent).
    The same subjects (row by row): Steiger's (1980) Z on the rows where
    every data set involved has a value, overlapping (one data set in
    common) or not (correlation.compare_dependent_*). Pearson r only."""
    ic, id_ = int(opts.get("dataset_c", -1)), int(opts.get("dataset_d", -1))
    design = opts.get("design", "independent")
    nds = len(data["datasets"])
    if not (0 <= ic < nds and 0 <= id_ < nds) or ic == id_:
        return {"error": "choose two different data sets for the second "
                         "correlation"}
    if first.get("method") != "pearson":
        return {"error": "two correlations are compared as Pearson r "
                         "(Fisher z); choose Pearson"}
    if {ic, id_} == {ia, ib}:
        return {"error": "the second correlation is the same pair of data "
                         "sets as the first"}
    shared = {ia, ib} & {ic, id_}
    labels = [f"{names[ia]} vs. {names[ib]}", f"{names[ic]} vs. {names[id_]}"]
    try:
        if design == "independent":
            if shared:
                return {"error": "the two correlations share a data set, so "
                                 "they come from the same subjects: choose "
                                 "“the same subjects”"}
            vc, vd, _ = _pair_cells(data, ic, id_)
            second = correlation.correlate(vc, vd, method="pearson")
            out = correlation.compare_independent(first["r"], first["n"],
                                                  second["r"], second["n"])
        elif design == "dependent":
            idx = [ia, ib] + [i for i in (ic, id_) if i not in (ia, ib)]

            def cells(ds):
                return {(r, c): v for r, row in enumerate(ds.get("ys") or [])
                        for c, v in enumerate(row or [])}
            cs = [cells(data["datasets"][i]) for i in idx]
            keys = sorted(set().union(*cs))
            full = [k for k in keys
                    if all(not _is_missing(c.get(k)) for c in cs)]
            cols = {i: [float(c[k]) for k in full] for i, c in zip(idx, cs)}
            n = len(full)
            if n < 4:
                return {"error": "comparing two correlations on the same "
                                 "subjects needs at least 4 rows with a "
                                 f"value in every data set involved; {n} "
                                 "found"}

            def rr(a, b):
                x, y = cols[a], cols[b]
                if min(x) == max(x) or min(y) == max(y):
                    raise ValueError("a data set is constant on the rows "
                                     "used, so it has no correlation")
                return correlation.correlate(x, y, method="pearson")["r"]
            if shared:
                j = shared.pop()
                k = ib if j == ia else ia
                h = id_ if j == ic else ic
                # orient as r(j, k) for A-B and r(j, h) for C-D
                out = correlation.compare_dependent_overlapping(
                    rr(j, k), rr(j, h), rr(k, h), n)
            else:
                j, k, h, m = ia, ib, ic, id_
                out = correlation.compare_dependent_nonoverlapping(
                    rr(j, k), rr(h, m), rr(j, h), rr(j, m), rr(k, h),
                    rr(k, m), n)
            second = None
            n_left = sum(any(not _is_missing(c.get(k)) for c in cs)
                         for k in keys) - n
            if n_left:
                out["rows_left_out"] = n_left
        else:
            return {"error": f"unknown design: {design}"}
    except ValueError as e:
        return {"error": str(e)}
    out["labels"] = labels
    out["design"] = design
    if second is not None:
        out["second"] = {"r": second["r"], "n": second["n"],
                         "ci_r": second["ci_r"]}
    return out


def _contingency(data, options):
    for r, row in enumerate(data["table"]):
        for c, v in enumerate(row):
            if _is_missing(v):
                raise ValueError(
                    f"contingency table cell (row {r + 1}, column {c + 1}) "
                    "is blank: enter 0 for an empty category or remove the "
                    "row/column")
    result = {"analysis": "contingency",
              **contingency.contingency(data["table"],
                                        yates=options.get("yates", True),
                                        ci_level=options.get("ci_level",
                                                             0.95),
                                        fisher_rxc=options.get("fisher_rxc",
                                                               "auto"))}
    if options.get("effect_sizes"):
        if result["rows"] == 2 and result["cols"] == 2:
            result["effect_sizes"] = proportions.two_by_two_effects(
                data["table"], rr_method=options.get("rr_ci", "koopman"),
                diff_method=options.get("diff_ci", "newcombe_cc"),
                or_method=options.get("or_ci", "baptista_pike"),
                prop_ci_method=options.get("proportion_ci", "wilson_brown"),
                ci_level=options.get("ci_level", 0.95),
                diagnostic_layout=options.get("diagnostic_layout",
                                              "rows_condition"))
        else:
            result["cramers_v"] = proportions.cramers_v(data["table"])
    if options.get("pairwise") and result["rows"] >= 3:
        # options.pairwise {"method": "holm" | "bh" | "bonferroni", "test":
        # "auto" | "fisher" | "chi_square"}: each pair of rows on its own
        # (contingency.pairwise_rows), named by options.row_names
        pw = options["pairwise"] if isinstance(options["pairwise"], dict) \
            else {}
        result["pairwise_rows"] = contingency.pairwise_rows(
            data["table"], method=pw.get("method", "holm"),
            test=pw.get("test", "auto"), row_names=options.get("row_names"))
    if options.get("trend"):
        result["trend"] = trend.chi_square_trend(
            data["table"], scores=options.get("scores"))
    return result


def _two_way_anova(data, options):
    # cells[row][dataset] = replicate list, straight from the grouped table
    n_rows = max(len(ds["ys"]) for ds in data["datasets"])
    warnings = _nan_warnings(data)
    cells = []
    for r in range(n_rows):
        row = []
        for ds in data["datasets"]:
            cell = ds["ys"][r] if r < len(ds["ys"]) else []
            if warnings:  # NaN cells are blanks (reported)
                cell = [None if _is_missing(v) else v for v in cell]
            row.append(cell)
        cells.append(row)
    names = [ds.get("name", "") for ds in data["datasets"]]
    result = {"analysis": "two_way_anova",
              "dataset_names": names,
              **twoway.two_way_anova(
                  cells,
                  row_factor=options.get("row_factor", "Rows"),
                  col_factor=options.get("col_factor", "Columns"),
                  additive=options.get("model") == "additive")}
    if options.get("interaction_contrasts", True):
        # difference of differences per 2 x 2 sub-square and simple
        # effects (opendose.twoway_contrasts); options.interaction_rows /
        # interaction_cols restrict the sub-squares to those indices
        result.update(twoway_contrasts.contrasts_block(
            cells, result,
            row_names=options.get("row_names") or [
                f"Row {i + 1}" for i in range(len(cells))],
            col_names=[nm or f"Column {j + 1}" for j, nm in
                       enumerate(names)],
            ci_level=options.get("ci_level", 0.95),
            rows=options.get("interaction_rows"),
            cols=options.get("interaction_cols")))
    if options.get("custom_contrasts"):
        # P-83: coefficients over the cells, row by row (row 1 / every
        # column, then row 2 ...), on the within-cell residual
        means, ns, ss_w, df_w = twoway_contrasts.cell_summaries(cells)
        rn = options.get("row_names") or [
            f"Row {i + 1}" for i in range(len(cells))]
        cn = [nm or f"Column {j + 1}" for j, nm in enumerate(names)]
        if df_w >= 1 and ss_w > 0:
            result["custom_contrasts"] = twoway_contrasts.custom_contrasts(
                [m for row in means for m in row],
                [n for row in ns for n in row], ss_w / df_w, df_w,
                options["custom_contrasts"],
                names=[f"{r} / {c}" for r in rn for c in cn],
                ci_level=options.get("ci_level", 0.95))
        else:
            result["custom_contrasts"] = {
                "contrasts": [], "error": "custom contrasts need replicate "
                "values within the cells (a within-cell residual)"}
    method = options.get("comparisons")  # tukey | sidak | bonferroni
    if method:
        row_names = options.get("row_names") or [
            f"Row {i + 1}" for i in range(len(cells))]
        result["multiple_comparisons"] = twoway.two_way_comparisons(
            cells, method=method,
            direction=options.get("direction", "columns_within_rows"),
            row_names=row_names, col_names=names,
            additive=options.get("model") == "additive")
    # residual plots in the Checks row (residuals.two_way_residuals)
    result["residual_diagnostics"] = _model_residuals(
        lambda: residuals.two_way_residuals(
            cells, additive=result["model"].startswith("main effects"),
            df=result["sources"]["residual"]["df"],
            row_names=options.get("row_names") or [
                f"Row {i + 1}" for i in range(len(cells))],
            col_names=[nm or f"Column {j + 1}" for j, nm in enumerate(names)]))
    if warnings:
        result["warnings"] = warnings
    return result


def _global_fit(data, options):
    model = options.get("model", "log_inhibitor_vs_response_4pl")
    spec = nlfit.MODELS[model]
    x_col = data["x"]
    if spec.x_is_log and not options.get("x_is_log", True):
        x_col = transform.transform_list(x_col, "log10")
    # options.summary_format as in _dose_response: rows of mean/SD/n are
    # fit through synthetic replicates with the same mean, SD and n, which
    # least squares cannot tell from the raw replicates.
    summary_fmt = options.get("summary_format")
    if summary_fmt == "replicates":
        summary_fmt = None
    gdatasets = []
    for ds in data["datasets"]:
        if summary_fmt and options.get("replicates") == "means_only":
            xs, ys, _ = summary.fit_inputs(x_col, ds, summary_fmt)
        elif summary_fmt:
            xs, ys = summary.replicate_view(x_col, ds, summary_fmt)
        else:
            xs, ys = _expand(x_col, ds["ys"])
        gdatasets.append({"name": ds.get("name", ""), "x": xs, "y": ys})
    result = globalfit.fit_global(
        gdatasets, model, options.get("shared") or [],
        constraints=options.get("constraints") or {},
        weighting=options.get("weighting", "none"))
    finite_x = [v for v in x_col if v is not None]
    error_bar_kind = options.get("error_bars", "sd")
    for entry, ds, gd in zip(result["datasets"], data["datasets"],
                             gdatasets):
        flags = rangeflags.range_flags(entry.get("params") or {},
                                       gd["x"], gd["y"],
                                       x_is_log=spec.x_is_log)
        if flags is not None:
            entry["range_flags"] = flags
        entry["curve"] = doseresponse.curve_points(
            {"model": model, "fitted_values": entry["fitted_values"],
             "x_is_log": spec.x_is_log},
            min(finite_x), max(finite_x))
        entry["points"] = {
            "x": x_col,
            "bars": (summary.dataset_error_bars(ds, summary_fmt,
                                                error_bar_kind)
                     if summary_fmt else
                     descriptive.error_bars(ds["ys"], error_bar_kind)),
        }
    return {"analysis": "global_fit", **result}


def _linear_regression(data, options):
    x_col = data["x"]
    results = []
    for ds in data["datasets"]:
        xs, ys = _expand(x_col, ds["ys"])
        entry = {"name": ds.get("name", "")}
        try:
            through = options.get("through_point")
            through = (float(through[0]), float(through[1])) if through else None
            fit = (linregress.linear_regression_through_point(xs, ys, *through)
                   if through else linregress.linear_regression(xs, ys))
            finite = [v for v in xs if v is not None]
            lo, hi = min(finite), max(finite)
            if through:  # draw the line to the point
                lo, hi = min(lo, through[0]), max(hi, through[0])
            grid = [lo + i * (hi - lo) / 199 for i in range(200)]
            fit["curve"] = {
                "x": grid,
                "y": [fit["slope"]["value"] * v + fit["y_intercept"]["value"]
                      for v in grid],
            }
            if options.get("bands"):
                fit["bands"] = linregress.linear_bands(
                    xs, ys, grid, kind=options["bands"], through=through)
            entry["fit"] = fit
            b, a = fit["slope"]["value"], fit["y_intercept"]["value"]
            entry["residual_check"] = residuals.fit_residuals(
                xs, ys, [b * v + a for v in xs],
                n_params=1 if through else 2, name=entry["name"])
        except Exception as exc:
            entry["error"] = str(exc)
        results.append(entry)
    out = {"analysis": "linear_regression", "datasets": results}
    if options.get("compare_lines") and len(data["datasets"]) >= 2:
        # options.compare_lines: are the slopes, then the intercepts, the
        # same? (linregress.compare_lines; not for lines forced through a
        # point, whose intercepts are fixed)
        if options.get("through_point"):
            out["compare_lines"] = {
                "unavailable": "lines forced through a point share it, so "
                               "their slopes and intercepts are not "
                               "compared here"}
        else:
            try:
                out["compare_lines"] = linregress.compare_lines(
                    [(*_expand(x_col, ds["ys"]), ds.get("name", ""))
                     for ds in data["datasets"]])
            except ValueError as exc:
                out["compare_lines"] = {"unavailable": str(exc)}
    return out


def _survival(data, options):
    """datasets: one per group; each row = one subject with subcolumns
    [time, event(1=event, 0=censored)]. Returns {"curves": {group:
    {points (step curve, log-log CI), table (Kaplan-Meier table at each
    event time: time, at_risk before it, events, censored, survival, se,
    lower, upper (log-log), lower_log, upper_log), table_columns (what
    each column is), n, n_events, n_censored, median_survival, median_ci
    (log-log band), median_ci_log (R's log band)}}} and, for two or more
    groups, "logrank": {chi2_peto, p_peto (= chi2, p: sum((O-E)^2/E)),
    chi2_variance, p_variance (U'V^-1U, R's survdiff), df, observed,
    expected, group_names, method}, "gehan_breslow_wilcoxon",
    "hazard_ratio" (two groups)."""
    groups, names = [], []
    warnings = []
    for ds in data["datasets"]:
        times, events = [], []
        partial = []
        other = {}  # event codes other than 0 / 1: left out (P-90)
        for r, row in enumerate(ds["ys"]):
            if len(row) >= 2 and not _is_missing(row[0]) \
                    and not _is_missing(row[1]):
                if float(row[1]) not in (0.0, 1.0):
                    other.setdefault(row[1], []).append(r)
                    continue
                times.append(float(row[0]))
                events.append(int(row[1]))
            elif any(not _is_missing(v) for v in (row or [])):
                partial.append(r)
        if partial:
            warnings.append(
                f"{ds.get('name', '') or 'unnamed group'}: "
                + _incomplete_warning(partial, "row")
                + " (each subject needs a time and an event code)")
        if other:
            codes = ", ".join(f"{float(c):g}" for c in other)
            n_other = sum(len(v) for v in other.values())
            warnings.append(
                f"{ds.get('name', '') or 'unnamed group'}: {n_other} "
                f"row{'s' if n_other != 1 else ''} with event code {codes} "
                "left out of Kaplan-Meier (1 = event, 0 = censored). If "
                "these are other kinds of event, use Competing risks "
                "(cumulative incidence): 1 - Kaplan-Meier is not the "
                "probability of an event when another event can come "
                "first.")
        if times:
            groups.append((times, events))
            names.append(ds.get("name", ""))
    if not groups:
        raise ValueError("no survival data (need time + event subcolumns)")
    warnings += survival_extras.few_events_warnings(groups, names)
    if len(groups) == 1:
        out = {"analysis": "survival",
               "curves": {names[0]: survival.km_curve(*groups[0])}}
    else:
        out = {"analysis": "survival",
               **survival.compare_survival(groups, names)}
    out["warnings"] = warnings
    return out


def _survival_groups(data):
    """Groups for the survival_* handlers (survival_extras parsing) and
    a warning per row or group left out."""
    groups, names, dropped = survival_extras.groups_from_datasets(
        data["datasets"])
    warnings = []
    for d in dropped:
        where = (f"row {d['row'] + 1}" if d.get("row") is not None
                 else "group")
        warnings.append(f"{d['group'] or 'unnamed group'}, {where} left "
                        f"out: {d['reason']}")
    if not groups:
        raise ValueError("no survival data (need time + event subcolumns)")
    return groups, names, warnings


def _survival_pairwise(data, options):
    """Pairwise log-rank tests with a multiplicity correction, and the
    log-rank test for trend (survival_extras). Payload as "survival"
    (datasets = groups, rows [time, event]). options: family ("all" |
    "control"), control (index, 0), correction ("bonferroni" |
    "holm_sidak" | "holm" | "sidak" | "none"; default "holm_sidak"),
    statistic ("peto" (default, the survival result's chi2) |
    "variance" (R survdiff)), trend_scores ([one per group]; default
    1..k), ci_level (0.95). Result: {"analysis": "survival_pairwise",
    "comparisons": [{a, b, a_index, b_index, chi2, df, p_unadjusted,
    p_adjusted, chi2_peto, p_peto, chi2_variance, p_variance, hr, hr_ci,
    hr_method, observed, expected, significant_05, family_size,
    method}], "family_size", "correction", "statistic", "family": {size,
    method, label}, "trend": {chi2, df, p, scores, ...} | null (fewer
    than 3 groups), "method", "warnings"}."""
    groups, names, warnings = _survival_groups(data)
    res = survival_extras.pairwise_logrank(
        groups, names, family=options.get("family", "all"),
        control=int(options.get("control", options.get("control_index",
                                                        0))),
        correction=options.get("correction", "holm_sidak"),
        ci_level=options.get("ci_level", 0.95),
        statistic=options.get("statistic", "peto"),
        trend_scores=options.get("trend_scores"))
    res["warnings"] = (warnings + list(res.get("warnings") or [])
                       + survival_extras.few_events_warnings(groups, names))
    return {"analysis": "survival_pairwise", **res}


def _survival_at_time(data, options):
    """Kaplan-Meier survival at chosen times, with the median explained
    (survival_extras.survival_at_times). Payload as "survival". options:
    times ([t, ...], required), ci_level (0.95). Result: {"analysis":
    "survival_at_time", "groups": [{name, n, events, at_times: [{time,
    survival, se, ci_loglog, at_risk, events_so_far, beyond_last,
    note?}], explanation: {median_reached, median, fraction_at_last,
    last_time, events, n, text}}], "ci_level", "columns", "warnings"}."""
    groups, names, warnings = _survival_groups(data)
    times = options.get("times")
    if times is None:
        raise ValueError("survival_at_time needs options.times")
    if not isinstance(times, (list, tuple)):
        times = [times]
    res = survival_extras.survival_at_times(
        groups, names, [float(t) for t in times],
        ci_level=options.get("ci_level", 0.95))
    res["warnings"] = (warnings + list(res.get("warnings") or [])
                       + survival_extras.few_events_warnings(groups, names))
    return {"analysis": "survival_at_time", **res}


def _rmst(data, options):
    """Restricted mean survival time up to tau with SE and CI, and each
    group's difference and ratio vs the first group (survRM2 method;
    survival_extras.rmst). Payload as "survival". options: tau (default:
    the smallest of the groups' largest observed times), ci_level.
    Result: {"analysis": "rmst", "tau", "tau_rule", "reference",
    "groups": [{name, rmst, se, ci, tau, n, events, variance}],
    "difference": [{a, b, reference, label, estimate, se, ci, p}],
    "ratio": [{a, b, reference, label, estimate, se_log, ci, p}],
    "ci_level", "method", "warnings"}."""
    groups, names, warnings = _survival_groups(data)
    tau = options.get("tau")
    res = survival_extras.rmst(groups, names,
                               tau=None if tau is None else float(tau),
                               ci_level=options.get("ci_level", 0.95))
    res["warnings"] = (warnings + list(res.get("warnings") or [])
                       + survival_extras.few_events_warnings(groups, names))
    return {"analysis": "rmst", **res}


def _competing_risks(data, options):
    """Cumulative incidence (Aalen-Johansen) of each kind of event and
    Gray's test (competing_risks). Payload as "survival", with event codes
    0 = censored and 1, 2, ... one per kind of event. options: causes
    ([codes]; default every code in the data), times ([t, ...] for the
    at-a-time table), ci_level (0.95). Result: {"analysis":
    "competing_risks", "causes": [{code, groups: [{name, n, events,
    competing, censored, last_time, steps: [{time, at_risk, events,
    competing, censored, cif, se, lower, upper}], points, at_times}],
    gray: {chi2, df, p, score, variance, rho} | null, note?}],
    "group_names", "codes_seen", "competing_present", "ci_level",
    "method", "warnings"}."""
    groups, names, dropped = competing_risks.groups_from_datasets(
        data["datasets"])
    warnings = []
    for d in dropped:
        where = (f"row {d['row'] + 1}" if d.get("row") is not None
                 else "group")
        warnings.append(f"{d['group'] or 'unnamed group'}, {where} left "
                        f"out: {d['reason']}")
    if not groups:
        raise ValueError("no survival data (need time + event code "
                         "subcolumns)")
    causes = options.get("causes")
    times = options.get("times") or []
    if not isinstance(times, (list, tuple)):
        times = [times]
    res = competing_risks.competing_risks(
        groups, names, causes=None if causes is None else list(causes),
        times=[float(t) for t in times],
        ci_level=float(options.get("ci_level", 0.95)))
    res["warnings"] = warnings + list(res.get("warnings") or [])
    return {"analysis": "competing_risks", **res}


def _parametric_survival(data, options):
    """Exponential, Weibull or log-normal accelerated failure time model
    with the group as the covariate (parametric_survival). Payload as
    "survival" (datasets = groups, rows [time, event 1/0]). options: dist
    ("weibull" (default) | "exponential" | "lognormal"), percentiles
    ([fractions that have had the event]; default [0.25, 0.5, 0.75]),
    ci_level (0.95). Result: {"analysis": "parametric_survival", "dist",
    "label", "coefficients": [{name, coef, se, z, p, ci, time_ratio,
    time_ratio_ci}], "scale": {value, ci, log_value, log_se, fixed},
    "shape"?, "loglik", "loglik_null", "lr_test", "aic", "n_params",
    "vcov", "converged", "iterations", "groups": [{name, n, events,
    last_time, km_median, percentiles: [{p, time, se, se_log, ci,
    beyond_follow_up}]}], "time_ratios": [{group, reference, value, ci,
    p}], "compare": [{dist, label, loglik, aic, converged}], "reference",
    "group_names", "n", "n_events", "ci_level", "warnings"}."""
    groups, names, warnings = _survival_groups(data)
    dist = options.get("dist", "weibull")
    pcts = options.get("percentiles") or [0.25, 0.5, 0.75]
    for p in pcts:
        if not 0 < float(p) < 1:
            raise ValueError("percentiles must be fractions between 0 and 1")
    res = parametric_survival.parametric_survival(
        groups, names, dist=dist, percentiles=[float(p) for p in pcts],
        ci_level=float(options.get("ci_level", 0.95)))
    res["warnings"] = warnings + list(res.get("warnings") or [])
    return {"analysis": "parametric_survival", **res}


def _residuals_column(data, options):
    """Residual diagnostics for column analyses (residuals.py): QQ-plot
    points, Shapiro-Wilk on the pooled residuals and n-dependent advice.
    data: column table {"datasets": [{"name", "ys"}]} (cells row-major,
    None = blank). options: paired (false; true = residuals of the
    paired differences of dataset_a minus dataset_b, row by row),
    dataset_a (0), dataset_b (1). Result: {"analysis":
    "residuals_column", "points": [{group, group_index, index, value,
    fitted, residual, standardized, theoretical}], "groups": [{group,
    group_index, n, fitted, in_qq}], "theoretical_method", "shapiro":
    {W, p, n} | null, "shapiro_note", "pooled_sd", "df", "n_total",
    "n_qq", "paired", "difference_direction", "dropped": [{group, index,
    reason, missing_in?}], "warnings", "note", "advice": {n_total, text,
    source}}. index = position in the data set's row-major cells (the
    row index for one subcolumn)."""
    names = [ds.get("name", "") for ds in data["datasets"]]
    cols = [[v for row in ds["ys"] for v in (row or [])]
            for ds in data["datasets"]]
    if options.get("rm"):
        # repeated measures: the subject + treatment model on the first
        # subcolumn of each data set (rows = subjects), as rm_anova
        aligned = [[row[0] if row else None for row in ds["ys"]]
                   for ds in data["datasets"]]
        return {"analysis": "residuals_column",
                **residuals.rm_residuals(aligned, names)}
    if options.get("paired"):
        ia, ib = options.get("dataset_a", 0), options.get("dataset_b", 1)
        res = residuals.column_residuals([cols[ia], cols[ib]],
                                         [names[ia], names[ib]],
                                         paired=True)
    else:
        res = residuals.column_residuals(cols, names)
    return {"analysis": "residuals_column", **res}


def _rm_anova(data, options):
    """Repeated-measures one-way ANOVA (kind "parametric") or Friedman
    ("nonparametric"); datasets = treatments, rows = subjects (first
    subcolumn). Rows with a missing value are left out and listed in
    incomplete_subjects (0-based) with a warning. The parametric result
    carries the subject term: table.ss_subject and table.df_subject (the
    between-subject variation the matching removes). Friedman's Dunn
    test takes options.dunn_family ("all" | "control" | "pairs"),
    options.control (else control_index), options.pairs [[i, j], ...]
    and options.dunn_correction ("bonferroni" | "holm" | "none").
    The parametric analysis takes options.comparisons (a method or
    {method, control, family, pairs, error, pooled_df}, see
    _rm_comparison_options) and then adds "comparisons"
    (opendose.rm_posthoc.rm_comparisons). options.trend: the linear
    trend (parametric, "trend") or Page's test across the treatments in
    the order entered (Friedman, "page"; repeated.page_trend)."""
    cols, names = _flatten_columns(data)
    # RM analyses need row alignment -> use first subcolumn per dataset
    aligned = [[row[0] if row else None for row in ds["ys"]]
               for ds in data["datasets"]]
    kind = options.get("kind", "parametric")
    # subjects (rows) with some but not all values are left out (RM
    # analyses need complete rows): say which
    n_rows = max((len(a) for a in aligned), default=0)
    partial = []
    for r in range(n_rows):
        vals = [a[r] if r < len(a) else None for a in aligned]
        missing = [_is_missing(v) for v in vals]
        if any(missing) and not all(missing):
            partial.append(r)
    aligned = [[None if _is_missing(v) else v for v in a] for a in aligned]
    warnings = []
    if partial:
        warnings.append(_incomplete_warning(partial, "subject row")
                        + " (repeated measures need every treatment per "
                          "subject; the mixed-model analysis keeps them)")
    if kind == "nonparametric":
        result = {"analysis": "friedman",
                  **repeated.friedman(
                      aligned, names, exact=options.get("exact", False),
                      dunn_family=options.get("dunn_family", "all"),
                      control=options.get("control",
                                          options.get("control_index", 0)),
                      pairs=options.get("pairs"),
                      dunn_correction=options.get("dunn_correction",
                                                  "bonferroni"))}
        if options.get("trend"):
            # Page's test, the treatments in the order entered
            try:
                result["page"] = repeated.page_trend(aligned, names)
            except ValueError as exc:
                result["page"] = {"error": str(exc)}
    else:
        result = {"analysis": "rm_one_way_anova",
                  **repeated.rm_one_way_anova(aligned, names)}
        if options.get("trend"):
            # columns in the order entered, coded 1, 2, ...
            try:
                result["trend"] = repeated.rm_linear_trend(aligned, names)
            except ValueError as exc:
                result["trend"] = {"error": str(exc)}
        comp = _rm_comparison_options(options)
        if comp is not None:
            # post tests on the matched data (opendose.rm_posthoc)
            result["comparisons"] = rm_posthoc.rm_comparisons(
                aligned, names, comp["method"], control=comp["control"],
                family=comp["family"], pairs=comp["pairs"],
                error=comp["error"], pooled_df=comp["pooled_df"],
                ci_level=options.get("ci_level", 0.95))
    result["incomplete_subjects"] = partial
    if warnings:
        result["warnings"] = warnings
    return result


def _rm_comparison_options(options):
    """rm_anova's options.comparisons: a method name or {method,
    control (index, the baseline for Dunnett), family ("all" |
    "control" | "pairs"), pairs [[i, j], ...], error ("pooled" |
    "per_pair"), pooled_df ("uncorrected" | "gg")}; flat options
    control_index / comparisons_family / pairs / comparisons_error /
    pooled_df are read when the dict omits them."""
    raw = options.get("comparisons")
    if not raw:
        return None
    spec = dict(raw) if isinstance(raw, dict) else {"method": raw}
    method = spec.get("method")
    if not method:
        raise ValueError("comparisons needs a method")
    return {
        "method": "fisher_lsd" if method == "fisher" else method,
        "control": spec.get("control", options.get(
            "control_index", options.get("control", 0))),
        "family": spec.get("family", options.get("comparisons_family",
                                                 "all")),
        "pairs": spec.get("pairs", options.get("pairs")),
        "error": spec.get("error", options.get("comparisons_error",
                                               "pooled")),
        "pooled_df": spec.get("pooled_df", options.get("pooled_df",
                                                       "uncorrected")),
    }


def _rm_two_way(data, options):
    """Two-way ANOVA with repeated measures. cells[row][dataset] =
    subject values (subcolumns are subjects)."""
    names = [ds.get("name", "") for ds in data["datasets"]]
    n_rows = max(len(ds["ys"]) for ds in data["datasets"])
    cells = []
    for r in range(n_rows):
        cells.append([ds["ys"][r] if r < len(ds["ys"]) else []
                      for ds in data["datasets"]])
    row_names = options.get("row_names") or [
        f"Row {i + 1}" for i in range(n_rows)]
    design = options.get("design", "mixed")
    if design == "both":
        result = repeated.rm_two_way_both(cells, row_names=row_names,
                                          col_names=names)
    else:
        result = repeated.rm_two_way_mixed(cells, row_names=row_names,
                                           col_names=names)
    if options.get("interaction_contrasts", True):
        # P-83: difference of differences and simple effects on the
        # subjects' own contrast scores (repeated.rm_contrasts)
        try:
            result.update(repeated.rm_contrasts(
                cells, design=design, row_names=result["row_names"],
                col_names=[nm or f"Column {j + 1}"
                           for j, nm in enumerate(names)],
                ci_level=options.get("ci_level", 0.95),
                rows=options.get("interaction_rows"),
                cols=options.get("interaction_cols")))
        except ValueError as exc:
            result["contrast_notes"] = [str(exc)]
    return result


def _ec50_shift(data, options):
    """Gaddum/Schild EC50 shift: one curve per dataset, each with its
    antagonist concentration from options.antagonist (linear units).
    `schild_plot` adds the Schild plot (schild.schild_plot: each curve's
    EC50, dose ratios, log(DR - 1) on log[B] with the slope's CI), or an
    `error` inside it when it cannot be drawn; the fit is unaffected."""
    x_col = data["x"]
    if not options.get("x_is_log", True):
        x_col = transform.transform_list(x_col, "log10")
    antagonist = options.get("antagonist")
    if not antagonist:
        raise ValueError("EC50 shift needs options.antagonist "
                         "(one concentration per dataset)")
    gdatasets = []
    for ds in data["datasets"]:
        xs, ys = _expand(x_col, ds["ys"])
        gdatasets.append({"name": ds.get("name", ""), "x": xs, "y": ys})
    result = schild.fit_ec50_shift(
        gdatasets, [float(b) for b in antagonist],
        constraints=options.get("constraints") or {})
    # the Schild plot (a display; pA2 and KB stay the global fit's)
    result["schild_plot"] = schild.schild_plot(
        gdatasets, [float(b) for b in antagonist], result["fitted_values"],
        options.get("constraints") or {})
    finite_x = [v for v in x_col if v is not None]
    lo, hi = min(finite_x) - 0.5, max(finite_x) + 0.5
    grid = [lo + i * (hi - lo) / 199 for i in range(200)]
    error_bar_kind = options.get("error_bars", "sd")
    for entry, ds in zip(result["datasets"], data["datasets"]):
        entry["curve"] = {
            "x": grid,
            "y": [float(v) for v in schild.shift_func(
                grid, entry["antagonist"], result["fitted_values"])],
        }
        entry["points"] = {
            "x": x_col,
            "bars": descriptive.error_bars(ds["ys"], error_bar_kind),
        }
    return {"analysis": "ec50_shift", **result}


def _pzfx_import(data, options):
    """Import a Prism file, either format: .pzfx XML or a .prism archive.

    Which one it is comes from the bytes, not the file name, so a project
    renamed on the way out of Prism still opens.
    """
    if data.get("pzfx_b64"):
        raw = base64.b64decode(data["pzfx_b64"])
        if prism_project.looks_like_prism_project(raw):
            result = prism_project.parse_prism(raw)
        else:
            result = pzfx.parse_pzfx(raw)
    else:
        result = pzfx.parse_pzfx(data["text"])
    return {"analysis": "pzfx_import", **result}


def _roc(data, options):
    cols, names = _flatten_columns(data)
    ia, ib = options.get("patients", 0), options.get("controls", 1)
    result = methodcomp.roc_curve(
        cols[ia], cols[ib],
        higher_is_abnormal=options.get("higher_is_abnormal", True))
    result["names"] = [names[ia], names[ib]]
    return result


def _bland_altman(data, options):
    cols, names = _flatten_columns(data)
    ia, ib = options.get("dataset_a", 0), options.get("dataset_b", 1)
    result = methodcomp.bland_altman(cols[ia], cols[ib])
    result["names"] = [names[ia], names[ib]]
    return result


def _rout_column(data, options):
    cols, names = _flatten_columns(data)
    return {
        "analysis": "rout_column",
        "datasets": [
            {"name": name, **methodcomp.rout_column(
                col, q=options.get("q", 0.01))}
            for name, col in zip(names, cols)
        ],
    }


def _summary_convert(data, options):
    """Summary-format table -> mean/SD/SEM/n per row and error bars.

    data: {"format": fmt, "x": [...] (optional),
           "datasets": [{"name", "rows": [[subcolumn values] per row]}]}
    fmt: a summary.FORMATS id (also accepted as options.format).
    options: {"error_bars": "sd"|"sem"|"ci95"|"range"|"none"|"entered",
              "ci_level": 0.95,
              "collapse_to": fmt (optional; for format "replicates",
                                  also return the table in that format)}
    Returns {"format", "label", "subcolumns", "datasets": [{"name",
    "rows": [{mean, sd, sem, n, exact, lo, hi}], "bars": [{mean, lo, hi,
    n, kind, requested}]}], "canonical": {x, format, datasets: [{name,
    format, rows, ys, mean, sd, sem, n, lo, hi, exact}]}} and "collapsed".
    """
    fmt = summary.payload_format(data, options)
    kind = options.get("error_bars", "sd")
    ci_level = options.get("ci_level", 0.95)
    out = []
    for ds in data["datasets"]:
        rows = ds.get("rows", ds.get("ys", []))
        out.append({
            "name": ds.get("name", ""),
            "rows": [summary.to_mean_sd_n(r, fmt) for r in rows],
            "bars": summary.error_bars(rows, fmt, kind, ci_level=ci_level),
        })
    result = {"analysis": "summary_convert", "format": fmt,
              "label": summary.FORMATS[fmt]["label"],
              "subcolumns": summary.FORMATS[fmt]["subcolumns"],
              "datasets": out,
              "canonical": summary.expand_summary_table(
                  data.get("x"), data["datasets"], fmt)}
    if options.get("collapse_to"):
        result["collapsed"] = summary.collapse_to_summary(
            {"x": data.get("x"), "datasets": data["datasets"]},
            options["collapse_to"], kind=options.get("collapse_kind", "sd"))
    return result


def _ttest_summary(data, options):
    """t test from data entered as mean, SD/SEM/%CV and n.

    data: {"format": "mean_sd_n" | "mean_sem_n" | "mean_cv_n" |
           "mean_ci_n", "datasets": [{"name", "rows": [[mean, sd, n]]}]}
          (one group per dataset, from options.row or the first row with
          a mean), or {"groups": [{"name", "mean", "sd"|"sem"|"cv", "n"}]}.
    options: {"kind": "unpaired" (default) | "one_sample",
              "dataset_a": 0, "dataset_b": 1, "welch": false,
              "hypothetical": 0.0 (one_sample), "ci_level": 0.95}
    Result: same keys as the "ttest" analysis (unpaired_t / one_sample_t
    dicts) plus "names" and "exact".
    """
    fmt = summary.payload_format(data, options)
    groups, names = summary.groups_from_payload(data, fmt, options.get("row"))
    kind = options.get("kind", "unpaired")
    ci_level = options.get("ci_level", 0.95)
    ia, ib = options.get("dataset_a", 0), options.get("dataset_b", 1)
    if kind == "unpaired":
        result = summary.unpaired_t_summary(
            groups[ia], groups[ib], welch=options.get("welch", False),
            ci_level=ci_level, fmt=fmt)
        result["names"] = [names[ia], names[ib]]
        # as the raw-data ttest: does the SD grow with the mean? (only
        # the means can be checked for positivity here)
        stats_ = [{"name": nm, "n": result[f"n_{s}"],
                   "mean": result[f"mean_{s}"],
                   "sd": (result[f"sem_{s}"] * result[f"n_{s}"] ** 0.5
                          if result[f"n_{s}"] >= 2 else None)}
                  for nm, s in zip(result["names"], ("a", "b"))]
        result["scale_check"] = logscale.scale_check_from_stats(
            stats_, all(g["mean"] > 0 for g in stats_))
    elif kind == "one_sample":
        result = summary.one_sample_t_summary(
            groups[ia], float(options.get("hypothetical", 0.0)),
            ci_level=ci_level, fmt=fmt)
        result["test"] = "one_sample_t"
        result["names"] = [names[ia]]
    else:
        raise ValueError("data entered as mean, SD (or SEM) and N allow only "
                         "an unpaired (or Welch) or one-sample t test")
    return {"analysis": "ttest_summary", **result}


def _anova_summary(data, options):
    """Ordinary one-way ANOVA from mean, SD/SEM/%CV and n per group.

    data: as for ttest_summary (one group per dataset or data.groups).
    options: {"comparisons": "tukey"|"dunnett"|"bonferroni"|"sidak"|
              "holm_sidak" (optional), "control_index": 0,
              "ci_level": 0.95}
    Result: same keys as the parametric "anova" analysis (table,
    group_summaries, brown_forsythe = None values, bartlett,
    multiple_comparisons) plus "exact".
    """
    if options.get("kind", "parametric") != "parametric":
        raise ValueError("nonparametric and repeated-measures ANOVA need the "
                         "raw data, not mean, SD and N")
    fmt = summary.payload_format(data, options)
    groups, names = summary.groups_from_payload(data, fmt, options.get("row"))
    return {"analysis": "anova_summary", "kind": "parametric",
            **summary.one_way_anova_summary(
                groups, names, comparisons=options.get("comparisons"),
                control_index=options.get("control_index", 0),
                ci_level=options.get("ci_level", 0.95), fmt=fmt)}


def _two_way_anova_summary(data, options):
    """Two-way ANOVA from cells entered as mean, SD/SEM/%CV and n.

    data: {"format": fmt, "datasets": [{"name", "rows": [[mean, sd, n]
           per table row]}]}; cell (row r, dataset j) = rows[r] of
           dataset j (blank cells allowed).
    options: as for two_way_anova: row_factor, col_factor, comparisons
             ("tukey"|"sidak"|"bonferroni"), direction, row_names.
    Result: same keys as the "two_way_anova" analysis.
    """
    fmt = summary.payload_format(data, options)
    cells, cfmt = summary.cells_from_payload(data, fmt)
    names = [ds.get("name", "") for ds in data["datasets"]]
    result = {"analysis": "two_way_anova_summary",
              "dataset_names": names,
              **summary.two_way_anova_summary(
                  cells, row_factor=options.get("row_factor", "Rows"),
                  col_factor=options.get("col_factor", "Columns"), fmt=cfmt)}
    if options.get("interaction_contrasts", True):
        # as two_way_anova (opendose.twoway_contrasts), from mean/SD/n
        means_, ns_, ss_w, df_w = twoway_contrasts.summary_cell_stats(
            summary._cells(cells, cfmt))
        result.update(twoway_contrasts.contrasts_from_stats(
            means_, ns_, ss_w, df_w, result,
            row_names=options.get("row_names") or [
                f"Row {i + 1}" for i in range(len(cells))],
            col_names=[nm or f"Column {j + 1}" for j, nm in
                       enumerate(names)],
            ci_level=options.get("ci_level", 0.95),
            rows=options.get("interaction_rows"),
            cols=options.get("interaction_cols")))
    method = options.get("comparisons")
    if method:
        row_names = options.get("row_names") or [
            f"Row {i + 1}" for i in range(len(cells))]
        result["multiple_comparisons"] = summary.two_way_comparisons_summary(
            cells, method=method,
            direction=options.get("direction", "columns_within_rows"),
            row_names=row_names, col_names=names, fmt=cfmt)
    return result


def _formula_transform(data, options):
    """User-defined formulas (formulas.py).

    options.mode:
      "transform" (default): data = {"x", "datasets"}; options:
        {"x_formula"?: str, "y_formula"?: str (e.g. "Y = Y*K" or just
         "Y*K"; multi-line, <B>/<~A> prefixes allowed), "constants"?:
         {"K": 2}, "constants_by_dataset"?: [{...}], "seed"?: int,
         "column_refs"?: "mean"|"replicate"}
        -> {"x", "datasets": [{"name", "ys"}], "staggered": bool}
      "calculate": data = {"columns": {name: [values]}}; options:
        {"formulas": [{"name", "formula"}], "constants"?, "seed"?}
        -> {"columns": {new name: [values]}}
      "validate": options {"formula", "known_names"?, "program"?: bool}
        -> {"ok", "errors": [{message, line, column, text}], "variables",
            "functions", "assigned"}
      "functions": -> {"functions": [names]}
    Formula errors come back as {"error": "... (line L, column C)"}.
    """
    mode = options.get("mode", "transform")
    if mode == "validate":
        return {"analysis": "formula_transform", "mode": mode,
                **formulas.validate(options.get("formula", ""),
                                    options.get("known_names"),
                                    program=options.get("program"),
                                    default_target=options.get("target"))}
    if mode == "functions":
        return {"analysis": "formula_transform", "mode": mode,
                "functions": formulas.FUNCTION_NAMES}
    if mode == "calculate":
        return {"analysis": "formula_transform", "mode": mode,
                **formulas.calculate_variables(
                    data["columns"], options.get("formulas") or [],
                    constants=options.get("constants"),
                    seed=options.get("seed"))}
    return {"analysis": "formula_transform", "mode": "transform",
            **formulas.apply_transform(
                data["x"], data["datasets"],
                x_formula=options.get("x_formula"),
                y_formula=options.get("y_formula"),
                constants=options.get("constants"),
                constants_by_dataset=options.get("constants_by_dataset"),
                seed=options.get("seed"),
                column_refs=options.get("column_refs", "mean"))}


def _transform_concentrations(data, options):
    """X = log(X) for concentrations. options: {"zero": "blank"|"value"|
    "auto", "zero_value"?, "units"?: "multiply"|"divide", "factor"?,
    "log": "log10"|"ln"|null}. Returns the table with new x plus
    "zero_replacement"; datasets pass through unchanged."""
    res = manipulate.transform_concentrations(
        data["x"], zero=options.get("zero", "blank"),
        zero_value=options.get("zero_value"), units=options.get("units"),
        factor=options.get("factor"), log=options.get("log", "log10"))
    return {"analysis": "transform_concentrations", "x": res["x"],
            "zero_replacement": res["zero_replacement"],
            "datasets": [{"name": ds.get("name", ""), "ys": ds["ys"]}
                         for ds in data.get("datasets", [])]}


def _remove_baseline(data, options):
    """options: {"baseline": "column"|"alternate"|"first_row"|"last_row"|
    "first_rows"|"last_rows"|"first_last_rows"|"value",
    "baseline_dataset"?: int, "k"?: int, "value"?: float,
    "operation": "subtract"|"divide"|"fraction_difference"|
    "percent_difference"|"percent_of_baseline"|"add"|"multiply",
    "replicates": "mean"|"each", "pairs": "total_first"|"baseline_first",
    "linear_baseline": bool}. Returns {"x", "datasets",
    "baseline_lines"?} (baseline data sets omitted)."""
    return {"analysis": "remove_baseline", **manipulate.remove_baseline(
        data["x"], data["datasets"],
        baseline=options.get("baseline", "column"),
        baseline_dataset=options.get("baseline_dataset", 0),
        k=options.get("k", 1), value=options.get("value"),
        operation=options.get("operation", "subtract"),
        replicates=options.get("replicates", "mean"),
        pairs=options.get("pairs", "total_first"),
        linear_baseline=options.get("linear_baseline", False))}


def _transpose(data, options):
    """data may carry "row_titles". options: {"column_titles":
    "row_titles"|"x"|"numbers", "replicates": "keep"|"mean"}. Returns
    {"x": [1..n], "row_titles": old data-set names, "datasets": one per
    old row}."""
    return {"analysis": "transpose", **manipulate.transpose(
        data["x"], data["datasets"], row_titles=data.get("row_titles"),
        column_titles=options.get("column_titles", "row_titles"),
        replicates=options.get("replicates", "keep"))}


def _prune_rows(data, options):
    """options: {"x_min"?, "x_max"?, "mode": "none"|"keep_every"|
    "average", "k": int, "start": 1-based int, "average":
    "keep_replicates"|"mean", "partial": "keep"|"drop"}. Returns {"x",
    "datasets", "kept_rows", "row_titles"?}."""
    return {"analysis": "prune_rows", **manipulate.prune_rows(
        data["x"], data["datasets"], x_min=options.get("x_min"),
        x_max=options.get("x_max"), mode=options.get("mode", "none"),
        k=options.get("k", 2), start=options.get("start", 1),
        average=options.get("average", "keep_replicates"),
        partial=options.get("partial", "keep"),
        row_titles=data.get("row_titles"))}


def _fraction_of_total_table(data, options):
    """Fraction of total on a table without subcolumns. options:
    {"divide_by": "column"|"row"|"grand"|"all", "as_percent": bool,
    "ci": bool, "ci_method": "wilson_brown"|"wilson"|"clopper_pearson",
    "ci_level": 0.95}. Returns {"datasets": [{"name", "ys", "ci_lower"?,
    "ci_upper"?}], "column_totals", "row_totals", "grand_total"} or, for
    "all", {"layouts": {"column"|"row"|"grand": datasets}}."""
    return {"analysis": "fraction_of_total_table",
            "x": data.get("x"),
            **manipulate.fraction_of_total(
                data["datasets"],
                divide_by=options.get("divide_by", "column"),
                as_percent=options.get("as_percent", False),
                ci=options.get("ci", False),
                ci_method=options.get("ci_method", "wilson_brown"),
                ci_level=options.get("ci_level", 0.95))}


def _simulate_xy(data, options):
    """options: {"model": nlfit model id, "params": {..} | [{..} per data
    set], "x": [..] | {"kind": "arithmetic"|"geometric"|"linear"|"log",
    "start", "increment"|"factor", "stop"|"count"}, "n_datasets",
    "replicates", "error": {"kind": "none"|"gaussian"|"relative"|"t"|
    "poisson"|"binomial", "sd"|"percent"|"df"|"n", "outliers"?}, "seed",
    "source": "model"|"table", "user_equation"?: a user-defined equation
    to simulate from instead of "model" (simulate.simulate_xy)}. source "table" uses the row means of
    data.datasets (at data.x) as ideal Y. Returns an API table {"x",
    "datasets": [{"name", "ys", "ideal"}], "seed", ...}."""
    ideal, x = None, options.get("x")
    if options.get("source") == "table":
        x = data["x"]
        ideal = [[None if not [v for v in r if v is not None] else
                  sum(v for v in r if v is not None) /
                  len([v for v in r if v is not None]) for r in ds["ys"]]
                 for ds in data["datasets"]]
    return {"analysis": "simulate_xy", **simulate.simulate_xy(
        options.get("model"), options.get("params"), x=x,
        n_datasets=options.get("n_datasets", 1),
        replicates=options.get("replicates", 1), error=options.get("error"),
        ideal=ideal, names=options.get("names"), seed=options.get("seed"),
        user_equation=(options.get("user_equation")
                       if options.get("source") != "table" else None))}


def _simulate_column(data, options):
    """options: {"groups": [{"name", "n", "mean", "error"?}], "error",
    "random_means"?: {"mean", "sd"}, "seed"}. Returns a column table
    {"x", "datasets": [{"name", "ys": [[v]...], "population_mean"}],
    "seed"}."""
    return {"analysis": "simulate_column", **simulate.simulate_column(
        options.get("groups") or [], error=options.get("error"),
        random_means=options.get("random_means"), seed=options.get("seed"))}


def _simulate_contingency(data, options):
    """options: {"design": "cross_sectional"|"prospective"|"experimental"|
    "case_control", "total"?, "row_totals"?, "column_totals"?,
    "cell_probabilities"?, "row_probabilities"?,
    "outcome_probabilities"?, "exposure_probabilities"?, "row_titles"?,
    "column_titles"?, "seed"}. Returns {"table", "row_titles",
    "column_titles", "design", "seed"} (feed "table" to "contingency")."""
    opts = {k: v for k, v in options.items() if k != "seed"}
    return {"analysis": "simulate_contingency",
            **simulate.simulate_contingency(**opts,
                                            seed=options.get("seed"))}


def _monte_carlo(data, options):
    """options: {"simulation": {"kind": "xy"|"column"|"contingency",
    ...that simulate_* options}, "analysis": {"analysis": name,
    "options": {...}}, "n_repeats": int (<= 10000), "tabulate": path |
    [paths] | {label: path} (e.g. "datasets.0.fit.params.HillSlope.ci95.0"),
    "hit"?: condition, "seed"?, "keep_values"?: bool}. Returns
    {"n_repeats", "seed", "n_failed", "errors", "tabulated": {label:
    {n, mean, sd, sem, median, min, max, percentiles}}, "values"?,
    "hits"?: {n_hits, n_decided, fraction, ci95, flags}}."""
    return {"analysis": "monte_carlo", **simulate.monte_carlo(
        options["simulation"], options["analysis"],
        options.get("n_repeats", 100), options["tabulate"],
        seed=options.get("seed"), hit=options.get("hit"),
        keep_values=options.get("keep_values", True))}


# ---- multiple-variables and parts-of-whole tables (multivar, partsofwhole)

def _mv_variables(data):
    """Multiple-variables payload: data = {"variables": [{"name": str,
    "values": [number | str | null], "kind"?: "continuous" |
    "categorical"}]}; one entry per column, rows aligned."""
    if "variables" not in data:
        raise ValueError("multiple-variables data needs data.variables")
    return data["variables"]


def _multivar_descriptive(data, options):
    """data: multiple-variables table. options: {ci_level?}."""
    return {"analysis": "multivar_descriptive",
            **multivar.describe_variables(_mv_variables(data),
                                          ci_level=options.get("ci_level", 0.95))}


def _correlation_matrix(data, options):
    """data: multiple-variables table (continuous columns are used), or a
    column table (data.datasets, one variable per dataset, rows aligned).
    options: {method: pearson|spearman, missing: pairwise|listwise,
    tails: 1|2, ci_level, variables?: [names], control?: [names] (partial
    correlations controlling for these, which leave the matrix)}."""
    if "variables" in data:
        variables = data["variables"]
    else:
        variables = [{"name": ds.get("name", ""), "kind": "continuous",
                      "values": [row[0] if row else None for row in ds["ys"]]}
                     for ds in data["datasets"]]
    names = options.get("variables")
    control = [str(c) for c in (options.get("control") or [])]
    if names:
        variables = [v for v in variables
                     if v.get("name") in names or v.get("name") in control]
    return {"analysis": "correlation_matrix",
            **multivar.correlation_matrix(
                variables, method=options.get("method", "pearson"),
                missing=options.get("missing", "pairwise"),
                ci_level=options.get("ci_level", 0.95),
                tails=int(options.get("tails", 2)), control=control)}


def _with_analysed_rows(result, variables, used):
    """The result with "analysed_rows" (multivar.analysed_rows: n used of
    the table's rows, and each dropped row with the variables blank or
    not a number in it) in place of the internal rows_used."""
    rows = result.pop("rows_used", None)
    if rows is not None:
        result["analysed_rows"] = multivar.analysed_rows(variables, used, rows)
    return result


def _multiple_regression(data, options):
    """data: multiple-variables table. options: {outcome: name,
    predictors: [names], interactions?: [[a, b]], reference_levels?:
    {variable: level}, ci_level?}. The result's analysed_rows says which
    rows were used and why the others were dropped."""
    variables = _mv_variables(data)
    return _with_analysed_rows(
        {"analysis": "multiple_regression",
         **multivar.multiple_regression(
             variables, options["outcome"], options["predictors"],
             interactions=options.get("interactions") or (),
             reference_levels=options.get("reference_levels"),
             ci_level=options.get("ci_level", 0.95))},
        variables, [options["outcome"], *options["predictors"]])


def _ancova(data, options):
    """data: multiple-variables table. options: {outcome (the follow-up),
    group, baseline, reference_level?, ci_level?}: the follow-up compared
    between groups adjusted for the baseline (multivar.ancova)."""
    variables = _mv_variables(data)
    return _with_analysed_rows(
        {"analysis": "ancova",
         **multivar.ancova(
             variables, options["outcome"], options["group"], options["baseline"],
             reference_level=options.get("reference_level"),
             ci_level=options.get("ci_level", 0.95))},
        variables, [options["outcome"], options["group"], options["baseline"]])


def _logistic_regression(data, options):
    """data: multiple-variables table (or XY-style {"x", "y"} lists for
    simple logistic regression). options: {outcome, predictors,
    interactions?, reference_levels?, outcome_positive?, ci_level?,
    ci_method?: profile|wald, cutoff?: 0.5, hl_groups?: 10, firth?: false
    (Firth's penalized likelihood, finite under separation)}. A refusal
    for separation carries error_kind = "separation"."""
    if "variables" in data:
        variables = data["variables"]
        outcome, predictors = options["outcome"], options["predictors"]
    else:
        variables = [{"name": "X", "values": data["x"]},
                     {"name": "Y", "values": data["y"]}]
        outcome, predictors = "Y", ["X"]
    return _with_analysed_rows(
        {"analysis": "logistic_regression",
         **multivar.logistic_regression(
             variables, outcome, predictors,
             interactions=options.get("interactions") or (),
             reference_levels=options.get("reference_levels"),
             outcome_positive=options.get("outcome_positive"),
             ci_level=options.get("ci_level", 0.95),
             ci_method=options.get("ci_method", "profile"),
             cutoff=options.get("cutoff", 0.5),
             hl_groups=int(options.get("hl_groups", 10)),
             firth=bool(options.get("firth", False)))},
        variables, [outcome, *predictors])


def _poisson_regression(data, options):
    """data: multiple-variables table. options: {outcome, predictors,
    interactions?, reference_levels?, exposure? (variable name: its log is
    an offset), ci_level?, ci_method?: profile|wald, quasi?: false
    (quasi-Poisson: SEs times sqrt(phi), t tests, Wald t CIs, F test)}."""
    variables = _mv_variables(data)
    return _with_analysed_rows(
        {"analysis": "poisson_regression",
         **multivar.poisson_regression(
             variables, options["outcome"],
             options["predictors"],
             interactions=options.get("interactions") or (),
             reference_levels=options.get("reference_levels"),
             exposure=options.get("exposure") or None,
             ci_level=options.get("ci_level", 0.95),
             ci_method=options.get("ci_method", "profile"),
             quasi=bool(options.get("quasi", False)))},
        variables, [options["outcome"], *options["predictors"]])


def _binomial_regression(data, options):
    """data: multiple-variables table. options: {outcome (the positives),
    totals (the number counted), predictors, interactions?,
    reference_levels?, ci_level?, ci_method?: profile|wald, quasi?: false
    (quasi-binomial: SEs times sqrt(phi), t tests, F tests)}."""
    variables = _mv_variables(data)
    return _with_analysed_rows(
        {"analysis": "binomial_regression",
         **multivar.binomial_regression(
             variables, options["outcome"], options["totals"], options["predictors"],
             interactions=options.get("interactions") or (),
             reference_levels=options.get("reference_levels"),
             ci_level=options.get("ci_level", 0.95),
             ci_method=options.get("ci_method", "profile"),
             quasi=bool(options.get("quasi", False)))},
        variables, [options["outcome"], options["totals"], *options["predictors"]])


def _negative_binomial_regression(data, options):
    """data: multiple-variables table. options: {outcome (counts),
    predictors, interactions?, reference_levels?, exposure? (its log is an
    offset), ci_level?, ci_method?: profile|wald}."""
    variables = _mv_variables(data)
    return _with_analysed_rows(
        {"analysis": "negative_binomial_regression",
         **multivar.negative_binomial_regression(
             variables, options["outcome"], options["predictors"],
             interactions=options.get("interactions") or (),
             reference_levels=options.get("reference_levels"),
             exposure=options.get("exposure") or None,
             ci_level=options.get("ci_level", 0.95),
             ci_method=options.get("ci_method", "profile"))},
        variables, [options["outcome"], *options["predictors"]])


def _pca(data, options):
    """data: multiple-variables table. options: {variables?: [names],
    standardize?: true, selection?: parallel_analysis|kaiser|variance|
    all|number, n_components?, variance_threshold?: 75,
    n_simulations?: 1000, percentile?: 95, seed?: 0}."""
    return {"analysis": "pca",
            **multivar.pca(
                _mv_variables(data), names=options.get("variables"),
                standardize=options.get("standardize", True),
                selection=options.get("selection", "parallel_analysis"),
                n_components=options.get("n_components"),
                variance_threshold=options.get("variance_threshold", 75.0),
                n_simulations=options.get("n_simulations", 1000),
                percentile=options.get("percentile", 95.0),
                seed=options.get("seed", 0))}


def _mv_rearrange(data, options):
    """data: multiple-variables table. options: {select?: [names],
    filters?: [{variable, op, value}], combine?: and|or, transforms?:
    [{variable, func, new_name?}]}."""
    return {"analysis": "mv_rearrange",
            **multivar.rearrange(
                _mv_variables(data), select=options.get("select"),
                filters=options.get("filters") or (),
                transforms=options.get("transforms") or (),
                combine=options.get("combine", "and"))}


def _pow_column(ds):
    """One parts-of-whole column: ds.values, or the first subcolumn of
    ds.ys rows."""
    if "values" in ds:
        return list(ds["values"])
    return [row[0] if row else None for row in ds["ys"]]


def _chisq_goodness_of_fit(data, options):
    """data: {"datasets": [{"name", "ys": [[count], ...]} | {"values"}],
    "row_titles"?: [str]}. options: {dataset?: 0, expected: [numbers],
    expected_as?: auto|counts|percent|fraction}."""
    ds = data["datasets"][options.get("dataset", 0)]
    observed = _pow_column(ds)
    titles = data.get("row_titles") or options.get("categories")
    keep = [i for i, v in enumerate(observed) if v is not None]
    expected = options["expected"]
    result = partsofwhole.chisq_goodness_of_fit(
        [observed[i] for i in keep], [expected[i] for i in keep],
        expected_as=options.get("expected_as", "auto"),
        categories=[titles[i] for i in keep] if titles else None)
    return {"analysis": "chisq_goodness_of_fit", "name": ds.get("name", ""),
            **result}


def _fraction_of_total(data, options):
    """data: {"datasets": [...]} (parts-of-whole or column table; first
    subcolumn) or {"table": [[row values]]} (contingency layout).
    options: {divide_by?: column|row|grand, as_percent?, ci?, ci_method?:
    wilson_brown|wilson|clopper_pearson, ci_level?}."""
    if "table" in data:
        rows = data["table"]
        columns = [[row[j] if j < len(row) else None for row in rows]
                   for j in range(max(len(r) for r in rows))]
        names = None
    else:
        columns = [_pow_column(ds) for ds in data["datasets"]]
        names = [ds.get("name", "") for ds in data["datasets"]]
    result = partsofwhole.fraction_of_total(
        columns, divide_by=options.get("divide_by", "column"),
        as_percent=options.get("as_percent", False),
        ci=options.get("ci", False),
        ci_method=options.get("ci_method", "wilson_brown"),
        ci_level=options.get("ci_level", 0.95))
    return {"analysis": "fraction_of_total", "names": names, **result}


def _nested_groups(data):
    groups = data["groups"]
    return ([g.get("subgroups") or [] for g in groups],
            [g.get("name", "") for g in groups],
            [g.get("subgroup_names") for g in groups])


def _nested_residuals(result):
    """The nested result with its conditional residuals as residual plots
    for the Checks row (residuals.mixed_residuals)."""
    res = result.get("residuals")
    if not res:
        return result
    names = result.get("names") or []
    sd = (result.get("random_effects") or {}).get("within_subcolumns", {}).get("sd")
    result["residual_diagnostics"] = _model_residuals(
        lambda: residuals.mixed_residuals(
            {"value": res["value"], "fitted": res["fitted"],
             "group": res["group"]},
            scale=sd, group_names=names,
            labels=[f"{names[g]}, subcolumn {s + 1}"
                    for g, s in zip(res["group"], res["subcolumn"])],
            fitted_label="Fitted value (group mean + subcolumn effect)",
            what="its group mean and its subcolumn's predicted effect"))
    return result


def _nested_ttest(data, options):
    """Nested t test (mixed model, random subcolumn effect).
    data = {"groups": [{"name": str, "subgroups": [[values...], ...],
    "subgroup_names": [str, ...] (optional)}, x2]}, None = missing.
    options: ci_level (0.95), swap (False -> difference is B - A),
    negative_variance ("allow" | "zero")."""
    groups, names, sub_names = _nested_groups(data)
    return _nested_residuals(nested.nested_t_test(
        groups, names=names, subgroup_names=sub_names,
        ci_level=options.get("ci_level", 0.95),
        swap=options.get("swap", False),
        negative_variance=options.get("negative_variance", "allow"),
        ddf=options.get("ddf", "containment")))


def _nested_anova(data, options):
    """Nested one-way ANOVA. data as for nested_ttest with >= 2 groups.
    options: comparisons (tukey | dunnett | bonferroni | sidak |
    holm_sidak | fisher), control_index (Dunnett), ci_level,
    negative_variance."""
    groups, names, sub_names = _nested_groups(data)
    return _nested_residuals(nested.nested_one_way_anova(
        groups, names=names, subgroup_names=sub_names,
        comparisons=options.get("comparisons"),
        control_index=options.get("control_index", 0),
        ci_level=options.get("ci_level", 0.95),
        negative_variance=options.get("negative_variance", "allow"),
        ddf=options.get("ddf", "containment")))


def _mixed_rm_oneway(data, options):
    """Repeated-measures one-way via the mixed model (missing values
    allowed). Payload as rm_anova: datasets = treatments, ys rows =
    subjects, first subcolumn used, None = missing. options: method
    ("mixed" always | "auto" = RM ANOVA unless values are missing |
    "anova"), comparisons, control_index, ci_level, negative_variance
    ("allow" | "remove"), ddf ("containment" | "kenward_roger" |
    "satterthwaite": denominator df, opendose.ddfm)."""
    names = [ds.get("name", "") for ds in data["datasets"]]
    aligned = [[row[0] if row else None for row in ds["ys"]]
               for ds in data["datasets"]]
    method = options.get("method", "mixed")
    kwargs = {}
    if method != "anova":
        kwargs = {"comparisons": options.get("comparisons"),
                  "control_index": options.get("control_index", 0),
                  "ci_level": options.get("ci_level", 0.95),
                  "negative_variance": options.get("negative_variance",
                                                   "allow"),
                  "ddf": options.get("ddf", "containment")}
    result = mixedmodel.rm_one_way(aligned, names, method=method, **kwargs)
    out = {"analysis": result.get("analysis", "rm_one_way_anova"), **result}
    res = out.pop("residuals", None)
    # residual plots under the results, as the other column tests
    # (residuals.mixed_residuals; RM ANOVA: residuals.rm_residuals)
    out["residual_check"] = _model_residuals(
        lambda: residuals.mixed_residuals(
            {"value": res["value"], "fitted": res["fitted"],
             "group": res["treatment"]},
            scale=res["residual_sd"], group_names=out["names"],
            labels=[f"Subject {s + 1}, {out['names'][t]}"
                    for s, t in zip(res["subject"], res["treatment"])],
            fitted_label="Fitted value (treatment mean + subject effect)",
            what="its treatment mean and its subject's predicted effect")
        if res is not None else residuals.rm_residuals(aligned, names))
    return out


def _mixed_rm_twoway(data, options):
    """Two-way repeated measures via the mixed model (missing values
    allowed). Payload as rm_two_way: datasets = columns, ys[row] =
    subcolumn values (subcolumn = subject), None = missing. options:
    design ("mixed" | "both"), row_names, method ("mixed" | "auto" |
    "anova"), comparisons, direction (columns_within_rows |
    rows_within_columns | column_means | row_means), control_index,
    ci_level, negative_variance, ddf (as mixed_rm_oneway)."""
    names = [ds.get("name", "") for ds in data["datasets"]]
    n_rows = max(len(ds["ys"]) for ds in data["datasets"])
    cells = [[ds["ys"][r] if r < len(ds["ys"]) else []
              for ds in data["datasets"]] for r in range(n_rows)]
    row_names = options.get("row_names") or [
        f"Row {i + 1}" for i in range(n_rows)]
    method = options.get("method", "mixed")
    kwargs = {}
    if method != "anova":
        kwargs = {"comparisons": options.get("comparisons"),
                  "direction": options.get("direction",
                                           "columns_within_rows"),
                  "control_index": options.get("control_index", 0),
                  "ci_level": options.get("ci_level", 0.95),
                  "negative_variance": options.get("negative_variance",
                                                   "allow"),
                  "ddf": options.get("ddf", "containment")}
    return mixedmodel.rm_two_way(
        cells, design=options.get("design", "mixed"), method=method,
        row_names=row_names, col_names=names, **kwargs)


def _q_fraction(options, default=0.05):
    """FDR level Q as a fraction: options.q_percent (as entered in the
    guide's dialogs, 5 = 5%) or options.q (a fraction; values above 1
    are read as percentages)."""
    if options.get("q_percent") is not None:
        return float(options["q_percent"]) / 100.0
    q = float(options.get("q", default))
    return q / 100.0 if q > 1 else q


def _grouped_rows(data):
    """Grouped-table rows: (row titles, names, [ds["ys"] per data set])."""
    dsets = data["datasets"]
    n_rows = max((len(ds.get("ys") or []) for ds in dsets), default=0)
    titles = list(data.get("row_titles") or [])
    titles = [t if t not in (None, "") else f"Row {i + 1}"
              for i, t in enumerate(titles[:n_rows])]
    titles += [f"Row {i + 1}" for i in range(len(titles), n_rows)]
    names = [ds.get("name")
             or (chr(65 + d) if d < 26 else f"Data set {d + 1}")
             for d, ds in enumerate(dsets)]
    ys = [[(ds.get("ys") or [])[i] if i < len(ds.get("ys") or []) else []
           for i in range(n_rows)] for ds in dsets]
    return titles, names, ys


def _multiple_row_tests(data, options):
    """Multiple t tests (and nonparametric tests), one per row.

    data: grouped table {"row_titles"?: [str], "datasets": [{"name",
    "ys": [[replicates] per row]}]} (null = missing; paired tests match
    subcolumn k of A with subcolumn k of B). options: dataset_a (0),
    dataset_b (1), test ("welch" | "unpaired" | "pooled" |
    "lognormal_welch" | "lognormal_unpaired" | "lognormal_pooled" |
    "paired" | "ratio_paired" | "mann_whitney" | "kolmogorov_smirnov" |
    "wilcoxon"; default "welch"), method ("bky" default | "bh" | "by" |
    "holm_sidak" | "sidak" | "bonferroni" | "none"), alpha (0.05), q /
    q_percent (FDR level, default 5%), swap (false: difference = A - B).

    Result: {"analysis", "test", "names", "direction", "method",
    "approach": "fdr"|"significance", "flag_label", "alpha", "q",
    "n_tests", "n_omitted", "n_flagged", "n_true_null_estimate" (BKY),
    "pooled": {variance, sd, df, scale} | null, "rows": [{row, index,
    n_a, n_b, mean_a/mean_b | geometric_mean_a/b + ratio +
    log10_difference | median_a/b (+ hodges_lehmann), difference,
    se_difference?, statistic_name ("t"|"U"|"W"|"D"), statistic, df, p,
    p_adjusted (adjusted P or q value; null for "none"), significant,
    neg_log10_p, s_value, omitted? (reason, row left out)}],
    "flagged_rows": [row indices sorted by P]}."""
    titles, names, ys = _grouped_rows(data)
    ia, ib = options.get("dataset_a", 0), options.get("dataset_b", 1)
    return {"analysis": "multiple_row_tests",
            **rowtests.multiple_t_tests(
                ys[ia], ys[ib], row_titles=titles,
                names=[names[ia], names[ib]],
                test=options.get("test", "welch"),
                method=options.get("method", "bky"),
                alpha=options.get("alpha", 0.05), q=_q_fraction(options),
                swap=bool(options.get("swap", False)))}


def _row_means(data, options):
    """Row means and totals of a grouped (or column/XY) table.

    data: {"row_titles"?, "datasets": [{"name", "ys"}]}. options:
    calculate ("mean" | "total" | "median" | "geometric_mean"), error
    (mean: "none"|"sd"|"sem"|"cv"|"ci"; median: "none"|"quartiles"|
    "minmax"|"percentiles"; geometric_mean: "none"|"geometric_sd"|"ci";
    total: "none"), scope ("row": each data set's summary first, then
    across data sets (default) | "all_values": all replicates pooled |
    "dataset": one result per data set), ci_level (0.95), percentile
    (10 -> 10th and 90th).

    Result: {"analysis", "calculate", "error_type", "scope", "row_titles",
    "rows": [{row, value, n, sd?|sem?|cv_percent?|ci?|geometric_sd?,
    lower?, upper?}]} or, for scope "dataset", "datasets": [{name,
    rows: [...]}] (lower/upper are the error-bar ends)."""
    titles, names, ys = _grouped_rows(data)
    return {"analysis": "row_means",
            **rowtests.row_means(
                ys, row_titles=titles, names=names,
                calculate=options.get("calculate", "mean"),
                error=options.get("error", "sd"),
                scope=options.get("scope", "row"),
                ci_level=options.get("ci_level", 0.95),
                percentile=options.get("percentile", 10.0))}


def _three_way_anova(data, options):
    """Three-way ANOVA (ordinary, Type III).

    data: grouped table {"row_titles"?, "datasets": [{"name", "ys"}]}
    with the guide's layout (data sets A&B vs. C&D = factor B, A&C vs.
    B&D = factor C, only A-D used), or options.column_levels = [[b, c]
    | null per data set] (0-based levels); or data = {"row_titles"?,
    "blocks": [{"name", "datasets": [...]}]}: each block is one level of
    factor C and its k-th data set is level k of factor B.
    options: factor_names ([rows, B, C]), b_level_names, c_level_names,
    comparisons (method: "tukey" | "dunnett" | "sidak" | "bonferroni" |
    "holm_sidak" | "none" (Fisher LSD) | "bky" | "bh" | "by"; omit for
    no comparisons), goal ("all_cells" | "control" | "one_factor" |
    "row1_below" | "row_means" | "row_means_control" |
    "factor_b_means" | "factor_c_means"), factor ("a"|"b"|"c" for
    one_factor), control ([row, b, c], default [0, 0, 0]), control_row,
    alpha (0.05), q / q_percent.

    Result: {"analysis", "n", "levels": [a, b, c], "factor_names",
    "type", "sources": {label: {term, ss, df, ms, F, p,
    percent_of_total}} (3 main effects, 3 two-way, 1 three-way,
    "residual"), "ss_total", "cell_means"[i][j][k], "cell_n",
    "row_titles", "b_level_names", "c_level_names", "cell_labels",
    "multiple_comparisons"?: {method, goal, n_comparisons, n_means,
    ms_error, df_error, alpha, q, means: [{label, mean, cell?}],
    comparisons: [{pair, mean_1, mean_2, difference, se, statistic, p,
    p_adjusted, ci, significant}], discoveries?}}."""
    if data.get("blocks"):
        datasets, levels, ds_names = [], [], []
        for c_lv, block in enumerate(data["blocks"]):
            for b_lv, ds in enumerate(block["datasets"]):
                datasets.append(ds)
                levels.append([b_lv, c_lv])
                ds_names.append(f"{block.get('name') or f'C{c_lv + 1}'}:"
                                f"{ds.get('name') or f'B{b_lv + 1}'}")
        table = {"row_titles": data.get("row_titles"), "datasets": datasets}
        c_default = [b.get("name") or f"C{k + 1}"
                     for k, b in enumerate(data["blocks"])]
        b_default = [ds.get("name") or f"B{j + 1}" for j, ds in
                     enumerate(data["blocks"][0]["datasets"])]
    else:
        table = data
        levels = options.get("column_levels")
        b_default = c_default = None
        ds_names = None
    titles, names, ys = _grouped_rows(table)
    ds_names = ds_names or names
    cells, owner = threeway.cells_from_datasets(ys, levels)
    nb, nc = len(cells[0]), len(cells[0][0])
    if b_default is None:
        b_default = ["/".join(ds_names[owner[(j, k)]] for k in range(nc)
                              if (j, k) in owner) for j in range(nb)]
        c_default = ["/".join(ds_names[owner[(j, k)]] for j in range(nb)
                              if (j, k) in owner) for k in range(nc)]
    b_names = options.get("b_level_names") or b_default
    c_names = options.get("c_level_names") or c_default
    labels = [[[f"{titles[i]}:{ds_names[owner[(j, k)]]}"
                if (j, k) in owner else f"{titles[i]}:{b_names[j]}:{c_names[k]}"
                for k in range(nc)] for j in range(nb)]
              for i in range(len(cells))]
    fnames = options.get("factor_names") or ["Rows", "Factor B", "Factor C"]
    result = threeway.three_way_anova(cells, factor_names=tuple(fnames))
    out = {"analysis": "three_way_anova", **result, "row_titles": titles,
           "b_level_names": b_names, "c_level_names": c_names,
           "cell_labels": labels}
    out["residual_diagnostics"] = _model_residuals(
        lambda: _three_way_residuals(cells, labels, b_names, c_names,
                                     result["sources"]["residual"]["df"]))
    method = options.get("comparisons")
    if method:
        out["multiple_comparisons"] = threeway.three_way_comparisons(
            cells, goal=options.get("goal", "all_cells"), method=method,
            alpha=options.get("alpha", 0.05), q=_q_fraction(options),
            control=options.get("control") or (0, 0, 0),
            control_row=options.get("control_row", 0),
            factor=options.get("factor"), row_names=titles,
            b_names=b_names, c_names=c_names, cell_labels=labels,
            anova=result)
    return out


def _three_way_residuals(cells, labels, b_names, c_names, df):
    """Residuals of the full three-way model: each value minus its cell
    mean (R's residuals(aov(y ~ A * B * C))), coloured by the B x C
    combination (the data set)."""
    y, codes, lab, grp = [], [], [], []
    nb, nc = len(cells[0]), len(cells[0][0])
    for i, row in enumerate(cells):
        for j in range(nb):
            for k in range(nc):
                m = 0
                for v in row[j][k]:
                    if _is_missing(v):
                        continue
                    m += 1
                    y.append(float(v))
                    codes.append((i, j, k))
                    lab.append(f"{labels[i][j][k]}, value {m}")
                    grp.append(j * nc + k)
    ci = [[c[d] for c in codes] for d in range(3)]
    fitted = residuals.linear_model_fitted(y, ci, interaction=True)
    count = {}
    for c in codes:
        count[c] = count.get(c, 0) + 1
    return residuals.model_residuals(
        y, fitted, df=df, group_index=grp,
        group_names=[f"{b_names[j]}, {c_names[k]}" for j in range(nb)
                     for k in range(nc)],
        labels=lab, single=[count[c] == 1 for c in codes],
        fitted_label="Fitted value (cell mean)",
        note=("Residuals of the three-way ANOVA: each value minus its cell "
              "mean; standardized by the square root of the residual mean "
              "square."))


def _compact_letters(data, options):
    """Compact letter display from all pairwise comparisons.

    data: {"groups": [name, ...], "means"?: [number per group],
    "comparisons": [{"a", "b"} | {"pair": "X vs. Y"}, plus
    "significant" (bool) or "p_adjusted"/"p"]} (the comparisons list of
    an ANOVA multiple-comparisons result can be passed as is). options:
    alpha (0.05), order ("descending" (default; highest mean gets the
    first letter) | "ascending" | "given"), labels ("upper" | "lower" |
    "numbers").

    Result: {"analysis", "alpha", "labels", "order": [names in display
    order], "groups": [{name, mean, letters}] (input order), "letters":
    [{letter, groups: [...]}]}."""
    return {"analysis": "compact_letters",
            **letters.compact_letters(
                data["groups"], data.get("comparisons") or [],
                means=data.get("means"), alpha=options.get("alpha", 0.05),
                order=options.get("order", "descending"),
                labels=options.get("labels", "upper"))}


def _fdr_adjust(data, options):
    """Analyze a stack of P values: FDR or family-wise correction.

    data: {"p_values": [p | null], "labels"?: [str]} or a column table
    {"datasets": [{"ys": [[p], ...]}], "row_titles"?} (first data set,
    first subcolumn). options: method ("bky" default | "bh" | "by" |
    "holm_sidak" | "sidak" | "bonferroni" | "none"), alpha (0.05), q /
    q_percent (default 5%).

    Result: {"analysis", "method", "approach", "n", "n_omitted",
    "alpha", "q", "adjusted", "significant", "discoveries",
    "thresholds" (per rank, ascending P), "n_true_null_estimate",
    "rows": [{label, p, rank, adjusted, significant, threshold}]}."""
    if "p_values" in data:
        pvals = list(data["p_values"])
        labels = list(data.get("labels") or [])
    else:
        ds = data["datasets"][0]
        pvals = [(row[0] if row else None) for row in ds["ys"]]
        labels = list(data.get("row_titles") or [])
    labels += [f"Row {i + 1}" for i in range(len(labels), len(pvals))]
    res = fdr.adjust(pvals, options.get("method", "bky"),
                     alpha=options.get("alpha", 0.05), q=_q_fraction(options))
    valid = sorted((i for i, p in enumerate(pvals) if res["significant"][i]
                    is not None), key=lambda i: float(pvals[i]))
    rank = {i: r for r, i in enumerate(valid)}
    rows = []
    for i, p in enumerate(pvals):
        r = rank.get(i)
        rows.append({"label": labels[i],
                     "p": None if r is None else float(p),
                     "rank": None if r is None else r + 1,
                     "adjusted": res["adjusted"][i],
                     "significant": res["significant"][i],
                     "threshold": None if r is None else res["thresholds"][r]})
    return {"analysis": "fdr_adjust", **res, "rows": rows}


def _ks_test(data, options):
    """Two-sample Kolmogorov-Smirnov test (moretests.ks_two_sample).

    data: column table ({"datasets": [...]}); options: dataset_a (0),
    dataset_b (1), method ("auto" = the guide's exact/approximate rule |
    "exact" | "asymptotic"). Result: {"analysis", "test", "D", "p",
    "p_method", "n_a", "n_b", "median_a", "median_b", "ties", "names"}."""
    cols, names = _flatten_columns(data)
    ia, ib = options.get("dataset_a", 0), options.get("dataset_b", 1)
    result = moretests.ks_two_sample(cols[ia], cols[ib],
                                     method=options.get("method", "auto"))
    result["names"] = [names[ia], names[ib]]
    return {"analysis": "ks_test", **result}


def _anova_unequal_var(data, options):
    """One-way ANOVA without assuming equal SDs: Welch and Brown-Forsythe.

    data: column table. options: comparisons ("games_howell" |
    "dunnett_t3" | "tamhane_t2" | "welch_uncorrected", optional), family
    ("all" | "control"), control_index (0), ci_level (0.95).
    Result: {"analysis", "welch": {W, dfn, dfd, p, weighted_mean},
    "brown_forsythe": {F, dfn, dfd, p}, "group_summaries": [{name, n,
    mean, sd}], "multiple_comparisons"?: {method, family, n_comparisons,
    ci_level, comparisons: [{pair, difference, se, t, df, statistic, ci,
    p_adjusted, significant_05, significant}]}}."""
    cols, names = _flatten_columns(data)
    return {"analysis": "anova_unequal_var",
            **moretests.anova_unequal_variances(
                cols, names, comparisons=options.get("comparisons"),
                control_index=options.get("control_index", 0),
                family=options.get("family", "all"),
                ci_level=options.get("ci_level", 0.95))}


def _median_test(data, options):
    """Mood's median test. data: column table. Result: {"analysis",
    "grand_median", "table": {above, not_above}, "group_summaries",
    "chi_square": {chi2, df, p}, "chi_square_yates"? and "fisher_exact"?
    (two groups), "warning"?}."""
    cols, names = _flatten_columns(data)
    return {"analysis": "median_test", **moretests.median_test(cols, names)}


def _trend_test(data, options):
    """Chi-square test for trend (Cochran-Armitage). data: {"table":
    k rows x 2 columns (or 2 x k)}; options: scores (default 1..k).
    Result: {"analysis", "chi2", "df", "p", "z", "slope", "scores",
    "proportions", "orientation", "overall_chi_square",
    "departure_from_trend"?}."""
    return {"analysis": "trend_test",
            **trend.chi_square_trend(data["table"],
                                     scores=options.get("scores"))}


def _mcnemar(data, options):
    """McNemar's test (2 x 2 table of pairs) or Bowker's test (k x k).
    data: {"table"}; options: ci_level. Result (2 x 2): {"analysis",
    "discordant", "n_pairs", "odds_ratio": {value, ci, ci_method},
    "binomial": {p_two_tailed, p_one_tailed, ...}, "chi_square",
    "chi_square_yates", "recommended_p"}; (k x k): {"test": "bowker",
    "chi2", "df", "p"}."""
    return {"analysis": "mcnemar",
            **trend.mcnemar(data["table"],
                            ci_level=options.get("ci_level", 0.95))}


def _cochrans_q(data, options):
    """Cochran's Q for a matched yes/no outcome (trend.cochrans_q). data:
    a column table, datasets = conditions, rows = subjects, first
    subcolumn, cells 0 or 1 (None = missing). Subjects missing a
    condition are left out, listed in incomplete_subjects (0-based) with
    a warning. Result: {"analysis", "Q", "df", "p", "n_subjects",
    "n_informative", "successes", "proportions", "names", "comparisons":
    {method, family, comparisons: [{pair, discordant, difference,
    p_unadjusted, p_adjusted, ...}]}}."""
    names = [ds.get("name", "") or f"Condition {j + 1}"
             for j, ds in enumerate(data["datasets"])]
    cols = [[row[0] if row else None for row in ds["ys"]]
            for ds in data["datasets"]]
    result = {"analysis": "cochrans_q", **trend.cochrans_q(cols, names)}
    if result["incomplete_subjects"]:
        result["warnings"] = [_incomplete_warning(
            result["incomplete_subjects"], "subject row")
            + " (Cochran's Q needs every condition per subject)"]
    return result


def _cmh(data, options):
    """Cochran-Mantel-Haenszel. data: {"tables": [[[a, b], [c, d]], ...],
    "strata_names"?}; options: correction (false), ci_level. Result:
    {"analysis", "n_strata", "odds_ratio", "relative_risk", "cmh_test",
    "breslow_day"?, "strata"}. Strata larger than 2 x 2 (r x c): the
    generalized CMH test of general association, {"analysis", "test":
    "generalized_cochran_mantel_haenszel", "cmh_test": {chi2, df, p},
    "strata"}."""
    tables = data["tables"]
    if any(len(t) != 2 or any(len(row) != 2 for row in t) for t in tables):
        return {"analysis": "cmh",
                **trend.cmh_general(tables, names=data.get("strata_names"))}
    return {"analysis": "cmh",
            **trend.cmh(data["tables"],
                        ci_level=options.get("ci_level", 0.95),
                        correction=options.get("correction", False),
                        names=data.get("strata_names"))}


def _kappa(data, options):
    """Cohen's kappa. data: {"table": k x k}; options: weights (null |
    "linear" | "quadratic" | k x k matrix), ci_level. Result: {"analysis",
    "kappa", "se", "ci", "se_null", "z", "p", "observed_agreement",
    "expected_agreement", "n", "weights", "strength"}."""
    return {"analysis": "kappa",
            **trend.kappa(data["table"], weights=options.get("weights"),
                          ci_level=options.get("ci_level", 0.95))}


def _proportion_test(data, options):
    """One proportion (CI, binomial test vs options.p0) or two proportions
    compared (Fisher, z test, difference/RR/OR with CIs, NNT).

    data: {"successes", "trials"} | {"groups": [{"name"?, "successes",
    "trials"}, ...] (1 or 2)} | {"table": [[k1, n1 - k1], [k2, n2 - k2]]}.
    options: p0, ci_method ("wilson_brown" | "wilson" |
    "clopper_pearson"), diff_ci ("newcombe_cc" | "newcombe" |
    "asymptotic_cc"), rr_ci ("koopman" | "katz"), or_ci ("baptista_pike"
    | "baptista_pike_midp" | "woolf"), ci_level. Two proportions with
    options.equivalence {"lower", "upper" (either may be null:
    non-inferiority), "alpha"} add "equivalence": two one-sided score
    tests of p1 - p2 against the margins with the 1 - 2 alpha score CI
    (proportions.tost_two_proportions), or {"unavailable": why}."""
    ci_level = options.get("ci_level", 0.95)
    ci_method = options.get("ci_method", "wilson_brown")
    if "table" in data:
        groups = [{"successes": row[0], "trials": row[0] + row[1]}
                  for row in data["table"]]
    elif "groups" in data:
        groups = list(data["groups"])
    else:
        groups = [{"successes": data["successes"], "trials": data["trials"]}]
    names = [g.get("name", f"Group {i + 1}") for i, g in enumerate(groups)]
    if len(groups) == 1:
        return {"analysis": "proportion_test", "names": names,
                **proportions.one_proportion(
                    groups[0]["successes"], groups[0]["trials"],
                    p0=options.get("p0"), ci_method=ci_method,
                    ci_level=ci_level)}
    if len(groups) != 2:
        raise ValueError("enter one or two proportions")
    out = {"analysis": "proportion_test", "names": names,
           **proportions.compare_two_proportions(
               groups[0]["successes"], groups[0]["trials"],
               groups[1]["successes"], groups[1]["trials"],
               ci_level=ci_level, ci_method=ci_method,
               diff_method=options.get("diff_ci", "newcombe_cc"),
               rr_method=options.get("rr_ci", "koopman"),
               or_method=options.get("or_ci", "baptista_pike"))}
    if options.get("equivalence"):
        lower, upper, scale, alpha = _equivalence_margins(
            options["equivalence"])
        if scale != "difference":
            out["equivalence"] = {
                "unavailable": "give the margin as a difference between "
                               "proportions (for example 0.1)"}
        else:
            try:
                out["equivalence"] = proportions.tost_two_proportions(
                    groups[0]["successes"], groups[0]["trials"],
                    groups[1]["successes"], groups[1]["trials"],
                    lower, upper, alpha=alpha)
            except ValueError as exc:
                out["equivalence"] = {"unavailable": str(exc)}
    return out


def _deming(data, options):
    """Deming (Model II) regression, one fit per data set.

    data: XY table {"x", "datasets": [{"name", "ys"}]}. options:
    equal_errors (default true when no SDs/lambda) | sd_x + sd_y |
    lambda ((SD_X/SD_Y)^2), se_method ("prism" | "jackknife"), x0 (Y at
    this X, default 0), compare_identity (false), ci_level. Result:
    {"analysis", "datasets": [{"name", "fit": {slope, y_intercept,
    x_intercept, y_at_x0, slope_test, lambda, n, df, ..., "curve"}} |
    {"name", "error"}]}."""
    x_col = data["x"]
    results = []
    for ds in data["datasets"]:
        entry = {"name": ds.get("name", "")}
        try:
            xs, ys = _expand(x_col, ds["ys"])
            fit = deming.deming(
                xs, ys, sd_x=options.get("sd_x"), sd_y=options.get("sd_y"),
                lam=options.get("lambda"),
                ci_level=options.get("ci_level", 0.95),
                x0=options.get("x0", 0.0),
                se_method=options.get("se_method", "prism"),
                compare_identity=options.get("compare_identity", False))
            lo, hi = min(xs), max(xs)
            grid = [lo + i * (hi - lo) / 199 for i in range(200)]
            fit["curve"] = {"x": grid,
                            "y": [fit["slope"]["value"] * v
                                  + fit["y_intercept"]["value"]
                                  for v in grid]}
            entry["fit"] = fit
            entry["ccc"] = _ccc_or_error(xs, ys,
                                         options.get("ci_level", 0.95))
        except Exception as exc:
            entry["error"] = str(exc)
        results.append(entry)
    return {"analysis": "deming", "datasets": results}


_HANDLERS = {
    "dose_response": _dose_response,
    "global_fit": _global_fit,
    "ec50_shift": _ec50_shift,
    "rm_two_way": _rm_two_way,
    "pzfx_import": _pzfx_import,
    "linear_regression": _linear_regression,
    "survival": _survival,
    "rm_anova": _rm_anova,
    "roc": _roc,
    "bland_altman": _bland_altman,
    "rout_column": _rout_column,
    "normalize": _normalize,
    "transform": _transform,
    "descriptive": _descriptive,
    "plate_quantify": _plate_quantify,
    "column_statistics": _column_statistics,
    "ttest": _ttest,
    "anova": _anova,
    "outliers": _outliers,
    "compare_fits": _compare_fits,
    "correlation": _correlation,
    "contingency": _contingency,
    "two_way_anova": _two_way_anova,
    "summary_convert": _summary_convert,
    "ttest_summary": _ttest_summary,
    "anova_summary": _anova_summary,
    "two_way_anova_summary": _two_way_anova_summary,
    "formula_transform": _formula_transform,
    "transform_concentrations": _transform_concentrations,
    "remove_baseline": _remove_baseline,
    "transpose": _transpose,
    "prune_rows": _prune_rows,
    "fraction_of_total_table": _fraction_of_total_table,
    "simulate_xy": _simulate_xy,
    "simulate_column": _simulate_column,
    "simulate_contingency": _simulate_contingency,
    "monte_carlo": _monte_carlo,
    "multivar_descriptive": _multivar_descriptive,
    "correlation_matrix": _correlation_matrix,
    "multiple_regression": _multiple_regression,
    "ancova": _ancova,
    "logistic_regression": _logistic_regression,
    "poisson_regression": _poisson_regression,
    "binomial_regression": _binomial_regression,
    "negative_binomial_regression": _negative_binomial_regression,
    "pca": _pca,
    "mv_rearrange": _mv_rearrange,
    "chisq_goodness_of_fit": _chisq_goodness_of_fit,
    "fraction_of_total": _fraction_of_total,
    "nested_ttest": _nested_ttest,
    "nested_anova": _nested_anova,
    "mixed_rm_oneway": _mixed_rm_oneway,
    "mixed_rm_twoway": _mixed_rm_twoway,
    "multiple_row_tests": _multiple_row_tests,
    "three_way_anova": _three_way_anova,
    "row_means": _row_means,
    "compact_letters": _compact_letters,
    "fdr_adjust": _fdr_adjust,
    "ks_test": _ks_test,
    "anova_unequal_var": _anova_unequal_var,
    "median_test": _median_test,
    "trend_test": _trend_test,
    "mcnemar": _mcnemar,
    "cochrans_q": _cochrans_q,
    "cmh": _cmh,
    "kappa": _kappa,
    "proportion_test": _proportion_test,
    "deming": _deming,
}


def _rate_compare(data, options):
    """Two event rates (rates.compare_rates; R's poisson.test). data:
    {"groups": [{"name"?, "events", "exposure"}, {...}]}. options:
    ci_level (0.95). Result: {"analysis": "rate_compare", "names",
    "groups": [{events, exposure, rate, ci}], "rate_ratio", "ratio_ci"
    (an entry null when unbounded), "p_two_tailed", "p_greater",
    "p_less", "test", "source"}."""
    from . import rates
    groups = list(data.get("groups") or [])
    if len(groups) != 2:
        raise ValueError("enter two groups, each with its events and "
                         "exposure")
    names = [g.get("name") or f"Group {i + 1}" for i, g in enumerate(groups)]
    return {"analysis": "rate_compare", "names": names,
            **rates.compare_rates(groups[0].get("events"),
                                  groups[0].get("exposure"),
                                  groups[1].get("events"),
                                  groups[1].get("exposure"),
                                  ci_level=options.get("ci_level", 0.95))}


_HANDLERS["rate_compare"] = _rate_compare


# ------------------------------------------- equation library / user equations
# Curve-fitting guide: "Models (equations) built-in to Prism" (opendose.
# equations) and "Entering a user-defined model into Prism" (opendose.
# userequation). Payload shapes are documented on each handler.

def _column_constant_values(data, options, names):
    """Per-data-set values of column constants: options.column_constants
    {name: [one value per data set]} or, failing that, each data set's
    numeric "column_title" (Prism reads the number in the column title)."""
    given = options.get("column_constants") or {}
    out = {}
    for name in names:
        vals = given.get(name)
        if vals is None:
            vals = []
            for ds in data["datasets"]:
                raw = ds.get("column_title", ds.get("constant"))
                try:
                    vals.append(None if raw in (None, "") else float(raw))
                except (TypeError, ValueError):
                    vals.append(None)
        vals = list(vals)
        if len(vals) != len(data["datasets"]) or any(v is None for v in vals):
            raise ValueError(
                f"the column constant {name} needs a numeric value for every "
                "data set (options.column_constants or each data set's "
                "column_title)")
        out[name] = [float(v) for v in vals]
    return out


def _user_equation_dose_response(data, options):
    """Fit a user-defined equation to each data set separately.

    options.user_equation = {"text": "Y = ...", "rules": {param: rule},
    "constraints": {param: default constraint}, "transforms": [{"name",
    "expr", "ci"}], "x_is_log": bool, "name": str}; every other option is
    the dose_response one (constraints, weighting, ci_method, rout_q,
    bands, interpolate_y, ...). Lines prefixed <A>, <~B>, ... apply by the
    data set's position. Equations that share parameters between data
    sets are fit with analysis "global_model_fit"."""
    eq = userequation.from_options(options["user_equation"])
    if eq.shared or options.get("shared"):
        raise ValueError("this equation shares parameters between data sets; "
                         "fit it with analysis 'global_model_fit'")
    cols = _column_constant_values(data, options, eq.column_constants)
    if cols and not eq.column_titles:
        eq.column_titles = cols[eq.column_constants[0]]
    sub_options = {k: v for k, v in options.items() if k != "user_equation"}
    results, flags = [], {}
    for i, ds in enumerate(data["datasets"]):
        constraints = dict(options.get("constraints") or {})
        for name, vals in cols.items():
            constraints.setdefault(name, vals[i])
        sub = _dose_response(dict(data, datasets=[ds]),
                             dict(sub_options, model=eq.register(i),
                                  constraints=constraints))
        flags = {k: v for k, v in sub.items() if k not in ("datasets",)}
        results.append(sub["datasets"][0])
    out = dict(flags)
    out.update({"analysis": "dose_response", "datasets": results,
                "user_equation": eq.describe()})
    return out


def _global_model_fit(data, options):
    """Global fit of a built-in model (options.model) or a user equation
    (options.user_equation) to all data sets at once.

    data: {"x": [...], "datasets": [{"name", "ys", "column_title"?}]};
    options: shared (default: the model's documented shared parameters),
    constraints {param: value}, column_constants {name: [per data set]}
    (else each data set's column_title), weighting, x_is_log,
    summary_format/replicates as for global_fit, error_bars."""
    if options.get("user_equation"):
        eq = userequation.from_options(options["user_equation"])
        model = eq.register(0)
    else:
        model = options.get("model")
        eq = None
    spec = nlfit.MODELS.get(model)
    if spec is None:
        raise ValueError(f"unknown model: {model}")
    x_col = data["x"]
    if spec.x_is_log and not options.get("x_is_log", True):
        x_col = transform.transform_list(x_col, "log10")
    cols = _column_constant_values(data, options, spec.dataset_constants)
    if eq is not None and cols and not eq.column_titles:
        eq.column_titles = cols[spec.dataset_constants[0]]
    summary_fmt = options.get("summary_format")
    if summary_fmt == "replicates":
        summary_fmt = None
    gdatasets = []
    for i, ds in enumerate(data["datasets"]):
        if summary_fmt and options.get("replicates") == "means_only":
            xs, ys, _ = summary.fit_inputs(x_col, ds, summary_fmt)
        elif summary_fmt:
            xs, ys = summary.replicate_view(x_col, ds, summary_fmt)
        else:
            xs, ys = _expand(x_col, ds["ys"])
        gdatasets.append({"name": ds.get("name", ""), "x": xs, "y": ys,
                          "constants": {k: v[i] for k, v in cols.items()}})
    result = equations.fit_global_model(
        gdatasets, model, shared=options.get("shared"),
        constraints=options.get("constraints") or {},
        weighting=options.get("weighting", "none"),
        # start values {param: value or [one per data set]} (P-100 starts
        # the separate curves from the parallel fit)
        initial=options.get("initial_values"))
    cov = result.pop("_cov", None)
    if cov is not None:
        # the joint covariance of the fitted parameters (one row per
        # fitted parameter: [name, data-set index or null when shared]),
        # for SEs of differences / contrasts between data sets
        names_ = [ds.get("name", "") for ds in data["datasets"]]
        result["covariance"] = {
            "parameters": [{"name": nm, "dataset": (None if owner is None
                                                    else names_[owner])}
                           for nm, owner in cov["layout"]],
            "matrix": cov["matrix"]}
    finite_x = [v for v in x_col if v is not None]
    pad = 0.5 if spec.x_is_log else 0.0
    lo, hi = min(finite_x) - pad, max(finite_x) + pad
    grid = [lo + k * (hi - lo) / 199 for k in range(200)]
    error_bar_kind = options.get("error_bars", "sd")
    for i, (entry, ds) in enumerate(zip(result["datasets"], data["datasets"])):
        flags = rangeflags.range_flags(entry.get("params") or {},
                                       gdatasets[i]["x"], gdatasets[i]["y"],
                                       x_is_log=spec.x_is_log)
        if flags is not None:
            entry["range_flags"] = flags
        entry["curve"] = {"x": grid,
                          "y": equations.global_curve(model, entry, i, grid)}
        entry["points"] = {
            "x": x_col,
            "bars": (summary.dataset_error_bars(ds, summary_fmt,
                                                error_bar_kind)
                     if summary_fmt else
                     descriptive.error_bars(ds["ys"], error_bar_kind)),
        }
    out = {"analysis": "global_model_fit", **result}
    if eq is not None:
        out["user_equation"] = eq.describe()
    return out


def _validate_equation(data, options):
    """Check a user-defined equation without fitting. options (or data):
    {"text", "rules", "constraints", "transforms", "x_is_log", "name"}.
    Returns {"ok", "errors": [{message, line, column, where, item, text}],
    "warnings", "parameters", "intermediates", "dataset_specific",
    "functions", "rules", "constraints", "transforms"}."""
    src = options if (options.get("text") or options.get("equation")) \
        else (data or {})
    res = userequation.validate_equation(
        src.get("text", src.get("equation")), rules=src.get("rules"),
        constraints=src.get("constraints"), transforms=src.get("transforms"),
        x_is_log=src.get("x_is_log", False), name=src.get("name"))
    return {"analysis": "validate_equation", **res}


def _model_derived_names(spec):
    names = []
    if spec.derived:
        try:
            names += list(spec.derived({p: 1.0 for p in spec.params}, {}))
        except Exception:  # metadata only; never fail the listing
            pass
    names += [t.name for t in spec.transforms or []]
    if "Top" in spec.params and "Bottom" in spec.params:
        names.append("Span")
    return names


def _list_models(data, options):
    """The equation registry for the UI: one entry per built-in model
    (user-defined equations compiled during the session are excluded)."""
    models, families = [], []
    for name, spec in nlfit.MODELS.items():
        if spec.user:
            continue
        display = {"LogXmid": ("LogIC50" if "IC50" in spec.equation
                               else "LogEC50")}
        params = [display.get(p, p) for p in spec.params]
        fixed_by_default = {}
        if name == "log_inhibitor_vs_response_3pl":
            fixed_by_default["HillSlope"] = -1.0
        if name == "log_agonist_vs_response_3pl":
            fixed_by_default["HillSlope"] = 1.0
        constants = set(spec.required_constants) | set(spec.dataset_constants)
        family = equations.model_family(spec)
        if family not in families:
            families.append(family)
        models.append({
            "id": name, "label": spec.label, "family": family,
            "equation": spec.equation, "parameters": params,
            "has_log_x": spec.x_is_log, "x_label": spec.x_label,
            "y_label": spec.y_label, "derived": _model_derived_names(spec),
            "required_constants": [display.get(p, p)
                                   for p in spec.required_constants
                                   if p not in spec.dataset_constants],
            "dataset_constants": list(spec.dataset_constants),
            "shared": list(spec.shared),
            "param_scope": dict(spec.param_scope or {}),
            "global_only": spec.global_only,
            "fixed_by_default": fixed_by_default,
            "bounds": {k: list(v) for k, v in (spec.bounds or {}).items()},
            "constrainable": [display.get(p, p) for p in spec.params
                              if p not in constants
                              and p not in fixed_by_default
                              and p not in (spec.data_constants or {})],
        })
    return {"analysis": "list_models", "models": models, "families": families}


_HANDLERS.update({
    "global_model_fit": _global_model_fit,
    "compare_global_fits": _compare_global_fits,
    "relative_potency": _relative_potency,
    "validate_equation": _validate_equation,
    "list_models": _list_models,
})


# ---------------------------------------------------------- assay engines
# (assay_*.py: standard curves, qPCR, densitometry, plate QC, synergy,
# clustered heat maps, SuperPlots, growth-curve preprocessing)

def _assay_kw(options, keys):
    return {k: options[k] for k in keys if k in options}


def _stdcurve_qc(data, options):
    """Standard-curve QC (assay_stdcurve). data: {"standards":
    [{"concentration", "signals": [replicates], "anchor"?}], "unknowns":
    [{"name", "signals": [replicates], "dilution"?}]}. options: model
    ("4pl" | "5pl" | "linear" | "loglog"), weighting ("none" | "1/Y" |
    "1/Y2"), log_x, blank (number | "zero_standard"), accuracy_limit
    (20), accuracy_limit_ends (25), precision_limit (20),
    precision_limit_ends (25), min_fraction (0.75), min_levels (6),
    cv_limit (20), cv_basis ("concentration" | "signal"),
    parallelism_cv_limit (30), ci_level (0.95), constraints ({param:
    value} held constant, e.g. {"Bottom": 0}). Returns {"fit", "curve",
    "standards": [{concentration, back_calculated, recovery_pct,
    cv_back_calc_pct, replicate_pass, level_pass, role}], "acceptance",
    "quantification_range": {lloq, uloq, dynamic_range_fold},
    "unknowns": [{name, dilution, concentration, concentration_ci,
    corrected, corrected_ci, status, flags, reportable}], "samples",
    "parallelism", "warnings"}. With data "lod_blanks" (blank signals as
    read) or "lod_samples" ([{"name", "signals"}] low-level samples as
    read) it adds "detection_limits" (LoB, LoD and LoQ, CLSI EP17-A2;
    options lod_c_beta, loq_cv_limit)."""
    return assay_stdcurve.standard_curve_qc(
        data.get("standards") or [], data.get("unknowns") or [],
        lod_blanks=data.get("lod_blanks"), lod_samples=data.get("lod_samples"),
        **_assay_kw(options, (
            "model", "weighting", "log_x", "blank", "accuracy_limit",
            "accuracy_limit_ends", "precision_limit", "precision_limit_ends",
            "min_fraction", "min_levels", "cv_limit", "cv_basis",
            "parallelism_cv_limit", "ci_level", "constraints",
            "lod_c_beta", "loq_cv_limit")))


def _qpcr(data, options):
    """Relative qPCR quantification (assay_qpcr). data: {"records":
    [{sample, group, target, cq, well?, pair?}], "standard_curves"?:
    {target: [{quantity, cq}]}, "dilution_series"?: {target: [{quantity,
    cq}]} (a hit-rate series gives "lod95")}. options: reference_genes (required),
    calibrator (group), efficiencies ({target: factor or %}), max_cq
    (35), max_spread (0.5), undetermined_value, exclude_high_cq, test
    ("auto" | "unpaired" | "welch" | "paired" | "anova" | "rm_anova" |
    "none"), comparisons (post test, default "dunnett" vs calibrator),
    welch, ci_level, groups, targets. Returns {"efficiencies",
    "replicates" (technical-replicate QC), "results" (per sample and
    target: dcq, ddcq, relative_quantity, log2_fold_change),
    "per_target": [{target, groups: [{group, n, mean_dcq, fold_change,
    fold_change_ci}], statistics: {..., comparisons: [{pair,
    fold_change, fold_change_ci, p_adjusted}]}, graph}], "warnings"}.
    NTC and no-RT wells (by name, or a record's "control": "ntc" |
    "no_rt") are left out and checked into "controls" (options
    control_max_cq, control_min_delta; assay_qpcr.control_checks)."""
    kw = _assay_kw(options, (
        "calibrator", "efficiencies", "standard_curves", "max_cq",
        "max_spread", "undetermined_value", "exclude_high_cq", "test",
        "comparisons", "welch", "ci_level", "groups", "targets",
        "control_max_cq", "control_min_delta"))
    if data.get("standard_curves") and "standard_curves" not in kw:
        kw["standard_curves"] = data["standard_curves"]
    result = assay_qpcr.qpcr_analysis(
        data.get("records") or [],
        reference_genes=options.get("reference_genes",
                                    options.get("reference")), **kw)
    if data.get("dilution_series"):
        # LoD95 of every hit-rate dilution series (assay_qpcr.lod95_by_target)
        result["lod95"] = assay_qpcr.lod95_by_target(
            data["dilution_series"], ci_level=options.get("ci_level", 0.95))
    if options.get("reference_stability", True):
        # reference-gene validation before the fold changes
        # (opendose.qpcr_refs: geNorm M, dCq SD, shift with treatment)
        try:
            result["reference_stability"] = \
                qpcr_refs.reference_stability_from_records(
                    assay_qpcr.split_controls(data.get("records") or [])[0],
                    result["reference_genes"],
                    efficiencies={g: result["efficiencies"][g]["efficiency"]
                                  for g in result["reference_genes"]},
                    calibrator=result["calibrator"],
                    groups_order=result["groups"],
                    **_assay_kw(options, (
                        "max_cq", "max_spread", "undetermined_value",
                        "exclude_high_cq")))
        except ValueError as exc:
            result["reference_stability"] = {"error": str(exc)}
            result["warnings"].append(
                f"Reference-gene stability not computed: {exc}")
    return result


def _densitometry(data, options):
    """Western blot densitometry (assay_densitometry). data: {"records":
    [{blot, lane, sample?, group, target, reference, background?,
    reference_background?}]}. options: control_group, control_lanes
    ({blot: lane}), saturation_limit, test ("auto" | "ratio_paired" |
    "one_sample" | "rm_anova" | "none"), comparisons, groups, ci_level,
    ddf (the mixed model's df with missing blots, as mixed_rm_oneway).
    Returns {"lanes" (corrected, normalized, fold_change, flags),
    "per_blot", "matched_fold_change", "statistics", "group_summaries"
    (geometric mean fold with CI), "graph" (points, paired lines per
    blot, reference_line 1), "warnings"}."""
    return assay_densitometry.densitometry(
        data.get("records") or [],
        **_assay_kw(options, ("control_group", "control_lanes",
                              "saturation_limit", "test", "comparisons",
                              "groups", "ci_level", "ddf")))


def _luciferase(data, options):
    """Dual-luciferase reporter assay (assay_luciferase). data:
    {"records": [{group, firefly, renilla, experiment?, well?}]}.
    options: control_group, blank_group (mock wells subtracted as
    background), groups, test ("auto" | "ratio_paired" | "rm_anova" |
    "unpaired" | "anova" | "none"), comparisons, low_renilla (fraction of
    the median corrected Renilla below which a well is flagged),
    ci_level. Returns {"wells" (corrected readings, ratio, fold_change,
    flags), "unit" ("experiment" | "well"), "statistics",
    "group_summaries" (geometric mean fold with CI), "graph",
    "warnings"} plus "per_experiment" / "matched_ratio" with experiments
    or "ratios_by_group" without."""
    return assay_luciferase.luciferase(
        data.get("records") or [],
        **_assay_kw(options, ("control_group", "blank_group", "groups",
                              "test", "comparisons", "low_renilla",
                              "ci_level")))


def _wound_healing(data, options):
    """Wound-healing (scratch) assay (assay_wound). data: {"x": times,
    "datasets": [{name, ys: rows x replicates}]} (one data set per
    condition, one replicate column per well, values the wound area or
    width). options: window ([start, end] for the rate fit), target
    (closure %, default 50), rate_basis ("percent" | "absolute"),
    control_index, test ("auto" | "none"), comparisons, ci_level.
    Returns {"wells" (closure over time, rate, time to target, flags),
    "summaries" (per condition, with the mean closure curve),
    "statistics", "warnings"}."""
    return assay_wound.wound_healing(
        data.get("x") or [], data.get("datasets") or [],
        **_assay_kw(options, ("window", "target", "rate_basis",
                              "control_index", "test", "comparisons",
                              "ci_level")))


def _mic(data, options):
    """MIC by broth microdilution (assay_mic). data: {"x": concentrations
    (0 = growth control), "datasets": [{name, ys: rows x replicates}]}
    (one data set per strain, one replicate column per dilution series,
    values the endpoint OD). options: blank, threshold_mode ("percent" |
    "od"), threshold (% of the growth control), od_cutoff, fit_ic50,
    ci_level. Returns {"series" (wells with % growth, MIC, skipped
    wells, flags), "strains" (modal MIC, % growth curve, IC50),
    "cumulative" (MIC50, MIC90), "warnings"}."""
    return assay_mic.mic(
        data.get("x") or [], data.get("datasets") or [],
        **_assay_kw(options, ("blank", "threshold_mode", "threshold",
                              "od_cutoff", "fit_ic50", "ci_level")))


def _kinetic_rates(data, options):
    """Kinetic plate reads (assay_kinetic). data: {"x": read times,
    "datasets": [{name, ys: rows x replicates}]} (one data set per
    sample, one replicate column per well). options: method ("auto" |
    "window" | "steepest"), min_r2, min_points, window ([start, end]), k
    (reads in the steepest stretch), blank_index, factor (signal per
    concentration unit), saturation. Returns {"wells" (rate, SE, R²,
    window, corrected rate, velocity, flags), "samples" (mean velocity,
    substrate when the name is a number), "michaelis_menten_ready",
    "warnings"}."""
    return assay_kinetic.kinetic_rates(
        data.get("x") or [], data.get("datasets") or [],
        **_assay_kw(options, ("method", "min_r2", "min_points", "window",
                              "k", "blank_index", "factor",
                              "saturation")))


def _plate_qc(data, options):
    """Plate QC and layout (assay_plate). data: {"grid": rows x cols} |
    {"text"} | {"xlsx_b64"}, plus "plate_map" (or options.plate_map):
    [{wells: "A1" | "A1:B3" | [...], role: "blank" | "negative" |
    "positive" | "sample" | "empty", compound?, concentration? |
    concentrations?: [per well], replicate?}] or {well: {...}}.
    options: normalization ("percent_of_control" | "percent_activity" |
    "percent_inhibition" | "inhibition_vs_blank" | "none"),
    plate_format (96 | 384), cv_limit (15), z_prime_limit (0.5),
    edge_role ("negative" | "positive" | "sample" | "all"). Returns
    {"qc": {z_prime, robust_z_prime, category, signal_to_background,
    signal_window, negative/positive {mean, sd, cv_pct}}, "qc_flags",
    "passed", "replicate_cv", "edge_effect", "wells",
    "normalized_grid", "dose_response": [{compound, x, datasets}],
    "combined": {x, datasets} | null, "warnings"}."""
    grid, read_warnings = _read_plate_grid(data, options.get("plate_format"))
    if grid is None:
        raise ValueError("plate_qc needs a plate grid")
    plate_map = data.get("plate_map", options.get("plate_map"))
    if not plate_map:
        raise ValueError("plate_qc needs a plate map")
    res = assay_plate.plate_qc(
        grid, plate_map,
        **_assay_kw(options, ("normalization", "plate_format", "cv_limit",
                              "z_prime_limit", "edge_role")))
    res["warnings"] = read_warnings + res["warnings"]
    return res


def _synergy(data, options):
    """Drug-combination synergy (assay_synergy). data: {"records":
    [{conc1, conc2, response, replicate?}]} or {"conc1": [...],
    "conc2": [...], "responses": matrix (rows = conc1) | [replicate
    matrices]}; the zero dose of each drug must be present. options:
    response_kind ("inhibition" | "viability"), baseline_correction
    ("none" | "part" | "all"), drug1, drug2. Returns {"conc1", "conc2",
    "response" (% inhibition matrix), "monotherapy", "models": {hsa,
    bliss, loewe, zip: {reference, synergy, score, synergy_sd?,
    score_sd?}}, "scores", "landscapes", "chou_talalay": {drug1: {m,
    Dm, r, r_squared, n, valid, reason}, drug2, combinations: [{conc1,
    conc2, fa, ci, dri1, dri2, interpretation, reason}], fa_ci,
    min_r_squared, min_points, n_computed, note}, "warnings"}. A
    combination's ci is null, with a reason, unless its fa is strictly
    inside (0, 1) and both median-effect fits are valid (m > 0, r^2 >=
    min_r_squared, at least min_points doses). Each model (and
    "consensus") also carries p_value and most_synergistic_area;
    "sensitivity" holds {drug1, drug2: {ic50, ic50_capped, ri}, css1,
    css2, css}. options.p_iterations (default 10; 0 = no P values for
    replicated matrices, whose resampling refits every curve); outliers
    ("none" | "flag" | "replace"), outlier_threshold (% inhibition, default
    20), impute (fill missing cells). Adds "outliers" ({action, threshold,
    cells} or null) and "filled_cells". musyc (fit the MuSyC surface;
    adds "musyc": parameters, alpha12/alpha21, beta, beta_obs, r_squared,
    ci95, notes, or null), musyc_ci (Monte Carlo refits, default 100).

    Three or more drugs (records carrying conc3, conc4, ...): the
    higher-order analysis (synergy_multi; "analysis": "synergy_multi"),
    options response_kind, baseline_correction, p_iterations, and drug
    names as options.drugs [names] or drug1, drug2, drug3, ..."""
    records = data.get("records")
    if records and "conc3" in records[0]:
        n = 0
        while f"conc{n + 1}" in records[0]:
            n += 1
        drugs = options.get("drugs") or [
            options.get(f"drug{i + 1}") or f"Drug {i + 1}" for i in range(n)]
        return synergy_multi.synergy_multi(
            records, drugs=drugs,
            **_assay_kw(options, ("response_kind", "baseline_correction",
                                  "p_iterations")))
    return assay_synergy.synergy(
        data.get("records"), conc1=data.get("conc1"),
        conc2=data.get("conc2"), responses=data.get("responses"),
        **_assay_kw(options, ("response_kind", "baseline_correction",
                              "drug1", "drug2", "p_iterations",
                              "outliers", "outlier_threshold", "impute",
                              "musyc", "musyc_ci")))


def _frequency_distribution(data, options):
    """Frequency distribution of each data set of a column table
    (opendose.frequency). options: bin_width (None = automatic, GraphPad
    FAQ 1660), first_center, upper_limit, cumulative, relative (None |
    "fraction" | "percent"), exact (exact cumulative, no bins), fit (None |
    "gaussian" | "cumulative_gaussian"), replicates ("each" value in its
    bin | "mean" of each row's replicates)."""
    columns, names = [], []
    each = options.get("replicates", "each") != "mean"
    for i, ds in enumerate(data["datasets"]):
        vals = []
        for row in ds.get("ys", []):
            got = [v for v in (row or []) if not _is_missing(v)]
            if not got:
                continue
            if each:
                vals.extend(float(v) for v in got)
            else:
                vals.append(sum(float(v) for v in got) / len(got))
        columns.append(vals)
        names.append(ds.get("name") or f"Data set {i + 1}")
    return frequency.frequency_distribution(
        columns, names, bin_width=options.get("bin_width"),
        first_center=options.get("first_center"),
        upper_limit=options.get("upper_limit"),
        cumulative=bool(options.get("cumulative", False)),
        relative=options.get("relative"), exact=bool(options.get("exact")),
        fit=options.get("fit"))


def _cluster_heatmap(data, options):
    """Clustered heat map and k-means (assay_clustering). data:
    {"values": rows x columns, "row_names"?, "column_names"?}. options:
    method ("average" | "complete" | "single" | "ward" | "weighted" |
    "centroid" | "median"), metric ("euclidean" | "manhattan" |
    "correlation"), scale ("none" | "center" | "zscore"), scale_axis
    ("rows" | "columns"), cluster_rows, cluster_columns, k_rows,
    k_columns, kmeans: {k, axis: "rows" | "columns", seed, n_init},
    choose_k: {k_max, axis, seed, n_init, n_reference}. Returns
    {"matrix" (reordered), "row_order", "column_order", "rows" /
    "columns": {linkage (scipy convention), leaf_order, dendrogram: {x,
    y}, clusters?}, "kmeans"?, "choose_k"?, "warnings"}."""
    return assay_clustering.cluster_heatmap(
        data["values"], row_names=data.get("row_names"),
        column_names=data.get("column_names"),
        kmeans_options=options.get("kmeans"),
        choose_k_options=options.get("choose_k"),
        **_assay_kw(options, ("method", "metric", "scale", "scale_axis",
                              "cluster_rows", "cluster_columns", "k_rows",
                              "k_columns")))


def _superplot(data, options):
    """SuperPlot aggregation (assay_superplot). data: {"records":
    [{group, replicate, value, pair?}]} (one per cell). options:
    aggregate ("mean" | "median"), test ("auto" | "unpaired" | "welch" |
    "paired" | "ratio_paired" | "mann_whitney" | "wilcoxon" | "anova" |
    "kruskal_wallis" | "rm_anova" | "friedman" | "none"), stats_on
    ("replicates" | "cells"), paired (default: when pair keys are
    given), groups, control, comparisons, welch, ci_level. Returns
    {"replicates", "replicate_table": {row_titles, datasets}, "test",
    "group_summaries", "graph": {cells, replicate_means, colour_keys,
    n_label}, "warnings"}."""
    return assay_superplot.superplot(
        data.get("records") or [],
        **_assay_kw(options, ("aggregate", "test", "stats_on", "paired",
                              "groups", "control", "comparisons", "welch",
                              "ci_level")))


def _growth_transform(data, options):
    """OD / count growth curves before fitting the Zwietering models
    (assay_growth). data: {x, datasets}. options: blank (number),
    blank_dataset (index), log ("ln" | "log10" | "log2" | null),
    relative_to_first (bool). Returns {x, datasets, blank,
    n_nonpositive_dropped, ...}."""
    return {"analysis": "growth_transform",
            **assay_growth.prepare_growth_data(
                data["x"], data["datasets"],
                **_assay_kw(options, ("blank", "blank_dataset", "log",
                                      "relative_to_first")))}


_HANDLERS.update({
    "stdcurve_qc": _stdcurve_qc,
    "qpcr": _qpcr,
    "densitometry": _densitometry,
    "luciferase": _luciferase,
    "wound_healing": _wound_healing,
    "mic": _mic,
    "kinetic_rates": _kinetic_rates,
    "plate_qc": _plate_qc,
    "synergy": _synergy,
    "frequency_distribution": _frequency_distribution,
    "cluster_heatmap": _cluster_heatmap,
    "superplot": _superplot,
    "growth_transform": _growth_transform,
})

def _two_columns(data, options):
    cols, names = _flatten_columns(data)
    ia, ib = options.get("dataset_a", 0), options.get("dataset_b", 1)
    return cols, names, ia, ib


def _aligned_columns(data):
    """Row-aligned view (first subcolumn per row; None = missing), for
    paired and repeated designs."""
    return [[row[0] if row else None for row in ds["ys"]]
            for ds in data["datasets"]]


def _effect_size(data, options):
    """Standalone effect sizes (effectsize.py).

    data: a column table {"datasets": [{"name", "ys"}]} (raw values), or
    {"summary": [{"name"?, "mean", "sd", "n"}, x2]}, or {"table": counts
    r x c}, or {"proportions": [{"successes", "trials"}, x2]}, or
    {"statistic": {"t", "df"?, "n_a", "n_b"} | {"t", "n"} | {"F", "df1",
    "df2"}}. options: measure ("two_group" (default for 2 data sets: d,
    d_av, Glass, point-biserial r, Cliff's delta, CLES) | "cohens_d" |
    "cohens_d_av" | "glass_delta" | "paired" | "one_sample" |
    "cliffs_delta" | "point_biserial" | "rank_biserial" | "anova"
    (default for 3+ data sets) | "kruskal" | "kendalls_w" |
    "association" (default for a table) | "cohens_h"), dataset_a (0),
    dataset_b (1; B is the control for Glass's delta), mu (one sample,
    0), ci_level (0.95), ci_method ("nct" | "normal" | "bootstrap"),
    n_boot (5000), seed (12345), zero_method ("wilcox" | "pratt"),
    bias_correction (Cramer's V). Result: {"analysis": "effect_size",
    "measure", "names"?, ...the measure's fields}, every estimate with its
    CI, ci_method and interpretation {label, scale, thresholds,
    source}."""
    ci_level = options.get("ci_level", 0.95)
    boot = dict(ci_method=options.get("ci_method", "nct"),
                n_boot=int(options.get("n_boot", 5000)),
                seed=options.get("seed", 12345))
    out = {"analysis": "effect_size"}
    if data.get("statistic"):
        st = data["statistic"]
        out["measure"] = "from_statistic"
        out.update(effectsize.from_statistic(
            t=st.get("t"), F=st.get("F"), df=st.get("df"),
            df1=st.get("df1"), df2=st.get("df2"), n_a=st.get("n_a"),
            n_b=st.get("n_b"), n=st.get("n"), ci_level=ci_level))
        return out
    if data.get("table") is not None:
        out["measure"] = "association"
        out.update(effectsize.phi_cramers_v(
            data["table"], ci_level=ci_level,
            bias_correction=bool(options.get("bias_correction", False)),
            ci_method="bootstrap" if boot["ci_method"] == "bootstrap"
            else "ncp", n_boot=boot["n_boot"], seed=boot["seed"]))
        return out
    if data.get("proportions"):
        (g1, g2) = data["proportions"][:2]
        out["measure"] = "cohens_h"
        out.update(effectsize.cohens_h(
            g1["successes"] / g1["trials"], g2["successes"] / g2["trials"],
            g1["trials"], g2["trials"], ci_level=ci_level))
        return out
    if data.get("summary"):
        a, b = data["summary"][:2]
        std = {"cohens_d": "pooled", "two_group": "pooled",
               "cohens_d_av": "average", "glass_delta": "control"}.get(
            options.get("measure", "cohens_d"), "pooled")
        out["names"] = [a.get("name", "A"), b.get("name", "B")]
        out.update(effectsize.d_from_stats(
                       float(a["mean"]), float(a["sd"]) ** 2, int(a["n"]),
                       float(b["mean"]), float(b["sd"]) ** 2, int(b["n"]),
                       standardizer=std, ci_level=ci_level,
                       ci_method="normal" if boot["ci_method"] == "normal"
                       else "nct"))
        return out
    cols, names, ia, ib = _two_columns(data, options)
    measure = options.get("measure") or ("two_group" if len(cols) == 2
                                         else "anova")
    out["measure"] = measure
    pair_names = [names[ia], names[ib]] if len(cols) > max(ia, ib) else None
    if measure == "two_group":
        out["names"] = pair_names
        out.update(effectsize.two_group_summary(
            cols[ia], cols[ib], ci_level=ci_level, **boot))
    elif measure in ("cohens_d", "cohens_d_av", "glass_delta"):
        out["names"] = pair_names
        out.update(effectsize.cohens_d(
            cols[ia], cols[ib], ci_level=ci_level,
            standardizer={"cohens_d": "pooled", "cohens_d_av": "average",
                          "glass_delta": "control"}[measure], **boot))
    elif measure in ("paired", "rank_biserial"):
        aligned = _aligned_columns(data)
        if measure == "paired":
            res = effectsize.paired_d(aligned[ia], aligned[ib],
                                      ci_level=ci_level, **boot)
        else:
            res = effectsize.rank_biserial_paired(
                aligned[ia], aligned[ib],
                zero_method=options.get("zero_method", "wilcox"),
                ci_level=ci_level)
        out["names"] = pair_names
        out.update(res)
    elif measure == "one_sample":
        out["datasets"] = [
            {"name": n, **effectsize.one_sample_d(
                c, float(options.get("mu", 0.0)), ci_level=ci_level)}
            for n, c in zip(names, cols)]
    elif measure == "cliffs_delta":
        out["names"] = pair_names
        out.update(effectsize.cliffs_delta(
            cols[ia], cols[ib], ci_level=ci_level))
    elif measure == "point_biserial":
        out["names"] = pair_names
        out.update(effectsize.point_biserial(
            cols[ia], cols[ib], ci_level=ci_level))
    elif measure == "anova":
        res = anova.one_way_anova(cols, names)
        t = res["table"]
        out["names"] = names
        out.update(effectsize.one_way(
            t["ss_between"], t["df_between"], t["ss_within"],
            t["df_within"], ci_level=ci_level))
    elif measure == "kruskal":
        res = anova.kruskal_wallis(cols, names, dunns=False)
        out.update(names=names, H=res["H"])
        out.update(res["effect_size"])
    elif measure == "kendalls_w":
        res = repeated.friedman(_aligned_columns(data), names, dunns=False)
        out.update(names=names, statistic=res["statistic"])
        out.update(res["effect_size"])
    else:
        raise ValueError(f"unknown effect size measure: {measure}")
    return out


def _estimation(data, options):
    """Estimation statistics (estimation.py; DABEST method).

    data: column table {"datasets": [{"name", "ys"}]}; unpaired designs
    use every replicate, paired designs align rows (first subcolumn per
    row). options: design ("two_group" | "shared_control" |
    "multi_two_group" | "repeated_baseline" | "repeated_sequential";
    default two_group for 2 data sets, else shared_control), paired
    (false), control_index (0), pairs ([[control, test], ...] for
    multi_two_group), effects (["mean_diff"]; any of "mean_diff",
    "median_diff", "cohens_d", "hedges_g", "cliffs_delta"), ci_level
    (0.95), n_boot (5000), n_permutations (5000), seed (12345), ci_type
    ("bca" | "percentile"), permutation (true), combine ("mini_meta" |
    "delta_delta": the weighted delta of independent unpaired repeats,
    or the second comparison's mean difference minus the first's; mean
    difference only). Result: {"analysis",
    "design", "paired", "groups": [{name, n, mean, sd, median, q1, q3,
    values}], "comparisons": [{control, test, paired, n_control, n_test,
    effects: [{effect, label, difference, ci, ci_type, ci_level, bca_ci,
    percentile_ci, bias_correction, acceleration, bootstrap:
    {n_resamples, mean, sd, percentiles, kde: {x, density, bandwidth}},
    permutation: {p, n_permutations, exact, method}}]}], "plot": {kind:
    "gardner_altman" | "cumming", order, pairs, paired_lines,
    reference_mean?}, "combined"?: {kind, label, difference, ci, bca_ci,
    percentile_ci, comparisons, weights?, bootstrap, permutation?}}."""
    names = [ds.get("name", f"Group {i + 1}")
             for i, ds in enumerate(data["datasets"])]
    design = options.get("design")
    paired = bool(options.get("paired", False)) or design in (
        "repeated_baseline", "repeated_sequential")
    if paired:
        groups = _aligned_columns(data)
    else:
        groups, _ = _flatten_columns(data)
    n_boot = int(options.get("n_boot", 5000))
    n_perm = int(options.get("n_permutations", 5000))
    if n_boot > 100000 or n_perm > 100000:
        raise ValueError("n_boot and n_permutations are limited to 100000")
    return {"analysis": "estimation", **estimation.estimation(
        groups, names, design=design, paired=paired,
        control_index=options.get("control_index", 0),
        pairs=options.get("pairs"),
        effects=options.get("effects", ["mean_diff"]),
        ci_level=options.get("ci_level", 0.95), n_boot=n_boot,
        n_permutations=n_perm, seed=options.get("seed", 12345),
        ci_type=options.get("ci_type", "bca"),
        permutation=options.get("permutation", True),
        combine=options.get("combine"))}


def _power(data, options):
    """Power and sample size (power.py). data is ignored ({}).

    options: kind ("t_two_sample" | "t_one_sample" | "t_paired" |
    "anova_oneway" | "f_test" | "two_proportions" | "one_proportion" |
    "mcnemar" | "correlation" | "logrank" | "chi_square" | "generic"),
    solve ("n" | "power" | "effect"), alpha (0.05), power (target, for
    "n" and "effect"), tails (2), and the kind's parameters (see
    power.py: d / delta + sd, n, n1, ratio, welch, sd1, sd2; f, eta2,
    means, sd, k, equal_n, n_total; df1, groups; p1, p2, method; p0, p,
    balance; p12, p21, odds_ratio, p_discordant; rho, rho0; hr, events,
    method, p_event, median_control, hazard_control, accrual, followup;
    w, df, p0, p1; distribution, ncp, df1, df2). More designs
    (power_designs.py): "anova_rm" (effect within | between |
    interaction, f, k, m, rho, eps, n_total), "ancova" (d, rho, n1,
    ratio), "mann_whitney" / "wilcoxon_signed_rank" (d, parent | are,
    n1 | n), "tost" (design, margin | lower + upper, theta, sd, n1 | n),
    "regression_r2" (predictors, tested, f2 | r2 | r2_change + r2_full,
    n_total), "logistic" (covariate, odds_ratio | p1, p0, x_prop,
    r2_other, n). justification (optional
    {unit, effect_source, attrition}) adds the ARRIVE-style sentence.
    Result: {"analysis": "power", "kind", "solve", "alpha", "tails",
    "power" (achieved at the reported n), "target_power"?, "n_total",
    "n_per_group"? | "n"?, "n_exact"?, "effect": {name, value, ...},
    "ncp"?, "df"?, "critical_*"?, "justification"?: {text, allocate}}."""
    params = {k: v for k, v in options.items()
              if k not in ("kind", "solve", "justification")}
    kind = options.get("kind", "t_two_sample")
    res = power.power_analysis(kind, options.get("solve", "n"), **params)
    out = {"analysis": "power", **res}
    just = options.get("justification")
    if just is not None and kind != "generic":
        out["justification"] = power.justification(
            res, unit=just.get("unit", "animals"),
            effect_source=just.get("effect_source"),
            attrition=just.get("attrition"))
    return out


def _nested_power_sim(data, options):
    """Simulation power of a nested design (nested_power.simulate_power).
    data is ignored. options: test ("t" | "mann_whitney" | "dunnett"),
    k, n (units per group), m (measurements per unit), delta,
    sd_between + sd_within or sd_total + icc, alpha, tails, n_repeats
    (capped at 10000), seed. With "pool": [chunk results] instead, the
    chunks of one run (consecutive seeds) are pooled (nested_power.pool).
    Result: {"analysis": "nested_power_sim", "power", "mc_se", "ci95",
    "n_repeats", "hits", "comparisons", "seed"?, "power_all"?,
    "power_any"?}."""
    from . import nested_power
    if options.get("pool") is not None:
        return {"analysis": "nested_power_sim", **nested_power.pool(
            options["pool"], options.get("test", "t"))}
    keys = ("test", "k", "n", "m", "delta", "sd_between", "sd_within",
            "sd_total", "icc", "alpha", "tails", "n_repeats", "seed")
    return {"analysis": "nested_power_sim", **nested_power.simulate_power(
        **{k: options[k] for k in keys if k in options})}


def _randomize(data, options):
    """Randomisation list (power.randomization_list). data is ignored.
    options: n, groups (["A", "B"]), ratio ([1, 1]), method ("block" |
    "simple" | "shuffled" | "stratified"), block_sizes ([2 x sum(ratio)]),
    strata ([{"name", "n"}]), seed (drawn and reported when omitted),
    id_prefix, start (1). Result: {"analysis": "randomize", "method",
    "seed", "groups", "ratio", "n", "list": [{sequence, id, group,
    block?, stratum?}], "counts", "block_sizes"?, "counts_by_stratum"?}."""
    return {"analysis": "randomize", **power.randomization_list(
        options.get("n"), options.get("groups", ["A", "B"]),
        ratio=options.get("ratio"), method=options.get("method", "block"),
        block_sizes=options.get("block_sizes"), strata=options.get("strata"),
        seed=options.get("seed"), id_prefix=options.get("id_prefix", ""),
        start=int(options.get("start", 1)))}


_HANDLERS.update({
    "effect_size": _effect_size,
    "estimation": _estimation,
    "power": _power,
    "randomize": _randomize,
    "nested_power_sim": _nested_power_sim,
})


# ------------------------------------- clinical statistics, AUC, .pzfx export
# Cox regression (cox), ROC comparison / cut-offs and Bland-Altman extras
# (methodcomp), quantal dose-response (quantal), area under the curve
# (auc) and .pzfx writing (pzfx.write_pzfx).

def _aligned_first(ds):
    """A data set's first subcolumn down the rows, blanks kept."""
    return [row[0] if row else None for row in ds.get("ys", [])]


def _cox(data, options):
    """Cox proportional hazards. data: {"time", "event", "covariates":
    {name: [values]}, "strata"?} or a multiple-variables table
    {"variables": [{"name", "values", "kind"?}]} with options "time",
    "event", "covariates" ([names]; default all others), "strata"? (name)
    and "event_code" (the value meaning an event, default 1; anything else
    non-blank is censored). options: ties ("efron" | "breslow" |
    "exact"), ci_method ("wald" | "profile": adds profile-likelihood
    CIs), ci_level, categorical ([names]), reference ({name: level}), levels
    ({name: [ordered levels]}), ph_transform ("km" | "rank" | "identity" |
    "log"), curves_at ([{name: value, "label"?}]), hazard_method
    ("breslow" | "efron"). Result: {"analysis": "cox", "n", "n_events",
    "coefficients": [{name, term, level?, reference?, coef, se, z, p, ci,
    hazard_ratio, hazard_ratio_ci}], "term_tests", "tests":
    {likelihood_ratio, wald, score: {chi2, df, p}}, "concordance": {c,
    se, ...}, "baseline" and "curves": [{label, covariates, strata:
    [{stratum, time, survival, lower, upper, cumulative_hazard, ...}]}],
    "ph_test": {transform, terms, global}, "schoenfeld", "residuals":
    {martingale, deviance}, "linear_predictor", "warnings", ...}."""
    categorical = list(options.get("categorical") or [])
    if "variables" in data:
        cols = {v["name"]: v for v in data["variables"]}
        tname, ename = options.get("time"), options.get("event")
        if tname not in cols or ename not in cols:
            raise ValueError("options.time and options.event must name "
                             "variables")
        code = options.get("event_code", 1)

        def is_event(v):
            if v is None or v == "":
                return None
            try:
                return 1 if float(v) == float(code) else 0
            except (TypeError, ValueError):
                return 1 if str(v) == str(code) else 0
        time = cols[tname]["values"]
        event = [is_event(v) for v in cols[ename]["values"]]
        sname = options.get("strata")
        names = options.get("covariates") or [
            n for n in cols if n not in (tname, ename, sname)]
        covariates = {n: cols[n]["values"] for n in names}
        categorical += [n for n in names
                        if cols[n].get("kind") == "categorical"]
        strata = cols[sname]["values"] if sname else None
        table = data["variables"]
        used = [tname, ename, *names, *([sname] if sname else [])]
    else:
        time, event = data["time"], data["event"]
        covariates = data["covariates"]
        strata = data.get("strata")
        tname, ename = "Time", "Event"
        table = [{"name": tname, "values": time, "kind": "continuous"},
                 {"name": ename, "values": event, "kind": "continuous"},
                 *({"name": n, "values": v} for n, v in covariates.items()),
                 *([{"name": "Stratum", "values": strata, "kind": "categorical"}]
                   if strata is not None else [])]
        used = [tname, ename, *covariates, *(["Stratum"] if strata is not None else [])]
    # the rows used and why the others were dropped (multivar.analysed_rows)
    return _with_analysed_rows(cox.cox_regression(
        time, event, covariates, categorical=categorical,
        reference=options.get("reference"), levels=options.get("levels"),
        strata=strata, ties=options.get("ties", "efron"),
        ci_level=options.get("ci_level", 0.95),
        ph_transform=options.get("ph_transform", "km"),
        curves_at=options.get("curves_at"),
        hazard_method=options.get("hazard_method"),
        ci_method=options.get("ci_method", "wald")), table, used)


def _roc_compare(data, options):
    """Compare two ROC curves (DeLong). data: column table; options:
    curves ([[patients, controls], [patients, controls]] data-set indices,
    default [[0, 1], [2, 3]]), paired (true: same subjects, rows aligned
    by subject), higher_is_abnormal (bool or [bool, bool]), ci_level,
    alternative ("two_sided" | "greater" | "less"). Result: {"analysis":
    "roc_compare", "method", "auc": [a1, a2], "se", "difference",
    "se_difference", "ci", "statistic", "statistic_name" ("Z" | "D"),
    "df"?, "p", "correlation"?, "names"}."""
    (p1, c1), (p2, c2) = options.get("curves") or [[0, 1], [2, 3]]
    ds = data["datasets"]
    paired = options.get("paired", True)
    get = _aligned_first if paired else (
        lambda d: [v for row in d["ys"] for v in row if v is not None])
    res = methodcomp.roc_compare(
        get(ds[p1]), get(ds[c1]), get(ds[p2]), get(ds[c2]), paired=paired,
        higher_is_abnormal=options.get("higher_is_abnormal", (True, True)),
        ci_level=options.get("ci_level", 0.95),
        alternative=options.get("alternative", "two_sided"))
    res["names"] = [[ds[p1].get("name", ""), ds[c1].get("name", "")],
                    [ds[p2].get("name", ""), ds[c2].get("name", "")]]
    return res


def _roc_cutoff(data, options):
    """Optimal ROC cut-off, threshold table with likelihood ratios, and
    optionally partial AUC and binormal smoothing. data: column table;
    options: patients (0), controls (1), higher_is_abnormal, method
    ("youden" | "closest_topleft"), cost_ratio (FN cost / FP cost),
    prevalence, bootstrap (replicates, 0 = none), seed, ci_level,
    partial_auc ({limits: [hi, lo], focus: "specificity" | "sensitivity",
    correct: bool}), binormal (bool). Result: roc_cutoffs' {"optimal",
    "ties", "thresholds", "bootstrap"?} plus "partial_auc"?, "binormal"?,
    "names"."""
    cols, names = _flatten_columns(data)
    ia, ib = options.get("patients", 0), options.get("controls", 1)
    hia = options.get("higher_is_abnormal", True)
    res = methodcomp.roc_cutoffs(
        cols[ia], cols[ib], higher_is_abnormal=hia,
        method=options.get("method", "youden"),
        cost_ratio=float(options.get("cost_ratio", 1.0)),
        prevalence=options.get("prevalence"),
        bootstrap=int(options.get("bootstrap", 0) or 0),
        seed=options.get("seed"), ci_level=options.get("ci_level", 0.95))
    pa = options.get("partial_auc")
    if pa:
        res["partial_auc"] = methodcomp.roc_partial_auc(
            cols[ia], cols[ib], limits=pa.get("limits", (1.0, 0.9)),
            focus=pa.get("focus", "specificity"),
            correct=bool(pa.get("correct", False)), higher_is_abnormal=hia)
    if options.get("binormal"):
        res["binormal"] = methodcomp.roc_binormal(cols[ia], cols[ib],
                                                  higher_is_abnormal=hia)
    res["names"] = [names[ia], names[ib]]
    return res


def _bland_altman_extras(data, options):
    """Bland-Altman extras (the "bland_altman" output is unchanged).
    Paired single measurements: column table, options dataset_a (0),
    dataset_b (1); rows pair up. Repeated measures: data {"subjects", "a",
    "b"} with options.repeated "varies" (rows are pairs) or "constant"
    (rows may hold only a or only b). options: agreement (0.95),
    ci_level (0.95), z (override, e.g. 1.96), mover_mean ("t" | "z"),
    variants (["difference", "ratio", "percent"]), regression (true).
    Result: {"analysis": "bland_altman_extras", "difference" | "ratio" |
    "percent": {n, bias, bias_ci, sd, loa_lower, loa_upper, loa_ci:
    {approximate, exact, mover: {lower, upper}}, points}, "proportional_
    bias", "normality"} or, repeated, {"analysis": "bland_altman_repeated",
    "bias", "sd", "loa_lower", "loa_upper", "loa_ci", ...}."""
    rep = options.get("repeated")
    if rep:
        return methodcomp.bland_altman_repeated(
            data["subjects"], data["a"], data["b"], true_value=rep,
            agreement=options.get("agreement", 0.95),
            ci_level=options.get("ci_level", 0.95), z=options.get("z"))
    ds = data["datasets"]
    ia, ib = options.get("dataset_a", 0), options.get("dataset_b", 1)
    res = methodcomp.bland_altman_extras(
        _aligned_first(ds[ia]), _aligned_first(ds[ib]),
        agreement=options.get("agreement", 0.95),
        ci_level=options.get("ci_level", 0.95),
        variants=tuple(options.get("variants",
                                   ("difference", "ratio", "percent"))),
        regression=options.get("regression", True), z=options.get("z"),
        mover_mean=options.get("mover_mean", "t"))
    res["names"] = [ds[ia].get("name", ""), ds[ib].get("name", "")]
    res["ccc"] = _ccc_or_error(_aligned_first(ds[ia]), _aligned_first(ds[ib]),
                               options.get("ci_level", 0.95))
    return res


def _ccc_or_error(a, b, ci_level):
    """Lin's CCC (methodcomp.lin_ccc) of row-paired values, or {"error"}."""
    try:
        return methodcomp.lin_ccc(a, b, ci_level=ci_level)
    except ValueError as exc:
        return {"error": str(exc)}


def _method_regression(data, options):
    """Nonparametric method-comparison regression (methodreg): Passing-
    Bablok and Theil-Sen, with Deming (equal error variances) and Lin's
    CCC on the same pairs for comparison.

    data: an XY table {"x", "datasets": [{"name", "ys"}]} (method 1 = X,
    method 2 = each data set; replicates pair with their row's X), or two
    row-paired columns {"a", "b", "names": [name_a, name_b]} (rows missing
    either value are left out). options: ci_level (0.95). Result:
    {"analysis": "method_regression", "ci_level", "comparisons": [{"name",
    "x_name", "n", "points": {"x", "y"}, "passing_bablok": {slope:
    {value, ci}, intercept: {value, ci}, kendall, cusum: {H, p, linear,
    max_cusum, n_above, n_below}, ...} | {"error"}, "theil_sen", "deming":
    {slope, intercept: {value, se, ci}} | {"error"}, "ccc" | {"error"}}]}."""
    level = options.get("ci_level", 0.95)
    if "a" in data:
        names = data.get("names") or ["A", "B"]
        pairs = [(a, b) for a, b in zip(data["a"], data["b"])
                 if not _is_missing(a) and not _is_missing(b)]
        sets = [(names[1], names[0], [p[0] for p in pairs],
                 [p[1] for p in pairs])]
    else:
        sets = []
        for ds in data["datasets"]:
            xs, ys = _expand(data["x"], ds["ys"])
            sets.append((ds.get("name", ""), data.get("x_name", "X"), xs, ys))

    def attempt(fn):
        try:
            return fn()
        except ValueError as exc:
            return {"error": str(exc)}

    out = []
    for name, x_name, xs, ys in sets:
        def dem():
            f = deming.deming(xs, ys, ci_level=level)
            return {"slope": f["slope"], "intercept": f["y_intercept"],
                    "n": f["n"], "se_method": f["se_method"]}
        out.append({
            "name": name, "x_name": x_name, "n": len(xs),
            "points": {"x": xs, "y": ys},
            "passing_bablok": attempt(lambda: methodreg.passing_bablok(
                xs, ys, ci_level=level)),
            "theil_sen": attempt(lambda: methodreg.theil_sen(
                xs, ys, ci_level=level)),
            "deming": attempt(dem),
            "ccc": _ccc_or_error(xs, ys, level),
        })
    return {"analysis": "method_regression", "ci_level": level,
            "comparisons": out}


def _icc(data, options):
    """Intraclass correlation (icc.icc), the six Shrout-Fleiss forms with
    McGraw-Wong F-based CIs. data: a column table, datasets = raters (or
    instruments), rows = targets, one value per cell (first subcolumn; a
    second value in a cell is refused). Rows missing a rating are left
    out with a warning. options: ci_level (0.95). Result: {"analysis":
    "icc", "n_targets", "k_raters", "forms": [{form, value, ci, model,
    type, unit, F, df1, df2, p}], "default": "ICC2", "mean_squares",
    "names", "incomplete_rows", "warnings"?}."""
    dss = data["datasets"]
    for ds in dss:
        for row in ds.get("ys", []):
            if row and any(not _is_missing(v) for v in row[1:]):
                raise ValueError("the ICC takes one rating per cell: enter "
                                 "each rater's rating in one subcolumn")
    cols = [_aligned_first(ds) for ds in dss]
    n_rows = max((len(c) for c in cols), default=0)
    matrix = [[(c[i] if i < len(c) and not _is_missing(c[i]) else None)
               for c in cols] for i in range(n_rows)]
    res = icc.icc(matrix, ci_level=options.get("ci_level", 0.95))
    res["names"] = [ds.get("name", "") or f"Rater {j + 1}"
                    for j, ds in enumerate(dss)]
    if res["incomplete_rows"]:
        res["warnings"] = [_incomplete_warning(res["incomplete_rows"],
                                               "target row")
                           + " (the ICC needs every rater's rating)"]
    return res


def _quantal(data, options):
    """Quantal (probit / logit / cloglog) dose-response. data: {"dose",
    "n", "responders"} for one line; {"groups": [{"name", "dose", "n",
    "responders"}]} for several; or an XY table {"x": doses, "datasets":
    [{"name", "ys": [[responders, n] per row]}]}. options: link
    ("probit" | "logit" | "cloglog"), dose_transform ("log10" | "ln" |
    "none"), natural_response (null | proportion | "estimate"),
    ec_levels ([50]), ci_level, heterogeneity ("auto" | "always" |
    "never"), heterogeneity_alpha (0.05), upper_asymptote (null (1) |
    proportion | "estimate": the plateau of drc's LL.3 binomial model),
    information ("expected" | "observed" SEs), parallel (common slope across
    groups: parallelism test and relative potency), reference (group
    index for potency). Result: one line -> quantal_fit's {"parameters",
    "ec": [{level, x, se_x, dose, dose_ci_fieller, dose_ci_delta, g}],
    "goodness_of_fit", "heterogeneity", "table", "curve", ...}; several
    -> {"analysis": "quantal", "datasets": [{name, ...}]} or, parallel,
    quantal_parallel's result."""
    kw = dict(link=options.get("link", "probit"),
              dose_transform=options.get("dose_transform", "log10"),
              ec_levels=tuple(options.get("ec_levels", (50,))),
              ci_level=options.get("ci_level", 0.95),
              heterogeneity=options.get("heterogeneity", "auto"),
              heterogeneity_alpha=options.get("heterogeneity_alpha", 0.05))
    if "groups" in data:
        groups = data["groups"]
    elif "datasets" in data:
        groups = [{"name": ds.get("name", ""), "dose": data["x"],
                   "responders": [row[0] if row else None for row in ds["ys"]],
                   "n": [row[1] if row and len(row) > 1 else None
                         for row in ds["ys"]]} for ds in data["datasets"]]
    else:
        return quantal.quantal_fit(
            data["dose"], data["n"], data["responders"],
            natural_response=options.get("natural_response"),
            upper_asymptote=options.get("upper_asymptote"),
            information=options.get("information", "expected"),
            curve_points=options.get("curve_points", 101), **kw)
    if options.get("parallel"):
        return quantal.quantal_parallel(
            groups, reference=options.get("reference", 0), **kw)
    out = []
    for g in groups:
        entry = {"name": g.get("name", "")}
        try:
            entry.update(quantal.quantal_fit(
                g["dose"], g["n"], g["responders"],
                natural_response=options.get("natural_response"),
                upper_asymptote=options.get("upper_asymptote"),
                information=options.get("information", "expected"),
                curve_points=options.get("curve_points", 101), **kw))
        except ValueError as exc:
            entry["error"] = str(exc)
        out.append(entry)
    return {"analysis": "quantal", "datasets": out}


def _auc(data, options):
    """Area under the curve. XY table {"x", "datasets": [{"name", "ys"} |
    {"name", "mean", "sd", "n"}]}; options: summary_format (rows hold
    that format's subcolumns, e.g. "mean_sd_n"), baseline ("zero" | "value" |
    "first" | "last" | "mean_first_last"), baseline_value,
    peak_direction ("positive" | "negative" | "both"),
    min_peak_height_pct (10), min_peak_points (0), replicates ("within":
    Gagnon SE | "experiments": one AUC per subcolumn), equal_var, ci_level.
    Result: {"analysis": "auc", "datasets": [{name, area, se, ci, df,
    total_area, total_peak_area, net_peak_area, peaks: [...]} | {name,
    per_replicate, mean, sd, sem, ci}], "comparison"?}. Long format (per
    subject): data {"subject", "group"?, "time", "value"}; options
    baseline ("zero" | "value" | "first"), per_time, equal_var -> {
    "analysis": "subject_auc", "subjects", "table": {"datasets"},
    "groups", "comparison"?}."""
    if "subject" in data:
        subj = data["subject"]
        return auc.subject_auc(
            subj, data.get("group") or [None] * len(subj), data["time"],
            data["value"], baseline=options.get("baseline", "zero"),
            baseline_value=options.get("baseline_value"),
            per_time=bool(options.get("per_time", False)),
            equal_var=options.get("equal_var", True),
            ci_level=options.get("ci_level", 0.95))
    datasets = data["datasets"]
    fmt = options.get("summary_format")
    if fmt and fmt != "replicates":
        datasets = summary.expand_summary_table(data["x"], datasets,
                                                fmt)["datasets"]
    return auc.analyze_datasets(
        data["x"], datasets,
        replicates=options.get("replicates", "within"),
        equal_var=options.get("equal_var", True),
        ci_level=options.get("ci_level", 0.95),
        baseline=options.get("baseline", "zero"),
        baseline_value=options.get("baseline_value"),
        peak_direction=options.get("peak_direction", "positive"),
        min_peak_height_pct=options.get("min_peak_height_pct", 10.0),
        min_peak_points=options.get("min_peak_points", 0))


def _pzfx_export(data, options):
    """Write data tables as a .pzfx file. data: {"tables": [{"title",
    "table": DataTableModel}]} (XY, column, grouped, contingency,
    survival), optionally "info": [{"title", "notes", "constants":
    [{"name", "value"}]}] (the project's info sheets, written as Prism
    Info sheets). Result: {"analysis": "pzfx_export", "xml", "n_tables",
    "warnings"}."""
    return {"analysis": "pzfx_export",
            **pzfx.write_pzfx(data["tables"], data.get("info"))}


_HANDLERS.update({
    "cox": _cox,
    "roc_compare": _roc_compare,
    "roc_cutoff": _roc_cutoff,
    "bland_altman_extras": _bland_altman_extras,
    "method_regression": _method_regression,
    "icc": _icc,
    "quantal": _quantal,
    "auc": _auc,
    "pzfx_export": _pzfx_export,
})


# ------------------------------------------- Wave 1: survival extras, residuals
_HANDLERS.update({
    "survival_pairwise": _survival_pairwise,
    "survival_at_time": _survival_at_time,
    "rmst": _rmst,
    "residuals_column": _residuals_column,
    "competing_risks": _competing_risks,
    "parametric_survival": _parametric_survival,
})


# ------------------------------------------------ Wave 2: user-needs engine
def _scale_check(data, options):
    """Does the SD grow with the mean (opendose.logscale.scale_check)?
    data: column table {"datasets": [{"name", "ys"}]}. options:
    r_threshold (0.7), sd_ratio_threshold (3). Returns {"groups": [{name,
    n, mean, sd, cv}], "pearson_r_sd_mean", "spearman_rho_sd_mean",
    "sd_ratio_max_min", "all_positive", "suggest_log", "reason", "text",
    "rule", "source", "warnings"?}."""
    cols, names = _flatten_columns(data)
    out = {"analysis": "scale_check",
           **logscale.scale_check(
               cols, names,
               r_threshold=options.get("r_threshold", 0.7),
               sd_ratio_threshold=options.get("sd_ratio_threshold", 3.0))}
    warnings = _nan_warnings(data)
    if warnings:
        out["warnings"] = warnings
    return out


def _compare_parameter(data, options):
    """Compare one parameter between two curves (opendose.compare_params).
    data: as dose_response ({"x", "datasets": [{"name", "ys"}]}).
    options: model, parameter ("logEC50" | "LogIC50" | "HillSlope" |
    "Top" | "Bottom" | any model parameter), dataset_a (0), dataset_b
    (1), constraints, weighting, x_is_log (true), ci_level (0.95);
    datasets: [3+ indices] instead of a / b compares the parameter across
    all of them (compare_params.compare_parameter_sets)."""
    model = options.get("model", "log_inhibitor_vs_response_4pl")
    spec = nlfit.MODELS.get(model)
    if spec is None:
        raise ValueError(f"unknown model: {model}")
    if not options.get("parameter"):
        raise ValueError("compare_parameter needs options.parameter")
    x_col = data["x"]
    if spec.x_is_log and not options.get("x_is_log", True):
        x_col = transform.transform_list(x_col, "log10")
    many = options.get("datasets")
    if many is not None and len(many) >= 3:
        # three or more curves: one F test for a parameter shared by all
        idx = [int(i) for i in many]
        if len(set(idx)) != len(idx):
            raise ValueError("each data set can be chosen once")
        sets = []
        for i in idx:
            ds = data["datasets"][i]
            xs, ys = _expand(x_col, ds["ys"])
            sets.append({"name": ds.get("name") or f"Data set {i + 1}",
                         "x": xs, "y": ys})
        out = compare_params.compare_parameter_sets(
            sets, model, options["parameter"],
            constraints=options.get("constraints") or {},
            weighting=options.get("weighting", "none"),
            ci_level=options.get("ci_level", 0.95))
        out["warnings"] = _nan_warnings(data, set(idx)) + out["warnings"]
        return out
    ia, ib = options.get("dataset_a", 0), options.get("dataset_b", 1)
    sets = []
    for i in (ia, ib):
        ds = data["datasets"][i]
        xs, ys = _expand(x_col, ds["ys"])
        sets.append({"name": ds.get("name") or f"Data set {i + 1}",
                     "x": xs, "y": ys})
    warnings = _nan_warnings(data, {ia, ib})
    out = compare_params.compare_parameter(
        sets[0], sets[1], model, options["parameter"],
        constraints=options.get("constraints") or {},
        weighting=options.get("weighting", "none"),
        ci_level=options.get("ci_level", 0.95))
    out["warnings"] = warnings + out["warnings"]
    return out


def _qpcr_reference_check(data, options):
    """Reference-gene stability (opendose.qpcr_refs). data: {"records":
    [{sample, group, target, cq, well?}]} as for qpcr. options:
    reference_genes (required), efficiencies ({gene: factor or %}),
    calibrator, groups (order), test ("anova" | "kruskal"), alpha (0.05),
    shift_threshold (1.0 cycle), m_threshold (1.5), max_cq, max_spread,
    undetermined_value, exclude_high_cq."""
    refs = options.get("reference_genes", options.get("reference"))
    out = qpcr_refs.reference_stability_from_records(
        assay_qpcr.split_controls(data.get("records") or [])[0], refs,
        groups_order=options.get("groups"),
        **_assay_kw(options, (
            "max_cq", "max_spread", "undetermined_value", "exclude_high_cq",
            "efficiencies", "calibrator", "test", "alpha",
            "shift_threshold", "m_threshold")))
    return {"analysis": "qpcr_reference_check", **out}


def _flow_summary(data, options):
    """Flow gate statistics to one value per experiment x condition
    (opendose.flow). data: {"records": [{sample, experiment | donor,
    condition, gate, statistic, value}]}. options: statistic, gate,
    background {kind: "fmo" | "isotype" | "none", condition}, conditions
    (order), experiments (order)."""
    return flow.flow_summary(
        data.get("records") or [], statistic=options.get("statistic"),
        gate=options.get("gate"), background=options.get("background"),
        conditions=options.get("conditions"),
        experiments=options.get("experiments"))


def _flow_events(data, options):
    """Flow cytometry event counts (FEATURE-PLAN P-50). Counting is a
    Poisson process, so r positive events have a CV of 1/sqrt(r)
    (Roederer 2008, Cytometry A 73:384, "How many events is enough? Are
    you positive?"): a target CV needs r = 1/CV^2 positive events and,
    at an expected frequency f, r / f events in all (10% CV at 0.1%:
    100 positive events, 100,000 in all). An observed gated percentage
    k of n gets the Wilson score CI (partsofwhole.proportion_ci).
    data: {"target_cv"?: %, "frequency"?: %, "positive"?: k,
    "total"?: n}; options: ci_level (0.95). Returns {"plan": {...} |
    None, "observed": {...} | None}, each with "error" when its inputs
    cannot give a number."""
    import math

    def _num(v):
        try:
            v = float(v)
        except (TypeError, ValueError):
            return None
        return v if math.isfinite(v) else None

    level = float(options.get("ci_level", 0.95))
    out = {"analysis": "flow_events", "ci_level": level,
           "source": "Roederer 2008, Cytometry A 73:384 (Poisson CV); "
                     "Wilson 1927 score interval",
           "plan": None, "observed": None}
    cv, f = _num(data.get("target_cv")), _num(data.get("frequency"))
    if cv is not None or f is not None:
        if cv is None or not 0 < cv < 100:
            out["plan"] = {"error": "Enter a target CV above 0% and below 100%."}
        elif f is None or not 0 < f <= 100:
            out["plan"] = {"error": "Enter an expected frequency above 0% and "
                                    "at most 100%."}
        else:
            # round before the ceiling: 1/0.1^2 is 99.99999999999998 in floats
            pos = math.ceil(round(1.0 / (cv / 100.0) ** 2, 6))
            out["plan"] = {"target_cv_pct": cv, "frequency_pct": f,
                           "positive_events": pos,
                           "total_events": math.ceil(round(pos / (f / 100.0), 6)),
                           "achieved_cv_pct": 100.0 / math.sqrt(pos)}
    k, n = _num(data.get("positive")), _num(data.get("total"))
    if k is not None or n is not None:
        if n is None or n < 1 or n != int(n):
            out["observed"] = {"error": "Enter the events in the parent gate "
                                        "as a whole number of 1 or more."}
        elif k is None or k < 0 or k != int(k) or k > n:
            out["observed"] = {"error": "Enter the positive events as a whole "
                                        "number from 0 to the parent's events."}
        else:
            k, n = int(k), int(n)
            lo, hi = partsofwhole.proportion_ci(k, n, method="wilson",
                                                ci_level=level)
            # the Wilson limits at k = 0 and k = n are exactly 0 and 1
            # (rounding leaves about 1e-17 otherwise)
            lo, hi = (0.0 if k == 0 else lo), (1.0 if k == n else hi)
            out["observed"] = {
                "positive": k, "total": n, "percent": 100.0 * k / n,
                "ci_pct": [100.0 * lo, 100.0 * hi], "method": "wilson",
                # Poisson CV of the positive count; none without events
                "count_cv_pct": 100.0 / math.sqrt(k) if k > 0 else None}
    return out


_HANDLERS.update({
    "scale_check": _scale_check,
    "compare_parameter": _compare_parameter,
    "qpcr_reference_check": _qpcr_reference_check,
    "flow_summary": _flow_summary,
    "flow_events": _flow_events,
})


# ------------------------------------------- Wave 3: mixed models (nested,
# grouping column, time course). Payload and result shapes are documented
# on each handler; methods and sources in opendose.mixed_nested and
# opendose.mixed_timecourse.
from . import mixed_nested, mixed_timecourse  # noqa: E402


def _mixed_nested_two_way(data, options):
    """Two-way nested mixed model value ~ A * B + (1 | unit), REML,
    containment df (units - cells). data: {"records": [{value, factor_a,
    factor_b, unit, replicate?}]} or column arrays {"value", "factor_a",
    "factor_b", "unit"}, or the grouped-table layout {"row_titles": [A
    levels], "datasets": [{"name": B level, "ys": [[unit values (number
    or list of replicates) per subcolumn] per row], "unit_names"?:
    [[label per subcolumn] per row]}]}. options: factor_a_name,
    factor_b_name, levels_a, levels_b, unit_name ("units"), unit_labels
    ("within_cell" | "as_given"), negative_variance ("allow" | "zero"),
    ci_level, comparisons (tukey | dunnett | bonferroni | sidak |
    holm_sidak | holm | fisher), comparison_scope (b_within_a |
    a_within_b | cells | a_means | b_means), control_index. Result:
    {"analysis", "formula", "anova": [{term, f, dfn, dfd, p,
    significant_05, error_term}], "variance_components": {unit, residual:
    {variance, sd, percent_of_total}}, "icc", "design_effect",
    "effective_n", "n_units", "n_values", "cell_means": [{a, b, mean, se,
    ci, df, n_units, n_values, raw_mean}], "marginal_means", "comparisons",
    "units", "design_note", "warnings", ...}."""
    return mixed_nested.mixed_nested_two_way(data, options)


def _mixed_grouping(data, options):
    """Multiple-variables table: outcome ~ factors (1-2, with interaction)
    + (1 | grouping). data: {"variables": [{"name", "values"}]}. options:
    outcome, factors ([names]), grouping (column name), levels
    ({factor: [order]}), unit_name, negative_variance, ci_level,
    comparisons, comparison_scope, control_index. Result: as
    mixed_nested_two_way with "analysis": "mixed_grouping", "outcome",
    "grouping"."""
    for key in ("outcome", "factors", "grouping"):
        if not options.get(key):
            raise ValueError(f"mixed_grouping needs options.{key}")
    return mixed_nested.mixed_grouping(
        _mv_variables(data), options["outcome"], options["factors"],
        options["grouping"], options)


def _mixed_timecourse(data, options):
    """Group x time mixed model (opendose.mixed_timecourse). data:
    {"records": [{subject, group, time, value}]}, column arrays {"subject",
    "group", "time", "value"} (the auc handler's per-subject payload), or
    a grouped table {"x" | "row_titles": times, "datasets": [{"name":
    group, "ys": [[subject values] per time], "subject_names"?}]}.
    options: covariance (cs | ar1 | unstructured | random_slope), time_as
    (factor | linear), center_time, random_intercept (ar1), method (reml |
    ml), baseline_covariate, baseline_time, negative_variance,
    compare_covariances, comparisons (default sidak; null for none),
    control_index, ci_level, include_auc, auc_baseline. Result:
    {"analysis", "formula", "anova", "covariance": {kind, label,
    parameters, implied_covariance, times}, "fit": {method,
    minus2_log_likelihood, reml_loglik | log_likelihood, aic, bic,
    n_covariance_parameters, converged}, "group_at_time",
    "group_difference_at_time", "model_comparison"?, "auc"?, "warnings",
    ...}."""
    return mixed_timecourse.mixed_timecourse(data, options)


_HANDLERS.update({
    "mixed_nested_two_way": _mixed_nested_two_way,
    "mixed_grouping": _mixed_grouping,
    "mixed_timecourse": _mixed_timecourse,
})

from . import lmm  # noqa: E402


def _lmm(data, options):
    """General linear mixed model on a long table (opendose.lmm, P-87):
    outcome ~ factors (0-2, with interaction) + covariates + (1 [+
    slopes] | group) [+ (1 | group:subgroup)]. data: {"variables":
    [{"name", "values"}]}. options: outcome, group (required), subgroup,
    factors, covariates, slopes (covariates with a random slope on
    group), slope_structure ("correlated" | "independent"), ddf
    ("kenward_roger" | "satterthwaite"), ci_level, levels, comparisons,
    comparison_scope, control_index, group_word, subgroup_word. Result:
    {"analysis": "lmm", "formula", "fixed_effects": [{term, estimate,
    se, df, t, p, ci}], "anova": [{term, f, dfn, dfd, p}],
    "random_effects", "correlations", "residual", "boundary",
    "converged", "emmeans", "comparisons", "goodness_of_fit",
    "warnings", ...}."""
    for key in ("outcome", "group"):
        if not options.get(key):
            raise ValueError(f"lmm needs options.{key}")
    return lmm.lmm_long(
        _mv_variables(data), options["outcome"],
        factors=options.get("factors") or [],
        covariates=options.get("covariates") or [],
        group=options["group"], subgroup=options.get("subgroup") or None,
        slopes=options.get("slopes") or [], options=options)


_HANDLERS["lmm"] = _lmm

from . import precision  # noqa: E402


def _precision_study(data, options):
    """Assay precision and recovery (opendose.precision, P-94): per
    sample, repeatability (within-run), between-run, between-day and total
    variance components with SD, CV and CIs (CLSI EP05-A3 / VCA), the
    repeatability coefficient and, with a nominal concentration, recovery
    with the acceptance verdicts. data: {"samples": [{"name", "values",
    "runs", "days"?, "nominal"?}]} or {"records": [{value, run, day?,
    sample?, nominal?}]}. options: ci_level, recovery_limit, cv_limit
    (percent), use_days."""
    return precision.precision_study(data, options)


_HANDLERS["precision_study"] = _precision_study

from . import meta  # noqa: E402


def _meta_analysis(data, options):
    """Combining experiments: common- and random-effects meta-analysis
    (opendose.meta, P-92). data: {"rows": [{"label", "values"}]}, one row
    per experiment holding the subcolumns of one data set. options:
    format ("mean_sem" | "mean_sem_n" | "mean_sd_n" | "mean_ci_n" |
    "mean_limits"), scale ("difference" | "log_ratio" | "ratio"),
    limits_level (0.95, for mean_limits), method ("REML" | "DL"), test
    ("knha" | "z"), ci_level (0.95), name (the data set). Result:
    {"analysis": "meta_analysis", "name", "k", "studies", "dropped",
    "fixed", "random", "heterogeneity", "prediction", "notes", ...}
    (meta.meta_analysis)."""
    scale = options.get("scale", "difference")
    labels, est, ses, problems = meta.read_rows(
        data.get("rows") or [], options.get("format", "mean_sem"),
        scale=scale, limits_level=float(options.get("limits_level", 0.95)))
    res = meta.meta_analysis(
        est, ses, labels, method=options.get("method", "REML"),
        test=options.get("test", "knha"),
        ci_level=float(options.get("ci_level", 0.95)), scale=scale)
    for d in res["dropped"]:
        if d["label"] in problems:
            d["reason"] = problems[d["label"]]
    return {"analysis": "meta_analysis", "name": options.get("name"), **res}


_HANDLERS["meta_analysis"] = _meta_analysis


def analyze(payload: dict) -> dict:
    kind = payload.get("analysis")
    if kind not in _HANDLERS:
        return {"error": f"unknown analysis: {kind}"}
    try:
        return _HANDLERS[kind](payload["data"], payload.get("options") or {})
    except Exception as exc:
        out = {"error": str(exc), "traceback": traceback.format_exc()}
        # a refusal the app can act on (multivar.SeparationError: offer Firth)
        if getattr(exc, "kind", None):
            out["error_kind"] = exc.kind
        return out


def _json_safe(obj):
    """Replace non-finite floats with None; JS JSON.parse rejects the
    Infinity/NaN literals Python's json module would emit."""
    if isinstance(obj, float) and (obj != obj or obj in (float("inf"), float("-inf"))):
        return None
    if isinstance(obj, dict):
        return {k: _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_json_safe(v) for v in obj]
    return obj


def analyze_json(payload_json: str) -> str:
    """String-in/string-out wrapper for the Pyodide bridge."""
    return json.dumps(_json_safe(analyze(json.loads(payload_json))))
