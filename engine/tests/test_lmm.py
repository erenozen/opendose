"""P-87: general linear mixed model on a long table (opendose.lmm).

References (engine/tests/reference/lmm_long.py, which writes
lmm_long.json): statsmodels MixedLM (REML) for estimates and variance
components; an independent dense Satterthwaite / Kenward-Roger
implementation for the df; published lme4 / lmerTest output for
sleepstudy and Pastes (cited in the script). R is not installed.
"""
import csv
import json
import math
import os

import numpy as np
import pytest

from opendose import api, lmm

HERE = os.path.dirname(os.path.abspath(__file__))
REF = json.load(open(os.path.join(HERE, "reference", "lmm_long.json")))


def _csv(name):
    return list(csv.DictReader(open(os.path.join(HERE, "fixtures", name))))


def sleep_vars():
    rows = _csv("lme4_sleepstudy.csv")
    return [{"name": "Reaction", "values": [float(r["Reaction"]) for r in rows]},
            {"name": "Days", "values": [float(r["Days"]) for r in rows]},
            {"name": "Subject", "values": [r["Subject"] for r in rows]}]


def pastes_vars():
    rows = _csv("lme4_pastes.csv")
    return [{"name": "strength", "values": [float(r["strength"]) for r in rows]},
            {"name": "batch", "values": [r["batch"] for r in rows]},
            {"name": "cask", "values": [r["cask"] for r in rows]}]


def animal_vars(records=None):
    recs = records or REF["animals"]["records"]
    return [{"name": k, "values": [r[k] for r in recs]} for k in recs[0]]


def run(variables, outcome, **kw):
    options = kw.pop("options", {})
    return lmm.lmm_long(variables, outcome, options=options, **kw)


def fx(res, term):
    return next(f for f in res["fixed_effects"] if f["term"] == term)


# ---------------------------------------------------------- sleepstudy

@pytest.mark.parametrize("ddf", ["satterthwaite", "kenward_roger"])
def test_sleepstudy_random_intercept(ddf):
    """Acceptance test: Reaction ~ Days + (1 | Subject) matches lme4 /
    lmerTest (published) and statsmodels + the dense df."""
    ref = REF["sleepstudy"]["intercept"]
    res = run(sleep_vars(), "Reaction", covariates=["Days"], group="Subject",
              options={"ddf": ddf})
    assert res["formula"] == "Reaction ~ Days + (1 | Subject)"
    assert res["converged"] and not res["singular"]
    for f, r in zip(res["fixed_effects"], ref["fixed"]):
        assert f["estimate"] == pytest.approx(r["estimate"], rel=1e-7)
        assert f["se_model"] == pytest.approx(r["se_phi"], rel=1e-6)
        key = "df_satterthwaite" if ddf == "satterthwaite" else "df_kenward_roger"
        assert f["df"] == pytest.approx(r[key], rel=1e-4)
    pub = ref["published_lmerTest"]
    assert round(fx(res, "(Intercept)")["se"], 4) == pub["intercept_se"]
    assert round(fx(res, "Days")["se"], 4) == pub["days_se"]
    assert round(fx(res, "(Intercept)")["df"], 2) == round(pub["intercept_df"], 2)
    assert round(fx(res, "Days")["df"], 2) == pub["days_df"]
    assert res["random_effects"][0]["variance"] == pytest.approx(ref["subject_variance"], rel=1e-5)
    assert res["residual"]["variance"] == pytest.approx(ref["residual_variance"], rel=1e-5)
    assert res["goodness_of_fit"]["reml_criterion"] == pytest.approx(ref["reml_criterion"], abs=1e-6)
    # the covariate's F test is its t squared
    assert res["anova"][0]["f"] == pytest.approx(fx(res, "Days")["t"] ** 2, rel=1e-9)


@pytest.mark.parametrize("structure", ["correlated", "independent"])
def test_sleepstudy_random_slope(structure):
    ref = REF["sleepstudy"]["slope"]
    res = run(sleep_vars(), "Reaction", covariates=["Days"], group="Subject",
              slopes=["Days"], options={"ddf": "satterthwaite",
                                        "slope_structure": structure})
    assert res["converged"]
    if structure == "independent":
        assert res["formula"] == "Reaction ~ Days + (1 + Days || Subject)"
        assert res["correlations"] == []
        return
    assert res["formula"] == "Reaction ~ Days + (1 + Days | Subject)"
    pub = ref["published_lme4"]
    re = {e["coefficient"]: e for e in res["random_effects"]}
    assert re["(Intercept)"]["variance"] == pytest.approx(ref["intercept_variance"], rel=1e-4)
    assert re["Days"]["variance"] == pytest.approx(ref["slope_variance"], rel=1e-4)
    assert res["correlations"][0]["r"] == pytest.approx(ref["correlation"], abs=1e-4)
    assert res["residual"]["variance"] == pytest.approx(ref["residual_variance"], rel=1e-5)
    assert round(re["(Intercept)"]["variance"], 2) == pub["intercept_variance"]
    assert round(re["Days"]["variance"], 2) == pub["slope_variance"]
    assert round(res["correlations"][0]["r"], 2) == pub["correlation"]
    assert round(res["residual"]["variance"], 2) == pub["residual_variance"]
    assert round(res["goodness_of_fit"]["reml_criterion"], 1) == pub["reml_criterion"]
    for f, r in zip(res["fixed_effects"], ref["fixed"]):
        assert f["se"] == pytest.approx(r["se_phi"], rel=1e-5)
        assert f["df"] == pytest.approx(r["df_satterthwaite"], rel=1e-4)
    assert round(fx(res, "(Intercept)")["se"], 3) == pub["intercept_se"]
    assert round(fx(res, "Days")["se"], 3) == pub["days_se"]
    assert round(fx(res, "Days")["df"], 3) == pub["df"]


# ------------------------------------------------------- nested levels

@pytest.mark.parametrize("ddf", ["satterthwaite", "kenward_roger"])
def test_pastes_two_nested_levels(ddf):
    """Acceptance test: lme4 Pastes, strength ~ 1 + (1|batch/cask)."""
    ref = REF["pastes"]
    res = run(pastes_vars(), "strength", group="batch", subgroup="cask",
              options={"ddf": ddf})
    assert res["formula"] == "strength ~ 1 + (1 | batch) + (1 | batch:cask)"
    assert res["n_groups"] == {"batch": 10, "cask": 30}
    pub = ref["published_lme4"]
    f = res["fixed_effects"][0]
    assert round(f["estimate"], 4) == pub["intercept"]
    assert round(f["se"], 4) == pub["se"]
    re = {e["group"]: e["variance"] for e in res["random_effects"]}
    assert round(re["batch"], 3) == pub["batch_variance"]
    assert round(res["residual"]["variance"], 3) == pub["residual_variance"]
    # statsmodels' optimiser stops a little earlier: agreement to 1e-3
    assert re["batch"] == pytest.approx(ref["batch_variance"], rel=1e-3)
    assert re["cask"] == pytest.approx(ref["cask_variance"], rel=1e-3)
    key = "df_satterthwaite" if ddf == "satterthwaite" else "df_kenward_roger"
    assert f["df"] == pytest.approx(ref["fixed"][0][key], rel=1e-3)
    assert f["df"] == pytest.approx(9.0, abs=1e-3)   # batches - 1 (balanced)
    assert sum(res["variance_shares"].values()) == pytest.approx(1.0)


@pytest.mark.parametrize("ddf", ["satterthwaite", "kenward_roger"])
def test_animal_slice_cell_with_covariate(ddf):
    ref = REF["animals"]
    res = run(animal_vars(), "current", factors=["genotype"], covariates=["size"],
              group="animal", subgroup="slice",
              options={"ddf": ddf, "levels": {"genotype": ["WT", "KO"]},
                       "comparisons": "tukey"})
    assert res["formula"] == "current ~ genotype + size + (1 | animal) + (1 | animal:slice)"
    assert res["n_groups"] == {"animal": 12, "slice": 36}
    key = "df_satterthwaite" if ddf == "satterthwaite" else "df_kenward_roger"
    for f, r in zip(res["fixed_effects"], ref["fixed"]):
        assert f["term"] == r["term"]
        assert f["estimate"] == pytest.approx(r["estimate"], rel=1e-6, abs=1e-8)
        assert f["se_model"] == pytest.approx(r["se_phi"], rel=1e-5)
        assert f["df"] == pytest.approx(r[key], rel=1e-4)
        if ddf == "kenward_roger":
            assert f["se"] == pytest.approx(r["se_kenward_roger"], rel=1e-5)
    re = {e["group"]: e["variance"] for e in res["random_effects"]}
    assert re["animal"] == pytest.approx(ref["animal_variance"], rel=1e-4)
    assert re["slice"] == pytest.approx(ref["slice_variance"], rel=1e-4)
    assert res["residual"]["variance"] == pytest.approx(ref["residual_variance"], rel=1e-6)
    assert res["goodness_of_fit"]["reml_criterion"] == pytest.approx(ref["reml_criterion"], abs=1e-5)
    # one-df genotype test = the KO coefficient's t test
    g = next(a for a in res["anova"] if a["term"] == "genotype")
    assert g["f"] == pytest.approx(fx(res, "genotype: KO")["t"] ** 2, rel=1e-6)
    assert g["dfd"] == pytest.approx(fx(res, "genotype: KO")["df"], rel=1e-9)
    # the marginal means differ by the KO coefficient
    m = {e["level"]: e["mean"] for e in res["emmeans"]["genotype"]}
    assert m["KO"] - m["WT"] == pytest.approx(fx(res, "genotype: KO")["estimate"], abs=1e-9)
    c = res["comparisons"]["comparisons"][0]
    assert c["p_unadjusted"] == pytest.approx(fx(res, "genotype: KO")["p"], rel=1e-9)


def test_api_handler_and_errors():
    out = api.analyze({"analysis": "lmm", "data": {"variables": sleep_vars()},
                       "options": {"outcome": "Reaction", "group": "Subject",
                                   "covariates": ["Days"], "ddf": "satterthwaite"}})
    assert out["analysis"] == "lmm" and "error" not in out
    assert api.analyze({"analysis": "lmm", "data": {"variables": sleep_vars()},
                        "options": {"outcome": "Reaction"}})["error"] == "lmm needs options.group"
    bad = api.analyze({"analysis": "lmm", "data": {"variables": sleep_vars()},
                       "options": {"outcome": "Reaction", "group": "Subject",
                                   "ddf": "containment"}})
    assert "containment df are not defined" in bad["error"]


# --------------------------------------------------- invariance checks

def test_units_and_row_order_invariance():
    # the reference level is fixed (otherwise the first one seen)
    opts = {"ddf": "kenward_roger", "levels": {"genotype": ["WT", "KO"]}}
    base = run(animal_vars(), "current", factors=["genotype"], covariates=["size"],
               group="animal", subgroup="slice", options=opts)
    recs = [dict(r) for r in REF["animals"]["records"]]
    # outcome in pA instead of nA (x 1000), size in m instead of um (x 1e-6)
    scaled = [{**r, "current": r["current"] * 1e3, "size": r["size"] * 1e-6} for r in recs]
    rng = np.random.default_rng(1)
    shuffled = [scaled[i] for i in rng.permutation(len(scaled))]
    res = run(animal_vars(shuffled), "current", factors=["genotype"], covariates=["size"],
              group="animal", subgroup="slice", options=opts)
    for a, b in zip(base["fixed_effects"], res["fixed_effects"]):
        k = 1e3 * (1e6 if a["term"] == "size" else 1.0)
        assert b["estimate"] == pytest.approx(a["estimate"] * k, rel=1e-6)
        assert b["se"] == pytest.approx(a["se"] * k, rel=1e-6)
        assert b["df"] == pytest.approx(a["df"], rel=1e-6)
        assert b["p"] == pytest.approx(a["p"], rel=1e-5)
    for a, b in zip(base["random_effects"], res["random_effects"]):
        assert b["variance"] == pytest.approx(a["variance"] * 1e6, rel=1e-5)
    for a, b in zip(base["anova"], res["anova"]):
        assert b["f"] == pytest.approx(a["f"], rel=1e-6)


@pytest.mark.parametrize("mag", [1e-12, 1e12])
def test_extreme_magnitudes(mag):
    v = sleep_vars()
    v[0]["values"] = [x * mag for x in v[0]["values"]]
    res = run(v, "Reaction", covariates=["Days"], group="Subject", slopes=["Days"],
              options={"ddf": "satterthwaite"})
    ref = REF["sleepstudy"]["slope"]["fixed"]
    assert res["converged"]
    assert fx(res, "Days")["estimate"] == pytest.approx(ref[1]["estimate"] * mag, rel=1e-6)
    assert fx(res, "Days")["se"] == pytest.approx(ref[1]["se_phi"] * mag, rel=1e-5)
    assert fx(res, "Days")["df"] == pytest.approx(17.0, rel=1e-4)


def test_group_labels_are_labels():
    """Subject IDs typed as numbers are labels; relabelling changes nothing."""
    v = sleep_vars()
    v2 = [dict(x) for x in v]
    v2[2] = {"name": "Subject", "values": [f"mouse {s}" for s in v[2]["values"]]}
    a = run(v, "Reaction", covariates=["Days"], group="Subject")
    b = run(v2, "Reaction", covariates=["Days"], group="Subject")
    assert a["fixed_effects"] == b["fixed_effects"]


# ------------------------------------------------------------ edge cases

def test_missing_values_are_counted_and_left_out():
    v = sleep_vars()
    v[0]["values"][3] = None
    v[0]["values"][7] = "n/a"
    v[1]["values"][10] = ""
    res = run(v, "Reaction", covariates=["Days"], group="Subject")
    assert res["n_values"] == 177
    assert res["warnings"][0].startswith("3 rows with a blank or non-numeric value")


def test_boundary_fit_is_stated():
    """Groups that differ less than the residual scatter predicts: the
    group variance is estimated at zero and the result says so."""
    rng = np.random.default_rng(5)
    g = np.repeat(np.arange(6), 5)
    y = 10 + rng.normal(0, 1, g.size)
    # remove most between-group variation
    for k in range(6):
        y[g == k] -= y[g == k].mean() - 10
    res = run([{"name": "y", "values": y.tolist()},
               {"name": "g", "values": [f"G{k}" for k in g]}], "y", group="g",
              options={"ddf": "satterthwaite"})
    assert res["singular"] is True
    assert res["random_effects"][0]["at_boundary"] is True
    assert res["random_effects"][0]["variance"] == pytest.approx(0.0, abs=1e-6)
    assert any(w.startswith("Boundary (singular) fit: (Intercept) by g") for w in res["warnings"])
    # the model reduces to ordinary regression: intercept df = n - 1
    assert res["ddf_parameters_dropped"] == 1
    assert fx(res, "(Intercept)")["df"] == pytest.approx(29.0, rel=1e-6)
    assert fx(res, "(Intercept)")["se"] == pytest.approx(np.std(y, ddof=1) / math.sqrt(30), rel=1e-6)


def test_perfect_correlation_slope_is_flagged_as_boundary():
    """Every subject's slope is a multiple of its intercept shift: the
    intercept-slope correlation goes to +-1, a boundary the result names."""
    rng = np.random.default_rng(7)
    recs = []
    for s in range(8):
        b = rng.normal(0, 3)
        for t in range(6):
            recs.append({"y": 5 + b + (1 + 0.5 * b) * t + rng.normal(0, 0.05),
                         "t": float(t), "s": f"S{s}"})
    v = [{"name": k, "values": [r[k] for r in recs]} for k in recs[0]]
    res = run(v, "y", covariates=["t"], group="s", slopes=["t"])
    assert res["singular"]
    assert "correlation" in res["warnings"][-1] or "Boundary" in res["warnings"][-1]


@pytest.mark.parametrize("case,msg", [
    ("one_group", "need at least 2 levels of g"),
    ("all_equal", "every value of the outcome is the same"),
    ("two_rows", "need at least 3 complete rows"),
    ("constant_cov", "has the same value in every row"),
    ("slope_not_varying", "does not vary within any g"),
    ("slope_not_covariate", "a random slope needs x as a covariate"),
    ("subgroup_single", "each sub holds one value"),
    ("same_column", "must be different variables"),
])
def test_errors(case, msg):
    y = [1.0, 2.0, 3.5, 2.2, 4.1, 3.3, 5.0, 2.9]
    g = ["a", "a", "b", "b", "c", "c", "d", "d"]
    x = [0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0]
    kw = {"group": "g"}
    if case == "one_group":
        g = ["a"] * 8
    elif case == "all_equal":
        y = [2.0] * 8
    elif case == "two_rows":
        y = [1.0, 2.0] + [None] * 6
    elif case == "constant_cov":
        x = [1.0] * 8
        kw["covariates"] = ["x"]
    elif case == "slope_not_varying":
        x = [float(i) for i in range(4) for _ in range(2)]
        kw.update(covariates=["x"], slopes=["x"])
    elif case == "slope_not_covariate":
        kw["slopes"] = ["x"]
    elif case == "subgroup_single":
        kw["subgroup"] = "sub"
    elif case == "same_column":
        kw["covariates"] = ["y"]
    v = [{"name": "y", "values": y}, {"name": "g", "values": g},
         {"name": "x", "values": x}, {"name": "sub", "values": list(range(8))}]
    with pytest.raises(ValueError, match=msg):
        run(v, "y", **kw)


def test_two_factors_interaction_and_comparisons():
    """Two crossed factors within animals (litter as the group): the
    interaction test is the 2 x 2 difference of differences."""
    rng = np.random.default_rng(11)
    recs = []
    for lit in range(8):
        u = rng.normal(0, 1)
        for sex in ("F", "M"):
            for trt in ("Veh", "Drug"):
                for _ in range(2):
                    recs.append({"y": 5 + u + (1.5 if trt == "Drug" else 0)
                                 + (1.0 if trt == "Drug" and sex == "M" else 0)
                                 + rng.normal(0, 0.7),
                                 "sex": sex, "trt": trt, "litter": f"L{lit}"})
    v = [{"name": k, "values": [r[k] for r in recs]} for k in recs[0]]
    res = run(v, "y", factors=["sex", "trt"], group="litter",
              options={"levels": {"trt": ["Veh", "Drug"]}, "comparisons": "sidak",
                       "comparison_scope": "b_within_a"})
    inter = next(a for a in res["anova"] if a["term"] == "sex × trt")
    coef = fx(res, "sex: M × trt: Drug")
    assert inter["f"] == pytest.approx(coef["t"] ** 2, rel=1e-6)
    cells = {e["level"]: e["mean"] for e in res["emmeans"]["cells"]}
    dod = (cells["M / Drug"] - cells["M / Veh"]) - (cells["F / Drug"] - cells["F / Veh"])
    assert dod == pytest.approx(coef["estimate"], abs=1e-9)
    assert len(res["comparisons"]["comparisons"]) == 2
    assert res["comparisons"]["family"]["size"] == 2


def test_single_level_factor_is_dropped_with_a_note():
    v = sleep_vars() + [{"name": "lab", "values": ["one"] * 180}]
    res = run(v, "Reaction", factors=["lab"], covariates=["Days"], group="Subject")
    assert "lab has a single level and is left out of the model." in res["warnings"]
    assert res["formula"] == "Reaction ~ Days + (1 | Subject)"
