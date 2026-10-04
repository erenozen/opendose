// Drug-combination synergy: the combination-matrix layout (a grouped
// table: drug 1 concentrations as row titles, drug 2 concentrations as
// data-set titles, response cells, replicate matrices as subcolumns) or
// long records in a multiple-variables table; options; the engine
// payload; pasting a matrix. Pure (no React).
import { normalizeTable, parseCell, withExclusionsBlanked } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";

export const A_SYNERGY = "synergy_matrix";
export const G_SYN_LANDSCAPE = "synergy_landscape";
export const G_SYN_MONO = "synergy_mono";
export const G_SYN_FACI = "synergy_fa_ci";

export type SynergyModel = "hsa" | "bliss" | "loewe" | "zip";
export const SYNERGY_MODELS: SynergyModel[] = ["hsa", "bliss", "loewe", "zip"];
export const MODEL_LABEL: Record<SynergyModel, string> = {
  hsa: "HSA", bliss: "Bliss", loewe: "Loewe", zip: "ZIP",
};
export const MODEL_LONG: Record<SynergyModel, string> = {
  hsa: "Highest single agent",
  bliss: "Bliss independence",
  loewe: "Loewe additivity",
  zip: "Zero interaction potency",
};

export interface SynergyColumns { conc1: string; conc2: string; response: string; replicate: string }

export interface SynergyOptions {
  drug1: string;
  drug2: string;
  unit: string;
  responseKind: "viability" | "inhibition";
  baselineCorrection: "none" | "part" | "all";
  models: Record<SynergyModel, boolean>;
  columns: SynergyColumns;
}

export const DEFAULT_SYNERGY: SynergyOptions = {
  drug1: "Drug 1",
  drug2: "Drug 2",
  unit: "",
  responseKind: "viability",
  baselineCorrection: "none",
  models: { hsa: true, bliss: true, loewe: true, zip: true },
  columns: { conc1: "", conc2: "", response: "", replicate: "" },
};

const CONC1_RE = /^(conc|concentration|dose)[ _]?(1|a)$|^(drug|d)[ _]?1[ _]?(conc|dose)?$|^conc_?r$/i;
const CONC2_RE = /^(conc|concentration|dose)[ _]?(2|b)$|^(drug|d)[ _]?2[ _]?(conc|dose)?$|^conc_?c$/i;
const RESP_RE = /^(response|viability|inhibition|value|signal|% ?viability|% ?inhibition)$/i;
const REP_RE = /^(replicate|rep|block|block_id|plate)$/i;

export function guessSynergyColumns(table: DataTableModel): SynergyColumns {
  const names = table.datasets.map((d, i) => d.name.trim() || `Variable ${i + 1}`);
  const find = (re: RegExp) => names.find((n) => re.test(n)) ?? "";
  const numeric = names.filter((_, i) => table.datasets[i].varType !== "categorical");
  const c1 = find(CONC1_RE) || numeric[0] || "";
  const c2 = find(CONC2_RE) || numeric.find((n) => n !== c1) || "";
  const resp = find(RESP_RE) || numeric.find((n) => n !== c1 && n !== c2) || "";
  return { conc1: c1, conc2: c2, response: resp, replicate: find(REP_RE) };
}

const obj = (raw: unknown) => (raw && typeof raw === "object" ? raw as Record<string, unknown> : {});
const str = (v: unknown, d: string) => (typeof v === "string" ? v : d);

export function normalizeSynergy(raw: unknown, table: DataTableModel): SynergyOptions {
  const o = obj(raw);
  const d = DEFAULT_SYNERGY;
  const m = obj(o.models);
  const c = obj(o.columns);
  const guess = table.type === "multivariable" ? guessSynergyColumns(table) : d.columns;
  return {
    drug1: str(o.drug1, d.drug1),
    drug2: str(o.drug2, d.drug2),
    unit: str(o.unit, d.unit),
    responseKind: o.responseKind === "inhibition" ? "inhibition" : "viability",
    baselineCorrection: o.baselineCorrection === "part" || o.baselineCorrection === "all"
      ? o.baselineCorrection : "none",
    models: Object.fromEntries(SYNERGY_MODELS.map((k) =>
      [k, typeof m[k] === "boolean" ? m[k] : true])) as Record<SynergyModel, boolean>,
    columns: {
      conc1: str(c.conc1, guess.conc1), conc2: str(c.conc2, guess.conc2),
      response: str(c.response, guess.response), replicate: str(c.replicate, guess.replicate),
    },
  };
}

/** A concentration typed as a title: "10", "1e-3", "10 nM" → the number. */
export function concOf(s: string): number | null {
  const m = /^\s*(-?\d*\.?\d+(?:e[-+]?\d+)?)/i.exec(s);
  return m ? Number(m[1]) : null;
}

export type SynergyPayload =
  | { error: string }
  | { data: Record<string, unknown>; nReplicates: number };

/** Engine data for the synergy handler. */
export function synergyData(table: DataTableModel, o: SynergyOptions): SynergyPayload {
  const t = withExclusionsBlanked(table);
  if (t.type === "multivariable") {
    const names = t.datasets.map((d, i) => d.name.trim() || `Variable ${i + 1}`);
    const idx = (n: string) => (n ? names.indexOf(n) : -1);
    const [i1, i2, ir, ip] = [idx(o.columns.conc1), idx(o.columns.conc2),
      idx(o.columns.response), idx(o.columns.replicate)];
    if (i1 < 0 || i2 < 0 || ir < 0) {
      return { error: "Choose the variables holding each drug's concentration and the response" };
    }
    const cell = (k: number, r: number) => (t.datasets[k]?.rows[r]?.[0] ?? "").trim();
    const records: Record<string, unknown>[] = [];
    const reps = new Set<string>();
    for (let r = 0; r < t.x.length; r++) {
      const c1 = parseCell(cell(i1, r));
      const c2 = parseCell(cell(i2, r));
      const v = parseCell(cell(ir, r));
      if (c1 === null || c2 === null || v === null) continue;
      const rec: Record<string, unknown> = { conc1: c1, conc2: c2, response: v };
      if (ip >= 0 && cell(ip, r)) { rec.replicate = cell(ip, r); reps.add(cell(ip, r)); }
      records.push(rec);
    }
    if (!records.length) return { error: "No complete rows (both concentrations and the response)" };
    return { data: { records }, nReplicates: Math.max(1, reps.size) };
  }
  if (t.type !== "grouped") {
    return { error: "Use a grouped table (drug 1 as rows, drug 2 as columns) or long records" };
  }
  const c1 = t.rowTitles.map(concOf);
  const c2 = t.datasets.map((d) => concOf(d.name));
  const badRows = t.rowTitles.filter((_, i) => c1[i] === null);
  const badCols = t.datasets.filter((_, j) => c2[j] === null).map((d) => d.name || "(untitled)");
  if (badRows.length || badCols.length) {
    return { error: "Every row title must be a drug 1 concentration and every data-set title a drug 2 "
      + `concentration (0 for the drug alone). Not a number: ${[...badRows.map((r) => `row “${r}”`),
        ...badCols.map((c) => `column “${c}”`)].slice(0, 6).join(", ")}` };
  }
  const width = Math.max(1, ...t.datasets.flatMap((d) => d.rows.map((r) => r.length)));
  const mats: (number | null)[][][] = [];
  for (let k = 0; k < width; k++) {
    const m = t.rowTitles.map((_, i) => t.datasets.map((d) => parseCell(d.rows[i]?.[k] ?? "")));
    if (m.some((row) => row.some((v) => v !== null))) mats.push(m);
  }
  if (!mats.length) return { error: "The matrix is empty" };
  return {
    data: { conc1: c1, conc2: c2, responses: mats.length === 1 ? mats[0] : mats },
    nReplicates: mats.length,
  };
}

export function synergyPayload(table: DataTableModel, o: SynergyOptions): Record<string, unknown> | { error: string } {
  const d = synergyData(table, o);
  if ("error" in d) return d;
  return {
    analysis: "synergy",
    data: d.data,
    options: {
      response_kind: o.responseKind,
      baseline_correction: o.baselineCorrection,
      drug1: o.drug1.trim() || "Drug 1",
      drug2: o.drug2.trim() || "Drug 2",
    },
  };
}

/** SynergyFinder's reading of a summary score (Ianevski et al. 2020). */
export function scoreReading(score: number | null | undefined): string {
  if (typeof score !== "number" || !Number.isFinite(score)) return "n/a";
  if (score > 10) return "likely synergistic";
  if (score < -10) return "likely antagonistic";
  return "likely additive";
}

/** A pasted matrix: the first row holds drug 2 concentrations (its first
 *  cell is a label or blank), the first column drug 1 concentrations;
 *  replicate matrices follow, separated by blank lines. */
export function parseMatrixBlocks(text: string): { conc1: string[]; conc2: string[]; reps: string[][][] } | { error: string } {
  const blocks = text.replace(/\r/g, "").split(/\n\s*\n/).map((b) => b.split("\n")
    .filter((l) => l.trim()).map((l) => l.split(l.includes("\t") ? "\t" : /[,;]\s*|\s+/)
      .map((c) => c.trim())));
  const used = blocks.filter((b) => b.length >= 2);
  if (!used.length) return { error: "Paste at least a header row of drug 2 concentrations and one row" };
  const head = used[0][0];
  // A header without its corner label (one cell shorter than the rows)
  // starts with the first concentration.
  const conc2 = head.length < used[0][1].length ? head : head.slice(1);
  const conc1 = used[0].slice(1).map((r) => r[0]);
  const reps: string[][][] = [];
  for (const b of used) {
    const rows = b.slice(1);
    if (rows.length !== conc1.length) {
      return { error: "Every replicate block needs the same rows as the first one" };
    }
    reps.push(rows.map((r) => conc2.map((_, j) => r[j + 1] ?? "")));
  }
  return { conc1, conc2, reps };
}

/** The grouped table for a combination matrix (replicates as subcolumns). */
export function synergyTable(conc1: string[], conc2: string[], reps: string[][][],
  yTitle = "Viability (%)"): DataTableModel {
  return normalizeTable({
    type: "grouped",
    yTitle,
    rowTitles: conc1,
    x: conc1.map(() => ""),
    datasets: conc2.map((c, j) => ({
      name: c,
      rows: conc1.map((_, i) => reps.map((m) => m[i]?.[j] ?? "")),
    })),
  });
}
