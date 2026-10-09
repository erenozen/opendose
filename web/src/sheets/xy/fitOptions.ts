// Pure pieces of the curve-fit payloads: which constraints and constants
// the options imply for a model (built-in or user-defined), the per-data-
// set constants, and the conversion of global-fit results to the shape
// the results sheet and the XY graph draw. Unit-tested with node --test.
import {
  fitRoute, modelMeta, shareableParams, USER_MODEL_ID, type FitRoute, type ModelMeta,
} from "../../lib/modelLibrary.ts";
import {
  columnConstants, freeParameters, requiredConstants, sharedParameters,
  type UserEquationDef,
} from "../../lib/userEquation.ts";
import type { AnalysisResult, ConstraintState, OptionsState } from "../../types.ts";

function parseNum(v: string | undefined | null): number | null {
  const t = (v ?? "").trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** The constraint state of one parameter: Top / Bottom / HillSlope keep
 *  their original option fields, every other parameter lives in
 *  paramConstraints. */
export function constraintState(o: OptionsState, p: string): ConstraintState {
  if (p === "Top") return o.top;
  if (p === "Bottom") return o.bottom;
  if (p === "HillSlope") return o.hillSlope;
  return o.paramConstraints?.[p] ?? { enabled: false, value: "" };
}

export function withConstraint(o: OptionsState, p: string, c: ConstraintState): OptionsState {
  if (p === "Top") return { ...o, top: c };
  if (p === "Bottom") return { ...o, bottom: c };
  if (p === "HillSlope") return { ...o, hillSlope: c };
  return { ...o, paramConstraints: { ...(o.paramConstraints ?? {}), [p]: c } };
}

/** Held-constant parameters and experimental constants for a built-in
 *  model. Top / Bottom / HillSlope read as before (blank: 0, 0, -1). */
export function builtinConstraints(meta: ModelMeta, o: OptionsState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of meta.constrainable) {
    const st = constraintState(o, p);
    if (!st.enabled) continue;
    const v = parseNum(st.value);
    if (v !== null) out[p] = v;
    else if (p === "Top" || p === "Bottom") out[p] = 0;
    else if (p === "HillSlope") out[p] = -1;
  }
  for (const c of meta.constants ?? []) {
    const v = parseNum(o.modelConstants[c]);
    if (v !== null) out[c] = v;
  }
  return out;
}

/** Number written in a data-set title ("1e-7", "10 nM" -> 10), or null. */
export function numberInTitle(name: string): number | null {
  const m = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(name);
  if (!m) return null;
  const v = Number(m[0]);
  return Number.isFinite(v) ? v : null;
}

/** One value per data set for each data-set constant: what the user typed,
 *  else the number in the data set's title. Returns the first missing one
 *  as an error. */
export function datasetConstantValues(params: string[], o: OptionsState,
  datasetNames: string[]):
  { values: Record<string, number[]>; error?: string } {
  const values: Record<string, number[]> = {};
  for (const p of params) {
    const typed = o.datasetConstants?.[p] ?? [];
    const vals: number[] = [];
    for (let i = 0; i < datasetNames.length; i++) {
      const v = parseNum(typed[i]) ?? numberInTitle(datasetNames[i] ?? "");
      if (v === null) {
        return { values, error: `Enter ${p} for data set "${datasetNames[i] || i + 1}" `
          + "(or put its value in the data set's title)" };
      }
      vals.push(v);
    }
    values[p] = vals;
  }
  return { values };
}

/** What a user-defined equation needs at fit time. */
export function userFitConstraints(def: UserEquationDef, o: OptionsState):
  { constraints: Record<string, number>; error?: string } {
  const constraints: Record<string, number> = {};
  for (const p of requiredConstants(def)) {
    const v = parseNum(o.modelConstants[p]);
    if (v === null) {
      return { constraints, error: `Enter the value of ${p} under Experimental constants` };
    }
    constraints[p] = v;
  }
  const params = Object.keys(def.rules);
  const shared = new Set(sharedParameters(def, params));
  for (const p of freeParameters(def, params)) {
    if (shared.has(p) || p in constraints) continue;
    const st = constraintState(o, p);
    if (!st.enabled) continue;
    const v = parseNum(st.value);
    if (v !== null) constraints[p] = v;
  }
  return { constraints };
}

export function userColumnConstants(def: UserEquationDef): string[] {
  return columnConstants(def);
}

/** Engine path for these options. */
export function routeFor(o: OptionsState): FitRoute {
  if (o.model === USER_MODEL_ID) {
    return o.userEquation && sharedParameters(o.userEquation).length
      ? "global_model_fit" : "dose_response";
  }
  const meta = modelMeta(o.model);
  return fitRoute(meta, effectiveShared(meta, o));
}

/** Shared parameters that apply to this model. */
export function effectiveShared(meta: ModelMeta, o: OptionsState): string[] {
  const ok = new Set(shareableParams(meta));
  return o.sharedParams.filter((p) => ok.has(p));
}

/** Engine-internal "LogXmid" of the four logistic models reads as the
 *  name the equation uses. */
function displayName(p: string, equation: string): string {
  if (p !== "LogXmid") return p;
  return equation.includes("IC50") ? "LogIC50" : "LogEC50";
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** global_model_fit result -> one fit per data set, as dose_response
 *  reports them. */
export function globalModelToResult(g: any): AnalysisResult {
  const equation = String(g.equation ?? "");
  const sharedNames = (g.shared ?? []).map((p: string) => displayName(p, equation));
  return {
    analysis: "dose_response",
    datasets: (g.datasets ?? []).map((ds: any) => {
      const params: Record<string, any> = {};
      for (const [k, v] of Object.entries(ds.params ?? {})) params[displayName(k, equation)] = v;
      const order = (ds.param_order ?? Object.keys(ds.params ?? {}))
        .map((p: string) => displayName(p, equation));
      return {
        name: ds.name,
        points: ds.points,
        fit: {
          model: g.model,
          label: sharedNames.length
            ? `${g.label}, global fit (shared: ${sharedNames.join(", ")})`
            : `${g.label}, global fit`,
          equation,
          status: "converged",
          dependency: {},
          params,
          param_order: order,
          weighting: g.weighting,
          goodness: {
            df: g.goodness?.df,
            n_points: ds.n_points,
            r_squared: ds.r_squared,
            ss_res: ds.ss_res,
            sy_x: g.goodness?.sy_x,
          },
          curve: ds.curve,
          ...(ds.range_flags ? { range_flags: ds.range_flags } : {}),
        },
      };
    }),
  };
}
