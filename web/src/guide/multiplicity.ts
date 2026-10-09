// Separate t tests on one table (need `multiplicity-by-default`): count the
// results sheets that run a t test on the same data table and the pairs of
// data sets they compare. From the third distinct pair on, each of those
// results gets a chip with the familywise error of what was done and two
// one-click alternatives: one-way ANOVA with Dunnett's test against the
// common control, or the P values adjusted together (Holm-Šídák, the
// engine's fdr_adjust). The arithmetic is the textbook one quoted by the
// GraphPad guide ("The multiple comparisons problem": three comparisons,
// 14%): 1 − 0.95^k if the tests were independent, and the Bonferroni bound
// k × 0.05, which holds whatever the dependence. Pure; unit-tested.
import type { Project, ResultsSheet } from "../project/types.ts";
import type { Chip } from "./checks.ts";
import { SRC } from "./sources.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

export interface TTestRun {
  sheetId: string;
  name: string;
  /** Data set indices compared (A, B). */
  a: number;
  b: number;
  kind: string;
}

export interface MultiplicityFacts {
  dataId: string;
  /** Distinct pairs of data sets tested. */
  k: number;
  runs: TTestRun[];
  /** 1 − 0.95^k (independent tests). */
  familywise: number;
  /** min(1, 0.05 k). */
  bonferroni: number;
  /** The data set in every tested pair (the control), else null. */
  control: number | null;
  /** Data set names, for the chip. */
  names: string[];
}

/** Every results sheet of `dataId` running a column t test, with the
 *  pair it compares (option defaults: A = 0, B = 1). */
export function tTestRuns(p: Project, dataId: string): TTestRun[] {
  return p.sheets.filter((s): s is ResultsSheet => s.kind === "results" && s.parentId === dataId
    && s.analysis === "column" && (s.options as R | null)?.analysis === "ttest")
    .map((s) => {
      const o = s.options as R;
      const a = Number.isInteger(o.datasetA) ? o.datasetA as number : 0;
      const b = Number.isInteger(o.datasetB) ? o.datasetB as number : 1;
      return { sheetId: s.id, name: s.name, a, b, kind: String(o.ttestKind ?? "unpaired") };
    })
    .filter((t) => t.a !== t.b);
}

const pairKey = (t: { a: number; b: number }) => `${Math.min(t.a, t.b)}:${Math.max(t.a, t.b)}`;

/** The facts for the t tests on a table, or null below three pairs. */
export function multiplicityFacts(p: Project, dataId: string): MultiplicityFacts | null {
  const runs = tTestRuns(p, dataId);
  const pairs = new Map<string, TTestRun>();
  for (const t of runs) if (!pairs.has(pairKey(t))) pairs.set(pairKey(t), t);
  const k = pairs.size;
  if (k < 3) return null;
  const distinct = [...pairs.values()];
  const shared = [distinct[0].a, distinct[0].b].find((g) => distinct.every((t) => t.a === g || t.b === g));
  const data = p.sheets.find((s) => s.id === dataId);
  const names = data?.kind === "data" ? data.table.datasets.map((d, i) => d.name || `Data set ${i + 1}`) : [];
  return { dataId, k, runs, familywise: familywise(k), bonferroni: Math.min(1, 0.05 * k),
    control: shared ?? null, names };
}

export function familywise(k: number, alpha = 0.05): number {
  return 1 - (1 - alpha) ** k;
}

const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const sup = (k: number) => String(k).split("").map((c) => SUP[Number(c)]).join("");
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** "3 t tests on this table: familywise error ≈ 1−0.95³ = 14% (Bonferroni
 *  bound 15%)". */
export function multiplicityLabel(f: MultiplicityFacts): string {
  return `${f.k} t tests on this table: familywise error ≈ 1−0.95${sup(f.k)} = ${pct(f.familywise)} `
    + `(Bonferroni bound ${pct(f.bonferroni)})`;
}

export function multiplicityChip(f: MultiplicityFacts): Chip {
  const ctl = f.control !== null ? f.names[f.control] ?? `data set ${f.control + 1}` : null;
  return {
    id: "multiplicity", state: "warn", label: multiplicityLabel(f),
    detail: `Each t test keeps its own 5% chance of a false positive. Across ${f.k} tests of `
      + "the same table, the chance that at least one is P < 0.05 when no group truly differs is "
      + `about ${pct(f.familywise)} (1 − 0.95${sup(f.k)}, if the tests were independent; never more `
      + `than ${pct(f.bonferroni)}, Bonferroni). `
      + (ctl ? `They all compare with ${ctl}: one-way ANOVA with Dunnett's test against ${ctl} `
        + "answers the same question with the familywise error held at 5% (and the pooled SD "
        + "from every group). "
        : "One-way ANOVA with Tukey's test compares every pair with the familywise error held "
          + "at 5%. ")
      + `Or keep these tests and adjust their ${f.k} P values together (Holm-Šídák).`,
    action: "multiplicity",
    sources: [SRC.gpMultipleProblem, SRC.gpMultipleComparisons, SRC.holm1979],
  };
}

/** The analysis options of the one-click ANOVA. */
export function anovaOptionsFor(f: MultiplicityFacts): Record<string, unknown> {
  return f.control !== null
    ? { analysis: "anova", anovaKind: "parametric", anovaSd: "equal", comparisons: "dunnett",
      controlIndex: f.control }
    : { analysis: "anova", anovaKind: "parametric", anovaSd: "equal", comparisons: "tukey" };
}

/** A results sheet of the table that already runs that ANOVA. */
export function existingAnova(p: Project, f: MultiplicityFacts): ResultsSheet | null {
  const want = anovaOptionsFor(f);
  return p.sheets.find((s): s is ResultsSheet => s.kind === "results" && s.parentId === f.dataId
    && s.analysis === "column" && (s.options as R)?.analysis === "anova"
    && (s.options as R)?.anovaKind !== "nonparametric"
    && (s.options as R)?.comparisons === want.comparisons
    && (want.controlIndex === undefined || ((s.options as R)?.controlIndex ?? 0) === want.controlIndex))
    ?? null;
}
