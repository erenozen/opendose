// The Interaction block of an ordinary two-way ANOVA, as data: the
// interaction test from the ANOVA table, the engine's interaction
// contrasts (difference of differences with its CI, one per 2 x 2
// sub-square), the simple effects and the sentence that answers "is the
// effect different between the groups?". Every number comes from the
// engine (opendose.twoway_contrasts); this module only picks and words
// them. Pure; unit-tested.
import { formatSig } from "../../types.ts";
import { pLabel } from "../../report/pformat.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

export interface Contrast {
  rows: [string, string];
  cols: [string, string];
  label: string;
  effect1: number;
  effect2: number;
  difference: number;
  ci: [number, number] | null;
  p: number | null;
  se: number | null;
  df: number | null;
  /** 2 x 2 design: this contrast is the interaction test. */
  isInteraction: boolean;
}

export interface SimpleEffect {
  within: string;
  pair: string;
  difference: number;
  ci: [number, number] | null;
  p: number | null;
}

export interface InteractionSummary {
  /** The ANOVA's interaction row (null: additive model or not reported). */
  test: { F: number | null; dfn: number | null; dfd: number | null; p: number | null } | null;
  contrasts: Contrast[];
  /** Simple effects of the row factor within each column (the effect the
   *  contrasts compare), then of the column factor within each row. */
  rowEffects: SimpleEffect[];
  colEffects: SimpleEffect[];
  ciLevel: number;
  /** Why contrasts are missing or how they were computed. */
  notes: string[];
  withheld: boolean;
  explainer: string | null;
}

/** Whether an ordinary two-way ANOVA result is the main-effects
 *  (additive) model, fitted on request or because there is one value per
 *  cell. The engine (opendose.twoway) always names its model: "full (with
 *  interaction)" or "main effects only (additive)". */
export function isAdditiveTwoWay(result: R | null | undefined): boolean {
  const model = result?.model;
  return typeof model === "string" && /additive|main effects/i.test(model);
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const pair = (v: unknown): [number, number] | null => (Array.isArray(v) && v.length === 2
  && v.every((x) => typeof x === "number") ? [v[0], v[1]] : null);

function effects(blocks: unknown): SimpleEffect[] {
  if (!Array.isArray(blocks)) return [];
  return (blocks as R[]).flatMap((b) => (Array.isArray(b.differences) ? b.differences as R[] : [])
    .filter((d) => num(d.difference) !== null)
    .map((d) => ({ within: String(b.within ?? ""), pair: String(d.pair ?? "").replace(" - ", " − "),
      difference: d.difference as number, ci: pair(d.ci), p: num(d.p) })));
}

/** The block's content, or null when the result carries no contrasts
 *  (repeated-measures designs, older results). */
export function interactionSummary(result: unknown): InteractionSummary | null {
  const r = (result && typeof result === "object" ? result : {}) as R;
  const ic = r.interaction_contrasts as R | undefined;
  if (!ic || typeof ic !== "object") return null;
  const src = r.sources?.interaction as R | undefined;
  const test = src ? { F: num(src.F), dfn: num(src.df), dfd: num(r.sources?.residual?.df),
    p: num(src.p) } : null;
  const contrasts: Contrast[] = (Array.isArray(ic.contrasts) ? ic.contrasts as R[] : [])
    .filter((c) => num(c.difference) !== null)
    .map((c) => ({
      rows: [String(c.rows?.[0] ?? ""), String(c.rows?.[1] ?? "")],
      cols: [String(c.cols?.[0] ?? ""), String(c.cols?.[1] ?? "")],
      label: String(c.label ?? "").replace(/ - /g, " − "),
      effect1: c.effect_in_col_1, effect2: c.effect_in_col_2, difference: c.difference,
      ci: pair(c.ci), p: num(c.p), se: num(c.se), df: num(c.df),
      isInteraction: c.equals_interaction_test === true,
    }));
  const notes = [...(Array.isArray(ic.notes) ? ic.notes.map(String) : []),
    ...(Array.isArray(r.contrast_notes) ? r.contrast_notes.map(String) : [])]
    .filter((n, i, a) => a.indexOf(n) === i);
  return {
    test, contrasts,
    rowEffects: effects(r.simple_effects_rows_within_columns),
    colEffects: effects(r.simple_effects),
    ciLevel: num(ic.ci_level) ?? 0.95,
    notes, withheld: ic.withheld === true,
    explainer: typeof ic.explainer === "string" ? ic.explainer : null,
  };
}

const f = (v: number) => formatSig(v, 4);

/** "(Drug − Vehicle) is 3 in WT and 7 in KO: the difference between these
 *  effects is 4 (95% CI 1.337 to 6.663), P = 0.0071." */
export function contrastSentence(c: Contrast, ciLevel = 0.95): string {
  const effect = `${c.rows[1]} − ${c.rows[0]}`;
  const ci = c.ci ? ` (${Math.round(ciLevel * 100)}% CI ${f(c.ci[0])} to ${f(c.ci[1])})` : "";
  return `The effect (${effect}) is ${f(c.effect1)} in ${c.cols[0]} and ${f(c.effect2)} in `
    + `${c.cols[1]}: the difference between these effects is ${f(c.difference)}${ci}`
    + `${c.p !== null ? `, ${pLabel(c.p)}` : ""}.`;
}

/** Plain reading of the interaction, without "significant". */
export function contrastReading(c: Contrast, ciLevel = 0.95): string {
  if (!c.ci) return "";
  const [lo, hi] = c.ci;
  const level = `${Math.round(ciLevel * 100)}%`;
  if (lo > 0 || hi < 0) {
    return `The ${level} CI excludes 0: the effect differs between ${c.cols[0]} and ${c.cols[1]} `
      + `(effect in ${c.cols[1]} minus effect in ${c.cols[0]}: between ${f(lo)} and ${f(hi)}).`;
  }
  return `The ${level} CI includes 0: this experiment cannot tell whether the effect differs `
    + `between ${c.cols[0]} and ${c.cols[1]} (differences from ${f(lo)} to ${f(hi)} are `
    + "compatible with the data).";
}
