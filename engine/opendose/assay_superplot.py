"""SuperPlots: cell-level data shown with the statistics run on the
biological replicates.

Lord, Velle, Mullins & Fritz-Laylin (2020), "SuperPlots: Communicating
reproducibility and variability in cell biology", J Cell Biol
219:e202001064: every cell is drawn, coloured by its biological replicate
(experiment, animal, culture day), the replicate means are overlaid, and
the test uses one value per replicate ("P values were calculated using
an n of three, not 300"); "Counting each cell as a separate n can easily
result in false-positive rates of >50%". When the replicates are linked
across conditions (both conditions measured in the same experiment),
the paired test on the replicate means is the appropriate one (Lord
2020, Fig. 1 and "paired t test" discussion).

Workflow implemented here (cell -> biological replicate aggregation,
one value per biological unit):
1. long records {group, replicate, value, pair?} -> one summary per
   (group, replicate): mean (default) or median of its cells, with the
   cell count and SD;
2. the replicate-level column table (one data set per group; rows are
   the pair keys when linked, so a paired test sees matched rows);
3. the chosen test on the replicate summaries through the existing
   modules: unpaired / Welch / paired / ratio paired t, Mann-Whitney,
   Wilcoxon (ttests), ordinary one-way ANOVA with post tests (anova),
   Kruskal-Wallis, repeated-measures one-way ANOVA (repeated) with post
   tests from the matched mixed model (mixedmodel) and Friedman;
4. graph data: every cell with its replicate index for colouring, the
   replicate means, and n per group as replicates with the cell count.

Pairing: an explicit pair key on the records links replicates across
groups; otherwise paired=True links replicates that share a label.
Running the test on cells (stats_on="cells") is available because users
ask for it, but returns the Lord 2020 warning.
"""

from __future__ import annotations

import math

import numpy as np

from . import anova, mixedmodel, repeated, ttests

AGGREGATES = ("mean", "median")
TESTS = ("auto", "unpaired", "welch", "paired", "ratio_paired",
         "mann_whitney", "wilcoxon", "anova", "kruskal_wallis",
         "rm_anova", "friedman", "none")

CELL_WARNING = (
    "Statistics were run on individual cells. Cells from one experiment "
    "are not independent, so n is overstated and P values are too small "
    "(Lord et al. 2020: counting each cell as n can give false-positive "
    "rates above 50%). Use the replicate means.")


def _num(v):
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def _ordered(seq):
    seen, out = set(), []
    for s in seq:
        if s not in seen:
            seen.add(s)
            out.append(s)
    return out


def aggregate_replicates(records, *, aggregate: str = "mean",
                         groups=None) -> dict:
    """Per-(group, replicate) summaries of long cell-level records."""
    if aggregate not in AGGREGATES:
        raise ValueError(f"unknown aggregate: {aggregate}")
    cells = []
    for r in records:
        v = _num(r.get("value"))
        if v is None or r.get("group") is None or r.get("replicate") is None:
            continue
        cells.append({"group": str(r["group"]),
                      "replicate": str(r["replicate"]), "value": v,
                      "pair": (None if r.get("pair") is None
                               else str(r["pair"]))})
    if not cells:
        raise ValueError("no cell values (each record needs group, "
                         "replicate and value)")
    group_order = ([str(g) for g in groups] if groups
                   else _ordered(c["group"] for c in cells))
    reps = {}
    for c in cells:
        if c["group"] not in group_order:
            continue
        key = (c["group"], c["replicate"])
        entry = reps.setdefault(key, {"group": c["group"],
                                      "replicate": c["replicate"],
                                      "values": [], "pairs": []})
        entry["values"].append(c["value"])
        if c["pair"] is not None:
            entry["pairs"].append(c["pair"])
    summaries = []
    for (g, rep), e in reps.items():
        arr = np.array(e["values"])
        pairs = _ordered(e["pairs"])
        summaries.append({
            "group": g, "replicate": rep,
            "value": float(np.mean(arr) if aggregate == "mean"
                           else np.median(arr)),
            "mean": float(arr.mean()), "median": float(np.median(arr)),
            "sd": float(arr.std(ddof=1)) if arr.size > 1 else None,
            "n_cells": int(arr.size),
            "pair": pairs[0] if pairs else None,
            "pair_conflict": len(pairs) > 1,
        })
    summaries.sort(key=lambda s: group_order.index(s["group"]))
    return {"cells": [c for c in cells if c["group"] in group_order],
            "replicates": summaries, "groups": group_order}


def replicate_table(summaries, groups, *, paired: bool) -> dict:
    """Column table of replicate summaries: rows are pair keys when
    paired (matched across groups), else each group's replicates in
    order."""
    if paired:
        keys = _ordered(s["pair"] for s in summaries)
        cols = []
        for g in groups:
            by = {}
            for s in summaries:
                if s["group"] == g:
                    by.setdefault(s["pair"], []).append(s["value"])
            cols.append([float(np.mean(by[k])) if k in by else None
                         for k in keys])
        return {"row_titles": [str(k) for k in keys], "columns": cols}
    cols, titles = [], []
    for g in groups:
        vals = [s for s in summaries if s["group"] == g]
        cols.append([s["value"] for s in vals])
        titles.append([s["replicate"] for s in vals])
    n_rows = max((len(c) for c in cols), default=0)
    cols = [c + [None] * (n_rows - len(c)) for c in cols]
    return {"row_titles": None, "replicate_labels": titles, "columns": cols}


def _clean(col):
    return [v for v in col if v is not None]


def _test(columns, names, test, *, paired, welch, comparisons,
          control_index, ci_level):
    k = len(columns)
    if test == "none" or k < 2:
        return None
    if test == "auto":
        if k == 2:
            test = "paired" if paired else ("welch" if welch else "unpaired")
        else:
            test = "rm_anova" if paired else "anova"
    if k == 2:
        a, b = columns
        if test in ("unpaired", "welch"):
            res = ttests.unpaired_t(_clean(a), _clean(b),
                                    welch=(test == "welch" or welch),
                                    ci_level=ci_level)
        elif test == "paired":
            res = ttests.paired_t(a, b, ci_level=ci_level)
        elif test == "ratio_paired":
            res = ttests.ratio_paired_t(a, b, ci_level=ci_level)
        elif test == "mann_whitney":
            res = ttests.mann_whitney(_clean(a), _clean(b),
                                      ci_level=ci_level)
        elif test == "wilcoxon":
            res = (ttests.wilcoxon_matched_pairs(a, b, ci_level=ci_level)
                   if paired else
                   ttests.mann_whitney(_clean(a), _clean(b),
                                       ci_level=ci_level))
        else:
            raise ValueError(f"test {test!r} needs 3 or more groups; use a "
                             "t test or its nonparametric version")
        res["names"] = list(names)
        return res
    if test in ("anova", "unpaired", "welch"):
        res = anova.one_way_anova(columns, names)
        method = comparisons or ("dunnett" if control_index is not None
                                 else "tukey")
        res["multiple_comparisons"] = anova.multiple_comparisons(
            columns, method, names=names,
            control_index=control_index or 0, ci_level=ci_level)
        res["test"] = "one_way_anova"
        return res
    if test in ("kruskal_wallis", "mann_whitney"):
        res = anova.kruskal_wallis(columns, names)
        res["test"] = "kruskal_wallis"
        return res
    if test in ("rm_anova", "paired"):
        res = repeated.rm_one_way_anova(columns, names)
        method = comparisons or ("dunnett" if control_index is not None
                                 else "tukey")
        mm = mixedmodel.mixed_rm_one_way(
            columns, names, comparisons=method,
            control_index=control_index or 0, ci_level=ci_level)
        res["multiple_comparisons"] = mm["multiple_comparisons"]
        res["test"] = "rm_one_way_anova"
        return res
    if test in ("friedman", "wilcoxon"):
        res = repeated.friedman(columns, names)
        res["test"] = "friedman"
        return res
    raise ValueError(f"unknown test: {test}")


def superplot(records, *, aggregate: str = "mean", test: str = "auto",
              stats_on: str = "replicates", paired: bool | None = None,
              groups=None, control=None, comparisons: str | None = None,
              welch: bool = False, ci_level: float = 0.95) -> dict:
    """SuperPlot aggregation, replicate-level test and graph data."""
    if test not in TESTS:
        raise ValueError(f"unknown test: {test}")
    if stats_on not in ("replicates", "cells"):
        raise ValueError("stats_on must be 'replicates' or 'cells'")
    agg = aggregate_replicates(records, aggregate=aggregate, groups=groups)
    summaries, group_order = agg["replicates"], agg["groups"]
    warnings = []
    has_pair_key = any(s["pair"] is not None for s in summaries)
    if paired is None:
        paired = has_pair_key
    if paired and not has_pair_key:
        for s in summaries:          # link replicates that share a label
            s["pair"] = s["replicate"]
    if any(s["pair_conflict"] for s in summaries):
        warnings.append("Some replicates carry more than one pair key; "
                        "the first one was used.")
    table = replicate_table(summaries, group_order, paired=bool(paired))
    if paired:
        dup = {}
        for s in summaries:
            dup[(s["group"], s["pair"])] = dup.get((s["group"], s["pair"]),
                                                   0) + 1
        if any(v > 1 for v in dup.values()):
            warnings.append("Several replicates of one group share a pair "
                            "key; their summaries were averaged.")
    control_index = (group_order.index(str(control))
                     if control is not None and str(control) in group_order
                     else None)

    if stats_on == "cells":
        warnings.append(CELL_WARNING)
        cols = [[c["value"] for c in agg["cells"] if c["group"] == g]
                for g in group_order]
        cell_test = test if test not in ("paired", "ratio_paired",
                                         "rm_anova", "friedman") else "auto"
        result = _test(cols, group_order, cell_test, paired=False,
                       welch=welch, comparisons=comparisons,
                       control_index=control_index, ci_level=ci_level)
    else:
        result = _test(table["columns"], group_order, test,
                       paired=bool(paired), welch=welch,
                       comparisons=comparisons,
                       control_index=control_index, ci_level=ci_level)

    n_reps = {g: sum(1 for s in summaries if s["group"] == g)
              for g in group_order}
    for g, n in n_reps.items():
        if n < 3:
            warnings.append(f"{g}: only {n} biological replicate"
                            f"{'s' if n != 1 else ''}; a test on replicate "
                            "means needs at least 2, and 3 or more are "
                            "recommended.")
    # colour key: pair key when linked (same experiment, same colour in
    # every group), else the replicate label
    colour_keys = _ordered((s["pair"] if paired else s["replicate"])
                           for s in summaries)
    colour_of = {}
    for s in summaries:
        colour_of[(s["group"], s["replicate"])] = colour_keys.index(
            s["pair"] if paired else s["replicate"])
    graph_cells = [{"group": c["group"], "replicate": c["replicate"],
                    "value": c["value"],
                    "colour_index": colour_of[(c["group"], c["replicate"])]}
                   for c in agg["cells"]]
    group_stats = []
    for g in group_order:
        vals = [s["value"] for s in summaries if s["group"] == g]
        arr = np.array(vals)
        group_stats.append({
            "group": g, "n_replicates": len(vals),
            "n_cells": sum(s["n_cells"] for s in summaries if s["group"] == g),
            "mean_of_replicates": float(arr.mean()) if arr.size else None,
            "sd_of_replicates": (float(arr.std(ddof=1)) if arr.size > 1
                                 else None),
            "sem_of_replicates": (float(arr.std(ddof=1) / math.sqrt(arr.size))
                                  if arr.size > 1 else None),
        })
    return {
        "analysis": "superplot",
        "aggregate": aggregate, "paired": bool(paired),
        "stats_on": stats_on,
        "groups": group_order,
        "replicates": [{k: s[k] for k in ("group", "replicate", "value",
                                          "mean", "median", "sd", "n_cells",
                                          "pair")}
                       | {"colour_index": colour_of[(s["group"],
                                                     s["replicate"])]}
                       for s in summaries],
        "replicate_table": {
            "row_titles": table.get("row_titles"),
            "datasets": [{"name": g, "ys": [[v] for v in col]}
                         for g, col in zip(group_order, table["columns"])]},
        "test": result,
        "group_summaries": group_stats,
        "graph": {"cells": graph_cells,
                  "replicate_means": [
                      {"group": s["group"], "replicate": s["replicate"],
                       "value": s["value"], "n_cells": s["n_cells"],
                       "colour_index": colour_of[(s["group"],
                                                  s["replicate"])]}
                      for s in summaries],
                  "colour_keys": colour_keys,
                  "n_label": {g["group"]: f"n = {g['n_replicates']} "
                              f"replicates ({g['n_cells']} cells)"
                              for g in group_stats}},
        "warnings": warnings,
    }
