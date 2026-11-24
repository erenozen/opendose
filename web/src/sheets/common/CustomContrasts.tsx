// Custom contrasts (P-83): the controls (the list and the "Custom
// contrast…" dialog) and the results table, shared by the one-way ANOVA
// (column tables) and the ordinary two-way ANOVA (grouped tables). Pure
// parts in customContrasts.ts.
import { useState } from "react";
import { Button, Field, Input, NumberField, useValidationTiming } from "../../components/ui";
import Modal from "../../components/Modal";
import { formatSig } from "../../types";
import {
  coefficientProblem, contrastText, defaultName, type CustomContrast,
} from "./customContrasts";
import { fmtCI, fmtP, levelPct } from "./statFormat";
import "./customContrasts.css";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

const MAXWELL = "Maxwell & Delaney 2004, Designing Experiments and Analyzing Data, ch. 4-5";

function ContrastDialog({ names, list, onAdd, onClose }: {
  names: string[]; list: CustomContrast[]; onAdd: (c: CustomContrast) => void; onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [coef, setCoef] = useState<string[]>(() => names.map(() => "0"));
  const [planned, setPlanned] = useState(true);
  const [tries, setTries] = useState(0);
  const values = coef.map((v) => {
    const t = v.trim().replace(",", ".").replace("−", "-");
    const n = t === "" ? NaN : Number(t);
    return Number.isFinite(n) ? n : null;
  });
  const problem = coefficientProblem(values);
  const shown = useValidationTiming(problem, tries);
  const submit = () => {
    setTries((t) => t + 1);
    if (problem) return;
    onAdd({ name: name.trim() || defaultName(list), coefficients: values as number[], planned });
  };
  return (
    <Modal title="Custom contrast" className="custom-contrast-dialog" onClose={onClose} onSubmit={submit}
      actions={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary">Add contrast</Button>
      </>}>
      <Field label="Name">
        <Input value={name} placeholder={defaultName(list)} autoComplete="off"
          onChange={(e) => setName(e.target.value)} />
      </Field>
      <p className="field-note">
        Coefficients that add up to 0 compare means: 1 and −1 compare two; −2, 1 and 1 compare one
        mean with the average of two; 0 leaves a mean out.
      </p>
      <div className="contrast-coefficients" onBlur={shown.onBlur}>
        {names.map((nm, i) => (
          <NumberField key={`${i}-${nm}`} label={`Coefficient: ${nm}`} value={coef[i]} step={1}
            fieldClassName="field-num"
            onValueChange={(v) => setCoef((c) => c.map((x, j) => (j === i ? v : x)))} />
        ))}
      </div>
      {/* the preview is read on demand; only a problem is announced */}
      {!problem && <p className="contrast-status">Contrast: {contrastText(values as number[], names)}</p>}
      <p className="contrast-status" role="status" aria-live="polite" data-problem={shown.problem ? "" : undefined}>
        {shown.problem ?? ""}
      </p>
      <fieldset className="field-radios">
        <legend>When was this contrast chosen?</legend>
        <label><input type="radio" name="contrast-kind" checked={planned}
          onChange={() => setPlanned(true)} /> Before seeing the data (planned: its own t test)</label>
        <label><input type="radio" name="contrast-kind" checked={!planned}
          onChange={() => setPlanned(false)} /> After looking at the results (post hoc: Scheffé&apos;s
          adjustment for every possible contrast)</label>
      </fieldset>
    </Modal>
  );
}

/** The list of contrasts with Remove, and the button that adds one. */
export function CustomContrastsControl({ names, value, onChange, readOnly, what = "group" }: {
  names: string[]; value: CustomContrast[]; onChange: (v: CustomContrast[]) => void;
  readOnly?: boolean; what?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="custom-contrasts">
      <p className="custom-contrasts-head">Custom contrasts</p>
      {value.length > 0 && (
        <ul className="custom-contrast-list">
          {value.map((c, i) => (
            <li key={`${i}-${c.name}`}>
              <span><strong>{c.name}</strong>: {contrastText(c.coefficients, names)}{" "}
                ({c.planned ? "planned" : "post hoc, Scheffé"})</span>
              <Button size="sm" disabled={readOnly} aria-label={`Remove ${c.name}`}
                onClick={() => onChange(value.filter((_, j) => j !== i))}>Remove</Button>
            </li>
          ))}
        </ul>
      )}
      <Button size="sm" disabled={readOnly || names.length < 2} onClick={() => setOpen(true)}>
        Custom contrast…</Button>
      <p className="hint-block">
        Type one coefficient per {what} mean. Label each contrast honestly: one chosen after looking at
        the results is adjusted by Scheffé&apos;s method, which covers every contrast you could have
        picked ({MAXWELL}).
      </p>
      {open && (
        <ContrastDialog names={names} list={value} onClose={() => setOpen(false)}
          onAdd={(c) => { onChange([...value, c]); setOpen(false); }} />
      )}
    </div>
  );
}

/** The engine's custom_contrasts block as a results table. */
export function CustomContrastsTable({ block }: { block: R | null | undefined }) {
  if (!block) return null;
  if (block.error) return <p className="results-error">Custom contrasts: {String(block.error)}</p>;
  const rows: R[] = Array.isArray(block.contrasts) ? block.contrasts : [];
  if (!rows.length) return null;
  const names: string[] = Array.isArray(block.names) ? block.names : [];
  const level = typeof block.ci_level === "number" ? block.ci_level : 0.95;
  const k = block.n_means;
  return (
    <section className="custom-contrasts-results" aria-label="Custom contrasts">
      <h4>Custom contrasts</h4>
      <div className="results-scroll">
        <table className="results-table">
          <caption className="sr-only">Custom contrasts</caption>
          <thead>
            <tr><th scope="col">Contrast</th><th scope="col">Chosen</th><th scope="col">Estimate</th>
              <th scope="col">SE</th><th scope="col">{levelPct(level)} CI</th><th scope="col">P value</th>
              <th scope="col">Adjustment</th></tr>
          </thead>
          <tbody>
            {rows.map((c, i) => (
              <tr key={i}>
                <th scope="row">{c.name}: {contrastText(c.coefficients ?? [], names)}</th>
                <td>{c.kind}</td>
                {c.error ? <td colSpan={5}>{c.error}</td> : <>
                  <td>{formatSig(c.estimate)}</td><td>{formatSig(c.se)}</td>
                  <td>{c.ci ? fmtCI(c.ci) : "—"}</td><td>{c.p == null ? "—" : fmtP(c.p)}</td>
                  <td>{c.note ?? (c.planned ? "none (planned)" : `Scheffé (${k - 1}, ${formatSig(c.df)} df)`)}</td>
                </>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint-block">
        Estimate = the sum of each coefficient times its mean; SE from the ANOVA&apos;s pooled residual
        ({formatSig(block.df_residual)} df). Planned contrasts are not adjusted. Post hoc contrasts use
        Scheffé&apos;s method: P from F = t² / {k - 1} on ({k - 1}, {formatSig(block.df_residual)}) df and a
        simultaneous interval, so looking at the data before choosing does not inflate the error rate
        ({MAXWELL}; Scheffé 1953, Biometrika 40:87).
      </p>
    </section>
  );
}
