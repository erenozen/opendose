// The analysis plan (need `preregistration-plan`): the primary comparison,
// the test with its key options and sidedness, n per group, the exclusion
// rule and α, written before the data and kept on an info sheet
// (`InfoSheet.plan`). Results sheets of the planned table are checked
// against it: test changed, sidedness changed, n different from the plan,
// exclusions beyond the rule, comparisons that were not planned. Once the
// plan is locked it is never edited silently: every change is appended to
// `changes` with its reason, and a deviation explained with a reason is
// listed with it in the methods text.
//
// Why: results can only be taken at face value when every analysis choice
// was made as planned; a one-tailed P needs a direction recorded before
// the data; say whether n was chosen in advance (GraphPad Statistics
// Guide, "Advice: Don't P-Hack"; Motulsky 2014, Naunyn-Schmiedeberg's
// Arch Pharmacol 387:1017). ARRIVE 2.0 item 19 asks whether a protocol with
// the analysis plan was prepared before the study.
//
// Pure (no React, no engine); unit-tested in __tests__/plan.test.ts.
import { exclusionGroups, excludedValues } from "./exclusions.ts";
import { updateSheet } from "./ops.ts";
import type { DataTableModel, InfoSheet, Project, Sheet } from "./types.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

export interface PlanChange {
  /** ISO time of the change. */
  at: string;
  /** What changed, in words ("Test: Welch t test → paired t test"). */
  what: string;
  reason: string;
  /** A deviation this change explains (Deviation.key). */
  key?: string;
}

export interface PlannedTest {
  /** Analysis id of the registry ("column", "grouped_two_way", …). */
  analysisId: string;
  /** The analysis options as planned (the comparison's key options). */
  options: Record<string, unknown>;
  /** "Welch t test", "two-way ANOVA", … */
  label: string;
  tails: "two" | "one";
}

export interface AnalysisPlan {
  primaryOutcome: string;
  /** The groups (data set names) of the experiment. */
  groups: string[];
  /** The primary comparison (two groups), if there is one. */
  comparison: { a: string; b: string } | null;
  test: PlannedTest;
  /** Independent units per group (null: not stated). */
  nPerGroup: number | null;
  exclusionRule: string;
  alpha: number;
  /** ISO time the plan was written. */
  writtenAt: string;
  locked: boolean;
  lockedAt?: string;
  changes: PlanChange[];
  /** The results sheet that runs the planned analysis. */
  resultsId?: string | null;
  /** One-line design checks from "Plan an experiment…" (guide/designChecks). */
  designNotes?: string[];
}

/** A results sheet as the plan check sees it. */
export interface SheetLike {
  id: string;
  name: string;
  analysisId: string;
  options: unknown;
}

export type DeviationKind = "test" | "sidedness" | "n" | "exclusions" | "comparison" | "extra";

export interface Deviation {
  /** Stable while the deviation is the same (a new n is a new key). */
  key: string;
  kind: DeviationKind;
  sheetId: string;
  /** What the plan said and what is done now, short ("one-tailed", "n = 9"). */
  planned: string;
  now: string;
  /** One clause for the methods text. */
  text: string;
  /** Recorded reason, when the user gave one. */
  reason?: string;
}

const obj = (v: unknown): R => (v && typeof v === "object" ? v as R : {});
const str = (v: unknown) => (typeof v === "string" ? v : "");

// ------------------------------------------------------------ the test

const TTEST_SHORT: Record<string, string> = {
  unpaired: "unpaired t test", welch: "Welch t test", paired: "paired t test",
  ratio_paired: "ratio paired t test", mann_whitney: "Mann-Whitney test",
  kolmogorov_smirnov: "Kolmogorov-Smirnov test", wilcoxon: "Wilcoxon matched-pairs test",
};

const POSTHOC_SHORT: Record<string, string> = {
  tukey: "Tukey", dunnett: "Dunnett", sidak: "Šídák", bonferroni: "Bonferroni",
  holm_sidak: "Holm-Šídák", fisher: "Fisher's LSD", fisher_lsd: "Fisher's LSD",
  newman_keuls: "Newman-Keuls", games_howell: "Games-Howell", dunnett_t3: "Dunnett's T3",
  tamhane_t2: "Tamhane's T2",
};

/** One string per analysis variant: two sheets with the same key run the
 *  same test (the options that change the test, not the display). */
export function variantKey(analysisId: string, options: unknown): string {
  const o = obj(options);
  if (analysisId === "column") {
    const a = str(o.analysis) || "column_statistics";
    switch (a) {
      case "ttest": return `ttest:${str(o.ttestKind) || "unpaired"}`;
      case "anova": {
        if (o.anovaKind === "nonparametric") return `anova:kruskal:${o.dunnCorrected === false ? "uncorrected" : "dunn"}`;
        if (o.anovaSd === "unequal") return `anova:welch:${str(o.unequalComparisons) || "games_howell"}:${str(o.unequalFamily) || "all"}`;
        return `anova:ordinary:${str(o.comparisons) || "tukey"}`;
      }
      case "rm_anova": return `rm_anova:${str(o.rmKind) || "parametric"}`;
      case "column_statistics": {
        const h = str(o.hypothetical).trim();
        return h ? `one_sample:${h}:${o.ratioT === true ? "log" : "raw"}` : "descriptive";
      }
      case "correlation": return `correlation:${str(o.corrMethod) || "pearson"}`;
      default: return a;
    }
  }
  if (analysisId === "grouped_two_way") {
    return `grouped_two_way:${str(o.design) || "none"}:${str(o.model) || "full"}:${str(o.comparisons) || "none"}`;
  }
  const extra = ["design", "comparisons", "test", "method", "kind"]
    .filter((k) => typeof o[k] === "string" || typeof o[k] === "number")
    .map((k) => `${k}=${o[k]}`);
  return [analysisId, ...extra].join(":");
}

/** Analyses that describe rather than test (never an "extra comparison"). */
export function isDescriptive(analysisId: string, options: unknown): boolean {
  const k = variantKey(analysisId, options);
  return k === "descriptive" || k === "outliers" || k.startsWith("grouped_row_means")
    || k.startsWith("grouped_column_stats") || analysisId === "power";
}

/** "Welch t test", "one-way ANOVA with Tukey's test", … (`fallback` for
 *  analyses this module does not name). */
export function testLabel(analysisId: string, options: unknown, fallback = analysisId): string {
  const o = obj(options);
  const k = variantKey(analysisId, options);
  if (k.startsWith("ttest:")) return TTEST_SHORT[k.slice(6)] ?? "t test";
  if (k.startsWith("anova:kruskal")) return "Kruskal-Wallis test";
  if (k.startsWith("anova:welch")) return "Welch's one-way ANOVA";
  if (k.startsWith("anova:ordinary")) {
    const c = str(o.comparisons) || "tukey";
    return c === "none" ? "one-way ANOVA" : `one-way ANOVA with ${POSTHOC_SHORT[c] ?? c}'s test`
      .replace("LSD's test", "LSD").replace("T3's test", "T3").replace("T2's test", "T2");
  }
  if (k === "rm_anova:nonparametric") return "Friedman test";
  if (k.startsWith("rm_anova")) return "repeated-measures one-way ANOVA";
  if (k.startsWith("one_sample:")) {
    const h = str(o.hypothetical).trim();
    return o.ratioT === true ? `one-sample t test on the logs against ${h}` : `one-sample t test against ${h}`;
  }
  if (k.startsWith("correlation:")) return `${str(o.corrMethod) === "spearman" ? "Spearman"
    : str(o.corrMethod) === "kendall" ? "Kendall" : "Pearson"} correlation`;
  if (k.startsWith("grouped_two_way:")) {
    const d = str(o.design) || "none";
    return d === "none" ? "two-way ANOVA" : "two-way repeated-measures ANOVA";
  }
  return fallback;
}

/** Every P OpenDose reports is two-sided, except a correlation asked for
 *  a one-sided P in a stated direction; a future `tails` option is read
 *  too. */
export function sidedness(analysisId: string, options: unknown): "two" | "one" {
  const o = obj(options);
  if (o.tails === "one" || o.tails === 1 || o.tails === "1") return "one";
  if (analysisId === "column" && o.analysis === "correlation"
    && (o.corrTails === "greater" || o.corrTails === "less")) return "one";
  return "two";
}

const TAILS = { two: "two-tailed", one: "one-tailed" } as const;

// ------------------------------------------------------------ groups and n

/** The data set indices an analysis compares (t tests: A and B). */
export function comparedDatasets(analysisId: string, options: unknown, table: DataTableModel): number[] {
  const o = obj(options);
  if (analysisId === "column" && o.analysis === "ttest") {
    const a = Number.isInteger(o.datasetA) ? o.datasetA as number : 0;
    const b = Number.isInteger(o.datasetB) ? o.datasetB as number : 1;
    return [a, b].filter((i) => i >= 0 && i < table.datasets.length);
  }
  return table.datasets.map((_, i) => i);
}

const dsName = (t: DataTableModel, i: number) => t.datasets[i]?.name.trim() || `Data set ${i + 1}`;

/** Values entered (excluded ones included) per compared group, or null
 *  when n cannot be counted (summary formats, counts, nested tables). */
export function enteredPerGroup(analysisId: string, options: unknown, table: DataTableModel):
  { name: string; entered: number; analysed: number }[] | null {
  if (table.type === "nested") return null;
  const groups = exclusionGroups(table);
  if (!groups) return null;
  if (table.type === "grouped") return groups.map((g) => ({ name: g.name, entered: g.entered, analysed: g.analysed }));
  const want = new Set(comparedDatasets(analysisId, options, table).map((i) => dsName(table, i)));
  return groups.filter((g) => want.has(g.name))
    .map((g) => ({ name: g.name, entered: g.entered, analysed: g.analysed }));
}

// ------------------------------------------------------------ making a plan

export function emptyPlan(now: string): AnalysisPlan {
  return {
    primaryOutcome: "", groups: [], comparison: null,
    test: { analysisId: "column", options: { analysis: "ttest", ttestKind: "welch" },
      label: "Welch t test", tails: "two" },
    nPerGroup: null, exclusionRule: "", alpha: 0.05, writtenAt: now, locked: false, changes: [],
    resultsId: null,
  };
}

/** "Make this the plan": the plan a results sheet and its table imply. */
export function planFromResults(sheet: SheetLike, table: DataTableModel, now: string,
  fallbackLabel?: string): AnalysisPlan {
  const idx = comparedDatasets(sheet.analysisId, sheet.options, table);
  const counts = enteredPerGroup(sheet.analysisId, sheet.options, table);
  const ns = counts?.map((g) => g.entered).filter((n) => n > 0) ?? [];
  const o = obj(sheet.options);
  const two = sheet.analysisId === "column" && o.analysis === "ttest" && idx.length === 2;
  return {
    primaryOutcome: table.yTitle.trim(),
    groups: table.datasets.map((_, i) => dsName(table, i)),
    comparison: two ? { a: dsName(table, idx[0]), b: dsName(table, idx[1]) } : null,
    test: { analysisId: sheet.analysisId, options: { ...o },
      label: testLabel(sheet.analysisId, sheet.options, fallbackLabel),
      tails: sidedness(sheet.analysisId, sheet.options) },
    nPerGroup: ns.length ? Math.max(...ns) : null,
    exclusionRule: "", alpha: 0.05, writtenAt: now, locked: false, changes: [],
    resultsId: sheet.id,
  };
}

// ------------------------------------------------------------ editing

export type PlanPatch = Partial<Pick<AnalysisPlan, "primaryOutcome" | "comparison" | "nPerGroup"
  | "exclusionRule" | "alpha" | "groups">> & { test?: PlannedTest };

const FIELD: Record<string, string> = {
  primaryOutcome: "Primary outcome", comparison: "Primary comparison", nPerGroup: "n per group",
  exclusionRule: "Exclusion rule", alpha: "α", groups: "Groups", test: "Test",
};

function fieldText(k: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "(none)";
  if (k === "comparison") { const c = v as { a: string; b: string }; return `${c.b} vs ${c.a}`; }
  if (k === "test") { const t = v as PlannedTest; return `${TAILS[t.tails]} ${t.label}`; }
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

/** Apply an edit. Unlocked (a draft): applied as is. Locked: refused
 *  without a reason; with one, applied and logged in `changes`. */
export function editPlan(plan: AnalysisPlan, patch: PlanPatch, reason: string, now: string):
  { plan: AnalysisPlan } | { error: string } {
  const keys = (Object.keys(patch) as (keyof PlanPatch)[])
    .filter((k) => JSON.stringify(patch[k]) !== JSON.stringify(plan[k as keyof AnalysisPlan]));
  if (!keys.length) return { plan };
  const next = { ...plan, ...patch } as AnalysisPlan;
  if (!plan.locked) return { plan: next };
  const why = reason.trim();
  if (!why) return { error: "The plan is locked: give a reason for the change." };
  const what = keys.map((k) => `${FIELD[k] ?? k}: ${fieldText(k, plan[k as keyof AnalysisPlan])} → ${
    fieldText(k, next[k as keyof AnalysisPlan])}`).join("; ");
  return { plan: { ...next, changes: [...plan.changes, { at: now, what, reason: why }] } };
}

export function lockPlan(plan: AnalysisPlan, now: string): AnalysisPlan {
  return plan.locked ? plan : { ...plan, locked: true, lockedAt: now };
}

/** Record why the analysis departs from the plan (required when locked,
 *  welcome when not). */
export function explainDeviation(plan: AnalysisPlan, d: Deviation, reason: string, now: string):
  { plan: AnalysisPlan } | { error: string } {
  const why = reason.trim();
  if (!why) return { error: "Give a reason for the deviation." };
  const rest = plan.changes.filter((c) => c.key !== d.key);
  return { plan: { ...plan, changes: [...rest,
    { at: now, what: `Deviation: ${d.text}`, reason: why, key: d.key }] } };
}

// ------------------------------------------------------------ checking

/** The results sheet that runs the planned analysis: the one recorded,
 *  else the first running the planned variant, else the first running the
 *  planned analysis id. */
export function primarySheet(plan: AnalysisPlan, sheets: SheetLike[]): SheetLike | null {
  const rec = plan.resultsId ? sheets.find((s) => s.id === plan.resultsId) : undefined;
  if (rec) return rec;
  const want = variantKey(plan.test.analysisId, plan.test.options);
  return sheets.find((s) => variantKey(s.analysisId, s.options) === want)
    ?? sheets.find((s) => s.analysisId === plan.test.analysisId && !isDescriptive(s.analysisId, s.options))
    ?? null;
}

function withReasons(plan: AnalysisPlan, ds: Deviation[]): Deviation[] {
  return ds.map((d) => {
    const c = plan.changes.findLast((x) => x.key === d.key);
    return c ? { ...d, reason: c.reason } : d;
  });
}

const NO_EXCLUSIONS = /^\s*(|none|no exclusions?( planned)?|nothing|n\/a)\.?\s*$/i;

/** Deviations of one results sheet of the planned table from the plan. */
export function sheetDeviations(plan: AnalysisPlan, sheet: SheetLike, table: DataTableModel,
  sheets: SheetLike[], fallbackLabel?: string): Deviation[] {
  const primary = primarySheet(plan, sheets);
  const out: Deviation[] = [];
  const label = testLabel(sheet.analysisId, sheet.options, fallbackLabel);
  if (primary && sheet.id !== primary.id) {
    if (isDescriptive(sheet.analysisId, sheet.options)) return [];
    const same = variantKey(sheet.analysisId, sheet.options) === variantKey(primary.analysisId, primary.options)
      && JSON.stringify(comparedDatasets(sheet.analysisId, sheet.options, table))
        === JSON.stringify(comparedDatasets(primary.analysisId, primary.options, table));
    if (same) return [];
    out.push({ key: `extra:${sheet.id}:${variantKey(sheet.analysisId, sheet.options)}`, kind: "extra",
      sheetId: sheet.id, planned: "not in the plan", now: label,
      text: `an additional ${label} (“${sheet.name}”) not in the plan, to be reported as exploratory` });
    return withReasons(plan, out);
  }
  if (!primary) return [];
  // The test and its variant.
  const vk = variantKey(sheet.analysisId, sheet.options);
  if (vk !== variantKey(plan.test.analysisId, plan.test.options)) {
    out.push({ key: `test:${vk}`, kind: "test", sheetId: sheet.id, planned: plan.test.label, now: label,
      text: `${label} instead of the planned ${plan.test.label}` });
  }
  const tails = sidedness(sheet.analysisId, sheet.options);
  if (tails !== plan.test.tails) {
    out.push({ key: `tails:${tails}`, kind: "sidedness", sheetId: sheet.id,
      planned: TAILS[plan.test.tails], now: TAILS[tails],
      text: `${TAILS[tails]} P values instead of the planned ${TAILS[plan.test.tails]}` });
  }
  // The comparison (two-group tests).
  const idx = comparedDatasets(sheet.analysisId, sheet.options, table);
  const o = obj(sheet.options);
  if (plan.comparison && sheet.analysisId === "column" && o.analysis === "ttest" && idx.length === 2) {
    const a = dsName(table, idx[0]);
    const b = dsName(table, idx[1]);
    const same = (a === plan.comparison.a && b === plan.comparison.b)
      || (a === plan.comparison.b && b === plan.comparison.a);
    if (!same) {
      out.push({ key: `pair:${a}:${b}`, kind: "comparison", sheetId: sheet.id,
        planned: `${plan.comparison.b} vs ${plan.comparison.a}`, now: `${b} vs ${a}`,
        text: `${b} compared with ${a} instead of the planned ${plan.comparison.b} vs ${plan.comparison.a}` });
    }
  }
  // n per group (values entered, excluded ones included).
  const counts = enteredPerGroup(sheet.analysisId, sheet.options, table);
  if (plan.nPerGroup !== null && counts?.length) {
    const off = counts.filter((g) => g.entered !== plan.nPerGroup);
    if (off.length) {
      const allSame = off.length === counts.length && new Set(off.map((g) => g.entered)).size === 1;
      const now = allSame ? `n = ${off[0].entered} per group`
        : off.map((g) => `n = ${g.entered} in ${g.name}`).join(", ");
      const more = off.some((g) => g.entered > plan.nPerGroup!);
      out.push({ key: `n:${off.map((g) => `${g.name}=${g.entered}`).join(",")}`, kind: "n",
        sheetId: sheet.id, planned: `n = ${plan.nPerGroup} per group`, now,
        text: `${now} instead of the planned ${plan.nPerGroup} per group${more
          ? " (more units than planned)" : ""}` });
    }
  }
  // Exclusions beyond the rule.
  const want = new Set(idx);
  const excl = excludedValues(table).filter((v) => table.type !== "column" || want.has(v.dataset));
  if (excl.length) {
    const none = NO_EXCLUSIONS.test(plan.exclusionRule);
    const unreasoned = excl.filter((v) => !v.reason);
    if (none) {
      out.push({ key: `excl:none:${excl.length}`, kind: "exclusions", sheetId: sheet.id,
        planned: "no exclusions", now: `${excl.length} excluded`,
        text: `${excl.length} value${excl.length === 1 ? "" : "s"} excluded although the plan states no exclusion rule` });
    } else if (unreasoned.length) {
      out.push({ key: `excl:noreason:${unreasoned.length}`, kind: "exclusions", sheetId: sheet.id,
        planned: `exclusions only by the rule (${plan.exclusionRule.trim()})`,
        now: `${unreasoned.length} excluded without a reason`,
        text: `${unreasoned.length} value${unreasoned.length === 1 ? "" : "s"} excluded without a recorded reason (planned rule: ${plan.exclusionRule.trim().replace(/\.$/, "")})` });
    }
  }
  return withReasons(plan, out);
}

/** Every deviation on the planned table (primary first). */
export function planDeviations(plan: AnalysisPlan, table: DataTableModel, sheets: SheetLike[],
  labels: Record<string, string> = {}): Deviation[] {
  const primary = primarySheet(plan, sheets);
  const order = primary ? [primary, ...sheets.filter((s) => s.id !== primary.id)] : sheets;
  return order.flatMap((s) => sheetDeviations(plan, s, table, sheets, labels[s.id]));
}

/** Excluded values the rule allows but a person must check against it. */
export function exclusionsToCheck(plan: AnalysisPlan, table: DataTableModel): string | null {
  const ex = excludedValues(table).filter((v) => v.reason);
  if (!ex.length || NO_EXCLUSIONS.test(plan.exclusionRule)) return null;
  return `${ex.length} value${ex.length === 1 ? "" : "s"} excluded (${[...new Set(ex.map((v) => v.reason))]
    .join(", ")}): check against the planned rule “${plan.exclusionRule.trim()}”.`;
}

// ------------------------------------------------------------ words

/** "two-tailed Welch t test, n = 8 per group". */
export function plannedSummary(plan: AnalysisPlan): string {
  return `${TAILS[plan.test.tails]} ${plan.test.label}${plan.nPerGroup !== null
    ? `, n = ${plan.nPerGroup} per group` : ""}`;
}

/** The deviation chip of a results sheet: "Planned: two-tailed Welch t
 *  test, n = 8 per group. Now: paired t test, n = 9 per group. Add a
 *  reason or revert." */
export function chipText(plan: AnalysisPlan, ds: Deviation[]): string {
  const open = ds.filter((d) => !d.reason);
  if (!ds.length) return `As planned: ${plannedSummary(plan)}.`;
  if (ds.every((d) => d.kind === "extra")) {
    return `Not in the analysis plan (planned: ${plannedSummary(plan)}). `
      + (open.length ? "Report it as exploratory, or add a reason." : "Reason recorded.");
  }
  return `Planned: ${plannedSummary(plan)}. Now: ${ds.map((d) => d.now).join(", ")}. `
    + (open.length ? "Add a reason or revert." : "Reasons recorded.");
}

const day = (iso: string) => iso.slice(0, 10);

/** The plan for the methods text: "Pre-specified analysis plan (written
 *  2026-10-09, locked 2026-10-09): two-tailed Welch t test comparing
 *  Treated with Control, n = 8 per group, α = 0.05; exclusions: …. Deviations
 *  from the plan: paired t test instead of the planned Welch t test
 *  (reason: …)." */
export function planMethodsSentence(plan: AnalysisPlan, ds: Deviation[]): string {
  const head = plan.locked
    ? `Pre-specified analysis plan (written ${day(plan.writtenAt)}${plan.lockedAt
      && day(plan.lockedAt) !== day(plan.writtenAt) ? `, locked ${day(plan.lockedAt)}` : ""})`
    : `Analysis plan (written ${day(plan.writtenAt)}, not locked)`;
  const parts = [`${TAILS[plan.test.tails]} ${plan.test.label}`
    + (plan.comparison ? ` comparing ${plan.comparison.b} with ${plan.comparison.a}` : "")];
  if (plan.primaryOutcome.trim()) parts.push(`primary outcome ${plan.primaryOutcome.trim()}`);
  if (plan.nPerGroup !== null) parts.push(`n = ${plan.nPerGroup} per group`);
  parts.push(`α = ${plan.alpha}`);
  let t = `${head}: ${parts.join(", ")}; exclusions: ${plan.exclusionRule.trim().replace(/\.$/, "") || "none planned"}.`;
  if (!ds.length) return `${t} No deviations from the plan.`;
  t += ` Deviations from the plan: ${ds.map((d) => `${d.text} (${d.reason ? `reason: ${d.reason.replace(/\.$/, "")}` : "reason not recorded"})`).join("; ")}.`;
  return t;
}

/** The plan changes logged after locking, for the plan sheet. */
export function changeLog(plan: AnalysisPlan): string[] {
  return plan.changes.map((c) => `${day(c.at)}: ${c.what} (reason: ${c.reason})`);
}

// ------------------------------------------------------------ in a project

/** The analysis plan written for a data table (the first info sheet
 *  linked to it that holds one). */
export function planSheetFor(p: Project, dataId: string): (InfoSheet & { plan: AnalysisPlan }) | null {
  return (p.sheets.find((s) => s.kind === "info" && s.parentId === dataId && !!s.plan) as
    (InfoSheet & { plan: AnalysisPlan }) | undefined) ?? null;
}

/** Replace the plan of info sheet `id`. */
export function setPlan(p: Project, id: string, plan: AnalysisPlan): Project {
  return updateSheet<Sheet>(p, id, (s) => (s.kind === "info" ? { ...s, plan } : s));
}

/** The results sheets of a data table, as the check sees them. */
export function resultsOf(p: Project, dataId: string): SheetLike[] {
  return p.sheets.flatMap((s) => (s.kind === "results" && s.parentId === dataId
    ? [{ id: s.id, name: s.name, analysisId: s.analysis, options: s.options }] : []));
}

/** Plan facts for the journal checklists (report/checklists.ts). */
export interface PlanFacts {
  written: string;
  locked: boolean;
  deviations: number;
  unexplained: number;
  sheetId: string;
  firstUnexplained: string | null;
}

export function planFacts(p: Project, dataId: string, labels: Record<string, string> = {}): PlanFacts | null {
  const ps = planSheetFor(p, dataId);
  const data = p.sheets.find((s) => s.id === dataId);
  if (!ps || data?.kind !== "data") return null;
  const ds = planDeviations(ps.plan, data.table, resultsOf(p, dataId), labels);
  const open = ds.filter((d) => !d.reason);
  return { written: ps.plan.writtenAt.slice(0, 10), locked: ps.plan.locked, deviations: ds.length,
    unexplained: open.length, sheetId: ps.id, firstUnexplained: open[0]?.sheetId ?? null };
}

// ------------------------------------------------------------ reading files

/** A plan from a saved file, or undefined when absent or unusable. */
export function parsePlan(raw: unknown): AnalysisPlan | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as R;
  const t = obj(r.test);
  if (!str(t.analysisId)) return undefined;
  const cmp = obj(r.comparison);
  const n = typeof r.nPerGroup === "number" && Number.isFinite(r.nPerGroup) && r.nPerGroup > 0
    ? Math.round(r.nPerGroup) : null;
  const alpha = typeof r.alpha === "number" && r.alpha > 0 && r.alpha < 1 ? r.alpha : 0.05;
  return {
    primaryOutcome: str(r.primaryOutcome),
    groups: Array.isArray(r.groups) ? r.groups.map(String) : [],
    comparison: str(cmp.a) && str(cmp.b) ? { a: str(cmp.a), b: str(cmp.b) } : null,
    test: { analysisId: str(t.analysisId), options: obj(t.options), label: str(t.label) || str(t.analysisId),
      tails: t.tails === "one" ? "one" : "two" },
    nPerGroup: n, exclusionRule: str(r.exclusionRule), alpha,
    writtenAt: str(r.writtenAt) || new Date(0).toISOString(),
    locked: r.locked === true,
    ...(str(r.lockedAt) ? { lockedAt: str(r.lockedAt) } : {}),
    changes: Array.isArray(r.changes) ? r.changes.map(obj).filter((c) => str(c.what))
      .map((c) => ({ at: str(c.at), what: str(c.what), reason: str(c.reason),
        ...(str(c.key) ? { key: str(c.key) } : {}) })) : [],
    resultsId: str(r.resultsId) || null,
    ...(Array.isArray(r.designNotes) ? { designNotes: r.designNotes.map(String) } : {}),
  };
}
