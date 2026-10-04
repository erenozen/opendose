// Data-entry guidance shown above a table while it is being filled in:
// numbers typed as a Grouped table's row titles ("did you mean XY?"), a
// Column table with hundreds of rows in a few columns (cells, not
// replicates?), and a data set that is all 1 or all 100 (a normalised
// control). Pure; unit-tested.
import { normalizeTable } from "../project/table.ts";
import type { DataTableModel } from "../project/types.ts";
import { groupChecks, normalisedControl } from "./stats.ts";

export interface EntryHint {
  id: string;
  title: string;
  body: string;
  /** Optional action the panel offers. */
  action?: "xy-copy";
  explainer?: string;
}

const isNum = (s: string) => s.trim() !== "" && Number.isFinite(Number(s.trim()));

/** Rows that hold at least one value. */
function filledRows(t: DataTableModel): number {
  let n = 0;
  for (let r = 0; r < t.x.length; r++) {
    if (t.datasets.some((d) => d.rows[r]?.some((v) => v.trim() !== ""))) n++;
  }
  return n;
}

export function entryHints(t: DataTableModel): EntryHint[] {
  const out: EntryHint[] = [];
  if (t.type === "grouped") {
    const titles = t.rowTitles.map((s) => s.trim()).filter(Boolean);
    if (titles.length >= 3 && titles.every(isNum)) {
      out.push({ id: "grouped-numeric-rows", title: "Did you mean an XY table?",
        body: "Every row title is a number. In a Grouped table row titles are only labels: "
          + "the graph spaces them evenly and analyses treat them as categories, so 1, 10 "
          + "and 100 are three unordered levels. If they are doses, concentrations or times, "
          + "an XY table uses them as numbers (curve fits, regression, true spacing).",
        action: "xy-copy" });
    }
  }
  const groups = groupChecks(t);
  if (t.type === "column") {
    const used = t.datasets.filter((d) => d.rows.some((r) => r.some((v) => v.trim() !== "")));
    if (filledRows(t) >= 100 && used.length >= 1 && used.length <= 3) {
      out.push({ id: "column-many-rows", title: "Are these cells or technical replicates?",
        body: `${filledRows(t)} rows in ${used.length} column${used.length === 1 ? "" : "s"}. If `
          + "the values are cells, wells or repeated readings from a few animals or experiments, "
          + "they are not independent: treating them as n gives P values that are far too "
          + "small. Enter one value per biological replicate (the mean of its cells), or use "
          + "a Nested table with one subcolumn per animal or experiment.",
        explainer: "replicates" });
    }
  }
  if (t.type === "column" || t.type === "grouped") {
    const ctl = normalisedControl(groups);
    if (ctl) {
      const v = ctl.mean === 100 ? "100" : "1";
      out.push({ id: "normalised-control", title: `${ctl.name} is all ${v}: a normalised control?`,
        body: `Every value of ${ctl.name} is ${v}, so its SD is 0. If the other values were `
          + "divided by this control, it is a reference, not data: don't compare the groups "
          + `with it by a t test or ANOVA. Test the treated values against ${v} instead (one-`
          + "sample t test on the logs, the ratio t test), or analyse the raw values.",
        explainer: "normalised-control" });
    }
  }
  return out;
}

/** A Grouped table as an XY table: numeric row titles become X. */
export function groupedToXY(t: DataTableModel): DataTableModel {
  return normalizeTable({
    type: "xy",
    x: t.rowTitles.map((s) => s.trim()),
    xTitle: "X",
    yTitle: t.yTitle,
    datasets: t.datasets.map((d) => ({ name: d.name, rows: d.rows, excluded: d.excluded })),
  });
}
