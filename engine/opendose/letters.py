"""Compact letter display (CLD) of all pairwise comparisons.

User guide, "Compact Letter Display": every group gets at least one
letter; two groups that share a letter were not significantly different
(adjusted P not smaller than alpha), and two groups that share no letter
were. It applies when every group is compared with every other group
(one-way ANOVA "compare every column with every other", two-way ANOVA
"compare cell means regardless of rows and columns"). Labels are upper
case letters by default, or lower case letters, or numbers. In the
guide's worked example the two groups with the highest means share "A"
and lower means get later letters, so groups are taken in descending
order of their means and letters are assigned in the order their first
member appears.

Letters come from the insert-and-absorb algorithm with a final sweep
(Piepho, H.-P. 2004, "An algorithm for a letter-based representation of
all-pairwise comparisons", J. Comput. Graph. Stat. 13: 456-466):
1. start with one letter shared by all groups;
2. insert: for each significantly different pair (i, j), every letter
   column holding both is duplicated, i is removed from one copy and j
   from the other;
3. absorb: a column whose groups are a subset of another column's is
   deleted (after each insertion);
4. sweep: a group's letter is removed when every pair that letter
   connects is still connected by another letter; emptied columns go.
The result connects exactly the non-significant pairs.
"""

from __future__ import annotations

import math
import string
from itertools import combinations


def _absorb(columns):
    """Drop columns that are a subset of another (keep first duplicate)."""
    out = []
    for i, col in enumerate(columns):
        dominated = False
        for j, other in enumerate(columns):
            if i == j:
                continue
            if col < other or (col == other and j < i):
                dominated = True
                break
        if not dominated:
            out.append(col)
    return out


def _insert_absorb(k, sig_pairs):
    columns = [frozenset(range(k))]
    for i, j in sig_pairs:
        if not any(i in col and j in col for col in columns):
            continue
        new = []
        for col in columns:
            if i in col and j in col:
                new.append(col - {i})
                new.append(col - {j})
            else:
                new.append(col)
        columns = _absorb(new)
    return [set(c) for c in columns]


def _sweep(columns, k, sig):
    """Remove redundant letters (Piepho's sweeping step)."""
    def covered(i, j, skip_col):
        return any(i in c and j in c for n, c in enumerate(columns)
                   if n != skip_col)

    for n, col in enumerate(columns):
        for g in sorted(col):
            others = col - {g}
            # dropping g from this column must leave g with >= 1 letter
            # and keep every non-significant pair (g, h), h in col, covered
            if not any(g in c for m, c in enumerate(columns) if m != n):
                continue
            if all(covered(g, h, n) for h in others):
                col.discard(g)
    return [c for c in columns if c]


def _label(n, style):
    if style == "numbers":
        return str(n + 1)
    alphabet = (string.ascii_lowercase if style == "lower"
                else string.ascii_uppercase)
    s = ""
    n += 1
    while n:
        n, r = divmod(n - 1, 26)
        s = alphabet[r] + s
    return s


def letters_from_matrix(names, significant, *, means=None,
                        order: str = "descending", labels: str = "upper",
                        sweep: bool = True) -> dict:
    """names: k group names. significant[i][j]: True if groups i and j
    differ (symmetric; diagonal ignored). means (optional) set the
    display order: "descending" (highest mean gets the first letter, as
    in the guide's example), "ascending" or "given" (input order)."""
    k = len(names)
    if order not in ("descending", "ascending", "given"):
        raise ValueError(f"unknown order: {order}")
    if labels not in ("upper", "lower", "numbers"):
        raise ValueError(f"unknown labels: {labels}")
    pos = list(range(k))
    if means is not None and order != "given":
        def key(i):
            m = means[i]
            bad = m is None or (isinstance(m, float) and math.isnan(m))
            return (bad, -m if (order == "descending" and not bad)
                    else (m if not bad else 0.0), i)
        pos = sorted(range(k), key=key)
    rank = {g: r for r, g in enumerate(pos)}

    sig = [[bool(significant[i][j]) if i != j else False for j in range(k)]
           for i in range(k)]
    sig_pairs = [(i, j) for i, j in combinations(pos, 2) if sig[i][j]]
    columns = _insert_absorb(k, sig_pairs)
    if sweep:
        columns = _sweep(columns, k, sig)
    columns.sort(key=lambda c: sorted(rank[g] for g in c))

    tags = [_label(n, labels) for n in range(len(columns))]
    sep = "," if labels == "numbers" else ""
    group_letters = []
    for g in range(k):
        mine = [tags[n] for n, c in enumerate(columns) if g in c]
        group_letters.append(sep.join(mine))
    return {
        "labels": labels, "order": [names[g] for g in pos],
        "groups": [{"name": names[g],
                    "mean": (float(means[g]) if means is not None
                             and means[g] is not None else None),
                    "letters": group_letters[g]} for g in range(k)],
        "letters": [{"letter": tags[n],
                     "groups": [names[g] for g in sorted(c, key=rank.get)]}
                    for n, c in enumerate(columns)],
    }


def _split_pair(pair, names):
    """'X vs. Y' -> (X, Y), matching against known names (names may
    themselves contain ' vs. ')."""
    parts = pair.split(" vs. ")
    for cut in range(1, len(parts)):
        a, b = " vs. ".join(parts[:cut]), " vs. ".join(parts[cut:])
        if a in names and b in names:
            return a, b
    raise ValueError(f"cannot match comparison '{pair}' to group names")


def compact_letters(names, comparisons, *, means=None, alpha: float = 0.05,
                    order: str = "descending", labels: str = "upper",
                    sweep: bool = True) -> dict:
    """CLD from a pairwise comparison table.

    comparisons: list of dicts naming the pair, either {"a": name, "b":
    name} or {"pair": "X vs. Y"} (the format of the ANOVA multiple
    comparisons results), plus {"significant": bool} or a P value
    ("p_adjusted" or "p"; significant when P < alpha), or the older
    {"significant_05": bool}. Pairs that are missing count as not
    significantly different.
    """
    names = list(names)
    k = len(names)
    index = {n: i for i, n in enumerate(names)}
    if len(index) != k:
        raise ValueError("group names must be unique")
    sig = [[False] * k for _ in range(k)]
    for comp in comparisons:
        if "a" in comp and "b" in comp:
            a, b = comp["a"], comp["b"]
        else:
            a, b = _split_pair(comp["pair"], index)
        if a not in index or b not in index:
            raise ValueError(f"unknown group in comparison: {a} / {b}")
        flag = comp.get("significant")
        if flag is None:
            p = comp.get("p_adjusted")
            if p is None:
                p = comp.get("p")
            if p is not None:
                flag = float(p) < alpha
            else:
                flag = comp.get("significant_05")
        sig[index[a]][index[b]] = sig[index[b]][index[a]] = bool(flag)
    out = letters_from_matrix(names, sig, means=means, order=order,
                              labels=labels, sweep=sweep)
    out["alpha"] = alpha
    return out
