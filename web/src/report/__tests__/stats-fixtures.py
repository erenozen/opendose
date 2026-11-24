"""Native engine results for the statistics table (statsTable.test.ts,
P-66) and the "What this means" readers added in Wave 2 (meaning.test.ts,
P-69): Poisson, quasi-Poisson, negative binomial and binomial regression,
three-way ANOVA, the nested two-way and grouping-column mixed models, the
time-course mixed model and quantal fits, beside the classic tests of
fixtures.py re-run on the current engine (with their family blocks).
Regenerate after an engine change with

    PYTHONPATH=engine python3 web/src/report/__tests__/stats-fixtures.py \
        > web/src/report/__tests__/stats-fixtures.json

from the repository root (numpy and scipy needed). Long arrays (curves,
residuals, predictions) are left out to keep the file small.
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
COLUMN = {"x": [None] * 6, "datasets": [
    {"name": n, "ys": [[v] for v in vs]}
    for n, vs in [("Control", C), ("Treated A", A), ("Treated B", B)]]}
GROUPED = {"row_titles": ["Day 7", "Day 14", "Day 21"], "datasets": [
    {"name": "Vehicle", "ys": [[152, 168, 141], [298, 341, 312], [512, 587, 549]]},
    {"name": "Drug", "ys": [[148, 139, 160], [221, 205, 239], [302, 276, 331]]}]}
# three-way: factor B (data sets A&B vs C&D), factor C (A&C vs B&D)
THREE = {"row_titles": ["Male", "Female"], "datasets": [
    {"name": "Low, 1 h", "ys": [[10.1, 11.4, 9.8], [12.0, 12.9, 11.7]]},
    {"name": "Low, 4 h", "ys": [[13.2, 14.1, 12.6], [15.8, 16.2, 14.9]]},
    {"name": "High, 1 h", "ys": [[11.0, 12.3, 10.4], [17.5, 18.1, 16.6]]},
    {"name": "High, 4 h", "ys": [[19.4, 20.8, 18.9], [24.2, 25.0, 23.1]]}]}
SURVIVAL = {"x": [None] * 10, "datasets": [
    {"name": "Control", "ys": [[6, 1], [13, 1], [21, 1], [30, 1], [31, 0], [37, 1],
                               [38, 1], [47, 0], [49, 1], [50, 1]]},
    {"name": "Treated", "ys": [[10, 1], [21, 1], [33, 1], [40, 0], [45, 1], [46, 1],
                               [50, 1], [52, 0], [53, 1], [55, 0]]}]}
HERDS = {"Control": [[42.1, 44.3, 40.8, 43.5], [46.2, 47.9, 45.1, 48.4], [41.0, 39.6, 42.7, 40.2]],
         "Diet A": [[49.8, 52.1, 50.4, 51.7], [47.3, 45.9, 48.8, 46.5], [53.0, 54.6, 51.9, 52.8]],
         "Diet B": [[55.2, 57.8, 56.1, 54.9], [52.4, 50.8, 53.9, 51.6], [58.7, 60.2, 57.5, 59.1]]}
NESTED = {"groups": [{"name": k, "subgroups": v, "subgroup_names": ["Herd 1", "Herd 2", "Herd 3"]}
                     for k, v in HERDS.items()]}
XY_X = [-9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5]
XY_ROWS = [[98.2, 101.5, 99.1], [97.0, 95.8, 99.9], [93.4, 90.1, 92.7], [78.9, 82.3, 80.0],
           [51.2, 48.7, 50.9], [22.1, 25.6, 24.0], [8.9, 10.2, 7.5], [3.1, 4.4, 2.2],
           [1.0, 0.5, 2.1]]

# Colony counts on plates of two areas (cm²), two treatments, four plates
# each: Poisson / quasi-Poisson / negative binomial regression.
COLONIES = [12, 15, 9, 14, 11, 13, 10, 16, 25, 31, 22, 28, 35, 41, 30, 38]
TREATMENT = ["Control"] * 8 + ["Mutagen"] * 8
AREA = [1, 1, 1, 1, 2, 2, 2, 2] * 2
COUNTS_MV = [{"name": "Colonies", "values": COLONIES}, {"name": "Treatment", "values": TREATMENT},
             {"name": "Area", "values": AREA}]
# Positives out of counted cells: binomial regression
POS = [8, 11, 9, 12, 18, 21, 17, 23]
TOT = [40, 42, 38, 41, 40, 43, 39, 42]
DOSE = ["Low"] * 4 + ["High"] * 4
BINOM_MV = [{"name": "Positive", "values": POS}, {"name": "Counted", "values": TOT},
            {"name": "Dose", "values": DOSE}]

TIME = [5, 8, 12, 14, 20, 22, 25, 30, 33, 40, 6, 9, 15, 18, 26, 31, 35, 42, 48, 50]
EVENT = [1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0]
GROUP = ["Control"] * 10 + ["Treated"] * 10
AGE = [60, 62, 58, 70, 66, 59, 61, 64, 67, 72, 61, 63, 57, 69, 65, 60, 62, 66, 68, 71]
DOSE10 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] * 2
SEX = ["F", "M"] * 10
RESP = [0, 0, 0, 1, 0, 1, 1, 1, 1, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 1]
WEIGHT = [21.0, 22.4, 23.1, 24.9, 25.2, 26.8, 27.5, 29.1, 29.8, 31.6,
          20.5, 22.9, 22.8, 25.3, 24.7, 27.2, 27.9, 28.6, 30.4, 31.1]
MV = [{"name": "Dose", "values": DOSE10}, {"name": "Sex", "values": SEX},
      {"name": "Response", "values": RESP}, {"name": "Weight", "values": WEIGHT}]

# Nested two-way: diet (rows) x sex (data sets), three mice per cell, three
# measurements per mouse (the grouped-table layout: one subcolumn per mouse).
NESTED2 = {"row_titles": ["Chow", "High fat"], "datasets": [
    {"name": "Female", "ys": [[[20.1, 20.9, 19.8], [22.4, 23.0, 22.1], [21.0, 21.6, 20.4]],
                              [[25.2, 26.1, 24.8], [27.9, 28.4, 27.0], [26.3, 25.7, 26.9]]]},
    {"name": "Male", "ys": [[[24.0, 24.8, 23.5], [26.1, 25.4, 26.6], [23.9, 24.6, 24.2]],
                            [[31.2, 32.0, 30.6], [33.5, 34.1, 32.8], [30.9, 31.7, 31.3]]]}]}

# Cells per field, three fields per culture dish, four dishes per treatment
DISH_Y = [41, 44, 39, 52, 55, 50, 47, 45, 49, 38, 40, 36,
          58, 61, 57, 66, 69, 64, 60, 63, 59, 55, 52, 56]
DISH = [f"D{i // 3 + 1}" for i in range(24)]
DISH_TRT = ["Vehicle"] * 12 + ["Drug"] * 12
GROUPING_MV = [{"name": "Cells", "values": DISH_Y}, {"name": "Treatment", "values": DISH_TRT},
               {"name": "Dish", "values": DISH}]

# Tumour volume of four mice per group on four days
TC_RECORDS = []
for g, base, slope in (("Vehicle", 100, 60), ("Drug", 100, 25)):
    for m in range(4):
        for k, t in enumerate((0, 7, 14, 21)):
            jitter = [3.1, -2.4, 4.0, -1.7][(m + k) % 4] + m * 2.5
            TC_RECORDS.append({"subject": f"{g[0]}{m + 1}", "group": g, "time": t,
                               "value": base + slope * k + jitter * (1 + k)})

CASES = {
    "ttest_unpaired": ("ttest", COLUMN, {"kind": "unpaired", "welch": False, "dataset_a": 0, "dataset_b": 1}),
    "ttest_welch": ("ttest", COLUMN, {"kind": "unpaired", "welch": True, "dataset_a": 0, "dataset_b": 1}),
    "ttest_paired": ("ttest", COLUMN, {"kind": "paired", "dataset_a": 0, "dataset_b": 1}),
    "mann_whitney": ("ttest", COLUMN, {"kind": "mann_whitney", "dataset_a": 0, "dataset_b": 1}),
    "wilcoxon": ("ttest", COLUMN, {"kind": "wilcoxon", "dataset_a": 0, "dataset_b": 1}),
    "anova_tukey": ("anova", COLUMN, {"kind": "parametric", "comparisons": "tukey", "control_index": 0}),
    "kruskal": ("anova", COLUMN, {"kind": "nonparametric", "comparisons": "dunn", "control_index": 0}),
    "welch_anova": ("anova_unequal_var", COLUMN, {"comparisons": "games_howell", "family": "all"}),
    "rm_anova": ("rm_anova", COLUMN, {"kind": "parametric", "comparisons": "tukey"}),
    "friedman": ("rm_anova", COLUMN, {"kind": "nonparametric"}),
    "correlation": ("correlation", COLUMN, {"method": "pearson", "dataset_a": 0, "dataset_b": 1}),
    "column_statistics": ("column_statistics", COLUMN, {"hypothetical": 20}),
    "two_way": ("two_way_anova", GROUPED, {"row_factor": "Day", "col_factor": "Treatment",
                                           "row_names": GROUPED["row_titles"], "comparisons": "sidak",
                                           "direction": "columns_within_rows"}),
    "three_way": ("three_way_anova", THREE, {"factor_names": ["Sex", "Dose", "Time"],
                                             "b_level_names": ["Low", "High"],
                                             "c_level_names": ["1 h", "4 h"]}),
    "multi_t": ("multiple_row_tests", GROUPED, {"dataset_a": 0, "dataset_b": 1, "test": "welch",
                                                "method": "holm_sidak", "alpha": 0.05}),
    "contingency_2x2": ("contingency", {"table": [[10, 20], [25, 5]]}, {}),
    "survival": ("survival", SURVIVAL, {}),
    "cox": ("cox", {"time": TIME, "event": EVENT, "covariates": {"Group": GROUP, "Age": AGE}},
            {"categorical": ["Group"]}),
    "nested_t": ("nested_ttest", {"groups": NESTED["groups"][:2]}, {}),
    "nested_anova": ("nested_anova", NESTED, {"comparisons": "tukey"}),
    "dose_response": ("dose_response", {"x": XY_X, "datasets": [{"name": "Drug A", "ys": XY_ROWS}]},
                      {"model": "log_inhibitor_vs_response_4pl", "x_is_log": True}),
    "linear_regression": ("linear_regression", {
        "x": [1, 2, 3, 4, 5, 6],
        "datasets": [{"name": "Rate", "ys": [[2.1], [3.9], [6.2], [7.8], [10.1], [12.2]]}]}, {}),
    "multiple_regression": ("multiple_regression", {"variables": MV},
                            {"outcome": "Weight", "predictors": ["Dose", "Sex"]}),
    "logistic": ("logistic_regression", {"variables": MV},
                 {"outcome": "Response", "predictors": ["Dose", "Sex"]}),
    "poisson": ("poisson_regression", {"variables": COUNTS_MV},
                {"outcome": "Colonies", "predictors": ["Treatment"], "exposure": "Area"}),
    "poisson_quasi": ("poisson_regression", {"variables": COUNTS_MV},
                      {"outcome": "Colonies", "predictors": ["Treatment"], "exposure": "Area",
                       "quasi": True}),
    "negbin": ("negative_binomial_regression", {"variables": COUNTS_MV},
               {"outcome": "Colonies", "predictors": ["Treatment"], "exposure": "Area"}),
    "binomial": ("binomial_regression", {"variables": BINOM_MV},
                 {"outcome": "Positive", "totals": "Counted", "predictors": ["Dose"],
                  "reference_levels": {"Dose": "Low"}}),
    "mixed_nested": ("mixed_nested_two_way", NESTED2,
                     {"factor_a_name": "Diet", "factor_b_name": "Sex", "unit_name": "mice",
                      "comparisons": "sidak", "comparison_scope": "b_within_a"}),
    "mixed_grouping": ("mixed_grouping", {"variables": GROUPING_MV},
                       {"outcome": "Cells", "factors": ["Treatment"], "grouping": "Dish",
                        "unit_name": "dishes", "levels": {"Treatment": ["Vehicle", "Drug"]}}),
    "mixed_timecourse": ("mixed_timecourse", {"records": TC_RECORDS},
                         {"covariance": "cs", "comparisons": "sidak"}),
    "subject_auc": ("auc", {"subject": [x["subject"] for x in TC_RECORDS], "group": [x["group"] for x in TC_RECORDS],
                            "time": [x["time"] for x in TC_RECORDS], "value": [x["value"] for x in TC_RECORDS]},
                    {"baseline": "zero"}),
    "lmm": ("lmm", {"variables": GROUPING_MV},
            {"outcome": "Cells", "factors": ["Treatment"], "group": "Dish", "ddf": "kenward_roger",
             "levels": {"Treatment": ["Vehicle", "Drug"]}}),
    "quantal": ("quantal", {"groups": [
        {"name": "Compound X", "dose": [1, 2, 4, 8, 16], "n": [20] * 5, "responders": [1, 4, 9, 15, 19]}]},
        {"link": "probit", "dose_transform": "log10"}),
    "ks_test": ("ks_test", COLUMN, {"dataset_a": 0, "dataset_b": 1}),
    "mixed_rm_one_way": ("mixed_rm_oneway", {"x": [None] * 6, "datasets": [
        {"name": n, "ys": [[v] for v in vs]}
        for n, vs in [("Control", C), ("Treated A", A[:5] + [None]), ("Treated B", B)]]},
        {"method": "mixed", "comparisons": "tukey"}),
    "rm_two_way_mixed": ("rm_two_way", GROUPED, {"design": "mixed", "row_names": GROUPED["row_titles"]}),
    "rm_two_way_both": ("rm_two_way", GROUPED, {"design": "both", "row_names": GROUPED["row_titles"]}),
    "mixed_rm_twoway": ("mixed_rm_twoway", {"row_titles": GROUPED["row_titles"], "datasets": [
        {"name": "Vehicle", "ys": [[152, 168, 141], [298, None, 312], [512, 587, 549]]},
        GROUPED["datasets"][1]]}, {"design": "mixed", "row_names": GROUPED["row_titles"], "method": "mixed"}),
    "contingency_2x3": ("contingency", {"table": [[10, 20, 5], [25, 5, 9]]}, {}),
    "icc": ("icc", {"x": [None] * 6, "datasets": [
        {"name": "Rater 1", "ys": [[9], [6], [8], [7], [10], [6]]},
        {"name": "Rater 2", "ys": [[2], [1], [4], [1], [5], [2]]},
        {"name": "Rater 3", "ys": [[5], [3], [6], [2], [6], [4]]},
        {"name": "Rater 4", "ys": [[8], [2], [8], [6], [9], [7]]}]}, {}),
    "rate_compare": ("rate_compare", {"groups": [{"name": "Placebo", "events": 30, "exposure": 1000},
                                                  {"name": "Vaccine", "events": 12, "exposure": 1100}]}, {}),
    "roc": ("roc", {"x": [None] * 8, "datasets": [
        {"name": "Patients", "ys": [[v] for v in [8.1, 9.4, 7.7, 10.2, 8.8, 9.9, 6.5, 9.1]]},
        {"name": "Controls", "ys": [[v] for v in [6.2, 7.0, 5.8, 8.3, 6.9, 7.4, 6.1, 5.5]]}]}, {}),
    "bland_altman": ("bland_altman", {"x": [None] * 8, "datasets": [
        {"name": "Method A", "ys": [[v] for v in [9, 6, 8, 7, 10, 6, 5, 8]]},
        {"name": "Method B", "ys": [[v] for v in [8, 6, 9, 6, 10, 7, 5, 7]]}]}, {}),
    "mcnemar": ("mcnemar", {"table": [[10, 20], [5, 25]]}, {}),
    "kappa": ("kappa", {"table": [[10, 2], [3, 25]]}, {}),
    "proportions": ("proportion_test", {"groups": [{"successes": 10, "trials": 30},
                                                   {"successes": 20, "trials": 30}]}, {}),
    "estimation_two": ("estimation", {"datasets": COLUMN["datasets"][:2]}, {}),
    "deming": ("deming", {"x": [1, 2, 3, 4, 5, 6, 7, 8], "datasets": [
        {"name": "Method B", "ys": [[2.1], [3.9], [6.2], [7.8], [10.3], [11.9], [14.2], [15.8]]}]}, {}),
}

DROP = {"traceback", "kde", "percentiles", "curve", "residuals", "points", "predicted",
        "observed", "fitted", "residual_plot", "bands", "schoenfeld", "linear_predictor",
        "baseline", "roc", "predicted_probability", "units", "implied_covariance"}


def trim(v):
    if isinstance(v, dict):
        return {k: trim(x) for k, x in v.items() if k not in DROP}
    if isinstance(v, list):
        return [trim(x) for x in v[:40]]
    return v


out = {}
for name, (analysis, data, options) in CASES.items():
    res = analyze({"analysis": analysis, "data": data, "options": options})
    if res.get("error"):
        raise SystemExit(f"{name}: {res['error']}")
    out[name] = {"options": options, "result": trim(_json_safe(res))}
print(json.dumps(out, indent=None, separators=(",", ":")))
