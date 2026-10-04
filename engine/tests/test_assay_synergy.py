"""Drug-combination synergy (assay_synergy).

HSA and Bliss are pinned per cell to the SynergyFinder 3.20 vignette
(mathews_screening_data block 1, ispinesib x ibrutinib, % viability;
printed to three significant figures); the ibrutinib monotherapy LL.4
fit to the plateaus that vignette's Loewe references expose. Loewe is
checked against closed forms (sham combination; two hyperbolic drugs
with a common maximum), ZIP against its defining property (delta 0 for
Bliss-independent drugs), and Chou-Talalay against an exact median-
effect system.
"""

import math

import numpy as np
import pytest

from opendose import api, assay_synergy as sy

# SynergyFinder (Bioconductor synergyfinder 3.20.0) data/mathews_screening_data,
# block 1: rows = ispinesib (nM), columns = ibrutinib (nM), % viability.
IBRUTINIB = [50, 12.5, 3.125, 0.7812, 0.1954, 0]
ISPINESIB = {
    2500: [7.802637, 6.831317, 15.089589, 24.503885, 38.043076, 45.790634],
    625: [5.933393, 6.551686, 14.096026, 23.261131, 38.052074, 39.372620],
    156.25: [5.724235, 7.612191, 12.425198, 25.934008, 33.517440, 39.237450],
    39.0626: [6.276571, 7.064885, 13.511189, 29.103006, 36.871628, 39.754314],
    9.7656: [8.948099, 14.995420, 11.760282, 28.036972, 36.374866, 40.775620],
    0: [28.695145, 46.666996, 58.826880, 118.138510, 103.760060, 122.956184],
}


def _mathews():
    recs = [{"conc1": r, "conc2": c, "response": v}
            for r, vals in ISPINESIB.items() for c, v in zip(IBRUTINIB, vals)]
    return sy.synergy(recs, response_kind="viability", drug1="ispinesib",
                      drug2="ibrutinib")


def test_hsa_and_bliss_match_synergyfinder_vignette():
    res = _mathews()
    i = res["conc1"].index(2500)
    js = [res["conc2"].index(c) for c in (50, 12.5, 3.125, 0.7812, 0.1954)]
    m = res["models"]
    printed = {  # vignette str() output, conc1 = 2500, conc2 = 50 .. 0.195
        "response": [92.2, 93.2, 84.9, 75.5, 62],
        "hsa_ref": [71.3, 54.2, 54.2, 54.2, 54.2],
        "hsa_syn": [20.89, 38.96, 30.7, 21.29, 7.75],
        "bliss_ref": [86.9, 78.6, 73.1, 45.9, 52.5],
        "bliss_syn": [5.34, 14.54, 11.85, 29.6, 9.47],
    }
    got = {
        "response": [res["response"][i][j] for j in js],
        "hsa_ref": [m["hsa"]["reference"][i][j] for j in js],
        "hsa_syn": [m["hsa"]["synergy"][i][j] for j in js],
        "bliss_ref": [m["bliss"]["reference"][i][j] for j in js],
        "bliss_syn": [m["bliss"]["synergy"][i][j] for j in js],
    }
    for key, values in printed.items():
        for g, p in zip(got[key], values):
            assert g == pytest.approx(p, abs=0.051), key


def test_ibrutinib_fit_matches_drc_plateaus():
    """The vignette's Loewe references at that row are 62.3 (four cells)
    and -14.9: the grid ends of SynergyFinder's search, i.e. the upper
    and lower plateaus of drc's LL.4 fit to ibrutinib alone."""
    p = _mathews()["monotherapy"]["drug2"]["params"]
    assert p["Top"] == pytest.approx(62.3, abs=0.05)
    assert p["Bottom"] == pytest.approx(-14.9, abs=0.06)


def test_hsa_bliss_by_hand_and_summary_mean():
    c1, c2 = [0, 1, 2], [0, 10, 20]
    R = [[0, 20, 30], [10, 40, 50], [25, 45, 80]]
    res = sy.synergy(conc1=c1, conc2=c2, responses=R)
    h, b = res["models"]["hsa"]["synergy"], res["models"]["bliss"]["synergy"]
    assert h[1][1] == pytest.approx(40 - max(10, 20))
    assert h[2][2] == pytest.approx(80 - max(25, 30))
    assert b[1][2] == pytest.approx(50 - (10 + 30 - 10 * 30 / 100))
    assert b[2][1] == pytest.approx(45 - (25 + 20 - 25 * 20 / 100))
    assert res["scores"]["hsa"] == pytest.approx(
        np.mean([40 - 20, 50 - 30, 45 - 25, 80 - 30]))
    assert h[0] == [0.0, 0.0, 0.0] and [r[0] for r in h] == [0.0, 0.0, 0.0]


def _ll4(x, e, h, top=100.0, bottom=0.0):
    x = np.asarray(x, float)
    with np.errstate(divide="ignore"):
        return bottom + (top - bottom) / (1 + np.power(e / x, h))


def test_loewe_sham_combination_is_dose_addition():
    p = {"Bottom": 0.0, "Top": 90.0, "EC50": 2.0, "HillSlope": 1.3}
    for d1, d2 in [(0.5, 0.5), (1.0, 3.0), (4.0, 0.25)]:
        y = sy.loewe_response(d1, d2, p, p)
        assert y == pytest.approx(float(_ll4([d1 + d2], 2.0, 1.3, 90)[0]),
                                  rel=1e-10)


def test_loewe_closed_form_hyperbolic_drugs():
    """h = 1, common maximum T: y = T*(d1/e1 + d2/e2)/(1 + d1/e1 + d2/e2)."""
    p1 = {"Bottom": 0.0, "Top": 100.0, "EC50": 1.5, "HillSlope": 1.0}
    p2 = {"Bottom": 0.0, "Top": 100.0, "EC50": 8.0, "HillSlope": 1.0}
    for d1, d2 in [(0.3, 2.0), (3.0, 10.0), (0.05, 40.0)]:
        s = d1 / 1.5 + d2 / 8.0
        assert sy.loewe_response(d1, d2, p1, p2) == pytest.approx(
            100 * s / (1 + s), rel=1e-10)
    # a drug that cannot reach the effect contributes nothing
    weak = {"Bottom": 0.0, "Top": 30.0, "EC50": 1.0, "HillSlope": 1.0}
    y = sy.loewe_response(5.0, 4.0, p2, weak)
    assert y > 30.0


def _bliss_surface(c1, c2, e1=1.0, h1=1.2, e2=5.0, h2=0.8):
    y1, y2 = _ll4(c1, e1, h1), _ll4(c2, e2, h2)
    return y1[:, None] + y2[None, :] - np.outer(y1, y2) / 100.0


def test_zip_delta_is_zero_for_bliss_independent_drugs():
    c1 = [0, 0.1, 0.3, 1, 3, 10]
    c2 = [0, 0.5, 1.5, 5, 15, 50]
    res = sy.synergy(conc1=c1, conc2=c2,
                     responses=_bliss_surface(c1, c2).tolist())
    np.testing.assert_allclose(res["models"]["zip"]["synergy"], 0.0,
                               atol=1e-6)
    assert res["scores"]["bliss"] == pytest.approx(0.0, abs=1e-9)
    assert res["scores"]["zip"] == pytest.approx(0.0, abs=1e-6)
    # Loewe of these two drugs (different slopes) is not Bliss
    assert abs(res["scores"]["loewe"]) > 0.1


def test_replicates_give_scores_with_sd():
    rng = np.random.default_rng(4)
    c1, c2 = [0, 0.3, 1, 3], [0, 1.5, 5, 15]
    base = _bliss_surface(c1, c2)
    base[1:, 1:] += 8.0                     # synergy in every combination
    reps = [(base + rng.normal(0, 2, base.shape)).tolist() for _ in range(3)]
    res = sy.synergy(conc1=c1, conc2=c2, responses=reps)
    assert res["n_replicates"] == 3
    for name in ("hsa", "bliss", "loewe", "zip"):
        m = res["models"][name]
        assert len(m["replicate_scores"]) == 3
        assert m["score_sd"] == pytest.approx(np.std(m["replicate_scores"],
                                                     ddof=1))
        assert len(m["synergy_sd"]) == 4
    mean = np.mean(np.array(reps), axis=0)
    np.testing.assert_allclose(res["response"], mean)
    assert res["scores"]["bliss"] > 0


def test_viability_records_and_baseline_correction():
    c1, c2 = [0, 0.3, 1, 3, 10], [0, 1.5, 5, 15, 50]
    R = _bliss_surface(c1, c2) - 12.0       # a negative baseline
    recs = [{"conc1": a, "conc2": b, "response": 100 - R[i, j]}
            for i, a in enumerate(c1) for j, b in enumerate(c2)]
    plain = sy.synergy(recs, response_kind="viability")
    np.testing.assert_allclose(plain["response"], R)
    part = sy.synergy(recs, response_kind="viability",
                      baseline_correction="part")
    base = part["baseline"]
    assert base == pytest.approx(-12.0, abs=1e-6)   # min of fitted monos
    got = np.array(part["response"])
    neg = R < 0
    np.testing.assert_allclose(got[neg], R[neg] - (100 - R[neg]) / 100 * base)
    np.testing.assert_allclose(got[~neg], R[~neg])


def test_chou_talalay_exact_median_effect_and_sham_ci():
    m, dm = 1.4, 2.0

    def fa(d):
        return 1.0 / (1.0 + (dm / d) ** m)
    doses = [0, 0.5, 1, 2, 4, 8]
    # sham: drug 2 is drug 1, combination effect = fa(d1 + d2)
    R = np.array([[100 * fa(a + b) if a + b > 0 else 0.0 for b in doses]
                  for a in doses])
    res = sy.synergy(conc1=doses, conc2=doses, responses=R.tolist())
    ct = res["chou_talalay"]
    for key in ("drug1", "drug2"):
        assert ct[key]["m"] == pytest.approx(m, rel=1e-10)
        assert ct[key]["Dm"] == pytest.approx(dm, rel=1e-10)
        assert ct[key]["r"] == pytest.approx(1.0, rel=1e-12)
    for c in ct["combinations"]:
        assert c["ci"] == pytest.approx(1.0, rel=1e-9)
        assert c["interpretation"] == "nearly additive"
        # DRI = Dx/d, and 1/DRI1 + 1/DRI2 = CI
        assert 1 / c["dri1"] + 1 / c["dri2"] == pytest.approx(c["ci"])
    assert sy.ci_interpretation(0.5) == "synergism"
    assert sy.ci_interpretation(2.0) == "antagonism"


def test_api_synergy_matrix_payload():
    c1 = [0, 0.1, 0.3, 1, 3, 10]
    c2 = [0, 0.5, 1.5, 5, 15, 50]
    res = api.analyze({"analysis": "synergy",
                       "data": {"conc1": c1, "conc2": c2,
                                "responses": _bliss_surface(c1, c2).tolist()},
                       "options": {"drug1": "A", "drug2": "B"}})
    assert "error" not in res, res.get("error")
    assert set(res["landscapes"]) == {"hsa", "bliss", "loewe", "zip"}
    assert len(res["landscapes"]["zip"]) == 6
    assert res["monotherapy"]["drug1"]["params"]["EC50"] == pytest.approx(
        1.0, rel=1e-6)
    assert math.isfinite(res["scores"]["hsa"])


def test_chou_talalay_vignette_block_reports_no_meaningless_indices():
    """Mathews block 1: ispinesib alone sits on its plateau (fa 0.54-0.61
    over 9.8-2500 nM), so its median-effect line is flat (m = -0.028,
    r = -0.55). Indices built on it reached 1e+28 and read "very strong
    antagonism" next to positive Bliss and HSA scores. They are now
    withheld, with the reason, and said so in the warnings; every
    reported value is a finite number."""
    res = _mathews()
    ct = res["chou_talalay"]
    assert ct["drug1"]["valid"] is False
    assert ct["drug1"]["m"] < 0
    assert ct["drug1"]["r"] == pytest.approx(-0.551, abs=1e-3)
    assert ct["drug2"]["valid"] is True
    assert ct["drug2"]["r_squared"] >= sy.MEDIAN_EFFECT_MIN_R2
    for c in ct["combinations"]:
        assert c["ci"] is None and c["interpretation"] is None
        assert "ispinesib" in c["reason"] and "not positive" in c["reason"]
    assert ct["n_computed"] == 0 and ct["fa_ci"] == []
    assert any("Chou-Talalay" in w for w in res["warnings"])
    # the synergy scores themselves are unchanged and positive
    assert res["scores"]["bliss"] > 0 and res["scores"]["hsa"] > 0


def _ct_synergistic_matrix(ci_true=0.5, m=1.2, dm1=2.0, dm2=5.0):
    """Median-effect monotherapies and combinations built with a known
    combination index: (d1/Dm1 + d2/Dm2) (fa/fu)^(-1/m) = CI."""
    c1 = [0, 0.25, 0.5, 1, 2, 4]
    c2 = [0, 0.6, 1.25, 2.5, 5, 10]
    R = np.zeros((6, 6))
    for i, a in enumerate(c1):
        for j, b in enumerate(c2):
            s = a / dm1 + b / dm2
            if a == 0 or b == 0:
                odds = s ** m          # single drug: CI = 1 by definition
            else:
                odds = (s / ci_true) ** m
            R[i, j] = 100 * odds / (1 + odds) if s > 0 else 0.0
    return c1, c2, R


def test_chou_talalay_finite_and_agrees_with_bliss_hsa_on_clear_synergy():
    c1, c2, R = _ct_synergistic_matrix()
    res = sy.synergy(conc1=c1, conc2=c2, responses=R.tolist())
    ct = res["chou_talalay"]
    assert ct["drug1"]["valid"] and ct["drug2"]["valid"]
    cis = [c["ci"] for c in ct["combinations"]]
    assert all(v is not None and math.isfinite(v) for v in cis)
    for v in cis:
        assert v == pytest.approx(0.5, rel=1e-9)
    # sign agreement with Bliss and HSA cell by cell (synergy > 0 <=>
    # CI < 1) for the majority of cells; the reference models differ, so
    # full agreement is not required
    bliss = np.array(res["models"]["bliss"]["synergy"])
    hsa = np.array(res["models"]["hsa"]["synergy"])
    agree_b = agree_h = 0
    for c in ct["combinations"]:
        i, j = c1.index(c["conc1"]), c2.index(c["conc2"])
        agree_b += (bliss[i][j] > 0) == (c["ci"] < 1)
        agree_h += (hsa[i][j] > 0) == (c["ci"] < 1)
        assert "synergism" in c["interpretation"]
    n = len(ct["combinations"])
    assert agree_b > n / 2 and agree_h > n / 2
    assert res["scores"]["bliss"] > 0 and res["scores"]["hsa"] > 0


def test_chou_talalay_withholds_cells_with_fa_at_the_bounds():
    c1, c2, R = _ct_synergistic_matrix()
    R[5, 5] = 100.0   # complete kill: fa = 1 has no median-effect dose
    R[1, 1] = 0.0
    ct = sy.synergy(conc1=c1, conc2=c2, responses=R.tolist())["chou_talalay"]
    by = {(c["conc1"], c["conc2"]): c for c in ct["combinations"]}
    for key in ((c1[5], c2[5]), (c1[1], c2[1])):
        assert by[key]["ci"] is None
        assert "strictly between 0 and 1" in by[key]["reason"]
    assert ct["n_computed"] == len(ct["combinations"]) - 2
