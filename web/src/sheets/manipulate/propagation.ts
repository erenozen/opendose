// Uncertainty carried through Remove baseline and Normalize (P-98): the
// engine options, the propagated SD and SEM of each derived row as the
// results show them, and the banner that keeps them out of t tests
// (engine: engine/opendose/propagate.py). Pure; unit-tested in
// __tests__/propagation.test.ts.
import type { DataTableModel } from "../../project/types.ts";
import type { Banner } from "../../guide/banners.ts";
import { SRC } from "../../guide/sources.ts";
import { formatSig } from "../../types.ts";
import { parseCell } from "../../project/table.ts";
import { rowLabel } from "./references.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

/** Engine options of a typed baseline's SD and n: both blank = exact. */
export function typedBaselineError(sd: string, n: string): { value_sd: number; value_n: number } | null {
  if (sd.trim() === "" && n.trim() === "") return null;
  const s = parseCell(sd);
  if (s === null || s < 0) throw new Error("Enter the baseline's SD as 0 or more, or leave SD and n blank");
  const k = parseCell(n);
  if (k === null || k < 1 || !Number.isInteger(k)) {
    throw new Error("Enter the number of baseline replicates as a whole number of 1 or more");
  }
  return { value_sd: s, value_n: k };
}

export interface PropagatedRow {
  dataset: string; row: string; n: string; value: string; sd: string; se: string; fromRef: string;
}

export interface Propagation {
  rows: PropagatedRow[];
  /** Why a data set has no propagation, or what a row lacks. */
  notes: string[];
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? formatSig(v) : "n/a");

/** The engine's "propagation" block as table rows: one per derived row
 *  of each output data set (names in output order). */
export function propagationRows(p: R | null | undefined, names: string[],
  t: Pick<DataTableModel, "type" | "rowTitles" | "x">): Propagation | null {
  if (!p || !Array.isArray(p.datasets)) return null;
  const rows: PropagatedRow[] = [];
  const notes: string[] = [];
  (p.datasets as R[]).forEach((d, i) => {
    const name = names[i] ?? `Data set ${i + 1}`;
    for (const n of (d.notes ?? []) as string[]) {
      const line = `${name}: ${n}`;
      if (!notes.includes(line)) notes.push(line);
    }
    if (!Array.isArray(d.rows)) return;
    (d.rows as (R | null)[]).forEach((r, j) => {
      if (!r) return;
      rows.push({ dataset: name, row: rowLabel(t, j), n: String(r.n), value: num(r.value), sd: num(r.sd),
        se: num(r.se), fromRef: num(r.from_baseline) });
    });
  });
  return { rows, notes };
}

/** The line under a derived table whose values share an estimated
 *  baseline or reference (Remove baseline from rows or a data set, or a
 *  typed baseline with its SD; Normalize to a reference from the data):
 *  where its values are used, they are not independent replicates. Null
 *  when every value has its own exact or matched baseline. */
export function sharedErrorNote(analysis: string, o: R | null | undefined): string | null {
  if (!o) return null;
  if (analysis === "remove_baseline") {
    const typed = o.baseline === "value";
    if ((typed && !String(o.valueSd ?? "").trim()) || (!typed && o.replicates === "each")) return null;
    return "Every value shares the error of the baseline it was corrected with. To compare groups, analyse the "
      + "source values with the control (blank) as a block, not these as independent replicates.";
  }
  if (analysis === "normalize") {
    if (o.zeroMode === "value" && o.hundredMode === "value") return null;
    return "Every value shares the error of the 0% and 100% references. To compare groups, analyse the source "
      + "values with the control as a block, not these as independent replicates.";
  }
  return null;
}

/** The Checks-row banner of a Remove baseline or Normalize sheet that
 *  propagates: the SDs are for reporting; tests belong on the raw values
 *  with the control as a block. */
export function propagationBanner(analysisId: string, options: R, result: R | null): Banner | null {
  if (!options?.propagate || !result || result.error || !result.extra?.propagation) return null;
  const what = analysisId === "normalize" ? "references" : "baseline";
  return { id: "propagated", tone: "info", title: "Propagated SDs are not replicates",
    body: `The propagated SD and SEM combine each row's own scatter with the uncertainty of the ${what} `
      + `(first-order delta method). Every value of a row shares that ${what} error, so neither the derived `
      + "values nor these SDs are independent replicates: a t test or ANOVA on them treats a shared error as "
      + "independent and gives P values that are too small or too large.",
    fixes: ["To compare groups, analyse the raw values with the control (blank) as a block: one row per "
      + "experiment with its control, matched (repeated-measures) analysis, or a two-way ANOVA with the "
      + "experiment as a factor.",
    "Report the propagated SD or SEM next to each derived value."],
    sources: [SRC.curtis2018, SRC.gum2008] };
}
