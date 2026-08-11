import type { ColumnOptionsState } from "../types";
import {
  COLUMN_ANALYSIS_LABELS, COLUMN_GRAPH_LABELS, COMPARISONS_LABELS,
  TTEST_LABELS, TWO_WAY_DIRECTION_LABELS,
} from "../types";
import type {
  ColumnAnalysisKind, ColumnGraphType, ComparisonsMethod, TTestKind,
  TwoWayComparisons, TwoWayDirection,
} from "../types";

interface Props {
  options: ColumnOptionsState;
  datasetNames: string[];
  onChange: (o: ColumnOptionsState) => void;
}

export default function ColumnControls({ options, datasetNames, onChange }: Props) {
  const set = (patch: Partial<ColumnOptionsState>) =>
    onChange({ ...options, ...patch });

  const pickDataset = (
    label: string, value: number, key: "datasetA" | "datasetB" | "controlIndex",
  ) => (
    <label className="check-row">
      <span>{label}</span>
      <select value={value} onChange={(e) => set({ [key]: Number(e.target.value) })}>
        {datasetNames.map((n, i) => (
          <option key={i} value={i}>{n || `Dataset ${i + 1}`}</option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="controls">
      <section>
        <h3>Analysis</h3>
        <select
          className="analysis-select"
          aria-label="Analysis"
          value={options.analysis}
          onChange={(e) => set({ analysis: e.target.value as ColumnAnalysisKind })}
        >
          {(Object.keys(COLUMN_ANALYSIS_LABELS) as ColumnAnalysisKind[]).map((k) => (
            <option key={k} value={k}>{COLUMN_ANALYSIS_LABELS[k]}</option>
          ))}
        </select>
      </section>

      <section>
        <h3>Graph</h3>
        <select
          className="graph-select"
          aria-label="Graph type"
          value={options.graphType}
          onChange={(e) => set({ graphType: e.target.value as ColumnGraphType })}
        >
          {(Object.keys(COLUMN_GRAPH_LABELS) as ColumnGraphType[]).map((k) => (
            <option key={k} value={k}>{COLUMN_GRAPH_LABELS[k]}</option>
          ))}
        </select>
      </section>

      {options.analysis === "column_statistics" && (
        <section>
          <h3>One-sample test (optional)</h3>
          <label className="check-row">
            <span>Hypothetical value</span>
            <input
              className="constraint-value"
              inputMode="decimal"
              placeholder="e.g. 100"
              value={options.hypothetical}
              onChange={(e) => set({ hypothetical: e.target.value })}
            />
          </label>
        </section>
      )}

      {options.analysis === "ttest" && (
        <section>
          <h3>Test</h3>
          <select
            value={options.ttestKind}
            onChange={(e) => set({ ttestKind: e.target.value as TTestKind })}
          >
            {(Object.keys(TTEST_LABELS) as TTestKind[]).map((k) => (
              <option key={k} value={k}>{TTEST_LABELS[k]}</option>
            ))}
          </select>
          {pickDataset("Group A", options.datasetA, "datasetA")}
          {pickDataset("Group B", options.datasetB, "datasetB")}
        </section>
      )}

      {options.analysis === "anova" && (
        <section>
          <h3>Options</h3>
          <label className="check-row">
            <span>Type</span>
            <select
              value={options.anovaKind}
              onChange={(e) =>
                set({ anovaKind: e.target.value as "parametric" | "nonparametric" })}
            >
              <option value="parametric">Ordinary one-way ANOVA</option>
              <option value="nonparametric">Kruskal-Wallis (+ Dunn's)</option>
            </select>
          </label>
          {options.anovaKind === "parametric" && (
            <>
              <label className="check-row">
                <span>Multiple comparisons</span>
                <select
                  value={options.comparisons}
                  onChange={(e) =>
                    set({ comparisons: e.target.value as ComparisonsMethod })}
                >
                  {(Object.keys(COMPARISONS_LABELS) as ComparisonsMethod[]).map((k) => (
                    <option key={k} value={k}>{COMPARISONS_LABELS[k]}</option>
                  ))}
                </select>
              </label>
              {options.comparisons === "dunnett" &&
                pickDataset("Control group", options.controlIndex, "controlIndex")}
            </>
          )}
        </section>
      )}

      {options.analysis === "correlation" && (
        <section>
          <h3>Options</h3>
          <label className="check-row">
            <span>Method</span>
            <select value={options.corrMethod}
              onChange={(e) =>
                set({ corrMethod: e.target.value as "pearson" | "spearman" })}>
              <option value="pearson">Pearson (parametric)</option>
              <option value="spearman">Spearman (nonparametric)</option>
            </select>
          </label>
          {pickDataset("Dataset A", options.datasetA, "datasetA")}
          {pickDataset("Dataset B", options.datasetB, "datasetB")}
        </section>
      )}

      {options.analysis === "two_way_anova" && (
        <section>
          <h3>Design</h3>
          <p className="hint-block">
            Factor A = table rows, Factor B = datasets, replicates in
            subcolumns. Every row × dataset cell needs values.
          </p>
          <label className="check-row">
            <span>Multiple comparisons</span>
            <select value={options.twoWayComparisons}
              onChange={(e) => set({
                twoWayComparisons: e.target.value as TwoWayComparisons })}>
              <option value="none">None</option>
              <option value="tukey">Tukey</option>
              <option value="sidak">Šídák</option>
              <option value="bonferroni">Bonferroni</option>
            </select>
          </label>
          {options.twoWayComparisons !== "none" && (
            <label className="check-row">
              <span>Compare</span>
              <select value={options.twoWayDirection}
                onChange={(e) => set({
                  twoWayDirection: e.target.value as TwoWayDirection })}>
                {(Object.keys(TWO_WAY_DIRECTION_LABELS) as TwoWayDirection[])
                  .map((k) => (
                    <option key={k} value={k}>
                      {TWO_WAY_DIRECTION_LABELS[k]}
                    </option>
                  ))}
              </select>
            </label>
          )}
        </section>
      )}

      {options.analysis === "rm_two_way" && (
        <section>
          <h3>Design</h3>
          <label className="check-row">
            <span>Repeated measures</span>
            <select value={options.rmTwoDesign}
              onChange={(e) => set({
                rmTwoDesign: e.target.value as "mixed" | "both" })}>
              <option value="mixed">
                By rows (datasets are independent groups)
              </option>
              <option value="both">
                Both factors (every subject in every cell)
              </option>
            </select>
          </label>
          <p className="hint-block">
            Rows = repeated factor, datasets = second factor, subcolumn
            index = subject. Mixed design: subject s of a dataset is that
            group's s-th subject. Both-repeated: subcolumn s is the same
            subject everywhere.
          </p>
        </section>
      )}

      {options.analysis === "rm_anova" && (
        <section>
          <h3>Options</h3>
          <label className="check-row">
            <span>Type</span>
            <select value={options.rmKind}
              onChange={(e) => set({
                rmKind: e.target.value as "parametric" | "nonparametric" })}>
              <option value="parametric">RM one-way ANOVA (Geisser-Greenhouse)</option>
              <option value="nonparametric">Friedman test (+ Dunn's)</option>
            </select>
          </label>
          <p className="hint-block">
            Rows are matched subjects; each dataset is one treatment.
            First subcolumn of each dataset is used.
          </p>
        </section>
      )}

      {options.analysis === "roc" && (
        <section>
          <h3>Groups</h3>
          {pickDataset("Patients (condition present)", options.datasetA, "datasetA")}
          {pickDataset("Controls (condition absent)", options.datasetB, "datasetB")}
        </section>
      )}

      {options.analysis === "bland_altman" && (
        <section>
          <h3>Methods to compare</h3>
          {pickDataset("Method A", options.datasetA, "datasetA")}
          {pickDataset("Method B", options.datasetB, "datasetB")}
        </section>
      )}

      {options.analysis === "outliers" && (
        <section>
          <h3>Method</h3>
          <label className="check-row">
            <select value={options.outlierMethod}
              onChange={(e) => set({
                outlierMethod: e.target.value as "grubbs" | "rout" })}>
              <option value="grubbs">Grubbs (iterative ESD)</option>
              <option value="rout">ROUT (FDR-based)</option>
            </select>
          </label>
          {options.outlierMethod === "grubbs" ? (
            <label className="check-row">
              <span>Alpha</span>
              <input
                className="constraint-value"
                inputMode="decimal"
                value={options.grubbsAlpha}
                onChange={(e) => set({ grubbsAlpha: e.target.value })}
              />
            </label>
          ) : (
            <label className="check-row">
              <span>Q (%)</span>
              <input
                className="constraint-value"
                inputMode="decimal"
                value={options.routQ}
                onChange={(e) => set({ routQ: e.target.value })}
              />
            </label>
          )}
        </section>
      )}
    </div>
  );
}
