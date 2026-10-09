"""Order statistics of implicit pairwise sets in O(n log n) memory.

Several rank-based results are order statistics of a set with one
element per pair of observations:

- the Hodges-Lehmann shift of two samples and its CI (Mann-Whitney): the
  median and the k-th smallest / largest of the n_a n_b differences
  a_i - b_j (Hodges & Lehmann 1963; Bauer 1972);
- the Hodges-Lehmann one-sample estimate and the CI of the median
  (Wilcoxon signed rank): the median and the k-th smallest / largest of
  the n(n + 1)/2 Walsh averages (x_i + x_j)/2, i <= j (Tukey 1949;
  Hollander & Wolfe);
- Kendall's tau: the number of discordant pairs.

Building those sets costs n_a n_b (or n^2 / 2) cells: 10^10 for two
groups of 100,000 values, which no browser tab survives. The functions
below never build them.

Selection (kth_pairwise_difference, kth_walsh_average) is exact: the
sets are the rows of a matrix whose rows are sorted (a_i - b_j with b in
descending order; (x_i + x_j)/2 for j >= i with x sorted), so the k-th
smallest element is found with the matrix-selection method of Johnson &
Mizoguchi (1978, "Selecting the Kth element in X + Y and X1 + X2 + ... +
Xm", SIAM J Comput 7:147-153) as specialised to the Hodges-Lehmann
estimators by Monahan (1984, "Algorithm 616: fast computation of the
Hodges-Lehmann location estimator", ACM TOMS 10:265-270): every row
keeps a window [L_i, R_i) of candidate columns; the pivot is the
weighted median of the row medians (weights = window sizes), so each
step removes at least a quarter of the candidates; the rows are counted
against the pivot by binary search; when few candidates remain they are
gathered and selected directly. Each step costs O(m log n) for m rows,
and O(log(m n)) steps are needed. To need fewer steps, these
deterministic steps alternate with random-sample steps in the manner of
Floyd & Rivest (1975, "Expected time bounds for selection", Commun ACM
18:165-172): two pivots taken from a random sample of the candidates
just below and above the target rank usually leave ~5% of them; a
sample step that fails to halve the candidates is followed by a
deterministic one, so the worst case keeps the bound above. Randomness
(fixed seed) affects only the running time, never the result.

Exactness: every value compared is computed by the same floating-point
expression as the direct method (a_i - b_j; (x_i + x_j) / 2.0), and
rounding is monotone, so each row of computed values is still sorted and
the selected element is bit-for-bit the element the direct sort returns
(tests/test_large_data_paths.py checks this against the direct method,
ties included).

count_discordant counts the discordant pairs of Kendall's tau by
counting inversions with a merge sort (Knight 1966, "A computer method
for calculating Kendall's tau with ungrouped data", JASA 61:436-439),
vectorised level by level (O(n log^2 n) time, O(n) memory).
"""

from __future__ import annotations

import math

import numpy as np

# Below this many candidates the remaining window is gathered and the
# element is selected with np.partition.
_GATHER = 1 << 16
_GATHER_PER_ROW = 4
# Sampling steps: sample size and half-width (in sample standard errors)
# of the pivot pair around the target rank.
_SAMPLE = 1 << 14
_SAMPLE_Z = 3.0
# Relative and absolute slack of the searchsorted bracket (see _Rows).
_EPS_REL = 1e-14
_EPS_ABS = 1e-300


class _Rows:
    """A matrix with sorted rows given implicitly: row r holds
    value(r, c) = combine(u[r], col[c]) for start[r] <= c < ncols, col
    ascending, combine nondecreasing in col. value() is the exact
    floating-point expression of the direct method. bracket() returns,
    per row, a column range [g_lo, g_hi] that is guaranteed to contain
    the first column whose value is >= pivot and the first whose value
    is > pivot: columns below g_lo have col[c] < t - eps (so value <
    pivot) and columns at or above g_hi have col[c] > t + eps (value >
    pivot), t the real-arithmetic threshold, eps a generous multiple of
    the rounding error. Binary search on value() inside the bracket then
    pins the exact boundary, so counts are exact."""

    def __init__(self, u, col, start, value, threshold):
        self.u = u
        self.col = col
        self.start = np.asarray(start, dtype=np.int64)
        self.ncols = col.size
        self.value = value
        self.threshold = threshold
        self.cmax = float(np.max(np.abs(col))) if col.size else 0.0

    def bracket(self, rows, pivot):
        t = self.threshold(self.u[rows], pivot)
        eps = _EPS_REL * (np.abs(self.u[rows]) + abs(pivot) + self.cmax
                          + np.abs(t)) + _EPS_ABS
        lo = np.searchsorted(self.col, t - eps, side="left")
        hi = np.searchsorted(self.col, t + eps, side="right")
        bad = ~(np.isfinite(t) & np.isfinite(eps))
        if np.any(bad):           # no usable bracket: search the whole row
            lo[bad] = 0
            hi[bad] = self.ncols
        return lo.astype(np.int64), hi.astype(np.int64)

    def first_above(self, rows, lo, hi, pivot, inclusive):
        """Per row, the first column in [lo, hi) whose value is > pivot
        (inclusive=True) or >= pivot (False); hi if none. The caller
        guarantees the boundary lies in [lo, hi]."""
        g_lo, g_hi = self.bracket(rows, pivot)
        # clip the bracket to [lo, hi] (for Walsh rows the bracket can
        # fall left of the row's first column)
        lo, hi = (np.minimum(np.maximum(lo, g_lo), hi),
                  np.maximum(np.minimum(hi, g_hi), lo))
        active = lo < hi
        while np.any(active):
            idx = np.nonzero(active)[0]
            mid = (lo[idx] + hi[idx]) // 2
            v = self.value(rows[idx], mid)
            right = v <= pivot if inclusive else v < pivot
            lo[idx[right]] = mid[right] + 1
            hi[idx[~right]] = mid[~right]
            active = lo < hi
        return lo


def _select(mat: _Rows, k: int) -> float:
    """k-th smallest (1-based) element of the implicit matrix (Johnson &
    Mizoguchi 1978; Monahan 1984): see the module docstring.

    Two kinds of step shrink the candidate windows. A sampling step
    (Floyd & Rivest 1975, "Expected time bounds for selection", Commun
    ACM 18:165-172) draws _SAMPLE candidates at random, takes the sample
    order statistics a few standard errors either side of the target
    rank as two pivots and usually keeps only the ~5% of candidates
    between them. When a sampling step fails to halve the candidates, a
    deterministic step follows: the pivot is the weighted median of the
    row medians (weights = window sizes), which removes at least a
    quarter of them (Johnson & Mizoguchi 1978). The random draws only
    affect the running time; the element returned is always exact."""
    start = mat.start
    m = start.size
    total = int(np.sum(mat.ncols - start))
    if not 1 <= k <= total:
        raise ValueError("order statistic out of range")
    lo_b = start.copy()                             # L_r
    hi_b = np.full(m, mat.ncols, dtype=np.int64)    # R_r
    rng = np.random.default_rng(20240616)
    sample_step = True
    while True:
        width = hi_b - lo_b
        n_cand = int(width.sum())
        k_local = k - int(np.sum(lo_b - start))
        rows = np.nonzero(width > 0)[0]
        w = width[rows]
        if n_cand <= max(_GATHER, _GATHER_PER_ROW * rows.size):
            r_idx = np.repeat(rows, w)
            offs = np.arange(n_cand) - np.repeat(np.cumsum(w) - w, w)
            vals = mat.value(r_idx, lo_b[r_idx] + offs)
            return float(np.partition(vals, k_local - 1)[k_local - 1])
        L, R = lo_b[rows], hi_b[rows]
        if sample_step:
            cw = np.cumsum(w)
            g = rng.integers(0, n_cand, _SAMPLE)
            ri = np.searchsorted(cw, g, side="right")
            sv = np.sort(mat.value(rows[ri], L[ri] + g - (cw[ri] - w[ri])))
            pos = (k_local - 0.5) / n_cand * _SAMPLE
            half = _SAMPLE_Z * math.sqrt(_SAMPLE) + 1.0
            i_lo, i_hi = math.floor(pos - half), math.ceil(pos + half)
            new_lo, new_hi = L, R
            if i_lo >= 0:
                p_lo = float(sv[i_lo])
                lt = mat.first_above(rows, L, R, p_lo, False)
                if int(np.sum(lt - L)) < k_local:   # target >= p_lo
                    new_lo = lt
                else:                               # target < p_lo
                    new_hi = lt
            if i_hi < _SAMPLE and new_hi is R:
                p_hi = float(sv[i_hi])
                le = mat.first_above(rows, new_lo, R, p_hi, True)
                if int(np.sum(le - L)) >= k_local:  # target <= p_hi
                    new_hi = le
                else:                               # target > p_hi
                    new_lo = le
            lo_b[rows], hi_b[rows] = new_lo, new_hi
            sample_step = int(np.sum(new_hi - new_lo)) <= n_cand // 2
            continue
        sample_step = True
        # pivot: weighted median of the row medians
        med = mat.value(rows, L + (w - 1) // 2)
        order = np.argsort(med, kind="stable")
        cw = np.cumsum(w[order])
        pivot = float(med[order][np.searchsorted(cw, cw[-1] / 2.0)])
        lt = mat.first_above(rows, L, R, pivot, False)
        if int(np.sum(lt - L)) >= k_local:          # target < pivot
            hi_b[rows] = lt
            continue
        le = mat.first_above(rows, lt, R, pivot, True)
        if int(np.sum(le - L)) >= k_local:          # target == pivot
            return pivot
        lo_b[rows] = le                             # target > pivot


def _next(mat: _Rows, k: int, v: float) -> float:
    """The (k+1)-th smallest element given v, the k-th: v again when more
    than k elements are <= v, else the smallest element > v."""
    rows = np.arange(mat.start.size)
    le = mat.first_above(rows, mat.start.copy(),
                         np.full(rows.size, mat.ncols, dtype=np.int64),
                         v, True)
    if int(np.sum(le - mat.start)) >= k + 1:
        return v
    ok = le < mat.ncols
    return float(np.min(mat.value(rows[ok], le[ok])))


def _difference_rows(a, b) -> _Rows:
    """a_i - b_j as rows: the smaller sample indexes the rows (cost per
    step is linear in the number of rows)."""
    a = np.asarray(a, dtype=float)
    b = np.asarray(b, dtype=float)
    if a.size <= b.size:
        u = np.sort(a)
        col = np.sort(-b)               # -b ascending; a + (-b) == a - b

        def value(r, c):
            return u[r] - (-col[c])
        return _Rows(u, col, np.zeros(u.size, dtype=np.int64), value,
                     lambda ur, p: p - ur)
    u = np.sort(b)
    col = np.sort(a)

    def value(r, c):
        return col[c] - u[r]
    return _Rows(u, col, np.zeros(u.size, dtype=np.int64), value,
                 lambda ur, p: p + ur)


def _walsh_rows(x) -> _Rows:
    xs = np.sort(np.asarray(x, dtype=float))

    def value(r, c):
        return (xs[r] + xs[c]) / 2.0
    return _Rows(xs, xs, np.arange(xs.size, dtype=np.int64), value,
                 lambda ur, p: 2.0 * p - ur)


def kth_pairwise_difference(a, b, k: int) -> float:
    """k-th smallest (1-based) of the n_a n_b differences a_i - b_j, as
    np.sort(np.subtract.outer(a, b).ravel())[k - 1] (exact)."""
    return _select(_difference_rows(a, b), k)


def kth_walsh_average(x, k: int) -> float:
    """k-th smallest (1-based) of the n(n + 1)/2 Walsh averages
    (x_i + x_j) / 2.0, i <= j (exact)."""
    return _select(_walsh_rows(x), k)


def _median(mat: _Rows) -> float:
    """np.median of the implicit set: the middle value, or the mean of
    the two middle values computed as np.median does."""
    size = int(np.sum(mat.ncols - mat.start))
    if size % 2:
        return _select(mat, (size + 1) // 2)
    lo = _select(mat, size // 2)
    hi = _next(mat, size // 2, lo)
    return float(np.mean(np.array([lo, hi])))


def hodges_lehmann_shift(a, b) -> float:
    """Median of the pairwise differences a_i - b_j (exact)."""
    return _median(_difference_rows(a, b))


def hodges_lehmann_walsh(x) -> float:
    """Median of the Walsh averages (exact)."""
    return _median(_walsh_rows(x))


# ------------------------------------------------------- Kendall's tau

def count_inversions(y) -> int:
    """Number of pairs i < j with y_i > y_j (strict), by a bottom-up merge
    sort whose merges are vectorised (Knight 1966)."""
    y = np.asarray(y)
    n = y.size
    if n < 2:
        return 0
    _, s = np.unique(y, return_inverse=True)   # dense integer codes
    s = s.astype(np.int64).ravel()
    base = int(s.max()) + 1
    idx = np.arange(n, dtype=np.int64)
    inv = 0
    w = 1
    while w < n:
        pair = idx // (2 * w)
        left = (idx // w) % 2 == 0
        keys = pair * base + s          # blocks of width w are sorted
        lk = keys[left]                 # globally sorted (pairs ascend)
        rk = keys[~left]
        rp = pair[~left]
        # left elements of the same pair strictly greater than each right one
        end = np.searchsorted(lk, (rp + 1) * base, side="left")
        at = np.searchsorted(lk, rk, side="right")
        inv += int(np.sum(end - at))
        s = np.sort(keys) - pair * base  # merge each pair of blocks
        w *= 2
    return inv


def count_discordant(a, b) -> dict:
    """Concordant and discordant pair counts of (a, b) without building
    the n x n sign matrices: discordant = inversions of b ordered by
    (a, b); concordant = all pairs - pairs tied in a - pairs tied in b +
    pairs tied in both - discordant."""
    a = np.asarray(a, dtype=float)
    b = np.asarray(b, dtype=float)
    n = a.size
    order = np.lexsort((b, a))
    disc = count_inversions(b[order])

    def tied_pairs(*cols):
        if len(cols) == 1:
            _, c = np.unique(cols[0], return_counts=True)
        else:
            _, c = np.unique(np.column_stack(cols), axis=0,
                             return_counts=True)
        c = c.astype(np.int64)
        return int(np.sum(c * (c - 1) // 2))
    n0 = n * (n - 1) // 2
    conc = n0 - tied_pairs(a) - tied_pairs(b) + tied_pairs(a, b) - disc
    return {"concordant": int(conc), "discordant": int(disc)}
