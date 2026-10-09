// The "Statistical analysis" paragraph of a methods section, built from a
// result and the table's reporting details: the test and its sidedness,
// the post hoc test and correction, how P values are given and the α,
// how effect sizes and their CIs were computed, what n is, exclusions and
// sample-size reasoning. Pure. Items follow the Nature reporting summary,
// Cell STAR Methods "Quantification and statistical analysis" and
// ARRIVE 2.0 item 7 (see checklists.ts).
import { describeResult } from "./describe.ts";
import { familyMethodsClause, resultFamily } from "./family.ts";
import { effectGroups, primaryEffect } from "./effects.ts";
import { P_STYLES, type PStyle } from "./pformat.ts";
import type { ReportMeta } from "./meta.ts";
import type { ReportPrefs } from "./prefs.ts";

const FLOOR_TEXT: Record<PStyle, string> = {
  graphpad: "P < 0.0001", apa: "p < .001", nejm: "P<0.001",
};

export function statsMethodsParagraph(result: unknown, prefs: ReportPrefs,
  meta: ReportMeta | undefined,
  opts: { powerJustification?: string | null; exclusions?: string | null } = {}): string {
  const info = describeResult(result);
  if (!info.test) return "";
  const parts: string[] = [];
  const est = (result as { analysis?: string } | null)?.analysis === "estimation";
  let t = est ? "Differences between groups were estimated with bootstrap confidence intervals (estimation statistics), with two-sided permutation tests"
    : `Data were analysed by ${info.test}${info.sided ? " (two-tailed)" : ""}`;
  // the family the P values were adjusted for (report/family.ts)
  const fam = resultFamily(result);
  if (info.posthoc && info.multiplicity === "corrected" && fam && fam.kind !== "unadjusted") t += `, followed by ${info.posthoc} (${familyMethodsClause(fam, { inParentheses: true })})`;
  else if (info.posthoc && info.multiplicity === "corrected") t += `, followed by ${info.posthoc} (${info.correction} adjustment of P values)`;
  else if (info.posthoc && info.multiplicity === "uncorrected") t += `, followed by ${info.posthoc} without correction for multiple comparisons`;
  parts.push(`${t}.`);
  if (info.assumptions) parts.push(`Assumptions: ${info.assumptions}.`);
  if (info.sided) {
    const gpFloor = prefs.pFloor && prefs.pFloor !== "1e-4" && prefs.pStyle === "graphpad";
    const floor = !gpFloor ? `down to ${FLOOR_TEXT[prefs.pStyle]}`
      : prefs.pFloor === "exact" ? "without a floor" : `down to P < ${prefs.pFloor === "1e-6" ? "0.000001" : "1e-10"}`;
    parts.push(`P values are reported as exact values ${floor} (${P_STYLES[prefs.pStyle].label} style), and P < 0.05 was taken as the threshold for statistical significance.`);
  }
  const eff = primaryEffect(effectGroups(result, prefs));
  if (eff) {
    parts.push(`Effect sizes are reported as ${eff.measure}${eff.ci ? ` with ${Math.round(eff.ciLevel * 100)}% confidence intervals${eff.ciMethod ? ` (${eff.ciMethod})` : ""}` : ""}.`);
  }
  if (meta?.unit) {
    parts.push(`n is the number of ${meta.unit}${meta.experiments ? `, from ${meta.experiments} independent experiment${meta.experiments === 1 ? "" : "s"}` : ""}.`);
  } else if (meta?.experiments) {
    parts.push(`Data come from ${meta.experiments} independent experiment${meta.experiments === 1 ? "" : "s"}.`);
  }
  // Typed in Reporting details, and / or counted from the values excluded
  // in the table with their reasons (project/exclusions.ts, ARRIVE 2.0
  // item 3b): "n = 8 enrolled, 7 analysed (1 excluded: tumour ulceration)".
  const counted = opts.exclusions?.trim();
  if (meta?.exclusions && counted) {
    parts.push(`Exclusions: ${meta.exclusions.replace(/\.$/, "")}; ${counted}.`);
  } else if (meta?.exclusions || counted) {
    parts.push(`Exclusions: ${(meta?.exclusions ?? counted!).replace(/\.$/, "")}.`);
  }
  const ss = opts.powerJustification ?? meta?.sampleSize;
  if (ss) parts.push(`Sample size: ${ss.replace(/\.$/, "")}.`);
  return parts.join(" ");
}
