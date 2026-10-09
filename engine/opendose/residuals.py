"""Residual diagnostics for column analyses (t tests and one-way ANOVA).

What it computes
----------------
column_residuals() returns, for every value in a column table, the fitted
value, the residual, a standardized residual and the theoretical normal
quantile used for a normal QQ (probability) plot of the residuals, plus a
Shapiro-Wilk test on the pooled residuals and an n-dependent paragraph of
advice on how much weight a normality test deserves. The web draws the
residual QQ plot and the residual-vs-fitted plot from these points.

- Unpaired (one-way ANOVA / unpaired t test model): the fitted value of
  each value is its group mean, residual = value - group mean, and the
  standardized residual = residual / s, where s = sqrt(SS_within / (N - k))
  is the pooled residual SD of one-way ANOVA (the square root of the
  residual mean square; GraphPad statistics guide, "How one-way ANOVA
  works"; Motulsky, Intuitive Biostatistics, ch. 39). These are the
  residuals R gives for residuals(aov(y ~ group)). The standardized
  residual is scaled by the pooled SD only; it is not the internally
  studentized residual (which would also divide by sqrt(1 - 1/n_i)).
- Paired (paired t test model): the analysis is a one-sample model on the
  row-wise differences d = first - second (A - B), the sign convention of
  opendose.ttests.paired_t. The fitted value is the mean difference,
  residual = d - mean(d), standardized by the SD of the differences
  (ddof = 1). Rows with a missing value in either column are left out and
  their row indices reported. Changing the sign of every difference only
  mirrors the QQ plot; Shapiro-Wilk W and P are unchanged.

Theoretical quantiles
---------------------
theoretical = Phi^-1(m_i), where m_i is Filliben's estimate of the median
of the i-th uniform order statistic among all N pooled residuals:
m_N = 0.5^(1/N), m_1 = 1 - m_N, m_i = (i - 0.3175) / (N + 0.365) otherwise
(Filliben JJ, 1975, "The probability plot correlation coefficient test
for normality", Technometrics 17:111-117). This is exactly what
scipy.stats.probplot uses (scipy.stats._morestats.
_calc_uniform_order_statistic_medians), so the web's QQ plot matches
scipy's. Rank i is the rank of the residual among all pooled residuals
(all groups together). Tied residuals get distinct consecutive ranks in a
stable order: by group (in the order given), then by row index within the
group (numpy's stable argsort), so the plotted positions never collapse.

Shapiro-Wilk
------------
On the pooled residuals with scipy.stats.shapiro (Shapiro SS & Wilk MB,
1965, Biometrika 52:591-611; Royston P, 1995, "Remark AS R94: A remark on
algorithm AS 181: the W-test for normality", Applied Statistics
44:547-551), as R's shapiro.test(residuals(aov(...))). Needs N >= 3
residuals that are not all equal; otherwise None with a note.

Groups with a single value
--------------------------
A group with one value has fitted value = that value, so its residual is
0 by construction and carries no information about the error
distribution (its leverage is 1). Such points are reported with residual
0, standardized None and theoretical None, and are left out of the QQ
plot ranks and the Shapiro-Wilk test, with a warning. They still count in
N and k for the df (they add one observation and one parameter each, so
N - k is unchanged). Nothing is silently dropped: every missing,
non-finite or withheld value is listed in `dropped` / `warnings`.

Advice (n-dependent; data for the web)
--------------------------------------
Sources: GraphPad statistics guide, "Interpreting results: Normality
tests" (with small samples normality tests have little power to detect
non-Gaussian distributions; with large samples minor deviations give
small P values, and t tests and ANOVA are robust to them); Motulsky H,
Intuitive Biostatistics (4th ed., 2018), ch. 24 "Normality tests"; and
Gierlinski M, Data Analysis Group statistics lectures, University of
Dundee, lecture 9 "ANOVA" ("do not perform normality test before ANOVA
... underpowered for small samples (many false negatives) ...
oversensitive for large samples (many false positives)";
https://dag.compbio.dundee.ac.uk/workshops/statistics_lectures/09_ANOVA.pdf).
The numeric bands are OpenDose's choice (the sources give the direction,
not cut-offs), counted on the residuals that enter the test:
N < 3: no test possible; 3 <= N < 20: small (little power);
20 <= N < 100: intermediate (plot first, test second); N >= 100: large
(trivial deviations flagged; central limit theorem protects the mean).
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats

SMALL_N = 20     # below this the normality test has little power
LARGE_N = 100    # at or above this it flags trivial deviations
SHAPIRO_MAX_N = 5000   # scipy warns the P value may be inaccurate above this

THEORETICAL_METHOD = (
    "Standard normal quantile of Filliben's (1975) estimate of the uniform "
    "order-statistic median for each residual's rank among all pooled "
    "residuals: m_N = 0.5^(1/N), m_1 = 1 - m_N, m_i = (i - 0.3175)/(N + "
    "0.365); identical to scipy.stats.probplot. Ties get distinct ranks in "
    "a stable order (group order, then row order). Filliben JJ (1975) "
    "Technometrics 17:111-117.")

ADVICE_SOURCE = (
    "GraphPad statistics guide, 'Interpreting results: Normality tests'; "
    "Motulsky H, Intuitive Biostatistics, ch. 24 'Normality tests'; "
    "Gierlinski M, University of Dundee Data Analysis Group statistics "
    "lecture 9 'ANOVA' (dag.compbio.dundee.ac.uk). Thresholds (20 and "
    "100 residuals) are OpenDose's choice.")


def _filliben_medians(n: int) -> np.ndarray:
    """scipy.stats._morestats._calc_uniform_order_statistic_medians."""
    v = np.empty(n, dtype=np.float64)
    v[-1] = 0.5 ** (1.0 / n)
    v[0] = 1 - v[-1]
    i = np.arange(2, n)
    v[1:-1] = (i - 0.3175) / (n + 0.365)
    return v


def _number(v):
    """float(v) for a usable value, None for missing, "invalid" otherwise."""
    if v is None:
        return None
    try:
        x = float(v)
    except (TypeError, ValueError):
        return "invalid"
    if math.isnan(x):
        return None
    if not math.isfinite(x):
        return "invalid"
    return x


def _advice(n: int) -> dict:
    if n < 3:
        text = (f"Only {n} residual{'s' if n != 1 else ''} can be assessed, "
                "too few for any normality test or a meaningful QQ plot. "
                "Base the choice of test on what you know about the "
                "measurement (for example, concentrations and ratios are "
                "usually log-normal), not on these data.")
    elif n < SMALL_N:
        text = (f"With {n} residuals a normality test has little power: a "
                "non-significant result does not show that the data are "
                "Gaussian, and a significant one may come from a single "
                "unusual value. Look at the QQ plot and think about the "
                "measurement itself (are values bounded, skewed, ratios or "
                "concentrations that belong on a log scale?). Do not switch "
                "test because of the normality P value alone.")
    elif n < LARGE_N:
        text = (f"With {n} residuals, look at the QQ plot first: points "
                "close to the line support the Gaussian assumption, and a "
                "systematic curve (skew) or a few points far from the line "
                "(outliers) matter more than the Shapiro-Wilk P value. Treat "
                "the test as a supporting summary, not as a gate between "
                "parametric and nonparametric tests.")
    else:
        text = (f"With {n} residuals a normality test can flag deviations "
                "too small to matter: t tests and ANOVA are robust to mild "
                "non-normality with samples this large (central limit "
                "theorem), so a small P value alone is not a reason to "
                "switch test. Use the QQ plot to judge whether the "
                "deviation (strong skew, heavy tails, outliers) is large "
                "enough to matter.")
    return {"n_total": int(n), "text": text, "source": ADVICE_SOURCE}


def column_residuals(groups, names=None, *, paired: bool = False) -> dict:
    """Residuals, standardized residuals and normal QQ positions.

    groups: list of value lists (None or NaN = missing). names: optional
    group names (default "Group 0", "Group 1", ...). paired=True needs
    exactly two row-aligned lists and analyses their differences
    (first minus second). Raises ValueError only when no usable value (or,
    when paired, no complete pair) remains.
    """
    groups = [list(g) if g is not None else [] for g in groups]
    k_given = len(groups)
    if k_given == 0:
        raise ValueError("no groups given")
    names = list(names) if names else []
    names = [str(names[i]) if i < len(names) and names[i] is not None
             else f"Group {i}" for i in range(k_given)]
    warnings: list[str] = []
    dropped: list[dict] = []

    if paired:
        if k_given != 2:
            raise ValueError("paired residuals need exactly two columns")
        a, b = groups
        n_rows = max(len(a), len(b))
        rows, diffs = [], []
        for i in range(n_rows):
            va = _number(a[i]) if i < len(a) else None
            vb = _number(b[i]) if i < len(b) else None
            if isinstance(va, float) and isinstance(vb, float):
                rows.append(i)
                diffs.append(va - vb)
                continue
            missing_in = [names[j] for j, v in enumerate((va, vb))
                          if not isinstance(v, float)]
            reason = ("not a finite number" if "invalid" in (va, vb)
                      else "missing value")
            dropped.append({"group": "difference", "index": i,
                            "missing_in": missing_in, "reason": reason})
        if dropped:
            idx = ", ".join(str(d["index"]) for d in dropped)
            warnings.append(
                f"{len(dropped)} incomplete pair{'s' if len(dropped) != 1 else ''} "
                f"(row{'s' if len(dropped) != 1 else ''} {idx}, counting from 0) "
                "left out: a value is missing in one or both columns.")
        if not rows:
            raise ValueError("no complete pairs: every row has a missing value")
        series = [("difference", 0, rows, np.array(diffs, dtype=float))]
        k_eff = 1
    else:
        series = []
        for gi, g in enumerate(groups):
            idx, vals = [], []
            for i, v in enumerate(g):
                x = _number(v)
                if isinstance(x, float):
                    idx.append(i)
                    vals.append(x)
                else:
                    reason = ("not a finite number" if x == "invalid"
                              else "missing value")
                    dropped.append({"group": names[gi], "index": i,
                                    "reason": reason})
            if not vals:
                if g:
                    warnings.append(f"{names[gi]}: no usable values; the "
                                    "group is left out.")
                else:
                    warnings.append(f"{names[gi]}: empty; the group is left out.")
                continue
            series.append((names[gi], gi, idx, np.array(vals, dtype=float)))
        if dropped:
            for gname in dict.fromkeys(d["group"] for d in dropped):
                rows_g = [str(d["index"]) for d in dropped if d["group"] == gname]
                warnings.append(
                    f"{gname}: {len(rows_g)} missing or non-numeric value"
                    f"{'s' if len(rows_g) != 1 else ''} left out "
                    f"(row{'s' if len(rows_g) != 1 else ''} "
                    f"{', '.join(rows_g)}, counting from 0).")
        if not series:
            raise ValueError("no usable values in any group")
        k_eff = len(series)

    # Fitted values and residuals per group.
    points = []
    group_info = []
    n_total = 0
    ss = 0.0
    for gname, gi, idx, vals in series:
        n_g = vals.size
        fitted = float(vals.mean())
        res = vals - fitted
        n_total += n_g
        ss += float(np.sum(res ** 2))
        single = n_g < 2
        group_info.append({"group": gname, "group_index": gi, "n": int(n_g),
                           "fitted": fitted, "in_qq": not single})
        if single:
            label = "pair" if paired else "value"
            warnings.append(
                f"{gname}: only one {label}, so its residual is 0 by "
                "construction (the fitted value is the value itself); it is "
                "shown but left out of the QQ plot, the standardized "
                "residuals and the Shapiro-Wilk test.")
        for i, v, r in zip(idx, vals, res):
            points.append({"group": gname, "group_index": gi, "index": int(i),
                           "value": float(v), "fitted": fitted,
                           "residual": 0.0 if single else float(r),
                           "standardized": None, "theoretical": None,
                           "_in_qq": not single})

    df = n_total - k_eff
    pooled_sd = math.sqrt(ss / df) if df > 0 else None
    if pooled_sd is None:
        warnings.append("No residual degrees of freedom (every group has a "
                        "single value): the residual SD and the standardized "
                        "residuals are undefined.")
    elif pooled_sd == 0:
        warnings.append("Every residual is 0 (no variation within groups): "
                        "the standardized residuals are undefined.")
    usable_sd = pooled_sd is not None and pooled_sd > 0

    qq = [p for p in points if p["_in_qq"]]
    n_qq = len(qq)
    if qq:
        r = np.array([p["residual"] for p in qq], dtype=float)
        order = np.argsort(r, kind="stable")
        theo = stats.norm.ppf(_filliben_medians(n_qq))
        for rank, j in enumerate(order):
            qq[j]["theoretical"] = float(theo[rank])
        if usable_sd:
            for p in qq:
                p["standardized"] = p["residual"] / pooled_sd
    for p in points:
        del p["_in_qq"]

    shapiro = None
    shapiro_note = None
    if n_qq < 3:
        shapiro_note = (f"Shapiro-Wilk needs at least 3 residuals; "
                        f"{n_qq} available.")
    else:
        r = np.array([p["residual"] for p in qq], dtype=float)
        if float(np.ptp(r)) <= 1e-12 * max(1.0, float(np.max(np.abs(r)))):
            shapiro_note = ("All residuals are equal; Shapiro-Wilk is "
                            "undefined.")
        else:
            w, pv = stats.shapiro(r)
            shapiro = {"W": float(w), "p": float(pv), "n": int(n_qq)}
            if n_qq > SHAPIRO_MAX_N:
                shapiro_note = (f"With N > {SHAPIRO_MAX_N} the Shapiro-Wilk "
                                "P value may not be accurate (Royston's "
                                "approximation is validated up to 5000).")
    if shapiro_note:
        warnings.append(shapiro_note)

    if paired:
        note = (f"Residuals of the paired model: each difference "
                f"({names[0]} minus {names[1]}) minus the mean difference; "
                "standardized by the SD of the differences. Shapiro-Wilk "
                "tests the differences, which is what the paired t test "
                "assumes are Gaussian.")
    else:
        note = ("Residuals of the one-way model: each value minus its group "
                "mean; standardized by the pooled residual SD "
                "sqrt(SS_within/(N - k)), the residual SD of one-way ANOVA. "
                "Shapiro-Wilk tests all residuals pooled, which is what "
                "ANOVA and the t test assume are Gaussian (with equal SDs).")

    return {
        "points": points,
        "groups": group_info,
        "theoretical_method": THEORETICAL_METHOD,
        "shapiro": shapiro,
        "shapiro_note": shapiro_note,
        "pooled_sd": pooled_sd,
        "df": int(df),
        "n_total": int(n_total),
        "n_qq": int(n_qq),
        "paired": bool(paired),
        "difference_direction": (f"{names[0]} minus {names[1]}"
                                 if paired else None),
        "dropped": dropped,
        "warnings": warnings,
        "note": note,
        "advice": _advice(n_qq),
    }
