// Sex as a biological variable (P-62): find a table's rows, data sets or
// column that look like sex, and ask, never assume. The rule is tight so
// unrelated labels ("M" for molar, "M1", a group called "M") never fire:
//  - a header named sex or gender (a multiple-variables column), or
//  - labels that are all exactly F, M, female or male (any case, plurals
//    allowed), with at least one of each sex.
// The guidance then suggests sex as a factor with its interaction (two-way
// ANOVA, or Sex as a predictor), and results reported by sex.
//
// Sources: SAGER guidelines (Heidari et al. 2016, Res Integr Peer Rev
// 1:2): report the sex of subjects and analyse results by sex, or say why
// not; NIH SABV (Clayton & Collins 2014, Nature 509:282): consider sex as
// a biological variable in cell and animal studies.
//
// Pure; unit-tested in __tests__/sex.test.ts.
import type { PastedBlock } from "./paste.ts";
import type { Chip } from "./checks.ts";
import { INTERACTION_FOCUS } from "./interaction.ts";
import { SRC } from "./sources.ts";
import type { DataTableModel, Project, ResultsSheet } from "../project/types.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

const WORDS: Record<string, "female" | "male"> = {
  f: "female", female: "female", females: "female",
  m: "male", male: "male", males: "male",
};

/** "female", "male", or null for anything else. */
export function sexOf(label: string): "female" | "male" | null {
  return WORDS[label.trim().toLowerCase()] ?? null;
}

/** Every non-blank label is a sex word, and both sexes are there. */
export function allSexLabels(labels: string[]): boolean {
  const xs = labels.map((l) => l.trim()).filter(Boolean);
  if (xs.length < 2) return false;
  const seen = new Set<string>();
  for (const x of xs) {
    const s = sexOf(x);
    if (!s) return false;
    seen.add(s);
  }
  return seen.size === 2;
}

/** A header that names the variable sex or gender ("Sex", "sex (F/M)"). */
export function isSexHeader(h: string): boolean {
  return /^(sex|gender)(\s*\(.*\))?$/i.test(h.trim());
}

export interface SexFactor {
  /** Rows (row titles), data sets (their names), or one column of a
   *  multiple-variables table. */
  where: "rows" | "datasets" | "column";
  /** The column's index (where = "column"). */
  index?: number;
  /** The distinct labels as typed ("F", "M"), or the column's header. */
  labels: string[];
  /** "rows F and M", "data sets Female and Male", "the column “Sex”". */
  phrase: string;
}

const distinct = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
const names = (xs: string[]) => (xs.length <= 2 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** The rows, data sets or column of a table that look like sex, or null. */
export function findSexFactor(t: DataTableModel): SexFactor | null {
  if (t.type === "multivariable") {
    const cols = t.datasets.map((d) => d.rows.map((r) => r[0] ?? ""));
    let i = t.datasets.findIndex((d) => isSexHeader(d.name));
    if (i < 0) i = cols.findIndex((c) => allSexLabels(c));
    if (i < 0) return null;
    const name = t.datasets[i].name.trim() || `column ${i + 1}`;
    return { where: "column", index: i, labels: [name], phrase: `the column “${name}”` };
  }
  if (t.type !== "column" && t.type !== "grouped") return null;
  const rows = (t.rowTitles ?? []).filter((_, r) => t.datasets.some((d) => d.rows[r]?.some((v) => v.trim())));
  if (allSexLabels(rows)) {
    const l = distinct(rows);
    return { where: "rows", labels: l, phrase: `rows ${names(l)}` };
  }
  const sets = t.datasets.map((d) => d.name);
  if (allSexLabels(sets)) {
    const l = distinct(sets);
    return { where: "datasets", labels: l, phrase: `data sets ${names(l)}` };
  }
  return null;
}

/** A pasted block's column (or header row) that looks like sex: the
 *  paste guide's question, or null. */
export function sexInPaste(b: PastedBlock): { phrase: string; plural: boolean } | null {
  const titles = b.titles ?? [];
  const h = titles.findIndex((x) => isSexHeader(x));
  if (h >= 0) return { phrase: `the column “${titles[h].trim()}”`, plural: false };
  for (let c = 0; c < b.width; c++) {
    if (allSexLabels(b.rows.map((r) => r[c] ?? ""))) {
      return { phrase: titles[c]?.trim() ? `the column “${titles[c].trim()}”` : `column ${c + 1}`, plural: false };
    }
  }
  const sets = titles.filter((x) => x.trim());
  if (sets.length >= 2 && allSexLabels(sets)) return { phrase: `the columns ${names(distinct(sets))}`, plural: true };
  return null;
}

/** The paste guide's sentence for a block with a sex column. */
export function sexPasteNote(b: PastedBlock | null): string | null {
  const w = b ? sexInPaste(b) : null;
  return w ? `${w.plural ? "Are" : "Is"} ${w.phrase} the sex of the animals or subjects? If so, keep `
    + "sex as a factor: analyse with sex and its interaction, and report the results for each sex "
    + "(SAGER, NIH SABV)." : null;
}

// ------------------------------------------------------------ the chip

/** Two-way analyses on a grouped table: sex is one of their factors. */
const TWO_WAY = new Set(["grouped_two_way", "grouped_replicate_means", "grouped_nested_two_way",
  "grouped_three_way"]);

/** Options of the two-way ANOVA the chip opens: sex and the interaction,
 *  the treatment compared within each sex. */
export function sexTwoWayOptions(f: SexFactor): Record<string, unknown> {
  const rows = f.where === "rows";
  return { design: "none", model: "full", comparisons: "sidak",
    direction: rows ? "columns_within_rows" : "rows_within_columns",
    [rows ? "rowFactor" : "colFactor"]: "Sex", [INTERACTION_FOCUS]: true };
}

const SOURCES = [SRC.heidari2016, SRC.claytonCollins2014];

/** The Checks row chip for a result on a table with a sex factor. */
export function sexChip(f: SexFactor, t: DataTableModel, analysisId: string, options: unknown): Chip {
  const o = (options && typeof options === "object" ? options : {}) as Record<string, any>;
  const ask = `Are ${f.phrase} the sex of the animals or subjects?`;
  const report = "Report the results for each sex, and say whether the effect differs between "
    + "females and males (SAGER; NIH SABV). If they are not sex, ignore this note.";
  if (t.type === "grouped" && TWO_WAY.has(analysisId)) {
    if (analysisId === "grouped_two_way" && o.model === "additive") {
      return { id: "sex-factor", state: "warn", label: "Sex is a factor, but the interaction is left out",
        detail: `${ask} If so, this model tests sex without its interaction, so it cannot say whether `
          + "the treatment effect differs between females and males. Fit the full model (with the "
          + `interaction). ${report}`, sources: SOURCES };
    }
    return { id: "sex-factor", state: "ok", label: "Sex is a factor of this analysis",
      detail: `${ask} If so, sex and its interaction are in this model: the interaction row tests `
        + `whether the treatment effect differs between females and males. ${report}`, sources: SOURCES };
  }
  if (t.type === "multivariable") {
    const name = t.datasets[f.index ?? 0]?.name.trim() ?? "";
    const preds: string[] = Array.isArray(o.predictors) ? o.predictors : [];
    if (preds.includes(name)) {
      const inter = Array.isArray(o.interactions) && o.interactions.some((p: unknown) =>
        Array.isArray(p) && p.includes(name));
      return { id: "sex-factor", state: inter ? "ok" : "info",
        label: inter ? "Sex and its interaction are in the model" : "Sex is in the model, without an interaction",
        detail: `${ask} If so, ${inter ? "the interaction term tests whether an effect differs by sex."
          : "add an interaction with it to test whether an effect differs between females and males."} ${report}`,
        sources: SOURCES };
    }
    return { id: "sex-factor", state: "info", label: `If “${name}” is sex, include it as a factor`,
      detail: `${ask} If so, add “${name}” as a predictor, with its interaction with the treatment, `
        + `so the model says whether the effect differs between females and males. ${report}`,
      sources: SOURCES };
  }
  const grouped = t.type === "grouped";
  return { id: "sex-factor", state: "info", label: `Are ${f.phrase} sex? Include sex as a factor`,
    detail: `${ask} If so, analyse sex as a factor: two-way ANOVA with sex and the interaction `
      + "tells whether the treatment effect differs between females and males. "
      + (grouped ? "" : "Enter the values in a Grouped table (rows = sex, data sets = the treatment) "
        + "to run it. ")
      + report,
    action: grouped ? "sex-two-way" : undefined, sources: SOURCES };
}

// ------------------------------------------------------------ checklist

export interface SexFacts {
  /** The sex factor found in the table, if any. */
  factor: SexFactor | null;
  /** The analysis in the family that has sex as a factor, if any. */
  analysedIn: { sheetId: string; name: string } | null;
}

/** The analysis of a family with sex as a factor: a two-way analysis of
 *  a grouped table whose rows or data sets are sex, or a model of a
 *  multiple-variables table with the sex column as a predictor. */
export function sexFacts(p: Project, dataId: string): SexFacts {
  const data = p.sheets.find((s) => s.id === dataId);
  if (data?.kind !== "data") return { factor: null, analysedIn: null };
  const t = data.table;
  const factor = findSexFactor(t);
  if (!factor) return { factor, analysedIn: null };
  const name = factor.where === "column" ? t.datasets[factor.index ?? 0]?.name.trim() : "";
  const hit = p.sheets.find((s): s is ResultsSheet => s.kind === "results" && s.parentId === dataId
    && (t.type === "grouped" ? TWO_WAY.has(s.analysis)
      : t.type === "multivariable" && Array.isArray((s.options as any)?.predictors)
        && (s.options as any).predictors.includes(name)));
  return { factor, analysedIn: hit ? { sheetId: hit.id, name: hit.name } : null };
}
