// "Convert replicates to Mean, SD, N" (and between summary formats): a
// new table computed through the engine's summary_convert handler.
import type { EngineBridge } from "../../lib/engine";
import { normalizeTable, numericData, type FlatColumn } from "../../project/table";
import {
  SUBCOLUMN_FORMAT_ENGINE, SUBCOLUMN_FORMAT_TITLES, type DataTableModel,
  type SubcolumnFormat,
} from "../../project/types";

/** Targets reachable from `from`. Replicates can become any summary
 *  format; a summary format can become any other except the CI format
 *  (no t distribution in the browser) and never back into replicates. */
export function conversionTargets(from: SubcolumnFormat): SubcolumnFormat[] {
  const all: SubcolumnFormat[] = ["mean_sd_n", "mean_sem_n", "mean_cv_n", "mean_ci_n",
    "mean_sd", "mean_sem", "mean_cv", "mean_pm", "upper_lower"];
  if (from === "replicates") return all;
  return all.filter((f) => f !== from && f !== "mean_ci_n");
}

const cell = (v: unknown): string => {
  if (typeof v !== "number" || !Number.isFinite(v)) return "";
  return String(Number(v.toPrecision(12)));
};

interface RowSummary { mean: number | null; sd: number | null; sem: number | null;
  n: number | null }

function rowFor(target: SubcolumnFormat, s: RowSummary): (number | null)[] {
  const { mean: m, sd, sem, n } = s;
  if (m === null) return SUBCOLUMN_FORMAT_TITLES[target].map(() => null);
  const cv = sd !== null && m !== 0 ? (100 * sd) / Math.abs(m) : null;
  switch (target) {
    case "mean_sd_n": return [m, sd, n];
    case "mean_sem_n": return [m, sem, n];
    case "mean_cv_n": return [m, cv, n];
    case "mean_sd": return [m, sd];
    case "mean_sem": return [m, sem];
    case "mean_cv": return [m, cv];
    case "mean_pm": return [m, sd, sd];
    case "upper_lower": return [m, sd !== null ? m + sd : null, sd !== null ? m - sd : null];
    default: return [m];
  }
}

/** The table converted to `target`, same X, row titles and dataset names.
 *  Excluded values are left out of the summaries. */
export function convertTable(engine: EngineBridge, t: DataTableModel,
  target: SubcolumnFormat): DataTableModel {
  const data = numericData(t);
  const from = t.subcolumnFormat;
  let rows: (number | null)[][][];
  if (from === "replicates") {
    const res = engine.analyze({
      analysis: "summary_convert",
      data: { format: "replicates", x: data.x,
        datasets: data.datasets.map((d) => ({ name: d.name, rows: d.ys })) },
      options: { collapse_to: SUBCOLUMN_FORMAT_ENGINE[target], collapse_kind: "sd" },
    }) as { error?: string; collapsed?: { datasets: { rows: (number | null)[][] }[] } };
    if (res.error || !res.collapsed) throw new Error(res.error ?? "conversion failed");
    rows = res.collapsed.datasets.map((d) => d.rows);
  } else {
    const res = engine.analyze({
      analysis: "summary_convert",
      data: { format: SUBCOLUMN_FORMAT_ENGINE[from],
        datasets: data.datasets.map((d) => ({ name: d.name, rows: d.ys })) },
      options: {},
    }) as { error?: string; datasets?: { rows: RowSummary[] }[] };
    if (res.error || !res.datasets) throw new Error(res.error ?? "conversion failed");
    rows = res.datasets.map((d) => d.rows.map((s) => rowFor(target, s)));
  }
  const titles = SUBCOLUMN_FORMAT_TITLES[target];
  return normalizeTable({
    ...t,
    subcolumnFormat: target,
    datasets: t.datasets.map((d, i) => ({
      name: d.name,
      subTitles: [...titles],
      rows: t.x.map((_, r) => {
        const src = rows[i]?.[r] ?? [];
        return titles.map((_, s) => cell(src[s]));
      }),
    })),
  }, t.type);
}

/** A grid column's name for menus and the Data Inspector. */
export function columnLabel(t: DataTableModel, c: FlatColumn): string {
  if (c.kind === "x") return t.xTitle && t.xTitle !== "X" ? `X (${t.xTitle})` : "X";
  if (c.kind === "rowTitle") return "Row titles";
  const d = t.datasets[c.dataset];
  const multi = (d?.rows[0]?.length ?? 1) > 1;
  return multi ? `${d.name}: ${d.subTitles?.[c.sub] || `Y${c.sub + 1}`}` : d?.name ?? "";
}
