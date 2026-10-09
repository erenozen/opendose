// The "Comparisons" picker of the column post tests: every pair, each
// group vs. a control, or the planned pairs (tick boxes). Shown for Dunn's
// test after Kruskal-Wallis and Friedman, and for the one-way ANOVA post
// tests that adjust a chosen family (Šídák, Bonferroni, Holm-Šídák, Holm,
// Fisher's LSD). The correction then counts only that family.
import type { ColumnOptionsState } from "../../types";
import {
  allPairs, effectiveFamily, familySize, familyTarget, togglePair, validPairs,
  type ComparisonsFamily,
} from "./comparisonsFamily";
import "./residuals.css";

const plural = (n: number) => `${n} comparison${n === 1 ? "" : "s"}`;

export default function ComparisonsPicker({ options, datasetNames, onChange, summaryData = false }: {
  options: ColumnOptionsState;
  datasetNames: string[];
  onChange: (o: ColumnOptionsState) => void;
  summaryData?: boolean;
}) {
  const target = familyTarget(options, summaryData);
  if (!target) return null;
  const k = datasetNames.length;
  const fam = options.comparisonsFamily ?? "all";
  const used = effectiveFamily(options, k);
  const name = (i: number) => datasetNames[i] || `Dataset ${i + 1}`;
  const ticked = validPairs(options.plannedPairs, k);
  const isTicked = (i: number, j: number) =>
    ticked.some(([a, b]) => (a === i && b === j) || (a === j && b === i));
  const set = (patch: Partial<ColumnOptionsState>) => onChange({ ...options, ...patch });
  const n = familySize(options, k);
  const uncorrected = (target === "dunn" && options.dunnCorrected === false)
    || (target === "posthoc" && options.comparisons === "fisher_lsd");
  const lead = uncorrected ? "Without correction, the test compares"
    : target === "dunn" ? "Dunn's test corrects" : "The P values are adjusted";
  const what = used === "all" ? `every pair (${plural(n)})`
    : used === "control" ? `${plural(n)}, each vs. ${name(options.controlIndex)}`
      : `${plural(n)}, the planned pairs only`;
  return (
    <div className="comparisons-picker">
      <label className="check-row">
        <span>Comparisons</span>
        <select aria-label="Comparisons" value={fam}
          onChange={(e) => set({ comparisonsFamily: e.target.value as ComparisonsFamily })}>
          <option value="all">Every pair ({plural((k * (k - 1)) / 2)})</option>
          <option value="control">Each vs. a control ({plural(Math.max(0, k - 1))})</option>
          <option value="pairs">Planned pairs only (tick below)</option>
        </select>
      </label>
      {fam === "control" && (
        <label className="check-row">
          <span>Control group</span>
          <select aria-label="Control group" value={options.controlIndex}
            onChange={(e) => set({ controlIndex: Number(e.target.value) })}>
            {datasetNames.map((_, i) => <option key={i} value={i}>{name(i)}</option>)}
          </select>
        </label>
      )}
      {fam === "pairs" && (
        <fieldset className="planned-pairs">
          <legend>Planned pairs</legend>
          {allPairs(k).map(([i, j]) => (
            <label key={`${i}-${j}`} className="check-row">
              <input type="checkbox" checked={isTicked(i, j)}
                onChange={(e) => set({
                  plannedPairs: togglePair(options.plannedPairs, i, j, e.target.checked) })} />
              <span>{name(i)} vs. {name(j)}</span>
            </label>
          ))}
          {!ticked.length && (
            <p className="hint-block">Tick at least one pair; until then every pair is compared.</p>
          )}
        </fieldset>
      )}
      <p className="hint-block">
        {lead}{uncorrected ? "" : " for"} {what}. Choose the family before looking at the results: a family picked
        after seeing which pairs differ is not a planned comparison.{" "}
        <span className="source-line">
          Sources: GraphPad statistics guide,{" "}
          <a href="https://www.graphpad.com/guides/prism/latest/statistics/stat_options_tab_1wayanova.htm"
            target="_blank" rel="noreferrer">Options tab, multiple comparisons (one-way ANOVA)</a>
          {target === "dunn" ? "; Dunn OJ (1964), Multiple comparisons using rank sums, Technometrics 6:241-252." : "."}
        </span>
      </p>
    </div>
  );
}
