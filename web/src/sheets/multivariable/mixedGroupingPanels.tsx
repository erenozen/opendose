// Controls of the mixed model with a grouping column (multiple-variables
// tables); results, methods and graph are shared with the grouped table's
// nested two-way ANOVA (common/mixedPanels.tsx). A nested level or a
// covariate switches the sheet to the general linear mixed model (P-87,
// common/lmmPanels.tsx).
import { parseCell } from "../../project/table";
import { MIXED_SRC, unitWords } from "../common/mixedModel";
import { Cite, UnitControls } from "../common/mixedPanels";
import type { ControlsProps } from "../types";
import { isGeneralModel, ROW_TITLES, type MixedGroupingOptions } from "./mixedGrouping";
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
  // a covariate is a numeric column: every filled cell a number
  const numeric = (n: string) => {
    const d = table.datasets[names.indexOf(n)];
    const cells = (d?.rows ?? []).map((r) => (r[0] ?? "").trim()).filter(Boolean);
    return d?.varType !== "categorical" && cells.length > 0 && cells.every((c) => parseCell(c) !== null);
  };
  const general = isGeneralModel(o);
  const covariates = o.covariates ?? [];
  const slopes = o.slopes ?? [];
  const pick = (key: "outcome" | "factor1" | "factor2" | "grouping" | "subgroup", label: string, none?: string) => (
    <label className="check-row">
      <span>{label}</span>
      <select aria-label={label} value={o[key] ?? ""} onChange={(e) => set({ [key]: e.target.value })}>
        <option value="">{none ?? "Choose…"}</option>
        {names.map((n) => <option key={n} value={n}>{n}</option>)}
        {key === "grouping" && <option value={ROW_TITLES}>Row titles (observation labels)</option>}
      </select>
    </label>
  );
  const taken = [o.outcome, o.factor1, o.factor2, o.grouping, o.subgroup ?? ""];
  const candidates = names.filter((n) => numeric(n) && (!taken.includes(n) || covariates.includes(n)));
  const toggleCov = (n: string, on: boolean) => {
    const next = on ? [...covariates, n] : covariates.filter((c) => c !== n);
    set({ covariates: next, slopes: slopes.filter((s) => next.includes(s)) });
  };
  const toggleSlope = (n: string, on: boolean) => set({
    slopes: on ? [...slopes, n] : slopes.filter((s) => s !== n),
  });
  const g = o.grouping === ROW_TITLES ? unitWords(o.unit, o.unitCustom).singular : o.grouping || "group";
  const two = !!o.factor2 && o.factor2 !== o.factor1;
  return (
    <div className="controls">
      <section>
        <h3>Variables</h3>
        {pick("outcome", "Outcome")}
        {pick("factor1", "Factor", general ? "None" : undefined)}
        {pick("factor2", "Second factor", "None (one factor)")}
        {pick("grouping", "Grouping column (random)")}
        {pick("subgroup", "Nested level (random)", "None")}
        <p className="hint-block">
          One row per value. The grouping column says which animal, litter or cage each value
          comes from; it is fitted as a random intercept (lme4: (1 | {g})), so a factor that is
          constant within each group is tested on the number of groups, not the number of rows
          (<Cite src={MIXED_SRC.lme4} />). A nested level (slice within animal, pup within litter)
          adds a random intercept for each of its groups within their {g} (lme4: (1 | {g}:
          {o.subgroup || "slice"})); its labels are read within each {g}, so slice 1 of two animals
          is two slices.
        </p>
      </section>
      <section>
        <h3>Covariates</h3>
        {candidates.length === 0 && (
          <p className="hint-block">No numeric variable is free to be a covariate.</p>
        )}
        {candidates.map((n) => (
          <div key={n}>
            <label className="check-row">
              <input type="checkbox" checked={covariates.includes(n)}
                onChange={(e) => toggleCov(n, e.target.checked)} />
              <span>{n}</span>
            </label>
            {covariates.includes(n) && (
              <label className="check-row covariate-slope">
                <input type="checkbox" checked={slopes.includes(n)}
                  onChange={(e) => toggleSlope(n, e.target.checked)} />
                <span>Random slope of {n} by {g}</span>
              </label>
            )}
          </div>
        ))}
        {slopes.length > 0 && (
          <fieldset className="field-radios">
            <legend>Random intercept and slope</legend>
            <label><input type="radio" name="slope-structure" checked={o.slopeStructure !== "independent"}
              onChange={() => set({ slopeStructure: "correlated" })} /> Correlated (lme4: (1 + x | {g}))</label>
            <label><input type="radio" name="slope-structure" checked={o.slopeStructure === "independent"}
              onChange={() => set({ slopeStructure: "independent" })} /> Independent (lme4: (1 + x || {g}))</label>
          </fieldset>
        )}
        <p className="hint-block">
          A covariate is a measured number (cell size, age, day) whose slope is estimated. A random
          slope lets that slope differ between {g} groups, as each animal&apos;s response to the
          dose or each subject&apos;s change over days; it needs the covariate to vary within groups.
          Covariates, a nested level or random slopes fit the general mixed model with Kenward-Roger
          or Satterthwaite df.
        </p>
      </section>
      <UnitControls o={o} set={set} a={o.factor1 || "Factor"} b={two ? o.factor2 : null}
        la={levels(o.factor1)} lb={two ? levels(o.factor2) : []} general={general} />
    </div>
  );
}
