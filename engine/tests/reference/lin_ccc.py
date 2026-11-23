"""Reference values for P-43 (Lin's concordance correlation coefficient):
engine/tests/test_lin_ccc.py, the e2e step and the ui-stage fixture.

R is not installed (epiR::epi.ccc, DescTools::CCC not available) and
pingouin 0.7 has no CCC. The oracle below is a line-by-line transcription
of DescTools::CCC (ci = "z-transform"), the same formulas as
epiR::epi.ccc, written from Lin (1989), Biometrics 45:255-268, with the
correction of Lin (2000), Biometrics 56:324-325:
  s2x, s2y, sxy with divisor n (R: var(x) * (n - 1) / n),
  p = 2 sxy / (s2x + s2y + (mean(y) - mean(x))^2),
  u = (mean(y) - mean(x)) / (s2x s2y)^(1/4), r = cor(x, y),
  sep = sqrt(((1 - r^2) p^2 (1 - p^2) / r^2 + 2 p^3 (1 - p) u^2 / r
              - p^4 u^4 / (2 r^2)) / (n - 2)),
  t = atanh(p), set = sep / (1 - p^2), CI = tanh(t -/+ z set).
It uses numpy's var / corrcoef (pandas-free) and the textbook pieces
independently of the engine's code path (moments computed differently).

Data:
- the Bland & Altman (2007) ejection fractions, RV vs IC, 60 pairs (the
  app's Bland-Altman template);
- Giavarina (2015) Table 1, method A vs B, 30 pairs (pingouin's
  "blandaltman" dataset);
- the Deming e2e table (X 1..8, Y 2.1 ... 15.8), where the CCC is low
  although r is high: the slope is 2, so accuracy is poor.

Run from the repository root:
  /home/eren/opendose/.venv/bin/python engine/tests/reference/lin_ccc.py
"""
import json
import os

import numpy as np
import pingouin as pg
from scipy import stats

HERE = os.path.dirname(__file__)


def descTools_ccc(x, y, conf=0.95):
    x = np.asarray(x, float)
    y = np.asarray(y, float)
    k = x.size
    mx, my = x.mean(), y.mean()
    s2x = np.var(x, ddof=1) * (k - 1) / k
    s2y = np.var(y, ddof=1) * (k - 1) / k
    sxy = np.cov(x, y, ddof=1)[0, 1] * (k - 1) / k
    p = 2 * sxy / (s2x + s2y + (my - mx) ** 2)
    r = np.corrcoef(x, y)[0, 1]
    u = (my - mx) / (s2x * s2y) ** 0.25
    sep = np.sqrt(((1 - r ** 2) * p ** 2 * (1 - p ** 2) / r ** 2
                   + 2 * p ** 3 * (1 - p) * u ** 2 / r
                   - 0.5 * p ** 4 * u ** 4 / r ** 2) / (k - 2))
    t = np.arctanh(p)
    set_ = sep / (1 - p ** 2)
    z = stats.norm.ppf(1 - (1 - conf) / 2)
    return {"ccc": float(p), "ci": [float(np.tanh(t - z * set_)),
                                    float(np.tanh(t + z * set_))],
            "se_z": float(set_), "r": float(r),
            "c_b": float(p / r), "n": int(k)}


def main():
    src = open(os.path.join(HERE, "..", "test_methodcomp_extras.py")).read()
    start = src.index("EJECTION = [")
    ns = {}
    exec(src[start:src.index("]\n", start) + 2], ns)
    rv = [r[1] for r in ns["EJECTION"]]
    ic = [r[2] for r in ns["EJECTION"]]
    d = pg.read_dataset("blandaltman")
    ga, gb = [float(v) for v in d["A"]], [float(v) for v in d["B"]]
    dx = [1, 2, 3, 4, 5, 6, 7, 8]
    dy = [2.1, 3.9, 6.2, 7.8, 10.3, 11.9, 14.2, 15.8]
    ref = {
        "ejection": {"x": rv, "y": ic, **descTools_ccc(rv, ic),
                     "ci90": descTools_ccc(rv, ic, 0.90)["ci"]},
        "giavarina": {"x": ga, "y": gb, **descTools_ccc(ga, gb)},
        "deming_e2e": {"x": dx, "y": dy, **descTools_ccc(dx, dy)},
    }
    with open(os.path.join(HERE, "lin_ccc.json"), "w") as fh:
        json.dump(ref, fh, indent=1)
    for k, v in ref.items():
        print(k, {kk: vv for kk, vv in v.items() if kk not in ("x", "y")})


if __name__ == "__main__":
    main()
