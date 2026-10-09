// Nested two-way ANOVA on a grouped table: a mixed model with the two
// factors fixed and the experimental unit (mouse, litter, culture) as a
// random intercept, so the df of the factors come from the units, not the
// values (engine handler mixed_nested_two_way, engine/opendose/
// mixed_nested.py). Rows = factor A levels, data sets = factor B levels,
// subcolumns = units. Two layouts say where a unit's several values are:
// - "block": rows sharing a title form one level of A (an untitled row
//   continues the block above it); each subcolumn is one unit and its
//   values run down the rows of the block;
// - "titles": one row per level of A; each subcolumn holds one value and
//   subcolumns with the same title are the same unit.
// Pure (no React, no engine import): unit-tested in
// __tests__/nestedTwoWay.test.ts. "From long table…" (value, A, B, unit
// records) fills the block layout (nestedFromLong).
import { normalizeTable, parseCell, withExclusionsBlanked } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";
import {
  DEFAULT_MIXED_UNIT, engineUnitOptions, normalizeMixedUnit, unitWords,
  type MixedUnitOptions,
} from "../common/mixedModel.ts";

export const A_NESTED_TWO_WAY = "grouped_nested_two_way";

export type NestedLayout = "block" | "titles";

export interface NestedTwoWayOptions extends MixedUnitOptions {
  layout: NestedLayout;
  /** Factor names as typed ("" = the table's, else "Row factor" ...). */
  factorA: string;
  factorB: string;
  /** The same unit title in two cells is the same unit (a unit measured
   *  under several conditions) rather than two units. */
  sameUnit: boolean;
}

export const DEFAULT_NESTED_TWO_WAY: NestedTwoWayOptions = {
  ...DEFAULT_MIXED_UNIT, layout: "block", factorA: "", factorB: "", sameUnit: false,
};

export function normalizeNestedTwoWay(raw: unknown): NestedTwoWayOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    ...normalizeMixedUnit(o),
    layout: o.layout === "titles" ? "titles" : "block",
    factorA: typeof o.factorA === "string" ? o.factorA : "",
    factorB: typeof o.factorB === "string" ? o.factorB : "",
    sameUnit: o.sameUnit === true,
  };
}

/** Factor names: typed, else the table's (from its file), else defaults. */
export function nestedFactorNames(o: Pick<NestedTwoWayOptions, "factorA" | "factorB">,
  table: Pick<DataTableModel, "factorNames">): [string, string] {
  return [o.factorA.trim() || table.factorNames?.rows?.trim() || "Row factor",
    o.factorB.trim() || table.factorNames?.datasets?.trim() || "Column factor"];
}

const letter = (d: number) => String.fromCharCode(65 + (d % 26));

export interface NestedRecord { value: number; factor_a: string; factor_b: string; unit: string }

/** Level of factor A of each row: block layout carries a title down the
 *  untitled rows below it; titles layout uses each row's own title. */
export function rowLevels(t: DataTableModel, layout: NestedLayout): string[] {
  let last = "";
  return t.x.map((_, r) => {
    const title = (t.rowTitles[r] ?? "").trim();
    if (layout === "titles") return title || `Row ${r + 1}`;
    if (title) last = title;
    return last || "Row 1";
  });
}

/** Long records (value, A, B, unit) from the grouped table. Unit labels
 *  are made unique per cell unless `sameUnit`. */
export function nestedRecords(table: DataTableModel, o: NestedTwoWayOptions): NestedRecord[] {
  const t = withExclusionsBlanked(table);
  const levels = rowLevels(t, o.layout);
  const raw: NestedRecord[] = [];
  t.datasets.forEach((ds, d) => {
    const b = ds.name.trim() || `Data set ${letter(d)}`;
    const width = Math.max(1, ...ds.rows.map((row) => row.length));
    for (let s = 0; s < width; s++) {
      const title = ds.subTitles?.[s]?.trim() ?? "";
      const label = title || `${letter(d)}${s + 1}`;
      ds.rows.forEach((row, r) => {
        const v = parseCell(row[s] ?? "");
        if (v === null) return;
        raw.push({ value: v, factor_a: levels[r], factor_b: b, unit: label });
      });
    }
  });
  if (o.sameUnit) return raw;
  // a label in several cells is several units: qualify it with its cell
  const cells = new Map<string, Set<string>>();
  for (const x of raw) {
    const k = `${x.factor_a}␟${x.factor_b}`;
    if (!cells.has(x.unit)) cells.set(x.unit, new Set());
    cells.get(x.unit)!.add(k);
  }
  return raw.map((x) => (cells.get(x.unit)!.size > 1
    ? { ...x, unit: `${x.unit} (${x.factor_a} / ${x.factor_b})` } : x));
}

export interface UnitCount { units: number; values: number; maxPerUnit: number; levelsA: string[] }

export function countUnits(recs: NestedRecord[]): UnitCount {
  const per = new Map<string, number>();
  for (const x of recs) {
    const k = `${x.factor_a}␟${x.factor_b}␟${x.unit}`;
    per.set(k, (per.get(k) ?? 0) + 1);
  }
  return {
    units: per.size, values: recs.length, maxPerUnit: Math.max(0, ...per.values()),
    levelsA: [...new Set(recs.map((x) => x.factor_a))],
  };
}

export type Built = { payload: Record<string, unknown>; error?: undefined }
  | { payload?: undefined; error: string };

export function nestedTwoWayPayload(table: DataTableModel, o: NestedTwoWayOptions): Built {
  const recs = nestedRecords(table, o);
  if (!recs.length) {
    return { error: o.layout === "block"
      ? "Enter values: rows titled with a level of the row factor (one block of rows per level), one subcolumn per unit (animal), that unit's values down the block"
      : "Enter values: one row per level of the row factor, one subcolumn per value, subcolumns titled with their unit (animal)" };
  }
  const c = countUnits(recs);
  if (c.maxPerUnit < 2) {
    return { error: o.layout === "block"
      ? "Every unit has one value here, so there is nothing nested: give the rows of one level of the row factor the same title (or leave the rows below a title untitled) so each subcolumn holds several values of one unit, or choose “Subcolumns with the same title are one unit”"
      : "Every unit has one value here: title the subcolumns with their unit (the same title for the values of one animal), or choose the block layout" };
  }
  const [a, b] = nestedFactorNames(o, table);
  const levelsB = table.datasets.map((ds, d) => ds.name.trim() || `Data set ${letter(d)}`)
    .filter((n) => recs.some((x) => x.factor_b === n));
  return {
    payload: {
      analysis: "mixed_nested_two_way",
      data: { records: recs },
      options: {
        factor_a_name: a, factor_b_name: b === a ? `${b} (data sets)` : b,
        levels_a: c.levelsA, levels_b: levelsB,
        unit_labels: o.sameUnit ? "as_given" : "within_cell",
        ...engineUnitOptions(o),
      },
    },
  };
}

/** The slice of EngineBridge the analysis needs. */
export interface Engine { analyze: (payload: unknown) => unknown }

export function runNestedTwoWay(engine: Engine, table: DataTableModel, o: NestedTwoWayOptions):
  Record<string, unknown> {
  const b = nestedTwoWayPayload(table, o);
  if (b.error !== undefined) return { error: b.error };
  const r = engine.analyze(b.payload) as Record<string, unknown>;
  if (!r || r.error) return r;
  return { ...r, unit_words: unitWords(o.unit, o.unitCustom), outcome: table.yTitle.trim() || "Value" };
}

// ------------------------------------------------------------ long table

export interface LongRoles { value: number; a: number; b?: number; unit: number }

/** Long records (value, factor A, factor B, unit) as the block layout:
 *  one block of rows per level of A (every row titled), one data set per
 *  level of B, one subcolumn per unit within its cell (numbered: unit
 *  labels are not kept), the unit's values down the block. */
export function nestedFromLong(headers: string[], rows: string[][], roles: LongRoles,
  base: DataTableModel): { table: DataTableModel; units: number; values: number; skipped: number;
    options: Record<string, unknown> } | { error: string } {
  const { value, a, unit } = roles;
  const b = roles.b ?? -1;
  if (![value, a, unit].every((c) => c >= 0)) return { error: "Choose the value, factor A and unit columns." };
  const used = [value, a, unit, ...(b >= 0 ? [b] : [])];
  if (new Set(used).size !== used.length) return { error: "Choose a different column for each role." };
  const cell = new Map<string, Map<string, string[]>>();
  const la: string[] = [];
  const lb: string[] = [];
  let skipped = 0;
  for (const r of rows) {
    const v = (r[value] ?? "").trim();
    const av = (r[a] ?? "").trim();
    const bv = b >= 0 ? (r[b] ?? "").trim() : "All";
    const u = (r[unit] ?? "").trim();
    if (parseCell(v) === null || !av || !bv || !u) { skipped++; continue; }
    if (!la.includes(av)) la.push(av);
    if (!lb.includes(bv)) lb.push(bv);
    const k = `${av}␟${bv}`;
    if (!cell.has(k)) cell.set(k, new Map());
    const units = cell.get(k)!;
    if (!units.has(u)) units.set(u, []);
    units.get(u)!.push(v);
  }
  if (!la.length) return { error: "No record has a numeric value, a factor level and a unit." };
  const depth = la.map((x) => Math.max(1, ...lb.flatMap((y) => [...(cell.get(`${x}␟${y}`)?.values() ?? [])]
    .map((vals) => vals.length))));
  const width = lb.map((y) => Math.max(1, ...la.map((x) => cell.get(`${x}␟${y}`)?.size ?? 0)));
  const rowTitles = la.flatMap((x, i) => Array(depth[i]).fill(x) as string[]);
  const table = normalizeTable({
    ...base,
    type: "grouped",
    replicates: undefined,
    subcolumnFormat: "replicates",
    yTitle: base.yTitle?.trim() || headers[value] || "",
    x: rowTitles.map(() => ""),
    rowTitles,
    datasets: lb.map((y, j) => ({
      name: y,
      rows: la.flatMap((x, i) => {
        const units = [...(cell.get(`${x}␟${y}`)?.values() ?? [])];
        return Array.from({ length: depth[i] }, (_, k) =>
          Array.from({ length: width[j] }, (_, s) => units[s]?.[k] ?? ""));
      }),
    })),
  }, "grouped");
  let units = 0;
  for (const m of cell.values()) units += m.size;
  return {
    table, units, values: rows.length - skipped, skipped,
    options: {
      layout: "block", sameUnit: false,
      factorA: headers[a] ?? "", factorB: b >= 0 ? headers[b] ?? "" : "",
    },
  };
}
