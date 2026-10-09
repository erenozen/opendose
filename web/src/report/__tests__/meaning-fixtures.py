"""Native engine results for the "What this means" tests (meaning.test.ts)
that fixtures.json does not hold: Cox and logistic regression, multiple
and linear regression, a t test whose CI spans zero, a three-group
survival comparison. Regenerate after an engine change with

    python3 web/src/report/__tests__/meaning-fixtures.py > web/src/report/__tests__/meaning-fixtures.json

from the repository root (numpy and scipy needed). Long arrays are left
out to keep the file small.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "..", "..", "engine"))
from opendose.api import analyze, _json_safe  # noqa: E402

TIME = [5, 8, 12, 14, 20, 22, 25, 30, 33, 40, 6, 9, 15, 18, 26, 31, 35, 42, 48, 50]
EVENT = [1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0]
GROUP = ["Control"] * 10 + ["Treated"] * 10
AGE = [60, 62, 58, 70, 66, 59, 61, 64, 67, 72, 61, 63, 57, 69, 65, 60, 62, 66, 68, 71]
DOSE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] * 2
SEX = ["F", "M"] * 10
RESP = [0, 0, 0, 1, 0, 1, 1, 1, 1, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 1]
WEIGHT = [21.0, 22.4, 23.1, 24.9, 25.2, 26.8, 27.5, 29.1, 29.8, 31.6,
          20.5, 22.9, 22.8, 25.3, 24.7, 27.2, 27.9, 28.6, 30.4, 31.1]
MV = [{"name": "Dose", "values": DOSE}, {"name": "Sex", "values": SEX},
      {"name": "Response", "values": RESP}, {"name": "Weight", "values": WEIGHT}]

CASES = {
    "cox": ("cox", {"time": TIME, "event": EVENT,
                    "covariates": {"Group": GROUP, "Age": AGE}},
            {"categorical": ["Group"]}),
    "logistic": ("logistic_regression", {"variables": MV},
                 {"outcome": "Response", "predictors": ["Dose", "Sex"]}),
    "multiple_regression": ("multiple_regression", {"variables": MV},
                            {"outcome": "Weight", "predictors": ["Dose", "Sex"]}),
    "linear_regression": ("linear_regression", {
        "x": [1, 2, 3, 4, 5, 6],
        "datasets": [{"name": "Rate", "ys": [[2.1], [3.9], [6.2], [7.8], [10.1], [12.2]]}]}, {}),
    "ttest_ns": ("ttest", {"x": [None] * 6, "datasets": [
        {"name": "Vehicle", "ys": [[v] for v in [10.2, 12.5, 9.8, 11.4, 13.0, 10.9]]},
        {"name": "Drug", "ys": [[v] for v in [11.0, 12.9, 10.1, 12.2, 13.8, 9.9]]}]},
        {"kind": "unpaired", "welch": True, "dataset_a": 0, "dataset_b": 1}),
    "survival_three": ("survival", {"x": [None] * 6, "datasets": [
        {"name": "A", "ys": [[3, 1], [5, 1], [7, 1], [9, 0], [11, 1], [12, 1]]},
        {"name": "B", "ys": [[4, 1], [8, 1], [10, 1], [14, 0], [16, 1], [18, 0]]},
        {"name": "C", "ys": [[6, 1], [12, 0], [15, 1], [20, 1], [22, 0], [25, 0]]}]}, {}),
}

DROP = {"schoenfeld", "residuals", "linear_predictor", "baseline", "roc",
        "predicted_probability", "observed", "points", "fitted", "residual_plot",
        "curve", "bands"}


def trim(v):
    if isinstance(v, dict):
        return {k: trim(x) for k, x in v.items() if k not in DROP}
    if isinstance(v, list):
        return [trim(x) for x in v[:12]]
    return v


out = {}
for key, (analysis, data, options) in CASES.items():
    r = analyze({"analysis": analysis, "data": data, "options": options})
    out[key] = {"options": options, "result": trim(_json_safe(r))}
json.dump(out, sys.stdout, indent=1, sort_keys=True)
sys.stdout.write("\n")
