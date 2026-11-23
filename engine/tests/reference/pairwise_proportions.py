"""Independent reference for pairwise comparisons of rows after an r x c
test (FEATURE-PLAN P-14). R (pairwise.prop.test, rcompanion) is not
installed, so each pair's P comes from scipy 1.18 directly:

- 2 x 2 pairs: scipy.stats.fisher_exact, or scipy.stats.chi2_contingency
  with Yates' correction (correction=True, as R's prop.test default);
- 2 x 3 pairs: Fisher-Freeman-Halton by brute-force enumeration of every
  2 x 3 table with the observed margins (not the engine's network
  algorithm), or chi2_contingency (no correction applies beyond 2 x 2);
- the rule: Fisher when any expected count of the pair's table is below 5;
- adjustment: statsmodels 0.15 multipletests (holm, fdr_bh, bonferroni).

Run: /home/eren/opendose/.venv/bin/python engine/tests/reference/pairwise_proportions.py
writes pairwise_proportions.json next to this file.
"""

from __future__ import annotations

import json
from itertools import combinations
from math import comb
from pathlib import Path

import numpy as np
from scipy import stats
from statsmodels.stats.multitest import multipletests

HERE = Path(__file__).resolve().parent

# The plan's acceptance data: WT 18/20, Het 15/20, KO 5/20 positive
ACCEPTANCE = {"rows": ["WT", "Het", "KO"],
              "table": [[18, 2], [15, 5], [5, 15]]}
# Four groups, larger counts (every pair by chi-square)
FOUR = {"rows": ["A", "B", "C", "D"],
        "table": [[40, 60], [55, 45], [30, 70], [62, 38]]}
# Three rows, three outcomes, small counts (2 x 3 Fisher)
THREE_BY_THREE = {"rows": ["Low", "Mid", "High"],
                  "table": [[6, 3, 1], [3, 4, 3], [1, 2, 8]]}


def prob_2xc(row, col_tot, n_row, n):
    """Hypergeometric probability of the first row given the margins."""
    num = 1
    for x, c in zip(row, col_tot):
        num *= comb(int(c), int(x))
    return num / comb(int(n), int(n_row))


def fisher_2xc_bruteforce(t):
    t = np.asarray(t, int)
    cols = t.sum(axis=0)
    n1, n = int(t[0].sum()), int(t.sum())
    p_obs = prob_2xc(t[0], cols, n1, n)
    total = 0.0

    def rec(j, left, row):
        nonlocal total
        if j == len(cols) - 1:
            if 0 <= left <= cols[j]:
                p = prob_2xc(row + [left], cols, n1, n)
                if p <= p_obs * (1 + 1e-7):
                    total += p
            return
        for x in range(0, min(left, int(cols[j])) + 1):
            rec(j + 1, left - x, row + [x])
    rec(0, n1, [])
    return min(total, 1.0)


def pair_p(sub):
    sub = np.asarray(sub, float)
    exp = np.outer(sub.sum(1), sub.sum(0)) / sub.sum()
    if np.any(exp < 5):
        if sub.shape == (2, 2):
            return "fisher", float(stats.fisher_exact(sub.astype(int))[1])
        return "fisher", fisher_2xc_bruteforce(sub)
    return "chi_square", float(stats.chi2_contingency(
        sub, correction=sub.shape == (2, 2))[1])


def case(d):
    t = np.asarray(d["table"], float)
    pairs, tests, raw = [], [], []
    for i, j in combinations(range(len(t)), 2):
        kind, p = pair_p(t[[i, j]])
        pairs.append(f"{d['rows'][i]} vs. {d['rows'][j]}")
        tests.append(kind)
        raw.append(p)
    out = {**d, "pairs": pairs, "tests": tests, "p_raw": raw}
    for name, sm in (("holm", "holm"), ("bh", "fdr_bh"),
                     ("bonferroni", "bonferroni")):
        out[f"p_{name}"] = [float(v) for v in multipletests(raw, method=sm)[1]]
    return out


def main():
    ref = {"acceptance": case(ACCEPTANCE), "four": case(FOUR),
           "three_by_three": case(THREE_BY_THREE)}
    (HERE / "pairwise_proportions.json").write_text(json.dumps(ref, indent=1) + "\n")


if __name__ == "__main__":
    main()
