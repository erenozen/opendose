"""P-57: Normalize and Remove baseline state the references behind each
data set (normalize.normalize_references, manipulate.remove_baseline
"baseline"), checked against hand derivations from the tables."""

import pytest

from opendose import api
from opendose.manipulate import remove_baseline
from opendose.normalize import normalize_dataset, normalize_references

# the P-55 / P-57 example: rows 10 nM, 1 uM, vehicle; triplicates
WT = [[20, 22, 21], [55, 60, 58], [98, 101, 100]]
KO = [[30, 33, 31], [70, 66, 68], [99, 97, 103]]


def test_the_example_by_hand():
    # WT row means: 63/3 = 21, 173/3 = 57.667, 299/3 = 99.667
    r = normalize_references(WT, zero_mode="smallest", hundred_mode="last")
    assert r["basis"] == "row means"
    assert r["zero"] == {"value": pytest.approx(21.0), "rule": "smallest",
                         "row": 0}
    assert r["hundred"]["value"] == pytest.approx(299 / 3)
    assert (r["hundred"]["rule"], r["hundred"]["row"]) == ("last", 2)
    # KO: 94/3 = 31.333 (smallest, row 1), 299/3 = 99.667 (vehicle)
    k = normalize_references(KO, zero_mode="smallest", hundred_mode="last")
    assert k["zero"]["value"] == pytest.approx(94 / 3)
    assert k["hundred"]["value"] == pytest.approx(299 / 3)
    # the references are the ones the output uses: 0% and 100% exactly
    out = normalize_dataset(WT, zero_mode="smallest", hundred_mode="last")
    means = [sum(row) / 3 for row in out]
    assert means[0] == pytest.approx(0.0, abs=1e-12)
    assert means[2] == pytest.approx(100.0)


def test_rules_rows_and_separate_subcolumns():
    rows = [[None, None], [4, 6], [10, 2], [7, None], [None, None]]
    r = normalize_references(rows, zero_mode="first", hundred_mode="largest")
    # row means: -, 5, 6, 7, -  -> first 5 (row 1), largest 7 (row 3)
    assert (r["zero"]["value"], r["zero"]["row"]) == (5.0, 1)
    assert (r["hundred"]["value"], r["hundred"]["row"]) == (7.0, 3)
    s = normalize_references(rows, hundred_mode="sum")
    assert s["hundred"] == {"value": 18.0, "rule": "sum", "row": None,
                            "n_summed": 3}
    v = normalize_references(rows, zero_mode="value", zero_value=1,
                             hundred_mode="value", hundred_value=50)
    assert v["zero"] == {"value": 1.0, "rule": "value", "row": None}
    sep = normalize_references(rows, subcolumns="separate")
    assert sep["basis"] == "each subcolumn"
    assert sep["subcolumns"][0]["zero"] == {"value": 4.0, "rule": "smallest",
                                            "row": 1}
    assert sep["subcolumns"][1]["hundred"]["value"] == 6.0
    # ties: the first row with the smallest value
    t = normalize_references([[3], [1], [1], [5]])
    assert t["zero"]["row"] == 1
    # no values: no references
    assert normalize_references([[None], [None]]) is None
    assert normalize_references([]) is None


def test_api_carries_references_and_leaves_the_numbers_alone():
    data = {"x": [None, None, None],
            "datasets": [{"name": "WT", "ys": WT}, {"name": "KO", "ys": KO}]}
    opts = {"zero_mode": "smallest", "hundred_mode": "last"}
    res = api.analyze({"analysis": "normalize", "data": data,
                       "options": opts})
    assert [d["references"]["hundred"]["row"] for d in res["datasets"]] == \
        [2, 2]
    for d, raw in zip(res["datasets"], (WT, KO)):
        assert d["ys"] == normalize_dataset(raw, **opts)


def test_remove_baseline_states_what_it_removed():
    x = [1.0, 2.0, 3.0]
    ds = [{"name": "A", "ys": [[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]]},
          {"name": "B", "ys": [[10.0, 20.0], [30.0, 40.0], [50.0, 60.0]]}]
    out = remove_baseline(x, ds, baseline="column", baseline_dataset=0)
    assert out["datasets"][0]["baseline"] == {"kind": "dataset",
                                              "dataset": "A", "linear": False}
    out = remove_baseline(x, ds[:1], baseline="first_row")
    assert out["datasets"][0]["baseline"] == {"kind": "rows", "rows": [0],
                                              "value": 1.5}
    out = remove_baseline(x, ds[:1], baseline="first_row", replicates="each")
    assert out["datasets"][0]["baseline"]["values"] == [1.0, 2.0]
    out = remove_baseline(x, ds[:1], baseline="last_rows", k=2)
    assert out["datasets"][0]["baseline"] == {"kind": "rows", "rows": [1, 2],
                                              "value": 4.5}
    out = remove_baseline(x, ds[:1], baseline="value", value=2)
    assert out["datasets"][0]["baseline"] == {"kind": "value", "value": 2.0}
    four = ds + [{"name": "C", "ys": [[0, 0]] * 3},
                 {"name": "D", "ys": [[1, 1]] * 3}]
    out = remove_baseline(x, four, baseline="alternate",
                          pairs="baseline_first")
    assert [d["baseline"]["dataset"] for d in out["datasets"]] == ["A", "C"]
