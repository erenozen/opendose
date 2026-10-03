// User-defined transform: X and Y formula fields with live validation
// (engine formula_transform, mode "validate"), constants, examples and a
// searchable function reference built from the engine's own list.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { getEngine } from "../../lib/engine";
import { datasetLetter } from "../../project/table";
import type { DataTableModel } from "../../project/types";
import {
  FORMULA_BASICS, FORMULA_EXAMPLES, FUNCTION_DOCS, FUNCTION_GROUPS,
} from "./functions";
import type { NamedValue, TransformOptions } from "./run";

interface Problem { message: string; line: number | null; column: number | null }

let functionNames: Promise<string[]> | null = null;
function engineFunctions(): Promise<string[]> {
  if (!functionNames) {
    functionNames = getEngine().then((e) => {
      const r = e.analyze({ analysis: "formula_transform", data: {}, options: { mode: "functions" } }) as
        { functions?: string[] };
      return r.functions ?? Object.keys(FUNCTION_DOCS);
    }).catch(() => {
      functionNames = null;
      return Object.keys(FUNCTION_DOCS);
    });
  }
  return functionNames;
}

/** Validate one formula field; null while pending or when blank. */
function useValidation(formula: string, target: "X" | "Y", known: string[]): Problem[] | null {
  const [problems, setProblems] = useState<Problem[] | null>(null);
  const knownKey = known.join(",");
  useEffect(() => {
    if (!formula.trim()) { setProblems(null); return; }
    let live = true;
    const timer = setTimeout(async () => {
      const engine = await getEngine();
      const r = engine.analyze({
        analysis: "formula_transform", data: {},
        options: { mode: "validate", formula, target, known_names: knownKey.split(",") },
      }) as { ok?: boolean; errors?: Problem[]; error?: string };
      if (!live) return;
      if (r.error) setProblems([{ message: r.error, line: null, column: null }]);
      else setProblems(r.errors ?? []);
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [formula, target, knownKey]);
  return problems;
}

function FormulaField({ label, target, value, onChange, known, readOnly, onFocusField, placeholder }: {
  label: string;
  target: "X" | "Y";
  value: string;
  onChange: (v: string) => void;
  known: string[];
  readOnly: boolean;
  onFocusField: (el: HTMLTextAreaElement) => void;
  placeholder: string;
}) {
  const id = useId();
  const problems = useValidation(value, target, known);
  const bad = !!problems?.length;
  const lines = value.split("\n");
  return (
    <div className="formula-field">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} className="formula-input" rows={Math.min(6, Math.max(2, lines.length))}
        spellCheck={false} autoCapitalize="off" autoComplete="off"
        value={value} readOnly={readOnly} placeholder={placeholder}
        aria-invalid={bad}
        aria-describedby={`${id}-status`}
        onFocus={(e) => onFocusField(e.currentTarget)}
        onChange={(e) => onChange(e.target.value)} />
      <div id={`${id}-status`} className={`formula-status${bad ? " bad" : ""}`} aria-live="polite">
        {!value.trim() ? <span className="hint-block">Leave blank to keep {target} as it is.</span>
          : problems === null ? null
            : bad ? problems.map((p, i) => {
              const src = p.line ? lines[p.line - 1] ?? "" : lines.length === 1 ? lines[0] : "";
              return (
                <div key={i} className="formula-error">
                  <span>
                    {p.line ? `Line ${p.line}${p.column ? `, column ${p.column}` : ""}: ` : ""}
                    {p.message}
                  </span>
                  {p.column && src && (
                    <pre className="formula-caret" aria-hidden="true">
                      {src}{"\n"}{" ".repeat(Math.max(0, p.column - 1))}^
                    </pre>
                  )}
                </div>
              );
            }) : <span className="formula-ok">Formula is valid</span>}
      </div>
    </div>
  );
}

export function FormulaEditor({ table, options, set, readOnly }: {
  table: DataTableModel;
  options: TransformOptions;
  set: (patch: Partial<TransformOptions>) => void;
  readOnly: boolean;
}) {
  const isXY = table.type === "xy";
  const lastField = useRef<HTMLTextAreaElement | null>(null);
  const known = useMemo(() => {
    const names = ["X", "Y", ...table.datasets.map((_, i) => datasetLetter(i))];
    for (const c of options.constants) if (c.name.trim()) names.push(c.name.trim().toUpperCase());
    return names;
  }, [table.datasets, options.constants]);

  const setConst = (i: number, patch: Partial<NamedValue>) => set({
    constants: options.constants.map((c, j) => (j === i ? { ...c, ...patch } : c)),
  });
  const setPerDataset = (d: number, i: number, v: string) => {
    const grid = table.datasets.map((_, dd) => options.constants.map((c, ii) =>
      options.constantValues[dd]?.[ii] ?? c.value));
    grid[d][i] = v;
    set({ constantValues: grid });
  };

  const insert = (text: string) => {
    const el = lastField.current;
    const field: "xFormula" | "yFormula" = el?.dataset.field === "x" ? "xFormula" : "yFormula";
    const cur = options[field];
    const at = el && el.selectionStart !== null ? el.selectionStart : cur.length;
    const end = el && el.selectionEnd !== null ? el.selectionEnd : cur.length;
    set({ [field]: cur.slice(0, at) + text + cur.slice(end) });
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(at + text.length, at + text.length);
    });
  };

  return (
    <>
      <section>
        <h3>Formulas</h3>
        <p className="hint-block">
          Write <code>Y = …</code> using X, Y, other data sets (A, B, …) and
          constants. Several lines run in order; prefix a line with
          {" "}<code>&lt;B&gt;</code> to apply it to data set B only.
        </p>
        {isXY && (
          <FormulaField label="X formula" target="X" value={options.xFormula}
            placeholder="X = log(X)" known={known} readOnly={readOnly}
            onFocusField={(el) => { el.dataset.field = "x"; lastField.current = el; }}
            onChange={(v) => set({ xFormula: v })} />
        )}
        <FormulaField label="Y formula" target="Y" value={options.yFormula}
          placeholder="Y = Y*K" known={known} readOnly={readOnly}
          onFocusField={(el) => { el.dataset.field = "y"; lastField.current = el; }}
          onChange={(v) => set({ yFormula: v })} />
        <div className="formula-examples" role="group" aria-label="Examples">
          <span className="hint-block">Examples:</span>
          {FORMULA_EXAMPLES.filter((e) => isXY || !e.x).map((e) => (
            <button key={e.label} type="button" className="chip-btn" disabled={readOnly}
              title={[e.x, e.y].filter(Boolean).join("; ")}
              onClick={() => set({ ...(e.x !== undefined ? { xFormula: e.x } : {}),
                ...(e.y !== undefined ? { yFormula: e.y } : {}) })}>
              {e.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3>Constants</h3>
        <table className="const-table">
          <thead>
            <tr><th scope="col">Name</th><th scope="col">Value</th><th><span className="sr-only">Remove</span></th></tr>
          </thead>
          <tbody>
            {options.constants.map((c, i) => (
              <tr key={i}>
                <td>
                  <input value={c.name} aria-label={`Constant ${i + 1} name`} readOnly={readOnly}
                    className="const-name" onChange={(e) => setConst(i, { name: e.target.value })} />
                </td>
                <td>
                  <input value={c.value} inputMode="decimal" aria-label={`${c.name || `Constant ${i + 1}`} value`}
                    readOnly={readOnly} className="const-value"
                    onChange={(e) => setConst(i, { value: e.target.value })} />
                </td>
                <td>
                  <button type="button" className="icon-btn" disabled={readOnly}
                    aria-label={`Remove constant ${c.name || i + 1}`}
                    onClick={() => set({
                      constants: options.constants.filter((_, j) => j !== i),
                      constantValues: options.constantValues.map((row) => row.filter((_, j) => j !== i)),
                    })}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="chip-btn" disabled={readOnly}
          onClick={() => set({ constants: [...options.constants,
            { name: nextConstName(options.constants), value: "1" }] })}>
          + Add a constant
        </button>
        {options.constants.length > 0 && table.datasets.length > 1 && (
          <label className="check-row">
            <input type="checkbox" checked={options.constantsPerDataset} disabled={readOnly}
              onChange={(e) => set({ constantsPerDataset: e.target.checked })} />
            <span>A different value for each data set</span>
          </label>
        )}
        {options.constantsPerDataset && table.datasets.length > 1 && (
          <div className="const-grid-wrap">
            <table className="const-table">
              <thead>
                <tr>
                  <th scope="col">Data set</th>
                  {options.constants.map((c, i) => <th key={i} scope="col">{c.name || `#${i + 1}`}</th>)}
                </tr>
              </thead>
              <tbody>
                {table.datasets.map((d, di) => (
                  <tr key={di}>
                    <th scope="row">{datasetLetter(di)}: {d.name}</th>
                    {options.constants.map((c, i) => (
                      <td key={i}>
                        <input inputMode="decimal" className="const-value" readOnly={readOnly}
                          aria-label={`${c.name || `Constant ${i + 1}`} for ${d.name}`}
                          value={options.constantValues[di]?.[i] ?? c.value}
                          onChange={(e) => setPerDataset(di, i, e.target.value)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <label className="field field-num seed-field">
          <span>Random seed (for GAUSS and RND)</span>
          <input inputMode="numeric" value={options.seed} readOnly={readOnly}
            onChange={(e) => set({ seed: e.target.value })} />
        </label>
      </section>

      <FunctionReference onInsert={readOnly ? undefined : insert} />
    </>
  );
}

function nextConstName(list: NamedValue[]): string {
  const taken = new Set(list.map((c) => c.name.trim().toUpperCase()));
  for (const n of ["K", "K2", "K3", "C", "D", "M", "N"]) if (!taken.has(n)) return n;
  return `K${list.length + 1}`;
}

export function FunctionReference({ onInsert }: { onInsert?: (text: string) => void }) {
  const [names, setNames] = useState<string[] | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open || names) return;
    let live = true;
    engineFunctions().then((n) => { if (live) setNames(n); });
    return () => { live = false; };
  }, [open, names]);
  const query = q.trim().toLowerCase();
  const groups = useMemo(() => {
    const all = (names ?? []).map((n) => ({ name: n, doc: FUNCTION_DOCS[n] }));
    const hit = all.filter((f) => !query || f.name.toLowerCase().includes(query)
      || f.doc?.desc.toLowerCase().includes(query));
    const order = [...FUNCTION_GROUPS, "Other"];
    return order.map((g) => ({
      group: g, items: hit.filter((f) => (f.doc?.group ?? "Other") === g),
    })).filter((g) => g.items.length);
  }, [names, query]);

  return (
    <details className="advanced function-ref" open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>Function reference</summary>
      <section>
        <dl className="fn-basics">
          {FORMULA_BASICS.map((b) => (
            <div key={b.sig}><dt><code>{b.sig}</code></dt><dd>{b.desc}</dd></div>
          ))}
        </dl>
        <input type="search" className="fn-search" placeholder="Search functions"
          aria-label="Search functions" value={q} onChange={(e) => setQ(e.target.value)} />
        {!names ? <p className="hint-block">Loading the function list…</p>
          : !groups.length ? <p className="hint-block">No function matches “{q}”.</p>
            : groups.map((g) => (
              <div key={g.group} className="fn-group">
                <h4>{g.group}</h4>
                <ul className="fn-list">
                  {g.items.map((f) => (
                    <li key={f.name}>
                      {onInsert ? (
                        <button type="button" className="fn-insert"
                          title={`Insert ${f.name}( at the cursor`}
                          onClick={() => onInsert(`${f.name}(`)}>
                          <code>{f.doc?.sig ?? `${f.name}(…)`}</code>
                        </button>
                      ) : <code>{f.doc?.sig ?? `${f.name}(…)`}</code>}
                      {f.doc && <span className="fn-desc">{f.doc.desc}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
      </section>
    </details>
  );
}
