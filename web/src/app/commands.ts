// Commands shared by the navigator, the header and keyboard shortcuts.
import { useMemo } from "react";
import { derivedFrom } from "../project/derived";
import { newId } from "../project/ids";
import {
  addSheets, deleteSheet, deletionCount, duplicateSheet,
  familyChildren, findSheet, makeInfoSheet, makeLayoutSheet, moveSheet,
  nextNumberedName, renameSheet, setFrozen, setHighlight,
} from "../project/ops";
import {
  addGroup, deleteGroup, moveGroup, moveSheetBefore, moveToGroup, nextGroupName,
  renameGroup, setGroupCollapsed,
} from "../project/groups";
import { addNote, deleteNote, updateNote } from "../project/notes";
import { serializeProject } from "../project/persist";
import { consistentTargets, makeGraphsConsistent } from "../project/wand";
import { withExclusionsBlanked } from "../project/table";
import type {
  DataSheet, FloatingNote, GraphSheet, GroupSection, HighlightColor, Project,
  ResultsSheet,
} from "../project/types";
import { analysisDef, graphDef } from "../sheets/registry";
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

    // ---- groups (navigator folders inside a section)
    const newGroup = (section: GroupSection, sheetIds: string[] = []): string => {
      let id = "";
      apply((p) => {
        const r = addGroup(p, section, nextGroupName(p, section), newId, sheetIds);
        id = r.groupId;
        return r.project;
      });
      return id;
    };
    const renameGroupCmd = (id: string, name: string) => apply((p) => renameGroup(p, id, name));
    const deleteGroupCmd = (id: string) => apply((p) => deleteGroup(p, id));
    const moveGroupCmd = (id: string, dir: -1 | 1) => apply((p) => moveGroup(p, id, dir));
    /** Folding is view state saved with the project: no undo step. */
    const setGroupFolded = (id: string, folded: boolean) =>
      store.patchAll((p) => setGroupCollapsed(p, id, folded));
    const toGroup = (sheetId: string, groupId: string | null) =>
      apply((p) => moveToGroup(p, sheetId, groupId));
    const dropBefore = (sheetId: string, beforeId: string | null) =>
      apply((p) => moveSheetBefore(p, sheetId, beforeId));

    // ---- floating notes
    const addNoteTo = (sheetId: string): string | null => {
      let id: string | null = null;
      apply((p) => {
        const r = addNote(p, sheetId, newId);
        id = r.noteId;
        return r.project;
      });
      return id;
    };
    const editNote = (sheetId: string, noteId: string,
      patch: Partial<Omit<FloatingNote, "id">>, key: string | null = null) =>
      apply((p) => updateNote(p, sheetId, noteId, patch), key);
    /** Folding a note is view state: saved, but not an undo step. */
    const foldNote = (sheetId: string, noteId: string, collapsed: boolean) =>
      store.patchAll((p) => updateNote(p, sheetId, noteId, { collapsed }));
    const removeNote = (sheetId: string, noteId: string) =>
      apply((p) => deleteNote(p, sheetId, noteId));

    // ---- make graphs consistent ("like this one")
    const makeConsistent = async (sheetId: string) => {
      const p = store.project;
      const s = findSheet(p, sheetId);
      if (!s) return;
      const sources = s.kind === "graph" ? [s]
        : s.kind === "data" ? familyChildren(p, s.id).filter((c): c is GraphSheet => c.kind === "graph")
          : [];
      const targets = new Set(sources.flatMap((g) => consistentTargets(p, g.id).map((t) => t.id)));
      for (const g of sources) targets.delete(g.id);
      if (!sources.length) return;
      if (!targets.size) {
        ui.notify("No other graph of the same kind to restyle.");
        return;
      }
      const kinds = [...new Set(sources.map((g) => {
        const d = findSheet(p, g.parentId) as DataSheet | undefined;
        return (d ? graphDef(d.table.type, g.graphType)?.label : undefined) ?? g.graphType;
      }))].join(", ");
      const ok = await ui.confirm({
        title: "Make graphs consistent?",
        body: `Gives ${targets.size} other graph${targets.size === 1 ? "" : "s"} (${kinds}) `
          + "the same formatting and colour scheme as "
          + (s.kind === "graph" ? `“${s.name}”` : `the graphs of “${s.name}”`)
          + ". Their titles and data stay. You can undo it.",
        confirmLabel: "Apply format",
      });
      if (!ok) return;
      let n = 0;
      apply((q) => {
        const r = makeGraphsConsistent(q, sources.map((g) => g.id));
        n = r.changed;
        return r.project;
      });
      ui.notify(`Restyled ${n} graph${n === 1 ? "" : "s"}.`);
    };

    return {
      rename, remove, duplicate,
      openDuplicateFamily: ui.openDuplicateFamily, move, highlight,
      toggleFreeze, addAnalysis, addInfo, addLayout, save,
      newTable: ui.openNewTable,
      newGroup, renameGroup: renameGroupCmd, deleteGroup: deleteGroupCmd,
      moveGroup: moveGroupCmd, setGroupFolded, toGroup, dropBefore,
      addNote: addNoteTo, editNote, foldNote, removeNote, makeConsistent,
      saveTemplate: ui.openSaveTemplate, wand: ui.openWand,
      moveToGroup: ui.openMoveToGroup, goTo: ui.openGoTo,
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
