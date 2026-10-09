"""API wiring of the Wave 1 handlers: survival_pairwise, survival_at_time,
rmst and residuals_column (the methods themselves are validated in
test_survival_extras.py and test_residuals.py), plus the survival
handler's warnings and rm_anova's subject term."""

import json

import pytest
from scipy import stats

from opendose.api import analyze, analyze_json

# R survival::aml (Maintained / Nonmaintained), + = censored
MAINT = [(9, 1), (13, 1), (13, 0), (18, 1), (23, 1), (28, 0), (31, 1),
         (34, 1), (45, 0), (48, 1), (161, 0)]
NONM = [(5, 1), (5, 1), (8, 1), (8, 1), (12, 1), (16, 0), (23, 1), (27, 1),
        (30, 1), (33, 1), (43, 1), (45, 1)]
THIRD = [(3, 1), (4, 1), (6, 1), (7, 0), (9, 1), (10, 1), (14, 1),
         (15, 1), (20, 0), (22, 1)]


def _surv(*groups, names=None):
    names = names or ["Maintained", "Nonmaintained", "Third"][:len(groups)]
    return {"datasets": [{"name": n, "ys": [[t, e] for t, e in g]}
                         for n, g in zip(names, groups)]}


def test_survival_pairwise_handler():
    r = analyze({"analysis": "survival_pairwise",
                 "data": _surv(MAINT, NONM, THIRD),
                 "options": {"correction": "bonferroni",
                             "statistic": "variance"}})
    assert "error" not in r, r.get("error")
    assert r["family"]["size"] == 3 and len(r["comparisons"]) == 3
    c = r["comparisons"][0]
    # R: survdiff(Surv(time, status) ~ x, data = aml): Chisq = 3.4, p = 0.07
    assert c["chi2"] == pytest.approx(3.396389, rel=1e-5)
    assert c["p_adjusted"] == pytest.approx(min(3 * c["p_unadjusted"], 1))
    assert r["trend"]["df"] == 1
    json.loads(analyze_json(json.dumps(
        {"analysis": "survival_pairwise", "data": _surv(MAINT, NONM)})))


def test_survival_pairwise_default_holm_sidak_vs_control():
    r = analyze({"analysis": "survival_pairwise",
                 "data": _surv(MAINT, NONM, THIRD),
                 "options": {"family": "control", "control": 1}})
    assert r["correction"] in ("holm_sidak", "holm-sidak")
    assert r["family_size"] == 2


def test_survival_at_time_handler_and_median_text():
    r = analyze({"analysis": "survival_at_time",
                 "data": _surv(MAINT, NONM), "options": {"times": [20]}})
    g = r["groups"][0]
    # R: summary(survfit(Surv(time, status) ~ x, aml), times = 20):
    # Maintained survival 0.716, std.err 0.1397
    assert g["at_times"][0]["survival"] == pytest.approx(0.716, abs=5e-4)
    assert g["at_times"][0]["se"] == pytest.approx(0.1397, abs=5e-5)
    assert g["explanation"]["median_reached"] is True
    assert isinstance(g["explanation"]["text"], str)
    missing = analyze({"analysis": "survival_at_time",
                       "data": _surv(MAINT), "options": {}})
    assert "options.times" in missing["error"]


def test_rmst_handler():
    r = analyze({"analysis": "rmst", "data": _surv(NONM, MAINT),
                 "options": {}})
    assert "error" not in r, r.get("error")
    assert r["tau"] == 45
    assert r["groups"][0]["rmst"] == pytest.approx(22.7083, abs=1e-4)
    assert r["groups"][1]["rmst"] == pytest.approx(30.7386, abs=1e-4)
    d = r["difference"][0]
    assert d["estimate"] == pytest.approx(30.7386 - 22.7083, abs=2e-4)
    bad = analyze({"analysis": "rmst", "data": _surv(NONM, MAINT),
                   "options": {"tau": 500}})
    assert "error" in bad


def test_survival_handlers_warn_about_dropped_rows_and_few_events():
    data = _surv([(1, 1), (2, 0), (3, 1)], [(2, 1), (4, 1), (5, 0)],
                 names=["A", "B"])
    data["datasets"][0]["ys"].append([7, None])
    r = analyze({"analysis": "survival", "data": data})
    assert any("row 4" in w for w in r["warnings"])
    assert any("event" in w for w in r["warnings"])
    for kind, opts in (("survival_pairwise", {}),
                       ("survival_at_time", {"times": [2]}),
                       ("rmst", {})):
        res = analyze({"analysis": kind, "data": data, "options": opts})
        assert "error" not in res, (kind, res.get("error"))
        assert any("row 4" in w for w in res["warnings"]), kind


def test_residuals_column_handler():
    groups = [[4.17, 5.58, 5.18, 6.11, 4.50], [4.81, 4.17, 4.41, None, 3.59],
              [6.31, 5.12, 5.54, 5.50]]
    data = {"datasets": [{"name": n, "ys": [[v] for v in g]}
                         for n, g in zip("ABC", groups)]}
    r = analyze({"analysis": "residuals_column", "data": data})
    assert "error" not in r, r.get("error")
    assert len(r["points"]) == 13
    assert r["shapiro"]["W"] == pytest.approx(
        stats.shapiro([p["residual"] for p in r["points"]])[0], rel=1e-12)
    assert r["dropped"] == [{"group": "B", "index": 3,
                             "reason": "missing value"}]
    assert r["warnings"]
    rp = analyze({"analysis": "residuals_column", "data": data,
                  "options": {"paired": True}})
    assert rp["paired"] is True
    assert all(p["group"] == "difference" for p in rp["points"])
    assert len(rp["points"]) == 4


def test_rm_anova_subject_term_and_incomplete_subjects():
    data = {"datasets": [
        {"name": "T1", "ys": [[1.0], [2.0], [None], [4.0], [5.0]]},
        {"name": "T2", "ys": [[2.0], [3.5], [5.0], [None], [7.0]]},
        {"name": "T3", "ys": [[4.0], [6.0], [7.0], [8.0], [9.5]]}]}
    r = analyze({"analysis": "rm_anova", "data": data})
    t = r["table"]
    assert t["df_subject"] == 2 and t["ss_subject"] > 0
    assert r["incomplete_subjects"] == [2, 3]
    assert r["warnings"]
    f = analyze({"analysis": "rm_anova", "data": data,
                 "options": {"kind": "nonparametric"}})
    assert f["incomplete_subjects"] == [2, 3] and f["n_subjects"] == 3


def test_rm_anova_friedman_dunn_options_pass_through():
    data = {"datasets": [
        {"name": n, "ys": [[v] for v in vals]} for n, vals in (
            ("T1", [1.0, 2.0, 3.0, 4.0, 5.0, 2.5]),
            ("T2", [2.0, 3.5, 5.0, 4.5, 7.0, 3.0]),
            ("T3", [4.0, 6.0, 7.0, 8.0, 9.5, 5.5]))]}
    r = analyze({"analysis": "rm_anova", "data": data,
                 "options": {"kind": "nonparametric", "dunn_family":
                             "control", "control": 0,
                             "dunn_correction": "holm"}})
    comps = r["dunns"]["comparisons"]
    assert len(comps) == 2
    assert all(c["family_size"] == 2 and c["method"] == "dunn_holm"
               for c in comps)
    assert all(c["p_unadjusted"] <= c["p_adjusted"] for c in comps)
