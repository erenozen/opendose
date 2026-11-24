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


def _map_polynomial(rows, order, model):
    """Built-in polynomial model (nonlinear regression path, the curve fit
    a user picks) for B0..Bk, SEs, Sy.x, R^2 and the residual SS; the
    regression ANOVA is derived from them. The exact linear path
    (multiple regression on X..X^k) is recorded in `alt`."""
    m = Mapped()
    x, y = column(rows, "x"), column(rows, "y")
    res = run("dose_response", xy_data(rows, "x", ["y"]), {"model": model})
    fit = res["datasets"][0]["fit"]
    p = f"dose_response({model}):datasets[0].fit."
    alt = Mapped()
    _map_multiple_regression(alt, _powers_regression(x, y, order),
                             ["Intercept"] + [f"X{k}"
                                              for k in range(1, order + 1)])
    for j in range(order + 1):
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
    m.set("ms_regression", ss_reg / order,
          f"derived: ss_regression / {order}",
          alt=alt.values["ms_regression"]["value"])
    m.set("F", (ss_reg / order) / (g["ss_res"] / g["df"]),
          "derived: ms_regression / ms_residual",
          alt=alt.values["F"]["value"])
    return m


@dataset("nist-pontius")
def map_nist_pontius(entry, rows):
    """Manifest hint: built-in 'polynomial_second' (nonlinear regression).
    That is what is reported; the exact linear path (multiple regression on
    X and X^2) is recorded in `alt` for comparison."""
    return _map_polynomial(rows, 2, "polynomial_second")


@dataset("nist-filip")
def map_nist_filip(entry, rows):
    """Built-in 'polynomial_tenth' (nonlinear regression path, analytic
    Jacobian and QR covariance); multiple regression on X..X^10
    (Householder QR on raw powers) in `alt`."""
    return _map_polynomial(rows, 10, "polynomial_tenth")


@dataset("nist-noint1")
def map_nist_noint1(entry, rows):
    """linear_regression has no through-origin option; the built-in
    'line_through_origin' model (nonlinear regression path) is used. Its
    goodness carries both Prism's R^2 (about the mean) and the uncentred
    R^2 NIST certifies for no-intercept models (r_squared_uncentered)."""
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
    m.set("r_squared", g["r_squared_uncentered"],
          p + "goodness.r_squared_uncentered (NIST's uncentred R^2; "
          "goodness.r_squared = "
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
    m.set("lag1_autocorrelation", d["lag1_autocorrelation"],
          "column_statistics:datasets[0].descriptive.lag1_autocorrelation")
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


FEATURE_VALIDATION_MD = """
## Feature validation: potency across experiments (2026-11-23)

FEATURE-PLAN P-08. With a replicate map on an XY table, `dose_response`
takes `options.experiments` and also fits each experiment on its own
(`api._experiments`, the same `nlfit` path, model, constraints and
weighting), then `potency.potency_summary` summarises the log potencies
on n = experiments: mean logIC50, SD, the t interval on n - 1 df,
10^mean (geometric-mean IC50) with the antilogged CI, and pIC50 when the
unit is molar. Experiments whose fit failed, is ambiguous or is
extrapolated are named and left out; with fewer than two left the SD and
CI are withheld. The fit of all the values is unchanged (tested
byte-for-byte).

Reference: `engine/tests/reference/potency_across_experiments.py`, an
independent implementation (scipy.optimize.curve_fit on the 4PL in log10
concentration per experiment, scipy.stats.t for the interval,
cross-checked against scipy.stats.ttest_1samp and pingouin.ttest; R and
drc are not installed). Dataset: 8 concentrations (1e-9 to 3e-6 M),
3 experiments x 3 wells, true IC50 50, 100 and 200 nM, noise SD 4,
numpy default_rng(808), one decimal.

| quantity | engine | reference | tolerance |
|---|---|---|---|
| logIC50, experiments 1-3 | -7.345, -6.994, -6.764 | -7.3452, -6.9941, -6.7644 | abs 1e-6 |
| mean logIC50 (SD) | -7.035 (0.2925) | -7.0346 (0.2925) | abs 1e-6 |
| 95% CI of mean logIC50 (t = 4.303, 2 df) | -7.761 to -6.308 | -7.7613 to -6.3079 | abs 1e-6 |
| mean pIC50, 95% CI | 7.035, 6.308 to 7.761 | 7.0346, 6.3079 to 7.7613 | abs 1e-6 |
| geometric-mean IC50, 95% CI (M) | 9.235e-8, 1.733e-8 to 4.922e-7 | 9.235e-8, 1.733e-8 to 4.922e-7 | rel 1e-5 |
| two experiments: 95% CI (t = 12.71, 1 df) | -9.400 to -4.939 | -9.400 to -4.939 | abs 1e-5 |
| one well edited (row 5, Y7 = 5.0): pIC50, 95% CI | 7.12, 6.634 to 7.606 | 7.12, 6.634 to 7.606 | abs 1e-5 |

Hand derivation (test_potency.py): logs -7.2, -7.0, -6.8 give mean -7,
SD 0.2, t(0.975, 2) = 4.302653, CI -7.496828 to -6.503172; in uM the
pIC50 is 13 (12.503 to 13.497). Invariance: permuting the experiments
leaves the summary identical (1e-9); doses written in nM (x 1e9) shift
the mean logIC50 by 9 and leave the SD, the CI width and the pIC50
unchanged (1e-5). Edge cases tested: n = 0, 1, 2; a failed, a flat
(ambiguous) and an extrapolated experiment; fewer than two left;
unequal blocks with missing wells; all-equal logIC50 values; a model
without a logIC50; a replicate map naming no experiment for a
subcolumn.

Independent check (2026-11-23, a second agent that did not write the
code): its own unweighted 4PL fit per experiment with
scipy.optimize.least_squares (method "lm", own residuals, 33 starts) and
a hand t interval (t(0.975, 2) = 4.302653) reproduce the engine to about
1e-8 in raw values: logIC50 -7.345225, -6.994097, -6.764362; mean pIC50
7.034561, SD 0.292538, 95% CI 6.307856 to 7.761267; geometric-mean IC50
9.235038e-8 M (1.732739e-8 to 4.922029e-7); after the edit, experiment 3
logIC50 -7.020613 and mean pIC50 7.119979 (6.634281 to 7.605676). The
strings asserted by the P-08 step in `web/scripts/e2e-check.mjs` equal
these values at display precision. Averaging IC50 on the linear scale
would give 1.062e-7 M; the engine averages on the log scale.

## Feature validation: large tables, engine side (2026-11-23)

FEATURE-PLAN P-10 (the web side is in `figures-exports.md`, "Large pasted
tables"). Every analysis that runs by default on an XY table (linear
regression with its runs test, bands, a line through a point or the
origin with the replicates test) and on a column table (column
statistics with the normality tests, the t tests, the residual
diagnostics) was timed natively at 200,000 and 500,000 values per column.
Four paths grew faster than n or failed; each was fixed so that results
for the sizes the existing tests cover do not change (the full engine
suite and `test_prism_parity.py` pass unchanged):

| path | before | after |
|---|---|---|
| `linregress.runs_test` (exact P, big integers) | about n^2.8: 0.55 s at 5,000 residuals, 24.5 s at 20,000, no result at 200,000 | unchanged up to 2,000 residuals; above, the same exact distribution summed in floating point: 0.13 s at 500,000 |
| `diagnostics.replicates_test` (one mask over X per distinct X) | quadratic: 11.8 s at 200,000 distinct X | sorted groups, bit-identical: 0.006 s |
| Anderson-Darling P (`columnstats._anderson_darling_p`) | `OverflowError: math range error` once A2* passes about 400, so column statistics failed on 200,000 uniform values | P held at the formula's minimum (A2* = 153.47, P = 1.3e-190) beyond it, with a note |
| `residuals.column_residuals` (one dictionary per value) | 1.1 GB and a 204 MB answer at 1,000,000 values | above 50,000 values the points are withheld with a sentence naming the limit; every other number identical |

Runs test above 2,000 residuals (`RUNS_EXACT_INT_MAX_N`): the null
distribution of the number of runs (Wald & Wolfowitz 1940; Bradley 1968,
ch. 11) evaluated in logarithms, binomials as running sums of log((n - k)
/ k) outward from k = n1 n2 / N, normalised by the log-sum of all terms;
the result says `p_method` "exact" (big integers) or "exact_float". The
Wald-Wolfowitz normal approximation (mean 2 n1 n2 / N + 1) was the planned
large-n method; it was measured and not used, because it does not agree
with the exact P at the four significant digits the results show when the
signs are unbalanced (below).

Reference: `engine/tests/reference/large_tables.py` (no opendose
import): brute force over every arrangement for N <= 14 (46 cases),
exact fractions (`fractions.Fraction`, `math.comb`) up to N = 3,000, and
60-digit `decimal` sums normalised by the exact integer C(N, n1) up to
N = 500,000; the normal approximation by hand and by statsmodels'
`Runs.runs_test` (z agrees to 1e-12). Tests: `engine/tests/test_large_n.py`.

| signs (numpy default_rng(20261123)) | runs (n+, n-) | exact P (reference) | engine | normal approx. (continuity) |
|---|---|---|---|---|
| N = 2,000, half positive | 996 (987, 1013) | 0.423183 | 0.423183, big integers, equal to the fraction bit for bit | 0.423178 |
| N = 2,001, 10% positive | 367 (204, 1797) | 0.509715 | 0.509715 (rel. 4e-16) | 0.504642 |
| N = 500,000, half positive | 250,049 (249,888, 250,112) | 0.554611 | 0.554611 (rel. 2e-16) | 0.554611 |
| N = 500,000, 10% positive | 90,389 (50,291, 449,709) | 0.274730 | 0.274730 (rel. 2e-14) | 0.274255 |
| N = 200,000, a sign repeats with probability 0.503 | 99,286 (99,894, 100,106) | 0.000699487 | 0.000699487 (rel. 1e-15) | 0.000699517 |

The largest relative difference between the floating-point path and the
reference over all cases is 2.1e-14. Edge cases tested: no residuals,
one, two (one of each sign: R = 2, P = 1), all of one sign (P withheld),
zeros dropped, the most runs possible (P = 1), two runs among 2,001 (P
below the smallest double, 0), one sign alone among 2,501 (P = 2/2501);
swapping every sign and reversing the order leave P unchanged.

The XY table that `web/scripts/e2e-large.mjs` pastes (500,000 rows of
x = i/1000 and y = 2 + 0.5 x + U(0, 1) from its seeded generator, as
3-decimal text) gives, against statsmodels OLS on the same values:
slope 0.4999973620849253, intercept 2.5006526994496916 (engine equal to
1e-9 relative), and on the residual signs in row order 249,903 runs
(249,475 positive, 250,525 negative), exact P = 0.392559 (engine 0.3926
at display precision, the number the e2e test reads in the results).
The column table it pastes first (500,000 rows, a = 10 + 3u and
b = 10.4 + 3u') gives, against scipy's `ttest_ind` and a hand pooled SE:
difference -0.4005011 (SE 0.001730665), t = -231.4146 on 999,998 df,
P below the smallest double (engine: the same to 1e-9 relative, P
shown as "< 0.0001"). Shapiro-Wilk above 5,000 values keeps its
existing note (Royston's approximation is validated up to 5,000).

Times natively (Python 3.12, numpy, scipy; one process per analysis),
200,000 / 500,000 values per column: linear regression 0.17 / 0.45 s
(with confidence bands 0.33 / 1.02 s); line through the origin with the
replicates and runs tests 1.5 / 4.1 s (14.3 s at 200,000 before);
column statistics 0.43 / 1.12 s (all options: 2.6 / 7.0 s); unpaired t
test 0.16 / 0.41 s; Mann-Whitney 1.1 / 3.4 s; paired t 0.8 / 2.0 s;
Wilcoxon 1.1 / 3.1 s; Kolmogorov-Smirnov 0.2 / 0.8 s; residual
diagnostics (two columns) 4.2 / 10.8 s with 82 / 204 MB answers before,
0.4 / 1.5 s with a 2.4 KB answer after.

Independent check (2026-11-23, by the lead, who did not write the code):
an own implementation of the same exact runs distribution in log space
(scipy.special.gammaln terms summed with logsumexp, a different method
from the engine's floating-point recurrence) on seeded sign sequences
of 2,500 to 500,000 (balanced, 10% positive, and with added persistence)
agrees with `runs_test` p_method "exact_float" to at most 7.2e-10
relative, including P = 1.657e-178 at N = 20,000 and P = 0.94543216 at
N = 500,000. The committed reference stays
engine/tests/reference/large_tables.py.

## Feature validation: .xls and .ods workbooks (2026-11-23)

P-34 reads legacy .xls (BIFF8, through xlrd 2.0.2, a 96,555-byte
pure-Python wheel vendored next to openpyxl and installed only when an
.xls is first read) and OpenDocument .ods (content.xml parsed with the
standard library, no added bytes) in `engine/opendose/workbooks.py`,
with the cell-text rule the .xlsx reader has always followed. No number
is computed; the check is that a cell reaches the table as stored.
python-calamine (the other reader in Pyodide's lock file) was measured
and not used: a 496,746-byte compiled wasm wheel plus its `packaging`
dependency, for what the standard library reads.

Reference: one sheet saved by LibreOffice (soffice --headless) as .ods,
then from that .ods as .xls and .xlsx
(`web/e2e-fixtures/import/make_workbooks.py`), read back with openpyxl
3.1.5 (`data_only=True`) into `workbook.expected.json`. It holds text
with µ and °, a "007" code, 0.1, 1/3 (stored by LibreOffice as
0.333333333333333, 15 significant digits), -2.5e-09, 6.02214076e+23,
123456789012, a percent-formatted 0.125, dates (2024-03-15, 2024-02-29,
1999-12-31), a date with a time (2024-03-15 10:30), times of day (10:30:00,
23:59:59), TRUE and FALSE, a formula's saved result (=B2*2 → 0.2), a
#DIV/0! error, a blank inside the block, a two-line text, and row 7
hidden by hand. `engine/tests/test_workbooks.py`: the .xls and the .ods
read to exactly openpyxl's cells of the .xlsx on both sheets, with row 7
reported as hidden by hand in each; edge cases on hand-made content.xml
(LibreOffice's million padded rows and 16,384 padded columns not
expanded, repeated cells and rows inside the data expanded, text:s
spaces, tabs, annotations left out, a formula error, a formula saved
without a value named as C1, filter-hidden and hand-hidden rows, 1e-12
and 1e12, an empty sheet, a file that is not a spreadsheet).
`web/scripts/e2e-import.mjs`: the three files through File › Open give
the same preview cells as the reference and identical tables; xlrd is
fetched only once an .xls is read.

## Feature validation: curve-fit graph drop lines (2026-11-23)

FEATURE-PLAN P-23. No engine change: the curve-fit graph's IC50 / EC50
drop lines read their point from the fit the results report. For the 19
relative dose-response models listed in `web/src/sheets/xy/fitGraph.ts`
(`RELATIVE_MODELS`) the point is the range flags' `midpoint` and
`half_response` ((Top + Bottom) / 2, or 50 for normalised models); for
the two absolute IC50 models it is (LogAbsoluteIC50 or AbsoluteIC50,
(Top + Baseline) / 2). `engine/tests/test_fit_graph.py` reads that list
from the TypeScript file and checks, for each model, that its own
equation (`equations.py`, `nlfit.py`) at the midpoint equals that
response to 1e-12 relative over 20 random parameter sets (seed 23); the
5PL qualifies because its equation places LogXb so that the EC50 is the
half-way point. A fit the results flag (ambiguous, or a midpoint beyond
the concentrations tested) gets no lines and a legend sentence instead.

Reference: `engine/tests/reference/fit_graph.py` (engine fits of the
example table, and each model's equation evaluated at the midpoint).
Values pinned: relative 4PL LogIC50 -6.98304, response 50.4181 (the
equation at that x: 50.418145487472, the range flags' half response
50.418145487472); absolute IC50 with Baseline 0: LogAbsoluteIC50
-6.97524, response 49.9281. e2e-figures turns the lines on, reads the
shapes (x equals the LogIC50 the results table shows, y equals the drawn
curve interpolated at x to 0.05 and the reference to 5e-5), changes a Y
value (51.2 to 30 at 1e-7 M: LogIC50 -7.056, the line follows) and
checks the absolute model.

## Feature validation: geometric summaries on column graphs (2026-11-23)

FEATURE-PLAN P-25. No engine change: the column scatter and bar graphs
gain "Geometric mean ×/÷ geometric SD" and "Geometric mean with 95% CI"
(`web/src/sheets/column/graphSettings.ts summaryOf`). On l = ln(x):
g = exp(mean(l)), s* = exp(SD(l)) with n - 1, bar ends g / s* and g × s*
(Limpert & Stahel 2011, PLoS ONE 6:e21403, the "×/" notation); the CI is
exp(mean(l) ± t(0.975, n - 1) SD(l) / √n). A group with a value of 0 or
less gets no geometric summary (no logarithm): the points stay, and the
graph options and the legend name the group.

Reference: `web/src/sheets/column/__tests__/reference/geo_summary.py`
(numpy, scipy.stats.gmean and gstd, scipy.stats.t; R is not installed).
Fold changes 0.5, 1, 2, 4: g = 1.414213562373095, s* = 2.4469666667017522,
ends 0.5779455771170363 and 3.4605334467245026, 95% CI 0.34050 to 5.87366.
Unit tests also cover n = 1, all values equal (s* = 1), 1e-12 and 1e12
magnitudes, a ×10 unit change (g scales, s* does not) and group order.
e2e-figures reads the bar ends from the drawn trace on a log axis (to
1e-12 relative) and checks the Checks row note for bars on a log axis or
on an axis starting at 1 (source: Healy, Data Visualization, ch. 1, "bar
charts should generally include a zero baseline ... given that bars
encode their variables as lengths").

Independent check (2026-11-23, by the lead): for 0.5, 1, 2, 4 the logs
have mean 0.34657 (g = 1.41421) and SD on n - 1 of 0.89487
(s* = 2.44697), so the bar ends are 0.57795 and 3.46053, as asserted.

## Feature validation: median with IQR under a rank test (2026-11-23)

FEATURE-PLAN P-26. No engine change. Column graphs created from now on
start with the centre "Follow the test": mean ± SD, or median with IQR
while the bound analysis is Mann-Whitney, Wilcoxon, Kolmogorov-Smirnov,
Kruskal-Wallis, Friedman or the median test
(`web/src/sheets/column/rankSummary.ts`). A graph whose centre the user
chose, and every graph saved before (no "auto"), keeps what it draws. The
median and IQR now come from `graph/boxStats.ts percentileOf` with the
column statistics' percentile method, as the box plots do (before: an
own linear interpolation, equal to it except in the last bit). The
results headline adds one line on what the test compares (Hart 2001, BMJ
323:391: the Mann-Whitney test "is a test of both location and shape").

Reference: `web/src/sheets/column/__tests__/reference/geo_summary.py`,
numpy.percentile with method "linear" (H&F 7) and "weibull" (H&F 6, the
"prism" method) on the example column table: Control 22.725 / 24.0 /
25.275 (type 7) and 22.4 / 24.0 / 25.55 (type 6); Treated A 28.5 / 28.9 /
29.9; Treated B 34.375 / 35.5 / 36.4. e2e-figures chooses Mann-Whitney
and reads the drawn medians and IQR ends (to 1e-9), the results line and
the legend, and checks that a graph saved before keeps mean ± SD.
## Feature validation: results honesty, wave 1 (2026-11-23)

R is not installed on the build machine; every reference below is a
Python oracle (scipy, statsmodels in `/home/eren/opendose/.venv`), a
hand derivation, or a brute-force enumeration, and the script that
produced each pinned value is committed next to its test.

### P-11 residual plots of curve fits and linear regression

`nlfit.fit_model` now keeps the points it fitted with their fitted
values and final weights (internal `_residuals`, dropped from the
answer); `residuals.fit_residuals` turns them into the residual block
each fitted data set carries (`residual_check`): the raw residual
Y − Ŷ (R's `residuals(nls)`), the plotted residual (the weighted
residual √w (Y − Ŷ) when the fit is weighted, else the raw one), the
standardized residual = plotted / Sy.x (R's `residuals(nls, type =
"pearson")`, statsmodels' `resid_pearson`), the Filliben normal
quantile of each residual's rank (as `scipy.stats.probplot`) and
Shapiro-Wilk on the plotted residuals. Robust fits (Lorentzian scatter)
and fits of means with SD and n say why they have none.

Reference: `engine/tests/reference/fit_residuals.py` (scipy
`curve_fit` from NIST Start 2, statsmodels WLS and OLS), tested in
`engine/tests/test_fit_residuals.py`:

| Problem | n | Sy.x (reference) | first raw residual | first standardized | engine |
| --- | --- | --- | --- | --- | --- |
| NIST Misra1a | 14 | 0.101879 | 0.0837336 | 0.821895 | equal to 1e-5 relative |
| NIST MGH09 | 11 | 0.00662792 | 0.00130638 | 0.197102 | equal to 1e-5 relative |
| Dose-response example, 4PL | 27 | 1.6095 | −1.07155 | −0.665762 | equal to 1e-5; W = 0.97639 |
| Line, 1/X² weights (WLS) | 10 | 0.0920879 | 0.0286853 | 0.311499 | equal to 1e-6 |
| Line (OLS) | 10 | 0.736135 | −0.00764331 | −0.010383 | equal to 1e-9 |

The weighted SS of the plotted residuals equals the fit's weighted SS
(1/X²: 1e-9; 1/Y² from the predicted Y, iterated: 1e-6). Edge cases: a
curve through every point (standardized residuals undefined, said so),
no residual df, more than 50,000 points (points withheld, Shapiro-Wilk
kept), ROUT (the removed outliers are not among the residuals), units
×1e-12 and ×1e12 (residuals scale, standardized residuals and QQ
positions unchanged), permuting the points (residuals permute, W
unchanged).

The plan's acceptance test speaks of 24 points; the shipped
dose-response example has 9 doses × 3 replicates = 27, and the e2e
test (`web/scripts/e2e-results.mjs`) asserts 27 points in each of the
three plots and W = 0.9764 in the Checks row.

### P-11 residual plots of two-way, three-way, repeated-measures, nested and mixed models

`residuals.model_residuals` gives these models the same residual block
(`kind: "model"`, with the name of the fitted value). Two-way ANOVA
with interaction: value minus its cell mean; main effects only (asked
for, or forced by one value per cell): value minus the fitted row +
column effects (least squares on dummies, so unbalanced tables are
right); three-way: value minus its cell mean; repeated-measures one-way
with any number of treatments: value minus subject mean minus treatment
mean plus grand mean, on the complete subjects (the "not computed yet"
note for three or more treatments is gone); the mixed model for RM with
missing values and the nested t test / one-way ANOVA: conditional
residuals (value minus fixed effects minus the predicted random effect)
standardized by the model's residual SD. OLS residuals are standardized
by √MS residual. A value alone in its cell (residual 0 by construction)
is shown but left out of the QQ plot and Shapiro-Wilk, as for the
column tests. Two-way, three-way and nested results show the section in
the Checks row; RM and the mixed RM model keep it under the results
like the other column tests.

Reference: `engine/tests/reference/anova_residuals.py` (statsmodels
`ols(...).resid` / `.resid_pearson`, `MixedLM` by REML `.resid` /
√scale), tested in `engine/tests/test_anova_residuals.py`:

| Model | n | residual df / SD | first residual | first standardized | engine |
| --- | --- | --- | --- | --- | --- |
| Two-way 2 × 3 × 4, `y ~ A * B` | 24 | df 18 | −0.45 | −0.501118 | 1e-9 |
| Two-way, `y ~ A + B` | 24 | df 20 | 0.666667 | 0.415176 | 1e-8 |
| Two-way unbalanced, `y ~ A * B` | 21 | df 15 | −0.333333 | −0.3739 | 1e-8 |
| Two-way unbalanced, `y ~ A + B` | 21 | df 17 | 0.996226 | 0.59792 | 1e-8 |
| Three-way 2 × 2 × 2 × 3 | 24 | df 16 | −0.1 | −0.211407 | 1e-8 |
| RM one-way, 6 subjects × 4, `y ~ subject + treatment` | 24 | df 15 | −0.6125 | −0.61105 | 1e-8 |
| Mixed RM (one value missing), MixedLM | 23 | SD 1.03766 | −0.596629 | −0.574977 | 1e-4 (REML optimum) |
| Nested, 2 groups × 3 subcolumns, MixedLM | 22 | SD 0.940818 | −0.779965 | −0.829028 | 1e-4 (REML optimum) |

The REML residual SDs agree to 2.4e-5 relative: two optimizers, the
same optimum to that precision, so the mixed-model values are pinned at
1e-4. Edge cases: one value per cell (additive fallback, df 4 on a 3 × 3
table), a single-value cell, every residual 0, units ×1e-12 and ×1e12,
reordering the data sets (the same residuals, the same W). The plan's
acceptance test (2 × 3, 4 replicates: 24 cell-mean residuals) runs in
`web/scripts/e2e-results.mjs`, with W = 0.9744 (scipy Shapiro-Wilk on
the statsmodels residuals). Found on the way, not changed: two-way
ANOVA on a table whose cells have no scatter at all (every residual 0)
stops with "float division by zero" instead of a sentence.

### P-15 the smallest P a rank test can reach

Mann-Whitney, the Wilcoxon matched-pairs test, Kruskal-Wallis and
Friedman now carry `min_attainable_p` (exactdist.min_p_*): the P value
the test itself gives for the most extreme arrangement of the values
entered (one group entirely below the other; every difference of the
same sign; groups as contiguous blocks of ranks in the order of sizes
that maximises H; every subject ranking the treatments the same way),
by the method the test used (exact, exact with ties, or its chi-square /
normal approximation), two-sided and, for the two-group tests,
one-sided. The exact rank-sum case with ties reads the mass at the
extreme rank sums from the null distribution the P value was computed
from (cached, so the main P value now builds it once instead of twice:
100 vs 100 values with ties, 1.6 s natively before, 0.9 s with the
floor). Every existing P value is unchanged.

References (`engine/tests/test_rank_floor.py`, computed inside the
test): the hand derivations without ties, 2 / C(n1 + n2, n1)
(Mann-Whitney; 3 vs 3: 0.10, the plan's acceptance test), 2 / 2^n
(Wilcoxon), (k!)^(1 − n) (Friedman), and 6 / 90 for Kruskal-Wallis
with 2, 2 and 2 values; scipy `mannwhitneyu(method = "exact")` and
`wilcoxon(method = "exact")` on the extreme data; brute-force
enumeration (itertools) of every relabelling with ties for
Mann-Whitney, Kruskal-Wallis and Friedman; the chi-square
approximation at the largest H. The Checks row note ("With 3 and 3
values the smallest possible two-sided P is 0.10, so this design cannot
reach P < 0.05") cites the GraphPad statistics guide page "Nonparametric
tests with small and large samples" and FAQ 1721 "Analyzing ratios with
logs", and links the "Rank tests with few values" explainer.

### P-16 the Analysed line of regression, Cox and contingency results

Multiple, logistic and Poisson regression and Cox regression now return
`analysed_rows` (multivar.analysed_rows): the rows used, the rows of the
table that hold any value, and each dropped row (numbered as the grid
numbers it) with the model's variables that are blank in it or hold text
that is not a number. The Notes strip reads it per kind: "Analysed: 26
of 30 rows; 4 dropped for a blank in Age (rows 3, 9, 17, 22)." (Cox on a
survival table counts subjects, whose order is not the grid's);
contingency tables say n is the sum of the counts. Assay modules keep no
Analysed line: each reads its table its own way (see the report).

Reference: `engine/tests/reference/analysed_rows.py` (statsmodels OLS,
GLM binomial and Poisson, PHReg, all with `missing = "drop"`): nobs 26
of 30 for every model with Age, 25 with "n/a" typed in Dose row 27 (named
"not a number"), 30 for a model without Age; the dropped rows equal
pandas' missing rows. Edge cases: trailing blank rows, a row with values
only in unused columns, no complete row (an error, not 0), the table
upside down (the same count, the rows renumbered).

### P-18 ratio to control with a Fieller CI

The unpaired t test (pooled SD) now returns `ratio_to_control`: the mean
of the second data set over the mean of the first (the first is the
control, as Dunnett's default) with Fieller's (1954) interval on the
pooled SD and df = n1 + n2 − 2, which is what R's
`mratios::ttestratio(var.equal = TRUE)` computes (`ttests.
ratio_to_control`, through `compare_params.fieller_ratio`). Each
Dunnett comparison carries `ratio` with simultaneous Fieller intervals:
Dunnett's critical value of the ratio statistics, whose correlations
λᵢλⱼ (λᵢ = ρᵢ / √(n₀/nᵢ + ρᵢ²)) are evaluated at the estimated ratios
(the "plug-in" method of Dilba, Bretz & Guiard 2006, J Stat Plan
Inference 136:2640; `mratios::sci.ratio(method = "Plug")`), in
Fieller's formula. When the control mean is not clearly different from
zero (g = c² SE₀² / mean₀² ≥ 1) the interval is unbounded and the
results say so in words. Welch's t test and the paired tests get no
ratio (the pooled-SD interval does not apply). Every existing number
is unchanged; the typeset table adds "Ratio Treated/Control" and "95%
CI of ratio (Fieller)", and "What this means" for the unpaired t test
replaces the bare percentage with the ratio and its CI (ruling 10:
pinned below and in `web/scripts/e2e-results.mjs`).

Reference: `engine/tests/reference/fieller_ratio.py` (Fieller's
quadratic solved by `np.roots`, not the engine's closed form; Dunnett's
plug-in critical value by nested adaptive quadrature with
`scipy.integrate.quad`, not `opendose.dunnett`'s trapezoidal rule),
tested in `engine/tests/test_ratio_to_control.py`:

| Case | Ratio | 95% CI (reference) | engine |
| --- | --- | --- | --- |
| Control 100, 95, 105, 98, 102; treated 60, 70, 65, 55, 75 | 0.65 | 0.57615 to 0.72919 | 1e-10 relative |
| Control 3, −4, 6, −2, 1; treated 10, 14, 9, 12, 15 | 15 | unbounded | unbounded (g ≥ 1) |
| Dunnett, Low / Control (c = 2.599035) | 0.924 | 0.84907 to 1.00498 | 1e-9 |
| Dunnett, Mid / Control | 0.80667 | 0.73956 to 0.87905 | 1e-9 |
| Dunnett, High / Control | 0.65 | 0.58386 to 0.72040 | 1e-9 |

Coverage: 2,000 seeded data sets (n = 5 + 5, SD 5, true ratio 0.65):
the hand interval and the engine's both cover 1,910 times (95.5%;
binomial tolerance ±1.46 points). Dunnett, 1,000 seeded data sets of a
control and three groups (true ratios 0.9, 0.8, 0.65): the three
engine intervals cover together 946 times (94.6%; tolerance ±2.07 points).
Units ×1e-9 leave the ratio and its CI unchanged; swapping the groups
inverts the ratio and its limits.

### Wave 0 follow-up: linear regression's runs test in order of X

The runs test of linear regression (and of the line through a point)
read the residual signs in the order the rows were entered, so a table
typed unsorted got a different number of runs and a wrong P. It now
orders the residuals by X first (a stable sort: residuals at the same X
keep their entry order, stated in `runs_test.order`), as the curve-fit
diagnostics already did. `engine/tests/test_linregress_runs_order.py`:
shuffling the rows leaves the runs test unchanged; on an 8-point line
whose residuals run −, −, +, +, +, +, −, − along X, 3 runs and P = 8/70
by enumerating all 70 sign arrangements (entry order 1, 3, 2, 4, 7, 5,
8, 6 gave 8 runs before the fix). No existing pin moved: every engine
test passes, and the 500,000-row table of e2e-large is entered sorted
by X.

Independent check (2026-11-23, by the lead, who did not write the code):
Fieller (1954) solved directly as a quadratic with numpy on the P-18
example (control 100, 95, 105, 98, 102; treated 60, 70, 65, 55, 75;
pooled SD, t(0.975, 8)) gives ratio 0.65, 95% CI 0.5762 to 0.7292, as
the engine. For Dunnett, the plug-in critical value of Dilba, Bretz &
Guiard (2006) recomputed from the ratio-dependent correlation matrix
with scipy.stats.multivariate_t (equicoordinate 95% quantile, df 17) is
c = 2.599, and the simultaneous intervals are Low 0.924 (0.8491 to
1.005), Mid 0.8067 (0.7396 to 0.8791), High 0.65 (0.5839 to 0.7204), as
the engine to four digits. (Dunnett's critical value for differences,
2.573 from scipy.stats.dunnett, gives slightly narrower intervals; it is
not the method used.) The rank-test floor for 3 vs 3 values is
2 / C(6, 3) = 0.10 by hand.

## Feature validation: tests, wave 1 (2026-11-23)

FEATURE-PLAN P-12, P-13, P-14 and P-47. R is not installed here (TOSTER,
`pairwise.prop.test`, `poisson.test` and `lm` could not be run), so each
reference is a Python oracle that does not share code with the engine,
or a published value, named per feature. Every existing result is
unchanged: each feature is an option that is off by default (P-47 is a
new handler), and the payloads of the analyses with the option off are
byte for byte what they were.

### P-12 equivalence and non-inferiority (two one-sided tests)

`ttests.tost` runs Schuirmann's (1987) two one-sided tests on the test's
own estimate, SE and df: unpaired and Welch (A − B), paired (mean of
A − B), one sample (mean − hypothetical, `column_statistics`), and on
the log scale (log-scale unpaired or paired t test, ratio paired t test)
the ratio A / B with ratio margins. One margin gives a non-inferiority
test. Two proportions (`proportions.tost_two_proportions`) use the
Miettinen-Nurminen score statistic with the restricted maximum-likelihood
proportions (Farrington-Manning closed form) and the matching score CI,
so the decision and the interval always agree.

Reference: `engine/tests/reference/equivalence_tost.py` (statsmodels
0.15 `ttost_ind` pooled and unequal, `ttost_paired`,
`DescrStatsW.ttost_mean`, the log forms with `transform=np.log`, and
`ttest_ind(value = -m, alternative = "larger")` for non-inferiority;
two proportions by direct numerical maximisation of the restricted
likelihood), tested in `engine/tests/test_equivalence.py`:

| Case | Estimate | 90% CI | P (TOST) | engine |
| --- | --- | --- | --- | --- |
| Plan's acceptance, n = 8 + 8, means 10.2 and 10.0, SD 0.5, margin ±1 | 0.2 | −0.24033 to 0.64033 | 0.0032103 (equivalent) | 1e-9 relative |
| Same, margin ±0.5 | 0.2 | −0.24033 to 0.64033 | 0.12503 (not shown) | 1e-9 |
| Welch, n = 6 + 9, margin ±1.5 | 0.19444 | −0.97243 to 1.36132 | 0.034738 | 1e-9 |
| Paired, 10 pairs, margin ±0.25 | 0.04 | −0.047274 to 0.12727 | 0.00084671 | 1e-9 |
| One sample (n = 9) vs 100, margin ±1 | 0.1 | −0.51048 to 0.71048 | 0.012696 | 1e-9 |
| Log ratio, unpaired, margins 0.8 to 1.25 | ratio 1.00944 | 0.93370 to 1.09134 | 0.00013445 | 1e-9 |
| Non-inferiority, margin −0.5 | 0.2 | | 0.0070902 | 1e-9 |
| Two proportions 45/50 vs 43/50, ±0.1 | 0.04 | −0.071602 to 0.15398 | 0.18474 | 1e-7 |
| Two proportions 7/34 vs 1/34, ±0.2 | 0.17647 | 0.054663 to 0.31601 | 0.38061 | 1e-7 |

statsmodels' own `tost_proportions_2indep(method="score")` is not the
reference for two proportions: in 0.15 its restricted estimate is not
the maximum of the likelihood (45/50 vs 43/50 at δ = 0.1: p1 = 0.91538
with log-likelihood −36.9292, while the maximum is at p1 = 0.91997,
−36.9178), so its P (0.18833) differs from the score test's in the third
digit.

Properties: in 200 seeded pairs of samples (pooled and Welch) and 100
seeded pairs of proportions, P_TOST is the larger one-sided P and is
below α exactly when the 90% CI lies inside the margins (Schuirmann's
identity). Units ×1e-12, ×1000 and ×1e12 with the margin scaled alike
leave P unchanged; swapping the groups with mirrored margins swaps the
two tests. Edge cases: a group of 1 withholds the t test and the TOST;
SE 0 (every paired difference equal) gives P 0 inside the margin and 1
outside or on it; a ratio margin on a difference test, a difference
margin on a log test, a rank test, margins in the wrong order and a
ratio margin of 0 each return "unavailable" with the reason.

### P-13 comparing slopes and intercepts of regression lines

`linregress.compare_lines` (linear regression, `options.compare_lines`,
two or more data sets): the F test of one common slope against a slope
per line, then, with the lines parallel, the F test of one line against
parallel lines (the intercepts), the common slope with its CI, each
line's intercept at the common slope, the pooled line, and for two lines
the slope difference with its CI (t² = F). The results say the
intercept test is meaningful only when the slopes are not shown to
differ, next to its P.

Zar's worked example (Biostatistical Analysis, 5th ed. 2010, sec.
18.1 to 18.2, pp. 363 to 371) could not be obtained (no copy of the
book; no reproduction of its data was found), so it is not pinned. The
reference is statsmodels 0.15 OLS: `anova_lm(ols("y ~ x + C(g)"),
ols("y ~ x * C(g)"))` and `anova_lm(ols("y ~ x"), ols("y ~ x + C(g)"))`
(R's `anova(lm(y ~ x + g), lm(y ~ x * g))`),
`engine/tests/reference/compare_lines.py`, tested in
`engine/tests/test_compare_lines.py` to 1e-9:

| Case | Slopes F (df), P | Intercepts F (df), P | Common slope (95% CI) |
| --- | --- | --- | --- |
| Two parallel lines, 8 + 8 points | 0.64403 (1, 12), 0.43786 | 987.85 (1, 13), 1.19e-13 | 1.99524 (1.95099 to 2.03949) |
| Two diverging lines, 6 + 6 points | 621.50 (1, 8), 7.17e-9 | 14.757 (1, 9), not meaningful | 1.45571 |
| Three lines, one blank Y, 17 points | 0.12308 (2, 11), 0.88539 | 224.63 (2, 13), 8.30e-11 | 1.99317 (1.94643 to 2.03991) |

Slope difference of the parallel lines: −0.033333 (95% CI −0.12383 to
0.057166). Invariance: swapping the data sets negates the slope
difference and leaves both F tests; Y ×1000 with X ×1e-6 (and ×1e-12,
×1e12) leaves every F and P and scales the common slope. Edge cases: a
line with fewer than 3 points or a single X, a line forced through a
point, and perfectly straight lines (F undefined, said in words).

### P-14 pairwise comparisons of rows after an r x c test

`contingency.pairwise_rows` (`options.pairwise`, three or more rows):
each pair of rows on its own 2 x c table, by Fisher's exact test when
any expected count is below 5 (Cochran 1954) and otherwise by the
chi-square test (2 x 2 with Yates' correction, as R's `prop.test`), or
by the test chosen; P values adjusted over the family with Holm,
Benjamini-Hochberg or Bonferroni (`fdr.adjust`). Each pair names its
test and why; the family line says "adjusted for 3 comparisons (Holm)".

Reference: `engine/tests/reference/pairwise_proportions.py` (scipy 1.18
`fisher_exact` and `chi2_contingency` per pair; 2 x 3 Fisher by brute-
force enumeration of every table with the observed margins; statsmodels
`multipletests` holm, fdr_bh, bonferroni), tested in
`engine/tests/test_pairwise_proportions.py` to 1e-9:

| Plan's acceptance: WT 18/20, Het 15/20, KO 5/20 | Test | Raw P | Holm P |
| --- | --- | --- | --- |
| WT vs Het | Fisher (expected 3.5) | 0.40748 | 0.40748 |
| WT vs KO | chi-square, Yates | 0.00012396 | 0.00037188 |
| Het vs KO | chi-square, Yates | 0.0044265 | 0.0088531 |

Also four groups (six chi-square pairs) and a 3 x 3 table (three 2 x 3
Fisher pairs), each with all three corrections. Swapping the outcome
columns or reversing the rows changes no P. A row of zeros or a pair
with every count in one outcome is not tested and leaves the family.

Not done: the brackets on the contingency graphs. The graph draws its
bars on a category axis with stacked segments, where the bracket layer
(graph/apply.ts) can find neither the bar positions nor the stack tops;
drawing them needs graph-layer work outside this task.

### P-47 comparing two event rates

`rates.compare_rates` (handler `rate_compare`; "Compare two event
rates…" in the Analyze menu, File > Tools and the command palette): the
exact conditional test of the rate ratio (binomial, given the total;
Przyborowski & Wilenski 1940), the rate ratio with the exact conditional
CI (Clopper-Pearson mapped by p / (1 − p) × T2 / T1) and each rate's
exact Poisson CI (Garwood 1936), as R's `poisson.test`.

Reference: `engine/tests/reference/event_rates.py` (statsmodels 0.15
`test_poisson_2indep(method="exact-cond")`, `proportion_confint(method=
"beta")`, `confint_poisson(method="exact-c")`), tested in
`engine/tests/test_event_rates.py` to 1e-8:

| Case | Rate ratio (95% CI) | P (two-sided) |
| --- | --- | --- |
| Plan's acceptance: 23 events in 10 h vs 41 in 12 h | 0.67317 (0.38560 to 1.14851) | 0.13351 |
| R's `?poisson.test` example: 11 in 800 vs 21 in 3011 | 1.971488 (0.8584264 to 4.2772659) | 0.07967 |
| 2 in 0.5 mm² vs 9 in 1.25 mm² | 0.55556 (0.058412 to 2.68410) | 0.73923 |

The R help-page example matches the output printed there to every
digit shown. Exposure in other units (hours to minutes, ×1e-12, ×1e12)
leaves the ratio, its CI and P unchanged; swapping the groups inverts
the ratio and swaps the one-sided P values. No events at all gives the
rates and their CIs and says there is no test; no events in group 2
gives an unbounded ratio, said in words.

Independent check (2026-11-23, by the lead, with scipy and numpy only,
not the statsmodels oracles above): TOST by hand from the t
distribution (pooled SD, 14 df) gives 90% CI -0.24033 to 0.64033,
P_TOST 0.0032103 at ±1 and 0.12503 at ±0.5; per-pair Fisher (any
expected count < 5) or Yates chi-square with a hand Holm step-down
gives 0.40748, 0.00037188 and 0.0088531 for WT/Het, WT/KO and Het/KO;
the conditional binomial for 23 events in 10 h vs 41 in 12 h gives
P = 0.13351 and, through Clopper-Pearson limits, ratio 0.67317 (0.38560
to 1.14851), rate 1 = 2.3 (1.4580 to 3.4511); numpy least squares for
the P-13 lines gives slopes F(1, 12) = 0.64403, P = 0.43786 and the
common slope 1.99524. All equal the engine at the precision shown.

## Feature validation: fit models, wave 1 (2026-11-23)

R and drc are not installed here. Each oracle below is a Python script
committed next to its test; where a published table exists it anchors
the script first.

### P-19 Weibull and hormesis dose-response models

Six models in a new family, "Dose-response - Weibull and hormesis, X is
concentration", with drc's parameter letters: Weibull type 1 and 2
(drc W1.4, W2.4; Ritz 2010, Environ Toxicol Chem 29:220), Brain-Cousens
(BC.5 and BC.4 with c = 0; Brain & Cousens 1989, Weed Res 29:93) and
Cedergreen-Ritz-Streibig (CRS.5 and CRS.4 with c = 0, alpha an entered
constant; Cedergreen et al. 2005, Environ Toxicol Chem 24:3166). All are
written on the concentration scale, so the zero dose stays in the fit.
b is held positive for W1.4 and the hormesis models and negative for
W2.4: with b free to change sign the two Weibull models are one family
(W1.4 with b < 0 is W2.4 with c and d swapped), so these are the signs
drc's self-starters use on a falling curve. ED10, ED50 and ED90 are
drc's relative EDs (p% of the way from d, the zero-dose response, to c),
with a delta-method SE and estimate ± t × SE interval; e is the
inflection point (Weibull) or a location parameter (hormesis), not the
ED50, and the results say so under the table. EDs beyond the doses
tested are named there too.

Reference: `engine/tests/reference/weibull_hormesis.py` (scipy
least_squares on the published formulas, grid of starts, J'J
covariance, EDs solved numerically from the curve), on drc's
`ryegrass` and `lettuce` data (`engine/tests/fixtures/drc_datasets.json`,
copied from the Rdatasets export of drc). Anchor: the same script fits
drc's LL.3 to ryegrass and reproduces Ritz et al. (2015) PLOS ONE
10:e0146021, S1 File, Example 2, to every digit printed: b 2.47033,
d 7.85543, e 3.26336, residual SE 0.5615802 (21 df), ED10 1.34086
(0.94773 to 1.7340). drc's standard errors come from the Hessian of the
residual SS (0.34168, 0.20438, 0.19641, reproduced by the script); the
engine, like Prism and R's nls, uses the Gauss-Newton covariance
s² (J'J)⁻¹ (0.31874, 0.20798, 0.20220), so SEs differ from drc's in the
second or third digit while estimates and EDs agree. OpenDose's
[Inhibitor] vs. response (variable slope) with Bottom = 0 is LL.3 and
gives the published estimates (`test_weibull_hormesis.py`).

| Data, model | Parameters (SE, J'J) | ED50 (95% CI) | Sy.x |
| --- | --- | --- | --- |
| ryegrass, W1.4 | b 2.3933 (0.4396), c 0.66045 (0.1864), d 7.8059 (0.2076), e 3.6001 (0.1942) | 3.0889 (2.7232 to 3.4547) | 0.548824 |
| ryegrass, W2.4 | b -1.9678 (0.2885), c 0.32457 (0.2488), d 7.7263 (0.1731), e 2.4876 (0.1476) | 2.9969 (2.5857 to 3.4082) | 0.514420 |
| lettuce, BC.5 | b 1.5030, c 0.28081, d 0.96306, e 1.1218, f 0.98631 (0.9421) | 12.298 (-13.833 to 38.430) | 0.114912 |
| lettuce, BC.4 | b 1.2827 (0.0522), d 0.96718, e 0.84593, f 1.6245 (1.2067) | 35.052 (-0.473 to 70.577) | 0.111792 |
| lettuce, CRS.5 (alpha 1) | b 1.3280, c 0.44841, d 1.0352, e 1.2782, f 2.1018 | 5.5189 (1.8075 to 9.2304) | 0.130488 |

Engine and reference agree to 2e-5 (estimates, EDs) and 2e-3 (SEs, CI
limits) for all seven model and data pairs tested, including CRS.4 and
W1.4 on lettuce. Noiseless curves with two zero-dose points are
recovered to 1e-5 and noisy ones match scipy curve_fit
(`test_equations.py`). Concentration ×1000 scales e and every ED by
1000 and leaves b, c and d; response ×10 scales c, d and f only. Flat
data give an ambiguous fit or a sentence, never a traceback; CRS without
alpha asks for it. The BC.4 lettuce ED90 (10096) lies 100-fold past the
highest concentration and is reported as read off the model's tail.

### P-20 range constraints on built-in models

`nlfit.fit_model(bounds={name: [lo, hi]})` (options `bounds` of
`dose_response`, also through robust regression, ROUT and the
per-experiment fits): greater than, less than or between, on top of the
model's own range (never wider). The fit switches to the bounded
trust-region solver; a parameter that ends on its limit is reported at
the limit itself and marked `at_bound`, and its row says "at its
constraint: SE not reliable" (curve-fitting guide, "Constraining
parameters"). In the controls a range needs a stated reason, which the
methods sentence carries; ranges apply to curves fitted one at a time
(a global fit says to hold the parameter constant instead).
Relational constraints (Kfast > Kslow) stay out.

Reference: `engine/tests/reference/range_constraints.py` (scipy
least_squares with bounds, trust-region reflective, on the 4PL written
out there; R's nls(port) is not installed), tested in
`engine/tests/test_range_constraints.py` (estimates to 1e-6, SEs to
2e-3). Data: one inhibition curve, 9 log doses in triplicate.

| Case | Bottom | Top | LogIC50 | HillSlope | Sy.x |
| --- | --- | --- | --- | --- | --- |
| Free fit | -4.4024 | 100.149 | -6.86818 | -1.12122 | 2.65765 |
| Bottom > 0 (at its limit) | 0 | 99.2961 | -6.90593 | -1.25189 | 3.31644 |
| HillSlope between -1 and -0.3 (at -1) | -6.2368 | 101.603 | -6.86352 | -1 | 2.89885 |
| Bottom > -10 (inactive) | -4.4024 | 100.149 | -6.86818 | -1.12122 | 2.65765 |

An inactive limit gives the free fit to 1e-7; Y ×1000 with Bottom > 0
keeps Bottom at 0 and scales Top by 1000; LogIC50 names the midpoint as
in constants. A lower limit above the upper one, a range on a parameter
held constant, an unknown parameter or a missing limit each give a
sentence saying what to fix.

### P-21 initial values shown, typed and exported

Every curve fit now returns `initial_values` {name: {value, source}}:
the start of each free parameter, from the model's rules ("rule") or
typed by the user ("typed", options `initial_values`), and `starts`
(how many starts were tried, the parameter they seed, whether a
degenerate point forced a restart). With a typed start the fit runs
from that start alone. The results show the starts in an "Initial
values" fold under each fit, with "Copy fit report" (text) and a CSV
download: model, equation, initial values, constraints with their
reasons, weighting, CI method, every parameter with SE and CI, and the
goodness of fit. Projects saved before open with automatic starts
(`fitReport.test.ts` loads two committed fixtures).

Reference: `engine/tests/reference/initial_values.py` (the
log(inhibitor) vs. response rules computed by hand, and scipy
least_squares from two starts; R's nls is not installed), tested in
`engine/tests/test_initial_values.py`. On the app's example (9
concentrations in triplicate) the rules give Top 101.5 (YMAX), Bottom
0.5 (YMIN), LogIC50 -7 (the X of the value nearest the mid response),
HillSlope -1. From those starts and from a typed LogIC50 = -5 the fit
reaches the same point as scipy from either start: Top 99.85616,
Bottom 0.98013, LogIC50 -6.983042, HillSlope -1.103468, SS 59.58161
(estimates to 1e-7, SEs to 1e-4). The reported starts of Weibull,
[Agonist] vs. response, one-site total binding and exponential plateau
equal their registered rules exactly. A start for a parameter held
constant, an unknown parameter or a non-finite value gives a sentence
saying what to fix; a start outside a range is moved inside it.

### P-51 simulating from a user-defined equation

`simulate.simulate_xy(user_equation=...)` (options `user_equation` of
`simulate_xy`, and of a Monte Carlo analysis's simulation): the equation
is compiled and registered exactly as a fit of it registers it (one
model per data set, since <A> and <~A> lines can differ), its constant
defaults fill parameters not given, and the ideal Y is that model's
function at every X. The Simulate dialog and the Monte Carlo analysis
list the saved equations under "User-defined equations"; a table
simulated from one gets a curve fit of the same equation, and a Monte
Carlo run fits the equation itself.

Validation is identity (`engine/tests/test_simulate_user_equation.py`):
for Y = A·exp(-k·X) with A = 100, k = 0.3 at X = 0 to 5 in steps of 0.5,
the simulated ideal Y equals the compiled equation evaluated by nlfit
bit for bit and 100·exp(-0.3·X) to 1e-15; with no error every replicate
is the ideal value, and fitting that table with the same equation gives
A = 100 and k = 0.3 to 1e-8. Gaussian scatter (SD 2, 200 replicates) is
reproduced by the same seed and centred on the curve (residual mean
within 0.1, SD 1.9 to 2.1). Per-data-set lines and values, constant
defaults, a missing parameter value ("missing parameter value(s) for
“Decay”: k") and an equation that does not parse are covered; a Monte
Carlo run of 40 repeats recovers k (mean within 0.01 of 0.3) with every
repeat fitted.

Independent check (2026-11-23, by the lead): an own scipy.optimize.curve_fit
of drc's W1.4, c + (d - c) exp(-exp(b (ln x - ln e))), to the 24 ryegrass
points (zero doses kept) gives b 2.39333 (SE 0.43961), c 0.66045,
d 7.80588, e 3.60013, and the relative ED50 e exp(ln(ln 2)/b) = 3.08895
with a delta-method 95% CI 2.72315 to 3.45475 (t, 20 df): the engine's
values (J'J covariance, as here).

## Feature validation: Schild plot (2026-11-23)

FEATURE-PLAN P-49. The EC50-shift (Gaddum/Schild) fit (`ec50_shift`)
also returns `schild_plot` (`engine/opendose/schild.py`, Arunlakshana &
Schild 1959, Br J Pharmacol 14:48): each curve's LogEC50 from a fit with
Top, Bottom and HillSlope shared (parallel curves; user constraints on
those three carry over), the dose ratio DR = EC50(B) / EC50(control),
and the ordinary least-squares line of log10(DR - 1) on log10[B] with
the slope's SE, t-based 95% CI on n - 2 df, the t test of slope = 1, R²
and the X intercept (pA2 read off the plot = intercept / slope). It is a
display: pA2 and KB stay those of the global fit, unchanged (the test
compares them with `fit_ec50_shift` called alone). The global fit's own
dose ratios are implied by its pA2 and slope and fall on its line
exactly, so the plot uses the curve-by-curve EC50s instead. Needs exactly
one control curve (B = 0); a curve with DR <= 1 is listed with the
reason and left out; two points give the line without a CI; one point
gives no line, with the reason.

Reference: `engine/tests/reference/schild_plot.py` (R is not installed):
the EC50-shift example, simulated from the model (pA2 7.5, slope 1,
numpy seed 2026, rounded to 2 decimals; data in `schild_example.json`),
parallel-curve EC50s by scipy.optimize.least_squares on a model written
out there (not the engine's lsq module), the regression by statsmodels
OLS (what R's lm prints) and its t_test of slope = 1.

| Example | Value |
|---|---|
| LogEC50 per curve (0, 3e-8, 1e-7, 3e-7, 1e-6, 1e-5 M) | -7.9966, -7.7644, -7.4173, -6.9174, -6.5071, -5.4722 |
| Dose ratios | 1.707, 3.796, 12.002, 30.871, 334.53 |
| Schild slope (SE) | 1.050300 (0.032819), 95% CI 0.945854 to 1.154747 |
| Intercept; pA2 from the plot | 7.798709; 7.425217 |
| R²; t (slope = 1), P | 0.997079; 1.532640, 0.222894 |

`engine/tests/test_schild_plot.py` pins these (LogEC50 to 1e-7, the
regression to 1e-6 relative) and covers no or two control curves, a curve
not shifted right, two and one antagonist points, a negative
concentration, the same concentrations in nM (slope unchanged, intercept
and pA2 move by 9 × slope and 9) and the curves in another order.

Independent check (2026-11-23, by the lead): scipy.stats.linregress of
log10(DR - 1) on log10[B] from the dose ratios as the card prints them
(1.707, 3.796, 12.00, 30.87, 334.5 at 3e-8 to 1e-5 M) gives slope
1.05030 (SE 0.03281), 95% CI 0.94589 to 1.15472 (t, 3 df), pA2 7.4252,
R² 0.99708, P (slope = 1) 0.2228: the engine's values to the precision
of the rounded ratios. Raincloud bandwidths by R's bw.nrd0 rule by hand
(0.9 min(SD, IQR/1.34) n^-1/5): Control 1.06637, Treated A 0.657106.

## Feature validation: assay wizards, wave 1 (2026-11-23)

### P-29 limits of blank, detection and quantification

`assay_stdcurve.detection_limits`: CLSI EP17-A2, parametric, as
Armbruster & Pry (2008, Clin Biochem Rev 29 Suppl 1:S49) write it:
LoB = mean of the blanks + 1.645 SD, LoD = LoB + 1.645 SD of the
low-level samples (pooled over the samples); on request EP17-A2's
small-sample multiplier c_beta = 1.645 / (1 - 1/(4(N - K))) instead of
1.645 (off by default; the plan's acceptance test uses 1.645). LoQ: the
lowest low-level sample whose back-calculated concentrations have a CV
of at most 20% (editable) at or above the LoD. The signal limits are
read off the fitted standard curve through the same interpolation and
blank correction as the unknowns; a limit below the lowest standard is
flagged as read off the extrapolated curve, one below the curve's floor
has no concentration ("below the fitted curve"). Fewer than 60 blank or
low-sample replicates get EP17-A2's note (60 per lot to establish, 20
to verify). Only parametric limits are computed (stated next to them).

Reference: `engine/tests/reference/detection_limits.py` (Python's
statistics module for the formulas, an independent scipy curve_fit 4PL
and its closed-form inverse for the concentrations; R chemCal is not
installed, and its DIN 32645 calibration-based method is a different
estimator, so it is not compared). Data: the plan's acceptance test, an
ELISA curve (8 levels in duplicate), 20 blank wells, 20 low-sample
wells (`web/e2e-fixtures/stage/detection-limits.json`).
`engine/tests/test_detection_limits.py`:

| Quantity | Reference | Engine tolerance |
|---|---|---|
| mean / SD of the blanks | 0.06115 / 0.0057425 | 1e-12 relative |
| SD of the low sample | 0.0058992 | 1e-12 relative |
| LoB signal | 0.070596 | 1e-12 relative |
| LoD signal | 0.080301 | 1e-12 relative |
| LoB concentration | 2.0046 pg/mL | 1e-4 relative |
| LoD concentration | 2.9718 pg/mL | 1e-4 relative |
| LoD with c_beta (1.66693) | 0.080430, 2.9845 pg/mL | 1e-12 / 1e-4 relative |
| LoQ (CV 8.26%) | 6.6739 pg/mL | 1e-4 relative |

Edge cases: 0 and 1 blank replicates (no LoB, said so), blanks all equal
(SD 0, said so), one low replicate (no LoD, no CV), no low samples, a
LoB under the curve's floor, a CV goal no sample meets, a decreasing
(competitive) curve (limits mean - 1.645 SD), two low samples (pooled
SD by hand). Invariance: signals x1e-12 and x1e12 scale the signal
limits and leave the concentrations; concentrations in other units
scale the concentration limits; blank order does not matter. Without
low-level samples the result has no detection limits and every earlier
pin is unchanged.

### P-29 qPCR LoD95 from a hit-rate dilution series

`assay_qpcr.lod95_by_target`: rows of the qPCR table with a Quantity are
a dilution series; a series with wells that gave no Cq is a hit-rate
series. The hit rate per quantity is fitted by probit regression on
log10 quantity (`quantal.quantal_fit`, expected information, Finney's
heterogeneity factor only when the Pearson chi-square is significant)
and the LoD95 is the quantity detected in 95% of wells, with Fieller's
CI (Forootan et al. 2017, Biomol Detect Quantif 12:1; MIQE asks for the
LoD). An efficiency series detected in every well gives no LoD95.

Reference: `engine/tests/reference/lod95_probit.py`, statsmodels
GLM(Binomial(link=probit)) as the oracle for R's
glm(binomial(probit)), Fieller's interval solved by hand (np.roots) from
the statsmodels covariance. Data: 8 quantities (1000 to 1 copies) of 12
wells, 12, 12, 12, 11, 9, 6, 3 and 1 detected.
`engine/tests/test_qpcr_lod95.py`:

| Quantity | Reference | Engine tolerance |
|---|---|---|
| intercept / slope | -1.41777 / 2.16016 | 1e-6 relative |
| LoD95 | 26.1682 copies | 1e-6 relative |
| 95% CI, Fieller | 15.0042 to 76.5999 | 1e-5 relative |
| 95% CI, delta method | 12.7670 to 53.6363 | 1e-5 relative |

Edge cases: every well detected (LoD95 below the series), none detected
(above it), perfect separation (no partial level: the LoD95 lies
between two quantities, no fit), fewer than 3 quantities, an empty
series, a hit rate that falls with the quantity, an LoD95 outside the
quantities tested (flagged). Quantity units scale the LoD95 and its CI;
well order does not matter.

### P-30 qPCR no-template and no-RT control checks

`assay_qpcr.control_checks`: wells whose sample (or group) is named
NTC / "no template (control)" (with an optional number) are no-template
controls, names with no-RT, NRT, -RT, RT- or "minus RT" are no-RT
controls (water is not read as an NTC: a water-treated group is
common), or a record says `"control": "ntc" | "no_rt"`. They are taken
out of the quantification, the reference-gene check and the group list,
and checked as MIQE asks (Bustin et al. 2009, Clin Chem 55:611): a
control well with a Cq (below an editable limit; blank = any Cq) has
amplified; each sample of that target is listed with its Cq difference
to the control and is affected when the difference is under an editable
number of cycles (default 5: the contamination is then more than 2^-5,
about 3%, of the sample's template at 100% efficiency). A no-RT control
is compared with the sample its name points to ("CON-1 no-RT" with
"CON-1"), else with every sample of its target.

Validation: hand-built plates, every expected number a hand subtraction
(`engine/tests/test_qpcr_controls.py`). The plan's acceptance plate:
GAPDH sample means 18.0, 17.1, 18.1, 17.5 and one NTC well at Cq 34 (the
other undetermined) give the chip "NTC amplified for GAPDH (Cq 34)" with
the four samples 16.0, 16.9, 15.9 and 16.5 cycles before it (none
affected); "CON-1 no-RT" at Cq 21 is 3 cycles after CON-1 (affected);
"LPS-2-RT" at 33 is 8.7 cycles after LPS-2. The fold changes with and
without control wells are identical (2^3.2 for LPS vs CON, by hand). A
Cq limit of 33 stops counting the NTC at 34; a margin of 16.6 cycles
makes CON-1, LPS-1 and LPS-2 affected. Name rules are pinned on the
same 19 names in the engine and web unit tests (the web reads the
controls only to keep them out of the group and target lists).

### P-50 flow event counts and the CI of a gated percentage

`api.py flow_events`: counting events is a Poisson process, so r
positive events have a CV of 1/sqrt(r) (Roederer 2008, Cytometry A
73:384): a target CV needs ceil(1/CV^2) positive events and, at an
expected frequency f, ceil(r / f) events in the parent gate (rounded to
six decimals before the ceiling, since 1/0.1^2 is 99.99999999999998 in
floating point). An observed k of n gets the Wilson score interval
(`partsofwhole.proportion_ci`, method "wilson"; exactly 0 at k = 0 and
100% at k = n) and the Poisson CV of k.

Reference: `engine/tests/reference/flow_events.py` (the counts in exact
fractions; the Wilson interval from statsmodels proportion_confint and
scipy binomtest().proportion_ci, which agree to 1e-12).
`engine/tests/test_flow_events.py`:

| Input | Reference | Engine tolerance |
|---|---|---|
| CV 10% at 0.1% (the plan's test) | 100 positive, 100,000 in all | exact |
| CV 5% at 1%; 1% at 0.01%; 3% at 2.5% | 400 / 40,000; 10,000 / 100,000,000; 1,112 / 44,480 | exact |
| 120 of 50,000 (the plan's test) | 0.24%, 95% CI 0.200765% to 0.286880% | 1e-10 relative |
| 0 of 1,000; 50 of 50; 7 of 20 at 99% | 0 to 0.38268%; 92.865% to 100%; 14.639% to 62.834% | 1e-10 absolute |

Invalid inputs (CV 0 or 100%, a missing or zero frequency, a parent
count of 0 or not whole, more positives than the parent, text) each
say what to enter. Halving the frequency doubles the events; 1e6 of
1e12 events keeps a tight interval around 1e-4%.

Independent check (2026-11-23, by the lead): LoB = 0.06115 + 1.645 x
0.0057425 = 0.070596 by hand; events for a 10% CV at 0.1% frequency
1/0.10^2 = 100 positive and 100,000 in all; the Wilson 95% CI of 120 of
50,000 from the closed-form score interval, 0.20077% to 0.28688%; the
qPCR LoD95 from an own probit maximum-likelihood fit on log10 copies
(scipy.optimize Nelder-Mead on the binomial log-likelihood, not the
statsmodels GLM above) is 26.168 copies. All equal the engine.


## Feature validation: Prism Info sheets round trip (2026-11-23)

### P-59 .pzfx Info sheets: constants, notes and the analysis plan

`pzfx.parse_pzfx` now returns the file's Info sheets next to its data
tables, `{"title", "notes", "constants": [{"name", "value"}]}`, and
`pzfx.write_pzfx(tables, info)` writes the project's info sheets as Prism
Info sheets. Layout (no numbers are computed): `<InfoSequence>` with one
`<Ref>` per sheet (the first `Selected="1"`), then each `<Info>` with
`<Title>`, `<Notes>` (line breaks as `<BR/>`) and one
`<Constant><Name>…</Name><Value>…</Value></Constant>` per constant, all
before `<TableSequence>`: the layout Prism 6 writes, checked against the
Prism-written sample `exponential_decay.pzfx` of the open-source pzfx R
package (inst/extdata) and its `write_pzfx.R`. Notes keep the text of
`<Font>`, `<B>` and other runs; `<BR>` is a line break. An export without
info sheets is byte for byte the earlier output (one empty "Project info
1").

Fixture: `web/e2e-fixtures/info.pzfx`, written by hand in that layout,
holds "Cell line = HeLa", Prism's six default constants (three empty) and
two lines of formatted notes. `engine/tests/test_pzfx_info.py`: the
import reads all eight constants and the two lines exactly; export, then
import, returns the same sheets (also through the API handlers
`pzfx_import` and `pzfx_export`); titles and values with `&` and `<` are
escaped; a constant without a name is dropped; old exports read as one
empty sheet. In the app, an analysis plan is written into its sheet's
notes as text (Prism has no plan), and empty info sheets are neither
written nor added on import.

Manual check left for Eren (docs/prism-validation.md): open the exported
file in Prism and confirm the Info sheet shows "Cell line = HeLa" and the
notes.

## Feature validation: study design, sex as a variable, normalised titles (2026-11-23)

These three features compute no numbers; they record what the user
states, read it into the methods text and the journal checklists, and
name outputs. The engine is not changed.

### P-61 the study design record and ARRIVE 2.0 items 4, 5 and 8

An info sheet can hold a study design record (`InfoSheet.design`,
`web/src/project/studyDesign.ts`): whether units were allocated to groups
at random, the method and the seed; for each of the four stages ARRIVE
2.0 item 5 names (allocation, the conduct of the experiment, outcome
assessment, data analysis) whether the people were blinded; the
inclusion and exclusion criteria (item 3a); the animals' species and
strain, sex and age (item 8a). Source: Percie du Sert et al. 2020, PLoS
Biol 18:e3000410, and the item pages on arriveguidelines.org (items 3, 4,
5 and 8, read 2026-11-23).

Checklist rules (`web/src/report/checklists.ts`, unit-tested in
`web/src/project/__tests__/studyDesign.test.ts`): item 4 is met when
randomisation is stated as used with a method (the seed is named in the
reason, or "no seed recorded"), or stated as not used; item 5 when every
one of the four stages is answered; item 8 when strain, sex and age are
all given. Without a record each of the three is not met and offers to
start one on the table's info sheet. The methods paragraph adds, for
example, "Experimental units were allocated to groups at random (block
randomisation (blocks of 4); seed 20261123)." (asserted in e2e-check).

Data model: the key is optional. A project saved before it existed
(`web/e2e-fixtures/stage/row-ids.json`) opens, saves and reopens
unchanged and validates against `docs/project-file.schema.json`; a record
survives save and open; the schema refuses an unknown `randomised` value.
.pzfx export writes the record into the Info sheet's notes as text (Prism
has no such record), so the .pzfx round trip of P-59 is unchanged.

### P-62 sex as a biological variable

Detection (`web/src/guide/sex.ts`, unit-tested in
`web/src/guide/__tests__/sex.test.ts`) asks, never assumes, and is tight:
a column or data set is taken to look like sex only when its header is
"sex" or "gender" (a multiple-variables column, "Sex (F/M)" allowed), or
when every non-blank label is exactly F, M, female or male (any case,
plurals allowed) and both sexes occur. Rows, data sets of column and
grouped tables and multiple-variables columns are checked; XY,
contingency and survival tables are not. False positives tested and not
fired: "M" next to "Control", "1 M" and "10 M" (molar), "M1, M2, F1",
"M" alone or "M, M", letters "M, N, O", combined "WT F, WT M", a column
"M, F, X".

When it fires, the Checks row of every result on the table carries a
chip that starts with the question ("Are rows F and M the sex of the
animals or subjects? If so, ..."): on a grouped table, two-way ANOVA
with sex and the interaction, one click away (Sex as the row or column
factor, the interaction shown first, Šídák comparisons of the treatment
within each sex); on a two-way analysis the chip says sex is a factor
(and warns when the main-effects-only model leaves out the interaction);
on a multiple-variables table, Sex as a predictor with its interaction.
The paste guide asks the same question about a pasted Sex column. The
ARRIVE tab of the journal checklists gains "Sex as a biological
variable": not met while the table looks like it has sex and no analysis
has it as a factor, met once one does; without sex in the table the
study design record decides (both sexes: not met; one sex: met, with
"say why in the methods"); otherwise not applicable. Sources cited in the
UI: SAGER (Heidari et al. 2016, Res Integr Peer Rev 1:2) and NIH SABV
(Clayton & Collins 2014, Nature 509:282). No numbers are computed.

### P-55 normalised outputs named from their settings

A Normalize sheet made since P-55 (`namedTitle` in its options, set only
on new sheets) titles its output table's Y from the settings
(`web/src/sheets/manipulate/normalizeTitle.ts`, unit-tested in
`__tests__/normalizeTitle.test.ts`): 100% = the last row gives "% of" the
row's title ("% of vehicle (mean)"; an XY table without row titles gives
"% of value at X = 10"; when the data sets' last rows differ, "% of last
row"); 100% = the largest value gives "% of largest mean" or "% of
largest value"; the sum gives "% of total"; "(mean)" is added when 0%
and 100% come from row means of replicates; fractions read "Fraction
of ...". A 100% typed as a value keeps "Normalized response (%)", since
a number alone names nothing. The figure legend of a graph of a named
output adds "Values are % of vehicle (mean).", on screen, in PowerPoint
and in the export bundle. The normalised numbers are unchanged (the
engine is not called differently).

Ruling 10: sheets saved before P-55 have no `namedTitle`, so their
output keeps "Normalized response (%)" and their legend is unchanged;
pinned in e2e-figures, which opens such a project and checks the graph's
Y title, then makes a new Normalize (0% = the smallest mean, 100% = the
vehicle row's mean) and checks "% of vehicle (mean)" on the graph and in
the legend. A graph title the user typed lives in the graph's own
settings and is never rewritten.

## Feature validation: repeated measures and matched tests (2026-11-24)

### P-40 RM ANOVA reporting: Mauchly, Huynh-Feldt, partial omega squared

`repeated.sphericity` reports, for each repeated term, the
Geisser-Greenhouse epsilon (unchanged: the value and P computed before),
the Huynh-Feldt epsilon, the lower bound and Mauchly's test. RM one-way
ANOVA (`table.hf_epsilon`, `table.p_huynh_feldt`, `sphericity`), the
mixed design (row factor and interaction share one block; the
between-subjects column factor has none) and the fully repeated design
(one block per term, which now also carries the GG and HF corrected P)
all get it; the mixed model reports it only when no value is missing.
Mauchly's test is reported, never used to choose the correction: P stays
Geisser-Greenhouse corrected (the chip and the tables say so).

- Mauchly (1940): W = det(T) / (tr(T)/d)^d for T = C'SC (orthonormal
  contrasts), chi-square with R's mauchly.test second-order P.
- Huynh-Feldt epsilon: Lecoutre's (1991) correction,
  ((N - g + 1) d GG - 2) / (d (N - g - d GG)), capped at 1, as R car and
  afex; with one group it equals the 1976 formula and pingouin.epsilon.
  Undefined (and said so) when N - g < d.
- Partial omega squared for designs with subjects:
  (SS_eff - df_eff MS_err) / (SS_eff + [within] SS_err + SS_subj +
  MS_subj), floored at 0, the formula of R effectsize's
  omega_squared(partial = TRUE) for Error() designs (Olejnik & Algina
  2003). It has no CI: partial eta squared's noncentral-F interval does
  not cover it.

Reference: `engine/tests/reference/rm_sphericity.py` (pingouin 0.7
`sphericity`, `epsilon`, `rm_anova`, `mixed_anova`; statsmodels anova_lm
for the one-way sums of squares; R is not installed).
`engine/tests/test_rm_sphericity.py`:

| Input | Reference | Engine tolerance |
|---|---|---|
| 10 subjects x 4 conditions (the plan's test) | GG 0.389690, HF 0.412497, Mauchly W 0.0125317, chi2 33.8194 on 5 df, P 3.3243e-6; F 28.0859, GG P 2.0564e-4, HF P 1.4442e-4; partial omega2 0.525730 | 1e-9 (W, P 1e-7) |
| pingouin rm_anova2 (Metric 3 x Time 2, both repeated) | Metric GG 0.969103, W 0.968118, P 0.878442; Time 2 levels (no W); interaction GG 0.727166, HF 0.831161, W 0.624799, P 0.152392; partial omega2 0.365505 / 0.284738 / 0.095680 | 1e-9 (W, P 1e-7) |
| pingouin mixed_anova (2 groups, 60 subjects, 3 times) | GG 0.998120, HF 1, W 0.998117, P 0.947694; partial omega2 Time 0.031636, Group 0.063257, interaction 0.018306 | 1e-9 |
| the 10 x 4 table as 2 groups of 5 | GG 0.387834, HF (Lecoutre) 0.413053 (1976 formula: 0.469783), W 0.0112768, P 1.7950e-5; partial omega2 interaction 0 (floored) | 1e-9 |

Also tested: two levels (epsilon 1, no W, "always holds"), 3 subjects
for 5 conditions (no W, HF undefined, GG P still given), the mixed model
with complete data (same values) and with a missing value (no
Mauchly), invariance of the epsilons, W and partial omega2 to units and
to the order of the conditions, and the GG epsilon unchanged.

### P-41 Trend across ordered groups: Jonckheere-Terpstra and Page

Kruskal-Wallis and Friedman take `options.trend` (the app's "test for
trend across ordered columns / treatments" option) and add
`jonckheere` (`moretests.jonckheere_terpstra`) or `page`
(`repeated.page_trend`): the statistic, its null mean and SD, z, the
two-sided P (twice the smaller one-sided P, capped at 1), both one-sided
P values, the direction and the order tested (the columns as entered:
the hypothesis, named in the controls and the results).

- Jonckheere-Terpstra (Jonckheere 1954; Terpstra 1952): J counts the
  pairs from an earlier and a later group in increasing order (ties
  1/2). Exact P without ties and with at most 100 values (R clinfun's
  rule): `exactdist.jt_null`, the convolution of the Mann-Whitney
  distributions of each group against the groups before it. Otherwise
  the normal approximation with Hollander & Wolfe's (1999, eq. 6.19)
  tie-corrected variance, no continuity correction.
- Page (1963): L = sum of j times the rank sum of column j, ranks within
  each subject. Exact P when Page's tables cover the design (k <= 8 and
  n <= 12, or n <= 20 with k = 3; scipy's rule), from the permutations of
  each subject's ranks (with ties: conditional on them, as the Friedman
  test's exact P); otherwise normal with the permutation variance, which
  is n k^2 (k + 1)(k^2 - 1) / 144 without ties.

Reference: `engine/tests/reference/ordered_trend.py` (R is not
installed): exact JT P from arrangement counts in Python integers (a
dynamic programme independent of the engine's convolution, checked
against full enumeration of 4,200 arrangements); the permutation mean
and variance of a tied 3 x 3 design by enumeration (1,680 assignments);
scipy.stats.page_trend_test; the Hicks (2009) example's published
L = 133.5 (as quoted by scipy and Statext); Page's (1963) table value for
k = 3, n = 10 (critical L = 128 at 0.05, as quoted by Wikipedia). Page's
own 1963 example could not be obtained and is not pinned.
`engine/tests/test_ordered_trend.py`:

| Input | Reference | Engine tolerance |
|---|---|---|
| 4 doses x 5, no ties (the plan's test) | J = 140 (E 75), exact P increasing 4.4465e-7, two-sided 8.8931e-7 (of 11,732,745,024 arrangements) | 1e-9 |
| 3, 3, 4 values | J = 29, P increasing 0.0085714, two-sided 0.017143 (enumerated) | 1e-12 |
| tied 3 x 3 x 3 | permutation mean 13.5, variance 18.803571 = Hollander & Wolfe's | 1e-12 |
| the 4 doses rounded (ties) | J = 140, SD 14.8139, z 4.38777, two-sided P 1.1452e-5 | 1e-9 |
| Hicks (2009) teaching methods, 10 x 3 with ties | L = 133.5 (published); exact P given the ties: increasing 3.8421e-4, decreasing 0.99978 (equal to full enumeration of 1.9 million tables; scipy's untied-null exact P is 0.001819) | 1e-9 |
| 8 x 4 untied | L = 234, exact P 1.1204e-6 (scipy exact), reversed columns 0.99999965 | 1e-9 |
| the 8 x 4 rows to 21 subjects | normal P equal to scipy's asymptotic | 1e-9 |
| Page's table, k = 3, n = 10 | P(L >= 128) = 0.046639 <= 0.05 < P(L >= 127) = 0.073805 | 1e-9 |

Also tested: J and P unchanged by units and shifts (1e-9, 1e9),
reversing the groups mirrors the one-sided P values, the exact and
normal P agree for 4 x 30 values, Kruskal-Wallis itself unchanged by
the option; two groups, an empty group, all values equal and two
treatments each give a sentence instead of a result.

### P-45 Cochran's Q for matched yes/no outcomes

`trend.cochrans_q` (API `cochrans_q`; the column analysis "Cochran's Q"):
rows are subjects, columns three or more conditions, cells 0 or 1.
Q = (k - 1)(k sum C_j^2 - N^2) / (k N - sum R_i^2) on k - 1 df (Cochran
1950). A cell other than 0 or 1 stops the analysis with a sentence that
names its row and column and the layout to use; subjects missing a
condition are left out and listed; a table where every subject gives the
same answer under every condition says Q is undefined. Every pair of
conditions is then compared with McNemar's test, always with the exact
binomial P of its discordant subjects (the guide's recommendation for
McNemar's test, valid at any count), adjusted by Holm's step-down method
over the k(k - 1)/2 pairs; the results name the family (FamilyLine).

Reference: `engine/tests/reference/cochran_q.py` (statsmodels 0.15
`cochrans_q` and `mcnemar(exact=True)`, pingouin 0.7 `cochran`,
statsmodels `multipletests(method="holm")`; R is not installed).
`engine/tests/test_cochran_q.py`:

| Input | Reference | Engine tolerance |
|---|---|---|
| 12 subjects x 3 stains (the plan's test) | Q = 11.5556, df = 2, P = 0.0030956; McNemar A vs B 3/1 discordant, P 0.625 (Holm 0.625); A vs C 8/0, P 0.0078125 (Holm 0.0234375); B vs C 6/0, P 0.03125 (Holm 0.0625) | 1e-10 (P), 1e-12 |
| pingouin "cochran" (20 subjects, 3 days) | Q = 6.70588, P = 0.034981; Holm P 0.18457, 0.11572, 1 | 1e-10 |

Also tested: the order of the conditions and subjects with the same
answer everywhere do not change Q; a missing value drops its subject with
a warning; a 2, a 0.5, all-equal answers, one subject and two conditions
each give a specific sentence; a pair with no discordant subjects has
P = 1; Q for 500 subjects x 4 equals the closed form.

### P-27 Repeated-measures correlation

`correlation.rm_corr`, reached through the `correlation` handler with
`options.subject_labels` (one subject per row: the row titles or a column
of IDs, set as the Subject role in the app): x and y centred on each
subject's own means, r_rm = sum(x_w y_w) / sqrt(sum x_w^2 sum y_w^2),
which is the common within-subject slope of the ANCOVA y ~ subject + x
expressed as a correlation (Bakdash & Marusich 2017), on df = N - k - 1;
P from t on those df; 95% CI by Fisher's z with SE 1 / sqrt(df - 1) (as
pingouin and R rmcorr). It measures the association within subjects
only, and the results say so. Pairs missing a value or a subject are
left out and counted; subjects with a single pair carry no within-subject
information and are left out by name. When the table names subjects (row
titles that repeat, or a column whose name says it holds IDs) and a plain
correlation ignores them, the Checks row says so.

Reference: `engine/tests/reference/rm_corr.py` (pingouin 0.7 `rm_corr`;
statsmodels OLS PaCO2 ~ C(Subject) + pH with type II anova_lm; R is not
installed) on Bland & Altman's (1995) pH / PaCO2 data (47 observations,
8 subjects; pingouin's "rm_corr" dataset). `engine/tests/test_rm_corr.py`:

| Input | Reference | Engine tolerance |
|---|---|---|
| Bland & Altman 1995 (the plan's test) | r_rm = -0.506770 (ANCOVA: the same), df = 38, P = 8.4711e-4, slope -2.37083; 95% CI -0.71 to -0.23 (pingouin and the published values, 2 decimals; engine -0.70671 to -0.23186) | 1e-9 (P 1e-8; CI 0.005) |

Also tested: text subject IDs and shuffled rows give the same r; r is
unchanged by units and symmetric in X and Y; ignoring the subjects gives
df = 45 and another r; missing values, blank subjects and single-pair
subjects are left out with a warning; one subject, and X constant within
every subject, each give a sentence; a perfect within-subject line gives
r = 1, P = 0 and no CI.

### Fixes: matched designs without scatter, one Schild antagonist, qPCR

- Paired and ratio paired t tests, RM one-way ANOVA and RM two-way
  ANOVA with no scatter (every subject shifted by the same amounts) used
  to report a limit (t or F infinite, P = 0), and identical decimals left
  rounding noise that gave F near 1e15. A residual at rounding level, sum
  of squares <= (64 eps)^2 sum(values^2) and summed directly (not as a
  difference of sums), is now no scatter, as for the unpaired and
  two-way cases (`ttests.no_residual`). The paired tests and RM one-way
  ANOVA then say the statistic is undefined and what to check; in a
  two-way RM design each term whose error has no scatter shows F and P
  as undefined ("undefined: its error term has no scatter"), and the
  analysis stops with a sentence only when no term can be tested.
  `engine/tests/test_zero_scatter_matched.py`, with data that do scatter
  still equal to scipy `ttest_rel` and pingouin `rm_anova` (1e-10).
- qPCR statistics on identical dCq values (paired experiments): the
  paired t test or RM ANOVA above now gives the statistics note instead
  of t or F infinite; the fold changes and zero SDs are still reported
  (a zero SD is a valid summary).
- An EC50-shift (Gaddum/Schild) fit with one antagonist concentration
  and the Schild slope free stopped with the raw "(34, 'Numerical result
  out of range')": one dose ratio fits any slope with a matching pA2. It
  now says so and to fix the slope at 1 or add concentrations; with the
  slope fixed the same data fit (pA2 7.45 for a simulated 7.5).
  `engine/tests/test_schild_single_antagonist.py`.

Independent check (2026-11-24, by the lead, own numpy code from the
reference inputs): the double-centred covariance of the 10 x 4 RM table
gives GG epsilon 0.38969 and Huynh-Feldt 0.41250 (for one group the
Lecoutre correction (N - g + 1) equals N, so it is the 1976 value);
Mauchly's W from orthonormal contrasts 0.012532, chi-square P 2.6e-6
with Bartlett's first-order factor (the engine's second-order P 3.32e-6;
both < 0.0001 as shown). Jonckheere-Terpstra by pair counting: J = 140,
null mean 75, SD 14.860. Cochran's Q from its formula: 11.556 on 2 df,
P = 0.0030956. Repeated-measures correlation as a common-slope ANCOVA on
subject-centred pH and PaCO2: r_rm = -0.50677 on 38 df, Fisher-z 95% CI
-0.70672 to -0.23186, P = 0.00084711. All equal the engine.

## Feature validation: assay Analysed lines, methods wording of the test chooser, flow legend (2026-11-24)

These three changes compute no new numbers. The engine is not changed.

### P-16 the Analysed line of the assay results

Each assay kind has its own reader (`web/src/sheets/assays/kit/analysed.ts`,
called by `web/src/project/dataNotes.ts` for the Notes strip): standard
curve, qPCR, flow summary, densitometry, plate reader, kinetic rates,
luciferase, wound healing and MIC. A reader re-reads the table the way the
module's run does and lines it up with the result the engine returned; it
counts from the engine result (standards' `n` and `excluded`, unknowns'
`status`, qPCR `replicates[].n_used` and `cq_values`, `per_target[].groups[].n`,
densitometry `lanes[].normalized` and `n_blots_used`, plate `wells[].raw`,
kinetic and wound `wells[].rate`, MIC `series[].valid`, luciferase
`wells[].ratio` and `n_units`) and names what was left out by table row
or well id with the reason read from the cell (blank, excluded, or the
text it holds).

Oracle: the engine itself, run natively. `web/src/sheets/assays/__tests__/
analysedFixtures.gen.ts` drives each module's run on its example (the
table e2e-assays starts from) and on a copy with rows, wells and cells
left out (`analysedCases.ts`), sending every payload through
`opendose.api.analyze_json` in Python; `analysed.test.ts` replays the
recorded results (each payload must equal the recorded one), checks the
counts against the engine fields they come from and pins each line.
Examples: plate "96 of 96 mapped wells read (72 sample, 24 control)", with
A4 cleared "95 of 96 ... 1 well left out: A4 (blank)"; standard curve
"16 replicates at 8 levels in the fit ... 10 of 12 dilutions reportable,
1 below the LLOQ (S8 1:2, row 21), 1 above the ULOQ (S7 1:2, row 20)";
qPCR "108 of 108 sample wells used", with an Undetermined, a blank and an
excluded Cq and one Cq of 36.2 above the limit of 35 "104 of 108 ... CON-1
IL6 A7 (“Undetermined”), CON-1 IL6 A8 (blank) and CON-1 TNF A10
(excluded); 1 well above Cq 35 left out: CON-2 GAPDH A14 (Cq 36.2)"; after
"Use GAPDH only" "81 of 81 sample wells used; ACTB (27 wells) set aside by
the reference check, not used". e2e-assays asserts the plate, standard
curve, qPCR, flow and densitometry lines on screen, and the plate and
qPCR lines after a cleared well and an Undetermined Cq.

What the engine does not return and the reader takes from the table: the
row of each qPCR record and whether an undetermined Cq was blank, text or
excluded (the engine reads all three as undetermined); rows a reader
skips before the engine (no target, no sample name, no blot or group).
A densitometry lane with no loading-control value is normalised by its
target signal alone (`assay_densitometry`, flag `no_reference`) and mixed
with ratios of other lanes; the Notes strip names such lanes as a
warning. Not covered: growth, tumour, time course, synergy, AUC, volcano
and clustering, whose panels already state their own drop counts.

### P-32 follow-up: the chooser's reason in a methods wording

Help me choose saved its second-person on-screen reason ("unless you know
the SDs are equal"), which reached the methods paragraph. Each chooser
outcome (`Recommendation.rule`) now has a third-person methods wording
(`web/src/guide/methodsWording.ts`); that is what is saved and printed:
"Choice of test (OpenDose Help me choose): Welch's t test was chosen for
the two independent groups because it does not assume equal SDs and
loses little power when they are equal." A project saved before holds the
on-screen words; they are read as the same outcome's methods wording when
the project opens (`guide/choice.ts` parseChosen). `methodsWording.test.ts`
enumerates the chooser over every combination of answers that changes its
outcome (45 or more rules), checks each wording is third person and that
the outcome's on-screen reason maps to it, and opens the stage fixture
`why-history.json` (saved before) to read the new wording. e2e-check pins
the unpaired t test's methods sentence and the sentence of that older
file.

### P-31 follow-up: the flow legend names the statistic

The figure legend of a flow summary's linked table (results and graph)
adds "Values are the FlowJo gate statistic CD69+ of Lymphocytes/Single
Cells/Live/CD4+, Freq. of Parent.", the statistic with its full gate path
as the methods name it, and the background control when one was
subtracted (`flowValuesPhrase`, `web/src/report/valuesAre.ts`, on screen,
in PowerPoint and in the export bundle). Pinned in flow.test.ts and
e2e-assays.

## Feature validation: method comparison and reliability (2026-11-24)

### P-42 Passing-Bablok and Theil-Sen regression

`methodreg.passing_bablok` and `methodreg.theil_sen` (API
`method_regression`; the analysis "Passing-Bablok regression (method
comparison)" on XY tables, method 1 in X and each data set compared with
it, and on column tables, two columns paired by row, linked from the
Bland-Altman results). Passing & Bablok (1983): every pairwise slope,
identical points left out, equal X with different Y as +inf, a slope of
-1 (within 1e-9, so decimals typed by hand count) left out, the median
shifted by K = the number of slopes below -1; CI ranks M1 = round((N -
C) / 2), M2 = N - M1 + 1 with C = z sqrt(n (n - 1)(2n + 5) / 18); the
intercept median(y - b x) with the CI from the slope's limits. Kendall's
tau is reported and a tau that is not positive refuses the fit (the
method assumes a positive correlation). CUSUM test of linearity as in
the NCSS restatement of the paper and mcr's `calcCUSUM`: H = max
|cusum| / sqrt(n_below + 1), P from the Kolmogorov distribution (5%
critical value 1.36). Theil-Sen (Sen 1968): median of the slopes over
pairs with different X, Sen's CI with ties in X and Y, intercept
median(Y) - b median(X) (no CI). Deming with equal error variances is
fitted to the same pairs for comparison. Above 3,000 pairs (4.5 million
slopes) the analysis refuses rather than exhaust memory.

Reference: `engine/tests/reference/method_regression.py`, an independent
direct implementation in exact fractions of the decimals as typed (with
NCSS's +/-inf convention for equal X, so its K differs from the engine's
and the line must still agree), `scipy.stats.theilslopes` and
`kendalltau`, and the line printed by Giavarina (2015, Biochem Med
25:141, Table 1 data). R's `mcr` is not installed and its creatinine
data are only in a binary .rda, so the plan's creatinine values are not
pinned. `engine/tests/test_method_regression.py`:

| Input | Reference | Engine tolerance |
|---|---|---|
| Giavarina 2015 Table 1 (30 pairs) | published y = 7.08 (-0.30 to 19.84) + 1.06 (1.02 to 1.09) x; direct: slope 1.0553122 (1.0204819 to 1.0914634), intercept 7.0818558 (-0.3048780 to 19.837349), CUSUM H = 1.25, P = 0.087866; Theil-Sen 1.0518888 (1.0166667 to 1.090625) | printed digits; 1e-12 |
| Bland & Altman 2007 ejection fractions (60 pairs, ties) | slope 0.9941003 (0.7682927 to 1.2093023), intercept -0.5500295 (-1.5634884 to 0.5810366), N = 1769 | 1e-12 |
| 13 points with equal X, a slope of exactly -1 and slopes below -1 | slope 1.025 (0.9 to 1.1142857), intercept -0.0625 | 1e-12 |

Also tested: 90% CIs; swapping the methods inverts the slope's CI limits
exactly; a unit change (x 1e-12, 1e12, 1000) leaves the slope unchanged;
row order does not matter; n = 0, 1, 2, a constant method, a negative
correlation and more than 3,000 pairs each give a sentence; three pairs
give the line without CIs and say why; points all on the line make the
CUSUM test undefined and say so; replicates in an XY table pair with
their row's X; missing values drop the pair.

### P-43 Lin's concordance correlation coefficient

`methodcomp.lin_ccc`, added to the Bland-Altman (paired), Deming and
Passing-Bablok results: rho_c = 2 s_xy / (s_x^2 + s_y^2 + (mean_x -
mean_y)^2) with moments of divisor n (Lin 1989), CI on Fisher's z with
Lin's variance as corrected in Lin (2000). The results print it with its
CI and, beside it, that rho_c = r x C_b mixes precision and accuracy.

Reference: `engine/tests/reference/lin_ccc.py`, a transcription of
DescTools::CCC (z-transform CI; the formulas of epiR::epi.ccc). R is not
installed and pingouin 0.7 has no CCC. `engine/tests/test_lin_ccc.py`:

| Input | Reference | Engine tolerance |
|---|---|---|
| Ejection fractions, RV vs IC (the Bland-Altman template) | CCC 0.66141500, 95% CI 0.50895239 to 0.77364143, r 0.73249736, C_b 0.90295889 | 1e-12 |
| Giavarina 2015 Table 1 | CCC 0.99154293, 95% CI 0.98364289 to 0.99563586 | 1e-12 |
| X 1..8, Y 2.1 to 15.8 (slope 2) | CCC 0.44882821 with r 0.99919 | 1e-12 |

Also tested: 90% CIs; symmetric in the two methods; a common unit change
of both methods leaves it unchanged, rescaling one lowers it; n = 0, 1,
2 and a constant method give a sentence (in the results, "not computed:"
and the reason, the other numbers unchanged); identical methods give 1
and say there is no CI; r = 0 gives no CI with the reason.

### P-44 Reliability ICC (Shrout-Fleiss / McGraw-Wong)

`icc.icc` (API `icc`; the column analysis "Agreement (ICC)": one column
per rater, one row per target): the six forms of Shrout & Fleiss (1979),
each with its F test of ICC = 0 and the F-based CI of McGraw & Wong
(1996, Table 7; case 2A with its Satterthwaite df). The default and the
headline form is ICC(2,1), two-way random effects, absolute agreement,
single rater; the controls explain each form in one line. Balanced mean
squares (equal to `twoway.two_way_anova(additive=True)`, which refuses
exact-fit data). Rows missing a rating are left out and named.

Reference: `engine/tests/reference/icc_reliability.py`: the values
printed by Shrout & Fleiss (1979) for their 6 targets x 4 judges,
pingouin 0.7 `intraclass_corr` (CIs to 2 decimals), and McGraw & Wong's
Table 7 transcribed with a statsmodels ANOVA (full precision). R (psych,
irr) is not installed. `engine/tests/test_icc.py`:

| Input | Reference | Engine tolerance |
|---|---|---|
| Shrout & Fleiss 1979 (6 x 4) | published .17, .29, .71, .44, .62, .91; BMS 11.24, WMS 6.26, JMS 32.49, EMS 1.02; ICC(2,1) 0.28976378 (95% CI 0.01878651 to 0.76108437), ICC(3,1) 0.71484071 (0.34246477 to 0.94585826), ICC(1,1) 0.16574177 (-0.13293232 to 0.72256006) | printed digits; 1e-10 (CI 1e-9) |
| pingouin "icc" (8 wines x 4 judges) | ICC(2,1) 0.72768879 (0.43448966 to 0.92670861), ICC(3,k) 0.91515856 | 1e-10 (CI 1e-9) |

Also tested: 90% CIs; a unit change and the order of targets and raters
leave every form unchanged; fewer than 2 targets or raters, all-equal
ratings, no variation between targets and two ratings in one cell give a
sentence; perfect agreement gives 1, a constant offset between raters
gives consistency 1 and absolute agreement below 1; a negative ICC is
reported as it is.

Independent check (2026-11-24, by the lead): ICCs by hand from the
two-way mean squares of the Shrout & Fleiss 6 x 4 data give ICC(1,1)
0.16574, ICC(2,1) 0.28976, ICC(3,1) 0.71484; a plain Passing-Bablok
(pairwise slopes without -1, shifted median with offset K, rank CI from
the normal quantile) on Giavarina's 30 pairs gives slope 1.05531 (1.02048
to 1.09146) and intercept 7.08186 (median of y - b x). Both equal the
engine.

## Feature validation: curve fit output (2026-11-24)

### P-22 interpolated unknowns with inverse-prediction intervals

`interpolate.interpolate_unknown` reads an unknown's X off a fitted
curve (the first crossing inside the standards, else the one nearest
them, searched over the standards' X range extended by half of it each
way) with two intervals, each by inverting a band around the curve
(Greenwell & Schubert Kabban 2014, The R Journal 6(1):90-100, eqs. 2, 6
and 7; Graybill 1976, section 6.9; Seber & Wild 1989, section 5.12):

- the 95% CI, where the curve's confidence band reaches the unknown's Y:
  (y0 - f(x))^2 <= t^2(n - p) Var f(x), the uncertainty of the curve
  alone (investr `mean.response = TRUE`; the band crossing of the
  GraphPad guide and of the standard-curve assay);
- the 95% prediction interval, with the scatter of the reading added:
  (ybar0 - f(x))^2 <= t^2(n + m - p - 1) (Sy.x^2 / m + Var f(x)) for the
  mean of m readings (investr's default inversion interval; invest.nls
  uses sigma^2 and that t). Not reported for weighted or summary-data
  fits, where Sy.x is not the scatter of one reading.

Var f(x) is the delta method of the confidence bands (exact for lines
and polynomials). A limit that does not close within the range searched
is open (None, shown as "(very wide)"); an unknown outside the standards
is flagged "extrapolated"; a Y the curve never reaches has no X.

`dose_response` takes `interpolate_unknowns` (each Y value in a row with
no X is an unknown, no longer silently left out) and gives typed
`interpolate_y` values the same block; `interpolated_x` is unchanged.

Reference: `engine/tests/reference/interpolate_unknowns.py`, an own
implementation of investr's inversion intervals sharing no code with the
engine (statsmodels OLS and its `se_mean` for the line and the
quadratic, scipy `curve_fit` with an analytic gradient for the
nonlinear model, brentq from the estimate outward), plus Graybill's
closed form (eq. 2) for the line. R is not installed.
`engine/tests/test_interpolate_unknowns.py`:

| Input | Reference | Engine tolerance |
|---|---|---|
| BCA, 7 standards (0 to 2000 µg/mL), quadratic; unknowns A562 0.42, 0.75, 1.21 | X 372.963, 811.428, 1574.087; 95% CI 368.638 to 377.313, 804.526 to 818.390, 1565.304 to 1582.913; prediction 362.811 to 383.166, 798.776 to 824.181, 1557.092 to 1591.230 | 1e-6 relative |
| same curve, Y 1.55 and 0.05 | X 2417.03 and -56.93, both "extrapolated"; Y 3.0 not reached (above) | 1e-6 relative |
| straight line, 8 points; Y 6.0 and 12.5 | Graybill eq. 2: CI 2.37532 to 2.59399, prediction 2.22794 to 2.74137; CI 5.63600 to 5.82235, prediction 5.47891 to 5.97944 | 1e-6 relative |
| nasturtium (drc data, 42 points), [Inhibitor] vs. response with Bottom = 0 (= theta1/(1 + exp(theta2 + theta3 log x))), y0 = 309, 296, 419 | published (Greenwell & Schubert Kabban 2014, Section 3.1, and the investr README): estimate 2.263854, inversion interval 1.772244 to 2.969355 | 5e-6 (upper 2e-5: the paper's own fit stops at 2.969355, the reference script reaches 2.969362) |

Also tested: a log-X 4PL (X and limits as 10^X, the curve at the
interpolated X equal to the Y), X in other units (X and limits scale by
1/1000) and Y times 10 (same X), replicates and blanks in unknown rows,
off by default (the old "left out of the fit" warning), a weighted fit
(no prediction interval), a robust fit (skipped, said so), two
crossings (the first reported, both counted), an open limit on a flat
line and a zero-width band on an exact line.

The web reads the block in `sheets/xy/interpolation.ts` (typeset table,
markers with the CI as horizontal bars; unit-tested) and e2e-results /
e2e-figures assert the table and the marker positions against the same
reference.

### P-52 the drawn curve's X range and resolution

`dose_response` takes `curve_range` ([start, end] in the fit's X units:
log10 of the concentration for log-X models; either side blank for the
default) and `curve_points` (10 to 5000, default 200).
`doseresponse.curve_points` then draws the curve from start to end in n
evenly spaced points plus the two ends of the fitted X range when they
fall inside it, returns that range as `data_range`, and the web draws
the parts beyond it dotted (the model's extrapolation, not a
measurement; the figure legend says so). Bands follow the drawn curve;
the fit, its parameters, the interpolation and the absolute IC50 keep
the default range and do not move. Without the options the curve is
unchanged (same 200 points, no new keys).

Validation by hand evaluation (`engine/tests/test_curve_range.py`): the
plan's acceptance test (the example 4PL, start at log dose -11: the
curve starts at -11, ends at the padded default -4.5, holds -9 and -5,
and every drawn y equals Bottom + (Top - Bottom) / (1 + 10^((LogIC50 -
X) HillSlope)) written out in the test, to 1e-12 relative); the BCA
quadratic drawn from -500 to 2500 µg/mL against B0 + B1 X + B2 X^2;
1000 points; a range inside the data (no extension); a far range
(finite plateaus); a user-defined equation; and settings that cannot
be drawn (start not below end, a start beyond the default end, points
outside 10 to 5000 or not whole, a malformed range), which keep the fit
and the default curve with a warning saying what to enter. e2e-figures drives the "Start at X" and
"Points on the curve" fields and checks the drawn points against the
same equation in JavaScript (1e-9 relative), the dotted parts and the
legend.

Independent check (2026-11-24, by the lead): a quadratic by numpy least
squares on the BCA standards and brentq inversion of the fitted curve,
of the 95% confidence band (t(0.975, 4) x SE of the mean) and of the
prediction band (adding s^2) gives, for A562 = 0.42, X = 372.9628, CI
368.6376 to 377.3131, prediction interval 362.8113 to 383.1656: the
engine's values.

## Feature validation: quasi-Poisson, partial and compared correlations, survival difference, normalize references (2026-11-24)

### Fix: densitometry lanes without a loading control

`assay_densitometry.densitometry`: when some lanes have a loading-control
(reference) value and a lane has none, that lane was normalised by its
target alone and averaged with the target / loading-control ratios of
the other lanes (two scales in one result). It is now left out of the
ratios and the statistics (flag `no_reference`, a warning, and the
Analysed line names it: "no loading-control value"). With no
loading-control value in any lane, every lane is still normalised by
its target alone (one scale), unchanged. `engine/tests/test_assay_densitometry.py`
checks that a lane missing its loading control changes nothing but its
own exclusion (every per-blot value, the matched tables, the summaries,
the graph and the P equal the run without that lane). No e2e-assays pin
moved: the example and the GraphPad ratio example have a loading control
in every lane.

### P-46 Quasi-Poisson for overdispersed counts

`multivar.poisson_regression(quasi=True)` (API option `quasi`): the
Poisson estimates, the dispersion phi = Pearson chi2 / (n - k), every SE
multiplied by sqrt(phi), t statistics and P values on n - k df, Wald CIs
from t, and the overall F test F = (null deviance - deviance) / (k - 1)
/ phi on (k - 1, n - k) df; no AICc (no likelihood). Wedderburn (1974)
Biometrika 61:439; McCullagh & Nelder (1989) sections 4.5 and 9.2. The
Checks row chip "Counts are overdispersed (phi = ...)" (phi > 1.5 with at
least 5 df, the engine's rule) switches to it in one click; with it on,
the chip says so and switches back.

Reference: `engine/tests/reference/quasi_poisson.py` (statsmodels 0.15
`GLM(Poisson, scale="X2")` fitted with `use_t=True`; the F test by hand
from its deviances; R is not installed) on the Ames TA98 revertant
counts (Margolin et al. 1981; Breslow 1984, whose Pearson chi2 46.3 on
15 df it reproduces). `engine/tests/test_poisson_regression.py`:

| Input | Reference | Engine tolerance |
|---|---|---|
| Ames TA98, log mu = b0 + b1 log(dose + 10) + b2 dose | phi = 3.08471 (Pearson chi2 46.2707, 15 df); SE 0.383631, 0.100114, 0.000430687 (Poisson SE x sqrt(phi)); P 4.5004e-5, 0.0060299, 0.032742; CI of b1 0.106438 to 0.533212; F(2, 15) = 5.61508, P = 0.0151243 | 1e-7 (P 1e-6) |

Also tested: the estimates equal the Poisson ones and each SE is the
Poisson SE times sqrt(phi) to 1e-12; permuting rows changes nothing; dose
in mg scales the slope's SE by 1000 and leaves P; an exact fit (phi = 0)
is refused with a sentence; underdispersed counts shrink the SEs (as R's
quasipoisson) and the chip says so.

### P-48 Partial correlation and comparing two correlations

`correlation.partial_correlation` (the correlation matrix's "Partial
correlation: control for", `multivar.correlation_matrix(control=...)`):
the Pearson r of the residuals of x and y after least squares on the
control variables, on the rows where all are present; P from t on
n - 2 - k df; Fisher z CI with SE 1 / sqrt(n - 3 - k); Spearman ranks
everything first. `correlation.compare_independent`: Fisher's z for two
correlations from independent samples. `compare_dependent_overlapping` /
`compare_dependent_nonoverlapping`: Steiger (1980) Psychol Bull 87:245
Z1* and Z2* (Fisher z, the Pearson-Filon covariance with the two compared
r replaced by their mean). In the app: the column correlation and the XY
"X against each Y" correlation compare two correlations; the design is
read from the rows (values in the same rows: the same subjects) unless
chosen, and the results say which.

Reference: `engine/tests/reference/partial_compare_corr.py` (pingouin 0.7
`partial_corr` and a hand residual-on-residual computation; Fisher z and
Steiger's Z by hand; a Monte Carlo check of the Pearson-Filon covariance,
200,000 samples of n = 200; R ppcor and cocor are not installed) on a
24-subject table (Age, SBP, BMI, cholesterol; numpy seed 48).
`engine/tests/test_partial_compare_corr.py`:

| Input | Reference | Engine tolerance |
|---|---|---|
| SBP, BMI, cholesterol controlling for Age (Pearson and Spearman) | pingouin r and P for each pair, df = 21; CI to pingouin's 2 decimals | 1e-12 (P 1e-9) |
| SBP vs cholesterol controlling for Age and BMI | pingouin r, P, df = 20 | 1e-12 |
| Dose A / Response A (n = 15) against Dose B / Response B (n = 12) | r1 = 0.708754, r2 = 0.525026, z = 0.683563, P = 0.494251 | 1e-12 |
| r(SBP, Age) against r(SBP, BMI), same 24 subjects | Z1* = 2.52613, P = 0.0115326 | 1e-10 |
| r(Age, SBP) against r(Age, BMI) (the XY layout) | Z1* = 2.65924, P = 0.00783174 | 1e-9 |
| r(SBP, Age) against r(BMI, cholesterol) | Z2* = 2.20759, P = 0.0272728 | 1e-10 |
| Pearson-Filon covariance, known rho | simulated 0.0870 vs formula 0.0855 (overlapping); 0.0460 vs 0.0464 | 0.003 |

Also tested: symmetry in x and y, units, row order; a missing value drops
its row for that pair only; too few rows, a constant or collinear control
variable and a variable the controls explain exactly each give a
sentence; independent comparisons of a shared data set, Spearman and the
same pair twice are refused with a reason; a row missing one of the four
values is left out of the dependent test and counted.

### P-28 Difference in survival at a chosen time

`survival_extras.survival_at_times` now returns "differences": each
group minus the first at each chosen time, with the Greenwood SE of the
difference sqrt(se1^2 + se0^2), a linear CI, and the P value of the
complementary log-log test of Klein, Logan, Harhoff & Andersen (2007)
Stat Med 26:4505: X2 = [ln(-ln S1) - ln(-ln S0)]^2 / [v1 / (ln S1)^2 +
v0 / (ln S0)^2], v the Greenwood sum, chi-square on 1 df. The results say
the time must be chosen before looking at the curves.

Reference: `engine/tests/reference/survival_difference.py` (a Kaplan-Meier
with Greenwood SEs written in numpy, statsmodels 0.15 `SurvfuncRight` as
a second oracle, the cloglog test by hand; R and lifelines are not
installed) on R's survival::lung by sex (docs/validation/datasets/surv-lung.csv).
`engine/tests/test_survival_difference.py`:

| Input | Reference | Engine tolerance |
|---|---|---|
| lung, 365 days | S male 0.336088 (SE 0.0434236), female 0.526463 (SE 0.0597369); difference 0.190375 (SE 0.0738519), 95% CI 0.0456282 to 0.335122; cloglog chi2 6.20657, P = 0.0127277 | 1e-10 (P 1e-9) |

Also tested: swapping the groups flips the sign and keeps P; days to
weeks leaves P; several times and three groups; S = 1 (no events yet),
S = 0 and a time after the last observation each give a reason instead
of a number.

### P-57 The references behind derived numbers

`normalize.normalize_references` (API `normalize`, each data set's
"references"): the 0% and 100% values a Normalize used, their rule and
the row they came from; `manipulate.remove_baseline` adds each data
set's "baseline" (the data set, the rows and the mean taken, or the
typed value). The results sheet lists them per data set ("21, the
smallest mean ("10 nM")", "99.67, the mean of the last row ("vehicle")"),
and hovering a column or grouped bar shows the mean, SD and n behind it.

Reference: hand derivation, `engine/tests/test_normalize_references.py`:
the P-55 example (WT 20/22/21, 55/60/58, 98/101/100; KO 30/33/31,
70/66/68, 99/97/103): 0% = 21 (WT) and 31.333 (KO), the smallest row
means (row "10 nM"); 100% = 99.667 for both, the vehicle row's mean; the
output's row means are then exactly 0 and 100. Also tested: first,
largest, sum and typed rules, separate subcolumns, ties (the first row),
empty data sets, and every Remove baseline mode.

Independent check (2026-11-24, by the lead): an own Poisson IRLS in
numpy on the Ames TA98 counts gives the SE of log(Dose + 10) 0.057001,
phi = Pearson chi-square / 15 = 3.0847, quasi-Poisson SE 0.10011, 95% CI
0.10644 to 0.53321 (t, 15 df), |t| 3.1946; an own Kaplan-Meier with
Greenwood variances on survival::lung at 365 days gives male 0.33609,
female 0.52646, difference 0.19038 (95% CI 0.04563 to 0.33512, SE
0.073852) and the Klein et al. 2007 cloglog statistic 6.2066, P =
0.012728. All equal the engine.

## Feature validation: ANCOVA, binomial and negative binomial regression, Firth's logistic regression (2026-11-24)

### P-82 Baseline-adjusted comparison (ANCOVA)

`multivar.ancova` (API `ancova`; Analyze > Baseline-adjusted comparison
(ANCOVA) on a multiple-variables table): follow-up = b0 + group effects
+ b1 x baseline by least squares, one slope for every group. Reported:
the adjusted means (each group's prediction at the mean baseline of the
analysed rows, SE sqrt(x0' V x0), t CI), the adjusted differences
against the reference group (the group coefficients, t CI and P), the
type III table (drop-one sums of squares), the slope of the baseline,
and the equal-slopes check (F test of the group x baseline interaction,
with each group's own slope) in the Checks row. Vickers & Altman (2001)
BMJ 323:1123. Help me choose asks "Was the outcome also measured in
each subject before treatment (a baseline)?" and routes two or more
groups to ANCOVA, with two-way repeated-measures ANOVA (group x time)
as the explained alternative.

Reference: `engine/tests/reference/ancova.py` (statsmodels 0.15 `ols`
with `get_prediction` at the mean baseline for the adjusted means,
`anova_lm(typ=3)` with sum-to-zero coding for the type III table, and
`anova_lm(main, interaction)` for the equal-slopes F; R's lm + emmeans +
car::Anova are not installed). `engine/tests/test_ancova.py`:

| Input | Reference | Engine tolerance |
|---|---|---|
| Two groups of 10 (made up), baseline and follow-up | Treated - Control adjusted difference -5.663357 (SE 0.506327), 95% CI -6.731614 to -4.595100, P = 2.9275e-9 on 17 df; adjusted means 51.681679 and 46.018321 (SE 0.358000); group F(1, 17) = 125.108; equal slopes F(1, 16) = 0.348089, P = 0.563437 | 1e-9 (P 1e-7) |
| Three groups of 7, 6 and 8 (made up), unequal slopes | B - A -1.750679 (SE 0.552102), C - A 2.633125 (SE 0.515484); adjusted means 12.697099, 10.946420, 15.330224; group F(2, 17) = 35.0213; equal slopes F(2, 15) = 75.3598 (the warning fires) | 1e-9 (P 1e-7) |

Also tested: the reference level flips the sign and keeps SE and P;
row order; outcome x 1e-12 and x 1e12 scales the difference, baseline x
c or + 1000 leaves it; a numeric 1/2 group column is read as levels;
missing values drop the row and the Analysed line names it; one group,
a constant baseline, a baseline constant within each group, an exactly
fitted outcome, too few rows and no complete rows are refused with a
sentence; with 4 rows the shared-slope model fits and the equal-slopes
check says why it is missing.

### P-86 Binomial regression (positives out of counted) and negative binomial regression

`multivar.binomial_regression` (API `binomial_regression`; Analyze >
Binomial regression (positives out of counted)): logit(P(positive)) =
b0 + b1 X1 + ... for s positives out of n counted per row, by maximum
likelihood (Newton-Raphson); Wald z P values, profile-likelihood CIs,
odds ratios, the likelihood ratio test of each term (a block such as the
experiment tested as a whole, as drop1(test = "LRT")), the deviance and
the dispersion phi = Pearson chi2 / (rows - k). quasi=True gives
quasi-binomial SEs (x sqrt(phi)), t tests, Wald t CIs and F tests
(Wedderburn 1974). The dispersion check is always in the Checks row:
"Dispersion phi = ... on k df" (fewer than 5 df), "Proportions are
overdispersed" with a one-click switch to quasi-binomial (phi > 1.5),
or "No overdispersion". Separation and levels with no (or only)
positives are refused by name. Help me choose sends counts from several
dishes or animals per group here (Warton & Hui 2011, Ecology 92:3)
instead of a t test on per-replicate percentages, which stays as the
alternative.

`multivar.negative_binomial_regression` (API
`negative_binomial_regression`; Analyze > Negative binomial regression):
log link, variance mu + mu^2 / theta, coefficients by IRLS at fixed
theta and theta by maximum likelihood at fixed means, alternated as
MASS::glm.nb (Venables & Ripley 2002 section 7.4); SEs from the expected
information at theta, profile CIs with theta held, the likelihood ratio
test against the intercept-only negative binomial model and against
Poisson (boundary: P = chi2.sf(LR, 1) / 2). Counts with no
overdispersion (theta infinite) are refused, pointing to Poisson
regression. The Poisson overdispersion chip also offers "Fit a negative
binomial model".

References: `engine/tests/reference/count_glms.py` (statsmodels 0.15
`GLM(Binomial)` with the two-column endog; quasi-binomial from
`GLM(s / n, var_weights = n).fit(scale="X2", use_t=True)`; profile CIs
by refitting with an offset and brentq; `NegativeBinomial(nb2)` for
theta and beta, `GLM(NegativeBinomial(alpha))` for glm.nb's SEs; R is not
installed) and the published maximum-likelihood negative binomial fit of
the Ames TA98 data (Kenne Pagui, Salvan & Sartori 2020, Table 2, as
printed in the brglm2 negativeBinomial vignette).
`engine/tests/test_count_glms.py`:

| Input | Reference | Engine tolerance |
|---|---|---|
| 3 experiments x 2 groups, positives / counted (made up; the acceptance test) | b(Treated) 1.161871 (SE 0.211427), profile CI 0.754758 to 1.585322; odds ratio 3.195907, 95% CI 2.127097 to 4.880865; group LR chi2 32.8366 (1 df), experiment 1.28317 (2 df), P = 0.526457; deviance 0.054452; phi = 0.027229 on 2 df | estimates 1e-8, SE 1e-7, CI 2e-7 |
| 3 experiments x 2 groups x 3 dishes (made up), quasi-binomial | phi = 4.771766 on 14 df; SE 0.274292, 0.257079, 0.292068, 0.301636; P(Treated) = 0.000233116; F(3, 14) = 9.06036, P = 0.0013817 | 1e-7 (P 1e-5) |
| Ames TA98 (Margolin et al. 1981), NB on dose and log(dose + 10) | theta = 20.505083; b 2.197627, -0.000980, 0.312510 (SE 0.324586, 0.000386, 0.087895); published (4 decimals) 2.1976 (0.3246), -0.0010 (0.0004), 0.3125 (0.0879), 1/theta 0.0488; LR vs Poisson 10.4728, P = 0.000606 | 1e-6 (SE 1e-5, CI 1e-6) |
| MASS::quine (146 children), Days ~ Eth + Sex + Age + Lrn | theta = 1.274893; b 3.269009, -0.569372, -0.082320, -0.448428, 0.088080, 0.356901, -0.292109; LR vs intercept-only G = 25.1159 on 6 df, P = 0.000325 | 1e-6 (CI 1e-5) |

Also tested: Wald CIs; row order; swapping the reference group inverts
the odds ratio and its CI; a missing total drops the row; positives
above the total, a total of 0, non-integer counts, a level with no or
only positives, no positives at all and all positive are refused by
name; separation on a continuous predictor; the exposure offset shifts
only the intercept by log(2); counts without overdispersion and a group
of zero counts are refused for the negative binomial.

### P-89 Firth's logistic regression for separated data

`multivar.logistic_regression(firth=True)` (API option `firth`): Firth's
penalized likelihood (the Jeffreys prior) by Newton steps on the
modified score, SEs from the inverse Fisher information, profile
penalized-likelihood CIs (the penalty on the full model's information,
as logistf), and a penalized likelihood ratio test per coefficient and
for the model (Firth 1993, Biometrika 80:27; Heinze & Schemper 2002,
Stat Med 21:2409). Logistic regression refused for separation now
carries `error_kind = "separation"`; the failed answer offers "Fit with
Firth's correction", and the Firth result says next to the odds ratio
and in the Checks row that the estimate is shrunk toward no effect.

Reference: `engine/tests/reference/firth_logistic.py` (an independent
penalized-likelihood fit with scipy.optimize BFGS and Newton-CG, profile
CIs by brentq; R's logistf is not installed); the bias-reduced fit of
the endometrial data printed in the brglm2 README (Kosmidis); and the
2x2 closed form (Firth's estimate = adding 1/2 to every cell).
`engine/tests/test_firth_logistic.py`:

| Input | Reference | Engine tolerance |
|---|---|---|
| Endometrial cancer (Heinze & Schemper 2002; 79 patients), HG ~ NV + PI + EH; NV separates | b 3.774560, 2.929273, -0.034752, -2.604164 (SE 1.488692, 1.550764, 0.039578, 0.776018; brglm2 README 3.77456, 2.92927, -0.03475, -2.60416 and 1.48869, 1.55076, 0.03958, 0.77602); profile CI of NV 0.609724 to 7.854632, of EH -4.365183 to -1.232721; PLR chi2 8.198014, 6.798457, 0.746829, 17.759317; model chi2 43.6558 on 3 df | 1e-7 (SE 1e-6, CI 2e-6) |
| Two groups of 10, every treated animal responds (3 of 10 controls; the acceptance test) | ML refused for separation; Firth OR 45 (closed form (10.5 x 7.5) / (0.5 x 3.5)), profile CI 3.845063 to 6439.296, PLR chi2 11.0124, P = 0.000905031 | OR 1e-9, CI 1e-6 |

Also tested: without separation the Firth estimate lies between 0 and
the ML one; Wald CIs; row order; the one-continuous-predictor X at 50%;
refusals other than separation carry no `error_kind`.

Independent check (2026-11-24, by the lead, own numpy/scipy code): OLS of
follow-up on group and baseline gives the adjusted difference -5.663357
(SE 0.506327, 95% CI -6.731614 to -4.595100 on 17 df), adjusted means at
the mean baseline 51.681679 and 46.018321, and the equal-slopes F(1, 16)
0.348089, P 0.563437; an own binomial maximum-likelihood fit of the
acceptance dishes with a profile-likelihood CI gives odds ratio 3.195907
(2.127097 to 4.880865) and Pearson dispersion 0.027229 on 2 df. All
equal the engine.

## Feature validation: statistics table, analysis scripts, "What this means" for Wave 2 models (2026-11-24)

These three features add no engine computation: every number they show is
an engine result, written as its results sheet writes it. They are checked
against native engine results (the fixture scripts run `opendose.api`
in CPython, the code Pyodide runs) and, for the scripts, against SciPy and
statsmodels.

### P-66 One statistics table for the whole project

`web/src/report/statsTable.ts`: one row per reported comparison (omnibus
test, each post hoc comparison, each model term, each fitted midpoint)
with the results sheet, the figure panel (layout and letter), the test, n
per group, the statistic with its df, P as the sheet shows it and to four
significant digits, the adjustment and its family, the estimate and the
standardized effect size with CIs. A kind without a mapper, a failed or
pending result gets one row whose Note says why (never dropped). File ›
Export statistics table (.csv / .xlsx), Copy statistics table for Word,
and `statistics.csv` / `.xlsx` / `.html` in the export bundle.

Reference: `web/src/report/__tests__/stats-fixtures.py` (native engine
results of 48 cases); `statsTable.test.ts` checks, per analysis kind
(t tests and their rank and KS forms, one-way, Welch, RM and mixed-model
RM ANOVA, Kruskal-Wallis, Friedman, two-way, three-way and RM two-way
ANOVA, multiple t tests, correlation, contingency, McNemar, kappa, two
proportions, two rates, survival, Cox, multiple, logistic, Poisson,
quasi-Poisson, negative binomial and binomial regression, nested t and
ANOVA, nested two-way, grouping-column and time-course mixed models,
subject summaries, 4PL fits, linear regression, quantal fits, one-sample
tests, estimation, Deming, ICC, ROC, Bland-Altman), that each cell equals
the engine field through the results sheet's formatter (formatSig at the
results precision, pformat.tableP). Pinned examples: unpaired t test
t = -5.596, df 10, P 2.290e-4, difference -5.2 (95% CI -7.271 to -3.129),
d = -3.231 (-4.996 to -1.403); one-way ANOVA F(2, 15) = 84.75, Tukey
Control vs. Treated A q = 8.288, P 8.779e-5 (shown < 0.0001), family "3
comparisons (all pairs of 3 groups)"; 4PL IC50 1.040e-7 (9.695e-8 to
1.115e-7). e2e-share opens `e2e-fixtures/stage/stats-table.json` (a t
test, a one-way ANOVA with Tukey and a 4PL fit, two of them on a layout)
and checks every row against the numbers its results sheet shows, the
figure panels (A, B), the Excel sheet (P exact as numbers), the Word
table on the clipboard and that the bundle's `statistics.csv` is the
same table.

"""


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
(no built-in beyond 6th order) - and it passes NIST Filip at 1e-6 (built
in since the second pass: `polynomial_seventh` .. `polynomial_tenth`).

### Datasets the engine cannot analyse at all

* `drc-earthworms`: binomial log-logistic with an estimated (or fixed 0.5)
  upper limit; the quantal analysis has no upper-asymptote parameter.
* `r-fisher-job`, `r-fisher-mp6`: Fisher's exact test for r x c tables.
* `r-cmh-satisfaction`: generalized CMH for a 4 x 4 x 2 table.

### Reference problems found in this pass (category d, not previously flagged)

* `nist-rat43` df: the manifest said 9, NIST certifies 11 (15 points, 4
  parameters; RSS / sigma^2 = 11.0). Corrected in the manifest in the
  second pass.
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
    lines += [FEATURE_VALIDATION_MD.strip(), ""]
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

### Second pass (findings of the live-site run, results-site.md)

1. **Multistart budget** (`nlfit.MULTISTART_*`, `lsq.Budget`): every
   start of a multistart is capped at 2000 solver evaluations; after the
   first start the others share an evaluation / wall-clock budget (soft
   40,000 evaluations: no new start once a converged fit is in hand;
   hard 80,000 evaluations or 1.5 s: the running start is abandoned).
   Single-start fits (user equations, the NIST problems) are not
   budgeted. The automatic 4PL fit of NIST NoInt1 (a straight line)
   gives up in 1.7 s natively instead of 37-53 s; no result in the test
   suite or the corpus changed.
2. **Studentized range** (new `studentized.py`, used by Tukey, Games-
   Howell, Newman-Keuls and the mixed / two- / three-way Tukey tests): a
   deterministic, vectorised double integral (log-space, exact for k = 2
   to 1e-13) in place of scipy's, which took ~0.3 s per quantile and was
   called once per pair: one-way ANOVA with Tukey on NIST SmLs01 (9 x 21)
   0.11 s instead of 10.9 s, SmLs09 (9 x 2001) 0.11 s instead of 13.7 s.
3. **Polynomials to 10th order** (`polynomial_seventh` ..
   `polynomial_tenth` and centered forms) with an analytic Jacobian;
   covariances everywhere come from the QR factorisation of the
   column-scaled Jacobian (not an explicit inverse of J'J) and parameter
   dependencies from the Jacobian. NIST Filip through the built-in
   `polynomial_tenth` from its own start: estimates 2e-8, SEs 5e-8,
   Sy.x 5e-9 relative to the certified values.
4. **Lag-1 autocorrelation** in column statistics
   (`descriptive.lag1_autocorrelation`, the 9 NIST univariate datasets to
   1e-14) and the **uncentred R^2** of fits through the origin
   (`goodness.r_squared_uncentered`, NIST NoInt1 to 1e-15).
5. **Survival**: the Kaplan-Meier table per group (`curves.<g>.table`:
   time, at risk, events, censored, survival, SE, log-log and log CIs)
   and self-describing log-rank keys (`chi2_peto` / `p_peto` beside
   `chi2_variance` / `p_variance`).
6. **Chou-Talalay**: combination indices only where 0 < fa < 1 and both
   median-effect fits are valid (m > 0, r^2 >= 0.81, 3+ doses), otherwise
   null with a reason (the Mathews block's 1e+28 indices are gone).
7. **Plate reader grids**: the labelled extent decides the shape (a
   labelled 384-well grid was read as its top-left 96 wells), 6- to
   1536-well formats, warnings instead of silent truncation.
8. Manifest: `nist-rat43` df corrected from 9 to 11 (transcription
   error); `nist-filip` mapped through `polynomial_tenth`.

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
