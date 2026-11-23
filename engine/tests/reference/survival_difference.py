"""Reference values for P-28 (difference in survival at a chosen time):
engine/tests/test_survival_difference.py, the e2e step and the ui-stage
fixture.

R is not installed (summary(survfit(...), times = 365) not available) and
lifelines is not installed. The oracles:
- Kaplan-Meier S(t) and the Greenwood SE written out here in numpy (the
  product-limit loop over distinct times, Greenwood sum d / (n (n - d))),
  independent of the engine's code;
- statsmodels.duration.survfunc.SurvfuncRight (surv_prob, surv_prob_se)
  as a second oracle for S(t) and its SE;
- the difference S_female - S_male, its SE sqrt(se_f^2 + se_m^2) and the
  linear 95% CI by hand;
- the complementary log-log test of Klein, Logan, Harhoff & Andersen
  (2007) Stat Med 26:4505, by hand:
  X2 = [ln(-ln S1) - ln(-ln S2)]^2 / [v1 / (ln S1)^2 + v2 / (ln S2)^2],
  v = the Greenwood sum (the variance of ln S), chi-square on 1 df.

Data: the NCCTG advanced lung cancer trial, R survival::lung (Loprinzi
et al. 1994, J Clin Oncol 12:601), 228 patients, time in days, status
(1 censored, 2 dead), sex (1 male, 2 female); the copy in
docs/validation/datasets/surv-lung.csv (from Rdatasets, survival/cancer).
The chosen time: 365 days.

Run from the repository root:
  /home/eren/opendose/.venv/bin/python engine/tests/reference/survival_difference.py
"""
import csv
import json
import math
import os

import numpy as np
from scipy import stats
from statsmodels.duration.survfunc import SurvfuncRight

HERE = os.path.dirname(__file__)
CSV = os.path.join(HERE, "..", "..", "..", "docs", "validation", "datasets",
                   "surv-lung.csv")
T = 365.0


def km_at(times, events, t):
    times, events = np.asarray(times, float), np.asarray(events, int)
    s, gw = 1.0, 0.0
    for u in np.unique(times):
        if u > t:
            break
        n = np.sum(times >= u)
        d = np.sum((times == u) & (events == 1))
        if d:
            s *= (n - d) / n
            if n > d:
                gw += d / (n * (n - d))
    return s, gw, int(np.sum(times >= t))


def main():
    rows = list(csv.DictReader(open(CSV)))
    groups = {}
    for r in rows:
        groups.setdefault(r["sex"], ([], []))
        groups[r["sex"]][0].append(float(r["time_days"]))
        groups[r["sex"]][1].append(int(r["event"]))
    out = {"time": T, "groups": {}}
    for sex, name in (("1", "Male"), ("2", "Female")):
        tt, ee = groups[sex]
        s, gw, at_risk = km_at(tt, ee, T)
        sf = SurvfuncRight(np.array(tt), np.array(ee))
        k = np.searchsorted(sf.surv_times, T, side="right") - 1
        out["groups"][name] = {"n": len(tt), "times": tt, "events": ee,
                               "survival": s, "se": s * math.sqrt(gw),
                               "greenwood": gw, "at_risk": at_risk,
                               "statsmodels_survival": float(sf.surv_prob[k]),
                               "statsmodels_se": float(sf.surv_prob_se[k])}
    m, f = out["groups"]["Male"], out["groups"]["Female"]
    diff = f["survival"] - m["survival"]
    se = math.sqrt(f["se"] ** 2 + m["se"] ** 2)
    z = stats.norm.ppf(0.975)
    num = (math.log(-math.log(f["survival"])) - math.log(-math.log(m["survival"]))) ** 2
    den = f["greenwood"] / math.log(f["survival"]) ** 2 + m["greenwood"] / math.log(m["survival"]) ** 2
    chi2 = num / den
    out["difference"] = {"group": "Female", "reference": "Male", "difference": diff, "se": se,
                         "ci": [diff - z * se, diff + z * se], "chi2": chi2,
                         "p": float(stats.chi2.sf(chi2, 1)),
                         "p_linear": float(2 * stats.norm.sf(abs(diff / se)))}
    with open(os.path.join(HERE, "survival_difference.json"), "w") as fh:
        json.dump(out, fh, indent=1)
    print(json.dumps({"male": {k: m[k] for k in ("survival", "se", "statsmodels_survival",
                                                 "statsmodels_se", "at_risk")},
                      "female": {k: f[k] for k in ("survival", "se", "statsmodels_survival",
                                                   "statsmodels_se", "at_risk")},
                      "difference": out["difference"]}, indent=1))


if __name__ == "__main__":
    main()
