// "Help me choose…" (the Which test? wizard) opened from the Analyze menu:
// the design guessed from the current table (number of groups, layout,
// replicate structure, a paired analysis already chosen) and the wording
// of the questions in terms of the user's own rows and columns ("Is row 1
// of Control the same animal as row 1 of Treated?"). Pure: unit-tested
// in __tests__/tablePrefill.test.ts.
import type { DataTableModel } from "../project/types.ts";
import { DEFAULT_DESIGN, type Design } from "./recommend.ts";

const filled = (v: string | undefined) => (v ?? "").trim() !== "";

/** Data sets that hold at least one value (all of them when none do). */
export function usedDatasets(t: DataTableModel): number[] {
  const used = t.datasets.map((d, i) => (d.rows.some((r) => r.some(filled)) ? i : -1))
    .filter((i) => i >= 0);
  return used.length ? used : t.datasets.map((_, i) => i);
}

const PAIRED_TTESTS = new Set(["paired", "ratio_paired", "wilcoxon"]);

/** A design guess from the table the wizard opens on, refined by the
 *  options of the analysis already on screen (a paired t test or a
 *  repeated-measures ANOVA says the rows are matched). */
export function designFromTable(t: DataTableModel | null | undefined,
  options?: unknown): Design {
  if (!t) return DEFAULT_DESIGN;
  const k = usedDatasets(t).length;
  const groups = k <= 1 ? "one" : k === 2 ? "two" : "three_plus";
  const o = (options && typeof options === "object" ? options : {}) as Record<string, unknown>;
  const paired = (o.analysis === "ttest" && PAIRED_TTESTS.has(String(o.ttestKind)))
    || o.analysis === "rm_anova";
  const summary = t.subcolumnFormat !== "replicates";
  switch (t.type) {
    case "column": return { ...DEFAULT_DESIGN, groups, paired: paired && !summary };
    case "nested": return { ...DEFAULT_DESIGN, groups: k <= 2 ? "two" : "three_plus",
      replicates: "technical" };
    case "grouped": return { ...DEFAULT_DESIGN, factors: "two", groups: "three_plus",
      ...(o.design === "rm_rows" ? { repeated: "one" as const, paired: true }
        : o.design === "rm_both" ? { repeated: "both" as const, paired: true } : {}) };
    case "contingency": return { ...DEFAULT_DESIGN, outcome: "counts",
      groups: t.x.length <= 2 ? "two" : "three_plus", twoOutcomes: k <= 2 };
    case "survival": return { ...DEFAULT_DESIGN, outcome: "survival", groups };
    case "xy": return { ...DEFAULT_DESIGN, outcome: "curve" };
    case "partsofwhole": return { ...DEFAULT_DESIGN, outcome: "counts", groups: "one",
      twoOutcomes: false };
    default: return DEFAULT_DESIGN;
  }
}

/** The questions of the wizard, worded with the table's own names. */
export interface TableWording {
  /** "Your table has 2 data sets: Control and Treated." */
  groupsHint: string | null;
  /** The pairing question with the first row both data sets fill. */
  pairing: string | null;
  /** What "paired" would mean here, in one sentence. */
  pairingHint: string | null;
  /** Two factors: the repeated-measures question about the user's rows. */
  repeatedHint: string | null;
  /** "What is each value in Control?" */
  replicates: string | null;
}

const list = (names: string[]) => (names.length <= 1 ? names.join("")
  : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

const short = (names: string[], max = 4) => (names.length <= max ? list(names)
  : `${names.slice(0, max).join(", ")} and ${names.length - max} more`);

const nameOf = (t: DataTableModel, i: number) =>
  t.datasets[i]?.name.trim() || `Data set ${i + 1}`;

/** The wording of the wizard's questions for this table (null fields:
 *  keep the generic wording). Column-like tables only: grouped tables get
 *  the repeated-measures hint, other types keep the generic questions. */
export function tableWording(t: DataTableModel | null | undefined): TableWording {
  const none: TableWording = { groupsHint: null, pairing: null, pairingHint: null,
    repeatedHint: null, replicates: null };
  if (!t || !t.datasets.length) return none;
  const used = usedDatasets(t);
  const names = used.map((i) => nameOf(t, i));
  if (t.type === "grouped") {
    const r1 = t.rowTitles[0]?.trim() || "row 1";
    const r2 = t.rowTitles[1]?.trim() || "row 2";
    const sub = (t.datasets[used[0]]?.rows[0]?.length ?? 1) > 1;
    return { ...none,
      groupsHint: `Your table has ${t.x.length} row${t.x.length === 1 ? "" : "s"} and `
        + `${names.length} data set${names.length === 1 ? "" : "s"} (${short(names)}).`,
      repeatedHint: t.x.length >= 2 && sub
        ? `In your table: is replicate 1 of ${names[0]} in “${r1}” the same subject as `
          + `replicate 1 of ${names[0]} in “${r2}”? If so, the row factor is repeated.`
        : null,
      replicates: `What is each value in ${names[0]}?` };
  }
  if (t.type !== "column" && t.type !== "nested") return none;
  const groupsHint = `Your table has ${names.length} data set${names.length === 1 ? "" : "s"}: `
    + `${short(names)}.`;
  const replicates = t.type === "nested" ? null : `What is each value in ${names[0]}?`;
  if (used.length < 2 || t.type === "nested" || t.subcolumnFormat !== "replicates") {
    return { ...none, groupsHint, replicates };
  }
  const [a, b] = used;
  const rows = Math.max(t.datasets[a].rows.length, t.datasets[b].rows.length);
  let row = -1;
  for (let r = 0; r < rows && row < 0; r++) {
    if (filled(t.datasets[a].rows[r]?.[0]) && filled(t.datasets[b].rows[r]?.[0])) row = r;
  }
  if (row < 0) return { ...none, groupsHint, replicates };
  const A = nameOf(t, a);
  const B = nameOf(t, b);
  const va = t.datasets[a].rows[row][0].trim();
  const vb = t.datasets[b].rows[row][0].trim();
  const title = t.rowTitles[row]?.trim();
  const pairing = title
    ? `Are ${A} (${va}) and ${B} (${vb}) in row “${title}” measured on the same animal, `
      + "culture or experiment?"
    : `Is row ${row + 1} of ${A} (${va}) the same animal, culture or experiment as row `
      + `${row + 1} of ${B} (${vb})?`;
  return { ...none, groupsHint, replicates, pairing,
    pairingHint: "Yes means each row is one subject (or one matched set) measured under "
      + `every condition${used.length > 2 ? ` (${short(names)})` : ""}: a paired or `
      + "repeated-measures analysis. No means the groups are separate subjects." };
}
