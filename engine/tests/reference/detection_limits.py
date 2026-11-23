"""Independent reference for the limits of blank, detection and
quantification of a standard curve (FEATURE-PLAN P-29).

R (chemCal) is not installed here, so:

- LoB and LoD in signal by the CLSI EP17-A2 parametric formulas as
  Armbruster & Pry (2008, Clin Biochem Rev 29 Suppl 1:S49) write them,
  LoB = mean_blank + 1.645 SD_blank and LoD = LoB + 1.645 SD_low, with
  Python's statistics module (not numpy, not opendose); the c_beta
  variant uses 1.645 / (1 - 1/(4(N - K))) (EP17-A2);
- the concentrations by an independent 4PL fit (scipy.optimize.
  curve_fit on log10 concentration, not opendose.nlfit) and the closed-
  form inverse X = LogEC50 - log10((Top - Bottom)/(y - Bottom) - 1)/Hill,
  on the blank-subtracted signal (blank = mean of the blank wells, the
  module's default "subtract the mean of the blank rows");
- the LoQ as the low sample's mean back-calculated concentration when
  the CV of its back-calculated replicates is at most 20% and the mean
  is at or above the LoD.

The data are the plan's acceptance test: an ELISA standard curve
(synthetic, numpy seed 29: 4PL Bottom 0.06, Top 2.6, EC50 180, Hill 1.1,
2.5% noise, duplicates from 1000 to 7.81 pg/mL), 20 blank wells and 20
wells of one low-level sample (about 6 pg/mL).

Run: /home/eren/opendose/.venv/bin/python engine/tests/reference/detection_limits.py
writes detection_limits.json next to this file.
"""

from __future__ import annotations

import json
import math
import statistics as st
from pathlib import Path

import numpy as np
from scipy.optimize import curve_fit

HERE = Path(__file__).resolve().parent

CONCS = [1000, 500, 250, 125, 62.5, 31.25, 15.63, 7.81]
STANDARDS = [[2.243, 2.268], [1.969, 1.969], [1.559, 1.548], [1.087, 1.077],
             [0.674, 0.654], [0.38, 0.375], [0.212, 0.209], [0.138, 0.135]]
BLANKS = [0.057, 0.058, 0.062, 0.062, 0.063, 0.064, 0.072, 0.061, 0.061,
          0.051, 0.053, 0.069, 0.071, 0.062, 0.06, 0.062, 0.052, 0.058,
          0.058, 0.067]
LOW = [0.113, 0.121, 0.123, 0.125, 0.116, 0.115, 0.106, 0.126, 0.126, 0.116,
       0.12, 0.11, 0.118, 0.123, 0.116, 0.119, 0.125, 0.122, 0.115, 0.129]
Z = 1.645


def four_pl(x, bottom, top, logec50, hill):
    return bottom + (top - bottom) / (1 + 10 ** ((logec50 - x) * hill))


def main():
    blank = st.mean(BLANKS)
    xs = [math.log10(c) for c, reps in zip(CONCS, STANDARDS) for _ in reps]
    ys = [v - blank for reps in STANDARDS for v in reps]
    p, _ = curve_fit(four_pl, np.array(xs), np.array(ys),
                     p0=[0.0, 2.5, 2.2, 1.0], maxfev=20000)
    bottom, top, logec50, hill = (float(v) for v in p)

    def conc(signal_as_read):
        y = signal_as_read - blank
        return 10 ** (logec50 - math.log10((top - bottom) / (y - bottom) - 1)
                      / hill)

    sd_b = st.stdev(BLANKS)
    sd_l = st.stdev(LOW)
    lob = blank + Z * sd_b
    lod = lob + Z * sd_l
    n, k = len(LOW), 1
    c_beta = Z / (1 - 1 / (4 * (n - k)))
    lod_cb = lob + c_beta * sd_l
    back = [conc(v) for v in LOW]
    cv = 100 * st.stdev(back) / st.mean(back)
    out = {
        "data": {"concentrations": CONCS, "standards": STANDARDS,
                 "blanks": BLANKS, "low": LOW},
        "fit": {"Bottom": bottom, "Top": top, "LogEC50": logec50,
                "HillSlope": hill},
        "mean_blank": blank, "sd_blank": sd_b, "sd_low": sd_l,
        "lob_signal": lob, "lod_signal": lod,
        "lob_conc": conc(lob), "lod_conc": conc(lod),
        "c_beta": c_beta, "lod_signal_c_beta": lod_cb,
        "lod_conc_c_beta": conc(lod_cb),
        "low_mean_conc": st.mean(back), "low_cv_pct": cv,
        "loq_conc": st.mean(back) if cv <= 20 and st.mean(back) >= conc(lod)
        else None,
    }
    (HERE / "detection_limits.json").write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
