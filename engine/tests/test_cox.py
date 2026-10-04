"""Cox proportional-hazards regression (opendose.cox).

References (R values are R's own printed output):
- Therneau & Grambsch (2000), "Modeling Survival Data", appendix test
  data (reproduced as R survival package tests book1.R, book2.R, zph.R):
  closed-form MLE, log-likelihood, information, martingale and
  Schoenfeld residuals, Breslow/Efron survival variance and the score
  form of the proportional-hazards test.
- R survival package, tests/ovarian.Rout.save (survival 3.8-12):
  martingale / deviance / Schoenfeld residuals of coxph(Surv(futime,
  fustat) ~ age + resid.ds + rx + ecog.ps) and the summary and
  survfit() of the strata(rx) model.
- R survival package vignette "The survival package" (Therneau),
  sections on the lung and veteran data: coxph(Surv(time, status) ~ age
  + sex + wt.loss, lung) coefficients, LR / Wald / score tests,
  concordance and cox.zph (km); the stratified-by-inst fit; cox.zph of
  coxph(Surv(time, status) ~ trt + celltype + karno, veteran) with the
  identity and log transforms.
- R coxph(Surv(time, status) ~ age + sex, lung) printout reproduced in
  many tutorials (coef 0.017045 / -0.513219, se 0.009223 / 0.167458,
  concordance 0.603 (se 0.025), LR 14.12, Wald 13.47, score 13.72;
  cox.zph age 0.209, sex 2.608, global 2.771) and the veteran full model
  (LR 62.1 on 8 df, p = 1.799e-10).
- statsmodels PHReg (Efron and Breslow ties) to ~1e-12.
- Exact partial likelihood: Therneau & Grambsch closed form (R survival
  tests/book7.R: loglik 2(b - log(3r + 3)), score 2/(r + 1), information
  2r/(r + 1)^2, residuals 0, 2/3, -1/3, -4/3, 1, 0 at the infinite MLE)
  and brute-force enumeration of the risk-set subsets.
- Profile-likelihood CIs (the hazard-ratio CIs in the GraphPad guide's
  Cox example are asymmetric on the log scale): endpoints invert the
  likelihood-ratio test.
"""

import math

import numpy as np
import pytest
from statsmodels.duration.hazard_regression import PHReg

from opendose.api import analyze
from opendose.cox import _loglik, _Strata, cox_regression

TEST1_TIME = [9, 3, 1, 1, 6, 6, 8]
TEST1_STATUS = [1, None, 1, 0, 1, 1, 0]
TEST1_X = [0, 2, 1, 1, 1, 0, 0]

# survival::ovarian
OVARIAN = [
    (59, 1, 72.3315, 2, 1, 1), (115, 1, 74.4932, 2, 1, 1),
    (156, 1, 66.4658, 2, 1, 2), (421, 0, 53.3644, 2, 2, 1),
    (431, 1, 50.3397, 2, 1, 1), (448, 0, 56.4301, 1, 1, 2),
    (464, 1, 56.937, 2, 2, 2), (475, 1, 59.8548, 2, 2, 2),
    (477, 0, 64.1753, 2, 1, 1), (563, 1, 55.1781, 1, 2, 2),
    (638, 1, 56.7562, 1, 1, 2), (744, 0, 50.1096, 1, 2, 1),
    (769, 0, 59.6301, 2, 2, 2), (770, 0, 57.0521, 2, 2, 1),
    (803, 0, 39.2712, 1, 1, 1), (855, 0, 43.1233, 1, 1, 2),
    (1040, 0, 38.8932, 2, 1, 2), (1106, 0, 44.6, 1, 1, 1),
    (1129, 0, 53.9068, 1, 2, 1), (1206, 0, 44.2055, 2, 2, 1),
    (1227, 0, 59.589, 1, 2, 2), (268, 1, 74.5041, 2, 1, 2),
    (329, 1, 43.137, 2, 1, 1), (353, 1, 63.2192, 1, 2, 2),
    (365, 1, 64.4247, 2, 2, 1), (377, 0, 58.3096, 1, 2, 1),
]

# survival::lung (= cancer): inst, time, status (1 censored, 2 dead), age,
# sex, wt.loss
LUNG = """
3,306,2,74,1,NA 3,455,2,68,1,15 3,1010,1,56,1,15 5,210,2,57,1,11
1,883,2,60,1,0 12,1022,1,74,1,0 7,310,2,68,2,10 11,361,2,71,2,1
1,218,2,53,1,16 7,166,2,61,1,34 6,170,2,57,1,27 16,654,2,68,2,23
11,728,2,68,2,5 21,71,2,60,1,32 12,567,2,57,1,60 1,144,2,67,1,15
22,613,2,70,1,-5 16,707,2,63,1,22 1,61,2,56,2,10 21,88,2,57,1,NA
11,301,2,67,1,17 6,81,2,49,2,-8 11,624,2,50,1,16 15,371,2,58,1,13
12,394,2,72,1,0 12,520,2,70,2,6 4,574,2,60,1,-13 13,118,2,70,1,20
13,390,2,53,1,-7 1,12,2,74,1,20 12,473,2,69,2,-1 1,26,2,73,1,20
7,533,2,48,1,-11 16,107,2,60,2,-15 12,53,2,61,1,10 1,122,2,62,2,NA
22,814,2,65,1,28 15,965,1,66,2,4 1,93,2,74,1,24 1,731,2,64,2,15
5,460,2,70,1,10 11,153,2,73,2,11 10,433,2,59,2,27 12,145,2,60,2,NA
7,583,2,68,1,7 7,95,2,76,2,-24 1,303,2,74,1,30 3,519,2,63,1,10
13,643,2,74,1,2 22,765,2,50,2,4 3,735,2,72,2,9 12,189,2,63,1,0
21,53,2,68,1,0 1,246,2,58,1,7 6,689,2,59,1,15 1,65,2,62,1,NA 5,5,2,65,2,5
22,132,2,57,1,18 3,687,2,58,2,10 1,345,2,64,2,-3 22,444,2,75,2,8
12,223,2,48,1,68 21,175,2,73,1,NA 11,60,2,65,2,0 3,163,2,69,1,0
3,65,2,68,1,8 16,208,2,67,2,2 5,821,1,64,2,3 22,428,2,68,1,0 6,230,2,67,1,23
13,840,1,63,1,-1 3,305,2,48,2,29 5,11,2,74,1,0 2,132,2,40,1,3
21,226,2,53,2,3 12,426,2,71,2,19 1,705,2,51,2,0 6,363,2,56,2,-2
3,11,2,81,1,15 1,176,2,73,1,30 4,791,2,59,1,5 13,95,2,55,1,15
11,196,1,42,1,8 21,167,2,44,2,-1 16,806,1,44,1,1 6,284,2,71,1,14
22,641,2,62,2,1 21,147,2,61,1,4 13,740,1,44,2,39 1,163,2,72,1,2
11,655,2,63,1,-1 22,239,2,70,1,23 5,88,2,66,1,8 10,245,2,57,2,14
1,588,1,69,2,13 12,30,2,72,1,7 3,179,2,69,1,25 12,310,2,71,1,0
11,477,2,64,1,0 3,166,2,70,2,10 1,559,1,58,2,15 6,450,2,69,2,3
13,364,2,56,1,4 6,107,2,63,1,0 13,177,2,59,1,32 12,156,2,66,1,14
26,529,1,54,2,-3 1,11,2,67,1,NA 21,429,2,55,1,5 3,351,2,75,2,11
13,15,2,69,1,10 1,181,2,44,1,5 10,283,2,80,1,6 3,201,2,75,2,1
6,524,2,54,2,15 1,13,2,76,1,20 3,212,2,49,1,20 1,524,2,68,1,30
16,288,2,66,1,24 15,363,2,80,1,11 22,442,2,75,1,0 26,199,2,60,2,10
3,550,2,69,2,0 11,54,2,72,1,-3 1,558,2,70,1,17 22,207,2,66,1,20
7,92,2,50,1,13 12,60,2,64,1,0 16,551,1,77,2,28 12,543,1,48,2,4
4,293,2,59,2,52 16,202,2,53,1,20 6,353,2,47,1,5 13,511,1,55,2,49
1,267,2,67,1,6 22,511,1,74,2,37 12,371,2,58,2,0 13,387,2,56,1,NA
1,457,2,54,1,-5 5,337,2,56,1,15 21,201,2,73,2,-16 3,404,1,74,1,38
26,222,2,76,1,8 1,62,2,65,2,0 11,458,1,57,1,30 26,356,1,53,2,2
16,353,2,71,1,2 16,163,2,54,1,13 12,31,2,82,1,27 13,340,2,59,2,0
13,229,2,70,1,-2 22,444,1,60,1,7 5,315,1,62,2,0 16,182,2,53,2,4
32,156,2,55,1,10 NA,329,2,69,1,20 26,364,1,68,2,7 4,291,2,62,1,27
12,179,2,63,1,-2 1,376,1,56,2,17 32,384,1,62,2,8 10,268,2,44,2,2
11,292,1,69,1,36 6,142,2,63,1,2 7,413,1,64,1,16 16,266,1,57,2,3
11,194,2,60,2,33 21,320,2,46,1,4 6,181,2,61,1,0 12,285,2,65,1,0
13,301,1,61,1,2 2,348,2,58,2,10 2,197,2,56,1,37 16,382,1,43,2,6
1,303,1,53,1,12 13,296,1,59,2,0 1,180,2,56,1,-2 13,186,2,55,2,NA
1,145,2,53,2,13 7,269,1,74,2,0 13,300,1,60,1,5 1,284,1,39,1,-5
16,350,2,66,2,NA 32,272,1,65,2,-1 12,292,1,51,2,0 12,332,1,45,2,5
2,285,2,72,2,20 3,259,1,58,1,8 15,110,2,64,1,12 22,286,2,53,1,8
16,270,2,72,1,14 16,81,2,52,1,NA 12,131,2,50,1,NA 1,225,1,64,1,33
22,269,2,71,1,-2 12,225,1,70,1,6 32,243,1,63,2,0 21,279,1,64,1,4
1,276,1,52,2,0 32,135,2,60,1,0 15,79,2,64,2,37 22,59,2,73,1,5
32,240,1,63,2,0 3,202,1,50,2,1 26,235,1,63,2,0 33,105,2,62,1,NA
5,224,1,55,2,23 13,239,2,50,2,-3 21,237,1,69,1,NA 33,173,1,59,2,10
1,252,1,60,2,-2 6,221,1,67,1,23 15,185,1,69,1,0 11,92,1,64,2,31
11,13,2,65,1,10 11,222,1,65,1,18 13,192,1,41,2,-10 21,183,2,76,1,7
11,211,1,70,2,3 2,175,1,57,2,11 22,197,1,67,1,2 11,203,1,71,2,0
1,116,2,76,1,0 1,188,1,77,1,3 13,191,1,39,1,-5 32,105,1,75,2,5
6,174,1,66,1,1 22,177,1,58,2,0
"""

# survival::veteran: trt, celltype, time, status, karno, diagtime, age, prior
VETERAN = """
1,squamous,72,1,60,7,69,0 1,squamous,411,1,70,5,64,10
1,squamous,228,1,60,3,38,0 1,squamous,126,1,60,9,63,10
1,squamous,118,1,70,11,65,10 1,squamous,10,1,20,5,49,0
1,squamous,82,1,40,10,69,10 1,squamous,110,1,80,29,68,0
1,squamous,314,1,50,18,43,0 1,squamous,100,0,70,6,70,0
1,squamous,42,1,60,4,81,0 1,squamous,8,1,40,58,63,10
1,squamous,144,1,30,4,63,0 1,squamous,25,0,80,9,52,10
1,squamous,11,1,70,11,48,10 1,smallcell,30,1,60,3,61,0
1,smallcell,384,1,60,9,42,0 1,smallcell,4,1,40,2,35,0
1,smallcell,54,1,80,4,63,10 1,smallcell,13,1,60,4,56,0
1,smallcell,123,0,40,3,55,0 1,smallcell,97,0,60,5,67,0
1,smallcell,153,1,60,14,63,10 1,smallcell,59,1,30,2,65,0
1,smallcell,117,1,80,3,46,0 1,smallcell,16,1,30,4,53,10
1,smallcell,151,1,50,12,69,0 1,smallcell,22,1,60,4,68,0
1,smallcell,56,1,80,12,43,10 1,smallcell,21,1,40,2,55,10
1,smallcell,18,1,20,15,42,0 1,smallcell,139,1,80,2,64,0
1,smallcell,20,1,30,5,65,0 1,smallcell,31,1,75,3,65,0
1,smallcell,52,1,70,2,55,0 1,smallcell,287,1,60,25,66,10
1,smallcell,18,1,30,4,60,0 1,smallcell,51,1,60,1,67,0
1,smallcell,122,1,80,28,53,0 1,smallcell,27,1,60,8,62,0
1,smallcell,54,1,70,1,67,0 1,smallcell,7,1,50,7,72,0
1,smallcell,63,1,50,11,48,0 1,smallcell,392,1,40,4,68,0
1,smallcell,10,1,40,23,67,10 1,adeno,8,1,20,19,61,10 1,adeno,92,1,70,10,60,0
1,adeno,35,1,40,6,62,0 1,adeno,117,1,80,2,38,0 1,adeno,132,1,80,5,50,0
1,adeno,12,1,50,4,63,10 1,adeno,162,1,80,5,64,0 1,adeno,3,1,30,3,43,0
1,adeno,95,1,80,4,34,0 1,large,177,1,50,16,66,10 1,large,162,1,80,5,62,0
1,large,216,1,50,15,52,0 1,large,553,1,70,2,47,0 1,large,278,1,60,12,63,0
1,large,12,1,40,12,68,10 1,large,260,1,80,5,45,0 1,large,200,1,80,12,41,10
1,large,156,1,70,2,66,0 1,large,182,0,90,2,62,0 1,large,143,1,90,8,60,0
1,large,105,1,80,11,66,0 1,large,103,1,80,5,38,0 1,large,250,1,70,8,53,10
1,large,100,1,60,13,37,10 2,squamous,999,1,90,12,54,10
2,squamous,112,1,80,6,60,0 2,squamous,87,0,80,3,48,0
2,squamous,231,0,50,8,52,10 2,squamous,242,1,50,1,70,0
2,squamous,991,1,70,7,50,10 2,squamous,111,1,70,3,62,0
2,squamous,1,1,20,21,65,10 2,squamous,587,1,60,3,58,0
2,squamous,389,1,90,2,62,0 2,squamous,33,1,30,6,64,0
2,squamous,25,1,20,36,63,0 2,squamous,357,1,70,13,58,0
2,squamous,467,1,90,2,64,0 2,squamous,201,1,80,28,52,10
2,squamous,1,1,50,7,35,0 2,squamous,30,1,70,11,63,0
2,squamous,44,1,60,13,70,10 2,squamous,283,1,90,2,51,0
2,squamous,15,1,50,13,40,10 2,smallcell,25,1,30,2,69,0
2,smallcell,103,0,70,22,36,10 2,smallcell,21,1,20,4,71,0
2,smallcell,13,1,30,2,62,0 2,smallcell,87,1,60,2,60,0
2,smallcell,2,1,40,36,44,10 2,smallcell,20,1,30,9,54,10
2,smallcell,7,1,20,11,66,0 2,smallcell,24,1,60,8,49,0
2,smallcell,99,1,70,3,72,0 2,smallcell,8,1,80,2,68,0
2,smallcell,99,1,85,4,62,0 2,smallcell,61,1,70,2,71,0
2,smallcell,25,1,70,2,70,0 2,smallcell,95,1,70,1,61,0
2,smallcell,80,1,50,17,71,0 2,smallcell,51,1,30,87,59,10
2,smallcell,29,1,40,8,67,0 2,adeno,24,1,40,2,60,0 2,adeno,18,1,40,5,69,10
2,adeno,83,0,99,3,57,0 2,adeno,31,1,80,3,39,0 2,adeno,51,1,60,5,62,0
2,adeno,90,1,60,22,50,10 2,adeno,52,1,60,3,43,0 2,adeno,73,1,60,3,70,0
2,adeno,8,1,50,5,66,0 2,adeno,36,1,70,8,61,0 2,adeno,48,1,10,4,81,0
2,adeno,7,1,40,4,58,0 2,adeno,140,1,70,3,63,0 2,adeno,186,1,90,3,60,0
2,adeno,84,1,80,4,62,10 2,adeno,19,1,50,10,42,0 2,adeno,45,1,40,3,69,0
2,adeno,80,1,40,4,63,0 2,large,52,1,60,4,45,0 2,large,164,1,70,15,68,10
2,large,19,1,30,4,39,10 2,large,53,1,60,12,66,0 2,large,15,1,30,5,63,0
2,large,43,1,60,11,49,10 2,large,340,1,80,10,64,10 2,large,133,1,75,1,65,0
2,large,111,1,60,5,64,0 2,large,231,1,70,18,67,10 2,large,378,1,80,4,65,0
2,large,49,1,30,3,37,0
"""


def _parse(block, kinds):
    rows = []
    for rec in block.split():
        vals = rec.split(",")
        rows.append([None if v == "NA" else (k(v) if k else v)
                     for v, k in zip(vals, kinds)])
    return list(map(list, zip(*rows)))


INST, LTIME, LSTATUS, LAGE, LSEX, LWT = _parse(LUNG, [float] * 6)
LEVENT = [s - 1 for s in LSTATUS]
VTRT, VCELL, VTIME, VSTATUS, VKARNO, VDIAG, VAGE, VPRIOR = _parse(
    VETERAN, [float, None, float, float, float, float, float, float])
CELL_LEVELS = ["squamous", "smallcell", "adeno", "large"]


def _coef(res, name):
    return next(c for c in res["coefficients"] if c["name"] == name)


class TestClosedForm:
    """Therneau & Grambsch appendix data, exact solutions."""

    def test_breslow(self):
        res = cox_regression(TEST1_TIME, TEST1_STATUS, {"x": TEST1_X},
                             ties="breslow", ph_transform="identity")
        r = (3 + math.sqrt(33)) / 2
        b = math.log(r)
        assert res["n"] == 6 and res["n_excluded"] == 1
        assert _coef(res, "x")["coef"] == pytest.approx(b, rel=1e-12)
        loglik = 2 * b - (math.log(3 * r + 3) + 2 * math.log(r + 3))
        assert res["loglik"] == pytest.approx(loglik, rel=1e-12)
        imat = r / (r + 1) ** 2 + 6 * r / (r + 3) ** 2
        assert res["covariance"][0][0] == pytest.approx(1 / imat, rel=1e-10)
        # martingale residuals in input order (row 2 is missing)
        haz = np.array([1 / (3 * r + 3), 2 / (r + 3), 0, 1])
        ch = np.cumsum(haz)
        status = [1, 0, 1, 1, 0, 1]
        wt = [r, r, r, 1, 1, 1]
        tie = [0, 0, 1, 1, 2, 3]
        mart = [status[i] - wt[i] * ch[tie[i]] for i in range(6)]
        got = res["residuals"]["martingale"]
        assert got[1] is None
        np.testing.assert_allclose([got[i] for i in (2, 3, 4, 5, 6, 0)], mart,
                                   rtol=1e-10)
        np.testing.assert_allclose(
            np.ravel(res["schoenfeld"]["residuals"]),
            [1 / (r + 1), 1 - r / (3 + r), -r / (3 + r), 0], atol=1e-12)
        # baseline survival at x = 0 and its variance (book1.R byhand1)
        base = res["baseline"]["strata"][0]
        np.testing.assert_allclose(base["cumulative_hazard"][1:],
                                   ch[[0, 1, 3]], rtol=1e-10)
        xbar = np.array([r / (r + 1), r / (r + 3), 0, 0])
        vg = np.cumsum([1 / (3 * r + 3) ** 2, 2 / (r + 3) ** 2, 0, 1])
        vd = np.cumsum(-xbar * haz)
        np.testing.assert_allclose(np.square(base["se_cumulative_hazard"][1:]),
                                   (vg + vd ** 2 / imat)[[0, 1, 3]], rtol=1e-9)
        # cox.zph identity transform = score test (zph.R)
        U = np.array([1 / (r + 1), 3 / (r + 3), -r / (r + 3), 0])
        im = np.array([r / (r + 1) ** 2, 3 * r / (r + 3) ** 2,
                       3 * r / (r + 3) ** 2, 0])
        g = np.array([1, 6, 6, 9.0])
        u2 = np.array([U.sum(), (g * U).sum()])
        i2 = np.array([[im.sum(), (g * im).sum()],
                       [(g * im).sum(), (g * g * im).sum()]])
        assert res["ph_test"]["terms"][0]["chi2"] == pytest.approx(
            float(np.linalg.solve(i2, u2) @ u2), rel=1e-10)

    def test_breslow_at_beta_zero_survival_variance(self):
        # book1.R: survfit at iter=0 has std.err^2 = 7/180, 2/9, 2/9, 11/9;
        # reproduce with the x = 0 baseline of a model whose fitted b = 0
        # cannot be forced, so check the closed form at b-hat instead (above)
        # and the iter-0 score test: chi2 = U(0)^2 / I(0).
        res = cox_regression(TEST1_TIME, TEST1_STATUS, {"x": TEST1_X},
                             ties="breslow")
        u0 = (6 + 3 - 1) / (2 * 4)
        i0 = 1 / 4 + 6 / 16
        assert res["tests"]["score"]["chi2"] == pytest.approx(u0 ** 2 / i0,
                                                              rel=1e-12)

    def test_efron(self):
        res = cox_regression(TEST1_TIME, TEST1_STATUS, {"x": TEST1_X},
                             ph_transform="log")
        phi = math.acos((45 / 23) * math.sqrt(3 / 23))
        r = 2 * math.sqrt(23 / 3) * math.cos(phi / 3)
        b = math.log(r)
        assert _coef(res, "x")["coef"] == pytest.approx(b, rel=1e-12)
        assert round(_coef(res, "x")["coef"], 6) == 1.676857
        loglik = 2 * b - (math.log(3 * r + 3) + math.log((r + 5) / 2)
                          + math.log(r + 3))
        assert res["loglik"] == pytest.approx(loglik, rel=1e-12)
        tf = lambda v: v - v * v  # noqa: E731
        imat = tf(r / (r + 1)) + tf(r / (r + 5)) + tf(r / (r + 3))
        assert res["covariance"][0][0] == pytest.approx(1 / imat, rel=1e-10)
        # book2.R weight matrix: rows = subjects (sorted), cols = times
        # 1, 6, 6+0 (second death), 9
        wtmat = np.array([[1, 0, 0, 0], [1, 0, 0, 0], [1, 1, .5, 0],
                          [1, 1, .5, 0], [1, 1, 1, 0], [1, 1, 1, 1]], float)
        wtmat = np.diag([r, r, r, 1, 1, 1]) @ wtmat
        xs = np.array([1, 1, 1, 0, 0, 0.0])
        status = np.array([1, 0, 1, 1, 0, 1.0])
        haz = 1 / wtmat.sum(axis=0)
        xbar = (wtmat * xs[:, None]).sum(axis=0) / wtmat.sum(axis=0)
        mart = status - (wtmat * haz).sum(axis=1)
        got = res["residuals"]["martingale"]
        np.testing.assert_allclose([got[i] for i in (2, 3, 4, 5, 6, 0)], mart,
                                   rtol=1e-10)
        dbar = xbar[1:3].mean()
        np.testing.assert_allclose(
            np.ravel(res["schoenfeld"]["residuals"]),
            [1 / (r + 1), 1 - dbar, -dbar, 0], atol=1e-12)
        base = res["baseline"]["strata"][0]
        assert res["hazard_method"] == "efron"
        np.testing.assert_allclose(base["survival"][1:],
                                   np.exp(-np.cumsum(haz))[[0, 2, 3]],
                                   rtol=1e-10)
        var = np.cumsum(haz ** 2) + np.cumsum(-xbar * haz) ** 2 / imat
        np.testing.assert_allclose(np.square(base["se_cumulative_hazard"][1:]),
                                   var[[0, 2, 3]], rtol=1e-9)
        # cox.zph, log transform (zph.R)
        U = np.array([1 / (r + 1), 3 / (r + 3), -r / (r + 5), 0])
        im = np.array([r / (r + 1) ** 2, 3 * r / (r + 3) ** 2,
                       5 * r / (r + 5) ** 2, 0])
        g = np.log([1, 6, 6, 9.0])
        g -= g.mean()
        u4 = np.array([U.sum(), (g * U).sum()])
        i4 = np.array([[im.sum(), (g * im).sum()],
                       [(g * im).sum(), (g * g * im).sum()]])
        assert res["ph_test"]["terms"][0]["chi2"] == pytest.approx(
            float(np.linalg.solve(i4, u4) @ u4), rel=1e-10)

    def test_artificial_strata_double_the_zph_statistic(self):
        one = cox_regression(TEST1_TIME, TEST1_STATUS, {"x": TEST1_X},
                             ph_transform="log")
        two = cox_regression(TEST1_TIME * 2, TEST1_STATUS * 2,
                             {"x": TEST1_X * 2}, strata=["a"] * 7 + ["b"] * 7,
                             ph_transform="log")
        assert _coef(two, "x")["coef"] == pytest.approx(
            _coef(one, "x")["coef"], rel=1e-10)
        assert two["ph_test"]["terms"][0]["chi2"] == pytest.approx(
            2 * one["ph_test"]["terms"][0]["chi2"], rel=1e-10)


class TestExactAndProfile:
    def test_exact_closed_form(self):
        t = np.array([9, 1, 1, 6, 6, 8.0])
        e = np.array([1, 1, 0, 1, 1, 0.0])
        X = np.array([[0], [1], [1], [1], [0], [0.0]])
        st = _Strata(t, e, np.zeros(6, int))
        for b in (0.0, 0.7, 2.0):
            r = math.exp(b)
            ll, u, i = _loglik(X, np.array([b]), st, "exact")
            assert ll == pytest.approx(2 * (b - math.log(3 * r + 3)), rel=1e-12)
            assert u[0] == pytest.approx(2 / (r + 1), rel=1e-12)
            assert i[0, 0] == pytest.approx(2 * r / (r + 1) ** 2, rel=1e-12)
        res = cox_regression(TEST1_TIME, TEST1_STATUS, {"x": TEST1_X},
                             ties="exact")
        assert any("infinite" in w for w in res["warnings"])
        got = [v for v in res["residuals"]["martingale"] if v is not None]
        np.testing.assert_allclose(got, [0, 2 / 3, -1 / 3, -4 / 3, 1, 0],
                                   atol=1e-8)

    def test_exact_matches_subset_enumeration(self):
        import itertools
        rng = np.random.default_rng(1)
        n = 14
        t = rng.integers(1, 5, n).astype(float)
        e = (rng.random(n) < 0.8).astype(float)
        X = rng.normal(size=(n, 2))
        st = _Strata(t, e, np.zeros(n, int))

        def direct(b):
            eta = X @ b
            tot = 0.0
            for tt in np.unique(t[e == 1]):
                D = np.flatnonzero((t == tt) & (e == 1))
                R = np.flatnonzero(t >= tt)
                den = sum(math.exp(eta[list(S)].sum())
                          for S in itertools.combinations(R, D.size))
                tot += eta[D].sum() - math.log(den)
            return tot
        b = np.array([0.3, -0.5])
        ll, g, info = _loglik(X, b, st, "exact")
        assert ll == pytest.approx(direct(b), rel=1e-12)
        h = 1e-6
        num = [(direct(b + h * np.eye(2)[k]) - direct(b - h * np.eye(2)[k]))
               / (2 * h) for k in range(2)]
        np.testing.assert_allclose(g, num, rtol=1e-6)
        # no ties: exact = Breslow = Efron
        res = [cox_regression(TestOvarian.cols[0], TestOvarian.cols[1],
                              {"age": TestOvarian.cols[2]}, ties=k)
               for k in ("exact", "breslow", "efron")]
        assert res[0]["coefficients"][0]["coef"] == pytest.approx(
            res[2]["coefficients"][0]["coef"], rel=1e-12)

    def test_profile_ci_inverts_the_lr_test(self):
        from scipy import stats as sps
        res = cox_regression(LTIME, LEVENT, {"age": LAGE, "sex": LSEX},
                             ci_method="profile")
        crit = sps.chi2.ppf(0.95, 1)
        for j, name in enumerate(("age", "sex")):
            c = _coef(res, name)
            lo, hi = c["ci_profile"]
            assert lo < c["coef"] < hi
            # close to Wald for this well-behaved fit
            np.testing.assert_allclose(c["ci_profile"], c["ci"], atol=0.01)
            assert c["hazard_ratio_ci_profile"][0] == pytest.approx(
                math.exp(lo))
            for bound in (lo, hi):
                other = "sex" if name == "age" else "age"
                # refit with this coefficient fixed via an offset: the
                # profile log-likelihood drops by crit / 2
                X = np.column_stack([LAGE, LSEX]).astype(float)
                Xc = X - X.mean(axis=0)
                st = _Strata(np.array(LTIME), np.array(LEVENT, float),
                             np.zeros(len(LTIME), int))
                from opendose.cox import _newton
                fit = _newton(Xc, st, "efron", 50, 1e-12, fixed=(j, bound))
                assert 2 * (res["loglik"] - fit["loglik"]) == pytest.approx(
                    crit, rel=1e-6)
                assert other

    def test_profile_ci_unbounded_side(self):
        res = cox_regression([1, 2, 3, 4, 5, 6], [1] * 6,
                             {"x": [6, 5, 4, 3, 2, 1]}, ci_method="profile")
        lo, hi = res["coefficients"][0]["ci_profile"]
        assert hi is None and lo is not None


class TestOvarian:
    """R survival tests/ovarian.Rout.save."""

    cols = list(zip(*OVARIAN))
    time, status = cols[0], cols[1]
    cov = {"age": cols[2], "resid.ds": cols[3], "rx": cols[4],
           "ecog.ps": cols[5]}

    def test_single_covariate_fits(self):
        res = cox_regression(self.time, self.status, {"age": self.cov["age"]})
        c = _coef(res, "age")
        assert round(c["coef"], 5) == 0.16162
        assert round(c["hazard_ratio"], 5) == 1.17541
        assert round(c["se"], 5) == 0.04974
        assert round(c["p"], 5) == 0.00116
        assert round(res["tests"]["likelihood_ratio"]["chi2"], 2) == 14.29
        res = cox_regression(self.time, self.status,
                             {k: self.cov[k] for k in ("age", "rx", "ecog.ps")})
        assert [round(_coef(res, k)["coef"], 4) for k in
                ("age", "rx", "ecog.ps")] == [0.1470, -0.8146, 0.1032]
        assert round(res["tests"]["likelihood_ratio"]["chi2"], 2) == 15.92

    def test_residuals(self):
        res = cox_regression(self.time, self.status, self.cov)
        mart = [0.84103277, 0.54424388, 0.59670824, -0.11281376, 0.75111588,
                -0.32609026, 0.59998927, 0.29570718, -2.15325805, 0.76243469,
                0.06474272, -0.11680752, -1.22562781, -0.63474839,
                -0.07535824, -0.17058905, -0.22986038, -0.14654862,
                -0.18762920, -0.12771548, -0.53373114, -0.65480022,
                0.95866131, 0.82111675, 0.55136554, -0.09154014]
        dev = [1.41281595, 0.69505907, 0.78916003, -0.47500266, 1.13106322,
               -0.80757694, 0.79532966, 0.33122166, -2.07521471, 1.16179002,
               0.06619519, -0.48333740, -1.56564862, -1.12671948,
               -0.38822221, -0.58410453, -0.67802711, -0.54138455,
               -0.61258338, -0.50540178, -1.03318066, -0.54976346,
               2.11059000, 1.34157009, 0.70736314, -0.42787881]
        np.testing.assert_allclose(res["residuals"]["martingale"], mart,
                                   atol=5e-9)
        np.testing.assert_allclose(res["residuals"]["deviance"], dev,
                                   atol=5e-9)
        sch = np.array(res["schoenfeld"]["residuals"])
        assert res["schoenfeld"]["time"][:3] == [59.0, 115.0, 156.0]
        np.testing.assert_allclose(
            sch[0], [2.69315603, 0.06761160, -0.1256239, -0.5072536],
            atol=5e-7)
        np.testing.assert_allclose(
            sch[-1], [1.64752655, -0.50593437, -0.6446947, 0.2939883],
            atol=5e-7)

    def test_stratified_summary_and_survfit(self):
        res = cox_regression(self.time, self.status,
                             {"age": self.cov["age"],
                              "ecog.ps": self.cov["ecog.ps"]},
                             strata=self.cov["rx"])
        age, ecog = _coef(res, "age"), _coef(res, "ecog.ps")
        assert (round(age["coef"], 5), round(age["se"], 5)) == (0.13853, 0.04801)
        assert (round(ecog["coef"], 5), round(ecog["se"], 5)) == (-0.09670, 0.62994)
        assert round(age["hazard_ratio_ci"][0], 4) == 1.0454
        assert round(ecog["hazard_ratio_ci"][1], 3) == 3.120
        assert round(res["concordance"]["c"], 3) == 0.819
        assert round(res["concordance"]["se"], 3) == 0.058
        assert round(res["tests"]["likelihood_ratio"]["chi2"], 2) == 12.71
        assert round(res["tests"]["wald"]["chi2"], 2) == 8.43
        assert round(res["tests"]["score"]["chi2"], 2) == 12.24
        # summary(survfit(fit)): curve at the covariate means, per stratum
        s1, s2 = res["curves"][0]["strata"]
        assert s1["stratum"] == "1" and s2["stratum"] == "2"
        assert s1["time"][1:] == [59, 115, 156, 268, 329, 431, 638]
        assert [round(v, 3) for v in s1["survival"][1:]] == \
            [0.978, 0.951, 0.910, 0.862, 0.737, 0.627, 0.333]
        assert [round(v, 4) for v in s1["se_survival"][1:]] == \
            [0.0266, 0.0478, 0.0760, 0.1055, 0.1525, 0.1704, 0.2296]
        assert [round(v, 4) for v in s1["lower"][1:]] == \
            [0.9275, 0.8620, 0.7722, 0.6776, 0.4909, 0.3680, 0.0865]
        assert s1["upper"][1:] == [1.0] * 7
        assert [round(v, 3) for v in s2["survival"][1:]] == \
            [0.943, 0.880, 0.789, 0.697, 0.597]
        assert [round(v, 4) for v in s2["se_survival"][1:]] == \
            [0.0560, 0.0812, 0.1143, 0.1349, 0.1494]
        assert [round(v, 3) for v in s2["lower"][1:]] == \
            [0.839, 0.735, 0.594, 0.477, 0.366]
        assert round(s2["upper"][-1], 3) == 0.975
        assert s1["n_risk"][1:] == [13, 12, 11, 10, 9, 8, 5]


class TestLung:
    """R survival vignette and widely reproduced coxph printouts."""

    def test_age_sex(self):
        res = cox_regression(LTIME, LEVENT, {"age": LAGE, "sex": LSEX})
        assert res["n"] == 228 and res["n_events"] == 165
        age, sex = _coef(res, "age"), _coef(res, "sex")
        assert round(age["coef"], 6) == 0.017045
        assert round(age["se"], 6) == 0.009223
        assert round(age["z"], 3) == 1.848
        assert round(age["p"], 5) == 0.06459
        assert round(sex["coef"], 6) == -0.513219
        assert round(sex["hazard_ratio"], 6) == 0.598566
        assert round(sex["se"], 6) == 0.167458
        assert round(sex["p"], 5) == 0.00218
        assert [round(v, 4) for v in age["hazard_ratio_ci"]] == [0.9990, 1.0357]
        assert [round(v, 4) for v in sex["hazard_ratio_ci"]] == [0.4311, 0.8311]
        assert round(res["concordance"]["c"], 3) == 0.603
        assert round(res["concordance"]["se"], 3) == 0.025
        assert round(res["tests"]["likelihood_ratio"]["chi2"], 2) == 14.12
        assert round(res["tests"]["wald"]["chi2"], 2) == 13.47
        assert round(res["tests"]["score"]["chi2"], 2) == 13.72
        zph = {t["term"]: t["chi2"] for t in res["ph_test"]["terms"]}
        assert (round(zph["age"], 3), round(zph["sex"], 3)) == (0.209, 2.608)
        assert round(res["ph_test"]["global"]["chi2"], 3) == 2.771

    def test_age_sex_weight_loss(self):
        res = cox_regression(LTIME, LEVENT,
                             {"age": LAGE, "sex": LSEX, "wt.loss": LWT})
        assert res["n"] == 214 and res["n_events"] == 152
        assert res["n_excluded"] == 14
        got = [(round(_coef(res, k)["coef"], 7), round(_coef(res, k)["se"], 7))
               for k in ("age", "sex", "wt.loss")]
        assert got == [(0.0200882, 0.0096644), (-0.5210319, 0.1743541),
                       (0.0007596, 0.0061934)]
        assert round(res["loglik_null"], 2) == -680.39
        assert round(res["loglik"], 2) == -673.06
        assert round(res["tests"]["likelihood_ratio"]["chi2"], 2) == 14.67
        assert round(res["tests"]["wald"]["chi2"], 2) == 13.98
        assert round(res["tests"]["score"]["chi2"], 2) == 14.24
        assert round(res["concordance"]["c"], 3) == 0.612
        assert round(res["concordance"]["se"], 3) == 0.027
        zph = [round(t["chi2"], 4) for t in res["ph_test"]["terms"]]
        assert zph == [0.5077, 2.5489, 0.0144]
        assert round(res["ph_test"]["global"]["chi2"], 4) == 3.0051
        strat = cox_regression(LTIME, LEVENT,
                               {"age": LAGE, "sex": LSEX, "wt.loss": LWT},
                               strata=INST)
        assert [round(c["coef"], 4) for c in strat["coefficients"]] == \
            [0.0235, -0.5160, -0.0017]

    @pytest.mark.parametrize("ties", ["efron", "breslow"])
    def test_matches_statsmodels(self, ties):
        keep = [i for i in range(len(LTIME)) if LWT[i] is not None]
        t = np.array([LTIME[i] for i in keep])
        e = np.array([LEVENT[i] for i in keep])
        X = np.array([[LAGE[i], LSEX[i], LWT[i]] for i in keep])
        sm = PHReg(t, X, status=e, ties=ties).fit()
        res = cox_regression(t, e, {"age": X[:, 0], "sex": X[:, 1],
                                    "wt.loss": X[:, 2]}, ties=ties)
        np.testing.assert_allclose([c["coef"] for c in res["coefficients"]],
                                   sm.params, rtol=1e-9)
        np.testing.assert_allclose([c["se"] for c in res["coefficients"]],
                                   sm.bse, rtol=1e-9)
        assert res["loglik"] == pytest.approx(sm.llf, rel=1e-12)
        # Breslow baseline cumulative hazard at x = 0. statsmodels lists
        # the left-continuous value H(t-) against each event time, so its
        # entries are ours shifted by one event time (ours match the
        # Therneau & Grambsch closed form above, i.e. R's survfit).
        if ties == "breslow":
            bch = sm.baseline_cumulative_hazard[0]
            base = res["baseline"]["strata"][0]
            np.testing.assert_allclose(base["time"][1:], bch[0])
            np.testing.assert_allclose(base["cumulative_hazard"][1:-1],
                                       bch[1][1:], rtol=1e-9)

    def test_stratified_matches_statsmodels(self):
        keep = [i for i in range(len(LTIME))
                if LWT[i] is not None and INST[i] is not None]
        t = np.array([LTIME[i] for i in keep])
        e = np.array([LEVENT[i] for i in keep])
        X = np.array([[LAGE[i], LSEX[i]] for i in keep])
        s = np.array([INST[i] for i in keep])
        sm = PHReg(t, X, status=e, strata=s, ties="efron").fit()
        res = cox_regression(t, e, {"age": X[:, 0], "sex": X[:, 1]}, strata=s)
        np.testing.assert_allclose([c["coef"] for c in res["coefficients"]],
                                   sm.params, rtol=1e-9)
        np.testing.assert_allclose([c["se"] for c in res["coefficients"]],
                                   sm.bse, rtol=1e-9)

    def test_concordance_brute_force(self):
        res = cox_regression(LTIME, LEVENT, {"age": LAGE, "sex": LSEX})
        eta = np.array(res["linear_predictor"])
        t, e = np.array(LTIME), np.array(LEVENT)
        conc = disc = tie = 0
        for i in np.flatnonzero(e == 1):
            for j in range(t.size):
                if t[j] > t[i] or (t[j] == t[i] and e[j] == 0):
                    conc += eta[i] > eta[j]
                    disc += eta[i] < eta[j]
                    tie += eta[i] == eta[j]
        c = res["concordance"]
        assert (c["concordant"], c["discordant"], c["tied_risk"]) == \
            (conc, disc, tie)
        assert c["c"] == pytest.approx((conc + tie / 2) / (conc + disc + tie))


class TestVeteran:
    cov = {"trt": VTRT, "celltype": VCELL, "karno": VKARNO,
           "diagtime": VDIAG, "age": VAGE, "prior": VPRIOR}

    def test_full_model(self):
        res = cox_regression(VTIME, VSTATUS, self.cov,
                             levels={"celltype": CELL_LEVELS})
        expect = {"trt": (2.946e-01, 2.075e-01, 1.419),
                  "celltype[smallcell]": (8.616e-01, 2.753e-01, 3.130),
                  "celltype[adeno]": (1.196e+00, 3.009e-01, 3.975),
                  "celltype[large]": (4.013e-01, 2.827e-01, 1.420),
                  "karno": (-3.282e-02, 5.508e-03, -5.958),
                  "diagtime": (8.132e-05, 9.136e-03, 0.009),
                  "age": (-8.706e-03, 9.300e-03, -0.936),
                  "prior": (7.159e-03, 2.323e-02, 0.308)}
        for name, (b, se, z) in expect.items():
            c = _coef(res, name)
            assert float(f"{c['coef']:.4g}") == b, name
            assert float(f"{c['se']:.4g}") == se, name
            assert round(c["z"], 3) == z, name
        assert _coef(res, "celltype[adeno]")["reference"] == "squamous"
        lr = res["tests"]["likelihood_ratio"]
        assert round(lr["chi2"], 1) == 62.1 and lr["df"] == 8
        assert float(f"{lr['p']:.4g}") == 1.799e-10
        cell = next(t for t in res["term_tests"] if t["term"] == "celltype")
        assert cell["df"] == 3

    @pytest.mark.parametrize("transform,expect,glob", [
        ("identity", {"trt": 0.00493, "celltype": 18.41391,
                      "karno": 6.05160}, 20.87086),
        ("log", {"trt": 0.215, "celltype": 13.586, "karno": 10.079}, 21.451),
    ])
    def test_zph(self, transform, expect, glob):
        res = cox_regression(VTIME, VSTATUS,
                             {k: self.cov[k] for k in ("trt", "celltype",
                                                       "karno")},
                             levels={"celltype": CELL_LEVELS},
                             ph_transform=transform)
        digits = 5 if transform == "identity" else 3
        for t in res["ph_test"]["terms"]:
            assert round(t["chi2"], digits) == expect[t["term"]]
        assert next(t for t in res["ph_test"]["terms"]
                    if t["term"] == "celltype")["df"] == 3
        assert round(res["ph_test"]["global"]["chi2"], digits) == glob
        assert res["ph_test"]["global"]["df"] == 5

    def test_categorical_matches_statsmodels_dummies(self):
        others = [c for c in CELL_LEVELS[1:]]
        X = np.column_stack([VKARNO] + [[1.0 if v == lv else 0.0 for v in VCELL]
                                        for lv in others])
        sm = PHReg(np.array(VTIME), X, status=np.array(VSTATUS),
                   ties="breslow").fit()
        res = cox_regression(VTIME, VSTATUS,
                             {"karno": VKARNO, "celltype": VCELL},
                             reference={"celltype": "squamous"},
                             ties="breslow")
        names = ["karno"] + [f"celltype[{lv}]" for lv in others]
        np.testing.assert_allclose([_coef(res, n)["coef"] for n in names],
                                   sm.params, rtol=1e-9)
        np.testing.assert_allclose([_coef(res, n)["se"] for n in names],
                                   sm.bse, rtol=1e-9)


class TestCurvesAndOptions:
    def test_profiles_and_baseline_relation(self):
        res = cox_regression(LTIME, LEVENT, {"age": LAGE, "sex": LSEX},
                             curves_at=[{"age": 60, "sex": 1, "label": "men 60"},
                                        {"age": 60, "sex": 2}])
        b_age = _coef(res, "age")["coef"]
        b_sex = _coef(res, "sex")["coef"]
        base = np.array(res["baseline"]["strata"][0]["cumulative_hazard"])
        men = res["curves"][0]
        assert men["label"] == "men 60"
        h = np.array(men["strata"][0]["cumulative_hazard"])
        np.testing.assert_allclose(h, base * math.exp(60 * b_age + b_sex),
                                   rtol=1e-10)
        women = np.array(res["curves"][1]["strata"][0]["survival"])
        np.testing.assert_allclose(
            women, np.exp(-base * math.exp(60 * b_age + 2 * b_sex)), rtol=1e-10)

    def test_scaled_schoenfeld_mean_is_beta(self):
        res = cox_regression(LTIME, LEVENT, {"age": LAGE, "sex": LSEX})
        scaled = np.array(res["schoenfeld"]["scaled"])
        raw = np.array(res["schoenfeld"]["residuals"])
        # residuals sum to zero at the MLE, so the scaled ones average b
        np.testing.assert_allclose(raw.sum(axis=0), 0, atol=1e-8)
        np.testing.assert_allclose(scaled.mean(axis=0),
                                   [c["coef"] for c in res["coefficients"]],
                                   atol=1e-8)

    def test_text_categories_default_to_first_level(self):
        sex = ["male" if s == 1 else "female" for s in LSEX]
        res = cox_regression(LTIME, LEVENT, {"age": LAGE, "sex": sex})
        c = _coef(res, "sex[male]")
        assert c["reference"] == "female"
        assert c["coef"] == pytest.approx(0.513219, abs=1e-6)

    def test_rank_transform_runs_and_errors(self):
        res = cox_regression(LTIME, LEVENT, {"age": LAGE},
                             ph_transform="rank")
        assert res["ph_test"]["transform"] == "rank"
        with pytest.raises(ValueError, match="time transform"):
            cox_regression(LTIME, LEVENT, {"age": LAGE}, ph_transform="sqrt")
        with pytest.raises(ValueError, match="no events"):
            cox_regression([1, 2, 3], [0, 0, 0], {"x": [1, 2, 3]})
        with pytest.raises(ValueError, match="no variation"):
            cox_regression([1, 2, 3], [1, 0, 1], {"x": [1, 1, 1]})

    def test_monotone_likelihood_warns(self):
        res = cox_regression([1, 2, 3, 4, 5, 6], [1, 1, 1, 1, 1, 1],
                             {"x": [6, 5, 4, 3, 2, 1]})
        assert any("infinite" in w for w in res["warnings"])


class TestApi:
    def test_cox_handler_long_format(self):
        res = analyze({"analysis": "cox", "data": {
            "time": LTIME, "event": LEVENT,
            "covariates": {"age": LAGE, "sex": LSEX}}, "options": {}})
        assert "error" not in res, res.get("error")
        assert round(_coef(res, "sex")["coef"], 6) == -0.513219

    def test_cox_handler_variables_table(self):
        variables = [{"name": "time", "values": LTIME},
                     {"name": "status", "values": LSTATUS},
                     {"name": "age", "values": LAGE},
                     {"name": "sex", "values": LSEX, "kind": "categorical"}]
        res = analyze({"analysis": "cox", "data": {"variables": variables},
                       "options": {"time": "time", "event": "status",
                                   "event_code": 2, "covariates": ["age", "sex"]}})
        assert "error" not in res, res.get("error")
        c = _coef(res, "sex[2]")
        assert c["reference"] == "1"
        assert round(c["coef"], 6) == -0.513219
