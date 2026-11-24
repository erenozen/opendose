// What the Checks row of a results headline counts and discloses
// (ResultsChecks.tsx): the guidance, the plan check, the callout.
import { useMemo } from "react";
import { useProject } from "../app/context";
import type { DataSheet, ResultsSheet } from "../project/types";
import { useResultsGuidance } from "../guide/useResultsGuidance";
import { planCheckState } from "./planState";
import { legendGraph } from "../report/legendFor";
import { barAxisChip } from "../sheets/column/barAxis";
import { equivalenceChip } from "../report/equivalence";
import { findSexFactor, sexChip } from "../guide/sex";
import { dispersionChip } from "../sheets/multivariable/dispersion";
import { equalSlopesChip } from "../sheets/multivariable/ancova";
import { binomialDispersionChip, firthChip } from "../sheets/multivariable/glm";
import { proportionalOddsChip } from "../sheets/multivariable/ordinal";

export interface Counts { ok: number; warn: number; info: number; questions: number }

export function useChecks({ sheet, data, result, options, readOnly }: {
  sheet: ResultsSheet; data: DataSheet; result: unknown; options: unknown; readOnly: boolean;
}) {
  const { project } = useProject();
  const base = useResultsGuidance({ analysisId: sheet.analysis, tableType: data.table.type,
    table: data.table, options, result, dataId: data.id, resultsId: sheet.id, readOnly });
  // The bar graph bound to these results, when its value axis hides zero
  // (sheets/column/barAxis.ts).
  const graph = useMemo(() => legendGraph(project.sheets, sheet.id, data.id),
    [project.sheets, sheet.id, data.id]);
  const g = useMemo(() => {
    const chip = graph && result ? barAxisChip(graph) : null;
    // the equivalence margin, and when it was chosen (report/equivalence.ts)
    const margin = equivalenceChip(result);
    // rows, data sets or a column that look like sex: asked, not assumed (guide/sex.ts)
    const sf = result ? findSexFactor(data.table) : null;
    const sex = sf ? sexChip(sf, data.table, sheet.analysis, options) : null;
    // overdispersed counts: quasi-Poisson in one click (sheets/multivariable/dispersion.ts)
    const dispersion = dispersionChip(sheet.analysis, result, sheet.id);
    // ANCOVA's equal-slopes check (sheets/multivariable/ancova.ts)
    const slopes = equalSlopesChip(sheet.analysis, result);
    // binomial regression's dispersion check and Firth's shrinkage (sheets/multivariable/glm.ts)
    const binomial = binomialDispersionChip(sheet.analysis, result, sheet.id);
    const firth = firthChip(sheet.analysis, result);
    // ordinal regression's proportional-odds check (sheets/multivariable/ordinal.ts)
    const po = proportionalOddsChip(sheet.analysis, result);
    const extra = [chip, margin, sex, dispersion, slopes, binomial, firth, po].filter((c) => c !== null);
    return extra.length ? { ...base, chips: [...base.chips, ...extra] } : base;
  }, [base, graph, result, data.table, sheet.analysis, sheet.id, options]);
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

