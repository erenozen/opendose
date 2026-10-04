// The step-by-step dialog every assay module opens: numbered steps along
// the top (any step can be revisited), the current step's form, and
// Back / Next / Finish. Presentational: the module owns the draft state.
import { useState, type ReactNode } from "react";
import Modal from "../../../components/Modal";
import "./assays.css";

export interface WizardStep {
  id: string;
  title: string;
  render: () => ReactNode;
  /** Why the user cannot go on yet (shown under the step), or null. */
  blocker?: string | null;
}

export default function Wizard({ title, steps, start = 0, finishLabel = "Finish",
  onClose, onFinish }: {
  title: string;
  steps: WizardStep[];
  start?: number;
  finishLabel?: string;
  onClose: () => void;
  onFinish: () => void;
}) {
  const [at, setAt] = useState(Math.min(Math.max(0, start), steps.length - 1));
  const step = steps[at];
  const last = at === steps.length - 1;
  const blocked = !!step.blocker;
  const next = () => {
    if (blocked) return;
    if (last) onFinish();
    else setAt(at + 1);
  };
  return (
    <Modal title={title} className="modal-wide assay-wizard" onClose={onClose} onSubmit={next}
      actions={
        <>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" disabled={at === 0} onClick={() => setAt(at - 1)}>Back</button>
          <button type="submit" className="btn-primary" disabled={blocked}>
            {last ? finishLabel : "Next"}
          </button>
        </>
      }>
      <ol className="wizard-steps" aria-label="Steps">
        {steps.map((s, i) => (
          <li key={s.id}>
            <button type="button" aria-current={i === at ? "step" : undefined}
              className={i === at ? "current" : i < at ? "done" : ""}
              disabled={i > at && steps.slice(at, i).some((x) => !!x.blocker)}
              onClick={() => setAt(i)}>
              <span className="wizard-step-n" aria-hidden="true">{i + 1}</span>
              {s.title}
            </button>
          </li>
        ))}
      </ol>
      <div className="wizard-body" key={step.id}>
        {step.render()}
      </div>
      {step.blocker && <p className="wizard-blocker" role="status">{step.blocker}</p>}
    </Modal>
  );
}
