// Reporting preferences: how P values are written, whether "ns" is shown,
// and which effect-size family is the default. They live in the project
// preferences (Prefs.report), so a saved file reopens reporting the way
// it was made. Pure data + validation (no React), unit-tested.

/** P-value style presets (pformat.ts has the rules and their sources). */
export type PStyle = "graphpad" | "apa" | "nejm";

/** Standardized mean difference shown first: Cohen's d or Hedges' g. */
export type SmdPref = "d" | "g";

/** Variance explained shown first: eta squared (partial in factorial
 *  designs) or omega squared (partial in factorial designs). */
export type VariancePref = "eta2" | "omega2";

export interface ReportPrefs {
  pStyle: PStyle;
  /** Leave the "ns" summary out (tables, brackets, legends). */
  hideNs: boolean;
  smd: SmdPref;
  variance: VariancePref;
}

export const DEFAULT_REPORT: ReportPrefs = {
  pStyle: "graphpad", hideNs: false, smd: "d", variance: "eta2",
};

export const P_STYLE_LABELS: Record<PStyle, string> = {
  graphpad: "GraphPad (P = 0.0321, P < 0.0001)",
  apa: "APA 7 (p = .032, p < .001)",
  nejm: "NEJM (P=0.03, P<0.001)",
};

export const SMD_LABELS: Record<SmdPref, string> = {
  d: "Cohen's d",
  g: "Hedges' g (small-sample corrected)",
};

export const VARIANCE_LABELS: Record<VariancePref, string> = {
  eta2: "η² (partial η² in factorial designs)",
  omega2: "ω² (partial ω² in factorial designs; less biased)",
};

const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T =>
  (typeof v === "string" && (list as readonly string[]).includes(v) ? v as T : d);

export function sanitizeReport(raw: unknown): ReportPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    pStyle: oneOf(r.pStyle, ["graphpad", "apa", "nejm"] as const, DEFAULT_REPORT.pStyle),
    hideNs: r.hideNs === true,
    smd: oneOf(r.smd, ["d", "g"] as const, DEFAULT_REPORT.smd),
    variance: oneOf(r.variance, ["eta2", "omega2"] as const, DEFAULT_REPORT.variance),
  };
}

/** The reporting preferences of a project (defaults when absent). */
export function reportPrefsOf(p: { report?: unknown } | null | undefined): ReportPrefs {
  return sanitizeReport(p?.report);
}
