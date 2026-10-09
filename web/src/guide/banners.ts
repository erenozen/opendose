// Plain-language banners above a results sheet: what a fit's warning
// means and what to do about it, why the omnibus and pairwise results can
// disagree, normalised controls with SD 0, what Normalize did to SD/SEM,
// and the switch to a mixed model when repeated measures have gaps. Pure;
// unit-tested.
import { formatPValue } from "../report/pformat.ts";
import { analysisKind, fitAmbiguous, wideParams, type ResultContext } from "./checks.ts";
import { normalisedControl, missingInRows } from "./stats.ts";
import { SRC, type Source } from "./sources.ts";
import { withheldInfo } from "../sheets/common/withheld.ts";
import { blockBanner, blockRemoved, MATCHED_BY, pairedBlockBanner } from "./blocking.ts";
import { withheldBanner } from "./smallN.ts";

export interface Banner {
  id: string;
  tone: "warn" | "info";
  title: string;
  body: string;
  fixes: string[];
  explainer?: string;
  sources: Source[];
  /** A one-click follow-up under the banner (the power tool). */
  action?: "open-power";
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

const fmtP = (p: number) => formatPValue(p);

function fitBanners(ctx: ResultContext, r: R): Banner[] {
  const out: Banner[] = [];
  const sets = (r.datasets ?? []) as R[];
  const o = ctx.options as R;
  const constrained = !!(o.top?.enabled || o.bottom?.enabled);
  const failed = sets.filter((d) => d.error);
  if (failed.length) {
    const msg = failed.map((d) => `${d.name}: ${String(d.error)}`).join("; ");
    const converge = failed.some((d) => /converge|starting value/i.test(String(d.error)));
    out.push({ id: "fit-failed", tone: "warn",
      title: converge ? "The fit did not converge" : "A fit could not be computed",
      body: `${msg}. ${converge ? "The fitting procedure could not settle on a best-fit "
        + "curve, usually because the data do not follow the model's shape (no plateaus, "
        + "a flat response) or a constraint is impossible." : ""}`.trim(),
      fixes: [
        "Check the X values: concentrations, unless \"X values are already log10(concentration)\" is ticked; a zero dose has no logarithm.",
        "Plot the data: if the response never changes, no sigmoid can be fitted.",
        "Constrain the plateau the data don't reach (Bottom = 0 or Top = 100 after normalising, or the control mean).",
        "Try a simpler model: fix the Hill slope (3-parameter model).",
      ],
      explainer: "ambiguous", sources: [SRC.gpNotConverged] });
  }
  const amb = sets.filter((d) => fitAmbiguous(d.fit));
  if (amb.length) {
    out.push({ id: "fit-ambiguous", tone: "warn",
      title: `Ambiguous fit: ${amb.map((d) => d.name).join(", ")}`,
      body: "The data are consistent with many different curves: at least one parameter can "
        + "be traded off against another with almost no change in fit (dependency > 0.9999). "
        + "Usually the curve does not reach one of its plateaus within the doses tested. The "
        + "curve may still be fine to interpolate from, but the parameters, including the "
        + "IC50, should not be reported.",
      fixes: [
        constrained ? "Check that the constrained plateau matches your controls."
          : "Constrain the plateau the data don't reach to the control value (e.g. Bottom = 0, Top = 100 after normalising).",
        "Widen the dose range so the curve reaches both plateaus.",
        "Share the poorly defined parameter across data sets (global fit) if it should be the same.",
        "Use a simpler model: fix the Hill slope to -1 (inhibitor) or 1 (agonist).",
      ],
      explainer: "ambiguous", sources: [SRC.gpAmbiguous] });
  }
  // an IC50 the fit reports as "> top dose" has its own block with the
  // option and sources (sheets/xy/rangeFlags.tsx): not repeated here
  const extra = sets.filter((d) => d.fit?.extrapolation && !d.fit?.range_flags?.report_as);
  if (extra.length) {
    out.push({ id: "fit-extrapolated", tone: "warn",
      title: `The IC50/EC50 lies outside the doses tested: ${extra.map((d) => d.name).join(", ")}`,
      body: "The fitted midpoint falls beyond the lowest or highest concentration, so it is "
        + "read off the model's tail rather than measured; its confidence interval is wide "
        + "and the value depends heavily on the assumed plateaus.",
      fixes: [
        "Repeat with concentrations that bracket the midpoint (a wider or shifted range).",
        "If the plateaus are known from controls, constrain them; then say the IC50 is extrapolated.",
        "Report it as \"> highest dose\" (or \"< lowest dose\") rather than as a number.",
      ],
      explainer: "relative-absolute-ic50", sources: [SRC.gpRelAbsIc50, SRC.gpWideCi] });
  }
  const wide = sets.filter((d) => d.fit && !fitAmbiguous(d.fit) && wideParams(d.fit).length);
  if (wide.length) {
    out.push({ id: "fit-wide-ci", tone: "warn", title: "Very wide confidence intervals",
      body: `${wide.map((d) => `${d.name}: ${wideParams(d.fit).join(", ")}`).join("; ")}. If a `
        + "confidence interval is very wide, the data don't define that parameter well; an "
        + "open limit means the data cannot bound it at all.",
      fixes: [
        "Add concentrations where the curve changes (around the midpoint) and on both plateaus.",
        "Constrain parameters known from controls, or share them across data sets.",
        "Choose profile-likelihood confidence intervals in the fit options: they are asymmetric and show open limits honestly.",
      ],
      explainer: "ambiguous", sources: [SRC.gpWideCi] });
  }
  const hits = hitConstraints(o, sets);
  if (hits.length) {
    out.push({ id: "fit-hit-constraint", tone: "warn",
      title: `Hit constraint: ${hits.join(", ")}`,
      body: "A fitted value sits exactly on the limit of its allowed range: the best fit wants "
        + "to go beyond it, so the reported value is the limit you set, not an estimate, and "
        + "its confidence interval is not meaningful.",
      fixes: [
        "Check that the range points the right way (e.g. a minimum, not a maximum).",
        "If the limit is a known value, make it a constant instead of a range.",
        "Otherwise remove the range constraint and see whether the data define the parameter.",
      ],
      sources: [SRC.gpHitConstraint] });
  }
  if (o.normalize?.enabled) out.push(normalizeBanner(o.normalize));
  return out;
}

/** Range constraints (user-defined equations: between / greater than /
 *  less than / positive) whose fitted value lands on the limit. */
export function hitConstraints(o: R, sets: R[]): string[] {
  const cons = (o.userEquation?.constraints ?? null) as Record<string, R> | null;
  if (!cons || typeof cons !== "object") return [];
  const num = (v: unknown) => (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))
    ? Number(v) : typeof v === "number" ? v : null);
  const out = new Set<string>();
  for (const d of sets) {
    for (const [name, e] of Object.entries((d.fit?.params ?? {}) as Record<string, R>)) {
      const c = cons[name];
      if (!c || typeof e.value !== "number" || e.constrained) continue;
      const lims = c.kind === "between" ? [num(c.min), num(c.max)]
        : c.kind === "greater" ? [num(c.min)] : c.kind === "less" ? [num(c.max)]
          : c.kind === "positive" ? [0] : [];
      if (lims.some((l) => l !== null && Math.abs(e.value - l) <= 1e-6 * Math.max(1, Math.abs(l)))) {
        out.add(name);
      }
    }
  }
  return [...out];
}

function normalizeBanner(n: R): Banner {
  const sep = n.subcolumns === "separate";
  return { id: "normalized", tone: "info", title: "What normalising did to SD and SEM",
    body: "Each data set was rescaled so its 0% reference becomes 0 and its 100% reference "
      + "becomes 100: every value is shifted and multiplied by 100 / (100% − 0% reference), "
      + "so SDs and SEMs are multiplied by the same factor. The references themselves are "
      + "treated as exact; their uncertainty is not carried over."
      + (sep ? " Replicates were normalised separately, so the reference rows have SD 0: "
        + "don't test other rows against them as if they were measured." : ""),
    fixes: sep ? ["To compare with the 100% reference, use a one-sample t test against 100."] : [],
    explainer: "normalize-sd", sources: [SRC.gpNormalizing] };
}

interface Omnibus { label: string; p: number }

/** Overall test P values and the pairwise comparisons that follow them. */
function omnibusAndPairs(kind: string, r: R): { omni: Omnibus[]; pairs: number[] } | null {
  const pairsOf = (mc: R | undefined) => (Array.isArray(mc?.comparisons)
    ? (mc!.comparisons as R[]).map((c) => c.p_adjusted).filter((p): p is number => typeof p === "number")
    : []);
  if (kind === "anova" && r.table && typeof r.table.p === "number") {
    return { omni: [{ label: "one-way ANOVA", p: r.table.p }], pairs: pairsOf(r.multiple_comparisons) };
  }
  if (kind === "kruskal" && typeof r.p === "number") {
    return { omni: [{ label: "Kruskal-Wallis test", p: r.p }], pairs: pairsOf(r.dunns) };
  }
  if (kind === "friedman" && typeof r.p === "number") {
    return { omni: [{ label: "Friedman test", p: r.p }], pairs: pairsOf(r.dunns) };
  }
  if (kind === "welch_anova" && typeof r.welch?.p === "number") {
    return { omni: [{ label: "Welch's ANOVA", p: r.welch.p }], pairs: pairsOf(r.multiple_comparisons) };
  }
  if (kind === "grouped_two_way" || kind === "two_way_anova") {
    const omni: Omnibus[] = [];
    for (const [k, s] of Object.entries((r.sources ?? r.fixed_effects ?? {}) as Record<string, R>)) {
      const p = typeof s?.p_geisser_greenhouse === "number" ? s.p_geisser_greenhouse : s?.p;
      if (typeof p === "number" && !/subject|residual|error/i.test(k)) {
        omni.push({ label: k.replace(/_/g, " "), p });
      }
    }
    return { omni, pairs: pairsOf(r.multiple_comparisons) };
  }
  return null;
}

function disagreementBanner(kind: string, r: R): Banner | null {
  const x = omnibusAndPairs(kind, r);
  if (!x || !x.omni.length || !x.pairs.length) return null;
  const anyPair = x.pairs.some((p) => p < 0.05);
  const sigOmni = x.omni.filter((o) => o.p < 0.05);
  const two = kind === "grouped_two_way" || kind === "two_way_anova";
  if (sigOmni.length && !anyPair) {
    const which = sigOmni.map((o) => `${o.label} ${fmtP(o.p)}`).join(", ");
    return { id: "omnibus-no-pairs", tone: "info",
      title: "Overall test significant, but no pairwise comparison is",
      body: `${which}, yet no multiplicity-adjusted comparison reaches P < 0.05. This is not `
        + "a contradiction. The overall test asks whether the means differ in any way (for "
        + "example a trend across groups, or one group against the average of the others); "
        + "the comparisons ask about specific pairs and are corrected for how many there are, "
        + "so each has less power."
        + (two ? " A significant interaction says that the effect of one factor depends on "
          + "the other; that pattern can be real even when no single within-row comparison "
          + "is large enough on its own." : ""),
      fixes: [
        "Report both: the overall P and the comparisons with their confidence intervals.",
        "Ask a narrower question, planned in advance (e.g. each group vs control only): a smaller family has more power.",
        two ? "Plot the cell means: the interaction is the difference between the lines' shapes."
          : "Look at the confidence intervals of the differences, not just the stars.",
      ],
      explainer: "posthoc", sources: [SRC.gpTwoWayMc, SRC.gpAdjustedP] };
  }
  if (!sigOmni.length && anyPair) {
    return { id: "pairs-no-omnibus", tone: "info",
      title: "A pairwise comparison is significant, but the overall test is not",
      body: `${x.omni.map((o) => `${o.label} ${fmtP(o.p)}`).join(", ")}, while at least one `
        + "adjusted comparison has P < 0.05. The tests ask different questions and are "
        + "calculated differently, so this can happen. Multiple comparisons tests are valid "
        + "without a significant overall test, but a single significant pair among many, with "
        + "a non-significant ANOVA, is weak evidence: treat it as a lead to confirm.",
      fixes: ["Report the overall P together with the comparison and its confidence interval."],
      explainer: "posthoc", sources: [SRC.gpTwoWayMc] };
  }
  return null;
}

/** Every banner for this results sheet (empty while no result). */
export function resultBanners(ctx: ResultContext): Banner[] {
  const r = ctx.result as R | null;
  if (!r || r.error) return [];
  const kind = analysisKind(ctx);
  const out: Banner[] = [];
  if (kind === "nonlin") return fitBanners(ctx, r);
  // One independent value in a group: P withheld (small-n-honesty).
  const wh = withheldInfo(r);
  if (wh) return [withheldBanner(wh, ctx.needed ?? null)];
  // Matched by experiment / subject: what the matching removed
  // (experiment-as-block).
  const byExperiment = (ctx.options as R)[MATCHED_BY] === "experiment";
  const removed = blockRemoved(r);
  if (removed) out.push(blockBanner(removed, byExperiment));
  const pairing = byExperiment && r.analysis === "ttest" ? pairedBlockBanner(r) : null;
  if (pairing) out.push(pairing);
  if (kind === "normalize") {
    out.push(normalizeBanner(ctx.options));
    return out;
  }
  const dis = disagreementBanner(kind, r);
  if (dis) out.push(dis);

  const columnLike = ctx.analysisId === "column";
  const ctl = columnLike ? normalisedControl(ctx.groups) : null;
  if (ctl && kind !== "column_statistics") {
    const v = ctl.mean === 100 ? "100" : "1";
    out.push({ id: "normalised-control", tone: "warn",
      title: `${ctl.name} is normalised to ${v} (SD 0)`,
      body: `Every value of ${ctl.name} equals ${v}: these are not measurements but the `
        + "reference every other value was divided by. A t test or ANOVA that includes this "
        + "column treats it as measured without error, which is not valid.",
      fixes: [
        `Test the treated groups against ${v} instead: Column statistics with the one-sample test against ${v} and "ratio t test" (the logs) ticked.`,
        "If you have the raw values per experiment, run a ratio paired t test on them.",
      ],
      explainer: "normalised-control", sources: [SRC.gpNormalizeFaq, SRC.gpRatioT] });
  }
  if (kind === "grouped_two_way" && r.missing && r.analysis === "mixed_rm_two_way") {
    out.push({ id: "mixed-switch", tone: "info",
      title: "Missing values: fitted as a mixed-effects model",
      body: "Repeated-measures ANOVA cannot use a subject with any missing value, so OpenDose "
        + `fitted a mixed-effects model instead${typeof r.n_missing === "number"
          ? ` (${r.n_missing} missing of ${r.n_values + r.n_missing} values)` : ""}. It gives `
        + "the same results as RM ANOVA when nothing is missing and keeps the incomplete "
        + "subjects. This is valid if values are missing for reasons unrelated to the outcome.",
      fixes: ["If subjects dropped out because of the treatment, report that: no analysis fully corrects it."],
      explainer: "missing-values", sources: [SRC.gpMixed] });
  }
  if ((kind === "rm_anova" || kind === "friedman") && r.analysis !== "mixed_rm_one_way") {
    const m = missingInRows(ctx.table, true);
    if (m.rows) {
      out.push({ id: "rm-dropped", tone: "warn",
        title: `${m.rows} subject${m.rows === 1 ? "" : "s"} left out (missing values)`,
        body: "Repeated-measures ANOVA and the Friedman test use only rows where every "
          + "condition has a value, so these rows were dropped.",
        fixes: ["Report how many subjects were excluded.",
          "A mixed-effects model keeps incomplete subjects: tick \"Keep the subjects with missing values\" in the RM one-way ANOVA options, or use a Grouped table for two-factor designs."],
        explainer: "missing-values", sources: [SRC.gpMixed] });
    }
  }
  return out;
}
