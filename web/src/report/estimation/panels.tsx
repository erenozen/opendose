// Controls, results sheet and methods text of the estimation analysis.
import "../../sheets/common/sheetKit.css";
import "../report.css";
import CopyableMethods from "../../sheets/common/CopyableMethods";
import { formatSig } from "../../types";
import { softwareSentence } from "../../export/cite";
import { getRuntimeVersions } from "../../lib/engine";
import type { ControlsProps, ResultsProps } from "../../sheets/types";
import { tableP } from "../pformat";
import {
  DESIGN_LABELS, EFFECT_LABELS, type EstimationDesign, type EstimationEffect,
  type EstimationOptions,
} from "./run";

/* eslint-disable @typescript-eslint/no-explicit-any */

const LEVELS = [0.9, 0.95, 0.99];

export function EstimationControls({ table, options: o, onChange }: ControlsProps<EstimationOptions>) {
  const set = (patch: Partial<EstimationOptions>) => onChange({ ...o, ...patch });
  const names = table.datasets.map((d, i) => d.name || `Group ${i + 1}`);
  const grouped = table.type === "grouped";
  const paired = o.design === "repeated_baseline" || o.design === "repeated_sequential";
  return (
    <div className="controls">
      <section>
        <h3>Design</h3>
        {grouped ? (
          <p className="hint-block">
            Each row is compared on its own: the control data set against every other
            data set in that row (two groups per row give one comparison per row).
          </p>
        ) : (
          <label className="check-row">
            <span>Comparisons</span>
            <select aria-label="Design" value={o.design}
              onChange={(e) => set({ design: e.target.value as EstimationDesign })}>
              {(Object.keys(DESIGN_LABELS) as EstimationDesign[]).map((k) => (
                <option key={k} value={k}>{DESIGN_LABELS[k]}</option>
              ))}
            </select>
          </label>
        )}
        {!paired && o.design !== "multi_two_group" && (
          <label className="check-row">
            <span>Control group</span>
            <select aria-label="Control group" value={Math.min(o.controlIndex, Math.max(0, names.length - 1))}
              onChange={(e) => set({ controlIndex: Number(e.target.value) })}>
              {names.map((n, i) => <option key={i} value={i}>{n}</option>)}
            </select>
          </label>
        )}
        {paired && <p className="hint-block">Paired: values in the same row are the same subject; rows with a blank are left out of that comparison.</p>}
      </section>
      <section>
        <h3>Effect size and bootstrap</h3>
        <label className="check-row">
          <span>Effect size</span>
          <select aria-label="Effect size" value={o.effect}
            onChange={(e) => set({ effect: e.target.value as EstimationEffect })}>
            {(Object.keys(EFFECT_LABELS) as EstimationEffect[]).map((k) => (
              <option key={k} value={k}>{EFFECT_LABELS[k]}</option>
            ))}
          </select>
        </label>
        <label className="check-row">
          <span>Confidence interval</span>
          <select aria-label="CI type" value={o.ciType}
            onChange={(e) => set({ ciType: e.target.value === "percentile" ? "percentile" : "bca" })}>
            <option value="bca">Bias-corrected and accelerated (BCa)</option>
            <option value="percentile">Percentile</option>
          </select>
        </label>
        <label className="check-row">
          <span>Confidence level</span>
          <select aria-label="Confidence level" value={o.ciLevel}
            onChange={(e) => set({ ciLevel: Number(e.target.value) })}>
            {LEVELS.map((l) => <option key={l} value={l}>{Math.round(l * 100)}%</option>)}
          </select>
        </label>
        <label className="check-row">
          <span>Bootstrap resamples</span>
          <input type="number" aria-label="Bootstrap resamples" min={200} max={100000} step={1000}
            value={o.nBoot} onChange={(e) => set({ nBoot: Number(e.target.value) || 5000 })} />
        </label>
        <label className="check-row">
          <span>Random seed</span>
          <input type="number" aria-label="Random seed" min={0} step={1} value={o.seed}
            onChange={(e) => set({ seed: Number(e.target.value) || 0 })} />
        </label>
        <p className="hint-block">
          The same seed gives the same interval on every run, so a reported
          CI can be reproduced exactly.
        </p>
      </section>
    </div>
  );
}

const pct = (l: number) => `${Number((l * 100).toPrecision(4))}%`;

export function EstimationResults({ result }: ResultsProps<EstimationOptions, any>) {
  if (!result) return null;
  if (result.error) return <div className="results-error">Analysis failed: {String(result.error)}</div>;
  const comps: any[] = result.comparisons ?? [];
  const level = result.ci_level ?? 0.95;
  const ciName = result.ci_type === "percentile" ? "percentile" : "BCa";
  return (
    <div className="result-card estimation-results">
      <h3>Estimation: {result.plot?.kind === "cumming" ? "Cumming" : "Gardner-Altman"} plot data</h3>
      <p className="model-line">
        {result.paired ? "Paired" : "Unpaired"} {String(result.design).replace(/_/g, " ")};
        {" "}{result.n_resamples} bootstrap resamples (seed {String(result.seed)}); {pct(level)} {ciName} confidence intervals.
      </p>
      <table className="results-table">
        <thead>
          <tr>
            <th>Comparison</th><th>n</th><th>Effect size</th><th>Value</th>
            <th>{pct(level)} CI ({ciName})</th><th>Permutation P (two-sided)</th>
          </tr>
        </thead>
        <tbody>
          {comps.flatMap((c, i) => (c.effects ?? []).map((e: any, j: number) => (
            <tr key={`${i}:${j}`}>
              <th scope="row">{c.test} minus {c.control}</th>
              <td className="num">{c.n_test}, {c.n_control}</td>
              <td>{e.label}</td>
              <td className="num">{formatSig(e.difference)}</td>
              <td className="num">{Array.isArray(e.ci) ? `${formatSig(e.ci[0])} to ${formatSig(e.ci[1])}` : "n/a"}</td>
              <td className="num">{e.permutation ? `${tableP(e.permutation.p)}${e.permutation.exact ? " (exact)" : ""}` : "n/a"}</td>
            </tr>
          )))}
        </tbody>
      </table>
      <h4>Groups</h4>
      <table className="results-table">
        <thead><tr><th>Group</th><th>n</th><th>Mean</th><th>SD</th><th>Median</th><th>Q1 to Q3</th></tr></thead>
        <tbody>
          {(result.groups ?? []).map((g: any) => (
            <tr key={g.name}>
              <th scope="row">{g.name}</th><td>{g.n}</td><td>{formatSig(g.mean)}</td>
              <td>{formatSig(g.sd)}</td><td>{formatSig(g.median)}</td>
              <td>{formatSig(g.q1)} to {formatSig(g.q3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {comps.some((c) => c.effects?.some((e: any) => e.note)) && (
        <p className="model-line">{comps.flatMap((c) => c.effects?.map((e: any) => e.note)).filter(Boolean).join(" ")}</p>
      )}
    </div>
  );
}

export function EstimationMethods({ result }: ResultsProps<EstimationOptions, any>) {
  if (!result || result.error) return null;
  const effect = EFFECT_LABELS[result.effects?.[0] as EstimationEffect] ?? "Mean difference";
  const ci = result.ci_type === "percentile" ? "percentile" : "bias-corrected and accelerated (BCa; Efron 1987)";
  const text = `${effect}s between groups were estimated with their ${Math.round((result.ci_level ?? 0.95) * 100)}% confidence intervals `
    + `from ${result.n_resamples} bootstrap resamples (${ci} intervals; random seed ${result.seed}) and shown as `
    + `${result.plot?.kind === "cumming" ? "a Cumming estimation plot" : "a Gardner-Altman estimation plot"} `
    + `(Ho, Tumkaya, Aryal, Choi & Claridge-Chang 2019, Nat Methods 16:565-566)`
    + `${result.paired ? ", pairing values by subject" : ""}. Two-sided P values come from a permutation test `
    + `(${result.n_permutations} reshuffles, or every arrangement when there are fewer) and are not corrected for multiple comparisons. `
    + softwareSentence(getRuntimeVersions());
  return <CopyableMethods text={text} />;
}
