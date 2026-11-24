"""Compare fits of global-only and user-defined models (FEATURE-PLAN P-99;
opendose.compare_models, api handler compare_global_fits).

Acceptance: the vmkmki inhibition data of the R package nlstools (Baty et
al. 2015, J Stat Softw 66(5); 6 substrate x 6 inhibitor concentrations in
duplicate) fitted with competitive and mixed-model inhibition: Compare
fits reports the extra-sum-of-squares F, its P value and AICc. Neither the
package nor the paper prints a model comparison for these data, so the
reference values come from reference/compare_global_models.py: the same
models written as one indicator-coded regression over the stacked data,
fitted with scipy.optimize.least_squares (not opendose's optimiser), with
the F test and AICc by hand (Motulsky & Christopoulos 2004, ch. 22-23).

On vmkmki the mixed model's optimum runs to the uncompetitive limit (Alpha
-> 0, Ki -> infinity), which the engine approaches to 1e-5 of the sum of
squares; those values are pinned at 1e-4 (well inside the 4 significant
digits displayed). The synthetic data set has an interior optimum and is
pinned tighter.
"""

import json
import math
from pathlib import Path

import numpy as np
import pytest

from opendose import api, compare_models

REF = json.loads((Path(__file__).parent / "reference"
                  / "compare_global_models.json").read_text())


def _table(S, I, V):
    """Stacked rows -> an XY table: X = substrate, one data set per
    inhibitor concentration (its title is the concentration)."""
    levels = sorted(set(I))
    xs = sorted(set(S), reverse=True)
    sets = []
    for lev in levels:
        ys = [[V[k] for k in range(len(V)) if I[k] == lev and S[k] == x]
              for x in xs]
        sets.append({"name": f"{lev:g}", "ys": ys})
    return {"x": xs, "datasets": sets}, levels


VMK, VMK_LEVELS = _table(REF["vmkmki"]["S"], REF["vmkmki"]["I"],
                         REF["vmkmki"]["v"])


def _cmp(m1, m2, data=VMK, levels=VMK_LEVELS, **kw):
    r = api.analyze({"analysis": "compare_global_fits", "data": data,
                     "options": {"model_1": m1, "model_2": m2,
                                 "column_constants": {"I": levels}, **kw}})
    return r


def _check(r, ref, rtol):
    assert r["f_test"]["dfn"] == ref["dfn"] and r["f_test"]["dfd"] == ref["dfd"]
    assert r["f_test"]["F"] == pytest.approx(ref["F"], rel=rtol)
    if ref["p"] > 1e-12:
        assert r["f_test"]["p"] == pytest.approx(ref["p"], rel=50 * rtol)
    else:
        assert r["f_test"]["p"] < 1e-12
    assert r["aicc"]["aicc_1"] == pytest.approx(ref["aicc_1"], rel=rtol, abs=1e-3)
    assert r["aicc"]["aicc_2"] == pytest.approx(ref["aicc_2"], rel=rtol, abs=1e-3)
    assert r["aicc"]["delta"] == pytest.approx(ref["delta"], rel=rtol, abs=1e-3)


def test_acceptance_competitive_vs_mixed_on_vmkmki():
    r = _cmp({"model": "competitive_inhibition"},
             {"model": "mixed_model_inhibition"})
    ref = REF["vmkmki"]["comparisons"]["competitive_inhibition|mixed_model_inhibition"]
    _check(r, ref, 1e-4)
    # F(1, 68) = 218.3, P < 0.0001; AICc 73.46 vs -27.72: mixed preferred
    assert round(r["f_test"]["F"], 1) == 218.3
    assert r["f_test"]["simpler_model"] == 1
    assert r["aicc"]["prefer"] == 2
    assert r["nesting"]["status"] == "nested"
    assert "Alpha" in r["nesting"]["reason"]
    assert r["model_1"]["goodness"]["ss_res"] == pytest.approx(
        REF["vmkmki"]["fits"]["competitive_inhibition"]["ss"], rel=1e-6)


def test_noncompetitive_vs_mixed_on_vmkmki():
    r = _cmp({"model": "noncompetitive_inhibition"},
             {"model": "mixed_model_inhibition"})
    _check(r, REF["vmkmki"]["comparisons"]
           ["noncompetitive_inhibition|mixed_model_inhibition"], 1e-4)
    assert r["nesting"]["reason"].endswith("Alpha = 1")


def test_not_nested_pair_reports_aicc_only():
    r = _cmp({"model": "competitive_inhibition"},
             {"model": "noncompetitive_inhibition"})
    ref = REF["vmkmki"]["comparisons"]["competitive_inhibition|noncompetitive_inhibition"]
    assert r["f_test"] is None
    assert r["nesting"]["status"] == "not_nested"
    assert r["aicc"]["delta"] == pytest.approx(ref["delta"], rel=1e-6)
    r2 = _cmp({"model": "uncompetitive_inhibition"},
              {"model": "noncompetitive_inhibition"})
    assert r2["f_test"] is None
    assert r2["nesting"]["reason"] == ("uncompetitive and noncompetitive "
                                       "inhibition are not nested")


def test_complex_model_stuck_at_a_limit_warns_and_sets_f_to_zero():
    # mixed reaches uncompetitive only as Alpha -> 0: its SS stays a hair
    # above the uncompetitive one; the F test says so instead of going < 0
    r = _cmp({"model": "uncompetitive_inhibition"},
             {"model": "mixed_model_inhibition"})
    assert r["f_test"]["F"] == 0.0 and r["f_test"]["p"] == 1.0
    assert any("fits worse" in w for w in r["warnings"])


def test_synthetic_interior_optimum_pinned_tight():
    syn = REF["synthetic"]
    data, levels = _table(syn["S"], syn["I"], syn["v"])
    r = _cmp({"model": "competitive_inhibition"},
             {"model": "mixed_model_inhibition"}, data=data, levels=levels)
    _check(r, syn["comparison"], 1e-6)
    assert r["model_2"]["goodness"]["ss_res"] == pytest.approx(
        syn["fits"]["mixed_model_inhibition"]["ss"], rel=1e-7)


COMPETITIVE_EQ = {
    "text": "KmObs=Km*(1+I/Ki)\nY=Vmax*X/(KmObs+X)",
    "name": "My competitive",
    "rules": {"Vmax": "1*YMAX", "Km": "1*XATYMID", "Ki": "20"},
    "constraints": {"Vmax": "shared", "Km": "shared", "Ki": "shared",
                    "I": "column"},
}
MIXED_EQ = {
    "text": ("VmaxApp=Vmax/(1+I/(Alpha*Ki))\n"
             "KmApp=Km*(1+I/Ki)/(1+I/(Alpha*Ki))\nY=VmaxApp*X/(KmApp+X)"),
    "name": "My mixed",
    "rules": {"Vmax": "1*YMAX", "Km": "1*XATYMID", "Ki": "20", "Alpha": "1"},
    "constraints": {"Vmax": "shared", "Km": "shared", "Ki": "shared",
                    "Alpha": "shared", "I": "column"},
}


def test_two_user_equations_match_the_built_in_models():
    r = _cmp({"user_equation": COMPETITIVE_EQ}, {"user_equation": MIXED_EQ})
    built = _cmp({"model": "competitive_inhibition"},
                 {"model": "mixed_model_inhibition"})
    assert r["model_1"]["goodness"]["ss_res"] == pytest.approx(
        built["model_1"]["goodness"]["ss_res"], rel=1e-7)
    assert r["f_test"]["F"] == pytest.approx(built["f_test"]["F"], rel=1e-4)
    # different equations: nesting cannot be checked; the F test carries
    # the warning and AICc stays
    assert r["nesting"]["status"] == "unknown"
    assert any("read AICc only" in w for w in r["warnings"])
    assert r["model_1"]["user_equation"]["name"] == "My competitive"


def test_user_equation_with_a_parameter_held_constant_is_nested():
    fixed = dict(MIXED_EQ, constraints=dict(MIXED_EQ["constraints"], Alpha="1"))
    r = _cmp({"user_equation": fixed}, {"user_equation": MIXED_EQ})
    nc = _cmp({"model": "noncompetitive_inhibition"},
              {"model": "mixed_model_inhibition"})
    assert r["nesting"]["status"] == "nested" and r["nesting"]["simpler"] == 1
    assert r["f_test"]["F"] == pytest.approx(nc["f_test"]["F"], rel=1e-4)
    assert not r["warnings"]


def test_model_order_swap():
    a = _cmp({"model": "competitive_inhibition"},
             {"model": "mixed_model_inhibition"})
    b = _cmp({"model": "mixed_model_inhibition"},
             {"model": "competitive_inhibition"})
    assert b["f_test"]["F"] == pytest.approx(a["f_test"]["F"], rel=1e-9)
    assert b["f_test"]["simpler_model"] == 2
    assert b["aicc"]["delta"] == pytest.approx(-a["aicc"]["delta"], rel=1e-9)
    assert b["nesting"]["simpler"] == 2


def test_substrate_units_do_not_change_the_comparison():
    scaled = dict(VMK, x=[v * 1e-6 for v in VMK["x"]])
    a = _cmp({"model": "noncompetitive_inhibition"},
             {"model": "mixed_model_inhibition"})
    b = _cmp({"model": "noncompetitive_inhibition"},
             {"model": "mixed_model_inhibition"}, data=scaled)
    assert b["f_test"]["F"] == pytest.approx(a["f_test"]["F"], rel=1e-5)
    assert b["aicc"]["delta"] == pytest.approx(a["aicc"]["delta"], rel=1e-5)


def test_missing_data_set_constant_is_a_clear_error():
    r = api.analyze({"analysis": "compare_global_fits", "data": VMK, "options": {
        "model_1": {"model": "competitive_inhibition"},
        "model_2": {"model": "mixed_model_inhibition"},
        "column_constants": {"I": VMK_LEVELS[:-1] + [None]}}})
    assert "error" in r and "I" in r["error"]


def test_models_reading_x_differently_are_refused():
    # X = 0 rows: the log-X model leaves them out, so N differs
    data = {"x": [0, 1, 10, 100, 1000],
            "datasets": [{"name": "A", "ys": [[100, 99], [95, 93], [60, 62],
                                                [15, 17], [3, 4]]},
                         {"name": "B", "ys": [[101, 98], [97, 96], [80, 78],
                                                [35, 33], [8, 9]]}]}
    r = api.analyze({"analysis": "compare_global_fits", "data": data, "options": {
        "model_1": {"model": "log_inhibitor_vs_response_4pl"},
        "model_2": {"model": "inhibitor_vs_response_variable"},
        "x_is_log": False}})
    assert "error" in r and "different points" in r["error"]


def test_missing_model_and_too_few_points():
    r = _cmp({"model": "competitive_inhibition"}, {})
    assert "error" in r and "model_2" in r["error"]
    tiny = {"x": [1.0, 2.0], "datasets": [{"name": "0", "ys": [[1.0], [2.0]]}]}
    r = _cmp({"model": "competitive_inhibition"},
             {"model": "mixed_model_inhibition"}, data=tiny, levels=[0.0])
    assert "error" in r and "not enough data points" in r["error"]


def test_schild_slope_one_vs_free_is_nested():
    rng = np.random.default_rng(5)
    x = np.linspace(-10, -4, 13)
    sets, bs = [], [0.0, 1e-8, 1e-7, 1e-6]
    for b in bs:
        dr = 1 + (b / 10 ** -8.0) ** 1.0
        y = 0 + 100 / (1 + 10 ** ((np.log10(1e-7 * dr) - x) * 1.0))
        sets.append({"name": f"{b:g}",
                     "ys": [[float(v + rng.normal(0, 3))] for v in y]})
    data = {"x": x.tolist(), "datasets": sets}
    r = api.analyze({"analysis": "compare_global_fits", "data": data, "options": {
        "model_1": {"model": "gaddum_schild_slope1_log"},
        "model_2": {"model": "gaddum_schild_log"},
        "column_constants": {"B": bs}}})
    assert r["nesting"]["status"] == "nested" and r["f_test"]["dfn"] == 1
    ss1 = r["model_1"]["goodness"]["ss_res"]
    ss2 = r["model_2"]["goodness"]["ss_res"]
    df2 = r["model_2"]["goodness"]["df"]
    assert r["f_test"]["F"] == pytest.approx((ss1 - ss2) / (ss2 / df2), rel=1e-9)


def test_weighted_fits_use_weighted_sums_of_squares():
    r = _cmp({"model": "competitive_inhibition"},
             {"model": "mixed_model_inhibition"}, weighting="1/Y2")
    assert "error" not in r, r.get("error")
    assert r["sum_of_squares"] == "weighted" and r["notes"]
    g1, g2 = r["model_1"]["goodness"], r["model_2"]["goodness"]
    f = ((g1["ss_res_weighted"] - g2["ss_res_weighted"])
         / (g2["ss_res_weighted"] / g2["df"]))
    assert r["f_test"]["F"] == pytest.approx(max(f, 0.0), rel=1e-9)


# ------------------------------------------------------------ nesting


@pytest.mark.parametrize("args,status,simpler", [
    (("competitive_inhibition", "mixed_model_inhibition"), "nested", 1),
    (("mixed_model_inhibition", "noncompetitive_inhibition"), "nested", 2),
    (("log_inhibitor_vs_response_3pl", "log_inhibitor_vs_response_4pl"), "nested", 1),
    (("log_agonist_vs_response_4pl", "exponential_decay"), "unknown", None),
])
def test_nesting_table(args, status, simpler):
    n = compare_models.nesting(*args)
    assert n["status"] == status and n["simpler"] == simpler


def test_nesting_same_model_with_constants_and_sharing():
    m = "log_inhibitor_vs_response_4pl"
    assert compare_models.nesting(m, m, constraints_1={"HillSlope": -1})["simpler"] == 1
    assert compare_models.nesting(m, m, constraints_2={"Top": 100})["simpler"] == 2
    # different constants: neither contains the other
    assert compare_models.nesting(m, m, constraints_1={"Top": 100},
                                  constraints_2={"Bottom": 0})["status"] == "unknown"
    # sharing a parameter is a restriction too
    assert compare_models.nesting(m, m, shared_1=["HillSlope"],
                                  shared_2=[])["simpler"] == 1
    # equal parameter counts: never nested
    assert compare_models.nesting(m, m, k_1=4, k_2=4)["status"] == "not_nested"
    # a constant on the general model that the simpler one lacks
    assert compare_models.nesting(
        "competitive_inhibition", "mixed_model_inhibition",
        constraints_2={"Km": 10})["status"] == "unknown"


def test_user_equations_compare_by_text():
    assert compare_models.nesting("user:abc:0", "user:abc:1",
                                  constraints_1={"K": 1})["status"] == "nested"
    assert compare_models.nesting("user:abc:0", "user:xyz:0")["status"] == "unknown"


def test_per_data_set_compare_fits_reports_nesting():
    x = [-9, -8, -7, -6, -5, -4]
    data = {"x": x, "datasets": [{"name": "A", "ys": [[99], [96], [80], [40], [8], [2]]}]}
    r = api.analyze({"analysis": "compare_fits", "data": data, "options": {
        "model_1": {"model": "log_inhibitor_vs_response_3pl"},
        "model_2": {"model": "log_inhibitor_vs_response_4pl"}}})
    assert r["nesting"]["status"] == "nested" and r["nesting"]["simpler"] == 1


def test_per_data_set_compare_fits_accepts_a_user_equation():
    x = [1, 2, 4, 8, 16, 32]
    data = {"x": x, "datasets": [{"name": "A", "ys": [[1.1], [1.9], [3.0], [3.9], [4.6], [4.9]]}]}
    ue = {"text": "Y=Vmax*X/(Km+X)", "rules": {"Vmax": "1*YMAX", "Km": "1*XATYMID"}}
    r = api.analyze({"analysis": "compare_fits", "data": data, "options": {
        "x_is_log": False,
        "model_1": {"user_equation": ue},
        "model_2": {"model": "michaelis_menten"}}})
    assert "error" not in r, r.get("error")
    assert r["aicc"]["delta"] == pytest.approx(0.0, abs=1e-6)
    assert r["nesting"]["status"] == "not_nested"
    assert math.isfinite(r["model_1"]["goodness"]["ss_res"])
