// The "Across experiments" headline (P-08): for each data set fitted per
// experiment, the mean pIC50 (or mean logIC50 when the concentration unit
// is not molar) with its t-based 95% CI, SD and n = experiments, the
// geometric-mean IC50 with its CI, the IC50 of each experiment and the
// experiments left out. Strings come from sheets/xy/experiments.ts, which
// prints the engine's numbers with formatSig, the formatter the typeset
// table uses. Pure; unit-tested.
import type { KeyFigure } from "./keyFacts.ts";
import { exclusionText, type PotencySummary } from "../../sheets/xy/experiments.ts";

export interface PotencyItem {
  title: string;
  figure: KeyFigure;
  /** "IC50 per experiment: 4.516e-8, 1.014e-7, 1.72e-7 M". */
  perExperiment?: string;
  /** "Experiment 3 left out: ambiguous fit: …". */
  excluded: string[];
  notes: string[];
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function potencyItem(s: PotencySummary, xUnit: string): PotencyItem {
  const u = xUnit ? ` ${xUnit}` : "";
  const molar = !!s.pMean;
  const name = molar ? `Mean p${s.label}` : `Mean log${s.label}`;
  const value = (molar ? s.pMean : s.meanLog) ?? "n/a";
  const ci = molar ? s.pCI : s.ciLog;
  const used = s.rows.filter((r) => r.included);
  const facts: string[] = [];
  if (s.sdLog) facts.push(`SD ${s.sdLog}`);
  facts.push(`n = ${plural(s.n, "experiment")}${s.n < s.of ? ` of ${s.of}` : ""}`);
  if (!molar && !s.error) facts.push(`log10 of the concentration${xUnit ? ` in ${xUnit}` : ""}`);
  const figure: KeyFigure = { name, value, facts,
    ...(ci ? { ci: `95% CI ${ci} (t, ${s.df} df)` } : {}) };
  if (s.geomean && s.geomeanCI) {
    figure.facts.push(`Geometric-mean ${s.label} ${s.geomean}${u}, 95% CI ${s.geomeanCI}`);
  }
  if (s.withheld) figure.demoted = `No SD or CI across experiments: ${s.withheld}.`;
  if (s.error) {
    figure.value = "n/a";
    figure.facts = [];
    figure.demoted = `Could not fit each experiment: ${s.error}.`;
  }
  return {
    title: s.name,
    figure,
    perExperiment: used.length
      ? `${s.label} per experiment: ${used.map((r) => r.value).join(", ")}${u}` : undefined,
    excluded: s.withheld ? [] : s.rows.filter((r) => !r.included).map(exclusionText),
    notes: s.notes,
  };
}
