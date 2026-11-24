// The assay modules whose "What this means" readers (report/meaningAssays.ts,
// P-69) are pinned on recorded engine results that analysedCases.ts does
// not hold: growth curves, drug combination synergy, area under the curve,
// the volcano table and clustering, each on its module's example (the
// table and settings "Start from an assay" creates). Each run makes the
// engine calls its module's run makes (growth.ts runGrowth, synergy.ts,
// auc.ts, volcano.ts runVolcano, cluster.ts runCluster), from the model
// files those use: the module files themselves import React panels.
// Shared by the generator (assayMeaning.gen.ts, which runs the engine
// natively) and the unit test (meaningAssays.test.ts, which replays them).
import { parseCell } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";
import {
  ANALYSIS_GROWTH, doublingTime, growthTransformPayload, normalizeGrowth,
} from "../../sheets/assays/growthModel.ts";
import { growthSample } from "../../sheets/assays/growthSample.ts";
import { A_SYNERGY, normalizeSynergy, synergyPayload } from "../../sheets/assays/synergyModel.ts";
import { synergySample } from "../../sheets/assays/synergySample.ts";
import { ANALYSIS_AUC, aucPayload, normalizeAuc } from "../../sheets/assays/aucModel.ts";
import { aucSample } from "../../sheets/assays/aucSample.ts";
import { A_VOLCANO, classify, normalizeVolcano, volcanoRows } from "../../sheets/assays/volcanoModel.ts";
import { volcanoSample } from "../../sheets/assays/volcanoSample.ts";
import { A_CLUSTER, clusterMatrix, clusterPayload, normalizeCluster } from "../../sheets/assays/clusterModel.ts";
import { clusterSample } from "../../sheets/assays/clusterSample.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Analyze = (p: unknown) => any;

export interface MeaningCase {
  key: string;
  analysisId: string;
  table: DataTableModel;
  options: unknown;
  run: (analyze: Analyze) => unknown;
}

export const MEANING_FIXTURE_FILE = "assay-meaning.fixtures.json";

export function meaningCases(): MeaningCase[] {
  const out: MeaningCase[] = [];
  {
    const t = growthSample();
    const o = normalizeGrowth({});
    out.push({ key: "growth_example", analysisId: ANALYSIS_GROWTH, table: t, options: o, run: (a) => {
      const prep = a(growthTransformPayload(t, o));
      if (prep.error) return { analysis: "dose_response", datasets: [], error: prep.error };
      const fit = a({ analysis: "dose_response", data: { x: prep.x, datasets: prep.datasets },
        options: { model: o.model, error_bars: "sd" } });
      if (fit.error) return { analysis: "dose_response", datasets: [], error: fit.error };
      const doubling = fit.datasets.map((d: any) => (d.fit ? doublingTime(o.model, d.fit.params, o.log) : null));
      return { ...fit, prep, doubling };
    } });
  }
  {
    const t = synergySample();
    const o = normalizeSynergy({ drug1: "Ispinesib", drug2: "Ibrutinib", unit: "nM", responseKind: "viability" }, t);
    out.push({ key: "synergy_example", analysisId: A_SYNERGY, table: t, options: o, run: (a) => {
      const p = synergyPayload(t, o);
      if ("error" in p && !("analysis" in p)) return { error: p.error };
      return a(p);
    } });
  }
  {
    const t = aucSample();
    const o = normalizeAuc({ replicates: "experiments" });
    out.push({ key: "auc_example", analysisId: ANALYSIS_AUC, table: t, options: o, run: (a) => a(aucPayload(t, o)) });
  }
  {
    const t = volcanoSample();
    const o = normalizeVolcano({}, t);
    out.push({ key: "volcano_example", analysisId: A_VOLCANO, table: t, options: o, run: (a) => {
      const { rows, omitted, error } = volcanoRows(t, o);
      if (error) return { error };
      let adjusted: (number | null)[] | null = null;
      if (!o.pAdjusted && o.fdr !== "none") {
        const r = a({ analysis: "fdr_adjust", data: { p_values: rows.map((x) => x.p), labels: rows.map((x) => x.name) },
          options: { method: o.fdr, alpha: parseCell(o.alpha) ?? 0.05, q: parseCell(o.alpha) ?? 0.05 } });
        if (r.error) return { error: r.error };
        adjusted = r.adjusted ?? null;
      }
      const c = classify(rows, adjusted, o);
      return { rows: c.rows, counts: c.counts, omitted, adjusted: !!adjusted || o.pAdjusted,
        method: o.pAdjusted ? "given" : o.fdr };
    } });
  }
  {
    const t = clusterSample();
    const o = normalizeCluster({ kRows: "3" }, t);
    out.push({ key: "cluster_example", analysisId: A_CLUSTER, table: t, options: o, run: (a) => {
      const m = clusterMatrix(t, o);
      if (m.error) return { error: m.error };
      const r = a(clusterPayload(m, o));
      return r.error ? r : { ...r, matrixInput: m };
    } });
  }
  return out;
}
