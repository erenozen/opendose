// Volcano plot from a table of results (DESeq2, limma, edgeR or any list
// with a fold change and a P value per row): which columns to use, the
// thresholds, and the classification of each row as up, down or not
// significant, with the rows to label. Pure.
import type { MvValue, VarInfo } from "./model.ts";

export const ROW_TITLE_KEY = "__row_title__";

/** Format graph's data sets of a volcano plot (index = trace tag). */
export const VOLCANO_GROUPS = ["Down", "Up", "Not significant"];

export interface VolcanoSettings {
  /** Fold-change variable and whether it is already log2. */
  fc: string;
  fcLog2: boolean;
  /** P-value variable and whether it holds P (or −log10 P already). */
  p: string;
  pIsNegLog: boolean;
  /** Label variable (categorical, or the row titles). */
  label: string;
  /** |log2 fold change| at or above this counts as changed. */
  fcThreshold: string;
  /** P (or adjusted P) below this counts as significant. */
  pThreshold: string;
  /** Label the N most significant changed rows (0 = none). */
  topN: string;
}

const find = (info: VarInfo[], res: RegExp[], kind?: "continuous" | "categorical") => {
  for (const re of res) {
    const v = info.find((x) => (!kind || x.kind === kind) && re.test(x.name));
    if (v) return v.name;
  }
  return "";
};

/** Columns guessed from their names (log2FoldChange, logFC, padj, P.Value,
 *  FDR, gene …), falling back to the first continuous variables. */
export function volcanoDefaults(info: VarInfo[]): VolcanoSettings {
  const cont = info.filter((v) => v.kind === "continuous");
  const log2 = find(info, [/log2.?f(old)?.?c(hange)?/i, /^log.?fc$/i, /log2.?ratio/i], "continuous");
  const fcRaw = find(info, [/fold.?change/i, /^fc$/i, /ratio/i], "continuous");
  const fc = log2 || fcRaw || cont.find((v) => !v.binary)?.name || cont[0]?.name || "";
  const negLog = find(info, [/^-?log10.?p/i, /neg.?log/i], "continuous");
  const p = find(info, [/^p.?adj/i, /adj.?p/i, /^fdr$/i, /^q.?val/i, /^p.?val/i, /^pvalue$/i, /^p$/i],
    "continuous") || negLog || cont.find((v) => v.name !== fc)?.name || "";
  const label = find(info, [/gene/i, /symbol/i, /name/i, /^id$/i, /protein/i], "categorical")
    || info.find((v) => v.kind === "categorical")?.name || ROW_TITLE_KEY;
  return {
    fc, fcLog2: !fcRaw || !!log2, p, pIsNegLog: !!negLog && p === negLog, label,
    fcThreshold: "1", pThreshold: "0.05", topN: "10",
  };
}

export type VolcanoClass = "up" | "down" | "ns";

export interface VolcanoPoint {
  row: number;
  x: number;        // log2 fold change
  y: number;        // −log10 P
  p: number;
  label: string;
  cls: VolcanoClass;
}

const num = (s: string, d: number) => {
  const v = Number(s.trim());
  return s.trim() !== "" && Number.isFinite(v) ? v : d;
};

/** Points of the plot: rows with a usable fold change and P. */
export function volcanoPoints(fcVals: MvValue[], pVals: MvValue[], labels: string[],
  s: VolcanoSettings): { points: VolcanoPoint[]; fcT: number; pT: number; dropped: number } {
  const fcT = Math.abs(num(s.fcThreshold, 1));
  const pT = Math.min(1, Math.max(1e-300, num(s.pThreshold, 0.05)));
  const points: VolcanoPoint[] = [];
  let dropped = 0;
  fcVals.forEach((f, r) => {
    const q = pVals[r];
    if (typeof f !== "number" || typeof q !== "number") { if (f !== null || q !== null) dropped++; return; }
    const x = s.fcLog2 ? f : f > 0 ? Math.log2(f) : NaN;
    const p = s.pIsNegLog ? 10 ** -q : q;
    const y = s.pIsNegLog ? q : -Math.log10(q);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !(p > 0) || p > 1) { dropped++; return; }
    const sig = p < pT && Math.abs(x) >= fcT;
    points.push({ row: r, x, y, p, label: labels[r] ?? `Row ${r + 1}`,
      cls: sig ? (x > 0 ? "up" : "down") : "ns" });
  });
  return { points, fcT, pT, dropped };
}

/** The N most significant changed points (smallest P, then largest |x|). */
export function topPoints(points: VolcanoPoint[], n: number): VolcanoPoint[] {
  if (!(n > 0)) return [];
  return points.filter((p) => p.cls !== "ns")
    .sort((a, b) => a.p - b.p || Math.abs(b.x) - Math.abs(a.x)).slice(0, Math.floor(n));
}
