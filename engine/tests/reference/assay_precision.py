"""Reference values for P-94 (assay precision and recovery):
engine/tests/test_precision.py, the e2e step and the ui-stage fixture.

R is not installed (VCA::anovaVCA / VCAinference not available). The
oracles:

1. Published: the VCA package's own unit tests (VCA 1.5.1,
   tests/runit/UnitTests/runit.anovaVCA.R TF002 / TF003 and
   runit.VCAinference.R TF001), whose reference values were obtained
   with SAS 9.2 PROC NESTED / VARCOMP / MIXED, on dataEP05A2_1 (CLSI
   EP05-A2 20 days x 2 runs x 2 replicates, simulated; the data set
   ships with VCA and is in engine/tests/fixtures/vca_dataEP05A2_1.csv,
   read from the package's data/dataEP05A2_1.RData):
   - balanced: variance components total 3.298986, day 0.001096, run
     1.344492, error 1.953397; 95% CIs (constrained at 0) total 2.4156
     to 4.7767, day 0 to 1.0322, run 0 to 2.8455, error 1.3167 to 3.1980;
   - unbalanced (rows 11, 12, 17, 37, 45, 56, 57, 68 removed): total
     3.272031, day 0.278178, run 0.875624, error 2.118229.
2. statsmodels: Type I sums of squares of the nested model from
   ols("y ~ C(day) + C(day):C(run)") + anova_lm, turned into variance
   components and CIs by hand below (EP05-A3 formulas), and MixedLM
   REML on the balanced design (equal to the ANOVA estimators when none
   is negative).
3. Recovery and the repeatability coefficient by hand (ICH M10 section
   3.2.5; Bland & Altman 1996, BMJ 313:744: 1.96 sqrt(2) s_w).

Run from the repository root:
  /home/eren/opendose/.venv/bin/python engine/tests/reference/assay_precision.py
"""
import json
import os
import warnings

import numpy as np
import pandas as pd
import statsmodels.formula.api as smf
from scipy import stats
from statsmodels.stats.anova import anova_lm

warnings.simplefilter("ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
FIX = os.path.join(HERE, "..", "fixtures")

PUBLISHED = {
    "balanced": {"total": 3.298986, "day": 0.001096, "run": 1.344492, "error": 1.953397,
                 "ci_total": [2.4156, 4.7767], "ci_day": [0.0, 1.0322],
                 "ci_run": [0.0, 2.8455], "ci_error": [1.3167, 3.1980]},
    "unbalanced": {"removed_rows_1based": [11, 12, 17, 37, 45, 56, 57, 68],
                   "total": 3.272031, "day": 0.278178, "run": 0.875624, "error": 2.118229},
}


def by_hand(d):
    """EP05-A3 balanced formulas from statsmodels' Type I mean squares."""
    a = anova_lm(smf.ols("y ~ C(day) + C(day):C(run)", d).fit())
    ms_day, ms_run, ms_e = a["mean_sq"].iloc[0], a["mean_sq"].iloc[1], a["mean_sq"].iloc[2]
    df_day, df_run, df_e = a["df"].iloc[0], a["df"].iloc[1], a["df"].iloc[2]
    n_rep = len(d) / d.groupby(["day", "run"]).ngroups
    n_run = d.groupby("day")["run"].nunique().iloc[0]
    v_e = ms_e
    v_run = (ms_run - ms_e) / n_rep
    v_day = (ms_day - ms_run) / (n_rep * n_run)
    total = v_e + max(v_run, 0) + max(v_day, 0)
    # Satterthwaite df of total = c_e MS_e + c_run MS_run + c_day MS_day
    c = np.array([1 - 1 / n_rep, 1 / n_rep - 1 / (n_rep * n_run), 1 / (n_rep * n_run)])
    ms = np.array([ms_e, ms_run, ms_day])
    dfs = np.array([df_e, df_run, df_day])
    df_tot = (c @ ms) ** 2 / np.sum((c * ms) ** 2 / dfs)
    ci_tot = [df_tot * total / stats.chi2.ppf(0.975, df_tot), df_tot * total / stats.chi2.ppf(0.025, df_tot)]
    ci_e = [df_e * v_e / stats.chi2.ppf(0.975, df_e), df_e * v_e / stats.chi2.ppf(0.025, df_e)]
    mean = d["y"].mean()
    return {"ms": {"day": ms_day, "run": ms_run, "error": ms_e},
            "variance": {"total": total, "day": v_day, "run": v_run, "error": v_e},
            "cv_percent": {"total": 100 * np.sqrt(total) / mean, "error": 100 * np.sqrt(v_e) / mean},
            "df_total": df_tot, "ci_total": ci_tot, "ci_error": ci_e, "mean": mean,
            "repeatability_coefficient": 1.959963984540054 * np.sqrt(2) * np.sqrt(v_e)}


def two_level(d):
    """Runs only (day x run combined into 40 runs): one-way random model,
    ANOVA estimator = REML for balanced data (statsmodels MixedLM)."""
    d = d.assign(runid=d["day"].astype(str) + "/" + d["run"].astype(str))
    m = smf.mixedlm("y ~ 1", d, groups="runid").fit(reml=True)
    a = anova_lm(smf.ols("y ~ C(runid)", d).fit())
    ms_b, ms_e = a["mean_sq"].iloc[0], a["mean_sq"].iloc[1]
    return {"run_variance_reml": float(m.cov_re.iloc[0, 0]), "error_variance_reml": float(m.scale),
            "run_variance_anova": float((ms_b - ms_e) / 2), "error_variance_anova": float(ms_e)}


def recovery_example():
    """A QC at 50 (nominal) in 4 runs of 5 replicates, typed for this test."""
    rng = np.random.default_rng(94)
    rows = []
    for r in range(4):
        shift = rng.normal(0, 1.5)
        for _ in range(5):
            rows.append({"run": f"Run {r + 1}", "y": round(float(52 + shift + rng.normal(0, 1.2)), 3)})
    d = pd.DataFrame(rows)
    runs = d.groupby("run")["y"].mean()
    rec = 100 * d["y"].mean() / 50
    se = runs.std(ddof=1) / np.sqrt(len(runs))
    t = stats.t.ppf(0.975, len(runs) - 1)
    a = anova_lm(smf.ols("y ~ C(run)", d).fit())
    ms_b, ms_e = a["mean_sq"].iloc[0], a["mean_sq"].iloc[1]
    v_run = max((ms_b - ms_e) / 5, 0)
    mean = d["y"].mean()
    return {"records": d.to_dict("records"), "nominal": 50.0, "recovery_percent": rec,
            "recovery_ci": [100 * (runs.mean() - t * se) / 50, 100 * (runs.mean() + t * se) / 50],
            "cv_within": 100 * np.sqrt(ms_e) / mean, "cv_total": 100 * np.sqrt(ms_e + v_run) / mean,
            "run_variance": (ms_b - ms_e) / 5, "error_variance": ms_e}


def elisa_runs():
    """An ELISA validation in the standard-curve module's layout: 4 plates
    (2 days x 2 runs), 8 standards in duplicate and a blank per plate, QC
    low / mid / high in triplicate with their nominal concentrations.
    Each plate's 4PL fit and the back-calculated QC concentrations come
    from the engine's standard curve (opendose.assay_stdcurve, validated
    on its own); the precision of those concentrations is computed here by
    hand from statsmodels' Type I mean squares (EP05-A3 formulas)."""
    import sys
    sys.path.insert(0, os.path.join(HERE, "..", ".."))
    from opendose import api
    rng = np.random.default_rng(941)
    stds = [1000, 500, 250, 125, 62.5, 31.25, 15.63, 7.81]
    qcs = {"QC low": 25.0, "QC mid": 150.0, "QC high": 400.0}

    def sig(c, top, ec50):
        return 0.06 + (top - 0.06) / (1 + (ec50 / c) ** 1.1) if c > 0 else 0.06

    rows = []
    for day in ("Day 1", "Day 2"):
        dshift = rng.normal(0, 0.04)
        for run in (1, 2):
            plate = f"{day[-1]}{'AB'[run - 1]}"
            top, ec50 = 2.6 * (1 + dshift + rng.normal(0, 0.03)), 180 * (1 + rng.normal(0, 0.05))
            for c in stds:
                s = [round(sig(c, top, ec50) * (1 + rng.normal(0, 0.012)), 4) for _ in range(2)]
                rows.append(["Standard", f"Std {c}", "", str(c), "", str(s[0]), str(s[1]), "", plate, day])
            rows.append(["Blank", "Blank", "", "0", "", "0.06", "0.061", "", plate, day])
            for nm, c in qcs.items():
                s = [round(sig(c, top, ec50) * (1 + rng.normal(0, 0.025)), 4) for _ in range(3)]
                rows.append(["QC", nm, "", str(c), "1", *map(str, s), plate, day])
    cols = ["Type", "Name", "Group", "Concentration", "Dilution", "Signal 1", "Signal 2", "Signal 3", "Plate", "Day"]
    # per plate, as the web module builds the payload (stdcurve/model.ts)
    conc = []
    for plate in dict.fromkeys(r[8] for r in rows):
        mine = [r for r in rows if r[8] == plate]
        standards = [{"concentration": float(r[3]), "signals": [float(r[5]), float(r[6])]}
                     for r in mine if r[0] == "Standard"]
        blanks = [float(v) for r in mine if r[0] == "Blank" for v in (r[5], r[6])]
        standards.insert(0, {"concentration": 0.0, "signals": blanks})
        unknowns = [{"name": r[1], "signals": [float(v) for v in r[5:8]], "dilution": 1.0}
                    for r in mine if r[0] == "QC"]
        res = api.analyze({"analysis": "stdcurve_qc", "data": {"standards": standards, "unknowns": unknowns},
                           "options": {"model": "4pl", "weighting": "none", "blank": "zero_standard"}})
        for u, r in zip(res["unknowns"], [r for r in mine if r[0] == "QC"]):
            assert u["status"] == "ok", u
            for v in u["corrected_replicates"]:
                conc.append({"sample": r[1], "plate": plate, "day": r[9], "y": v})
    d = pd.DataFrame(conc)
    out = {"columns": cols, "rows": rows, "samples": {}, "concentrations": conc}
    for nm, nominal in qcs.items():
        s = d[d["sample"] == nm].rename(columns={"plate": "run"})
        s = s.assign(run=s["run"].str[-1])
        h = by_hand(s)
        out["samples"][nm] = {
            "nominal": nominal, "mean": h["mean"],
            "cv_repeatability": h["cv_percent"]["error"], "cv_total": h["cv_percent"]["total"],
            "cv_between_run": 100 * np.sqrt(max(h["variance"]["run"], 0)) / h["mean"],
            "cv_between_day": 100 * np.sqrt(max(h["variance"]["day"], 0)) / h["mean"],
            "recovery_percent": 100 * h["mean"] / nominal,
            "run_negative": bool(h["variance"]["run"] < 0), "day_negative": bool(h["variance"]["day"] < 0)}
    return out


if __name__ == "__main__":
    d = pd.read_csv(os.path.join(FIX, "vca_dataEP05A2_1.csv"))
    out = {"published_vca": PUBLISHED, "by_hand": by_hand(d), "two_level": two_level(d),
           "recovery": recovery_example(), "elisa": elisa_runs()}
    with open(os.path.join(HERE, "assay_precision.json"), "w") as fh:
        json.dump(out, fh, indent=1, default=float)
    print(json.dumps({k: v for k, v in out.items() if k not in ("recovery", "elisa")}, indent=1, default=float))
    print(json.dumps(out["elisa"]["samples"], indent=1, default=float))
    print(json.dumps({k: v for k, v in out["recovery"].items() if k != "records"}, indent=1, default=float))
