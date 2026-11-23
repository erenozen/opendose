// The words of one parameter row of a curve fit's best-fit table: the
// value, SE and CI cells as the per-curve card prints them, and the
// caveats of a fit (ambiguous, extrapolated, at a constraint). The card
// (components/ResultsPanel.tsx) and the fit summary (fitSummary.ts) both
// read them from here, so a summary row is always its card's numbers.
// Every number goes through formatSig; nothing is re-rounded. Pure.
import { formatSig, type FitResult, type ParamEntry } from "../../types.ts";
import { paramCI } from "../../components/answer/keyFacts.ts";
import {
  NOT_REACHED, displayOf, isLogMidpoint, isMidpoint, isRatioParam, rangeHidesSpread, ratioText,
} from "./rangeReport.ts";

// A parameter on its range limit: the SE and CI assume it could move
// both ways (curve-fitting guide, "Constraining parameters").
export const AT_BOUND_SE = "at its constraint: SE not reliable";

export const AMBIGUOUS_NOTE = "Some parameters are not defined by the data (dependency > 0.9999), so the "
  + "fit is ambiguous. Consider constraining parameters.";

/** The text of a parameter's best-fit cell: "> 30 (not reached in the
 *  range tested)", "4.2e-7 ⚑ extrapolated (above the range tested)",
 *  "= 100" (constrained) or the number. rangeFlags.tsx RangeValueCell
 *  draws the same words. */
export function valueText(name: string, e: ParamEntry, fit: unknown): string {
  const d = displayOf(fit);
  if (d && !e.constrained) {
    if (isMidpoint(name, d) || isLogMidpoint(name, d)) {
      if (d.mode === "bound") {
        return `${isLogMidpoint(name, d) ? d.logBound ?? d.bound : d.bound} (${NOT_REACHED})`;
      }
      return `${formatSig(e.value)} ⚑ extrapolated (${d.relation === ">" ? "above" : "below"} the range tested)`;
    }
    if (d.mode === "bound" && isRatioParam(name)) return ratioText(d);
  }
  return e.constrained ? `= ${formatSig(e.value)}` : formatSig(e.value);
}

/** An IC50 beyond the doses tested reported as a bound: no SE or CI. */
function hidden(name: string, e: ParamEntry, fit: unknown): boolean {
  return !e.constrained && rangeHidesSpread(name, fit);
}

/** The Std. Error cell. */
export function seText(name: string, e: ParamEntry, fit: unknown): string {
  return e.at_bound ? AT_BOUND_SE : e.constrained || e.derived || hidden(name, e, fit)
    ? "n/a" : formatSig(e.se);
}

/** The 95% CI cell. */
export function ciText(name: string, e: ParamEntry, fit: unknown): string {
  return e.constrained ? "(constrained)" : e.at_bound ? "not reported (at its constraint)"
    : hidden(name, e, fit) ? "not reported (extrapolated)" : paramCI(e);
}

/** The value reported for a linked table or a sort: null where the card
 *  does not report a number (an IC50 shown as "> 30", a ratio of it). */
export function reportedValue(name: string, e: ParamEntry, fit: unknown): number | null {
  if (hidden(name, e, fit)) return null;
  const d = displayOf(fit);
  if (d && d.mode === "bound" && isRatioParam(name) && !e.constrained) return null;
  return typeof e.value === "number" && Number.isFinite(e.value) ? e.value : null;
}

// Every model that can report this fits against log10(dose), so the stored
// x values are logs and read back as concentrations.
export function extrapolationNote(e: NonNullable<FitResult["extrapolation"]>): string {
  const at = formatSig(10 ** e.value);
  const lo = formatSig(10 ** e.x_min);
  const hi = formatSig(10 ** e.x_max);
  const edge = e.direction === "above" ? hi : lo;
  const fold = formatSig(10 ** e.distance, 2);
  const name = e.param.replace("Log", "");
  return `The fitted ${name} (${at}) falls ${e.direction} every dose tested `
    + `(${lo} to ${hi}): about ${fold}x past ${edge}. The curve does not `
    + `reach its midpoint inside your data, so this value is read off the `
    + `model's tail rather than measured, which is why its confidence `
    + `interval is wide. Doses beyond ${edge} are what would pin it down.`;
}

export type CaveatKind = "ambiguous" | "extrapolated" | "constraint";

export interface Caveat {
  kind: CaveatKind;
  /** The badge: "Ambiguous", "Extrapolated", "At a constraint". */
  label: string;
  /** Why, in a sentence. */
  reason: string;
}

/** The caveats of one fit, in the order the card's badges show them. */
export function fitCaveats(fit: FitResult): Caveat[] {
  const out: Caveat[] = [];
  if (fit.status === "ambiguous") out.push({ kind: "ambiguous", label: "Ambiguous", reason: AMBIGUOUS_NOTE });
  const d = displayOf(fit);
  if (d) {
    out.push({ kind: "extrapolated", label: "Extrapolated",
      reason: `${d.text}: ${d.reasons.join("; ")}.` });
  } else if (fit.extrapolation) {
    out.push({ kind: "extrapolated", label: "Extrapolated", reason: extrapolationNote(fit.extrapolation) });
  }
  const bound = (fit.param_order ?? Object.keys(fit.params)).filter((n) => fit.params[n]?.at_bound);
  if (bound.length) {
    out.push({ kind: "constraint", label: "At a constraint",
      reason: `${bound.join(", ")} ended on the limit set for ${bound.length === 1 ? "it" : "them"}, `
        + "so the SE and CI are not reliable." });
  }
  return out;
}
