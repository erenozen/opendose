"""Bootstrap CIs of fitted parameters (FEATURE-PLAN P-101), against
engine/tests/reference/fit_bootstrap.py: a case and a residual bootstrap
written there with scipy.optimize.curve_fit on a hand-written 4PL, the
same documented seed stream (numpy default_rng(seed).integers(0, n,
(B, n))), percentile CIs by numpy.quantile. R's nlstools::nlsBoot and
boot::boot are not installed.

- Same seed, same resamples: the engine's CIs equal the reference's to
  display precision (4 significant digits; the two optimisers stop
  within ~1e-8 of each other).
- Monte Carlo error: the reference repeated with seeds 2..21 gives the SD
  of every CI limit over seeds; the engine's seed-1 limits lie within 4
  of those SDs of the mean over seeds.
- Coverage: recorded in the reference (200 simulated data sets, B = 400)
  and re-checked here on a smaller run.
"""

import json
import math
from pathlib import Path

import numpy as np
import pytest

from opendose import api, fitboot, nlfit, simulate

HERE = Path(__file__).resolve().parent
REF = json.loads((HERE / "reference" / "fit_bootstrap.json").read_text())

CONC = [1e-9, 3.162e-9, 1e-8, 3.162e-8, 1e-7, 3.162e-7, 1e-6, 3.162e-6, 1e-5]
ROWS = [[98.2, 101.5, 99.1], [97.0, 95.8, 99.9], [93.4, 90.1, 92.7],
        [78.9, 82.3, 80.0], [51.2, 48.7, 50.9], [22.1, 25.6, 24.0],
        [8.9, 10.2, 7.5], [3.1, 4.4, 2.2], [1.0, 0.5, 2.1]]
MODEL = "log_inhibitor_vs_response_4pl"
NAMES = ["Top", "Bottom", "LogIC50", "HillSlope", "IC50", "Span"]


def _payload(rows=ROWS, conc=CONC, model=MODEL, boot=None, **options):
    return {"analysis": "dose_response",
            "data": {"x": conc, "datasets": [{"name": "Drug A",
                                              "ys": rows}]},
            "options": {"model": model, "x_is_log": False,
                        "ci_method": "bootstrap",
                        "bootstrap": boot or {}, **options}}


def _fit(**kw):
    r = api.analyze(_payload(**kw))
    assert "error" not in r, r.get("error")
    return r["datasets"][0]["fit"]


def _sig(v, n=4):
    return float(f"{v:.{n - 1}e}")


@pytest.fixture(scope="module")
def case_fit():
    return _fit(boot={"method": "case", "resamples": 2000, "seed": 1})


@pytest.fixture(scope="module")
def residual_fit():
    return _fit(boot={"method": "residual", "resamples": 2000, "seed": 1})


@pytest.mark.parametrize("method", ["case", "residual"])
def test_same_seed_matches_the_reference_bootstrap(method, case_fit,
                                                   residual_fit):
    fit = case_fit if method == "case" else residual_fit
    ref = REF[method]
    boot = fit["bootstrap"]
    assert fit["ci_method"] == "bootstrap"
    assert (boot["converged"], boot["failed"]) == (ref["converged"],
                                                   ref["failed"]) == (2000, 0)
    for name in NAMES:
        lo, hi = fit["params"][name]["ci95"]
        rlo, rhi = ref["ci95"][name]
        # within 2e-5 of the CI's width: the 4 significant digits shown,
        # also for a limit near zero (Bottom -0.07284 vs -0.07282)
        tol = 2e-5 * abs(rhi - rlo)
        assert abs(lo - rlo) <= tol and abs(hi - rhi) <= tol, name
        assert boot["params"][name]["se"] == pytest.approx(
            ref["se"][name], rel=1e-4), name


def test_acceptance_values_of_the_example(case_fit):
    """The plan's acceptance test: the example 4PL, 2,000 resamples. The
    four-digit CIs the results table shows (and e2e asserts)."""
    p = case_fit["params"]
    shown = {n: (_sig(p[n]["ci95"][0]), _sig(p[n]["ci95"][1]))
             for n in NAMES}
    assert shown == {
        "Top": (98.39, 101.4), "Bottom": (-0.07284, 2.140),
        "LogIC50": (-7.012, -6.947), "HillSlope": (-1.193, -1.020),
        "IC50": (9.734e-8, 1.129e-7), "Span": (96.77, 101.1)}
    # the asymptotic CI it replaced is kept next to it
    assert p["LogIC50"]["se"] == pytest.approx(0.014712, abs=1e-6)
    a = case_fit["bootstrap"]["params"]["LogIC50"]["asymptotic_ci95"]
    assert (_sig(a[0]), _sig(a[1])) == (-7.013, -6.953)


@pytest.mark.parametrize("method", ["case", "residual"])
def test_within_monte_carlo_error_of_other_seeds(method, case_fit,
                                                 residual_fit):
    fit = case_fit if method == "case" else residual_fit
    for name in NAMES:
        mc = REF[method]["mc"][name]
        for k in (0, 1):
            got = fit["params"][name]["ci95"][k]
            assert abs(got - mc["mean"][k]) <= 4 * mc["mc_se"][k], (name, k)


def test_same_seed_same_cis_and_another_seed_differs():
    a = _fit(boot={"resamples": 200, "seed": 7})
    b = _fit(boot={"resamples": 200, "seed": 7})
    c = _fit(boot={"resamples": 200, "seed": 8})
    for name in NAMES:
        assert a["params"][name]["ci95"] == b["params"][name]["ci95"]
    assert a["params"]["LogIC50"]["ci95"] != c["params"]["LogIC50"]["ci95"]


def test_stepped_run_reports_progress_and_equals_the_plain_run():
    payload = _payload(boot={"resamples": 200, "seed": 3})
    job = api.StepJob(json.dumps(payload))
    seen = []
    while (p := job.step()) is not None:
        seen.append(json.loads(p))
    out = json.loads(job.result())
    assert seen[0]["total"] == 200 and seen[-1] == {"done": 200, "what": "bootstrap",
                                                    "total": 200}
    assert [s["done"] for s in seen] == sorted(s["done"] for s in seen)
    assert len(seen) >= 200 // fitboot.CHUNK
    plain = json.loads(api.analyze_json(json.dumps(payload)))
    assert out == plain


def test_progress_counts_every_data_set():
    payload = _payload(boot={"resamples": 200})
    payload["data"]["datasets"].append({"name": "Drug B", "ys": ROWS})
    job = api.StepJob(json.dumps(payload))
    seen = []
    while (p := job.step()) is not None:
        seen.append(json.loads(p))
    assert seen[-1] == {"done": 400, "total": 400, "what": "bootstrap"}
    out = json.loads(job.result())
    assert [d["fit"]["ci_method"] for d in out["datasets"]] == [
        "bootstrap", "bootstrap"]


def test_without_bootstrap_nothing_changes():
    plain = api.analyze({"analysis": "dose_response",
                         "data": {"x": CONC, "datasets": [
                             {"name": "Drug A", "ys": ROWS}]},
                         "options": {"model": MODEL, "x_is_log": False}})
    fit = plain["datasets"][0]["fit"]
    assert fit["ci_method"] == "asymptotic" and "bootstrap" not in fit
    lo, hi = fit["params"]["LogIC50"]["ci95"]
    assert (_sig(lo), _sig(hi)) == (-7.013, -6.953)


# ---- constraints and weights are respected ----

def test_held_constant_parameter_gets_no_bootstrap_ci():
    fit = _fit(model="log_inhibitor_vs_response_3pl",
               boot={"resamples": 200})
    assert "HillSlope" not in fit["bootstrap"]["params"]
    assert fit["params"]["HillSlope"]["constrained"]
    assert fit["params"]["HillSlope"]["ci95"] is None
    fit = _fit(boot={"resamples": 200}, constraints={"Top": 100,
                                                     "Bottom": 0})
    # Span = Top - Bottom depends on constants only: no CI
    assert fit["params"]["Span"]["ci95"] is None
    assert set(fit["bootstrap"]["params"]) >= {"LogIC50", "HillSlope"}


def test_range_constraint_holds_in_every_resample():
    fit = _fit(boot={"resamples": 200, "method": "case"},
               bounds={"Bottom": [0.5, None]})
    lo, hi = fit["params"]["Bottom"]["ci95"]
    assert lo >= 0.5 and hi > lo


@pytest.mark.parametrize("weighting", ["1/Y2", "1/X2"])
@pytest.mark.parametrize("method", ["case", "residual"])
def test_weighted_fits_bootstrap(weighting, method):
    fit = _fit(boot={"resamples": 200, "method": method},
               weighting=weighting)
    assert fit["ci_method"] == "bootstrap"
    assert fit["bootstrap"]["failed"] == 0
    lo, hi = fit["params"]["LogIC50"]["ci95"]
    assert lo < fit["params"]["LogIC50"]["value"] < hi


def test_absolute_ic50_and_transforms_are_bootstrapped():
    fit = _fit(boot={"resamples": 200}, absolute_ic50_level=50)
    lo, hi = fit["params"]["AbsoluteIC50"]["ci95"]
    assert lo < fit["params"]["AbsoluteIC50"]["value"] < hi
    assert fit["bootstrap"]["params"]["AbsoluteIC50"]["asymptotic_ci95"]
    # a model whose derived values are transforms (ECanything: EC80)
    fit = _fit(model="log_agonist_vs_response_ecanything",
               rows=[row[::-1] for row in ROWS[::-1]],
               boot={"resamples": 200}, constraints={"F": 80})
    derived = [n for n in fit["param_order"] if fit["params"][n].get(
        "derived") and fit["params"][n]["ci95"] is not None]
    assert derived and all(n in fit["bootstrap"]["params"] for n in derived)


# ---- invariance ----

def test_scaling_y_scales_the_y_parameters():
    rows = [[v * 1000 for v in r] for r in ROWS]
    a = _fit(boot={"resamples": 200, "seed": 5})
    b = _fit(rows=rows, boot={"resamples": 200, "seed": 5})
    for k in (0, 1):
        assert b["params"]["Top"]["ci95"][k] == pytest.approx(
            1000 * a["params"]["Top"]["ci95"][k], rel=1e-5)
        assert b["params"]["LogIC50"]["ci95"][k] == pytest.approx(
            a["params"]["LogIC50"]["ci95"][k], abs=1e-6)


def test_concentration_units_shift_log_ic50_exactly():
    a = _fit(boot={"resamples": 200, "seed": 5})
    b = _fit(conc=[c * 1e9 for c in CONC],   # nM instead of M
             boot={"resamples": 200, "seed": 5})
    for k in (0, 1):
        assert b["params"]["LogIC50"]["ci95"][k] == pytest.approx(
            a["params"]["LogIC50"]["ci95"][k] + 9, abs=1e-6)
        assert b["params"]["IC50"]["ci95"][k] == pytest.approx(
            1e9 * a["params"]["IC50"]["ci95"][k], rel=1e-5)


# ---- refusals and edge cases: a message, never a crash ----

@pytest.mark.parametrize("boot,msg", [
    ({"resamples": 50}, "from 200 to 10,000"),
    ({"resamples": 2000.5}, "whole number"),
    ({"seed": -1}, "seed must be a whole number"),
    ({"method": "wild"}, "case or residual"),
])
def test_bad_settings_are_refused_with_what_to_enter(boot, msg):
    r = api.analyze(_payload(boot=boot))
    assert msg in r["error"]


def test_summary_data_rob_and_rout_keep_asymptotic_cis():
    r = api.analyze({"analysis": "dose_response",
                     "data": {"x": CONC, "datasets": [{
                         "name": "A", "ys": [[np.mean(r_), np.std(r_, ddof=1),
                                              3] for r_ in ROWS]}]},
                     "options": {"model": MODEL, "x_is_log": False,
                                 "summary_format": "mean_sd_n",
                                 "ci_method": "bootstrap"}})
    fit = r["datasets"][0]["fit"]
    assert "individual values" in fit["bootstrap"]["error"]
    assert fit["ci_method"] == "asymptotic"
    fit = _fit(rout_q=0.01)
    assert "ROUT" in fit["bootstrap"]["error"]
    assert fit["ci_method"] == "asymptotic"
    fit = _fit(fit_method="robust")
    assert "robust" in fit["bootstrap"]["error"]


def test_ambiguous_fit_is_not_bootstrapped():
    flat = [[50.0, 50.0, 50.0]] * 9
    r = api.analyze(_payload(rows=flat))
    d = r["datasets"][0]
    if "fit" in d:
        assert "bootstrap" in d["fit"]
        assert d["fit"]["ci_method"] == "asymptotic"
    else:
        assert d["error"]


def test_too_few_points_withholds_or_counts_failures():
    # 5 points for 4 parameters: most case resamples cannot identify the
    # model; the CIs are withheld with a reason, never a crash
    conc = CONC[2:7]
    rows = [[r[0]] for r in ROWS[2:7]]
    fit = _fit(conc=conc, rows=rows, boot={"resamples": 200})
    b = fit["bootstrap"]
    assert b.get("error") or b["failed"] > 0
    if b.get("error"):
        assert "too few for a bootstrap CI" in b["error"]
        assert fit["ci_method"] == "asymptotic"
    else:
        assert any("could not be refitted" in w for w in b["warnings"])


def test_user_equation_is_bootstrapped():
    ue = {"text": "Y=Bottom + (Top-Bottom)/(1+10^((LogIC50-X)*HillSlope))",
          "x_is_log": True, "name": "my 4PL",
          "rules": {"Top": "YMAX", "Bottom": "YMIN", "LogIC50": "XMID",
                    "HillSlope": "-1"}}
    r = api.analyze(_payload(user_equation=ue,
                             boot={"resamples": 200, "seed": 1}))
    fit = r["datasets"][0]["fit"]
    assert fit["ci_method"] == "bootstrap"
    ref = _fit(boot={"resamples": 200, "seed": 1})
    for k in (0, 1):
        assert fit["params"]["LogIC50"]["ci95"][k] == pytest.approx(
            ref["params"]["LogIC50"]["ci95"][k], abs=1e-5)


# ---- coverage ----

def test_recorded_coverage_is_near_nominal():
    """The reference's simulation (200 data sets, B = 400): percentile
    CIs of LogIC50 and HillSlope hold the true value in 91% to 94.5% of
    data sets (binomial SE 1.5%), close to the asymptotic CIs' 93.5% to
    96%; percentile intervals run a little narrow at n = 27."""
    for method in ("case", "residual"):
        c = REF["coverage"][method]
        assert c["datasets"] == 200
        for name, v in c["coverage"].items():
            assert abs(v - 0.95) <= 3 * c["binomial_se"], (method, name)


def test_coverage_on_a_small_simulation():
    x = [math.log10(c) for c in CONC]
    hits = n = 0
    for s in range(40):
        sim = simulate.simulate_xy(
            MODEL, {"Top": 100, "Bottom": 0, "LogXmid": -7,
                    "HillSlope": -1},
            x=x, replicates=3, error={"kind": "gaussian", "sd": 5},
            seed=5000 + s)
        xs = [xv for xv, row in zip(sim["x"], sim["datasets"][0]["ys"])
              for _ in row]
        ys = [v for row in sim["datasets"][0]["ys"] for v in row]
        fitted = nlfit.fit_model(xs, ys, MODEL)
        res = fitboot.FitBootstrap(nlfit.fit_setup(xs, ys, MODEL),
                                   fitted["fitted_values"], resamples=200,
                                   seed=s).run()
        lo, hi = res["params"]["LogIC50"]["ci95"]
        hits += lo <= -7 <= hi
        n += 1
    assert hits >= 33, hits  # P(<= 32 of 40 | 0.95) < 0.001
