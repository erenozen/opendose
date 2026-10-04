// Results sheets named after the test they show. An analysis that holds
// several tests behind one id (the column analyses: column statistics,
// t tests, one-way ANOVA, ...) names its sheet and tab after the test its
// options choose (AnalysisDef.sheetNameFor / tabLabel). When the options
// switch tests, a sheet that still carries an automatic name follows; a
// name the user typed is kept.
import { findSheet, renameSheet, uniqueName } from "../project/ops";
import type { Project, TableType } from "../project/types";
import type { AnalysisDef } from "../sheets/types";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** `name` is `base` or a uniqueName variant of it ("base (2)"). */
export function isAutoName(name: string, base: string): boolean {
  return name === base || new RegExp(`^${escape(base)} \\(\\d+\\)$`).test(name);
}

/** After results sheet `resId`'s options changed from `prev`: rename it
 *  to the new test's automatic name, unless the user renamed it. */
export function renameForOptions(p: Project, resId: string, prev: unknown,
  defOf: (tableType: TableType, analysis: string) => AnalysisDef | undefined): Project {
  const res = findSheet(p, resId);
  if (!res || res.kind !== "results") return p;
  const data = findSheet(p, res.parentId);
  if (!data || data.kind !== "data") return p;
  const a = defOf(data.table.type, res.analysis);
  if (!a?.sheetNameFor) return p;
  const oldBase = a.sheetNameFor(data.name, prev);
  const newBase = a.sheetNameFor(data.name, res.options);
  if (oldBase === newBase) return p;
  if (!isAutoName(res.name, oldBase) && !isAutoName(res.name, a.sheetName(data.name))) return p;
  return renameSheet(p, resId, uniqueName(p, newBase, resId));
}
