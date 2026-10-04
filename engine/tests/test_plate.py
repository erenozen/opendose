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


# --- plate shape detection (plate_io.locate_plate) -------------------------

from opendose.plate import ROW_LABELS  # noqa: E402
from opendose.plate_io import locate_plate, read_text, read_xlsx  # noqa: E402


def _grid_text(n_rows, n_cols, labels=True, header=True, preamble=""):
    lines = preamble.split("\n") if preamble else []
    if header:
        lines.append(("\t" if labels else "")
                     + "\t".join(str(i + 1) for i in range(n_cols)))
    for r in range(n_rows):
        vals = "\t".join(f"{r * 100 + c + 0.5}" for c in range(n_cols))
        lines.append((ROW_LABELS[r] + "\t" if labels else "") + vals)
    return "\n".join(lines)


PREAMBLE = "SpectraMax export\nWavelength:\t450\nTemperature:\t25.1\n"


@pytest.mark.parametrize("n_rows,n_cols,wells", [
    (8, 12, 96), (16, 24, 384), (32, 48, 1536), (6, 8, 48), (4, 6, 24),
    (3, 4, 12), (2, 3, 6)])
@pytest.mark.parametrize("labels", [True, False])
@pytest.mark.parametrize("header", [True, False])
@pytest.mark.parametrize("preamble", ["", PREAMBLE])
def test_plate_shapes_read_at_full_extent(n_rows, n_cols, wells, labels,
                                          header, preamble):
    found = read_text(_grid_text(n_rows, n_cols, labels, header, preamble))
    assert (found["rows"], found["cols"], found["format"]) == \
        (n_rows, n_cols, wells)
    assert found["warnings"] == []
    g = found["grid"]
    assert g[0][0] == 0.5
    assert g[n_rows - 1][n_cols - 1] == (n_rows - 1) * 100 + n_cols - 0.5


def test_labelled_384_is_not_read_as_its_top_left_96():
    found = read_text(_grid_text(16, 24, labels=True, header=True))
    assert found["format"] == 384
    assert found["grid"][15][23] == 1523.5   # P24
    assert found["grid"][8][12] == 812.5     # I13, outside the 96 corner
    # the grid-only helpers agree
    assert len(parse_text(_grid_text(16, 24))) == 16
    assert len(parse_text(_grid_text(16, 24))[0]) == 24


def test_labelled_384_with_empty_wells_and_no_header():
    text = _grid_text(16, 24, labels=True, header=False)
    lines = text.split("\n")
    # empty the last six columns of every row (a partly used plate)
    lines = ["\t".join(ln.split("\t")[:19] + [""] * 6) for ln in lines]
    found = read_text("\n".join(lines))
    assert (found["rows"], found["cols"], found["format"]) == (16, 24, 384)
    assert found["grid"][0][18] is None and found["grid"][0][17] == 17.5
    assert found["warnings"] == []


def test_unknown_shape_is_padded_with_a_warning_not_truncated():
    found = read_text(_grid_text(10, 14, labels=True, header=True))
    assert (found["rows"], found["cols"], found["format"]) == (16, 24, 384)
    assert found["grid"][9][13] == 913.5
    assert found["grid"][10][0] is None
    assert any("not a known plate format" in w for w in found["warnings"])


def test_transposed_bare_block_warns():
    found = read_text(_grid_text(12, 8, labels=False, header=False))
    assert found["grid"][11][7] == 1107.5
    assert any("swapped" in w for w in found["warnings"])


def test_numbers_beyond_the_labelled_header_are_reported():
    text = _grid_text(8, 12, labels=True, header=True)
    lines = text.split("\n")
    lines = [lines[0]] + [ln + "\t9.9" for ln in lines[1:]]  # a 13th column
    found = read_text("\n".join(lines))
    assert found["format"] == 96 and found["cols"] == 12
    assert any("not read" in w for w in found["warnings"])


def test_requested_format_pads_but_never_truncates():
    small = read_text(_grid_text(8, 12), plate_format=384)
    assert (small["rows"], small["cols"], small["format"]) == (16, 24, 384)
    assert small["warnings"]
    big = read_text(_grid_text(16, 24), plate_format=96)
    assert (big["rows"], big["cols"]) == (16, 24)
    assert any("no wells were dropped" in w for w in big["warnings"])


def test_first_of_two_stacked_labelled_plates():
    text = _grid_text(8, 12) + "\n\nPlate 2\n" + _grid_text(16, 24)
    found = read_text(text)
    assert found["format"] == 96 and found["warnings"] == []


def test_bare_block_with_adjacent_single_number_preamble():
    text = "450\n" + _grid_text(16, 24, labels=False, header=False)
    found = read_text(text)
    assert found["format"] == 384 and found["grid"][0][0] == 0.5


def test_xlsx_labelled_384_grid_with_preamble():
    openpyxl = pytest.importorskip("openpyxl")
    import io
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["Plate reader export"])
    ws.append(["Read 1:", "Absorbance @ 450"])
    ws.append([])
    ws.append([None, None] + list(range(1, 25)))
    for r in range(16):
        ws.append([None, ROW_LABELS[r]] + [r * 100 + c + 0.5 for c in range(24)])
    buf = io.BytesIO()
    wb.save(buf)
    found = read_xlsx(buf.getvalue())
    assert (found["rows"], found["cols"], found["format"]) == (16, 24, 384)
    assert found["grid"][15][23] == 1523.5
    assert parse_xlsx(buf.getvalue())[15][23] == 1523.5


def test_locate_plate_none_without_numbers():
    assert locate_plate([["A", "x"], ["B", "y"]]) is None


def test_plate_qc_384_through_api_reads_all_wells():
    from opendose import api
    text = _grid_text(16, 24)
    res = api.analyze({"analysis": "plate_qc", "data": {
        "text": text,
        "plate_map": [{"wells": "A1:P2", "role": "negative"},
                      {"wells": "A23:P24", "role": "positive"}]},
        "options": {"normalization": "percent_of_control",
                    "plate_format": 384}})
    assert "error" not in res, res.get("error")
    assert res["format"] == 384 and res["n_rows"] == 16
    assert res["qc"]["positive"]["mean"] == pytest.approx(
        sum(r * 100 + c + 0.5 for r in range(16) for c in (22, 23)) / 32)


def test_text_wells_do_not_cut_the_grid():
    # an "OVRFLW" reading is an empty well, not the end of the plate
    text = _grid_text(7, 12, labels=True, header=False)
    lines = text.split("\n")
    cells = lines[2].split("\t")
    cells[5] = "OVRFLW"
    lines[2] = "\t".join(cells)
    found = read_text("\n".join(lines))
    assert (found["rows"], found["cols"]) == (8, 12)
    assert found["grid"][2][4] is None
    assert found["grid"][6][11] == 611.5


def test_bare_grid_with_a_text_well_stays_one_block():
    lines = _grid_text(16, 24, labels=False, header=False).split("\n")
    cells = lines[7].split("\t")
    cells[3] = "OVRFLW"
    lines[7] = "\t".join(cells)
    found = read_text(PREAMBLE + "\n".join(lines))
    assert (found["rows"], found["cols"], found["format"]) == (16, 24, 384)
    assert found["grid"][7][3] is None and found["grid"][15][23] == 1523.5
    assert found["warnings"] == []
