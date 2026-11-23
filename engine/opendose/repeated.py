"""Repeated-measures analyses: RM one-way ANOVA and Friedman test.

Prism statistics guide:
- "Repeated-measures one-way ANOVA": subjects are rows, treatments are
  columns; SS partitioned into treatment, subject and error;
  F = MS_treatment / MS_error. Prism reports the Geisser-Greenhouse
  epsilon correction by default (no sphericity assumption): epsilon
  multiplies both df before computing P.
- "Friedman test": nonparametric RM alternative (rank within each
  subject); Prism reports the Friedman statistic and Dunn's post test
  with multiplicity-adjusted P values. "Interpreting results: Friedman
  test": the P value is exact (ties allowed; values permuted within each
  row) unless (T!)^S exceeds 10^9 for T treatments and S subjects.
  friedman(..., exact=True) applies that rule (opendose.exactdist) and
  labels p_method; the default keeps the chi-square approximation.
- "effect_size" (opendose.effectsize): partial eta^2 (with its
  noncentral-F CI) and generalized eta^2 (Olejnik & Algina 2003) per
  term of the RM ANOVAs; Kendall's W for the Friedman test.
- Dunn's test after Friedman (Dunn 1964, Technometrics 6:241; GraphPad
  statistics guide "Dunn's multiple comparisons test" and "How the Dunn
  method for nonparametric comparisons works"): z = |difference of mean
  ranks| / sqrt(k(k+1)/(6n)), unadjusted P = 2 * (1 - Phi(z)), adjusted
  for exactly the family asked for: all pairs (default), each treatment
  vs. a control (k - 1 comparisons) or a list of planned pairs.
  Correction: Bonferroni (P times the family size, capped at 1; the
  default and Prism's choice), Holm's (1979, Scand J Statist 6:65)
  step-down (R p.adjust "holm"), or none. Each comparison carries
  p_unadjusted, p_adjusted, family_size and method; the block carries
  family {size, method, label}.
"""

from __future__ import annotations

import math
from itertools import combinations

import numpy as np
from scipy import stats

from . import effectsize, fdr
from .moretests import comparison_family
from .ttests import no_residual


def no_rm_scatter_message(test: str, error: str) -> str:
    """The sentence for a repeated-measures F test with no residual
    scatter (the treatments shift every subject by the same amounts)."""
    return (f"{test} is undefined: every subject's values differ by the "
            f"same amounts between conditions, so the {error} residual is 0 "
            "and the F ratio has no scatter to divide by. Check that each "
            "value was entered as measured, not copied or rounded.")

DUNN_FAMILIES = ("all", "control", "pairs")
DUNN_CORRECTIONS = ("bonferroni", "holm", "none")


def dunn_family_pairs(k: int, dunn_family: str = "all", control=0,
                      pairs=None) -> list:
    """The (i, j) index pairs of a Dunn family over k groups: all pairs
    (i < j), each group vs. the control as (i, control), or the given
    planned pairs (validated: indices in range, i != j, no pair twice)."""
    if dunn_family not in DUNN_FAMILIES:
        raise ValueError(f"unknown Dunn family: {dunn_family!r} (use "
                         f"'all', 'control' or 'pairs')")
    if dunn_family == "all":
        return list(combinations(range(k), 2))
    if dunn_family == "control":
        if isinstance(control, bool) or not isinstance(
                control, (int, np.integer)) or not 0 <= int(control) < k:
            raise ValueError(f"control must be a group index from 0 to "
                             f"{k - 1}, got {control!r}")
        c = int(control)
        return [(i, c) for i in range(k) if i != c]
    if not pairs:
        raise ValueError("dunn_family 'pairs' needs a non-empty list of "
                         "[i, j] index pairs")
    out, seen = [], set()
    for pr in pairs:
        if not isinstance(pr, (list, tuple)) or len(pr) != 2:
            raise ValueError(f"each planned pair must be [i, j], got {pr!r}")
        i, j = pr
        if any(isinstance(x, bool) or not isinstance(x, (int, np.integer))
               for x in (i, j)):
            raise ValueError(f"pair indices must be integers, got {pr!r}")
        i, j = int(i), int(j)
        if not (0 <= i < k and 0 <= j < k):
            raise ValueError(f"pair {[i, j]} has an index outside 0..{k - 1}")
        if i == j:
            raise ValueError(f"pair {[i, j]} compares a group with itself")
        key = frozenset((i, j))
        if key in seen:
            raise ValueError(f"pair {[i, j]} is listed more than once")
        seen.add(key)
        out.append((i, j))
    return out


def dunn_adjust(p_raw, correction: str = "bonferroni") -> list:
    """Adjusted P values for one Dunn family: Bonferroni min(P m, 1),
    Holm step-down (R p.adjust 'holm'), or none (P itself)."""
    m = len(p_raw)
    if correction == "bonferroni":
        return [min(p * m, 1.0) for p in p_raw]
    if correction == "holm":
        return [float(v) for v in fdr.holm(np.asarray(p_raw, dtype=float))]
    if correction == "none":
        return list(p_raw)
    raise ValueError(f"unknown Dunn correction: {correction!r} (use "
                     f"'bonferroni', 'holm' or 'none')")


def dunn_scope(k: int, dunn_family: str, names, control) -> str:
    if dunn_family == "all":
        return f"all pairs of {k} groups"
    if dunn_family == "control":
        return f"each of {k - 1} groups vs. {names[int(control)]}"
    return "planned pairs"


def _complete_matrix(datasets):
    """datasets: list of value-lists (one per treatment). Rows with any
    missing value are dropped (RM analyses need complete subjects)."""
    n_treat = len(datasets)
    n_rows = max(len(d) for d in datasets)
    rows = []
    for r in range(n_rows):
        row = [datasets[t][r] if r < len(datasets[t]) else None
               for t in range(n_treat)]
        if all(v is not None for v in row):
            rows.append([float(v) for v in row])
    if len(rows) < 2:
        raise ValueError("need at least 2 complete subject rows")
    return np.array(rows)  # subjects x treatments


def _gg_epsilon(M):
    """Geisser-Greenhouse epsilon from the sample covariance matrix."""
    S = np.cov(M.T, ddof=1)
    k = S.shape[0]
    mean_diag = np.trace(S) / k
    grand = S.mean()
    row_means = S.mean(axis=1)
    num = (k * (mean_diag - grand)) ** 2
    den = (k - 1) * (np.sum(S * S) - 2 * k * np.sum(row_means ** 2)
                     + k * k * grand * grand)
    if den <= 0:
        return 1.0
    return float(min(max(num / den, 1.0 / (k - 1)), 1.0))


#: Mauchly's test and the Huynh-Feldt epsilon are reported beside the
#: Geisser-Greenhouse epsilon; P stays Geisser-Greenhouse corrected
#: whatever Mauchly's test says (GraphPad statistics guide, "Sphericity
#: and compound symmetry": the test has little power with small samples
#: and too much with large ones, so it should not choose the analysis).
SPHERICITY_NOTE = ("Mauchly's test is reported, not used to choose the "
                   "correction: P is Geisser-Greenhouse corrected either "
                   "way.")
HF_FORMULA = ("Huynh-Feldt epsilon with Lecoutre's (1991) correction, "
              "((N - g + 1) d GG - 2) / (d (N - g - d GG)), capped at 1 "
              "(as R car and afex)")


def _contrasts(k: int) -> np.ndarray:
    from .mixedmodel import orthonormal_contrasts
    return orthonormal_contrasts(k)


def sphericity(S, C, n_subjects: int, *, n_groups: int = 1,
               gg=None) -> dict:
    """Sphericity of one repeated-measures term: the Geisser-Greenhouse,
    Huynh-Feldt and lower-bound epsilons and Mauchly's test.

    S: covariance matrix of the subjects' repeated measurements (the
    pooled within-group covariance in a design with g groups, on N - g
    df); C: orthonormal contrasts of the term (k x d). gg: the
    Geisser-Greenhouse epsilon the analysis already uses (kept so its P
    values stay as they were); computed from C'SC otherwise.

    Mauchly (1940, Ann Math Stat 11:204): W = det(T) / (tr(T) / d)^d for
    T = C'SC; chi^2 = -(N - g) (1 - (2d^2 + d + 2) / (6 d (N - g))) ln W
    on d(d + 1)/2 - 1 df, with the second-order term of Anderson (2003,
    sec. 10.7) exactly as R's mauchly.test (k = number of measurements).
    Huynh-Feldt (1976, J Educ Stat 1:69) with Lecoutre's (1991, J Educ
    Stat 16:371) correction of the numerator: ((N - g + 1) d GG - 2) /
    (d (N - g - d GG)), capped at 1 (R car::Anova, afex; equal to the
    1976 formula and to pingouin.epsilon when g = 1). Lower bound 1/d
    (Greenhouse & Geisser 1959). Mauchly's test is reported only; it
    never chooses the correction (SPHERICITY_NOTE)."""
    S = np.asarray(S, dtype=float)
    d = int(C.shape[1])
    k = int(C.shape[0])  # measurements per subject (R's p)
    df_res = int(n_subjects) - int(n_groups)
    out = {"measurements": k, "contrasts": d, "n_subjects": int(n_subjects),
           "hf_formula": HF_FORMULA, "note": SPHERICITY_NOTE}
    if d <= 1:
        return {**out, "gg_epsilon": 1.0, "hf_epsilon": 1.0,
                "lb_epsilon": 1.0, "mauchly": None,
                "mauchly_note": ("With 2 levels there is one contrast, so "
                                 "sphericity always holds (epsilon = 1).")}
    T = C.T @ S @ C
    tr = float(np.trace(T))
    if gg is None:
        tt = float(np.trace(T @ T))
        gg = min(max(tr * tr / (d * tt), 1.0 / d), 1.0) if tt > 0 else 1.0
    gg = float(gg)
    out.update(gg_epsilon=gg, lb_epsilon=1.0 / d)
    num = (df_res + 1) * d * gg - 2
    den = d * (df_res - d * gg)
    # with fewer residual df than contrasts the covariance is singular
    out["hf_epsilon"] = (float(min(num / den, 1.0))
                         if df_res >= d and den > 0 and num > 0 else None)
    if out["hf_epsilon"] is None:
        out["hf_note"] = ("The Huynh-Feldt epsilon is undefined with this "
                          "few subjects.")
    if not np.all(np.isfinite(T)) or not tr > 0:
        out["mauchly"] = None
        out["mauchly_note"] = ("Mauchly's test is undefined: the repeated "
                               "measurements have no scatter.")
        return out
    sign, log_w = np.linalg.slogdet(T / (tr / d))
    if df_res < d or sign <= 0:
        out["mauchly"] = None
        out["mauchly_note"] = (
            f"Mauchly's test needs more subjects: {df_res} residual df for "
            f"{d} contrasts leave their covariance singular (W = 0), so "
            "the test is undefined.")
        return out
    rho = 1 - (2 * d * d + d + 2) / (6 * d * df_res)
    chi2 = -df_res * rho * float(log_w)
    ddof = d * (d + 1) // 2 - 1
    w2 = ((d + 2) * (d - 1) * (d - 2) * (2 * d ** 3 + 6 * d * d + 3 * k + 2)
          / (288 * (df_res * d * rho) ** 2))
    p1 = float(stats.chi2.sf(chi2, ddof))
    p2 = float(stats.chi2.sf(chi2, ddof + 4))
    out["mauchly"] = {"W": float(math.exp(log_w)), "chi_square": float(chi2),
                      "df": int(ddof),
                      "p": float(min(max(p1 + w2 * (p2 - p1), 0.0), 1.0))}
    return out


def _corrected_p(f, df1, df2, eps):
    """P of F on both df multiplied by epsilon (None without epsilon)."""
    if eps is None or not math.isfinite(f):
        return None
    return float(stats.f.sf(f, df1 * eps, df2 * eps))


def rm_linear_trend(datasets, names=None) -> dict:
    """Test for linear trend after repeated-measures one-way ANOVA: the
    treatments are coded 1, 2, ..., k in the order entered and the
    treatment SS is split into the part a straight line through the
    treatment means explains (1 df) and the rest (nonlinear variation,
    k - 2 df), each tested with F against the RM ANOVA's residual mean
    square (subject x treatment), as the trend test after ordinary one-way
    ANOVA uses the within-group mean square (Maxwell & Delaney 2004, ch.
    11, trend analysis in within-subject designs; R: summary(aov(y ~ treat
    + Error(subject / treat)), split = list(treat = list(linear = 1)))
    with polynomial contrasts). The pooled residual assumes sphericity;
    per_subject is the test that does not: each subject's linear score
    sum_j c_j y_ij (c centred codes) tested against 0 by a one-sample t
    test on n - 1 df (t^2 = F). Only complete subjects are used, as in
    rm_one_way_anova."""
    M = _complete_matrix(datasets)
    n, k = M.shape
    if k < 3:
        raise ValueError("a test for trend needs at least 3 treatments")
    if n < 2:
        raise ValueError("a test for trend needs at least 2 complete subjects")
    grand = M.mean()
    means = M.mean(axis=0)
    codes = np.arange(1, k + 1, dtype=float)
    c = codes - codes.mean()
    scc = float((c * c).sum())
    slope = float((c * (means - grand)).sum() / scc)
    ss_linear = float(n * ((c * means).sum()) ** 2 / scc)
    ss_treat = float(n * ((means - grand) ** 2).sum())
    ss_subject = float(k * ((M.mean(axis=1) - grand) ** 2).sum())
    ss_total = float(((M - grand) ** 2).sum())
    ss_error = ss_total - ss_treat - ss_subject
    df_error = (n - 1) * (k - 1)
    ms_error = ss_error / df_error
    ss_nonlin = max(ss_treat - ss_linear, 0.0)
    df_nonlin = k - 2
    f_lin = ss_linear / ms_error if ms_error > 0 else math.inf
    f_non = (ss_nonlin / df_nonlin) / ms_error if ms_error > 0 else math.inf
    scores = M @ c
    sd = float(scores.std(ddof=1))
    t = float(scores.mean() / (sd / math.sqrt(n))) if sd > 0 else math.inf
    return {
        "codes": codes.tolist(),
        "names": list(names) if names else [f"Treatment {i}" for i in range(k)],
        "n_subjects": int(n),
        "slope": slope,
        "linear": {"ss": ss_linear, "df": 1, "F": f_lin,
                   "p": float(stats.f.sf(f_lin, 1, df_error))},
        "nonlinear": {"ss": ss_nonlin, "df": df_nonlin, "F": f_non,
                      "p": float(stats.f.sf(f_non, df_nonlin, df_error))},
        "within": {"ss": ss_error, "df": df_error, "ms": ms_error,
                   "label": "residual (subject x treatment)"},
        "per_subject": {"t": t, "df": n - 1, "F": t * t,
                        "p": float(2 * stats.t.sf(abs(t), n - 1)),
                        "mean_score": float(scores.mean()), "sd_score": sd},
        # variation within subjects that the line explains
        "r_squared": (ss_linear / (ss_treat + ss_error)
                      if ss_treat + ss_error > 0 else None),
        "r_squared_alerting": ss_linear / ss_treat if ss_treat > 0 else None,
        "repeated": True,
    }


def rm_one_way_anova(datasets, names=None) -> dict:
    M = _complete_matrix(datasets)
    n, k = M.shape  # subjects, treatments
    grand = M.mean()
    ss_total = float(((M - grand) ** 2).sum())
    ss_treat = float(n * ((M.mean(axis=0) - grand) ** 2).sum())
    ss_subject = float(k * ((M.mean(axis=1) - grand) ** 2).sum())
    ss_error = ss_total - ss_treat - ss_subject
    df_treat, df_subj = k - 1, n - 1
    df_error = df_treat * df_subj
    ms_treat = ss_treat / df_treat
    ms_error = ss_error / df_error
    # the residual summed directly (ss_error above is a difference of
    # sums and keeps their rounding)
    resid = (M - M.mean(axis=1, keepdims=True) - M.mean(axis=0) + grand)
    if no_residual(float((resid * resid).sum()), M):
        # perfectly additive data (every subject's values differ by the
        # same amounts): F = MS / 0 is undefined, not infinite
        raise ValueError(no_rm_scatter_message(
            "Repeated-measures ANOVA", "subject x treatment"))
    f = ms_treat / ms_error
    p_sphericity = float(stats.f.sf(f, df_treat, df_error))
    eps = _gg_epsilon(M)
    p_gg = float(stats.f.sf(f, df_treat * eps, df_error * eps))
    spher = sphericity(np.cov(M.T, ddof=1), _contrasts(k), n, gg=eps)

    return {
        "analysis": "rm_one_way_anova",
        "n_subjects": int(n), "n_treatments": int(k),
        "table": {
            "ss_treatment": ss_treat, "df_treatment": df_treat,
            "ms_treatment": ms_treat,
            "ss_subject": ss_subject, "df_subject": df_subj,
            "ss_error": ss_error, "df_error": df_error,
            "ms_error": ms_error,
            "F": float(f),
            "p_assuming_sphericity": p_sphericity,
            "gg_epsilon": eps,
            "p_geisser_greenhouse": p_gg,
            "hf_epsilon": spher["hf_epsilon"],
            "p_huynh_feldt": (_corrected_p(f, df_treat, df_error,
                                           spher["hf_epsilon"])
                              if ms_error > 0 else None),
        },
        "sphericity": spher,
        "r_squared": ss_treat / (ss_treat + ss_error)
        if ss_treat + ss_error > 0 else None,
        "treatment_means": [float(v) for v in M.mean(axis=0)],
        "names": names or [f"Treatment {i}" for i in range(k)],
        "effect_size": effectsize.safe(
            effectsize.repeated_term, ss_treat, df_treat, ss_error,
            df_error, [ss_subject, ss_error], ss_subjects=ss_subject,
            df_subjects=df_subj),
    }


def rm_two_way_mixed(cells, *, row_names=None, col_names=None) -> dict:
    """Mixed-design ("RM by rows") two-way ANOVA.

    Prism statistics guide, "Two-way ANOVA with repeated measures":
    columns (datasets) are independent groups of subjects; rows are the
    repeated factor; subcolumn s of a column is subject s of that group,
    measured at every row. Between-subjects factor tested against
    subjects-within-groups; the repeated factor and interaction against
    the within-subject residual. Matches pingouin.mixed_anova.

    cells[row][col] = list of subject values (subject = index in list).
    Subjects missing any row are dropped (complete-case, like Prism <8).
    """
    a = len(cells)               # repeated (row) levels
    b = len(cells[0])            # groups (columns)
    # subjects[j] = matrix rows x n_j
    subjects = []
    for j in range(b):
        n_sub = max(len(cells[i][j]) for i in range(a))
        cols = []
        for s in range(n_sub):
            vals = [cells[i][j][s] if s < len(cells[i][j]) else None
                    for i in range(a)]
            if all(v is not None for v in vals):
                cols.append([float(v) for v in vals])
        if len(cols) < 2:
            raise ValueError("need >= 2 complete subjects per group")
        subjects.append(np.array(cols).T)  # rows x subjects
    ns = [m.shape[1] for m in subjects]
    n_subj = sum(ns)
    all_vals = np.concatenate([m.ravel() for m in subjects])
    gm = float(all_vals.mean())
    ss_total = float(((all_vals - gm) ** 2).sum())

    subj_means = np.concatenate([m.mean(axis=0) for m in subjects])
    ss_between_subj = a * float(((subj_means - gm) ** 2).sum())
    group_means = [float(m.mean()) for m in subjects]
    ss_group = a * float(sum(n * (g - gm) ** 2
                             for n, g in zip(ns, group_means)))
    ss_subj_within = ss_between_subj - ss_group

    # cell (row x group) and row marginal means, weighted by group sizes
    cell_means = np.array([[float(subjects[j][i].mean()) for j in range(b)]
                           for i in range(a)])
    row_means = np.array([
        float(np.concatenate([subjects[j][i] for j in range(b)]).mean())
        for i in range(a)])
    ss_row = n_subj * float(((row_means - gm) ** 2).sum())
    ss_inter = float(sum(ns[j] * (cell_means[i, j] - row_means[i]
                                  - group_means[j] + gm) ** 2
                         for i in range(a) for j in range(b)))
    ss_within_subj = ss_total - ss_between_subj
    ss_error = ss_within_subj - ss_row - ss_inter

    df_group, df_subj = b - 1, n_subj - b
    df_row = a - 1
    df_inter = (a - 1) * (b - 1)
    df_error = (a - 1) * (n_subj - b)
    ms = {"group": ss_group / df_group, "subj": ss_subj_within / df_subj,
          "row": ss_row / df_row, "inter": ss_inter / df_inter,
          "error": ss_error / df_error if df_error else math.nan}
    # the two error terms summed directly, to tell rounding from scatter
    # (ss_error and ss_subj_within are differences of sums)
    direct = {
        "error": sum(float(((m - m.mean(axis=0) - m.mean(axis=1,
                                                         keepdims=True)
                             + m.mean()) ** 2).sum()) for m in subjects),
        "subj": a * sum(float(((m.mean(axis=0) - m.mean()) ** 2).sum())
                        for m in subjects)}

    def source(ss, df, msq, err_ms, err_df, err="error"):
        out = {"ss": float(ss), "df": int(df), "ms": float(msq),
               "percent_of_total": float(100 * ss / ss_total)
               if ss_total else None}
        if not err_df or no_residual(direct[err], all_vals):
            # F = MS / 0 is undefined (not infinite): say so per term
            return {**out, "F": None, "p": None,
                    "note": "undefined: its error term has no scatter"}
        f = msq / err_ms
        return {**out, "F": float(f), "p": float(stats.f.sf(f, df, err_df))}

    # GG epsilon from the pooled within-group covariance of the subjects'
    # row-vectors: each subject centred on its own group's mean profile,
    # divided by N - groups. Group differences in the means are the
    # between-subjects effect, not a departure from sphericity, so they
    # must not enter the covariance (the error SSCP matrix that SPSS, SAS
    # and pingouin >= 0.7 use).
    if a > 1:
        centred = np.concatenate(
            [(m - m.mean(axis=1, keepdims=True)).T for m in subjects], axis=0)
        s_pooled = centred.T @ centred / (n_subj - b)
        eps = _gg_epsilon_from_cov(s_pooled)
        spher = sphericity(s_pooled, _contrasts(a), n_subj, n_groups=b,
                           gg=eps)
    else:
        eps = 1.0
        spher = None

    row_src = source(ss_row, df_row, ms["row"], ms["error"], df_error)
    inter_src = source(ss_inter, df_inter, ms["inter"], ms["error"], df_error)
    col_src = source(ss_group, df_group, ms["group"], ms["subj"], df_subj,
                     "subj")
    if all(s["F"] is None for s in (row_src, inter_src, col_src)):
        raise ValueError(no_rm_scatter_message(
            "Two-way repeated-measures ANOVA",
            "subjects-within-groups and the within-subject"))
    if row_src["F"] is not None:
        row_src["p_geisser_greenhouse"] = float(
            stats.f.sf(row_src["F"], df_row * eps, df_error * eps))
        inter_src["p_geisser_greenhouse"] = float(
            stats.f.sf(inter_src["F"], df_inter * eps, df_error * eps))
        if spher is not None:
            hf = spher["hf_epsilon"]
            row_src["p_huynh_feldt"] = _corrected_p(
                row_src["F"], df_row, df_error, hf)
            inter_src["p_huynh_feldt"] = _corrected_p(
                inter_src["F"], df_inter, df_error, hf)

    resall = [ss_subj_within, ss_error]
    subj = {"ss_subjects": ss_subj_within, "df_subjects": df_subj}
    effect_size = {
        "interaction": effectsize.safe(effectsize.repeated_term, ss_inter,
                                       df_inter, ss_error, df_error, resall,
                                       **subj),
        "row_factor": effectsize.safe(effectsize.repeated_term, ss_row,
                                      df_row, ss_error, df_error, resall,
                                      **subj),
        "column_factor": effectsize.safe(effectsize.repeated_term, ss_group,
                                         df_group, ss_subj_within, df_subj,
                                         resall, within=False, **subj),
    }
    return {
        "analysis": "rm_two_way_mixed",
        "design": "columns are groups, rows are repeated measures",
        "n_subjects": int(n_subj), "rows": a, "cols": b,
        "group_sizes": ns,
        "gg_epsilon": float(eps),
        # the repeated (row) factor; the interaction uses the same epsilon
        "sphericity": ({"row_factor": spher, "interaction": spher}
                       if spher is not None else None),
        "sources": {
            "interaction": inter_src,
            "row_factor": row_src,
            "column_factor": col_src,
            "subjects": {"ss": float(ss_subj_within), "df": int(df_subj),
                         "ms": float(ms["subj"]), "F": None, "p": None,
                         "percent_of_total": float(
                             100 * ss_subj_within / ss_total)
                         if ss_total else None},
            "residual": {"ss": float(ss_error), "df": int(df_error),
                         "ms": float(ms["error"]), "F": None, "p": None,
                         "percent_of_total": float(100 * ss_error / ss_total)
                         if ss_total else None},
        },
        "cell_means": cell_means.tolist(),
        "row_names": row_names or [f"Row {i + 1}" for i in range(a)],
        "col_names": col_names or [f"Column {j + 1}" for j in range(b)],
        "effect_size": effect_size,
    }


def _gg_epsilon_from_cov(S):
    k = S.shape[0]
    mean_diag = np.trace(S) / k
    grand = S.mean()
    row_means = S.mean(axis=1)
    num = (k * (mean_diag - grand)) ** 2
    den = (k - 1) * (np.sum(S * S) - 2 * k * np.sum(row_means ** 2)
                     + k * k * grand * grand)
    if den <= 0:
        return 1.0
    return float(min(max(num / den, 1.0 / (k - 1)), 1.0))


def rm_two_way_both(cells, *, row_names=None, col_names=None) -> dict:
    """Fully repeated two-way ANOVA: every subject measured at every
    row x column combination; subcolumn index = subject, consistent
    across all datasets. Each factor is tested against its own
    factor-by-subject interaction (matches statsmodels AnovaRM with two
    within-subject factors)."""
    a = len(cells)
    b = len(cells[0])
    n = min(len(cells[i][j]) for i in range(a) for j in range(b))
    if n < 2:
        raise ValueError("need >= 2 subjects with complete data")
    Y = np.empty((a, b, n))
    for i in range(a):
        for j in range(b):
            vals = cells[i][j][:n]
            if any(v is None for v in vals):
                raise ValueError("fully-RM design needs complete data")
            Y[i, j, :] = [float(v) for v in vals]

    gm = Y.mean()
    m_i, m_j, m_s = Y.mean(axis=(1, 2)), Y.mean(axis=(0, 2)), Y.mean(axis=(0, 1))
    m_ij = Y.mean(axis=2)
    m_is = Y.mean(axis=1)
    m_js = Y.mean(axis=0)

    ss_a = n * b * float(((m_i - gm) ** 2).sum())
    ss_b = n * a * float(((m_j - gm) ** 2).sum())
    ss_subj = a * b * float(((m_s - gm) ** 2).sum())
    ss_ab = n * float(((m_ij - m_i[:, None] - m_j[None, :] + gm) ** 2).sum())
    ss_as = b * float(((m_is - m_i[:, None] - m_s[None, :] + gm) ** 2).sum())
    ss_bs = a * float(((m_js - m_j[:, None] - m_s[None, :] + gm) ** 2).sum())
    ss_total = float(((Y - gm) ** 2).sum())
    ss_abs = ss_total - ss_a - ss_b - ss_ab - ss_subj - ss_as - ss_bs

    df_a, df_b, df_s = a - 1, b - 1, n - 1
    df_ab = df_a * df_b
    df_as, df_bs, df_abs = df_a * df_s, df_b * df_s, df_a * df_b * df_s

    # the three-way residual summed directly (ss_abs is a difference)
    resid = (Y - m_ij[:, :, None] - m_is[:, None, :] - m_js[None, :, :]
             + m_i[:, None, None] + m_j[None, :, None] + m_s[None, None, :]
             - gm)
    ss_abs_direct = float((resid * resid).sum())

    def test(ss, df, ss_err, df_err, check=None):
        msq, mse = ss / df, ss_err / df_err
        out = {"ss": float(ss), "df": int(df), "ms": float(msq),
               "error_ss": float(ss_err), "error_df": int(df_err),
               "percent_of_total": float(100 * ss / ss_total)
               if ss_total else None}
        if no_residual(ss_err if check is None else check, Y):
            # F = MS / 0 is undefined (not infinite): say so per term
            return {**out, "F": None, "p": None,
                    "note": "undefined: its error term has no scatter"}
        f = msq / mse
        return {**out, "F": float(f), "p": float(stats.f.sf(f, df, df_err))}

    resall = [ss_subj, ss_as, ss_bs, ss_abs]
    subj = {"ss_subjects": ss_subj, "df_subjects": df_s}
    effect_size = {
        "interaction": effectsize.safe(effectsize.repeated_term, ss_ab,
                                       df_ab, ss_abs, df_abs, resall, **subj),
        "row_factor": effectsize.safe(effectsize.repeated_term, ss_a, df_a,
                                      ss_as, df_as, resall, **subj),
        "column_factor": effectsize.safe(effectsize.repeated_term, ss_b,
                                         df_b, ss_bs, df_bs, resall, **subj),
    }
    # sphericity of each term from the covariance of the subjects' a x b
    # measurements (column i * b + j), with the term's contrasts
    S = np.cov(Y.reshape(a * b, n), ddof=1)
    Ca, Cb = _contrasts(a), _contrasts(b)
    ua, ub = np.ones((a, 1)) / math.sqrt(a), np.ones((b, 1)) / math.sqrt(b)
    spher = {"row_factor": sphericity(S, np.kron(Ca, ub), n),
             "column_factor": sphericity(S, np.kron(ua, Cb), n),
             "interaction": sphericity(S, np.kron(Ca, Cb), n)}
    sources = {"interaction": test(ss_ab, df_ab, ss_abs, df_abs,
                                   ss_abs_direct),
               "row_factor": test(ss_a, df_a, ss_as, df_as),
               "column_factor": test(ss_b, df_b, ss_bs, df_bs)}
    if all(s["F"] is None for s in sources.values()):
        raise ValueError(no_rm_scatter_message(
            "Two-way repeated-measures ANOVA", "subject x factor"))
    for key, src in sources.items():
        if src["F"] is not None:
            src["p_geisser_greenhouse"] = _corrected_p(
                src["F"], src["df"], src["error_df"],
                spher[key]["gg_epsilon"])
            src["p_huynh_feldt"] = _corrected_p(
                src["F"], src["df"], src["error_df"],
                spher[key]["hf_epsilon"])
    return {
        "analysis": "rm_two_way_both",
        "design": "both factors repeated (every subject in every cell)",
        "n_subjects": int(n), "rows": a, "cols": b,
        "sphericity": spher,
        "sources": {
            **sources,
            "subjects": {"ss": float(ss_subj), "df": int(df_s),
                         "ms": float(ss_subj / df_s), "F": None, "p": None,
                         "percent_of_total": float(100 * ss_subj / ss_total)
                         if ss_total else None},
        },
        "cell_means": m_ij.tolist(),
        "row_names": row_names or [f"Row {i + 1}" for i in range(a)],
        "col_names": col_names or [f"Column {j + 1}" for j in range(b)],
        "effect_size": effect_size,
    }


def page_trend(datasets, names=None) -> dict:
    """Page's test for a monotone trend across matched treatments in the
    order entered (Page 1963, JASA 58:216): values ranked within each
    subject (midranks for ties), L = sum_j j R_j with R_j the rank sum of
    column j. Large L: values increase from the first column to the last.

    P: exact when Page's tables cover the design (exactdist.
    page_exact_feasible: k <= 8 and n <= 12, or n <= 20 with k = 3),
    from the permutation distribution of the ranks within each row
    (exactdist.page_null; conditional on ties, like the Friedman test's
    exact P); otherwise normal with E(L) = n k (k + 1)^2 / 4 and the
    permutation variance sum_rows k (k^2 - 1) / 12 * sum_j (r_ij -
    rbar)^2 / (k - 1), which is n k^2 (k + 1) (k^2 - 1) / 144 without
    ties (Neuhauser 2012, Nonparametric Statistical Tests, p. 151). Both
    one-sided P values and the two-sided P (twice the smaller, capped at
    1) are reported. Only complete subjects are used, as in friedman."""
    M = _complete_matrix(datasets)
    n, k = M.shape
    if k < 3:
        raise ValueError("Page's test for trend needs at least 3 treatments")
    ranks = np.apply_along_axis(stats.rankdata, 1, M)
    w = np.arange(1, k + 1, dtype=float)
    L = float((ranks.sum(axis=0) * w).sum())
    mean = n * k * (k + 1) ** 2 / 4.0
    row_ss = ((ranks - (k + 1) / 2.0) ** 2).sum(axis=1)
    var = float((k * (k * k - 1) / 12.0 * row_ss / (k - 1)).sum())
    if not var > 0:
        raise ValueError("Page's test is undefined: every subject has the "
                         "same value at every treatment")
    sd = math.sqrt(var)
    z = (L - mean) / sd
    from . import exactdist
    if exactdist.page_exact_feasible(n, k):
        dist, offset = exactdist.page_null(np.rint(2 * ranks).astype(int))
        idx = int(round(2 * L)) - offset
        p_inc = float(min(dist[idx:].sum(), 1.0))
        p_dec = float(min(dist[:idx + 1].sum(), 1.0))
        p_method = "exact"
    else:
        p_inc, p_dec = float(stats.norm.sf(z)), float(stats.norm.cdf(z))
        p_method = "normal approximation"
    ties = bool(np.any(ranks != np.round(ranks)) or any(
        len(np.unique(r)) < k for r in M))
    return {
        "test": "page", "L": L, "mean": mean, "sd": sd, "z": float(z),
        "p": float(min(1.0, 2 * min(p_inc, p_dec))),
        "p_increasing": p_inc, "p_decreasing": p_dec, "p_method": p_method,
        "ties": ties, "n_subjects": int(n), "k": int(k),
        "rank_sums": [float(v) for v in ranks.sum(axis=0)],
        "direction": ("increasing" if L > mean else
                      "decreasing" if L < mean else "none"),
        "order": list(names) if names else [f"Treatment {i}"
                                            for i in range(k)],
        "note": ("The treatments are tested in the order of the columns, "
                 "first to last; that order is the hypothesis."),
    }


def _friedman_p(M, exact):
    """(statistic, P, p_method): the chi-square P, or with exact=True the
    exact P when (k!)^n is within the guide's limit."""
    n, k = M.shape
    stat, p = stats.friedmanchisquare(*[M[:, j] for j in range(k)])
    p_method = None
    if exact:
        from . import exactdist
        if exactdist.friedman_exact_feasible(n, k):
            p, p_method = exactdist.friedman_exact_p(M), "exact"
        else:
            p_method = "approximate"
    return stat, p, p_method


def friedman(datasets, names=None, *, dunns: bool = True,
             exact: bool = False, dunn_family: str = "all", control=0,
             pairs=None, dunn_correction: str = "bonferroni") -> dict:
    """Friedman test, with Dunn's post test on the family dunn_family
    ("all" | "control" vs. group index `control` | "pairs" = planned
    [[i, j], ...]) corrected by dunn_correction ("bonferroni" | "holm" |
    "none"); see the module docstring."""
    if dunn_correction not in DUNN_CORRECTIONS:
        raise ValueError(f"unknown Dunn correction: {dunn_correction!r} "
                         f"(use 'bonferroni', 'holm' or 'none')")
    M = _complete_matrix(datasets)
    n, k = M.shape
    stat, p, p_method = _friedman_p(M, exact)
    names = names or [f"Treatment {i}" for i in range(k)]
    ranks = np.apply_along_axis(stats.rankdata, 1, M)
    rank_sums = ranks.sum(axis=0)
    out = {
        "analysis": "friedman",
        "statistic": float(stat), "p": float(p),
        "n_subjects": int(n),
        "rank_sums": [float(v) for v in rank_sums],
        "names": names,
    }
    if p_method is not None:
        out["p_method"] = p_method
    # the smallest P this design can give, by the same method
    # (exactdist.min_p_friedman)
    from . import exactdist
    try:
        floor = exactdist.min_p_friedman(M, lambda m: _friedman_p(m, exact)[1])
    except ValueError:
        floor = None
    out["min_attainable_p"] = exactdist.min_p_block(
        floor, "exact" if p_method == "exact" else "chi-square approximation",
        [n, k])
    out["effect_size"] = effectsize.safe(effectsize.kendalls_w, float(stat),
                                         int(n), int(k))
    if dunns:
        # Dunn's for Friedman: z = |R_i - R_j| / sqrt(k(k+1)/(6n)),
        # comparing mean ranks; Bonferroni-adjusted P (Prism reports
        # multiplicity-adjusted P values).
        mean_ranks = rank_sums / n
        fam_pairs = dunn_family_pairs(k, dunn_family, control, pairs)
        m = len(fam_pairs)
        se = math.sqrt(k * (k + 1) / (6.0 * n))
        zs = [abs(mean_ranks[i] - mean_ranks[j]) / se for i, j in fam_pairs]
        p_raw = [2 * float(stats.norm.sf(z)) for z in zs]
        p_adjs = dunn_adjust(p_raw, dunn_correction)
        method_id = f"dunn_{dunn_correction}"
        comparisons = []
        for (i, j), z, p0, p_adj in zip(fam_pairs, zs, p_raw, p_adjs):
            comparisons.append({
                "pair": f"{names[i]} vs. {names[j]}",
                "mean_rank_difference": float(mean_ranks[i] - mean_ranks[j]),
                "statistic": float(z),
                "p_adjusted": p_adj,
                "significant_05": bool(p_adj < 0.05),
                "p_unadjusted": p0,
                "family_size": m,
                "method": method_id,
                "a_index": int(i), "b_index": int(j),
            })
        out["dunns"] = {
            "method": "dunns", "comparisons": comparisons,
            "family": comparison_family(
                m, method_id, dunn_scope(k, dunn_family, names, control)),
            "dunn_family": dunn_family, "correction": dunn_correction,
            "se": se, "mean_ranks": [float(v) for v in mean_ranks]}
    return out
