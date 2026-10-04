// Effect sizes of a result, as rows a results sheet can show: every
// comparison the engine runs carries an `effect_size` block
// (engine/opendose/effectsize.py), whose fields differ by test. This
// module reads any of them into one shape (measure, value, CI,
// interpretation with its scale and source) and marks the measure the
// project prefers (Preferences -> Reporting). Pure, unit-tested.
import type { ReportPrefs } from "./prefs.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

export interface Interpretation {
  label: string;
  scale: string;
  thresholds?: number[];
  source: string;
}

export type EffectFamily = "smd" | "variance" | "association" | "rank" | "correlation";

export interface EffectRow {
  /** Stable id of the measure ("d", "g", "eta2", "partial_eta2", ...). */
  id: string;
  /** Name as a results table shows it. */
  measure: string;
  /** Symbol for sentences ("d", "g", "η²", "ηp²", "V", "δ", ...). */
  symbol: string;
  family: EffectFamily;
  value: number;
  ci: [number, number] | null;
  ciLevel: number;
  ciMethod: string | null;
  interpretation: Interpretation | null;
  /** |value| cannot exceed 1 (APA writes it without a leading zero). */
  bounded: boolean;
  /** The measure this project reports by default (one per group). */
  preferred: boolean;
}

export interface EffectGroup {
  /** Term, data set or row the effect sizes belong to (null = the test). */
  title: string | null;
  rows: EffectRow[];
}

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const ci2 = (v: unknown): [number, number] | null =>
  (Array.isArray(v) && v.length === 2 && num(v[0]) && num(v[1]) ? [v[0], v[1]] : null);

/** The engine's interpretation rule (effectsize.interpret) for a value on
 *  another measure of the same scale (g on the d scale, ω² on η²). */
export function relabel(value: number, base: Interpretation | null): Interpretation | null {
  if (!base || !Array.isArray(base.thresholds) || base.thresholds.length < 3) return base;
  const mag = base.scale === "cles" ? Math.abs(value - 0.5)
    : base.scale === "odds_ratio" ? (value > 0 ? Math.max(value, 1 / value) : NaN)
      : Math.abs(value);
  if (!Number.isFinite(mag)) return null;
  let label = "negligible";
  ["small", "medium", "large"].forEach((name, i) => {
    if (mag >= base.thresholds![i]) label = name;
  });
  return { ...base, label };
}

function interp(v: unknown): Interpretation | null {
  const o = v as R | null | undefined;
  return o && typeof o.label === "string" ? {
    label: o.label, scale: String(o.scale ?? ""),
    thresholds: Array.isArray(o.thresholds) ? o.thresholds : undefined,
    source: String(o.source ?? ""),
  } : null;
}

interface Spec {
  id: string;
  measure: string;
  symbol: string;
  family: EffectFamily;
  value: unknown;
  ci?: unknown;
  ciMethod?: unknown;
  interpretation?: Interpretation | null;
  bounded?: boolean;
}

function rows(block: R, specs: Spec[]): EffectRow[] {
  const level = num(block.ci_level) ? block.ci_level : 0.95;
  const out: EffectRow[] = [];
  for (const s of specs) {
    if (!num(s.value)) continue;
    const base = s.interpretation ?? null;
    out.push({
      id: s.id, measure: s.measure, symbol: s.symbol, family: s.family, value: s.value,
      ci: ci2(s.ci), ciLevel: level,
      ciMethod: typeof s.ciMethod === "string" ? s.ciMethod
        : typeof block.ci_method === "string" ? block.ci_method : null,
      interpretation: relabel(s.value, base),
      bounded: !!s.bounded, preferred: false,
    });
  }
  return out;
}

const SMD_NAMES: Record<string, string> = {
  pooled: "Cohen's d (pooled SD)",
  average: "Cohen's d (average SD)",
  control: "Glass's Δ (control SD)",
};

/** Rows of one effect-size block (any test). */
export function blockRows(block: unknown): EffectRow[] {
  const b = block as R | null;
  if (!b || typeof b !== "object") return [];
  const it = interp(b.interpretation);
  // standardized mean differences
  if (b.measure === "paired_d") {
    const iz = interp(b.interpretation_z), iav = interp(b.interpretation_av);
    return rows(b, [
      { id: "d", measure: "Cohen's d_z (paired)", symbol: "d_z", family: "smd", value: b.d_z,
        ci: b.ci_d_z, ciMethod: b.ci_method_z, interpretation: iz },
      { id: "g", measure: "Hedges' g_z (paired)", symbol: "g_z", family: "smd", value: b.hedges_g_z,
        ci: b.ci_g_z, ciMethod: b.ci_method_z, interpretation: iz },
      { id: "d_av", measure: "Cohen's d_av (paired)", symbol: "d_av", family: "smd", value: b.d_av,
        ci: b.ci_d_av, ciMethod: b.ci_method_av, interpretation: iav },
      { id: "g_av", measure: "Hedges' g_av (paired)", symbol: "g_av", family: "smd",
        value: b.hedges_g_av, ci: b.ci_g_av, ciMethod: b.ci_method_av, interpretation: iav },
    ]);
  }
  if (num(b.d) && (b.measure === "cohens_d" || b.measure === "cohens_d_av"
    || b.measure === "glass_delta" || b.measure === "one_sample_d" || b.measure === undefined)) {
    const name = b.measure === "one_sample_d" ? "Cohen's d (one sample)"
      : b.measure === "glass_delta" ? SMD_NAMES.control
        : SMD_NAMES[String(b.standardizer)] ?? "Cohen's d";
    const sym = b.measure === "glass_delta" ? "Δ" : "d";
    return rows(b, [
      { id: "d", measure: name, symbol: sym, family: "smd", value: b.d, ci: b.ci_d, interpretation: it },
      { id: "g", measure: b.measure === "one_sample_d" ? "Hedges' g (one sample)" : "Hedges' g",
        symbol: "g", family: "smd", value: b.hedges_g, ci: b.ci_g, interpretation: it },
    ]);
  }
  // per-row tests (multiple t tests): {measure, value, hedges_g}
  if (num(b.value) && typeof b.measure === "string") {
    const name = b.measure === "cohens_d_av" ? SMD_NAMES.average
      : b.measure === "cohens_d" ? SMD_NAMES.pooled
        : b.measure === "paired_d" ? "Cohen's d_z (paired)"
          : b.measure === "cliffs_delta" ? "Cliff's δ"
            : b.measure === "rank_biserial" ? "Rank-biserial r" : b.measure;
    const rank = b.measure === "cliffs_delta" || b.measure === "rank_biserial";
    const dScale: Interpretation = rank
      ? { label: "", scale: "cliffs_delta", thresholds: [0.147, 0.33, 0.474],
        source: "Romano, Kromrey, Coraggio & Skowronek (2006): |delta| = 0.147 small, 0.33 medium, 0.474 large" }
      : { label: "", scale: "d", thresholds: [0.2, 0.5, 0.8],
        source: "Cohen (1988) sec. 2.2.3: d = 0.2 small, 0.5 medium, 0.8 large" };
    return rows(b, [
      { id: rank ? "delta" : "d", measure: name, symbol: rank ? "Cliff's δ" : "d",
        family: rank ? "rank" : "smd", value: b.value, interpretation: dScale, bounded: rank },
      { id: "g", measure: "Hedges' g", symbol: "g", family: "smd", value: b.hedges_g,
        interpretation: dScale },
    ]);
  }
  // nonparametric two-group
  if (num(b.cliffs_delta)) {
    return rows(b, [
      { id: "delta", measure: "Cliff's δ", symbol: "Cliff's δ", family: "rank", value: b.cliffs_delta,
        ci: b.ci_cliffs_delta, interpretation: it, bounded: true },
      { id: "cles", measure: "Common-language effect size (A)", symbol: "A", family: "rank",
        value: b.cles, ci: b.ci_cles, interpretation: interp(b.interpretation_cles), bounded: true },
      { id: "rank_biserial", measure: "Rank-biserial r", symbol: "r_rb", family: "rank",
        value: b.rank_biserial, interpretation: it, bounded: true },
    ]);
  }
  if (num(b.rank_biserial)) {
    return rows(b, [{ id: "rank_biserial", measure: "Matched-pairs rank-biserial r",
      symbol: "r_rb", family: "rank", value: b.rank_biserial, ci: b.ci_rank_biserial,
      interpretation: it, bounded: true }]);
  }
  // ANOVA terms
  if (num(b.partial_eta_squared) || num(b.eta_squared) || num(b.epsilon_squared)
    || num(b.eta_squared_h)) {
    const kruskal = num(b.eta_squared_h);
    if (kruskal) {
      return rows(b, [
        { id: "epsilon2", measure: "ε² (rank)", symbol: "ε²R", family: "variance",
          value: b.epsilon_squared, interpretation: it, bounded: true },
        { id: "eta2", measure: "η² (H)", symbol: "η²H", family: "variance",
          value: b.eta_squared_h, interpretation: it, bounded: true },
      ]);
    }
    const partial = num(b.partial_eta_squared);
    const ciP = partial ? b.ci_partial_eta_squared : b.ci_eta_squared;
    return rows(b, partial ? [
      { id: "partial_eta2", measure: "Partial η²", symbol: "ηp²", family: "variance",
        value: b.partial_eta_squared, ci: ciP, interpretation: it, bounded: true },
      { id: "partial_omega2", measure: "Partial ω²", symbol: "ωp²", family: "variance",
        value: b.partial_omega_squared, ci: ciP, interpretation: it, bounded: true },
      { id: "generalized_eta2", measure: "Generalized η²", symbol: "ηG²", family: "variance",
        value: b.generalized_eta_squared,
        interpretation: interp(b.interpretation_generalized) ?? it, bounded: true },
      { id: "eta2", measure: "η²", symbol: "η²", family: "variance", value: b.eta_squared,
        interpretation: it, bounded: true },
      { id: "omega2", measure: "ω²", symbol: "ω²", family: "variance", value: b.omega_squared,
        interpretation: it, bounded: true },
      { id: "partial_epsilon2", measure: "Partial ε²", symbol: "εp²", family: "variance",
        value: b.partial_epsilon_squared, interpretation: it, bounded: true },
      { id: "f", measure: "Cohen's f", symbol: "f", family: "variance", value: b.cohens_f,
        ci: b.ci_cohens_f },
    ] : [
      { id: "eta2", measure: "η²", symbol: "η²", family: "variance", value: b.eta_squared,
        ci: ciP, interpretation: it, bounded: true },
      { id: "omega2", measure: "ω²", symbol: "ω²", family: "variance", value: b.omega_squared,
        ci: ciP, interpretation: it, bounded: true },
      { id: "epsilon2", measure: "ε²", symbol: "ε²", family: "variance",
        value: b.epsilon_squared, interpretation: it, bounded: true },
      { id: "f", measure: "Cohen's f", symbol: "f", family: "variance", value: b.cohens_f,
        ci: b.ci_cohens_f },
    ]);
  }
  if (num(b.kendalls_w)) {
    return rows(b, [{ id: "kendalls_w", measure: "Kendall's W", symbol: "W",
      family: "variance", value: b.kendalls_w, interpretation: it, bounded: true }]);
  }
  // association (contingency)
  if (num(b.cramers_v)) {
    const twoByTwo = num(b.phi) && b.min_dim_minus_1 === 1 && b.df === 1;
    return rows(b, [
      { id: "cramers_v", measure: "Cramér's V", symbol: "V", family: "association",
        value: b.cramers_v, ci: b.ci_cramers_v, interpretation: it, bounded: true },
      ...(twoByTwo ? [{ id: "phi", measure: "φ (signed)", symbol: "φ", family: "association" as const,
        value: b.phi, interpretation: it, bounded: true }] : []),
      { id: "cramers_v_corrected", measure: "Cramér's V, bias-corrected (Bergsma)",
        symbol: "Ṽ", family: "association", value: b.cramers_v_corrected, interpretation: it,
        bounded: true },
      { id: "w", measure: "Cohen's w", symbol: "w", family: "association", value: b.cohens_w,
        interpretation: it },
    ]);
  }
  // correlation
  if (num(b.r_squared)) {
    return rows(b, [{ id: "r2", measure: "r²", symbol: "r²", family: "correlation",
      value: b.r_squared, ci: b.ci_r_squared, interpretation: null, bounded: true }]);
  }
  return [];
}

/** Choose the project's default measure among one group's rows. */
export function markPreferred(list: EffectRow[], prefs: Pick<ReportPrefs, "smd" | "variance">): EffectRow[] {
  const order: string[] = [];
  if (prefs.smd === "g") order.push("g", "g_av", "d", "d_av");
  else order.push("d", "d_av", "g", "g_av");
  if (prefs.variance === "omega2") order.push("partial_omega2", "omega2", "partial_eta2", "eta2");
  else order.push("partial_eta2", "eta2", "partial_omega2", "omega2");
  order.push("cramers_v", "delta", "rank_biserial", "kendalls_w", "epsilon2", "r", "r2");
  let pick = -1;
  for (const id of order) {
    pick = list.findIndex((r) => r.id === id);
    if (pick >= 0) break;
  }
  if (pick < 0 && list.length) pick = 0;
  return list.map((r, i) => ({ ...r, preferred: i === pick }));
}

const TERM_LABELS: Record<string, string> = {
  interaction: "Interaction", row_factor: "Row factor", column_factor: "Column factor",
};

/** Is this object a map of ANOVA terms to effect-size blocks? */
function isTermMap(b: R): boolean {
  const vals = Object.values(b);
  return vals.length > 0 && vals.every((v) => v && typeof v === "object" && !Array.isArray(v)
    && (num((v as R).partial_eta_squared) || num((v as R).eta_squared)));
}

/**
 * Every effect size of a result, grouped by what it belongs to: one group
 * for a single test, one per term for factorial ANOVA, one per data set
 * (one-sample tests) or per row (multiple t tests).
 */
export function effectGroups(result: unknown,
  prefs: Pick<ReportPrefs, "smd" | "variance">): EffectGroup[] {
  const r = result as R | null;
  if (!r || typeof r !== "object" || r.error) return [];
  const out: EffectGroup[] = [];
  const push = (title: string | null, list: EffectRow[]) => {
    if (list.length) out.push({ title, rows: markPreferred(list, prefs) });
  };
  if (r.analysis === "column_statistics" && Array.isArray(r.datasets)) {
    for (const ds of r.datasets) {
      const t = ds?.one_sample_t?.effect_size;
      const w = ds?.wilcoxon?.effect_size;
      if (t) push(`${ds.name}: one-sample t test`, blockRows(t));
      if (w) push(`${ds.name}: Wilcoxon signed rank test`, blockRows(w));
    }
    return out;
  }
  if (r.analysis === "multiple_row_tests" && Array.isArray(r.rows)) {
    for (const row of r.rows) {
      if (row?.effect_size) push(String(row.row ?? ""), blockRows(row.effect_size));
    }
    return out;
  }
  const es = r.effect_size as R | null | undefined;
  if (!es || typeof es !== "object") return out;
  if (isTermMap(es)) {
    for (const [term, block] of Object.entries(es)) {
      push(TERM_LABELS[term] ?? term, blockRows(block));
    }
    return out;
  }
  const list = blockRows(es);
  if (r.analysis === "correlation" && num(r.r)) {
    const it = interp(es.interpretation);
    list.unshift(...rows({ ci_level: es.ci_level ?? 0.95 }, [{
      id: "r", measure: r.method === "spearman" ? "Spearman r" : "Pearson r", symbol: "r",
      family: "correlation", value: r.r, ci: r.ci_r, ciMethod: "Fisher z",
      interpretation: it, bounded: true,
    }]));
  }
  if (r.analysis === "contingency" && r.odds_ratio && num(r.odds_ratio.value)) {
    list.push(...rows({ ci_level: es.ci_level ?? 0.95 }, [{
      id: "odds_ratio", measure: "Odds ratio", symbol: "OR", family: "association",
      value: r.odds_ratio.value, ci: r.odds_ratio.ci, ciMethod: "as in the results",
      interpretation: interp(es.odds_ratio_interpretation),
    }]));
  }
  push(null, list);
  return out;
}

/** The preferred row of the first group (what a results sentence cites). */
export function primaryEffect(groups: EffectGroup[]): EffectRow | null {
  for (const g of groups) {
    const p = g.rows.find((r) => r.preferred);
    if (p) return p;
  }
  return null;
}
