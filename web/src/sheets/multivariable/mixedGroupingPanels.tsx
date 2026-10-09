// Controls of the mixed model with a grouping column (multiple-variables
// tables); results, methods and graph are shared with the grouped table's
// nested two-way ANOVA (common/mixedPanels.tsx).
import { MIXED_SRC, unitWords } from "../common/mixedModel";
import { Cite, UnitControls } from "../common/mixedPanels";
import type { ControlsProps } from "../types";
import { ROW_TITLES, type MixedGroupingOptions } from "./mixedGrouping";
import { variableName } from "./model";

export function MixedGroupingControls({ table, options: o, onChange }: ControlsProps<MixedGroupingOptions>) {
  const set = (patch: Partial<MixedGroupingOptions>) => onChange({ ...o, ...patch });
  const names = table.datasets.map((_, i) => variableName(table, i));
  const levels = (n: string) => {
    const d = table.datasets[names.indexOf(n)];
    const out: string[] = [];
    for (const row of d?.rows ?? []) {
      const x = (row[0] ?? "").trim();
      if (x && !out.includes(x)) out.push(x);
    }
    return out;
  };
  const pick = (key: "outcome" | "factor1" | "factor2" | "grouping", label: string, none?: string) => (
    <label className="check-row">
      <span>{label}</span>
      <select aria-label={label} value={o[key]} onChange={(e) => set({ [key]: e.target.value })}>
        <option value="">{none ?? "Choose…"}</option>
        {names.map((n) => <option key={n} value={n}>{n}</option>)}
        {key === "grouping" && <option value={ROW_TITLES}>Row titles (observation labels)</option>}
      </select>
    </label>
  );
  const two = !!o.factor2 && o.factor2 !== o.factor1;
  return (
    <div className="controls">
      <section>
        <h3>Variables</h3>
        {pick("outcome", "Outcome")}
        {pick("factor1", "Factor")}
        {pick("factor2", "Second factor", "None (one factor)")}
        {pick("grouping", "Grouping column (random)")}
        <p className="hint-block">
          One row per value. The grouping column says which animal, litter or cage each value
          comes from; it is fitted as a random intercept (lme4: (1 | {o.grouping === ROW_TITLES ? unitWords(o.unit, o.unitCustom).singular
            : o.grouping || "group"})),
          so a factor that is constant within each group is tested on the number of groups, not
          the number of rows (<Cite src={MIXED_SRC.lme4} />).
        </p>
      </section>
      <UnitControls o={o} set={set} a={o.factor1 || "Factor"} b={two ? o.factor2 : null}
        la={levels(o.factor1)} lb={two ? levels(o.factor2) : []} />
    </div>
  );
}
