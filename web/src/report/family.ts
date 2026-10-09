// Multiple-comparison families in words: how many comparisons a P value
// was adjusted for, by which method, and which comparisons they were. The
// engine labels every comparisons result with a family block ({size,
// method, label}; two-way also n_families / per_family) and every
// comparison with p_unadjusted / family_size / method; this module turns
// that into the header line of a comparisons table ("adjusted for 6
// comparisons (Tukey)"), the legend clause and the methods clause, so the
// three never disagree. Pure, unit-tested (report/__tests__/family.test.ts).
//
// Why: a reader cannot judge an adjusted P without knowing the family it
// was adjusted for (GraphPad statistics guide, "Multiple comparisons";
// "Planned comparisons"; need `adjusted-vs-raw-labelled`).

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

export interface Family {
  /** Comparisons the adjustment counted (per family when perFamily). */
  size: number;
  /** Engine method id ("tukey", "dunn_bonferroni", "bh", ...). */
  method: string;
  /** Short name for the header: "Tukey", "Šídák", "Dunn". */
  name: string;
  /** adjusted: an adjusted P per comparison; fdr: q values; unadjusted:
   *  no correction; stepwise: significance by steps (Newman-Keuls). */
  kind: "adjusted" | "fdr" | "unadjusted" | "stepwise";
  /** What the family is ("all pairs of 4 groups", "planned pairs only"). */
  detail: string | null;
  /** The user's planned pairs (or each vs. control) rather than all pairs. */
  planned: boolean;
  /** Each vs. a control. */
  control: boolean;
  /** Two-way: one family per row / data set (Tukey) ... */
  perFamily: boolean;
  /** ... and how many there are (null when not reported). */
  nFamilies: number | null;
}

const NAMES: Record<string, string> = {
  tukey: "Tukey", dunnett: "Dunnett", bonferroni: "Bonferroni", sidak: "Šídák",
  holm_sidak: "Holm-Šídák", holm: "Holm", fisher_lsd: "Fisher's LSD", fisher: "Fisher's LSD",
  none: "no correction", newman_keuls: "Newman-Keuls", games_howell: "Games-Howell",
  dunnett_t3: "Dunnett T3", tamhane_t2: "Tamhane T2", welch_uncorrected: "Welch t tests",
  dunn_bonferroni: "Dunn", dunn_holm: "Dunn, Holm step-down", dunn_none: "Dunn",
  dunns: "Dunn", bh: "Benjamini-Hochberg", by: "Benjamini-Yekutieli",
  bky: "two-stage step-up, Benjamini-Krieger-Yekutieli", two_stage: "two-stage step-up",
};

/** The name a methods section gives the correction ("Šídák correction"). */
const CORRECTION: Record<string, string> = {
  tukey: "Tukey's correction", dunnett: "Dunnett's correction",
  bonferroni: "Bonferroni correction", sidak: "Šídák correction",
  holm_sidak: "Holm-Šídák correction", holm: "Holm's step-down correction",
  games_howell: "Games-Howell correction", dunnett_t3: "Dunnett's T3 correction",
  tamhane_t2: "Tamhane's T2 correction",
  // Dunn's test is named by the sentence; the clause names its correction
  dunn_bonferroni: "Bonferroni correction", dunn_holm: "Holm's step-down correction",
  dunns: "Bonferroni correction",
};

const UNADJUSTED = new Set(["fisher_lsd", "fisher", "none", "welch_uncorrected", "dunn_none"]);
const FDR = new Set(["bh", "by", "bky", "two_stage", "benjamini_yekutieli"]);

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** "Tukey, 6 comparisons (all pairs of 4 groups)" -> "all pairs of 4 groups". */
export function familyDetail(label: unknown): string | null {
  if (typeof label !== "string") return null;
  const m = /comparisons? \((.*)\)\s*$/.exec(label);
  return m ? m[1].trim() || null : null;
}

/** The family of a comparisons block (an ANOVA's multiple_comparisons, a
 *  Kruskal-Wallis / Friedman `dunns`, a multiple t tests result), or null
 *  when the result predates family labels and nothing can be said. */
export function familyOf(mc: unknown, fallbackMethod?: string): Family | null {
  const m = mc as R | null;
  if (!m || typeof m !== "object") return null;
  const block: R | null = m.family && typeof m.family === "object" ? m.family
    : m.family_info && typeof m.family_info === "object" ? m.family_info : null;
  const rows: R[] = Array.isArray(m.comparisons) ? m.comparisons
    : Array.isArray(m.rows) ? m.rows : [];
  const first = rows.find((c) => c && num(c.family_size));
  const size = num(block?.size) ? block!.size : first ? first.family_size : null;
  if (!num(size)) return null;
  let method = String(block?.method ?? first?.method ?? m.method ?? fallbackMethod ?? "");
  if (method === "dunns") method = m.corrected === false ? "dunn_none" : "dunn_bonferroni";
  const detail = familyDetail(block?.label);
  const planned = Array.isArray(m.planned_pairs) || /planned/i.test(detail ?? "")
    || m.dunn_family === "pairs";
  const control = /vs\.? (the )?control/i.test(detail ?? "") || m.dunn_family === "control"
    || m.family === "control";
  const kind: Family["kind"] = method === "newman_keuls" ? "stepwise"
    : FDR.has(method) || m.approach === "fdr" ? "fdr"
      : UNADJUSTED.has(method) || m.corrected === false ? "unadjusted" : "adjusted";
  return {
    size, method, name: NAMES[method] ?? method.replace(/_/g, " "), kind, detail,
    planned: planned && !control, control,
    perFamily: block?.per_family === true,
    nFamilies: num(block?.n_families) ? block!.n_families : null,
  };
}

/** The comparisons block of any result that has one. */
export function comparisonsBlock(result: unknown): R | null {
  const r = result as R | null;
  if (!r || typeof r !== "object" || r.error) return null;
  if (r.analysis === "multiple_row_tests" || (Array.isArray(r.rows) && r.family && r.n_tests != null)) {
    return r;
  }
  if (r.dunns && typeof r.dunns === "object") return r.dunns;
  if (r.multiple_comparisons && typeof r.multiple_comparisons === "object") {
    return r.multiple_comparisons;
  }
  return null;
}

/** The family of a whole result (null when it has no labelled family). */
export function resultFamily(result: unknown): Family | null {
  const mc = comparisonsBlock(result);
  const r = result as R | null;
  return mc ? familyOf(mc, r?.dunns ? "dunns" : undefined) : null;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "6 comparisons", "2 planned comparisons". */
function countPhrase(f: Family): string {
  return plural(f.size, f.planned ? "planned comparison" : "comparison");
}

/** ", separately within each of 2 families" (two-way Tukey), else "". */
function perFamilySuffix(f: Family): string {
  return f.perFamily && f.nFamilies && f.nFamilies > 1
    ? `, separately within each of ${f.nFamilies} families` : "";
}

/** The header line of a comparisons table: "adjusted for 6 comparisons
 *  (Tukey)". Starts lower-case; callers capitalise when it opens a line. */
export function familyHeader(f: Family): string {
  switch (f.kind) {
    case "fdr":
      return `q values: false discovery rate controlled over ${countPhrase(f)} (${f.name})${perFamilySuffix(f)}`;
    case "unadjusted":
      return `not adjusted for multiple comparisons (${f.name === "no correction"
        ? "uncorrected" : f.name}; ${countPhrase(f)})`;
    case "stepwise":
      return `${countPhrase(f)} tested step-down by range (Newman-Keuls); no adjusted P values`;
    default:
      return `adjusted for ${countPhrase(f)} (${f.name})${perFamilySuffix(f)}`;
  }
}

/** "adjusted for 6 comparisons" (the sentence already names the test),
 *  or "" for families that are not adjusted P values. */
export function familyAdjustedFor(f: Family): string {
  return f.kind === "adjusted" ? `adjusted for ${countPhrase(f)}${perFamilySuffix(f)}` : "";
}

/** The figure-legend clause, e.g. "with P values adjusted for 6
 *  comparisons (Tukey)". */
export function familyLegendClause(f: Family): string {
  if (f.kind === "fdr") return `with ${familyHeader(f)}`;
  if (f.kind === "unadjusted") return `with P values ${familyHeader(f)}`;
  if (f.kind === "stepwise") return `(${familyHeader(f)})`;
  return `with P values ${familyHeader(f)}`;
}

/** The methods clause: "Šídák correction for 2 planned comparisons",
 *  "Tukey's correction for 6 comparisons (all pairs of 4 groups)". */
export function familyMethodsClause(f: Family, opts: { inParentheses?: boolean } = {}): string {
  const count = countPhrase(f);
  const detail = f.detail && !f.planned
    ? (opts.inParentheses ? `: ${f.detail}` : ` (${f.detail})`) : perFamilySuffix(f);
  switch (f.kind) {
    case "fdr": return `false discovery rate control (${f.name}) over ${count}${detail}`;
    case "unadjusted": return `no correction for multiple comparisons (${count}${f.detail ? `; ${f.detail}` : ""})`;
    case "stepwise": return `Newman-Keuls step-down testing of ${count}${detail}`;
    default: return `${CORRECTION[f.method] ?? `${f.name} correction`} for ${count}${detail}`;
  }
}

/** Does any comparison carry an unadjusted P (show the column)? */
export function hasUnadjusted(rows: unknown): boolean {
  return Array.isArray(rows) && rows.some((c) => c && num(c.p_unadjusted));
}

/** The line under a comparisons table's title: "P values adjusted for 6
 *  comparisons (Tukey): all pairs of 4 groups." */
export function familyLine(f: Family): string {
  const head = familyHeader(f);
  const lead = f.kind === "adjusted" || f.kind === "unadjusted" ? `P values ${head}` : head;
  const text = lead.charAt(0).toUpperCase() + lead.slice(1);
  const detail = f.detail && f.kind !== "unadjusted" ? `: ${f.detail}` : "";
  return `${text}${detail}.`;
}

/** The header of the adjusted-P column: "Adjusted P", "q value", or "P
 *  (not adjusted)" for an uncorrected family. */
export function adjustedHeader(f: Family | null, fallback = "Adjusted P"): string {
  if (!f) return fallback;
  return f.kind === "fdr" ? "q value" : f.kind === "unadjusted" ? "P (not adjusted)" : "Adjusted P";
}
