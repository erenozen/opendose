"""User-defined equations for nonlinear regression.

Implements the GraphPad Prism curve-fitting guide chapter "Entering a
user-defined model into Prism" (reg_writing_models.htm) and its pages:

- "Overview of equation syntax" (reg_writinguserdefinedequations.htm):
  Y as a function of X; names up to 13 characters (longer names are
  accepted with a warning), not case-sensitive, no spaces (use _);
  * for multiplication, ^ for powers; [brackets] and {braces} are read as
  parentheses; a single = assigns; "\\" at the end of a line continues it;
  ";" starts a comment; IF(condition, if_true, if_false) with conditions
  joined by AND / OR / NOT and the comparisons = <> < > <= >=; a bare
  conditional evaluates to 1.0 or 0.0; a parameter may not be named like
  a function (e.g. beta).
- "Multiline models" (reg_multiline_models.htm): lines are evaluated top
  down; a name first seen on the left of = is an intermediate variable,
  a name first seen on the right is a parameter; the last line defines Y.
- "Fitting different models to different data sets"
  (reg_how_to_fit_different_data_sets.htm): line prefixes <C>, <~B>,
  <A:D>, <~A:D>, <A:J,3>, <~A:J,3> (plus comma lists <A,C>), where the
  letters count the data sets included in the analysis; and "Different
  constants for different data sets" (reg_different-parameter-values-
  for.htm): <A>Bottom=4.5.
- "Available functions for user-defined equations"
  (reg_available_functions.htm): evaluated by opendose.formulas (log() is
  base 10, ln() natural, sqr() squares, zdist(), ...); random-number,
  whole-column and text functions are rejected.
- "Entering rules for initial values" (reg_rulesforinitialvalues.htm):
  a number (initial value, to be fit) or number * / one of YMIN YMAX YMID
  XMIN XMAX XMID, X at YMID / YMAX / YMIN, Y at XMID / XMIN / XMAX,
  SIGN(YatXmax - YatXmin), slope at XMIN / XMID / XMAX, mean of the column
  titles or its log (see equations.DataStats for the computations).
- "Entering default constraints" (reg_entering_default_constraints.htm):
  constant equal to a value; "constant equal to" with no value (an
  experimental constant that must be entered at fit time); a range
  (greater than / less than / between); shared between data sets; data-
  set (column) constant. Constraints relating two parameters (Kfast >
  Kslow) are not supported and are reported as an error.
- "Choosing transforms of parameters to report"
  (reg_parameter_transforms_to_report.htm): any expression of the fitted
  parameters, with Y[x] and X[y] interpolations; CI "symmetrical",
  "asymmetrical" or "none" with the rules of that page's table (see
  nlfit.Transform).

Not supported, and reported as such by validate_equation: differential
equations (Y' = ..., reg_entering_a_differential_equati.htm) and implicit
equations (Y on the right-hand side before it is defined,
reg_implicit_equations.htm).

A compiled equation registers ordinary nlfit.ModelSpec entries (one per
data-set letter, since <A> lines differ by data set) under ids
"user:<hash>:<index>", so fitting, ROUT, bands, interpolation and global
fitting (equations.fit_global_model) all work unchanged. The Jacobian is
numerical, as for every model.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
from dataclasses import dataclass, field

import numpy as np

from . import formulas, nlfit
from .equations import DataStats, model_family  # noqa: F401  (re-export)
from .formulas import FUNCTIONS, FormulaError
from .nlfit import ModelSpec, Transform

MAX_NAME = 13

# "Available functions for user-defined equations" (reg_available_
# functions.htm). Only these may be called, and only these names are
# reserved (so Mean, Sum, ... remain usable as parameter names).
EQUATION_FUNCTIONS = frozenset("""
ABS AND ARCCOS ARCCOSH ARCSIN ARCSINH ARCTAN ARCTANH ARCTAN2 BESSELJ BESSELY
BESSELI BESSELK BETA BINOMIAL CEIL CHIDIST CHIINV CHISQC COS COSH DEG ERF
ERFC EXP FACT FDIST FINV FLOOR FPDF GAMMA GAMMALN HYPGEOMETRICM
HYPGEOMETRICU HYPGEOMETRICF IBETA IF IGAMMA IGAMMAC INT IS_DEFINED LN LOG
LOG2 LOG10 LOGIT MAX MIN NORMDIST NORMINV NORMPDF NOT OR PERC PROBIT PSI RAD
ROUND SGN SIN SINH SQR SQRT TAN TANH TDIST TINV TPDF ZDIST ZINV ZPDF
""".split())
_RESERVED = {"X", "Y"}
_FORBIDDEN_KINDS = {"rand": "random numbers", "agg": "whole-column statistics",
                    "text": "text"}


class EquationError(ValueError):
    """A problem in a user-defined equation, anchored to a 1-based line
    and column of the equation text (or to a rule / constraint /
    transform via `where`)."""

    def __init__(self, message, line=None, column=None, where="equation",
                 item=None):
        self.raw_message = message
        self.line = line
        self.column = column
        self.where = where
        self.item = item
        loc = []
        if item is not None:
            loc.append(f"{where} {item}")
        if line is not None:
            loc.append(f"line {line}")
        if column is not None:
            loc.append(f"column {column}")
        super().__init__(message + (f" ({', '.join(loc)})" if loc else ""))

    def as_dict(self):
        return {"message": self.raw_message, "line": self.line,
                "column": self.column, "where": self.where,
                "item": self.item, "text": str(self)}


# ------------------------------------------------------------ source text

@dataclass
class _Logical:
    text: str
    origin: list  # per character: (line, column) 1-based in the source


def _logical_lines(text: str) -> list[_Logical]:
    """Strip ';' comments, join '\\' continuations, keep a position map."""
    out, cur, cur_map = [], "", []
    for ln, raw in enumerate(str(text).splitlines(), start=1):
        body = raw.split(";", 1)[0]
        stripped = body.rstrip()
        cont = stripped.endswith("\\")
        if cont:
            stripped = stripped[:-1]
        cur += stripped
        cur_map += [(ln, c + 1) for c in range(len(stripped))]
        if cont:
            cur += " "
            cur_map.append((ln, len(stripped) + 1))
            continue
        if cur.strip():
            out.append(_Logical(cur, cur_map))
        cur, cur_map = "", []
    if cur.strip():
        out.append(_Logical(cur, cur_map))
    return out


def _where(lg: _Logical, pos: int):
    if not lg.origin:
        return None, None
    pos = max(pos, 0)
    if pos >= len(lg.origin):  # just past the end (e.g. "ends unexpectedly")
        ln, col = lg.origin[-1]
        return ln, col + (pos - len(lg.origin) + 1)
    return lg.origin[pos]


def letter_index(letters: str) -> int:
    """A -> 0, ..., Z -> 25, AA -> 26 (data-set letters)."""
    n = 0
    for ch in letters.upper():
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def index_letter(i: int) -> str:
    s, i = "", i + 1
    while i:
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return s


_DESIG_RE = re.compile(r"^\s*<([^>]*)>")
_ASSIGN_RE = re.compile(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*(')?\s*=(?!=)")


def _parse_designator(body: str, lg, offset):
    s = body.strip()
    negate = s.startswith("~")
    if negate:
        s = s[1:]
    items = [t.strip() for t in s.split(",")]
    chosen: list[int] = []
    last_range = None
    for tok in items:
        if re.fullmatch(r"[A-Za-z]+", tok):
            chosen.append(letter_index(tok))
            last_range = None
        elif re.fullmatch(r"[A-Za-z]+\s*:\s*[A-Za-z]+", tok):
            a, b = (letter_index(t.strip()) for t in tok.split(":"))
            if b < a:
                raise EquationError(f"data-set range <{tok}> runs backwards",
                                    *_where(lg, offset))
            last_range = (a, b, len(chosen))
            chosen.extend(range(a, b + 1))
        elif re.fullmatch(r"\d+", tok) and last_range:
            a, b, start = last_range
            step = int(tok)
            if step < 1:
                raise EquationError("data-set step must be 1 or more",
                                    *_where(lg, offset))
            chosen = chosen[:start] + list(range(a, b + 1, step))
            last_range = None
        else:
            raise EquationError(
                f"cannot read data-set prefix <{body}>; use forms like <A>, "
                "<~B>, <A:D>, <A:J,3>", *_where(lg, offset))
    return negate, frozenset(chosen)


# ------------------------------------------------------------ AST helpers

def _walk_names(node, out: list):
    """(NAME, pos) of every variable reference, left to right."""
    kind = node[0]
    if kind == "var":
        out.append((node[1], node[2]))
    elif kind == "index":
        out.append((node[1], node[3]))
        _walk_names(node[2], out)
    elif kind in ("neg",):
        _walk_names(node[1], out)
    elif kind == "not":
        _walk_names(node[1], out)
    elif kind == "bin":
        _walk_names(node[2], out)
        _walk_names(node[3], out)
    elif kind == "call":
        for a in node[2]:
            _walk_names(a, out)


def _check_ast(node, lg, offset):
    kind = node[0]
    if kind == "str":
        raise EquationError("text is not allowed in an equation",
                            *_where(lg, offset))
    if kind == "call":
        name, args, pos = node[1], node[2], node[3]
        fkind = FUNCTIONS[name][3]
        if fkind not in _FORBIDDEN_KINDS and name not in EQUATION_FUNCTIONS:
            raise EquationError(f"{name}() is not available in user-defined "
                                "equations", *_where(lg, offset + pos))
        if fkind in _FORBIDDEN_KINDS:
            raise EquationError(
                f"{name}() works on {_FORBIDDEN_KINDS[fkind]} and cannot be "
                "used in a fitted equation", *_where(lg, offset + pos))
        if name in ("MAX", "MIN", "SUM") and len(args) == 1:
            raise EquationError(f"{name}() needs at least two values in an "
                                "equation", *_where(lg, offset + pos))
        for a in args:
            _check_ast(a, lg, offset)
    elif kind == "bin":
        _check_ast(node[2], lg, offset)
        _check_ast(node[3], lg, offset)
    elif kind in ("neg", "not"):
        _check_ast(node[1], lg, offset)
    elif kind == "index":
        raise EquationError("NAME[...] is only allowed as X[...] or Y[...] "
                            "in transforms to report",
                            *_where(lg, offset + node[3]))


def _brackets_to_parens(s: str) -> str:
    return s.translate(str.maketrans("[]{}", "()()"))


def _parse_expr(expr_text: str, lg, offset, keep_index=False):
    text = expr_text if keep_index else _brackets_to_parens(expr_text)
    if keep_index:
        text = text.translate(str.maketrans("{}", "()"))
    try:
        node = formulas._Parser(formulas.tokenize(text)).parse()
    except FormulaError as exc:
        pos = offset + (exc.pos or 0)
        raise EquationError(exc.raw_message, *_where(lg, pos)) from None
    return node


# ------------------------------------------------------------ the model

@dataclass
class EqLine:
    target: str                 # upper case
    display: str
    expr: object
    line: int
    negate: bool = False
    datasets: frozenset | None = None

    def applies(self, i: int) -> bool:
        if self.datasets is None:
            return True
        hit = i in self.datasets
        return not hit if self.negate else hit


@dataclass
class ParsedEquation:
    text: str
    lines: list
    parameters: list            # display names, order of first appearance
    upper: dict                 # display -> upper
    intermediates: list
    uses_x: bool
    dataset_specific: bool
    functions: list
    warnings: list = field(default_factory=list)


def parse_equation(text: str) -> ParsedEquation:
    """Parse and check a user-defined equation (raises EquationError)."""
    if text is None or not str(text).strip():
        raise EquationError("the equation is empty", 1, 1)
    logical = _logical_lines(text)
    lines: list[EqLine] = []
    params: list[str] = []
    upper: dict[str, str] = {}
    defined: set[str] = set()
    intermediates: list[str] = []
    funcs: set[str] = set()
    warnings: list[dict] = []
    uses_x = False
    y_defined = False
    for lg in logical:
        s = lg.text
        offset = 0
        negate, sets = False, None
        m = _DESIG_RE.match(s)
        if m:
            negate, sets = _parse_designator(m.group(1), lg, m.start(1))
            offset = m.end()
        body = s[offset:]
        am = _ASSIGN_RE.match(body)
        if not am:
            if re.match(r"\s*d\s*Y\s*/\s*d\s*X", body, re.I):
                raise EquationError(
                    "differential equations are not supported (Prism writes "
                    "them as Y' = ...; OpenDose fits explicit equations only)",
                    *_where(lg, offset))
            raise EquationError("each line must look like NAME = expression",
                                *_where(lg, offset))
        name = am.group(1)
        name_u = name.upper()
        if am.group(2):
            raise EquationError(
                "differential equations (Y' = ...) are not supported; enter "
                "the integrated (explicit) form Y = f(X)",
                *_where(lg, offset + am.start(1)))
        if name_u == "X":
            raise EquationError("X is the independent variable and cannot be "
                                "assigned", *_where(lg, offset + am.start(1)))
        if name_u in EQUATION_FUNCTIONS or name_u in formulas._KEYWORDS:
            raise EquationError(f"'{name}' is a function name and cannot be "
                                "assigned", *_where(lg, offset + am.start(1)))
        expr_off = offset + am.end()
        node = _parse_expr(s[expr_off:], lg, expr_off)
        _check_ast(node, lg, expr_off)
        refs: list = []
        _walk_names(node, refs)
        fn_names: set = set()
        formulas._collect(node, set(), fn_names)
        funcs |= fn_names
        for ref, pos in refs:
            if ref == "X":
                uses_x = True
                continue
            if ref == "Y" and not y_defined:
                raise EquationError(
                    "Y appears on the right-hand side before it is defined: "
                    "implicit equations are not supported",
                    *_where(lg, expr_off + pos))
            if ref in defined:
                continue
            if ref == "PI" and ref not in upper.values():
                continue
            if ref in EQUATION_FUNCTIONS or ref in formulas._KEYWORDS:
                raise EquationError(
                    f"'{ref}' is the name of a function and cannot be a "
                    "parameter", *_where(lg, expr_off + pos))
            if ref not in upper.values():
                disp = _display_name(s[expr_off:], pos, ref)
                params.append(disp)
                upper[disp] = ref
                if len(disp) > MAX_NAME:
                    ln, col = _where(lg, expr_off + pos)
                    warnings.append({"message": f"'{disp}' is longer than "
                                     f"{MAX_NAME} characters (Prism's limit)",
                                     "line": ln, "column": col})
        if name_u == "Y":
            y_defined = True
        elif name_u not in defined and name_u not in upper.values():
            intermediates.append(name)
        defined.add(name_u)
        lines.append(EqLine(name_u, name, node, lg.origin[0][0] if lg.origin
                            else 1, negate, sets))
    if not y_defined:
        raise EquationError("no line defines Y (the last line should be "
                            "Y = ...)", lines[-1].line if lines else 1, 1)
    if not uses_x:
        warnings.append({"message": "the equation does not use X (Prism "
                         "requires X; write e.g. Y = Mean + 0*X)",
                         "line": None, "column": None})
    return ParsedEquation(str(text), lines, params, upper, intermediates,
                          uses_x, any(ln.datasets is not None for ln in lines),
                          sorted(funcs), warnings)


def _display_name(expr_text, pos, upper_name):
    """The name as the user spelled it (first appearance)."""
    t = _brackets_to_parens(expr_text)
    m = re.compile(r"[A-Za-z_][A-Za-z0-9_]*").match(t, pos)
    if m and m.group(0).upper() == upper_name:
        return m.group(0)
    return upper_name


# ------------------------------------------------------------ rules

RULE_KEYS = {
    "YMIN": "ymin", "YMAX": "ymax", "YMID": "ymid",
    "XMIN": "xmin", "XMAX": "xmax", "XMID": "xmid",
    "XATYMID": "x_at_ymid", "XATYMAX": "x_at_ymax", "XATYMIN": "x_at_ymin",
    "YATXMID": "y_at_xmid", "YATXMIN": "y_at_xmin", "YATXMAX": "y_at_xmax",
    "SIGN": "sign", "SIGNYATXMAXYATXMIN": "sign",
    "SLOPEATXMIN": "slope_at_xmin", "INITIALSLOPE": "slope_at_xmin",
    "SLOPEATXMID": "slope_at_xmid", "MIDDLESLOPE": "slope_at_xmid",
    "SLOPEATXMAX": "slope_at_xmax", "FINALSLOPE": "slope_at_xmax",
    "COLUMNTITLEMEAN": "coltitle", "MEANCOLUMNTITLE": "coltitle",
    "MEANOFCOLUMNTITLES": "coltitle",
    "LOGCOLUMNTITLEMEAN": "logcoltitle", "LOGMEANCOLUMNTITLE": "logcoltitle",
    "LOGMEANOFCOLUMNTITLES": "logcoltitle",
}
_NUM = r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?"
_RULE_RE = re.compile(rf"^\s*({_NUM})?\s*([*/])?\s*([A-Za-z_][A-Za-z0-9_ ()\-]*)?\s*$")


@dataclass
class Rule:
    value: float
    op: str | None = None        # "*" | "/" | None (plain initial value)
    of: str | None = None        # DataStats attribute

    def evaluate(self, s: DataStats, column_titles=None) -> float:
        if self.of is None:
            return self.value
        if self.of in ("coltitle", "logcoltitle"):
            vals = [float(v) for v in (column_titles or []) if v is not None]
            base = float(np.mean(vals)) if vals else 1.0
            if self.of == "logcoltitle":
                base = math.log10(base) if base > 0 else 0.0
        else:
            base = float(getattr(s, self.of))
        if self.op == "/":
            return self.value / base if base != 0 else math.nan
        return self.value * base

    def describe(self):
        if self.of is None:
            return f"{self.value:g}"
        inv = {v: k for k, v in RULE_KEYS.items()}
        return f"{self.value:g} {self.op} {inv.get(self.of, self.of)}"


def parse_rule(spec, param: str) -> Rule:
    if isinstance(spec, bool):
        raise EquationError("not a rule", where="rules", item=param)
    if isinstance(spec, (int, float)):
        return Rule(float(spec))
    if isinstance(spec, dict):
        val = float(spec.get("value", 1.0))
        of = spec.get("of") or spec.get("rule")
        op = spec.get("op", "*")
        if of is None:
            return Rule(val)
        key = re.sub(r"[\s_()\-]", "", str(of)).upper()
        if key not in RULE_KEYS:
            raise EquationError(f"unknown initial-value rule '{of}'",
                                where="rules", item=param)
        if op not in ("*", "/"):
            raise EquationError(f"rule operator must be * or /, not {op!r}",
                                where="rules", item=param)
        return Rule(val, op, RULE_KEYS[key])
    m = _RULE_RE.match(str(spec))
    if not m or (m.group(1) is None and m.group(3) is None):
        raise EquationError(f"cannot read initial-value rule {spec!r}; use a "
                            "number or e.g. '1*YMAX', '0.5*XMID', 'XATYMID'",
                            where="rules", item=param)
    num, op, of = m.group(1), m.group(2), m.group(3)
    if of is None:
        if op:
            raise EquationError(f"rule {spec!r} has an operator but nothing "
                                "after it", where="rules", item=param)
        return Rule(float(num))
    key = re.sub(r"[\s_()\-]", "", of).upper()
    if key not in RULE_KEYS:
        raise EquationError(f"unknown initial-value rule '{of.strip()}' (use "
                            "YMIN, YMAX, YMID, XMIN, XMAX, XMID, XATYMID, "
                            "XATYMAX, XATYMIN, YATXMID, YATXMIN, YATXMAX, SIGN, "
                            "SLOPEATXMIN/XMID/XMAX, COLUMNTITLEMEAN, "
                            "LOGCOLUMNTITLEMEAN)", where="rules", item=param)
    return Rule(float(num) if num is not None else 1.0, op or "*", RULE_KEYS[key])


# ------------------------------------------------------------ constraints

@dataclass
class Constraint:
    kind: str                    # constant | required | range | shared | column
    value: float | None = None
    lo: float | None = None
    hi: float | None = None


_CMP_RE = re.compile(rf"^\s*(>=|<=|>|<)\s*({_NUM})\s*$")
_BETWEEN_RE = re.compile(rf"^\s*between\s+({_NUM})\s+and\s+({_NUM})\s*$", re.I)
_REL_RE = re.compile(r"^\s*(>=|<=|>|<)\s*[A-Za-z_]")


def parse_constraint(spec, param: str) -> Constraint:
    if isinstance(spec, bool):
        raise EquationError("not a constraint", where="constraints", item=param)
    if isinstance(spec, (int, float)):
        return Constraint("constant", float(spec))
    if spec is None:
        return Constraint("required")
    if isinstance(spec, dict):
        kind = str(spec.get("type", spec.get("kind", ""))).lower().replace(" ", "_")
        if kind in ("constant", "constant_equal_to", "fixed"):
            v = spec.get("value")
            return Constraint("constant", float(v)) if v not in (None, "") \
                else Constraint("required")
        if kind in ("range", "between", "greater_than", "less_than", ">", "<"):
            lo = spec.get("min", spec.get("greater_than"))
            hi = spec.get("max", spec.get("less_than"))
            if lo is None and hi is None:
                raise EquationError("a range constraint needs min and/or max",
                                    where="constraints", item=param)
            if isinstance(lo, str) or isinstance(hi, str):
                raise EquationError(
                    "constraints relating two parameters (e.g. Kfast > Kslow)"
                    " are not supported", where="constraints", item=param)
            lo = None if lo is None else float(lo)
            hi = None if hi is None else float(hi)
            if lo is not None and hi is not None and lo >= hi:
                raise EquationError("range minimum must be below its maximum",
                                    where="constraints", item=param)
            return Constraint("range", lo=lo, hi=hi)
        if kind in ("shared", "share", "global"):
            return Constraint("shared")
        if kind in ("column", "column_constant", "data_set_constant",
                    "dataset_constant"):
            return Constraint("column")
        raise EquationError(f"unknown constraint type {spec.get('type')!r}",
                            where="constraints", item=param)
    s = str(spec).strip()
    low = s.lower().replace("-", " ").replace("_", " ")
    if low in ("shared", "share", "global"):
        return Constraint("shared")
    if low in ("column constant", "data set constant", "dataset constant",
               "column title"):
        return Constraint("column")
    if low in ("constant", "required"):
        return Constraint("required")
    m = _CMP_RE.match(s)
    if m:
        v = float(m.group(2))
        return (Constraint("range", lo=v) if m.group(1).startswith(">")
                else Constraint("range", hi=v))
    m = _BETWEEN_RE.match(s)
    if m:
        lo, hi = float(m.group(1)), float(m.group(2))
        if lo >= hi:
            raise EquationError("range minimum must be below its maximum",
                                where="constraints", item=param)
        return Constraint("range", lo=lo, hi=hi)
    if _REL_RE.match(s):
        raise EquationError("constraints relating two parameters (e.g. Kfast "
                            "> Kslow) are not supported",
                            where="constraints", item=param)
    try:
        return Constraint("constant", float(s))
    except ValueError:
        raise EquationError(f"cannot read constraint {spec!r}",
                            where="constraints", item=param) from None


# ------------------------------------------------------------ transforms

_INTERP_RE = re.compile(r"\b([XxYy])\s*\[")


@dataclass
class _TransformDef:
    name: str
    text: str
    ci: str
    node: object                 # AST with placeholders __I0, __I1 ...
    interps: list                # [(kind "X"|"Y", inner AST, inner params)]
    params: list                 # parameters outside interpolations
    kind: str


def _split_interps(text: str, name: str):
    """Replace X[...] / Y[...] by placeholders; return (text, interps)."""
    out, interps, i = "", [], 0
    while True:
        m = _INTERP_RE.search(text, i)
        if not m:
            out += text[i:]
            break
        depth, j = 0, m.end() - 1
        while j < len(text):
            if text[j] == "[":
                depth += 1
            elif text[j] == "]":
                depth -= 1
                if depth == 0:
                    break
            j += 1
        if depth != 0:
            raise EquationError("unclosed '[' in interpolation", None,
                                m.start() + 1, "transforms", name)
        inner = text[m.end():j]
        out += text[i:m.start()] + f"__I{len(interps)}"
        interps.append((m.group(1).upper(), inner, m.end()))
        i = j + 1
    return out, interps


def parse_transform(name: str, text: str, ci: str, params_upper: set,
                    display: dict) -> _TransformDef:
    if not name or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_ ()%\-./]*", name):
        raise EquationError(f"invalid transform name {name!r}",
                            where="transforms", item=name)
    ci = (ci or "asymmetrical").lower()
    if ci in ("do not calculate", "none", "no"):
        ci = "none"
    if ci not in ("asymmetrical", "symmetrical", "none"):
        raise EquationError(f"CI choice must be asymmetrical, symmetrical or "
                            f"none, not {ci!r}", where="transforms", item=name)
    if text is None or not str(text).strip():
        raise EquationError("the transform is empty", where="transforms",
                            item=name)
    body, raw_interps = _split_interps(str(text), name)

    def parse(t, off):
        try:
            return formulas._Parser(formulas.tokenize(
                _brackets_to_parens(t))).parse()
        except FormulaError as exc:
            raise EquationError(exc.raw_message, None,
                                off + (exc.pos or 0) + 1, "transforms",
                                name) from None

    def names_of(node, off):
        refs: list = []
        _walk_names(node, refs)
        out = []
        for ref, pos in refs:
            if ref.startswith("__I") or ref == "PI":
                continue
            if ref in ("X", "Y"):
                raise EquationError("X and Y can only appear as X[...] or "
                                    "Y[...] interpolations", None,
                                    off + pos + 1, "transforms", name)
            if ref not in params_upper:
                raise EquationError(f"'{ref}' is not a parameter of the "
                                    "equation", None, off + pos + 1,
                                    "transforms", name)
            if display[ref] not in out:
                out.append(display[ref])
        return out

    def check(node, off):
        try:
            _check_ast(node, _Logical(body, []), 0)
        except EquationError as exc:
            raise EquationError(exc.raw_message, None, None, "transforms",
                                name) from None

    node = parse(body, 0)
    check(node, 0)
    interps = []
    for kind, inner, off in raw_interps:
        inner_node = parse(inner, off)
        check(inner_node, off)
        interps.append((kind, inner_node, names_of(inner_node, off)))
    outer_params = names_of(node, 0)
    if not interps:
        kind = "params"
    elif any(k == "X" for k, _, _ in interps):
        simple = (len(interps) == 1 and not outer_params
                  and len(interps[0][2]) <= 1)
        kind = "x_interp" if simple else "x_interp_complex"
    else:
        kind = "y_interp"
    return _TransformDef(name, str(text), ci, node, interps, outer_params, kind)


# ------------------------------------------------------------ compiled

class UserEquation:
    """A compiled user-defined equation with its rules, default
    constraints and transforms to report."""

    def __init__(self, text: str, *, rules=None, constraints=None,
                 transforms=None, x_is_log: bool = False, name: str | None = None,
                 column_titles=None):
        self.text = str(text)
        self.parsed = parse_equation(text)
        self.name = name or "User-defined equation"
        self.x_is_log = bool(x_is_log)
        self.column_titles = list(column_titles or [])
        p = self.parsed
        self.params = list(p.parameters)
        self._by_upper = {p.upper[d]: d for d in self.params}
        self.warnings = list(p.warnings)

        def resolve(key, where):
            k = str(key).upper()
            if k not in self._by_upper:
                raise EquationError(f"'{key}' is not a parameter of the "
                                    "equation", where=where, item=str(key))
            return self._by_upper[k]

        self.rules: dict[str, Rule] = {}
        for key, spec in (rules or {}).items():
            pname = resolve(key, "rules")
            self.rules[pname] = parse_rule(spec, pname)
        self.constraints: dict[str, Constraint] = {}
        for key, spec in (constraints or {}).items():
            pname = resolve(key, "constraints")
            self.constraints[pname] = parse_constraint(spec, pname)
        for pname in self.params:
            c = self.constraints.get(pname)
            if pname not in self.rules and (c is None or c.kind in
                                            ("range", "shared")):
                self.warnings.append({
                    "message": f"no initial-value rule for {pname}; 1.0 is "
                               "used", "line": None, "column": None})
        if isinstance(transforms, dict):
            transforms = [{"name": k, "expr": v} for k, v in transforms.items()]
        self.transforms: list[_TransformDef] = []
        params_upper = set(self._by_upper)
        seen = set(self.params)
        for t in transforms or []:
            tname = str(t.get("name", "")).strip()
            if tname in seen:
                raise EquationError(f"transform name '{tname}' is already "
                                    "used", where="transforms", item=tname)
            seen.add(tname)
            self.transforms.append(parse_transform(
                tname, t.get("expr", t.get("definition")),
                t.get("ci", "asymmetrical"), params_upper, self._by_upper))
        payload = json.dumps({"t": self.text, "r": {k: r.describe() for k, r in
                                                    self.rules.items()},
                              "c": {k: vars(c) for k, c in
                                    self.constraints.items()},
                              "x": [vars(t)["text"] for t in self.transforms],
                              "tn": [t.name + t.ci for t in self.transforms],
                              "l": self.x_is_log, "n": self.name,
                              "ct": self.column_titles},
                             sort_keys=True, default=str)
        self.key = hashlib.sha1(payload.encode()).hexdigest()[:12]

    # -- metadata
    @property
    def fixed_defaults(self):
        return {k: c.value for k, c in self.constraints.items()
                if c.kind == "constant"}

    @property
    def required(self):
        return tuple(k for k, c in self.constraints.items()
                     if c.kind in ("required", "column"))

    @property
    def column_constants(self):
        return tuple(k for k, c in self.constraints.items() if c.kind == "column")

    @property
    def shared(self):
        return tuple(k for k, c in self.constraints.items() if c.kind == "shared")

    @property
    def bounds(self):
        return {k: (c.lo, c.hi) for k, c in self.constraints.items()
                if c.kind == "range"}

    # -- evaluation
    def evaluate(self, x, p, dataset: int = 0):
        x = np.asarray(x, dtype=float)
        env = {"X": x}
        for d, u in self.parsed.upper.items():
            # a parameter this data set's lines never feed into Y is absent
            # from global fits; it may still appear in an unused line
            env[u] = p[d] if d in p else math.nan
        for ln in self.parsed.lines:
            if ln.applies(dataset):
                env[ln.target] = formulas.evaluate(ln.expr, env)
        if "Y" not in env:
            raise ValueError("no line of the equation defines Y for data set "
                             f"{index_letter(dataset)}")
        y = np.asarray(env["Y"], dtype=float)
        return np.broadcast_to(y, x.shape).astype(float) if y.shape != x.shape \
            else y

    def params_used(self, dataset: int) -> set:
        """Parameters that the lines applying to this data set feed into
        Y (directly or through intermediate variables)."""
        deps: dict[str, set] = {}
        param_upper = set(self.parsed.upper.values())
        for ln in self.parsed.lines:
            if not ln.applies(dataset):
                continue
            refs: list = []
            _walk_names(ln.expr, refs)
            d: set = set()
            for ref, _ in refs:
                if ref in deps:
                    d |= deps[ref]
                elif ref in param_upper:
                    d.add(ref)
            deps[ln.target] = d
        return {self._by_upper[u] for u in deps.get("Y", set())}

    def initials(self, x, y, fixed=None):
        s = DataStats(x, y)
        out = {}
        for pname in self.params:
            r = self.rules.get(pname)
            v = r.evaluate(s, self.column_titles) if r else 1.0
            out[pname] = v if math.isfinite(v) else 1.0
        return out

    def _transform_objects(self, dataset: int):
        out = []
        for td in self.transforms:
            out.append(self._make_transform(td, dataset))
        return out

    def _make_transform(self, td: _TransformDef, dataset: int):
        upper = self.parsed.upper

        def env_of(p):
            return {upper[d]: p[d] for d in self.params if d in p}

        def curve(xs, p):
            return self.evaluate(np.asarray(xs, float), p, dataset)

        def x_range(xs):
            xs = np.asarray(xs, float)
            if not xs.size:
                return -1.0, 1.0
            lo, hi = float(np.min(xs)), float(np.max(xs))
            pad = (hi - lo) / 2.0
            return lo - pad, hi + pad

        def interp_values(p, xs):
            env = env_of(p)
            vals = {}
            for i, (kind, inner, _) in enumerate(td.interps):
                arg = float(formulas.evaluate(inner, env))
                if kind == "Y":
                    vals[f"__I{i}"] = float(curve(np.array([arg]), p)[0])
                else:
                    lo, hi = x_range(xs)
                    root = nlfit._first_root(
                        lambda v: float(curve(np.array([v]), p)[0]), arg, lo, hi)
                    vals[f"__I{i}"] = math.nan if root is None else root
            return vals

        def fn(p, xs):
            env = env_of(p)
            env.update(interp_values(p, xs))
            return float(formulas.evaluate(td.node, env))

        kw = {}
        if td.kind == "x_interp":
            inner = td.interps[0][1]
            kw["x_level"] = lambda p, xs: float(formulas.evaluate(inner,
                                                                  env_of(p)))
            node = td.node
            kw["outer"] = lambda v: float(formulas.evaluate(node, {"__I0": v}))
        params = tuple(td.params) + tuple(
            q for _, _, ps in td.interps for q in ps if q not in td.params)
        return Transform(td.name, fn, params, td.ci, td.kind, uses_x=True, **kw)

    # -- registration
    def model_id(self, dataset: int = 0) -> str:
        return f"user:{self.key}:{dataset}"

    def register(self, dataset: int = 0) -> str:
        mid = self.model_id(dataset)
        defaults = self.fixed_defaults
        nlfit.register(ModelSpec(
            name=mid, label=self.name, equation=self.text,
            params=list(self.params),
            func=lambda x, p, _d=dataset: self.evaluate(
                x, p, int(p.get("_dataset", _d))),
            initials=self.initials, initials_fixed=True,
            x_is_log=self.x_is_log, required_constants=self.required,
            family="User-defined", transforms=self._transform_objects(dataset)
            or None,
            data_constants={k: (lambda v: lambda x, y: v)(v)
                            for k, v in defaults.items()} or None,
            bounds=self.bounds or None,
            dataset_constants=self.column_constants, shared=self.shared,
            param_scope=({name: (lambda nm: lambda i: nm in self.params_used(i))(name)
                          for name in self.params}
                         if self.parsed.dataset_specific else None),
            user=True))
        return mid

    def describe(self) -> dict:
        p = self.parsed
        return {
            "name": self.name, "parameters": list(self.params),
            "intermediates": list(p.intermediates),
            "dataset_specific": p.dataset_specific, "uses_x": p.uses_x,
            "functions": list(p.functions), "x_is_log": self.x_is_log,
            "rules": {k: r.describe() for k, r in self.rules.items()},
            "constraints": {k: {kk: vv for kk, vv in vars(c).items()
                                if vv is not None}
                            for k, c in self.constraints.items()},
            "transforms": [{"name": t.name, "expr": t.text, "ci": t.ci,
                            "kind": t.kind} for t in self.transforms],
            "warnings": list(self.warnings),
        }


def compile_equation(text, **kw) -> UserEquation:
    return UserEquation(text, **kw)


def from_options(opts: dict) -> UserEquation:
    """Build from the API payload shape:
    {"text" (or "equation"), "rules", "constraints", "transforms",
     "x_is_log", "name", "column_titles"}."""
    if not isinstance(opts, dict):
        raise ValueError("user_equation must be an object with a 'text' field")
    return UserEquation(opts.get("text", opts.get("equation")),
                        rules=opts.get("rules"),
                        constraints=opts.get("constraints"),
                        transforms=opts.get("transforms"),
                        x_is_log=opts.get("x_is_log", False),
                        name=opts.get("name"),
                        column_titles=opts.get("column_titles"))


def validate_equation(text, *, rules=None, constraints=None, transforms=None,
                      x_is_log=False, name=None) -> dict:
    """Check everything without fitting. Returns {"ok", "errors",
    "warnings", ...description} with every error anchored (line/column in
    the equation, or the rule / constraint / transform it belongs to)."""
    try:
        eq = UserEquation(text, rules=rules, constraints=constraints,
                          transforms=transforms, x_is_log=x_is_log, name=name)
    except EquationError as exc:
        return {"ok": False, "errors": [exc.as_dict()], "warnings": []}
    except FormulaError as exc:
        return {"ok": False, "errors": [EquationError(
            exc.raw_message, exc.line, None if exc.pos is None else exc.pos + 1
        ).as_dict()], "warnings": []}
    out = {"ok": True, "errors": []}
    out.update(eq.describe())
    return out


def fit_user_equation(x, y, eq: UserEquation, *, dataset: int = 0,
                      constraints=None, **kw) -> dict:
    """Fit one data set (dataset = its position among the analysed data
    sets, for <A>-style lines). Extra keywords go to nlfit.fit_model."""
    mid = eq.register(dataset)
    return nlfit.fit_model(x, y, mid, constraints=constraints, **kw)
