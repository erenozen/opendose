// Pair values by subject ID (P-38): long records (subject, condition or
// time point, value) as a paired column table, one row per subject and
// one column per condition, matched by the ID and never by the order of
// the records. Used by the import recipes' column output when subject IDs
// repeat across groups (staging.ts pivot) and by "From long table…" for
// paired analyses (sheets/common/longTable.ts). Pure.
//
// - Two records of one subject in one condition stop the pairing with a
//   message naming the ID and the rows: which of the two is the value is
//   not ours to guess.
// - A subject without a value in every condition is unmatched: it keeps
//   its row (with the blank), is listed in the report, and paired
//   analyses leave its row out and say so.
// - Records without an ID or a condition cannot be placed: they are left
//   out and listed by row.
import { isMissing } from "../tidy.ts";

export interface PairRecord {
  id: string;
  group: string;
  value: string;
  /** The record's row in the source table, the titles being row 1, for
   *  messages; 0 when it has none (records made by aggregation). */
  row: number;
}

export interface Pairing {
  /** Conditions, in order of first appearance: the columns. */
  groups: string[];
  /** Subject IDs, in order of first appearance: the rows. */
  subjects: string[];
  /** cells[subject][group]: the value, "" when the subject has none. */
  cells: string[][];
  /** Subjects with a value in every condition. */
  paired: string[];
  /** Subjects missing a value in some conditions, and which. */
  unmatched: { id: string; missing: string[] }[];
  /** Rows of records without a subject ID, and without a condition. */
  noId: number[];
  noGroup: number[];
}

const rowList = (rows: number[]) => rows.length === 1 ? `row ${rows[0]}`
  : `rows ${rows.slice(0, -1).join(", ")} and ${rows[rows.length - 1]}`;

export function pairBySubject(records: PairRecord[]): Pairing | { error: string } {
  const groups: string[] = [];
  const subjects: string[] = [];
  const at = new Map<string, { value: string; rows: number[] }>();
  const noId: number[] = [];
  const noGroup: number[] = [];
  for (const rec of records) {
    const id = rec.id.trim();
    const g = rec.group.trim();
    if (!id || isMissing(id)) { noId.push(rec.row); continue; }
    if (!g || isMissing(g)) { noGroup.push(rec.row); continue; }
    if (!subjects.includes(id)) subjects.push(id);
    if (!groups.includes(g)) groups.push(g);
    const key = JSON.stringify([id, g]);
    const prev = at.get(key);
    if (prev) prev.rows.push(rec.row);
    else at.set(key, { value: isMissing(rec.value) ? "" : rec.value.trim(), rows: [rec.row] });
  }
  for (const [key, v] of at) {
    if (v.rows.length < 2) continue;
    const [id, g] = JSON.parse(key) as [string, string];
    const where = v.rows.every((r) => r > 0) ? ` (${rowList(v.rows)})` : "";
    return { error: `Subject “${id}” has ${v.rows.length} records for “${g}”${where}. `
      + "Pairing needs one value per subject and condition: remove the extra records, or average them first." };
  }
  if (groups.length < 2) {
    return { error: groups.length
      ? `Only one condition (“${groups[0]}”): pairing needs at least two, such as before and after.`
      : "No record has both a subject ID and a condition." };
  }
  const cells = subjects.map((id) => groups.map((g) => at.get(JSON.stringify([id, g]))?.value ?? ""));
  const paired: string[] = [];
  const unmatched: Pairing["unmatched"] = [];
  subjects.forEach((id, i) => {
    const missing = groups.filter((_, j) => cells[i][j] === "");
    if (missing.length) unmatched.push({ id, missing });
    else paired.push(id);
  });
  if (!paired.length) {
    return { error: "No subject has a value in every condition: check that the subject column holds "
      + "IDs that repeat across conditions." };
  }
  return { groups, subjects, cells, paired, unmatched, noId, noGroup };
}

/** Subject IDs shared by two or more groups: the records describe paired
 *  (repeated) measures rather than different subjects per group. */
export function sharesSubjects(records: PairRecord[]): boolean {
  const seen = new Map<string, string>();
  for (const r of records) {
    const id = r.id.trim();
    const g = r.group.trim();
    if (!id || !g) continue;
    const first = seen.get(id);
    if (first === undefined) seen.set(id, g);
    else if (first !== g) return true;
  }
  return false;
}

const LIST_MAX = 40;
const rowsIn = (rows: number[]) => (rows.every((r) => r > 0) ? ` (${rowList(rows)})` : "");

/** The import report: what was paired, what was not, what was left out. */
export function pairingReport(p: Pairing, subjectName: string): { summary: string; notes: string[] } {
  const n = p.paired.length;
  const summary = `${n} ${n === 1 ? "subject" : "subjects"} paired by ${subjectName || "subject ID"} `
    + `across ${p.groups.map((g) => `“${g}”`).join(", ")}`;
  const shown = p.paired.slice(0, LIST_MAX).join(", ");
  const notes = [`Paired (one row each, titled with the ID): ${shown}`
    + (n > LIST_MAX ? `, and ${n - LIST_MAX} more.` : ".")];
  if (p.unmatched.length) {
    notes.push(`Unmatched, kept as rows with a blank that paired analyses leave out: ${p.unmatched
      .map((u) => `${u.id} (no ${u.missing.map((g) => `“${g}”`).join(" or ")})`).join(", ")}.`);
  }
  if (p.noId.length) {
    notes.push(`${p.noId.length} ${p.noId.length === 1 ? "record" : "records"} without a subject ID left out${rowsIn(p.noId)}.`);
  }
  if (p.noGroup.length) {
    notes.push(`${p.noGroup.length} ${p.noGroup.length === 1 ? "record" : "records"} without a condition left out${rowsIn(p.noGroup)}.`);
  }
  return { summary, notes };
}
