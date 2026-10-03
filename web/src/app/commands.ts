// Commands shared by the navigator, the header and keyboard shortcuts.
import { useMemo } from "react";
import { derivedFrom } from "../project/derived";
import { newId } from "../project/ids";
import {
  addSheets, deleteSheet, deletionCount, duplicateSheet,
  familyChildren, findSheet, makeInfoSheet, makeLayoutSheet, moveSheet,
  nextNumberedName, renameSheet, setFrozen, setHighlight,
} from "../project/ops";
import { serializeProject } from "../project/persist";
import { withExclusionsBlanked } from "../project/table";
import type {
  DataSheet, HighlightColor, Project, ResultsSheet,
} from "../project/types";
import { analysisDef } from "../sheets/registry";
import { resolveOptions } from "./analysis";
import { useProject } from "./context";
import { analysisSheets } from "./factory";
import { useUi } from "./ui";

export function useCommands() {
  const api = useProject();
  const ui = useUi();
  return useMemo(() => {
    const { apply, select, store, results } = api;

    const rename = (id: string, name: string) =>
      apply((p) => renameSheet(p, id, name));

    const remove = async (id: string) => {
      const p = store.project;
      const s = findSheet(p, id);
      if (!s) return;
      const n = deletionCount(p, id);
      const ok = await ui.confirm({
        title: `Delete “${s.name}”?`,
        body: n > 1
          ? `This deletes the data table and its ${n - 1} linked results and graph sheet${n - 1 === 1 ? "" : "s"}. You can undo it.`
          : "You can undo it.",
        confirmLabel: "Delete",
        danger: true,
      });
      if (ok) apply((q) => deleteSheet(q, id));
    };

    const duplicate = (id: string) => {
      const before = new Set(store.project.sheets.map((s) => s.id));
      const next = apply((p) => duplicateSheet(p, id, newId));
      const created = next.sheets.find((s) => !before.has(s.id));
      if (created) select(created.id);
    };

    const move = (id: string, dir: -1 | 1) => apply((p) => moveSheet(p, id, dir));

    const highlight = (id: string, color: HighlightColor | null) =>
      apply((p) => setHighlight(p, id, color));

    /** Freeze captures what the sheet shows now, so it stops following edits. */
    const toggleFreeze = (id: string) => {
      const p = store.project;
      const s = findSheet(p, id);
      if (!s) return;
      if (s.frozen) { apply((q) => setFrozen(q, id, false)); return; }
      if (s.kind === "results") {
        apply((q) => setFrozen(q, id, true, { cached: results.get(id)?.result ?? null }));
      } else if (s.kind === "graph") {
        const data = findSheet(p, s.parentId) as DataSheet | undefined;
        const res = findSheet(p, s.resultsId) as ResultsSheet | undefined;
        if (!data) return;
        const def = res ? analysisDef(data.table.type, res.analysis) : undefined;
        const snapshot = {
          table: withExclusionsBlanked(data.table),
          result: res ? (res.frozen ? res.cached : results.get(res.id)?.result) ?? null : null,
          options: res ? resolveOptions(def, res.options, data.table, p.prefs) : null,
        };
        apply((q) => setFrozen(q, id, true, { snapshot }));
      } else {
        apply((q) => setFrozen(q, id, true));
      }
    };

    const addAnalysis = (dataId: string, analysisId: string) => {
      const sheets = analysisSheets(store.project, dataId, analysisId, newId);
      if (!sheets.length) return;
      apply((p) => addSheets(p, sheets, lastOfFamily(p, dataId)));
      select(sheets[0].id);
    };

    const addInfo = () => {
      const id = newId();
      apply((p) => addSheets(p, [makeInfoSheet(id, nextNumberedName(p, "Info"))]));
      select(id);
    };

    const addLayout = () => {
      const id = newId();
      apply((p) => addSheets(p, [makeLayoutSheet(id, nextNumberedName(p, "Layout"))]));
      select(id);
    };

    const save = () => {
      const p = store.project;
      const blob = new Blob([serializeProject(p, results.snapshot())],
        { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const slug = p.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "opendose-project";
      a.download = `${slug}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };

    return {
      rename, remove, duplicate,
      openDuplicateFamily: ui.openDuplicateFamily, move, highlight,
      toggleFreeze, addAnalysis, addInfo, addLayout, save,
      newTable: ui.openNewTable,
    };
  }, [api, ui]);
}

function lastOfFamily(p: Project, dataId: string): string {
  // Tables derived from this one (chains) count as the family's tail, so
  // a new output table lands after the earlier ones.
  const ids = new Set([...familyChildren(p, dataId), ...derivedFrom(p, dataId)].map((s) => s.id));
  const last = p.sheets.findLast((s) => ids.has(s.id));
  return last ? last.id : dataId;
}

export type Commands = ReturnType<typeof useCommands>;
