"""Meta-analysis (opendose.meta, P-92) against published R output and an
independent reference implementation.

References:
- metafor 5.3-4 reference manual, rma.uni "Examples"
  (https://wviechtb.github.io/metafor/reference/rma.uni.html), printed
  output for dat.bcg (Colditz et al. 1994, JAMA 271:698) with
  escalc(measure = "RR"): REML estimate -0.7145, SE 0.1798, 95% CI
  -1.0669 to -0.3622, tau^2 0.3132 (SE 0.1664), tau 0.5597, I^2 92.22%,
  H^2 12.86, Q(df = 12) = 152.2330; method = "FE": -0.4303, SE 0.0405,
  CI -0.5097 to -0.3509, I^2 92.12%, H^2 12.69. predict.rma "Examples"
  (https://wviechtb.github.io/metafor/reference/predict.rma.html):
  predict(res, transf = exp, digits = 2) -> 0.49 (0.34 to 0.70).
- R metafor (rma, method = "DL", test = "knha") on Kacker 2004 and R meta
  (metagen, method.tau = "DL", hakn = TRUE) outputs stored in statsmodels
  0.15, statsmodels/stats/tests/results/results_meta.py (exk1_dl_hksj,
  results_or_dl_hk).
- engine/tests/reference/meta_reference.py: REML by Fisher scoring
  (metafor's algorithm), Hartung-Knapp written out, statsmodels
  combine_effects for DerSimonian-Laird; its printed output is pinned
  below.
"""

import math

import numpy as np
import pytest

from opendose import api, meta
from tests.reference.meta_reference import bcg_yi_vi

Y, V = bcg_yi_vi()
SE = np.sqrt(V)
LABELS = [f"Trial {i + 1}" for i in range(13)]


def bcg(**kw):
    return meta.meta_analysis(Y, SE, LABELS, scale="log_ratio", **kw)


def test_bcg_reml_matches_metafor_printed_output():
    r = bcg(test="z")
    re = r["random"]
    assert round(re["estimate"], 4) == -0.7145
    assert round(re["se"], 4) == 0.1798
    assert [round(c, 4) for c in re["ci"]] == [-1.0669, -0.3622]
    assert round(re["tau2"], 4) == 0.3132
    assert round(re["tau2_se"], 4) == 0.1664
    assert round(re["tau"], 4) == 0.5597
    h = r["heterogeneity"]
    assert round(h["I2"], 2) == 92.22
    assert round(h["H2"], 2) == 12.86
    assert round(h["Q"], 4) == 152.2330
    assert h["df"] == 12
    assert h["p"] < 1e-4
    # back-transformed, metafor predict(transf = exp, digits = 2)
    assert round(re["ratio"], 2) == 0.49
    assert [round(c, 2) for c in re["ratio_ci"]] == [0.34, 0.70]


def test_bcg_fixed_effect_matches_metafor():
    r = bcg()
    fe = r["fixed"]
    assert round(fe["estimate"], 4) == -0.4303
    assert round(fe["se"], 4) == 0.0405
    assert [round(c, 4) for c in fe["ci"]] == [-0.5097, -0.3509]
    assert round(r["heterogeneity"]["I2_Q"], 2) == 92.12


def test_bcg_hartung_knapp_matches_reference_script():
    # meta_reference.py bcg_reml: ci_hk, se_hk, p_hk, pi_hk
    r = bcg()
    re = r["random"]
    assert re["test"] == "knha" and re["stat_name"] == "t" and re["df"] == 12
    assert re["se"] == pytest.approx(0.18079174409284807, rel=1e-9)
    assert re["ci"] == pytest.approx([-1.1084437136855514, -0.3206209706307279], rel=1e-9)
    assert re["p"] == pytest.approx(0.0019200150960573031, rel=1e-7)
    assert r["prediction"]["ci"] == pytest.approx([-2.0090576503711226, 0.5799929660548434], rel=1e-9)
    assert r["prediction"]["df"] == 11
    assert re["tau2"] == pytest.approx(0.31324325813648635, rel=1e-9)
    assert len(r["studies"]) == 13
    assert sum(s["weight_random"] for s in r["studies"]) == pytest.approx(100)


def test_bcg_dersimonian_laird_matches_statsmodels():
    r = bcg(method="DL")
    assert r["random"]["tau2"] == pytest.approx(0.30876026286237634, rel=1e-9)
    assert r["random"]["estimate"] == pytest.approx(-0.7141172220732269, rel=1e-9)
    assert r["random"]["se"] == pytest.approx(0.18069662833554745, rel=1e-9)
    assert r["random"]["ci"] == pytest.approx([-1.1078213541683288, -0.3204130899781251], rel=1e-9)
    assert r["random"]["tau2_se"] is None


def test_kacker_dl_knha_matches_metafor_in_statsmodels():
    # results_meta.py exk1_dl_hksj: rma(y, v, method = "DL", test = "knha")
    y = [61, 61.4, 62.21, 62.3, 62.34, 62.6, 62.7, 62.84, 65.9]
    v = [0.2025, 1.21, 0.09, 0.2025, 0.3844, 0.5625, 0.0676, 0.0225, 1.8225]
    r = meta.meta_analysis(y, np.sqrt(v), method="DL")
    re = r["random"]
    assert re["estimate"] == pytest.approx(62.3901386044504, rel=1e-12)
    assert re["se"] == pytest.approx(0.29477605699879, rel=1e-9)
    assert re["ci"] == pytest.approx([61.710383798052, 63.0698934108488], rel=1e-10)
    assert re["tau2"] == pytest.approx(0.288049246973751, rel=1e-9)
    assert r["heterogeneity"]["I2"] == pytest.approx(67.744403741711, rel=1e-9)
    assert r["heterogeneity"]["H2"] == pytest.approx(3.10023721772938, rel=1e-9)
    assert r["heterogeneity"]["Q"] == pytest.approx(24.801897741835, rel=1e-9)


def test_prediction_interval_matches_r_meta_in_statsmodels():
    # results_meta.py results_or_dl_hk: metagen(..., method.tau = "DL",
    # hakn = TRUE): TE.random, seTE.random, lower/upper.random and .predict
    from statsmodels.stats.tests.results.results_meta import results_or_dl_hk as m
    r = meta.meta_analysis(m.TE, m.seTE, method="DL")
    assert r["random"]["estimate"] == pytest.approx(m.TE_random, rel=1e-10)
    assert r["random"]["se"] == pytest.approx(m.seTE_random, rel=1e-9)
    assert r["random"]["ci"] == pytest.approx([m.lower_random, m.upper_random], rel=1e-9)
    assert r["prediction"]["ci"] == pytest.approx([m.lower_predict, m.upper_predict], rel=1e-9)
    assert r["prediction"]["se"] == pytest.approx(m.seTE_predict, rel=1e-9)
    assert r["fixed"]["estimate"] == pytest.approx(m.TE_fixed, rel=1e-10)
    assert r["fixed"]["ci"] == pytest.approx([m.lower_fixed, m.upper_fixed], rel=1e-9)


def test_three_experiments_note_and_reference():
    # meta_reference.py three_reml
    r = meta.meta_analysis([1.2, 0.4, 0.9], [0.30, 0.25, 0.40])
    re = r["random"]
    assert re["tau2"] == pytest.approx(0.11029272383250935, rel=1e-8)
    assert re["tau2_se"] == pytest.approx(0.20862969220736766, rel=1e-6)
    assert re["ci"] == pytest.approx([-0.25759716954614054, 1.8647981662645592], rel=1e-8)
    assert re["ci_z"] == pytest.approx([0.28852745725575835, 1.3186735394626603], rel=1e-8)
    assert r["prediction"]["ci"] == pytest.approx([-4.45257764798767, 6.059778644706089], rel=1e-8)
    assert any("estimated poorly" in n for n in r["notes"])


# ------------------------------------------------------------ edge cases

def test_needs_two_rows():
    with pytest.raises(ValueError, match="at least 2 rows"):
        meta.meta_analysis([0.5], [0.1])
    with pytest.raises(ValueError, match="this table has 0"):
        meta.meta_analysis([], [])


def test_two_rows_has_no_prediction_interval():
    r = meta.meta_analysis([0.5, 0.9], [0.1, 0.2])
    assert r["prediction"] is None
    assert r["random"]["df"] == 1
    assert any("prediction interval" in n for n in r["notes"])


def test_missing_and_bad_rows_are_listed_not_dropped_silently():
    r = meta.meta_analysis([0.5, None, 0.9, 0.3, float("nan")],
                           [0.1, 0.2, 0.0, 0.15, 0.1], ["A", "B", "C", "D", "E"])
    assert r["k"] == 2
    assert [d["label"] for d in r["dropped"]] == ["B", "C", "E"]
    assert r["dropped"][1]["reason"] == "SE is not positive"


def test_all_estimates_equal():
    r = meta.meta_analysis([0.4, 0.4, 0.4], [0.1, 0.2, 0.3])
    assert r["random"]["tau2"] == 0
    assert r["random"]["estimate"] == pytest.approx(0.4)
    assert r["heterogeneity"]["Q"] == pytest.approx(0, abs=1e-20)
    assert r["heterogeneity"]["I2_Q"] == 0
    assert any("All estimates are equal" in n for n in r["notes"])


def test_tau2_zero_when_homogeneous():
    r = meta.meta_analysis([0.50, 0.52, 0.49, 0.51], [0.1, 0.1, 0.1, 0.1])
    assert r["random"]["tau2"] == 0
    assert r["random"]["estimate"] == pytest.approx(r["fixed"]["estimate"])
    assert any("equals the common-effect" in n for n in r["notes"])


@pytest.mark.parametrize("c", [1e-12, 1e12])
def test_unit_scaling(c):
    base = meta.meta_analysis(Y, SE)
    r = meta.meta_analysis(Y * c, SE * c)
    assert r["random"]["estimate"] == pytest.approx(base["random"]["estimate"] * c, rel=1e-8)
    assert r["random"]["tau2"] == pytest.approx(base["random"]["tau2"] * c * c, rel=1e-7)
    assert r["random"]["ci"] == pytest.approx([x * c for x in base["random"]["ci"]], rel=1e-8)
    assert r["heterogeneity"]["I2"] == pytest.approx(base["heterogeneity"]["I2"], rel=1e-8)
    assert r["random"]["p"] == pytest.approx(base["random"]["p"], rel=1e-7)


def test_row_order_and_sign_invariance():
    base = meta.meta_analysis(Y, SE)
    perm = np.random.default_rng(1).permutation(13)
    r = meta.meta_analysis(Y[perm], SE[perm])
    assert r["random"]["estimate"] == pytest.approx(base["random"]["estimate"], rel=1e-10)
    assert r["random"]["tau2"] == pytest.approx(base["random"]["tau2"], rel=1e-9)
    neg = meta.meta_analysis(-Y, SE)
    assert neg["random"]["estimate"] == pytest.approx(-base["random"]["estimate"], rel=1e-10)
    assert neg["random"]["ci"] == pytest.approx([-base["random"]["ci"][1], -base["random"]["ci"][0]], rel=1e-10)


def test_shift_invariance_of_heterogeneity():
    base = meta.meta_analysis(Y, SE)
    r = meta.meta_analysis(Y + 5, SE)
    assert r["random"]["tau2"] == pytest.approx(base["random"]["tau2"], rel=1e-8)
    assert r["random"]["estimate"] == pytest.approx(base["random"]["estimate"] + 5, rel=1e-10)


def test_inverse_variance_mean():
    r = meta.inverse_variance_mean([1.0, 3.0], [1.0, 1.0])
    assert r["estimate"] == 2.0 and r["se"] == pytest.approx(math.sqrt(0.5))
    assert r["weights"] == [0.5, 0.5]


# ------------------------------------------------------- reading the table

def test_from_limits_ratio_round_trip():
    rr = [math.exp(y) for y in Y]
    z = 1.959963984540054
    lo = [math.exp(y - z * s) for y, s in zip(Y, SE)]
    hi = [math.exp(y + z * s) for y, s in zip(Y, SE)]
    est, ses, bad = meta.from_limits(rr, lo, hi, ratio=True)
    assert not bad
    assert est == pytest.approx(list(Y), rel=1e-12)
    assert ses == pytest.approx(list(SE), rel=1e-9)
    _, _, bad = meta.from_limits([0.5], [0.0], [1.2], ratio=True)
    assert bad == {0: "a ratio or limit is not positive"}


def test_api_handler_reads_ratio_limits_and_matches():
    z = 1.959963984540054
    rows = [{"label": l, "values": [math.exp(y), math.exp(y + z * s), math.exp(y - z * s)]}
            for l, y, s in zip(LABELS, Y, SE)]
    r = api.analyze({"analysis": "meta_analysis", "data": {"rows": rows},
                     "options": {"format": "mean_limits", "scale": "ratio", "test": "z"}})
    assert "error" not in r, r.get("error")
    assert round(r["random"]["estimate"], 4) == -0.7145
    assert round(r["random"]["ratio"], 2) == 0.49
    assert r["studies"][0]["label"] == "Trial 1"


def test_api_handler_se_rows_and_errors():
    rows = [{"label": l, "values": [y, s]} for l, y, s in zip(LABELS, Y, SE)]
    rows.append({"label": "Blank", "values": [None, None]})
    r = api.analyze({"analysis": "meta_analysis", "data": {"rows": rows},
                     "options": {"format": "mean_sem", "scale": "log_ratio"}})
    assert r["k"] == 13 and r["dropped"] == [{"label": "Blank", "reason": "estimate or SE missing"}]
    assert [round(c, 4) for c in r["random"]["ci"]] == [-1.1084, -0.3206]
    bad = api.analyze({"analysis": "meta_analysis", "data": {"rows": rows},
                       "options": {"format": "replicates"}})
    assert "Mean, SEM" in bad["error"]
    bad = api.analyze({"analysis": "meta_analysis", "data": {"rows": rows},
                       "options": {"format": "mean_sem", "scale": "ratio"}})
    assert "CI limits" in bad["error"]


def test_mean_sd_n_rows_pool_means():
    rows = [{"label": "E1", "values": [10, 2, 4]}, {"label": "E2", "values": [12, 3, 9]},
            {"label": "E3", "values": [11, 2, 16]}]
    labels, est, ses, _ = meta.read_rows(rows, "mean_sd_n")
    assert ses == pytest.approx([1.0, 1.0, 0.5])
