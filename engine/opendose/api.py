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
import traceback

from . import (anova, columnstats, contingency, correlation, descriptive,
               diagnostics, doseresponse, globalfit, interpolate, linregress,
               methodcomp, nlfit, normalize, outliers, plate, plate_io,
               prism_project, pzfx, repeated, schild, survival, transform,
               ttests, twoway)


def _expand(x_col, replicate_rows):
    """Pair each replicate with its row X: -> (xs, ys) flat lists."""
    xs, ys = [], []
    for xv, row in zip(x_col, replicate_rows):
        if xv is None:
            continue
        for yv in row:
            if yv is not None:
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


def _dose_response(data, options):
    """Nonlinear regression for any registered model. For models whose X
    is log10(concentration), x_is_log=False means the engine applies
    X = log10(X) first (Prism's 'transform concentrations to logs')."""
    model = options.get("model", "log_inhibitor_vs_response_4pl")
    spec = nlfit.MODELS.get(model)
    if spec is None:
        raise ValueError(f"unknown model: {model}")
    constraints = options.get("constraints") or {}
    weighting = options.get("weighting", "none")
    ci_method = options.get("ci_method", "asymptotic")
    rout_q = options.get("rout_q")  # e.g. 0.01 turns on ROUT
    x_col = data["x"]
    if spec.x_is_log and not options.get("x_is_log", True):
        x_col = transform.transform_list(x_col, "log10")

    finite_x = [v for v in x_col if v is not None]
    results = []
    for ds in data["datasets"]:
        entry = {"name": ds.get("name", "")}
        try:
            xs, ys = _expand(x_col, ds["ys"])
            if rout_q:
                rout = nlfit.rout_outliers(xs, ys, model, q=float(rout_q),
                                           constraints=constraints)
                fit = rout["fit"]
                entry["rout"] = {k: rout[k] for k in
                                 ("q", "rsdr", "outliers", "n_outliers")}
            else:
                fit = nlfit.fit_model(xs, ys, model, constraints=constraints,
                                      weighting=weighting, ci_method=ci_method)
            fit["curve"] = doseresponse.curve_points(
                fit, min(finite_x), max(finite_x))
            x_lo, x_hi = min(fit["curve"]["x"]), max(fit["curve"]["x"])
            if options.get("diagnostics"):
                entry["diagnostics"] = diagnostics.fit_diagnostics(xs, ys, fit)
            band_kind = options.get("bands")  # 'confidence' | 'prediction'
            if band_kind:
                entry["bands"] = interpolate.bands(
                    fit, fit["curve"]["x"], kind=band_kind)
            interp_y = options.get("interpolate_y")
            if interp_y:
                entry["interpolated_x"] = interpolate.interpolate_x(
                    fit, interp_y, x_lo, x_hi)
            abs_level = options.get("absolute_ic50_level")
            if abs_level is not None:
                fit["params"]["AbsoluteIC50"] = _abs_ic50_entry(
                    fit, float(abs_level), x_lo, x_hi)
            fit.pop("_cov", None)  # internal; keep the JSON payload lean
            entry["fit"] = fit
        except Exception as exc:  # per-dataset failure must not kill others
            entry["error"] = str(exc)
        results.append(entry)

    error_bar_kind = options.get("error_bars", "sd")
    for ds, entry in zip(data["datasets"], results):
        entry["points"] = {
            "x": x_col,
            "bars": descriptive.error_bars(ds["ys"], error_bar_kind),
        }
    return {"analysis": "dose_response", "x_is_log_output": True,
            "datasets": results}


def _normalize(data, options):
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


def _plate_quantify(data, options):
    """data: {"grid": rows x cols} | {"text": pasted block} | {"xlsx_b64":
    base64 xlsx bytes}. options: the plate.quantify_plate layout. Returns
    per-group dose tables shaped like the main data model (x = dose,
    datasets with replicate rows), ready for the grouped table / fit."""
    grid = data.get("grid")
    if grid is None and data.get("xlsx_b64"):
        import base64
        grid = plate_io.parse_xlsx(base64.b64decode(data["xlsx_b64"]))
    if grid is None:
        grid = plate_io.parse_text(data["text"])
    result = plate.quantify_plate(grid, options)
    doses = result["groups"][0]["doses"] if result["groups"] else []
    return {
        "analysis": "plate_quantify",
        "blank": result["blank"],
        "x": doses,
        "datasets": [
            {"name": g["name"], "ys": g["values"],
             "control_mean": g["control_mean"]}
            for g in result["groups"]
        ],
    }


def _flatten_columns(data):
    """Column-table view of the data model: every dataset's cells,
    row-major, as one flat list per dataset (X is ignored)."""
    cols, names = [], []
    for ds in data["datasets"]:
        cols.append([v for row in ds["ys"] for v in row if v is not None])
        names.append(ds.get("name", ""))
    return cols, names


def _column_statistics(data, options):
    cols, names = _flatten_columns(data)
    return {
        "analysis": "column_statistics",
        "datasets": [
            {"name": name,
             **columnstats.column_statistics(
                 col, hypothetical=options.get("hypothetical"),
                 ci_level=options.get("ci_level", 0.95))}
            for name, col in zip(names, cols)
        ],
    }


def _ttest(data, options):
    cols, names = _flatten_columns(data)
    ia, ib = options.get("dataset_a", 0), options.get("dataset_b", 1)
    kind = options.get("kind", "unpaired")
    if kind == "unpaired":
        result = ttests.unpaired_t(cols[ia], cols[ib],
                                   welch=options.get("welch", False),
                                   ci_level=options.get("ci_level", 0.95))
    elif kind == "paired":
        result = ttests.paired_t(cols[ia], cols[ib],
                                 ci_level=options.get("ci_level", 0.95))
    elif kind == "mann_whitney":
        result = ttests.mann_whitney(cols[ia], cols[ib])
    elif kind == "wilcoxon":
        result = ttests.wilcoxon_matched_pairs(cols[ia], cols[ib])
    else:
        raise ValueError(f"unknown t test kind: {kind}")
    result["names"] = [names[ia], names[ib]]
    return {"analysis": "ttest", **result}


def _anova(data, options):
    cols, names = _flatten_columns(data)
    kind = options.get("kind", "parametric")
    if kind == "nonparametric":
        return {"analysis": "anova", "kind": kind,
                **anova.kruskal_wallis(cols, names)}
    result = anova.one_way_anova(cols, names)
    method = options.get("comparisons")
    if method:
        result["multiple_comparisons"] = anova.multiple_comparisons(
            cols, method, names=names,
            control_index=options.get("control_index", 0),
            ci_level=options.get("ci_level", 0.95))
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
    fits = []
    for key in ("model_1", "model_2"):
        opts = dict(options.get(key) or {})
        model = opts.pop("model")
        sub = _dose_response(
            {"x": data["x"], "datasets": [data["datasets"][ds_index]]},
            {"model": model, "x_is_log": options.get("x_is_log", True), **opts})
        entry = sub["datasets"][0]
        if "error" in entry:
            raise ValueError(f"{model}: {entry['error']}")
        fits.append(entry["fit"])
        results[key] = entry["fit"]
    g1, g2 = fits[0]["goodness"], fits[1]["goodness"]
    k1 = g1["n_points"] - g1["df"]
    k2 = g2["n_points"] - g2["df"]
    simple, complex_ = (0, 1) if k1 <= k2 else (1, 0)
    gs, gc = fits[simple]["goodness"], fits[complex_]["goodness"]
    f_test = None
    if gs["df"] > gc["df"]:
        f_test = nlfit.compare_fits_f_test(gs["ss_res"], gs["df"],
                                           gc["ss_res"], gc["df"])
        f_test["simpler_model"] = simple + 1
    results["f_test"] = f_test
    results["aicc"] = nlfit.compare_fits_aicc(
        g1["ss_res"], k1, g2["ss_res"], k2, g1["n_points"])
    return {"analysis": "compare_fits", **results}


def _correlation(data, options):
    cols, names = _flatten_columns(data)
    ia, ib = options.get("dataset_a", 0), options.get("dataset_b", 1)
    result = correlation.correlate(cols[ia], cols[ib],
                                   method=options.get("method", "pearson"))
    result["names"] = [names[ia], names[ib]]
    return {"analysis": "correlation", **result}


def _contingency(data, options):
    return {"analysis": "contingency",
            **contingency.contingency(data["table"],
                                      yates=options.get("yates", True))}


def _two_way_anova(data, options):
    # cells[row][dataset] = replicate list, straight from the grouped table
    n_rows = max(len(ds["ys"]) for ds in data["datasets"])
    cells = []
    for r in range(n_rows):
        row = []
        for ds in data["datasets"]:
            row.append(ds["ys"][r] if r < len(ds["ys"]) else [])
        cells.append(row)
    names = [ds.get("name", "") for ds in data["datasets"]]
    result = {"analysis": "two_way_anova",
              "dataset_names": names,
              **twoway.two_way_anova(
                  cells,
                  row_factor=options.get("row_factor", "Rows"),
                  col_factor=options.get("col_factor", "Columns"))}
    method = options.get("comparisons")  # tukey | sidak | bonferroni
    if method:
        row_names = options.get("row_names") or [
            f"Row {i + 1}" for i in range(len(cells))]
        result["multiple_comparisons"] = twoway.two_way_comparisons(
            cells, method=method,
            direction=options.get("direction", "columns_within_rows"),
            row_names=row_names, col_names=names)
    return result


def _global_fit(data, options):
    model = options.get("model", "log_inhibitor_vs_response_4pl")
    spec = nlfit.MODELS[model]
    x_col = data["x"]
    if spec.x_is_log and not options.get("x_is_log", True):
        x_col = transform.transform_list(x_col, "log10")
    gdatasets = []
    for ds in data["datasets"]:
        xs, ys = _expand(x_col, ds["ys"])
        gdatasets.append({"name": ds.get("name", ""), "x": xs, "y": ys})
    result = globalfit.fit_global(
        gdatasets, model, options.get("shared") or [],
        constraints=options.get("constraints") or {},
        weighting=options.get("weighting", "none"))
    finite_x = [v for v in x_col if v is not None]
    error_bar_kind = options.get("error_bars", "sd")
    for entry, ds in zip(result["datasets"], data["datasets"]):
        entry["curve"] = doseresponse.curve_points(
            {"model": model, "fitted_values": entry["fitted_values"],
             "x_is_log": spec.x_is_log},
            min(finite_x), max(finite_x))
        entry["points"] = {
            "x": x_col,
            "bars": descriptive.error_bars(ds["ys"], error_bar_kind),
        }
    return {"analysis": "global_fit", **result}


def _linear_regression(data, options):
    x_col = data["x"]
    results = []
    for ds in data["datasets"]:
        xs, ys = _expand(x_col, ds["ys"])
        entry = {"name": ds.get("name", "")}
        try:
            fit = linregress.linear_regression(xs, ys)
            finite = [v for v in xs if v is not None]
            grid = [min(finite) + i * (max(finite) - min(finite)) / 199
                    for i in range(200)]
            fit["curve"] = {
                "x": grid,
                "y": [fit["slope"]["value"] * v + fit["y_intercept"]["value"]
                      for v in grid],
            }
            if options.get("bands"):
                fit["bands"] = linregress.linear_bands(
                    xs, ys, grid, kind=options["bands"])
            entry["fit"] = fit
        except Exception as exc:
            entry["error"] = str(exc)
        results.append(entry)
    return {"analysis": "linear_regression", "datasets": results}


def _survival(data, options):
    """datasets: one per group; each row = one subject with subcolumns
    [time, event(1=event, 0=censored)]."""
    groups, names = [], []
    for ds in data["datasets"]:
        times, events = [], []
        for row in ds["ys"]:
            if len(row) >= 2 and row[0] is not None and row[1] is not None:
                times.append(float(row[0]))
                events.append(int(row[1]))
        if times:
            groups.append((times, events))
            names.append(ds.get("name", ""))
    if not groups:
        raise ValueError("no survival data (need time + event subcolumns)")
    if len(groups) == 1:
        return {"analysis": "survival",
                "curves": {names[0]: survival.km_curve(*groups[0])}}
    return {"analysis": "survival",
            **survival.compare_survival(groups, names)}


def _rm_anova(data, options):
    cols, names = _flatten_columns(data)
    # RM analyses need row alignment -> use first subcolumn per dataset
    aligned = [[row[0] if row else None for row in ds["ys"]]
               for ds in data["datasets"]]
    kind = options.get("kind", "parametric")
    if kind == "nonparametric":
        return {"analysis": "friedman",
                **repeated.friedman(aligned, names)}
    return {"analysis": "rm_one_way_anova",
            **repeated.rm_one_way_anova(aligned, names)}


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
    if options.get("design", "mixed") == "both":
        return repeated.rm_two_way_both(cells, row_names=row_names,
                                        col_names=names)
    return repeated.rm_two_way_mixed(cells, row_names=row_names,
                                     col_names=names)


def _ec50_shift(data, options):
    """Gaddum/Schild EC50 shift: one curve per dataset, each with its
    antagonist concentration from options.antagonist (linear units)."""
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
}


def analyze(payload: dict) -> dict:
    kind = payload.get("analysis")
    if kind not in _HANDLERS:
        return {"error": f"unknown analysis: {kind}"}
    try:
        return _HANDLERS[kind](payload["data"], payload.get("options") or {})
    except Exception as exc:
        return {"error": str(exc), "traceback": traceback.format_exc()}


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
