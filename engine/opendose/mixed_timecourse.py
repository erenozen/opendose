"""Time-course (longitudinal) mixed models: group x time with a choice of
within-subject covariance structure.

Model: value = X b + e, e ~ N(0, V), V block diagonal by subject; the
fixed part is group, time and group x time (time as a factor in effect
coding, or as a linear trend centred at the mean time point), optionally
the subject's baseline value as a covariate. Within-subject covariance
(each block is the submatrix, at the subject's observed times, of one
T x T matrix, so missing time points need no imputation):

- "cs"           compound symmetry = random subject intercept,
                 sigma_s^2 J + sigma^2 I (lme4: (1 | subject); SAS
                 TYPE=CS; the model of Prism's mixed-model repeated
                 measures);
- "ar1"          random subject intercept plus first-order autoregressive
                 residuals, sigma_s^2 J + sigma^2 rho^|i-j| (nlme:
                 lme(random = ~1 | subject, correlation = corAR1()));
                 options.random_intercept = false gives the plain AR(1)
                 of SAS REPEATED / TYPE=AR(1) and nlme gls(correlation =
                 corAR1()). Lags count time points (positions in the
                 ordered list of times), as corAR1 does;
- "unstructured" a free T x T covariance (SAS TYPE=UN, nlme corSymm +
                 varIdent), T(T+1)/2 parameters;
- "random_slope" random intercept and random slope on time with an
                 unstructured 2 x 2 G plus sigma^2 I (lme4: (1 + time |
                 subject); SAS RANDOM intercept time / TYPE=UN).

Estimation: restricted maximum likelihood (or ML on request) with sigma^2
profiled out; -2 log L_R = (N - p) log(2 pi) + log|V| + log|X'V^-1 X| +
r'V^-1 r (SAS PROC MIXED's REML criterion, Littell et al. 2006, ch. 5
and Appendix 1; identical to opendose.mixedmodel.fit_reml). Fixed
effects by generalized least squares with Cov(b) = (X'V^-1 X)^-1.
AIC = -2 log L + 2 q and BIC = -2 log L + q log(subjects), q = number of
covariance parameters (plus the fixed effects for ML), as SAS reports
them; AIC compares covariance structures for the same fixed effects
(Littell et al. 2006 section 5.4; Pinheiro & Bates 2000 section 5.3).

Tests: Type III Wald F of each term (effect coding). Denominator df by
the between-within method (SAS DDFM=BETWITHIN, the default for repeated-
measures covariance models): terms constant within subjects (group,
baseline) use subjects - rank(between-subject columns); terms that vary
within subjects use N - subjects - (rank X - rank between-subject
columns). For "cs" this equals the containment df of opendose.
mixedmodel.mixed_rm_two_way; for "unstructured" every term uses the
between-subject df, as SAS does for TYPE=UN (SAS/STAT User's Guide,
PROC MIXED Example "Repeated Measures", Potthoff & Roy growth data).
Kenward-Roger or Satterthwaite df are not computed (reported in
warnings for the structures where they would differ).

Sources (cited for the method):

- GraphPad Prism statistics guide, "The mixed model approach to
  analyzing repeated measures data": compound symmetry (random subject
  intercept) fitted by REML. Prism offers only compound symmetry; AR(1),
  unstructured and random-slope covariance go beyond it.
- Pinheiro JC, Bates DM (2000) Mixed-Effects Models in S and S-PLUS,
  Springer, ch. 5 (5.3 "Correlation structures": corCompSymm, corAR1,
  corSymm; random-slope models ch. 4).
- Littell RC, Milliken GA, Stroup WW, Wolfinger RD, Schabenberger O
  (2006) SAS for Mixed Models, 2nd ed., ch. 5 "Analysis of repeated
  measures data" (covariance structures CS, AR(1), UN, random
  coefficients; selection by AIC/BIC; between-within df).

Only numpy and scipy are used, so the module runs under Pyodide.
"""

from __future__ import annotations

import math

import numpy as np
from scipy import optimize, stats

from . import mixedmodel as mm
from .mixed_nested import _label, _missing, _num, family_comparisons

_LN2PI = math.log(2.0 * math.pi)

STRUCTURES = ("cs", "ar1", "unstructured", "random_slope")
_ALIASES = {"cs": "cs", "compound_symmetry": "cs", "ar1": "ar1",
            "ar(1)": "ar1", "un": "unstructured",
            "unstructured": "unstructured", "random_slope": "random_slope",
            "rs": "random_slope", "random_coefficients": "random_slope"}
LABELS = {
    "cs": "Compound symmetry (random subject intercept)",
    "ar1": "Random subject intercept + AR(1) residuals",
    "ar1_only": "AR(1) (no random intercept)",
    "unstructured": "Unstructured",
    "random_slope": "Random intercept and slope on time",
}


# ------------------------------------------------------------ the core

class _Structured:
    """Profiled (RE)ML criterion for block-diagonal V = sigma^2 H(phi),
    each subject's H the submatrix of one T x T matrix at its observed
    positions.

    Subjects are stacked as T-long rows with missing positions zeroed in
    y and X and replaced by identity rows/columns in H (which leaves
    log|H_s|, X'H^-1X, X'H^-1y and y'H^-1y unchanged), so every
    evaluation is a few batched numpy calls. The gradient is analytic:
    d(-2 l)/dH = sum_s H_s^-1 - H^-1 r r' H^-1 / sigma^2 - H^-1 X
    (X'H^-1X)^-1 X'H^-1 (the last term for REML only), chained through
    each structure's dH/dphi."""

    def __init__(self, y, X, subjects, positions, kind, *, level_times=None,
                 random_intercept=True, method="reml", allow_negative=True):
        y = np.asarray(y, float)
        X = np.asarray(X, float)
        self.N, self.p = X.shape
        subjects = np.asarray(subjects, int)
        positions = np.asarray(positions, int)
        self.T = T = int(positions.max()) + 1
        self.kind = kind
        self.ri = bool(random_intercept)
        self.method = method
        self.level_times = (None if level_times is None
                            else np.asarray(level_times, float))
        _, sidx = np.unique(subjects, return_inverse=True)
        S = self.n_subjects = int(sidx.max()) + 1
        if np.unique(sidx * T + positions).size != sidx.size:
            raise ValueError("a subject has two values at the same time")
        self.mask = np.zeros((S, T), bool)
        self.mask[sidx, positions] = True
        self.Yp = np.zeros((S, T))
        self.Yp[sidx, positions] = y
        self.Xp = np.zeros((S, T, self.p))
        self.Xp[sidx, positions] = X
        self.MM = self.mask[:, :, None] & self.mask[:, None, :]
        self.I = np.eye(T)
        self.m_max = int(self.mask.sum(axis=1).max())
        lag = np.abs(np.subtract.outer(np.arange(T), np.arange(T)))
        self.lag = lag
        if kind == "cs":
            lb = (-(1.0 - 1e-6) / self.m_max) if allow_negative else 0.0
            self.bounds = [(lb, 1e6)]
        elif kind == "ar1":
            self.bounds = ([(0.0, 1e6)] if self.ri else []) + [(-0.995, 0.995)]
        elif kind == "unstructured":
            self.tri = [(i, j) for i in range(T) for j in range(i + 1)
                        if (i, j) != (0, 0)]
            self.bounds = [(-12.0, 12.0) if i == j else (-1e4, 1e4)
                           for i, j in self.tri]
        elif kind == "random_slope":
            if self.level_times is None:
                raise ValueError("random slopes need numeric times")
            self.Zf = np.column_stack([np.ones(T), self.level_times])
            self.bounds = [(-12.0, 9.0), (-1e4, 1e4), (-15.0, 9.0)]
        else:
            raise ValueError(f"unknown covariance structure: {kind}")

    # -- H(phi) on all T positions
    def _L(self, phi):
        L = np.zeros((self.T, self.T))
        L[0, 0] = 1.0
        for v, (i, j) in zip(phi, self.tri):
            L[i, j] = math.exp(v) if i == j else v
        return L

    def _C(self, phi):
        return np.array([[math.exp(phi[0]), 0.0],
                         [phi[1], math.exp(phi[2])]])

    def H_full(self, phi):
        T = self.T
        phi = np.asarray(phi, float)
        if self.kind == "cs":
            return phi[0] * np.ones((T, T)) + self.I
        if self.kind == "ar1":
            H = phi[-1] ** self.lag
            return H + phi[0] if self.ri else H
        if self.kind == "unstructured":
            L = self._L(phi)
            return L @ L.T
        C = self._C(phi)
        return self.Zf @ (C @ C.T) @ self.Zf.T + self.I

    def solve(self, phi):
        try:
            Hf = self.H_full(phi)
        except OverflowError:
            return None
        if not np.all(np.isfinite(Hf)):
            return None
        Hb = np.where(self.MM, Hf[None, :, :], self.I[None, :, :])
        try:
            C = np.linalg.cholesky(Hb)
        except np.linalg.LinAlgError:
            return None
        d = np.diagonal(C, axis1=1, axis2=2)
        if d.min() <= 1e-10:
            return None
        logdet_h = 2.0 * float(np.sum(np.log(d)))
        Hinv = np.linalg.inv(Hb)
        HX = Hinv @ self.Xp                                   # S x T x p
        XtHX = np.tensordot(self.Xp, HX, axes=([0, 1], [0, 1]))
        XtHX = (XtHX + XtHX.T) / 2.0
        XtHy = np.tensordot(HX, self.Yp, axes=([0, 1], [0, 1]))
        yHy = float(np.sum(self.Yp * (Hinv @ self.Yp[:, :, None])[:, :, 0]))
        try:
            Lx = np.linalg.cholesky(XtHX)
        except np.linalg.LinAlgError:
            return None
        beta = np.linalg.solve(XtHX, XtHy)
        quad = yHy - float(beta @ XtHy)
        reml = self.method == "reml"
        dof = self.N - self.p if reml else self.N
        if not quad > 0 or dof <= 0:
            return None
        sigma2 = quad / dof
        crit = dof * (_LN2PI + math.log(sigma2) + 1.0) + logdet_h
        if reml:
            crit += 2.0 * float(np.sum(np.log(np.diag(Lx))))
        return {"crit": crit, "beta": beta, "sigma2": sigma2,
                "XtHX": XtHX, "H": Hf, "Hinv": Hinv, "HX": HX}

    def f(self, phi):
        sol = self.solve(phi)
        return 1e300 if sol is None or not math.isfinite(sol["crit"]) \
            else sol["crit"]

    def grad(self, phi, sol=None):
        phi = np.asarray(phi, float)
        sol = sol or self.solve(phi)
        if sol is None:
            return np.zeros(phi.size)
        Hinv, HX, s2 = sol["Hinv"], sol["HX"], sol["sigma2"]
        r = self.Yp - self.Xp @ sol["beta"]
        Hr = (Hinv @ r[:, :, None])[:, :, 0]
        Gm = (np.where(self.MM, Hinv, 0.0).sum(axis=0)
              - Hr.T @ Hr / s2)
        if self.method == "reml":
            Ainv = np.linalg.inv(sol["XtHX"])
            Gm = Gm - np.tensordot(HX @ Ainv, HX, axes=([0, 2], [0, 2]))
        Gm = (Gm + Gm.T) / 2.0
        if self.kind == "cs":
            return np.array([Gm.sum()])
        if self.kind == "ar1":
            rho = phi[-1]
            with np.errstate(divide="ignore", invalid="ignore"):
                D = np.where(self.lag > 0,
                             self.lag * rho ** np.maximum(self.lag - 1, 0),
                             0.0)
            g_rho = float((Gm * D).sum())
            return np.array([Gm.sum(), g_rho] if self.ri else [g_rho])
        if self.kind == "unstructured":
            L = self._L(phi)
            gL = 2.0 * Gm @ L
            return np.array([gL[i, j] * L[i, j] if i == j else gL[i, j]
                             for i, j in self.tri])
        C = self._C(phi)
        gC = 2.0 * (self.Zf.T @ Gm @ self.Zf) @ C
        return np.array([gC[0, 0] * C[0, 0], gC[1, 0], gC[1, 1] * C[1, 1]])

    def starts(self, cs_ratio, start_cov=None):
        """Starting values: from the compound-symmetry ratio and, for the
        unstructured case, the pairwise covariance of OLS residuals (and
        start_cov, e.g. the best other structure's implied covariance)."""
        g0 = max(cs_ratio, 0.0)
        if self.kind == "cs":
            return [np.array([v]) for v in (0.0, 0.1, 0.5, 1.0, 3.0)]
        if self.kind == "ar1":
            rhos = (-0.3, 0.0, 0.3, 0.6, 0.85)
            if not self.ri:
                return [np.array([r]) for r in rhos]
            return [np.array([g, r]) for r in rhos
                    for g in (0.0, 0.5 * g0, g0, 0.2, 1.0)]
        if self.kind == "unstructured":
            X = self.Xp[self.mask]
            y = self.Yp[self.mask]
            beta = np.linalg.lstsq(X, y, rcond=None)[0]
            M = np.where(self.mask, self.Yp - self.Xp @ beta, np.nan)
            S = mm.pairwise_cov(M)
            cands = []
            if start_cov is not None:
                cands.append(np.asarray(start_cov, float))
            if not np.isnan(S).any():
                cands.append(S)
            cands.append(g0 * np.ones((self.T, self.T)) + self.I)
            out = []
            for S0 in cands:
                S0 = (S0 + S0.T) / 2.0
                w, U = np.linalg.eigh(S0)
                w = np.clip(w, 1e-3 * max(w.max(), 1e-12), None)
                S0 = (U * w) @ U.T
                S0 = S0 / S0[0, 0]
                L = np.linalg.cholesky(S0)
                out.append(np.array([
                    math.log(L[i, j]) if i == j else L[i, j]
                    for i, j in self.tri]))
            return out
        # random slope: log C00, C10, log C11 (G / sigma^2 = C C')
        span = float(np.ptp(self.level_times)) or 1.0
        out = []
        for gi in (max(g0, 0.05), 1.0):
            for gs in (0.01, 0.1, 1.0):
                out.append(np.array([0.5 * math.log(gi), 0.0,
                                     math.log(math.sqrt(gs) / span)]))
        return out

    def minimize(self, cs_ratio=0.5, start_cov=None):
        lo = np.array([b[0] for b in self.bounds])
        hi = np.array([b[1] for b in self.bounds])
        cands = [np.clip(s, lo, hi) for s in self.starts(cs_ratio, start_cov)]
        if len(self.bounds) == 1:
            lb, ub = self.bounds[0]
            if self.kind == "cs":
                grid = ([lb + (0 - lb) * t for t in (0, .01, .1, .3, .5, .7,
                                                     .9, .99)]
                        if lb < 0 else []) + [0.0] + \
                    list(np.geomspace(1e-6, ub, 80))
            else:
                grid = list(np.linspace(lb, ub, 81))
            vals = [self.f([v]) for v in grid]
            i = int(np.argmin(vals))
            a, b = grid[max(i - 1, 0)], grid[min(i + 1, len(grid) - 1)]
            ga, gb = self.grad([a])[0], self.grad([b])[0]
            if i == 0 and ga >= 0:
                return np.array([grid[0]]), True
            if ga < 0 < gb:
                root = optimize.brentq(lambda t: self.grad([t])[0], a, b,
                                       xtol=1e-14, rtol=1e-14, maxiter=500)
                return np.array([float(root)]), True
            res = optimize.minimize_scalar(
                lambda t: self.f([t]), bounds=(a, b), method="bounded",
                options={"xatol": 1e-12, "maxiter": 2000})
            x = np.array([res.x]) if res.fun <= vals[i] else np.array([grid[i]])
            return x, True

        def fun(x):
            sol = self.solve(x)
            if sol is None or not math.isfinite(sol["crit"]):
                return 1e300, np.zeros(x.size)
            return sol["crit"], self.grad(x, sol)

        cands.sort(key=self.f)
        # unstructured and random-slope parameters are unconstrained
        # (Cholesky factors with log diagonals): BFGS; the others have
        # bounds (variance >= 0, |rho| < 1): L-BFGS-B
        free_params = self.kind in ("unstructured", "random_slope")
        if free_params:
            kw = {"method": "BFGS", "options": {"gtol": 1e-7,
                                                "maxiter": 5000}}
        else:
            kw = {"method": "L-BFGS-B", "bounds": self.bounds,
                  "options": {"ftol": 1e-15, "gtol": 1e-9, "maxiter": 5000,
                              "maxfun": 20000}}
        best, best_f = None, math.inf
        for x0 in cands[:3]:
            res = optimize.minimize(fun, x0, jac=True, **kw)
            if res.fun < best_f:
                best, best_f = res.x, res.fun
        res = optimize.minimize(fun, best, jac=True, **kw)
        if res.fun <= best_f:
            best = res.x
        best = np.asarray(best, float)
        g = self.grad(best)
        free = (best > lo + 1e-7) & (best < hi - 1e-7)
        scale = max(1.0, abs(self.f(best)))
        grad_ok = bool(np.all(np.abs(g[free]) < 1e-3 * max(1.0, scale / 100)))
        return best, grad_ok


def _n_cov(kind, T, ri=True):
    return {"cs": 2, "ar1": 3 if ri else 2, "unstructured": T * (T + 1) // 2,
            "random_slope": 4}[kind]


def fit_structured(y, X, subjects, positions, kind, *, level_times=None,
                   random_intercept=True, method="reml",
                   allow_negative=True, start_cov=None) -> dict:
    """Fit y = X b + e with block-diagonal V of the given kind ("cs",
    "ar1", "unstructured", "random_slope"); see the module docstring.
    positions: 0-based time-point index of each value; level_times: the
    numeric time of each index (random slopes); start_cov: an extra
    starting covariance for "unstructured". Returns beta, cov_beta,
    sigma2, the T x T implied covariance, covariance parameters in
    natural units, -2 log L, AIC, BIC, convergence."""
    if method not in ("reml", "ml"):
        raise ValueError("method must be 'reml' or 'ml'")
    X = np.asarray(X, float)
    if mm._rank(X) < X.shape[1]:
        raise ValueError("fixed-effects design is rank deficient "
                         "(a group x time cell has no data)")
    prof = _Structured(y, X, subjects, positions, kind,
                       level_times=level_times,
                       random_intercept=random_intercept, method=method,
                       allow_negative=allow_negative)
    cs_ratio = 0.5
    if kind != "cs":
        cs = _Structured(y, X, subjects, positions, "cs", method=method,
                         allow_negative=False)
        cs_ratio = float(cs.minimize()[0][0])
    phi, ok = prof.minimize(cs_ratio, start_cov)
    sol = prof.solve(phi)
    if sol is None:
        raise ValueError("the covariance model could not be fitted")
    s2 = sol["sigma2"]
    cov_beta = s2 * np.linalg.inv(sol["XtHX"])
    cov_beta = (cov_beta + cov_beta.T) / 2.0
    Sigma = s2 * sol["H"]
    T = prof.T
    if kind == "cs":
        params = {"subject_variance": float(phi[0] * s2),
                  "residual_variance": float(s2),
                  "correlation": float(phi[0] / (1.0 + phi[0]))}
    elif kind == "ar1":
        params = {"rho": float(phi[-1]), "residual_variance": float(s2)}
        if prof.ri:
            params["subject_variance"] = float(phi[0] * s2)
    elif kind == "unstructured":
        sd = np.sqrt(np.diag(Sigma))
        params = {"covariance": Sigma.tolist(),
                  "variances": np.diag(Sigma).tolist(),
                  "correlations": (Sigma / np.outer(sd, sd)).tolist()}
    else:
        L = np.array([[math.exp(phi[0]), 0.0], [phi[1], math.exp(phi[2])]])
        G = s2 * (L @ L.T)
        params = {"intercept_variance": float(G[0, 0]),
                  "slope_variance": float(G[1, 1]),
                  "intercept_slope_covariance": float(G[0, 1]),
                  "intercept_slope_correlation":
                      float(G[0, 1] / math.sqrt(G[0, 0] * G[1, 1]))
                      if G[0, 0] > 0 and G[1, 1] > 0 else None,
                  "residual_variance": float(s2),
                  "G": G.tolist()}
    q = _n_cov(kind, T, prof.ri)
    k = q + (X.shape[1] if method == "ml" else 0)
    crit = float(sol["crit"])
    return {"beta": sol["beta"], "cov_beta": cov_beta, "sigma2": float(s2),
            "phi": phi, "params": params, "implied_covariance": Sigma,
            "minus2_log_likelihood": crit, "log_likelihood": -crit / 2.0,
            "aic": crit + 2 * k, "bic": crit + k * math.log(prof.n_subjects),
            "n_cov_params": q, "converged": bool(ok), "method": method,
            "n": prof.N, "p": prof.p, "n_subjects": prof.n_subjects,
            "kind": kind, "random_intercept": prof.ri}


# ------------------------------------------------------- data handling

def _records(data):
    if data.get("records") is not None:
        return [(r.get("subject"), r.get("group"), r.get("time"),
                 r.get("value")) for r in data["records"]]
    if "subject" in data:
        n = len(data["subject"])
        g = data.get("group") or [None] * n
        return list(zip(data["subject"], g, data["time"], data["value"]))
    if data.get("datasets") is not None:
        return _from_grouped(data)
    raise ValueError("data needs records, column arrays (subject, group, "
                     "time, value) or a grouped table")


def _from_grouped(data):
    """Grouped table: rows = times (data.x or data.row_titles), data sets
    = groups, subcolumns = subjects (ds.subject_names optional)."""
    dsets = data["datasets"]
    n_rows = max((len(ds.get("ys") or []) for ds in dsets), default=0)
    times = list(data.get("x") or data.get("row_titles") or [])
    times += [i + 1 for i in range(len(times), n_rows)]
    out = []
    for d, ds in enumerate(dsets):
        gname = ds.get("name") or f"Group {d + 1}"
        snames = ds.get("subject_names") or []
        for r, row in enumerate(ds.get("ys") or []):
            for s, v in enumerate(row or []):
                sname = snames[s] if s < len(snames) and not _missing(
                    snames[s]) else f"{gname}: Subject {s + 1}"
                out.append((sname, gname, times[r], v))
    return out


def summarise_records(rows, *, need_numeric_time=False):
    """Clean (subject, group, time, value) rows. Returns dict with
    arrays and level lists plus warnings."""
    warnings = []
    clean = []
    dropped = 0
    for s, g, t, v in rows:
        val = _num(v)
        if _missing(s) or _missing(t) or val is None:
            if not _missing(v) or (not _missing(s) and not _missing(t)
                                   and _missing(v)):
                dropped += 1
            continue
        clean.append((_label(s), "" if _missing(g) else _label(g), t, val))
    if dropped:
        warnings.append(f"{dropped} row{'s' if dropped > 1 else ''} with a "
                        "blank or non-numeric value left out (the mixed "
                        "model uses every remaining value of each subject).")
    if not clean:
        raise ValueError("no complete rows")
    tnum = [_num(t) for _, _, t, _ in clean]
    numeric = all(x is not None for x in tnum)
    if need_numeric_time and not numeric:
        raise ValueError("time must be numeric for a linear time trend or "
                         "random slopes")
    if numeric:
        tl = sorted(set(tnum))
        t_index = [tl.index(x) for x in tnum]
        t_labels = [_label(x) for x in tl]
        t_values = tl
    else:
        t_labels = []
        for _, _, t, _ in clean:
            if _label(t) not in t_labels:
                t_labels.append(_label(t))
        t_index = [t_labels.index(_label(t)) for _, _, t, _ in clean]
        t_values = None
    groups = []
    for _, g, _, _ in clean:
        if g not in groups:
            groups.append(g)
    g_of_label = {}
    for s, g, _, _ in clean:
        g_of_label.setdefault(s, set()).add(g)
    reused = sorted(s for s, gs in g_of_label.items() if len(gs) > 1)
    if reused:
        warnings.append(
            f"Subject labels appear in more than one group ("
            f"{', '.join(reused[:3])}{'...' if len(reused) > 3 else ''}): "
            "they are treated as different subjects in each group (group "
            "is a between-subject factor).")
    kidx = {}
    for s, g, _, _ in clean:
        kidx.setdefault((g, s), len(kidx))
    keys = list(kidx)
    subj = np.array([kidx[(g, s)] for s, g, _, _ in clean])
    seen = set()
    for i, ti in zip(subj, t_index):
        if (i, ti) in seen:
            g, s = keys[i]
            raise ValueError(f"subject {s} has more than one value at one "
                             "time point: average technical replicates "
                             "first (or use the nested analysis)")
        seen.add((i, ti))
    return {"y": np.array([v for *_, v in clean]),
            "subject": subj, "subject_keys": keys,
            "group": np.array([groups.index(g) for _, g, _, _ in clean]),
            "groups": [g if g != "" else "All" for g in groups],
            "time_index": np.array(t_index), "time_labels": t_labels,
            "time_values": t_values, "warnings": warnings,
            "raw": clean}


def _design(d, time_as, center_time, baseline):
    """Fixed-effects design and term map."""
    n = d["y"].size
    G = len(d["groups"])
    T = len(d["time_labels"])
    blocks = [np.ones((n, 1))]
    terms = []
    col = 1

    def add(name, M, between):
        nonlocal col
        if M.shape[1] == 0:
            return
        blocks.append(M)
        terms.append({"name": name, "cols": list(range(col, col + M.shape[1])),
                      "between": between})
        col += M.shape[1]

    Gm = mm.effect_columns(d["group"], G) if G > 1 else np.zeros((n, 0))
    add("Group", Gm, True)
    if time_as == "factor":
        Tm = mm.effect_columns(d["time_index"], T)
        tc = None
    else:
        tv = np.asarray(d["time_values"], float)
        tc = float(tv.mean()) if center_time else 0.0
        Tm = (tv[d["time_index"]] - tc)[:, None]
    add("Time", Tm, False)
    add("Group × Time", mm._interaction(Gm, Tm), False)
    if baseline is not None:
        add("Baseline", baseline[:, None], True)
    return np.column_stack(blocks), terms, tc


def _df_between_within(X, terms, subj, kind):
    n = X.shape[0]
    S = int(np.unique(subj).size)
    between_cols = [0] + [c for t in terms if t["between"] for c in t["cols"]]
    r_b = mm._rank(X[:, between_cols])
    r_x = mm._rank(X)
    df_b = S - r_b
    df_w = n - S - (r_x - r_b)
    for t in terms:
        t["df"] = df_b if (t["between"] or kind == "unstructured") else df_w
    return df_b, df_w


def mixed_timecourse(data, options=None) -> dict:
    """Group x time mixed model for a time course; see module docstring.

    data: {"records": [{subject, group, time, value}]}, column arrays
    {"subject", "group", "time", "value"} (the same payload as the auc
    handler's per-subject form), or a grouped table {"x" or
    "row_titles": times, "datasets": [{"name": group, "ys": [[subject
    values] per time row], "subject_names"?}]}.
    options: covariance ("cs" | "ar1" | "unstructured" | "random_slope"),
    time_as ("factor" | "linear"), center_time (true), random_intercept
    (ar1: true), baseline_covariate (false), baseline_time (first time),
    method ("reml" | "ml"), negative_variance (cs: "allow" | "zero"),
    compare_covariances (false), comparisons ("sidak" | "holm_sidak" |
    "holm" | "bonferroni" | "tukey" | "fisher" | "dunnett" | null),
    control_index, ci_level (0.95), include_auc (false), auc_baseline
    ("zero" | "first").
    """
    options = options or {}
    kind = _ALIASES.get(str(options.get("covariance", "cs")).lower())
    if kind is None:
        raise ValueError(f"unknown covariance: {options.get('covariance')}")
    time_as = options.get("time_as", "factor")
    if time_as not in ("factor", "linear"):
        raise ValueError("time_as must be 'factor' or 'linear'")
    method = options.get("method", "reml")
    ci_level = float(options.get("ci_level", 0.95))
    ri = bool(options.get("random_intercept", True))
    if options.get("negative_variance", "allow") not in ("allow", "zero"):
        raise ValueError("negative_variance must be 'allow' or 'zero'")
    allow_neg = options.get("negative_variance", "allow") == "allow"
    rows = _records(data)
    d = summarise_records(
        rows, need_numeric_time=(time_as == "linear"
                                 or kind == "random_slope"))
    warnings = list(d["warnings"])

    baseline = None
    baseline_note = None
    if options.get("baseline_covariate"):
        bt = options.get("baseline_time")
        b_lab = None if bt is None else _label(
            _num(bt) if _num(bt) is not None else bt)
        if b_lab is not None and b_lab not in d["time_labels"]:
            raise ValueError(f"baseline_time {bt} is not one of the times")
        b_idx = 0 if b_lab is None else d["time_labels"].index(b_lab)
        base = {}
        for i, ti, v in zip(d["subject"], d["time_index"], d["y"]):
            if ti == b_idx:
                base[int(i)] = v
        keep = np.array([int(i) in base and ti != b_idx
                         for i, ti in zip(d["subject"], d["time_index"])])
        lost = sorted({int(i) for i in d["subject"]} - set(base))
        if lost:
            warnings.append(f"{len(lost)} subject(s) without a baseline "
                            "value left out of the baseline-adjusted model.")
        if not keep.any():
            raise ValueError("no values after the baseline time")
        bvals = np.array([base[int(i)] for i in d["subject"][keep]])
        bmean = float(np.mean(list(base.values())))
        baseline = bvals - bmean
        btime = d["time_labels"][b_idx]
        tl = [t for k, t in enumerate(d["time_labels"]) if k != b_idx]
        remap = {k: n for n, k in enumerate(
            k for k in range(len(d["time_labels"])) if k != b_idx)}
        d = {**d, "y": d["y"][keep], "group": d["group"][keep],
             "time_index": np.array([remap[k] for k in d["time_index"][keep]]),
             "time_labels": tl,
             "time_values": ([v for k, v in enumerate(d["time_values"])
                              if k != b_idx] if d["time_values"] else None)}
        _, d["subject"] = np.unique(d["subject"][keep], return_inverse=True)
        baseline_note = (f"Values at time {btime} enter as a covariate "
                         f"(centred at its mean, {bmean:.4g}); means are "
                         "adjusted to that baseline.")
    T = len(d["time_labels"])
    G = len(d["groups"])
    if T < 2:
        raise ValueError("need at least 2 time points")
    if kind == "unstructured" and T > 6:
        warnings.append(f"An unstructured covariance for {T} time points "
                        f"has {T * (T + 1) // 2} parameters; with few "
                        "subjects the estimate is unstable (consider AR(1) "
                        "or compare structures by AIC).")
    if kind == "ar1" and d["time_values"]:
        gaps = np.diff(d["time_values"])
        if gaps.size and np.ptp(gaps) > 1e-9 * max(1.0, abs(gaps).max()):
            warnings.append("AR(1) treats consecutive time points as equally "
                            "spaced (the correlation falls by rho per time "
                            "point, as nlme corAR1 does); the time points "
                            "here are unequally spaced.")

    X, terms, tc = _design(d, time_as, options.get("center_time", True),
                           baseline)
    S = int(np.unique(d["subject"]).size)
    if S < 2:
        raise ValueError("need at least 2 subjects")
    df_b, df_w = _df_between_within(X, terms, d["subject"], kind)
    if df_b < 1 or (df_w < 1 and kind != "unstructured"):
        raise ValueError("too few subjects or values for this model")
    level_times = (np.asarray(d["time_values"], float)
                   if d["time_values"] else None)

    def fit_kind(k):
        return fit_structured(d["y"], X, d["subject"], d["time_index"], k,
                              level_times=level_times, random_intercept=ri,
                              method=method,
                              allow_negative=allow_neg)

    fit = fit_kind(kind)
    comparison = None
    if options.get("compare_covariances"):
        fits, skipped = {kind: fit}, []
        kinds = ["cs", "ar1"] + (["random_slope"]
                                 if level_times is not None else [])
        for k in kinds:
            if k in fits:
                continue
            try:
                fits[k] = fit_kind(k)
            except (ValueError, np.linalg.LinAlgError) as exc:
                skipped.append(f"{k} ({exc})")
        if T > 10:
            fits.pop("unstructured", None)
            skipped.append("unstructured (more than 10 time points)")
        else:
            # every other structure is nested in the unstructured one, so
            # its -2 log L can be no larger: refit from the best of them
            # if the first fit stopped short of that
            others = [f_k for k, f_k in fits.items() if k != "unstructured"]
            best_other = min(others, key=lambda f_k:
                             f_k["minus2_log_likelihood"]) if others else None
            un = fits.get("unstructured")
            if un is None or (best_other is not None and
                              un["minus2_log_likelihood"] >
                              best_other["minus2_log_likelihood"] + 1e-6):
                try:
                    un2 = fit_structured(
                        d["y"], X, d["subject"], d["time_index"],
                        "unstructured", method=method,
                        start_cov=(best_other["implied_covariance"]
                                   if best_other is not None else None))
                    if un is None or un2["minus2_log_likelihood"] < \
                            un["minus2_log_likelihood"]:
                        fits["unstructured"] = un2
                except (ValueError, np.linalg.LinAlgError) as exc:
                    skipped.append(f"unstructured ({exc})")
        if kind == "unstructured" and "unstructured" in fits:
            fit = fits["unstructured"]
        table = []
        for k in ("cs", "ar1", "unstructured", "random_slope"):
            if k not in fits:
                continue
            f_k = fits[k]
            table.append({"kind": k, "label": LABELS["ar1_only" if k == "ar1"
                                                     and not ri else k],
                          "n_parameters": f_k["n_cov_params"],
                          "minus2_log_likelihood": f_k["minus2_log_likelihood"],
                          "aic": f_k["aic"], "bic": f_k["bic"],
                          "converged": f_k["converged"]})
        best = min(table, key=lambda r: r["aic"]) if table else None
        for r in table:
            r["delta_aic"] = r["aic"] - best["aic"]
            r["best"] = r is best
        comparison = {
            "criterion": "AIC (smaller is better)",
            "method": method.upper(),
            "rows": sorted(table, key=lambda r: r["aic"]),
            "best": best["kind"] if best else None,
            "skipped": skipped,
            "note": ("Structures are compared with the same fixed effects "
                     f"({method.upper()} fits); an AIC difference under 2 "
                     "is not a meaningful preference.")}
        if skipped:
            warnings.append("Not compared: " + "; ".join(skipped) + ".")
    if not fit["converged"]:
        warnings.append("The optimizer did not fully converge; treat the "
                        "covariance parameters with caution.")
    if kind == "cs" and fit["params"]["subject_variance"] < 0:
        warnings.append("The between-subject variance is estimated as "
                        "negative (kept, Prism's 'analyze as usual'; "
                        "negative_variance='zero' bounds it at zero).")
    if kind == "random_slope" and fit["params"]["slope_variance"] < \
            1e-8 * max(fit["sigma2"], 1e-300):
        warnings.append("The random-slope variance is estimated at zero: "
                        "subjects' slopes do not vary beyond the residual "
                        "scatter.")
    if kind != "cs":
        warnings.append("Denominator df by the between-within method; "
                        "Kenward-Roger or Satterthwaite df (R lmerTest, "
                        "SAS DDFM=KR) would differ for this covariance "
                        "structure.")

    anova = []
    for t in terms:
        w = mm.wald_f(fit, t["cols"], t["df"])
        anova.append({"term": t["name"], "f": w["F"], "dfn": w["df_num"],
                      "dfd": int(t["df"]), "p": w["p"],
                      "significant_05": bool(w["p"] is not None
                                             and w["p"] < 0.05)})

    # group means at each time
    tnames = d["time_labels"]
    inter_df = next((t["df"] for t in terms if t["name"] == "Group × Time"),
                    next(t["df"] for t in terms if t["name"] == "Time"))

    def row_L(g, ti):
        parts = [np.ones(1)]
        gr = mm.effect_row(g, G) if G > 1 else np.zeros(0)
        parts.append(gr)
        if time_as == "factor":
            tr = mm.effect_row(ti, T)
        else:
            tr = np.array([level_times[ti] - tc])
        parts.append(tr)
        parts.append(np.outer(gr, tr).ravel())
        if baseline is not None:
            parts.append(np.zeros(1))
        return np.concatenate(parts)

    Ls = {(g, ti): row_L(g, ti) for ti in range(T) for g in range(G)}
    tq = float(stats.t.ppf(0.5 + ci_level / 2, inter_df))
    gat = []
    for ti in range(T):
        for g in range(G):
            e, c = mm.estimate(fit, Ls[(g, ti)])
            se = math.sqrt(max(c[0, 0], 0.0))
            sel = (d["group"] == g) & (d["time_index"] == ti)
            gat.append({"time": tnames[ti], "group": d["groups"][g],
                        "mean": float(e[0]), "se": se,
                        "ci": [float(e[0] - tq * se), float(e[0] + tq * se)],
                        "df": int(inter_df), "n": int(sel.sum()),
                        "raw_mean": (float(d["y"][sel].mean())
                                     if sel.any() else None)})

    diffs = None
    comp_method = options.get("comparisons", "sidak")
    if G > 1 and comp_method:
        fams = [(f"Time {tnames[ti]}",
                 np.array([Ls[(g, ti)] for g in range(G)]),
                 list(d["groups"]), inter_df) for ti in range(T)]
        diffs = family_comparisons(
            fit, fams, comp_method, ci_level=ci_level,
            control_index=options.get("control_index", 0),
            scope_label="groups compared at each time point")
        for cmp in diffs["comparisons"]:
            cmp["time"] = cmp["family"][len("Time "):]

    cov_block = {"kind": kind,
                 "label": LABELS["ar1_only" if kind == "ar1" and not ri
                                 else kind],
                 "parameters": fit["params"],
                 "implied_covariance": fit["implied_covariance"].tolist(),
                 "times": tnames}
    fit_block = {"method": method.upper(),
                 "minus2_log_likelihood": fit["minus2_log_likelihood"],
                 ("reml_loglik" if method == "reml" else "log_likelihood"):
                     fit["log_likelihood"],
                 "aic": fit["aic"], "bic": fit["bic"],
                 "n_covariance_parameters": fit["n_cov_params"],
                 "converged": fit["converged"]}
    n_cells = S * T
    out = {
        "analysis": "mixed_timecourse",
        "method": (f"Linear mixed model ({method.upper()}), "
                   f"{cov_block['label'].lower()}; Type III Wald F tests"),
        "formula": _formula(kind, ri, time_as, baseline is not None),
        "anova": anova,
        "covariance": cov_block,
        "fit": fit_block,
        "fixed_effects": {"names": _x_names(terms, d, time_as),
                          "estimates": [float(v) for v in fit["beta"]],
                          "se": [float(math.sqrt(max(v, 0)))
                                 for v in np.diag(fit["cov_beta"])],
                          "coding": "effect (sum-to-zero) coding"},
        "group_at_time": gat,
        "group_difference_at_time": diffs,
        "groups": d["groups"], "times": tnames,
        "time_as": time_as,
        "time_centre": tc,
        "n_subjects": S, "n_values": int(d["y"].size),
        "n_missing": int(n_cells - d["y"].size),
        "df": {"between_subjects": int(df_b), "within_subjects": int(df_w)},
        "df_method": ("between-within (SAS DDFM=BETWITHIN)"
                      + ("; unstructured: between-subject df for every term"
                         if kind == "unstructured" else "")),
        "warnings": warnings,
    }
    if baseline_note:
        out["baseline_note"] = baseline_note
    if time_as == "linear":
        out["time_note"] = (f"Time enters as a straight line centred at "
                            f"{tc:.4g}: the Group test compares groups at "
                            "that time, Time tests the average slope and "
                            "Group × Time whether slopes differ.")

    if comparison is not None:
        out["model_comparison"] = comparison

    if options.get("include_auc"):
        from . import auc
        raw = d["raw"]
        multi = {s for s, g in {(r[0], r[1]) for r in raw}
                 if len({r[1] for r in raw if r[0] == s}) > 1}
        subj_lbl = [f"{r[1]} / {r[0]}" if r[0] in multi else r[0]
                    for r in raw]
        if not d.get("time_values") and _num(raw[0][2]) is None:
            warnings.append("AUC needs numeric times; not computed.")
        else:
            out["auc"] = auc.subject_auc(
                subj_lbl, [r[1] for r in raw], [_num(r[2]) for r in raw],
                [r[3] for r in raw],
                baseline=options.get("auc_baseline", "zero"),
                ci_level=ci_level)
    return out


def _x_names(terms, d, time_as):
    names = ["Intercept"]
    for t in terms:
        if len(t["cols"]) == 1:
            names.append(t["name"])
        else:
            names += [f"{t['name']} [{i + 1}]" for i in range(len(t["cols"]))]
    return names


def _formula(kind, ri, time_as, baseline):
    fixed = "value ~ group * time" + (" + baseline" if baseline else "")
    if time_as == "factor":
        fixed = fixed.replace("time", "factor(time)", 1)
    return {
        "cs": f"lme4: {fixed} + (1 | subject)",
        "ar1": (f"nlme: lme({fixed}, random = ~1 | subject, correlation = "
                "corAR1(form = ~ time_index | subject))" if ri else
                f"nlme: gls({fixed}, correlation = corAR1(form = ~ "
                "time_index | subject))"),
        "unstructured": (f"nlme: gls({fixed}, correlation = corSymm(form = "
                         "~ time_index | subject), weights = varIdent(form "
                         "= ~ 1 | time))"),
        "random_slope": f"lme4: {fixed} + (1 + time | subject)",
    }[kind]
