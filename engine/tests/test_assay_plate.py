"""Plate QC and layout (assay_plate).

% of control is checked against plate.quantify_plate on the committed
synthetic SRB plate (its analytic ground truth is in test_plate.py), Z'
and the signal window against hand calculations (Zhang 1999; Assay
Guidance Manual), and the edge-effect check on synthetic uniformity
plates."""

from pathlib import Path

import numpy as np
import pytest

from opendose import api, assay_plate as ap
from opendose.plate import quantify_plate
from opendose.plate_io import parse_xlsx

SYNTH_XLSX = Path(__file__).parent / "fixtures" / "synthetic_srb_plate.xlsx"
DOSES = {3: 5.0, 4: 3.0, 5: 2.0, 6: 1.0, 7: 0.7, 8: 0.5, 9: 0.3, 10: 0.1,
         11: 0.05}


def test_expand_wells_and_map():
    assert ap.expand_wells("A1:B3") == ["A1", "A2", "A3", "B1", "B2", "B3"]
    assert ap.expand_wells(["H12", "p24"]) == ["H12", "P24"]
    pm = ap.build_plate_map([
        {"wells": "B2:B4", "role": "sample", "compound": "X",
         "concentrations": [1, 10, 100], "replicate": 1},
        {"wells": "B4", "role": "vehicle"}])
    assert pm["B3"]["concentration"] == 10.0
    assert pm["B4"]["role"] == "negative"           # later entry wins
    with pytest.raises(ValueError):
        ap.build_plate_map([{"wells": "A1:A3", "concentrations": [1, 2]}])


def test_percent_of_control_matches_quantify_plate_on_srb_fixture():
    grid = parse_xlsx(SYNTH_XLSX.read_bytes())
    layout = {"blank_wells": ["H3", "H4", "H5"],
              "groups": [{"name": "Line S", "rows": ["B", "C", "D"]},
                         {"name": "Line R", "rows": ["E", "F", "G"]}],
              "columns": [{"col": 2, "dose": 0.0}] + [
                  {"col": c, "dose": d} for c, d in DOSES.items()],
              "control_dose": 0.0}
    ref = quantify_plate(grid, layout)
    pm = [{"wells": ["H3", "H4", "H5"], "role": "blank"}]
    for name, rows in (("Line S", "BCD"), ("Line R", "EFG")):
        pm.append({"wells": [f"{r}2" for r in rows], "role": "negative",
                   "compound": name})
        for k, r in enumerate(rows):
            pm.append({"wells": f"{r}3:{r}11", "role": "sample",
                       "compound": name, "replicate": k + 1,
                       "concentrations": [DOSES[c] for c in range(3, 12)]})
    res = ap.plate_qc(grid, pm, normalization="percent_of_control")
    assert res["blank"] == pytest.approx(ref["blank"])
    for group in ref["groups"]:
        table = [t for t in res["dose_response"]
                 if t["compound"] == group["name"]][0]
        # plate.py lists doses in ascending order as well
        assert table["x"] == group["doses"]
        np.testing.assert_allclose(table["datasets"][0]["ys"],
                                   group["values"], rtol=1e-12)
    assert res["combined"]["x"] == ref["groups"][0]["doses"]


def _control_plate(neg, pos, blank=None):
    grid = [[None] * 12 for _ in range(8)]
    pm = []
    for i, v in enumerate(neg):
        grid[i][0] = v
        pm.append({"wells": f"{'ABCDEFGH'[i]}1", "role": "negative"})
    for i, v in enumerate(pos):
        grid[i][11] = v
        pm.append({"wells": f"{'ABCDEFGH'[i]}12", "role": "positive"})
    for i, v in enumerate(blank or []):
        grid[i][6] = v
        pm.append({"wells": f"{'ABCDEFGH'[i]}7", "role": "blank"})
    return grid, pm


def test_z_prime_and_signal_window_by_hand():
    neg = [100.0, 104.0, 96.0, 101.0, 99.0, 98.0, 102.0, 100.0]
    pos = [10.0, 12.0, 8.0, 11.0, 9.0, 10.0, 10.5, 9.5]
    grid, pm = _control_plate(neg, pos)
    res = ap.plate_qc(grid, pm, normalization="percent_inhibition")
    sn, sp = np.std(neg, ddof=1), np.std(pos, ddof=1)
    mn, mp = np.mean(neg), np.mean(pos)
    qc = res["qc"]
    assert qc["z_prime"] == pytest.approx(1 - 3 * (sn + sp) / abs(mn - mp))
    assert qc["category"] == "excellent"
    assert qc["signal_to_background"] == pytest.approx(mn / mp)
    assert qc["signal_to_noise"] == pytest.approx((mn - mp) / sp)
    assert qc["signal_window"] == pytest.approx(
        ((mn - mp) - 3 * (sn + sp)) / sn)
    mad = lambda v: 1.4826 * np.median(np.abs(np.array(v) - np.median(v)))
    assert qc["robust_z_prime"] == pytest.approx(
        1 - 3 * (mad(neg) + mad(pos)) / abs(np.median(neg) - np.median(pos)))
    assert qc["negative"]["cv_pct"] == pytest.approx(100 * sn / mn)
    # normalisations of a control well
    w = {x["well"]: x for x in res["wells"]}
    assert w["A1"]["normalized"] == pytest.approx(100 * (mn - 100) / (mn - mp))
    act = ap.plate_qc(grid, pm, normalization="percent_activity")
    w2 = {x["well"]: x for x in act["wells"]}
    assert w2["A12"]["normalized"] == pytest.approx(100 * (10 - mp) / (mn - mp))
    bad = ap.z_prime([10, 60, 30], [50, 90, 70])
    assert bad["z_prime"] < 0 and bad["category"] == "unusable"


def _uniform(edge_boost=0.0, seed=0):
    rng = np.random.default_rng(seed)
    grid = [[1.0 + rng.normal(0, 0.02) for _ in range(12)] for _ in range(8)]
    for r in range(8):
        for c in range(12):
            if r in (0, 7) or c in (0, 11):
                grid[r][c] *= 1 + edge_boost
    return grid


def test_edge_effect_check():
    pm = [{"wells": "A1:H12", "role": "negative"}]
    flat = ap.plate_qc(_uniform(), pm, normalization="none")
    assert flat["edge_effect"]["edge_vs_interior"]["p"] > 0.01
    assert flat["edge_effect"]["n_edge"] == 36
    assert flat["edge_effect"]["n_interior"] == 60
    hot = ap.plate_qc(_uniform(0.15), pm, normalization="none")
    e = hot["edge_effect"]
    assert e["edge_vs_interior"]["p"] < 1e-6
    assert e["edge_vs_interior"]["difference_pct"] == pytest.approx(15, abs=2)
    assert e["rows"]["anova"]["p"] < 1e-3 and e["columns"]["anova"]["p"] < 1e-3
    assert "edge wells differ" in " ".join(hot["qc_flags"])


def test_replicate_cv_flags_and_api_384():
    grid = [[None] * 24 for _ in range(16)]
    pm = [{"wells": "A1:D1", "role": "negative"},
          {"wells": "E1:H1", "role": "positive"}]
    for r in range(4):
        grid[r][0] = 1.0 + 0.01 * r
        grid[r + 4][0] = 0.1 + 0.001 * r
    concs = [0.01, 0.1, 1, 10]
    for rep, row in enumerate("IJK"):
        pm.append({"wells": f"{row}2:{row}5", "role": "sample",
                   "compound": "Y", "concentrations": concs,
                   "replicate": rep + 1})
        for j, c in enumerate(concs):
            grid["ABCDEFGHIJKLMNOP".index(row)][j + 1] = \
                0.1 + 0.9 / (1 + c) + (0.3 if (c == 1 and rep == 0) else 0)
    res = api.analyze({"analysis": "plate_qc",
                       "data": {"grid": grid, "plate_map": pm},
                       "options": {"normalization": "percent_activity"}})
    assert "error" not in res, res.get("error")
    assert res["format"] == 384 and res["n_columns"] == 24
    flagged = [e for e in res["replicate_cv"] if e["flag"]]
    assert [e["concentration"] for e in flagged] == [1.0]
    t = res["dose_response"][0]
    assert t["x"] == concs and len(t["datasets"][0]["ys"][0]) == 3
