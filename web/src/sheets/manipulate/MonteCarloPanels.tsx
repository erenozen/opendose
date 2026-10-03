// Monte Carlo analysis: settings with a chunked, cancellable run; the
// tabulated summary and methods text. The graph is MonteCarloHistogram.
import { useEffect, useMemo, useRef, useState } from "react";
import { useProject } from "../../app/context";
import { getEngine } from "../../lib/engine";
import { ANALYSIS_NONLIN } from "../../project/builtin";
import { findSheet, familyChildren } from "../../project/ops";
import type { DataSheet, DataTableModel, ResultsSheet } from "../../project/types";
import type { OptionsState } from "../../types";
import { DEFAULT_XY_OPTIONS, formatSig } from "../../types";
import type { ControlsProps, ResultsProps } from "../types";
import { MethodsCard } from "./panels";
import { SimFields } from "./SimulateForms";
import {
  analysisTemplate, defaultTabulate, MAX_REPEATS, MC_ANALYSES, numericPaths, pathLabel,
  probe, runMonteCarlo, simKindOf, type HitForm, type McAnalysis, type McOutput, type MonteCarloOptions,
  type Tabulated,
} from "./montecarlo";
import {
  defaultForm, randomSeed, simulationSentence, type SimForm,
} from "./simulate";
import "./manipulate.css";

/** The simulation a Monte Carlo sheet uses: its own, or its table's. */
function useSimulation(sheet: ResultsSheet, table: DataTableModel, o: MonteCarloOptions) {
  const { project } = useProject();
  const data = findSheet(project, sheet.parentId) as DataSheet | undefined;
  const own = data?.simulation;
  const kind = simKindOf(table);
  const fromTable = !o.simulation && !!own && own.kind === kind;
  const sim = o.simulation ?? (fromTable ? { kind, form: own!.form as SimForm }
    : { kind, form: defaultForm(kind) });
  return { sim, fromTable, tableHasSpec: !!own && own.kind === kind, own };
}

function fitOptions(project: ReturnType<typeof useProject>["project"], id: string): OptionsState | null {
  const s = id ? findSheet(project, id) : undefined;
  if (!s || s.kind !== "results" || s.analysis !== ANALYSIS_NONLIN) return null;
  return { ...DEFAULT_XY_OPTIONS, ...(s.options as Partial<OptionsState>) };
}

export function MonteCarloControls({ sheet, table, options: o, onChange, readOnly }:
  ControlsProps<MonteCarloOptions>) {
  const { project, engineReady } = useProject();
  const { sim, fromTable, tableHasSpec } = useSimulation(sheet, table, o);
  const set = (patch: Partial<MonteCarloOptions>) => onChange({ ...latest.current, ...patch });
  const latest = useRef(o);
  latest.current = o;
  const fits = familyChildren(project, sheet.parentId)
    .filter((s): s is ResultsSheet => s.kind === "results" && s.analysis === ANALYSIS_NONLIN);
  const fit = fitOptions(project, o.fitFrom);
  const template = useMemo(() => analysisTemplate(o, sim.kind, sim.form, fit),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [o.analysis, o.fitFrom, JSON.stringify(sim), JSON.stringify(fit)]);

  // ---- probe: one simulated data set, analyzed once, lists what can be tabulated
  const [paths, setPaths] = useState<string[] | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);
  const templateKey = JSON.stringify([template, sim]);
  useEffect(() => {
    if (!engineReady) return;
    let live = true;
    const timer = setTimeout(async () => {
      try {
        const engine = await getEngine();
        const res = probe(engine, sim.kind, sim.form, template, 12345);
        if (!live) return;
        const found = numericPaths(res);
        setPaths(found);
        setProbeError(null);
        if (!latest.current.tabulate.length && !readOnly) {
          const d = defaultTabulate(latest.current.analysis, found, sim.form, sim.kind);
          onChange({ ...latest.current, tabulate: d.tab, hit: d.hit,
            histogram: d.tab[0]?.label ?? "" });
        }
      } catch (e) {
        if (live) { setPaths(null); setProbeError(e instanceof Error ? e.message : String(e)); }
      }
    }, 300);
    return () => { live = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateKey, engineReady]);

  // ---- run
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const stop = useRef(false);
  useEffect(() => () => { stop.current = true; }, []);
  const n = Math.round(Number(o.nRepeats));
  const nOk = Number.isFinite(n) && n >= 1 && n <= MAX_REPEATS;
  const run = async () => {
    if (!nOk || !o.tabulate.length) return;
    setRunError(null);
    stop.current = false;
    const seed = /^\d+$/.test(o.seed.trim()) ? Number(o.seed.trim()) : randomSeed();
    const label = MC_ANALYSES[sim.kind].find((a) => a.id === o.analysis)?.label ?? o.analysis;
    setProgress({ done: 0, total: n });
    try {
      const engine = await getEngine();
      const output = await runMonteCarlo(engine, {
        kind: sim.kind, form: sim.form, template, tabulate: o.tabulate, hit: o.hit,
        n, seed, analysisLabel: label,
      }, (done) => setProgress({ done, total: n }), () => stop.current);
      set({ output });
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  };

  const labels = o.tabulate.map((t) => t.label);
  const setHit = (patch: Partial<HitForm>) => set({ hit: { ...o.hit, ...patch } });
  const addPath = (path: string) => {
    if (!path || o.tabulate.some((t) => t.path === path)) return;
    let label = pathLabel(path);
    while (labels.includes(label)) label += " ′";
    set({ tabulate: [...o.tabulate, { label, path }], histogram: o.histogram || label });
  };
  const renameTab = (i: number, label: string) => {
    const old = o.tabulate[i].label;
    const tab = o.tabulate.map((t, j) => (j === i ? { ...t, label } : t));
    const fix = (v: string) => (v === old ? label : v);
    set({ tabulate: tab, histogram: fix(o.histogram),
      hit: { ...o.hit, lower: fix(o.hit.lower), upper: fix(o.hit.upper), label: fix(o.hit.label) } });
  };
  const busy = !!progress;

  return (
    <div className="controls manip-controls mc-controls">
      <section>
        <h3>Simulation</h3>
        {tableHasSpec && (
          <fieldset className="field-radios">
            <legend>Simulate each data set with</legend>
            <label><input type="radio" name={`mcsim-${sheet.id}`} checked={fromTable}
              disabled={readOnly || busy} onChange={() => set({ simulation: null })} /> This table&apos;s simulation settings</label>
            <label><input type="radio" name={`mcsim-${sheet.id}`} checked={!fromTable}
              disabled={readOnly || busy} onChange={() => set({ simulation: sim })} /> Settings defined here</label>
          </fieldset>
        )}
        {!tableHasSpec && (
          <p className="hint-block">
            This table was not simulated, so the settings below describe the
            data sets to simulate.
          </p>
        )}
        {fromTable ? (
          <p className="hint-block">{simulationSentence({ ...sim, seed: 0 }).replace(/ \(random seed 0\)/, "")}</p>
        ) : (
          <details className="advanced" open={!tableHasSpec}>
            <summary>Simulation settings</summary>
            <section>
              <SimFields kind={sim.kind} form={sim.form} readOnly={readOnly || busy}
                onChange={(form) => set({ simulation: { kind: sim.kind, form } })} />
            </section>
          </details>
        )}
      </section>

      <section>
        <h3>Analysis to repeat</h3>
        <label className="field">
          <span>Analysis</span>
          <select value={o.analysis} disabled={readOnly || busy}
            onChange={(e) => set({ analysis: e.target.value as McAnalysis, tabulate: [], histogram: "",
              hit: { ...o.hit, kind: "none" }, output: null })}>
            {MC_ANALYSES[sim.kind].map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </label>
        {o.analysis === "dose_response" && (
          <label className="field">
            <span>Fit settings</span>
            <select value={o.fitFrom} disabled={readOnly || busy}
              onChange={(e) => set({ fitFrom: e.target.value })}>
              <option value="">Fit the simulated model, no constraints</option>
              {fits.map((f) => <option key={f.id} value={f.id}>Same settings as “{f.name}”</option>)}
            </select>
          </label>
        )}
        {probeError && <p className="results-error" role="alert">{probeError}</p>}
      </section>

      <section>
        <h3>Tabulate</h3>
        {o.tabulate.length === 0 && <p className="hint-block">Pick at least one value to collect from each repeat.</p>}
        <ul className="mc-tabs">
          {o.tabulate.map((t, i) => (
            <li key={t.path}>
              <input value={t.label} aria-label={`Name for ${t.path}`} readOnly={readOnly || busy}
                onChange={(e) => e.target.value.trim() && renameTab(i, e.target.value)} />
              <code className="mc-path" title={t.path}>{t.path}</code>
              <button type="button" className="icon-btn" disabled={readOnly || busy}
                aria-label={`Stop tabulating ${t.label}`}
                onClick={() => set({ tabulate: o.tabulate.filter((_, j) => j !== i) })}>✕</button>
            </li>
          ))}
        </ul>
        <label className="field">
          <span>Add a value</span>
          <select value="" disabled={readOnly || busy || !paths}
            onChange={(e) => addPath(e.target.value)}>
            <option value="">{paths ? "Choose a result value…" : "Finding result values…"}</option>
            {(paths ?? []).filter((p) => !o.tabulate.some((t) => t.path === p)).map((p) => (
              <option key={p} value={p}>{pathLabel(p)} · {p}</option>
            ))}
          </select>
        </label>
      </section>

      <section>
        <h3>Count hits</h3>
        <fieldset className="field-radios">
          <legend>A repeat is a hit when</legend>
          <label><input type="radio" name={`hit-${sheet.id}`} checked={o.hit.kind === "none"}
            disabled={readOnly || busy} onChange={() => setHit({ kind: "none" })} /> Do not count hits</label>
          <label><input type="radio" name={`hit-${sheet.id}`} checked={o.hit.kind === "contains"}
            disabled={readOnly || busy || labels.length < 2}
            onChange={() => setHit({ kind: "contains", lower: o.hit.lower || labels[1] || labels[0], upper: o.hit.upper || labels[2] || labels[0] })} /> An interval contains the true value</label>
          <label><input type="radio" name={`hit-${sheet.id}`} checked={o.hit.kind === "compare"}
            disabled={readOnly || busy || !labels.length}
            onChange={() => setHit({ kind: "compare", label: o.hit.label || labels[0] })} /> A value passes a threshold (e.g. P &lt; 0.05)</label>
        </fieldset>
        {o.hit.kind === "contains" && (
          <div className="field-row">
            <LabelSelect label="Lower limit" value={o.hit.lower} labels={labels} disabled={readOnly || busy}
              onChange={(lower) => setHit({ lower })} />
            <LabelSelect label="Upper limit" value={o.hit.upper} labels={labels} disabled={readOnly || busy}
              onChange={(upper) => setHit({ upper })} />
            <label className="field field-num">
              <span>True value</span>
              <input inputMode="decimal" value={o.hit.truth} readOnly={readOnly || busy}
                onChange={(e) => setHit({ truth: e.target.value })} />
            </label>
          </div>
        )}
        {o.hit.kind === "compare" && (
          <div className="field-row">
            <LabelSelect label="Value" value={o.hit.label} labels={labels} disabled={readOnly || busy}
              onChange={(label) => setHit({ label })} />
            <label className="field">
              <span>Is</span>
              <select value={o.hit.op} disabled={readOnly || busy}
                onChange={(e) => setHit({ op: e.target.value as HitForm["op"] })}>
                <option value="lt">less than</option>
                <option value="le">at most</option>
                <option value="gt">greater than</option>
                <option value="ge">at least</option>
              </select>
            </label>
            <label className="field field-num">
              <span>Threshold</span>
              <input inputMode="decimal" value={o.hit.threshold} readOnly={readOnly || busy}
                onChange={(e) => setHit({ threshold: e.target.value })} />
            </label>
          </div>
        )}
      </section>

      <section>
        <h3>Run</h3>
        <div className="field-row">
          <label className="field field-num">
            <span>Repeats (up to {MAX_REPEATS.toLocaleString()})</span>
            <input inputMode="numeric" value={o.nRepeats} readOnly={readOnly || busy}
              aria-invalid={!nOk} onChange={(e) => set({ nRepeats: e.target.value })} />
          </label>
          <label className="field field-num">
            <span>Random seed</span>
            <input inputMode="numeric" value={o.seed} placeholder="new" readOnly={readOnly || busy}
              onChange={(e) => set({ seed: e.target.value })} />
          </label>
          {labels.length > 1 && (
            <LabelSelect label="Histogram of" value={o.histogram || labels[0]} labels={labels}
              disabled={readOnly} onChange={(histogram) => set({ histogram })} />
          )}
        </div>
        {!nOk && <p className="field-note">Enter a whole number from 1 to {MAX_REPEATS}.</p>}
        <div className="mc-run">
          {busy ? (
            <>
              <progress max={progress.total} value={progress.done}
                aria-label="Monte Carlo progress" />
              <span className="mc-count" aria-live="polite">{progress.done} of {progress.total}</span>
              <button type="button" onClick={() => { stop.current = true; }}>Stop</button>
            </>
          ) : (
            <button type="button" className="btn-primary mc-run-btn"
              disabled={readOnly || !engineReady || !nOk || !o.tabulate.length}
              onClick={run}>{o.output ? "Run again" : "Run simulations"}</button>
          )}
        </div>
        <p className="hint-block">Each repeat simulates a fresh data set and analyzes it. Leave the seed blank for a new sequence every run.</p>
        {runError && <p className="results-error" role="alert">{runError}</p>}
      </section>
    </div>
  );
}

function LabelSelect({ label, value, labels, onChange, disabled }: {
  label: string; value: string; labels: string[]; onChange: (v: string) => void; disabled?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={labels.includes(value) ? value : ""} disabled={disabled}
        onChange={(e) => onChange(e.target.value)}>
        {!labels.includes(value) && <option value="">Choose…</option>}
        {labels.map((l) => <option key={l} value={l}>{l}</option>)}
      </select>
    </label>
  );
}

const f = (v: number | null | undefined) => (v === null || v === undefined ? "—" : formatSig(v));

export function MonteCarloResults({ result }: ResultsProps<MonteCarloOptions, McOutput | null>) {
  if (!result) {
    return (
      <div className="result-card empty-hint">
        Choose what to tabulate, then run the simulations. The summary of
        every repeat appears here, with a histogram above.
      </div>
    );
  }
  const r = result;
  return (
    <div className="result-card mc-results">
      <h3>Monte Carlo</h3>
      <p className="mc-summary">
        Repeats run: <strong className="mc-n">{r.nRepeats}</strong>
        {r.cancelled ? ` of ${r.nRequested} (stopped early)` : ""} · seed {r.seed} · {r.analysisLabel}
      </p>
      {r.nFailed > 0 && (
        <p className="hint-block">{r.nFailed} repeat{r.nFailed === 1 ? "" : "s"} failed and count as missing.</p>
      )}
      <div className="manip-preview" tabIndex={0} role="region" aria-label="Tabulated values">
        <table className="results-table mc-table">
          <thead>
            <tr>
              <th scope="col">Value</th><th scope="col">n</th><th scope="col">Mean</th>
              <th scope="col">SD</th><th scope="col">SEM</th><th scope="col">Median</th>
              <th scope="col">2.5th–97.5th percentile</th><th scope="col">Min</th><th scope="col">Max</th>
            </tr>
          </thead>
          <tbody>
            {r.labels.map((l) => {
              const s = r.summaries[l];
              return (
                <tr key={l}>
                  <th scope="row">{l}</th>
                  <td>{s.n}</td><td>{f(s.mean)}</td><td>{f(s.sd)}</td><td>{f(s.sem)}</td>
                  <td>{f(s.median)}</td>
                  <td>{s.n ? `${f(s.p2_5)} to ${f(s.p97_5)}` : "—"}</td>
                  <td>{f(s.min)}</td><td>{f(s.max)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {r.hits && (
        <>
          <h4>Hits</h4>
          <p>
            A hit: {r.hitText}.{" "}
            <strong>{r.hits.nHits}</strong> of {r.hits.nDecided} repeats
            {r.hits.fraction !== null && <> ({(100 * r.hits.fraction).toFixed(1)}%</>}
            {r.hits.ci[0] !== null && r.hits.ci[1] !== null && (
              <>; 95% CI {(100 * r.hits.ci[0]).toFixed(1)}% to {(100 * r.hits.ci[1]).toFixed(1)}%</>
            )}
            {r.hits.fraction !== null && ")"}.
          </p>
        </>
      )}
      {r.errors.length > 0 && (
        <details className="advanced">
          <summary>First errors</summary>
          <section><ul>{r.errors.map((e, i) => <li key={i}>{e}</li>)}</ul></section>
        </details>
      )}
    </div>
  );
}

export function MonteCarloMethods({ result }: ResultsProps<MonteCarloOptions, McOutput | null>) {
  if (!result) return null;
  const r = result;
  const sim = simulationSentence({ kind: r.simulation.kind, form: r.simulation.form, seed: r.seed })
    .replace(/ \(random seed \d+\)\.$/, ".");
  const hits = r.hits && r.hitText
    ? ` A repeat counted as a hit when ${r.hitText}; ${r.hits.nHits} of ${r.hits.nDecided} repeats were hits`
      + (r.hits.ci[0] !== null && r.hits.ci[1] !== null
        ? ` (${(100 * (r.hits.fraction ?? 0)).toFixed(1)}%, 95% CI ${(100 * r.hits.ci[0]).toFixed(1)}% to ${(100 * r.hits.ci[1]).toFixed(1)}%, Wilson/Brown).`
        : ".")
    : "";
  const text = `${sim} The simulation and the ${r.analysisLabel.toLowerCase()} were repeated `
    + `${r.nRepeats} times (Monte Carlo, random seed ${r.seed}), tabulating ${r.labels.join(", ")}.${hits}`;
  return <MethodsCard text={text} />;
}

export type { Tabulated };
