// Nonlinear regression for XY tables: optional normalize step, then a
// per-dataset fit, a global fit with shared parameters, or the Gaddum /
// Schild EC50-shift model. Moved verbatim from the single-table app.
import type { EngineBridge } from "../../lib/engine";
import { numericData, parseCell } from "../../project/table";
import { SUBCOLUMN_FORMAT_ENGINE, type DataTableModel } from "../../project/types";
import type { AnalysisResult, OptionsState } from "../../types";
import { MODELS_META } from "../../types";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function runNonlin(engine: EngineBridge, table: DataTableModel,
  options: OptionsState): AnalysisResult {
  // Summary tables (mean with SD / SEM / %CV / CI and N, or no N): the
  // engine fits them as the raw replicates would be fitted (or the means
  // only) and draws the entered error bars.
  const summary = table.subcolumnFormat !== "replicates";
  const summaryOptions = summary ? {
    summary_format: SUBCOLUMN_FORMAT_ENGINE[table.subcolumnFormat],
    replicates: options.summaryReplicates ?? "account",
  } : {};
  if (summary && options.normalize.enabled) {
    return { analysis: "dose_response", datasets: [],
      error: "Normalize needs replicate values, not means with errors: turn "
        + "Normalize off, or enter the normalized means" };
  }
  if (summary && options.model === "ec50_shift") {
    return { analysis: "dose_response", datasets: [],
      error: "The EC50-shift (Gaddum/Schild) fit needs replicate values; it is "
        + "not available for data entered as means with errors" };
  }
  let data = numericData(table);
  if (options.normalize.enabled) {
    const n = options.normalize;
    const normalized = engine.analyze({
      analysis: "normalize",
      data,
      options: {
        zero_mode: n.zeroMode,
        zero_value: parseCell(n.zeroValue) ?? 0,
        hundred_mode: n.hundredMode,
        hundred_value: parseCell(n.hundredValue) ?? 100,
        as_percent: n.asPercent,
        subcolumns: n.subcolumns,
      },
    }) as { error?: string; datasets: { name: string; ys: (number | null)[][] }[] };
    if (normalized.error) {
      return { analysis: "dose_response", datasets: [], error: normalized.error };
    }
    data = { x: data.x, datasets: normalized.datasets };
  }

  const meta = MODELS_META[options.model] ?? MODELS_META.log_inhibitor_vs_response_4pl;
  const constraints: Record<string, number> = {};
  if (options.top.enabled && meta.constrainable.includes("Top")) {
    constraints.Top = parseCell(options.top.value) ?? 0;
  }
  if (options.bottom.enabled && meta.constrainable.includes("Bottom")) {
    constraints.Bottom = parseCell(options.bottom.value) ?? 0;
  }
  if (options.hillSlope.enabled && meta.constrainable.includes("HillSlope")) {
    constraints.HillSlope = parseCell(options.hillSlope.value) ?? -1;
  }
  for (const c of meta.constants ?? []) {
    const v = parseCell(options.modelConstants[c] ?? "");
    if (v !== null) constraints[c] = v;
  }

  const interpY = options.interpolateY
    .split(/[\n,;\s]+/).map(parseCell)
    .filter((v): v is number => v !== null);

  if (options.model === "ec50_shift") {
    if (options.schildSlopeUnity) constraints.SchildSlope = 1.0;
    const antagonist = options.antagonist
      .split(/[\n,;\s]+/).map(parseCell)
      .filter((v): v is number => v !== null);
    const g = engine.analyze({
      analysis: "ec50_shift",
      data,
      options: {
        x_is_log: options.xIsLog,
        error_bars: options.errorBars,
        constraints,
        antagonist,
      },
    }) as Record<string, any>;
    if (g.error) return { analysis: "dose_response", datasets: [], error: g.error };
    return {
      analysis: "dose_response",
      datasets: g.datasets.map((ds: any) => ({
        name: ds.name,
        points: ds.points,
        fit: {
          model: g.model,
          label: `${g.label}, [antagonist] = ${ds.antagonist}`,
          equation: g.equation,
          status: "converged",
          dependency: {},
          params: {
            ...g.params,
            "EC50 (this curve)": {
              value: ds.ec50_observed, se: null, ci95: null,
              constrained: false, derived: true,
            },
            "Dose ratio": {
              value: ds.dose_ratio, se: null, ci95: null,
              constrained: false, derived: true,
            },
          },
          param_order: [...g.param_order, "EC50 (this curve)", "Dose ratio"],
          goodness: {
            df: g.goodness.df,
            n_points: ds.n_points,
            r_squared: ds.r_squared,
            ss_res: ds.ss_res,
            sy_x: g.goodness.sy_x,
          },
          curve: ds.curve,
        },
      })),
    };
  }

  if (options.sharedParams.length > 0) {
    const g = engine.analyze({
      analysis: "global_fit",
      data,
      options: {
        model: options.model,
        x_is_log: options.xIsLog,
        error_bars: options.errorBars,
        constraints,
        shared: options.sharedParams,
        weighting: options.weighting,
        ...summaryOptions,
      },
    }) as Record<string, any>;
    if (g.error) return { analysis: "dose_response", datasets: [], error: g.error };
    return {
      analysis: "dose_response",
      datasets: g.datasets.map((ds: any) => ({
        name: ds.name,
        points: ds.points,
        fit: {
          model: g.model,
          label: `${g.label}, global fit (shared: ${g.shared.join(", ")})`,
          equation: g.equation,
          status: "converged",
          dependency: {},
          params: ds.params,
          param_order: Object.keys(ds.params),
          goodness: {
            df: g.goodness.df,
            n_points: ds.n_points,
            r_squared: ds.r_squared,
            ss_res: ds.ss_res,
            sy_x: g.goodness.sy_x,
          },
          curve: ds.curve,
        },
      })),
    };
  }

  return engine.analyze({
    analysis: "dose_response",
    data,
    options: {
      model: options.model,
      x_is_log: options.xIsLog,
      error_bars: options.errorBars,
      constraints,
      weighting: options.weighting,
      ci_method: options.ciMethod,
      rout_q: options.routEnabled
        ? (parseCell(options.routQ) ?? 1) / 100 : null,
      bands: options.bands === "none" ? null : options.bands,
      diagnostics: options.diagnostics,
      interpolate_y: interpY.length ? interpY : null,
      ...summaryOptions,
    },
  }) as AnalysisResult;
}

/** Automatic axis titles for the XY graph. */
export function xyAutoTitles(table: DataTableModel, options: OptionsState | null):
  { x: string; y: string } {
  const meta = MODELS_META[options?.model ?? "log_inhibitor_vs_response_4pl"]
    ?? MODELS_META.log_inhibitor_vs_response_4pl;
  const x = table.xFormat !== "numbers"
    ? (table.xTitle && table.xTitle !== "X" ? table.xTitle
      : table.xFormat === "dates" ? "Date" : "Elapsed time")
    : meta.needsLogX ? `${meta.xLabel}, ${table.xUnit || "M"}` : meta.xLabel;
  const y = table.yTitle || (options?.normalize.enabled
    ? (options.normalize.asPercent ? "Normalized response (%)" : "Normalized response")
    : "Response");
  return { x, y };
}
