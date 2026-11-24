"""P-98 uncertainty carried through Remove baseline and Normalize
(propagate.py, api options propagate) against Python's `uncertainties`
(correlations tracked per replicate), a Monte Carlo check and the hand
derivation of the acceptance test (engine/tests/reference/propagation.py)."""

import json
import math
import pathlib

import pytest

from opendose import api

HERE = pathlib.Path(__file__).parent
REF = json.loads((HERE / "reference" / "propagation.json").read_text())
D = REF["data"]


def _baseline(datasets, **options):
    n = max(len(ds["ys"]) for ds in datasets)
    r = api.analyze({"analysis": "remove_baseline",
                     "data": {"x": list(range(n)), "datasets": datasets},
                     "options": {"propagate": True, **options}})
    assert "error" not in r, r.get("error")
    return r


def _check(rows, ref, keys=("value", "sd", "se", "from_baseline")):
    assert len(rows) == len(ref)
    for got, want in zip(rows, ref):
        for k in keys:
            if k in want:
                assert got[k] == pytest.approx(want[k], rel=1e-9, abs=1e-12), k


def test_acceptance_blank_mean_with_its_sd():
    """Subtract a blank mean (SD 0.0035, n = 3) from samples in triplicate:
    the output carries propagated SDs, and the warning says not to treat
    them as replicates."""
    r = _baseline([{"name": "OD", "ys": D["samples"]}], baseline="value", value=0.0513,
                  value_sd=0.0035, value_n=3)
    p = r["propagation"]
    rows = p["datasets"][0]["rows"]
    _check(rows, REF["subtract_value"])
    # hand derivation: SD = sqrt(s_y^2 + s_b^2 / n_b), SE = sqrt(s_y^2 / n_y + s_b^2 / n_b)
    s_y, s_b = 0.007, 0.0035  # sample A: 0.412, 0.398, 0.405 (SD 0.007)
    assert rows[0]["sd"] == pytest.approx(math.sqrt(s_y ** 2 + s_b ** 2 / 3), rel=1e-9)
    assert rows[0]["se"] == pytest.approx(math.sqrt(s_y ** 2 / 3 + s_b ** 2 / 3), rel=1e-9)
    assert f"{rows[0]['value']:.4g} {rows[0]['sd']:.4g} {rows[0]['se']:.4g}" == "0.3537 0.007286 0.004518"
    assert rows[0]["from_baseline"] == pytest.approx(0.0035 / math.sqrt(3), rel=1e-12)
    assert "not replicates" in p["warning"] and "as a block" in p["warning"]
    # the derived table itself is unchanged by propagate
    plain = api.analyze({"analysis": "remove_baseline",
                         "data": {"x": [0, 1, 2], "datasets": [{"name": "OD", "ys": D["samples"]}]},
                         "options": {"baseline": "value", "value": 0.0513}})
    assert plain["datasets"][0]["ys"] == r["datasets"][0]["ys"] and "propagation" not in plain


def test_monte_carlo_agrees():
    r = _baseline([{"name": "OD", "ys": D["samples"]}], baseline="value", value=0.0513,
                  value_sd=0.0035, value_n=3)
    for got, mc in zip(r["propagation"]["datasets"][0]["rows"], REF["monte_carlo"]["subtract_value"]):
        assert got["sd"] == pytest.approx(mc["sd"], rel=0.02)
        assert got["se"] == pytest.approx(mc["se"], rel=0.02)
    r = api.analyze({"analysis": "normalize", "data": {"x": [0, 1, 2, 3, 4],
                     "datasets": [{"name": "Dose", "ys": D["dose"]}]},
                     "options": {"zero_mode": "first", "hundred_mode": "last", "propagate": True}})
    for got, mc in zip(r["propagation"]["datasets"][0]["rows"], REF["monte_carlo"]["normalize_first_last"]):
        assert got["sd"] == pytest.approx(mc["sd"], rel=0.03)
        assert got["se"] == pytest.approx(mc["se"], rel=0.03, abs=1e-9)


@pytest.mark.parametrize("operation,key", [("divide", "divide_value"),
                                           ("percent_difference", "percent_difference_value")])
def test_ratio_operations(operation, key):
    r = _baseline([{"name": "OD", "ys": D["samples"]}], baseline="value", value=0.0513,
                  value_sd=0.0035, value_n=3, operation=operation)
    _check(r["propagation"]["datasets"][0]["rows"], REF[key])


def test_blank_data_set_row_by_row():
    r = _baseline([{"name": "Blank", "ys": D["blank_wells"]}, {"name": "OD", "ys": D["samples"]}],
                  baseline="column", baseline_dataset=0)
    assert [d["name"] for d in r["datasets"]] == ["OD"]
    _check(r["propagation"]["datasets"][0]["rows"], REF["subtract_column"])


def test_baseline_row_of_the_same_column_keeps_its_correlation():
    r = _baseline([{"name": "Dose", "ys": D["dose"]}], baseline="first_row")
    rows = r["propagation"]["datasets"][0]["rows"]
    _check(rows, REF["subtract_first_row"], keys=("value", "sd", "se"))
    assert rows[0]["value"] == 0 and rows[0]["se"] == 0
    # divided by its own mean: exactly 1 with no error (no rounding residue)
    r = _baseline([{"name": "Dose", "ys": D["dose"]}], baseline="first_row", operation="divide")
    assert r["propagation"]["datasets"][0]["rows"][0]["se"] == 0


def test_normalize_first_last_and_typed_sum():
    def run(**o):
        return api.analyze({"analysis": "normalize", "data": {"x": [0, 1, 2, 3, 4],
                            "datasets": [{"name": "Dose", "ys": D["dose"]}]},
                            "options": {"propagate": True, **o}})
    r = run(zero_mode="first", hundred_mode="last")
    rows = r["propagation"]["datasets"][0]["rows"]
    _check(rows, REF["normalize_first_last"], keys=("value", "sd", "se"))
    # the reference rows are exactly 0% and 100% of the mean, with no error
    assert rows[0]["se"] == pytest.approx(0, abs=1e-12) and rows[-1]["se"] == pytest.approx(0, abs=1e-12)
    # the propagated value is the normalized row mean
    assert rows[2]["value"] == pytest.approx(sum(r["datasets"][0]["ys"][2]) / 3, rel=1e-12)
    r = run(zero_mode="value", zero_value=0, hundred_mode="sum")
    _check(r["propagation"]["datasets"][0]["rows"], REF["normalize_value_sum"], keys=("value", "sd", "se"))
    # smallest / largest: the selection caveat
    r = run()
    assert any("selected for being extreme" in n for n in r["propagation"]["datasets"][0]["notes"])


def test_what_is_not_propagated_says_why():
    r = _baseline([{"name": "Blank", "ys": D["blank_wells"]}, {"name": "OD", "ys": D["samples"]}],
                  baseline="column", replicates="each")
    p = r["propagation"]["datasets"][0]
    assert p["rows"] is None and "independent differences" in p["notes"][0]
    r = api.analyze({"analysis": "normalize", "data": {"x": [0, 1, 2, 3, 4],
                     "datasets": [{"name": "Dose", "ys": D["dose"]}]},
                     "options": {"subcolumns": "separate", "propagate": True}})
    assert r["propagation"]["datasets"][0]["rows"] is None
    # a typed baseline without SD and n is exact: only the samples' own error
    r = _baseline([{"name": "OD", "ys": D["samples"]}], baseline="value", value=0.0513)
    rows = r["propagation"]["datasets"][0]["rows"]
    assert rows[0]["sd"] == pytest.approx(0.007, rel=1e-9) and rows[0]["from_baseline"] == 0
    assert "taken as exact" in r["propagation"]["datasets"][0]["notes"][0]


def test_single_values_and_one_value_baselines():
    # one value per row: no SD of its own, the baseline's share still given
    r = _baseline([{"name": "OD", "ys": [[0.4], [0.7]]}], baseline="value", value=0.05,
                  value_sd=0.003, value_n=3)
    rows = r["propagation"]["datasets"][0]["rows"]
    assert rows[0]["sd"] is None and rows[0]["se"] is None
    assert rows[0]["from_baseline"] == pytest.approx(0.003 / math.sqrt(3), rel=1e-12)
    assert any("one value" in n for n in r["propagation"]["datasets"][0]["notes"])
    # a blank row with one well: its uncertainty is unknown, never a 0
    r = _baseline([{"name": "Blank", "ys": [[0.05], [0.05, 0.06]]}, {"name": "OD", "ys": D["samples"][:2]}],
                  baseline="column")
    rows = r["propagation"]["datasets"][0]["rows"]
    assert rows[0]["sd"] is None and rows[0]["from_baseline"] is None
    assert rows[1]["sd"] is not None
    # bad SD or n of a typed baseline
    r = api.analyze({"analysis": "remove_baseline", "data": {"x": [0], "datasets": [{"name": "A", "ys": [[1, 2]]}]},
                     "options": {"baseline": "value", "value": 0.1, "value_sd": -1, "value_n": 3,
                                 "propagate": True}})
    assert "SD must be 0 or more" in r["error"]


def test_units_scale_and_order_does_not_matter():
    base = _baseline([{"name": "OD", "ys": D["samples"]}], baseline="value", value=0.0513,
                     value_sd=0.0035, value_n=3)["propagation"]["datasets"][0]["rows"]
    for k in (1e-12, 1e12):
        ys = [[v * k for v in row] for row in D["samples"]]
        r = _baseline([{"name": "OD", "ys": ys}], baseline="value", value=0.0513 * k,
                      value_sd=0.0035 * k, value_n=3)["propagation"]["datasets"][0]["rows"]
        for a, b in zip(r, base):
            assert a["sd"] == pytest.approx(b["sd"] * k, rel=1e-9)
            assert a["se"] == pytest.approx(b["se"] * k, rel=1e-9)
    rev = [list(reversed(row)) for row in D["samples"]]
    r = _baseline([{"name": "OD", "ys": rev}], baseline="value", value=0.0513, value_sd=0.0035,
                  value_n=3)["propagation"]["datasets"][0]["rows"]
    assert [x["sd"] for x in r] == pytest.approx([x["sd"] for x in base], rel=1e-12)
