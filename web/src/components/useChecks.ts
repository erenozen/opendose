// What the Checks row of a results headline counts and discloses
// (ResultsChecks.tsx): the guidance, the plan check, the callout.
import { useMemo } from "react";
import { useProject } from "../app/context";
import type { DataSheet, ResultsSheet } from "../project/types";
import { useResultsGuidance } from "../guide/useResultsGuidance";
import { planCheckState } from "./planState";

export interface Counts { ok: number; warn: number; info: number; questions: number }

export function useChecks({ sheet, data, result, options, readOnly }: {
  sheet: ResultsSheet; data: DataSheet; result: unknown; options: unknown; readOnly: boolean;
}) {
  const { project } = useProject();
  const g = useResultsGuidance({ analysisId: sheet.analysis, tableType: data.table.type,
    table: data.table, options, result, dataId: data.id, resultsId: sheet.id, readOnly });
  const plan = useMemo(() => planCheckState(project, sheet, data), [project, sheet, data]);
  // The callout: the first warning note (resultBanners lists them by
  // severity within each kind of result).
  const callout = g.banners.find((b) => b.tone === "warn") ?? null;
  const counts = useMemo<Counts>(() => {
    const c: Counts = { ok: 0, warn: 0, info: 0, questions: g.question ? 1 : 0 };
    for (const chip of g.chips) {
      if (chip.state === "ok") c.ok++;
      else if (chip.state === "info") c.info++;
      else c.warn++;
    }
    for (const b of g.banners) c[b.tone === "warn" ? "warn" : "info"]++;
    if (plan) c[plan]++;
    return c;
  }, [g.chips, g.banners, g.question, plan]);
  return { guidance: g, callout, counts };
}

