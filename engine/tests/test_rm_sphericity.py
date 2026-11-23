"""P-40: Mauchly's test, the Huynh-Feldt epsilon and partial omega squared
in repeated-measures one-way and two-way ANOVA.

Reference values: engine/tests/reference/rm_sphericity.py (pingouin 0.7
sphericity / epsilon / rm_anova / mixed_anova, statsmodels anova_lm; the
Lecoutre Huynh-Feldt formula and effectsize's partial omega squared
written out from the sums of squares). R is not installed.
"""

import json
import math
import os

import numpy as np
import pytest

from opendose import api, repeated

REF = json.load(open(os.path.join(os.path.dirname(__file__), "reference",
                                  "rm_sphericity.json")))
REL = 1e-9


def _one_way_payload(rows, names):
    return {"datasets": [{"name": n, "ys": [[r[j]] for r in rows]}
                         for j, n in enumerate(names)]}


def _grouped_payload(cells, col_names):
    return {"datasets": [{"name": c, "ys": [row[j] for row in cells]}
                         for j, c in enumerate(col_names)]}


def test_one_way_matches_pingouin():
    ref = REF["one_way"]
    r = api.analyze({"analysis": "rm_anova", "options": {},
                     "data": _one_way_payload(ref["data"], ref["names"])})
    s = r["sphericity"]
    assert s["gg_epsilon"] == pytest.approx(ref["gg"], rel=REL)
    assert s["hf_epsilon"] == pytest.approx(ref["hf"], rel=REL)
    assert s["lb_epsilon"] == pytest.approx(ref["lb"], rel=REL)
    m = s["mauchly"]
    assert m["W"] == pytest.approx(ref["mauchly_W"], rel=1e-7)
    assert m["chi_square"] == pytest.approx(ref["mauchly_chi2"], rel=1e-9)
    assert m["df"] == ref["mauchly_df"] == 5
    assert m["p"] == pytest.approx(ref["mauchly_p"], rel=1e-7)
    t = r["table"]
    assert t["F"] == pytest.approx(ref["F"], rel=REL)
    # GG stays the P that is reported first, unchanged by Mauchly's P
    assert t["p_geisser_greenhouse"] == pytest.approx(ref["p_gg_pingouin"],
                                                      rel=1e-8)
    assert t["hf_epsilon"] == pytest.approx(ref["hf"], rel=REL)
    assert t["p_huynh_feldt"] == pytest.approx(ref["p_hf"], rel=1e-8)
    es = r["effect_size"]
    assert es["partial_omega_squared"] == pytest.approx(
        ref["partial_omega2"], rel=REL)
    assert es["partial_eta_squared"] == pytest.approx(ref["partial_eta2"],
                                                      rel=REL)
    assert es["ci_partial_omega_squared"] is None
    assert "not used to choose" in s["note"]
    assert "Lecoutre" in s["hf_formula"]


def test_one_way_hf_equals_lecoutre_with_one_group():
    ref = REF["one_way"]
    assert ref["hf"] == pytest.approx(ref["hf_lecoutre_g1"], rel=1e-12)


def test_both_factors_repeated_match_pingouin():
    ref = REF["both"]
    r = api.analyze({"analysis": "rm_two_way",
                     "options": {"design": "both",
                                 "row_names": ref["row_names"]},
                     "data": _grouped_payload(ref["cells"],
                                              ref["col_names"])})
    for key in ("row_factor", "column_factor", "interaction"):
        s, e = r["sphericity"][key], ref[key]
        assert r["sources"][key]["F"] == pytest.approx(e["F"], rel=REL)
        assert s["gg_epsilon"] == pytest.approx(e["gg"], rel=REL)
        assert s["hf_epsilon"] == pytest.approx(e["hf"], rel=REL)
        if e["mauchly_W"] is None:  # 2 levels: sphericity always holds
            assert s["mauchly"] is None and "always holds" in s[
                "mauchly_note"]
        else:
            assert s["mauchly"]["W"] == pytest.approx(e["mauchly_W"],
                                                      rel=1e-7)
            assert s["mauchly"]["p"] == pytest.approx(e["mauchly_p"],
                                                      rel=1e-7)
        assert r["effect_size"][key]["partial_omega_squared"] == \
            pytest.approx(e["partial_omega2"], rel=REL)
        src = r["sources"][key]
        df1, df2 = src["df"], src["error_df"]
        assert src["p_geisser_greenhouse"] == pytest.approx(
            float(__import__("scipy").stats.f.sf(
                e["F"], df1 * e["gg"], df2 * e["gg"])), rel=1e-8)


@pytest.mark.parametrize("name", ["mixed", "mixed_typed"])
def test_mixed_design_matches_pingouin_and_lecoutre(name):
    ref = REF[name]
    r = api.analyze({"analysis": "rm_two_way",
                     "options": {"design": "mixed",
                                 "row_names": ref["row_names"]},
                     "data": _grouped_payload(ref["cells"],
                                              ref["col_names"])})
    assert r["gg_epsilon"] == pytest.approx(ref["gg"], rel=REL)
    s = r["sphericity"]["row_factor"]
    assert s is r["sphericity"]["interaction"] or s == r["sphericity"][
        "interaction"]
    assert s["hf_epsilon"] == pytest.approx(ref["hf_lecoutre"], rel=REL)
    assert s["mauchly"]["W"] == pytest.approx(ref["mauchly_W"], rel=1e-7)
    assert s["mauchly"]["p"] == pytest.approx(ref["mauchly_p"], rel=1e-7)
    for key in ("row_factor", "interaction", "column_factor"):
        assert r["sources"][key]["F"] == pytest.approx(ref[key]["F"],
                                                       rel=1e-9)
        assert r["effect_size"][key]["partial_omega_squared"] == \
            pytest.approx(ref[key]["partial_omega2"], rel=1e-9, abs=1e-12)


def test_lecoutre_differs_from_the_1976_formula_with_groups():
    ref = REF["mixed_typed"]
    assert ref["hf_lecoutre"] < ref["hf_huynh_feldt_1976"] < 1


def test_mixed_model_with_complete_data_reports_the_same():
    ref = REF["one_way"]
    r = api.analyze({"analysis": "mixed_rm_oneway", "options": {},
                     "data": _one_way_payload(ref["data"], ref["names"])})
    s = r["sphericity"]
    assert s["hf_epsilon"] == pytest.approx(ref["hf"], rel=1e-9)
    assert s["mauchly"]["p"] == pytest.approx(ref["mauchly_p"], rel=1e-7)
    ref2 = REF["mixed_typed"]
    r2 = api.analyze({"analysis": "mixed_rm_twoway",
                      "options": {"design": "mixed"},
                      "data": _grouped_payload(ref2["cells"],
                                               ref2["col_names"])})
    assert r2["sphericity"]["row_factor"]["hf_epsilon"] == pytest.approx(
        ref2["hf_lecoutre"], rel=1e-9)


def test_mixed_model_with_missing_values_leaves_mauchly_out():
    ref = REF["one_way"]
    rows = [list(r) for r in ref["data"]]
    rows[2][1] = None
    r = api.analyze({"analysis": "mixed_rm_oneway", "options": {},
                     "data": _one_way_payload(rows, ref["names"])})
    assert r["sphericity"] is None
    assert r["gg_epsilon"] is not None


def test_two_levels_sphericity_always_holds():
    r = repeated.rm_one_way_anova([[1.0, 2.0, 3.5, 4.0], [2.0, 2.5, 5.0,
                                                          4.1]])
    s = r["sphericity"]
    assert (s["gg_epsilon"], s["hf_epsilon"]) == (1.0, 1.0)
    assert s["mauchly"] is None
    assert "always holds" in s["mauchly_note"]


def test_too_few_subjects_for_mauchly():
    # 3 subjects, 5 conditions: 2 residual df for 4 contrasts
    rng = np.random.default_rng(3)
    M = rng.normal(size=(3, 5)) + np.arange(5)
    r = repeated.rm_one_way_anova([list(c) for c in M.T])
    s = r["sphericity"]
    assert s["mauchly"] is None
    assert "needs more subjects" in s["mauchly_note"]
    assert s["hf_epsilon"] is None and "undefined" in s["hf_note"]
    assert r["table"]["p_huynh_feldt"] is None
    assert math.isfinite(r["table"]["p_geisser_greenhouse"])


def test_sphericity_is_invariant_to_units_and_order():
    ref = REF["one_way"]
    M = np.array(ref["data"])
    base = repeated.rm_one_way_anova([list(c) for c in M.T])["sphericity"]
    scaled = repeated.rm_one_way_anova(
        [list(c) for c in (M * 1e-9 + 3e-9).T])["sphericity"]
    perm = repeated.rm_one_way_anova(
        [list(c) for c in M[:, [2, 0, 3, 1]].T])["sphericity"]
    for other in (scaled, perm):
        assert other["gg_epsilon"] == pytest.approx(base["gg_epsilon"],
                                                    rel=1e-9)
        assert other["hf_epsilon"] == pytest.approx(base["hf_epsilon"],
                                                    rel=1e-9)
        assert other["mauchly"]["W"] == pytest.approx(base["mauchly"]["W"],
                                                      rel=1e-6)
    # partial omega^2 is unit free too
    a = repeated.rm_one_way_anova([list(c) for c in M.T])["effect_size"]
    b = repeated.rm_one_way_anova([list(c) for c in (M * 1e6).T])[
        "effect_size"]
    assert a["partial_omega_squared"] == pytest.approx(
        b["partial_omega_squared"], rel=1e-9)


def test_existing_values_unchanged():
    # the Geisser-Greenhouse epsilon and P are the ones computed before
    ref = REF["one_way"]
    M = np.array(ref["data"])
    r = repeated.rm_one_way_anova([list(c) for c in M.T])
    assert r["table"]["gg_epsilon"] == repeated._gg_epsilon(M)
