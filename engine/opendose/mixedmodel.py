"""Linear mixed-effects models fitted by REML, and the repeated-measures
analyses that use them when values are missing.

GraphPad Prism statistics guide pages whose documented method this module
implements (cited for the method only):

- "Analysis details for fitting the mixed model"
  (stat_notes-for-a-statistical-consul.htm): y = X*beta + Z*gamma + eps,
  R = sigma^2 * I, G diagonal with the variance of each random effect,
  V = R + Z*G*Z', fitted by restricted (residual) maximum likelihood.
  Standard errors of contrasts for multiple comparisons are
  sqrt(L*C*L'), C the (generalized) inverse of the mixed model equations.
  Linked FAQs 2103/2104/2105 give the equivalent SAS PROC MIXED / lme4
  code: RANDOM Int / SUBJECT=Subject (one-way RM), RANDOM Int A B /
  SUBJECT=S (two-way RM in both factors), RANDOM Room*Condition (nested).
- "The mixed model approach to analyzing repeated measures data" and
  "How to report the methods used for the mixed model analysis":
  compound-symmetry covariance (random subject intercept), REML; with no
  missing values the P values and multiple comparisons equal RM ANOVA.
  "Was the matching effective?" is a chi-square comparing the fit of the
  full model with the model without the subject random effect.
- "Missing values in repeated measures ANOVA", "Repeated measures tab"
  (one- and two-way): the mixed model is fitted when values are missing;
  a zero or negative variance component is either kept ("analyze as
  usual", which reproduces RM ANOVA for complete data) or the random
  factor is removed and the model refitted.
- "Sphericity and compound symmetry", "Quantifying violations of
  sphericity with epsilon": the model is fitted the same way with or
  without the Geisser-Greenhouse correction; the correction only
  multiplies both F-test df by epsilon (bounded to [1/(k-1), 1]).
- "How Prism computes two-way ANOVA": Type III tests (each term entered
  last), here Wald F tests of the effect-coded term coefficients.
- "Interpreting results: mixed effects model one-way / two-way": fixed
  effect F, DFn, DFd and P; random-effect SD and variance; the matching
  chi-square; goodness of fit.

Denominator degrees of freedom. The guide does not name a df method; the
SAS code it gives as equivalent (PROC MIXED with a RANDOM statement and
no DDFM= option) uses the containment method, and the guide's own
results agree with it (nested t test on unequal subcolumns reports an
integer df=4 = subcolumns - columns; RM one-way reports the RM ANOVA
residual df). So each fixed term is tested against the rank contribution
of the random term that contains it (subjects within groups for a
between-subject factor, subject x factor for a repeated factor when that
random effect is in the model), else against the residual df,
N - rank([X Z]). The same df are used for comparisons of that term's
estimated marginal means.

Only numpy and scipy are used, so the module runs under Pyodide.
"""

from __future__ import annotations

import math
from itertools import combinations, product

import numpy as np
from scipy import integrate, optimize, special, stats

_LN2PI = math.log(2.0 * math.pi)


# ------------------------------------------------------------------ designs

def effect_columns(idx, k: int) -> np.ndarray:
    """Sum-to-zero (effect) coding of a factor with k levels: k-1
    columns, the last level coded -1 throughout."""
    idx = np.asarray(idx, dtype=int)
    cols = np.zeros((idx.size, k - 1))
    for level in range(k - 1):
        cols[idx == level, level] = 1.0
    cols[idx == k - 1, :] = -1.0
    return cols


def effect_row(level: int, k: int) -> np.ndarray:
    """The effect-coding row for one level (used to build L for
    estimated marginal means)."""
    row = np.zeros(k - 1)
    if level == k - 1:
        row[:] = -1.0
    else:
        row[level] = 1.0
    return row


def _interaction(A: np.ndarray, B: np.ndarray) -> np.ndarray:
    if A.shape[1] == 0 or B.shape[1] == 0:
        return np.zeros((A.shape[0], 0))
    return np.column_stack([A[:, i] * B[:, j]
                            for i in range(A.shape[1])
                            for j in range(B.shape[1])])


def _indicator(codes) -> np.ndarray:
    codes = np.asarray(codes, dtype=int)
    levels = np.unique(codes)
    Z = (codes[:, None] == levels[None, :]).astype(float)
    return Z


def _rank(M: np.ndarray) -> int:
    if M.size == 0:
        return 0
    return int(np.linalg.matrix_rank(M))


def rank_contribution(X, Zs, k: int) -> int:
    """Containment df of random term k: rank([X Z_1..Z_k]) minus
    rank([X Z_1..Z_{k-1}]) (SAS PROC MIXED's rank contribution, terms in
    the order they were listed)."""
    before = np.column_stack([X] + list(Zs[:k]))
    after = np.column_stack([X] + list(Zs[:k + 1]))
    return _rank(after) - _rank(before)


# ------------------------------------------------------------- REML core

class _Profile:
    """Profiled REML criterion for V = sigma^2 (I + sum_k g_k Z_k Z_k').

    Works with q x q cross-products only (q = number of random-effect
    levels), using Woodbury and Sylvester identities, so negative
    variance ratios are allowed as long as V stays positive definite.
    """

    def __init__(self, y, X, Zs):
        self.y = y
        self.X = X
        self.n, self.p = X.shape
        self.Zs = Zs
        self.K = len(Zs)
        self.Z = (np.column_stack(Zs) if Zs else np.zeros((self.n, 0)))
        self.comp = np.concatenate(
            [np.full(Z.shape[1], k) for k, Z in enumerate(Zs)]
        ).astype(int) if Zs else np.zeros(0, dtype=int)
        Z = self.Z
        self.S = Z.T @ Z
        self.ZtX = Z.T @ X
        self.Zty = Z.T @ y
        self.XtX = X.T @ X
        self.Xty = X.T @ y
        self.yty = float(y @ y)
        q = Z.shape[1]
        if q:
            w, U = np.linalg.eigh(self.S)
            w = np.clip(w, 0.0, None)
            self.Rh = (U * np.sqrt(w)) @ U.T  # symmetric S^(1/2)
        else:
            self.Rh = np.zeros((0, 0))
        # largest eigenvalue of Z_k Z_k' = largest cluster size
        self.max_cluster = [float(Zk.sum(axis=0).max()) for Zk in Zs]

    def lower_bounds(self, allow_negative: bool):
        if not allow_negative:
            return [0.0] * self.K
        return [-(1.0 - 1e-6) / m for m in self.max_cluster]

    def solve(self, gamma):
        """All REML quantities at variance ratios gamma (None if V is not
        positive definite there)."""
        gamma = np.asarray(gamma, dtype=float)
        q = self.Z.shape[1]
        n, p = self.n, self.p
        if q:
            g = gamma[self.comp]
            B = np.eye(q) + self.Rh @ (g[:, None] * self.Rh)
            ev = np.linalg.eigvalsh((B + B.T) / 2.0)
            if ev.min() <= 1e-12:
                return None
            logdet_h = float(np.sum(np.log(ev)))
            W = np.linalg.solve(np.eye(q) + g[:, None] * self.S, np.diag(g))
            W = (W + W.T) / 2.0
            XtHiX = self.XtX - self.ZtX.T @ W @ self.ZtX
            XtHiy = self.Xty - self.ZtX.T @ W @ self.Zty
            ytHiy = self.yty - float(self.Zty @ W @ self.Zty)
        else:
            g = np.zeros(0)
            W = np.zeros((0, 0))
            logdet_h = 0.0
            XtHiX, XtHiy, ytHiy = self.XtX, self.Xty, self.yty
        XtHiX = (XtHiX + XtHiX.T) / 2.0
        try:
            L = np.linalg.cholesky(XtHiX)
        except np.linalg.LinAlgError:
            return None
        logdet_x = 2.0 * float(np.sum(np.log(np.diag(L))))
        beta = np.linalg.solve(XtHiX, XtHiy)
        quad = ytHiy - float(beta @ XtHiy)
        dfr = n - p
        if quad <= 0 or dfr <= 0:
            return None
        sigma2 = quad / dfr
        crit = dfr * (_LN2PI + math.log(sigma2) + 1.0) + logdet_h + logdet_x
        return {"crit": crit, "beta": beta, "sigma2": sigma2,
                "XtHiX": XtHiX, "W": W, "g": g, "logdet_x": logdet_x}

    def objective(self, gamma):
        res = self.solve(gamma)
        return math.inf if res is None else res["crit"]

    def gradient(self, gamma, sol=None):
        """Analytic d(-2 l_R)/d gamma_k of the profiled criterion:
        tr(Z_k' P Z_k) - |Z_k' H^-1 r|^2 / sigma^2, P = H^-1 - H^-1 X
        (X'H^-1X)^-1 X'H^-1, all from q x q cross-products."""
        sol = sol or self.solve(gamma)
        if sol is None:
            return None
        W, S = sol["W"], self.S
        T = S - S @ W @ S                       # Z'H^-1 Z
        U = self.ZtX - S @ W @ self.ZtX         # Z'H^-1 X
        v = (self.Zty - S @ W @ self.Zty) - U @ sol["beta"]  # Z'H^-1 r
        AinvUt = np.linalg.solve(sol["XtHiX"], U.T)          # p x q
        diag_corr = np.einsum("ij,ji->i", U, AinvUt)
        grad = np.zeros(self.K)
        for k in range(self.K):
            sel = self.comp == k
            grad[k] = (float(np.trace(T[np.ix_(sel, sel)]))
                       - float(diag_corr[sel].sum())
                       - float(v[sel] @ v[sel]) / sol["sigma2"])
        return grad


def _minimize_profile(prof: _Profile, allow_negative: bool):
    """Minimize the profiled REML criterion over the variance ratios.

    One component: a grid over the admissible range brackets the
    minimum, then the analytic gradient's root is found with Brent's
    method. Several components: multi-start L-BFGS-B with the analytic
    gradient, then Newton polishing. Returns (gamma, converged, message).
    """
    K = prof.K
    lbs = prof.lower_bounds(allow_negative)
    ub = 1e8

    def f(theta):
        val = prof.objective(theta)
        return val if math.isfinite(val) else 1e300

    def grad(theta):
        g = prof.gradient(np.asarray(theta, dtype=float))
        return np.zeros(K) if g is None else g

    if K == 0:
        return np.zeros(0), True, "no random effects"

    if K == 1:
        lb = lbs[0]
        grid = ([lb + (0.0 - lb) * t for t in
                 (0.0, 0.01, 0.1, 0.3, 0.5, 0.7, 0.9, 0.99)]
                if lb < 0 else []) + [0.0] + list(np.geomspace(1e-6, ub, 99))
        vals = [f([v]) for v in grid]
        i = int(np.argmin(vals))
        lo = grid[max(i - 1, 0)]
        hi = grid[min(i + 1, len(grid) - 1)]
        g_lo, g_hi = grad([lo])[0], grad([hi])[0]
        if i == 0 and g_lo >= 0:
            return np.array([grid[0]]), True, "minimum on the lower bound"
        if g_lo < 0 < g_hi:
            root = optimize.brentq(lambda t: grad([t])[0], lo, hi,
                                   xtol=1e-14, rtol=1e-14, maxiter=500)
            return np.array([float(root)]), True, "gradient root"
        res = optimize.minimize_scalar(
            lambda t: f([t]), bounds=(lo, hi), method="bounded",
            options={"xatol": 1e-12, "maxiter": 2000})
        best = res.x if res.fun <= vals[i] else grid[i]
        return np.array([float(best)]), bool(res.success), str(res.message)

    # several components: multi-start L-BFGS-B, then Newton polishing
    starts = [np.array(s, dtype=float)
              for s in product([0.05, 0.5, 2.0], repeat=K)]
    starts.append(np.zeros(K))
    starts.sort(key=f)
    bounds = [(lb, ub) for lb in lbs]
    lo_b = np.array([b[0] for b in bounds])
    hi_b = np.array([b[1] for b in bounds])
    best_x, best_f, ok, msg = None, math.inf, False, ""
    for x0 in starts[:4]:
        res = optimize.minimize(f, x0, jac=grad, method="L-BFGS-B",
                                bounds=bounds,
                                options={"ftol": 1e-16, "gtol": 1e-11,
                                         "maxiter": 5000})
        if res.fun < best_f:
            best_x, best_f, ok, msg = res.x, res.fun, res.success, res.message
    x = np.asarray(best_x, dtype=float)
    # Newton steps on the free (interior) coordinates
    for _ in range(20):
        free = (x > lo_b + 1e-10) & (x < hi_b)
        if not free.any():
            break
        g = grad(x)
        h = 1e-6 * np.maximum(1.0, np.abs(x))
        Hm = np.zeros((K, K))
        for k in range(K):
            e = np.zeros(K)
            e[k] = h[k]
            Hm[:, k] = (grad(x + e) - grad(x - e)) / (2 * h[k])
        Hm = (Hm + Hm.T) / 2
        idx = np.where(free)[0]
        try:
            step = np.linalg.solve(Hm[np.ix_(idx, idx)], g[idx])
        except np.linalg.LinAlgError:
            break
        trial = x.copy()
        trial[idx] -= step
        trial = np.clip(trial, lo_b, hi_b)
        f_x, f_t = f(x), f(trial)
        g_t = grad(trial)
        # near the optimum f is flat to rounding; accept a step that
        # lowers the free gradient without raising f beyond rounding
        if f_t <= f_x + 1e-9 * max(1.0, abs(f_x)) and \
                np.linalg.norm(g_t[idx]) < np.linalg.norm(g[idx]):
            small = np.max(np.abs(trial - x)) < 1e-14 * max(1.0, np.max(np.abs(x)))
            x = trial
            if small:
                break
        else:
            break
    return x, bool(ok), str(msg)


def fit_reml(y, X, random_effects, *, allow_negative: bool = True,
             x_names=None) -> dict:
    """Fit y = X b + sum_k Z_k u_k + e by REML.

    random_effects: list of (name, codes) pairs; codes[i] is the level of
    that random factor for observation i (random intercepts, one variance
    per factor). allow_negative=True lets a variance component go below
    zero (Prism's "analyze as usual"; reproduces ANOVA for balanced
    data); False bounds it at zero (as statsmodels/lme4 do).

    Returns a dict with beta, cov_beta, variance components, residual
    variance, REML criterion (-2 log restricted likelihood), log
    likelihood, AIC/BIC, fitted values (conditional on the BLUPs),
    residuals, BLUPs and the internals needed for tests.
    """
    y = np.asarray(y, dtype=float)
    X = np.asarray(X, dtype=float)
    n, p = X.shape
    if _rank(X) < p:
        raise ValueError("fixed-effects design is rank deficient "
                         "(a factor level or cell has no data)")
    names = [name for name, _ in random_effects]
    Zs = [_indicator(codes) for _, codes in random_effects]
    prof = _Profile(y, X, Zs)
    gamma, _ok, message = _minimize_profile(prof, allow_negative)
    sol = prof.solve(gamma)
    if sol is None:
        raise ValueError("mixed model could not be fitted "
                         "(covariance not positive definite)")
    sigma2 = sol["sigma2"]
    beta = sol["beta"]
    cov_beta = sigma2 * np.linalg.inv(sol["XtHiX"])
    cov_beta = (cov_beta + cov_beta.T) / 2.0

    # BLUPs: u = Gamma Z' H^-1 r
    Z = prof.Z
    r = y - X @ beta
    if Z.shape[1]:
        Ztr = Z.T @ r
        u = sol["g"] * (Ztr - prof.S @ (sol["W"] @ Ztr))
        fitted = X @ beta + Z @ u
    else:
        u = np.zeros(0)
        fitted = X @ beta
    crit = sol["crit"]
    n_cov = len(Zs) + 1
    # REML information criteria count the covariance parameters only (the
    # fixed effects are not part of the restricted likelihood, SAS PROC
    # MIXED convention); BIC uses log(n - p), the REML effective sample
    # size (SAS uses log(number of subjects), lme4 counts fixed effects).
    aic = crit + 2 * n_cov
    bic = crit + n_cov * math.log(n - p)

    # convergence: analytic gradient ~ 0 at interior optima, pointing
    # outward at a bound
    lbs = prof.lower_bounds(allow_negative)
    grad = prof.gradient(gamma, sol) if len(Zs) else np.zeros(0)
    on_bound = [bool(gamma[k] <= lbs[k] + 1e-9) for k in range(len(Zs))]
    grad_ok = all((abs(gk) * max(1.0, abs(gamma[k])) < 1e-5)
                  or (on_bound[k] and gk > 0)
                  for k, gk in enumerate(grad))

    comps = []
    for k, name in enumerate(names):
        var = float(gamma[k] * sigma2)
        comps.append({"name": name, "variance": var,
                      "sd": math.sqrt(var) if var >= 0 else None,
                      "ratio": float(gamma[k]),
                      "n_levels": int(Zs[k].shape[1]),
                      "on_boundary": on_bound[k] and not allow_negative})
    blups = {}
    start = 0
    for k, name in enumerate(names):
        q = Zs[k].shape[1]
        blups[name] = [float(v) for v in u[start:start + q]]
        start += q

    return {
        "beta": beta, "cov_beta": cov_beta,
        "x_names": list(x_names) if x_names else None,
        "variance_components": comps,
        "residual_variance": float(sigma2),
        "residual_sd": math.sqrt(sigma2),
        "gamma": gamma,
        "reml_criterion": float(crit),
        "log_likelihood": float(-crit / 2.0),
        "aic": float(aic), "bic": float(bic),
        "n": int(n), "p": int(p), "n_cov_params": n_cov,
        "fitted": fitted, "residuals": y - fitted,
        "marginal_fitted": X @ beta,
        "blups": blups,
        "converged": bool(grad_ok),
        "optimizer_message": message,
        "df_residual": int(n - _rank(np.column_stack([X, Z]))
                           if Z.shape[1] else n - p),
        "_profile": prof,
        "_Zs": Zs,
        "_X": X,
    }


def reml_criterion_without_random(fit) -> float:
    """-2 log restricted likelihood of the same fixed-effects model with
    every random effect removed (ordinary least squares)."""
    prof = fit["_profile"]
    return float(prof.objective(np.zeros(prof.K)))


def likelihood_ratio_random(fit) -> dict:
    """Chi-square comparing the fit with and without the random effects
    (same fixed effects, so REML criteria are comparable). df = number of
    variance components removed. Prism: "Was the matching effective?" /
    "Do the subcolumns differ?". Negative variance estimates are not
    evidence for the random effect, so the alternative is fitted with
    variances bounded at zero in that case."""
    crit = fit["reml_criterion"]
    if any(c["variance"] < 0 for c in fit["variance_components"]):
        # H1 is "variance > 0": measure against the zero-bounded optimum
        # (a negative estimate gives chi-square 0, P = 1)
        prof = fit["_profile"]
        gamma, _, _ = _minimize_profile(prof, allow_negative=False)
        crit = prof.objective(gamma)
    chi2 = reml_criterion_without_random(fit) - crit
    chi2 = max(chi2, 0.0)
    df = len(fit["variance_components"])
    return {"chi_square": float(chi2), "df": int(df),
            "p": float(stats.chi2.sf(chi2, df))}


def wald_f(fit, cols, df_den, *, epsilon=None) -> dict:
    """Type III Wald F for the coefficients `cols` (effect coding makes
    this the test that the whole term is zero). epsilon scales both df
    (Geisser-Greenhouse); the F ratio itself is unchanged."""
    cols = list(cols)
    b = fit["beta"][cols]
    C = fit["cov_beta"][np.ix_(cols, cols)]
    df_num = len(cols)
    f = float(b @ np.linalg.solve(C, b)) / df_num
    out = {"F": f, "df_num": int(df_num), "df_den": float(df_den),
           "p": float(stats.f.sf(f, df_num, df_den)) if df_den > 0 else None}
    if epsilon is not None and epsilon < 1.0 + 1e-12:
        dn, dd = df_num * epsilon, df_den * epsilon
        out["epsilon"] = float(epsilon)
        out["df_num_gg"] = float(dn)
        out["df_den_gg"] = float(dd)
        out["p_geisser_greenhouse"] = (float(stats.f.sf(f, dn, dd))
                                       if dd > 0 else None)
    return out


def estimate(fit, L) -> tuple[np.ndarray, np.ndarray]:
    """Estimates L b and their covariance L C L'."""
    L = np.atleast_2d(np.asarray(L, dtype=float))
    return L @ fit["beta"], L @ fit["cov_beta"] @ L.T


# ---------------------------------------------------- sphericity / epsilon

def pairwise_cov(M: np.ndarray) -> np.ndarray:
    """Sample covariance of the columns of M (subjects x levels) using,
    for each pair of columns, the subjects with both values (NaN =
    missing). Equals np.cov(M.T) when nothing is missing."""
    k = M.shape[1]
    S = np.full((k, k), np.nan)
    for i in range(k):
        for j in range(i, k):
            ok = ~np.isnan(M[:, i]) & ~np.isnan(M[:, j])
            if ok.sum() >= 2:
                a, b = M[ok, i], M[ok, j]
                S[i, j] = S[j, i] = float(((a - a.mean()) * (b - b.mean())).sum()
                                          / (ok.sum() - 1))
    return S


def orthonormal_contrasts(k: int) -> np.ndarray:
    """k x (k-1) orthonormal contrasts (columns orthogonal to 1)."""
    H = np.zeros((k, k - 1))
    for j in range(1, k):
        H[:j, j - 1] = 1.0
        H[j, j - 1] = -float(j)
        H[:, j - 1] /= math.sqrt(j * (j + 1))
    return H


def gg_epsilon(S: np.ndarray, C: np.ndarray) -> float:
    """Geisser-Greenhouse (Box) epsilon for the contrasts C applied to a
    covariance matrix S: tr(C'SC)^2 / (d * tr((C'SC)^2)), bounded to
    [1/d, 1] with d = number of contrasts."""
    d = C.shape[1]
    if d <= 1:
        return 1.0
    if np.isnan(S).any():
        return math.nan
    T = C.T @ S @ C
    den = d * float(np.trace(T @ T))
    if den <= 0:
        return 1.0
    eps = float(np.trace(T)) ** 2 / den
    return float(min(max(eps, 1.0 / d), 1.0))


# ------------------------------------------------- multiple comparisons

def _p_summary(p):
    return bool(p is not None and p < 0.05)


_Z_GRID = np.linspace(-9.0, 9.0, 1801)
_Z_W = np.full(_Z_GRID.size, 2.0)
_Z_W[1::2] = 4.0
_Z_W[0] = _Z_W[-1] = 1.0
_Z_W *= (_Z_GRID[1] - _Z_GRID[0]) / 3.0 * stats.norm.pdf(_Z_GRID)


def _product_lambdas(R):
    """lambda with R_ij = lambda_i lambda_j (i != j) when the correlation
    has that one-factor form (always for comparisons with a common
    control when the means are independent or compound symmetric);
    None otherwise."""
    m = R.shape[0]
    if m == 2:
        r = float(R[0, 1])
        lam = math.sqrt(abs(r))
        return np.array([lam, math.copysign(lam, r)])
    lam = np.zeros(m)
    for i in range(m):
        j, k = [x for x in range(m) if x != i][:2]
        if abs(R[j, k]) < 1e-12:
            return None
        v = R[i, j] * R[i, k] / R[j, k]
        if v < 0:
            return None
        lam[i] = math.copysign(math.sqrt(v), R[i, j] if i else 1.0)
    # fix signs relative to the first entry and verify the fit
    for i in range(1, m):
        lam[i] = math.copysign(abs(lam[i]), R[0, i] * lam[0])
    approx = np.outer(lam, lam)
    off = ~np.eye(m, dtype=bool)
    if np.max(np.abs(approx[off] - R[off])) > 1e-9 or np.any(np.abs(lam) >= 1):
        return None
    return lam


def _box_prob_product(c, lam, df):
    """P(max_j |T_j| <= c) for a multivariate t whose correlation is
    lambda_i lambda_j: a deterministic 2-D integral (normal mixing
    variable z by Simpson's rule, chi scale by adaptive quadrature)."""
    b = np.sqrt(1.0 - lam ** 2)

    zl = np.outer(_Z_GRID, lam / b)
    cb = c / b

    def inner(s):
        return float(_Z_W @ np.prod(special.ndtr(cb * s + zl)
                                    - special.ndtr(-cb * s + zl), axis=1))

    if not math.isfinite(df):
        return inner(1.0)
    # density of s = sqrt(chi2_df / df)
    log_norm = (df / 2.0) * math.log(df / 2.0) + math.log(2.0) \
        - special.gammaln(df / 2.0)

    def dens(s):
        return math.exp(log_norm + (df - 1) * math.log(s) - df * s * s / 2.0) \
            if s > 0 else 0.0

    val, _ = integrate.quad(lambda s: inner(s) * dens(s), 0.0, np.inf,
                            epsabs=1e-13, epsrel=1e-11, limit=200)
    return min(max(val, 0.0), 1.0)


def _dunnett_cdf(c, R, df, seed=12345):
    """P(max_j |T_j| <= c), T multivariate t with correlation R (exact
    integral for one-factor correlation, else quasi-Monte Carlo)."""
    m = R.shape[0]
    if m == 1:
        return float(stats.t.cdf(c, df) - stats.t.cdf(-c, df))
    lam = _product_lambdas(R)
    if lam is not None:
        return _box_prob_product(c, lam, df)
    dist = stats.multivariate_t(shape=R, df=df, allow_singular=True)
    return float(dist.cdf(np.full(m, c), lower_limit=np.full(m, -c),
                          maxpts=50000 * m, random_state=seed))


def compare_estimates(est, cov, df, method: str, *, names=None,
                      pairs=None, control_index: int = 0,
                      ci_level: float = 0.95, n_family_total=None,
                      family=None) -> list:
    """Multiple comparisons among model-estimated means.

    est, cov: estimated marginal means and their covariance (L C L').
    pairs: list of (i, j) index pairs (default: all pairs, or each vs
    control_index for Dunnett). Every difference is est[i] - est[j] with
    SE sqrt(l' cov l), t on the model df.

    method: tukey (studentized range on q = |diff| / (SE/sqrt 2), Prism's
    q, family size = number of means), dunnett (multivariate t with the
    contrasts' correlation, Prism's q = |t|), bonferroni, sidak,
    holm_sidak (step-down), fisher (uncorrected LSD). n_family_total sets
    the number of comparisons the Bonferroni/Sidak/Holm corrections use
    (Prism corrects for all comparisons in two-way designs).
    """
    est = np.asarray(est, dtype=float)
    cov = np.asarray(cov, dtype=float)
    k = est.size
    names = names or [f"Mean {i + 1}" for i in range(k)]
    if pairs is None:
        if method == "dunnett":
            pairs = [(control_index, i) for i in range(k) if i != control_index]
        else:
            pairs = list(combinations(range(k), 2))
    m = len(pairs)
    if m == 0:
        return []
    alpha = 1.0 - ci_level
    rows = []
    for i, j in pairs:
        diff = float(est[i] - est[j])
        var = float(cov[i, i] + cov[j, j] - 2 * cov[i, j])
        se = math.sqrt(max(var, 0.0))
        t = abs(diff) / se if se > 0 else math.inf
        rows.append({"i": i, "j": j, "diff": diff, "se": se, "t": t,
                     "p_raw": 2.0 * float(stats.t.sf(t, df))})
    m_total = n_family_total or m

    if method == "tukey":
        qcrit = float(stats.studentized_range.ppf(ci_level, k, df))
        for r in rows:
            q = r["t"] * math.sqrt(2.0)
            r["stat"] = q
            r["p_adj"] = min(float(stats.studentized_range.sf(q, k, df)), 1.0)
            r["half"] = qcrit * r["se"] / math.sqrt(2.0)
    elif method == "dunnett":
        # correlation of the contrasts from the model covariance
        Lc = np.zeros((m, k))
        for a, r in enumerate(rows):
            Lc[a, r["i"]] += 1.0
            Lc[a, r["j"]] -= 1.0
        Cc = Lc @ cov @ Lc.T
        d = np.sqrt(np.diag(Cc))
        R = Cc / np.outer(d, d)
        for r in rows:
            r["stat"] = r["t"]
            r["p_adj"] = (min(max(1.0 - _dunnett_cdf(r["t"], R, df), 0.0), 1.0)
                          if math.isfinite(r["t"]) else 0.0)
        tlo = float(stats.t.ppf(1 - alpha / 2, df))
        thi = float(stats.t.ppf(1 - alpha / (2 * m), df)) + 0.5
        try:
            ccrit = optimize.brentq(
                lambda c: _dunnett_cdf(c, R, df) - ci_level, tlo, thi,
                xtol=1e-7)
        except ValueError:
            ccrit = float(stats.t.ppf(1 - alpha / (2 * m), df))
        for r in rows:
            r["half"] = ccrit * r["se"]
    elif method in ("bonferroni", "sidak", "holm_sidak", "fisher"):
        for r in rows:
            r["stat"] = r["t"]
        if method == "fisher":
            for r in rows:
                r["p_adj"] = r["p_raw"]
            tcrit = float(stats.t.ppf(1 - alpha / 2, df))
        elif method == "bonferroni":
            for r in rows:
                r["p_adj"] = min(r["p_raw"] * m_total, 1.0)
            tcrit = float(stats.t.ppf(1 - alpha / (2 * m_total), df))
        elif method == "sidak":
            for r in rows:
                r["p_adj"] = min(1.0 - (1.0 - r["p_raw"]) ** m_total, 1.0)
            a_per = 1.0 - (1.0 - alpha) ** (1.0 / m_total)
            tcrit = float(stats.t.ppf(1 - a_per / 2, df))
        else:
            order = sorted(range(m), key=lambda a: rows[a]["p_raw"])
            running = 0.0
            for rank, a in enumerate(order):
                p_adj = 1.0 - (1.0 - rows[a]["p_raw"]) ** (m_total - rank)
                running = max(running, p_adj)
                rows[a]["p_adj"] = min(running, 1.0)
            tcrit = None  # step-down: no simultaneous CIs (as anova.py)
        for r in rows:
            r["half"] = tcrit * r["se"] if tcrit is not None else None
    else:
        raise ValueError(f"unknown multiple-comparisons method: {method}")

    out = []
    for r in rows:
        half = r["half"]
        entry = {
            "pair": f"{names[r['i']]} vs. {names[r['j']]}",
            "mean_1": float(est[r["i"]]), "mean_2": float(est[r["j"]]),
            "difference": r["diff"], "se": r["se"],
            "ci": ([r["diff"] - half, r["diff"] + half]
                   if half is not None else None),
            "statistic": float(r["stat"]), "df": float(df),
            "p_unadjusted": float(r["p_raw"]),
            "p_adjusted": float(r["p_adj"]),
            "significant_05": _p_summary(r["p_adj"]),
        }
        if family is not None:
            entry["family"] = family
        out.append(entry)
    return out


_METHODS = ("tukey", "dunnett", "bonferroni", "sidak", "holm_sidak", "fisher")


# ---------------------------------------------------------- RM one-way

def _summary_components(fit, labels):
    out = []
    for comp, label in zip(fit["variance_components"], labels):
        out.append({"name": label, "sd": comp["sd"],
                    "variance": comp["variance"]})
    out.append({"name": "Residual", "sd": fit["residual_sd"],
                "variance": fit["residual_variance"]})
    return out


def _goodness(fit):
    return {"df": int(fit["n"] - fit["p"] - fit["n_cov_params"]),
            "reml_criterion": fit["reml_criterion"],
            "log_likelihood": fit["log_likelihood"],
            "aic": fit["aic"], "bic": fit["bic"],
            "converged": fit["converged"]}


def _fit_with_negative_policy(y, X, random_effects, negative_variance):
    """Prism's "if a random factor's variance is zero or negative" choice:
    'allow' keeps it (default, reproduces RM ANOVA for complete data);
    'remove' drops those factors and refits."""
    if negative_variance not in ("allow", "remove"):
        raise ValueError("negative_variance must be 'allow' or 'remove'")
    fit = fit_reml(y, X, random_effects, allow_negative=True)
    removed = []
    if negative_variance == "remove":
        keep = [re for re, comp in zip(random_effects,
                                       fit["variance_components"])
                if comp["variance"] > 0]
        removed = [comp["name"] for comp in fit["variance_components"]
                   if comp["variance"] <= 0]
        if removed:
            fit = fit_reml(y, X, keep, allow_negative=True)
            random_effects = keep
    return fit, random_effects, removed


def mixed_rm_one_way(datasets, names=None, *, comparisons=None,
                     control_index: int = 0, ci_level: float = 0.95,
                     negative_variance: str = "allow") -> dict:
    """Repeated-measures one-way design fitted as a mixed model (random
    subject intercept, compound symmetry, REML), allowing missing values.

    datasets: one value list per treatment (column); index = subject
    (row). None marks a missing value. Subjects with no values are
    ignored; subjects with one value still inform the fit.
    """
    k = len(datasets)
    if k < 2:
        raise ValueError("need at least 2 treatments")
    n_rows = max(len(d) for d in datasets)
    ys, treat, subj = [], [], []
    M = np.full((n_rows, k), np.nan)
    for t, col in enumerate(datasets):
        for s, v in enumerate(col):
            if v is not None and not (isinstance(v, float) and math.isnan(v)):
                ys.append(float(v))
                treat.append(t)
                subj.append(s)
                M[s, t] = float(v)
    present = ~np.all(np.isnan(M), axis=1)
    M = M[present]
    n_subjects = int(present.sum())
    n_missing = int(np.isnan(M).sum())
    if n_subjects < 2:
        raise ValueError("need at least 2 subjects")
    y = np.array(ys)
    treat = np.array(treat)
    subj = np.array(subj)
    if len(np.unique(treat)) < k:
        raise ValueError("every treatment needs at least one value")
    X = np.column_stack([np.ones(y.size), effect_columns(treat, k)])
    fit, used, removed = _fit_with_negative_policy(
        y, X, [("Subject", subj)], negative_variance)
    df_den = fit["df_residual"]

    S = pairwise_cov(M)
    eps = gg_epsilon(S, orthonormal_contrasts(k))
    test = wald_f(fit, range(1, k), df_den,
                  epsilon=eps if math.isfinite(eps) else None)

    L = np.array([np.concatenate([[1.0], effect_row(t, k)])
                  for t in range(k)])
    emm, emm_cov = estimate(fit, L)
    names = names or [f"Treatment {i}" for i in range(k)]
    tcrit = float(stats.t.ppf(0.5 + ci_level / 2, df_den))
    means = [{"name": names[t], "mean": float(emm[t]),
              "se": math.sqrt(emm_cov[t, t]),
              "ci": [float(emm[t] - tcrit * math.sqrt(emm_cov[t, t])),
                     float(emm[t] + tcrit * math.sqrt(emm_cov[t, t]))],
              "n": int((treat == t).sum())} for t in range(k)]

    out = {
        "analysis": "mixed_rm_one_way",
        "method": "Mixed-effects model (restricted maximum likelihood)",
        "fixed_effect": {"name": "Treatment (between columns)", **test},
        "random_effects": _summary_components(
            fit, ["Individual (between rows)"] * len(used)),
        "removed_random_effects": removed,
        "matching": likelihood_ratio_random(fit) if used else None,
        "goodness_of_fit": _goodness(fit),
        "gg_epsilon": eps if math.isfinite(eps) else None,
        "sphericity_note": (
            "The mixed model assumes compound symmetry. The Geisser-"
            "Greenhouse correction multiplies both df by epsilon (computed "
            "from the covariance of the repeated measures, pairwise-"
            "complete when values are missing); the fit itself is "
            "unchanged."),
        "estimated_means": means,
        "n_treatments": k, "n_subjects": n_subjects,
        "n_missing": n_missing, "n_values": int(y.size),
        "df_method": "containment (residual df N - rank[X Z])",
        "names": names,
    }
    if comparisons:
        if comparisons not in _METHODS:
            raise ValueError(f"unknown multiple-comparisons method: "
                             f"{comparisons}")
        out["multiple_comparisons"] = {
            "method": comparisons, "df": float(df_den),
            "comparisons": compare_estimates(
                emm, emm_cov, df_den, comparisons, names=names,
                control_index=control_index, ci_level=ci_level)}
    return out


# ---------------------------------------------------------- RM two-way

def _two_way_long(cells, design):
    """Flatten cells[row][col] = subject value lists (None = missing).

    design 'mixed': columns are independent groups, subject s of column j
    is (j, s). design 'both': subject s is the same subject in every
    cell."""
    a = len(cells)
    b = len(cells[0])
    ys, ri, ci, si = [], [], [], []
    for i in range(a):
        for j in range(b):
            for s, v in enumerate(cells[i][j]):
                if v is None or (isinstance(v, float) and math.isnan(v)):
                    continue
                ys.append(float(v))
                ri.append(i)
                ci.append(j)
                si.append((j, s) if design == "mixed" else s)
    keys = sorted(set(si))
    index = {key: n for n, key in enumerate(keys)}
    si = [index[key] for key in si]
    return (np.array(ys), np.array(ri), np.array(ci), np.array(si),
            a, b, keys)


def _cells_complete(cells):
    return all(v is not None for row in cells for cell in row for v in cell)


def mixed_rm_two_way(cells, *, design: str = "mixed", row_names=None,
                     col_names=None, comparisons=None,
                     direction: str = "columns_within_rows",
                     control_index: int = 0, ci_level: float = 0.95,
                     negative_variance: str = "allow") -> dict:
    """Two-way repeated measures fitted as a mixed model (REML), allowing
    missing values. cells[row][col] = subject values (subcolumn index =
    subject), None for missing.

    design 'mixed': columns are groups of different subjects, rows are
    repeated (random subject intercept; column factor tested against
    subjects-within-groups df, row and interaction against residual df).
    design 'both': every subject in every cell; random subject,
    subject x row and subject x column effects (Prism FAQ 2104: RANDOM
    Int A B / SUBJECT=S); each factor tested against its subject x factor
    df, the interaction against the residual df.
    """
    if design not in ("mixed", "both"):
        raise ValueError("design must be 'mixed' or 'both'")
    y, ri, ci, si, a, b, keys = _two_way_long(cells, design)
    if a < 2 or b < 2:
        raise ValueError("need >= 2 rows and >= 2 columns")
    present = {(int(r), int(c)) for r, c in zip(ri, ci)}
    if len(present) < a * b:
        raise ValueError("every row x column cell needs at least one value")
    A = effect_columns(ri, a)
    B = effect_columns(ci, b)
    AB = _interaction(A, B)
    X = np.column_stack([np.ones(y.size), A, B, AB])
    cols_row = list(range(1, a))
    cols_col = list(range(a, a + b - 1))
    cols_int = list(range(a + b - 1, X.shape[1]))

    if design == "mixed":
        random_effects = [("Subject", si)]
    else:
        random_effects = [("Subject", si),
                          ("Subject x Row", si * a + ri),
                          ("Subject x Column", si * b + ci)]
    fit, used, removed = _fit_with_negative_policy(
        y, X, random_effects, negative_variance)
    used_names = [name for name, _ in used]
    Zs = fit["_Zs"]
    df_res = fit["df_residual"]

    def contain(name):
        if name in used_names:
            return rank_contribution(X, Zs, used_names.index(name))
        return df_res

    if design == "mixed":
        df_row, df_col, df_int = df_res, contain("Subject"), df_res
    else:
        df_row = contain("Subject x Row")
        df_col = contain("Subject x Column")
        df_int = df_res

    # Geisser-Greenhouse epsilon per repeated term from the (pairwise-
    # complete) covariance of each subject's repeated measurements
    n_subj = len(keys)
    if design == "mixed":
        M = np.full((n_subj, a), np.nan)
        for v, r, s in zip(y, ri, si):
            M[s, r] = v
        S = pairwise_cov(M)
        eps_row = gg_epsilon(S, orthonormal_contrasts(a))
        eps = {"row_factor": eps_row, "interaction": eps_row,
               "column_factor": None}
    else:
        M = np.full((n_subj, a * b), np.nan)
        for v, r, c, s in zip(y, ri, ci, si):
            M[s, r * b + c] = v
        S = pairwise_cov(M)
        Ca, Cb = orthonormal_contrasts(a), orthonormal_contrasts(b)
        ua = np.ones((a, 1)) / math.sqrt(a)
        ub = np.ones((b, 1)) / math.sqrt(b)
        eps = {"row_factor": gg_epsilon(S, np.kron(Ca, ub)),
               "column_factor": gg_epsilon(S, np.kron(ua, Cb)),
               "interaction": gg_epsilon(S, np.kron(Ca, Cb))}
    eps = {key: (val if val is not None and math.isfinite(val) else None)
           for key, val in eps.items()}

    def src(cols, df_den, key):
        return wald_f(fit, cols, df_den, epsilon=eps.get(key))

    row_names = row_names or [f"Row {i + 1}" for i in range(a)]
    col_names = col_names or [f"Column {j + 1}" for j in range(b)]

    # estimated cell means and marginal (equal-weight) means
    def cell_L(i, j):
        ar, br = effect_row(i, a), effect_row(j, b)
        return np.concatenate([[1.0], ar, br, np.outer(ar, br).ravel()])

    Lcell = np.array([cell_L(i, j) for i in range(a) for j in range(b)])
    cell_est, cell_cov = estimate(fit, Lcell)
    Lrow = np.array([Lcell[i * b:(i + 1) * b].mean(axis=0) for i in range(a)])
    Lcol = np.array([Lcell[j::b].mean(axis=0) for j in range(b)])

    out = {
        "analysis": "mixed_rm_two_way",
        "design": design,
        "method": "Mixed-effects model (restricted maximum likelihood)",
        "fixed_effects": {
            "interaction": src(cols_int, df_int, "interaction"),
            "row_factor": src(cols_row, df_row, "row_factor"),
            "column_factor": src(cols_col, df_col, "column_factor"),
        },
        "random_effects": _summary_components(fit, used_names),
        "removed_random_effects": removed,
        "matching": likelihood_ratio_random(fit) if used else None,
        "goodness_of_fit": _goodness(fit),
        "gg_epsilon": eps,
        "sphericity_note": (
            "The mixed model assumes compound symmetry. Geisser-Greenhouse "
            "epsilon (pairwise-complete covariance of the repeated "
            "measures) multiplies both df of each repeated-measures term; "
            "the fit is unchanged. A factor with 2 levels always has "
            "epsilon = 1."),
        "cell_means": cell_est.reshape(a, b).tolist(),
        "n_subjects": int(n_subj), "n_values": int(y.size),
        "n_missing": int(sum(1 for row in cells for cell in row
                             for v in cell if v is None)),
        "rows": a, "cols": b,
        "row_names": row_names, "col_names": col_names,
        "df_method": "containment",
    }

    if comparisons:
        if comparisons not in _METHODS:
            raise ValueError(f"unknown multiple-comparisons method: "
                             f"{comparisons}")
        families = []
        if direction == "columns_within_rows":
            for i in range(a):
                idx = [i * b + j for j in range(b)]
                families.append((row_names[i], Lcell[idx], col_names, df_int))
        elif direction == "rows_within_columns":
            for j in range(b):
                idx = [i * b + j for i in range(a)]
                families.append((col_names[j], Lcell[idx], row_names, df_int))
        elif direction == "column_means":
            families.append(("Column main effect", Lcol, col_names, df_col))
        elif direction == "row_means":
            families.append(("Row main effect", Lrow, row_names, df_row))
        else:
            raise ValueError(f"unknown direction: {direction}")
        sizes = []
        for _, Lf, nm, _ in families:
            k = Lf.shape[0]
            sizes.append(k - 1 if comparisons == "dunnett" else k * (k - 1) // 2)
        total = sum(sizes)
        comps = []
        for fam, Lf, nm, dfx in families:
            est, cov = estimate(fit, Lf)
            comps.extend(compare_estimates(
                est, cov, dfx, comparisons, names=nm,
                control_index=control_index, ci_level=ci_level,
                n_family_total=total, family=fam))
        out["multiple_comparisons"] = {
            "method": comparisons, "direction": direction,
            "n_comparisons": len(comps), "comparisons": comps}
    return out


# ------------------------------------------------------------ dispatchers

def rm_one_way(datasets, names=None, *, method: str = "mixed", **kwargs):
    """Prism's three repeated-measures choices: 'anova' (RM ANOVA, needs
    complete subjects), 'mixed' (always fit the mixed model), 'auto'
    (RM ANOVA when nothing is missing, else the mixed model)."""
    from . import repeated
    complete = all(v is not None for col in datasets for v in col) and \
        len({len(col) for col in datasets}) == 1
    if method == "anova" or (method == "auto" and complete):
        return repeated.rm_one_way_anova(datasets, names)
    return mixed_rm_one_way(datasets, names, **kwargs)


def rm_two_way(cells, *, design: str = "mixed", method: str = "mixed",
               row_names=None, col_names=None, **kwargs):
    """Two-way analogue of rm_one_way (same three choices)."""
    from . import repeated
    if method == "anova" or (method == "auto" and _cells_complete(cells)):
        fn = (repeated.rm_two_way_both if design == "both"
              else repeated.rm_two_way_mixed)
        return fn(cells, row_names=row_names, col_names=col_names)
    return mixed_rm_two_way(cells, design=design, row_names=row_names,
                            col_names=col_names, **kwargs)
