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
from . import multivar, partsofwhole
from . import formulas, manipulate, simulate
from . import summary
from . import mixedmodel, nested


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
    # options.summary_format: ds["ys"] rows hold that format's subcolumns
    # (or ds carries summary.expand_summary_table's mean/sd/n arrays);
    # options.replicates: "account" (default) | "means_only".
    summary_fmt = options.get("summary_format")
    if summary_fmt == "replicates":
        summary_fmt = None

    finite_x = [v for v in x_col if v is not None]
    results = []
    for ds in data["datasets"]:
        entry = {"name": ds.get("name", "")}
        try:
            s_kw = {}
            if summary_fmt:
                xs, ys, s_kw = summary.fit_inputs(
                    x_col, ds, summary_fmt,
                    options.get("replicates", "account"))
            else:
                xs, ys = _expand(x_col, ds["ys"])
            if rout_q:
                rout = nlfit.rout_outliers(xs, ys, model, q=float(rout_q),
                                           constraints=constraints, **s_kw)
                fit = rout["fit"]
                entry["rout"] = {k: rout[k] for k in
                                 ("q", "rsdr", "outliers", "n_outliers")}
            else:
                fit = nlfit.fit_model(xs, ys, model, constraints=constraints,
                                      weighting=weighting, ci_method=ci_method,
                                      **s_kw)
            fit["curve"] = doseresponse.curve_points(
                fit, min(finite_x), max(finite_x))
            x_lo, x_hi = min(fit["curve"]["x"]), max(fit["curve"]["x"])
            if options.get("diagnostics"):
                entry["diagnostics"] = diagnostics.fit_diagnostics(xs, ys, fit)
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
            "bars": (summary.dataset_error_bars(ds, summary_fmt,
                                                error_bar_kind)
                     if summary_fmt else
                     descriptive.error_bars(ds["ys"], error_bar_kind)),
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
    for entry, ds in zip(result["datasets"], data["datasets"]):
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
    "source": "model"|"table"}. source "table" uses the row means of
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
        ideal=ideal, names=options.get("names"), seed=options.get("seed"))}


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
    tails: 1|2, ci_level, variables?: [names]}."""
    if "variables" in data:
        variables = data["variables"]
    else:
        variables = [{"name": ds.get("name", ""), "kind": "continuous",
                      "values": [row[0] if row else None for row in ds["ys"]]}
                     for ds in data["datasets"]]
    names = options.get("variables")
    if names:
        variables = [v for v in variables if v.get("name") in names]
    return {"analysis": "correlation_matrix",
            **multivar.correlation_matrix(
                variables, method=options.get("method", "pearson"),
                missing=options.get("missing", "pairwise"),
                ci_level=options.get("ci_level", 0.95),
                tails=int(options.get("tails", 2)))}


def _multiple_regression(data, options):
    """data: multiple-variables table. options: {outcome: name,
    predictors: [names], interactions?: [[a, b]], reference_levels?:
    {variable: level}, ci_level?}."""
    return {"analysis": "multiple_regression",
            **multivar.multiple_regression(
                _mv_variables(data), options["outcome"], options["predictors"],
                interactions=options.get("interactions") or (),
                reference_levels=options.get("reference_levels"),
                ci_level=options.get("ci_level", 0.95))}


def _logistic_regression(data, options):
    """data: multiple-variables table (or XY-style {"x", "y"} lists for
    simple logistic regression). options: {outcome, predictors,
    interactions?, reference_levels?, outcome_positive?, ci_level?,
    ci_method?: profile|wald, cutoff?: 0.5, hl_groups?: 10}."""
    if "variables" in data:
        variables = data["variables"]
        outcome, predictors = options["outcome"], options["predictors"]
    else:
        variables = [{"name": "X", "values": data["x"]},
                     {"name": "Y", "values": data["y"]}]
        outcome, predictors = "Y", ["X"]
    return {"analysis": "logistic_regression",
            **multivar.logistic_regression(
                variables, outcome, predictors,
                interactions=options.get("interactions") or (),
                reference_levels=options.get("reference_levels"),
                outcome_positive=options.get("outcome_positive"),
                ci_level=options.get("ci_level", 0.95),
                ci_method=options.get("ci_method", "profile"),
                cutoff=options.get("cutoff", 0.5),
                hl_groups=int(options.get("hl_groups", 10)))}


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


def _nested_ttest(data, options):
    """Nested t test (mixed model, random subcolumn effect).
    data = {"groups": [{"name": str, "subgroups": [[values...], ...],
    "subgroup_names": [str, ...] (optional)}, x2]}, None = missing.
    options: ci_level (0.95), swap (False -> difference is B - A),
    negative_variance ("allow" | "zero")."""
    groups, names, sub_names = _nested_groups(data)
    return nested.nested_t_test(
        groups, names=names, subgroup_names=sub_names,
        ci_level=options.get("ci_level", 0.95),
        swap=options.get("swap", False),
        negative_variance=options.get("negative_variance", "allow"))


def _nested_anova(data, options):
    """Nested one-way ANOVA. data as for nested_ttest with >= 2 groups.
    options: comparisons (tukey | dunnett | bonferroni | sidak |
    holm_sidak | fisher), control_index (Dunnett), ci_level,
    negative_variance."""
    groups, names, sub_names = _nested_groups(data)
    return nested.nested_one_way_anova(
        groups, names=names, subgroup_names=sub_names,
        comparisons=options.get("comparisons"),
        control_index=options.get("control_index", 0),
        ci_level=options.get("ci_level", 0.95),
        negative_variance=options.get("negative_variance", "allow"))


def _mixed_rm_oneway(data, options):
    """Repeated-measures one-way via the mixed model (missing values
    allowed). Payload as rm_anova: datasets = treatments, ys rows =
    subjects, first subcolumn used, None = missing. options: method
    ("mixed" always | "auto" = RM ANOVA unless values are missing |
    "anova"), comparisons, control_index, ci_level, negative_variance
    ("allow" | "remove")."""
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
                                                   "allow")}
    result = mixedmodel.rm_one_way(aligned, names, method=method, **kwargs)
    return {"analysis": result.get("analysis", "rm_one_way_anova"), **result}


def _mixed_rm_twoway(data, options):
    """Two-way repeated measures via the mixed model (missing values
    allowed). Payload as rm_two_way: datasets = columns, ys[row] =
    subcolumn values (subcolumn = subject), None = missing. options:
    design ("mixed" | "both"), row_names, method ("mixed" | "auto" |
    "anova"), comparisons, direction (columns_within_rows |
    rows_within_columns | column_means | row_means), control_index,
    ci_level, negative_variance."""
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
                                                   "allow")}
    return mixedmodel.rm_two_way(
        cells, design=options.get("design", "mixed"), method=method,
        row_names=row_names, col_names=names, **kwargs)


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
    "logistic_regression": _logistic_regression,
    "pca": _pca,
    "mv_rearrange": _mv_rearrange,
    "chisq_goodness_of_fit": _chisq_goodness_of_fit,
    "fraction_of_total": _fraction_of_total,
    "nested_ttest": _nested_ttest,
    "nested_anova": _nested_anova,
    "mixed_rm_oneway": _mixed_rm_oneway,
    "mixed_rm_twoway": _mixed_rm_twoway,
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
