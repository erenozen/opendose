"""Bootstrap confidence intervals for the parameters of a nonlinear fit
(FEATURE-PLAN P-101).

Methods implemented (B resamples, each refitted exactly as the original
fit: same model, weighting, constants and range constraints, the same
solver, started from the original estimates):

- Case resampling ("bootstrapping pairs"; Efron & Tibshirani 1993, An
  Introduction to the Bootstrap, section 9.5; Davison & Hinkley 1997,
  Bootstrap Methods and their Application, chapter 6, "resampling
  cases", and section 7.4 for nonlinear models): n (X, Y) points drawn
  with replacement from the n points fitted. Weights that depend on X
  or on the curve are recomputed for each resample, as the fit does.
- Residual resampling (Efron & Tibshirani 1993, section 9.4; Davison &
  Hinkley 1997, chapter 6; R's nlstools::nlsBoot, Baty et al. 2015,
  J Stat Softw 66(5)): Y*_i = fitted_i + e*_i, the e* drawn with
  replacement from the mean-centred residuals inflated by
  sqrt(n / (n - p)) for p free parameters, because fitted residuals are
  smaller than the errors (Davison & Hinkley 1997, chapter 6; nlsBoot
  only centres them, so its intervals are narrower by that factor). A
  weighted fit resamples the weighted residuals sqrt(w_j) e_j and puts
  each back on the scale of the point it lands on, e*_i = r_j /
  sqrt(w_i), with the weights of the final fit.
- Percentile interval (Efron & Tibshirani 1993, chapter 13): the
  (1 - level)/2 and (1 + level)/2 quantiles of the refitted values,
  interpolated linearly between order statistics (numpy's default; R's
  quantile type 7, which nlstools' summary uses).

Derived values (IC50 = 10^LogIC50, the model's transforms such as ECx
and ratios, Span, the absolute IC50) are recomputed from each resample's
parameters, so their intervals are percentile intervals too.

A resample whose refit fails (no convergence, a non-finite estimate, or
for case resampling fewer distinct X values than free parameters, which
cannot identify the model) is left out and counted; nlstools::nlsBoot
does the same. The resample indices are drawn up front from numpy's
PCG64 generator seeded with the user's seed, rng.integers(0, n, (B, n)),
so the same seed gives the same intervals whatever the chunking.
"""

from __future__ import annotations

import math

import numpy as np

from . import nlfit

METHODS = ("case", "residual")
MIN_RESAMPLES = 200
MAX_RESAMPLES = 10_000
DEFAULT_RESAMPLES = 2000
DEFAULT_SEED = 1
MAX_SEED = 2 ** 32 - 1
CHUNK = 20                 # refits between two progress reports
REFIT_NFEV = 2000          # solver evaluations per refit (nlfit multistart cap)
FAIL_WARN = 0.05           # share of failed refits that earns a caveat
FAIL_STOP = 0.5            # share of failed refits that withholds the CIs


def read_options(opt) -> dict:
    """options.bootstrap {method, resamples, seed} -> checked settings
    (defaults: case resampling, 2,000 resamples, seed 1)."""
    opt = dict(opt or {})
    method = opt.get("method", "case")
    if method not in METHODS:
        raise ValueError(f"unknown bootstrap method: {method} (choose case "
                         "or residual resampling)")
    b = opt.get("resamples", DEFAULT_RESAMPLES)
    if (not isinstance(b, (int, float)) or isinstance(b, bool)
            or b != int(b) or not MIN_RESAMPLES <= b <= MAX_RESAMPLES):
        raise ValueError(f"the number of bootstrap resamples must be a whole "
                         f"number from {MIN_RESAMPLES:,} to "
                         f"{MAX_RESAMPLES:,}")
    seed = opt.get("seed", DEFAULT_SEED)
    if seed is None:
        seed = DEFAULT_SEED
    if (not isinstance(seed, (int, float)) or isinstance(seed, bool)
            or seed != int(seed) or not 0 <= seed <= MAX_SEED):
        raise ValueError(f"the bootstrap seed must be a whole number from 0 "
                         f"to {MAX_SEED}")
    level = float(opt.get("ci_level", 0.95))
    if not 0.5 <= level < 1:
        raise ValueError("the bootstrap CI level must be from 50% to 99.9%")
    return {"method": method, "resamples": int(b), "seed": int(seed),
            "ci_level": level}


def _final_weights(setup, fitted, weighting, weight_source):
    """Weights of the final fit at each point (ones when unweighted)."""
    spec, x, y = setup["spec"], setup["x"], setup["y"]
    if weighting == "none":
        return np.ones_like(x, dtype=float)
    if not nlfit.y_weighted(weighting):
        return nlfit._weights(x, x, weighting)
    if weight_source == "observed_mean":
        return nlfit._weights(x, nlfit._replicate_mean_y(x, y), weighting)
    return nlfit._weights(x, spec.func(x, fitted), weighting)


def derived_values(spec, fitted, x, extra=None) -> dict:
    """name -> value of every derived row the fit reports, at the
    parameters `fitted` (the model's own names): spec.derived, the
    model's transforms, Span and the callables in `extra`."""
    out = {}
    if spec.derived:
        try:
            for name, entry in spec.derived(fitted, {}).items():
                out[name] = entry.get("value")
        except (ArithmeticError, ValueError, TypeError, KeyError):
            pass
    for tr in spec.transforms or []:
        fn = tr.fn
        if tr.uses_x:
            xs = np.asarray(x, dtype=float)
            fn = (lambda f: lambda q: f(q, xs))(tr.fn)
        out[tr.name] = nlfit._safe_value(fn, fitted)
    if "Top" in spec.params and "Bottom" in spec.params:
        out["Span"] = fitted["Top"] - fitted["Bottom"]
    for name, fn in (extra or {}).items():
        try:
            out[name] = fn(fitted)
        except (ArithmeticError, ValueError, TypeError, KeyError):
            out[name] = None
    return {k: (float(v) if v is not None and math.isfinite(float(v))
                else None) for k, v in out.items()}


def _quantiles(vals, level):
    a = (1.0 - level) / 2.0
    lo, hi = np.quantile(np.asarray(vals, float), [a, 1.0 - a])
    return [float(lo), float(hi)]


class FitBootstrap:
    """B refits of one fitted data set. steps() is a generator: it yields
    the number of resamples done after every CHUNK refits and returns the
    summary (see summary())."""

    def __init__(self, setup, fitted, *, weighting="none",
                 weight_source="predicted", method="case",
                 resamples=DEFAULT_RESAMPLES, seed=DEFAULT_SEED,
                 ci_level=0.95, extra=None):
        if setup["summary"] is not None:
            raise ValueError("bootstrap CIs need the individual values, not "
                             "mean / SD / n")
        if method not in METHODS:
            raise ValueError(f"unknown bootstrap method: {method}")
        self.setup = setup
        self.spec = setup["spec"]
        self.x = np.asarray(setup["x"], dtype=float)
        self.y = np.asarray(setup["y"], dtype=float)
        self.fixed = dict(setup["fixed"])
        self.free = list(setup["free_names"])
        self.fitted = {k: float(v) for k, v in fitted.items()}
        self.weighting = weighting
        self.weight_source = weight_source
        self.method = method
        self.B = int(resamples)
        self.seed = int(seed)
        self.level = float(ci_level)
        self.extra = extra or {}
        n = self.x.size
        rng = np.random.default_rng(self.seed)
        self.index = rng.integers(0, n, size=(self.B, n))
        if method == "residual":
            yhat = self.spec.func(self.x, self.fitted)
            w = _final_weights(setup, self.fitted, weighting, weight_source)
            self.sqrt_w = np.sqrt(w)
            r = self.sqrt_w * (self.y - yhat)
            # centred, then inflated by sqrt(n / (n - p)) so the resampled
            # residuals have the variance of the errors, not the smaller
            # variance of the fitted residuals (Davison & Hinkley 1997,
            # chapter 6; nlstools::nlsBoot centres only)
            self.resid = (r - r.mean()) * math.sqrt(n / setup["df"])
            self.yhat = yhat
        self.p0 = {nm: self.fitted[nm] for nm in self.free}
        self.values = []        # per converged resample: {name: value}
        self.failed = 0

    def _resample(self, b):
        idx = self.index[b]
        if self.method == "case":
            return self.x[idx], self.y[idx]
        return self.x, self.yhat + self.resid[idx] / self.sqrt_w

    def refit(self, b):
        """Parameters (model names, constants included) of resample b,
        or None when the refit fails."""
        xb, yb = self._resample(b)
        if self.method == "case" and np.unique(xb).size < len(self.free):
            return None
        try:
            popt, _, _ = nlfit._ols_fit(
                self.spec, xb, yb, self.free, self.fixed, self.p0,
                self.weighting, self.weight_source, None, with_cov=False,
                max_nfev=REFIT_NFEV)
        except (RuntimeError, ValueError, ArithmeticError,
                np.linalg.LinAlgError):
            return None
        if not np.all(np.isfinite(popt)):
            return None
        p = dict(self.fixed)
        p.update({nm: float(v) for nm, v in zip(self.free, popt)})
        return p

    def steps(self):
        for b in range(self.B):
            p = self.refit(b)
            if p is None:
                self.failed += 1
            else:
                vals = {nlfit._display_name(self.spec, nm): p[nm]
                        for nm in self.free}
                vals.update(derived_values(self.spec, p, self.x, self.extra))
                self.values.append(vals)
            if (b + 1) % CHUNK == 0 and b + 1 < self.B:
                yield b + 1
        return self.summary()

    def run(self):
        """All resamples at once (native use and tests)."""
        gen = self.steps()
        while True:
            try:
                next(gen)
            except StopIteration as stop:
                return stop.value

    def summary(self) -> dict:
        ok = len(self.values)
        out = {"method": self.method, "resamples": self.B,
               "seed": self.seed, "ci_level": self.level,
               "interval": "percentile", "converged": ok,
               "failed": self.failed, "params": {}, "warnings": []}
        if ok < (1.0 - FAIL_STOP) * self.B or ok < 2:
            out["error"] = (f"only {ok:,} of {self.B:,} resamples could be "
                            "refitted, too few for a bootstrap CI; the CIs "
                            "shown are asymptotic")
            return out
        estimates = {nlfit._display_name(self.spec, nm): self.fitted[nm]
                     for nm in self.free}
        estimates.update(derived_values(self.spec, self.fitted, self.x,
                                        self.extra))
        for name, est in estimates.items():
            vals = [v.get(name) for v in self.values]
            bad = sum(1 for v in vals if v is None)
            entry = {"value": est}
            if est is None:
                continue
            arr = None if bad else np.asarray(vals, dtype=float)
            if bad:
                entry.update({"ci95": None, "se": None, "bias": None,
                              "undefined": bad})
            elif arr.max() == arr.min():
                # the same in every resample: it depends on constants only
                # (Span with Top and Bottom held), so it has no CI
                entry.update({"ci95": None, "se": None, "bias": None})
            else:
                entry.update({
                    "ci95": _quantiles(arr, self.level),
                    "se": float(arr.std(ddof=1)),
                    "bias": float(arr.mean() - est),
                    "median": float(np.median(arr)),
                })
            out["params"][name] = entry
        if self.failed:
            share = self.failed / self.B
            out["warnings"].append(
                f"{self.failed:,} of {self.B:,} resamples could not be "
                "refitted and were left out"
                + ("; with this many left out the CIs may be too narrow"
                   if share > FAIL_WARN else ""))
        undefined = [k for k, v in out["params"].items() if v.get("undefined")]
        if undefined:
            out["warnings"].append(
                "No bootstrap CI for " + ", ".join(undefined) + ": not "
                "defined for every resample")
        return out
