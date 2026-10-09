// Assumption checklist chips for a results sheet: normality per group,
// equal SDs, sphericity, n per group, outliers, zero-variance groups,
// missing values, "n might be cells". Computed from the engine result
// already on screen plus cheap client-side summaries; advice, never a
// gate. Pure; unit-tested.
import type { DataTableModel, TableType } from "../project/types.ts";
import { formatPValue } from "../report/pformat.ts";
import { replicateFacts } from "../report/replicates.ts";
import type { GroupCheck } from "./recommend.ts";
import { cellChecks, looksLikeCells, missingInRows, normalisedControl } from "./stats.ts";
import { withheldInfo } from "../sheets/common/withheld.ts";
import { multiplicityChip, type MultiplicityFacts } from "./multiplicity.ts";
import { separateTestsChip, type SeparateTests } from "./interaction.ts";
import { sensitivityChip, type NeededN, type Sensitivity } from "./smallN.ts";
import type { Source } from "./sources.ts";

export type ChipState = "ok" | "warn" | "bad" | "info";

export interface Chip {
  id: string;
  label: string;
  state: ChipState;
  /** One or two sentences of advice, shown when the chip is expanded. */
  detail: string;
  explainer?: string;
  /** A one-click fix offered under the detail: Assign replicates…, the
   *  power tool, or the multiplicity alternatives (ANOVA / Holm-Šídák). */
  action?: "assign-replicates" | "open-power" | "multiplicity" | "interaction";
  /** Where the rule comes from, linked under the detail. */
  sources?: Source[];
}

export interface ResultContext {
  tableType: TableType;
  analysisId: string;
  options: Record<string, unknown>;
  result: Record<string, unknown> | null;
  table: DataTableModel;
  /** Per data set summaries; normalityP filled from the engine if known. */
  groups: GroupCheck[];
  /** n = 2–3: the smallest effect the design detects (engine: the
   *  result's design_sensitivity, else the power handler). */
  sensitivity?: Sensitivity | null;
  /** P withheld: independent values per group a test would need. */
  needed?: NeededN[] | null;
  /** Three or more t tests on this table (project-level count). */
  multiplicity?: MultiplicityFacts | null;
  /** Separate tests per group read as a difference between the groups
   *  (guide/interaction.ts). */
  separate?: SeparateTests | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

const fmt = (v: number, d = 2) => (Math.abs(v) >= 0.001 || v === 0
  ? String(Number(v.toPrecision(d + 1))) : v.toExponential(1));
const pText = (p: number) => formatPValue(p);

/** Which analysis the sheet runs, as one key: "ttest:welch", "anova", ... */
export function analysisKind(ctx: ResultContext): string {
  const o = ctx.options;
  if (ctx.analysisId === "column") {
    const a = String(o.analysis ?? "column_statistics");
    if (a === "ttest") return `ttest:${String(o.ttestKind ?? "unpaired")}`;
    if (a === "anova") {
      if (o.anovaKind === "nonparametric") return "kruskal";
      return o.anovaSd === "unequal" ? "welch_anova" : "anova";
    }
    if (a === "rm_anova") return o.rmKind === "nonparametric" ? "friedman" : "rm_anova";
    return a;
  }
  return ctx.analysisId;
}

const RANK = new Set(["ttest:mann_whitney", "ttest:wilcoxon", "ttest:kolmogorov_smirnov",
  "kruskal", "friedman", "median_test"]);
const PAIRED = new Set(["ttest:paired", "ttest:ratio_paired", "ttest:wilcoxon", "rm_anova",
  "friedman", "rm_two_way"]);
const GROUP_TESTS = new Set(["ttest:unpaired", "ttest:welch", "ttest:paired", "ttest:ratio_paired",
  "ttest:mann_whitney", "ttest:wilcoxon", "ttest:kolmogorov_smirnov", "anova", "welch_anova",
  "kruskal", "rm_anova", "friedman", "median_test", "column_statistics", "outliers",
  "two_way_anova", "rm_two_way", "nested_ttest", "nested_anova"]);

/** The data sets a two-group test reads (A and B), else all of them. */
function usedGroups(ctx: ResultContext, kind: string): GroupCheck[] {
  const used = ctx.groups.filter((g) => g.n > 0);
  if (kind.startsWith("ttest:")) {
    const a = Number(ctx.options.datasetA ?? 0), b = Number(ctx.options.datasetB ?? 1);
    return [ctx.groups[a], ctx.groups[b]].filter((g): g is GroupCheck => !!g && g.n > 0);
  }
  return used;
}

function nChip(groups: GroupCheck[], unit = "group"): Chip | null {
  if (!groups.length) return null;
  const ns = groups.map((g) => g.n);
  const min = Math.min(...ns), max = Math.max(...ns);
  if (min < 3) {
    const few = groups.filter((g) => g.n < 3).map((g) => `${g.name} (n = ${g.n})`).join(", ");
    return { id: "n", label: "n < 3", state: "bad",
      detail: `${few}: with fewer than 3 values a ${unit} says almost nothing about its `
        + "variability; tests have very little power. Show the individual values and treat "
        + "the result as preliminary.", explainer: "replicates" };
  }
  if (min !== max) {
    return { id: "n", label: `Unequal n (${min}–${max})`, state: "info",
      detail: `Group sizes range from ${min} to ${max}. The analysis handles this, but `
        + "unequal SDs distort P values more when n differs, and some designs (repeated "
        + "measures) may have lost subjects: check why.", explainer: "equal-sds" };
  }
  return { id: "n", label: `n = ${min} per ${unit}`, state: "ok",
    detail: `Every ${unit} has ${min} values. Make sure n counts independent biological `
      + "units (animals, experiments), not wells or cells, and report it with its unit.",
    explainer: "replicates" };
}

/** Where the residual QQ plot is: the result's own Residuals section
 *  when it has one (its advice depends on n, so the chip points there
 *  instead of repeating it), else the t test and one-way ANOVA results. */
const qqWhere = (hasResiduals: boolean) => (hasResiduals
  ? "the residual QQ plot (Residuals, under the results)"
  : "a residual QQ plot (with the t test and one-way ANOVA results)");

function normalityChip(groups: GroupCheck[], kind: string, hasResiduals = false): Chip | null {
  if (RANK.has(kind)) {
    return { id: "normality", label: "Normality not assumed", state: "ok",
      detail: "This rank-based test does not assume Gaussian data. It has less power than "
        + "the parametric test when the data are Gaussian, especially with small samples.",
      explainer: "normality" };
  }
  const tested = groups.filter((g) => g.normalityP !== null);
  if (!tested.length) {
    if (!groups.length) return null;
    return { id: "normality", label: "Normality not checked", state: "info",
      detail: "No group has enough values for a normality test (Shapiro-Wilk needs 3). With "
        + "so few values, decide from what you know about the variable.",
      explainer: "normality" };
  }
  const failed = tested.filter((g) => (g.normalityP as number) < 0.05);
  const paired = PAIRED.has(kind) ? " For a paired test it is the paired differences that "
    + "should be Gaussian, not each column." : "";
  if (failed.length) {
    const minN = Math.min(...groups.map((g) => g.n));
    return { id: "normality", label: `Normality: ${failed.length} of ${tested.length} fail`,
      state: "warn",
      detail: `Shapiro-Wilk ${failed.map((g) => `${g.name} ${pText(g.normalityP as number)}`)
        .join(", ")}. `
        + (hasResiduals
          ? `Look at ${qqWhere(true)} first: it says how much weight this P deserves with `
            + "your n. "
          : `Look at ${qqWhere(false)} first: `
            + (minN >= 30 ? "with 30 or more values per group the test flags departures too "
              + "small to matter, and t tests and ANOVA are robust to them. "
              : "with small groups this test misses real skew and can flag a single unusual "
              + "value. ")
            + "Don't switch to a rank-based test on this P value alone. ")
        + "If the spreads differ, use Welch's test; if the values are positive and skewed, "
        + "analyse log(values)."
        + paired,
      explainer: "normality" };
  }
  return { id: "normality", label: "Normality: no evidence against", state: "ok",
    detail: `Shapiro-Wilk P ≥ 0.05 in every group (${tested.length} tested). `
      + (hasResiduals ? `This does not prove the data are Gaussian: ${qqWhere(true)} shows more.`
        : "With small samples this test has little power, so it does not prove the data are "
          + `Gaussian: ${qqWhere(false)} shows more.`)
      + paired, explainer: "normality" };
}

function equalSdChip(ctx: ResultContext, groups: GroupCheck[], kind: string): Chip | null {
  const r = ctx.result as R | null;
  if (kind === "ttest:welch" || kind === "welch_anova") {
    return { id: "sd", label: "Equal SDs not assumed", state: "ok",
      detail: "Welch's method does not assume the groups have equal SDs, and loses little "
        + "power when they do.", explainer: "equal-sds" };
  }
  if (kind === "anova" && r?.brown_forsythe && typeof r.brown_forsythe.p === "number") {
    const p = r.brown_forsythe.p as number;
    return p < 0.05
      ? { id: "sd", label: "SDs may differ", state: "warn",
        detail: `Brown-Forsythe test ${pText(p)}: the SDs may differ. If you had reason to `
          + "expect that, Welch's ANOVA (Standard deviations: not assumed equal) is the "
          + "matching analysis; decide from the design rather than from this test.",
        explainer: "equal-sds" }
      : { id: "sd", label: "Equal SDs: plausible", state: "ok",
        detail: `Brown-Forsythe test ${pText(p)}: no evidence the SDs differ (with small `
          + "samples this test has little power).", explainer: "equal-sds" };
  }
  if (kind === "ttest:unpaired" || kind === "anova") {
    // On the log scale the test compares the SDs of the logarithms: the
    // geometric SD factors' logs (raw SDs that grow with the mean were
    // the reason to take logs).
    const gm = Array.isArray(r?.geometric_means) ? r.geometric_means as R[] : [];
    const logSds = gm.map((g) => (typeof g.geometric_sd_factor === "number" && g.geometric_sd_factor > 1
      ? Math.log10(g.geometric_sd_factor) : null)).filter((s): s is number => s !== null);
    if (logSds.length >= 2 && logSds.length === gm.length) {
      const lr = Math.max(...logSds) / Math.min(...logSds);
      return lr >= 2
        ? { id: "sd", label: `SD ratio of the logs ${lr.toFixed(1)}`, state: "warn",
          detail: `On the log scale the largest SD is ${lr.toFixed(1)}× the smallest. The test `
            + "assumes equal SDs of the logarithms.", explainer: "equal-sds" }
        : { id: "sd", label: "Equal SDs of the logs: plausible", state: "ok",
          detail: `On the log scale the largest SD is ${lr.toFixed(1)}× the smallest.`,
          explainer: "equal-sds" };
    }
    const sds = groups.map((g) => g.sd).filter((s): s is number => s !== null && s > 0);
    if (sds.length < 2) return null;
    const ratio = Math.max(...sds) / Math.min(...sds);
    return ratio >= 2
      ? { id: "sd", label: `SD ratio ${ratio.toFixed(1)}`, state: "warn",
        detail: `The largest SD is ${ratio.toFixed(1)}× the smallest. The pooled-SD test `
          + "assumes equal SDs; Welch's test does not and loses little when they are equal.",
        explainer: "equal-sds" }
      : { id: "sd", label: "Equal SDs: plausible", state: "ok",
        detail: `The largest SD is ${ratio.toFixed(1)}× the smallest.`, explainer: "equal-sds" };
  }
  if (kind === "kruskal") {
    return { id: "sd", label: "Similar spread assumed", state: "info",
      detail: "Kruskal-Wallis compares distributions; it is not a fix for unequal SDs and "
        + "assumes the groups have a similar shape and spread.", explainer: "equal-sds" };
  }
  return null;
}

function sphericityChip(r: R | null): Chip | null {
  if (!r) return null;
  const eps = typeof r.table?.gg_epsilon === "number" ? r.table.gg_epsilon
    : typeof r.gg_epsilon === "number" ? r.gg_epsilon
      : Object.values(r.fixed_effects ?? {}).map((f: any) => f?.epsilon)
        .find((e) => typeof e === "number");
  if (typeof eps !== "number") return null;
  return eps < 0.75
    ? { id: "sphericity", label: `Sphericity: ε = ${fmt(eps)}`, state: "warn",
      detail: `Geisser-Greenhouse ε = ${fmt(eps)} (1.0 = sphericity holds): the data depart `
        + "from sphericity, so read the Geisser-Greenhouse corrected P, which accounts for it.",
      explainer: "sphericity" }
    : { id: "sphericity", label: `Sphericity: ε = ${fmt(eps)}`, state: "ok",
      detail: `Geisser-Greenhouse ε = ${fmt(eps)}: close to sphericity. The corrected P is `
        + "reported either way.", explainer: "sphericity" };
}

function zeroVarianceChip(groups: GroupCheck[]): Chip | null {
  const zero = groups.filter((g) => g.n >= 2 && g.sd === 0);
  if (!zero.length) return null;
  const ctl = normalisedControl(groups);
  return ctl
    ? { id: "zero-sd", label: `${ctl.name}: SD 0 (normalised?)`, state: "bad",
      detail: `Every value of ${ctl.name} is ${ctl.mean === 100 ? "100" : "1"}: a control `
        + "normalised to itself is not data. Test the other groups against "
        + `${ctl.mean === 100 ? "100" : "1"} (one-sample t test on the logs) instead of `
        + "comparing them with this column.", explainer: "normalised-control" }
    : { id: "zero-sd", label: "Zero-variance group", state: "bad",
      detail: `${zero.map((g) => g.name).join(", ")} has identical values (SD 0). Check for `
        + "pasted constants; tests that estimate a variance per group cannot use it.",
      explainer: "normalised-control" };
}

function missingChip(ctx: ResultContext, kind: string): Chip | null {
  const rm = PAIRED.has(kind) || (kind === "grouped_two_way" && ctx.options.design !== "none");
  if (!rm) return null;
  const m = missingInRows(ctx.table, ctx.tableType === "column" || ctx.tableType === "xy");
  if (!m.cells) {
    return { id: "missing", label: "No missing values", state: "ok",
      detail: "Every subject has every measurement, so no subject is dropped." };
  }
  const mixed = kind === "grouped_two_way";
  return { id: "missing", label: `${m.cells} missing value${m.cells === 1 ? "" : "s"}`,
    state: mixed ? "info" : "warn",
    detail: mixed
      ? `${m.rows} row${m.rows === 1 ? " has" : "s have"} missing values: OpenDose fits a `
        + "mixed-effects model, which keeps the incomplete subjects. Valid when values are "
        + "missing at random."
      : `${m.rows} row${m.rows === 1 ? "" : "s"} with a missing value ${m.rows === 1 ? "is" : "are"} `
        + "left out of this paired / repeated-measures analysis. A mixed-effects model keeps "
        + "them; OpenDose fits one for two-factor designs (Grouped table, two-way repeated "
        + "measures).",
    explainer: "missing-values" };
}

function outlierChip(ctx: ResultContext, kind: string): Chip | null {
  const r = ctx.result as R | null;
  if (!r) return null;
  if (kind === "outliers" || kind === "rout_column") {
    const sets = (r.datasets ?? []) as R[];
    const n = sets.reduce((a, d) => a + (Array.isArray(d.outliers) ? d.outliers.length
      : typeof d.n_outliers === "number" ? d.n_outliers : 0), 0);
    return { id: "outliers", label: n ? `${n} outlier${n === 1 ? "" : "s"} flagged` : "No outliers flagged",
      state: n ? "warn" : "ok",
      detail: n ? "Look at each flagged value: exclude it (in the table) only for a reason "
        + "beyond the test, such as a recording error, and report the exclusion."
        : `${kind === "rout_column" ? "ROUT" : "Grubbs' test"} flagged no value.`,
      explainer: "outliers" };
  }
  if (kind === "nonlin") {
    const n = ((r.datasets ?? []) as R[]).reduce((a, d) => a + (d.rout?.n_outliers ?? 0), 0);
    if (!((r.datasets ?? []) as R[]).some((d) => d.rout)) return null;
    return { id: "outliers", label: n ? `ROUT removed ${n}` : "ROUT: no outliers",
      state: n ? "warn" : "ok",
      detail: n ? "ROUT left these points out of the fit; report how many and check each "
        + "one is a genuine error." : "ROUT found no outlier.", explainer: "outliers" };
  }
  return null;
}

function cellsChip(ctx: ResultContext, groups: GroupCheck[]): Chip | null {
  if (!(ctx.tableType === "column" || ctx.tableType === "xy") || !looksLikeCells(groups)) return null;
  const max = Math.max(...groups.map((g) => g.n));
  // Replicates already assigned (SuperPlot / "Assign replicates…"): the
  // legend states n with its unit and the experiments; say what is left.
  const rep = replicateFacts(ctx.table, ctx.result);
  if (rep) {
    return { id: "cells", label: `${rep.unit === "values" ? "Values" : cap(rep.unit)} from ${rep.experiments} experiments`,
      state: rep.onMeans ? "ok" : "info",
      detail: rep.onMeans
        ? `The test ran on one value per experiment (n = ${rep.experiments}).`
        : `The legend reports n with its unit and the ${rep.experiments} independent experiments. `
          + "This test still counts every value as independent: for a P value on the experiments, "
          + "use Statistics on replicate means (graph settings → SuperPlot).",
      explainer: "replicates" };
  }
  return { id: "cells", label: "n might be cells, not replicates", state: "warn",
    detail: `Up to ${max} values in ${groups.length} group${groups.length === 1 ? "" : "s"}: if `
      + "these are cells or wells from a few animals or experiments, they are not independent "
      + "and the P value will be far too small. Average per biological replicate (or use a "
      + "Nested table) so n is the number of animals or experiments.", explainer: "replicates",
    ...(ctx.tableType === "column" || ctx.tableType === "xy"
      ? { action: "assign-replicates" as const } : {}) };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function fitChips(r: R): Chip[] {
  const sets = ((r.datasets ?? []) as R[]);
  if (!sets.length) return [];
  const out: Chip[] = [];
  const failed = sets.filter((d) => d.error);
  const fits = sets.filter((d) => d.fit).map((d) => ({ name: d.name as string, fit: d.fit as R }));
  out.push(failed.length
    ? { id: "converged", label: `${failed.length} fit${failed.length === 1 ? "" : "s"} failed`,
      state: "bad", detail: `${failed.map((d) => d.name).join(", ")}: ${String(failed[0].error)}. `
        + "See the banner above for fixes.", explainer: "ambiguous" }
    : { id: "converged", label: "Fit converged", state: "ok",
      detail: "Every data set's fit converged to a best-fit curve." });
  const amb = fits.filter((f) => fitAmbiguous(f.fit));
  if (fits.length) {
    out.push(amb.length
      ? { id: "ambiguous", label: `Ambiguous: ${amb.map((f) => f.name).join(", ")}`, state: "warn",
        detail: "Some parameters are not defined by the data (dependency > 0.9999). Don't "
          + "interpret them; constrain a plateau, widen the dose range or share parameters.",
        explainer: "ambiguous" }
      : { id: "ambiguous", label: "Parameters defined", state: "ok",
        detail: "No parameter is ambiguous: the data determine every fitted value.",
        explainer: "ambiguous" });
  }
  // "> top dose" IC50s have their own block (sheets/xy/rangeFlags.tsx)
  const extra = fits.filter((f) => f.fit.extrapolation && !f.fit.range_flags?.report_as);
  if (extra.length) {
    out.push({ id: "extrapolated", label: `IC50 outside the doses: ${extra.map((f) => f.name).join(", ")}`,
      state: "warn", detail: "The midpoint lies beyond the concentrations tested, so it is "
        + "read off the model's tail. Test doses that bracket it.",
      explainer: "relative-absolute-ic50" });
  }
  const wide = fits.filter((f) => wideParams(f.fit).length);
  if (wide.length) {
    out.push({ id: "wide-ci", label: "Very wide CI", state: "warn",
      detail: `${wide.map((f) => `${f.name} (${wideParams(f.fit).join(", ")})`).join("; ")}: `
        + "the data do not pin these parameters down.", explainer: "ambiguous" });
  }
  const lowDf = fits.filter((f) => typeof f.fit.goodness?.df === "number" && f.fit.goodness.df < 3);
  if (lowDf.length) {
    out.push({ id: "df", label: "Few degrees of freedom", state: "warn",
      detail: `${lowDf.map((f) => `${f.name} (df = ${f.fit.goodness.df})`).join(", ")}: barely `
        + "more points than parameters. Add concentrations or replicates, or fix a parameter." });
  }
  const r2 = fits.map((f) => f.fit.goodness?.r_squared).filter((v): v is number => typeof v === "number");
  if (r2.length) {
    out.push({ id: "r2", label: "R² is not fit quality", state: "info",
      detail: `R² ${r2.length === 1 ? `= ${fmt(r2[0], 3)}` : `ranges ${fmt(Math.min(...r2), 3)}–${fmt(Math.max(...r2), 3)}`}. `
        + "Judge the fit by whether the parameters make sense, their CIs and the residuals.",
      explainer: "r2" });
  }
  return out;
}

/** Is the fit ambiguous? The engine flags dependency > 0.9999; a fit whose
 *  dependencies or standard errors could not be computed at all (e.g. a
 *  flat response, where the covariance matrix is singular) is treated the
 *  same way: the data do not define the parameters. */
export function fitAmbiguous(fit: R | null | undefined): boolean {
  if (!fit) return false;
  if (fit.status === "ambiguous") return true;
  const dep = Object.values((fit.dependency ?? {}) as Record<string, unknown>);
  if (dep.some((v) => v === null || (typeof v === "number" && (!Number.isFinite(v) || v > 0.9999)))) {
    return true;
  }
  const free = Object.values((fit.params ?? {}) as Record<string, R>)
    .filter((e) => !e.constrained && !e.derived);
  return free.length > 0 && free.every((e) => e.se === null || e.se === undefined);
}

/** Parameters whose 95% CI is open (a limit the data cannot bound) or,
 *  for log-scale parameters such as LogIC50, spans more than 2 log units
 *  (a 100-fold range of concentrations). */
export function wideParams(fit: R): string[] {
  const out: string[] = [];
  for (const [name, e] of Object.entries((fit.params ?? {}) as Record<string, R>)) {
    if (e.constrained || e.derived) continue;
    const ci = e.ci95;
    if (!Array.isArray(ci) || ci[0] === null || ci[1] === null) {
      if (e.se !== undefined) out.push(name);
      continue;
    }
    if (/^Log/.test(name) && Math.abs(ci[1] - ci[0]) > 2) out.push(name);
  }
  return out;
}

function contingencyChips(ctx: ResultContext): Chip[] {
  const rows = ctx.table.datasets[0]?.rows.length ?? 0;
  const counts: number[][] = [];
  let fractional = false;
  for (let r = 0; r < rows; r++) {
    const raw = ctx.table.datasets.map((d) => (d.rows[r]?.[0] ?? "").trim());
    if (raw.every((v) => v === "")) continue;
    const row = raw.map((v) => (v === "" ? NaN : Number(v)));
    if (row.some((v) => Number.isFinite(v) && !Number.isInteger(v))) fractional = true;
    counts.push(row.map((v) => (Number.isFinite(v) ? v : 0)));
  }
  const out: Chip[] = [];
  if (fractional) {
    out.push({ id: "counts", label: "Not whole counts", state: "bad",
      detail: "Contingency tables need counts of subjects. Percentages, means or normalised "
        + "values give meaningless P values." });
  }
  const N = counts.flat().reduce((a, b) => a + b, 0);
  if (!N || !counts.length) return out;
  const rs = counts.map((r) => r.reduce((a, b) => a + b, 0));
  const cs = counts[0].map((_, j) => counts.reduce((a, r) => a + r[j], 0));
  const exp = rs.flatMap((ri) => cs.map((cj) => (ri * cj) / N));
  const small = exp.filter((e) => e < 5).length;
  const two = counts.length === 2 && cs.length === 2;
  out.push(small
    ? { id: "expected", label: `${small} expected count${small === 1 ? "" : "s"} < 5`,
      state: two ? "ok" : "warn",
      detail: two ? "Small expected counts: rely on Fisher's exact test, which is valid at any "
        + "sample size, rather than chi-square."
        : "Chi-square is inaccurate when many expected counts are below 5: combine categories "
          + "where it makes sense." }
    : { id: "expected", label: "Expected counts ≥ 5", state: "ok",
      detail: "Every expected count is at least 5, so the chi-square approximation is fine." });
  out.push({ id: "n", label: `N = ${N}`, state: "info",
    detail: "Each subject must be counted once, in one cell. Counts pooled from several "
      + "animals or experiments are not independent: analyse a proportion per replicate.",
    explainer: "replicates" });
  return out;
}

function survivalChips(ctx: ResultContext): Chip[] {
  const out: Chip[] = [];
  const per = ctx.table.datasets.map((d) => {
    let n = 0, events = 0;
    for (const row of d.rows) {
      const t = Number(row[0]), e = (row[1] ?? "").trim();
      if (row[0]?.trim() && Number.isFinite(t)) { n++; if (e === "1") events++; }
    }
    return { name: d.name, n, events };
  }).filter((g) => g.n > 0);
  if (!per.length) return out;
  const fewEvents = per.filter((g) => g.events < 5);
  // The engine's few-events warning, with its rule and sources, is shown
  // under the medians (sheets/survival/extrasPanels.tsx): no second chip.
  const r = ctx.result as R | null;
  const engineWarns = [r?.warnings, r?.extras?.pairwise?.warnings, r?.extras?.at_time?.warnings,
    r?.extras?.rmst?.warnings].flat()
    .some((w) => typeof w === "string" && /few events|events in total/i.test(w));
  if (!engineWarns) out.push(fewEvents.length
    ? { id: "events", label: "Few events", state: "warn",
      detail: `${fewEvents.map((g) => `${g.name}: ${g.events} event${g.events === 1 ? "" : "s"}`)
        .join(", ")}. Survival comparisons draw their power from events, not subjects; with `
        + "few events the median and hazard ratio are imprecise.", explainer: "survival" }
    : { id: "events", label: "Events per group ≥ 5", state: "ok",
      detail: per.map((g) => `${g.name}: ${g.events} events of ${g.n}`).join("; ") + ".",
      explainer: "survival" });
  out.push({ id: "ph", label: "Check curves don't cross", state: "info",
    detail: "The log-rank test and one hazard ratio assume proportional hazards. If the "
      + "curves cross, describe them rather than summarising with one number.",
    explainer: "survival" });
  return out;
}

/** Every chip for this results sheet (empty while no result). */
export function resultChips(ctx: ResultContext): Chip[] {
  const r = ctx.result as R | null;
  if (!r || r.error) return [];
  const kind = analysisKind(ctx);
  if (kind === "nonlin") return [...fitChips(r), outlierChip(ctx, kind)].filter((c): c is Chip => !!c);
  if (["contingency", "mcnemar", "cmh", "proportions", "kappa"].includes(kind)) {
    return contingencyChips(ctx);
  }
  if (kind === "survival") return survivalChips(ctx);
  if (kind === "grouped_two_way" || kind === "grouped_three_way" || kind === "grouped_multiple_t") {
    const cells = cellChecks(ctx.table);
    const groups: GroupCheck[] = cells.map((c) => ({ name: `${c.row} / ${c.dataset}`, n: c.s.n,
      mean: c.s.mean, sd: c.s.sd, normalityP: null, allPositive: (c.s.min ?? 0) > 0 }));
    return [ctx.separate ? separateTestsChip(ctx.separate) : null, nChip(groups, "cell"),
      zeroVarianceChip(groups),
      kind === "grouped_two_way" ? missingChip(ctx, kind) : null,
      sphericityChip(r)].filter((c): c is Chip => !!c);
  }
  if (kind === "nested_ttest" || kind === "nested_anova") {
    const subs = ctx.table.datasets.map((d) => ({ name: d.name,
      units: (d.rows[0]?.length ?? 0) > 0 ? d.rows[0].map((_, s) =>
        d.rows.some((row) => (row[s] ?? "").trim() !== "")).filter(Boolean).length : 0 }));
    const few = subs.filter((s) => s.units > 0 && s.units < 3);
    const nestedChips: (Chip | null)[] = [
      { id: "nested", label: "Replicates handled by the nested model", state: "ok" as ChipState,
        detail: "The subgroups (animals, cultures) are a random effect, so the technical "
          + "replicates within them are not counted as independent.", explainer: "replicates" },
      few.length
        ? { id: "units", label: "Few biological units", state: "warn" as ChipState,
          detail: `${few.map((s) => `${s.name}: ${s.units}`).join(", ")} subgroup(s). The `
            + "effective n is the number of subgroups; with fewer than 3 per group the "
            + "between-subgroup variance is poorly estimated.", explainer: "replicates" }
        : null,
    ];
    return nestedChips.filter((c): c is Chip => !!c);
  }
  // Project-level and small-n chips lead (need ids multiplicity-by-default,
  // small-n-honesty); with P withheld the assumption checks say nothing.
  const lead = [
    ctx.multiplicity ? multiplicityChip(ctx.multiplicity) : null,
    ctx.separate ? separateTestsChip(ctx.separate) : null,
    ctx.sensitivity ? sensitivityChip(ctx.sensitivity) : null,
  ].filter((c): c is Chip => !!c);
  if (withheldInfo(r)) return lead;
  if (!GROUP_TESTS.has(kind) && !(ctx.tableType === "column")) return lead;
  const groups = usedGroups(ctx, kind);
  return [
    ...lead,
    nChip(groups),
    kind === "outliers" || kind === "rout_column" ? null
      : normalityChip(groups, kind, !!r.residual_check && !(r.residual_check as R).unavailable),
    equalSdChip(ctx, groups, kind),
    kind === "rm_anova" ? sphericityChip(r) : null,
    zeroVarianceChip(groups),
    missingChip(ctx, kind),
    outlierChip(ctx, kind),
    cellsChip(ctx, groups),
  ].filter((c): c is Chip => !!c);
}
