// Parameter panel of Smooth, differentiate or integrate (P-103). The
// results view is the shared manipulation one; logic in ./curveOps.ts.
import { NumberField } from "../../components/ui";
import type { ControlsProps } from "../types";
import { CURVE_OP_LABELS, curveOpsProblems, type CurveOp, type CurveOpsOptions } from "./curveOps";

export function CurveOpsControls({ sheet, options: o, onChange, readOnly }: ControlsProps<CurveOpsOptions>) {
  const set = (p: Partial<CurveOpsOptions>) => onChange({ ...o, ...p });
  const problems = curveOpsProblems(o);
  return (
    <div className="controls manip-controls">
      <section>
        <h3>Operation</h3>
        <fieldset className="field-radios">
          <legend className="sr-only">Operation</legend>
          {(Object.keys(CURVE_OP_LABELS) as CurveOp[]).map((op) => (
            <label key={op}>
              <input type="radio" name={`curve-op-${sheet.id}`} checked={o.op === op} disabled={readOnly}
                onChange={() => set({ op })} />
              <span>{CURVE_OP_LABELS[op]}</span>
            </label>
          ))}
        </fieldset>
        <p className="hint-block">
          On the mean of each row&apos;s replicates, in increasing X. The output is a linked XY table with
          one value per row, so it can be graphed or analyzed like any other.
        </p>
      </section>
      {o.op === "smooth" && (
        <section>
          <h3>Smoothing</h3>
          <div className="field-pair">
            <NumberField label="Neighbours on each side" min={1} max={50} integer step={1}
              value={o.neighbours} readOnly={readOnly} error={problems.neighbours} fieldClassName="field-num"
              onValueChange={(neighbours) => set({ neighbours })} />
            <NumberField label="Polynomial order" min={0} integer step={1} value={o.order}
              readOnly={readOnly} error={problems.order} fieldClassName="field-num"
              onValueChange={(order) => set({ order })} />
          </div>
          <p className="hint-block">
            Order 0 is a moving average; 2 or 4 keeps peaks taller. The X values should be equally spaced.
          </p>
        </section>
      )}
    </div>
  );
}
