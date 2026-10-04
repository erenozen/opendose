import { softwareSentence } from "../../export/cite";
import { getRuntimeVersions } from "../../lib/engine";
import { formatPValue, pLabel, tableP } from "../../report/pformat";
import { formatSig } from "../../types";
import CopyableMethods from "../common/CopyableMethods";
import type { ControlsProps, ResultsProps } from "../types";
import type { LinregBlock, LinregOptions } from "./linreg";
import "./xy.css";

/* eslint-disable @typescript-eslint/no-explicit-any */

const fmtCI = (ci: [number, number] | null | undefined) =>
  (Array.isArray(ci) ? `${formatSig(ci[0])} to ${formatSig(ci[1])}` : "n/a");

export function LinregControls({ options, onChange, readOnly }: ControlsProps<LinregOptions>) {
  const set = (patch: Partial<LinregOptions>) => onChange({ ...options, ...patch });
  return (
    <div className="controls">
      <section>
        <h3>Linear regression</h3>
        <p className="hint-block">
          Fits a straight line, Y = Slope·X + Intercept, to each data set by least
          squares. Replicates are fitted as individual points.
        </p>
        <label className="check-row">
          <input type="checkbox" checked={options.throughOrigin} disabled={readOnly}
            onChange={(e) => set({ throughOrigin: e.target.checked })} />
          <span>Force the line through the origin (X = 0, Y = 0)</span>
        </label>
        {options.throughOrigin && (
          <p className="hint-block">
            Only when theory says Y must be 0 at X = 0. R² is then computed about Y = 0
            rather than about the mean.
          </p>
        )}
      </section>
      <section>
        <h3>Output</h3>
        <label className="check-row">
          <span>Bands</span>
          <select value={options.bands} disabled={readOnly}
            onChange={(e) => set({ bands: e.target.value as LinregOptions["bands"] })}>
            <option value="none">No bands</option>
            <option value="confidence">95% confidence band of the line</option>
            <option value="prediction">95% prediction band</option>
          </select>
        </label>
        <label className="check-row">
          <input type="checkbox" checked={options.runsTest} disabled={readOnly}
            onChange={(e) => set({ runsTest: e.target.checked })} />
          <span>Runs test (departure from linearity)</span>
        </label>
        <label className="check-row">
          <span>X at these Y values</span>
          <input className="antagonist-input" inputMode="decimal" disabled={readOnly}
            aria-label="Y values to read X from on the line" placeholder="e.g. 50, 100"
            value={options.xAtY} onChange={(e) => set({ xAtY: e.target.value })} />
        </label>
      </section>
    </div>
  );
}

function AnovaTable({ b }: { b: LinregBlock }) {
  const a = b.anova;
  return (
    <div className="anova-table-wrap">
      <table className="results-table anova-table">
        <caption className="sr-only">Regression ANOVA</caption>
        <thead>
          <tr>
            <th>ANOVA{a.uncentred ? " (about Y = 0)" : ""}</th>
            <th className="num">SS</th><th className="num">DF</th><th className="num">MS</th>
            <th className="num">F (DFn, DFd)</th><th className="num">P value</th>
          </tr>
        </thead>
        <tbody>
          {a.rows.map((r) => (
            <tr key={r.source}>
              <th>{r.source === "Total" && a.uncentred ? "Total (uncorrected)" : r.source}</th>
              <td className="num">{formatSig(r.ss)}</td>
              <td className="num">{r.df}</td>
              <td className="num">{r.ms === null ? "" : formatSig(r.ms)}</td>
              <td className="num">{r.source === "Regression"
                ? `F (${a.dfn}, ${a.dfd}) = ${formatSig(a.F)}` : ""}</td>
              <td className="num">{r.source === "Regression" ? tableP(a.p) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Card({ ds }: { ds: any }) {
  if (ds.error || !ds.linreg) {
    return (
      <div className="result-card">
        <h3>{ds.name}</h3>
        <div className="results-error">Could not fit: {String(ds.error ?? "no result")}</div>
      </div>
    );
  }
  const b = ds.linreg as LinregBlock;
  const row = (name: string, e: { value: number; se: number | null; ci95: [number, number] | null }) => (
    <tr key={name}>
      <th>{name}</th>
      <td>{formatSig(e.value)}</td>
      <td>{formatSig(e.se)}</td>
      <td>{fmtCI(e.ci95)}</td>
    </tr>
  );
  const derived = (name: string, v: number | null) => (
    <tr key={name}><th>{name}</th><td>{formatSig(v)}</td><td>n/a</td><td>n/a</td></tr>
  );
  const sig = (p: number | null) => (p === null ? "" : p < 0.05 ? "significant" : "not significant");
  return (
    <div className="result-card">
      <h3>{ds.name}</h3>
      <p className="model-line">
        {b.throughOrigin ? "Linear regression through the origin" : "Simple linear regression"}
        <br />
        <code>{b.equation}</code>
      </p>
      <table className="results-table">
        <thead>
          <tr><th /><th>Best-fit value</th><th>Std. Error</th><th>95% CI</th></tr>
        </thead>
        <tbody>
          {row("Slope", b.slope)}
          {b.intercept && row("Y intercept", b.intercept)}
          {b.intercept && derived("X intercept", b.xIntercept)}
          {derived("1/slope", b.oneOverSlope)}
        </tbody>
      </table>
      <table className="results-table goodness">
        <tbody>
          {b.throughOrigin ? (
            <>
              <tr><th>R squared (about Y = 0)</th><td>{formatSig(b.r2)}</td></tr>
              <tr><th>R squared (about the mean)</th><td>{formatSig(b.r2Centred)}</td></tr>
            </>
          ) : (
            <tr><th>R squared</th><td>{formatSig(b.r2)}</td></tr>
          )}
          <tr><th>Sy.x</th><td>{formatSig(b.syx)}</td></tr>
          <tr>
            <th>Is the slope significantly non-zero?</th>
            <td>F ({b.anova.dfn}, {b.anova.dfd}) = {formatSig(b.anova.F)}, {pLabel(b.anova.p)}
              {b.anova.p < 0.05 ? " (yes)" : " (no)"}</td>
          </tr>
          {b.runs && (
            <tr>
              <th>Runs test</th>
              <td>{b.runs.n_runs} runs, {b.runs.p === null ? "P = n/a" : pLabel(b.runs.p)}
                {b.runs.p !== null && `; deviation from linearity: ${sig(b.runs.p)}`}</td>
            </tr>
          )}
          <tr><th>Number of points (n)</th><td>{b.n}</td></tr>
          <tr><th>Degrees of freedom</th><td>{b.df}</td></tr>
        </tbody>
      </table>
      <AnovaTable b={b} />
      {b.throughOrigin && (
        <p className="hint-block">
          With the line forced through the origin, R² compares the fit with the line
          Y = 0 (1 − SS residual / ΣY², uncentred, as NIST and R&apos;s lm without an
          intercept compute it), and the ANOVA table uses sums of squares about zero.
          R² about the mean can be negative.
        </p>
      )}
      {b.xAtY.length > 0 && (
        <table className="results-table goodness">
          <thead><tr><th>Y</th><th>X on the line</th></tr></thead>
          <tbody>
            {b.xAtY.map((r, i) => (
              <tr key={i}><th>{formatSig(r.y)}</th><td>{formatSig(r.x)}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function LinregResults({ result }: ResultsProps<LinregOptions, any>) {
  if (!result) return null;
  if (result.error) return <div className="results-error">Analysis failed: {String(result.error)}</div>;
  return <div className="results">{result.datasets.map((ds: any, i: number) => <Card key={i} ds={ds} />)}</div>;
}

export function LinregMethods({ options, result }: ResultsProps<LinregOptions, any>) {
  if (!result || result.error) return null;
  const fits = (result.datasets ?? []).filter((d: any) => d.linreg);
  if (!fits.length) return null;
  const each = fits.map((d: any) => {
    const b = d.linreg as LinregBlock;
    return `${d.name}: slope ${formatSig(b.slope.value)} (95% CI ${fmtCI(b.slope.ci95)})`
      + (b.intercept ? `, Y intercept ${formatSig(b.intercept.value)}` : "")
      + `, R² ${formatSig(b.r2)}${b.throughOrigin ? " (about Y = 0)" : ""}, `
      + `F(${b.anova.dfn}, ${b.anova.dfd}) = ${formatSig(b.anova.F)}, ${formatPValue(b.anova.p)}`;
  }).join("; ");
  const text = `Data were analysed by ${options.throughOrigin
    ? "linear regression constrained through the origin (least squares; R² and the regression "
      + "ANOVA computed about Y = 0)"
    : "simple linear regression (least squares)"}, each data set fitted separately with `
    + `replicates as individual points; the slope was tested against zero by the regression F test`
    + `${options.runsTest ? ", and departure from linearity by the runs test" : ""}. ${each}. `
    + softwareSentence(getRuntimeVersions());
  return <CopyableMethods text={text} />;
}
