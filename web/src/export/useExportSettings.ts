import { useCallback } from "react";
import { useProject } from "../app/context";
import type { ExportPrefs } from "../project/types";
import { DEFAULT_EXPORT, sanitizeExport } from "./settings";

const KEY = "opendose-export";

function browserDefault(): ExportPrefs | null {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    return raw ? sanitizeExport(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/**
 * The project's last export settings. They are saved in the project's
 * prefs (so a reopened file exports the same way) but outside undo
 * history, and the latest are also kept per browser as the starting point
 * for projects that have never exported.
 */
export function useExportSettings(): [ExportPrefs, (next: ExportPrefs) => void] {
  const { project, store } = useProject();
  const current = project.prefs.export ?? browserDefault() ?? DEFAULT_EXPORT;
  const set = useCallback((next: ExportPrefs) => {
    const clean = sanitizeExport(next);
    store.patchAll((p) => (JSON.stringify(p.prefs.export) === JSON.stringify(clean)
      ? p : { ...p, prefs: { ...p.prefs, export: clean } }));
    try { globalThis.localStorage?.setItem(KEY, JSON.stringify(clean)); } catch { /* ignore */ }
  }, [store]);
  return [current, set];
}
