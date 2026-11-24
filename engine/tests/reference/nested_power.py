"""Independent reference values for nested-design power (FEATURE-PLAN
P-96, opendose.nested_power).

R (simr) is not installed here. The checks, sharing no code with the
engine:

- the design-effect hand check (Aarts et al. 2014, Nat Neurosci 17:491;
  Kish 1965): for ICC 0.3 and 10 cells per animal the design effect is
  1 + 9 x 0.3 = 3.7, and by the normal approximation the animals per
  group are n_cells (1 + (m - 1) ICC) / m with n_cells = 2 (z_a + z_b)^2
  sigma_t^2 / delta^2 (written out here with scipy.stats.norm only);
- a plain-Python Monte Carlo of the planned experiments: every cell
  drawn one by one with random.gauss (the standard library, not numpy),
  animal means averaged by hand, then scipy.stats.ttest_ind /
  mannwhitneyu on the animal means; and for Dunnett's test
  scipy.stats.dunnett (scipy's own multivariate-t critical values) on
  the animal means. (That the nested t test equals the t test on the
  animal means for balanced data is checked in the test itself, against
  the app's nested_ttest.)

Run: /home/eren/opendose/.venv/bin/python engine/tests/reference/nested_power.py
writes nested_power.json next to this file (a few minutes).
"""

from __future__ import annotations

import json
import math
import random
from pathlib import Path

import numpy as np
from scipy import stats

HERE = Path(__file__).resolve().parent
OUT: dict = {}


def animal_means(rnd, n, m, mu, sb, sw):
    out = []
    for _ in range(n):
        a = rnd.gauss(mu, sb)
        out.append(sum(rnd.gauss(a, sw) for _ in range(m)) / m)
    return out


def mc(test, n, m, delta, sb, sw, reps, seed, k=2, alpha=0.05):
    rnd = random.Random(seed)
    hits = 0
    for _ in range(reps):
        groups = [animal_means(rnd, n, m, 0.0 if g == 0 else delta, sb, sw)
                  for g in range(k)]
        if test == "t":
            p = stats.ttest_ind(groups[1], groups[0]).pvalue
            hits += p < alpha
        elif test == "mann_whitney":
            p = stats.mannwhitneyu(groups[1], groups[0], method="exact"
                                   ).pvalue
            hits += p <= alpha
        else:
            res = stats.dunnett(*groups[1:], control=groups[0],
                                random_state=np.random.default_rng(1))
            hits += int(np.sum(res.pvalue < alpha))
    return hits / (reps * (k - 1) if test == "dunnett" else reps)


def main():
    icc, m, delta, st = 0.3, 10, 0.5, 1.0
    de = 1 + (m - 1) * icc
    z = stats.norm.isf(0.025) + stats.norm.ppf(0.8)
    n_cells = 2 * z ** 2 * st ** 2 / delta ** 2
    OUT["design_effect_hand_check"] = {
        "icc": icc, "m": m, "delta": delta, "sd_total": st, "power": 0.8,
        "design_effect": de, "n_cells_normal": n_cells,
        "n_animals_normal": n_cells * de / m,
        "var_unit_mean": st ** 2 * (icc + (1 - icc) / m),
    }
    sb, sw = st * math.sqrt(icc), st * math.sqrt(1 - icc)
    OUT["mc"] = {
        "t_n25": {"n": 25, "m": 10, "delta": 0.5, "sb": sb, "sw": sw,
                  "reps": 6000, "power": mc("t", 25, 10, 0.5, sb, sw,
                                            6000, 11)},
        "mw_n8_d1": {"n": 8, "m": 10, "delta": 1.0, "sb": sb, "sw": sw,
                     "reps": 6000, "power": mc("mann_whitney", 8, 10, 1.0,
                                               sb, sw, 6000, 12)},
        "dunnett_k4_n12_d1": {"n": 12, "m": 10, "delta": 1.0, "sb": sb,
                              "sw": sw, "k": 4, "reps": 1500,
                              "power": mc("dunnett", 12, 10, 1.0, sb, sw,
                                          1500, 13, k=4)},
    }
    (HERE / "nested_power.json").write_text(json.dumps(OUT, indent=1))
    print(json.dumps(OUT, indent=1))


if __name__ == "__main__":
    main()
