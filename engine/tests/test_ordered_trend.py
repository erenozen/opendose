"""P-41: trend across ordered groups, the Jonckheere-Terpstra test (after
Kruskal-Wallis) and Page's test (after Friedman).

Reference values: engine/tests/reference/ordered_trend.py (exact
arrangement counts with Python integers, full enumeration, scipy
page_trend_test, the Hicks 2009 example's published L = 133.5 and Page's
1963 table value for k = 3, n = 10). R is not installed.
"""

import json
import os

import numpy as np
import pytest
from scipy import stats

from opendose import api, exactdist, moretests, repeated

REF = json.load(open(os.path.join(os.path.dirname(__file__), "reference",
                                  "ordered_trend.json")))


def _cols(groups, names=None):
    names = names or [f"G{i + 1}" for i in range(len(groups))]
    return {"datasets": [{"name": n, "ys": [[v] for v in g]}
                         for n, g in zip(names, groups)]}


def _matched(rows, names=None):
    k = len(rows[0])
    names = names or [f"T{j + 1}" for j in range(k)]
    return {"datasets": [{"name": names[j], "ys": [[r[j]] for r in rows]}
                         for j in range(k)]}


# ------------------------------------------------- Jonckheere-Terpstra

def test_jt_exact_four_doses_matches_integer_counts():
    ref = REF["jt_untied"]
    r = api.analyze({"analysis": "anova", "data": _cols(ref["data"],
                                                        ref["names"]),
                     "options": {"kind": "nonparametric", "trend": True}})
    jt = r["jonckheere"]
    assert jt["statistic"] == ref["J"] == 140
    assert jt["p_method"] == "exact"
    assert jt["p_increasing"] == pytest.approx(ref["p_increasing"], rel=1e-9)
    assert jt["p_decreasing"] == pytest.approx(ref["p_decreasing"],
                                               rel=1e-12)
    assert jt["p"] == pytest.approx(ref["p"], rel=1e-9)
    assert jt["direction"] == "increasing"
    assert jt["order"] == ref["names"]
    # Kruskal-Wallis itself is unchanged by the option
    plain = api.analyze({"analysis": "anova", "data": _cols(ref["data"]),
                         "options": {"kind": "nonparametric"}})
    assert "jonckheere" not in plain
    assert plain["H"] == r["H"]


def test_jt_exact_small_matches_full_enumeration():
    ref = REF["jt_small"]
    jt = moretests.jonckheere_terpstra(ref["data"])
    assert jt["statistic"] == ref["J"]
    assert jt["p_increasing"] == pytest.approx(ref["p_increasing"], rel=1e-12)
    assert jt["p"] == pytest.approx(ref["p"], rel=1e-12)


def test_jt_null_is_the_arrangement_count():
    # 3, 3, 4: 4200 arrangements; P(J = 0) = 1 / 4200 (fully decreasing)
    dist = exactdist.jt_null([3, 3, 4])
    assert dist.size == 3 * 3 + 3 * 4 + 3 * 4 + 1
    assert dist[0] == pytest.approx(1 / 4200, rel=1e-12)
    assert dist.sum() == pytest.approx(1.0, abs=1e-12)
    # symmetric about its mean
    assert np.allclose(dist, dist[::-1], atol=1e-15)


def test_jt_tie_corrected_variance_equals_permutation_variance():
    ref = REF["jt_small_tied"]
    jt = moretests.jonckheere_terpstra(ref["data"])
    assert jt["ties"] and jt["p_method"].startswith("normal")
    assert jt["mean"] == pytest.approx(ref["perm_mean"], rel=1e-12)
    assert jt["sd"] ** 2 == pytest.approx(ref["perm_var"], rel=1e-12)
    assert jt["statistic"] == ref["J"]


def test_jt_with_ties_normal_approximation():
    ref = REF["jt_tied"]
    jt = moretests.jonckheere_terpstra(ref["data"], ref["names"])
    assert jt["statistic"] == ref["J"]
    assert jt["sd"] == pytest.approx(ref["sd"], rel=1e-12)
    assert jt["z"] == pytest.approx(ref["z"], rel=1e-12)
    assert jt["p"] == pytest.approx(ref["p"], rel=1e-9)
    assert "ties corrected" in jt["p_method"]


def test_jt_reversed_order_mirrors_the_test():
    ref = REF["jt_untied"]
    fwd = moretests.jonckheere_terpstra(ref["data"])
    rev = moretests.jonckheere_terpstra(ref["data"][::-1])
    assert rev["p_decreasing"] == pytest.approx(fwd["p_increasing"],
                                                rel=1e-12)
    assert rev["p"] == pytest.approx(fwd["p"], rel=1e-12)
    assert rev["direction"] == "decreasing"


def test_jt_invariant_to_units_and_shift():
    ref = REF["jt_untied"]
    a = moretests.jonckheere_terpstra(ref["data"])
    b = moretests.jonckheere_terpstra(
        [[v * 1e-9 + 1e-12 for v in g] for g in ref["data"]])
    c = moretests.jonckheere_terpstra(
        [[v * 1e9 for v in g] for g in ref["data"]])
    for other in (b, c):
        assert other["statistic"] == a["statistic"]
        assert other["p"] == a["p"]


def test_jt_large_sample_uses_normal_without_ties():
    rng = np.random.default_rng(7)
    groups = [list(rng.normal(i * 0.1, 1, 30)) for i in range(4)]  # N = 120
    jt = moretests.jonckheere_terpstra(groups)
    assert jt["p_method"] == "normal approximation"
    # the exact null agrees with the normal approximation at this size
    exact = moretests.jonckheere_terpstra(groups, method="exact")
    assert exact["p_method"] == "exact"
    assert 0.01 < jt["p"] < 0.5
    assert exact["p"] == pytest.approx(jt["p"], rel=0.02)


@pytest.mark.parametrize("groups,msg", [
    ([[1.0, 2.0], [3.0, 4.0]], "at least 3 groups"),
    ([[1.0], [], [3.0]], "at least one value"),
    ([[5.0, 5.0], [5.0, 5.0], [5.0]], "every value is the same"),
])
def test_jt_edge_cases_say_why(groups, msg):
    with pytest.raises(ValueError, match=msg):
        moretests.jonckheere_terpstra(groups)


def test_jt_error_is_a_message_in_the_result():
    r = api.analyze({"analysis": "anova",
                     "data": _cols([[1.0, 2.0], [3.0, 4.0]]),
                     "options": {"kind": "nonparametric", "trend": True}})
    assert "at least 3 groups" in r["jonckheere"]["error"]
    assert r["p"] is not None  # Kruskal-Wallis still runs


def test_jt_one_value_per_group():
    jt = moretests.jonckheere_terpstra([[1.0], [2.0], [3.0]])
    assert jt["statistic"] == 3 and jt["p_increasing"] == pytest.approx(1 / 6)


# --------------------------------------------------------------- Page

def test_page_hicks_example_published_L_and_exact_p_with_ties():
    ref = REF["page_hicks"]
    r = api.analyze({"analysis": "rm_anova", "data": _matched(
        ref["data"], ref["names"]), "options": {"kind": "nonparametric",
                                               "trend": True}})
    pg = r["page"]
    assert pg["L"] == ref["L_published"] == 133.5
    assert pg["p_method"] == "exact" and pg["ties"]
    assert pg["p_increasing"] == pytest.approx(
        ref["p_increasing_exact_ties"], rel=1e-9)
    assert pg["p_decreasing"] == pytest.approx(
        ref["p_decreasing_exact_ties"], rel=1e-9)
    assert pg["order"] == ref["names"]
    assert r["statistic"] == pytest.approx(stats.friedmanchisquare(
        *np.array(ref["data"], float).T).statistic, rel=1e-12)


def test_page_untied_matches_scipy_exact():
    ref = REF["page_untied"]
    pg = repeated.page_trend(np.array(ref["data"]).T.tolist())
    assert pg["L"] == ref["L"]
    assert pg["p_method"] == "exact" and not pg["ties"]
    assert pg["p_increasing"] == pytest.approx(ref["p_increasing_exact"],
                                               rel=1e-9)
    rev = repeated.page_trend(np.array(ref["data"])[:, ::-1].T.tolist())
    assert rev["p_increasing"] == pytest.approx(
        ref["p_decreasing_exact_reversed"], rel=1e-9)


def test_page_normal_matches_scipy_asymptotic_without_ties():
    ref = REF["page_untied"]
    # 21 rows: beyond the exact rule, so the normal approximation
    rows = ref["data"] * 3
    rows = rows[:21]
    pg = repeated.page_trend(np.array(rows).T.tolist())
    assert pg["p_method"] == "normal approximation"
    asy = stats.page_trend_test(rows, method="asymptotic")
    assert pg["L"] == asy.statistic
    assert pg["p_increasing"] == pytest.approx(asy.pvalue, rel=1e-9)


def test_page_table_value_k3_n10():
    # Page (1963): critical L = 128 for 3 treatments, 10 subjects, 0.05
    ref = REF["page_table_k3_n10"]
    dist, offset = exactdist.page_null(np.array([[2, 4, 6]] * 10))
    tail = lambda L: float(dist[2 * L - offset:].sum())  # noqa: E731
    assert tail(128) == pytest.approx(ref["p_ge_128"], rel=1e-9)
    assert tail(127) == pytest.approx(ref["p_ge_127"], rel=1e-9)
    assert tail(128) <= 0.05 < tail(127)


def test_page_edge_cases():
    with pytest.raises(ValueError, match="at least 3 treatments"):
        repeated.page_trend([[1.0, 2.0], [2.0, 3.0]])
    with pytest.raises(ValueError, match="same value at every treatment"):
        repeated.page_trend([[4.0, 4.0], [4.0, 4.0], [4.0, 4.0]])
    with pytest.raises(ValueError, match="2 complete subject rows"):
        repeated.page_trend([[1.0], [2.0], [3.0]])
    # two subjects, both increasing: P = (1/6)^2 for the top L = 28
    pg = repeated.page_trend([[1.0, 1.5], [2.0, 2.5], [3.0, 3.5]])
    assert pg["L"] == 28 and pg["p_increasing"] == pytest.approx(1 / 36)
