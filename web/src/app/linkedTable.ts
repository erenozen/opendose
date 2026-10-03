// Hook for results panels whose analysis makes a data table on request
// (AnalysisDef.derivedOnDemand): add the linked table and select it.
import { useCallback } from "react";
import { derivedOutputs } from "../project/derived";
import { newId } from "../project/ids";
import type { DataSheet, DataTableModel } from "../project/types";
import { useProject } from "./context";
import { addLinkedTable } from "./factory";

export function useLinkedTable(resultsId: string): {
  /** Linked tables this results sheet already feeds. */
  outputs: DataSheet[];
  /** Create one (and select it); returns its id. */
  create: (table: DataTableModel, name: string) => string;
} {
  const { project, apply, select } = useProject();
  const outputs = derivedOutputs(project, resultsId);
  const create = useCallback((table: DataTableModel, name: string): string => {
    let dataId = "";
    apply((p) => {
      const res = addLinkedTable(p, resultsId, table, name, newId);
      if (!res) return p;
      dataId = res.dataId;
      return res.project;
    });
    if (dataId) select(dataId);
    return dataId;
  }, [apply, select, resultsId]);
  return { outputs, create };
}
