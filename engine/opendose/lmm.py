"""General linear mixed model on a long table: fixed factors and
continuous covariates, one grouping column with an optional second level
nested in it (animal / slice / cell, litter / pup) and random slopes,
fitted by REML, with Kenward-Roger or Satterthwaite denominator df.

Model (lme4 notation; Bates, Maechler, Bolker & Walker 2015, "Fitting
linear mixed-effects models using lme4", J Stat Softw 67(1)):

    y ~ A * B + x1 + x2 + (1 + x1 | g1) + (1 | g1:g2)

Random effects b = Lambda(theta) u, u ~ N(0, sigma^2 I), so the random-
effect covariance of each term is G = sigma^2 Lambda Lambda'; Lambda is
lower triangular per term (an unstructured G for correlated intercept and
slopes, "(x | g)") or diagonal ("(x || g)" and every intercept-only term).
The profiled REML deviance is minimised over theta (Bates et al. 2015,
eq. 41 and section 3.4):

    d_R(theta) = log|L_theta|^2 + log|R_X|^2
                 + (n - p) [1 + log(2 pi r^2 / (n - p))],

L_theta the Cholesky factor of Lambda' Z' Z Lambda + I, R_X that of
X' H^-1 X (H = I + Z Lambda Lambda' Z'), r^2 the penalised residual sum
of squares. Every random term here is nested in the top-level grouping
column g1, so L_theta is block diagonal by g1 group and each block is
factored on its own (batched), which keeps memory linear in the number
of groups. Fixed effects use treatment coding (the first level is the
reference), so the coefficient table is the one lme4 prints; the Type
III F test of each term is a test of the cell means (a main effect:
equal marginal means averaged over the other factor; the interaction:
every 2 x 2 difference of differences is zero; a covariate: its slope is
zero), which does not depend on the coding (SAS PROC MIXED's Type III
tests; emmeans' joint tests).

Denominator df: Kenward & Roger (1997) or Satterthwaite as in lmerTest
(Kuznetsova, Brockhoff & Christensen 2017, J Stat Softw 82(13)),
computed by opendose.ddfm.GeneralBlockDdf in the natural (co)variance
parameters (each variance and covariance of G and sigma^2; V is linear
in them). A variance estimated at zero (a boundary fit, lme4's "singular
fit") is held at zero for the df: its parameters are left out of the
df computation, as the model then reduces to the one without them.

Boundary fits and non-convergence are reported in words: a term whose
relative Cholesky factor has a zero on its diagonal (below 1e-4, lme4's
isSingular tolerance) is singular; convergence is checked with the
gradient of the deviance scaled by its Hessian (lme4's relative-gradient
check, tolerance 0.002) at the optimum.

Covariates and the outcome are scaled to unit SD before fitting and the
estimates scaled back, so the fit does not depend on units (results scale
exactly as the maths says) and very large or small magnitudes stay
well conditioned.

Only numpy and scipy are used, so the module runs under Pyodide.
"""

from __future__ import annotations

import math
from itertools import product

import numpy as np
from scipy import optimize, stats

from . import ddfm
from .mixed_nested import (COMPARISON_METHODS, _label, _missing, _num,
                           _order, family_comparisons)

_LN2PI = math.log(2.0 * math.pi)
SINGULAR_TOL = 1e-4
GRAD_TOL = 2e-3
MAX_RANDOM_SLOPES = 2

SOURCES = ("Bates et al. 2015, J Stat Softw 67(1) (lme4); Kenward & Roger "
           "1997, Biometrics 53:983; Kuznetsova et al. 2017, J Stat Softw "
           "82(13) (lmerTest)")


# ------------------------------------------------------------- the fit

class _Model:
    """Block-diagonal REML problem: y, X (n x p), random terms nested in
    the top-level groups `block` (n codes)."""

    def __init__(self, y, X, terms, block):
        self.y = np.asarray(y, float)
        self.X = np.asarray(X, float)
        self.n, self.p = self.X.shape
        self.terms = terms
        block = np.asarray(block, int)
        self.n_blocks = int(block.max()) + 1
        self.block_rows = [np.flatnonzero(block == s)
                           for s in range(self.n_blocks)]
        # theta layout: per term, lower-triangular entries column by
        # column (lme4's order); the diagonal structure keeps only (a, a)
        self.theta_index = []
        lower = []
        k = 0
        for t in terms:
            r = t["Z"].shape[1]
            idx = {}
            for b in range(r):
                for a in range(b, r):
                    if a != b and t["structure"] == "diagonal":
                        continue
                    idx[(a, b)] = k
                    lower.append(0.0 if a == b else -np.inf)
                    k += 1
            self.theta_index.append(idx)
        self.n_theta = k
        self.lower = np.array(lower)
        # per-block slots (term, level, coefficient) and cross-products
        self.slots = []
        for rows in self.block_rows:
            sl = []
            for ti, t in enumerate(terms):
                for lev in np.unique(t["codes"][rows]):
                    for a in range(t["Z"].shape[1]):
                        sl.append((ti, int(lev), a))
            self.slots.append(sl)
        self.qmax = max(len(s) for s in self.slots)
        S, q, p = self.n_blocks, self.qmax, self.p
        self.ZtZ = np.zeros((S, q, q))
        self.ZtXy = np.zeros((S, q, p + 1))
        self.Zs = []
        lam_s, lam_k, lam_l, lam_t = [], [], [], []
        for s, rows in enumerate(self.block_rows):
            Zb = np.zeros((rows.size, q))
            first = {}
            for k_, (ti, lev, a) in enumerate(self.slots[s]):
                t = terms[ti]
                Zb[:, k_] = t["Z"][rows, a] * (t["codes"][rows] == lev)
                first.setdefault((ti, lev), k_)
            for (ti, lev), k0 in first.items():
                for (a, b), th in self.theta_index[ti].items():
                    lam_s.append(s)
                    lam_k.append(k0 + a)
                    lam_l.append(k0 + b)
                    lam_t.append(th)
            self.Zs.append(Zb)
            self.ZtZ[s] = Zb.T @ Zb
            self.ZtXy[s] = Zb.T @ np.column_stack([self.X[rows], self.y[rows]])
        self.lam = (np.array(lam_s, int), np.array(lam_k, int),
                    np.array(lam_l, int), np.array(lam_t, int))
        Xy = np.column_stack([self.X, self.y])
        self.XytXy = Xy.T @ Xy
        self.eye = np.broadcast_to(np.eye(q), (S, q, q))

    def lambdas(self, theta):
        s, k, l, t = self.lam
        Lam = np.zeros((self.n_blocks, self.qmax, self.qmax))
        Lam[s, k, l] = np.asarray(theta, float)[t]
        return Lam

    def solve(self, theta):
        Lam = self.lambdas(theta)
        LamT = np.transpose(Lam, (0, 2, 1))
        A = LamT @ self.ZtZ @ Lam + self.eye
        try:
            C = np.linalg.cholesky(A)
        except np.linalg.LinAlgError:
            return None
        logdet_a = 2.0 * float(np.sum(np.log(np.diagonal(C, axis1=1, axis2=2))))
        B = LamT @ self.ZtXy                      # S x q x (p+1)
        AiB = np.linalg.solve(A, B)
        M = self.XytXy - np.einsum("sqi,sqj->ij", B, AiB)
        p = self.p
        XtHiX = (M[:p, :p] + M[:p, :p].T) / 2.0
        try:
            R = np.linalg.cholesky(XtHiX)
        except np.linalg.LinAlgError:
            return None
        logdet_x = 2.0 * float(np.sum(np.log(np.diag(R))))
        beta = np.linalg.solve(XtHiX, M[:p, p])
        quad = float(M[p, p] - beta @ M[:p, p])
        dfr = self.n - p
        if not quad > 0 or dfr <= 0:
            return None
        sigma2 = quad / dfr
        crit = dfr * (_LN2PI + math.log(sigma2) + 1.0) + logdet_a + logdet_x
        return {"crit": crit, "beta": beta, "sigma2": sigma2,
                "XtHiX": XtHiX, "Lam": Lam, "A": A}

    def objective(self, theta):
        sol = self.solve(theta)
        return math.inf if sol is None else sol["crit"]

    def gradient(self, theta, h=1e-6):
        theta = np.asarray(theta, float)
        g = np.zeros(self.n_theta)
        for i in range(self.n_theta):
            hi = h * max(1.0, abs(theta[i]))
            up, dn = theta.copy(), theta.copy()
            up[i] += hi
            dn[i] -= hi
            lo = self.lower[i]
            if dn[i] < lo:            # one-sided at the bound
                dn[i] = theta[i]
                g[i] = (self.objective(up) - self.objective(dn)) / hi
            else:
                g[i] = (self.objective(up) - self.objective(dn)) / (2 * hi)
        return g

    def hessian(self, theta, h=1e-4):
        theta = np.asarray(theta, float)
        k = self.n_theta
        H = np.zeros((k, k))
        for i in range(k):
            hi = h * max(1.0, abs(theta[i]))
            e = np.zeros(k)
            e[i] = hi
            H[:, i] = (self.gradient(theta + e) - self.gradient(theta - e)) / (2 * hi)
        return (H + H.T) / 2.0


def _minimize(model):
    """Multi-start L-BFGS-B over theta with bounds (diagonal entries of
    Lambda >= 0), central-difference gradients; returns theta."""
    k = model.n_theta
    bounds = [(0.0 if np.isfinite(lo) else None, None) for lo in model.lower]
    diag = np.isfinite(model.lower)

    def f(th):
        v = model.objective(th)
        return v if math.isfinite(v) else 1e300

    best = None
    for scale in (1.0, 0.3, 3.0, 0.05):
        x0 = np.where(diag, scale, 0.0)
        res = optimize.minimize(f, x0, jac=model.gradient, method="L-BFGS-B",
                                bounds=bounds,
                                options={"ftol": 1e-15, "gtol": 1e-9,
                                         "maxiter": 3000})
        if best is None or res.fun < best.fun - 1e-10:
            best = res
    # restart from the best point, then a Powell polish (derivative free)
    res = optimize.minimize(f, best.x, jac=model.gradient, method="L-BFGS-B",
                            bounds=bounds,
                            options={"ftol": 1e-16, "gtol": 1e-10,
                                     "maxiter": 3000})
    x = res.x if res.fun <= best.fun else best.x
    pw = optimize.minimize(f, x, method="Powell",
                           bounds=[(b[0] if b[0] is not None else -1e6,
                                    1e6) for b in bounds],
                           options={"xtol": 1e-10, "ftol": 1e-15,
                                    "maxiter": 20000})
    if pw.fun < f(x) - 1e-12:
        x = pw.x
    x = np.asarray(x, float)
    x[diag] = np.maximum(x[diag], 0.0)
    return x, k


def _convergence(model, theta):
    """(converged, message): lme4's relative-gradient check on the
    coordinates off the boundary, and a positive-definite Hessian."""
    g = model.gradient(theta)
    free = ~(np.isfinite(model.lower) & (theta <= 1e-8))
    # at the bound the gradient must point outward (into theta < 0)
    if np.any(~free & (g < -1e-3 * max(1.0, abs(model.objective(theta))))):
        return False, "the gradient at the boundary points inward"
    idx = np.flatnonzero(free)
    if idx.size == 0:
        return True, "every variance on the boundary"
    H = model.hessian(theta)[np.ix_(idx, idx)]
    try:
        np.linalg.cholesky(H)
    except np.linalg.LinAlgError:
        return False, ("the curvature of the REML criterion is not "
                       "positive definite at the optimum")
    rel = np.linalg.solve(H, g[idx])
    if np.max(np.abs(rel)) > GRAD_TOL:
        return False, (f"the scaled gradient {np.max(np.abs(rel)):.2g} "
                       f"exceeds {GRAD_TOL}")
    return True, "converged"


# ------------------------------------------------- Kenward-Roger / Satt.

def _natural_params(model, theta, sigma2):
    """The natural (co)variance parameters, each with its block
    derivative matrices, leaving out singular dimensions (boundary).
    Returns ([(term, a, b)], [blocks of (rows, V, [dV])])."""
    keep = []
    for ti, t in enumerate(model.terms):
        r = t["Z"].shape[1]
        Lt = np.zeros((r, r))
        for (a, b), k in model.theta_index[ti].items():
            Lt[a, b] = theta[k]
        live = [a for a in range(r) if abs(Lt[a, a]) > SINGULAR_TOL]
        for (a, b) in model.theta_index[ti]:
            if a == b and a in live:
                keep.append((ti, a, a))
            elif a != b and a in live and b in live:
                keep.append((ti, a, b))
    Lam_all = model.lambdas(theta)
    blocks = []
    for s, rows in enumerate(model.block_rows):
        Zb = model.Zs[s]
        Lam = Lam_all[s]
        ZL = Zb @ Lam
        V = sigma2 * (np.eye(rows.size) + ZL @ ZL.T)
        dV = []
        for ti, a, b in keep:
            M = np.zeros((rows.size, rows.size))
            for k_, (tj, lev, c) in enumerate(model.slots[s]):
                if tj != ti or c != a:
                    continue
                kb = model.slots[s].index((ti, lev, b))
                za, zb = Zb[:, k_], Zb[:, kb]
                M += np.outer(za, zb) + (np.outer(zb, za) if a != b else 0.0)
            dV.append(M)
        dV.append(np.eye(rows.size))
        blocks.append((rows, V, dV))
    return keep, blocks


class _Scaled:
    """A Ddf object of the scaled model seen in the original units:
    beta = M beta_int with M diagonal."""

    def __init__(self, D, M):
        self.D, self.M = D, np.asarray(M, float)
        self.beta = self.M * D.beta

    def cov(self, method):
        return self.D.cov(method) * np.outer(self.M, self.M)

    def contrast(self, method, l):
        return self.D.contrast(method, self.M * np.asarray(l, float))

    def test(self, method, L):
        return self.D.test(method, np.atleast_2d(L) * self.M[None, :])


# ------------------------------------------------------------ the model

def _fmt_formula(outcome, factors, covariates, g1, g2, slopes, structure,
                 interaction):
    fixed = " * ".join(factors) if interaction else " + ".join(factors)
    parts = [p for p in [fixed] + list(covariates) if p]
    rhs = " + ".join(parts) if parts else "1"
    if slopes:
        sep = " || " if structure == "diagonal" else " | "
        rand = f"(1 + {' + '.join(slopes)}{sep}{g1})"
    else:
        rand = f"(1 | {g1})"
    if g2:
        rand += f" + (1 | {g1}:{g2})"
    return f"{outcome} ~ {rhs} + {rand}"


def fit_lmm(y, factors, covariates, g1_codes, *, g2_codes=None,
            group_names=("group", "subgroup"), slopes=(),
            slope_structure="correlated", ddf="kenward_roger",
            ci_level=0.95, comparisons=None, comparison_scope=None,
            control_index=0, interaction=True) -> dict:
    """y: values; factors: [(name, codes, levels)] (0, 1 or 2);
    covariates: [(name, values)]; g1_codes: top-level group codes;
    g2_codes: second level (already unique across g1 groups) or None;
    slopes: names of covariates with a random slope on g1."""
    if ddf not in ("kenward_roger", "satterthwaite"):
        raise ValueError("ddf must be 'kenward_roger' or 'satterthwaite' "
                         "(containment df are not defined for covariates "
                         "and random slopes)")
    if slope_structure not in ("correlated", "independent"):
        raise ValueError("slope_structure must be 'correlated' or "
                         "'independent'")
    y = np.asarray(y, float)
    n = y.size
    warnings = []
    g1 = np.unique(np.asarray(g1_codes), return_inverse=True)[1]
    n_g1 = int(g1.max()) + 1 if n else 0
    g2 = (np.unique(np.asarray(g2_codes), return_inverse=True)[1]
          if g2_codes is not None else None)
    n_g2 = int(g2.max()) + 1 if g2 is not None else 0
    g1_word, g2_word = group_names
    if n_g1 < 2:
        raise ValueError(f"need at least 2 levels of {g1_word} (the "
                         "grouping column)")
    active = [(nm, np.asarray(c, int), lv) for nm, c, lv in factors
              if len(lv) >= 2]
    for nm, _, lv in factors:
        if len(lv) < 2:
            warnings.append(f"{nm} has a single level and is left out of "
                            "the model.")
    if len(active) > 2:
        raise ValueError("at most two factors")
    covs = []
    for nm, vals in covariates:
        v = np.asarray(vals, float)
        sd = float(v.std())
        if not sd > 0:
            raise ValueError(f"covariate {nm} has the same value in every "
                             "row, so its slope cannot be estimated")
        covs.append((nm, v, sd))
    slopes = list(slopes)
    for s_ in slopes:
        if s_ not in [c[0] for c in covs]:
            raise ValueError(f"a random slope needs {s_} as a covariate")
    if len(slopes) > MAX_RANDOM_SLOPES:
        raise ValueError(f"at most {MAX_RANDOM_SLOPES} random slopes")

    # every cell of the factors needs data
    if active:
        levels = [lv for _, _, lv in active]
        present = set(zip(*[c.tolist() for _, c, _ in active]))
        empty = [cell for cell in product(*[range(len(lv)) for lv in levels])
                 if cell not in present]
        if empty:
            txt = ", ".join(" / ".join(levels[f][i] for f, i in enumerate(c))
                            for c in empty[:5])
            raise ValueError(f"every combination of the factors needs "
                             f"data; empty: {txt}")

    # fixed effects, treatment coding; covariates scaled to unit SD
    names = ["(Intercept)"]
    cols = [np.ones(n)]
    scale = [1.0]
    term_cols = []
    dummies = []
    for nm, c, lv in active:
        D = np.column_stack([(c == i).astype(float) for i in range(1, len(lv))])
        dummies.append(D)
        k0 = len(cols)
        for i in range(1, len(lv)):
            cols.append(D[:, i - 1])
            names.append(f"{nm}: {lv[i]}")
            scale.append(1.0)
        term_cols.append(list(range(k0, len(cols))))
    inter_cols = []
    if len(active) == 2 and interaction:
        (na, _, la), (nb, _, lb) = active
        for i in range(1, len(la)):
            for j in range(1, len(lb)):
                cols.append(dummies[0][:, i - 1] * dummies[1][:, j - 1])
                names.append(f"{na}: {la[i]} × {nb}: {lb[j]}")
                scale.append(1.0)
                inter_cols.append(len(cols) - 1)
    cov_cols = {}
    for nm, v, sd in covs:
        cols.append(v / sd)
        names.append(nm)
        scale.append(sd)
        cov_cols[nm] = len(cols) - 1
    X = np.column_stack(cols)
    p = X.shape[1]
    if np.linalg.matrix_rank(X) < p:
        raise ValueError("the fixed effects are confounded (a covariate is "
                         "a combination of the factors or of another "
                         "covariate): remove one")
    sy = float(y.std())
    if not sy > 0:
        raise ValueError("every value of the outcome is the same: there is "
                         "no variation to model")
    yi = y / sy

    # random terms
    Z1 = [np.ones(n)] + [covs[[c[0] for c in covs].index(s_)][1]
                         / covs[[c[0] for c in covs].index(s_)][2]
                         for s_ in slopes]
    z_scale = [1.0] + [covs[[c[0] for c in covs].index(s_)][2] for s_ in slopes]
    for s_, z in zip(slopes, Z1[1:]):
        varies = sum(1 for g in range(n_g1) if np.ptp(z[g1 == g]) > 0)
        if varies == 0:
            raise ValueError(f"{s_} does not vary within any {g1_word}: a "
                             "random slope cannot be estimated (remove it)")
        if varies < n_g1:
            warnings.append(f"{s_} varies within {varies} of {n_g1} "
                            f"{g1_word} only; the slope variance rests on "
                            "those.")
    terms = [{"name": g1_word, "codes": g1, "Z": np.column_stack(Z1),
              "coef": ["(Intercept)"] + slopes,
              "structure": ("diagonal" if slope_structure == "independent"
                            else "unstructured")}]
    if g2 is not None:
        terms.append({"name": g2_word, "codes": g2, "Z": np.ones((n, 1)),
                      "coef": ["(Intercept)"], "structure": "diagonal"})
    q_total = n_g1 * len(Z1) + n_g2
    n_theta_est = sum(len(t["coef"]) * (len(t["coef"]) + 1) // 2
                      if t["structure"] == "unstructured" else len(t["coef"])
                      for t in terms)
    if n - p < 1 + n_theta_est:
        raise ValueError(f"too few values ({n}) for {p} fixed effects and "
                         f"{n_theta_est} variance parameters")
    if g2 is not None:
        sizes = np.bincount(g2)
        if sizes.max() < 2:
            raise ValueError(f"each {g2_word} holds one value: the "
                             f"{g2_word} level is the residual; leave the "
                             "second level out")
        per_g1 = [np.unique(g2[g1 == g]).size for g in range(n_g1)]
        if max(per_g1) < 2:
            warnings.append(f"each {g1_word} holds a single {g2_word}: the "
                            f"two variances cannot be told apart.")

    model = _Model(yi, X, terms, g1)
    theta, _ = _minimize(model)
    sol = model.solve(theta)
    if sol is None:
        raise ValueError("the mixed model could not be fitted (the "
                         "covariance is not positive definite)")
    converged, conv_msg = _convergence(model, theta)
    s2i = sol["sigma2"]
    Mb = sy / np.asarray(scale)
    beta = Mb * sol["beta"]
    cov_beta = s2i * np.linalg.inv(sol["XtHiX"]) * np.outer(Mb, Mb)
    cov_beta = (cov_beta + cov_beta.T) / 2.0
    sigma2 = s2i * sy * sy
    # back to the original units: log|X'H^-1 X| gains 2 log(scale) per
    # scaled column, the residual term (n - p) log(sy^2)
    crit = (sol["crit"] + (n - p) * math.log(sy * sy)
            + 2.0 * float(np.sum(np.log(scale))))
    n_cov = model.n_theta + 1
    npar = n_cov + p   # lme4 counts every parameter in AIC / BIC

    # random-effect covariances in the original units
    random_effects, correlations, boundary = [], [], []
    for ti, t in enumerate(terms):
        r = len(t["coef"])
        Lt = np.zeros((r, r))
        for (a, b), k in model.theta_index[ti].items():
            Lt[a, b] = theta[k]
        zs = np.array(z_scale[:r] if ti == 0 else [1.0])
        G = s2i * (Lt @ Lt.T) * np.outer(sy / zs, sy / zs)
        for a in range(r):
            sing = abs(Lt[a, a]) <= SINGULAR_TOL
            random_effects.append({
                "group": t["name"], "coefficient": t["coef"][a],
                "variance": float(G[a, a]), "sd": math.sqrt(max(G[a, a], 0.0)),
                "n_levels": int(n_g1 if ti == 0 else n_g2),
                "at_boundary": bool(sing)})
            if sing:
                boundary.append(f"{t['coef'][a]} by {t['name']}")
        for a in range(r):
            for b in range(a):
                if t["structure"] == "unstructured":
                    d = math.sqrt(max(G[a, a], 0) * max(G[b, b], 0))
                    correlations.append({
                        "group": t["name"],
                        "between": [t["coef"][b], t["coef"][a]],
                        "r": float(G[a, b] / d) if d > 0 else None})
    if converged and correlations:
        for c in correlations:
            if c["r"] is not None and abs(c["r"]) > 0.999:
                boundary.append(f"the correlation of {c['between'][0]} and "
                                f"{c['between'][1]} by {c['group']} "
                                f"(r = {c['r']:.3g})")

    # Kenward-Roger / Satterthwaite in the scaled model
    keep, blocks = _natural_params(model, theta, s2i)
    D0 = ddfm.GeneralBlockDdf(yi, X, blocks)
    D = _Scaled(D0, Mb)
    tq = lambda df: float(stats.t.ppf(0.5 + ci_level / 2, df))  # noqa: E731

    fixed = []
    for k, nm in enumerate(names):
        l = np.zeros(p)
        l[k] = 1.0
        se, dfk = D.contrast(ddf, l)
        est = float(beta[k])
        t_ = est / se if se > 0 else math.nan
        fixed.append({"term": nm, "estimate": est, "se": float(se),
                      "se_model": math.sqrt(max(cov_beta[k, k], 0.0)),
                      "df": float(dfk), "t": float(t_),
                      "p": float(2 * stats.t.sf(abs(t_), dfk)),
                      "ci": [est - tq(dfk) * se, est + tq(dfk) * se]})

    # cell means at the covariate means (emmeans' reference grid)
    cov_means = {nm: float(v.mean()) for nm, v, _ in covs}
    levels = [lv for _, _, lv in active]
    cells = list(product(*[range(len(lv)) for lv in levels])) if active else []

    def cell_row(cell):
        row = np.zeros(p)
        row[0] = 1.0
        for f, i in enumerate(cell):
            if i > 0:
                row[term_cols[f][i - 1]] = 1.0
        if inter_cols and cell[0] > 0 and cell[1] > 0:
            row[inter_cols[(cell[0] - 1) * (len(levels[1]) - 1)
                           + cell[1] - 1]] = 1.0
        for nm, v, sd in covs:
            row[cov_cols[nm]] = cov_means[nm]
        return row

    Lcell = np.array([cell_row(c) for c in cells]) if cells else np.zeros((0, p))

    def marginal_rows(f):
        rows = []
        for i in range(len(levels[f])):
            idx = [k for k, c in enumerate(cells) if c[f] == i]
            rows.append(Lcell[idx].mean(axis=0))
        return np.array(rows)

    anova = []
    if not converged:
        warnings.append(f"The REML fit did not converge ({conv_msg}). The "
                        "estimates may be wrong: simplify the random part "
                        "(drop a random slope, or use independent slopes).")
    for f, (nm, _, lv) in enumerate(active):
        Lm = marginal_rows(f)
        Lt_ = Lm[:-1] - Lm[-1]
        anova.append({"term": nm, **_test(D, ddf, Lt_)})
    if len(active) == 2 and interaction:
        a_, b_ = len(levels[0]), len(levels[1])
        rows = []
        idx = {c: k for k, c in enumerate(cells)}
        for i in range(a_ - 1):
            for j in range(b_ - 1):
                rows.append(Lcell[idx[(i, j)]] - Lcell[idx[(i, b_ - 1)]]
                            - Lcell[idx[(a_ - 1, j)]]
                            + Lcell[idx[(a_ - 1, b_ - 1)]])
        anova.append({"term": f"{active[0][0]} × {active[1][0]}",
                      **_test(D, ddf, np.array(rows))})
    for nm, _, _ in covs:
        l = np.zeros((1, p))
        l[0, cov_cols[nm]] = 1.0
        anova.append({"term": nm, **_test(D, ddf, l)})

    emm = {}
    if cells:
        def means_of(L, labels):
            out = []
            for k, lab in enumerate(labels):
                se, dfk = D.contrast(ddf, L[k])
                est = float(L[k] @ beta)
                out.append({"level": lab, "mean": est, "se": float(se),
                            "df": float(dfk),
                            "ci": [est - tq(dfk) * se, est + tq(dfk) * se]})
            return out
        for f, (nm, _, lv) in enumerate(active):
            emm[nm] = means_of(marginal_rows(f), list(lv))
        if len(active) == 2:
            emm["cells"] = means_of(Lcell, [" / ".join(levels[f][i] for f, i
                                                       in enumerate(c))
                                            for c in cells])

    # share of the variance (random intercepts only)
    shares = None
    if not slopes:
        tot = sigma2 + sum(r_["variance"] for r_ in random_effects)
        if tot > 0:
            shares = {r_["group"]: r_["variance"] / tot for r_ in random_effects}
            shares["Residual"] = sigma2 / tot

    out = {
        "fixed_effects": fixed,
        "anova": anova,
        "random_effects": random_effects,
        "correlations": correlations,
        "residual": {"variance": float(sigma2), "sd": math.sqrt(sigma2)},
        "variance_shares": shares,
        "boundary": boundary,
        "singular": bool(boundary),
        "converged": bool(converged),
        "convergence": conv_msg,
        "emmeans": emm,
        "covariate_means": cov_means,
        "n_values": int(n),
        "n_groups": {g1_word: int(n_g1),
                     **({g2_word: int(n_g2)} if g2 is not None else {})},
        "n_fixed": int(p),
        "n_covariance_parameters": int(n_cov),
        "ddf": ddf, "df_method": ddfm.LABELS[ddf],
        "ddf_parameters_dropped": int(model.n_theta - len(keep)),
        "goodness_of_fit": {
            "reml_criterion": float(crit),
            "log_likelihood": float(-crit / 2.0),
            "aic": float(crit + 2 * npar),
            "bic": float(crit + npar * math.log(n)),
            "n_parameters": int(npar)},
        "factor_names": [nm for nm, _, _ in active],
        "levels": {nm: list(lv) for nm, _, lv in active},
        "covariates": [nm for nm, _, _ in covs],
        "random_slopes": slopes,
        "slope_structure": slope_structure,
        "ci_level": ci_level,
        "comparisons": None,
    }
    if boundary:
        warnings.append(
            "Boundary (singular) fit: " + "; ".join(boundary) + " estimated "
            "at zero or at a correlation of ±1. The data cannot separate "
            "that variance from the others; the model is equivalent to one "
            "without it. Consider removing it from the random part.")
    if comparisons and cells:
        if comparisons not in COMPARISON_METHODS:
            raise ValueError(f"unknown multiple-comparisons method: "
                             f"{comparisons}")
        two = len(active) == 2
        scope = comparison_scope or ("b_within_a" if two else "a_means")
        if not two and scope != "a_means":
            scope = "a_means"
        fams = []
        if scope == "cells" and two:
            fams.append(("All cells", Lcell, [e["level"] for e in emm["cells"]], None))
        elif scope in ("b_within_a", "a_within_b") and two:
            outer, inner = (0, 1) if scope == "b_within_a" else (1, 0)
            for i in range(len(levels[outer])):
                idx = [k for k, c in enumerate(cells) if c[outer] == i]
                fams.append((f"{active[outer][0]}: {levels[outer][i]}",
                             Lcell[idx], [levels[inner][cells[k][inner]]
                                          for k in idx], None))
        else:
            f = 1 if scope == "b_means" and two else 0
            fams.append((f"{active[f][0]} (marginal means)",
                         marginal_rows(f), list(levels[f]), None))
        out["comparisons"] = family_comparisons(
            None, fams, comparisons, ci_level=ci_level,
            control_index=control_index, scope_label=scope, D=D, ddf=ddf)
    out["warnings"] = warnings
    return out


def _test(D, ddf, L):
    res = D.test(ddf, L)
    return {"f": float(res["F"]), "dfn": int(res["df_num"]),
            "dfd": float(res["df_den"]), "p": res["p"]}


# ------------------------------------------------------------ handler

def lmm_long(variables, outcome, *, factors=(), covariates=(), group,
             subgroup=None, slopes=(), options=None) -> dict:
    """Long (multiple-variables) table: variables [{"name", "values"}],
    rows aligned. factors are read as labels, covariates as numbers;
    group is the top-level grouping column, subgroup a second level
    nested in it (its labels are read within each group, so "slice 1"
    of two animals are two slices, lme4's (1 | group:subgroup))."""
    options = options or {}
    factors, covariates, slopes = list(factors), list(covariates), list(slopes)
    cols = {v.get("name"): v.get("values") or [] for v in variables}
    used = [outcome, group, *factors, *covariates] + ([subgroup] if subgroup
                                                      else [])
    for nm in used:
        if nm not in cols:
            raise ValueError(f"no variable named {nm!r}")
    if len(set(used)) != len(used):
        raise ValueError("the outcome, factors, covariates and grouping "
                         "columns must be different variables")
    if not 0 <= len(factors) <= 2:
        raise ValueError("zero, one or two factors")
    n = max(len(c) for c in cols.values())

    def at(nm, i):
        c = cols[nm]
        return c[i] if i < len(c) else None

    ys, fl, cl, g1l, g2l = [], [[] for _ in factors], [[] for _ in covariates], [], []
    dropped = 0
    for i in range(n):
        v = _num(at(outcome, i))
        cv = [_num(at(c, i)) for c in covariates]
        fv = [at(f, i) for f in factors]
        g = at(group, i)
        h = at(subgroup, i) if subgroup else "."
        if (v is None or any(x is None for x in cv) or _missing(g)
                or _missing(h) or any(_missing(x) for x in fv)):
            if not all(_missing(at(nm, i)) for nm in used):
                dropped += 1
            continue
        ys.append(v)
        for k, x in enumerate(fv):
            fl[k].append(_label(x))
        for k, x in enumerate(cv):
            cl[k].append(x)
        g1l.append(_label(g))
        g2l.append(_label(h))
    warnings = []
    if dropped:
        warnings.append(f"{dropped} row{'s' if dropped > 1 else ''} with a "
                        "blank or non-numeric value in a column the model "
                        "uses left out.")
    if len(ys) < 3:
        raise ValueError("need at least 3 complete rows")
    level_opts = options.get("levels") or {}
    fac = []
    for k, nm in enumerate(factors):
        lv = _order(fl[k], level_opts.get(nm))
        fac.append((nm, np.array([lv.index(x) for x in fl[k]]), lv))
    groups = _order(g1l)
    g1 = np.array([groups.index(g) for g in g1l])
    g2 = None
    if subgroup:
        keys = _order(list(zip(g1l, g2l)))
        index = {kk: i for i, kk in enumerate(keys)}
        g2 = np.array([index[kk] for kk in zip(g1l, g2l)])
    words = (options.get("group_word") or group,
             options.get("subgroup_word") or (subgroup or ""))
    res = fit_lmm(
        np.array(ys), fac, [(nm, np.array(cl[k])) for k, nm in enumerate(covariates)],
        g1, g2_codes=g2, group_names=words, slopes=slopes,
        slope_structure=options.get("slope_structure", "correlated"),
        ddf=options.get("ddf", "kenward_roger"),
        ci_level=options.get("ci_level", 0.95),
        comparisons=options.get("comparisons"),
        comparison_scope=options.get("comparison_scope"),
        control_index=options.get("control_index", 0),
        interaction=options.get("interaction", True))
    out = {"analysis": "lmm",
           "method": ("Linear mixed model, REML; Type III F tests with "
                      f"{ddfm.LABELS[res['ddf']]} df"),
           "formula": _fmt_formula(outcome, res["factor_names"], covariates,
                                   group, subgroup, slopes,
                                   "diagonal" if options.get("slope_structure")
                                   == "independent" else "unstructured",
                                   options.get("interaction", True)),
           "outcome": outcome, "group": group, "subgroup": subgroup,
           "sources": SOURCES, **res}
    out["warnings"] = warnings + out["warnings"]
    return out
