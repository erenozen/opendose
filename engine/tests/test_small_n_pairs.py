"""Small-n honesty (need small-n-honesty) and incomplete pairs
(missing-values-handling) in the ttest / anova / correlation handlers.

- With one value in a group (or one complete pair) no test is run: p is
  null, "withheld" says why (GraphPad statistics guide on n = 1;
  Motulsky, Intuitive Biostatistics), with the descriptive results.
- With the smallest n <= 3, "design_sensitivity" reports the Cohen's d
  detectable with 80% power at alpha 0.05, checked against pingouin's
  power_ttest / power_ttest2n (G*Power's sensitivity analysis), and the
  CI half-width factor t(0.975, df) sqrt(1/n1 + 1/n2).
- Paired tests and correlation pair cell by cell, leave incomplete pairs
  out and list their row indices; P equals the test on the complete
  subset (scipy as the independent reference).
"""

import math

import pytest
from scipy import stats

from opendose.api import analyze


def _cols(*groups, names=None):
    names = names or [chr(65 + i) for i in range(len(groups))]
    return {"datasets": [{"name": n, "ys": [[v] for v in g]}
                         for n, g in zip(names, groups)]}


@pytest.mark.parametrize("kind", ["unpaired", "mann_whitney", "paired",
                                  "wilcoxon", "ratio_paired",
                                  "kolmogorov_smirnov"])
def test_one_value_per_group_withholds_p(kind):
    r = analyze({"analysis": "ttest", "data": _cols([2.0], [5.0]),
                 "options": {"kind": kind}})
    assert "error" not in r
    assert r["p_two_tailed"] is None and r["p"] is None
    assert r["withheld"]["min_n"] == 1
    assert "description only" in r["withheld"]["reason"]
    assert r["difference"] == pytest.approx(-3.0)
    assert r["warnings"]
    assert r["withheld"]["replication_guide"][0]["n_per_group"] == 3


def test_one_value_in_one_group_withholds_unpaired_t():
    r = analyze({"analysis": "ttest", "data": _cols([2.0, 3.0, 4.0], [5.0]),
                 "options": {}})
    assert r["p_two_tailed"] is None
    assert r["withheld"]["groups"] == [{"name": "A", "n": 3},
                                       {"name": "B", "n": 1}]
    assert r["descriptive"]["groups"][0]["mean"] == pytest.approx(3.0)


def test_empty_group_withholds_instead_of_raising():
    r = analyze({"analysis": "ttest",
                 "data": _cols([2.0, 3.0], [None, None]), "options": {}})
    assert r["p_two_tailed"] is None
    assert r["withheld"]["min_n"] == 0


def test_anova_and_kruskal_with_singleton_group():
    data = _cols([1.0, 2.0, 3.0], [4.0], [5.0, 7.0])
    for kind in ("parametric", "nonparametric"):
        r = analyze({"analysis": "anova", "data": data,
                     "options": {"kind": kind, "comparisons": "tukey"}})
        assert "error" not in r
        assert r["p"] is None and r["table"] is None
        assert r["withheld"]["groups"] == [{"name": "B", "n": 1}]
        assert [g["n"] for g in r["group_summaries"]] == [3, 1, 2]
        assert r["warnings"]


def test_results_unchanged_when_n_at_least_two():
    a, b = [1.2, 3.4, 2.2, 5.1], [4.4, 6.1, 5.5, 7.0, 6.2]
    r = analyze({"analysis": "ttest", "data": _cols(a, b), "options": {}})
    ref = stats.ttest_ind(a, b)
    assert r["p_two_tailed"] == pytest.approx(ref.pvalue, rel=1e-10)
    assert "withheld" not in r and "design_sensitivity" not in r
    assert "warnings" not in r


def test_design_sensitivity_two_groups_vs_pingouin():
    pg = pytest.importorskip("pingouin")
    r = analyze({"analysis": "ttest",
                 "data": _cols([1.0, 2.0, 4.0], [3.0, 5.0, 6.5]),
                 "options": {}})
    ds = r["design_sensitivity"]
    assert ds["min_n"] == 3
    ref = pg.power_ttest(n=3, power=0.8, alpha=0.05)
    assert round(ds["detectable_d_80"], 3) == round(ref, 3)  # 3.071
    assert ds["ci_halfwidth_factor"] == pytest.approx(
        stats.t.ppf(0.975, 4) * math.sqrt(2 / 3), rel=1e-10)
    r2 = analyze({"analysis": "ttest",
                  "data": _cols([1.0, 2.0], [3.0, 5.0, 6.5, 7.0, 8.0]),
                  "options": {"welch": True}})
    ref2 = pg.power_ttest2n(nx=2, ny=5, power=0.8, alpha=0.05)
    assert r2["design_sensitivity"]["detectable_d_80"] == pytest.approx(
        ref2, abs=5e-4)


def test_design_sensitivity_paired_vs_pingouin():
    pg = pytest.importorskip("pingouin")
    r = analyze({"analysis": "ttest",
                 "data": _cols([1.0, 2.0, 4.0], [3.0, 5.0, 6.5]),
                 "options": {"kind": "paired"}})
    ds = r["design_sensitivity"]
    ref = pg.power_ttest(n=3, power=0.8, alpha=0.05, contrast="paired")
    assert ds["detectable_d_80"] == pytest.approx(ref, abs=5e-4)  # 3.264
    assert ds["effect"] == "d_z"
    assert ds["ci_halfwidth_factor"] == pytest.approx(
        stats.t.ppf(0.975, 2) / math.sqrt(3), rel=1e-10)


def test_design_sensitivity_anova():
    pg = pytest.importorskip("pingouin")
    r = analyze({"analysis": "anova",
                 "data": _cols([1.0, 2.0, 4.0], [3.0, 5.0, 6.5],
                               [2.0, 2.5, 3.0, 4.0]), "options": {}})
    ds = r["design_sensitivity"]
    assert ds["min_n"] == 3 and ds["df"] == 7
    assert ds["detectable_d_80"] == pytest.approx(
        pg.power_ttest(n=3, power=0.8, alpha=0.05), abs=5e-4)
    assert ds["ci_halfwidth_factor"] == pytest.approx(
        stats.t.ppf(0.975, 7) * math.sqrt(2 / 3), rel=1e-10)


# --------------------------------------------------------- incomplete pairs

A = [12.1, 14.3, None, 11.8, 15.2, 13.3, 12.9, 14.8, None, 13.1, 12.2]
B = [13.4, 15.1, 14.0, 12.5, 16.8, 13.9, None, 15.5, 15.0, 14.2, 13.0]


def _complete():
    keep = [i for i in range(len(A)) if A[i] is not None
            and B[i] is not None]
    return [A[i] for i in keep], [B[i] for i in keep]


@pytest.mark.parametrize("kind", ["paired", "wilcoxon", "ratio_paired"])
def test_paired_incomplete_pairs_reported(kind):
    r = analyze({"analysis": "ttest", "data": _cols(A, B),
                 "options": {"kind": kind}})
    assert r["incomplete_pairs"] == [2, 6, 8]
    assert r["warnings"] == ["3 incomplete pairs (rows 3, 7, 9) left out"]
    a, b = _complete()
    assert r["n_pairs"] == 8
    if kind == "paired":
        ref = stats.ttest_rel(a, b).pvalue
    elif kind == "wilcoxon":
        ref = stats.wilcoxon(a, b, method="exact").pvalue
    else:
        ref = stats.ttest_rel([math.log10(v) for v in a],
                              [math.log10(v) for v in b]).pvalue
    assert r["p_two_tailed"] == pytest.approx(ref, rel=1e-9)


def test_paired_complete_data_has_empty_incomplete_list():
    r = analyze({"analysis": "ttest",
                 "data": _cols([1.0, 2.0, 3.5, 4.0], [2.0, 2.5, 5.0, 4.4]),
                 "options": {"kind": "paired"}})
    assert r["incomplete_pairs"] == []
    assert "warnings" not in r


def test_correlation_incomplete_pairs():
    r = analyze({"analysis": "correlation", "data": _cols(A, B),
                 "options": {}})
    a, b = _complete()
    assert r["n"] == 8
    assert r["incomplete_pairs"] == [2, 6, 8]
    assert r["r"] == pytest.approx(stats.pearsonr(a, b)[0], rel=1e-12)
    assert r["warnings"] == ["3 incomplete XY pairs (rows 3, 7, 9) left out"]
