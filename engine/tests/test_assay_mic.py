"""MIC by broth microdilution (assay_mic).

The MIC reading (lowest concentration from which every higher well shows
no growth; one skipped well read at the higher MIC, more than one not
read; CLSI M07), the modal strain MIC and MIC50 / MIC90 ranks (CLSI M39)
are checked against hand readings; the IC50 against a curve with a known
IC50."""

import math

import numpy as np
import pytest

from opendose import api, assay_mic as am

X = [0, 0.25, 0.5, 1, 2, 4, 8, 16]


def _strain(name, *series):
    """series: OD per row (X order) for each dilution series."""
    return {"name": name, "ys": [list(r) for r in zip(*series)]}


def test_mic_read_by_hand_with_blank_and_percent_threshold():
    # growth control 1.05, blank 0.05 -> GC 1.0; no growth at <= 10%
    od = [1.05, 1.0, 0.95, 0.6, 0.16, 0.14, 0.06, 0.05]
    res = am.mic(X, [_strain("E. coli", od)], blank=0.05)
    s = res["series"][0]
    assert s["growth_control"] == pytest.approx(1.0)
    assert [w["growth"] for w in s["wells"]] == pytest.approx(
        [95, 90, 55, 11, 9, 1, 0])
    # 2 is 11% (growth), 4 is 9% (no growth): MIC 4
    assert s["mic"] == {"value": 4, "qualifier": "="}
    assert s["mic_label"] == "4" and s["valid"] and s["skipped_wells"] == 0
    # 80% inhibition instead of 90%: 2 (11%) counts as no growth -> MIC 2
    res80 = am.mic(X, [_strain("E. coli", od)], blank=0.05, threshold=20)
    assert res80["series"][0]["mic_label"] == "2"


def test_od_cutoff_mode():
    od = [0.9, 0.8, 0.7, 0.5, 0.3, 0.12, 0.08, 0.05]
    res = am.mic(X, [_strain("S", od)], threshold_mode="od", od_cutoff=0.1)
    assert res["series"][0]["mic_label"] == "8"


def test_off_scale_mics():
    grows = [1.0] * 8
    clear = [1.0] + [0.01] * 7
    res = am.mic(X, [_strain("R", grows), _strain("S", clear)])
    assert res["strains"][0]["mic_label"] == "> 16"
    assert res["strains"][1]["mic_label"] == "≤ 0.25"


def test_skipped_wells():
    # one skipped well (no growth at 0.5, growth at 1): read the higher MIC
    one = [1.0, 1.0, 0.02, 0.9, 0.03, 0.02, 0.02, 0.02]
    # two skipped wells: not read
    two = [1.0, 0.02, 0.9, 0.02, 0.8, 0.02, 0.02, 0.02]
    res = am.mic(X, [_strain("A", one, two)])
    a, b = res["series"]
    assert a["mic_label"] == "2" and a["skipped_wells"] == 1 and a["valid"]
    assert "skipped_well" in a["flags"]
    assert b["skipped_wells"] == 2 and not b["valid"]
    assert res["strains"][0]["mic_label"] == "2"      # from the valid series only
    assert any("one skipped well" in w for w in res["warnings"])
    assert any("more than one skipped well" in w for w in res["warnings"])


def test_growth_control_must_grow_and_strain_mean_fallback():
    dead = [0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02]
    res = am.mic(X, [_strain("A", dead)], blank=0.02)
    s = res["series"][0]
    assert s["mic"] is None and not s["valid"]
    assert "growth_control_did_not_grow" in s["flags"]
    # a series without its own growth-control well uses the strain's mean
    ok = [1.0, 1.0, 1.0, 0.5, 0.05, 0.05, 0.05, 0.05]
    nogc = [None, 1.0, 1.0, 0.5, 0.05, 0.05, 0.05, 0.05]
    res2 = am.mic(X, [_strain("A", ok, nogc)])
    assert "growth_control_from_strain_mean" in res2["series"][1]["flags"]
    assert res2["series"][1]["mic_label"] == "2"


def test_modal_strain_mic_ties_go_up_and_essential_agreement():
    def series(mic_index):
        return [1.0] + [1.0 if i < mic_index else 0.02 for i in range(7)]
    # replicate MICs 2, 2, 4 -> 2; 2, 4 -> 4 (tie, higher); 0.5 and 4 -> wide
    res = am.mic(X, [_strain("A", series(3), series(3), series(4)),
                     _strain("B", series(3), series(4)),
                     _strain("C", series(1), series(4))])
    mics = {s["strain"]: s for s in res["strains"]}
    assert mics["A"]["mic_label"] == "2"
    assert mics["B"]["mic_label"] == "4"
    assert mics["A"]["dilution_spread"] == pytest.approx(1)
    assert mics["A"]["within_one_dilution"]
    assert not mics["C"]["within_one_dilution"]
    assert any("more than one doubling dilution" in w for w in res["warnings"])


def test_mic50_and_mic90_ranks():
    # ten strains with MICs <=0.25 0.5 0.5 1 1 1 2 4 8 >16
    idx = [0, 1, 1, 2, 2, 2, 3, 4, 5, None]
    strains = []
    for k, i in enumerate(idx):
        od = [1.0] + ([1.0] * 7 if i is None else
                      [1.0 if j < i else 0.02 for j in range(7)])
        strains.append(_strain(f"S{k}", od))
    res = am.mic(X, strains, fit_ic50=False)
    c = res["cumulative"]
    assert c["n_strains"] == 10
    # rank ceil(0.5*10) = 5th -> 1; ceil(0.9*10) = 9th -> 8
    assert c["mic50_label"] == "1" and c["mic90_label"] == "8"
    assert c["range"] == ["≤ 0.25", "> 16"]   # the lowest strain is clear at every dose
    assert not any("at least 10 isolates" in w for w in res["warnings"])
    few = am.mic(X, strains[:4], fit_ic50=False)
    assert any("at least 10 isolates" in w for w in few["warnings"])


def test_ic50_from_a_known_curve():
    ic50, hill = 2.0, 1.5
    conc = np.array(X[1:])
    ods = []
    rng = np.random.default_rng(5)
    for _ in range(3):
        g = 1.0 / (1 + (conc / ic50) ** hill)
        ods.append([1.0] + list(g + rng.normal(0, 0.01, g.size)))
    res = am.mic(X, [_strain("A", *ods)])
    fit = res["strains"][0]["ic50"]
    assert fit["value"] == pytest.approx(ic50, rel=0.05)
    assert fit["ci"][0] < ic50 < fit["ci"][1]
    assert not fit["outside_range"]
    assert len(fit["curve"]["concentration"]) == 120
    # the mean % growth curve per concentration
    curve = res["strains"][0]["curve"]
    assert [c["concentration"] for c in curve] == X[1:]
    assert curve[3]["mean"] == pytest.approx(100 / (1 + 1), abs=2)   # at 2 = IC50


def test_input_checks():
    with pytest.raises(ValueError, match="no drug concentrations"):
        am.mic([0, 0], [_strain("A", [1, 1])])
    with pytest.raises(ValueError, match="negative"):
        am.mic([-1, 1], [_strain("A", [1, 1])])
    with pytest.raises(ValueError, match="OD cut-off"):
        am.mic(X, [_strain("A", [1.0] * 8)], threshold_mode="od")
    with pytest.raises(ValueError, match="threshold"):
        am.mic(X, [_strain("A", [1.0] * 8)], threshold=100)


def test_api_route():
    od = [1.0, 1.0, 0.95, 0.6, 0.16, 0.05, 0.05, 0.05]
    res = api.analyze({"analysis": "mic", "data": {"x": X, "datasets": [_strain("A", od)]},
                       "options": {"threshold": 10}})
    assert res["strains"][0]["mic_label"] == "4"
    assert math.isfinite(res["strains"][0]["ic50"]["value"])
