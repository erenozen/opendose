"""Potency across independent experiments.

When the replicates of a dose-response table come from several
independent experiments (technical wells nested in experiments), a fit of
all the wells together gives a confidence interval that counts wells, not
experiments: it describes the scatter of the wells around one curve and
says nothing about how much the potency varies from one experiment to the
next (pseudoreplication; Lazic SE 2010, "The problem of pseudoreplication
in neuroscientific studies: is it affecting your analysis?", BMC Neurosci
11:5). The experiment is the unit, so:

1. each experiment is fitted on its own with the same model and options
   (the existing nonlinear regression, `nlfit`);
2. its log potency (logIC50 / logEC50, log10 of the concentration unit)
   is the one value it contributes;
3. the values are summarised on the log scale: mean, SD, and the
   t-based 95% CI  mean +/- t(0.975, n - 1) * SD / sqrt(n),  n = number
   of experiments. Log potencies are close to Gaussian and potencies on
   the linear scale are not, so averaging and the t interval are done on
   the logs and the results are antilogged: 10^mean is the geometric-mean
   IC50, and its CI (10^lower, 10^upper) is asymmetric. Never average
   IC50s on the linear scale. (Christopoulos A 1998, "Assessing the
   distribution of parameters in models of ligand-receptor interaction:
   to log or not to log", Trends Pharmacol Sci 19:351-357; Motulsky H &
   Christopoulos A 2004, Fitting Models to Biological Data Using Linear
   and Nonlinear Regression, Oxford University Press.)
4. pIC50 = -log10(IC50 in mol/L) is reported only when the concentration
   unit is molar (the caller passes log10 of the unit in mol/L, e.g. -6
   for uM); its mean is -(mean logIC50 + that exponent) with the same SD,
   and its CI is the logIC50 CI negated and shifted.

An experiment whose fit failed, is ambiguous (the data do not define the
parameters) or whose potency lies outside the concentrations it tested
(an extrapolation) is named, left out with its reason, and n shrinks; with
fewer than two usable experiments there is no spread to estimate and the
summary is withheld with a message.
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats

POTENCY_PARAMS = ("LogIC50", "LogEC50")


def experiment_rows(replicate_rows, of, experiment):
    """The rows of one experiment: for each row, the values of the
    subcolumns k with of[k] == experiment (rows x subcolumns layout)."""
    return [[v for k, v in enumerate(row or []) if k < len(of) and of[k] == experiment]
            for row in replicate_rows]


def potency_param(fit: dict) -> str | None:
    """The fitted log-potency parameter of a fit (LogIC50 / LogEC50)."""
    params = fit.get("params") or {}
    for name in POTENCY_PARAMS:
        e = params.get(name)
        if e is not None and not e.get("derived"):
            return name
    return None


def _ambiguous(fit: dict) -> bool:
    if fit.get("status") == "ambiguous":
        return True
    if fit.get("fit_method") == "robust":
        return False  # robust fits have no SEs by design
    dep = (fit.get("dependency") or {}).values()
    if any(v is None or not math.isfinite(v) or v > 0.9999 for v in dep):
        return True
    free = [e for e in (fit.get("params") or {}).values()
            if not e.get("constrained") and not e.get("derived")]
    return bool(free) and all(e.get("se") is None or not math.isfinite(e["se"])
                              for e in free)


def exclusion_reason(fit: dict, param: str, flags: dict | None) -> str | None:
    """Why an experiment's potency cannot enter the summary, or None."""
    if fit["params"][param].get("constrained"):
        return f"its {param[3:]} was constrained, not fitted"
    if _ambiguous(fit):
        return "ambiguous fit: the data do not define the parameters"
    out_of_range = bool(fit.get("extrapolation")) or bool(
        flags and not flags.get("error")
        and (flags.get("ec50_above_range") or flags.get("ec50_below_range")))
    if out_of_range:
        return (f"its {param[3:]} lies outside the concentrations tested "
                "(extrapolated)")
    return None


def potency_summary(log_values, *, log10_molar: float | None = None) -> dict:
    """Summary of log10 potencies, one per independent experiment.

    Returns n, df, mean_log, sd_log, sem_log, t_crit, ci95_log, geomean
    and geomean_ci95 (10^mean and the antilogged CI, in the concentration
    unit), and p_mean / p_ci95 (pIC50, only when log10_molar is given).
    With n < 2 there is no SD or CI: those are None and `withheld` says
    why. Pure; the single source of the across-experiments numbers.
    """
    vals = np.asarray([float(v) for v in log_values], dtype=float)
    if vals.size and not np.all(np.isfinite(vals)):
        raise ValueError("log potencies must be finite numbers")
    n = int(vals.size)
    out = {"n": n, "df": max(n - 1, 0), "mean_log": None, "sd_log": None,
           "sem_log": None, "t_crit": None, "ci95_log": None,
           "geomean": None, "geomean_ci95": None,
           "p_mean": None, "p_ci95": None, "withheld": None}
    if n == 0:
        out["withheld"] = "no experiment gave a potency to summarise"
        return out
    mean = float(np.mean(vals))
    out["mean_log"] = mean
    out["geomean"] = 10.0 ** mean
    if log10_molar is not None:
        out["p_mean"] = -(mean + float(log10_molar))
    if n == 1:
        out["withheld"] = ("one experiment (n = 1): no spread across "
                           "experiments to estimate, so no SD or CI")
        return out
    sd = float(np.std(vals, ddof=1))
    sem = sd / math.sqrt(n)
    t = float(stats.t.ppf(0.975, n - 1))
    lo, hi = mean - t * sem, mean + t * sem
    out.update({"sd_log": sd, "sem_log": sem, "t_crit": t,
                "ci95_log": [lo, hi],
                "geomean_ci95": [10.0 ** lo, 10.0 ** hi]})
    if log10_molar is not None:
        k = float(log10_molar)
        out["p_ci95"] = [-(hi + k), -(lo + k)]
    return out


def across_experiments(x_col, replicate_rows, of, names, fit_one, *,
                       log10_molar=None, flags_of=None) -> dict:
    """Fit each experiment of one data set and summarise its potencies.

    x_col: the X column (the fit's units); replicate_rows: rows x
    subcolumns; of[k]: the experiment of subcolumn k (0..len(names)-1);
    fit_one(rows) -> (fit, xs, ys) fits one experiment's rows (raising on
    failure); flags_of(fit, xs, ys) -> range flags or None.
    """
    fits = []
    for e, name in enumerate(names):
        rows = experiment_rows(replicate_rows, of, e)
        item = {"name": name, "included": False, "reason": None,
                "error": None, "n_points": sum(
                    1 for xv, r in zip(x_col, rows) if xv is not None
                    for v in r if v is not None and v == v)}
        try:
            fit, xs, ys = fit_one(rows)
        except Exception as exc:  # one experiment must not cost the others
            item["error"] = str(exc)
            item["reason"] = f"the fit failed: {exc}"
            fits.append(item)
            continue
        param = potency_param(fit)
        if param is None:
            raise ValueError("this model has no logIC50 or logEC50 to "
                             "summarise across experiments")
        e_param = fit["params"][param]
        flags = flags_of(fit, xs, ys) if flags_of else None
        item.update({
            "param": param,
            "log_value": float(e_param["value"]),
            "value": 10.0 ** float(e_param["value"]),
            "ci95_log": e_param.get("ci95"),
            "status": fit.get("status"),
            "n_points": int(fit.get("goodness", {}).get("n_points", len(xs))),
        })
        reason = exclusion_reason(fit, param, flags)
        item["included"] = reason is None
        item["reason"] = reason
        fits.append(item)
    params = {f.get("param") for f in fits if f.get("param")}
    param = params.pop() if len(params) == 1 else None
    used = [f["log_value"] for f in fits if f["included"]]
    summary = potency_summary(used, log10_molar=log10_molar)
    excluded = [f for f in fits if not f["included"]]
    if summary["n"] < 2 and excluded:
        summary["withheld"] = (
            f"fewer than two experiments can be summarised ({summary['n']} of "
            f"{len(fits)}): " + "; ".join(f"{f['name']}: {f['reason']}"
                                         for f in excluded))
    return {"param": param or "LogIC50", "label": (param or "LogIC50")[3:],
            "n_experiments": len(fits), "fits": fits, "summary": summary,
            "log10_molar": log10_molar}
