"""qPCR no-template and no-RT control checks (FEATURE-PLAN P-30).

MIQE (Bustin et al. 2009, Clin Chem 55:611) asks for NTC and no-RT
controls and their Cq values. The rules (a control well with a Cq has
amplified; a sample is affected when its Cq is within `min_delta`
cycles of the control's, default 5: 2^-5 = 3.1% of its template) are
checked on hand-built plates; every expected number below is a hand
subtraction of the plate's Cq values.
"""

import pytest

from opendose import api, assay_qpcr as q

GAPDH = {"CON-1": [17.9, 18.0, 18.1], "CON-2": [17.0, 17.1, 17.2],
         "LPS-1": [18.0, 18.1, 18.2], "LPS-2": [17.4, 17.5, 17.6]}
IL6 = {"CON-1": [27.3, 27.3, 27.3], "CON-2": [27.0, 27.0, 27.0],
       "LPS-1": [24.1, 24.1, 24.1], "LPS-2": [24.3, 24.3, 24.3]}


def _plate(controls=()):
    recs = []
    for target, block in (("GAPDH", GAPDH), ("IL6", IL6)):
        for s, cqs in block.items():
            for c in cqs:
                recs.append({"sample": s, "group": s.split("-")[0],
                             "target": target, "cq": c})
    recs.extend(controls)
    return recs


NTC_GAPDH_34 = [{"sample": "NTC", "group": "", "target": "GAPDH", "cq": "34"},
                {"sample": "NTC", "group": "", "target": "GAPDH",
                 "cq": "Undetermined"},
                {"sample": "NTC", "group": "", "target": "IL6",
                 "cq": "Undetermined"}]


def test_acceptance_ntc_amplified_for_gapdh_lists_its_samples():
    res = q.qpcr_analysis(_plate(NTC_GAPDH_34), reference_genes=["GAPDH"],
                          calibrator="CON")
    c = res["controls"]
    assert c["n_wells"] == 3
    assert len(c["flags"]) == 1
    f = c["flags"][0]
    assert (f["kind"], f["control"], f["target"], f["cq"]) == \
        ("ntc", "NTC", "GAPDH", 34.0)
    assert f["n_wells"] == 2 and f["n_amplified"] == 1
    assert [s["sample"] for s in f["samples"]] == \
        ["CON-1", "CON-2", "LPS-1", "LPS-2"]
    # 34 - 18.0, 34 - 17.1, 34 - 18.1, 34 - 17.5: all clear of 5 cycles
    assert [round(s["delta"], 6) for s in f["samples"]] == \
        [16.0, 16.9, 15.9, 16.5]
    assert f["n_affected"] == 0
    assert c["clean"] == [{"kind": "ntc", "control": "NTC", "target": "IL6",
                           "n_wells": 1}]
    assert any(w.startswith("NTC amplified for GAPDH (Cq 34, NTC)")
               for w in res["warnings"])
    # the NTC is not a sample, a group or a reference-stability sample
    assert "NTC" not in {r["sample"] for r in res["results"]}
    assert res["groups"] == ["CON", "LPS"]


def test_controls_leave_the_fold_changes_unchanged():
    base = q.qpcr_analysis(_plate(), reference_genes=["GAPDH"],
                           calibrator="CON")
    with_c = q.qpcr_analysis(_plate(NTC_GAPDH_34), reference_genes=["GAPDH"],
                             calibrator="CON")
    assert base["controls"] is None
    fb = base["per_target"][0]["groups"][1]["fold_change"]
    fc = with_c["per_target"][0]["groups"][1]["fold_change"]
    assert fc == fb
    # hand: dCq CON = (27.3-18)+(27-17.1) /2 = 9.6; LPS = (6.0+6.8)/2 = 6.4
    assert fb == pytest.approx(2 ** 3.2, rel=1e-12)


def test_no_rt_matched_to_its_sample_and_affected_within_5_cycles():
    ctl = [{"sample": "CON-1 no-RT", "group": "CON", "target": "GAPDH",
            "cq": 21.0},
           {"sample": "LPS-2-RT", "group": "LPS", "target": "IL6", "cq": 33.0}]
    res = q.qpcr_analysis(_plate(ctl), reference_genes=["GAPDH"],
                          calibrator="CON")
    flags = {f["control"]: f for f in res["controls"]["flags"]}
    a = flags["CON-1 no-RT"]
    assert a["kind"] == "no_rt"
    assert [s["sample"] for s in a["samples"]] == ["CON-1"]
    assert a["samples"][0]["delta"] == pytest.approx(3.0)    # 21 - 18
    assert a["samples"][0]["affected"] is True and a["n_affected"] == 1
    b = flags["LPS-2-RT"]
    assert [s["sample"] for s in b["samples"]] == ["LPS-2"]
    assert b["samples"][0]["delta"] == pytest.approx(8.7)    # 33 - 24.3
    assert b["n_affected"] == 0
    assert "CON-1 no-RT" not in {r["sample"] for r in res["results"]}


def test_thresholds_are_editable():
    # a Cq limit: the NTC at 34 no longer counts below 33
    res = q.qpcr_analysis(_plate(NTC_GAPDH_34), reference_genes=["GAPDH"],
                          calibrator="CON", control_max_cq=33)
    assert res["controls"]["flags"] == []
    assert res["controls"]["max_cq"] == 33
    # a wider margin of 16.6 cycles: CON-1 (16.0), LPS-1 (15.9), LPS-2 (16.5)
    res = q.qpcr_analysis(_plate(NTC_GAPDH_34), reference_genes=["GAPDH"],
                          calibrator="CON", control_min_delta=16.6)
    f = res["controls"]["flags"][0]
    assert [s["sample"] for s in f["samples"] if s["affected"]] == \
        ["CON-1", "LPS-1", "LPS-2"]
    with pytest.raises(ValueError, match="min_delta"):
        q.qpcr_analysis(_plate(NTC_GAPDH_34), reference_genes=["GAPDH"],
                        calibrator="CON", control_min_delta=-1)


def test_ntc_without_samples_of_its_target():
    ctl = [{"sample": "NTC", "target": "TNF", "cq": 30}]
    res = q.qpcr_analysis(_plate(ctl), reference_genes=["GAPDH"],
                          calibrator="CON")
    f = res["controls"]["flags"][0]
    assert f["target"] == "TNF" and f["samples"] == [] and f["n_affected"] == 0


def test_explicit_control_field_and_api_path():
    ctl = [{"sample": "Blank well 7", "group": "x", "target": "GAPDH",
            "cq": 31.5, "control": "ntc"}]
    res = api.analyze({"analysis": "qpcr", "data": {"records": _plate(ctl)},
                       "options": {"reference_genes": ["GAPDH"],
                                   "calibrator": "CON",
                                   "control_min_delta": 5}})
    f = res["controls"]["flags"][0]
    assert f["control"] == "Blank well 7" and f["cq"] == 31.5
    assert "x" not in res["groups"]
    # the reference check does not see the control either
    assert "error" not in res["reference_stability"]
    chk = api.analyze({"analysis": "qpcr_reference_check",
                       "data": {"records": _plate(ctl)},
                       "options": {"reference_genes": ["GAPDH"]}})
    assert "x" not in str(chk.get("groups", ""))


@pytest.mark.parametrize("name,kind", [
    ("NTC", "ntc"), ("ntc 2", "ntc"), ("NTC_3", "ntc"), ("No template", "ntc"),
    ("no-template control", "ntc"), ("H2O", None), ("Water", None),
    ("CON-1 no-RT", "no_rt"), ("CON-1-RT", "no_rt"), ("NRT", "no_rt"),
    ("RT- CON-1", "no_rt"), ("minus RT 2", "no_rt"), ("(no RT)", "no_rt"),
    ("CON-1", None), ("Short-1", None), ("Waterloo", None), ("NTCP", None),
    ("Part-3", None), ("RTX", None),
])
def test_control_names(name, kind):
    assert q.control_kind(name) == kind


def test_group_name_marks_a_control():
    assert q.control_kind("W12", "NTC") == "ntc"
    assert q.control_kind("S1", "Ctrl") is None
