"""MuSyC (opendose.musyc): the two-drug surface against the identities the
papers state (Meyer et al. 2019 Cell Syst eq. 1 under detailed balance;
Wooten et al. 2021 Nat Commun eq. 16 at a saturating dose; the Bliss null
at alpha = 1), and the fit recovering a known synergistic surface."""

import math

import numpy as np
import pytest

from opendose import api, assay_synergy as sy, musyc as mu

D1 = np.array([0, 0.03, 0.1, 0.3, 1, 3, 10.0])
D2 = np.array([0, 0.1, 0.3, 1, 3, 10, 30.0])
G1, G2 = np.meshgrid(D1, D2, indexing="ij")


def _params(**kw):
    p = dict(E0=2.0, E1=70.0, E2=55.0, E3=90.0, logC1=math.log10(0.7),
             logC2=math.log10(2.5), h1=1.3, h2=0.8, log_alpha12=0.0,
             log_alpha21=0.0)
    p.update(kw)
    return p


def test_detailed_balance_equals_meyer_closed_form():
    # a12^h2 = a21^h1: Meyer 2019 eq. 1 with his alpha2 = alpha21
    la21 = 0.4
    p = _params(log_alpha21=la21, log_alpha12=la21 * 1.3 / 0.8)
    C1, C2, h1, h2, a21 = 0.7, 2.5, 1.3, 0.8, 10 ** la21
    num = (C1**h1 * C2**h2 * p["E0"] + G1**h1 * C2**h2 * p["E1"]
           + C1**h1 * G2**h2 * p["E2"] + (a21 * G1)**h1 * G2**h2 * p["E3"])
    den = (C1**h1 * C2**h2 + G1**h1 * C2**h2 + C1**h1 * G2**h2
           + (a21 * G1)**h1 * G2**h2)
    np.testing.assert_allclose(mu.surface(G1, G2, p), num / den, atol=1e-10)


def test_saturating_drug_1_gives_wooten_eq16():
    p = _params(log_alpha12=-0.7, log_alpha21=0.9)       # no detailed balance
    lim = p["E3"] + (p["E1"] - p["E3"]) / (
        1 + (10 ** -0.7 * D2 / 2.5) ** 0.8)
    np.testing.assert_allclose(mu.surface(np.full_like(D2, 1e9), D2, p),
                               lim, atol=1e-8)


def test_alpha_one_is_bliss_on_percent_inhibition():
    p = _params(E0=0.0, E3=70 + 55 - 70 * 55 / 100)
    y1 = 70 * G1**1.3 / (0.7**1.3 + G1**1.3)
    y2 = 55 * G2**0.8 / (2.5**0.8 + G2**0.8)
    np.testing.assert_allclose(mu.surface(G1, G2, p),
                               y1 + y2 - y1 * y2 / 100, atol=1e-10)
    assert mu._beta(p) == pytest.approx((p["E3"] - 70) / 70)


def _synthetic(seed=1, sd=1.0):
    true = dict(E0=0.0, E1=60.0, E2=50.0, E3=95.0, logC1=math.log10(0.5),
                logC2=math.log10(2.0), h1=1.5, h2=1.0, log_alpha12=1.0,
                log_alpha21=math.log10(0.5))
    R = mu.surface(G1, G2, true)
    R = R + np.random.default_rng(seed).normal(0, sd, R.shape)
    return true, R


def test_fit_recovers_a_synergistic_surface_inside_its_intervals():
    true, R = _synthetic()
    f1, f2 = sy._fit_ll4(D1, R[:, 0]), sy._fit_ll4(D2, R[0, :])
    res = mu.fit_musyc(R, D1.tolist(), D2.tolist(), f1, f2, n_ci=60)
    want = {"E1": 60.0, "E2": 50.0, "E3": 95.0, "C1": 0.5, "C2": 2.0,
            "h1": 1.5, "h2": 1.0, "log10_alpha12": 1.0,
            "log10_alpha21": math.log10(0.5), "beta": 35 / 60}
    for k, v in want.items():
        lo, hi = res["ci95"][k]
        assert lo <= v <= hi, (k, v, lo, hi)
    assert res["alpha12"] == pytest.approx(10 ** res["log10_alpha12"])
    assert res["r_squared"] > 0.99 and res["notes"] == []
    assert res["n_ci"] == 60
    # beta_obs: beta read off the fitted surface at the top doses
    p = {"E0": res["E0"], "E1": res["E1"], "E2": res["E2"], "E3": res["E3"],
         "logC1": math.log10(res["C1"]), "logC2": math.log10(res["C2"]),
         "h1": res["h1"], "h2": res["h2"],
         "log_alpha12": res["log10_alpha12"],
         "log_alpha21": res["log10_alpha21"]}
    e1 = float(mu.surface(10.0, 0.0, p))
    e2 = float(mu.surface(0.0, 30.0, p))
    e3 = float(mu.surface(10.0, 30.0, p))
    assert res["beta_obs"] == pytest.approx(
        (e3 - max(e1, e2)) / (max(e1, e2) - res["E0"]), rel=1e-9)


def test_unreliable_fit_is_noted():
    # drug 2's EC50 beyond the highest dose tested
    true = dict(E0=0.0, E1=60.0, E2=50.0, E3=80.0, logC1=math.log10(0.5),
                logC2=math.log10(300.0), h1=1.5, h2=1.0, log_alpha12=0.0,
                log_alpha21=0.0)
    R = mu.surface(G1, G2, true)
    f1, f2 = sy._fit_ll4(D1, R[:, 0]), sy._fit_ll4(D2, R[0, :])
    res = mu.fit_musyc(R, D1.tolist(), D2.tolist(), f1, f2, n_ci=0)
    assert "ci95" not in res
    assert any("drug 2" in n for n in res["notes"])


def test_synergy_option_and_api():
    _, R = _synthetic()
    off = sy.synergy(conc1=D1.tolist(), conc2=D2.tolist(),
                     responses=R.tolist(), p_iterations=0)
    assert off["musyc"] is None
    res = api.analyze({"analysis": "synergy",
                       "data": {"conc1": D1.tolist(), "conc2": D2.tolist(),
                                "responses": R.tolist()},
                       "options": {"musyc": True, "musyc_ci": 20}})
    m = res["musyc"]
    assert m["n_ci"] == 20
    assert m["log10_alpha12"] == pytest.approx(1.0, abs=0.15)
    assert m["beta"] > 0                    # synergistic efficacy
    assert len(m["fitted"]) == len(D1) and len(m["fitted"][0]) == len(D2)
