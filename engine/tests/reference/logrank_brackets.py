"""Independent reference for log-rank brackets on a Kaplan-Meier graph
(FEATURE-PLAN P-111): three groups of 10, every pair compared by its own
two-group log-rank test, P adjusted by Holm's step-down method. R is not
installed (the plan's survival::survdiff); the oracle is written out here
with numpy and scipy: at each distinct event time of the two groups,
E_g += d * n_g / n; the Peto (Prism) statistic sum_g (O_g - E_g)^2 / E_g
on 1 df, which is the engine's default; and, as a cross-check of the
data, statsmodels' survdiff (the variance form, R's survdiff). Holm
(1979): the i-th smallest of m P values times (m - i + 1), made monotone.

Run: /home/eren/opendose/.venv/bin/python engine/tests/reference/logrank_brackets.py
writes logrank_brackets.json next to this file.
"""

from __future__ import annotations

import json
from itertools import combinations
from pathlib import Path

import numpy as np
from scipy import stats
from statsmodels.duration.survfunc import survdiff

HERE = Path(__file__).resolve().parent

GROUPS = {
    "Control": {"time": [5, 8, 12, 15, 20, 24, 30, 35, 40, 45], "event": [1, 1, 1, 0, 1, 1, 0, 1, 0, 0]},
    "Low dose": {"time": [3, 6, 9, 11, 14, 17, 19, 22, 26, 28], "event": [1, 1, 1, 1, 0, 1, 1, 1, 1, 0]},
    "High dose": {"time": [2, 3, 4, 6, 7, 8, 10, 11, 13, 16], "event": [1, 1, 1, 1, 1, 1, 1, 0, 1, 1]},
}


def peto(a, b):
    t = np.array(a["time"] + b["time"], float)
    e = np.array(a["event"] + b["event"], int)
    g = np.array([0] * len(a["time"]) + [1] * len(b["time"]))
    obs, exp = np.zeros(2), np.zeros(2)
    for u in np.unique(t[e == 1]):
        at = t >= u
        n = at.sum()
        d = ((t == u) & (e == 1)).sum()
        for k in (0, 1):
            exp[k] += d * (at & (g == k)).sum() / n
            obs[k] += ((t == u) & (e == 1) & (g == k)).sum()
    chi2 = float(((obs - exp) ** 2 / exp).sum())
    return chi2, float(stats.chi2.sf(chi2, 1))


def holm(ps):
    m = len(ps)
    order = np.argsort(ps)
    adj = np.empty(m)
    running = 0.0
    for i, k in enumerate(order):
        running = max(running, min(1.0, (m - i) * ps[k]))
        adj[k] = running
    return adj.tolist()


def main():
    pairs = list(combinations(GROUPS, 2))
    rows = []
    for a, b in pairs:
        chi2, p = peto(GROUPS[a], GROUPS[b])
        ga, gb = GROUPS[a], GROUPS[b]
        var = survdiff(np.array(ga["time"] + gb["time"], float),
                       np.array(ga["event"] + gb["event"]),
                       np.array([0] * 10 + [1] * 10))
        rows.append({"a": a, "b": b, "chi2_peto": chi2, "p_peto": p,
                     "chi2_variance": float(var[0]), "p_variance": float(var[1])})
    adj = holm([r["p_peto"] for r in rows])
    for r, q in zip(rows, adj):
        r["p_holm"] = q
    ref = {"groups": GROUPS, "comparisons": rows}
    (HERE / "logrank_brackets.json").write_text(json.dumps(ref, indent=1) + "\n")
    print(json.dumps(rows, indent=1))


if __name__ == "__main__":
    main()
