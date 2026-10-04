// qPCR: controls with the setup wizard (Cq import, reference genes and
// calibrator, efficiencies, QC limits and the test), the results sheet
// (replicate QC, ΔCq / ΔΔCq per sample, fold changes with asymmetric CIs
// and the statistics on ΔCq) and the methods text.
import { useState } from "react";
import { readXlsx } from "../../../lib/engine";
import type { DataTableModel } from "../../../project/types";
import { parseSource, recipeById } from "../../../share/recipes/presets";
import CopyableMethods from "../../common/CopyableMethods";
import type { ControlsProps, ResultsProps } from "../../types";
import { takeWizardRequest } from "../kit/create";
import { interval, num, pValue, testSummary } from "../kit/format";
import { Chip, ColumnPicker, KV, LinkedOutputs, Note, Warnings } from "../kit/ui";
import { useAssay, type SpecsFor } from "../kit/useAssay";
import Wizard from "../kit/Wizard";
import {
  calibratorOf, dcqSettings, dcqTable, QPCR_ROLES, readQpcr, referenceGenes, runQpcr,
  tableFromStaging, TEST_LABELS, type PostTest, type QpcrOptions, type QpcrResult, type QTest,
} from "./model";

/* eslint-disable @typescript-eslint/no-explicit-any */

const specsFor = (tableName: string): SpecsFor<QpcrOptions> => (engine, table, o) => {
  const res = runQpcr((p) => engine.analyze(p), table, o);
  const t = dcqTable(res);
  return t ? [{
    key: "dcq", name: `ΔCq of ${tableName}`, table: t,
    configure: (prev: unknown) => dcqSettings(prev, t),
  }] : [];
};

const MIQE_NOTE = "Statistics are computed on ΔCq (the log2 scale), never on fold changes; fold "
  + "changes and their asymmetric confidence intervals are back-transformed from it. ΔΔCq "
  + "(2^−ΔΔCq, Livak & Schmittgen 2001) is the special case of efficiency-corrected "
  + "quantification (Pfaffl 2001; qBase, Hellemans et al. 2007) with every efficiency at 100%; "
  + "MIQE 2.0 (Bustin et al. 2025) asks for measured efficiencies and validated reference genes.";

// ------------------------------------------------------------ controls

export function QpcrControls({ sheet, table, options: o, readOnly }: ControlsProps<QpcrOptions>) {
  const a = useAssay<QpcrOptions>(sheet);
  const [wizardAt, setWizardAt] = useState<number | null>(() => (takeWizardRequest(sheet.id) ? 0 : null));
  const set = (patch: Partial<QpcrOptions>) => a.save({ ...o, ...patch });
  const d = readQpcr(table, o);
  const refs = referenceGenes(o, d.targets);
  return (
    <div className="controls assay-controls">
      <section>
        <h3>qPCR relative quantification</h3>
        <div className="assay-setup">
          <button type="button" className="btn-primary" disabled={readOnly}
            onClick={() => setWizardAt(0)}>Open setup wizard…</button>
        </div>
        <p className="hint-block">
          {d.records.length} wells, {new Set(d.records.map((r) => r.sample)).size} samples,
          {" "}{d.targets.length} targets, {d.groups.length} groups.
          {" "}Reference: {refs.join(" + ") || "not chosen"}; calibrator: {calibratorOf(o, d.groups) || "n/a"}.
        </p>
        {d.problem && <p className="wizard-blocker">{d.problem}</p>}
      </section>
      <section>
        <h3>Reference genes and calibrator</h3>
        <RefFields o={o} set={set} targets={d.targets} groups={d.groups} readOnly={readOnly} />
      </section>
      <section>
        <h3>Statistics on ΔCq</h3>
        <TestFields o={o} set={set} readOnly={readOnly} />
      </section>
      <section>
        <h3>ΔCq table</h3>
        <LinkedOutputs outputs={a.outputs}
          onMake={readOnly || d.problem || a.outputs.length ? undefined
            : () => { void a.commit(o, null, specsFor(a.tableName)); }}
          makeLabel="Make the linked ΔCq table"
          hint="ΔCq per biological sample and group, for further analysis (t test, ANOVA, two-way ANOVA)." />
      </section>
      {wizardAt !== null && (
        <QpcrWizard start={wizardAt} table={table} options={o} hasOutputs={a.outputs.length > 0}
          onClose={() => setWizardAt(null)}
          onFinish={(opts, nt) => { setWizardAt(null); void a.commit(opts, nt, specsFor(a.tableName)); }} />
      )}
    </div>
  );
}

function RefFields({ o, set, targets, groups, readOnly }: {
  o: QpcrOptions; set: (p: Partial<QpcrOptions>) => void; targets: string[]; groups: string[]; readOnly?: boolean;
}) {
  const refs = referenceGenes(o, targets);
  return (
    <>
      <fieldset className="field-radios">
        <legend>Reference gene(s)</legend>
        <div className="gene-picks">
          {targets.map((g) => (
            <label key={g}>
              <input type="checkbox" checked={refs.includes(g)} disabled={readOnly}
                onChange={(e) => set({ referenceGenes: e.target.checked ? [...refs, g] : refs.filter((x) => x !== g) })} />
              {g}
            </label>
          ))}
          {!targets.length && <span className="hint-block">No targets in the table yet.</span>}
        </div>
        <span className="field-note">Several reference genes are combined by their geometric mean
          (Vandesompele et al. 2002).</span>
      </fieldset>
      <label className="field">
        <span>Calibrator group (fold change 1)</span>
        <select value={calibratorOf(o, groups)} disabled={readOnly} aria-label="Calibrator group"
          onChange={(e) => set({ calibrator: e.target.value })}>
          {groups.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </label>
    </>
  );
}

function TestFields({ o, set, readOnly }: {
  o: QpcrOptions; set: (p: Partial<QpcrOptions>) => void; readOnly?: boolean;
}) {
  return (
    <div className="wizard-row">
      <label className="field">
        <span>Test</span>
        <select value={o.test} disabled={readOnly} aria-label="Test"
          onChange={(e) => set({ test: e.target.value as QTest })}>
          {(Object.keys(TEST_LABELS) as QTest[]).map((k) => <option key={k} value={k}>{TEST_LABELS[k]}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Post test (three or more groups)</span>
        <select value={o.comparisons} disabled={readOnly} aria-label="Post test"
          onChange={(e) => set({ comparisons: e.target.value as PostTest })}>
          <option value="dunnett">Dunnett: each group vs the calibrator</option>
          <option value="tukey">Tukey: every pair</option>
          <option value="bonferroni">Bonferroni</option>
          <option value="sidak">Šidák</option>
        </select>
      </label>
      <label className="field">
        <span>Confidence level</span>
        <select value={o.ciLevel} disabled={readOnly} onChange={(e) => set({ ciLevel: Number(e.target.value) })}>
          <option value={0.9}>90%</option><option value={0.95}>95%</option><option value={0.99}>99%</option>
        </select>
      </label>
    </div>
  );
}

// ------------------------------------------------------------ wizard

function QpcrWizard({ start, table, options, hasOutputs, onClose, onFinish }: {
  start: number; table: DataTableModel; options: QpcrOptions; hasOutputs: boolean;
  onClose: () => void; onFinish: (o: QpcrOptions, t: DataTableModel | null) => void;
}) {
  const [o, setO] = useState(options);
  const [nt, setNt] = useState<DataTableModel | null>(null);
  const t = nt ?? table;
  const set = (patch: Partial<QpcrOptions>) => setO((p) => ({ ...p, ...patch }));
  const d = readQpcr(t, o);
  const refs = referenceGenes(o, d.targets);
  const resolved = d.idx;
  const curveTargets = Object.entries(d.curves).filter(([, p]) => p.length >= 3).map(([k]) => k);
  return (
    <Wizard title="qPCR relative quantification" start={start} onClose={onClose}
      finishLabel={hasOutputs ? "Save settings" : "Create the ΔCq table"}
      onFinish={() => onFinish(o, nt)}
      steps={[
        {
          id: "data", title: "Cq data", blocker: d.problem,
          render: () => (
            <>
              <CqImport onTable={(table2) => { setNt(table2); set({ columns: {} }); }} />
              <h4>Columns</h4>
              <ColumnPicker table={t} specs={QPCR_ROLES} choice={o.columns} resolved={resolved}
                onChange={(columns) => set({ columns })} />
              <p className="hint-block">
                {d.records.length} wells: {new Set(d.records.map((r) => r.sample)).size} samples,
                targets {d.targets.join(", ") || "none"}; groups {d.groups.join(", ") || "none"}.
                Technical replicate wells of one sample and target are averaged.
              </p>
            </>
          ),
        },
        {
          id: "ref", title: "Reference and calibrator",
          blocker: refs.length ? (refs.length === d.targets.length ? "Leave at least one target that is not a reference gene." : null)
            : "Tick the reference gene(s).",
          render: () => <RefFields o={o} set={set} targets={d.targets} groups={d.groups} />,
        },
        {
          id: "eff", title: "Efficiencies",
          render: () => (
            <>
              <fieldset className="field-radios">
                <legend>Amplification efficiency</legend>
                <label><input type="radio" name="eff-mode" checked={o.efficiencyMode === "assumed"}
                  onChange={() => set({ efficiencyMode: "assumed" })} /> Assume 100% (E = 2) for every target: classic 2^−ΔΔCq</label>
                <label><input type="radio" name="eff-mode" checked={o.efficiencyMode === "entered"}
                  onChange={() => set({ efficiencyMode: "entered" })} /> Enter a measured efficiency per target</label>
                <label><input type="radio" name="eff-mode" checked={o.efficiencyMode === "curve"}
                  onChange={() => set({ efficiencyMode: "curve" })} /> From a dilution series in the table (rows with a Quantity)</label>
              </fieldset>
              {o.efficiencyMode === "entered" && (
                <table className="mini-grid eff-table">
                  <thead><tr><th>Target</th><th>Efficiency (factor 1.8–2.2, or %)</th></tr></thead>
                  <tbody>
                    {d.targets.map((g) => (
                      <tr key={g}><th>{g}</th><td>
                        <input value={o.efficiencies[g] ?? ""} placeholder="2" aria-label={`Efficiency of ${g}`}
                          onChange={(e) => set({ efficiencies: { ...o.efficiencies, [g]: e.target.value } })} />
                      </td></tr>
                    ))}
                  </tbody>
                </table>
              )}
              {o.efficiencyMode === "curve" && (
                <p className="hint-block">
                  {curveTargets.length
                    ? `Dilution series found for ${curveTargets.join(", ")}: E = 10^(−1/slope) of Cq on log10 quantity.`
                    : "No dilution series yet: add rows with the target, its Cq and a Quantity (at least three points), and choose the Quantity column in step 1."}
                  {" "}Targets without a series keep E = 2.
                </p>
              )}
              <p className="wizard-explain">{MIQE_NOTE}</p>
            </>
          ),
        },
        {
          id: "qc", title: "QC and statistics",
          render: () => (
            <>
              <div className="wizard-row">
                <label className="field field-num"><span>Flag Cq above</span>
                  <input defaultValue={o.maxCq} inputMode="decimal" aria-label="Maximum Cq"
                    onBlur={(e) => { const v = Number(e.target.value); if (v > 0) set({ maxCq: v }); }} /></label>
                <label className="field field-num"><span>Replicate spread at most (cycles)</span>
                  <input defaultValue={o.maxSpread} inputMode="decimal" aria-label="Maximum replicate spread"
                    onBlur={(e) => { const v = Number(e.target.value); if (v > 0) set({ maxSpread: v }); }} /></label>
                <label className="field field-num"><span>Undetermined wells as Cq (blank = left out)</span>
                  <input defaultValue={o.undetermined} inputMode="decimal" aria-label="Undetermined Cq"
                    onBlur={(e) => set({ undetermined: e.target.value.trim() })} /></label>
                <label className="check-row">
                  <input type="checkbox" checked={o.excludeHighCq} onChange={(e) => set({ excludeHighCq: e.target.checked })} />
                  Leave out wells above the Cq limit
                </label>
              </div>
              <TestFields o={o} set={set} />
              <p className="wizard-explain">{MIQE_NOTE}</p>
            </>
          ),
        },
      ]} />
  );
}

function CqImport({ onTable }: { onTable: (t: DataTableModel) => void }) {
  const [text, setText] = useState("");
  const [fromName, setFromName] = useState(true);
  const [msg, setMsg] = useState("");
  const take = (m: string[][]) => {
    const recipe = recipeById("qpcr");
    if (recipe.detect(m) <= 0) {
      setMsg("No Cq table found: the export needs a header row with Sample, Target and Cq (or Ct) columns.");
      return;
    }
    const st = recipe.stage(m).staging;
    const t = tableFromStaging(st.columns.map((c) => c.name), st.rows, fromName);
    onTable(t);
    setMsg(`Read ${st.rows.length} wells.`);
  };
  return (
    <>
      <p className="hint-block">
        Paste or open an instrument export (Bio-Rad CFX, QuantStudio, LightCycler …) or type
        the records into the table: one row per well with sample, group, target and Cq.
      </p>
      <div className="wizard-row">
        <label className="field">
          <span>Cq export (.csv, .txt or .xlsx)</span>
          <input type="file" accept=".csv,.tsv,.txt,.xlsx,text/csv,text/plain" aria-label="Cq export file"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const bytes = new Uint8Array(await f.arrayBuffer());
                if (/\.xlsx$/i.test(f.name)) {
                  const sheets = await readXlsx(bytes);
                  take((sheets[0]?.rows as unknown[][] ?? []).map((r) => r.map((c) => (c == null ? "" : String(c)))));
                } else take(parseSource(new TextDecoder("utf-8").decode(bytes)));
              } catch (err) {
                setMsg(`Could not read the file: ${err instanceof Error ? err.message : String(err)}`);
              }
            }} />
        </label>
        <label className="check-row">
          <input type="checkbox" checked={fromName} onChange={(e) => setFromName(e.target.checked)} />
          Group = sample name without its trailing number (when the export has no group column)
        </label>
      </div>
      <label className="field">
        <span>…or paste it</span>
        <textarea className="wizard-paste" value={text} aria-label="Paste Cq export"
          placeholder={"Well,Sample,Target,Cq\nA1,Ctrl 1,GAPDH,18.2\n…"} onChange={(e) => setText(e.target.value)} />
      </label>
      <div className="assay-setup">
        <button type="button" disabled={!text.trim()} onClick={() => take(parseSource(text))}>Read pasted export</button>
        {msg && <span className="hint-block" role="status">{msg}</span>}
      </div>
    </>
  );
}

// ------------------------------------------------------------ results

const FLAG_TEXT: Record<string, string> = {
  replicate_spread: "replicates spread", high_cq: "high Cq", undetermined: "undetermined well",
  all_undetermined: "all undetermined", undetermined_substituted: "undetermined replaced",
  single_replicate: "single well",
};

export function QpcrResults({ sheet, options: o, result: r }: ResultsProps<QpcrOptions, QpcrResult>) {
  const a = useAssay<QpcrOptions>(sheet);
  const [allReps, setAllReps] = useState(false);
  if (!r) return null;
  if (r.error) {
    return <div className="result-card assay-results"><h3>qPCR</h3><div className="results-error">{r.error}</div></div>;
  }
  const level = `${Math.round(o.ciLevel * 100)}%`;
  const reps: any[] = r.replicates ?? [];
  const shown = allReps ? reps : reps.filter((x) => x.flags?.length);
  return (
    <div className="result-card assay-results qpcr-results">
      <h3>qPCR relative quantification</h3>
      <p className="model-line">
        Reference: {(r.reference_genes ?? []).join(" + ")} (geometric mean); calibrator: {r.calibrator};
        {" "}{r.method}.
      </p>
      <Note>{MIQE_NOTE}</Note>

      {(r.per_target ?? []).map((pt: any) => {
        const st = pt.statistics;
        const sum = testSummary(st);
        return (
          <div key={pt.target} className="qpcr-target">
            <h4>{pt.target} (efficiency {num(pt.efficiency, 4)})</h4>
            <div className="results-scroll">
              <table className="results-table">
                <thead><tr><th scope="col">Group</th><th scope="col">n</th><th scope="col">Mean ΔCq</th>
                  <th scope="col">SD</th><th scope="col">ΔΔCq</th><th scope="col">Fold change</th>
                  <th scope="col">{level} CI</th><th scope="col">log2 fold change</th></tr></thead>
                <tbody>
                  {pt.groups.map((g: any) => (
                    <tr key={g.group}>
                      <th scope="row">{g.group}{g.group === r.calibrator ? " (calibrator)" : ""}</th>
                      <td>{g.n}</td><td>{num(g.mean_dcq)}</td><td>{num(g.sd_dcq)}</td><td>{num(g.mean_ddcq)}</td>
                      <td><strong>{num(g.fold_change)}</strong></td><td>{interval(g.fold_change_ci)}</td>
                      <td>{num(g.log2_fold_change)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sum ? (
              <>
                <KV rows={[
                  ["Test on ΔCq", sum.name],
                  ["Statistic", sum.statistic || "n/a"],
                  ["P value", pValue(sum.p)],
                ]} />
                {(st.comparisons ?? []).length > 0 && (
                  <div className="results-scroll">
                    <table className="results-table">
                      <thead><tr><th scope="col">Comparison</th><th scope="col">ΔΔCq</th>
                        <th scope="col">Fold change</th><th scope="col">{level} CI</th>
                        <th scope="col">P{(st.comparisons.length > 1) ? " (adjusted)" : ""}</th></tr></thead>
                      <tbody>
                        {st.comparisons.map((c: any) => (
                          <tr key={c.pair}><th scope="row">{c.pair}</th><td>{num(c.difference_dcq)}</td>
                            <td><strong>{num(c.fold_change)}</strong></td><td>{interval(c.fold_change_ci)}</td>
                            <td>{pValue(c.p_adjusted)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : <p className="hint-block">No test: {pt.statistics_note ?? "statistics turned off"}.</p>}
          </div>
        );
      })}

      <h4>Efficiencies</h4>
      <table className="results-table">
        <thead><tr><th scope="col">Target</th><th scope="col">E</th><th scope="col">%</th><th scope="col">Source</th>
          <th scope="col">Slope</th><th scope="col">R²</th></tr></thead>
        <tbody>
          {Object.entries(r.efficiencies ?? {}).map(([t, e]: [string, any]) => (
            <tr key={t}><th scope="row">{t}</th><td>{num(e.efficiency, 4)}</td><td>{num(e.efficiency_pct, 3)}</td>
              <td>{e.source}</td><td>{num(e.slope, 4)}</td><td>{num(e.r_squared, 4)}</td></tr>
          ))}
        </tbody>
      </table>

      <h4>Technical replicates ({r.n_flagged_replicate_sets ?? 0} of {reps.length} sets flagged)</h4>
      <label className="check-row">
        <input type="checkbox" checked={allReps} onChange={(e) => setAllReps(e.target.checked)} /> Show every set
      </label>
      {shown.length > 0 && (
        <div className="results-scroll">
          <table className="results-table">
            <thead><tr><th scope="col">Sample</th><th scope="col">Target</th><th scope="col">Cq values</th>
              <th scope="col">Mean</th><th scope="col">SD</th><th scope="col">Spread</th><th scope="col">Flags</th></tr></thead>
            <tbody>
              {shown.map((x) => (
                <tr key={`${x.sample}-${x.target}`} className={x.flags?.length ? "qc-row-fail" : ""}>
                  <th scope="row">{x.sample}</th><td>{x.target}</td>
                  <td>{(x.cq_values ?? []).map((v: number | null) => (v === null ? "und." : num(v))).join(", ")}</td>
                  <td>{num(x.mean_cq)}</td><td>{num(x.sd_cq)}</td><td>{num(x.spread)}</td>
                  <td className="flags">{x.flags?.length ? x.flags.map((f: string) => <Chip key={f} tone="warn">{FLAG_TEXT[f] ?? f}</Chip>) : <Chip tone="pass">ok</Chip>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h4>Per sample</h4>
      <div className="results-scroll">
        <table className="results-table">
          <thead><tr><th scope="col">Sample</th><th scope="col">Group</th><th scope="col">Target</th>
            <th scope="col">Mean Cq</th><th scope="col">ΔCq</th><th scope="col">ΔΔCq</th>
            <th scope="col">Relative quantity</th></tr></thead>
          <tbody>
            {(r.results ?? []).map((x: any) => (
              <tr key={`${x.sample}-${x.target}`}><th scope="row">{x.sample}</th><td>{x.group}</td><td>{x.target}</td>
                <td>{num(x.mean_cq)}</td><td>{num(x.dcq)}</td><td>{num(x.ddcq)}</td><td>{num(x.relative_quantity)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <Warnings items={r.warnings} />
      <h4>ΔCq table</h4>
      <LinkedOutputs outputs={a.outputs}
        onMake={a.outputs.length || sheet.frozen ? undefined : () => { void a.commit(o, null, specsFor(a.tableName)); }}
        makeLabel="Make the linked ΔCq table" />
    </div>
  );
}

// ------------------------------------------------------------ methods

export function QpcrMethods({ options: o, result: r }: ResultsProps<QpcrOptions, QpcrResult>) {
  if (!r || r.error) return null;
  const effs = Object.entries(r.efficiencies ?? {}) as [string, any][];
  const assumed = effs.every(([, e]) => String(e.source).startsWith("assumed"));
  const st = r.per_target?.[0]?.statistics;
  const test = testSummary(st)?.name;
  const text = `Technical replicate Cq values were averaged per sample and target (replicates more than `
    + `${o.maxSpread} cycles apart and Cq above ${o.maxCq} were flagged). Expression was normalised to `
    + `${(r.reference_genes ?? []).length > 1 ? `the geometric mean of ${r.reference_genes.join(" and ")}`
      : r.reference_genes?.[0]} and expressed relative to the ${r.calibrator} group `
    + (assumed
      ? "by the 2^−ΔΔCq method (Livak & Schmittgen 2001), assuming 100% amplification efficiency. "
      : `with efficiency correction (Pfaffl 2001; Hellemans et al. 2007; efficiencies ${effs
        .map(([t, e]) => `${t} ${Number((100 * (e.efficiency - 1)).toPrecision(3))}%`).join(", ")}). `)
    + `Statistics were computed on ΔCq values${test ? ` (${test.toLowerCase()}`
      + `${st?.multiple_comparisons ? `, ${o.comparisons === "dunnett" ? "Dunnett's" : o.comparisons} post test` : ""})` : ""}; `
    + `fold changes are shown with ${Math.round(o.ciLevel * 100)}% confidence intervals back-transformed `
    + `from the ΔCq scale (asymmetric), following MIQE 2.0 (Bustin et al. 2025). Analysed in OpenDose.`;
  return <CopyableMethods text={text} />;
}
