// Controls of the nested two-way ANOVA (mixed model, unit random) on a
// grouped table: factor names, where each unit's values sit, the unit, the
// comparisons; the results and the graph are shared with the grouping-
// column model (common/mixedPanels.tsx).
import LongTableButton from "../common/LongTableButton";
import { MIXED_SRC } from "../common/mixedModel";
import { Cite, UnitControls } from "../common/mixedPanels";
import type { ControlsProps } from "../types";
import {
  countUnits, nestedFactorNames, nestedRecords, rowLevels, type NestedLayout,
  type NestedTwoWayOptions,
} from "./nestedTwoWay";

export function NestedTwoWayControls({ sheet, table, options: o, onChange }:
  ControlsProps<NestedTwoWayOptions>) {
  const set = (patch: Partial<NestedTwoWayOptions>) => onChange({ ...o, ...patch });
  const [a, b] = nestedFactorNames(o, table);
  const levelsA = [...new Set(rowLevels(table, o.layout))];
  const c = countUnits(nestedRecords(table, o));
  return (
    <div className="controls">
      <section>
        <h3>Design</h3>
        <p className="hint-block">
          Cells (or wells, slices, repeated reads) nested in animals in a two-factor design:
          the factors are tested against the variation between animals, without writing a
          formula (<Cite src={MIXED_SRC.gpNested} />; <Cite src={MIXED_SRC.aarts2014} />).
        </p>
        <label className="check-row">
          <span>Row factor</span>
          <input aria-label="Row factor name" value={o.factorA} placeholder={a}
            onChange={(e) => set({ factorA: e.target.value })} />
        </label>
        <label className="check-row">
          <span>Data-set factor</span>
          <input aria-label="Data-set factor name" value={o.factorB} placeholder={b}
            onChange={(e) => set({ factorB: e.target.value })} />
        </label>
        <label className="check-row">
          <span>Each unit’s values</span>
          <select aria-label="Where each unit's values are" value={o.layout}
            onChange={(e) => set({ layout: e.target.value as NestedLayout })}>
            <option value="block">Run down a block of rows (one subcolumn per unit)</option>
            <option value="titles">Sit in subcolumns with the same title (one row per level)</option>
          </select>
        </label>
        <p className="hint-block">
          {o.layout === "block"
            ? "Rows with the same title form one level of the row factor (rows left untitled continue the block above); each subcolumn is one unit and its values run down the block."
            : "One row per level of the row factor; every subcolumn holds one value, and subcolumns with the same title belong to the same unit."}
          {" "}Read now: {levelsA.length} level{levelsA.length === 1 ? "" : "s"} of {a}, {c.units} units, {c.values} values.
        </p>
        <label className="check-row assay-check">
          <input type="checkbox" checked={o.sameUnit} onChange={(e) => set({ sameUnit: e.target.checked })} />
          <span>A unit title used in two cells is the same unit (measured under both)</span>
        </label>
        <LongTableButton target="nested2" sheet={sheet} />
      </section>
      <UnitControls o={o} set={set} a={a} b={b} la={levelsA}
        lb={table.datasets.map((d, i) => d.name.trim() || `Data set ${String.fromCharCode(65 + (i % 26))}`)} />
    </div>
  );
}
