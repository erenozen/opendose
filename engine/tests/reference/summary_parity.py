"""Reference values for P-84 (summary-data parity): engine/tests/
test_summary_parity.py, the e2e step and the ui-stage fixture.

R is not installed (emmeans not available). The oracles:

1. One-way ANOVA from mean, SD and N with planned families and Holm.
   Raw data with EXACTLY the entered means, SDs and Ns (a fixed standard
   normal sample per group, centred and rescaled to the given mean and
   SD, n - 1 denominator) are analysed by statsmodels: OLS y ~ C(group)
   (anova_lm for F and P), the pooled-variance t test of each pair from
   the OLS residual mean square and df, and
   statsmodels.stats.multitest.multipletests for Holm, Holm-Sidak,
   Bonferroni and Sidak over exactly the planned family.
2. Log scale from mean and SD (approximate): the lognormal moment
   conversion sigma^2 = ln(1 + SD^2 / mean^2), mu = ln(mean) - sigma^2 / 2
   (Higgins, White & Anzures-Cabrera 2008, Stat Med 27:6072) is checked
   against scipy.stats.lognorm: a lognormal with those mu and sigma has
   exactly the entered mean and SD. The size of the approximation on a
   real sample is recorded (raw logs vs. converted moments).
3. The mixed-model RM path (missing values) with Holm and a control
   family: statsmodels MixedLM (REML, random subject intercept) gives
   the treatment means' contrasts and SEs; t on the containment df
   N - rank[X Z]; multipletests(method="holm") over the family.

Run from the repository root:
  /home/eren/opendose/.venv/bin/python engine/tests/reference/summary_parity.py
"""
import json
import math
import os
from itertools import combinations

import numpy as np
import pandas as pd
import statsmodels.formula.api as smf
from scipy import stats
from statsmodels.stats.anova import anova_lm
from statsmodels.stats.multitest import multipletests

# The acceptance test: 4 groups entered as mean, SD, N; planned
# comparisons vs. control with Holm.
GROUPS = [
    {"name": "Control", "mean": 12.0, "sd": 2.5, "n": 6},
    {"name": "Low", "mean": 14.1, "sd": 3.0, "n": 6},
    {"name": "Mid", "mean": 17.8, "sd": 3.6, "n": 5},
    {"name": "High", "mean": 22.4, "sd": 4.9, "n": 6},
]
PLANNED = [[3, 0], [2, 1]]  # High vs. Control, Mid vs. Low


def exact_moment_sample(mean, sd, n, seed):
    """n values whose mean and SD (n - 1) are exactly mean and sd."""
    z = np.random.default_rng(seed).standard_normal(n)
    z = (z - z.mean()) / z.std(ddof=1)
    return mean + sd * z


def raw_groups(groups):
    return [exact_moment_sample(g["mean"], g["sd"], g["n"], 100 + i)
            for i, g in enumerate(groups)]


def ols_oracle(groups, cols):
    df = pd.DataFrame({"y": np.concatenate(cols),
                       "g": np.concatenate([[i] * len(c)
                                            for i, c in enumerate(cols)])})
    fit = smf.ols("y ~ C(g)", data=df).fit()
    tab = anova_lm(fit)
    mse, dfe = float(fit.mse_resid), float(fit.df_resid)
    means = [float(c.mean()) for c in cols]
    ns = [len(c) for c in cols]

    def pair(i, j):
        se = math.sqrt(mse * (1 / ns[i] + 1 / ns[j]))
        t = (means[i] - means[j]) / se
        return {"pair": f"{groups[i]['name']} vs. {groups[j]['name']}",
                "difference": means[i] - means[j], "t": abs(t),
                "p_unadjusted": float(2 * stats.t.sf(abs(t), dfe))}

    def family(pairs, method):
        rows = [pair(i, j) for i, j in pairs]
        adj = multipletests([r["p_unadjusted"] for r in rows],
                            method=method)[1]
        for r, a in zip(rows, adj):
            r["p_adjusted"] = float(a)
        return rows

    control = [(i, 0) for i in range(1, len(cols))]
    return {
        "F": float(tab["F"].iloc[0]), "p": float(tab["PR(>F)"].iloc[0]),
        "df_between": int(tab["df"].iloc[0]), "df_within": int(dfe),
        "ms_within": mse,
        "holm_vs_control": family(control, "holm"),
        "holm_sidak_vs_control": family(control, "holm-sidak"),
        "bonferroni_planned": family(PLANNED, "bonferroni"),
        "sidak_planned": family(PLANNED, "sidak"),
        "holm_all": family(list(combinations(range(len(cols)), 2)), "holm"),
    }


# ------------------------------------------------------------- log scale

LOG_GROUPS = [
    {"name": "Vehicle", "mean": 3.2, "sd": 1.1, "n": 8},
    {"name": "Dose 1", "mean": 6.9, "sd": 2.6, "n": 8},
    {"name": "Dose 2", "mean": 15.4, "sd": 6.8, "n": 7},
]


def lognormal_moments(mean, sd):
    s2 = math.log1p((sd / mean) ** 2)
    return math.log(mean) - s2 / 2, math.sqrt(s2)


def lognorm_check(groups):
    out = []
    for g in groups:
        mu, sigma = lognormal_moments(g["mean"], g["sd"])
        d = stats.lognorm(s=sigma, scale=math.exp(mu))
        out.append({"name": g["name"], "mu_ln": mu, "sigma_ln": sigma,
                    "mu_log10": mu / math.log(10),
                    "sigma_log10": sigma / math.log(10),
                    "scipy_mean": float(d.mean()),
                    "scipy_sd": float(d.std())})
    return out


def approximation_study():
    """A lognormal sample: raw logs vs. converted moments (how far apart
    the two log-scale routes are on real data)."""
    rng = np.random.default_rng(7)
    cols = [rng.lognormal(math.log(m), 0.45, 10) for m in (3.0, 6.0, 12.0)]
    raw = [(float(np.log10(c).mean()), float(np.log10(c).std(ddof=1)))
           for c in cols]
    conv = [tuple(v / math.log(10) for v in
                  lognormal_moments(float(c.mean()), float(c.std(ddof=1))))
            for c in cols]
    return {"values": [[float(v) for v in c] for c in cols],
            "raw_log10_mean_sd": raw, "converted_log10_mean_sd": conv}


# ------------------------------------------------------- mixed RM (Holm)

MIXED = {  # rows = subjects, columns = treatments; None = missing
    "names": ["Baseline", "Week 1", "Week 2", "Week 4"],
    "rows": [[7.2, 8.1, 9.0, 9.8], [6.8, 7.0, 8.4, 9.1],
             [7.9, None, 9.6, 10.4], [6.5, 7.3, 7.9, None],
             [7.0, 7.9, 8.8, 9.9], [7.6, 8.5, None, 10.2],
             [6.9, 7.4, 8.1, 8.8]],
}


def mixed_oracle(spec):
    long = [{"s": s, "t": t, "y": v} for s, row in enumerate(spec["rows"])
            for t, v in enumerate(row) if v is not None]
    df = pd.DataFrame(long)
    k = len(spec["names"])
    fit = smf.mixedlm("y ~ C(t)", df, groups=df["s"]).fit(reml=True)
    fe = fit.fe_params.values
    # GLS covariance of the fixed effects at the REML variance components,
    # (X' V^-1 X)^-1 with V = s2_subject Z Z' + s2 I (MixedLM's own
    # cov_params comes from the joint Hessian and differs by ~5e-4)
    X = np.column_stack([np.ones(len(df))] + [(df["t"] == i).astype(float)
                                               for i in range(1, k)])
    Z = np.column_stack([(df["s"] == s).astype(float)
                         for s in sorted(df["s"].unique())])
    V = float(fit.cov_re.iloc[0, 0]) * Z @ Z.T + fit.scale * np.eye(len(df))
    cov = np.linalg.inv(X.T @ np.linalg.solve(V, X))
    # the containment df: N - rank[X Z] (X: intercept + k-1; Z: subjects)
    n_subj = df["s"].nunique()
    dfc = len(df) - (k - 1 + n_subj)
    rows = []
    for i in range(1, k):  # each week vs. Baseline (treatment coding)
        c = np.zeros(k)
        c[i] = 1.0
        diff = float(c @ fe)
        se = float(math.sqrt(c @ cov @ c))
        t = diff / se
        rows.append({"pair": f"{spec['names'][i]} vs. {spec['names'][0]}",
                     "difference": diff, "se": se,
                     "p_unadjusted": float(2 * stats.t.sf(abs(t), dfc))})
    adj = multipletests([r["p_unadjusted"] for r in rows], method="holm")[1]
    for r, a in zip(rows, adj):
        r["p_adjusted"] = float(a)
    return {"df": dfc, "holm_vs_baseline": rows}


def main():
    cols = raw_groups(GROUPS)
    out = {
        "groups": GROUPS, "planned_pairs": PLANNED,
        "raw": [[float(v) for v in c] for c in cols],
        "ols": ols_oracle(GROUPS, cols),
        "log_groups": LOG_GROUPS,
        "lognorm": lognorm_check(LOG_GROUPS),
        "approximation": approximation_study(),
        "mixed": {**MIXED, **mixed_oracle(MIXED)},
    }
    path = os.path.join(os.path.dirname(__file__), "summary_parity.json")
    with open(path, "w") as f:
        json.dump(out, f, indent=1)
    o = out["ols"]
    print(f"F = {o['F']:.6g}, P = {o['p']:.6g}")
    for r in o["holm_vs_control"]:
        print(r["pair"], f"P = {r['p_unadjusted']:.6g}",
              f"Holm P = {r['p_adjusted']:.6g}")
    for r in out["mixed"]["holm_vs_baseline"]:
        print("mixed", r["pair"], f"diff = {r['difference']:.6g}",
              f"Holm P = {r['p_adjusted']:.6g}")


if __name__ == "__main__":
    main()
