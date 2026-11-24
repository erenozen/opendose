// Nonlinear regression for XY tables: optional normalize step, then a
// per-dataset fit, a global fit with shared parameters, or the Gaddum /
// Schild EC50-shift model. Moved verbatim from the single-table app.
import type { EngineBridge } from "../../lib/engine";
import { numericData, parseCell } from "../../project/table";
import { curveOptions } from "./curveRange";
import { bootstrapOption } from "./bootstrap";
import { SUBCOLUMN_FORMAT_ENGINE, type DataTableModel } from "../../project/types";
import { engineWeighting, type AnalysisResult, type OptionsState } from "../../types";
import { modelMeta, USER_MODEL_ID } from "../../lib/modelLibrary";
import { userEquationPayload } from "../../lib/userEquation";
import {
  builtinBounds, builtinConstraints, builtinStarts, datasetConstantValues, effectiveShared, globalModelToResult,
  routeFor, userColumnConstants, userFitConstraints,
} from "./fitOptions";
import { autoFitGate, type ChooseReason } from "./autofit";
import { rowPoints } from "./deming";
import { concentrationUnit, withRangeReport } from "./rangeReport";
import { experimentsOption } from "./experiments";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The engine's weight_source, sent only when it is not the default
 *  (iteratively reweighted from the curve) and the fit is weighted. The
 *  global fits do not take it; nor do tables of means with errors. */
export function weightSourceOption(options: OptionsState, summary: boolean):
  { weight_source?: "objective" } {
  return options.weightSource === "objective" && options.weighting !== "none" && !summary
    ? { weight_source: "objective" } : {};
}

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

  // robust regression: library models fitted one curve at a time only
  if (options.fitMethod === "robust" && (options.model === USER_MODEL_ID || routeFor(options) !== "dose_response")) {
    return { analysis: "dose_response", datasets: [],
      error: "Robust regression is available for library models fitted one curve at a time, not for "
        + "user-defined equations, global fits with shared parameters or the Gaddum/Schild model" };
  }
  if (options.model === USER_MODEL_ID) {
    return runUserEquation(engine, table, options, data, summaryOptions);
  }
  const meta = modelMeta(options.model);
  const constraints = builtinConstraints(meta, options);
  const missing = (meta.constants ?? []).filter((c) => !(c in constraints));
  if (missing.length) {
    return { analysis: "dose_response", datasets: [],
      error: `Enter ${missing.join(", ")} under Experimental constants` };
  }
  const route = routeFor(options);
  // range constraints (P-20): the engine bounds curves fitted one at a time
  const bounds = builtinBounds(meta, options);
  if (Object.keys(bounds).length && route !== "dose_response") {
    return { analysis: "dose_response", datasets: [],
      error: "Range constraints (greater than, less than, between) apply to curves fitted one at a "
        + "time, not to global fits with shared parameters or the Gaddum/Schild model; hold the "
        + "parameter constant instead" };
  }
  // typed initial values (P-21): starts for curves fitted one at a time
  const starts = builtinStarts(meta, options);
  if (Object.keys(starts).length && route !== "dose_response") {
    return { analysis: "dose_response", datasets: [],
      error: "Typed initial values apply to curves fitted one at a time, not to global fits with "
        + "shared parameters or the Gaddum/Schild model; clear them under Initial values" };
  }
  // the shared-parameter fits (engine globalfit / fit_global_model) weight
  // only by 1/Y, 1/Y² or 1/X: say so rather than pass an unknown weighting
  if (options.weighting === "1/SD2" && route !== "dose_response") {
    return { analysis: "dose_response", datasets: [],
      error: "Weighting by 1/SD² is available for curves fitted one at a time, not for global fits "
        + "with shared parameters or the Gaddum/Schild model; choose another weighting" };
  }

  const interpY = options.interpolateY
    .split(/[\n,;\s]+/).map(parseCell)
    .filter((v): v is number => v !== null);

  if (route === "classic_shift") {
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
      // the Schild plot (P-49, sheets/xy/schild.ts); a display beside the fit
      ...(g.schild_plot ? { schild_plot: g.schild_plot } : {}),
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

  if (route === "global_model_fit") {
    const cc = datasetConstantValues(meta.datasetConstants ?? [], options,
      data.datasets.map((d) => d.name));
    if (cc.error) return { analysis: "dose_response", datasets: [], error: cc.error };
    const shared = effectiveShared(meta, options);
    const g = engine.analyze({
      analysis: "global_model_fit",
      data,
      options: {
        model: meta.engineId,
        x_is_log: options.xIsLog,
        error_bars: options.errorBars,
        constraints,
        ...(shared.length || !meta.globalOnly ? { shared } : {}),
        column_constants: cc.values,
        weighting: engineWeighting(options),
        ...summaryOptions,
      },
    }) as Record<string, any>;
    if (g.error) return { analysis: "dose_response", datasets: [], error: g.error };
    return globalModelToResult(g);
  }

  if (route === "global_fit") {
    const g = engine.analyze({
      analysis: "global_fit",
      data,
      options: {
        model: options.model,
        x_is_log: options.xIsLog,
        error_bars: options.errorBars,
        constraints,
        shared: effectiveShared(meta, options),
        weighting: engineWeighting(options),
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
          ...(ds.range_flags ? { range_flags: ds.range_flags } : {}),
        },
      })),
    };
  }

  const experiments = summary ? null : experimentsOption(table);
  return engine.analyze({
    analysis: "dose_response",
    data,
    options: {
      model: meta.engineId,
      x_is_log: options.xIsLog,
      error_bars: options.errorBars,
      constraints,
      ...(Object.keys(bounds).length ? { bounds } : {}),
      ...(Object.keys(starts).length ? { initial_values: starts } : {}),
      weighting: engineWeighting(options),
      ...weightSourceOption(options, summary),
      ci_method: options.ciMethod,
      ...bootstrapOption(options),
      rout_q: options.routEnabled
        ? (parseCell(options.routQ) ?? 1) / 100 : null,
      bands: options.bands === "none" ? null : options.bands,
      diagnostics: options.diagnostics,
      interpolate_y: interpY.length ? interpY : null,
      // Y values in rows with no X read as unknowns (P-22)
      ...(options.interpolateUnknowns ? { interpolate_unknowns: true } : {}),
      // the drawn curve's range and resolution (P-52)
      ...curveOptions(options),
      ...(options.fitMethod === "robust" ? { fit_method: "robust" } : {}),
      ...summaryOptions,
      // a replicate map: also one fit per experiment and their summary
      ...(experiments ? { experiments } : {}),
    },
  }) as AnalysisResult;
}

function interpolateValues(options: OptionsState): number[] {
  return options.interpolateY
    .split(/[\n,;\s]+/).map(parseCell)
    .filter((v): v is number => v !== null);
}

/** A user-defined equation: each data set on its own (dose_response), or
 *  all at once when the equation shares parameters (global_model_fit). */
function runUserEquation(engine: EngineBridge, _table: DataTableModel,
  options: OptionsState, data: ReturnType<typeof numericData>,
  summaryOptions: Record<string, unknown>): AnalysisResult {
  const def = options.userEquation;
  if (!def || !def.text.trim()) {
    return { analysis: "dose_response", datasets: [],
      error: "Enter an equation: choose “Enter your own equation…” in the model list" };
  }
  const fixed = userFitConstraints(def, options);
  if (fixed.error) return { analysis: "dose_response", datasets: [], error: fixed.error };
  const cc = datasetConstantValues(userColumnConstants(def), options,
    data.datasets.map((d) => d.name));
  if (cc.error) return { analysis: "dose_response", datasets: [], error: cc.error };
  const common = {
    user_equation: userEquationPayload(def),
    x_is_log: options.xIsLog,
    error_bars: options.errorBars,
    constraints: fixed.constraints,
    weighting: engineWeighting(options),
    ...(Object.keys(cc.values).length ? { column_constants: cc.values } : {}),
    ...summaryOptions,
  };
  if (routeFor(options) === "global_model_fit") {
    const g = engine.analyze({ analysis: "global_model_fit", data, options: common }) as
      Record<string, any>;
    if (g.error) return { analysis: "dose_response", datasets: [], error: g.error };
    return { ...globalModelToResult(g), user_equation: g.user_equation } as AnalysisResult;
  }
  const interpY = interpolateValues(options);
  return engine.analyze({
    analysis: "dose_response",
    data,
    options: {
      ...common,
      ...weightSourceOption(options, Object.keys(summaryOptions).length > 0),
      ci_method: options.ciMethod,
      ...bootstrapOption(options),
      rout_q: options.routEnabled
        ? (parseCell(options.routQ) ?? 1) / 100 : null,
      bands: options.bands === "none" ? null : options.bands,
      diagnostics: options.diagnostics,
      interpolate_y: interpY.length ? interpY : null,
      ...(options.interpolateUnknowns ? { interpolate_unknowns: true } : {}),
      ...curveOptions(options),
    },
  }) as AnalysisResult;
}

/** What the curve fit returns while it waits for a choice (the data do
 *  not look like a dose-response and no fit was asked for): no fits, the
 *  reason, and the points for the graph. */
export interface ChooseModelResult extends AnalysisResult {
  choose_model: {
    reason: ChooseReason;
    preview: { name: string; points: AnalysisResult["datasets"][number]["points"] }[];
  };
}

export function chooseModelOf(result: unknown): ChooseModelResult["choose_model"] | null {
  const r = result as Partial<ChooseModelResult> | null;
  return r && typeof r === "object" && r.choose_model ? r.choose_model : null;
}

/** The curve fit as a new XY table runs it: straight away when asked for
 *  or when the data look like a dose-response, else "choose a model". */
export function runNonlinGated(engine: EngineBridge, table: DataTableModel,
  options: OptionsState): AnalysisResult {
  const gate = autoFitGate(table, options);
  // an IC50 beyond the doses tested is reported as "> highest dose"
  if (gate.fit) return withRangeReport(runNonlin(engine, table, options), table, options);
  const pts = rowPoints(table);
  // not "dose_response": the report must not describe a fit that did not run
  return {
    analysis: "choose_model",
    datasets: [],
    choose_model: {
      reason: gate.reason,
      preview: table.datasets.map((d, i) => ({ name: d.name, points: pts[i] })),
    },
  } as ChooseModelResult;
}

/** Automatic axis titles for the XY graph. */
export function xyAutoTitles(table: DataTableModel, options: OptionsState | null):
  { x: string; y: string } {
  if (options && !autoFitGate(table, options).fit) {
    // no model yet: the table's own titles
    return {
      x: table.xTitle && table.xTitle !== "X" ? table.xTitle : "X",
      y: table.yTitle || "Y",
    };
  }
  const user = options?.model === USER_MODEL_ID;
  const meta = modelMeta(options?.model);
  const logX = user ? !!options?.userEquation?.xIsLog : meta.needsLogX;
  const stem = user ? (logX ? "log[Concentration]" : "X") : meta.xLabel;
  const x = table.xFormat !== "numbers"
    ? (table.xTitle && table.xTitle !== "X" ? table.xTitle
      : table.xFormat === "dates" ? "Date" : "Elapsed time")
    // the unit the results state (IC50 (µM)): from the X header, then the table
    : logX ? `${stem}, ${concentrationUnit(table) || "M"}` : stem;
  const y = table.yTitle || (options?.normalize.enabled
    ? (options.normalize.asPercent ? "Normalized response (%)" : "Normalized response")
    : "Response");
  return { x, y };
}
