// A zero dose (or any X <= 0) in a log(X) dose-response fit: the engine
// leaves it out (log of 0) and reports each data set's count and mean as
// `log_x_dropped`. This decides what the results sheet offers: with one
// curve, constraining the plateau those wells represent (the nearer of the
// fitted Top and Bottom) to their mean; with several curves, holding that
// plateau of each curve at its own zero-dose wells (P-104, the engine's
// zero_dose_plateau), since one shared constraint would be wrong for
// groups with different controls. Pure, unit-tested.
import { modelMeta } from "../../lib/modelLibrary.ts";
import { formatSig, type AnalysisResult, type OptionsState } from "../../types.ts";
import { constraintState, routeFor } from "./fitOptions.ts";

export interface ZeroDoseGroup { name: string; n: number; mean: number; x: number[] }

/** A curve whose plateau the engine held at its own zero-dose wells. */
export interface HeldPlateau { name: string; param: "Top" | "Bottom"; value: number; n: number }

export interface ZeroDosePlan {
  groups: ZeroDoseGroup[];
  /** The plateau to constrain (one curve whose model has it), else null. */
  plateau: "Top" | "Bottom" | null;
  /** The value to constrain it to (the zero-dose mean, 6 significant digits). */
  value: string | null;
  /** That plateau is already constrained to this value. */
  constrained: boolean;
  /** Several curves: the plateau each could hold at its own zero-dose
   *  wells (every fitted curve agrees which one it is), else null. */
  perCurve: "Top" | "Bottom" | null;
  /** The per-curve hold the options ask for (P-104), if any. */
  active: { param: "Top" | "Bottom"; reason: string } | null;
  /** What the engine held, curve by curve. */
  held: HeldPlateau[];
}

/** Suggested reason for the per-curve hold; the user can change it. */
export const ZERO_DOSE_REASON = "Vehicle wells are each curve's response with no drug";

interface Dropped { n_values: number; x_values: number[]; mean_y: number }

type Plateau = "Top" | "Bottom";

/** The plateau a zero-dose mean stands for: the nearer of the fitted Top
 *  and Bottom when the model has both, else the one it has. */
function nearer(mean: number, params: Record<string, { value?: number | null }> | undefined,
  can: (p: string) => boolean): Plateau | null {
  const top = params?.Top?.value;
  const bottom = params?.Bottom?.value;
  if (can("Top") && can("Bottom") && typeof top === "number" && typeof bottom === "number") {
    return Math.abs(mean - top) <= Math.abs(mean - bottom) ? "Top" : "Bottom";
  }
  if (can("Top") && typeof top === "number") return "Top";
  if (can("Bottom") && typeof bottom === "number") return "Bottom";
  return null;
}

/** The engine option of the per-curve hold, for curves fitted one at a
 *  time with a library model that has that plateau. */
export function zeroDoseOption(o: OptionsState): { zero_dose_plateau?: { param: Plateau } } {
  const z = o.zeroDosePlateau;
  if (!z || (z.param !== "Top" && z.param !== "Bottom")) return {};
  if (!modelMeta(o.model)?.constrainable?.includes(z.param)) return {};
  return { zero_dose_plateau: { param: z.param } };
}

/** The methods clause of the per-curve hold, or null when nothing was
 *  held. */
export function heldMethodsClause(plan: ZeroDosePlan | null): string | null {
  if (!plan?.active || !plan.held.length) return null;
  const vals = plan.held.map((h) => `${h.name} ${formatSig(h.value)}, n = ${h.n}`).join("; ");
  const reason = plan.active.reason.trim().replace(/\.$/, "");
  return `${plan.active.param} of each curve held at the mean of that data set's own zero-dose `
    + `wells (${vals}${reason ? `; stated reason: ${reason}` : ""}), those wells not being points `
    + "on the curve as X = 0 has no logarithm";
}

/** Every fitted curve had its plateau held: a typed constant of that
 *  parameter was replaced on all of them. */
export function heldEverywhere(plan: ZeroDosePlan | null, result: AnalysisResult | null | undefined): boolean {
  const fitted = (result?.datasets ?? []).filter((d) => d.fit).length;
  return !!plan?.active && fitted > 0 && plan.held.length === fitted;
}

export function zeroDosePlan(result: AnalysisResult | null | undefined, options: OptionsState): ZeroDosePlan | null {
  if (!result || result.error) return null;
  const groups: ZeroDoseGroup[] = [];
  const held: HeldPlateau[] = [];
  const meta = modelMeta(options.model);
  const can = (p: string) => !!meta?.constrainable?.includes(p);
  const byName = new Map<string, Plateau | null>();
  for (const ds of result.datasets ?? []) {
    const d = (ds as { log_x_dropped?: Dropped }).log_x_dropped;
    if (d && d.n_values > 0) {
      groups.push({ name: ds.name, n: d.n_values, mean: d.mean_y, x: d.x_values });
      if (ds.fit) {
        byName.set(ds.name, nearer(d.mean_y, ds.fit.params as Record<string, { value?: number | null }>, can));
      }
    }
    const z = ds.zero_dose_constraint;
    if (z) held.push({ name: ds.name, param: z.param, value: z.value, n: z.n_values });
  }
  if (!groups.length) return null;
  const z = options.zeroDosePlateau;
  const active = z && (z.param === "Top" || z.param === "Bottom") && can(z.param)
    ? { param: z.param, reason: z.reason ?? "" } : null;
  const plan: ZeroDosePlan = { groups, plateau: null, value: null, constrained: false,
    perCurve: null, active, held };
  const fitted = (result.datasets ?? []).filter((ds) => ds.fit);
  if ((result.datasets ?? []).length !== 1 || fitted.length !== 1) {
    // several curves: one plateau for all, read the same way per curve
    const picks = [...byName.values()];
    const first = picks[0] ?? null;
    if (groups.length >= 1 && picks.length === groups.length && first
      && picks.every((p) => p === first) && routeFor(options) === "dose_response") {
      plan.perCurve = first;
    }
    return plan;
  }
  const params = fitted[0].fit?.params as Record<string, { value?: number | null }> | undefined;
  const mean = groups[0].mean;
  const plateau = nearer(mean, params, can);
  if (!plateau) return plan;
  const value = String(Number(mean.toPrecision(6)));
  const st = constraintState(options, plateau);
  const constrained = st.enabled && Math.abs(Number(st.value) - mean) <= 1e-6 * Math.max(1, Math.abs(mean));
  return { ...plan, plateau, value, constrained };
}
