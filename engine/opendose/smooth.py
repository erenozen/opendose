"""Smoothing and interpolating curves through XY data, and smoothing,
differentiating or integrating a curve (FEATURE-PLAN P-103).

None of these is a model with parameters, so none has a model-based
confidence interval; results say so instead of inventing one.

- LOWESS: locally weighted linear regression with tricube weights and
  bisquare robustness iterations (Cleveland 1979, "Robust locally
  weighted regression and smoothing scatterplots", JASA 74:829). The
  algorithm is the one R's lowess() runs (clowess in R's
  src/library/stats/src/lowess.c), step for step: the neighbourhood of
  ns = max(2, min(n, floor(f n + 1e-7))) points, ties on the right taken
  in, weights 1 within 0.001 h and 0 past 0.999 h, a local constant when
  the weighted X spread is under 0.001 of the range, points within
  delta of the last fitted X linearly interpolated, and robustness
  weights from 6 x the median absolute residual (stopping when it is
  under 1e-7 of the mean absolute residual). R's defaults: f = 2/3,
  iter = 3, delta = 0.01 x range(X). statsmodels' lowess(frac=f, it=iter,
  delta=delta) is the test oracle.
- Smoothing spline: the natural cubic spline g minimising
  sum_i w_i (ybar_i - g(x_i))^2 + lambda int g''(t)^2 dt (Reinsch 1967,
  Numer Math 10:177; Green & Silverman 1994, Nonparametric Regression
  and Generalized Linear Models, chapters 2 and 3). As R's
  smooth.spline: tied X values are collapsed to their mean Y with the
  count as the weight, and X is scaled to [0, 1] so lambda is on R's
  scale. The smoother matrix is diagonalised once (the Demmler-Reinsch
  basis, Green & Silverman section 3.3), so its trace (the equivalent
  degrees of freedom) and the fit are exact for every lambda. lambda is
  chosen by generalised cross-validation (Craven & Wahba 1979, Numer
  Math 31:377) in R's form GCV = (RSS / N) / (1 - df / N)^2 over all N
  points, or set so the degrees of freedom equal a chosen value (R's
  smooth.spline(df = )). The curve is the natural cubic spline through
  the fitted values (the same function scipy's make_smoothing_spline
  returns for that lambda). R's smooth.spline computes the penalty with
  the constant 0.333 in place of 1/3 (sgram.f), so its lambda, df and
  fit differ from the exact ones here in the fourth or fifth digit.
- Interpolating curves through the mean Y at each X (R's splinefun with
  ties = mean): the natural cubic spline (zero second derivative at the
  ends; scipy CubicSpline(bc_type="natural"), R splinefun(method =
  "natural")), the monotone piecewise cubic Hermite interpolant (PCHIP;
  Fritsch & Carlson 1980, SIAM J Numer Anal 17:238, with the derivative
  of Fritsch & Butland 1984, SIAM J Sci Stat Comput 5:300; scipy
  PchipInterpolator), and point to point (straight lines between the
  points). They are never extrapolated past the data.
- Curve operations on the mean Y of each X, in increasing X: Savitzky-
  Golay smoothing (Savitzky & Golay 1964, Anal Chem 36:1627; a least-
  squares polynomial of the chosen order over each window of 2k + 1
  points, order 0 being the moving average; the ends from the polynomial
  fitted to the first and last window: scipy.signal.savgol_filter, mode
  "interp"), the first derivative by second-order central differences
  on the actual X spacing (one-sided first differences at the two ends;
  numpy.gradient, Fornberg 1988, Math Comp 51:699), and the integral by
  the cumulative trapezoidal rule from the first X (the area is 0
  there).
"""

from __future__ import annotations

import math

import numpy as np
from scipy.interpolate import CubicSpline, PchipInterpolator
from scipy.optimize import brentq, minimize_scalar

METHODS = ("lowess", "smoothing_spline", "natural_spline", "pchip", "linear")
INTERPOLATING = ("natural_spline", "pchip", "linear")
LABELS = {
    "lowess": "LOWESS (locally weighted regression, Cleveland 1979)",
    "smoothing_spline": "Smoothing spline (natural cubic, penalised)",
    "natural_spline": "Natural cubic spline through the points",
    "pchip": "Monotone cubic spline (PCHIP) through the points",
    "linear": "Point to point (straight lines between the points)",
}
MAX_SPLINE_X = 500        # distinct X for the smoothing spline (dense eigh)
CURVE_POINTS = 200
NO_CI = ("A smoothing or interpolating curve is not a model with "
         "parameters, so it has no model-based confidence interval.")


class SmoothError(ValueError):
    """A refusal with a sentence the app shows as it is."""


# ------------------------------------------------------------------ data

def _clean(x, y):
    """Finite (x, y) pairs as float arrays."""
    xs, ys = [], []
    for a, b in zip(x, y):
        if a is None or b is None:
            continue
        try:
            fa, fb = float(a), float(b)
        except (TypeError, ValueError):
            continue
        if math.isfinite(fa) and math.isfinite(fb):
            xs.append(fa)
            ys.append(fb)
    return np.asarray(xs, float), np.asarray(ys, float)


def collapse_ties(x, y):
    """(distinct X increasing, mean Y at each, count at each)."""
    ux, inv, cnt = np.unique(x, return_inverse=True, return_counts=True)
    ybar = np.bincount(inv, weights=y) / cnt
    return ux, ybar, cnt.astype(float)


# ------------------------------------------------------------------ LOWESS

def _lowest(x, y, xs, nleft, nright, userw, rw, rng):
    """R's lowest(): the fitted value at xs from the points nleft..,
    or None when every weight is zero."""
    n = len(x)
    h = max(xs - x[nleft], x[nright] - xs)
    h9, h1 = 0.999 * h, 0.001 * h
    seg = x[nleft:]
    r = np.abs(seg - xs)
    beyond = (r > h9) & (seg > xs)          # first point past the window
    stop = int(np.argmax(beyond)) if beyond.any() else n - nleft
    r = r[:stop]
    with np.errstate(divide="ignore", invalid="ignore"):
        w = np.where(r <= h1, 1.0, (1.0 - (r / h) ** 3) ** 3) if h > 0 \
            else np.ones_like(r)
    w = np.where(r <= h9, w, 0.0)
    if userw:
        w = w * rw[nleft:nleft + stop]
    a = float(w.sum())
    if a <= 0.0:
        return None
    w = w / a
    xx = seg[:stop]
    if h > 0.0:
        a = float(np.dot(w, xx))
        b = xs - a
        c = float(np.dot(w, (xx - a) ** 2))
        if math.sqrt(c) > 0.001 * rng:
            w = w * (b / c * (xx - a) + 1.0)
    return float(np.dot(w, y[nleft:nleft + stop]))


def lowess_sorted(x, y, f=2.0 / 3.0, iterations=3, delta=None):
    """R's clowess on X already in increasing order: the fitted values.
    delta None is R's default, 0.01 of the range of X."""
    x = np.asarray(x, float)
    y = np.asarray(y, float)
    n = len(x)
    if n == 0:
        return np.zeros(0)
    if n < 2:
        return y.copy()
    rng = float(x[-1] - x[0])
    if delta is None:
        delta = 0.01 * rng
    ns = max(2, min(n, int(f * n + 1e-7)))
    ys = np.zeros(n)
    rw = np.ones(n)
    it = 1
    while it <= iterations + 1:
        nleft, nright, last, i = 0, ns - 1, -1, 0
        while True:
            if nright < n - 1:
                d1 = x[i] - x[nleft]
                d2 = x[nright + 1] - x[i]
                if d1 > d2:
                    nleft += 1
                    nright += 1
                    continue
            v = _lowest(x, y, x[i], nleft, nright, it > 1, rw, rng)
            ys[i] = y[i] if v is None else v
            if last < i - 1:
                denom = x[i] - x[last]
                for j in range(last + 1, i):
                    alpha = (x[j] - x[last]) / denom
                    ys[j] = alpha * ys[i] + (1.0 - alpha) * ys[last]
            last = i
            cut = x[last] + delta
            i = last + 1
            while i < n:
                if x[i] > cut:
                    break
                if x[i] == x[last]:
                    ys[i] = ys[last]
                    last = i
                i += 1
            i = max(last + 1, i - 1)
            if last >= n - 1:
                break
        res = y - ys
        sc = float(np.mean(np.abs(res)))
        if it > iterations:
            break
        ar = np.abs(res)
        cmad = 6.0 * float(np.median(ar))
        if cmad < 1e-7 * sc:
            break
        with np.errstate(divide="ignore", invalid="ignore"):
            rw = np.where(ar <= 0.001 * cmad, 1.0,
                          np.where(ar <= 0.999 * cmad,
                                   (1.0 - (ar / cmad) ** 2) ** 2, 0.0))
        it += 1
    return ys


def lowess(x, y, f=2.0 / 3.0, iterations=3, delta=None):
    """LOWESS of y on x as R's lowess(x, y, f, iter, delta): fitted
    values in the input order (pairs with a missing value get None)."""
    if not 0.0 < f <= 1.0:
        raise SmoothError("The LOWESS span must be more than 0 and at most 1.")
    if int(iterations) != iterations or iterations < 0:
        raise SmoothError("The robustness iterations must be a whole number, 0 or more.")
    keep = [i for i, (a, b) in enumerate(zip(x, y))
            if a is not None and b is not None
            and math.isfinite(float(a)) and math.isfinite(float(b))]
    out = [None] * len(x)
    if not keep:
        return out
    xa = np.array([float(x[i]) for i in keep])
    ya = np.array([float(y[i]) for i in keep])
    order = np.argsort(xa, kind="stable")
    fit = lowess_sorted(xa[order], ya[order], f, int(iterations), delta)
    for k, o in enumerate(order):
        out[keep[o]] = float(fit[k])
    return out


# ------------------------------------------------------------ smoothing spline

class _Reinsch:
    """The penalised natural cubic spline on distinct t (scaled to
    [0, 1]) with weights w, diagonalised once: for any lambda the fit is
    W^-1/2 U diag(1 / (1 + lambda d)) U' W^1/2 ybar and the degrees of
    freedom sum(1 / (1 + lambda d))."""

    def __init__(self, t, ybar, w):
        n = len(t)
        h = np.diff(t)
        Q = np.zeros((n, n - 2))
        R = np.zeros((n - 2, n - 2))
        for j in range(1, n - 1):
            Q[j - 1, j - 1] = 1.0 / h[j - 1]
            Q[j, j - 1] = -1.0 / h[j - 1] - 1.0 / h[j]
            Q[j + 1, j - 1] = 1.0 / h[j]
            R[j - 1, j - 1] = (h[j - 1] + h[j]) / 3.0
            if j < n - 2:
                R[j - 1, j] = R[j, j - 1] = h[j] / 6.0
        K = Q @ np.linalg.solve(R, Q.T)
        sw = np.sqrt(w)
        M = K / np.outer(sw, sw)
        M = (M + M.T) / 2.0
        d, U = np.linalg.eigh(M)
        self.d = np.clip(d, 0.0, None)
        self.U = U
        self.sw = sw
        self.z = U.T @ (sw * ybar)
        self.ybar = ybar
        self.w = w

    def shrink(self, lam):
        return 1.0 / (1.0 + lam * self.d)

    def df(self, lam):
        return float(np.sum(self.shrink(lam)))

    def fitted(self, lam):
        return (self.U @ (self.shrink(lam) * self.z)) / self.sw

    def leverages(self, lam):
        return (self.U ** 2) @ self.shrink(lam)


def smoothing_spline(x, y, *, df=None, curve_points=CURVE_POINTS):
    """Natural cubic smoothing spline of y on x (module docstring):
    lambda by GCV, or the one giving `df` equivalent degrees of
    freedom. x, y: the points (replicates as separate points)."""
    x, y = _clean(x, y)
    ux, ybar, w = collapse_ties(x, y)
    n, N = len(ux), len(x)
    if n < 4:
        raise SmoothError(f"A smoothing spline needs at least 4 distinct X values ({n} here).")
    if n > MAX_SPLINE_X:
        raise SmoothError(
            f"A smoothing spline here takes at most {MAX_SPLINE_X} distinct X values "
            f"({n} here); use LOWESS for a longer series.")
    span = float(ux[-1] - ux[0])
    t = (ux - ux[0]) / span
    model = _Reinsch(t, ybar, w)
    within = float(np.sum((y - ybar[np.searchsorted(ux, x)]) ** 2))
    dpos = model.d[model.d > 1e-12 * max(model.d.max(), 1.0)]
    lo, hi = math.log(1e-6 / dpos.max()), math.log(1e6 / dpos.min())

    def rss_full(lam):
        g = model.fitted(lam)
        return within + float(np.sum(w * (ybar - g) ** 2))

    def gcv(lam):
        k = model.df(lam)
        return (rss_full(lam) / N) / (1.0 - k / N) ** 2 if k < N else math.inf

    notes = []
    if df is not None:
        df = float(df)
        if not 2.0 < df < n:
            raise SmoothError(
                f"Choose degrees of freedom more than 2 and less than the {n} distinct X values.")
        # df(lambda) falls from n to 2 as lambda grows
        lam = math.exp(brentq(lambda s: model.df(math.exp(s)) - df, lo - 20, hi + 20,
                              xtol=1e-12, rtol=1e-14, maxiter=500))
        chosen = "df"
        boundary = False
    else:
        if N - 2 < 1:
            raise SmoothError("GCV needs more points than 2.")
        grid = np.linspace(lo, hi, 241)
        vals = np.array([gcv(math.exp(s)) for s in grid])
        k = int(np.argmin(vals))
        a, b = grid[max(k - 1, 0)], grid[min(k + 1, len(grid) - 1)]
        r = minimize_scalar(lambda s: gcv(math.exp(s)), bounds=(a, b), method="bounded",
                            options={"xatol": 1e-10})
        lam = math.exp(r.x if r.fun <= vals[k] else grid[k])
        chosen = "gcv"
        boundary = k in (0, len(grid) - 1)
        if boundary:
            notes.append("GCV chose the edge of the search range: the curve is close to "
                         + ("interpolating every point." if k == 0 else "a straight line."))
    g = model.fitted(lam)
    edf = model.df(lam)
    pen = float(np.sum(w * (ybar - g) ** 2))
    rss = within + pen
    spline = CubicSpline(ux, g, bc_type="natural")
    grid_x = np.union1d(np.linspace(ux[0], ux[-1], int(curve_points)), ux)
    return {
        "x": ux.tolist(), "y_mean": ybar.tolist(), "weights": w.tolist(),
        "fitted": g.tolist(),
        "leverages": model.leverages(lam).tolist(),
        "curve": {"x": grid_x.tolist(), "y": spline(grid_x).tolist()},
        "n": int(N), "n_x": int(n),
        "lambda": float(lam), "df": edf, "chosen_by": chosen,
        "gcv": (rss / N) / (1.0 - edf / N) ** 2 if edf < N else None,
        "penalized_rss": pen, "rss": rss,
        "residual_sd": math.sqrt(rss / (N - edf)) if N - edf > 0 else None,
        "at_boundary": boundary,
        "notes": notes,
    }


# ------------------------------------------------------------ the XY analysis

def _interpolant(kind, ux, ybar):
    if kind == "natural_spline":
        return CubicSpline(ux, ybar, bc_type="natural")
    if kind == "pchip":
        return PchipInterpolator(ux, ybar, extrapolate=False)
    return lambda v: np.interp(v, ux, ybar)


def fit_smooth(x, y, method="lowess", *, span=2.0 / 3.0, iterations=3,
               delta=None, df=None, curve_points=CURVE_POINTS):
    """One data set's curve. x, y: every point (replicates as separate
    points; missing values dropped). Returns the curve, the fitted value
    at each distinct X and the method's own numbers."""
    if method not in METHODS:
        raise SmoothError(f"unknown smoothing method: {method}")
    x, y = _clean(x, y)
    if len(x) == 0:
        raise SmoothError("No points with both X and Y.")
    ux, ybar, cnt = collapse_ties(x, y)
    n_x = len(ux)
    if n_x < 2:
        raise SmoothError("A curve needs at least 2 distinct X values.")
    out = {"method": method, "label": LABELS[method], "n": int(len(x)),
           "n_x": int(n_x), "interpolating": method in INTERPOLATING,
           "no_model_ci": True, "notes": []}
    if method == "lowess":
        order = np.argsort(x, kind="stable")
        xs, ys = x[order], y[order]
        d = 0.01 * float(xs[-1] - xs[0]) if delta is None else float(delta)
        if not 0.0 < span <= 1.0:
            raise SmoothError("The LOWESS span must be more than 0 and at most 1.")
        fit = lowess_sorted(xs, ys, float(span), int(iterations), d)
        # tied X get the same value: one per distinct X
        idx = np.searchsorted(xs, ux)
        g = fit[idx]
        rss = float(np.sum((ys - fit) ** 2))
        ns = max(2, min(len(x), int(span * len(x) + 1e-7)))
        out.update(x=ux.tolist(), y_mean=ybar.tolist(), fitted=g.tolist(),
                   curve={"x": ux.tolist(), "y": g.tolist()},
                   span=float(span), iterations=int(iterations), delta=d,
                   points_per_fit=int(ns), rss=rss)
        if ns < 4:
            out["notes"].append(
                f"Each local fit uses only {ns} points: widen the span for a steadier curve.")
        return out
    if method == "smoothing_spline":
        s = smoothing_spline(x, y, df=df, curve_points=curve_points)
        out["notes"].extend(s.pop("notes"))
        out.update(s)
        return out
    if method == "natural_spline" and n_x < 3:
        out["notes"].append("With 2 points the natural spline is the straight line between them.")
    f = _interpolant(method, ux, ybar)
    grid_x = np.union1d(np.linspace(ux[0], ux[-1], int(curve_points)), ux)
    out.update(x=ux.tolist(), y_mean=ybar.tolist(), fitted=ybar.tolist(),
               curve={"x": grid_x.tolist(), "y": np.asarray(f(grid_x), float).tolist()},
               rss=float(np.sum((y - ybar[np.searchsorted(ux, x)]) ** 2)))
    if np.any(cnt > 1):
        out["notes"].append("The curve passes through the mean Y at each X.")
    return out


# ------------------------------------------------------------ curve operations

CURVE_OPS = ("smooth", "derivative", "integral")


def curve_operation(x, y, op, *, neighbours=2, order=2):
    """Smooth (Savitzky-Golay), differentiate or integrate one curve.
    x, y: one value per row (None for missing). Rows with the same X are
    averaged first. Returns {"x", "y"} in increasing X, plus notes."""
    if op not in CURVE_OPS:
        raise SmoothError(f"unknown curve operation: {op}")
    xa, ya = _clean(x, y)
    if len(xa) == 0:
        raise SmoothError("No rows with both X and Y.")
    ux, ybar, cnt = collapse_ties(xa, ya)
    n = len(ux)
    notes = []
    if np.any(cnt > 1):
        notes.append("Rows with the same X were averaged first.")
    if op == "smooth":
        k = int(neighbours)
        order = int(order)
        if k < 1:
            raise SmoothError("Average at least 1 neighbour on each side.")
        if order < 0 or order >= 2 * k + 1:
            raise SmoothError(
                f"The polynomial order must be from 0 to {2 * k} for {k} neighbours on each side.")
        win = 2 * k + 1
        if n < win:
            raise SmoothError(
                f"Smoothing over {win} points needs at least {win} distinct X values ({n} here).")
        if n > 2:
            step = np.diff(ux)
            if np.ptp(step) > 1e-6 * np.mean(step):
                notes.append("The X values are not equally spaced; Savitzky-Golay smoothing "
                             "treats them as if they were.")
        from scipy.signal import savgol_filter
        out = savgol_filter(ybar, win, order, mode="interp")
    elif op == "derivative":
        if n < 2:
            raise SmoothError("A derivative needs at least 2 distinct X values.")
        out = np.gradient(ybar, ux, edge_order=1)
    else:
        if n < 1:
            raise SmoothError("No rows to integrate.")
        out = np.concatenate([[0.0], np.cumsum(np.diff(ux) * (ybar[1:] + ybar[:-1]) / 2.0)])
    return {"x": ux.tolist(), "y": np.asarray(out, float).tolist(), "notes": notes}


# ------------------------------------------------------------ standard curves

class InterpolatingCurve:
    """A curve through the mean signal of each standard level, for the
    standard-curve assay: natural cubic spline or point to point, read
    only within the standards (never extrapolated). inverse(y) lists the
    X values where the curve reads y."""

    def __init__(self, kind, x, y):
        self.kind = kind
        ux, ybar, _ = collapse_ties(np.asarray(x, float), np.asarray(y, float))
        if len(ux) < 2:
            raise SmoothError("need standards at two or more concentrations")
        self.x, self.y = ux, ybar
        self.lo, self.hi = float(ux[0]), float(ux[-1])
        if kind == "spline":
            self._f = CubicSpline(ux, ybar, bc_type="natural")
        elif kind == "point_to_point":
            self._f = None
        else:
            raise SmoothError(f"unknown interpolating curve: {kind}")
        grid = np.union1d(np.linspace(self.lo, self.hi, 2001), ux)
        g = self(grid)
        self.y_range = (float(g.min()), float(g.max()))
        self.increasing = float(ybar[-1]) >= float(ybar[0])
        dg = np.diff(g)
        self.monotone = bool(np.all(dg >= 0) or np.all(dg <= 0))

    def __call__(self, v):
        v = np.asarray(v, float)
        if self._f is None:
            return np.interp(v, self.x, self.y)
        return self._f(v)

    def inverse(self, yv):
        """Every X in [lo, hi] where the curve equals yv (sorted)."""
        if self._f is None:
            roots = []
            for i in range(len(self.x) - 1):
                a, b = self.y[i] - yv, self.y[i + 1] - yv
                if a == 0.0:
                    roots.append(float(self.x[i]))
                elif a * b < 0:
                    roots.append(float(self.x[i] + (self.x[i + 1] - self.x[i]) * a / (a - b)))
            if self.y[-1] == yv:
                roots.append(float(self.x[-1]))
        else:
            roots = [float(r) for r in self._f.solve(yv, extrapolate=False)
                     if self.lo - 1e-12 <= r <= self.hi + 1e-12]
        out = []
        for r in sorted(roots):
            if not out or abs(r - out[-1]) > 1e-9 * max(1.0, abs(r)):
                out.append(min(max(r, self.lo), self.hi))
        return out
