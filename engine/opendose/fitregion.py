"""Covariance and correlation of fitted parameters, and the joint
confidence region of two of them (FEATURE-PLAN P-102).

- Covariance: the fit's own asymptotic covariance s^2 (J'J)^-1 (nlfit,
  lsq.covariance), the matrix its standard errors are the square roots of
  the diagonal of; correlation r_ij = c_ij / sqrt(c_ii c_jj) (R's
  cov2cor).
- Joint region of two parameters (a, b) with the others re-optimised:
  the likelihood region for a parameter subset (Bates & Watts 1988,
  Nonlinear Regression Analysis and Its Applications, chapters 2 and 6,
  the "profile pair" regions of section 6.1; Seber & Wild 1989,
  Nonlinear Regression, chapter 5)

      { (a, b) : S~(a, b) <= S(theta^) [1 + 2 / (n - p) F(2, n - p; 0.95)] }

  where S~(a, b) is the (weighted) sum of squares minimised over the
  other free parameters with a and b held, n the points and p the free
  parameters. Its boundary is traced along rays from the estimate: each
  ray is scaled by the linear-approximation ellipse, so the search starts
  near the boundary, and the crossing is bracketed and found by Brent's
  method. The region is taken to be star-shaped about the estimate (true
  of the profile pair regions Bates & Watts draw). A ray that does not
  cross within RAY_MAX ellipse radii leaves the region open that way.
- The linear-approximation ellipse (Bates & Watts 1988, chapter 2;
  Draper & Smith 1998, chapter 24): (theta - theta^)' C_ab^-1 (theta -
  theta^) <= 2 F(2, n - p; 0.95), C_ab the 2 x 2 block of the covariance;
  drawn next to the likelihood region, where they differ the asymptotic
  CIs are not to be trusted.

R's nlstools::nlsContourRSS (the plan's reference) is not available
here; it draws Beale's region with the other parameters fixed at their
estimates, a slice of the p-dimensional region rather than this profile
region.
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats
from scipy.optimize import brentq

from . import nlfit

RAYS = 72                # directions around the estimate
RAY_MAX = 12.0           # in ellipse radii: past this the region is open
REFIT_NFEV = 20000
LEVEL = 0.95


def covariance_block(spec, cov) -> dict | None:
    """{"params" (display names), "matrix", "correlation"} of the fit's
    free parameters, from nlfit's "_cov"."""
    if not cov:
        return None
    names = [nlfit._display_name(spec, n) for n in cov["free_names"]]
    C = np.asarray(cov["matrix"], dtype=float)
    if C.size == 0:
        return None
    sd = np.sqrt(np.diag(C))
    with np.errstate(all="ignore"):
        R = C / np.outer(sd, sd)
    corr = [[(float(R[i, j]) if sd[i] > 0 and sd[j] > 0
              and math.isfinite(R[i, j]) else None)
             for j in range(len(names))] for i in range(len(names))]
    for i in range(len(names)):
        if corr[i][i] is not None:
            corr[i][i] = 1.0
    return {"params": names,
            "matrix": [[float(v) if math.isfinite(v) else None for v in row]
                       for row in C],
            "correlation": corr}


def _ss_fixed(setup, p, weighting, weight_source):
    """The fit's (weighted) sum of squares at parameters p, nothing free
    (a model with two free parameters): weights as the fit computes them."""
    spec, x, y, summary = (setup["spec"], setup["x"], setup["y"],
                           setup["summary"])
    with np.errstate(all="ignore"):
        f = np.asarray(spec.func(x, p), dtype=float)
    if summary is not None:
        ybase = (summary["mean_y"] if weight_source == "observed_mean"
                 else f if nlfit.y_weighted(weighting) else x)
        w = nlfit._replicate_weights(x, ybase, weighting, summary)
        return float(np.sum(w * summary["counts"] * (y - f) ** 2)
                     + np.sum(w * summary["within"]))
    if weighting == "none":
        w = np.ones_like(y)
    elif not nlfit.y_weighted(weighting):
        w = nlfit._weights(x, x, weighting)
    elif weight_source == "observed_mean":
        w = nlfit._weights(x, nlfit._replicate_mean_y(x, y), weighting)
    else:
        w = nlfit._weights(x, f, weighting)
    return float(np.sum(w * (y - f) ** 2))


class JointRegion:
    """The joint confidence region of parameters a and b of a fit.
    steps() yields the rays traced so far and returns the region."""

    def __init__(self, setup, fitted, cov, a, b, *, weighting="none",
                 weight_source="predicted", ss_min=None, level=LEVEL,
                 rays=RAYS):
        spec = setup["spec"]
        self.setup, self.spec = setup, spec
        self.weighting, self.weight_source = weighting, weight_source
        ka, kb = nlfit._param_key(spec, a), nlfit._param_key(spec, b)
        free = list(setup["free_names"])
        for name, key in ((a, ka), (b, kb)):
            if key not in spec.params:
                raise ValueError(f"unknown parameter: {name}")
            if key not in free:
                raise ValueError(f"{name} is held constant, so it has no "
                                 "confidence region")
        if ka == kb:
            raise ValueError("choose two different parameters")
        self.names = (nlfit._display_name(spec, ka),
                      nlfit._display_name(spec, kb))
        self.keys = (ka, kb)
        self.others = [n for n in free if n not in (ka, kb)]
        self.fitted = {k: float(v) for k, v in fitted.items()}
        self.center = np.array([self.fitted[ka], self.fitted[kb]])
        idx = [cov["free_names"].index(ka), cov["free_names"].index(kb)]
        C = np.asarray(cov["matrix"], dtype=float)[np.ix_(idx, idx)]
        if not np.all(np.isfinite(C)):
            raise ValueError("the covariance of these parameters cannot be "
                             "computed (an ambiguous fit)")
        try:
            self.L = np.linalg.cholesky(C)
        except np.linalg.LinAlgError:
            raise ValueError("these two parameters are not determined "
                             "separately (their covariance is singular)")
        n, p = setup["n_points"], len(free)
        self.df = n - p
        self.level = level
        self.f_crit = float(stats.f.ppf(level, 2, self.df))
        if ss_min is None:
            ss_min = self._profile(self.center, None)[0]
        self.ss_min = float(ss_min)
        self.threshold = self.ss_min * (1.0 + 2.0 / self.df * self.f_crit)
        self.radius = math.sqrt(2.0 * self.f_crit)
        self.rays = int(rays)
        self.refits = 0

    def _point(self, angle, r):
        u = np.array([math.cos(angle), math.sin(angle)])
        return self.center + r * self.radius * (self.L @ u)

    def _inside_ranges(self, ab):
        bounds = self.spec.bounds or {}
        for key, v in zip(self.keys, ab):
            lo, hi = bounds.get(key, (None, None))
            if (lo is not None and v < lo) or (hi is not None and v > hi):
                return False
        return True

    def _profile(self, ab, start):
        """(S~(a, b), the others' values) with a, b held at ab."""
        if not self._inside_ranges(ab):
            return math.inf, start
        fixed = dict(self.setup["fixed"])
        fixed.update({self.keys[0]: float(ab[0]), self.keys[1]: float(ab[1])})
        if not self.others:
            return _ss_fixed(self.setup, fixed, self.weighting,
                             self.weight_source), start
        p0 = start or {k: self.fitted[k] for k in self.others}
        self.refits += 1
        try:
            popt, _, wss = nlfit._ols_fit(
                self.spec, self.setup["x"], self.setup["y"], self.others,
                fixed, p0, self.weighting, self.weight_source,
                self.setup["summary"], with_cov=False,
                max_nfev=REFIT_NFEV)
        except (RuntimeError, ValueError, ArithmeticError,
                np.linalg.LinAlgError):
            return math.inf, start
        if not np.all(np.isfinite(popt)) or not math.isfinite(wss):
            return math.inf, start
        return float(wss), dict(zip(self.others, map(float, popt)))

    def _ray(self, angle):
        """Ellipse radii to the boundary along `angle`, or None (open)."""
        start = None

        def g(r):
            nonlocal start
            ss, got = self._profile(self._point(angle, r), start)
            if got is not None and math.isfinite(ss):
                start = got
            return (ss - self.threshold) if math.isfinite(ss) else 1e300

        lo, hi = 0.0, 1.0
        g_hi = g(hi)
        if g_hi < 0:
            while g_hi < 0:
                lo, hi = hi, hi * 1.5
                if hi > RAY_MAX:
                    return None
                g_hi = g(hi)
        else:
            # shrink towards the estimate until inside (g(0) < 0)
            mid = hi
            for _ in range(30):
                mid /= 1.5
                if g(mid) < 0:
                    lo = mid
                    break
                hi = mid
            else:
                return 0.0
        return float(brentq(g, lo, hi, xtol=1e-5, rtol=1e-6, maxiter=60))

    def steps(self):
        angles = np.linspace(0.0, 2 * math.pi, self.rays, endpoint=False)
        radii = []
        for k, t in enumerate(angles):
            radii.append(self._ray(float(t)))
            if k + 1 < self.rays:
                yield k + 1
        return self._summary(angles, radii)

    def run(self):
        gen = self.steps()
        while True:
            try:
                next(gen)
            except StopIteration as stop:
                return stop.value

    def _summary(self, angles, radii):
        cx, cy = [], []
        for t, r in zip(angles, radii):
            if r is None:
                cx.append(None)
                cy.append(None)
            else:
                px, py = self._point(float(t), r)
                cx.append(float(px))
                cy.append(float(py))
        cx.append(cx[0])
        cy.append(cy[0])
        ex, ey = [], []
        for t in np.linspace(0.0, 2 * math.pi, 121):
            px, py = self._point(float(t), 1.0)
            ex.append(float(px))
            ey.append(float(py))
        return {"params": list(self.names), "level": self.level,
                "df": [2, self.df], "f_crit": self.f_crit,
                "ss_min": self.ss_min, "threshold": self.threshold,
                "estimate": [float(v) for v in self.center],
                "contour": {"x": cx, "y": cy},
                "ellipse": {"x": ex, "y": ey},
                "open": any(r is None for r in radii),
                "rays": self.rays, "refits": self.refits}
