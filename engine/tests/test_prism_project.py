"""Import of the .prism archive format Prism 10/11 writes.

Everything here runs against tests/fixtures/synthetic_project.prism, which
is fabricated (see make_synthetic_project.py). The real projects this was
developed against stay out of the repository.
"""

import base64
import json
import zipfile
from pathlib import Path

import pytest

from opendose import prism_project
from opendose.api import analyze_json

FIXTURE = Path(__file__).parent / "fixtures" / "synthetic_project.prism"
DOSES = [0.0, 0.3, 1.0, 3.0, 10.0, 30.0]


@pytest.fixture(scope="module")
def raw():
    return FIXTURE.read_bytes()


@pytest.fixture(scope="module")
def tables(raw):
    return prism_project.parse_prism(raw)["tables"]


def test_recognises_the_archive(raw):
    assert prism_project.looks_like_prism_project(raw)
    assert not prism_project.looks_like_prism_project(b"<GraphPadPrismFile>")


def test_imports_only_the_data_sheet(tables):
    # The archive also holds an analysis result sheet, which is output.
    assert len(tables) == 1
    assert tables[0]["title"] == "Dose response"
    assert tables[0]["table_type"] == "XY"


def test_x_column_and_title(tables):
    assert tables[0]["x"] == DOSES
    assert tables[0]["x_title"] == "Dose (uM)"
    assert tables[0]["n_rows"] == len(DOSES)


def test_datasets_keep_their_titles_and_replicates(tables):
    names = [ds["name"] for ds in tables[0]["datasets"]]
    assert names == ["Line Alpha", "Line Beta"]
    assert tables[0]["replicates"] == 3
    for ds in tables[0]["datasets"]:
        assert all(len(row) == 3 for row in ds["ys"])


def test_replicates_are_split_between_the_right_datasets(tables):
    # Row 0 is the zero dose, where both lines sit at TOP = 100 and the
    # replicate offsets are -1/0/+1.
    alpha, beta = tables[0]["datasets"]
    assert alpha["ys"][0] == [99.0, 100.0, 101.0]
    assert beta["ys"][0] == [99.0, 100.0, 101.0]
    # Row 3 is the midpoint of Alpha only, so the two must differ there.
    assert alpha["ys"][3] == [49.0, 50.0, 51.0]
    assert beta["ys"][3] == [79.0, 80.0, 81.0]


def test_blank_cell_imports_as_missing_not_zero(tables):
    alpha = tables[0]["datasets"][0]
    assert alpha["ys"][1][2] is None
    assert alpha["ys"][1][:2] == [89.909091, 90.909091]


def test_reaches_the_app_through_the_shared_import_entry_point(raw):
    res = json.loads(analyze_json(json.dumps({
        "analysis": "pzfx_import",
        "data": {"pzfx_b64": base64.b64encode(raw).decode()},
        "options": {},
    })))
    assert "error" not in res
    assert [t["title"] for t in res["tables"]] == ["Dose response"]


def test_pzfx_still_works_through_the_same_entry_point():
    pzfx = Path(__file__).parents[2] / "web" / "e2e-fixtures" / "sample.pzfx"
    res = json.loads(analyze_json(json.dumps({
        "analysis": "pzfx_import",
        "data": {"pzfx_b64": base64.b64encode(pzfx.read_bytes()).decode()},
        "options": {},
    })))
    assert "error" not in res
    assert res["tables"]


def test_rejects_a_zip_that_is_not_a_prism_project(tmp_path):
    other = tmp_path / "notes.zip"
    with zipfile.ZipFile(other, "w") as z:
        z.writestr("readme.txt", "hello")
    with pytest.raises(ValueError, match="no document.json"):
        prism_project.parse_prism(other.read_bytes())


def test_rejects_a_file_that_is_not_a_zip():
    with pytest.raises(ValueError, match="not a zip archive"):
        prism_project.parse_prism(b"just some bytes")


def test_a_project_with_no_data_sheets_is_an_error(tmp_path):
    empty = tmp_path / "empty.prism"
    with zipfile.ZipFile(empty, "w") as z:
        z.writestr("document.json", json.dumps({"sheets": {"data": []}}))
    with pytest.raises(ValueError, match="no data tables"):
        prism_project.parse_prism(empty.read_bytes())


def test_column_count_mismatch_falls_back_to_an_even_split(tmp_path):
    """replicatesCount that disagrees with the CSV must not misalign columns."""
    bad = tmp_path / "bad.prism"
    with zipfile.ZipFile(bad, "w") as z:
        z.writestr("document.json", json.dumps({"sheets": {"data": ["s"]}}))
        z.writestr("data/sheets/s/sheet.json", json.dumps({
            "title": "T",
            "table": {"uid": "t", "format": "xy", "replicatesCount": 7,
                      "dataSets": ["a", "b"], "xDataSet": "x",
                      "xDataSetFormat": "y_single"},
        }))
        z.writestr("data/tables/t/data.csv", "1,10,11,20,21\n2,12,13,22,23\n")
        for uid, title in (("x", "Dose"), ("a", "A"), ("b", "B")):
            z.writestr(f"data/sets/{uid}.json", json.dumps({"title": title}))
    table = prism_project.parse_prism(bad.read_bytes())["tables"][0]
    assert table["replicates"] == 2
    assert table["x"] == [1.0, 2.0]
    assert table["datasets"][0]["ys"] == [[10.0, 11.0], [12.0, 13.0]]
    assert table["datasets"][1]["ys"] == [[20.0, 21.0], [22.0, 23.0]]
