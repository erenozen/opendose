// Each independent experiment (day, plate, run) as a block (need
// `experiment-as-block`). The "Which test?" wizard asks "Was each
// condition run once per experiment, on different days?"; a yes opens the
// matched analysis with the experiments as the rows (paired t test for two
// conditions, repeated-measures one-way ANOVA for more), and the results
// say how much day-to-day variation the matching removed: the engine's
// SS for subjects (rows) as a share of the total SS. Sources: the GraphPad
// guide's repeated-measures one-way ANOVA checklist (matching removes the
// variation between subjects; question it when it does not help) and
// Festing 2014 on randomised block designs. Pure; unit-tested.
import type { Banner } from "./banners.ts";
import type { Recommendation } from "./recommend.ts";
import { SRC } from "./sources.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

/** Options key the wizard sets on the analysis it opens. */
export const MATCHED_BY = "matchedBy";

const LAYOUT = "Column table: one column per condition, one row per experiment (day), each "
  + "row holding that day's value for every condition.";

/** The recommendation for a design run once per experiment on different
 *  days, made from the matched one (`paired`). */
export function blockedRecommendation(matched: Recommendation): Recommendation {
  const rm = matched.rule === "rm_one_way" || matched.rule === "rm_one_way_missing";
  const paired = matched.rule === "paired_t";
  const target = matched.target
    ? { ...matched.target, options: { ...matched.target.options, [MATCHED_BY]: "experiment" },
      layout: matched.target.tableType === "column" ? LAYOUT : matched.target.layout }
    : null;
  const why = "Each condition was run once in every experiment, on different days, so the "
    + "experiment is a block: values from the same day share that day's cells, reagents and "
    + "instrument settings. Matching by experiment removes the day-to-day differences from the "
    + "comparison, which an ordinary (unmatched) test would leave in the error and lose power to.";
  return {
    ...matched,
    rule: rm ? "block_rm_one_way" : paired ? "block_paired_t" : `block_${matched.rule}`,
    reason: `${why} ${matched.reason}`,
    target,
    alternatives: [
      ...matched.alternatives,
      { test: rm ? "Ordinary one-way ANOVA" : "Unpaired t test",
        when: "only if the experiments do not differ from each other at all; it ignores the "
          + "days and usually loses power" },
    ],
    notes: [...matched.notes, "Enter one row per experiment (day) and one column per "
      + "condition; the results show how much day-to-day variation the matching removed."],
    sources: [...matched.sources, SRC.gpRmChecklist, SRC.festing2014],
  };
}

export interface BlockRemoved {
  ssSubject: number;
  ssTotal: number;
  share: number;
  /** Rows (experiments) used. */
  blocks: number | null;
}

/** SS between rows (experiments) and its share of the total, from an RM
 *  one-way ANOVA result (total = treatment + subjects + error when the
 *  engine does not report it). */
export function blockRemoved(result: unknown): BlockRemoved | null {
  const r = result as R | null;
  if (!r || typeof r !== "object" || r.error || r.analysis !== "rm_one_way_anova") return null;
  const t = r.table ?? {};
  const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  if (!fin(t.ss_subject)) return null;
  const total = fin(t.ss_total) ? t.ss_total
    : fin(t.ss_treatment) && fin(t.ss_error) ? t.ss_treatment + t.ss_subject + t.ss_error : null;
  if (total === null || total <= 0) return null;
  return { ssSubject: t.ss_subject, ssTotal: total, share: t.ss_subject / total,
    blocks: fin(r.n_subjects) ? r.n_subjects : null };
}

const sig = (v: number) => (Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0)
  ? v.toPrecision(4) : String(Number(v.toPrecision(4))));

/** The paired t test's version, opened from the wizard's block question:
 *  the engine's pairing correlation, worded as what the days shared. */
export function pairedBlockBanner(result: unknown): Banner | null {
  const r = result as R | null;
  const pc = r?.pairing_correlation;
  if (!r || r.error || r.test !== "paired_t" || typeof pc?.r !== "number" || !Number.isFinite(pc.r)) {
    return null;
  }
  const rTxt = Number(pc.r.toPrecision(3));
  return {
    id: "block-removed", tone: "info",
    title: `Day-to-day (between-experiment) differences removed by pairing: r = ${rTxt}`,
    body: "The paired t test compares the two conditions within each experiment, so whatever "
      + "raised or lowered both values on a given day drops out of the comparison. The "
      + `correlation of the two conditions across experiments (r = ${rTxt}) says how much the `
      + "days differed: the higher it is, the more the pairing gained over an unpaired test."
      + (pc.r <= 0 ? " Here it is not positive: the days did not differ much, so say why the "
        + "design is paired rather than relying on this number." : ""),
    fixes: [], sources: [SRC.gpPairedT, SRC.festing2014],
  };
}

/** The note on an RM one-way ANOVA: "Day-to-day (between-experiment)
 *  differences removed: SS = 123.4, 56% of the total". */
export function blockBanner(b: BlockRemoved, byExperiment: boolean): Banner {
  const pct = `${Math.round(b.share * 100)}%`;
  const what = byExperiment ? "Day-to-day (between-experiment) differences removed"
    : "Subject-to-subject (between-row) differences removed";
  return {
    id: "block-removed", tone: "info",
    title: `${what}: SS = ${sig(b.ssSubject)}, ${pct} of the total`,
    body: `The matched analysis took the differences between ${byExperiment ? "experiments"
      : "rows (subjects)"}${b.blocks ? ` (${b.blocks} ${byExperiment ? "experiments" : "rows"})` : ""} `
      + "out of the error before comparing the conditions. An ordinary one-way ANOVA would have "
      + `left this ${pct} of the variation in the error term. `
      + (b.share < 0.05 ? "Here the matching removed little: if the rows are not truly matched, "
        + "say why the design is matched rather than relying on this number."
        : "The more of the variation the blocks account for, the more power matching gains."),
    fixes: [],
    sources: [SRC.gpRmChecklist, SRC.festing2014],
  };
}
