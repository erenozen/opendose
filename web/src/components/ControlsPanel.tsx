import { useState, useSyncExternalStore } from "react";
import type {
  CIMethod, ConstraintState, ErrorBarKind, OptionsState,
  WeightingKind,
} from "../types";
import { ERROR_BAR_LABELS, WEIGHTING_LABELS } from "../types";
import {
  CONSTANT_LABELS, modelLibraryVersion, modelMeta, shareableParams,
  subscribeModelLibrary, USER_MODEL_ID,
} from "../lib/modelLibrary";
import {
  columnConstants, freeParameters, newEquation, requiredConstants, sharedParameters,
  type UserEquationDef,
} from "../lib/userEquation";
import { constraintState, numberInTitle, withConstraint } from "../sheets/xy/fitOptions";
import EquationEditor from "./EquationEditor";
import ModelPicker from "./ModelPicker";

interface Props {
  options: OptionsState;
  onChange: (o: OptionsState) => void;
  /** Data set names (for data-set constants such as [antagonist]). */
  datasetNames?: string[];
  readOnly?: boolean;
}

function ConstraintRow({ label, state, onChange }: {
  label: string;
  state: ConstraintState;
  onChange: (c: ConstraintState) => void;
}) {
  return (
    <label className="constraint-row">
      <input
        type="checkbox"
        checked={state.enabled}
        onChange={(e) => onChange({ ...state, enabled: e.target.checked })}
      />
      <span>{label} = constant</span>
      <input
        className="constraint-value"
        inputMode="decimal"
        aria-label={`${label} constant value`}
        disabled={!state.enabled}
        value={state.value}
        onChange={(e) => onChange({ ...state, value: e.target.value })}
      />
    </label>
  );
}

/** Parameters of a user equation, from its rules (every parameter gets a
 *  rule when the editor applies it). */
function userParams(def: UserEquationDef | null | undefined): string[] {
  return def ? Object.keys(def.rules) : [];
}

export default function ControlsPanel({ options, onChange, datasetNames = [], readOnly }: Props) {
  useSyncExternalStore(subscribeModelLibrary, modelLibraryVersion);
  const [editing, setEditing] = useState<UserEquationDef | null>(null);
  const set = (patch: Partial<OptionsState>) => onChange({ ...options, ...patch });
  const isUser = options.model === USER_MODEL_ID;
  const ueq = isUser ? options.userEquation ?? null : null;
  const meta = modelMeta(options.model);
  const norm = options.normalize;
  const setNorm = (patch: Partial<typeof norm>) =>
    set({ normalize: { ...norm, ...patch } });

  const pickModel = (id: string) => {
    const m = modelMeta(id);
    const ok = new Set(shareableParams(m));
    set({
      model: id,
      sharedParams: m.globalOnly ? [...(m.shared ?? [])]
        : options.sharedParams.filter((p) => ok.has(p)),
    });
  };
  const applyEquation = (def: UserEquationDef) => {
    set({ model: USER_MODEL_ID, userEquation: def, sharedParams: [] });
    setEditing(null);
  };

  // What this model / equation needs from the user.
  const needsLogX = isUser ? !!ueq?.xIsLog : meta.needsLogX;
  const ps = userParams(ueq);
  const constrainable = isUser && ueq ? freeParameters(ueq, ps)
    .filter((p) => !sharedParameters(ueq, ps).includes(p)) : meta.constrainable;
  const fixedDefaults = isUser ? {} : meta.fixedByDefault ?? {};
  const constants = isUser && ueq ? requiredConstants(ueq, ps) : meta.constants ?? [];
  const perDataset = isUser && ueq ? columnConstants(ueq, ps) : meta.datasetConstants ?? [];
  const shareable = isUser ? [] : shareableParams(meta);
  const classic = meta.special === "gaddum_schild_classic" && !isUser;

  return (
    <div className="controls">
      <section>
        <h3>Model</h3>
        <ModelPicker value={options.model} userEquation={ueq} readOnly={readOnly}
          onPickModel={pickModel}
          onPickEquation={(def) => applyEquation(def)}
          onNewEquation={() => setEditing(newEquation())}
          onEditEquation={() => setEditing(ueq ?? newEquation())} />
        {needsLogX && (
          <label className="check-row">
            <input
              type="checkbox"
              checked={options.xIsLog}
              onChange={(e) => set({ xIsLog: e.target.checked })}
            />
            <span>X values are already log10(concentration)</span>
          </label>
        )}
        {isUser && ueq && sharedParameters(ueq, ps).length > 0 && (
          <p className="hint-block">
            Shared by all data sets (global fit): {sharedParameters(ueq, ps).join(", ")}.
          </p>
        )}
        {!isUser && meta.globalOnly && (
          <p className="hint-block">
            This model is fitted to all data sets at once; choose what they
            share under Advanced → Global fit.
          </p>
        )}
      </section>

      {constrainable.length > 0 && !classic && (
        <section>
          <h3>Constrain (hold constant)</h3>
          {constrainable.map((p) => (
            <ConstraintRow key={p} label={p} state={constraintState(options, p)}
              onChange={(c) => onChange(withConstraint(options, p, c))} />
          ))}
          {Object.entries(fixedDefaults).map(([p, v]) => (
            <p key={p} className="hint-block">{p} is fixed at {v} by this model.</p>
          ))}
        </section>
      )}
      {classic && (
        <section>
          <h3>Constrain (hold constant)</h3>
          {(["Top", "Bottom", "HillSlope"] as const).map((p) => (
            <ConstraintRow key={p} label={p} state={constraintState(options, p)}
              onChange={(c) => onChange(withConstraint(options, p, c))} />
          ))}
        </section>
      )}

      {constants.length > 0 && (
        <section>
          <h3>Experimental constants</h3>
          {constants.map((c) => (
            <label key={c} className="check-row">
              <span>{CONSTANT_LABELS[c] ?? c}</span>
              <input className="constraint-value" inputMode="decimal"
                value={options.modelConstants[c] ?? ""}
                placeholder="required"
                aria-label={CONSTANT_LABELS[c] ?? c}
                onChange={(e) => set({
                  modelConstants: {
                    ...options.modelConstants, [c]: e.target.value },
                })} />
            </label>
          ))}
        </section>
      )}

      {perDataset.length > 0 && (
        <section>
          <h3>Data set constants</h3>
          <p className="hint-block">
            One value per data set. Blank cells use the number in the data
            set&apos;s title.
          </p>
          {perDataset.map((p) => datasetNames.map((name, i) => {
            const typed = options.datasetConstants?.[p]?.[i] ?? "";
            const fromTitle = numberInTitle(name);
            return (
              <label key={`${p}-${i}`} className="check-row">
                <span>{p} for {name || `data set ${i + 1}`}</span>
                <input className="constraint-value" inputMode="decimal" value={typed}
                  aria-label={`${p} for ${name || `data set ${i + 1}`}`}
                  placeholder={fromTitle !== null ? String(fromTitle) : "required"}
                  onChange={(e) => {
                    const row = datasetNames.map((_, j) => options.datasetConstants?.[p]?.[j] ?? "");
                    row[i] = e.target.value;
                    set({ datasetConstants: { ...(options.datasetConstants ?? {}), [p]: row } });
                  }} />
              </label>
            );
          }))}
        </section>
      )}

      {classic && (
        <section>
          <h3>Antagonist concentrations</h3>
          <p className="hint-block">
            One per dataset (linear units, 0 for the control curve),
            comma-separated. All curve parameters are shared globally.
          </p>
          <input className="antagonist-input" inputMode="decimal"
            placeholder="e.g. 0, 1e-7, 1e-6, 1e-5"
            value={options.antagonist}
            onChange={(e) => set({ antagonist: e.target.value })} />
          <label className="check-row">
            <input type="checkbox" checked={options.schildSlopeUnity}
              onChange={(e) => set({ schildSlopeUnity: e.target.checked })} />
            <span>Constrain SchildSlope = 1.0 (competitive antagonist)</span>
          </label>
        </section>
      )}

      {editing && (
        <EquationEditor initial={editing} onClose={() => setEditing(null)}
          onApply={applyEquation} />
      )}

      <section>
        <h3>Error bars</h3>
        <select
          aria-label="Error bar type"
          value={options.errorBars}
          onChange={(e) => set({ errorBars: e.target.value as ErrorBarKind })}
        >
          {(Object.keys(ERROR_BAR_LABELS) as ErrorBarKind[]).map((k) => (
            <option key={k} value={k}>{ERROR_BAR_LABELS[k]}</option>
          ))}
        </select>
      </section>

      <details className="advanced">
        <summary>
          Advanced: weighting, outliers, bands, global fit, normalize
        </summary>
      <section>
        <h3>Fitting method</h3>
        <label className="check-row">
          <span>Weighting</span>
          <select value={options.weighting}
            onChange={(e) => set({ weighting: e.target.value as WeightingKind })}>
            {(Object.keys(WEIGHTING_LABELS) as WeightingKind[]).map((w) => (
              <option key={w} value={w}>{WEIGHTING_LABELS[w]}</option>
            ))}
          </select>
        </label>
        <label className="check-row">
          <span>Confidence intervals</span>
          <select value={options.ciMethod}
            onChange={(e) => set({ ciMethod: e.target.value as CIMethod })}>
            <option value="asymptotic">Asymptotic (approximate)</option>
            <option value="profile">Profile likelihood (asymmetrical, slower)</option>
          </select>
        </label>
        <label className="check-row">
          <input type="checkbox" checked={options.routEnabled}
            onChange={(e) => set({ routEnabled: e.target.checked })} />
          <span>Detect and eliminate outliers (ROUT), Q =</span>
          <input className="constraint-value" inputMode="decimal"
            disabled={!options.routEnabled}
            value={options.routQ}
            onChange={(e) => set({ routQ: e.target.value })} />
          <span>%</span>
        </label>
        <label className="check-row">
          <span>Bands</span>
          <select value={options.bands}
            onChange={(e) => set({
              bands: e.target.value as OptionsState["bands"] })}>
            <option value="none">No bands</option>
            <option value="confidence">95% confidence band</option>
            <option value="prediction">95% prediction band</option>
          </select>
        </label>
        <label className="check-row">
          <input type="checkbox" checked={options.diagnostics}
            onChange={(e) => set({ diagnostics: e.target.checked })} />
          <span>Diagnostics (replicates test, runs test, residual normality)</span>
        </label>
      </section>

      {shareable.length > 0 && !classic && (
      <section>
        <h3>Global fit (share across datasets)</h3>
        <div className="shared-params">
          {shareable.map((p) => (
            <label key={p} className="check-row">
              <input type="checkbox"
                checked={options.sharedParams.includes(p)}
                onChange={(e) => set({
                  sharedParams: e.target.checked
                    ? [...options.sharedParams, p]
                    : options.sharedParams.filter((s) => s !== p),
                })} />
              <span>{p}</span>
            </label>
          ))}
        </div>
      </section>
      )}

      <section>
        <h3>Interpolate unknowns from the curve</h3>
        <textarea
          className="interp-input"
          rows={2}
          placeholder="Y values, comma or newline separated"
          value={options.interpolateY}
          onChange={(e) => set({ interpolateY: e.target.value })}
        />
      </section>

      <section>
        <h3>Normalize</h3>
        <label className="check-row">
          <input
            type="checkbox"
            checked={norm.enabled}
            onChange={(e) => setNorm({ enabled: e.target.checked })}
          />
          <span>Normalize before fitting</span>
        </label>
        {norm.enabled && (
          <div className="normalize-options">
            <label>
              0% is
              <select value={norm.zeroMode}
                onChange={(e) => setNorm({ zeroMode: e.target.value as typeof norm.zeroMode })}>
                <option value="smallest">smallest value in each dataset</option>
                <option value="first">value in first row</option>
                <option value="value">this value:</option>
              </select>
              {norm.zeroMode === "value" && (
                <input className="constraint-value" inputMode="decimal"
                  value={norm.zeroValue}
                  onChange={(e) => setNorm({ zeroValue: e.target.value })} />
              )}
            </label>
            <label>
              100% is
              <select value={norm.hundredMode}
                onChange={(e) => setNorm({ hundredMode: e.target.value as typeof norm.hundredMode })}>
                <option value="largest">largest value in each dataset</option>
                <option value="last">value in last row</option>
                <option value="sum">sum of all values</option>
                <option value="value">this value:</option>
              </select>
              {norm.hundredMode === "value" && (
                <input className="constraint-value" inputMode="decimal"
                  value={norm.hundredValue}
                  onChange={(e) => setNorm({ hundredValue: e.target.value })} />
              )}
            </label>
            <label>
              Results as
              <select value={norm.asPercent ? "percent" : "fraction"}
                onChange={(e) => setNorm({ asPercent: e.target.value === "percent" })}>
                <option value="percent">percentages</option>
                <option value="fraction">fractions</option>
              </select>
            </label>
            <label>
              Subcolumns
              <select value={norm.subcolumns}
                onChange={(e) => setNorm({ subcolumns: e.target.value as typeof norm.subcolumns })}>
                <option value="mean">scale from row means</option>
                <option value="separate">normalize each separately</option>
              </select>
            </label>
          </div>
        )}
      </section>
      </details>
    </div>
  );
}
