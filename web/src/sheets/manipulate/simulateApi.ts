// Opening the "Simulate data" dialog from anywhere, and storing a
// simulation on its data sheet.
import { ANALYSIS_NONLIN } from "../../project/builtin";
import { updateSheet } from "../../project/ops";
import type { Project, Sheet } from "../../project/types";
import { MODELS_META } from "../../types";
import { USER_MODEL_ID } from "../../lib/modelLibrary";
import type { SimForm, SimKind, XYSimForm } from "./simulate";

export interface SimulateRequest { editId?: string; kind?: SimKind }

const listeners = new Set<(r: SimulateRequest) => void>();

/** Open the simulation dialog (a new table, or `editId` to re-simulate). */
export function openSimulate(req: SimulateRequest = {}) {
  listeners.forEach((fn) => fn(req));
}

/** For the dialog host. */
export function onSimulateRequest(fn: (r: SimulateRequest) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Store the spec on the sheet; with `fitDefaults`, point the family's
 *  curve fits at the simulated model (and its log X). */
export function withSimulation(p: Project, dataId: string, kind: SimKind, form: SimForm,
  seed: number, fitDefaults: boolean): Project {
  let next = updateSheet<Sheet>(p, dataId, (s) => (s.kind === "data"
    ? { ...s, simulation: { kind, seed, form } } : s));
  if (fitDefaults && kind === "xy") {
    const f = form as XYSimForm;
    const meta = MODELS_META[f.model];
    // a user-defined equation (P-51): the fit uses the same equation; its
    // X was simulated in the equation's own units
    const user = f.model === USER_MODEL_ID && f.userEquation
      ? { userEquation: f.userEquation, xIsLog: true, autoFit: "requested" as const } : null;
    next = {
      ...next,
      sheets: next.sheets.map((s) => (s.kind === "results" && s.parentId === dataId
        && s.analysis === ANALYSIS_NONLIN
        ? { ...s, options: { ...(s.options as object), model: f.model,
          ...(user ?? { xIsLog: !!meta?.needsLogX }) } }
        : s)),
    };
  }
  return next;
}
