"""Reference values for the mini-meta and delta-delta estimation results
(P-93; engine/tests/test_estimation_minimeta.py), from DABEST itself.

DABEST is not a project dependency. It was installed into a throwaway
virtual environment for this script only (Python 3.12):

    python3.12 -m venv /tmp/dabest-venv
    /tmp/dabest-venv/bin/pip install --only-binary=:all: dabest==2025.3.27
    /tmp/dabest-venv/bin/python engine/tests/reference/estimation_minimeta.py

(it writes engine/tests/reference/estimation_minimeta.json).

Data: generated here with numpy's PCG64 (seed 20261124), rounded to two
decimals, and stored in the JSON so the test reads exactly these values.
- mini_meta: three independent repeats of a control-vs-drug experiment
  (unequal n), dabest.load(idx = ((C1, D1), (C2, D2), (C3, D3)),
  mini_meta = True), mean difference, 5000 resamples, random_seed 12345.
- delta_delta: a 2 x 2 design (genotype W / M x treatment Placebo /
  Drug), dabest.load(x = ["Treatment", "Treatment"], delta2 = True,
  experiment = "Genotype"): the drug effect within each genotype, and
  the delta-delta = (M Drug - M Placebo) - (W Drug - W Placebo).

DABEST's point estimates are deterministic and pinned exactly. Its
bootstrap limits come from its own random streams, so the engine's
limits agree with them within Monte Carlo error, not digit for digit.
"""

import json
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

import dabest

warnings.filterwarnings("ignore")
rng = np.random.default_rng(20261124)


def r2(x):
    return [round(float(v), 2) for v in x]


# ---- mini-meta: three repeats, drug lowers the response by about 3
repeats = []
for i, (n_c, n_d, shift) in enumerate([(6, 6, 0.0), (8, 7, 1.5), (5, 6, -0.8)]):
    c = r2(rng.normal(10 + shift, 1.2 + 0.4 * i, n_c))
    d = r2(rng.normal(7 + shift, 1.2 + 0.4 * i, n_d))
    repeats.append({"control": c, "test": d})
cols = {}
for i, r in enumerate(repeats, 1):
    cols[f"Control {i}"] = r["control"]
    cols[f"Drug {i}"] = r["test"]
df = pd.DataFrame({k: pd.Series(v) for k, v in cols.items()})
idx = tuple((f"Control {i}", f"Drug {i}") for i in range(1, 4))
mm_obj = dabest.load(df, idx=idx, mini_meta=True, random_seed=12345, resamples=5000)
md = mm_obj.mean_diff
mm = md.mini_meta
per = md.results
mini_meta = {
    "repeats": repeats,
    "differences": [float(x) for x in per["difference"]],
    "bca_low_each": [float(x) for x in per["bca_low"]],
    "bca_high_each": [float(x) for x in per["bca_high"]],
    "group_var": [float(x) for x in mm.group_var],
    "difference": float(mm.difference),
    "bca_low": float(mm.bca_low), "bca_high": float(mm.bca_high),
    "pct_low": float(mm.pct_low), "pct_high": float(mm.pct_high),
    "pvalue_permutation": float(mm.pvalue_permutation),
}

# ---- delta-delta: 2 x 2, the drug works in W, less so in M
cells = {}
for g, t, mu, n in [("W", "Placebo", 20, 8), ("W", "Drug", 14, 8),
                    ("M", "Placebo", 19, 7), ("M", "Drug", 17, 9)]:
    cells[(g, t)] = r2(rng.normal(mu, 2.5, n))
rows = [{"Genotype": g, "Treatment": t, "Y": v}
        for (g, t), vals in cells.items() for v in vals]
long = pd.DataFrame(rows)
dd_obj = dabest.load(long, x=["Treatment", "Treatment"], y="Y", delta2=True,
                     experiment="Genotype", random_seed=12345, resamples=5000)
dmd = dd_obj.mean_diff
dd = dmd.delta_delta
res = dmd.results
delta_delta = {
    "cells": {f"{g} {t}": v for (g, t), v in cells.items()},
    "comparisons": [[str(a), str(b)] for a, b in zip(res["control"], res["test"])],
    "differences": [float(x) for x in res["difference"]],
    "difference": float(dd.difference),
    "bca_low": float(dd.bca_low), "bca_high": float(dd.bca_high),
    "pct_low": float(dd.pct_low), "pct_high": float(dd.pct_high),
}

out = Path(__file__).with_suffix(".json")
out.write_text(json.dumps({"dabest_version": dabest.__version__,
                           "mini_meta": mini_meta,
                           "delta_delta": delta_delta}, indent=1) + "\n")
