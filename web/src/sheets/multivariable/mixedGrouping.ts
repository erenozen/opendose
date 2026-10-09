// Mixed model with a grouping column on a multiple-variables table: one
// row per value, an outcome, one or two factors and a grouping column
// (animal, litter, cage; or the row titles) fitted as a random intercept
// (engine handler mixed_grouping, engine/opendose/mixed_nested.py). Same
// results panel and graph as the grouped table's nested two-way ANOVA
// (common/mixedPanels). Pure (no React, no engine import): unit-tested in
// __tests__/mixedGrouping.test.ts.
import { parseCell, withExclusionsBlanked } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";
import {
  DEFAULT_MIXED_UNIT, engineUnitOptions, normalizeMixedUnit, UNIT_PRESETS, unitWords,
  type MixedUnitOptions,
} from "../common/mixedModel.ts";
import { variableName } from "./model.ts";

export const ANALYSIS_MV_MIXED_GROUPING = "mv_mixed_grouping";

/** The grouping "column" that is the table's row titles (observation
 *  labels such as mouse IDs). */
export const ROW_TITLES = "(row titles)";

export interface MixedGroupingOptions extends MixedUnitOptions {
  outcome: string;
  factor1: string;
  /** "" = one factor. */
  factor2: string;
  grouping: string;
}

const GROUPING_RE = /^(mouse|mice|animal|animal[ _]?id|rat|litter|cage|subject|subject[ _]?id|id|donor|culture|dish|patient|experiment|batch|plate)$/i;
const OUTCOME_RE = /value|response|weight|volume|level|signal|intensity|measure|outcome|area|y$/i;

/** A column holding text (categorical, or any value that is no number). */
function isText(t: DataTableModel, i: number): boolean {
  const d = t.datasets[i];
  return d.varType === "categorical"
    || d.rows.some((r) => (r[0] ?? "").trim() !== "" && parseCell(r[0] ?? "") === null);
}

/** First guess: the grouping column by name (or repeated row titles), the
 *  outcome a numeric variable, the factors the text ones. */
export function defaultMixedGrouping(table: DataTableModel): MixedGroupingOptions {
  const names = table.datasets.map((_, i) => variableName(table, i));
  const cat = names.filter((_, i) => isText(table, i));
  const cont = names.filter((_, i) => !isText(table, i));
  const titles = table.rowTitles.map((x) => x.trim()).filter(Boolean);
  const repeated = titles.length > 0 && new Set(titles).size < titles.length;
  const grouping = names.find((n) => GROUPING_RE.test(n.trim()))
    ?? (repeated ? ROW_TITLES : undefined) ?? cat[cat.length - 1] ?? "";
  const outcome = cont.find((n) => n !== grouping && OUTCOME_RE.test(n))
    ?? cont.find((n) => n !== grouping) ?? "";
  const factors = cat.filter((n) => n !== grouping);
  const g = grouping === ROW_TITLES ? "" : grouping.trim().toLowerCase();
  const preset = grouping === ROW_TITLES ? undefined
    : UNIT_PRESETS.find((u) => u.id === g || u.plural === g);
  return {
    ...DEFAULT_MIXED_UNIT,
    unit: preset ? preset.id : g && !/^(id|subject|subject[ _]?id|animal[ _]?id)$/.test(g) ? "other" : DEFAULT_MIXED_UNIT.unit,
    unitCustom: !preset && g && !/^(id|subject|subject[ _]?id|animal[ _]?id)$/.test(g) ? `${g}s` : "",
    outcome, factor1: factors[0] ?? "", factor2: factors[1] ?? "", grouping,
  };
}

export function normalizeMixedGrouping(raw: unknown, table: DataTableModel): MixedGroupingOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = defaultMixedGrouping(table);
  const str = (k: string, def: string) => (typeof o[k] === "string" ? o[k] as string : def);
  const base = normalizeMixedUnit({ ...d, ...o });
  return {
    ...base,
    outcome: str("outcome", d.outcome), factor1: str("factor1", d.factor1),
    factor2: str("factor2", d.factor2), grouping: str("grouping", d.grouping),
  };
}

export type Built = { payload: Record<string, unknown>; error?: undefined }
  | { payload?: undefined; error: string };

export function mixedGroupingPayload(table: DataTableModel, o: MixedGroupingOptions): Built {
  const names = table.datasets.map((_, i) => variableName(table, i));
  const has = (n: string) => !!n && (names.includes(n) || n === ROW_TITLES);
  if (!has(o.outcome)) return { error: "Choose the outcome (the measured value)" };
  if (!has(o.factor1)) return { error: "Choose the factor (the groups you compare)" };
  if (!has(o.grouping)) return { error: "Choose the grouping column (the animal, litter or cage each value comes from)" };
  const factors = [o.factor1, ...(o.factor2 && o.factor2 !== o.factor1 ? [o.factor2] : [])];
  if (factors.includes(o.grouping) || factors.includes(o.outcome) || o.outcome === o.grouping) {
    return { error: "The outcome, the factors and the grouping column must be different variables" };
  }
  if (o.outcome === ROW_TITLES || factors.includes(ROW_TITLES)) {
    return { error: "Row titles can only be the grouping column" };
  }
  // the outcome as numbers; factors and grouping as text labels (a factor
  // or an ID column typed in as numbers is still a set of labels)
  const t = withExclusionsBlanked(table);
  const column = (n: string, numeric: boolean): (number | string | null)[] => {
    if (n === ROW_TITLES) return t.x.map((_, r) => (t.rowTitles[r] ?? "").trim() || null);
    const d = t.datasets[names.indexOf(n)];
    return d.rows.map((row) => {
      const v = (row[0] ?? "").trim();
      if (!v) return null;
      return numeric ? parseCell(v) : v;
    });
  };
  // row titles go to the engine under the unit's name ("mouse")
  const word = unitWords(o.unit, o.unitCustom).singular;
  const gname = o.grouping !== ROW_TITLES ? o.grouping
    : names.includes(word) ? "Row title" : word;
  const variables = [
    { name: o.outcome, values: column(o.outcome, true) },
    ...factors.map((n) => ({ name: n, values: column(n, false) })),
    { name: gname, values: column(o.grouping, false) },
  ];
  return {
    payload: {
      analysis: "mixed_grouping",
      data: { variables },
      options: {
        outcome: o.outcome, factors, grouping: gname,
        ...engineUnitOptions(o),
        ...(factors.length === 1 && (o.scope === "b_within_a" || o.scope === "a_within_b"
          || o.scope === "b_means") ? { comparison_scope: "a_means" } : {}),
      },
    },
  };
}

export interface Engine { analyze: (payload: unknown) => unknown }

export function runMixedGrouping(engine: Engine, table: DataTableModel, o: MixedGroupingOptions):
  Record<string, unknown> {
  const b = mixedGroupingPayload(table, o);
  if (b.error !== undefined) return { error: b.error };
  const r = engine.analyze(b.payload) as Record<string, unknown>;
  if (!r || r.error) return r;
  return { ...r, unit_words: unitWords(o.unit, o.unitCustom), outcome: o.outcome };
}
