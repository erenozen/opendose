// The references behind derived numbers (P-57): the 0% and 100% each data
// set of a Normalize used, and the baseline Remove baseline took away, as
// the engine reports them (normalize.normalize_references,
// manipulate.remove_baseline "baseline"). Pure; unit-tested in
// __tests__/references.test.ts.
import type { DataTableModel } from "../../project/types.ts";
import { formatSig } from "../../types.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

/** A row of the source table, as the references name it: its title, the X
 *  value, or its number. */
export function rowLabel(t: Pick<DataTableModel, "type" | "rowTitles" | "x">, r: number): string {
  const title = t.rowTitles?.[r]?.trim();
  if (title) return `“${title}”`;
  const x = t.type === "xy" ? t.x[r]?.trim() : "";
  return x ? `X = ${x}` : `row ${r + 1}`;
}

export interface ReferenceRow { dataset: string; zero: string; hundred: string }

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? formatSig(v) : "n/a");

function describe(ref: R | undefined, means: boolean, t: Pick<DataTableModel, "type" | "rowTitles" | "x">): string {
  if (!ref) return "n/a";
  const of = means ? "mean" : "value";
  const at = typeof ref.row === "number" ? ` (${rowLabel(t, ref.row)})` : "";
  switch (ref.rule) {
    case "smallest": return `${num(ref.value)}, the smallest ${of}${at}`;
    case "largest": return `${num(ref.value)}, the largest ${of}${at}`;
    case "first": return `${num(ref.value)}, the ${of} of the first row${at}`;
    case "last": return `${num(ref.value)}, the ${of} of the last row${at}`;
    case "sum": return `${num(ref.value)}, the sum of ${ref.n_summed ?? "all"} ${means ? "row means" : "values"}`;
    case "value": return `${num(ref.value)}, as entered`;
    default: return num(ref.value);
  }
}

/** One row per data set (per subcolumn when each is normalized
 *  separately): what 0% and 100% were. */
export function normalizeReferenceRows(refs: { name: string; references: R | null }[],
  t: Pick<DataTableModel, "type" | "rowTitles" | "x">): ReferenceRow[] {
  return refs.flatMap(({ name, references: r }) => {
    if (!r) return [{ dataset: name, zero: "no values", hundred: "no values" }];
    if (r.basis === "each subcolumn") {
      return ((r.subcolumns ?? []) as (R | null)[]).map((s, j) => ({
        dataset: `${name}, replicate ${j + 1}`,
        zero: s ? describe(s.zero, false, t) : "no values",
        hundred: s ? describe(s.hundred, false, t) : "no values",
      }));
    }
    return [{ dataset: name, zero: describe(r.zero, true, t), hundred: describe(r.hundred, true, t) }];
  });
}

/** What Remove baseline took from one data set, in words. */
export function baselineText(b: R | null | undefined, t: Pick<DataTableModel, "type" | "rowTitles" | "x">): string {
  if (!b) return "n/a";
  if (b.kind === "dataset") {
    return `${b.dataset ? `“${b.dataset}”` : "the baseline data set"}, row by row`
      + (b.linear ? " (its linear regression on X)" : "");
  }
  if (b.kind === "value") return `${num(b.value)}, as entered`;
  const rows = ((b.rows ?? []) as number[]).map((r) => rowLabel(t, r));
  const where = rows.length <= 1 ? rows.join("") : `${rows.slice(0, -1).join(", ")} and ${rows[rows.length - 1]}`;
  if (Array.isArray(b.values)) {
    return `${(b.values as unknown[]).map(num).join(", ")} (one per replicate), the ${rows.length === 1 ? "value" : "mean"} of ${where}`;
  }
  return `${num(b.value)}, the mean of ${where}`;
}
