"""User-defined equations (opendose.userequation) and the API plumbing
for the equation library: user_equation in dose_response,
global_model_fit, validate_equation and list_models.

Pinned references: a user-written 4PL reproduces the built-in 4PL fit of
the reference data set (test_api.REF_Y) exactly; user equations with
intermediate lines, <A>/<B> lines and column constants reproduce the
corresponding built-in equations; transforms to report reproduce the
built-in derived values and the interpolation module.
"""

import math

import numpy as np
import pytest
from scipy import stats

from opendose import api, interpolate, userequation as ue
from opendose.equations import fit_global_model
from opendose.nlfit import MODELS, fit_model

from test_api import REF_X_MOLAR, REF_Y
from test_prism_parity import CONC as PRISM_CONC

FOUR_PL = "Y=Bottom + (Top-Bottom)/(1+10^((LogIC50-X)*HillSlope))"
FOUR_PL_RULES = {"Bottom": "1*YMIN", "Top": "1*YMAX", "LogIC50": "1*XATYMID",
                 "HillSlope": -1}


def _ref_xy():
    xs, ys = [], []
    for c, row in zip(REF_X_MOLAR, REF_Y):
        for v in row:
            xs.append(math.log10(c))
            ys.append(v)
    return xs, ys


# ------------------------------------------------------------ reference

class TestUserFourPL:
    def test_reproduces_builtin_4pl_on_reference_data(self):
        payload = {"analysis": "dose_response",
                   "data": {"x": REF_X_MOLAR,
                            "datasets": [{"name": "Drug A", "ys": REF_Y}]},
                   "options": {"model": "log_inhibitor_vs_response_4pl",
                               "x_is_log": False}}
        ref = api.analyze(payload)["datasets"][0]["fit"]
        payload["options"] = {
            "x_is_log": False,
            "user_equation": {"text": FOUR_PL, "rules": FOUR_PL_RULES,
                              "x_is_log": True,
                              "transforms": [{"name": "IC50",
                                              "expr": "10^LogIC50"}]}}
        res = api.analyze(payload)
        assert "error" not in res, res
        fit = res["datasets"][0]["fit"]
        for name in ("Top", "Bottom", "LogIC50", "HillSlope"):
            a, b = ref["params"][name], fit["params"][name]
            assert b["value"] == pytest.approx(a["value"], rel=1e-12, abs=1e-14)
            assert b["se"] == pytest.approx(a["se"], rel=1e-9)
            assert b["ci95"] == pytest.approx(a["ci95"], rel=1e-9)
        # the transform 10^LogIC50 is the built-in IC50 (transformed CI)
        assert fit["params"]["IC50"]["value"] == pytest.approx(
            ref["params"]["IC50"]["value"], rel=1e-12)
        assert fit["params"]["IC50"]["ci95"] == pytest.approx(
            ref["params"]["IC50"]["ci95"], rel=1e-9)
        assert fit["params"]["Span"]["se"] == pytest.approx(
            ref["params"]["Span"]["se"], rel=1e-9)
        for key in ("ss_res", "sy_x", "r_squared", "df"):
            assert fit["goodness"][key] == pytest.approx(
                ref["goodness"][key], rel=1e-12)
        assert len(fit["curve"]["x"]) == 200
        assert res["user_equation"]["parameters"] == [
            "Bottom", "Top", "LogIC50", "HillSlope"]

    def test_prism_pins_hold_for_user_equation(self):
        # The digit-exact Prism results (test_prism_parity) via the user path.
        xs = [math.log10(c) for c in PRISM_CONC for _ in range(3)]
        ys = [v for row in REF_Y for v in row]
        eq = ue.UserEquation(FOUR_PL, rules=FOUR_PL_RULES, x_is_log=True)
        fit = ue.fit_user_equation(xs, ys, eq)
        p = fit["params"]
        assert p["Bottom"]["value"] == pytest.approx(0.9801, abs=5e-5)
        assert p["Top"]["value"] == pytest.approx(99.86, abs=5e-3)
        assert p["LogIC50"]["value"] == pytest.approx(-6.983, abs=5e-4)
        assert p["HillSlope"]["value"] == pytest.approx(-1.103, abs=5e-4)
        assert fit["goodness"]["ss_res"] == pytest.approx(59.58, abs=5e-3)
        assert p["LogIC50"]["ci95"][0] == pytest.approx(-7.013, abs=5e-4)


# ------------------------------------------------------------ syntax

class TestSyntax:
    def test_intermediate_lines_comments_continuation_brackets(self):
        text = """; one phase decay written over several lines
Span = Y0 - Plateau      ; intermediate variable
Decay = exp(-K*X)
Y = Plateau + \\
    Span*[Decay]
"""
        eq = ue.UserEquation(text, rules={"Y0": "1*YATXMIN", "Plateau": "YMIN",
                                          "K": "1/XMAX"},
                             transforms=[{"name": "HalfLife",
                                          "expr": "ln(2)/K"},
                                         {"name": "Tau", "expr": "1/K"}])
        assert eq.params == ["Y0", "Plateau", "K"]
        assert eq.parsed.intermediates == ["Span", "Decay"]
        x = np.linspace(0, 10, 12)
        y = (100 - 20) * np.exp(-0.35 * x) + 20
        rng = np.random.default_rng(1)
        y = y + rng.normal(0, 1.5, x.size)
        fit = ue.fit_user_equation(x.tolist(), y.tolist(), eq)
        ref = fit_model(x.tolist(), y.tolist(), "one_phase_decay")
        for n in ("Y0", "Plateau", "K"):
            assert fit["params"][n]["value"] == pytest.approx(
                ref["params"][n]["value"], rel=1e-7)
        assert fit["params"]["HalfLife"]["value"] == pytest.approx(
            ref["params"]["HalfLife"]["value"], rel=1e-7)
        assert fit["params"]["HalfLife"]["ci95"] == pytest.approx(
            ref["params"]["HalfLife"]["ci95"], rel=1e-6)
        assert fit["params"]["Tau"]["ci95"] == pytest.approx(
            ref["params"]["Tau"]["ci95"], rel=1e-6)

    def test_if_and_conditionals(self):
        eq = ue.UserEquation(
            "Y1 = intercept1 + slope1*X\nYatX0 = slope1*X0 + intercept1\n"
            "Y2 = YatX0 + slope2*(X - X0)\nY = IF(X<X0, Y1, Y2)")
        p = {"intercept1": 1.0, "slope1": 2.0, "slope2": -1.0, "X0": 3.0}
        x = np.array([0.0, 2.0, 3.0, 5.0])
        assert eq.evaluate(x, p).tolist() == [1.0, 5.0, 7.0, 5.0]
        eq2 = ue.UserEquation("Y=(X<4)*A + (X>=4)*B")
        assert eq2.evaluate(np.array([1.0, 4.0]), {"A": 1.0, "B": 10.0}
                            ).tolist() == [1.0, 10.0]

    def test_case_insensitive_and_display_spelling(self):
        eq = ue.UserEquation("y = vMax*x/(KM + X) + 0*vmax")
        assert eq.params == ["vMax", "KM"]
        assert eq.evaluate(np.array([1.0]), {"vMax": 2.0, "KM": 1.0})[0] == 1.0

    def test_dataset_designators(self):
        eq = ue.UserEquation("<A>Y=1+0*X\n<~A:B>Y=2+0*X\n<B:J,3>Y=3+0*X\n"
                             "<D,F>Y=4+0*X")
        got = [float(eq.evaluate(np.array([0.0]), {}, i)[0])
               for i in range(11)]
        # A=0 B=1 C=2 D=3 E=4 F=5 G=6 H=7 I=8 J=9 K=10
        assert got == [1, 3, 2, 4, 3, 4, 2, 3, 2, 2, 2]
        assert eq.parsed.dataset_specific

    def test_dataset_constant_lines(self):
        eq = ue.UserEquation("<A>Bottom=4.5\n<B>Bottom=34.5\n"
                             "Y=Bottom + span*(1-exp(-1*K*X))")
        assert eq.params == ["span", "K"]
        x = np.array([0.0])
        assert eq.evaluate(x, {"span": 1, "K": 1}, 0)[0] == 4.5
        assert eq.evaluate(x, {"span": 1, "K": 1}, 1)[0] == 34.5

    def test_missing_y_for_a_data_set_is_an_error(self):
        eq = ue.UserEquation("<A>Y=1+0*X")
        with pytest.raises(ValueError, match="data set B"):
            eq.evaluate(np.array([0.0]), {}, 1)


# ------------------------------------------------------------ validation

def _err(text, **kw):
    res = ue.validate_equation(text, **kw)
    assert res["ok"] is False
    return res["errors"][0]


class TestValidation:
    def test_ok_description(self):
        res = ue.validate_equation(
            "KmObs=Km*(1+I/Ki)\nY=Vmax*X/(KmObs+X)",
            rules={"Vmax": "1*YMAX", "Km": "XATYMID", "Ki": 1},
            constraints={"I": "column constant", "Vmax": "shared",
                         "Km": "shared", "Ki": {"type": "range", "min": 0}})
        assert res["ok"] and res["errors"] == []
        assert res["parameters"] == ["Km", "I", "Ki", "Vmax"]
        assert res["intermediates"] == ["KmObs"]
        assert res["constraints"]["Ki"] == {"kind": "range", "lo": 0.0}

    def test_unknown_function_anchored(self):
        e = _err("A = 1\nY = A*foo(X)")
        assert (e["line"], e["column"]) == (2, 7)
        assert "unknown function 'FOO'" in e["message"]

    def test_syntax_error_anchored_after_continuation(self):
        e = _err("Y = Top + \\\n   (X * )")
        assert e["line"] == 2 and e["column"] == 9

    def test_implicit_and_differential_unsupported(self):
        e = _err("Y = NS*(X-Y) + Bmax*(X-Y)/(Kd + (X-Y))")
        assert "implicit" in e["message"] and e["column"] == 11
        e = _err("Y' = -K*Y")
        assert "differential" in e["message"]
        e = _err("dY/dX = -K*Y")
        assert "differential" in e["message"]

    def test_structure_errors(self):
        assert "no line defines Y" in _err("A = 2*X")["message"]
        assert "NAME = expression" in _err("Y + 2")["message"]
        e = _err("Y = beta*X")
        assert "function" in e["message"] and e["column"] == 5
        assert "cannot be assigned" in _err("X = 2\nY=X")["message"]
        assert "random" in _err("Y = gauss(0,1) + X")["message"]
        assert "text" in _err('Y = "a" + X')["message"]
        assert "<A>" in _err("<A*>Y=X")["message"]

    def test_rule_constraint_transform_errors(self):
        e = _err("Y=A*X", rules={"A": "2*YTOP"})
        assert e["where"] == "rules" and e["item"] == "A"
        e = _err("Y=A*X", rules={"B": 1})
        assert "not a parameter" in e["message"]
        e = _err("Y=KFast*X+KSlow", constraints={"KFast": "> KSlow"})
        assert e["where"] == "constraints" and "two parameters" in e["message"]
        e = _err("Y=A*X", transforms=[{"name": "T", "expr": "B*2"}])
        assert e["where"] == "transforms" and e["item"] == "T"
        e = _err("Y=A*X", transforms=[{"name": "T", "expr": "X*2"}])
        assert "interpolation" in e["message"]

    def test_warnings(self):
        res = ue.validate_equation("Y = AVeryLongParameterName + Mean")
        msgs = " ".join(w["message"] for w in res["warnings"])
        assert "13 characters" in msgs and "does not use X" in msgs
        assert "no initial-value rule" in msgs


# ------------------------------------------------------------ rules & constraints

class TestRulesAndConstraints:
    def test_rule_forms(self):
        x = [0, 1, 2, 3, 4]
        y = [10, 20, 40, 70, 90]
        eq = ue.UserEquation(
            "Y = a+b+c+d+e+f+g+h+0*X",
            rules={"a": "1*YMAX", "b": "0.5 * xmid", "c": "2/XMAX",
                   "d": "X at YMID", "e": {"value": 3, "of": "YMIN"},
                   "f": -1.5, "g": "SIGN", "h": "1*Slope at XMAX"})
        init = eq.initials(x, y)
        assert init == pytest.approx({"a": 90, "b": 1.0, "c": 0.5,
                                      "d": 2 + 1 / 3, "e": 30, "f": -1.5,
                                      "g": 1.0, "h": 20.0})

    def test_column_title_mean_rule(self):
        eq = ue.UserEquation("Y=Vmax*X/(Km*(1+I/Ki)+X)",
                             rules={"Ki": "COLUMNTITLEMEAN"},
                             column_titles=[0, 5, 10])
        assert eq.initials([1, 2], [1, 2])["Ki"] == pytest.approx(5.0)

    def test_default_constant_and_override(self):
        eq = ue.UserEquation(
            "Y=(Y0 - Plateau)*exp(-K*X) + Plateau",
            rules={"Y0": "YATXMIN", "K": "1/XMAX"},
            constraints={"Plateau": 0})
        x = np.linspace(0, 10, 11)
        y = 50 * np.exp(-0.4 * x)
        fit = ue.fit_user_equation(x.tolist(), y.tolist(), eq)
        assert fit["params"]["Plateau"]["constrained"] is True
        assert fit["params"]["K"]["value"] == pytest.approx(0.4, rel=1e-8)
        fit2 = ue.fit_user_equation(x.tolist(), (y + 5).tolist(), eq,
                                    constraints={"Plateau": 5})
        assert fit2["params"]["K"]["value"] == pytest.approx(0.4, rel=1e-8)

    def test_required_constant(self):
        eq = ue.UserEquation("Y=Et*kcat*X/(Km+X)",
                             rules={"kcat": 1, "Km": "XATYMID"},
                             constraints={"Et": {"type": "constant"}})
        x = [1.0, 2, 4, 8, 16]
        y = [100 * 13.5 * v / (5.9 + v) for v in x]
        with pytest.raises(ValueError, match="Et"):
            ue.fit_user_equation(x, y, eq)
        fit = ue.fit_user_equation(x, y, eq, constraints={"Et": 100})
        assert fit["params"]["kcat"]["value"] == pytest.approx(13.5, rel=1e-7)

    def test_range_constraint(self):
        # Unconstrained the best K is negative; "K > 0" holds it at the bound.
        x = np.linspace(0, 5, 11)
        y = 10 * np.exp(0.05 * x)
        eq = ue.UserEquation("Y=Y0*exp(-K*X)", rules={"Y0": "YATXMIN", "K": 0.5},
                             constraints={"K": ">0"})
        fit = ue.fit_user_equation(x.tolist(), y.tolist(), eq)
        assert fit["fitted_values"]["K"] >= 0
        assert fit["fitted_values"]["K"] < 1e-6
        eq2 = ue.UserEquation("Y=Y0*exp(-K*X)",
                              rules={"Y0": "YATXMIN", "K": 0.5},
                              constraints={"K": "between -1 and 1"})
        fit2 = ue.fit_user_equation(x.tolist(), y.tolist(), eq2)
        assert fit2["fitted_values"]["K"] == pytest.approx(-0.05, rel=1e-6)


# ------------------------------------------------------------ transforms

class TestTransforms:
    @pytest.fixture(scope="class")
    def fitted(self):
        xs, ys = _ref_xy()
        eq = ue.UserEquation(
            FOUR_PL, rules=FOUR_PL_RULES, x_is_log=True,
            transforms=[
                {"name": "SpanT", "expr": "Top - Bottom", "ci": "symmetrical"},
                {"name": "YatMinus7", "expr": "Y[-7]"},
                {"name": "AbsIC50", "expr": "10^X[50]"},
                {"name": "LogAbs", "expr": "X[50]"},
                {"name": "HalfMax", "expr": "Y[LogIC50]"},
                {"name": "Complex", "expr": "X[Bottom+(Top-Bottom)/2]"},
            ])
        return xs, ys, ue.fit_user_equation(xs, ys, eq)

    def test_multi_parameter_delta_method(self, fitted):
        _, _, fit = fitted
        p = fit["params"]
        assert p["SpanT"]["value"] == pytest.approx(p["Span"]["value"])
        assert p["SpanT"]["se"] == pytest.approx(p["Span"]["se"], rel=1e-6)
        assert p["SpanT"]["ci95"] == pytest.approx(p["Span"]["ci95"], rel=1e-6)

    def test_y_interpolation_is_the_confidence_band(self, fitted):
        _, _, fit = fitted
        band = interpolate.bands(fit, [-7.0])
        entry = fit["params"]["YatMinus7"]
        assert entry["value"] == pytest.approx(band["y"][0], rel=1e-12)
        assert entry["ci95"] == pytest.approx([band["lower"][0],
                                               band["upper"][0]], rel=1e-5)
        mid = (fit["params"]["Top"]["value"] + fit["params"]["Bottom"]["value"]) / 2
        assert fit["params"]["HalfMax"]["value"] == pytest.approx(mid)

    def test_x_interpolation_matches_absolute_ic50(self, fitted):
        xs, _, fit = fitted
        lo, hi = min(xs), max(xs)
        pad = (hi - lo) / 2
        ref = interpolate.absolute_ic50(fit, 50.0, lo - pad, hi + pad)
        e = fit["params"]["LogAbs"]
        assert e["value"] == pytest.approx(ref["x"], abs=1e-9)
        assert e["ci95"] == pytest.approx(ref["ci"], abs=1e-3)
        a = fit["params"]["AbsIC50"]
        assert a["value"] == pytest.approx(10 ** ref["x"], rel=1e-8)
        assert a["ci95"] == pytest.approx([10 ** v for v in e["ci95"]],
                                          rel=1e-8)

    def test_complex_x_interpolation_value_only(self, fitted):
        _, _, fit = fitted
        c = fit["params"]["Complex"]
        assert c["value"] == pytest.approx(fit["params"]["LogIC50"]["value"],
                                           abs=1e-8)
        assert c["ci95"] is None

    def test_profile_ci_rules(self):
        xs, ys = _ref_xy()
        eq = ue.UserEquation(FOUR_PL, rules=FOUR_PL_RULES, x_is_log=True,
                             transforms=[{"name": "IC50", "expr": "10^LogIC50",
                                          "ci": "symmetrical"},
                                         {"name": "S", "expr": "Top-Bottom"}])
        fit = ue.fit_user_equation(xs, ys, eq, ci_method="profile")
        lo, hi = fit["params"]["LogIC50"]["ci95"]
        # one parameter: the profile limits pushed through the transform
        assert fit["params"]["IC50"]["ci95"] == pytest.approx(
            [10 ** lo, 10 ** hi], rel=1e-12)
        assert fit["params"]["S"]["ci95"] is None  # Prism reports none
        assert fit["params"]["S"]["se"] is not None

    def test_symmetrical_single_parameter_asymptotic(self):
        xs, ys = _ref_xy()
        eq = ue.UserEquation(FOUR_PL, rules=FOUR_PL_RULES, x_is_log=True,
                             transforms=[{"name": "IC50", "expr": "10^LogIC50",
                                          "ci": "symmetrical"}])
        fit = ue.fit_user_equation(xs, ys, eq)
        e = fit["params"]["IC50"]
        t = stats.t.ppf(0.975, fit["goodness"]["df"])
        se = math.log(10) * e["value"] * fit["params"]["LogIC50"]["se"]
        assert e["se"] == pytest.approx(se, rel=1e-5)
        assert e["ci95"] == pytest.approx([e["value"] - t * e["se"],
                                           e["value"] + t * e["se"]])


# ------------------------------------------------------------ global fits

class TestGlobalUserEquations:
    def test_mixed_model_inhibition_with_column_constant(self):
        truth = {"Vmax": 100, "Km": 5, "Ki": 4, "Alpha": 3.0}
        x = np.geomspace(0.5, 100, 10)
        rng = np.random.default_rng(12)
        spec = MODELS["mixed_model_inhibition"]
        datasets = []
        for i in (0.0, 5.0, 10.0, 20.0):
            y = spec.func(x, dict(truth, I=i)) + rng.normal(0, 1.5, x.size)
            datasets.append({"name": str(i), "x": x.tolist(), "y": y.tolist(),
                             "constants": {"I": i}})
        ref = fit_global_model(datasets, "mixed_model_inhibition")
        eq = ue.UserEquation(
            "VmaxApp=Vmax/(1+I/(Alpha*Ki))\n"
            "KmApp=Km*(1+I/Ki)/(1+I/(Alpha*Ki))\n"
            "Y=VmaxApp*X/(KmApp + X)",
            rules={"Vmax": "1.1*YMAX", "Km": "XATYMID", "Ki": "COLUMNTITLEMEAN",
                   "Alpha": 1},
            constraints={"I": "column constant", "Vmax": "shared",
                         "Km": "shared", "Ki": "shared", "Alpha": "shared"},
            column_titles=[0, 5, 10, 20])
        res = fit_global_model(datasets, eq.register(0))
        for n in ("Vmax", "Km", "Ki", "Alpha"):
            a = ref["datasets"][0]["params"][n]
            b = res["datasets"][0]["params"][n]
            assert b["value"] == pytest.approx(a["value"], rel=1e-6)
            assert b["se"] == pytest.approx(a["se"], rel=1e-4)
            assert b["shared"] is True

    def test_total_and_nonspecific_lines(self):
        truth = {"Bmax": 1000, "Kd": 2.5, "NS": 30, "Background": 20}
        x = np.linspace(0.5, 20, 10)
        rng = np.random.default_rng(3)
        spec = MODELS["one_site_total_and_nonspecific"]
        datasets = []
        for i in (0, 1):
            y = spec.func(x, dict(truth, _dataset=i)) + rng.normal(0, 10, x.size)
            datasets.append({"name": "AB"[i], "x": x.tolist(),
                             "y": y.tolist()})
        ref = fit_global_model(datasets, "one_site_total_and_nonspecific")
        eq = ue.UserEquation(
            "specific=Bmax*X/(X+Kd)\nnonspecific=NS*X + Background\n"
            "<A>Y=specific+nonspecific\n<B>Y=nonspecific",
            rules={"Bmax": "1*YMAX", "Kd": "XATYMID", "NS": "1*SLOPEATXMAX",
                   "Background": "YATXMIN"},
            constraints={"NS": "shared", "Background": "shared"})
        res = fit_global_model(datasets, eq.register(0))
        got = res["datasets"][0]["fitted_values"]
        want = ref["datasets"][0]["fitted_values"]
        for n in truth:
            assert got[n] == pytest.approx(want[n], rel=1e-5)
        assert res["goodness"]["df"] == ref["goodness"]["df"]


# ------------------------------------------------------------ API

class TestAPI:
    def test_validate_equation_handler(self):
        res = api.analyze({"analysis": "validate_equation", "data": {},
                           "options": {"text": "Y = Top*X/(K + X",
                                       "rules": {}}})
        assert res["ok"] is False
        e = res["errors"][0]
        assert e["line"] == 1 and e["column"] == 17 and e["where"] == "equation"
        ok = api.analyze({"analysis": "validate_equation", "data": {},
                          "options": {"text": FOUR_PL,
                                      "rules": FOUR_PL_RULES}})
        assert ok["ok"] and ok["parameters"] == ["Bottom", "Top", "LogIC50",
                                                 "HillSlope"]

    def test_list_models_handler(self):
        res = api.analyze({"analysis": "list_models", "data": {}})
        ids = {m["id"]: m for m in res["models"]}
        assert len(ids) >= 120
        m = ids["log_inhibitor_vs_response_4pl"]
        assert m["parameters"] == ["Top", "Bottom", "LogIC50", "HillSlope"]
        assert m["has_log_x"] is True and "IC50" in m["derived"]
        assert m["family"] == "Dose-response - Inhibition"
        assert ids["log_inhibitor_vs_response_3pl"]["fixed_by_default"] == {
            "HillSlope": -1.0}
        c = ids["competitive_inhibition"]
        assert c["dataset_constants"] == ["I"] and c["global_only"]
        assert c["shared"] == ["Vmax", "Km", "Ki"]
        assert "I" not in c["constrainable"]
        assert ids["one_site_fit_ki"]["required_constants"] == ["HotNM",
                                                                 "HotKdNM"]
        assert ids["gaussian"]["derived"] == ["Area"]
        assert not any(k.startswith("user:") for k in ids)
        assert "Polynomial" in res["families"]

    def test_global_model_fit_handler_with_column_titles(self):
        truth = {"Vmax": 100, "Km": 5, "Ki": 4}
        x = [0.5, 1, 2, 4, 8, 16, 32, 64]
        spec = MODELS["competitive_inhibition"]
        datasets = []
        for i in (0, 5, 10):
            y = spec.func(np.array(x, float), dict(truth, I=float(i)))
            datasets.append({"name": f"{i} uM", "column_title": str(i),
                             "ys": [[float(v)] for v in y]})
        res = api.analyze({"analysis": "global_model_fit",
                           "data": {"x": x, "datasets": datasets},
                           "options": {"model": "competitive_inhibition"}})
        assert "error" not in res, res
        assert res["shared"] == ["Vmax", "Km", "Ki"]
        for d in res["datasets"]:
            assert d["fitted_values"]["Ki"] == pytest.approx(4, rel=1e-6)
            assert len(d["curve"]["y"]) == 200
        assert res["datasets"][2]["constants"] == {"I": 10.0}

    def test_global_model_fit_missing_column_constant(self):
        res = api.analyze({"analysis": "global_model_fit",
                           "data": {"x": [1, 2], "datasets": [
                               {"name": "A", "ys": [[1], [2]]}]},
                           "options": {"model": "competitive_inhibition"}})
        assert "column constant I" in res["error"]

    def test_dose_response_user_equation_per_dataset_lines(self):
        # <A> / <B> lines pick the data set by position: K = +1 for A and
        # -1 for B, so both data sets give Slope = 2.
        x = [1, 2, 3, 4, 5, 6]
        payload = {"analysis": "dose_response",
                   "data": {"x": x, "datasets": [
                       {"name": "A", "ys": [[2 * v + 1] for v in x]},
                       {"name": "B", "ys": [[-2 * v + 4] for v in x]}]},
                   "options": {"user_equation": {
                       "text": "<A>K = 1\n<B>K = -1\nY = K*Slope*X + Icpt",
                       "rules": {"Slope": 1, "Icpt": "YATXMIN"}}}}
        res = api.analyze(payload)
        assert "error" not in res, res
        a, b = (d["fit"]["params"] for d in res["datasets"])
        assert a["Slope"]["value"] == pytest.approx(2.0)
        assert b["Slope"]["value"] == pytest.approx(2.0)
        assert a["Icpt"]["value"] == pytest.approx(1.0)
        assert b["Icpt"]["value"] == pytest.approx(4.0)

    def test_dose_response_user_equation_with_column_constant(self):
        x = [0.5, 1, 2, 4, 8, 16, 32, 64]
        spec = MODELS["competitive_inhibition"]
        truth = {"Vmax": 100, "Km": 5, "Ki": 4}
        datasets = []
        for i in (5, 10):
            y = spec.func(np.array(x, float), dict(truth, I=float(i)))
            datasets.append({"name": f"I={i}", "column_title": i,
                             "ys": [[float(v)] for v in y]})
        payload = {"analysis": "dose_response",
                   "data": {"x": x, "datasets": datasets},
                   "options": {"constraints": {"Km": 5},
                               "user_equation": {
                                   "text": "KmObs=Km*(1+I/Ki)\n"
                                           "Y=Vmax*X/(KmObs+X)",
                                   "rules": {"Vmax": "YMAX", "Ki": 1},
                                   "constraints": {"I": "column constant"}}}}
        res = api.analyze(payload)
        assert "error" not in res, res
        for d in res["datasets"]:
            assert d["fit"]["params"]["Ki"]["value"] == pytest.approx(4, rel=1e-6)
            assert d["fit"]["params"]["I"]["constrained"] is True

    def test_shared_user_equation_must_use_global_fit(self):
        res = api.analyze({"analysis": "dose_response",
                           "data": {"x": [1, 2, 3], "datasets": [
                               {"name": "A", "ys": [[1], [2], [3]]}]},
                           "options": {"user_equation": {
                               "text": "Y=A*X", "constraints": {"A": "shared"}}}})
        assert "global_model_fit" in res["error"]

    def test_user_equation_error_is_reported(self):
        res = api.analyze({"analysis": "dose_response",
                           "data": {"x": [1, 2, 3], "datasets": [
                               {"name": "A", "ys": [[1], [2], [3]]}]},
                           "options": {"user_equation": {"text": "Y = A*"}}})
        assert "line 1" in res["error"]

    def test_new_builtin_model_through_dose_response(self):
        x = list(np.geomspace(0.1, 1000, 13))
        truth = {"Bottom": 5, "Top": 95, "EC50": 30, "HillSlope": 1.5}
        y = MODELS["agonist_vs_response_variable"].func(np.array(x), truth)
        res = api.analyze({"analysis": "dose_response",
                           "data": {"x": x, "datasets": [
                               {"name": "A", "ys": [[float(v)] for v in y]}]},
                           "options": {"model": "agonist_vs_response_variable",
                                       "bands": "confidence"}})
        fit = res["datasets"][0]["fit"]
        assert fit["params"]["EC50"]["value"] == pytest.approx(30, rel=1e-6)
        assert fit["params"]["LogEC50"]["value"] == pytest.approx(
            math.log10(30), rel=1e-6)
