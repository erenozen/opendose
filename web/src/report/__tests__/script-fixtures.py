"""Data tables and their native engine results for the export bundle's
analysis.py (scripts.test.ts, P-67). Each case holds the table as the app
stores it (a DataTableModel: the bundle writes its long CSV from it), the
results sheet's analysis id and options, and the engine result for the
payload the app sends for that table. Regenerate after an engine change:

    PYTHONPATH=engine python3 web/src/report/__tests__/script-fixtures.py \\
        > web/src/report/__tests__/script-fixtures.json

from the repository root (numpy and scipy needed). Long arrays are cut.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "..", "..", "engine"))
from opendose.api import analyze, _json_safe  # noqa: E402

C = [23.1, 25.4, 21.8, 24.9, 22.6, 26.0]
A = [28.4, 30.2, 27.1, 31.5, 29.0, 28.8]
B = [35.2, 33.9, 37.4, 34.1, 36.6, 35.8]
GROUPS = [("Control", C), ("Treated A", A), ("Treated B", B)]


def cell(v):
    return "" if v is None else repr(v) if isinstance(v, float) else str(v)


def table(type_, datasets, x=None, row_titles=None, x_title="", sub_format="replicates"):
    n = max([len(x or [])] + [len(d["rows"]) for d in datasets] + [len(row_titles or [])])
    return {"type": type_, "x": [cell(v) for v in (x or [None] * n)], "xTitle": x_title,
            "xFormat": "numbers", "xUnit": "", "yTitle": "", "rowTitles": row_titles or [""] * n,
            "datasets": datasets, "subcolumnFormat": sub_format, "replicateLayout": "side_by_side"}


def ds(name, rows):
    return {"name": name, "rows": [[cell(v) for v in r] for r in rows]}


COLUMN_T = table("column", [ds(n, [[v] for v in vs]) for n, vs in GROUPS])
COLUMN_P = {"x": [None] * 6, "datasets": [{"name": n, "ys": [[v] for v in vs]} for n, vs in GROUPS]}

ROWS = ["Day 7", "Day 14", "Day 21"]
VEH = [[152, 168, 141], [298, 341, 312], [512, 587, 549]]
DRUG = [[148, 139, 160], [221, 205, 239], [302, 276, 331]]
GROUPED_T = table("grouped", [ds("Vehicle", VEH), ds("Drug", DRUG)], row_titles=ROWS)
GROUPED_P = {"row_titles": ROWS, "datasets": [{"name": "Vehicle", "ys": VEH}, {"name": "Drug", "ys": DRUG}]}

CT = [[10, 20], [25, 5]]
CT3 = [[10, 20, 5], [25, 5, 9]]


def ctable(m, outcomes):
    return table("contingency", [ds(o, [[r[j]] for r in m]) for j, o in enumerate(outcomes)],
                 row_titles=[f"Row {i + 1}" for i in range(len(m))])


SURV = {"Control": [[6, 1], [13, 1], [21, 1], [30, 1], [31, 0], [37, 1], [38, 1], [47, 0], [49, 1], [50, 1]],
        "Treated": [[10, 1], [21, 1], [33, 1], [40, 0], [45, 1], [46, 1], [50, 1], [52, 0], [53, 1], [55, 0]]}
SURV_T = table("survival", [ds(k, v) for k, v in SURV.items()], sub_format="survival")
SURV_P = {"x": [None] * 10, "datasets": [{"name": k, "ys": v} for k, v in SURV.items()]}

XY_X = [-9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5]
XY_ROWS = [[98.2, 101.5, 99.1], [97.0, 95.8, 99.9], [93.4, 90.1, 92.7], [78.9, 82.3, 80.0],
           [51.2, 48.7, 50.9], [22.1, 25.6, 24.0], [8.9, 10.2, 7.5], [3.1, 4.4, 2.2],
           [1.0, 0.5, 2.1]]
DR_T = table("xy", [ds("Drug A", XY_ROWS)], x=XY_X, x_title="log[Drug] (M)")
DR_P = {"x": XY_X, "datasets": [{"name": "Drug A", "ys": XY_ROWS}]}
LR_X = [1, 2, 3, 4, 5, 6]
LR_Y = [[2.1], [3.9], [6.2], [7.8], [10.1], [12.2]]
LR_T = table("xy", [ds("Rate", LR_Y)], x=LR_X, x_title="Time")
LR_P = {"x": LR_X, "datasets": [{"name": "Rate", "ys": LR_Y}]}


def mv(variables):
    return (table("multivariable", [ds(n, [[v] for v in vs]) for n, vs in variables]),
            {"variables": [{"name": n, "values": vs} for n, vs in variables]})


DOSE10 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] * 2
SEX = ["F", "M"] * 10
RESP = [0, 0, 0, 1, 0, 1, 1, 1, 1, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 1]
WEIGHT = [21.0, 22.4, 23.1, 24.9, 25.2, 26.8, 27.5, 29.1, 29.8, 31.6,
          20.5, 22.9, 22.8, 25.3, 24.7, 27.2, 27.9, 28.6, 30.4, 31.1]
MV_T, MV_P = mv([("Dose", DOSE10), ("Sex", SEX), ("Response", RESP), ("Weight", WEIGHT)])
COLONIES = [12, 15, 9, 14, 11, 13, 10, 16, 25, 31, 22, 28, 35, 41, 30, 38]
COUNTS_T, COUNTS_P = mv([("Colonies", COLONIES), ("Treatment", ["Control"] * 8 + ["Mutagen"] * 8),
                         ("Area", [1, 1, 1, 1, 2, 2, 2, 2] * 2)])
BINOM_T, BINOM_P = mv([("Positive", [8, 11, 9, 12, 18, 21, 17, 23]), ("Counted", [40, 42, 38, 41, 40, 43, 39, 42]),
                       ("Dose", ["Low"] * 4 + ["High"] * 4)])
TIME = [5, 8, 12, 14, 20, 22, 25, 30, 33, 40, 6, 9, 15, 18, 26, 31, 35, 42, 48, 50]
EVENT = [1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0]
GROUP = ["Control"] * 10 + ["Treated"] * 10
AGE = [60, 62, 58, 70, 66, 59, 61, 64, 67, 72, 61, 63, 57, 69, 65, 60, 62, 66, 68, 71]
COX_T, COX_P = mv([("Time", TIME), ("Event", EVENT), ("Group", GROUP), ("Age", AGE)])

HERDS = {"Control": [[42.1, 44.3, 40.8, 43.5], [46.2, 47.9, 45.1, 48.4], [41.0, 39.6, 42.7, 40.2]],
         "Diet A": [[49.8, 52.1, 50.4, 51.7], [47.3, 45.9, 48.8, 46.5], [53.0, 54.6, 51.9, 52.8]]}
# nested table: one subcolumn per herd, the herd's values down the rows
NESTED_T = table("nested", [dict(ds(g, [[h[r] for h in herds] for r in range(4)]),
                                 subTitles=["Herd 1", "Herd 2", "Herd 3"]) for g, herds in HERDS.items()])
NESTED_P = {"groups": [{"name": g, "subgroups": h, "subgroup_names": ["Herd 1", "Herd 2", "Herd 3"]}
                       for g, h in HERDS.items()]}

R1 = [9, 6, 8, 7, 10, 6, 5, 8, 7, 9, 4, 6]
R2 = [8, 6, 9, 6, 10, 7, 5, 7, 8, 9, 5, 5]
BA_T = table("column", [ds("Method A", [[v] for v in R1]), ds("Method B", [[v] for v in R2])])
BA_P = {"x": [None] * 12, "datasets": [{"name": "Method A", "ys": [[v] for v in R1]},
                                       {"name": "Method B", "ys": [[v] for v in R2]}]}

# cells per field, three fields per dish, four dishes per treatment
DISH_Y = [41, 44, 39, 52, 55, 50, 47, 45, 49, 38, 40, 36, 58, 61, 57, 66, 69, 64, 60, 63, 59, 55, 52, 56]
GROUPING_T, GROUPING_P = mv([("Cells", DISH_Y), ("Treatment", ["Vehicle"] * 12 + ["Drug"] * 12),
                             ("Dish", [f"D{i // 3 + 1}" for i in range(24)])])
# repeated measures with one missing value and a real subject effect
SUBJ = [0.0, 3.1, -2.2, 5.3, 1.4, -4.0]
MRM = [("Control", [round(v + o, 2) for v, o in zip(C, SUBJ)]),
       ("Treated A", [round(v + o, 2) for v, o in zip(A, SUBJ)][:5] + [None]),
       ("Treated B", [round(v + o, 2) for v, o in zip(B, SUBJ)])]
MRM_T = table("column", [ds(n, [[v] for v in vs]) for n, vs in MRM])
MRM_P = {"x": [None] * 6, "datasets": [{"name": n, "ys": [[v] for v in vs]} for n, vs in MRM]}

# (key, analysis id, app options, table, engine analysis, payload, engine options)
CASES = [
    ("ttest_unpaired", "column", {"analysis": "ttest"}, COLUMN_T, "ttest", COLUMN_P,
     {"kind": "unpaired", "welch": False, "dataset_a": 0, "dataset_b": 1}),
    ("ttest_welch", "column", {"analysis": "ttest", "ttestKind": "welch"}, COLUMN_T, "ttest", COLUMN_P,
     {"kind": "unpaired", "welch": True, "dataset_a": 0, "dataset_b": 1}),
    ("ttest_paired", "column", {"analysis": "ttest", "ttestKind": "paired"}, COLUMN_T, "ttest", COLUMN_P,
     {"kind": "paired", "dataset_a": 0, "dataset_b": 1}),
    ("mann_whitney", "column", {"analysis": "ttest", "ttestKind": "mann_whitney"}, COLUMN_T, "ttest", COLUMN_P,
     {"kind": "mann_whitney", "dataset_a": 0, "dataset_b": 1}),
    ("wilcoxon", "column", {"analysis": "ttest", "ttestKind": "wilcoxon"}, COLUMN_T, "ttest", COLUMN_P,
     {"kind": "wilcoxon", "dataset_a": 0, "dataset_b": 1}),
    ("ks", "column", {"analysis": "ttest", "ttestKind": "kolmogorov_smirnov"}, COLUMN_T, "ttest", COLUMN_P,
     {"kind": "kolmogorov_smirnov", "dataset_a": 0, "dataset_b": 1}),
    ("anova_tukey", "column", {"analysis": "anova"}, COLUMN_T, "anova", COLUMN_P,
     {"kind": "parametric", "comparisons": "tukey", "control_index": 0}),
    ("anova_dunnett", "column", {"analysis": "anova", "comparisons": "dunnett"}, COLUMN_T, "anova", COLUMN_P,
     {"kind": "parametric", "comparisons": "dunnett", "control_index": 0}),
    ("kruskal", "column", {"analysis": "anova", "anovaKind": "nonparametric"}, COLUMN_T, "anova", COLUMN_P,
     {"kind": "nonparametric", "comparisons": "dunn", "control_index": 0}),
    ("welch_anova", "column", {"analysis": "anova", "anovaSd": "unequal"}, COLUMN_T, "anova_unequal_var", COLUMN_P,
     {"comparisons": "games_howell", "family": "all"}),
    ("rm_anova", "column", {"analysis": "rm_anova"}, COLUMN_T, "rm_anova", COLUMN_P, {"kind": "parametric"}),
    ("friedman", "column", {"analysis": "rm_anova", "rmKind": "nonparametric"}, COLUMN_T, "rm_anova", COLUMN_P,
     {"kind": "nonparametric"}),
    ("correlation", "column", {"analysis": "correlation"}, COLUMN_T, "correlation", COLUMN_P,
     {"method": "pearson", "dataset_a": 0, "dataset_b": 1}),
    ("spearman", "column", {"analysis": "correlation", "corrMethod": "spearman"}, COLUMN_T, "correlation", COLUMN_P,
     {"method": "spearman", "dataset_a": 0, "dataset_b": 1}),
    ("column_statistics", "column", {"analysis": "column_statistics", "hypothetical": "20"}, COLUMN_T,
     "column_statistics", COLUMN_P, {"hypothetical": 20}),
    ("two_way", "grouped", {"analysis": "two_way"}, GROUPED_T, "two_way_anova", GROUPED_P,
     {"row_factor": "Day", "col_factor": "Treatment", "row_names": ROWS}),
    ("contingency_2x2", "contingency", {}, ctable(CT, ["Yes", "No"]), "contingency", {"table": CT}, {}),
    ("contingency_2x3", "contingency", {}, ctable(CT3, ["A", "B", "C"]), "contingency", {"table": CT3}, {}),
    ("mcnemar", "mcnemar", {}, ctable([[10, 20], [5, 25]], ["+", "-"]), "mcnemar", {"table": [[10, 20], [5, 25]]}, {}),
    ("kappa", "kappa", {}, ctable([[10, 2], [3, 25]], ["Yes", "No"]), "kappa", {"table": [[10, 2], [3, 25]]}, {}),
    ("survival", "survival", {}, SURV_T, "survival", SURV_P, {}),
    ("dose_response", "nonlin", {"model": "log_inhibitor_vs_response_4pl", "xIsLog": True}, DR_T, "dose_response",
     DR_P, {"model": "log_inhibitor_vs_response_4pl", "x_is_log": True}),
    ("linear_regression", "linreg", {}, LR_T, "linear_regression", LR_P, {}),
    ("multiple_regression", "mv_multiple", {"outcome": "Weight", "predictors": ["Dose", "Sex"]}, MV_T,
     "multiple_regression", MV_P, {"outcome": "Weight", "predictors": ["Dose", "Sex"]}),
    ("logistic", "mv_logistic", {"outcome": "Response", "predictors": ["Dose", "Sex"]}, MV_T,
     "logistic_regression", MV_P, {"outcome": "Response", "predictors": ["Dose", "Sex"]}),
    ("poisson", "mv_poisson", {"outcome": "Colonies", "predictors": ["Treatment"]}, COUNTS_T,
     "poisson_regression", COUNTS_P, {"outcome": "Colonies", "predictors": ["Treatment"], "exposure": "Area"}),
    ("poisson_quasi", "mv_poisson", {"outcome": "Colonies", "predictors": ["Treatment"]}, COUNTS_T,
     "poisson_regression", COUNTS_P, {"outcome": "Colonies", "predictors": ["Treatment"], "exposure": "Area",
                                      "quasi": True}),
    ("negbin", "mv_negbin", {"outcome": "Colonies", "predictors": ["Treatment"]}, COUNTS_T,
     "negative_binomial_regression", COUNTS_P, {"outcome": "Colonies", "predictors": ["Treatment"],
                                                "exposure": "Area"}),
    ("binomial", "mv_binomial", {"outcome": "Positive", "predictors": ["Dose"]}, BINOM_T, "binomial_regression",
     BINOM_P, {"outcome": "Positive", "totals": "Counted", "predictors": ["Dose"],
               "reference_levels": {"Dose": "Low"}}),
    ("cox", "mv_cox", {"time": "Time", "event": "Event", "eventCode": "1"}, COX_T, "cox", COX_P,
     {"time": "Time", "event": "Event", "covariates": ["Group", "Age"], "categorical": ["Group"],
      "reference": {"Group": "Control"}}),
    ("nested_t", "nested", {"analysis": "nested_t"}, NESTED_T, "nested_ttest", NESTED_P, {}),
    ("mixed_grouping", "mv_mixed", {"outcome": "Cells", "factors": ["Treatment"], "grouping": "Dish"}, GROUPING_T,
     "mixed_grouping", GROUPING_P, {"outcome": "Cells", "factors": ["Treatment"], "grouping": "Dish",
                                    "levels": {"Treatment": ["Vehicle", "Drug"]}}),
    ("mixed_rm_one_way", "column", {"analysis": "rm_anova"}, MRM_T, "mixed_rm_oneway", MRM_P,
     {"method": "mixed", "comparisons": "tukey"}),
    ("bland_altman", "bland_altman", {}, BA_T, "bland_altman", BA_P, {}),
    ("roc", "roc", {}, BA_T, "roc", BA_P, {}),
    # custom contrasts (P-83): one planned and one post hoc (Scheffe)
    ("anova_contrasts", "column", {"analysis": "anova"}, COLUMN_T, "anova", COLUMN_P,
     {"kind": "parametric", "comparisons": "tukey", "control_index": 0, "custom_contrasts": [
         {"name": "Treated vs control", "coefficients": [-2, 1, 1], "planned": True},
         {"name": "B vs A", "coefficients": [0, -1, 1], "planned": False}]}),
]

DROP = {"traceback", "kde", "percentiles", "curve", "residuals", "points", "predicted", "observed",
        "fitted", "residual_plot", "bands", "schoenfeld", "linear_predictor", "baseline", "roc",
        "predicted_probability", "units", "curves", "table", "residual_check", "residual_diagnostics"}


def trim(v, top=True):
    if isinstance(v, dict):
        return {k: trim(x, False) for k, x in v.items() if k not in DROP or (top and k == "table")}
    if isinstance(v, list):
        return [trim(x, False) for x in v[:40]]
    return v


out = {}
for key, aid, opts, tbl, analysis, payload, eopts in CASES:
    res = analyze({"analysis": analysis, "data": payload, "options": eopts})
    if res.get("error"):
        raise SystemExit(f"{key}: {res['error']}")
    out[key] = {"analysisId": aid, "options": opts, "table": tbl, "result": trim(_json_safe(res))}
print(json.dumps(out, separators=(",", ":")))
