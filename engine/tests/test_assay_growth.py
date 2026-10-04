"""Zwietering (1990) growth models with lag (assay_growth) and the OD
preprocessing helper. The preprocessing plus logistic fit is pinned to
the Growthcurver vignette (well A1)."""

import math

import numpy as np
import pytest

from opendose import api, assay_growth as ag, nlfit

TRUE = {"A": 3.2, "MuMax": 0.45, "Lag": 3.5, "Nu": 0.6, "Y0": -2.5}
T = np.linspace(0, 30, 31)


@pytest.mark.parametrize("model", ag.MODEL_IDS)
def test_exact_data_recovers_parameters(model):
    spec = nlfit.MODELS[model]
    y = spec.func(T, TRUE)
    fit = nlfit.fit_model(T.tolist(), y.tolist(), model)
    for p in spec.params:
        assert fit["fitted_values"][p] == pytest.approx(TRUE[p], rel=1e-6)
    assert fit["params"]["DoublingTime"]["value"] == pytest.approx(
        math.log(2) / TRUE["MuMax"], rel=1e-6)


@pytest.mark.parametrize("kind", ["gompertz", "logistic", "richards"])
def test_parameters_have_their_zwietering_meaning(kind):
    """MuMax is the steepest slope and Lag the X where that tangent
    crosses y = 0 (the reparameterisation's definition)."""
    spec = nlfit.MODELS[f"zwietering_{kind}"]
    t = np.linspace(0, 30, 300001)
    y = spec.func(t, TRUE)
    dy = np.gradient(y, t)
    i = int(np.argmax(dy))
    assert dy[i] == pytest.approx(TRUE["MuMax"], rel=1e-6)
    lag = t[i] - y[i] / dy[i]
    assert lag == pytest.approx(TRUE["Lag"], abs=1e-4)
    assert float(spec.func(np.array([1e4]), TRUE)[0]) == pytest.approx(
        TRUE["A"], rel=1e-9)


def test_richards_reduces_to_logistic_and_gompertz():
    rich = nlfit.MODELS["zwietering_richards"].func
    logi = nlfit.MODELS["zwietering_logistic"].func
    gomp = nlfit.MODELS["zwietering_gompertz"].func
    np.testing.assert_allclose(rich(T, dict(TRUE, Nu=1.0)), logi(T, TRUE),
                               rtol=1e-12, atol=1e-14)
    np.testing.assert_allclose(rich(T, dict(TRUE, Nu=1e-7)), gomp(T, TRUE),
                               rtol=1e-5, atol=1e-6)


def test_noisy_fit_doubling_time_ci_is_transform_of_mumax_ci():
    rng = np.random.default_rng(11)
    y = nlfit.MODELS["zwietering_gompertz"].func(T, TRUE) \
        + rng.normal(0, 0.05, T.size)
    fit = nlfit.fit_model(T.tolist(), y.tolist(), "zwietering_gompertz")
    lo, hi = fit["params"]["MuMax"]["ci95"]
    td = fit["params"]["DoublingTime"]
    assert td["ci95"] == pytest.approx([math.log(2) / hi, math.log(2) / lo],
                                       rel=1e-12)
    assert td["ci95"][0] < math.log(2) / TRUE["MuMax"] < td["ci95"][1]


def test_prepare_growth_data_blank_log_relative():
    x = [0, 1, 2, 3]
    ds = [{"name": "well", "ys": [[0.15, 0.17], [0.30, 0.32], [0.60, None],
                                  [0.04, 1.30]]},
          {"name": "blank", "ys": [[0.05], [0.05], [0.05], [0.05]]}]
    out = ag.prepare_growth_data(x, ds, blank_dataset=1, log="ln",
                                 relative_to_first=True)
    assert [d["name"] for d in out["datasets"]] == ["well"]
    ys = out["datasets"][0]["ys"]
    base = np.mean([math.log(0.10), math.log(0.12)])
    assert ys[1][0] == pytest.approx(math.log(0.25) - base, rel=1e-12)
    assert ys[2][1] is None
    assert ys[3][0] is None and out["n_nonpositive_dropped"] == 1
    assert ys[3][1] == pytest.approx(math.log(1.25) - base, rel=1e-12)
    plain = ag.prepare_growth_data(x, ds[:1], blank=0.05, log=None)
    assert plain["datasets"][0]["ys"][0][0] == pytest.approx(0.10)


def test_models_listed_and_fit_through_dose_response():
    listing = api.analyze({"analysis": "list_models", "data": {},
                           "options": {}})
    ids = {m["id"]: m for m in listing["models"]}
    for mid in ag.MODEL_IDS:
        assert ids[mid]["family"] == "Growth equations"
        assert "DoublingTime" in ids[mid]["derived"]
    y = nlfit.MODELS["zwietering_logistic"].func(T, TRUE)
    res = api.analyze({"analysis": "dose_response",
                       "data": {"x": T.tolist(),
                                "datasets": [{"name": "c",
                                              "ys": [[v] for v in y]}]},
                       "options": {"model": "zwietering_logistic"}})
    p = res["datasets"][0]["fit"]["params"]
    assert p["Lag"]["value"] == pytest.approx(TRUE["Lag"], rel=1e-6)


# Growthcurver 0.3.1 (Sprouffske & Wagner 2016) example data growthdata$A1
# (OD every 10 min for 24 h), from the package's data file.
GROWTHCURVER_A1 = [
    0.0534858524434503, 0.048003358453399446, 0.05587450683933779,
    0.05131749211406058, 0.04516719465471465, 0.05293211350423123,
    0.04867728827865503, 0.049439062495930164, 0.04583044949907351,
    0.05189925407696059, 0.053054414993328844, 0.048778089389134784,
    0.05390487701739231, 0.042835442678388694, 0.04444627444488275,
    0.049008210586387504, 0.04983697625830766, 0.04670829664150585,
    0.0489356106491911, 0.048360025433779895, 0.04581130842388615,
    0.05093371436025015, 0.04872715708589749, 0.05396591236097898,
    0.05069344511163294, 0.05769772305280079, 0.050689094602772974,
    0.048536414287738944, 0.055712851383919, 0.05327043736091398,
    0.05600732695427761, 0.05854165395913974, 0.060575351991480904,
    0.05552748038604091, 0.05835142706194689, 0.05624570726861574,
    0.061746232503476745, 0.06442517154595442, 0.06693840334910603,
    0.07335358834224531, 0.0725702774778213, 0.07913971149073472,
    0.08268236612975378, 0.08816318854531076, 0.10179766165965648,
    0.1072727968315362, 0.11537859576183172, 0.12622733585870885,
    0.13649839947233475, 0.1539533746126573, 0.1664310651396151,
    0.1796588786529545, 0.19726909090287348, 0.21928759914494578,
    0.22623059063708462, 0.24399400485150152, 0.2612343240084021,
    0.274086149477242, 0.29078611911327357, 0.3041295364688812,
    0.3096842620777582, 0.33020574809846404, 0.3312201369443923,
    0.33565498376335784, 0.3422714546289306, 0.3485325497298401,
    0.35173298914659795, 0.35727320636488014, 0.3644511127012454,
    0.36678964765229727, 0.36866002747892096, 0.3736805447441912,
    0.37099234544647797, 0.3730899078642292, 0.36832768801099364,
    0.37950329976189295, 0.3738298405257407, 0.37959353855297523,
    0.37624198348237736, 0.3775337397580356, 0.38069902748479645,
    0.3779444434747048, 0.37454502867049577, 0.3747035952772234,
    0.37627659487375176, 0.3745916860170015, 0.37499653815134265,
    0.3801814448458603, 0.3791037047787861, 0.3776839301275685,
    0.373372432369891, 0.3831832885806705, 0.3757788795911594,
    0.37480429928968023, 0.3795280234666171, 0.3799108687829318,
    0.3787769344930455, 0.3785657869471567, 0.3788289289261518,
    0.37759523688780544, 0.3770400410626817, 0.38239800944169533,
    0.3778976088624225, 0.3791724886071769, 0.3797507455344823,
    0.378012882880292, 0.37451313996652835, 0.37550440442842775,
    0.3771048993558968, 0.38011368101440024, 0.3771303221895907,
    0.37305422636243707, 0.37956443288303005, 0.37581363377205096,
    0.3824883646347256, 0.378363273493137, 0.37192401859310953,
    0.3754908549743063, 0.38095476347835117, 0.37648521847390615,
    0.37183627573130823, 0.37657103589774193, 0.3809673004485556,
    0.3871846536110915, 0.37840516511731265, 0.37662708763063607,
    0.379796393046342, 0.38003131443064203, 0.3771195536290482,
    0.3768668891368055, 0.37393553161046517, 0.3830634754998883,
    0.379356505511687, 0.38266363499846257, 0.38263355171288266,
    0.3787074208441007, 0.3797743745597447, 0.38257337348462866,
    0.3804166879328521, 0.37609242626437384, 0.3713540593749447,
    0.38210551642589463, 0.3768744756978108, 0.37464998835209656,
    0.37857341872030825,
]


def test_growthcurver_vignette_logistic_fit():
    """SummarizeGrowth(d$time, d$A1) with bg_correct = "min" prints k
    0.336 (SE 0.000552), n0 1.82e-05 (SE 2.42e-06), r 1.118657 (SE
    0.0151), sigma 0.004685978 on 142 df, t_gen 0.62; its logistic is
    the curve-fitting guide's "Logistic growth" (YM = k, Y0 = n0, K = r)."""
    t = [i / 6 for i in range(145)]
    pre = ag.prepare_growth_data(
        t, [{"name": "A1", "ys": [[v] for v in GROWTHCURVER_A1]}],
        blank="min", log=None)
    y = [r[0] for r in pre["datasets"][0]["ys"]]
    assert min(y) == 0.0
    fit = nlfit.fit_model(t, y, "logistic_growth")
    p, g = fit["params"], fit["goodness"]
    assert p["YM"]["value"] == pytest.approx(0.336, abs=5e-4)
    assert p["YM"]["se"] == pytest.approx(0.000552, rel=2e-3)
    assert p["Y0"]["value"] == pytest.approx(1.82e-05, rel=3e-3)
    assert p["Y0"]["se"] == pytest.approx(2.42e-06, rel=3e-3)
    assert p["K"]["value"] == pytest.approx(1.118657, rel=5e-5)
    assert p["K"]["se"] == pytest.approx(0.0151, rel=3e-3)
    assert g["sy_x"] == pytest.approx(0.004685978, rel=1e-6)
    assert g["df"] == 142
    assert round(math.log(2) / p["K"]["value"], 2) == 0.62
