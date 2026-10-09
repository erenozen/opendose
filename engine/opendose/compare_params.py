"""Compare one fitted parameter (logEC50, Hill slope, Top, ...) between
two curves.

Method sources:

- GraphPad curve-fitting guide, "Comparing fits: compare one parameter"
  / "Compare: Do the best-fit values of selected parameters differ
  between data sets?": fit the two data sets with the parameter shared
  (one value for both, a global fit) and with separate values, and
  compare the two fits with the extra-sum-of-squares F test and with
  AICc (opendose.nlfit.compare_fits_f_test / compare_fits_aicc). The
  other parameters stay separate for each data set in both fits.
- Motulsky & Christopoulos (2004), Fitting Models to Biological Data
  Using Linear and Nonlinear Regression (Oxford UP), ch. 27-29
  (comparing one best-fit value between data sets): t = (P_B - P_A) /
  sqrt(SE_A^2 + SE_B^2) with df = df_A + df_B, from two separate fits
  (also the GraphPad FAQ "Compare two best-fit values from separate
  fits"). Reported here as "difference", with the Welch-Satterthwaite
  df (Welch 1947, Biometrika 34:28) as an alternative.
- Ratio: for a parameter on the log10 scale (logEC50, logIC50, logKi,
  ...), the antilog of the difference is the ratio of the two
  concentrations (EC50 ratio, "relative potency", dose ratio), and the
  antilogs of the difference's CI are its CI (curve-fitting guide,
  "EC50 ratio"; Motulsky & Christopoulos ch. 27). For a parameter on a
  linear scale the ratio B / A gets Fieller's (1954, J R Stat Soc B
  16:175) CI for a ratio of two independent estimates; it is unbounded
  (reported as null) when A is not clearly different from zero.
"""

from __future__ import annotations

import math

from scipy import stats

from . import equations, nlfit

SOURCE = ("GraphPad curve-fitting guide, 'Comparing fits: compare one "
          "parameter'; Motulsky & Christopoulos 2004, Fitting Models to "
          "Biological Data, ch. 27-29; Fieller 1954 (ratio CI)")

_LOG_ALIASES = ("logec50", "logic50", "logxmid", "log_ec50", "log_ic50",
                "ec50", "ic50")


def _display(spec, name):
    if name == "LogXmid":
        return "LogIC50" if "IC50" in spec.equation else "LogEC50"
    return name


def resolve_parameter(spec, parameter: str) -> str:
    """Internal parameter name for a user-facing one (logEC50 -> LogXmid
    for the sigmoid models; case-insensitive otherwise)."""
    if parameter in spec.params:
        return parameter
    low = str(parameter).lower()
    if "LogXmid" in spec.params and low in _LOG_ALIASES:
        return "LogXmid"
    for p in spec.params:
        if p.lower() == low or _display(spec, p).lower() == low:
            return p
    raise ValueError(f"unknown parameter {parameter!r} for {spec.name} "
                     f"(parameters: {', '.join(_display(spec, p) for p in spec.params)})")


def _internal_constraints(spec, model, constraints):
    out = {}
    for name, v in (constraints or {}).items():
        key = ("LogXmid" if name in ("LogIC50", "LogEC50")
               and "LogXmid" in spec.params else name)
        out[key] = float(v)
    if model == "log_inhibitor_vs_response_3pl":
        out.setdefault("HillSlope", -1.0)
    if model == "log_agonist_vs_response_3pl":
        out.setdefault("HillSlope", 1.0)
    return out


def _wss(goodness):
    w = goodness.get("ss_res_weighted")
    return float(w if w is not None else goodness["ss_res"])


def _t_block(diff, se, df, ci_level):
    tcrit = float(stats.t.ppf((1 + ci_level) / 2, df))
    if se > 0:
        t = diff / se
        p = 2.0 * float(stats.t.sf(abs(t), df))
    else:
        t = math.inf if diff else math.nan
        p = 0.0 if diff else 1.0
    return {"value": float(diff), "se": float(se), "t": float(t),
            "df": float(df), "p": p,
            "ci": [float(diff - tcrit * se), float(diff + tcrit * se)]}


def fieller_ratio(a, se_a, b, se_b, df, ci_level=0.95):
    """Ratio b / a of two independent estimates with Fieller's CI:
    g = t^2 se_a^2 / a^2; limits [q +/- (t/|a|) sqrt(se_b^2 (1 - g) +
    q^2 se_a^2)] / (1 - g); None when g >= 1 (unbounded)."""
    if a == 0:
        return {"value": None, "ci": None, "method": "fieller"}
    q = b / a
    t = float(stats.t.ppf((1 + ci_level) / 2, df))
    g = (t * se_a / a) ** 2
    ci = None
    if g < 1:
        half = (t / abs(a)) * math.sqrt(se_b ** 2 * (1 - g)
                                        + q ** 2 * se_a ** 2)
        ci = [float((q - half) / (1 - g)), float((q + half) / (1 - g))]
    return {"value": float(q), "ci": ci, "method": "fieller", "g": float(g)}


def compare_parameter(set_a, set_b, model: str, parameter: str, *,
                      constraints=None, weighting: str = "none",
                      ci_level: float = 0.95) -> dict:
    """set_a / set_b: {"name", "x": [...], "y": [...]} (X already in the
    model's units, log10 for log-X models)."""
    if model not in nlfit.MODELS:
        raise ValueError(f"unknown model: {model}")
    spec = nlfit.MODELS[model]
    internal = resolve_parameter(spec, parameter)
    fixed = _internal_constraints(spec, model, constraints)
    if internal in fixed:
        raise ValueError(f"{_display(spec, internal)} is constrained to a "
                         "constant: there is nothing to compare")
    display = _display(spec, internal)
    names = [set_a.get("name") or "A", set_b.get("name") or "B"]
    warnings, notes = [], []

    # 1. separate fits (each data set alone, as in dose_response)
    separate, fits = [], []
    for ds, nm in zip((set_a, set_b), names):
        fit = nlfit.fit_model(ds["x"], ds["y"], model, constraints=fixed,
                              weighting=weighting)
        fits.append(fit)
        p = fit["params"].get(display) or fit["params"].get(internal)
        if p is None or p.get("se") is None:
            raise ValueError(f"{nm}: {display} has no standard error "
                             f"(fit status {fit.get('status')})")
        if fit.get("status") not in (None, "converged"):
            warnings.append(f"{nm}: the fit is {fit.get('status')}; its "
                            f"{display} may not be meaningful")
        separate.append({"name": nm, "value": float(p["value"]),
                         "se": float(p["se"]),
                         "ci": [float(v) for v in p["ci95"]],
                         "df": int(fit["goodness"]["df"]),
                         "n_points": int(fit["goodness"]["n_points"]),
                         "ss_res": _wss(fit["goodness"]),
                         "status": fit.get("status")})
    a, b = separate

    # 2. difference B - A (Motulsky & Christopoulos: df = df_A + df_B)
    se = math.sqrt(a["se"] ** 2 + b["se"] ** 2)
    diff = _t_block(b["value"] - a["value"], se, a["df"] + b["df"],
                    ci_level)
    diff["label"] = f"{display}: {names[1]} - {names[0]}"
    diff["method"] = ("t = difference / sqrt(SE_A^2 + SE_B^2), df = df_A "
                      "+ df_B (separate fits)")
    va, vb = a["se"] ** 2, b["se"] ** 2
    welch_df = ((va + vb) ** 2 / (va ** 2 / a["df"] + vb ** 2 / b["df"])
                if va + vb > 0 else float(a["df"] + b["df"]))
    welch = _t_block(diff["value"], se, welch_df, ci_level)

    # 3. ratio
    if internal.startswith("Log") and spec.x_is_log:
        lin = display[3:]
        ratio = {"value": 10.0 ** diff["value"],
                 "ci": [10.0 ** diff["ci"][0], 10.0 ** diff["ci"][1]],
                 "method": "antilog of the difference of log values",
                 "label": f"{lin} ratio ({names[1]} / {names[0]})",
                 "kind": "potency_ratio"}
    else:
        ratio = fieller_ratio(a["value"], a["se"], b["value"], b["se"],
                              diff["df"], ci_level)
        ratio["label"] = f"{display} ratio ({names[1]} / {names[0]})"
        ratio["kind"] = "ratio"
        if ratio["ci"] is None and ratio["value"] is not None:
            notes.append(f"Fieller CI of the {display} ratio is unbounded: "
                         f"{names[0]}'s {display} is not clearly different "
                         "from zero")

    # 4. shared vs separate: extra sum-of-squares F test and AICc
    gsets = [{"name": names[0], "x": set_a["x"], "y": set_a["y"]},
             {"name": names[1], "x": set_b["x"], "y": set_b["y"]}]
    shared_fit = equations.fit_global_model(gsets, model, shared=[internal],
                                            constraints=fixed,
                                            weighting=weighting)
    ss_sep = a["ss_res"] + b["ss_res"]
    n_total = a["n_points"] + b["n_points"]
    k_sep = (a["n_points"] - a["df"]) + (b["n_points"] - b["df"])
    df_sep = n_total - k_sep
    ss_sh = _wss(shared_fit["goodness"])
    df_sh = int(shared_fit["goodness"]["df"])
    k_sh = n_total - df_sh
    if ss_sh < ss_sep * (1 - 1e-9):
        warnings.append("The shared fit has a smaller sum of squares than "
                        "the two separate fits: a separate fit stopped at a "
                        "local minimum; the F test is set to F = 0")
    f_test = None
    if df_sh > df_sep:
        f_test = nlfit.compare_fits_f_test(max(ss_sh, ss_sep), df_sh,
                                           ss_sep, df_sep)
        f_test["f"] = f_test["F"]
        f_test.update({"ss_shared": ss_sh, "df_shared": df_sh,
                       "ss_separate": ss_sep, "df_separate": df_sep,
                       "null_hypothesis": f"one {display} for both data "
                                          "sets"})
    aicc = nlfit.compare_fits_aicc(ss_sh, k_sh, ss_sep, k_sep, n_total)
    aicc.update({"model_1": f"one shared {display}",
                 "model_2": f"separate {display} values",
                 "preferred": ("shared" if aicc["prefer"] == 1
                               else "separate")})
    sh_entry = None
    for ds in shared_fit["datasets"]:
        if internal in ds["params"]:
            q = ds["params"][internal]
            sh_entry = {"value": q["value"], "se": q["se"],
                        "ci": q["ci95"]}
            break
    if weighting != "none":
        notes.append(f"Sums of squares are weighted ({weighting}).")
    return {
        "analysis": "compare_parameter",
        "model": model, "parameter": display,
        "parameter_internal": internal,
        "dataset_names": names,
        "separate": separate,
        "difference": diff,
        "difference_welch": {"df": welch["df"], "ci": welch["ci"],
                             "p": welch["p"]},
        "ratio": ratio,
        "f_test": f_test,
        "aicc": aicc,
        "shared_fit": {"value": sh_entry, "ss_res": ss_sh, "df": df_sh,
                       "n_parameters": k_sh},
        "ci_level": ci_level,
        "warnings": warnings, "notes": notes, "source": SOURCE,
    }
