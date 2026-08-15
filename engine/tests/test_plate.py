"""Plate quantification tests.

The SRB-file tests run against the committed synthetic fixture
(fixtures/synthetic_srb_plate.xlsx), whose ground truth is analytic:
two fictional cell lines follow exact 4PL curves, so every corrected
mean and viability value is known in closed form independently of the
code under test. Regenerate with fixtures/make_synthetic_plate.py.
"""

from pathlib import Path

import pytest

from opendose.plate import blank_mean, parse_well, quantify_plate
from opendose.plate_io import find_plate_grid, parse_text, parse_xlsx

SYNTH_XLSX = Path(__file__).parent / "fixtures" / "synthetic_srb_plate.xlsx"

SRB_LAYOUT = {
    "blank_wells": ["H3", "H4", "H5"],
    "groups": [
        {"name": "Line S", "rows": ["B", "C", "D"]},
        {"name": "Line R", "rows": ["E", "F", "G"]},
    ],
    "columns": [
        {"col": 2, "dose": 0.0},
        {"col": 3, "dose": 5.0}, {"col": 4, "dose": 3.0},
        {"col": 5, "dose": 2.0}, {"col": 6, "dose": 1.0},
        {"col": 7, "dose": 0.7}, {"col": 8, "dose": 0.5},
        {"col": 9, "dose": 0.3}, {"col": 10, "dose": 0.1},
        {"col": 11, "dose": 0.05},
    ],
    "control_dose": 0.0,
}

# Analytic 4PL ground truth (top 2.4, bottom 0.06, hill 1, blank 0.100),
# printed by make_synthetic_plate.py (dose -> corrected mean).
TRUTH_S = {5.0: 0.2727273, 3.0: 0.3942857, 2.0: 0.528, 1.0: 0.84,
           0.7: 1.035, 0.5: 1.23, 0.3: 1.5225, 0.1: 2.01,
           0.05: 2.1872727}
TRUTH_R = {5.0: 0.7285714, 3.0: 0.996, 2.0: 1.23, 1.0: 1.62,
           0.7: 1.7933333, 0.5: 1.932, 0.3: 2.0947826, 0.1: 2.2885714,
           0.05: 2.3429268}
CONTROL_MEAN = 2.4


def test_parse_well():
    assert parse_well("A1") == (0, 0)
    assert parse_well("H12") == (7, 11)
    assert parse_well("b3") == (1, 2)
    with pytest.raises(ValueError):
        parse_well("Z99x")


def test_parse_text_with_labels():
    text = "\t1\t2\t3\t4\t5\t6\t7\t8\t9\t10\t11\t12\n" + "\n".join(
        f"{r}\t" + "\t".join(str(0.1 * (i + 1)) for i in range(12))
        for r in "ABCDEFGH"
    )
    grid = parse_text(text)
    assert len(grid) == 8 and len(grid[0]) == 12
    assert grid[0][0] == pytest.approx(0.1)


class TestSyntheticSRBFile:
    @pytest.fixture(scope="class")
    def grid(self):
        return parse_xlsx(SYNTH_XLSX.read_bytes())

    def test_grid_found_and_shaped(self, grid):
        assert len(grid) == 8
        assert len(grid[0]) == 12
        # B2 is Line S's control replicate with offset -0.003:
        # 2.4 + 0.100 - 0.003
        assert grid[1][1] == pytest.approx(2.497)
        assert grid[7][2] == pytest.approx(0.100)  # blank H3

    def test_blank_matches_construction(self, grid):
        assert blank_mean(grid, ["H3", "H4", "H5"]) == \
            pytest.approx(0.100, abs=1e-9)

    def test_corrected_means_match_analytic_truth(self, grid):
        layout = dict(SRB_LAYOUT, output="corrected")
        result = quantify_plate(grid, layout)
        for group, truth in zip(result["groups"], (TRUTH_S, TRUTH_R)):
            for dose, values in zip(group["doses"], group["values"]):
                mean = sum(values) / len(values)
                assert mean == pytest.approx(truth[dose], abs=5e-6), \
                    f"{group['name']} @ {dose} uM"

    def test_viability_normalized_to_own_control(self, grid):
        layout = dict(SRB_LAYOUT, output="viability")
        result = quantify_plate(grid, layout)
        line_s, line_r = result["groups"]
        assert line_s["control_mean"] == pytest.approx(CONTROL_MEAN, abs=5e-6)
        assert line_r["control_mean"] == pytest.approx(CONTROL_MEAN, abs=5e-6)
        # Viability at the lowest dose follows from the 4PL directly
        v_s = line_s["values"][line_s["doses"].index(0.05)]
        v_r = line_r["values"][line_r["doses"].index(0.05)]
        assert sum(v_s) / 3 == pytest.approx(TRUTH_S[0.05] / CONTROL_MEAN * 100, abs=0.01)
        assert sum(v_r) / 3 == pytest.approx(TRUTH_R[0.05] / CONTROL_MEAN * 100, abs=0.01)

    def test_inhibition_is_complement(self, grid):
        via = quantify_plate(grid, dict(SRB_LAYOUT, output="viability"))
        inh = quantify_plate(grid, dict(SRB_LAYOUT, output="inhibition"))
        for gv, gi in zip(via["groups"], inh["groups"]):
            for rv, ri in zip(gv["values"], gi["values"]):
                for v, i in zip(rv, ri):
                    assert v + i == pytest.approx(100.0)


def test_find_plate_grid_ignores_decorations():
    matrix = [["junk", None], [None, "more junk"]]
    assert find_plate_grid(matrix) is None
