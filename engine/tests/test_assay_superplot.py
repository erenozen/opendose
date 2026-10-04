"""SuperPlot aggregation (assay_superplot): replicate summaries, the
test on replicate means through the existing modules, graph data and
the cells-as-n warning (Lord et al. 2020, J Cell Biol)."""

import numpy as np
import pytest

from opendose import anova, api, assay_superplot as sp, repeated, ttests


def _records(groups=("Control", "Drug"), shifts=(0.0, 1.5), n_rep=3,
             n_cells=25, paired=True, seed=0):
    rng = np.random.default_rng(seed)
    out = []
    for g, shift in zip(groups, shifts):
        for r in range(n_rep):
            day = 2.0 * r                      # day-to-day variation
            for _ in range(n_cells):
                rec = {"group": g, "replicate": f"R{r + 1}",
                       "value": 10 + shift + day + rng.normal(0, 3)}
                if paired:
                    rec["pair"] = f"day{r + 1}"
                out.append(rec)
    return out


def _means(records, g):
    reps = {}
    for r in records:
        if r["group"] == g:
            reps.setdefault(r["replicate"], []).append(r["value"])
    return [float(np.mean(v)) for v in reps.values()]


def test_replicate_means_and_paired_test():
    recs = _records()
    res = sp.superplot(recs)
    a, b = _means(recs, "Control"), _means(recs, "Drug")
    got = [s["value"] for s in res["replicates"]]
    np.testing.assert_allclose(got, a + b, rtol=1e-14)
    assert res["paired"] is True
    ref = ttests.paired_t(a, b)
    assert res["test"]["test"] == "paired_t"
    assert res["test"]["p_two_tailed"] == pytest.approx(ref["p_two_tailed"],
                                                        rel=1e-14)
    assert res["test"]["n_pairs"] == 3
    assert res["graph"]["n_label"]["Drug"] == "n = 3 replicates (75 cells)"
    assert len(res["graph"]["cells"]) == 150
    # colour by experiment: the same day has the same colour in each group
    cols = {(m["group"], m["replicate"]): m["colour_index"]
            for m in res["graph"]["replicate_means"]}
    assert cols[("Control", "R2")] == cols[("Drug", "R2")]
    assert res["replicate_table"]["row_titles"] == ["day1", "day2", "day3"]


def test_unpaired_welch_and_median():
    recs = _records(paired=False)
    res = sp.superplot(recs, aggregate="median", test="welch")
    meds = {}
    for r in recs:
        meds.setdefault((r["group"], r["replicate"]), []).append(r["value"])
    a = [float(np.median(meds[("Control", f"R{i}")])) for i in (1, 2, 3)]
    b = [float(np.median(meds[("Drug", f"R{i}")])) for i in (1, 2, 3)]
    ref = ttests.unpaired_t(a, b, welch=True)
    assert res["paired"] is False
    assert res["test"]["test"] == "welch_t"
    assert res["test"]["p_two_tailed"] == pytest.approx(ref["p_two_tailed"],
                                                        rel=1e-14)


def test_three_groups_anova_and_rm_anova():
    recs = _records(groups=("A", "B", "C"), shifts=(0, 1, 3), n_rep=4)
    cols = [_means(recs, g) for g in "ABC"]
    rm = sp.superplot(recs)                      # pair keys -> RM ANOVA
    ref = repeated.rm_one_way_anova(cols, list("ABC"))
    assert rm["test"]["test"] == "rm_one_way_anova"
    assert rm["test"]["table"]["F"] == pytest.approx(ref["table"]["F"],
                                                     rel=1e-12)
    assert rm["test"]["multiple_comparisons"]["method"] == "tukey"
    ordinary = sp.superplot(recs, paired=False, control="A")
    ref2 = anova.one_way_anova(cols, list("ABC"))
    assert ordinary["test"]["table"]["p"] == pytest.approx(
        ref2["table"]["p"], rel=1e-12)
    assert ordinary["test"]["multiple_comparisons"]["method"] == "dunnett"


def test_cells_as_n_warns_and_differs():
    recs = _records()
    res = sp.superplot(recs, stats_on="cells")
    assert sp.CELL_WARNING in res["warnings"]
    cells_a = [r["value"] for r in recs if r["group"] == "Control"]
    cells_b = [r["value"] for r in recs if r["group"] == "Drug"]
    ref = ttests.unpaired_t(cells_a, cells_b)
    assert res["test"]["p_two_tailed"] == pytest.approx(ref["p_two_tailed"])
    assert res["test"]["df"] == 148              # n = cells, the error


def test_few_replicates_warning_and_api():
    recs = _records(n_rep=2)
    res = api.analyze({"analysis": "superplot", "data": {"records": recs},
                       "options": {"test": "paired"}})
    assert "error" not in res
    assert any("only 2 biological replicates" in w for w in res["warnings"])
    assert res["replicate_table"]["datasets"][0]["ys"] == [
        [v] for v in _means(recs, "Control")]
