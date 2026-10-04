"""Run the external reference corpus through the OpenDose engine.

The corpus is ``docs/validation/datasets/manifest.json`` (public) plus
``docs/validation/private/datasets/manifest.json`` (licence-flagged, kept
out of the repository; skipped when absent). For every entry this module
builds the ``opendose.api.analyze`` payload from the CSV, runs it, maps each
reference quantity to a value in the engine result, and compares it with
the published value within the manifest tolerance.

Usage (from the repository root)::

    .venv/bin/python engine/tests/corpus/run_corpus.py          # all
    .venv/bin/python engine/tests/corpus/run_corpus.py nist-misra1a ...

writes ``docs/validation/results-engine.json`` and ``results-engine.md``
(public datasets) and ``docs/validation/private/results-engine-private.*``
(whole corpus, local only) when run over the whole corpus (``--no-write``
to only print). ``--update-expected`` rewrites ``expected_failures.json``,
the pytest's list of known failures (every entry must be classified in
``KNOWN``).

Conventions
-----------
* One mapping function per dataset (``@dataset("id", ...)``). It returns a
  ``Mapped`` object: ``m.set(quantity, value, path)`` for a value read from
  the engine result (``path`` is the JSON path in the result, prefixed with
  the analysis that produced it), ``m.unmapped(quantity, reason)`` when the
  engine has no such output. ``derived:`` paths are one-line arithmetic on
  engine outputs (e.g. SS regression = SS total - SS residual), written out
  in the path.
* Quantities a mapping does not mention are reported as unmapped with the
  reason "no mapping".
* ``KNOWN`` classifies every failure that is understood:
  (a) runner transcription / mapping error, (b) tolerance tighter than the
  printed digits justify, (c) genuine engine discrepancy, (d) known
  reference problem (manifest ``reference_status``). The pytest
  (``engine/tests/test_reference_corpus.py``) turns these into
  ``xfail(strict=True)``.

Nothing in here changes engine numbers; it only reads them.
"""

from __future__ import annotations

import csv
import fnmatch
import functools
import json
import math
import re
import sys
import time
import warnings
from pathlib import Path

HERE = Path(__file__).resolve()
REPO = HERE.parents[3]
sys.path.insert(0, str(REPO / "engine"))

from opendose import api  # noqa: E402

PUBLIC_DIR = REPO / "docs" / "validation" / "datasets"
PRIVATE_DIR = REPO / "docs" / "validation" / "private" / "datasets"
OUT_JSON = REPO / "docs" / "validation" / "results-engine.json"
OUT_MD = REPO / "docs" / "validation" / "results-engine.md"
# the licence-flagged datasets' per-quantity detail stays out of the
# repository with their data (docs/validation/private/ is gitignored)
EXPECTED_FAILURES = HERE.parent / "expected_failures.json"
OUT_PRIVATE_JSON = PRIVATE_DIR.parent / "results-engine-private.json"
OUT_PRIVATE_MD = PRIVATE_DIR.parent / "results-engine-private.md"


# ------------------------------------------------------------ manifest / csv

def _load_manifest(folder: Path) -> list[dict]:
    path = folder / "manifest.json"
    if not path.exists():
        return []
    raw = json.loads(path.read_text())
    entries = raw["datasets"] if isinstance(raw, dict) else raw
    for e in entries:
        e["_dir"] = str(folder)
        e["_private"] = folder == PRIVATE_DIR
    return entries


@functools.lru_cache(maxsize=None)
def manifest_entries(include_private: bool = True) -> tuple:
    out = _load_manifest(PUBLIC_DIR)
    if include_private:
        out += _load_manifest(PRIVATE_DIR)
    return tuple(out)


def entry_by_id(ds_id: str) -> dict:
    for e in manifest_entries():
        if e["id"] == ds_id:
            return e
    raise KeyError(ds_id)


def read_csv(entry) -> tuple[list[str], list[dict]]:
    path = Path(entry["_dir"]) / entry["file"]
    with open(path, newline="") as fh:
        reader = csv.DictReader(fh)
        rows = list(reader)
        return list(reader.fieldnames), rows


def num(v):
    """CSV cell -> float (Fortran E notation is fine for float()); blank ->
    None."""
    if v is None:
        return None
    v = str(v).strip()
    if v == "" or v.upper() == "NA":
        return None
    return float(v)


def column(rows, name):
    return [num(r[name]) for r in rows]


def xy_data(rows, xname, ynames, names=None):
    """XY table: one data set per entry of ynames; each entry is a column
    name or a list of replicate column names."""
    x = column(rows, xname)
    datasets = []
    for i, yn in enumerate(ynames):
        cols = [yn] if isinstance(yn, str) else list(yn)
        ys = [[num(r[c]) for c in cols] for r in rows]
        datasets.append({"name": (names[i] if names else
                                  (yn if isinstance(yn, str) else cols[0])),
                         "ys": ys})
    return {"x": x, "datasets": datasets}


def col_data(rows, names):
    """Column table: one data set per column, blanks dropped later by the
    engine (kept as None so paired rows stay aligned)."""
    return {"datasets": [{"name": n, "ys": [[num(r[n])] for r in rows]}
                         for n in names]}


def run(analysis, data, options=None):
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        res = api.analyze({"analysis": analysis, "data": data,
                           "options": options or {}})
    if "error" in res and "traceback" in res:
        raise EngineError(f"{analysis}: {res['error']}")
    return res


class EngineError(RuntimeError):
    pass


# ------------------------------------------------------------ mapping result

class Mapped:
    def __init__(self):
        self.values: dict[str, dict] = {}
        self.unmapped_q: dict[str, str] = {}
        self.notes: list[str] = []

    def set(self, quantity, value, path, **extra):
        if value is not None:
            try:
                value = float(value)
            except (TypeError, ValueError):
                pass
        self.values[quantity] = {"value": value, "path": path, **extra}

    def unmapped(self, quantity_or_pattern, reason):
        self.unmapped_q[quantity_or_pattern] = reason

    def note(self, text):
        self.notes.append(text)

    def reason_for(self, quantity):
        if quantity in self.unmapped_q:
            return self.unmapped_q[quantity]
        for pat, why in self.unmapped_q.items():
            if any(ch in pat for ch in "*?[") and fnmatch.fnmatchcase(
                    quantity, pat):
                return why
        return None


REGISTRY: dict = {}


def dataset(*ids):
    def deco(fn):
        for i in ids:
            REGISTRY[i] = fn
        return fn
    return deco


# ============================================================ NIST StRD

NIST_NLS = ["nist-misra1a", "nist-chwirut2", "nist-thurber", "nist-mgh09",
            "nist-lanczos3", "nist-boxbod", "nist-rat42", "nist-rat43",
            "nist-eckerle4", "nist-hahn1"]


def _nist_nls_fit(entry, rows, start):
    opts = entry["analysis"]["options"]
    data = xy_data(rows, "x", ["y"])
    res = run("dose_response", data, {
        "user_equation": {"text": opts["user_equation"]["text"],
                          "rules": opts["start_values"][start]},
        "weighting": "none"})
    ds = res["datasets"][0]
    if "error" in ds:
        raise EngineError(f"{start}: {ds['error']}")
    return ds["fit"]


@dataset(*NIST_NLS)
def map_nist_nls(entry, rows):
    """Certified values from both NIST starts. The reported value is Start 1
    (the harder start); Start 2 is recorded alongside and must agree too
    (a quantity passes only if both starts are within tolerance)."""
    m = Mapped()
    fits = {}
    for start in ("start1", "start2"):
        try:
            fits[start] = _nist_nls_fit(entry, rows, start)
        except EngineError as exc:
            fits[start] = None
            m.note(f"{start} failed: {exc}")
    pref = "dose_response(user_equation)"

    def val(fit, q):
        if fit is None:
            return None
        if q == "residual_ss":
            return fit["goodness"]["ss_res"]
        if q == "sy_x":
            return fit["goodness"]["sy_x"]
        if q == "df":
            return fit["goodness"]["df"]
        if q.startswith("se_"):
            return fit["params"][q[3:]]["se"]
        return fit["params"][q]["value"]

    paths = {"residual_ss": "goodness.ss_res", "sy_x": "goodness.sy_x",
             "df": "goodness.df"}
    for ref in entry["reference"]:
        q = ref["quantity"]
        path = paths.get(q, (f"params.{q[3:]}.se" if q.startswith("se_")
                             else f"params.{q}.value"))
        v1, v2 = val(fits["start1"], q), val(fits["start2"], q)
        m.set(q, v1, f"{pref}[start1]:datasets[0].fit.{path}",
              start2=v2)
    for s, f in fits.items():
        if f is not None and f.get("status") != "converged":
            m.note(f"{s}: status {f.get('status')}")
    return m


@dataset("nist-norris")
def map_nist_norris(entry, rows):
    m = Mapped()
    res = run("linear_regression", xy_data(rows, "x", ["y"]))
    fit = res["datasets"][0]["fit"]
    p = "linear_regression:datasets[0].fit."
    m.set("B0", fit["y_intercept"]["value"], p + "y_intercept.value")
    m.set("se_B0", fit["y_intercept"]["se"], p + "y_intercept.se")
    m.set("B1", fit["slope"]["value"], p + "slope.value")
    m.set("se_B1", fit["slope"]["se"], p + "slope.se")
    m.set("sy_x", fit["sy_x"], p + "sy_x")
    m.set("r_squared", fit["r_squared"], p + "r_squared")
    m.set("df_regression", fit["f_nonzero_slope"]["dfn"],
          p + "f_nonzero_slope.dfn")
    m.set("F", fit["f_nonzero_slope"]["F"], p + "f_nonzero_slope.F")
    m.set("df_residual", fit["df"], p + "df")
    m.set("residual_ss", fit["ss_res"], p + "ss_res")
    m.set("ms_residual", fit["ss_res"] / fit["df"], "derived: " + p +
          "ss_res / df")
    ss_reg = fit["f_nonzero_slope"]["F"] * fit["ss_res"] / fit["df"]
    m.set("ss_regression", ss_reg, "derived: F * ss_res / df (1 df)")
    m.set("ms_regression", ss_reg, "derived: F * ss_res / df (1 df)")
    return m


def _mr_vars(cols: dict):
    return {"variables": [{"name": k, "values": v, "kind": "continuous"}
                          for k, v in cols.items()]}


def _map_multiple_regression(m, res, names, prefix="multiple_regression"):
    """B0..Bk, se, sy_x, r2, ANOVA table from multivar.multiple_regression;
    names = engine coefficient names in B0..Bk order."""
    coefs = {c["name"]: c for c in res["coefficients"]}
    for j, nm in enumerate(names):
        c = coefs[nm]
        m.set(f"B{j}", c["estimate"],
              f"{prefix}:coefficients[name={nm}].estimate")
        m.set(f"se_B{j}", c["se"], f"{prefix}:coefficients[name={nm}].se")
    g = res["goodness"]
    m.set("sy_x", g["sy_x"], f"{prefix}:goodness.sy_x")
    m.set("r_squared", g["r_squared"], f"{prefix}:goodness.r_squared")
    reg = res["anova"][0]
    resid = res["anova"][1]
    m.set("df_regression", reg["df"], f"{prefix}:anova[0].df")
    m.set("ss_regression", reg["ss"], f"{prefix}:anova[0].ss")
    m.set("ms_regression", reg["ms"], f"{prefix}:anova[0].ms")
    m.set("F", reg["F"], f"{prefix}:anova[0].F")
    m.set("df_residual", resid["df"], f"{prefix}:anova[1].df")
    m.set("residual_ss", resid["ss"], f"{prefix}:anova[1].ss")
    m.set("ms_residual", resid["ms"], f"{prefix}:anova[1].ms")


def _powers_regression(x, y, order):
    cols = {"Y": y}
    for k in range(1, order + 1):
        cols[f"X{k}"] = [v ** k for v in x]
    res = run("multiple_regression", _mr_vars(cols),
              {"outcome": "Y", "predictors": [f"X{k}"
                                              for k in range(1, order + 1)]})
    return res


@dataset("nist-pontius")
def map_nist_pontius(entry, rows):
    """Manifest hint: built-in 'polynomial_second' (nonlinear regression).
    That is what is reported; the exact linear path (multiple regression on
    X and X^2) is recorded in `alt` for comparison."""
    m = Mapped()
    x, y = column(rows, "x"), column(rows, "y")
    res = run("dose_response", xy_data(rows, "x", ["y"]),
              {"model": "polynomial_second"})
    fit = res["datasets"][0]["fit"]
    p = "dose_response(polynomial_second):datasets[0].fit."
    alt = Mapped()
    _map_multiple_regression(alt, _powers_regression(x, y, 2),
                             ["Intercept", "X1", "X2"])
    for j in range(3):
        m.set(f"B{j}", fit["params"][f"B{j}"]["value"],
              p + f"params.B{j}.value",
              alt=alt.values[f"B{j}"]["value"])
        m.set(f"se_B{j}", fit["params"][f"B{j}"]["se"],
              p + f"params.B{j}.se", alt=alt.values[f"se_B{j}"]["value"])
    g = fit["goodness"]
    n = g["n_points"]
    ss_tot = sum((v - sum(y) / n) ** 2 for v in y)
    m.set("sy_x", g["sy_x"], p + "goodness.sy_x",
          alt=alt.values["sy_x"]["value"])
    m.set("r_squared", g["r_squared"], p + "goodness.r_squared",
          alt=alt.values["r_squared"]["value"])
    m.set("df_residual", g["df"], p + "goodness.df")
    m.set("residual_ss", g["ss_res"], p + "goodness.ss_res",
          alt=alt.values["residual_ss"]["value"])
    m.set("ms_residual", g["ss_res"] / g["df"], "derived: ss_res / df",
          alt=alt.values["ms_residual"]["value"])
    m.set("df_regression", n - 1 - g["df"],
          "derived: n_points - 1 - df")
    ss_reg = g["r_squared"] * ss_tot
    m.set("ss_regression", ss_reg,
          "derived: r_squared * SS total (SS total from the data)",
          alt=alt.values["ss_regression"]["value"])
    m.set("ms_regression", ss_reg / 2, "derived: ss_regression / 2",
          alt=alt.values["ms_regression"]["value"])
    m.set("F", (ss_reg / 2) / (g["ss_res"] / g["df"]),
          "derived: ms_regression / ms_residual",
          alt=alt.values["F"]["value"])
    return m


@dataset("nist-filip")
def map_nist_filip(entry, rows):
    """No 10th-order built-in polynomial (built-ins stop at 6th); fitted by
    multiple regression on X..X^10 (Householder QR on raw powers). A user
    equation with 11 parameters through the LM path is recorded in the
    notes."""
    m = Mapped()
    x, y = column(rows, "x"), column(rows, "y")
    res = _powers_regression(x, y, 10)
    _map_multiple_regression(m, res, ["Intercept"] + [f"X{k}"
                                                      for k in range(1, 11)])
    for q in list(m.values):
        m.values[q]["path"] = m.values[q]["path"].replace(
            "multiple_regression:", "multiple_regression(X..X^10):")
    return m


@dataset("nist-noint1")
def map_nist_noint1(entry, rows):
    """linear_regression has no through-origin option; the built-in
    'line_through_origin' model (nonlinear regression path) is used. Its
    R^2 is Prism's (1 - SSres/SStot about the mean), not the uncentred
    R^2 NIST certifies for no-intercept models, so R^2 is derived."""
    m = Mapped()
    y = column(rows, "y")
    res = run("dose_response", xy_data(rows, "x", ["y"]),
              {"model": "line_through_origin"})
    fit = res["datasets"][0]["fit"]
    p = "dose_response(line_through_origin):datasets[0].fit."
    g = fit["goodness"]
    m.set("B1", fit["params"]["Slope"]["value"], p + "params.Slope.value")
    m.set("se_B1", fit["params"]["Slope"]["se"], p + "params.Slope.se")
    m.set("sy_x", g["sy_x"], p + "goodness.sy_x")
    m.set("r_squared", 1 - g["ss_res"] / sum(v * v for v in y),
          "derived: 1 - ss_res / sum(Y^2) (NIST's uncentred R^2; the "
          "engine's goodness.r_squared = "
          f"{g['r_squared']:.6g} is Prism's centred R^2, which can be "
          "negative for a line through the origin)")
    m.set("df_residual", g["df"], p + "goodness.df")
    m.set("residual_ss", g["ss_res"], p + "goodness.ss_res")
    m.set("ms_residual", g["ss_res"] / g["df"], "derived: ss_res / df")
    m.set("df_regression", g["n_points"] - g["df"],
          "derived: n_points - df (uncentred, no intercept)")
    ss_reg = sum(v * v for v in y) - g["ss_res"]
    m.set("ss_regression", ss_reg,
          "derived: sum(Y^2) - ss_res (uncentred, no intercept)")
    m.set("ms_regression", ss_reg, "derived: ss_regression / 1")
    m.set("F", ss_reg / (g["ss_res"] / g["df"]),
          "derived: ms_regression / ms_residual")
    return m


@dataset("nist-longley")
def map_nist_longley(entry, rows):
    m = Mapped()
    cols = {"y": column(rows, "y")}
    for k in range(1, 7):
        cols[f"x{k}"] = column(rows, f"x{k}")
    res = run("multiple_regression", _mr_vars(cols),
              {"outcome": "y", "predictors": [f"x{k}" for k in range(1, 7)]})
    _map_multiple_regression(m, res, ["Intercept"] + [f"x{k}"
                                                      for k in range(1, 7)])
    return m


NIST_ANOVA = ["nist-sirstv", "nist-smls01", "nist-smls02", "nist-smls03",
              "nist-smls04", "nist-smls05", "nist-smls06", "nist-smls07",
              "nist-smls08", "nist-smls09", "nist-atmwtag"]


def _map_anova_table(m, res, keys=("df_between", "ss_between", "ms_between",
                                   "F", "df_within", "ss_within",
                                   "ms_within", "r_squared", "p")):
    t = res["table"]
    for k in keys:
        if k in t:
            m.set(k, t[k], f"anova:table.{k}")
    m.set("residual_sd", math.sqrt(t["ms_within"]),
          "derived: sqrt(anova:table.ms_within)")


@dataset(*NIST_ANOVA)
def map_nist_anova(entry, rows):
    m = Mapped()
    res = run("anova", col_data(rows, entry["layout"]["columns"]))
    _map_anova_table(m, res)
    return m


NIST_UNIV = ["nist-pidigits", "nist-lottery", "nist-lew", "nist-mavro",
             "nist-michelso", "nist-numacc1", "nist-numacc2", "nist-numacc3",
             "nist-numacc4"]


@dataset(*NIST_UNIV)
def map_nist_univariate(entry, rows):
    m = Mapped()
    res = run("column_statistics", col_data(rows, ["Y"]))
    d = res["datasets"][0]["descriptive"]
    for k in ("mean", "sd", "n"):
        m.set(k, d[k], f"column_statistics:datasets[0].descriptive.{k}")
    m.unmapped("lag1_autocorrelation",
               "no engine output: the lag-1 autocorrelation of a column is "
               "not a column statistic in OpenDose")
    return m


# ============================================================ R: one-way ANOVA

def _tukey_rq(m, res, q, names_pair, prefix="anova:multiple_comparisons"):
    """R TukeyHSD row 'X-Y' (= mean X - mean Y) from the engine's pair
    'Y vs. X' (difference = mean Y - mean X) or 'X vs. Y'."""
    x, y = names_pair
    comps = res["multiple_comparisons"]["comparisons"]
    for c in comps:
        if c["pair"] == f"{x} vs. {y}":
            sign, path = 1, f"{prefix}.comparisons[pair={x} vs. {y}]"
            break
        if c["pair"] == f"{y} vs. {x}":
            sign, path = -1, f"{prefix}.comparisons[pair={y} vs. {x}]"
            break
    else:
        raise KeyError(names_pair)
    ck = "ci" if c.get("ci") else "ci95"   # two-way results say ci95
    lo, hi = c[ck] if c.get(ck) else (None, None)
    neg = " (sign flipped: engine pair is the reverse)" if sign < 0 else ""
    m.set(f"{q}.diff", sign * c["difference"], path + ".difference" + neg)
    if lo is not None:
        m.set(f"{q}.lower", hi * -1 if sign < 0 else lo,
              path + (f".{ck}[1] * -1" if sign < 0 else f".{ck}[0]"))
        m.set(f"{q}.upper", lo * -1 if sign < 0 else hi,
              path + (f".{ck}[0] * -1" if sign < 0 else f".{ck}[1]"))
    m.set(f"{q}.p_adj", c["p_adjusted"], path + ".p_adjusted")


@dataset("r-plantgrowth", "r-chickwts")
def map_r_oneway(entry, rows):
    m = Mapped()
    res = run("anova", col_data(rows, entry["layout"]["columns"]))
    _map_anova_table(m, res)
    return m


@dataset("r-insectsprays")
def map_r_insectsprays(entry, rows):
    m = Mapped()
    cols = entry["layout"]["columns"]
    data = col_data(rows, cols)
    res = run("anova", data, {"comparisons": "tukey"})
    _map_anova_table(m, res)
    for ref in entry["reference"]:
        mt = re.match(r"tukey\[(\w)-(\w)\]\.diff", ref["quantity"])
        if mt:
            _tukey_rq(m, res, f"tukey[{mt.group(1)}-{mt.group(2)}]",
                      (mt.group(1), mt.group(2)))
    kw = run("anova", data, {"kind": "nonparametric"})
    m.set("kruskal_wallis_chi2", kw["H"], "anova(nonparametric):H")
    m.set("kruskal_p", kw["p"], "anova(nonparametric):p")
    m.set("kruskal_df", len(kw["group_summaries"]) - 1,
          "derived: len(anova(nonparametric):group_summaries) - 1")
    m.set("bartlett_K2", res["bartlett"]["statistic"],
          "anova:bartlett.statistic")
    m.set("bartlett_p", res["bartlett"]["p"], "anova:bartlett.p")
    m.set("fligner_chi2", res["fligner_killeen"]["statistic"],
          "anova:fligner_killeen.statistic")
    m.set("fligner_p", res["fligner_killeen"]["p"], "anova:fligner_killeen.p")
    return m


# ============================================================ R: t tests

def _signed_t(res):
    """The engine reports |t| (Prism style); R signs t like the mean
    difference."""
    d = res.get("mean_difference", res.get("difference"))
    return math.copysign(res["t"], d)


@dataset("r-sleep")
def map_r_sleep(entry, rows):
    m = Mapped()
    data = col_data(rows, ["drug1", "drug2"])
    pr = run("ttest", data, {"kind": "paired"})
    m.set("paired.t", _signed_t(pr),
          "derived: sign(ttest(paired):mean_difference) * ttest(paired):t")
    for q, k in (("paired.df", "df"), ("paired.p", "p_two_tailed"),
                 ("paired.mean_diff", "mean_difference")):
        m.set(q, pr[k], f"ttest(paired):{k}")
    m.set("paired.ci_lower", pr["ci_difference"][0],
          "ttest(paired):ci_difference[0]")
    m.set("paired.ci_upper", pr["ci_difference"][1],
          "ttest(paired):ci_difference[1]")
    w = run("anova_unequal_var", data)
    m.set("welch.F", w["welch"]["W"], "anova_unequal_var:welch.W")
    m.set("welch.df_denom", w["welch"]["dfd"], "anova_unequal_var:welch.dfd")
    m.set("welch.p", w["welch"]["p"], "anova_unequal_var:welch.p")
    a = run("anova", data)["table"]
    m.set("pooled.F", a["F"], "anova:table.F")
    m.set("pooled.df", a["df_within"], "anova:table.df_within")
    m.set("pooled.p", a["p"], "anova:table.p")
    m.set("pooled.ss_between", a["ss_between"], "anova:table.ss_between")
    m.set("pooled.ss_within", a["ss_within"], "anova:table.ss_within")
    stacked = {"datasets": [{"name": "all20", "ys": [[num(r["drug1"])]
                                                     for r in rows]
                             + [[num(r["drug2"])] for r in rows]}]}
    cs = run("column_statistics", stacked, {"hypothetical": 0})
    ost = cs["datasets"][0]["one_sample_t"]
    p = "column_statistics(hypothetical=0):datasets[0].one_sample_t."
    m.set("one_sample_all20.t", math.copysign(ost["t"], ost["discrepancy"]),
          "derived: sign(discrepancy) * " + p + "t")
    m.set("one_sample_all20.df", ost["df"], p + "df")
    m.set("one_sample_all20.p", ost["p_two_tailed"], p + "p_two_tailed")
    m.set("one_sample_all20.ci_lower", ost["ci_discrepancy"][0],
          p + "ci_discrepancy[0]")
    m.set("one_sample_all20.ci_upper", ost["ci_discrepancy"][1],
          p + "ci_discrepancy[1]")
    m.set("one_sample_all20.mean", ost["mean"], p + "mean")
    return m


def _welch_block(m, q, res, label):
    m.set(f"{q}.t", _signed_t(res),
          f"derived: sign(difference) * {label}:t")
    m.set(f"{q}.df", res["df"], f"{label}:df")
    m.set(f"{q}.p", res["p_two_tailed"], f"{label}:p_two_tailed")
    m.set(f"{q}.ci_lower", res["ci_difference"][0],
          f"{label}:ci_difference[0]")
    m.set(f"{q}.ci_upper", res["ci_difference"][1],
          f"{label}:ci_difference[1]")


@dataset("r-welch-examples")
def map_r_welch(entry, rows):
    m = Mapped()
    data = col_data(rows, ["x", "y", "y_plus_200"])
    r1 = run("ttest", data, {"kind": "unpaired", "welch": True,
                             "dataset_a": 0, "dataset_b": 1})
    _welch_block(m, "x_vs_y", r1, "ttest(welch, x vs y)")
    r2 = run("ttest", data, {"kind": "unpaired", "welch": True,
                             "dataset_a": 0, "dataset_b": 2})
    _welch_block(m, "x_vs_y200", r2, "ttest(welch, x vs y_plus_200)")
    m.set("x_vs_y200.mean_y", r2["mean_b"],
          "ttest(welch, x vs y_plus_200):mean_b")
    return m


@dataset("r-mtcars-mpg-by-am")
def map_r_mtcars(entry, rows):
    m = Mapped()
    cols = entry["layout"]["columns"]
    r = run("ttest", col_data(rows, cols), {"kind": "unpaired",
                                            "welch": True})
    m.set("t", _signed_t(r), "derived: sign(difference) * ttest(welch):t")
    m.set("df", r["df"], "ttest(welch):df")
    m.set("p", r["p_two_tailed"], "ttest(welch):p_two_tailed")
    m.set("ci_lower", r["ci_difference"][0], "ttest(welch):ci_difference[0]")
    m.set("ci_upper", r["ci_difference"][1], "ttest(welch):ci_difference[1]")
    m.set("mean_automatic", r["mean_a"], "ttest(welch):mean_a")
    m.set("mean_manual", r["mean_b"], "ttest(welch):mean_b")
    return m


# ============================================================ R: nonparametric

@dataset("r-hw-depression")
def map_r_depression(entry, rows):
    m = Mapped()
    r = run("ttest", col_data(rows, ["first_visit", "second_visit"]),
            {"kind": "wilcoxon"})
    m.set("V", r["sum_positive_ranks"], "ttest(wilcoxon):sum_positive_ranks")
    m.set("p_two_sided_exact", r["p_two_tailed"],
          f"ttest(wilcoxon):p_two_tailed (p_method {r['p_method']})")
    m.set("p_one_sided_exact_greater", r["p_two_tailed"] / 2,
          "derived: ttest(wilcoxon):p_two_tailed / 2 (exact null "
          "distribution is symmetric; V in the upper tail)")
    m.unmapped("p_one_sided_normal_approx_no_correction",
               "no option: the engine uses the exact P for small n and has "
               "no uncorrected normal approximation")
    return m


@dataset("r-hw-permeability")
def map_r_permeability(entry, rows):
    m = Mapped()
    r = run("ttest", col_data(rows, ["term", "weeks_12_26"]),
            {"kind": "mann_whitney"})
    na = r["n_a"]
    m.set("W", r["sum_ranks_a"] - na * (na + 1) / 2,
          "derived: ttest(mann_whitney):sum_ranks_a - n_a(n_a+1)/2 "
          "(R's W = U of the first sample)")
    m.set("p_one_sided_exact_greater", r["p_two_tailed"] / 2,
          f"derived: ttest(mann_whitney):p_two_tailed / 2 (p_method "
          f"{r['p_method']}; exact null distribution is symmetric)")
    m.unmapped("p_one_sided_normal_approx_no_correction",
               "no option: the engine uses the exact P for small samples and "
               "has no uncorrected normal approximation")
    return m


@dataset("r-hw-mucociliary")
def map_r_mucociliary(entry, rows):
    m = Mapped()
    kw = run("anova", col_data(rows, entry["layout"]["columns"]),
             {"kind": "nonparametric"})
    m.set("kruskal_wallis_chi2", kw["H"], "anova(nonparametric):H")
    m.set("df", len(kw["group_summaries"]) - 1,
          "derived: len(anova(nonparametric):group_summaries) - 1")
    m.set("p", kw["p"], "anova(nonparametric):p")
    return m


@dataset("r-airquality-ozone")
def map_r_airquality(entry, rows):
    m = Mapped()
    cols = entry["layout"]["columns"]
    data = col_data(rows, cols)
    kw = run("anova", data, {"kind": "nonparametric"})
    m.set("kruskal_wallis_chi2", kw["H"], "anova(nonparametric):H")
    m.set("kruskal_df", len(kw["group_summaries"]) - 1,
          "derived: len(anova(nonparametric):group_summaries) - 1")
    m.set("kruskal_p", kw["p"], "anova(nonparametric):p")
    bon = run("anova", data, {"comparisons": "bonferroni"})
    for c in bon["multiple_comparisons"]["comparisons"]:
        a, b = c["pair"].split(" vs. ")
        m.set(f"pairwise_t_pooled_bonferroni[{b}-{a}]", c["p_adjusted"],
              f"anova(bonferroni):multiple_comparisons.comparisons"
              f"[pair={c['pair']}].p_adjusted")
    holm = run("anova", data, {"comparisons": "holm"})
    for c in holm["multiple_comparisons"]["comparisons"]:
        a, b = c["pair"].split(" vs. ")
        m.set(f"pairwise_t_pooled_holm[{b}-{a}]", c["p_adjusted"],
              f"anova(holm):multiple_comparisons.comparisons"
              f"[pair={c['pair']}].p_adjusted")
    return m


@dataset("r-friedman-roundingtimes")
def map_r_friedman(entry, rows):
    m = Mapped()
    fr = run("rm_anova", col_data(rows, entry["layout"]["columns"]),
             {"kind": "nonparametric"})
    m.set("friedman_chi2", fr["statistic"], "rm_anova(nonparametric):statistic")
    m.set("df", len(fr["rank_sums"]) - 1,
          "derived: len(rm_anova(nonparametric):rank_sums) - 1")
    m.set("p", fr["p"], "rm_anova(nonparametric):p")
    return m


# ============================================================ R: correlation

@dataset("r-hw-tuna-correlation")
def map_r_tuna(entry, rows):
    m = Mapped()
    x, y = column(rows, "hunter_L"), column(rows, "panel_score")
    v = {"variables": [{"name": "x", "values": x}, {"name": "y", "values": y}]}
    pe = run("correlation_matrix", v, {"method": "pearson", "tails": 1})
    r, n = pe["r"][0][1], pe["n"][0][1]
    m.set("pearson_r", r, "correlation_matrix(pearson, tails=1):r[0][1]")
    m.set("pearson_p_one_sided", pe["p"][0][1],
          "correlation_matrix(pearson, tails=1):p[0][1]")
    m.set("pearson_df", n - 2, "derived: n - 2")
    m.set("pearson_t", r * math.sqrt((n - 2) / (1 - r * r)),
          "derived: r sqrt((n-2)/(1-r^2))")
    cdata = {"datasets": [{"name": "x", "ys": [[v] for v in x]},
                          {"name": "y", "ys": [[v] for v in y]}]}
    pc = run("correlation", cdata, {"method": "pearson"})
    m.set("pearson_ci_lower_one_sided", pc["ci_r_greater"][0],
          "correlation(pearson):ci_r_greater[0]")
    sp = run("correlation_matrix", v, {"method": "spearman", "tails": 1})
    rho = sp["r"][0][1]
    m.set("spearman_rho", rho, "correlation_matrix(spearman, tails=1):r[0][1]")
    m.set("spearman_p_one_sided", sp["p"][0][1],
          f"correlation_matrix(spearman, tails=1):p[0][1] "
          f"({sp['p_type'][0][1]})")
    m.set("spearman_S", (n ** 3 - n) * (1 - rho) / 6,
          "derived: (n^3 - n)(1 - rho)/6 (R's S statistic)")
    kd = run("correlation", cdata, {"method": "kendall"})
    m.set("kendall_tau", kd["tau"], "correlation(kendall):tau")
    m.set("kendall_T", kd["T"], "correlation(kendall):T (concordant pairs)")
    m.set("kendall_p_one_sided_exact", kd["p_greater"],
          f"correlation(kendall):p_greater ({kd['p_type']})")
    na = kd["normal_approximation"]
    m.set("kendall_z_approx", na["z"],
          "correlation(kendall):normal_approximation.z")
    m.set("kendall_p_one_sided_approx", na["p_greater"],
          "correlation(kendall):normal_approximation.p_greater")
    return m

# ============================================================ two-way ANOVA

def _grouped_from_long(rows, row_key, col_key, value_key, row_levels,
                       col_levels):
    """Tidy long file -> grouped table: one data set per column level, rows
    = row levels, replicates side by side."""
    datasets = []
    for c in col_levels:
        ys = []
        for r in row_levels:
            ys.append([num(x[value_key]) for x in rows
                       if x[row_key] == r and x[col_key] == c])
        datasets.append({"name": c, "ys": ys})
    return {"datasets": datasets}


def _map_twoway_sources(m, res, names, prefix="two_way_anova"):
    """names: {reference factor label: engine source key}."""
    for lab, key in names.items():
        s = res["sources"][key]
        for stat in ("df", "ss", "ms", "F", "p"):
            if s.get(stat) is not None:
                m.set(f"{stat}.{lab}", s[stat],
                      f"{prefix}:sources.{key}.{stat}")


@dataset("r-warpbreaks")
def map_r_warpbreaks(entry, rows):
    m = Mapped()
    data = _grouped_from_long(rows, "tension", "wool", "breaks",
                              ["L", "M", "H"], ["A", "B"])
    res = run("two_way_anova", data)
    _map_twoway_sources(m, res, {"wool": "Columns", "tension": "Rows",
                                 "interaction": "interaction",
                                 "residual": "residual"})
    add = run("two_way_anova", data, {"model": "additive"})
    lab = "two_way_anova(model=additive)"
    for q, key in (("wool", "Columns"), ("tension", "Rows")):
        for stat in ("F", "p"):
            m.set(f"additive.{stat}.{q}", add["sources"][key][stat],
                  f"{lab}:sources.{key}.{stat}")
    m.set("additive.df.residual", add["sources"]["residual"]["df"],
          f"{lab}:sources.residual.df")
    m.set("additive.ms.residual", add["sources"]["residual"]["ms"],
          f"{lab}:sources.residual.ms")
    mc = run("two_way_anova", data, {"model": "additive",
                                     "comparisons": "tukey",
                                     "direction": "row_means",
                                     "row_names": ["L", "M", "H"]})
    for x, y in (("M", "H"), ("L", "H"), ("L", "M")):
        _tukey_rq(m, mc, f"additive.tukey_tension[{x}-{y}]", (x, y),
                  prefix="two_way_anova(model=additive, tukey, row_means)"
                         ":multiple_comparisons")
    return m


@dataset("r-toothgrowth")
def map_r_toothgrowth(entry, rows):
    m = Mapped()
    doses = ["0.5", "1", "2"]
    data = _grouped_from_long(rows, "dose", "supp", "len", doses,
                              ["OJ", "VC"])
    res = run("two_way_anova", data)
    _map_twoway_sources(m, res, {"supp": "Columns", "dose": "Rows",
                                 "interaction": "interaction",
                                 "residual": "residual"})
    for lab, key in (("supp", "Columns"), ("dose", "Rows"),
                     ("interaction", "interaction"),
                     ("residual", "residual")):
        m.set(f"ss.{lab}_2dp", res["sources"][key]["ss"],
              f"two_way_anova:sources.{key}.ss")
    m.set("F.supp_4dp", res["sources"]["Columns"]["F"],
          "two_way_anova:sources.Columns.F")
    m.set("p.interaction_7dp", res["sources"]["interaction"]["p"],
          "two_way_anova:sources.interaction.p")
    mc = run("two_way_anova", data, {"comparisons": "tukey",
                                     "direction": "row_means",
                                     "row_names": ["D0.5", "D1", "D2"]})
    comps = mc["multiple_comparisons"]["comparisons"]
    for c in comps:
        a, b = c["pair"].split(" vs. ")
        q = f"tukey_dose[{b}-{a}]"   # R: later level minus earlier
        p = (f"two_way_anova(tukey, row_means):multiple_comparisons"
             f".comparisons[pair={c['pair']}]")
        m.set(f"{q}.diff", -c["difference"], p + ".difference * -1")
        m.set(f"{q}.lower", -c["ci95"][1], p + ".ci95[1] * -1")
        m.set(f"{q}.upper", -c["ci95"][0], p + ".ci95[0] * -1")
    m.unmapped("tukey_cells*", "no option: Tukey comparing every cell mean "
               "with every other cell mean (the engine compares cells within "
               "a row or column, or the marginal means)")
    return m


@dataset("r-morley")
def map_r_morley(entry, rows):
    """One value per cell: two_way_anova fits the main-effects (additive)
    model, R's aov(Speed ~ Run + Expt)."""
    m = Mapped()
    expts = [f"Expt {i}" for i in range(1, 6)]
    data = {"datasets": [{"name": e, "ys": [[num(r[e])] for r in rows]}
                         for e in expts]}
    res = run("two_way_anova", data)
    if res.get("model", "").startswith("main effects"):
        m.note("two_way_anova: " + res.get("note", ""))
    _map_twoway_sources(m, res, {"run": "Rows", "expt": "Columns",
                                 "residual": "residual"})
    return m


@dataset("gp-book-twoway-bonferroni")
def map_gp_twoway(entry, rows):
    m = Mapped()
    data = {"datasets": [
        {"name": g, "ys": [[num(r[f"{g}_{k}"]) for k in (1, 2, 3)]
                           for r in rows]} for g in ("control", "treated")]}
    times = [r["time"] for r in rows]
    res = run("two_way_anova", data, {
        "comparisons": "bonferroni", "direction": "columns_within_rows",
        "row_names": [f"time={t}" for t in times]})
    _map_twoway_sources(m, res, {"interaction": "interaction",
                                 "treatment": "Columns", "time": "Rows",
                                 "residual": "residual"})
    for lab, key in (("treatment", "Columns"), ("time", "Rows"),
                     ("interaction", "interaction")):
        m.set(f"percent_variation.{lab}",
              res["sources"][key]["percent_of_total"],
              f"two_way_anova:sources.{key}.percent_of_total")
    for c in res["multiple_comparisons"]["comparisons"]:
        fam = c["family"]
        p = (f"two_way_anova(bonferroni):multiple_comparisons.comparisons"
             f"[family={fam}]")
        if c["pair"] == "control vs. treated":
            m.set(f"bonferroni[{fam}].diff_treated_minus_control",
                  -c["difference"], p + ".difference * -1")
            m.set(f"bonferroni[{fam}].ci_lower", -c["ci95"][1],
                  p + ".ci95[1] * -1")
            m.set(f"bonferroni[{fam}].ci_upper", -c["ci95"][0],
                  p + ".ci95[0] * -1")
    return m


# ============================================================ contingency

def _table(rows, cols):
    return [[num(r[c]) for c in cols] for r in rows]


@dataset("r-fisher-teatasting")
def map_r_tea(entry, rows):
    m = Mapped()
    hdr = entry["layout"]["columns"]
    res = run("contingency", {"table": _table(rows, hdr)})
    fe = res["fisher_exact"]
    m.set("p_one_sided_greater", fe["p_greater"],
          "contingency:fisher_exact.p_greater")
    m.set("odds_ratio_conditional_mle", fe["odds_ratio_conditional_mle"],
          "contingency:fisher_exact.odds_ratio_conditional_mle")
    m.set("or_ci_lower_one_sided", fe["ci_conditional_greater"][0],
          "contingency:fisher_exact.ci_conditional_greater[0]")
    return m


@dataset("r-fisher-convictions")
def map_r_convictions(entry, rows):
    m = Mapped()
    hdr = entry["layout"]["columns"]
    res = run("contingency", {"table": _table(rows, hdr)})
    fe = res["fisher_exact"]
    m.set("p_two_sided", fe["p"], "contingency:fisher_exact.p")
    m.set("p_one_sided_less", fe["p_less"], "contingency:fisher_exact.p_less")
    m.set("odds_ratio_conditional_mle", fe["odds_ratio_conditional_mle"],
          "contingency:fisher_exact.odds_ratio_conditional_mle")
    m.set("or_ci95_lower", fe["ci_conditional"][0],
          "contingency:fisher_exact.ci_conditional[0]")
    m.set("or_ci95_upper", fe["ci_conditional"][1],
          "contingency:fisher_exact.ci_conditional[1]")
    r99 = run("contingency", {"table": _table(rows, hdr)},
              {"ci_level": 0.99})["fisher_exact"]
    m.set("or_ci99_lower", r99["ci_conditional"][0],
          "contingency(ci_level=0.99):fisher_exact.ci_conditional[0]")
    m.set("or_ci99_upper", r99["ci_conditional"][1],
          "contingency(ci_level=0.99):fisher_exact.ci_conditional[1]")
    return m


@dataset("r-fisher-job", "r-fisher-mp6")
def map_r_fisher_rxc(entry, rows):
    m = Mapped()
    hdr = entry["layout"]["columns"]
    res = run("contingency", {"table": _table(rows, hdr)},
              {"fisher_rxc": True})
    m.set("p", res["fisher_exact"]["p"],
          "contingency(fisher_rxc):fisher_exact.p (Freeman-Halton, network "
          "algorithm)")
    return m


@dataset("r-chisq-party-gender")
def map_r_party(entry, rows):
    m = Mapped()
    hdr = entry["layout"]["columns"]
    res = run("contingency", {"table": _table(rows, hdr)})
    for k in ("chi2", "df", "p"):
        m.set(k, res["chi_square"][k], f"contingency:chi_square.{k}")
    labels = [r[next(iter(r))] for r in rows]
    for i, rl in enumerate(labels):
        for j, cl in enumerate(hdr):
            m.set(f"expected[{rl},{cl}]", res["expected"][i][j],
                  f"contingency:expected[{i}][{j}]")
            m.set(f"standardized_residual[{rl},{cl}]",
                  res["residuals_standardized"][i][j],
                  f"contingency:residuals_standardized[{i}][{j}]")
    return m


@dataset("r-chisq-2x2-yates")
def map_r_yates(entry, rows):
    m = Mapped()
    res = run("contingency", {"table": _table(rows, ["col1", "col2"])})
    m.set("p_yates", res["chi_square_yates"]["p"],
          "contingency:chi_square_yates.p")
    return m


@dataset("r-chisq-goodness-of-fit")
def map_r_gof(entry, rows):
    m = Mapped()
    obs_a = [num(r["observed_A"]) for r in rows if r["observed_A"]]
    obs_b = column(rows, "observed_B")

    def gof(obs, exp, label):
        res = run("chisq_goodness_of_fit",
                  {"datasets": [{"name": label, "ys": [[v] for v in obs]}]},
                  {"expected": exp, "expected_as": "fraction"})
        return res["chi_square"]

    a = gof(obs_a, [1 / 3] * 3, "A")
    for k in ("chi2", "df", "p"):
        m.set(f"A_equal.{k}", a[k],
              f"chisq_goodness_of_fit(A, equal):chi_square.{k}")
    for lab, col in (("B_vs_B1", "expected_prop_B1"),
                     ("B_vs_B2", "expected_prop_B2")):
        b = gof(obs_b, column(rows, col), lab)
        for k in ("chi2", "df", "p"):
            m.set(f"{lab}.{k}", b[k],
                  f"chisq_goodness_of_fit({lab}):chi_square.{k}")
    return m


@dataset("r-binom-mendel")
def map_r_binom(entry, rows):
    m = Mapped()
    k = num(rows[0]["count"])
    n = k + num(rows[1]["count"])
    res = run("proportion_test", {"successes": int(k), "trials": int(n)},
              {"p0": 0.75, "ci_method": "clopper_pearson"})
    m.set("p_two_sided", res["binomial_test"]["p_two_tailed"],
          "proportion_test:binomial_test.p_two_tailed")
    m.set("proportion", res["proportion"], "proportion_test:proportion")
    m.set("ci_lower_clopper_pearson", res["ci"][0],
          "proportion_test(clopper_pearson):ci[0]")
    m.set("ci_upper_clopper_pearson", res["ci"][1],
          "proportion_test(clopper_pearson):ci[1]")
    return m


@dataset("r-mcnemar-performance")
def map_r_mcnemar(entry, rows):
    m = Mapped()
    hdr = entry["layout"]["columns"]
    res = run("mcnemar", {"table": _table(rows, hdr)})
    m.set("chi2_corrected", res["chi_square_yates"]["chi2"],
          "mcnemar:chi_square_yates.chi2")
    m.set("df", res["chi_square_yates"]["df"], "mcnemar:chi_square_yates.df")
    m.set("p", res["chi_square_yates"]["p"], "mcnemar:chi_square_yates.p")
    return m


@dataset("r-cmh-rabbits")
def map_r_rabbits(entry, rows):
    m = Mapped()
    strata = []
    for r in rows:
        if r["penicillin_level"] not in strata:
            strata.append(r["penicillin_level"])
    tables = []
    for s in strata:
        sub = {r["delay"]: r for r in rows if r["penicillin_level"] == s}
        tables.append([[num(sub["None"]["cured"]), num(sub["None"]["died"])],
                       [num(sub["1.5h"]["cured"]), num(sub["1.5h"]["died"])]])
    res = run("cmh", {"tables": tables, "strata_names": strata},
              {"correction": True})
    t = res["cmh_test"]
    m.set("mh_chi2_corrected", t["chi2"], "cmh(correction):cmh_test.chi2")
    m.set("df", t["df"], "cmh(correction):cmh_test.df")
    m.set("p", t["p"], "cmh(correction):cmh_test.p")
    m.set("common_odds_ratio_mh", res["odds_ratio"]["value"],
          "cmh:odds_ratio.value")
    m.set("or_ci_lower", res["odds_ratio"]["ci"][0], "cmh:odds_ratio.ci[0]")
    m.set("or_ci_upper", res["odds_ratio"]["ci"][1], "cmh:odds_ratio.ci[1]")
    m.unmapped("exact_*", "not implemented: exact conditional CMH test and "
               "conditional MLE common odds ratio")
    return m


@dataset("r-cmh-ucbadmissions")
def map_r_ucb(entry, rows):
    m = Mapped()
    depts = []
    for r in rows:
        if r["dept"] not in depts:
            depts.append(r["dept"])
    tables = []
    for d in depts:
        sub = {r["gender"]: r for r in rows if r["dept"] == d}
        # R: Admit x Gender -> [[Adm M, Adm F], [Rej M, Rej F]]
        tables.append([[num(sub["Male"]["admitted"]),
                        num(sub["Female"]["admitted"])],
                       [num(sub["Male"]["rejected"]),
                        num(sub["Female"]["rejected"])]])
    res = run("cmh", {"tables": tables, "strata_names": depts},
              {"correction": True})
    t = res["cmh_test"]
    m.set("mh_chi2_corrected", t["chi2"], "cmh(correction):cmh_test.chi2")
    m.set("p", t["p"], "cmh(correction):cmh_test.p")
    m.set("common_odds_ratio_mh", res["odds_ratio"]["value"],
          "cmh:odds_ratio.value")
    m.set("or_ci_lower", res["odds_ratio"]["ci"][0], "cmh:odds_ratio.ci[0]")
    m.set("or_ci_upper", res["odds_ratio"]["ci"][1], "cmh:odds_ratio.ci[1]")
    m.set("dept_A_odds_ratio", res["strata"][0]["odds_ratio"],
          "cmh:strata[0].odds_ratio")
    m.set("woolf_homogeneity_p", res["woolf"]["p"], "cmh:woolf.p")
    agg = res["aggregate_table"]
    for i, rl in enumerate(("Admitted", "Rejected")):
        for j, cl in enumerate(("Male", "Female")):
            m.set(f"aggregate[{rl},{cl}]", agg[i][j],
                  f"cmh:aggregate_table[{i}][{j}]")
    return m


@dataset("r-cmh-satisfaction")
def map_r_cmh_rxc(entry, rows):
    m = Mapped()
    cols = entry["layout"]["columns"]
    strata = []
    for r in rows:
        if r["gender"] not in strata:
            strata.append(r["gender"])
    tables = [[[num(r[c]) for c in cols] for r in rows if r["gender"] == g]
              for g in strata]
    res = run("cmh", {"tables": tables, "strata_names": strata})
    t = res["cmh_test"]
    m.set("cmh_M2", t["chi2"], "cmh(r x c x k):cmh_test.chi2")
    m.set("df", t["df"], "cmh(r x c x k):cmh_test.df")
    m.set("p", t["p"], "cmh(r x c x k):cmh_test.p")
    return m

# ============================================================ R: regression

def _linreg_block(m, q, fit, label, n):
    p = f"{label}:datasets[0].fit."
    ms_res = fit["ss_res"] / fit["df"]
    F = fit["f_nonzero_slope"]["F"]
    m.set(f"{q}.intercept", fit["y_intercept"]["value"],
          p + "y_intercept.value")
    m.set(f"{q}.se_intercept", fit["y_intercept"]["se"], p + "y_intercept.se")
    m.set(f"{q}.slope", fit["slope"]["value"], p + "slope.value")
    m.set(f"{q}.se_slope", fit["slope"]["se"], p + "slope.se")
    m.set(f"{q}.t_slope", math.copysign(math.sqrt(F), fit["slope"]["value"]),
          "derived: sign(slope) * sqrt(" + p + "f_nonzero_slope.F)")
    m.set(f"{q}.p_slope", fit["f_nonzero_slope"]["p"],
          p + "f_nonzero_slope.p (= two-sided t test of the slope)")
    m.set(f"{q}.ss_regression", F * ms_res, "derived: F * ss_res / df")
    m.set(f"{q}.ss_residual", fit["ss_res"], p + "ss_res")
    m.set(f"{q}.residual_ss", fit["ss_res"], p + "ss_res")
    m.set(f"{q}.ms_residual", ms_res, "derived: ss_res / df")
    m.set(f"{q}.F", F, p + "f_nonzero_slope.F")
    m.set(f"{q}.p_F", fit["f_nonzero_slope"]["p"], p + "f_nonzero_slope.p")
    m.set(f"{q}.df_residual", fit["df"], p + "df")
    m.set(f"{q}.df", fit["df"], p + "df")
    m.set(f"{q}.sy_x", fit["sy_x"], p + "sy_x")
    r2 = fit["r_squared"]
    m.set(f"{q}.r_squared", r2, p + "r_squared")
    m.set(f"{q}.adj_r_squared", 1 - (1 - r2) * (n - 1) / fit["df"],
          "derived: 1 - (1 - r_squared)(n - 1)/df")
    m.set(f"{q}.p", fit["f_nonzero_slope"]["p"], p + "f_nonzero_slope.p")


@dataset("r-anscombe")
def map_r_anscombe(entry, rows):
    m = Mapped()
    for i in range(1, 5):
        res = run("linear_regression", xy_data(rows, f"x{i}", [f"y{i}"]))
        _linreg_block(m, f"set{i}", res["datasets"][0]["fit"],
                      f"linear_regression(x{i}, y{i})", 11)
    return m


@dataset("r-cars")
def map_r_cars(entry, rows):
    m = Mapped()
    data = xy_data(rows, "speed", ["dist"])
    tr = run("transform", data, {"func": "ln", "target": "both"})
    res = run("linear_regression", {"x": tr["x"], "datasets": tr["datasets"]})
    _linreg_block(m, "loglog", res["datasets"][0]["fit"],
                  "transform(ln, both) -> linear_regression", len(rows))
    names = {1: "polynomial_first", 2: "polynomial_second",
             3: "polynomial_third", 4: "polynomial_fourth"}
    for k, model in names.items():
        r = run("dose_response", data, {"model": model})
        m.set(f"poly{k}.residual_ss", r["datasets"][0]["fit"]["goodness"]
              ["ss_res"], f"dose_response({model}):datasets[0].fit.goodness"
              ".ss_res")
    m.unmapped("poly2_vs_poly1.*", "different definition: R's sequential "
               "anova() divides by the residual MS of the largest (degree 4) "
               "model; the engine's extra-SS F test uses the larger of the two "
               "compared models")
    return m


def _dr_fit(rows, xname, ynames, options, x=None):
    data = xy_data(rows, xname, ynames)
    if x is not None:
        data["x"] = x
    res = run("dose_response", data, options)
    out = []
    for ds in res["datasets"]:
        if "error" in ds:
            raise EngineError(ds["error"])
        out.append(ds["fit"])
    return out


def _param(m, q, fit, name, label, what="value", scale=None, path_note=""):
    v = fit["params"][name][what]
    if scale is not None and v is not None:
        v = scale(v)
    m.set(q, v, f"{label}:fit.params.{name}.{what}{path_note}")


@dataset("r-puromycin")
def map_r_puromycin(entry, rows):
    m = Mapped()
    sets = {"treated": ["treated_1", "treated_2"],
            "untreated": ["untreated_1", "untreated_2"]}
    for name, cols in sets.items():
        fit = _dr_fit(rows, "conc_ppm", [cols],
                      {"model": "michaelis_menten"})[0]
        lab = f"dose_response(michaelis_menten, {name})"
        for p in ("Vmax", "Km"):
            _param(m, f"{name}.{p}", fit, p, lab)
            _param(m, f"{name}.se_{p}", fit, p, lab, "se")
        m.set(f"{name}.sy_x", fit["goodness"]["sy_x"],
              f"{lab}:fit.goodness.sy_x")
        m.set(f"{name}.df", fit["goodness"]["df"], f"{lab}:fit.goodness.df")
    # R minimises sum((y - yhat)^2 / yhat) directly: weight_source
    # "objective" (Prism's 1/Y weighting is the IRLS fixed point instead)
    fit = _dr_fit(rows, "conc_ppm", [sets["treated"]],
                  {"model": "michaelis_menten", "weighting": "1/Y",
                   "weight_source": "objective"})[0]
    lab = ("dose_response(michaelis_menten, treated, weighting 1/Y, "
           "weight_source objective)")
    q = "treated_weighted_1_over_Yhat"
    for p in ("Vmax", "Km"):
        _param(m, f"{q}.{p}", fit, p, lab)
        _param(m, f"{q}.se_{p}", fit, p, lab, "se")
    m.set(f"{q}.sy_x", fit["goodness"]["sy_x"], f"{lab}:fit.goodness.sy_x")
    return m


@dataset("r-dnase-run1")
def map_r_dnase(entry, rows):
    """SSlogis / SSfpl on x' = ln(conc) are exactly Prism's Boltzmann
    sigmoid (Bottom = A, Top = B, V50 = xmid, Slope = scal); the 3PL fixes
    Bottom = 0. X is ln-transformed with the engine's transform analysis.
    (The manifest's 'log_logistic_4pl_conc' model does not exist.)"""
    m = Mapped()
    data = xy_data(rows, "conc_ng_ml", [["density_1", "density_2"]])
    tr = run("transform", data, {"func": "ln", "target": "x"})
    ldata = {"x": tr["x"], "datasets": data["datasets"]}

    def fit_b(constraints):
        r = run("dose_response", ldata, {"model": "boltzmann_sigmoid",
                                         "constraints": constraints})
        return r["datasets"][0]["fit"]

    lg = fit_b({"Bottom": 0})
    lab = "dose_response(boltzmann_sigmoid on ln X, Bottom=0)"
    for q, p in (("Asym", "Top"), ("xmid", "V50"), ("scal", "Slope")):
        _param(m, f"logis.{q}", lg, p, lab)
        _param(m, f"logis.se_{q}", lg, p, lab, "se")
    for q, k in (("sy_x", "sy_x"), ("df", "df"), ("residual_ss", "ss_res")):
        m.set(f"logis.{q}", lg["goodness"][k], f"{lab}:fit.goodness.{k}")
    fp = fit_b({})
    lab = "dose_response(boltzmann_sigmoid on ln X)"
    for q, p in (("A_bottom", "Bottom"), ("B_top", "Top"), ("xmid", "V50"),
                 ("scal", "Slope")):
        _param(m, f"fpl.{q}", fp, p, lab)
    for q, p in (("se_A", "Bottom"), ("se_B", "Top"), ("se_xmid", "V50"),
                 ("se_scal", "Slope")):
        _param(m, f"fpl.{q}", fp, p, lab, "se")
    for q, k in (("sy_x", "sy_x"), ("df", "df"), ("residual_ss", "ss_res")):
        m.set(f"fpl.{q}", fp["goodness"][k], f"{lab}:fit.goodness.{k}")
    cf = run("compare_fits", ldata, {
        "model_1": {"model": "boltzmann_sigmoid",
                    "constraints": {"Bottom": 0}},
        "model_2": {"model": "boltzmann_sigmoid"}})
    m.set("logis_vs_fpl.F", cf["f_test"]["F"], "compare_fits:f_test.F")
    m.set("logis_vs_fpl.p", cf["f_test"]["p"], "compare_fits:f_test.p")
    gz = run("dose_response", ldata, {
        "user_equation": {"text": "Y = Asym*exp(-b2*b3^X)",
                          "rules": {"Asym": 3.0, "b2": 2.0, "b3": 0.7}}})
    g = gz["datasets"][0]["fit"]
    lab = "dose_response(user 'Y = Asym*exp(-b2*b3^X)' on ln X)"
    for p in ("Asym", "b2", "b3"):
        _param(m, f"gompertz.{p}", g, p, lab)
        _param(m, f"gompertz.se_{p}", g, p, lab, "se")
    m.set("gompertz.sy_x", g["goodness"]["sy_x"], f"{lab}:fit.goodness.sy_x")
    m.set("gompertz.df", g["goodness"]["df"], f"{lab}:fit.goodness.df")
    return m


@dataset("r-loblolly-329")
def map_r_loblolly(entry, rows):
    """SSasymp = exponential plateau: YM = Asym, Y0 = resp0, K = exp(lrc).
    lrc and its SE are the exact Wald re-expression ln K, se(K)/K."""
    m = Mapped()
    fit = _dr_fit(rows, "age_yr", ["height_ft"],
                  {"model": "exponential_plateau"})[0]
    lab = "dose_response(exponential_plateau)"
    _param(m, "Asym", fit, "YM", lab)
    _param(m, "se_Asym", fit, "YM", lab, "se")
    _param(m, "resp0", fit, "Y0", lab)
    _param(m, "se_resp0", fit, "Y0", lab, "se")
    K, seK = fit["params"]["K"]["value"], fit["params"]["K"]["se"]
    m.set("lrc", math.log(K), f"derived: ln({lab}:fit.params.K.value)")
    m.set("se_lrc", seK / K, f"derived: {lab}: K.se / K.value")
    m.set("sy_x", fit["goodness"]["sy_x"], f"{lab}:fit.goodness.sy_x")
    m.set("df", fit["goodness"]["df"], f"{lab}:fit.goodness.df")
    m.set("getInitial.Asym", fit["params"]["YM"]["value"],
          f"{lab}:fit.params.YM.value (R's selfStart value is the LS fit)")
    m.set("getInitial.resp0", fit["params"]["Y0"]["value"],
          f"{lab}:fit.params.Y0.value (R's selfStart value is the LS fit)")
    m.set("getInitial.lrc", math.log(K),
          f"derived: ln K (R's selfStart value is the LS fit)")
    return m


@dataset("r-indometh-1")
def map_r_indometh(entry, rows):
    """SSbiexp entered as a user-defined equation (the built-in two-phase
    decay is parameterised by Y0 / PercentFast, so A1 and A2 would carry no
    SE). Starts are round numbers, not R's selfStart values."""
    m = Mapped()
    res = run("dose_response", xy_data(rows, "time_hr", ["conc_mcg_ml"]), {
        "user_equation": {
            "text": "Y = A1*exp(-exp(lrc1)*X) + A2*exp(-exp(lrc2)*X)",
            "rules": {"A1": 1.0, "lrc1": 0.0, "A2": 0.1, "lrc2": -2.0}}})
    fit = res["datasets"][0]["fit"]
    lab = "dose_response(user SSbiexp)"
    for p in ("A1", "lrc1", "A2", "lrc2"):
        _param(m, p, fit, p, lab)
        _param(m, f"se_{p}", fit, p, lab, "se")
        _param(m, f"{p}_7digits", fit, p, lab)
    m.set("sy_x", fit["goodness"]["sy_x"], f"{lab}:fit.goodness.sy_x")
    m.set("df", fit["goodness"]["df"], f"{lab}:fit.goodness.df")
    return m


@dataset("r-chickweight-chick1")
def map_r_chickweight(entry, rows):
    m = Mapped()
    fit = _dr_fit(rows, "time_days", ["weight_g"],
                  {"model": "boltzmann_sigmoid"})[0]
    lab = "dose_response(boltzmann_sigmoid)"
    for q, p in (("A_bottom", "Bottom"), ("B_top", "Top"),
                 ("xmid_V50", "V50"), ("scal_slope", "Slope")):
        _param(m, q, fit, p, lab)
    for q, p in (("se_A", "Bottom"), ("se_B", "Top"), ("se_xmid", "V50"),
                 ("se_scal", "Slope")):
        _param(m, q, fit, p, lab, "se")
    m.set("sy_x", fit["goodness"]["sy_x"], f"{lab}:fit.goodness.sy_x")
    m.set("df", fit["goodness"]["df"], f"{lab}:fit.goodness.df")
    for q, p in (("A", "Bottom"), ("B", "Top"), ("xmid", "V50"),
                 ("scal", "Slope")):
        _param(m, f"getInitial.{q}", fit, p, lab,
               path_note=" (R's selfStart value is the LS fit)")
    return m


@dataset("r-infert")
def map_r_infert(entry, rows):
    m = Mapped()
    v = {"variables": [
        {"name": "case", "values": [num(r["case"]) for r in rows]},
        {"name": "spontaneous", "values": column(rows, "spontaneous")},
        {"name": "induced", "values": column(rows, "induced")},
        {"name": "age", "values": column(rows, "age")},
        {"name": "parity", "values": column(rows, "parity")},
        {"name": "education", "values": [r["education"] for r in rows],
         "kind": "categorical"}]}
    for mk, preds in (("m1", ["spontaneous", "induced"]),
                      ("m2", ["age", "parity", "education", "spontaneous",
                              "induced"])):
        res = run("logistic_regression", v, {
            "outcome": "case", "predictors": preds,
            "reference_levels": {"education": "0-5yrs"},
            "ci_method": "wald"})
        lab = f"logistic_regression({mk})"
        coefs = {c["name"]: c for c in res["coefficients"]}
        alias = {"intercept": "Intercept"}
        for nm in coefs:
            if nm.startswith("education"):
                lvl = nm.split("education", 1)[1].strip(" :[]=")
                key = ("education_6_11" if lvl.startswith("6")
                       else "education_12plus")
                alias[key] = nm
        for p in preds:
            if p != "education":
                alias[p] = p
        for key, nm in alias.items():
            c = coefs[nm]
            qb = f"{mk}.intercept" if key == "intercept" else f"{mk}.b_{key}"
            m.set(qb, c["estimate"], f"{lab}:coefficients[name={nm}].estimate")
            m.set(f"{mk}.se_{key}", c["se"],
                  f"{lab}:coefficients[name={nm}].se")
            m.set(f"{mk}.z_{key}", math.copysign(c["z"], c["estimate"]),
                  f"derived: sign(estimate) * {lab}:coefficients[name={nm}].z")
            m.set(f"{mk}.p_{key}", c["p"], f"{lab}:coefficients[name={nm}].p")
        m.set(f"{mk}.null_deviance", res["null_deviance"], f"{lab}:null_deviance")
        m.set(f"{mk}.residual_deviance", res["deviance"], f"{lab}:deviance")
        m.set(f"{mk}.null_df", res["model_comparison"]["intercept_only"]["df"],
              f"{lab}:model_comparison.intercept_only.df")
        m.set(f"{mk}.residual_df", res["model_comparison"]["selected"]["df"],
              f"{lab}:model_comparison.selected.df")
        m.set(f"{mk}.AIC", res["model_comparison"]["selected"]["aic"],
              f"{lab}:model_comparison.selected.aic")
    return m


def _pca_block(m, res, label):
    """sdev = sqrt(eigenvalue) and the proportion of variance per PC."""
    for j, ev in enumerate(res["eigenvalues"]):
        m.set(f"pc{j + 1}.sdev", math.sqrt(ev),
              f"derived: sqrt({label}:eigenvalues[{j}])")
        m.set(f"pc{j + 1}.proportion_of_variance",
              res["proportion_of_variance"][j],
              f"{label}:proportion_of_variance[{j}]")


@dataset("r-usarrests")
def map_r_usarrests(entry, rows):
    m = Mapped()
    names = ["Murder", "Assault", "UrbanPop", "Rape"]
    v = {"variables": [{"name": k, "values": column(rows, k)} for k in names]}
    res = run("pca", v, {"standardize": True, "selection": "all"})
    _pca_block(m, res, "pca(standardize)")
    ref = {r["quantity"]: r["value"] for r in entry["reference"]}
    ev = res["eigenvectors"]   # rows = variables, columns = PCs
    for j in range(4):
        # orient PC j like the reference (sign of its Murder loading)
        rq = f"loading[Murder,PC{j + 1}]"
        sign = 1.0 if (ev[0][j] >= 0) == (ref[rq] >= 0) else -1.0
        for i, nm in enumerate(names):
            m.set(f"loading[{nm},PC{j + 1}]", sign * ev[i][j],
                  f"pca(standardize):eigenvectors[{i}][{j}]"
                  + (" * -1 (component sign aligned with R)"
                     if sign < 0 else ""))
    cov = run("pca", v, {"standardize": False, "selection": "all"})
    n = cov["n_rows_analyzed"]
    for j, e in enumerate(cov["eigenvalues"]):
        m.set(f"covariance_pca.pc{j + 1}.sdev_divisor_n",
              math.sqrt(e * (n - 1) / n),
              f"derived: sqrt(pca(covariance):eigenvalues[{j}] * (n-1)/n)")
    return m


@dataset("r-iris")
def map_r_iris(entry, rows):
    m = Mapped()
    names = entry["layout"]["variables"]
    v = {"variables": [{"name": k, "values": column(rows, k)} for k in names]}
    res = run("pca", v, {"standardize": False, "selection": "all"})
    _pca_block(m, res, "pca(covariance)")
    return m


@dataset("growthcurver-a1")
def map_growthcurver(entry, rows):
    """Growthcurver subtracts the minimum OD, then fits the logistic
    K / (1 + ((K - N0)/N0) exp(-r t)) == Prism's logistic growth (YM = K,
    Y0 = N0, K = r). t_mid, t_gen and auc_l are closed-form functions of
    the fitted parameters; auc_e is the engine's trapezoid AUC."""
    m = Mapped()
    t = column(rows, "time_h")
    od = column(rows, "OD_A1")
    lo = min(od)
    y = [v - lo for v in od]
    data = {"x": t, "datasets": [{"name": "A1", "ys": [[v] for v in y]}]}
    res = run("dose_response", data, {"model": "logistic_growth"})
    fit = res["datasets"][0]["fit"]
    lab = "dose_response(logistic_growth, min-subtracted OD)"
    for q, p in (("k", "YM"), ("n0", "Y0"), ("r", "K")):
        _param(m, q, fit, p, lab)
        _param(m, f"{q}_se", fit, p, lab, "se")
    m.set("sigma", fit["goodness"]["sy_x"], f"{lab}:fit.goodness.sy_x")
    m.set("df", fit["goodness"]["df"], f"{lab}:fit.goodness.df")
    K = fit["params"]["YM"]["value"]
    N0 = fit["params"]["Y0"]["value"]
    r = fit["params"]["K"]["value"]
    m.set("t_mid", math.log((K - N0) / N0) / r,
          "derived: ln((YM - Y0)/Y0) / K")
    m.set("t_gen", math.log(2) / r, "derived: ln 2 / K")
    # integral of K/(1 + a e^{-rt}) dt from 0 to 24 (closed form)
    a = (K - N0) / N0
    auc_l = K / r * (math.log(math.exp(r * 24) + a) - math.log(1 + a))
    m.set("auc_l", auc_l, "derived: closed-form integral of the fitted "
          "logistic over 0-24 h")
    keep = [i for i, tt in enumerate(t) if tt <= 24 + 1e-9]
    au = run("auc", {"x": [t[i] for i in keep],
                     "datasets": [{"name": "A1", "ys": [[y[i]] for i in keep]}]},
             {"baseline": "zero"})
    m.set("auc_e", au["datasets"][0]["total_area"],
          "auc(baseline 0, 0-24 h):datasets[0].total_area")
    return m

# ============================================================ survival

def _surv_groups(rows, tcol, ecol, gcol=None, order=None, keep=None):
    groups = {}
    for r in rows:
        if keep is not None and not keep(r):
            continue
        t, e = num(r[tcol]), num(r[ecol])
        if t is None or e is None:
            continue
        g = r[gcol] if gcol else "overall"
        groups.setdefault(g, []).append([t, int(e)])
    names = order or list(groups)
    return {"datasets": [{"name": str(n), "ys": groups[n]} for n in names]}


def _km_at(curve, t, key="survival"):
    """KM estimate (or its Greenwood SE, key="se") at time t
    (right-continuous step function)."""
    s = 1.0 if key == "survival" else 0.0
    for p in curve["points"]:
        if p["time"] <= t + 1e-9:
            s = p[key]
    return s


def _km_se_refs(m, entry, curve, label, group):
    """Map '<group>.se_survival[t=..]' quantities to the Greenwood SE."""
    for ref in entry["reference"]:
        mt = re.match(rf"{re.escape(group)}\.se_survival\[t=(\d+)\]",
                      ref["quantity"])
        if mt:
            t = float(mt.group(1))
            m.set(ref["quantity"], _km_at(curve, t, "se"),
                  f"{label}:curves.{group}.points[time<={t:g}].se")


def _cox_block(m, q, res, label, coef_names=None):
    coefs = {c["name"]: c for c in res["coefficients"]}
    for key, nm in (coef_names or {}).items():
        c = coefs[nm]
        base = f"{q}.{key}." if key else f"{q}."
        p = f"{label}:coefficients[name={nm}]"
        m.set(base + "coef", c["coef"], p + ".coef")
        m.set(base + "se", c["se"], p + ".se")
        m.set(base + "se_coef", c["se"], p + ".se")
        m.set(base + "p", c["p"], p + ".p")
        m.set(base + "z", c["z"], p + ".z")
        m.set(base + "hazard_ratio", c["hazard_ratio"], p + ".hazard_ratio")
        m.set(base + "hr_ci_lower", c["hazard_ratio_ci"][0],
              p + ".hazard_ratio_ci[0]")
        m.set(base + "hr_ci_upper", c["hazard_ratio_ci"][1],
              p + ".hazard_ratio_ci[1]")
        m.set(base + f"coef_{nm}", c["coef"], p + ".coef")
    t = res["tests"]
    m.set(f"{q}.lr_chi2", t["likelihood_ratio"]["chi2"],
          f"{label}:tests.likelihood_ratio.chi2")
    m.set(f"{q}.wald_chi2", t["wald"]["chi2"], f"{label}:tests.wald.chi2")
    m.set(f"{q}.score_chi2", t["score"]["chi2"], f"{label}:tests.score.chi2")
    m.set(f"{q}.n_used", res["n"], f"{label}:n")
    m.set(f"{q}.events_used", res["n_events"], f"{label}:n_events")


@dataset("surv-aml")
def map_surv_aml(entry, rows):
    m = Mapped()
    order = ["Maintained", "Nonmaintained"]
    data = _surv_groups(rows, "time_weeks", "status", "group", order)
    res = run("survival", data)
    for i, g in enumerate(order):
        c = res["curves"][g]
        m.set(f"{g}.median", c["median_survival"],
              f"survival:curves.{g}.median_survival")
        for ref in entry["reference"]:
            mt = re.match(rf"{g}\.survival\[t=(\d+)\]", ref["quantity"])
            if mt:
                t = float(mt.group(1))
                m.set(ref["quantity"], _km_at(c, t),
                      f"survival:curves.{g}.points[time<={t:g}].survival")
        m.set(f"{g}.observed", res["logrank"]["observed"][i],
              f"survival:logrank.observed[{i}]")
        m.set(f"{g}.expected", res["logrank"]["expected"][i],
              f"survival:logrank.expected[{i}]")
        # R's survfit median CI uses its default log band
        m.set(f"{g}.median_ci_lower", c["median_ci_log"]["lower"],
              f"survival:curves.{g}.median_ci_log.lower")
        _km_se_refs(m, entry, c, "survival", g)
    lr = res["logrank"]
    # R's survdiff reports the variance (Mantel-Haenszel) form; the Peto
    # form Prism reports is logrank.chi2
    m.set("logrank_chi2", lr["chi2_variance"],
          "survival:logrank.chi2_variance (variance form, R survdiff)")
    m.set("logrank_df", lr["df"], "survival:logrank.df")
    m.set("logrank_p", lr["p_variance"], "survival:logrank.p_variance")
    t = [num(r["time_weeks"]) for r in rows]
    e = [int(num(r["status"])) for r in rows]
    g = [1.0 if r["group"] == "Nonmaintained" else 0.0 for r in rows]
    for ties in ("efron", "breslow"):
        cx = run("cox", {"time": t, "event": e,
                         "covariates": {"Nonmaintained": g}}, {"ties": ties})
        _cox_block(m, f"cox_{ties}", cx, f"cox({ties})",
                   {"": "Nonmaintained"})
    return m


@dataset("surv-ovarian")
def map_surv_ovarian(entry, rows):
    m = Mapped()
    data = _surv_groups(rows, "futime_days", "fustat")
    res = run("survival", data)
    c = res["curves"]["overall"]
    for ref in entry["reference"]:
        mt = re.match(r"overall\.survival\[t=(\d+)\]", ref["quantity"])
        if mt:
            tt = float(mt.group(1))
            m.set(ref["quantity"], _km_at(c, tt),
                  f"survival:curves.overall.points[time<={tt:g}].survival")
    _km_se_refs(m, entry, c, "survival", "overall")
    t = column(rows, "futime_days")
    e = [int(v) for v in column(rows, "fustat")]
    for cov in ("age", "resid_ds", "rx", "ecog_ps"):
        cx = run("cox", {"time": t, "event": e,
                         "covariates": {cov: column(rows, cov)}},
                 {"ties": "efron"})
        _cox_block(m, f"cox_{cov}", cx, f"cox(efron, {cov})", {"": cov})
    covs = ["resid_ds", "rx", "ecog_ps"]
    cx = run("cox", {"time": t, "event": e,
                     "covariates": {k: column(rows, k) for k in covs}},
             {"ties": "efron"})
    _cox_block(m, "cox_multi", cx, "cox(efron, resid_ds + rx + ecog_ps)",
               {k: k for k in covs})
    return m


@dataset("surv-lung")
def map_surv_lung(entry, rows):
    m = Mapped()
    data = _surv_groups(rows, "time_days", "event", "sex", ["1", "2"])
    res = run("survival", data)
    for i, s in enumerate(("1", "2")):
        c = res["curves"][s]
        m.set(f"n.sex{s}", c["n"], f"survival:curves.{s}.n")
        m.set(f"observed.sex{s}", res["logrank"]["observed"][i],
              f"survival:logrank.observed[{i}]")
        m.set(f"expected.sex{s}", res["logrank"]["expected"][i],
              f"survival:logrank.expected[{i}]")
        m.set(f"median.sex{s}", c["median_survival"],
              f"survival:curves.{s}.median_survival")
    lr = res["logrank"]
    m.set("logrank_chi2", lr["chi2_variance"],
          "survival:logrank.chi2_variance (variance form, R survdiff)")
    m.set("logrank_df", lr["df"], "survival:logrank.df")
    m.set("logrank_p", lr["p_variance"], "survival:logrank.p_variance")
    for i, s in enumerate(("1", "2")):
        ci = res["curves"][s]["median_ci_log"]
        m.set(f"median_ci_lower.sex{s}", ci["lower"],
              f"survival:curves.{s}.median_ci_log.lower")
        m.set(f"median_ci_upper.sex{s}", ci["upper"],
              f"survival:curves.{s}.median_ci_log.upper")
    allc = run("survival", _surv_groups(rows, "time_days", "event"))
    c = allc["curves"]["overall"]
    m.set("median.all", c["median_survival"],
          "survival(all):curves.overall.median_survival")
    m.set("survival_1yr.all", _km_at(c, 365),
          "survival(all):curves.overall.points[time<=365].survival")
    m.set("se_survival_1yr.all", _km_at(c, 365, "se"),
          "survival(all):curves.overall.points[time<=365].se")
    for side in ("lower", "upper"):
        m.set(f"median_ci_{side}.all", c["median_ci_log"][side],
              f"survival(all):curves.overall.median_ci_log.{side}")
    for s in ("1", "2"):
        for ecog in ("0", "1", "2"):
            sub = run("survival", _surv_groups(
                rows, "time_days", "event",
                keep=lambda r: r["sex"] == s and r["ph_ecog"] == ecog))
            m.set(f"median.sex{s}_ecog{ecog}",
                  sub["curves"]["overall"]["median_survival"],
                  f"survival(sex={s}, ph_ecog={ecog}):curves.overall"
                  ".median_survival")
            for side in ("lower", "upper"):
                m.set(f"median_ci_{side}.sex{s}_ecog{ecog}",
                      sub["curves"]["overall"]["median_ci_log"][side],
                      f"survival(sex={s}, ph_ecog={ecog}):curves.overall"
                      f".median_ci_log.{side}")
    t = column(rows, "time_days")
    e = [int(v) for v in column(rows, "event")]
    cx = run("cox", {"time": t, "event": e,
                     "covariates": {"sex": column(rows, "sex")}},
             {"ties": "efron"})
    _cox_block(m, "cox_sex", cx, "cox(efron, sex)", {"": "sex"})
    cx = run("cox", {"time": t, "event": e, "covariates": {
        k: column(rows, k) for k in ("age", "sex", "wt_loss")}},
        {"ties": "efron"})
    _cox_block(m, "cox3", cx, "cox(efron, age + sex + wt_loss)",
               {k: k for k in ("age", "sex", "wt_loss")})
    return m


# ============================================================ ROC

@dataset("roc-asah")
def map_roc_asah(entry, rows):
    m = Mapped()

    def col(name, outcome):
        return [[num(r[name])] for r in rows if r["outcome"] == outcome]

    def cols(name):
        return {"datasets": [{"name": f"{name} Poor", "ys": col(name, "Poor")},
                             {"name": f"{name} Good", "ys": col(name, "Good")}]}

    for mk in ("wfns", "s100b", "ndka"):
        r = run("roc", cols(mk))
        m.set(f"auc.{mk}", r["auc"]["value"], f"roc({mk}):auc.value")
        m.set(f"auc_ci_delong.{mk}.lower", r["auc"]["ci"][0],
              f"roc({mk}):auc.ci[0] (DeLong)")
        m.set(f"auc_ci_delong.{mk}.upper", r["auc"]["ci"][1],
              f"roc({mk}):auc.ci[1] (DeLong)")
        pa = run("roc_cutoff", cols(mk), {
            "partial_auc": {"limits": [1.0, 0.9], "focus": "specificity"}})
        m.set(f"pauc_sp90_100.{mk}", pa["partial_auc"]["partial_auc"],
              f"roc_cutoff({mk}, partial 90-100% spec):partial_auc"
              ".partial_auc")
        m.set(f"paper.pauc_sp90_100_percent.{mk}",
              100 * pa["partial_auc"]["partial_auc"],
              f"derived: 100 * roc_cutoff({mk}):partial_auc.partial_auc")
        pc = run("roc_cutoff", cols(mk), {
            "partial_auc": {"limits": [1.0, 0.9], "focus": "specificity",
                            "correct": True}})
        if pc["partial_auc"].get("corrected") is not None:
            m.set(f"paper.pauc_mcclish_standardized_percent.{mk}",
                  100 * pc["partial_auc"]["corrected"],
                  f"derived: 100 * roc_cutoff({mk}, McClish):partial_auc"
                  ".corrected")
    # paired DeLong: all four columns aligned by subject
    def paired(a, b):
        data = {"datasets": [
            {"name": f"{a} Poor", "ys": col(a, "Poor")},
            {"name": f"{a} Good", "ys": col(a, "Good")},
            {"name": f"{b} Poor", "ys": col(b, "Poor")},
            {"name": f"{b} Good", "ys": col(b, "Good")}]}
        return data

    for a, b in (("wfns", "s100b"), ("wfns", "ndka"), ("ndka", "s100b")):
        r = run("roc_compare", paired(a, b), {"paired": True})
        q = f"delong_paired.{a}_vs_{b}"
        m.set(f"{q}.Z", r["statistic"],
              f"roc_compare(paired, {a} vs {b}):statistic ({r['statistic_name']})")
        m.set(f"{q}.p", r["p"], f"roc_compare(paired, {a} vs {b}):p")
    r = run("roc_compare", paired("wfns", "s100b"), {"paired": False})
    m.set("delong_unpaired.wfns_vs_s100b.D", r["statistic"],
          f"roc_compare(unpaired):statistic ({r['statistic_name']})")
    m.set("delong_unpaired.wfns_vs_s100b.p", r["p"], "roc_compare(unpaired):p")
    return m


# ============================================================ drc

@dataset("drc-ryegrass")
def map_drc_ryegrass(entry, rows):
    """drc LL.3 = Prism's 'inhibitor vs response -- variable slope' on the
    concentration scale with Bottom = 0: Top = d, IC50 = e, HillSlope = -b.
    ED5 / ED10 (relative) are fitted directly as ECanything with F = 95 / 90
    (5 / 10 % of the way down from Top to Bottom = 0)."""
    m = Mapped()
    reps = [f"rootl_{i}" for i in range(1, 7)]
    data = xy_data(rows, "conc_mM", [reps])
    r = run("dose_response", data, {"model": "inhibitor_vs_response_variable",
                                    "constraints": {"Bottom": 0}})
    fit = r["datasets"][0]["fit"]
    lab = "dose_response(inhibitor_vs_response_variable, Bottom=0)"
    _param(m, "b", fit, "HillSlope", lab, scale=lambda v: -v,
           path_note=" * -1")
    _param(m, "se_b", fit, "HillSlope", lab, "se")
    _param(m, "d_top", fit, "Top", lab)
    _param(m, "se_d", fit, "Top", lab, "se")
    _param(m, "e_ED50", fit, "IC50", lab)
    _param(m, "se_e", fit, "IC50", lab, "se")
    m.set("ED50_ci_lower_delta", fit["params"]["IC50"]["ci95"][0],
          f"{lab}:fit.params.IC50.ci95[0]")
    m.set("ED50_ci_upper_delta", fit["params"]["IC50"]["ci95"][1],
          f"{lab}:fit.params.IC50.ci95[1]")
    m.set("residual_se", fit["goodness"]["sy_x"], f"{lab}:fit.goodness.sy_x")
    m.set("df", fit["goodness"]["df"], f"{lab}:fit.goodness.df")
    for ed, F in ((5, 95), (10, 90)):
        r = run("dose_response", data, {
            "model": "agonist_vs_response_ecanything",
            "constraints": {"Bottom": 0, "F": F}})
        f2 = r["datasets"][0]["fit"]
        lab2 = f"dose_response(agonist_vs_response_ecanything, Bottom=0, F={F})"
        _param(m, f"ED{ed}", f2, "ECF", lab2)
        _param(m, f"se_ED{ed}", f2, "ECF", lab2, "se")
        m.set(f"ED{ed}_ci_lower", f2["params"]["ECF"]["ci95"][0],
              f"{lab2}:fit.params.ECF.ci95[0]")
        m.set(f"ED{ed}_ci_upper", f2["params"]["ECF"]["ci95"][1],
              f"{lab2}:fit.params.ECF.ci95[1]")
    m.unmapped("sandwich_*", "not implemented: robust (sandwich) standard "
               "errors")
    return m


@dataset("drc-s-alba")
def map_drc_s_alba(entry, rows):
    """Global fit of the concentration-scale 4PL (inhibitor vs response,
    variable slope) sharing Bottom (c) and Top (d)."""
    m = Mapped()
    herbs = ["Bentazone", "Glyphosate"]
    reps = [c for c in rows[0] if c.startswith("drymatter_")]
    doses = sorted({num(r["dose_g_ha"]) for r in rows})
    datasets = []
    for h in herbs:
        by = {num(r["dose_g_ha"]): [num(r[c]) for c in reps]
              for r in rows if r["herbicide"] == h}
        datasets.append({"name": h, "ys": [by.get(d, []) for d in doses]})
    data = {"x": doses, "datasets": datasets}
    model = "inhibitor_vs_response_variable"
    g = run("global_model_fit", data, {"model": model,
                                       "shared": ["Bottom", "Top"]})
    lab = "global_model_fit(inhibitor_vs_response_variable, shared Bottom, Top)"
    m.note("global_model_fit keys: " + ", ".join(sorted(g)))
    _map_global_s_alba(m, g, lab, herbs)
    one = run("global_model_fit", data, {
        "model": model, "shared": ["Bottom", "Top", "IC50", "HillSlope"]})
    m.set("one_curve.rss", _global_ss(one),
          "global_model_fit(all shared):goodness.ss_res")
    m.set("one_curve.df", _global_df(one), "global_model_fit(all shared):"
          "goodness.df")
    ss1, df1 = _global_ss(one), _global_df(one)
    ss2, df2 = _global_ss(g), _global_df(g)
    m.set("F", ((ss1 - ss2) / (df1 - df2)) / (ss2 / df2),
          "derived: extra-SS F from the two global fits' ss_res and df")
    return m


def _global_ss(g):
    return g["goodness"]["ss_res"]


def _global_df(g):
    return g["goodness"]["df"]


def _map_global_s_alba(m, g, lab, herbs):
    by = {d["name"]: d for d in g["datasets"]}
    for h in herbs:
        p = by[h]["params"]
        m.set(f"b_{h}", -p["HillSlope"]["value"],
              f"{lab}:datasets[name={h}].params.HillSlope.value * -1")
        m.set(f"se_b_{h}", p["HillSlope"]["se"],
              f"{lab}:datasets[name={h}].params.HillSlope.se")
        m.set(f"e_ED50_{h}", p["IC50"]["value"],
              f"{lab}:datasets[name={h}].params.IC50.value")
        m.set(f"se_e_{h}", p["IC50"]["se"],
              f"{lab}:datasets[name={h}].params.IC50.se")
    p = by[herbs[0]]["params"]
    m.set("c_bottom_shared", p["Bottom"]["value"],
          f"{lab}:datasets[0].params.Bottom.value")
    m.set("se_c", p["Bottom"]["se"], f"{lab}:datasets[0].params.Bottom.se")
    m.set("d_top_shared", p["Top"]["value"],
          f"{lab}:datasets[0].params.Top.value")
    m.set("se_d", p["Top"]["se"], f"{lab}:datasets[0].params.Top.se")
    m.set("residual_se", g["goodness"]["sy_x"], f"{lab}:goodness.sy_x")
    m.set("df", g["goodness"]["df"], f"{lab}:goodness.df")
    m.set("global.rss", g["goodness"]["ss_res"], f"{lab}:goodness.ss_res")
    eb = by["Bentazone"]["params"]["IC50"]["value"]
    eg = by["Glyphosate"]["params"]["IC50"]["value"]
    m.set("relative_potency_ED50_Bentazone_over_Glyphosate", eb / eg,
          "derived: IC50 Bentazone / IC50 Glyphosate")
    bb = -by["Bentazone"]["params"]["HillSlope"]["value"]
    bg = -by["Glyphosate"]["params"]["HillSlope"]["value"]
    m.set("slope_difference", bb - bg, "derived: b Bentazone - b Glyphosate")
    cv = g["covariance"]
    idx = {(q["name"], q["dataset"]): i for i, q in enumerate(cv["parameters"])}
    i1, i2 = idx[("HillSlope", "Bentazone")], idx[("HillSlope", "Glyphosate")]
    C = cv["matrix"]
    m.set("slope_difference_se",
          math.sqrt(C[i1][i1] + C[i2][i2] - 2 * C[i1][i2]),
          f"derived: sqrt(var + var - 2 cov) of the two HillSlopes from "
          f"{lab}:covariance")


@dataset("drc-earthworms")
def map_drc_earthworms(entry, rows):
    """drc LL.3 (binomial): logit link on ln(dose) with an upper asymptote
    d (estimated in m1, fixed at 0.5 in m2); drc's b = -slope, e = the
    dose at which F = 1/2. SEs from the observed information, as drc
    (inverse Hessian); heterogeneity 'never'."""
    m = Mapped()
    data = {"dose": column(rows, "dose"), "n": column(rows, "total"),
            "responders": column(rows, "number")}
    for q, upper in (("m1", "estimate"), ("m2", 0.5)):
        res = run("quantal", data, {"link": "logit", "dose_transform": "ln",
                                    "upper_asymptote": upper,
                                    "information": "observed",
                                    "heterogeneity": "never"})
        lab = f"quantal(logit, ln dose, upper_asymptote={upper})"
        P, ec = res["parameters"], res["ec"][0]
        bq = "m2_d_fixed_0.5.b" if q == "m2" else "m1.b"
        m.set(bq, -P["slope"]["value"], f"derived: -{lab}:parameters.slope")
        m.set(f"{q}.se_b", P["slope"]["se"], f"{lab}:parameters.slope.se")
        m.set(f"{q}.e_ED50", ec["dose"], f"{lab}:ec[0].dose")
        m.set(f"{q}.se_e", ec["dose"] * ec["se_x"],
              f"derived: dose * se_x (delta method) from {lab}:ec[0]")
        if q == "m1":
            m.set("m1.d", P["upper_asymptote"]["value"],
                  f"{lab}:parameters.upper_asymptote.value")
            m.set("m1.se_d", P["upper_asymptote"]["se"],
                  f"{lab}:parameters.upper_asymptote.se")
    return m


@dataset("drc-selenium")
def map_drc_selenium(entry, rows):
    """drc LL.2 (binomial) = logit link on ln(dose). The dose-0 rows are
    dropped: LL.2 forces p(0) = 0, which the quantal analysis cannot take
    with responders > 0 at dose 0 (and drc's estimates are reproduced
    without them). heterogeneity 'never': drc does not rescale SEs."""
    m = Mapped()
    for typ in ("1", "2", "3", "4"):
        sub = [r for r in rows if r["type"] == typ and num(r["conc"]) > 0]
        res = run("quantal", {"dose": [num(r["conc"]) for r in sub],
                              "n": [num(r["total"]) for r in sub],
                              "responders": [num(r["dead"]) for r in sub]},
                  {"link": "logit", "dose_transform": "ln",
                   "heterogeneity": "never"})
        ec = res["ec"][0]
        lab = f"quantal(logit, ln dose, type {typ})"
        m.set(f"type{typ}.ED50", ec["dose"], f"{lab}:ec[0].dose")
        se_d = ec["dose"] * ec["se_x"]
        m.set(f"type{typ}.se_ED50", se_d,
              f"derived: dose * se_x (delta method on the dose scale) from "
              f"{lab}:ec[0]")
        # drc's interval: symmetric on the dose scale, ED50 +/- z SE
        z = 1.959963984540054
        m.set(f"type{typ}.ED50_ci_lower", ec["dose"] - z * se_d,
              f"derived: dose - z(0.975) * dose * se_x from {lab}:ec[0] "
              "(drc's symmetric dose-scale delta interval)")
        m.set(f"type{typ}.ED50_ci_upper", ec["dose"] + z * se_d,
              f"derived: dose + z(0.975) * dose * se_x from {lab}:ec[0] "
              "(drc's symmetric dose-scale delta interval)")
    m.unmapped("*loglik", "no option: a common-ED50 model is not available "
               "(the parallel analysis tests a common slope), and the "
               "engine's log-likelihood includes the binomial coefficients")
    m.unmapped("LR*", "no option: likelihood-ratio test of a common ED50 "
               "across groups")
    return m


# ============================================================ Deming

@dataset("deming-arsenate")
def map_deming(entry, rows):
    m = Mapped()
    data = xy_data(rows, "aes", ["aas"])
    d = run("deming", data, {"equal_errors": True})
    fit = d["datasets"][0]["fit"]
    m.set("unweighted_deming.intercept", fit["y_intercept"]["value"],
          "deming(equal errors):datasets[0].fit.y_intercept.value")
    m.set("unweighted_deming.slope", fit["slope"]["value"],
          "deming(equal errors):datasets[0].fit.slope.value")
    ols = run("linear_regression", data)["datasets"][0]["fit"]
    m.set("ols.intercept", ols["y_intercept"]["value"],
          "linear_regression:datasets[0].fit.y_intercept.value")
    m.set("ols.slope", ols["slope"]["value"],
          "linear_regression:datasets[0].fit.slope.value")
    m.unmapped("weighted_deming.*", "not implemented: Deming regression "
               "with per-point standard deviations (Prism's Deming takes one "
               "SD per axis)")
    return m


# ============================================================ synergy

@dataset("synergy-mathews-block1")
def map_synergy(entry, rows):
    m = Mapped()
    hdr = list(rows[0].keys())
    c2 = [float(v) for v in hdr[1:]]
    c1 = [num(r[hdr[0]]) for r in rows]
    resp = [[num(r[c]) for c in hdr[1:]] for r in rows]
    res = run("synergy", {"conc1": c1, "conc2": c2, "responses": resp},
              {"response_kind": "viability"})
    i1 = {round(v, 4): i for i, v in enumerate(res["conc1"])}
    i2 = {round(v, 4): i for i, v in enumerate(res["conc2"])}
    keys = {"HSA_ref": ("hsa", "reference"), "HSA_synergy": ("hsa", "synergy"),
            "Bliss_ref": ("bliss", "reference"),
            "Bliss_synergy": ("bliss", "synergy"),
            "ZIP_ref": ("zip", "reference"), "ZIP_synergy": ("zip", "synergy"),
            "ZIP_fit": ("zip", "fitted"),
            "Loewe_ref": ("loewe", "reference"),
            "Loewe_synergy": ("loewe", "synergy")}
    for ref in entry["reference"]:
        mt = re.match(r"(\w+)\[ispinesib=([\d.]+),ibrutinib=([\d.]+)\]",
                      ref["quantity"])
        if not mt:
            continue
        model, what = keys[mt.group(1)]
        a, b = float(mt.group(2)), float(mt.group(3))
        i, j = i1[round(a, 4)], i2[round(b, 4)]
        m.set(ref["quantity"], res["models"][model][what][i][j],
              f"synergy:models.{model}.{what}[{i}][{j}]")
    m.set("ic50_ibrutinib", res["monotherapy"]["drug2"]["params"]["EC50"],
          "synergy:monotherapy.drug2.params.EC50")
    m.unmapped("ri_*", "not implemented: relative inhibition (RI)")
    m.unmapped("css", "not implemented: combination sensitivity score (CSS)")
    return m


# ============================================================ power

@dataset("power-r-examples")
def map_power_r(entry, rows):
    m = Mapped()

    def P(opts):
        return run("power", {}, opts)

    r = P({"kind": "t_two_sample", "solve": "power", "d": 1.0, "n1": 20,
           "n2": 20, "alpha": 0.05, "tails": 2})
    m.set("r_t_power.power", r["power"], "power(t_two_sample, power):power")
    r = P({"kind": "t_two_sample", "solve": "n", "d": 1.0, "power": 0.9,
           "alpha": 0.05, "tails": 2})
    m.set("r_t_n.n_per_group", r["n1_exact"], "power(t_two_sample, n):n1_exact")
    r = P({"kind": "t_two_sample", "solve": "n", "d": 1.0, "power": 0.9,
           "alpha": 0.05, "tails": 1})
    m.set("r_t_n_onesided.n_per_group", r["n1_exact"],
          "power(t_two_sample, n, one tail):n1_exact")
    r = P({"kind": "two_proportions", "solve": "power", "p1": 0.5, "p2": 0.75,
           "n1": 50, "n2": 50, "method": "z"})
    m.set("r_prop_power.power", r["power"], "power(two_proportions z):power")
    r = P({"kind": "two_proportions", "solve": "n", "p1": 0.5, "p2": 0.75,
           "power": 0.9, "method": "z"})
    m.set("r_prop_n.n_per_group", r["n1_exact"],
          "power(two_proportions z, n):n1_exact")
    r = P({"kind": "two_proportions", "solve": "effect", "p1": 0.5,
           "n1": 50, "n2": 50, "power": 0.9, "method": "z"})
    m.set("r_prop_p2.p2", r["effect"]["value"],
          "power(two_proportions z, effect):effect.value")
    r = P({"kind": "two_proportions", "solve": "n", "p1": 0.9, "p2": 1.0,
           "power": 0.8, "method": "z"})
    m.set("r_prop_n_p2_1.n_per_group", r["n1_exact"],
          "power(two_proportions z, n):n1_exact")
    # R: f^2 = between_var (groups-1)/groups / within_var
    f = math.sqrt(1 * 3 / 4 / 3)
    r = P({"kind": "anova_oneway", "solve": "power", "f": f, "k": 4, "n": 5})
    m.set("r_anova_power.power", r["power"], "power(anova_oneway):power "
          "(f from R's between/within variances)")
    r = P({"kind": "anova_oneway", "solve": "n", "f": f, "k": 4,
           "power": 0.8})
    m.set("r_anova_n.n_per_group", r["n_total_exact"] / 4,
          "derived: power(anova_oneway, n):n_total_exact / 4")
    bv = 166.6666666666667
    f2 = math.sqrt(bv * 3 / 4 / 500)
    r = P({"kind": "anova_oneway", "solve": "n", "f": f2, "k": 4,
           "power": 0.9})
    m.set("r_anova_n_means.n_per_group", r["n_total_exact"] / 4,
          "derived: power(anova_oneway, n):n_total_exact / 4")
    return m


@dataset("power-gpower-examples")
def map_power_gpower(entry, rows):
    m = Mapped()

    def P(opts):
        return run("power", {}, opts)

    r = P({"kind": "correlation", "solve": "n", "rho": 0.65, "rho0": 0.6,
           "power": 0.95, "alpha": 0.05, "tails": 2, "method": "exact"})
    m.set("gp_corr_rho0.n_total", r["n_total"], "power(correlation exact):n_total")
    m.set("gp_corr_rho0.actual_power", r["power"], "power(correlation):power")
    m.set("gp_corr_rho0.critical_r_lower", r["critical_r"][0],
          "power(correlation):critical_r[0]")
    m.set("gp_corr_rho0.critical_r_upper", r["critical_r"][1],
          "power(correlation):critical_r[1]")
    r = P({"kind": "anova_oneway", "solve": "n", "f": 0.25, "k": 10,
           "power": 0.95, "alpha": 0.05, "equal_n": True})
    m.set("gp_anova_f.n_total", r["n_total"], "power(anova_oneway):n_total")
    m.set("gp_anova_f.lambda", r["ncp"], "power(anova_oneway):ncp")
    m.set("gp_anova_f.critical_F", r["critical_f"],
          "power(anova_oneway):critical_f")
    m.set("gp_anova_f.actual_power", r["power"], "power(anova_oneway):power")
    r = P({"kind": "correlation", "solve": "n", "rho": 0.25, "rho0": 0.0,
           "power": 0.95, "alpha": 0.05, "tails": 1, "method": "t"})
    m.set("gp_point_biserial.n_total", r["n_total"],
          "power(correlation, t method):n_total")
    m.set("gp_point_biserial.actual_power", r["power"],
          "power(correlation, t method):power")
    m.unmapped("gp_point_biserial.critical_t", "no engine output: the "
               "correlation power analysis does not report the critical t")
    r = P({"kind": "t_paired", "solve": "power", "d": 0.421637, "n": 50,
           "alpha": 0.05, "tails": 2})
    m.set("gp_matched_pairs.power", r["power"], "power(t_paired):power")
    m.set("gp_matched_pairs.delta", r["ncp"], "power(t_paired):ncp")
    m.set("gp_matched_pairs.critical_t", r["critical_t"],
          "power(t_paired):critical_t")
    r = P({"kind": "t_one_sample", "solve": "n", "d": 0.625, "power": 0.95,
           "alpha": 0.05, "tails": 1})
    m.set("gp_one_sample_a.n_total", r["n_total"], "power(t_one_sample):n_total")
    m.set("gp_one_sample_a.actual_power", r["power"],
          "power(t_one_sample):power")
    m.set("gp_one_sample_a.delta", r["ncp"], "power(t_one_sample):ncp")
    r = P({"kind": "t_one_sample", "solve": "n", "d": 0.1, "power": 0.9,
           "alpha": 0.01, "tails": 2})
    m.set("gp_one_sample_b.n_total", r["n_total"], "power(t_one_sample):n_total")
    m.set("gp_one_sample_b.actual_power", r["power"],
          "power(t_one_sample):power")
    r = P({"kind": "t_two_sample", "solve": "n", "d": 0.5, "power": 0.95,
           "alpha": 0.05, "tails": 1})
    m.set("faul2007_two_sample.n_total", r["n_total"],
          "power(t_two_sample):n_total")
    m.set("faul2007_two_sample.n_per_group", r["n1"], "power(t_two_sample):n1")
    return m


@dataset("power-prism4-receptors")
def map_power_prism4(entry, rows):
    """Difference detectable with 50% / 90% power, unpaired two-sided t,
    alpha 0.05, n = 18 / 17, pooled SD (the guide's SD choice is not
    stated): effect d solved by the engine, times the pooled SD."""
    m = Mapped()
    n1, n2 = num(rows[0]["n"]), num(rows[1]["n"])
    s1, s2 = num(rows[0]["sd"]), num(rows[1]["sd"])
    sp = math.sqrt(((n1 - 1) * s1 ** 2 + (n2 - 1) * s2 ** 2) / (n1 + n2 - 2))
    for pw, q in ((0.5, "difference_for_50pct_power"),
                  (0.9, "difference_for_90pct_power")):
        r = run("power", {}, {"kind": "t_two_sample", "solve": "effect",
                              "n1": int(n1), "n2": int(n2), "power": pw,
                              "alpha": 0.05, "tails": 2})
        m.set(q, r["effect"]["value"] * sp,
              f"derived: power(t_two_sample, effect, power={pw}):effect.value"
              " * pooled SD")
    return m


# ============================================================ Bland-Altman, qPCR

@dataset("bland-altman-pefr")
def map_bland_altman(entry, rows):
    m = Mapped()
    data = col_data(rows, ["wright_1", "mini_wright_1"])
    r = run("bland_altman_extras", data, {"z": 2.0,
                                          "variants": ["difference"],
                                          "regression": False})
    d = r["difference"]
    lab = "bland_altman_extras(z=2):difference"
    m.set("bias", d["bias"], f"{lab}.bias")
    m.set("sd_of_differences", d["sd"], f"{lab}.sd")
    m.set("loa_lower_2sd", d["loa_lower"], f"{lab}.loa_lower")
    m.set("loa_upper_2sd", d["loa_upper"], f"{lab}.loa_upper")
    n = d["n"]
    m.set("se_bias", d["sd"] / math.sqrt(n), "derived: sd / sqrt(n)")
    m.set("bias_ci_lower", d["bias_ci"][0], f"{lab}.bias_ci[0]")
    m.set("bias_ci_upper", d["bias_ci"][1], f"{lab}.bias_ci[1]")
    ap = d["loa_ci"]["approximate"]
    m.set("se_loa", ap["se"], f"{lab}.loa_ci.approximate.se")
    m.set("lower_loa_ci_lower", ap["lower"][0],
          f"{lab}.loa_ci.approximate.lower[0]")
    m.set("lower_loa_ci_upper", ap["lower"][1],
          f"{lab}.loa_ci.approximate.lower[1]")
    m.set("upper_loa_ci_lower", ap["upper"][0],
          f"{lab}.loa_ci.approximate.upper[0]")
    m.set("upper_loa_ci_upper", ap["upper"][1],
          f"{lab}.loa_ci.approximate.upper[1]")
    m.unmapped("repeatability_coefficient_*", "not implemented: the "
               "repeatability coefficient from duplicate measurements")
    return m


@dataset("qpcr-livak-table1")
def map_qpcr(entry, rows):
    m = Mapped()
    rec = [{"sample": r["tissue"], "group": r["tissue"], "target": r["target"],
            "cq": num(r["Ct"])} for r in rows]
    res = run("qpcr", {"records": rec}, {"reference_genes": ["GAPDH"],
                                          "calibrator": "Brain",
                                          "test": "none"})
    gene = {"c-myc": "cmyc", "GAPDH": "GAPDH"}
    for rp in res["replicates"]:
        t = rp["sample"]
        g = gene[rp["target"]]
        p = (f"qpcr:replicates[sample={t}][target={rp['target']}]")
        m.set(f"{t}.mean_Ct_{g}", rp["mean_cq"], p + ".mean_cq")
        m.set(f"{t}.sd_Ct_{g}", rp["sd_cq"], p + ".sd_cq")
    for rr in res["results"]:
        t = rr["sample"]
        p = f"qpcr:results[sample={t}]"
        m.set(f"{t}.dCt", rr["dcq"], p + ".dcq")
        m.set(f"{t}.ddCt", rr["ddcq"], p + ".ddcq")
        m.set(f"{t}.fold", rr["relative_quantity"], p + ".relative_quantity")
    m.unmapped("*.sd_dCt", "not implemented: Livak's propagated SD "
               "sqrt(s1^2 + s2^2) of unpaired technical replicates")
    m.unmapped("*.sd_ddCt", "not implemented: Livak's propagated SD of ddCt")
    m.unmapped("*.fold_range_*", "not implemented: Livak's fold range "
               "2^-(ddCt +/- s)")
    return m

# ============================================================ GraphPad book

def _fit_block(m, fit, lab, mapping, prefix=""):
    """mapping: {quantity suffix: (param, what)}; what in value/se/ci0/ci1."""
    for q, (p, what) in mapping.items():
        e = fit["params"][p]
        if what == "ci0":
            v, path = e["ci95"][0], f"params.{p}.ci95[0]"
        elif what == "ci1":
            v, path = e["ci95"][1], f"params.{p}.ci95[1]"
        else:
            v, path = e[what], f"params.{p}.{what}"
        m.set(prefix + q, v, f"{lab}:fit.{path}")


def _goodness(m, fit, lab, prefix="", keys=("df", "R2", "residual_ss",
                                             "sy_x")):
    g = fit["goodness"]
    src = {"df": "df", "R2": "r_squared", "residual_ss": "ss_res",
           "sy_x": "sy_x"}
    for k in keys:
        m.set(prefix + k, g[src[k]], f"{lab}:fit.goodness.{src[k]}")


@dataset("gp-book-ch1-bloodpressure")
def map_gp_bp(entry, rows):
    m = Mapped()
    fit = _dr_fit(rows, "log_dose", [["Y1", "Y2", "Y3"]], {
        "model": "log_agonist_vs_response_4pl",
        "constraints": {"Bottom": 0}})[0]
    lab = "dose_response(log_agonist_vs_response_4pl, Bottom=0)"
    _fit_block(m, fit, lab, {
        "Top": ("Top", "value"), "LogEC50": ("LogEC50", "value"),
        "HillSlope": ("HillSlope", "value"), "se_Top": ("Top", "se"),
        "se_LogEC50": ("LogEC50", "se"), "se_HillSlope": ("HillSlope", "se")})
    _goodness(m, fit, lab)
    return m


def _compare_two_site(m, entry, rows, ycols):
    data = xy_data(rows, "log_inhibitor_M", [ycols])
    cf = run("compare_fits", data, {
        "model_1": {"model": "one_site_competition"},
        "model_2": {"model": "two_site_competition"}})
    one, two = cf["model_1"], cf["model_2"]
    l1 = "compare_fits:model_1(one_site_competition)"
    l2 = "compare_fits:model_2(two_site_competition)"
    _fit_block(m, {"params": one["params"]}, l1, {
        "Bottom": ("Bottom", "value"), "Top": ("Top", "value"),
        "LogEC50": ("LogIC50", "value"), "se_Bottom": ("Bottom", "se"),
        "se_Top": ("Top", "se"), "se_LogEC50": ("LogIC50", "se"),
        "LogEC50_ci_lower": ("LogIC50", "ci0"),
        "LogEC50_ci_upper": ("LogIC50", "ci1")}, "one.")
    _goodness(m, {"goodness": one["goodness"]}, l1, "one.")
    _fit_block(m, {"params": two["params"]}, l2, {
        "Bottom": ("Bottom", "value"), "Top": ("Top", "value"),
        "Fraction1": ("FracHi", "value"),
        "LogEC50_1": ("LogIC50_HiAff", "value"),
        "LogEC50_2": ("LogIC50_LoAff", "value"),
        "se_Bottom": ("Bottom", "se"), "se_Top": ("Top", "se"),
        "se_Fraction1": ("FracHi", "se"),
        "se_LogEC50_1": ("LogIC50_HiAff", "se"),
        "se_LogEC50_2": ("LogIC50_LoAff", "se"),
        "LogEC50_1_ci_lower": ("LogIC50_HiAff", "ci0"),
        "LogEC50_1_ci_upper": ("LogIC50_HiAff", "ci1")}, "two.")
    _goodness(m, {"goodness": two["goodness"]}, l2, "two.")
    f = cf["f_test"]
    m.set("F", f["F"], "compare_fits:f_test.F")
    m.set("F_dfn", f["dfn"], "compare_fits:f_test.dfn")
    m.set("F_dfd", f["dfd"], "compare_fits:f_test.dfd")
    m.set("p", f["p"], "compare_fits:f_test.p")
    a = cf["aicc"]
    m.set("AICc_one", a["aicc_1"], "compare_fits:aicc.aicc_1")
    m.set("AICc_two", a["aicc_2"], "compare_fits:aicc.aicc_2")
    m.set("prob_two_site_percent", 100 * a["probability_2"],
          "derived: 100 * compare_fits:aicc.probability_2")
    m.set("evidence_ratio", a["probability_2"] / a["probability_1"],
          "derived: aicc.probability_2 / aicc.probability_1")
    return m


@dataset("gp-book-twosite-ex1")
def map_gp_twosite1(entry, rows):
    return _compare_two_site(Mapped(), entry, rows, ["CPM"])


@dataset("gp-book-twosite-ex2")
def map_gp_twosite2(entry, rows):
    return _compare_two_site(Mapped(), entry, rows, ["Y1", "Y2", "Y3"])


@dataset("gp-book-hillslope-test")
def map_gp_hillslope(entry, rows):
    m = Mapped()
    data = xy_data(rows, "log_dose", [["Y1", "Y2"]])
    cf = run("compare_fits", data, {
        "model_1": {"model": "log_agonist_vs_response_3pl"},
        "model_2": {"model": "log_agonist_vs_response_4pl"}})
    l2 = "compare_fits:model_2(log_agonist_vs_response_4pl)"
    _fit_block(m, {"params": cf["model_2"]["params"]}, l2, {
        "Bottom": ("Bottom", "value"), "Top": ("Top", "value"),
        "LogEC50": ("LogEC50", "value"), "HillSlope": ("HillSlope", "value"),
        "se_Bottom": ("Bottom", "se"), "se_Top": ("Top", "se"),
        "se_LogEC50": ("LogEC50", "se"), "se_HillSlope": ("HillSlope", "se")})
    g1, g2 = cf["model_1"]["goodness"], cf["model_2"]["goodness"]
    m.set("ss_slope1", g1["ss_res"], "compare_fits:model_1.goodness.ss_res")
    m.set("df_slope1", g1["df"], "compare_fits:model_1.goodness.df")
    m.set("ss_free", g2["ss_res"], "compare_fits:model_2.goodness.ss_res")
    m.set("df_free", g2["df"], "compare_fits:model_2.goodness.df")
    m.set("F", cf["f_test"]["F"], "compare_fits:f_test.F")
    m.set("p", cf["f_test"]["p"], "compare_fits:f_test.p")
    a = cf["aicc"]
    m.set("AICc_slope1", a["aicc_1"], "compare_fits:aicc.aicc_1")
    m.set("AICc_free", a["aicc_2"], "compare_fits:aicc.aicc_2")
    m.set("evidence_ratio", a["probability_2"] / a["probability_1"],
          "derived: aicc.probability_2 / aicc.probability_1")
    m.unmapped("t_test_p", "no engine output (t test of HillSlope vs 1); "
               "the book's P also corresponds to a mistyped t (README)")
    return m


@dataset("gp-book-enzyme-mm")
def map_gp_enzyme(entry, rows):
    m = Mapped()
    fit = _dr_fit(rows, "substrate", ["velocity"],
                  {"model": "michaelis_menten"})[0]
    lab = "dose_response(michaelis_menten)"
    _fit_block(m, fit, lab, {
        "Vmax": ("Vmax", "value"), "se_Vmax": ("Vmax", "se"),
        "Vmax_ci_lower": ("Vmax", "ci0"), "Vmax_ci_upper": ("Vmax", "ci1"),
        "Km": ("Km", "value"), "se_Km": ("Km", "se"),
        "Km_ci_lower": ("Km", "ci0"), "Km_ci_upper": ("Km", "ci1")})
    _goodness(m, fit, lab, keys=("residual_ss", "sy_x"))
    m.unmapped("F_crit_2_5", "no engine output: joint confidence region "
               "(F critical value) is not reported")
    m.unmapped("ss_target_joint_region", "no engine output: joint "
               "confidence region SS target is not reported")
    m.unmapped("montecarlo_*", "not compared: Monte Carlo intervals are "
               "random (the engine's monte_carlo analysis exists but cannot "
               "reproduce another program's random draws)")
    return m


@dataset("gp-book-normalized-2param")
def map_gp_normalized(entry, rows):
    m = Mapped()
    fit = _dr_fit(rows, "log_conc", [["Y1", "Y2", "Y3"]], {
        "model": "log_agonist_vs_normalized_response_variable"})[0]
    lab = "dose_response(log_agonist_vs_normalized_response_variable)"
    _fit_block(m, fit, lab, {
        "LogEC50": ("LogEC50", "value"), "se_LogEC50": ("LogEC50", "se"),
        "LogEC50_ci_lower": ("LogEC50", "ci0"),
        "LogEC50_ci_upper": ("LogEC50", "ci1"),
        "HillSlope": ("HillSlope", "value"),
        "se_HillSlope": ("HillSlope", "se"),
        "HillSlope_ci_lower": ("HillSlope", "ci0"),
        "HillSlope_ci_upper": ("HillSlope", "ci1")})
    _goodness(m, fit, lab, keys=("residual_ss", "sy_x", "df"))
    m.unmapped("joint_region_*", "no engine output: 2-D joint confidence "
               "region limits are not reported")
    return m


def _global_params(g, name):
    return {d["name"]: d["params"] for d in g["datasets"]}[name]


@dataset("gp-book-operational-depletion")
def map_gp_op_depletion(entry, rows):
    m = Mapped()
    data = xy_data(rows, "log_acetylcholine", ["vehicle", "alkylated"])
    g = run("global_model_fit", data, {
        "model": "operational_depletion_log",
        "shared": ["LogKA", "n", "Basal", "Effectmax"]})
    lab = "global_model_fit(operational_depletion_log)"
    pv, pa = _global_params(g, "vehicle"), _global_params(g, "alkylated")
    for q, p in (("logKA", "LogKA"), ("n", "n"), ("Basal", "Basal"),
                 ("Emax", "Effectmax")):
        m.set(q, pv[p]["value"], f"{lab}:datasets[name=vehicle].params.{p}.value")
        m.set(f"se_{q}", pv[p]["se"],
              f"{lab}:datasets[name=vehicle].params.{p}.se")
    for nm, p in (("vehicle", pv), ("alkylated", pa)):
        m.set(f"logtau_{nm}", p["LogTau"]["value"],
              f"{lab}:datasets[name={nm}].params.LogTau.value")
        m.set(f"se_logtau_{nm}", p["LogTau"]["se"],
              f"{lab}:datasets[name={nm}].params.LogTau.se")
    return m


@dataset("gp-book-operational-partial")
def map_gp_op_partial(entry, rows):
    m = Mapped()
    data = xy_data(rows, "log_agonist", ["oxotremorine_M", "pilocarpine"])
    g = run("global_model_fit", data, {
        "model": "operational_partial_agonist_log",
        "shared": ["Basal", "Effectmax", "n"]})
    lab = "global_model_fit(operational_partial_agonist_log)"
    pf = _global_params(g, "oxotremorine_M")
    pp = _global_params(g, "pilocarpine")
    for q, p in (("Basal", "Basal"), ("Emax", "Effectmax"), ("n", "n")):
        m.set(q, pf[p]["value"],
              f"{lab}:datasets[name=oxotremorine_M].params.{p}.value")
        m.set(f"se_{q}", pf[p]["se"],
              f"{lab}:datasets[name=oxotremorine_M].params.{p}.se")
    m.set("logEC50_full", pf["LogEC50"]["value"],
          f"{lab}:datasets[name=oxotremorine_M].params.LogEC50.value")
    m.set("se_logEC50", pf["LogEC50"]["se"],
          f"{lab}:datasets[name=oxotremorine_M].params.LogEC50.se")
    for q, p in (("logKA_partial", "LogKA"), ("logtau_partial", "LogTau")):
        m.set(q, pp[p]["value"],
              f"{lab}:datasets[name=pilocarpine].params.{p}.value")
    m.set("se_logKA", pp["LogKA"]["se"],
          f"{lab}:datasets[name=pilocarpine].params.LogKA.se")
    m.set("se_logtau", pp["LogTau"]["se"],
          f"{lab}:datasets[name=pilocarpine].params.LogTau.se")
    return m


@dataset("gp-book-schild-global")
def map_gp_schild(entry, rows):
    m = Mapped()
    cols = entry["layout"]["y"]
    data = xy_data(rows, "log_acetylcholine", cols)
    conc = [float(c.split("_")[1]) for c in cols]
    g1 = run("global_model_fit", data, {
        "model": "gaddum_schild_slope1_log",
        "column_constants": {"B": conc}})
    gs = run("global_model_fit", data, {
        "model": "gaddum_schild_log", "column_constants": {"B": conc}})
    lab = "global_model_fit(gaddum_schild_slope1_log, all shared)"
    p = g1["datasets"][0]["params"]
    for q, nm in (("LogEC50", "LogEC50"), ("pA2", "pA2"),
                  ("Bottom", "Bottom"), ("Top", "Top"),
                  ("HillSlope", "HillSlope")):
        m.set(q, p[nm]["value"], f"{lab}:datasets[0].params.{nm}.value")
        if nm in ("LogEC50", "pA2", "HillSlope"):
            m.set(f"{q}_ci_lower", p[nm]["ci95"][0],
                  f"{lab}:datasets[0].params.{nm}.ci95[0]")
            m.set(f"{q}_ci_upper", p[nm]["ci95"][1],
                  f"{lab}:datasets[0].params.{nm}.ci95[1]")
    m.set("Kb_nM", 10 ** (-p["pA2"]["value"]) * 1e9, "derived: 10^-pA2 * 1e9")
    ss1, df1 = g1["goodness"]["ss_res"], g1["goodness"]["df"]
    ss2, df2 = gs["goodness"]["ss_res"], gs["goodness"]["df"]
    F = ((ss1 - ss2) / (df1 - df2)) / (ss2 / df2)
    m.set("schild_slope_F", F, "derived: extra-SS F from the two global "
          "fits (SchildSlope = 1 vs free)")
    m.set("F_dfn", df1 - df2, "derived: df(slope 1) - df(free)")
    m.set("F_dfd", df2, "global_model_fit(gaddum_schild_log):goodness.df")
    from scipy import stats as _st
    m.set("schild_slope_F_p", float(_st.f.sf(F, df1 - df2, df2)),
          "derived: F distribution tail of the derived F")
    return m


@dataset("gp-stats-ratio-ttest")
def map_gp_ratio(entry, rows):
    m = Mapped()
    data = col_data(rows, ["treated", "control"])
    pr = run("ttest", data, {"kind": "paired"})
    m.set("paired.p", pr["p_two_tailed"], "ttest(paired, treated - control):"
          "p_two_tailed")
    m.set("paired.ci_lower", pr["ci_difference"][0],
          "ttest(paired):ci_difference[0]")
    m.set("paired.ci_upper", pr["ci_difference"][1],
          "ttest(paired):ci_difference[1]")
    rr = run("ttest", col_data(rows, ["control", "treated"]),
             {"kind": "ratio_paired"})
    lab = "ttest(ratio_paired, control / treated)"
    m.set("ratio.p", rr["p_two_tailed"], f"{lab}:p_two_tailed")
    m.set("ratio.mean_log10_diff_control_minus_treated",
          rr["mean_log10_ratio"], f"{lab}:mean_log10_ratio")
    m.set("ratio.ci_lower_log10", rr["ci_log10_ratio"][0],
          f"{lab}:ci_log10_ratio[0]")
    m.set("ratio.ci_upper_log10", rr["ci_log10_ratio"][1],
          f"{lab}:ci_log10_ratio[1]")
    m.set("ratio.geometric_mean_ratio_control_over_treated",
          rr["geometric_mean_ratio"], f"{lab}:geometric_mean_ratio")
    m.set("ratio.ratio_ci_lower", rr["ci_ratio"][0], f"{lab}:ci_ratio[0]")
    m.set("ratio.ratio_ci_upper", rr["ci_ratio"][1], f"{lab}:ci_ratio[1]")
    return m

# ------- END OF DATASET MAPPINGS -------
# ============================================================ comparison

# Failure classification. Key: (dataset id, quantity glob). Value:
# (category, reason). Categories: "a" runner mapping/transcription error,
# "b" tolerance tighter than the printed digits justify, "c" genuine
# engine discrepancy, "d" known reference problem (reference_status).
_HESSIAN = ("definition: drc's SEs are observed-information SEs (inverse "
            "numerical Hessian of the RSS from optim); the engine, like "
            "Prism and R's nls, uses J'J. Verified: the observed-Hessian SE "
            "at the least-squares optimum reproduces drc's printed values "
            "(0.34168 / 0.20438 / 0.19641); J'J gives the engine's")
_PRISM4_OPT = ("reference precision: the printed Prism 4 values are not at "
               "the least-squares optimum to the printed digits (a "
               "ftol = 1e-15 refit agrees with the engine to <= 2e-6 and "
               "has lower SS), so the last printed digits are not "
               "significant")

_R_UNIROOT = ("reference precision: R's fisher.test finds the conditional "
              "MLE and its exact CI limits with uniroot(tol = "
              ".Machine$double.eps^0.25 ~ 1.2e-4 on the [0, 1] scale), so its "
              "printed digits are 1e-6..3e-3 (relative) off the root; the "
              "engine solves to full precision and agrees with scipy.stats."
              "contingency.odds_ratio(kind='conditional') to 1e-14")

KNOWN: dict[tuple[str, str], tuple[str, str]] = {
    # ---------------- NIST nonlinear
    ("nist-rat43", "df"): ("d", "manifest transcription error (new): 15 "
                           "observations - 4 parameters = 11, and NIST's "
                           "own RSS / sigma^2 = 8786.4049 / 28.2624^2 = "
                           "11.0; the manifest says 9"),
    # ---------------- NIST ANOVA / univariate stress tests
    ("nist-smls07", "*"): ("b", "unattainable in float64: inputs such as "
                           "1000000000000.4 are not representable (ulp 1.2e-4 "
                           "at 1e12); exact arithmetic on the float64-parsed "
                           "data is itself 5e-5..1e-4 off. The engine is at "
                           "that limit after the shifted-SS fix"),
    ("nist-smls08", "*"): ("b", "unattainable in float64 (see nist-smls07)"),
    ("nist-smls09", "*"): ("b", "unattainable in float64 (see nist-smls07)"),
    ("nist-numacc4", "sd"): ("b", "unattainable in float64: 10000000.2 etc. "
                             "are not representable; the exact SD of the "
                             "float64-parsed data is off by the same 5.6e-9"),
    # ---------------- R
    ("r-toothgrowth", "F.supp_4dp"): ("d", "r-statistics.co's 4-decimal F is "
                                      "truncated, not rounded (F from the "
                                      "printed SS = 15.571979 -> 15.5720); "
                                      "the same page mis-prints the "
                                      "interaction F (README)"),
    ("r-loblolly-329", "getInitial.Asym"): (
        "b", "reference precision: the exact LS optimum is Asym = "
        "94.1282101; R's selfStart value 94.128204 is 6e-6 off it (the "
        "engine: 94.1282099), so the 7th printed digit is not significant"),
    ("r-indometh-1", "*_7digits"): (
        "b", "reference precision: R's nls (default relative-offset "
        "tolerance) stops ~1e-6 short; the exact optimum (A1 2.0292780, "
        "lrc1 0.5793898, A2 0.1915480, lrc2 -1.7877833) differs from the "
        "printed 7th digit; the engine reaches it (2.0292780, 0.5793898, "
        "0.1915480, -1.7877833)"),
    ("r-infert", "m2.se_*"): (
        "b", "reference precision: R's glm reports SEs from the working "
        "weights of the last IRLS step, one iteration before convergence "
        "(emulated: 1.4121954, 0.7925498, 0.8341562, 0.3014602 -> the "
        "printed values); the engine reports the SEs at the MLE "
        "(1.4122093, ...), 1-2 units off in the 5th decimal"),
    ("roc-asah", "paper.*"): (
        "d", "the paper's partial AUCs are not reproducible from the "
        "package data: pROC's own regression-test value for the same "
        "quantity (pauc_sp90_100.wfns = 0.03344) passes, the paper prints "
        "3.1%"),
    ("drc-ryegrass", "se_*"): ("a", _HESSIAN),
    ("drc-ryegrass", "*_ci_*"): ("a", _HESSIAN + "; the intervals are "
                                 "estimate +/- t(21) * that SE"),
    ("drc-ryegrass", "b"): (
        "b", "reference precision: the exact LS optimum is b = 2.4703243, "
        "which rounds to 2.47032, not drc's 2.47033 (drc's optim stops "
        "short); the engine reaches it (2.4703243)"),
    ("drc-ryegrass", "ED5"): (
        "b", "reference precision: the exact ED5 is 0.9908739 (drc 0.99088 "
        "is 6e-6 off); the engine reaches it (0.9908739)"),
    ("drc-s-alba", "se_*"): ("a", _HESSIAN + "; drc's estimates are also "
                             "short of the optimum (README)"),
    ("drc-s-alba", "slope_difference_se"): (
        "a", _HESSIAN + "; the SE of the difference uses the J'J "
        "covariance of the global fit (exposed as 'covariance')"),
    ("drc-s-alba", "*"): (
        "d", "README: drc stopped short of the least-squares optimum (RSS "
        "8.511447 vs 8.511399); the engine reaches RSS 8.511399 and the "
        "exact ED50 28.638, so drc's slopes are off by more than rel 2e-3"),
    ("drc-selenium", "*"): (
        "b", "reference precision: drc's optimizer stops ~1e-6 (relative) "
        "short; an independent exact logit MLE gives ED50 252.255878 / "
        "378.458986 / 119.712991 / 88.805245 (= the engine) and SE "
        "13.826870 / 39.370505 / 8.616163, which do not round to drc's "
        "printed 7th digit; the symmetric dose-scale intervals ED50 +/- "
        "1.96 SE follow"),
    ("synergy-mathews-block1", "*"): (
        "d", "model_dependent (manifest): ZIP / Loewe / IC50 depend on the "
        "monotherapy dose-response fits. SynergyFinder's drc LL.4 fits "
        "differ from the engine's 4PL fits (ibrutinib IC50 2.74 vs 2.90; "
        "the engine's ibrutinib Hill slope is ~12), and where Loewe has no "
        "solution the two programs fall back differently (-14.9 vs 59.0)"),
    ("power-r-examples", "r_t_power.power"): (
        "d", "definition (manifest note): R's power.t.test(strict = FALSE) "
        "ignores the far rejection region; the engine's two-sided power "
        "includes it (0.86895303 vs 0.86895280)"),
    ("power-r-examples", "*"): (
        "b", "reference precision: R solves with uniroot(tol = "
        ".Machine$double.eps^0.25 ~ 1.2e-4); at R's printed n the power is "
        "0.90000014 / 0.80000076 / 0.90000021 (p2: 0.8999632), at the "
        "engine's 0.9 / 0.8 to 1e-12"),
    ("bland-altman-pefr", "loa_*"): (
        "b", "printed from rounded intermediates: the paper computes -2.1 "
        "+/- 2 x 38.8; the exact limits are -79.648 and 75.413"),
    ("bland-altman-pefr", "*"): (
        "a", "definition: the paper's SE of a limit is Bland & Altman "
        "1986's sqrt(3 s^2 / n) (16.3); the engine uses Bland & Altman "
        "1999's sqrt((1/n + z^2/(2(n-1))) s^2) (16.6), and the limits' CIs "
        "follow"),
    ("r-fisher-teatasting", "odds_ratio_conditional_mle"): (
        "b", _R_UNIROOT),
    ("r-fisher-teatasting", "or_ci_lower_one_sided"): ("b", _R_UNIROOT),
    ("r-fisher-convictions", "odds_ratio_conditional_mle"): (
        "b", _R_UNIROOT),
    ("r-fisher-convictions", "or_ci*"): ("b", _R_UNIROOT),
    ("drc-earthworms", "*"): (
        "b", "reference precision: drc's optim stops short of the maximum "
        "likelihood (log-likelihood -103.1414050 at drc's m1 estimates, "
        "-103.1414048 at the engine's, which an independent Nelder-Mead "
        "maximisation reproduces: b 1.5055729, d 0.6049042, e 0.2924352; "
        "m2 e 0.3772555); the SEs, from the observed information as drc's, "
        "agree with drc's to 1e-4 and differ by what the estimates do"),
    # ---------------- GraphPad book / guide
    ("gp-book-twosite-ex1", "F"): (
        "d", "source inconsistency (new): the book's own SS give F = "
        "((116881.6 - 10475.93)/2)/(10475.93/6) = 30.47, it prints 30.48"),
    ("gp-book-twosite-ex1", "two.*"): ("b", _PRISM4_OPT),
    ("gp-book-twosite-ex2", "AICc_*"): (
        "d", "source error (new): the printed 'AICc' are AIC values without "
        "the small-sample term (290.88 = 33 ln(174334/33) + 2*4; AICc adds "
        "2K(K+1)/(N-K-1) = 1.43 and 3.23)"),
    ("gp-book-twosite-ex2", "evidence_ratio"): (
        "d", "follows the book's AIC (not AICc) values: exp((290.88 - "
        "289.98)/2) = 1.57; with AICc the one-site model is preferred"),
    ("gp-book-twosite-ex2", "two.*"): (
        "d", "not reproducible from the printed data: the README's "
        "independent refit also gives Fraction 0.128 (printed 0.1271); "
        "the engine gives 0.1281"),
    ("gp-book-hillslope-test", "evidence_ratio"): (
        "d", "source inconsistency: the book's AICc (137.4 / 137.1) imply "
        "1.16, it prints 1.11; the engine's exact value is 1.139"),
    ("gp-book-hillslope-test", "*"): ("b", _PRISM4_OPT),
    ("gp-book-enzyme-mm", "Vmax_ci_upper"): (
        "b", "printed precision: exact 70.196 (-> 70.20); Prism 4 prints "
        "70.19 (truncation or its t-quantile approximation); the lower "
        "limit and the SE pass"),
    ("gp-book-normalized-2param", "*"): (
        "d", "README: estimates reproduce but SE and SS are 0.3% off (one "
        "printed data value is probably rounded); HillSlope 0.69951 vs "
        "0.6996 follows"),
    ("gp-book-twoway-bonferroni", "bonferroni[time=4].ci_upper"): (
        "b", "printed precision: exact -0.87337 (-> -0.8734), the book "
        "prints -0.8733; 0.7 of a unit in the 4th digit"),
    ("gp-stats-ratio-ttest", "*"): (
        "b", "printed precision: the guide truncates (mean log ratio "
        "-0.30429 printed -0.3042, README; CI upper 0.53154 printed "
        "0.531)"),
}

CATEGORY_TEXT = {
    "a": "runner mapping / transcription error",
    "b": "tolerance tighter than the printed digits justify",
    "c": "genuine engine discrepancy",
    "d": "known reference problem",
}


def classify(ds_id, quantity, entry=None):
    """First KNOWN entry whose key matches (exact quantity name first, then
    glob patterns in table order)."""
    if (ds_id, quantity) in KNOWN:
        return KNOWN[(ds_id, quantity)]
    for (i, pat), val in KNOWN.items():
        if i == ds_id and "*" in pat and fnmatch.fnmatchcase(
                quantity, pat.replace("[", "[[]")):
            return val
    if entry is not None and entry.get("reference_status"):
        return ("d", f"reference_status: {entry['reference_status']}")
    return None


def within(ours, ref, tol):
    if ours is None or isinstance(ours, str):
        return False
    if isinstance(ours, float) and not math.isfinite(ours):
        return False
    diff = abs(ours - ref)
    if "abs" in tol:
        # 1e-12 relative slack for binary floating point at exact edges
        return diff <= tol["abs"] + 1e-12 * max(1.0, abs(ref))
    return diff <= tol["rel"] * abs(ref)


def compare_entry(entry, mapped: Mapped | None, error: str | None = None):
    out = []
    for ref in entry["reference"]:
        q = ref["quantity"]
        rec = {"dataset": entry["id"], "quantity": q,
               "reference": ref["value"], "tolerance": ref["tolerance"],
               "printed": ref.get("printed"), "source": ref.get("source")}
        if mapped is None:
            rec.update(status="error", ours=None, path=None,
                       reason=error or "analysis failed")
        elif q in mapped.values:
            v = mapped.values[q]
            rec.update(ours=v["value"], path=v["path"])
            extra = {k: val for k, val in v.items()
                     if k not in ("value", "path")}
            if extra:
                rec["extra"] = extra
            ok = within(v["value"], ref["value"], ref["tolerance"])
            if ok and "start2" in v:  # NIST: both starts must agree
                ok = within(v["start2"], ref["value"], ref["tolerance"])
                if not ok:
                    rec["start2_fail"] = True
            if ok:
                rec["status"] = "pass"
            else:
                rec["status"] = "fail"
            if isinstance(v["value"], (int, float)) and v["value"] is not None \
                    and math.isfinite(v["value"]):
                d = abs(v["value"] - ref["value"])
                rec["abs_diff"] = d
                rec["rel_diff"] = d / abs(ref["value"]) if ref["value"] else None
        else:
            rec.update(status="unmapped", ours=None, path=None,
                       reason=mapped.reason_for(q) or "no mapping")
        if rec["status"] in ("fail", "error"):
            c = classify(entry["id"], q, entry)
            if c:
                rec["category"], rec["category_reason"] = c
            else:
                rec["category"], rec["category_reason"] = (
                    "?", "unclassified")
        out.append(rec)
    return out


@functools.lru_cache(maxsize=None)
def evaluate(ds_id):
    """(records, notes, seconds) for one dataset; cached per process."""
    entry = entry_by_id(ds_id)
    fn = REGISTRY.get(ds_id)
    t0 = time.perf_counter()
    notes = []
    if fn is None:
        recs = compare_entry(entry, Mapped())
        for r in recs:
            r["reason"] = "dataset not mapped"
        return recs, notes, 0.0
    try:
        _, rows = read_csv(entry)
        mapped = fn(entry, rows)
        notes = mapped.notes
        recs = compare_entry(entry, mapped)
    except Exception as exc:  # report, never crash the whole run
        import traceback
        notes = [traceback.format_exc()]
        recs = compare_entry(entry, None, error=f"{type(exc).__name__}: {exc}")
    return recs, notes, time.perf_counter() - t0


def summarize(ids=None, verbose=True):
    ids = ids or [e["id"] for e in manifest_entries()]
    all_recs, per = [], []
    for i in ids:
        recs, notes, secs = evaluate(i)
        e = entry_by_id(i)
        cnt = {s: sum(r["status"] == s for r in recs)
               for s in ("pass", "fail", "unmapped", "error")}
        per.append({"id": i, "workflow": e["workflow"],
                    "private": e["_private"], "seconds": round(secs, 3),
                    "notes": notes, **cnt,
                    "reference_status": e.get("reference_status")})
        all_recs.extend(recs)
        if verbose:
            print(f"{i:34s} pass {cnt['pass']:3d} fail {cnt['fail']:3d} "
                  f"unmapped {cnt['unmapped']:3d} error {cnt['error']:3d} "
                  f"({secs:.2f}s)")
            for r in recs:
                if r["status"] in ("fail", "error"):
                    print(f"    {r['status'].upper():5s} {r['quantity']:45s} "
                          f"ours={r.get('ours')!r:<24} ref={r['reference']!r}"
                          f" tol={r['tolerance']} [{r.get('category')}]")
            for n in notes:
                print("    note:", n.strip()[:2000])
    return per, all_recs


FINDINGS_MD = """
## Findings

*These are the findings of the first run (engine before the fixes); the
section "After the fixes" below lists what changed and the new counts.*

### Genuine engine discrepancies (category c)

1. **Nonlinear regression stops short of the optimum (convergence
   tolerance).** `nlfit._ols_fit` (and `globalfit`, `equations.
   fit_global_model`, `schild`) call `scipy.optimize.least_squares(method=
   "lm")` with the default `ftol = xtol = 1e-8`. That stops when the SS
   improves by less than 1e-8 relative, which leaves parameters 1e-7 to
   1e-4 (relative) short of the minimum: NIST Thurber 2e-5, MGH09 1e-4,
   Rat43 1e-5, Chwirut2 1.3e-6, BoxBOD (Start 2) 7.5e-6; R DNase SSfpl
   1.3e-6; growthcurver r 1.6e-5; drc ryegrass ED10 2e-6. In every case a
   refit with `ftol = xtol = 1e-12` (or 1e-15) reaches the certified /
   published optimum. *Fix:* pass `ftol=1e-12, xtol=1e-12` (or add one
   polishing restart from the solution). Cost: a few more function
   evaluations; estimates move by at most the amounts above.
2. **Standard errors use an absolute-floor finite-difference step.**
   `res.jac` is recomputed by scipy at the solution with a forward step of
   `1.5e-8 * max(1, |p|)`. For any parameter with `|p| << 1` the step is
   large relative to p: NIST Misra1a SEs are 2.6e-5 off (b2 = 5.5e-4),
   Lanczos3 2.5e-5, Thurber/MGH09 1e-4. The same defect makes SEs depend
   on the units of X: an `agonist_vs_response_variable` fit with X in molar
   (EC50 1.02e-7 M) gives SE(EC50) 7.18e-9 against 6.69e-9 for the identical
   fit in nM (7 % off), and the estimate itself 1.2e-4 off. With an analytic
   or relative-step Jacobian the NIST SEs match to 1e-7..1e-10.
   *Fix:* build the covariance from a Jacobian evaluated at the solution
   with a scale-aware central difference (step relative to |p| with a floor
   tied to the parameter's own scale, e.g. its SE from a first pass), and
   pass `diff_step` to `least_squares`. Not applied here: a pure relative
   step breaks parameters that sit near zero but act on a large scale
   (Bottom ~ 0, LogEC50 ~ 0), so the fix needs a design decision, and it
   moves SEs of every fit with a parameter below 1 in magnitude.
3. **NIST Hahn1 does not converge** from either start (SS 5e-6 above the
   minimum, SEs up to 40 % off) for the same reason as 2: b4 ~ -1.4e-6 and
   b7 ~ -1.2e-7 get a step of 1.5e-8, so the Jacobian is useless. With
   `diff_step = 1.5e-8` (relative steps) it converges to the certified
   values from both starts in 11-13 evaluations.
4. **NIST BoxBOD from Start 1** runs to a degenerate point (b2 -> 110,
   exp(-b2 x) underflows, J'J singular) and was reported as "converged"
   with NaN SEs. *Fixed in this pass:* a non-finite covariance now gives
   status "ambiguous". The estimate is still wrong; a multistart (as the
   built-in models have) or a check that the SS beats a horizontal line
   would catch it.
5. **Log-rank statistic: Peto form only.** `survival.compare_survival`
   reports sum((O-E)^2/E) (its comment: Prism's form). R's survdiff uses
   the variance (Mantel-Haenszel) quadratic form: AML 3.40 vs the engine's
   3.14, lung 10.33 vs 10.23. The engine already computes the variance
   form internally (`_quadratic_form_chi2(O, E, V)` returns exactly R's
   numbers). *Fix:* report it alongside the Peto statistic.
6. **Weighted fit "1/Y" is Prism's IRLS fixed point only.** R's Puromycin
   example minimises sum((y - yhat)^2 / yhat); the engine's IRLS (weights
   from the previous curve, by design) gives Vmax 207.78 vs 206.83. Not a
   bug; a "minimise the weighted SS" option is missing.
7. **One-way ANOVA between-group SS lost ~1.5 digits** for data far from
   zero (NIST SmLs04 1.9e-9, AtmWtAg 3.3e-9 against rel 1e-9). *Fixed in
   this pass* (shifted data, see below).
8. **Power: solving for the effect size of a t test failed** with "the
   function value is NaN" (StatMate example, n = 18 / 17). scipy's
   `nct.cdf` returns NaN deep in the far rejection tail for noncentrality
   ~25-40. *Fixed in this pass.*
9. **Two-way ANOVA with one value per cell is refused** ("not enough
   replicates for interaction model"); Prism fits the no-interaction model.
   R `morley` was mapped through the RM one-way ANOVA (same linear model),
   which does not test the row (subject) factor, so F and P for runs stay
   unmapped. *Fix:* fall back to (or offer) the main-effects-only model.

### Fixes made in `engine/opendose/` (each with a new test; engine suite green)

* `power.t_power`: the far-tail term P(T' < -tc) falls back to 0 when scipy
  returns NaN and Phi(-ncp) < 1e-15 (it is bounded by P(T' < 0) = Phi(-ncp)).
  Only results that used to be NaN change. Test:
  `test_power.py::TestFarTailNaN` (against statsmodels).
* `anova.one_way_anova`: the between-group SS is computed on data shifted
  by one data value (exact by Sterbenz's lemma, SS are shift-invariant).
  Changes results only in the 10th digit; NIST SmLs04 and AtmWtAg now pass
  at rel 1e-9. Test: `test_statistics.py::
  test_one_way_anova_far_from_zero_nist_smls04`.
* `nlfit.fit_model`: a non-finite covariance sets status "ambiguous" (no
  numbers change). Test: `test_nlfit.py::
  test_singular_covariance_is_ambiguous_not_converged` (NIST BoxBOD).

### Missing features (unmapped quantities)

Kendall's tau; Fligner-Killeen; Holm (Bonferroni step-down) adjustment;
one-sided Fisher / correlation CIs; conditional-MLE odds ratio and exact
conditional CIs; Fisher-Freeman-Halton r x c exact test; generalized CMH
(r x c x k); Woolf homogeneity; expected counts and standardized residuals
in the contingency output; Kaplan-Meier SE and median-survival CI; a
main-effects-only two-way ANOVA and Tukey on all cells; binomial
log-logistic with an upper limit (drc LL.3 binomial); common-ED50 LR test;
weighted Deming with per-point SDs; RI / CSS synergy scores; robust
(sandwich) SEs; Bland-Altman repeatability coefficient; Livak's propagated
SD; joint confidence regions; uncorrected normal approximations for the
rank tests; a 10th-order polynomial is fitted through multiple regression
(no built-in beyond 6th order) - and it passes NIST Filip at 1e-6.

### Datasets the engine cannot analyse at all

* `drc-earthworms`: binomial log-logistic with an estimated (or fixed 0.5)
  upper limit; the quantal analysis has no upper-asymptote parameter.
* `r-fisher-job`, `r-fisher-mp6`: Fisher's exact test for r x c tables.
* `r-cmh-satisfaction`: generalized CMH for a 4 x 4 x 2 table.

### Reference problems found in this pass (category d, not previously flagged)

* `nist-rat43` df: the manifest says 9, NIST certifies 11 (15 points, 4
  parameters; RSS / sigma^2 = 11.0).
* `gp-book-twosite-ex2`: the printed "AICc" are AIC values (no
  small-sample term), and the evidence ratio follows them.
* `gp-book-twosite-ex1` F: 30.48 printed, 30.47 from the book's own SS.
* `gp-book-hillslope-test` evidence ratio: 1.11 printed, 1.16 from the
  book's own AICc.
* drc's printed SEs (ryegrass, S. alba) are observed-Hessian SEs, not the
  J'J SEs of Prism / nls / the engine (classified a: definition).
"""


def write_outputs(per, recs, total):
    """Public datasets -> docs/validation/results-engine.{json,md}; the
    whole corpus including the licence-flagged datasets ->
    docs/validation/private/results-engine-private.{json,md} (local)."""
    priv_ids = {p_["id"] for p_ in per if p_["private"]}
    pub_per = [p_ for p_ in per if p_["id"] not in priv_ids]
    pub_recs = [r for r in recs if r["dataset"] not in priv_ids]
    priv_note = None
    if priv_ids:
        pr = [r for r in recs if r["dataset"] in priv_ids]
        c = {k: sum(r["status"] == k for r in pr)
             for k in ("pass", "fail", "unmapped", "error")}
        priv_note = (
            f"The {len(priv_ids)} licence-flagged datasets (local only, "
            f"`docs/validation/private/`) add {len(pr)} quantities: "
            f"{c['pass']} pass, {c['fail'] + c['error']} fail, "
            f"{c['unmapped']} unmapped; their per-quantity detail is in "
            "`docs/validation/private/results-engine-private.md` (not in "
            "the repository).")
        _write_outputs(per, recs, total, OUT_PRIVATE_JSON, OUT_PRIVATE_MD,
                       None, "whole corpus including the licence-flagged "
                       "datasets")
    _write_outputs(pub_per, pub_recs, total, OUT_JSON, OUT_MD, priv_note,
                   "public datasets")


def _write_outputs(per, recs, total, out_json, out_md, priv_note, scope):
    counts = {s: sum(r["status"] == s for r in recs)
              for s in ("pass", "fail", "unmapped", "error")}
    cats = {}
    for r in recs:
        if r["status"] in ("fail", "error"):
            cats[r["category"]] = cats.get(r["category"], 0) + 1
    payload = {
        "generated_by": "engine/tests/corpus/run_corpus.py",
        "engine": "opendose (engine/opendose)",
        "scope": scope,
        "corpus": {"public": str(PUBLIC_DIR.relative_to(REPO)),
                   "private": str(PRIVATE_DIR.relative_to(REPO)),
                   "private_present": PRIVATE_DIR.exists()},
        "categories": CATEGORY_TEXT,
        "totals": {**counts, "quantities": len(recs),
                   "datasets": len(per), "failures_by_category": cats,
                   "seconds": round(total, 2)},
        "datasets": per,
        "quantities": recs,
    }

    def clean(o):
        if isinstance(o, float) and not math.isfinite(o):
            return None
        if isinstance(o, dict):
            return {k: clean(v) for k, v in o.items()}
        if isinstance(o, (list, tuple)):
            return [clean(v) for v in o]
        return o

    out_json.write_text(json.dumps(clean(payload), indent=1) + "\n")

    lines = ["# Reference corpus: engine results", "",
             "Generated by `engine/tests/corpus/run_corpus.py` (do not edit "
             "by hand; rerun it). Every reference quantity of "
             "`docs/validation/datasets/manifest.json` and the local "
             "licence-flagged `docs/validation/private/datasets/"
             "manifest.json` was computed with `opendose.api.analyze` and "
             "compared with the published value within the manifest "
             "tolerance. Per-quantity detail (ours, reference, tolerance, "
             "result path, classification) is in `results-engine.json`.",
             "",
             f"**{len(recs)} quantities in {len(per)} datasets: "
             f"{counts['pass']} pass, {counts['fail']} fail, "
             f"{counts['unmapped']} unmapped, {counts['error']} error** "
             f"({total:.1f} s for the whole corpus; scope: {scope}).", "",
             *([priv_note, ""] if priv_note else []),
             "Failures by category: " + ", ".join(
                 f"({k}) {CATEGORY_TEXT.get(k, k)}: {v}"
                 for k, v in sorted(cats.items())) + ".", "",
             "A quantity is *unmapped* when the engine has no output for it "
             "(the reason is recorded per quantity); *fail* means the engine "
             "value is outside the tolerance; every failure carries a "
             "category and a diagnosis. `derived:` paths are one-line "
             "arithmetic on engine outputs (e.g. SS regression = F x MS "
             "residual).", "",
             "## Summary per dataset", "",
             "| dataset | workflow | pass | fail | unmapped | failure "
             "categories | note |",
             "|---|---|---:|---:|---:|---|---|"]
    by_ds = {}
    for r in recs:
        by_ds.setdefault(r["dataset"], []).append(r)
    for p_ in per:
        rs = by_ds[p_["id"]]
        cs = sorted({r["category"] for r in rs
                     if r["status"] in ("fail", "error")})
        note = []
        if p_["private"]:
            note.append("private")
        if p_["reference_status"]:
            note.append("(!) " + p_["reference_status"])
        lines.append(
            f"| `{p_['id']}` | {p_['workflow']} | {p_['pass']} | "
            f"{p_['fail'] + p_['error']} | {p_['unmapped']} | "
            f"{', '.join(cs)} | {'; '.join(note)} |")
    lines += ["", FINDINGS_MD.strip(), "", _after_fixes(recs, scope), "",
              "## Every failure", "",
              "| dataset | quantity | ours | reference | tolerance | cat | "
              "reason |", "|---|---|---|---|---|---|---|"]

    def fmt(v):
        if isinstance(v, float):
            return f"{v:.10g}"
        return str(v)

    for r in recs:
        if r["status"] in ("fail", "error"):
            tol = ", ".join(f"{k} {v:g}" for k, v in r["tolerance"].items())
            reason = r["category_reason"].replace("|", "\\|")
            lines.append(f"| `{r['dataset']}` | `{r['quantity']}` | "
                         f"{fmt(r.get('ours'))} | {fmt(r['reference'])} | "
                         f"{tol} | {r['category']} | {reason} |")
    lines += ["", "## Unmapped quantities", "",
              "| dataset | quantities | reason |", "|---|---|---|"]
    groups = {}
    for r in recs:
        if r["status"] == "unmapped":
            groups.setdefault((r["dataset"], r["reason"]), []).append(
                r["quantity"])
    for (d, why), qs in groups.items():
        shown = ", ".join(f"`{q}`" for q in qs[:6])
        if len(qs) > 6:
            shown += f" and {len(qs) - 6} more"
        why = why.replace("|", "\\|")
        lines.append(f"| `{d}` | {shown} | {why} |")
    lines += ["", "## Timings", "",
              f"Whole corpus: {total:.1f} s (one process, every dataset "
              "fitted once). Slowest datasets: " + ", ".join(
                  f"`{p_['id']}` {p_['seconds']:.2f} s" for p_ in sorted(
                      per, key=lambda x: -x["seconds"])[:5]) + ".", ""]
    out_md.write_text("\n".join(lines))
    print(f"wrote {out_json.relative_to(REPO)} and {out_md.relative_to(REPO)}")


# counts of the first run (before the fixes), per scope
_BEFORE = {
    "public datasets": {"quantities": 1264, "pass": 888, "fail": 153,
                        "unmapped": 223,
                        "cats": {"a": 12, "b": 44, "c": 67, "d": 30}},
    "whole corpus including the licence-flagged datasets": {
        "quantities": 1499, "pass": 1007, "fail": 249, "unmapped": 243,
        "cats": None},
}

AFTER_FIXES_MD = """
## After the fixes

{counts}

### What changed in `engine/opendose/`

1. **Solver tolerance** (new module `lsq.py`, used by `nlfit`,
   `globalfit`, `equations.fit_global_model` and `schild`, including the
   profile-likelihood refits, the IRLS reweighting loops and the robust
   fit): `ftol = xtol = gtol = 1e-12`, then a Gauss-Newton polish from
   the solution with an accurate central-difference Jacobian (it stops
   when the steps stop contracting). Every NIST StRD nonlinear problem of
   the corpus (Misra1a, Chwirut2, Thurber, MGH09, Lanczos3, BoxBOD,
   Rat42, Rat43, Eckerle4, Hahn1) now meets its certified estimates,
   SEs, RSS and residual SD from both NIST starts to better than 1e-7
   relative (most to 1e-9); R DNase SSfpl, growthcurver r and drc
   ryegrass ED10 pass.
2. **Scale-aware Jacobian.** Finite-difference steps
   h_i = c * max(|p_i|, s_i) with s_i = max(|p0_i|, a data scale of the
   parameter's role: Y range for Y-like parameters, median |X| for X-like
   ones, 1 for slopes, 1/X scale for rate constants, Y range / X scale^k
   for polynomial coefficients), 1 only when everything is 0. The
   optimiser gets this forward-difference Jacobian (c = sqrt(eps)) as a
   callable `jac` (this is what makes Hahn1 converge); the covariance
   uses central differences (c = cbrt(eps), Richardson-extrapolated over
   an adaptive step ladder). The same dose-response fit with X in M and
   in nM now gives the same EC50 and SE(EC50)/EC50 to 1e-10 (before: 7 %
   apart); SEs agree with an analytic 4PL Jacobian to 1e-8, also with
   Bottom = 0 or LogEC50 = 0.
3. **Degenerate fits**: a converged fit no better than a horizontal line
   (or with a rank-deficient Jacobian) restarts from more starting
   values; NIST BoxBOD from Start 1 now reaches the certified solution.
   When no restart helps the status is "ambiguous".
4. **Log-rank**: `logrank.chi2_variance` / `p_variance` (R survdiff's
   variance form) next to the Peto `chi2` / `p` (unchanged, what Prism
   reports); `logrank.method` says which is which.
5. **Two-way ANOVA with one value per cell** fits the main-effects model
   with a note (and `options.model = "additive"` asks for it with
   replicates): R `morley` and the `warpbreaks` additive model and its
   Tukey tests now map and pass.
6. **New outputs**: Fisher's exact test for r x c tables (network
   algorithm, work-limited), one-sided Fisher P values and R's
   conditional MLE odds ratio with exact CIs, expected counts with
   Pearson and adjusted standardized residuals, the generalized CMH test
   for r x c x k tables, Woolf's homogeneity test and the collapsed
   table, Kendall's tau (exact P for n < 50 without ties), one-sided
   correlation P values and confidence bounds, the Fligner-Killeen test,
   Holm's adjustment, Kaplan-Meier standard errors and the
   Brookmeyer-Crowley median CI (log-log and log bands), the quantal fit
   with an upper asymptote and observed-information SEs (drc LL.3
   binomial), and the joint covariance of `global_model_fit`.
7. **Weights inside the objective**: `weight_source = "objective"`
   minimises the weighted SS with weights from the fitted curve directly
   (R's Puromycin `nls` example); the default stays Prism's IRLS fixed
   point.
8. Also: the extra-SS F test and AICc no longer divide by zero when the
   more complex model fits exactly (now possible with the tighter
   solver), and the contingency analysis passes `ci_level` through.

### Tests whose expected values changed

* `test_nlfit.py::test_singular_covariance_is_ambiguous_not_converged`:
  BoxBOD Start 1 now converges to the certified solution (was
  "ambiguous" with NaN SEs); flat data that no start can fit better than
  a horizontal line are the new "ambiguous" case.
* `test_assay_growth.py::test_growthcurver_vignette_logistic_fit`:
  SE(r) 0.0151496 now equals the analytic-Jacobian SE (the old 0.0151263
  was 0.16 % low); the tolerance is half a printed unit of growthcurver's
  0.0151 (abs 5e-5) instead of rel 3e-3.

### Still failing

No genuine engine discrepancy (category c) is left. Every remaining
failure is classified in the table below: (b) printed or optimiser
precision of the reference (R's uniroot in fisher.test's conditional MLE
and CI, drc's optim in selenium, earthworms and ryegrass, R's nls and
glm stopping rules, Prism 4's printed digits, float64-unrepresentable
NIST inputs), (a) a different definition (drc's observed-Hessian SEs,
Bland-Altman 1986 vs 1999) and (d) reference problems. Unmapped
quantities are features the engine does not have (listed below).
"""


def _after_fixes(recs, scope):
    counts = {s_: sum(r["status"] == s_ for r in recs)
              for s_ in ("pass", "fail", "unmapped", "error")}
    cats = {}
    for r in recs:
        if r["status"] in ("fail", "error"):
            cats[r["category"]] = cats.get(r["category"], 0) + 1
    b = _BEFORE.get(scope)
    now = (f"**Now: {len(recs)} quantities: {counts['pass']} pass, "
           f"{counts['fail'] + counts['error']} fail, "
           f"{counts['unmapped']} unmapped** (failures by category: "
           + ", ".join(f"({k}) {v}" for k, v in sorted(cats.items()))
           + ").")
    if b:
        before = (f"Before the fixes: {b['quantities']} quantities: "
                  f"{b['pass']} pass, {b['fail']} fail, {b['unmapped']} "
                  "unmapped"
                  + (" (failures by category: " + ", ".join(
                      f"({k}) {v}" for k, v in sorted(b["cats"].items()))
                     + ")" if b["cats"] else "") + ".")
        now = before + "\n\n" + now
    return AFTER_FIXES_MD.replace("{counts}", now).strip()


def write_expected_failures(recs):
    """The pytest's xfail(strict=True) list: every failing quantity with its
    category and reason. Unclassified failures are refused."""
    bad = [r for r in recs if r["status"] in ("fail", "error")
           and r.get("category") in (None, "?")]
    if bad:
        raise SystemExit("unclassified failures, add them to KNOWN first: "
                         + ", ".join(f"{r['dataset']}:{r['quantity']}"
                                     for r in bad))
    out = {"note": "generated by run_corpus.py --update-expected; consumed "
                   "by engine/tests/test_reference_corpus.py (xfail strict)",
           "failures": [{"dataset": r["dataset"], "quantity": r["quantity"],
                         "category": r["category"],
                         "reason": r["category_reason"]}
                        for r in recs if r["status"] in ("fail", "error")]}
    EXPECTED_FAILURES.write_text(json.dumps(out, indent=1) + "\n")
    print(f"wrote {EXPECTED_FAILURES.relative_to(REPO)} "
          f"({len(out['failures'])} expected failures)")


def main(argv):
    write = "--no-write" not in argv
    ids = [a for a in argv if not a.startswith("--")]
    t0 = time.perf_counter()
    per, recs = summarize(ids or None)
    total = time.perf_counter() - t0
    print(f"\n{sum(p['pass'] for p in per)} pass, "
          f"{sum(p['fail'] for p in per)} fail, "
          f"{sum(p['unmapped'] for p in per)} unmapped, "
          f"{sum(p['error'] for p in per)} error in {total:.1f}s")
    if write and not ids:
        write_outputs(per, recs, total)
    if "--update-expected" in argv and not ids:
        if not PRIVATE_DIR.exists():
            raise SystemExit("--update-expected needs the private corpus "
                             "(it lists the licence-flagged datasets too)")
        write_expected_failures(recs)


if __name__ == "__main__":
    main(sys.argv[1:])
