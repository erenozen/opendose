"""P-94: assay precision (repeatability, between-run, between-day, total)
and recovery (opendose.precision).

References (engine/tests/reference/assay_precision.py,
assay_precision.json): VCA's published unit-test values (SAS 9.2
reference) on CLSI EP05-A2 dataEP05A2_1; statsmodels Type I mean squares
turned into EP05-A3 components by hand; statsmodels MixedLM REML; the
recovery and repeatability coefficient by hand. R is not installed.
"""
import csv
import json
import math
import os

import pytest

from opendose import api, precision

HERE = os.path.dirname(os.path.abspath(__file__))
REF = json.load(open(os.path.join(HERE, "reference", "assay_precision.json")))
ROWS = list(csv.DictReader(open(os.path.join(HERE, "fixtures", "vca_dataEP05A2_1.csv"))))
Y = [float(r["y"]) for r in ROWS]
DAY = [r["day"] for r in ROWS]
RUN = [r["run"] for r in ROWS]


def comps(res):
    c = res["components"]
    return {"total": c["total"], "day": c["between_day"], "run": c["between_run"],
            "error": c["repeatability"]}


def test_acceptance_vca_dataEP05A2_1_balanced():
    """Repeatability, between-run and total as VCA (SAS reference)."""
    pub = REF["published_vca"]["balanced"]
    res = precision.variance_components(Y, RUN, DAY)
    c = comps(res)
    for k in ("total", "day", "run", "error"):
        assert round(c[k]["variance"], 6) == pub[k]
        assert round(c[k]["variance_ci"][0], 4) == pub[f"ci_{k}"][0]
        assert round(c[k]["variance_ci"][1], 4) == pub[f"ci_{k}"][1]
    hand = REF["by_hand"]
    assert c["total"]["df_satterthwaite"] == pytest.approx(hand["df_total"], rel=1e-10)
    assert c["total"]["variance_ci"] == pytest.approx(hand["ci_total"], rel=1e-10)
    assert c["error"]["variance_ci"] == pytest.approx(hand["ci_error"], rel=1e-10)
    assert c["total"]["cv_percent"] == pytest.approx(hand["cv_percent"]["total"], rel=1e-10)
    assert c["error"]["cv_percent"] == pytest.approx(hand["cv_percent"]["error"], rel=1e-10)
    assert res["repeatability_coefficient"] == pytest.approx(hand["repeatability_coefficient"], rel=1e-12)
    # SD and CV intervals are the square roots of the variance interval
    assert c["total"]["sd_ci"][1] == pytest.approx(math.sqrt(pub["ci_total"][1]), rel=1e-4)
    assert c["error"]["cv_ci"][0] == pytest.approx(100 * c["error"]["sd_ci"][0] / res["mean"])
    assert [r["df"] for r in res["anova"]] == [19, 20, 40]
    assert sum(x["percent_of_total"] for x in (c["day"], c["run"], c["error"])) == pytest.approx(100.0)


def test_unbalanced_vca():
    pub = REF["published_vca"]["unbalanced"]
    drop = set(pub["removed_rows_1based"])
    keep = [i for i in range(len(Y)) if i + 1 not in drop]
    res = precision.variance_components([Y[i] for i in keep], [RUN[i] for i in keep],
                                        [DAY[i] for i in keep])
    c = comps(res)
    for k in ("total", "day", "run", "error"):
        assert round(c[k]["variance"], 6) == pub[k]


def test_two_level_run_replicate():
    """Runs only: the one-way random model (ANOVA = REML when balanced)."""
    ref = REF["two_level"]
    runs = [f"{d}/{r}" for d, r in zip(DAY, RUN)]
    res = precision.variance_components(Y, runs)
    c = res["components"]
    assert res["design"] == "run / replicate" and res["n_runs"] == 40
    assert c["between_run"]["variance"] == pytest.approx(ref["run_variance_anova"], rel=1e-12)
    assert c["repeatability"]["variance"] == pytest.approx(ref["error_variance_anova"], rel=1e-12)
    assert c["between_run"]["variance"] == pytest.approx(ref["run_variance_reml"], rel=1e-3)
    assert c["repeatability"]["variance"] == pytest.approx(ref["error_variance_reml"], rel=1e-4)
    assert "between_day" not in c


def test_recovery_and_acceptance():
    ref = REF["recovery"]
    recs = ref["records"]
    out = api.analyze({"analysis": "precision_study", "data": {"samples": [
        {"name": "QC mid", "values": [r["y"] for r in recs], "runs": [r["run"] for r in recs],
         "nominal": ref["nominal"]}]}, "options": {"recovery_limit": 15, "cv_limit": 15}})
    s = out["samples"][0]
    assert s["recovery"]["recovery_percent"] == pytest.approx(ref["recovery_percent"], rel=1e-12)
    assert s["recovery"]["recovery_ci"] == pytest.approx(ref["recovery_ci"], rel=1e-10)
    assert s["components"]["repeatability"]["cv_percent"] == pytest.approx(ref["cv_within"], rel=1e-10)
    assert s["components"]["total"]["cv_percent"] == pytest.approx(ref["cv_total"], rel=1e-10)
    assert s["recovery"]["accepted"] is True
    assert s["recovery"]["bias_percent"] == pytest.approx(ref["recovery_percent"] - 100)
    # a tighter limit fails the accuracy and says which part failed
    tight = api.analyze({"analysis": "precision_study", "data": {"samples": [
        {"name": "QC mid", "values": [r["y"] for r in recs], "runs": [r["run"] for r in recs],
         "nominal": ref["nominal"]}]}, "options": {"recovery_limit": 2, "cv_limit": 3}})
    t = tight["samples"][0]["recovery"]
    assert t["accuracy_accepted"] is False and t["precision_accepted"] is False and t["accepted"] is False


def test_negative_component_is_reported_as_zero_with_a_sentence():
    # runs that differ less than the replicates within them
    y = [10.0, 12.0, 11.0, 11.0, 10.2, 11.8, 11.5, 10.5]
    runs = ["a", "a", "b", "b", "c", "c", "d", "d"]
    res = precision.variance_components(y, runs)
    br = res["components"]["between_run"]
    assert br["variance_raw"] < 0 and br["variance"] == 0.0 and br["negative"]
    assert br["cv_percent"] == 0.0
    assert res["warnings"][0].startswith("The between-run variance is estimated as negative")
    assert res["components"]["total"]["variance"] == pytest.approx(res["components"]["repeatability"]["variance"])


def test_records_layout_units_and_permutation():
    recs = [{"value": y, "run": r, "day": d, "sample": "QC"} for y, r, d in zip(Y, RUN, DAY)]
    a = api.analyze({"analysis": "precision_study", "data": {"records": recs}})["samples"][0]
    scaled = [{**r, "value": r["value"] * 1000} for r in reversed(recs)]
    b = api.analyze({"analysis": "precision_study", "data": {"records": scaled}})["samples"][0]
    for k in ("repeatability", "between_run", "between_day", "total"):
        assert b["components"][k]["variance"] == pytest.approx(a["components"][k]["variance"] * 1e6, rel=1e-9)
        assert b["components"][k]["cv_percent"] == pytest.approx(a["components"][k]["cv_percent"], rel=1e-9)
    # extreme magnitudes keep the CVs
    tiny = api.analyze({"analysis": "precision_study", "data": {"records": [
        {**r, "value": r["value"] * 1e-12} for r in recs]}})["samples"][0]
    assert tiny["components"]["total"]["cv_percent"] == pytest.approx(a["components"]["total"]["cv_percent"], rel=1e-8)


@pytest.mark.parametrize("values,runs,days,msg", [
    ([1.0, 2.0, 3.0], ["a", "a", "a"], None, "need at least 2 runs"),
    ([1.0, 2.0], ["a", "b"], None, "each run holds one value"),
    ([1.0, 2.0, 1.5, 2.5], ["a", "a", "b", "b"], ["d1"] * 4, "need at least 2 days"),
    ([1.0, 2.0, 1.5, 2.5], ["a", "a", "b", "b"], ["d1", "d1", "d2", "d2"], "need more runs than days"),
])
def test_design_errors(values, runs, days, msg):
    with pytest.raises(ValueError, match=msg):
        precision.variance_components(values, runs, days)


def test_errors_and_missing_values_per_sample():
    out = api.analyze({"analysis": "precision_study", "data": {"samples": [
        {"name": "one run", "values": [1, 2, 3], "runs": ["a", "a", "a"]},
        {"name": "ok", "values": [1, 2, "x", 1.5, 2.6, None], "runs": ["a", "a", "a", "b", "b", "b"],
         "nominal": 0}]}})
    assert out["samples"][0]["error"] == "need at least 2 runs"
    ok = out["samples"][1]
    assert ok["n"] == 4 and ok["warnings"][0] == "1 value without a number, a run or a day left out."
    assert ok["recovery"]["error"] == "the nominal concentration must be above 0"


def test_all_values_equal_gives_zero_not_nan():
    res = precision.variance_components([5.0] * 6, ["a", "a", "b", "b", "c", "c"])
    c = res["components"]
    assert c["repeatability"]["variance"] == 0.0 and c["total"]["cv_percent"] == 0.0
    assert not any(math.isnan(v) for v in c["total"]["variance_ci"])


def test_elisa_qc_precision_from_back_calculated_concentrations():
    """The standard-curve module's report: QC concentrations from four
    plates (2 days x 2 runs, triplicates); CVs and recovery against the
    EP05-A3 formulas on statsmodels' mean squares; negative components
    reported as zero."""
    el = REF["elisa"]
    for name, ref in el["samples"].items():
        rows = [c for c in el["concentrations"] if c["sample"] == name]
        out = api.analyze({"analysis": "precision_study", "data": {"samples": [{
            "name": name, "values": [r["y"] for r in rows], "runs": [r["plate"] for r in rows],
            "days": [r["day"] for r in rows], "nominal": ref["nominal"]}]}})
        s = out["samples"][0]
        c = s["components"]
        assert s["n_runs"] == 4 and s["n_days"] == 2
        assert c["repeatability"]["cv_percent"] == pytest.approx(ref["cv_repeatability"], rel=1e-9)
        assert c["total"]["cv_percent"] == pytest.approx(ref["cv_total"], rel=1e-9)
        assert c["between_run"]["cv_percent"] == pytest.approx(ref["cv_between_run"], rel=1e-9, abs=1e-12)
        assert c["between_day"]["cv_percent"] == pytest.approx(ref["cv_between_day"], rel=1e-9, abs=1e-12)
        assert c["between_run"]["negative"] is ref["run_negative"]
        assert c["between_day"]["negative"] is ref["day_negative"]
        assert s["recovery"]["recovery_percent"] == pytest.approx(ref["recovery_percent"], rel=1e-12)
