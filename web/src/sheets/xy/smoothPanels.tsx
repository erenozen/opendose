// Parameter panel, results sheet and methods text of Smooth / spline
// (P-103). Options, payload and result mapping: ./smooth.ts.
import CopyableMethods from "../common/CopyableMethods";
import { NumberField } from "../../components/ui";
import { formatSig } from "../../types";
import type { ControlsProps, ResultsProps } from "../types";
import {
  SMOOTH_METHODS, smoothMethods, smoothProblems, smoothRows, type SmoothMethod, type SmoothOptions,
} from "./smooth";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function SmoothControls({ sheet, options: o, onChange, readOnly }: ControlsProps<SmoothOptions>) {
  const set = (p: Partial<SmoothOptions>) => onChange({ ...o, ...p });
  const problems = smoothProblems(o);
  return (
    <div className="controls">
      <section>
        <h3>Curve</h3>
        <fieldset className="field-radios">
          <legend className="sr-only">Smoothing method</legend>
          {SMOOTH_METHODS.map((m) => (
            <label key={m.id}>
              <input type="radio" name={`smooth-method-${sheet.id}`} checked={o.method === m.id} disabled={readOnly}
                onChange={() => set({ method: m.id as SmoothMethod })} />
              <span>{m.label}</span>
            </label>
          ))}
        </fieldset>
        <p className="hint-block">{SMOOTH_METHODS.find((m) => m.id === o.method)?.note}</p>
      </section>
      {o.method === "lowess" && (
        <section>
          <h3>LOWESS</h3>
          <NumberField label="Span f" min={0} max={1} step={0.05} value={o.span} placeholder="2/3"
            readOnly={readOnly} error={problems.span} fieldClassName="field-num"
            description="Fraction of the points in each local fit. Blank: 2/3, R's default."
            onValueChange={(span) => set({ span })} />
          <NumberField label="Robustness iterations" min={0} max={10} integer step={1} value={o.iterations}
            placeholder="3" readOnly={readOnly} error={problems.iterations} fieldClassName="field-num"
            description="Each one down-weights points far from the curve. Blank: 3, R's default."
            onValueChange={(iterations) => set({ iterations })} />
        </section>
      )}
      {o.method === "smoothing_spline" && (
        <section>
          <h3>Smoothness</h3>
          <fieldset className="field-radios">
            <legend className="sr-only">Choose the smoothness</legend>
            <label>
              <input type="radio" name={`smooth-spline-${sheet.id}`} checked={o.smoothing === "gcv"} disabled={readOnly}
                onChange={() => set({ smoothing: "gcv" })} />
              <span>By generalized cross-validation (GCV)</span>
            </label>
            <label>
              <input type="radio" name={`smooth-spline-${sheet.id}`} checked={o.smoothing === "df"} disabled={readOnly}
                onChange={() => set({ smoothing: "df" })} />
              <span>By equivalent degrees of freedom</span>
            </label>
          </fieldset>
          {o.smoothing === "df" && (
            <NumberField label="Degrees of freedom" min={2} step={1} value={o.df} readOnly={readOnly}
              error={problems.df} fieldClassName="field-num"
              description="2 is a straight line; the number of distinct X values passes through every mean."
              onValueChange={(df) => set({ df })} />
          )}
        </section>
      )}
    </div>
  );
}

function Card({ ds }: { ds: any }) {
  if (ds.error) {
    return (
      <div className="result-card">
        <h3>{ds.name}</h3>
        <div className="results-error">
          Could not draw a curve through “{ds.name}”: {String(ds.error).replace(/\.$/, "")}.
        </div>
      </div>
    );
  }
  const f = ds.smooth;
  const rows = smoothRows(f);
  return (
    <div className="result-card smooth-card">
      <h3>{ds.name}</h3>
      <p className="model-line">{f.label}</p>
      <div className="results-scroll">
        <table className="results-table goodness">
          <tbody>
            {rows.map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>)}
            <tr><th scope="row">Confidence interval</th><td>No model CI</td></tr>
          </tbody>
        </table>
      </div>
      {(f.notes ?? []).map((n: string) => <p key={n} className="hint-block">{n}</p>)}
      <h4>Curve at each X</h4>
      <div className="results-scroll">
        <table className="results-table smooth-values">
          <thead><tr><th scope="col">X</th><th scope="col">Mean Y</th><th scope="col">Curve</th></tr></thead>
          <tbody>
            {f.x.map((x: number, i: number) => (
              <tr key={i}><th scope="row">{formatSig(x)}</th><td>{formatSig(f.y_mean[i])}</td>
                <td>{formatSig(f.fitted[i])}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SmoothResults({ result }: ResultsProps<SmoothOptions, any>) {
  if (!result) return null;
  if (result.error) return <div className="results-error">Analysis failed: {String(result.error)}</div>;
  return (
    <div className="results">
      <p className="hint-block smooth-no-ci">
        {result.note} The curve describes these data; read numbers off it with care between widely spaced X
        values, and not beyond the first or last X.
      </p>
      {result.datasets.map((ds: any, i: number) => <Card key={i} ds={ds} />)}
    </div>
  );
}

export function SmoothMethods({ result }: ResultsProps<SmoothOptions, any>) {
  if (!result || result.error) return null;
  const text = smoothMethods(result);
  return text ? <CopyableMethods text={text} /> : null;
}
