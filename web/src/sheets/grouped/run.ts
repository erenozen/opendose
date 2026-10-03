// Engine calls for the grouped-table analyses. Each builds the grouped
// payload ({row_titles, datasets: [{name, ys}]}, null = missing) from the
// table and returns the engine's result object (errors as {error}).
import type { EngineBridge } from "../../lib/engine.ts";
import { parseCell } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";
import type {
  ColumnStatsOptions, MultiTOptions, RowMeansOptions, ThreeWayOptions,
  TwoWayOptions,
} from "./options.ts";
import { FDR_METHODS } from "./options.ts";
import { groupedPayload, hasMissingRM } from "./stats.ts";

type Result = Record<string, unknown>;

const RAW_ONLY = "needs replicate values; this table holds mean / error / N "
  + "summaries. Choose replicates when creating the table to run it.";

/** Engine summary-format ids for our subcolumn formats. */
const SUMMARY_FORMAT: Record<string, string> = {
  mean_sd_n: "mean_sd_n", mean_sem_n: "mean_sem_n", mean_cv_n: "mean_cv_n",
  mean_ci_n: "mean_ci_n", mean_sd: "mean_sd", mean_sem: "mean_sem",
  upper_lower: "mean_limits",
};

function analyze(engine: EngineBridge, payload: Result): Result {
  const r = engine.analyze(payload) as Result;
  return r && typeof r === "object" ? r : { error: "no result" };
}

const numOr = (s: string, d: number) => {
  const v = parseCell(s);
  return v === null ? d : v;
};

// ------------------------------------------------------------ two-way

export function runTwoWay(engine: EngineBridge, table: DataTableModel,
  o: TwoWayOptions): Result {
  const data = groupedPayload(table);
  if (data.datasets.length < 2) {
    return { error: "Two-way ANOVA needs at least two datasets (columns)" };
  }
  const rowNames = data.row_titles;
  const factors = {
    row_factor: o.rowFactor.trim() || "Row factor",
    col_factor: o.colFactor.trim() || "Column factor",
  };
  const comparisons = o.comparisons === "none" ? null : o.comparisons;

  if (table.subcolumnFormat !== "replicates") {
    if (o.design !== "none") return { error: `Repeated measures ${RAW_ONLY}` };
    return analyze(engine, {
      analysis: "two_way_anova_summary",
      data: {
        format: SUMMARY_FORMAT[table.subcolumnFormat],
        datasets: data.datasets.map((d) => ({ name: d.name, rows: d.ys })),
      },
      options: { ...factors, comparisons, direction: o.direction, row_names: rowNames },
    });
  }
  if (o.design === "none") {
    return analyze(engine, {
      analysis: "two_way_anova", data,
      options: { ...factors, comparisons, direction: o.direction, row_names: rowNames },
    });
  }

  const both = o.design === "rm_both";
  const design = both ? "both" : "mixed";
  const missing = hasMissingRM(data.datasets.map((d) => d.ys), both);
  const useMixed = missing || o.rmFit === "mixed";
  if (useMixed) {
    const r = analyze(engine, {
      analysis: "mixed_rm_twoway", data,
      options: {
        design, row_names: rowNames, method: "mixed", comparisons,
        direction: o.direction,
      },
    });
    return { ...r, factor_names: [factors.row_factor, factors.col_factor], missing };
  }
  const r = analyze(engine, {
    analysis: "rm_two_way", data, options: { design, row_names: rowNames },
  });
  if (r.error || !comparisons) {
    return { ...r, factor_names: [factors.row_factor, factors.col_factor] };
  }
  // Complete data: the comparisons come from the mixed-effects fit,
  // which reproduces RM ANOVA when no value is missing.
  const m = analyze(engine, {
    analysis: "mixed_rm_twoway", data,
    options: {
      design, row_names: rowNames, method: "mixed", comparisons,
      direction: o.direction,
    },
  });
  return {
    ...r,
    factor_names: [factors.row_factor, factors.col_factor],
    multiple_comparisons: m.multiple_comparisons ?? null,
    comparisons_error: m.error ?? null,
  };
}

// ------------------------------------------------------------ three-way

export function threeWayPayload(table: DataTableModel, o: ThreeWayOptions): {
  data: ReturnType<typeof groupedPayload>;
  levels: ([number, number] | null)[];
} {
  const data = groupedPayload(table);
  const levels = data.datasets.map((_, i) => o.assign[i] ?? null);
  return { data, levels };
}

export function runThreeWay(engine: EngineBridge, table: DataTableModel,
  o: ThreeWayOptions): Result {
  if (table.subcolumnFormat !== "replicates") return { error: `Three-way ANOVA ${RAW_ONLY}` };
  const { data, levels } = threeWayPayload(table, o);
  const used = levels.filter(Boolean) as [number, number][];
  const combos = new Set(used.map(([b, c]) => `${b}:${c}`));
  if (combos.size < 4) {
    return {
      error: "Three-way ANOVA needs four datasets, one for each combination "
        + "of factor B and factor C levels (see Layout)",
    };
  }
  if (combos.size !== used.length) {
    return { error: "Two datasets are assigned to the same factor B and C levels" };
  }
  const options: Result = {
    factor_names: o.factorNames.map((n, i) =>
      n.trim() || ["Row factor", "Factor B", "Factor C"][i]),
    b_level_names: o.bLevels.map((n, i) => n.trim() || `B${i + 1}`),
    c_level_names: o.cLevels.map((n, i) => n.trim() || `C${i + 1}`),
    column_levels: levels,
  };
  if (o.method !== "none_cmp") {
    options.comparisons = o.method === "fisher" ? "none" : o.method;
    options.goal = o.goal;
    options.alpha = numOr(o.alpha, 0.05);
    options.q_percent = numOr(o.q, 5);
    options.control = o.control;
    options.control_row = o.controlRow;
    if (o.goal === "one_factor" && o.oneFactor !== "any") options.factor = o.oneFactor;
  }
  return analyze(engine, { analysis: "three_way_anova", data, options });
}

// ------------------------------------------------------------ multiple t

export function runMultiT(engine: EngineBridge, table: DataTableModel,
  o: MultiTOptions): Result {
  if (table.subcolumnFormat !== "replicates") return { error: `Multiple t tests ${RAW_ONLY}` };
  const data = groupedPayload(table);
  const n = data.datasets.length;
  if (n < 2) return { error: "Multiple t tests need two datasets to compare" };
  const a = Math.min(o.datasetA, n - 1);
  const b = Math.min(o.datasetB, n - 1);
  if (a === b) return { error: "Choose two different datasets to compare" };
  const fdr = FDR_METHODS.includes(o.method);
  return analyze(engine, {
    analysis: "multiple_row_tests", data,
    options: {
      dataset_a: a, dataset_b: b, test: o.test, method: o.method,
      swap: o.swap,
      ...(fdr ? { q_percent: numOr(o.q, 5) } : { alpha: numOr(o.alpha, 0.05) }),
    },
  });
}

// ------------------------------------------------------------ row means

export function runRowMeans(engine: EngineBridge, table: DataTableModel,
  o: RowMeansOptions): Result {
  if (table.subcolumnFormat !== "replicates") return { error: `Row means ${RAW_ONLY}` };
  return analyze(engine, {
    analysis: "row_means", data: groupedPayload(table),
    options: {
      calculate: o.calculate, error: o.error, scope: o.scope,
      percentile: numOr(o.percentile, 10),
    },
  });
}

// ------------------------------------------------------------ column stats

export function runColumnStats(engine: EngineBridge, table: DataTableModel,
  o: ColumnStatsOptions): Result {
  if (table.subcolumnFormat !== "replicates") return { error: `Column statistics ${RAW_ONLY}` };
  const data = groupedPayload(table);
  let datasets: { name: string; ys: (number | null)[][] }[];
  if (o.unit === "dataset") {
    datasets = data.datasets;
  } else {
    datasets = [];
    data.row_titles.forEach((rt, r) => data.datasets.forEach((d) => {
      const vals = (d.ys[r] ?? []).filter((v) => v !== null);
      if (vals.length) datasets.push({ name: `${rt}: ${d.name}`, ys: vals.map((v) => [v]) });
    }));
    if (!datasets.length) return { error: "The table has no values yet" };
  }
  return analyze(engine, {
    analysis: "column_statistics",
    data: { x: [], datasets },
    options: { hypothetical: parseCell(o.hypothetical) },
  });
}
