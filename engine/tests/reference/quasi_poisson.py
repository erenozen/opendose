"""Reference values for P-46 (quasi-Poisson standard errors):
engine/tests/test_poisson_regression.py, the e2e step and the ui-stage
fixture.

R is not installed (glm(family = quasipoisson) not available). The
oracle is statsmodels GLM(family=Poisson(), scale="X2") fitted with
use_t=True: the dispersion phi = Pearson chi2 / df_resid, SEs times
sqrt(phi), t statistics and P values on df_resid, and Wald CIs from t.
The overall F test is computed by hand from statsmodels' deviances:
F = (null deviance - deviance) / (k - 1) / phi on (k - 1, n - k) df.

Data: Ames Salmonella TA98 revertant colonies per plate at six doses of
quinoline (0 to 1000 ug per plate, three plates each), Margolin, Kaplan &
Zeiger (1981) PNAS 78:3779, the overdispersed example of Breslow (1984)
Appl Stat 33:38 (model log mu = b0 + b1 log(dose + 10) + b2 dose; its
Pearson chi2 46.3 on 15 df, which this script reproduces).

Run from the repository root:
  /home/eren/opendose/.venv/bin/python engine/tests/reference/quasi_poisson.py
"""
import json
import math
import os

import numpy as np
import statsmodels.api as sm
from scipy import stats

DOSE = [0, 0, 0, 10, 10, 10, 33, 33, 33, 100, 100, 100,
        333, 333, 333, 1000, 1000, 1000]
REVERTANTS = [15, 21, 29, 16, 18, 21, 16, 26, 33, 27, 41, 60,
              33, 38, 41, 20, 27, 42]


def main():
    x = np.array(DOSE, float)
    y = np.array(REVERTANTS, float)
    logd = np.log(x + 10)
    X = sm.add_constant(np.column_stack([logd, x]))
    pois = sm.GLM(y, X, family=sm.families.Poisson()).fit()
    quasi = sm.GLM(y, X, family=sm.families.Poisson()).fit(scale="X2",
                                                           use_t=True)
    n, k = X.shape
    phi = float(quasi.scale)
    f_stat = (pois.null_deviance - pois.deviance) / (k - 1) / phi
    ci = quasi.conf_int(alpha=0.05)
    out = {
        "data": {"dose": DOSE, "log_dose_plus_10": logd.tolist(),
                 "revertants": REVERTANTS},
        "n": n, "k": k, "df_resid": float(quasi.df_resid),
        "pearson_chi2": float(pois.pearson_chi2),
        "phi": phi,
        "estimates": quasi.params.tolist(),
        "poisson_se": pois.bse.tolist(),
        "quasi_se": quasi.bse.tolist(),
        "quasi_t": np.abs(quasi.tvalues).tolist(),
        "quasi_p": quasi.pvalues.tolist(),
        "quasi_ci": ci.tolist(),
        "quasi_rate_ratio_ci": np.exp(ci).tolist(),
        "f_test": {"F": float(f_stat), "df1": k - 1, "df2": n - k,
                   "p": float(stats.f.sf(f_stat, k - 1, n - k))},
        "se_factor": math.sqrt(phi),
    }
    path = os.path.join(os.path.dirname(__file__), "quasi_poisson.json")
    with open(path, "w") as fh:
        json.dump(out, fh, indent=2)
    print(json.dumps({k: out[k] for k in ("phi", "quasi_se", "quasi_p",
                                          "quasi_ci", "f_test")}, indent=1))


if __name__ == "__main__":
    main()
