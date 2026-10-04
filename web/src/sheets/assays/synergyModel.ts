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

// ------------------------------------------------------------ matrices

/** One dose × dose matrix of a synergy result: the observed response,
 *  each model's expected (reference) response, the ZIP-fitted response,
 *  or a model's synergy (observed − expected; ZIP: fitted − expected). */
export type MatrixView =
  | "observed" | "hsa_expected" | "bliss_expected" | "loewe_expected" | "zip_expected" | "zip_fitted"
  | "hsa_synergy" | "bliss_synergy" | "loewe_synergy" | "zip_synergy";

export interface MatrixViewDef {
  key: MatrixView;
  label: string;
  /** "response": % inhibition (sequential scale); "synergy": a difference
   *  around 0 (diverging scale). */
  kind: "response" | "synergy";
  model: SynergyModel | null;
}

export const MATRIX_VIEWS: MatrixViewDef[] = [
  { key: "observed", label: "Observed response (% inhibition)", kind: "response", model: null },
  { key: "hsa_expected", label: "HSA expected response", kind: "response", model: "hsa" },
  { key: "bliss_expected", label: "Bliss expected response", kind: "response", model: "bliss" },
  { key: "loewe_expected", label: "Loewe expected response", kind: "response", model: "loewe" },
  { key: "zip_expected", label: "ZIP expected response (from the monotherapy fits)", kind: "response", model: "zip" },
  { key: "zip_fitted", label: "ZIP fitted response (dose-response slices)", kind: "response", model: "zip" },
  { key: "hsa_synergy", label: "HSA synergy", kind: "synergy", model: "hsa" },
  { key: "bliss_synergy", label: "Bliss synergy", kind: "synergy", model: "bliss" },
  { key: "loewe_synergy", label: "Loewe synergy", kind: "synergy", model: "loewe" },
  { key: "zip_synergy", label: "ZIP synergy", kind: "synergy", model: "zip" },
];

export function isMatrixView(v: unknown): v is MatrixView {
  return MATRIX_VIEWS.some((d) => d.key === v);
}

type Mat = (number | null)[][];
/* eslint-disable @typescript-eslint/no-explicit-any */
type Res = Record<string, any>;

/** The matrix of a view from the engine's synergy result (null when the
 *  result does not carry it). */
export function viewMatrix(result: Res | null | undefined, view: MatrixView): Mat | null {
  if (!result || result.error) return null;
  const ok = (m: unknown): Mat | null => (Array.isArray(m) && m.every(Array.isArray) ? m as Mat : null);
  if (view === "observed") return ok(result.response);
  const [model, what] = view.split("_") as [SynergyModel, string];
  const e = result.models?.[model];
  if (!e) return null;
  if (what === "expected") return ok(e.reference);
  if (what === "fitted") return ok(e.fitted);
  return ok(e.synergy);
}

/** Matrices listed by the results table's "Show" choice: the observed
 *  response with the synergy of each shown model (the default), every
 *  matrix, or one. */
export type MatrixTableChoice = "default" | "all" | MatrixView;

export function matricesFor(choice: MatrixTableChoice, shown: SynergyModel[]): MatrixViewDef[] {
  const inShown = (d: MatrixViewDef) => d.model === null || shown.includes(d.model);
  if (choice === "default") {
    return MATRIX_VIEWS.filter((d) => d.key === "observed" || (d.kind === "synergy" && inShown(d)));
  }
  if (choice === "all") return MATRIX_VIEWS.filter(inShown);
  return MATRIX_VIEWS.filter((d) => d.key === choice);
}

// ------------------------------------------------------------ checks

/** Why the Chou-Talalay combination indices may not be trusted: a
 *  monotherapy curve that could not be fitted or fits poorly, or a
 *  median-effect line that is missing, slopes the wrong way (r < 0: the
 *  effect falls as the dose rises) or is poor (|r| < 0.9, Chou 2010). */
export function monotherapyIssues(result: Res | null | undefined): string[] {
  if (!result || result.error) return [];
  const out: string[] = [];
  const name = (k: "drug1" | "drug2") => String(result[k] ?? (k === "drug1" ? "Drug 1" : "Drug 2"));
  for (const k of ["drug1", "drug2"] as const) {
    const mono = result.monotherapy?.[k];
    if (mono && mono.fitted === false) out.push(`the four-parameter fit of ${name(k)} alone failed`);
    else if (mono && typeof mono.r_squared === "number" && mono.r_squared < 0.8) {
      out.push(`the four-parameter fit of ${name(k)} alone is poor (R² = ${fmt(mono.r_squared)})`);
    }
    const me = result.chou_talalay?.[k];
    if (!me) out.push(`${name(k)} has no median-effect line (fewer than two doses with Fa between 0 and 1)`);
    else if (typeof me.r === "number" && me.r < 0) {
      out.push(`the median-effect line of ${name(k)} slopes the wrong way (r = ${fmt(me.r)}: the effect falls as the dose rises)`);
    } else if (typeof me.r === "number" && Math.abs(me.r) < 0.9) {
      out.push(`the median-effect line of ${name(k)} fits poorly (r = ${fmt(me.r)})`);
    } else if (me.valid === false) {
      out.push(`the median-effect fit of ${name(k)} is withheld (${me.reason ?? "it does not meet the criteria"})`);
    }
  }
  return out;
}

const fmt = (v: number) => String(Number(v.toPrecision(3)));

/** A sentence when the summary scores and the combination indices point
 *  opposite ways (scores above 10 with a median CI above 1, or below −10
 *  with a median CI below 1), else null. */
export function scoresVsCi(result: Res | null | undefined, shown: SynergyModel[]): string | null {
  if (!result || result.error) return null;
  const scores = shown.map((m) => result.models?.[m]?.score).filter((v): v is number => typeof v === "number");
  const cis = ((result.chou_talalay?.combinations ?? []) as Res[]).map((c) => c.ci)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v)).sort((a, b) => a - b);
  if (!scores.length || !cis.length) return null;
  const syn = scores.filter((s) => s > 10).length;
  const ant = scores.filter((s) => s < -10).length;
  const mid = cis.length % 2 ? cis[(cis.length - 1) / 2] : (cis[cis.length / 2 - 1] + cis[cis.length / 2]) / 2;
  const reading = syn > scores.length / 2 ? "synergistic" : ant > scores.length / 2 ? "antagonistic" : null;
  if (reading === "synergistic" && mid > 1) {
    return `The synergy scores read “likely synergistic” but the median combination index is ${fmt(mid)} (antagonism).`;
  }
  if (reading === "antagonistic" && mid < 1) {
    return `The synergy scores read “likely antagonistic” but the median combination index is ${fmt(mid)} (synergism).`;
  }
  return null;
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
