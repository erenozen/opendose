// Repeated-measures correlation (P-27): the Subject role of a correlation
// on a column table (row titles or a column of IDs), the labels the engine
// receives (engine correlation.rm_corr) and the Checks-row chip shown when
// the table names subjects but the correlation ignores them. Pure;
// unit-tested (__tests__/rmCorr.test.ts).
import type { DataTableModel } from "../../project/types.ts";

/** ColumnOptionsState.corrSubject: "" (none), "rows" (row titles) or
 *  "d<i>" (data set i holds the subject IDs). */
export type SubjectRole = string;

/** The data set index a "d<i>" role names, else null. */
export function subjectDataset(role: SubjectRole | undefined): number | null {
  const m = /^d(\d+)$/.exec(role ?? "");
  return m ? Number(m[1]) : null;
}

/** One subject label per row for the engine (options.subject_labels), or
 *  null when no subject role is set or it names nothing usable. */
export function subjectLabels(table: DataTableModel, role: SubjectRole | undefined,
  datasetA: number, datasetB: number): string[] | null {
  if (role === "rows") return table.rowTitles.map((t) => t.trim());
  const i = subjectDataset(role);
  if (i === null || i === datasetA || i === datasetB || !table.datasets[i]) return null;
  return table.datasets[i].rows.map((row) => (row[0] ?? "").trim());
}

const ID_NAME = /\b(subject|animal|donor|patient|mouse|rat|participant|id)s?\b/i;

/** Where the table seems to name subjects that a correlation would
 *  ignore: row titles that repeat, or a data set other than X and Y whose
 *  name says it holds IDs. null when nothing suggests repeated subjects. */
export function ignoredSubjects(table: DataTableModel, datasetA: number,
  datasetB: number): { where: string; role: SubjectRole } | null {
  const titles = table.rowTitles.map((t) => t.trim()).filter(Boolean);
  if (titles.length > new Set(titles).size) return { where: "the row titles", role: "rows" };
  const i = table.datasets.findIndex((d, k) => k !== datasetA && k !== datasetB
    && ID_NAME.test(d.name));
  return i >= 0 ? { where: `the column “${table.datasets[i].name}”`, role: `d${i}` } : null;
}
