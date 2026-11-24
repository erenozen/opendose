"""Estimation statistics: effect sizes with bootstrap confidence
intervals, shaped for Gardner-Altman and Cumming estimation plots.

The GraphPad statistics guide page "Estimation Plots" describes the
display for unpaired and paired t tests: the data on the left axis and
the effect size (difference between means) with its 95% CI on the right
axis. This module computes those quantities with the bootstrap method
of DABEST (Ho, Tumkaya, Aryal, Choi & Claridge-Chang 2019,
"Moving beyond P values: data analysis with estimation graphics", Nat
Methods 16:565), after Gardner & Altman (1986, BMJ 292:746) and Cumming
(2012, Understanding the New Statistics):

- Designs: two groups (unpaired or paired); several test groups against
  one shared control; several independent control/test pairs ("multi
  two-group"); repeated measures against the first condition
  ("baseline") or each against the previous one ("sequential").
- Effect sizes, always test minus control: mean difference, median
  difference (unpaired: median(test) - median(control); paired: median
  of the paired differences), Cohen's d (pooled SD; paired: mean
  difference / sqrt((s_c^2 + s_t^2)/2), as DABEST), Hedges' g = J(n_c +
  n_t - 2) d with the exact gamma-function J (Hedges 1981), Cliff's delta
  (unpaired only); also Glass's delta, d with the average-variance
  standardizer and the paired d_z for opendose.effectsize.
- Confidence interval: bias-corrected and accelerated (BCa) bootstrap
  (Efron 1987, JASA 82:171; Efron & Tibshirani 1993 ch. 14; DiCiccio &
  Efron 1996). Groups are resampled independently with replacement
  (paired designs resample whole pairs); 5000 resamples by default.
  Bias correction z0 = Phi^-1(#{theta* < theta} / B + #{theta* = theta} /
  (2B)) (Efron & Tibshirani's mid-rank treatment of ties); acceleration
  a = sum(m - theta_(i))^3 / (6 [sum(m - theta_(i))^2]^1.5) from the
  jackknife, deleting one observation of either group at a time
  (unpaired, as DABEST) or one pair (paired); limits at the bootstrap
  quantiles Phi(z0 + (z0 + z_q) / (1 - a (z0 + z_q))), q = alpha/2 and
  1 - alpha/2, interpolated linearly between order statistics. The
  percentile interval is reported too. The bootstrap distribution is
  summarised by percentiles and a Gaussian kernel density (Silverman's
  rule-of-thumb bandwidth) for the half-violin of the plots.
- Permutation P value of the same effect size (two-sided, |effect| at
  least the observed): group labels reshuffled (unpaired) or members of
  each pair swapped (paired). All arrangements are enumerated when there
  are no more than n_permutations of them (exact P); otherwise
  n_permutations random ones, with P = (b + 1) / (m + 1) (Phipson &
  Smyth 2010, Stat Appl Genet Mol Biol 9:39). DABEST reports b / m with
  a strict inequality; the two differ by less than the Monte Carlo
  error.
- Combined effects of DABEST for unpaired mean differences
  (combined_effect): the mini-meta weighted delta of independent repeats
  of a two-group experiment, weighted by the inverse of each repeat's
  pooled group variance, and the delta-delta of a 2 x 2 design (the
  second comparison's difference minus the first's), each with a BCa
  bootstrap CI from the comparisons' own bootstrap differences; the
  weighted mean is meta.weighted_mean, the pooling step of the
  meta-analysis.
- Random numbers: numpy's PCG64 generator, seeded (default 12345);
  independent streams for every comparison and for the bootstrap and the
  permutations (numpy SeedSequence.spawn), so results are reproducible.
  Bootstrap limits agree with DABEST's within Monte Carlo error, not
  digit for digit, because the random streams differ.
"""

from __future__ import annotations

import math
from itertools import combinations, product

import numpy as np
from scipy import special, stats

from . import effectsize

EFFECTS = ("mean_diff", "median_diff", "cohens_d", "hedges_g",
           "cliffs_delta")
_ALL_EFFECTS = EFFECTS + ("cohens_d_av", "glass_delta", "cohens_dz")
LABELS = {
    "mean_diff": "Mean difference", "median_diff": "Median difference",
    "cohens_d": "Cohen's d", "hedges_g": "Hedges' g",
    "cliffs_delta": "Cliff's delta", "cohens_d_av": "Cohen's d (average SD)",
    "glass_delta": "Glass's delta", "cohens_dz": "Cohen's d_z",
}
PERCENTILES = (0.5, 2.5, 5, 10, 25, 50, 75, 90, 95, 97.5, 99.5)


# ------------------------------------------------------------ statistics

def _hedges_j(df):
    return effectsize.hedges_j(df)


def _stat(effect, C, T, paired):
    """Effect size (test - control) for each row of the 2-D arrays C and
    T (one resample per row)."""
    n0, n1 = C.shape[1], T.shape[1]
    with np.errstate(divide="ignore", invalid="ignore"):
        if effect == "mean_diff":
            return T.mean(1) - C.mean(1)
        if effect == "median_diff":
            if paired:
                return np.median(T - C, axis=1)
            return np.median(T, axis=1) - np.median(C, axis=1)
        if effect in ("cohens_d", "hedges_g", "cohens_d_av"):
            vc, vt = C.var(1, ddof=1), T.var(1, ddof=1)
            if paired or effect == "cohens_d_av":
                sd = np.sqrt((vc + vt) / 2.0)
            else:
                sd = np.sqrt(((n0 - 1) * vc + (n1 - 1) * vt) / (n0 + n1 - 2))
            d = (T.mean(1) - C.mean(1)) / sd
            if effect == "hedges_g":
                d = d * _hedges_j(n0 + n1 - 2)
            return d
        if effect == "glass_delta":
            return (T.mean(1) - C.mean(1)) / C.std(1, ddof=1)
        if effect == "cohens_dz":
            D = T - C
            return D.mean(1) / D.std(1, ddof=1)
        if effect == "cliffs_delta":
            if paired:
                raise ValueError("Cliff's delta is defined for unpaired "
                                 "groups only")
            ranks = stats.rankdata(np.hstack([C, T]), axis=1)
            u_t = ranks[:, n0:].sum(1) - n1 * (n1 + 1) / 2.0
            return 2.0 * u_t / (n0 * n1) - 1.0
    raise ValueError(f"unknown effect size: {effect}")


def effect_value(control, test, effect, paired=False) -> float:
    c, t = np.asarray(control, float), np.asarray(test, float)
    return float(_stat(effect, c[None, :], t[None, :], paired)[0])


# ------------------------------------------------------------- bootstrap

def _bootstrap_dist(c, t, effect, paired, n_boot, rng):
    n0, n1 = c.size, t.size
    out = np.empty(n_boot)
    chunk = max(1, min(n_boot, 2_000_000 // max(n0 + n1, 1)))
    for s in range(0, n_boot, chunk):
        m = min(chunk, n_boot - s)
        if paired:
            idx = rng.integers(0, n0, size=(m, n0))
            C, T = c[idx], t[idx]
        else:
            C = c[rng.integers(0, n0, size=(m, n0))]
            T = t[rng.integers(0, n1, size=(m, n1))]
        out[s:s + m] = _stat(effect, C, T, paired)
    return out


def _jackknife(c, t, effect, paired):
    vals = []
    if paired:
        for i in range(c.size):
            keep = np.arange(c.size) != i
            vals.append(_stat(effect, c[keep][None], t[keep][None], True)[0])
    else:
        for i in range(c.size):
            keep = np.arange(c.size) != i
            vals.append(_stat(effect, c[keep][None], t[None], False)[0])
        for j in range(t.size):
            keep = np.arange(t.size) != j
            vals.append(_stat(effect, c[None], t[keep][None], False)[0])
    return np.asarray(vals, float)


def bca_interval(boot, theta, jack, ci_level: float = 0.95) -> dict:
    """BCa limits from a bootstrap distribution, the original estimate
    and its jackknife values (Efron 1987)."""
    boot = np.asarray(boot, float)
    boot = boot[np.isfinite(boot)]
    jack = np.asarray(jack, float)
    jack = jack[np.isfinite(jack)]
    alpha = 1.0 - ci_level
    out = {"ci": None, "bias_correction": None, "acceleration": None,
           "note": None}
    if boot.size < 2 or not np.isfinite(theta):
        out["note"] = "bootstrap distribution undefined"
        return out
    if np.ptp(boot) == 0:
        out["ci"] = [float(boot[0]), float(boot[0])]
        out["note"] = "all bootstrap values identical"
        return out
    prop = (np.sum(boot < theta) + 0.5 * np.sum(boot == theta)) / boot.size
    if prop <= 0 or prop >= 1:
        out["note"] = ("estimate outside the bootstrap distribution; "
                       "percentile interval used")
        out["ci"] = [float(np.quantile(boot, alpha / 2)),
                     float(np.quantile(boot, 1 - alpha / 2))]
        return out
    z0 = float(stats.norm.ppf(prop))
    a = 0.0
    if jack.size >= 2:
        m = jack.mean()
        num = float(np.sum((m - jack) ** 3))
        den = 6.0 * float(np.sum((m - jack) ** 2)) ** 1.5
        a = num / den if den > 0 else 0.0
    qs = []
    for z in (stats.norm.ppf(alpha / 2), stats.norm.ppf(1 - alpha / 2)):
        w = z0 + z
        qs.append(float(stats.norm.cdf(z0 + w / (1 - a * w))))
    out.update({"ci": [float(np.quantile(boot, qs[0])),
                       float(np.quantile(boot, qs[1]))],
                "bias_correction": z0, "acceleration": a,
                "quantiles": qs})
    return out


def _kde(boot, n_grid: int = 128) -> dict | None:
    boot = boot[np.isfinite(boot)]
    if boot.size < 2 or np.ptp(boot) == 0:
        return None
    sd = boot.std(ddof=1)
    iqr = np.subtract(*np.percentile(boot, [75, 25]))
    spread = min(sd, iqr / 1.349) if iqr > 0 else sd
    h = 0.9 * spread * boot.size ** (-0.2)
    grid = np.linspace(boot.min() - 3 * h, boot.max() + 3 * h, n_grid)
    dens = np.zeros(n_grid)
    for s in range(0, boot.size, 2000):
        part = boot[s:s + 2000]
        dens += np.exp(-0.5 * ((grid[:, None] - part[None, :]) / h) ** 2).sum(1)
    dens /= boot.size * h * math.sqrt(2 * math.pi)
    return {"x": grid.tolist(), "density": dens.tolist(), "bandwidth": h}


def _summary_of(boot):
    fin = boot[np.isfinite(boot)]
    return {
        "n_resamples": int(boot.size), "n_undefined": int(boot.size - fin.size),
        "mean": float(fin.mean()) if fin.size else None,
        "sd": float(fin.std(ddof=1)) if fin.size > 1 else None,
        "percentiles": {str(p): float(np.percentile(fin, p))
                        for p in PERCENTILES} if fin.size else None,
        "kde": _kde(fin),
    }


# ----------------------------------------------------------- permutation

def permutation_test(control, test, effect="mean_diff", *, paired=False,
                     n_permutations: int = 5000, rng=None) -> dict:
    """Two-sided permutation P value of an effect size (see module
    docstring)."""
    c, t = np.asarray(control, float), np.asarray(test, float)
    rng = rng if rng is not None else np.random.default_rng(12345)
    obs = effect_value(c, t, effect, paired)
    if not np.isfinite(obs):
        return {"p": None, "n_permutations": 0, "exact": False}
    tol = 1e-9 * max(1.0, abs(obs))
    if paired:
        n = c.size
        exact = n <= 20 and 2 ** n <= n_permutations
        if exact:
            masks = np.array(list(product((False, True), repeat=n)))
        else:
            masks = rng.random((n_permutations, n)) < 0.5
        hits = 0
        for s in range(0, len(masks), 20000):
            mk = masks[s:s + 20000]
            C = np.where(mk, t, c)
            T = np.where(mk, c, t)
            vals = _stat(effect, C, T, True)
            hits += int(np.sum(np.abs(vals) >= abs(obs) - tol))
        m = len(masks)
    else:
        pooled = np.concatenate([c, t])
        n_all, n0 = pooled.size, c.size
        total = math.comb(n_all, n0)
        exact = total <= n_permutations
        hits = 0
        if exact:
            combos = np.array(list(combinations(range(n_all), n0)))
            mask = np.zeros((combos.shape[0], n_all), bool)
            mask[np.arange(combos.shape[0])[:, None], combos] = True
            C = np.broadcast_to(pooled, mask.shape)[mask].reshape(-1, n0)
            T = np.broadcast_to(pooled, mask.shape)[~mask].reshape(
                -1, n_all - n0)
            vals = _stat(effect, C, T, False)
            hits = int(np.sum(np.abs(vals) >= abs(obs) - tol))
            m = combos.shape[0]
        else:
            m = n_permutations
            chunk = max(1, min(m, 2_000_000 // n_all))
            for s in range(0, m, chunk):
                k = min(chunk, m - s)
                perm = np.argsort(rng.random((k, n_all)), axis=1)
                X = pooled[perm]
                vals = _stat(effect, X[:, :n0], X[:, n0:], False)
                hits += int(np.sum(np.abs(vals) >= abs(obs) - tol))
    p = hits / m if exact else (hits + 1) / (m + 1)
    return {"p": float(min(p, 1.0)), "n_permutations": int(m),
            "exact": bool(exact),
            "method": ("all arrangements enumerated" if exact else
                       "random arrangements, P = (b + 1)/(m + 1)")}


# ------------------------------------------------------------ comparisons

def _seed_streams(seed, k):
    ss = np.random.SeedSequence(seed)
    return ss.spawn(k)


def bootstrap_effect(control, test, effect: str = "mean_diff", *,
                     paired: bool = False, ci_level: float = 0.95,
                     n_boot: int = 5000, seed=12345, ci_type: str = "bca",
                     rng=None, keep_bootstraps: bool = False) -> dict:
    """Effect size test - control with its bootstrap CI (BCa or
    percentile) and the bootstrap distribution summary."""
    if effect not in _ALL_EFFECTS:
        raise ValueError(f"unknown effect size: {effect}")
    c, t = np.asarray(control, float), np.asarray(test, float)
    if paired and c.size != t.size:
        raise ValueError("paired groups need the same number of values")
    if c.size < 2 or t.size < 2:
        raise ValueError("each group needs at least 2 values")
    if rng is None:
        rng = np.random.default_rng(seed)
    theta = effect_value(c, t, effect, paired)
    boot = _bootstrap_dist(c, t, effect, paired, int(n_boot), rng)
    jack = _jackknife(c, t, effect, paired)
    bca = bca_interval(boot, theta, jack, ci_level)
    fin = boot[np.isfinite(boot)]
    alpha = 1 - ci_level
    pct = ([float(np.quantile(fin, alpha / 2)),
            float(np.quantile(fin, 1 - alpha / 2))] if fin.size else None)
    out = {
        "effect": effect, "label": LABELS[effect], "paired": bool(paired),
        "difference": theta,
        "ci": bca["ci"] if ci_type == "bca" else pct,
        "ci_type": ci_type, "ci_level": ci_level,
        "bca_ci": bca["ci"], "percentile_ci": pct,
        "bias_correction": bca["bias_correction"],
        "acceleration": bca["acceleration"], "note": bca["note"],
        "bootstrap": _summary_of(boot),
    }
    if keep_bootstraps:
        out["bootstraps"] = boot.tolist()
    return out


def _group_summary(name, x):
    x = np.asarray(x, float)
    q1, med, q3 = (np.percentile(x, [25, 50, 75]) if x.size else
                   (None, None, None))
    return {"name": name, "n": int(x.size),
            "mean": float(x.mean()) if x.size else None,
            "sd": float(x.std(ddof=1)) if x.size > 1 else None,
            "median": None if med is None else float(med),
            "q1": None if q1 is None else float(q1),
            "q3": None if q3 is None else float(q3),
            "values": x.tolist()}


def _clean_pair(c, t, paired):
    if paired:
        keep = [(a, b) for a, b in zip(c, t) if a is not None and b is not None
                and a == a and b == b]
        return (np.array([k[0] for k in keep], float),
                np.array([k[1] for k in keep], float))
    return (np.array([v for v in c if v is not None and v == v], float),
            np.array([v for v in t if v is not None and v == v], float))


def compare(control, test, *, names=("Control", "Test"), paired=False,
            effects=("mean_diff",), ci_level=0.95, n_boot=5000,
            n_permutations=5000, seed=12345, ci_type="bca",
            permutation=True, streams=None,
            keep_bootstraps: bool = False) -> dict:
    """One control/test comparison with every requested effect size
    (keep_bootstraps: each effect keeps its bootstrap values, for the
    mini-meta and delta-delta)."""
    c, t = _clean_pair(control, test, paired)
    if isinstance(effects, str):
        effects = (effects,)
    streams = streams or _seed_streams(seed, 1)[0].spawn(2 * len(effects))
    out_effects = []
    for k, eff in enumerate(effects):
        if eff == "cliffs_delta" and paired:
            continue
        res = bootstrap_effect(c, t, eff, paired=paired, ci_level=ci_level,
                               n_boot=n_boot, ci_type=ci_type,
                               rng=np.random.default_rng(streams[2 * k]),
                               keep_bootstraps=keep_bootstraps)
        if permutation:
            res["permutation"] = permutation_test(
                c, t, eff, paired=paired, n_permutations=n_permutations,
                rng=np.random.default_rng(streams[2 * k + 1]))
        res.update({"control": names[0], "test": names[1]})
        out_effects.append(res)
    return {"control": names[0], "test": names[1], "paired": bool(paired),
            "n_control": int(c.size), "n_test": int(t.size),
            "effects": out_effects}


DESIGNS = ("two_group", "shared_control", "multi_two_group",
           "repeated_baseline", "repeated_sequential")


def estimation(groups, names=None, *, design: str | None = None,
               paired: bool = False, control_index: int = 0, pairs=None,
               effects=("mean_diff",), ci_level: float = 0.95,
               n_boot: int = 5000, n_permutations: int = 5000,
               seed=12345, ci_type: str = "bca",
               permutation: bool = True, combine: str | None = None) -> dict:
    """Estimation analysis of several groups.

    groups: list of value lists (paired designs: aligned by position,
    pairs with a missing value dropped per comparison). design:
    "two_group" (default for 2 groups: control = groups[control_index]),
    "shared_control" (each other group vs groups[control_index]; default
    for more groups), "multi_two_group" (pairs = [[control, test], ...]
    indices; default consecutive pairs), "repeated_baseline" (paired,
    each vs the first), "repeated_sequential" (paired, each vs the
    previous). Result: groups (summaries with raw values), comparisons
    (each with its effects: difference, BCa and percentile CIs,
    bootstrap percentiles and density, permutation P) and plot (the
    Gardner-Altman or Cumming layout). combine: "mini_meta" (the
    weighted delta of independent repeats) or "delta_delta" (2 x 2
    designs), see combined_effect; added as result["combined"]."""
    k = len(groups)
    names = list(names or [f"Group {i + 1}" for i in range(k)])
    if k < 2:
        raise ValueError("estimation needs at least 2 groups")
    if design is None:
        design = "two_group" if k == 2 else "shared_control"
    if design not in DESIGNS:
        raise ValueError(f"unknown design: {design}")
    if design == "two_group":
        other = 1 - control_index if k == 2 else (control_index + 1) % k
        comp = [(control_index, other)]
    elif design == "shared_control":
        comp = [(control_index, i) for i in range(k) if i != control_index]
    elif design == "multi_two_group":
        comp = ([tuple(p) for p in pairs] if pairs else
                [(i, i + 1) for i in range(0, k - 1, 2)])
    elif design == "repeated_baseline":
        paired = True
        comp = [(0, i) for i in range(1, k)]
    else:
        paired = True
        comp = [(i - 1, i) for i in range(1, k)]
    if isinstance(effects, str):
        effects = (effects,)
    if combine not in (None, "none", "mini_meta", "delta_delta"):
        raise ValueError(f"unknown combined effect: {combine}")
    combine = None if combine == "none" else combine
    if combine:
        _check_combinable(combine, comp, effects, paired)
    # one stream per comparison; the combined effect takes the next one,
    # so the comparisons' streams (and results) do not change with it
    streams = _seed_streams(seed, len(comp) + (1 if combine else 0))
    comparisons = []
    for (ci_, ti), ss in zip(comp, streams):
        comparisons.append(compare(
            groups[ci_], groups[ti], names=(names[ci_], names[ti]),
            paired=paired, effects=effects, ci_level=ci_level, n_boot=n_boot,
            n_permutations=n_permutations, ci_type=ci_type,
            permutation=permutation, streams=ss.spawn(2 * len(effects)),
            keep_bootstraps=bool(combine)))
    combined = None
    if combine:
        data = [_clean_pair(groups[a], groups[b], False) for a, b in comp]
        boots = [np.asarray(c["effects"][0].pop("bootstraps"), float)
                 for c in comparisons]
        for c in comparisons:
            for e in c["effects"]:
                e.pop("bootstraps", None)
        combined = combined_effect(
            combine, data, boots, [(names[a], names[b]) for a, b in comp],
            ci_level=ci_level, ci_type=ci_type,
            n_permutations=n_permutations if permutation else 0,
            rng=np.random.default_rng(streams[-1]))
    summaries = [_group_summary(n, [v for v in g if v is not None and v == v])
                 for n, g in zip(names, groups)]
    plot_kind = ("gardner_altman" if len(comparisons) == 1 else "cumming")
    plot = {"kind": plot_kind,
            "order": [names[i] for i in dict.fromkeys(
                [x for pair in comp for x in pair])],
            "pairs": [[names[a], names[b]] for a, b in comp],
            "paired_lines": bool(paired)}
    if plot_kind == "gardner_altman":
        plot["reference_mean"] = summaries[comp[0][0]]["mean"]
        plot["reference_median"] = summaries[comp[0][0]]["median"]
    return {"design": design, "paired": bool(paired), "groups": summaries,
            "comparisons": comparisons, "effects": list(effects),
            "ci_level": ci_level, "ci_type": ci_type,
            "n_resamples": int(n_boot), "n_permutations": int(n_permutations),
            "seed": seed, "plot": plot,
            **({"combined": combined} if combined else {})}


# ------------------------------------------------- mini-meta, delta-delta

def _check_combinable(combine, comp, effects, paired):
    if effects[0] != "mean_diff":
        raise ValueError("the mini-meta and delta-delta are defined for the "
                         "mean difference; choose Mean difference as the "
                         "effect size")
    if paired:
        raise ValueError("the mini-meta and delta-delta here are for "
                         "independent (unpaired) groups")
    if combine == "mini_meta" and len(comp) < 2:
        raise ValueError("the mini-meta needs at least 2 independent "
                         "control/test experiments")
    if combine == "delta_delta" and len(comp) != 2:
        raise ValueError(
            f"the delta-delta needs exactly 2 control/test comparisons (a "
            f"2 x 2 design); this design has {len(comp)}")
    used = [i for pair in comp for i in pair]
    if len(set(used)) != len(used):
        raise ValueError("the mini-meta and delta-delta need comparisons "
                         "that share no group")


def _pooled_var(c, t):
    """Pooled variance of a control/test pair (DABEST's group variance)."""
    n0, n1 = c.size, t.size
    return ((n0 - 1) * c.var(ddof=1) + (n1 - 1) * t.var(ddof=1)) / (n0 + n1 - 2)


def _jackknife_diffs(data, diffs, combine_fn):
    """Delete-one jackknife over every observation of every comparison:
    only that comparison's difference changes."""
    jack = []
    for i, (c, t) in enumerate(data):
        for j in range(c.size):
            dj = diffs.copy()
            dj[i] = t.mean() - np.delete(c, j).mean()
            jack.append(combine_fn(dj))
        for j in range(t.size):
            dj = diffs.copy()
            dj[i] = np.delete(t, j).mean() - c.mean()
            jack.append(combine_fn(dj))
    return np.asarray(jack, float)


def combined_effect(kind, data, boots, names, *, ci_level=0.95,
                    ci_type="bca", n_permutations=5000, rng=None) -> dict:
    """The DABEST mini-meta weighted delta or delta-delta of unpaired
    control/test comparisons (Ho et al. 2019; DABEST-python 2025.03.27).

    data: [(control, test)] value arrays; boots: each comparison's
    bootstrap distribution of its mean difference (independent
    resamples); names: [(control, test)].

    - mini_meta: weighted delta = sum(w_i d_i) / sum(w_i) with w_i = 1 /
      s_i^2, s_i^2 the pooled variance of comparison i's two groups (the
      weights DABEST uses; meta.weighted_mean does the pooling). Its
      bootstrap distribution applies the same weights to the comparisons'
      bootstrap differences. Permutation P: the groups of every
      comparison are reshuffled together and the weighted delta
      recomputed with the reshuffled pooled variances (as DABEST),
      P = (b + 1) / (m + 1).
    - delta_delta: d_2 - d_1 (the second comparison's difference minus
      the first's); bootstrap d*_2 - d*_1. No permutation P: shuffling
      within each pair tests that both differences are 0, not that they
      are equal.

    CI: BCa (bias correction from the bootstrap; acceleration from the
    delete-one jackknife over every observation, weights held fixed as in
    the bootstrap) or percentile. DABEST takes its acceleration from a
    jackknife of the bootstrap values themselves, which is close to 0;
    the limits agree within Monte Carlo error."""
    from . import meta
    diffs = np.array([t.mean() - c.mean() for c, t in data])
    B = np.vstack(boots)
    out = {"kind": kind, "comparisons": [
        {"control": a, "test": b, "difference": float(d)}
        for (a, b), d in zip(names, diffs)]}
    if kind == "mini_meta":
        gv = np.array([_pooled_var(c, t) for c, t in data])
        if np.any(gv <= 0):
            raise ValueError("a comparison has no spread (all its values are "
                             "equal), so it cannot be weighted in the "
                             "mini-meta")
        w = 1.0 / gv
        theta = float(meta.weighted_mean(diffs, w))
        boot = meta.weighted_mean(B, w)
        jack = _jackknife_diffs(data, diffs,
                                lambda d: float(meta.weighted_mean(d, w)))
        out.update({"label": "Weighted mean difference",
                    "pooled_variances": gv.tolist(),
                    "weights": (100 * w / w.sum()).tolist()})
    elif kind == "delta_delta":
        theta = float(diffs[1] - diffs[0])
        boot = B[1] - B[0]
        jack = _jackknife_diffs(data, diffs, lambda d: float(d[1] - d[0]))
        out["label"] = "Delta-delta"
    else:
        raise ValueError(f"unknown combined effect: {kind}")
    bca = bca_interval(boot, theta, jack, ci_level)
    fin = boot[np.isfinite(boot)]
    alpha = 1 - ci_level
    pct = [float(np.quantile(fin, alpha / 2)),
           float(np.quantile(fin, 1 - alpha / 2))]
    out.update({
        "difference": theta, "ci": bca["ci"] if ci_type == "bca" else pct,
        "ci_type": ci_type, "ci_level": ci_level, "bca_ci": bca["ci"],
        "percentile_ci": pct, "bias_correction": bca["bias_correction"],
        "acceleration": bca["acceleration"], "note": bca["note"],
        "bootstrap": _summary_of(boot)})
    if kind == "mini_meta" and n_permutations:
        out["permutation"] = _mini_meta_permutation(
            data, theta, n_permutations, rng or np.random.default_rng(12345))
    return out


def _mini_meta_permutation(data, theta, m, rng):
    num = np.zeros(m)
    den = np.zeros(m)
    for c, t in data:
        pooled = np.concatenate([c, t])
        n0, n_all = c.size, pooled.size
        X = pooled[np.argsort(rng.random((m, n_all)), axis=1)]
        C, T = X[:, :n0], X[:, n0:]
        gv = (((n0 - 1) * C.var(1, ddof=1)
               + (n_all - n0 - 1) * T.var(1, ddof=1)) / (n_all - 2))
        with np.errstate(divide="ignore", invalid="ignore"):
            w = 1.0 / gv
        num += w * (T.mean(1) - C.mean(1))
        den += w
    with np.errstate(divide="ignore", invalid="ignore"):
        vals = num / den
    vals = vals[np.isfinite(vals)]
    tol = 1e-9 * max(1.0, abs(theta))
    hits = int(np.sum(np.abs(vals) >= abs(theta) - tol))
    return {"p": float(min((hits + 1) / (vals.size + 1), 1.0)),
            "n_permutations": int(vals.size), "exact": False,
            "method": "random arrangements, P = (b + 1)/(m + 1)"}
