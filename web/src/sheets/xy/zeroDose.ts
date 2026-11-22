// A zero dose (or any X <= 0) in a log(X) dose-response fit: the engine
// leaves it out (log of 0) and reports each data set's count and mean as
// `log_x_dropped`. This decides what the results sheet offers: with one
// curve, constraining the plateau those wells represent (the nearer of the
// fitted Top and Bottom) to their mean; with several curves only the note,
// since one shared constraint would be wrong for groups with different
// controls. Pure, unit-tested.
import { modelMeta } from "../../lib/modelLibrary.ts";
import type { AnalysisResult, OptionsState } from "../../types.ts";
import { constraintState } from "./fitOptions.ts";

export interface ZeroDoseGroup { name: string; n: number; mean: number; x: number[] }

export interface ZeroDosePlan {
  groups: ZeroDoseGroup[];
  /** The plateau to constrain (one curve whose model has it), else null. */
  plateau: "Top" | "Bottom" | null;
  /** The value to constrain it to (the zero-dose mean, 6 significant digits). */
  value: string | null;
  /** That plateau is already constrained to this value. */
  constrained: boolean;
}

interface Dropped { n_values: number; x_values: number[]; mean_y: number }

export function zeroDosePlan(result: AnalysisResult | null | undefined, options: OptionsState): ZeroDosePlan | null {
  if (!result || result.error) return null;
  const groups: ZeroDoseGroup[] = [];
  for (const ds of result.datasets ?? []) {
    const d = (ds as { log_x_dropped?: Dropped }).log_x_dropped;
    if (d && d.n_values > 0) groups.push({ name: ds.name, n: d.n_values, mean: d.mean_y, x: d.x_values });
  }
  if (!groups.length) return null;
  const plan: ZeroDosePlan = { groups, plateau: null, value: null, constrained: false };
  const fitted = (result.datasets ?? []).filter((ds) => ds.fit);
  if ((result.datasets ?? []).length !== 1 || fitted.length !== 1) return plan;
  const meta = modelMeta(options.model);
  const params = fitted[0].fit?.params as Record<string, { value?: number | null }> | undefined;
  const can = (p: string) => !!meta?.constrainable?.includes(p);
  const top = params?.Top?.value;
  const bottom = params?.Bottom?.value;
  const mean = groups[0].mean;
  let plateau: "Top" | "Bottom" | null = null;
  if (can("Top") && can("Bottom") && typeof top === "number" && typeof bottom === "number") {
    plateau = Math.abs(mean - top) <= Math.abs(mean - bottom) ? "Top" : "Bottom";
  } else if (can("Top") && typeof top === "number") plateau = "Top";
  else if (can("Bottom") && typeof bottom === "number") plateau = "Bottom";
  if (!plateau) return plan;
  const value = String(Number(mean.toPrecision(6)));
  const st = constraintState(options, plateau);
  const constrained = st.enabled && Math.abs(Number(st.value) - mean) <= 1e-6 * Math.max(1, Math.abs(mean));
  return { ...plan, plateau, value, constrained };
}
