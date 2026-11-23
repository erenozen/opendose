// Editor for a user-defined equation: the equation text (several lines,
// intermediate variables, <A>-style data-set lines), an initial-value rule
// and a default constraint per parameter, values to report (transforms of
// the parameters with their CI kind), live validation by the engine
// (validate_equation) with each error placed on its line and column, and
// "Save to my equations" (this browser's library).
import { useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import { analyzeAsync } from "../lib/engine";
import {
  CONSTRAINT_LABELS, deleteEquation, FOUR_PL_TEXT, guessParameters, materialize, noConstraint,
  RULE_SOURCE_LABELS, RULE_SOURCES, saveEquation, savedEquations, subscribeEquations,
  userEquationPayload,
  type ConstraintKind, type DefaultConstraint, type InitialRule, type RuleSource,
  type TransformCI, type UserEquationDef,
} from "../lib/userEquation";
import Modal from "./Modal";
import {
  Button, IconButton, notify, SwapLabel, useLabelSwap,
} from "./ui";
import { CloseIcon } from "./ui/feedbackIcons";
import "./modelPicker.css";

interface Problem {
  message: string; line: number | null; column: number | null;
  where?: string; item?: string | null;
}
interface Validation {
  ok: boolean;
  errors: Problem[];
  warnings: { message: string }[];
  parameters?: string[];
  intermediates?: string[];
}

const sameName = (a: string, b: string) => a.toUpperCase() === b.toUpperCase();

function useValidation(def: UserEquationDef, params: string[]): Validation | null {
  const [v, setV] = useState<Validation | null>(null);
  const key = JSON.stringify(userEquationPayload(materialize(def, params), params));
  useEffect(() => {
    if (!def.text.trim()) { setV(null); return; }
    let live = true;
    const timer = setTimeout(async () => {
      try {
        const r = await analyzeAsync({ analysis: "validate_equation", data: {},
          options: JSON.parse(key) }, { priority: "user" }) as Validation & { error?: string };
        if (!live) return;
        if (r.error) setV({ ok: false, errors: [{ message: r.error, line: null, column: null }], warnings: [] });
        else setV({ ...r, errors: r.errors ?? [], warnings: r.warnings ?? [] });
      } catch (err) {
        if (live) setV({ ok: false, errors: [{ message: String(err), line: null, column: null }], warnings: [] });
      }
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [key, def.text]);
  return v;
}

function HelpPanel() {
  return (
    <aside className="eq-help" aria-label="Equation syntax">
      <h3>Writing the equation</h3>
      <ul>
        <li>Define <code>Y</code> as a function of <code>X</code>: <code>Y = Bottom + (Top-Bottom)/(1+exp(-K*X))</code>.</li>
        <li>Names not assigned on the left of <code>=</code> are parameters to fit; names are not case-sensitive, use <code>_</code> instead of spaces.</li>
        <li>Several lines run top to bottom; a name first assigned is an intermediate variable. The last line defines <code>Y</code>.</li>
        <li><code>*</code> multiplies, <code>^</code> raises to a power; <code>[ ]</code> and <code>{"{ }"}</code> work as parentheses.</li>
        <li><code>;</code> starts a comment; <code>\</code> at the end of a line continues it.</li>
        <li><code>IF(condition, if_true, if_false)</code> with <code>= &lt;&gt; &lt; &gt; &lt;= &gt;=</code>, <code>AND</code>, <code>OR</code>, <code>NOT</code>.</li>
        <li>Prefix a line with <code>&lt;A&gt;</code> (first data set only), <code>&lt;~A&gt;</code> (all but A), <code>&lt;B:D&gt;</code> or <code>&lt;A,C&gt;</code> to fit different models to different data sets.</li>
      </ul>
      <h3>Functions</h3>
      <ul>
        <li><code>log()</code> is base 10, <code>ln()</code> natural; <code>exp</code>, <code>sqrt</code>, <code>sqr</code> (square), <code>abs</code>, <code>sin</code>, <code>cos</code>, <code>tan</code>, <code>arctan</code>, <code>min</code>, <code>max</code>, <code>int</code>, <code>erf</code>, <code>gamma</code>, <code>zdist</code>, <code>normdist</code>, …</li>
      </ul>
      <h3>Initial values</h3>
      <ul>
        <li>A number, or a multiple of a quantity read from each data set: YMIN, YMAX, XMID, X at YMID, the sign of the trend, slopes, the mean of the column titles.</li>
      </ul>
      <h3>Constraints</h3>
      <ul>
        <li><em>Constant equal to</em> with no value is an experimental constant you enter with each fit.</li>
        <li><em>Shared</em> parameters are fitted once for all data sets (a global fit).</li>
        <li><em>Data set constant</em>: one known value per data set, read from the data set&apos;s title unless you type it.</li>
      </ul>
      <h3>Values to report</h3>
      <ul>
        <li>Any expression of the parameters, e.g. <code>10^LogEC50</code> or <code>ln(2)/K</code>; <code>Y[x]</code> and <code>X[y]</code> read the curve. Asymmetrical CIs transform the parameter&apos;s CI.</li>
      </ul>
    </aside>
  );
}

export default function EquationEditor({ initial, onApply, onClose }: {
  initial: UserEquationDef;
  onApply: (def: UserEquationDef) => void;
  onClose: () => void;
}) {
  const [def, setDef] = useState<UserEquationDef>(initial);
  const [attempts, setAttempts] = useState(0);
  const savedSwap = useLabelSwap();
  const saved = useSyncExternalStore(subscribeEquations, savedEquations);
  const id = useId();
  const guessed = useMemo(() => guessParameters(def.text), [def.text]);
  const validation = useValidation(def, guessed);
  const params = validation?.ok && validation.parameters ? validation.parameters : guessed;
  const set = (patch: Partial<UserEquationDef>) => setDef((d) => ({ ...d, ...patch }));
  const full = materialize(def, params);
  const lines = def.text.split("\n");
  const textErrors = (validation?.errors ?? []).filter((e) => !e.where || e.where === "equation");
  const itemErrors = (validation?.errors ?? []).filter((e) => e.where && e.where !== "equation");
  const errorFor = (where: string, item: string) => itemErrors.find((e) => e.where === where
    && e.item != null && sameName(String(e.item), item));
  const valid = !!validation?.ok && !!def.text.trim();
  // Reward early, punish late: the engine checks as you type, but
  // a problem shows only once the field is left or "Use this equation" is
  // pressed; from then on it follows each change and clears once fixed.
  // The engine answers after the blur, so leaving a part (or a submit
  // attempt) arms it until the check comes back clean.
  const [leftText, setLeftText] = useState(false);
  const [leftItems, setLeftItems] = useState(false);
  const checkedClean = !!validation && !textErrors.length && !itemErrors.length;
  useEffect(() => {
    if (!validation) return;
    if (!textErrors.length) setLeftText(false);
    if (!itemErrors.length) setLeftItems(false);
  }, [validation, textErrors.length, itemErrors.length]);
  useEffect(() => { if (attempts) { setLeftText(true); setLeftItems(true); } }, [attempts]);
  const showText = leftText && textErrors.length > 0 && !checkedClean;
  const showItems = leftItems && itemErrors.length > 0;
  const verdict = !def.text.trim() || validation === null ? ""
    : textErrors.length ? (showText ? (textErrors.length === 1 ? "The equation has a problem:"
      : `The equation has ${textErrors.length} problems:`) : "")
      : itemErrors.length ? (showItems ? "Fix the rows marked below." : "") : "Equation is valid";
  const isSaved = !!def.id && saved.some((e) => e.id === def.id);

  const setRule = (p: string, r: Partial<InitialRule>) =>
    set({ rules: { ...full.rules, [p]: { ...full.rules[p], ...r } } });
  const setConstraint = (p: string, c: Partial<DefaultConstraint>) =>
    set({ constraints: { ...full.constraints, [p]: { ...(full.constraints[p] ?? noConstraint()), ...c } } });

  return (
    <Modal title="User-defined equation" className="modal-xwide" onClose={onClose}
      onSubmit={() => { if (valid) onApply(full); else setAttempts((n) => n + 1); }}
      actions={(
        <>
          <span className="eq-actions-left">
            <Button disabled={!def.text.trim()} onClick={() => {
              const s = saveEquation(full);
              setDef(s);
              savedSwap.flash(`Saved to my equations as “${s.name.trim() || "Untitled equation"}”`);
            }}>
              <SwapLabel swapped={savedSwap.swapped} done="Saved">
                {isSaved ? "Update in my equations" : "Save to my equations"}</SwapLabel>
            </Button>
            {isSaved && (
              <Button onClick={() => {
                const gone = full;
                deleteEquation(def.id);
                set({ id: "" });
                notify(`Removed “${gone.name.trim() || "Untitled equation"}” from my equations.`, {
                  tone: "success",
                  action: { label: "Undo", onAction: () => setDef(saveEquation(gone)) },
                });
              }}>Remove from my equations</Button>
            )}
          </span>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!def.text.trim()}>Use this equation</Button>
        </>
      )}>
      <div className="eq-editor">
        <div className="eq-main">
          <div className="eq-field">
            <label className="eq-label" htmlFor={`${id}-name`}>Name</label>
            <input id={`${id}-name`} className="eq-name" value={def.name}
              placeholder="e.g. Hill equation with baseline"
              onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div className="eq-field">
            <label className="eq-label" htmlFor={`${id}-text`}>Equation</label>
            <textarea id={`${id}-text`} className="eq-text" spellCheck={false}
              autoCapitalize="off" autoComplete="off"
              rows={Math.min(12, Math.max(4, lines.length + 1))}
              value={def.text} placeholder="Y = Bottom + (Top-Bottom)/(1+10^((LogEC50-X)*HillSlope))"
              aria-invalid={showText || undefined} aria-describedby={`${id}-status`}
              onBlur={() => setLeftText(true)}
              onChange={(e) => set({ text: e.target.value })} />
            <div id={`${id}-status`} className="eq-status">
              {/* The one spoken line: the verdict, never each keystroke's details. */}
              <p role="status" className={verdict === "Equation is valid" ? "eq-ok" : "eq-error"}>
                {verdict}</p>
              {!def.text.trim() ? (
                <span className="hint-block">
                  Write Y as a function of X.{" "}
                  <Button size="sm" onClick={() => set({
                    text: FOUR_PL_TEXT, xIsLog: true,
                    name: def.name || "Four-parameter logistic (my copy)",
                  })}>Start from the four-parameter logistic</Button>
                </span>
              ) : validation === null ? <span className="hint-block">Checking…</span>
                : textErrors.length ? showText && textErrors.map((p, i) => {
                  const src = p.line ? lines[p.line - 1] ?? "" : "";
                  return (
                    <div key={i} className="eq-error">
                      <span>{p.line ? `Line ${p.line}${p.column ? `, column ${p.column}` : ""}: ` : ""}{p.message}</span>
                      {p.column && src && (
                        <pre className="eq-caret" aria-hidden="true">
                          {src}{"\n"}{" ".repeat(Math.max(0, p.column - 1))}^
                        </pre>
                      )}
                    </div>
                  );
                }) : null}
            </div>
            <label className="check-row">
              <input type="checkbox" checked={def.xIsLog}
                onChange={(e) => set({ xIsLog: e.target.checked })} />
              <span>X in this equation is log(concentration) (concentrations are logged before fitting unless they already are)</span>
            </label>
          </div>

          <div className="eq-field" onBlur={() => setLeftItems(true)}>
            <span className="eq-section-title" id={`${id}-params`}>Parameters</span>
            {params.length === 0 ? (
              <p className="hint-block">Parameters appear here as you write the equation.</p>
            ) : (
              <table className="eq-table" aria-labelledby={`${id}-params`}>
                <thead>
                  <tr><th scope="col">Parameter</th><th scope="col">Initial value</th>
                    <th scope="col">Default constraint</th></tr>
                </thead>
                <tbody>
                  {params.map((p) => {
                    const r = full.rules[p];
                    const c = full.constraints[p] ?? noConstraint();
                    const bad = showItems && (errorFor("rules", p) || errorFor("constraints", p));
                    return (
                      <tr key={p} className={bad ? "eq-row-bad" : ""}>
                        <th scope="row">{p}</th>
                        <td>
                          <div className="eq-cells">
                            <input className="eq-num" inputMode="decimal" value={r.value}
                              aria-label={r.kind === "value" ? `${p} initial value` : `${p} multiplier`}
                              onChange={(e) => setRule(p, { value: e.target.value })} />
                            <select aria-label={`${p} initial value rule`}
                              value={r.kind === "value" ? "value" : `${r.op}${r.of}`}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v === "value") setRule(p, { kind: "value" });
                                else setRule(p, { kind: "rule", op: v[0] as "*" | "/", of: v.slice(1) as RuleSource });
                              }}>
                              <option value="value">(the value itself)</option>
                              {RULE_SOURCES.map((s) => (
                                <option key={s} value={`*${s}`}>× {RULE_SOURCE_LABELS[s]}</option>
                              ))}
                              {RULE_SOURCES.map((s) => (
                                <option key={`d${s}`} value={`/${s}`}>÷ {RULE_SOURCE_LABELS[s]}</option>
                              ))}
                            </select>
                          </div>
                        </td>
                        <td>
                          <div className="eq-cells">
                            <select aria-label={`${p} default constraint`} value={c.kind}
                              onChange={(e) => setConstraint(p, { kind: e.target.value as ConstraintKind })}>
                              {(Object.keys(CONSTRAINT_LABELS) as ConstraintKind[]).map((k) => (
                                <option key={k} value={k}>{CONSTRAINT_LABELS[k]}</option>
                              ))}
                            </select>
                            {c.kind === "constant" && (
                              <input className="eq-num" inputMode="decimal" value={c.value}
                                placeholder="at fit time" aria-label={`${p} constant value`}
                                onChange={(e) => setConstraint(p, { value: e.target.value })} />
                            )}
                            {(c.kind === "greater" || c.kind === "between") && (
                              <input className="eq-num" inputMode="decimal" value={c.min}
                                placeholder="min" aria-label={`${p} minimum`}
                                onChange={(e) => setConstraint(p, { min: e.target.value })} />
                            )}
                            {(c.kind === "less" || c.kind === "between") && (
                              <input className="eq-num" inputMode="decimal" value={c.max}
                                placeholder="max" aria-label={`${p} maximum`}
                                onChange={(e) => setConstraint(p, { max: e.target.value })} />
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {showItems && itemErrors.filter((e) => e.where !== "transforms").map((e, i) => (
              <p key={i} className="eq-error">{e.item ? `${e.item}: ` : ""}{e.message}</p>
            ))}
            {(validation?.warnings ?? []).filter((w) => !/no initial-value rule/.test(w.message))
              .map((w, i) => <p key={i} className="eq-warning">{w.message}</p>)}
          </div>

          <div className="eq-field">
            <span className="eq-section-title" id={`${id}-tr`}>Values to report (transforms of the parameters)</span>
            {def.transforms.length > 0 && (
              <table className="eq-table" aria-labelledby={`${id}-tr`}>
                <thead>
                  <tr><th scope="col">Name</th><th scope="col">Expression</th>
                    <th scope="col">Confidence interval</th><th><span className="sr-only">Remove</span></th></tr>
                </thead>
                <tbody>
                  {def.transforms.map((t, i) => {
                    const bad = showItems && errorFor("transforms", t.name);
                    const setT = (patch: Partial<typeof t>) => set({
                      transforms: def.transforms.map((x, j) => (j === i ? { ...x, ...patch } : x)),
                    });
                    return (
                      <tr key={i} className={bad ? "eq-row-bad" : ""}>
                        <td><input value={t.name} aria-label={`Value ${i + 1} name`} placeholder="EC50"
                          onChange={(e) => setT({ name: e.target.value })} /></td>
                        <td><input className="eq-expr" value={t.expr} aria-label={`Value ${i + 1} expression`}
                          placeholder="10^LogEC50" onChange={(e) => setT({ expr: e.target.value })} /></td>
                        <td>
                          <select value={t.ci} aria-label={`Value ${i + 1} confidence interval`}
                            onChange={(e) => setT({ ci: e.target.value as TransformCI })}>
                            <option value="asymmetrical">Asymmetrical (transform the CI)</option>
                            <option value="symmetrical">Symmetrical (from the SE)</option>
                            <option value="none">Do not calculate</option>
                          </select>
                        </td>
                        <td>
                          <IconButton size="sm" aria-label={`Remove value ${t.name || i + 1}`}
                            onClick={() => set({ transforms: def.transforms.filter((_, j) => j !== i) })}>
                            <CloseIcon /></IconButton>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {showItems && itemErrors.filter((e) => e.where === "transforms").map((e, i) => (
              <p key={i} className="eq-error">{e.item ? `${e.item}: ` : ""}{e.message}</p>
            ))}
            <div>
              <Button size="sm" onClick={() => set({
                transforms: [...def.transforms, { name: "", expr: "", ci: "asymmetrical" }],
              })}>Add a value to report</Button>
            </div>
          </div>
        </div>
        <HelpPanel />
      </div>
    </Modal>
  );
}
