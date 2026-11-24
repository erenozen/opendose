"""Dose-series planning (FEATURE-PLAN P-97, opendose.doseplan).

Acceptance: 8 half-log concentrations around an expected IC50 of 1 uM
(0.0178 to 56.2 uM), Hill -1, plateaus 100 and 0, SD 5 per well, in
triplicate: the expected 95% CI of LogIC50 is 0.2253 log10 units wide
(IC50 0.772 to 1.296 uM, a 1.68-fold range), both plateaus defined.
Shifted 1.5 log units up (0.562 to 1778 uM) the top plateau is missed:
the expected width grows to 1.449 log10 units (28-fold) and the top
plateau is flagged (Sebaugh 2011: at least two concentrations beyond
each bend point, the bend points at LogIC50 +/- log10(4.6805)/|Hill|;
Sebaugh & McCray 2003).

Independent values: engine/tests/reference/doseplan.py (scipy
curve_fit's covariance at the noise-free curve: the expected
information by finite differences; a curve_fit Monte Carlo of the
coverage and the median CI width).
"""

import json
import math
from pathlib import Path

import pytest

from opendose import doseplan as DP
from opendose.api import analyze

REF = json.loads((Path(__file__).parent / "reference" /
                  "doseplan.json").read_text())
BASE = dict(ic50=1.0, hill=-1.0, top=100.0, bottom=0.0, sd=5.0,
            replicates=3)
CENTRED = dict(top_dose=10 ** 1.75, n_doses=8, dilution=10 ** 0.5)
SHIFTED = dict(top_dose=10 ** 3.25, n_doses=8, dilution=10 ** 0.5)


class TestExpectedPrecision:
    def test_acceptance_centred(self):
        p = DP.plan(**BASE, **CENTRED)
        assert [round(math.log10(d), 6) for d in p["doses"]] == \
            REF["centred"]["log_doses"]
        ci = p["expected_ci"]
        assert ci["log_width"] == pytest.approx(REF["centred"]["log_width"],
                                                abs=1e-6)
        assert round(ci["log_width"], 4) == 0.2253
        assert round(ci["fold_width"], 2) == 1.68
        assert round(ci["lower"], 3) == 0.772 and round(ci["upper"], 3) == 1.296
        assert p["plateaus"]["top"]["defined"] and \
            p["plateaus"]["bottom"]["defined"]
        assert p["flags"] == []

    def test_acceptance_top_plateau_missed(self):
        a = DP.plan(**BASE, **CENTRED)
        b = DP.plan(**BASE, **SHIFTED)
        assert b["expected_ci"]["log_width"] == pytest.approx(
            REF["shifted"]["log_width"], abs=1e-6)
        assert round(b["expected_ci"]["log_width"], 3) == 1.449
        assert b["expected_ci"]["log_width"] > 6 * a["expected_ci"]["log_width"]
        assert not b["plateaus"]["top"]["defined"]
        assert b["plateaus"]["top"]["doses_beyond_bend"] == 0
        assert b["plateaus"]["bottom"]["defined"]
        assert [f["id"] for f in b["flags"]] == ["top_plateau"]
        assert "Sebaugh 2011" in b["flags"][0]["text"]

    def test_rising_curve_and_duplicates(self):
        p = DP.plan(ic50=1.0, hill=1.5, top=80, bottom=10, sd=4, replicates=2,
                    doses=[10 ** v for v in REF["rising"]["log_doses"]])
        assert p["expected_ci"]["log_width"] == pytest.approx(
            REF["rising"]["log_width"], abs=1e-6)
        # rising: the bottom plateau is at the low concentrations
        assert p["plateaus"]["bottom"]["end"] == "low concentrations"

    def test_bend_points(self):
        p = DP.plan(**BASE, **CENTRED)
        b = math.log10(4.6805)
        assert p["bend_points"]["log_low"] == pytest.approx(-b)
        assert p["bend_points"]["log_high"] == pytest.approx(b)
        frac = 1 / (1 + 4.6805)
        assert DP.curve(-b, 1, 0, 0, -1) == pytest.approx(1 - frac)

    def test_more_replicates_narrow_by_sqrt(self):
        a = DP.plan(**{**BASE, "replicates": 2}, **CENTRED)
        b = DP.plan(**{**BASE, "replicates": 8}, **CENTRED)
        assert b["se"]["log_ic50"] == pytest.approx(a["se"]["log_ic50"] / 2,
                                                    rel=1e-9)

    def test_unit_invariance(self):
        a = DP.plan(**BASE, **CENTRED)
        for s in (1e-12, 1e12):
            b = DP.plan(**{**BASE, "ic50": s}, top_dose=10 ** 1.75 * s,
                        n_doses=8, dilution=10 ** 0.5)
            assert b["expected_ci"]["log_width"] == pytest.approx(
                a["expected_ci"]["log_width"], rel=1e-9)
            c = DP.plan(**{**BASE, "top": 100 * s, "sd": 5 * s}, **CENTRED)
            assert c["expected_ci"]["log_width"] == pytest.approx(
                a["expected_ci"]["log_width"], rel=1e-9)

    def test_dose_order_does_not_matter(self):
        d = [10 ** v for v in REF["centred"]["log_doses"]]
        a = DP.plan(**BASE, doses=d)
        b = DP.plan(**BASE, doses=list(reversed(d)))
        assert a["expected_ci"] == b["expected_ci"]

    @pytest.mark.parametrize("kw,msg", [
        (dict(doses=[0, 1, 10]), "positive"),
        (dict(doses=[1, 1, 10]), "must differ"),
        (dict(doses=[]), "at least one"),
        (dict(top_dose=10, n_doses=8, dilution=1), "above 1"),
        (dict(doses=[1, 10], ic50=0), "positive concentration"),
        (dict(doses=[1, 10], hill=0), "cannot be 0"),
        (dict(doses=[1, 10], sd=0), "SD must be positive"),
        (dict(doses=[1, 10], top=5, bottom=5), "plateaus must differ"),
    ])
    def test_invalid(self, kw, msg):
        with pytest.raises(ValueError, match=msg):
            DP.plan(**{**BASE, **kw})

    def test_too_few_values_and_flat_range(self):
        p = DP.plan(**{**BASE, "replicates": 1}, doses=[0.1, 1, 10, 100])
        assert p["df"] == 0 and not p["estimable"]
        assert any(f["id"] == "too_few_points" for f in p["flags"])
        q = DP.plan(**BASE, doses=[1e6, 1e7, 1e8, 1e9])
        assert not q["estimable"]
        assert {f["id"] for f in q["flags"]} >= {"not_estimable",
                                                 "ic50_outside"}


class TestMonteCarlo:
    def test_coverage_and_width_against_curve_fit(self):
        mc = REF["centred"]["mc"]
        r = DP.simulate_fits(n_sim=300, seed=2, **BASE, **CENTRED)
        assert r["n_sim"] == 300 and r["fraction_without_ci"] == 0
        se = math.sqrt(0.95 * 0.05 / 300)
        assert abs(r["coverage"] - mc["coverage"]) < 4 * se
        assert r["median_log_width"] == pytest.approx(mc["median_log_width"],
                                                      rel=0.05)
        # the asymptotic width predicts the fitted widths
        assert r["median_log_width"] == pytest.approx(
            r["expected_log_width"], rel=0.06)

    def test_missing_plateau_widens_fitted_cis(self):
        a = DP.simulate_fits(n_sim=40, seed=3, **BASE, **CENTRED)
        b = DP.simulate_fits(n_sim=40, seed=3, **BASE, **SHIFTED)
        assert b["median_log_width"] > 5 * a["median_log_width"]

    def test_pooling_chunks(self):
        a = DP.simulate_fits(n_sim=10, seed=5, **BASE, **CENTRED)
        b = DP.simulate_fits(n_sim=10, seed=6, **BASE, **CENTRED)
        pooled = {k: a[k] + b[k] for k in ("n_sim", "n_failed", "n_ambiguous",
                                            "n_no_ci", "n_ci", "n_covered",
                                            "log_widths")}
        s = DP.summarize(pooled)
        assert s["coverage"] == (a["n_covered"] + b["n_covered"]) / 20


class TestApi:
    def test_handler(self):
        r = analyze({"analysis": "dose_plan", "data": {}, "options": {
            **BASE, **CENTRED}})
        assert round(r["expected_ci"]["log_width"], 4) == 0.2253
        s = analyze({"analysis": "dose_plan", "data": {}, "options": {
            **BASE, **CENTRED, "n_sim": 5, "seed": 1}})
        assert s["simulation"]["n_sim"] == 5
        bad = analyze({"analysis": "dose_plan", "data": {}, "options": {
            **BASE, "doses": [0, 1]}})
        assert "positive" in bad["error"]
