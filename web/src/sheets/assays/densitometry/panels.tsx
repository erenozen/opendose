// Western blot densitometry: controls with the setup wizard (export
// import with a column picker, control lanes, saturation, test), the
// results sheet (per-lane normalisation, per-blot fold changes, the ratio
// test with blot as the pairing unit, geometric means) and methods text.
import { useState } from "react";
import { readXlsx } from "../../../lib/engine";
import type { DataTableModel } from "../../../project/types";
import { parseSource } from "../../../share/recipes/presets";
import CopyableMethods from "../../common/CopyableMethods";
import type { ControlsProps, ResultsProps } from "../../types";
import { takeWizardRequest } from "../kit/create";
import { interval, num, pValue, testSummary } from "../kit/format";
import { Chip, ColumnPicker, KV, LinkedOutputs, Note, Warnings } from "../kit/ui";
import { useAssay, type SpecsFor } from "../kit/useAssay";
import Wizard from "../kit/Wizard";
import {
  controlOf, D_TEST_LABELS, DENS_ROLES, guessImport, matchedSettings, matchedTable, readLanes,
  runDens, tableFromExport, type DensOptions, type DensResult, type DRole, type DTest, type ImportMap,
} from "./model";

/* eslint-disable @typescript-eslint/no-explicit-any */

const specsFor = (tableName: string): SpecsFor<DensOptions> => (engine, table, o) => {
  const res = runDens((p) => engine.analyze(p), table, o);
  const t = matchedTable(res);
  return t ? [{
    key: "matched", name: `Normalised bands of ${tableName}`, table: t,
    configure: (prev: unknown) => matchedSettings(prev, t),
  }] : [];
};

const RATIO_NOTE = "The ratio paired t test asks whether the treated / control ratio is consistently "
  + "different from 1 across blots: it is a paired t test on the logarithms, with each blot as its "
  + "own pair, so blot-to-blot differences in exposure and transfer cancel. It reports the geometric "
  + "mean ratio with its confidence interval (GraphPad Prism statistics guide, “The ratio paired t "
  + "test”).";

const TRAP_NOTE = "Do not normalise the control to exactly 1 and then compare it with an unpaired t "
  + "test: the control column has SD 0, which the test misreads. Test the fold changes against 1 on "
  + "the log scale (one-sample t test of log fold changes), which equals the ratio paired t test.";

// ------------------------------------------------------------ controls

export function DensControls({ sheet, table, options: o, readOnly }: ControlsProps<DensOptions>) {
  const a = useAssay<DensOptions>(sheet);
  const [wizardAt, setWizardAt] = useState<number | null>(() => (takeWizardRequest(sheet.id) ? 0 : null));
  const set = (patch: Partial<DensOptions>) => a.save({ ...o, ...patch });
  const d = readLanes(table, o);
  return (
    <div className="controls assay-controls">
      <section>
        <h3>Western blot densitometry</h3>
        <div className="assay-setup">
          <button type="button" className="btn-primary" disabled={readOnly}
            onClick={() => setWizardAt(0)}>Open setup wizard…</button>
        </div>
        <p className="hint-block">
          {d.records.length} lanes on {d.blots.length} blot{d.blots.length === 1 ? "" : "s"};
          {" "}groups {d.groups.join(", ") || "none"}; control: {controlOf(o, d.groups) || "n/a"}.
        </p>
        {d.problem && <p className="wizard-blocker">{d.problem}</p>}
      </section>
      <section>
        <h3>Normalisation</h3>
        <NormFields o={o} set={set} d={d} readOnly={readOnly} />
      </section>
      <section>
        <h3>Statistics</h3>
        <DTestFields o={o} set={set} readOnly={readOnly} />
      </section>
      <section>
        <h3>Matched table</h3>
        <LinkedOutputs outputs={a.outputs}
          onMake={readOnly || d.problem || a.outputs.length ? undefined
            : () => { void a.commit(o, null, specsFor(a.tableName)); }}
          makeLabel="Make the linked matched table"
          hint="Normalised signal per blot (rows) and group (columns), set up for a ratio paired t test." />
      </section>
      {wizardAt !== null && (
        <DensWizard start={wizardAt} table={table} options={o} hasOutputs={a.outputs.length > 0}
          onClose={() => setWizardAt(null)}
          onFinish={(opts, nt) => { setWizardAt(null); void a.commit(opts, nt, specsFor(a.tableName)); }} />
      )}
    </div>
  );
}

function NormFields({ o, set, d, readOnly }: {
  o: DensOptions; set: (p: Partial<DensOptions>) => void; d: ReturnType<typeof readLanes>; readOnly?: boolean;
}) {
  return (
    <>
      <div className="wizard-row">
        <label className="field">
          <span>Control group (fold change 1)</span>
          <select value={controlOf(o, d.groups)} disabled={readOnly} aria-label="Control group"
            onChange={(e) => set({ controlGroup: e.target.value })}>
            {d.groups.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        <label className="field field-num">
          <span>Saturation limit (raw)</span>
          <input defaultValue={o.saturation} disabled={readOnly} inputMode="decimal" aria-label="Saturation limit"
            placeholder="65535" onBlur={(e) => set({ saturation: e.target.value.trim() })} />
          <span className="field-note">e.g. 65535 for 16-bit, 255 for 8-bit images</span>
        </label>
      </div>
      <fieldset className="field-radios">
        <legend>Within each blot, divide by</legend>
        <label><input type="radio" name="dens-control" checked={o.controlMode === "group"} disabled={readOnly}
          onChange={() => set({ controlMode: "group" })} /> The mean of the blot's control lanes (recommended)</label>
        <label><input type="radio" name="dens-control" checked={o.controlMode === "lane"} disabled={readOnly}
          onChange={() => set({ controlMode: "lane" })} /> One designated control lane per blot</label>
      </fieldset>
      {o.controlMode === "lane" && (
        <table className="mini-grid">
          <thead><tr><th>Blot</th><th>Control lane</th></tr></thead>
          <tbody>
            {d.blots.map((b) => (
              <tr key={b}><th>{b}</th><td>
                <input defaultValue={o.controlLanes[b] ?? ""} disabled={readOnly} aria-label={`Control lane of ${b}`}
                  onBlur={(e) => set({ controlLanes: { ...o.controlLanes, [b]: e.target.value.trim() } })} />
              </td></tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="hint-block">
        Per lane: (target − background) / (loading control − its background). A single control lane
        is fixed at exactly 1 and tends to inflate the variability (Degasperi et al. 2014); the mean
        of several control lanes does not.
      </p>
    </>
  );
}

function DTestFields({ o, set, readOnly }: {
  o: DensOptions; set: (p: Partial<DensOptions>) => void; readOnly?: boolean;
}) {
  return (
    <div className="wizard-row">
      <label className="field">
        <span>Test</span>
        <select value={o.test} disabled={readOnly} aria-label="Densitometry test"
          onChange={(e) => set({ test: e.target.value as DTest })}>
          {(Object.keys(D_TEST_LABELS) as DTest[]).map((k) => <option key={k} value={k}>{D_TEST_LABELS[k]}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Post test (three or more groups)</span>
        <select value={o.comparisons} disabled={readOnly}
          onChange={(e) => set({ comparisons: e.target.value as DensOptions["comparisons"] })}>
          <option value="dunnett">Dunnett: each group vs the control</option>
          <option value="tukey">Tukey: every pair</option>
          <option value="bonferroni">Bonferroni</option>
          <option value="sidak">Šidák</option>
        </select>
      </label>
    </div>
  );
}

// ------------------------------------------------------------ wizard

function DensWizard({ start, table, options, hasOutputs, onClose, onFinish }: {
  start: number; table: DataTableModel; options: DensOptions; hasOutputs: boolean;
  onClose: () => void; onFinish: (o: DensOptions, t: DataTableModel | null) => void;
}) {
  const [o, setO] = useState(options);
  const [nt, setNt] = useState<DataTableModel | null>(null);
  const t = nt ?? table;
  const set = (patch: Partial<DensOptions>) => setO((p) => ({ ...p, ...patch }));
  const d = readLanes(t, o);
  return (
    <Wizard title="Western blot densitometry" start={start} onClose={onClose}
      finishLabel={hasOutputs ? "Save settings" : "Create the matched table"}
      onFinish={() => onFinish(o, nt)}
      steps={[
        {
          id: "lanes", title: "Lanes", blocker: d.problem,
          render: () => (
            <>
              <ExportImport onTable={(x) => { setNt(x); set({ columns: {} }); }} />
              <h4>Columns of the table</h4>
              <ColumnPicker table={t} specs={DENS_ROLES} choice={o.columns} resolved={d.idx}
                onChange={(columns) => set({ columns })} />
              <p className="hint-block">{d.records.length} lanes on {d.blots.length} blots; groups {d.groups.join(", ") || "none"}.</p>
            </>
          ),
        },
        { id: "norm", title: "Normalisation", render: () => <NormFields o={o} set={set} d={d} /> },
        {
          id: "stats", title: "Statistics",
          render: () => (
            <>
              <DTestFields o={o} set={set} />
              <p className="wizard-explain">{RATIO_NOTE}</p>
              <p className="wizard-explain">{TRAP_NOTE}</p>
            </>
          ),
        },
      ]} />
  );
}

function ExportImport({ onTable }: { onTable: (t: DataTableModel) => void }) {
  const [src, setSrc] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [map, setMap] = useState<ImportMap | null>(null);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const load = (m: string[][]) => {
    const rows = m.filter((r) => r.some((c) => c.trim()));
    if (rows.length < 2) { setMsg("Need a header row and at least one lane."); return; }
    setSrc({ headers: rows[0], rows: rows.slice(1) });
    setMap(guessImport(rows[0]));
    setMsg(`${rows.length - 1} rows read: check the columns, then use them.`);
  };
  const roleSel = (k: DRole, label: string) => map && src && (
    <label key={k} className="field">
      <span>{label}</span>
      <select value={map.roles[k] ?? -1}
        onChange={(e) => setMap({ ...map, roles: { ...map.roles, [k]: Number(e.target.value) } })}>
        <option value={-1}>None</option>
        {src.headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
      </select>
    </label>
  );
  return (
    <>
      <p className="hint-block">
        Paste or open an ImageJ / Fiji (Analyze › Gels, Measure), Image Lab or Image Studio
        export, then say which column is which; or type the lanes into the table.
      </p>
      <div className="wizard-row">
        <label className="field">
          <span>Export (.csv, .txt or .xlsx)</span>
          <input type="file" accept=".csv,.tsv,.txt,.xls,.xlsx,text/csv,text/plain" aria-label="Densitometry export"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const bytes = new Uint8Array(await f.arrayBuffer());
                if (/\.xlsx$/i.test(f.name)) {
                  const sheets = await readXlsx(bytes);
                  load((sheets[0]?.rows as unknown[][] ?? []).map((r) => r.map((c) => (c == null ? "" : String(c)))));
                } else load(parseSource(new TextDecoder("utf-8").decode(bytes)));
              } catch (err) { setMsg(`Could not read the file: ${err instanceof Error ? err.message : String(err)}`); }
            }} />
        </label>
      </div>
      <label className="field">
        <span>…or paste it</span>
        <textarea className="wizard-paste" value={text} aria-label="Paste densitometry export"
          placeholder={"Blot,Lane,Group,Target,Actin\n1,1,Control,10234,20110\n…"} onChange={(e) => setText(e.target.value)} />
      </label>
      <div className="assay-setup">
        <button type="button" disabled={!text.trim()} onClick={() => load(parseSource(text))}>Read pasted export</button>
        {msg && <span className="hint-block" role="status">{msg}</span>}
      </div>
      {src && map && (
        <>
          <div className="column-picker">
            {roleSel("blot", "Blot")}
            {roleSel("lane", "Lane")}
            {roleSel("sample", "Sample")}
            {roleSel("group", "Group")}
            {roleSel("target", map.bandColumn >= 0 ? "Band signal" : "Target signal")}
            {map.bandColumn < 0 && roleSel("reference", "Loading control signal")}
            {roleSel("background", map.bandColumn >= 0 ? "Band background" : "Target background")}
            {map.bandColumn < 0 && roleSel("refBackground", "Loading-control background")}
          </div>
          <div className="wizard-row">
            <label className="field">
              <span>Rows are bands of different proteins (column)</span>
              <select value={map.bandColumn} onChange={(e) => setMap({ ...map, bandColumn: Number(e.target.value) })}>
                <option value={-1}>No: target and loading control share a row</option>
                {src.headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
              </select>
            </label>
            {map.bandColumn >= 0 && (
              <>
                <label className="field"><span>Target band is</span>
                  <input value={map.targetValue} onChange={(e) => setMap({ ...map, targetValue: e.target.value })} /></label>
                <label className="field"><span>Loading-control band is</span>
                  <input value={map.referenceValue} onChange={(e) => setMap({ ...map, referenceValue: e.target.value })} /></label>
              </>
            )}
            {(map.roles.blot ?? -1) < 0 && (
              <label className="field"><span>Blot name for every row</span>
                <input value={map.blotName} onChange={(e) => setMap({ ...map, blotName: e.target.value })} /></label>
            )}
          </div>
          <div className="assay-setup">
            <button type="button" className="btn-primary" onClick={() => {
              const t = tableFromExport(src.rows, map);
              onTable(t);
              setMsg(`Using ${t.x.length} lanes.`);
            }}>Use these columns</button>
          </div>
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------ results

const LANE_FLAGS: Record<string, string> = {
  target_saturated: "target saturated", reference_saturated: "loading control saturated",
  target_not_above_background: "target ≤ background", reference_not_above_background: "loading control ≤ background",
  no_reference: "no loading control",
};

export function DensResults({ sheet, options: o, result: r }: ResultsProps<DensOptions, DensResult>) {
  const a = useAssay<DensOptions>(sheet);
  if (!r) return null;
  if (r.error) {
    return <div className="result-card assay-results"><h3>Densitometry</h3><div className="results-error">{r.error}</div></div>;
  }
  const st = r.statistics;
  const sum = testSummary(st);
  const level = `${Math.round(o.ciLevel * 100)}%`;
  const ratio = st?.geometric_mean_ratio ?? st?.ratio ?? st?.geometric_mean;
  return (
    <div className="result-card assay-results dens-results">
      <h3>Western blot densitometry</h3>
      <p className="model-line">
        {r.n_blots_used} blot{r.n_blots_used === 1 ? "" : "s"} used; control: {r.control_group};
        {" "}normalised to the {Object.values(r.per_blot ?? {}).some((b: any) => b?.basis === "control lane")
          ? "designated control lane" : "mean of the control lanes"} of each blot.
      </p>
      {r.control_exactly_one && <Note warn>{TRAP_NOTE}</Note>}
      {sum ? (
        <>
          <h4>{sum.name}</h4>
          <KV rows={[
            ...(st.names && ratio !== undefined
              ? [[`Ratio ${st.names[0]} / ${st.names[1]} (geometric mean)`, <strong key="r">{num(ratio)}</strong>] as [string, React.ReactNode]]
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
          <Note>{RATIO_NOTE}</Note>
        </>
      ) : <p className="hint-block">No test (needs two or more blots and a second group).</p>}

      <h4>Fold change vs control (geometric mean over blots)</h4>
      <table className="results-table">
        <thead><tr><th scope="col">Group</th><th scope="col">Blots</th><th scope="col">Geometric mean</th>
          <th scope="col">{level} CI</th></tr></thead>
        <tbody>
          {(r.group_summaries ?? []).map((g: any) => (
            <tr key={g.group}><th scope="row">{g.group}</th><td>{g.n}</td><td>{num(g.geometric_mean)}</td>
              <td>{g.group === r.control_group ? "reference (1)" : interval(g.ci)}</td></tr>
          ))}
        </tbody>
      </table>

      <h4>Per blot</h4>
      <div className="results-scroll">
        <table className="results-table">
          <thead><tr><th scope="col">Blot</th><th scope="col">Divided by</th>
            {(r.groups ?? []).map((g: string) => <th key={g} scope="col">{g}</th>)}</tr></thead>
          <tbody>
            {(r.blots ?? []).map((b: string) => {
              const pb = r.per_blot?.[b];
              return (
                <tr key={b}><th scope="row">{b}</th>
                  <td>{pb ? `${num(pb.denominator)} (${pb.basis})` : "no usable control"}</td>
                  {(r.groups ?? []).map((g: string) => <td key={g}>{pb ? num(pb.fold?.[g]) : ""}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h4>Lanes</h4>
      <div className="results-scroll">
        <table className="results-table">
          <thead><tr><th scope="col">Blot</th><th scope="col">Lane</th><th scope="col">Group</th>
            <th scope="col">Target − bg</th><th scope="col">Loading − bg</th><th scope="col">Normalised</th>
            <th scope="col">Fold change</th><th scope="col">Flags</th></tr></thead>
          <tbody>
            {(r.lanes ?? []).map((l: any, i: number) => (
              <tr key={i} className={l.flags?.some((f: string) => f !== "no_reference") ? "qc-row-fail" : ""}>
                <th scope="row">{l.blot}</th><td>{l.lane}</td><td>{l.group}</td>
                <td>{num(l.target_corrected)}</td><td>{num(l.reference_corrected)}</td>
                <td>{num(l.normalized)}</td><td>{num(l.fold_change)}</td>
                <td className="flags">{l.flags?.length
                  ? l.flags.map((f: string) => <Chip key={f} tone={f === "no_reference" ? "info" : "fail"}>{LANE_FLAGS[f] ?? f}</Chip>)
                  : <Chip tone="pass">ok</Chip>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Warnings items={r.warnings} />
      <h4>Matched table</h4>
      <LinkedOutputs outputs={a.outputs}
        onMake={a.outputs.length || sheet.frozen ? undefined : () => { void a.commit(o, null, specsFor(a.tableName)); }}
        makeLabel="Make the linked matched table" />
    </div>
  );
}

// ------------------------------------------------------------ methods

export function DensMethods({ options: o, result: r }: ResultsProps<DensOptions, DensResult>) {
  if (!r || r.error) return null;
  const st = r.statistics;
  const name = testSummary(st)?.name;
  const single = o.controlMode === "lane" && Object.keys(o.controlLanes).length > 0;
  const text = `Band intensities were background-corrected and divided by the background-corrected `
    + `loading control of the same lane; within each blot, normalised values were expressed relative to `
    + `${single ? "a designated control lane" : `the mean of the ${r.control_group} lanes`}. `
    + `${o.saturation ? `Bands at or above ${o.saturation} (raw) were flagged as saturated. ` : ""}`
    + (name ? `Groups were compared with a ${name.toLowerCase()} with blot as the pairing unit `
      + `(${r.n_blots_used} blots), reporting the geometric mean ratio with its ${Math.round(o.ciLevel * 100)}% `
      + `confidence interval. ` : "")
    + `Fold changes are shown with the control at 1 on a log2 axis. Analysed in OpenDose.`;
  return <CopyableMethods text={text} />;
}
