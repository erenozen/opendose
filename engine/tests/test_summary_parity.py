"""P-84: data entered as mean, SD and N get the options of raw data.

- One-way ANOVA: planned families (each vs. control, planned pairs) and
  Holm, equal to the raw-data path on data with exactly those means,
  SDs and Ns, and to statsmodels (OLS + multipletests).
- The log-scale analysis from mean and SD (lognormal moment conversion,
  approximate): the conversion against scipy.stats.lognorm, and the
  pipeline against the raw log-scale path on data whose logarithms have
  exactly the converted moments.
- Compare a parameter on a mean / SD / N table equals the comparison of
  the replicates.
- The mixed-model RM path (missing values) with Holm and planned
  families, against statsmodels MixedLM + multipletests.

Reference values: engine/tests/reference/summary_parity.py (R is not
installed; statsmodels / scipy are the oracles).
"""

import json
import math
import os

import numpy as np
import pytest

from opendose import api, summary

REF = json.load(open(os.path.join(os.path.dirname(__file__), "reference",
                                  "summary_parity.json")))


def _summary_payload(groups):
    return {"format": "mean_sd_n",
            "datasets": [{"name": g["name"],
                          "rows": [[g["mean"], g["sd"], g["n"]]]}
                         for g in groups]}


def _raw_payload(cols, names):
    return {"datasets": [{"name": n, "ys": [[v] for v in c]}
                         for n, c in zip(names, cols)]}


def _both(options, groups=None, cols=None):
    groups = groups or REF["groups"]
    cols = cols or REF["raw"]
    names = [g["name"] for g in groups]
    s = api.analyze({"analysis": "anova_summary",
                     "data": _summary_payload(groups), "options": options})
    r = api.analyze({"analysis": "anova", "data": _raw_payload(cols, names),
                     "options": options})
    assert "error" not in s and "error" not in r, (s.get("error"),
                                                     r.get("error"))
    return s, r


def _same_comparisons(a, b, rel=1e-9):
    ca, cb = a["comparisons"], b["comparisons"]
    assert [c["pair"] for c in ca] == [c["pair"] for c in cb]
    for x, y in zip(ca, cb):
        for key in ("difference", "statistic", "p_unadjusted", "p_adjusted"):
            assert x[key] == pytest.approx(y[key], rel=rel, abs=1e-14), key
        if x["ci"] is None:
            assert y["ci"] is None
        else:
            assert x["ci"] == pytest.approx(y["ci"], rel=rel)
    assert a["family"] == b["family"]
    assert a.get("planned_pairs") == b.get("planned_pairs")


def test_exact_moment_data_has_the_entered_summaries():
    for g, c in zip(REF["groups"], REF["raw"]):
        assert len(c) == g["n"]
        assert np.mean(c) == pytest.approx(g["mean"], rel=1e-12)
        assert np.std(c, ddof=1) == pytest.approx(g["sd"], rel=1e-12)


def test_acceptance_holm_vs_control_equals_raw_path_and_statsmodels():
    opts = {"comparisons": "holm", "comparisons_family": "control",
            "control_index": 0}
    s, r = _both(opts)
    assert s["table"]["F"] == pytest.approx(r["table"]["F"], rel=1e-10)
    assert s["table"]["p"] == pytest.approx(r["table"]["p"], rel=1e-9)
    _same_comparisons(s["multiple_comparisons"], r["multiple_comparisons"])
    o = REF["ols"]
    assert s["table"]["F"] == pytest.approx(o["F"], rel=1e-9)
    assert s["table"]["p"] == pytest.approx(o["p"], rel=1e-8)
    mc = s["multiple_comparisons"]
    assert mc["family"]["size"] == 3
    assert mc["family"]["label"] == ("Holm, 3 comparisons (each of 3 groups "
                                     "vs. the control Control)")
    for c, ref in zip(mc["comparisons"], o["holm_vs_control"]):
        assert c["pair"] == ref["pair"]
        assert c["difference"] == pytest.approx(ref["difference"], rel=1e-10)
        assert c["p_unadjusted"] == pytest.approx(ref["p_unadjusted"],
                                                  rel=1e-8)
        assert c["p_adjusted"] == pytest.approx(ref["p_adjusted"], rel=1e-8)
    # display precision (the e2e and the independent check read these)
    assert [round(c["p_adjusted"], 4) for c in mc["comparisons"]] == \
        [0.3268, 0.0316, 0.0002]


@pytest.mark.parametrize("method,family,key", [
    ("holm_sidak", "control", "holm_sidak_vs_control"),
    ("bonferroni", "pairs", "bonferroni_planned"),
    ("sidak", "pairs", "sidak_planned"),
    ("holm", "all", "holm_all"),
])
def test_planned_families_equal_raw_path_and_statsmodels(method, family, key):
    opts = {"comparisons": method, "comparisons_family": family,
            "control_index": 0, "pairs": REF["planned_pairs"]}
    s, r = _both(opts)
    _same_comparisons(s["multiple_comparisons"], r["multiple_comparisons"])
    for c, ref in zip(s["multiple_comparisons"]["comparisons"], REF["ols"][key]):
        assert c["pair"] == ref["pair"]
        assert c["p_adjusted"] == pytest.approx(ref["p_adjusted"], rel=1e-8)


@pytest.mark.parametrize("method", ["fisher_lsd", "tukey", "dunnett",
                                    "newman_keuls"])
def test_other_methods_still_equal_raw_path(method):
    opts = {"comparisons": method, "control_index": 0}
    if method == "fisher_lsd":
        opts.update(comparisons_family="pairs", pairs=REF["planned_pairs"])
    s, r = _both(opts)
    a, b = s["multiple_comparisons"], r["multiple_comparisons"]
    assert [c["pair"] for c in a["comparisons"]] == \
        [c["pair"] for c in b["comparisons"]]
    for x, y in zip(a["comparisons"], b["comparisons"]):
        for key in ("difference", "p_adjusted", "significant_05"):
            if y.get(key) is None:  # Newman-Keuls reports no adjusted P
                assert x.get(key) is None
            else:
                assert x[key] == pytest.approx(y[key], rel=1e-7), key


def test_fixed_family_methods_refuse_a_planned_family():
    with pytest.raises(ValueError, match="its own fixed family"):
        summary.one_way_anova_summary(
            REF["groups"], comparisons="tukey", comparisons_family="control")


def test_family_invariant_to_group_order():
    groups = list(reversed(REF["groups"]))
    opts = {"comparisons": "holm", "comparisons_family": "control",
            "control_index": 3}
    s = api.analyze({"analysis": "anova_summary",
                     "data": _summary_payload(groups), "options": opts})
    got = {c["pair"]: c["p_adjusted"]
           for c in s["multiple_comparisons"]["comparisons"]}
    for ref in REF["ols"]["holm_vs_control"]:
        assert got[ref["pair"]] == pytest.approx(ref["p_adjusted"], rel=1e-8)


def test_units_change_leaves_p_unchanged():
    scaled = [{**g, "mean": g["mean"] * 1e-9, "sd": g["sd"] * 1e-9}
              for g in REF["groups"]]
    opts = {"comparisons": "holm", "comparisons_family": "control"}
    a = api.analyze({"analysis": "anova_summary",
                     "data": _summary_payload(REF["groups"]), "options": opts})
    b = api.analyze({"analysis": "anova_summary",
                     "data": _summary_payload(scaled), "options": opts})
    assert b["table"]["F"] == pytest.approx(a["table"]["F"], rel=1e-9)
    for x, y in zip(a["multiple_comparisons"]["comparisons"],
                    b["multiple_comparisons"]["comparisons"]):
        assert y["p_adjusted"] == pytest.approx(x["p_adjusted"], rel=1e-9)
        assert y["difference"] == pytest.approx(x["difference"] * 1e-9,
                                                rel=1e-9)


# ------------------------------------------------------------- log scale

def test_lognormal_conversion_matches_scipy_lognorm():
    for g, ref in zip(REF["log_groups"], REF["lognorm"]):
        mu, sigma = summary.lognormal_log_moments(g["mean"], g["sd"], "ln")
        assert mu == pytest.approx(ref["mu_ln"], rel=1e-14)
        assert sigma == pytest.approx(ref["sigma_ln"], rel=1e-14)
        m10, s10 = summary.lognormal_log_moments(g["mean"], g["sd"])
        assert m10 == pytest.approx(ref["mu_log10"], rel=1e-14)
        assert s10 == pytest.approx(ref["sigma_log10"], rel=1e-14)
        # the lognormal with these parameters has the entered moments
        assert ref["scipy_mean"] == pytest.approx(g["mean"], rel=1e-12)
        assert ref["scipy_sd"] == pytest.approx(g["sd"], rel=1e-12)


def _log_exact_raw(groups, base=10.0):
    """Raw values whose log10 have exactly the converted moments."""
    cols = []
    for i, g in enumerate(groups):
        mu, sigma = summary.lognormal_log_moments(g["mean"], g["sd"])
        z = np.random.default_rng(300 + i).standard_normal(g["n"])
        z = (z - z.mean()) / z.std(ddof=1)
        cols.append(list(base ** (mu + sigma * z)))
    return cols


def test_log_scale_anova_equals_raw_log_path_on_matching_logs():
    groups = REF["log_groups"]
    cols = _log_exact_raw(groups)
    opts = {"log_scale": True, "comparisons": "holm",
            "comparisons_family": "control", "control_index": 0}
    s, r = _both(opts, groups, cols)
    assert s["table"]["F"] == pytest.approx(r["table"]["F"], rel=1e-9)
    _same_comparisons(s["multiple_comparisons"], r["multiple_comparisons"],
                      rel=1e-8)
    for x, y in zip(s["geometric_means"], r["geometric_means"]):
        assert x["geometric_mean"] == pytest.approx(y["geometric_mean"],
                                                    rel=1e-10)
        assert x["ci"] == pytest.approx(y["ci"], rel=1e-10)
    for x, y in zip(s["multiple_comparisons"]["comparisons"],
                    r["multiple_comparisons"]["comparisons"]):
        assert x["ratio"] == pytest.approx(y["ratio"], rel=1e-10)
    # stated as approximate, with its source, next to the numbers
    ls = s["log_scale"]
    assert ls["approximate"] is True and s["exact"] is False
    assert "lognormal moment conversion" in ls["approximation"]
    assert "Higgins" in ls["approximation_source"]
    assert "approximate" not in r["log_scale"]


def test_log_scale_t_test_equals_raw_log_path():
    groups = REF["log_groups"][:2]
    cols = _log_exact_raw(groups)
    s = api.analyze({"analysis": "ttest_summary",
                     "data": _summary_payload(groups),
                     "options": {"log_scale": True}})
    r = api.analyze({"analysis": "ttest",
                     "data": _raw_payload(cols, [g["name"] for g in groups]),
                     "options": {"log_scale": True}})
    for key in ("t", "df", "p_two_tailed", "ratio"):
        assert s[key] == pytest.approx(r[key], rel=1e-9), key
    assert s["ratio_ci"] == pytest.approx(r["ratio_ci"], rel=1e-9)
    assert s["log_scale"]["approximate"] is True


def test_log_scale_approximation_is_close_on_a_lognormal_sample():
    """Not an identity: the converted moments differ from the sample's
    own logs. On this lognormal sample (n = 10, sigma_ln 0.45) the mean
    logs agree to within 0.03 log10 units (a 7% ratio) and the SDs of the
    logs to within 25%: hence the "approximate" label."""
    ap = REF["approximation"]
    for (m, sd), (cm, csd) in zip(ap["raw_log10_mean_sd"],
                                  ap["converted_log10_mean_sd"]):
        assert abs(cm - m) < 0.03
        assert csd == pytest.approx(sd, rel=0.25)


@pytest.mark.parametrize("mean", [0.0, -2.0])
def test_log_scale_refuses_non_positive_means(mean):
    groups = [dict(REF["log_groups"][0], mean=mean), REF["log_groups"][1]]
    r = api.analyze({"analysis": "anova_summary",
                     "data": _summary_payload(groups),
                     "options": {"log_scale": True}})
    assert "every mean > 0" in r["error"]


def test_log_scale_needs_n_and_sd():
    groups = [dict(REF["log_groups"][0], n=1), REF["log_groups"][1]]
    r = api.analyze({"analysis": "anova_summary",
                     "data": _summary_payload(groups),
                     "options": {"log_scale": True}})
    assert "n >= 2" in r["error"]


def test_scale_check_on_summary_anova_without_log_scale():
    r = api.analyze({"analysis": "anova_summary",
                     "data": _summary_payload(REF["log_groups"]),
                     "options": {}})
    assert r["scale_check"]["suggest_log"] is True


# ------------------------------------------------------ compare a parameter

X = [-9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5]
REPS = [
    [[2, 4, 3], [8, 6, 9], [18, 21, 16], [41, 38, 45], [70, 66, 73],
     [88, 91, 85], [96, 98, 95], [99, 101, 100]],
    [[1, 2, 3], [3, 4, 2], [7, 9, 8], [19, 17, 22], [42, 47, 40],
     [72, 69, 75], [90, 88, 92], [97, 99, 96]],
]


def _sd(v):
    return float(np.std(v, ddof=1))


@pytest.mark.parametrize("fmt", ["mean_sd_n", "mean_sem_n"])
def test_compare_parameter_from_summary_equals_replicates(fmt):
    raw = {"x": X, "datasets": [{"name": n, "ys": r}
                                for n, r in zip(("A", "B"), REPS)]}

    def row(v):
        err = _sd(v) if fmt == "mean_sd_n" else _sd(v) / math.sqrt(len(v))
        return [float(np.mean(v)), err, len(v)]
    summ = {"x": X, "datasets": [{"name": n, "ys": [row(v) for v in r]}
                                 for n, r in zip(("A", "B"), REPS)]}
    opts = {"model": "log_agonist_vs_response_4pl", "parameter": "logEC50"}
    a = api.analyze({"analysis": "compare_parameter", "data": raw,
                     "options": opts})
    b = api.analyze({"analysis": "compare_parameter", "data": summ,
                     "options": {**opts, "summary_format": fmt}})
    assert "error" not in a and "error" not in b, b.get("error")
    for key in ("value", "se", "df", "p"):
        assert b["difference"][key] == pytest.approx(a["difference"][key],
                                                     rel=1e-6), key
    assert b["ratio"]["value"] == pytest.approx(a["ratio"]["value"], rel=1e-6)
    assert b["f_test"]["F"] == pytest.approx(a["f_test"]["F"], rel=1e-6)
    assert b["f_test"]["p"] == pytest.approx(a["f_test"]["p"], rel=1e-6)


def test_compare_parameter_refuses_summary_without_n():
    summ = {"x": X, "datasets": [{"name": n, "ys": [[np.mean(v), _sd(v)]
                                                    for v in r]}
                                 for n, r in zip(("A", "B"), REPS)]}
    r = api.analyze({"analysis": "compare_parameter", "data": summ,
                     "options": {"model": "log_agonist_vs_response_4pl",
                                 "parameter": "logEC50",
                                 "summary_format": "mean_sd"}})
    assert "needs N" in r["error"]


# ------------------------------------------------------- mixed RM (Holm)

def _mixed(options):
    m = REF["mixed"]
    data = {"datasets": [{"name": nm, "ys": [[row[t]] for row in m["rows"]]}
                         for t, nm in enumerate(m["names"])]}
    return api.analyze({"analysis": "mixed_rm_oneway", "data": data,
                        "options": options})


def test_mixed_rm_holm_vs_baseline_matches_statsmodels_mixedlm():
    r = _mixed({"comparisons": "holm", "comparisons_family": "control",
                "control_index": 0})
    mc = r["multiple_comparisons"]
    assert mc["df"] == REF["mixed"]["df"]
    assert mc["family"]["size"] == 3
    assert mc["family"]["label"].startswith("Holm, 3 comparisons")
    for c, ref in zip(mc["comparisons"], REF["mixed"]["holm_vs_baseline"]):
        assert c["pair"] == ref["pair"]
        # MixedLM's REML optimum agrees to ~1e-6
        assert c["difference"] == pytest.approx(ref["difference"], rel=1e-5)
        assert c["se"] == pytest.approx(ref["se"], rel=1e-5)
        assert c["p_adjusted"] == pytest.approx(ref["p_adjusted"], rel=1e-4)
        assert c["ci"] is None  # step-down: no simultaneous CI


def test_mixed_rm_planned_pairs_correct_for_the_family_only():
    pairs = [[3, 0], [2, 1]]
    a = _mixed({"comparisons": "bonferroni", "comparisons_family": "pairs",
                "pairs": pairs})
    f = _mixed({"comparisons": "fisher", "comparisons_family": "pairs",
                "pairs": pairs})
    mc = a["multiple_comparisons"]
    assert mc["planned_pairs"] == pairs
    assert mc["family"]["label"] == ("Bonferroni, 2 comparisons (planned "
                                     "pairs only)")
    for c, u in zip(mc["comparisons"], f["multiple_comparisons"]["comparisons"]):
        assert c["p_unadjusted"] == pytest.approx(u["p_unadjusted"], rel=1e-12)
        assert c["p_adjusted"] == pytest.approx(min(2 * u["p_unadjusted"], 1),
                                                rel=1e-12)


def test_mixed_rm_complete_data_equals_rm_posthoc_pooled_holm():
    rows = [r for r in REF["mixed"]["rows"] if None not in r]
    names = REF["mixed"]["names"]
    data = {"datasets": [{"name": nm, "ys": [[row[t]] for row in rows]}
                         for t, nm in enumerate(names)]}
    m = api.analyze({"analysis": "mixed_rm_oneway", "data": data, "options": {
        "comparisons": "holm", "comparisons_family": "control"}})
    rm = api.analyze({"analysis": "rm_anova", "data": data, "options": {
        "comparisons": {"method": "holm", "family": "control",
                        "error": "pooled"}}})
    for x, y in zip(m["multiple_comparisons"]["comparisons"],
                    rm["comparisons"]["comparisons"]):
        assert x["pair"] == y["pair"]
        assert x["p_adjusted"] == pytest.approx(y["p_adjusted"], rel=1e-6)


def test_mixed_rm_fixed_family_refuses_planned():
    r = _mixed({"comparisons": "tukey", "comparisons_family": "control"})
    assert "its own fixed family" in r["error"]
