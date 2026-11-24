"""Reference values for P-90 (competing risks: cumulative incidence and
Gray's test): engine/tests/test_competing_risks.py, the e2e step and the
ui-stage fixture.

R is not installed (cmprsk not available). Three oracles:

1. An independent Aalen-Johansen estimator written here: the
   product-integral of the transition matrices of the competing-risks
   multi-state model (one event-free state, one absorbing state per kind
   of event), P(t) = prod (I + dA(t_j)) with dA[0, k] = d_k / n and
   dA[0, 0] = -d / n (Aalen & Johansen 1978; Andersen, Borgan, Gill &
   Keiding 1993, section IV.4). The cumulative incidence of kind k is
   P[0, k]. The engine instead sums S(t-) d_k / n (cmprsk's cinc form).

2. Published cmprsk output. The tidycmprsk reference page for cuminc()
   (Sjoberg & Fei, tidycmprsk, https://mskcc-epi-bio.github.io/tidycmprsk/
   reference/cuminc.html, fetched 2026-11-24; tidycmprsk wraps
   cmprsk::cuminc) prints, for the package's `trial` data (200 patients,
   Drug A / Drug B, death from cancer / death other causes / censor),
   estimates, standard errors and 95% CIs at months 5, 10, 15, 20, and
   Gray's test: death from cancer statistic 1.99, df 1, p 0.16; death
   other causes 0.089, df 1, p 0.77. Data: engine/tests/fixtures/
   tidycmprsk_trial.csv (columns trt, ttdeath, death, death_cr, read from
   the package's data/trial.rda with pyreadr).

3. Published survival::survfit output (Therneau, Crowson & Atkinson,
   "Multi-state models and competing risks", survival package vignette
   compete.pdf, section 2, CRAN, fetched 2026-11-24): print(mfit2,
   rmean=240, scale=12) for the mgus2 data with etime / event (pcm,
   death) by sex gives the restricted mean time in each state up to 240
   months, in years: pcm F 1.323284, M 1.064693; death F 8.823108, M
   10.260294; event-free F 9.853608, M 8.675012. rmean in state k is
   the integral of its cumulative incidence from 0 to 240 months, so it
   checks every step of the curve. Data: engine/tests/fixtures/
   mgus2_competing.csv (Rdatasets copy of survival::mgus2; etime and
   event built exactly as the vignette's code).

Gray's test has no Python implementation to compare with; its pinned
values are the published ones above (statistic and P at the printed
precision). The score vector (sum over event times of d_1k - R_k d_1 /
R, with R_k = n_k (1 - F_1k(t-)) / S_k(t-)) is recomputed here
independently.

Run from the repository root:
  /home/eren/opendose/.venv/bin/python engine/tests/reference/competing_risks.py
"""
import csv
import json
import os

import numpy as np

HERE = os.path.dirname(__file__)
FIX = os.path.join(HERE, "..", "fixtures")

TRIAL_CODES = {"censor": 0, "death from cancer": 1, "death other causes": 2}


def aalen_johansen(times, codes, causes):
    """Product-integral of the transition matrices; returns the distinct
    event times and P[0, :] after each (state 0 = event-free)."""
    times = np.asarray(times, float)
    codes = np.asarray(codes, int)
    k = len(causes)
    p = np.zeros(k + 1)
    p[0] = 1.0
    out_t, out_p = [0.0], [p.copy()]
    for t in np.unique(times):
        at_risk = np.sum(times >= t)
        d = np.array([np.sum((times == t) & (codes == c)) for c in causes])
        if d.sum() == 0:
            continue
        da = np.zeros((k + 1, k + 1))
        da[0, 1:] = d / at_risk
        da[0, 0] = -d.sum() / at_risk
        p = p @ (np.eye(k + 1) + da)
        out_t.append(float(t))
        out_p.append(p.copy())
    return np.array(out_t), np.array(out_p)


def step_value(ts, ps, t):
    i = np.searchsorted(ts, t, side="right") - 1
    return ps[i]


def rmean(ts, ps, tau):
    """Integral of each state's step curve from 0 to tau."""
    edges = list(ts[ts < tau]) + [tau]
    total = np.zeros(ps.shape[1])
    for a, b, row in zip(edges[:-1], edges[1:], ps):
        total += row * (b - a)
    return total


def gray_score(groups, cause):
    """Gray's score for the first K - 1 groups (rho = 0)."""
    allt = sorted({t for ts, cs in groups for t, c in zip(ts, cs) if c != 0})
    k = len(groups)
    f1m = np.zeros(k)
    skmm = np.ones(k)
    s = np.zeros(k)
    for t in allt:
        n = np.array([sum(1 for x in ts if x >= t) for ts, _ in groups], float)
        d1 = np.array([sum(1 for x, c in zip(ts, cs) if x == t and c == cause)
                       for ts, cs in groups], float)
        d2 = np.array([sum(1 for x, c in zip(ts, cs) if x == t and c not in (0, cause))
                       for ts, cs in groups], float)
        live = n > 0
        r = np.where(live, n * (1 - f1m) / np.where(live, skmm, 1), 0.0)
        s += d1 - r * d1.sum() / r.sum()
        with np.errstate(divide="ignore", invalid="ignore"):
            f1m = f1m + np.where(live, skmm * d1 / np.where(live, n, 1), 0)
            skmm = skmm * np.where(live, (n - d1 - d2) / np.where(live, n, 1), 1)
    return s[:-1].tolist()


def load_trial():
    groups = {}
    with open(os.path.join(FIX, "tidycmprsk_trial.csv")) as f:
        for row in csv.DictReader(f):
            g = groups.setdefault(row["trt"], ([], []))
            g[0].append(float(row["ttdeath"]))
            g[1].append(TRIAL_CODES[row["death_cr"]])
    names = sorted(groups)
    return names, [groups[n] for n in names]


def load_mgus2():
    groups = {}
    with open(os.path.join(FIX, "mgus2_competing.csv")) as f:
        for row in csv.DictReader(f):
            g = groups.setdefault(row["sex"], ([], []))
            g[0].append(float(row["etime"]))
            g[1].append(int(row["event"]))
    return ["F", "M"], [groups["F"], groups["M"]]


def main():
    out = {}
    names, groups = load_trial()
    trial = {}
    for name, (ts, cs) in zip(names, groups):
        t_, p_ = aalen_johansen(ts, cs, [1, 2])
        trial[name] = {str(c): [float(step_value(t_, p_, t)[c]) for t in (5, 10, 15, 20)]
                       for c in (1, 2)}
    out["trial"] = {"times": [5, 10, 15, 20], "cif": trial,
                    "gray_score": {str(c): gray_score(groups, c) for c in (1, 2)},
                    "published": {
                        "gray": {"1": {"stat": 1.99, "p": 0.16},
                                 "2": {"stat": 0.089, "p": 0.77}},
                        "est": {"Drug A": {"1": [0.000, 0.020, 0.071, 0.173],
                                           "2": [0.010, 0.020, 0.082, 0.204]},
                                "Drug B": {"1": [0.000, 0.039, 0.167, 0.255],
                                           "2": [0.000, 0.029, 0.098, 0.206]}},
                        "se": {"Drug A": {"1": [0.000, 0.014, 0.026, 0.039],
                                          "2": [0.010, 0.014, 0.028, 0.041]},
                               "Drug B": {"1": [0.000, 0.019, 0.037, 0.043],
                                          "2": [0.000, 0.017, 0.030, 0.040]}},
                        "ci": {"Drug A": {"1": [None, [0.004, 0.065], [0.031, 0.134], [0.106, 0.255]],
                                          "2": [[0.001, 0.050], [0.004, 0.065], [0.038, 0.147],
                                                [0.131, 0.289]]},
                               "Drug B": {"1": [None, [0.013, 0.090], [0.102, 0.246], [0.175, 0.343]],
                                          "2": [None, [0.008, 0.077], [0.050, 0.165],
                                                [0.133, 0.289]]}}}}
    # pooled (cuminc(Surv(ttdeath, death_cr) ~ 1, trial))
    allt = sum((g[0] for g in groups), [])
    allc = sum((g[1] for g in groups), [])
    t_, p_ = aalen_johansen(allt, allc, [1, 2])
    out["trial"]["pooled"] = {str(c): [float(step_value(t_, p_, t)[c]) for t in (5, 10, 15, 20)]
                              for c in (1, 2)}
    out["trial"]["published"]["pooled_est"] = {"1": [0.000, 0.030, 0.120, 0.215],
                                               "2": [0.005, 0.025, 0.090, 0.205]}
    out["trial"]["published"]["pooled_se"] = {"1": [0.000, 0.012, 0.023, 0.029],
                                              "2": [0.005, 0.011, 0.020, 0.029]}

    names, groups = load_mgus2()
    mg = {}
    for name, (ts, cs) in zip(names, groups):
        t_, p_ = aalen_johansen(ts, cs, [1, 2])
        r = rmean(t_, p_, 240.0) / 12.0
        mg[name] = {"event_free": float(r[0]), "pcm": float(r[1]), "death": float(r[2]),
                    "cif_at": {str(t): [float(v) for v in step_value(t_, p_, t)[1:]]
                               for t in (60, 120, 240)}}
    out["mgus2"] = {"rmean_years_tau240": mg,
                    "published": {"F": {"event_free": 9.853608, "pcm": 1.323284,
                                        "death": 8.823108},
                                  "M": {"event_free": 8.675012, "pcm": 1.064693,
                                        "death": 10.260294}}}
    path = os.path.join(HERE, "competing_risks.json")
    with open(path, "w") as f:
        json.dump(out, f, indent=1)
    print(json.dumps(out["mgus2"]["rmean_years_tau240"], indent=1))
    print(json.dumps(out["trial"]["cif"], indent=1))
    print(out["trial"]["gray_score"])


if __name__ == "__main__":
    main()
