// When a rank test cannot reach P < α at all (FEATURE-PLAN P-15): the
// engine's min_attainable_p block (exactdist.min_p_*, by the same method
// the test used) becomes a note in the Checks row of the small-n family.
// It states a property of the design, fixed before the data were seen,
// never advice to change test after seeing them (the plan's risk note).
// Pure; unit-tested.
import type { Banner } from "./banners.ts";
import { SRC } from "./sources.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

/** 0.1 → "0.10", 0.0667 → "0.067": two significant digits, never
 *  rounded below the true floor's comparison with α (0.0498 is never
 *  shown, since it can reach P < 0.05). */
export function floorP(p: number): string {
  return p >= 1 ? "1" : p.toPrecision(2).replace(/e.*$/, "");
}

function listAnd(xs: string[]): string {
  return xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

/** The design in words: "3 and 3 values", "4 pairs", "3 subjects and 3 treatments". */
function design(r: R, f: R): string | null {
  const n: number[] = Array.isArray(f.n) ? f.n : [];
  if (r.test === "mann_whitney" || r.analysis === "anova") {
    return n.length >= 2 ? `${listAnd(n.map(String))} values` : null;
  }
  if (r.test === "wilcoxon_matched_pairs") {
    const zeros = typeof r.n_zero_differences === "number" ? r.n_zero_differences : 0;
    const pairs = `${n[0]} pair${n[0] === 1 ? "" : "s"}`;
    return zeros > 0 ? `${pairs} (${n[0] - zeros} with a nonzero difference)` : pairs;
  }
  if (r.analysis === "friedman") {
    return n.length === 2 ? `${n[0]} subject${n[0] === 1 ? "" : "s"} and ${n[1]} treatments` : null;
  }
  return null;
}

/** The most extreme data a rank test can see, in words. */
function extreme(r: R): string {
  if (r.test === "wilcoxon_matched_pairs") return "every difference of the same sign";
  if (r.analysis === "friedman") return "every subject ranking the treatments in the same order";
  return r.analysis === "anova" ? "each group's values all above or all below the others'"
    : "every value of one group beyond every value of the other";
}

/** The note, or null when the design can reach a two-sided P < α (or
 *  the result is not a rank test, or the engine could not say). tails:
 *  the t test's "two" | "greater" | "less"; a one-tailed P is reported
 *  as well as the two-tailed one, so the note adds the one-sided floor. */
export function rankFloorBanner(result: unknown, tails?: unknown): Banner | null {
  const r = result as R | null;
  const f = r?.min_attainable_p as R | undefined;
  if (!r || r.error || !f || typeof f.p !== "number") return null;
  const p: number = f.p;
  const alpha = typeof f.alpha === "number" ? f.alpha : 0.05;
  if (!(p >= alpha)) return null;
  const what = design(r, f);
  if (!what) return null;
  const sided = "two-sided";
  const omnibus = r.analysis === "anova" || r.analysis === "friedman";
  const one = (tails === "greater" || tails === "less") && typeof f.p_one_sided === "number"
    ? ` The one-tailed P you asked for can go down to ${floorP(f.p_one_sided)}`
      + `${f.p_one_sided >= alpha ? `, so it cannot reach P < ${alpha} either` : ""}.` : "";
  const pText = floorP(p);
  const a = String(alpha);
  const exact = f.method === "exact";
  return {
    id: "rank-floor", tone: "warn",
    title: `With ${what} the smallest possible ${omnibus ? "" : `${sided} `}P is ${pText}, so this design cannot reach P < ${a}`,
    body: `A rank test's P value counts the ways the ranks could fall. With this few values even `
      + `the most extreme data, ${extreme(r)}, give P = ${pText}`
      + `${exact ? "" : ` (by the ${String(f.method)} the test used)`}. `
      + "This is a property of the design, fixed before any data were collected, so a P value "
      + `of ${a} or more here is not evidence of no difference.` + one,
    fixes: [
      "A t test on the log of the values compares the same groups and can reach P < "
        + `${a} with this many values when the measurement is log-normal (concentrations, `
        + "titres, ratios). Choose between the two from what you know about the measurement, "
        + "before seeing the data, not from this result.",
      "For the next experiment, plan enough values per group for the test you intend to use.",
    ],
    explainer: "rank-floor",
    sources: [SRC.gpNonparametric, SRC.gpRatioT],
    action: "open-power",
  };
}
