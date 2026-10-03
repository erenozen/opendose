"""Built-in equation library (opendose.equations): every equation of the
curve-fitting guide's "Models (equations) built-in to Prism" chapter that
OpenDose registers.

For each model: noiseless data generated from the equation with known
parameters must be recovered by the fitting engine (single fits through
nlfit.fit_model, global models through equations.fit_global_model), and a
fit to data with scatter must reach the same least-squares minimum as
scipy.optimize.curve_fit started at the true parameters.
"""

import math
import zlib

import numpy as np
import pytest
from scipy.optimize import curve_fit

from opendose import equations, nlfit
from opendose.equations import DataStats, fit_global_model
from opendose.nlfit import MODELS, fit_model

LOGX = np.linspace(-10, -4, 13)
CONC = np.geomspace(0.1, 1000, 13)
T60 = np.linspace(0, 60, 13)


def _poly(order, centered=False):
    x = np.linspace(-2, 6, 15)
    truth = {f"B{i}": [1.5, -0.8, 0.6, -0.12, 0.02, -0.003, 0.0004][i]
             for i in range(order + 1)}
    if centered:
        truth["XMean"] = float(np.mean(np.unique(x)))
    return x, truth


# (model, x, truth, constraints)
SINGLE = [
    ("log_agonist_vs_normalized_response", LOGX, {"LogEC50": -7.0}, {}),
    ("log_agonist_vs_normalized_response_variable", LOGX,
     {"LogEC50": -7.0, "HillSlope": 1.4}, {}),
    ("agonist_vs_response", CONC, {"Bottom": 5, "Top": 95, "EC50": 30}, {}),
    ("agonist_vs_response_variable", CONC,
     {"Bottom": 5, "Top": 95, "EC50": 30, "HillSlope": 1.5}, {}),
    ("agonist_vs_normalized_response", CONC, {"EC50": 30}, {}),
    ("agonist_vs_normalized_response_variable", CONC,
     {"EC50": 30, "HillSlope": 0.8}, {}),
    ("log_inhibitor_vs_normalized_response", LOGX, {"LogIC50": -6.5}, {}),
    ("log_inhibitor_vs_normalized_response_variable", LOGX,
     {"LogIC50": -6.5, "HillSlope": -1.3}, {}),
    ("inhibitor_vs_response", CONC, {"Bottom": 3, "Top": 100, "IC50": 40}, {}),
    ("inhibitor_vs_response_variable", CONC,
     {"Bottom": 3, "Top": 100, "IC50": 40, "HillSlope": -1.2}, {}),
    ("inhibitor_vs_normalized_response", CONC, {"IC50": 40}, {}),
    ("inhibitor_vs_normalized_response_variable", CONC,
     {"IC50": 40, "HillSlope": -0.9}, {}),
    ("asymmetric_5pl_log", np.linspace(-10, -4, 25),
     {"Bottom": 2, "Top": 98, "LogEC50": -7, "HillSlope": 1.2, "S": 2.0}, {}),
    ("asymmetric_5pl", np.geomspace(0.1, 1000, 25),
     {"Bottom": 2, "Top": 98, "EC50": 30, "HillSlope": 1.2, "S": 0.6}, {}),
    ("biphasic_log", np.linspace(-11, -3, 33),
     {"Bottom": 0, "Top": 100, "Frac": 0.4, "LogEC50_1": -9, "nH1": 1.0,
      "LogEC50_2": -5.5, "nH2": 1.0}, {}),
    ("biphasic", np.geomspace(0.01, 1e5, 33),
     {"Bottom": 0, "Top": 100, "Frac": 0.4, "EC50_1": 1.0, "nH1": 1.0,
      "EC50_2": 3000.0, "nH2": 1.0}, {}),
    ("bell_shaped_log", np.linspace(-11, -3, 33),
     {"Dip": 10, "Plateau1": 80, "Plateau2": 60, "LogEC50_1": -9,
      "nH1": -1.5, "LogEC50_2": -5, "nH2": -1.0}, {}),
    ("bell_shaped", np.geomspace(0.01, 1e6, 33),
     {"Dip": 10, "Plateau1": 80, "Plateau2": 60, "EC50_1": 1.0,
      "nH1": -1.5, "EC50_2": 1e4, "nH2": -1.0}, {}),
    ("log_agonist_vs_response_ecanything", LOGX,
     {"Bottom": 0, "Top": 100, "LogECF": -6.5, "HillSlope": 1.0, "F": 80},
     {"F": 80}),
    ("agonist_vs_response_ecanything", CONC,
     {"Bottom": 0, "Top": 100, "ECF": 50, "HillSlope": 1.2, "F": 20},
     {"F": 20}),
    ("absolute_ic50_log", LOGX,
     {"Bottom": 10, "Top": 100, "LogAbsoluteIC50": -6.8, "HillSlope": -1.0,
      "Baseline": 0}, {"Baseline": 0}),
    ("absolute_ic50", CONC,
     {"Bottom": 10, "Top": 100, "AbsoluteIC50": 50, "HillSlope": -1.0,
      "Baseline": 0}, {"Baseline": 0}),
    ("one_site_total", np.linspace(0, 20, 12),
     {"Bmax": 1000, "Kd": 2.5, "NS": 20, "Background": 50}, {}),
    ("one_site_total_ligand_depletion", np.geomspace(100, 2e5, 12),
     {"Bmax": 5000, "KdnM": 1.0, "NS": 0.05, "SpAct": 2.0, "Vol": 0.25},
     {"SpAct": 2.0, "Vol": 0.25}),
    ("two_sites_specific", np.geomspace(0.01, 1000, 20),
     {"BmaxHi": 400, "KdHi": 0.5, "BmaxLo": 600, "KdLo": 50}, {}),
    ("specific_binding_hill", np.geomspace(0.1, 100, 12),
     {"Bmax": 500, "Kd": 5, "h": 1.8}, {}),
    ("two_sites_fit_ki", np.linspace(-12, -3, 25),
     {"Top": 100, "Bottom": 5, "FractionHi": 0.35, "LogKiHi": -9,
      "LogKiLo": -6, "HotNM": 2, "HotKdNMHi": 1, "HotKdNMLo": 1},
     {"HotNM": 2, "HotKdNMHi": 1, "HotKdNMLo": 1}),
    ("one_site_heterologous_depletion", np.linspace(-11, -4, 15),
     {"LogKi": -8, "Bmax": 3000, "NS": 0.02, "Hot": 5000, "KdNM": 1,
      "SpAct": 2, "Vol": 0.25},
     {"Hot": 5000, "KdNM": 1, "SpAct": 2, "Vol": 0.25}),
    ("one_site_homologous", np.linspace(-12, -5, 15),
     {"LogKd": -9, "Bmax": 2000, "Bottom": 50, "HotnM": 1}, {"HotnM": 1}),
    ("allosteric_modulator_titration", np.linspace(-10, -3, 15),
     {"Y0": 1000, "LogKb": -6, "LogAlpha": -1.5, "RadioligandNM": 1,
      "HotKdNM": 2}, {"RadioligandNM": 1, "HotKdNM": 2}),
    ("dissociation_one_phase", T60, {"Y0": 2000, "NS": 200, "K": 0.08}, {}),
    ("association_one_conc", T60,
     {"Kon": 2e7, "Koff": 0.05, "Bmax": 3000, "Hotnm": 5},
     {"Hotnm": 5, "Koff": 0.05}),
    ("association_then_dissociation", np.linspace(0, 120, 25),
     {"Kon": 2e7, "Koff": 0.05, "Bmax": 3000, "NS": 100, "HotNM": 5,
      "Time0": 60}, {"HotNM": 5, "Time0": 60}),
    ("kcat", np.geomspace(0.5, 100, 12),
     {"kcat": 13.5, "Km": 5.9, "Et": 100}, {"Et": 100}),
    ("allosteric_sigmoidal", np.geomspace(1, 200, 12),
     {"Vmax": 100, "h": 2.5, "Khalf": 25}, {}),
    ("substrate_inhibition", np.geomspace(0.1, 1000, 15),
     {"Vmax": 100, "Km": 2, "Ki": 200}, {}),
    ("morrison_tight_binding", np.linspace(0, 50, 13),
     {"Vo": 100, "Ki": 2, "Et": 10, "S": 10, "Km": 5},
     {"Et": 10, "S": 10, "Km": 5}),
    ("plateau_one_phase_decay", np.linspace(0, 20, 41),
     {"X0": 5.3, "Y0": 100, "Plateau": 10, "K": 0.5}, {}),
    ("plateau_one_phase_association", np.linspace(0, 20, 41),
     {"X0": 5.3, "Y0": 10, "Plateau": 100, "K": 0.4}, {}),
    ("three_phase_decay", np.concatenate([np.linspace(0, 10, 25),
                                          np.linspace(11, 100, 25),
                                          np.linspace(110, 700, 25)]),
     {"Y0": 1000, "Plateau": 50, "PercentFast": 30, "PercentSlow": 30,
      "KFast": 1.0, "KMedium": 0.1, "KSlow": 0.01}, {}),
    ("two_phase_association", np.concatenate([np.linspace(0, 10, 20),
                                              np.linspace(12, 150, 20)]),
     {"Y0": 5, "Plateau": 100, "PercentFast": 40, "KFast": 1.0,
      "KSlow": 0.05}, {}),
    ("horizontal_line", np.arange(1.0, 11.0), {"Mean": 5.0}, {}),
    ("line_through_origin", np.arange(1.0, 11.0), {"Slope": 2.5}, {}),
    ("segmental_linear", np.linspace(0, 20, 21),
     {"Intercept1": 2, "Slope1": 1.0, "Slope2": -0.5, "X0": 8.5}, {}),
    ("hinge_function", np.linspace(0, 20, 41),
     {"Intercept": 10, "Slope1": 1.0, "Slope2": -0.5, "X0": 8.5,
      "Delta": 1.0}, {}),
    ("semilog_line_x_log", np.geomspace(1, 1000, 10),
     {"Slope": 3.0, "Yintercept": 2.0}, {}),
    ("semilog_line_y_log", np.linspace(0, 5, 10),
     {"Slope": 0.3, "Yintercept": 1.0}, {}),
    ("log_log_line", np.geomspace(1, 1000, 10),
     {"Slope": 0.7, "Yintercept": 0.5}, {}),
    ("polynomial_first", *_poly(1), {}),
    ("polynomial_fourth", *_poly(4), {}),
    ("polynomial_fifth", *_poly(5), {}),
    ("polynomial_sixth", *_poly(6), {}),
    ("centered_polynomial_first", *_poly(1, True), {}),
    ("centered_polynomial_second", *_poly(2, True), {}),
    ("centered_polynomial_third", *_poly(3, True), {}),
    ("centered_polynomial_fourth", *_poly(4, True), {}),
    ("centered_polynomial_fifth", *_poly(5, True), {}),
    ("centered_polynomial_sixth", *_poly(6, True), {}),
    ("gaussian", np.linspace(0, 20, 41),
     {"Amplitude": 50, "Mean": 9, "SD": 2.5}, {}),
    ("sum_two_gaussians", np.linspace(0, 30, 61),
     {"Amplitude1": 40, "Mean1": 8, "SD1": 2, "Amplitude2": 25,
      "Mean2": 20, "SD2": 3}, {}),
    ("lognormal", np.geomspace(0.1, 100, 40),
     {"A": 100, "GeoMean": 5, "GeoSD": 2}, {}),
    ("cumulative_gaussian_percent", np.linspace(0, 20, 21),
     {"Mean": 10, "SD": 3}, {}),
    ("cumulative_gaussian_fraction", np.linspace(0, 20, 21),
     {"Mean": 10, "SD": 3}, {}),
    ("cumulative_gaussian_count", np.linspace(0, 20, 21),
     {"Mean": 10, "SD": 3, "N": 250}, {"N": 250}),
    ("lorentzian", np.linspace(0, 20, 41),
     {"Amplitude": 50, "Center": 9, "Width": 1.5}, {}),
    ("sum_two_lorentzians", np.linspace(0, 30, 61),
     {"Amplitude1": 40, "Center1": 8, "Width1": 1.5, "Amplitude2": 25,
      "Center2": 20, "Width2": 2}, {}),
    ("sine_wave", np.linspace(0, 20, 60),
     {"Amplitude": 3, "Wavelength": 6, "PhaseShift": 0.7}, {}),
    ("damped_sine_wave", np.linspace(0, 20, 60),
     {"Amplitude": 3, "Wavelength": 6, "PhaseShift": 0.7, "K": 0.08}, {}),
    ("sinc_wave", np.linspace(-20, 20, 81),
     {"Amplitude": 5, "Wavelength": 4}, {}),
    ("sine_wave_baseline", np.linspace(0, 20, 60),
     {"Amplitude": 3, "Wavelength": 6, "PhaseShift": 0.7, "Baseline": 10},
     {}),
    ("log_exponential_growth", np.linspace(0, 10, 11),
     {"LogY0": 1.2, "K": 0.3}, {}),
    ("logistic_growth", np.linspace(0, 30, 31),
     {"Y0": 5, "YM": 1000, "K": 0.4}, {}),
    ("gompertz_growth", np.linspace(0, 30, 31),
     {"Y0": 5, "YM": 1000, "K": 0.2}, {}),
    ("exponential_plateau", np.linspace(0, 30, 31),
     {"Y0": 10, "YM": 100, "K": 0.2}, {}),
    ("beta_growth_decline", np.linspace(0.5, 29.5, 30),
     {"Ym": 100, "Te": 20, "Tm": 10}, {}),
    ("lq_fraction_surviving", np.linspace(0, 10, 11), {"A": 0.2, "B": 0.03},
     {}),
    ("lq_percent_surviving", np.linspace(0, 10, 11), {"A": 0.2, "B": 0.03},
     {}),
    ("lq_number_surviving", np.linspace(0, 10, 11),
     {"A": 0.2, "B": 0.03, "Y0": 1e4}, {}),
    ("lq_fraction_dead", np.linspace(0, 10, 11), {"A": 0.2, "B": 0.03}, {}),
    ("lq_percent_dead", np.linspace(0, 10, 11), {"A": 0.2, "B": 0.03}, {}),
    ("lq_number_dead", np.linspace(0, 10, 11),
     {"A": 0.2, "B": 0.03, "Y0": 1e4}, {}),
    ("boltzmann_sigmoid", np.linspace(-80, 40, 25),
     {"Bottom": 0, "Top": 1, "V50": -20, "Slope": 8}, {}),
    ("power_series", np.linspace(0.5, 5, 15),
     {"A": 2.0, "B": 1.5, "C": 0.5, "D": 0.5}, {}),
]

# Equivalent parameterizations: (model, fn(params) -> canonical params)


def _canon_sine(p):
    q = dict(p)
    if q["Amplitude"] < 0:
        q["Amplitude"] = -q["Amplitude"]
        q["PhaseShift"] += math.pi
    q["PhaseShift"] = q["PhaseShift"] % (2 * math.pi)
    return q


def _canon_power(p):
    q = dict(p)
    if q["B"] < q["D"]:
        q["A"], q["B"], q["C"], q["D"] = q["C"], q["D"], q["A"], q["B"]
    return q


def _canon_sinc(p):
    return dict(p, Wavelength=abs(p["Wavelength"]))


def _canon_swap(key, pairs, frac=None):
    """Two-component models: label the components by `key` order."""
    def canon(p):
        q = dict(p)
        if q[f"{key}1" if f"{key}1" in q else key + "Hi"] > \
                q[f"{key}2" if f"{key}2" in q else key + "Lo"]:
            for a, b in pairs:
                q[a], q[b] = q[b], q[a]
            if frac:
                q[frac] = 1.0 - q[frac]
        return q
    return canon


CANON = {"sine_wave": _canon_sine, "damped_sine_wave": _canon_sine,
         "sine_wave_baseline": _canon_sine, "power_series": _canon_power,
         "sinc_wave": _canon_sinc,
         "two_sites_specific": _canon_swap(
             "Kd", [("BmaxHi", "BmaxLo"), ("KdHi", "KdLo")]),
         "sum_two_gaussians": _canon_swap(
             "Mean", [("Amplitude1", "Amplitude2"), ("Mean1", "Mean2"),
                      ("SD1", "SD2")]),
         "sum_two_lorentzians": _canon_swap(
             "Center", [("Amplitude1", "Amplitude2"), ("Center1", "Center2"),
                        ("Width1", "Width2")]),
         "biphasic_log": _canon_swap(
             "LogEC50_", [("LogEC50_1", "LogEC50_2"), ("nH1", "nH2")], "Frac"),
         "biphasic": _canon_swap(
             "EC50_", [("EC50_1", "EC50_2"), ("nH1", "nH2")], "Frac")}


# Power series (A*X^B + C*X^D) has near-equivalent minima with the
# guide's documented all-1.0 initial values; only the SS is compared.
SS_ONLY = {"power_series"}


def _ids(cases):
    return [c[0] for c in cases]


@pytest.mark.parametrize("model,x,truth,constraints", SINGLE, ids=_ids(SINGLE))
def test_noiseless_recovery(model, x, truth, constraints):
    spec = MODELS[model]
    y = spec.func(np.asarray(x, float), truth)
    assert np.all(np.isfinite(y)), "test data must be finite"
    fit = fit_model(list(x), list(y), model, constraints=constraints)
    got = fit["fitted_values"]
    canon = CANON.get(model, lambda p: p)
    got, want = canon(got), canon(dict(truth))
    for name, val in want.items():
        assert got[name] == pytest.approx(val, rel=1e-5, abs=1e-7), name
    assert fit["goodness"]["ss_res"] < 1e-12 * max(1.0, float(np.sum(y ** 2)))


@pytest.mark.parametrize("model,x,truth,constraints", SINGLE, ids=_ids(SINGLE))
def test_scatter_matches_curve_fit(model, x, truth, constraints):
    """Same least-squares minimum as scipy.optimize.curve_fit."""
    spec = MODELS[model]
    x = np.asarray(x, float)
    y0 = spec.func(x, truth)
    rng = np.random.default_rng(zlib.crc32(model.encode()))
    sd = 0.01 * (np.max(np.abs(y0)) or 1.0)
    y = y0 + rng.normal(0, sd, x.size)
    fit = fit_model(x.tolist(), y.tolist(), model, constraints=constraints)
    free = fit["_cov"]["free_names"]
    fixed = {k: v for k, v in fit["fitted_values"].items() if k not in free}

    def f(xx, *theta):
        return spec.func(xx, dict(fixed, **dict(zip(free, theta))))

    p0 = [truth[n] for n in free]
    popt, pcov = curve_fit(f, x, y, p0=p0, maxfev=200000)
    ss_ref = float(np.sum((y - f(x, *popt)) ** 2))
    assert fit["goodness"]["ss_res"] <= ss_ref * (1 + 1e-7) + 1e-20
    canon = CANON.get(model)
    if model in SS_ONLY:
        return  # several near-equivalent minima: the SS check is the test
    if canon is None:
        ours = [fit["fitted_values"][n] for n in free]
        np.testing.assert_allclose(ours, popt, rtol=2e-4,
                                   atol=1e-6 * max(1.0, np.max(np.abs(popt))))
        se = [fit["params"][n]["se"] for n in free]
        np.testing.assert_allclose(se, np.sqrt(np.diag(pcov)), rtol=2e-3)
    else:  # equivalent labelling of the same curve
        ours = canon(dict(fit["fitted_values"]))
        ref = canon(dict(fixed, **dict(zip(free, popt))))
        for n in free:
            assert ours[n] == pytest.approx(ref[n], rel=2e-4, abs=1e-6), n


# ------------------------------------------------------------ global models

def _ds(model, x, base, per, constants=None):
    spec = MODELS[model]
    out = []
    for i, extra in enumerate(per):
        p = dict(base, **extra, _dataset=i)
        c = (constants or [{}] * len(per))[i]
        p.update(c)
        y = spec.func(np.asarray(x, float), p)
        out.append({"name": chr(65 + i), "x": list(x), "y": list(y),
                    "constants": c})
    return out


NM = np.geomspace(0.01, 1e5, 15)

GLOBAL = [
    ("operational_depletion_log", LOGX,
     {"Basal": 5, "Effectmax": 100, "LogKA": -6, "n": 1.0},
     [{"LogTau": 1.0}, {"LogTau": 0.0}, {"LogTau": -0.5}], None),
    ("operational_depletion", NM,
     {"Basal": 5, "Effectmax": 100, "KA": 1000, "n": 1.0},
     [{"Tau": 10}, {"Tau": 1.0}, {"Tau": 0.3}], None),
    ("operational_partial_agonist_log", np.linspace(-11, -3, 17),
     {"Basal": 0, "Effectmax": 100, "n": 1.0},
     [{"LogEC50": -7.5}, {"LogKA": -6, "LogTau": 0.3},
      {"LogKA": -5.5, "LogTau": -0.2}], None),
    ("operational_partial_agonist", NM,
     {"Basal": 0, "Effectmax": 100, "n": 1.0},
     [{"EC50": 30}, {"KA": 1000, "Tau": 2.0}, {"KA": 3000, "Tau": 0.6}], None),
    ("gaddum_schild_log", np.linspace(-11, -3, 17),
     {"Bottom": 0, "Top": 100, "LogEC50": -8, "HillSlope": 1.0, "pA2": 8.5,
      "SchildSlope": 1.1}, [{}] * 4,
     [{"B": 0.0}, {"B": 1e-8}, {"B": 1e-7}, {"B": 1e-6}]),
    ("gaddum_schild_slope1_log", np.linspace(-11, -3, 17),
     {"Bottom": 0, "Top": 100, "LogEC50": -8, "HillSlope": 1.0, "pA2": 8.5},
     [{}] * 4, [{"B": 0.0}, {"B": 1e-8}, {"B": 1e-7}, {"B": 1e-6}]),
    ("gaddum_schild", NM,
     {"Bottom": 0, "Top": 100, "EC50": 10, "HillSlope": 1.0, "pA2": -0.5,
      "SchildSlope": 0.9}, [{}] * 4,
     [{"B": 0.0}, {"B": 10.0}, {"B": 100.0}, {"B": 1000.0}]),
    ("gaddum_schild_slope1", NM,
     {"Bottom": 0, "Top": 100, "EC50": 10, "HillSlope": 1.0, "pA2": -0.5},
     [{}] * 4, [{"B": 0.0}, {"B": 10.0}, {"B": 100.0}, {"B": 1000.0}]),
    ("ec50_shift_log", LOGX,
     {"Bottom": 0, "Top": 100, "HillSlope": 1.0, "LogEC50Control": -8},
     [{}, {"EC50Ratio": 10.0}], None),
    ("ec50_shift", NM,
     {"Bottom": 0, "Top": 100, "HillSlope": 1.0, "EC50Control": 10.0},
     [{}, {"EC50Ratio": 15.0}], None),
    ("allosteric_ec50_shift_log", np.linspace(-11, -3, 17),
     {"Bottom": 0, "Top": 100, "HillSlope": 1.0, "LogEC50": -8,
      "LogKB": -6.5, "LogAlpha": -1.5}, [{}] * 4,
     [{"B": 0.0}, {"B": 1e-7}, {"B": 1e-6}, {"B": 1e-5}]),
    ("allosteric_ec50_shift", NM,
     {"Bottom": 0, "Top": 100, "HillSlope": 1.0, "EC50": 10, "KB": 300,
      "Alpha": 0.03}, [{}] * 4,
     [{"B": 0.0}, {"B": 100.0}, {"B": 1000.0}, {"B": 10000.0}]),
    ("one_site_total_and_nonspecific", np.linspace(0.5, 20, 10),
     {"Bmax": 1000, "Kd": 2.5, "NS": 30, "Background": 20}, [{}, {}], None),
    ("two_sites_total_and_nonspecific", np.geomspace(0.01, 1000, 20),
     {"BmaxHi": 400, "KdHi": 0.5, "BmaxLo": 600, "KdLo": 50, "NS": 2.0,
      "Background": 20}, [{}, {}], None),
    ("saturation_allosteric", np.geomspace(0.1, 100, 12),
     {"Bmax": 1000, "KdHot": 2, "LogAlpha": -1, "LogKB": 1.5}, [{}] * 4,
     [{"Allo": 0.0}, {"Allo": 10.0}, {"Allo": 100.0}, {"Allo": 1000.0}]),
    ("one_site_homologous", np.linspace(-12, -5, 15),
     {"LogKd": -9, "Bmax": 2000}, [{"Bottom": 20}, {"Bottom": 80}],
     [{"HotnM": 0.5}, {"HotnM": 3.0}]),
    ("association_two_conc", np.linspace(0, 60, 13),
     {"Kon": 2e7, "Koff": 0.05, "Bmax": 3000}, [{}] * 3,
     [{"Hotnm": 1.0}, {"Hotnm": 5.0}, {"Hotnm": 20.0}]),
    ("kinetics_competitive_binding", np.linspace(0, 120, 25),
     {"K3": 5e7, "K4": 0.02, "Bmax": 1000, "K1": 1e8, "K2": 0.1, "L": 1.0},
     [{}] * 3, [{"I": 10.0}, {"I": 30.0}, {"I": 100.0}]),
    ("competitive_inhibition", np.geomspace(0.5, 100, 10),
     {"Vmax": 100, "Km": 5, "Ki": 4}, [{}] * 4,
     [{"I": 0.0}, {"I": 5.0}, {"I": 10.0}, {"I": 20.0}]),
    ("noncompetitive_inhibition", np.geomspace(0.5, 100, 10),
     {"Vmax": 100, "Km": 5, "Ki": 4}, [{}] * 4,
     [{"I": 0.0}, {"I": 5.0}, {"I": 10.0}, {"I": 20.0}]),
    ("uncompetitive_inhibition", np.geomspace(0.5, 100, 10),
     {"Vmax": 100, "Km": 5, "AlphaKi": 4}, [{}] * 4,
     [{"I": 0.0}, {"I": 5.0}, {"I": 10.0}, {"I": 20.0}]),
    ("mixed_model_inhibition", np.geomspace(0.5, 100, 10),
     {"Vmax": 100, "Km": 5, "Ki": 4, "Alpha": 3.0}, [{}] * 4,
     [{"I": 0.0}, {"I": 5.0}, {"I": 10.0}, {"I": 20.0}]),
    ("two_lines_crossing", np.linspace(0, 10, 11),
     {"Xcross": 5, "Ycross": 10}, [{"Slope": 2.0}, {"Slope": -1.0}], None),
]

GLOBAL_CONSTRAINTS = {"kinetics_competitive_binding":
                      {"K1": 1e8, "K2": 0.1, "L": 1.0}}


@pytest.mark.parametrize("model,x,base,per,constants", GLOBAL,
                         ids=_ids(GLOBAL))
def test_global_noiseless_recovery(model, x, base, per, constants):
    datasets = _ds(model, x, base, per, constants)
    res = fit_global_model(datasets, model,
                           constraints=GLOBAL_CONSTRAINTS.get(model))
    for i, extra in enumerate(per):
        want = dict(base, **extra)
        got = res["datasets"][i]["fitted_values"]
        scope = MODELS[model].param_scope or {}
        for name, val in want.items():
            if name not in got:  # <A>-only parameter, absent from B..
                assert scope.get(name) in ("first", "rest") and i > 0
                continue
            assert got[name] == pytest.approx(val, rel=1e-5, abs=1e-7), \
                (i, name)
    assert res["goodness"]["ss_res"] < 1e-10


@pytest.mark.parametrize("model,x,base,per,constants", GLOBAL[-5:-1],
                         ids=_ids(GLOBAL[-5:-1]))
def test_global_scatter_matches_curve_fit(model, x, base, per, constants):
    """Enzyme inhibition (all parameters shared, I = column constant):
    the global minimum equals curve_fit on the stacked data."""
    spec = MODELS[model]
    datasets = _ds(model, x, base, per, constants)
    rng = np.random.default_rng(7)
    for d in datasets:
        d["y"] = (np.asarray(d["y"]) + rng.normal(0, 1.5, len(d["y"]))).tolist()
    res = fit_global_model(datasets, model)
    names = list(base)
    xs = np.concatenate([np.asarray(d["x"]) for d in datasets])
    ii = np.concatenate([[c["I"]] * len(d["x"])
                         for d, c in zip(datasets, constants)])
    ys = np.concatenate([d["y"] for d in datasets])

    def f(_, *theta):
        p = dict(zip(names, theta))
        return np.concatenate([spec.func(np.asarray(d["x"]), dict(p, I=c["I"]))
                               for d, c in zip(datasets, constants)])
    popt, pcov = curve_fit(f, xs, ys, p0=[base[n] for n in names])
    got = [res["datasets"][0]["fitted_values"][n] for n in names]
    np.testing.assert_allclose(got, popt, rtol=1e-5)
    se = [res["datasets"][0]["params"][n]["se"] for n in names]
    np.testing.assert_allclose(se, np.sqrt(np.diag(pcov)), rtol=1e-3)
    assert all(res["datasets"][0]["params"][n]["shared"] for n in names)
    del ii


# ------------------------------------------------------------ details

class TestDerivedAndRules:
    def test_data_stats_rules(self):
        x = [0, 1, 2, 3, 4]
        y = [10, 20, 40, 70, 90]
        s = DataStats(x, y)
        assert (s.ymin, s.ymax, s.ymid) == (10, 90, 50)
        assert (s.xmin, s.xmax, s.xmid) == (0, 4, 2)
        assert s.sign == 1.0
        # X at YMID: between (2, 40) and (3, 70)
        assert s.x_at_ymid == pytest.approx(2 + 10 / 30)
        assert s.y_at_xmid == 40
        assert s.slope_at_xmin == pytest.approx(10)
        assert s.slope_at_xmax == pytest.approx(20)
        assert s.slope_at_xmid == pytest.approx(25)  # three middle points

    def test_y_at_xmid_interpolates(self):
        s = DataStats([0, 1, 3, 4], [0, 10, 30, 40])
        assert s.y_at_xmid == pytest.approx(20)

    def test_ec50_and_log_transform_ci(self):
        rng = np.random.default_rng(3)
        x = np.geomspace(0.1, 1000, 13)
        truth = {"Bottom": 5, "Top": 95, "EC50": 30, "HillSlope": 1.0}
        y = MODELS["agonist_vs_response_variable"].func(x, truth) \
            + rng.normal(0, 2, x.size)
        fit = fit_model(x.tolist(), y.tolist(), "agonist_vs_response_variable")
        ec = fit["params"]["EC50"]
        log = fit["params"]["LogEC50"]
        assert log["value"] == pytest.approx(math.log10(ec["value"]))
        assert log["ci95"][0] == pytest.approx(math.log10(ec["ci95"][0]))
        assert log["ci95"][1] == pytest.approx(math.log10(ec["ci95"][1]))
        assert log["derived"] is True
        assert "Span" in fit["params"]

    def test_half_life_tau_span_delta_method(self):
        rng = np.random.default_rng(4)
        x = np.linspace(0, 20, 41)
        truth = {"X0": 5.3, "Y0": 100, "Plateau": 10, "K": 0.5}
        spec = MODELS["plateau_one_phase_decay"]
        y = spec.func(x, truth) + rng.normal(0, 1, x.size)
        fit = fit_model(x.tolist(), y.tolist(), "plateau_one_phase_decay")
        p = fit["params"]
        assert p["HalfLife"]["value"] == pytest.approx(
            math.log(2) / p["K"]["value"])
        lo, hi = p["K"]["ci95"]
        assert sorted(p["HalfLife"]["ci95"]) == pytest.approx(
            [math.log(2) / hi, math.log(2) / lo])
        # Span = Y0 - Plateau: delta method with the covariance
        names = fit["_cov"]["free_names"]
        C = np.array(fit["_cov"]["matrix"])
        a, b = names.index("Y0"), names.index("Plateau")
        se = math.sqrt(C[a, a] + C[b, b] - 2 * C[a, b])
        assert p["Span"]["se"] == pytest.approx(se, rel=1e-6)
        t = p["Span"]["ci95"][1] - p["Span"]["value"]
        assert t == pytest.approx(
            se * __import__("scipy").stats.t.ppf(0.975, fit["goodness"]["df"]),
            rel=1e-9)

    def test_profile_ci_drops_multi_parameter_transform_ci(self):
        rng = np.random.default_rng(5)
        x = np.linspace(0, 20, 41)
        y = MODELS["gaussian"].func(x, {"Amplitude": 50, "Mean": 9, "SD": 2.5}) \
            + rng.normal(0, 1, x.size)
        a = fit_model(x.tolist(), y.tolist(), "gaussian")
        b = fit_model(x.tolist(), y.tolist(), "gaussian", ci_method="profile")
        assert a["params"]["Area"]["ci95"] is not None
        assert b["params"]["Area"]["ci95"] is None
        assert b["params"]["Area"]["se"] == pytest.approx(
            a["params"]["Area"]["se"], rel=1e-9)

    def test_required_constants_enforced(self):
        x = LOGX.tolist()
        y = [50.0] * len(x)
        with pytest.raises(ValueError, match="F"):
            fit_model(x, y, "log_agonist_vs_response_ecanything")
        with pytest.raises(ValueError, match="Baseline"):
            fit_model(x, y, "absolute_ic50_log")

    def test_ecanything_f50_equals_4pl(self):
        rng = np.random.default_rng(9)
        truth = {"Top": 100, "Bottom": 2, "LogXmid": -7, "HillSlope": 1.2}
        y = MODELS["log_agonist_vs_response_4pl"].func(LOGX, truth) \
            + rng.normal(0, 2, LOGX.size)
        a = fit_model(LOGX.tolist(), y.tolist(), "log_agonist_vs_response_4pl")
        b = fit_model(LOGX.tolist(), y.tolist(),
                      "log_agonist_vs_response_ecanything",
                      constraints={"F": 50})
        assert b["params"]["LogECF"]["value"] == pytest.approx(
            a["params"]["LogEC50"]["value"], abs=1e-6)
        assert b["goodness"]["ss_res"] == pytest.approx(
            a["goodness"]["ss_res"], rel=1e-8)

    def test_centered_polynomial_same_curve_as_ordinary(self):
        rng = np.random.default_rng(2)
        x = np.linspace(1990, 2020, 16)
        y = 0.02 * (x - 2005) ** 2 + 3 + rng.normal(0, 0.3, x.size)
        c = fit_model(x.tolist(), y.tolist(), "centered_polynomial_second")
        assert c["params"]["XMean"]["constrained"] is True
        assert c["params"]["XMean"]["value"] == pytest.approx(2005)
        o = np.polyfit(x, y, 2)
        assert c["goodness"]["ss_res"] == pytest.approx(
            float(np.sum((y - np.polyval(o, x)) ** 2)), rel=1e-8)

    def test_hinge_delta_range_constraint_keeps_positive(self):
        x = np.linspace(0, 20, 41)
        truth = {"Intercept": 10, "Slope1": 1.0, "Slope2": -0.5, "X0": 8.5,
                 "Delta": 0.3}
        y = MODELS["hinge_function"].func(x, truth)
        fit = fit_model(x.tolist(), y.tolist(), "hinge_function")
        assert fit["fitted_values"]["Delta"] > 0

    def test_legacy_entries_untouched(self):
        # The original registry entries carry no new metadata.
        for name in equations.LEGACY_FAMILIES:
            spec = MODELS[name]
            assert spec.transforms is None and spec.bounds is None
            assert spec.multistart_mode is None and not spec.data_constants
            assert equations.model_family(spec)

    def test_global_partial_agonist_scopes(self):
        datasets = _ds("operational_partial_agonist_log",
                       np.linspace(-11, -3, 17),
                       {"Basal": 0, "Effectmax": 100, "n": 1.0},
                       [{"LogEC50": -7.5}, {"LogKA": -6, "LogTau": 0.3}])
        res = fit_global_model(datasets, "operational_partial_agonist_log")
        a, b = res["datasets"]
        assert "LogEC50" in a["params"] and "LogKA" not in a["params"]
        assert "LogKA" in b["params"] and "LogEC50" not in b["params"]
        assert a["params"]["Effectmax"]["shared"] is True
        assert b["params"]["KA"]["value"] == pytest.approx(1e-6, rel=1e-5)
        assert res["shared"] == ["Basal", "Effectmax", "n"]
        curve = equations.global_curve("operational_partial_agonist_log",
                                       a, 0, [-7.5])
        assert curve[0] == pytest.approx(50.0)

    def test_global_requires_dataset_constants(self):
        datasets = [{"name": "A", "x": [1, 2, 3], "y": [1, 2, 3]}]
        with pytest.raises(ValueError, match="data-set constant I"):
            fit_global_model(datasets, "competitive_inhibition")

    def test_every_new_model_is_tested(self):
        tested = set(_ids(SINGLE)) | set(_ids(GLOBAL))
        new = {n for n, s in MODELS.items()
               if n not in equations.LEGACY_FAMILIES and not s.user}
        assert new <= tested, sorted(new - tested)

    def test_registry_metadata_complete(self):
        for name, spec in MODELS.items():
            if spec.user:
                continue
            assert equations.model_family(spec), name
            assert spec.label and spec.equation and spec.params
            for c in spec.dataset_constants:
                assert c in spec.params and c in spec.required_constants
            for p in spec.shared:
                assert p in spec.params
            for p in (spec.param_scope or {}):
                assert p in spec.params
