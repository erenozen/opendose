"""Formula evaluator: the worked examples in the user guide's function
reference ("available_functions_transforms.htm") plus parser behaviour."""

import math

import numpy as np
import pytest

from opendose.api import analyze
from opendose.formulas import (FUNCTION_NAMES, FormulaError, apply_transform,
                               calculate_variables, evaluate, parse_program,
                               run_program, validate)

# (expression, value documented in the guide)
GUIDE_EXAMPLES = [
    ("ABS(-3.7)", 3.7), ("ABS(0)", 0), ("CEIL(2.1)", 3), ("CEIL(-2.5)", -2),
    ("FLOOR(2.9)", 2), ("FLOOR(-2.5)", -3), ("INT(3.5)", 3), ("INT(-2.3)", -2),
    ("ROUND(3.14159, 2)", 3.14), ("ROUND(2.5, 0)", 3),
    ("ROUND(1234.567, -1)", 1230), ("10 MOD 3", 1), ("10 MOD -3", -2),
    ("SGN(42)", 1), ("SGN(-17.3)", -1), ("SGN(0)", 0), ("SQR(5)", 25),
    ("SQR(-3)", 9), ("SQRT(25)", 5), ("MAX(5, 8, 12, 3, 9)", 12),
    ("MIN(-3, -7)", -7), ("SUM(2, 3, 5)", 10), ("SUM(1.5, -2.5, 3)", 2),
    ("FACT(5)", 120), ("FACT(0)", 1), ("FACT(3)", 6),
    ("SIN(0)", 0), ("SIN(RAD(90))", 1), ("COS(0)", 1), ("TAN(RAD(45))", 1),
    ("ARCSIN(1)", 1.5708), ("ARCCOS(0)", 1.5708), ("ARCTAN(1)", 0.7854),
    ("ARCTAN2(0, 1)", 0), ("ARCTAN2(1, 0)", 1.5708), ("ARCTAN2(1, 1)", 0.7854),
    ("SINH(1)", 1.1752), ("COSH(1)", 1.5431), ("TANH(1)", 0.7616),
    ("ARCSINH(1.1752)", 1), ("ARCCOSH(1.5431)", 1), ("ARCTANH(0.7616)", 1),
    ("RAD(180)", math.pi), ("DEG(3.14159)", 180),
    ("EXP(1)", 2.71828), ("LN(2.71828)", 1), ("LOG(100)", 2),
    ("LOG10(1000)", 3), ("LOG2(8)", 3), ("LOG2(1024)", 10),
    ("LOGIT(0.5)", 0), ("LOGIT(0.75)", 1.0986),
    ('NORMDIST(1.96, 0, 1, "left")', 0.975),
    ('NORMDIST(1.96, 0, 1, "two")', 0.050),
    ('NORMINV(0.5, 0, 1, "left")', 0), ('NORMINV(0.975, 0, 1, "left")', 1.96),
    ("NORMPDF(0, 0, 1)", 0.3989), ('ZDIST(1.96, "left")', 0.975),
    ('ZDIST(1.96, "two")', 0.050), ('ZINV(0.975, "left")', 1.96),
    ('ZINV(0.025, "right")', 1.96), ("ZPDF(0)", 0.3989), ("ZPDF(1)", 0.2420),
    ("TDIST(2.086, 20)", 0.025), ("TDIST(0, 10)", 0.5),
    ("TINV(0.05, 20)", 2.086), ("TINV(0.01, 10)", 3.169),
    ("TPDF(0, 10)", 0.3891), ("CHIDIST(3.841, 1)", 0.05),
    ("CHIDIST(5.991, 2)", 0.05), ("CHIINV(0.05, 1)", 3.841),
    ("CHIINV(0.05, 5)", 11.071), ("CHISQC(3.841, 1)", 0.95),
    ("CHISQC(0, 5)", 0), ("FDIST(4.0, 5, 10)", 0.0299),
    ("FDIST(1.0, 10, 10)", 0.5), ("FINV(0.05, 5, 10)", 3.326),
    ("FINV(0.01, 1, 20)", 8.096), ("BINOMIAL(3, 10, 0.5)", 0.9453),
    ("BINOMIAL(0, 5, 0.1)", 1.0), ("ERF(0)", 0), ("ERF(1)", 0.8427),
    ("ERFC(0)", 1), ("ERFC(1)", 0.1573), ("PROBIT(0.5)", 5.0),
    ("PROBIT(0.975)", 6.96), ("PROBIT(0.025)", 3.04),
    ("GAMMA(1)", 1), ("GAMMA(5)", 24), ("GAMMA(0.5)", 1.7725),
    ("GAMMALN(1)", 0), ("GAMMALN(5)", 3.1781), ("IGAMMA(1, 0)", 0),
    ("IGAMMA(1, 1)", 0.6321), ("IGAMMAC(1, 0)", 1), ("IGAMMAC(1, 1)", 0.3679),
    ("PSI(1)", -0.5772), ("PSI(2)", 0.4228), ("BETA(1, 1)", 1),
    ("BETA(2, 2)", 0.1667), ("IBETA(2, 2, 0.5)", 0.5),
    ("BESSELJ(0, 0)", 1), ("BESSELJ(0, 1)", 0.7652), ("BESSELY(0, 1)", 0.0883),
    ("BESSELY(1, 1)", -0.7812), ("BESSELI(0, 0)", 1), ("BESSELI(0, 1)", 1.2661),
    ("BESSELK(0, 1)", 0.4210), ("BESSELK(1, 1)", 0.6019),
    ("AND(5 > 3, 10 < 20)", 1), ("5 > 3 AND 10 < 20", 1),
    ("AND(5 > 3, 10 > 20)", 0), ("OR(5 > 3, 10 > 20)", 1),
    ("OR(5 < 3, 10 > 20)", 0), ("NOT(5 > 3)", 0), ("NOT(5 < 3)", 1),
    ("IS_DEFINED(5)", 1), ("IS_DEFINED(0)", 1), ("PERC(50)", 0.5),
    ("PERC(12.5)", 0.125), ("100 * PERC(5)", 5), ("EXP(0)", 1),
]


@pytest.mark.parametrize("expr,expected", GUIDE_EXAMPLES)
def test_guide_examples(expr, expected):
    got = float(evaluate(expr))
    assert got == pytest.approx(expected, abs=6e-4 * max(1.0, abs(expected)))


def test_documented_definitions_where_guide_example_is_off():
    # The guide defines FPDF as F.DIST(f, df1, df2, FALSE) and IBETA as
    # BETA.DIST(x, a, b, TRUE); those definitions give 0.4955 and 0.6471
    # (its example values 0.4595 / 0.9308 do not match its own definition).
    assert float(evaluate("FPDF(1.0, 5, 10)")) == pytest.approx(0.49548, abs=1e-4)
    assert float(evaluate("IBETA(5, 3, 0.7)")) == pytest.approx(0.64707, abs=1e-4)


def test_names_are_case_insensitive():
    assert float(evaluate("sin(0) + Sqrt(4) + LOG(10)")) == 3
    assert float(evaluate("x * k", {"X": 2}, {"K": 3})) == 6
    assert float(evaluate("1 and 0 Or 1")) == 1


class TestPrecedence:
    def test_arithmetic(self):
        assert float(evaluate("1 + 2 * 3 - 4 / 2")) == 5
        assert float(evaluate("2 * 3 ^ 2")) == 18
        assert float(evaluate("(1 + 2) * 3")) == 9

    def test_power_and_unary_minus(self):
        assert float(evaluate("-2^2")) == -4
        assert float(evaluate("2^-1")) == 0.5
        assert float(evaluate("2^3^2")) == 512
        assert float(evaluate("10^-9")) == pytest.approx(1e-9)

    def test_mod_binds_like_multiplication(self):
        assert float(evaluate("1 + 10 MOD 3")) == 2

    def test_comparison_below_arithmetic_logic_below_comparison(self):
        assert float(evaluate("1 + 1 = 2")) == 1
        assert float(evaluate("1 < 2 AND 3 < 2 OR 1")) == 1   # (T and F) or T
        assert float(evaluate("NOT 1 > 2 AND 1")) == 1         # (not F) and T
        assert float(evaluate("2 <> 3")) == 1
        assert float(evaluate("2 >= 2")) == 1


class TestBlanks:
    @pytest.mark.parametrize("expr", [
        "SQRT(-1)", "LN(0)", "LOG(-5)", "EXP(709.8)", "1/0", "GAMMA(-2)",
        "BESSELY(0, 0)", "BESSELK(0, -1)", "ARCSIN(2)", "ARCCOSH(0.5)",
        "ARCTANH(1)", "LOGIT(1)", "10 MOD 0", "FACT(2.5)", "FACT(-1)"])
    def test_invalid_input_is_blank(self, expr):
        assert math.isnan(float(evaluate(expr)))

    def test_blank_propagates(self):
        out = evaluate("Y * 2 + 1", {"Y": [1.0, None, 3.0]})
        assert out[0] == 3 and math.isnan(out[1]) and out[2] == 7

    def test_division_by_zero_blanks_via_if(self):
        # guide: Y = IF(Y<0, Y/0, Y) removes negative values
        out = evaluate("IF(Y<0, Y/0, Y)", {"Y": [-1.0, 0.0, 2.0]})
        assert math.isnan(out[0]) and list(out[1:]) == [0.0, 2.0]

    def test_is_defined(self):
        out = evaluate("IF(IS_DEFINED(X), X, 0)", {"X": [1.0, None]})
        assert list(out) == [1.0, 0.0]


class TestVectorAndAggregates:
    def test_if_rowwise(self):
        out = evaluate("IF(X < 0, 0, X)", {"X": [-2.0, 3.0]})
        assert list(out) == [0.0, 3.0]

    def test_multi_arg_max_is_rowwise(self):
        out = evaluate("MAX(A, B, C)", {"A": [1, 5], "B": [4, 2], "C": [3, 3]})
        assert list(out) == [4, 5]

    def test_single_arg_aggregates_broadcast(self):
        v = {"V": [10, 20, 30, 40, 50]}
        assert list(evaluate("MEAN(V)", v)) == [30] * 5
        assert list(evaluate("MAX(V)", v)) == [50] * 5
        assert list(evaluate("SUM(V)", v)) == [150] * 5
        assert list(evaluate("CENTER(V)", v)) == [-20, -10, 0, 10, 20]
        assert evaluate("STDEV(V)", v)[0] == pytest.approx(np.std(v["V"], ddof=1))
        assert evaluate("STDERR(V)", v)[0] == pytest.approx(
            np.std(v["V"], ddof=1) / math.sqrt(5))
        z = evaluate("STANDARDIZE(V)", v)
        assert np.mean(z) == pytest.approx(0) and np.std(z, ddof=1) == pytest.approx(1)

    def test_count_only_on_defined_rows(self):
        out = evaluate("COUNT(V)", {"V": [1.0, None, 3.0]})
        assert out[0] == 2 and math.isnan(out[1]) and out[2] == 2

    def test_row_reference(self):
        out = evaluate("Y - Y[1]", {"Y": [5.0, 7.0, 10.0]})
        assert list(out) == [0, 2, 5]
        assert math.isnan(evaluate("Y[9]", {"Y": [1.0]})[0])

    def test_constants_and_builtins(self):
        assert float(evaluate("pi")) == pytest.approx(math.pi)
        assert float(evaluate("e")) == pytest.approx(math.e)
        assert float(evaluate("E", {"E": 4})) == 4  # user names win

    def test_text_comparison_case_insensitive(self):
        out = evaluate('IF(Status = "PASS", 1, 0)',
                       {"Status": ["PASS", "Pass", "fail"]})
        assert list(out) == [1, 1, 0]
        assert evaluate('IF(5 > 3, "Yes", "No")')[()] == "Yes"

    def test_concatenate(self):
        assert evaluate('CONCATENATE("John", " ", "Smith")')[()] == "John Smith"
        assert evaluate('CONCATENATE("Value: ", 42)')[()] == "Value: 42"
        assert evaluate("CONCATENATE(3, 4)")[()] == "34"

    def test_random_functions_seeded(self):
        v = {"Y": np.zeros(20000)}
        a = evaluate("GAUSS(100, 15)", v, seed=3)
        b = evaluate("GAUSS(100, 15)", v, seed=3)
        assert np.array_equal(a, b)
        assert a.mean() == pytest.approx(100, abs=0.5)
        assert a.std() == pytest.approx(15, rel=0.03)
        u = evaluate("RND(1, 100)", v, seed=4)
        assert u.min() >= 1 and u.max() <= 100
        assert u.mean() == pytest.approx(50.5, abs=1)

    def test_tail_types(self):
        one = float(evaluate('NORMDIST(1.96, 0, 1, "one")'))
        right = float(evaluate('NORMDIST(1.96, 0, 1, "right")'))
        assert one == pytest.approx(right) == pytest.approx(0.025, abs=1e-4)
        assert float(evaluate('NORMDIST(-1.96, 0, 1, "one")')) == \
            pytest.approx(0.025, abs=1e-4)
        assert float(evaluate("ZDIST(0)")) == 0.5


class TestErrors:
    @pytest.mark.parametrize("expr,fragment,col", [
        ("1 +", "ends unexpectedly", 4),
        ("SIN(1, 2)", "SIN takes 1", 1),
        ("2 * FOO(1)", "unknown function 'FOO'", 5),
        ("(1 + 2", "expected ')'", 7),
        ("1 2", "unexpected number", 3),
        ("MOD(1, 2)", "infix", 1),
        ("1 # 2", "unexpected character", 3),
        ('NORMDIST(1, 0, 1, "middle")', "tail_type", 1),
        ("Q + 1", "unknown variable 'Q'", 1),
        ('"abc', "unclosed", 1),
    ])
    def test_messages_have_positions(self, expr, fragment, col):
        with pytest.raises(FormulaError) as ei:
            evaluate(expr)
        assert fragment in str(ei.value)
        assert ei.value.pos + 1 == col

    def test_validate_reports_names_and_errors(self):
        ok = validate("Y*K + LOG(X) + pi")
        assert ok["ok"] and ok["variables"] == ["K", "X", "Y"]
        assert ok["functions"] == ["LOG"]
        bad = validate("SIN(X")
        assert not bad["ok"] and bad["errors"][0]["column"] == 6
        prog = validate("A = Y*2\nY = A + B", known_names=["X", "Y"])
        assert prog["assigned"] == ["A", "Y"]
        assert prog["variables"] == ["B", "Y"]
        assert prog["errors"][0]["line"] == 2

    def test_program_error_line_and_column(self):
        with pytest.raises(FormulaError) as ei:
            parse_program("T = Y*2\nY = T + SQRT(", "Y")
        assert ei.value.line == 2 and ei.value.pos + 1 == 14

    def test_function_table_is_complete(self):
        documented = {
            "ABS", "CEIL", "FLOOR", "INT", "ROUND", "SGN", "SQR", "SQRT",
            "MAX", "MIN", "SUM", "FACT", "SIN", "COS", "TAN", "ARCSIN",
            "ARCCOS", "ARCTAN", "ARCTAN2", "SINH", "COSH", "TANH", "ARCSINH",
            "ARCCOSH", "ARCTANH", "RAD", "DEG", "EXP", "LN", "LOG", "LOG10",
            "LOG2", "LOGIT", "NORMDIST", "NORMINV", "NORMPDF", "ZDIST", "ZINV",
            "ZPDF", "TDIST", "TINV", "TPDF", "CHIDIST", "CHIINV", "CHISQC",
            "FDIST", "FINV", "FPDF", "BINOMIAL", "ERF", "ERFC", "PROBIT",
            "GAUSS", "RND", "MEAN", "STDEV", "STDERR", "COUNT", "CENTER",
            "STANDARDIZE", "GAMMA", "GAMMALN", "IGAMMA", "IGAMMAC", "PSI",
            "BETA", "IBETA", "BESSELJ", "BESSELY", "BESSELI", "BESSELK",
            "HYPGEOMETRICM", "HYPGEOMETRICU", "HYPGEOMETRICF", "IF", "AND",
            "OR", "NOT", "IS_DEFINED", "CONCATENATE", "PERC"}
        assert documented <= set(FUNCTION_NAMES)


class TestHypergeometric:
    def test_special_cases(self):
        # M(a, a, x) = e^x ; 2F1(1, 1; 2; x) = -ln(1-x)/x ; U(a, a+1, x) = x^-a
        assert float(evaluate("HYPGEOMETRICM(2, 2, 1)")) == pytest.approx(math.e)
        assert float(evaluate("HYPGEOMETRICF(1, 1, 2, 0.5)")) == \
            pytest.approx(-math.log(0.5) / 0.5)
        assert float(evaluate("HYPGEOMETRICU(2, 3, 2)")) == pytest.approx(0.25)


class TestTableTransforms:
    X = [1.0, 2.0, 3.0]
    DS = [{"name": "A", "ys": [[1.0, 2.0], [3.0, None], [5.0, 6.0]]},
          {"name": "B", "ys": [[10.0, 20.0], [30.0, 40.0], [50.0, 60.0]]}]

    def test_y_transform_each_replicate_with_k(self):
        out = apply_transform(self.X, self.DS, y_formula="Y*K + X",
                              constants={"K": 10})
        assert out["datasets"][0]["ys"] == [[11.0, 21.0], [32.0, None],
                                            [53.0, 63.0]]
        assert out["x"] == self.X and not out["staggered"]

    def test_k_per_dataset(self):
        out = apply_transform(self.X, self.DS, y_formula="Y = Y - K",
                              constants={"K": 1},
                              constants_by_dataset=[{}, {"K": 10}])
        assert out["datasets"][0]["ys"][0] == [0.0, 1.0]
        assert out["datasets"][1]["ys"][0] == [0.0, 10.0]

    def test_column_references_mean_and_replicate(self):
        mean = apply_transform(self.X, self.DS, y_formula="Y = Y - A")
        assert mean["datasets"][1]["ys"][0] == [8.5, 18.5]
        rep = apply_transform(self.X, self.DS, y_formula="Y = Y - A",
                              column_refs="replicate")
        assert rep["datasets"][1]["ys"][0] == [9.0, 18.0]
        assert rep["datasets"][1]["ys"][1] == [27.0, None]

    def test_dataset_designators_and_intermediates(self):
        prog = "T = Y * 2\n<B> Y = T\n<~B> Y = -Y"
        out = apply_transform(self.X, self.DS, y_formula=prog)
        assert out["datasets"][0]["ys"][0] == [-1.0, -2.0]
        assert out["datasets"][1]["ys"][0] == [20.0, 40.0]

    def test_x_only_transform_keeps_shape(self):
        out = apply_transform(self.X, self.DS, x_formula="X = X * 1000")
        assert out["x"] == [1000.0, 2000.0, 3000.0]
        assert out["datasets"][0]["ys"] == self.DS[0]["ys"]

    def test_x_transform_using_y_staggers(self):
        out = apply_transform(self.X, self.DS, x_formula="X = X + Y")
        # data set A block (Y = row means 1.5, 3, 5.5), then B block
        assert out["staggered"]
        assert out["x"] == [2.5, 5.0, 8.5, 16.0, 37.0, 58.0]
        a, b = out["datasets"]
        assert a["ys"][:3] == self.DS[0]["ys"] and a["ys"][3] == [None, None]
        assert b["ys"][0] == [None, None] and b["ys"][3] == [10.0, 20.0]

    def test_both_transforms_use_original_values(self):
        out = apply_transform(self.X, self.DS, x_formula="LOG(X)",
                              y_formula="Y/X")
        assert out["x"][0] == 0.0
        assert out["datasets"][0]["ys"][1] == [1.5, None]

    def test_must_assign_target(self):
        with pytest.raises(FormulaError):
            apply_transform(self.X, self.DS, y_formula="T = Y\nZ = T")

    def test_run_program_sequence(self):
        st = parse_program("A = X + 1\nB = A * 2")
        env = run_program(st, {"X": np.array([1.0, 2.0])})
        assert list(env["B"]) == [4.0, 6.0]

    def test_calculated_variables(self):
        out = calculate_variables(
            {"Height": [1.8, 1.6, None], "Weight": [81, 64, 70],
             "Body fat": [20, 25, 30]},
            [{"name": "BMI", "formula": "Weight / Height^2"},
             {"name": "z", "formula": "STANDARDIZE(BMI)"},
             {"name": "Fat", "formula": "{Body fat} / 100"},
             {"name": "Ok", "formula": 'IF(AND(IS_DEFINED(Height), '
                                       'IS_DEFINED(Weight)), "Complete", '
                                       '"Missing data")'}])["columns"]
        assert out["BMI"][:2] == pytest.approx([25.0, 25.0]) and out["BMI"][2] is None
        assert out["Fat"] == [0.2, 0.25, 0.3]
        assert out["Ok"] == ["Complete", "Complete", "Missing data"]


class TestApi:
    def test_transform_handler(self):
        res = analyze({"analysis": "formula_transform",
                       "data": {"x": [1, 10], "datasets": [
                           {"name": "A", "ys": [[2, 4], [6, None]]}]},
                       "options": {"y_formula": "Y = IF(Y > 3, Y, Y/0)",
                                   "x_formula": "LOG(X)"}})
        assert res["x"] == [0.0, 1.0]
        assert res["datasets"][0]["ys"] == [[None, 4.0], [6.0, None]]

    def test_validate_and_functions_modes(self):
        res = analyze({"analysis": "formula_transform", "data": {},
                       "options": {"mode": "validate", "formula": "Y = SIN(X"}})
        assert not res["ok"] and res["errors"][0]["line"] == 1
        res = analyze({"analysis": "formula_transform", "data": {},
                       "options": {"mode": "functions"}})
        assert "HYPGEOMETRICF" in res["functions"]

    def test_calculate_mode(self):
        res = analyze({"analysis": "formula_transform",
                       "data": {"columns": {"a": [1, 2]}},
                       "options": {"mode": "calculate",
                                   "formulas": [{"name": "b",
                                                 "formula": "a^2"}]}})
        assert res["columns"]["b"] == [1.0, 4.0]

    def test_error_is_reported_with_position(self):
        res = analyze({"analysis": "formula_transform",
                       "data": {"x": [1], "datasets": []},
                       "options": {"y_formula": "Y = FOO(X)"}})
        assert "unknown function 'FOO'" in res["error"]
        assert "column 5" in res["error"]
