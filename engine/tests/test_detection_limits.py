"""Limits of blank, detection and quantification (FEATURE-PLAN P-29).

Pinned to engine/tests/reference/detection_limits.py: CLSI EP17-A2 /
Armbruster & Pry (2008, Clin Biochem Rev 29 Suppl 1:S49) formulas by
hand with Python's statistics module, and an independent scipy
curve_fit 4PL with its closed-form inverse for the concentrations.
"""

import json
import math
import statistics as st
from pathlib import Path

import pytest

from opendose import api, assay_stdcurve as sc

REF = json.loads((Path(__file__).parent / "reference"
                  / "detection_limits.json").read_text())
D = REF["data"]


def _standards(scale_signal=1.0, scale_conc=1.0, blanks=None):
    blanks = D["blanks"] if blanks is None else blanks
    std = [{"concentration": c * scale_conc,
            "signals": [v * scale_signal for v in reps]}
           for c, reps in zip(D["concentrations"], D["standards"])]
    std.insert(0, {"concentration": 0,
                   "signals": [v * scale_signal for v in blanks]})
    return std


def _run(scale_signal=1.0, scale_conc=1.0, low=None, blanks=None, **kw):
    blanks = D["blanks"] if blanks is None else blanks
    low = [{"name": "Low", "signals": D["low"]}] if low is None else low
    return sc.standard_curve_qc(
        _standards(scale_signal, scale_conc, blanks), [],
        blank="zero_standard",
        lod_blanks=[v * scale_signal for v in blanks],
        lod_samples=[{"name": s["name"],
                      "signals": [v * scale_signal for v in s["signals"]]}
                     for s in low], **kw)


def test_acceptance_lob_lod_in_signal_and_concentration():
    res = _run()
    dl = res["detection_limits"]
    assert dl["method"] == "parametric"
    assert dl["n_blank"] == 20 and dl["n_low"] == 20 and dl["k_low"] == 1
    assert dl["mean_blank"] == pytest.approx(REF["mean_blank"], rel=1e-12)
    assert dl["sd_blank"] == pytest.approx(REF["sd_blank"], rel=1e-12)
    assert dl["sd_low"] == pytest.approx(REF["sd_low"], rel=1e-12)
    # LoB = mean_blank + 1.645 SD_blank; LoD = LoB + 1.645 SD_low
    assert dl["lob_signal"] == pytest.approx(REF["lob_signal"], rel=1e-12)
    assert dl["lod_signal"] == pytest.approx(REF["lod_signal"], rel=1e-12)
    assert dl["lob_signal"] == pytest.approx(0.070596, abs=5e-7)
    assert dl["lod_signal"] == pytest.approx(0.080301, abs=5e-7)
    # back-transformed through the fitted curve (independent fit + inverse)
    assert dl["lob"]["concentration"] == pytest.approx(REF["lob_conc"], rel=1e-4)
    assert dl["lod"]["concentration"] == pytest.approx(REF["lod_conc"], rel=1e-4)
    assert round(dl["lob"]["concentration"], 3) == 2.005
    assert round(dl["lod"]["concentration"], 3) == 2.972
    # both below the lowest standard (7.81): flagged as extrapolated
    assert dl["lob"]["status"] == dl["lod"]["status"] == "extrapolated"
    # LoQ: the low sample (CV 8.3%) meets the 20% goal, above the LoD
    assert dl["loq"]["concentration"] == pytest.approx(REF["loq_conc"], rel=1e-4)
    assert dl["low_samples"][0]["cv_concentration_pct"] == pytest.approx(
        REF["low_cv_pct"], rel=1e-3)
    # fewer than the 60 replicates EP17-A2 asks for: said next to it
    assert any("60 blank and 60 low-sample" in n for n in dl["notes"])


def test_api_path_and_c_beta_correction():
    payload = {"analysis": "stdcurve_qc",
               "data": {"standards": _standards(), "unknowns": [],
                        "lod_blanks": D["blanks"],
                        "lod_samples": [{"name": "Low", "signals": D["low"]}]},
               "options": {"blank": "zero_standard", "lod_c_beta": True}}
    dl = api.analyze(payload)["detection_limits"]
    assert dl["c_beta_correction"] is True
    assert dl["multiplier_low"] == pytest.approx(REF["c_beta"], rel=1e-12)
    assert dl["lod_signal"] == pytest.approx(REF["lod_signal_c_beta"], rel=1e-12)
    assert dl["lod"]["concentration"] == pytest.approx(REF["lod_conc_c_beta"], rel=1e-4)
    assert round(dl["lod"]["concentration"], 3) == 2.985


def test_no_lod_data_leaves_the_result_unchanged():
    res = sc.standard_curve_qc(_standards(), [], blank="zero_standard")
    assert "detection_limits" not in res


def test_pooled_sd_over_several_low_samples():
    a = [0.11, 0.12, 0.115, 0.118]
    b = [0.15, 0.16, 0.152]
    dl = _run(low=[{"name": "L1", "signals": a}, {"name": "L2", "signals": b}])[
        "detection_limits"]
    pooled = math.sqrt((3 * st.variance(a) + 2 * st.variance(b)) / (7 - 2))
    assert dl["sd_low"] == pytest.approx(pooled, rel=1e-12)
    assert dl["n_low"] == 7 and dl["k_low"] == 2
    # LoQ: the lowest sample meeting the goal
    assert dl["loq"]["sample"] == "L1"


def test_decreasing_curve_limits_go_down():
    # competitive format: signal falls with concentration
    std = [{"concentration": c, "signals": [2.7 - v for v in reps]}
           for c, reps in zip(D["concentrations"], D["standards"])]
    blanks = [2.7 - v for v in D["blanks"]]
    low = [2.7 - v for v in D["low"]]
    res = sc.standard_curve_qc(std, [], lod_blanks=blanks,
                               lod_samples=[{"name": "Low", "signals": low}])
    dl = res["detection_limits"]
    assert dl["direction"] == "decreasing"
    assert dl["lob_signal"] == pytest.approx(
        st.mean(blanks) - 1.645 * st.stdev(blanks), rel=1e-12)
    assert dl["lod_signal"] == pytest.approx(
        dl["lob_signal"] - 1.645 * st.stdev(low), rel=1e-12)


@pytest.mark.parametrize("blanks,msg", [
    ([], "at least 2 blank replicates (0 given)"),
    ([0.06], "at least 2 blank replicates (1 given)"),
])
def test_too_few_blanks(blanks, msg):
    res = sc.standard_curve_qc(_standards(blanks=[0.06, 0.061]), [],
                               blank="zero_standard", lod_blanks=blanks,
                               lod_samples=[{"name": "Low",
                                             "signals": D["low"]}])
    dl = res["detection_limits"]
    assert dl["lob_signal"] is None and dl["lod_signal"] is None
    assert dl["lob"]["status"] == "undefined"
    assert any(msg in n for n in dl["notes"])


def test_equal_blanks_and_single_low_replicate():
    dl = _run(blanks=[0.06] * 5, low=[{"name": "Low", "signals": [0.12]}])[
        "detection_limits"]
    assert dl["sd_blank"] == 0 and dl["lob_signal"] == pytest.approx(0.06)
    assert any("SD 0" in n for n in dl["notes"])
    assert dl["lod_signal"] is None
    assert any("low-level sample with at least 2" in n for n in dl["notes"])
    assert dl["low_samples"][0]["reason"] == "one replicate: no CV"
    assert dl["loq"] is None


def test_no_low_samples():
    dl = _run(low=[])["detection_limits"]
    assert dl["lob_signal"] is not None and dl["lod_signal"] is None
    assert dl["loq"] is None


def test_lob_below_the_curve_bottom():
    # Bottom held well above the blank-subtracted LoB: no crossing
    res = _run(constraints={"Bottom": 0.05})
    dl = res["detection_limits"]
    assert dl["lob"]["concentration"] is None
    assert dl["lob"]["status"] == "below_curve"


def test_loq_not_reached_when_cv_over_goal():
    dl = _run(loq_cv_limit=5.0)["detection_limits"]
    assert dl["loq"] is None
    assert dl["low_samples"][0]["reason"] == "CV over 5%"
    assert any("lies above the samples tested" in n for n in dl["notes"])


@pytest.mark.parametrize("scale", [1e-12, 1e12])
def test_signal_scale_invariance(scale):
    base = _run()["detection_limits"]
    dl = _run(scale_signal=scale)["detection_limits"]
    assert dl["lob_signal"] == pytest.approx(base["lob_signal"] * scale, rel=1e-9)
    assert dl["lod_signal"] == pytest.approx(base["lod_signal"] * scale, rel=1e-9)
    assert dl["lod"]["concentration"] == pytest.approx(
        base["lod"]["concentration"], rel=1e-4)


def test_concentration_units_scale_the_limits():
    base = _run()["detection_limits"]
    dl = _run(scale_conc=1e-3)["detection_limits"]      # pg/mL -> ng/mL
    for k in ("lob", "lod"):
        assert dl[k]["concentration"] == pytest.approx(
            base[k]["concentration"] * 1e-3, rel=1e-4)
    assert dl["lob_signal"] == pytest.approx(base["lob_signal"], rel=1e-12)


def test_blank_order_does_not_matter():
    a = _run()["detection_limits"]
    b = _run(blanks=list(reversed(D["blanks"])))["detection_limits"]
    assert a["lob_signal"] == pytest.approx(b["lob_signal"], rel=1e-12)
    assert a["lod"]["concentration"] == pytest.approx(
        b["lod"]["concentration"], rel=1e-6)
