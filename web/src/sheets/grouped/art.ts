// Nonparametric two-way ANOVA by the aligned rank transform (P-85; engine
// opendose/art.py): the rows of its table, the ART-C contrasts' labels,
// the methods sentence and the note on when the log scale is the better
// route. Pure, unit-tested (__tests__/art.test.ts).
//
// Sources: Wobbrock, Findlater, Gergle & Higgins 2011 (the ART procedure);
// Elkin, Kay, Higgins & Wobbrock 2021 (ART-C contrasts); Bland & Altman
// 1996 (logarithms for data whose SD grows with the mean).
import { SRC, type Source } from "../../guide/sources.ts";
import { formatSig } from "../../types.ts";
import { pLabel } from "../../report/pformat.ts";
import type { DataTableModel } from "../../project/types.ts";
import type { ArtAdjust, ArtContrasts, TwoWayOptions } from "./options.ts";
import { groupedPayload } from "./stats.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

export const ART_SOURCES: Source[] = [SRC.wobbrock2011, SRC.elkin2021];

export const LOG_ROUTE_SOURCE: Source = {
  label: "Bland & Altman 1996, Transforming data, BMJ 312:770",
  url: "https://doi.org/10.1136/bmj.312.7033.770",
};

export const ART_CONTRAST_LABELS: Record<ArtContrasts, string> = {
  none: "None",
  row: "Levels of the row factor",
  col: "Levels of the column factor",
  cells: "Every cell with every other",
};

export const ART_ADJUST_LABELS: Record<ArtAdjust, string> = {
  tukey: "Tukey",
  holm: "Holm (step-down)",
};

/** The engine payload: the grouped payload, the factor and row names, and
 *  the ART-C contrasts asked for. */
export function artPayload(table: DataTableModel, o: TwoWayOptions, factors: [string, string]): R {
  const data = groupedPayload(table);
  const contrasts = o.artContrasts && o.artContrasts !== "none" ? o.artContrasts : null;
  return {
    analysis: "two_way_art", data,
    options: { row_factor: factors[0], col_factor: factors[1], row_names: data.row_titles,
      ...(contrasts ? { contrasts, contrasts_method: o.artAdjust ?? "tukey" } : {}) },
  };
}

/** Why the aligned rank transform cannot run on this table, with what to
 *  do, or null: it needs replicate values (ranks need every value), an
 *  ordinary design and two or more data sets. Empty cells are refused by
 *  the engine, which names the cell. */
export function artRefusal(table: DataTableModel, o: TwoWayOptions): string | null {
  if (table.subcolumnFormat !== "replicates") {
    return "The aligned rank transform needs replicate values; this table holds mean / error / N "
      + "summaries. Choose replicates when creating the table to run it.";
  }
  if (o.design !== "none") {
    return "The aligned rank transform here is for independent values: set Repeated measures to "
      + "None, or use the two-way repeated-measures ANOVA";
  }
  if (table.datasets.length < 2) return "The aligned rank transform needs at least two datasets (columns)";
  return null;
}

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export interface ArtRow {
  key: string;
  label: string;
  F: number | null;
  df: number | null;
  dfRes: number | null;
  p: number | null;
}

/** The ANOVA rows, interaction first: each effect read from the factorial
 *  ANOVA of the ranks aligned for it. */
export function artRows(result: unknown, factors: [string, string]): ArtRow[] {
  const src = ((result as R | null)?.sources ?? {}) as R;
  const row = (key: string, label: string): ArtRow => {
    const s = src[key] ?? {};
    return { key, label, F: num(s.F) ? s.F : null, df: num(s.df) ? s.df : null,
      dfRes: num(s.df_residual) ? s.df_residual : null, p: num(s.p) ? s.p : null };
  };
  return [row("interaction", `Interaction (${factors[0]} × ${factors[1]})`),
    row(factors[0], factors[0]), row(factors[1], factors[1])];
}

/** "F(9, 32) = 2.939, P = 0.0117". */
export function artStat(r: ArtRow): string {
  if (r.F === null || r.df === null || r.dfRes === null) return "";
  return `F(${r.df}, ${r.dfRes}) = ${formatSig(r.F)}, ${pLabel(r.p)}`;
}

/** The ART-C block's title: "ART-C contrasts of Moisture (Tukey)". */
export function artContrastsTitle(block: unknown, factors: [string, string]): string {
  const b = block as R | null;
  if (!b) return "";
  const what = b.factor === "row" ? factors[0] : b.factor === "col" ? factors[1] : "every cell";
  const adj = b.family?.method === "holm" ? "Holm" : b.family?.method === "tukey" ? "Tukey"
    : String(b.family?.method ?? "");
  return `ART-C contrasts of ${what} (${adj})`;
}

/** The methods paragraph. */
export function artMethodsSentence(result: unknown, factors: [string, string]): string {
  const r = result as R | null;
  if (!r || r.error) return "";
  const rows = artRows(r, factors);
  const stats = rows.map((x) => (artStat(x) ? `${x.label}: ${artStat(x)}` : "")).filter(Boolean);
  const cc = r.art_contrasts as R | undefined;
  const cTxt = cc && Array.isArray(cc.comparisons)
    ? ` Pairwise contrasts of ${cc.factor === "row" ? factors[0] : cc.factor === "col" ? factors[1]
      : "every cell with every other"} used the ART-C procedure (Elkin et al. 2021), with `
      + `${cc.family?.method === "holm" ? "Holm's step-down" : "Tukey's"} adjustment for `
      + `${cc.comparisons.length} comparison${cc.comparisons.length === 1 ? "" : "s"}; `
      + "differences are of mean aligned ranks."
    : "";
  return `Data were analyzed by a nonparametric two-way ANOVA using the aligned rank transform `
    + `(Wobbrock et al. 2011) with ${factors[0]} and ${factors[1]} as factors (${r.n} values): `
    + "for each effect the values were aligned by removing the other effects, ranked (average ranks "
    + "for ties) and analyzed by a factorial ANOVA on the ranks (type III), from which only that "
    + `effect was read. ${stats.join("; ")}.${cTxt}`
    + (r.balanced === false ? " The cells held unequal numbers of values." : "");
}

/** When a log transform is the better route (shown with the results and
 *  next to the method choice). */
export const ART_LOG_NOTE = "The aligned rank transform tests ranks, so it gives no estimate in the "
  + "data's units. For positive values whose SD grows with the mean (concentrations, titres, "
  + "expression levels), a two-way ANOVA on the logarithms is often the better route: it keeps the "
  + "interaction on a ratio scale, with geometric means and ratios with CIs. Keep the aligned rank "
  + "transform for scores and outcomes no transform makes Gaussian.";
