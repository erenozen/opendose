// Significance stars at each time point (P-105): on a lines graph of a
// grouped table (rows = time points) or the time-course model's graph of
// group means, the comparisons the user's analysis made at each time
// point (two-way ANOVA within rows, multiple t tests, the time-course
// model's groups at each time) are drawn as a star label above that time
// point, instead of brackets between bars. Stars come only from that
// analysis, with the legend giving the scale and saying they are not a
// test of the curves (FEATURE-PLAN do-not-build 1 and 7). Pure;
// unit-tested in __tests__/timeStars.test.ts.
import type { ComparisonsFormat } from "./format.ts";
import type { ComparisonSet } from "./results.ts";
import { formatPStyle, isNs, pairKey, starsFor, type Comparison, type PStyle } from "./significance.ts";

/** Which group every comparison at a time point is made against. */
export type TimeReference =
  | { ok: true; reference: string | null }
  | { ok: false; why: string };

/**
 * Whether the comparisons can be read as one star label per group at each
 * time point: every comparison belongs to a time point (a family), and
 * either each time point has one pair (two groups) or every pair shares
 * one group (each group against a control). The reference is that shared
 * group (null with two groups: one star per time point).
 */
export function timeReference(cmps: Comparison[]): TimeReference {
  if (!cmps.length) return { ok: false, why: "There are no comparisons at a time point." };
  if (cmps.some((c) => !c.family)) {
    return { ok: false, why: "These comparisons are not made at each time point." };
  }
  const groups = new Set(cmps.flatMap((c) => [c.a, c.b]));
  if (groups.size === 2) return { ok: true, reference: null };
  const shared = [...groups].filter((g) => cmps.every((c) => c.a === g || c.b === g));
  if (shared.length === 1) return { ok: true, reference: shared[0] };
  return { ok: false, why: "At each time point several pairs are compared with no common group, so a "
    + "star cannot say which pair it is: compare each group with a control (Dunnett), or use "
    + "brackets on a bar graph." };
}

/** One star label: the time point (family), the group it marks (the one
 *  compared with the reference; with two groups, null) and its text. */
export interface TimeStar {
  key: string;
  family: string;
  group: string | null;
  text: string;
  isP: boolean;
  p: number;
}

/** The labels to draw, after the dialog's choices (ticked pairs, the P
 *  threshold, hide ns); empty when the comparisons have no reference. */
export function timeStars(cmps: Comparison[], c: ComparisonsFormat, style: PStyle,
  hideNs: boolean): TimeStar[] {
  const ref = timeReference(cmps);
  if (!ref.ok) return [];
  const hidden = new Set(c.hidden ?? []);
  return cmps
    .filter((x) => !hidden.has(pairKey(x)))
    .filter((x) => typeof c.threshold !== "number" || x.p < c.threshold)
    .filter((x) => !hideNs || !isNs(x.p, style))
    .map((x) => {
      const isP = c.display === "p" || (c.display === "mixed" && isNs(x.p, style));
      return {
        key: pairKey(x), family: x.family!, p: x.p, isP,
        group: ref.reference === null ? null : x.a === ref.reference ? x.b : x.a,
        text: isP ? formatPStyle(x.p, style, c.prefix ?? (style === "apa" ? "p = " : "P = "))
          : starsFor(x.p, style),
      };
    });
}

/** Stack the labels of each time point: the k-th label of a time point
 *  sits k steps above the first, in the order of `groups` (the plotting
 *  order), so a group's stars keep their height from one time point to
 *  the next. */
export function stackTimeStars<T extends { family: string; group: string | null }>(
  stars: T[], groups: string[]): (T & { level: number })[] {
  const rank = (g: string | null) => (g === null ? -1 : groups.indexOf(g));
  const byFamily = new Map<string, T[]>();
  for (const s of stars) (byFamily.get(s.family) ?? byFamily.set(s.family, []).get(s.family)!).push(s);
  const out: (T & { level: number })[] = [];
  for (const list of byFamily.values()) {
    [...list].sort((p, q) => rank(p.group) - rank(q.group))
      .forEach((s, level) => out.push({ ...s, level }));
  }
  return out;
}

/** The legend clause of a graph drawing stars at each time point from
 *  `set` ("" when they cannot be drawn). */
export function perTimeClause(set: ComparisonSet | null | undefined): string {
  if (!set?.timePoints) return "";
  const ref = timeReference(set.comparisons);
  return ref.ok ? timeStarsClause(set.label, ref.reference, set.curveTest ?? "") : "";
}

/** The legend clause for stars at each time point: what each star
 *  compares, the analysis, and that the curves are compared elsewhere. */
export function timeStarsClause(label: string, reference: string | null, curveTest: string): string {
  const what = reference === null
    ? "Stars above each time point compare the two groups at that time"
    : `Stars above each time point compare each group with ${reference} at that time, in that group's colour`;
  return `${what} (${label}); exact P values are in the results. They are not a test of the curves: `
    + `${curveTest}`;
}
