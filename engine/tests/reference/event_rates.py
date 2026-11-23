"""Independent reference for comparing two event rates (FEATURE-PLAN
P-47). R (poisson.test) is not installed, so:

- the exact conditional P: statsmodels 0.15
  test_poisson_2indep(method="exact-cond") (two-sided, "larger",
  "smaller");
- the rate ratio CI: the Clopper-Pearson interval of x1 out of x1 + x2
  from statsmodels proportion_confint(method="beta") (not scipy
  binomtest, which the engine uses), mapped by p / (1 - p) x T2 / T1;
- each rate's exact CI: statsmodels confint_poisson(method="exact-c")
  divided by nothing (it takes the exposure).

Also printed for comparison: the example on R's ?poisson.test help page,
poisson.test(c(11, 6 + 8 + 7), c(800, 1083 + 1050 + 878)), whose printed
output is p-value = 0.07967, rate ratio 1.971488, 95 percent CI
0.8584264 to 4.2772659 (R stats package documentation).

Run: /home/eren/opendose/.venv/bin/python engine/tests/reference/event_rates.py
writes event_rates.json next to this file.
"""

from __future__ import annotations

import json
from pathlib import Path

from statsmodels.stats.proportion import proportion_confint
from statsmodels.stats.rates import confint_poisson, test_poisson_2indep

HERE = Path(__file__).resolve().parent

CASES = {
    # the plan's acceptance test: 23 events in 10 h vs 41 events in 12 h
    "acceptance": (23, 10.0, 41, 12.0),
    # R's ?poisson.test example
    "r_help": (11, 800.0, 21, 3011.0),
    # small counts, unequal exposure (per mm2)
    "small": (2, 0.5, 9, 1.25),
}


def case(x1, t1, x2, t2):
    tests = {alt: float(test_poisson_2indep(x1, t1, x2, t2, method="exact-cond",
                                            alternative=alt).pvalue)
             for alt in ("two-sided", "larger", "smaller")}
    lo, hi = proportion_confint(x1, x1 + x2, alpha=0.05, method="beta")
    k = t2 / t1
    return {"x1": x1, "t1": t1, "x2": x2, "t2": t2,
            "p_two_tailed": tests["two-sided"], "p_greater": tests["larger"],
            "p_less": tests["smaller"],
            "rate_ratio": (x1 / t1) / (x2 / t2),
            "ratio_ci": [lo / (1 - lo) * k, hi / (1 - hi) * k],
            "rate1_ci": [float(v) for v in confint_poisson(x1, t1, method="exact-c")],
            "rate2_ci": [float(v) for v in confint_poisson(x2, t2, method="exact-c")]}


def main():
    ref = {k: case(*v) for k, v in CASES.items()}
    ref["r_help_printed"] = {"p_two_tailed": 0.07967, "rate_ratio": 1.971488,
                             "ratio_ci": [0.8584264, 4.2772659]}
    (HERE / "event_rates.json").write_text(json.dumps(ref, indent=1) + "\n")


if __name__ == "__main__":
    main()
