"""Higher-order synergy (opendose.synergy_multi): exact cases for three
drugs (Bliss-independent drugs give Bliss and ZIP synergy 0; a sham
combination of one drug with itself gives Loewe synergy 0; HSA by hand),
and agreement with the two-drug engine (assay_synergy) when n = 2."""

import itertools
import sys
from pathlib import Path

import numpy as np
import pytest

from opendose import api, assay_synergy as sy, synergy_multi as sm

sys.path.insert(0, str(Path(__file__).parent))
from test_assay_synergy import IBRUTINIB, ISPINESIB  # noqa: E402

C = [[0, 0.1, 0.3, 1, 3, 10], [0, 0.5, 1.5, 5, 15, 50],
     [0, 0.2, 0.6, 2, 6, 20]]
E, H, T = [1.0, 5.0, 2.0], [1.2, 0.8, 1.5], [100.0, 90.0, 80.0]


def _ll4(x, e, h, top=100.0):
    x = np.asarray(x, float)
    with np.errstate(divide="ignore"):
        return top / (1 + np.power(e / x, h))


def _bliss(a, b, c):
    return 100 * (1 - np.prod([1 - _ll4(x, E[i], H[i], T[i]) / 100
                               for i, x in enumerate((a, b, c))]))


def _records(fn, concs=C):
    return [{"conc1": a, "conc2": b, "conc3": c, "response": float(fn(a, b, c))}
            for a, b, c in itertools.product(*concs)]


def _combo(res):
    return [c for c in res["cells"] if c["n_drugs"] >= 2]


def test_bliss_independent_triple_has_no_bliss_or_zip_synergy():
    res = sm.synergy_multi(_records(_bliss))
    assert res["n_drugs"] == 3 and len(res["cells"]) == 216
    for c in _combo(res):
        assert c["bliss"]["synergy"] == pytest.approx(0.0, abs=1e-9)
        assert c["zip"]["synergy"] == pytest.approx(0.0, abs=1e-6)
    assert res["scores"]["bliss"] == pytest.approx(0.0, abs=1e-9)
    assert res["scores"]["zip"] == pytest.approx(0.0, abs=1e-6)
    # Bliss drugs are not Loewe-additive
    assert abs(res["scores"]["loewe"]) > 0.1


def test_sham_triple_is_loewe_additive_and_hsa_by_hand():
    def sham(a, b, c):
        return float(_ll4(a + b + c, 1.0, 1.3))
    res = sm.synergy_multi(_records(sham))
    for c in _combo(res):
        assert c["loewe"]["synergy"] == pytest.approx(0.0, abs=1e-8)
    cell = next(c for c in res["cells"] if c["concs"] == [1.0, 5.0, 2.0])
    assert cell["hsa"]["expected"] == pytest.approx(
        max(_ll4(v, 1.0, 1.3) for v in (1.0, 5.0, 2.0)))
    # a two-drug sub-combination is scored with the drugs present only
    pair = next(c for c in res["cells"] if c["concs"] == [1.0, 5.0, 0.0])
    assert pair["n_drugs"] == 2
    assert pair["bliss"]["expected"] == pytest.approx(
        100 * (1 - (1 - _ll4(1.0, 1.0, 1.3) / 100)
               * (1 - _ll4(5.0, 1.0, 1.3) / 100)))


def test_scores_count_sub_combinations_and_all_drug_cells_apart():
    res = sm.synergy_multi(_records(_bliss))
    hsa = [c["hsa"]["synergy"] for c in _combo(res)]
    full = [c["hsa"]["synergy"] for c in _combo(res) if c["n_drugs"] == 3]
    assert res["models"]["hsa"]["score"] == pytest.approx(np.mean(hsa))
    assert res["models"]["hsa"]["score_all_drugs"] == pytest.approx(
        np.mean(full))
    assert len(hsa) == 216 - 1 - 3 * 5 and len(full) == 125
    assert res["models"]["hsa"]["p_value"] == pytest.approx(
        sy.synergy_p(hsa))


def test_two_drugs_reproduce_the_two_drug_engine():
    recs = [{"conc1": r, "conc2": c, "response": v}
            for r, vals in ISPINESIB.items() for c, v in zip(IBRUTINIB, vals)]
    two = sy.synergy(recs, response_kind="viability")
    multi = sm.synergy_multi(recs, response_kind="viability")
    c1, c2 = two["conc1"], two["conc2"]
    for cell in _combo(multi):
        i, j = c1.index(cell["concs"][0]), c2.index(cell["concs"][1])
        for k in ("hsa", "bliss", "loewe", "zip"):
            assert cell[k]["synergy"] == pytest.approx(
                two["models"][k]["synergy"][i][j], abs=1e-9)
        assert cell["consensus"]["synergy"] == pytest.approx(
            two["consensus"]["synergy"][i][j], abs=1e-9)
    for k in ("hsa", "bliss", "loewe", "zip"):
        assert multi["scores"][k] == pytest.approx(two["scores"][k],
                                                   abs=1e-10)
        assert multi["models"][k]["p_value"] == pytest.approx(
            two["models"][k]["p_value"], rel=1e-9)
    assert multi["sensitivity"][0]["ri"] == pytest.approx(
        two["sensitivity"]["drug1"]["ri"])


def test_replicates_resampled_p_and_viability():
    rng = np.random.default_rng(3)
    concs = [[0, 0.3, 1, 3], [0, 1.5, 5, 15], [0, 0.6, 2, 6]]
    recs = []
    for rep in range(2):
        for a, b, c in itertools.product(*concs):
            v = _bliss(a, b, c) + (6.0 if sum(x > 0 for x in (a, b, c)) == 3
                                   else 0.0)
            recs.append({"conc1": a, "conc2": b, "conc3": c,
                         "response": 100 - (v + rng.normal(0, 2)),
                         "replicate": rep})
    res = sm.synergy_multi(recs, response_kind="viability", p_iterations=3,
                           drugs=["A", "B", "C"])
    assert res["n_replicates"] == 2 and res["drugs"] == ["A", "B", "C"]
    assert "3 resampled matrices" in res["p_value_basis"]
    assert len(res["models"]["bliss"]["replicate_scores"]) == 2
    assert res["models"]["bliss"]["score_all_drugs"] > 3
    again = sm.synergy_multi(recs, response_kind="viability", p_iterations=3,
                             drugs=["A", "B", "C"])
    assert again["models"]["bliss"]["p_value"] == \
        res["models"]["bliss"]["p_value"]


def test_input_checks_and_unmeasured_cells():
    recs = _records(_bliss)
    with pytest.raises(ValueError, match="zero dose"):
        sm.synergy_multi([r for r in recs if r["conc3"] != 0])
    with pytest.raises(ValueError, match="alone"):
        sm.synergy_multi([r for r in recs if not (
            r["conc1"] == 0.3 and r["conc2"] == 0 and r["conc3"] == 0)])
    # two names for three drugs: an error, never a dropped conc3 column
    with pytest.raises(ValueError, match="names"):
        sm.synergy_multi(recs, drugs=["A", "B"])
    with pytest.raises(ValueError, match="conc3"):
        sm.build_tensor(recs, n_drugs=2)
    with pytest.raises(ValueError, match="conc4"):
        sm.synergy_multi(recs[:-1] + [dict(recs[-1], conc4=1.0)])
    sparse = [r for r in recs if not (r["conc1"] == 3 and r["conc2"] == 15
                                       and r["conc3"] == 6)]
    res = sm.synergy_multi(sparse)
    assert any("1 of 216" in w for w in res["warnings"])
    assert len(res["cells"]) == 215


def test_api_routes_three_drugs():
    res = api.analyze({"analysis": "synergy",
                       "data": {"records": _records(_bliss)},
                       "options": {"drug1": "A", "drug2": "B", "drug3": "C"}})
    assert res["analysis"] == "synergy_multi"
    assert res["drugs"] == ["A", "B", "C"]
    assert res["scores"]["bliss"] == pytest.approx(0.0, abs=1e-9)
