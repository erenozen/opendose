// Mixed model with a grouping column on a multiple-variables table: one
// row per value, an outcome, one or two factors and a grouping column
// (animal, litter, cage; or the row titles) fitted as a random intercept
// (engine handler mixed_grouping, engine/opendose/mixed_nested.py). Same
// results panel and graph as the grouped table's nested two-way ANOVA
// (common/mixedPanels). With a nested second level or covariates (P-87)
// the sheet fits the general linear mixed model instead (engine handler
// lmm, engine/opendose/lmm.py; results in common/lmmPanels.tsx). Pure (no
// React, no engine import): unit-tested in __tests__/mixedGrouping.test.ts.
import { parseCell, withExclusionsBlanked } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";
import {
  DEFAULT_MIXED_UNIT, engineUnitOptions, normalizeMixedUnit, UNIT_PRESETS, unitWords,
  type MixedUnitOptions,
} from "../common/mixedModel.ts";
import { ddfOf } from "../common/ddf.ts";
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
  /** A second random level nested in the grouping column (slice within
   *  animal, pup within litter); absent or "" = none. */
  subgroup?: string;
  /** Continuous covariates (fixed slopes). */
  covariates?: string[];
  /** Covariates that also get a random slope by the grouping column. */
  slopes?: string[];
  /** Random intercept and slopes correlated ((x | g)) or not ((x || g)). */
  slopeStructure?: "correlated" | "independent";
}

/** The general model (engine lmm) is fitted once a nested level or a
 *  covariate is chosen; otherwise the grouping-column ANOVA, unchanged. */
export function isGeneralModel(o: MixedGroupingOptions): boolean {
  return !!o.subgroup || (o.covariates?.length ?? 0) > 0;
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
  const list = (k: string) => (Array.isArray(o[k])
    ? (o[k] as unknown[]).filter((x): x is string => typeof x === "string" && x !== "") : []);
  const covariates = list("covariates");
  const slopes = list("slopes").filter((x) => covariates.includes(x));
  return {
    ...base,
    outcome: str("outcome", d.outcome), factor1: str("factor1", d.factor1),
    factor2: str("factor2", d.factor2), grouping: str("grouping", d.grouping),
    // P-87 roles: stored only once chosen, so older sheets keep their options
    ...(typeof o.subgroup === "string" && o.subgroup ? { subgroup: o.subgroup } : {}),
    ...(covariates.length ? { covariates } : {}),
    ...(slopes.length ? { slopes } : {}),
    ...(o.slopeStructure === "independent" ? { slopeStructure: "independent" as const } : {}),
  };
}

export type Built = { payload: Record<string, unknown>; error?: undefined }
  | { payload?: undefined; error: string };

export function mixedGroupingPayload(table: DataTableModel, o: MixedGroupingOptions): Built {
  if (isGeneralModel(o)) return lmmPayload(table, o);
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
  const gname = groupingName(names, o);
  const column = columnReader(table, names);
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

/** The name the grouping column goes to the engine under: row titles go
 *  under the unit's word ("mouse"). */
function groupingName(names: string[], o: MixedGroupingOptions): string {
  const word = unitWords(o.unit, o.unitCustom).singular;
  return o.grouping !== ROW_TITLES ? o.grouping : names.includes(word) ? "Row title" : word;
}

/** A column as numbers (outcome, covariates) or as text labels (factors
 *  and grouping: an ID column typed in as numbers is still a set of
 *  labels). */
function columnReader(table: DataTableModel, names: string[]) {
  const t = withExclusionsBlanked(table);
  return (n: string, numeric: boolean): (number | string | null)[] => {
    if (n === ROW_TITLES) return t.x.map((_, r) => (t.rowTitles[r] ?? "").trim() || null);
    const d = t.datasets[names.indexOf(n)];
    return d.rows.map((row) => {
      const v = (row[0] ?? "").trim();
      if (!v) return null;
      return numeric ? parseCell(v) : v;
    });
  };
}

/** P-87: outcome ~ factors + covariates + (1 [+ slopes] | grouping)
 *  [+ (1 | grouping:nested level)], engine handler lmm. */
export function lmmPayload(table: DataTableModel, o: MixedGroupingOptions): Built {
  const names = table.datasets.map((_, i) => variableName(table, i));
  const has = (n: string) => !!n && (names.includes(n) || n === ROW_TITLES);
  const covariates = (o.covariates ?? []).filter((c) => names.includes(c));
  const slopes = (o.slopes ?? []).filter((c) => covariates.includes(c));
  const subgroup = o.subgroup ?? "";
  if (!has(o.outcome)) return { error: "Choose the outcome (the measured value)" };
  if (!has(o.grouping)) return { error: "Choose the grouping column (the animal, litter or cage each value comes from)" };
  const factors = [o.factor1, o.factor2].filter((n, i, a) => n && a.indexOf(n) === i);
  if (factors.some((n) => !has(n))) return { error: "Choose the factor again: that variable is no longer in the table" };
  // with a nested level and no fixed term the model is intercept only:
  // the variance components (lme4: y ~ 1 + (1 | g/sub))
  if (!factors.length && !covariates.length && !subgroup) {
    return { error: "Choose a factor (the groups you compare) or a covariate" };
  }
  if (subgroup && !names.includes(subgroup)) {
    return { error: "Choose the nested level again: that variable is no longer in the table" };
  }
  const used = [o.outcome, o.grouping, ...factors, ...covariates, ...(subgroup ? [subgroup] : [])];
  if (new Set(used).size !== used.length) {
    return { error: "The outcome, factors, covariates, grouping column and nested level must be different variables" };
  }
  if (o.outcome === ROW_TITLES || factors.includes(ROW_TITLES)) {
    return { error: "Row titles can only be the grouping column" };
  }
  const gname = groupingName(names, o);
  const column = columnReader(table, names);
  const variables = [
    { name: o.outcome, values: column(o.outcome, true) },
    ...factors.map((n) => ({ name: n, values: column(n, false) })),
    ...covariates.map((n) => ({ name: n, values: column(n, true) })),
    { name: gname, values: column(o.grouping, false) },
    ...(subgroup ? [{ name: subgroup, values: column(subgroup, false) }] : []),
  ];
  const ddf = ddfOf(o.mixedDdf);
  return {
    payload: {
      analysis: "lmm",
      data: { variables },
      options: {
        outcome: o.outcome, group: gname, factors, covariates, slopes,
        ...(subgroup ? { subgroup } : {}),
        ...(slopes.length ? { slope_structure: o.slopeStructure ?? "correlated" } : {}),
        // containment df are not defined with covariates or random slopes
        ddf: ddf === "containment" ? "kenward_roger" : ddf,
        ci_level: o.ciLevel,
        comparisons: o.comparisons === "none" || !factors.length ? null : o.comparisons,
        comparison_scope: factors.length === 1 && o.scope !== "a_means" ? "a_means" : o.scope,
        control_index: o.controlIndex,
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
