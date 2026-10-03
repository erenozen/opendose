"""Multiple-variables tables: descriptive statistics, correlation matrix,
multiple linear regression, simple and multiple logistic regression,
principal component analysis, and the extract/transform helpers.

A multiple-variables table has one row per observation and one column
per variable. Each variable is continuous (numbers) or categorical (text
levels). Blanks (None, NaN, "") are missing values.

Methods follow the GraphPad Prism guides:

- Statistics guide, "Correlation matrix"
  (statistics/stat_correlation_matrix.htm): Pearson or Spearman r for
  every pair of variables (simple, not partial, correlation); P value,
  CI and a sample-size matrix. Missing values default to pairwise
  omission (a row is skipped only for the pairs whose variables are
  blank on it); the alternative drops every row with any blank.
  The guide ("Interpreting results: Correlation") computes an exact
  Spearman P from all permutations for 17 or fewer pairs. Enumerating
  n! orderings is only affordable here up to n = 9, so exact P is
  computed for n <= 9 and the t approximation is used above that (the
  P-type matrix says which one each cell got).
- Curve fitting guide, "Multiple regression" pages
  (reg_parameter-values-from-multiple.htm, reg_goodness-of-fit-from-
  multiple-.htm, reg_multicollinearity.htm, reg_mult_reg_reference_
  level_tab.htm): least squares with an intercept; categorical
  predictors dummy coded against a reference level (default: the first
  level appearing in the table); interactions as products of the coded
  columns. Reports estimate, SE, CI (SE x critical t), t, P; R squared,
  adjusted R squared, multiple R, Sy.x (SS/(N-K)), RMSE (SS/(N-1), as
  the GraphPad FAQ 1967 defines it), sum of squares, AICc; the F test
  against the intercept-only model; VIFs; normality of residuals.
- Curve fitting guide, "Multiple logistic regression" pages
  (reg_multiple_logistic_results_parameters.htm, reg_mult_logistic_gof_
  classification.htm, reg_mult_logistic_gof_pseudo_r_squared.htm,
  reg_mult_logistic_gof_hypothesis_tests.htm, reg_simple_logistic_error_
  messages.htm): maximum likelihood; SE and profile-likelihood CIs
  (Wald CIs optional); odds ratios; Tjur, McFadden, Cox-Snell and
  Nagelkerke pseudo R squared; likelihood ratio test against the
  intercept-only model; Hosmer-Lemeshow test with 10 groups of equal
  size sorted by predicted probability; AICc of both models; area under
  the ROC curve; classification table (probability greater than the
  cutoff, default 0.5, is classified as 1); row classification; perfect
  and quasi-perfect separation reported as errors.
- Statistics guide, "Principal Component Analysis"
  (stat_pca_options_tab.htm, stat_pca_process_selection_parallel_
  analysis.htm, stat_pca_process_selection_classic.htm, stat_pca_
  results_eigenvalues.htm, stat_pca_results_eigenvectors.htm, stat_pca_
  output_tab.htm): standardized (default) or centered data; eigenvalues
  with proportion and cumulative proportion of variance; eigenvectors;
  loadings = eigenvector x sqrt(eigenvalue); PC scores; contribution
  and correlation matrices; component selection by parallel analysis
  (default: 1000 simulated normal data sets, keep PCs whose eigenvalue
  exceeds the 95th percentile of the simulated ones), the Kaiser rule
  (eigenvalue > 1), a cumulative-variance threshold, all PCs, or a fixed
  number.
- User guide, "Select and transform" / "Extract and rearrange" for the
  multiple-variables helpers in ``rearrange``.
"""

from __future__ import annotations

import itertools
import math
from functools import lru_cache

import numpy as np
from scipy import stats
from scipy.special import expit

from . import columnstats, correlation, methodcomp, nlfit


# ------------------------------------------------------------------ table model

def _missing(v) -> bool:
    if v is None:
        return True
    if isinstance(v, float) and math.isnan(v):
        return True
    return isinstance(v, str) and v.strip() == ""


def _as_number(v):
    if isinstance(v, bool):
        return float(v)
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(str(v).strip())
    except ValueError:
        return None


def _level_text(v) -> str:
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


def parse_table(variables) -> list:
    """Normalise ``[{"name", "values", "kind"?}]`` into
    ``[{"name", "kind", "values"}]`` with values float/str/None.

    kind is "continuous" or "categorical"; when omitted, a variable is
    categorical if any of its non-blank values is not a number.
    """
    out = []
    for i, var in enumerate(variables):
        name = str(var.get("name") or f"Var{i + 1}")
        raw = list(var.get("values") or [])
        kind = var.get("kind") or var.get("type")
        if kind not in ("continuous", "categorical"):
            numeric = all(_missing(v) or _as_number(v) is not None for v in raw)
            kind = "continuous" if numeric else "categorical"
        if kind == "continuous":
            vals = []
            for v in raw:
                num = None if _missing(v) else _as_number(v)
                if num is not None and not math.isfinite(num):
                    num = None
                vals.append(num)
        else:
            vals = [None if _missing(v) else _level_text(v) for v in raw]
        out.append({"name": name, "kind": kind, "values": vals})
    n_rows = max((len(v["values"]) for v in out), default=0)
    for v in out:  # ragged columns: pad with blanks
        v["values"] += [None] * (n_rows - len(v["values"]))
    return out


def _by_name(table) -> dict:
    return {v["name"]: v for v in table}


def _levels(values, rows=None) -> list:
    """Distinct levels in order of first appearance."""
    seen = []
    idx = range(len(values)) if rows is None else rows
    for i in idx:
        v = values[i]
        if v is not None and v not in seen:
            seen.append(v)
    return seen


def _f(v):
    return None if v is None else float(v)


# ---------------------------------------------------------------- descriptive

def describe_variables(variables, ci_level: float = 0.95) -> dict:
    """Column statistics for each continuous variable; level counts and
    fractions for each categorical one."""
    table = parse_table(variables)
    out = []
    for var in table:
        n_missing = sum(v is None for v in var["values"])
        entry = {"name": var["name"], "kind": var["kind"],
                 "n_missing": n_missing}
        if var["kind"] == "continuous":
            entry.update(columnstats.describe(
                [v for v in var["values"] if v is not None], ci_level))
        else:
            present = [v for v in var["values"] if v is not None]
            entry["n"] = len(present)
            entry["levels"] = [
                {"level": lev, "count": present.count(lev),
                 "fraction": present.count(lev) / len(present)}
                for lev in _levels(present)]
        out.append(entry)
    return {"n_rows": len(table[0]["values"]) if table else 0,
            "variables": out}


# --------------------------------------------------------- correlation matrix

_SPEARMAN_EXACT_MAX_N = 9


@lru_cache(maxsize=4)
def _permutations(n: int) -> np.ndarray:
    return np.array(list(itertools.permutations(range(n))), dtype=np.int8)


def _spearman_exact_p(a: np.ndarray, b: np.ndarray, rs: float) -> float:
    """Two-tailed exact permutation P of Spearman rs: the fraction of the
    n! orderings of b's (mid)ranks whose |rs| reaches the observed one.
    Ties are handled by permuting the observed midranks."""
    ra = stats.rankdata(a)
    rb = stats.rankdata(b)
    ra_c = ra - ra.mean()
    rb_c = rb - rb.mean()
    denom = math.sqrt(float(ra_c @ ra_c) * float(rb_c @ rb_c))
    if denom == 0:
        return float("nan")
    perms = _permutations(a.size)
    r_all = (rb_c[perms] @ ra_c) / denom
    return float(np.mean(np.abs(r_all) >= abs(rs) - 1e-12))


def correlation_matrix(variables, *, method: str = "pearson",
                       missing: str = "pairwise", ci_level: float = 0.95,
                       tails: int = 2) -> dict:
    """r, P, n and CI matrices for every pair of continuous variables.

    missing: 'pairwise' (default) or 'listwise' (drop rows with any
    blank among the analysed variables).
    """
    table = [v for v in parse_table(variables) if v["kind"] == "continuous"]
    if len(table) < 2:
        raise ValueError("correlation matrix needs at least 2 continuous variables")
    cols = [v["values"] for v in table]
    names = [v["name"] for v in table]
    if missing == "listwise":
        keep = [i for i in range(len(cols[0]))
                if all(c[i] is not None for c in cols)]
        cols = [[c[i] for i in keep] for c in cols]
    elif missing != "pairwise":
        raise ValueError(f"unknown missing-value handling: {missing}")
    k = len(cols)
    r = [[None] * k for _ in range(k)]
    p = [[None] * k for _ in range(k)]
    n = [[0] * k for _ in range(k)]
    lo = [[None] * k for _ in range(k)]
    hi = [[None] * k for _ in range(k)]
    p_type = [[None] * k for _ in range(k)]
    for i in range(k):
        n[i][i] = sum(v is not None for v in cols[i])
        r[i][i] = 1.0
        for j in range(i + 1, k):
            pairs = [(x, y) for x, y in zip(cols[i], cols[j])
                     if x is not None and y is not None]
            n[i][j] = n[j][i] = len(pairs)
            if len(pairs) < 3:
                continue
            a = np.array([q[0] for q in pairs])
            b = np.array([q[1] for q in pairs])
            if np.ptp(a) == 0 or np.ptp(b) == 0:
                continue  # a constant variable has no correlation
            res = correlation.correlate(a.tolist(), b.tolist(), method=method,
                                        ci_level=ci_level)
            rv, pv, kind = res["r"], res["p_two_tailed"], "approximate"
            if method == "spearman" and len(pairs) <= _SPEARMAN_EXACT_MAX_N:
                pv, kind = _spearman_exact_p(a, b, rv), "exact"
            if tails == 1:
                pv = pv / 2.0
            r[i][j] = r[j][i] = float(rv)
            p[i][j] = p[j][i] = float(min(pv, 1.0))
            p_type[i][j] = p_type[j][i] = kind
            if res["ci_r"]:
                lo[i][j] = lo[j][i] = float(res["ci_r"][0])
                hi[i][j] = hi[j][i] = float(res["ci_r"][1])
    out = {"method": method, "missing": missing, "tails": tails,
           "ci_level": ci_level, "names": names, "r": r,
           "r_squared": [[None if v is None else v * v for v in row]
                         for row in r],
           "p": p, "n": n, "ci_lo": lo, "ci_hi": hi}
    if method == "spearman":
        out["p_type"] = p_type
    return out


# -------------------------------------------------------------- design matrix

def _design(table, outcome, predictors, interactions=(), reference_levels=None,
            outcome_kind=None):
    """Complete-case design matrix with intercept, dummy coding and
    product interaction columns.

    Returns dict: X, y (raw outcome values), rows (indices into the
    table), columns (names), terms (term name -> column indices),
    reference (categorical variable -> reference level).
    """
    by = _by_name(table)
    reference_levels = reference_levels or {}
    predictors = list(predictors)
    if not predictors:
        raise ValueError("choose at least one predictor variable")
    for name in [outcome] + predictors:
        if name not in by:
            raise ValueError(f"unknown variable: {name}")
    if outcome in predictors:
        raise ValueError("the outcome cannot also be a predictor")
    inter = []
    for pair in interactions or ():
        a, b = pair
        if a not in predictors or b not in predictors or a == b:
            raise ValueError(f"interaction {a}:{b} needs two different "
                             "predictors from the model")
        inter.append((a, b))
    if outcome_kind == "continuous" and by[outcome]["kind"] != "continuous":
        raise ValueError(f"outcome {outcome} must be continuous")

    used = [outcome] + predictors
    n_rows = len(by[outcome]["values"])
    rows = [i for i in range(n_rows)
            if all(by[v]["values"][i] is not None for v in used)]
    if not rows:
        raise ValueError("no rows with complete data for these variables")

    blocks = {}  # predictor -> (column names, matrix)
    reference = {}
    for name in predictors:
        var = by[name]
        if var["kind"] == "continuous":
            blocks[name] = ([name],
                            np.array([var["values"][i] for i in rows])[:, None])
            continue
        levels = _levels(var["values"], rows)
        ref = reference_levels.get(name, levels[0])
        if ref not in levels:
            raise ValueError(f"reference level {ref!r} not found in {name}")
        reference[name] = ref
        others = [lev for lev in levels if lev != ref]
        if not others:
            raise ValueError(f"categorical predictor {name} has only one "
                             "level in the analysed rows")
        mat = np.array([[1.0 if var["values"][i] == lev else 0.0
                         for lev in others] for i in rows])
        blocks[name] = ([f"{name}[{lev}]" for lev in others],
                        mat.reshape(len(rows), len(others)))

    columns = ["Intercept"]
    mats = [np.ones((len(rows), 1))]
    terms = {}
    for name in predictors:
        cnames, mat = blocks[name]
        terms[name] = list(range(len(columns), len(columns) + len(cnames)))
        columns += cnames
        mats.append(mat)
    for a, b in inter:
        ca, ma = blocks[a]
        cb, mb = blocks[b]
        start = len(columns)
        for ia, na in enumerate(ca):
            for ib, nb in enumerate(cb):
                columns.append(f"{na}:{nb}")
                mats.append((ma[:, ia] * mb[:, ib])[:, None])
        terms[f"{a}:{b}"] = list(range(start, len(columns)))
    X = np.hstack(mats)
    y = [by[outcome]["values"][i] for i in rows]
    norms = np.linalg.norm(X, axis=0)
    if np.any(norms == 0) or np.linalg.matrix_rank(X / norms) < X.shape[1]:
        raise ValueError("the predictors are linearly dependent (a variable "
                         "is constant or duplicates others); remove one")
    return {"X": X, "y": y, "rows": rows, "n_rows": n_rows,
            "columns": columns, "terms": terms, "reference": reference}


def _vifs(X: np.ndarray) -> list:
    """VIF of each non-intercept column: 1 / (1 - R2) of that column
    regressed on all the other columns (intercept included)."""
    out = [None]
    for j in range(1, X.shape[1]):
        others = np.delete(X, j, axis=1)
        xj = X[:, j]
        beta, *_ = np.linalg.lstsq(others, xj, rcond=None)
        ss_res = float(np.sum((xj - others @ beta) ** 2))
        ss_tot = float(np.sum((xj - xj.mean()) ** 2))
        r2 = 1 - ss_res / ss_tot if ss_tot > 0 else 1.0
        out.append({"r2_with_others": r2,
                    "vif": 1 / (1 - r2) if r2 < 1 else math.inf})
    return out


def _aligned(rows, n_rows, values):
    full = [None] * n_rows
    for i, v in zip(rows, values):
        full[i] = float(v)
    return full


# ---------------------------------------------------- multiple linear regression

def _ols(X, y):
    q, rmat = np.linalg.qr(X)
    beta = np.linalg.solve(rmat, q.T @ y)
    resid = y - X @ beta
    return beta, resid, rmat


def multiple_regression(variables, outcome: str, predictors, *,
                        interactions=(), reference_levels=None,
                        ci_level: float = 0.95) -> dict:
    table = parse_table(variables)
    d = _design(table, outcome, predictors, interactions, reference_levels,
                outcome_kind="continuous")
    X, y = d["X"], np.array(d["y"], dtype=float)
    n, k = X.shape
    df_res = n - k
    if df_res < 1:
        raise ValueError(f"need more rows ({n}) than parameters ({k})")
    beta, resid, rmat = _ols(X, y)
    ss_res = float(resid @ resid)
    ss_tot = float(np.sum((y - y.mean()) ** 2))
    ss_reg = ss_tot - ss_res
    df_reg = k - 1
    ms_res = ss_res / df_res
    rinv = np.linalg.inv(rmat)
    cov = ms_res * (rinv @ rinv.T)
    se = np.sqrt(np.diag(cov))
    tcrit = float(stats.t.ppf((1 + ci_level) / 2, df_res))
    vifs = _vifs(X) if k > 2 else [None] + [{"r2_with_others": 0.0, "vif": 1.0}]
    coefs = []
    for j, name in enumerate(d["columns"]):
        t = beta[j] / se[j] if se[j] > 0 else math.inf
        coefs.append({
            "name": name, "estimate": float(beta[j]), "se": float(se[j]),
            "ci": [float(beta[j] - tcrit * se[j]), float(beta[j] + tcrit * se[j])],
            "t": float(abs(t)),
            "p": float(2 * stats.t.sf(abs(t), df_res)),
            "vif": None if vifs[j] is None else vifs[j]["vif"],
            "r2_with_others": None if vifs[j] is None else vifs[j]["r2_with_others"],
        })
    r2 = 1 - ss_res / ss_tot if ss_tot > 0 else float("nan")
    f_stat = (ss_reg / df_reg) / ms_res if df_reg > 0 and ms_res > 0 else math.inf
    p_f = float(stats.f.sf(f_stat, df_reg, df_res)) if math.isfinite(f_stat) else 0.0

    term_tests = []
    for term, idx in d["terms"].items():
        reduced = np.delete(X, idx, axis=1)
        _, resid_r, _ = _ols(reduced, y)
        ss_drop = float(resid_r @ resid_r) - ss_res
        f_t = (ss_drop / len(idx)) / ms_res if ms_res > 0 else math.inf
        term_tests.append({
            "term": term, "ss": ss_drop, "df": len(idx),
            "ms": ss_drop / len(idx), "F": float(f_t),
            "p": float(stats.f.sf(f_t, len(idx), df_res))})

    fitted = X @ beta
    return {
        "outcome": outcome,
        "n_rows_analyzed": n,
        "n_rows_skipped": d["n_rows"] - n,
        "n_parameters": k,
        "reference_levels": d["reference"],
        "coefficients": coefs,
        "ci_level": ci_level,
        "goodness": {
            "r_squared": float(r2),
            "adjusted_r_squared": float(1 - (1 - r2) * (n - 1) / df_res),
            "multiple_r": float(math.sqrt(max(r2, 0.0))),
            "sum_of_squares": ss_res,
            "sy_x": math.sqrt(ms_res),
            "rmse": math.sqrt(ss_res / (n - 1)) if n > 1 else None,
            "aicc": nlfit.aicc(ss_res, n, k) if ss_res > 0 else None,
            "df": df_res,
        },
        "overall_test": {"F": float(f_stat), "dfn": df_reg, "dfd": df_res,
                         "p": p_f},
        "anova": [
            {"source": "Regression", "ss": ss_reg, "df": df_reg,
             "ms": ss_reg / df_reg if df_reg else None,
             "F": float(f_stat), "p": p_f},
            {"source": "Residual", "ss": ss_res, "df": df_res, "ms": ms_res},
            {"source": "Total", "ss": ss_tot, "df": n - 1},
        ],
        "term_tests": term_tests,
        "normality_of_residuals": columnstats.normality_tests(resid.tolist()),
        "predicted": _aligned(d["rows"], d["n_rows"], fitted),
        "residuals": _aligned(d["rows"], d["n_rows"], resid),
    }


# -------------------------------------------------------- logistic regression

def _loglik(X, y, beta, offset):
    eta = X @ beta + offset
    return float(np.sum(y * eta - np.logaddexp(0.0, eta)))


def _logit_fit(X, y, *, offset=None, beta0=None, max_iter: int = 200,
               tol: float = 1e-10) -> dict:
    """Newton-Raphson (= IRLS for the canonical logit link) with step
    halving so the log-likelihood never decreases."""
    n, k = X.shape
    offset = np.zeros(n) if offset is None else offset
    beta = np.zeros(k) if beta0 is None else np.array(beta0, dtype=float)
    ll = _loglik(X, y, beta, offset)
    converged = False
    it = 0
    for it in range(1, max_iter + 1):
        p = expit(X @ beta + offset)
        w = p * (1 - p)
        grad = X.T @ (y - p)
        hess = X.T @ (X * w[:, None])
        try:
            step = np.linalg.solve(hess, grad)
        except np.linalg.LinAlgError:
            step = np.linalg.lstsq(hess, grad, rcond=None)[0]
        t = 1.0
        for _ in range(60):
            cand = beta + t * step
            ll_new = _loglik(X, y, cand, offset)
            if ll_new >= ll - 1e-12 * (1 + abs(ll)):
                break
            t /= 2
        delta = float(np.max(np.abs(cand - beta))) if k else 0.0
        beta, ll = cand, ll_new
        if delta < tol * (1 + float(np.max(np.abs(beta)))):
            converged = True
            break
    p = expit(X @ beta + offset)
    hess = X.T @ (X * (p * (1 - p))[:, None])
    return {"beta": beta, "ll": ll, "p": p, "hess": hess,
            "converged": converged, "iterations": it}


def detect_separation(X: np.ndarray, y: np.ndarray, tol: float = 1e-7):
    """Linear-programming check (Albert & Anderson 1984; Konis 2007) for
    the data configurations in which the maximum-likelihood estimate does
    not exist. Returns None, 'complete' or 'quasi-complete'."""
    from scipy.optimize import linprog

    s = np.where(y > 0.5, 1.0, -1.0)
    scale = np.max(np.abs(X), axis=0)
    scale[scale == 0] = 1.0
    A = (X / scale) * s[:, None]  # want A @ b >= 0 with some > 0
    k = A.shape[1]
    # complete: maximize t s.t. A b >= t, |b| <= 1, t <= 1
    res = linprog(np.r_[np.zeros(k), -1.0],
                  A_ub=np.hstack([-A, np.ones((A.shape[0], 1))]),
                  b_ub=np.zeros(A.shape[0]),
                  bounds=[(-1, 1)] * k + [(None, 1)], method="highs")
    if res.status == 0 and -res.fun > tol:
        return "complete"
    # quasi-complete: maximize sum(A b) s.t. A b >= 0, |b| <= 1
    res = linprog(-A.sum(axis=0), A_ub=-A, b_ub=np.zeros(A.shape[0]),
                  bounds=[(-1, 1)] * k, method="highs")
    if res.status == 0 and -res.fun > tol * A.shape[0]:
        return "quasi-complete"
    return None


def _profile_ci(X, y, j, fit, se_j, q):
    """Profile-likelihood interval for coefficient j: the values b where
    2 * (LL_max - max LL with beta_j fixed at b) equals the chi-square(1)
    critical value q. None for a side that never reaches q."""
    from scipy.optimize import brentq

    others = np.delete(X, j, axis=1)
    beta_hat = fit["beta"]
    start = np.delete(beta_hat, j)

    def dev(b):
        sub = _logit_fit(others, y, offset=b * X[:, j], beta0=start)
        return 2 * (fit["ll"] - sub["ll"]) - q

    out = []
    for sign in (-1.0, 1.0):
        step = se_j if se_j > 0 and math.isfinite(se_j) else 1.0
        inner, outer = beta_hat[j], None
        for _ in range(40):
            cand = beta_hat[j] + sign * step
            if dev(cand) > 0:
                outer = cand
                break
            inner = cand
            step *= 2
        if outer is None:
            out.append(None)
            continue
        out.append(float(brentq(dev, min(inner, outer), max(inner, outer),
                                xtol=1e-10, rtol=1e-12)))
    return out


def _hosmer_lemeshow(y, p, groups: int = 10) -> dict:
    n = y.size
    g = min(groups, n)
    order = np.argsort(p, kind="mergesort")
    chi2 = 0.0
    table = []
    for idx in np.array_split(order, g):
        n_g = idx.size
        obs1 = float(y[idx].sum())
        exp1 = float(p[idx].sum())
        pbar = exp1 / n_g
        if 0 < pbar < 1:
            chi2 += (obs1 - exp1) ** 2 / (n_g * pbar * (1 - pbar))
        table.append({"n": int(n_g), "observed_1": obs1, "expected_1": exp1,
                      "observed_0": n_g - obs1, "expected_0": n_g - exp1})
    df = g - 2
    return {"statistic": chi2, "df": df, "groups": table,
            "p": float(stats.chi2.sf(chi2, df)) if df > 0 else None}


def _aicc(ll, k, n):
    aic = -2 * ll + 2 * k
    return aic, (aic + 2 * k * (k + 1) / (n - k - 1) if n - k - 1 > 0 else None)


def _code_outcome(var, rows, positive=None):
    vals = [var["values"][i] for i in rows]
    if var["kind"] == "continuous":
        levels = sorted(set(vals))
        if not set(levels) <= {0.0, 1.0}:
            raise ValueError(f"outcome {var['name']} must contain only 0 and 1 "
                             "(or two text levels)")
        y = np.array(vals, dtype=float)
        labels = {"0": 0.0, "1": 1.0}
    else:
        levels = _levels(vals)
        if len(levels) != 2:
            raise ValueError(f"outcome {var['name']} must have exactly two "
                             f"levels, found {len(levels)}")
        pos = levels[1] if positive is None else str(positive)
        if pos not in levels:
            raise ValueError(f"outcome level {pos!r} not found")
        neg = levels[0] if pos == levels[1] else levels[1]
        y = np.array([1.0 if v == pos else 0.0 for v in vals])
        labels = {neg: 0.0, pos: 1.0}
    if y.min() == y.max():
        raise ValueError("the outcome has only one value in the analysed rows")
    return y, labels


def logistic_regression(variables, outcome: str, predictors, *,
                        interactions=(), reference_levels=None,
                        outcome_positive=None, ci_level: float = 0.95,
                        ci_method: str = "profile", cutoff: float = 0.5,
                        hl_groups: int = 10) -> dict:
    """Simple (one predictor) or multiple logistic regression.

    ci_method: 'profile' (profile likelihood, default) or 'wald'.
    """
    table = parse_table(variables)
    d = _design(table, outcome, predictors, interactions, reference_levels)
    X = d["X"]
    y, labels = _code_outcome(_by_name(table)[outcome], d["rows"],
                              outcome_positive)
    n, k = X.shape
    if n <= k:
        raise ValueError(f"need more rows ({n}) than parameters ({k})")

    try:
        sep = detect_separation(X, y)
        lp_checked = True
    except Exception:  # LP solver unavailable: fall back to the fit
        sep, lp_checked = None, False
    if sep:
        kind = "Perfect" if sep == "complete" else "Quasi-perfect"
        raise ValueError(f"{kind} separation: the predictors classify the "
                         "outcome (almost) perfectly, so the best-fit "
                         "coefficients are infinite and cannot be reported")
    fit = _logit_fit(X, y)
    if not fit["converged"] or (
            not lp_checked and np.max(np.abs(X @ fit["beta"])) > 30):
        raise ValueError("logistic regression did not converge (the data "
                         "may be perfectly or quasi-perfectly separated)")
    beta, ll, p = fit["beta"], fit["ll"], fit["p"]
    cov = np.linalg.inv(fit["hess"])
    se = np.sqrt(np.diag(cov))
    zcrit = float(stats.norm.ppf((1 + ci_level) / 2))
    q = float(stats.chi2.ppf(ci_level, 1))
    vifs = _vifs(X) if k > 2 else [None] + [{"r2_with_others": 0.0, "vif": 1.0}]

    coefs = []
    for j, name in enumerate(d["columns"]):
        z = beta[j] / se[j]
        if ci_method == "profile":
            ci = _profile_ci(X, y, j, fit, se[j], q)
        elif ci_method == "wald":
            ci = [float(beta[j] - zcrit * se[j]), float(beta[j] + zcrit * se[j])]
        else:
            raise ValueError(f"unknown CI method: {ci_method}")
        coefs.append({
            "name": name, "estimate": float(beta[j]), "se": float(se[j]),
            "ci": ci, "z": float(abs(z)),
            "p": float(2 * stats.norm.sf(abs(z))),
            "odds_ratio": float(math.exp(beta[j])),
            "odds_ratio_ci": [None if c is None else float(math.exp(c))
                              for c in ci],
            "vif": None if vifs[j] is None else vifs[j]["vif"],
        })

    ybar = float(y.mean())
    ll0 = float(n * (ybar * math.log(ybar) + (1 - ybar) * math.log(1 - ybar)))
    g = 2 * (ll - ll0)
    aic, aicc = _aicc(ll, k, n)
    aic0, aicc0 = _aicc(ll0, 1, n)
    cox_snell = 1 - math.exp(-g / n)
    max_cs = 1 - math.exp(2 * ll0 / n)

    pred1 = p > cutoff
    tp = int(np.sum(pred1 & (y == 1)))
    fn = int(np.sum(~pred1 & (y == 1)))
    tn = int(np.sum(~pred1 & (y == 0)))
    fp = int(np.sum(pred1 & (y == 0)))

    def _pct(a, b):
        return 100.0 * a / b if b else None

    roc = methodcomp.roc_curve(p[y == 1].tolist(), p[y == 0].tolist(),
                               ci_level=ci_level)
    roc.pop("analysis", None)

    out = {
        "outcome": outcome,
        "outcome_coding": labels,
        "n_rows_analyzed": n,
        "n_rows_skipped": d["n_rows"] - n,
        "n_ones": int(y.sum()), "n_zeros": int(n - y.sum()),
        "n_parameters": k,
        "reference_levels": d["reference"],
        "ci_level": ci_level, "ci_method": ci_method,
        "coefficients": coefs,
        "iterations": fit["iterations"],
        "log_likelihood": ll,
        "null_log_likelihood": ll0,
        "deviance": -2 * ll,
        "null_deviance": -2 * ll0,
        "model_comparison": {
            "intercept_only": {"df": n - 1, "aic": aic0, "aicc": aicc0,
                               "log_likelihood": ll0},
            "selected": {"df": n - k, "aic": aic, "aicc": aicc,
                         "log_likelihood": ll},
        },
        "likelihood_ratio_test": {"G": g, "df": k - 1,
                                  "p": float(stats.chi2.sf(g, k - 1))},
        "pseudo_r_squared": {
            "tjur": abs(float(p[y == 1].mean() - p[y == 0].mean())),
            "mcfadden": 1 - ll / ll0,
            "cox_snell": cox_snell,
            "nagelkerke": cox_snell / max_cs,
        },
        "hosmer_lemeshow": _hosmer_lemeshow(y, p, hl_groups),
        "classification": {
            "cutoff": cutoff,
            "observed_0_predicted_0": tn, "observed_0_predicted_1": fp,
            "observed_1_predicted_0": fn, "observed_1_predicted_1": tp,
            "percent_correct_0": _pct(tn, tn + fp),
            "percent_correct_1": _pct(tp, tp + fn),
            "percent_correct": _pct(tn + tp, n),
            "positive_predictive_power": _pct(tp, tp + fp),
            "negative_predictive_power": _pct(tn, tn + fn),
        },
        "roc": roc,
        "predicted_probability": _aligned(d["rows"], d["n_rows"], p),
        "observed": _aligned(d["rows"], d["n_rows"], y),
    }
    # Simple logistic regression with one continuous X: X at 50% = -b0/b1
    if k == 2 and len(d["terms"]) == 1 and d["columns"][1] == predictors[0]:
        out["x_at_50_percent"] = float(-beta[0] / beta[1]) if beta[1] else None
    return out


# ------------------------------------------------------------------------ PCA

def _orient(vectors: np.ndarray) -> np.ndarray:
    """PC signs are arbitrary. Orient each eigenvector so its entries sum
    to a negative number (first non-zero entry negative if the sum is 0);
    this reproduces the orientation printed in the guide's breast-cancer
    eigenvector example."""
    out = vectors.copy()
    for j in range(out.shape[1]):
        col = out[:, j]
        total = col.sum()
        if abs(total) < 1e-12:
            nz = col[np.abs(col) > 1e-12]
            total = nz[0] if nz.size else -1.0
        if total > 0:
            out[:, j] = -col
    return out


def _eigen(mat):
    w, v = np.linalg.eigh(mat)
    order = np.argsort(w)[::-1]
    return np.clip(w[order], 0.0, None), v[:, order]


def parallel_analysis(n: int, sds, *, standardize: bool, n_simulations: int = 1000,
                      percentile: float = 95.0, seed: int = 0) -> dict:
    """Eigenvalues of PCA on random multivariate normal data with the
    same n and number of variables: independent columns with the data's
    SDs (centered PCA) or unit SDs (standardized PCA)."""
    p = len(sds)
    rng = np.random.default_rng(seed)
    sims = np.empty((n_simulations, p))
    sds = np.asarray(sds, dtype=float)
    for s in range(n_simulations):
        data = rng.standard_normal((n, p))
        if standardize:
            mat = np.corrcoef(data, rowvar=False)
        else:
            data = data * sds
            mat = np.cov(data, rowvar=False)
        sims[s] = np.sort(np.linalg.eigvalsh(np.atleast_2d(mat)))[::-1]
    return {"mean": sims.mean(axis=0).tolist(),
            "upper": np.percentile(sims, percentile, axis=0).tolist(),
            "lower": np.percentile(sims, 100 - percentile, axis=0).tolist(),
            "percentile": percentile, "n_simulations": n_simulations,
            "seed": seed}


def pca(variables, *, names=None, standardize: bool = True,
        selection: str = "parallel_analysis", n_components=None,
        variance_threshold: float = 75.0, n_simulations: int = 1000,
        percentile: float = 95.0, seed: int = 0) -> dict:
    """Principal component analysis of the continuous variables (or the
    subset ``names``); rows with any blank are excluded.

    selection: 'parallel_analysis' (default) | 'kaiser' | 'variance'
    (cumulative percent >= variance_threshold) | 'all' | 'number'
    (n_components).
    """
    table = parse_table(variables)
    if names:
        by = _by_name(table)
        missing_names = [nm for nm in names if nm not in by]
        if missing_names:
            raise ValueError(f"unknown variable(s): {missing_names}")
        table = [by[nm] for nm in names]
    table = [v for v in table if v["kind"] == "continuous"]
    if len(table) < 2:
        raise ValueError("PCA needs at least 2 continuous variables")
    names = [v["name"] for v in table]
    n_rows = len(table[0]["values"])
    rows = [i for i in range(n_rows)
            if all(v["values"][i] is not None for v in table)]
    data = np.array([[v["values"][i] for v in table] for i in rows])
    n, p = data.shape
    if n < 3:
        raise ValueError("PCA needs at least 3 complete rows")
    means = data.mean(axis=0)
    sds = data.std(axis=0, ddof=1)
    if np.any(sds == 0):
        bad = [nm for nm, s in zip(names, sds) if s == 0]
        raise ValueError(f"constant variable(s) cannot be analysed: {bad}")
    centered = data - means
    work = centered / sds if standardize else centered
    mat = np.cov(work, rowvar=False)
    eigvals, eigvecs = _eigen(mat)
    eigvecs = _orient(eigvecs)
    total = float(eigvals.sum())
    prop = eigvals / total
    scores = work @ eigvecs
    loadings = eigvecs * np.sqrt(eigvals)
    corr_var_pc = loadings / (1.0 if standardize else sds[:, None])
    ss_scores = np.sum(scores ** 2, axis=0)
    case_contrib = np.divide(scores ** 2, ss_scores,
                             out=np.zeros_like(scores), where=ss_scores > 0)

    pa = None
    if selection == "parallel_analysis":
        pa = parallel_analysis(n, sds, standardize=standardize,
                               n_simulations=int(n_simulations),
                               percentile=float(percentile), seed=int(seed))
        keep = 0
        for lam, cut in zip(eigvals, pa["upper"]):
            if lam > cut:
                keep += 1
            else:
                break
    elif selection == "kaiser":
        # eigenvalue > 1 (standardized); for centered data the analogue
        # is eigenvalue > mean eigenvalue (the average variable variance)
        threshold = 1.0 if standardize else total / p
        keep = int(np.sum(eigvals > threshold))
    elif selection == "variance":
        cum = np.cumsum(prop) * 100
        keep = int(np.searchsorted(cum, float(variance_threshold) - 1e-9) + 1)
    elif selection == "all":
        keep = p
    elif selection == "number":
        if n_components is None:
            raise ValueError("selection 'number' needs n_components")
        keep = int(n_components)
    else:
        raise ValueError(f"unknown component selection: {selection}")
    keep = max(1, min(keep, p))  # always report at least PC1

    pcs = [f"PC{i + 1}" for i in range(p)]
    return {
        "names": names, "components": pcs,
        "standardized": standardize,
        "n_rows_analyzed": n, "n_rows_skipped": n_rows - n,
        "means": means.tolist(), "sds": sds.tolist(),
        "eigenvalues": eigvals.tolist(),
        "proportion_of_variance": prop.tolist(),
        "cumulative_proportion": np.cumsum(prop).tolist(),
        "selection": selection, "n_selected": keep,
        "parallel_analysis": pa,
        "eigenvectors": eigvecs.tolist(),          # [variable][PC]
        "loadings": loadings.tolist(),             # [variable][PC]
        "correlation_variables_pcs": corr_var_pc.tolist(),
        "contribution_of_variables": (eigvecs ** 2).tolist(),
        "scores": _aligned_rows(rows, n_rows, scores[:, :keep]),
        "contribution_of_cases": _aligned_rows(rows, n_rows,
                                               case_contrib[:, :keep]),
        "variable_matrix": mat.tolist(),  # correlations or covariances
    }


def _aligned_rows(rows, n_rows, mat):
    full = [None] * n_rows
    for i, row in zip(rows, mat):
        full[i] = [float(v) for v in row]
    return full


# ------------------------------------------------- extract / select / transform

def _transform_column(values, func: str) -> list:
    idx = [i for i, v in enumerate(values) if v is not None]
    arr = np.array([values[i] for i in idx], dtype=float)
    out = [None] * len(values)
    with np.errstate(all="ignore"):
        if func in ("log", "log10"):
            res = np.where(arr > 0, np.log10(np.where(arr > 0, arr, 1)), np.nan)
        elif func == "ln":
            res = np.where(arr > 0, np.log(np.where(arr > 0, arr, 1)), np.nan)
        elif func == "sqrt":
            res = np.where(arr >= 0, np.sqrt(np.abs(arr)), np.nan)
        elif func == "square":
            res = arr * arr
        elif func == "reciprocal":
            res = np.where(arr != 0, 1.0 / np.where(arr != 0, arr, 1), np.nan)
        elif func == "center":
            res = arr - arr.mean() if arr.size else arr
        elif func == "zscore":
            sd = arr.std(ddof=1) if arr.size > 1 else 0.0
            res = (arr - arr.mean()) / sd if sd > 0 else np.full(arr.size, np.nan)
        elif func == "rank":
            res = stats.rankdata(arr) if arr.size else arr
        else:
            raise ValueError(f"unknown transform: {func}")
    for i, v in zip(idx, res):
        out[i] = float(v) if math.isfinite(v) else None
    return out


_OPS = {
    "==": lambda a, b: a == b, "!=": lambda a, b: a != b,
    "<": lambda a, b: a < b, "<=": lambda a, b: a <= b,
    ">": lambda a, b: a > b, ">=": lambda a, b: a >= b,
}


def _row_passes(var, i, cond) -> bool:
    op = cond.get("op", "==")
    v = var["values"][i]
    if op == "is_missing":
        return v is None
    if op == "not_missing":
        return v is not None
    if v is None:
        return False
    target = cond.get("value")
    if var["kind"] == "continuous":
        conv = (lambda t: _as_number(t))
    else:
        conv = (lambda t: None if t is None else _level_text(t))
    if op in ("in", "not_in"):
        members = [conv(t) for t in (target or [])]
        return (v in members) == (op == "in")
    if op == "between":
        lo, hi = (conv(t) for t in target)
        return lo <= v <= hi
    if op not in _OPS:
        raise ValueError(f"unknown filter operator: {op}")
    t = conv(target)
    if t is None:
        return False
    if var["kind"] == "categorical" and op not in ("==", "!="):
        raise ValueError("categorical variables only support ==, !=, in, not_in")
    return _OPS[op](v, t)


def rearrange(variables, *, select=None, filters=(), transforms=(),
              combine: str = "and") -> dict:
    """Select & transform / extract & rearrange for a multiple-variables
    table.

    transforms: [{"variable", "func", "new_name"?}] applied first (on all
    rows); a new_name adds a column, otherwise the variable is replaced.
    filters: [{"variable", "op", "value"}] with op in ==, !=, <, <=, >,
    >=, between, in, not_in, is_missing, not_missing; combined with
    'and' (default) or 'or'.
    select: variable names (in output order); default all.
    """
    table = parse_table(variables)
    by = _by_name(table)
    order = [v["name"] for v in table]
    for tr in transforms or ():
        src = by.get(tr["variable"])
        if src is None:
            raise ValueError(f"unknown variable: {tr['variable']}")
        if src["kind"] != "continuous":
            raise ValueError(f"{src['name']} is categorical; transforms need numbers")
        new = {"name": tr.get("new_name") or src["name"], "kind": "continuous",
               "values": _transform_column(src["values"], tr["func"])}
        if new["name"] not in by:
            order.append(new["name"])
        by[new["name"]] = new
    n_rows = len(table[0]["values"]) if table else 0
    keep = []
    for i in range(n_rows):
        checks = []
        for cond in filters or ():
            var = by.get(cond["variable"])
            if var is None:
                raise ValueError(f"unknown variable: {cond['variable']}")
            checks.append(_row_passes(var, i, cond))
        if not checks or (all(checks) if combine == "and" else any(checks)):
            keep.append(i)
    names = list(select) if select else order
    for nm in names:
        if nm not in by:
            raise ValueError(f"unknown variable: {nm}")
    return {
        "rows": keep,
        "variables": [{"name": nm, "kind": by[nm]["kind"],
                       "values": [by[nm]["values"][i] for i in keep]}
                      for nm in names],
    }
