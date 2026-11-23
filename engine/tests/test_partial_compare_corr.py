"""P-48: partial correlation (multivar.correlation_matrix with control
variables, correlation.partial_correlation) and comparing two correlations
(correlation.compare_independent / compare_dependent_*, and the column
correlation's "compare" option in the API).

Reference values: engine/tests/reference/partial_compare_corr.py
(pingouin.partial_corr and a hand residual-on-residual computation;
Fisher z and Steiger 1980 Z1*/Z2* by hand; a Monte Carlo check of the
Pearson-Filon covariance). R (ppcor, cocor) is not installed."""

import json
import math
import pathlib

import numpy as np
import pytest

from opendose import api, correlation, multivar

REF = json.loads((pathlib.Path(__file__).parent / "reference"
                  / "partial_compare_corr.json").read_text())
TAB = REF["table"]


def variables(tab=TAB):
    return [{"name": k, "values": v} for k, v in tab.items()]


def cell(m, a, b):
    i, j = m["names"].index(a), m["names"].index(b)
    return {"r": m["r"][i][j], "p": m["p"][i][j], "n": m["n"][i][j],
            "ci": [m["ci_lo"][i][j], m["ci_hi"][i][j]], "df": m["df"][i][j]}


@pytest.mark.parametrize("method", ["pearson", "spearman"])
def test_partial_matrix_matches_pingouin(method):
    m = multivar.correlation_matrix(variables(), method=method,
                                    control=["Age"])
    assert m["partial"] is True and m["control"] == ["Age"]
    assert m["names"] == ["SBP", "BMI", "Cholesterol"]   # Age leaves
    for key, ref in REF["partial_control_age"].items():
        a, b = key.split("|")
        c = cell(m, a, b)
        assert c["r"] == pytest.approx(ref[method]["r"], abs=1e-12)
        assert c["p"] == pytest.approx(ref[method]["p"], rel=1e-9)
        assert c["n"] == 24 and c["df"] == 21
        # pingouin rounds its CI to 2 decimals
        assert [round(v, 2) for v in c["ci"]] == ref[method]["ci"]
        if method == "pearson":
            assert c["r"] == pytest.approx(ref["hand_pearson"]["r"], abs=1e-12)
            assert c["p"] == pytest.approx(ref["hand_pearson"]["p"], rel=1e-9)
    # display pins (pingouin): SBP vs Cholesterol given Age
    c = cell(m, "SBP", "Cholesterol")
    if method == "pearson":
        assert f"{c['r']:.4f}" == f"{REF['partial_control_age']['SBP|Cholesterol']['pearson']['r']:.4f}"


def test_partial_two_covariates_and_symmetry():
    ref = REF["partial_age_bmi_sbp_chol"]
    r = correlation.partial_correlation(TAB["SBP"], TAB["Cholesterol"],
                                        [TAB["Age"], TAB["BMI"]])
    assert r["r"] == pytest.approx(ref["r"], abs=1e-12)
    assert r["p_two_tailed"] == pytest.approx(ref["p"], rel=1e-9)
    assert r["df"] == 24 - 2 - 2 and r["k"] == 2
    # swapping x and y changes nothing
    s = correlation.partial_correlation(TAB["Cholesterol"], TAB["SBP"],
                                        [TAB["Age"], TAB["BMI"]])
    assert s["r"] == pytest.approx(r["r"], abs=1e-14)
    # units: SBP in kPa, Age in months: r and P unchanged
    u = correlation.partial_correlation([v * 0.133322 for v in TAB["SBP"]],
                                        TAB["Cholesterol"],
                                        [[a * 12 for a in TAB["Age"]],
                                         TAB["BMI"]])
    assert u["r"] == pytest.approx(r["r"], abs=1e-12)
    # permuting the rows changes nothing
    order = np.random.default_rng(1).permutation(24)
    p = correlation.partial_correlation(
        [TAB["SBP"][i] for i in order], [TAB["Cholesterol"][i] for i in order],
        [[TAB["Age"][i] for i in order], [TAB["BMI"][i] for i in order]])
    assert p["r"] == pytest.approx(r["r"], abs=1e-12)


def test_partial_edge_cases():
    x, y, z = TAB["SBP"], TAB["Cholesterol"], TAB["Age"]
    # missing values: the row is left out of that pair only
    xm = list(x)
    xm[3] = None
    r = correlation.partial_correlation(xm, y, [z])
    assert r["n"] == 23 and r["df"] == 20
    # too few rows for k covariates
    with pytest.raises(ValueError, match="needs at least 4 complete rows"):
        correlation.partial_correlation(x[:3], y[:3], [z[:3]])
    with pytest.raises(ValueError, match="constant"):
        correlation.partial_correlation(x, y, [[5.0] * 24])
    with pytest.raises(ValueError, match="collinear"):
        correlation.partial_correlation(x, y, [z, [2 * a + 1 for a in z]])
    with pytest.raises(ValueError, match="explain x or y exactly"):
        correlation.partial_correlation([2 * a for a in z], y, [z])
    # no covariates: the simple Pearson r
    s = correlation.partial_correlation(x, y, [])
    assert s["r"] == pytest.approx(REF["simple_r"]["SBP|Cholesterol"],
                                   abs=1e-12)
    # in the matrix, a failing pair is named, the others computed
    tab = dict(TAB, Const=[1.0] * 24)
    m = multivar.correlation_matrix(variables(tab), control=["Const"])
    assert m["warnings"] and "constant" in m["warnings"][0]
    with pytest.raises(ValueError, match="not a numeric variable"):
        multivar.correlation_matrix(variables(), control=["Weight"])
    with pytest.raises(ValueError, match="at least 2 variables besides"):
        multivar.correlation_matrix(variables(),
                                    control=["Age", "BMI", "SBP"])
    with pytest.raises(ValueError, match="Pearson or Spearman"):
        multivar.correlation_matrix(variables(), method="kendall",
                                    control=["Age"])
    # without control variables the matrix is the simple one, unchanged
    plain = multivar.correlation_matrix(variables())
    assert "partial" not in plain and "Age" in plain["names"]


def test_partial_matrix_through_the_api():
    res = api.analyze({"analysis": "correlation_matrix",
                       "data": {"variables": variables()},
                       "options": {"variables": ["SBP", "BMI", "Cholesterol"],
                                   "control": ["Age"]}})
    assert "error" not in res, res.get("error")
    c = cell(res, "SBP", "BMI")
    assert c["r"] == pytest.approx(
        REF["partial_control_age"]["SBP|BMI"]["pearson"]["r"], abs=1e-12)


def test_compare_independent_fisher_z():
    ref = REF["independent"]
    out = correlation.compare_independent(ref["r1"], ref["n1"], ref["r2"],
                                          ref["n2"])
    assert out["z"] == pytest.approx(ref["z"], rel=1e-12)
    assert out["p_two_tailed"] == pytest.approx(ref["p"], rel=1e-12)
    # swapping the two flips the sign of z only
    sw = correlation.compare_independent(ref["r2"], ref["n2"], ref["r1"],
                                         ref["n1"])
    assert sw["z"] == pytest.approx(-out["z"])
    assert sw["p_two_tailed"] == pytest.approx(out["p_two_tailed"])
    with pytest.raises(ValueError, match="at least 4 pairs"):
        correlation.compare_independent(0.5, 3, 0.2, 10)
    with pytest.raises(ValueError, match="exactly 1"):
        correlation.compare_independent(1.0, 10, 0.2, 10)
    # equal correlations: z = 0, P = 1
    eq = correlation.compare_independent(0.4, 20, 0.4, 30)
    assert eq["z"] == 0 and eq["p_two_tailed"] == pytest.approx(1.0)


def test_compare_dependent_steiger():
    dep = REF["dependent"]
    R = np.corrcoef(np.array([TAB[v] for v in dep["order"]]))
    o = correlation.compare_dependent_overlapping(R[0, 1], R[0, 2], R[1, 2],
                                                  24)
    ref = dep["overlapping"]
    assert o["z"] == pytest.approx(ref["z"], rel=1e-10)
    assert o["p_two_tailed"] == pytest.approx(ref["p"], rel=1e-10)
    assert o["covariance"] == pytest.approx(ref["covariance"], rel=1e-10)
    no = correlation.compare_dependent_nonoverlapping(
        R[0, 1], R[2, 3], R[0, 2], R[0, 3], R[1, 2], R[1, 3], 24)
    ref = dep["nonoverlapping"]
    assert no["z"] == pytest.approx(ref["z"], rel=1e-10)
    assert no["p_two_tailed"] == pytest.approx(ref["p"], rel=1e-10)
    # the Pearson-Filon covariance (Steiger eq. 3) matches simulation
    mc = REF["monte_carlo"]
    assert mc["overlapping_sim"] == pytest.approx(mc["overlapping_formula"],
                                                  abs=0.003)
    assert mc["nonoverlapping_sim"] == pytest.approx(
        mc["nonoverlapping_formula"], abs=0.003)


def _column_table(cols):
    return {"datasets": [{"name": k, "ys": [[v] for v in vals]}
                         for k, vals in cols.items()]}


def test_compare_through_the_column_correlation():
    ind = REF["independent_data"]
    # ragged columns: the 12 pairs of B are padded with blanks
    padded = {k: v + [None] * (15 - len(v)) for k, v in ind.items()}
    res = api.analyze({"analysis": "correlation",
                       "data": _column_table(padded),
                       "options": {"dataset_a": 0, "dataset_b": 1,
                                   "compare": {"dataset_c": 2,
                                               "dataset_d": 3,
                                               "design": "independent"}}})
    c = res["comparison"]
    ref = REF["independent"]
    assert c["test"] == "fisher_z_independent"
    assert c["z"] == pytest.approx(ref["z"], rel=1e-9)
    assert c["p_two_tailed"] == pytest.approx(ref["p"], rel=1e-9)
    assert c["second"]["n"] == 12
    assert c["labels"] == ["Dose A vs. Response A", "Dose B vs. Response B"]
    # dependent, overlapping: SBP vs Age against SBP vs BMI
    data = _column_table({k: TAB[k] for k in ("Age", "SBP", "BMI",
                                              "Cholesterol")})
    res = api.analyze({"analysis": "correlation", "data": data,
                       "options": {"dataset_a": 1, "dataset_b": 0,
                                   "compare": {"dataset_c": 1, "dataset_d": 2,
                                               "design": "dependent"}}})
    c = res["comparison"]
    ref = REF["dependent"]["overlapping"]
    assert c["test"] == "steiger_overlapping"
    assert c["z"] == pytest.approx(ref["z"], rel=1e-9)
    assert c["p_two_tailed"] == pytest.approx(ref["p"], rel=1e-9)
    # the XY layout (web compareCorr.ts): X = Age shared, Y = SBP and BMI
    xy = _column_table({k: TAB[k] for k in ("Age", "SBP", "BMI")})
    res = api.analyze({"analysis": "correlation", "data": xy,
                       "options": {"dataset_a": 0, "dataset_b": 1,
                                   "compare": {"dataset_c": 0, "dataset_d": 2,
                                               "design": "dependent"}}})
    ref = REF["dependent"]["overlapping_age"]
    assert res["comparison"]["z"] == pytest.approx(ref["z"], rel=1e-9)
    assert res["comparison"]["p_two_tailed"] == pytest.approx(ref["p"],
                                                              rel=1e-9)
    assert res["comparison"]["labels"] == ["Age vs. SBP", "Age vs. BMI"]
    # non-overlapping: SBP vs Age against BMI vs Cholesterol
    res = api.analyze({"analysis": "correlation", "data": data,
                       "options": {"dataset_a": 1, "dataset_b": 0,
                                   "compare": {"dataset_c": 2, "dataset_d": 3,
                                               "design": "dependent"}}})
    assert res["comparison"]["z"] == pytest.approx(
        REF["dependent"]["nonoverlapping"]["z"], rel=1e-9)
    # a shared data set cannot be independent; Spearman is refused
    bad = api.analyze({"analysis": "correlation", "data": data,
                       "options": {"dataset_a": 1, "dataset_b": 0,
                                   "compare": {"dataset_c": 1, "dataset_d": 2,
                                               "design": "independent"}}})
    assert "share a data set" in bad["comparison"]["error"]
    sp = api.analyze({"analysis": "correlation", "data": data,
                      "options": {"dataset_a": 1, "dataset_b": 0,
                                  "method": "spearman",
                                  "compare": {"dataset_c": 2, "dataset_d": 3,
                                              "design": "dependent"}}})
    assert "Pearson" in sp["comparison"]["error"]
    same = api.analyze({"analysis": "correlation", "data": data,
                        "options": {"dataset_a": 1, "dataset_b": 0,
                                    "compare": {"dataset_c": 0, "dataset_d": 1,
                                                "design": "dependent"}}})
    assert "same pair" in same["comparison"]["error"]
    # a row missing one value of the four is left out of the dependent test
    holes = {k: list(TAB[k]) for k in ("Age", "SBP", "BMI", "Cholesterol")}
    holes["Cholesterol"][5] = None
    res = api.analyze({"analysis": "correlation",
                       "data": _column_table(holes),
                       "options": {"dataset_a": 1, "dataset_b": 0,
                                   "compare": {"dataset_c": 2, "dataset_d": 3,
                                               "design": "dependent"}}})
    assert res["comparison"]["n"] == 23
    assert res["comparison"]["rows_left_out"] == 1
    assert math.isfinite(res["comparison"]["z"])
