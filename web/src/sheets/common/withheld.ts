// Small-n honesty (need `small-n-honesty`): when any group of a t test or
// one-way ANOVA has fewer than two independent values, no P value is
// reported. With one value per group the variability within groups cannot
// be estimated, so a test has nothing to compare the difference with
// (GraphPad Statistics Guide, "The need for independent samples").
//
// The engine marks such results itself (`withheld: {reason, min_n,
// groups}`, P null); older engines raise an error ("each group needs at
// least 2 values") or, for ANOVA, compute a P from the other groups. This
// module gives every case the same shape, so the results panel, the
// guidance, the results sentence and the legend read one thing: the
// result keeps its analysis id, carries `withheld` and the group means
// (plain averages of the values), and has no P. Pure; unit-tested.
import type { DataTableModel } from "../../project/types.ts";
import { numericData } from "../../project/table.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

export interface GroupValues { name: string; n: number; mean: number | null }

export interface WithheldInfo {
  reason: string;
  /** Smallest number of independent values (or pairs) in a group. */
  minN: number;
  /** The groups with fewer than two independent values. */
  groups: { name: string; n: number }[];
  /** Every analysed group with its n and mean (descriptive results). */
  all: GroupValues[];
  /** Matched design (n counts complete pairs / subjects). */
  matched: boolean;
}

/** The subset of the column-analysis options this module reads. */
export interface SmallNOptions {
  analysis?: string;
  ttestKind?: string;
  rmKind?: string;
  datasetA?: number;
  datasetB?: number;
}

const MATCHED_T = new Set(["paired", "ratio_paired", "wilcoxon"]);

/** Analyses whose P needs at least two independent values per group. */
export function gatesOnN(o: SmallNOptions): boolean {
  return o.analysis === "ttest" || o.analysis === "anova" || o.analysis === "rm_anova";
}

export function isMatched(o: SmallNOptions): boolean {
  return o.analysis === "rm_anova" || (o.analysis === "ttest" && MATCHED_T.has(String(o.ttestKind)));
}

/** n and mean of every group the analysis reads (groups without any value
 *  are left out). Matched designs count complete pairs / subjects, as the
 *  engine does (each column's values in order, blanks skipped). */
export function analysedGroups(table: DataTableModel, o: SmallNOptions): GroupValues[] {
  const sets = numericData(table).datasets.map((d, i) => {
    const vals = d.ys.flat().filter((v): v is number => v !== null);
    return { name: d.name || `Data set ${i + 1}`, vals };
  });
  const a = o.datasetA ?? 0, b = o.datasetB ?? 1;
  const used = (o.analysis === "ttest" ? [sets[a], sets[b]] : sets)
    .filter((g): g is { name: string; vals: number[] } => !!g && g.vals.length > 0);
  const pairs = isMatched(o) && used.length ? Math.min(...used.map((g) => g.vals.length)) : null;
  return used.map((g) => ({
    name: g.name,
    n: pairs ?? g.vals.length,
    mean: g.vals.reduce((s, v) => s + v, 0) / g.vals.length,
  }));
}

/** The result as reported: `withheld` (engine or web) with the group
 *  means, or the engine result unchanged. Only replicate (raw value)
 *  tables are gated; summary data carry their own N. */
export function withWithheld(table: DataTableModel, o: SmallNOptions, r: R): R {
  if (!gatesOnN(o) || table.subcolumnFormat !== "replicates") return r;
  const groups = analysedGroups(table, o);
  const engineSaid = !!(r && typeof r === "object" && r.withheld && typeof r.withheld === "object");
  if (groups.length < 2 && !engineSaid) return r;
  const minN = groups.length ? Math.min(...groups.map((g) => g.n)) : 0;
  if (!engineSaid && minN >= 2) return r;
  const few = groups.filter((g) => g.n < 2).map((g) => ({ name: g.name, n: g.n }));
  const analysis = o.analysis === "ttest" ? "ttest"
    : o.analysis === "rm_anova" ? "rm_one_way_anova" : "anova";
  const base: R = engineSaid ? { ...r } : { analysis };
  return {
    ...base,
    analysis: base.analysis ?? analysis,
    withheld: engineSaid ? r.withheld : { reason: "fewer than two independent values per group",
      min_n: minN, groups: few },
    descriptive_only: true,
    matched: isMatched(o),
    names: Array.isArray(base.names) ? base.names : groups.map((g) => g.name),
    group_means: groups,
    ...(o.analysis === "ttest" ? { p_two_tailed: null } : { p: null }),
  };
}

/** The withheld block of a result, normalised (null: P was reported). */
export function withheldInfo(result: unknown): WithheldInfo | null {
  const r = result as R | null;
  if (!r || typeof r !== "object" || r.error) return null;
  const w = r.withheld;
  if (!w || typeof w !== "object") return null;
  const all: GroupValues[] = Array.isArray(r.group_means)
    ? r.group_means.filter((g: R) => g && typeof g.n === "number")
      .map((g: R) => ({ name: String(g.name ?? ""), n: g.n, mean: typeof g.mean === "number" ? g.mean : null }))
    : [];
  const listed: { name: string; n: number }[] = Array.isArray(w.groups)
    ? w.groups.map((g: unknown) => (typeof g === "string"
      ? { name: g, n: all.find((x) => x.name === g)?.n ?? 1 }
      : { name: String((g as R)?.name ?? ""), n: typeof (g as R)?.n === "number" ? (g as R).n : 1 }))
    : [];
  const few = listed.length ? listed : all.filter((g) => g.n < 2).map((g) => ({ name: g.name, n: g.n }));
  const minN = typeof w.min_n === "number" ? w.min_n
    : few.length ? Math.min(...few.map((g) => g.n)) : 1;
  return {
    reason: typeof w.reason === "string" ? w.reason : "fewer than two independent values per group",
    minN, groups: few, all, matched: !!r.matched,
  };
}

/** "one value per group" / "one value in Control" / "one pair", for the
 *  sentence, the legend and the banner. */
export function withheldPhrase(w: WithheldInfo): string {
  if (w.matched) return w.minN <= 1 ? "one matched set of values" : `${w.minN} matched sets`;
  const ones = w.groups.filter((g) => g.n <= 1);
  const everyGroup = w.all.length > 0 && w.all.every((g) => g.n <= 1);
  if (everyGroup || !w.all.length) return "one value per group";
  return `one value in ${ones.map((g) => g.name).join(" and ") || "a group"}`;
}
