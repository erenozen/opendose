// React glue for an assay's controls and wizard: save settings to every
// results sheet of the assay in the family (one undo step), and finish a
// wizard run (replace the input table, save, make the linked outputs).
import { useCallback } from "react";
import { useProject } from "../../../app/context";
import { runEngine, type EngineBridge } from "../../../lib/engine";
import { newId } from "../../../project/ids";
import { findSheet, updateTable } from "../../../project/ops";
import type { DataSheet, DataTableModel, ResultsSheet } from "../../../project/types";
import {
  assaySheets, ensureOutputs, familyOutputs, setFamilySettings, type OutputSpec,
} from "./create";

export type SpecsFor<O> = (engine: EngineBridge, table: DataTableModel, options: O) => OutputSpec[];

export function useAssay<O extends object>(sheet: ResultsSheet) {
  const { project, apply, store, select } = useProject();
  const dataId = sheet.parentId;
  const analysis = sheet.analysis;
  const outputs = familyOutputs(project, dataId, analysis);

  const save = useCallback((o: O) => {
    apply((p) => setFamilySettings(p, dataId, analysis, o), `assay:${dataId}:${analysis}`);
  }, [apply, dataId, analysis]);

  /** Wizard finish / "Make the linked tables": one undo step. Returns
   *  the id of the first linked table (or null). */
  const commit = useCallback(async (o: O, table: DataTableModel | null,
    specsFor: SpecsFor<O> | null): Promise<string | null> => {
    const cur = findSheet(store.project, dataId) as DataSheet | undefined;
    if (!cur || cur.kind !== "data") return null;
    const t = table ?? cur.table;
    let specs: OutputSpec[] = [];
    try {
      specs = specsFor ? await runEngine((engine) => specsFor(engine, t, o), { priority: "user" }) : [];
    } catch {
      specs = [];
    }
    let first: string | null = null;
    apply((p) => {
      let next = table ? updateTable(p, dataId, () => table) : p;
      next = setFamilySettings(next, dataId, analysis, o);
      const main = assaySheets(next, dataId, analysis)[0];
      if (!specs.length || !main) return next;
      const r = ensureOutputs(next, main.id, specs, newId);
      first = r.firstId;
      return r.project;
    });
    return first;
  }, [apply, store, dataId, analysis]);

  const tableName = (findSheet(project, dataId)?.name) ?? "data";
  return { outputs, save, commit, select, tableName, project };
}
