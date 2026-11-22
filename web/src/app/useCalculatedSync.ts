// Keeps calculated columns (project/calculated.ts) equal to their
// formulas: when a table's other columns, X or a formula change, the
// engine recomputes them and the values are written into the cells.
//
// Writes go through store.amend (no undo step), as derived tables do: the
// values are a pure function of the rest of the table, so undoing an edit
// brings back the values that went with it (and the next pass agrees).
import { useEffect } from "react";
import { isCancelled, isEnginePending, runEngine } from "../lib/engine";
import { applyCalcResults, calcRequests, calcSignature, hasCalculated } from "../project/calculated";
import type { DataSheet, Project } from "../project/types";
import { useProject } from "./context";

const DEBOUNCE_MS = 200;

/** Signature last computed for each data sheet (by id), so a table is
 *  recomputed only when what it depends on changed. */
const done = new Map<string, string>();

export function useCalculatedSync() {
  const { project, store } = useProject();
  useEffect(() => {
    const todo = project.sheets.filter((s): s is DataSheet => s.kind === "data"
      && hasCalculated(s.table) && done.get(s.id) !== calcSignature(s.table));
    if (!todo.length) return;
    const timer = setTimeout(() => {
      const p = store.project;
      const work = todo.map((s) => {
        const cur = p.sheets.find((x) => x.id === s.id) as DataSheet | undefined;
        return cur && cur.kind === "data" ? cur : null;
      }).filter((s): s is DataSheet => !!s);
      runEngine((engine) => work.map((s) => ({
        id: s.id,
        table: applyCalcResults(s.table, calcRequests(s.table).map((q) => {
          try {
            return engine.analyze(q.payload);
          } catch (e) {
            // the engine still loading: let runEngine retry the pass
            if (isEnginePending(e)) throw e;
            return { error: e instanceof Error ? e.message : String(e) };
          }
        })),
      })), { coalesce: "calculated-sync" })
        .then((out) => {
          store.amend((cur: Project) => {
            // the project changed meanwhile: the next pass recomputes
            if (cur !== p) return cur;
            for (const o of out) done.set(o.id, calcSignature(o.table));
            return {
              ...cur,
              sheets: cur.sheets.map((s) => {
                const o = out.find((x) => x.id === s.id);
                return o && s.kind === "data" ? { ...s, table: o.table } : s;
              }),
            };
          });
        })
        .catch((e) => { if (!isCancelled(e)) console.error(e); });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [project, store]);
}
