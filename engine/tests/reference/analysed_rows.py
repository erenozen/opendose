"""Independent reference for the "Analysed" line of regression and Cox
results (FEATURE-PLAN P-16). R is not installed here, so the oracle is
statsmodels with missing = "drop" (listwise deletion of the rows with a
missing value in any variable of the model, R's na.omit): nobs of OLS,
GLM (binomial, Poisson) and PHReg, and the rows pandas finds missing.

The table: 30 rows; Age blank in rows 3, 9, 17 and 22 (1-based), the
plan's acceptance test; Dose holds the text "n/a" in row 27 for the
second case (not a number).

Run: /home/eren/opendose/.venv/bin/python engine/tests/reference/analysed_rows.py
writes analysed_rows.json next to this file.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
import statsmodels.api as sm
from statsmodels.duration.hazard_regression import PHReg

HERE = Path(__file__).resolve().parent


def table():
    rng = np.random.default_rng(16)
    n = 30
    age = np.round(rng.uniform(30, 70, n), 0)
    dose = np.round(rng.uniform(1, 10, n), 1)
    y = np.round(2 + 0.05 * age + 0.8 * dose + rng.normal(0, 1, n), 2)
    resp = (rng.uniform(size=n) < 1 / (1 + np.exp(-(dose - 5) / 2))).astype(int)
    count = rng.poisson(np.exp(0.2 + 0.1 * dose))
    time = np.round(rng.exponential(20 / (1 + 0.1 * dose)), 1)
    event = (rng.uniform(size=n) < 0.7).astype(int)
    cols = {"Y": y.tolist(), "Age": age.tolist(), "Dose": dose.tolist(),
            "Response": resp.tolist(), "Count": count.tolist(),
            "Time": time.tolist(), "Event": event.tolist()}
    for r in (3, 9, 17, 22):
        cols["Age"][r - 1] = None
    return cols


def nobs(cols, outcome, predictors, family=None, text_row=None):
    d = pd.DataFrame(cols).astype(object)
    if text_row is not None:
        d.loc[text_row - 1, "Dose"] = None   # "n/a": not a number
    d = d[[outcome, *predictors]].apply(pd.to_numeric)
    missing_rows = [int(i) + 1 for i in np.flatnonzero(d.isna().any(axis=1).to_numpy())]
    X = sm.add_constant(d[predictors])
    if family is None:
        fit = sm.OLS(d[outcome], X, missing="drop").fit()
    else:
        fit = sm.GLM(d[outcome], X, family=family, missing="drop").fit()
    return {"nobs": int(fit.nobs), "dropped_rows": missing_rows}


def cox(cols):
    d = pd.DataFrame(cols).astype(object)[["Time", "Event", "Age", "Dose"]].apply(pd.to_numeric)
    missing_rows = [int(i) + 1 for i in np.flatnonzero(d.isna().any(axis=1).to_numpy())]
    m = PHReg(d["Time"], d[["Age", "Dose"]], status=d["Event"], missing="drop")
    return {"nobs": int(m.exog.shape[0]), "dropped_rows": missing_rows}


def main():
    cols = table()
    ref = {
        "table": cols,
        "multiple": nobs(cols, "Y", ["Age", "Dose"]),
        "multiple_text": nobs(cols, "Y", ["Age", "Dose"], text_row=27),
        "logistic": nobs(cols, "Response", ["Age", "Dose"], sm.families.Binomial()),
        "poisson": nobs(cols, "Count", ["Age", "Dose"], sm.families.Poisson()),
        "poisson_dose_only": nobs(cols, "Count", ["Dose"], sm.families.Poisson()),
        "cox": cox(cols),
    }
    (HERE / "analysed_rows.json").write_text(json.dumps(ref, indent=1) + "\n")


if __name__ == "__main__":
    main()
