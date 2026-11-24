// Edit a survival results sheet's options in place (the extras of the
// Kaplan-Meier analysis, the competing-risks names and time): stored on
// the results sheet, so frozen and shared sheets get null (read-only).
import { useProject } from "../../app/context";
import { updateResultsOptions } from "../../project/ops";
import type { ResultsProps } from "../types";
import type { SurvivalOptions } from "./extras";

/** Edit this results sheet's options (null when it is locked). */
export function useOptionSetter<O = SurvivalOptions>(sheet: ResultsProps["sheet"]):
  ((patch: Partial<O>, key?: string) => void) | null {
  const api = useProject();
  if (sheet.frozen || api.readOnly) return null;
  return (patch, key) => {
    api.apply((p) => updateResultsOptions(p, sheet.id,
      (o) => ({ ...(o && typeof o === "object" ? o : {}), ...patch })), key ? `surv:${sheet.id}:${key}` : null);
  };
}
