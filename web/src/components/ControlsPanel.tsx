import type {
  CIMethod, ConstraintState, ErrorBarKind, ModelId, OptionsState,
  WeightingKind,
} from "../types";
import {
  ERROR_BAR_LABELS, MODEL_FAMILIES, MODELS_META, WEIGHTING_LABELS,
} from "../types";

interface Props {
  options: OptionsState;
  onChange: (o: OptionsState) => void;
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
        disabled={!state.enabled}
        value={state.value}
        onChange={(e) => onChange({ ...state, value: e.target.value })}
      />
    </label>
  );
}

export default function ControlsPanel({ options, onChange }: Props) {
  const set = (patch: Partial<OptionsState>) => onChange({ ...options, ...patch });
  const meta = MODELS_META[options.model];
  const norm = options.normalize;
  const setNorm = (patch: Partial<typeof norm>) =>
    set({ normalize: { ...norm, ...patch } });

  return (
    <div className="controls">
      <section>
        <h3>Model</h3>
        <select
          aria-label="Model"
          value={options.model}
          onChange={(e) => set({ model: e.target.value as ModelId })}
        >
          {MODEL_FAMILIES.map((family) => (
            <optgroup key={family} label={family}>
              {(Object.keys(MODELS_META) as ModelId[])
                .filter((m) => MODELS_META[m].family === family)
                .map((m) => (
                  <option key={m} value={m}>{MODELS_META[m].label}</option>
                ))}
            </optgroup>
          ))}
        </select>
        {meta.needsLogX && (
          <label className="check-row">
            <input
              type="checkbox"
              checked={options.xIsLog}
              onChange={(e) => set({ xIsLog: e.target.checked })}
            />
            <span>X values are already log10(concentration)</span>
          </label>
        )}
      </section>

      {meta.constrainable.includes("Top") && (
        <section>
          <h3>Constrain (hold constant)</h3>
          <ConstraintRow label="Top" state={options.top}
            onChange={(top) => set({ top })} />
          <ConstraintRow label="Bottom" state={options.bottom}
            onChange={(bottom) => set({ bottom })} />
          {meta.constrainable.includes("HillSlope") && (
            <ConstraintRow label="HillSlope" state={options.hillSlope}
              onChange={(hillSlope) => set({ hillSlope })} />
          )}
        </section>
      )}

      {meta.constants && (
        <section>
          <h3>Experimental constants</h3>
          {meta.constants.map((c) => (
            <label key={c} className="check-row">
              <span>{c === "HotNM" ? "Hot ligand (nM)"
                : c === "HotKdNM" ? "Hot ligand Kd (nM)" : c}</span>
              <input className="constraint-value" inputMode="decimal"
                value={options.modelConstants[c] ?? ""}
                placeholder="required"
                onChange={(e) => set({
                  modelConstants: {
                    ...options.modelConstants, [c]: e.target.value },
                })} />
            </label>
          ))}
        </section>
      )}

      {options.model === "ec50_shift" && (
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

      {options.model !== "ec50_shift" && (
      <section>
        <h3>Global fit (share across datasets)</h3>
        <div className="shared-params">
          {meta.constrainable.map((p) => (
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
