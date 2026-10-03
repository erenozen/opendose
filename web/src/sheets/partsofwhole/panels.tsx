// Controls, results sheets and methods text for the parts-of-whole
// analyses (fraction of total, chi-square goodness of fit).
import "../common/sheetKit.css";
import CopyableMethods from "../common/CopyableMethods";
import { fmtP, formatSig, levelPct, stars } from "../common/statFormat";
import type { ControlsProps, ResultsProps } from "../types";
import {
  CI_METHOD_LABELS, DIVIDE_BY_LABELS, EXPECTED_AS_LABELS, columnValues,
  datasetName, equalExpected, partNames,
  type CIMethodPow, type DivideBy, type ExpectedAs, type FractionOptions,
  type GofOptions,
} from "./run";

/* eslint-disable @typescript-eslint/no-explicit-any */

const CI_LEVELS = [0.9, 0.95, 0.99];

// ------------------------------------------------------- fraction of total

export function FractionControls({ options: o, onChange }: ControlsProps<FractionOptions>) {
  const set = (patch: Partial<FractionOptions>) => onChange({ ...o, ...patch });
  return (
    <div className="controls">
      <fieldset className="field-radios">
        <legend><h3>Divide each value by its</h3></legend>
        {(Object.keys(DIVIDE_BY_LABELS) as DivideBy[]).map((k) => (
          <label key={k}>
            <input type="radio" name="pow-divide" value={k}
              checked={o.divideBy === k} onChange={() => set({ divideBy: k })} />
            {DIVIDE_BY_LABELS[k].toLowerCase()}
          </label>
        ))}
      </fieldset>
      <section>
        <h3>Show as</h3>
        <select aria-label="Show fractions as" value={o.asPercent ? "percent" : "fraction"}
          onChange={(e) => set({ asPercent: e.target.value === "percent" })}>
          <option value="fraction">Fractions (0 to 1)</option>
          <option value="percent">Percentages</option>
        </select>
      </section>
      <section>
        <h3>Confidence intervals</h3>
        <label className="check-row">
          <input type="checkbox" checked={o.ci}
            onChange={(e) => set({ ci: e.target.checked })} />
          <span>Compute a confidence interval for each fraction</span>
        </label>
        {o.ci && (
          <>
            <label className="check-row">
              <span>Method</span>
              <select value={o.ciMethod}
                onChange={(e) => set({ ciMethod: e.target.value as CIMethodPow })}>
                {(Object.keys(CI_METHOD_LABELS) as CIMethodPow[]).map((k) => (
                  <option key={k} value={k}>{CI_METHOD_LABELS[k]}</option>
                ))}
              </select>
            </label>
            <label className="check-row">
              <span>Confidence level</span>
              <select value={o.ciLevel}
                onChange={(e) => set({ ciLevel: Number(e.target.value) })}>
                {CI_LEVELS.map((l) => <option key={l} value={l}>{levelPct(l)}</option>)}
              </select>
            </label>
            <p className="hint-block">
              Intervals treat each value as a count of subjects, so every value
              must be a whole number.
            </p>
          </>
        )}
      </section>
    </div>
  );
}

const fmtFrac = (v: unknown, pct: boolean) =>
  (typeof v === "number" ? `${formatSig(v)}${pct ? "%" : ""}` : "");

export function FractionResults({ table, result }:
  ResultsProps<FractionOptions, Record<string, any>>) {
  if (!result) return null;
  if (result.error) return <div className="results-error">{String(result.error)}</div>;
  const names = partNames(table);
  const cols: string[] = result.names ?? table.datasets.map((_, d) => datasetName(table, d));
  const pct = !!result.as_percent;
  const hasCI = Array.isArray(result.ci_lo);
  const divide = result.divide_by as DivideBy;
  const nRows = Math.max(0, ...result.fractions.map((c: unknown[]) => c.length));
  const unit = pct ? "percentages" : "fractions";
  return (
    <div className="result-card">
      <h3>Fraction of total</h3>
      <p className="model-line">
        Each value divided by its {DIVIDE_BY_LABELS[divide]?.toLowerCase() ?? divide},
        shown as {unit}
        {hasCI && <>, with {levelPct(result.ci_level)} confidence intervals
          ({CI_METHOD_LABELS[result.ci_method as CIMethodPow] ?? result.ci_method})</>}.
      </p>
      <table className="results-table fraction-table">
        <thead>
          <tr>
            <th scope="col">Part</th>
            {cols.map((c, j) => (
              hasCI
                ? [<th key={`${j}v`} scope="col">{c}</th>,
                   <th key={`${j}c`} scope="col">{levelPct(result.ci_level)} CI</th>]
                : <th key={j} scope="col">{c}</th>
            ))}
            {divide === "row" && <th scope="col">Row total</th>}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: nRows }, (_, i) => (
            <tr key={i}>
              <th scope="row">{names[i] ?? `Part ${i + 1}`}</th>
              {cols.map((_, j) => {
                const v = result.fractions[j]?.[i];
                const cell = <td key={`${j}v`}>{fmtFrac(v, pct)}</td>;
                if (!hasCI) return cell;
                const lo = result.ci_lo[j]?.[i];
                const hi = result.ci_hi[j]?.[i];
                return [cell, <td key={`${j}c`}>
                  {typeof lo === "number" && typeof hi === "number"
                    ? `${fmtFrac(lo, pct)} to ${fmtFrac(hi, pct)}` : ""}
                </td>];
              })}
              {divide === "row" && <td>{formatSig(result.row_totals?.[i])}</td>}
            </tr>
          ))}
          <tr className="total-row">
            <th scope="row">Column total</th>
            {cols.map((_, j) => (
              hasCI
                ? [<td key={`${j}v`}>{formatSig(result.column_totals?.[j])}</td>,
                   <td key={`${j}c`} />]
                : <td key={j}>{formatSig(result.column_totals?.[j])}</td>
            ))}
            {divide === "row" && <td>{formatSig(result.grand_total)}</td>}
          </tr>
        </tbody>
      </table>
      <p className="model-line">Grand total: {formatSig(result.grand_total)}</p>
    </div>
  );
}

export function FractionMethods({ options: o, result }:
  ResultsProps<FractionOptions, Record<string, any>>) {
  if (!result || result.error) return null;
  const by = { column: "its column total", row: "its row total",
               grand: "the grand total of the table" }[o.divideBy];
  let text = `Each value was divided by ${by} and expressed as a `
    + `${o.asPercent ? "percentage" : "fraction"} of the total`;
  if (o.ci) {
    const m = { wilson_brown: "the hybrid Wilson/Brown method",
                wilson: "the Wilson score method",
                clopper_pearson: "the exact Clopper-Pearson method" }[o.ciMethod];
    text += `; ${levelPct(o.ciLevel)} confidence intervals of each proportion `
      + `were computed by ${m}`;
  }
  text += ", using OpenDose (open-source, built on SciPy).";
  return <CopyableMethods text={text} />;
}

// ---------------------------------------------- chi-square goodness of fit

export function GofControls({ table, options: o, onChange }: ControlsProps<GofOptions>) {
  const set = (patch: Partial<GofOptions>) => onChange({ ...o, ...patch });
  const names = partNames(table);
  const d = Math.min(o.dataset, Math.max(0, table.datasets.length - 1));
  const obs = columnValues(table, d);
  const setExpected = (r: number, v: string) => {
    const next = Array.from({ length: Math.max(table.x.length, o.expected.length) },
      (_, i) => o.expected[i] ?? "");
    next[r] = v;
    set({ expected: next });
  };
  const entered = table.x.map((_, r) => Number(o.expected[r]))
    .filter((v, r) => obs[r] !== null && Number.isFinite(v) && (o.expected[r] ?? "").trim() !== "");
  const sum = entered.reduce((a, b) => a + b, 0);
  const total = obs.reduce<number>((a, v) => a + (v ?? 0), 0);
  const target = o.expectedAs === "percent" ? 100 : o.expectedAs === "fraction" ? 1 : total;
  const off = o.expectedMode === "entered" && entered.length > 0
    && Math.abs(sum - target) > 1e-6 * Math.max(1, target);

  return (
    <div className="controls">
      {table.datasets.length > 1 && (
        <section>
          <h3>Observed counts</h3>
          <label className="check-row">
            <span>Data set</span>
            <select value={d} onChange={(e) => set({ dataset: Number(e.target.value) })}>
              {table.datasets.map((_, i) => (
                <option key={i} value={i}>{datasetName(table, i)}</option>
              ))}
            </select>
          </label>
        </section>
      )}
      <fieldset className="field-radios">
        <legend><h3>Expected distribution</h3></legend>
        <label>
          <input type="radio" name="gof-mode" checked={o.expectedMode === "equal"}
            onChange={() => set({ expectedMode: "equal" })} />
          Every category equally likely
        </label>
        <label>
          <input type="radio" name="gof-mode" checked={o.expectedMode === "entered"}
            onChange={() => set({
              expectedMode: "entered",
              // Start from an equal split rather than an empty column.
              expected: o.expected.some((v) => v.trim()) ? o.expected
                : equalExpected(table, o),
            })} />
          Enter the expected values
        </label>
      </fieldset>
      {o.expectedMode === "entered" && (
        <section>
          <label className="check-row">
            <span>Entered as</span>
            <select value={o.expectedAs}
              onChange={(e) => set({ expectedAs: e.target.value as ExpectedAs })}>
              {(Object.keys(EXPECTED_AS_LABELS) as ExpectedAs[]).map((k) => (
                <option key={k} value={k}>{EXPECTED_AS_LABELS[k]}</option>
              ))}
            </select>
          </label>
          <table className="mini-grid">
            <thead>
              <tr><th scope="col">Category</th><th scope="col">Observed</th>
                <th scope="col">Expected</th></tr>
            </thead>
            <tbody>
              {table.x.map((_, r) => {
                const raw = o.expected[r] ?? "";
                const bad = raw.trim() !== "" && !(Number(raw) > 0);
                return (
                  <tr key={r}>
                    <th scope="row">{names[r]}</th>
                    <td className="num">{obs[r] ?? ""}</td>
                    <td>
                      <input inputMode="decimal" value={raw}
                        aria-label={`Expected value for ${names[r]}`}
                        aria-invalid={bad || undefined}
                        onChange={(e) => setExpected(r, e.target.value)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="inline-actions">
            <button type="button" onClick={() => set({ expected: equalExpected(table, o) })}>
              Fill equal
            </button>
            {entered.length > 0 && (
              <span className="field-note">
                Sum {formatSig(sum)}
                {off && <> (expected {formatSig(target)}; values are rescaled
                  to the observed total)</>}
              </span>
            )}
          </div>
        </section>
      )}
      <p className="hint-block">
        Compares the observed counts with the expected distribution. With
        two categories the exact binomial test is reported and recommended.
      </p>
    </div>
  );
}

export function GofResults({ options: o, result }:
  ResultsProps<GofOptions, Record<string, any>>) {
  if (!result) return null;
  if (result.error) return <div className="results-error">{String(result.error)}</div>;
  const cs = result.chi_square;
  const bin = result.binomial;
  const recBinomial = result.recommended === "binomial";
  const expectedLine = o.expectedMode === "equal"
    ? "every category equally likely"
    : `expected ${({ percent: "percentages", fraction: "fractions",
                     counts: "counts" } as const)[o.expectedAs]} as entered`;
  const cats: any[] = result.categories ?? [];
  const sumExp = cats.reduce((a, c) => a + c.expected, 0);
  const sumContrib = cats.reduce((a, c) => a + c.contribution, 0);
  return (
    <div className="result-card">
      <h3>Chi-square goodness of fit{result.name ? `: ${result.name}` : ""}</h3>
      <p className="model-line">
        {cats.length} categories, {formatSig(result.total)} observations; {expectedLine}.
      </p>
      <table className="results-table gof-table">
        <thead>
          <tr>
            <th scope="col">Category</th><th scope="col">Observed</th>
            <th scope="col">Observed %</th><th scope="col">Expected</th>
            <th scope="col">Expected %</th><th scope="col">Observed − expected</th>
            <th scope="col">Contribution to χ²</th>
          </tr>
        </thead>
        <tbody>
          {cats.map((c, i) => (
            <tr key={i}>
              <th scope="row">{c.name}</th>
              <td>{formatSig(c.observed)}</td>
              <td>{formatSig(100 * c.observed_fraction)}%</td>
              <td>{formatSig(c.expected)}</td>
              <td>{formatSig(100 * c.expected_fraction)}%</td>
              <td>{formatSig(c.difference)}</td>
              <td>{formatSig(c.contribution)}</td>
            </tr>
          ))}
          <tr className="total-row">
            <th scope="row">Total</th>
            <td>{formatSig(result.total)}</td><td>100%</td>
            <td>{formatSig(sumExp)}</td><td>100%</td><td />
            <td>{formatSig(sumContrib)}</td>
          </tr>
        </tbody>
      </table>
      {result.warning && (
        <p className="result-note result-note-warn" role="note">
          Some expected counts are below 5, so the chi-square P value is only
          approximate.
        </p>
      )}
      <table className="results-table goodness gof-tests">
        <tbody>
          <tr className={recBinomial ? "" : "recommended"}>
            <th>Chi-square, df</th>
            <td>χ² = {formatSig(cs.chi2)}, df = {cs.df}</td>
          </tr>
          <tr className={recBinomial ? "" : "recommended"}>
            <th>P value (chi-square)</th>
            <td>{fmtP(cs.p)} {stars(cs.p)}</td>
          </tr>
          {bin && (
            <>
              <tr className="recommended">
                <th>Binomial test, P (two-tailed)
                  <span className="rec-chip">recommended</span></th>
                <td>{fmtP(bin.p_two_tailed)} {stars(bin.p_two_tailed)}</td>
              </tr>
              <tr>
                <th>Binomial test, P (one-tailed)</th>
                <td>{fmtP(bin.p_one_tailed)}</td>
              </tr>
            </>
          )}
          <tr>
            <th>Differs from the expected distribution (α = 0.05)?</th>
            <td>{(recBinomial && bin ? bin.p_two_tailed : cs.p) < 0.05 ? "Yes" : "No"}</td>
          </tr>
        </tbody>
      </table>
      {recBinomial && bin && (
        <p className="result-note" role="note">
          With two categories the exact binomial test is recommended: it
          gives an exact P value (two-tailed by the method of small P
          values), while chi-square is an approximation.
        </p>
      )}
      {cats.length === 2 && bin === null && (
        <p className="result-note" role="note">
          The binomial test needs whole-number counts, so only chi-square is
          reported.
        </p>
      )}
      {o.expectedMode === "entered" && o.expectedAs === "counts"
        && Math.abs(result.expected_entered_sum - result.total) > 1e-6 * result.total && (
        <p className="result-note" role="note">
          The expected counts entered sum to {formatSig(result.expected_entered_sum)},
          not to the observed total; they were rescaled to it.
        </p>
      )}
    </div>
  );
}

export function GofMethods({ options: o, result }:
  ResultsProps<GofOptions, Record<string, any>>) {
  if (!result || result.error || !result.chi_square) return null;
  const cats: any[] = result.categories ?? [];
  const cs = result.chi_square;
  const exp = o.expectedMode === "equal"
    ? "equal expected proportions"
    : `the expected distribution entered as ${({ percent: "percentages",
        fraction: "fractions", counts: "counts" } as const)[o.expectedAs]}`;
  let text = `Observed counts in ${cats.length} categories `
    + `(${cats.map((c) => c.name).join(", ")}; n = ${formatSig(result.total)}) `
    + `were compared with ${exp} using the chi-square goodness-of-fit test `
    + `(df = ${cs.df}): χ²(${cs.df}) = ${formatSig(cs.chi2)}, P ${pText(cs.p)}`;
  if (result.binomial) {
    text += `. With two categories, the exact binomial test was also performed `
      + `(two-tailed P by the method of small P values): P ${pText(result.binomial.p_two_tailed)}`;
  }
  text += ". Analyses were performed with OpenDose (open-source, built on SciPy).";
  return <CopyableMethods text={text} />;
}

function pText(p: number): string {
  return p < 0.0001 ? "< 0.0001" : `= ${formatSig(p, 3)}`;
}
