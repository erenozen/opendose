"""Reference values for P-45 (Cochran's Q with pairwise McNemar tests):
engine/tests/test_cochran_q.py, the e2e step and the ui-stage fixture.

R is not installed (DescTools::CochranQTest not available). The oracles:
- statsmodels.stats.contingency_tables.cochrans_q (Q, df, P);
- pingouin.cochran on the same data, and on pingouin's "cochran" dataset
  (20 subjects, energetic yes/no on three days: Q = 6.7059, P = 0.0350);
- statsmodels.stats.contingency_tables.mcnemar(exact=True) for each pair
  of conditions (the exact binomial P of the discordant pairs);
- statsmodels.stats.multitest.multipletests(method="holm") over the three
  pairs.

Data: 12 subjects scored 0/1 (stained / not stained) under three stains,
typed for this test (the plan's acceptance test).

Run from the repository root:
  /home/eren/opendose/.venv/bin/python engine/tests/reference/cochran_q.py
"""
import json
import os
from itertools import combinations

import numpy as np
import pandas as pd
import pingouin as pg
from statsmodels.stats.contingency_tables import cochrans_q, mcnemar
from statsmodels.stats.multitest import multipletests

STAINS = ["Stain A", "Stain B", "Stain C"]
DATA = [  # rows = subjects
    [1, 1, 0], [1, 0, 0], [1, 1, 1], [0, 0, 0], [1, 1, 0], [1, 0, 0],
    [1, 1, 0], [1, 1, 1], [0, 1, 0], [1, 0, 0], [1, 1, 0], [1, 1, 0],
]


def analyse(data, names):
    X = np.array(data)
    q = cochrans_q(X)
    long = pd.DataFrame([{"s": i, "c": names[j], "y": int(X[i, j])}
                         for i in range(len(X)) for j in range(len(names))])
    pgq = pg.cochran(long, dv="y", within="c", subject="s")
    pairs, praw = [], []
    for i, j in combinations(range(len(names)), 2):
        t = np.array([[np.sum((X[:, i] == 1) & (X[:, j] == 1)),
                       np.sum((X[:, i] == 1) & (X[:, j] == 0))],
                      [np.sum((X[:, i] == 0) & (X[:, j] == 1)),
                       np.sum((X[:, i] == 0) & (X[:, j] == 0))]])
        r = mcnemar(t, exact=True)
        pairs.append({"pair": f"{names[i]} vs. {names[j]}",
                      "discordant": [int(t[0, 1]), int(t[1, 0])],
                      "p_unadjusted": float(r.pvalue)})
        praw.append(float(r.pvalue))
    adj = multipletests(praw, method="holm")[1]
    for p, a in zip(pairs, adj):
        p["p_adjusted"] = float(a)
    return {"data": [list(map(int, r)) for r in X], "names": names,
            "Q": float(q.statistic), "df": int(q.df), "p": float(q.pvalue),
            "Q_pingouin": float(pgq["Q"].iloc[0]),
            "p_pingouin": float(pgq["p_unc"].iloc[0]), "pairs": pairs}


def main():
    ref = {"stains": analyse(DATA, STAINS)}
    d = pg.read_dataset("cochran")
    days = list(dict.fromkeys(d.Time))
    wide = d.pivot(index="Subject", columns="Time", values="Energetic")[days]
    ref["pingouin_cochran"] = analyse(wide.to_numpy().tolist(), days)
    path = os.path.join(os.path.dirname(__file__), "cochran_q.json")
    with open(path, "w") as fh:
        json.dump(ref, fh, indent=1)
    for k, v in ref.items():
        print(k, v["Q"], v["df"], v["p"], v["Q_pingouin"], v["p_pingouin"])
        for p in v["pairs"]:
            print("  ", p)


if __name__ == "__main__":
    main()
