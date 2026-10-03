// Analyses that produce a new data table (Extract & rearrange, Select &
// transform, and any other "results are a table" analysis).
//
// The new table becomes an ordinary, independent data sheet: it is placed
// right after the family of the table it came from, starts with its type's
// default analysis (or none), and is selected. It is a copy, so later
// edits to the source do not flow into it; running the analysis again
// creates a fresh copy. Undo removes it in one step.
import { useCallback } from "react";
import type { IdFactory } from "../project/ids";
import { newId } from "../project/ids";
import { addSheets, familyChildren } from "../project/ops";
import type { DataTableModel, Project } from "../project/types";
import { useProject } from "./context";
import { familySheets } from "./factory";

export interface DerivedTableOptions {
  /** Analysis the new table starts with: an id, null for none, or
   *  undefined for its table type's default. */
  analysis?: string | null;
}

/** Pure: `p` with a new family for `table` after `sourceId`'s family. */
export function addDerivedTable(p: Project, sourceId: string,
  table: DataTableModel, name: string, ids: IdFactory,
  opts: DerivedTableOptions = {}): { project: Project; dataId: string } {
  const sheets = familySheets(p, table, name, ids, { analysis: opts.analysis });
  const kids = familyChildren(p, sourceId);
  const after = kids.length ? kids[kids.length - 1].id : sourceId;
  return { project: addSheets(p, sheets, after), dataId: sheets[0].id };
}

/** Hook: add a derived table to the open project and select it. Returns
 *  the new data sheet's id. */
export function useAddDerivedTable() {
  const { apply, select } = useProject();
  return useCallback((sourceId: string, table: DataTableModel, name: string,
    opts?: DerivedTableOptions): string => {
    let dataId = "";
    apply((p) => {
      const res = addDerivedTable(p, sourceId, table, name, newId, opts);
      dataId = res.dataId;
      return res.project;
    });
    if (dataId) select(dataId);
    return dataId;
  }, [apply, select]);
}
