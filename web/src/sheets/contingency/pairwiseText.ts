// Pairwise comparisons of rows after an r x c test (FEATURE-PLAN P-14),
// in words: which test each pair used, and the methods sentence. Engine:
// contingency.pairwise_rows. Pure; unit-tested (__tests__/pairwise.test.ts).
import { PAIRWISE_LABELS, type PairwiseCorrection } from "./run.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Where the expected-count rule comes from (read 2026-11-23). */
export const RULE_SOURCES = [
  { label: "Cochran 1954, Biometrics 10:417", url: "https://doi.org/10.2307/3001616" },
  { label: "McDonald, Handbook of Biological Statistics: Small numbers in chi-square and G-tests",
    url: "https://www.biostathandbook.com/small.html" },
];

const TEST_NAME: Record<string, string> = { fisher: "Fisher's exact", chi_square: "Chi-square" };

/** "Fisher's exact (an expected count below 5)", "Chi-square with Yates'
 *  correction (every expected count 5 or more)", or why there is none. */
export function pairTestText(c: any): string {
  if (!c?.test) return String(c?.note ?? "not tested");
  const name = `${TEST_NAME[c.test] ?? c.test}${c.yates ? " with Yates' correction" : ""}`;
  return c.reason && c.reason !== "chosen" ? `${name} (${c.reason})` : name;
}

const shortName = (m: unknown) =>
  PAIRWISE_LABELS[m as PairwiseCorrection]?.replace(/ \(.*$/, "") ?? String(m);

/** The methods sentence of the pairs. */
export function pairwiseMethods(pw: any): string {
  if (!pw || !Array.isArray(pw.comparisons)) return "";
  const n = pw.family?.size ?? pw.comparisons.length;
  const how = pw.test === "auto"
    ? "by Fisher's exact test when any expected count was below 5 and otherwise by the chi-square test"
    : pw.test === "fisher" ? "by Fisher's exact test" : "by the chi-square test";
  return `Each pair of rows was compared ${how}, with P values adjusted over ${n} comparisons `
    + `(${shortName(pw.method)}${pw.method === "bh" ? ", false discovery rate" : ""}).`;
}
