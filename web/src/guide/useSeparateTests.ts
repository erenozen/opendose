// Which "separate tests per group" facts (guide/interaction.ts) apply to
// the results sheet shown.
import { useMemo } from "react";
import { useProject } from "../app/context";
import { findSheet } from "../project/ops";
import { separateColumnTests, separateRowTests, type SeparateTests } from "./interaction";

export function useSeparateTests(dataId: string | undefined, resultsId: string | undefined,
  result: unknown): SeparateTests | null {
  const { project } = useProject();
  return useMemo(() => {
    if (!dataId || !resultsId) return null;
    const sheet = findSheet(project, resultsId);
    if (sheet?.kind !== "results") return null;
    if (sheet.analysis === "column") return separateColumnTests(project, dataId, resultsId);
    return separateRowTests(sheet, result);
  }, [project, dataId, resultsId, result]);
}
