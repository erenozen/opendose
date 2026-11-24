// Parameter covariance and the joint confidence region of two fitted
// parameters (FEATURE-PLAN P-102). The engine (engine/opendose/
// fitregion.py) computes the covariance behind the SEs and traces the
// profile-likelihood region; this file turns them into the results'
// tables, the graph's view and the words around them. Pure; unit-tested.
import { formatSig, type AnalysisResult, type FitResult, type OptionsState } from "../../types.ts";

/** The engine's joint_region option, or {} (none asked for). */
export function regionOption(options: Pick<OptionsState, "jointRegion">): { joint_region?: [string, string] } {
  const p = options.jointRegion;
  return Array.isArray(p) && p.length === 2 && p[0] && p[1] && p[0] !== p[1]
    ? { joint_region: [p[0], p[1]] } : {};
}

/** The free parameters of the first fit with a covariance: the names a
 *  region can be drawn for. */
export function regionParams(result: AnalysisResult | null): string[] {
  for (const ds of result?.datasets ?? []) {
    const names = ds.fit?.covariance?.params;
    if (names && names.length >= 2) return names;
  }
  return [];
}

const MIDPOINT = /^Log/;

/** The pair offered first: the log midpoint with the slope when the
 *  model has them (LogIC50 and HillSlope), else the first two. */
export function defaultPair(params: string[]): [string, string] | null {
  if (params.length < 2) return null;
  const mid = params.find((p) => MIDPOINT.test(p));
  const slope = params.find((p) => /Slope|^h$|^nH$/.test(p) && p !== mid);
  if (mid && slope) return [mid, slope];
  return [params[0], params[1]];
}

export interface MatrixTable {
  params: string[];
  rows: { name: string; cells: string[] }[];
}

/** The correlation or covariance matrix as table rows: every cell
 *  formatted as the results format numbers ("n/a" where undefined); the
 *  upper triangle of the correlation repeats the lower and is left blank. */
export function matrixTable(fit: Pick<FitResult, "covariance">, which: "correlation" | "covariance"):
  MatrixTable | null {
  const c = fit.covariance;
  if (!c || c.params.length < 2) return null;
  const m = which === "correlation" ? c.correlation : c.matrix;
  return {
    params: c.params,
    rows: c.params.map((name, i) => ({
      name,
      cells: c.params.map((_, j) => {
        if (which === "correlation" && j > i) return "";
        const v = m[i]?.[j];
        return typeof v === "number" && Number.isFinite(v) ? formatSig(v) : "n/a";
      }),
    })),
  };
}

/** Each fitted data set's region, as the graph draws it. */
export interface RegionView {
  params: [string, string] | null;
  sets: {
    name: string;
    error?: string;
    contour?: { x: (number | null)[]; y: (number | null)[] };
    ellipse?: { x: number[]; y: number[] };
    estimate?: [number, number];
    open?: boolean;
  }[];
  fCrit: number | null;
  df: [number, number] | null;
}

export function regionView(result: AnalysisResult | null): RegionView | null {
  const sets: RegionView["sets"] = [];
  let params: [string, string] | null = null;
  let fCrit: number | null = null;
  let df: [number, number] | null = null;
  for (const ds of result?.datasets ?? []) {
    const jr = ds.fit?.joint_region;
    if (!jr) continue;
    params ??= [jr.params[0], jr.params[1]];
    if (jr.error) { sets.push({ name: ds.name, error: jr.error }); continue; }
    fCrit ??= jr.f_crit ?? null;
    df ??= jr.df ?? null;
    sets.push({ name: ds.name, contour: jr.contour, ellipse: jr.ellipse, estimate: jr.estimate, open: jr.open });
  }
  return sets.length ? { params, sets, fCrit, df } : null;
}

/** What the region is, in words (results card, graph legend). */
export function regionSentence(view: Pick<RegionView, "params" | "fCrit" | "df">): string {
  const [a, b] = view.params ?? ["", ""];
  const limit = view.fCrit !== null && view.df
    ? `SS_min × (1 + 2F/${view.df[1]}), F(2, ${view.df[1]}) = ${formatSig(view.fCrit)}` : "the F limit";
  return `The joint 95% confidence region of ${a} and ${b} by profile likelihood: with the other `
    + `parameters refitted, the sum of squares stays within ${limit} (Bates and Watts 1988). `
    + "The dashed ellipse is the linear approximation behind the asymptotic SEs; where the two "
    + "differ, those SEs and CIs are approximate.";
}
