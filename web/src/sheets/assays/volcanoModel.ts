// Volcano plot from an imported table (a DESeq2 / limma / proteomics
// export in a multiple-variables table): which columns hold the name,
// the fold change and the P value; thresholds; optional FDR adjustment;
// classification into up / down / not significant; top-N labels; the
// hits as a table. Pure (no React).
import { normalizeTable, parseCell, withExclusionsBlanked } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";

export const A_VOLCANO = "volcano_table";
export const G_VOLCANO = "volcano_table_graph";

export type FdrMethod = "none" | "bh" | "bky" | "by" | "holm_sidak" | "bonferroni";
export const FDR_LABEL: Record<FdrMethod, string> = {
  none: "None (use the P values as they are)",
  bh: "Benjamini-Hochberg FDR",
  bky: "Two-stage step-up FDR (Benjamini, Krieger & Yekutieli)",
  by: "Benjamini-Yekutieli FDR",
  holm_sidak: "Holm-Šídák (family-wise)",
  bonferroni: "Bonferroni (family-wise)",
};

export interface VolcanoOptions {
  name: string;
  fc: string;
  /** "log2": the column is log2 fold change; "ratio": a plain fold change. */
  fcScale: "log2" | "ratio";
  p: string;
  /** The P column is already adjusted (padj, q value). */
  pAdjusted: boolean;
  fdr: FdrMethod;
  fcThreshold: string;
  alpha: string;
  topN: string;
}

const NAME_RE = /^(gene|genes|gene[ _]?name|gene[ _]?symbol|symbol|name|protein|protein[ _]?id|id|feature|probe|transcript|metabolite|accession)$/i;
const LOG2_RE = /^(log2[ _.]?(fold[ _.]?change|fc|ratio)|logfc|log2fc|log[ _]?fc|l2fc|log2foldchange)$/i;
const FC_RE = /^(fold[ _.]?change|fc|ratio|fold)$/i;
const PADJ_RE = /^(padj|p[ _.]?adj|adj[ _.]?p([ _.]?val(ue)?)?|fdr|q[ _.]?val(ue)?|q)$/i;
const P_RE = /^(p[ _.]?val(ue)?|pvalue|p|p[ _.]?value|pval)$/i;

export function guessVolcano(table: DataTableModel): Pick<VolcanoOptions, "name" | "fc" | "fcScale" | "p" | "pAdjusted"> {
  const names = table.datasets.map((d, i) => d.name.trim() || `Variable ${i + 1}`);
  const find = (re: RegExp) => names.find((n) => re.test(n.trim())) ?? "";
  const cat = names.find((_, i) => table.datasets[i].varType === "categorical") ?? "";
  const log2 = find(LOG2_RE);
  const fc = log2 || find(FC_RE);
  const praw = find(P_RE);
  const padj = find(PADJ_RE);
  const numeric = names.filter((_, i) => table.datasets[i].varType !== "categorical");
  return {
    name: find(NAME_RE) || cat,
    fc: fc || numeric[0] || "",
    fcScale: !log2 && fc ? "ratio" : "log2",
    p: praw || padj || numeric.find((n) => n !== (fc || numeric[0])) || "",
    pAdjusted: !praw && !!padj,
  };
}

const obj = (raw: unknown) => (raw && typeof raw === "object" ? raw as Record<string, unknown> : {});
const str = (v: unknown, d: string) => (typeof v === "string" ? v : d);

export function normalizeVolcano(raw: unknown, table: DataTableModel): VolcanoOptions {
  const o = obj(raw);
  const g = guessVolcano(table);
  const fdrs = Object.keys(FDR_LABEL) as FdrMethod[];
  return {
    name: str(o.name, g.name),
    fc: str(o.fc, g.fc),
    fcScale: o.fcScale === "ratio" || o.fcScale === "log2" ? o.fcScale : g.fcScale,
    p: str(o.p, g.p),
    pAdjusted: typeof o.pAdjusted === "boolean" ? o.pAdjusted : g.pAdjusted,
    fdr: typeof o.fdr === "string" && (fdrs as string[]).includes(o.fdr) ? o.fdr as FdrMethod : "bh",
    fcThreshold: str(o.fcThreshold, "1"),
    alpha: str(o.alpha, "0.05"),
    topN: str(o.topN, "10"),
  };
}

export interface VolcanoRow {
  name: string;
  row: number;
  log2fc: number;
  p: number;
}

export function volcanoRows(table: DataTableModel, o: VolcanoOptions): { rows: VolcanoRow[]; omitted: number; error?: string } {
  const t = withExclusionsBlanked(table);
  const names = t.datasets.map((d, i) => d.name.trim() || `Variable ${i + 1}`);
  const fi = names.indexOf(o.fc);
  const pi = names.indexOf(o.p);
  const ni = o.name ? names.indexOf(o.name) : -1;
  if (fi < 0 || pi < 0) {
    return { rows: [], omitted: 0, error: "Choose the columns holding the fold change and the P value" };
  }
  const rows: VolcanoRow[] = [];
  let omitted = 0;
  for (let r = 0; r < t.x.length; r++) {
    const fcRaw = parseCell(t.datasets[fi].rows[r]?.[0] ?? "");
    const p = parseCell(t.datasets[pi].rows[r]?.[0] ?? "");
    const label = ni >= 0 ? (t.datasets[ni].rows[r]?.[0] ?? "").trim() : "";
    const hasAny = fcRaw !== null || p !== null;
    if (fcRaw === null || p === null || p < 0 || p > 1 || (o.fcScale === "ratio" && fcRaw <= 0)) {
      if (hasAny) omitted++;
      continue;
    }
    rows.push({
      name: label || t.rowTitles[r]?.trim() || `Row ${r + 1}`,
      row: r,
      log2fc: o.fcScale === "ratio" ? Math.log2(fcRaw) : fcRaw,
      p,
    });
  }
  return { rows, omitted };
}

export type Status = "up" | "down" | "ns";

export interface Classified extends VolcanoRow {
  /** Adjusted P (null when no adjustment is applied). */
  q: number | null;
  /** The value compared with alpha (adjusted when there is one). */
  sig: number;
  status: Status;
  top: boolean;
}

/** Up / down / not significant, and the top-N labels (the most
 *  significant hits, ties broken by the larger fold change). */
export function classify(rows: VolcanoRow[], adjusted: (number | null)[] | null,
  o: VolcanoOptions): { rows: Classified[]; counts: Record<Status, number> } {
  const t = Math.abs(parseCell(o.fcThreshold) ?? 1);
  const alpha = parseCell(o.alpha) ?? 0.05;
  const n = Math.max(0, Math.round(parseCell(o.topN) ?? 10));
  const out: Classified[] = rows.map((r, i) => {
    const q = adjusted ? adjusted[i] ?? null : null;
    const sig = q ?? r.p;
    const status: Status = sig < alpha && r.log2fc >= t && r.log2fc !== 0 ? "up"
      : sig < alpha && r.log2fc <= -t && r.log2fc !== 0 ? "down" : "ns";
    return { ...r, q, sig, status, top: false };
  });
  const hits = out.filter((r) => r.status !== "ns")
    .sort((a, b) => a.sig - b.sig || Math.abs(b.log2fc) - Math.abs(a.log2fc));
  hits.slice(0, n).forEach((r) => { r.top = true; });
  const counts = { up: 0, down: 0, ns: 0 };
  out.forEach((r) => { counts[r.status]++; });
  return { rows: out, counts };
}

/** The hits (up and down) as a multiple-variables table, most significant
 *  first. */
export function hitsTable(rows: Classified[], adjusted: boolean): DataTableModel {
  const hits = rows.filter((r) => r.status !== "ns").sort((a, b) => a.sig - b.sig);
  const num = (v: number | null) => (v === null ? "" : String(Number(v.toPrecision(10))));
  return normalizeTable({
    type: "multivariable",
    rowTitles: hits.map(() => ""),
    datasets: [
      { name: "Name", varType: "categorical", rows: hits.map((r) => [r.name]) },
      { name: "log2 fold change", varType: "continuous", rows: hits.map((r) => [num(r.log2fc)]) },
      { name: "P", varType: "continuous", rows: hits.map((r) => [num(r.p)]) },
      ...(adjusted ? [{ name: "Adjusted P", varType: "continuous" as const, rows: hits.map((r) => [num(r.q)]) }] : []),
      { name: "Direction", varType: "categorical", rows: hits.map((r) => [r.status === "up" ? "up" : "down"]) },
    ],
  });
}
