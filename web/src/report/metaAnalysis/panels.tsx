// Controls, results sheet and methods text of "Combine experiments"
// (meta-analysis, P-92).
import "../../sheets/common/sheetKit.css";
import "../report.css";
import CopyableMethods from "../../sheets/common/CopyableMethods";
import { softwareSentence } from "../../export/cite";
import { getRuntimeVersions } from "../../lib/engine";
import type { ControlsProps, ResultsProps } from "../../sheets/types";
import { SUBCOLUMN_FORMAT_ENGINE } from "../../project/types";
import { SCALE_LABELS, type MetaOptions, type MetaScale } from "./run";
import {
  heterogeneityRows, intervalName, metaMethodsText, pctLevel, pooledRows, scaleIsRatio, studyRows,
  tau2Method,
} from "./format";

/* eslint-disable @typescript-eslint/no-explicit-any */

const LEVELS = [0.9, 0.95, 0.99];

export function MetaControls({ table, options: o, onChange }: ControlsProps<MetaOptions>) {
  const set = (patch: Partial<MetaOptions>) => onChange({ ...o, ...patch });
  const names = table.datasets.map((d, i) => d.name || `Data set ${i + 1}`);
  const fmt = SUBCOLUMN_FORMAT_ENGINE[table.subcolumnFormat];
  return (
    <div className="controls">
      <section>
        <h3>Experiments</h3>
        <p className="hint-block">
          One row per experiment: the estimate in Mean and its standard error in SEM, or
          the estimate with its CI limits. Row titles name the experiments.
        </p>
        {names.length > 1 && (
          <label className="check-row">
            <span>Data set</span>
            <select aria-label="Data set" value={Math.min(o.dataset, names.length - 1)}
              onChange={(e) => set({ dataset: Number(e.target.value) })}>
              {names.map((n, i) => <option key={i} value={i}>{n}</option>)}
            </select>
          </label>
        )}
        <label className="check-row">
          <span>Estimates are</span>
          <select aria-label="Estimates are" value={o.scale}
            onChange={(e) => set({ scale: e.target.value as MetaScale })}>
            {(Object.keys(SCALE_LABELS) as MetaScale[]).map((k) => (
              <option key={k} value={k}>{SCALE_LABELS[k]}</option>
            ))}
          </select>
        </label>
        {fmt === "mean_limits" && (
          <label className="check-row">
            <span>Limits entered</span>
            <select aria-label="Level of the entered limits" value={o.limitsLevel}
              onChange={(e) => set({ limitsLevel: Number(e.target.value) })}>
              {LEVELS.map((l) => <option key={l} value={l}>{Math.round(l * 100)}% CI</option>)}
            </select>
          </label>
        )}
      </section>
      <section>
        <h3>Random effects</h3>
        <label className="check-row">
          <span>Between-experiment variance</span>
          <select aria-label="Between-experiment variance" value={o.method}
            onChange={(e) => set({ method: e.target.value === "DL" ? "DL" : "REML" })}>
            <option value="REML">REML (restricted maximum likelihood)</option>
            <option value="DL">DerSimonian-Laird</option>
          </select>
        </label>
        <label className="check-row">
          <span>Confidence interval</span>
          <select aria-label="Pooled CI" value={o.test}
            onChange={(e) => set({ test: e.target.value === "z" ? "z" : "knha" })}>
            <option value="knha">Hartung-Knapp (t distribution)</option>
            <option value="z">Normal (z)</option>
          </select>
        </label>
        <label className="check-row">
          <span>Confidence level</span>
          <select aria-label="Confidence level" value={o.ciLevel}
            onChange={(e) => set({ ciLevel: Number(e.target.value) })}>
            {LEVELS.map((l) => <option key={l} value={l}>{Math.round(l * 100)}%</option>)}
          </select>
        </label>
        <p className="hint-block">
          With a handful of experiments the variance between them is estimated poorly; the
          Hartung-Knapp interval allows for that (IntHout et al. 2014, BMC Med Res Methodol
          14:25), the normal interval does not.
        </p>
      </section>
    </div>
  );
}

export function MetaResults({ result }: ResultsProps<MetaOptions, any>) {
  if (!result) return null;
  if (result.error) {
    return <div className="results-error">Analysis failed: {String(result.error)}</div>;
  }
  const ratio = scaleIsRatio(result.scale);
  const level = pctLevel(result.ci_level);
  const studies = studyRows(result);
  const pooled = pooledRows(result);
  const est = result.scale === "difference" ? "Estimate" : "Log ratio";
  return (
    <div className="result-card meta-results">
      <h3>Combined experiments{result.name ? `: ${result.name}` : ""}</h3>
      <p className="model-line">
        {result.k} experiments; τ² by {tau2Method(result)}; random-effects {level} CI by{" "}
        {intervalName(result)}{ratio ? "; ratios pooled on the natural log scale" : ""}.
      </p>
      <table className="results-table">
        <thead>
          <tr>
            <th>Experiment</th><th>{est}</th><th>SE</th>
            {ratio && <th>Ratio</th>}
            <th>{level} CI</th><th>Weight (random)</th><th>Weight (common)</th><th>P</th>
          </tr>
        </thead>
        <tbody>
          {studies.map((s, i) => (
            <tr key={i}>
              <th scope="row">{s.label}</th>
              <td className="num">{s.estimate}</td><td className="num">{s.se}</td>
              {ratio && <td className="num">{s.ratio}</td>}
              <td className="num">{s.ci}</td>
              <td className="num">{s.weightRandom}</td><td className="num">{s.weightFixed}</td><td />
            </tr>
          ))}
          {pooled.map((p) => (
            <tr key={p.label} className="derived">
              <th scope="row">{p.label}</th>
              <td className="num">{p.estimate}</td><td className="num">{p.se}</td>
              {ratio && <td className="num">{p.ratio}</td>}
              <td className="num">{p.ci}</td><td /><td /><td className="num">{p.p}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h4>Heterogeneity</h4>
      <table className="results-table">
        <tbody>
          {heterogeneityRows(result).map(([k, v]) => (
            <tr key={k}><th scope="row">{k}</th><td className="num">{v}</td></tr>
          ))}
        </tbody>
      </table>
      {(result.notes?.length > 0 || result.dropped?.length > 0) && (
        <ul className="model-line meta-notes">
          {(result.dropped ?? []).map((d: any) => (
            <li key={d.label}>{d.label} left out: {d.reason}.</li>
          ))}
          {(result.notes ?? []).map((n: string) => <li key={n}>{n.replace(/tau\^2/g, "τ²")}</li>)}
        </ul>
      )}
    </div>
  );
}

export function MetaMethods({ result }: ResultsProps<MetaOptions, any>) {
  if (!result || result.error) return null;
  return <CopyableMethods text={`${metaMethodsText(result)} ${softwareSentence(getRuntimeVersions())}`} />;
}

