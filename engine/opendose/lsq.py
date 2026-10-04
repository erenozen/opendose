"""Least-squares solver settings and scale-aware finite differences.

Every nonlinear least-squares fit in the engine (nlfit, globalfit,
equations.fit_global_model, schild) goes through ``solve`` and builds its
covariance with ``covariance_jacobian``. Two numerical rules live here.

Convergence tolerance
---------------------
``ftol = xtol = gtol = 1e-12`` (scipy's default 1e-8 stops when the SS
improves by less than 1e-8 relative, which leaves parameters 1e-7..1e-4
short of the optimum on the NIST StRD problems).

Finite-difference steps (the scale rule)
----------------------------------------
For parameter i the step is

    h_i = c * max(|p_i|, s_i),
    s_i = max(|p0_i|, d_i),

where p_i is the current value, p0_i the start value of the fit, and d_i
a data-derived scale for the parameter's role (0 when the role is
unknown):

* Y-like (Top, Bottom, Plateau, Bmax, Vmax, Y0, NS, amplitudes,
  intercepts, ...): the Y range, max(Y) - min(Y) (max |Y| if that is 0);
* X-like (LogEC50, EC50, Km, Kd, Ki, X0, Lag, centres, widths, ...): the
  median of the nonzero |X| (a typical X magnitude, which follows the X
  units and, unlike the X range, stays close to a concentration's own
  size when the doses span several decades);
* slopes (HillSlope, nH, h, SchildSlope): 1;
* rate constants (K, KFast, KSlow, Koff, MuMax, ...): 1 / (the X scale);
* dY/dX slopes (Slope, Slope1, ...): Y range / X range;
* polynomial coefficients B0, B1, ... of X^k: Y range / (X scale)^k;
* fractions 1, percentages 100.

Only when |p_i|, |p0_i| and d_i are all zero does s_i fall back to 1.
The rule is unit-consistent: rescaling X (molar -> nM) rescales the X
scale, the start values and the parameters by the same factor, so the
relative step of every parameter is unchanged and the same fit in M and
in nM gives the same EC50 and the same SE(EC50)/EC50. It never collapses
for a parameter that sits at 0 (Bottom = 0, LogEC50 = 0), where a purely
relative step would. (scipy's default step, 1.5e-8 * max(1, |p|), is
unit-dependent: a parameter far below 1, such as an EC50 in molar or NIST
Hahn1's b7 = -1.2e-7, gets a step that is huge relative to it.)

c = sqrt(eps) (forward differences) for the optimiser's Jacobian, passed
to ``least_squares`` as a callable ``jac`` so the iterations see the same
scale-aware step (this is what lets NIST Hahn1 converge). The covariance
at the solution uses c = cbrt(eps) with central differences, Richardson-
extrapolated once (h and h/2): truncation O(h^4), so a scale s_i that is
much larger than the parameter (a far-away start) costs no accuracy. Near
a range constraint the step is taken away from the bound.

Gradients of derived quantities (delta-method SEs of transforms,
confidence and prediction bands, interpolation) use central differences
with h_i = cbrt(eps) * max(|p_i|, SE_i), SE_i from the covariance
("param_gradient"), replacing the old max(1e-6 |p_i|, 1e-8), whose
absolute floor was 10 % of an EC50 of 1e-7 M.
"""

from __future__ import annotations

import math
import re
import time

import numpy as np
from scipy.optimize import least_squares

EPS = float(np.finfo(float).eps)
SQRT_EPS = math.sqrt(EPS)
CBRT_EPS = EPS ** (1.0 / 3.0)

#: solver tolerances shared by every fit
TOL = {"ftol": 1e-12, "xtol": 1e-12, "gtol": 1e-12}


# ------------------------------------------------------------- roles

_Y = {"Top", "Bottom", "Y0", "Ymax", "Vmax", "NS", "Basal", "Effectmax",
      "Baseline", "Background", "YM", "Ym", "Dip", "Span", "Yintercept",
      "Ycross", "Vo", "Plateau", "Bmax"}
_Y_PREFIX = ("Plateau", "Bmax", "Amplitude", "Intercept", "Top", "Bottom")
_X = {"LogXmid", "Km", "Ki", "KA", "KB", "X0", "XMean", "Lag", "Xcross",
      "Mean", "Mean1", "Mean2", "SD", "SD1", "SD2", "Time0", "Te", "Tm",
      "V50", "Khalf", "GeoMean", "AlphaKi", "Wavelength", "Center", "Width"}
_X_PREFIX = ("Log", "EC50", "IC50", "Kd", "Ki", "Center", "Width",
             "AbsoluteIC50", "ECF")
_SLOPE = {"HillSlope", "h", "nH", "nH1", "nH2", "SchildSlope", "n"}
_RATE = {"K", "KFast", "KSlow", "KMedium", "Koff", "MuMax", "K1", "K2", "K3",
         "K4"}
_FRACTION = {"Frac", "FracHi", "FractionHi", "Fraction"}
_PERCENT = {"PercentFast", "PercentSlow"}


def role_of(name: str) -> str | None:
    """Role of a parameter from its (Prism) name, or None."""
    if name in _SLOPE:
        return "slope"
    if name in _RATE:
        return "rate"
    if name in _FRACTION:
        return "fraction"
    if name in _PERCENT:
        return "percent"
    if name in _Y or name.startswith(_Y_PREFIX):
        return "y"
    if name in _X or name.startswith(_X_PREFIX) or re.fullmatch(
            r"(Log)?(EC|IC)50.*", name):
        return "x"
    if re.fullmatch(r"Slope\d*", name):
        return "yx"
    m = re.fullmatch(r"B(\d)", name)  # polynomial coefficient of X^k
    if m:
        return f"poly{m.group(1)}"
    return None


def data_scales(x, y) -> dict:
    """Scale of each role for one data set (or the pooled data)."""
    x = np.asarray(x, dtype=float).ravel()
    y = np.asarray(y, dtype=float).ravel()
    x = x[np.isfinite(x)]
    y = y[np.isfinite(y)]
    xs = 0.0
    if x.size:
        nz = np.abs(x[x != 0])
        xs = float(np.median(nz)) if nz.size else 0.0
        if xs == 0.0:
            xs = float(np.max(x) - np.min(x))
    xr = float(np.max(x) - np.min(x)) if x.size else 0.0
    ys = 0.0
    if y.size:
        ys = float(np.max(y) - np.min(y))
        if ys == 0.0:
            ys = float(np.max(np.abs(y)))
    out = {"x": xs, "y": ys, "slope": 1.0, "fraction": 1.0, "percent": 100.0,
           "rate": (1.0 / xs) if xs > 0 else 0.0,
           "yx": (ys / xr) if xr > 0 else 0.0}
    for k in range(10):
        out[f"poly{k}"] = ys / xs ** k if xs > 0 else 0.0
    return out


def scale_floor(names, p0, x=None, y=None, roles=None) -> np.ndarray:
    """s_i = max(|p0_i|, d_i) of the module docstring (see there).

    names: parameter names (one per entry of p0); roles: optional
    name -> role overrides (ModelSpec.param_roles); x, y: the fitted
    data (None when no data scale applies)."""
    p0 = np.abs(np.asarray(p0, dtype=float))
    sc = data_scales(x, y) if x is not None and y is not None else {}
    out = np.empty(len(names))
    for i, n in enumerate(names):
        role = (roles or {}).get(n) or role_of(n)
        d = sc.get(role, 0.0) if role else 0.0
        v = p0[i] if np.isfinite(p0[i]) else 0.0
        out[i] = max(v, d if np.isfinite(d) else 0.0)
    return out


def steps(p, floor, c) -> np.ndarray:
    """h_i = c * max(|p_i|, s_i), with s_i -> 1 only when everything is 0."""
    p = np.asarray(p, dtype=float)
    base = np.maximum(np.abs(p), floor)
    base = np.where(base > 0, base, 1.0)
    return c * base


def _direction(p, h, box):
    """+1, or -1 where a forward step would leave the box."""
    sign = np.ones_like(h)
    if box is not None:
        lo, hi = box
        over = p + h > hi
        sign = np.where(over & (p - h >= lo), -1.0, sign)
    return sign


# ------------------------------------------------------ Jacobians

def forward_jacobian(fun, p, floor, f0=None, box=None):
    """Forward-difference Jacobian with the scale-aware step."""
    p = np.asarray(p, dtype=float)
    if f0 is None:
        f0 = np.asarray(fun(p), dtype=float)
    h = steps(p, floor, SQRT_EPS) * _direction(p, steps(p, floor, SQRT_EPS),
                                                box)
    J = np.empty((f0.size, p.size))
    for j in range(p.size):
        q = p.copy()
        q[j] = p[j] + h[j]
        dh = q[j] - p[j]  # the step actually representable
        with np.errstate(all="ignore"):
            fj = np.asarray(fun(q), dtype=float)
        if not np.all(np.isfinite(fj)):  # try the other side
            q[j] = p[j] - h[j]
            dh = q[j] - p[j]
            with np.errstate(all="ignore"):
                fj = np.asarray(fun(q), dtype=float)
        J[:, j] = (fj - f0) / dh
    return J


def _central(fun, p, j, h):
    up, dn = p.copy(), p.copy()
    up[j] = p[j] + h
    dn[j] = p[j] - h
    with np.errstate(all="ignore"):
        fu = np.asarray(fun(up), dtype=float)
        fd = np.asarray(fun(dn), dtype=float)
    return (fu - fd) / (up[j] - dn[j])


#: step ladder of the covariance Jacobian: cbrt(eps) * 2^k, k = 7..-1
#: (2^7 cbrt(eps) ~ eps^(1/5), the optimal step of a Richardson-
#: extrapolated central difference when the scale is the curvature scale)
_LADDER = tuple(2.0 ** k for k in range(7, -2, -1))


def covariance_jacobian(fun, p, floor, box=None, adaptive=True):
    """Jacobian at the solution for the covariance.

    Central differences with h_i = cbrt(eps) * max(|p_i|, s_i),
    Richardson-extrapolated over h and h/2 (truncation O(h^4)). With
    adaptive=True (the covariance) the base step runs down the ladder
    cbrt(eps) * max(|p_i|, s_i) * 2^k, k = 7..-1, and the column whose
    successive Richardson estimates agree best is kept: large steps win
    when rounding dominates (ill-conditioned problems such as NIST
    Lanczos3 need derivatives good to ~1e-12), small ones when the scale
    s_i is much larger than the curvature scale (a far-away start). Falls
    back to a one-sided second-order difference where a central one is
    not finite or would cross a range constraint."""
    p = np.asarray(p, dtype=float)
    with np.errstate(all="ignore"):
        f0 = np.asarray(fun(p), dtype=float)
    h = steps(p, floor, CBRT_EPS)
    J = np.empty((f0.size, p.size))
    ladder = _LADDER if adaptive else (1.0,)
    for j in range(p.size):
        col = None
        hs = [h[j] * m for m in ladder]
        if box is not None:
            lo, hi = box
            hs = [v for v in hs if p[j] - v >= lo[j] and p[j] + v <= hi[j]]
        if hs:
            # D(h) for the ladder and its half steps, then Richardson
            ds = {}

            def d(v):
                if v not in ds:
                    ds[v] = _central(fun, p, j, v)
                return ds[v]
            rich = [(4.0 * d(v / 2) - d(v)) / 3.0 for v in hs]
            rich = [r for r in rich if np.all(np.isfinite(r))]
            if len(rich) == 1:
                col = rich[0]
            elif rich:
                best, err = None, math.inf
                for r1, r2 in zip(rich[:-1], rich[1:]):
                    e = float(np.max(np.abs(r1 - r2))) / (
                        float(np.max(np.abs(r2))) + 1e-300)
                    if e < err:
                        best, err = r2, e
                col = best
        if col is None:  # one-sided, second order: (-3f0 + 4f1 - f2)/2h
            s = 1.0
            if box is not None and p[j] + 2 * h[j] > box[1][j]:
                s = -1.0
            q1, q2 = p.copy(), p.copy()
            q1[j] = p[j] + s * h[j]
            q2[j] = p[j] + 2 * s * h[j]
            with np.errstate(all="ignore"):
                f1 = np.asarray(fun(q1), dtype=float)
                f2 = np.asarray(fun(q2), dtype=float)
            col = (-3.0 * f0 + 4.0 * f1 - f2) / (2.0 * (q1[j] - p[j]))
        J[:, j] = col
    return J


def covariance(J, s2):
    """(J'J)^-1 * s2, NaN-filled when J'J is singular or not finite.

    Computed from the QR factorisation of the column-scaled Jacobian,
    J D^-1 = Q R (D = column norms): (J'J)^-1 = D^-1 R^-1 R^-T D^-1.
    Forming J'J squares the condition number; for an ill-conditioned
    but well-determined fit (a 10th-order polynomial in raw powers,
    NIST Filip, where cond(J'J) ~ 1e15 before scaling) the explicit
    inverse loses every digit while the QR route keeps the certified
    standard errors to 1e-7. Rank deficiency (a zero column, or R with
    a pivot below k * eps of the largest) gives NaN, as the singular
    inverse did."""
    k = J.shape[1]
    if not np.all(np.isfinite(J)):
        return np.full((k, k), np.nan)
    norms = np.linalg.norm(J, axis=0)
    if k == 0:
        return np.zeros((0, 0))
    if np.any(norms == 0):
        return np.full((k, k), np.nan)
    try:
        r = np.linalg.qr(J / norms, mode="r")
        d = np.abs(np.diag(r))
        if not np.all(np.isfinite(d)) or d.min() <= max(J.shape) * EPS * d.max():
            return np.full((k, k), np.nan)
        rinv = np.linalg.solve(r, np.eye(k))
        cov = (rinv @ rinv.T) / np.outer(norms, norms)
    except np.linalg.LinAlgError:
        return np.full((k, k), np.nan)
    return cov * s2


# ------------------------------------------------------------ solver

class BudgetExhausted(Exception):
    """Raised from inside a residual evaluation when the fit's Budget is
    spent; the start being solved is abandoned (it has not converged)."""


class Budget:
    """Evaluation and wall-clock budget shared by the starts of one fit.

    Every residual evaluation (the optimiser's own and each column of its
    forward-difference Jacobian) is charged. ``soft`` limits are checked
    between starts (the caller stops starting new ones once it has a
    converged fit); ``hard`` limits interrupt the start being solved
    (BudgetExhausted). The evaluation counts make the cut deterministic
    on any machine; the seconds are a safety net for a slow machine and
    only bind on fits that cannot converge (e.g. a sigmoid fitted to a
    straight line), so they do not change ordinary results.
    """

    def __init__(self, soft_evals=None, hard_evals=None, soft_seconds=None,
                 hard_seconds=None):
        self.soft_evals, self.hard_evals = soft_evals, hard_evals
        self.soft_seconds, self.hard_seconds = soft_seconds, hard_seconds
        self.evals = 0
        self.t0 = time.perf_counter()

    def elapsed(self) -> float:
        return time.perf_counter() - self.t0

    def soft_exceeded(self) -> bool:
        return ((self.soft_evals is not None and self.evals >= self.soft_evals)
                or (self.soft_seconds is not None
                    and self.elapsed() >= self.soft_seconds)
                or self.hard_exceeded())

    def hard_exceeded(self) -> bool:
        return ((self.hard_evals is not None and self.evals >= self.hard_evals)
                or (self.hard_seconds is not None
                    and self.elapsed() >= self.hard_seconds))

    def charge(self, n: int = 1) -> None:
        self.evals += n
        if self.hard_exceeded():
            raise BudgetExhausted


def solve(fun, p0, floor, *, box=None, max_nfev=20000, budget=None,
          jac_fun=None, **kw):
    """least_squares with the shared tolerances and the scale-aware
    forward-difference Jacobian; Levenberg-Marquardt, or the bounded
    trust-region method when box = (lo, hi) is given. With a Budget,
    every evaluation is charged to it and BudgetExhausted propagates
    when its hard limit is reached."""
    p0 = np.asarray(p0, dtype=float)
    last = {}
    if budget is not None:
        raw = fun

        def fun(p):
            budget.charge()
            return raw(p)

    def cached(p):
        f = np.asarray(fun(p), dtype=float)
        last["x"], last["f"] = np.array(p, dtype=float), f
        return f

    def jac(p):
        if jac_fun is not None:  # analytic
            return np.asarray(jac_fun(p), dtype=float)
        f0 = last["f"] if "x" in last and np.array_equal(last["x"], p) \
            else None
        return forward_jacobian(fun, p, floor, f0=f0, box=box)

    opts = dict(TOL, max_nfev=max_nfev, jac=jac)
    opts.update(kw)
    if box is None:
        # x_scale="jac" (MINPACK's adaptive column scaling) explicitly:
        # scipy < 1.16, as Pyodide may ship, defaulted to x_scale = 1
        return least_squares(cached, p0, method="lm", x_scale="jac", **opts)
    return least_squares(cached, p0, method="trf", bounds=box, x_scale="jac",
                         **opts)


def polish(fun, p, floor, box=None, max_iter=40, jac=None):
    """Gauss-Newton refinement from a converged solution with the
    adaptive central-difference Jacobian (least-squares solve, not the
    normal equations), accepting only steps that do not raise the SS. Returns
    (p, J at p). Stops when the scaled step no longer contracts (the
    iteration converges linearly on large-residual problems). Removes the
    bias a forward-difference Jacobian leaves in the stationarity
    condition J'f = 0 and the last digits an SS-based stopping rule
    leaves on the table. The returned J is the adaptive covariance
    Jacobian, or jac(p) when an analytic Jacobian is given."""
    def jacobian(q):
        if jac is not None:
            return np.asarray(jac(q), dtype=float)
        return covariance_jacobian(fun, q, floor, box=box)

    p = np.asarray(p, dtype=float).copy()
    with np.errstate(all="ignore"):
        f = np.asarray(fun(p), dtype=float)
    ss = float(f @ f)
    # the Jacobian is rebuilt after every step larger than 1e-10 (scaled);
    # smaller steps reuse it (chord iteration), and it is rebuilt at the
    # final point for the covariance
    J = jacobian(p)
    if not (np.isfinite(ss) and np.all(np.isfinite(J))):
        return p, J
    p_start = p.copy()
    prev = math.inf
    for _ in range(max_iter):
        try:
            step = np.linalg.lstsq(J, -f, rcond=None)[0]
        except np.linalg.LinAlgError:
            break
        if not np.all(np.isfinite(step)):
            break
        size = float(np.max(np.abs(step) / steps(p, floor, 1.0)))
        if size >= prev:  # not contracting any more: at the optimum
            break
        q = p + step
        if box is not None:
            q = np.clip(q, box[0], box[1])
        with np.errstate(all="ignore"):
            fq = np.asarray(fun(q), dtype=float)
        ssq = float(fq @ fq)
        # near the optimum the SS is flat to its rounding noise (which is
        # far above eps when the residuals are small differences of large
        # numbers), so the SS cannot referee steps of 1e-8 relative; the
        # steps' contraction does, and the SS only guards against a
        # genuine increase
        if not np.isfinite(ssq) or ssq > ss * (1.0 + 1e-10):
            break
        p, f, ss, prev = q, fq, min(ss, ssq), size
        if size <= 2 * EPS:
            break
        if size > 1e-10:  # a real move: the Jacobian has changed
            J = jacobian(p)
            p_start = p.copy()
    if np.array_equal(p, p_start):
        return p, J
    return p, jacobian(p)


def same_point(new, old, floor, rtol=1e-10) -> bool:
    """Fixed-point test of the reweighting (IRLS) loops: every parameter
    moved by at most rtol * max(|p_i|, s_i) (scale-aware, so the test does
    not depend on the units of X or Y)."""
    new = np.asarray(new, dtype=float)
    old = np.asarray(old, dtype=float)
    return bool(np.all(np.abs(new - old)
                       <= rtol * np.maximum(np.abs(old), floor)))


def rank_deficient(J, rtol=None) -> bool:
    """True when the Jacobian's columns are (numerically) dependent."""
    if J.size == 0 or not np.all(np.isfinite(J)):
        return True
    # column-scaled so that units do not matter
    norms = np.linalg.norm(J, axis=0)
    if np.any(norms == 0):
        return True
    sv = np.linalg.svd(J / norms, compute_uv=False)
    tol = rtol if rtol is not None else max(J.shape) * EPS * 1e3
    return bool(sv[-1] <= tol * sv[0])


def param_gradient(fn, base: dict, names, cov=None, index=None):
    """Central-difference gradient of fn(params dict) with respect to
    names, h_i = cbrt(eps) * max(|p_i|, SE_i) (SE_i = sqrt of the
    covariance diagonal; index maps a name to its row when given). fn may
    return a scalar or an array; the result has the names last."""
    out = []
    for j, n in enumerate(names):
        se = 0.0
        if cov is not None:
            k = index[n] if index is not None else j
            v = float(np.asarray(cov)[k, k])
            se = math.sqrt(v) if math.isfinite(v) and v > 0 else 0.0
        scale = max(abs(float(base[n])), se)
        h = CBRT_EPS * (scale if scale > 0 else 1.0)
        up, dn = dict(base), dict(base)
        up[n] = base[n] + h
        dn[n] = base[n] - h
        with np.errstate(all="ignore"):
            out.append((np.asarray(fn(up), dtype=float)
                        - np.asarray(fn(dn), dtype=float))
                       / (up[n] - dn[n]))
    return np.stack(out, axis=-1) if out else np.zeros((0,))
