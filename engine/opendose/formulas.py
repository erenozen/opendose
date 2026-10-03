"""Safe formula language for user-defined transforms and calculated
variables (no ``eval``: tokenizer -> precedence-climbing parser -> AST
evaluated with numpy, vectorised over whole columns).

GraphPad Prism user guide references (publicly documented behaviour):

- "Table of Available Functions for Custom Formulas, Transforms, and
  Calculated Variables" (user-guide/available_functions_transforms_table.htm)
  and the full reference "available_functions_transforms.htm":
  * function names, AND/OR/NOT and MOD are not case-sensitive;
  * operators + - * / ^, infix ``a MOD b`` (result takes the sign of the
    divisor, blank when b = 0), comparisons = <> < > <= >= that also work
    on text (case-insensitive);
  * precedence: ^, then * / (left to right), then + - , then comparisons,
    then NOT, AND, OR;
  * blanks propagate through arithmetic; invalid inputs (sqrt of a
    negative, log of zero, overflow beyond ~1.7e308, division by zero)
    give a blank instead of an error;
  * trig functions use radians; ARCTAN2 takes (y, x); Bessel functions
    take (n, x);
  * distribution functions with tail_type "left" | "right" | "one" |
    "two" (one = smaller tail, two = twice the smaller tail);
  * GAUSS/RND and the whole-variable aggregates MEAN, STDEV, STDERR,
    COUNT, CENTER, STANDARDIZE and single-argument MAX/MIN/SUM broadcast
    over the variable (transforms / in-table formulas only).
- "Transform" (user-guide/using_transform.htm), user-defined transforms:
  multi-line programs, IF(condition, if_true, if_false), conditions joined
  with AND/OR/NOT, ``Y = IF(Y<0, Y/0, Y)`` blanks a value (division by
  zero), and lines prefixed by a data-set designator such as ``<B>`` (only
  data set B) or ``<~A>`` (every data set except A).

Deliberate extensions beyond the guide (documented so they are not
mistaken for documented behaviour): constants ``PI`` and ``E``; ``FRAC(x)``
(fractional part, x - INT(x)); ``==`` / ``!=`` accepted as aliases of
``=`` / ``<>``; row references ``NAME[i]`` (1-based row i of a column,
broadcast to every row); ``{any name}`` to reference a column whose title
is not a plain identifier.  Unary minus binds looser than ``^`` (so
``-2^2 = -4``) and ``^`` is right-associative (``2^3^2 = 512``).

Not implemented: CONCATENATE results are text and are converted back to
numbers only where they parse as numbers (as the guide describes); there
is no date/time arithmetic.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass

import numpy as np
from scipy import special, stats


class FormulaError(ValueError):
    """Syntax or evaluation error with a 1-based line and column."""

    def __init__(self, message: str, pos: int | None = None,
                 line: int | None = None):
        self.raw_message = message
        self.pos = pos
        self.line = line
        super().__init__(self._format())

    def _format(self) -> str:
        where = []
        if self.line is not None:
            where.append(f"line {self.line}")
        if self.pos is not None:
            where.append(f"column {self.pos + 1}")
        return self.raw_message + (f" ({', '.join(where)})" if where else "")

    def with_line(self, line: int) -> "FormulaError":
        return FormulaError(self.raw_message, self.pos, line)

    def as_dict(self) -> dict:
        return {"message": self.raw_message,
                "line": self.line,
                "column": None if self.pos is None else self.pos + 1,
                "text": str(self)}


# ------------------------------------------------------------- tokenizer

@dataclass
class Token:
    kind: str      # NUM STR ID OP ( ) [ ] , EOF
    value: object
    pos: int


_NUM_RE = re.compile(r"(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?")
_ID_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")
_OPS = ("<=", ">=", "<>", "==", "!=", "+", "-", "*", "/", "^", "=",
        "<", ">")
_KEYWORDS = {"AND", "OR", "NOT", "MOD"}


def tokenize(text: str) -> list[Token]:
    tokens: list[Token] = []
    i, n = 0, len(text)
    while i < n:
        c = text[i]
        if c in " \t\r\n":
            i += 1
            continue
        m = _NUM_RE.match(text, i)
        if m and (c.isdigit() or c == "."):
            tokens.append(Token("NUM", float(m.group(0)), i))
            i = m.end()
            continue
        m = _ID_RE.match(text, i)
        if m:
            tokens.append(Token("ID", m.group(0), i))
            i = m.end()
            continue
        if c == "{":
            j = text.find("}", i)
            if j < 0:
                raise FormulaError("unclosed '{' in column name", i)
            name = text[i + 1:j].strip()
            if not name:
                raise FormulaError("empty column name '{}'", i)
            tokens.append(Token("ID", name, i))
            i = j + 1
            continue
        if c in "\"'":
            j = text.find(c, i + 1)
            if j < 0:
                raise FormulaError("unclosed text string", i)
            tokens.append(Token("STR", text[i + 1:j], i))
            i = j + 1
            continue
        if c in "()[],":
            tokens.append(Token(c, c, i))
            i += 1
            continue
        for op in _OPS:
            if text.startswith(op, i):
                tokens.append(Token("OP", op, i))
                i += len(op)
                break
        else:
            raise FormulaError(f"unexpected character '{c}'", i)
    tokens.append(Token("EOF", None, n))
    return tokens


# ---------------------------------------------------------------- parser
# AST nodes are tuples:
#   ("num", value) ("str", text) ("var", NAME, pos)
#   ("index", NAME, node, pos) ("neg", node) ("not", node, pos)
#   ("bin", op, left, right, pos) ("call", NAME, [args], pos)

_CMP = {"=": "=", "==": "=", "<>": "<>", "!=": "<>", "<": "<", ">": ">",
        "<=": "<=", ">=": ">="}


class _Parser:
    def __init__(self, tokens: list[Token]):
        self.toks = tokens
        self.i = 0

    @property
    def tok(self) -> Token:
        return self.toks[self.i]

    def _is_kw(self, word: str) -> bool:
        t = self.tok
        return t.kind == "ID" and str(t.value).upper() == word

    def advance(self) -> Token:
        t = self.toks[self.i]
        self.i += 1
        return t

    def expect(self, kind: str, what: str) -> Token:
        if self.tok.kind != kind:
            raise FormulaError(f"expected {what}, found {_describe(self.tok)}",
                               self.tok.pos)
        return self.advance()

    def parse(self):
        node = self.or_expr()
        if self.tok.kind != "EOF":
            raise FormulaError(f"unexpected {_describe(self.tok)}",
                               self.tok.pos)
        return node

    def or_expr(self):
        node = self.and_expr()
        while self._is_kw("OR"):
            pos = self.advance().pos
            node = ("bin", "OR", node, self.and_expr(), pos)
        return node

    def and_expr(self):
        node = self.not_expr()
        while self._is_kw("AND"):
            pos = self.advance().pos
            node = ("bin", "AND", node, self.not_expr(), pos)
        return node

    def not_expr(self):
        if self._is_kw("NOT"):
            pos = self.advance().pos
            return ("not", self.not_expr(), pos)
        return self.cmp_expr()

    def cmp_expr(self):
        node = self.add_expr()
        while self.tok.kind == "OP" and self.tok.value in _CMP:
            t = self.advance()
            node = ("bin", _CMP[t.value], node, self.add_expr(), t.pos)
        return node

    def add_expr(self):
        node = self.mul_expr()
        while self.tok.kind == "OP" and self.tok.value in ("+", "-"):
            t = self.advance()
            node = ("bin", t.value, node, self.mul_expr(), t.pos)
        return node

    def mul_expr(self):
        node = self.unary()
        while ((self.tok.kind == "OP" and self.tok.value in ("*", "/"))
               or self._is_kw("MOD")):
            t = self.advance()
            op = "MOD" if t.kind == "ID" else t.value
            node = ("bin", op, node, self.unary(), t.pos)
        return node

    def unary(self):
        if self.tok.kind == "OP" and self.tok.value in ("-", "+"):
            t = self.advance()
            operand = self.unary()
            return ("neg", operand) if t.value == "-" else operand
        return self.power()

    def power(self):
        base = self.primary()
        if self.tok.kind == "OP" and self.tok.value == "^":
            t = self.advance()
            return ("bin", "^", base, self.unary(), t.pos)
        return base

    def primary(self):
        t = self.tok
        if t.kind == "NUM":
            self.advance()
            return ("num", t.value)
        if t.kind == "STR":
            self.advance()
            return ("str", t.value)
        if t.kind == "(":
            self.advance()
            node = self.or_expr()
            self.expect(")", "')'")
            return node
        if t.kind == "ID":
            name = str(t.value)
            upper = name.upper()
            self.advance()
            if self.tok.kind == "(":
                return self.call(upper, t.pos)
            if upper in _KEYWORDS:
                raise FormulaError(f"'{name}' is an operator and needs an "
                                   "operand", t.pos)
            if self.tok.kind == "[":
                self.advance()
                idx = self.or_expr()
                self.expect("]", "']'")
                return ("index", upper, idx, t.pos)
            return ("var", upper, t.pos)
        if t.kind == "EOF":
            raise FormulaError("formula ends unexpectedly", t.pos)
        raise FormulaError(f"unexpected {_describe(t)}", t.pos)

    def call(self, name: str, pos: int):
        self.advance()  # "("
        args = []
        if self.tok.kind != ")":
            args.append(self.or_expr())
            while self.tok.kind == ",":
                self.advance()
                args.append(self.or_expr())
        self.expect(")", "')' or ','")
        if name == "MOD":
            raise FormulaError("MOD is written infix, e.g. 10 MOD 3", pos)
        spec = FUNCTIONS.get(name)
        if spec is None:
            raise FormulaError(f"unknown function '{name}'", pos)
        lo, hi = spec[0], spec[1]
        if len(args) < lo or (hi is not None and len(args) > hi):
            want = (f"{lo}" if lo == hi else
                    f"{lo} or more" if hi is None else f"{lo} to {hi}")
            raise FormulaError(f"{name} takes {want} argument(s), "
                               f"got {len(args)}", pos)
        return ("call", name, args, pos)


def _describe(t: Token) -> str:
    if t.kind == "EOF":
        return "end of formula"
    if t.kind == "NUM":
        return f"number {t.value:g}"
    if t.kind == "STR":
        return f'text "{t.value}"'
    return f"'{t.value}'"


def parse(expr: str):
    """Parse one expression into an AST (raises FormulaError)."""
    if expr is None or not str(expr).strip():
        raise FormulaError("formula is empty", 0)
    return _Parser(tokenize(str(expr))).parse()


# ----------------------------------------------------------- value helpers

def _is_text(v) -> bool:
    return isinstance(v, str) or (isinstance(v, np.ndarray)
                                  and v.dtype.kind in "OUS")


def _to_float_scalar(s) -> float:
    try:
        return float(str(s).strip())
    except (TypeError, ValueError):
        return math.nan


_to_float_vec = np.vectorize(_to_float_scalar, otypes=[float])


def _num(v) -> np.ndarray:
    """Numeric view of a value; text that is not a number becomes blank."""
    if _is_text(v):
        return _to_float_vec(np.asarray(v, dtype=object))
    return np.asarray(v, dtype=float)


def _clean(a) -> np.ndarray:
    """Overflow / division by zero -> blank (Prism returns blanks)."""
    a = np.asarray(a, dtype=float)
    if a.ndim == 0:
        return a if np.isfinite(a) else np.asarray(np.nan)
    return np.where(np.isfinite(a), a, np.nan)


def _fmt(v) -> str:
    if v is None:
        return ""
    if isinstance(v, str):
        return v
    v = float(v)
    if math.isnan(v):
        return ""
    if v == int(v) and abs(v) < 1e15:
        return str(int(v))
    return f"{v:.15g}"


def _tail_arg(v, fname: str) -> str:
    if not isinstance(v, str) and not (isinstance(v, np.ndarray)
                                       and v.ndim == 0 and _is_text(v)):
        raise FormulaError(f'{fname}: tail_type must be "left", "right", '
                           '"one" or "two"')
    s = str(v).strip().lower()
    if s not in ("left", "right", "one", "two"):
        raise FormulaError(f'{fname}: unknown tail_type "{v}" (use left, '
                           'right, one or two)')
    return s


def _tailed(cdf, sf, tail):
    if tail == "left":
        return cdf
    if tail == "right":
        return sf
    small = np.minimum(cdf, sf)
    return small if tail == "one" else np.minimum(1.0, 2.0 * small)


def _tailed_inv(p, ppf, isf, tail):
    """Quantile for a tail type: left -> P(X<=x)=p, right -> P(X>=x)=p,
    one -> the positive critical value of a one-tailed P, two -> of a
    two-tailed P (symmetric distributions)."""
    if tail == "left":
        return ppf(p)
    if tail == "right":
        return isf(p)
    if tail == "one":
        return isf(p)
    return isf(p / 2.0)


def _round_half_away(x, digits):
    f = 10.0 ** digits
    scaled = np.round(np.abs(x) * f, 8)  # absorb binary representation error
    return np.sign(x) * np.floor(scaled + 0.5) / f


def _fact(n):
    n = _num(n)
    ok = (n >= 0) & (n == np.floor(n))
    return np.where(ok, special.gamma(np.where(ok, n + 1, 1.0)), np.nan)


def _positive_x(fn):
    def wrapped(n, x):
        x = _num(x)
        return np.where(x > 0, fn(_num(n), np.where(x > 0, x, 1.0)), np.nan)
    return wrapped


# ------------------------------------------------------------ functions
# name -> (min_args, max_args or None, impl, kind)
# kind: "math" elementwise numeric | "raw" gets raw values (text allowed)
#       "agg" whole-variable aggregate | "rand" random | "special"

def _normdist(x, mean=0.0, sd=1.0, tail="left"):
    t = _tail_arg(tail, "NORMDIST")
    sd = _num(sd)
    z = (_num(x) - _num(mean)) / np.where(sd > 0, sd, np.nan)
    return _tailed(special.ndtr(z), special.ndtr(-z), t)


def _norminv(p, mean=0.0, sd=1.0, tail="left"):
    t = _tail_arg(tail, "NORMINV")
    p = _num(p)
    sd = _num(sd)
    z = _tailed_inv(p, special.ndtri, lambda q: -special.ndtri(q), t)
    return _num(mean) + np.where(sd > 0, sd, np.nan) * z


def _zdist(z, tail="left"):
    t = _tail_arg(tail, "ZDIST")
    z = _num(z)
    return _tailed(special.ndtr(z), special.ndtr(-z), t)


def _zinv(p, tail="left"):
    t = _tail_arg(tail, "ZINV")
    return _tailed_inv(_num(p), special.ndtri, lambda q: -special.ndtri(q), t)


def _tdist(t, df):
    t, df = _num(t), _num(df)
    return np.where(df > 0, stats.t.sf(t, np.where(df > 0, df, 1)), np.nan)


def _tinv(p, df):
    p, df = _num(p), _num(df)
    return np.where(df > 0, stats.t.isf(p / 2.0, np.where(df > 0, df, 1)),
                    np.nan)


def _tpdf(t, df):
    t, df = _num(t), _num(df)
    return np.where(df > 0, stats.t.pdf(t, np.where(df > 0, df, 1)), np.nan)


def _chi(fn):
    def impl(x, df):
        x, df = _num(x), _num(df)
        return np.where(df > 0, fn(x, np.where(df > 0, df, 1)), np.nan)
    return impl


def _f(fn):
    def impl(x, d1, d2):
        x, d1, d2 = _num(x), _num(d1), _num(d2)
        ok = (d1 > 0) & (d2 > 0)
        return np.where(ok, fn(x, np.where(ok, d1, 1), np.where(ok, d2, 1)),
                        np.nan)
    return impl


def _binomial(k, n, p):
    k, n, p = _num(k), _num(n), _num(p)
    ok = (n >= 0) & (p >= 0) & (p <= 1) & (n == np.floor(n))
    nn = np.where(ok, n, 1)
    pp = np.where(ok, p, 0.5)
    return np.where(ok, stats.binom.sf(np.ceil(k) - 1, nn, pp), np.nan)


def _logit(p):
    p = _num(p)
    ok = (p > 0) & (p < 1)
    pp = np.where(ok, p, 0.5)
    return np.where(ok, np.log(pp / (1 - pp)), np.nan)


def _probit(p):
    return 5.0 + special.ndtri(_num(p))


def _gamma(x):
    x = _num(x)
    bad = (x <= 0) & (x == np.floor(x))
    return np.where(bad, np.nan, special.gamma(np.where(bad, 0.5, x)))


def _mod(a, b):
    a, b = _num(a), _num(b)
    return np.where(b == 0, np.nan, np.mod(a, np.where(b == 0, 1.0, b)))


def _concat(*args):
    if all(np.ndim(a) == 0 for a in args):
        return "".join(_fmt(a if isinstance(a, str) else float(_num(a)))
                       for a in args)
    shape = np.broadcast_shapes(*[np.shape(a) for a in args])
    cols = [np.broadcast_to(np.asarray(a, dtype=object), shape) for a in args]
    out = np.empty(shape, dtype=object)
    for idx in np.ndindex(shape):
        out[idx] = "".join(_fmt(c[idx]) if isinstance(c[idx], str)
                           else _fmt(float(c[idx])) for c in cols)
    return out


def _is_defined(v):
    if _is_text(v):
        a = np.asarray(v, dtype=object)
        return np.vectorize(lambda s: 0.0 if s is None else 1.0,
                            otypes=[float])(a)
    return np.where(np.isnan(_num(v)), 0.0, 1.0)


def _nary(fn):
    def impl(*args):
        out = _num(args[0])
        for a in args[1:]:
            out = fn(out, _num(a))
        return out
    return impl


def _logic_and(*args):
    vals = [_num(a) for a in args]
    out = np.asarray(1.0)
    nan = np.asarray(False)
    for v in vals:
        nan = nan | np.isnan(v)
        out = out * np.where(np.isnan(v), 1.0, (v != 0).astype(float))
    return np.where(nan, np.nan, out)


def _logic_or(*args):
    vals = [_num(a) for a in args]
    out = np.asarray(0.0)
    nan = np.asarray(False)
    for v in vals:
        nan = nan | np.isnan(v)
        out = np.maximum(out, np.where(np.isnan(v), 0.0,
                                       (v != 0).astype(float)))
    return np.where(nan, np.nan, out)


def _logic_not(v):
    v = _num(v)
    return np.where(np.isnan(v), np.nan, (v == 0).astype(float))


def _safe(fn, domain=None):
    """Elementwise with an optional domain mask (outside -> blank)."""
    def impl(*args):
        vals = [_num(a) for a in args]
        if domain is None:
            return fn(*vals)
        ok = domain(*vals)
        return np.where(ok, fn(*vals), np.nan)
    return impl


FUNCTIONS: dict[str, tuple] = {
    # arithmetic & rounding
    "ABS": (1, 1, _safe(np.abs), "math"),
    "CEIL": (1, 1, _safe(np.ceil), "math"),
    "FLOOR": (1, 1, _safe(np.floor), "math"),
    "INT": (1, 1, _safe(np.trunc), "math"),
    "FRAC": (1, 1, _safe(lambda x: x - np.trunc(x)), "math"),
    "ROUND": (1, 2, lambda x, d=0.0: _round_half_away(_num(x),
                                                      np.trunc(_num(d))),
              "raw"),
    "SGN": (1, 1, _safe(np.sign), "math"),
    "SQR": (1, 1, _safe(lambda x: x * x), "math"),
    "SQRT": (1, 1, _safe(np.sqrt, lambda x: x >= 0), "math"),
    "MAX": (1, None, _nary(np.maximum), "math"),
    "MIN": (1, None, _nary(np.minimum), "math"),
    "SUM": (1, None, _nary(np.add), "math"),
    "FACT": (1, 1, _fact, "raw"),
    # trigonometric (radians)
    "SIN": (1, 1, _safe(np.sin), "math"),
    "COS": (1, 1, _safe(np.cos), "math"),
    "TAN": (1, 1, _safe(np.tan), "math"),
    "ARCSIN": (1, 1, _safe(np.arcsin, lambda x: np.abs(x) <= 1), "math"),
    "ARCCOS": (1, 1, _safe(np.arccos, lambda x: np.abs(x) <= 1), "math"),
    "ARCTAN": (1, 1, _safe(np.arctan), "math"),
    "ARCTAN2": (2, 2, _safe(np.arctan2), "math"),
    "SINH": (1, 1, _safe(np.sinh), "math"),
    "COSH": (1, 1, _safe(np.cosh), "math"),
    "TANH": (1, 1, _safe(np.tanh), "math"),
    "ARCSINH": (1, 1, _safe(np.arcsinh), "math"),
    "ARCCOSH": (1, 1, _safe(np.arccosh, lambda x: x >= 1), "math"),
    "ARCTANH": (1, 1, _safe(np.arctanh, lambda x: np.abs(x) < 1), "math"),
    "RAD": (1, 1, _safe(np.radians), "math"),
    "DEG": (1, 1, _safe(np.degrees), "math"),
    # exponential & logarithmic
    "EXP": (1, 1, _safe(np.exp), "math"),
    "LN": (1, 1, _safe(np.log, lambda x: x > 0), "math"),
    "LOG": (1, 1, _safe(np.log10, lambda x: x > 0), "math"),
    "LOG10": (1, 1, _safe(np.log10, lambda x: x > 0), "math"),
    "LOG2": (1, 1, _safe(np.log2, lambda x: x > 0), "math"),
    "LOGIT": (1, 1, _logit, "raw"),
    # distributions
    "NORMDIST": (1, 4, _normdist, "raw"),
    "NORMINV": (1, 4, _norminv, "raw"),
    "NORMPDF": (1, 3, lambda x, m=0.0, s=1.0: np.where(
        _num(s) > 0, stats.norm.pdf(_num(x), _num(m),
                                    np.where(_num(s) > 0, _num(s), 1.0)),
        np.nan), "raw"),
    "ZDIST": (1, 2, _zdist, "raw"),
    "ZINV": (1, 2, _zinv, "raw"),
    "ZPDF": (1, 1, _safe(stats.norm.pdf), "math"),
    "TDIST": (2, 2, _tdist, "raw"),
    "TINV": (2, 2, _tinv, "raw"),
    "TPDF": (2, 2, _tpdf, "raw"),
    "CHIDIST": (2, 2, _chi(stats.chi2.sf), "raw"),
    "CHIINV": (2, 2, _chi(stats.chi2.isf), "raw"),
    "CHISQC": (2, 2, _chi(stats.chi2.cdf), "raw"),
    "FDIST": (3, 3, _f(stats.f.sf), "raw"),
    "FINV": (3, 3, _f(stats.f.isf), "raw"),
    "FPDF": (3, 3, _f(stats.f.pdf), "raw"),
    "BINOMIAL": (3, 3, _binomial, "raw"),
    "ERF": (1, 1, _safe(special.erf), "math"),
    "ERFC": (1, 1, _safe(special.erfc), "math"),
    "PROBIT": (1, 1, _probit, "raw"),
    # random numbers (transforms / in-table formulas only)
    "GAUSS": (2, 2, None, "rand"),
    "RND": (2, 2, None, "rand"),
    # whole-variable statistics (broadcast to every row)
    "MEAN": (1, 1, None, "agg"),
    "STDEV": (1, 1, None, "agg"),
    "STDERR": (1, 1, None, "agg"),
    "COUNT": (1, 1, None, "agg"),
    "CENTER": (1, 1, None, "agg"),
    "STANDARDIZE": (1, 1, None, "agg"),
    # gamma / beta / bessel / hypergeometric
    "GAMMA": (1, 1, _gamma, "raw"),
    "GAMMALN": (1, 1, _safe(special.gammaln), "math"),
    "IGAMMA": (2, 2, _safe(special.gammainc,
                           lambda a, x: (a > 0) & (x >= 0)), "math"),
    "IGAMMAC": (2, 2, _safe(special.gammaincc,
                            lambda a, x: (a > 0) & (x >= 0)), "math"),
    "PSI": (1, 1, _safe(special.digamma), "math"),
    "BETA": (2, 2, _safe(special.beta), "math"),
    "IBETA": (3, 3, _safe(special.betainc,
                          lambda a, b, x: (x >= 0) & (x <= 1)), "math"),
    "BESSELJ": (2, 2, _safe(special.jv), "math"),
    "BESSELY": (2, 2, _positive_x(special.yv), "raw"),
    "BESSELI": (2, 2, _safe(special.iv), "math"),
    "BESSELK": (2, 2, _positive_x(special.kv), "raw"),
    "HYPGEOMETRICM": (3, 3, _safe(special.hyp1f1), "math"),
    "HYPGEOMETRICU": (3, 3, _safe(special.hyperu), "math"),
    "HYPGEOMETRICF": (4, 4, _safe(special.hyp2f1,
                                  lambda a, b, c, x: np.abs(x) < 1), "math"),
    # logic
    "IF": (3, 3, None, "special"),
    "AND": (1, None, _logic_and, "raw"),
    "OR": (1, None, _logic_or, "raw"),
    "NOT": (1, 1, _logic_not, "raw"),
    "IS_DEFINED": (1, 1, _is_defined, "raw"),
    # text / utility
    "CONCATENATE": (1, None, _concat, "text"),
    "PERC": (1, 1, _safe(lambda x: x / 100.0), "math"),
}

FUNCTION_NAMES = sorted(FUNCTIONS)
BUILTIN_CONSTANTS = {"PI": math.pi, "E": math.e}


# ------------------------------------------------------------ evaluator

class _Context:
    def __init__(self, variables, constants, rng):
        self.vars: dict[str, object] = {}
        for src in (constants or {}), (variables or {}):
            for k, v in src.items():
                self.vars[str(k).strip().upper()] = _as_value(v)
        shapes = [np.shape(v) for v in self.vars.values()
                  if not isinstance(v, str)]
        try:
            self.shape = np.broadcast_shapes(*shapes) if shapes else ()
        except ValueError as exc:
            raise FormulaError(f"variables have incompatible shapes: {exc}")
        self._rng = rng

    @property
    def rng(self):
        if self._rng is None:
            self._rng = np.random.default_rng()
        return self._rng

    def lookup(self, name: str, pos: int):
        if name in self.vars:
            return self.vars[name]
        if name in BUILTIN_CONSTANTS:
            return np.asarray(BUILTIN_CONSTANTS[name])
        raise FormulaError(f"unknown variable '{name}'", pos)


def _as_value(v):
    if isinstance(v, str):
        return v
    if isinstance(v, np.ndarray) and v.dtype.kind in "OUS":
        return v
    if isinstance(v, (list, tuple)):
        if any(isinstance(e, str) for e in _flat(v)):
            return np.asarray(v, dtype=object)
        return np.asarray(_none_to_nan(v), dtype=float)
    if v is None:
        return np.asarray(np.nan)
    return np.asarray(v, dtype=float)


def _flat(v):
    for e in v:
        if isinstance(e, (list, tuple)):
            yield from _flat(e)
        else:
            yield e


def _none_to_nan(v):
    if isinstance(v, (list, tuple)):
        return [_none_to_nan(e) for e in v]
    return np.nan if v is None else v


def _compare(op, a, b):
    if _is_text(a) or _is_text(b):
        fa = np.vectorize(lambda s: _fmt(s).casefold() if not isinstance(s, str)
                          else s.casefold(), otypes=[object])
        sa, sb = fa(np.asarray(a, dtype=object)), fa(np.asarray(b, dtype=object))
        res = {"=": np.equal, "<>": np.not_equal, "<": np.less,
               ">": np.greater, "<=": np.less_equal,
               ">=": np.greater_equal}[op](sa, sb)
        return np.asarray(res, dtype=float)
    a, b = _num(a), _num(b)
    res = {"=": a == b, "<>": a != b, "<": a < b, ">": a > b,
           "<=": a <= b, ">=": a >= b}[op].astype(float)
    return np.where(np.isnan(a) | np.isnan(b), np.nan, res)


def _aggregate(name, v):
    a = _num(v)
    flat = a[~np.isnan(a)] if a.ndim else (a[None] if not np.isnan(a)
                                           else np.array([]))
    n = flat.size
    mean = float(flat.mean()) if n else math.nan
    sd = float(flat.std(ddof=1)) if n > 1 else math.nan
    if name == "MEAN":
        return np.full_like(a, mean)
    if name == "STDEV":
        return np.full_like(a, sd)
    if name == "STDERR":
        return np.full_like(a, sd / math.sqrt(n) if n > 1 else math.nan)
    if name == "COUNT":
        return np.where(np.isnan(a), np.nan, float(n))
    if name == "CENTER":
        return a - mean
    if name == "STANDARDIZE":
        return (a - mean) / sd
    if name in ("MAX", "MIN", "SUM"):
        if not n:
            return np.full_like(a, math.nan)
        val = {"MAX": flat.max, "MIN": flat.min, "SUM": flat.sum}[name]()
        return np.full_like(a, float(val))
    raise AssertionError(name)


def _eval(node, ctx: _Context):
    kind = node[0]
    if kind == "num":
        return np.asarray(node[1])
    if kind == "str":
        return node[1]
    if kind == "var":
        return ctx.lookup(node[1], node[2])
    if kind == "index":
        arr = ctx.lookup(node[1], node[3])
        if np.ndim(arr) == 0:
            raise FormulaError(f"'{node[1]}' is a single value, not a column "
                               "with rows", node[3])
        idx = _num(_eval(node[2], ctx))
        if np.ndim(idx) != 0:
            raise FormulaError("row number in [...] must be a single value",
                               node[3])
        i = float(idx)
        if math.isnan(i) or i != int(i):
            raise FormulaError("row number in [...] must be a whole number",
                               node[3])
        i = int(i)
        if i < 1 or i > np.shape(arr)[0]:
            return np.asarray(np.nan)
        return np.asarray(arr)[i - 1]
    if kind == "neg":
        return _clean(-_num(_eval(node[1], ctx)))
    if kind == "not":
        return _logic_not(_eval(node[1], ctx))
    if kind == "bin":
        op, left, right, pos = node[1], node[2], node[3], node[4]
        a, b = _eval(left, ctx), _eval(right, ctx)
        if op in ("=", "<>", "<", ">", "<=", ">="):
            return _compare(op, a, b)
        if op == "AND":
            return _logic_and(a, b)
        if op == "OR":
            return _logic_or(a, b)
        a, b = _num(a), _num(b)
        if op == "+":
            return _clean(a + b)
        if op == "-":
            return _clean(a - b)
        if op == "*":
            return _clean(a * b)
        if op == "/":
            return _clean(a / b)
        if op == "^":
            return _clean(np.power(a, b))
        if op == "MOD":
            return _clean(_mod(a, b))
        raise FormulaError(f"unknown operator {op}", pos)
    if kind == "call":
        return _call(node, ctx)
    raise AssertionError(kind)


def _call(node, ctx: _Context):
    _, name, arg_nodes, pos = node
    lo, hi, impl, fkind = FUNCTIONS[name]
    if fkind == "special":  # IF
        cond = _num(_eval(arg_nodes[0], ctx))
        a, b = _eval(arg_nodes[1], ctx), _eval(arg_nodes[2], ctx)
        if _is_text(a) or _is_text(b):
            shape = np.broadcast_shapes(np.shape(cond), np.shape(a),
                                        np.shape(b))
            out = np.where(np.broadcast_to(cond, shape) != 0,
                           np.broadcast_to(np.asarray(a, dtype=object), shape),
                           np.broadcast_to(np.asarray(b, dtype=object), shape))
            out = np.asarray(out, dtype=object)
            out[np.broadcast_to(np.isnan(cond), shape)] = None
            return out if out.ndim else out[()]
        a, b = _num(a), _num(b)
        return np.where(np.isnan(cond), np.nan, np.where(cond != 0, a, b))
    args = [_eval(n, ctx) for n in arg_nodes]
    try:
        if fkind == "agg" or (name in ("MAX", "MIN", "SUM") and len(args) == 1):
            return _aggregate(name, args[0])
        if fkind == "rand":
            p1, p2 = _num(args[0]), _num(args[1])
            shape = np.broadcast_shapes(ctx.shape, p1.shape, p2.shape)
            if name == "GAUSS":
                draws = ctx.rng.standard_normal(shape)
                return np.where(p2 >= 0, p1 + p2 * draws, np.nan)
            u = ctx.rng.random(shape)
            return p1 + (p2 - p1) * u
        if fkind == "text":
            return impl(*args)
        with np.errstate(all="ignore"):
            return _clean(impl(*args))
    except FormulaError as exc:
        if exc.pos is None:
            raise FormulaError(exc.raw_message, pos) from None
        raise


def _collect(node, names: set, funcs: set):
    kind = node[0]
    if kind == "var":
        names.add(node[1])
    elif kind == "index":
        names.add(node[1])
        _collect(node[2], names, funcs)
    elif kind in ("neg",):
        _collect(node[1], names, funcs)
    elif kind == "not":
        _collect(node[1], names, funcs)
    elif kind == "bin":
        _collect(node[2], names, funcs)
        _collect(node[3], names, funcs)
    elif kind == "call":
        funcs.add(node[1])
        for a in node[2]:
            _collect(a, names, funcs)


def _uses_random(node) -> bool:
    funcs: set = set()
    _collect(node, set(), funcs)
    return bool(funcs & {"GAUSS", "RND"})


def _finish(result, shape):
    """Broadcast to the context shape; numeric text -> numbers."""
    if _is_text(result):
        out = np.broadcast_to(np.asarray(result, dtype=object), shape).copy()
        return out
    res = _clean(_num(result))
    try:
        return np.broadcast_to(res, np.broadcast_shapes(res.shape, shape)).copy()
    except ValueError:
        return res


def evaluate(expr, variables: dict | None = None,
             constants: dict | None = None, *, seed=None, rng=None):
    """Evaluate one expression.

    variables: name -> scalar | list | ndarray (None/NaN = blank). Arrays
    broadcast with numpy rules; the result is broadcast to the common
    shape of all variables. constants: name -> number (e.g. {"K": 2}).
    Names are case-insensitive. Returns a float ndarray (blank = NaN), or
    an object ndarray of text if the formula produces text.
    """
    node = parse(expr) if isinstance(expr, str) else expr
    if rng is None and seed is not None:
        rng = np.random.default_rng(seed)
    ctx = _Context(variables, constants, rng)
    with np.errstate(all="ignore"):
        return _finish(_eval(node, ctx), ctx.shape)


# ------------------------------------------------------------ programs

@dataclass
class Statement:
    target: str          # assigned variable (upper case)
    expr: object         # AST
    line: int            # 1-based
    only: set | None     # data set letters this line applies to
    exclude: set | None  # data set letters excluded


_DESIGNATOR_RE = re.compile(r"^\s*<\s*(~?)\s*([A-Za-z0-9_ ,]+?)\s*>")
_ASSIGN_RE = re.compile(r"^\s*([A-Za-z_][A-Za-z0-9_]*|\{[^}]*\})\s*=(?!=)")


def parse_program(text: str, default_target: str | None = None) -> list:
    """Parse a user-defined transform: one statement per line,
    ``NAME = expression``, optionally prefixed by ``<B>`` / ``<~A>``.
    A single line without an assignment is taken as
    ``default_target = expression`` when default_target is given."""
    if text is None or not str(text).strip():
        raise FormulaError("formula is empty", 0)
    statements = []
    lines = str(text).splitlines()
    content = [(i + 1, ln) for i, ln in enumerate(lines) if ln.strip()]
    for lineno, raw in content:
        only = exclude = None
        offset = 0
        m = _DESIGNATOR_RE.match(raw)
        body = raw
        if m:
            letters = {s.strip().upper() for s in m.group(2).split(",")
                       if s.strip()}
            if m.group(1):
                exclude = letters
            else:
                only = letters
            offset = m.end()
            body = raw[m.end():]
        am = _ASSIGN_RE.match(body)
        try:
            if am:
                target = am.group(1)
                if target.startswith("{"):
                    target = target[1:-1].strip()
                target = target.upper()
                if target in FUNCTIONS or target in _KEYWORDS:
                    raise FormulaError(f"cannot assign to '{target}'",
                                       offset + am.start(1))
                expr_text = body[am.end():]
                expr_off = offset + am.end()
            elif default_target is not None and len(content) == 1:
                target = default_target.upper()
                expr_text = body
                expr_off = offset
            else:
                raise FormulaError("each line must look like NAME = "
                                   "expression", offset)
            try:
                node = _Parser(tokenize(expr_text)).parse() \
                    if expr_text.strip() else None
            except FormulaError as exc:
                raise FormulaError(exc.raw_message,
                                   None if exc.pos is None
                                   else exc.pos + expr_off) from None
            if node is None:
                raise FormulaError(f"nothing after '{target} ='", expr_off)
        except FormulaError as exc:
            raise exc.with_line(lineno) from None
        statements.append(Statement(target, node, lineno, only, exclude))
    return statements


def _applies(stmt: Statement, letter: str | None) -> bool:
    if letter is None:
        return stmt.only is None
    if stmt.only is not None and letter not in stmt.only:
        return False
    if stmt.exclude is not None and letter in stmt.exclude:
        return False
    return True


def run_program(statements, variables: dict, constants: dict | None = None,
                *, dataset: str | None = None, rng=None) -> dict:
    """Execute parsed statements in order; each assignment becomes a
    variable visible to later lines. Returns the final variable map
    (upper-case names, ndarray values)."""
    env = {str(k).upper(): v for k, v in (variables or {}).items()}
    for stmt in statements:
        if not _applies(stmt, dataset):
            continue
        try:
            env[stmt.target] = evaluate(stmt.expr, env, constants, rng=rng)
        except FormulaError as exc:
            raise exc.with_line(stmt.line) from None
    return env


# ------------------------------------------------------------ validation

def validate(expr: str, known_names=None, *, program: bool | None = None,
             default_target: str | None = None) -> dict:
    """Check a formula without evaluating it.

    Returns {"ok", "errors": [{message, line, column, text}],
    "variables": referenced names (upper case, excluding PI/E and names
    assigned earlier in a program), "functions", "assigned"}.
    With known_names, references to other names are reported as errors.
    program=None auto-detects: several lines, a <B> prefix, or a leading
    ``NAME =`` make it a transform program rather than one expression.
    """
    errors, names, funcs, assigned = [], set(), set(), []
    if program is None:
        text = str(expr or "")
        lines = [ln for ln in text.splitlines() if ln.strip()]
        program = (len(lines) > 1 or bool(_DESIGNATOR_RE.match(text))
                   or bool(_ASSIGN_RE.match(text)))
    try:
        if program:
            stmts = parse_program(expr, default_target)
        else:
            stmts = [Statement("", parse(expr), 1, None, None)]
    except FormulaError as exc:
        return {"ok": False, "errors": [exc.as_dict()], "variables": [],
                "functions": [], "assigned": []}
    known = None if known_names is None else {str(k).upper()
                                              for k in known_names}
    defined: set = set()
    for st in stmts:
        used: set = set()
        _collect(st.expr, used, funcs)
        free = {n for n in used if n not in defined
                and n not in BUILTIN_CONSTANTS}
        names |= free
        if known is not None:
            for n in sorted(free - known):
                errors.append(FormulaError(f"unknown variable '{n}'",
                                           None, st.line).as_dict())
        if st.target:
            assigned.append(st.target)
            defined.add(st.target)
    return {"ok": not errors, "errors": errors, "variables": sorted(names),
            "functions": sorted(funcs), "assigned": assigned}


# ------------------------------------------------------ table transforms

def _letter(i: int) -> str:
    s = ""
    i += 1
    while i:
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return s


def _grid(rows) -> np.ndarray:
    width = max((len(r) for r in rows), default=0)
    g = np.full((len(rows), max(width, 1)), np.nan)
    for i, r in enumerate(rows):
        for j, v in enumerate(r):
            if v is not None:
                g[i, j] = float(v)
    return g


def _to_list(a) -> list:
    out = []
    for v in np.asarray(a).tolist():
        if isinstance(v, list):
            out.append(_to_list(v))
        elif isinstance(v, str):
            fv = _to_float_scalar(v)
            out.append(None if math.isnan(fv) else fv)
        elif v is None or (isinstance(v, float) and not math.isfinite(v)):
            out.append(None)
        else:
            out.append(float(v))
    return out


def _row_means(g: np.ndarray) -> np.ndarray:
    with np.errstate(all="ignore"):
        cnt = np.sum(~np.isnan(g), axis=1)
        s = np.nansum(g, axis=1)
        return np.where(cnt > 0, s / np.maximum(cnt, 1), np.nan)


def _program_for(formula, target):
    if isinstance(formula, list):
        return formula
    return parse_program(formula, default_target=target)


def apply_transform(x, datasets, *, x_formula=None, y_formula=None,
                    constants=None, constants_by_dataset=None, seed=None,
                    column_refs: str = "mean") -> dict:
    """User-defined transform over an XY/grouped table.

    x: X column (None = blank); datasets: [{"name", "ys": rows x
    replicate subcolumns}].  y_formula is evaluated per data set with
    X (each row), Y (each replicate value), the data-set letters A, B, ...
    (other columns: row mean of replicates, or the same subcolumn when
    column_refs="replicate"), and constants (e.g. K; constants_by_dataset
    gives per-data-set overrides, Prism's 'separate K per data set').
    Lines prefixed <B> / <~A> apply to selected data sets only.

    x_formula transforms X.  If it only uses X (and constants) the table
    keeps its shape.  If it also uses Y, each data set gets its own X
    values, so the result is staggered down the page (data set A's rows
    first, then B's, ...), with Y as the row mean of replicates.  Both
    formulas see the ORIGINAL X and Y values.

    Returns {"x", "datasets", "staggered"}.
    """
    rng = np.random.default_rng(seed)
    x_arr = np.array([np.nan if v is None else float(v) for v in x])
    n_rows = len(x_arr)
    grids = []
    for ds in datasets:
        g = _grid(ds.get("ys") or [])
        if g.shape[0] < n_rows:
            g = np.vstack([g, np.full((n_rows - g.shape[0], g.shape[1]),
                                      np.nan)])
        grids.append(g[:n_rows])
    letters = [_letter(i) for i in range(len(datasets))]
    means = [_row_means(g) for g in grids]

    def env_for(i, replicate_shape):
        env = {}
        for j, letter in enumerate(letters):
            if column_refs == "replicate":
                gj = grids[j]
                width = replicate_shape[1] if len(replicate_shape) > 1 else 1
                col = np.full((n_rows, width), np.nan)
                w = min(width, gj.shape[1])
                col[:, :w] = gj[:, :w]
                env[letter] = col
            else:
                env[letter] = means[j][:, None] if len(replicate_shape) > 1 \
                    else means[j]
        return env

    def consts(i):
        c = dict(constants or {})
        if constants_by_dataset and i < len(constants_by_dataset):
            c.update(constants_by_dataset[i] or {})
        return c

    y_prog = _program_for(y_formula, "Y") if y_formula else None
    x_prog = _program_for(x_formula, "X") if x_formula else None
    if y_prog and not any(s.target == "Y" for s in y_prog):
        raise FormulaError("the Y transform must assign Y (e.g. Y = Y*2)")
    if x_prog and not any(s.target == "X" for s in x_prog):
        raise FormulaError("the X transform must assign X (e.g. X = X/1000)")

    new_ys = []
    for i, (ds, g) in enumerate(zip(datasets, grids)):
        if y_prog is None:
            new_ys.append(g)
            continue
        env = env_for(i, g.shape)
        env.update({"X": x_arr[:, None], "Y": g})
        out = run_program(y_prog, env, consts(i), dataset=letters[i], rng=rng)
        y_new = np.broadcast_to(_num(out["Y"]), g.shape).astype(float)
        new_ys.append(_clean(y_new))

    staggered = False
    if x_prog is None:
        new_x = x_arr
    else:
        refs = set()
        for st in x_prog:
            _collect(st.expr, refs, set())
        assigned = {st.target for st in x_prog}
        uses_y = "Y" in refs or bool(set(letters) & (refs - assigned)) \
            or any(st.only or st.exclude for st in x_prog)
        if not uses_y or not datasets:
            env = {"X": x_arr}
            out = run_program(x_prog, env, consts(0), dataset=None, rng=rng)
            new_x = np.broadcast_to(_num(out["X"]), x_arr.shape).astype(float)
        else:
            staggered = True
            xs, blocks = [], []
            for i, g in enumerate(grids):
                env = env_for(i, (n_rows,))
                env.update({"X": x_arr, "Y": means[i]})
                out = run_program(x_prog, env, consts(i), dataset=letters[i],
                                  rng=rng)
                xs.append(np.broadcast_to(_num(out["X"]), x_arr.shape))
            new_x = np.concatenate(xs) if xs else x_arr
            for i, g in enumerate(new_ys):
                block = np.full((n_rows * len(grids), g.shape[1]), np.nan)
                block[i * n_rows:(i + 1) * n_rows] = g
                blocks.append(block)
            new_ys = blocks
        new_x = _clean(new_x)

    return {
        "x": _to_list(new_x),
        "datasets": [{"name": ds.get("name", ""), "ys": _to_list(g)}
                     for ds, g in zip(datasets, new_ys)],
        "staggered": staggered,
    }


def transform_x(x, datasets, formula, **kw) -> dict:
    """X-only user-defined transform (X = f(X[, Y]))."""
    return apply_transform(x, datasets, x_formula=formula, **kw)


def transform_y(x, datasets, formula, **kw) -> dict:
    """Y transform, Y = f(X, Y, other columns, K)."""
    return apply_transform(x, datasets, y_formula=formula, **kw)


def calculate_variables(columns: dict, formulas, *, constants=None,
                        seed=None) -> dict:
    """In-table calculated variables (Multiple Variables tables).

    columns: {name: [values]} (equal lengths, None = blank). formulas:
    list of {"name", "formula"} (or (name, formula) pairs), evaluated in
    order so later formulas can use earlier results. Column names are
    referenced case-insensitively; use {Name with spaces} for titles that
    are not identifiers. Returns {"columns": {name: [values]}} with only
    the newly calculated variables (text results are kept as text).
    """
    rng = np.random.default_rng(seed)
    lengths = {len(v) for v in columns.values()}
    if len(lengths) > 1:
        raise ValueError("all variables must have the same number of rows")
    n = lengths.pop() if lengths else 0
    env = {}
    for k, v in columns.items():
        env[str(k).strip()] = _as_value(v) if not isinstance(v, str) else v
    out = {}
    for item in formulas:
        name, text = ((item["name"], item["formula"]) if isinstance(item, dict)
                      else item)
        try:
            val = evaluate(text, env, constants, rng=rng)
        except FormulaError as exc:
            raise FormulaError(f"{name}: {exc.raw_message}", exc.pos) from None
        val = np.broadcast_to(val, (n,)) if np.ndim(val) == 0 else val
        env[str(name).strip()] = val
        if _is_text(val):
            out[name] = [None if v is None else str(v) for v in val.tolist()]
        else:
            out[name] = _to_list(val)
    return {"columns": out}
