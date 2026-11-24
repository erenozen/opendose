// One statistics table for the whole project (P-66): every comparison a
// results sheet reports, one row each, with the sheet, the figure panel it
// is drawn in, the test, n per group, the statistic with its df, the exact
// P, how the P was adjusted and over which family, the estimate with its
// CI and the standardized effect size with its CI. Written as CSV, as an
// Excel sheet and as a Word table (File menu, the export bundle).
//
// Every number is the engine's value written the way the results sheet
// writes it (formatSig at the results precision, P through pformat.ts), so
// a row reads exactly as its results sheet does; "P (exact)" adds the
// engine's P to four significant digits, below the style's floor too
// (SAMPL, Lang & Altman 2013: exact P values). One mapper per analysis
// kind reads the engine's own fields; a kind without a mapper, a result
// that failed or one still computing gets one row saying so, never
// nothing. Pure, unit-tested against native engine results
// (__tests__/statsTable.test.ts).
import { formatSig } from "../types.ts";
import { describeResult, nCount, type GroupN } from "./describe.ts";
import { effectGroups, primaryEffect, type EffectRow } from "./effects.ts";
import { familyOf, type Family } from "./family.ts";
import { pNumber, type PStyle } from "./pformat.ts";
import { DEFAULT_REPORT, type ReportPrefs } from "./prefs.ts";
import { withheldInfo, withheldPhrase } from "../sheets/common/withheld.ts";
import type { WordCell, WordSection } from "../export/wordTable.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

/** One results sheet, with what the table needs to place it. */
export interface StatsEntry {
  /** The results sheet's name. */
  sheet: string;
  /** The data table it analyses. */
  data: string;
  /** The results sheet's analysis id ("column", "cox", "quantal", ...). */
  analysisId: string;
  /** The analysis as the Analyze menu names it ("t tests (and nonparametric tests)"). */
  analysisLabel: string;
  /** "Figure 1, panel A" for each layout panel drawing this sheet's graph. */
  panels: string[];
  /** The engine result; null while it is still being computed. */
  result: unknown;
}

export interface StatsRow {
  sheet: string;
  panel: string;
  data: string;
  test: string;
  comparison: string;
  n: string;
  statistic: string;
  value: string;
  df: string;
  p: string;
  pExact: string;
  adjustment: string;
  family: string;
  estimate: string;
  estimateValue: string;
  ciLevel: string;
  ciLower: string;
  ciUpper: string;
  effect: string;
  effectValue: string;
  effectLower: string;
  effectUpper: string;
  note: string;
}

/** Column order and headers of the CSV and Excel table. */
export const STATS_COLUMNS: { key: keyof StatsRow; header: string }[] = [
  { key: "sheet", header: "Results sheet" },
  { key: "panel", header: "Figure panel" },
  { key: "data", header: "Data table" },
  { key: "test", header: "Test" },
  { key: "comparison", header: "Comparison" },
  { key: "n", header: "n per group" },
  { key: "statistic", header: "Statistic" },
  { key: "value", header: "Statistic value" },
  { key: "df", header: "df" },
  { key: "p", header: "P" },
  { key: "pExact", header: "P (exact)" },
  { key: "adjustment", header: "Adjustment" },
  { key: "family", header: "Family" },
  { key: "estimate", header: "Estimate" },
  { key: "estimateValue", header: "Estimate value" },
  { key: "ciLevel", header: "CI level" },
  { key: "ciLower", header: "CI lower" },
  { key: "ciUpper", header: "CI upper" },
  { key: "effect", header: "Effect size" },
  { key: "effectValue", header: "Effect size value" },
  { key: "effectLower", header: "Effect size CI lower" },
  { key: "effectUpper", header: "Effect size CI upper" },
  { key: "note", header: "Note" },
];

// ------------------------------------------------------------ formatting

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const ci2 = (v: unknown): [number, number] | null =>
  (Array.isArray(v) && v.length === 2 && num(v[0]) && num(v[1]) ? [v[0], v[1]] : null);

/** A number as the results sheet writes it ("" when absent). */
const f = (v: unknown): string => (num(v) ? formatSig(v) : "");
/** Degrees of freedom: whole numbers as they are, others as the sheet writes them. */
const dfText = (v: unknown): string => (num(v) ? (Number.isInteger(v) ? String(v) : formatSig(v)) : "");
const dfPair = (a: unknown, b: unknown): string => (num(a) && num(b) ? `${dfText(a)}, ${dfText(b)}` : dfText(a));
const levelText = (l: unknown): string => (num(l) ? `${Number((l * 100).toPrecision(4))}%` : "95%");

interface Ctx {
  style: PStyle;
  prefs: Pick<ReportPrefs, "smd" | "variance">;
  entry: StatsEntry;
  groups: GroupN[];
  test: string;
}

/** The parts of a row a mapper fills; the rest come from the entry. */
type Part = Partial<Omit<StatsRow, "sheet" | "panel" | "data">> & {
  pValue?: unknown;
  ci?: [number, number] | null;
  level?: unknown;
  eff?: EffectRow | null;
};

const SINGLE = "none (one comparison)";
const PER_TERM = "not adjusted (one test per term)";

function finish(ctx: Ctx, part: Part): StatsRow {
  const { pValue, ci, level, eff, ...rest } = part;
  const row: StatsRow = {
    sheet: ctx.entry.sheet, panel: ctx.entry.panels.join("; "), data: ctx.entry.data,
    test: ctx.test, comparison: "", n: nText(ctx.groups), statistic: "", value: "", df: "",
    p: "", pExact: "", adjustment: "", family: "", estimate: "", estimateValue: "", ciLevel: "",
    ciLower: "", ciUpper: "", effect: "", effectValue: "", effectLower: "", effectUpper: "", note: "",
    ...rest,
  };
  if (num(pValue)) {
    row.p = pNumber(pValue, ctx.style, "table");
    row.pExact = formatSig(pValue, 4);
  }
  if (ci) {
    row.ciLevel = levelText(level);
    row.ciLower = f(ci[0]);
    row.ciUpper = f(ci[1]);
  } else if (row.estimate && num(level)) row.ciLevel = levelText(level);
  if (eff) {
    row.effect = eff.measure;
    row.effectValue = f(eff.value);
    if (eff.ci) {
      row.effectLower = f(eff.ci[0]);
      row.effectUpper = f(eff.ci[1]);
      if (!row.ciLevel) row.ciLevel = levelText(eff.ciLevel);
    }
  }
  return row;
}

function nText(groups: GroupN[]): string {
  return groups.map((g) => `${g.name} ${nCount(g)}`).join("; ");
}

/** The groups of an "A vs. B" pair, when both are known. */
function pairGroups(groups: GroupN[], pair: string): string | undefined {
  const m = /^(.*) vs\.? (.*)$/.exec(pair);
  if (!m) return undefined;
  const a = groups.find((g) => g.name === m[1].trim()), b = groups.find((g) => g.name === m[2].trim());
  return a && b ? nText([a, b]) : undefined;
}

/** The adjustment and family columns of a comparisons block. */
function familyCols(fam: Family | null): { adjustment: string; family: string } {
  if (!fam) return { adjustment: "", family: "" };
  const count = `${fam.size} ${fam.planned ? "planned comparison" : "comparison"}${fam.size === 1 ? "" : "s"}`;
  const per = fam.perFamily && fam.nFamilies && fam.nFamilies > 1 ? `, within each of ${fam.nFamilies} families` : "";
  const family = `${count}${fam.detail ? ` (${fam.detail})` : ""}${per}`;
  switch (fam.kind) {
    case "fdr": return { adjustment: `${fam.name} (false discovery rate; P is a q value)`, family };
    case "unadjusted": return { adjustment: `none (${fam.name === "no correction" ? "uncorrected" : fam.name})`, family };
    case "stepwise": return { adjustment: "Newman-Keuls (stepwise; no adjusted P)", family };
    default: return { adjustment: fam.name, family };
  }
}

/** The statistic of a post hoc comparison, named by its method. */
function mcStatName(method: string): string {
  if (method === "tukey" || method === "games_howell" || method === "newman_keuls") return "q";
  if (/dunn/.test(method)) return "z";
  return "t";
}

/** One row per comparison of a comparisons block (ANOVA post hoc tests,
 *  Dunn's test, mixed-model comparisons). */
function comparisonRows(ctx: Ctx, mc: R | null | undefined, fallbackMethod?: string): StatsRow[] {
  if (!mc || !Array.isArray(mc.comparisons) || !mc.comparisons.length) return [];
  const fam = familyOf(mc, fallbackMethod);
  const cols = familyCols(fam);
  const method = String(mc.method ?? fallbackMethod ?? "");
  const rank = mc.comparisons.some((c: R) => num(c?.mean_rank_difference));
  return mc.comparisons.map((c: R) => {
    const pair = String(c.pair ?? "");
    const where = c.family ?? c.time;
    const p = c.p_adjusted ?? (fam?.kind === "unadjusted" ? c.p_unadjusted : null);
    const diff = c.difference ?? c.mean_rank_difference;
    return finish(ctx, {
      test: `${ctx.test}: ${fam?.name ?? method.replace(/_/g, " ")} multiple comparisons`,
      comparison: where != null && String(where) && !pair.includes(String(where))
        ? `${pair} (${where})` : pair,
      n: pairGroups(ctx.groups, pair) ?? nText(ctx.groups),
      statistic: num(c.statistic) ? mcStatName(method) : "",
      value: f(c.statistic),
      df: dfText(c.df ?? mc.df ?? mc.df_residual),
      pValue: p,
      ...cols,
      estimate: num(diff) ? (rank ? "Mean rank difference" : "Difference") : "",
      estimateValue: f(diff),
      ci: ci2(c.ci ?? c.ci95),
      level: mc.ci_level,
      note: method === "newman_keuls" ? (c.significant ? "significant (stepwise)" : "not significant (stepwise)") : "",
    });
  });
}

// ------------------------------------------------------------ mappers

function ttestRows(ctx: Ctx, r: R): StatsRow[] {
  const [a, b] = Array.isArray(r.names) ? r.names.map(String) : ["A", "B"];
  const eff = primaryEffect(effectGroups(r, ctx.prefs));
  const base: Part = { comparison: `${a} − ${b}`, adjustment: SINGLE, eff };
  const p = r.p_two_tailed ?? r.p;
  switch (r.test) {
    case "unpaired_t":
    case "welch_t":
    case "paired_t": {
      const diff = r.difference ?? r.mean_difference;
      const t = num(r.t) && num(diff) && diff < 0 ? -Math.abs(r.t) : r.t;
      return [finish(ctx, { ...base, statistic: "t", value: f(t), df: f(r.df), pValue: p,
        estimate: r.test === "paired_t" ? `Mean of differences (${a} − ${b})` : `Difference between means (${a} − ${b})`,
        estimateValue: f(diff), ci: ci2(r.ci_difference) })];
    }
    case "ratio_paired_t":
      return [finish(ctx, { ...base, comparison: `${a} / ${b}`, statistic: "t", value: f(r.t), df: f(r.df),
        pValue: p, estimate: `Geometric mean of ratios (${a} / ${b})`, estimateValue: f(r.ratio ?? r.geometric_mean_ratio),
        ci: ci2(r.ci_ratio) })];
    case "mann_whitney":
      return [finish(ctx, { ...base, statistic: "U", value: f(r.U), pValue: p,
        estimate: "Hodges-Lehmann difference", estimateValue: f(r.hodges_lehmann_difference),
        ci: ci2(r.ci_hodges_lehmann), level: r.ci_actual_level,
        note: num(r.ci_actual_level) ? "CI at the level the ranks achieve" : "" })];
    case "wilcoxon_matched_pairs":
      return [finish(ctx, { ...base, statistic: "W (sum of signed ranks)", value: f(r.W), pValue: p,
        estimate: "Hodges-Lehmann median of differences", estimateValue: f(r.hodges_lehmann),
        ci: ci2(r.ci_median), level: r.ci_actual_level,
        note: num(r.ci_actual_level) ? "CI at the level the ranks achieve" : "" })];
    case "kolmogorov_smirnov":
      return [finish(ctx, { ...base, statistic: "D", value: f(r.D), pValue: r.p ?? p })];
    default:
      return [];
  }
}

function anovaRows(ctx: Ctx, r: R): StatsRow[] {
  const eff = primaryEffect(effectGroups(r, ctx.prefs));
  const among = "Among all groups";
  if (r.kind === "nonparametric") {
    const k = Array.isArray(r.group_summaries) ? r.group_summaries.length : 0;
    return [finish(ctx, { comparison: among, statistic: "H", value: f(r.H),
      df: r.p_method !== "exact" && k > 1 ? String(k - 1) : "", pValue: r.p, adjustment: "none (omnibus test)", eff }),
    ...comparisonRows(ctx, r.dunns, "dunns")];
  }
  const t = r.table ?? {};
  return [finish(ctx, { comparison: among, statistic: "F", value: f(t.F), df: dfPair(t.df_between, t.df_within),
    pValue: t.p, adjustment: "none (omnibus test)", eff }),
  ...comparisonRows(ctx, r.multiple_comparisons)];
}

function welchAnovaRows(ctx: Ctx, r: R): StatsRow[] {
  const out: StatsRow[] = [];
  const w = r.welch, bf = r.brown_forsythe;
  if (w && num(w.W ?? w.F)) {
    out.push(finish(ctx, { test: "Welch's ANOVA", comparison: "Among all groups", statistic: "W (Welch F)",
      value: f(w.W ?? w.F), df: dfPair(w.dfn, w.dfd), pValue: w.p, adjustment: "none (omnibus test)" }));
  }
  if (bf && num(bf.F)) {
    out.push(finish(ctx, { test: "Brown-Forsythe ANOVA", comparison: "Among all groups", statistic: "F*",
      value: f(bf.F), df: dfPair(bf.dfn, bf.dfd), pValue: bf.p, adjustment: "none (omnibus test)" }));
  }
  return [...out, ...comparisonRows(ctx, r.multiple_comparisons)];
}

function rmOneWayRows(ctx: Ctx, r: R): StatsRow[] {
  const t = r.table ?? {};
  const eff = primaryEffect(effectGroups(r, ctx.prefs));
  const gg = num(t.p_geisser_greenhouse);
  return [finish(ctx, { comparison: "Among all treatments", statistic: "F", value: f(t.F),
    df: dfPair(t.df_treatment, t.df_error), pValue: gg ? t.p_geisser_greenhouse : t.p_assuming_sphericity ?? t.p,
    adjustment: "none (omnibus test)", eff,
    note: gg ? `Geisser-Greenhouse corrected P (ε = ${f(t.gg_epsilon)}); df shown uncorrected` : "" }),
  ...comparisonRows(ctx, r.multiple_comparisons ?? r.comparisons)];
}

function mixedRmOneWayRows(ctx: Ctx, r: R): StatsRow[] {
  const fe = r.fixed_effect ?? {};
  const gg = num(fe.p_geisser_greenhouse);
  return [finish(ctx, { comparison: "Among all treatments", statistic: "F", value: f(fe.F),
    df: dfPair(fe.df_num, fe.df_den), pValue: gg ? fe.p_geisser_greenhouse : fe.p, adjustment: "none (omnibus test)",
    note: gg ? `Geisser-Greenhouse corrected P (ε = ${f(fe.epsilon)}); df shown uncorrected` : "" }),
  ...comparisonRows(ctx, r.multiple_comparisons)];
}

function friedmanRows(ctx: Ctx, r: R): StatsRow[] {
  const eff = primaryEffect(effectGroups(r, ctx.prefs));
  return [finish(ctx, { comparison: "Among all treatments", statistic: "Friedman statistic", value: f(r.statistic),
    pValue: r.p, adjustment: "none (omnibus test)", eff }), ...comparisonRows(ctx, r.dunns, "dunns")];
}

const SOURCE_LABELS: Record<string, string> = {
  interaction: "Interaction", row_factor: "Row factor", column_factor: "Column factor",
};

/** ANOVA tables keyed by source (two-way, three-way, RM two-way) and the
 *  fixed effects of the mixed-model RM two-way. A Geisser-Greenhouse P
 *  the sheet shows beside the plain one goes in the note. */
function sourcesRows(ctx: Ctx, r: R): StatsRow[] {
  const src: R = r.sources && typeof r.sources === "object" ? r.sources
    : r.fixed_effects && typeof r.fixed_effects === "object" ? r.fixed_effects : {};
  const resid = src.residual ?? src.Residual;
  const groups = effectGroups(r, ctx.prefs);
  const out: StatsRow[] = [];
  for (const [name, s] of Object.entries(src) as [string, R][]) {
    if (!s || !num(s.F) || /^residual/i.test(name)) continue;
    const g = groups.find((x) => [name, s.term].some((t) => typeof t === "string"
      && x.title?.toLowerCase() === (SOURCE_LABELS[t] ?? t).toLowerCase()));
    const eff = g ? g.rows.find((x) => x.preferred) ?? g.rows[0] : null;
    const dfn = s.df ?? s.df_num, dfd = s.df_den ?? s.dfd ?? (resid ? resid.df : null);
    out.push(finish(ctx, { comparison: SOURCE_LABELS[name] ?? name, statistic: "F", value: f(s.F),
      df: dfPair(dfn, dfd), pValue: s.p, adjustment: PER_TERM, eff,
      note: num(s.p_geisser_greenhouse) ? `P (Geisser-Greenhouse) ${pNumber(s.p_geisser_greenhouse, ctx.style, "table")}` : "" }));
  }
  return [...out, ...comparisonRows(ctx, r.multiple_comparisons)];
}

/** The aligned rank transform two-way ANOVA (P-85): each effect from the
 *  ranks aligned for it, then the ART-C contrasts (mean rank differences). */
function artRowsOf(ctx: Ctx, r: R): StatsRow[] {
  const src: R = r.sources && typeof r.sources === "object" ? r.sources : {};
  const out: StatsRow[] = [];
  for (const [name, s] of Object.entries(src) as [string, R][]) {
    if (!s || !num(s.F)) continue;
    out.push(finish(ctx, { comparison: SOURCE_LABELS[name] ?? name, statistic: "F (aligned ranks)",
      value: f(s.F), df: dfPair(s.df, s.df_residual), pValue: s.p, adjustment: PER_TERM,
      note: "ranks aligned for this effect" }));
  }
  const cc = r.art_contrasts as R | undefined;
  const rows = comparisonRows(ctx, cc ? { ...cc, method: cc.family?.method } : null);
  return [...out, ...rows.map((x) => ({ ...x, estimate: x.estimate ? "Difference of mean aligned ranks" : "" }))];
}

/** Mixed models with an "anova" list ({term, f, dfn, dfd, p}). */
function termListRows(ctx: Ctx, r: R, mc: R | null | undefined): StatsRow[] {
  const terms: R[] = Array.isArray(r.anova) ? r.anova : [];
  return [...terms.filter((t) => num(t?.f ?? t?.F)).map((t) => finish(ctx, {
    comparison: String(t.term ?? t.source ?? ""), statistic: "F", value: f(t.f ?? t.F),
    df: dfPair(t.dfn ?? t.df_num, t.dfd ?? t.df_den), pValue: t.p, adjustment: PER_TERM,
  })), ...comparisonRows(ctx, mc)];
}

function multiRowRows(ctx: Ctx, r: R): StatsRow[] {
  const rows: R[] = Array.isArray(r.rows) ? r.rows : [];
  const cols = familyCols(familyOf(r));
  const [a, b] = Array.isArray(r.names) ? r.names.map(String) : ["A", "B"];
  return rows.map((x) => {
    const eff = x.effect_size ? primaryEffect(effectGroups({ effect_size: x.effect_size }, ctx.prefs)) : null;
    return finish(ctx, {
      comparison: `${x.row ?? ""}: ${a} − ${b}`, n: `${a} ${x.n_a ?? ""}; ${b} ${x.n_b ?? ""}`,
      statistic: String(x.statistic_name ?? ""), value: f(x.statistic), df: f(x.df),
      pValue: x.p_adjusted ?? x.p, ...cols,
      estimate: num(x.difference) ? `Difference (${a} − ${b})` : "", estimateValue: f(x.difference),
      ci: ci2(x.ci ?? x.ci_difference), eff,
      note: num(x.p_unadjusted) && x.p_unadjusted !== x.p_adjusted ? `unadjusted P ${pNumber(x.p_unadjusted, ctx.style, "table")}` : "",
    });
  });
}

function correlationRows(ctx: Ctx, r: R): StatsRow[] {
  const names: string[] = Array.isArray(r.names) ? r.names.map(String) : [];
  const kendall = r.method === "kendall";
  const label = r.method === "spearman" ? "Spearman r" : kendall ? "Kendall's tau-b"
    : r.method === "rm_corr" ? "Repeated-measures r" : "Pearson r";
  const rv = kendall ? r.tau ?? r.r : r.r;
  return [finish(ctx, { comparison: names.join(" and "), statistic: label, value: f(rv),
    df: r.method === "pearson" || r.method === undefined ? (num(r.n) ? String(r.n - 2) : "") : f(r.df),
    pValue: r.p_two_tailed ?? r.p, adjustment: SINGLE, estimate: label, estimateValue: f(rv), ci: ci2(r.ci_r) })];
}

function contingencyRows(ctx: Ctx, r: R): StatsRow[] {
  const two = r.rows === 2 && r.cols === 2;
  const eff = primaryEffect(effectGroups(r, ctx.prefs));
  const out: StatsRow[] = [];
  if (two && num(r.fisher_exact?.p)) {
    const rr = r.relative_risk, or = r.odds_ratio;
    out.push(finish(ctx, { test: "Fisher's exact test", comparison: "Rows vs. columns", pValue: r.fisher_exact.p,
      adjustment: SINGLE, estimate: rr && num(rr.value) ? "Relative risk" : or && num(or.value) ? "Odds ratio" : "",
      estimateValue: f(rr?.value ?? or?.value), ci: ci2(rr?.ci ?? or?.ci), eff }));
  }
  if (r.chi_square && num(r.chi_square.chi2)) {
    out.push(finish(ctx, { test: "chi-square test", comparison: "Rows vs. columns", statistic: "χ²",
      value: f(r.chi_square.chi2), df: dfText(r.chi_square.df), pValue: r.chi_square.p, adjustment: SINGLE,
      eff: two ? null : eff }));
  }
  return out;
}

function survivalRows(ctx: Ctx, r: R): StatsRow[] {
  const names: string[] = Array.isArray(r.logrank?.group_names) ? r.logrank.group_names.map(String)
    : Object.keys(r.curves ?? {});
  const hr = r.hazard_ratio;
  const out: StatsRow[] = [];
  if (r.logrank && num(r.logrank.chi2)) {
    out.push(finish(ctx, { test: "log-rank (Mantel-Cox) test", comparison: names.join(" vs. "), statistic: "χ²",
      value: f(r.logrank.chi2), df: dfText(r.logrank.df), pValue: r.logrank.p, adjustment: SINGLE,
      estimate: hr && num(hr.value) ? `Hazard ratio (${names.join(" / ")}, Mantel-Haenszel)` : "",
      estimateValue: f(hr?.value), ci: ci2(hr?.ci) }));
  }
  if (r.gehan_breslow_wilcoxon && num(r.gehan_breslow_wilcoxon.chi2)) {
    const g = r.gehan_breslow_wilcoxon;
    out.push(finish(ctx, { test: "Gehan-Breslow-Wilcoxon test", comparison: names.join(" vs. "), statistic: "χ²",
      value: f(g.chi2), df: dfText(g.df), pValue: g.p, adjustment: SINGLE }));
  }
  const pw = r.extras?.pairwise;
  if (pw && !pw.error && Array.isArray(pw.comparisons)) {
    const fam = familyCols(familyOf({ family: pw.family, comparisons: pw.comparisons, method: pw.correction }));
    for (const c of pw.comparisons as R[]) {
      out.push(finish(ctx, { test: "pairwise log-rank test", comparison: `${c.a} vs. ${c.b}`, statistic: "χ²",
        value: f(c.chi2), df: dfText(c.df), pValue: c.p_adjusted ?? c.p, ...fam }));
    }
  }
  return out;
}

/** Regression models with a coefficients list (linear, logistic, Poisson,
 *  negative binomial, binomial, Cox). The intercept is not a comparison. */
function coefficientRows(ctx: Ctx, r: R): StatsRow[] {
  const coefs: R[] = Array.isArray(r.coefficients) ? r.coefficients : [];
  const level = r.ci_level;
  const ratio = r.analysis === "cox" ? ["hazard_ratio", "Hazard ratio"]
    : r.analysis === "logistic_regression" || r.analysis === "binomial_regression"
      || r.analysis === "ordinal_regression" ? ["odds_ratio", "Odds ratio"]
      : r.analysis === "poisson_regression" || r.analysis === "negative_binomial_regression" ? ["rate_ratio", "Rate ratio"]
        : null;
  const n = num(r.n_rows_analyzed) ? `${r.n_rows_analyzed} rows` : num(r.n) ? `${r.n} subjects` : nText(ctx.groups);
  return coefs.filter((c) => c && c.name !== "Intercept").map((c) => {
    const tStat = num(c.t);
    const vs = c.level && c.reference ? `${c.term ?? c.name}: ${c.level} vs. ${c.reference}` : String(c.name);
    return finish(ctx, {
      comparison: vs, n,
      statistic: tStat ? "t" : num(c.z) ? "z" : "", value: f(tStat ? c.t : c.z),
      df: tStat ? dfText(c.df ?? r.goodness?.df ?? r.df_residual) : "",
      pValue: c.p, adjustment: PER_TERM,
      estimate: ratio && num(c[ratio[0]]) ? ratio[1] : "Coefficient",
      estimateValue: f(ratio && num(c[ratio[0]]) ? c[ratio[0]] : c.estimate ?? c.coef),
      ci: ci2(ratio && num(c[ratio[0]]) ? c[`${ratio[0]}_ci`] : c.ci), level,
    });
  });
}

function nestedRows(ctx: Ctx, r: R): StatsRow[] {
  if (r.analysis === "nested_t_test") {
    return [finish(ctx, { comparison: String(r.comparison ?? "").replace(" - ", " − "), statistic: "t",
      value: f(r.t), df: dfText(r.df), pValue: r.p, adjustment: SINGLE,
      estimate: `Difference (${String(r.comparison ?? "").replace(" - ", " − ")})`, estimateValue: f(r.difference),
      ci: ci2(r.ci), level: r.ci_level })];
  }
  return [finish(ctx, { comparison: "Among all groups", statistic: "F", value: f(r.F), df: dfPair(r.df_num, r.df_den),
    pValue: r.p, adjustment: "none (omnibus test)" }), ...comparisonRows(ctx, r.multiple_comparisons)];
}

function doseRows(ctx: Ctx, r: R): StatsRow[] {
  const out: StatsRow[] = [];
  for (const ds of (Array.isArray(r.datasets) ? r.datasets : []) as R[]) {
    const fit = ds?.fit;
    const params: R = fit?.params ?? {};
    const keys = Object.keys(params);
    const mid = ["IC50", "EC50"].find((k) => num(params[k]?.value))
      ?? keys.find((k) => /^(I|E)C\d+$|^K[di]$|^Km$|^Bmax$|^HalfLife$|^K$/.test(k) && num(params[k]?.value));
    const name = String(ds?.name ?? "");
    if (!fit || ds.error || fit.error) {
      out.push(finish(ctx, { comparison: name, note: `Not fitted: ${String(ds?.error ?? fit?.error ?? "no fit")}` }));
      continue;
    }
    const n = num(fit.goodness?.n_points) ? `${name} ${fit.goodness.n_points} points` : "";
    const flags = fit.range_flags ?? {};
    const status = fit.status && fit.status !== "ok" && fit.status !== "converged" ? `Fit: ${String(fit.status)}`
      : flags.ec50_above_range || flags.ec50_below_range ? `${mid ?? "midpoint"} outside the concentrations tested` : "";
    const note = [status, bootstrapNote(fit)].filter(Boolean).join("; ");
    if (mid) {
      out.push(finish(ctx, { test: `nonlinear regression (${String(fit.label ?? fit.model ?? "curve fit")})`,
        comparison: name, n, estimate: mid, estimateValue: f(params[mid].value), ci: ci2(params[mid].ci95), level: 0.95, note }));
    }
    const log = keys.find((k) => /^Log(I|E)C50$/.test(k));
    if (log && num(params[log]?.value)) {
      out.push(finish(ctx, { test: `nonlinear regression (${String(fit.label ?? fit.model ?? "curve fit")})`,
        comparison: name, n, estimate: log, estimateValue: f(params[log].value), ci: ci2(params[log].ci95), level: 0.95, note }));
    }
  }
  const cmp = r.comparison ?? r.compare;
  if (cmp && num(cmp.p) && num(cmp.F)) {
    out.push(finish(ctx, { test: "extra sum-of-squares F test", comparison: String(cmp.label ?? cmp.question ?? "Compare fits"),
      statistic: "F", value: f(cmp.F), df: dfPair(cmp.dfn ?? cmp.df_num, cmp.dfd ?? cmp.df_den), pValue: cmp.p, adjustment: SINGLE }));
  }
  return out;
}

/** "CI by bootstrap (case resampling, 500 resamples, percentile)" for a
 *  fit whose CIs were bootstrapped (P-101), else "". */
export function bootstrapNote(fit: R | null | undefined): string {
  const b = fit?.bootstrap;
  if (fit?.ci_method !== "bootstrap" || !b) return "";
  const how = b.method === "residual" ? "residual resampling" : b.method === "case" ? "case resampling" : String(b.method ?? "");
  return `CI by bootstrap (${[how, num(b.resamples) ? `${b.resamples} resamples` : "", String(b.interval ?? "")]
    .filter(Boolean).join(", ")})`;
}

function linregRows(ctx: Ctx, r: R): StatsRow[] {
  return (Array.isArray(r.datasets) ? r.datasets : []).filter((d: R) => d?.fit?.slope).map((d: R) => {
    const fit = d.fit, F = fit.f_nonzero_slope;
    return finish(ctx, { test: "linear regression", comparison: `${d.name}: slope vs. 0`,
      n: num(fit.n) ? `${d.name} ${fit.n}` : "", statistic: F ? "F" : "", value: f(F?.F), df: F ? dfPair(F.dfn, F.dfd) : "",
      pValue: F?.p, adjustment: SINGLE, estimate: "Slope", estimateValue: f(fit.slope.value), ci: ci2(fit.slope.ci95), level: 0.95 });
  });
}

function columnStatsRows(ctx: Ctx, r: R): StatsRow[] {
  const out: StatsRow[] = [];
  const many = (Array.isArray(r.datasets) ? r.datasets : []).filter((d: R) => d?.one_sample_t).length > 1;
  for (const ds of (Array.isArray(r.datasets) ? r.datasets : []) as R[]) {
    const t = ds?.one_sample_t;
    if (!t) continue;
    const g = effectGroups(r, ctx.prefs);
    const effT = g.find((x) => x.title === `${ds.name}: one-sample t test`);
    out.push(finish(ctx, { test: "one-sample t test", comparison: `${ds.name} vs. ${f(t.hypothetical)}`,
      n: `${ds.name} ${ds.descriptive?.n ?? ""}`, statistic: "t", value: f(t.t), df: dfText(t.df), pValue: t.p_two_tailed,
      adjustment: many ? "none (one test per data set, not adjusted)" : SINGLE,
      estimate: "Discrepancy (mean − hypothetical)", estimateValue: f(t.discrepancy), ci: ci2(t.ci_discrepancy),
      eff: effT?.rows.find((x) => x.preferred) ?? effT?.rows[0] ?? null }));
    const w = ds.wilcoxon;
    if (w && num(w.p_two_tailed)) {
      out.push(finish(ctx, { test: "Wilcoxon signed rank test", comparison: `${ds.name} vs. ${f(t.hypothetical)}`,
        n: `${ds.name} ${ds.descriptive?.n ?? ""}`, statistic: "W", value: f(w.W), pValue: w.p_two_tailed,
        adjustment: many ? "none (one test per data set, not adjusted)" : SINGLE,
        estimate: num(w.hodges_lehmann_median) ? "Hodges-Lehmann median" : "", estimateValue: f(w.hodges_lehmann_median),
        ci: ci2(w.ci_median), level: w.ci_actual_level }));
    }
  }
  return out;
}

function estimationRows(ctx: Ctx, r: R): StatsRow[] {
  const many = Array.isArray(r.comparisons) && r.comparisons.length > 1;
  return (Array.isArray(r.comparisons) ? r.comparisons : []).flatMap((c: R) =>
    (Array.isArray(c.effects) ? c.effects : []).map((e: R) => finish(ctx, {
      comparison: `${c.test} − ${c.control}`, n: pairGroups(ctx.groups, `${c.test} vs. ${c.control}`) ?? nText(ctx.groups),
      statistic: "", pValue: e.permutation?.p ?? e.p,
      adjustment: many ? "none (each against the control, not adjusted)" : SINGLE,
      estimate: String(e.label ?? e.effect ?? "Difference"), estimateValue: f(e.difference ?? e.value),
      ci: ci2(e.ci), level: r.ci_level, note: `${String(e.ci_type ?? "bootstrap").toUpperCase() === "BCA" ? "BCa bootstrap" : "bootstrap"} CI; P from a permutation test` })));
}

/** One summary value per subject compared between groups (time courses). */
function subjectAucRows(ctx: Ctx, r: R): StatsRow[] {
  const c = r.comparison;
  if (!c || !num(c.p)) return [];
  const names: string[] = Array.isArray(c.names) ? c.names.map(String) : [];
  const two = num(c.t);
  return [finish(ctx, { comparison: two ? names.join(" − ") : "Among all groups", statistic: two ? "t" : "F",
    value: f(two ? c.t : c.F), df: two ? f(c.df) : dfPair(c.dfn, c.dfd), pValue: c.p,
    adjustment: two ? SINGLE : "none (omnibus test)",
    estimate: two && num(c.difference) ? `Difference (${names.join(" − ")})` : "", estimateValue: f(c.difference),
    note: "one summary value per subject" })];
}

function quantalRows(ctx: Ctx, r: R): StatsRow[] {
  const fits: R[] = Array.isArray(r.fits) ? r.fits : Array.isArray(r.datasets) ? r.datasets : [];
  const out: StatsRow[] = [];
  for (const fit of fits) {
    if (fit.error) { out.push(finish(ctx, { comparison: String(fit.name ?? ""), note: `Not fitted: ${fit.error}` })); continue; }
    const link = String(fit.link ?? "probit");
    const n = num(fit.n_total) ? `${fit.name} ${fit.n_total} subjects` : "";
    const st = fit.slope_test;
    if (st && num(st.statistic)) {
      out.push(finish(ctx, { test: `quantal dose-response (${link})`, comparison: `${fit.name}: slope vs. 0`, n,
        statistic: "z", value: f(st.statistic), pValue: st.p, adjustment: SINGLE,
        estimate: "Slope", estimateValue: f(fit.parameters?.slope?.value), ci: ci2(fit.parameters?.slope?.ci), level: r.ci_level }));
    }
    for (const ec of (Array.isArray(fit.ec) ? fit.ec : []) as R[]) {
      out.push(finish(ctx, { test: `quantal dose-response (${link})`, comparison: String(fit.name ?? ""), n,
        estimate: `ED${f(ec.level)} (dose)`, estimateValue: f(ec.dose), ci: ci2(ec.dose_ci_fieller ?? ec.dose_ci_delta),
        level: r.ci_level, note: ci2(ec.dose_ci_fieller) ? "Fieller CI" : "delta-method CI" }));
    }
  }
  return out;
}

function simpleRows(ctx: Ctx, r: R): StatsRow[] {
  switch (r.analysis) {
    case "mcnemar": {
      const chi = r.chi_square;
      const p = r.recommended_p ?? chi?.p;
      return [finish(ctx, { comparison: "Paired outcomes", statistic: num(chi?.chi2) ? "χ²" : "", value: f(chi?.chi2),
        df: dfText(chi?.df), pValue: p, adjustment: SINGLE,
        estimate: r.odds_ratio && num(r.odds_ratio.value) ? "Odds ratio (discordant pairs)" : "",
        estimateValue: f(r.odds_ratio?.value), ci: ci2(r.odds_ratio?.ci),
        note: num(r.recommended_p) && r.recommended_p !== chi?.p ? "P from the exact binomial test" : "" })];
    }
    case "kappa":
      return [finish(ctx, { comparison: "Agreement beyond chance", statistic: "z", value: f(r.z), pValue: r.p,
        adjustment: SINGLE, estimate: "Cohen's kappa", estimateValue: f(r.kappa), ci: ci2(r.ci) })];
    case "proportion_test": {
      const names: string[] = Array.isArray(r.names) ? r.names.map(String) : ["Group 1", "Group 2"];
      const d = r.difference_ci;
      return [finish(ctx, { test: "Fisher's exact test (two proportions)", comparison: `${names[0]} − ${names[1]}`,
        pValue: r.fisher_exact?.p ?? r.z_test?.p, adjustment: SINGLE, estimate: "Difference in proportions",
        estimateValue: f(d?.value ?? r.difference), ci: ci2(d?.ci) })];
    }
    case "deming":
      return (Array.isArray(r.datasets) ? r.datasets : []).filter((d: R) => d?.fit?.slope).flatMap((d: R) => [
        finish(ctx, { comparison: `${d.name}: slope`, estimate: "Slope", estimateValue: f(d.fit.slope.value),
          ci: ci2(d.fit.slope.ci), level: 0.95 }),
        finish(ctx, { comparison: `${d.name}: intercept`, estimate: "Intercept", estimateValue: f(d.fit.y_intercept?.value),
          ci: ci2(d.fit.y_intercept?.ci), level: 0.95 }),
      ]);
    case "icc": {
      const want = r.options?.form ?? "ICC2";
      const c = (Array.isArray(r.forms) ? r.forms : []).find((x: R) => x.form === want);
      return c ? [finish(ctx, { comparison: `${c.form}`, statistic: num(c.F) ? "F" : "", value: f(c.F),
        df: dfPair(c.df1, c.df2), pValue: c.p, adjustment: SINGLE, estimate: "ICC", estimateValue: f(c.value),
        ci: ci2(c.ci), level: r.ci_level })] : [];
    }
    case "roc": {
      const [a, b] = Array.isArray(r.names) ? r.names.map(String) : ["patients", "controls"];
      return [finish(ctx, { test: "ROC curve", comparison: `${a} vs. ${b}`,
        n: `${a} ${r.n_patients ?? ""}; ${b} ${r.n_controls ?? ""}`, pValue: r.auc?.p_vs_05, adjustment: SINGLE,
        estimate: "Area under the curve", estimateValue: f(r.auc?.value), ci: ci2(r.auc?.ci),
        note: "P tests area = 0.5" })];
    }
    case "bland_altman": {
      const [a, b] = Array.isArray(r.names) ? r.names.map(String) : ["A", "B"];
      const n = num(r.n) ? `${r.n} pairs` : "";
      return [
        finish(ctx, { test: "Bland-Altman", comparison: `${a} − ${b}`, n, estimate: "Bias (mean difference)",
          estimateValue: f(r.bias?.value), ci: ci2(r.bias?.ci) }),
        finish(ctx, { test: "Bland-Altman", comparison: `${a} − ${b}`, n, estimate: "Lower limit of agreement",
          estimateValue: f(r.loa_lower?.value), ci: ci2(r.loa_lower?.ci) }),
        finish(ctx, { test: "Bland-Altman", comparison: `${a} − ${b}`, n, estimate: "Upper limit of agreement",
          estimateValue: f(r.loa_upper?.value), ci: ci2(r.loa_upper?.ci) }),
      ];
    }
    case "rate_compare":
      return [finish(ctx, { comparison: (r.names ?? []).join(" / "), pValue: r.p_two_tailed, adjustment: SINGLE,
        estimate: "Rate ratio", estimateValue: f(r.rate_ratio), ci: ci2(r.ratio_ci) })];
    default:
      return [];
  }
}

// ------------------------------------------------- kinds merged after P-66

/** Relative potency (parallel-line global fit): the parallelism F test,
 *  then the potency ratio with its Fieller CI. */
function relPotencyRows(ctx: Ctx, r: R): StatsRow[] {
  const ref = String(r.reference ?? r.potency?.reference?.name ?? "reference");
  const tst = String(r.test ?? r.potency?.test?.name ?? "test");
  const out: StatsRow[] = [];
  const F = r.f_test;
  if (F && num(F.F)) {
    out.push(finish(ctx, { test: "extra sum-of-squares F test (parallel vs. separate curves)",
      comparison: `${tst} vs. ${ref}: parallel curves`, statistic: "F", value: f(F.F), df: dfPair(F.dfn, F.dfd),
      pValue: F.p, adjustment: SINGLE, note: "a small P says the curves are not parallel" }));
  }
  const pot = r.potency;
  if (pot && num(pot.ratio)) {
    const lin = String(pot.linear ?? "EC50");
    out.push(finish(ctx, { comparison: `${tst} vs. ${ref}`, estimate: `Relative potency (${lin} of ${ref} / ${lin} of ${tst})`,
      estimateValue: f(pot.ratio), ci: ci2(pot.ci), level: pot.ci_level, note: String(pot.method ?? "") }));
  }
  return out;
}

/** Two global models compared by the extra sum-of-squares F test and AICc. */
function globalCompareRows(ctx: Ctx, r: R): StatsRow[] {
  const a = String(r.model_1?.label ?? "Model 1"), b = String(r.model_2?.label ?? "Model 2");
  const F = r.f_test, aicc = r.aicc;
  const prefer = aicc?.prefer === 1 ? a : aicc?.prefer === 2 ? b : "";
  const aiccNote = num(aicc?.delta) ? `AICc difference ${f(aicc.delta)}${prefer ? `; AICc prefers ${prefer}` : ""}` : "";
  if (F && num(F.F)) {
    return [finish(ctx, { test: "extra sum-of-squares F test (global models)", comparison: `${a} vs. ${b}`,
      n: num(r.n_points) ? `${r.n_points} points` : "", statistic: "F", value: f(F.F), df: dfPair(F.dfn, F.dfd),
      pValue: F.p, adjustment: SINGLE, note: aiccNote })];
  }
  return aiccNote ? [finish(ctx, { test: "AICc (global models, not nested)", comparison: `${a} vs. ${b}`,
    n: num(r.n_points) ? `${r.n_points} points` : "", note: aiccNote })] : [];
}

/** Precision study: repeatability and total CV with their CIs, and the
 *  recovery against the nominal value. No test, so no P. */
function precisionRows(ctx: Ctx, r: R): StatsRow[] {
  const out: StatsRow[] = [];
  for (const s of (Array.isArray(r.samples) ? r.samples : []) as R[]) {
    const name = String(s?.name ?? "Sample");
    const n = num(s.n) ? `${s.n} values${num(s.n_runs) ? ` in ${s.n_runs} runs` : ""}` : "";
    const c: R = s.components ?? {};
    const comp = (key: string, label: string) => {
      if (c[key] && num(c[key].cv_percent)) {
        out.push(finish(ctx, { test: "precision study (variance components)", comparison: name, n,
          estimate: `${label} CV (%)`, estimateValue: f(c[key].cv_percent), ci: ci2(c[key].cv_ci), level: s.ci_level ?? r.ci_level,
          note: String(c[key].ci_method ?? "") }));
      }
    };
    comp("repeatability", "Repeatability");
    comp("between_run", "Between-run");
    comp("between_day", "Between-day");
    comp("total", "Total (within-laboratory)");
    const rec = s.recovery;
    if (rec && num(rec.recovery_percent)) {
      out.push(finish(ctx, { test: "precision study (recovery)", comparison: `${name} vs. nominal ${f(rec.nominal)}`, n,
        estimate: "Recovery (%)", estimateValue: f(rec.recovery_percent), ci: ci2(rec.recovery_ci), level: s.ci_level ?? r.ci_level,
        note: typeof rec.accepted === "boolean" ? `${rec.accepted ? "accepted" : "not accepted"} (limits ±${f(rec.limit_percent)}% recovery, ${f(rec.cv_limit_percent)}% CV)` : "" }));
    }
  }
  return out;
}

/** Competing risks: Gray's test of each cause's cumulative incidence. */
function competingRows(ctx: Ctx, r: R): StatsRow[] {
  const names: string[] = Array.isArray(r.group_names) ? r.group_names.map(String) : [];
  return (Array.isArray(r.causes) ? r.causes : []).filter((c: R) => c?.gray && num(c.gray.chi2)).map((c: R) =>
    finish(ctx, { test: "Gray's test (cumulative incidence)", comparison: `Cause ${c.code}: ${names.join(" vs. ")}`,
      statistic: "χ²", value: f(c.gray.chi2), df: dfText(c.gray.df), pValue: c.gray.p,
      adjustment: "not adjusted (one test per cause)" }));
}

/** Parametric (AFT) survival: the likelihood-ratio test of the groups and
 *  each group's time ratio against the reference. */
function parametricRows(ctx: Ctx, r: R): StatsRow[] {
  const test = `parametric survival regression (${String(r.label ?? r.dist ?? "AFT")} AFT)`;
  const n = num(r.n) ? `${r.n} subjects, ${r.n_events ?? "?"} events` : "";
  const out: StatsRow[] = [];
  const lr = r.lr_test;
  if (lr && num(lr.chi2)) {
    out.push(finish(ctx, { test, comparison: "Among all groups (likelihood ratio)", n, statistic: "χ²", value: f(lr.chi2),
      df: dfText(lr.df), pValue: lr.p, adjustment: "none (omnibus test)" }));
  }
  const coefs: R[] = Array.isArray(r.coefficients) ? r.coefficients : [];
  for (const t of (Array.isArray(r.time_ratios) ? r.time_ratios : []) as R[]) {
    const c = coefs.find((x) => x.name === `Group: ${t.group}`);
    out.push(finish(ctx, { test, comparison: `${t.group} vs. ${t.reference}`, n, statistic: c && num(c.z) ? "z" : "",
      value: f(c?.z), pValue: t.p, adjustment: PER_TERM, estimate: "Time ratio (acceleration factor)",
      estimateValue: f(t.value), ci: ci2(t.ci), level: r.ci_level }));
  }
  return out;
}

/** Meta-analysis: the pooled estimate (random and common effect) and the
 *  heterogeneity test; ratios on their own scale. */
function metaRows(ctx: Ctx, r: R): StatsRow[] {
  const ratio = r.scale === "ratio" || r.scale === "log_ratio";
  const n = num(r.k) ? `${r.k} studies` : "";
  const out: StatsRow[] = [];
  const pooled = (m: R | undefined, label: string, test: string, note = "") => {
    if (!m || !num(m.estimate)) return;
    out.push(finish(ctx, { test, comparison: label, n, statistic: String(m.stat_name ?? (num(m.z) ? "z" : "")),
      value: f(m.stat ?? m.z), df: dfText(m.df), pValue: m.p, adjustment: SINGLE,
      estimate: ratio ? "Pooled ratio" : "Pooled estimate", estimateValue: f(ratio ? m.ratio : m.estimate),
      ci: ci2(ratio ? m.ratio_ci : m.ci), level: r.ci_level, note }));
  };
  const h = r.heterogeneity;
  const rnd = r.random;
  pooled(rnd, `Pooled (random effects, ${String(rnd?.method ?? r.method ?? "")})`.replace(", )", ")"),
    "meta-analysis (random effects)",
    num(rnd?.tau2) ? `τ² = ${f(rnd.tau2)}${num(h?.I2) ? `, I² = ${f(h.I2)}%` : ""}` : "");
  pooled(r.fixed, "Pooled (common effect, inverse variance)", "meta-analysis (common effect)");
  if (h && num(h.Q)) {
    out.push(finish(ctx, { test: "Cochran's Q (heterogeneity)", comparison: "Between studies", n, statistic: "Q",
      value: f(h.Q), df: dfText(h.df), pValue: h.p, adjustment: SINGLE }));
  }
  return out;
}

/** Custom contrasts (one-way, two-way) and the interaction contrasts of a
 *  repeated-measures two-way design, after the kind's own rows. */
function contrastRows(ctx: Ctx, r: R): StatsRow[] {
  const out: StatsRow[] = [];
  const cc = r.custom_contrasts;
  for (const c of (Array.isArray(cc?.contrasts) ? cc.contrasts : []) as R[]) {
    if (!num(c?.estimate)) continue;
    out.push(finish(ctx, { test: `${ctx.test}: custom contrast (${String(c.kind ?? "")})`.replace(" ()", ""),
      comparison: `${String(c.name ?? "")}${c.label ? `: ${String(c.label)}` : ""}`, statistic: "t", value: f(c.t),
      df: dfText(c.df ?? cc.df_residual), pValue: c.p, adjustment: String(c.adjustment ?? ""),
      estimate: "Contrast", estimateValue: f(c.estimate), ci: ci2(c.ci), level: cc.ci_level }));
  }
  const ic = r.interaction_contrasts;
  for (const c of (Array.isArray(ic?.contrasts) ? ic.contrasts : []) as R[]) {
    if (!num(c?.difference)) continue;
    out.push(finish(ctx, { test: `${ctx.test}: interaction contrast`, comparison: String(c.label ?? ""),
      statistic: "t", value: f(c.t), df: dfText(c.df ?? ic.df_residual), pValue: c.p,
      adjustment: String(ic.p_adjustment ?? ""), estimate: "Difference of the two effects", estimateValue: f(c.difference),
      ci: ci2(c.ci), level: ic.ci_level }));
  }
  return out;
}

/** Analyses that report no test and no estimate with a CI. */
const DESCRIPTIVE = new Set([
  "descriptive", "normalize", "transform", "frequency_distribution", "row_means", "fraction_of_total",
  "fraction_of_total_table", "formula_transform", "transform_concentrations", "remove_baseline",
  "transpose", "prune_rows", "simulate_xy", "simulate_column", "simulate_contingency",
  "multivar_descriptive", "pca", "mv_rearrange", "growth_transform", "summary_convert", "randomize",
  "power", "residuals_column", "superplot", "smooth_xy", "curve_ops",
]);

const MAPPERS: Record<string, (ctx: Ctx, r: R) => StatsRow[]> = {
  ttest: ttestRows,
  ks_test: (ctx, r) => ttestRows(ctx, { ...r, test: "kolmogorov_smirnov" }),
  anova: anovaRows,
  anova_unequal_var: welchAnovaRows,
  rm_one_way_anova: rmOneWayRows,
  mixed_rm_one_way: mixedRmOneWayRows,
  friedman: friedmanRows,
  two_way_anova: sourcesRows,
  two_way_art: artRowsOf,
  three_way_anova: sourcesRows,
  rm_two_way_mixed: sourcesRows,
  rm_two_way_both: sourcesRows,
  mixed_rm_two_way: sourcesRows,
  mixed_rm_twoway: sourcesRows,
  multiple_row_tests: multiRowRows,
  correlation: correlationRows,
  contingency: contingencyRows,
  survival: survivalRows,
  cox: coefficientRows,
  multiple_regression: coefficientRows,
  logistic_regression: coefficientRows,
  poisson_regression: coefficientRows,
  negative_binomial_regression: coefficientRows,
  binomial_regression: coefficientRows,
  ordinal_regression: coefficientRows,
  nested_t_test: nestedRows,
  nested_one_way_anova: nestedRows,
  mixed_nested_two_way: (ctx, r) => termListRows(ctx, r, r.comparisons),
  mixed_grouping: (ctx, r) => termListRows(ctx, r, r.comparisons),
  mixed_timecourse: (ctx, r) => termListRows(ctx, r, r.group_difference_at_time),
  lmm: (ctx, r) => termListRows(ctx, r, r.comparisons),
  dose_response: doseRows,
  linear_regression: linregRows,
  column_statistics: columnStatsRows,
  estimation: estimationRows,
  quantal: quantalRows,
  subject_auc: subjectAucRows,
  mcnemar: simpleRows,
  kappa: simpleRows,
  proportion_test: simpleRows,
  deming: simpleRows,
  icc: simpleRows,
  rate_compare: simpleRows,
  roc: simpleRows,
  bland_altman: simpleRows,
  relative_potency: relPotencyRows,
  compare_global_fits: globalCompareRows,
  precision_study: precisionRows,
  competing_risks: competingRows,
  parametric_survival: parametricRows,
  meta_analysis: metaRows,
};

/** Names of the tests describe.ts does not name (regression models and
 *  agreement measures). */
function modelName(r: R): string | null {
  switch (r.analysis) {
    case "cox": return "Cox proportional-hazards regression";
    case "multiple_regression": return "multiple linear regression";
    case "logistic_regression": return r.firth ? "logistic regression (Firth's penalized likelihood)" : "logistic regression";
    case "poisson_regression": return r.family === "quasipoisson" || r.f_test ? "quasi-Poisson regression" : "Poisson regression";
    case "negative_binomial_regression": return "negative binomial regression";
    case "ordinal_regression": return "ordinal logistic regression (proportional odds)";
    case "binomial_regression": return r.family === "quasibinomial" || r.f_test ? "quasi-binomial regression" : "binomial regression";
    case "kappa": return r.weights && r.weights !== "unweighted" ? `weighted Cohen's kappa (${r.weights})` : "Cohen's kappa";
    case "deming": return "Deming regression";
    case "icc": return "intraclass correlation";
    case "rate_compare": return "comparison of two event rates (Poisson)";
    case "relative_potency": return "relative potency (parallel-line global fit)";
    case "compare_global_fits": return "comparison of two global models";
    case "precision_study": return "precision study";
    case "competing_risks": return "competing risks (cumulative incidence)";
    case "parametric_survival": return "parametric survival regression";
    case "meta_analysis": return "meta-analysis";
    default: return null;
  }
}

/** The kind of a result: the engine's analysis id, else the sheet's. */
export function statsKind(analysisId: string, result: unknown): string {
  const r = result as R | null;
  if (analysisId === "quantal") return "quantal";
  if (analysisId === "cox" || analysisId === "mv_cox") return "cox";
  return r && typeof r.analysis === "string" ? r.analysis : analysisId;
}

/** Kinds with a row mapper (the unit test checks each one). */
export const STATS_KINDS = Object.keys(MAPPERS);

/** Rows of one results sheet: one per comparison, or one saying why none. */
export function statsRows(entry: StatsEntry, opts: { style?: PStyle; prefs?: Pick<ReportPrefs, "smd" | "variance"> } = {}): StatsRow[] {
  const style = opts.style ?? DEFAULT_REPORT.pStyle;
  const prefs = opts.prefs ?? DEFAULT_REPORT;
  const r = entry.result as R | null;
  const info = describeResult(r);
  const groups = info.groups.length || !num(r?.n) ? info.groups : [{ name: "total", n: r!.n }];
  const ctx: Ctx = { style, prefs, entry, groups,
    test: info.test ?? (r && typeof r === "object" ? modelName(r) : null) ?? entry.analysisLabel };
  const only = (note: string) => [finish(ctx, { note })];
  if (r === null || r === undefined) return only("Not computed yet: open the results sheet, then export again.");
  if (typeof r !== "object") return only("No result.");
  if (r.error) return only(`The analysis failed: ${String(r.error).replace(/\.$/, "")}.`);
  const w = withheldInfo(r);
  if (w) return only(`No P value: ${withheldPhrase(w)}.`);
  const kind = statsKind(entry.analysisId, r);
  const map = MAPPERS[kind];
  if (!map) {
    return only(DESCRIPTIVE.has(kind) ? "Descriptive analysis or data manipulation: no test or estimate to tabulate."
      : `Not tabulated: no statistics-table mapper for this analysis (${kind}) yet; see its results sheet.`);
  }
  let rows: StatsRow[];
  try { rows = map(ctx, r); } catch (e) {
    return only(`Not tabulated: the result could not be read (${e instanceof Error ? e.message : String(e)}); see its results sheet.`);
  }
  // custom and interaction contrasts follow the kind's own rows
  rows = [...rows, ...contrastRows(ctx, r)];
  if (!rows.length) return only("No comparison or estimate in this result; see its results sheet.");
  // P-84: the log scale from means and SDs is approximate; say so on every row
  if (r.log_scale && typeof r.log_scale === "object" && r.log_scale.approximate === true) {
    const approx = "approximate: log scale estimated from means and SDs (lognormal moment conversion)";
    rows = rows.map((row) => ({ ...row, note: row.note ? `${row.note}; ${approx}` : approx }));
  }
  return rows;
}

export interface StatsTable {
  rows: StatsRow[];
  /** Results sheets whose rows only carry a note (not tabulated, failed, not computed). */
  untabulated: string[];
}

export function statsTable(entries: StatsEntry[], opts: { style?: PStyle; prefs?: Pick<ReportPrefs, "smd" | "variance"> } = {}): StatsTable {
  const rows: StatsRow[] = [];
  const untabulated: string[] = [];
  for (const e of entries) {
    const rs = statsRows(e, opts);
    if (rs.every((x) => !x.p && !x.value && !x.estimateValue)) untabulated.push(e.sheet);
    rows.push(...rs);
  }
  return { rows, untabulated };
}

/** The table as text cells: a header row, then one row per comparison (CSV, Excel). */
export function statsMatrix(rows: StatsRow[]): string[][] {
  return [STATS_COLUMNS.map((c) => c.header), ...rows.map((r) => STATS_COLUMNS.map((c) => r[c.key]))];
}

const join = (a: string, b: string, sep: string) => (a && b ? `${a}${sep}${b}` : a || b);

/** The compact Word table: statistic with df, the estimate and the effect
 *  size with their CIs in one cell each. */
export function statsWordSections(rows: StatsRow[], title = "Statistics"): WordSection[] {
  const head = ["Results sheet", "Figure panel", "Test", "Comparison", "n", "Statistic (df)", "P",
    "Adjustment (family)", "Estimate (CI)", "Effect size (CI)", "Note"];
  const cell = (text: string, header = false): WordCell => ({ text, header, colSpan: 1 });
  const ci = (lo: string, hi: string, level: string) => (lo && hi ? ` (${level ? `${level} CI ` : ""}${lo} to ${hi})` : "");
  const body = rows.map((r) => [
    r.sheet, r.panel, r.test, r.comparison, r.n,
    r.statistic ? `${r.statistic} = ${r.value}${r.df ? ` (${r.df})` : ""}` : "",
    r.p, join(r.adjustment, r.family ? `(${r.family})` : "", " "),
    r.estimateValue ? `${r.estimate} ${r.estimateValue}${ci(r.ciLower, r.ciUpper, r.ciLevel)}` : "",
    r.effectValue ? `${r.effect} ${r.effectValue}${ci(r.effectLower, r.effectUpper, r.ciLevel)}` : "",
    r.note,
  ].map((t) => cell(t)));
  return [{ heading: title, rows: [head.map((h) => cell(h, true)), ...body], headRows: 1 }];
}

/** How the table is written (the bundle README and the workbook README sheet). */
export const STATS_README = [
  "One row per comparison each results sheet reports (an omnibus test, each post hoc",
  "comparison, each model term, each fitted midpoint). Numbers are written as the",
  "results sheet writes them; \"P (exact)\" is the engine's P to four significant",
  "digits. A sheet with nothing to tabulate gets one row whose Note says why.",
];

