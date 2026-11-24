"""Reference values for P-98 (uncertainty carried through Remove baseline
and Normalize): engine/tests/test_propagation.py and the e2e step.

R (propagate) is not installed. Oracles:

- Python `uncertainties` 3.2.3 (Lebigot; first-order propagation with
  the correlations tracked through every intermediate value), installed
  for this script only, outside the project's .venv:
    /home/eren/opendose/.venv/bin/python -m pip install --target <dir> uncertainties==3.2.3
    PYTHONPATH=<dir> /home/eren/opendose/.venv/bin/python engine/tests/reference/propagation.py
  Each replicate value is its own independent variable (nominal value its
  row's mean, standard deviation its row's SD), so a reference row
  normalized against itself and a baseline row minus its own mean keep
  their exact correlations; row means are sums of those variables / n.
- A Monte Carlo check (100000 draws of Gaussian replicates with the
  rows' means and SDs) of the SDs of the derived values.
- The closed form of the acceptance test (hand derivation): a sample's
  value minus a blank mean of n_b replicates has SD sqrt(s_y^2 + s_b^2 / n_b)
  and its row mean SE sqrt(s_y^2 / n_y + s_b^2 / n_b).

Run from the repository root (see above for the PYTHONPATH).
"""
import json
import math
import os

import numpy as np
from uncertainties import ufloat

HERE = os.path.dirname(__file__)

# The acceptance data: three samples in triplicate (OD), a blank of three
# wells: mean 0.0513, SD 0.0035, n 3
SAMPLES = [[0.412, 0.398, 0.405], [0.731, 0.752, 0.744], [0.120, 0.131, 0.126]]
BLANK = {"mean": 0.0513, "sd": 0.0035, "n": 3}
BLANK_WELLS = [[0.051, 0.048, 0.055], [0.053, 0.049, 0.050], [0.047, 0.052, 0.054]]
# Normalize: a dose series in triplicate, 0% = first row, 100% = last row
DOSE = [[2.1, 1.8, 2.4], [5.2, 4.7, 5.9], [21.0, 18.5, 23.1], [48.2, 51.0, 46.3], [61.5, 58.9, 63.0]]


def rows_as_ufloats(grid):
    """One independent variable per replicate, nominal = its row mean."""
    out = []
    for row in grid:
        a = np.array(row, float)
        m, s = a.mean(), a.std(ddof=1)
        out.append([ufloat(m, s) for _ in a])
    return out


def mean_of(us):
    return sum(us) / len(us)


def baseline_value(op):
    """Rows minus (or over) a typed blank mean with its SE."""
    b = ufloat(BLANK["mean"], BLANK["sd"] / math.sqrt(BLANK["n"]))
    res = []
    for us in rows_as_ufloats(SAMPLES):
        one, mean = op(us[0], b), op(mean_of(us), b)
        # the baseline's share: the row mean held exact
        res.append({"value": mean.n, "sd": one.s, "se": mean.s, "from_baseline": op(mean_of(us).n, b).s})
    return res


def baseline_column(op):
    """Rows minus the same row of a blank data set (its row mean)."""
    res = []
    for us, bw in zip(rows_as_ufloats(SAMPLES), rows_as_ufloats(BLANK_WELLS)):
        b = mean_of(bw)
        one, mean = op(us[0], b), op(mean_of(us), b)
        res.append({"value": mean.n, "sd": one.s, "se": mean.s, "from_baseline": op(mean_of(us).n, b).s})
    return res


def baseline_first_row():
    """Each row minus the first row's mean (the same column): row 0 is in
    the baseline pool, so its correlation with the baseline is exact."""
    pool = np.array(DOSE[0], float)
    us = rows_as_ufloats(DOSE)
    sb = pool.std(ddof=1)
    pool_u = [ufloat(pool.mean(), sb) for _ in pool]
    us[0] = pool_u
    b = mean_of(pool_u)
    res = []
    for row in us:
        one, mean = row[0] - b, mean_of(row) - b
        res.append({"value": mean.n, "sd": one.s, "se": mean.s})
    return res


def normalized(zero="first", hundred="last"):
    us = rows_as_ufloats(DOSE)
    means = [mean_of(r) for r in us]
    Z = means[0] if zero == "first" else 0.0
    H = means[-1] if hundred == "last" else sum(means)
    res = []
    for row, m in zip(us, means):
        one, mean = 100 * (row[0] - Z) / (H - Z), 100 * (m - Z) / (H - Z)
        res.append({"value": mean.n, "sd": one.s, "se": mean.s})
    return res


def monte_carlo(n_sims=100000, seed=7):
    """Empirical SDs: blank minus (typed blank drawn as the mean of n_b
    wells), and normalized first-to-last."""
    rng = np.random.default_rng(seed)
    out = {}
    blank = rng.normal(BLANK["mean"], BLANK["sd"], (n_sims, BLANK["n"])).mean(axis=1)
    rows = []
    for row in SAMPLES:
        a = np.array(row)
        y = rng.normal(a.mean(), a.std(ddof=1), (n_sims, a.size))
        rows.append({"sd": float(np.std(y[:, 0] - blank, ddof=1)),
                     "se": float(np.std(y.mean(axis=1) - blank, ddof=1))})
    out["subtract_value"] = rows
    sims = [rng.normal(np.mean(r), np.std(r, ddof=1), (n_sims, len(r))) for r in DOSE]
    means = [s.mean(axis=1) for s in sims]
    Z, H = means[0], means[-1]
    out["normalize_first_last"] = [
        {"sd": float(np.std(100 * (s[:, 0] - Z) / (H - Z), ddof=1)),
         "se": float(np.std(100 * (m - Z) / (H - Z), ddof=1))} for s, m in zip(sims, means)]
    return out


def main():
    sub = lambda v, b: v - b  # noqa: E731
    div = lambda v, b: v / b  # noqa: E731
    pct = lambda v, b: 100 * (v - b) / b  # noqa: E731
    ref = {
        "data": {"samples": SAMPLES, "blank": BLANK, "blank_wells": BLANK_WELLS, "dose": DOSE},
        "subtract_value": baseline_value(sub),
        "divide_value": baseline_value(div),
        "percent_difference_value": baseline_value(pct),
        "subtract_column": baseline_column(sub),
        "subtract_first_row": baseline_first_row(),
        "normalize_first_last": normalized("first", "last"),
        "normalize_value_sum": normalized("value", "sum"),
        "monte_carlo": monte_carlo(),
    }
    with open(os.path.join(HERE, "propagation.json"), "w") as fh:
        json.dump(ref, fh, indent=1)
        fh.write("\n")


if __name__ == "__main__":
    main()
