// Per-graph options a plot keeps in its graph sheet's settings (one key per
// graph family), edited from a small bar above the plot. They are saved
// with the project and undoable like any other edit.
import { useProject } from "../../app/context";
import { updateSheet } from "../../project/ops";
import type { GraphSheet, Sheet } from "../../project/types";

export function useGraphOptions<T extends object>(
  graph: GraphSheet, key: string, sanitize: (raw: unknown) => T,
): [T, (patch: Partial<T>) => void] {
  const { apply } = useProject();
  const value = sanitize(graph.settings[key]);
  const set = (patch: Partial<T>) => {
    if (graph.frozen) return;
    apply((p) => updateSheet<Sheet>(p, graph.id, (s) => {
      if (s.kind !== "graph" || s.frozen) return s;
      const next = { ...sanitize(s.settings[key]), ...patch };
      return { ...s, settings: { ...s.settings, [key]: next } };
    }), `graph:${graph.id}:${key}:${Object.keys(patch).join(",")}`);
  };
  return [value, set];
}

export const asRecord = (v: unknown): Record<string, unknown> =>
  (v && typeof v === "object" ? v as Record<string, unknown> : {});
