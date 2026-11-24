// Results sheets that are not on screen are brought up to date in the
// background, at the lowest priority: after a project is reopened (from a
// file, the autosave or a link) only the sheets whose input changed since
// their result was saved are recomputed, and the sheet on screen always
// goes first (the engine queue orders by priority, and a long background
// job gives way to the visible one when a warm spare worker is ready).
// Opening any sheet then shows its numbers at once.
import { useEffect } from "react";
import { sheetTable } from "../project/leftOut";
import type { DataSheet } from "../project/types";
import { analysisDef } from "../sheets/registry";
import { resolveOptions, resultKey, sheetRunner } from "./analysis";
import { useProject } from "./context";

const IDLE_MS = 1500;

export function useBackgroundRefresh() {
  const { project, results, engineReady } = useProject();
  useEffect(() => {
    if (!engineReady) return;
    const timer = setTimeout(() => {
      const byId = new Map(project.sheets.map((s) => [s.id, s]));
      for (const s of project.sheets) {
        if (s.kind !== "results" || s.frozen) continue;
        const data = byId.get(s.parentId) as DataSheet | undefined;
        if (!data || data.kind !== "data") continue;
        const def = analysisDef(data.table.type, s.analysis);
        if (!def) continue;
        // what this analysis sees: values left out of it only (P-68) applied
        const table = sheetTable(s, data.table);
        const options = resolveOptions(def, s.options, table, project.prefs);
        const key = resultKey(s.analysis, options, table);
        if (results.isCurrent(s.id, key) || results.isCancelled(s.id, key)) continue;
        results.run(s.id, key, sheetRunner(def, table, options), "background");
      }
    }, IDLE_MS);
    return () => clearTimeout(timer);
  }, [project, results, engineReady]);
}
