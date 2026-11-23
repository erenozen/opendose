// Rows of the sphericity table of a two-way repeated-measures ANOVA from
// the engine's per-term sphericity blocks (repeated.sphericity). Pure;
// unit-tested (sheets/common/__tests__/sphericity.test.ts).

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface SphericityRow {
  name: string;
  gg: number;
  hf: number | null;
  pHf: number | null;
  mauchlyW: number | null;
  mauchlyP: number | null;
  /** Why W is missing: "2 levels" or "too few subjects". */
  mauchlyNote: string;
}

const DEFAULT_LABELS: Record<string, string> = {
  row_factor: "Row factor", column_factor: "Column factor", interaction: "Interaction",
};

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** One row per repeated term, in the order row factor, column factor,
 *  interaction; [] when the result has no per-term sphericity. */
export function sphericityRowsOf(result: any, labels?: Record<string, string>): SphericityRow[] {
  const sp = result?.sphericity;
  if (!sp || typeof sp !== "object" || num(sp.gg_epsilon)) return [];
  const names = { ...DEFAULT_LABELS, ...(labels ?? {}) };
  const out: SphericityRow[] = [];
  for (const k of ["row_factor", "column_factor", "interaction"]) {
    const s = sp[k];
    if (!s || !num(s.gg_epsilon)) continue;
    const src = result?.sources?.[k] ?? result?.fixed_effects?.[k];
    const m = s.mauchly;
    out.push({
      name: names[k] ?? k,
      gg: s.gg_epsilon,
      hf: num(s.hf_epsilon) ? s.hf_epsilon : null,
      pHf: num(src?.p_huynh_feldt) ? src.p_huynh_feldt : null,
      mauchlyW: m && num(m.W) ? m.W : null,
      mauchlyP: m && num(m.p) ? m.p : null,
      mauchlyNote: (s.contrasts ?? 2) <= 1 ? "not needed (2 levels)" : "undefined (too few subjects)",
    });
  }
  return out;
}
