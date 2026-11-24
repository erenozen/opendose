"""Native engine results for the result kinds merged after P-66 that the
statistics table (statsTable.ts), "What this means" (meaning.ts) and the
script snippets (scripts.ts) now read: relative potency, comparing two
global models, a precision study, competing risks, parametric survival,
meta-analysis, smoothing (smooth_xy, curve_ops), uncertainty carried
through Normalize, custom and repeated-measures interaction contrasts,
and a dose-response fit with bootstrap CIs. The data are the engine
tests' published examples (engine/tests: test_relative_potency.py S.
alba, test_compare_global_models.py, test_precision.py,
test_competing_risks.py tidycmprsk trial, test_parametric_survival.py
ovarian, test_meta.py BCG, test_rm_contrasts.py, test_fit_bootstrap.py,
test_propagation.py), loaded through those modules' own payload builders.
Regenerate after an engine change with

    PYTHONPATH=engine:engine/tests /home/eren/opendose/.venv/bin/python \\
        web/src/report/__tests__/kinds-fixtures.py > web/src/report/__tests__/kinds-fixtures.json

from the repository root. Long arrays (curves, residuals) are left out.
"""
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..", "..", "..")
sys.path.insert(0, os.path.join(ROOT, "engine"))
sys.path.insert(0, os.path.join(ROOT, "engine", "tests"))
from opendose.api import analyze, _json_safe  # noqa: E402

import test_relative_potency as trp  # noqa: E402
import test_compare_global_models as tcg  # noqa: E402
import test_competing_risks as tcr  # noqa: E402
import test_parametric_survival as tps  # noqa: E402
import test_meta as tm  # noqa: E402
import test_rm_contrasts as trc  # noqa: E402
import test_fit_bootstrap as tfb  # noqa: E402
import test_precision as tpr  # noqa: E402

CARS_SPEED = [4, 4, 7, 7, 8, 9, 10, 10, 10, 11, 11, 12, 12, 12, 12, 13, 13, 13, 13, 14, 14, 14, 14,
              15, 15, 15, 16, 16, 17, 17, 17, 18, 18, 18, 18, 19, 19, 19, 20, 20, 20, 20, 20, 22, 23,
              24, 24, 24, 24, 25]
CARS_DIST = [2, 10, 4, 22, 16, 10, 18, 26, 34, 17, 28, 14, 20, 24, 28, 26, 34, 34, 46, 26, 36, 60,
             80, 20, 26, 54, 32, 40, 32, 40, 50, 42, 56, 76, 84, 36, 46, 68, 32, 48, 52, 56, 64, 66,
             54, 70, 92, 93, 120, 85]
SPEEDS = sorted(set(CARS_SPEED))
CARS = {"x": SPEEDS, "datasets": [{"name": "Distance", "ys": [
    [d for s, d in zip(CARS_SPEED, CARS_DIST) if s == x] for x in SPEEDS]}]}

trial_names, trial_groups = tcr._trial()
z = 1.959963984540054
META_ROWS = [{"label": l, "values": [math.exp(y), math.exp(y + z * s), math.exp(y - z * s)]}
             for l, y, s in zip(tm.LABELS, tm.Y, tm.SE)]
REC = tpr.REF["recovery"]
MIX = trc.REF["mixed_2x2"]
ONE = trc.REF["oneway_custom"]

CASES = {
    "relative_potency": {"analysis": "relative_potency", "data": trp._data(),
                         "options": {"model": "log_logistic_4pl_conc", "x_is_log": False}},
    "compare_global_fits": {"analysis": "compare_global_fits", "data": tcg.VMK,
                            "options": {"model_1": {"model": "competitive_inhibition"},
                                        "model_2": {"model": "mixed_model_inhibition"},
                                        "column_constants": {"I": tcg.VMK_LEVELS}}},
    "precision_study": {"analysis": "precision_study", "data": {"samples": [
        {"name": "QC mid", "values": [r["y"] for r in REC["records"]],
         "runs": [r["run"] for r in REC["records"]], "nominal": REC["nominal"]}]},
        "options": {"recovery_limit": 15, "cv_limit": 15}},
    "competing_risks": {"analysis": "competing_risks", "data": tcr._payload(trial_names, trial_groups),
                        "options": {"times": [5, 10, 15, 20]}},
    "parametric_survival": {"analysis": "parametric_survival", "data": tps._payload(),
                            "options": {"dist": "weibull"}},
    "meta_analysis": {"analysis": "meta_analysis", "data": {"rows": META_ROWS},
                      "options": {"format": "mean_limits", "scale": "ratio", "test": "z"}},
    "smooth_spline": {"analysis": "smooth_xy", "data": CARS,
                      "options": {"method": "smoothing_spline"}},
    "smooth_lowess": {"analysis": "smooth_xy", "data": CARS, "options": {"method": "lowess"}},
    "curve_ops": {"analysis": "curve_ops", "data": CARS, "options": {"op": "integral"}},
    "rm_contrasts": {"analysis": "rm_two_way", "data": trc.mixed_payload(MIX["records"]),
                     "options": {"design": "mixed", "row_names": ["Vehicle", "Drug"]}},
    "custom_contrasts": {"analysis": "anova", "data": {"datasets": [
        {"name": n, "ys": [[v] for v in ONE["groups"][n]]} for n in ONE["groups"]]},
        "options": {"custom_contrasts": [{"name": c["name"], "coefficients": c["coefficients"],
                                          "planned": p} for c in ONE["contrasts"] for p in (True, False)]}},
    "dose_bootstrap": tfb._payload(boot={"method": "case", "resamples": 500, "seed": 1}),
}

DROP = {"curve", "curves", "residuals", "residual_check", "points", "bands", "fitted", "_residuals",
        "landscapes", "boot_samples", "samples_matrix", "replicates_boot"}


def trim(v):
    if isinstance(v, dict):
        return {k: trim(x) for k, x in v.items() if k not in DROP}
    if isinstance(v, list):
        return [trim(x) for x in v]
    return v


def main():
    out = {}
    for key, payload in CASES.items():
        res = analyze(payload)
        out[key] = {"payload": payload, "result": trim(_json_safe(res))}
        print(key, "error: " + res["error"] if isinstance(res, dict) and res.get("error") else "ok",
              file=sys.stderr)
    json.dump(_json_safe(out), sys.stdout, separators=(",", ":"))
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
