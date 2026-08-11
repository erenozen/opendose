"""Transform analysis (standard functions).

Prism reference: User Guide, "Transform"; standard function list includes
Y=Y*K, Y=Y+K, Y=Y-K, Y=Y/K, Y=Y^2, Y=log(Y) [log10], Y=ln(Y), Y=log2(Y),
Y=10^Y, Y=e^Y, Y=1/Y, Y=sqrt(Y), and the same family for X. The
dose-response workflow's key transform is X = log(X).

Invalid results (e.g. log of a non-positive number) become blanks,
matching Prism's behavior of leaving the cell empty.
"""

from __future__ import annotations

import math

_FUNCS = {
    "log10": lambda v, k: math.log10(v),
    "ln": lambda v, k: math.log(v),
    "log2": lambda v, k: math.log2(v),
    "pow10": lambda v, k: 10.0 ** v,
    "exp": lambda v, k: math.exp(v),
    "reciprocal": lambda v, k: 1.0 / v,
    "sqrt": lambda v, k: math.sqrt(v),
    "square": lambda v, k: v * v,
    "multiply_k": lambda v, k: v * k,
    "divide_k": lambda v, k: v / k,
    "add_k": lambda v, k: v + k,
    "subtract_k": lambda v, k: v - k,
}

TRANSFORMS = sorted(_FUNCS)


def transform_value(value, func: str, k=None):
    """Apply one standard transform; returns None where undefined."""
    if value is None:
        return None
    try:
        result = _FUNCS[func](float(value), k)
    except (ValueError, ZeroDivisionError, OverflowError):
        return None
    if isinstance(result, float) and (math.isnan(result) or math.isinf(result)):
        return None
    return result


def transform_list(values, func: str, k=None) -> list:
    return [transform_value(v, func, k) for v in values]


def transform_grid(rows, func: str, k=None) -> list:
    return [[transform_value(v, func, k) for v in row] for row in rows]
