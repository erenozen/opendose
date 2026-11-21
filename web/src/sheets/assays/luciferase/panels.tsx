// Dual-luciferase reporter assay: controls (columns, control and blank
// groups, low-Renilla flag, test), the results sheet (the test on log
// ratios, fold change per group, per experiment and per well with flags)
// and methods text.
import CopyableMethods from "../../common/CopyableMethods";
import type { ControlsProps, ResultsProps } from "../../types";
import { interval, num, pValue, testSummary } from "../kit/format";
import { Chip, ColumnPicker, KV, LinkedOutputs, Note, Warnings } from "../kit/ui";
import { useAssay, type SpecsFor } from "../kit/useAssay";
import {
  blankOf, controlOf, L_TEST_LABELS, LUC_ROLES, ratioSettings, ratioTable, readWells, runLuc,
  sampleGroups, type LTest, type LucOptions, type LucResult,
} from "./model";

/* eslint-disable @typescript-eslint/no-explicit-any */

const specsFor = (tableName: string): SpecsFor<LucOptions> => (engine, table, o) => {
  const res = runLuc((p) => engine.analyze(p), table, o);
  const t = ratioTable(res);
  return t ? [{
    key: "ratios", name: `Luciferase ratios of ${tableName}`, table: t,
    configure: (prev: unknown) => ratioSettings(prev, t, res),
  }] : [];
};

const UNIT_NOTE = "Wells transfected together are technical replicates: they share the transfection, "
  + "so they agree more closely than independent experiments do. Record the experiment (independent "
  + "transfection) and each experiment is averaged, normalised to its own control and counted once, "
  + "which is what the P value should be about.";

// ------------------------------------------------------------ controls

export function LucControls({ sheet, table, options: o, readOnly }: ControlsProps<LucOptions>) {
  const a = useAssay<LucOptions>(sheet);
  const set = (patch: Partial<LucOptions>) => a.save({ ...o, ...patch });
  const d = readWells(table, o);
  const blank = blankOf(o, d.groups);
  const groups = sampleGroups(o, d.groups);
  return (
    <div className="controls assay-controls">
      <section>
        <h3>Dual-luciferase reporter</h3>
        <ColumnPicker table={table} specs={LUC_ROLES} choice={o.columns} resolved={d.idx} readOnly={readOnly}
          onChange={(columns) => set({ columns })} />
        <p className="hint-block">
          {d.records.length} wells; {d.experiments.length
            ? `${d.experiments.length} experiment${d.experiments.length === 1 ? "" : "s"}`
            : "no experiment column (wells are the unit)"}; groups {groups.join(", ") || "none"}.
        </p>
        {d.problem && <p className="wizard-blocker">{d.problem}</p>}
      </section>
      <section>
        <h3>Normalisation</h3>
        <div className="wizard-row">
          <label className="field">
            <span>Control group (fold change 1)</span>
            <select value={controlOf(o, d.groups)} disabled={readOnly} aria-label="Control group"
              onChange={(e) => set({ controlGroup: e.target.value })}>
              {groups.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Background (blank) wells</span>
            <select value={blank || "(none)"} disabled={readOnly} aria-label="Blank group"
              onChange={(e) => set({ blankGroup: e.target.value })}>
              <option value="(none)">None: use the readings as they are</option>
              {d.groups.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
          <label className="field field-num">
            <span>Flag Renilla below (% of the median well)</span>
            <input type="number" min={0} max={99} step={1} disabled={readOnly} aria-label="Low Renilla flag"
              defaultValue={Math.round(o.lowRenilla * 100)}
              onBlur={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v) && v >= 0 && v < 100) set({ lowRenilla: v / 100 });
              }} />
            <span className="field-note">0 turns the flag off</span>
          </label>
        </div>
        <p className="hint-block">
          Per well: (Firefly − blank Firefly) / (Renilla − blank Renilla), the blank being the mean of
          the background wells (of the same experiment when it has some). Fold changes are relative to
          the control group{d.experiments.length > 1 ? " of the same experiment" : ""}.
        </p>
      </section>
      <section>
        <h3>Statistics</h3>
        <div className="wizard-row">
          <label className="field">
            <span>Test</span>
            <select value={o.test} disabled={readOnly} aria-label="Luciferase test"
              onChange={(e) => set({ test: e.target.value as LTest })}>
              {(Object.keys(L_TEST_LABELS) as LTest[]).map((k) => <option key={k} value={k}>{L_TEST_LABELS[k]}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Post test (three or more groups)</span>
            <select value={o.comparisons} disabled={readOnly} aria-label="Post test"
              onChange={(e) => set({ comparisons: e.target.value as LucOptions["comparisons"] })}>
              <option value="dunnett">Dunnett: each group vs the control</option>
              <option value="tukey">Tukey: every pair</option>
              <option value="bonferroni">Bonferroni</option>
              <option value="sidak">Šidák</option>
            </select>
          </label>
        </div>
        <p className="hint-block">{UNIT_NOTE}</p>
      </section>
      <section>
        <h3>Ratio table</h3>
        <LinkedOutputs outputs={a.outputs}
          onMake={readOnly || d.problem || a.outputs.length ? undefined
            : () => { void a.commit(o, null, specsFor(a.tableName)); }}
          makeLabel="Make the linked ratio table"
          hint="Firefly / Renilla per experiment (or per well) and group, as a column table." />
      </section>
    </div>
  );
}

// ------------------------------------------------------------ results

const WELL_FLAGS: Record<string, string> = {
  missing_reading: "reading missing", firefly_not_above_background: "Firefly ≤ blank",
  renilla_not_above_background: "Renilla ≤ blank", low_renilla: "low Renilla",
};

export function LucResults({ sheet, options: o, result: r }: ResultsProps<LucOptions, LucResult>) {
  const a = useAssay<LucOptions>(sheet);
  if (!r) return null;
  if (r.error) {
    return <div className="result-card assay-results"><h3>Dual-luciferase reporter</h3><div className="results-error">{r.error}</div></div>;
  }
  const st = r.statistics;
  const sum = testSummary(st);
  const level = `${Math.round(o.ciLevel * 100)}%`;
  const byExp = r.unit === "experiment";
  const ratio = st?.geometric_mean_ratio ?? st?.ratio;
  const unitWord = byExp ? "Experiments" : "Wells";
  return (
    <div className="result-card assay-results luc-results">
      <h3>Dual-luciferase reporter</h3>
      <p className="model-line">
        {byExp ? `${r.n_units} experiments, each counted once` : `${r.n_units} wells, each counted as a replicate`};
        {" "}control: {r.control_group}; background: {r.blank_group
          ? `mean of the ${r.blank_group} wells (Firefly ${num(r.background?.firefly)}, Renilla ${num(r.background?.renilla)})`
          : "none subtracted"}.
      </p>
      {sum ? (
        <>
          <h4>{sum.name}</h4>
          <KV rows={[
            ...(st.names && ratio !== undefined
              ? [[`Ratio ${st.names[0]} / ${st.names[1]}`, <strong key="r">{num(ratio)}</strong>] as [string, React.ReactNode]]
              : []),
            ...(st.ci_ratio ? [[`${level} CI of the ratio`, interval(st.ci_ratio)] as [string, React.ReactNode]] : []),
            ["Statistic", sum.statistic || "n/a"],
            ["P value (two-tailed)", pValue(sum.p)],
          ]} />
          <p className="hint-block">{st.note}</p>
          {(st.comparisons ?? []).length > 0 && (
            <div className="results-scroll">
              <table className="results-table">
                <thead><tr><th scope="col">Comparison</th><th scope="col">Ratio</th><th scope="col">{level} CI</th>
                  <th scope="col">P (adjusted)</th></tr></thead>
                <tbody>
                  {st.comparisons.map((c: any) => (
                    <tr key={c.pair}><th scope="row">{c.pair}</th><td><strong>{num(c.ratio)}</strong></td>
                      <td>{interval(c.ratio_ci)}</td><td>{pValue(c.p_adjusted)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : <p className="hint-block">No test (needs a second group with at least two {byExp ? "experiments" : "wells"} each).</p>}
      {!byExp && <Note>{UNIT_NOTE}</Note>}

      <h4>Fold change vs {r.control_group} (geometric mean)</h4>
      <table className="results-table">
        <thead><tr><th scope="col">Group</th><th scope="col">{unitWord}</th><th scope="col">Geometric mean</th>
          <th scope="col">{level} CI</th></tr></thead>
        <tbody>
          {(r.group_summaries ?? []).map((g: any) => (
            <tr key={g.group}><th scope="row">{g.group}</th><td>{g.n}</td><td>{num(g.geometric_mean)}</td>
              <td>{byExp && g.group === r.control_group ? "reference (1)" : interval(g.ci)}</td></tr>
          ))}
        </tbody>
      </table>

      {byExp && (
        <>
          <h4>Per experiment</h4>
          <div className="results-scroll">
            <table className="results-table">
              <thead><tr><th scope="col">Experiment</th><th scope="col">Control ratio</th>
                {(r.groups ?? []).map((g: string) => <th key={g} scope="col">{g}</th>)}</tr></thead>
              <tbody>
                {(r.experiments ?? []).map((e: string) => {
                  const pe = r.per_experiment?.[e];
                  return (
                    <tr key={e}><th scope="row">{e}</th><td>{pe ? num(pe.denominator) : "no usable control"}</td>
                      {(r.groups ?? []).map((g: string) => <td key={g}>{pe ? num(pe.fold?.[g]) : ""}</td>)}</tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h4>Wells</h4>
      <div className="results-scroll">
        <table className="results-table">
          <thead><tr>{byExp && <th scope="col">Experiment</th>}<th scope="col">Well</th><th scope="col">Group</th>
            <th scope="col">Firefly − blank</th><th scope="col">Renilla − blank</th><th scope="col">Ratio</th>
            <th scope="col">Fold change</th><th scope="col">Flags</th></tr></thead>
          <tbody>
            {(r.wells ?? []).map((w: any, i: number) => (
              <tr key={i} className={w.flags?.length ? "qc-row-fail" : ""}>
                {byExp && <td>{w.experiment}</td>}<th scope="row">{w.well}</th><td>{w.group}</td>
                <td>{num(w.firefly_corrected)}</td><td>{num(w.renilla_corrected)}</td>
                <td>{num(w.ratio)}</td><td>{num(w.fold_change)}</td>
                <td className="flags">{w.flags?.length
                  ? w.flags.map((f: string) => <Chip key={f} tone={f === "low_renilla" ? "warn" : "fail"}>{WELL_FLAGS[f] ?? f}</Chip>)
                  : <Chip tone="pass">ok</Chip>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Warnings items={r.warnings} />
      <h4>Ratio table</h4>
      <LinkedOutputs outputs={a.outputs}
        onMake={a.outputs.length || sheet.frozen ? undefined : () => { void a.commit(o, null, specsFor(a.tableName)); }}
        makeLabel="Make the linked ratio table" />
    </div>
  );
}

// ------------------------------------------------------------ methods

export function LucMethods({ options: o, result: r }: ResultsProps<LucOptions, LucResult>) {
  if (!r || r.error) return null;
  const name = testSummary(r.statistics)?.name;
  const byExp = r.unit === "experiment";
  const level = Math.round(o.ciLevel * 100);
  const post = { dunnett: "Dunnett's", tukey: "Tukey's", bonferroni: "Bonferroni's", sidak: "Šidák's" }[o.comparisons];
  const text = `Firefly and Renilla luciferase activities were measured in each well`
    + (r.blank_group ? `; the mean of the ${r.blank_group} wells${byExp ? " of the same experiment" : ""} was `
      + `subtracted from both as background` : "")
    + `. Firefly activity was divided by Renilla activity in the same well`
    + (byExp ? `, the wells of each group were averaged within each experiment, and ratios were expressed `
      + `relative to the ${r.control_group} group of the same experiment`
      : `, and ratios were expressed relative to the geometric mean of the ${r.control_group} wells`)
    + `. ` + (name
      ? `Groups were compared on log10 ratios with a ${name.toLowerCase()}`
        + (r.statistics?.comparisons?.length ? ` followed by ${post} multiple comparisons` : "")
        + (byExp ? ` with experiment as the ${r.statistics?.test === "ratio_paired_t" ? "pairing unit" : "subject"} `
          + `(n = ${r.n_units} independent experiments)` : ` with wells as the unit (n = ${r.n_units} wells)`)
        + `, reporting ratios with ${level}% confidence intervals. ` : "")
    + `Fold changes are shown as geometric means on a log2 axis. Analysed in OpenDose.`;
  return <CopyableMethods text={text} />;
}
