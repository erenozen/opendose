"""P-83: interaction contrasts in repeated-measures designs and custom
contrasts (planned, or post hoc with Scheffe's adjustment).

References: engine/tests/reference/rm_contrasts.py (rm_contrasts.json):
scipy t tests of the per-subject scores (the plan's identity),
pingouin.mixed_anova / rm_anova interaction F = t^2, statsmodels OLS of
the contrast scores and of cell means (t_test). R is not installed.
"""
import json
import math
import os

import pytest

from opendose import api, repeated, twoway_contrasts

HERE = os.path.dirname(os.path.abspath(__file__))
REF = json.load(open(os.path.join(HERE, "reference", "rm_contrasts.json")))


def mixed_payload(recs, rows=("Vehicle", "Drug"), groups=("WT", "KO"), key="genotype"):
    return {"datasets": [{"name": g, "ys": [[r[row] for r in recs if r[key] == g]
                                             for row in rows]} for g in groups]}


def rm(data, **options):
    return api.analyze({"analysis": "rm_two_way", "data": data, "options": options})


# ---------------------------------------------------------------- mixed

def test_acceptance_2x2_mixed_equals_t_test_of_differences():
    """Genotype between, drug within, 6 per group: 'Drug effect in KO
    minus drug effect in WT' with its CI is the pooled two-sample t test
    of the per-mouse drug effects; t^2 is the interaction F."""
    ref = REF["mixed_2x2"]
    res = rm(mixed_payload(ref["records"]), design="mixed", row_names=["Vehicle", "Drug"])
    c = res["interaction_contrasts"]["contrasts"][0]
    assert c["label"] == "(Drug - Vehicle) in KO minus (Drug - Vehicle) in WT"
    assert c["effect_in_col_1"] == pytest.approx(ref["effect_wt"], rel=1e-12)
    assert c["effect_in_col_2"] == pytest.approx(ref["effect_ko"], rel=1e-12)
    assert c["difference"] == pytest.approx(ref["difference"], rel=1e-12)
    assert c["se"] == pytest.approx(ref["se"], rel=1e-12)
    assert c["t"] == pytest.approx(ref["t"], rel=1e-12)
    assert c["df"] == ref["df"] == 10
    assert c["p"] == pytest.approx(ref["p"], rel=1e-10)
    assert c["ci"] == pytest.approx(ref["ci"], rel=1e-12)
    assert c["equals_interaction_test"] is True
    # t^2 = the mixed ANOVA's interaction F (engine and pingouin)
    assert c["F"] == pytest.approx(res["sources"]["interaction"]["F"], rel=1e-10)
    assert c["F"] == pytest.approx(ref["interaction_F_pingouin"], rel=1e-9)
    assert c["p"] == pytest.approx(ref["interaction_p_pingouin"], rel=1e-8)
    assert "no sphericity" in res["contrast_notes"][0]


def test_2x2_mixed_simple_effects():
    ref = REF["mixed_2x2"]
    res = rm(mixed_payload(ref["records"]), design="mixed", row_names=["Vehicle", "Drug"])
    drug = {b["within"]: b["differences"][0] for b in res["simple_effects_rows_within_columns"]}
    for g in ("WT", "KO"):
        r = ref["drug_within_genotype"][g]
        assert drug[g]["pair"] == "Drug - Vehicle"
        assert drug[g]["difference"] == pytest.approx(r["difference"], rel=1e-10)
        assert drug[g]["se"] == pytest.approx(r["se"], rel=1e-10)
        assert drug[g]["p"] == pytest.approx(r["p"], rel=1e-8)
    geno = {b["within"]: b["differences"][0] for b in res["simple_effects"]}
    for lev in ("Vehicle", "Drug"):
        r = ref["genotype_within_drug"][lev]
        assert geno[lev]["pair"] == "KO - WT"
        assert geno[lev]["difference"] == pytest.approx(r["difference"], rel=1e-10)
        assert geno[lev]["se"] == pytest.approx(r["se"], rel=1e-10)
        assert geno[lev]["p"] == pytest.approx(r["p"], rel=1e-8)


def test_3x2_mixed_each_sub_square_on_its_own_scores():
    ref = REF["mixed_3x2"]
    recs = ref["records"]
    data = mixed_payload(recs, rows=("T0", "T1", "T2"), groups=("Control", "Treated"), key="group")
    res = rm(data, design="mixed", row_names=["T0", "T1", "T2"])
    got = {tuple(c["rows"]): c for c in res["interaction_contrasts"]["contrasts"]}
    assert len(got) == 3
    for r in ref["contrasts"]:
        c = got[tuple(r["rows"])]
        assert c["difference"] == pytest.approx(r["difference"], rel=1e-10)
        assert c["se"] == pytest.approx(r["se"], rel=1e-10)
        assert c["df"] == r["df"]
        assert c["p"] == pytest.approx(r["p"], rel=1e-8)
        assert c["ci"] == pytest.approx(r["ci"], rel=1e-9)
        assert "equals_interaction_test" not in c
    # restricting the sub-squares
    one = rm(data, design="mixed", row_names=["T0", "T1", "T2"], interaction_rows=[0, 2])
    assert [c["rows"] for c in one["interaction_contrasts"]["contrasts"]] == [["T0", "T2"]]


# ----------------------------------------------------------------- both

def test_2x2_both_within_equals_one_sample_t_of_differences_of_differences():
    ref = REF["both_2x2"]
    recs = ref["records"]
    data = {"datasets": [{"name": t, "ys": [[r[f"{light}|{t}"] for r in recs]
                                            for light in ("Light", "Dark")]}
                         for t in ("Pre", "Post")]}
    res = rm(data, design="both", row_names=["Light", "Dark"])
    c = res["interaction_contrasts"]["contrasts"][0]
    assert c["label"] == "(Dark - Light) in Post minus (Dark - Light) in Pre"
    assert c["difference"] == pytest.approx(ref["difference"], rel=1e-12)
    assert c["se"] == pytest.approx(ref["se"], rel=1e-12)
    assert c["t"] == pytest.approx(ref["t"], rel=1e-12)
    assert c["df"] == 7
    assert c["p"] == pytest.approx(ref["p"], rel=1e-10)
    assert c["ci"] == pytest.approx(ref["ci"], rel=1e-12)
    assert c["F"] == pytest.approx(res["sources"]["interaction"]["F"], rel=1e-10)
    assert c["F"] == pytest.approx(ref["interaction_F_pingouin"], rel=1e-9)


# ------------------------------------------------- properties and edges

def test_swapping_the_two_groups_flips_the_sign_only():
    ref = REF["mixed_2x2"]
    a = rm(mixed_payload(ref["records"]), design="mixed", row_names=["Vehicle", "Drug"])
    b = rm(mixed_payload(ref["records"], groups=("KO", "WT")), design="mixed",
           row_names=["Vehicle", "Drug"])
    ca, cb = a["interaction_contrasts"]["contrasts"][0], b["interaction_contrasts"]["contrasts"][0]
    assert cb["difference"] == pytest.approx(-ca["difference"], rel=1e-12)
    assert cb["p"] == pytest.approx(ca["p"], rel=1e-12)
    # units: x 1000 scales the difference and SE, not t or P
    scaled = [{**r, "Vehicle": r["Vehicle"] * 1000, "Drug": r["Drug"] * 1000} for r in ref["records"]]
    s = rm(mixed_payload(scaled), design="mixed", row_names=["Vehicle", "Drug"])
    cs = s["interaction_contrasts"]["contrasts"][0]
    assert cs["difference"] == pytest.approx(1000 * ca["difference"], rel=1e-10)
    assert cs["t"] == pytest.approx(ca["t"], rel=1e-10)


def test_incomplete_subjects_are_left_out_as_in_the_anova():
    ref = REF["mixed_2x2"]
    data = mixed_payload(ref["records"])
    data["datasets"][0]["ys"][1][0] = None     # WT1 has no drug value
    res = rm(data, design="mixed", row_names=["Vehicle", "Drug"])
    assert res["n_subjects"] == 11
    assert res["interaction_contrasts"]["contrasts"][0]["df"] == 9


def test_no_scatter_in_the_scores_is_said_not_nan():
    data = {"datasets": [{"name": "A", "ys": [[1, 2, 3], [2, 3, 4]]},
                         {"name": "B", "ys": [[1, 5, 2], [3, 7, 4]]}]}
    res = repeated.rm_contrasts([[d["ys"][i] for d in data["datasets"]] for i in range(2)],
                                design="mixed")
    c = res["interaction_contrasts"]["contrasts"][0]
    assert c["difference"] == 1.0 and c["p"] is None and c["t"] is None
    assert c["note"].startswith("undefined")


def test_too_few_subjects_is_a_clear_error():
    data = {"datasets": [{"name": "A", "ys": [[1, 2], [2, 3.5]]},
                         {"name": "B", "ys": [[1], [3]]}]}
    with pytest.raises(ValueError, match="need >= 2 complete subjects per group"):
        repeated.rm_contrasts([[d["ys"][i] for d in data["datasets"]] for i in range(2)],
                              design="mixed")
    assert rm(data, design="mixed")["error"] == "need >= 2 complete subjects per group"


# ------------------------------------------------------ custom contrasts

def test_custom_contrasts_one_way_planned_and_scheffe():
    ref = REF["oneway_custom"]
    names = list(ref["groups"])
    specs = [{"name": c["name"], "coefficients": c["coefficients"], "planned": planned}
             for c in ref["contrasts"] for planned in (True, False)]
    out = api.analyze({"analysis": "anova", "data": {"datasets": [
        {"name": n, "ys": [[v] for v in ref["groups"][n]]} for n in names]},
        "options": {"custom_contrasts": specs}})
    got = out["custom_contrasts"]["contrasts"]
    for k, c in enumerate(ref["contrasts"]):
        planned, post = got[2 * k], got[2 * k + 1]
        for e in (planned, post):
            assert e["estimate"] == pytest.approx(c["estimate"], rel=1e-10)
            assert e["se"] == pytest.approx(c["se"], rel=1e-10)
            assert e["t"] == pytest.approx(c["t"], rel=1e-10)
            assert e["df"] == c["df"]
        assert planned["kind"] == "planned" and planned["adjustment"] == "none (planned)"
        assert planned["p"] == pytest.approx(c["p_planned"], rel=1e-8)
        assert planned["ci"] == pytest.approx(c["ci_planned"], rel=1e-9)
        assert post["kind"] == "post hoc" and post["adjustment"] == "Scheffe (2, 15 df)"
        assert post["F"] == pytest.approx(c["F_scheffe"], rel=1e-10)
        assert post["p"] == pytest.approx(c["p_scheffe"], rel=1e-8)
        assert post["ci"] == pytest.approx(c["ci_scheffe"], rel=1e-9)
        assert post["p"] > planned["p"]
    assert got[0]["label"] == "-2 × Vehicle + Drug A + Drug B"


def test_scheffe_of_the_maximal_contrast_is_the_anova_f_test():
    """Property: the contrast c_i = n_i (m_i - grand mean) attains the
    largest Scheffe F, which equals the one-way ANOVA F (Scheffe 1953)."""
    ref = REF["oneway_custom"]
    groups = list(ref["groups"].values())
    ns = [len(g) for g in groups]
    means = [sum(g) / len(g) for g in groups]
    grand = sum(sum(g) for g in groups) / sum(ns)
    c = [n * (m - grand) for n, m in zip(ns, means)]
    out = api.analyze({"analysis": "anova", "data": {"datasets": [
        {"name": n, "ys": [[v] for v in ref["groups"][n]]} for n in ref["groups"]]},
        "options": {"custom_contrasts": [{"coefficients": c, "planned": False}]}})
    e = out["custom_contrasts"]["contrasts"][0]
    assert e["F"] == pytest.approx(ref["anova_F"], rel=1e-9)
    assert e["p"] == pytest.approx(ref["anova_p"], rel=1e-7)
    assert e["name"] == "Contrast 1"


def test_custom_contrast_two_way_cells():
    ref = REF["twoway_custom"]
    recs = ref["records"]
    data = {"datasets": [{"name": col, "ys": [[r["y"] for r in recs if r["row"] == row and r["col"] == col]
                                               for row in ("WT", "KO")]}
                         for col in ("Vehicle", "Drug")]}
    out = api.analyze({"analysis": "two_way_anova", "data": data, "options": {
        "row_names": ["WT", "KO"],
        "custom_contrasts": [{"name": "dod", "coefficients": ref["coefficients"], "planned": False}]}})
    e = out["custom_contrasts"]["contrasts"][0]
    assert out["custom_contrasts"]["names"] == ["WT / Vehicle", "WT / Drug", "KO / Vehicle", "KO / Drug"]
    assert e["estimate"] == pytest.approx(ref["estimate"], rel=1e-10)
    assert e["se"] == pytest.approx(ref["se"], rel=1e-10)
    assert e["F"] == pytest.approx(ref["F_scheffe"], rel=1e-10)
    assert e["p"] == pytest.approx(ref["p_scheffe"], rel=1e-8)
    assert e["ci"] == pytest.approx(ref["ci_scheffe"], rel=1e-9)
    assert e["adjustment"] == "Scheffe (3, 12 df)"
    # the planned version of this 2 x 2 contrast is the interaction test
    out2 = api.analyze({"analysis": "two_way_anova", "data": data, "options": {
        "custom_contrasts": [{"coefficients": ref["coefficients"], "planned": True}]}})
    e2 = out2["custom_contrasts"]["contrasts"][0]
    assert e2["p"] == pytest.approx(ref["p_planned"], rel=1e-8)
    assert e2["t"] ** 2 == pytest.approx(out2["sources"]["interaction"]["F"], rel=1e-9)


@pytest.mark.parametrize("coef,msg", [
    ([1, 1, 1], "add up to 3, not 0"),
    ([1, -1], "2 coefficients for 3 means"),
    ([0, 0, 0], "every coefficient is 0"),
])
def test_custom_contrast_errors(coef, msg):
    out = twoway_contrasts.custom_contrasts([1.0, 2.0, 3.0], [3, 3, 3], 1.0, 6,
                                            [{"coefficients": coef}], names=["a", "b", "c"])
    assert msg in out["contrasts"][0]["error"]


def test_custom_contrast_empty_group_and_no_scatter():
    out = twoway_contrasts.custom_contrasts([1.0, None, 3.0], [3, 0, 3], 1.0, 4,
                                            [{"coefficients": [1, -1, 0]}, {"coefficients": [1, 0, -1]}],
                                            names=["a", "b", "c"])
    assert out["contrasts"][0]["error"] == "no values in b"
    assert out["contrasts"][1]["estimate"] == -2.0
    flat = twoway_contrasts.custom_contrasts([1.0, 3.0], [3, 3], 0.0, 4,
                                             [{"coefficients": [1, -1], "planned": True}], names=["a", "b"])
    assert flat["contrasts"][0]["p"] is None and "no scatter" in flat["contrasts"][0]["note"]
    assert not math.isnan(flat["contrasts"][0]["estimate"])
