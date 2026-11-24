// Values left out of one analysis only (P-68): a sensitivity analysis.
// A results sheet's `leftOut` names Y cells of its table, each with the
// value it held and the reason given. They are applied when the
// analysis' input is built (`analysisTable`): the cells are excluded in a
// copy of the table that only this analysis sees, exactly as excluding
// them in the table would, so the numbers are the ones a table-level
// exclusion gives. The table itself, its graphs and every other analysis
// keep the values.
//
// Rules (the plan's "do not build" item 4, no automatic outlier
// deletion): a value is only ever left out by the user, always with a
// reason, and the results say what was left out and why, next to the
// results with it included (report/ExclusionsCard.tsx). A cell that no
// longer holds the value it held (rows moved, the value edited) is not
// left out: the block reports it instead of leaving out whatever is
// there now. Pure.
import { cellWhere, cleanReason } from "./exclusions.ts";
import type { DataColumn, DataTableModel, LeftOutValue, Project, ResultsSheet } from "./types.ts";

/** A cell of a data set. */
export interface LeftOutCell { dataset: number; row: number; sub: number }

export const leftOutKey = (c: LeftOutCell) => `${c.dataset}:${c.row}:${c.sub}`;

const cellKey = (c: LeftOutCell) => `${c.row}:${c.sub}`;
const nat = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 0;

/** `leftOut` read from a file: well-formed entries with a reason, one per
 *  cell (undefined when none). */
export function parseLeftOut(v: unknown): LeftOutValue[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: LeftOutValue[] = [];
  const seen = new Set<string>();
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const reason = cleanReason(o.reason);
    if (!nat(o.dataset) || !nat(o.row) || !nat(o.sub) || typeof o.value !== "string" || !reason) continue;
    const e: LeftOutValue = { dataset: o.dataset as number, row: o.row as number,
      sub: o.sub as number, value: o.value, reason };
    if (seen.has(leftOutKey(e))) continue;
    seen.add(leftOutKey(e));
    out.push(e);
  }
  return out.length ? out : undefined;
}

/** What became of a left-out value in the table as it is now:
 *  "applies" (left out of this analysis), "in-table" (excluded in the
 *  table itself, so every analysis leaves it out) or "changed" (the cell
 *  no longer holds the value: not left out). */
export type LeftOutState = "applies" | "in-table" | "changed";

export function leftOutState(t: DataTableModel, v: LeftOutValue): LeftOutState {
  const d = t.datasets[v.dataset];
  const now = d?.rows[v.row]?.[v.sub];
  if (now === undefined || now.trim() === "" || now !== v.value) return "changed";
  if (d.excluded?.includes(cellKey(v))) return "in-table";
  return "applies";
}

/**
 * The table this analysis sees: `t` with the values it leaves out
 * excluded, each with its reason, exactly as excluding them in the table
 * would (the same `excluded` keys and `exclusionReasons`). Returns `t`
 * itself when nothing applies, so a sheet without left-out values (every
 * file saved before they existed) computes from, and fingerprints, the
 * very same input as before.
 */
export function analysisTable(t: DataTableModel, leftOut: readonly LeftOutValue[] | undefined):
  DataTableModel {
  if (!leftOut?.length) return t;
  const byDs = new Map<number, LeftOutValue[]>();
  for (const v of leftOut) {
    if (leftOutState(t, v) !== "applies") continue;
    byDs.set(v.dataset, [...(byDs.get(v.dataset) ?? []), v]);
  }
  if (!byDs.size) return t;
  return {
    ...t,
    datasets: t.datasets.map((d, i) => {
      const vs = byDs.get(i);
      if (!vs) return d;
      const next: DataColumn = {
        ...d,
        excluded: [...(d.excluded ?? []), ...vs.map(cellKey)],
        exclusionReasons: { ...(d.exclusionReasons ?? {}),
          ...Object.fromEntries(vs.map((v) => [cellKey(v), v.reason])) },
      };
      return next;
    }),
  };
}

/** The table a results sheet's analysis sees (see analysisTable). */
export function sheetTable(sheet: Pick<ResultsSheet, "leftOut"> | null | undefined,
  t: DataTableModel): DataTableModel {
  return analysisTable(t, sheet?.leftOut);
}

/** Why a cell cannot be left out of an analysis ("" when it can). */
export function leftOutProblem(t: DataTableModel, c: LeftOutCell,
  leftOut: readonly LeftOutValue[] = []): string {
  const d = t.datasets[c.dataset];
  const v = d?.rows[c.row]?.[c.sub];
  if (!d || v === undefined) return "Choose a cell of the table";
  if (v.trim() === "") return "This cell is blank: choose a cell that holds a value";
  if (d.excluded?.includes(cellKey(c))) return "This value is already excluded in the table";
  if (leftOut.some((x) => leftOutKey(x) === leftOutKey(c) && leftOutState(t, x) === "applies")) {
    return "This value is already left out of this analysis";
  }
  return "";
}

function mapResults(p: Project, id: string, fn: (s: ResultsSheet) => ResultsSheet): Project {
  return {
    ...p,
    sheets: p.sheets.map((s) => (s.id === id && s.kind === "results" ? fn(s) : s)),
  };
}

/** `p` with `cells` left out of results sheet `resultsId` for `reason`
 *  (which must not be empty). Cells that cannot be left out are skipped;
 *  an entry whose cell changed is replaced. */
export function withLeftOut(p: Project, resultsId: string, cells: readonly LeftOutCell[],
  reason: string): Project {
  const text = cleanReason(reason);
  const res = p.sheets.find((s) => s.id === resultsId);
  if (!text || !res || res.kind !== "results") return p;
  const data = p.sheets.find((s) => s.id === res.parentId);
  if (!data || data.kind !== "data") return p;
  const t = data.table;
  let list = [...(res.leftOut ?? [])];
  let changed = false;
  for (const c of cells) {
    if (leftOutProblem(t, c, list)) continue;
    list = list.filter((x) => leftOutKey(x) !== leftOutKey(c));
    list.push({ dataset: c.dataset, row: c.row, sub: c.sub,
      value: t.datasets[c.dataset].rows[c.row][c.sub], reason: text });
    changed = true;
  }
  if (!changed) return p;
  return mapResults(p, resultsId, (s) => ({ ...s, leftOut: list }));
}

/** `p` with the value at `key` (leftOutKey) put back into results sheet
 *  `resultsId`'s analysis. */
export function withoutLeftOut(p: Project, resultsId: string, key: string): Project {
  const res = p.sheets.find((s) => s.id === resultsId);
  if (!res || res.kind !== "results" || !res.leftOut?.some((x) => leftOutKey(x) === key)) return p;
  return mapResults(p, resultsId, (s) => {
    const rest = (s.leftOut ?? []).filter((x) => leftOutKey(x) !== key);
    const next: ResultsSheet = { ...s, leftOut: rest };
    if (!rest.length) delete next.leftOut;
    return next;
  });
}

/** One left-out value as the Exclusions block lists it. */
export interface LeftOutRow {
  key: string;
  group: string;
  /** "row 3", "X = 0.1, Y2". */
  where: string;
  value: string;
  reason: string;
  state: LeftOutState;
}

export function leftOutRows(t: DataTableModel, leftOut: readonly LeftOutValue[] | undefined):
  LeftOutRow[] {
  return (leftOut ?? []).map((v) => ({
    key: leftOutKey(v),
    group: t.datasets[v.dataset]?.name.trim() || `Data set ${v.dataset + 1}`,
    where: cellWhere(t, v.dataset, v.row, v.sub),
    value: v.value,
    reason: v.reason,
    state: leftOutState(t, v),
  }));
}

/**
 * The left-out values as a clause for the methods paragraph (no final
 * full stop), or null when none applies: "left out of this analysis only,
 * as a sensitivity analysis (they stay in the table and in the other
 * analyses): Control, row 3 (21.8; pipetting error noted)".
 */
export function leftOutClause(t: DataTableModel, leftOut: readonly LeftOutValue[] | undefined):
  string | null {
  const rows = leftOutRows(t, leftOut).filter((r) => r.state === "applies");
  if (!rows.length) return null;
  const one = rows.length === 1;
  const list = rows.map((r) => `${r.group}, ${r.where} (${r.value}; ${r.reason})`).join("; ");
  return `${one ? "1 value" : `${rows.length} values`} left out of this analysis only, as a `
    + `sensitivity analysis (${one ? "it stays" : "they stay"} in the table and in the other analyses): ${list}`;
}
