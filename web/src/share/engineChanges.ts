// Engine change log: one line per change that can move a number a saved
// project shows, by the app version that shipped it. When a reopened
// project's results are recomputed and a number changes (project/
// reproduce.ts), the reproduction strip and the History panel give these
// lines as the "why". Add an entry with every release whose engine
// changes results; `analyses` lists the result ids (`result.analysis`) a
// change can touch, so a changed number is explained by the relevant
// lines first. Source of the 0.3.0 entries: docs/validation/
// results-engine.md, "What changed in engine/opendose/" (2026-10-04).
import type { ReproductionReport } from "../project/reproduce.ts";

export interface EngineChange {
  /** App version that first shipped the change. */
  version: string;
  date: string;
  note: string;
  /** Result ids (`result.analysis`) it can change; empty = any. */
  analyses: string[];
}

const FITS = ["dose_response", "nonlin", "global_fit", "user_equation", "schild", "quantal"];

export const ENGINE_CHANGES: EngineChange[] = [
  { version: "0.3.0", date: "2026-10-04", analyses: FITS,
    note: "Nonlinear fits converge to tighter tolerances (1e-12, then a Gauss-Newton polish): best-fit values can move in the last digits, and fits that stopped early now reach the certified optimum." },
  { version: "0.3.0", date: "2026-10-04", analyses: FITS,
    note: "Standard errors use a scale-aware, central-difference Jacobian: SEs and CIs no longer depend on the units of X (an EC50 in M and in nM had SEs up to 7% apart)." },
  { version: "0.3.0", date: "2026-10-04", analyses: FITS,
    note: "A fit no better than a horizontal line restarts from more starting values; when none helps it is reported as ambiguous." },
  { version: "0.3.0", date: "2026-10-04", analyses: ["survival"],
    note: "Log-rank: the variance (R survdiff) form is reported next to the Peto form, which is unchanged." },
  { version: "0.3.0", date: "2026-10-04", analyses: ["two_way_anova"],
    note: "Two-way ANOVA with one value per cell fits the main-effects (additive) model." },
  { version: "0.3.0", date: "2026-10-04", analyses: ["contingency"],
    note: "Contingency tables: Fisher's exact test for r x c tables, one-sided Fisher P values and the conditional MLE odds ratio were added; the CI level option is applied." },
  { version: "0.3.0", date: "2026-10-04", analyses: FITS,
    note: "The extra sum-of-squares F test and AICc no longer divide by zero when the more complex model fits exactly." },
  { version: "0.3.0", date: "2026-10-04",
    analyses: ["anova", "two_way_anova", "rm_two_way_mixed", "rm_two_way_both", "three_way_anova", "anova_unequal_var"],
    note: "Tukey, Games-Howell and Newman-Keuls P values come from a deterministic studentized-range integral (exact to 1e-13 for two groups) instead of SciPy's." },
];

/** -1, 0, 1 comparing dotted versions numerically ("0.10.0" > "0.9.1");
 *  anything that is not a version sorts first. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => (/^\d+(\.\d+)*$/.test(v) ? v.split(".").map(Number) : null);
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return pa ? 1 : pb ? -1 : 0;
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

/**
 * The changes shipped after `saved` up to and including `current` (all
 * up to `current` when the saving version is unknown), relevant to
 * `analysis` first. With the same version on both sides (a rebuilt
 * engine of one release) every entry of that version is returned.
 */
export function changesBetween(saved: string | null, current: string,
  analysis?: string): EngineChange[] {
  const inRange = ENGINE_CHANGES.filter((c) => {
    const upTo = compareVersions(c.version, current) <= 0 || !/^\d/.test(current);
    if (!upTo) return false;
    if (!saved || !/^\d/.test(saved)) return true;
    const cmp = compareVersions(c.version, saved);
    return cmp > 0 || (cmp === 0 && compareVersions(saved, current) === 0);
  });
  if (!analysis) return inRange;
  return inRange.filter((c) => !c.analyses.length || c.analyses.includes(analysis));
}

/** The change-log entries that may explain a reproduction report's
 *  changed sheets (each once, in log order). */
export function whyLines(r: Pick<ReproductionReport, "savedWith" | "current" | "sheets">): EngineChange[] {
  const saved = r.savedWith?.app ?? null;
  const out: EngineChange[] = [];
  for (const c of ENGINE_CHANGES) {
    if (r.sheets.some((s) => s.changes.length
      && changesBetween(saved, r.current.app, s.analysis).includes(c))) out.push(c);
  }
  return out;
}
