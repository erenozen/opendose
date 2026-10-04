"""Native engine results for the report unit tests (sentences, checklists,
snippets). Regenerate after an engine change with

    python3 web/src/report/__tests__/fixtures.py > web/src/report/__tests__/fixtures.json

from the repository root. The inputs are the app's example tables (column,
grouped, contingency, survival, nested, XY), so the expected sentences in
sentences.test.ts are the ones the app shows for them. Long arrays (curves,
bootstrap densities) are cut to keep the file small.
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

CASES = {
    "ttest_unpaired": ("ttest", COLUMN, {"kind": "unpaired", "welch": False, "dataset_a": 0, "dataset_b": 1}),
    "ttest_welch": ("ttest", COLUMN, {"kind": "unpaired", "welch": True, "dataset_a": 0, "dataset_b": 1}),
    "ttest_paired": ("ttest", COLUMN, {"kind": "paired", "dataset_a": 0, "dataset_b": 1}),
    "ttest_ratio_paired": ("ttest", COLUMN, {"kind": "ratio_paired", "dataset_a": 0, "dataset_b": 1}),
    "mann_whitney": ("ttest", COLUMN, {"kind": "mann_whitney", "dataset_a": 0, "dataset_b": 1}),
    "wilcoxon": ("ttest", COLUMN, {"kind": "wilcoxon", "dataset_a": 0, "dataset_b": 1}),
    "ks": ("ttest", COLUMN, {"kind": "kolmogorov_smirnov", "dataset_a": 0, "dataset_b": 1}),
    "anova_tukey": ("anova", COLUMN, {"kind": "parametric", "comparisons": "tukey", "control_index": 0}),
    "anova_dunnett": ("anova", COLUMN, {"kind": "parametric", "comparisons": "dunnett", "control_index": 0}),
    "anova_lsd": ("anova", COLUMN, {"kind": "parametric", "comparisons": "fisher_lsd", "control_index": 0}),
    "kruskal": ("anova", COLUMN, {"kind": "nonparametric", "comparisons": "dunn", "control_index": 0}),
    "welch_anova": ("anova_unequal_var", COLUMN, {"comparisons": "games_howell", "family": "all"}),
    "rm_anova": ("rm_anova", COLUMN, {"kind": "parametric"}),
    "friedman": ("rm_anova", COLUMN, {"kind": "nonparametric"}),
    "correlation": ("correlation", COLUMN, {"method": "pearson", "dataset_a": 0, "dataset_b": 1}),
    "spearman": ("correlation", COLUMN, {"method": "spearman", "dataset_a": 0, "dataset_b": 1}),
    "column_statistics": ("column_statistics", COLUMN, {"hypothetical": 20}),
    "two_way": ("two_way_anova", GROUPED, {"row_factor": "Day", "col_factor": "Treatment",
                                           "row_names": GROUPED["row_titles"], "comparisons": "sidak",
                                           "direction": "columns_within_rows"}),
    "rm_two_way": ("rm_two_way", GROUPED, {"design": "mixed", "row_names": GROUPED["row_titles"]}),
    "multi_t": ("multiple_row_tests", GROUPED, {"dataset_a": 0, "dataset_b": 1, "test": "welch",
                                                "method": "holm_sidak", "alpha": 0.05}),
    "contingency_2x2": ("contingency", {"table": [[10, 20], [25, 5]]}, {}),
    "contingency_2x3": ("contingency", {"table": [[10, 20, 5], [25, 5, 9]]}, {}),
    "survival": ("survival", SURVIVAL, {}),
    "nested_t": ("nested_ttest", {"groups": NESTED["groups"][:2]}, {}),
    "nested_anova": ("nested_anova", NESTED, {"comparisons": "tukey"}),
    "dose_response": ("dose_response", {"x": XY_X, "datasets": [{"name": "Drug A", "ys": XY_ROWS}]},
                      {"model": "log_inhibitor_vs_response_4pl", "x_is_log": True}),
    "mcnemar": ("mcnemar", {"table": [[10, 20], [5, 25]]}, {}),
    "kappa": ("kappa", {"table": [[10, 2], [3, 25]]}, {}),
    "proportions": ("proportion_test", {"groups": [{"successes": 10, "trials": 30},
                                                   {"successes": 20, "trials": 30}]}, {}),
    "deming": ("deming", {"x": [1, 2, 3, 4, 5, 6, 7, 8], "datasets": [
        {"name": "Method B", "ys": [[2.1], [3.9], [6.2], [7.8], [10.3], [11.9], [14.2], [15.8]]}]}, {}),
    "estimation_two": ("estimation", {"datasets": COLUMN["datasets"][:2]}, {}),
    "estimation_shared": ("estimation", COLUMN, {}),
}


def trim(v, depth=0):
    if isinstance(v, dict):
        return {k: trim(x, depth + 1) for k, x in v.items()
                if k not in ("traceback", "kde", "percentiles", "curve", "residuals")}
    if isinstance(v, list):
        return [trim(x, depth + 1) for x in v[:40]]
    return v


out = {}
for name, (analysis, data, options) in CASES.items():
    res = analyze({"analysis": analysis, "data": data, "options": options})
    out[name] = {"options": options, "result": trim(_json_safe(res))}
print(json.dumps(out, indent=1))
