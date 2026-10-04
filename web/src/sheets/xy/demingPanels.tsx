import { softwareSentence } from "../../export/cite";
import { getRuntimeVersions } from "../../lib/engine";
import { formatSig } from "../../types";
import { tableP } from "../../report/pformat";
import CopyableMethods from "../common/CopyableMethods";
import type { ControlsProps, ResultsProps } from "../types";
import type { DemingOptions } from "./deming";

/* eslint-disable @typescript-eslint/no-explicit-any */

const fmtP = (p: any) => tableP(p);
const Pv = (p: any) => (fmtP(p).startsWith("<") ? `P ${fmtP(p)}` : `P = ${fmtP(p)}`);
const fmtCI = (ci: any) => (Array.isArray(ci) ? `${formatSig(ci[0])} to ${formatSig(ci[1])}` : "n/a");

export function DemingControls({ options, onChange }: ControlsProps<DemingOptions>) {
  const set = (patch: Partial<DemingOptions>) => onChange({ ...options, ...patch });
  return (
    <div className="controls">
      <section>
        <h3>Deming regression</h3>
        <p className="hint-block">
          Fits a straight line when both X and Y are measured with error,
          as when two methods measure the same quantity. Each data set is
          fitted separately; replicates are fitted as individual points.
        </p>
      </section>
      <section>
        <h3>Errors in X and Y</h3>
        <fieldset className="field-radios">
          <legend className="sr-only">Error model</legend>
          <label>
            <input type="radio" name="deming-error" checked={options.errorModel === "equal"}
              onChange={() => set({ errorModel: "equal" })} />
            X and Y have the same SD of measurement error
          </label>
          <label>
            <input type="radio" name="deming-error" checked={options.errorModel === "lambda"}
              onChange={() => set({ errorModel: "lambda" })} />
            Ratio of the error variances, λ = (SD of X error / SD of Y error)²
          </label>
          <label>
            <input type="radio" name="deming-error" checked={options.errorModel === "sd"}
              onChange={() => set({ errorModel: "sd" })} />
            Enter the SD of the X errors and of the Y errors
          </label>
        </fieldset>
        {options.errorModel === "lambda" && (
          <label className="check-row">
            <span>λ</span>
            <input className="constraint-value" inputMode="decimal" aria-label="Lambda"
              value={options.lambda} onChange={(e) => set({ lambda: e.target.value })} />
          </label>
        )}
        {options.errorModel === "sd" && (
          <>
            <label className="check-row">
              <span>SD of X errors</span>
              <input className="constraint-value" inputMode="decimal" aria-label="SD of X errors"
                value={options.sdX} onChange={(e) => set({ sdX: e.target.value })} />
            </label>
            <label className="check-row">
              <span>SD of Y errors</span>
              <input className="constraint-value" inputMode="decimal" aria-label="SD of Y errors"
                value={options.sdY} onChange={(e) => set({ sdY: e.target.value })} />
            </label>
          </>
        )}
      </section>
      <section>
        <h3>Output</h3>
        <label className="check-row">
          <span>Standard errors</span>
          <select value={options.seMethod} aria-label="Standard error method"
            onChange={(e) => set({ seMethod: e.target.value as DemingOptions["seMethod"] })}>
            <option value="prism">Analytical (the statistics guide&apos;s method)</option>
            <option value="jackknife">Jackknife</option>
          </select>
        </label>
        <label className="check-row">
          <span>Report Y at X =</span>
          <input className="constraint-value" inputMode="decimal" placeholder="0"
            aria-label="Report Y at this X" value={options.x0}
            onChange={(e) => set({ x0: e.target.value })} />
        </label>
        <label className="check-row">
          <input type="checkbox" checked={options.compareIdentity}
            onChange={(e) => set({ compareIdentity: e.target.checked })} />
          <span>Test agreement with the line of identity (slope 1, intercept 0)</span>
        </label>
      </section>
    </div>
  );
}

function Card({ ds }: { ds: any }) {
  if (ds.error) {
    return (
      <div className="result-card">
        <h3>{ds.name}</h3>
        <div className="results-error">Could not fit: {ds.error}</div>
      </div>
    );
  }
  const f = ds.deming;
  const model = f.error_model === "equal" ? "equal X and Y error SDs"
    : `λ = ${formatSig(f.lambda)} (ratio of the X and Y error variances)`;
  const level = `${Math.round(100 * (f.ci_level ?? 0.95))}% CI`;
  const row = (name: string, e: any) => (
    <tr key={name}>
      <th>{name}</th>
      <td>{formatSig(e?.value)}</td>
      <td>{formatSig(e?.se)}</td>
      <td>{fmtCI(e?.ci)}</td>
    </tr>
  );
  return (
    <div className="result-card">
      <h3>{ds.name}</h3>
      <p className="model-line">
        Deming (Model II) linear regression, {model}; {f.se_method === "jackknife"
          ? "jackknife" : "analytical"} standard errors
        <br />
        <code>{f.equation}</code>
      </p>
      <table className="results-table">
        <thead>
          <tr><th /><th>Best-fit value</th><th>Std. Error</th><th>{level}</th></tr>
        </thead>
        <tbody>
          {row("Slope", f.slope)}
          {row("Y intercept", f.y_intercept)}
          <tr className="derived">
            <th>X intercept</th><td>{formatSig(f.x_intercept)}</td><td>n/a</td><td>n/a</td>
          </tr>
          {f.y_at_x0 && f.y_at_x0.x0 !== 0 && row(`Y at X = ${formatSig(f.y_at_x0.x0)}`, f.y_at_x0)}
        </tbody>
      </table>
      <table className="results-table goodness">
        <tbody>
          {f.slope_test && (
            <tr><th>Is the slope significantly non-zero?</th>
              <td>t = {formatSig(f.slope_test.t)}, df = {f.slope_test.df}, {Pv(f.slope_test.p)}</td></tr>
          )}
          {f.identity_test && (
            <>
              <tr><th>Slope vs. 1</th>
                <td>t = {formatSig(f.identity_test.slope_vs_1?.t)}, {Pv(f.identity_test.slope_vs_1?.p)}</td></tr>
              <tr><th>Intercept vs. 0</th>
                <td>t = {formatSig(f.identity_test.intercept_vs_0?.t)}, {Pv(f.identity_test.intercept_vs_0?.p)}</td></tr>
            </>
          )}
          <tr><th>Degrees of freedom</th><td>{f.df}</td></tr>
          <tr><th># of points analyzed</th><td>{f.n}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

export function DemingResults({ result }: ResultsProps<DemingOptions, any>) {
  if (!result) return null;
  if (result.error) return <div className="results-error">Analysis failed: {String(result.error)}</div>;
  return <div className="results">{result.datasets.map((ds: any, i: number) => <Card key={i} ds={ds} />)}</div>;
}

export function DemingMethods({ options, result }: ResultsProps<DemingOptions, any>) {
  if (!result || result.error) return null;
  const fits = (result.datasets ?? []).filter((d: any) => d.deming);
  if (!fits.length) return null;
  const errors = options.errorModel === "equal" ? "assuming equal measurement error SDs for X and Y"
    : options.errorModel === "lambda" ? `with a ratio of error variances λ = ${options.lambda}`
      : `with error SDs of ${options.sdX} (X) and ${options.sdY} (Y)`;
  const each = fits.map((d: any) => `${d.name}: slope ${formatSig(d.deming.slope.value)} `
    + `(95% CI ${fmtCI(d.deming.slope.ci)}), Y intercept ${formatSig(d.deming.y_intercept.value)}`).join("; ");
  const text = `Data were fitted by Deming (Model II) linear regression ${errors}, with `
    + `${options.seMethod === "jackknife" ? "jackknife" : "analytical"} standard errors`
    + `${options.compareIdentity ? " and t tests of slope = 1 and intercept = 0" : ""}. ${each}. `
    + softwareSentence(getRuntimeVersions());
  return <CopyableMethods text={text} />;
}
