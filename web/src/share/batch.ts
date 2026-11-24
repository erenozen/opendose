// Run a family on many files (P-78): which numbers of a family's results
// can go into the summary table, and the summary table itself: one row
// per file, one column per chosen number. A number the results withhold
// (an IC50 shown as "> 30", the parameters of an ambiguous fit, an
// analysis that failed) is an empty cell with the reason in the notes,
// as the fit summary's linked table does (sheets/xy/fitSummary.ts), so a
// graph or test of the summary never uses a number the results withhold.
// Pure: the numbers come from the engine.
import { keyParam } from "../components/answer/keyFacts.ts";
import { fitAmbiguous } from "../guide/checks.ts";
import { compareResults } from "../project/reproduce.ts";
import { labelOf } from "../project/replayDiff.ts";
import { normalizeTable } from "../project/table.ts";
import type { DataTableModel } from "../project/types.ts";
import { NOT_REACHED } from "../sheets/xy/rangeReport.ts";
import { reportedValue } from "../sheets/xy/fitCells.ts";
import type { FitResult } from "../types.ts";

/** A number of one results sheet of the family. */
export interface NumberChoice {
  /** Which results sheet of the family (its place among them). */
  sheet: number;
  /** Path in the result ("datasets[0].fit.params.IC50.value"). */
  path: string;
  /** "Cell line 1 · IC50", with the results sheet's name when the family has several. */
  label: string;
  /** Offered ticked: the headline number (a fit's IC50 or EC50, else the first P). */
  key: boolean;
}

const PARAM = /^(.*)\.params\.([^.[]+)\.value$/;
const isError = (r: unknown) => !r || typeof r !== "object" || !!(r as { error?: unknown }).error;

type Seg = string | number;
/** "datasets[0].fit.params.IC50.value" -> ["datasets", 0, "fit", ...]. */
export function parsePath(path: string): Seg[] {
  const out: Seg[] = [];
  for (const m of path.matchAll(/([^.[\]]+)|\[(\d+)\]/g)) out.push(m[2] !== undefined ? Number(m[2]) : m[1]);
  return out;
}

export function valueAt(result: unknown, path: string): unknown {
  let cur: unknown = result;
  for (const s of parsePath(path)) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string | number, unknown>)[s];
  }
  return cur;
}

/** The numbers worth summarising: fitted parameters and P values (every
 *  number when a result has neither), from the first file's results. */
export function numberChoices(sheets: { name: string; result: unknown }[]): NumberChoice[] {
  const out: NumberChoice[] = [];
  sheets.forEach((s, k) => {
    if (isError(s.result)) return;
    const all = compareResults(s.result, null, { digits: 4 }).changes;
    const picked = all.filter((c) => c.p || PARAM.test(c.path));
    const list = (picked.length ? picked : all).slice(0, 400);
    let keyed = false;
    for (const c of list) {
      const m = PARAM.exec(c.path);
      const fit = m ? valueAt(s.result, m[1]) as FitResult | undefined : undefined;
      const key = m ? !!fit?.params && keyParam(fit) === m[2] : !keyed && c.p && !picked.some((x) => PARAM.test(x.path));
      if (key) keyed = true;
      out.push({ sheet: k, path: c.path, key: !!key,
        label: `${sheets.length > 1 ? `${s.name} · ` : ""}${labelOf(c)}` });
    }
  });
  return out;
}

/** One summary cell: the number as the results report it, or "" with why. */
export function summaryCell(result: unknown, path: string): { text: string; why?: string } {
  if (isError(result)) {
    return { text: "", why: `the analysis failed${result && typeof result === "object" ? `: ${String((result as { error?: unknown }).error)}` : ""}` };
  }
  const m = PARAM.exec(path);
  if (m) {
    const fit = valueAt(result, m[1]) as FitResult | undefined;
    const e = fit?.params?.[m[2]];
    if (!fit || !e) return { text: "", why: "not in this file's results" };
    if (fitAmbiguous(fit)) return { text: "", why: "the fit is ambiguous, so its parameters are not reported" };
    const v = reportedValue(m[2], e, fit);
    if (v === null) return { text: "", why: `${m[2]} ${NOT_REACHED}` };
    return { text: String(v) };
  }
  const v = valueAt(result, path);
  return typeof v === "number" && Number.isFinite(v) ? { text: String(v) } : { text: "", why: "not in this file's results" };
}

export interface BatchRow {
  /** The file's name without its extension: the row title. */
  name: string;
  /** The family's results, in the order of its results sheets. */
  results: unknown[];
}

/** The summary table (a column table: row titles = files, one data set
 *  per chosen number) and a note for every empty cell. */
export function summaryTable(rows: BatchRow[], choices: NumberChoice[]):
  { table: DataTableModel; notes: string[] } {
  // file by file, so the notes read in the order of the rows
  const cells = rows.map((r) => choices.map((c) => summaryCell(r.results[c.sheet], c.path)));
  const notes = rows.flatMap((r, i) => choices.flatMap((c, j) =>
    (cells[i][j].why ? [`${r.name}, ${c.label}: ${cells[i][j].why}`] : [])));
  const table = normalizeTable({
    type: "column",
    rowTitles: rows.map((r) => r.name),
    datasets: choices.map((c, j) => ({ name: c.label, rows: rows.map((_, i) => [cells[i][j].text]) })),
  });
  return { table, notes };
}

/** Any Y value that reads as a number (a file that is text only fails). */
export function hasNumbers(t: DataTableModel): boolean {
  return t.datasets.some((d) => d.rows.some((r) => r.some((v) => v.trim() !== "" && Number.isFinite(Number(v.replace(",", "."))))));
}
