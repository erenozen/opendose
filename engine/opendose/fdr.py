"""Multiplicity corrections for a family of P values.

Statistics guide pages implemented here:
- "Analyzing a stack of P values": either control the false discovery
  rate (FDR) or control the Type I error rate for the whole family.
- "How the methods used to control the FDR work" and "Pros and cons of
  the three methods used to control the FDR": the original step-up
  method of Benjamini & Hochberg (1995), the corrected method of
  Benjamini & Yekutieli (2001), and the two-stage linear step-up method
  of Benjamini, Krieger & Yekutieli (2006, section 6; the recommended
  one). Each ranks the P values and compares them, starting from the
  largest, with a threshold that grows linearly with the rank:
    BH:  rank * q / N
    BY:  rank * q / (N * (1 + 1/2 + ... + 1/N))
    BKY: rank * q / ((1 + q) * Ntrue), where Ntrue = N - (number of
         discoveries of a first BH stage run at q / (1 + q)).
  The first P value at or below its threshold, and every smaller one,
  is a "discovery".
- "Key facts about controlling the FDR": the q value reported for each
  comparison is the value of Q at which that comparison would be right on
  the border of being a discovery. It does not depend on the Q entered.
  For BH and BY this is the usual step-up adjusted P value; for BKY the
  discovery set grows monotonically with Q, so q is the smallest Q at
  which the comparison is a discovery (computed exactly below).
- Statistical significance: Bonferroni(-Dunn) P * K, Sidak(-Bonferroni)
  1 - (1 - P)^K, and the step-down Holm-Sidak method (the guide's
  recommendation; Prism 8 multiple comparisons algorithm document: P
  values sorted ascending, the i-th compared with 1 - (1 - alpha)^(1/(K -
  i + 1)), stopping at the first that is not significant). Adjusted P
  values follow the matching closed forms, made monotone for the step-down
  method.
- No correction: each P value is compared with alpha on its own.

Missing P values (None/NaN) are left out of the family; their outputs
are None. Q and alpha are fractions here (Prism's dialogs take Q as a
percentage; the API accepts either, see opendose.api).
"""

from __future__ import annotations

import math

import numpy as np

FWER_METHODS = ("bonferroni", "sidak", "holm_sidak")
FDR_METHODS = ("bh", "by", "bky")
METHODS = ("none",) + FWER_METHODS + FDR_METHODS

_ALIASES = {
    "fdr_bh": "bh", "benjamini_hochberg": "bh",
    "fdr_by": "by", "benjamini_yekutieli": "by",
    "fdr_tsbky": "bky", "two_stage": "bky", "bky_two_stage": "bky",
    "holm-sidak": "holm_sidak", "holmsidak": "holm_sidak",
    "bonferroni_dunn": "bonferroni", "sidak_bonferroni": "sidak",
    "fisher": "none", "fisher_lsd": "none", "uncorrected": "none",
}


def canonical_method(method: str) -> str:
    m = (method or "none").lower()
    m = _ALIASES.get(m, m)
    if m not in METHODS:
        raise ValueError(f"unknown multiple-comparisons method: {method}")
    return m


def _valid(pvalues):
    """(indices of usable P values, their values as an array)."""
    idx, vals = [], []
    for i, p in enumerate(pvalues):
        if p is None:
            continue
        p = float(p)
        if math.isnan(p):
            continue
        if p < 0 or p > 1:
            raise ValueError(f"P value out of range [0, 1]: {p}")
        idx.append(i)
        vals.append(p)
    return idx, np.array(vals, dtype=float)


def _scatter(n_total, idx, values):
    out = [None] * n_total
    for i, v in zip(idx, values):
        out[i] = float(v)
    return out


# --- adjusted P values (arrays of valid P values in, same order out) ---

def bonferroni(p: np.ndarray) -> np.ndarray:
    return np.minimum(p * p.size, 1.0)


def sidak(p: np.ndarray) -> np.ndarray:
    # -expm1(m * log1p(-p)) == 1 - (1 - p)^m without cancellation
    m = p.size
    with np.errstate(divide="ignore"):
        return np.minimum(-np.expm1(m * np.log1p(-p)), 1.0)


def holm_sidak(p: np.ndarray) -> np.ndarray:
    m = p.size
    order = np.argsort(p, kind="mergesort")
    adj_sorted = np.empty(m)
    running = 0.0
    for rank, idx in enumerate(order):
        with np.errstate(divide="ignore"):
            a = float(-np.expm1((m - rank) * np.log1p(-p[idx])))
        running = max(running, a)
        adj_sorted[rank] = min(running, 1.0)
    out = np.empty(m)
    out[order] = adj_sorted
    return out


def _step_up(p: np.ndarray, scale: float) -> np.ndarray:
    """min over j >= i of p_(j) * scale / j, in the original order."""
    m = p.size
    order = np.argsort(p, kind="mergesort")
    ranks = np.arange(1, m + 1)
    vals = p[order] * scale / ranks
    vals = np.minimum.accumulate(vals[::-1])[::-1]
    out = np.empty(m)
    out[order] = np.minimum(vals, 1.0)
    return out


def bh(p: np.ndarray) -> np.ndarray:
    """Benjamini-Hochberg q values (step-up adjusted P values)."""
    return _step_up(p, float(p.size))


def by(p: np.ndarray) -> np.ndarray:
    """Benjamini-Yekutieli q values."""
    m = p.size
    c_m = float(np.sum(1.0 / np.arange(1, m + 1)))
    return _step_up(p, m * c_m)


def bky_discoveries(p: np.ndarray, q: float):
    """Two-stage linear step-up procedure of Benjamini, Krieger &
    Yekutieli (2006, Definition 6) at FDR level q. Returns (discovery
    flags, Ntrue estimate, stage-1 discoveries)."""
    m = p.size
    q1 = q / (1.0 + q)
    order = np.argsort(p, kind="mergesort")
    ps = p[order]
    ranks = np.arange(1, m + 1)

    def step_up_count(threshold_per_rank):
        ok = np.nonzero(ps <= threshold_per_rank)[0]
        return int(ok[-1] + 1) if ok.size else 0

    r1 = step_up_count(ranks * q1 / m)
    if r1 == 0 or r1 == m:
        r = r1
        n_true = m - r1
    else:
        n_true = m - r1
        r = step_up_count(ranks * q1 / n_true)
    flags = np.zeros(m, dtype=bool)
    flags[order[:r]] = True
    return flags, int(n_true), int(r1)


def bky_qvalues(p: np.ndarray) -> np.ndarray:
    """q value of each P value under the two-stage BKY procedure: the
    smallest Q (fraction) at which it is a discovery, capped at 1.

    With q' = Q / (1 + Q), the first stage discovers r1(q') = #{j:
    BH-adjusted p_(j) <= q'}. While r1 = r (0 < r < N), rank k is a
    discovery iff q' >= (N - r) * s_k, s_k = min_{j >= k} p_(j) / j. Once
    r1 = N every P value is a discovery. The discovery set only grows with
    q', so the first r interval satisfying the condition gives q'."""
    m = p.size
    order = np.argsort(p, kind="mergesort")
    ps = p[order]
    ranks = np.arange(1, m + 1)
    a = np.minimum.accumulate((ps * m / ranks)[::-1])[::-1]  # BH-adjusted
    s = np.minimum.accumulate((ps / ranks)[::-1])[::-1]
    qprime = np.empty(m)
    for k in range(m):
        found = a[m - 1]  # r1 = N: everything is a discovery
        # intervals r = 1 .. m-1: q' in [a_(r), a_(r+1)) (1-based a)
        lo, hi = 1, m - 1
        # condition C(r): (m - r) * s_k < a_(r+1) is monotone in r
        # (left side falls, right side rises); find the first r with it.
        first = None
        while lo <= hi:
            mid = (lo + hi) // 2
            if (m - mid) * s[k] < a[mid]:  # a[mid] is a_(mid+1)
                first = mid
                hi = mid - 1
            else:
                lo = mid + 1
        if first is not None:
            found = min(found, max(a[first - 1], (m - first) * s[k]))
        qprime[k] = found
    with np.errstate(divide="ignore"):
        qv = np.where(qprime >= 0.5, 1.0, qprime / (1.0 - qprime))
    qv = np.minimum(np.maximum.accumulate(qv), 1.0)
    out = np.empty(m)
    out[order] = qv
    return out


def thresholds(m: int, method: str, *, alpha: float = 0.05,
               q: float = 0.05, n_true: int | None = None) -> list:
    """Per-rank threshold (ascending P value order) each method compares
    the P value of that rank with; the guide's threshold tables."""
    ranks = np.arange(1, m + 1, dtype=float)
    if method == "none":
        t = np.full(m, alpha)
    elif method == "bonferroni":
        t = np.full(m, alpha / m)
    elif method == "sidak":
        t = np.full(m, -math.expm1(math.log1p(-alpha) / m))
    elif method == "holm_sidak":
        t = -np.expm1(np.log1p(-alpha) / (m - ranks + 1))
    elif method == "bh":
        t = ranks * q / m
    elif method == "by":
        t = ranks * q / (m * float(np.sum(1.0 / ranks)))
    elif method == "bky":
        nt = n_true if n_true else m
        t = ranks * q / ((1.0 + q) * nt)
    else:
        raise ValueError(method)
    return [float(v) for v in t]


def adjust(pvalues, method: str = "bky", *, alpha: float = 0.05,
           q: float = 0.05) -> dict:
    """Correct a family of P values for multiple comparisons.

    method: "none" | "bonferroni" | "sidak" | "holm_sidak" (statistical
    significance at family-wise alpha) or "bh" | "by" | "bky" (FDR at
    level q, a fraction). Returns adjusted P values ("adjusted"; q values
    for the FDR methods, None for "none"), the per-comparison flag
    ("significant": "Below threshold?" / "Discovery?"), the number of
    flagged comparisons ("discoveries") and the per-rank thresholds.
    """
    method = canonical_method(method)
    pvalues = list(pvalues)
    n_total = len(pvalues)
    idx, p = _valid(pvalues)
    m = p.size
    approach = "fdr" if method in FDR_METHODS else "significance"
    out = {"method": method, "approach": approach, "n": int(m),
           "n_omitted": int(n_total - m),
           "alpha": float(alpha) if approach == "significance" else None,
           "q": float(q) if approach == "fdr" else None}
    if m == 0:
        out.update({"adjusted": [None] * n_total,
                    "significant": [None] * n_total, "discoveries": 0,
                    "thresholds": [], "n_true_null_estimate": None})
        return out

    n_true = None
    if method == "none":
        adj = None
        flags = p < alpha
    elif method in FWER_METHODS:
        adj = {"bonferroni": bonferroni, "sidak": sidak,
               "holm_sidak": holm_sidak}[method](p)
        flags = adj <= alpha
    elif method == "bh":
        adj = bh(p)
        flags = adj <= q
    elif method == "by":
        adj = by(p)
        flags = adj <= q
    else:
        adj = bky_qvalues(p)
        flags, n_true, _ = bky_discoveries(p, q)

    out.update({
        "adjusted": (_scatter(n_total, idx, adj) if adj is not None
                     else [None] * n_total),
        "significant": [None] * n_total,
        "discoveries": int(np.sum(flags)),
        "thresholds": thresholds(m, method, alpha=alpha, q=q,
                                 n_true=n_true),
        "n_true_null_estimate": n_true,
    })
    for i, f in zip(idx, flags):
        out["significant"][i] = bool(f)
    return out
