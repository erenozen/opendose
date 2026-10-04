// Parameter panels of the grouped-table analyses.
import type { ReactNode } from "react";
import { datasetLetter } from "../../project/table";
import type { DataTableModel } from "../../project/types";
import {
  TWO_WAY_ADDITIVE_NOTE, TWO_WAY_DIRECTION_LABELS, TWO_WAY_MODEL_LABELS,
  type TwoWayDirection, type TwoWayModel,
} from "../../types";
import type { ControlsProps } from "../types";
import {
  CORRECTION_LABEL, DEFAULT_TWO_WAY, defaultAssign, FDR_METHODS, ROW_ERRORS, ROW_TEST_GROUPS,
  type ColumnStatsOptions, type Correction, type MultiTOptions, type RowCalc,
  type RowMeansOptions, type RowScope, type RowTest, type ThreeWayGoal,
  type ThreeWayMethod, type ThreeWayOptions, type TwoWayDesign, type TwoWayOptions,
} from "./options";
import { groupedPayload, hasMissingRM } from "./stats";
import "./grouped.css";

const dsName = (t: DataTableModel, i: number) =>
  t.datasets[i]?.name.trim() || `Dataset ${datasetLetter(i)}`;
const rowName = (t: DataTableModel, i: number) =>
  t.rowTitles[i]?.trim() || `Row ${i + 1}`;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <label className="check-row"><span>{label}</span>{children}</label>;
}

function DatasetPick({ table, label, value, onChange }: {
  table: DataTableModel; label: string; value: number; onChange: (v: number) => void;
}) {
  return (
    <Row label={label}>
      <select value={Math.min(value, table.datasets.length - 1)}
        onChange={(e) => onChange(Number(e.target.value))}>
        {table.datasets.map((_, i) => <option key={i} value={i}>{dsName(table, i)}</option>)}
      </select>
    </Row>
  );
}

// ------------------------------------------------------------ two-way

const DESIGN_HINT: Record<TwoWayDesign, string> = {
  none: "Every value is an independent observation: rows are the levels of "
    + "one factor, datasets the levels of the other, replicates go side by side.",
  rm_rows: "Each subcolumn of a dataset is one subject followed down the rows "
    + "(e.g. the same animal on every day). Datasets are separate groups of subjects.",
  rm_both: "Every subject is measured in every cell: subcolumn k is the same "
    + "subject in every row and every dataset.",
};

export function TwoWayControls({ table, options: o, onChange }: ControlsProps<TwoWayOptions>) {
  const set = (patch: Partial<TwoWayOptions>) => onChange({ ...o, ...patch });
  const summary = table.subcolumnFormat !== "replicates";
  const missing = o.design !== "none" && !summary
    && hasMissingRM(groupedPayload(table).datasets.map((d) => d.ys), o.design === "rm_both");
  // Untouched factor names show the ones the table brought from its file.
  const shownRow = o.rowFactor === DEFAULT_TWO_WAY.rowFactor
    ? table.factorNames?.rows || o.rowFactor : o.rowFactor;
  const shownCol = o.colFactor === DEFAULT_TWO_WAY.colFactor
    ? table.factorNames?.datasets || o.colFactor : o.colFactor;
  return (
    <div className="controls">
      <section>
        <h3>Design</h3>
        <Row label="Repeated measures">
          <select value={o.design} disabled={summary}
            onChange={(e) => set({ design: e.target.value as TwoWayDesign })}>
            <option value="none">None (no matching)</option>
            <option value="rm_rows">Rows are repeated measures</option>
            <option value="rm_both">Both factors are repeated measures</option>
          </select>
        </Row>
        <p className="hint-block">{DESIGN_HINT[o.design]}</p>
        {summary && (
          <p className="hint-block">
            This table holds means with SD / SEM and N, so the ANOVA is computed
            from those summaries (ordinary design only).
          </p>
        )}
        {o.design === "none" && (
          <>
            <Row label="Model">
              <select value={o.model}
                onChange={(e) => set({ model: e.target.value as TwoWayModel })}>
                {(Object.keys(TWO_WAY_MODEL_LABELS) as TwoWayModel[]).map((k) => (
                  <option key={k} value={k}>{TWO_WAY_MODEL_LABELS[k]}</option>
                ))}
              </select>
            </Row>
            {o.model === "additive" && <p className="hint-block">{TWO_WAY_ADDITIVE_NOTE}</p>}
          </>
        )}
        {o.design !== "none" && (
          <>
            <Row label="Fit">
              <select value={o.rmFit}
                onChange={(e) => set({ rmFit: e.target.value as "auto" | "mixed" })}>
                <option value="auto">RM ANOVA; mixed model if values are missing</option>
                <option value="mixed">Always the mixed-effects model</option>
              </select>
            </Row>
            {missing && (
              <p className="hint-block">
                Some subjects are missing values, so the mixed-effects model
                (REML) is fitted; it uses every value that is there.
              </p>
            )}
          </>
        )}
      </section>
      <section>
        <h3>Factor names</h3>
        <div className="factor-names">
          <span>Rows</span>
          <input aria-label="Name of the row factor" value={shownRow}
            onChange={(e) => set({ rowFactor: e.target.value })} />
          <span />
          <span>Datasets</span>
          <input aria-label="Name of the column factor" value={shownCol}
            onChange={(e) => set({ colFactor: e.target.value })} />
          <span />
        </div>
        {(table.factorNames?.rows || table.factorNames?.datasets) && (
          <p className="hint-block">Factor names read from the imported file; type to change them.</p>
        )}
      </section>
      <section>
        <h3>Multiple comparisons</h3>
        <Row label="Test">
          <select value={o.comparisons}
            onChange={(e) => set({ comparisons: e.target.value as TwoWayOptions["comparisons"] })}>
            <option value="none">None</option>
            <option value="tukey">Tukey</option>
            <option value="sidak">Šídák</option>
            <option value="bonferroni">Bonferroni</option>
          </select>
        </Row>
        {o.comparisons !== "none" && (
          <Row label="Compare">
            <select value={o.direction}
              onChange={(e) => set({ direction: e.target.value as TwoWayDirection })}>
              {(Object.keys(TWO_WAY_DIRECTION_LABELS) as TwoWayDirection[])
                .filter((k) => k !== "all_cells" || o.direction === k
                  || (o.design === "none" && o.model !== "additive"))
                .map((k) => (
                  <option key={k} value={k}>{TWO_WAY_DIRECTION_LABELS[k]}</option>
                ))}
            </select>
          </Row>
        )}
      </section>
    </div>
  );
}

// ------------------------------------------------------------ three-way

const METHOD_LABEL: Record<ThreeWayMethod, string> = {
  none_cmp: "No multiple comparisons",
  tukey: "Tukey",
  dunnett: "Dunnett (versus a control)",
  sidak: "Šídák",
  bonferroni: "Bonferroni",
  holm_sidak: "Holm-Šídák",
  fisher: "Fisher's LSD (no correction)",
  bky: "FDR: two-stage step-up (BKY)",
  bh: "FDR: Benjamini-Hochberg",
  by: "FDR: Benjamini-Yekutieli",
};

const GOAL_LABEL: Record<ThreeWayGoal, string> = {
  all_cells: "Every cell mean with every other",
  control: "Every cell mean with a control cell",
  one_factor: "Cell means that differ in one factor only",
  row1_below: "Each cell in a row with the cell below it",
  row_means: "Row (factor A) means, all pairs",
  row_means_control: "Row (factor A) means versus a control row",
  factor_b_means: "Factor B means",
  factor_c_means: "Factor C means",
};

export function ThreeWayControls({ table, options: o, onChange }: ControlsProps<ThreeWayOptions>) {
  const set = (patch: Partial<ThreeWayOptions>) => onChange({ ...o, ...patch });
  const n = table.datasets.length;
  const assign = Array.from({ length: n }, (_, i) => o.assign[i] ?? null);
  const setAssign = (i: number, axis: 0 | 1, v: string) => {
    const next = assign.map((a) => (a ? [...a] as [number, number] : null));
    if (v === "") next[i] = null;
    else {
      const cur = next[i] ?? [0, 0];
      cur[axis] = Number(v);
      next[i] = cur;
    }
    set({ assign: next });
  };
  const fdr = ["bky", "bh", "by"].includes(o.method);
  const name = (k: 0 | 1 | 2, v: string) => {
    const f = [...o.factorNames] as [string, string, string];
    f[k] = v;
    set({ factorNames: f });
  };
  const level = (key: "bLevels" | "cLevels", k: 0 | 1, v: string) => {
    const l = [...o[key]] as [string, string];
    l[k] = v;
    set({ [key]: l } as Partial<ThreeWayOptions>);
  };
  const cellOptions: [string, string][] = [];
  for (let r = 0; r < table.rowTitles.length; r++) {
    for (let b = 0; b < 2; b++) {
      for (let c = 0; c < 2; c++) {
        cellOptions.push([`${r}:${b}:${c}`,
          `${rowName(table, r)} · ${o.bLevels[b] || `B${b + 1}`} · ${o.cLevels[c] || `C${c + 1}`}`]);
      }
    }
  }
  return (
    <div className="controls">
      <section>
        <h3>Layout</h3>
        <p className="hint-block">
          Three-way ANOVA reads the table this way: rows are the levels of the
          first factor; datasets A and B versus C and D are the two levels of
          factor B; datasets A and C versus B and D are the two levels of
          factor C. Datasets after D are not used. Reassign below if your
          table is arranged differently.
        </p>
        <div className="factor-names">
          <span>Factor A (rows)</span>
          <input aria-label="Name of factor A" value={o.factorNames[0]}
            onChange={(e) => name(0, e.target.value)} />
          <span />
          <span>Factor B</span>
          <input aria-label="Name of factor B" value={o.factorNames[1]}
            onChange={(e) => name(1, e.target.value)} />
          <span />
          <span>B levels</span>
          <input aria-label="Factor B level 1" value={o.bLevels[0]}
            onChange={(e) => level("bLevels", 0, e.target.value)} />
          <input aria-label="Factor B level 2" value={o.bLevels[1]}
            onChange={(e) => level("bLevels", 1, e.target.value)} />
          <span>Factor C</span>
          <input aria-label="Name of factor C" value={o.factorNames[2]}
            onChange={(e) => name(2, e.target.value)} />
          <span />
          <span>C levels</span>
          <input aria-label="Factor C level 1" value={o.cLevels[0]}
            onChange={(e) => level("cLevels", 0, e.target.value)} />
          <input aria-label="Factor C level 2" value={o.cLevels[1]}
            onChange={(e) => level("cLevels", 1, e.target.value)} />
        </div>
        <table className="tw-layout">
          <thead>
            <tr><th>Dataset</th><th>{o.factorNames[1] || "Factor B"}</th>
              <th>{o.factorNames[2] || "Factor C"}</th></tr>
          </thead>
          <tbody>
            {assign.map((a, i) => (
              <tr key={i}>
                <th>{datasetLetter(i)}: {dsName(table, i)}</th>
                <td>
                  <select aria-label={`${dsName(table, i)}: level of factor B`}
                    value={a ? String(a[0]) : ""}
                    onChange={(e) => setAssign(i, 0, e.target.value)}>
                    <option value="">Not used</option>
                    <option value="0">{o.bLevels[0] || "B1"}</option>
                    <option value="1">{o.bLevels[1] || "B2"}</option>
                  </select>
                </td>
                <td>
                  <select aria-label={`${dsName(table, i)}: level of factor C`}
                    value={a ? String(a[1]) : ""}
                    onChange={(e) => setAssign(i, 1, e.target.value)}>
                    <option value="">Not used</option>
                    <option value="0">{o.cLevels[0] || "C1"}</option>
                    <option value="1">{o.cLevels[1] || "C2"}</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="grouped-btn"
          onClick={() => set({ assign: defaultAssign(n) })}>
          Reset to the standard layout
        </button>
      </section>
      <section>
        <h3>Multiple comparisons</h3>
        <Row label="Method">
          <select value={o.method}
            onChange={(e) => set({ method: e.target.value as ThreeWayMethod })}>
            {(Object.keys(METHOD_LABEL) as ThreeWayMethod[]).map((k) => (
              <option key={k} value={k}>{METHOD_LABEL[k]}</option>
            ))}
          </select>
        </Row>
        {o.method !== "none_cmp" && (
          <>
            <Row label="Compare">
              <select value={o.goal}
                onChange={(e) => set({ goal: e.target.value as ThreeWayGoal })}>
                {(Object.keys(GOAL_LABEL) as ThreeWayGoal[]).map((k) => (
                  <option key={k} value={k}>{GOAL_LABEL[k]}</option>
                ))}
              </select>
            </Row>
            {o.goal === "control" && (
              <Row label="Control cell">
                <select value={o.control.join(":")}
                  onChange={(e) => set({
                    control: e.target.value.split(":").map(Number) as [number, number, number],
                  })}>
                  {cellOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Row>
            )}
            {o.goal === "row_means_control" && (
              <Row label="Control row">
                <select value={o.controlRow}
                  onChange={(e) => set({ controlRow: Number(e.target.value) })}>
                  {table.rowTitles.map((_, r) => (
                    <option key={r} value={r}>{rowName(table, r)}</option>
                  ))}
                </select>
              </Row>
            )}
            {o.goal === "one_factor" && (
              <Row label="Factor that differs">
                <select value={o.oneFactor}
                  onChange={(e) => set({ oneFactor: e.target.value as ThreeWayOptions["oneFactor"] })}>
                  <option value="any">Any one factor</option>
                  <option value="a">{o.factorNames[0] || "Factor A"} only</option>
                  <option value="b">{o.factorNames[1] || "Factor B"} only</option>
                  <option value="c">{o.factorNames[2] || "Factor C"} only</option>
                </select>
              </Row>
            )}
            {fdr ? (
              <Row label="Q (%)">
                <input className="constraint-value" inputMode="decimal" value={o.q}
                  onChange={(e) => set({ q: e.target.value })} />
              </Row>
            ) : (
              <Row label="Alpha">
                <input className="constraint-value" inputMode="decimal" value={o.alpha}
                  onChange={(e) => set({ alpha: e.target.value })} />
              </Row>
            )}
          </>
        )}
      </section>
    </div>
  );
}

// ------------------------------------------------------------ multiple t

export function MultiTControls({ table, options: o, onChange }: ControlsProps<MultiTOptions>) {
  const set = (patch: Partial<MultiTOptions>) => onChange({ ...o, ...patch });
  const fdr = FDR_METHODS.includes(o.method);
  const a = dsName(table, o.datasetA);
  const b = dsName(table, o.datasetB);
  return (
    <div className="controls">
      <section>
        <h3>Compare</h3>
        <DatasetPick table={table} label="Dataset A" value={o.datasetA}
          onChange={(v) => set({ datasetA: v })} />
        <DatasetPick table={table} label="Dataset B" value={o.datasetB}
          onChange={(v) => set({ datasetB: v })} />
        <label className="check-row">
          <input type="checkbox" checked={o.swap} onChange={(e) => set({ swap: e.target.checked })} />
          <span>Report {o.swap ? `${b} − ${a}` : `${a} − ${b}`} (swap the direction)</span>
        </label>
        <p className="hint-block">
          One test per row. Paired tests match subcolumn k of A with
          subcolumn k of B.
        </p>
      </section>
      <section>
        <h3>Test</h3>
        <select aria-label="Test run on each row" value={o.test}
          onChange={(e) => set({ test: e.target.value as RowTest })}>
          {ROW_TEST_GROUPS.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.tests.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </optgroup>
          ))}
        </select>
      </section>
      <section>
        <h3>Multiple comparisons</h3>
        <Row label="Method">
          <select value={o.method} onChange={(e) => set({ method: e.target.value as Correction })}>
            <optgroup label="False discovery rate">
              {FDR_METHODS.map((k) => <option key={k} value={k}>{CORRECTION_LABEL[k]}</option>)}
            </optgroup>
            <optgroup label="Statistical significance">
              {(["holm_sidak", "holm", "sidak", "bonferroni", "none"] as Correction[]).map((k) => (
                <option key={k} value={k}>{CORRECTION_LABEL[k]}</option>
              ))}
            </optgroup>
          </select>
        </Row>
        {fdr ? (
          <Row label="Q (%)">
            <input className="constraint-value" inputMode="decimal" value={o.q}
              onChange={(e) => set({ q: e.target.value })} />
          </Row>
        ) : (
          <Row label="Alpha">
            <input className="constraint-value" inputMode="decimal" value={o.alpha}
              onChange={(e) => set({ alpha: e.target.value })} />
          </Row>
        )}
      </section>
    </div>
  );
}

// ------------------------------------------------------------ row means

const CALC_LABEL: Record<RowCalc, string> = {
  mean: "Mean", median: "Median", geometric_mean: "Geometric mean", total: "Total (sum)",
};

export function RowMeansControls({ options: o, onChange }: ControlsProps<RowMeansOptions>) {
  const set = (patch: Partial<RowMeansOptions>) => onChange({ ...o, ...patch });
  return (
    <div className="controls">
      <section>
        <h3>Calculate</h3>
        <Row label="Statistic">
          <select value={o.calculate} onChange={(e) => {
            const calculate = e.target.value as RowCalc;
            set({ calculate, error: ROW_ERRORS[calculate][0][0] });
          }}>
            {(Object.keys(CALC_LABEL) as RowCalc[]).map((k) => (
              <option key={k} value={k}>{CALC_LABEL[k]}</option>
            ))}
          </select>
        </Row>
        {o.calculate !== "total" && (
          <Row label="Variability">
            <select value={o.error} onChange={(e) => set({ error: e.target.value })}>
              {ROW_ERRORS[o.calculate].map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Row>
        )}
        {o.error === "percentiles" && (
          <Row label="Lower percentile">
            <input className="constraint-value" inputMode="decimal" value={o.percentile}
              onChange={(e) => set({ percentile: e.target.value })} />
          </Row>
        )}
      </section>
      <section>
        <h3>Across</h3>
        <select aria-label="Which values each result summarizes" value={o.scope}
          onChange={(e) => set({ scope: e.target.value as RowScope })}>
          <option value="row">Each row: summarize each dataset first, then across datasets</option>
          <option value="all_values">Each row: all replicates of all datasets pooled</option>
          <option value="dataset">Each row of each dataset separately</option>
        </select>
        <p className="hint-block">
          The first choice treats each dataset&apos;s value in a row as one
          observation (so n is the number of datasets); pooling counts every
          replicate.
        </p>
      </section>
    </div>
  );
}

// ------------------------------------------------------------ column stats

export function ColumnStatsControls({ options: o, onChange }: ControlsProps<ColumnStatsOptions>) {
  const set = (patch: Partial<ColumnStatsOptions>) => onChange({ ...o, ...patch });
  return (
    <div className="controls">
      <section>
        <h3>Analyze</h3>
        <select aria-label="What each column of statistics describes" value={o.unit}
          onChange={(e) => set({ unit: e.target.value as ColumnStatsOptions["unit"] })}>
          <option value="cell">Each row × dataset cell (its replicates)</option>
          <option value="dataset">Each dataset, all rows pooled</option>
        </select>
      </section>
      <section>
        <h3>One-sample test (optional)</h3>
        <Row label="Hypothetical value">
          <input className="constraint-value" inputMode="decimal" placeholder="e.g. 100"
            value={o.hypothetical} onChange={(e) => set({ hypothetical: e.target.value })} />
        </Row>
      </section>
    </div>
  );
}
