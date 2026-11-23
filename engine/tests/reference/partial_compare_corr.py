"""Reference values for P-48 (partial correlation and comparing two
correlations): engine/tests/test_partial_compare_corr.py, the e2e step and
the ui-stage fixture.

R is not installed (ppcor::pcor and cocor not available). The oracles:
- pingouin.partial_corr (Pearson and Spearman) for every pair of a
  four-variable table controlling for Age, and a hand residual-on-residual
  computation (numpy least squares, then scipy.stats.pearsonr of the
  residuals, P from t on n - 2 - k df) as a second check;
- comparing two independent correlations: Fisher's z by hand,
  z = (atanh r1 - atanh r2) / sqrt(1/(n1 - 3) + 1/(n2 - 3));
- comparing two dependent correlations on the same subjects: Steiger
  (1980, Psychol Bull 87:245) Z1* (overlapping) and Z2* (non-overlapping)
  by hand from the paper's formulas (eq. 3 for the Pearson-Filon
  covariance, with r̄ for the two compared correlations), written here
  independently of the engine; and a Monte Carlo check that the Pearson-
  Filon covariance formula (eq. 3) matches the simulated covariance of
  sample correlations, n * cov(r_jk, r_hm), for a known correlation
  matrix (200,000 samples of n = 200).

Data: 24 subjects, Age (years), systolic blood pressure SBP (mmHg), BMI
(kg/m2) and cholesterol (mmol/L), drawn with numpy seed 48 from a model in
which SBP and cholesterol both rise with age, rounded and typed into the
JSON below (the plan's acceptance test: a four-variable table, "control
for Age"). The independent comparison uses two dose-response samples
drawn with seed 4848 (n = 15 and n = 12).

Run from the repository root:
  /home/eren/opendose/.venv/bin/python engine/tests/reference/partial_compare_corr.py
"""
import itertools
import json
import math
import os

import numpy as np
import pandas as pd
import pingouin as pg
from scipy import stats


def make_table():
    rng = np.random.default_rng(48)
    n = 24
    age = rng.uniform(25, 70, n)
    bmi = 24 + 0.04 * (age - 45) + rng.normal(0, 3, n)
    sbp = 100 + 0.7 * age + 0.6 * (bmi - 24) + rng.normal(0, 8, n)
    chol = 3.5 + 0.035 * age + rng.normal(0, 0.6, n)
    return {"Age": np.round(age, 0).tolist(), "SBP": np.round(sbp, 0).tolist(),
            "BMI": np.round(bmi, 1).tolist(), "Cholesterol": np.round(chol, 1).tolist()}


def make_independent():
    rng = np.random.default_rng(4848)
    xa = np.round(rng.uniform(0, 10, 15), 1)
    ya = np.round(2 + 0.8 * xa + rng.normal(0, 1.5, 15), 1)
    xb = np.round(rng.uniform(0, 10, 12), 1)
    yb = np.round(2 + 0.3 * xb + rng.normal(0, 1.5, 12), 1)
    return {"Dose A": xa.tolist(), "Response A": ya.tolist(),
            "Dose B": xb.tolist(), "Response B": yb.tolist()}


def hand_partial(x, y, z):
    n, k = len(x), z.shape[1]
    D = np.column_stack([np.ones(n), z])
    rx = x - D @ np.linalg.lstsq(D, x, rcond=None)[0]
    ry = y - D @ np.linalg.lstsq(D, y, rcond=None)[0]
    r = stats.pearsonr(rx, ry)[0]
    df = n - 2 - k
    t = r * math.sqrt(df / (1 - r * r))
    return float(r), float(2 * stats.t.sf(abs(t), df))


def pf_cov(R, j, k, h, m):
    """Pearson-Filon n*cov(r_jk, r_hm) (Steiger 1980, eq. 3)."""
    p = R
    return 0.5 * ((p[j, h] - p[j, k] * p[k, h]) * (p[k, m] - p[k, h] * p[h, m])
                  + (p[j, m] - p[j, h] * p[h, m]) * (p[k, h] - p[j, k] * p[j, h])
                  + (p[j, h] - p[j, m] * p[h, m]) * (p[k, m] - p[j, k] * p[j, m])
                  + (p[j, m] - p[j, k] * p[k, m]) * (p[k, h] - p[k, m] * p[h, m]))


def steiger(R, n, a, b):
    """Steiger Z for r_a = R[a] against r_b = R[b] (pairs of indices), with
    both replaced by their mean in the covariance (Steiger 1980)."""
    Rb = R.copy()
    rbar = (R[a] + R[b]) / 2
    Rb[a] = Rb[a[::-1]] = rbar
    Rb[b] = Rb[b[::-1]] = rbar
    psi = pf_cov(Rb, a[0], a[1], b[0], b[1])
    c = psi / (1 - rbar ** 2) ** 2
    z = (math.atanh(R[a]) - math.atanh(R[b])) * math.sqrt(n - 3) / math.sqrt(2 - 2 * c)
    return {"r1": float(R[a]), "r2": float(R[b]), "covariance": float(c), "z": float(z),
            "p": float(2 * stats.norm.sf(abs(z)))}


def monte_carlo():
    rho = np.array([[1, .5, .3, .4], [.5, 1, .2, .35], [.3, .2, 1, .45], [.4, .35, .45, 1]])
    rng = np.random.default_rng(1980)
    n, reps = 200, 200000
    L = np.linalg.cholesky(rho)
    out = {}
    rs = np.empty((reps, 3))
    for b in range(0, reps, 10000):
        X = rng.standard_normal((10000, n, 4)) @ L.T
        X -= X.mean(axis=1, keepdims=True)
        S = np.einsum("bni,bnj->bij", X, X)
        d = np.sqrt(np.einsum("bii->bi", S))
        C = S / d[:, :, None] / d[:, None, :]
        rs[b:b + 10000] = np.column_stack([C[:, 0, 1], C[:, 0, 2], C[:, 2, 3]])
    out["overlapping_sim"] = float(n * np.cov(rs[:, 0], rs[:, 1])[0, 1])
    out["overlapping_formula"] = float(pf_cov(rho, 0, 1, 0, 2))
    out["nonoverlapping_sim"] = float(n * np.cov(rs[:, 0], rs[:, 2])[0, 1])
    out["nonoverlapping_formula"] = float(pf_cov(rho, 0, 1, 2, 3))
    return out


def main():
    tab = make_table()
    df = pd.DataFrame(tab)
    names = ["SBP", "BMI", "Cholesterol"]
    partial = {}
    for a, b in itertools.combinations(names, 2):
        res = {}
        for method in ("pearson", "spearman"):
            pc = pg.partial_corr(data=df, x=a, y=b, covar="Age", method=method)
            res[method] = {"n": int(pc["n"].iloc[0]), "r": float(pc["r"].iloc[0]),
                           "ci": [float(v) for v in pc["CI95"].iloc[0]],
                           "p": float(pc["p_val"].iloc[0]) if "p_val" in pc
                           else float(pc["p-val"].iloc[0])}
        hr, hp = hand_partial(df[a].to_numpy(), df[b].to_numpy(), df[["Age"]].to_numpy())
        res["hand_pearson"] = {"r": hr, "p": hp}
        partial[f"{a}|{b}"] = res
    # two covariates (Age and BMI) for SBP vs Cholesterol
    pc2 = pg.partial_corr(data=df, x="SBP", y="Cholesterol", covar=["Age", "BMI"])
    two = {"r": float(pc2["r"].iloc[0]), "n": int(pc2["n"].iloc[0]),
           "p": float(pc2.filter(like="p").iloc[0, 0])}
    simple = {f"{a}|{b}": float(stats.pearsonr(df[a], df[b])[0])
              for a, b in itertools.combinations(["Age"] + names, 2)}

    ind = make_independent()
    r1, _ = stats.pearsonr(ind["Dose A"], ind["Response A"])
    r2, _ = stats.pearsonr(ind["Dose B"], ind["Response B"])
    n1, n2 = len(ind["Dose A"]), len(ind["Dose B"])
    z = (math.atanh(r1) - math.atanh(r2)) / math.sqrt(1 / (n1 - 3) + 1 / (n2 - 3))
    independent = {"r1": float(r1), "n1": n1, "r2": float(r2), "n2": n2, "z": float(z),
                   "p": float(2 * stats.norm.sf(abs(z)))}

    # dependent: on the 24 subjects, r(SBP, Age) against r(SBP, BMI)
    # (overlapping, SBP in common) and r(SBP, Age) against
    # r(BMI, Cholesterol) (non-overlapping); index order SBP, Age, BMI, Chol
    order = ["SBP", "Age", "BMI", "Cholesterol"]
    R = np.corrcoef(np.array([tab[v] for v in order]))
    n = len(tab["Age"])
    dependent = {"overlapping": steiger(R, n, (0, 1), (0, 2)),
                 # Age in common: X = Age against Y = SBP and Y = BMI on an
                 # XY table (the e2e step)
                 "overlapping_age": steiger(R, n, (1, 0), (1, 2)),
                 "nonoverlapping": steiger(R, n, (0, 1), (2, 3)),
                 "order": order, "n": n}

    out = {"table": tab, "partial_control_age": partial, "partial_age_bmi_sbp_chol": two,
           "simple_r": simple, "independent_data": ind, "independent": independent,
           "dependent": dependent, "monte_carlo": monte_carlo()}
    path = os.path.join(os.path.dirname(__file__), "partial_compare_corr.json")
    with open(path, "w") as fh:
        json.dump(out, fh, indent=2)
    print(json.dumps({k: out[k] for k in ("partial_control_age", "independent", "dependent",
                                          "monte_carlo")}, indent=1))


if __name__ == "__main__":
    main()
